# 支线 7C：亲手实现一个最小 Nest

7A 分开看过装饰器与元数据，7B 分开看过 Express 请求链。现在把它们连接起来：业务代码声明 Controller 和 Module，框架自己创建依赖、注册路由，再把一次 HTTP 请求交给正确的方法。

我们写一个约 120 行核心代码的 Mini Nest，复用第七章已经建立的 `CapturesService`。它采用 Nest 的几个核心思路，但实现是我们自己的小模型；业务示例不会导入 `@nestjs/*`。这样可以直接追踪一次调用，而不必先读懂完整框架的全部扩展机制。

**阅读前提**：完成第七章正文，能解释 7A 的元数据与 7B 的中间件调用。代码位于 `examples/mini-nest/`，沿用本章分支 `part-02/chapter-07`，使用独立端口 `3004`。

时间参考（估算）：阅读约 25～32 分钟；编写、编译、请求核对与失败对照另加约 20～30 分钟。

## 先确定这个小框架替我们做什么

手动组装时，我们自己创建 Service，再传给 Controller，并为每个方法写 Express 路由。现在把这些动作集中到 `createMiniApp(RootModule)`：它只接收根模块，就建立可以监听的应用。

本例支持一个根模块、类 Provider、同一应用内共享实例、GET／POST 路由、请求体与路径参数，以及返回值到 JSON 的转换。先做到这条链完整可运行，再用已有业务检查它。跨模块的 imports／exports、请求级实例和 Nest 请求管线需要更大的实现，后文会明确它们与本例的区别。

注意两种时间：**启动时解决“谁依赖谁、哪个地址调用哪个方法”；每次请求时解决“这次传入什么、返回什么”。** 如果把对象创建放进每次请求，内存记录就会随请求重新开始；如果在启动时读取请求体，则根本还没有那次请求。

## 第一步：把声明保存成框架能读取的数据

新建 `examples/mini-nest/framework.ts`。下面四段代码按顺序拼在同一文件中，先写类型、元数据键与装饰器：

```typescript
import 'reflect-metadata';
import express from 'express';
import type { Request, ErrorRequestHandler } from 'express';

type Type = new (...args: any[]) => object;
type ModuleOptions = { providers: Type[]; controllers: Type[] };
type Route = { method: 'get' | 'post'; path: string; key: string | symbol };
type Extract = (request: Request) => unknown;
const MODULE = Symbol('module');
const PREFIX = Symbol('prefix');
const ROUTES = Symbol('routes');
const PARAMS = Symbol('params');

export function Module(options: ModuleOptions): ClassDecorator {
  return (target) => { Reflect.defineMetadata(MODULE, options, target); };
}

export function Controller(prefix: string): ClassDecorator {
  return (target) => { Reflect.defineMetadata(PREFIX, prefix, target); };
}

function route(method: Route['method'], path: string): MethodDecorator {
  return (target, key) => {
    const routes: Route[] = Reflect.getOwnMetadata(ROUTES, target) ?? [];
    Reflect.defineMetadata(ROUTES, [...routes, { method, path, key }], target);
  };
}
export const Get = (path = '') => route('get', path);
export const Post = (path = '') => route('post', path);

function argument(extract: Extract): ParameterDecorator {
  return (target, key, index) => {
    if (key === undefined) throw new Error('Only route parameters are supported');
    const params: Map<number, Extract> =
      Reflect.getOwnMetadata(PARAMS, target, key) ?? new Map();
    params.set(index, extract);
    Reflect.defineMetadata(PARAMS, params, target, key);
  };
}
export const Body = () => argument((request) => request.body);
export const Param = (name: string) => argument((request) => request.params[name]);

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
```

`Module` 保存组件清单，`Controller` 保存前缀，`Get`／`Post` 保存方法键与路径。这些函数都还没有创建 HTTP 服务。Symbol 分别标识不同种类的描述，避免几个普通字符串键意外重名。

`Body()` 和 `Param('id')` 多做了一步：按参数下标保存一个提取函数。类定义时保存的是“将来怎样从请求取值”，提取函数要等具体请求到来才执行。这样不用根据 TypeScript 参数名猜测来源，也不必给每个 Controller 手写一层请求适配。

构造函数的依赖描述继续由 TypeScript 的 `emitDecoratorMetadata` 发出。本例 Controller 有类装饰器，编译器会记录它所需的 `CapturesService`；这个 Service 本身没有构造参数，不需要另一份描述。若继续增加带构造依赖的 Provider，也必须为它发出或显式提供元数据，单独写一个类型注解不够。

这里的 `Type` 用 `any[]` 表达不同类各自的构造参数列表，只在框架创建对象的位置使用。它不证明传入数据合法；HTTP 输入仍保持 `unknown`，业务规则仍由 Service 校验。

## 第二步：沿依赖关系创建对象，并记住已创建的实例

接着写应用工厂的前半段：

```typescript
export function createMiniApp(root: Type) {
  const options: ModuleOptions | undefined = Reflect.getOwnMetadata(MODULE, root);
  if (!options) throw new Error('Root module metadata is missing');
  const allowed = new Set([...options.providers, ...options.controllers]);
  const instances = new Map<Type, object>();
  const constructing = new Set<Type>();

  function resolve(type: Type): object {
    if (!allowed.has(type)) throw new Error(`Provider is not registered: ${type.name}`);
    const existing = instances.get(type);
    if (existing) return existing;
    if (constructing.has(type)) throw new Error(`Circular dependency: ${type.name}`);
    const deps: Type[] | undefined = Reflect.getOwnMetadata('design:paramtypes', type);
    if (!deps && type.length > 0) throw new Error(`Constructor metadata is missing: ${type.name}`);
    constructing.add(type);
    try {
      const instance = new type(...(deps ?? []).map(resolve));
      instances.set(type, instance);
      return instance;
    } finally {
      constructing.delete(type);
    }
  }

  for (const type of allowed) resolve(type);
```

先读根模块清单，把 Provider 与 Controller 放入允许创建的集合。`resolve(type)` 接收一个类值作为查找键：如果此前创建过，就返回同一个对象；否则读取构造参数的类列表，逐个 resolve，最后把得到的实例传入 `new type(...)`。

以记录入口为例，创建 `MiniCapturesController` 需要 `CapturesService`。容器先拿到 Service，再执行相当于 `new MiniCapturesController(service)` 的构造。这正是正文里的手动组装，只是依赖顺序由描述推导。

`instances` 是应用内部的实例缓存，`constructing` 则标记当前递归链上正在创建的类。两者不能混为一谈：已经创建过的对象可以复用，尚未完成创建却再次被自己依赖，说明形成了环。本例直接拒绝这个环，避免无限递归。

把类放进文件并不等于注册。依赖不在 allowed 中时，启动就报出缺失的 Provider；有必需构造参数却没有元数据时，也明确失败。这里用构造函数的 `length` 做简化检查，仅适用于本例的显式必需参数；默认参数、继承和其他元数据行为不在这个小实现的契约里。

最后遍历集合，先完成对象创建。由于缓存存在，Provider 在清单中的先后顺序不必恰好等于依赖顺序。两个 `createMiniApp()` 各自创建缓存，因此各自拥有内存状态；“单例”在这里指当前应用中的复用，不是整个机器上只能有一个对象。

## 第三步：把 Controller 方法接到 Express

继续写同一个 `createMiniApp()`：

```typescript
  const app = express();
  app.use(express.json({ limit: '16kb' }));
  const registered = new Set<string>();

  for (const type of options.controllers) {
    const prefix: string | undefined = Reflect.getOwnMetadata(PREFIX, type);
    if (prefix === undefined) throw new Error(`Controller prefix is missing: ${type.name}`);
    const instance = resolve(type);
    const routes: Route[] = Reflect.getOwnMetadata(ROUTES, type.prototype) ?? [];
    for (const route of routes) {
      const path = prefix + route.path;
      const signature = `${route.method} ${path}`;
      if (registered.has(signature)) throw new Error(`Duplicate route: ${signature}`);
      registered.add(signature);
      const handler: unknown = Reflect.get(instance, route.key);
      if (typeof handler !== 'function') throw new Error('Route handler is not a function');
      const params: Map<number, Extract> =
        Reflect.getOwnMetadata(PARAMS, type.prototype, route.key) ?? new Map();
      app[route.method](path, async (request, response) => {
        const args: unknown[] = [];
        for (const [index, extract] of params) args[index] = extract(request);
        const result = await handler.apply(instance, args);
        response.status(route.method === 'post' ? 201 : 200).json(result);
      });
    }
  }
```

启动阶段读取 Controller 的前缀、方法和参数描述，拼出路由地址，取得已经创建的实例，然后调用 Express 的 `get` 或 `post` 注册包装函数。为使拼接直观，本例约定 Controller 前缀写 `/captures`，方法路径写空串或 `/:id`，没有额外实现路径规范化。

真正的 HTTP 请求到来后，才执行包装函数：按下标提取 body／id，组成参数数组，调用 `handler.apply(instance, args)`。apply 保留正确的 `this`，因此 Controller 才能使用构造时拿到的 Service。

包装函数等待返回结果，再决定状态码并输出 JSON。它接受同步返回值或 Promise；方法失败则让返回的 Promise 拒绝，由 Express 5 交到下面的错误处理。本例因此能让 Controller 直接 `return capture`，不再需要显式接收 Response 并调用 `end()`。这项便利来自我们刚写出的调用包装，并非装饰器本身发送了响应。

解析器在路由之前注册，参数提取阶段读取的是解析后的 body，不再重复消费请求流。重复的“方法＋路径”在启动时拒绝，让一次意外声明不会悄悄被另一条路由遮住。

## 第四步：完成响应的最后出口

将框架文件的最后一段接上：

```typescript
  app.use((_request, response) => {
    response.status(404).json({ error: 'Route not found' });
  });
  const onError: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (response.headersSent) return next(error);
    const parserType = error !== null && typeof error === 'object' && 'type' in error
      ? error.type : undefined;
    const status = error instanceof HttpError ? error.status
      : parserType === 'entity.parse.failed' ? 400
      : parserType === 'entity.too.large' ? 413 : 500;
    if (status === 500) console.error(error);
    const message = error instanceof HttpError ? error.message
      : status === 400 ? 'Invalid JSON'
      : status === 413 ? 'Request body is too large' : 'Internal server error';
    response.status(status).json({ error: message });
  };
  app.use(onError);
  return app;
}
```

普通请求走到尽头仍未匹配，得到 404；失败请求进入四参数错误处理。`HttpError` 是 HTTP 适配层能够主动表达的失败，JSON 解析错误与大小超限也各有结果；未知错误记录诊断并返回通用 500。已发送响应头后，继续交给 Express 收尾，不能重新发送一份完整 JSON。

这部分沿用 7B 已经解释的错误传播，没有另写一套网络协议。核心代码到此结束：元数据给出描述，容器给出实例，路由包装把描述和实例接到一次真实请求上。

## 用原来的业务检查框架，而不是重写业务规则

新建 `examples/mini-nest/app.ts`：

```typescript
import { Module, Controller, Get, Post, Body, Param, HttpError } from './framework.js';
import {
  CapturesService, InvalidCaptureError, CaptureNotFoundError,
} from '../../src/captures.service.js';

function asHttp<T>(action: () => T): T {
  try {
    return action();
  } catch (error) {
    if (error instanceof InvalidCaptureError) throw new HttpError(400, error.message);
    if (error instanceof CaptureNotFoundError) throw new HttpError(404, error.message);
    throw error;
  }
}

@Controller('/captures')
export class MiniCapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Get()
  list() {
    return { items: this.captures.list() };
  }

  @Post()
  create(@Body() body: unknown) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
      throw new HttpError(400, 'Request body must be a JSON object');
    }
    return asHttp(() => this.captures.create(
      'originalText' in body ? body.originalText : undefined,
    ));
  }

  @Get('/:id')
  detail(@Param('id') id: string) {
    return asHttp(() => this.captures.find(id));
  }
}

@Module({ providers: [CapturesService], controllers: [MiniCapturesController] })
export class MiniAppModule {}
```

这里导入的是我们自己的装饰器和第七章的业务类。`asHttp()` 在当前同步业务调用的边界内，把业务失败翻译成 HTTP 失败；原文是否有效、ID 如何生成、数据怎样保存，仍由已有 Service 决定。它没有因为底层换成 Mini Nest 就加入框架依赖。

默认 GET 返回 200，POST 返回 201，详情从路径取 ID。业务方法的类型注解不会自动校验网络输入，所以 create 仍先判断请求体形状，再把字段交给业务规则。框架解决调用组织，业务与输入规则仍然需要实际实现。

新建 `examples/mini-nest/main.ts` 启动实验：

```typescript
import { createMiniApp } from './framework.js';
import { MiniAppModule } from './app.js';

try {
  const app = createMiniApp(MiniAppModule);
  const server = app.listen(3004, '127.0.0.1', () => {
    console.log('Mini Nest listening on http://127.0.0.1:3004');
  });
  server.on('error', (error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
```

再新增 `examples/mini-nest/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "../..",
    "outDir": "../../dist"
  },
  "include": ["./*.ts"]
}
```

它继承本章的 ESM 与装饰器编译配置。因为示例导入了现有 `src/captures.service.ts`，rootDir 保留项目根目录，产物继续放在 `dist/`；示例入口为 `dist/examples/mini-nest/main.js`。服务的常规 build 会清理 dist，清理后需要重新编译这个独立示例。

```bash
npm exec -- tsc -p examples/mini-nest/tsconfig.json
node dist/examples/mini-nest/main.js
```

另开终端：

```bash
curl -i http://127.0.0.1:3004/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"  I want to understand how this works.  "}'
curl -i http://127.0.0.1:3004/captures
```

创建返回 201，列表返回 200 且包含刚才的原文。复制实际 ID，用 `GET /captures/<id>` 读取详情，内容应一致。再提交空白字符串，得到 400，列表不增加记录；请求 `/captures/missing` 得到 404。重复调用能读回记录，说明同一个应用确实复用了 Service。

这次实验复用业务能力，HTTP 外层只实现了上面列出的最小约定。主线的 Location、405／Allow、原始路径兼容处理仍留在主线；本例直接采用 Express 路由匹配与 JSON 解析，不用它替换当前服务。两个程序分别启动，也不会共享 Map。

## 删掉一个条件，看清是哪一层失效

先停止实验，在 MiniAppModule 中把 providers 改成空数组，重新编译并启动。应在监听前得到 `Provider is not registered: CapturesService`。Controller 的类型与方法都存在，但容器没有权利自行把未注册的类纳入应用。恢复清单后再继续。

然后只改变编译条件：

```bash
npm exec -- tsc -p examples/mini-nest/tsconfig.json --emitDecoratorMetadata false
node dist/examples/mini-nest/main.js
```

这次应在监听前得到 `Constructor metadata is missing: MiniCapturesController`。模块清单存在，路由装饰器也仍执行，但框架已经不知道构造参数要传入谁。记录描述、登记组件和创建实例是相互关联的不同步骤。实验后恢复正常产物：

```bash
npm exec -- tsc -p examples/mini-nest/tsconfig.json
```

再看一种不必破坏代码就能判断的变化：如果把实例缓存移到每次请求的包装函数中，并每次重新创建 Service，原文就会保存在不同的 Map 中。路由本身仍能匹配，创建也可能成功，但下一次列表为空。借助错误发生的阶段，应该能区分注册问题、依赖问题与实例寿命问题。

## 这个小模型与 Nest 实际实现怎样对应

对照 Nest 11 的实现，可以找到相同职责：`DependenciesScanner` 读取模块与依赖声明，`Injector` 解析构造依赖并管理实例，`PathsExplorer` 与 `RouterExplorer` 发现 Controller 路由并接到 HTTP 适配器，调用包装负责准备参数、执行方法和处理结果。它们被拆成多个协作组件；本例把这些职责压缩在一个文件里。

| 本例已经做出的机制 | Nest 在相同问题上还处理什么 |
| --- | --- |
| 单个根模块的组件清单 | 模块导入、导出、可见性及模块依赖图 |
| 类令牌、递归创建和应用内实例缓存 | 值／工厂等 Provider、异步初始化及多种作用域 |
| 自己保存的路由和参数描述 | 更完整的方法扫描、参数处理与请求执行管线 |
| 直接绑定 Express 并返回 JSON | HTTP 平台适配、更多响应类型与异常机制 |

我们没有通过“写完这些代码”就获得完整 Nest 的能力，但已经能解释它的基本实现路径：描述要由代码读取，依赖要按关系创建，实例要有寿命，路由要绑定到实际调用，返回值要有明确的发送出口。第九、十、十二章增加新的约束时，可以回到这个模型，指出原来哪项简化已经不够，而不是重新接受一组没有来由的 API。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| 自定义 Module／Controller／Get／Post | 保存组件与路由描述 | 来自本例 framework.ts，没有调用 Nest 装饰器 |
| Body／Param 的提取函数 | 按参数下标组织实际调用 | 定义时记录来源，请求时才读取值；不自动验证字段 |
| `design:paramtypes` | 指出构造函数依赖哪些类 | 需要匹配的编译配置，声明接口不能自动成为类令牌 |
| allowed／instances／constructing | 分别控制注册、共享与循环检测 | 三者职责不同；本例按应用缓存，没有跨模块可见性 |
| `handler.apply()` 与 await | 绑定接收者，等待方法结果 | 实例创建在启动阶段，实际调用在请求阶段 |
| Express 路由与错误出口 | 提供网络接入、JSON 与失败响应 | 本例的最小 HTTP 约定不等同于主线完整兼容行为 |

官方查阅：[Nest 依赖解析](https://docs.nestjs.com/fundamentals/custom-providers)、[模块](https://docs.nestjs.com/modules)、[请求生命周期](https://docs.nestjs.com/faq/request-lifecycle)、[Nest 源码项目](https://github.com/nestjs/nest)、[Express 错误传播](https://expressjs.com/en/guide/error-handling/)。本例是独立实现，机制对应以本章固定的 Nest 11 为参照。

[返回第七章正文](chapter.md) · [返回第二篇](../README.md)
