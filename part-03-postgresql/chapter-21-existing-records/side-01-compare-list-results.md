# 支线 21A：列表条数一样，怎样找出少了、重复了或排错的那条

第 21 章把同一个列表从 Map 接到了 PostgreSQL。原文都能显示，前后也各有三项。接手页面的人问：“那我还需要逐条看吗？”如果这三项决定用户点开哪条详情，就至少要弄清三个问题：身份有没有被替换，同一身份出现了几次，用户看到的位置有没有改变。一次 count 回答不了其中任何一个。

在 DEV 的 DBeaver 新编辑器打开配套 `part-03/chapter-21` 的 `database/chapter-19/04-compare-list-results.sql`。前两条各自用 VALUES 或 JSON 构造输入，第三条才读取本章种子。所有操作都是查询。阅读约 16～21 分钟，结果对照另加约 12～18 分钟。做最后一段前先完成 21.2 的旧记录读回。

## 先用两张小清单说明怎样才算相同

预期 ID 是 101、102、103，收到 101、102、102。101 和 102 的原文恰好都叫 cook，两个 ID 代表两条独立的素材。少的是 103，多出来的是第二份 102。假如只按文本去重，两个不同 ID 的同文素材又会被合成一条。请先在纸上按 **ID 加原文** 一份对一份划掉：从预期一侧剩下的叫 missing；交换左右，从收到一侧剩下的叫 extra。数据库可以直接表达这项操作：

```sql
WITH expected(id, original_text) AS (
  VALUES (101, 'cook'), (102, 'cook'), (103, 'tea')
), received(id, original_text) AS (
  VALUES (101, 'cook'), (102, 'cook'), (102, 'cook')
), missing AS (
  SELECT id, original_text FROM expected
  EXCEPT ALL
  SELECT id, original_text FROM received
), extra AS (
  SELECT id, original_text FROM received
  EXCEPT ALL
  SELECT id, original_text FROM expected
)
SELECT 'missing' AS side, id, original_text FROM missing
UNION ALL
SELECT 'extra' AS side, id, original_text FROM extra
ORDER BY side, id;
```

网格按 side 排序，先看到 extra 的 102 / cook，再看到 missing 的 103 / tea。EXCEPT ALL 对相同的一整行相消出现次数，多出的每一份都留下。普通 EXCEPT 会先按集合语义处理重复。试着只把两个 ALL 从 EXCEPT 后删掉：你仍能看到 103 缺失，可是右侧多出来的 102 消失了，因为 102 在两侧都出现过。再把收到的最后一行修为 103 / tea，恢复两个 ALL，结果应为零行。

为什么需要比两个方向？只查“预期减收到”，在对方已包含全部应有项、却额外附带一条时，会得到空结果。为什么明知 ID 唯一还要比原文？数据表的主键能保证这张表里不存在第二个同键行，却不能防止查询关联后复制行或响应映射错拿文本。把收到的 103 / tea 改成 103 / water，两边各剩一个 103，分别带旧、新文本。这种差异指向字段值，和“整个 ID 不见了”需要调查的位置不同。

## 同样三份内容，换个顺序还算通过吗

现在恢复正确的三条内容，只交换前两项。刚才的双向相减会得到零行：这项运算只比较值和次数，不看两张清单怎样排列。对于要渲染成列表的 JSON，位置也是契约。可以先给两侧各自的第一个元素记作位置 1，再按位置配对：

```sql
WITH expected(pos, id) AS (
  VALUES (1, 101), (2, 102), (3, 103)
), received AS (
  SELECT pos, (item->>'id')::integer AS id
  FROM jsonb_array_elements('[{"id":102},{"id":101},{"id":103}]'::jsonb)
       WITH ORDINALITY AS entries(item, pos)
)
SELECT coalesce(e.pos, r.pos) AS pos, e.id AS expected_id, r.id AS received_id
FROM expected AS e
FULL JOIN received AS r ON r.pos = e.pos
WHERE e.id IS DISTINCT FROM r.id
ORDER BY pos;
```

先看 FROM：jsonb_array_elements 把数组拆成元素，WITH ORDINALITY 将每个元素在输入数组中的位置一起带出来，从 1 开始。entries(item, pos) 给这两列命名。再看 SELECT：`item->>'id'` 取出 id 字段的文本，`::integer` 将这组局部整数代号转成与预期列一致的类型。真实接口的 ID 是 UUID，下一组查询会改为比较文本形式的完整 UUID。网格应出现两行，位置 1 是 101 对 102，位置 2 是 102 对 101。第三行相同，已经被 WHERE 消掉。如果先把 received 按 ID 重排再编序，就抹掉了原本要检查的页面顺序。只有预期一侧按契约生成顺序，收到一侧必须保留实际顺序。

为何不用普通的不等号？把 JSON 改成只剩第一项。FULL JOIN 会为缺席侧补上 NULL，`101 <> NULL` 的结果未知，进不了只保留真的 WHERE。这里两侧的有效 ID 都非空，用 IS DISTINCT FROM 能把“一边有值、一边缺席”也留下。如果比较的字段本身允许 NULL，还应额外观察那一侧的位置是否存在；一条字段为空的真实行和根本没有这一行是不同情况。下面的完整对照显式保留这个判断。

## 把小清单接回一次真实的列表响应

先确认 API 与 DEV 对应同一个数据库，期间暂停其他写入。用 Postman 对第 21 章主服务发送 `GET /captures?q=cook&limit=2`，移除 If-None-Match，保存这次 200 响应的 items 数组。另在 DEV 编辑器查看配套第三条语句。预期一侧只按固定开发用户、字面片段、创建时间和 ID 的明确顺序取两项；收到一侧保留数组下标。这里按**第二十一章公布的时间与 ID 顺序**验收。旧 Map 按插入顺序，两者遇到同一毫秒时本来就可能排序不同，不能把旧实现的每个偶然结果都当成正确答案。

```sql
WITH expected AS (
  SELECT row_number() OVER (ORDER BY created_at, id) AS pos,
         id::text AS id, original_text
  FROM public.captures
  WHERE user_id = '10000000-0000-4000-8000-000000000001'
    AND strpos(original_text COLLATE "C", 'cook') > 0
  ORDER BY created_at, id
  LIMIT 2
), received AS (
  SELECT pos, item->>'id' AS id, item->>'originalText' AS original_text
  FROM jsonb_array_elements($sample$[
    {"id":"20000000-0000-4000-8000-000000000001","originalText":"  I am not much of a cook.  "},
    {"id":"20000000-0000-4000-8000-000000000002","originalText":"I'm learning to cook."}
  ]$sample$::jsonb) WITH ORDINALITY AS entries(item, pos)
)
SELECT coalesce(e.pos, r.pos) AS pos,
       e.id AS expected_id, r.id AS received_id,
       e.original_text AS expected_text, r.original_text AS received_text
FROM expected AS e
FULL JOIN received AS r ON r.pos = e.pos
WHERE e.pos IS NULL OR r.pos IS NULL
   OR e.id IS DISTINCT FROM r.id
   OR e.original_text IS DISTINCT FROM r.original_text
ORDER BY pos;
```

语句内的数组是随书两条种子的示例。先拿它核对种子，再在副本里填入刚才从 Postman 取得的合成练习数据（用实际 items 数组整体替换示例数组，保留两侧的 `$sample$`，样本文本不含该分隔符）。如果原库还保存了其他符合条件的行，示例数组可能产生差异，应按实际 HTTP 响应再验一次。不要替换掉预期的一侧，也不要为得到零行而修改业务表。若响应保留了 createdAt 字段，可以原样粘入；这个查询只抽取 id、originalText 和位置，时间本身仍需按 21.2 的 epoch 方法另验。

如果零行意味着对上了，怎样知道自己的检查真的会报错？保留一份未改的响应数组，只在副本中删去第一条原文两端的空格，或者在两条 ID 不同的情况下交换两个完整元素。前一种改变在标准种子上应报一个位置，后一种报两个；缺少第二项则只有位置 2 缺席。最后换回原数组应再次为零。两侧意外都为空也会得到零行，开始之前先确认 21.2 的两条 cook 种子确实在原库能按 ID 读回。

实际排查时，先看集合差异，再解释位置差异：漏了首项会让后面很多位置一起变化，不能据此声称每一行都坏了。若第四篇将来改变列表的排序规则，就应当先改清预期，再运行同样的比较。对于本章，这份证据回答的是这次请求的身份、原文、次数和顺序；详情、错误响应和写入仍沿 21.2、21.3 各自的实际入口验收。

## 附录：本支线必要技术点速查

| 想查什么 | 保留什么证据 |
| --- | --- |
| 少了哪项、额外出现几次 | 同样的列、相容的类型，双向 EXCEPT ALL |
| 同一 ID 的值是否变了 | 除 ID 外一起投影需要比较的公开字段 |
| 哪个位置开始不同 | 给预期按规则编号，给收到的数组保留原始序号，按位置 FULL JOIN |
| 缺行和空字段 | 比较位置是否存在，用 IS DISTINCT FROM 比较可空值 |

[PostgreSQL 18 查询集合运算](https://www.postgresql.org/docs/18/queries-union.html) · [返回第二十一章](chapter.md) · [返回第三篇](../README.md)
