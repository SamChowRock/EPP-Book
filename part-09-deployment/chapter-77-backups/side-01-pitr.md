# 支线 77A　回到误操作之前，再把一条业务记录修回现在

第 77 章已经能把逻辑备份和对象副本一起恢复。现在有两笔事情先后发生。管理员改坏了素材 A 的一版正文，稍后另一位用户给素材 B 加了一版好内容。昨晚导出的库缺少两笔之间的进度；把整库切回事故前也会丢掉 B。我们需要一份能读到事故前状态的副本，然后决定从中取回什么。

## 77A.1 留一份可以继续重放的基础备份

PostgreSQL 把修改过的数据页写回磁盘前，先把对应的 WAL 记录持久化。物理基础备份提供整套集群的起点，连续 WAL 提供从这个起点向前重放的顺序。逻辑导出的 SQL 与行没有物理页的位置，不能作为重放起点。准备[同一版本的 PG18 服务端工具](../../environment-setup.md#为隔离恢复演练准备-postgresql-18)。以下为同一台数据库主机上运行的隔离实验，使用数据库进程的操作系统用户。选择无自定义表空间、无指向外部数据目录的符号链接、没有待恢复配置的一份**已正常停机的非空练习集群**。一律在它的新副本上工作，原数据目录和正常服务不参与这次事故。

先在原练习实例停机前记录 `SHOW config_file`、`SHOW hba_file`、`SHOW data_directory`。第 69 章的 Debian `pg_createcluster` 通常把配置放在 `/etc/postgresql/18/epp`，单独复制数据目录会缺配置；若把含绝对 `data_directory` 的原配置原样带入，`-D` 指向副本时也可能打开原库。对这种布局，可从 77.2 的非空逻辑归档先建一套自包含的练习源。用数据库系统用户的 Bash，在没有空格的私有临时目录执行下面几步。把 `dump` 设为该用户可读的归档绝对路径（必要时把归档单独交到它的私有目录），PG18 的 bin 已在 PATH。新集群用本机同名角色的 peer 认证，套接字仅该用户可进入。

```bash
umask 077
prep=$(mktemp -d /tmp/epp77-seed.XXXXXX) || exit 1
source_data=$prep/data
mkdir "$prep/socket" || exit 1
initdb -D "$source_data" --auth-local=peer --auth-host=scram-sha-256 || exit 1
export PGHOST="$prep/socket" PGPORT=55482 PGUSER="$(id -un)" PGDATABASE=epp_pitr
pg_ctl -D "$source_data" -l "$prep/start.log" -o "-h '' -k $PGHOST -p $PGPORT" -w start || exit 1
createdb "$PGDATABASE" &&
  pg_restore --single-transaction --no-owner --no-privileges -d "$PGDATABASE" "$dump"
restore_rc=$?
pg_ctl -D "$source_data" -m fast -w stop || exit 1
test "$restore_rc" -eq 0 || exit 1
```

该练习源专供后面的 SQL 修复路径。若已有自包含的停机练习集群，可直接使用；先确认它的配置、include、认证文件及 `postgresql.auto.conf` 没有继续借用生产路径或外部归档、复制、日志设置。在 Bash 设置 `source_data` 为停机目录、`PGUSER` 为该集群的练习管理员、`PGDATABASE` 为其中的 EPP 库。用独立的私有 Unix 套接字，表明下面每条命令要去哪一台实例。临时目录使用没有空格或引号的绝对路径；源、基础备份、两份恢复目录及 WAL 都需预留空间。

```bash
umask 077
lab=$(mktemp -d /tmp/epp77.XXXXXX) || exit 1
mkdir "$lab/wal" "$lab/source-sock" "$lab/read-sock" || exit 1
test -n "${source_data:-}" && test ! -L "$source_data" && test -s "$source_data/PG_VERSION" &&
  test ! -e "$source_data/postmaster.pid" && cp -R "$source_data" "$lab/primary" || exit 1

check_copy() (
  test ! -L "$1" || exit 1
  expected=$(cd -P -- "$1" && pwd -P) || exit 1
  configured=$(postgres -D "$1" -C data_directory) || exit 1
  actual=$(cd -P -- "$configured" && pwd -P) || exit 1
  if [ "$actual" != "$expected" ]; then
    printf '拒绝启动：期望 %s，配置实际指向 %s\n' "$expected" "$actual" >&2
    exit 1
  fi
)
check_copy "$lab/primary" || exit 1
export PGHOST="$lab/source-sock" PGPORT=55483 PGUSER PGDATABASE
pg_ctl -D "$lab/primary" -l "$lab/source.log" -o "-h '' -p 55483 -k $PGHOST -c wal_level=replica -c archive_mode=on -c archive_command='test ! -f $lab/wal/%f && cp %p $lab/wal/%f'" -w start
psql -Xc 'SELECT current_database(),current_setting($$data_directory$$),system_identifier FROM pg_control_system()'
psql -Xc 'SELECT timeline_id FROM pg_control_checkpoint()'
pg_basebackup -D "$lab/base" -X stream -c fast
pg_verifybackup "$lab/base"
```

启动前的 `postgres -C` 读取有效配置后退出。这里每次启动都使用相同的 `-D`，后面的启动参数只调整监听、归档或重放，不另行指定配置文件或数据目录；如果更改这两项，预检也要使用同样的参数。遇到缺配置或目录不符就回到上述独立练习源。启动后再确认数据目录正是 primary，记录系统标识和时间线。复制命令只适用于本练习新建的空归档目录；磁盘写满或目标重名会使归档命令失败，应查服务端日志及 pg_stat_archiver。放在同一块盘上便于练习漏段，正式恢复所需备份及 WAL 还须能在失去原机后取得。pg_basebackup 在干净目录取得基础备份，额外流式连接补齐备份期间的一致性所需 WAL；若连接被拒，检查练习管理员的复制权限、该 socket 的 replication 认证规则及可用 WAL sender。pg_verifybackup 检查清单及备份所需段，把成功输出、起止 WAL 范围（backup_manifest 的 WAL-Ranges）、起止时间和归档位置留下。它还不能回答明天有没有漏一段。[PG18 连续归档与时间点恢复](https://www.postgresql.org/docs/18/continuous-archiving.html)

优先从前章交接的旧账号中选两个已有素材 A、B。如果在基础备份之后才创建样本，必须在命名点之前提交两笔，且保留从备份到目标的全部 WAL。观察连接可用 DBeaver 的既有受限通路或本例的 psql。用两笔素材 ID 分别查下面的 SQL，记下用户、最新修订 UUID、号码及正文；`a` 为本轮 A 的素材 UUID，用 psql 的 `\set a 实际UUID` 设置。素材详情读的是最新修订，单改父表可能完全看不见故障。

```sql
SELECT c.user_id,r.id,r.revision_no,r.original_text
FROM public.captures c JOIN public.capture_revisions r ON r.capture_id=c.id
WHERE c.id=:'a'::uuid ORDER BY r.revision_no DESC LIMIT 1;
```

## 77A.2 停在事故前，验证少一段会怎样

先切换 WAL，使目标位于基础备份之外的新段。在源库管理员 psql 自动提交模式下执行；名字每轮唯一，下面的重放目标也使用同名。备份结束、创建恢复点、误改 A、B 的合法写入须依次完成。

```sql
SELECT pg_switch_wal();
SELECT clock_timestamp(), pg_create_restore_point('before_83a_1') AS target_lsn \gset
SELECT :'target_lsn' AS target_lsn, pg_walfile_name(:'target_lsn'::pg_lsn) AS segment;
```

在此 psql 将 `rev` 设为 A 刚才读到的最新修订 UUID。用 `UPDATE public.capture_revisions SET original_text='PITR-83-bad' WHERE id=:'rev'::uuid AND capture_id=:'a'::uuid RETURNING id,revision_no;` 制造一行误改；仅限源副本。用现有素材修订请求 `POST /captures/B的ID/revisions` 在 B 追加可辨认的一版。上面的源副本只监听私有 Unix 套接字。选 HTTP 路径时，应在同机运行能通过该 socket 登录的练习 API，或单独给源副本开受密码认证保护的回环监听，并让 API 经既有 SSH 转发只到这个监听。重查运行身份、库与两笔 ID 后再继续。纯 socket 路径则在源库执行下面的等价数据夹具，实际 HTTP 验收留给有隔离 API 的路径。将 `b` 设为 B 的 UUID。核对返回的新 ID、新号码。

```sql
INSERT INTO public.capture_revisions(id,capture_id,revision_no,original_text,chinese_intent,input_source,chunks)
SELECT gen_random_uuid(),capture_id,revision_no+1,'PITR-83-new',chinese_intent,input_source,chunks
FROM public.capture_revisions WHERE capture_id=:'b'::uuid ORDER BY revision_no DESC LIMIT 1
RETURNING id,revision_no;
```

再次 `SELECT pg_switch_wal();`，等上面查到的目标段出现在 wal 目录，且 pg_stat_archiver 报告该段或更晚段已归档、无本轮新错误。把完整段名抄到 Shell 变量 `segment`。在新的 gap 目录复制归档文件，故意略过这一段。原归档保留完整，两个候选分别从原始 base 起步。

```bash
test -s "$lab/wal/$segment" || exit 1
mkdir "$lab/gap"
for f in "$lab"/wal/*; do
  if [ "${f##*/}" != "$segment" ]; then cp "$f" "$lab/gap/"; fi
done
recover_copy() (
  set -eu
  dest=$1 archive=$2
  test ! -e "$dest"
  cp -R "$lab/base" "$dest"
  check_copy "$dest" || exit 1
  touch "$dest/recovery.signal"
  pg_ctl -D "$dest" -l "$dest/run.log" -o "-h '' -p 55484 -k $lab/read-sock -c archive_mode=off -c hot_standby=on -c restore_command='cp $archive/%f %p' -c recovery_target_name=before_83a_1 -c recovery_target_action=pause" -W start
)
recover_copy "$lab/broken" "$lab/gap"
```

-W 只发起启动。在 broken/run.log 中看重放走到什么位置。若出现 `recovery ended before configured recovery target was reached`，进程最终应已退出；仅看到探测历史文件失败的 cp 提示还不能断言恢复失败。核对对照库未占用 read-sock 后换回完整归档，重做一次：

```bash
recover_copy "$lab/restore" "$lab/wal"
# 等 run.log 报告在命名恢复点暂停，再读取这一个实例
PGHOST="$lab/read-sock" PGPORT=55484 psql -Xc 'SELECT pg_is_in_recovery(),pg_get_wal_replay_pause_state(),pg_last_wal_replay_lsn()'
```

在恢复端看到 t、paused，用日志中的恢复点名称和 LSN 对照源端记录，再查 A、B。恢复副本应有原 A，且没有 B 在事故后新增的修订。源库两处正好相反。若时间线、业务值或暂停点对不上，保留日志，回到基础备份重新选目标。不要提升或恢复重放这个读副本，不给它接邮件、写 API、清理计时器或可写桶。

## 77A.3 只修 A，给正在发生的新写入留位置

A 的历史修订 ID 仍在，故障只改坏了其中一个字段。按旧 ID 修同一个字段既保留引用该修订的候选，又能保持 B 的新内容。若事故是删除整行、引发级联或还有别的字段被改，应先查全相依关系，再另拟修复事务。练习先从只读副本导出 A 的所有者、素材 ID、修订 ID、序号与旧正文。Shell 进入 `cd "$lab"`，用 `PGHOST="$lab/read-sock" PGPORT=55484 psql -X`，重新设置 `rev` 后执行。指定客户端私有文件，CSV 可保留正文里的引号和换行。

```sql
COPY (SELECT c.user_id,r.capture_id,r.id,r.revision_no,r.original_text
      FROM public.captures c JOIN public.capture_revisions r ON r.capture_id=c.id
      WHERE r.id=:'rev'::uuid) TO STDOUT WITH (FORMAT csv)
\g saved.csv
```

确认 COPY 1，退出该连接。在同一目录运行 `psql -X`，它从 Shell 环境连回源副本。先执行 `\conninfo` 和 `SHOW data_directory`；核对当前损坏值和 B 的新修订，另存修前读数。生产中的修复需选维护窗口；本例用短暂表锁避免预览、修复之间有人追加 A 的修订，此锁会暂时阻塞**其他素材**的修订写入。两秒取不到就回滚，重新安排。设定损坏值、所有者、两层 ID、版本号，拒绝跨用户或覆盖已经继续编辑的 A。

```sql
BEGIN;
SET LOCAL lock_timeout='2s';
CREATE TEMP TABLE wanted(user_id uuid,capture_id uuid,id uuid PRIMARY KEY,
  revision_no int,original_text text) ON COMMIT DROP;
\copy wanted FROM 'saved.csv' CSV
LOCK TABLE public.capture_revisions IN SHARE ROW EXCLUSIVE MODE;
CREATE TEMP VIEW repairable AS
SELECT r.id,w.original_text FROM public.capture_revisions r
JOIN wanted w ON r.id=w.id AND r.capture_id=w.capture_id AND r.revision_no=w.revision_no
JOIN public.captures c ON c.id=w.capture_id AND c.user_id=w.user_id
WHERE r.original_text='PITR-83-bad' AND r.original_text IS DISTINCT FROM w.original_text
AND NOT EXISTS (SELECT FROM public.capture_revisions later
                WHERE later.capture_id=r.capture_id AND later.revision_no>r.revision_no);
SELECT id FROM repairable;
```

预览只应有 A 的一个 ID。结果为空时检查是否已经修复、用户又编辑了一版或目标库错误，有其他差异先 ROLLBACK。若预览正合预期，在**同一事务**继续：

```sql
UPDATE public.capture_revisions r SET original_text=v.original_text
FROM repairable v WHERE r.id=v.id RETURNING r.id,r.revision_no;
DROP VIEW repairable;
COMMIT;
```

保留返回的一行、修前值、修复来源和本次操作时间。用相同输入再预览应为零，执行 ROLLBACK 释放锁。若 A 已被继续编辑，只能把旧内容交给当前所有者比较合并。

## 77A.4 让今天的业务继续工作

在当前源副本按 A、B 分别查最新修订。A 的正文恢复，B 后加的那版仍在。接有隔离 API 时用两个素材各自的原用户读取详情和修订历史，再用另一名用户的会话读 A，仍应按原契约返回 404。恢复副本里不存在 B 的新版本，这就是不能用整库覆盖当前库的具体损失。本轮 PG18 的数据库对照中，漏段实例未到达目标，完整实例在命名点暂停；修复第一次命中一行，重复条件命中零行，B 的新修订仍为一行。

若受损的是头像，WAL 只能重放数据库指针。还须从配对对象备份按历史键取回字节并核对摘要；外部收件人已经收到的邮件也不会因为回放数据库消失。交接时写明最后已验证的可恢复点、漏段所在位置、启动至可读耗时与两笔业务 ID。关闭两套临时实例并按约定保管基础备份、归档和含私有正文的 CSV。

```bash
pg_ctl -D "$lab/restore" -m fast -w stop
pg_ctl -D "$lab/primary" -m fast -w stop
```

## 回查恢复点与局部修复

| 现场读数 | 决定下一步的证据 |
| --- | --- |
| pg_verifybackup 成功 | 基础备份一致；另查基础备份结束后到目标的 WAL 是否连续 |
| missing file 或连接一度可读 | 对照服务端是否到达命名点、最终进程状态、暂停状态和业务前后值 |
| 系统标识相同、LSN 相近 | 还要匹配时间线，确认归档属于本次恢复历史 |
| 定向修复预览零行 | 查当前所有者、最新版本、现值与锁，决定结束或人工合并 |
| 库中有旧头像键 | 按同一恢复点的桶清单检查历史字节、实际读数与摘要 |

阅读约 15～25 分钟，已有停机练习集群与两个素材时，备份、两轮恢复和定向修复另加 35～60 分钟；从逻辑归档先制备独立练习源另计。数据量与备份介质影响实际时长。

[返回第 77 章](chapter.md) · [本篇导读](../README.md)
