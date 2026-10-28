# 支线 3B：文件明明在那里，为什么读不到——路径、权限与句柄

第三章修正了配置文件的定位方式，但“路径正确”只是文件访问的一项条件。换个运行账号以后，同一份文件可能无法读取；一个不能写入的文件，也可能被删除；打开文件后抛出异常，已经写进去的内容不会自动消失。只根据文件是否存在判断代码该不该成功，解释不了这些现象。

先把一次读取拆开：程序给出路径，操作系统沿目录查找目标，依据访问身份与请求的操作检查权限，成功后建立打开文件的关联，程序才通过它读写，最后关闭。这条顺序也给出了排障依据：名字解析、访问许可、打开方式和资源释放，应分别判断。

## 路径描述名字，目录决定怎样找到名字

假设程序要读 `config/service.json`。它要先定位作为起点的目录，再在其中找到 `config`，再从 `config` 找到 `service.json`。如果相对路径基准错了，查找从一开始就走错了；如果中间目录不允许穿过，目标文件即使存在，也无法沿这条路径打开。

在 macOS、Linux 等 POSIX 环境中，常见权限位分为所有者、所属组和其他用户三组，每组包含读 `r`、写 `w`、执行／搜索 `x`。基本模式位检查先根据进程的有效身份决定适用哪一组，再检查所需权限；不能把三组中各处出现的许可拼起来使用。比如进程是所有者，所有者组没有读权限，并不会因为“其他用户有读权限”就自动改用那一组。

普通文件与目录对同一字母的解释不同。文件装的是内容，目录维护的是名字及其关联，因此操作需要的许可也不同：

| 权限 | 对普通文件的含义 | 对目录的含义 |
| --- | --- | --- |
| `r` | 读取内容 | 列出目录中的名字 |
| `w` | 修改内容 | 修改目录项，例如新建、移除名字；实际操作通常还需要 `x` |
| `x` | 允许把它作为程序执行 | 沿已知名字查找子项、继续路径解析 |

这张表可以推导出两个容易混淆的情况。知道文件名时，目录有 `x`、文件有 `r`，即使目录不允许列出名字，也可能读取该文件。反过来，目录有 `r` 却没有 `x`，能够看到名字也不代表能打开里面的文件。目录的“可读”和路径的“可通行”不是同一件事。

对一条更长的路径，这个条件要沿每一级目录成立。只对最终文件执行 `chmod`，不能修好中间目录缺少搜索权限的问题。遇到错误时，应沿已经确定的绝对路径逐级检查，而不是不断扩大最后那个文件的权限。

`node src/server.js` 还提供了一个有用的区别：真正被操作系统执行的是 Node 可执行文件，`server.js` 由 Node 作为源码读取。这个启动方式需要源码可读，并不要求给 `server.js` 添加执行位。直接把脚本当命令执行则涉及另一套入口条件，不能把两种启动方式混为一谈。

实际排障时，需要把推导对应到身份与权限信息。完成正文中的配置文件后，可以在项目根目录查看：

```bash
id
ls -ld . config
ls -l config/service.json
```

`id` 显示当前命令使用的账号与组；`ls -ld` 查看目录自身，避免 `ls` 默认列出目录内容；`ls -l` 展示文件的权限、所有者和组等信息。比如权限部分为 `drwxr-x---`，开头的 `d` 表示目录，后面三组依次是所有者 `rwx`、组 `r-x`、其他用户 `---`。把进程身份放进这三组，才能判断路径查找与读取是否具备条件。

如果失败的是另一种方式启动的服务，当前终端的 `id` 不能证明那个服务也使用相同账号。可以根据已确认的服务 PID，用 `ps -o pid=,user=,comm= -p 实际PID` 先核对进程及运行用户，再检查其组和额外访问限制。不要拿编辑器能够打开文件作为服务有权限的证据。完整路径还需要逐级检查祖先目录；只看这里的项目目录和 `config`，不能排除更上层目录阻止访问。

## 用独立目录验证权限，而不改项目目录

下面只改变程序自己创建的临时目录。用普通账号在 macOS／Linux 的常规本机文件系统运行；WSL 读者使用 Linux 文件系统中的目录。这是在观察基本模式位，不是在模拟所有平台的访问控制。管理员权限、ACL、沙箱及挂载方式可能改变结果，遇到差异要把这些条件一起纳入判断，不能据此直接放宽项目权限。

新建 `examples/file-permissions.js`：

```javascript
import { chmod, mkdtemp, readFile, readdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'epp-permissions-'));
const filename = join(directory, 'note.txt');

async function observe(label, action) {
  try {
    await action();
    console.log(`${label}: OK`);
  } catch (error) {
    console.log(`${label}: ${error.code ?? error.name}`);
  }
}

try {
  await writeFile(filename, 'example\n', { flag: 'wx', mode: 0o600 });
  await chmod(directory, 0o300);
  await observe('list names without directory r', () => readdir(directory));
  await observe('read known name with directory x', () => readFile(filename));

  await chmod(directory, 0o600);
  await observe('read without directory x', () => readFile(filename));

  await chmod(directory, 0o500);
  await observe('read without directory w', () => readFile(filename));
  await observe('create without directory w', () => writeFile(join(directory, 'new.txt'), 'new', { flag: 'wx' }));

  await chmod(directory, 0o700);
  await chmod(filename, 0o400);
  await observe('write read-only file', () => writeFile(filename, 'changed'));
  await observe('unlink read-only file', () => unlink(filename));
} finally {
  await chmod(directory, 0o700);
  await rm(directory, { recursive: true, force: true });
}
```

`0o` 表示八进制字面量。每一位由读 4、写 2、执行／搜索 1 相加得到，因此 `0o700` 给所有者 `rwx`，`0o500` 给所有者 `r-x`，后两组都是零。创建时的 `mode` 还受进程 `umask` 影响；示例随后使用 `chmod()` 明确调整需要观察的目录权限。生产配置不能只根据数字猜测最终权限，应检查实际身份与实际文件属性。

运行 `node examples/file-permissions.js` 之前，先按目录表推导结果。在上述普通权限条件下，应依次看到：

```text
list names without directory r: EACCES
read known name with directory x: OK
read without directory x: EACCES
read without directory w: OK
create without directory w: EACCES
write read-only file: EACCES
unlink read-only file: OK
```

最值得解释的是最后一行。修改文件内容需要文件写权限，删除一个名字主要修改的是父目录的目录项；示例已恢复父目录的写与搜索权限，因此只读文件仍可被移除。这里没有 sticky bit 等额外限制，也没有其他访问控制。不能把“只读文件”理解成“这个名字无法删除”。

`finally` 先恢复目录权限再删除演示目录，因为清理本身也要满足访问条件。它只清理由本次 `mkdtemp()` 创建的范围。`force: true` 主要避免目标不存在时的错误，不是绕过权限的管理员开关。

回到部署后的 EPP，如果服务账号需要读配置而不该修改配置，一个合理方向是：允许它穿过配置目录、读取配置文件，同时不给它写文件或替换目录项的权限。只把文件改成只读、却让服务账号能够任意改写其父目录，不能完整表达这个目标。创建日志或导出文件则是另一种需求，必须给相应输出目录必要的创建权限。读配置与写输出应分别设计位置和访问范围。

## 打开方式也参与决定结果

权限允许写入，不意味着任何打开方式都会成功。例如，`writeFile()` 默认可能截断已有文件，而 `wx` 要求新建且目标不存在。第二章输入校验决定什么数据允许进入 Map；这里的打开方式决定如何对待已经存在的磁盘对象。

如果需求是“只创建新导出，不能覆盖旧结果”，先 `access()` 检查不存在再写仍有缺口：两步之间，另一个进程可以创建同名文件。应该让实际创建操作包含“不存在”这一条件，例如使用 `wx`，并处理 `EEXIST`。这只保证这次排他创建的语义，不保证整个后续写入具有事务性，也不处理全部文件系统的差异。

常见错误码因此不能一律解释成“文件找不到”：`ENOENT` 指向不存在的路径组成部分等情况；`EACCES` 常见于权限检查；`EEXIST` 可以来自我们主动选择的排他创建；`ENOTDIR` 说明路径中本应是目录的部分不是目录。`EPERM` 则可能来自更进一步的操作限制。错误码需要结合实际操作和路径分析，而不能只匹配一条固定修复命令。

## 谁打开资源，谁负责关闭

`readFile(path)` 和 `writeFile(path, data)` 把打开、读写与关闭封装起来，适合本章的小文件。如果要在同一次打开中连续操作，可以使用 `open()` 获得 `FileHandle`。这时我们主动持有打开资源，也接过了关闭责任。

新建 `examples/file-handle.js`：

```javascript
import { mkdtemp, open, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directory = await mkdtemp(join(tmpdir(), 'epp-handle-'));
const filename = join(directory, 'note.txt');

try {
  const handle = await open(filename, 'wx', 0o600);
  try {
    await handle.writeFile('saved before close\n', 'utf8');
    if (process.argv.includes('--fail')) throw new Error('example failure after write');
  } finally {
    await handle.close();
    console.log('handle closed');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  try {
    console.log((await readFile(filename, 'utf8')).trimEnd());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
```

这里不是为了教 `try/finally` 的语法，而是要确定它包住哪一段资源所有权。`open()` 成功以后才有需要关闭的句柄，所以内部 `try/finally` 从这里开始；后续成功或抛错，都应经过关闭。若把 `close()` 只放在正常路径末尾，异常就会跳过它。长时间运行的服务反复遗漏关闭，可能耗尽文件描述符，而不是等到程序退出才产生影响。

分别运行：

```bash
node examples/file-handle.js
echo $?
node examples/file-handle.js --fail
echo $?
```

正常路径应退出 0，失败路径应退出 1；两次都应看到 `handle closed`，而且关闭后仍能重新读取 `saved before close`。失败路径的错误说明走 stderr，和 stdout 的显示次序不要作为判定条件。

这个结果揭示了三个不同的边界：关闭句柄释放访问资源，文件内容继续存在；抛异常改变控制流，不撤销已经完成的写入；之后显式删除演示目录才移除名字和内容的存放入口。原子替换、同步落盘和数据库事务分别处理更进一步的问题，不能从 `finally` 里调用了 `close()` 推导出这些保证。

程序异常退出时操作系统会回收进程持有的描述符，但这也不能代替正常路径的资源管理：服务可能持续运行很久。另一方面，普通文件描述符保持打开，并不一定像监听端口那样让 Node 事件循环继续存活。“仍占用资源”和“阻止进程自然退出”是两个判断，进程生命周期还需要结合具体资源的运行时行为分析。

现在换一个实际条件：导出文件打开成功，写到一半失败。正确处理至少包括释放自己持有的句柄、把失败交给调用者，以及按导出约定决定是否保留或清理半成品。只记录错误然后返回成功不成立；只关闭句柄也不能把半成品变成完整结果。回到 EPP 默认配置的读取，读取失败意味着启动条件不成立，所以应停止启动并保留明确原因，而不是临时创建一个空配置文件来掩盖问题。

阅读参考（估算）：约 18～22 分钟；运行权限与句柄的成功、失败路径并核对结果另加约 6～10 分钟。依据约 2800 个汉字、约 80 行代码与命令及权限对照估算；操作时间不重复计算阅读，附录按需查阅。

## 附录：本支线必要技术点速查

| 名称 | 本文用途 | 必要注意点 |
| --- | --- | --- |
| 所有者／组／其他用户、`rwx` | 根据身份与操作分析基本权限 | 目录与文件含义不同；还需考虑 ACL、沙箱、挂载等条件。 |
| `0o700`、`0o600`、`0o400` | 表达演示权限 | 八进制每位由 4、2、1 组成；创建权限受 `umask` 影响。 |
| `chmod()`、`readdir()`、`unlink()` | 对照搜索、列名与删除 | 删除名字主要涉及父目录权限；本文只修改新建临时目录。 |
| `id`、`ls -ld`、`ls -l`、`ps -o` | 把运行身份、目录与文件属性对应起来 | 当前终端账号不代表服务账号；按已确认的 PID 查询。 |
| `open(path, 'wx', mode)`、`FileHandle` | 显式获得打开资源 | 打开成功后承担关闭责任；`wx` 不等于事务。 |
| `handle.writeFile()`、`handle.close()` | 写入并释放句柄 | 关闭不删除内容；给 `readFile`／`writeFile` 传句柄时也应自行管理其关闭。 |
| `finally` | 保证普通控制流的资源收尾 | 不回滚写入，也不能在 SIGKILL 等情况下执行。 |
| `EACCES`、`ENOENT`、`EEXIST`、`ENOTDIR` | 区分访问阶段与失败原因 | 结合身份、路径和打开方式判断，不统一提权重试。 |
| `rm()`、`recursive`、`force` | 清理本次演示目录 | `force` 不提供越过权限的能力，删除范围必须明确。 |

官方查阅：[Node 文件系统](https://nodejs.org/docs/v24.22.1/api/fs.html)、[Node 系统错误](https://nodejs.org/docs/v24.22.1/api/errors.html#common-system-errors)、[GNU 权限位含义](https://www.gnu.org/s/coreutils/manual/html_node/Mode-Structure.html)、[Linux 路径解析与搜索权限](https://man7.org/linux/man-pages/man7/path_resolution.7.html)、[POSIX 路径解析](https://pubs.opengroup.org/onlinepubs/9799919799/basedefs/V1_chap04.html#tag_04_16)。

[返回第三章](chapter.md) · [返回第一篇](../README.md)
