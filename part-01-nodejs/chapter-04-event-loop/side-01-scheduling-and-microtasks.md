# 支线 4A：await 之后轮到谁——微任务、nextTick 与事件循环阶段

正文用 `await setImmediate()` 给其他请求留下执行机会，同时指出 `await Promise.resolve()` 不能起到相同作用。要能独立选择写法，就还需要弄清“当前函数暂停”与“事件循环推进”之间隔着什么。

这里不从背诵阶段名称开始。先考虑一个具体目标：计算分成多段后，希望在两段之间处理已经到达的 socket 数据。要实现这个目标，仅从当前函数返回还不够；如果运行时接下来优先处理的一批续体不断产生更多续体，I/O 回调仍然轮不到。我们要追踪的，正是这些工作放在哪里、什么时候有机会取出来。

## 从当前调用栈离开，只完成了第一步

同步调用具有连续性。一个回调开始后，里面的普通表达式、循环、函数调用会按程序逻辑继续执行，其他普通 JavaScript 回调不会抢占它。操作系统可以调度线程，垃圾回收等运行时活动也会影响时间，但这不意味着另一个请求处理函数能任意插进当前语句之间。

遇到 `await`，等待它的函数暂停后续执行，调用方先得到 Promise。等待对象完成时，后续代码被安排为 Promise 的续体；这不是在原调用栈中立刻接着执行。即使 `await` 的对象已经完成，也仍会经过异步续体调度。

问题在于，这个续体通常属于微任务。`Promise.then()` 注册的完成处理和 `queueMicrotask()` 的回调使用同一类微任务队列。清理微任务时，新加入的微任务也会被继续处理；如果一个续体不断安排下一个续体，就可能让这一轮清理一直延续，延迟后面的 I/O 调度。

Node 还提供 `process.nextTick()` 的专门队列。它的名字容易让人以为“下一轮事件循环再运行”，实际并不是这样的让出手段。在常见的原生事件回调返回到 Node 的边界，nextTick 队列会先于普通微任务处理；不断递归 nextTick 同样会阻止事件循环向前推进。两者都适合小段的时序协调，不适合把长计算隐藏成许多看似异步的片段。

这里不能再推导出“任何时候 nextTick 都先于 Promise”。当前代码是从什么上下文进入的，也影响接下来首先处理哪个队列。我们的项目是 ESM，这个区别马上就能看到。

## 同一程序里对照顶层与 I/O 回调

新建 `examples/scheduling-order.js`，完整内容如下：

```javascript
import { readFile } from 'node:fs';
import { performance } from 'node:perf_hooks';

console.log('module start');
process.nextTick(() => console.log('top nextTick'));
queueMicrotask(() => console.log('top microtask'));
Promise.resolve().then(() => console.log('top promise'));
console.log('module end');

readFile(new URL('../config/service.json', import.meta.url), (error) => {
  if (error) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  console.log('I/O callback');
  process.nextTick(() => console.log('I/O nextTick'));
  queueMicrotask(() => console.log('I/O microtask'));
  Promise.resolve().then(() => console.log('I/O promise'));
  setTimeout(() => console.log('I/O timeout'), 0);
  setImmediate(() => console.log('I/O immediate'));
});

// A finite chain lets us observe starvation without leaving an infinite loop.
if (process.argv.includes('--starve')) {
  const start = performance.now();
  setTimeout(() => console.log(`probe after ${Math.round(performance.now() - start)} ms`), 0);
  function again() {
    if (performance.now() - start < 300) queueMicrotask(again);
  }
  queueMicrotask(again);
}
```

先不要加参数，运行：

```bash
node examples/scheduling-order.js
```

在当前 ESM 文件中，先看到同步的 `module start`、`module end`；随后顶层的 `top microtask`、`top promise` 先于 `top nextTick`。两种微任务按这里的入队顺序执行。ESM 模块求值已经处在异步加载与微任务处理的上下文中，所以不能直接套用“普通回调返回以后先清空 nextTick”的口令。

等文件读取完成，`I/O callback` 是另一个进入 JavaScript 的边界。这次回调返回后，应先看到 `I/O nextTick`，然后是 `I/O microtask`、`I/O promise`。相同的三个 API，被安排的位置不同，相对顺序就不同。准确描述必须带上“ESM 顶层”或“这个文件读取回调中”的条件。

不必修改项目的模块类型，就可以用两个独立命令缩小对照：

```bash
node --input-type=commonjs -e 'process.nextTick(() => console.log("tick")); queueMicrotask(() => console.log("micro"));'
node --input-type=module -e 'process.nextTick(() => console.log("tick")); queueMicrotask(() => console.log("micro"));'
```

前者预期是 tick、micro，后者是 micro、tick。这里的 `--input-type` 只控制传给 `-e` 的代码怎样执行，没有把整个项目改成 CommonJS。第五章会讲模块加载，当前只需要意识到：相对执行顺序的结论也有运行入口条件。

## 再把事件循环阶段放回位置

回到文件读取回调中，它还安排了一个 `setTimeout(..., 0)` 和一个 `setImmediate()`。二者都没有加入刚才的微任务队列，它们等待事件循环继续推进到对应处理位置。

理解当前实验只需抓住三处：poll 负责观察 I/O 就绪并处理相关回调；check 执行 `setImmediate()`；定时器达到阈值后，在运行时安排的定时器处理位置执行。除此以外还有某些延后的系统回调、关闭回调和内部阶段，不必把所有工作强行压成一条“宏任务 FIFO 队列”。不同来源有不同的就绪条件。

在这个 **文件 I/O 回调内部** 同时安排两者，immediate 应先于 timeout。它们要先等当前回调以及相应 nextTick、微任务处理完，然后才进入后续阶段。这是一个带有进入位置的判断，不能挪成“setImmediate 永远比 setTimeout 快”。

如果把二者放在入口顶层，不应依赖固定相对顺序来表达业务规则。进程进入事件循环时的时机、定时器是否已到阈值和运行版本都会影响观察。Node 20 采用的 libuv 1.45 起，常规循环中定时器检查相对 poll 的安排发生过变化；本项目使用 Node 24，旧文章里按不同实现画的轮转图不应直接作为精确时序依据。

此外，`setTimeout(fn, 0)` 不表示在零毫秒处执行。Node 对过小的 delay 有最小值处理，而就绪后还要等待执行机会。`setImmediate()` 也不是调用后立即执行；它表达的是调度位置。把这两个名字按日常语言直译，往往比不记名字更容易误判。

实际开发应该依赖什么？需要“文件读完后再解析”，就通过回调或 `await` 建立完成依赖；需要“这段计算结束后给循环推进机会”，可以显式等待 immediate；需要“至少经过一段时间再尝试”，使用定时器并接受可能迟到。不要通过偶然的日志顺序建立本应由完成依赖表达的业务顺序。

## 有限的微任务链也能拖住 I/O

现在运行：

```bash
node examples/scheduling-order.js --starve
```

新增部分连续安排微任务，直到单调时钟经过约 300 ms 才停止。它不是一个从不返回的 `while`；每个 again 都很短，而且确实会返回。但队列被持续补充，运行时迟迟到不了处理其他来源工作的机会。

观察 `probe after ... ms`，它不会因设置了 0 就立即运行。文件读取也可能早已在底层完成，但 `I/O callback` 的 JavaScript 处理仍需等待。示例故意设置有限终点，避免一个永远调度自己的微任务让程序无法自行结束。

这个例子帮助分清两种阻塞形态：忙循环一直不归还当前调用；微任务链反复归还当前小回调，却又在高优先级工作中继续安排自己。对于等待普通 I/O 回调的请求，两者都可能造成明显延迟。看到代码中有很多短函数或 `await`，还不足以判断事件循环是否公平推进。

可以把 `queueMicrotask(again)` 的两处调用改成 `setImmediate(again)`，另存为一个独立实验再对照。预计定时器和 I/O 不必等到 300 ms 结束后才执行；同样 300 ms 的墙上时间内，循环次数可能下降，因为其他工作也得到了执行机会。这里比较的是调度机会，不能用循环次数减少断言算法效率变差。

正文的 `burnInSlices()` 同理：10 ms 只是每段连续占用的目标量级，不是“任意请求一定在 10 ms 内返回”的服务承诺。许多分段任务同时存在时，一段之后还可能轮到其他任务；操作系统也可能延后调度。真正的响应目标需要结合到达量、任务数量、队列上限与测量结果判断。

## 队列选择也会改变错误怎样出现

调度 API 不只是顺序不同，还可能改变错误归属。`Promise.resolve().then(() => { throw error; })` 会得到一个被拒绝的 Promise，调用方需要接住这个返回值。`queueMicrotask(() => { throw error; })` 没有把结果交付为一个可等待的 Promise，抛出的异常会走未捕获异常路径。把 then 机械替换成 queueMicrotask，可能同时丢掉原来用于观察失败的对象。

同样，给定时器传一个 async 回调，定时器 API 不会自动等待并处理那个 async 函数返回的 Promise。回调里的异步工作需要在适当边界主动处理失败，或者改用 Promise 版定时器，把等待连回当前函数。正文的异常实验已经展示：缩进留在 try 内，不等于未来执行仍处在那个 try 的调用栈内。

选 API 时，可以按目标逐步缩小：需要关联任务结果，就保留能观察失败的 Promise；需要微任务级别的极短时序安排，就理解它在当前上下文中的优先级；需要留机会给 I/O，就不要用递归微任务模拟分段。这样回到 EPP 的慢请求时，我们判断的是工作放在哪里、谁有机会执行、失败由谁观察，而不是能否背出一串阶段名。

时间参考（估算）：阅读约 12～15 分钟，操作另加约 5～8 分钟。按约 2200 个汉字、36 行代码与命令，以及两种入口和有限饥饿实验估算；阅读包含顺序推导，操作不重复计算阅读。

## 附录：本支线必要技术点速查

| 名称 | 用途 | 必要注意点 |
| --- | --- | --- |
| 同步调用栈 | 理解当前 JS 为什么连续执行 | 其他普通请求回调不会抢占正在执行的同步代码 |
| Promise 续体、`queueMicrotask()` | 比较同一微任务队列中的工作 | 持续补入微任务可能延迟 I/O；二者抛错后的观察方式不同 |
| `process.nextTick()` | 对照 Node 专门的调度队列 | 不等于下一轮事件循环；不要作为长计算的让出方法 |
| ESM 顶层与普通 I/O 回调 | 定位相对顺序的前提 | 不能把一个上下文中的 nextTick／微任务顺序套到全部代码 |
| poll、check、定时器处理 | 判断工作等待什么调度机会 | 不是一个按注册先后统一排列的队列，版本与进入位置都重要 |
| `setImmediate()` | 给事件循环推进机会 | 与同一 I/O 回调内创建的零延时定时器有明确相对顺序；不泛化到顶层 |
| `--input-type=commonjs`、`--input-type=module` | 对照 `-e` 代码的执行模式 | 不修改 package.json；不要据此混淆整个项目的模块类型 |

官方查阅：[Node 24 Process：nextTick 与 queueMicrotask](https://nodejs.org/docs/v24.22.1/api/process.html#when-to-use-queuemicrotask-vs-processnexttick)、[Timers](https://nodejs.org/docs/v24.22.1/api/timers.html)、[事件循环与阶段](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick)、[CLI](https://nodejs.org/docs/v24.22.1/api/cli.html)。

[返回第四章](chapter.md#本章支线) · [返回第一篇](../README.md)
