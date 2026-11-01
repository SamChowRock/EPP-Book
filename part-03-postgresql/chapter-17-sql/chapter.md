# 第 17 章 SQL：查询、筛选和修改自己的记录

第十六章留下了 public.users、public.captures、一个开发用户和两条记录。模型已经能解释身份、归属与合法状态；现在需要把读取和修改的意图准确交给数据库：要找的是哪些行，结果里一行代表什么，怎样限定写入范围，看到返回值是否就代表数据已经提交。

本章从 `part-03/chapter-16` 继续，代码分支是 `part-03/chapter-17`。默认在 DBeaver Community 操作，配套文件位于 `database/chapter-17/`。Nest 主服务继续使用 Map，不新增修改、删除或分页 API；这里的 SQL 是为后面的存储适配建立依据。原有两条记录始终保留，新增实验行除双会话观察外都在事务内回滚；双会话实验会明确提交一条专用记录，观察完再按固定身份清理。

SQL 的价值在于描述需要的结果及条件。数据库可以选择不同执行计划，但结果的含义必须由我们定义。接下来每次增加一个子句，都先解释它改变了哪个集合或哪种保证，再看界面里的结果。

## 17.1 从读取意图推导条件、顺序与修改范围

### 恢复工作台，并确定这次读到了谁

按第十五章恢复实例，在 DBeaver 连接 `127.0.0.1:55432/epp_dev`，使用 epp_owner。运行第十六章的 `03-inspect-model.sql`，确认两张表、外键和两条原始记录都在；不重新运行建表与 seed。两条记录 ID 分别以 001、002 结尾，拥有者都是 `10000000-0000-4000-8000-000000000001`，创建时间相同。

沿用 Auto-commit、关闭 Smart commit，以及 SQL Script 的 No commit、Stop + rollback 设置。本章事务由 SQL 中的 BEGIN／COMMIT／ROLLBACK 明确控制；不在未完成事务中切换数据源或自动重连。只读文件可以顺序执行；标有“分阶段”的双会话文件不能全选执行。出现错误先停下，在原会话回滚，再检查原因。

打开 `01-read.sql`，先执行诊断语句：

```sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port(),
       pg_backend_pid(), current_setting('transaction_isolation');
```

前四项核对库、角色和地址；pg_backend_pid 是这个连接对应的服务端进程编号，后面用来区分两个真实会话；最后一项是当前隔离级别。编辑器标签不同不代表连接一定不同，结果网格也只代表上次执行时取得的结果。

然后读取固定用户的记录：

```sql
SELECT id, original_text, created_at
FROM public.captures
WHERE user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY created_at ASC, id ASC;
```

FROM 指定来源，WHERE 限定结果中的行，SELECT 决定输出列，ORDER BY 决定输出顺序。这里的 user_id 用于限制归属，未必需要返回给页面。显式投影也避免将来表增加内部字段时，`SELECT *` 悄悄扩大输出。SQL 列名仍是数据库表示，第十九章再映射为原有 JSON 字段。

可以先按“取得来源 → 筛选 → 投影 → 排序”理解这个简单查询的含义；这不是数据库必须逐行执行的算法。优化器可能用索引提前定位，也可能扫描后筛选。把逻辑语义和物理执行分开，才不会从 SQL 的书写顺序猜测性能。

### 先确定排序契约，再讨论第几页

这两条记录的 created_at 一样。如果只按时间排序，它们谁在前没有保证。补上唯一 id 后，在数据不变时就有确定顺序：升序先 001，再 002。ASC 是升序；若定义“最近在前”，应同时写 `created_at DESC, id DESC`，让相同时间下的规则也明确。

本篇数据库列表选择 **created_at 升序、id 升序**作为默认顺序，表达“按创建时间从早到晚，同一时间用身份稳定打破并列”。这与原 Map 的精确插入顺序有区别：两条记录可能使用同一毫秒，ID 的比较也不代表插入先后；补录旧时间的数据还会排到前面。第十九章替换存储时，应同步修改 OpenAPI 的排序说明并核对调用方，不声称它是无行为变化的内部重构。当前 HTTP 实现仍保持旧行为。

现在在同样的集合上取第二条：

```sql
SELECT id, original_text, created_at
FROM public.captures
WHERE user_id = '10000000-0000-4000-8000-000000000001'
  AND strpos(original_text, 'cook') > 0
ORDER BY created_at ASC, id ASC
LIMIT 1 OFFSET 1;
```

两条原文都包含 cook，筛选后仍有两条；OFFSET 1 跳过排序后的第一条，LIMIT 1 最多返回一条，所以结果是 002。LIMIT 和 OFFSET 在语句中的位置不能理解成“先取一条，再跳过一条”。逻辑上是在符合条件的有序结果中跳过偏移量，再取需要的数量。

如果只有一条符合条件，OFFSET 1 就会返回零行，不是 SQL 故障。一般页号从 1 开始时，偏移量是 `(page - 1) × pageSize`；页大小与偏移量需要输入校验。现有 API 只有可选 limit，未提供 page 或 offset；本节的分页用于理解数据库行为，不把新参数悄悄加进旧接口。

唯一排序也不意味着跨请求读取同一份数据。假设第一页读到 001，随后它被删除；下一次请求仍跳过一行，就会越过已经移到第一位的 002。往前插入新行则可能导致重复。因此 OFFSET 适合明确接受数据变化影响的浅分页；深偏移还可能需要处理大量被跳过的行。第二十九章结合真实分页接口展开 Cursor，当前不能用“排序稳定”承诺永不漏读。客户端网格一次抓取多少行，也不等于产品定义的 SQL 分页。

### 搜索要保留原有匹配语义

原服务使用 `originalText.includes(text)`：大小写敏感，搜索值按字面内容解释。这里用 `strpos(original_text, 'cook') > 0`，在本篇 UTF8、C 区域设置下，返回子串首次出现的位置，找不到是 0。位置从 1 开始，和 JS 的 indexOf 从 0 开始不同，但我们只用它判断是否存在。

不要顺手替换成 `LIKE '%输入%'`。LIKE 中 `%` 表示任意长度内容，`_` 表示一个字符；用户搜索百分号时可能意外匹配所有记录。ILIKE 还会引入大小写不敏感的含义。参数化能防止输入改变 SQL 结构，却不会取消 LIKE 自己的通配语义，这两件事需要分别决定。

执行配套文件末尾的只读对照：

```sql
SELECT strpos('100% ready', '%') AS literal_percent,
       strpos('a_b', '_') AS literal_underscore,
       strpos('Cook', 'cook') AS case_sensitive;
```

预期为 4、2、0。LIKE 并非不能用：若需求就是前缀或模式匹配，应该选择它；若要用它表达字面匹配，则必须正确转义模式元字符。本章选择直接表达字面子串的函数，不提前承担另一套模式规则。现有 q 的非空白、最多 200 个 UTF-16 单元限制仍须在应用入口遵守；数据库可表示性也要在接入时核对。

### 修改前先限定对象，修改后读取实际影响

SELECT 可以返回许多行，UPDATE、DELETE 也按条件作用于一个集合。`WHERE id = ...` 不是可有可无的修饰；没有 WHERE 就会面向整张表。按 ID 操作自己的记录时，还应包含可信的 user_id，避免把“知道 ID”误当作“有操作权限”。当前 SQL 中的身份是固定演示值，未来从服务端认证结果取得。

在 `02-write-and-rollback.sql` 中逐条执行下面一组，均停留在同一个编辑器：

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';

INSERT INTO public.captures (id, user_id, original_text)
VALUES ('40000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001', 'A temporary draft.')
RETURNING id, original_text, created_at;

UPDATE public.captures
SET original_text = 'A corrected draft.'
WHERE id = '40000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000001'
RETURNING id, original_text;
```

INSERT 省略 created_at，让默认值确定时间，RETURNING 取回实际写入的行；UPDATE 的 RETURNING 默认返回更新后的内容。因此两次结果应分别包含 temporary 和 corrected。它们表示语句完成时的影响，尚不表示事务已经提交。lock_timeout 限制等待锁的时间，避免实验意外等待别处未结束的写入；它不是整个查询的执行时限，超时后同样要回滚并排查。

接着故意使用不匹配的拥有者删除这个实验 ID：

```sql
DELETE FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000002'
RETURNING id;
```

结果应为零行，执行统计为零条删除；数据还在。零行是正常结果，可以表示对象不存在或不满足条件，不能只凭这一次结果区分二者。面向用户的接口是否统一返回“未找到”，要结合权限边界设计，不能为了区分而先查询并泄漏他人的记录。

再用正确归属删除，并结束实验：

```sql
DELETE FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000001'
  AND user_id = '10000000-0000-4000-8000-000000000001'
RETURNING id, original_text;

ROLLBACK;
```

这次应返回一条被删除记录，其原文为 corrected；ROLLBACK 撤销整组实验，最初的插入也不存在了。重新运行 01-read.sql 仍能看到原来的 001、002 两条记录。这里的 `400...` 专用实验身份与 `200...` 原始记录区分开，不能把实验 SQL 改成对原始 ID 的批量修改。

预览 SELECT 有助于发现错误条件，但在有并发写入时，“预览了两行”不能保证稍后 UPDATE 仍只影响相同两行；返回行数和 RETURNING 才是该次语句的实际结果，要求更强保证时需要事务与并发策略。也不要把普通 UPDATE 的成功理解为它保留了历史，覆盖就是覆盖，第十六章的版本判断仍然适用。

## 17.2 先决定结果粒度，再选择 JOIN、分组与子查询

### JOIN 是按条件组合行，不是自动生成嵌套对象

页面需要“记录及拥有者的创建时间”时，可以从记录出发关联用户：

```sql
SELECT c.id, c.original_text, u.id AS owner_id,
       u.created_at AS owner_created_at
FROM public.captures AS c
JOIN public.users AS u ON u.id = c.user_id
WHERE c.user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY c.created_at, c.id;
```

c、u 是当前查询的表别名。ON 表达如何配对，WHERE 限制需要保留哪些组合。每条记录的 user_id 对应 users 的唯一主键，且有非空外键，所以每条记录恰好找到一个拥有者，结果仍是一行一条记录。用户列会随不同记录重复出现，这是查询结果的表示，并不意味着存储模型退回了重复维护用户资料。

反向从 users 出发 JOIN captures，同一个用户有两条记录，就会形成两行组合。JOIN 没有自动把两条记录塞进一个 captures 数组。如果需要一行一个用户，需要聚合或另一种读取组织；仅仅改变 SELECT 列，把记录 ID 隐藏掉，不会消除这两行。

省略正确的关联条件可能产生笛卡尔组合：两个用户与三条记录会有六对，而不是自动按同名字段匹配。加 DISTINCT 有时能让界面看起来没有重复，却可能掩盖错误关联或错误结果粒度。先数清每一侧能匹配几行，再选择去重，不能把 DISTINCT 当修复 JOIN 的默认动作。

### 让“没有记录的用户”真实出现在结果里

只有一个用户且他有记录时，看不出 LEFT JOIN 的必要性。打开 `03-joins-and-groups.sql`，先逐条执行 BEGIN、lock_timeout 和两段 INSERT；加入两个实验用户，只有第二位拥有一条实验记录，第三位没有记录：

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';

INSERT INTO public.users (id) VALUES
  ('10000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000003');
INSERT INTO public.captures (id, user_id, original_text, created_at)
VALUES ('40000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002',
        'This is my second workspace.', '2026-11-01T08:00:00.000Z');
```

固定 ID 若已存在，先回滚并查明来源，不用冲突忽略或覆盖更新绕过。下面的查询都在这个会话里进行，文件末尾再 ROLLBACK。它们读取所有三个演示用户，是管理观察，不是普通用户列表接口的授权方案。

```sql
SELECT u.id AS owner_id, c.id AS capture_id
FROM public.users AS u
LEFT JOIN public.captures AS c ON c.user_id = u.id
WHERE u.id IN ('10000000-0000-4000-8000-000000000001',
               '10000000-0000-4000-8000-000000000002',
               '10000000-0000-4000-8000-000000000003')
ORDER BY u.id, c.id;
```

IN 限定观察的三个用户。预期四行：用户 001 对应两条记录，002 对应一条，003 对应一行 capture_id 为 NULL 的结果。LEFT JOIN 保留左侧没有匹配的行，用 NULL 补右侧字段。这一行不是数据库里多出了一条空记录，而是查询构造的表示。

### COUNT 数的是哪一种东西

在同一会话继续执行：

```sql
SELECT u.id, count(*) AS joined_rows, count(c.id) AS capture_count
FROM public.users AS u
LEFT JOIN public.captures AS c ON c.user_id = u.id
WHERE u.id IN ('10000000-0000-4000-8000-000000000001',
               '10000000-0000-4000-8000-000000000002',
               '10000000-0000-4000-8000-000000000003')
GROUP BY u.id
ORDER BY u.id;
```

GROUP BY 把相同用户的组合归成一组，输出粒度变成一行一个用户。count(*) 统计组内全部结果行；count(c.id) 只数其中非 NULL 的记录 ID。第三位用户的两个数字应分别是 1 和 0；前两位分别是 2／2、1／1。记录主键非空，所以这里用它计数，恰好避开外连接产生的占位行。

分组之后不能随便同时 SELECT 一条未聚合的 original_text：同一用户有两条原文，没有定义要选哪条。需要“最新原文”时，必须另外表达最新的排序与选择规则；不能期望数据库帮你任取一条。count 在 PostgreSQL 返回 bigint，后面经过驱动或 ORM 时还要核对其应用侧类型，不凭界面显示为数字就一律当安全的 JS Number。

如果需求是“列出记录不少于两条的用户”，先限定参与统计的记录，再按用户分组，最后筛选组：

```sql
SELECT user_id, count(*) AS capture_count
FROM public.captures
WHERE user_id IN ('10000000-0000-4000-8000-000000000001',
                  '10000000-0000-4000-8000-000000000002',
                  '10000000-0000-4000-8000-000000000003')
GROUP BY user_id
HAVING count(*) >= 2
ORDER BY user_id;
```

预期只有用户 001。WHERE 筛单行，HAVING 筛已经形成的分组；在 WHERE 写 count(*) 不成立，因为此时还没有当前分组的计数。此查询直接从 captures 分组，没有记录的用户根本不会形成组；需要显示零时，应回到前面的 LEFT JOIN 方案。

### 条件放在 ON 和 WHERE，可能改变需求

现在要求“显示每位用户，并统计他包含 cook 的记录数”。应把记录筛选放在 LEFT JOIN 的 ON 中：先匹配符合要求的记录，没有匹配仍保留用户。`03-joins-and-groups.sql` 提供完整查询，核心变化是：

```sql
LEFT JOIN public.captures AS c
  ON c.user_id = u.id AND strpos(c.original_text, 'cook') > 0
```

在前面的用户分组查询中用这段替换原 JOIN，并输出 `count(c.id)`，结果为 2、0、0。若把同一条件挪到 WHERE，先形成的 NULL 占位行会被过滤掉，因为 strpos(NULL, 'cook') > 0 得不到 true；有记录但不匹配的用户也会被过滤。结果只剩用户 001。

两种查询都合法，却回答不同问题。不要机械记成“LEFT JOIN 的条件都必须写 ON”：用户范围仍应在 WHERE 限定。要分清哪些条件用于寻找右侧匹配，哪些用于淘汰整个结果行。对“保留所有用户”的需求，这个位置直接决定正确性。

### 只问是否存在时，避免把匹配行带进结果

找“还没有任何记录的用户”可以写：

```sql
SELECT u.id
FROM public.users AS u
WHERE u.id IN ('10000000-0000-4000-8000-000000000001',
               '10000000-0000-4000-8000-000000000002',
               '10000000-0000-4000-8000-000000000003')
  AND NOT EXISTS (SELECT 1 FROM public.captures AS c WHERE c.user_id = u.id)
ORDER BY u.id;
```

结果只有用户 003。内层引用外层 u.id，表示针对当前用户判断是否有匹配记录，这叫相关子查询。SELECT 1 不表示只取第一条记录，也不统计数量；EXISTS 只关心子查询是否产生行。将 NOT EXISTS 改成 EXISTS，得到有记录的两位用户，每人一行，不会因用户 001 有两条记录就重复出现。

这是语义上的“对每个用户作判断”，不代表执行器一定反复逐个查询数据库；优化器可以选择相应连接策略。若把查询写成应用循环，每位用户单独发一次网络请求，那才引入了另一种往返成本。执行计划在第三十章进一步观察。

这一组观察结束后，执行文件末尾的 `ROLLBACK;`。用第十六章核对文件确认两个临时用户和一条实验记录都不在，原始两条记录仍在。这是一处自然停点：不需要为下一节保留任何临时表或未提交事务。

## 17.3 把输入值与 SQL 结构分开

### 能查出正确结果，不等于能接受外部输入

目前 SQL 中都是我们编写的固定字面量。应用不能把用户搜索词直接插进 SQL 字符串：当输入包含引号、注释或运算符时，它可能终止原来的字面量并改变 WHERE 的结构。只禁止某几个词也不足以建立边界；原文里合法出现撇号本来就是正常情况。

正确方向是固定语句结构，把值交给驱动的参数接口。数据库先知道哪些位置是表达式中的值，外部内容不能再变成表名、条件或注释。参数化仍不代替身份来源、长度校验和业务规则；它解决的是代码与数据的边界。

暂不安装应用驱动，先在 DBeaver 用服务器的 PREPARE／EXECUTE 直接观察。打开 `04-parameters.sql`，在一个会话中执行：

```sql
PREPARE epp17_list (uuid, text, integer, integer) AS
SELECT id, original_text, created_at
FROM public.captures
WHERE user_id = $1
  AND ($2 IS NULL OR strpos(original_text, $2) > 0)
ORDER BY created_at ASC, id ASC
LIMIT $3 OFFSET $4;
```

$1～$4 分别是拥有者、可选搜索词、可选上限和偏移量，不要给占位符加单引号。`'$1'` 是普通字符串，不再引用第一个参数。这里用 SQL NULL 表示“没有搜索条件”，与空字符串不同；可选 limit 为 NULL 表示不限制，延续当前接口不传 limit 时返回全部匹配结果的约定。

integer 只规定参数类型，不会自动限制为业务允许的 1～100；text 也不会拒绝空白搜索词。空字符串在任意原文中都能找到，不能把它当成一个已经通过业务校验的搜索条件。本节手写合法值来研究参数行为，后面的组装示例再检查输入范围，接入时仍须保留既有契约校验。

接着运行两次：

```sql
EXECUTE epp17_list ('10000000-0000-4000-8000-000000000001', 'cook', 1, 0);
EXECUTE epp17_list ('10000000-0000-4000-8000-000000000001', 'cook', 1, 1);
```

应该分别得到 001 和 002。再用百分号和含引号的输入：

```sql
EXECUTE epp17_list ('10000000-0000-4000-8000-000000000001', '%', 10, 0);
EXECUTE epp17_list ('10000000-0000-4000-8000-000000000001', ''' OR true --', 10, 0);
EXECUTE epp17_list ('10000000-0000-4000-8000-000000000001', NULL, NULL, 0);

DEALLOCATE epp17_list;
```

前两次应为零行，最后一次为两行。第二个输入实际值以一个撇号开头，内容是 `' OR true --`，并没有变成额外 SQL 条件。这里在 EXECUTE 命令里用两个单引号表达一个撇号，只因为我们正在手写固定 SQL；**应用仍不能把任意输入拼成 EXECUTE 字符串**。使用驱动时把原始值单独交给参数数组，由驱动处理编码和传输；无需自行给值包引号或替换撇号。

PREPARE 的对象只在当前会话存在。重连后 EXECUTE 会找不到名称；中途退出后在同一会话重跑 PREPARE，可能提示同名语句已存在。可先查询 `SELECT name FROM pg_prepared_statements;`，仅对本章的 epp17_list 执行 DEALLOCATE 后重建，不清除其他任务的准备语句。若某个执行错误让显式事务失败，先 ROLLBACK 再处理准备语句。

客户端弹出“填写参数”的窗口，不足以证明服务端收到了绑定参数：工具可能支持变量替换或不同执行模式。本节使用 PostgreSQL 原生 PREPARE，保留 $n 语法，不把它改成客户端的 `${变量}` 或冒号替换。第十九章在实际 ORM 调用中再次核对参数传递；准备语句能否复用计划、是否更快，是另一个需要测量的问题。

### 动态条件可以组合，动态结构只能来自已知选项

前面的可选条件适合展示语义。真实查询也可以仅在有搜索词时添加该条件，让 SQL 更直接。关键是片段由程序选择，外部值始终保留在参数数组中。

配套 `07-query-builder.mjs` 是独立机制示例，不连接数据库，不接入 Nest。函数先校验输入：userId 为 UUID 文本；text 可选，若存在则非空白、至多 200 个 UTF-16 单元且能被 text 表示；limit 可选且为 1～100 的整数；offset 为 0～10000 的整数。这个 offset 上限只是实验的访问约束，不能说明深分页已有性能保证，也不是新增 API 契约。核心组装如下，位于这些校验之后：

```js
const orders = new Map([
  ['oldest', 'created_at ASC, id ASC'],
  ['newest', 'created_at DESC, id DESC'],
]);
const order = orders.get(sort);
if (order === undefined) throw new TypeError('unsupported sort');

const values = [userId];
const where = ['user_id = $1'];
if (text !== undefined) {
  values.push(text);
  where.push(`strpos(original_text, $${values.length}) > 0`);
}
let sql = 'SELECT id, original_text, created_at FROM public.captures' +
  ` WHERE ${where.join(' AND ')} ORDER BY ${order}`;
if (limit !== undefined) {
  values.push(limit);
  sql += ` LIMIT $${values.length}`;
}
values.push(offset);
sql += ` OFFSET $${values.length}`;
return { sql, values };
```

占位符序号跟随 values 的长度，省略搜索条件后，下一个参数不会错误地仍叫 $3。WHERE 的 user_id 始终存在，不能为了动态条件方便而变成可选。sort 只能选 Map 中的固定片段；输入 `created_at; ...` 不在映射里就拒绝，不进入 SQL。

为什么不能写 `ORDER BY $2` 来绑定列名？值参数表示一个值，不会被重新解析为标识符或 ASC／DESC 等语法。表名、列名和方向都属于 SQL 结构，需要由固定映射选择，不能从请求原样拼接。这里字符串拼接是可审查的，因为拼进去的结构片段均来自程序常量。

可以在编辑器给函数末尾设断点，用已有 Node 调试方式运行；或在代码根目录执行一次：

```bash
node database/chapter-17/07-query-builder.mjs
```

脚本以含引号的演示搜索词输出 `{ sql, values }`。应看到 SQL 仍只有 user_id 与 strpos 条件，搜索词完整留在 values；本例参数依次为用户 ID、搜索词、10、0。这是在观察组装边界，不是在模拟数据库已经执行。正式接入时把 SQL 与 values 分别交给真正的驱动，不能再把二者替换合成字符串。

这里还明确拒绝搜索词中的 NUL 和孤立代理项，避免接入 PostgreSQL 后错误或静默替换。现有 HTTP 校验尚未收紧这一点；第十九章需要连同原文输入一起说明兼容变化。参数化也不会判断 userId 是否真来自当前请求者，那仍由服务端身份边界保证。

## 17.4 从冲突结果回到设计规则

### ON CONFLICT 不是自动补全业务语义

上一章让重复主键报错，是为了明确“这个身份已经被占用”。现在常见的建议是加 `ON CONFLICT DO NOTHING`，让脚本重跑也不报错。SQL 确实能这样写，但应该先判断两次输入是不是同一份事实。

打开 `05-conflict.sql`，在同一事务中执行：

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('40000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000001', 'First version.')
RETURNING id, original_text;

INSERT INTO public.captures (id, user_id, original_text)
VALUES ('40000000-0000-4000-8000-000000000004',
        '10000000-0000-4000-8000-000000000001', 'Different content.')
ON CONFLICT (id) DO NOTHING
RETURNING id, original_text;

SELECT id, original_text FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000004';
```

第一次返回 First version.；第二次没有新插入行，RETURNING 为零行；第三次读取仍是 First version.。DO NOTHING 没有替你比较两段内容相同，也没有应用新的内容。“没有抛错”不能被适配层翻译成“这次输入已经成功保存”。

`ON CONFLICT (id)` 明确针对 id 的唯一冲突，不会把缺失拥有者、非法类型或非空约束失败都转为成功。若改成 DO UPDATE，则必须定义冲突时允许更新什么、是否校验拥有者和旧版本，是否可能覆盖别人的内容。当前记录创建是生成新身份，不因原文相同而合并，也没有“撞上 ID 就覆盖”的规则，因此不能用 upsert 直接替代已有 create。

配套文件接着用另一个 ID 保存相同的 First version.：

```sql
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('40000000-0000-4000-8000-000000000005',
        '10000000-0000-4000-8000-000000000001', 'First version.')
RETURNING id, original_text;
ROLLBACK;
```

这次应返回一行，因为当前没有原文唯一约束；最后回滚整组实验。第一次是身份冲突，第二种是内容相同但身份不同，数据库遵守的是已经声明的规则。

需要安全重试时，还要知道本次操作的身份、请求内容和已经产生的结果。忽略主键冲突只完成其中非常有限的一步，第二十六章再结合业务命令建立幂等语义。现在先让代码准确处理“插入了一行”“跳过了插入”“因规则被拒绝”这三种结果。

### 删除顺序表达的是生命周期

删除拥有者时，当前外键 RESTRICT 会拒绝仍被记录引用的用户；第十六章提供了对应的失败观察步骤。先删除用户的记录再删除用户，在引用完整性上可能通过，但它仍不等于“账号删除方案已经正确”。一旦未来有历史、文件和其他依赖，还必须定义要保留、匿名化或清理哪些事实。

不要为了让一句 DELETE 成功就改成 CASCADE。级联删除是明确的生命周期决定，不是异常修复按钮。同样，在关联查询中用 INNER JOIN 隐藏查不到父对象的数据，也不能修复错误归属。查询选择、外键动作与业务处置分别承担责任。

本章保留原有用户与记录，没有新增唯一约束或改变删除策略。若真实需求将来要求同一范围下某字段唯一，应先查已有重复、决定归并或拒绝策略，再追加约束迁移；不能把新 CREATE TABLE 文本覆盖到旧库上，假定已有数据自然满足。下一章开始建立这种结构管理能力。

## 17.5 用两个会话看清提交与可见性

### 两个编辑器必须确实对应两个连接

前面的 RETURNING 让我们看到了自己刚写入的内容，但另一个请求何时能读到，需要另一个会话观察。不要用同一编辑器反复 SELECT 证明“大家都看到了”，因为事务总能看到自己此前的修改。

先结束现有实验的事务。在 DBeaver 的连接配置或偏好设置 **Editors → SQL Editor** 中，将为 SQL 编辑器打开独立连接的选项设为 **Always**，再打开两个新编辑器，分别标记为 A 和 B；具体配置说明见 [Multiple datasource connections](https://dbeaver.com/docs/dbeaver/Separate-Connections/)。也可以创建两个使用相同连接参数的连接配置。无论采取哪种方式，都在两个编辑器各自执行：

```sql
SELECT current_database(), current_user, pg_backend_pid();
```

两边必须都是 epp_dev、epp_owner，PID 必须不同。PID 相同就仍是同一会话，先修正连接方式。DBeaver 还可能为元数据或 Data 页开连接，所以本实验只在这两个已验证的 SQL 编辑器中交替执行，不跳到任意 Data 网格代替观察。

打开 `06-session-a.sql` 与 `06-session-b.sql`，分别绑定到 A、B。文件按阶段保存，**不要 Execute SQL Script 整份连跑**；每次选中一条完整 SQL，用 Execute SQL Statement 执行，完成当前阶段的所有语句后再切到另一侧。两边保持 Auto-commit UI 模式，SQL 的 BEGIN 显式开启事务。不要在事务中切换提交模式、重连或启用自动刷新。

先执行 A0，查询专用实验 ID `40000000-0000-4000-8000-000000000006`，应为零行。如果已经存在，说明先前实验可能在提交后中断：核对它的拥有者和原文，按后面的恢复说明处理，不能直接覆盖或继续 INSERT。

### 让 A 写入，让 B 在同一事务中反复读取

B 先显式开始读取事务：

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SHOW transaction_isolation;
```

应显示 read committed。显式写出隔离级别，是为了让实验不受个人连接默认设置影响。随后按下面的顺序进行；B 每次都重新执行相同 SELECT，不能只看旧结果标签。

| 顺序 | A 的动作 | B 的动作与预期 |
| --- | --- | --- |
| 1 | A1：BEGIN，插入实验记录，暂不提交 | B1：查询实验 ID，零行 |
| 2 | A2：COMMIT | B2：重查，读到 Visible after commit. |
| 3 | A3：新事务中改为 Pending edit.，暂不提交 | B3：重查，仍读到 Visible after commit. |
| 4 | A4：ROLLBACK | B4：重查，仍是原文；随后 COMMIT 结束 B 的读事务 |
| 5 | A5：按完整条件删除专用实验行并 COMMIT | B5：重查，零行 |

A1 的关键语句是：

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '3s';
INSERT INTO public.captures (id, user_id, original_text)
VALUES ('40000000-0000-4000-8000-000000000006',
        '10000000-0000-4000-8000-000000000001', 'Visible after commit.')
RETURNING id, original_text;
```

A 的 RETURNING 应已经出现新行，B1 却看不到。B 使用下面这条查询，后面的 B2～B4 也重复它：

```sql
SELECT id, original_text FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000006'
  AND user_id = '10000000-0000-4000-8000-000000000001';
```

等 B1 查询完成后，A2 单独执行 `COMMIT;`。B2 不结束原事务，直接再次查询，就应该读到新行。这说明 READ COMMITTED 并不是整个事务固定住一份结果：普通 SELECT 每次语句开始时取可见快照，可以看见在本次语句开始前已经提交的其他事务修改。

然后在 A 执行 A3：

```sql
BEGIN ISOLATION LEVEL READ COMMITTED;
SET LOCAL lock_timeout = '3s';
UPDATE public.captures SET original_text = 'Pending edit.'
WHERE id = '40000000-0000-4000-8000-000000000006'
  AND user_id = '10000000-0000-4000-8000-000000000001'
  AND original_text = 'Visible after commit.'
RETURNING id, original_text;
```

应返回一行新内容；如果返回零行，先检查实验状态，不去掉条件强行覆盖。B3 普通 SELECT 仍读取旧的已提交版本。PostgreSQL 的多版本并发控制（MVCC）让读者按可见性规则读取行版本，而不是让普通读取直接看到另一事务尚未提交的覆盖结果。这里不使用 FOR UPDATE 等锁定读取，也不让 B 修改同一行；那些动作会引入另外的等待与竞争规则。

A4 执行 `ROLLBACK;`，B4 再读仍是 Visible after commit.。回滚撤销的是 A3 这次事务，A2 已提交的插入仍然存在。B 随后执行 `COMMIT;`，结束自己的读取事务。读事务也应及时结束，不能留着连接隔夜等待下一章。

这组现象只建立当前隔离级别下的普通读行为：看不到他人未提交内容，语句之间可以看到新提交。它不证明所有并发操作都等价于串行，也不保证“先查余额再扣减”等业务过程正确。第二十四、二十五章再从多处写入和竞争推导相应事务策略。

### 区分执行、提交、刷新和结果未知

SQL 编辑器保存文件，只保存文字；服务器执行 RETURNING，表示本次语句产生了结果；COMMIT 完成，才结束这次事务的提交；另一个编辑器刷新或重查，才取得新的结果。这几个动作不能互相代替。即使在客户端看到一行，也要知道它来自哪个会话、哪次执行以及哪种事务状态。

Auto-commit 模式下，不显式 BEGIN 的独立语句通常各自提交；写了 BEGIN 后，事务边界由后续 COMMIT／ROLLBACK 决定。Manual commit 模式则由客户端持续组织事务，保存网格后还可能等待用户提交。本章统一使用前一种模式加显式 SQL，避免同时依赖工具的隐式行为；连接诊断、事务标记与实验结果要能相互对应。

如果 A 在 COMMIT 附近断线，不能从客户端报错断言服务器一定回滚。可能是提交未完成，也可能是已经提交但确认没有送达。重新连接后按固定实验 ID 查询实际结果，再决定继续或清理，不重新生成 ID 盲目插入。相反，明确在未提交事务中断开连接，服务端会在检测到断开并结束会话时撤销未提交事务；网络异常时清理不一定瞬间发生。

B2 看不到行时，依次核对 A2 是否确实提交、PID 是否仍对应原会话、库是否相同、B 是否重新执行以及实际隔离级别。B1 提前看到了行，则先查是否和 A 共用 PID、实验行是否在此前已经提交，或客户端是否代为结束了事务。不要通过重新 seed 抹掉现象；需要证据解释边界。

### 清理专用实验行，保留前置数据

A5 只删除本章创建且内容未被其他动作改变的实验记录：

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';
DELETE FROM public.captures
WHERE id = '40000000-0000-4000-8000-000000000006'
  AND user_id = '10000000-0000-4000-8000-000000000001'
  AND original_text = 'Visible after commit.'
RETURNING id;
COMMIT;
```

正常流程返回一行。若结果为零行，先检查已经清理、仍有未结束事务、原文被改动等情况；不要删掉 WHERE 条件来追求“删成功”。中途退出后恢复，也先在原会话回滚未提交修改，再读取此 ID：不存在就无需清理；存在且与本章固定拥有者和原文相符，才使用这一段。内容不同则查明来源并保留，不假定任何 `400...` 开头的行都可删除。

B5 查询应为零行。最后在两个编辑器确认没有未结束事务，再运行第十六章 `03-inspect-model.sql`，核对原始用户和两条记录、内容与时间均保留。前面 `02`、`03`、`05` 的实验也应已经各自回滚。中断后恢复依靠已保存脚本、固定身份和实际查询，不需要重建数据库。

本章得到的是一套可解释的读写方式：条件限定集合，排序定义顺序，JOIN 和分组决定结果粒度，参数化隔开输入与结构，约束拒绝不合法状态，事务决定提交与可见性。下一章会引入 Prisma，先解释它管理哪些重复工作，再把已经存在的结构纳入迁移基线；这些 SQL 判断仍是审查 ORM 行为和排错的依据。

日常应用入口仍为 `npm run dev` 的断点与自动重启；生产产物仍通过 `npm run check`、`npm start` 管理。本章没有新增驱动或运行依赖，database 下的实验不进入应用构建，保存 SQL 不会自动执行到数据库。应用查询、ORM、连接池与响应映射在第十九章才接到这批数据。

时间参考（估算）：阅读约 100～120 分钟；筛选、写入回滚、关联聚合、参数与双会话操作另加约 55～75 分钟。按正文约 7700 个汉字、170 余行 SQL／JS／命令，以及关联与事务结果对照估算，环境沿用前两章，支线单列，尚未经过读者实测。

## 知识支线

- [支线 17A：为什么 JOIN 后数量变多了](side-01-join-multiplicity.md)：用独立只读数据对照两个一对多关联的相乘，推导先聚合再关联，并解释 NOT IN 遇到 NULL 的结果。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| SELECT／FROM／WHERE | 定义输出列、来源和目标行 | 逻辑含义不等同物理执行顺序 |
| ORDER BY／ASC／DESC | 明确列表顺序与唯一补充键 | 创建时间顺序与 Map 插入顺序不同 |
| LIMIT／OFFSET | 从有序结果中取一段 | 唯一排序不固定跨请求数据集；不传上限仍可能全量返回 |
| strpos | 实现当前字面、大小写敏感搜索 | 找不到返回 0；不同于 LIKE 通配模式 |
| INSERT／UPDATE／DELETE／RETURNING | 写入并观察实际影响 | 零行不一定是错误，返回不等于事务已提交 |
| JOIN／LEFT JOIN／ON | 按关系组合行或保留未匹配对象 | 外连接占位行不是实际存储的空记录 |
| GROUP BY／count／HAVING | 改变结果粒度，统计并筛组选项 | count(*) 与 count(非空主键) 在外连接中不同 |
| EXISTS／NOT EXISTS | 表达是否存在匹配对象 | 不把匹配的多行带入外层结果 |
| PREPARE／EXECUTE／DEALLOCATE | 观察固定结构与值参数分离 | 当前会话作用域，不把外部值拼成 EXECUTE 文本 |
| 动态条件／结构白名单 | 增减条件并限定排序选择 | 值参数不能绑定列名或 SQL 方向 |
| ON CONFLICT DO NOTHING | 观察唯一冲突时跳过写入 | 不验证相同内容，不自动构成幂等 |
| READ COMMITTED／MVCC | 解释普通读看到哪些行版本 | 每条语句取得快照，能看到自己先前的写入 |
| pg_backend_pid／事务标记 | 确认会话与操作边界 | 编辑器标签、数据源名称不同不证明 PID 不同 |
| SET LOCAL lock_timeout | 限制实验等待锁的时长 | 不限制整个执行时长，超时后仍需回滚 |

官方查阅：[SELECT](https://www.postgresql.org/docs/18/sql-select.html)、[表表达式与 JOIN](https://www.postgresql.org/docs/18/queries-table-expressions.html)、[LIMIT 与 OFFSET](https://www.postgresql.org/docs/18/queries-limit.html)、[字符串函数](https://www.postgresql.org/docs/18/functions-string.html)、[RETURNING](https://www.postgresql.org/docs/18/dml-returning.html)、[子查询表达式](https://www.postgresql.org/docs/18/functions-subquery.html)、[PREPARE](https://www.postgresql.org/docs/18/sql-prepare.html)、[INSERT 与冲突处理](https://www.postgresql.org/docs/18/sql-insert.html)、[事务隔离](https://www.postgresql.org/docs/18/transaction-iso.html)。文档用于回查具体行为，查询与设计依据已随例子展开。

[上一章：关系建模](../chapter-16-relational-modeling/chapter.md) · [返回第三篇](../README.md) · [返回全书目录](../../README.md)
