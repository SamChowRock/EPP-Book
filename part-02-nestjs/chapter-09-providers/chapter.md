# 第 9 章 Provider 与依赖注入：把组件组装交给容器

第八章的记录服务还把数据存在 Map 里。后面接入数据库时，最直接的办法是打开 CapturesService，把 set、get 和遍历代码改成数据库调用。这个办法能工作；如果存储只换一次、业务也很少，直接修改可能就是成本最低的选择。

但沿着 create 方法看下去，会发现修改范围不只是那一行 set。原文必须先校验，写入成功才能返回，写入失败不能变成“创建成功”；列表还要保持原来的筛选与截取顺序。我们希望更换存储时保住这些判断，也希望单独观察“写入变慢、写入失败”时，能继续调用同一份业务逻辑。

这就给本章一个具体任务：找出 Service 真正需要存储提供什么，把这个位置做成可以替换的依赖，再让已有 Nest 应用继续使用它。先从现在的代码动手，等手动组装确实遇到问题，再引入容器的相应机制。

**阅读前提**：完成第七、八章。代码从 `part-02/chapter-08` 继续，本章完成状态为 `part-02/chapter-09`。沿用已有版本和依赖。

**本章完成后的变化**：业务仍然提供创建、列表和详情，HTTP 输入输出保持第八章约定；存储对象可以从外部提供，业务调用会等待读写完成。记录仍在内存中，没有数据库、迁移或回填，重启仍丢失。

时间参考（估算）：只阅读约 55～65 分钟；跟做另加约 45～55 分钟，合计约 100～120 分钟。附录按需查阅，支线单列。

## 9.1 从手动组装对象到构造函数注入，解决真实出现的依赖问题

### 从 create 里找出真正要替换的那一步

第八章的 create 在检查原文后，生成了 capture，接着执行：

```typescript
this.captures.set(capture.id, capture);
return { ...capture };
```

若把整个 create 都交给一个“数据库版 Service”，新实现就得重新承担原文校验、ID 和时间生成。另一份实现很容易漏掉一条规则。当前真正想替换的是保存这个记录的动作，其余判断仍然需要保留。

先将这一步想成一个普通对象的方法：

```typescript
this.store.insert(capture);
return { ...capture };
```

这时还没有必要定义接口、选 Symbol 或写 Nest 配置。先看这个改动带来的结果：create 只把已经准备好的记录交出去，保存动作可以由另一个对象执行。记录怎么形成仍由 Service 决定，保存在哪里才交给存储对象。

查找详情也能按同样的理由分开。存储返回记录或“没有找到”；Service 决定没有找到是否构成这次业务调用的失败。存储本身发生故障时，不能返回 undefined 蒙混过去，否则调用方会收到错误的 404。这个区分来自详情接口的含义，不是从某个 Repository 模板复制出来的。

列表稍有不同。若只把 Map.values 搬出去，再让 Service 过滤所有记录，未来数据库仍得把全部行取回进程。第八章已经明确了 text、limit、大小写敏感匹配和先筛选再截取，可以把这些条件一起交给存储执行。Service 保留条件是否合法的检查，存储承担具体查询。这是我们选择 list(options)，而没有直接照抄 Map API 的原因。

到这里，存储对象需要的三个操作才有了依据：insert、find、list。尚未出现修改或删除需求，因此不用把一套完整 CRUD 接口提前搬进来。

### 分出一个对象之后，为什么还要把它传进来

可以先让 Service 自己创建存储：

```typescript
private readonly store = new MemoryCaptureStore();
```

这确实让代码有了分工。不过，一旦要观察写入失败，我们仍然得修改 Service 这一行；换成需要连接参数的实现，Service 还要负责准备连接参数。业务对象仍然掌握着具体实现的选择。

把创建动作移到调用方，问题就变得简单：

```typescript
const store = new MemoryCaptureStore();
const captures = new CapturesService(store);
```

Service 的构造函数只保存传入的对象。换实现时改的是这两行所在的组装位置；调用 create 的流程和原文规则可以继续复用。通过参数把需要的对象交给使用方，这个做法就是依赖注入。它在普通 JavaScript 里已经成立。

也可以传几个函数，而不是传一个对象；或者用闭包生成业务函数。当前存储的写入、查询都需要访问同一份状态，用一个对象把这些操作放在一起，比较容易看清共享关系。选择类是本项目的组织方式，依赖注入本身并不要求用类。

如果项目永远只使用这一个固定存储，Service 内部 new 也未必有问题。这里把创建移出来，是为了完成本章已经提出的替换与失败观察。ID 和时间目前不需要替换，不顺势把每一个函数都抽成 Provider。

### 写入变慢之后，原来的 return 还能表示成功吗

前面那两行替换还有一个漏洞。Map.set 当场完成；将来存储可能需要等待。如果 insert 返回 Promise，而 create 随即 return capture，HTTP 入口就有机会先宣布成功，写入却还没有完成。若稍后写入失败，已经发出的成功响应也无法收回。

因此 create 的完成条件应当改成：校验通过、记录形成，而且存储确认本次写入成功。代码中对应的是：

```typescript
await this.store.insert(capture);
return { ...capture };
```

find 要等到查找结果才能判断是否存在，list 要等到数组才能返回给调用者。我们因此让三个存储方法统一返回 Promise。当前内存实现执行得很快，仍然遵守这个约定；后面换成真正需要等待的实现，调用方不必再从“同步假设”迁移一次。

也可以暂时保留同步接口，到接数据库时再改。那会把等待责任的修改推迟到另一章。这里选择现在完成，是为了马上用慢写入和失败写入核对成功边界。代价是所有调用者都要正确等待；async 不会把 Map 操作搬到其他线程，也不会让查询自动变快。

### 现在再把已经推导出的约定写成类型

先把第八章已有的 Capture 和 CaptureListOptions 移到 `src/capture.ts`，字段不变。这两份模型接下来由业务和存储共同使用：

```typescript
export type Capture = {
  id: string;
  originalText: string;
  createdAt: string;
};

export type CaptureListOptions = {
  text?: string;
  limit?: number;
};
```

新增 `src/capture-store.ts`，此时只需要接口：

```typescript
import type { Capture, CaptureListOptions } from './capture.js';

export interface CaptureStore {
  insert(capture: Capture): Promise<void>;
  list(options: CaptureListOptions): Promise<Capture[]>;
  find(id: string): Promise<Capture | undefined>;
}
```

这个接口是在记录刚才得出的调用关系。它能阻止把缺少 find 的对象传进来，却不能阻止一个实现忽略 limit，或者什么也没保存就声称 insert 成功。类型没有把我们对操作含义的判断一并证明掉。

因此还要记住这次替换必须保住的行为：同 ID 的插入不能覆盖旧记录；找不到和查找失败分开；列表保持第八章的匹配与顺序；外部调用者不能通过修改对象引用改变内部记录。接下来实现内存存储时，这些条件都有对应代码。

新增 `src/memory-capture.store.ts`：

```typescript
import type { Capture, CaptureListOptions } from './capture.js';
import type { CaptureStore } from './capture-store.js';

export class MemoryCaptureStore implements CaptureStore {
  private readonly captures = new Map<string, Capture>();

  async insert(capture: Capture): Promise<void> {
    if (this.captures.has(capture.id)) throw new Error('Capture ID already exists');
    this.captures.set(capture.id, { ...capture });
  }

  async list({ text, limit }: CaptureListOptions): Promise<Capture[]> {
    const items: Capture[] = [];
    for (const capture of this.captures.values()) {
      if (text !== undefined && !capture.originalText.includes(text)) continue;
      items.push({ ...capture });
      if (limit !== undefined && items.length === limit) break;
    }
    return items;
  }

  async find(id: string): Promise<Capture | undefined> {
    const capture = this.captures.get(id);
    return capture === undefined ? undefined : { ...capture };
  }
}
```

写入前检查重复 ID，是为了让“插入一条记录”不会悄悄变成覆盖。写入和读取都复制对象，是为了隔开调用者与内部 Map 的引用；当前字段只有字符串，浅复制满足这里的要求。

过滤依然先于截取，所以前两条不匹配、第三条才匹配时，limit=1 仍会得到第三条。循环提前结束可以减少部分查询工作，但没有匹配项时仍要遍历所有记录。这份实现兑现的是本章的查询含义，不是大数据量下的性能方案。

随后替换 `src/captures.service.ts`。看这一份文件时，沿三个刚才作出的决定读即可：存储从构造参数进入；业务校验留在操作里；需要结果或后续动作的地方等待存储完成。

```typescript
import { randomUUID } from 'node:crypto';
import type { Capture, CaptureListOptions } from './capture.js';
import type { CaptureStore } from './capture-store.js';

export class InvalidCaptureError extends Error {}
export class CaptureNotFoundError extends Error {}

export class CapturesService {
  constructor(private readonly store: CaptureStore) {}

  async create(originalText: unknown): Promise<Capture> {
    if (typeof originalText !== 'string' || !originalText.trim()) {
      throw new InvalidCaptureError('originalText must be a non-empty string');
    }
    if (originalText.length > 2000) {
      throw new InvalidCaptureError('originalText must be at most 2000 code units');
    }
    const capture: Capture = {
      id: randomUUID(),
      originalText,
      createdAt: new Date().toISOString(),
    };
    await this.store.insert(capture);
    return { ...capture };
  }

  async list({ text, limit }: CaptureListOptions = {}): Promise<Capture[]> {
    if (text !== undefined &&
        (typeof text !== 'string' || !text.trim() || text.length > 200)) {
      throw new InvalidCaptureError('text must be a non-empty string of at most 200 code units');
    }
    if (limit !== undefined &&
        (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw new InvalidCaptureError('limit must be an integer from 1 to 100');
    }
    return this.store.list({ text, limit });
  }

  async find(id: string): Promise<Capture> {
    const capture = await this.store.find(id);
    if (!capture) throw new CaptureNotFoundError('Capture not found');
    return { ...capture };
  }
}
```

list 直接返回存储的 Promise，因为这里没有本地错误转换，也没有依赖结果的后续动作。create 要在写完后返回记录，find 要在读完后判断不存在，因此它们先 await。返回 Promise 和等待后继续执行，各自对应当前方法的责任。

### 先不启动 Nest，直接替换一次存储行为

这几个文件都不依赖 Nest 装饰器。即使 Controller 和模块尚未接好，也能用第五章已有的 tsx 独立运行它们。在项目根目录执行：

```bash
node --import=tsx --input-type=module <<'JS'
import { CapturesService } from './src/captures.service.ts';
import { MemoryCaptureStore } from './src/memory-capture.store.ts';
const store = new MemoryCaptureStore();
const captures = new CapturesService(store);
const record = await captures.create('I drink coffee.');
console.log((await captures.find(record.id)).originalText);
console.log((await new CapturesService(store).list()).length);
console.log((await new CapturesService(new MemoryCaptureStore()).list()).length);
JS
```

应依次得到原文、1 和 0。第二个 Service 使用同一存储，读到了记录；第三个 Service 使用新存储，没有记录。状态现在由存储实例承载，而不是由 Service 的数量决定。以后遇到写入后查不到，可以据此先检查创建与查询拿到的是否为同一份存储。

再把一次写入临时换成失败。下面只创建独立业务对象，不改变应用配置：

```bash
node --import=tsx --input-type=module <<'JS'
import { CapturesService } from './src/captures.service.ts';
let writes = 0;
const store = {
  async insert() { writes++; throw new Error('storage unavailable'); },
  async list() { return []; },
  async find() { return undefined; },
};
const captures = new CapturesService(store);
for (const text of ['   ', 'I drink coffee.']) {
  try { await captures.create(text); }
  catch (error) { console.log(error.message); }
}
console.log('write attempts:', writes);
JS
```

第一条输入仍被原文规则拒绝，第二条才到达写入，所以 writes 应为 1；第二次调用报告存储失败，没有返回成功记录。我们没有复制校验代码，也没有修改 CapturesService 来制造故障。把存储传进来，到这里已经解决了一个能直接观察的问题。

## 9.2 Provider、注入令牌，以及类、工厂、值 Provider 的选择

### 手动调用正常，放回 Nest 为什么还缺一步

刚才是我们亲手调用 `new CapturesService(store)`。第八章的 AppModule 却仍写着 `providers: [CapturesService]`，它并没有收到这个 store，也不知道应如何获得它。

尤其当前 Service 保持普通 TypeScript 类，没有构造参数装饰器或可供 Nest 读取的类型元数据。容器可能按空参数创建它，应用先启动，等调用 insert 时才暴露 store 为 undefined。构造函数的 TypeScript 参数要求不会自动变成容器的组装程序。第七章无需构造参数时能用的注册方式，现在已有新的前提。

最直接的接法，是把刚才手动创建的对象交给 Nest。下面是 AppModule 的 providers 替代片段，用来比较组装方式，先不与后面的最终配置混用：

```typescript
providers: [
  {
    provide: CapturesService,
    useValue: new CapturesService(new MemoryCaptureStore()),
  },
]
```

Controller 仍然声明需要 CapturesService，Nest 查到这份登记后，直接把现成对象交给它。provide 表示“用什么键找”，useValue 表示“找到后给出这个值”。这样一份提供依赖的登记，就是 Provider。

对于简单固定应用，这已经可以工作。没有必要因为还没用工厂或 Symbol，就认定它不规范。它的限制也很具体：这次 new 在模块文件求值时发生，同一进程中若创建多个应用容器，可能都收到这份外部对象；存储的创建还嵌在 Service 的创建表达式里，不便让其他消费者复用同一份已登记的存储。

### 让应用组装时再创建，而不是提前准备对象

如果希望每个应用容器负责创建自己的业务对象，可以把“已创建的值”换成“创建它的函数”：

```typescript
{
  provide: CapturesService,
  useFactory: () => new CapturesService(new MemoryCaptureStore()),
}
```

这就是 useFactory。它的必要性来自创建时机和依赖关系，不来自“工厂模式更高级”。当前这个函数已经把创建动作推迟到容器组装时；但存储仍然由它内部创建。若另一个消费者也要用同一存储，不能在另一个工厂里再 new 一次，否则得到的是另一份 Map。

因此下一步才是单独登记存储，再把容器已有的存储传给 Service 工厂：

```typescript
providers: [
  MemoryCaptureStore,
  {
    provide: CapturesService,
    useFactory: (store: CaptureStore) => new CapturesService(store),
    inject: [MemoryCaptureStore],
  },
]
```

MemoryCaptureStore 这个类登记负责创建存储；inject 声明工厂要哪份依赖。Nest 解析这项登记，把对象作为第一个参数传入工厂。若再增加第二个依赖，inject 的第二项对应第二个实参；参数名字不参与匹配。

类名简写也可以展开成 `{ provide: MemoryCaptureStore, useClass: MemoryCaptureStore }`。useClass 描述由哪个构造函数创建对象。当前类没有构造依赖，容器可以直接创建；有依赖的类仍需要明确的参数描述。

手动写法中的“先创建存储，再传给 Service”并没有消失，只是被这两条登记表达出来。依赖先后由 inject 决定，不能拿 providers 数组排列顺序代替。工厂若要先完成异步准备，可以返回 Promise；依赖该工厂结果的消费者需要等它成功，失败就应沿初始化过程暴露。支线会实际改变这一步观察结果。

### 存储换掉时，容器到底应该按什么找

上面的配置仍然可用，但 inject 中出现了 MemoryCaptureStore 这个具体名字。后面提供数据库实现时，可以逐个修改相关消费者的注入配置；也可以继续用 MemoryCaptureStore 作键、把它的 useClass 改成数据库类。后一种在技术上成立，但“用内存类这个名字取得数据库对象”会让配置越来越难读。

我们想表达的是“这里需要记录存储”，而不是“这里必须使用内存类”。TypeScript 已有 CaptureStore 接口，可它在编译后被擦除，不能直接写进运行时 inject 数组。`implements CaptureStore` 也不会告诉容器该选哪个实现。

因此在 `src/capture-store.ts` 的导入之后，新增一个运行时的查找键：

```typescript
export const CAPTURE_STORE = Symbol('CAPTURE_STORE');
```

这个键称为注入令牌。Symbol 不是依赖注入唯一允许的形式，字符串或类值也可以；这里采用单独导出的 Symbol，是为了把存储能力的名字与具体实现分开。所有位置导入同一个值，避免使用方各自创建同描述但不同身份的 Symbol。

对应注册就成为：

```typescript
{ provide: CAPTURE_STORE, useClass: MemoryCaptureStore }
```

Service 工厂中的 inject 改为 `[CAPTURE_STORE]`。这样替换存储时，改的是令牌后面的实现选择；消费者仍表达同一项能力需求。当前只有一个消费者，维护上的节省很小，主要价值是让这个已确定会变化的位置保持明确；这不能推导出所有类都必须额外配一个 Symbol。

### 如果已有对象，换个名字会不会又创建一份

还有一种容易写错的情况：已经登记了 MemoryCaptureStore，又为了提供 CAPTURE_STORE 添加一条 useClass。两条登记各自创建对象，可能一份有记录，另一份为空。不是容器丢了数据，而是我们要求它创建了两份状态。

若需求是“已有存储再增加一个查找名字”，应当写：

```typescript
providers: [
  MemoryCaptureStore,
  { provide: CAPTURE_STORE, useExisting: MemoryCaptureStore },
]
```

useExisting 指向已有登记，在这里复用相同默认作用域实例。反过来，若确实要两份独立状态，分别 useClass 就是合理选择。主线没有其他地方需要按具体类获取存储，所以直接登记一次 CAPTURE_STORE 即可，不额外添加别名。两种配置的实际对象比较放在支线 9A 中。

### 把依赖写在类上，也是另一种可以选择的组织方式

目前工厂已经把需要的参数表达完整。若项目更希望在类附近维护依赖声明，也可以让 Service 使用 Nest 装饰器：

```typescript
@Injectable()
export class CapturesService {
  constructor(@Inject(CAPTURE_STORE) private readonly store: CaptureStore) {}
  // 保留前面已经实现的业务方法。
}
```

这种替代写法需要从 `@nestjs/common` 导入 Injectable、Inject，从存储文件导入令牌值和接口类型；随后 providers 直接登记 Service 类，不再保留它的工厂。Inject 提供运行时令牌，接口负责静态类型，两者各有工作。

好处是依赖描述紧挨着消费者，代价是业务文件引入 Nest。本章沿用普通 TypeScript 业务类，所以继续用工厂。两种写法都能手动 new，也都可以被正确组装；这里没有为了证明某个 API 必须采用而贬低另一个可行方案。

## 9.3 将内存存储放在可替换接口后面，为数据库接入留下边界

### 接回当前应用

现在完整替换 `src/app.module.ts`：

```typescript
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
export class AppModule {}
```

Nest 仍然通过 Controller 的构造参数元数据查找 CapturesService；查到的注册已经从类简写改成工厂。工厂需要的 CAPTURE_STORE 再由 useClass 提供。类令牌与 Symbol 令牌可以出现在同一条依赖链中，不要求整个应用统一用一种令牌。

本章所有提供者仍在同一个模块里。为什么另一个模块不能随意注入它们，imports、exports 如何约束可见性，下一章会通过拆分真实业务模块展开。当前先不增加跨模块配置，避免把一个令牌不存在和一个令牌不可见混在同一轮改造里。

还需要把 `src/capture-query.ts` 中 CaptureListOptions 的类型导入改到 `./capture.js`。它只调整类型来源，查询字符串解析和错误规则保持不变。

最后替换 `src/captures.controller.ts`，把异步结果的完成责任接到底：

```typescript
import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CapturesService } from './captures.service.js';
import { parseListQuery } from './capture-query.js';
import { HttpError, httpResult } from './http.js';

@Controller('captures')
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Get()
  list(@Query('q') q: unknown, @Query('limit') limit: unknown) {
    return httpResult(async () => ({
      items: await this.captures.list(parseListQuery(q, limit)),
    }));
  }

  @Post()
  create(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return httpResult(async () => {
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'Request body must be a JSON object');
      }
      const capture = await this.captures.create(
        'originalText' in body ? body.originalText : undefined,
      );
      response.setHeader('Location', `/captures/${capture.id}`);
      return capture;
    });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return httpResult(() => this.captures.find(id));
  }
}
```

列表的回调现在是 async，先等待 list 得到数组，再包装 items。创建先等待 create 完成，才读 capture.id、设置 Location 并返回。详情已经直接返回 find 的结果，由 httpResult 等待和转换失败，不需要再包一层相同的 async。

只把存储类型改成 Promise，却漏掉这些调用者，会出现两类问题：把 Promise 塞到 items 里返回，或者从 Promise 对象上读不到 id。Nest 会等待 Controller 返回的 Promise，但不会递归等待任意对象字段。第八章提到的边界，现在成为这次真实改造的一部分。

### 让存储真的慢一次，再看成功在什么时候发生

9.1 已用失败写入检查规则。现在 Controller 也已等待业务结果，可以进一步观察“拿到 Promise”和“写入完成”的先后。新增 `examples/storage-completion.mjs`：

```javascript
import { setTimeout as delay } from 'node:timers/promises';
import { CapturesService } from '../dist/src/captures.service.js';
import { MemoryCaptureStore } from '../dist/src/memory-capture.store.js';

const mode = process.argv[2] ?? 'slow';
if (!['slow', 'fail'].includes(mode)) throw new Error('Use slow or fail');
const memory = new MemoryCaptureStore();
const store = {
  async insert(capture) {
    console.log('write started');
    await delay(20);
    if (mode === 'fail') throw new Error('write failed');
    await memory.insert(capture);
    console.log('write finished');
  },
  list: (options) => memory.list(options),
  find: (id) => memory.find(id),
};
const captures = new CapturesService(store);
const pending = captures.create('I want to keep this sentence.');
console.log('caller has a Promise, not a saved record');
try {
  await pending;
  console.log('creation succeeded');
} catch (error) {
  console.log('creation failed:', error.message);
}
console.log('stored count:', (await memory.list({})).length);
```

到这里，主线文件已经接好。先检查并构建，再分别运行：

```bash
npm run typecheck
npm run build
node examples/storage-completion.mjs slow
node examples/storage-completion.mjs fail
```

slow 模式先打印 write started，再打印调用者拿到 Promise；20 ms 的等待结束后才出现 write finished 和 creation succeeded，记录数为 1。fail 模式同样先开始写入，但随后进入 creation failed，记录数为 0，没有成功输出。20 ms 只是让等待发生，不把这个数值当成数据库延迟模型。

这里替换的是存储的执行条件，create 的实现没有改变。保住了“写完才成功”之后，Controller 再等待 create，成功响应才能对应同一完成条件。若只在某一层写 async，却把下面尚未完成的工作抛在身后，这条保证就会断掉。

### 组装成功不等于数据永久保存

当前两个 Provider 都使用默认作用域。对于这份单模块注册，同一个应用容器中的消费者会复用该存储实例。它解决的是“同一次应用运行里使用哪一份对象”，并没有让 Map 获得持久性，也没有让另一个进程共享这份内存。

不要为了“每个请求独立”把 Map 存储改成 request scope：创建和后续读取是两个请求，如果它们各拿到一个新 Map，后一次自然读不到前一次。也不要在默认共享的 Service 字段里保存 currentUser 或某次请求的临时输入；两个异步请求可以在 await 之间交错，单线程不意味着请求互不重叠。

scope 要回答的是这份对象应该由谁共享、活多久；账号数据隔离则需要身份和查询条件，不能用“给每个用户一个 Service”替代。支线 9B 用有限上下文解释默认、request 和 transient 的差异，本章主线继续使用默认作用域。

### 用既有入口确认替换位置没有改变业务

运行：

```bash
npm run typecheck
npm run build
npm start
```

在另一个终端按顺序创建、列表与筛选：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"  I drink coffee.  "}'
curl -i http://127.0.0.1:3000/captures
curl -i 'http://127.0.0.1:3000/captures?q=coffee&limit=1'
curl -i 'http://127.0.0.1:3000/captures?limit=101'
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' --data '{"originalText":"   "}'
```

创建仍为 201，Location 指向实际 ID，原文空格保持。复制该路径请求详情，应得到相同记录；列表和筛选看到新写入，两个错误输入仍是 400，且没有新增记录。最后重启进程再查询，记录消失，说明更换组织方式没有改变当前存储寿命。不是“抽象以后数据丢了”，而是内存实现一直没有持久化。

如果启动报告无法解析 CapturesService 工厂的依赖，先沿组装链核对：注册里是否有 CAPTURE_STORE，inject 是否引用同一 Symbol。还有一种不同的失败：误删工厂、把没有构造参数元数据的普通 Service 改回类简写，容器可能按空参数创建它，直到第一次调用才发现 store 为 undefined；不能假设所有组装遗漏都会在启动阶段自动暴露。若服务启动正常但查询为空，检查是否重复注册出两份存储，再核对业务条件。缺少依赖是组装问题，不应通过给字段加可选标记、在调用点判空后返回空数组来掩盖。

### 同时维护以前能运行的入口

构造函数和返回类型改变后，前文的独立示例也是消费者，不能只修复 HTTP 服务。将 `examples/manual-composition.mjs` 更新为：

```javascript
import { CapturesService } from '../dist/src/captures.service.js';
import { MemoryCaptureStore } from '../dist/src/memory-capture.store.js';

function makeEntry(captures) {
  return {
    record: (text) => captures.create(text),
    list: () => captures.list(),
  };
}

const store = new MemoryCaptureStore();
const shared = new CapturesService(store);
const firstEntry = makeEntry(shared);
const secondEntry = makeEntry(shared);
await firstEntry.record('I want to explain this clearly.');
console.log('shared entry count:', (await secondEntry.list()).length);
console.log('another service, same store:',
  (await new CapturesService(store).list()).length);

const isolatedEntry = makeEntry(new CapturesService(new MemoryCaptureStore()));
console.log('isolated entry count:', (await isolatedEntry.list()).length);
```

三个计数依次为 1、1、0，与 9.1 中的源文件调用对照一致。nest-metadata 示例也要显式传入 MemoryCaptureStore，并等待 create、find 和 list。Controller 的构造令牌仍是 CapturesService，因此原有元数据观察不变；只有业务组装与调用改为本章形式。

支线 7C 的最小容器只支持类 Provider，不支持本章的 Symbol 与工厂注册。为保持它的演示范围，在其 app.ts 中添加一个无参数的演示适配类：

```typescript
class MiniCapturesService extends CapturesService {
  constructor() { super(new MemoryCaptureStore()); }
}
```

补充 MemoryCaptureStore 的导入，把 MiniCapturesController 的构造参数和 MiniAppModule.providers 中的类改为 MiniCapturesService。其 list 方法改为 async 并等待结果；asHttp 改为接收 `T | Promise<T>`，在 async 函数的 try 内 `return await action()`，才能继续转换异步业务错误。这个小类只承担旧实验的组装，不放进主线，也没有把最小容器扩建成另一套 Nest。

完成构建后，可以继续运行这些入口：

```bash
node examples/manual-composition.mjs
node examples/nest-metadata.mjs
npm exec -- tsc -p examples/mini-nest/tsconfig.json
node dist/examples/mini-nest/main.js
```

最小框架仍用独立端口 3004，按支线 7C 的创建和查询请求核对后停止。前文的代码讲解对应前文章节分支；当前分支中的示例则适配本章 Service，避免新旧构造方式混用。

### 后面换数据库，还需要兑现哪些条件

这个边界减少了换存储时对业务与 HTTP 的影响，但没有让数据库接入变成“只改一行 useClass”。SQL 仍需明确字段、约束、连接、迁移和查询语义。比如 Map 当前按插入顺序返回，数据库默认结果并无这个保证；后面需要用明确的数据依据和 ORDER BY 保持或有意演进顺序，不能无声换成另一种排序。

再比如数据库查询的大小写匹配、错误分类、重复 ID 约束，都要与当前契约对照。多步业务开始需要事务时，单独的 insert／find 是否还足以表达一次原子操作，也要重新评估；不是有了接口就自动解决一致性。当前契约针对本章的单次读写，未来改变条件时仍要承担相应设计责任。

## 9.4 开发中的依赖替换与 Fake

### 只想稳定观察一条详情时，需要替换到哪里

假设正在调整详情页：每次都希望看到同一条原文，不想启动后先创建记录、再复制随机 ID。可以在页面直接写一个对象，显示效果能先看，但这样不会经过 Service 的详情查询和“记录不存在”判断。也可以预先给内存存储插入一条记录，随后继续使用完整读写行为。

如果这次只需要观察详情调用，另一个更小的办法是给存储的 find 返回固定结果，Service 仍然运行。正文已经把存储作为构造参数传入，现在不需要修改 Service，就能表达这个替换。需要交互式新增和查询时，则直接用已有内存实现，不把固定结果慢慢补成第二套存储。

下面选用一次固定详情演示。find 只认识 demo-capture；其他操作明确失败，防止调用方误以为它能保存数据。Nest 只要把这份现成对象交给 Service 工厂，所以此处 useValue 正好对应需要，而不必新建一个类。

新增 `examples/provider-values/main.ts`：

```typescript
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { CAPTURE_STORE } from '../../src/capture-store.js';
import type { CaptureStore } from '../../src/capture-store.js';
import { CapturesService } from '../../src/captures.service.js';

const fixedStore: CaptureStore = {
  async find(id) {
    return id === 'demo-capture' ? {
      id, originalText: 'A fixed example.', createdAt: '2026-01-01T00:00:00.000Z',
    } : undefined;
  },
  async insert() { throw new Error('This example supports find only'); },
  async list() { throw new Error('This example supports find only'); },
};

@Module({
  providers: [
    { provide: CAPTURE_STORE, useValue: fixedStore },
    {
      provide: CapturesService,
      useFactory: (store: CaptureStore) => new CapturesService(store),
      inject: [CAPTURE_STORE],
    },
  ],
})
class PreviewModule {}

const app = await NestFactory.createApplicationContext(PreviewModule, {
  logger: false, abortOnError: false,
});
try {
  console.log(await app.get(CapturesService).find('demo-capture'));
} finally {
  await app.close();
}
```

这份固定对象用 CaptureStore 检查方法形状，注册时通过 useValue 原样提供。没有手写假的 CapturesService：原有 Service 仍运行，所以查不到时转换业务错误的规则继续保留。替换发生在依赖边界，而不是把要观察的业务操作整段绕开。

createApplicationContext 只建立 Nest 应用容器，不监听 HTTP。这里用它取得组装完成的 Service，再直接调用方法；get 只出现在演示程序的入口，不散布到业务代码里。若每个 Service 都自己调用容器 get 去寻找依赖，需求就从构造参数里隐藏起来，也重新依赖了全局查找环境。

新增独立编译配置 `examples/provider-values/tsconfig.json`：

```json
{
  "extends": "../../tsconfig.json",
  "include": ["./*.ts"]
}
```

运行：

```bash
npm exec -- tsc -p examples/provider-values/tsconfig.json
node dist/examples/provider-values/main.js
```

应看到 ID 为 demo-capture、原文为 A fixed example. 的对象。这里的固定 ID 只供程序内演示，不是主线生成规则，也没有写入 HTTP 服务的 Map。finally 中关闭应用，避免演示程序把自己的应用上下文留在不明确的生命周期里；完整资源关闭机制留到第十三章展开。

如果改成调用 create，有效输入会进入固定对象的 insert，随后得到明确错误；这正好说明它没有实现写入。不能为了让更多演示“成功”，把 insert 改成什么也不做就返回，否则写入成功的信号会与实际行为脱节。真正需要交互式创建和查询时，应使用本章已有的内存实现，而不是不断给固定返回补功能。

以后接入收费的外部依赖时，同样可以在开发组装处提供有限的固定实现，先检查界面和调用流程，再用少量真实请求核对格式、鉴权、超时、错误与计费行为。是否替换、替换到什么程度，由这次要观察的行为决定；不要把 Fake 的成功记录当作真实接入已经完成的证据。

到这里，可以沿一条完整链解释服务如何工作：Controller 声明需要 CapturesService，容器按工厂创建它，工厂所需的 CAPTURE_STORE 由指定实现提供；调用时先执行业务规则，再等待存储，最后映射 HTTP 结果。下一章会把这组对象放进明确的模块边界，继续回答哪些能力可以被别的模块使用。

本章完成代码状态：`part-02/chapter-09`。

## 本章知识支线

- [支线 9A：令牌怎样找到对象，两个名字是否指向同一实例](side-01-token-identity.md)：通过类／别名、同描述 Symbol、缺少注册和异步工厂观察组装依据与失败位置。
- [支线 9B：对象由谁共享，作用域怎样沿依赖传播](side-02-provider-scopes.md)：用默认、请求上下文与 transient 实例对照，解释状态为什么共享或丢失，以及为何不能用作用域替代数据隔离。

支线入口位于正文之后，时间单列；当你无法解释同一类为何出现两份状态、或一个消费者为什么跟着请求变化时，应完成相应实验再继续拆分模块。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| 构造函数注入 | Service 接收外部存储 | 不用默认 new 掩盖组装遗漏 |
| CaptureStore | 描述当前所需读写能力 | 类型检查不证明行为、顺序与失败语义 |
| CAPTURE_STORE／Symbol | 提供运行时查找身份 | 共享导出值；描述相同不代表同一令牌 |
| provide／useClass | 用指定类满足令牌 | 两份注册不因同一构造函数自动共享实例 |
| useFactory／inject | 显式声明组装函数和依赖 | 按数组顺序传值；异步工厂需要等待完成 |
| useValue | 提供已有对象或配置值 | 不复制对象，不自动检查业务行为 |
| useExisting | 为已有注册提供别名 | 引用已有 Provider，不再创建同类对象 |
| Injectable／Inject | 类 Provider 的依赖描述与显式令牌 | 声明不等于注册；接口类型不能当运行时键 |
| Promise 存储契约 | 统一完成与失败边界 | Controller 等待结果后再包装或设置 Location |
| createApplicationContext／get／close | 独立观察容器组装 | 不监听 HTTP，不自动执行请求管线 |
| 默认作用域 | 当前应用内复用存储 | 不持久化，不跨进程共享，不代替权限条件 |

官方查阅：[Nest 11 自定义 Provider](https://docs.nestjs.com/v11/fundamentals/custom-providers)、[异步 Provider](https://docs.nestjs.com/v11/fundamentals/async-providers)、[作用域](https://docs.nestjs.com/v11/fundamentals/injection-scopes)、[独立应用容器](https://docs.nestjs.com/v11/standalone-applications)、[TypeScript 结构类型兼容](https://www.typescriptlang.org/docs/handbook/type-compatibility.html)。Provider 实验对应本章固定的 Nest 11.2.5，存储行为以本文契约与实际实现为依据。

[上一章：Controller 定义系统的 HTTP 入口](../chapter-08-controllers/chapter.md) · [下一章：Module 建立清楚的业务边界](../chapter-10-modules/chapter.md) · [返回第二篇](../README.md) · [返回全书目录](../../README.md)
