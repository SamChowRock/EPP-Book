# 第 6 章 TypeScript 如何变成可运行的服务

一个服务能够交出去运行，需要的不只是编辑器里没有红线。它还需要明确的入口、能被运行时找到的模块、随程序到达目标目录的配置，以及重新安装后仍然一致的依赖。本章把这些条件连起来，为第一篇的记录服务建立开发、检查、构建与运行的完整路径。

前五章已经建立了三个记录接口，并解释了请求、进程、配置和异步工作的关系。代码依然是 JavaScript，启动时直接读取 `src/server.js`。接下来迁入 TypeScript，新增的主要能力是让程序内部的约定可以被检查，让运行产物可以独立于开发入口接受核对。接口仍然返回原来的数据，记录仍然保存在 Map 中；这次没有数据库迁移，也不会让重启前的内存记录自动留下来。

有前端经验的读者通常已经使用过 TypeScript，但构建工具可能替自己处理了扩展名、别名和资源文件。这里直接把产物交给 Node，恰好可以看清那些工作分别由谁承担。我们先建立输入与类型之间的边界，再沿一个 `import` 看模块怎样找到文件，最后把源码变成一组真正能搬走的文件。

**代码起点**：第五章完成状态，代码分支 `part-01/chapter-05`；本章完成状态使用 `part-01/chapter-06`。继续使用 Node.js `24.22.1`，命令在配套项目根目录执行；macOS、Linux 使用 Bash／Zsh，Windows 使用 WSL。先执行 `nvm use`。本章固定 TypeScript `5.9.3`、tsx `4.23.15` 和 `@types/node` `24.13.3`，以明确的组合讨论行为，不依赖全局安装。

阅读约 95～115 分钟，跟做另加约 65～85 分钟，合计约 160～200 分钟。可分三次完成：先沿输入和模块导入读到 6.2；再接齐脚本，核对开发重启与产物构建；最后从独立目录运行并比较配置失败的时点。首次下载依赖、选读支线和第七章练习另计。

## 6.1 类型检查、转译与运行各自负责什么

### 从内部约定开始，而不是相信网络输入

记录已经有三个字段。把 `src/server.js` 改名为 `src/server.ts`，在导入后声明记录类型，并替换原来的 Map 声明：

```typescript
type Capture = {
  id: string;
  originalText: string;
  createdAt: string;
};

const captures = new Map<string, Capture>();
```

这让 TypeScript 能检查我们自己构造和使用的记录：如果创建时遗漏 `createdAt`，或者把数字放到 `originalText`，检查器会指出不符合约定的位置。类型也改善了读取代码时的信息：`captures.get(id)` 可能没有结果，所以仍需要判断记录是否存在。

但这个约定不会进入网络协议，更不会替请求体做校验。为了看清差别，新增一个独立的错误示例 `examples/type-boundary.ts`：

```typescript
type Input = { originalText: string };
const body = JSON.parse('{"originalText":42}') as Input;
console.log('actual type:', typeof body.originalText);
console.log(body.originalText.trim());
```

先只看推导：`as Input` 告诉检查器按 `Input` 看待这个值，没有调用任何转换函数。运行时解析出来的仍是数字 `42`。因此第一行输出会显示 `number`，下一行调用字符串方法时失败。它能被类型检查接受，并不是检查器证明了输入正确，而是我们自己越过了需要证明的那一步。安装工具后，我们会实际运行它。

服务入口需要相反的做法：先把未验证数据当作 `unknown`，检查事实后再使用。把原来的读取函数改成下面的签名，函数体仍保留第三章的大小限制、合并解码与 JSON 解析：

```typescript
function readJson(request: IncomingMessage): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = [];
    // 保留原有 data、end、error 处理。
  });
}
```

这是一段签名与局部修改示意，不要用注释替换前文完整的处理函数。`Promise<unknown>` 的含义是「异步读到一个值，但还没有证明其结构」。JSON 语法正确只保证解析成功；合法 JSON 也可以是 `null`、数组、数字，或者缺少字段的对象。

在 `handleRequest()` 中，`const body = await readJson(request)` 后的校验改为：

```typescript
if (body === null || typeof body !== 'object' || Array.isArray(body)) {
  throw new HttpError(400, 'Request body must be a JSON object');
}
if (!('originalText' in body) || typeof body.originalText !== 'string' || !body.originalText.trim()) {
  throw new HttpError(400, 'originalText must be a non-empty string');
}
if (body.originalText.length > 2000) {
  throw new HttpError(400, 'originalText must be at most 2000 code units');
}

const capture: Capture = {
  id: randomUUID(),
  originalText: body.originalText,
  createdAt: new Date().toISOString(),
};
captures.set(capture.id, capture);
sendJson(response, 201, capture, {
  Location: `/captures/${capture.id}`,
});
```

每一道检查都在缩小后续路径可能遇到的值。排除 `null` 是因为 `typeof null` 也是 `'object'`；排除数组对应原有接口约定；`in` 证明字段存在；`typeof` 证明该字段可以使用字符串操作。`trim()` 依然只参与判定，写入的还是原文，因此有效内容两端的空格不会被改掉。

这里没有给外部数据强行盖一个类型。运行时条件负责阻止不合要求的数据继续前进，检查器则理解这些条件，并允许后面的代码使用已经得到证明的属性。这种配合以后仍然成立：第十二章引入专门的输入 Schema 时，会集中表达这些规则，而不会用一个接口声明替代校验。

`unknown` 与 `any` 的差别也在这里。两者都能接住外部值，但 `any` 会放行许多操作，把问题推迟到运行时；`unknown` 要求先提供使用依据。`JSON.parse()` 的类型本身允许宽泛使用，所以我们主动在读取函数返回值和配置变量处收住边界。它不是自动安全机制，错误的断言依然可以绕过去。

先把这次迁移当成一次前后端交接。页面提交的是用户输入的原文，后端交还的却是一条可以被再次读取的记录。若给创建请求也写上 Capture，编译器很可能催前端补齐 id 和 createdAt，最后页面为了通过检查只好自己造两个值。可是谁有资格分配记录标识，时刻以哪里的钟为准，并没有因为字段名相同就改变。沿调用顺序把纸分成三栏：第一栏是收到的值，什么 JSON 形状都有可能；第二栏是检查通过的原文，只剩一个字符串；第三栏才是服务刚构造的三字段对象。后两栏都可以写得很精确，却不能用第三栏倒推第一栏一定正确。

把中间两栏放回代码里看，会发现没有一个步骤叫「把请求体变成 Capture」。入口先排除了不能继续的值，再取出一个经过检查的属性；randomUUID 与当前时刻另外提供两个事实，三个来源一起组成记录。因此前端即使在正文里附上上次保存的时间，服务写入 Map 的仍是这一次生成的时间。若改成展开整个 body 再填字段，还要考虑展开的顺序和额外属性去向；只取出需要的字符串，便让这个问题停在创建边界。这里的字段限制来自实际构造对象的语句，给变量补一个类型标注本身不会删掉运行时多出的键。

可以在纸面按短路次序读一遍原文条件。若正文是空对象，第一项已经判定缺少属性，后续对属性长度或字符串方法的读取不会发生。若原文是数字，字段存在，第二项发现类型不合，仍然到不了 trim。若原文只有空格，前两项都允许继续，直到去掉两端空白作判断才被拒。若原文是两端带空格的「练习」，用来作判断的临时字符串有内容，写进记录的却是 body 上原来的值。这样的次序同时给运行时和检查器一条可追的因果链。如果把 trim 放在类型检查之前，一个普通的字段错误便可能变成调用方法时的异常，客户端收到的状态和可采取的修正动作都会改变。

还可以把「在前端界面上看不到差别」的输入拆开。正文是空串，代表压根没有 JSON 文本；正文是两个引号，代表合法 JSON 字符串，其值为空；正文是带 originalText 键的对象而属性值为空，则是合法对象中的业务值不成立。三者都可能收到四百，第一种停在 readJson，第二种已经从 await 回来却过不了对象条件，第三种会到达字段判断。调试时若只在 Map 写入处下断点，三次都不停，无法把失败归到正确位置。先预测最早能区分两种输入的那一行，再决定该观察解析后的 body，还是根本等不到它。这种分层在本章仍沿用原有错误正文，不需要等到有专门的校验库才做得出来。

### 为现有代码补上明确的边界

文件开头保留原来的运行时导入，再增加仅用于检查的类型导入：

```typescript
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse, OutgoingHttpHeaders } from 'node:http';
import { randomUUID } from 'node:crypto';
import { loadConfig } from './config.js';
import { errorCode, errorMessage } from './errors.js';
```

`createServer` 是运行时要调用的函数。另三个名字只用于描述参数；`import type` 会从 JavaScript 产物中消失。这一标记同时向读者与工具说明「这里没有运行时加载需求」。`./config.js` 此时对应的源码会改为 `config.ts`，后面专门解释为什么导入仍写 `.js`。

错误类和响应函数的声明改成下面这样，原来的响应头与 `response.end(JSON.stringify(data))` 保留：

```typescript
class HttpError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  data: unknown,
  headers: OutgoingHttpHeaders = {},
): void {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(data));
}
```

这里把状态码写成普通实例字段，再在构造函数里赋值，没有引入参数属性等额外语法。`readonly` 约束 TypeScript 代码中的重新赋值，不等于运行时冻结对象。`data: unknown` 也不保证任意值都能序列化成符合接口约定的 JSON；例如循环引用会使序列化失败。本章调用处传入的是已明确构造的记录、列表和错误对象，公开响应契约会在第二篇集中组织。

把请求处理函数签名改为：

```typescript
async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  // 保留原有路由与响应逻辑。
}
```

还要处理三个从宽泛 JavaScript 假设变成显式检查的位置：

- 构造 URL 前，若 `request.url === undefined`，抛出原有的 `HttpError(400, 'Request URL is invalid')`。Node 的类型描述不承诺该属性在所有使用方式下都存在。
- 内容类型取第一段后继续用可选访问：`?.split(';')[0]?.trim().toLowerCase()`。后面的比较仍只接受 `application/json`。
- 详情匹配条件改为 `if (detailMatch?.[1] !== undefined)`，再使用 `detailMatch[1]` 查 Map。我们会开启索引访问检查，不直接假设任意数组索引都有值。

请求的 `data` 监听器标为 `(chunk: Buffer)`。这依赖第三章一直保留的条件：没有对该请求调用 `setEncoding()`，这里读取的是字节块。类型注解本身不会把字符串转成 Buffer；以后改变读取方式时，也要重新核对这个前提。

读详情的方法能说明为什么「可能缺失」不能全用一种写法处理。从 /captures 后面的那个路径段取得标识，第一步要知道路径是否符合单条详情的形状。如果根本没有这个段，就还没进入详情分支。第二步已取得非空文本，却可能查不到记录；此时路径有效，缺的是那笔数据。第三步 Map 返回一条记录，才有可以发送的对象。若用空字符串替代未匹配的路径段继续查 Map，两种含义就被压成同一次查询。若在 get 后直接加非空断言，编译器可以闭嘴，却没有给不存在的记录制造一个可返回的值。

不妨在编辑器中把鼠标停在这两次取值上。正则结果可能为 null，捕获组又是按下标读取；进入条件分支后，传给 get 的那个值才已有依据当作字符串。Map 的类型参数则只说明「存进去的每个值长什么样」，一张空 Map 也完全符合这个类型，所以 get 仍可能返回 undefined。沿着已经创建的一条标识和一个不存在的普通标识各走一次，第一次取值两者都能成功，第二次才分开。类型系统提醒的都是缺失，但修正办法由缺失所代表的业务事实决定：一个回到路由匹配，一个结束为记录不存在，一个才发送详情。

再看 sendJson 的返回值。标成 void 表达调用者不靠这里返回的 JavaScript 值取得记录；调用者真正关心的效果在 response 上，先设状态和头，再结束正文。handleRequest 则在部分分支等待异步读取，承诺的是一个最终完成或拒绝的 Promise。若把两者都凭经验写成「没返回数据，所以不用管返回值」，外面的请求回调就可能没有观察异步拒绝。当前代码保留 handleRequest 返回的承诺并接上 catch，解析错误才能回到既有的响应处理。给返回值标类型的用途是读清谁该接住这一步，而非让每个函数看起来都像在生成可渲染的数据。

声明 Buffer 也有一个时间上的前提。data 回调的参数是这一批到达的字节；累计的 bytes 用来限制整个请求，等 end 到达才合并并解码。若一个中文字的多个字节分在两个批次，分别把每批转成字符串再拼接，和先拼完整字节再解码未必得到同一原文。给回调参数标 Buffer 只记录当前请求没有启用文本模式这个前提，不能修复错误的拼接顺序。类型迁移时保留第三章的读取流程，正是为了不把字节计量改成字符计量，也不把输入内容的变化误当作编译器帮忙做的转换。

### 错误对象与配置文件也来自边界之外

第四章在 `catch` 中使用 `error.code`。JavaScript 可以抛出任何值，第三方代码也不一定抛出 `Error` 实例。开启严格检查后，不能把所有捕获值都当成带有 `code` 与 `message` 的对象。新增 `src/errors.ts`，把取信息的条件集中到两处：

```typescript
export function errorCode(error: unknown): string {
  if (error !== null && typeof error === 'object'
    && 'code' in error && typeof error.code === 'string') {
    return error.code;
  }
  return 'UNKNOWN';
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
```

这是本章的小型诊断辅助，不是新的一套错误框架。访问错误码依赖属性存在且是字符串；读取消息依赖 `Error` 实例。无法识别的值保留兜底文本。请求的 `.catch((error: unknown) => ...)` 仍按 `error instanceof HttpError` 区分可预期错误与 `500`，只把原来的 `error.message` 改成 `errorMessage(error)`，不把未知异常详情公开给调用方。

在启动错误监听器中，用 `errorCode(error) === 'EADDRINUSE'` 判断端口冲突，其余诊断中的错误码也调用 `errorCode()`。末尾的启动拒绝处理改为 `.catch((error: unknown) => ...)`，输出 `errorMessage(error)`。原来的非零退出码与响应责任不变。

将 `src/config.js` 改名为 `src/config.ts`，导入 `errorCode`，新增 `type Config = { port: number }`，并把函数签名改为 `export async function loadConfig(): Promise<Config>`。读取失败的错误码通过辅助函数取得。JSON 解析变量和端口判断改成：

```typescript
let defaults: unknown;
try {
  defaults = JSON.parse(text);
} catch {
  throw new Error('config/service.json must contain valid JSON');
}
if (defaults === null || typeof defaults !== 'object' || Array.isArray(defaults)) {
  throw new Error('config/service.json must contain an object');
}
if (!('port' in defaults) || typeof defaults.port !== 'number'
  || !Number.isInteger(defaults.port) || defaults.port < 1 || defaults.port > 65535) {
  throw new Error('config/service.json port must be an integer from 1 to 65535');
}
```

其余环境变量解析与返回分支沿用第四章。注意 `Number.isInteger()` 返回布尔值，但不是 TypeScript 的类型谓词；先检查 `typeof`，才能同时建立运行时与静态检查所需的依据。默认文件仍必须有效，`PORT` 不会绕过它。

同一个端口有两个输入来源，正好能检验自己是否真的理解配置类型。默认文件里写的是 JSON 数字，进程环境里的 PORT 即使看起来全是数字，读出来也仍是文本。因此不能设计一条「一律先 Number，再验范围」的捷径。若文件里把三千写成带引号的字符串，文件格式已经变了，应该指出默认文件出错；若环境里写成十进制的三千，则符合本章对环境输入的约定，才把它转换成数值。返回的 Config 可以一样，得到它的两条路径却有不同的前置条件。把最终端口类型推回两端，往往会在一头放宽过度，在另一头误拒合法输入。

用两份可回退的组合推一遍启动过程：文件里的端口是数字、环境没有 PORT，返回文件值；文件里改成字符串、环境仍给有效端口，程序会在检查默认文件时失败。后一种结果由 loadConfig 的执行顺序决定。若需求真是「有环境变量就完全不依赖默认文件」，得重新安排读取文件的时机；只调整最后一行取值的优先级，仍然过不了前面的文件读取与检查。稍后得到独立交付目录时，可以只在那份副本里做这个对照。能分清「最终用了谁的值」和「启动之前必须成功读取什么」，才不会在产物漏带资源时反复修改环境端口。

错误边界可以用同样的方法读。缺少文件时底层异常通常有字符串 code，启动辅助函数取出它产生诊断；默认文件存在却写错端口时，是配置函数自己构造带消息的 Error。一个属性告诉你操作系统为何没有读到文件，另一个说明读到的内容违反哪条约定。若抛出来的是一个普通对象，哪怕碰巧有 message 键，也达不到本章 errorMessage 所检查的实例条件。兜底分支的意义是让本来就没有可靠诊断信息的值仍能被处理，不要在处理第一次失败时再因为读取不存在的属性而失败。至于是否把内部诊断公开给接口调用者，是请求边界根据已识别的错误种类另行作的决定。

### 三条不同的判断路径

现在可以把「TypeScript 能运行」拆开。类型检查在执行前分析代码约定；转译把 TypeScript 转成 JavaScript；运行时真正执行程序并处理当前输入。检查不会执行所有请求路径，转译不等于检查，启动成功也不等于每种输入都正确。

本章用 `tsc --noEmit` 单独检查，主服务在开发模式下由 TypeScript watch 编译后交给 Node 运行，生产构建同样使用 tsc。tsx 用于独立源码实验，它不承担完整类型检查，不能把单文件运行成功当作项目检查通过。

也不要把「Node 只能执行 `.js`」当成解释。这里固定的 Node 24 已支持擦除一部分 TypeScript 类型语法，简单的 `.ts` 文件可以直接运行，但这个过程不检查类型，也不按 `tsconfig.json` 做项目转换。当前服务采用 `.js` 导入与编译产物对齐，直接 `node src/server.ts` 并不会因此自动把所有 `.js` 导入改指向 `.ts` 源码。选择入口时，必须同时考虑语法和模块解析。

## 6.2 CommonJS、ESM 与模块解析的实际报错

### Node 在加载文件前就需要知道规则

第四章使用 `import.meta.url`，已经走在 ESM 路线上。继续保留根目录 `package.json` 的 `"type": "module"`。在这个包作用域下，普通 `.js` 文件按 ESM 解释；`.mjs` 明确表示 ESM，`.cjs` 明确表示 CommonJS，能覆盖默认分类。对于本章的 `.ts` 文件，检查与开发工具也要使用与最终输出相符的模块规则。

CommonJS 常见的导出是 `module.exports = value`，加载是 `require()`；ESM 使用 `import`／`export`，有独立的模块解析与加载规则。把文件里的关键字换一下并不代表完成了迁移，因为文件分类、解析方式与调用方如何取得导出都可能变化。

例如，在本项目的 `.js` 文件里直接使用裸 `require()`，会遇到 `require is not defined in ES module scope`。这说明文件按 ESM 执行，不能据此得出依赖没有安装。反过来，把使用 `import.meta` 的源码硬改为 CommonJS 输出，也会与原有路径代码冲突。当前选择保持 ESM，避免同时改变路径模型和模块系统。

新版本 Node 对两种系统提供了多种互操作能力，不能再用「require 永远无法加载任何 ESM」这样的绝对结论推断。互操作有同步性、顶层 await 与导出形状等约束。本章需要的是从 ESM 使用一个简单的 CommonJS 导出，完整的双格式包设计留到共享契约阶段。

前端项目里，浏览器最后拿到的文件往往已被构建工具改名、合并，还可能被拆成按需加载的几块。编辑器中的模块边和网络面板中的文件于是很少一一对应。这里没有负责合并的打包器。服务器执行到入口之前，Node 就要根据文件里的静态导入找到依赖，确认所要求的名字能由对方提供。于是有三种先后分明的故障：找不到目标地址、找到了却没有要求的导出、模块能加载但在执行函数时失败。若启动日志一个字也没出现，不能因此判断是端口配置坏了；前两类问题甚至可能发生在 loadConfig 被调用之前。

可以拿现有的三个文件画一棵很小的关系图。入口需要 config 里的 loadConfig，也要从 errors 里取两个辅助函数；config 为了说明读取失败的原因，也需要 errors。两条路径最后都到同一个 errors.js。导入一个函数只是让调用者拿到这个导出绑定，并没有在 import 那一行就读取默认配置；真正的 readFile 在启动函数调用 loadConfig 后才发生。因此若错把函数名拼成一个从未导出的名字，启动的 catch 还没机会运行；若名字正确而配置文件缺失，诊断却能经过启动的 catch。两种都可能让服务无法监听，诊断来源与修复文件并不相同。

再把注意力放到包作用域。入口文件放在 dist/src 里，它仍位于项目 package.json 的下层，在项目内运行时自然能得到这里明确写下的模块选择。搬运时如果只复制若干 JavaScript 文件，目标路径上最近的清单可能是另一份，它会参与解释这些普通扩展名文件。当前版本对某些没有明确声明类型的文件还可能根据语法识别模块，所以漏清单后偶然启动成功，不能证明交付时不需要声明这个条件。使用明示的模块类型，维护者能从产物直接读出采用哪种规则，不必靠机器上碰巧有什么父目录或某次自动识别成功来推断。

这也解释了为何本章没有把每个失败都改成动态导入。静态依赖表示服务启动所必须具备的能力，缺了公开导出时应尽早暴露；把它挪进请求处理函数，可能只会让应用看似监听成功，等第一笔请求到来才失败。支线里的动态导入服务于另一个目的：程序先展示公共入口的结果，然后由读者选择一个实验分支，观察该次加载失败。选用哪一种写法要结合依赖何时需要、失败应由谁接住。随意挪动导入位置会改变故障时点，不能算作修复了原来的导出关系。

### 相同的导入文本会经过不同解析者

服务源码里的导入继续写：

```typescript
import { loadConfig } from './config.js';
```

这条路径相对于当前模块，不相对于 shell 的工作目录。类型检查时，TypeScript 在 NodeNext 规则下会进行扩展名替换，找到用于检查的 `config.ts`；输出时保留 `./config.js`；Node 执行产物时，旁边确实存在 `config.js`。三个阶段协作，才让同一行导入成立。

| 阶段 | 当前文件 | 需要找到的文件 |
| --- | --- | --- |
| 类型检查 | `src/server.ts` | `src/config.ts`，用于检查导出与类型 |
| 日常开发编译与运行 | `.dev/src/server.js` | `.dev/src/config.js`，与生产产物采用相同导入关系 |
| Node 产物运行 | `dist/src/server.js` | `dist/src/config.js`，按 ESM 加载 |

如果改成 `./config`，某些开发工具仍然能猜到文件，但原生 Node ESM 不替相对导入自动补齐 `.js`，也不自动尝试目录里的 `index.js`。输出保留这个缺少扩展名的路径，就可能出现 `ERR_MODULE_NOT_FOUND` 或目录导入错误。NodeNext 检查的一个价值，是把这类与目标运行时不一致的写法尽量提前指出。

另一条可行路线是源码写 `.ts`，配合支持的配置重写相对扩展名，或者直接按原生 TypeScript 的约束运行。它有自己的适用条件。本章选择输出扩展名写法，是为了保持一条清楚的 ESM 产物运行路径；不要同时混用几套导入习惯，再期待工具替自己猜测。

从空白推导这个扩展名时，不妨先假装自己是最后接手交付目录的人。你要运行 dist/src/server.js，在它所在的目录横向找一个名字明确的实现文件。那里未来应有 config.js，于是入口中应保留的文字是 ./config.js。现在退回一步问编译器，这个将来会存在的文件由哪份源码产生？在本项目的输出布局中，是 src/config.ts。最后才问编辑器，跳转到定义该去哪？是作者今天能够修改的那份 ts。按「产物需要什么 → 源码由谁提供 → 编辑器去哪找」倒着推，就不容易因为资源管理器中还没有 config.js，便把导入改成只能在源码目录里解释的路径。

完成下一节首次成功构建后做一次无需启动服务的核对。在 VS Code 中打开 src/server.ts，对 loadConfig 执行转到定义，记下落到哪个文件。再从资源管理器打开 dist/src/server.js，找到保留下来的相对导入，沿它打开 dist/src/config.js。这里还留着指向 errors.js 的导入和读取默认 JSON 的代码，但看不到 src/config.ts 里的 Config 类型别名。继续打开 dist/src/errors.js，确认调用方真正要用的两个函数都被导出。沿着这一条链走，可以同时验证检查器取的是哪份声明、Node 最终能加载哪些值，单看编辑器能跳转只证明了前一半。

若需要在终端精确确认编译器选中了哪个文件，在项目根目录使用本地编译器运行下面的查询。它使用项目的原配置并且不写产物；解析记录较长，在终端查找 `./config.js`，关注从 src/server.ts 发起的那一段及其最终命中的路径。

```bash
npm exec -- tsc --noEmit --traceResolution -p tsconfig.json
```

一次查找可能尝试多个候选，某个候选不存在只表示还在继续寻找。要判断本次导入是否失败，应读到这次解析结束的结果以及整个命令的退出状态。本例可以同时看见导入文本以 js 结尾、命中的源码以 ts 结尾；运行时不会重放这份查找记录。换句话说，编译器能定位目标只说明可以据此核对源码，不会把找到的绝对路径写入输出。若项目被复制到另一台机器，模块仍应按原来的相对关系组成程序，这也是构建不该把作者本机的目录名当作业务代码依赖的原因。

可以换一个条件检查这个推理。假设把整个 dist 连同 package.json 一起搬到另一个空目录，入口与 config.js 的相对距离没有变化，代码模块的连线仍成立。若只把 server.js 从 src 子目录向上提一级，导入文本不变，它现在会去新位置旁边寻找 config.js；即使其余文件一个也没删，也可能加载失败。再假设三个 JavaScript 模块一起移动，它们彼此能找到，config.js 和默认 JSON 之间的距离却可能改变。一次移动同时影响多条相对路径，因此决定布局时既要画代码到代码的边，也要画代码到资源的边。

### 包名、包入口与文件路径不是一回事

`node:http` 指向 Node 内置能力，不需要安装 npm 包。`./config.js` 是相对文件路径。`some-package` 这样的裸标识符则通常进入包解析：Node 从导入者所在位置沿目录寻找相应的 `node_modules`，再依据包的入口声明确定加载哪个文件。不是任意 cwd 下都靠同一个全局目录解析。

包可以用 `main` 提供传统入口，也可以用 `exports` 明确允许的入口和子路径。存在适用的 `exports` 时，包入口解析受它约束。某文件在安装目录里，并不意味着调用方可以用包子路径访问它。

例如，一个包只导出 `".": "./entry.js"`，`import '包名'` 可以成功，`import '包名/internal.js'` 却可能得到 `ERR_PACKAGE_PATH_NOT_EXPORTED`。这与「文件不存在」不同；解决方式应当是使用公开入口，或者由包作者正式增加入口，而不是不断试文件扩展名。`exports` 管理公开接口，也不是保护敏感文件的安全沙箱，知道绝对文件位置仍可能通过文件路径访问。

定位模块问题时，可以顺着错误发生的阶段判断：检查器报找不到类型，先核对检查配置与声明；Node 报模块不存在，核对产物中的实际导入和文件；包子路径未导出，核对公开入口；模块已加载却没有指定导出，核对导出形状。不要一看到导入错误就删除锁文件重装，那个动作无法修复错误的路径语义。

再把「编辑器里能补全」拆开一次。node:http 的请求类型来自本地安装的 Node 声明文件，真正的 createServer 实现则来自当前 Node 进程。安装声明以后不会在产物里多出一份 HTTP 服务，删除声明也不会把已安装的 Node 的 HTTP 能力删掉。可以在第一次构建后并排搜索 server.ts 与 server.js 中的 createServer 和 IncomingMessage：前者的运行时导入被保留，后者作为仅供检查的名字消失。若把 HttpError 也当成纯类型拿走，运行时的 instanceof 就失去实际要比较的构造函数。选择 import type 的依据是这个名字是否只出现在类型位置，不能仅因为它以大写字母开头就视为声明。

诊断时把错误消息里的「谁在导入」也圈出来。源代码检查失败，如果发起者是 src/server.ts，就回到这份工程的编译设置；Node 的消息若指出发起者在 dist/alias/main.js，就去检查那个输出，而不是在业务入口里随便改一个 import。两个文件里即使都写同一个包名，包查找的起点仍是各自的模块位置。项目里的嵌套示例有自己的清单和入口约定，因此在示例目录成立的自引用不能搬去当成根项目已经安装的依赖。先定位发起者，再解释请求的是相对路径、包名还是包子路径，才有依据决定该检查输出布局还是入口清单。

## 6.3 建立开发、检查与构建命令

### 让检查器面对真正的运行目标

在根目录安装开发工具：

```bash
npm install --save-dev --save-exact typescript@5.9.3 tsx@4.23.15 @types/node@24.13.3
```

这会同时更新 `package.json` 和 `package-lock.json`。如果使用本章完成代码，直接执行 `npm ci`，不必重复添加依赖。不要依赖机器上恰好安装的全局 `tsc`；npm 脚本会优先找到本项目的可执行程序。

新增根目录 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "rootDir": ".",
    "outDir": "dist",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "verbatimModuleSyntax": true,
    "noEmitOnError": true,
    "sourceMap": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

这些选项来自实际边界。最终交给 Node 的 ESM 产物需要 NodeNext 模块规则，不能仅因为前端项目用了 `Bundler` 就照搬。NodeNext 会随 TypeScript 版本演进，固定编译器版本让这里的判断有明确基线。`target` 决定输出语法的目标，`lib` 提供对应标准对象的类型描述；它们不会为运行时补装 API。`types: ["node"]` 接入 Node 声明，不会安装 Node 本身，也不保证所有声明中的能力都适合任意旧版 Node。

`strict` 要求处理隐式宽泛类型和空值等问题；`noUncheckedIndexedAccess` 再补上数组与字典索引可能缺失的情况。刚才对正则捕获和字符串分割的处理就是由此来的。`verbatimModuleSyntax` 让类型导入与值导入更明确，避免把模块格式不匹配的问题悄悄转换掉。

`include` 决定本次检查和编译的入口范围。`rootDir` 则决定输出如何保留源文件的目录结构，两者不是同一个开关。我们设 `rootDir` 为根目录，因此 `src/server.ts` 生成 `dist/src/server.js`。这样可以让配置目录在输出根下保持原来的相对关系。单独的 `examples/` 不进入服务构建，故意失败的演示也不会阻塞正常构建；它们需要按各自的命令运行。

`noEmitOnError` 让本次编译有错误时不输出新文件，但它不负责删除旧文件。假如上一轮构建成功，这一轮失败后直接启动旧 `dist`，读者可能误以为刚改的代码已经生效。因此还需要一个先清理再构建的命令。

怎样从一个陌生项目的配置判断该执行什么，而不是先把这些选项背下来？可以从目标入口一步步反推。最终要运行 dist/src/server.js，就先在编辑器的目录树画出输出根 dist，下面保留 src 这一层。执行入口还要按 ../config 找默认文件，说明输出根下还要有与 src 平级的 config。现在回到源码树，哪个公共目录同时位于 src 和 config 之上？正是项目根。让编译器以这里为 rootDir，生成的代码就有合适的骨架；资源要自己送过去。若改以 src 为根，输出中 server.js 的位置会变，启动命令与读取资源的相对关系都必须重新验算。设置一个新 outDir 只能改变最外层的落点，不能自动修正所有依赖这棵树的位置。

再读 include，可以看出类型检查到底替谁担保。以 src 下的 TypeScript 文件作起点，编译器还会追踪它们导入的模块；把某个可导入文件放到另一个目录，并不意味着它永远不可能进入程序。反过来，只在磁盘里另放一个独立演示，不被这些入口引用，也没被 include 选中，就不能拿主项目的绿灯证明它已受检查。这个区别在本章有现成反例：examples 中的类型断言程序独立存在，项目构建成功，它仍会在真正执行时因为数字没有字符串方法而失败。要查「这个文件为什么被检查」，应先问它被哪个入口选中或被谁导入，再决定是否需要调整项目范围。

也可以先预测一次构建失败会留下什么，再决定是否要在交付前清理。设磁盘上已经有昨天成功构建的服务，今天只改 src 中记录的时间类型。运行 typecheck 失败会告诉你今天的源码不成立，但这个命令原本就不写文件，昨天的 dist 可以还在。若入口是 check，第一步类型检查失败会短路，连 build 开头的清理也不会发生。若显式执行 build，则先清理，随后编译报错，不产生这一轮的服务入口。这两条命令可以给出相同的类型诊断，却在磁盘上留下不同状态。在 VS Code 里同时看第一条诊断、命令退出状态和文件树，别把「能展开 dist」误认为本轮已产出可交付程序。

错误旁的文件位置也值得辨认。编辑器的提示可能来自打开文件时采用的工程；终端运行 tsc 若只指定某个文件，选择配置的方式可能与项目命令不同。这里要核对主线代码，就从包含 package.json 的根目录执行既有脚本，让本地编译器按工程读取配置。若只想确认实际生效的选项，在终端运行 `npm exec -- tsc --showConfig -p tsconfig.dev.json`，先找 outDir，再看列出的源文件。开发配置继承了根配置的模块与严格检查规则，仅把产物放到另一棵树；解释结果时应以合并后看到的有效值为准。这个命令等下一步建好开发配置再运行，本身不会启动监听。

### 让非代码文件进入同一份产物

第四章的配置读取仍是：

```typescript
const configUrl = new URL('../config/service.json', import.meta.url);
```

在源码中，它指向根目录的 `config/service.json`。编译到 `dist/src/config.js` 后，它自然指向 `dist/config/service.json`。这正是我们希望的关系，但普通 `tsc` 不会扫描每个 `readFile()` 参数并复制资源。必须明确把配置放进去。

新增 `scripts/clean.mjs`，仅删除构建输出目录：

```javascript
import { rm } from 'node:fs/promises';

await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
```

再新增 `scripts/copy-assets.mjs`：

```javascript
import { copyFile, mkdir } from 'node:fs/promises';

const target = new URL('../dist/config/', import.meta.url);
await mkdir(target, { recursive: true });
await copyFile(
  new URL('../config/service.json', import.meta.url),
  new URL('service.json', target),
);
```

两个脚本都按模块位置定位项目资源，不借用启动者的 cwd。复制对象明确是无秘密的默认配置，而不是把 `.env`、日志、用户数据和整个工作目录一起塞进去。这里的配置是构建时的一份快照：修改根目录默认文件后，要重新构建才能改变产物中的副本；运行时 `PORT` 仍由启动环境提供。

在 `.gitignore` 追加 `dist/` 和 `.dev/`，让可重新生成的文件不进入源码历史。然后把 `package.json` 的 `scripts` 替换为：

```json
{
  "dev": "NODE_ENV=development node --env-file-if-exists=.env scripts/dev.mjs",
  "typecheck": "tsc --noEmit",
  "clean": "node scripts/clean.mjs",
  "build": "npm run clean && tsc && node scripts/copy-assets.mjs",
  "start": "NODE_ENV=production node --enable-source-maps dist/src/server.js",
  "debug": "NODE_ENV=development node --env-file-if-exists=.env --enable-source-maps --inspect-brk=127.0.0.1:9229 dist/src/server.js",
  "check": "npm run typecheck && npm run build"
}
```

这是 `scripts` 对象的内容，保留外层原有的包名、`type`、版本约束和刚安装的开发依赖。`&&` 保证前一步失败后不继续：类型错误不会继续复制配置，复制失败会使构建整体失败。清理之后的一次失败可能留下不完整产物，因此运行与交付都必须以整条构建命令成功为前提。

这里的 `start` 不偷偷重新构建。它只运行现有产物，因而可以在没有 TypeScript 工具的目录里执行。`debug` 同样调试构建结果；改了源码后先重建，避免断点面对旧代码。`sourceMap` 生成位置映射，`--enable-source-maps` 让错误栈尽可能映射回源码位置。映射不是 TypeScript 执行器，也不替代实际源码；本机调试时保留源码，分享映射文件前同样检查其中的信息。

交付检查应使用另一份请求目标。在 Postman 复制现有集合，将副本命名为“EPP 产物核对”，把集合变量 baseUrl 设为 `http://127.0.0.1:3001`。本章后面准备好独立运行目录后，在该目录执行 `PORT=3001 npm start`，发送列表、创建、详情和错误请求；看清响应来自哪个端口。开发集合仍指向 3000。两个进程各有自己的 Map，创建后的 ID 应复制到各自集合的 captureId，不能互用。

### 保存以后，怎样让正在运行的代码一起更新

学习时默认执行 `npm run dev`，同时获得自动编译、重启和本机断点调试。tsx 可用于快速运行单文件，前面的类型断言实验仍使用它；主服务采用同一份 tsconfig 的 TypeScript watch 编译，便于把开发和生产的编译语义保持一致。以后加入装饰器元数据也继续走这条路径。选开发工具时，先看编译失败以后旧服务会不会继续响应。单包 TypeScript 项目可以用 tsc-watch 在编译成功或失败时执行动作；进入 Nest 后，其官方 CLI 也提供 watch、debug 和资源监听。本项目需要保持 NodeNext 输出、模块相对资源布局，并在类型错误时停掉旧服务；下面的脚本将这些要求显式接起来。选择自维护也意味着承担退出、重复保存和配置变化的维护成本，不能因为少装一个包就认定更简单。第八章再按框架工具的实际能力比较迁移条件。

仅执行 `tsc --watch` 还不完整：它负责生成 JavaScript，却不会确保服务重启；只监听 dist 也可能在一轮编译尚未全部完成时提前启动。我们需要在完整编译成功后，停止旧进程、等待它退出、复制配置，再启动新进程。编译失败时也停止旧服务，避免拿旧响应判断刚写的代码。

开发编译继承相同的类型与模块规则，仅改变输出目录。新增 `tsconfig.dev.json`：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "outDir": "./.dev"
  }
}
```

开发进程运行 `.dev/src/server.js`，资源复制到 `.dev/config`；交付构建只清理并生成 `dist`。这样运行检查时不会删除正在调试的文件，开发重编译也不会改写交付候选产物。两套目录隔离文件，进程仍需使用不同业务端口。

配套的 `scripts/dev.mjs` 如下。日常工作直接使用 npm 命令，不必把编译器 API 或进程编排当作业务开发的前置练习：

```javascript
import ts from 'typescript';
import { spawn } from 'node:child_process';
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Keep development and production on the same TypeScript compiler settings.
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const format = {
  getCanonicalFileName: name => name,
  getCurrentDirectory: ts.sys.getCurrentDirectory,
  getNewLine: () => ts.sys.newLine,
};
let child;
let revision = 0;
let compiled = false;
let stopping = false;
let pending = Promise.resolve();

async function stopServer() {
  const current = child;
  if (!current || current.exitCode !== null || current.signalCode !== null) return;
  await new Promise(resolve => {
    const deadline = setTimeout(() => current.kill('SIGKILL'), 2000);
    current.once('exit', () => { clearTimeout(deadline); resolve(); });
    current.kill('SIGTERM');
  });
}

function restart(ready) {
  const requested = ++revision;
  pending = pending.then(async () => {
    await stopServer();
    if (stopping || requested !== revision || !ready) return;
    mkdirSync('.dev/config', { recursive: true });
    copyFileSync('config/service.json', '.dev/config/service.json');
    const current = spawn(process.execPath, ['--inspect=127.0.0.1:9229', '--enable-source-maps', '.dev/src/server.js'], {
      stdio: 'inherit',
    });
    child = current;
    current.on('error', error => console.error('[dev]', error.message));
    current.on('exit', (code, signal) => {
      if (child === current) child = undefined;
      console.log(`[dev] Server exited (${signal ?? code}); waiting for changes.`);
    });
    console.log(`[dev] Starting compiled server (pid=${current.pid}).`);
  }).catch(error => console.error('[dev]', error.message));
}

const host = ts.createWatchCompilerHost(
  'tsconfig.dev.json', { noEmitOnError: true }, ts.sys,
  ts.createEmitAndSemanticDiagnosticsBuilderProgram,
  diagnostic => {
    console.error(ts.formatDiagnostic(diagnostic, format));
    compiled = false;
    restart(false);
  },
  diagnostic => console.log(ts.formatDiagnostic(diagnostic, format)),
);
host.afterProgramCreate = program => {
  const diagnostics = [...ts.getPreEmitDiagnostics(program.getProgram()), ...program.emit().diagnostics];
  for (const diagnostic of diagnostics) console.error(ts.formatDiagnostic(diagnostic, format));
  compiled = !diagnostics.some(item => item.category === ts.DiagnosticCategory.Error);
  console.log(compiled ? '[dev] Build succeeded.' : '[dev] Build failed; server stopped until fixed.');
  restart(compiled);
};
const watcher = ts.createWatchProgram(host);
const assets = ts.sys.watchFile('config/service.json', () => restart(compiled), 250);

async function shutdown() {
  if (stopping) return;
  stopping = true;
  revision++;
  watcher.close();
  assets.close();
  await pending;
  await stopServer();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

TypeScript 的 watch host 负责发现源码和 tsconfig 的变化，afterProgramCreate 是本轮程序已建立的时机；我们在这里收集诊断并发出产物。只有没有错误诊断才申请启动。编译诊断与服务的监听日志是两项证据，不能把 Build succeeded 当作端口已经可用。

restart 把操作串到同一个 Promise 链上，先等旧进程退出再启动；revision 使快速连续保存时已经过期的启动申请失效。两秒后强制停止只是开发进程的兜底，不是生产优雅关闭方案。配置文件不由 TypeScript 编译，因此单独监听并在启动前复制。父进程收到停止信号时关闭监听并结束服务子进程，不能留下一个继续占端口的旧服务。

服务子进程使用 `--inspect=127.0.0.1:9229`，连接调试器前也会正常运行；需要观察启动第一行时才改用既有的 `npm run debug`。VS Code 的连接与重连在本章支线 6B 展开。sourceMap 仍将产物位置映射回 src。修改依赖、package.json、开发脚本或环境变量后，手动停止并重新运行 dev；这些不属于当前源码监听范围。

运行 dev 后，把启动日志改一个词并保存；等待重启完成，重发请求核对。再故意制造一个类型错误，观察旧服务停止；修复并保存后应恢复。保持 dev 运行，在另一个终端执行 `npm run check`，它依次检查类型并构建 dist；随后再向开发端口发送请求，确认开发进程仍可用。这能验证目录隔离，而不只是看两条命令是否存在。check 不会发送业务请求，正常创建与错误拒绝仍由已保存的 Postman 请求核对。

| 场景 | 命令与结果 |
| --- | --- |
| 默认学习与接口联调 | `npm run dev`：自动编译/重启，Inspector 仅监听本机 |
| 单独检查类型 | `npm run typecheck`：不启动服务 |
| 生产构建 | `npm ci` 后 `npm run build`：清理、编译、复制配置 |
| 生产运行目录 | 按 6.4 复制产物与清单，`npm ci --omit=dev` 后 `npm start`，不监听源码、不开调试端口 |
| 启动阶段断点 | 先停止 dev，`npm run build` 后 `npm run debug`；连接后继续 |

生产环境的变量由部署目标提供。`NODE_ENV=production` 只是程序可读取的环境值，不会自动替你构建、复制配置或删除命令里的 inspect 参数。这个阶段提供完整的生产构建和运行入口；服务托管、HTTPS、更新和回退在部署篇接上。

TypeScript watch 的接口可查阅[官方 Compiler API 示例](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#writing-an-incremental-program-watcher)，本项目按锁定的 TypeScript 5.9.3 使用。

第一次用开发脚本时，最好把集成终端分成两块。左边只保留 npm run dev 输出，从文件变化到新 PID 监听的顺序在这里看；右边用于不负责监听的检查或构建。让 Postman 的开发集合记录一笔已成功创建的标识，先在同一地址按标识读取一次，确认样本确实存在。随后在右侧执行 check，回左边核对有没有新的子进程启动，再读相同标识。若右侧成功且原标识还在、左侧 PID 也没换，说明这一次运行检查没有中断正在服务的开发进程。只看两次列表都返回二百却无法得出同样结论，一个新进程同样可以返回二百空数组。

再把条件换成修改 src 文件并保存，这次要分别观察父进程与子进程。终端里长期等待文件变化的是父进程；实际持有 Map、监听业务端口的是它启动的子进程。旧子进程退出到新子进程开始监听之间有一段真实空档。若这时正好点了发送，可能得到连接失败，不能仅据此认定自己的路由代码坏了。等到新一行监听消息出现，按刚才那笔标识读详情应得到找不到，读列表却能成功。前面的样本取得过程排除了「本来就没创建」的解释，新 PID 又说明为什么这次查不到。修正代码后要验证的是新程序能否创建并读回新记录，不能要求已结束进程中的那一笔回来。

把开发子进程停在断点时，还有另一种空档容易混淆。端口可能已经在监听，请求已经连入，却迟迟没有响应，因为 JavaScript 正暂停在发送之前。若此时保存源码触发重启，调试器停住的目标可能直接退出；即便稍后重新连接成功，屏幕上的局部变量也属于下一次进程和下一次请求。排查某一笔写入时先固定源文件不动，在当前请求内完成暂停、单步、继续和按标识读回，然后再改代码比较下一轮。否则每次保存都把正在研究的对象换掉，很难分清是修改奏效还是整个 Map 已换新。

快速连续保存两次，可以按两个申请来读脚本里的 revision。第一次编译成功时提出启动甲的申请，停止旧进程需要等待；等待期间若有第二次编译结果，最新编号已经改变。轮到甲决定是否拉起进程时，要把自己当初的编号与当前编号比较，过期便不再启动。下一项申请随后按自己的编译结果决定是否启动乙。这样解决的是排队等待时结果被更新的问题，并不保证每次保存都有一行对应的「正在监听」输出。若只为验证最后一次编辑生效，等最新监听消息后再用一个可辨认的启动提示或响应对照即可，无须试图在极短间隔中抢到每个中间版本。

最后区分两类「改了配置没反应」。默认 JSON 是脚本单独监听的资源，变化后还要复制进开发输出并重启子进程。环境变量却由启动父进程时取得，在另一个终端给同名变量赋新值，不会修改已经运行的父进程环境；只等下一次源码保存，也未必得到原先以为已经改好的环境。在终端启动服务时若显式设置了 PORT，修改默认文件中的合法端口后，重新启动的子进程仍可能按环境里的端口监听。查配置值时先把优先级和进程代际写清，再比较文件副本；只盯着源码树里最新的数字看，往往解释不了真实的监听地址。

### 分别运行，观察责任没有混在一起

先在另一个终端执行下面的检查和产物启动；若 3001 已有上一轮产物服务，先停止它。开发服务可以继续使用 3000：

```bash
npm run typecheck && npm run build && PORT=3001 npm start
```

检查成功应以退出码 `0` 为依据，不要求工具一定打印「成功」。构建后应有三个业务模块的 `.js` 和 `.js.map`，以及 `dist/config/service.json`。启动后使用“EPP 产物核对”集合向 3001 发送新增、列表和详情请求，错误输入仍然返回 `400`，不能因迁移类型而接受数字原文。

完成这轮核对后停止 3001 的产物服务；开发服务若仍在运行，就继续使用它，若已停止再执行 `npm run dev`。两者各有自己的 Map，记录不会从一个进程搬到另一个。watch 模式监测代码变化并重启程序，因此修改源码触发重启后，内存记录也会消失；这不是 TypeScript 把记录删除了。

开头的类型断言示例可以在另一个终端独立运行：

```bash
node --import=tsx examples/type-boundary.ts
echo $?
```

应先看到 `actual type: number`，再看到 `trim` 不是函数的错误和非零退出码。这个单文件没有相对模块依赖，使用 `node examples/type-boundary.ts` 也能观察原生类型擦除后的同一边界；两者都没有把断言变成校验。

再在 `src/server.ts` 中暂时把构造记录的 `createdAt` 改为数字 `42`。`npm run typecheck` 应报告类型不匹配；`npm run build` 应失败，并且清理后的 `dist/src/server.js` 不应存在。恢复为原来的 `new Date().toISOString()`，重新检查和构建。这个小变化验证的是「错误能否在产物进入运行前被发现」，而不只是记住一个选项名称。

### 复现开发成功、编译成功、运行仍然失败

路径别名能把这三个判断分开得更清楚。新增独立目录 `examples/alias/`。其中 `value.ts`：

```typescript
export const label = 'alias works in development';
```

`main.ts`：

```typescript
import { label } from '@demo/value';
console.log(label);
```

以及该目录自己的 `tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmitOnError": true,
    "rootDir": ".",
    "outDir": "../../dist/alias",
    "paths": { "@demo/*": ["./*.ts"] }
  },
  "include": ["./*.ts"]
}
```

它刻意模拟一份工具可以理解的配置，不替换服务自己的 NodeNext 配置。在项目根目录依次运行：

```bash
TSX_TSCONFIG_PATH=examples/alias/tsconfig.json node --import=tsx examples/alias/main.ts
npm exec -- tsc -p examples/alias/tsconfig.json
node dist/alias/main.js
```

前两步应成功；最后一步应报告找不到 `@demo/value`。打开 `dist/alias/main.js`，关键证据是那个别名导入仍然在那里。TypeScript 的 `paths` 帮检查器找到目标，不负责把输出导入重写成原生 Node 可识别的地址；这次 tsx 恰好理解同一套别名，原生 Node 却没有得到对应配置。

修复应面向最终消费者。如果没有必须使用别名的理由，把独立示例的导入改为 `./value.js`，再编译和运行即可；服务本来就采用这种写法。如果项目需要别名，可以选择 Node 支持的包导入映射，或者让构建过程明确完成重写或打包，但要核对输出、资源与调试方式。把配置名改来改去直到开发入口不报错，不足以证明交付路径正确。

独立示例的产物也在 `dist/` 下，下一次服务构建会清理它。这个实验不加入记录路由，不改变接口，也不把别名变成本项目的新依赖。

在修改独立示例导入之前，可以先只观察 dist/alias/main.js 的第一条导入，遮住终端里的报错来预测结果。输出中若仍保留以 @demo 开头的裸标识符，Node 会尝试把它当包名解析；示例只是告诉工具去某个源码位置找值，并未安装对应的包。因而程序会在打印 label 之前结束。此时去改 label 的类型或打印语句都不会改变结果。把导入换为相对路径后，重新打开输出，看它是否真的改变；再看目标文件是否处于该相对位置。若输出仍写着旧别名，先核对刚才是否编译了示例自己的配置，主服务构建甚至会清掉这份独立示例产物。

这个定位办法比「关掉别名就能好」更能迁移到真实项目。前端已有别名、测试工具也支持，并不必然要求服务端删除所有别名。需要做的判断是：最终消费者是会改写导入的打包器，还是直接加载文件的 Node？若选择改写，就把检查点放在最终文件中的实际字符串与文件布局；若选择运行时映射，就要把映射的声明连同实现放入交付单元。只有 tsconfig 里的一行提示，最后又不分发 tsconfig 给 Node，不能解释运行时从何获知那条映射。把配置、工具和产物各自读了什么画明白，才能知道项目换一个运行入口后哪些设置仍有效。

## 6.4 锁文件、依赖与一份能够搬走的程序

### 安装的是工具，还是服务运行时要调用的实现

本章三个直接依赖都属于 `devDependencies`：TypeScript 负责检查与编译，tsx 负责开发运行，`@types/node` 提供声明。生成的业务 JavaScript 没有导入这些包，普通 Node 运行产物时不需要它们。

这个分类依据是「产物是否需要」，不是「代码是不是写在 src 里」。以后服务运行时导入框架、数据库客户端或校验库，那些实现就必须作为运行依赖到达目标环境；即使本机开发时同样用它们，也不能因此全部放进 `devDependencies`。反过来，`import type` 引入且被擦除的声明不构成运行时加载。

`package.json` 表达直接依赖与版本约束，锁文件记录本次解析的具体依赖树及获取信息。固定三个直接版本还不够，因为工具自己的依赖也有版本选择，平台相关可选包也可能不同。应把清单与锁文件一起保存，使用 `npm ci` 根据锁文件建立安装结果。

`npm ci` 会在已有 `node_modules` 时先移除它，并要求清单与锁文件相容；遇到冲突不会替你悄悄更新锁文件。只有明确增加、删除或升级依赖时才通过 `npm install` 等命令更新，并检查变化。锁文件不是运行环境的全集：Node 版本、系统平台、原生组件和启动配置仍需另外控制，因此第三章的 `.nvmrc` 与安装版本检查继续保留。

替接手运行目录的人列一次实际加载清单。启动命令需要 Node，可执行程序来自运行环境；它读取 server.js，后者再加载本项目的 config.js、errors.js，以及 Node 自带的 http、crypto 等模块；配置读取器还打开了一份 JSON 文件。沿这些边，没有一步要调用 tsc，也没有一步去加载记录类型 Capture。于是把编译器留在构建阶段，把配置资源放入运行阶段，有一条可以复核的依据。如果将来把手写配置检查换成一个运行时导入的校验库，即使返回的 Config 静态类型一字未改，加载图也已经改变，依赖分类就需要重新判断。

锁文件可以从一次实际分工来理解。作者在清单里选择用哪几种直接工具，但安装工具本身还需要向下取得其他包。两个人只看到相同的三个顶层版本，并不知道它们往下每条边最终选中了什么；锁文件把这次解析结果一起记录下来。交付者用 ci 建立跟清单相容的安装树，避免修复一次启动问题时无意间顺手换了一批工具。若 ci 明确指出两份文件不相容，先判断是有意添加依赖时漏交锁文件，还是拿错了某个版本的清单。前者应在构建项目中完整处理一次依赖变更，后者应重新取同一批材料。为了让临时运行目录通过就重写锁文件，会失去对原交付候选的核对意义。

再问一个常见的交接问题：「本机 npm run build 成功，而同事电脑只要运行，用不用把本机的 node_modules 整棵复制过去？」沿刚才的加载清单，本章的业务实现没有第三方运行库，生产安装省略开发依赖后即可运行。若以后有需要平台原生实现的包，目标系统与构建机还可能不同；一棵目录在作者平台能被加载，不自动证明在另一平台也能加载。锁文件限定的是安装选择，运行环境仍要匹配。当前在同一台机器把源码隔开，可以验证不依赖原工程文件这个条件，尚未检验另一操作系统的安装与运行。把测试条件说清楚，有助于判断下一次故障是否属于这次交付已经覆盖过的部分。

### 把构建与运行分开，才能真正检查缺了什么

只在项目根目录运行，有时会掩盖交付问题：某个资源从源码目录被碰巧找到，某个包从父目录的 `node_modules` 被解析到，或者启动脚本其实重新调用了开发工具。要减少这些偶然条件，就把产物放到独立目录，暂时不给它 `src/`、开发工具和原始 `config/`。

先停止上一轮产物服务，释放 3001；下面重新构建，只复制本次需要的文件到新建的临时目录。开发服务若仍在 3000，可以继续运行：

```bash
npm run build &&
release_dir=$(mktemp -d) &&
cp package.json package-lock.json .npmrc .nvmrc "$release_dir/" &&
cp -R dist "$release_dir/dist" &&
(
  cd "$release_dir" &&
  npm ci --omit=dev &&
  PORT=3001 npm start
)
```

这里把各步用 `&&` 串起来，构建、复制或安装失败就不继续启动。这不是部署到公网，而是一次本机交付核对。产物服务停止后，在同一个 shell 执行 `printf '%s\n' "$release_dir"`，记录这份运行副本的绝对路径。稍后跨 cwd 操作仍使用这个变量；换过终端时，先将 `release_dir` 重新赋为记录的路径。临时目录可能被系统清理，若已不存在，就从成功构建重新准备副本，不依赖它保存开发成果。结束后可删除自己创建的目录，不要用一个现存业务目录代替它。

`--omit=dev` 不把开发依赖安装到运行目录，锁文件里仍然保留依赖信息；本章没有第三方运行依赖，所以业务入口只使用 Node 内置模块和自己的 JavaScript。`package.json` 还保留开发脚本不影响 `start`，但这个目录没有源码和构建脚本，不能在这里重新构建。若以后增加安装生命周期脚本，还要重新检查它是否暗中依赖被省略的工具。

同样，不能先在构建目录执行 `npm ci --omit=dev`，然后期待 `tsc` 仍能工作。构建阶段需要完整开发工具，运行阶段才根据产物省略不需要的依赖。把这两个阶段区分开，也为后面的部署与构建缓存建立基础。

在 Postman 的“EPP 产物核对”集合中确认实际 URL 指向 3001，再次创建记录、读取列表与详情，并提交 `{"originalText":42}`，观察成功数据与错误响应。随后停止进程，在该运行目录用 `PORT=3001 npm start` 重新运行，确认列表为空。这里同时检查两件不同的事：产物确实完整，以及它依然保持内存服务的状态寿命。

第四章还要求程序不依赖调用者 cwd，因此再停止服务，在原 shell 中运行：

```bash
(
  cd /
  NODE_ENV=production PORT=3001 node --enable-source-maps "$release_dir/dist/src/server.js"
)
```

继续使用指向 3001 的产物集合。入口用了绝对路径，配置仍按模块相对位置读取，这才是跨 cwd 成立的原因；`npm start` 会在包目录执行脚本，单用它不能证明任意 cwd 都成立。

还可以在停止后，把临时副本里的 `dist/config/service.json` 改名为 `service.json.saved`，再次启动，观察配置读取失败与非零退出码，再恢复文件。不要修改源码项目来做这一步。程序可以导入所有 JavaScript，却仍因非代码资源缺失而无法启动；这说明可交付单元比一个入口文件更大。

本章完整的运行单元包括：规定的 Node 环境、`package.json` 的模块信息、产物 JavaScript 与位置映射、默认配置，以及按锁文件准备的运行依赖。这里保留映射便于定位；若需要在独立目录中查看 TypeScript 源文，还需单独提供与映射匹配的源码。秘密配置不由构建快照提供，后面的配置与部署章节会在出现相应依赖时继续展开。

实际搬运时，独立运行目录最好放在项目目录树之外。如果在项目里建一个名叫 release 的子目录，一个漏装的第三方包仍有可能沿父目录被找到。把目录移出去以后，绝对入口由外部启动者提供，代码依赖与资源则必须靠交付副本自己的相对布局成立。核对前先在 VS Code 中用另一个窗口打开这份副本，从 package.json 找到 start 的入口，再从该入口沿两个相对导入找到实现，最后从 config.js 所在目录向上一层寻找默认文件。这个走法与运行时一致，能发现「文件全都复制到了某处，层级却不对」的交接问题。

用普通的配置改动再区分两种错误。在这个已停止的副本里，先把默认文件中的端口由数字改成带双引号的同一个值，保留有效的环境端口再启动。预期诊断应指向默认端口必须是范围内整数，因为文件已读到、JSON 也解析成功，只是字段类型不对。恢复原数字，再用前文的改名实验使文件暂时缺失，预期则是无法读取默认文件，并带相应的文件错误码。两次都可能表现为 Postman 无法连接，真正有区分力的证据在启动终端。两次都在恢复后确认同一个副本可以监听，不要在服务已经读完配置且仍在运行时改文件，再用旧进程的响应证明新配置有效。

恢复默认文件后重新启动这份副本，等监听成功，再核对写入边界。输入一条两端带空格的虚构原文，在创建响应与按 Location 读取的详情中对照空格、标识和时间；用 Postman 的原始正文视图或直接看 JSON 字符串两端，避免渲染时空白被折叠。然后在同一进程中先读列表、记下标识，再提交数字原文并重取列表比较。应得到字段拒绝，列表中的那条合法记录还在，且没有多出新的标识。这一次同时证实两件事：打包后运行的确实包含输入检查，而且检查失败发生在写 Map 之前。单看四百状态够判断请求被拒，却不能单独证明写入没有发生。若期间重启了服务，先重新创建合法样本，否则比较的已是两张不同的 Map。

最后把三个位置摆在一起看：源码工程、开发输出、独立副本。若在工程中修改一行启动提示并保存，开发监听可以重新生成自己的输出；显式构建成功以后，工程里的 dist 才代表这次修改；之前已经复制出去的那份副本不会因为原文件更新就同步。即使两个进程使用同一个 Node 版本和环境端口，启动顺序相同，也可能各自运行不同时刻的程序。排查「我明明修过了」时，应在启动者的工作目录和实际入口上取得证据，回到那份副本查看对应的 JavaScript 和配置，再决定是代码还需修改，还是交付步骤根本没把新候选送过去。改一次源码、到处反复重启，不会让旧副本自己更新。

把本次交付过程倒放，可以得到下一次自己接手服务的阅读顺序。先从运行命令确定消费者，再沿模块导入与资源读取找出必需文件，从包清单判断谁在安装时提供实现，最后回到构建命令判断哪些文件由本轮生成。沿途每条边都能指出一个可观察结果：目标文件存在、导出可被使用、默认配置通过检查、服务实际监听、按本次返回的地址能读回。这比把整个工作目录原样交给对方更严格，因为留下的每项材料都有确定的使用者；也比仅发一个编译后的入口更完整，因为你已核对它启动后还会打开哪些文件。

### 第一篇在这里接上下一阶段

现在我们能从源码走到一个独立目录里的记录服务，解释输入为什么要检查、模块为什么能找到、配置为什么要复制，以及重启为何会丢失记录。程序的结构仍然简单：路由、校验、业务操作与内存存储集中在同一个入口里。这个结构适合看清运行机制，接下来功能变多时，就需要更明确的职责边界。

第二篇将沿用这三个接口迁入 Nest，观察框架怎样组织已经写过的职责，而不是另起一个互不相干的示例。数据库仍在第三篇接入。按顺序读完第 1～6 章后，进入第二篇前，再完成[第 7 章：第一篇回顾](../chapter-07-review/chapter.md)，用改变后的运行条件核对这六章建立的判断方法。

## 相关知识支线

- [支线 6A：模块找到之后，拿到的到底是什么](side-01-module-boundaries.md)：用独立的 CommonJS／ESM 与包自引用示例，区分模块分类、文件解析、公开入口和导出值；改变导入方式后解释错误与修复。

- [支线 6B：从“接口不对”到找到出错的那一步](side-02-debugging-workbench.md)：建立 VS Code／Chrome 调试入口，使用调用栈、条件断点、日志点和异常暂停，区分请求未到达与源码映射失效；在独立副本对照同一异常的 JavaScript 栈和 TypeScript 栈。

两条支线分别补足模块边界与调试方法，阅读与操作时间单独计算。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| `unknown`、条件收窄 | 在 JSON、配置与错误边界要求使用依据 | 类型断言不会验证或转换外部值 |
| `Map<string, Capture>` | 约束内部记录的写入与读取 | 查不到时仍可能是 `undefined`；不提供持久化 |
| `import type` | 明确仅用于类型检查的依赖 | 不能作为运行时值使用 |
| `@types/node` | 提供 Node API 声明 | 不安装运行时，不自动保证实际版本具有所有声明能力 |
| `type`、`.mjs`、`.cjs` | 决定模块解释方式 | 不通过改扩展名自动转换模块代码 |
| `.js` 相对导入、NodeNext | 对齐检查、开发与产物的模块路径 | 原生 ESM 相对导入需要完整路径；NodeNext 行为与编译器版本有关 |
| `main`、`exports` | 描述包的公开入口 | 未导出的子路径不等于文件不存在；不是访问安全机制 |
| `paths` | 帮检查器解析别名 | 不自动重写 JavaScript 中的导入 |
| `strict`、`noUncheckedIndexedAccess` | 检查空值、隐式宽泛类型与索引缺失 | 必须落实为符合语义的处理，不能一律用断言压掉 |
| `rootDir`、`outDir`、`include` | 保持输出结构并选择项目入口 | `rootDir` 不是文件筛选器；资源复制另行处理 |
| `noEmit`、`noEmitOnError` | 单独检查；有错时阻止本次输出 | 后者不清除上次产物 |
| `sourceMap`、`--enable-source-maps` | 关联运行错误与源码位置 | 映射不替代源码；分享前检查内容与路径 |
| TypeScript watch、`scripts/dev.mjs` | 默认开发编译、重启和本机调试 | 编译失败停旧服务；不用于生产运行 |
| `node --import=tsx` | 运行独立 TypeScript 示例 | 转译不提供完整类型检查 |
| `npm run build`、`npm start` | 分开构建与运行 | 运行命令不应依赖开发工具或暗中重建 |
| `npm ci`、`--omit=dev` | 按锁文件安装，区分构建与运行需要 | 清单冲突会失败；省略依赖前核对安装与启动脚本 |

官方查阅：[TypeScript 模块参考](https://www.typescriptlang.org/docs/handbook/modules/reference.html)、[TSConfig 选项](https://www.typescriptlang.org/tsconfig/)、[noEmitOnError](https://www.typescriptlang.org/tsconfig/noEmitOnError.html)、[Node 24 的 TypeScript 支持](https://nodejs.org/docs/v24.22.1/api/typescript.html)、[Node 包与模块规则](https://nodejs.org/docs/v24.22.1/api/packages.html)、[tsx](https://tsx.is/)、[npm ci](https://docs.npmjs.com/cli/v10/commands/npm-ci/)。配置与代码以本章固定版本为准。

本章完成状态：代码分支 `part-01/chapter-06`。记录接口与字段沿用前文，新增类型边界、开发命令和独立构建产物。

[上一章：事件循环如何影响服务的响应能力](../chapter-05-event-loop/chapter.md) · [下一章：第一篇回顾：把服务搬离开发目录](../chapter-07-review/chapter.md) · [返回第一篇](../README.md) · [返回全书目录](../../README.md)
