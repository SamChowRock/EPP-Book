# 第 2 章 先启动一个最小记录服务

上一章把一条表达从输入、修订一直推演到了采纳和练习。这一章回到项目的起点：收到一条英语原文，把它保存下来，再通过列表和详情接口读回来。

我们从空目录建立一个 Node.js 项目，使用内置的 HTTP 模块接收请求。暂时把数据放在进程内存里，不安装 Web 框架，不连接数据库，也不调用模型。这样，一次请求经过的路由判断、输入检查、数据写入和响应发送，都能在同一份代码中找到。后面迁入 Nest、替换存储时，也有明确的行为可以对照。

这一章沿着“客户端提交的对象怎样变成服务中的一条记录”展开。我们要弄清：HTTP 模块交给程序的是什么，何时才能开始写入，以及为什么一次请求结束后，下一次请求还能读取它。每一层的完成条件不同，把它们分清，才能判断一个报错发生在哪里，也能知道需求改变时应该调整哪一层。

**代码起点**：空项目。这是全书第一份实践代码，尚无前置章节代码。

## 2.1 先确定三个接口和一条记录

### 原文先原样留下来

继续使用上一章的例子：

> I'm not much of cook.

这句话少了冠词，但保存接口此时不负责纠正它。它的职责是接收用户提交的内容，并保留后续整理的起点。因此，接口返回的原文应当与输入一致，不能在保存时偷偷换成润色后的结果。

一条记录先有三个字段：

```json
{
  "id": "服务端生成的唯一标识",
  "originalText": "I'm not much of cook.",
  "createdAt": "2026-10-28T06:00:00.000Z"
}
```

为什么只有原文还不够？因为下一次查看详情时，我们需要指明是哪一次记录。同一句话可以提交两次，原文相同并不代表两次记录相同；把原文当成键会让第二次写入覆盖第一次。我们因此给记录分配独立 ID。当前使用 UUID，方便直接生成标识；递增整数也能标识记录，但需要另外维护分配状态。选 UUID 并没有解决重复提交，它只让两条记录各有身份。

`createdAt` 则回答创建发生在什么时候。它不能兼任 ID，因为多条记录可能在同一时间精度内创建；也不直接接收客户端传来的时钟值，否则不同设备的时钟差异会混入这份服务的记录。我们用服务端时间生成带时区含义的 ISO 字符串，示例中的 `Z` 表示 UTC，之后再由客户端转换显示。时间、标识和内容分别承担不同职责。

中文意图、修订和候选都先不加入。当前保存的是一条只有原文的简化记录，并不表示第一章讨论的完整业务已经实现。第三篇接入数据库时会补上中文意图，并说明已有记录如何进入新结构；修订会在对应章节继续建立。

输入先只接收 `originalText`。由此可以分清两件事：调用方提交一份材料，服务接受这份材料后创建一条记录。即使调用方额外提交 `id` 或 `createdAt`，也不会据此决定新记录的身份和创建时间。这个区别随后会直接决定我们怎样从请求体构造保存对象。

### 先让行为有一致的约定

三个接口约定如下：

| 操作 | 方法与路径 | 成功结果 |
| --- | --- | --- |
| 新增原文 | `POST /captures` | `201`，返回新记录；`Location` 指向详情路径 |
| 读取列表 | `GET /captures` | `200`，返回 `{ "items": [...] }` |
| 读取详情 | `GET /captures/:id` | `200`，返回指定记录；不存在时返回 `404` |

路径使用 `captures`，承接上一章的记录概念。现在还没有修订表，也没有额外的“正式表达”集合。

列表从 `{ "items": [] }` 开始，按本进程中的插入顺序返回。暂时不增加分页和筛选；以后要增加总数或游标时，可以在列表对象上扩充字段。详情直接返回一条记录。

空字符串和全空白内容无法形成当前要记录的表达，需要在写入前拒绝。本章先把原文上限定为 2000 个 JavaScript 字符串代码单元，把整个请求体上限定为 16 KiB。它们是两种不同的限制，下一节从实际接收过程说明为什么只检查其中一种还不够。这里的字符串长度沿用 `.length`，例如某些 emoji 占两个代码单元，不能把它当成严格的可见字符计数。

这一版没有去重。同样的原文提交两次，会得到两个不同的 ID；网络重试也可能重复创建。后续讨论幂等时，我们会在已经存在的创建行为上处理这件事。

## 2.2 用原生 Node.js 把服务写出来

### 用 nvm 固定运行版本

同一份项目如果在不同 Node 版本下运行，报错和工具行为可能不同。我们先用 [nvm](https://github.com/nvm-sh/nvm) 管理 Node，并把本章使用的版本固定为 **24.22.1**。这是一个明确的项目版本约定，后续升级时再一起更新配置与操作说明。

以下使用 macOS、Linux 的 Bash 或 Zsh；Windows 读者在 WSL 中执行。本节的 nvm 指 `nvm-sh/nvm`，原生 Windows 的 `nvm-windows` 是另一个项目，不套用这里的安装和 `.nvmrc` 用法。后面的 curl 命令也沿用这一套 shell 引用与续行方式。

先检查当前终端是否已经加载 nvm：

```bash
command -v nvm
```

有输出 `nvm` 就继续下一步。尚未安装时，按 [nvm 官方说明](https://github.com/nvm-sh/nvm#installing-and-updating) 安装，这里固定安装脚本版本为 `v0.40.8`：

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh -o /tmp/nvm-install.sh
bash /tmp/nvm-install.sh
```

安装后重新打开终端，再执行 `command -v nvm`。如果之前安装过却没有输出，先按官方说明检查当前 shell 的启动配置是否加载 `nvm.sh`。nvm 是 shell 函数，不用 `which nvm` 判断是否安装成功。

现在创建实践项目：

```bash
mkdir epp-book-code
cd epp-book-code
mkdir src
```

在项目根目录新建 `.nvmrc`，完整内容只有一行版本号，文件末尾保留换行：

```text
24.22.1
```

然后在同一个目录执行：

```bash
nvm install
nvm use
node --version
npm --version
```

不带版本参数的 `nvm install` 会读取 `.nvmrc`，安装所需版本并切换；已安装时可直接复用。`nvm use` 则选择这个项目约定的版本，`node --version` 应输出 **`v24.22.1`**。npm 使用该 Node 版本随附的版本，不需要另行全局安装。

`.nvmrc` 不会单凭你进入目录就自动改变 Node。每次新开终端后，进入项目先执行 `nvm use`，再运行 npm 命令；已有 Node 安装也按这一步核对，避免实际上仍调用了另一份程序。找不到 `node` 时，先处理 nvm 的加载与版本切换，不要跳到服务代码排错。

接下来的文件路径都相对于这个项目根目录。用编辑器新建 `package.json`，完整内容如下：

```json
{
  "name": "epp-book-code",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "engines": {
    "node": "24.22.1"
  },
  "scripts": {
    "dev": "node --watch --inspect=127.0.0.1:9229 src/server.js",
    "start": "node src/server.js",
    "debug": "node --inspect-brk=127.0.0.1:9229 src/server.js"
  }
}
```

`dev` 是学习时默认的启动入口，监听源码并开启本机调试；`start` 是不带监听与调试的生产运行入口，`debug` 用于需要在启动前暂停的专项排查。`private` 防止这个练习项目被误发布到 npm；`engines.node` 与 `.nvmrc` 保持同一个精确版本。

`engines` 默认只表达版本要求。再在项目根目录新建 `.npmrc`，让 npm 在安装时检查并拒绝不匹配的 Node 版本：

```ini
engine-strict=true
```

这两份配置各有作用：`.nvmrc` 供 nvm 选择版本，`engines` 配合 `.npmrc` 检查安装环境。它们都不会代替终端执行 `nvm use`；遇到 `EBADENGINE`，先切换到项目版本再重试。`.nvmrc`、`.npmrc` 都与项目一起保留。

`type: "module"` 让项目内的 `.js` 文件按 ESM 处理，因此下面可以直接写 `import`。这里先保持一种模块格式；第五章会通过实际运行和报错，展开模块解析与 TypeScript 构建。

现在运行：

```bash
npm install
```

这一步会生成 `package-lock.json`。本章没有第三方依赖，依赖清单里也就没有 `dependencies` 或 `devDependencies`；不需要安装一个名为 `http` 的包，代码要使用的是 Node 内置的 `node:http`。没有第三方包时，不出现 `node_modules` 目录也是正常的。

保留 `package.json` 和锁文件，它们共同描述项目依赖。拿到已经带锁文件的项目时，可以用 `npm ci` 安装并核对清单；第五章再解释它与 `npm install` 的区别。此刻不要为了让命令输出更“像一个项目”，额外安装框架或工具。

如果使用 Git，再新建 `.gitignore`：

```gitignore
node_modules/
.env
.env.*
!.env.example
*.log
.DS_Store
```

本章还没有环境变量文件；这几条先把常见的本机产物与配置值排除掉，锁文件则应保留。

### Node 收到请求时，究竟把什么交给我们

现在可以处理“接收一条原文”了。先从我们熟悉的调用方式反推服务端需要完成的工作：浏览器把一个对象用 `JSON.stringify` 变成文本，放进 HTTP 请求体；服务端收到这段文本，还要把它解析回来，才能读取 `originalText`。

这里容易跨过两步：**收到请求，不等于请求体已经全部到齐；收到请求体，也不等于拿到了一个符合业务要求的对象。** 原生 HTTP 模块只处理 HTTP 层的收发，没有替我们完成 JSON 解析与字段校验。后面出现的读取函数和检查代码，正是为了补上这两步。

为什么 HTTP 模块不等请求体全部收到再调用我们？因为服务可以只根据方法和路径处理 GET，也可以在看到不支持的内容类型时拒绝请求；如果请求体是一个很大的上传文件，还可以边接收边处理。强制先把所有请求体装进内存，会把这些选择都拿走。Node 因此在请求头解析完成后提供请求对象，请求体通过它后续的可读流事件交付。

`createServer` 接收的回调有两个参数。`request` 包含已经解析的方法、地址和头部，同时提供读取请求体的入口；`response` 用于组织要发回去的状态、头部与响应体。每次请求都有自己的一对对象，而服务进程会继续接收下一次请求。

因此，下面这段**只用于说明问题的代码，不加入项目**，无法让客户端收到列表：

```javascript
createServer(() => {
  return { items: [] };
});
```

回调返回值只回到了调用它的 JavaScript 代码，HTTP 模块并没有约定把这个返回值序列化并发送。我们必须通过 `response` 明确完成输出。以后框架可以提供“返回对象即生成响应”的约定，但原生接口没有这层转换。明白这一点，再看框架时才知道它多承担了哪项工作。

### 两次请求之间，谁保留那条记录

保存请求结束后，还会有一个独立的列表请求。假如把记录放在保存函数内部的一个局部数组里，下次调用就会重新创建数组；即使创建接口返回成功，列表也读不到刚才的内容。**数据的存活时间必须长于一次请求。**

所以我们先让服务进程持有一份集合，所有请求处理函数都访问它。数组同样能做到这一点；这里选 `Map`，是因为详情接口要按 ID 查找，用 `set(id, record)` 与 `get(id)` 能直接表达这个关系。选 Map 并没有同时获得磁盘保存、跨进程共享或查询语言，这几项能力要分别解决。

另一个需要统一的是响应。列表、详情、创建和错误都要发送 JSON，如果每个分支各写一套头部与序列化，很容易出现一个分支返回 JSON，另一个却把对象当成文本处理。先把相同的 HTTP 输出步骤收在一个小函数里，让各分支只决定“状态码是什么，内容是什么”。

新建 `src/server.js`，先放入下面这段。后面标明“追加”的代码按顺序接到同一个文件中，完成整个文件后再启动。

```javascript
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const host = '127.0.0.1';
const port = 3000;
const captures = new Map();
const maxBodyBytes = 16 * 1024;

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, data, headers = {}) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    ...headers,
  });
  response.end(JSON.stringify(data));
}
```

文件顶层的 `captures` 在本次启动时创建一次，之后的请求共享它。`HttpError` 则让我们区分可以向调用方解释的输入错误与程序意外错误：缺少原文可以明确返回 `400`，内部代码出错则不能假装成同一种输入问题。类里暂时只有状态码，没有建立额外的错误体系。

`sendJson` 中的两步也不能合并理解。`JSON.stringify` 将对象转换成 JSON 文本，`Content-Type` 声明响应内容应按什么格式理解；只写响应头，不会把对象自动变成 JSON。`writeHead` 确定响应的状态与头部，`end` 完成本次响应的应用层写入。

这里结束的是**这一次响应**，服务仍然运行，底层连接也可能被复用。另一个容易混淆的边界是 JavaScript 控制流：调用 `response.end()` 不会替处理函数执行 `return`。如果一个分支发完 `200` 还继续走到末尾的 `404`，就会尝试给同一次请求发送第二份响应。因此，后面的每个完成分支都显式返回。

### 为什么拿到第一块数据时还不能解析 JSON

假设客户端发送：

```json
{"originalText":"I'm not much of cook."}
```

从应用角度看，这是一份 JSON；从接收过程看，它可能先交付 `{"originalText":"I'm not `，稍后才交付剩余部分。每次 `data` 的边界由实际传输与流缓冲等条件共同决定，与对象、属性和句子的边界没有对应关系。

如果在每个 `data` 回调中调用 `JSON.parse(chunk)`，第一块只是未完成的字符串，就会被当成语法错误。即使在自己电脑上某次恰好只收到一块，也不能据此建立“一个事件就是一个完整请求体”的假设。我们要等待 `end`：它表示这次请求体已经读取结束，才有依据判断完整 JSON 是否能解析。

接着还有编码问题。默认的块是 Buffer，保存字节。例如汉字“我”在 UTF-8 中占三个字节 `E6 88 91`，数据块却可能在这三个字节中间断开。对每块单独调用 `toString('utf8')`，解码器看见不完整字节时可能产生替代字符；后面把字符串拼起来，也找不回已经被替换的内容。

我们采用“先保存 Buffer，全部到齐后合并，再统一解码”。另一条可行路径是让流的文本解码器保留跨块状态，但本章还要按传入字节计量，直接保留 Buffer 更容易把编码与大小限制一起说明。这里的选择来自需要观察的行为，并不是要求所有 Node 服务都用同一种读取写法。

合并只能修正分块边界，不能保证字节本身是合法 UTF-8。例如客户端按错误编码发送文件时，完整请求中仍可能包含非法字节。`Buffer.toString('utf8')` 会把它们替换成 `�`，之后 JSON 仍可能解析成功，服务便把损坏后的文字当作原文保存。为兑现保留原文的约定，我们使用 Node 提供的全局 `TextDecoder`，设置 `fatal: true`：解码失败就抛错，与 JSON 语法错误一起在写入前拒绝。合法 UTF-8 编码的 `�` 本身仍是允许保存的字符，不能靠搜索这个字符判断输入损坏。

### 为什么已经限制原文长度，还要限制请求体

如果只在解析后检查 `originalText.length`，为执行这行检查，我们已经把请求体完整放进内存了。调用方甚至可以提交一条很短的原文，同时附带一个很大的无关字段；原文检查通过，接收成本却已经付出。

因此需要两处限制：接收时限制整份请求的字节量，解析后限制业务字段的长度。前者保护本次收集请求体的内存占用，后者表达当前只接受短文本的业务约定。16 KiB 和 2000 个代码单元都是这个小服务的取值，不是 HTTP 或 Node 规定的标准；需求改成长文章时，要重新考虑两处限制及读取方式。

现在给读取过程定义一个明确结果：在 `end` 后得到一个成功解析的 JSON 值，或者因为超限、读取失败、JSON 损坏而失败。用 Promise 表达这个完成条件，路由便可以等待结果，而不必自己嵌入每一个流事件。

在 `src/server.js` 末尾追加：

```javascript
function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    let tooLarge = false;

    request.on('data', (chunk) => {
      if (tooLarge) return;
      bytes += chunk.length;
      if (bytes > maxBodyBytes) {
        tooLarge = true;
        chunks.length = 0;
        reject(new HttpError(413, 'Request body is too large'));
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      if (tooLarge) return;
      try {
        const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
          .decode(Buffer.concat(chunks));
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'Request body must be valid UTF-8 JSON'));
      }
    });

    request.on('error', () => {
      reject(new HttpError(400, 'Request body could not be read'));
    });
  });
}
```

沿着一份正常请求走一次：每个 `data` 累加字节数，把 Buffer 放进 `chunks`；`end` 将所有块按原顺序合并、解码，再调用 `JSON.parse`；成功值交给等待它的路由。这个值此时仍可能是 `null` 或数组，读取函数只承诺 JSON 解析完成。

`ignoreBOM: true` 也表达了输入选择。BOM 是可能出现在文本开头的字节顺序标记；这个选项让解码器保留它，不自动移除。若请求体以 UTF-8 BOM 开头，后面的 `JSON.parse` 会拒绝它，延续本章直接解析 JSON 文本的边界。这里选择不接受带 BOM 的请求，而不是引入另一次隐式文字修正；将来若要兼容此类文件，应明确改变接收约定。

再沿着超限请求走一次：超过限制的那一块不再保存，已有块引用从数组中清除，Promise 被拒绝。**拒绝 Promise 并不会自动撤销已经注册的事件监听，也不会让网络输入停止。** 所以还需要 `tooLarge`：后续 `data` 不再收集，后来到达的 `end` 也不再尝试解析截断内容。这个标记控制读取状态，`reject` 通知等待结果的调用方，两者承担不同职责。

解析的 `try/catch` 必须位于 `end` 回调里。注册事件时的函数调用已经结束了，稍后事件执行中的异常不会被包在注册代码外面的一个同步 `try/catch` 自动接住。我们在异常实际发生的位置将它转换为 Promise 拒绝，再交给外层统一回应。

为什么不在超限时直接 `request.destroy()`？因为它可能把承载响应的连接也销毁，调用方只看到连接断开，来不及收到 `413`。本章选择先通过响应出口说明失败，再关闭连接。它只限制了这份缓冲请求体的处理；文件上传、压缩内容和更完整的流量控制仍需要另外的设计。

### 在改变数据之前，必须先确定哪些事

接下来轮到路由把读取结果变成一条记录。先不看代码，沿创建操作排列依赖：只有确定路径和方法对应创建，才需要读入原文；只有输入通过检查，才允许改变集合；只有写入发生后，才有理由返回创建成功。

校验还要分清三件事。`Content-Type: application/json` 是调用方对格式的声明，不能证明内容合法；`JSON.parse` 成功证明文本可以表示一个 JSON 值，不能证明它有 `originalText`；最后的对象、类型、非空白与长度检查，才说明它符合本次创建要求。把这几步压成“拿到 body 就存”，任何一层的失败都会混进正式记录里。

例如 `null` 是合法 JSON，而 `typeof null` 又等于 `'object'`，因此必须单独拒绝；数组也需要排除。`trim()` 只用于判断全空白输入，实际保存仍使用原始字符串。否则，接口一边说保留用户输入，一边在保存时改变内容，业务承诺和实现就发生了偏离。

同样，服务端只从 body 中取 `originalText`，自己生成 ID 和创建时间。直接保存整个 body，意味着调用方可以随意决定当前集合里记录的形状，甚至选择一个已有 ID；明确构造对象，才把“用户提供的材料”和“服务创建的身份”分开。

输入通过之后，剩下的顺序是构造对象、写入 Map、发送 `201`。如果先回应再写入，中间写入失败，客户端已经拿到一份无法兑现的成功。当前代码中，写入与发送之间没有 `await`；后面替换成异步数据库访问时，这一顺序仍然要保持。至于写入后响应丢失，本章还没有重试去重能力，不能靠调换这两行来解决。

列表和详情则读取同一个 Map。路由使用“方法 + 路径”判断操作：同一个 `/captures`，GET 是读取，POST 是创建。`request.url` 还可能含查询字符串，用 `URL` 取 `pathname`，才能让 `/captures?source=demo` 仍匹配列表路径。这里的基准地址供相对 URL 解析使用，构造 URL 不会发起网络访问。

在 `src/server.js` 末尾追加完整的处理函数：

```javascript
async function handleRequest(request, response) {
  let pathname;
  try {
    ({ pathname } = new URL(request.url, 'http://127.0.0.1'));
  } catch {
    throw new HttpError(400, 'Request URL is invalid');
  }

  if (pathname === '/captures') {
    if (request.method === 'GET') {
      sendJson(response, 200, { items: [...captures.values()] });
      return;
    }

    if (request.method === 'POST') {
      const mediaType = request.headers['content-type']
        ?.split(';')[0].trim().toLowerCase();
      if (mediaType !== 'application/json') {
        throw new HttpError(415, 'Content-Type must be application/json');
      }

      const body = await readJson(request);
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'Request body must be a JSON object');
      }
      if (typeof body.originalText !== 'string' || !body.originalText.trim()) {
        throw new HttpError(400, 'originalText must be a non-empty string');
      }
      if (body.originalText.length > 2000) {
        throw new HttpError(400, 'originalText must be at most 2000 code units');
      }

      const capture = {
        id: randomUUID(),
        originalText: body.originalText,
        createdAt: new Date().toISOString(),
      };
      captures.set(capture.id, capture);
      sendJson(response, 201, capture, {
        Location: `/captures/${capture.id}`,
      });
      return;
    }

    sendJson(response, 405, { error: 'Method not allowed' }, {
      Allow: 'GET, POST',
    });
    return;
  }

  const detailMatch = /^\/captures\/([^/]+)$/.exec(pathname);
  if (detailMatch) {
    if (request.method !== 'GET') {
      sendJson(response, 405, { error: 'Method not allowed' }, { Allow: 'GET' });
      return;
    }
    const capture = captures.get(detailMatch[1]);
    if (!capture) throw new HttpError(404, 'Capture not found');
    sendJson(response, 200, capture);
    return;
  }

  throw new HttpError(404, 'Route not found');
}
```

现在可以解释每个错误分支为什么在那个位置。路径没有对应操作，返回 `404`；路径存在但方法不被接受，返回 `405` 与 `Allow`；详情路由匹配了，却找不到指定 ID，也返回 `404`，说明这次读取没有目标。它们不能一律返回 `200` 加错误文本，否则调用方必须猜测每个成功响应体的含义，HTTP 层也无法直接区分这些结果。

创建返回的 `Location` 指向刚写入的记录。它和返回体的 ID 一起，让客户端知道这次创建产生了哪个资源，之后可以直接访问它。列表使用对象包住 `items`，是为以后在同一响应上增加总数或游标留下位置；现在不提前实现这些能力。

对照写入行还能得到一个重要结论：本章所有输入检查都在 `captures.set` 之前。无效请求即使已经收到、读完或解析过，也还没有改变集合。接下来故意发送错误请求时，我们会同时检查响应与列表，用实际结果验证这条边界。

### 谁把一个异步错误变成 HTTP 响应

读取失败时，`readJson` 拒绝，`await` 使 `handleRequest` 返回的 Promise 也拒绝；字段检查抛出的 `HttpError` 同样进入这条路径。但 Promise 拒绝只是一种 JavaScript 执行结果，它不会自己决定该写哪个 HTTP 状态码、该把什么内容交给客户端。

因此，还需要在 HTTP 入口把这条错误路径接到 `response`。如果只写 `createServer(handleRequest)`，就把失败后的响应责任悬空了。我们显式调用 `handleRequest(...).catch(...)`，在这里区分可以说明的请求错误与未预期的内部错误。

在 `src/server.js` 末尾追加最后一段：

```javascript
const server = createServer((request, response) => {
  console.log(`${request.method} ${request.url}`);
  handleRequest(request, response).catch((error) => {
    if (response.destroyed || response.writableEnded) return;
    const statusCode = error instanceof HttpError ? error.statusCode : 500;
    if (statusCode === 500) console.error(error);
    sendJson(response, statusCode, {
      error: statusCode === 500 ? 'Internal server error' : error.message,
    }, { Connection: 'close' });
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Cannot listen on ${host}:${port}: address already in use`);
  } else {
    console.error(`Server failed: ${error.code ?? 'UNKNOWN'}`);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`EPP listening on http://${host}:${port}`);
});
```

`error instanceof HttpError` 对应我们主动定义的输入失败，保留它的状态码与说明。其他异常返回 `500`，详细原因留在终端中：客户端需要知道这次操作未正常完成，维护者需要足够信息定位代码错误，两者需要的内容不同。

有时客户端已经断开，读取失败仍会通知到 Promise。检查 `response.destroyed` 和 `writableEnded`，是为了在已经不能回应时停止再次写入；它不会撤回已经做过的业务操作。本章只发送完整的单次 JSON，后续若流式输出一半再出错，还需要单独考虑已发出的头部和数据。

错误出口的 `Connection: close` 也与读取方式有关。例如媒体类型不对时，请求体可能还没读；超限时我们决定不再使用剩余内容。本章统一在错误回应后关闭这条连接，避免继续在它上面处理下一次请求。正常响应则可以保留连接。关闭一个请求使用的连接与停止整个服务进程，是两个不同的动作。

还剩下启动失败。`listen` 要向操作系统申请监听一个地址和端口，申请失败时还没有当前业务请求，也就没有可返回 `400` 或 `500` 的响应对象。它走 `server` 的 `error` 事件，由单独的监听函数报告，并用非零退出码表达启动未成功。这解释了为什么一个请求层的 `.catch()` 不能包办所有错误。

服务监听本机回环地址 `127.0.0.1:3000`。`createServer` 先建立处理规则，`listen` 才开始申请接入请求；成功回调执行时才能宣布已经可接受连接。回到项目根目录运行默认开发命令：

```bash
npm run dev
```

监听成功后，应看到：

```text
EPP listening on http://127.0.0.1:3000
```

此时留着这个终端，在另一终端发送请求。`--watch` 监听入口和导入的源码，保存后重启服务；`--inspect` 开启本机 9229 调试入口但不暂停启动。修改后等新的监听日志出现，再次发请求；浏览器页面不会自动刷新，旧 Map 也不会被保留。配置、依赖和环境变量改变时，先停止再重新执行开发命令。接下来我们用请求、断点和重启分别观察输入处理、写入时刻与状态寿命。

### 开发和生产为什么使用两条命令

开发默认用 `npm run dev`，目的是让“修改保存”尽快成为下一次请求实际执行的代码，并允许停在断点检查变量。自动重启仍是销毁旧进程、启动新进程，不能保住当前内存数据，也不会替你重发 POST。

生产运行使用 `npm start`，当前是直接运行 JavaScript，所以没有构建步骤，也不需要开发执行器；它不监听文件、不开放 Inspector。更新生产代码需要有意地替换版本并重启，不能因为文件恰好保存就改变对外服务。后续引入 TypeScript 后，会增加明确的构建与配置复制步骤；长期托管、HTTPS 和恢复仍在部署篇建立。

现在可以保存一处启动日志文字，观察终端出现新进程的监听提示，再请求列表；此前的内存记录已消失。恢复日志再保存，重复请求确认自己连到新进程。这才完成一次修改生效的对照。不要一边运行 dev，一边用 start 再占同一个端口。

## 2.3 让请求结果变得可以观察

### 默认用 Postman 发请求，保存后反复调试

保持 `npm run dev` 运行，打开 [Postman 桌面客户端](https://www.postman.com/downloads/)。这里选择桌面客户端，让请求直接从本机发往本机服务；使用其他接口工具时，方法、地址、头部和正文仍是同一组输入。客户端负责发送请求、展示响应，进入源码观察变量则由 Chrome 或后续的 VS Code 调试器完成。

配套代码的 `requests/epp.postman_collection.json` 已保存本章用到的请求。在客户端选择 **Import** 并导入该文件，即可打开“EPP 本机接口调试”集合。第一次先按下面的操作查看各个输入位置；已有集合时直接使用其中对应的请求，不必重复新建。集合变量 baseUrl 是服务地址，captureId 用来填实际创建结果的 id。导入只建立请求配置，不会启动服务或自动执行请求。

先新建一个 HTTP 请求，方法选 GET，地址填 `http://127.0.0.1:3000/captures`，不填写 Body，点击 **Send**。在响应区查看状态应为 200，Body 为 `{"items":[]}`；切到响应 Headers 查看 Content-Type。请求头与响应头是两个方向，不要把服务返回的头误认为自己提交的配置。

再新建一个请求，方法选 POST，地址仍是 `http://127.0.0.1:3000/captures`。在 **Body → raw → JSON** 中填写：

```json
{"originalText":"I'm not much of cook."}
```

选择 JSON 后客户端会设置对应 Content-Type；在请求 Headers 核对它为 application/json，避免另有手工头把它覆盖成 text/plain。点击 Send，观察响应状态201、Body中的三个字段，以及响应 Headers 中的 Location。复制实际返回的 id，新建 GET `http://127.0.0.1:3000/captures/实际id`，发送后应读到刚才的记录。地址中的“实际id”要换成返回值。

若从空白请求开始，建立名为 EPP 的 Collection，把这三条请求分别保存为“创建原文”“查看列表”“查看详情”。复制创建请求，命名为“原文类型错误”，只将 originalText 的值改为数字42；Send后应为400。再点列表请求的Send，确认失败没有新增记录。使用导入集合时，可直接打开“04 原文类型错误”；详情请求中的 `{{captureId}}` 需要先在集合 Variables 中填入实际返回的 id。保存请求保留了输入，保存过的响应则只是那一次的结果；改代码后仍要再次点击Send，不能把旧结果当作当前结果。

后续改变查询条件时，在 Params 中填键和值，由客户端处理URL编码；禁用的参数行不会发出。更换端口时先修改请求地址，再发送。需要长期共用地址时，可把集合变量 baseUrl 设为 `http://127.0.0.1:3000`，请求统一写成 `{{baseUrl}}/captures`；发送前核对变量解析后的实际地址。

这样日常操作就是：选择已保存请求、改字段、Send、看响应；若需要定位内部原因，保持请求不变并设置断点。保存源码触发重启后，再点Send验证。每次POST都可能新增一条记录；当前Map在重启后清空，详情请求中的旧id也可能因此失效。

如果客户端显示连接错误，打开 Postman Console 查看实际请求URL及连接信息，先核对服务监听；收到400则已经有HTTP响应，再检查字段和服务端拒绝位置。客户端发请求成功并不能替浏览器证明跨源配置正确，浏览器相关问题仍要回到Network观察。

下面保留同一组请求的curl表示，便于复制到终端、分享最小复现或观察原始字节；可以直接在Postman中执行对应的方法、地址、头部与正文。它们表达的是同一轮业务操作，重复执行创建会重复写入。

### 对照请求与响应：从空列表开始

先请求列表：

```bash
curl -i http://127.0.0.1:3000/captures
```

`-i` 让 curl 同时显示响应头。响应中要观察的是：

```text
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{"items":[]}
```

这里及后面的响应示例省略了 `Date`、连接管理和传输相关头部；Node 可能自动补上它们，大小写与顺序也不必完全相同。重点是状态码、我们设置的字段和响应体。

服务终端还会出现 `GET /captures`。这条简短日志用于判断请求是否进入处理入口，不包含状态码、耗时或请求关联信息；第二篇会在实际需求下完善日志。

如果 curl 提示连接失败，此时尚未拿到一次 HTTP 响应，先检查服务是否成功监听、地址是否一致；修改 `JSON.parse` 不会让一个尚未建立的连接突然成立。反过来，收到 `400` 与 JSON 错误体，说明已经有服务处理请求并生成了响应。把“连接没有建立”和“应用拒绝输入”分开，才能沿着执行过程排错，而不是从头更换代码。

### 创建一条原文，再把它读回来

Postman 中直接编辑 Body 即可。若选择终端复现，为避免 shell 单引号与英文缩写中的撇号冲突，将请求体放进项目根目录的临时文件 `capture.json`：

```json
{
  "originalText": "I'm not much of cook."
}
```

文件用 UTF-8 保存。然后发送：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data-binary @capture.json
```

`--data-binary` 会发送文件内容，并让 curl 使用 POST；这里不需要额外写 `-X POST`。请求文件是本次调用的输入，不是服务的持久存储，也不必提交到代码仓库。

成功响应应类似下面这样；ID 与时间以你实际得到的值为准：

```text
HTTP/1.1 201 Created
Content-Type: application/json; charset=utf-8
Location: /captures/4cb5e1b4-1e0b-4daa-978b-1541c5d2fb5b

{"id":"4cb5e1b4-1e0b-4daa-978b-1541c5d2fb5b","originalText":"I'm not much of cook.","createdAt":"2026-10-28T06:00:00.000Z"}
```

这里既要看 `201`，也要看原文是否保持不变。`201` 表示当前实现完成了一次创建，不表示内容已经写入磁盘，更不表示 AI 已经润色或用户已经采纳。

再次执行列表请求，`items` 中应有刚才的记录。再把自己的 ID 放进详情地址：

```bash
curl -i http://127.0.0.1:3000/captures/把这里替换成实际返回的ID
```

不要直接使用示例里的固定 UUID。详情应返回同一个 ID、原文与时间。这样才把“保存成功”和“后续请求能够读回”接成了一条完整路径。

再创建一次相同原文，列表会多一条记录，而不是覆盖第一条。这是前面约定的行为；接下来调试时也要记得，每执行一次创建请求都可能再写入一条。

### 故意发错一次，比只看成功更有用

先发送合法 JSON，但让原文只包含空格：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"   "}'
```

应得到 `400`，响应体是：

```json
{"error":"originalText must be a non-empty string"}
```

然后把 JSON 本身写坏：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{'
```

仍然是 `400`，但错误变成 `Request body must be valid UTF-8 JSON`。前一个请求已经解析成对象，只是字段不符合要求；后一个在解析阶段就失败了。非法 UTF-8 也使用后一条错误说明：它表示读取结果未能成为合法的 UTF-8 JSON，定位时还需区分字节解码和 JSON 语法。状态码表达同一类失败，错误说明帮助我们继续缩小位置。

再试两个不同阶段的错误：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: text/plain' \
  --data '{"originalText":"Hello."}'

curl -i http://127.0.0.1:3000/captures/does-not-exist
```

它们分别应返回 `415` 与 `404`。前者没有满足入口要求的媒体类型，后者请求到了正确的详情路由，但没有这条记录。

如果要看方法不匹配的情况：

```bash
curl -i -X DELETE http://127.0.0.1:3000/captures
```

应收到 `405` 与 `Allow: GET, POST`。再请求列表时，要核对记录数量与失败操作之前相同。这里其实在检查两个独立结果：调用方是否收到正确的失败说明，服务的已有状态是否保持不变。只看到 `400` 并不能证明没有写入；一段先写 Map、再检查空白字符串的错误实现，也可能最终返回 `400`。列表是对写入边界的另一次观察。

### 在浏览器里看同一个响应

curl 方便复制和比较，浏览器开发工具则方便逐项查看请求。打开一个新标签页，访问：

```text
http://127.0.0.1:3000/captures
```

打开 Chrome 开发者工具，切到 **Network**，保持面板开启后刷新页面，选择 `/captures` 对应的请求。不同语言与版本的界面标签可能略有差异，重点是三个位置：

1. **Headers** 中查看请求 URL、方法和状态码，确认访问的是本机的列表接口。
2. 在响应头中找到 `Content-Type`，与代码里的 `sendJson` 对照。
3. 在 **Response** 或 **Preview** 中查看 `items`，核对刚才创建的记录。

地址栏导航发送的是 GET，因此它适合查看列表和详情，不能通过“把 JSON 写进地址栏”完成本章的 POST。若出现 `/favicon.ico` 的 `404`，那是浏览器在寻找图标，与记录接口是否可用没有直接关系。

还可以在**这个列表页面自己的 Console** 中发送创建请求：

```javascript
const result = await fetch('/captures', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ originalText: "I'm not much of cook." }),
});
console.log(result.status, await result.json());
```

此时 Network 面板会出现 POST 请求，可以继续看 **Payload** 与响应头里的 `Location`。这段代码应在确认来源的本机页面上执行；不要关闭浏览器的粘贴保护，也不用在不相关网页上试着执行它。若浏览器限制粘贴，继续在 Postman 中发送已保存的创建请求即可。

为什么强调是这个页面？因为 `/captures` 是相对当前页面来源解析的。我们也没有配置 CORS；从其他网站的控制台调用本机服务，还可能遇到跨来源或本地网络访问限制。先在同一来源观察接口，后续客户端接入时再明确处理相应规则。

还要注意，`fetch` 收到 `400`、`404` 时通常仍会返回一个 Response，而不是像网络中断那样直接拒绝。调用方需要检查 `status` 或 `ok`，再处理响应体。调试接口时，只看到一段 JSON 并不足以判断请求成功。

## 2.4 暂停一次请求，再停止整个服务

### 在写入之前停下来

现在我们已经知道一次请求的结果，接下来观察它执行到哪一步。保持 `npm run dev` 运行，确认终端已有服务监听日志；这个命令已经通过 `--inspect=127.0.0.1:9229` 开启调试入口，不需要为了断点另起一份服务。

使用 Chrome 打开 `chrome://inspect`，进入 **Devices**，找到指向本机 `9229` 的 Node 目标并点击 **inspect**。若未发现目标，检查 **Discover network targets** 是否启用，以及 **Configure** 中是否包含 `127.0.0.1:9229`，也可以保留已有的 `localhost:9229`。如果终端先报调试端口占用，要先检查之前的调试进程，不能把另一个不相关的目标当成本次服务。

在新开的调试窗口里进入 **Sources**，打开 `src/server.js`，找到：

```javascript
captures.set(capture.id, capture);
```

点击这一行左侧的行号设置断点。然后在 Postman 中打开已保存的创建请求，检查 Body 后点击 Send。

先判断断点处应该看到什么，再发送请求：此时字段检查应已通过，新对象应已生成，Map 中却不应包含这次写入。发送后 Postman 会等待，调试器停在写入行之前。在 **Scope** 或调试 Console 中观察：

```javascript
request.method
body.originalText
capture.id
captures.size
```

预期分别能看到 `POST`、提交的原文、新生成的 ID，以及当前 Map 的记录数。此时 `capture` 对象已经构造好，但当前这次写入尚未执行。

单步执行这一行后再看 `captures.size`，它应增加一。此时先不继续执行，Postman 仍在等待：服务的状态已经改变，客户端却还没拿到结果。继续执行后，Postman 才能收到 `201`。这样，我们直接看到了前面推导的先后关系，也能理解为什么“客户端没收到成功”无法反过来证明“服务一定没写入”。当前没有幂等处理，遇到这种情况直接重发，可能再创建一条。

若需要观察模块初始化等启动前的代码，才停止 dev，改用 `npm run debug`。它使用 `--inspect-brk`，在用户代码执行前暂停；连接后需要 Continue 才能看到服务监听日志。结束这项观察后切回 dev，继续使用保存即重启的流程。两种命令不要同时运行。

这里暂停的是服务端 JavaScript 执行，并不只是让当前客户端等待；暂停期间，其他需要执行 JavaScript 才能处理的请求也会受影响。后面研究事件循环时，再观察“请求正在等待”和“执行被阻塞”之间的区别。

调试完移除断点，关闭调试窗口，在原终端按 `Ctrl+C`。如果终端显示正在等待调试器断开，先确认调试窗口已经退出连接。继续学习时重新运行 `npm run dev`，从 chrome://inspect 连接新的调试目标；只有检查生产运行方式时才使用 `npm start`。不要把 Inspector 随服务公开。

### 区分端口占用和代码没有执行

保持一个普通服务进程运行，在另一终端再次运行 `npm start`。第二个进程应无法监听同一地址，输出类似：

```text
Cannot listen on 127.0.0.1:3000: address already in use
```

第一个进程仍然可以处理请求。也就是说，第二次启动失败，并不意味着 `3000` 上没有服务；Postman 此时访问到的还可能是之前的旧进程。修改代码后却一直看到旧结果时，尤其要检查这一点。

最直接的处理方式，是回到自己先前启动服务的终端，用 `Ctrl+C` 停止它，再启动新进程。如果不知道占用者是谁，macOS、Linux 可以先查询：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Windows PowerShell 可以先查询：

```powershell
Get-NetTCPConnection -LocalPort 3000 -State Listen
```

查询结果用于识别进程，不是让我们看到一个 PID 就结束它。先确认它属于自己的这次实践；如果端口由其他工作占用，可以把 `src/server.js` 中的 `port` 改为 `3001`，再同步修改后面所有请求地址。第三章再把端口变成外部配置，当前先保持启动方式直观。

`EADDRINUSE` 与没有权限监听的 `EPERM`、`EACCES` 是不同原因。后两种需要检查运行环境的限制；重复结束进程并不能解决它们。也不要因为一个端口报错，就直接以管理员权限运行整个项目。

### 重启后，再找一次原来的 ID

让服务以 `npm run dev` 运行，创建一条记录，记下这次响应的 ID，并确认列表和详情都能读到它。

在终端按 `Ctrl+C` 停止服务。此时再次请求列表，应当连接失败；如果仍返回数据，说明还有别的进程在提供响应，需要先弄清楚访问目标。

然后重新运行：

```bash
npm run dev
```

用同一个列表地址与刚才记下的详情地址再请求一次：列表回到 `{ "items": [] }`，旧 ID 返回 `404`。创建时间和 ID 都没有帮助数据恢复，因为我们只是把它们放进了同一份进程内存。

刷新浏览器页面不会清空 Map，关闭调用接口的终端也不会清空 Map；**结束拥有这份 Map 的服务进程**才使它丢失。重启时顶层的 `new Map()` 再执行，得到一份新集合。把这几种操作分开，后面才容易理解数据到底由谁持有。

`capture.json` 还在磁盘上，为什么不能算记录已经保存？因为它是 curl 发送的材料，而服务中的记录还包括自己分配的 ID 和创建时间。程序既没有把生成的记录写回这个文件，也没有在启动时从它重建 Map。重新提交它只会再创建一条拥有新身份的记录，无法恢复旧 ID 对应的那次创建。

由此也能判断一个看起来很小的修改：如果把 `const captures = new Map()` 移进 `handleRequest`，数据会在每次请求处理时重新开始，根本等不到进程重启才丢失。若同时启动两份服务，各自的顶层 Map 也仍是两份状态。把变量挪到更外层只能延长它在当前程序中的寿命，不能自动变成多个进程共同持有的存储。

第三篇会用 PostgreSQL 解决记录跨进程重启保留的问题。接数据库之前，第三章先解释进程、工作目录和资源边界，第四章观察事件循环，第五章建立 TypeScript 的开发与构建方式。它们继续使用这一份服务，把刚才看到的运行现象逐步解释清楚。

现在再看最初的三个接口，应该已经能把它们还原成一条有条件的执行路径：请求头让我们判断入口；流结束后才能得到完整 JSON；字段检查通过后才允许写入；进程持有的数据供下一次请求读取；响应把这次操作结果交给调用方。条件改变时，也有具体位置可以调整：接受更长内容，要同时重看接收上限与字段限制；要求重启后继续读取，要改变数据由谁持有；要求重试不重复创建，则需要识别同一次操作，单独换一种 ID 算法并不够。

本章对应代码分支：`part-01/chapter-02`。后续章节在此基础上继续演进，本章分支保留这一阶段的实现。

时间参考（估算）：只阅读约 45～50 分钟；按正文复制代码并完成请求、断点和重启观察，额外约 30～40 分钟，边读边做合计约 75～90 分钟。依据主文约 11100 字（不含附录）、约 150 行服务代码及操作步骤估算：阅读包括理解随文代码和解码策略，跟做只计算建文件与启动约 5 分钟、图形请求保存与响应观察约 10～15 分钟、断点、保存重启与开发/生产对照约 15～20 分钟，不重复计算阅读。附录按需查阅。不含首次安装 nvm 与 Node.js、逐字手敲全部代码或额外排错。

延伸查阅：[nvm 版本管理](https://github.com/nvm-sh/nvm#nvmrc)、[Node.js 24.22.1 发布说明](https://nodejs.org/en/blog/release/v24.22.1)、[Node.js HTTP 文档](https://nodejs.org/docs/v24.22.1/api/http.html)、[Node.js 流文档](https://nodejs.org/docs/v24.22.1/api/stream.html)、[Node.js 调试说明](https://nodejs.org/en/learn/getting-started/debugging)。这些文档用于核对 API 与按需查错，正文已经给出本章实现所需的关键代码。

## 本章支线

完成正文后，可以继续沿下面两条支线展开相关机制：

- [2A：Node 怎样接住一个 HTTP 请求](side-01-node-runtime-http.md)：从运行环境、地址监听到 HTTP 消息识别与请求回调，串起请求到达业务代码的过程。
- [2B：从字节到 JSON——Buffer、编码与流](side-02-buffer-encoding-stream.md)：主动切开一个 UTF-8 字符，对照解码结果，再解释流的内存占用与背压。

支线的阅读与操作时间单独列在各自文章中。

## 附录：本章必要技术点速查

以下按本章的使用方式整理，供阅读代码或排查问题时回查。Node.js API 对应项目固定的 `24.22.1` 版本。

### Node.js 与请求处理 API

表中的 `request` 是 HTTP 模块提供的 `IncomingMessage`，`response` 是 `ServerResponse`；它们分别表示收到的请求与正在组织的响应。

| API 或属性 | 本章用途 | 关键注意点 |
| --- | --- | --- |
| `http.createServer(listener)` | 创建服务，为每次请求调用 `listener(request, response)` | 异步处理中的拒绝由本章代码显式捕获并转换为响应。 |
| `server.listen(port, host, callback)` | 监听 `127.0.0.1:3000` | 成功回调执行后才输出启动成功；监听失败通过 `error` 事件处理。 |
| `server.on('error', listener)` | 处理启动等服务错误 | `EADDRINUSE` 表示地址已被占用，不属于业务请求中的输入错误。 |
| `request.method`、`request.url`、`request.headers` | 判断方法、解析路径、检查媒体类型 | `url` 可包含查询字符串；Node 将请求头字段名转为小写。 |
| `request.on(event, listener)` | 分别监听 `data`、`end`、`error`，读取与解析请求体 | 一个数据块不等于一份完整 JSON。 |
| `chunk.length`、`Buffer.concat(chunks)` | 统计字节、合并数据块 | Buffer 长度按字节计；先合并再解码，避免跨块的 UTF-8 字符被拆开。 |
| `TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode()` | 严格解码整份请求体 | 非法 UTF-8 抛错；合法的替代字符仍可保存；保留开头 BOM，由 JSON 解析拒绝。 |
| `response.writeHead(statusCode, headers)` | 设置状态码与响应头 | 在响应体发送前设置；本章 JSON 响应统一声明媒体类型。 |
| `response.end(body)` | 写出 JSON 文本并结束响应 | 结束本次响应后，当前分支及时返回。 |
| `response.destroyed`、`response.writableEnded` | 出错时检查是否还能发送响应 | 已销毁或已结束时，本章代码跳过再次写入。 |
| `crypto.randomUUID()` | 为记录生成 UUID | ID 由服务端生成，相同原文可有不同 ID。 |
| `new URL(input, base).pathname` | 从请求地址取路径 | 相对地址需要基准地址；构造 URL 本身不会发送网络请求。 |
| `process.exitCode = 1` | 标记启动失败的退出结果 | 设置非零退出码，不会立即强制结束进程。 |

官方查阅：[HTTP](https://nodejs.org/docs/v24.22.1/api/http.html)、[Buffer](https://nodejs.org/docs/v24.22.1/api/buffer.html)、[TextDecoder](https://nodejs.org/docs/v24.22.1/api/util.html#class-utiltextdecoder)、[Crypto](https://nodejs.org/docs/v24.22.1/api/crypto.html)、[URL](https://nodejs.org/docs/v24.22.1/api/url.html)、[Process](https://nodejs.org/docs/v24.22.1/api/process.html)。

### 数据处理与浏览器调用

| API 或机制 | 本章用途 | 关键注意点 |
| --- | --- | --- |
| `Map.set()`、`get()`、`values()`、`size` | 保存、查找、列出和计数记录 | 数据属于当前进程；本章列表按插入顺序返回。 |
| `JSON.parse()`、`JSON.stringify()` | 在 JSON 文本与 JavaScript 值之间转换 | 合法 JSON 也可能是 `null` 或数组，解析后仍要检查对象与字段。 |
| `String.trim()`、字符串 `.length` | 拒绝全空白原文并限制长度 | 保存原文不调用 `trim()`；长度按 UTF-16 代码单元计。 |
| `new Date().toISOString()` | 生成创建时间字符串 | 结果用 UTC 表示，以 `Z` 结尾。 |
| 浏览器 `fetch()`、`Response.status`、`ok`、`json()` | 从同源页面发送请求并读取结果 | HTTP `4xx` 通常仍返回 Response，调用方要检查状态。 |

这些是 JavaScript 与浏览器 API，可按名称在 [MDN JavaScript 参考](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference)和 [Fetch API 文档](https://developer.mozilla.org/zh-CN/docs/Web/API/Fetch_API)中查阅。

### HTTP 结果、命令与配置

| 技术点 | 本章用途与注意点 |
| --- | --- |
| `200`、`201` | 分别表示读取成功与创建成功；本章创建成功仍只写入内存。 |
| `400`、`404`、`405`、`413`、`415`、`500` | 分别用于无效输入、未找到、方法不支持、请求体过大、媒体类型不支持与未预期的服务错误。 |
| `Content-Type`、`Location`、`Allow`、`Connection` | 分别声明媒体类型、指向新记录、说明允许的方法，以及控制连接关闭；使用位置见正文请求与响应示例。 |
| `nvm install`、`nvm use`、`.nvmrc` | 按项目文件安装和切换到 `24.22.1`；新终端进入项目后执行 `nvm use`。 |
| `engines.node`、`.npmrc` 的 `engine-strict` | 声明精确 Node 版本，并让 npm 安装时检查；不匹配时先切换版本。 |
| `package.json` 的 `type`、`scripts` | 分别选择 ESM 模块格式，以及定义启动、调试命令。 |
| `npm install`、`npm ci`、`package-lock.json` | 初次生成锁文件，或按已有锁文件安装；锁文件记录项目依赖，不负责切换 Node。 |
| `--inspect-brk=127.0.0.1:9229` | 开启本机调试入口并在用户代码执行前暂停，需先继续执行才能启动监听。 |
| `curl -i`、`-H`、`--data-binary @capture.json` | 分别显示响应头、添加请求头、发送文件中的请求体；最后一个选项默认使 curl 使用 POST。 |
| `lsof -nP -iTCP:3000 -sTCP:LISTEN`、`Ctrl+C` | 前者查询监听进程，后者停止当前终端中的前台服务；先核对进程归属。 |

命令与配置查阅：[nvm](https://github.com/nvm-sh/nvm#usage)、[npm 配置](https://docs.npmjs.com/cli/v10/using-npm/config)、[Node.js 调试](https://nodejs.org/en/learn/getting-started/debugging)、[curl 手册](https://curl.se/docs/manpage.html)。HTTP 状态与响应头可查 [MDN HTTP 参考](https://developer.mozilla.org/zh-CN/docs/Web/HTTP/Reference)。

[上一章：先认识我们要建设的 EPP](../chapter-01-epp/chapter.md) · [下一章：Node.js 程序究竟运行在哪里](../chapter-03-node-runtime/chapter.md) · [返回第一篇](../README.md) · [返回全书目录](../../README.md)
