# 支线 7A：装饰器何时执行，Nest 怎样读懂它

正文已经让 Nest 为 Controller 提供了 `CapturesService`。如果只把这个过程记成“构造函数里写一个类型，框架就会注入”，遇到编译工具变化、接口类型或注册遗漏时，就很难解释失败。这条支线先亲手记录和读取一份路由描述，再回到普通对象构造，追踪依赖描述怎样进入运行时。

时间参考（估算）：阅读约 28～35 分钟；运行路由注册、元数据与业务边界对照另加约 15～20 分钟。若已在正文运行过正常示例，不重复计算该步骤。

## 先把 @ 写法还原成函数执行

看到 `@Get('/captures')`，容易把它理解成“给方法写了一条路由注释”。但注释不会运行，这里却包含两次函数调用：先执行 `Get('/captures')` 得到一个装饰器函数，再由编译后的代码把被装饰的方法信息交给它。前者通常叫装饰器工厂，后者才是应用装饰器。

它们发生在类定义被求值时。常见场景是模块首次加载，而不是 `new` 时，更不是请求到达时。同一进程反复调用已经加载的实例方法，不会因此反复注册路由；另一个进程重新加载模块，则会重新建立自己的描述。

装饰器能做什么，取决于传入的目标以及函数怎样处理它。本章使用传统 TypeScript 方案，先区分正文会用到的三种位置：

| 装饰位置 | 获得的主要信息 | 可以描述什么 |
| --- | --- | --- |
| 类，例如 `@Controller()` | 类的构造函数值 | 这个类的路由前缀 |
| 实例方法，例如 `@Get()` | 类原型、方法键、属性描述符 | 哪个方法对应哪个路径，也能选择包装方法 |
| 方法参数，例如 `@Req()` | 类原型、方法键、参数下标 | 调用方法时，哪个位置放请求对象 |

这里的目标不是已经创建的 Controller 实例，因此注册阶段不能从 `this` 读取某次请求的数据。静态成员的目标又与实例成员不同，本例只使用实例方法；不要把这张表套到所有装饰位置上。

方法的属性描述符包含当前方法函数。装饰器可以包装或替换这个函数，也可以只记录信息而完全不改方法行为。这是两种不同做法：下面我们选择只记录，让“记录描述”和“根据描述执行”清楚地分开。

## 写一个只负责记录路由的装饰器

新增独立示例 `examples/decorators/mini-router.ts`。它不导入 Nest，也不监听端口；下面是完整代码：

```typescript
const prefixes = new WeakMap<Function, string>();
const routes = new WeakMap<object, Map<string, string | symbol>>();

function Group(prefix: string): ClassDecorator {
  console.log('evaluate Group', prefix);
  return (constructor) => {
    console.log('apply Group', constructor.name);
    prefixes.set(constructor, prefix);
  };
}

function Get(path: string): MethodDecorator {
  console.log('evaluate Get', path);
  return (prototype, key, descriptor) => {
    console.log('apply Get', String(key), typeof descriptor.value);
    let entries = routes.get(prototype);
    if (!entries) {
      entries = new Map();
      routes.set(prototype, entries);
    }
    entries.set(path, key);
  };
}

@Group('/notes')
class NotesController {
  private readonly label = 'saved';

  @Get('/preview')
  preview(text: string): string {
    return `${this.label}: ${text}`;
  }
}

console.log('before new');
const controller = new NotesController();
const handlers = new Map<string, (text: string) => unknown>();
const prototype = Object.getPrototypeOf(controller);
for (const [path, key] of routes.get(prototype) ?? []) {
  const method: unknown = Reflect.get(controller, key);
  if (typeof method !== 'function') throw new Error('Route is not a method');
  const prefix = prefixes.get(NotesController);
  if (prefix === undefined) throw new Error('Route group is missing');
  handlers.set(prefix + path, (text) => method.call(controller, text));
}

console.log('registered', [...handlers.keys()]);
for (const path of ['/notes/preview', '/preview']) {
  const handler = handlers.get(path);
  console.log('dispatch', path, handler ? handler('hello') : 'not found');
}
```

这份程序中有三个明确的阶段。类定义时，`Get` 将“路径对应哪个方法键”记录在以原型为键的 WeakMap 中，`Group` 把前缀记录在以类为键的 WeakMap 中。之后 `new NotesController()` 创建对象。最后，普通 JavaScript 代码读取这两份记录，拼接路径，并建立可调用的处理函数表。

这里选择 WeakMap 只是为了把描述与目标对象关联起来，避免把示例字段写到业务对象上；它不会自动路由、自动调用方法或自动注入依赖。换成另一种记录方式，也必须有人读取并使用这些记录。`reflect-metadata` 提供的是另一种按目标和元数据键保存描述的方式，后面会实际读取它。

注册后的函数调用 `method.call(controller, text)`，是为了保留实例接收者。若只把 `controller.preview` 取出来直接执行，调用中的 `this` 就不一定是原 Controller，本例读取 `this.label` 会失败。路由分派不仅要找到函数，还要知道用哪个实例、带什么参数执行它。

本例没有处理继承、参数校验、异步结果、重复路由和 HTTP 响应。它只把本章需要看清的连接做出来：装饰器保存描述，启动代码读取描述，请求分派调用实例。这些阶段缺一不可；只有 `@Get` 而没有注册循环，并不会凭空产生可用接口。

为避免独立示例进入服务的构建范围，新增 `examples/decorators/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "../../dist/decorators",
    "emitDecoratorMetadata": false
  },
  "include": ["mini-router.ts"]
}
```

这里继承传统装饰器开关，但特意关闭自动类型元数据。我们自己记录路径和方法键，不需要编译器猜测构造参数。运行：

```bash
npm exec -- tsc -p examples/decorators/tsconfig.json
node dist/decorators/mini-router.js
```

先看到 `evaluate Get`、`apply Get`，再看到 `evaluate Group`、`apply Group`，这些都在 `before new` 之前。之后才打印注册的 `/notes/preview`。分派到该路径返回 `saved: hello`，分派到 `/preview` 则找不到处理函数。示例只对照这一组类与方法装饰器的执行顺序，不把它扩张成所有装饰器组合的顺序口诀。

现在改变一个实质条件：把 `@Group('/notes')` 改成 `@Group('/drafts')`，重新编译。业务方法没有变化，注册表却应变为 `/drafts/preview`，原先两个分派地址都找不到处理函数。再把循环里的访问地址改成新地址，结果恢复。由此可见，改变路由描述和改变业务行为是两项独立变化。观察完恢复原值，再编译一次。

还有一种变化可以直接推理：保留全部装饰器，却移除读取记录的注册循环。类与方法描述仍然存在，处理函数表却为空。这正是“描述存在”和“系统已经使用描述”之间的差别。Nest 的初始化过程承担了类似的读取与注册职责，不能用“装饰器会自动运行”一句话把中间环节跳过。

这个独立配置把本次实验写入 `dist/decorators/`；主服务的编译输入仍只包含 `src`，但两者此刻共用了产物目录。实验后、交付前执行一次 `npm run build`：它会先清空整个 `dist`，再只生成主服务与配置资源。不要直接把做过实验的 `dist` 当作交付结果；正在运行的 `npm run dev` 使用 `.dev`，不受这次清理影响。

## 参数装饰器描述位置，不接收未来的参数值

正文的 `@Req()` 在类定义时执行，此时还没有 HTTP 请求。它能记录的是“这个方法的第几个参数来自请求对象”，不是当场拿到某次请求。

到一次请求真正到来时，调用包装器才根据描述建立参数数组，再调用 Controller 方法。例如一个方法声明 `create(@Req() request, @Res() response)`，对应的组装效果可以理解为：

```javascript
const args = [currentRequest, currentResponse];
controller.create.apply(controller, args);
```

上面展示的是调用效果，不是 Nest 源码，也不要求往业务文件手工添加它。如果两个参数的声明位置交换，描述中的下标也必须随之变化。类型名 `Request` 并不负责这个定位，参数装饰器才提供运行时的来源信息。

这让正文出现的几类描述可以分开理解：路由装饰器说明调用哪个方法，参数装饰器说明这次调用传入什么，构造参数元数据说明创建消费者时需要什么依赖。它们可能都被叫作“元数据”，但记录的事实和读取的时机不同。

## 从手动传入开始

不用框架时，组装关系非常直接：

```typescript
const captures = new CapturesService();
const controller = new CapturesController(captures);
```

JavaScript 执行 `new`，创建对象，再把实际值传给构造函数。这里没有根据类型名自动寻找对象的动作，也没有规定 `captures` 必须在某个容器里。

Nest 做的是把这项组装工作集中起来。为了完成它，至少要知道两类事实：哪些东西可以被提供，以及某个消费者需要哪些东西。正文中的 `providers: [CapturesService]` 回答前一问，Controller 的构造参数描述回答后一问。只有登记 Provider 而没有消费关系，不会让它自动出现在每个对象里；只有一个类型注解而没有注册，也不等于容器能创建对应依赖。

容器使用“令牌”作为查找依据。令牌可以理解为标识依赖的键；本章直接使用 `CapturesService` 这个类值。它不是显示名称相同就等价的字符串：两个不同模块分别声明同名类，仍然可以是两个不同的运行时值。名字通常帮助人排错，值的身份才参与实际查找。第九章还会用显式令牌表达可替换存储。

## 类型注解不会自动保留

正文中有这样的构造函数：

```typescript
constructor(private readonly captures: CapturesService) {}
```

如果只擦除 TypeScript 类型，JavaScript 可以保留构造参数和属性赋值，却不会自然保留 `: CapturesService`。框架拿到类之后，不能凭空从已经消失的语法推导原来的类型。

`experimentalDecorators` 让编译器按照传统 TypeScript 方案转换装饰器；`emitDecoratorMetadata` 则为符合条件的装饰声明发出附加描述。两者作用不同。可以运行装饰器、注册路由，不代表已经发出了构造依赖描述。这也解释了为什么有些项目能够打印路由日志，直到执行方法时才暴露未注入的依赖。

对正文这个已经装饰的 Controller，TypeScript 5.9.3 产物中的关键部分相当于：

```javascript
__metadata("design:paramtypes", [CapturesService])
```

实际产物还有装饰器辅助函数和调用，本行只展示构造参数描述。`design:paramtypes` 是元数据键，后面的数组按构造参数顺序记录对应的运行时值。编译器发出这段代码，`reflect-metadata` 提供保存与读取它所需的运行时支持，Nest 初始化时再利用描述查找依赖。它们分别负责不同环节。

装饰器本身也不是编译期注释。类所在模块加载时，转换后的 JavaScript 会执行装饰器函数，记录类或方法的描述；请求到达时，框架使用之前建立的调用关系。本章的装饰器负责声明路由和参数来源，不替业务方法保存记录。若在模块顶层或装饰器执行过程中放入有副作用的业务操作，加载文件时就可能执行它，而不是等用户发请求。

TypeScript 还存在另一套标准装饰器语义。不能看到同样的 `@` 字符就假定两套方案的参数装饰器、元数据与工具支持一致。本章固定使用 Nest 11 所需的传统方案；迁移编译器或构建工具时，应按实际使用的语义核对产物。

## 读取真正的运行时描述

配套 `examples/nest-metadata.mjs` 不启动 HTTP 服务。前半段直接读取已经构建的 Controller：

```javascript
import 'reflect-metadata';
import { CapturesController } from '../dist/src/captures.controller.js';
import { CapturesService } from '../dist/src/captures.service.js';

const types = Reflect.getMetadata('design:paramtypes', CapturesController);
console.log('constructor dependency:', types?.map((type) => type.name));
console.log('same runtime class:', types?.[0] === CapturesService);
```

在项目根目录运行：

```bash
npm run build
node examples/nest-metadata.mjs
```

前两行输出应显示 `CapturesService`，以及 `true`。第二行不只是比较名字，而是检查描述中的值是不是导入的同一个类。

后半段绕过 Nest，直接核对业务调用：

```javascript
const captures = new CapturesService();
const created = captures.create('  I want to explain this clearly.  ');
created.originalText = 'changed outside';
console.log('stored original:', captures.find(created.id).originalText);
try {
  captures.create('   ');
} catch (error) {
  console.log('rejected:', error.message);
}
console.log('count after rejection:', captures.list().length);
console.log('another instance count:', new CapturesService().list().length);
```

原文保留两端空格；修改返回副本不应改变内部记录；空白输入应失败，原实例保留一条记录；第二个实例没有记录。这个实验区分了业务操作与组装机制：Service 的规则可以直接运行，容器负责把它交给消费者。它们不是同一个问题。

现在只改变一个编译条件，不改任何业务源码：

```bash
npm exec -- tsc --emitDecoratorMetadata false
node examples/nest-metadata.mjs
```

这次覆盖生成的 `dist/` 仅用于对照。前两行应变成 `undefined` 和 `false`，后半段手动创建 Service 的结果仍然成立。TypeScript 编译通过不代表依赖描述仍然存在。构造函数参数的类型已经接受过检查，但运行时供容器识别的元数据没有发出。

如果直接启动这份产物，不能期待框架根据参数名 `captures` 猜出依赖。根据消费方式和具体装饰情况，可能在创建依赖时失败，也可能在请求执行到 `this.captures` 时暴露问题；不应把某一次报错时机当成通用保证。判断依据是描述缺失，而不是一定要等到某条固定错误文字。

观察完立即恢复正常产物：

```bash
npm run build
node examples/nest-metadata.mjs
```

后续服务使用恢复后的构建。原来的 `tsconfig.json` 没有被命令修改，但实验覆盖过产物，因此只退出示例而不重新构建还不够。这同时复用了第五章关于源码配置与产物状态的判断。

## 为什么改成接口以后事情不同

考虑另一个需求：希望 Service 可以换实现，于是把构造参数改成一个接口类型：

```typescript
interface CaptureReader {
  list(): Capture[];
}
```

接口能说明消费者允许调用哪些方法，但接口本身在 JavaScript 中没有对应的构造函数值。编译器不能把不存在的 `CaptureReader` 类写入元数据；这种形状通常只留下 `Object` 一类有限描述，无法唯一指出应选择哪份实现。容器不会扫描项目里的全部对象，挑一个恰好有 `list()` 方法的塞进去。

这并不说明接口不好，而是说明静态约束和运行时身份要分别提供。第九章会保留接口约束，再用显式令牌和 Provider 映射表达“这个键对应哪一个实现”。当前章节不需要先搭出整套存储抽象，先知道为什么单独改类型注解无法完成替换。

类似地，`import type { CapturesService } ...` 只承诺类型检查时使用该声明。Controller 本章依赖的是一个可在运行时引用的类，不能把普通导入机械地全部改成 `import type`。Express 的 `Request`、`Response` 是另一种情况：它们描述参数形状，而参数来源已经由 `@Req()`、`@Res()` 显式指定，所以类型导入合适。

元数据也不负责验证 `originalText`。即使描述中出现 `String`，它也没有表达“不能全空白”“至多 2000 代码单元”“保留原始空格”；网络来的值更不会因描述存在而自动满足规则。正文中的运行时判断必须继续执行。

## 按阶段定位，而不是反复改装饰器

遇到注入相关问题，可以沿证据顺序判断。先确认当前运行的是哪份产物，实际执行器是否发出依赖描述；再看参数对应的是运行时类还是只存在于类型系统的接口；然后核对这个令牌是否已在当前可见的模块中注册。最后检查实际对象是否在请求中共享了预期状态。

例如，“换成另一个 TypeScript 执行器后失败”，应先对照输出的 `design:paramtypes`，不是先改业务校验；“依赖描述正确但容器找不到”，应检查注册与模块可见性；“注入正常但创建后查不到”，应核对是否每次调用重新创建 Service。第九、十章会分别展开 Provider 与模块可见性，这里的证据路径已经可以用于当前三个接口。

如果新需求只是修改原文规则，不应该碰装饰器与容器；如果新需求是为同一个入口换存储实现，才需要继续明确令牌和依赖边界。理解运行时发生了什么，才能判断该改哪里，也能避免把一切报错都归给“框架的魔法”。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| 装饰器工厂与装饰器应用 | 分开观察描述创建和目标传入 | 本例在类定义求值时发生，不在每次请求时重跑 |
| 类／原型／方法键／参数下标 | 区分描述的目标与粒度 | 参数装饰器记录位置，未来请求到来时才填入实际值 |
| WeakMap 与注册表 | 将目标关联到路由描述，再建立调用关系 | 保存描述不会自动产生 HTTP 入口 |
| `call()`／`apply()` | 绑定实例并传入实际参数 | 取出方法函数后，必须保留正确的 this |
| `new` 与构造参数 | 手动建立业务对象与消费者 | 必须传入实际值，类型名不自动创建对象 |
| Provider 令牌 | 标识容器中的依赖 | 本章使用类值，同名不等于同一个值 |
| `design:paramtypes` | 观察构造参数的运行时描述 | 不是完整类型系统，也不是输入校验器 |
| `Reflect.getMetadata()` | 读取类上的元数据 | 先加载 reflect-metadata，读取实际运行产物 |
| `emitDecoratorMetadata` | 对照发出和不发出描述 | CLI 覆盖会改变产物，实验后重新构建 |
| 普通导入／`import type` | 区分类值与静态类型 | 运行时依赖需要真实令牌；接口在运行时被擦除 |
| 返回副本 | 让消费者无法通过引用绕过原文校验 | 当前字段全为字符串；嵌套结构需重新判断 |

官方查阅：[TypeScript 装饰器](https://www.typescriptlang.org/docs/handbook/decorators.html)、[元数据开关](https://www.typescriptlang.org/tsconfig/emitDecoratorMetadata.html)、[TypeScript 5.0 装饰器差异](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#decorators)、[Nest 11 Provider](https://docs.nestjs.com/v11/providers)、[tsx 的装饰器元数据限制](https://tsx.is/typescript)。代码按正文固定版本运行。

[返回第七章正文](chapter.md) · [返回第二篇](../README.md)
