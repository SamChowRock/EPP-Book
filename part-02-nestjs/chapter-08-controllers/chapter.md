# 第 8 章 Controller 定义系统的 HTTP 入口

第七章把记录操作从请求处理函数里抽了出来，再让 Nest 组装 Service 和 Controller。现在三个接口仍能工作，但 Controller 里还保留着不少手写服务的形状：自己从 URL 截出 ID、读取请求流、调用 `sendJson()`。迁移时这样做，是为了先保证行为不变；接下来要看清哪些工作可以交给框架，以及交出去之后由谁负责。

这一章沿同一组接口继续推进。我们给列表增加按原文片段筛选和限制返回条数的能力，让路径、查询、请求体分别承载不同的输入；同时改用 Nest 的返回值响应方式。实现过程中要始终能回答：这一步是在解释 HTTP，还是在执行业务规则？去掉一个装饰器、换一种输入，究竟哪一层会改变？

**阅读前提**：完成第七章正文。代码从 `part-02/chapter-07` 继续，本章完成状态为 `part-02/chapter-08`。装饰器描述与方法调用的关系可回看支线 7A／7C；流读取和中间件顺序可回看支线 7B。

支线 7C 的最小 Nest 实验到第七章结束。从本章起删除 `examples/mini-nest/`，后续功能使用 Nest 本身实现。若要重做该实验，使用 `part-02/chapter-07` 的代码。

**本章结果**：能组织方法与路径，把外部输入转成明确的业务参数，解释请求体解析与 `@Body()` 的分工，并选择自动响应、手动响应或 passthrough。已有创建、无参数列表和详情继续保持状态码与 JSON 约定；列表新增两个可选查询参数。

记录字段仍是 `id`、`originalText`、`createdAt`，存储仍在 Service 的 Map 中。没有新增数据库、迁移或回填，也没有提前引入存储接口；第九章再处理可替换依赖。本章使用第七章锁定的 Nest 11.2.5、Express 5.2.1 和 TypeScript 5.9.3，不新增第三方依赖。

时间参考（估算）：只阅读约 45～55 分钟；跟做另加约 35～45 分钟，合计约 80～100 分钟。附录按需查阅，支线单列。

## 8.1 路由、路径参数、查询参数、请求体与响应映射

### 先确定一次请求在选什么

详情请求 `/captures/某个ID` 选择一个具体记录；列表请求 `/captures?q=coffee&limit=2` 仍然选择记录集合，只是附带筛选与数量条件。创建请求则在 `POST /captures` 的正文中提交原文。它们不是三种互换的装饰器写法，而是三种不同的输入位置。

为什么不把所有内容都放进一个 POST 的 JSON？技术上可以，但那样会把读取和创建混在一个协议入口，调用方无法再从方法与路径判断操作类别。为什么不写成 `/captures/coffee/2`？因为 coffee 不是记录身份，筛选条件还会继续增长；用查询参数能保持集合地址稳定，让各项条件独立表达。这里采用常见的资源式接口组织，同时保留已有调用方式。

| 操作 | HTTP 入口 | 进入业务操作的内容 | 成功结果 |
| --- | --- | --- | --- |
| 创建记录 | `POST /captures` | JSON 中的 `originalText` | `201`，记录与 `Location` |
| 列出记录 | `GET /captures` | 可选的文本片段与数量上限 | `200`，`{ items: [...] }` |
| 查看详情 | `GET /captures/:id` | 一个记录 ID | `200`，单条记录 |

新增条件只影响列表。详情查不到记录仍是 `404`；列表筛选不到是 `200` 与空数组，因为列表操作成功了，只是没有符合条件的记录。不要因为“结果为空”就不分场景地返回同一种状态。

### 路由描述如何变成方法调用

类上的 `@Controller('captures')` 提供前缀，方法上的 `@Get(':id')` 提供方法与后缀。Nest 初始化时把它们组合，向底层路由器注册 `GET /captures/:id`。请求到达后，路由器先匹配，再由 Nest 取得参数并调用 Controller 实例的方法。方法名叫 `detail` 还是 `findOne`，并不决定公开地址。

第七章的详情方法自己读取 `request.url`，再用 `slice()` 截出 ID。现在方法可以改为下面的形状；`httpResult()` 稍后实现，负责把业务失败转换成原有 HTTP 错误结构：

```typescript
@Get(':id')
detail(@Param('id') id: string) {
  return httpResult(() => this.captures.find(id));
}
```

`@Param('id')` 描述“把已匹配路径参数中的 id 放到这个形参位置”。它不是从形参名字猜输入来源。把 TypeScript 形参改成 `captureId` 而保留装饰器中的 `'id'`，仍然能工作；把装饰器改成 `'captureId'` 而路由仍写 `:id`，拿到的就不是原来的值。参数名之间的关联是显式契约。

`id: string` 也不会检查 UUID 格式。这里预期的是路由器提供的单个路径字符串；是否存在对应记录由 Service 判断。以后若把详情 ID 改成数字，写 `id: number` 不会把 URL 中的字符串自动变成数字，仍需显式转换和校验。第五章建立的“类型检查不等于运行时检查”在装饰器方法里依然成立。

这一变化还受第七章 `httpBoundary` 的约束。它先拒绝大小写变化、尾斜杠、额外路径段和不允许的方法，并对包含百分号的详情 ID 返回 `404`，然后才进入 Nest 路由。因此本章虽然改用 `@Param()`，仍保留字面 UUID 的路径契约，没有悄悄开放另一套编码形式。对任意字符串标识的新接口不能直接照搬这个限制；支线 8A 会单独解释 URL 编码与解析的边界。

### 路由顺序不能代替资源设计

如果以后增加 `GET /captures/stats`，它和 `GET /captures/:id` 的形状有重叠：字符串 stats 也能占据 `:id`。在当前 Express 适配器下，应把静态路径处理方法放在动态路径之前，避免先被详情方法接住。不要依赖方法名字、ID 的 TypeScript 类型，或者“stats 看起来不像 UUID”替路由器排除匹配。

更重要的是，当前还有一层先执行的兼容入口。将来若新增 `/captures/:id/history`，不仅要声明新路由，也要同步修改 `httpBoundary` 的路径与方法判定，否则请求会在到达 Controller 前被拒绝。只在 Controller 上加装饰器，不代表所有上游入口都已放行。这个显式清单目前用来维持旧接口，路由增长后要在第十二章请求机制的整理中重新安排它的职责。

这些是新增接口时的推导，本章没有添加 stats 或 history。当前三个入口没有静态／动态冲突；先保持明确范围，不为演示路由 API 增加无需求的业务功能。

### 查询字符串先成为值，再成为业务参数

列表新增的两个参数这样约定：`q` 按大小写敏感的字面子串匹配原文，保留空格，不执行正则，也不做全文搜索；提供时必须是非空白字符串，最多 200 个 UTF-16 代码单元。`limit` 提供时为 1～100 的十进制整数，先筛选，再按现有插入顺序取前若干条。它只是截取结果，不表示已经实现分页。

两个参数都不提供时，继续返回全部记录，以保持原有调用行为。不能顺手把默认值改成 20，再说“只是换了 Controller 写法”。这也保留了原有的无界列表成本；内存示例尚未建立适合大量数据的公开列表策略，第三篇查询与分页会在真实数据量下重新设计默认限制和顺序。显式提供 `limit` 的调用可以先控制这次返回的条数。

在 Express 的 simple 查询解析器下，`?limit=2` 提供的是字符串 `'2'`，不是数字；`?limit=1&limit=2` 则可能提供数组。`?limit=` 是空字符串，不等于没有这个字段。先检查结构，再解释语义，才能区分这些情况。

新增 `src/capture-query.ts`：

```typescript
import type { CaptureListOptions } from './captures.service.js';
import { HttpError } from './http.js';

export function parseListQuery(q: unknown, limit: unknown): CaptureListOptions {
  if (q !== undefined && typeof q !== 'string') {
    throw new HttpError(400, 'q must occur once and be a string');
  }
  if (limit !== undefined &&
      (typeof limit !== 'string' || !/^[1-9]\d{0,2}$/.test(limit))) {
    throw new HttpError(400, 'limit must be a decimal integer from 1 to 100');
  }
  return {
    text: q,
    limit: limit === undefined ? undefined : Number(limit),
  };
}
```

这里把 HTTP 字段 `q` 翻译成业务含义更明确的 `text`。重复的已知参数不是偷偷选第一个或最后一个，而是因为不是单个字符串而返回 `400`。本章只读取这两个已知字段，其余查询参数继续忽略，保留前文行为；它不是严格拒绝未知字段的完整 Schema。`q[]` 也是另一个未识别的字段名，不会被当成 q 数组展开，不能用它替代 `q`。

先用正则检查数字文本，再用 `Number()` 转换，是为了明确接受范围。直接 `parseInt('2oops')` 会得到 2，`Number('')` 会得到 0，`Number('1e2')` 会得到 100；这些结果都可能悄悄放宽公开输入规则。当前正则拒绝空值、符号、指数、小数、前导零和超过三位的文本。转换后是否位于 1～100，还由 Service 的业务参数约束确认，避免另一个入口绕过限制。

为什么不一开始就把 `@Query('limit') limit: number` 写好？因为类型断言只能让后续代码看起来拿到了数字，既没有排除数组，也没有处理空值。为什么不立刻引入 Pipe？我们先把解析责任和规则解释清楚；第十一、十二章再把相同责任放到可复用的入口机制中。当前这个函数已经可以独立调用，不需要依靠框架才能判断输入是否合法。

### `@Body()` 取的是解析结果

第七章关闭了 Nest 默认请求体解析器，Controller 自己调用 `readJson()`。如果这时只把方法参数改成 `@Body() body`，请求里的字节不会因此自动变成对象。`@Body()` 从请求对象上取 body；把流读完、按 UTF-8 解码、执行 JSON.parse 的工作，必须有其他代码完成。

有两种可行做法：启用框架默认解析器，按它的大小限制、媒体类型与错误方式配置和适配；或者保留已有读取函数，把解析移到路由之前。这一章选后者，因为前文已经建立了 16 KiB 字节限制、JSON 语法错误和 `415` 等约定。目的不是说自写解析器比成熟中间件更适合所有服务，而是避免把入口重构和解析策略更换混在一起。

新增 `src/capture-body.ts`：

```typescript
import type { Request, Response, NextFunction } from 'express';
import { HttpError, readJson, respond } from './http.js';

export function captureBody(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  // httpBoundary has already accepted the path and method.
  if (request.method !== 'POST') {
    next();
    return;
  }
  void respond(response, async () => {
    const mediaType = request.headers['content-type']
      ?.split(';')[0]?.trim().toLowerCase();
    if (mediaType !== 'application/json') {
      throw new HttpError(415, 'Content-Type must be application/json');
    }
    request.body = await readJson(request);
    next();
  });
}
```

这段代码的位置有前提：`httpBoundary` 已先接受了方法与路径，目前能通过的 POST 只有创建记录，因此这里只需区分 POST。以后增加其他 POST、尤其是文件上传入口时，应按路由和媒体类型重新划分解析范围，不能继续让所有 POST 强制读取 JSON。

`await readJson()` 完成之后才赋值并 `next()`，所以 Controller 看到的是解析结果。如果内容类型或 JSON 语法失败，`respond()` 会结束错误响应，业务方法不执行。JSON 值是否为对象则留在 Controller 判断：`null` 和数组都可以是合法 JSON，但不满足这个接口的对象契约。

随后将 `src/app.ts` 改为：

```typescript
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { captureBody } from './capture-body.js';
import { httpBoundary } from './http-boundary.js';

export async function createApp(): Promise<NestExpressApplication> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    abortOnError: false,
  });
  app.set('query parser', 'simple');
  app.use(httpBoundary);
  app.use(captureBody);
  return app;
}
```

顺序有因果关系：先筛方法和路径，才为被接受的创建请求消耗读取工作；读完后才交给路由。`query parser` 显式选 simple，让本章的查询结构不依赖隐含配置。`bodyParser: false` 继续保留，否则两套读取逻辑可能争用同一条请求流。请求对象可以被多层访问，请求体字节却不是能任意回放的普通数组。

还有一个容易误会的地方：`next()` 不返回下游执行完成的 Promise。这里的 `respond()` 保护的是当前解析动作，不能代替 Controller 的错误边界。解析成功后，路由中的失败由后面的 `httpResult()` 和 Nest 处理。这正是支线 7B 中“调用 next”和“等下游完成”的区别。

### 返回一个对象之后，谁真正发送响应

第七章使用普通 `@Res()` 注入 Express 响应对象，代码自己调用 `writeHead()` 与 `end()`。这样可以直接控制状态与字节，但每个成功分支也要记得完成响应。现在普通 JSON 结果可以改为 return，由 Nest 等待方法结果，再通过适配器发送；如果返回 Promise，Nest 会等待其成功或失败，而不是把 Promise 对象序列化。

普通 GET 成功默认是 `200`，POST 默认是 `201`。如果接口语义确实需要其他状态，可以用 `@HttpCode()`；但不能为了使用 API 就把本来已经创建完成的记录改成 `202`。202 表达接受了处理请求，适合另有后续处理结果的契约，不会凭空建立后台任务。支线 8B 用独立接口观察状态覆盖，本章创建仍为 201。

动态 `Location` 只有创建出 ID 后才知道，无法用固定头部值表示。这里使用 `@Res({ passthrough: true })`：让 Controller 只设置头部，仍把响应体返回给 Nest。不能再调用 `json()` 或 `end()` 抢先发送；如果采用普通 `@Res()`，又只 return 一个对象，则这条路由的自动发送被关闭，请求可能一直等待。

这几种写法的差异不在“哪种更高级”，而在响应完成责任由谁持有。普通 JSON 接口优先用返回值，有动态头部时用 passthrough；需要深度操作平台响应时可以手动完成，但要把所有成功与失败路径接好。流式输出、文件传输的专门机制会在相应场景展开，不把本章这组 JSON 写法当成所有响应的通用模板。

## 8.2 Controller 怎样将 HTTP 输入交给业务逻辑，哪些工作应留在 Service

### Service 接收业务条件，不接收查询字符串

此时还不能把 Controller 简化成 `return captures.list(request.query)`。如果 Service 需要识别 `'2'`、数组、`q` 字段名和 Express 对象，它就开始依赖 HTTP 的表达方式。以后管理命令传入数字 2，也要先伪造成查询字符串才能调用。

所以 `parseListQuery()` 交付 `{ text?: string; limit?: number }`。Service 负责这些条件如何作用于记录，以及这个操作接受什么有效值。给 `src/captures.service.ts` 增加类型，并替换原来的 `list()`；创建和详情方法保持原样：

```typescript
export type CaptureListOptions = {
  text?: string;
  limit?: number;
};
```

```typescript
  list({ text, limit }: CaptureListOptions = {}): Capture[] {
    if (text !== undefined &&
        (typeof text !== 'string' || !text.trim() || text.length > 200)) {
      throw new InvalidCaptureError('text must be a non-empty string of at most 200 code units');
    }
    if (limit !== undefined &&
        (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
      throw new InvalidCaptureError('limit must be an integer from 1 to 100');
    }
    const items: Capture[] = [];
    for (const capture of this.captures.values()) {
      if (text !== undefined && !capture.originalText.includes(text)) continue;
      items.push({ ...capture });
      if (limit !== undefined && items.length === limit) break;
    }
    return items;
  }
```

这里先检查参数，再遍历 Map。文本匹配成功才把副本加入结果，达到数量限制后停止。假如先取前两条再过滤，而第三条才含有 coffee，就会漏掉本应返回的匹配项；筛选与截取顺序不是可以随意交换的实现细节。

目前插入顺序来自同一个 Map，且没有修改、删除操作，因此对当前进程里的这批记录可解释。它没有承诺跨重启、数据库导入或相同时间戳下的稳定分页顺序。以后换成 SQL 时，必须把需要的顺序写进查询，不能假设数据库自然返回 Map 的顺序。

返回值仍是副本。若直接把内部对象推到列表，程序内的调用者就可以绕过 `create()` 修改原文，破坏第七章建立的规则。另一方面，这个循环也没有让所有查询都变成常数成本：没有匹配项时需要扫描全部记录；即使 limit=1，也可能扫到最后才找到第一条。输出数量限制与查询计算成本是两个不同约束。

### 错误含义复用，HTTP 呈现由入口决定

改变成功响应方式后，失败也要接上。如果让 `InvalidCaptureError` 直接抛到 Nest，它不是 Nest 的 HttpException，框架不能仅凭类名知道应返回 `400`。客户端可能收到默认 `500` 或不同的 JSON 形状，尽管业务校验本身完全没变。

不能因此把 Service 里的错误都换成 `BadRequestException`。Service 的原文规则仍要供 HTTP 之外的入口调用；需要的是 HTTP 层翻译已有失败。保留 `HttpError`、`readJson()`、`sendJson()`，在 `src/http.ts` 顶部增加：

```typescript
import { HttpException } from '@nestjs/common';
```

把旧 `respond()` 替换为下面这一组函数，先抽出原来的错误分类，再让手动响应和返回值路径共用：

```typescript
export async function respond(
  response: ServerResponse,
  action: () => void | Promise<void>,
): Promise<void> {
  try {
    await action();
  } catch (error: unknown) {
    if (response.destroyed || response.writableEnded) return;
    const failure = httpFailure(error);
    sendJson(response, failure.statusCode, failure.body, { Connection: 'close' });
  }
}

function httpFailure(error: unknown): {
  statusCode: number;
  body: { error: string };
} {
  const statusCode = error instanceof HttpError ? error.statusCode
    : error instanceof InvalidCaptureError ? 400
    : error instanceof CaptureNotFoundError ? 404 : 500;
  if (statusCode === 500) console.error(error);
  return {
    statusCode,
    body: { error: statusCode === 500 ? 'Internal server error' : errorMessage(error) },
  };
}

export async function httpResult<T>(action: () => T | Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    const failure = httpFailure(error);
    throw new HttpException(failure.body, failure.statusCode);
  }
}
```

`httpFailure()` 只决定状态和公开错误体；`respond()` 仍服务于前置中间件，直接写出失败；`httpResult()` 则把分类结果变成 Nest 能识别的异常，由框架完成响应。传给 HttpException 的是对象 `{ error: ... }`，因此保持当前公开结构，不依赖框架对字符串消息生成的默认错误形状。

`return await action()` 也有用途。若后续业务方法返回拒绝的 Promise，await 会让拒绝在当前 try 内发生，再进入 catch。直接 `return action()` 则会让当前函数提前返回那个 Promise，异步失败不会被这个 catch 捕获。它不是为了让同步 Map 操作看起来更“异步”，而是让边界可以接住当前回调声明允许的两种结果。

这个等待只针对回调返回的 Promise，不会递归等待对象属性。当前 list 返回同步数组，所以 `{ items: this.captures.list(...) }` 成立；以后若改成异步数据库查询，必须先 `await this.captures.list(...)` 再组装 items，并把回调改为 async。把一个 Promise 塞进 items 后直接 return 对象，既拿不到实际列表，也无法让这里的 catch 接住那个游离的拒绝。

只有已认识的输入错误和不存在错误会映射为 400／404；其他失败继续为 500，详细错误只记在服务端。不要写成 catch 后统一返回 400，否则程序 bug、依赖失败也会被说成调用者提交错误。第十二章会讨论如何用框架请求机制统一入口处理；现在先把已存在的错误约定接完整。

成功响应交给适配器后，Content-Length、ETag 等自动头部可能与手写 `sendJson()` 时不同，错误响应也不统一强制关闭连接。本章保持的是业务约定：状态码、JSON 内容、Content-Type、创建位置和不支持方法时的 Allow；不声称传输字节、头部顺序与连接策略完全相同。业务兼容与底层实现逐字不变不是一回事。

### 把三条入口连起来

现在可以完整替换 `src/captures.controller.ts`：

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
    return httpResult(() => ({
      items: this.captures.list(parseListQuery(q, limit)),
    }));
  }

  @Post()
  create(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return httpResult(() => {
      if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new HttpError(400, 'Request body must be a JSON object');
      }
      const capture = this.captures.create(
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

三个方法的共同工作是取输入、调用业务、映射结果。创建仍先排除 null、数组和其他 JSON 原始值，再只取 originalText；客户端夹带 id 或 createdAt 不会覆盖服务端生成规则。原文非空白和长度检查仍留在 Service，所以新增一个非 HTTP 入口也不能存入非法记录。

这里没有强行让 Controller 缩成一行。对象形状检查、Location 和列表外层的 items 都属于 HTTP 契约，放在入口有明确理由。反过来，即使过滤循环只有两行，它也决定“哪些记录符合条件”，应留在可复用的业务操作里。判断边界要看改变什么需求会影响它，而不是看代码行数。

还可以用一个变化核对这套划分。若以后客户端把查询参数 q 改叫 keyword，变化在 Controller 的取值位置和 HTTP 说明，Service 的 text 不必跟着改。若筛选改为忽略大小写，变化在业务匹配规则及其约定，所有入口应同时受影响；若只是把响应包成 `{ data: { items } }`，则改变的是公开接口映射。这三种改动不能因为都发生在“列表功能”里就堆到同一层。

## 8.3 先用请求和响应观察接口行为，再在依赖注入章节替换组件

### 先建立一批能区分规则的数据

完成以上修改后，在代码项目根目录运行；修改后必须重新构建再启动，当前 dev 命令也不提供热更新：

```bash
npm run typecheck
npm run build
npm start
```

在另一个终端依次创建三条记录。为便于观察插入顺序，从刚启动的空内存进程开始；若保留了旧记录，先根据原文辨认本轮结果，不把旧数据误认为筛选失败。

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"I prefer tea."}'
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"  I drink coffee.  "}'
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"Coffee keeps me awake."}'
```

每次都应是 201，响应中的原文空格保持不变，Location 指向刚创建的 ID。复制第二次返回的 Location 路径，接到 `http://127.0.0.1:3000` 后请求详情，应拿到同一条记录。不要手输示例 UUID；ID 与时间由每次运行生成。

```bash
curl -i http://127.0.0.1:3000/captures
curl -i 'http://127.0.0.1:3000/captures?limit=1'
curl -i 'http://127.0.0.1:3000/captures?q=coffee&limit=1'
curl -i 'http://127.0.0.1:3000/captures?q=Coffee'
curl -i 'http://127.0.0.1:3000/captures?q=unmatched'
```

第一条看到全部三条；第二条只看到 tea；第三条应得到第二条原文，而不是空数组，这检验的是“筛选在截取之前”；第四条只匹配大写 Coffee；第五条是 200 与空 items。URL 用引号包住，避免 shell 把 `&` 当作后台执行符号。带空格或加号的关键词可用 `curl --get --data-urlencode 'q=C++ & Node' URL`，不要自己用字符串拼接猜编码。

### 让失败发生在不同位置

接着发起这些请求，并在最后再读一次无参数列表：

```bash
curl -i 'http://127.0.0.1:3000/captures?limit=2oops'
curl -i 'http://127.0.0.1:3000/captures?limit=101'
curl -i 'http://127.0.0.1:3000/captures?limit=1&limit=2'
curl -i 'http://127.0.0.1:3000/captures?q='
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' --data '{'
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' --data 'null'
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' --data '{"originalText":"   "}'
curl -i -X DELETE http://127.0.0.1:3000/captures
curl -i http://127.0.0.1:3000/captures
```

前七条应为 400，但失败层次不同：非法数字文本与重复参数停在查询解析；101 和空白筛选条件由 Service 拒绝；损坏 JSON 停在读取解析；null 停在 Controller 的对象检查；空白原文停在创建规则。DELETE 仍是 405，并含 `Allow: GET, POST`。最后列表仍为原来三条，失败没有留下记录。

还要沿用第七章的错误请求核对：错误媒体类型为 415，超过 16 KiB 为 413，未知路径为 404，错误大小写和尾斜杠不放行。它们都发生在路由的前面；Controller 写法改变不应该使旧边界失效。已有创建数据的字段没有变化，客户端不需要迁移记录或重发原文。

### 用断点区分“没进方法”和“方法没有完成响应”

需要定位时，停止普通进程，执行 `npm run debug`，沿第二章已有的 Chrome Node 调试入口连接。先继续越过启动暂停，再分别在 `capture-body.ts` 赋值 body 之后、Controller 方法内部、Service 的 list 循环处打断点。

损坏 JSON 不会到达后两个位置；合法 JSON 的 null 会到达 Controller，却不会到达 create；有效列表请求会看到 q 仍是字符串、转换后的 limit 才是数字。对比 `?limit=1&limit=2`，可以观察查询解析器产生的数组，说明错误不是 TypeScript 编译器发现的。断点位置用于验证因果，不只是确认“代码跑到了这里”。

如果断点命中 Controller，方法也 return 了，但客户端一直等待，优先检查是否用了普通 `@Res()` 却没有发送。若返回了 404 且根本没进方法，先核对 httpBoundary，再看方法／路径与注册；若进入方法后得到 500，再看服务端错误及错误映射。不要一看到 404 就去改数据库，一看到等待就认定 Service 卡住。

### 换一个入口，核对边界是否真的成立

停止 HTTP 服务不是必要条件，下面的独立进程有自己的 Map。完成构建后运行：

```bash
node --input-type=module <<'JS'
import { CapturesService } from './dist/src/captures.service.js';
const captures = new CapturesService();
captures.create('tea');
captures.create('coffee');
console.log(captures.list({ text: 'coffee', limit: 1 }));
try {
  captures.list({ limit: 0 });
} catch (error) {
  console.log(error.message);
}
JS
```

应先看到 coffee 记录，再看到数量范围错误。没有 request、query 或 response，业务仍然可调用，规则仍然生效；这比只把文件命名为 service 更能说明职责已分开。这个独立程序不会读取正在运行的 HTTP 进程中的记录，复用代码不等于跨进程共享实例。

到这里，HTTP 输入已经被翻译成明确的业务调用，成功和失败都能走到完整响应。下一章面对的变化是存储组件替换：Service 当前仍直接持有 Map，需要进一步建立注入令牌、Provider 和替换位置。先把本章这些请求结果固定下来，才能判断后面的组件替换是否保持了入口行为。

本章完成代码状态：`part-02/chapter-08`。

## 本章知识支线

- [支线 8A：URL 中的字符怎样变成参数](side-01-url-inputs.md)：沿空格、加号、百分号、重复参数和片段标识解释编码与解析，并迁移到包含特殊字符的搜索条件。
- [支线 8B：return 之后，谁负责结束 HTTP 响应](side-02-response-ownership.md)：用独立 Nest 应用对照自动、手动、passthrough 与遗漏发送，观察状态、头部和方法完成之间的关系。

如果目前只能凭记忆选择装饰器，先完成这两条支线，再尝试改变输入形式和响应方式。支线时间单列。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| `@Controller`／`@Get`／`@Post` | 组合方法与公开路径 | 方法名字不决定路径；上游边界也必须接受请求 |
| `@Param('id')` | 从匹配结果取得路径字段 | 不校验 UUID，也不因 number 注解自动转数字 |
| `@Query('q')`／`@Query('limit')` | 取得原始查询值 | 缺失、空串、重复值不同；先收窄 unknown |
| simple query parser | 固定查询解析方式 | 重复已知键拒绝；未知键忽略；不展开嵌套对象 |
| `parseListQuery()` | 解释数字文本并映射 q→text | 文本格式与业务数值范围各有责任 |
| `@Body()`／`captureBody` | 分别取得结果、消费流并解析 | 保持一个读取方；赋值完成后才 next |
| `httpResult()`／`HttpException` | 将业务失败映射到已有错误 JSON | 对象响应保持 `{ error }`；未知失败为 500 |
| 普通返回值／Promise | 交给 Nest 发送 JSON | POST 默认 201，普通 GET 默认 200 |
| `@HttpCode()` | 明确覆盖默认成功状态 | 状态应由接口语义决定，不会创建后台任务 |
| `@Res()` | 手动持有响应完成责任 | 只 return 值不会恢复自动发送 |
| `@Res({ passthrough: true })` | 只操作头部，仍由框架发送 body | 不再调用 json／end，避免两个发送方 |
| Map 遍历／includes | 实现字面筛选、顺序与数量限制 | 先筛选再截取；无匹配仍可能全量扫描 |
| `curl -i`／`--data-urlencode` | 同时观察状态头部正文、编码查询 | 含 & 的 URL 要加引号；实际 ID 从响应复制 |

官方查阅：[Nest 11 Controller](https://docs.nestjs.com/v11/controllers)、[Nest 11 内置异常处理](https://docs.nestjs.com/v11/exception-filters)、[Express 5 查询行为变更](https://expressjs.com/en/guide/migrating-5/#req.query)、[Node.js 24 URL 与 URLSearchParams](https://nodejs.org/docs/latest-v24.x/api/url.html)。框架机制对应本章固定版本；业务查询规则与兼容策略由本章代码明确实现。

[上一章：从手写服务走向 Nest](../chapter-07-enter-nest/chapter.md) · [下一章：Provider 与依赖注入](../chapter-09-providers/chapter.md) · [返回第二篇](../README.md) · [返回全书目录](../../README.md)
