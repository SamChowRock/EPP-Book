# 第 42 章　Transactional Outbox：业务和消息如何一起提交

同一个注册请求，第一次发送时 API 在提交后退出，第二次发送时客户端得到了 202。用户等了一分钟，收件箱仍是空的。第二次请求其实遵守了上一章的冷却规则；问题出在第一次请求已经登记了验证意图，却没给重启后的进程留下寄信指令。

从[第 36 章的注册与找回密码实现](../../part-05-identity/chapter-36-registration/chapter.md)继续，代码起点为密码路线。[第 36 章配套分支](https://github.com/SamChowRock/epp-public/tree/part-05/chapter-36)

读过[第 41 章的同步发送实验](../../part-05-identity/chapter-41-review/chapter.md#415-邮件请求返回以后谁接着做)即可接这里。我们要让用户在原来的页面填同一个邮箱，继续用原来的确认接口，却能在 API 已经关闭时用另一个进程寄出那封信。阅读约 60～75 分钟，跟做另加 85～115 分钟。

## 42.1 在旧请求中找出两次写入之间的空隙

先在第 36 章代码上操作。按该章的备份与恢复步骤，把练习库恢复到一个独立的 `epp_ch42_verify`，确认 DBeaver 的 SQL 编辑器连接这个副本。把这个库的连接分别填到迁移用的 `.env.database-verify`（DATABASE_URL）与测试用的 `.env.test`（TEST_DATABASE_URL）。按第 36.4 节的 VERIFY 入口启动旧 API，命令末尾的预期库名换成本轮副本；沿用 3360 端口。在 Postman 打开第 36 章集合，baseUrl 指向该进程，email 用本轮首次使用的虚构地址。仅停止自己的 Mailpit，确保旧 API 的 LOCAL_SMTP_PORT 指向这个已停止的监听端口。

发送 **01 请求注册邮件**。在响应 Headers 找到 X-Request-Id，用它找到 API 日志中同一次请求的 `delivery.failed`。DBeaver 执行下面的投影，地址换成本轮输入。记下用途、时间以及这一行的 ID；做升级时还要回来比较。此时没有为这个邮箱创建用户，用户和凭据会在确认邮件令牌的事务中创建。

```sql
SELECT current_database();
SELECT id, purpose, issued_at, expires_at, consumed_at IS NOT NULL AS consumed
FROM public.verification_intents
WHERE purpose = 'register' AND email = 'missed42@example.test';
```

恢复 Mailpit，保持邮箱与请求不变，在一分钟冷却内再发一次。两次都能看到 202，同一行的签发时间没变，收件箱仍没有这封信。若操作时已经跨过一分钟，第二次申请会替换摘要并尝试发送；根据签发时间判断自己实际走了哪条路径。有有效旧邮件的读者可以另外留一封未消费的注册信，稍后在有效期内直接用新版 API 确认，检验升级是否保留旧凭据。

沿 `src/recovery.service.ts` 看：第一个系统是 PostgreSQL，它已经提交了摘要和有效期；第二个系统是 SMTP，接收端有自己的接受时点。把调用改成不等待的 Promise，API 可以更早返回，进程一停，尚未执行的回调仍然消失。在事务里等待 SMTP 也有相反的漏洞：对端先收下信，随后本地提交失败，收件人拿到的令牌无法验证。即使接入消息队列，先提交再向队列发布也有相同的中断点。

我们能控制的是一次 PostgreSQL 提交。在业务行旁边加一行“请按本轮注册意图寄信”，让两行一起提交，任何一行写失败就一起回滚。外部调用挪到提交之后，由能读数据库的另一个进程执行。这张保存待办消息的表便是事务性发件箱（Transactional Outbox）。它解决的是**业务事实与寄信责任的交接**。在接收方接受邮件和本地记录成功之间，仍然隔着两个系统。[Transactional Outbox 模式](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html)

## 42.2 给每一轮寄信留下一行

结束旧 API 及写入副本的其他进程。先决定“一行”代表什么。第 36 章把同一用途和邮箱的当前验证状态放在一行；一分钟后重发会沿用 intent ID。若发件箱也以这个 ID 去重，第二轮合法申请将永远发不出。反过来，若每次 HTTP 调用都创建一行，双击按钮就能绕过冷却。这里一行对应一次**取得签发资格的申请**。同一次申请重复到达时，由现有冷却条件仲裁；新的签发即使复用意图行，也取得自己的消息 ID 和代次。

在自己的跟写分支上从第 36 章继续；使用完成快照对照时，代码用 `part-06/chapter-42`，数据库仍需单独迁移。

在配套项目新增 `prisma/migrations/20261109010000_verification_outbox/migration.sql`。表名限定了消息类型为验证邮件，purpose 再选择注册或重置模板。收件人、意图 ID 和签发代次构成结构化载荷。发送时需要执行条件比较，直接给这些字段建列，省去从一份任意 JSON 猜测字段含义。available_at 使用数据库的时间，表示最早可以尝试的时刻；邮件的最后有效时刻仍由意图表管理。

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
CREATE TABLE public.verification_outbox (
  id uuid PRIMARY KEY,
  intent_id uuid NOT NULL,
  generation text NOT NULL UNIQUE CHECK (generation ~ '^[0-9a-f]{64}$'),
  purpose text NOT NULL CHECK (purpose IN ('register', 'reset')),
  recipient text NOT NULL CHECK (recipient = lower(recipient) AND length(recipient) BETWEEN 3 AND 254),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'attempting', 'accepted', 'unknown', 'obsolete')),
  available_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX verification_outbox_ready_idx ON public.verification_outbox(status, available_at, id);
COMMIT;
```

这里特意保留独立消息 ID。即使过期意图按第 36 章的保留期清理了，仍可追查任务的结果。intent_id 因此是一次业务引用，表间没有级联删除；找不到原意图的待办必须作废。generation 先用一个临时随机令牌的摘要表示，临时原值立即丢弃。队列只需用它认出同一次申请，不能拿它到确认接口证明邮箱归属。稍后将看到，真正寄出的秘密可以延后生成。

在 `prisma/schema.prisma` 末尾追加对应模型。数据库的 CHECK 由上面的迁移维护。随后让 `src/database.service.ts` 的启动检查在读取 verificationIntent 后也读取一行 verificationOutbox；这样部署漏跑迁移会在启动阶段暴露。

```prisma
model VerificationOutbox {
  id String @id @db.Uuid
  intentId String @map("intent_id") @db.Uuid
  generation String @unique @db.Text
  purpose String @db.Text
  recipient String @db.Text
  status String @default("pending") @db.Text
  availableAt DateTime @default(now()) @map("available_at") @db.Timestamptz(3)
  @@index([status, availableAt, id], map: "verification_outbox_ready_idx")
  @@map("verification_outbox")
}
```

从项目根目录用 Node 24.22.1 执行：

```bash
npm ci
unset DATABASE_URL SHADOW_DATABASE_URL TEST_DATABASE_URL DB_QUERY_DEBUG
verify_db=epp_ch42_verify
node --env-file=.env.database-verify scripts/deploy-verify.mjs deploy "$verify_db"
npm run db:verify -- migrate status
npm run check
```

预期库名取自刚才创建副本时给它的名字。脚本在实际连接查询 current_database() 并检查已有迁移基线，名字不符就停止。Shell 已导出的变量会优先于 env 文件，所以新开终端也要清除外层覆盖。DBeaver 刷新 Tables，在同一个 SQL 编辑器再查 42.1 的旧行，签发、到期和消费状态应保持；`SELECT count(*) FROM public.verification_outbox` 在首次升级、尚无新版写入时为零。旧摘要不能还原原令牌，旧系统也未记录每封信是否被接收，迁移无法可靠判断应替谁补寄。

如果从独立**空库**开始，在 DBeaver 新建自己的练习数据库，将两个 env 文件指向它，重新设置 verify_db。把上一段命令的 `deploy` 换成 `bootstrap`，再查 status。脚本先按原文件部署第 35 章基线，再从完整目录追加注册和发件箱迁移。已经有前章数据的副本走 deploy；发现历史不完整时先查 migrate status 及第 20 章的恢复流程，保留现场。第 37～40 章平台路线的数据库各有额外历史，练本章请使用密码主线的副本。

到这里可以暂停。数据库只是多了一张空表，第 36 章 API 仍能在这个结构上按原方式工作。切换 API 之前要停止旧版本接新请求，否则旧实例仍会产生没有消息行的签发。日常库的升级应在非空副本核对后另做备份、恢复演练、停写与部署。

## 42.3 让冷却、替换和入队共用一次提交

修改 `src/recovery.service.ts` 的 request，保留原有的请求容量保护及 `state.track`，将计数器改名 activeRequests，表示两个并发签发名额。删除请求路径里的 delivery、logger 与 SMTP 调用。在 `src/auth.module.ts` 的工厂里仅注入 DatabaseService、SessionService 和 ApplicationState。确认注册、找回密码、单次消费和旧凭据版本判断沿用前章代码。

```ts
  request(purpose: RecoveryPurpose, email: string) {
    if (this.activeRequests >= 2) throw new HttpError(429, 'Delivery service is busy', 'DELIVERY_BUSY');
    this.activeRequests++;
    return this.state.track(async () => {
      const generation = tokenDigest(issueToken());
      await this.database.run('issueVerification', () => this.database.client.$transaction(async tx => {
        const contact = purpose === 'reset' ? await tx.verifiedEmail.findUnique({
          where: { email }, include: { user: { select: { passwordCredential: { select: { version: true } } } } },
        }) : null;
        const credential = contact?.user.passwordCredential;
        const userId = credential ? contact!.userId : null;
        const version = credential?.version ?? null;
        // One row per purpose/address gives resend cooldown and replacement the same atomic boundary.
        const [issued] = await tx.$queryRaw<{ id: string }[]>`
          INSERT INTO public.verification_intents
            (id, purpose, email, token_digest, user_id, credential_version, issued_at, expires_at)
          VALUES (${randomUUID()}::uuid, ${purpose}, ${email}, ${generation}, ${userId}::uuid, ${version},
            clock_timestamp(), clock_timestamp() + interval '15 minutes')
          ON CONFLICT (purpose, email) DO UPDATE SET token_digest = EXCLUDED.token_digest,
            user_id = EXCLUDED.user_id, credential_version = EXCLUDED.credential_version,
            issued_at = clock_timestamp(), expires_at = clock_timestamp() + interval '15 minutes', consumed_at = NULL
          WHERE verification_intents.issued_at <= clock_timestamp() - interval '1 minute'
          RETURNING id
        `;
        if (issued) {
          await tx.verificationOutbox.create({ data: {
            id: randomUUID(), intentId: issued.id, generation, purpose, recipient: email,
          } });
        }
      }, { maxWait: 2000, timeout: 5000 }));
      return accepted;
    }).finally(() => { this.activeRequests--; });
  }
```

这里最要紧的是 `RETURNING id` 的结果。对于已经存在的地址，PostgreSQL 在冲突行上判断一分钟是否已过；冷却期内没有更新，也没有返回行。两个请求即使同时读到页面上的“可以发送”，仍由写入端裁决。只有取得 issued 的事务用**同一个 tx** 创建消息。若将第二次写入改成 `this.database.client` 调用，两个提交又会分别成功或失败。若把异常吞掉返回 accepted，客户端则无法区分存储拒绝与业务受理。这也限定了“重复”的含义。若客户端丢掉第一次 202，等两分钟才原样重试，服务端会按产品规则开始新一轮。要把一天后携同一操作号的重试也识别为原操作，需像第 26 章那样持久记录调用身份、输入指纹与结果；按邮箱冷却只能合并窗口内的调用。

匿名入口继续隐藏账号是否存在；未知邮箱的重置申请也可入队，绑定为空的恢复意图始终不能用于重置后来注册的用户。

**启动并观察新版请求。** 第一次跟写到这里，先执行 `npm run check`。开发入口用现有的本机监听、源码自动编译和调试配置。在 `.env.test` 只放 VERIFY 的 TEST_DATABASE_URL；检查 Postman 集合的 baseUrl 与端口相同。

```bash
unset DATABASE_URL TEST_DATABASE_URL APP_ORIGIN PORT LOCAL_SMTP_PORT DB_QUERY_DEBUG
NODE_ENV=development node --env-file=.env.test --input-type=module -e '
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const { withVerifiedDatabase } = await import("./scripts/verify-database.mjs");
await withVerifiedDatabase(process.argv[1]);
process.env.PORT = "3360";
process.env.APP_ORIGIN = "http://127.0.0.1:3360";
process.env.DB_QUERY_DEBUG = "false";
await import("./scripts/dev.mjs");' epp_ch42_verify
```

可以用一次故意失败验证这个边界。在**隔离 VERIFY** 的 DBeaver 打开自动提交，临时增加只拒绝一个虚构地址的约束。先确认该地址此前没有意图。换回新版开发 API 后只对该地址发 01，观察存储错误与数据库结果，随即删除实验约束：

```sql
ALTER TABLE public.verification_outbox ADD CONSTRAINT reject_demo
  CHECK (recipient <> 'rollback42@example.test') NOT VALID;
-- 发一次请求后再执行。两项都应为零。
SELECT (SELECT count(*) FROM public.verification_intents WHERE email='rollback42@example.test') AS intents,
       (SELECT count(*) FROM public.verification_outbox WHERE recipient='rollback42@example.test') AS jobs;
ALTER TABLE public.verification_outbox DROP CONSTRAINT reject_demo;
```

NOT VALID 跳过对旧行的扫描，新插入仍受检查。分段执行，别在发请求前一次运行整段 SQL。即使此时结束练习，也先移除临时约束。重新用该地址请求，应能创建一份意图和一项任务。若还在运行旧 API，它会绕过这张表；这个反例也能帮助定位“迁移好了，怎么还是没有任务”。

保持 Mailpit 停止也可以继续。换新地址 reader42@example.test，用 01 连发两次，在 DBeaver 执行配套 `database/chapter-42/01-observe.sql`：

```sql
SELECT current_database();
-- Replace the fictional address. Omit token digests and mail contents.
SELECT i.purpose, i.email, i.issued_at, i.expires_at, i.consumed_at IS NOT NULL AS consumed,
       o.id AS message_id, o.available_at, o.status
FROM public.verification_intents i
LEFT JOIN public.verification_outbox o ON o.intent_id = i.id
WHERE i.email = 'reader42@example.test'
ORDER BY i.purpose, o.available_at, o.id;
```

两次 HTTP 返回相同的 202，查询只有一条 pending。记下 message_id。把 SQL 中的邮箱换回 42.1 的旧样本 missed42，应有意图、消息列为空，这是 LEFT JOIN 保留的那一行。多次签发时，这个查询会把当前意图关联到历次消息；i.issued_at 属于当前一轮，各消息看自己的 available_at 和 status。若意图已清理，可按记下的 message_id 直接查发件箱。旧令牌若仍有效且尚未被替换，原确认流程可以直接消费；确实没收到信时，等同一用途一分钟后用原接口再申请，新一轮签发会产生一条 pending，并同时使旧令牌失效。不要把所有历史空值批量变成待发送。

现在可以停止 API。待办仍能在另一个数据库连接读到。到这一步，寄送程序还没有开始工作，发件箱中积压一行是正确的中间结果。

## 42.4 让另一个进程寄出一封仍然有效的信

取到任务后，最省事的做法似乎是按 intent_id 查出当前意图，生成令牌，发给 recipient。想一想这样的顺序：甲周一申请了一次重置，两分钟后重新申请，第一条任务却最后才运行。两个任务指向同一行；如果第一条可以不加条件地覆盖摘要，它就会撤销较新那封信。即使只运行一个串行寄信程序，延迟也足以触发这个错误。

我们需要把“轮到这个任务”“它对应的签发仍有效”“从现在起这枚令牌可以被验证”三个判断放在一个短事务里。新增 `src/verification-outbox.ts`：

```ts
import type { DatabaseService } from './database.service.js';
import type { RecoveryPurpose } from './recovery-contract.js';
import type { VerificationDelivery } from './verification-delivery.js';
import { issueToken, tokenDigest } from './token.js';

type Job = { id: string; intent_id: string; generation: string; recipient: string; purpose: RecoveryPurpose };

export async function sendOne(database: DatabaseService, delivery: VerificationDelivery, messageId?: string) {
  const prepared = await database.client.$transaction(async tx => {
    const [job] = await tx.$queryRaw<Job[]>`
      SELECT id, intent_id, generation, recipient, purpose FROM public.verification_outbox
      WHERE status = 'pending' AND available_at <= clock_timestamp()
        AND (${messageId ?? null}::uuid IS NULL OR id = ${messageId ?? null}::uuid)
      ORDER BY available_at, id LIMIT 1 FOR UPDATE SKIP LOCKED
    `;
    if (!job) return null;
    await tx.$queryRaw`SELECT id FROM public.verification_intents WHERE id = ${job.intent_id}::uuid FOR UPDATE`;
    const token = issueToken();
    const [window] = await tx.$queryRaw<{ issued_at: Date; expires_at: Date }[]>`
      UPDATE public.verification_intents SET token_digest = ${tokenDigest(token)}
      WHERE id = ${job.intent_id}::uuid AND token_digest = ${job.generation}
        AND email = ${job.recipient} AND purpose = ${job.purpose}
        AND consumed_at IS NULL AND expires_at > clock_timestamp()
      RETURNING issued_at, expires_at
    `;
    await tx.verificationOutbox.update({ where: { id: job.id },
      data: { status: window ? 'attempting' : 'obsolete' } });
    return { job, token, window };
  }, { maxWait: 2000, timeout: 5000 });
  if (!prepared) return 'empty';
  if (!prepared.window) return 'obsolete';
  const { job, token, window } = prepared;
  let status: 'accepted' | 'unknown' = 'accepted';
  try { await delivery.send(job.recipient, job.purpose, token, window.issued_at, window.expires_at); }
  catch { status = 'unknown'; }
  await database.client.verificationOutbox.update({ where: { id: job.id }, data: { status } });
  return status;
}
```

把一封信沿三个提交点从左向右读，最后一次写回的故障不会倒推前两次提交失效。

```text
请求进程   [意图 + pending] ── 提交 ──→ 202
                         │ 请求进程现在可以退出
寄信进程   [复查代次，写令牌摘要 + attempting] ── 提交
                                                  ↓
                                          向 SMTP 发送正文
                                                  ↓
                                     [accepted 或 unknown] ── 提交
```

先看事务内部。按状态与时间选一条 pending，用消息 ID 可以只处理指定的实验记录。行锁一直持有到事务结束；另一个同时启动的程序跳过已锁住的行。一无所获时返回 empty，只代表**本次查询没有可领取的匹配行**。再锁住意图，取得锁后用数据库当前时间判断有效期；等锁耗掉的几秒也计入十五分钟。更新谓词必须认出同一代次、同一用途和收件人。已经重发、消费、删除或过期的意图无法更新，任务只转为 obsolete，本次不接触 SMTP。

更新命中时，才把用于确认的随机令牌摘要写回。只有这个处理进程在内存里拿到可寄送的原值；数据库备份、队列和日志都无需保存原值。先提交 attempting 与摘要，再把原值交给 SMTP。若先发后提交，收件人可能在提交前就来确认，甚至收到一封对应事务最终回滚的信。若在发送过程中另一轮合法重发已经提交，这封在途旧信仍可能抵达，确认时会因摘要已换而失败。**到达顺序与申请顺序可能不同**；用户应使用最近一次申请所对应的信，一时分不清时，待冷却结束只申请一次。

处理结果写回发件箱。accepted 表示 SMTP 适配器收到了接受应答，unknown 表示调用抛错。后者把连接失败和最终应答丢失保守地合在一起。进程若在 attempting 提交后突然退出，可能还没有连接 SMTP，也可能对端已经收到正文；另一进程只能读到 attempting。不能把它按时间一到直接改回 pending，尤其不能在重试时替用户悄悄换一个可用令牌。这里的决定是保留现场，让用户在冷却后显式发起新一轮申请。第 44～45 章再扩展执行权、故障分类与恢复策略。这条取舍适用于允许重新申请的短期证明；若合同要求重发完全相同的文件内容，要另外保存可取回的受保护版本，单靠摘要无法履约。[PostgreSQL 18 的并发可见性](https://www.postgresql.org/docs/18/transaction-iso.html) · [SMTP 最终应答的含义](https://www.rfc-editor.org/rfc/rfc5321#section-4.2.5)

新增 `src/send-one.ts`，它只打开一个数据库服务，运行一次 sendOne，并在 finally 中释放连接池。它没有 HTTP 监听端口，也不读取用户输入来决定 SMTP 主机。继续用第 36 章的 `LocalMailDelivery`，给 VerificationDelivery.send 和 LocalMailDelivery.send 的 token 参数后各加 issuedAt: Date、expiresAt: Date，将邮件中的相对有效期换成数据库返回的申请与到期时刻。正文输出 `Requested (UTC): ${issuedAt.toISOString()}` 和 `Expires (UTC): ${expiresAt.toISOString()}`，用前者区分乱序到达的两封信。排队两分钟不会延长有效期。把 OpenAPI 中匿名请求的说明更新为成功签发时入队。状态码、JSON 和确认端点都无需更换。

```ts
import { loadConfig } from './config.js';
import { AppLogger } from './app-logger.js';
import { parseDatabaseConfig } from './database-config.js';
import { DatabaseService } from './database.service.js';
import { LocalMailDelivery } from './verification-delivery.js';
import { sendOne } from './verification-outbox.js';

async function main() {
  const expected = process.argv[2];
  if (!expected || process.argv.length > 4) throw Error('EXPECTED_DATABASE_REQUIRED');
  const config = await loadConfig();
  const database = new DatabaseService(parseDatabaseConfig(process.env), new AppLogger(config.logLevel));
  try {
    const [row] = await database.client.$queryRaw<{ name: string }[]>`SELECT current_database() AS name`;
    if (row?.name !== expected) throw Error('DATABASE_MISMATCH');
    const result = await sendOne(database, new LocalMailDelivery(config), process.argv[3]);
    console.log(result);
    if (result === 'unknown') process.exitCode = 2;
  } finally { await database.onModuleDestroy(); }
}
main().catch(() => {
  console.error('Send-one failed. Check expected database, configuration, migration and task status.');
  process.exitCode = 1;
});
```

**先停 API，再寄信。** 若 42.1 启动的专用 Mailpit 仍在运行，直接使用现有窗口。否则在 Mailpit 工具所在目录前台启动自己的收件服务，保持当前终端打开：

```bash
./mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 \
  --disable-version-check --block-remote-css-and-fonts
```

浏览器打开 `http://127.0.0.1:8025`，先按本轮地址看收件箱。回到项目根目录的另一个终端，重新构建。将 message_id 换成刚才 SQL 返回的消息 UUID。这里使用迁移配置文件里的 VERIFY 连接，脚本再次向数据库查名字；库名、API 和收件查看窗口要能对应起来。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL LOCAL_SMTP_PORT DB_QUERY_DEBUG
npm run check
message_id='替换为本轮的消息UUID'
NODE_ENV=development LOCAL_SMTP_PORT=1025 node --env-file=.env.database-verify \
  dist/src/send-one.js epp_ch42_verify "$message_id"
```

若上一次暂停已经超过十五分钟，第一次处理得到 obsolete 是预期行为。回到 42.3 启动 API，重新申请，查出新 message_id，再停 API。若看到 empty，先查实际库名、ID、status 和 available_at；已经 accepted 的 ID 再跑一遍也会得到 empty。省略 ID 会处理整个库里最早可执行的一条；同库还有其他人的待办时按 ID 做这个实验。

正常路径输出 accepted。数据库的同一 message_id 从 pending 变为 accepted。此刻刷新 Mailpit，按收件人和主题定位这封信；在**保持这份 Mailpit 运行**的前提下，再运行同一命令，输出应为 empty，信件数没有增加。若第一次得到 unknown，检查收件服务的监听端口及收件箱，不把旧行改回 pending。CLI 为 unknown 设置退出码 2；启动、数据库或写回异常退出 1 时，也要先查任务状态再作决定。

![本机 Mailpit 的收件箱计数与注册验证主题](images/mailpit-accepted.jpg)

图 42-1　API 已停止，独立程序处理一条消息后，Mailpit 收件箱出现注册验证主题。画面截去邮件正文预览；区分“进入本地收件箱”和“令牌可用”，还要做下面的确认请求。

按 42.3 重启新版 API，在 Mailpit 打开该信，把令牌放入未同步的本地 registrationToken，发送第 36 章集合的 **02 确认注册**，应为 201，再发 **03 重放** 应为 400。重新查同一条意图，consumed 为 true，任务仍为 accepted。前者记录邮箱证明的消费，后者记录 SMTP 的应答。沿用第 36 章的 **06 请求重置** 时也要在 06 和 **07 确认重置**之间运行一次寄信命令，用重置主题里的令牌。确认成功仍撤销旧会话；本章没有改变密码恢复的授权判断。

**把故障位置挪一步。** 先准备一个新地址，保持 Mailpit 离线，只发 01。数据库应有 pending，HTTP 已经结束；此时恢复 Mailpit 再处理即可。换一个新地址，先让寄信程序在 Mailpit 离线时运行一次，再恢复 Mailpit。在第二个地址的实验中，第一次处理会留下 unknown，对同一 ID 再执行一次会得到 empty。对比这两行，差异由“谁已经尝试过外部调用”决定。还可在独立 VERIFY 先申请、等过一分钟再申请，保留两条消息 ID，先处理旧 ID，应得到 obsolete；再处理新 ID，只有这封能确认。若出现 429，按 Retry-After 等当前窗口结束，别用换账号或直接改日常库时间绕过保护。

还有两种结果可以用收件端证据区分。在本机隔离 SMTP 实验里，接收端读到了完整正文，却扣住最后的成功应答，寄信进程超时并写入 unknown。再按同一 ID 运行，结果为 empty，接收端仍只见到一份正文。另一轮让进程在建立连接、尚未收到问候时退出，意图摘要已提交，任务保持 attempting，也不会被下一次执行重新选中。前者确实传过正文，后者连正文都没开始传；只读 HTTP 的 202 无法区分它们。若要复查某封任务，即使关联意图已过期清理，也能单独查询 `SELECT id, status, available_at FROM public.verification_outbox WHERE id = '本轮消息UUID'::uuid`。

调试寄信时，先构建，再把一次性命令的 node 参数增加 `--enable-source-maps --inspect-brk=127.0.0.1:9229`，保持 API 停止以释放调试端口。在 VS Code 用原有 Attach，断在 `await delivery.send(...)` 前，只观察 job.id 与数据库状态，不展开 token。停在这里时，另一个连接已能读到 attempting；如果让进程退出，这一行会保持 attempting，再跑同一 ID 得到 empty。若继续运行则可能变成 accepted。调试耗时会占用有效期，观察正常投递要去掉断点，用新申请复核。

**让原来的注册与找回回归接上发件箱。** 开发完成后运行 `npm run check`。如果沿第 36 章手写过来，打开 `test/recovery.test.mjs`，看 `fixture` 里的 `issue`：旧代码在 `await recovery.request(...)` 返回时就从 `messages.at(-1)` 取 token。本章这时只提交了 pending，收信数组还是空的。用例仍要拿到令牌才能验证注册、重放和密码重置，取令牌的位置要移到发送之后。

让 `RecoveryService` 只接收 database、sessions 和应用状态。把收集邮件的测试对象传给从 `../dist/src/verification-outbox.js` 导入的 `sendOne`，在同一个 fixture 中用 `dispatch(id)` 调用 `sendOne(database, transport, id)`。这样 `issue` 可以为这次申请处理指定的一条消息：

```js
async function issue(purpose, email) {
  await recovery.request(purpose, email);
  const job = await db.verificationOutbox.findFirstOrThrow({
    where: { purpose, recipient: email, status: 'pending' },
  });
  assert.equal(await dispatch(job.id), 'accepted');
  return messages.at(-1).token;
}
```

这里每个用例生成自己的地址，调用这个辅助函数时该用途、地址只有一条 pending。专门验证换代的用例要保留新旧两个 ID 分别处理。冷却用例还要数该地址的任务，重复申请后仍只有一条。原先让 SMTP 挂起以占满请求名额的用例也要拆开：让发送对象抛错，按 ID 得到 unknown、再处理得到 empty；另发两个尚未完成的申请，检查第三个申请因名额用尽被拒。最后在 `t.after` 中按本轮收件地址删除发件箱行，再按既有顺序清理意图、账号等数据并关闭应用。

沿用前章原版测试时，可将[第 42 章测试改动](recovery-42.patch)的原始文本保存为项目根目录的 `recovery-42.patch`，然后在该目录执行：

```bash
git apply --check recovery-42.patch && git apply recovery-42.patch
```

补丁只改 `test/recovery.test.mjs`，包括上面的衔接和换代、过期、并发处理同一消息的用例。如果已使用本章配套测试，直接运行即可。若检查未通过，打开补丁按函数对照本地改动，保留自己增加的用例。

需要跑全章回归时，先停止连接测试库的 API 和寄信程序，沿用已迁移到本章且包含前章虚构样本的独立测试库。若是刚 bootstrap 的空练习库，注册链本身可以直接使用；前章素材回归还要有固定练习用户。仅在新建的测试库核对库名后执行下句。已有该 ID 时先检查它的状态和用途，不要重置其密码或开通真实账号。

```sql
INSERT INTO public.users(id, web_enabled)
VALUES ('10000000-0000-4000-8000-000000000001', true)
ON CONFLICT (id) DO NOTHING;
```

清除外层 TEST_DATABASE_URL，在 `.env.test` 中指向这份测试库，再运行 `npm test`。生产交付沿前章复制 dist、package.json、package-lock.json 和 .npmrc 到干净目录，执行 `npm ci --omit=dev`。由运行环境注入已核对的 DATABASE_URL、CURSOR_HMAC_KEY、APP_ORIGIN 与 LOCAL_SMTP_PORT，API 用 `npm start`，另一个终端用 `NODE_ENV=production node dist/src/send-one.js 预期库名 消息UUID`。两个进程不共享内存，交接靠数据库；此时仍只连接回环 SMTP。检查生产 /docs 默认 404、寄信进程处理完退出，再关闭本次 API、Mailpit，清除客户端保存的本轮令牌。第 43 章将从这里接手持续运行和关闭的责任。

## 本章支线

[42A　发件箱里该保存当时的值，还是一条引用？](side-01-message-payload.md)沿用素材修订，把“有更新”改成“寄出当时确认的版本”，推导引用、快照、保留期与执行时授权。阅读另加 10～14 分钟。

## 附录：本章必要技术点速查

| 名称 | 回查时看什么 |
| --- | --- |
| Transactional Outbox | 在业务事务提交时一并保存工作。HTTP、SMTP、邮箱验证各有自己的完成时点。 |
| intent_id / generation / id | 依次定位可复用的意图行、一次签发与一条任务。冷却内的重复请求不会生成第二条。 |
| ON CONFLICT … WHERE … RETURNING | 行锁内判断能否重新签发，只有返回行时才能入队。 |
| FOR UPDATE SKIP LOCKED | 一次性执行只取可锁定的 pending；empty 也可能表示被另一调用锁住。 |
| attempting / unknown | 前者已经提交发送准备，后者观察到调用异常。两者都可能缺少收件端的最终事实。 |
| send-one.js | 预期库名必填，消息 UUID 可选；只处理一条，结果写回后关闭连接。 |
| 保留期 | 清理过期意图后，尚未处理的任务再运行会作废。发件箱保留收件人，需独立限制访问和留存期限；积压与分批清理见第 45 章。 |

语句的锁定范围与跳过已锁行可查 [PostgreSQL 18 SELECT](https://www.postgresql.org/docs/18/sql-select.html#SQL-FOR-UPDATE-SHARE)，冲突更新与返回值可查 [PostgreSQL 18 INSERT](https://www.postgresql.org/docs/18/sql-insert.html)。本章完成代码对应 `part-06/chapter-42`，从第 36 章的密码路线派生。

[第五篇回顾](../../part-05-identity/chapter-41-review/chapter.md) · [第六篇导读](../README.md) · [下一章：为什么需要独立 Worker](../chapter-43-worker/chapter.md)
