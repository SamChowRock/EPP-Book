# 支线 18A：同一个字符串，为什么两层校验会给出不同答案

正文选择 text，同时保留应用层 2000 个 UTF-16 单元的限制。这个安排容易被理解成“数据库不管校验”，也容易被另一种过度自信取代：“把同一个正则复制到 SQL 就完全一样。”要判断两层能否共享规则，先看它们到底在数什么、接受什么，以及遇到缺失时如何计算。

本支线不增加业务表，也不修改已提交记录。数据库查询保存在 `database/chapter-16/06-text-boundaries.sql`，Node 对照在 `07-text-boundaries.mjs`。延续正文的 UTF8 数据库和 Node 环境；SQL 默认在 DBeaver SQL 编辑器逐条执行。完整 Node 对照从代码仓库根目录运行：

```bash
node database/chapter-16/07-text-boundaries.mjs
```

在 DBeaver 中打开 `database/chapter-16/06-text-boundaries.sql`，确认开发连接，使用 Execute SQL Script 运行整份只读对照，在下方各结果页查看输出。psql 的备用执行方式为 `\i database/chapter-16/06-text-boundaries.sql`。下面再按问题逐段解释，每段也可单独运行。

## 从一个表情看清三个长度

在 Node 中执行：

```js
for (const value of ['A', '中', '😀', 'e\u0301']) {
  console.log({ value, utf16Units: value.length,
    codePoints: [...value].length,
    utf8Bytes: Buffer.byteLength(value, 'utf8') });
}
```

在 PostgreSQL 中执行对应查询：

```sql
SELECT label, char_length(value) AS characters, octet_length(value) AS utf8_bytes
FROM (VALUES
  ('ASCII', 'A'),
  ('CJK', '中'),
  ('supplementary', '😀'),
  ('combining', U&'e\0301')
) AS samples(label, value);
```

VALUES 在这里直接构造临时的查询输入，不是向某张表写入。`AS samples(label, value)` 给这组输入和两列命名，后面的表达式才能读取 value。`U&'e\0301'` 表示 e 后面跟一个 U+0301 组合重音符，不是一个预先组合好的 é。预期对照如下：

| 输入 | JS UTF-16 单元数 | Unicode 码点数／本例 PG 字符数 | UTF-8 字节数 |
| --- | --- | --- | --- |
| A | 1 | 1 | 1 |
| 中 | 1 | 1 | 3 |
| 😀 | 2 | 1 | 4 |
| e 与组合重音 | 2 | 2 | 3 |

UTF-16 用两个代码单元表示某些码点；UTF-8 使用可变数量的字节；一个看起来连在一起的字形又可能由多个码点构成。因此这里有编码单元、码点、字节与视觉字形几种不同概念。不能看屏幕上“只有一个字”，便认为每种长度函数都应该返回 1。

现在改变输入规模：

```js
console.log('😀'.repeat(1001).length); // 2002
```

```sql
SELECT char_length(repeat('😀', 1001)) AS postgres_characters;
-- 1001
```

现有接口会拒绝这段 2002 单元的原文，但 `varchar(2000)` 的长度限制允许它。这已经足以证明两者不等价，不必等到接口线上出现问题再怀疑驱动。

如果未来产品真正想限制“用户看到的字符数量”，应该先定义字素分段等规则，再同时修改契约描述、输入检查、存量兼容和必要存储限制；不能把 `.length` 换成 `char_length` 当成无行为变化的重构。若限制是控制请求内存，则看字节上限更直接，但它回答的又不是用户能写多少字。前面的 16 KiB 请求体限制与 2000 单元原文限制之所以同时存在，就是因为它们约束不同资源与行为。

## NULL 不是空字符串，unknown 也不是 JavaScript 的 false

比较下面三个输入：没有提供原文，提供空字符串，提供一个普通空格。数据库用 NULL 表示缺失或未知，`''` 表示已知长度为零的文本，`' '` 表示已知有一个字符。

```sql
SELECT label, value IS NULL AS is_null,
       char_length(value) > 0 AS nonempty_check
FROM (VALUES ('missing', NULL::text), ('empty', ''), ('space', ' '))
  AS samples(label, value);
```

预期结果分别是：NULL 的 is_null 为 true，nonempty_check 为 NULL；空串的 is_null 为 false，nonempty_check 为 false；空格的 is_null 为 false，nonempty_check 为 true。psql 默认可能把 NULL 显示成空白单元格，可以在 psql 执行 `\pset null '(NULL)'` 让它容易辨认；这是显示设置，不修改数据。

为什么 NULL 比较不能直接当 false？它表达“没有足够的信息判断”。`NULL = NULL` 也不会得到 true；查缺失应该写 IS NULL。WHERE 只保留条件为 true 的行；CHECK 则拒绝 false，允许 unknown。两种位置的接受条件不同，不能从一条 WHERE 的结果推断 CHECK 对 NULL 的行为。

因此本章列定义分成两部分：NOT NULL 禁止缺失，CHECK 禁止已知为空字符串。去掉任何一项都会放宽不同的状态。再往外一层，业务的“非全空白”还没有被这两个条件覆盖。

给 nullable 列写 DEFAULT 也不能禁止显式 NULL。若某字段将来允许“尚未填写”，用 NULL 能保留这种语义；若用空串代替，则可能把“尚未填写”与“用户明确清空”混在一起。第二十三章增加中文意图时，会实际面对旧记录没有该信息的问题；当前先学会区分这些状态，不提前给所有缺失值填一个看起来方便的字符串。

## 两端都有 trim，也不表示行为相同

Node 中的 `'\t'.trim()` 得到空字符串。PostgreSQL 的 btrim 默认修剪的是普通空格，不是 JS trim 所定义的完整空白集合：

```sql
SELECT char_length(btrim(E'\t')) AS tab_after_btrim,
       char_length(btrim(' ')) AS space_after_btrim;
```

结果应是 1 和 0。`E'\t'` 使用 SQL 的转义字符串语法表达一个制表符。我们只需这个反例，就能否定 `btrim(original_text) <> ''` 与现有 JS 非空白检查完全等价的假设。数据库正则、字符分类与区域设置还有自己的规则，不能看到两个表达式都写“空白”就断言它们相同。

另外，判定合法与修改数据是两项操作。现有业务可以用 trim 的结果判断是否全空白，但保存的仍是 originalText。若 INSERT 时写 `btrim(original_text)`，即使校验看似成功，也会丢失用户两端空格，违背“原文保留”的约定。

类似地，显式转换可能直接损失内容：

```sql
SELECT 'abcdef'::varchar(3) AS explicit_cast_truncates;
-- abc
```

这不是用 varchar 限长时所有写入路径的统一表现，而是显式类型转换的截断行为。不能先截断再检查“现在长度已经合法”，这样检查通过的已不是原来的输入。数据库接入时应检查是否拒绝、是否转换、是否保持原文三个事实，不能只看最终有没有报错。

## JSON 能表示，不等于数据库 text 能原样保存

还有两种长度正常却容易被忽略的输入。在 Node 中运行：

```js
for (const [label, value] of [['nul', 'a\u0000b'], ['loneSurrogate', 'a\uD800b']]) {
  console.log({ label, json: JSON.stringify(value), wellFormed: value.isWellFormed(),
    sameAfterUtf8RoundTrip: Buffer.from(value, 'utf8').toString('utf8') === value });
}
```

第一种含 U+0000，它是一个真实字符，不是 SQL NULL，也不是字符串终止后的“什么都没有”。Node 字符串和 JSON 可以表示它，UTF-8 往返也能保留，但 PostgreSQL 的 text 不允许这个字符。

第二种含孤立代理项，JS 字符串可以容纳它，JSON.stringify 可以把它转义输出，但它不是良构 Unicode 字符串。isWellFormed 应为 false；经本例 UTF-8 编码再解码后会变成替代字符，往返比较应为 false。若数据库驱动的编码路径也做了这种替换，应用不能把“没有抛错”当成原文已原样保存。

本章不把这些值写进业务表。实验的目的，是在真正替换存储之前明确输入域：哪些值能通过旧接口，哪些值能被新存储忠实表示。对这两种输入，接入阶段应在业务输入边界明确拒绝并返回输入错误；不能偷偷删除零字符或调用 toWellFormed 修改原文，再声称保持了契约。那会是数据变换，应有另外的需求和兼容说明。

这也解释了为什么“数据库 text 接受的值”不应直接等于“API 允许的值”：数据库能接受超长或全空白文本，接口可以更严格；反过来，JS 能表示的所有字符串也不是数据库 text 的子集。两者必须有明确交集和拒绝策略，第二十一章对实际写入链路落实，后面的批量导入也要使用相同入口规则。

## 回到主线，选择校验位置时先回答什么

如果一条规则是引用必须存在、身份必须唯一，数据库已有合适的原生机制，应让数据库维护这项跨行事实，而不是只在应用中“先查一下”。如果规则涉及当前公开契约的特定字符串单位、空白或表达形式，先明确规则定义与全部写入入口，再判断是否需要将其完整移入数据库。不能把两套不同定义同时称为“相同校验”。

当前模型的分工是清楚且有限的：数据库确保身份、归属、非空与非空串；应用继续承担完整原文规则。直接 SQL 只使用已知合法的开发样本，不把这些文件当作通用导入器。以后出现独立导入程序时，新的写入者必须纳入同一规则；如果允许任意 SQL 写入而又要求所有行满足完整业务契约，就需要收紧权限与数据库约束，不能继续依赖口头约定。

回看主线两条示例：它们没有空白判定歧义、长度超限或不可表示字符；第一条的空格需要保存，第二条的撇号需要正确表达。理解本支线后，就能解释为什么选 text、为什么没有把 2000 直接写成 varchar 长度，以及接入层究竟还欠哪些具体工作。

时间参考（估算）：阅读约 25～32 分钟；Node 与 SQL 对照操作另加约 10～15 分钟。按约 2400 个汉字、近 30 行代码／命令及六组对照和结果解释估算，未经过读者实测；不含重复安装环境。

## 附录：本支线必要技术点速查

| 名称 | 用途 | 必要注意点 |
| --- | --- | --- |
| String.length／字符串迭代 | 比较 UTF-16 单元与码点 | 都不直接表示视觉字形数 |
| Buffer.byteLength／Buffer.from | 观察 UTF-8 字节与编码往返 | 孤立代理项可能被替换 |
| isWellFormed／JSON.stringify | 判断 Unicode 良构性、观察转义 | 可序列化不等于 PostgreSQL text 可原样表示 |
| char_length／octet_length | 比较数据库字符数和字节数 | 当前环境编码为 UTF8 |
| VALUES／AS | 无需建表即可构造查询样本 | 本例不持久化任何业务行 |
| IS NULL／CHECK／WHERE | 区分缺失与真假、unknown | CHECK 与 WHERE 对 unknown 的处理不同 |
| btrim／E 字符串／U& 字符串 | 观察空白和明确字符输入 | SQL 默认修剪集合不同于 JS trim |
| ::varchar(n) | 演示显式转换截断 | 不得把静默截断当成输入验证 |

官方查阅：[PostgreSQL 字符类型](https://www.postgresql.org/docs/18/datatype-character.html)、[字符串函数](https://www.postgresql.org/docs/18/functions-string.html)、[约束](https://www.postgresql.org/docs/18/ddl-constraints.html)、[SQL 常量与标识符](https://www.postgresql.org/docs/18/sql-syntax-lexical.html)、[ECMAScript String 定义](https://tc39.es/ecma262/multipage/text-processing.html)、[Node Buffer](https://nodejs.org/docs/latest-v24.x/api/buffer.html)。

[返回第十八章](chapter.md) · [返回第三篇](../README.md)
