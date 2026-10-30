# 支线 8A：URL 中的字符怎样变成参数

正文用 `@Param()` 和 `@Query()` 取得输入，但它们拿到的不是地址栏里那串字符的原样复制。字符先被 URL 规则组织，再经过路由器或查询解析器处理。若分不清这些阶段，空格、加号、重复键就很容易被解释成业务数据错误。

这条支线先用 Node 的 URL API 观察表示过程，再回到本章的 Express 查询解析。前半部分的 URL 示例只使用虚构文本，不需要启动服务；后半部分的查询边界对照需要启动本章服务。

时间参考（估算）：阅读约 16～21 分钟；URL 实验与查询对照另加约 12～17 分钟。

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

这说明“框架帮我解析好了”并没有回答接口接受几个值。你还要决定重复项是否合法：多标签筛选可能需要数组；单一数量上限通常不应该出现两个互相竞争的值。本章把 q 和 limit 都定义为单值，先保证总项数未超过解析边界，再在 Express simple 解析出的值不是字符串时拒绝，因此不会悄悄替调用方选一项。

如果需求变为“同时搜索多个片段”，要先确定是任一片段匹配还是全部匹配，再明确数组表示、数量限制、空项和重复项规则。只把 TypeScript 参数改成 `string[]`，既不会让各种客户端统一序列化方式，也不会替你决定匹配语义。

缺失和空值也不能合并。示例中的 `limit=01` 没有 q：get 返回 null，getAll 返回空数组；`q=` 则存在一个空字符串。在正文的 Express 字段提取中，没有 q 得到 undefined，有 q 但没内容得到空串。我们让前者表示不筛选，后者返回 400，避免把一个填错的筛选条件默默解释成全量查询。

如果产品以后决定空搜索框等于不筛选，也完全可以改变这条约定；但要明确这是接口语义变化，并同步输入处理和客户端调用，不应由 `q || undefined` 偶然决定。

## 解析器停止读取，不等于输入通过验证

还有一种信息丢失发生得更早。Express 的 simple 解析器使用 Node 的 `querystring.parse()`，默认只处理前1000个查询项。这个上限限制了解析工作，但它不会自动向调用者报告“你的条件没有完整处理”。如果请求先放1000个未知参数，最后才放q，解析结果里可能根本没有q；Service只能执行无筛选列表。若后置的是第二个q，重复值检查也看不到它。

因此正文在 `httpBoundary` 构造URL后，先根据 `url.search` 计数：非空时去掉问号，按 `&` 分隔，超过1000项直接返回400，符合上限才继续进入路由。这里不先读 `request.query` 再计数，因为那时解析器可能已经丢过数据。也不统计不同键的数量，因为1001个同名键同样占用1001个输入项。

我们把未知字段和空片段一起计入预算。例如 `?x=1&&q=coffee&` 按本章规则是四项；即使空片段没有业务内容，也不能借此绕过上限。`q=C%2B%2B%20%26%20Node` 则只有一项，值中的 `%26` 尚未解码，不会被当成结构分隔符。完全没有查询时为零项；这个计数不是查询的UTF-8字节长度，也不是请求体大小。一个很长的值仍只占一项，实际HTTP接入层的字节限制需要另外核对。

这种选择保留 simple 在有界输入中的结构规则，同时让超限成为明确失败。取消解析上限也可以避免截断，但还要另外建立资源预算；无条件接受全部输入并没有解决成本问题。当前服务只使用两个已知字段，1000项上限不鼓励客户端发送大量未知参数，而是保证已接受的请求不会被悄悄改写条件。

保持第八章服务运行，在终端中先生成恰好1000项，最后一项才是有效筛选：

```bash
query=$(node --input-type=module -e 'console.log(Array.from({length:999},(_,i)=>`x${i}=0`).concat("q=unmatched").join("&"))')
curl -i "http://127.0.0.1:3000/captures?$query"
```

若没有包含 `unmatched` 的原文，应得到200与空items；若已有这样的记录，应只包含匹配记录。999个未知字段不参与筛选，但最后一个q仍必须生效。把生成式中的999改成1000再请求，总数为1001，应得到400与 `Query string must contain at most 1000 parameters`。它不能退化成无筛选列表。

再把重复q放在边界的两侧，观察是哪一层拒绝：

```bash
query=$(node --input-type=module -e 'console.log(["q=coffee",...Array.from({length:998},(_,i)=>`x${i}=0`),"q=tea"].join("&"))')
curl -i "http://127.0.0.1:3000/captures?$query"
query=$(node --input-type=module -e 'console.log(["q=coffee",...Array.from({length:999},(_,i)=>`x${i}=0`),"q=tea"].join("&"))')
curl -i "http://127.0.0.1:3000/captures?$query"
```

第一条正好1000项，进入字段解析后因重复q返回400，消息为 `q must occur once and be a string`。第二条1001项，在更早的总项数边界得到400，消息为总项数超限。两者状态相同，失败原因和发生位置不同；不能只见400就认定同一个验证器在工作。

最后确认空片段也占预算：

```bash
query=$(node --input-type=module -e 'console.log("&".repeat(1000))')
curl -i "http://127.0.0.1:3000/captures?$query"
unset query
```

1000个分隔符形成1001个空片段，同样应在路由前得到总项数超限的400。这几组请求都不写入记录。它们建立的是一个可迁移的排错顺序：先核对原始输入是否完整进入解析，再检查提取了几个值，最后才判断值的业务含义。

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
| querystring.parse／maxKeys | 理解simple解析器默认1000项边界 | 超限会停止解析；应用在此前明确拒绝，避免有效条件消失 |
| url.search／split('&') | 在解码和路由前计算本章查询项数 | 未知、重复和空片段都计数；百分号编码的&仍属于值 |
| `%2B`／`+` | 查询中表达加号／空格 | 不把查询约定套到所有路径字符 |
| hash | 表达 URL 片段 | 通常不进入 HTTP 请求目标 |

官方查阅：[Node.js 24 URLSearchParams](https://nodejs.org/docs/latest-v24.x/api/url.html#class-urlsearchparams)、[querystring.parse与maxKeys](https://nodejs.org/docs/latest-v24.x/api/querystring.html#querystringparsestr-sep-eq-options)、[WHATWG URL 标准的表单式解析](https://url.spec.whatwg.org/#application/x-www-form-urlencoded)、[Express 5 查询解析变化](https://expressjs.com/en/guide/migrating-5/#req.query)。

[返回第八章](chapter.md#本章知识支线) · [返回第二篇](../README.md)
