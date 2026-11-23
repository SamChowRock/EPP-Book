# 支线35A 写入不能停时，索引怎样交付

假设采纳接口持续有人使用。运维允许你在白天建索引，但用户不能等半小时才能提交一次采纳。主线的普通 CREATE INDEX 需要与写入互斥的表锁。锁是数据库对同时访问同一对象的操作所做的协调。哪怕访问的不是同一条学习记录，写入表和构建普通索引这两种操作也会冲突。表很小时构建可能瞬间结束；库变大以后，同样的 SQL 会让写请求长时间排队。把应用的超时调长，等候成本就落到了更多用户身上。

为什么需要协调？想象构建程序刚扫过某一页，另一个事务又把一条记录写进那一页。如果只扫一遍就宣布完成，新索引可能永久漏掉这条已提交的记录。主线选择停写换来简单的建造过程。若要一边写一边建，数据库就得额外处理这段时间出现的变化。PostgreSQL 提供 `CREATE INDEX CONCURRENTLY`。这里 concurrently 指构建时允许普通增删改继续。数据库分阶段登记索引、扫描数据、等待相关事务并再次核对，在能为查询提供完整结果后才把它标为有效。

因此“命令开始了”“索引已有名字”“规划器可以选它”是三个不同的观察点。假设发布进程中断，重连 DBeaver，在目标库执行下面的只读查询。把名字换成本次实际构建的对象：

```sql
SELECT c.relname, i.indisready, i.indisvalid, pg_get_indexdef(c.oid)
FROM pg_index AS i
JOIN pg_class AS c ON c.oid = i.indexrelid
WHERE c.oid = to_regclass('public.learning_records_user_feed_idx');
```

无行表示当前库没有这个名字的索引。`indisready` 说明写入路径是否已开始维护它，`indisvalid` 说明规划器能否依赖它来读取完整结果。若对象存在却无效，它可能仍消耗写入资源，而列表依旧走旧计划。读完标志，再对照实际列序、排序方向、构建进程和迁移记录。只给重试命令加 `IF NOT EXISTS` 会按名称跳过对象，不能证明现有对象定义正确或已经可用。[PostgreSQL 的 pg_index 字段](https://www.postgresql.org/docs/18/catalog-pg-index.html)

要决定是继续等还是安排恢复，可以从另一个连接查看正在进行的构建：

```sql
SELECT pid, phase, lockers_total, lockers_done, blocks_total, blocks_done
FROM pg_stat_progress_create_index
WHERE relid = 'public.learning_records'::regclass;
```

先看 phase，再读对应的计数。一次隔离演练中，另一连接持有学习记录的写锁，phase 显示 `waiting for writers before build`。结束持锁事务后构建完成，进度行消失，第一条查询中的两个标志都变为 true。有的阶段扫描数据块，有的阶段等待其他事务结束。块计数一段时间不动时，先辨别是否已进入等待，再查谁还持有事务。构建也消耗 CPU、磁盘空间和读写带宽，线上允许写入仍可能让请求变慢。用业务允许的延迟、存储余量和中止条件决定上线窗口。进度视图当前无行时，回到索引标志和执行结果判断是否成功。[PostgreSQL 的构建进度](https://www.postgresql.org/docs/18/progress-reporting.html#CREATE-INDEX-PROGRESS-REPORTING)

这会改变发布步骤。并发建索引不能放进普通的 BEGIN／COMMIT 事务块；直接把主线迁移的 CREATE INDEX 换个拼法会执行失败。需要先在有代表性的副本验证发布工具如何提交这条命令，以及中断后会留下什么。若新名字对应无效对象，核实没有其他构建者和约束依赖，再安排清理或重建，验证有效性、定义、查询结果和真实计划后，才让发布记录反映实际状态。已经在其他库成功应用的迁移应保留历史，新的部署路径单独设计。[PostgreSQL 的并发索引构建](https://www.postgresql.org/docs/18/sql-createindex.html#SQL-CREATEINDEX-CONCURRENTLY)

回到本章的选择。小库有停写窗口，可以用有超时保护的事务，一次成功或整体回滚。持续写入的大表把可用性放在前面，需要分阶段完成，也要能在阶段之间恢复。两者应验证同一件业务结果：旧记录按原顺序可读、新记录仍能写入，而计划确实减少了目标查询的工作量。

## 在三个 DBeaver 会话里等一次、放行一次

这次在独立 VERIFY 库新建一张四行就够用的小表。用普通表，三个连接才能看见同一份数据。表里只有练习用的编号和分数；业务表、主线索引和 Prisma 迁移记录都不参与。第一轮让构建在等待写事务时超时，第二轮只改变放行时机。这样即使小表的扫描转瞬即逝，也有一个可重复观察的停点。

**先认出三个会话。** 在 DBeaver 的数据库导航器中，为同一个 VERIFY 各开一个独立连接的 SQL 编辑器，分别记为 A 写入、B 构建、C 观察。若编辑器共享连接，可以复制 VERIFY 的连接配置，分别连接后从每个配置右键打开 SQL 编辑器。三个都使用同一个具备建 Schema 权限的练习库所有者。分别执行下句，核对库名、用户相同，三个 PID 两两不同，记下 A 和 B 的 PID。若 PID 相同，先分开连接，否则一个窗口等候时，另一个窗口也可能无法操作。

```sql
SELECT current_database(), current_user, pg_backend_pid();
```

用事务工具栏将 **A 设为手动提交，B、C 设为自动提交**。A 用工具栏的 Commit 放行，B 的并发建索引必须单独作为一条语句提交，C 每次重查要能看见最新的已提交状态。下文每次只选中当前要执行的那一条 SQL，点击“执行 SQL 语句”，尤其要把 B 的 SET 和 CREATE 分开发送。[DBeaver 事务模式](https://dbeaver.com/docs/dbeaver/Auto-and-Manual-Commit-Modes/)

**C 建立起点。** 逐条执行下面三句。第一句要求 Schema 名尚未占用；若提示同名已存在，停在这里，另选未使用的练习 Schema 名并统一替换下文名称。保留已有对象。

```sql
CREATE SCHEMA lab35a;
CREATE TABLE lab35a.feed (id integer PRIMARY KEY, score integer NOT NULL);
INSERT INTO lab35a.feed VALUES (1, 10);
```

**第一轮，保留现场直到预算用完。** 在 A 执行下面的插入，看到影响一行后保持事务打开。A 已能读到自己的二号行，其他会话仍只能读到已提交的一号行。

```sql
INSERT INTO lab35a.feed VALUES (2, 20);
```

先把下方两条 C 的观察查询准备在编辑器里，再切到 B。第一句设置本会话的四十五秒语句预算，执行成功后单独发送第二句。B 会显示执行中，此时切到 C，不要在 A 点 Commit。

```sql
SET statement_timeout = '45s';
CREATE INDEX CONCURRENTLY feed_score_idx ON lab35a.feed (score DESC, id DESC);
```

在 C 分别执行这两句。第一张网格给出正在做什么以及等谁，第二张网格给出索引的已提交状态。这里用限定 Schema 的名字，即使别处也有一张 feed 表，也只认本次练习对象。

```sql
SELECT pid, phase, current_locker_pid, lockers_done, lockers_total
FROM pg_stat_progress_create_index
WHERE datname = current_database() AND relid = 'lab35a.feed'::regclass;

SELECT i.indisready, i.indisvalid, pg_get_indexdef(i.indexrelid) AS definition
FROM pg_index AS i
WHERE i.indrelid = 'lab35a.feed'::regclass
  AND i.indexrelid = to_regclass('lab35a.feed_score_idx');
```

第一张网格中应能对上 B 的 pid、阶段 `waiting for writers before build` 和 A 的 current_locker_pid。第二张已经有定义，两个标志此时都为假。A 的写事务尚无最终结果，B 还没开始第一次表扫描。若 B 立即报告不能在事务块内运行，检查 B 的自动提交和语句选区；若 B 已经成功，先检查 A 的插入是否提前提交，以及三个窗口选中的库。若切慢了刚好错过等待，继续检查下面的超时现场，不必靠截到某一帧判断成败。

保持 A 不提交，等 B 报 `canceling statement due to statement timeout`（SQLSTATE `57014`）。在 C 重跑上面两句。这次进度网格为空，目录网格仍有同名索引，`indisready=false`、`indisvalid=false`。和上一刻相比，消失的是构建进程：继续放着这个对象不会使它自行完成。这个标志组合对应**扫描前**的超时；中断若发生在更靠后的阶段，ready 可能已经为真，所以每次都要读两个标志。若两个网格都为空，只能说明当前库未见该对象，先确认目标库和 B 的原始错误。

**结束第一轮，再做可控的重建。** 在 A 点 Commit，把二号行保存下来。在 B 单独执行 `RESET statement_timeout;` 恢复会话默认预算。确认 C 的进度网格为空、定义确实指向本轮新建的小表，且它是刚才手工新建的普通索引，在 C 执行下面一句。再查目录应为零行。这里没有一条需要登记为成功或回滚的 Prisma 迁移。

```sql
DROP INDEX lab35a.feed_score_idx;
```

第二轮 A 仍用手动提交，执行下面一行，先保持事务打开。B 单独重发原来的 CREATE INDEX CONCURRENTLY；C 重查进度，等到再次看到 B 正在等 A。

```sql
INSERT INTO lab35a.feed VALUES (3, 30);
```

先在自动提交的 C 执行下面一行。它应该成功，B 仍在等 A。从这个中间状态可以同时看清两件事：尚未结束的旧写事务能让构建停住，此时到来的普通写入却可以完成。C 写入成功后再到 A 点 Commit。这一次等 B 报建索引成功，再到 C 重查进度与目录。

```sql
INSERT INTO lab35a.feed VALUES (4, 40);
```

进度网格又为空，但目录里的两个标志现在都为真，定义应含 `score DESC, id DESC`。在 C 执行下面的列表，四行应依次为四、三、二、一：初始行、第一轮放行的行、第二轮两个会话提交的行都可读。这个小表上规划器仍可能选择顺序扫描；实际可供选择看有效标志，列表读回检查的是业务结果。要评估能省多少工作，回到主线的大样本计划对照。

```sql
SELECT id, score FROM lab35a.feed ORDER BY score DESC, id DESC;
```

确认 A 已提交、B 已结束后，在 C 逐条执行收尾。删除练习表会一并删除它的索引，最后一句只在 Schema 已空时成功。

```sql
DROP TABLE lab35a.feed;
DROP SCHEMA lab35a;
```

## 附录：本支线必要技术点速查

| 名称 | 用途 | 核对入口 |
| --- | --- | --- |
| CREATE INDEX CONCURRENTLY | 在允许写入时分阶段构建 | [创建索引](https://www.postgresql.org/docs/18/sql-createindex.html) |
| indisready／indisvalid | 区分维护写入与可供查询使用 | [索引目录](https://www.postgresql.org/docs/18/catalog-pg-index.html) |
| pg_stat_progress_create_index | 观察进行中的构建与等待 | [进度视图](https://www.postgresql.org/docs/18/progress-reporting.html) |

阅读约 18～25 分钟；在已有 VERIFY 上分开三个会话、完成两轮对照并清理，另需约 12～20 分钟，含第一轮四十五秒等待。

[返回第三十五章](chapter.md) · [第四篇导读](../README.md)
