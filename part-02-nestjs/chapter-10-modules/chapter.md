# 第 10 章 Module 建立清楚的业务边界

第九章把记录的业务规则与保存动作分开了。现在，Controller 要求一个 CapturesService，Service 的工厂要求一个 CAPTURE_STORE，容器按声明把它们接起来。我们已经能替换保存方式，也能在没有 HTTP 的情况下调用业务操作。

但所有登记仍集中在 AppModule。假如另一个入口要读取记录，哪些登记应该由它负责，哪些应该沿用？如果把同一段 providers 复制过去，两个入口是否仍在操作同一批记录？这些问题并不取决于文件放在哪个文件夹，而取决于谁拥有这些对象、谁可以使用它们。

这一章先整理现有记录服务，再加一份独立的记录摘要程序作为调用方。它只在 examples 中运行，用来观察模块之间如何合作，不给 HTTP 服务增加摘要接口。随后用“创建记录并生成预览”的小场景推导循环依赖的来由与消除方法。应用仍使用内存，字段、原有三个接口与查询规则继续保持。

代码起点为第九章的 `part-02/chapter-09`，完成状态为 `part-02/chapter-10`。命令在配套代码项目根目录执行，沿用 Node.js 24.22.1、Nest 11.2.5 与现有 TypeScript 编译配置。

时间参考（估算）：只阅读约 45～55 分钟；跟做另加约 35～45 分钟，合计约 80～100 分钟。附录按需查阅，支线单列。

按正文约 6600 个汉字、约 200 行代码与命令，以及模块迁移、独立摘要、可见性和重复登记对照、预览流程改造估算，尚未经过读者实测。

## 10.1 imports、providers、controllers 与 exports 如何组装已有记录服务

### 先决定谁一起变化，再决定放进哪个模块

现在的 AppModule 不长。保持现状完全可以运行；如果项目一直只有这些接口，也没有独立调用入口，把所有登记留在这里是合理方案。拆模块不会让查找记录更快，也不会让 Map 自动持久化。

我们想改变的是组装责任。记录的 Controller、业务 Service 和存储选择是一起工作的：Controller 把 HTTP 输入交给 Service，Service 要保存与查询，存储实现兑现这些要求。以后接入数据库时，调用方应继续要求“创建、列出、查找记录”，而不是分别学会怎样创建存储和 Service。因此，让记录这组能力拥有自己的组装位置有实际价值。

先不按 Controller／Service／Store 三个技术名词各拆一个模块。那样每次跟踪一个记录操作都要跨三个边界，而存储与业务仍然紧密合作。我们也不需要先创建一个空的 SharedModule。只有找到了共同拥有的能力，才能判断共享是否有意义。

新增 `src/captures.module.ts`，把第九章 AppModule 的内容移过来，只将类名改为 CapturesModule。**这个阶段先不加 exports**：

```ts
import { Module } from '@nestjs/common';
import { CapturesController } from './captures.controller.js';
import { CapturesService } from './captures.service.js';
import { CAPTURE_STORE } from './capture-store.js';
import type { CaptureStore } from './capture-store.js';
import { MemoryCaptureStore } from './memory-capture.store.js';

@Module({
  controllers: [CapturesController],
  providers: [
    { provide: CAPTURE_STORE, useClass: MemoryCaptureStore },
    {
      provide: CapturesService,
      useFactory: (store: CaptureStore) => new CapturesService(store),
      inject: [CAPTURE_STORE],
    },
  ],
})
export class CapturesModule {}
```

第九章的两份 Provider 登记保持原样。Service 的工厂在 CapturesModule 中要求 CAPTURE_STORE，该模块中恰好有这份登记；Controller 也在这个模块中，因此能要求 CapturesService。不需要为了模块内部的合作导出任何对象。

再把 `src/app.module.ts` 改成：

```ts
import { Module } from '@nestjs/common';
import { CapturesModule } from './captures.module.js';

@Module({
  imports: [CapturesModule],
})
export class AppModule {}
```

这里同时出现了两种 import。文件顶端的 JavaScript import 取得 CapturesModule 这个类值，使本文件能引用它；装饰器里的 imports 则告诉 Nest，从根模块建立应用时，还要把这个模块纳入组装。只写前者，Nest 不会因为某个类被文件加载过，就自动把它的 Controller 接入应用。

这也解释了为什么 `imports: [CapturesService]` 不是修法。imports 声明的是模块之间的使用关系；如何创建 Service 则由 providers 描述。名字里都有“导入”，不能据此把它们当成同一层操作。

此时的关键不是 AppModule 变短了，而是它已经不必知道记录使用哪一种存储。它选择接入记录模块；记录模块负责内部组装。文件仍平铺在 src 中也成立，稍后按业务目录整理只是阅读上的组织，不会额外改变注入规则。

### 不导出 Controller，路由为什么仍能工作

先运行：

```bash
npm run typecheck
npm run dev
```

在 Postman 的“创建原文”中把原文改为 `A module owns its records.`，发送后更新集合的 `captureId`。再用列表请求的 Params 设置 `q=module`、`limit=1`，并发送详情请求。下面保留创建和筛选的等效 curl，便于终端复现；日常仍复用已保存请求：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"A module owns its records."}'
curl -i 'http://127.0.0.1:3000/captures?q=module&limit=1'
```

创建仍应返回 201 和 Location，列表仍在 items 中包含这条原文。复制创建结果里的 id 查询详情；空白原文仍返回 400，不存在的 id 仍返回 404。重启服务会清空 Map，所以对照新旧组织方式时应分别创建数据，不能把重启后查不到误判为拆模块丢数据。

为什么 CapturesModule 没有 exports，HTTP 仍然可用？因为路由注册与跨模块注入回答的是不同问题。Nest 已从 AppModule 找到 CapturesModule，看到它的 controllers 后，便为这些 Controller 注册路由。外部客户端访问路由，不是 AppModule 中某个 Provider 在注入 Controller。exports 并不决定一个 HTTP 路径是否公开。

反过来，暂时从 AppModule 去掉 `imports: [CapturesModule]`，重建启动，再请求 /captures。应用不再包含这组 Controller，请求会落入现有的未匹配路由处理；把 imports 恢复后，路由才回来。这里真正断开的是“根模块包含记录模块”这条边。只删除 exports 不会产生这个效果，因为目前根本没有跨模块消费者。

也不要把 Controller 同时留在 AppModule 的 controllers 中。那不是“让上层知道有这个入口”，而是要求 Nest 再在 AppModule 中组装一个 Controller。它的 Service 依赖将从 AppModule 的可见范围查找，已不再是刚才那个内部组装问题。迁移登记应当是移动，不能只复制后保留旧登记。

### 第二个调用方出现时，才决定公开什么

现在有一份开发时使用的摘要程序，需要取得所有记录的原文。最直接的实现是接收 CapturesService，调用 list，再取 originalText。它不需要 Map，也不需要负责生成 ID 或校验原文。

先看消费者本身，新增 `examples/module-consumer/main.ts` 时会用到这个类：

```ts
class CaptureSummary {
  constructor(private readonly captures: CapturesService) {}

  async lines(): Promise<string[]> {
    const captures = await this.captures.list();
    return captures.map(capture => capture.originalText);
  }
}
```

如果它和 Service 登记在同一个模块，注入已经可以成立；但这样记录模块又要拥有摘要用途。我们希望摘要依赖记录，而记录不必知道摘要，因此把 CaptureSummary 放在 SummaryModule 中，由后者声明需要 CapturesModule。

仅在 SummaryModule 写 imports 仍不够。记录模块现在没有明确允许外部使用任何 Provider，消费者要求 CapturesService 时就会失败。于是给 `src/captures.module.ts` 的装饰器增加一行：

```ts
  exports: [CapturesService],
```

至此才有一项公开能力。exports 不重新创建 Service，也不把 Service 的依赖全部公开出去。它允许导入此模块的消费者，要求该模块已经负责创建的 CapturesService；Service 内部继续持有私有的存储对象。

完整的独立消费者程序如下，放入 `examples/module-consumer/main.ts`：

```ts
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CapturesModule } from '../../src/captures.module.js';
import { CapturesService } from '../../src/captures.service.js';

class CaptureSummary {
  constructor(private readonly captures: CapturesService) {}

  async lines(): Promise<string[]> {
    const captures = await this.captures.list();
    return captures.map(capture => capture.originalText);
  }
}

@Module({
  imports: [CapturesModule],
  providers: [{
    provide: CaptureSummary,
    useFactory: (captures: CapturesService) => new CaptureSummary(captures),
    inject: [CapturesService],
  }],
})
class SummaryModule {}

const app = await NestFactory.createApplicationContext(SummaryModule, {
  logger: false, abortOnError: false,
});
try {
  const captures = app.select(CapturesModule).get(CapturesService, { strict: true });
  const summary = app.select(SummaryModule).get(CaptureSummary, { strict: true });
  await captures.create('One module owns the records.');
  console.log(await summary.lines());
} finally {
  await app.close();
}
```

新增 `examples/module-consumer/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "include": ["./*.ts"]
}
```

运行：

```bash
npm exec -- tsc -p examples/module-consumer/tsconfig.json
node dist/examples/module-consumer/main.js
```

应看到 `[ 'One module owns the records.' ]`。写入使用记录模块拥有的 Service，摘要取得的也是同一个 Service，所以读到了这条原文。程序每次启动建立新的应用上下文，和另一个终端中的 HTTP 进程不共享 Map；不能在 HTTP 进程创建一条，再期待本程序读到它。

入口里的 select 用于指定我们要观察哪个模块，`get(..., { strict: true })` 限定从选定模块的本地登记取对象。业务类仍使用构造参数，没有自己查容器。这里特意指定模块，是为了避免重复令牌实验中取错对象。普通 `app.get(token)` 可以在应用范围查找，查到一个内部对象不代表另一个模块有权通过构造参数注入它；不能用这条查找捷径来证明 exports 配置正确。

模块迁移和摘要输出都正常后，可以在这里停下。保留的是 CapturesModule 的登记与 exports、AppModule 的 imports，以及独立摘要程序。后面暂删 imports／exports 的操作都是故障对照；每轮观察后恢复，再进入下一种条件。下次恢复时先编译并运行摘要程序，确认仍输出那条原文，再继续 10.2；不需要保存上一次 HTTP 进程的内存数据。

到这里再回看四个配置项，就有了各自要解决的问题：providers 定义本模块怎样取得对象，controllers 声明由它组装的 HTTP 入口，imports 表达它需要别的模块，exports 表达它愿意提供哪些能力。理解它们时应始终带上具体消费者和所属模块，而不是只记四段定义。

## 10.2 模块公开能力与内部实现，避免把数据库操作随意泄漏给调用方

### 编译通过，为什么启动才发现不可见

先保留消费者的 imports，暂时删掉 CapturesModule 的 exports。重新编译消费者并运行，会得到包含以下信息的依赖解析错误：

```text
CaptureSummary ... CapturesService ... index [0] ... SummaryModule
```

再恢复 exports，删掉 SummaryModule 的 imports，重新运行，也无法组装消费者。这两次都不是 TypeScript 不认识 CapturesService。源码 import 依然有效，构造参数的类型也没变；出错的是 Nest 要创建 CaptureSummary 时，无法在 SummaryModule 的可见范围找到指定登记。

先读错误中的消费者，再读参数位置和模块名，最后追查令牌的来路，比看到报错就往 providers 中补一个类更可靠。在这个例子中，index 0 指工厂 inject 数组的第一个参数。若未来有两个参数，不能因为错误中出现某个 Service 的名字，就以为是那个 Service 的方法执行失败；组装可能尚未完成。

恢复两处配置。现在每条使用关系都有两端：拥有者导出，消费者导入。若根模块同时 imports CapturesModule 和 SummaryModule，但 SummaryModule 自己没有 imports CapturesModule，也不成立。根模块不是 JavaScript 原型链上的父类，根能看见的东西不会自动继承给所有被导入的模块。

这一限制让模块能够描述自己的需要。否则，把 SummaryModule 搬到一个新入口时，还必须猜旧根模块暗中提供了哪些东西。显式 imports 多写了一个关系，但使组装条件留在消费者附近。

### “补齐登记”可能把缺少依赖变成两份数据

一种容易想到的修法是在 SummaryModule 中也放入 Service 工厂。先推导后果：这个工厂现在归 SummaryModule 所有，所以它会在 SummaryModule 中要求 CAPTURE_STORE。即使 SummaryModule 导入了 CapturesModule，后者只导出了 Service，没有导出存储，工厂仍然找不到自己的依赖。

再把存储登记也复制进去呢？启动会成功，但含义已经变了：SummaryModule 拥有自己的 MemoryCaptureStore 和自己的 Service。名字和类相同，不会把两份 Map 合并。这正是第九章“登记与对象身份”的问题加入模块维度后的结果。

配套 `examples/module-visibility/main.ts` 把这些条件分别保存在运行模式中。它使用独立的 RecordsModule 和 ReaderModule，复用真实的 CapturesService 与 MemoryCaptureStore，不改主线配置。关键对照是消费者的 providers 是否额外包含这两份登记：

```ts
const serviceProvider = {
  provide: CapturesService,
  useFactory: (store: CaptureStore) => new CapturesService(store),
  inject: [CAPTURE_STORE],
};
const storeProvider = { provide: CAPTURE_STORE, useClass: MemoryCaptureStore };
```

在 duplicate 模式中，RecordsModule 与 ReaderModule 都使用这两份描述。**复用描述对象也不等于复用创建结果**：useClass／useFactory 分别在各自模块的登记中负责创建。假如换成 useValue，并把同一个现成对象放进两份登记，对象身份又会相同；所以“两次登记必定两份对象”也不够准确，仍须看登记怎样取得值。

这个示例的 tsconfig.json 与上一个相同。先编译，再比较：

```bash
npm exec -- tsc -p examples/module-visibility/tsconfig.json
node dist/examples/module-visibility/main.js shared
node dist/examples/module-visibility/main.js duplicate
```

shared 输出 same service 为 true，owner count 与 reader count 都为 1；duplicate 输出 false、1、0。程序通过 select 明确取得拥有者的 Service，再取得消费者实际注入的 Service。比较的是具体实例及其可观察数据，避免在应用范围随便 get 一份同名令牌，把另一份状态遗漏掉。

这里比较的是同一个应用上下文、同一个静态模块类和默认作用域。根模块与 ReaderModule 都导入 RecordsModule，会复用该模块拥有的登记；这与把 Provider 描述复制进 ReaderModule 不同。若把 Provider 改成请求作用域，实例还会随请求上下文变化，应接回第九章的作用域判断，不能把本例结论扩展为“相同类在任何地方都只有一个实例”。

如果只看“应用启动成功”，duplicate 似乎也是修复；如果追问“摘要应该读到谁保存的记录”，就能排除它。当前需要的是沿用记录模块的公开 Service，修法是恢复 imports／exports，并移除消费者重复的 Service 与存储登记。

### 公开边界为什么停在 Service

现在把读者需求稍微改一下：摘要除了显示原文，还想直接插入一条记录。公开 CAPTURE_STORE 是否更方便？它确实少经过一个方法，但同时绕开了 CapturesService 的非空白、长度和 ID／时间生成规则。调用方必须自己重写这些要求，甚至可以把空白原文直接交给存储。

存储契约负责保存什么对象、何时算成功，不承担所有业务合法性。让摘要通过 Service 创建，是在复用已经建立的规则。这个理由来自实际行为，不能只说“数据库层应该隐藏”。我们还没有数据库；同样的问题已经可以在 Map 上发生。

把独立实验切到 private 模式：

```bash
node dist/examples/module-visibility/main.js private
echo $?
```

它在 ReaderModule 中增加一个工厂，直接要求 CAPTURE_STORE：

```ts
{
  provide: 'DIRECT_STORE',
  useFactory: (store: CaptureStore) => store,
  inject: [CAPTURE_STORE],
}
```

预期在启动时失败，退出码为 1，错误指向 ReaderModule 中不可见的 Symbol(CAPTURE_STORE)。Service 仍然能使用这个存储，因为 **Service 的工厂归记录模块，而不是归消费者模块**。导出 Service 时，外部得到的是已按拥有者的依赖关系组装的对象，不会把它搬到外部重新组装。

将来把 Map 换成数据库实现，可以继续把变化留在记录模块的内部组装处，摘要仍依赖相同的业务操作。如果有多个业务模块确实共享数据库连接，可以由基础设施模块提供连接，再由各业务模块实现自己的存储操作。共享连接不等于所有调用方都可以绕过业务规则随意写表；要根据谁负责约束、谁维护查询来决定公开范围，第三篇会用实际表和查询继续推导。

当前导出整个 CapturesService，也意味着调用方能调用其公开的 create、list、find。它不是“只读授权”。如果摘要后来必须只有查询能力，可以先用一个只提供查询方法的对象包装 Service，并通过独立令牌导出；单纯把构造参数类型写成 `Pick<CapturesService, 'list'>` 只限制静态可见方法，注入的仍可能是完整对象。是否需要更窄的边界，要看误用成本与实际消费者，不必现在为了一个摘要类再造整套接口。

Nest 的模块封装是组装约束，不是对同进程代码的安全沙箱。代码仍可能直接 new 内部类，入口也可能通过非严格容器查找取得它。边界需要代码组织和审查共同遵守；用户权限则需要身份和数据条件，本章的 exports 无法代替。

### 多经过一个模块，能力会自动穿过去吗

假设应用已经有一个入口聚合模块，它导入记录模块。摘要只导入这个聚合模块，就一定能要求 CapturesService 吗？先回到刚才的两端关系：聚合模块自己可以使用记录模块的导出，但它尚未承诺把这些能力提供给自己的消费者。

若聚合模块确实要作为这些能力的统一入口，可以显式再导出：

```ts
@Module({
  imports: [RecordsModule],
  exports: [RecordsModule],
})
class BridgeModule {}
```

这样读者才能沿 ReaderModule → BridgeModule → RecordsModule 追踪到公开的 Service；并不是所有 imports 都会无条件向下穿透。再导出的仍是 RecordsModule 本来公开的能力，内部 CAPTURE_STORE 不会跟着变成公共令牌。

独立示例的 bridge 与 reexport 模式只改变这一点：

```bash
node dist/examples/module-visibility/main.js bridge
node dist/examples/module-visibility/main.js reexport
```

前者启动失败，后者重新得到 true、1、1。如果没有统一入口的实际需求，SummaryModule 直接导入 CapturesModule 更容易追踪；不要为了用到再导出，专门给当前项目增加一层 BridgeModule。

同样，不必为了省略 imports 把记录模块标为 `@Global()`。全局模块在应用中被注册并导出 Provider 后，其他模块可以不显式导入它就使用这些导出；但摘要对环境的要求随之变得不明显。稳定且普遍需要的基础设施可能适用，记录业务模块目前没有这个理由。全局可见也不会把未导出的存储公开，更不意味着跨进程共享。

最后运行 hidden、root-only 两种失败条件，核对自己能否从错误中的模块名找到断开的关系：

```bash
node dist/examples/module-visibility/main.js hidden
node dist/examples/module-visibility/main.js root-only
```

前者少了拥有者的 exports，后者只有根模块导入记录模块，消费者没导入。它们都会让 Reader 的依赖不可见，但修改位置不同。掌握这条查找路径以后，处理依赖错误就不必在多个数组里反复试填类名了。

## 10.3 通过一处循环依赖理解职责划分；复杂业务模块在对应篇章再对照

### 两个看似合理的方法怎样把彼此绑住

再考虑一个具体需求：开发工具希望“保存一段原文，然后立即得到一行预览”，另一个位置也希望“按已有记录 ID 得到相同预览”。预览格式只是 `Original: 原文`。这仍然是独立程序里的演示需求，不修改主线 POST /captures 的响应。

很自然的第一步是做一个 Preview 对象，让它根据 ID 查询记录再格式化。另一个 CaptureActions 对象包装记录操作，并增加 createAndPreview。于是出现下面两段代码，保存在 `examples/module-workflow/cycle.ts`：

```ts
class CaptureActions {
  constructor(
    private readonly captures: CapturesService,
    private readonly previews: Preview,
  ) {}

  find(id: string) { return this.captures.find(id); }

  async createAndPreview(text: string) {
    const capture = await this.captures.create(text);
    return this.previews.forId(capture.id);
  }
}

class Preview {
  constructor(private readonly actions: CaptureActions) {}

  async forId(id: string) {
    const capture = await this.actions.find(id);
    return `Original: ${capture.originalText}`;
  }
}
```

单看任意一个方法似乎都合理：创建后调用预览，预览又通过记录操作查询。问题藏在对象创建关系中。要创建 CaptureActions，必须先有 Preview；要创建 Preview，又必须先有 CaptureActions。保存和查询方法尚未执行，容器已经没有可先创建的那一个对象。

为了只观察对象组装，不让文件加载顺序干扰，这个例子把两个普通类放在同一文件，等类声明完成后再用显式工厂登记：

```ts
@Module({
  imports: [CapturesModule],
  providers: [
    {
      provide: CaptureActions,
      useFactory: (captures: CapturesService, preview: Preview) => new CaptureActions(captures, preview),
      inject: [CapturesService, Preview],
    },
    {
      provide: Preview,
      useFactory: (actions: CaptureActions) => new Preview(actions),
      inject: [CaptureActions],
    },
  ],
})
class CycleModule {}
```

文件能够执行到这份登记，两个类值都已经存在。这时失败就不能简单归咎于“class 写在后面”。创建函数仍要求对方先作为参数到位，工厂之间的环没有消失。

新增 `examples/module-workflow/tsconfig.json`，仍使用前面同样的 extends 与 include 配置，然后运行配套的完整失败程序：

```bash
npm exec -- tsc -p examples/module-workflow/tsconfig.json
node dist/examples/module-workflow/cycle.js
echo $?
```

应看到包含 circular dependency 的错误，退出码为 1。程序没有执行创建记录。它刻意使用了 Nest 的 `abortOnError: false` 并捕获启动失败，让错误能够以普通的进程退出结果观察。错误提示也会说明自定义工厂之间的循环不受支持；不要只看到 forwardRef 这个词，就给工厂的 inject 数组机械地包一层回调。

### 先问预览究竟需要什么

回到需求，Preview 真正需要的是一条记录的内容，而不是整个 CaptureActions。查询只是取得内容的一种方式。创建成功时，CapturesService.create 已经返回了那条记录，为什么还要从预览对象反向查询一次？

先把格式化写成最简单的函数：

```ts
function preview(capture: Capture): string {
  return `Original: ${capture.originalText}`;
}
```

它没有需要容器组装的依赖，不持有状态，也没有必要为了叫它 Provider 而添加装饰器。现在“创建并预览”可以顺序执行：等待 create 返回记录，再将记录交给 preview。“按 ID 预览”则先等待 find，再调用同一个函数。两条流程共享格式规则，但不再互相调用。

将流程放入 CreatePreview，由它依赖 CapturesService。最终 `examples/module-workflow/main.ts` 如下：

```ts
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CapturesModule } from '../../src/captures.module.js';
import { CapturesService } from '../../src/captures.service.js';
import type { Capture } from '../../src/capture.js';

function preview(capture: Capture): string {
  return `Original: ${capture.originalText}`;
}

class CreatePreview {
  constructor(private readonly captures: CapturesService) {}

  async run(text: string): Promise<string> {
    const capture = await this.captures.create(text);
    return preview(capture);
  }

  async forId(id: string): Promise<string> {
    return preview(await this.captures.find(id));
  }
}

@Module({
  imports: [CapturesModule],
  providers: [{
    provide: CreatePreview,
    useFactory: (captures: CapturesService) => new CreatePreview(captures),
    inject: [CapturesService],
  }],
})
class PreviewModule {}

const app = await NestFactory.createApplicationContext(PreviewModule, {
  logger: false, abortOnError: false,
});
try {
  const workflow = app.select(PreviewModule).get(CreatePreview, { strict: true });
  const captures = app.select(CapturesModule).get(CapturesService, { strict: true });
  console.log(await workflow.run('A preview is a consumer.'));
  const [saved] = await captures.list();
  if (!saved) throw new Error('Expected a saved capture');
  console.log(await workflow.forId(saved.id));
  console.log('stored count:', (await captures.list()).length);
} finally {
  await app.close();
}
```

运行：

```bash
node dist/examples/module-workflow/main.js
```

应依次看到两行 `Original: A preview is a consumer.`，以及 `stored count: 1`。第一行来自创建结果，第二行来自按 ID 再查；生成两次预览没有创建第二条记录。这既核对了流程，也说明不需要把预览能力塞回记录模块。

此时 PreviewModule 导入 CapturesModule，CapturesModule 不导入 PreviewModule。记录模块可以单独完成保存、查询；预览模块在这些能力上组织自己的用途。若将来换一个消费者生成 CSV 或发给其他入口，变化应留在那个消费者，不让记录模块逐个依赖所有用途。

这次不需要把互相依赖的两个模块合并，也不需要再抽一个万能 CommonModule。原来多出来的那条边，来自把“取得数据”与“展示数据”绑在同一个对象上。让格式化接收数据，就能直接删除反向依赖。拆出第三个协调对象是一种手段；若只有一条简短调用链，普通函数或入口中的顺序调用也可以完成相同职责。应比较真正减少了哪些依赖，不能以类和模块数量更多作为改进依据。

### 条件变化后，重新判断这条边是否需要存在

先改变输出要求：预览要截断到 80 个字符。修改 preview 函数就够了，保存的原文不应跟着截断，否则展示要求改变了记录事实。再改变入口要求：只预览一段尚未保存的文本。这个流程也不该为了复用 forId 先写一条记录；可以提取接受文本的格式函数，让已有记录与未保存输入分别提供数据。边界的价值在这里可以被验证：展示变化没有逼迫保存规则改变。

如果预览后来需要请求外部服务，纯函数就不再足够。可以引入一个接受记录内容的预览 Provider，由流程对象同时依赖 CapturesService 与预览 Provider。依赖方向仍然朝向这两个能力，而不是让保存能力反过来依赖每一种使用方式。那时要进一步解释等待、费用和失败语义；不能仅仅把函数改成 async 就宣称整个流程可靠。

即使只有当前这两步，也要分清完成边界。若 create 已成功，preview 随后抛错，Map 中仍然存在记录。把两个方法放进同一个 Module，甚至同一个函数，都不会自动回滚第一步。可以在 preview 函数中暂时抛出 `new Error('preview unavailable')`，将入口中取得 workflow、captures 之后、外层 finally 之前的调用临时替换为：

```ts
try {
  await workflow.run('A preview is a consumer.');
} catch (error: unknown) {
  console.log(error instanceof Error ? error.message : 'Preview failed');
}
console.log('stored count after failure:', (await captures.list()).length);
```

保留外层 finally 中的 app.close，重新编译后运行 main.js。这样查询发生在同一次应用运行中、关闭容器之前，应看到预览错误和记录数 1；若直接用原入口，异常会跳过后续查询，只有 finally 执行，便看不到要比较的存储事实。观察后恢复格式函数与原入口，再编译确认正常输出。此时不能把整条“创建并预览”直接重试为一次新的 create，否则可能新增第二条记录。

这个结果并不要求现在接入事务或后台任务；它要求我们准确描述当前行为。当前展示函数是本地确定性的格式化，流程足够简单。将来引入真实外部动作，第三至六篇会在数据、事务、幂等与任务事实建立后重新处理这条失败边界。模块拆分没有替这些机制完成工作。

### 遇到一条环，怎样决定修哪里

主线到这里已经消除了依赖环。把经验移到更大的模块时，可以先从一个具体操作追踪：它读取哪些事实、改变哪些事实、为何必须调用对方。不要从两个模块的名字相似或业务有关联，直接推导它们必须互相 imports。

如果双方只是使用同一个格式算法，就把算法变成接收数据的函数。如果一方只为了查询数据才依赖对方，而数据已经由调用者取得，就考虑传入需要的值。如果两个独立能力要按顺序合作，由一个用途明确的流程协调它们。如果两个所谓模块必须了解彼此几乎所有内部细节，分界本身可能不成立，合并也可能比加多个转发层更清楚。反过来，如果必须保留双向类关系，才需要进一步研究延迟引用和初始化次序。

还要区别另一种故障：源码文件互相 import，导致装饰器或顶层常量过早读取尚未初始化的类。这时程序可能还没到 NestFactory，就已经抛出 ReferenceError。改业务调用方向与改文件加载关系不是同一项操作。把令牌留在独立的 capture-store.ts，而不是声明在会导入 Service 的 captures.module.ts 中，就避免了 Service 为取得令牌又反向导入组装文件。后面的知识支线会分别运行这两种失败，解释 forwardRef 的实际作用。

当前项目最后保留的变化很小：AppModule 导入 CapturesModule；记录模块拥有 Controller、Service 工厂与存储登记，并导出 CapturesService。摘要、可见性对照和预览流程都在独立示例中。字段没有新增，HTTP 约定没有改变，也没有新增数据库或持久化规则。

下一章回到输入与错误边界：模块已经决定谁能调用哪些能力，但传入的值是否可靠、内部结果怎样成为稳定的公开响应，还要在调用边界上继续建立约束。

本章完成代码状态：`part-02/chapter-10`。

## 本章知识支线

- [支线 10A：文件循环、对象循环与 forwardRef 的边界](side-01-cycles-and-forward-ref.md)：先区分加载失败和组装失败，再用可运行的双向类关系观察延迟引用、元数据、模块导出与初始化次序。

主线中的依赖可见性和业务边界是当前实现的前提；支线补足保留双向关系时的判断，不能把 forwardRef 当成主线重划职责的替代步骤。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| JavaScript import／export | 在文件间引用类、令牌与类型 | 不等于 Nest 的注入可见性；import type 不保留运行时值 |
| Module.providers | 声明本模块怎样创建或取得 Provider | 把同一工厂复制到另一个模块，会新增当地登记 |
| Module.controllers | 组装并接入本模块的 HTTP 入口 | 路由不通过 exports 公开；不要在多处重复登记 Controller |
| Module.imports | 使用其他模块及其导出能力 | 根模块导入不会让消费者自动继承可见性 |
| Module.exports | 允许导入者使用本模块的公开 Provider | 导出 Service 不导出其全部依赖，不自动形成只读权限 |
| 模块再导出 | 经一个入口继续提供已导入模块的公开能力 | imports 自身不意味着再导出；内部 Provider 仍受边界限制 |
| Global | 让已注册全局模块的导出在应用内可用 | 不省略注册与 exports，也不提供跨进程状态 |
| select／get strict | 在入口明确观察某模块的本地登记 | 非严格 get 不能作为构造注入权限的证明 |
| useFactory 的依赖环 | 观察工厂相互等待导致的组装失败 | 类值已经定义，不代表创建依赖无环 |
| 传值与流程协调 | 删除展示对记录操作的反向依赖 | 模块或函数边界不提供事务、补偿与安全隔离 |

官方查阅：[Nest 11 模块](https://docs.nestjs.com/v11/modules)、[自定义 Provider](https://docs.nestjs.com/v11/fundamentals/custom-providers)、[循环依赖](https://docs.nestjs.com/v11/fundamentals/circular-dependency)、[常见依赖错误](https://docs.nestjs.com/v11/faq/common-errors)、[独立应用的模块选择](https://docs.nestjs.com/v11/standalone-applications)。正文中的实例与失败对照使用本书固定的 Nest 11.2.5。

[上一章：Provider 与依赖注入](../chapter-09-providers/chapter.md) · [下一章：建立可信的输入与错误边界](../chapter-11-contracts/chapter.md) · [返回第二篇](../README.md) · [返回全书目录](../../README.md)
