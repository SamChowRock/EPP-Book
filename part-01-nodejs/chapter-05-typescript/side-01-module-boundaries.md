# 支线 5A：模块找到之后，拿到的到底是什么

第五章已经让服务的 `.ts` 源码与 `.js` 产物对齐。但如果依赖来自另一个包，只知道「文件在哪里」还不够。文件按哪套规则执行、包允许访问哪个入口、入口实际导出了什么，是不同的问题。下面用一组没有 HTTP 监听的小文件把这几层拆开，避免靠反复改 `import` 形式碰运气。

使用第五章的代码分支 `part-01/chapter-05` 与 Node.js `24.22.1`。命令从项目根目录执行。这些文件放在 `examples/modules/`，不参与服务构建。

**时间参考（估算）**：约 2200 个汉字与 40 余行代码／命令，阅读约 12～15 分钟，操作另加约 8～12 分钟。不计入第五章主线时间。

## 一个包作用域如何建立

在 `examples/modules/package.json` 中写入：

```json
{
  "name": "epp-module-demo",
  "private": true,
  "type": "module",
  "exports": { ".": "./entry.js" }
}
```

这个目录里的 `package.json` 建立了一层更近的包作用域。普通 `.js` 文件按这里的 `type` 分类，不必继续借用外层项目的配置。`name` 为后面的包自引用提供名字；`exports` 声明默认入口；`private` 防止意外将这个演示包发布到 npm，不负责保护文件内容。

新增 `entry.js`：

```javascript
export const label = 'public entry';
```

再新增 `internal.js`：

```javascript
export const detail = 'implementation detail';
```

两份文件都存在，但公开入口只有前者。如果把「磁盘中存在」直接等同于「包接口允许访问」，后面就会误判错误。公开入口是包作者对调用方的约定，内部文件可以调整，而调用方不应依赖未承诺的布局。

这里使用包自引用：处于这个包内部的模块，可以按包名经过自己的 `exports` 找到自己。无需 `npm link`、发布或复制到 `node_modules`，也不是全局安装了一个同名包。把消费者移到包作用域之外后，这个条件就不再成立；外部消费者需要正常的包安装或其他明确的依赖关系。

## CommonJS 导出的对象怎样到达 ESM

新增 `legacy.cjs`：

```javascript
module.exports = { prefix: 'CJS' };
```

`.cjs` 明确选择 CommonJS，即使旁边的包声明是 ESM，也按 CommonJS 执行。执行到这一行时，将导出的值设为一个对象。ESM 消费者可以使用默认导入接住它，再访问对象属性。

新增 `consumer.js`：

```javascript
import legacy from './legacy.cjs';
import { label } from 'epp-module-demo';

console.log(legacy.prefix, label);
async function runMode() {
  const mode = process.argv[2];
  if (mode === 'private') await import('epp-module-demo/internal.js');
  if (mode === 'relative') console.log(await import('./internal.js'));
  if (mode === 'extensionless') await import('./entry');
  if (mode === 'require') {
    // Intentionally invalid in ESM: the experiment should throw.
    require('./legacy.cjs');
  }
}

runMode().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

先执行：

```bash
node examples/modules/consumer.js
```

应输出 `CJS public entry`。第一条导入用相对路径加载一个 CommonJS 文件，默认导入得到其 `module.exports` 的值；第二条导入使用包自引用，经 `exports` 找到 `entry.js`，再取它明确声明的 ESM 命名导出 `label`。

不要把两条成功路径混成「对象上的属性都能命名导入」。Node 为部分 CommonJS 模块提供可推断的命名导出兼容，但那依赖静态分析，不能代替包的接口约定。默认导入 CommonJS 的 `module.exports`，再按它自己的 API 使用属性，是这个小例子中更明确的选择。如果导出值是函数，默认导入接住的就会是那个函数，而不是自动变成一个含有所有可能属性的命名空间。

ESM 的命名导入也不是运行时的任意对象解构。若在消费者里把 `label` 暂时改成 `missing`，模块连接阶段就会发现目标没有这个命名导出，消费者自己的日志还没有执行便会失败。恢复原来的导入再继续。错误发生在顶层代码执行之前，意味着把业务 `console.log()` 加到文件末尾也无法帮助观察那个不存在的导出。

## 文件存在，包子路径却被拒绝

执行：

```bash
node examples/modules/consumer.js private
echo $?
```

应先打印公共入口结果，再出现 `ERR_PACKAGE_PATH_NOT_EXPORTED`，退出码非零。这里在 `runMode()` 内使用动态 `import()`，拒绝由末尾的 `catch` 报告并设置退出码，所以前面的日志先有机会执行；错误含义是 `./internal.js` 没有被这个包的 `exports` 声明为入口。

现在执行：

```bash
node examples/modules/consumer.js relative
```

这次可以读到 `detail`。相对路径没有请求「包名下的公开子路径」，而是直接定位文件。两种访问结果不同，说明 `exports` 限制的是包入口解析，不是操作系统文件访问权限，更不是隐藏秘密的手段。需要保护的数据不能依赖「没有导出」来获得安全性。

如果新需求是「外部消费者也应当使用这项能力」，有两种合理方式。它属于主接口时，可以在 `entry.js` 显式再导出；它是一项需要独立入口的能力时，可以在 `exports` 增加命名子路径，例如：

```json
{
  ".": "./entry.js",
  "./detail": "./internal.js"
}
```

这是替换 `exports` 对象的内容，不是整个 `package.json`。对应消费者应改用 `epp-module-demo/detail`，把内部文件名与公开名称分开。不要要求调用方走相对路径钻入某个安装目录：那会把依赖的内部布局变成自己的隐含契约。演示完恢复最初的单入口配置，保留失败模式以便对照。

本章只建立单入口与简单子路径的判断。面向多个客户端的条件导出、类型入口与双格式发布会改变消费者的约束，第八十八章再围绕共享契约展开；不能把当前单包的实验等同于已经设计好一个跨端库。

## 缺扩展名与缺入口，应该怎样区分

执行：

```bash
node examples/modules/consumer.js extensionless
```

这次请求的是 `./entry`，它不经过包名的 `exports`。磁盘里只有 `entry.js`，原生 ESM 不替这个相对路径补齐扩展名，所以会得到模块找不到的错误。增加包的公开子路径无法修复它；需要改为实际可加载的相对路径 `./entry.js`。

如果把某个相对导入改成目录，期待 Node 自动尝试 `index.js`，也属于把另一套解析习惯带到了 ESM。某些 CommonJS 或构建工具场景下可行的搜索行为，不应被默认推广到原生 ESM。

最后执行：

```bash
node examples/modules/consumer.js require
```

这里的问题又变了：消费者处于 ESM 作用域，没有 CommonJS 包装器提供的裸 `require` 变量。`legacy.cjs` 已经存在，最前面的默认导入也证明它可加载，因此「重新安装依赖」与这次失败无关。

如果只是加载本例文件，保留原来的 ESM 默认导入即可。确实需要调用 CommonJS 解析或同步加载接口时，可以在 ESM 中显式创建它：

```javascript
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const legacy = require('./legacy.cjs');
console.log(legacy.prefix);
```

这段是另一种消费者实现，与原文件里的同名 `legacy` 导入二选一，不要直接叠加。`createRequire(import.meta.url)` 把加载基准放在当前模块；它不会把整个文件变成 CommonJS，也不会赋予 ESM 代码一个通用的 `__dirname`。路径定位仍应沿第三章的模块 URL 方式理解。

## 改变条件以后怎样独立判断

假设一个新依赖提供一个 CommonJS 函数，而你的 ESM 服务需要在请求中调用它。先读包的公开入口和导出约定，确认默认导入得到函数还是对象，再调用对应接口。若检查器接受了命名导入，运行时却说没有该导出，应对照实际加载的 JavaScript 与声明；声明描述、构建转换和实际包版本可能不一致。加 `as any` 只能放松检查，不能增加一个运行时导出。

再假设代码在仓库根目录成功，复制到独立目录后失败。先看报错路径是否进入了父目录的 `node_modules`，确认目标目录是否具备运行依赖；再看它是不是失去了决定模块分类的 `package.json`。如果报的是包子路径未导出，则转向公开接口，不继续用 cwd 猜测。第五章的独立运行目录正是在主动减少这些偶然条件。

回到 EPP，目前业务模块都由自己控制，保持 ESM、完整相对路径与明确的类型导入即可。引入 Nest 及其他包以后，新的导入问题仍可沿同一顺序判断：哪个运行时加载、什么文件类型、哪种标识符、哪个公开入口、得到什么导出。这样才能从错误信息走向修正原因，而不是得到一份只在自己的开发入口里成立的写法。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| 最近的 `package.json` | 建立包作用域和 `.js` 分类 | 嵌套包可以覆盖外层规则 |
| `.cjs`、`module.exports` | 提供一个 CommonJS 值 | 扩展名决定解释方式，不自动改写源代码 |
| ESM 默认导入 | 取得本例 CommonJS 导出对象 | 不推断所有 CommonJS 属性都能命名导入 |
| ESM 命名导出 | 让消费者明确请求 `label` | 不存在的静态导出可在消费者执行前失败 |
| 包自引用 | 无需发布即可观察 `exports` | 要在相应包作用域内，并具有对应入口声明 |
| `exports` | 划定公开入口和子路径 | 不提供文件安全隔离；相对路径与包子路径不同 |
| `import()` | 在指定分支观察加载失败 | 返回 Promise，本例集中接住拒绝并设置失败退出码 |
| `createRequire()` | 在 ESM 中明确建立 CommonJS 加载入口 | 解析基准来自传入模块位置，不切换整个文件的模块系统 |

官方查阅：[Node 24 Packages](https://nodejs.org/docs/v24.22.1/api/packages.html)、[ESM 与互操作](https://nodejs.org/docs/v24.22.1/api/esm.html)、[CommonJS](https://nodejs.org/docs/v24.22.1/api/modules.html)、[createRequire](https://nodejs.org/docs/v24.22.1/api/module.html#modulecreaterequirefilename)。

[返回第五章](chapter.md) · [返回第一篇](../README.md)
