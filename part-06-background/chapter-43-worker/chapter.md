# 第 43 章　为什么需要独立 Worker

[第 42 章](../chapter-42-outbox/chapter.md)结束时，可以把 API 关掉，再从另一个终端寄出已经登记的邮件。现在把操作顺序反过来：寄信程序先启动，在空队列里查了一次就退出；十秒后用户才请求重置密码。数据库会保存这项工作，用户却要一直等到有人再敲一次命令。可靠地记住工作，只解决了一半问题。

本章从配套分支 `part-06/chapter-42` 继续。沿用 PostgreSQL、Mailpit、verification_intents、verification_outbox 和一次性函数 `sendOne`。要交付的变化很具体：把 API 和寄信程序各启动一次，以后每次获准签发的注册或重置意图都可以由正在运行的 Worker 接手；关掉 API，Worker 可以投递已经提交的工作；关掉 Worker，API 可以继续受理申请。最后让一封信正发送到一半时再关机，核对哪些承诺还能兑现。

阅读约 70～85 分钟，实现、迁移、双进程调试及联调另加 100～130 分钟，按本章代码与操作步骤估算。

## 43.1 谁来发现下一条待办

在已按第 42 章准备的独立 VERIFY 上，先不启寄信程序。打开 DBeaver，在这个库的 SQL 编辑器里查 `SELECT current_database()`，再查 `SELECT status, count(*) FROM public.verification_outbox GROUP BY status`。上章的 accepted、obsolete、unknown、attempting 都可能还在；接下来要启动的程序只选择已到 available_at 的 pending，但它会处理**目标库的所有符合条件的行**。计数为 2 还无法判断排队的是谁的信。此时库还是第 42 章结构，先单独执行配套 `database/chapter-43/01-observe.sql` 中按 available_at、id 排序的查询，末尾的控制表查询留到升级后。按查询结果对照每条的 message_id、收件人和用途。只在全部到期待办都属于本地练习时继续。没有现成练习库时先按第 42.2 节完成独立空库或恢复副本的准备。本章会追加一张只有一行的通道控制表，旧邮件的状态与令牌摘要保留。

面对“十秒后才来的工作”，最简单的改动是在现有 API 里加一个计时器，定期调用 sendOne。对于只跑一个进程、可以容忍维护期间停发的小工具，这很经济。但上线新版 HTTP 接口需要重启进程，即使邮件适配器没变，也得决定如何中断发送。反过来，一封邮件的慢应答可能占住数据库连接以外的网络资源；投递侧异常退出时，用户依然需要登录、查素材和发起恢复。如果 HTTP 增加到三个实例，每个实例的定时器也会启动，这等于同时把寄信执行者增加到三个。一个模块内的布尔变量管不到另两个进程。

因此给寄信工作一个独立的 Node 入口。操作系统启动第二个进程，它有自己的堆、事件循环、定时器、连接池、日志和退出码。这里称它为 **Worker**。第 4 章的 worker_threads 用于把计算移出一条主线程；这次我们关心的是 HTTP 与投递可以分别启动、关闭和配置。邮件等待主要发生在网络上，增加一条计算线程不会替停掉的服务巡视数据库。

```text
Postman ── 请求注册 ──→ API 进程 ── 提交意图和 pending ──→ PostgreSQL
                                                               ↑
Mailpit ←── SMTP ───── Worker 进程 ── 查询、准备、写回 ────────────┘
```

API 与 Worker 可以使用同一份源文件；一个进程里已经创建的 Prisma 客户端、SMTP 对象或 Promise 不能传给另一个进程。假如在 API 里发一个普通 EventEmitter 事件，它的监听函数也只在本进程里。第 42 章已经付出了写一行 Outbox 的成本，接下来就让 Worker 通过这一行发现工作。此时没必要再引入消息代理。对低频、允许较长等待的作业，操作系统定时启动一次性命令仍是另一条路；本章的密码恢复邮件有效期只有十五分钟，等待下一次调度会用掉其中的一部分。

## 43.2 用 Nest 建一个没有 HTTP 监听的应用

第 42 章的 `send-one.ts` 自己构造 DatabaseService，做完一次调用，在 finally 里关闭连接。持续运行同样可以写成普通 Node 程序。我们沿用 Nest，是为了让 Worker 的日志、连接池、投递适配器由同一个容器装配一次，并让原有数据库关闭钩子继续负责归还资源。若每轮循环都创建应用上下文，就会把启动检查与建池的开销变成每封邮件的成本；若直接加载 HTTP 的 AppModule，又会连带组装会话、控制器及其他业务依赖。

在配套项目根目录使用 Node 24.22.1；刚检出代码时先运行 `npm ci`。先做可以单独构建的一步。新增 `src/mail-worker.module.ts`。这里的“上下文”是一组已经创建、可按 token 取得的 provider，加上它们的初始化与销毁顺序。发送所需的三个对象由下面的小模块持有。HTTP 服务仍然使用它自己的模块。

```ts
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { z } from 'zod';
import { AppLogger } from './app-logger.js';
import { ConfigError, mailPortSchema } from './config.js';
import { parseDatabaseConfig } from './database-config.js';
import { DatabaseService } from './database.service.js';
import { LocalMailDelivery } from './verification-delivery.js';

const workerEnvironment = z.object({
  LOCAL_SMTP_PORT: mailPortSchema,
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

@Module({})
export class MailWorkerModule {
  static register(env: NodeJS.ProcessEnv): DynamicModule {
    const options = workerEnvironment.safeParse(env);
    if (!options.success) throw new ConfigError(String(options.error.issues[0]?.path[0]));
    const { LOG_LEVEL, LOCAL_SMTP_PORT } = options.data;
    const database = parseDatabaseConfig(env);
    return {
      module: MailWorkerModule,
      providers: [
        { provide: AppLogger, useValue: new AppLogger(LOG_LEVEL) },
        { provide: DatabaseService, inject: [AppLogger],
          useFactory: (logger: AppLogger) => new DatabaseService(database, logger, 'epp-worker') },
        { provide: LocalMailDelivery, useFactory: () => new LocalMailDelivery({ localSmtpPort: LOCAL_SMTP_PORT }) },
      ],
    };
  }
}
```

**先决定 A 的故障应当挡住谁。** 假设 A 的最后一个 SMTP 应答丢了，中继随即恢复。一分钟后，另一位用户申请注册，排进一封 B。A 已经离开 pending，继续领取 B 不会重寄 A。若希望其他账号照常收信，可以只隔离 A，另外观察中继是否持续异常。反过来，假如中继对每封信都吞掉最后的应答，继续发送会让 B、C 也变成需要人工核对的消息。

本章先选一条限制：同一个邮件通道最多容许一封结果待核。它适合能及时接手事故、希望控制待核数量的场景。代价也由 B 承担：夜里无人处置时，B 可能把十五分钟的验证期限全部耗在排队上。若产品更看重其他账号仍能找回密码，就应缩小暂停范围，并给共享故障另设停发条件。第 45 章会让同一个中继分别只拒绝 A、以及收完正文后丢应答，检验你会在哪一层停手。

要让这一选择在进程重启后仍有效，数据库里需留一条全通道共用的记录。控制表固定为一行：paused_by 为空，可以开始新尝试；有值，对应的消息正在发送或需要核对。名额在准备事务里占用，SQL 行锁不会跨过 SMTP 调用。

在 `prisma/migrations/20261109020000_verification_mail_control/migration.sql` 追加以下迁移，在 `prisma/schema.prisma` 末尾追加对应模型。第 42 章没有记录“某次故障要阻止后续邮件”，所以首次升级从空名额开始。已有 unknown 和 attempting 保留原值；升级前先停所有旧版 send-one 和寄信进程、核对遗留任务，避免旧发送者绕过新规则。

```sql
BEGIN;
CREATE TABLE public.verification_mail_control (
  id smallint PRIMARY KEY CHECK (id = 1),
  paused_by uuid
);
INSERT INTO public.verification_mail_control (id) VALUES (1);
COMMIT;
```

```prisma
model VerificationMailControl {
  id Int @id @db.SmallInt
  pausedBy String? @map("paused_by") @db.Uuid
  @@map("verification_mail_control")
}
```

修改 `src/verification-outbox.ts`。原准备事务中的第一条查询先锁住控制行，所有发送入口在同一把行锁上排序。发现暂停就从事务返回，尚未读取下一条 pending：

```ts
    const [channel] = await tx.$queryRaw<{ paused_by: string | null }[]>`
      SELECT paused_by FROM public.verification_mail_control WHERE id = 1 FOR UPDATE
    `;
    if (!channel) throw new Error('MAIL_CONTROL_MISSING');
    if (channel.paused_by) return 'paused' as const;
```

沿用第 42 章的代次和到期检查。更新 outbox 状态之后，在同一准备事务返回前加上这段；过期任务只作废，不占名额。

```ts
    if (window) {
      await tx.verificationMailControl.update({ where: { id: 1 }, data: { pausedBy: job.id } });
    }
```

事务外在判断 empty 之前增加 `if (prepared === 'paused') return 'paused';`。保留 obsolete 分支和 job、token、window 的解构，将后续发送和结果写回改为：

```ts
  try {
    await delivery.send(job.recipient, job.purpose, token, window.issued_at, window.expires_at);
  } catch {
    await database.client.verificationOutbox.update({ where: { id: job.id }, data: { status: 'unknown' } });
    return 'unknown';
  }
  await database.client.$transaction([
    database.client.verificationMailControl.updateMany({ where: { id: 1, pausedBy: job.id }, data: { pausedBy: null } }),
    database.client.verificationOutbox.update({ where: { id: job.id }, data: { status: 'accepted' } }),
  ]);
  return 'accepted';
```

若进程在准备提交后崩溃，名额仍指向 A。若 SMTP 已接受但数据库写回失败，清空名额与登记 accepted 同时回滚。另一启动实例可以读到这条线索，只会报告 paused。旧的一次性入口 `src/send-one.ts` 也调用同一函数，把 unknown 和 paused 都映射为退出码 2。若临时手动启动两个发送程序，其中一个看到另一个正在发送也会报告 paused。不要在已有进程尚在工作时释放它的名额。第 44 章再借助执行者身份和租约，区分通道正在被使用与需要核对的两种情况。

模块及启动探测还需要以下修改，一并完成后运行 `npm run check`。

- 在 `src/config.ts` 把现有的 SMTP 端口规则提取为 `export const mailPortSchema = decimal(65535).default(1025);`，原环境 schema 的 LOCAL_SMTP_PORT 和新模块都引用它。在 `src/verification-delivery.ts` 将构造参数收窄为 `Pick<AppConfig, 'localSmtpPort'>`。邮件仍只寄往本机回环 SMTP。Worker 没有 Cookie、游标或跨站请求，给它生产 API 的 HMAC 密钥没有用途。
- 在 `src/database.service.ts` 给构造器增加第三个参数 `private readonly applicationName: 'epp-api' | 'epp-worker' = 'epp-api'`，建池时设 `application_name: applicationName`。旧调用继承原名称。在 onModuleInit 的 `await this.client.$connect()` 后加入下面的探测。LIMIT 0 会让数据库解析列名，无需取一行邮件或加载用户凭据；这一步还能发现连上了缺少第 42 章迁移的库。
- 在 `src/app-logger.ts` 的 Event 类型中增加 worker.ready、worker.result、worker.draining、worker.closed 和 worker.failed 五个字符串。继续用原有的结构化字段，日志只带阶段、结果或错误码。收件人、连接串与邮件令牌都留在日志之外。

```ts
      if (this.applicationName === 'epp-worker') {
        await this.client.verificationMailControl.findUniqueOrThrow({ where: { id: 1 } });
        await this.client.$queryRaw`SELECT id, intent_id, generation, recipient, purpose, available_at, status
          FROM public.verification_outbox LIMIT 0`;
        await this.client.$queryRaw`SELECT id, email, purpose, token_digest, issued_at, expires_at, consumed_at
          FROM public.verification_intents LIMIT 0`;
        this.logger.write('info', 'database.ready');
        return;
      }
```

现在 Worker 模块可以编译，但还没有代码启动它。接下来新增 `src/mail-worker.ts`。先看循环中的顺序：取一次任务，等待它的数据库与 SMTP 路径结束，决定何时开始下一轮。若 `setInterval(async () => ..., 1000)` 碰上一封耗时三秒的信，计时器能在 Promise 未完成时再次调用函数，一份 Worker 就会有多个在途发送。串行 await 直接把本章的并发上限固定为一。只有查空时才等一秒，有积压时处理完一条就看下一条。

```ts
import 'reflect-metadata';
import { setTimeout as sleep } from 'node:timers/promises';
import { NestFactory } from '@nestjs/core';
import type { INestApplicationContext } from '@nestjs/common';
import { AppLogger } from './app-logger.js';
import { ConfigError } from './config.js';
import { DatabaseService } from './database.service.js';
import { MailWorkerModule } from './mail-worker.module.js';
import { LocalMailDelivery } from './verification-delivery.js';
import { sendOne } from './verification-outbox.js';

async function main() {
  const expected = process.argv[2];
  if (!expected || process.argv.length !== 3) throw new ConfigError('expected_database_argument');
  const stop = new AbortController();
  let context: INestApplicationContext | undefined;
  let logger = new AppLogger('info');
  let deadline: NodeJS.Timeout | undefined;
  function drain(signal: NodeJS.Signals) {
    if (stop.signal.aborted) return;
    logger.write('info', 'worker.draining', { signal });
    stop.abort();
    deadline = setTimeout(() => {
      logger.write('error', 'worker.failed', { code: 'DRAIN_TIMEOUT' });
      process.exit(1);
    }, 10000);
    deadline.unref();
  }
  process.on('SIGINT', drain);
  process.on('SIGTERM', drain);
  try {
    context = await NestFactory.createApplicationContext(MailWorkerModule.register(process.env),
      { logger: false, abortOnError: false });
    logger = context.get(AppLogger);
    const database = context.get(DatabaseService);
    const delivery = context.get(LocalMailDelivery);
    const [row] = await database.client.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (row?.name !== expected) throw new ConfigError('expected_database_argument');
    if (!stop.signal.aborted) logger.write('info', 'worker.ready');
    while (!stop.signal.aborted) {
      const status = await sendOne(database, delivery);
      if (status === 'empty') {
        try { await sleep(1000, undefined, { signal: stop.signal }); }
        catch (error) { if (!stop.signal.aborted) throw error; }
        continue;
      }
      const halted = status === 'unknown' || status === 'paused';
      logger.write(halted ? 'warn' : 'info', 'worker.result', { code: status });
      if (halted) {
        process.exitCode = 2;
        break;
      }
    }
  } finally {
    try {
      await context?.close();
      if (context) logger.write('info', 'worker.closed');
    } finally {
      clearTimeout(deadline);
      process.off('SIGINT', drain);
      process.off('SIGTERM', drain);
    }
  }
}
main().catch(error => {
  new AppLogger('error').write('error', 'worker.failed', {
    code: error instanceof ConfigError ? 'CONFIG_INVALID' : 'WORKER_FAILURE',
    field: error instanceof ConfigError ? error.field : undefined,
  });
  process.exitCode = 1;
});
```

`createApplicationContext` 返回时，数据库的初始化钩子已经执行。再用这份服务实际连接的数据库核对独立给出的预期库名，匹配后才可能进入循环。database.ready 只说明连接和所需列可用，worker.ready 才表示这个执行者准备处理此库。整个入口没有 listen，也没有邮件管理 HTTP 接口。Nest 的中间件、路由守卫和请求作用域都不在这条调用路径上，sendOne 在数据库里对代次、到期和消费状态的核对仍须保留。[Nest 独立应用上下文](https://docs.nestjs.com/standalone-applications)

循环里的两类等待需要不同的停法。查空后睡一秒只为减少空查询，接到 SIGINT 或 SIGTERM 时可立即唤醒。已经进入 sendOne 的一轮则可能刚把 attempting 提交，甚至已经把信交给 SMTP；把同一个取消信号传给所有步骤，会让进程在最需要记录结果时放弃写回。本章收到信号后停止开始下一轮，让在途的一轮走完，再调用 context.close()，由 DatabaseService 的销毁钩子释放本进程的池。信号回调开始运行时会安排一个十秒定时器，覆盖在途工作和资源释放。事件循环仍在推进而发送或关池长时间未结束时，定时器会让进程以 1 退出。若 JavaScript 被同步计算或调试器长时间阻塞，进程内定时器也要等它恢复；需要独立于该进程的最后期限时，应由外部托管器在宽限期后终止，随后按库中事实恢复。硬杀或断电也可能留下 attempting。

如果 sendOne 返回 unknown，本章单 Worker 选择退出 2。SMTP 服务不可用时，继续高速处理整批积压，可能把原本还能正常投递的 pending 都变成需要人工核对的 unknown。暂停会让其他收件人多等一会儿，这是用可用性换取较小的故障范围。若数据库查询或结果写回抛错，外层记录 worker.failed 并退出 1；应用既没有足够证据宣告成功，也不会自动把旧行改回 pending。退出码负责通知托管器；让下一封仍然待发的是数据库控制行。即使托管器立即重启，新进程也会读到 A 的 ID，返回 paused 并退出 2，B 仍是 pending。托管器仍可对退出码 2 停止反复拉起，避免无谓的启动和探库。第 45 章会针对错误种类和预算细分这些决定。

到此从根目录重新构建，再准备两个启动入口。`package.json` 的 scripts 增加：

```json
"dev:worker": "NODE_ENV=development node --env-file=.env.worker scripts/dev.mjs .worker-dev/src/mail-worker.js tsconfig.worker-dev.json",
"start:worker": "NODE_ENV=production node --enable-source-maps dist/src/mail-worker.js"
```

开发时两个 watcher 都可能在保存时发起编译。让 API 仍写 .dev，用 9229；Worker 写 .worker-dev，用 9230。新增 `tsconfig.worker-dev.json`，继承 ./tsconfig.json，设 `compilerOptions.outDir` 为 `./.worker-dev`，`include` 为 `["src/mail-worker.ts"]`，TypeScript 会沿 import 找到依赖。原 tsconfig.dev.json 的 exclude 增加 src/mail-worker.ts 与 src/mail-worker.module.ts，改动仅属于 Worker 的入口时，HTTP 进程可以继续处理请求。共享的 sendOne 依赖若也被另一入口引用，改动仍应触发对应编译。把 .worker-dev/ 加入 .gitignore，生产构建仍从 src 编译到 dist。

在 `scripts/dev.mjs` 读取 configFile 后，用配置选 Inspector，并将剩余参数传给真正的子进程。这样 `npm run dev:worker -- epp_ch43_verify` 的库名才能抵达 process.argv[2]：

```js
const worker = configFile === 'tsconfig.worker-dev.json';
const inspector = worker ? 9230 : 9229;
// restart 内，保留原先 stopServer 和编译诊断流程
const current = spawn(process.execPath, [`--inspect=127.0.0.1:${inspector}`, '--enable-source-maps', entry, ...process.argv.slice(4)], {
  stdio: 'inherit',
});
```

把原来复制 .dev/config/service.json 的两行放进 `if (!worker)`，Worker 不读 API 的配置资产。对应的资产监听设为 `worker ? undefined : ts.sys.watchFile(...)`，关闭时用 `assets?.close()`。在 .vscode/launch.json 复制原来的自动重连 Attach，将名称改为 EPP: attach to mail worker，端口改为 9230，outFiles 改为 `["${workspaceFolder}/.worker-dev/**/*.js"]`。若终端报告编译成功而子进程找不到入口，先检查 tsconfig 实际 outDir、spawn 的 entry 和调试器的 outFiles 是否指向同一份产物。生产 typecheck/build 通过本身无法验证两个开发输出目录互相独立。

## 43.3 用同一个账号分清受理、寄达与生效

准备一个名字明确的隔离库，例如从第 42 章练习库恢复的 epp_ch43_verify。从非空的第 42 章副本升级时，先保存具体旧任务 ID 和状态作对照。若沿用原 VERIFY 的名字，以下命令末尾也要逐处替换；请用你在恢复时选定的名字，勿从待核对的 URL 里抄取预期值。用 DBeaver 分别查看待办及旧记录。若有一封上章留下的 pending，可以用它演示接手；已过十五分钟会得到 obsolete，需对本轮虚构地址重新申请。

在项目根目录填好第 42 章的 .env.database-verify 和 .env.test，两份文件分别给 CLI 和测试使用。将配套 `database/chapter-43/worker.env.example` 复制为 `.env.worker`，在这个本地文件中设同库 DATABASE_URL、DB_POOL_MAX=2、LOCAL_SMTP_PORT=1025、LOG_LEVEL=info。实践中的 API 与 Worker 可用同一个练习角色，两个连接池仍然独立；两份权限相同的连接也不能让一方访问另一方的内存。对需要角色隔离的系统，Worker 所用 SQL 涉及验证意图、发件箱及其锁定和更新，还要对通道控制行执行 SELECT FOR UPDATE 和 UPDATE，应给专用角色验证这些权限。application_name 只为观察来源，不能充当数据库授权。

```bash
unset DATABASE_URL TEST_DATABASE_URL SHADOW_DATABASE_URL DB_QUERY_DEBUG
node --env-file=.env.database-verify --input-type=module -e '
const { withVerifiedDatabase } = await import("./scripts/verify-database.mjs");
await withVerifiedDatabase(process.argv[1]);' epp_ch43_verify
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy epp_ch43_verify
npm run db:verify -- migrate status
npm run check
```

在 DBeaver 按旧 ID 查回原状态，再查 `SELECT id, paused_by FROM public.verification_mail_control`，首次迁移应有一行 id=1、paused_by 为空。全新专用空库将上面的 deploy 换成 bootstrap，脚本先按原文件建立第 35 章基线，再部署完整迁移。遇到非空且无完整基线的库，先核对历史和备份。

保持第 36 章的 Mailpit 运行，SMTP 监听 127.0.0.1:1025，浏览器开 `http://127.0.0.1:8025`。先只启动 API：使用[第 42.3 节的 VERIFY 开发命令](../chapter-42-outbox/chapter.md#423-让冷却替换和入队共用一次提交)，末尾换成 epp_ch43_verify。本章配套 `database/chapter-43/README.md` 也给出了完整命令。Postman 导入 `requests/chapter-43.postman_collection.json`，核对 baseUrl 为 `http://127.0.0.1:3360`。沿用前章的 01～11，新增的 12 用同一 Cookie 查询当前身份并检查它仍属于本轮注册者。密码与邮件令牌只保存在不同步的本地环境，02 返回的 userId 由集合保存。

**先让一条工作等着。** 用一个本轮未注册过的虚构地址发 01，观察 202。在 DBeaver 从 `database/chapter-43/01-observe.sql` 运行按收件地址过滤的查询，把地址改成本轮的值；记下这条 pending 的 message_id。收件箱还没有本轮邮件。现在可以停止 API。在项目根目录新开终端，清除旧终端已导出的连接、池大小、日志与 SMTP 覆盖。若要核对库名保护，先把命令末尾的预期名换成故意不同的名字，保持 .env.worker 指向正确库。应出现 CONFIG_INVALID，原消息仍为 pending。Ctrl-C 结束这个 watcher，再用正确的预期名启动。

```bash
unset DATABASE_URL DB_POOL_MAX DB_QUERY_DEBUG LOCAL_SMTP_PORT LOG_LEVEL
npm run dev:worker -- epp_ch43_verify
```

观察 worker.ready、worker.result 的 code=accepted，回到 DBeaver 重查**相同的消息 ID**。Mailpit 应多一封发给本轮地址的注册信；同一进程在队列暂时变空后仍继续运行。若状态为 obsolete，先看申请时间、是否重发；若 ready 后长时间没有 result，先看是否已到 available_at，是否仍为 pending，以及 API、Worker 与 SQL 编辑器实际指向哪个库。开发终端显示“等待修改”时请先 Ctrl-C 关闭 watcher，修改 env 文件后重新运行命令。

一秒是**查空后的休息时间**。假设自己的消息前面有 30 封仍可领取的信，每封耗时两秒，单 Worker 可能要约一分钟才轮到这一封。遇到“已 ready，十秒还没信”，在 DBeaver 间隔几秒执行两次按 available_at、id 排序的查询。若排在前面的 ID 陆续消失，可按这些 ID 查它们的 status，区分正在消化积压、过期作废和发送失败。若始终是同一批 ID，再查 Worker 子进程是否仍在运行、是否已因 unknown 退出，以及两个进程使用的是否为同一实例上的同一库。

**把邮件与登录状态分开看。** 重启原 API，在 Mailpit 取本轮令牌，发 02 完成注册。04 用正确密码登录仍会因 Web 资格返回 403。在 VERIFY 按第 36 章 `02-grant-fixture.sql` 的顺序，把 UUID **和邮箱**都换成本轮的值，确认 RETURNING 一行再 COMMIT。发 05 登录，再发 12，看到 200 与本轮 userId。保留这份 Cookie。DBeaver 用下面的查询核对两个运行单元在这个库建立的连接：

```sql
SELECT application_name, state, count(*) AS connections
FROM pg_stat_activity
WHERE datname = current_database()
  AND application_name IN ('epp-api', 'epp-worker')
GROUP BY application_name, state
ORDER BY application_name, state;
```

连接池按需开连接，不会在启动时把上限全部占满。举例说，三个各配 DB_POOL_MAX=5 的 API 加一个上限为 2 的 Worker，应用侧配置最多允许 17 条连接；DBeaver、迁移 CLI 和其他服务还要另外算。这是容量预算，不能把一次查询中只有两条 idle 当成整体上限。idle 表示这条数据库连接暂时没有执行语句，Worker 此时可能正等 SMTP 或睡一秒。pg_stat_activity.pid 属于 PostgreSQL 服务进程，终端中 watcher 打印的 compiled worker PID 属于 Node；向二者发信号的后果不同。

在 Worker 终端 Ctrl-C，让 API、Postman、Mailpit 继续运行。发 **06 请求重置邮件**，此时应为 202，同地址 reset 用途有一条 pending。再次发 12，旧 Cookie **仍为 200**。重启一次 Worker，直到任务变为 accepted、收件箱出现密码恢复邮件，再发 12，**仍为 200**。保持 API 与 Worker 都在运行，此后再申请另一地址的邮件也应由已经运行的 Worker 接手，无需重启或手工运行 send-one。

![本机 Mailpit 中的恢复邮件主题与两封邮件计数](images/mailpit-recovery.jpg)

图 43-1　同一练习账号先完成注册投递，再由重启后的 Worker 投递重置邮件。这个收件箱只有本轮两封信，正文预览已裁去。收到恢复邮件时，账号的密码和旧会话仍可保持原状态。

用最新重置邮件令牌发 **07 确认密码重置**，204 之后才发 **08 用原 Cookie 读取身份**，现在为 401。发 10 用新密码登录，再发 12，回到同一个 userId。在 DBeaver 按地址查询时，o.status 属于这条消息，current_intent_state 属于对应意图行现在的状态。同一用途重发后，多条旧消息可能连到同一条当前意图；清理意图后，这一列显示 missing。即使看到 consumed，也不能单凭这一列认定某封旧邮件中的令牌曾被使用。

08 和 12 虽然都查询 GET /auth/me，保存的预期不同；08 检查已撤销，12 检查有效且归属正确。若出现 429，按 Retry-After 等待；不要为了复现流程重新建立账号。

客户端可以查询自己当前的身份，已经签发的邮件如何消费仍由确认事务判断。匿名的 202 只让页面提示“查收邮件”；用邮箱另开一个公开的任务查询接口会让外人区分哪些地址申请过恢复，甚至看到操作时间。运维在独立库里用 message_id 对账，是另一种权限。本章无需暴露收件地址、队列位置或服务器日志给匿名客户端。

## 43.4 在一封信发送到一半时关停

空队列里按 Ctrl-C，只能说明定时等待可以结束。要看真正的关闭次序，可以利用现有断点，把很短的“提交准备之后、SMTP 调用之前”停下来。在 VERIFY 停止 Worker，保留 API 与 Mailpit。先运行下面的查询，确认没有其他到期待办。用不同的新虚构地址分别发送 01，两次拉开一秒。再运行同一查询，应恰好看到本轮两条，按顺序记为 A、B。若混入其他地址，先停在这里，核对库与样本归属。

```sql
SELECT id AS message_id, recipient, purpose, available_at
FROM public.verification_outbox
WHERE status = 'pending' AND available_at <= clock_timestamp()
ORDER BY available_at, id;
```

若首次中断了十五分钟以上，旧信会在处理时过期作废。先让本轮已确认归属的过期任务走到 obsolete，再停 Worker，重新准备两条有效样本。

为免开发进程一启动就取走任务，在根目录使用刚构建的产物先停在入口：

```bash
unset DATABASE_URL DB_QUERY_DEBUG DB_POOL_MAX LOCAL_SMTP_PORT LOG_LEVEL
NODE_ENV=development node --env-file=.env.worker --enable-source-maps \
  --inspect-brk=127.0.0.1:9230 dist/src/mail-worker.js epp_ch43_verify
```

在 VS Code 复制原有的 dist Attach 配置（EPP: attach to npm run debug），把端口换成 9230，保留 `dist/**/*.js` 的源码映射；此轮进程来自 dist。附加后在 `src/verification-outbox.ts` 的 `await delivery.send(...)` 行设断点，再继续启动。暂停时在 Debug Console 只求值 `process.pid` 和 `job.id`，记下本次 Node PID 和消息 ID，不展开 token。DBeaver 查第一条应为 attempting，第二条应为 pending。这里不持数据库事务；若停在选行的 SQL 事务内部，暂停本身可能使交互事务超时。

另开终端，把下句末尾换成刚在 Debug Console 核对的本轮寄信进程 PID。队列查询中的数据库 PID 不能填在这里。

```bash
kill -TERM 本轮寄信进程PID
```

取消发送处断点，立即继续运行。调试器暂停 JavaScript 时，信号监听函数也需要等恢复执行，不能把人为暂停时长算作正常关闭耗时。观察 worker.draining、当前任务的 worker.result、database.closed 与 worker.closed；若 Node 提示正在等待调试器断开，再在 VS Code 结束 Attach。第一条如获得 SMTP 应答，应为 accepted，第二条仍是 pending。重新启动普通 Worker 后才应处理第二条。如果首条为 unknown，先核对 SMTP 和收件箱。若收到信号时下一轮已经开始，那个 sendOne 就属于在途工作，不能凭肉眼按键时刻断言它尚未开始。

一轮受控的 SMTP 对照把停机点放在建立连接、等待问候的位置：数据库已出现 attempting，给 Worker 发 SIGTERM，等日志出现 draining 后才让接收端继续应答。结果第一条写成 accepted、进程退出 0，第二条保持 pending。另一次关掉接收端后启动 Worker，sendOne 将该次尝试写成 unknown，子进程退出 2。此时只恢复 Mailpit 并重启 Worker，控制行仍会阻止新的发送。另一次让 Mailpit 正常收信，再用隔离库约束拒绝 accepted 写回：收件箱中已出现一封邮件，数据库仍保留 attempting 和原消息 ID，重启后下一条仍为 pending。这时重发第一封会产生重复邮件。

**亲自验证重启与恢复。** 先让前一组实验的 pending 处理完。确认无其他到期待办后，在独立 VERIFY 停 Worker、停 Mailpit，选两个新地址依次申请，记下 A、B 的消息 ID。启动 Worker：A 成为 unknown，退出 2。用相同配置连续重启两次，结果都应为 paused；每次若使用开发 watcher，先 Ctrl-C 结束上一轮 watcher 再启动。B 仍为 pending。此时即便用本章 send-one 指定 B 的 ID，也应得到 paused。API 仍可受理新申请。

先停止本通道全部发送者，关闭还在监听代码改动的开发 watcher，确认本轮 SMTP 已恢复，并按收件端事实核对 A。若控制行指向 attempting，先确认原发送进程确已结束；一个慢进程仍可能把信送出。打开配套 `database/chapter-43/02-resume.sql`，**先只运行 SELECT**，把返回的 blocking_message 和独立确认的库名填入 UPDATE，再单独执行。在 DBeaver 开启自动提交；若使用手动事务，检查返回一行后提交。返回零行表示库名或故障 ID 不匹配，或此次暂停已经解除，应重新读取现场。

```sql
UPDATE public.verification_mail_control
SET paused_by = NULL
WHERE id = 1 AND current_database() = 'epp_ch43_verify'
  AND paused_by = 'REPLACE_WITH_REVIEWED_MESSAGE_UUID'::uuid
RETURNING id;
```

放行只清除通道名额，A 的结果与令牌均保持原状。启动 Worker，若 B 仍在有效期内，应由同一消息 ID 寄到 Mailpit 并转为 accepted；若已过期会转为 obsolete。不要通过删除控制行、改写 A 的状态或重寄 A 来恢复 B。

**让回归用例识别跨进程停发。** 第 42 章的 `test/recovery.test.mjs` 在发送抛错后立即再次处理原消息，预期 empty。现在通道仍被 A 占用，入口会先返回 paused。为同一用例的第二条申请保留地址，按地址查出后继 B 的 ID。用测试发送对象使 A 得到 unknown，再处理 B，应得到 paused 且 B 仍为 pending。用 B 的 ID 尝试放行应更新零行，再次处理 B 仍为 paused；用 A 的 ID 才能更新一行，此后再处理原 A 应为 empty。

如果断言中途失败，残留的占用会让下一个用例也得到 paused。在 `fixture` 的 `t.after` 里先按本轮收件地址查出任务 ID，只清除 `pausedBy` 命中这些 ID 的占用，再删本轮发件箱行。并发处理同一条有效消息的用例仍应只记录一封被接受的邮件；另一调用在占用期间可能得到 paused，在占用清除后可能得到 empty。

从第 42 章原版测试继续时，把[第 43 章测试改动](recovery-43.patch)的原始文本保存为项目根目录的 `recovery-43.patch`，在项目根目录运行下句。本章配套测试已包含这些改动。若检查未通过，按补丁中的三个位置合并本地用例。

```bash
git apply --check recovery-43.patch && git apply recovery-43.patch
```

需要回归时，停两个应用和调试器，使用已部署第 43 章迁移、通道空闲的独立测试库。空库的固定虚构样本见[第 42.4 节](../chapter-42-outbox/chapter.md#424-让另一个进程寄出一封仍然有效的信)。核对 `.env.test` 中的 TEST_DATABASE_URL，运行 `unset TEST_DATABASE_URL` 再运行 `npm test`。如果发现已有占用，先按上面的故障恢复步骤核对，不让清理函数替其他任务解除暂停。

**交付和恢复。** 确认第 43 章迁移已部署，所有寄信入口均使用本章产物。用 `npm run check` 生成 dist，将它与 package.json、package-lock.json、.npmrc 复制到干净目录，执行 `npm ci --omit=dev`。API 沿用原生产环境与 `npm start`；Worker 的生产环境只需数据库、日志与 SMTP 配置，使用 `npm run start:worker -- 预期库名`。托管时直接以 `NODE_ENV=production node --enable-source-maps dist/src/mail-worker.js 预期库名` 为进程入口，让停止信号送达实际持有连接的进程。生产入口不加载 .env.worker，不开放 Inspector，也无需监听第二个 HTTP 端口。邮件仍只投本机 SMTP。

中途恢复先查当前库、消息 ID、status 和收件端事实。通道空闲时，pending 可以由下次启动接续；attempting 可能表示仍有活进程发送，也可能表示此前进程退出。数据库连接恰好 idle、进程列表少了一项，都不能证明接收端没有收过信。第 44 章将把问题换成两个执行者和一个迟到写回；第 45 章再区分可重试失败和结果未知。清理本次演示时关闭本轮 Worker、API、Mailpit，移除断点和 Postman 本地秘密。后续候选生成会遇到模型费用和供应商对账，本章的邮件停止策略只覆盖当前这条链。

## 本章支线

[43A　换成一份夜间报表，还需要常驻进程吗？](side-01-scheduling.md) 把即时寄信换成按业务日期补跑的任务，推导唤醒时机、吞吐与完成证据。另加阅读 10～14 分钟。

## 附录：本章必要技术点速查

| 名称 | 本章用法与判断 |
| --- | --- |
| NestFactory.createApplicationContext | 创建纯应用上下文，初始化 provider，无 HTTP listen；用 context.get 获取进程内实例。 |
| sendOne | 一次最多处理一条，await 结束才开始下一轮。empty 是一次查询的结果；unknown 留下通道占用，重启后 paused；核对故障 ID 再放行。 |
| AbortController 与 timers/promises | 在空队列等待时响应停止。已开始的发送沿原路径写回。 |
| SIGINT、SIGTERM、context.close() | 设置关停意图，等待在途轮次，再销毁上下文及池。进程内十秒定时器依赖事件循环，强制终止后仍需查库对账。 |
| application_name、pg_stat_activity | 区分两类数据库连接，观察连接数和当前状态。Node 与 PostgreSQL 的 PID 分属不同进程。 |
| dev:worker / start:worker | 开发入口读本地 .env.worker，监听 9230；生产从 dist 运行，由外部注入配置与预期库名。 |

关于关闭时的钩子可查 [Nest 生命周期](https://docs.nestjs.com/fundamentals/lifecycle-events)，信号处理可查 [Node.js 24 进程文档](https://nodejs.org/docs/latest-v24.x/api/process.html#signal-events)。本章完成代码对应 `part-06/chapter-43`。

[上一章：Transactional Outbox](../chapter-42-outbox/chapter.md) · [第六篇导读](../README.md)
