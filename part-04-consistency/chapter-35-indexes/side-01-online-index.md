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

## 附录：本支线必要技术点速查

| 名称 | 用途 | 核对入口 |
| --- | --- | --- |
| CREATE INDEX CONCURRENTLY | 在允许写入时分阶段构建 | [创建索引](https://www.postgresql.org/docs/18/sql-createindex.html) |
| indisready／indisvalid | 区分维护写入与可供查询使用 | [索引目录](https://www.postgresql.org/docs/18/catalog-pg-index.html) |
| pg_stat_progress_create_index | 观察进行中的构建与等待 | [进度视图](https://www.postgresql.org/docs/18/progress-reporting.html) |

时间参考（估算）：阅读约12～18分钟；两条只读查询可在现有 VERIFY 核对，无需启动线上索引构建。

[返回第三十五章](chapter.md) · [第四篇导读](../README.md)
