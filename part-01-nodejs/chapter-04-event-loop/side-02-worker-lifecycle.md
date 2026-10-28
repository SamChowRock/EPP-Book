# 支线 4B：把计算交给另一个线程——消息、失败与 Worker 的寿命

正文已经区分了等待、分段计算与线程池。现在考虑无法留在主线程长时间执行的一段 JavaScript：我们希望它运行时，主线程仍能处理一个 100 ms 定时器。这次不把计算改成另一种语言，也不假装 Promise 会搬走工作，而是明确建立一个 Worker Thread。

仅仅展示 `new Worker()` 不够。调用者还需要知道输入怎样过去、结果怎样回来、工作失败怎样传递，以及什么时候才能确认线程结束。否则只是把主线程里的游离工作，换成另一个更难追踪的执行环境。

这里选择一次性、无外部副作用的计算。输入小、结果小，不访问记录服务中的 Map，不写文件或发外部请求；因此可以用主动终止观察期限，不必同时引入事务与补偿。改变这些条件后，退出策略也需要改变。

## 先约定什么叫完成

一次计算至少有两个可以观察的事实：Worker 发回结果；Worker 已经退出。它们不是同一个事件。发回消息后，Worker 仍可能持有定时器、端口或其他资源，也可能在后续操作中失败。若父线程收到任意消息就宣布整个一次性执行成功，会漏掉这些尾部状态。

本例约定：子线程发送一条结果消息，然后自然退出；父线程要收到结果，并确认退出码为 0，才完成这次调用。没有消息却正常退出，应判为协议失败；抛异常退出，应报告异常；超过期限，则要求线程终止，并等到退出后报告超时。

这不是所有 Worker 的通用协议。长期存在的线程池会在一个线程中执行许多任务，此时每个任务必须有自己的 ID 和完成消息，不能等整个线程退出才返回第一项结果。当前选择一次性执行，是为了先把结果与资源寿命拆清楚，再推导复用需要增加哪些机制。

## 子线程只接受输入并产出结果

新建 `examples/cpu-worker.js`：

```javascript
import { parentPort, workerData } from 'node:worker_threads';
import { burnCpu } from './event-loop-work.js';

if (workerData.mode === 'fail') throw new Error('Demo worker failed');
if (workerData.mode !== 'empty') {
  const iterations = burnCpu(600);
  workerData.note = 'changed inside worker';
  parentPort.postMessage({ iterations, note: workerData.note });
}
```

`workerData` 是创建线程时交付的输入，`parentPort` 是用来向父线程发送消息的端口。这里复用正文的 `burnCpu()`，工作量仍按约 600 ms 的忙循环窗口构造。`fail` 故意抛异常；`empty` 故意不发结果；其余模式计算后发一条消息。这两个故障分支用来检验父线程是否只处理了成功路径。

注意 `workerData.note` 的修改。它发生在子线程获得的对象上，不是隔空改父线程的变量。消息采用结构化克隆支持的值传递；普通对象在两个执行环境中各有自己的版本。随后发回的消息也要由父线程显式接收，不会自动合并到原输入对象。

结构化克隆不等于完整保留任意 JavaScript 对象身份。函数不能作为普通任务函数直接塞进 workerData 传过去，类实例也不能假定保留原型方法。比较稳妥的任务边界是简单数据与明确结果：例如原文数组和统计结果，而不是整个 Controller、数据库客户端或带闭包的服务对象。

## 父线程负责失败、期限与退出

新建 `examples/worker-boundary.js`，完整内容如下：

```javascript
import { Worker } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { burnCpu } from './event-loop-work.js';

const mode = process.argv[2] ?? 'worker';
const allowed = ['main', 'worker', 'fail', 'empty', 'timeout'];
if (!allowed.includes(mode)) {
  console.error(`Usage: node examples/worker-boundary.js ${allowed.join('|')}`);
  process.exitCode = 2;
} else {
  const start = performance.now();
  const input = { mode, note: 'owned by parent' };
  const probe = setTimeout(() => {
    console.log(`100 ms probe at ${Math.round(performance.now() - start)} ms`);
  }, 100);
  let worker;
  let deadlineTimer;
  let expired = false;
  try {
    if (mode === 'main') {
      console.log({ iterations: burnCpu(600) });
    } else {
      worker = new Worker(new URL('./cpu-worker.js', import.meta.url), { workerData: input });
      const result = await new Promise((resolve, reject) => {
        let message;
        let received = false;
        let failure;
        worker.on('message', (value) => {
          received = true;
          message = value;
        });
        worker.on('error', (error) => { failure = error; });
        worker.on('messageerror', (error) => {
          failure = error;
          void worker.terminate().catch(reject);
        });
        worker.on('exit', (code) => {
          if (expired) reject(new Error('Worker deadline exceeded'));
          else if (failure) reject(failure);
          else if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
          else if (!received) reject(new Error('Worker exited without a result'));
          else resolve(message);
        });
        deadlineTimer = setTimeout(() => {
          expired = true;
          void worker.terminate().catch(reject);
        }, mode === 'timeout' ? 100 : 5000);
      });
      console.log(result);
    }
    console.log(`parent note: ${input.note}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadlineTimer);
    if (worker) await worker.terminate();
    // The finite probe is intentionally retained for the blocking comparison.
    if (mode === 'empty' || mode === 'fail') clearTimeout(probe);
  }
}
```

这里的 `new URL('./cpu-worker.js', import.meta.url)` 延续第三章的路径选择：子程序随当前模块交付，所以按模块位置定位，不依赖 shell 的 cwd。第五章改变产物位置时，还要保证子线程入口也被交付，不能只编译主入口。

消息到来时，父线程先记录结果。`error` 事件先保留失败原因，`exit` 再作最终判断；这样不会收到一次结果就忽略随后出现的失败。若消息无法反序列化，`messageerror` 会触发主动终止，并保留原始失败。示例只发送简单数据，一般不会进入这条路径，但协议的边界需要明确。

为什么要单独记录 `received`，不只判断 `message` 是否为真？合法结果可以是 `0`、`false`、空字符串甚至 undefined；“收到了一条消息”与“消息值为真”不是同一判断。此处实际发的是对象，但边界代码不应悄悄把真假值当成消息协议。

普通分支有 5 秒保护，`timeout` 分支将期限缩成 100 ms。期限到达时先标记 expired，再调用 `terminate()`。退出事件中的判断把这次退出归为“本次调用主动要求终止”，而不把它混成无来由的非零退出。`terminate()` 本身返回 Promise，调用中附上失败处理；外层 `finally` 再等待终止，确保发生其他异常时也不遗留 Worker。已经退出的线程再终止不会重新执行计算。

这里用 `void` 只是显式表示此处不直接 await；真正避免遗漏失败的是后面的 `.catch(reject)`，并不是 void 这个运算符。声明“我不等”与承担失败责任之间，仍有一段必须落实的代码。

## 对照主线程与 Worker

依次运行：

```bash
node examples/worker-boundary.js main
node examples/worker-boundary.js worker
```

`main` 模式直接在父线程执行 `burnCpu(600)`。100 ms 探针应等到忙循环结束后才输出，表现和正文的 `/block` 一致。`worker` 模式下，探针通常在计算结果之前输出，因为主线程不再亲自执行那段循环。两种模式的计算输出仍大约在数百毫秒量级，线程启动甚至会让 Worker 的总完成时间更长。

因此这次观察支持的是“父线程获得其他执行机会”，不是“计算自动快了”。只有在工作可并行、实际存在可用核心，而且分派与传输成本值得承担时，多线程才可能提高总吞吐。单核或资源紧张时，线程仍在争夺同样的 CPU；即使主线程没有自己的忙循环，也不能承诺探针精确在 100 ms 执行。

Worker 返回的结果中，note 为 `changed inside worker`；父线程随后打印的 `parent note` 仍为 `owned by parent`。这是输入副本与结果消息分别存在的直接证据。把 EPP 的 captures Map 传过去，也不能指望子线程 `set()` 自动更新父线程业务状态；应让父线程根据结果执行它所拥有的状态变更，或者引入专门的数据共享方案。

若把相同程序从另一目录启动，模块相对路径应继续找到子线程文件。这复用了第三章的能力：定位错误与线程执行错误是两个阶段的问题。创建入口就找不到文件时，应先查构建产物与模块路径，而不是调整 CPU 参数。

## 失败不能靠等一条消息猜出来

继续运行下面三组命令，分别查看退出状态：

```bash
node examples/worker-boundary.js fail
echo $?
node examples/worker-boundary.js empty
echo $?
node examples/worker-boundary.js timeout
echo $?
```

`fail` 应报告 `Demo worker failed`；`empty` 应报告 `Worker exited without a result`；`timeout` 应报告 `Worker deadline exceeded`。三个父进程都主动返回 1，而不是悬在那里等一条永远不会出现的成功消息。

未捕获的 Worker JavaScript 异常会通过父线程的 error 事件被观察，并结束该 Worker。它不必像主线程未捕获异常那样直接结束整个父进程；但如果父线程不处理 Worker 对象的 error 事件，又可能把局部失败变成父进程的未处理错误。隔离的收益取决于边界有没有被正确接住。

也不能把这个特点理解成“Worker 是绝对安全的进程沙箱”。它与父线程仍在同一进程，原生扩展崩溃或进程级故障可能影响全部线程，CPU 与一些运行时资源也仍然共享。如果需要独立的进程退出、权限或部署边界，就应考虑独立进程及相应运行约束，不能只依赖 Worker 的 error 回调。

`timeout` 模式还说明另一件事：父线程可以在子线程忙计算时运行自己的定时器，并请求终止子线程。这与正文把超时和忙循环放在同一条线程上不同。但父线程自己的定时器仍可能迟到，线程启动时间也计入这 100 ms；这个例子没有提供硬实时保证。

## 强制终止不是合作清理

子线程如果正在一个长循环里，给它发一条“请停止”的消息，消息处理回调也要等那条线程有机会处理事件。不能靠增加 message 监听器就让循环被抢占。合作取消仍要分段，或采用明确的共享状态检查协议；共享状态还涉及同步与内存可见性，不能用普通对象引用替代。

`terminate()` 的作用更强：它可以停止子线程 JavaScript 的执行，因此不能依赖子线程的 `finally` 一定执行。这也是本例把工作限定为无外部副作用纯计算的原因。半个结果直接丢弃即可，不需要恢复一半写出的文件或外部请求。

如果任务改成“写入导出文件”，立即终止可能留下部分文件；若改成“先更新一项业务状态，再调用外部服务”，退出时可能不知道外部服务是否已经执行。此时需要原子替换、任务状态、幂等与恢复依据，线程停止只解决执行寿命，不能代替业务一致性。

结果消息也不是持久化。父线程收到消息后还没保存就崩溃，结果仍会丢失；线程结束后不能靠重新读取 workerData 找回之前的进度。正因为这些边界清楚，才知道什么时候应继续使用当前轻量方案，什么时候需求已经进入可靠后台任务的范围。

## 从一次执行推导复用的代价

假设每次检查仅需 2 ms，而建立执行环境和传输数据就已经耗费可观时间，每次请求创建线程很可能得不偿失。可以先减少分派次数，把一批小操作组成一个受控任务，或直接留在主线程执行。移动工作的收益要和额外成本一起测量。

假设每次检查需 600 ms，同时来了上百次请求。逐请求建 Worker 会创建大量执行环境，与其说消除了排队，不如说把队列藏进了操作系统的线程调度和内存中。正确的约束需要落在创建与提交之前：固定可用 Worker 数、限制等待任务数量，容量满时按业务约定拒绝、延后或降级。

复用线程后，父线程还要给每个任务分配 ID，把消息映射回对应等待者；线程异常时，识别哪项已被领取但结果未知，决定能否重试；任务取消时，判断是只取消排队任务、合作停止当前任务，还是终止并重建整个线程。一个线程上已经开始的新任务不能被上一项迟到的取消命令误伤。

这些不是要求当前把线程池框架建完，而是从已写的一次性协议看清复用会改变哪些条件。对于当前的内存记录服务，还没有把 CPU 重任务加入业务接口的需要；支线建立的能力是能判断执行边界、写出有明确收尾的一次计算，并知道长生命周期方案还欠什么。

回到正文最后的导入场景：如果主要耗时是可隔离的文本计算，可以考虑有限 Worker；如果主要耗时是外部 API 等待，先用原生异步 I/O 和并发限制；如果必须跨服务重启继续执行，任务事实需要落到持久化存储，再选择具体执行者。这三个结论分别来自计算位置、资源容量和恢复要求，不应被一个“后台”词语合并。

时间参考（估算）：阅读约 18～22 分钟，操作另加约 8～12 分钟。按约 3000 个汉字、78 行代码与命令，以及两个执行位置和三种失败分支估算；阅读包含生命周期推导，操作不重复计算阅读。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| `new Worker(fileURL, { workerData })` | 创建独立 JS 执行环境并传入数据 | 不是任意函数自动在线程池执行；文件路径随交付结构核对 |
| `workerData` | 接收父线程的结构化输入 | 普通对象不是父线程对象的同一引用；不要传闭包或客户端实例 |
| `parentPort.postMessage()`、`message` | 返回结果 | 收到结果不等于线程退出，也不等于结果已经持久化 |
| `error`、`messageerror` | 观察执行或消息反序列化失败 | 异常需要对应任务的失败策略，不能只处理成功消息 |
| `exit` | 确认 Worker 生命周期结束 | 正常退出不自动代表有合法业务结果；本例同时要求结果与退出码 0 |
| `terminate()` | 父线程请求停止并等待退出 | 返回 Promise；不能保证子线程执行 finally，不回滚副作用 |
| 克隆、转移与共享 | 区分数据跨线程的方式 | 本例仅普通值克隆；转移会影响发送端可用性，共享内存需同步协议 |
| 有界线程池 | 复用执行环境并控制在途计算 | 并发数、队列容量、任务 ID、失败恢复与取消归属分别需要设计 |

官方查阅：[Node 24 Worker Threads](https://nodejs.org/docs/v24.22.1/api/worker_threads.html)、[消息与结构化克隆](https://nodejs.org/docs/v24.22.1/api/worker_threads.html#portpostmessagevalue-transferlist)、[terminate](https://nodejs.org/docs/v24.22.1/api/worker_threads.html#workerterminate)、[Child process](https://nodejs.org/docs/v24.22.1/api/child_process.html)。

[返回第四章](chapter.md#本章支线) · [返回第一篇](../README.md)
