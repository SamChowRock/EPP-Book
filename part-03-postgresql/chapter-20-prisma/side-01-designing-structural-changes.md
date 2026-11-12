# 支线 20A：结构有差异，应该改哪一边

读完第二十章后，我们有三份可以对照的材料：程序需要的模型、可重放的迁移历史、数据库里的实际对象。三者不一致时，“让 diff 变成零”并不是充分的目标。一个保留原值的改名，与一次删列重建，都可能得到同样的最终列名；一项合理的索引优化与一次误操作，也都可能表现为数据库比模型多一个索引。

这条支线把决定展开到可操作的程度：先解释差异意味着什么，再选择保存哪些事实，最后验证采取的动作。先完成主线的两库基线流程；配套文件在代码仓库 `database/chapter-18/design-lab/`。模型变式只用于比较，不替换项目正式 Schema，也不作为生成客户端或执行迁移的入口。

**时间参考（估算）**：阅读约 35～45 分钟；模型比较、临时表与索引观察另加约 25～35 分钟。安装下载不重复计入。

## 程序想换一个名字，为什么先别动表

假设团队觉得 `text` 比 `originalText` 更适合程序里的使用方式。先把需求说完整：只是 TypeScript 字段改名，数据库已有 SQL 和其他使用者继续认 `original_text`，历史原文必须逐字符保留。这个条件已经排除了物理删列。

比较文件 `rename-mapped.prisma` 保留两张表的完整模型，只把 Capture 中的这一行改为：

```prisma
text String @map("original_text") @db.Text
```

在 VS Code 中对照正式 Schema 与该文件；确认变化在程序字段名，右侧 `@map` 仍指向原列。在项目根目录执行只产生差异的命令：

```bash
npm run db -- migrate diff --from-schema prisma/schema.prisma \
  --to-schema database/chapter-18/design-lab/rename-mapped.prisma --script --exit-code
```

应得到空迁移，退出码为 0。这里比较两个模型表达的数据库结构，不是比较 TypeScript 接口。程序字段名已经变了，所以使用新模型生成客户端后，旧的查询参数仍需修改；HTTP 响应是否改名则是另一个契约决定。映射的价值在于让这些变化可以分开安排，而非承诺“改名没有任何成本”。本实验不生成客户端，主项目继续使用 `originalText`。

再看 `rename-physical.prisma`：它同样把字段改为 text，却去掉了映射。执行：

```bash
npm run db -- migrate diff --from-schema prisma/schema.prisma \
  --to-schema database/chapter-18/design-lab/rename-physical.prisma --script --exit-code
```

此时退出码为 2，关键 SQL 是：

```sql
ALTER TABLE "captures" DROP COLUMN "original_text",
ADD COLUMN "text" TEXT NOT NULL;
```

**这里只读 SQL，不把它粘贴到业务表执行。** 工具能确认“旧列不在目标中、新列尚不存在”，却没有得到“它们是同一个事实”的说明。它也不知道历史原文必须保留。审查迁移的第一件事是把动作翻译回数据后果：旧列的值将被移除，新列没有这些值；不能看到最终列名符合需求就批准。

## 用临时表比较删加与重命名

现在到 DBeaver 打开 `design-lab/01-rename.sql`，使用校验库的 SQL 编辑器。这个实验只建立当前连接可见的临时表 `rename_example`，不操作 public.captures。开始前结束其他事务，按组执行；不要全选包含预期错误的整份脚本。

先执行第一组到 INSERT：

```sql
BEGIN;
CREATE TEMP TABLE rename_example (
  original_text text NOT NULL,
  CONSTRAINT rename_nonempty CHECK (char_length(original_text) > 0)
) ON COMMIT DROP;
INSERT INTO rename_example (original_text) VALUES ('  Keep my spaces.  ');
```

临时表保留我们要研究的三个条件：有旧行、列非空、原文有 CHECK。`ON COMMIT DROP` 约定提交时也移除临时表；本实验结束用回滚，连建表本身一起撤销。它不是业务表完整副本，不用它推断外键、权限或其他依赖已经迁移正确。

单独执行：

```sql
ALTER TABLE rename_example DROP COLUMN original_text, ADD COLUMN text text NOT NULL;
```

应出现 `23502`：新列对已有行没有值，却要求非空。错误使事务失败，单独执行 `ROLLBACK;`，恢复编辑器会话。不要为了让它成功随手加空字符串默认值，那会把“保留旧原文”的需求偷换成“填一个能过约束的值”；去掉 NOT NULL 也只会让旧行得到 NULL，仍没有搬运原值。如果这种删加操作成功，依赖原列的 CHECK 也会随旧列移除，Prisma 的模型比较并不能替我们发现所有这类规则损失。本次操作报错并回滚，因此没有留下这些变化。

接着运行文件第二组：重新执行上面的 BEGIN、建临时表和 INSERT，然后改用：

```sql
ALTER TABLE rename_example RENAME COLUMN original_text TO text;
SELECT text, char_length(text) AS characters FROM rename_example;
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint WHERE conrelid = 'pg_temp.rename_example'::regclass;
```

结果网格中，原文仍有首尾两个空格，长度为 19；约束定义变为 `CHECK ((char_length(text) > 0))`。数据库重命名的是原来的列，值没有经过重建，约束对列的引用也跟着保留。约束名称仍是 `rename_nonempty`，名称和表达式不是同一件事。看完执行 `ROLLBACK;`，两组都不留下表和数据。

这证明了物理重命名怎样保留值，但还没有证明可以在线上直接做。旧版本程序的 SQL 若仍写 original_text，重命名后会报列不存在；同库中解析过的约束能跟随变化，不代表另一个进程拼出的 SQL 也会自动改名。只有能够协调所有使用者、接受相应锁等待与切换窗口时，才考虑直接 RENAME。若必须让新旧程序共存，就要设计扩大兼容范围、迁移读写、回填和最后收缩的顺序。第二十三章将在真实新增字段上展开这种演进；当前只有程序命名需求时，保留映射已经满足目标，无需承担物理改名的代价。

## 历史显示同步，为什么数据库仍有额外索引

在 DBeaver 切到 **epp_migration_check**，先运行身份查询。确认该库已经成功应用 0_init，业务表为空，并且没有其他人在编辑结构。本实验给这套独立校验库暂加一个普通索引，再移除自己创建的索引；不动 epp_dev。

打开 `design-lab/02-index-drift.sql`，先执行其中的查询：

```sql
SELECT current_database(), current_user;
SELECT indexname, indexdef FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'captures'
ORDER BY indexname;
```

记录当前结果。若已有 `captures_created_at_lab_idx`，先查明来源，不执行后面的创建或删除。确认不存在后，开启自动提交，单独执行：

```sql
CREATE INDEX captures_created_at_lab_idx ON public.captures (created_at);
```

刷新对象树，双击 captures，进入 Properties → Indexes；也可再次执行同一个目录查询。应多出一项以 created_at 为键的普通索引。这里只制造可解释的结构变化，不声称空表上的索引有性能收益；索引是否值得保留，要结合查询条件、排序、数据量、执行计划与写入成本判断。

回到项目运行：

```bash
npm run db:verify -- migrate status
npm run db:verify -- migrate diff --from-config-datasource \
  --to-schema prisma/schema.prisma --exit-code
```

第一条仍可显示历史已同步；第二条退出码为 2，报告 `Removed index on columns (created_at)`。这不是相互矛盾：status 确认迁移记录与文件没有待应用项，diff 比较数据库与目标模型。手工建索引没有新增迁移文件，所以它不能靠“所有文件都执行过了”被识别。

尤其注意 Removed 的方向。我们选的是“实际数据库 → 正式模型”；实际库多一个索引，为了变成较少索引的模型，计算结果才是移除。它不是在告诉我们“数据库刚刚丢了索引”，也不是业务上的删除建议。将比较方向误当成行动命令，会把合理的现场变更抹掉。

## 差异相同，处理决定可以不同

这次额外索引的来源明确：刚才为了观察创建，没有对应查询需求。因此选择恢复校验库。在同一个已核对的校验连接执行：

```sql
DROP INDEX public.captures_created_at_lab_idx;
```

刷新 Indexes 和目录查询，确认只移除了实验对象，再执行原来的 diff，应恢复为 0。这次删除的依据是对象身份、来源和用途，不是因为“额外的东西一律有错”。如果中断后回来，先查询它是否还在；已不在就继续比较，不用重新创建一次来完成清理流程。

改变条件：假如它来自已经验证过的慢查询优化，其他使用者需要这个查询路径，那么恢复模型代表的旧状态可能撤销有效设计。此时应保留对象，把已经确认的需求纳入模型与历史。比较文件 `retain-index.prisma` 在 Capture 中多了这一项：

```prisma
@@index([createdAt], map: "captures_created_at_lab_idx")
```

想观察这个变式，可在校验库重新执行同一条 CREATE INDEX，然后比较：

```bash
npm run db:verify -- migrate diff --from-config-datasource \
  --to-schema database/chapter-18/design-lab/retain-index.prisma --exit-code
```

结果应为 0。结束观察后仍删除本次实验索引，再对正式模型确认 diff 为 0；“有效优化”是条件变式，不是给 EPP 正式增加这个索引。

这次零差异只证明模型接受了对象，**还没有补齐历史**。从空库重放原来的 0_init，仍不会得到这个索引。由此可以推导两个不同阶段的安排：

- 若还处于首次接管、基线尚未在任何目标成功应用或登记，就把确认需要的对象同时纳入模型与基线草稿，重新核对已有库并在独立空库重放，再登记已有事实。
- 若基线已经生效，就保留它，追加一份创建该索引的迁移，让尚无索引的环境能正常执行。对已经手工拥有该索引的目标，需要先核对名称、列顺序、类型、唯一性等完整定义与新迁移一致，再按基线同样的原则登记这份明确的新迁移；不能给所有环境一概登记，也不能拿 `IF NOT EXISTS` 掩盖同名但不同定义的对象。

后一条需要一次新的迁移设计与多环境协调，本实验不擅自修改正式历史。这里应能作出的决定已经具体：保留哪个结构事实、模型应如何表达、历史还欠哪一步、哪个环境执行、哪个环境只能在核对后登记。工具提供差异，决定来自需求、已有数据、使用者与可重放性。

回到主线，“先调查再处理”就有了可用的依据：程序层改名由映射承担；物理改名要同时考虑值与旧程序；误操作可以恢复；有效需求要进入模型和后续历史。无法解释来源时先保留现场，而不是通过重置把证据消掉。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| `--from-schema`／`--to-schema` | 比较两个模型表达的物理结构 | TypeScript 名字变化不一定形成 SQL 差异 |
| `@map` | 保持程序字段与历史列的对应 | 不决定 HTTP 对外字段是否改名 |
| `CREATE TEMP TABLE` | 隔离列操作实验 | 只在当前会话可见，不是完整迁移验证 |
| `DROP COLUMN`／`ADD COLUMN` | 观察删加列对旧值的影响 | 不搬运旧值；可能丢失依赖规则 |
| `RENAME COLUMN` | 保留原列值并改变物理名称 | 外部程序 SQL 不会自动适配 |
| `pg_get_constraintdef` | 检查约束实际引用 | 对象名字与表达式分别核对 |
| `migrate status`／`migrate diff` | 分别检查历史状态与结构差异 | “已同步”与结构有差异可以同时成立 |
| 追加迁移／登记既有事实 | 将有效现场变更纳入重放路径 | 不修改已生效基线，不为未执行目标虚假登记 |

官方参考：[Prisma 数据库映射](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/database-mapping)、[Prisma CLI](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference)、[PostgreSQL 18 ALTER TABLE](https://www.postgresql.org/docs/18/sql-altertable.html)、[PostgreSQL 18 CREATE TABLE](https://www.postgresql.org/docs/18/sql-createtable.html)。

[返回第二十章](chapter.md) · [返回第三篇](../README.md)
