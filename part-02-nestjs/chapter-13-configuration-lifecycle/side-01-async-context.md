# 支线 13A：请求编号为什么不会串到另一个请求

正文里，HTTP 入口生成编号，存储包装层却没有接收 requestId 参数。它们仍能输出同一编号，是因为两处执行属于同一条异步调用链。理解这件事，才能判断一个定时回调、事件订阅或后台任务还应不应该使用原来的请求身份。

本支线使用 `part-02/chapter-13` 的 `examples/request-context.mjs`，不需要监听端口。时间参考（估算）：阅读约 15～20 分钟；运行与改变条件另加约 8～12 分钟。

## 单线程为什么仍然会串值

假设收到请求 A 时，把全局 currentId 设为 A；A 等待存储，事件循环开始处理 B，又把 currentId 改成 B。B 完成后，A 的 Promise 继续执行，此时全局变量仍是 B。JavaScript 同一时刻只执行一个回调，并不能保证一个请求从进入到结束期间独占所有回调。

一种可靠办法是显式传参：把 requestId 沿调用边界传给需要记录日志的对象。它容易看出数据来源，也适合把上下文送到另一个进程；代价是每一层参数都可能携带与业务无关的诊断信息。如果只有两层调用，显式传参完全可以；不是看到日志就必须引入隐式上下文。

另一个办法是建立请求级对象并在其中保存编号。但若让所有依赖都随请求创建，会改变对象身份、实例数量与资源归属。第九章已经说明请求作用域的传播；不能只为带一个字符串，就把本应共享的连接池也重新组织成每个请求一份。

AsyncLocalStorage 提供的是异步执行链上的存储位置。一个 Logger 仍可由整个应用共享，读取时却能找到当前链对应的 store。它没有锁住线程，也不会使两个请求变成串行执行。

## run 建立的是执行范围

完整示例：

```js
import { AsyncLocalStorage } from 'node:async_hooks';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';

const context = new AsyncLocalStorage();
let currentId;
async function work(id, milliseconds) {
  currentId = id;
  return context.run({ requestId: id }, async () => {
    await delay(milliseconds);
    console.log({ expected: id, global: currentId, scoped: context.getStore()?.requestId });
  });
}
await Promise.all([work('A', 25), work('B', 5)]);
console.log('outside:', context.getStore());

const bus = new EventEmitter();
context.run({ requestId: 'C' }, () => {
  bus.on('plain', () => console.log('plain:', context.getStore()?.requestId));
  bus.on('bound', AsyncLocalStorage.bind(() => console.log('bound:', context.getStore()?.requestId)));
});
bus.emit('plain');
bus.emit('bound');
bus.removeAllListeners();
context.disable();
```

执行：

```bash
node examples/request-context.mjs
```

B 等待五毫秒，会先输出 expected B、global B、scoped B。A 等待二十五毫秒，会随后输出 expected A、global B、scoped A。这里不是靠日志打印顺序猜上下文，而是让 A 与 B 明确交错，比较同一位置读取两种存储的结果。

`run(store, callback)` 在 callback 中安装 store。该执行期间建立的 Promise 后续、定时器等异步资源会沿着各自的关系取得它，所以 await 之后仍可 getStore。callback 外部的同步执行恢复原上下文；本例最后的 outside 是 undefined，说明没有一个全局的“最后请求”继续污染普通代码。

run 返回 callback 的返回值。本例 callback 为 async，因此 run 返回 Promise，调用者仍要等待这个 Promise、处理其失败。run 不会替你捕获异常，也不创建取消机制；一个任务抛错时，原来的错误传播规则仍成立。

可以把 A 的延迟改成一毫秒、B 改成三十毫秒再运行。完成顺序应交换，scoped 仍分别对应 expected，全局变量仍只保留最后赋进去的 B。再在 work 前后加一条 getStore 输出，核对范围之外仍没有请求身份。这样的变化才说明机制与“恰好按顺序打印”无关。

不要将同一个可变 store 对象重复交给所有请求，再不断修改它的 requestId。AsyncLocalStorage 保存的是对象引用，不会自动复制；两条链虽然都关联到一个 store，却可能恰好关联了同一个被修改的对象。正文每次调用 withRequest 都创建新对象，避免这个共享错误。

## 在请求里注册回调，不保证将来在该请求里调用

示例后半段在 C 的 run 内注册两个 EventEmitter 监听器，然后离开 run，再 emit。plain 应输出 undefined，bound 应输出 C。

原因是 EventEmitter 在 emit 时同步调用监听器。注册地点本身没有为将来的每次调用建立新的异步资源；普通回调运行在触发者的上下文中。把“函数定义在请求里”理解为“以后永远属于这个请求”，会在事件总线、外部库回调和共享资源上造成误判。

`AsyncLocalStorage.bind` 捕获绑定时的执行上下文，返回一个在该上下文执行的新函数。本例 Node 版本已支持这个稳定 API，所以 bound 在外部触发时仍读到 C。它不是把 EventEmitter 整体变成请求级对象，只约束这个绑定函数。

是否应该绑定仍需要判断。假设一个长期共享的连接只注册一次全局监听器，如果恰好在第一条请求里绑定，就会让以后所有事件都看起来属于第一条请求。绑定能保留关系，也能保留错误的关系。对长期资源，通常应该在单次操作时传入操作上下文，或把操作编号附在事件数据中；不能随意捕获某个用户请求作为永久归属。

正文的 finish/close 观察选择另一种明确办法：创建监听器时把该响应的 requestId 放进闭包，在回调执行时重新调用 withRequest。它知道这个回调只属于这一条响应，而且只执行一次，因此可以安全地建立对应范围。这个选择不要求假设事件一定由哪个异步资源发出。

若第三方回调库丢失了上下文，可以在边界前后记录 getStore 是否存在，先找到关系断开的地方，再评估绑定或 Node 的 AsyncResource。不要在每一层随意 enterWith；enterWith 会影响当前同步执行之后的上下文，共享事件处理尤其容易受它影响。run 的起止范围更容易判断。

## 请求结束以后，上下文可能还活着

HTTP 响应结束不会自动销毁该请求创建的所有异步资源。若创建一个长寿命定时器，它可能继续保留上下文；如果 store 里放的是完整 Request、用户对象或大块正文，这些对象也可能因此继续被引用。正文只保留短编号，不把整个请求放进 AsyncLocalStorage。

这也解释了客户端取消后，仍在运行的存储日志为什么可能带原 requestId：它确实源自那次请求，传输结束没有抹掉因果关系。但是有编号不代表客户端仍在线，更不意味着继续执行获得了新的授权。长期任务是否允许继续，应由业务和任务生命周期决定。

进入真正的后台任务时，应建立任务自己的 jobId；可以把来源 requestId 作为可选关联字段保存，而不是永远复用请求上下文。跨进程时需要明确传递允许公开的字段，并在接收方建立新的范围。AsyncLocalStorage 不会跟着 HTTP 报文自动移动，也不是分布式追踪协议。

共享 Logger 不能在某一个请求结束时调用 disable，否则其他正在执行的请求也会丢失上下文。正文只在整个应用完成工作并进入最终关闭钩子时禁用这个实例。本例独立程序则先完成所有异步工作、移除监听器，再 disable。绑定函数与事件监听器若不再使用，也应解除引用；上下文工具不能替你管理无限累积的订阅。

回到主线时，可以分别在 requestObservation 与 ObservedCaptureStore.call 暂停，观察同一次请求输出的编号，再同时发送两条请求验证关联。使用断点时不要据此测量性能；需要保持并发时序，就用按编号筛选的日志。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| AsyncLocalStorage.run | 给一次执行及其异步后续建立上下文 | 返回回调返回值，不捕获异常、不自动取消 |
| getStore | 读取当前链的 store | 范围外可为 undefined；不自行复制对象 |
| bind | 把函数绑定到当前上下文 | 绑定位置必须对应正确归属，长期监听尤其谨慎 |
| EventEmitter.emit | 观察触发时上下文 | 注册位置不等于以后调用的执行上下文 |
| disable | 应用不再使用实例时结束追踪 | 不在单个请求结束时调用 |

官方查阅：[Node 异步上下文](https://nodejs.org/api/async_context.html)、[EventEmitter](https://nodejs.org/docs/latest-v24.x/api/events.html#class-eventemitter)、[Nest AsyncLocalStorage](https://docs.nestjs.com/recipes/async-local-storage)。

[返回第十三章](chapter.md) · [返回第二篇](../README.md)
