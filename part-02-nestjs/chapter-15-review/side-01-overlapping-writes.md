# 支线 15A：两次写入同一个 ID，存储还能兑现承诺吗

第 15 章把 Map 换成数组，顺着创建、列表、详情走了一遍。现在换一个调用方。它已经持有一条带 ID 的记录，又有另一个调用者试图用同一 ID 写入不同原文。两个调用都已经发出，第一个调用的结果还没有交回。接班人问：“最后查到一条，是不是就可以验收？”先别回答。只说条数，连最后应该留下哪份原文都还没有说清。

沿用 15.2 单独的数组参考目录和里面的两种存储，阅读约 14～18 分钟，操作另加约 13～18 分钟。全程在本机进程直接调用存储。日常 HTTP 的创建接口由 Service 分配 ID，连按两次 Send 会得到两个新 ID，不能造出这里的条件。

## 先把两个调用各自能看见的结果写下来

设 A 的原文为“初稿”，B 的原文为“改稿”，其余字段完全相同。两次 insert 都是新建操作。若 A 已经成功，B 再来时应遭到重复 ID 拒绝。随后按 ID 找到的应该仍是“初稿”。这条规则同时保护了两个对象：A 得到的成功承诺，以及 B 对自己这次操作是否生效的判断。一个偷偷覆盖 A 并向 B 报成功的实现，即使列表长度永远是 1，也已经改变了约定。

把“已经成功”换成“两次重叠”，判断得稍微收紧。若系统只承诺同一 ID 有一个赢家，就先要求一个成功、一个拒绝，只留下成功者的内容。哪一方先赢需要执行顺序作证。本实验在同一进程中按 A、B 次序调用，下面还会看清它为什么留下 A。未来两个不同进程向数据库发请求，不能仅凭客户端的发出顺序断言赢家。

## 用已有的两种存储发出同一对调用

在 VS Code 打开 15.2 的 `epp-chapter-15-reference` 目录。关闭其中的开发监听器，在集成终端执行 `npm run check`，再打开 `examples/overlapping-writes.mjs`。如果是之前取得的参考目录，可以在 examples 下按此文件名保存下面的完整代码。两个类来自刚构建的 dist，每次调用 observe 都会得到一份空存储。先读发起调用的那一行，再看结果里分别保留了哪三样证据。

```js
import { ArrayCaptureStore } from '../dist/src/array-capture.store.js';
import { MemoryCaptureStore } from '../dist/src/memory-capture.store.js';

const a = {
  id: '00000000-0000-4000-8000-000000000001',
  originalText: '初稿',
  createdAt: '2026-01-01T00:00:00.000Z',
};
const b = { ...a, originalText: '改稿' };

async function observe(Store) {
  const store = new Store();
  const attempts = await Promise.allSettled([store.insert(a), store.insert(b)]);
  const rows = await store.list({});
  const found = await store.find(a.id);
  return {
    outcomes: attempts.map(result => result.status),
    texts: rows.map(row => row.originalText),
    detail: found?.originalText,
  };
}

for (const Store of [ArrayCaptureStore, MemoryCaptureStore]) {
  console.log(Store.name, await observe(Store));
}
```

在项目根目录执行 `node examples/overlapping-writes.mjs`，分别看 ArrayCaptureStore 和 MemoryCaptureStore 的输出。两次都应看到 outcomes 依次为 fulfilled、rejected，texts 只有“初稿”，detail 也是“初稿”。allSettled 会等两个调用都结束，结果数组与传入顺序对应，所以第二项可以直接对回 B。用 Promise.all 时，一个拒绝就会让外层等待抛错，其他调用仍可能进行；只打印捕获到的错误，会丢掉这里最需要的另一方结果。反过来，allSettled 也不会让两段同步代码凭空交错。

展开两个 insert 的源码。数组先用 some 查 ID 再 push，Map 先 has 再 set。两者虽然声明为 async，从开始检查到写完都没有暂停点。在这个进程里求值 `store.insert(a)` 时，A 已经完成这两步，才轮到求值 B 的调用。调用方稍后才 await 到结果，与 A 何时改了存储，是两件可以分别观察的事。

## 只改变检查与写入之间能否暂停

在编辑器并排打开 `src/array-capture.store.ts` 和 `src/memory-capture.store.ts`。只在各自的 insert 中、重复检查已经通过之后、紧挨着 push 或 set 之前插入一行 `await Promise.resolve();`。两处都保存。它模拟以后存储操作中出现的一次异步间隔。Promise 已经兑现，await 仍会把后半段安排到当前同步调用结束以后继续。无需调节定时器，也无需碰运气连点两次。

先写下预测。A 的前半段检查时，谁已经在列表里？A 暂停后 B 开始检查时，A 已经写进去了没有？两边都通过检查后，即使后半段依次执行，谁还会再检查一次？在终端重新执行 `npm run check`，然后执行 `node examples/overlapping-writes.mjs`。先构建再观察，确保本轮从 dist 导入的是刚才改过的两个类。

| 这一轮观察什么 | 数组 | Map |
| --- | --- | --- |
| A、B 的结果 | 两个 fulfilled | 两个 fulfilled |
| 列表中的原文及顺序 | 初稿、改稿 | 只有改稿 |
| 同一 ID 的详情 | 初稿 | 改稿 |

数组 push 两次，会留下两个具有同一身份的元素。find 从前向后查，仍可能让只读详情的人以为 A 的写入完好。Map 对同一键 set 两次，第二次替换原值，所以只检查条数的人也会得到“通过”。现在回到开头那句验收意见：只看条数会放过 Map，只看详情是初稿会放过数组，连同两个调用的结果一起看才能解释究竟破坏了哪条承诺。

若结果仍与第一轮一样，先在 VS Code 打开 dist 中对应的 .js，确认暂停点确实出现在检查与写入之间，再重新运行观察脚本。如果把 await 放在检查之前，两位调用者恢复后仍各自连续完成检查与写入；放在写入之后，另一位检查时也已经看得到 A。可以任选一处移动它，先预测，再重新构建并观察。定位问题所需的条件是**两个调用都在第一次写入之前通过了检查**，仅仅知道“程序里有 await”无法决定结果。

## 把承诺交还给实际拥有数据的一方

在这两份内存实现里，去掉刚才加入的等待，就恢复了同一对象、同一进程内原来的行为。用一个共享的执行队列依次处理写入也能阻止重叠，但会让本可互不干扰的不同 ID 排队，而且只有进入同一队列的调用才受约束。将来若有两个进程，各自创建一个队列，两边仍能同时通过各自的检查。这时要向共同存储提出一个完整操作，让它在写入时裁决同一 ID 的竞争，并让失败的一方拿到明确结果。第三篇建立主键和唯一约束时，可以带着这三个观察量再去核验。

还有一种真正不同的需求：“我想对同一次用户提交重试，第二次也应读到第一次的成功结果。”本实验中两个文本不同，insert 的约定是拒绝重复身份。把所有冲突都改成成功会把 B 的“改稿”藏起来。要赋予重试新的含义，还需要定义怎样认出同一次操作、怎样核对输入以及怎样取回上次的结果。当前练习到辨认差别为止。

收尾时只删掉本支线插入的两行，保存、重新运行 `npm run check`，再运行观察脚本，核对两种实现都回到第一轮结果。再回 15.2 看“可以替换”的判断：顺序读写、返回副本和调用重叠分别检验了不同承诺。

## 附录：本支线必要技术点速查

| 看到的现象 | 用什么核对 |
| --- | --- |
| 两个调用的完成时间可能不同 | allSettled 按输入位置列出各自结果，再核对实际数据 |
| 查重和写入被 await 隔开 | 画出两次检查和两次写入的先后，寻找都通过检查的窗口 |
| 列表只有一行 | 再查成功方的原文是否保持、另一方是否确实收到拒绝 |
| 多个进程共用一个存储 | 唯一性必须由所有写入者共同经过的边界裁决 |

[返回第十五章](chapter.md) · [返回第二篇](../README.md)
