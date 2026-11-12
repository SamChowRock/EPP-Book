# 第 2 章 完成第一次 HTTP 往返

上一章定下记录的用途。打开一个空列表时，客户端要知道两件事：本机是否有程序接收请求，接收后是否认得这个地址。今天先做一个只认识 `GET /captures` 的服务。读者能在 Postman 看到一份空列表，也能用同一个地址辨认“程序返回了错误”和“程序已经停止”。

**代码起点**为空项目。阅读约 16～20 分钟，建项目、发请求与复查监听另加约 12～18 分钟，首次安装 Node 的时间另计。

## 2.1 为项目选定运行版本

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
    "dev": "NODE_ENV=development node --watch --inspect=127.0.0.1:9229 src/server.js",
    "start": "NODE_ENV=production node src/server.js",
    "debug": "NODE_ENV=development node --inspect-brk=127.0.0.1:9229 src/server.js",
    "check": "node --check src/server.js"
  }
}
```

`dev` 是学习时默认的启动入口，监听源码并开启本机调试；`start` 是不带监听与调试的生产运行入口，`debug` 用于需要在启动前暂停的专项排查。`private` 防止这个练习项目被误发布到 npm；`engines.node` 与 `.nvmrc` 保持同一个精确版本。

命令显式设置运行模式：dev/debug 使用 `NODE_ENV=development`，start 使用 `NODE_ENV=production`。模式给程序和依赖判断环境；是否监听文件、开放 Inspector，仍由命令参数控制，设置 production 不会自动移除调试参数。这里采用 macOS、Linux 或 WSL 的 shell 写法。

`engines` 默认只表达版本要求。再在项目根目录新建 `.npmrc`，让 npm 在安装时检查并拒绝不匹配的 Node 版本：

```ini
engine-strict=true
```

这两份配置各有作用：`.nvmrc` 供 nvm 选择版本，`engines` 配合 `.npmrc` 检查安装环境。它们都不会代替终端执行 `nvm use`；遇到 `EBADENGINE`，先切换到项目版本再重试。`.nvmrc`、`.npmrc` 都与项目一起保留。

`type: "module"` 让项目内的 `.js` 文件按 ESM 处理，因此下面可以直接写 `import`。这里先保持一种模块格式；第六章会通过实际运行和报错，展开模块解析与 TypeScript 构建。

现在运行：

```bash
npm install
```

这一步会生成 `package-lock.json`。本章没有第三方依赖，依赖清单里也就没有 `dependencies` 或 `devDependencies`；不需要安装一个名为 `http` 的包，代码要使用的是 Node 内置的 `node:http`。没有第三方包时，不出现 `node_modules` 目录也是正常的。

保留 `package.json` 和锁文件，它们共同描述项目依赖。拿到已经带锁文件的项目时，可以用 `npm ci` 安装并核对清单；第六章再解释它与 `npm install` 的区别。此刻不要为了让命令输出更“像一个项目”，额外安装框架或工具。

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

## 2.2 让一次 GET 有状态、头部和正文

### Node 收到请求时，究竟把什么交给我们

稍后要处理“接收一条原文”。先从我们熟悉的调用方式反推服务端需要完成的工作：浏览器把一个对象用 `JSON.stringify` 变成文本，放进 HTTP 请求体；服务端收到这段文本，还要把它解析回来，才能读取 `originalText`。

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

新建 `src/server.js`，写入下面的完整文件。服务只在本机回环地址接受连接。每次调用回调时，先依据方法与地址决定结果，再把状态、内容类型和 JSON 文本写入同一次响应。

```javascript
import { createServer } from 'node:http';

const host = '127.0.0.1';
const port = 3000;
const server = createServer((request, response) => {
  console.log(JSON.stringify({ event: 'http.request', method: request.method }));
  const isList = request.method === 'GET' && request.url === '/captures';
  response.writeHead(isList ? 200 : 404, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(isList ? { items: [] } : { error: 'Not found' }));
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

在项目目录执行 `npm run check`，它会检查文件语法。再运行 `npm run dev`，保持终端开启，等到 `EPP listening on http://127.0.0.1:3000`。这行日志在监听成功后才输出。响应由 `response.end(...)` 结束，进程可以继续接收下一次请求。

## 2.3 对照 200、404 和连接失败

保持 `npm run dev` 运行，打开 [Postman 桌面客户端](https://www.postman.com/downloads/)。这里选择桌面客户端，让请求直接从本机发往本机服务；使用其他接口工具时，方法、地址、头部和正文仍是同一组输入。客户端负责发送请求、展示响应，进入源码观察变量则由 Chrome 或后续的 VS Code 调试器完成。

先新建一个 HTTP 请求，方法选 GET，地址填 `http://127.0.0.1:3000/captures`，不填写 Body，点击 **Send**。在响应区查看状态应为 200，Body 为 `{"items":[]}`；切到响应 Headers 查看 Content-Type。请求头与响应头是两个方向，不要把服务返回的头误认为自己提交的配置。

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

服务终端还会出现 `{"event":"http.request","method":"GET"}`。这条简短日志用于判断请求是否进入处理入口，不包含状态码、耗时或请求关联信息；第二篇会在实际需求下完善日志。

把这个 GET 保存为“查看列表”。复制请求，只将路径换为 `/missing`。如果监听的程序认不得路径，预测此时能否在客户端读到状态码，以及终端里是否还会出现请求事件。点击 Send，查看响应中的 404 和 JSON 错误体。再把路径改回 `/captures`，在另一个终端运行：

```bash
curl --noproxy '*' -sS -o /dev/null -w 'HTTP=%{http_code}\n' http://127.0.0.1:3000/captures
echo $?
```

这里让 curl 直连本机，丢弃正文，只打印 HTTP 状态。紧接着的 `echo $?` 打印上一条命令的退出码。服务运行时结果应为 `HTTP=200` 和 `0`。改查 `/missing` 可得到 `HTTP=404` 和 `0`，因为这条命令只要求成功完成 HTTP 传输。

回到服务终端按 Ctrl+C，再向原列表地址发送相同请求。在没有其他进程接替监听的情况下，Postman 显示连接失败，curl 报无法连接、打印 `HTTP=000`，退出码为 `7`。000 是 curl 没有收到 HTTP 状态码时显示的值。重新运行 `npm run dev` 后再发保存的 GET，确认空列表可以读回。如果停掉当前服务仍收到 200，可在下面核对监听进程。

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

查询结果用于识别进程，不是让我们看到一个 PID 就结束它。先确认它属于自己的这次实践；如果端口由其他工作占用，可以把 `src/server.js` 中的 `port` 改为 `3001`，再同步修改后面所有请求地址。Windows 读者在 WSL 内运行本章服务时，先在同一个 WSL 环境查询；PowerShell 的结果用于核对 Windows 一侧，不能代替 WSL 内的进程归属判断。第四章再把端口变成外部配置，当前先保持启动方式直观。

`EADDRINUSE` 与没有权限监听的 `EPERM`、`EACCES` 是不同原因。后两种需要检查运行环境的限制；重复结束进程并不能解决它们。也不要因为一个端口报错，就直接以管理员权限运行整个项目。

保留项目文件和已保存的请求，停止自己启动的服务。下一章从这个目录继续，实现接收正文和创建记录。

[上一章：先认识我们要建设的 EPP](../chapter-01-epp/chapter.md) · [下一章：可靠接收请求正文并保存原文](../chapter-03-minimal-service/chapter.md) · [返回第一篇](../README.md) · [返回全书目录](../../README.md)

[本章配套代码](https://github.com/SamChowRock/epp-public/tree/part-01/chapter-02)
