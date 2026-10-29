# 支线 9A：令牌怎样找到对象，两个名字是否指向同一实例

先看一种具体故障：创建记录成功，查询却为空。写入和读取使用的都是 MemoryCaptureStore，业务代码也没有抛错。此时若只检查类名，很容易得出“存储应该相同”的判断；需要继续追踪的是实例从哪里来。

这条支线沿这个问题检查两份注册，再改变令牌和初始化条件。它使用独立应用容器，不启动 HTTP，也不连接外部服务。

时间参考（估算）：阅读约 18～22 分钟；编译与五种组装结果对照另加约 12～18 分钟。

## 两处都写同一个类，仍然可能得到两份数据

在普通 JavaScript 中，下列关系并不意外：

```typescript
const first = new MemoryCaptureStore();
const second = new MemoryCaptureStore();
console.log(first === second); // false
```

两个对象各有自己的 Map。把同一个构造函数写进两条独立 Provider 登记，并不会自动消除这种区别：

```typescript
providers: [
  MemoryCaptureStore,
  { provide: CAPTURE_STORE, useClass: MemoryCaptureStore },
]
```

第一项按具体类查找，第二项按能力令牌查找。容器分别为它们创建对象，于是“用 CAPTURE_STORE 写，再从 MemoryCaptureStore 读”可能得到空列表。默认作用域保证的是相应登记被复用，不意味着这个类在整个程序里只能有一个对象。

如果本来就是要两份独立状态，这样登记成立。如果要让两个查找名字取得同一份状态，第二项就应引用第一项已有的提供者：

```typescript
{ provide: CAPTURE_STORE, useExisting: MemoryCaptureStore }
```

这样 useExisting 的选择就有了依据：需要的是同一对象的另一个入口。后面的实验会同时打印对象比较和记录数；只看记录内容碰巧一样，仍不能证明引用相同。

## 已经登记了，为什么仍然找不到

另一个故障发生得更早：应用报告 Reader 的依赖无法解析，诊断里的 Symbol 描述明明与注册处一样。先用一个普通 Map 看这种相等关系：

```javascript
const key = Symbol('STORE');
const registry = new Map([[key, { name: 'memory' }]]);
console.log(registry.get(key));
console.log(registry.get(Symbol('STORE')));
```

第二次创建的是新键，因此查不到。诊断文本显示 STORE，只能帮助人辨认，不能把两次创建的身份合并。修复应是导入同一个令牌值；再复制一遍描述文本没有作用。

实验中的 Reader 采用构造参数装饰器：

```typescript
@Injectable()
class Reader {
  constructor(@Inject(requestedToken) readonly store: CaptureStore) {}
}
```

CaptureStore 是接口，编译后不会留下可用于查找的类值；本例中的 design:paramtypes 因而显示 Object。Inject 补上需要的实际令牌。如果 requestedToken 是重新创建的 Symbol，即使静态类型完全正确，容器仍会寻找另一项登记。

如果直接删掉登记，结果同样是无法解析，但原因不同：前一种找错了键，后一种没有提供这个键。定位时先沿报错中的消费者和参数位置核对来源，再检查模块注册，不要用一个空对象把启动错误推迟成业务调用失败。本支线把全部 Provider 放在同一模块，可见性问题留到下一章单独引入。

## 找到对象之后，它是否已经准备好

再改变一个条件：我们希望先向存储放入一条示例记录，再把“准备好的存储”交给某个调用方。不能仅把准备代码排在 providers 数组前面，期待别的对象晚一点创建；数组位置没有表达这个完成条件。

实验为这个结果单独登记 READY_STORE：

```typescript
{
  provide: READY_STORE,
  useFactory: async (store: CaptureStore, seed: { text: string }) => {
    await store.insert({
      id: 'seed', originalText: seed.text, createdAt: '2026-01-01T00:00:00.000Z',
    });
    return store;
  },
  inject: [CAPTURE_STORE, SEED],
}
```

这个工厂先拿到依赖，再等待插入成功，最后提供结果。需要这项完成保证的消费者应注入 READY_STORE；只依赖 CAPTURE_STORE 的 Reader 可以更早被创建，不能假设它的构造过程已经能看到 seed。

下面的程序在整个应用初始化结束后才观察 Reader，所以它也能看到准备好的数据。这里把“依赖已经存在”“异步准备已完成”“什么时候观察结果”分开，避免从一次输出顺序推断出容器没有承诺的保证。

若准备失败，工厂应拒绝，让应用创建失败。返回 undefined 或假装完成，会把失败藏到后续调用里。本实验只操作短期内存；真实初始化已经打开了连接时，还要按第十三章的生命周期安排收尾，捕获异常本身不代表资源已经清理。

## 把刚才的三个问题放进一个可运行对照

新增 `examples/provider-identity/main.ts`。mode 只用于切换刚才讨论过的差异：alias 与 class 比较复用和创建；wrong-token 与 missing 比较键不一致和没有登记；fail-factory 让准备动作失败。

```typescript
import 'reflect-metadata';
import { Inject, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CAPTURE_STORE } from '../../src/capture-store.js';
import type { CaptureStore } from '../../src/capture-store.js';
import { MemoryCaptureStore } from '../../src/memory-capture.store.js';

const mode = process.argv[2] ?? 'alias';
if (!['alias', 'class', 'wrong-token', 'missing', 'fail-factory'].includes(mode)) {
  throw new Error('Unknown mode');
}
const requestedToken = mode === 'wrong-token' ? Symbol('CAPTURE_STORE') : CAPTURE_STORE;
const READY_STORE = Symbol('READY_STORE');
const SEED = Symbol('SEED');

@Injectable()
class Reader {
  constructor(@Inject(requestedToken) readonly store: CaptureStore) {}
}

@Module({
  providers: [
    MemoryCaptureStore,
    { provide: SEED, useValue: { text: 'Ready before use.' } },
    ...(mode === 'missing' ? [] : [{
      provide: CAPTURE_STORE,
      ...(mode === 'class'
        ? { useClass: MemoryCaptureStore }
        : { useExisting: MemoryCaptureStore }),
    }]),
    {
      provide: READY_STORE,
      useFactory: async (store: CaptureStore, seed: { text: string }) => {
        if (mode === 'fail-factory') throw new Error('Seed preparation failed');
        await store.insert({
          id: 'seed', originalText: seed.text, createdAt: '2026-01-01T00:00:00.000Z',
        });
        return store;
      },
      inject: [CAPTURE_STORE, SEED],
    },
    Reader,
  ],
})
class IdentityModule {}

try {
  const app = await NestFactory.createApplicationContext(IdentityModule, {
    logger: false, abortOnError: false,
  });
  try {
    const concrete = app.get(MemoryCaptureStore);
    const reader = app.get(Reader);
    const ready = app.get<CaptureStore>(READY_STORE);
    console.log('same instance:', concrete === reader.store);
    console.log('ready is injected store:', ready === reader.store);
    console.log('concrete count:', (await concrete.list({})).length);
    console.log('ready count:', (await ready.list({})).length);
    console.log('design type:', Reflect.getMetadata('design:paramtypes', Reader)[0].name);
  } finally {
    await app.close();
  }
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
```

SEED 用 useValue 提供固定初始化数据；Reader 使用显式 Inject；工厂的两个实参按 inject 顺序取得。剩下的代码负责读取结果和关闭应用，没有增加另一套业务规则。

新增 `examples/provider-identity/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "include": ["./*.ts"]
}
```

```bash
npm exec -- tsc -p examples/provider-identity/tsconfig.json
node dist/examples/provider-identity/main.js alias
node dist/examples/provider-identity/main.js class
```

alias 应显示对象相同、两处记录数都为 1；class 应显示对象不同、具体类对应的存储为 0、READY_STORE 为 1。两种模式的 ready is injected store 都为 true，说明工厂返回的是它收到的那份存储；design type 都为 Object，说明接口没有变成运行时类。

再单独执行三个失败模式：

```bash
node dist/examples/provider-identity/main.js wrong-token
node dist/examples/provider-identity/main.js missing
node dist/examples/provider-identity/main.js fail-factory
```

它们应返回非零状态，可以在每次执行后紧接 echo $? 查看。wrong-token 的描述可能看似一致，检查实际导出值；missing 可能先报告 Reader，也可能先报告工厂，因为二者都缺这个依赖，不依赖固定诊断顺序；fail-factory 则报告 Seed preparation failed，表明已经越过了依赖查找，停在准备阶段。

最后还要保留一个边界：令牌找对且对象创建成功，也不能证明它遵守 CaptureStore 的行为。useValue 放入缺少 find 的对象，或者实现一个总是返回空数组的 list，都不是令牌机制能够替你检查的。先核对身份与组装，再核对对象行为，才能把“查不到 Provider”和“业务查不到记录”分开。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| Symbol 身份 | 区分令牌值和诊断描述 | 相同描述的新 Symbol 无法替代导出令牌 |
| Inject | 明确 Reader 的运行时依赖 | 接口类型描述为 Object，不会自动选择实现 |
| useClass／useExisting | 对照新建和别名 | 两份注册可以产生同类的不同实例 |
| useValue／SEED | 传入固定初始化数据 | 实际提供原对象，不等于不可变配置 |
| 异步工厂／inject | 等待准备并表达依赖顺序 | 依赖准备结果应注入对应令牌，不靠数组排序 |
| abortOnError: false | 将创建失败交回调用者 | 不能据此推断外部资源已自动清理 |

官方查阅：[Nest 11 自定义 Provider](https://docs.nestjs.com/v11/fundamentals/custom-providers)、[异步 Provider](https://docs.nestjs.com/v11/fundamentals/async-providers)、[TypeScript 装饰器元数据](https://www.typescriptlang.org/tsconfig/emitDecoratorMetadata.html)。

[返回第九章](chapter.md#本章知识支线) · [返回第二篇](../README.md)
