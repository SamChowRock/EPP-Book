# 第 78 章　发布、迁移与回退

发布当天，有人还开着昨天的素材页。旧页面点“创建本轮素材”只发送原文；新页面多了一个中文意图输入框。我们想从今天开始，要求每一笔新保存的素材和修订都带意图。昨天已经保存的内容，包括确实没有填写意图的历史，要能照常打开。这时先换页面、先换 API、先改数据库，用户会遇到三种不同的结果。

本章在第 77 章恢复出来的**独立发布副本**走一次发布。旧版叫 A，过渡版叫 B。用 B 写下一笔素材，把它的 ID 留在浏览器里，随后两次换回 A。两次用的是同一旧程序、同一素材、同一清空请求，中间只改变数据库是否执行新规则。最后把发布前的备份还原到另一库，看这笔工作去了哪里。下部继续使用原来的可空契约。[A 的起点代码](https://github.com/SamChowRock/epp-public/tree/part-10/chapter-77) · [第 77 章的恢复起点](../chapter-77-backups/chapter.md)

## 78.1 先保住一条能辨认的新旧请求

在第 77 章的交接单上找到已验过的恢复库、旧账号、可读取的素材和配对桶。用新的部署目录、服务名和数据库连接操作这个副本，入口只给操作端。迁移使用对象所有者；API 使用恢复好的受限登录。保留同一 HTTPS 来源、签名密钥、会话库和代理信任，邮件、通知与清理先停妥。这轮只改素材写入；换账号、换来源或同时重开消费者都会增加难以解释的变化。

先在 Firefox 打开 A 的交付页，用练习账号登录。展开开发者工具的“网络”，点“创建本轮素材”，选中 `POST /captures`。请求 JSON 只有 `originalText`，响应为 201，`chineseIntent` 是 null。记下素材 ID，用“按 ID 读取”再核对一次。保持这张旧页面打开。若要练断线重试，在 Postman 沿用同一练习账号的会话、Origin、CSRF 和写请求头，另建一笔省略意图的创建请求，给它加一个小写 UUID 格式的 `Idempotency-Key`。保存原请求体、键和成功响应里的 ID，后面会原样重发。[带键写入和旧收据的语义](../../part-04-consistency/chapter-30-write-retry/chapter.md)

第 23 章曾在 `captures.chinese_intent` 上演示收紧列。现在先在 DBeaver 的发布库连接打开 SQL 编辑器，把下面的 `:capture_id` 绑定成刚创建的 ID。接下来的查询都先核对这个连接的库名与端口。

```sql
SELECT current_database(), inet_server_port();
SELECT c.id, c.chinese_intent AS parent_intent, r.id AS revision_id,
       r.revision_no, r.chinese_intent AS revision_intent
FROM public.captures c JOIN public.capture_revisions r ON r.capture_id = c.id
WHERE c.id = CAST(:capture_id AS uuid)
ORDER BY r.revision_no;
```

第一次两列都是空，很容易选错迁移对象。另用旧页面创建一笔专供观察的素材，换成它的 ID，在 Postman 发 `PATCH /captures/该ID`，请求体填 `{"chineseIntent":"便于下次检索"}`。再执行查询，会多出一条修订，父表的原值仍在；浏览器读到新意图。当前代码在创建时一起写父记录和第 1 版，此后的 PATCH 与完整修订请求都**追加**一行，详情取最大修订号。只给父列加非空，会漏掉后来的清空；给全部修订加非空，又会排斥本应保留的第 1 版。发布的对象由这次读写路径决定。

到这里依第 77 章封住入口、取库桶共同备份、保存旧收据和对象摘要，再恢复本次练习入口。称这份备份为“发布前”。它包含刚才记下的旧记录，尚不含 B 稍后写入的记录。为 A 记下可重新取得的制品摘要、实际配置版本和迁移历史，三项都保留到第二次回退之后。

## 78.2 做出能够并存的 B

从配套源码根把两个版本放到不同目录，A 用 `part-10/chapter-77`，B 用本章完成快照 `part-09/chapter-78`。例如在已有两个分支的检出执行以下命令；普通克隆只有远端分支时，把末尾的分支名写为 `origin/分支名`。目标目录取尚不存在的名字。

```bash
git worktree add --detach ../epp78-A part-10/chapter-77
git worktree add --detach ../epp78-B part-09/chapter-78
```

先看 B 有什么能力。两版都用原来的响应 schema 读历史 null。B 多读一个进程配置 `CAPTURE_INTENT_MODE`。默认 `optional` 保持现网行为，`required` 在下一笔写入前检查，拼错值在启动时拒绝。只在发布副本的 **B API 配置**写入 `CAPTURE_INTENT_MODE=required`。B 的新页面从输入框取 `chineseIntent`，随原文一起 POST；它也能先发给 A。因此可以先发新页面，并观察还有多少旧写入方发送空值。浏览器、导入器和仍在线的旧标签页都要算进去。

| 客户端动作 | A | B 开启 required |
| --- | --- | --- |
| 创建时省略意图，或明确给 null | 201，创建空意图的第 1 版 | 400，`INVALID_CAPTURE` |
| PATCH 发送空对象 | 400，字段校验失败 | 400，`VALIDATION_ERROR` |
| PATCH 明确给 null | 200，追加空意图修订 | 400，`INVALID_CAPTURE` |
| 追加修订时提供合法原文和意图 | 201 | 201 |
| 读取一条历史空意图 | 200，返回 null | 200，返回 null |

表中的 A 以数据库尚允许空值为前提。PATCH 只负责修改意图，空对象没有修改指令。完整修订还须提供原文与 `chineseIntent`；省略字段会先在请求校验处拒绝。

B 在 `src/capture-intent-policy.ts` 把进程模式与已经解析的意图区分开：

```ts
export function missingRequiredIntent(intent: unknown): boolean {
  return mode === 'required' && intent === null;
}
```

无键创建把省略的值规范成 null，完整修订先经过原有 schema 校验。`src/captures.service.ts` 在无键创建、修改意图、追加完整修订三个入口检查写规则。`src/capture-commands.ts` 还要处理另一种时序：昨天服务器可能已经提交，今天客户端才带原键重试。保持旧输入可以解析，按原有归属和指纹检查查收据。命中同一笔已完成请求就返回原响应；只有即将产生**新**修订时才判断必填。事务返回拒绝结果后，在数据库错误包装之外转成业务 400。若把必填直接加在所有请求共用的解析入口，旧收据会在读取前就被拦下。

在两份源码根分别使用 Node 24.22.1 和锁文件运行 `npm ci`、`npm run ci:check`。按第 67、69 章用目标平台的依赖做出两个原生 release，或按第 72 章在目标架构上用同一个已验证的基础镜像摘要分别构建两份镜像。例如在能看到这两个源码目录的构建机 Bash 中，沿用第 72 章记录的 `NODE_IMAGE`（含仓库摘要），在两个目录的父目录执行：

```bash
build_release() {
  docker build --build-arg NODE_IMAGE="$NODE_IMAGE" -t "$1" "$2" &&
    docker image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$1"
}
build_release epp78:a epp78-A && build_release epp78:b epp78-B
```

两次均成功且分别取得 ID 后再交付。构建机和部署机引擎不同时，通过第 72 章的 save/load 将两份送达，在部署机重新读取两个 ID。Docker Desktop 的 **Images** 中可按 `epp78` 查两个标签，**Builds** 中可分别查看两次构建；最终按部署引擎的实际镜像对照。原生和容器接管同一份数据时，API 只让一个入口承担公开写入。两个网页目录也分别保存，源文件都在各自的 `examples/handoff-client/`；按第 71 章把它们放到同源 nginx 的两个静态目录，例如 `/legacy/` 与 `/current/`，API 路由仍指向同一上游。这样一张旧标签页在发布后仍能重现实况。

在部署管理员的 Bash 进入 B 的**完整源码**，使用预备好的迁移身份私有配置。先把 `release_db` 设为交接单上的库名，`migration_env` 设为这份配置的绝对路径：

```bash
env -u DATABASE_URL node --env-file="$migration_env" \
  scripts/deploy-verify.mjs deploy "$release_db"
```

这一步在已有旧记录和迁移历史的库执行，脚本先比对实际库名；运行镜像不带这套完整迁移工具。新增迁移在一个事务里创建 `new_revision_intent_required` 插入触发器，条件为 `NEW.chinese_intent IS NULL`，触发时报告 SQLSTATE 23514；随即在同一事务里将其禁用。旧 API 此时仍可写。这样的安装窗口让新旧程序能先各自试跑，也保留一次真正可写的程序回退。

在 DBeaver 执行下面两条。迁移行应有非空完成时间，触发器行应为 `D`（disabled）。若没有行，先核对目标库、迁移执行结果与对象所属表。不要让每个服务在启动时重复跑迁移。

```sql
SELECT migration_name, finished_at, rolled_back_at FROM public._prisma_migrations
WHERE migration_name = '20261119010000_revision_intent_guard';
SELECT tgname, tgenabled FROM pg_trigger
WHERE tgrelid = 'public.capture_revisions'::regclass
  AND tgname = 'new_revision_intent_required';
```

## 78.3 先换 API，让旧标签页暴露问题

在 Debian 原生路线，把 A、B 放进不同只读 release 目录。保留第 70 章 API 单元的系统身份、工作目录和停止预算。保存 A 的 `ExecStart` 与配置来源；以独立端口启动候选 B 时，沿第 76 章候选单元的做法，先经私有通路测试。若要并行供流，确认两个进程共用同一会话和签名规则，核对连接总预算；在 D 阶段，送到 A 的旧写入仍可落库，不能宣布全站都已必填。

单实例练习安排短暂停写，先用 `systemctl cat epp72-api` 查看当前定义。第 70 章的 unit 把私有配置作为 Node 的 `--env-file` 参数。可用 `sudo systemctl edit epp72-api` 创建本次覆盖，将下面路径替换为恢复机实际已验的位置；第一行空的 ExecStart 清掉继承项。若该机改用 systemd 的 EnvironmentFile，按实际生效方式替换，核对没有两处同时给同名键赋值。

```ini
[Service]
ExecStart=
ExecStart=/opt/epp72/node/bin/node --env-file=/etc/epp72/api-B.env /opt/epp72/releases/B/dist/src/server.js
```

保留原来的覆盖内容与实际 A 路径供回退。先运行 `sudo systemd-analyze verify /etc/systemd/system/epp72-api.service`，再 `sudo systemctl daemon-reload`、`sudo systemctl restart epp72-api`。用 `systemctl show epp72-api -p MainPID -p ExecStart` 和 `sudo journalctl -u epp72-api --since "5 min ago"` 对上旧进程的停止、新 PID、实际路径和 `app.ready`。检查失败时保留旧目录与日志；已 reload 的定义需要改回并重新 reload 才能用于下一次启动。到原 HTTPS 入口读一笔旧素材，确认代理已经送到刚核对的进程。

保持旧 Firefox 标签页的登录，直接再点“创建本轮素材”。图中输入框里保留的是上一次成功的 ID；下方的 400 才是这一笔的结果。用 Network 确认旧请求省略了意图。此时库仍是 D，错误已经由 B 在写入前返回。

![旧交付页面再次创建素材，返回 400 INVALID_CAPTURE，输入框保留上一笔成功的 ID](images/old-browser.png)

再用 Postman 重发 78.1 保存的原键与原请求体，应仍得到 201 和**原来的 ID**；换一个新键、请求体保持原样，则得到 400。这个对照能区分“重放已提交结果”和“又写了一笔”。切到 B 页面，用同一个练习账号登录，填“说明哪里需要补充上下文”，点击创建，然后按 ID 读取。记下这笔新素材，下文称为 S。图中 `75238172…` 是实测那轮的 S，跟做时使用自己的完整 UUID。

![新交付页面按刚创建的素材 ID 读回原文和中文意图](images/new-browser.png)

**第一次回退在 D 阶段。** 保持当前库、受限登录和 HTTPS 来源，换回 A 的 release 与 API 入口，照前面的 verify、reload、restart 顺序执行。用仍有权限的会话读取 S，再向 `PATCH /captures/S` 发送 `{"chineseIntent":null}`。这次得到 200。用 78.1 的 SQL 查看 S，第 1 版保留刚填的意图，第 2 版为 NULL。这证明 A 既能读 B 创建的素材，也能按旧语义追加写入。接着把 API 恢复到 B，确认它可以读第 2 版，再处理仍然会清空意图的写入方。

## 78.4 接管到 Compose，先守住新写入，再补当前值

这轮从原生 B 接到容器 B，然后在同一个 Compose 项目演练第二次回退。若原本就在 Compose 上运行，两次回退也可全程在同一项目做；保持同一库、桶、域名和网页，两次只改 API 版本与所处的约束阶段。先保存实际部署定义、两份已验证镜像的 ID、平台和配置版本。把 A、B 两份服务配置放在恢复机各自的私有部署目录或版本文件里，B 的 API 要确实读到 required。邮件如有 unknown，仍保持停发。

沿用第 75 章的权威目录 `/opt/epp-container`（恢复机改过就换成实际目录）。在其中从当前 `compose.env` 复制两份**完整**项目配置 `compose-A.env`、`compose-B.env`，分别填入 A、B 的 `EPP_IMAGE`。核对其余独立参数，包括期望库名、S3 端点和桶。项目名与原服务保持一致。API 私有 bind 文件中的数据库连接和 `CAPTURE_INTENT_MODE` 与 Compose 用来解析镜像名的项目配置是两个入口。A 忽略新增的模式设置，两者可共用同一份已验的 B API 私有配置，保留现行凭据。

```bash
deploy=/opt/epp-container
dc() {
  sudo docker compose --project-directory "$deploy" \
    --env-file "$deploy/compose-$1.env" -f "$deploy/compose.yaml" "${@:2}"
}
dc B config --quiet
dc B config --images
```

对照 B 的交付记录。若是本地交付，先按第 72 章在**部署引擎** load，检查 `docker image inspect` 输出的 ID、OS 和架构；本地 ID 不能拿到仓库 pull。若本轮使用仓库的 `名称@sha256:…`，先 `dc B pull api` 并核验。B 已在原生端运行时，先停原生 API，等其排空、释放发布端口，再接管：

```bash
dc B up -d --no-deps --pull never --wait --wait-timeout 90 api
cid=$(dc B ps -q api)
sudo docker inspect --format '{{.Image}} {{.State.Health.Status}}' "$cid"
dc B logs --since 5m --tail 60 api
```

把 `.Image` 与交接记录中的实际镜像 ID 比较。在旧网页重发无意图的创建，仍应为 400；新网页应能读 S。健康探针只验证匿名请求，不能辨认哪版写入规则在生效。本轮先只切 API。若实际发布还要更新 Worker，通知按任务 ID 单独验收，邮件先对账，再决定是否定向启用。一次只更新选中的服务。[Compose 更新与等待](https://docs.docker.com/reference/cli/docker/compose/up/)

**把保护移入数据库。** 确认公开入口、仍在运行的 A、导入 CLI 和调度任务都不会再送入合法的空意图写入。以对象所有者从 B 的源码根连接练习库，在 psql 设置 `\set expected_db 实际恢复库名` 后执行 `\i examples/compatible-release/activate.sql`。里面改变状态的语句是：

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.capture_revisions ENABLE TRIGGER new_revision_intent_required;
COMMIT;
```

第 78.2 节的查询现在应返回 `O`，即普通应用会话的插入会执行该触发器。已有空修订原样可读，每一条新插入的修订都要过检查。这里的业务表对 API 开放 INSERT，API 没有直接 UPDATE 历史修订或关闭触发器的权限。管理员特权写入、禁用触发器的复制或恢复作业要按其自己的入口核验。如果 DDL 被未结束的写事务挡住，等锁超过两秒，事务就失败。先在 DBeaver 查持锁会话，等它完成或安排短窗口，再从新事务运行，重新读 D/O。可以用第二连接开始事务，执行 `LOCK TABLE public.capture_revisions IN ROW EXCLUSIVE MODE`，保持事务打开；第一连接运行激活脚本会在两秒后等锁失败，第二连接 ROLLBACK 后重试才会提交。没有成功提交时不要把交接记录改成 O。[PG18 触发器状态](https://www.postgresql.org/docs/18/catalog-pg-trigger.html) · [表锁的冲突关系](https://www.postgresql.org/docs/18/explicit-locking.html#LOCKING-TABLES)

还有一个问题：刚才旧 API 写下的第 2 版仍是 S 的当前值。要兑现“当前素材都已补齐”的承诺，必须另做一次数据核对。在 DBeaver 的同一发布库执行：

```sql
SELECT c.user_id, c.id AS capture_id, r.id AS expected_revision,
       r.revision_no, r.original_text
FROM public.captures c
LEFT JOIN LATERAL (
  SELECT id, revision_no, original_text, chinese_intent
  FROM public.capture_revisions WHERE capture_id = c.id
  ORDER BY revision_no DESC LIMIT 1
) r ON true
WHERE r.chinese_intent IS NULL
ORDER BY c.id;
```

这张结果只选每笔素材的当前版本，保留没有任何修订的异常行。无修订或已隔离的素材回第 66 章处置。其余各行让素材所有者按**这版原文**确认意图，保留用户、素材、修订 ID 与原始依据。没有来源就登记未解决；可以维持“新写入必填”，还不能宣布“全部当前素材已补齐”。

将已确认的一小批导入会话私有的 `ch78_approved` 表。表结构和执行入口在 B 的 `examples/compatible-release/README.md`。例如只练 S，在同一 DBeaver 编辑器执行建临时表语句，再用绑定参数写入一行：

```sql
INSERT INTO ch78_approved(user_id,capture_id,expected_revision,intent)
VALUES (CAST(:owner_id AS uuid), CAST(:capture_id AS uuid),
        CAST(:expected_revision AS uuid), :confirmed_intent);
```

保持这条连接打开。DBeaver 用同一编辑器执行 `backfill.sql` 中从 `WITH eligible` 到 `RETURNING` 的完整 SQL，在手动提交模式先核对当前库，设置两秒 `lock_timeout`（`SET LOCAL`），读返回行后提交；若使用 psql，从建临时表起就用同一 psql 会话，设置 `expected_db` 后运行整个脚本。临时表只在建它的连接里可见。

脚本每批选最多 100 条，核对归属、审批时的修订仍是最新、意图仍空，且案件没有隔离。它复制该版的原文、输入来源和片段，只把确认过的意图写入**下一版**。在检查和插入之间若别人抢先写入相同修订号，已有的 `UNIQUE(capture_id,revision_no)` 与 `ON CONFLICT … DO NOTHING` 让这笔跳过。连续分批直到没有新返回，再重跑当前值查询。要复现这个分岔，先留存两笔空意图各自的修订 ID。在回填前拿另一会话通过 PATCH 为其中一笔填写合法意图，再用原来的两条依据跑一批。只应看到另一笔的 ID；第一笔应保留用户亲自填的值。若用户已经改过原文，即使新版本意图仍空，旧审批也不能直接套用。[第 23A 节的条件回填](../../part-03-postgresql/chapter-23-migrations/side-01-resumable-backfills.md)

本轮收集了三条依据，故意先让一位用户自行填写。第一批只追加了另外两条，再跑返回零行；当前缺值查询也为零。S 的第 3 版带确认过的意图，第 2 版仍为 NULL。若把“历史中还有 NULL”当成发布失败，就会把正确保留下来的旧内容改坏。

## 78.5 第二次退回 A，还能救哪一种请求

入口先限于操作端，保持数据库 O 和原来的网页登录。在同一项目执行 `dc A up -d --no-deps --pull never --wait --wait-timeout 90 api`，重新 inspect 容器镜像。在 Postman 用同一用户对 **S** 重做第一次回退的操作：

| 请求 | A 在 D 阶段 | 同一个 A 在 O 阶段 |
| --- | --- | --- |
| GET S | 读到新版创建的素材 | 200，读到回填后的第 3 版 |
| PATCH S，`{"chineseIntent":null}` | 200，产生第 2 版 | 500，`INTERNAL_ERROR`，仍是第 3 版 |
| PATCH S，给合法意图 | 旧程序支持这条路径 | 200，出现第 4 版 |

为什么第二次是 500？A 本来允许清空，数据库现在在插入时拒绝；旧程序把这条存储错误包装成内部错误。它依然能启动、通过健康检查、读旧素材，也能写有效意图。先查失败请求对应的 API 日志，再查 PG 日志里的 `new revision requires chinese_intent`，并在 DBeaver 重跑 78.1 的 SQL。事务失败后没有半条修订。此时把全部客户端交给 A 会重新暴露 500；关闭触发器又会恢复空值写入。保持入口受限，换回已验的 B 更合适。

执行 `dc B up -d --no-deps --pull never --wait --wait-timeout 90 api`，核对实际镜像。若需要区分数据库故障与旧版处理错误，可在另一个回环端口短暂保留原生 A，沿 76.2 的候选通路将同一会话定向送到两版。本轮两版同时运行时，读取 S 都是 200；相同清空请求分别为 A 的 500 和 B 的 400。两条通路都查到这笔 S，差异来自处理写入的版本。验证后排空旁路 A，只留 B 对外。重发相同清空请求，B 应在写入前给 400；合法请求仍能成功。在新版网页点“按 ID 读取”。图中输入框保留上次输入，而结果行显示 A 刚写入的“有效旧请求”。这是同一笔 S 穿过两次回退后留下的数据。

![换回 B 后在 Firefox 读取同一素材，看见旧 API 成功提交的最后一版意图](images/after-rollback.png)

最后在**另一个空库**还原 78.1 保留的发布前归档，按 77.4 核对角色和目标。在 DBeaver 打开独立连接页，分别用旧素材 ID 与 S 查询 `captures`。旧 ID 在两边都存在，S 在发布库有一行、在备份恢复库为零行。若把正式入口直接切到这份旧备份，S 的四版工作都将消失。需要找回某个旧值时，保留当前写入，按 77A 在隔离副本提取已经核实的数据。

交班时写下**能执行的决定**。本轮结束留 B、required 和 O，S 的四版依次为“说明哪里需要补充上下文”、NULL、“本次演练由作者确认”、“有效旧请求”。旧程序能读，也能写非空意图，整批回退不能满足旧客户端清空的契约。保留发布前备份、当前数据和两份制品，记录实际摘要、迁移名、触发器状态、时间及仍暂停的 Worker。第 79 章拿走原主机以后，接手人可以用这些事实决定恢复哪份程序和哪段业务。

## 附录：本章必要技术点速查

| 回查位置 | 可据此判断的事情 |
| --- | --- |
| A、B 的原生 release 摘要或容器 `.Image` | 实际运行哪个构建；项目配置文件的镜像引用还要与运行实例核对 |
| B 的 `CAPTURE_INTENT_MODE` 与新、旧网页 | 谁在生成请求，哪个进程会在写入前拒绝空意图 |
| `_prisma_migrations` 与 `pg_trigger.tgenabled` | 迁移是否完成、普通写入是否已经受保护，两项分别读取 |
| 收据键、素材 ID、修订 ID 与修订号 | 区分重放旧结果、写出一条新修订，以及失败后完全没有写入 |
| `lock_timeout`、`RETURNING` 与最新修订查询 | 区分等待超时、真实追加的行和已过时的回填依据 |
| 发布前副本与发布库 | 对照同一业务 ID，量出整库恢复会丢弃的写入 |

[第 78 章配套完成代码](https://github.com/SamChowRock/epp-public/tree/part-09/chapter-78)

阅读约 35～48 分钟；已有可用恢复副本、受限角色和 HTTPS 入口时，构建、客户端验证、迁移与两轮回退另加 75～110 分钟，首次取得依赖及大归档传输按环境另计。

[上一章 · 备份与恢复](../chapter-77-backups/chapter.md) · [下一章 · 原主机失联后的恢复](../chapter-79-disaster-recovery/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
