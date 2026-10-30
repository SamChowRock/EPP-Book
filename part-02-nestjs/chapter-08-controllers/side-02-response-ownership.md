# 支线 8B：return 之后，谁负责结束 HTTP 响应

正文把三个接口改为返回值响应，又在创建方法中使用 passthrough 设置 Location。容易产生的错觉是：只要 Controller 方法 return，HTTP 请求就一定结束。实际要看 Nest 是否负责发送这次返回值，以及当前代码有没有把响应交给其他完成方式。

这条支线用独立 Nest 应用比较四种写法。实验使用端口 3005，不增加 EPP 业务入口；停止后不会留下记录。先完成第八章正文，理解 `@Res()` 对路由的影响，再运行对照。

时间参考（估算）：阅读约 24～30 分钟；编译、条件响应、两种修复及解析器对照另加约 20～27 分钟。

## 一个结果，至少涉及两次“完成”

普通函数返回，意味着当前调用交出了结果；async 函数返回，意味着调用者拿到 Promise，随后还要等待它兑现。HTTP 响应则由状态、头部和正文组成，需要发送方决定何时完成。函数完成与响应完成之间，必须有人建立连接。

Nest 的标准处理会建立这个连接：执行方法、等待返回结果，再让 HTTP 适配器发送结果。普通对象成为 JSON；Promise 的成功值再进入同样过程。如果方法抛错或 Promise 拒绝，则进入异常处理。这就是为什么正文可以 `return httpResult(...)` 而不直接 end。

使用普通 `@Res()` 时，框架把响应发送责任交给处理方法。路由仍然会调用这个方法，但不再按普通返回值自动完成发送。如果方法只是 return 对象，JavaScript 调用可以成功结束，而连接仍等不到响应。把“看到 return”当成“请求肯定已经成功”，会漏掉这类问题。

## 建立可观察的四种方法

新增 `examples/controller-responses/app.ts`：

```typescript
import 'reflect-metadata';
import { Body, Controller, Get, HttpCode, Module, Post, Res } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Response } from 'express';

@Controller('responses')
class ResponsesController {
  @Get('automatic')
  async automatic() {
    return { mode: 'automatic' };
  }

  @Post('accepted')
  @HttpCode(202)
  accepted(@Body() body: unknown) {
    return { accepted: true, received: body };
  }

  @Get('manual')
  manual(@Res() response: Response) {
    response.status(200).json({ mode: 'manual' });
    console.log('manual: method continues after json');
  }

  @Get('passthrough')
  passthrough(@Res({ passthrough: true }) response: Response) {
    response.setHeader('X-Example', 'passthrough');
    return { mode: 'passthrough' };
  }

  @Get('forgotten')
  forgotten(@Res() _response: Response) {
    console.log('forgotten: method returns, no response sent');
    return { mode: 'forgotten' };
  }
}

@Module({ controllers: [ResponsesController] })
class ResponsesModule {}

export async function createResponseApp() {
  return NestFactory.create(ResponsesModule, { abortOnError: false });
}
```

这里使用与主线相同的 Nest 包，但启动方式有一个明确区别：没有关闭默认请求体解析器。因此 accepted 路由的 `@Body()` 可以取得框架默认解析器的结果。不是因为独立应用的装饰器更强，而是它的前置处理不同。默认解析器的限制和错误响应也不等同于 EPP 已有契约，不能把这份实验启动代码原样覆盖主线 app.ts。

新增 `examples/controller-responses/main.ts`：

```typescript
import { createResponseApp } from './app.js';

const app = await createResponseApp();
try {
  await app.listen(3005, '127.0.0.1');
  console.log('Response examples: http://127.0.0.1:3005/responses/automatic');
} catch (error: unknown) {
  await app.close();
  throw error;
}
```

再增加独立编译配置 `examples/controller-responses/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "include": ["./*.ts"]
}
```

继承第五、七章的编译布局和装饰器元数据设置，把本支线的文件加入编译范围。路径中的 examples 层级保留在 dist 中。按顺序运行：

```bash
npm exec -- tsc -p examples/controller-responses/tsconfig.json
node dist/examples/controller-responses/main.js
```

若先执行了常规 `npm run build`，dist 会被清理，需要重新执行示例编译。不要拿前一次残留的实验产物判断源码变化是否生效。

## 观察状态、头部与正文由谁决定

在另一个终端依次请求：

```bash
curl -i http://127.0.0.1:3005/responses/automatic
curl -i http://127.0.0.1:3005/responses/accepted \
  -H 'Content-Type: application/json' --data '{"message":"hello"}'
curl -i http://127.0.0.1:3005/responses/manual
curl -i http://127.0.0.1:3005/responses/passthrough
curl --max-time 2 -i http://127.0.0.1:3005/responses/forgotten
```

automatic 应为 200 与 `{"mode":"automatic"}`。虽然方法声明 async，Nest 等到其 Promise 得到对象后才发送；这里没有额外的并行任务，也没有因为 async 就建立新线程。

accepted 应为 202，JSON 中 received 是提交的对象。`@HttpCode(202)` 覆盖 POST 默认的 201，却不改变方法实际做的事。本实验只是回显数据以观察状态控制，没有持久化任务、工作领取或后续结果查询。如果真正承诺“已接受、稍后完成”，必须在相应业务里实现可靠接收与后续处理，不能用一个装饰器冒充这些能力。

manual 应为 200 与 `{"mode":"manual"}`，服务终端还会打印 `manual: method continues after json`。这说明 `response.json()` 没有让 JavaScript 自动 return；如果后面还有写入或其他副作用，它们仍可能继续执行。这里特意只打印无害日志，观察后不要把“发送成功后继续做关键业务”当成可靠后台执行方式。

passthrough 应为 200，带 `X-Example: passthrough`，正文为 `{"mode":"passthrough"}`。方法没有调用 json 或 end；它只设置头部，实际发送仍在 Nest 消费返回值时发生。这个模式对应主线的创建 Location：先得到业务结果，再补充与结果关联的头部，然后 return。

最后一条应在客户端两秒时限到达后退出，通常可见 curl 的超时提示；服务端打印的方法返回日志并不代表响应完成。`--max-time` 是客户端的等待上限，不是 Nest 自动替这个接口设置的服务端超时，也不会生成一条服务端 500 响应。

## 方法返回同一个对象，为什么客户端可能收到304

前面的automatic返回固定对象，每次都发送相同JSON并不是唯一选择。假设客户端已经保存了这份JSON，再次查询只是想知道它有没有变化；如果服务器能够确认仍是同一份表示，就可以省去正文传输。Express默认生成的ETag为这项判断提供标记，客户端用 `If-None-Match` 把自己保存的标记传回来。

Nest先等待Controller结果，再通过Express适配器发送。Express在处理JSON时生成ETag，并结合请求中的条件判断是否仍可复用客户端的表示；满足条件时，把原本的200改为304，移除正文。这里仍然有完整响应，只是它表达“继续使用你已有的内容”。304不是forgotten那样没有完成发送，也不是JSON解析出了空对象。

保持独立应用运行，先获取一次完整响应：

```bash
curl -i http://127.0.0.1:3005/responses/automatic
```

应看到200、JSON正文和ETag。把正文 `{"mode":"automatic"}` 与完整ETag值一起记录下来；值可能以 `W/` 开头，双引号也是值的一部分，不要只抄其中一段。弱标记中的 `W/` 表示比较的是表示的语义等价性，不能据此推导任意场景下字节逐一相同；本次GET的 `If-None-Match` 可以使用它。

下面用实际复制的值替换占位文字，保持地址相同，不修改应用：

```bash
curl -i http://127.0.0.1:3005/responses/automatic \
  -H 'If-None-Match: <复制的完整 ETag 值>'
```

这次应为304，头部后没有JSON正文，当前Express实现也移除了Content-Type和Content-Length。没有JSON正文，就不需要一条描述JSON正文的Content-Type。客户端把这次结果和自己保存的表示关联，继续使用前一次正文；不能把空正文交给JSON.parse，再把解析失败说成服务端丢了数据。

这里的curl展示服务器实际发出的响应，不会自动替你合并前一次JSON。浏览器缓存或应用缓存可以代办这项关联，但必须确实保存过这个地址对应的表示。ETag本身不是记录内容，不能仅凭这个短标记重建正文。

再使用一个不匹配的普通标记：

```bash
curl -i http://127.0.0.1:3005/responses/automatic \
  -H 'If-None-Match: "not-the-current-tag"'
```

应重新得到200、完整JSON与当前ETag。若请求带有 `Cache-Control: no-cache`，当前 Express 的新鲜度判断也会让它返回完整响应；在开发工具里排查缓存时，同时查看实际请求头，不能只看 If-None-Match 一个字段。服务器无法确认调用者已有当前表示，就发送它。回到主线列表，如果创建新记录使列表JSON改变，再携带旧ETag查询，也应得到200；没有条件头的普通GET同样返回完整正文。

还有一个容易误用的条件值：

```bash
curl -i http://127.0.0.1:3005/responses/automatic \
  -H 'If-None-Match: *'
```

星号并不表示“请发送全部内容”，它匹配当前存在的表示，因此这条GET也会得到304。没有已保存正文的调用方不应该为了“启用缓存”随手加上星号；得到304后仍没有可用内容。要取得完整表示，应发起不带该条件头的请求。缓存的价值来自保存正文再验证，不是客户端与服务器互相只传标记。

Express也会对匹配到GET处理器的HEAD请求使用这套条件判断，可以在这个独立应用对照：

```bash
curl -I http://127.0.0.1:3005/responses/automatic
curl -I http://127.0.0.1:3005/responses/automatic \
  -H 'If-None-Match: <复制的完整 ETag 值>'
```

第一条通常为200，第二条为304，两条都没有正文：前者是HEAD的方法语义，后者还满足缓存验证条件。EPP主线仍在 `httpBoundary` 将HEAD拒绝为405，因此不能把这个独立实验的HEAD行为直接写进主线接口约定。实际结果由上游方法规则和最终发送层共同决定。

若要观察执行位置，可以停止示例，在automatic方法返回前添加 `console.log('automatic called')`，重新编译并启动，再发带匹配ETag的GET。响应仍为304，但终端会打印日志，说明方法仍然执行。当前ETag来自已生成的响应表示；304减少了正文传输，却没有让Controller或列表查询自动跳过。不要把省流量等同于省去数据库查询，也不要把ETag当作服务端已经建立了业务缓存。观察后移除临时日志，后面的修改同样先停止、重新编译再启动。

这套行为来自Express的发送机制，不仅仅来自Nest的return语法。本支线manual主动调用的也是Express `json()`，因此它同样可能处理条件请求；第七章的 `sendJson()` 则直接使用Node `writeHead()`／`end()`，没有这段自动判断。迁移时必须追踪实际发送出口，才能看清为什么第八章接受了304这个新分支，而不是只增加几个自动头部。

## 用最小改动验证责任归属

先停止示例进程。把 forgotten 的参数装饰器临时改为：

```typescript
@Res({ passthrough: true }) _response: Response
```

其他代码保持不变，重新编译并启动。再次请求 forgotten，应得到 200 与 `{"mode":"forgotten"}`。只改变了“是否由框架发送返回值”的描述，业务函数并没有新增 send；这次对照正好说明原来的等待发生在哪里。

然后恢复普通 `@Res()`，把方法体临时改成：

```typescript
return _response.status(200).json({ mode: 'fixed-manual' });
```

重新编译并启动，再次请求也应结束。它和前一个修复的完成责任不同：这次由方法自己发送；return 只是防止后续代码继续执行，发送来自 json 调用。实验完成后恢复配套代码中的 forgotten，使四种原始对照继续可用，并停止进程。

不要同时给方法加 passthrough 又主动 json，再期待 Nest “自动判断哪个结果更合适”。第一次发送之后，响应可能已经提交；后续尝试改头或再次发送，在不同路径下可能被跳过或触发错误，不能成为可依赖的业务协议。让完成责任唯一，比依靠框架对重复发送的防护更清楚。

## 再改变一个条件：请求体没有被解析

回到 app.ts，把创建选项临时改为：

```typescript
return NestFactory.create(ResponsesModule, {
  abortOnError: false,
  bodyParser: false,
});
```

重新编译和启动，再请求 accepted。状态仍由 HttpCode 决定，但 body 没有预先填入，received 的值是 undefined；对象序列化为 JSON 时这个属性会被省略，结果只剩 `{"accepted":true}`。这不是客户端没有发送 JSON，也不是装饰器类型写错，而是缺少读取和解析步骤。

如果去掉 `@Body()` 的类型注解，或把 unknown 改成一个带 message 字段的类型，也不能修复这个缺口；TypeScript 不会替你消费请求流。恢复默认解析器后重新编译，received 才会恢复。正文主线没有启用默认解析器，是因为已经接入自己唯一的 `captureBody`，二者最终都要履行同一项责任。

这组实验只发送短小 JSON 并在本机运行，不是建议在实际服务里接收未读取的大请求。正文的大小和媒体类型约束仍要保留。

## 方法失败时，还能否改变结果

在响应尚未发送之前，方法抛错或返回拒绝的 Promise，框架通常还可以把失败转成相应错误响应。这也是正文在设置 Location 前先创建记录、在业务失败时交给 httpResult 的原因。

一旦已经调用 json／end 提交了成功响应，后续失败就不能把客户端已经收到的 200 改写为 500。服务器可以记录错误、关闭连接或按业务另行恢复，但不能撤回已经发出的成功信息。因此关键业务应在声明成功之前完成；需要提前返回接受结果的场景，应有独立而可靠的执行协议，不能靠“先发响应，再继续跑”维持正确性。

还有一个更细的区别：Node 的响应 finish 事件表示响应数据已交给底层发送过程，不证明远端应用已经完整接收并处理。客户端也可能在等待结果时断线，而服务端已经完成写入。后面的幂等与持久化任务会处理这种“结果未知”的情形；这里先不要把响应完成当成两端对业务结果达成了一致。

回到 EPP，可以按请求链逐步定位：没有进入 Controller，先查上游和路由；进入了方法但没有取得 body，查解析器；业务完成却一直等待，查响应模式与发送动作；已经发出成功后报错，查是否把关键工作留到了发送之后。这些判断比单看终端有没有一条报错更能找到责任位置。

## 附录：本支线必要技术点速查

| 名称 | 用途 | 注意点 |
| --- | --- | --- |
| return／Promise | 向 Nest 交付方法结果 | 方法完成与响应完成分开判断 |
| Res／passthrough | 选择响应完成责任 | 手动发送和自动发送不要混用 |
| HttpCode | 覆盖成功状态 | 202 不会自行建立后台执行 |
| ETag／If-None-Match | 标识已有表示，并判断是否需要重发正文 | GET／HEAD匹配可为304；星号匹配存在的表示，不适合无缓存者随手添加 |
| 304／客户端缓存 | 明确响应已完成，但正文应从已有缓存复用 | 当前Express移除JSON Content-Type；省去传输不等于跳过业务执行 |
| bodyParser | 控制默认请求体解析 | 关闭后 Body 不会自己读取流 |
| curl --max-time | 有限观察遗漏响应 | 客户端超时不等于服务端错误响应 |

官方查阅：[Nest 11 标准与平台专用响应](https://docs.nestjs.com/v11/controllers)、[Nest 11 异常处理](https://docs.nestjs.com/v11/exception-filters)、[Express 5响应与缓存验证](https://expressjs.com/en/5x/api/response/)、[HTTP If-None-Match](https://www.rfc-editor.org/rfc/rfc9110.html#section-13.1.2)、[HTTP 304](https://www.rfc-editor.org/rfc/rfc9110.html#section-15.4.5)、[Node.js 24 ServerResponse](https://nodejs.org/docs/latest-v24.x/api/http.html#class-httpserverresponse)。

[返回第八章](chapter.md#本章知识支线) · [返回第二篇](../README.md)
