# 支线 3C：收到停止信号之后，程序为什么还活着

第三章解释了默认信号行为：没有接管 `SIGINT`、`SIGTERM` 时，Node 可以按默认方式结束进程；一旦注册处理器，应用就开始承担自己的停止流程。但只知道这条规则，还不足以决定一个真实程序该怎么停。难点在于，程序可能同时拥有产生新工作的入口、已经接受的工作，以及这些工作使用的资源。

先用一个小型定时任务程序把这三者拆开。它每隔 300 毫秒启动一项工作，每项工作等待 800 毫秒再完成，因此同一时刻可能有几项工作尚未完成。我们不需要数据库或 HTTP 端口，就能观察停止时应该先改变什么、还要等待什么。

## 先区分业务完成与运行时退出

一项工作对应一个 Promise，可以表达业务操作有没有完成。但 Promise 是对结果的表达，不会凭空替运行时创造一个必须等待的资源。这个例子中的 `delay(800)` 背后有定时器，才让等待阶段具备具体的运行时活动；如果换成一个永远不解决、也没有任何底层活动的 Promise，不能指望它独自让进程永远存在。

反过来，所有业务工作都完成，也不等于进程一定退出。负责定期生成工作的 interval 仍在活动时，运行时还在等下一次到期；一个忘记清理的收尾超时定时器，也会延长进程寿命。判断程序“为什么没结束”，需要找还在活动的资源，不能只搜索哪一个函数还没有 `return`。

因此，本例要同时维护两份信息：interval 是新工作的来源；`pending` 集合记录业务上尚未完成的工作。前者用来停止接收，后者用来等待收尾。它们承担不同职责，不应该用一个 `stopping` 布尔值假装已经完成全部清理。

## 一个可以比较两种停止方式的小程序

在配套代码的 `examples/signal-lifetime.js` 中写入以下完整实现。它只输出演示文本，所有工作都由短定时器完成：

```javascript
import { setTimeout as delay } from 'node:timers/promises';

const mode = process.argv[2] ?? 'drain';
if (!['log-only', 'drain'].includes(mode)) {
  console.error('Usage: node examples/signal-lifetime.js [log-only|drain]');
  process.exitCode = 1;
} else {
  let stopping = false;
  let nextId = 0;
  const pending = new Set();

  async function runJob(id) {
    console.log(`start ${id}`);
    await delay(800);
    console.log(`done ${id}`);
  }

  function scheduleJob() {
    if (stopping) return;
    const job = runJob(++nextId);
    pending.add(job);
    job.then(
      () => pending.delete(job),
      (error) => {
        pending.delete(job);
        console.error(error.message);
        process.exitCode = 1;
      },
    );
  }

  const interval = setInterval(scheduleJob, 300);
  // Keep the deliberate log-only experiment finite.
  const safetyStop = setTimeout(() => {
    stopping = true;
    clearInterval(interval);
    console.error('demo time limit reached');
    process.exitCode = 1;
  }, 10_000);

  async function stop(signal) {
    console.log(`received ${signal}`);
    if (mode === 'log-only' || stopping) return;
    stopping = true;
    clearInterval(interval);
    await Promise.allSettled([...pending]);
    clearTimeout(safetyStop);
    console.log('drained');
  }

  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  console.log(`ready pid=${process.pid} mode=${mode}`);
  scheduleJob();
}
```

`node:timers/promises` 提供可等待的定时器接口，`delay(800)` 表达本例中的一段异步等待。工作完成后从 `pending` 移除；失败路径也移除，并保留非零退出结果，避免把失败误报成成功。

代码中的十秒定时器用于给刻意写错的实验设置边界：即使忘记停止，它也会关闭 interval，已有的短任务随后结束。它不是生产服务的完整超时退出方案。如果任务不再保证有限完成，仅仅清掉 interval 不能强制取消那些任务；真实收尾时限如何终止、取消或记录未完成工作，需要结合具体资源另行设计。

## 先运行只打印日志的版本

执行：

```bash
node examples/signal-lifetime.js log-only
```

看到 `ready` 与若干 `start` 后，直接在原终端按 `Ctrl+C`。程序应显示 `received SIGINT`，但后面仍有新的 `start` 出现；到演示时限才自动收尾。这是有意保留的错误方式。

观察重点不是出现了多少行，也不是编号具体是多少，而是收到信号以后是否仍接收新工作。`stop()` 在 `log-only` 分支直接返回，interval 没有关闭，所以它继续触发 `scheduleJob()`。操作系统已经把信号送到了，Node 也执行了处理器；失败的是应用没有改变自己的资源状态。

若在处理器里补上 `process.exitCode = 1`，也不会使 interval 消失，只会决定将来自然退出时报告什么状态。若补上 `process.exit(0)`，进程会立即终止，但一些已有 `start` 对应的 `done` 可能永远不会出现。两种修改分别改变了“结果如何报告”和“是否立即终止”，都没有实现“停止新增，然后完成已接收的工作”。

## 再让停止操作改变真正的完成条件

运行默认的收尾版本：

```bash
node examples/signal-lifetime.js drain
```

看到至少一项工作开始后按 `Ctrl+C`。这次收到信号以后不应再有新的 `start`，但已经开始的工作可以继续输出 `done`；随后出现 `drained`，进程自然结束。完整编号与数量由按键时机决定。

为什么按照这个顺序写？`stopping = true` 先改变应用层的接受条件；即使别的调用路径试图安排工作，也会被 `scheduleJob()` 的检查拦住。`clearInterval()` 则关闭实际的重复调度来源，不再要求运行时等待下一次间隔。一个负责业务入口条件，一个负责底层资源，两步互相配合。

停止来源之后，`[...pending]` 才能成为当前需收尾工作的稳定快照。如果先取快照再放任 interval 继续启动任务，等待的只是一部分旧任务；即使这些 Promise 全部完成，也不能宣布整体收尾结束。这里 JavaScript 执行到第一个 `await` 之前没有把控制权交回事件循环，因此改变状态、清理 interval 与取得快照的先后顺序是明确的。

`Promise.allSettled()` 的用途是等所有已接受工作走到成功或失败的结果，而不是一遇到失败就跳过其余工作的等待。任务失败已经通过各自的拒绝处理记录到 `exitCode`，因此等待所有结果不表示把失败吞掉。正常信号收尾没有任务失败时，本例退出 0；它不会自动沿用默认 SIGINT 对应的 shell 状态，因为应用已经接管信号并完成了自己的处理。

最后还要清掉演示时限定时器。若漏掉这一步，所有任务虽然已经结束，进程仍可能一直等到十秒定时器触发，而且会被错误标记为超时。由此可见，“在退出前加一个定时器保护”也增加了一项资源责任：正常完成时必须取消它，或者明确选择不让它单独保持进程存活。

`stopping` 还处理了重复信号。收尾过程中再次收到信号，只记录它，不重复安排另一份等待与清理。本例没有移除信号处理器，因此第二次 `Ctrl+C` 不会突然回到默认立即终止行为。生产系统也可以明确设计“第二次信号强制退出”，但那是另一项策略，不能偶然由重复注册或移除监听器造成。

## 处理器返回 Promise，谁会等它

`stop()` 是 async 函数，但信号事件的派发者不会仅凭返回的 Promise 就替应用等待全部业务完成。这个例子能够等待，是因为它自己的逻辑记录了任务，而这些任务背后的定时器还存在。`await` 让收尾逻辑在任务完成以后继续，保活资源让运行时有理由继续工作，两者恰好配合起来。

如果把 `runJob()` 改为只有一个未解决、没有底层活动的 Promise，同时又移除所有定时器，不能因为 `stop()` 正在 `await` 就宣称进程一定会留下来。如果清理函数自身可能拒绝，也需要明确捕获并决定失败结果，不能假定事件系统会替它处理。第四章讨论异步失败时会继续使用这个边界。

因此也不要把异步关闭安排在 `process.on('exit', async () => ...)` 中。`exit` 通知发生在退出已进入最后阶段时，异步任务没有正常等待完成的机会。应在还能管理资源和等待结果的阶段发起收尾，而不是等最终退出通知再开始保存关键状态。

## 把顺序迁回 HTTP 服务

对 EPP 而言，可以把这个例子里的调度来源替换成接收请求的入口，把 `pending` 中的工作替换成正在处理的请求或后台操作。需要等待的东西变了，基本推导仍然成立：先阻止新的工作进入，再处理已经接受的工作，最后关闭它们依赖的资源。

这不是把 `clearInterval()` 换成一个关闭方法就完成了生产化。HTTP 有空闲连接、正在读取的请求体、已经修改但尚未回应的状态等不同阶段；数据库连接池又可能被多个请求共用。第十二章会在这些具体条件下落实生命周期，后面的持久化任务还会处理进程彻底消失后的恢复。

先用这里的模型判断两个变化。若增加第二个 interval，仅清理原来那个就不再满足“停止新增”；需要找到全部工作入口。若某个任务必须用一条外部连接写完结果，应该等它结束再关闭连接；先关连接会制造本来可以避免的失败。反过来，若要求立即放弃某项工作，就必须确认它的取消接口和已经产生的副作用，不能通过删除 `pending` 中的 Promise 假装取消了底层操作。

最后，信号处理能改善正常停止的行为，却不能保证程序总有机会收尾。`SIGKILL`、进程崩溃或机器掉电都可能使清理代码无法执行。操作系统回收资源与业务结果得到可靠保存是两件事，所以持久化与任务恢复仍需要单独设计。理解这个边界，才能既实现有序关闭，也不把它误当成数据可靠性的全部保证。

阅读参考（估算）：约 14～18 分钟；运行两种停止方式、观察重复信号和任务完成顺序另加约 5～8 分钟。依据约 2400 个汉字、约 60 行代码与命令及收尾推导估算；操作时间不重复计算阅读，附录按需查阅。

## 附录：本支线必要技术点速查

| 名称 | 本文用途 | 必要注意点 |
| --- | --- | --- |
| `setInterval()`、`clearInterval()` | 建立和关闭新工作的来源 | 关闭调度器不取消已经启动的任务。 |
| `node:timers/promises` 的 `setTimeout()` | 表达本例有限的异步工作 | Promise 表达结果，底层定时器参与进程存活。 |
| `Set`、`Promise.allSettled()` | 记录并等待已接受的工作 | 先停入口再取快照；等待全部不代表全部成功。 |
| `process.on('SIGINT'／'SIGTERM', handler)` | 接管停止信号 | 回调返回不等于退出；重复信号需要明确策略。 |
| `stopping` | 本例自己的接受状态 | 不会自动清理资源，需与实际关闭操作配合。 |
| `process.exitCode` | 保留任务或演示超时的失败结果 | 正常收尾时应用自己决定状态，设置它不会停止活动资源。 |
| `clearTimeout()` | 取消正常收尾后不再需要的保护定时器 | 漏掉它也可能让进程延迟退出。 |
| `exit` 事件、`SIGKILL` | 理解清理时机的边界 | `exit` 阶段不安排异步保存；SIGKILL 不能捕获。 |

官方查阅：[Node Process 与信号](https://nodejs.org/docs/v24.22.1/api/process.html#signal-events)、[Node 退出事件](https://nodejs.org/docs/v24.22.1/api/process.html#event-exit)、[Node Timers](https://nodejs.org/docs/v24.22.1/api/timers.html)、[Node Events](https://nodejs.org/docs/v24.22.1/api/events.html)。

[返回第三章](chapter.md) · [返回第一篇](../README.md)
