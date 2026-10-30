# 支线 10A：文件循环、对象循环与 forwardRef 的边界

主线通过重新安排创建与预览的职责，消除了对象之间的循环依赖。不过，维护已有代码时，还会遇到另一种“循环”：两个文件互相 import，程序在启动容器之前就失败了。如果把这两类错误混在一起，很容易一边加 forwardRef，一边制造新的缺失导出或初始化问题。

这条支线先用没有 Nest 的程序观察文件求值，再保留一组双向对象关系，观察 Nest 能为它补上什么。程序位于第十章代码分支，均不监听 HTTP，也不写业务数据。

时间参考（估算）：阅读约 22～28 分钟；运行与修改条件另加约 15～20 分钟。按正文约 2600 个汉字、约 100 行代码与命令，以及文件读取时机、双向类组装、隐藏导出和元数据变更对照估算，尚未经过读者实测。

## 先确定失败发生在容器之前还是之中

假设 a 文件导出 A，同时导入 b；b 又要使用 A。文件存在互相引用，并不直接意味着运行失败。更关键的问题是：b 什么时候读取 A？

新增 `examples/module-cycles/esm-a.mjs`：

```js
import { readA } from './esm-b.mjs';

export class A {}

console.log('after initialization:', readA().name);
```

以及 `examples/module-cycles/esm-b.mjs`：

```js
import { A } from './esm-a.mjs';

if (process.argv[2] === 'eager') console.log(A);

export function readA() {
  return A;
}
```

从 a 进入时，Node 要先处理它依赖的 b，b 又引用尚未完成求值的 a。ESM 建立的是指向导出绑定的联系，不是先把 A 复制为一个最终值。类声明执行之前，A 的绑定尚未初始化；这时读取就会触发暂时性死区错误。

先运行没有提前读取的版本：

```bash
node examples/module-cycles/esm-a.mjs
```

应看到 `after initialization: A`。b 在求值时只是声明了 readA 函数，并没有执行函数体中的读取。等返回 a，A 类声明完成后再调用 readA，就能取得类值。

再改变读取时机：

```bash
node examples/module-cycles/esm-a.mjs eager
echo $?
```

这次 b 的顶层代码立即读取 A，预期报 `Cannot access 'A' before initialization`，退出码为 1。程序没有导入 Nest，显然不是容器少了一项 providers。把一个回调写出来能推迟读取，但如果立刻调用这个回调，仍然回到原来的失败时机。

这也是聚合导出文件需要留意的地方。一个 index.ts 导出模块类与 Service，Service 又从 index.ts 导入令牌，加载令牌时就可能顺带把模块组装文件也拉进来。定位时应沿实际文件依赖走，不要只看业务对象有没有互相调用。把无依赖的令牌移到单独文件、内部代码直接从具体文件导入，往往能删除不必要的加载环；只是改文件名并不会改变关系。

## 类已经存在，为什么对象仍然造不出来

主线的失败工厂刻意在两个类声明完成后才执行 Module 装饰器，所以引用类值没有问题。它仍失败，是因为创建 CaptureActions 要求先拿到 Preview 的实例，而创建 Preview 又要求先拿到 CaptureActions 的实例。延迟“读取一个类值”和满足“对象创建所需的实例”是不同的问题。

若业务关系确实要保留，例如已有两个协作对象必须持有对方引用，可以先把要求缩小为：应用初始化完成后，两者都能访问对方；构造函数只保存依赖，不在尚未完成组装时使用对方的状态。这个条件比“构造第一个对象时，第二个对象必须完整可用”更弱，因此框架才有空间处理双向关联。

Nest 的 forwardRef 接收一个稍后返回目标的函数。用于类注入时，它既推迟取得目标令牌，也让容器识别这条前向引用，按支持的双向类组装方式补齐关系。它不是一个稍后执行任意业务方法的代理，也不保证对方构造函数先运行。主线的自定义工厂必须取得实参才能调用，不能把工厂环直接当成同一种可补齐的类关系。

先看一个类侧的声明：

```ts
@Injectable()
class Left {
  readonly name = 'left';

  constructor(
    @Inject(forwardRef(() => Right)) readonly right: Pick<Right, 'name' | 'left'>,
  ) {}
}
```

这里保留了明确的 `@Inject` 运行时令牌；Pick 仅描述编译时使用的成员。另一侧 Right 同样使用 `@Inject(forwardRef(() => Left))`。我们让构造函数只保存引用，直到应用上下文创建完成后再比较两者是否互相指向。

如果 LeftModule 需要 RightModule 的导出，RightModule 又需要 LeftModule 的导出，模块描述也形成双向引用。模块 imports 同样可以延迟取得对方类值，但双方仍须各自登记并导出所需 Provider。forwardRef 不会凭空添加缺失的登记或 exports。

## 装饰器元数据也可能提前读取类

本书沿用 `emitDecoratorMetadata: true`。即使显式 Inject 已经写成回调，如果上面 right 参数直接标为 `Right`，TypeScript 还可能为装饰后的 Left 生成这样的参数元数据：

```js
__metadata("design:paramtypes", [Right])
```

Left 声明执行时，这里的数组会立即读取 Right。若 Right 的类声明尚未执行，就又遇到了文件求值阶段的问题。推迟 Inject 中的读取，并没有推迟所有其他表达式中的读取。

本例用 Pick 这种纯类型描述保留需要的成员，编译结果中的 design:paramtypes 对应 Object，而真正的注入身份仍由显式 Inject 提供。因此这不是第九章“容器误把接口当作 Object 令牌”的情况：自动元数据不够具体，但显式令牌已经补齐了信息。也不要仅改成 import type 就删掉 Inject；那会失去运行时的目标身份。

可以在下面程序编译完成后打开 `dist/examples/module-cycles/main.js`，找到两个 `design:paramtypes`，核对其中是 Object，再找到 forwardRef 回调，核对其中仍保留 Left／Right。两处证据分别回答“类型元数据何时读取什么”与“容器最终用哪个令牌”，不能只看 TypeScript 参数长得像哪个类。

## 运行同一组关系，只改变一个条件

完整程序保存为 `examples/module-cycles/main.ts`。linked 模式保留关系；hidden 模式不导出 Right；eager 模式让双方构造函数立即读取对方字段。

```ts
import 'reflect-metadata';
import { forwardRef, Inject, Injectable, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

const mode = process.argv[2] ?? 'linked';
if (!['linked', 'hidden', 'eager'].includes(mode)) throw new Error('Unknown mode');

@Injectable()
class Left {
  readonly name = 'left';

  constructor(
    @Inject(forwardRef(() => Right)) readonly right: Pick<Right, 'name' | 'left'>,
  ) {
    if (mode === 'eager') console.log('early right:', this.right.name.toUpperCase());
  }
}

@Injectable()
class Right {
  readonly name = 'right';

  constructor(
    @Inject(forwardRef(() => Left)) readonly left: Pick<Left, 'name'>,
  ) {
    if (mode === 'eager') console.log('early left:', this.left.name.toUpperCase());
  }
}

@Module({
  imports: [forwardRef(() => RightModule)],
  providers: [Left],
  exports: [Left],
})
class LeftModule {}

@Module({
  imports: [forwardRef(() => LeftModule)],
  providers: [Right],
  exports: mode === 'hidden' ? [] : [Right],
})
class RightModule {}

@Module({ imports: [LeftModule, RightModule] })
class RootModule {}

try {
  const app = await NestFactory.createApplicationContext(RootModule, {
    logger: false, abortOnError: false,
  });
  try {
    const left = app.select(LeftModule).get(Left, { strict: true });
    const right = app.select(RightModule).get(Right, { strict: true });
    console.log('both linked:', left.right === right && right.left === left);
    console.log('ready names:', left.name, right.name);
    console.log('design type:', Reflect.getMetadata('design:paramtypes', Left)[0].name);
  } finally {
    await app.close();
  }
} catch (error: unknown) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
```

新增 `examples/module-cycles/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "include": ["./*.ts"]
}
```

编译并运行正常条件：

```bash
npm exec -- tsc -p examples/module-cycles/tsconfig.json
node dist/examples/module-cycles/main.js linked
```

应看到：

```text
both linked: true
ready names: left right
design type: Object
```

这只能证明在这组默认作用域的类 Provider 中，应用创建完成后双向引用成立。不能由此推导任意异步工厂、请求作用域、初始化业务动作都可以形成环。

现在不改类侧的 forwardRef，只隐藏一项导出：

```bash
node dist/examples/module-cycles/main.js hidden
```

预期启动失败，错误指向 Left 在 LeftModule 中要求的 Right 不可见。两个模块都还在，类值也可以取得，只是 RightModule 没有允许外部使用 Right。修法是恢复应有的 exports，或者取消这项跨模块需要；继续增加 forwardRef 无法越过可见性边界。

再恢复导出，只改变使用依赖的时机：

```bash
node dist/examples/module-cycles/main.js eager
```

这次会在构造阶段读取尚未准备好的 name，并因对 undefined 调用 toUpperCase 而失败。具体哪一侧先执行不应成为业务前提；本例让两侧都提前使用对方，就是为了暴露这种要求无法可靠成立。捕获异常后强行继续，也不会让缺失的初始化状态变成正确业务结果。

应如何改？若只需要应用完成组装后再开始一次操作，就把操作放到创建上下文之后的明确入口。若每个对象必须完成自己的业务初始化后另一个才可初始化，应重新安排启动依赖，不能把“注入引用已连上”误当成“资源和业务状态已经就绪”。第十三章会继续用真实资源的启动与退出解释这个区别。

最后，可以暂时把 Left 构造参数的 Pick 改成直接的 Right 类型，重新编译并运行 linked。此时即便没选 eager，也可能在类声明的元数据求值处报初始化前读取的错误；本例的声明顺序就会触发它。把类型恢复后再编译，正常条件应回来。这个对照把三种故障分开了：类型元数据过早读取类、模块没有导出所需对象、构造函数过早使用对方状态。

## 把判断接回记录模块

如果真实错误发生在 NestFactory 调用之前，先沿文件、顶层代码和装饰器生成物检查读取时机。如果错误指出某个参数在某模块中不可用，先查登记、导出和导入路径。如果双方都已登记可见，却互相要求对方先被创建，才进入对象关系的分析。

这些不是互斥的病因：同一个设计可以同时有文件环、模块环与对象环。每次修正后要确认失败推进到了哪一步，不要把报错文字变化误认成问题已经全部解决。

对于主线的预览需求，传入记录并让流程使用记录 Service，已经删除了反向依赖，保留 forwardRef 没有额外收益。对于暂时不能重划边界的旧代码，双向类关联可以是过渡选择，但应清楚保存了哪条环、构造时不允许做什么、谁负责后续操作。判断依据仍是具体依赖和初始化条件，而不是“框架有这个 API，所以都可以用”。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| ESM 导出绑定 | 区分持有绑定与读取绑定 | 类初始化前读取会抛错，互相 import 本身不必然失败 |
| forwardRef(() => Target) | 推迟取得类／模块引用 | 不补 providers 或 exports，不保证构造次序 |
| Inject | 明确参数的运行时查找身份 | 纯类型参数仍需有可靠的令牌来源 |
| emitDecoratorMetadata | 观察生成物中的额外读取 | 注入回调延迟，不代表参数元数据也延迟 |
| Pick | 保留实验所需静态成员描述 | 本例元数据为 Object，运行时身份来自显式 Inject |
| useFactory | 对照必须先取得实参的工厂环 | 不套用双向类 Provider 的补齐方式 |
| createApplicationContext | 区分组装期间与创建完成后的操作 | 对象引用建立不等于外部资源或业务初始化已完成 |

官方查阅：[Nest 11 循环依赖](https://docs.nestjs.com/v11/fundamentals/circular-dependency)、[常见依赖错误](https://docs.nestjs.com/v11/faq/common-errors)、[TypeScript emitDecoratorMetadata](https://www.typescriptlang.org/tsconfig/emitDecoratorMetadata.html)、[ECMAScript 模块求值](https://tc39.es/ecma262/multipage/ecmascript-language-scripts-and-modules.html#sec-moduleevaluation)。实验使用本书固定的 Nest 11.2.5 与 TypeScript 5.9.3；修改编译配置时，应重新核对生成物。

[返回第十章](chapter.md) · [返回第二篇](../README.md)
