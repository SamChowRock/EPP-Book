# 第 3 章 Node.js 程序究竟运行在哪里

第二章的记录服务已经能接收原文、生成 ID，并通过列表和详情读回数据。调试时我们还见到了几个不属于业务规则的问题：第二次启动占用了同一个端口；停止服务后，Map 里的记录消失了；同一份 JavaScript 在浏览器控制台和 Node 中承担着不同工作。

先看第二章留下的两个现象：同一个程序再次启动会争用端口，却不会读到第一个进程的 Map；源码中的最后一行已经执行完，服务仍然可以接收新请求。前者涉及状态与资源归谁持有，后者涉及运行时还在等待什么。如果只记住启动和停止命令，这两种现象很容易被笼统归为“Node 的行为”，遇到环境变化时就没有进一步判断的依据。

我们从启动者、进程和操作系统之间的关系开始。启动者提供参数、工作目录、环境变量与输入输出连接；进程执行代码并持有本次运行的状态；访问文件或监听端口时，还要向操作系统申请资源。沿着这几层关系，才有办法解释同一份代码为什么在另一终端、另一目录或另一账号下表现不同。

这一章继续使用第二章的项目。先观察进程的运行上下文，再把端口从源码中移到启动配置，最后复现并修正“换目录后找不到文件”。三个 HTTP 接口与记录结构保持原来的约定，记录仍在内存里；文件读写用于理解运行环境，不在这里临时造一个 JSON 数据库。

**代码起点**：第二章完成状态，代码分支 `part-01/chapter-02`。本章完成状态使用 `part-01/chapter-03`。运行版本沿用 `24.22.1`，命令沿用 macOS、Linux 的 Bash／Zsh，Windows 读者在 WSL 中执行。

## 3.1 进程、工作目录、环境变量与标准输入输出

### 先把文件与正在运行的程序分开

在项目根目录执行 `node src/server.js` 时，shell 先解释命令，按照可执行程序查找规则找到 `node`，再安排一次程序执行。通常可以把结果理解为：一个新的 Node 进程拿到启动上下文，加载入口文件与依赖，然后执行代码。这里暂不展开操作系统创建进程的底层步骤，先看哪些信息已经传了进去、哪些状态需要重新建立。

`src/server.js` 的位置只回答“读哪份代码”。工作目录回答相对文件路径从哪里算起；环境变量与参数给这次运行提供输入；进程的身份决定可以请求哪些资源。它们都不存放在那份 JavaScript 源码中，因此复制源码并不能自动复制整个运行条件。

进程开始执行后，`new Map()` 创建的是本次运行中的对象。修改磁盘上的源码，不会让已经执行过的语句重新执行；结束进程也不会删除源码文件。开发时自动重启工具让这两件事看起来接近同步，但它仍是检测文件变化、终止旧进程、再启动新进程的一组动作。

第二章的 `new Map()` 在每次启动时重新执行。因此，同一份源码可以启动两份服务，但不会因此共享同一张 Map。两份服务争用端口，是在争用操作系统管理的监听资源；两份服务中的记录互不相通，是因为它们各自持有自己的状态。文件相同、程序行为相同和运行状态相同，是三个不同的判断。

先做一个不需要监听端口的观察。在项目根目录新建 `examples/runtime-context.js`，完整内容如下：

```javascript
console.log(JSON.stringify({
  pid: process.pid,
  cwd: process.cwd(),
  node: process.version,
  execPath: process.execPath,
  execArgv: process.execArgv,
  args: process.argv.slice(2),
  port: process.env.PORT ?? '(unset)',
  stdinIsTTY: process.stdin.isTTY === true,
  stdoutIsTTY: process.stdout.isTTY === true,
}, null, 2));
```

运行两次：

```bash
node examples/runtime-context.js
node examples/runtime-context.js
```

两次运行通常会得到不同的 PID。PID 用来识别当前进程，但退出后可能被系统重复使用，不能拿它当业务 ID。`execPath` 表示实际运行的 Node 可执行文件，`node` 表示它的版本；这两个值能帮助判断新终端是否真的使用了 nvm 选定的版本。

`cwd` 是 **current working directory，当前工作目录**。它初始来自启动者，在本例中就是 shell 执行命令时所在的目录。它不等于入口文件所在的目录，更不等于当前执行模块所在的目录。服务从项目根目录启动时，入口在 `src/` 下，工作目录仍然是项目根目录。3.4 会利用这个差异制造一次可解释的失败。

这里只输出与实验有关的字段。不要用 `console.log(process.env)` 收集诊断信息：开发环境里可能已经有数据库密码、平台令牌等内容。输出工作目录与可执行文件路径也会暴露本机目录结构，分享结果时应替换个人路径。

### 环境变量是启动输入，读取后还要解释

第二章为解决端口占用，允许直接修改源码里的 `3000`。这适合最初观察，却不适合同时运行两个实例：每次换端口都改源码，会把“程序做什么”和“这一次怎样启动”混在一起。

端口应当成为启动输入。在修改服务之前，先用刚才的观察程序检查输入到底是什么：

```bash
PORT=3001 node examples/runtime-context.js
node examples/runtime-context.js
```

第一条命令只给这一次命令设置 `PORT`；第二条应恢复原来的值，如果原来没有设置，就显示 `(unset)`。输出中的 `"3001"` 是字符串。shell 不知道这个变量代表网络端口，Node 也不会因为变量名叫 `PORT` 就替我们完成数值校验。

如果执行 `export PORT=3001`，后续由这个 shell 启动的子进程会继承它；用 `unset PORT` 可以从当前 shell 环境移除。继承发生在创建子进程时。之后在另一个终端改变量，或者修改当前 shell 的值，都不会追溯更新已经启动的服务。反过来，子进程修改自己的 `process.env`，也不会修改父 shell。

这种继承更像一次启动时交付的副本，而不是多个进程共同查询的一张动态配置表。可以在子 shell 里验证，避免改变平时终端中的配置：

```bash
(
  export PORT=3001
  node -e 'console.log("child before:", process.env.PORT); process.env.PORT = "3002"; console.log("child after:", process.env.PORT)'
  printf 'shell after: %s\n' "$PORT"
)
```

子进程应先显示 3001，再显示 3002，最后 shell 仍显示 3001。由此可以判断“我已经改了环境变量，为什么服务没有变化”：可能是改在另一个进程里，也可能服务已经把旧字符串解析成配置对象。即使在服务内部修改 `process.env.PORT`，已经建立的监听也不会自动迁移；程序还需要明确实现重新配置的动作。

`.env` 文件也不例外。它只是文本，必须由 Node 的相关启动选项或某段加载代码读取，才会进入配置流程。本章尚未引入这样的加载步骤，所以仅新建一个 `.env` 文件不会改变服务。这是追踪输入来源的方法：从启动命令一路找到读取、解析和使用位置，而不是根据文件名猜测它已经生效。

最直接的配置代码可能是：

```javascript
const port = Number(process.env.PORT || 3000);
```

它很短，却隐藏了两个决定。空字符串会被当成“未配置”而退回默认值；非空的错误值则会得到 `NaN`。换成 `parseInt()` 也不是校验，例如 `parseInt('3001oops', 10)` 会接受前面的数字。调用者以为自己传了一个值，服务却使用另一个解释，出错位置还可能拖到监听阶段。

本章选择明确的规则：未提供变量时使用默认端口；提供了变量，就必须是一串十进制数字，转换后位于 1～65535。空字符串、空格、小数和混入字母的值都拒绝。`0` 在 Node 监听时可以让系统分配端口，但本章需要一个读者可以直接请求的固定端口，所以也拒绝它。数字字符串允许前导零，转换后的数值仍按范围检查。

这不是 Node 规定所有项目都必须这样配置，而是我们给服务建立的输入契约。3.4 会把这组规则写进 `loadConfig()`，并在真正监听之前执行。若以后需要支持随机端口，应明确改变契约，再从监听结果读取实际地址。

### 日志为什么出现在终端里

环境变量传入的是启动信息，输入输出通道则承担运行过程中的数据交换。进程通常获得三个约定好的通道：标准输入 stdin、标准输出 stdout、标准错误 stderr，对应文件描述符 0、1、2。

文件描述符可以先理解为当前进程用于访问已打开资源的编号。编号不是文件路径：程序经由编号 1 写出内容，操作系统再把内容交给该编号关联的资源。启动者可以把它关联到终端，也可以关联到文件或管道，所以 `console` 并没有一个固定不变的“显示窗口”。这也解释了为什么同一段代码可以在终端显示日志，也可以由进程管理器收集日志。

在 Node 中，`console.log()` 通常写入 stdout，`console.error()` 写入 stderr。两者直接连接终端时都显示在同一个窗口，看起来没有区别；把输出分开后，区别就出现了：

```bash
node examples/runtime-context.js > runtime-output.txt
cat runtime-output.txt
```

这一次，JSON 进入文件，`stdoutIsTTY` 应为 `false`。`>` 是 shell 的重定向操作，不是 JavaScript 语法，也不是 Node 的日志配置。它会创建或截断目标文件，实验请使用这里专用的文件名；`>>` 才是追加。这个输出文件可能包含本机路径，不需要提交到仓库。

接下来新建 `examples/echo-stdin.js`，观察输入也可以来自另一个程序：

```javascript
process.stdin.setEncoding('utf8');
for await (const chunk of process.stdin) {
  process.stdout.write(chunk);
}
console.error('stdin ended');
```

在项目根目录执行：

```bash
printf 'EPP runtime\n' | node examples/echo-stdin.js > echo-output.txt 2> echo-error.txt
cat echo-output.txt
cat echo-error.txt
```

前一个文件应只有 `EPP runtime`，后一个应有 `stdin ended`。`printf` 写出的字节通过管道成为 Node 的 stdin；输入流结束后，循环才结束。`setEncoding('utf8')` 让流处理跨块解码，避免把任意字节块直接当作完整字符。这里沿用第二章已经讲过的流，不假设一次循环就是一整行。

这里结束循环的依据是输入流结束，不是“暂时读不到内容”。前面的 `printf` 结束并关闭写端后，读者才能在读完缓冲内容后看到输入结束；如果上游仍持有写端而暂时不输出，等待就是正确行为。把这两个条件混淆，文件导入程序就可能只读到一部分便宣告完成。

这是小输入的通道观察示例。它没有处理慢速输出的背压，大文件转发的资源控制在第 44～45 章展开。当前先把两个独立判断建立起来：输出去了哪里，要看通道连接；命令成功与否，要看退出状态。stderr 可以输出进度，stdout 也可能包含错误文本，文本放在哪条通道并不会自动决定进程成败。3.3 会把这个区别用于启动失败的处理。

## 3.2 浏览器与 Node.js 的全局对象、文件访问和权限边界

### 同一个 API 名称，不代表同一个运行上下文

从前端转过来，最容易混淆的不是语法，而是把浏览器提供的环境一起带进服务端。例如，第二章在列表页面里调用 `fetch('/captures')`，相对地址可以借用当前页面的来源；Node 中没有那个页面，也就没有一个隐含的 `location` 替它补全地址。

先在终端观察当前 Node 提供的对象：

```bash
node -e 'console.log(typeof globalThis, typeof window, typeof document, typeof fetch)'
```

在本章普通 Node 运行环境中，应得到：

```text
object undefined undefined function
```

`globalThis` 是访问当前环境全局对象的标准入口。浏览器页面有 DOM，Node 默认没有页面 DOM；但现代 Node 已提供 `fetch`、`URL` 等不少 Web API。因而“浏览器有的 Node 都没有”并不成立，“有 fetch 就拥有浏览器页面环境”也不成立。

第二章的服务在默认端口运行时，Node 中可以这样调用列表接口：

```bash
node --input-type=module -e 'const response = await fetch("http://127.0.0.1:3000/captures"); console.log(response.status, await response.json());'
```

这里写完整 URL，明确连接目标。`--input-type=module` 用于把 `-e` 中的代码按 ESM 执行，从而使用顶层 `await`；普通项目文件已经由第二章的 `"type": "module"` 声明模块格式。模块系统的完整比较留到第五章。

还有一个容易误判的边界：浏览器同源策略约束网页脚本，不能当作服务端的访问权限。Node 中的请求不会自动继承某个浏览器页面的 Cookie 与登录状态，也不依靠浏览器的 CORS 检查决定能否发送请求。以后服务是否允许读取某条记录，要由身份与权限机制决定。当前绑定 `127.0.0.1` 只是把监听限制在本机网络接口，并没有给记录接口增加登录校验。

### 能调用文件 API，不等于拥有任意文件的权限

浏览器页面的文件访问受到浏览器提供的能力与授权机制约束，例如由用户选择一个文件再交给页面。Node 的 `node:fs` 则允许程序直接提出按路径访问文件的请求，操作系统再根据运行身份、路径与访问方式决定是否允许。

这里有两层不同的问题：运行时有没有提供某个 API，以及调用者有没有访问目标的权限。Node 提供文件 API，并不能让一个没有访问许可的进程读到目标文件；反过来，程序属于自己的项目，也不代表它的依赖只能访问这个项目目录。通常运行在同一进程里的依赖代码使用相同的进程权限，所以不应把安装依赖理解成只引入了一组没有外部影响的纯函数。

一次文件访问可以顺着“定位目录—查找名字—检查访问条件—打开资源—读写—关闭”来理解。目录权限控制能否沿路径到达目标，文件权限与打开方式决定能做哪类操作。比如读取默认配置和新建日志文件需要的条件不同：前者需要到达并读取既有文件，后者还要允许在输出目录创建名字。只知道某个账号“能访问这个目录”还不足以作出判断。

不要把这种差异理解为“后端天然有更高权限”。普通 Node 进程不会因为运行 JavaScript 就自动成为管理员；把程序从终端挪进受限环境，也可能让原来可访问的路径失败。更不能为了绕过 `EACCES` 就直接把整个服务改成管理员运行，这会扩大它能够改动的范围。

先把文件内容的寿命和访问操作的寿命分开。下面的例子在独立临时目录创建文件，完成写入后再读回；不修改已有项目文件。新建 `examples/file-note.js`：

```javascript
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

try {
  const directory = await mkdtemp(join(tmpdir(), 'epp-note-'));
  const filename = join(directory, 'note.txt');
  await writeFile(filename, 'EPP file example\n', { encoding: 'utf8', flag: 'wx' });
  console.log(await readFile(filename, 'utf8'));
  console.log(`Saved example: ${filename}`);
} catch (error) {
  console.error(`File example failed (${error.code ?? error.name})`);
  process.exitCode = 1;
}
```

运行：

```bash
node examples/file-note.js
```

这里先让系统选择临时目录，再由 `mkdtemp()` 创建一个独立目录，不猜测本机临时目录一定叫 `/tmp`。`join()` 按平台规则拼接路径。`writeFile()` 默认可能覆盖同名文件，因此显式使用 `wx`：创建新文件，若目标已存在就失败。这个选择把“不覆盖已有文件”交给实际打开文件的操作，不先用“检查不存在，再写入”的两步流程制造竞争窗口。

`writeFile()` 接收路径时会组织打开、写入与关闭；`await` 等待这次操作完成，后面的读取才建立在这个完成条件上。去掉 `await`，读取与写入就可能交错，不能再保证文件内容已经可用。传入 `'utf8'` 时，`readFile()` 返回字符串；不传编码则返回 Buffer。它会把整个文件读进内存，因此适合这里的小文件，不是任意大小文件的通用方案。

运行成功时会先看到 `EPP file example`，再看到实际文件位置。程序结束以后，文件不会因为进程退出立刻消失；可以在本机用编辑器打开该路径，再删除这个程序刚创建的演示目录。临时目录可能被系统清理，不能作为业务数据存放位置。若运行受限，观察错误码即可，不必改动系统目录权限来强行完成例子。

如果改为自己调用 `open()` 持有文件句柄，就需要在成功和失败路径中都安排关闭；异常不会自动跳到某个正常路径末尾的 `close()`。关闭释放访问资源，不删除已经写入的内容。这个区别同样适用于后面的数据库连接和其他外部资源：资源收尾与业务回滚需要分别设计。

文件确实比内存活得久，但这仍不足以把记录服务变成可靠的持久化系统。我们还没有处理并发写入、写到一半中断、历史结构变化，也没有从文件恢复 Map。一个文件写入 Promise 成功，也不是所有崩溃与掉电场景下的数据持久性保证。这一章只建立文件访问和生命周期的直觉，第三篇会从数据库开始处理业务持久化。

## 3.3 启动参数、退出码、信号，以及为什么服务能持续运行

### 谁在解释命令中的参数

现在用已经建立的观察程序运行：

```bash
node --no-warnings examples/runtime-context.js --label demo
```

`execArgv` 应包含 `--no-warnings`，`args` 应为 `["--label", "demo"]`。前者在入口文件之前，由 Node 解释；后者在入口文件之后，作为应用参数交给程序。`process.argv` 前两个元素通常分别是 Node 可执行文件与入口文件的路径，因此本例使用 `slice(2)` 只显示应用参数。

观察程序只是展示参数，并没有实现一个 `--label` 选项。第二章的服务也没有实现 `--port`，所以在后面加上 `--port 3001` 不会自动换端口。参数传进来、程序解析它、程序据此改变行为，是三个独立步骤。

同样，`npm start -- --port 3001` 中的 `--` 只负责把后面的参数交给脚本，不会替脚本增加解析能力。第二章的调试命令把 `--inspect-brk` 放在入口之前，是因为这是 Node 的选项。`--no-warnings` 在这里仅用于辨认参数位置，日常运行不要为了让终端干净而隐藏诊断信息。

### 打印了错误，为什么仍然算成功

shell 需要用一个结果判断刚才的命令是否成功，这就是退出码。先运行两个不依赖 HTTP 的小实验，每次紧接着读取 `$?`：

```bash
node -e 'console.error("example error message")'
echo $?

node -e 'console.error("example failure"); process.exitCode = 1'
echo $?
```

第一次应为 `0`，第二次应为 `1`。`$?` 是前一条命令的退出状态，中间插入别的命令就会覆盖它。错误说明写到 stderr，表达给人看的原因；非零退出码表达给启动者看的失败结果。部署脚本不应靠搜索日志里有没有英文 `error` 判断启动是否成功。

为什么第二章使用 `process.exitCode = 1`，不直接 `process.exit(1)`？前者设定自然退出时的结果，让已安排的工作按正常机制收尾；后者要求立即终止，可能截断尚未完成的输出或异步操作。二者不能互换。

但设置 `exitCode` 也不等于已经开始关闭服务。如果监听资源仍然存在，进程可以继续运行，只是在将来退出时携带这个结果。第二章监听失败后可以结束，是因为没有成功建立那份监听资源，且没有其他工作需要继续。以后连接数据库、启动后台任务后，必须逐一安排关闭；只赋一个退出码不会释放它们。

### 顶层执行结束，不等于没有工作了

观察程序打印完就退出，记录服务却停在终端里等请求。判断这一点时，要分开三件事：JavaScript 对象是否还可访问，操作系统资源是否还被占用，以及运行时是否还有需要等待的工作。

例如，顶层 Map 仍然可访问，并不会单凭这一点让程序永久运行；打开但没有进行异步操作的普通文件描述符，也不一定阻止 Node 自然退出。HTTP 监听不同，它要求运行时继续等待连接。所谓资源“保活”，说的是这种运行时层面的等待责任，不是变量还在作用域中，也不是对象还没被垃圾回收。

`createServer()` 创建对象，`listen()` 才请求建立监听。成功监听后，即使此刻没有请求，这份默认保持引用的活动资源仍要求运行时等待新的连接。顶层语句结束，只表示初始化这一轮执行结束，不能推导出所有工作已经结束。

这里的“引用”指资源是否要求事件循环继续存活。等待网络事件不需要让 JavaScript 不停执行；运行时可以交由操作系统等待事件，再在条件满足时安排后续处理。若用忙循环“保活”，反而会占住处理请求所需的执行机会，第四章会沿这个边界观察等待与计算的差异。

可以用定时器先做一个不涉及端口的对照：

```bash
node -e 'setTimeout(() => console.log("timer fired"), 1000); console.log("top level ended")'
node -e 'setTimeout(() => console.log("timer fired"), 1000).unref(); console.log("top level ended")'
```

第一条先打印 `top level ended`，等待约一秒后打印 `timer fired`；第二条中定时器被取消了“要求进程保持运行”的引用，通常只打印第一行就结束。`unref()` 没有取消定时器：如果还有别的资源让进程活着，它仍可能触发。因此不能把关键写入任务放进一个被 `unref()` 的定时器，再假设程序一定等它完成。

同理，一个普通、未完成的 Promise 本身不一定保活：

```bash
node -e 'new Promise(() => {}); console.log("created a pending promise")'
```

这个命令会结束。HTTP、文件 I/O 或定时器背后可能有实际工作，单独构造 Promise 却没有建立这些资源。这里刻意没有使用顶层 `await`；未完成的 ESM 顶层等待有单独的退出语义，不能把两种例子混成“所有 Promise 都不影响退出”。当前只需抓住判断依据：究竟是谁登记了仍需处理的工作。

### Ctrl+C 与关闭资源是什么关系

在终端里前台运行服务时，`Ctrl+C` 通常由终端向前台进程组发送 `SIGINT`。另一个常见停止信号是 `SIGTERM`。在本章使用的 POSIX 环境中，Node 对它们有默认退出行为，第二章没有添加处理器，所以按下 `Ctrl+C` 后服务会结束。进程结束时，操作系统回收它持有的资源，内存记录也随之丢失。

要单独观察 `SIGTERM`，先启动一个临时进程，输出自己的 PID，再用一个十分钟定时器保持活动，给我们留出发送信号的时间：

```bash
node -e 'console.log(process.pid); setTimeout(() => {}, 600000)'
```

在另一终端核对这个 PID 确实属于自己刚启动的演示进程，再执行：

```bash
kill -TERM 实际PID
```

不要照抄示例数字，更不要结束归属不明的进程。`kill` 的名字容易误导：这里是在发送信号，不是任何用法都表示立即强制杀死。原终端紧接着执行 `echo $?`，Bash／Zsh 通常把 SIGTERM 终止表示为 `143`，SIGINT 表示为 `130`。用进程 API 观察时，退出信号也可能独立于数值退出码返回，不能把 shell 的编码方式当成所有工具统一的结果。

现在看一个**不要直接加到服务里**的片段：

```javascript
process.on('SIGTERM', () => {
  console.log('received SIGTERM');
});
```

一旦注册处理器，默认退出行为就改变了。信号不是一个会从调用栈中抛出来、自动触发所有 `finally` 的异常。Node 把这个事件交给注册的回调；回调返回后，如果监听仍保持活动，进程就还需要继续等待。所以上面的日志只能证明“收到了停止请求”，不能证明“停止已经完成”。

由这里可以推导收尾顺序。首先关掉产生新工作的入口，否则等待已有请求期间还会不断出现新请求；然后根据业务要求等待或取消已接受的工作；最后释放这些工作仍依赖的资源。若先关闭数据库连接，再让正在保存的请求继续执行，就破坏了后者的完成条件。对于不会自行完成的工作，还必须有收尾时限和超时处理。

当前记录服务仍保留默认停止方式，数据库连接与 HTTP 请求的完整协调将在第十二章落实。现在需要先掌握这条因果关系：接管停止信号就接过了决定何时退出的责任；函数返回、收到信号、资源释放和业务完成并不是同一个时刻。独立的定时任务例子可以把这些时刻拆开观察，而不必提前给 EPP 接入数据库。

`SIGKILL` 无法被捕获，程序没有执行清理代码的机会。由此也能推导：把内存记录的唯一保存机会安排在退出回调中，无法保证数据可靠。处理停止信号和保证数据持久化解决的是不同问题，需要分别设计。

## 3.4 相对路径、文件读写与环境差异：复现换目录后启动失败

### 先给相对路径找出它的基准

现在把端口配置接入服务。为了同时区分“随项目交付的默认配置”和“本次启动的覆盖值”，在根目录新建 `config/service.json`：

```json
{
  "port": 3000
}
```

这个小文件保存公开默认值，可以随代码提交；环境变量 `PORT` 覆盖本次运行的端口。当前只有一个值，继续在源码中保留默认值也完全可行。这里把它单独放到文件，是为了把读文件这一运行条件放进同一份服务，亲自验证路径选择；并不是以后每个常量都必须拆成配置文件。

读取它最自然的写法，是 `readFile('./config/service.json', 'utf8')`。先不要把这个假设藏进启动流程，新建独立复现文件 `examples/cwd-config.js`：

```javascript
import { readFile } from 'node:fs/promises';

try {
  const text = await readFile('./config/service.json', 'utf8');
  console.log(JSON.parse(text));
} catch (error) {
  console.error(`Cannot read config from cwd (${error.code ?? error.name})`);
  process.exitCode = 1;
}
```

在项目根目录运行，应该读到 `{ port: 3000 }`：

```bash
node examples/cwd-config.js
```

再在同一个终端执行：

```bash
(
  cd src
  node ../examples/cwd-config.js
)
```

括号开启子 shell，里面的 `cd` 不会改变外层终端的目录。此时入口文件仍能找到，读取却应失败，得到 `ENOENT`。程序实际上在寻找 `src/config/service.json`，因为文件 API 中这个相对字符串以 `process.cwd()` 为基准，和 `cwd-config.js` 位于哪个目录无关。

还可以把工作目录换到项目父目录：

```bash
(
  cd ..
  node epp-book-code/examples/cwd-config.js
)
```

这里假设实践目录仍叫 `epp-book-code`，且父目录没有别的 `config/service.json`。若父目录碰巧有同名文件，程序可能更糟：不报错，却读入别的配置。因此修正目标不能只表述为“别报 ENOENT”，而应是“无论从哪里启动，都读取这份项目自带的默认配置”。

这与入口查找是两个阶段。从 `src/` 执行 `node src/server.js`，入口本身就找错了；执行 `node server.js`，入口能找到，内部文件仍可能找错。报错时先确认执行到了哪一步，再决定改启动命令还是改程序中的路径。

### 资源跟着模块走，路径就跟着模块定位

这个错误有几种看似能用的修法。要求所有人先 `cd` 到项目根目录，实际上是给启动方式增加约束；把本机绝对路径写死，会让代码只适用于一个安装位置；在程序里 `process.chdir()` 到根目录，则改变整个进程此后所有 cwd 相对操作，可能连用户指定的输入输出位置一起改掉。

本次真正需要固定的只有项目自带配置的位置。它随程序版本交付，应该由代码所在位置决定；无需改变整个进程的工作目录。当前项目使用 ESM，可以通过 `import.meta.url` 获得当前模块的 URL，再定位资源：

```javascript
const configUrl = new URL('../config/service.json', import.meta.url);
```

这行稍后位于 `src/config.js` 中，因此 `../config/` 回到项目根目录下的配置目录。URL 的基准是**写下这行代码的模块**，不是最初入口，更不是调用它的文件。`readFile()` 可以直接接收 `file:` URL，无需自己处理路径里的空格或百分号转义，也不要简单截取 `.pathname` 充当跨平台文件路径。

下面新建 `src/config.js`，这是本章最终使用的完整实现：

```javascript
import { readFile } from 'node:fs/promises';

export async function loadConfig() {
  const configUrl = new URL('../config/service.json', import.meta.url);
  let text;
  try {
    text = await readFile(configUrl, 'utf8');
  } catch (error) {
    throw new Error(`Cannot read config/service.json (${error.code ?? 'UNKNOWN'})`);
  }

  let defaults;
  try {
    defaults = JSON.parse(text);
  } catch {
    throw new Error('config/service.json must contain valid JSON');
  }
  if (defaults === null || typeof defaults !== 'object' || Array.isArray(defaults)) {
    throw new Error('config/service.json must contain an object');
  }
  if (!Number.isInteger(defaults.port) || defaults.port < 1 || defaults.port > 65535) {
    throw new Error('config/service.json port must be an integer from 1 to 65535');
  }

  const rawPort = process.env.PORT;
  if (rawPort === undefined) return { port: defaults.port };
  if (!/^[0-9]+$/.test(rawPort)) {
    throw new Error('PORT must be decimal digits from 1 to 65535');
  }
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer from 1 to 65535');
  }
  return { port };
}
```

这里保留了两个输入边界。JSON 解析成功只说明文本合法，还要确认顶层是对象、默认端口是范围内的整数。环境变量则先校验字符串，再转换并检查范围。两条路径最终都返回 `{ port: 数字 }`，监听代码不必再次猜测输入类型。

检查顺序也表达了一个取舍：即使传入合法 `PORT`，随项目交付的默认文件仍必须存在且有效。这样遗漏配置文件的发布包会立即失败，不会在某台机器上靠环境变量侥幸运行。如果希望环境变量完整时允许缺省文件，就要重新设计加载顺序和必需条件；不能只是吞掉所有读文件错误，再回退到 `3000`，因为缺文件、没权限和内容损坏需要不同修正。

当前只在启动时读一次，所以修改文件或环境变量后需要重启。每个请求重新读配置会引入额外 I/O，也会让同一进程的行为随文件修改而改变；我们没有这样的需求。第十二章再把配置组织与启动生命周期系统化。

### 先完成启动条件，再宣布服务可用

回到 `src/server.js`。在已有 import 后加入：

```javascript
import { loadConfig } from './config.js';
```

删除原来的 `const port = 3000;`，保留 `const host = '127.0.0.1';`、Map、请求处理函数与 `createServer()`。然后把文件末尾原来的 `server.on('error', ...)` 和 `server.listen(...)` 两段整体替换为：

```javascript
async function start() {
  const { port } = await loadConfig();
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Cannot listen on ${host}:${port}: address already in use`);
    } else {
      console.error(`Server failed: ${error.code ?? 'UNKNOWN'}`);
    }
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    console.log(`EPP listening on http://${host}:${port} (pid=${process.pid})`);
  });
}

start().catch((error) => {
  console.error(`Cannot start EPP: ${error.message}`);
  process.exitCode = 1;
});
```

这份改动让成功日志具有清楚含义：默认文件可读、配置有效，而且监听已经成功。如果先监听再读配置，就可能短暂接收请求，随后才发现启动条件不成立；如果在 `listen()` 之前输出“启动成功”，就无法从日志区分真正启动与端口占用。我们把条件安排在它们应当成立的位置。

还有两条错误路径。读取和解析配置时的拒绝由 `start().catch()` 接住；端口占用等异步监听错误由 `server.on('error')` 处理。`start()` 不会等待未来所有服务事件，把它包进一个 `try/catch` 并不能代替事件监听。第二章对请求失败单独 `.catch()`，也是因为请求拥有自己的异步完成边界。

### 改变条件，核对刚才的推导

先在项目根目录启动默认端口；若此前使用过 `export PORT`，先执行 `unset PORT`：

```bash
npm start
```

应在成功监听后看到 `http://127.0.0.1:3000` 与当前 PID。停止后再运行：

```bash
PORT=3001 node src/server.js
```

应改为监听 `3001`。在另一终端用 `http://127.0.0.1:3001/captures` 完成第二章的创建、列表与详情请求，确认输入输出约定没有变化。新启动的进程仍有自己的空 Map，换端口不迁移原进程里的数据。不要继续请求旧的 `3000`，否则可能在检查另一个进程。

下面验证错误输入在监听前就被拒绝：

```bash
PORT=3001oops node src/server.js
echo $?

PORT= node src/server.js
echo $?

PORT=65536 node src/server.js
echo $?
```

前两种应输出 `PORT must be decimal digits from 1 to 65535`，最后一种应输出范围错误；退出码均为 `1`，且不出现成功监听日志。空值不会偷偷回退到默认端口，这正是 3.1 选择的规则。

最后，从 `src/` 启动同一个服务：

```bash
(
  cd src
  PORT=3001 node server.js
)
```

这次应成功读取项目默认文件，再按环境变量选择端口。停止后回到外层终端，工作目录仍然是项目根目录。需要只检查配置、不占用端口时，也可以在根目录执行：

```bash
node --input-type=module -e 'import { loadConfig } from "./src/config.js"; console.log(await loadConfig());'
```

这里 `-e` 中的相对 import 仍从当前执行位置解析，因而命令明确要求在根目录运行；模块内部的资源定位则已经固定为相对于 `config.js`。修正一种相对路径，不代表所有相对路径都变成同一套规则。

特别留意 npm：npm 脚本通常在包根目录执行。所以从包内子目录运行 `npm start`，可能仍然成功，无法暴露直接 `node` 启动时的 cwd 问题。npm 的便利改变了启动上下文，并没有让 `readFile('./...')` 自动相对于源码。定位故障时应比较真实启动命令、cwd 和文件基准，不能只比较“执行的是同一个 JS 文件”。

### 把路径的选择用到另一种需求

默认配置的问题解决以后，再看一个约束不同的命令：它接受操作者提供的输入文件名，并把导出结果放在执行命令的位置。这里用户希望从自己的数据目录操作，程序却可能安装在另一个目录。若把输入和输出全部改成模块相对路径，就会修好默认配置、同时弄错用户文件。

位置由谁决定，才是选择基准的依据。随程序交付的资源跟着模块；操作者传入的相对文件名按命令约定从 cwd 解析；部署配置还可以指定绝对目录。绝对路径本身没有问题，问题在于是否把某一台机器的位置未经配置写进了通用源码。

新建 `examples/path-report.js`，先只输出解析结果，不读写用户文件：

```javascript
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const input = process.argv[2] ?? './input.json';
console.log(JSON.stringify({
  cwd: process.cwd(),
  bundledConfig: fileURLToPath(new URL('../config/service.json', import.meta.url)),
  userInput: resolve(process.cwd(), input),
  outputDirectory: resolve(process.cwd(), './exports'),
}, null, 2));
```

`resolve()` 把路径解析成绝对形式；参数本来就是绝对路径时，就以它为准。这个计算不检查目标是否存在，也不赋予访问权限。`fileURLToPath()` 则把文件 URL 正确转换成当前平台路径，处理空格编码等细节，而不是直接截取 URL 的字符串。

从根目录与 `src/` 分别执行：

```bash
node examples/path-report.js ./input.json
(
  cd src
  node ../examples/path-report.js ./input.json
)
```

先预测三个输出，再对照结果：`bundledConfig` 应始终指向同一份项目配置；`userInput` 应分别指向项目根目录与 `src/` 中的 `input.json`；`outputDirectory` 也随操作者的目录变化。这里两次调用选择了不同的输入，符合这条命令的约定。如果操作者想从两个目录读取同一文件，就应传入指向同一目标的路径，而不是要求程序偷偷改变解释规则。

再考虑打包交付：模块相对定位只能稳定地找到“相对当前产物”的位置。如果把源码编译到 `dist/`，却没把配置放到约定的相对位置，文件仍然会缺失。第五章会结合编译产物继续处理交付结构。对于来自不可信请求的文件名，还要另外限定可访问范围并处理路径穿越；路径规范化不等于授权，这部分随文件业务展开。

这样再面对“同一份代码换了启动方式就失败”，可以按阶段缩小范围。先确认实际 Node 与入口，再确认 cwd、有效配置来源和解析出的目标；路径正确后继续判断运行身份、目录与文件权限；文件读到后再判断内容结构。只有已经通过这些条件，才轮到监听端口与处理请求。每一层有自己的证据，也有不同的修正位置。

回到 EPP，本章建立了经过校验的启动配置和明确的资源定位，同时解释了进程如何获得输入、持有状态与结束运行。第四章将保持这些运行条件不变，继续分析服务存活期间的执行：一个请求正在等待 I/O 时，为什么另一个请求可以继续；正在占用 JavaScript 执行的计算，又为什么会改变这个结果。

本章完成代码分支：`part-01/chapter-03`，从第二章状态继续演进。`config/service.json`、`src/config.js` 和本章 `examples/` 文件随代码保存；依赖清单与锁文件没有新增第三方依赖。

时间参考（估算）：只阅读约 40～45 分钟；跟做另加约 30～40 分钟，边读边做合计约 70～85 分钟。按正文约 9100 个汉字、约 170 行随文代码与命令估算，阅读包含理解代码；跟做分别考虑建立与修改文件约 8～10 分钟、环境与通道观察约 7～10 分钟、进程及退出观察约 5～7 分钟、路径变式与接口回查约 10～13 分钟。不重复计算阅读，不含首次安装环境、逐字手敲全部代码或额外排错。附录按需查阅，支线时间单列。

## 本章支线

正文沿记录服务建立启动与运行的判断依据。下面三条支线进一步展开这些判断依赖的机制，并通过不同条件下的结果把它们接回实践：

- [3A：输出去了哪里——文件描述符、重定向与管道](side-01-stdio-and-pipes.md)：从通道关联推导重定向顺序、EOF、诊断与数据分离，以及管道中的失败传播。
- [3B：文件明明在那里，为什么读不到——路径、权限与句柄](side-02-files-permissions-handles.md)：沿目录查找与访问检查解释权限，用成功和异常路径区分句柄释放、文件删除与写入结果。
- [3C：收到停止信号之后，程序为什么还活着](side-03-process-lifetime-signals.md)：用有重叠工作的定时任务拆开停止入口、等待已接受工作与释放资源，再迁回 HTTP 服务。

三条支线依次衔接标准通道、文件资源与进程收尾；它们承担对应机制的完整展开，各自列出阅读和操作时间。

## 附录：本章必要技术点速查

以下对应项目固定的 Node.js `24.22.1`。

### 进程与输入输出

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| `process.pid`、`process.version`、`process.execPath` | 识别进程和实际 Node 运行环境 | PID 可重用；分享路径前检查个人信息。 |
| `process.cwd()`、`process.env.PORT` | 读取启动位置与环境输入 | cwd 不等于模块目录；环境变量按字符串解释，缺失与空值分开处理。 |
| `process.argv`、`process.execArgv` | 区分应用参数与 Node 参数 | 应用参数通常从 `argv.slice(2)` 开始；传参不等于实现解析。 |
| `process.stdin`、`stdout`、`stderr`、`isTTY` | 观察输入输出连接到终端、文件或管道 | 通道由启动者连接；stderr 内容不会自动改变退出码。 |
| `setEncoding('utf8')`、异步迭代、`stdout.write()` | 读取小段标准输入并原样转发 | 数据块不等于行；大型转发还要处理输出背压。 |
| `process.exitCode`、`process.exit()` | 区分自然退出结果与立即终止 | 设置退出码不释放监听资源；立即退出可能丢失未完成输出。 |
| `SIGINT`、`SIGTERM`、`process.on()` | 理解终端停止与进程信号 | 注册处理器后应用承担相应收尾责任；`SIGKILL` 不能捕获。 |
| `setTimeout()`、定时器 `.unref()` | 对照资源引用与进程寿命 | `unref()` 不取消定时器，但进程不一定等它执行。 |

官方查阅：[Process](https://nodejs.org/docs/v24.22.1/api/process.html)、[Timers](https://nodejs.org/docs/v24.22.1/api/timers.html)、[Console](https://nodejs.org/docs/v24.22.1/api/console.html)、[Stream](https://nodejs.org/docs/v24.22.1/api/stream.html)。

### 文件、配置与运行环境

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| `readFile(path, 'utf8')` | 读取小文件内容 | 相对字符串基于 cwd；也接受 `file:` URL；整文件进入内存。 |
| `writeFile()`、`flag: 'wx'` | 新建独立演示文件 | `wx` 拒绝覆盖现有文件；等待完成后再读，不等于建立业务持久化保证。 |
| `mkdtemp()`、`tmpdir()`、`join()` | 创建临时演示目录并拼接路径 | 临时目录可能被清理；路径拼接不承担权限校验。 |
| `import.meta.url`、`new URL(relative, base)` | 定位随模块交付的资源 | 基准是当前模块；发布时仍需包含资源文件。 |
| `path.resolve()`、`fileURLToPath()` | 区分调用者路径与模块资源，并将文件 URL 转为平台路径 | 路径计算不检查存在性、不授予权限；不要直接截取 URL 的 pathname。 |
| `process.chdir()` | 比较改变整个 cwd 与只定位一个资源的影响 | 会改变此后 cwd 相对操作，已打开的通道不会随之迁移。 |
| `JSON.parse()`、`Number()`、`Number.isInteger()` | 将配置文本转为受约束的数值 | 文本可解析不代表结构合法；端口还需范围校验。 |
| `ENOENT`、`EACCES`、`EPERM`、`EEXIST` | 分辨路径不存在、访问受限及目标已存在 | 依据发生阶段定位；不要统一吞掉错误或提权重试。 |
| `globalThis`、`fetch`、`URL` | 比较浏览器与 Node 提供的 API | Node 的 Web API 不带来 DOM、页面来源或浏览器会话。 |
| `loadConfig()` | 本项目自己的启动函数 | 默认文件必须有效，`PORT` 可覆盖；不是 Node 内置 API，也不热更新。 |

官方查阅：[File system](https://nodejs.org/docs/v24.22.1/api/fs.html)、[OS](https://nodejs.org/docs/v24.22.1/api/os.html)、[Path](https://nodejs.org/docs/v24.22.1/api/path.html)、[URL](https://nodejs.org/docs/v24.22.1/api/url.html)、[ESM](https://nodejs.org/docs/v24.22.1/api/esm.html)、[全局对象](https://nodejs.org/docs/v24.22.1/api/globals.html)、[Undici 对 CORS 的说明](https://github.com/nodejs/undici#cors)。

### 命令与配置入口

| 命令或配置 | 本章用途与注意点 |
| --- | --- |
| `PORT=3001 node src/server.js` | 给单次命令设置环境输入；本章仅监听 `127.0.0.1`。 |
| `export PORT=3001`、`unset PORT` | 设置或移除当前 shell 后续子进程继承的变量；不改变已启动进程。 |
| `node --input-type=module -e '...'` | 用 ESM 执行命令行代码；不是普通 `.js` 文件必需的参数。 |
| `node --no-warnings examples/runtime-context.js --label demo` | 区分 Node 选项与应用参数；仅用于实验，不建议隐藏日常警告。 |
| `>`、`>>`、`2>`、管道 `\|` | 分别覆盖输出、追加输出、重定向 stderr、连接进程通道；由 shell 解释。 |
| `echo $?` | 紧接上一条命令读取退出状态；中间别插入其他命令。 |
| `Ctrl+C`、`kill -TERM PID` | 分别向前台进程组发中断信号、向确认归属的进程发终止信号；本章按 POSIX 环境解释。 |
| `( cd src; node server.js )` | 在子 shell 改变目录，退出后保留外层目录；单行写法对应正文多行实验。 |
| `npm start -- ...` | 将参数传给脚本；不会替应用解析选项。npm 脚本在包根目录执行。 |
| `config/service.json` | 项目自带的默认端口；合法 `PORT` 覆盖值，但不免除文件有效性要求。 |

官方查阅：[Node 命令行](https://nodejs.org/docs/v24.22.1/api/cli.html)、[npm scripts](https://docs.npmjs.com/cli/v10/using-npm/scripts)、[Bash 环境与命令执行](https://www.gnu.org/software/bash/manual/html_node/Executing-Commands.html)、[Bash 重定向](https://www.gnu.org/software/bash/manual/html_node/Redirections.html)、[Zsh 命令执行](https://zsh.sourceforge.io/Doc/Release/Execution.html)。

[上一章：先启动一个最小记录服务](../chapter-02-minimal-service/chapter.md) · [返回第一篇](../README.md) · [返回全书目录](../../README.md)
