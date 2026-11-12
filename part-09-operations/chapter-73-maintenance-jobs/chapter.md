# 第 73 章　定时维护漏跑或同时启动两次以后怎么办

一位用户连续换了两次头像。新图已经出现在个人资料里，旧图仍在桶中。第 60 章留下了一条清理命令。假设把它设为每分钟运行一次，18:11 恰好关机了。接班人需要补敲一次命令，还是先去数一数库里还有多少旧图？如果另一位同事也开始清理，两个人会碰到同一个对象吗？

沿用[上一章的 Linux 练习机与服务身份](../chapter-72-service-roles/chapter.md)，准备一份可改动的非空练习库、与它**成对复制**的私有桶，以及能在这个副本登录的旧账号。仅复制库、仍连着原桶，清理会删到原服务正在使用的字节。[第 62 章的交接实验](../../part-07-profiles/chapter-62-review/chapter.md)可以回查这个故障。下面的库名 `epp_ch73_handoff`、端点 `http://127.0.0.1:18633` 和桶名 `avatars` 是一组练习值，按自己的建库、端口转发和建桶记录替换。API、观察连接、调试进程和计时器都要到达这一对副本。从第 72 章继续使用原表、旧账号和请求集合，本章没有迁移。

## 73.1 把到期头像清理接入宿主调度

先取得两个可以认出来的对象。让副本上的 API 使用自己的工作目录、私有桶和数据库连接，用 Postman 的请求 05 登录，20 核对本人，15 取得本次会话的写令牌。在第 60 章集合的 25 选择 binary 文件 `harbor.png`、类型 `image/png`，发送并记下响应的 avatarId 为 P。再选 `harbor.jpg`，把 Content-Type 改成 `image/jpeg`，发送并记下 Q。两次均应返回 200。26 取得当前 Q 的短期地址，立刻另发 GET 读图。刚刚签发的链接过期时回到 26 重新签发。读到 Q 说明发布成功，还不能据此删 P。

在连接本轮库的 psql 中，将下列第一行的值换成 P 的完整 UUID。下面是配套 `examples/maintenance/preview.sql` 的只读查询，也可以在 DBeaver 的 SQL 编辑器把 `:'attempt_id'` 换成带单引号的 UUID 执行。把 ID 换成 Q，再查一遍。

```sql
\set attempt_id '替换为本轮的旧头像UUID'
SELECT w.id, w.state, w.check_after, (u.avatar_id IS NOT DISTINCT FROM w.id) AS current_avatar,
       (w.state IN ('writing','retired') AND w.check_after <= clock_timestamp()
        AND u.avatar_id IS DISTINCT FROM w.id) AS due
FROM public.avatar_writes w JOIN public.users u ON u.id=w.user_id
WHERE w.id=:'attempt_id'::uuid;
```

Q 一行应是 `live / current_avatar=t / due=f`。P 已经 `retired`，但刚被替换时 `due=f`。发布事务给已经签出去的旧地址留了 30 秒；在同一连接等过 P 的 check_after，重新执行查询，这次 P 才是 `due=t`。零行表示这个库里没有该写入 ID。先核对库与响应，别扩大筛选范围。读数只说明查询这一刻的资格，执行者领取时还要重查。

**让一次启动留下可以对账的结果。** 配套快照是 `part-09/chapter-73`。已有入口 `database/chapter-51/clean.mjs` 先比对独立传入的预期端点和桶，再连库执行 `SELECT current_database()`。这两项核对能挡住连错名字或拿错配置；在另一台机器上完全可以有同名库、同名桶，还要用旧账号、原收据和当前 Q 的实际字节核对副本身份。最后一个可选参数是具体的写入 ID，省去它时每轮最多认领 20 个。上一章的服务日志能找到进程，旧命令的汇总却不能回答“失败的是不是 P”。在 `src/avatar-cleanup.ts` 给原函数加一个可选的逐项回报，在原有两个分支产生结果。删除成功后先保存下次复查时刻，再报告成功。旧调用者仍能取得 `{ deleted, failed }`。

```ts
type ItemResult = { id: string; result: 'deleted-or-absent' }
  | { id: string; result: 'delete-failed'; reason: string };

// cleanAvatarBatch 在 attemptId 后增加 report?: (item: ItemResult) => void。
// 下面在原有的 for (const { id } of due.rows) 循环中。
try { await objects.remove(id); }
catch (error) {
  failed++;
  report?.({ id, result: 'delete-failed', reason: failureReason(error) });
  continue;
}
await client.query(`UPDATE public.avatar_writes SET check_after=clock_timestamp()+interval '1 day'
  WHERE id=$1 AND state='retired'`, [id]);
deleted++;
report?.({ id, result: 'deleted-or-absent' });
```

`failureReason` 只输出认识的错误类别。比如连接被拒时记 `ECONNREFUSED`，存储拒绝时记 `AccessDenied`，其他错误归入 `object-error`。原始 SDK 异常可能带有请求细节，排查一笔故障只需先知道 ID、失败在哪一步、该向谁取证。下面是这个函数。随后在 `clean.mjs` 的数据库核对回调里接上回报。

```ts
function failureReason(error: unknown): string {
  if (!(error instanceof Error)) return 'object-error';
  const code = 'code' in error ? error.code : error.name;
  if (typeof code === 'string' && [
    'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'TimeoutError',
    'AbortError', 'AccessDenied', 'NoSuchBucket', 'InvalidAccessKeyId', 'SignatureDoesNotMatch',
  ].includes(code)) return code;
  return 'object-error';
}
```

```js
const report = item => console.log(JSON.stringify(item));
report({ event: 'batch-start', database });
const { deleted, failed } = await cleanAvatarBatch(client, objects, attemptId, report);
report({ event: 'batch-end', deleted, failed });
// 保留原有汇总及退出状态
console.log('Deleted or already absent:', deleted, 'Failed:', failed);
if (failed) process.exitCode = 1;
```

从构建目录执行 `nvm use`、`npm ci`、`npm run ci:check`，确认改过的 TS 已经进入 dist。在目标机新建由 root 管理的 `/opt/epp73/release`，按[第 72 章的交付步骤](../chapter-72-service-roles/chapter.md#722-给每个进程独立的启动身份)放入这次的 dist、清单、锁文件、.npmrc 和按目标平台安装的生产依赖。这次还要从同一版源码按原相对路径带上 `database/chapter-51/clean.mjs` 及其直接导入的 `scripts/verify-database.mjs`。在只有 dist 的目录里运行前一条命令会找不到 .mjs 文件。生产 Node 可沿用 `/opt/epp72/node/bin/node`。

**用哪个账号删除？** 清理 SQL 需要读当前头像指针、锁住写入记录、修改两列。它不需要登录用户、读邮箱、改当前指针或在数据库中删除记录。在隔离实例上用管理员建立新的普通角色 `CREATE ROLE epp_cleanup LOGIN;`，用 psql 的 `\password epp_cleanup` 隐藏输入独立口令。连接本轮库，以有权授权的所有者执行下列 SQL。配套 `examples/maintenance/grants.sql` 先对照 `\set expected_db epp_ch73_handoff` 和实际库名，匹配后才在同一事务发放这些权限。

```sql
GRANT CONNECT ON DATABASE epp_ch73_handoff TO epp_cleanup;
GRANT USAGE ON SCHEMA public TO epp_cleanup;
GRANT SELECT (id,avatar_id) ON public.users TO epp_cleanup;
GRANT SELECT (id,user_id,state,check_after), UPDATE (state,check_after)
  ON public.avatar_writes TO epp_cleanup;
```

在 Linux 另建系统用户 `epp-cleanup`（`sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin epp-cleanup`）。创建 `/etc/epp73`，用上一章的受限文件安装方式保存 `cleanup.env`，属主 root、组 epp-cleanup、模式 0640。文件只包含 `DATABASE_URL`、`AVATAR_S3_ENDPOINT`、`AVATAR_S3_BUCKET`、`AVATAR_S3_ACCESS_KEY`、`AVATAR_S3_SECRET_KEY`。库连接使用新角色。对象身份单独签发：在第 60 章练习存储的私有 `s3.json` 的 identities 中追加与原身份格式相同的一项，保留原有凭据，使用新生成的 accessKey、secretKey 和 `["Write:avatars"]`；按原配置重启该**副本**，把新凭据写入 cleanup.env。这个练习存储的 Write 同时允许写入，若目标支持细分策略，只授予对应头像键前缀的 DeleteObject。用于核对对象是否存在的读凭据留在观察端。

先在目标机手动处置已预演的 P。把下面最后一个实参替换成实际 UUID；`env -i` 清掉 SSH 登录环境，`--env-file` 让 Node 只取这份配置。独立传入的三个目的地来自交接单。保留这一行命令，后面单笔排查还会用到。

```bash
cd /opt/epp73/release
sudo -u epp-cleanup env -i /opt/epp72/node/bin/node --env-file=/etc/epp73/cleanup.env \
  database/chapter-51/clean.mjs epp_ch73_handoff http://127.0.0.1:18633 avatars 本轮P的UUID
```

输出中找到 P 的 `deleted-or-absent` 和 `batch-end` 的 `deleted=1, failed=0`。在能访问**本轮桶**的配套目录，用原有的只读或 API 存储配置对 P、Q 分别运行 `node --env-file=.chapter51-store/app.env database/chapter-51/head-avatar.mjs 本轮UUID`。该练习桶对 P 返回 Not found，对 Q 返回 Present、类型和字节数。桶或身份错了也可能得到拒绝，403 不能当作对象已清走。再查 P 的数据库记录，它还在，check_after 移到了次日。第 60 章演示过一个已经在途的 PUT 可以晚于 DELETE 抵达；保留这行才能日后再扫。

**把手动命令交给宿主。** 在 `examples/maintenance/epp-avatar-clean.service` 写入如下内容。去掉末尾 P，宿主每次启动同一入口处理一批。TimeoutStartSec 限制整次启动，已有 S3 客户端另给每一笔 DELETE 最多 15 秒。一批有许多慢请求时，120 秒可能在最后一笔前就用完；届时以逐项记录和库内期限接班。

```ini
[Unit]
Description=Scan one batch of retired or abandoned EPP avatars

[Service]
Type=oneshot
User=epp-cleanup
Group=epp-cleanup
WorkingDirectory=/opt/epp73/release
EnvironmentFile=/etc/epp73/cleanup.env
ExecStart=/opt/epp72/node/bin/node database/chapter-51/clean.mjs epp_ch73_handoff http://127.0.0.1:18633 avatars
TimeoutStartSec=120s
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
```

`Type=oneshot` 让 systemd 等命令退出并记下结果。正常结束后 service 回到 inactive，下次才有新的启动机会。这里不开失败即重启。另一份同名 `epp-avatar-clean.timer` 决定何时再来；每分钟一次方便在练习机上观察整轮。

```ini
[Unit]
Description=Check EPP avatar cleanup every minute

[Timer]
OnCalendar=*-*-* *:*:00
AccuracySec=1s
Persistent=true

[Install]
WantedBy=timers.target
```

在部署端存放这两个文件的目录执行下列命令。核对 unit 中绝对路径与预期库、端点、桶之后再安装。`verify` 检查定义和可执行文件；`daemon-reload` 让管理器重读磁盘。先人工 start service 验证一次，与自动排期分开。

```bash
sudo install -m 0644 epp-avatar-clean.service epp-avatar-clean.timer /etc/systemd/system/
sudo systemd-analyze verify /etc/systemd/system/epp-avatar-clean.{service,timer}
sudo systemctl daemon-reload
sudo systemctl start epp-avatar-clean.service
systemctl show epp-avatar-clean.service -p ExecMainStartTimestamp -p ExecMainExitTimestamp -p Result -p ExecMainStatus
sudo journalctl -u epp-avatar-clean.service -n 35 --no-pager -o short-iso
sudo systemctl start epp-avatar-clean.timer
systemctl list-timers --all epp-avatar-clean.timer
```

`NEXT` 是下一次计划，`LAST` 是上一次计时器触发，手动 start service 不算作一次 timer 触发。等 LAST 出现，再对照 service 的开始、结束与该次日志。短命 service 退出且被管理器卸载后，show 的两个时间字段可能为空、Result 也可能回到默认值。按 journal 中同轮的 Starting、逐项输出和 Finished 或 Failed 找回实际起止时间。`AccuracySec=1s` 给宿主一个合并唤醒的窗口，依赖变慢还会影响真正完成的时间。若 service 启动就失败，从 journal 的第一处错误查运行用户、配置路径、数据库身份或端点；只有 `batch-start` 而缺 `batch-end` 时查看超时和进程退出原因。此时可以停下，留下 P、Q 和本次运行时间。

## 73.2 让主机错过一个触发时刻

先在操作端记下已经触发过的 LAST 与下一次 NEXT。在目标机用 `sudo systemctl stop epp-avatar-clean.timer` 停排期，然后查看 `systemctl is-active epp-avatar-clean.service`。若上一轮仍在执行，等它结束再留基线。保持 API 可用，连续两次发送请求 25，新版本替换旧版本，记下两个 ID。跨过刚才记下的 NEXT 和旧图的保护期，查 73.1 的单笔预演。即使没有清理进程，数据库时钟照走，旧图已经 `due=t`。

**现在还欠多少？** 在独立观察连接执行配套 `examples/maintenance/backlog.sql`。同一条语句使用同一个观察时点。`oldest_due` 是当前最早该检查的时刻，`due_now=0` 时它为空。把这一对值和刚才的单笔 ID 一起保存。如果已有历史淘汰项到期，读数可能比本轮新增数大。

```sql
SELECT count(*) AS due_now, min(w.check_after) AS oldest_due
FROM public.avatar_writes w
WHERE w.state IN ('writing','retired') AND w.check_after<=statement_timestamp()
  AND NOT EXISTS (SELECT FROM public.users u WHERE u.id=w.user_id AND u.avatar_id=w.id);
```

重新 `sudo systemctl start epp-avatar-clean.timer`。日历计时器开了 `Persistent=true`，并已有触发记录；停用期间只要错过至少一次，它重新激活时会安排一次补跑。用 `sudo journalctl -u epp-avatar-clean.service --since '10 minutes ago' -o short-iso` 对照恢复时刻，核对日志中该 ID 的结果，再查到期量。一次最多 20 笔，若有 21 笔，第一轮成功后还欠一笔。下一轮重新查当前状态，没有页码或 OFFSET；已处理的行因复查时间在未来而让出位置。如果连续几轮都处理了 20 笔，而最老到期项越来越老，说明现有节奏跟不上新增与复查的总量。先看每轮耗时、失败 ID 和剩余量，再决定缩短间隔或增加执行者。

![计时器主机关机前的计划、开机后两批日志以及按 21 个 ID 复核的结果](images/missed-timer.png)

**图 73-1**　同一轮 iTerm2 交接记录。调度主机关机前预计 18:11:00 再运行；关机时，独立的库和桶里准备了 21 个到期对象。开机接回依赖，18:11:20 激活计时器，第一批处理 20 个，18:12:00 的第二批处理 1 个。最下面用停机期间保存的 21 个 UUID 回查，剩余到期数为 0。按上面的停 timer 做法也能观察停用窗口。若要在独立练习机验证关机，先留存上次与下次时刻，把库、桶留在另一台可达的练习机；或在关机前准备好将在关机期间到期的旧版本。开机后先接好依赖再手动启动 timer。本章练习只 start；需要随系统开机自动激活时，对 timer 执行 `sudo systemctl enable --now epp-avatar-clean.timer`。

换一个要求试试。财务要求按上海业务日每天留一份报表。周五关机、周一恢复，一次补唤醒怎么知道还欠周六和周日？头像任务可以从当前行重新算出该做什么。日报需要保存“哪一天已经交付”的事实：以业务时区切出应交付且已结束的日期，与按 `(report_type, business_date)` 唯一记录的已完成日期求差。周一早晨应处理差集中的周六、周日；周五是否在差集中取决于其报表是否已交付。每个日期使用相同的交付键重试，产物可确认、记录可补登；若邮件发送已发生却没记账，还须核实发送结果。只记最新一次成功的时间，中间缺的一天就可能永远看不出来。

## 73.3 两个执行者同时工作时认出谁已占用

如果同一个 service 正在运行，timer 再次到点，systemd 会让这一次继续执行。可还有第二种入口：同事在另一个终端直接运行 Node，或者另一台主机也接到了同一套库和桶。两个独立进程都能来到 SQL 这一行。只在宿主上查一个 PID，无法判断另一端是否正在动 P。

回看 `src/avatar-cleanup.ts` 的第一条语句。先找出行锁什么时候释放，再看下一位会用哪一列判断资格。

```sql
WITH due AS (
  SELECT w.id FROM public.avatar_writes w WHERE w.state IN ('writing','retired')
    AND ($1::uuid IS NULL OR w.id=$1::uuid)
    AND w.check_after<=clock_timestamp()
    AND NOT EXISTS (SELECT FROM public.users u WHERE u.id=w.user_id AND u.avatar_id=w.id)
  ORDER BY w.check_after,w.id LIMIT 20 FOR UPDATE OF w SKIP LOCKED
) UPDATE public.avatar_writes w SET state='retired',check_after=clock_timestamp()+interval '5 minutes'
  FROM due WHERE w.id=due.id RETURNING w.id;
```

两人同时选到同一行时，先取得行锁的人可以更新它，`SKIP LOCKED` 让另一人绕过尚未释放的锁去挑别的候选。正式入口使用自动提交连接，这条语句一结束，行锁就释放了。之后即使第一个人停在发 DELETE 之前，第二个人仍会跳过这行，因为已提交的 check_after 在五分钟以后。把 writing 改为 retired 还撤销了旧上传的发布资格。不能把这里包进一个覆盖整轮 S3 请求的大事务：另一连接看不到已经生效的资格变化，而且数据库回滚也收不回一个已经发出的 DELETE。

先停 timer，等已有 service 退出。用同一练习账号再发三次 25，分别记作 A、B、C。C 当前可读；A、B 被替换，等到单笔预演都显示到期。**第一人只指定 A**，否则他可能一口气领走 A 和 B，第二人就没有另一笔可做。下面在目标机的三个 iTerm2 SSH 页操作。第一、二页连接同一主机，练习调试端口只监听该机回环。先在第一页进入交付目录，看编译后删除调用在哪一行，再用与手动处置相同的环境启动进程。

```bash
cd /opt/epp73/release
grep -n 'await objects.remove(id)' dist/src/avatar-cleanup.js
sudo -u epp-cleanup env -i /opt/epp72/node/bin/node --inspect-brk=127.0.0.1:19273 \
  --env-file=/etc/epp73/cleanup.env database/chapter-51/clean.mjs \
  epp_ch73_handoff http://127.0.0.1:18633 avatars 本轮A的UUID
```

`--inspect-brk` 使进程在开始时等待调试器。第二页运行 `/opt/epp72/node/bin/node inspect 127.0.0.1:19273`。在 `debug>` 输入 `sb('dist/src/avatar-cleanup.js', 27)`，把 27 换成上一条 grep 输出的实际行号。文件若还没加载，调试器会先提示未加载。输入 `cont`，等箭头真正指到 `await objects.remove(id)` 才停手。此时数据库已经提交领取，S3 调用尚未发出。若进程直接结束，先检查选中的 A 是否已经被其他调度领取、是否真的到期，以及断点是否设在这次构建的 JS 文件中。

第三页用 73.1 的正式单笔命令再传 A，预期 `deleted=0, failed=0`；再传 B，预期 B 被处置一笔。用观察身份在配套目录分别做 HEAD：A 还在，B 已经不可见，C 仍可读。SQL 中 A 的 check_after 距领取约五分钟，B 的新时刻在次日，C 始终是 live。在下面这次停顿中，第二个执行者先查 A，随后由 service 开一轮批处理找到 B，按同一对 ID 核对即可。表本身没有保存执行者编号；仅看未来的 check_after，不能断言某个特定进程仍在工作。

![两个进程操作同一个与另一个头像时的回执、数据库期限和对象实读](images/overlap.png)

**图 73-2**　A 的 ID 以 `d0f8551c` 开头。第二次查 A 时领取数为零，另一个到期对象 B 已返回成功。库里 A 的下次检查是当天 18:13:29，B 的是次日。最后一行用独立的读身份实际取得 A 的 2056 字节。看到 A 的状态已经是 retired，并不能据此报告“对象已经消失”。

保持第一页暂停，等过 A 的 check_after，第三页重新查到 `due=t`，再用正式命令单独处置 A。它这次得到 1，实际 HEAD 应显示 A 不在了。回到第二页输入 `cont` 恢复第一人，结束后若目标在等待调试器断开，输入 `.exit` 或按 Ctrl-D 离开调试器。第一人仍可能也报 `deleted-or-absent`：他没有被收回发送请求的能力，两个 DELETE 对准的是同一个不可复用的版本键。在本练习的无版本桶，最终 A 不存在、C 可读是正确结果。把两份成功日志相加推算“删除了两个文件”，会多算一份。较晚的更新还会重设次日的检查时间。若改成版本化桶，按键删除可能留下 delete marker；若改成扣款或发送邮件，还要有对端的幂等键或第 53 章的未知结果处置，短期占用本身做不到一次生效。

**换成整轮只能有一个执行者。** 假设任务改为用同一个临时文件名重建索引，不同批次也不能同时写。此时可以先在一条专用 PostgreSQL 连接取得会话级咨询锁，约定同一数据库里的所有入口使用同一个键。取不到就记录“已有执行者”并结束该轮。下面用两个独立 psql 连接到同一练习库，亲手验证接手条件。

```sql
-- 连接一，保持连接打开
SELECT pg_try_advisory_lock(73,1);
-- 连接二，在连接一仍打开时执行一次
SELECT pg_try_advisory_lock(73,1);
```

第一人得到 t，第二人得到 f。在第一页 psql 输入 `\q` 关闭连接，再在第二页执行同一句，得到 t，最后 `SELECT pg_advisory_unlock(73,1);`。键里的两个整数是本系统为该任务保留的约定；不同任务要协调分配。会话锁跨越单条 SQL 的提交，锁连接应由任务独占并活到末尾，勿加锁就还给连接池。如果连接丢失，旧执行者必须停止后续工作；已经发出去的外部请求仍需靠幂等或目标端拒绝过期执行者来兜住。头像的键可以分别处理，主线保留逐项领取。

## 73.4 根据业务进度恢复调度

第三种接班记录更容易误判。对象端点刚恢复，值班者立刻启动清理，退出码是 0，到期计数也是 0。他现在能关闭故障吗？先追那笔失败的 ID。

1. 保持 timer 停用。按 73.1 再发布两版头像，记旧版为 F，新版为 G。等 F 的单笔预演为 `due=t`，用观察身份做 HEAD，记录 F、G 都在。若要归因到单笔，先查 backlog，记下其他到期项；批处理可能同时处理它们。
2. 只让清理进程到对象端点的连接失败，保持 PostgreSQL 在线。若用第 71 章的独立 S3 转发，关闭**只承载 S3** 的那条连接。若用直接运行的专用 SeaweedFS 副本，在启动它的终端按 Ctrl-C 并等进程退出；记下原启动目录和配置。此时不要再发布，保持 G 的指针不动。
3. 在 Linux 运行 `sudo systemctl start epp-avatar-clean.service`。这次 start 失败。执行下列两条命令，先从 `Result` 与 `ExecMainStatus` 看完成方式，再从日志找 F 和失败原因。先留这轮记录再启动下一次，show 展示的状态会随下一次启动改变。用 73.1 的预演重新查 F，check_after 已前移约五分钟，暂时 `due=f`。本轮若只领 F，汇总是 `deleted=0, failed=1`；查到期量却可以是零。
4. 从原目录启动同一份存储或恢复原转发，核对桶身份。在五分钟内再手动 start 一次，F 还不在扫描范围。让观察者重新 HEAD：若刚才的连接确实在发出 DELETE 前即被拒，F 此刻仍在。若失败属于请求发出后的连接中断，结果可能未知，先按 ID 实读。不要为得到绿色日志手工提前改期限。
5. 重新 `sudo systemctl start epp-avatar-clean.timer`，让下一次到期后的排期处理它，或等到 F 再次 `due=t` 后手动 start service。找**同一个 F**的新成功条目，再从独立读端核对 F 不可见、G 仍可读、库里当前指针仍是 G，F 已排到次日。只有这时，才有这笔欠账已处置的证据。

```bash
systemctl show epp-avatar-clean.service -p Result -p ExecMainStatus -p ExecMainExitTimestamp
sudo journalctl -u epp-avatar-clean.service --since '20 minutes ago' --no-pager -o short-iso
```

![对象连接失败与恢复后同一 ID 的运行日志、实际 GET 和数据库积压](images/endpoint-recovery.png)

**图 73-3**　失败轮的 F 以 `02bd91c1` 开头，原因是连接被拒，汇总 failed=1。恢复端点、等到该行可领取后，同一 ID 出现在成功轮。四次实际 GET 中，三个当前头像返回 200，F 返回 404；最后的查询才读到到期量为零。404 后面的字节数是存储的错误响应体长度。

**交接要留下什么？** 把最后一次完整成功的结束时间、当前到期数和最老到期时刻、最近失败的时间／ID／原因放在一起。用下面两条读取命令留存最近的完成与失败线索。第一条取末条零失败汇总，第二条取末条对象错误；若日志已经轮转，扩大保留窗口或查交接记录。按时间和进程号回看同一轮的退出结果，再看最后一次有逐项成功的记录。发生中途超时，可能只留开头和部分 ID，此时从管理器取 `Result=timeout` 并回库逐笔查。对象不断失败时，每次刚把 check_after 推后，最老到期项就可能暂时为空。对每笔曾失败的 ID 保留待核实状态，直到找到同一 ID 的成功处置；同时观察错误是否反复出现。库中 check_after 同时表达保护期、短期占用和次日复查，无法单独还原完整的运行历史。

```bash
sudo journalctl -u epp-avatar-clean.service -o short-iso --no-pager --grep='"event":"batch-end".*"failed":0' -n 1
sudo journalctl -u epp-avatar-clean.service -o short-iso --no-pager --grep='"result":"delete-failed"' -n 1
```

图 73-1 的交班可以写“错过 18:11 分的排期，21 个已知到期 ID 分两批接回，当前剩 0”。图 73-2 的交班应写“同一 ID 在占用期过后被再次处置，按对象键复查”，保留两个进程各自的开始、结束和结果。若 journal 只保存在内存里，重启前先把这段脱敏运行记录留到交接处，或接入有保留期的持久日志；timer 的磁盘时间戳只够回答它有没有被唤醒。后面换容器外部调度器，这两种交班仍然要说清。

练习结束，在专用目标上执行 `sudo systemctl stop epp-avatar-clean.timer`，若启用过开机激活，用 `sudo systemctl disable --now epp-avatar-clean.timer`。确认 service 已退出，并保存旧对象、当前指针与这次的运行记录。下一章会移动工作目录、账号与端口，继续用这些业务结果识别交付目标。

## 附录：本章必要技术点速查

| 手上的读数 | 能据此作出的判断 |
| --- | --- |
| timer 的 NEXT、LAST | 可查计划与触发；实际运行结果要回到同名 service 的日志与退出状态 |
| 指定 ID 的 due | 这行在观察时刻能否领取；下一位执行者会在数据库里重查 |
| 一轮成功 20 笔 | 已达到该轮批量上限；查到期量、最老到期时刻及下一轮 |
| 同一键两份 deleted-or-absent | 对无版本练习桶回查这个键，再核对当前引用；成功次数不能换算成原先存在的对象数 |
| 失败后立即扫到零笔 | 先查失败 ID 的 check_after，过了该时刻再取证 |
| 会话咨询锁 | 同库、同键、合作入口、专用连接持有期间互斥；断开会释放锁 |

计时与补跑语义见 [Debian 13 的 systemd.timer(5)](https://manpages.debian.org/trixie/systemd/systemd.timer.5.en.html)。行锁与会话级咨询锁见 [PostgreSQL 18 锁文档](https://www.postgresql.org/docs/18/explicit-locking.html)。按键删除随桶版本配置变化的行为见 [S3 DeleteObject](https://docs.aws.amazon.com/AmazonS3/latest/API/API_DeleteObject.html)。

按四节 SQL、两份 unit、三幅运行现场估计，阅读约 30～40 分钟。已有 Linux 练习机、可登录的副本和配对桶时，配置、断点、五分钟等待与恢复另加 50～75 分钟；首次复制环境和可选的整机关机演练另计。

[配套起点 · 第 70 章](https://github.com/SamChowRock/epp-public/tree/part-09/chapter-70) · [上一章 · 为 API、邮件和通知进程分别分配运行权限](../chapter-72-service-roles/chapter.md) · [下一章 · 运行环境变了，怎样交付同一份服务](../chapter-74-portable-release/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
