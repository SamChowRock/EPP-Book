# 第 5 章 TypeScript 如何变成可运行的服务

一个服务能够交出去运行，需要的不只是编辑器里没有红线。它还需要明确的入口、能被运行时找到的模块、随程序到达目标目录的配置，以及重新安装后仍然一致的依赖。本章把这些条件连起来，为第一篇的记录服务建立开发、检查、构建与运行的完整路径。

前四章已经建立了三个记录接口，并解释了请求、进程、配置和异步工作的关系。代码依然是 JavaScript，启动时直接读取 `src/server.js`。接下来迁入 TypeScript，新增的主要能力是让程序内部的约定可以被检查，让运行产物可以独立于开发入口接受核对。接口仍然返回原来的数据，记录仍然保存在 Map 中；这次没有数据库迁移，也不会让重启前的内存记录自动留下来。

有前端经验的读者通常已经使用过 TypeScript，但构建工具可能替自己处理了扩展名、别名和资源文件。这里直接把产物交给 Node，恰好可以看清那些工作分别由谁承担。我们先建立输入与类型之间的边界，再沿一个 `import` 看模块怎样找到文件，最后把源码变成一组真正能搬走的文件。

**代码起点**：第四章完成状态，代码分支 `part-01/chapter-04`；本章完成状态使用 `part-01/chapter-05`。继续使用 Node.js `24.22.1`，命令在配套项目根目录执行；macOS、Linux 使用 Bash／Zsh，Windows 使用 WSL。先执行 `nvm use`。本章固定 TypeScript `5.9.3`、tsx `4.23.15` 和 `@types/node` `24.13.3`，以明确的组合讨论行为，不依赖全局安装。

**时间参考（估算）**：正文约 8300 个汉字、250 行代码与命令，考虑类型迁移、模块路径推导和构建配置的阅读密度，只阅读约 50～60 分钟；跟做另加约 40～50 分钟，合计约 90～110 分钟。首次下载依赖另计，支线与第六章分别估算；这些是按内容与步骤估算的读者投入，不是实测时长。

## 5.1 类型检查、转译与运行各自负责什么

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

服务入口需要相反的做法：先把未验证数据当作 `unknown`，检查事实后再使用。把原来的读取函数改成下面的签名，函数体仍保留第二章的大小限制、合并解码与 JSON 解析：

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

这里没有给外部数据强行盖一个类型。运行时条件负责阻止不合要求的数据继续前进，检查器则理解这些条件，并允许后面的代码使用已经得到证明的属性。这种配合以后仍然成立：第十一章引入专门的输入 Schema 时，会集中表达这些规则，而不会用一个接口声明替代校验。

`unknown` 与 `any` 的差别也在这里。两者都能接住外部值，但 `any` 会放行许多操作，把问题推迟到运行时；`unknown` 要求先提供使用依据。`JSON.parse()` 的类型本身允许宽泛使用，所以我们主动在读取函数返回值和配置变量处收住边界。它不是自动安全机制，错误的断言依然可以绕过去。

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

请求的 `data` 监听器标为 `(chunk: Buffer)`。这依赖第二章一直保留的条件：没有对该请求调用 `setEncoding()`，这里读取的是字节块。类型注解本身不会把字符串转成 Buffer；以后改变读取方式时，也要重新核对这个前提。

### 错误对象与配置文件也来自边界之外

第三章在 `catch` 中使用 `error.code`。JavaScript 可以抛出任何值，第三方代码也不一定抛出 `Error` 实例。开启严格检查后，不能把所有捕获值都当成带有 `code` 与 `message` 的对象。新增 `src/errors.ts`，把取信息的条件集中到两处：

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

其余环境变量解析与返回分支沿用第三章。注意 `Number.isInteger()` 返回布尔值，但不是 TypeScript 的类型谓词；先检查 `typeof`，才能同时建立运行时与静态检查所需的依据。默认文件仍必须有效，`PORT` 不会绕过它。

### 三条不同的判断路径

现在可以把「TypeScript 能运行」拆开。类型检查在执行前分析代码约定；转译把 TypeScript 转成 JavaScript；运行时真正执行程序并处理当前输入。检查不会执行所有请求路径，转译不等于检查，启动成功也不等于每种输入都正确。

本章用 `tsc --noEmit` 单独检查，用 `tsx` 快速执行开发源码，用 `tsc` 生成 JavaScript 后交给 Node 运行。tsx 的执行路径不承担完整类型检查，因此开发服务能启动时，仍然需要独立运行检查命令。

也不要把「Node 只能执行 `.js`」当成解释。这里固定的 Node 24 已支持擦除一部分 TypeScript 类型语法，简单的 `.ts` 文件可以直接运行，但这个过程不检查类型，也不按 `tsconfig.json` 做项目转换。当前服务采用 `.js` 导入与编译产物对齐，直接 `node src/server.ts` 并不会因此自动把所有 `.js` 导入改指向 `.ts` 源码。选择入口时，必须同时考虑语法和模块解析。

## 5.2 CommonJS、ESM 与模块解析的实际报错

### Node 在加载文件前就需要知道规则

第三章使用 `import.meta.url`，已经走在 ESM 路线上。继续保留根目录 `package.json` 的 `"type": "module"`。在这个包作用域下，普通 `.js` 文件按 ESM 解释；`.mjs` 明确表示 ESM，`.cjs` 明确表示 CommonJS，能覆盖默认分类。对于本章的 `.ts` 文件，检查与开发工具也要使用与最终输出相符的模块规则。

CommonJS 常见的导出是 `module.exports = value`，加载是 `require()`；ESM 使用 `import`／`export`，有独立的模块解析与加载规则。把文件里的关键字换一下并不代表完成了迁移，因为文件分类、解析方式与调用方如何取得导出都可能变化。

例如，在本项目的 `.js` 文件里直接使用裸 `require()`，会遇到 `require is not defined in ES module scope`。这说明文件按 ESM 执行，不能据此得出依赖没有安装。反过来，把使用 `import.meta` 的源码硬改为 CommonJS 输出，也会与原有路径代码冲突。当前选择保持 ESM，避免同时改变路径模型和模块系统。

新版本 Node 对两种系统提供了多种互操作能力，不能再用「require 永远无法加载任何 ESM」这样的绝对结论推断。互操作有同步性、顶层 await 与导出形状等约束。本章需要的是从 ESM 使用一个简单的 CommonJS 导出，完整的双格式包设计留到共享契约阶段。

### 相同的导入文本会经过不同解析者

服务源码里的导入继续写：

```typescript
import { loadConfig } from './config.js';
```

这条路径相对于当前模块，不相对于 shell 的工作目录。类型检查时，TypeScript 在 NodeNext 规则下会进行扩展名替换，找到用于检查的 `config.ts`；输出时保留 `./config.js`；Node 执行产物时，旁边确实存在 `config.js`。三个阶段协作，才让同一行导入成立。

| 阶段 | 当前文件 | 需要找到的文件 |
| --- | --- | --- |
| 类型检查 | `src/server.ts` | `src/config.ts`，用于检查导出与类型 |
| tsx 开发运行 | `src/server.ts` | 工具解析到 TypeScript 源文件 |
| Node 产物运行 | `dist/src/server.js` | `dist/src/config.js`，按 ESM 加载 |

如果改成 `./config`，某些开发工具仍然能猜到文件，但原生 Node ESM 不替相对导入自动补齐 `.js`，也不自动尝试目录里的 `index.js`。输出保留这个缺少扩展名的路径，就可能出现 `ERR_MODULE_NOT_FOUND` 或目录导入错误。NodeNext 检查的一个价值，是把这类与目标运行时不一致的写法尽量提前指出。

另一条可行路线是源码写 `.ts`，配合支持的配置重写相对扩展名，或者直接按原生 TypeScript 的约束运行。它有自己的适用条件。本章选择输出扩展名写法，是为了保持一条清楚的 ESM 产物运行路径；不要同时混用几套导入习惯，再期待工具替自己猜测。

### 包名、包入口与文件路径不是一回事

`node:http` 指向 Node 内置能力，不需要安装 npm 包。`./config.js` 是相对文件路径。`some-package` 这样的裸标识符则通常进入包解析：Node 从导入者所在位置沿目录寻找相应的 `node_modules`，再依据包的入口声明确定加载哪个文件。不是任意 cwd 下都靠同一个全局目录解析。

包可以用 `main` 提供传统入口，也可以用 `exports` 明确允许的入口和子路径。存在适用的 `exports` 时，包入口解析受它约束。某文件在安装目录里，并不意味着调用方可以用包子路径访问它。

例如，一个包只导出 `".": "./entry.js"`，`import '包名'` 可以成功，`import '包名/internal.js'` 却可能得到 `ERR_PACKAGE_PATH_NOT_EXPORTED`。这与「文件不存在」不同；解决方式应当是使用公开入口，或者由包作者正式增加入口，而不是不断试文件扩展名。`exports` 管理公开接口，也不是保护敏感文件的安全沙箱，知道绝对文件位置仍可能通过文件路径访问。

定位模块问题时，可以顺着错误发生的阶段判断：检查器报找不到类型，先核对检查配置与声明；Node 报模块不存在，核对产物中的实际导入和文件；包子路径未导出，核对公开入口；模块已加载却没有指定导出，核对导出形状。不要一看到导入错误就删除锁文件重装，那个动作无法修复错误的路径语义。

## 5.3 建立开发、检查与构建命令

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

### 让非代码文件进入同一份产物

第三章的配置读取仍是：

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

在 `.gitignore` 追加 `dist/`，让可重新生成的文件不进入源码历史。然后把 `package.json` 的 `scripts` 替换为：

```json
{
  "dev": "node scripts/dev.mjs",
  "typecheck": "tsc --noEmit",
  "clean": "node scripts/clean.mjs",
  "build": "npm run clean && tsc && node scripts/copy-assets.mjs",
  "start": "node --enable-source-maps dist/src/server.js",
  "debug": "node --enable-source-maps --inspect-brk=127.0.0.1:9229 dist/src/server.js"
}
```

这是 `scripts` 对象的内容，保留外层原有的包名、`type`、版本约束和刚安装的开发依赖。`&&` 保证前一步失败后不继续：类型错误不会继续复制配置，复制失败会使构建整体失败。清理之后的一次失败可能留下不完整产物，因此运行与交付都必须以整条构建命令成功为前提。

这里的 `start` 不偷偷重新构建。它只运行现有产物，因而可以在没有 TypeScript 工具的目录里执行。`debug` 同样调试构建结果；改了源码后先重建，避免断点面对旧代码。`sourceMap` 生成位置映射，`--enable-source-maps` 让错误栈尽可能映射回源码位置。映射不是 TypeScript 执行器，也不替代实际源码；本机调试时保留源码，分享映射文件前同样检查其中的信息。

### 保存以后，怎样让正在运行的代码一起更新

学习时默认执行 `npm run dev`，同时获得自动编译、重启和本机断点调试。tsx 可用于快速运行单文件，前面的类型断言实验仍使用它；主服务采用同一份 tsconfig 的 TypeScript watch 编译，便于把开发和生产的编译语义保持一致。以后加入装饰器元数据也继续走这条路径。Nest CLI 等工具也能组织开发监听；这里沿用当前单包和资源布局，用一个小启动脚本接上编译结果，不增加另一套构建配置。

仅执行 `tsc --watch` 还不完整：它负责生成 JavaScript，却不会确保服务重启；只监听 dist 也可能在一轮编译尚未全部完成时提前启动。我们需要在完整编译成功后，停止旧进程、等待它退出、复制配置，再启动新进程。编译失败时也停止旧服务，避免拿旧响应判断刚写的代码。

新增 `scripts/dev.mjs`：

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
    mkdirSync('dist/config', { recursive: true });
    copyFileSync('config/service.json', 'dist/config/service.json');
    const current = spawn(process.execPath, ['--inspect=127.0.0.1:9229', '--enable-source-maps', 'dist/src/server.js'], {
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
  'tsconfig.json', { noEmitOnError: true }, ts.sys,
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

服务子进程使用 `--inspect=127.0.0.1:9229`，连接调试器前也会正常运行；需要观察启动第一行时才改用既有的 `npm run debug`。VS Code 的连接与重连在本章支线 5B 展开。sourceMap 仍将产物位置映射回 src。修改依赖、package.json、开发脚本或环境变量后，手动停止并重新运行 dev；这些不属于当前源码监听范围。

运行 dev 后，把启动日志改一个词并保存；等待重启完成，重发请求核对。再故意制造一个类型错误，观察旧服务停止；修复并保存后应恢复。不要在 dev 运行中另行执行 clean/build，它们会争用同一个 dist；检查生产产物前先停止开发进程。

| 场景 | 命令与结果 |
| --- | --- |
| 默认学习与接口联调 | `npm run dev`：自动编译/重启，Inspector 仅监听本机 |
| 单独检查类型 | `npm run typecheck`：不启动服务 |
| 生产构建 | `npm ci` 后 `npm run build`：清理、编译、复制配置 |
| 生产运行目录 | 按 5.4 复制产物与清单，`npm ci --omit=dev` 后 `npm start`，不监听源码、不开调试端口 |
| 启动阶段断点 | 先停止 dev，`npm run build` 后 `npm run debug`；连接后继续 |

生产环境的变量由部署目标提供。`NODE_ENV=production` 只是程序可读取的环境值，不会自动替你构建、复制配置或删除命令里的 inspect 参数。这个阶段提供完整的生产构建和运行入口；服务托管、HTTPS、更新和回退在部署篇接上。

TypeScript watch 的接口可查阅[官方 Compiler API 示例](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API#writing-an-incremental-program-watcher)，本项目按锁定的 TypeScript 5.9.3 使用。

### 分别运行，观察责任没有混在一起

先执行：

```bash
npm run typecheck
npm run build
npm start
```

检查成功应以退出码 `0` 为依据，不要求工具一定打印「成功」。构建后应有三个业务模块的 `.js` 和 `.js.map`，以及 `dist/config/service.json`。启动后继续用第二章的请求确认新增、列表和详情，错误输入仍然返回 `400`，不能因迁移类型而接受数字原文。

停止服务以后，再执行 `npm run dev`。这是另一个进程，原来的 Map 不会被搬进来。watch 模式监测代码变化并重启程序，因此修改源码触发重启后，内存记录也会消失；这不是 TypeScript 把记录删除了。不要同时让开发服务与产物服务使用默认端口，否则会得到前文已经解释过的端口占用错误。

先停止 dev，再运行开头的错误示例：

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

## 5.4 锁文件、依赖与一份能够搬走的程序

### 安装的是工具，还是服务运行时要调用的实现

本章三个直接依赖都属于 `devDependencies`：TypeScript 负责检查与编译，tsx 负责开发运行，`@types/node` 提供声明。生成的业务 JavaScript 没有导入这些包，普通 Node 运行产物时不需要它们。

这个分类依据是「产物是否需要」，不是「代码是不是写在 src 里」。以后服务运行时导入框架、数据库客户端或校验库，那些实现就必须作为运行依赖到达目标环境；即使本机开发时同样用它们，也不能因此全部放进 `devDependencies`。反过来，`import type` 引入且被擦除的声明不构成运行时加载。

`package.json` 表达直接依赖与版本约束，锁文件记录本次解析的具体依赖树及获取信息。固定三个直接版本还不够，因为工具自己的依赖也有版本选择，平台相关可选包也可能不同。应把清单与锁文件一起保存，使用 `npm ci` 根据锁文件建立安装结果。

`npm ci` 会在已有 `node_modules` 时先移除它，并要求清单与锁文件相容；遇到冲突不会替你悄悄更新锁文件。只有明确增加、删除或升级依赖时才通过 `npm install` 等命令更新，并检查变化。锁文件不是运行环境的全集：Node 版本、系统平台、原生组件和启动配置仍需另外控制，因此第二章的 `.nvmrc` 与安装版本检查继续保留。

### 把构建与运行分开，才能真正检查缺了什么

只在项目根目录运行，有时会掩盖交付问题：某个资源从源码目录被碰巧找到，某个包从父目录的 `node_modules` 被解析到，或者启动脚本其实重新调用了开发工具。要减少这些偶然条件，就把产物放到独立目录，暂时不给它 `src/`、开发工具和原始 `config/`。

先停止开发服务，重新构建。下面只复制本次需要的文件到新建的临时目录：

```bash
npm run build &&
release_dir=$(mktemp -d) &&
cp package.json package-lock.json .npmrc .nvmrc "$release_dir/" &&
cp -R dist "$release_dir/dist" &&
(
  cd "$release_dir" &&
  npm ci --omit=dev &&
  npm start
)
```

这里把各步用 `&&` 串起来，构建、复制或安装失败就不继续启动。这不是部署到公网，而是一次本机交付核对。记录下当前 shell 中的 `release_dir`，结束后可删除自己创建的目录。不要用一个现存业务目录代替它。

`--omit=dev` 不把开发依赖安装到运行目录，锁文件里仍然保留依赖信息；本章没有第三方运行依赖，所以业务入口只使用 Node 内置模块和自己的 JavaScript。`package.json` 还保留开发脚本不影响 `start`，但这个目录没有源码和构建脚本，不能在这里重新构建。若以后增加安装生命周期脚本，还要重新检查它是否暗中依赖被省略的工具。

同样，不能先在构建目录执行 `npm ci --omit=dev`，然后期待 `tsc` 仍能工作。构建阶段需要完整开发工具，运行阶段才根据产物省略不需要的依赖。把这两个阶段区分开，也为后面的部署与构建缓存建立基础。

在另一个终端再次创建记录、读取列表与详情，并提交 `{"originalText":42}`，观察成功数据与错误响应。随后停止进程，重新运行，确认列表为空。这里同时检查两件不同的事：产物确实完整，以及它依然保持内存服务的状态寿命。

第三章还要求程序不依赖调用者 cwd，因此再停止服务，在原 shell 中运行：

```bash
(
  cd /
  PORT=3001 node --enable-source-maps "$release_dir/dist/src/server.js"
)
```

把请求地址相应改为 `3001`。入口用了绝对路径，配置仍按模块相对位置读取，这才是跨 cwd 成立的原因；`npm start` 会在包目录执行脚本，单用它不能证明任意 cwd 都成立。

还可以在停止后，把临时副本里的 `dist/config/service.json` 改名为 `service.json.saved`，再次启动，观察配置读取失败与非零退出码，再恢复文件。不要修改源码项目来做这一步。程序可以导入所有 JavaScript，却仍因非代码资源缺失而无法启动；这说明可交付单元比一个入口文件更大。

本章完整的运行单元包括：规定的 Node 环境、`package.json` 的模块信息、产物 JavaScript 与位置映射、默认配置，以及按锁文件准备的运行依赖。这里保留映射便于定位；若需要在独立目录中查看 TypeScript 源文，还需单独提供与映射匹配的源码。秘密配置不由构建快照提供，后面的配置与部署章节会在出现相应依赖时继续展开。

### 第一篇在这里接上下一阶段

现在我们能从源码走到一个独立目录里的记录服务，解释输入为什么要检查、模块为什么能找到、配置为什么要复制，以及重启为何会丢失记录。程序的结构仍然简单：路由、校验、业务操作与内存存储集中在同一个入口里。这个结构适合看清运行机制，接下来功能变多时，就需要更明确的职责边界。

第二篇将沿用这三个接口迁入 Nest，观察框架怎样组织已经写过的职责，而不是另起一个互不相干的示例。数据库仍在第三篇接入。按顺序读完第 1～5 章后，进入第二篇前，再完成[第 6 章：第一篇回顾](../chapter-06-review/chapter.md)，用改变后的运行条件核对这五章建立的判断方法。

## 相关知识支线

- [支线 5A：模块找到之后，拿到的到底是什么](side-01-module-boundaries.md)：用独立的 CommonJS／ESM 与包自引用示例，区分模块分类、文件解析、公开入口和导出值；改变导入方式后解释错误与修复。

- [支线 5B：从“接口不对”到找到出错的那一步](side-02-debugging-workbench.md)：建立 VS Code／Chrome 调试入口，使用调用栈、条件断点、日志点和异常暂停，区分请求未到达与源码映射失效。

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

本章完成状态：代码分支 `part-01/chapter-05`。记录接口与字段沿用前文，新增类型边界、开发命令和独立构建产物。

[上一章：事件循环如何影响服务的响应能力](../chapter-04-event-loop/chapter.md) · [下一章：第一篇回顾](../chapter-06-review/chapter.md) · [返回第一篇](../README.md) · [返回全书目录](../../README.md)
