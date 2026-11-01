# 支线 17A：为什么 JOIN 后数量变多了

正文只关联用户和记录，每条记录恰好找到一个用户，很容易形成“JOIN 只是多拿几列”的印象。一旦同时关联两个一对多集合，这个认识就不够用了。下面用只读输入观察行如何增加，不给 EPP 新增标签、评论或其他功能。

配套文件为 `database/chapter-17/08-join-multiplicity.sql`，在 DBeaver 的空闲 SQL 编辑器中运行，逐个查看结果页。所有输入由 VALUES 在查询内构造，不修改 public.users 或 public.captures；这里的 1、2 是局部整数代号，不是主线 UUID。

## 两个一对多为什么会相乘

假设记录 1 有两个标签 work、daily，三条备注 11、12、13；记录 2 没有标签，只有备注 21。我们想展示每条记录的标签数与备注数。

最直接的做法是连续关联。先看未聚合的行：

```sql
WITH captures(id) AS (VALUES (1), (2)),
tags(capture_id, tag) AS (VALUES (1, 'work'), (1, 'daily')),
notes(capture_id, note_id) AS (VALUES (1, 11), (1, 12), (1, 13), (2, 21))
SELECT c.id, t.tag, n.note_id
FROM captures AS c
LEFT JOIN tags AS t ON t.capture_id = c.id
LEFT JOIN notes AS n ON n.capture_id = c.id
ORDER BY c.id, t.tag, n.note_id;
```

WITH 给当前语句中的结果命名，称为公共表表达式（CTE）。每个 VALUES 只提供本次查询的输入；后面的 FROM 可以像引用表一样使用这些名称。它们不是永久表，下一条语句需要重新声明。CTE 也不天然意味着数据库一定先计算并物化成一张临时表，执行策略仍由数据库决定。

记录 1 的每个标签都能和它的三条备注组合，因此得到：

| 记录 | 标签 | 备注 |
| --- | --- | --- |
| 1 | daily | 11 |
| 1 | daily | 12 |
| 1 | daily | 13 |
| 1 | work | 11 |
| 1 | work | 12 |
| 1 | work | 13 |
| 2 | NULL | 21 |

这七行符合当前 SQL 的含义。标签与备注只通过记录 ID 关联，没有“某个标签对应某条备注”的额外关系，所以它们在一条记录内部形成所有组合。记录 2 因 LEFT JOIN 保留了一行 NULL 标签，再与它唯一的备注配对。

此时按记录分组，`count(t.tag)` 与 `count(n.note_id)` 对记录 1 都会得到 6，而不是 2 和 3。GROUP BY 只能把已有组合分组，它不会追溯每一列在关联前有几条独立事实。配套文件第二条查询展示这个错误统计。

在 DBeaver 排查这种数量异常时，先运行未聚合版本，把关联两端的身份列都放到结果网格，按记录 ID 排序。不要一开始只看统计数字，也不要立即添加 DISTINCT。找到从哪一步开始每条事实被复制，就能定位需要改变的结果粒度。

## 先把每个集合归到相同粒度，再关联

目标是一行一条记录，标签只需要一个计数，备注也只需要一个计数。可以先各自按 capture_id 聚合，每一侧都变成“每条记录至多一行”，再关联：

```sql
WITH captures(id) AS (VALUES (1), (2)),
tags(capture_id, tag) AS (VALUES (1, 'work'), (1, 'daily')),
notes(capture_id, note_id) AS (VALUES (1, 11), (1, 12), (1, 13), (2, 21)),
tag_counts AS (
  SELECT capture_id, count(*) AS n FROM tags GROUP BY capture_id
),
note_counts AS (
  SELECT capture_id, count(*) AS n FROM notes GROUP BY capture_id
)
SELECT c.id, coalesce(t.n, 0) AS tag_count, coalesce(n.n, 0) AS note_count
FROM captures AS c
LEFT JOIN tag_counts AS t ON t.capture_id = c.id
LEFT JOIN note_counts AS n ON n.capture_id = c.id
ORDER BY c.id;
```

结果应为记录 1：2、3；记录 2：0、1。记录 2 在 tag_counts 中没有行，外连接结果中的 t.n 为 NULL；COALESCE 返回第一个非 NULL 的参数，这里把“没有匹配的计数组”转换为 0。它不是修改原表缺失值，也不能无条件用于所有 NULL，例如“尚未计算的成绩”不一定等于零分。

为什么不直接用 `count(DISTINCT t.tag)`？如果需求就是统计不同标签值，它可以是正确方案；但必须先确认去重身份。例如两笔合法付款恰好金额相同，`sum(DISTINCT amount)` 会把它们当成一份金额，少算实际收入。对行的重复展开和业务值相等，不能用同一条规则处理。

预聚合让每一侧带着明确的输出粒度进入下一次关联，也避免在概念上先构造许多无用组合再去重。不过它不是永远更快的结论：筛选范围、索引和数据分布仍影响执行计划。本支线先解决正确性，第三十章再比较成本。

如果需求只是“有标签的记录”，用 EXISTS 保留记录本身的粒度；如果需要标签明细，返回多行就是合理表示；如果需要每条记录带一个数组，应先定义排序、重复与空数组含义，再选择聚合或应用层组织。不能仅因为前端希望一个对象，就忽略数据库查询中每行到底代表什么。

## NOT IN 遇到 NULL，为什么找不到明明不存在的值

还有一种结果看起来反常：想找不在某个集合里的 ID，却得到零行。运行：

```sql
SELECT 42 AS missing_id
WHERE 42 NOT IN (SELECT id FROM (VALUES (1), (NULL::integer)) AS other(id));
```

42 不等于 1，但与 NULL 的比较未知。要证明“与集合中每一个值都不同”，还缺少对那个未知值的判断，所以整体不是 true，WHERE 不保留它。这里没有输出行，并不意味着数据库证明 42 在集合里。

改成询问“是否没有已知相等的匹配行”：

```sql
SELECT 42 AS missing_id
WHERE NOT EXISTS (
  SELECT 1 FROM (VALUES (1), (NULL::integer)) AS other(id) WHERE other.id = 42
);
```

内层两行都不能使 `other.id = 42` 为 true，所以没有匹配行，外层得到 42。两种表达式在有 NULL 时语义不同，不能把 NOT EXISTS 当成任何场景下对 NOT IN 的无条件文本替换。若外层 ID 自己也允许 NULL，还要另外决定“缺失身份”是否应该被保留。

主线 captures.user_id 是 NOT NULL，因此从它直接取出的拥有者 ID 没有这种 NULL；但把同样查询迁移到允许缺失的字段、导入暂存数据或外连接结果时，前提就可能改变。排查时先看列约束与子查询的真实输入，再判断需要“排除所有值”还是“没有匹配”。

把本支线接回模型设计：外键和唯一性帮助我们预测一条行会匹配多少行；外连接会人为引入 NULL；聚合改变结果粒度；子查询用于表达存在条件。能够沿这些变化解释结果，就能审查复杂查询和 ORM 生成的 SQL，而不是看到数量不对就随机加 DISTINCT。

时间参考（估算）：阅读约 20～25 分钟；只读查询与结果网格对照另加约 10～15 分钟。不创建或保留新的数据库对象，尚未经过读者实测。

## 附录：本支线必要技术点速查

| 名称 | 用途 | 必要注意点 |
| --- | --- | --- |
| WITH／VALUES | 在一条语句中组织独立输入和中间结果 | 不创建永久表，也不承诺必然物化 |
| 连续一对多 JOIN | 观察匹配组合的数量 | 两侧集合可能在同一父对象下相乘 |
| 预聚合 | 先统一输出粒度再关联 | 正确性依据与具体性能判断分别进行 |
| COALESCE | 把不存在的计数组表示为 0 | 缺失值的替代含义取决于业务 |
| DISTINCT | 对明确选择的值去重 | 相同金额、相同文本未必是同一业务事实 |
| NOT IN／NOT EXISTS | 比较排除集合与不存在匹配 | NULL 会改变前者的真假结果 |

官方查阅：[表表达式](https://www.postgresql.org/docs/18/queries-table-expressions.html)、[WITH 查询](https://www.postgresql.org/docs/18/queries-with.html)、[聚合函数](https://www.postgresql.org/docs/18/functions-aggregate.html)、[条件表达式](https://www.postgresql.org/docs/18/functions-conditional.html)、[子查询表达式](https://www.postgresql.org/docs/18/functions-subquery.html)。

[返回第十七章](chapter.md) · [返回第三篇](../README.md)
