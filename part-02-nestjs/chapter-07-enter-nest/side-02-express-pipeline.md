# 支线 7B：Express 怎样串起一次请求

第七章让 Nest 使用 Express 适配器，自己注册了 `httpBoundary`，又让 Controller 直接结束响应。理解这套代码，需要能回答：一层处理结束后，下一层什么时候执行？已经响应了，JavaScript 会不会停下？异步失败会交到哪里？

这条支线暂时拿掉 Nest，在一个独立的 Express 5 程序里观察这些关系。它补足当前应用已经依赖的运行机制；第十二章再在此基础上解释 Nest 的 Guard、Pipe、Interceptor 与异常过滤器，不能把它们直接等同于这里的普通 Express 中间件。

时间参考（估算）：阅读约 26～31 分钟；搭建独立程序并观察九组请求、断点与自动重启另加约 18～23 分钟。

## 先认识被注册的函数，而不是背 next 的用法

Express 应用维护着按注册顺序组织的处理项。一个请求到来时，框架根据当前位置、路径与方法，找到可以处理它的函数。这个函数可以完成响应，也可以调用传入的 `next`，让框架继续寻找后面的匹配项。它不是把所有函数一次性并行启动，也不是按源码文件的名称来排序。

为了让独立示例显式拥有所使用的依赖，在 `package.json` 的 `dependencies` 中加入 `"express": "5.2.1"` 并运行 `npm install`。使用第七章完整代码时仍执行 `npm ci`。Nest 的平台包内部依赖 Express，不等于自己的代码可以永远依赖包管理器偶然将它放在某个可访问位置；显式导入的包应有自己的依赖声明。

新建 `examples/express-pipeline.js`，先写入口和最外层的观察函数：

```javascript
import express from 'express';
import { setTimeout as delay } from 'node:timers/promises';

const app = express();

app.use((request, response, next) => {
  console.log('outer before', request.path);
  response.on('finish', () => console.log('finish', response.statusCode));
  next();
  console.log('outer after next');
});
```

`app.use(fn)` 注册一个不限定 HTTP 方法的处理项，当前没有挂载路径限制，因此它会参与各个请求。此时只是在登记函数，没有请求正在经过它。`app.get('/wait', fn)` 则同时约束路径和方法；后面会看到这种选择怎样影响执行。

`next()` 是框架交给当前函数的继续分派入口，不是 Promise 形式的“整个请求完成”。调用它时，后面的同步代码可能立刻执行；若后面的处理函数等待异步工作，当前这次调用仍可以先返回。于是 `outer after next` 不能用来表示响应已经结束，也不适合据此统计完整请求耗时。

监听 `response` 的 `finish`，观察的是服务端响应已交付到底层发送机制的时刻。它仍不等于客户端已经收到并处理成功；客户端提前断开时也未必有正常的 finish。要建立完整的请求观测，还需要处理断开等情况。本例先用它与普通函数返回作区分，不把一条日志包装成完整监控。

## 响应结束，不等于当前函数自动 return

在上述中间件之后注册：

```javascript
app.use((request, response, next) => {
  if (request.path === '/stop') {
    response.status(403).json({ error: 'Stopped before routing' });
    console.log('code after response still runs');
    return;
  }
  next();
});
```

`response.json()` 负责构造并发送 JSON 响应，JavaScript 随后仍执行日志语句。最后的 `return` 才结束当前函数。如果删掉它，程序就会继续走到下面的 `next()`，把已经结束响应的请求交给后面的处理项；那些代码再尝试响应，便可能出现响应头已发送或重复写入等错误。

这也是入口分支常写 `return` 或 `return next()` 的原因：结束当前分支的控制流。不要把它解释成“return 的值被发给客户端”，也不要把 `return next()` 解释成“等待后面所有异步操作完成”。

反过来，如果函数既没有响应，也没有调用 next，请求也不会因为函数已经执行完就自动得到成功结果。后面我们保留一个专门的 `/hang` 路由，用客户端超时观察这种遗漏。

正文的 `httpBoundary` 在返回 404／405 时终止当前处理，在路径与方法允许时才 next；这个选择决定 Controller 能否接到请求。Service 的方法本身没有 next，因为它不负责框架的请求分派。

## 用一次等待看清调用顺序

继续注册：

```javascript
app.get('/wait', async (request, response) => {
  console.log('route before await');
  await delay(20);
  console.log('route after await');
  response.json({ ok: true });
});
```

稍后调用 `/wait`，关键日志顺序应是：

```text
outer before /wait
route before await
outer after next
route after await
finish 200
```

前两行来自同一次分派调用。路由遇到 await，把后续工作留到 Promise 恢复时；外层的 next 调用此时不需要等待这段工作，因此外层先打印“after”。20 ms 只是示例等待，不保证精确墙钟延迟；这里观察的是因果顺序。

如果把外层改成 `async` 并写 `await next()`，也不会突然获得一个代表下游完成的 Promise。它最多等待 next 实际返回的值，不能把 Express 的继续分派协议变成另一种框架的异步组合协议。要测响应时刻，应该观察响应事件；要等待业务完成，应该等待实际业务操作返回的 Promise。

再改变注册顺序：若在 `/wait` 路由前插入一个无条件结束所有响应的中间件，路由将不再执行。若把最外层观察函数放到一个已经结束请求、且不 next 的路由之后，它也不会补收到这次请求。这就是注册顺序对日志、输入解析和提前拒绝位置的实际影响。

## 错误怎样进入另一条处理路径

接下来增加两条不同来源的失败：

```javascript
app.get('/fail', async () => {
  await delay(20);
  throw new Error('Example dependency failed');
});

app.get('/callback-fail', (request, response, next) => {
  setTimeout(() => {
    try {
      throw new Error('Example callback failed');
    } catch (error) {
      next(error);
    }
  }, 20);
});
```

第一条路由返回一个 Promise。Express 5 会接住这个返回 Promise 的拒绝，并把错误交给后续错误处理。这里的前提是 Promise 确实返回给了框架；不应把这个结论不加区分地套到旧版 Express。

第二条路由启动一个定时回调之后，当前处理函数已经返回。稍后的回调执行不在原调用栈里，也没有作为路由返回的 Promise 链的一部分。因此回调自己捕获异常，再用 `next(error)` 交还框架。若仅在外层 `setTimeout(...)` 周围写 try/catch，接不到未来回调抛出的异常，这与第四章讨论过的异常归属一致。

同样，`void someAsyncOperation()` 启动的独立 Promise，不会因为外面的方法有 `async` 就自动成为其返回链。当前请求若依赖这项工作，应返回或等待它；确实独立的工作则需要明确自己的失败与生命周期处理。不要为了尽快返回响应，就把尚需可靠完成的工作随手丢到后台。

调用 `next(error)` 后，分派会跳过普通处理项，寻找后面的错误处理项。我们先把其他路由和普通兜底补齐，再把错误函数放在最后：

```javascript
app.get('/hang', () => {
  console.log('neither responding nor calling next');
});

app.use('/echo', express.json({ limit: '1kb' }));
app.post('/echo', (request, response) => {
  console.log('body available', request.readableEnded);
  response.json({ received: request.body });
});

app.use((request, response) => {
  response.status(404).json({ error: 'Example route not found' });
});

app.use((error, request, response, next) => {
  console.log('error handler', error.message);
  if (response.headersSent) return next(error);
  const status = error.type === 'entity.parse.failed' ? 400
    : error.type === 'entity.too.large' ? 413 : 500;
  response.status(status).json({ error: 'Example request failed' });
});
```

错误函数声明四个参数，即使暂时不读取 request，也保留这个位置。Express 使用这种签名辨认错误处理项，不只是根据变量名字里有没有 `error` 判断。普通路由处理失败会跳过上面的 404 函数，进入错误处理；而未知路径只是走到普通兜底，并不天然等于抛出异常。

当前错误函数先检查 `headersSent`。如果响应头已经发送，就不能重新选择状态码并发送一份完整 JSON，于是把错误继续交给后面的处理。默认错误处理可能关闭连接，这不能挽回已经发出的部分响应。设计时应尽量在明确成功条件后再发送完整响应；流式传输则要单独处理发送到一半失败的边界。

这个实验的错误 JSON 只为观察传播路径。它不会改动 EPP 的 `{ "error": "..." }` 规则，也不替代后续正式的错误契约。单看 HTTP 状态同为 500，还不能知道失败来自等待的 Promise 还是定时回调；要结合路由与错误日志理解。

## 请求体已经被读过，再读会发生什么

上面只有 `/echo` 使用 `express.json()`。它先检查适用的内容类型，读取并解析请求体，然后把结果放到 `request.body`，解析成功才继续执行后面的路由。顺序反过来时，路由先运行，不能期待后面才注册的解析器提前准备好 body。

正确的 JSON 请求到达 `/echo` 时，日志会显示流已经结束，路由直接读取解析后的 body。请求流不是一段每次访问都从头播放的字符串。此时若再调用原来的 `readJson(request)`，才订阅 data／end 事件，就可能永远等不到已经发生过的结束事件；框架不会为了第二个消费者自动重新播放原始字节。

因此当前 EPP 选择关闭 Nest 默认解析器，由已有 readJson 负责读取和限制；本实验则选择由 Express 解析器读取，路由使用结果。两种安排都需要清楚的单一读取责任。将来切换解析方式时，要重新核对体积限制、错误映射、允许的 JSON 形状和内容类型，而不只是把一个函数调用换成 `request.body`。

解析失败和体积过大也发生在业务路由之前。请求体是 `{` 时，应进入错误处理而不打印 `body available`；超过本例 1 KiB 限制时同理。这里的上限只属于独立实验，EPP 主线依然保持 16 KiB。合法 JSON 也不等于合法业务输入，本例 echo 不保存数据，不能把它的宽松返回方式拿来替换原文规则。

## 把观察连起来

在文件末尾启动这个独立程序：

```javascript
const server = app.listen(3003, '127.0.0.1', () => {
  console.log('Example listening on http://127.0.0.1:3003');
});
server.on('error', (error) => {
  console.error(error.code);
  process.exitCode = 1;
});
```

在package.json的scripts加入开发入口；这是直接运行的JavaScript，不需要额外转译：

```json
{
  "dev:express": "NODE_ENV=development node --env-file-if-exists=.env --watch --watch-preserve-output --inspect=127.0.0.1:9229 examples/express-pipeline.js"
}
```

先停止主线或其他实验的dev，避免占用同一个9229调试端口，再运行：

```bash
npm run dev:express
```

VS Code选择已有的 `EPP: attach to npm run dev`，在examples/express-pipeline.js直接设断点；JavaScript源文件就是执行文件，不需要寻找dist副本。Node watch在保存源码后重启，保留终端输出方便对照；出现语法或启动错误时，先修复保存，等新的监听日志出现再发请求。修改.env或启动参数后仍需手动重启。

在Postman选择Import，导入 `requests/express-pipeline.postman_collection.json`，集合baseUrl为 `http://127.0.0.1:3003`。九条请求已经保存方法、Headers与Body，包括非法JSON和超过1 KiB的正文。逐条Send，观察响应状态、Body和服务日志，再发送下一条；不要使用自动运行去反复重放。

“06 遗漏响应”应持续等待，可等约两秒后Cancel。若要观察客户端超时，在应用设置的General中找到Request Timeout，记下原值、临时改为2000毫秒，再发一次；结束后恢复，尤其不要在断点暂停时使用短期限。取消或超时都是客户端停止等待，不代表服务端已经返回错误。

现在在/wait的await前后设断点，Send后分别查看调用栈与变量；继续执行得到响应。把等待改为50毫秒，保存后等自动重启，再用同一请求核对日志顺序，最后恢复20。重启不会自动重放请求，断点时间也不能算成正常延迟。

以下仅是同一组请求的终端复现形式：

```bash
curl -i http://127.0.0.1:3003/wait
curl -i http://127.0.0.1:3003/stop
curl -i http://127.0.0.1:3003/fail
curl -i http://127.0.0.1:3003/callback-fail
curl -i http://127.0.0.1:3003/missing
curl --max-time 2 -i http://127.0.0.1:3003/hang
curl -i http://127.0.0.1:3003/echo   -H 'Content-Type: application/json' --data '{"message":"hello"}'
curl -i http://127.0.0.1:3003/echo   -H 'Content-Type: application/json' --data '{'
node --input-type=module -e 'process.stdout.write(JSON.stringify({message:"a".repeat(1100)}))' |
  curl -i http://127.0.0.1:3003/echo     -H 'Content-Type: application/json' --data-binary @-
```

`/wait` 返回 200，日志显示外层函数先返回、等待之后才响应；`/stop` 返回 403，同时确实打印“响应之后的代码仍执行”；两个 fail 都返回 500，并进入错误处理。`/missing` 返回 404，正常经过兜底。`/hang` 会在客户端两秒期限后超时，服务端没有主动完成响应；它不是返回一个缓慢的成功结果。

后三项分别返回 200、400、413。成功时才能看到解析后的 body；非法 JSON 和过大输入都在解析阶段进入错误路径。curl 超时退出只结束这次客户端等待，不会帮我们修复缺失响应的路由。观察完在运行dev:express的终端按Ctrl+C，停止watcher及子进程。这个实验没有生产接口；主线构建与交付不复制examples，也不使用此开发入口。

返回第七章，已经可以独立解释几项安排：httpBoundary 为什么必须注册在业务路由之前，为什么响应后不再 next，为什么 respond 必须等待自己的 action，为什么它包住 next 也不能捕获整个下游异步生命周期，以及为什么不能同时让两个解析器消费同一份请求流。

进入第十二章时，我们将基于这些运行事实理解 Nest 添加的请求机制。那一章可以继续展开新的框架职责，而不必把这里已经依赖的 Express 调用关系当作黑箱。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| `app.use()`／`app.get()` | 注册一般处理项与指定路由 | 注册顺序影响是否到达；定义函数不等于当前就在处理请求 |
| `next()`／`next(error)` | 继续普通分派或进入错误路径 | 不是下游完成的 Promise；结束响应后不再继续普通分派 |
| `response.json()` 与 return | 分开发送响应和结束函数 | 响应之后的 JavaScript 仍可继续执行 |
| `finish`／`headersSent` | 观察发送阶段与能否重建响应 | finish 不等于客户端已收到；已发头后不能重写完整错误响应 |
| Express 5 返回 Promise | 将路由的异步拒绝交给错误处理 | 脱离返回链的定时回调、Promise 不在这个保证内 |
| 四参数错误处理函数 | 处理路由或解析器交来的失败 | 保留签名和顺序；未知路径的兜底与抛错不同 |
| `express.json()`／`request.body` | 单一读取方解析后交付结果 | 放在使用 body 的路由之前，不能事后重读同一流 |
| Node watch／Inspector／Postman集合 | 保存后重启、断点与重复请求 | 共享9229；等待断点时不要设置短客户端超时 |
| `curl --max-time` | 结束刻意挂起的实验请求 | 客户端停止等待不代表服务端已正常完成 |

官方查阅：[Express 5 中间件](https://expressjs.com/en/guide/using-middleware/)、[错误传播](https://expressjs.com/en/guide/error-handling/)、[Node 24 响应 finish 事件](https://nodejs.org/docs/v24.22.1/api/http.html#event-finish_2)。本例固定 Express 5.2.1，不混用 Express 4 的 Promise 处理结论。

调试入口查阅：[Node 24 命令行选项](https://nodejs.org/docs/latest-v24.x/api/cli.html)、[Postman 通用设置](https://learning.postman.com/docs/getting-started/installation/settings/general-settings)。

[返回第七章正文](chapter.md) · [返回第二篇](../README.md)
