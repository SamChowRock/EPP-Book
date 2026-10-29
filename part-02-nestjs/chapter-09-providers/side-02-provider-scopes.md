# 支线 9B：对象由谁共享，作用域怎样沿依赖传播

假设为了让请求之间互不干扰，把主线的内存存储设成“每个请求创建一份”。创建接口可能照常返回 201，紧接着查询却看不到刚才的记录：查询请求拿到了一张新 Map。这个现象先说明了一件事——并非所有状态都应该随请求隔离。

反过来，若把某次请求的输入暂存在共享 Service 字段里，await 期间另一个请求又改写该字段，前一个请求恢复执行时也可能读错。我们需要区分记录属于应用中的共享存储，临时输入属于一次调用，再决定对象怎样创建和复用。

主线存储需要跨请求复用；Nest 当前的默认作用域正适合这个条件。确实只属于一次请求的对象，可以用请求作用域。接下来先追踪这样一个对象被其他对象持有后会发生什么，再用独立容器验证，不增加 HTTP 业务或用户系统。

时间参考（估算）：阅读约 17～22 分钟；运行和两次作用域变更对照另加约 12～18 分钟。

## 请求作用域为什么会沿依赖向上影响消费者

先设想一个 RequestReader，它通过构造参数持有 RequestCounter。计数器只应属于本次请求；若 Reader 却被所有请求共享，它保存的那个构造参数就无法同时代表不同请求的计数器。

为了让 Reader 持有正确的计数器，容器也必须按请求上下文创建相应 Reader。即使 Reader 自己没有声明请求作用域，这条依赖仍会影响它的创建范围。请求作用域沿依赖链向消费者传播，正是为了解决这个引用关系。

在 HTTP 服务里，如果 Controller 依赖了这样的 Service，也会受到这条依赖链的影响。增加 request Provider 的成本不能只数新增那个类，还要看它被谁依赖；更多实例意味着更多创建和回收工作。使用与否应由真实状态归属和测量依据决定，不能简单宣布 request 一定更安全或一定不能用。



## transient 为何不等于每次调用都创建

再考虑另一种需求：FirstConsumer 和 SecondConsumer 各自需要一个辅助 Stamp，但每个消费者内部都可以长期复用自己的那一份。这只要求两个消费者不要共用 Stamp，并不要求消费者跟随请求重新创建。

transient 正好表达这项创建关系。它不像 request 那样必然让默认消费者一起变短命。它满足的是“不同消费者不共享这份依赖”，没有要求消费者本身每次请求都重建。一个长期消费者拿到 transient 日志辅助对象后，可以在整个生命周期里复用它；如果你需要每次业务操作都新建一份操作状态，应显式在操作内部创建，或设计相应工厂，不能靠 transient 名字猜行为。


## 回到存储：共享、持久化和数据隔离是三件事

主线默认存储实例只在当前应用容器内共享。启动两个独立应用，即使使用同一个模块类，也会创建各自的 useClass 实例；启动两个进程则更不可能共享普通 Map。将来两个进程都连接同一个数据库，记录共享来自外部数据库，而不是 Nest 的单例跨过了进程边界。

useValue 还有一个容易忽略的例外：如果你在模块文件顶层先 new 一个可变对象，再把同一引用交给同一进程里创建的两个应用容器，它们可能共享这份外部值。不能因此说“应用容器互不隔离”；共享来源是调用者在容器之外主动传了同一对象。需要每个应用独立构造时，应把创建动作放到相应类或工厂注册里。

因此诊断状态问题要把创建位置也算进去。主线使用 useClass 创建存储，容器控制这份对象的创建；固定详情示例使用 useValue，明确使用已有对象。两种选择的寿命含义并不相同。

与此同时，默认共享 Service 可以安全处理多个请求，前提是别把属于某一次调用的临时数据写进共享字段。方法参数和局部变量各属一次调用；成员字段则属于实例。若在共享 Service 中先写 `this.currentText = input`，await 一个操作后再读这个字段，期间其他请求可能已经写入新值。单线程能保证某段同步代码不被另一段 JavaScript 同时执行，却不能消除 await 之间的交错。

遇到这种情况，优先让单次操作的数据沿参数和局部变量传递。request scope 可以适用于确有请求范围对象的场景，但不应当成为修复所有共享状态设计的开关。未来账号隔离仍需在业务和查询中落实归属条件，不能因为创建了请求对象就省略权限检查。

这些分析先建立了选择依据。下面再用引用比较和计数观察容器是否按这样的关系提供对象。


## 用同一段程序核对这些创建关系

新增 `examples/provider-scopes/main.ts`：

```typescript
import 'reflect-metadata';
import { Injectable, Module, Scope } from '@nestjs/common';
import { ContextIdFactory, NestFactory } from '@nestjs/core';

@Injectable()
class SharedCounter {
  count = 0;
}

@Injectable({ scope: Scope.REQUEST })
class RequestCounter {
  count = 0;
}

@Injectable()
class RequestReader {
  constructor(readonly counter: RequestCounter) {}
}

@Injectable({ scope: Scope.TRANSIENT })
class Stamp {}

@Injectable()
class FirstConsumer {
  constructor(readonly stamp: Stamp) {}
}

@Injectable()
class SecondConsumer {
  constructor(readonly stamp: Stamp) {}
}

@Module({
  providers: [SharedCounter, RequestCounter, RequestReader, Stamp,
    FirstConsumer, SecondConsumer],
})
class ScopeModule {}

const app = await NestFactory.createApplicationContext(ScopeModule, {
  logger: false, abortOnError: false,
});
try {
  app.get(SharedCounter).count++;
  console.log('shared count:', app.get(SharedCounter).count);
  const firstContext = ContextIdFactory.create();
  const secondContext = ContextIdFactory.create();
  const first = await app.resolve(RequestReader, firstContext);
  first.counter.count++;
  const again = await app.resolve(RequestReader, firstContext);
  const second = await app.resolve(RequestReader, secondContext);
  console.log('same context reader:', first === again);
  console.log('another context reader:', first === second);
  console.log('request counts:', again.counter.count, second.counter.count);
  const a = app.get(FirstConsumer);
  const b = app.get(SecondConsumer);
  console.log('different consumers share stamp:', a.stamp === b.stamp);
  console.log('same consumer keeps stamp:', a.stamp === app.get(FirstConsumer).stamp);
} finally {
  await app.close();
}
```

其中 SharedCounter 没有设置 scope，使用默认行为；RequestCounter 指定 request；RequestReader 自己没有指定 request，但构造参数依赖 RequestCounter。两个默认消费者分别接收 transient 的 Stamp，用对象引用比较即可观察身份，不依赖随机数或时间差。

HTTP 应用会为请求建立相关上下文；这里没有网络监听，所以使用 ContextIdFactory.create 显式创建两个独立上下文标识，再调用 resolve。这个方法让我们有限地观察同一上下文和不同上下文的依赖树，不必先引入请求日志、账号或其他业务。

get 用于取得可直接复用的实例；解析请求或 transient 作用域依赖时，使用 resolve 并管理相应上下文。不要绕过这一区别，把 get 的失败强行用类型断言掩盖。也不要把这两个显式标识做成应用级“永久请求”，那会让本应短期的状态意外保留。

这些标识不是用户 ID、数据库事务或真实的 Request 对象。我们也没有向它们注册 HTTP 请求对象，因此不能在这里假设注入 REQUEST 就能拿到真实请求。需要真实请求上下文数据时，应回到对应的 HTTP 入口处理，不能靠创建一个标识替代。

添加 `examples/provider-scopes/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "include": ["./*.ts"]
}
```

编译并运行：

```bash
npm exec -- tsc -p examples/provider-scopes/tsconfig.json
node dist/examples/provider-scopes/main.js
```

正常输出应为：

```text
shared count: 1
same context reader: true
another context reader: false
request counts: 1 0
different consumers share stamp: false
same consumer keeps stamp: true
```

这里没有用请求之间的时间间隔证明共享；比较的是相同上下文标识、依赖实例和消费者引用，因此结果能直接对应容器规则。


## 改变条件，再核对实例关系

现在再改变一次创建条件：取得消费者 a 后，多次读取 a.stamp，不会变化；把 Stamp 临时改成默认的 `@Injectable()`，重新编译后，两个不同消费者也会共享同一份 Stamp，第一条比较会变为 true。观察后恢复 transient 配置。

再把 RequestCounter 临时改成默认 Injectable，重新编译运行。RequestReader 不再有请求作用域依赖，两次上下文解析会回到同一个默认对象，another context reader 会变为 true，两个计数都为 1。不是 ContextIdFactory 失效，而是这条依赖树已没有按请求拆分实例的必要。实验结束恢复原配置并重新编译。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| Scope.DEFAULT | 应用内复用注册实例 | 创建来源和模块注册关系仍需核对 |
| Scope.REQUEST | 按上下文提供实例 | 依赖它的消费者也可能随上下文解析 |
| Scope.TRANSIENT | 给不同消费者独立实例 | 同一长期消费者不会每次方法调用都重新注入 |
| ContextIdFactory.create | 创建独立解析上下文标识 | 不代表真实 HTTP 请求、用户或事务 |
| resolve／get | 分别观察上下文解析与默认对象获取 | 不把普通 get 用于取得请求作用域对象 |
| 构造位置／useValue | 判断跨容器共享来源 | 外部同一引用可以被多个容器同时使用 |

官方查阅：[Nest 11 注入作用域](https://docs.nestjs.com/v11/fundamentals/injection-scopes)、[ModuleRef 与上下文解析](https://docs.nestjs.com/v11/fundamentals/module-ref)、[独立应用](https://docs.nestjs.com/v11/standalone-applications)。

[返回第九章](chapter.md#本章知识支线) · [返回第二篇](../README.md)
