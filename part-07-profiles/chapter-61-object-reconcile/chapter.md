# 第 61 章　从头像记录与私有桶的差异追查缺件和多件

第 60 章已经能发布头像：先登记一次 writing，写入对象，再把用户的当前指针指向它。清理器也知道，当前头像不能删，旧头像要留到签名链接过期以后。现在收到两种报障：甲说自己的头像打不开，维护者又在桶里发现一张数据库查不到的图片。它们都能靠“重新跑清理”解决吗？

一次写入的记录适合解释已经知道 ID 的请求。要发现尚未报出来的缺件，还需要从两边独立取得清单。只从 avatar_writes 出发逐个 HEAD，永远看不见没有写入记录的对象；只列桶，又不知道哪个键正在被用户引用。本章建立一个只读核对入口，让你能交出“查了哪里、查全没有、差异属于谁、还缺什么证据”的报告，再决定是否修复。

从[第 60 章完成代码](https://github.com/SamChowRock/epp-public/tree/part-07/chapter-60)继续。应用、迁移、依赖和 Postman 集合都不变。新增文件集中在 `database/chapter-61-reconcile/`，不会启动后台清扫，也不增加 HTTP 接口。练习仍在 Mac 上，沿用 [Node、PostgreSQL、DBeaver、Postman 与私有存储](../../environment-setup.md#为头像核对建立独立观察身份)。

## 61.1 为对账准备两份独立清单

### 先保留一份可以核对的起点

在第 60 章的 Postman 集合中，两个已开通的练习账号分别登录、发布头像。保存本人 20 的 userId、昵称，一条原素材的 ID，以及 26 返回的 avatarId。同时保留每人发布时使用的原 PNG／JPEG 输入。立即打开签名地址，确认实际图片能读到；保存返回的 WebP 图片文件和头像 ID，不把签名地址写进交班记录。保留原 Cookie。图片可在终端用 `shasum -a 256 文件路径` 留下摘要。

本章会故意制造一个缺件，先把数据与桶配对复制。停止 API、Worker、清理命令及其他会写这对系统的程序，等在途请求结束；保持 PostgreSQL 在线，按[已有备份与独立恢复步骤](https://github.com/SamChowRock/epp-public/blob/part-07/chapter-60/database/chapter-22/backup-restore.md)恢复到新库，例如 `epp_ch61_verify`。在存储的前台终端按 Ctrl-C，等进程退出，再复制整个 `.chapter51-store`，包括 `s3.json`、`config`、`data`，不能只复制 Filer 网页里看到的图片。元数据和卷文件共同构成这份单机存储。

下面假定你已为第 61 章准备了新的代码目录，`source_code` 指向第 60 章原代码目录；它必须与新目录不同。不要在新目录再次运行 `init-store.mjs`，它会建立另一套身份和空存储。

```bash
umask 077
source_code='/替换为第60章代码目录的绝对路径'
# 在新的第61章代码目录中，确认目的目录尚不存在再复制。
test ! -e .chapter51-store && cp -R "$source_code/.chapter51-store" .chapter51-store
chmod 700 .chapter51-store
```

安装工具仍按[私有存储准备](../../environment-setup.md#启动私有存储)，只运行安装脚本取得 `.chapter51-tools/weed`，用 `version` 确认 4.52。同一台 Mac 的原存储与副本不能同时占用那十个端口。上述目录复制只用于本书同版本、停机的单机 mini 练习，不是分布式对象服务通用备份方案。

新目录的 `.env.database-verify` 中 `DATABASE_URL` 指向新库，`.env.test` 中 `TEST_DATABASE_URL` 也改为这个 VERIFY，后面启动练习服务时也会用到它。不要把生产或日常开发连接放进这两个文件。保留 `.env` 中原签名配置与原应用存储身份。在这个新目录先 `nvm use`、`npm ci`、`npm run check`，再从副本启动存储。另开项目终端启动 API：

```bash
unset DATABASE_URL TEST_DATABASE_URL SHADOW_DATABASE_URL DB_QUERY_DEBUG
unset AVATAR_S3_ENDPOINT AVATAR_S3_BUCKET AVATAR_S3_ACCESS_KEY AVATAR_S3_SECRET_KEY
PORT=3360 APP_ORIGIN=http://127.0.0.1:3360 NODE_ENV=development DB_QUERY_DEBUG=false \
  node --env-file-if-exists=.env --env-file=.env.database-verify \
  --env-file=.chapter51-store/app.env --input-type=module <<'JS'
import { withVerifiedDatabase } from './scripts/verify-database.mjs';
await withVerifiedDatabase('epp_ch61_verify');
await import('./scripts/dev.mjs');
JS
```

这里沿用前章的 3360 来源；若你原先用了别的端口，同步使用原来源。后加载的文件覆盖前面的同名配置，但已导出的外层环境优先，所以先取消上面这些变量。API 启动后在 DBeaver 的新库中核对记录，在原 Postman 会话中重读同一资料、素材和头像。应仍是原 ID，图片摘要相同。在 DBeaver 核对当前连接的库名、主机、端口，再检查两个用户的 `avatar_id`。这些结果建立了本轮的配对关系。仅有“两个系统都叫 avatars / epp”不能证明配对正确。若从空库起步，先完成第 60 章的 bootstrap、两个账号和头像发布，再做这份非空副本。

### 观察者需要另一组权限

API 的桶身份可以读写头像，却没有 List 权限。API 知道键就能取头像，列出桶里所有键还需要另一项权限。为了清点给 API 加 List，会扩大所有 API 实例的权限。我们另建观察身份，只授权读取和列举；数据库也不用所有者账号做日常扫描。

在第 60 章工程增加[本章完整工具目录](https://github.com/SamChowRock/epp-public/tree/part-07/chapter-61/database/chapter-61-reconcile)：`inventory.mjs` 是命令入口，`db.mjs` 读取数据库，`lib.mjs` 负责对象读取、校验与分类，`compare.mjs` 输出离线报告，`readonly.sql` 和 `init-observer.mjs` 只供管理员首次配置。先把这些文件放齐；它们是直接运行的 `.mjs`，不需要编译，不改应用启动方式。同时把[定向回归文件](https://github.com/SamChowRock/epp-public/blob/part-07/chapter-61/test/object-reconcile.test.mjs)放入 `test/object-reconcile.test.mjs`，供章末检查工具边界。`.gitignore` 增加 `.chapter61-private/`。下面逐步解释其中决定结论的部分。

先停下刚才验证过的存储副本。确认原 PID 已退出，端口检查无监听后，在这个副本的代码根目录运行：

```bash
nvm use
node database/chapter-61-reconcile/init-observer.mjs http://127.0.0.1:18633 avatars
sh database/chapter-51/start-store.sh
```

辅助程序核对本地 `admin.env` 的端点与桶，检查原十个端口已停，向原 `s3.json` 追加一个独立身份，保留原两个身份的凭据：

```js
// init-observer.mjs：只有新身份使用新随机凭据。
const identity = {
  name: 'chapter61-observer',
  actions: ['List:avatars', 'Read:avatars'],
  credentials: [{ accessKey: randomBytes(12).toString('hex'),
    secretKey: randomBytes(32).toString('hex') }],
};
```

完整程序通过临时文件和重命名更新配置，并拒绝已有观察身份或私有输出目录，避免重跑悄悄换钥。它创建 `.chapter61-private/s3.env`，目录模式 0700，文件 0600。因此不要提前创建同名目录；中途失败先检查现有文件，不靠删除身份后重跑解决。新前台进程保持运行，后面另开终端操作。这只适用于当前单用户本机实验。实际托管存储应由管理员配置相应只读策略。[SeaweedFS 的身份与动作范围](https://github.com/seaweedfs/seaweedfs/wiki/S3-Credentials)

`List:avatars` 和 `Read:avatars` 限制到桶。后面的 `avatars/` 是工具的查询前缀，**不是这份授权强制的键级边界**。持有观察凭据的人能读取该桶中其他键，不能把“程序只查这个前缀”当作凭据只能查这个前缀。Filer 管理端也不经过这些 S3 权限，仍只用于单用户回环练习。

数据库侧先以管理员进入本轮副本，核对：

```sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
```

在代码根目录，用实际管理员主机、端口与身份替换占位值。`-W` 让 psql 隐藏提示密码；预期库名必须来自刚才的实验记录。

```bash
psql -X -h 127.0.0.1 -p 5432 -U YOUR_ADMIN -W -d epp_ch61_verify \
  -v expected_db=epp_ch61_verify -f database/chapter-61-reconcile/readonly.sql
psql -X -h 127.0.0.1 -p 5432 -U YOUR_ADMIN -W -d epp_ch61_verify
```

第一个命令检查实际库名后，在事务中执行以下核心授权。第二个命令进入同一库，执行 `\password epp_avatar_auditor` 设置一份新的随机密码，再用 `\q` 退出；密码不放命令行或 SQL 文件。

```sql
CREATE ROLE epp_avatar_auditor LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
  NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE epp_ch61_verify TO epp_avatar_auditor;
GRANT USAGE ON SCHEMA public TO epp_avatar_auditor;
GRANT SELECT (id, avatar_id) ON public.users TO epp_avatar_auditor;
GRANT SELECT (id, user_id, state, created_at, check_after)
  ON public.avatar_writes TO epp_avatar_auditor;
ALTER ROLE epp_avatar_auditor SET default_transaction_read_only = on;
```

角色名在整个 PostgreSQL 实例中共享。同名角色已存在时脚本会失败回滚，应核对是否是自己前次准备的身份，不能覆盖它的密码和权限。DBeaver 可执行上面的原生 SQL，但不要把文件里的 `\if`、`\gset`、`\password` 当作 SQL 粘进去。若已有独立练习实例，沿用该实例，不修改日常库角色。

用观察身份新建 DBeaver 连接。查询指定两列应成功；查询 `nickname` 应被拒。为了区分默认只读事务与实际表权限，在这个观察连接中先执行 `SET default_transaction_read_only = off`，再执行 `UPDATE users SET avatar_id = NULL WHERE false`。即使条件不会选中行，也应得到权限错误 `42501`。随后恢复 `SET default_transaction_read_only = on`。我们依靠权限限制写入，默认只读只是额外保护。PUBLIC 或继承角色可能已有授权，所以只看 GRANT 文件不够；本章不撤销其他业务角色的既有权限。

用编辑器新建 `.chapter61-private/db.env`，填入观察身份的连接 URL：

```dotenv
RECONCILE_DATABASE_URL=postgresql://epp_avatar_auditor:替换为URL编码后的密码@127.0.0.1:5432/epp_ch61_verify
```

实际端口按你的副本修改，密码中的特殊字符按 URL 规则编码。执行 `chmod 600 .chapter61-private/db.env`。这里使用 `RECONCILE_` 前缀，避免误取 API 的 `DATABASE_URL` 或 `AVATAR_S3_*`。在新终端先取消可能从旧练习导出的同名观察变量，文件才是本次配置来源：

```bash
unset RECONCILE_DATABASE_URL RECONCILE_S3_ENDPOINT RECONCILE_S3_BUCKET
unset RECONCILE_S3_ACCESS_KEY RECONCILE_S3_SECRET_KEY
```

### 两份清单分别怎样读全

数据库按 UUID 升序取页，不需要通过 OFFSET 跳过已读行。一次只读 REPEATABLE READ 事务包住两张表：第一次取样确定数据库快照，后面的页继续读同一份已提交视图。它解决数据库内部跨页变化，不会锁住对象服务，也不会让另一个系统回到同一时刻。

```js
// db.mjs 的事务与单表分页；完整函数还保存每页时段、错误和来源。
await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
await client.query("SET LOCAL statement_timeout='15s'");
await client.query("SET LOCAL lock_timeout='2s'");
await client.query("SET LOCAL idle_in_transaction_session_timeout='20s'");
const { rows } = await client.query(`
  SELECT id, avatar_id FROM public.users
  WHERE ($1::uuid IS NULL OR id > $1::uuid)
  ORDER BY id LIMIT $2`, [after, pageSize]);
// rows.length < pageSize 才记录这张表的终页；否则 after = rows.at(-1).id。
// 再按同样方式读取 avatar_writes 的五个授权列，最后 COMMIT。
```

即使表正好有两页整数倍的行，最后也要再读一个空页才确认结束。完整实现设置每表最多 10000 页、两表合计最多 1000000 行；达到上限保留不完整结果，避免一次调查无限增长。查询和连接也有超时。不要把大规模盘点长期塞在一个快照里：长事务会延后旧版本回收；数据量超出本章范围时，需要重新选择批次和一致性目标。

对象侧使用已经安装的 AWS SDK。S3 的续页令牌由服务端定义，不能从最后一个文件名自己拼一个令牌，也不能因为本页数量少就猜测已结束：

```js
// lib.mjs：scanObjects 中每轮发送一次请求。
const r = await client.send(new ListObjectsV2Command({
  Bucket: source.bucket, Prefix: 'avatars/', MaxKeys: pageSize,
  ...(token ? { ContinuationToken: token } : {}),
}), { abortSignal: AbortSignal.timeout(15000) });
// 收下 Contents 中的精确键、大小、LastModified、ETag。
if (!r.IsTruncated) { manifest.terminal = true; manifest.complete = true; }
else {
  // 完整实现先拒绝空令牌和重复令牌；失败时保留已读页，但 complete=false。
  token = r.NextContinuationToken;
}
```

`IsTruncated` 和 `NextContinuationToken` 是该 API 的分页协议。一次应答成功只证明这一页成功；多页调用不构成固定快照。即使底层对单次读写有强一致性，也不能推出这些请求之间没有新发布。[ListObjectsV2 的请求与返回字段](https://docs.aws.amazon.com/AmazonS3/latest/API/API_ListObjectsV2.html)

现在各取每页 2 条，亲眼看到多页与终页。这里的 2 是观察分页用的小值；工具默认 100，最大 1000。两张清单的文件名每轮换新，工具拒绝覆盖旧证据。

```bash
node --env-file=.chapter61-private/db.env database/chapter-61-reconcile/inventory.mjs \
  db epp_ch61_verify .chapter61-private/db-01.json 2
node --env-file=.chapter61-private/s3.env database/chapter-61-reconcile/inventory.mjs \
  objects http://127.0.0.1:18633 avatars avatars/ .chapter61-private/objects-01.json 2 10000
node database/chapter-61-reconcile/compare.mjs \
  .chapter61-private/db-01.json .chapter61-private/objects-01.json .chapter61-private/report-01.json
```

用编辑器看两份 JSON 的 `source`、`startedAt`、`endedAt`、`pages`、`terminal` 与 `complete`。数据库还记录实际连接身份和数据库时钟。退出非零时先看安全错误码；失败文件可以保留已读事实，但没有完成标记就不能交付为全量。连库失败、尚未取得来源的文件也不能拿去比较。

在 Chrome 打开本机 `.chapter61-private/report-01.html`，它是同一次比较生成的静态表，不启动新服务，不上传数据。JSON 留完整原始观察供复查；HTML 供浏览。文件含用户 ID 与对象名，仍按私有资料保管。比较器能拒绝未知格式、重复行和不在范围内的键，却不能替你证明两边业务上属于同一环境；先核对页面显示的两组来源。

## 61.2 按当前指针和写入尝试解释差异

### 在副本里准备四种事实

保留一个账号甲的当前头像，作为完整对照。另一个账号乙的当前头像先通过原会话取签名、实际下载，保存字节和摘要。随后只在本轮副本的 Filer 页面中，找到 `buckets → avatars → avatars`，按**乙当前的完整 avatarId.webp** 删除这个复制对象。不要删用户行、avatar_writes 行或目录。回到 Postman，26 仍可能返回 200 和签名地址，打开地址却失败；API 此时只负责签名，没有替你读取对象。

再用副本管理员的 DBeaver 连接，为甲准备一个尚未上传的写入占位。这是观察状态用的合成行，没有真正的上传请求；不要将它描述成捕获到的网络故障。甲不能已经有另一条 writing：

```sql
SELECT id, state, check_after FROM public.avatar_writes
WHERE user_id = '替换为甲的userId'::uuid AND state = 'writing';
-- 仅在上面返回零行时执行，保存 RETURNING 的本次 ID。
INSERT INTO public.avatar_writes(id, user_id, state)
VALUES (gen_random_uuid(), '替换为甲的userId'::uuid, 'writing')
RETURNING id, user_id, state, created_at, check_after;
```

默认五分钟保护期已经在第 60 章建立。立刻完成本节清点；如果离开过，回来先看数据库时钟与 check_after，不再把已过期的行称为“仍受保护”。实际清理是否允许还要重新检查当前指针和状态，不能拿旧报告里的 due 值执行。

最后制造一个没有对应写入行的对象。在终端用 `node -e "console.log(require('node:crypto').randomUUID())"` 生成新 UUID，把刚保存的练习 WebP 复制并改名为 `这个UUID.webp`，只向副本 Filer 的 `avatars` 键目录上传这个文件。记录准确键，确认数据库没有同 ID 行。Filer 的直接写入是本轮管理员造样本动作，观察身份没有上传权限；真实系统中它也可能来自另一实例或备份恢复。不要让未知键自动进入清理候选。

给文件名换成 `db-02`、`objects-02`、`report-02`，重跑上一节三条命令。现在表中至少能找到以下四种关系；你自己的 ID 与数量会不同：

| 数据库样本 | 对象观察 | 这一轮能说什么 |
| --- | --- | --- |
| 甲的当前指针、对应 live 尝试 | 列表中有精确键 | `current-listed`，还没有证明图片内容正确 |
| 乙的当前指针、对应 live 尝试 | 完整列表未出现 | `current-not-listed`，需要同键 HEAD 与实际 GET |
| 非当前 writing，保护期未到 | 可能有，也可能没有对象 | 保留写入状态，不能把“没有对象”直接判成失败 |
| 完整数据库样本没有对应尝试 | 列表中有键 | `object-untracked-at-db-sample`，只描述取样时的关系 |

![两份完整观察中的四种关系](images/four-cases.jpg)

图 61-1　一次只读清点的结果。当前缺键、writing 占位与没有记录的对象分别保留，报告没有输出删除名单。界面中的账号与对象 ID 是本轮合成练习数据；这次实测用了三个账号，writing 占位属于第三个账号，另两个分别保留完整头像和缺件。你用甲、乙两个练习账号也能复现这四种关系。

比较先把 `users.avatar_id` 转成 `avatars/<id>.webp`，再按**完整键字符串**连接尝试行和桶观察。不能只取文件名的一部分，也不能把所有键转成小写：对象服务里的键区分大小写，`avatars/X.webp` 与 `avatars/x.webp` 不一定是同一个对象。

```js
// lib.mjs：关键分类分支；get(key) 建立同一个精确键的观察容器。
for (const u of dbManifest.users) {
  if (u.avatar_id) get(`avatars/${u.avatar_id}.webp`).currentUsers.push(u.id);
}
// attempts 与 objects 也并入同一容器后：
if (row.currentUsers.length) {
  row.classification = row.object ? 'current-listed'
    : objectManifest.complete ? 'current-not-listed' : 'current-unverified';
}
// 有尝试却没观察到引用时，只有用户表读全才可称 noncurrent；
// 没有尝试时，只有数据库读全才可称 untracked-at-db-sample。
```

完整实现保留 `writing / live / retired`、check_after 和两边观察时间，不将它们压成一个“正常/异常”布尔值。live 却未被任何当前指针引用也值得追查；状态名不能代替当前引用事实。报告只处理这套头像键规则，其他前缀不在本轮结论范围内。

### 缺件还要经过精确读取

把乙的当前头像 ID 交给 HEAD 命令：

```bash
node --env-file=.chapter61-private/s3.env database/chapter-61-reconcile/inventory.mjs \
  head http://127.0.0.1:18633 avatars 替换为乙的avatarId
```

成功是 `present`，404 是 `missing`，403、连接失败或超时是 `unverified` 并以非零退出。再用甲的已知存在键做对照。若甲也失败，先查端点、凭据和权限，不要先向乙宣布文件丢了。AWS 的 HEAD 在对象不存在时还会因调用者是否有列举权，分别返回 404 或 403；它不能仅凭 403 区分“没有”与“无权确认”。[HeadObject 的权限与错误语义](https://docs.aws.amazon.com/AmazonS3/latest/API/API_HeadObject.html)

HEAD 不返回图片字节。列表大小相同、HEAD 成功、ETag 相同，都不应在本章被说成“已验证与备份逐字节相同”；ETag 的含义随对象服务、上传方式及加密方式变化。真正验内容要读取字节并核对已知摘要，或让图片解码器实际解码。

回到乙的原会话，再发 26，立即请求新签出的地址。本轮副本中应看到“签名接口 200，实际 GET 404”。留用户 ID、avatarId、请求时间和状态即可，不保存签名 URL。反过来，匿名打开私有桶被拒绝也不能证明缺件。权限错误、端点不可达、当前键缺失，是三种不同的处置起点。

## 61.3 让发布过程穿过一次扫描

### 一张新头像为何被报告为未跟踪

先只执行数据库命令，写 `db-before.json`，停在这里。用甲的原会话正常发布另一张头像，记下返回的新 avatarId，立即通过 26 取地址并实际读图。发布会将新尝试变为 live、修改当前指针，并将原当前头像变为 retired；前节甲的合成 writing 也会被新预约取代。

现在才执行对象扫描，写 `objects-after.json`。用这两个文件生成 `crossed.json`：

```bash
node database/chapter-61-reconcile/compare.mjs \
  .chapter61-private/db-before.json .chapter61-private/objects-after.json .chapter61-private/crossed.json
```

新头像可能显示为 `object-untracked-at-db-sample`，旧头像仍带着旧数据库样本的 current 标记。这两条观察各自都是真的：第一次读数据库时新尝试尚未提交，后来列桶时新对象已经存在。给这份差异加一个“孤儿”名称，不会使它自动获得可删除的含义。

再取新的数据库文件 `db-after.json`，与刚才那份对象观察生成 `rechecked.json`。按同一个 userId 和新 avatarId 找行，新对象应成为 `current-listed`，旧对象成为 `tracked-noncurrent-retired`。保留两份报告，不能覆盖第一次观察来制造“它从没出现过”的记录。

![发布穿过扫描边界后的再次核对](images/rechecked-publication.jpg)

图 61-2　第二次数据库观察已经包含新发布。第一次报告中没有记录的新键，现在是同一用户的当前头像；另一个无记录练习键仍然保留。图中仍是 writing 的那行属于第三个样本账号，未参与甲的这次发布；如果占位也属于甲，甲的新预约就会将它淘汰。

第二次观察也不是终局证明。若服务持续写入，新的扫描仍可能穿过下一次发布。日常核对先用只读报告缩小范围，再按同一用户与精确键复查；需要稳定恢复点时，要安排写入暂停或采用明确的业务版本协议。本章没有给两个系统增加分布式事务。

### 只拿到第一页不能变成空缺证明

保持有多于两个对象，故意把本轮最多页数设为 1：

```bash
node --env-file=.chapter61-private/s3.env database/chapter-61-reconcile/inventory.mjs \
  objects http://127.0.0.1:18633 avatars avatars/ .chapter61-private/objects-partial.json 2 1
```

该命令应非零退出，文件中 `complete=false`、`terminal=false`、错误为 `PAGE_LIMIT`。这次是人为限制扫描预算，不能称为网络断线。用它与完整数据库清单生成 `partial.json`，没读到的当前键应变成 `current-unverified`，已经实际读到的键仍可保留 listed。不能把不完整清单当空集合，从而把所有当前头像判成缺件。

要观察真正的续页失败，可以在 Node 调试器中给 `lib.mjs` 的 `client.send(...)` 行设断点，使用 `--inspect-brk=127.0.0.1:9228` 启动同一 objects 命令。按[已有 Node 调试器准备](../../environment-setup.md#观察请求如何经过代码)连接，第一次发送后再暂停在第二次发送前；确认第一轮页面记录已有两条，正常停止副本存储，然后继续。这次在 Chrome 调试目标配置中添加 `127.0.0.1:9228`；API 的现有调试器继续占用 9229，两个端口各自核对。失败记录应保留已接受的第一页，错误可能是连接拒绝或超时，仍不是终页。结束调试进程后再启动同一存储目录。

![续页失败保留下来的不完整观察](images/incomplete-network.jpg)

图 61-3　这次实测由独立回环故障入口转发真实存储请求，并在第二页返回 503；第一页面两条对象已保留，未完成的清点没有将其他当前头像判为缺件。这与上面的停服务实验是两种不同的故障注入，图中错误码不要求与你相同。

重新扫描固定的 `avatars/` 范围，写一个新文件，恢复页数上限，直到得到明确终页。工具在同一轮内按精确键合并重复观察，保留最后一次看到的对象属性以及原页记录。两个只扫了一半的文件即使拼在一起，也可能漏掉同一个键，因为两轮之间可能有人新增、替换或删除对象。上一轮作为调查证据保留，新完整轮作为新的观察。

如果数据库只读事务失败，处理也一样。尤其用户页没读全时，某尝试没有连到 current 指针，只能称 `tracked-current-unverified-状态`，不能断言它非当前。`complete` 不是装饰字段，它改变了哪些判断成立。

## 61.4 用第二次观察决定怎样修复

### 让缺头像的用户重新读到图片

先处理乙的缺件。用当前会话重新读资料与头像指针，再做同键 HEAD，确认仍是原问题。若有可信备份，只有明确它属于这个精确键、摘要与故障前记录相同，并核实恢复不会覆盖后来合法写入时，才能由具有写权限的处置者恢复字节。下载到了“一张长得一样的图”不够，事后从任意对象取一个摘要也不能充当事故前的证据。

本章选择更容易沿业务边界验收的路线：乙通过原发布接口上传最初保留的 PNG／JPEG 输入（例如 `harbor.png`），不要上传下载得到的 WebP：当前上传入口只接受 PNG／JPEG，WebP 返回 415。发布成功后取得一个新的 avatarId。再用 26 签出当前地址，实际 GET 并解码。DBeaver 按乙的 userId 查询，应看到当前指针已指向新 live 行，旧缺件行变成 retired。不要为了让报表看起来干净直接把 users.avatar_id 改成某个看起来可用的键；正常发布路径才会一起处理归属、保护期和旧指针。

本轮实际验证中，乙旧键的签名接口 200、对象 GET 404；正常重新发布后 GET 200，重新得到的 WebP 与故障前保存的内容摘要相同。其他练习账号的原资料、素材和会话继续可读。这里修复的是当前用户看到的结果，旧缺件记录仍然可以解释先前发生过什么。

### 清理仍走已有的按 ID 业务判断

对甲替换下来的旧头像，先看新的数据库观察，确认原键已非当前、状态 retired、check_after 到期。再交给第 60 章原清理命令；使用副本的**维护身份配置**，不能换用本章观察身份：

```bash
unset DATABASE_URL AVATAR_S3_ENDPOINT AVATAR_S3_BUCKET AVATAR_S3_ACCESS_KEY AVATAR_S3_SECRET_KEY
node --env-file=.env.database-verify --env-file=.chapter51-store/app.env \
  database/chapter-51/clean.mjs epp_ch61_verify http://127.0.0.1:18633 avatars 替换为甲的旧avatarId
```

它在数据库中重新检查状态、到期与当前引用，再领取该 ID，才向对象服务发 DELETE；报告里昨天的判断不是今天的授权。即使指定了 ID，库与桶仍须配对，不能拿一个库的非当前记录去删另一个库还在引用的共享对象。清理后 HEAD 旧键应缺失，甲的新当前键和另一个账号的键应仍可读。写入尝试行保留，便于下一轮解释迟到对象；不以删行清空报表。

本轮直接上传的未知练习键不交给清理器。报告应留精确键、两个来源、各轮扫描区间、是否完整、对应 HEAD 观察，以及已排查的写入者和备份来源。即使第二次数据库仍没有记录，也只能排除“这次完整数据库样本中有记录”；别的数据库、停机实例或外部导入是否使用同一个桶，仍要核实。没有证据就保留交接，不追求报表零差异。

最后再取两份新清单，用原会话按同一用户复读，记录哪个当前头像已恢复、哪个旧键已清、哪些未知键保留。停止本轮 API、调试器和存储前，记下配对的库名与存储目录；下章继续使用这份练习环境。私有结果不要提交 Git。对工具本身的回归可运行 `node --test test/object-reconcile.test.mjs`，它检查分页和分类的边界，不能代替你刚才的真实权限、对象字节和业务请求验收。

完成代码：[part-07/chapter-61](https://github.com/SamChowRock/epp-public/tree/part-07/chapter-61)。第 62 章从这一阶段继续，原请求集合仍是 `requests/chapter-51.postman_collection.json`。本章没有新增迁移；原库与空库的结构准备仍沿用第 60 章，切换代码不会替你选择或复制数据。

## 附录：本章必要技术点速查

| 观察或工具 | 能证明的范围 |
| --- | --- |
| 数据库只读快照 | 本次事务内两张表的已提交视图；不包含对象服务 |
| 对象明确终页 | 本次分页遍历到终点；不保证扫描期间无变化 |
| 完整清单未列出 | 本次列表未观察到该键；仍要精确 HEAD 与业务 GET |
| HEAD 403 / 网络失败 | 本次无法确认；不能当作缺件 |
| 未跟踪对象 | 数据库取样时无对应记录；不是删除许可 |
| 当前头像修复 | 可信备份按身份恢复，或正常发布新头像并实际取图 |
| 已跟踪旧键清理 | 原命令重新检查到期、状态和当前引用，再按 ID 处置 |

阅读约 50～65 分钟；已有第 60 章环境时，复制副本、写代码、配置身份和排查故障另需 80～115 分钟，其中包括核对四种差异、在两次扫描之间发布，以及从一次中断中恢复。下载和等待保护期结束的时间另计。可在两份完整初始清单后暂停，回来先核对来源和当前状态。

[上一章 · 对象存储与数据库如何协作](../chapter-60-avatar-storage/chapter.md) · [下一章 · 第七篇回顾：文件与数据库没有一起成功时怎么办](../chapter-62-review/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
