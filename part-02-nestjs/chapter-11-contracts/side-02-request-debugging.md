# 支线 11B：用接口工具和断点追完一次失败请求

Swagger 能返回一份错误，不等于我们已经找到了错误原因。同样是 400，可能还没进入 Controller 就被 JSON 解析拒绝，也可能已经解析成功，却不符合字段规则。若只在 Service 打断点，前两种情况都不会停；这个结果不能证明调试器失效。

本支线使用 `part-02/chapter-11` 的三个接口，把请求复现、源码断点和错误转换连起来。第五章支线 5B 的 VS Code launch／attach 配置继续适用，Chrome 也可连接同一个本机 Inspector。这里只用虚构记录，沿当前的内存存储观察，不引入额外业务或测试框架。

时间参考（估算）：阅读约 22～28 分钟；请求整理与断点操作另加约 20～25 分钟。按约 3200 个汉字、18 行代码与命令，以及保存正常请求、识别条件响应、比较两类 400 和一次受控输出失败估算；已有接口客户端可以继续使用，不要求重复安装多种工具。

本支线默认以 `npm run dev` 启动，VS Code 使用 `EPP: attach to npm run dev`。保存源码后等待编译、重启及重新连接，再发送已保存请求；浏览器中的 Swagger 文档改变后刷新页面。Swagger 在 development 默认开启，production/test 默认关闭；页面 404 时先核对目标端口、NODE_ENV 与 DOCS_ENABLED，不要立即怀疑路由实现。只有专项观察启动过程才切换到 build/launch 或 inspect-brk，切换前停止 dev。每次重启会清空 Map，先重建必要的演示记录；不要把失去记录误判成刚修的接口失败。

## 日常反复调试：复用 Postman 请求集合

继续使用第二章已保存的 Postman 请求，修改字段后点击 Send 即可。若直接从本章代码开始，在 Import 中选择 `requests/epp.postman_collection.json`，即可得到同一组基础请求，无需先构建或导出文档；下面的 OpenAPI 导入用于根据当前文档补充集合，可以按需执行。Swagger 适合直接核对当前 OpenAPI 并试发请求。需要持续保存“正常创建、字段错误、查询错误、详情不存在”等多份输入时，独立接口客户端的请求集合更方便。这里以 Postman 桌面客户端为例；已有同类工具时，保留相同方法、URL、头部与正文即可，不必为了阅读本章更换工具。

保持 dev，在另一个终端运行 `npm run build` 和 `node scripts/export-openapi.mjs`，在 Postman 工作区的 Import 入口选择 `dist/openapi.json`，导入为 Collection。使用本机文件避免把本机地址交给不在本机的远程抓取方。导出使用 dist，不会清理开发进程使用的 .dev。生成的集合是文档的一个消费者，导入成功不证明服务正在运行，也不证明生成的默认参数就是我们要发的请求。

在集合的 Variables 中设置 `baseUrl` 为 `http://127.0.0.1:3000`，核对三个请求使用的地址：

| 请求 | 地址及本次输入 |
| --- | --- |
| 创建 | POST `{{baseUrl}}/captures`，Body 使用 raw JSON，originalText 为 debug-contract |
| 列表 | GET `{{baseUrl}}/captures`，第一次调用先取消生成的 q／limit 示例参数与 If-None-Match 头 |
| 详情 | GET `{{baseUrl}}/captures/实际返回的id`，使用刚才创建结果中的 id；第一次调用不设置 If-None-Match |

若导入器生成了别的变量名或示例地址，直接按上表调整，避免同时存在两套 base URL。发送前检查变量解析后的完整 URL；若选中了含同名变量的环境，其值可能覆盖集合变量。核对创建请求的 Content-Type 为 application/json，再发送；从返回的 Location 也可以得到详情相对路径。这里先手动传递 id，看清数据来自哪里，不把脚本化串联变成新的学习前提。

将正常创建复制一份，命名为“字段类型错误”，只把 originalText 改成数字 7。保存请求时保留这两份输入，下一次改 Schema 后就能直接对照。工作区导出或同步前查看其范围，只保存虚构示例与必要配置，不把完整 `.env` 或实际用户凭据当成请求集合的一部分。

Postman 桌面请求成功、浏览器失败时，回到浏览器查看实际请求、预检、Cookie 与报错；独立客户端不按网页相同方式执行浏览器的跨源限制，因此一次成功不能替网页证明 CORS 或 Cookie 配置正确。身份篇会在真实登录场景中继续展开，不靠当前无登录接口提前判断会话行为。

## 先把“有问题的请求”变成可以再次发送的对象

从 Swagger 的 POST /captures 开始，在 Try it out 中填写 `{"originalText":"debug-contract"}`，执行并观察 201、Location 和返回的 id。在 Chrome Network 中选择这次 POST，核对实际 URL、Content-Type 和 Payload，再看 Response。页面上展示的 Schema 是文档，Network 中的正文才是这一次真正发送的数据。

需要把浏览器调用带到终端时，对这条请求使用 Copy as cURL，先检查命令中的目标、正文、Cookie 与 Authorization，再在自己控制的本机服务上重放。这里的创建请求每执行一次都会新增记录；复制请求保留的是输入，不会把 POST 变成安全的查询。不要把携带身份信息的命令直接贴进公共问题记录。

也可以从明确写出的最小请求开始：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"debug-contract"}'
```

查看 GET 列表或详情时，还要检查请求是否携带 If-None-Match。浏览器可能自行附加条件头，并用缓存内容向页面提供可读结果；应以 Network 中实际状态和头部为依据。若终端或独立客户端得到 304，它没有 JSON 正文，不是响应 Schema 输出了一个空对象。需要重新观察完整的 200 正文时，去掉条件头；在浏览器排查时可临时勾选 Network 的 Disable cache，并保持 DevTools 打开。条件请求和缓存内容的对照见[支线 8B](../chapter-08-controllers/side-02-response-ownership.md)，这里沿用同一行为。

先保存一份正常输入，再一次只改变一个条件。若把地址、头部与字段同时改了，即使结果变化，也难以判断是哪项条件造成的。需要保留一轮观察时，可把响应头与正文分开写入临时目录：

```bash
debug_dir=$(mktemp -d)
curl -sS -D "$debug_dir/headers.txt" -o "$debug_dir/body.json" \
  -w 'status=%{http_code} total=%{time_total}s\n' \
  http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":7}'
cat "$debug_dir/headers.txt"
cat "$debug_dir/body.json"
```

这次应为 400、application/problem+json 和 VALIDATION_ERROR。curl 默认收到 400 仍可能以零状态退出，因为一次 HTTP 传输完成了；shell 退出状态和 HTTP 状态是两种判断，不能只看命令有没有报错。这里不使用会改变失败处理的额外选项，让状态行与正文都可见。

记录耗时只用于知道观察边界。若此时断点暂停了三十秒，total 也会包含等待，不是服务的正常处理性能。临时目录中的内容只用于本次虚构数据排查，分享前仍要检查响应是否包含不应公开的信息。

## 两个 400，为什么要在不同位置停下来

保持 `npm run dev` 运行，使用 VS Code 的 `EPP: attach to npm run dev` 连接。先在 Controller 的创建方法中找到这一行设置断点：

```ts
const input = parseInput(CreateCaptureSchema, body);
```

复制 Postman 的创建请求，Body 保持 raw JSON，将正文改成只有一个左花括号 `{`，点击 Send。需要终端复现时可用：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' --data '{'
```

Controller 断点不应命中，响应 code 应是 INVALID_JSON。沿请求更早的位置观察：在 `src/capture-body.ts` 的 `request.body = await readJson(request)` 设置断点，在 `src/http.ts` 中严格解码／JSON.parse 的 catch 内调用 reject 的语句设置另一个断点。重发后先进入读取，再进入解析失败分支；后面的 next 没有执行，路由自然不会进入 Controller。

INVALID_JSON 还包括非法 UTF-8 与开头的 BOM。若原始请求在日志中“看起来像合法 JSON”，不能只重新输入一份文本就判定服务端有误；复制后的文本可能已经替换了坏字节或去掉 BOM。保留原始请求体，用 `--data-binary @文件` 重放，并在 TextDecoder 与 JSON.parse 两个位置辨认究竟哪一步失败。字节对照沿用第二章的读取实验，不需要把 Schema 放宽来接收解码失败的请求。

现在在同一份 Postman 请求中把正文改为 `{"originalText":7}`，再次点击 Send。对应的终端复现为：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' --data '{"originalText":7}'
```

这次 Controller 断点应命中，body 已是对象，其中 originalText 是 number。进入 `parseInput`，在 safeParse 之后观察 result.success 为 false，再看 issues 中字段路径。错误在这个函数内转成 HttpError，随后进入 httpResult 的 catch；CapturesService.create 尚未执行。

这里使用 safeParse，所以校验失败首先表现为一个结果值，不能指望“异常断点”一定停在 Schema 检查内部。可以直接在 `if (!result.success)` 或构造 HttpError 的位置暂停。工具选择应服从代码实际怎样表达失败，而不是所有问题都勾选同一项异常设置。

继续执行到 `httpFailure(error)`，观察输入的 error 和返回的 failure。输入保留内部错误对象，输出才是准备发给调用方的 Problem。Call Stack 帮助辨认当前停在解析、字段校验还是错误转换；切换栈帧时变量范围也会变化。不要为了追完 Nest 的所有内部帧，把已经确认的业务边界淹没在框架调用细节里。

到这里已经能区分三个经常混淆的事实：请求到达服务、请求到达 Controller、请求执行到业务写入。需要补断点时，选两个相邻边界观察是否跨过，范围就能逐步缩小。下面这些位置可以从当前代码直接找到：

| 请求现象 | 优先观察的当前边界 | 能排除或确认什么 |
| --- | --- | --- |
| 415，Controller 未命中 | captureBody 中的 mediaType 判断 | 请求正文还没进入 JSON 读取 |
| INVALID_JSON | readJson 的严格解码／JSON.parse 与 respond | 非法 UTF-8、BOM 或 JSON 语法错误在 Controller 之前被拒绝 |
| QUERY_TOO_LARGE | httpBoundary 中解析查询前的项数检查 | 查询串超过 1000 项，尚未交给 Express 提取字段 |
| VALIDATION_ERROR | parseInput 的结果及 HttpError | JSON 已解析，字段规则不满足 |
| CAPTURE_NOT_FOUND | Service.find 的存储结果 | 已执行查询，结果为空 |
| INTERNAL_ERROR | httpResult／respond 中传给 httpFailure 的原始异常 | 对外 500 背后可能是存储或响应映射失败 |

这张表不能替代实际追踪。比如后面把校验移到 Pipe，断点位置就要随执行职责移动；不能永远去找 Controller 中已被删除的 parseInput。

## 一个 500，为什么不能马上重试创建

下面做一次明确控制的调试实验，观察“已经保存，但输出失败”。保持当前进程运行，在 Controller 中这行设置断点：

```ts
const result = toCaptureResponse(capture);
```

发送一份合法创建请求。暂停时，上一个 await 已经完成，Service 已写入记录并返回副本，但响应投影还没有运行。先记下 capture.id 和原本有效的 createdAt。

这次有意使用 Debug Console 改变一个值：

```js
capture.createdAt = 'not-a-date'
```

这是对当前进程对象的真实修改，只在本次虚构数据实验中执行。第五章提醒过，Console 求值会产生副作用；这里正是利用它构造一次受控失败，既不修改源文件，也不修改存储中的记录。

在 httpResult 的 catch 中，`const failure = httpFailure(error)` 处再设置断点，然后继续。响应 Schema 应拒绝这个日期，error 是输出校验异常；它不是 parseInput 构造的 HttpError。继续观察 failure，应该映射为 500 和 INTERNAL_ERROR，而不是让客户端修改字段的 400。Location 的设置还没有执行，响应不应携带创建成功的位置头部。

取消这两个断点，保持同一个进程，使用刚才记录的 id 请求详情。应仍得到 200，createdAt 是存储中原来的合法值。原因不是校验库回滚了什么：Service 在完成写入后返回副本，刚才改的是这份响应路径上的副本。若重启服务再查，Map 已清空，就破坏了这次对照条件。

这次实验给出的因果关系很具体：输出失败发生在写入之后，所以外部收到 500 不能推出“没有保存”。直接再次提交 POST 会新增另一条记录。将来有数据库事务与幂等机制时，要根据它们实际覆盖的边界再判断恢复动作，不能用客户端看到的一个状态码代替存储事实。

调试完恢复常规运行：删除临时断点、关闭不再需要的异常暂停，停止本次内存服务。无需回退业务源码，因为实验只改变了当前进程的一份对象。

## 把定位结果变成可核对的修复

如果故障是调用方把 originalText 发成数字，修复后仍用保存的两份请求对照：合法字符串成功，数字继续明确拒绝。若改的是服务端字段规则，则重新导出 OpenAPI，检查请求集合中旧示例是否需要更新，再执行相同输入。不能因为文档刷新了就认为服务行为也改变了。

记录结论时，把“接口报错”写成能复核的事实：哪个输入在什么边界失败、错误如何映射、写入是否发生、改动后原请求与正常对照的结果是什么。到第十二章统一请求机制后，同一组请求继续使用；执行位置改变，外部契约仍有可比较的依据。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| Swagger／Network | 对照文档输入与实际请求 | Try it out 会真实创建记录 |
| Copy as cURL | 在终端复现浏览器输入 | 重放有副作用，先检查凭据、目标与条件请求头 |
| If-None-Match／304 | 辨认条件请求没有正文的结果 | 要观察完整正文时去掉条件头，不对 304 强行解析 JSON |
| curl -D／-o／-w | 分别保存响应头、正文与状态／耗时 | HTTP 错误不等于 curl 默认退出失败 |
| Postman Collection／变量 | 保留请求样本与目标地址 | 导入后核对 URL、示例参数和实际正文 |
| 边界断点 | 区分读取、校验、写入和响应映射 | 未命中不直接等于没收到请求 |
| safeParse／异常断点 | 分别观察失败值和抛出异常 | 返回失败对象本身不一定抛异常 |
| httpFailure 输入与输出 | 区分内部错误及公开 Problem | 500 不自动证明没有写入 |

官方查阅：[Chrome Network](https://developer.chrome.com/docs/devtools/network/reference)、[Postman 导入 API 说明](https://learning.postman.com/docs/design-apis/specifications/import-a-specification)、[Postman 变量](https://learning.postman.com/docs/sending-requests/variables/variables)、[VS Code Node 调试](https://code.visualstudio.com/docs/nodejs/nodejs-debugging)、[curl 手册](https://curl.se/docs/manpage.html)。

[返回第十一章](chapter.md) · [返回第二篇](../README.md)
