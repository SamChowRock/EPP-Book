# 支线 12A：Observable 的订阅、错误与收尾边界

第十二章的输出检查只有一行 `next.handle().pipe(map(...))`。如果把它理解成“拿到结果后调用一个函数”，容易继续写出两类错误：为打印结果手动 subscribe，导致业务重复执行；加了 timeout 就以为底层写入一定停止。两者都源于把结果通知与实际工作当成同一个东西。

这条支线沿用已有 RxJS，不新增依赖。独立程序是 `examples/observable-boundaries.mjs`，不启动 HTTP 服务。我们只展开理解当前 Interceptor 所需的部分；业务 Service 继续使用 Promise，不为使用 Nest 而把所有业务方法改成 Observable。

时间参考（估算）：阅读约 18～23 分钟；运行与修改独立示例另加约 8～12 分钟。按约 2400 个汉字、37 行代码与命令，以及订阅、恢复与超时三组对照估算，非读者实测，不并入主线。

## 从 Promise 结果到一份可订阅的执行描述

调用一个 async 函数时，函数已经开始执行；返回的 Promise 表示这一次执行的未来结果。等待它两次，不会因此把函数调用两次。Observable 则提供订阅接口，生产者怎样开始、是否共享工作、如何停止，要看它的构造方式。

为了把执行时机看清，示例先把一次“写入”放入 defer：

```javascript
let writes = 0;
const work = defer(() => {
  writes++;
  console.log('execute:', writes);
  return of({ value: 'saved' });
});
console.log('before subscription:', writes);
await lastValueFrom(work);
await lastValueFrom(work);
console.log('after two subscriptions:', writes);
```

defer 在订阅时调用工厂，of 把给定对象作为一次值通知发出，然后完成。创建 work 时 writes 仍为 0；两次 lastValueFrom 分别订阅，所以工厂执行两次，writes 最终为 2。共享的是描述对象，不是某次已经完成的写入。

这不表示“所有 Observable 每次订阅都会重新执行一切”。例如先调用 `const promise = save()`，再做 `from(promise)`，底层 save 已经发生了一次；多次订阅只是观察同一个 Promise。Subject 或共享操作符又有不同的生产关系。不能只看到变量类型叫 Observable，就判断它是惰性的、独立的或可取消的。

对当前 Nest 而言，`next.handle()` 提供的是后续调用的延迟执行流。应用应把组合后的流返回，让框架决定何时消费。如下写法会自己先开启一个消费者：

```typescript
const result = next.handle();
result.subscribe(value => console.log(value));
return result;
```

Nest 随后还要消费返回的 result，这就可能让下游 Pipe、Controller、写入被执行两次。记录调试信息用 tap，把观察附在原来那次消费上：

```typescript
return next.handle().pipe(tap(() => console.log('result produced')));
```

这条观察只记录结果出现，示例没有输出用户正文。调试器也可以在 map 或 tap 中暂停，不需要为了看值额外建立订阅。主线甚至不需要 tap：只保留返回值校验，把持续日志职责留给下一章。

还有一个容易混淆的写法：`await next.handle()`。await 会等待 Promise 或 thenable，而 Observable 不因此被订阅；拿到的仍然是 Observable。要把一个有限流转为 Promise，可以使用 firstValueFrom 或 lastValueFrom，但要明确等待第一个值还是完成后的最后一个值。没有值就完成、永不完成或持续发送的流有不同后果。普通 HTTP 响应应有明确的有限结果，不能把这个等待方式直接推广到 SSE。

## pipe 描述组合，map 与 tap 在通知到达时执行

调用 `.pipe(map(...))` 是建立组合，不是在那一行就得到 map 的输出。订阅后，值沿组合向下流动。map 的返回值替换当前值，tap 用来观察通知，不把回调返回值变成结果。

如果 map 回调里抛出错误，它进入这条流的错误通道；后面的普通值处理不再继续，直到某个错误处理操作接手。它不是同步抛回“早先调用 pipe 的那一行”。因此在 Interceptor 外面写一个只包住 `next.handle()` 的普通 try/catch，不能据此捕获未来的所有通知错误。

如果需要先等待独立的准备工作，可以让 intercept 返回 Promise<Observable>；那是等待准备工作后交出流，并不是消费流。若要捕获下游结果阶段的错误，仍应把 catchError 接到流中。这两个异步层次解释清楚后，就不需要凭感觉在每个位置加 await。

独立示例第二段故意让输出检查失败，再给出恢复值：

```javascript
const recovered = await lastValueFrom(of({ value: 7 }).pipe(
  map(value => {
    if (typeof value.value !== 'string') throw new Error('invalid output');
    return value;
  }),
  catchError(() => of({ value: 'fallback' })),
  finalize(() => console.log('recovery stream finalized')),
));
console.log('recovered:', recovered);
```

最终消费者得到 fallback，而不是异常。catchError 的返回值需要是一份可继续消费的流或可转换来源；of 把恢复对象放到正常值通道上。若要保留失败，使用 `throwError(() => error)`。把错误作为普通对象返回，意味着协议上已经选择了“这也是成功结果”，不能期待外面的 Filter 再识别它长得像错误。

继续改变操作符位置：如果把同样的检查放到 catchError 后面，恢复值也会经过它；放在前面，只检查原来的输入路径。第十二章实验的恢复值没有倒回前面的 Schema，这不是 RxJS 漏检，而是我们把检查安排在恢复分支之前。每个分支必须在哪里重新汇合，是调用组织的决定。

不要为了“永远有结果”把未知错误都恢复为默认值。查询失败恢复成空列表，会让调用方误以为没有记录；保存失败恢复成对象，会让调用方误以为已经持久化。恢复必须有明确语义，例如可接受的旧缓存及其标识。没有这样的约定，就把失败交给统一错误出口。

## finalize 关闭消费关系，不代表撤回实际工作

Observable 的消费者可以取消订阅。生产者若提供清理函数，取消时能执行相应动作，例如清理 timer 或调用 AbortController。这个接口允许取消，不保证任意已经开始的外部操作都能撤销。

Promise 本身没有通用的取消方法。`from(promise)` 可以停止向已经取消的订阅者转发结果，但不能凭空终止 Promise 背后的写入。示例第三段用一个延迟完成的操作代替写入：

```javascript
let committed = false;
const result = await lastValueFrom(defer(() => from((async () => {
  await delay(40);
  committed = true;
  return 'saved';
})())).pipe(
  timeout({ first: 10 }),
  catchError(() => of('timeout')),
  finalize(() => console.log('timeout stream finalized')),
));
console.log('consumer result:', result);
await delay(60);
console.log('underlying work committed:', committed);
```

在这里，delay 来自 `node:timers/promises`。timeout 在首个值迟迟没有到来时结束原来的等待关系，catchError 转成 timeout 结果，finalize 执行。原来的 async 函数仍继续到 committed=true。示例采用短延时便于观察，实际调度存在抖动，不应把毫秒数当作性能保证；需要观察的是消费者已经不再等，底层工作却仍会完成。

在项目根目录运行：

```bash
node examples/observable-boundaries.mjs
```

前半段应先看到 before subscription: 0，再看到两次 execute 和 after two subscriptions: 2；后半段可对照 consumer result: timeout 与 underlying work committed: true。程序没有 HTTP 端口，不需要启动 dev，也不依赖 dist。

把它接回创建接口：如果给 insert 外面套一个通用超时 Interceptor，调用方可能收到失败，但插入稍后仍然成功。再自动 retry 一次，只是再次订阅下游，可能重新执行创建。取消等待、停止执行、回滚事务、重复请求只生效一次，是四种不同保证。后面的数据库与任务章节会分别建立它们，不能由一个 RxJS 操作符代替。

要让可中断的操作真正停止，应由它支持取消信号，并把订阅清理与这个信号连接起来；即使传了 signal，也要确认依赖如何响应，以及取消发生时副作用是否已经不可逆。当前主线没有引入取消或幂等，因此不增加会掩盖这类不确定性的统一超时／重试。

finalize 的用途是收尾观察或释放这段订阅自己拥有的资源。成功、失败、主动取消都可能触发它，里面不能无条件记录“业务成功”。更不能在里面清理一个由多次请求共享、并不归当前订阅独占的资源。资源是谁创建、由谁持有、哪个完成条件触发释放，仍要回到第三章的生命周期判断。

## 用变化判断应该把代码放在哪里

现在把输出对象改成需要异步补充展示信息。`map(async value => ...)` 会把 Promise 作为值发出去，不自动把其中的结果当作下一层普通对象。需要保持返回值流程时，应选择能组合内部异步来源的操作，或把该准备工作放回清楚的业务／适配方法，再返回单个 Promise；不能只因为当前代码在 map 中，就把所有新逻辑都挤进去。

若补充信息是创建必须满足的业务条件，它通常应该在业务流程中明确等待，而不藏在通用输出 Interceptor。否则同一个 Service 被 CLI 调用时会跳过这一步，两个入口不再执行同样的业务。Interceptor 适合围绕路由处理普遍成立的适配责任；它的位置方便，不代表它天然拥有新增业务规则。

另一个变化是希望一边查询一边流式返回。当前单次 JSON Schema 校验、Nest 普通返回值处理和条件 ETag 的假设都要重新评估，不能仅把 Service 的 Promise 改成多次发值的 Observable。先确定公开协议与响应完成方式，再选流处理机制，这样才能知道错误还能否改写状态，以及中断后谁负责停止生产。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| defer | 在订阅时创建本次工作 | 多次订阅可以重复执行工厂 |
| of／from | 从值或现有异步来源建立通知流 | from(Promise) 不提供底层取消 |
| pipe／map／tap | 组合、转换、观察 | map 的 async 回调会返回 Promise 值 |
| lastValueFrom | 等待有限流完成后的最后值 | 消费本身会建立订阅，不要额外消费 Nest 下游 |
| catchError／throwError | 替换失败来源或继续失败 | 恢复值是否经过校验取决于操作符位置 |
| timeout | 限制消费者等待 | 不等于停止副作用或回滚 |
| finalize | 订阅完成、失败或取消时收尾 | 不代表成功，不负责释放其他调用拥有的资源 |

官方查阅：[Observable](https://rxjs.dev/guide/observable)、[订阅与取消](https://rxjs.dev/guide/subscription)、[defer](https://rxjs.dev/api/index/function/defer)、[map](https://rxjs.dev/api/operators/map)、[catchError](https://rxjs.dev/api/operators/catchError)、[finalize](https://rxjs.dev/api/operators/finalize)、[timeout](https://rxjs.dev/api/operators/timeout)、[lastValueFrom](https://rxjs.dev/api/index/function/lastValueFrom)。独立示例使用项目既有 RxJS 7.8.2。

[返回第十二章](chapter.md) · [返回第二篇](../README.md)
