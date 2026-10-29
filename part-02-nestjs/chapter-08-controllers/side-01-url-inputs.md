# 支线 8A：URL 中的字符怎样变成参数

正文用 `@Param()` 和 `@Query()` 取得输入，但它们拿到的不是地址栏里那串字符的原样复制。字符先被 URL 规则组织，再经过路由器或查询解析器处理。若分不清这些阶段，空格、加号、重复键就很容易被解释成业务数据错误。

这条支线先用 Node 的 URL API 观察表示过程，再回到本章的 Express 查询解析。示例只使用虚构文本，不读取业务记录；不需要启动服务。

时间参考（估算）：阅读约 12～16 分钟；URL 实验与查询对照另加约 8～12 分钟。

## 先分开结构字符和数据字符

假设要搜索原文片段 `C++ & Node`。直接写：

```text
/captures?q=C++ & Node
```

这不是可靠的表示。`&` 在查询串里分隔字段，`+` 在常见的表单式查询解析中表示空格，空格本身也需要处理。接收方并不知道你心里打算把整个后半段都当成一个关键词；它只能按协议规则解析。

编码解决的是“这个字符属于结构，还是数据”的歧义。要表达数据中的加号，可以编码成 `%2B`；数据中的 `&` 编码成 `%26`。百分号后面的十六进制对表示字节，非 ASCII 文本通常先变成 UTF-8 字节，再逐字节编码。因此地址中的可见长度不是原文字符数，不能用 URL 的编码长度替代正文里的 UTF-16 文本长度规则。

不要手动对整条 URL 调用 `encodeURIComponent()`：那会把原本有结构意义的斜杠、问号等也当成数据。应该让 URL 对象管理结构，再把单个参数值交给 searchParams。字符串拼接只有在你逐一处理好这些边界时才成立，使用结构化 API 更容易保持正确。

新增并运行 `examples/url-inputs.mjs`：

```javascript
const cases = [
  'q=hello+world',
  'q=hello%2Bworld',
  'q=one&q=two',
  'q=',
  'limit=01',
  'q=%252F',
];
for (const query of cases) {
  const url = new URL(`/captures?${query}`, 'http://127.0.0.1');
  console.log(query, JSON.stringify({
    first: url.searchParams.get('q'),
    all: url.searchParams.getAll('q'),
    entries: [...url.searchParams],
  }));
}
const url = new URL('http://127.0.0.1/captures');
url.searchParams.set('q', 'C++ & Node');
url.hash = 'only-in-client';
console.log('built:', url.href);
console.log('request target:', url.pathname + url.search);
console.log('decoded once:', url.searchParams.get('q'));
```

```bash
node examples/url-inputs.mjs
```

最后三行应展示下面的关系：

```text
built: http://127.0.0.1/captures?q=C%2B%2B+%26+Node#only-in-client
request target: /captures?q=C%2B%2B+%26+Node
decoded once: C++ & Node
```

构造 URL 时传原始文本，读取参数时拿回原始文本。不要先对值手动 encodeURIComponent，再交给 searchParams，否则百分号又会被编码；这个动作通常会变成双重编码，而不是“更安全”。

## 一次解码的结果，不能无条件再解码

前三组输出中，`hello+world` 解析成 `hello world`，`hello%2Bworld` 解析成 `hello+world`。这说明数据中的加号和表示空格的加号，必须在发送阶段区分。查询规则中的 `+` 约定不能直接套用到所有 URL 部分：路径段里的字面加号通常就是加号，不能自己统一替换为空格。

`q=%252F` 的一次解析结果是字面 `%2F`。如果收到这个值后再执行 `decodeURIComponent()`，它会变成 `/`，业务含义已经改变。重复解码的问题不只在于报错：它可能让某一层看到普通文本，另一层却看到路径分隔或其他特殊字符。决定在哪一层解码，并只按那一层的契约处理，比“多解一次保险”更可靠。

如果业务确实接收一段用户输入的 URL 文本，也要区分“这个字段是一段普通文本”与“现在开始解析该文本所描述的 URL”。解析嵌套数据是另一项明确操作，不能因为字符串里出现百分号就自动执行。

Node 的 URLSearchParams 用于这里的独立观察；它不是 Express simple 解析器本身。二者对本例里的空格、加号和重复字段能形成对应结果，但不能因此假设所有畸形编码和嵌套结构都完全相同。正文显式选择了 simple，HTTP 行为仍以实际适配器和应用约定为准。

## 同一个键出现两次，信息是否已经丢失

对于 `q=one&q=two`，URLSearchParams 的 `get('q')` 返回第一个值，而 `getAll('q')` 能得到两项。若直接 `Object.fromEntries(url.searchParams)`，同名对象属性则会被后项覆盖。相同输入经过不同提取方式，就会得到不同的单值。

这说明“框架帮我解析好了”并没有回答接口接受几个值。你还要决定重复项是否合法：多标签筛选可能需要数组；单一数量上限通常不应该出现两个互相竞争的值。本章把 q 和 limit 都定义为单值，在 Express simple 解析出的值不是字符串时拒绝，因此不会悄悄替调用方选一项。

如果需求变为“同时搜索多个片段”，要先确定是任一片段匹配还是全部匹配，再明确数组表示、数量限制、空项和重复项规则。只把 TypeScript 参数改成 `string[]`，既不会让各种客户端统一序列化方式，也不会替你决定匹配语义。

缺失和空值也不能合并。示例中的 `limit=01` 没有 q：get 返回 null，getAll 返回空数组；`q=` 则存在一个空字符串。在正文的 Express 字段提取中，没有 q 得到 undefined，有 q 但没内容得到空串。我们让前者表示不筛选，后者返回 400，避免把一个填错的筛选条件默默解释成全量查询。

如果产品以后决定空搜索框等于不筛选，也完全可以改变这条约定；但要明确这是接口语义变化，并同步输入处理和客户端调用，不应由 `q || undefined` 偶然决定。

## 路径、查询与片段的边界

示例构造出的 URL 含 `#only-in-client`，而输出的请求目标只有 pathname 和 search。通常由浏览器或 HTTP 客户端处理 URL 时，片段不会作为 HTTP 请求目标发送给服务器。把筛选写在 `#q=coffee` 后面，Controller 不会因为使用了 `@Query()` 就看见它；网页里的 hash 路由需要由前端自行解释，再构造实际请求。

路径参数也有类似的阶段边界。路由器按路径结构匹配 `:id` 后，通常再对匹配段解码。若允许标识符包含斜杠，原始 `/` 和编码 `%2F` 就可能经历不同的匹配过程；不同代理和路由器还可能有各自处理规则。因此“能 encodeURIComponent 就能把任意字符串安全塞进路径段”不是足够完整的接口设计。

EPP 当前生成的 ID 是字面 UUID，不需要上述任意字符能力。第七章设置的边界拒绝含百分号的详情段，本章继续保留：即使把某个 UUID 首字符改成等价百分号编码，也仍然返回 404。这是项目主动选择的旧契约，不能误读成 Nest 的默认行为，更不能据此推断查询值也禁止百分号。

假设换成书签检索，用户提交完整网址作为搜索条件，把它放在 query 的某个值中并用 searchParams 编码，往往比直接拼成详情路径更容易解释。若它是正文里提交的数据，JSON 则承担另一种转义规则。选择输入位置时先考虑数据含义和结构，不用同一种转义函数包打天下。

## 把理解接回本章接口

先用正文的创建接口保存原文 `C++ & Node`，再用下面的命令读取；HTTP 服务需要处于运行状态：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"C++ & Node"}'
curl -i --get --data-urlencode 'q=C++ & Node' \
  http://127.0.0.1:3000/captures
curl -i 'http://127.0.0.1:3000/captures?q=C++'
curl -i 'http://127.0.0.1:3000/captures?q=C%2B%2B'
curl -i 'http://127.0.0.1:3000/captures?q=C%2B%2B&q=Node'
```

第一条查询能找到刚保存的原文。第二条查询实际搜索 `C  `，不会匹配这条记录；第三条搜索字面 C++，能够匹配；最后一条按本章单值契约返回 400。如果同时存在其他记录，检查是否包含目标 ID，不把 items 总数写死。

面对类似故障时，先看发送的是哪个请求目标，再看解析得到什么值，最后检查业务规则。否则你可能为了“搜索不到 C++”而去改 Service 的 includes，结果真正的问题仍在发送端编码。

## 附录：本支线必要技术点速查

| 名称 | 用途 | 注意点 |
| --- | --- | --- |
| URL／searchParams.set | 分开地址结构和参数值 | 传原始值，不先做一次编码 |
| get／getAll | 读取单个值或全部同名值 | 提取方式不能代替接口的重复值规则 |
| `%2B`／`+` | 查询中表达加号／空格 | 不把查询约定套到所有路径字符 |
| hash | 表达 URL 片段 | 通常不进入 HTTP 请求目标 |

官方查阅：[Node.js 24 URLSearchParams](https://nodejs.org/docs/latest-v24.x/api/url.html#class-urlsearchparams)、[WHATWG URL 标准的表单式解析](https://url.spec.whatwg.org/#application/x-www-form-urlencoded)、[Express 5 查询解析变化](https://expressjs.com/en/guide/migrating-5/#req.query)。

[返回第八章](chapter.md#本章知识支线) · [返回第二篇](../README.md)
