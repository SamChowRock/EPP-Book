# 支线 70C　列授权怎样改变应用访问数据库的方式

第 70 章要让通知进程能检查账号资格，却无权修改账号资料。直接照 SQL 动词划分权限会遇到一个矛盾，通知里的 SELECT 同时还要锁住用户行。先保留原事务的并发保证，再决定把哪种权限交给调用者。

从前置配套 `part-09/chapter-70` 的源码副本跟写，完成版为 `part-09/chapter-71`。以下使用第 70 章同一个练习库。70.2 才执行迁移和授权，这里先改代码；双会话验证在角色建好、通知已正常工作后进行。

## 一笔只读业务为什么会要 UPDATE

打开配套的 `src/notification-job.ts`。Worker 取任务时有 `FOR UPDATE SKIP LOCKED`，之后确实要改任务状态，给任务表有限的 UPDATE 说得通。到了 users，它只想读取 status，原查询却在行尾写了 `FOR SHARE`。设想它刚读到 active，另一个事务就把账号停用，然后它才投放通知。这个锁让两件事有明确先后；删掉锁会把早已处理过的并发问题带回来。可 PostgreSQL 对直接在表上使用锁定子句的调用者要求至少一列 UPDATE 权限。即使只授权它改一列，拿着这份密码的人也能真的去改那一列。[PostgreSQL 18 的 SELECT 与锁定子句](https://www.postgresql.org/docs/18/sql-select.html)

让表的所有者预先定义这一次带锁的读取，通知角色只读这个入口。新建迁移 `prisma/migrations/20261112010000_notification_recipient_lock/migration.sql`，内容只有：

```sql
CREATE VIEW public.notification_recipients AS
SELECT id, status FROM public.users FOR SHARE;
```

视图保存查询定义，里面没有另一份账号数据。使用默认的视图权限规则，调用者须有视图上的 SELECT，对底层关系的权限按视图所有者检查。让受信任、能对 users 加该锁的迁移所有者创建它，避免把视图交由运行账号拥有。在原事务里只替换读账号的语句，保留取任务、到期检查和完成写回。按 ID 查询将锁缩到这次的账号，事务结束才释放。[PostgreSQL 18 的视图权限](https://www.postgresql.org/docs/18/sql-createview.html)

```ts
const [user] = await tx.$queryRaw<{ status: string }[]>`SELECT status
  FROM public.notification_recipients WHERE id=${job.user_id}::uuid`;
```

在 `src/database.service.ts` 的 onModuleInit 中，找到专供 epp-notifications 的提前返回分支，在 database.ready 日志之前加一条探针：

```ts
await this.client.$queryRaw`SELECT id, status FROM public.notification_recipients LIMIT 0`;
```

这次读零行也会检查视图及权限，新消费者在空队列上同样能发现漏迁移。视图依然允许通知身份读取多个用户的状态并持锁，访问范围缩在两列和事务时长上。把 WHERE 条件删掉再在事务里遍历结果，会让无关账号也等锁，所以保留调用方按任务用户 ID 的筛选。

另一个容易漏掉的写入来自 ORM。去看 `src/recovery.service.ts` 的注册确认：即使代码里给新用户只填 id，原来的嵌套 create 发出的 INSERT 也列出了 status、web_enabled 等默认字段。只给 API 用户表的 `INSERT (id)` 时，这笔注册会返回 500。打开更多列就能消掉报错，却也允许注册入口的数据库身份自选新账号的初始资格。保留窄授权，把原来的 `tx.user.create(...)` 换成下列三行，放在**原有注册确认事务内部**，仍在消费令牌、插通知任务之前：

```ts
await tx.$executeRaw`INSERT INTO public.users (id) VALUES (${userId}::uuid)`;
await tx.passwordCredential.create({ data: { userId, passwordHash } });
await tx.verifiedEmail.create({ data: { userId, email: intent.email } });
```

这样由表的 DEFAULT 产生 active 和 web_enabled=false。中间任何一行失败，整个注册事务回滚；确认响应与原客户端兼容。API 更新资料时只会得到昵称、头像及各自可见性的列更新权，账号资格仍由原管理入口办理。

同样的区别也出现在排队时。若 API 可以在 INSERT 时指定消息初态，它就能新建一笔声称已经 accepted 的消息。让数据库给新消息和新任务填写 pending。仍在 recovery.service.ts，把请求验证事务中 `if (issued)` 内的 verificationOutbox.create 替换为：

```ts
await tx.$executeRaw`INSERT INTO public.verification_outbox
  (id, intent_id, generation, purpose, recipient)
  VALUES (${randomUUID()}::uuid, ${issued.id}::uuid, ${generation}, ${purpose}, ${email})`;
```

注册成功分支中的 notificationJob.create 换成下列 INSERT，重置成功分支用同样三列，把 userId 换成 observed.userId、kind 字面值换成 password-reset。两处都要留在原事务内。数据库完成时间与状态的默认赋值，API 只能指定这次工作是谁的、为什么做。

```ts
await tx.$executeRaw`INSERT INTO public.notification_jobs (id, user_id, kind)
  VALUES (${randomUUID()}::uuid, ${userId}::uuid, 'registered')`;
```

## 让寄一封信的工具也用邮件配置

通知进程选 `notifications` 分支时本就不会创建 SMTP 传输器。反倒是事故处理时经常用的 `src/send-one.ts`：旧程序先执行 API 的 loadConfig，生产模式下缺 APP_ORIGIN 或 CURSOR_HMAC_KEY 就退出。给单笔命令复制 API 配置，会把刚分开的秘密又合到一起。

在 `src/config.ts` 将现有 SMTP 两项的校验封成函数，并把现有 LOG_LEVEL 枚举提为共享常量；API 的 EnvironmentSchema 中写 `LOG_LEVEL: logLevelSchema`。保留原有端口范围、回环默认值以及 API 的生产校验。

```ts
export function parseMailEndpoint(env: NodeJS.ProcessEnv) {
  const host = mailHostSchema.safeParse(env.LOCAL_SMTP_HOST);
  if (!host.success) throw new ConfigError('LOCAL_SMTP_HOST');
  const port = mailPortSchema.safeParse(env.LOCAL_SMTP_PORT);
  if (!port.success) throw new ConfigError('LOCAL_SMTP_PORT');
  return { localSmtpHost: host.data, localSmtpPort: port.data };
}
export const logLevelSchema = z.enum(['debug', 'info', 'warn', 'error']).default('info');
```

在 `src/mail-worker.module.ts` 导入 ConfigError、logLevelSchema、parseMailEndpoint，移除原来的 workerEnvironment 和仅用来声明它的 z 导入。register 开头用 `const level = logLevelSchema.safeParse(env.LOG_LEVEL)`；失败时抛 `new ConfigError('LOG_LEVEL')`，AppLogger 使用 level.data。只在原来的 `if (!notifications)` 内求 `const endpoint = parseMailEndpoint(env)`，再将 LocalMailDelivery 的工厂改成 `() => new LocalMailDelivery(endpoint)`。通知身份依然无需通过邮件配置校验。

在 `src/send-one.ts` 用下列初始化替换 loadConfig 及数据库构造，将两个配置函数从 config.js 导入。原先调用 sendOne 时改传 `new LocalMailDelivery(endpoint)`；保留预期库名比对、可选消息 ID、原结果及退出码，保留 finally 里的数据库关闭。

```ts
const endpoint = parseMailEndpoint(process.env);
const database = new DatabaseService(
  parseDatabaseConfig(process.env),
  new AppLogger(logLevelSchema.parse(process.env.LOG_LEVEL)),
  'epp-worker',
);
```

## 用两个会话验证带锁视图

还有一件仅靠成功响应看不出来的事。用通知身份在会话 A 执行 `BEGIN`，再 `SELECT status FROM public.notification_recipients WHERE id='本次注册用户UUID'::uuid`，保持事务。用有更新权限的观察实验账号在另一会话 B 开始事务，执行 `SET LOCAL lock_timeout='1s'`，再执行 `UPDATE public.users SET status=status WHERE id='同一个UUID'::uuid`。B 应等锁超时（55P03），随后 ROLLBACK；A 也 ROLLBACK。若 B 能立即更新，请检查 ID 是否命中、A 是否已自动提交、视图定义是否保留 FOR SHARE。换一名无关用户应能取得其行锁。这样才知道通知失去改资料的权力后，停用账号与通知投放之间仍有原来的互斥关系。

## 速查

| 需要限制的能力 | 应用与数据库共同改变什么 |
| --- | --- |
| 通知锁住用户却无权更新资料 | 由可信所有者定义带锁视图，通知身份只取得视图读取权 |
| 注册入口无权决定初始资格 | INSERT 仅提交 id，其余列由数据库默认值产生 |
| API 无权把新任务标成已完成 | 入队只提交身份、归属和类型，状态使用默认值 |
| 单笔寄信工具拿到的秘密过多 | 单独读取邮件配置，保持错库检查及通道资格判断 |

阅读约 12～18 分钟，跟写与双会话验证另加 20～35 分钟。

[返回第 70 章构建与分配身份](chapter.md#701-从三笔工作推导各自的权限)
