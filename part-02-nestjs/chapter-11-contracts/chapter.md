# 第 11 章 建立可信的输入与错误边界

第十章已经明确了记录组件的归属：CapturesModule 负责组装，其他模块通过 CapturesService 使用记录能力。谁可以取得一个组件，和传给它的值是否可靠，是两件事。这一章继续沿创建、列表与详情三个接口，把调用边界补完整。

先看一个具体的联调问题。调用方提交了 `{"originaltext":"Keep this sentence."}`，服务返回 400。前端知道请求失败，却还要从一句英文错误中猜该标红哪个字段。若换成多传一个 id，当前接口会忽略它；这个行为有没有被明确约定？再往后，存储对象增加了内部字段，Controller 直接返回它，会不会不小心把内部数据带到外面？

这些问题不能只靠把参数类型写得更详细解决。我们需要分别确定：接受什么输入，允许哪些输入进入业务，输出承诺哪些字段，以及失败时客户端能依据什么作出判断。等这些规则明确，再决定用什么机制表达和执行它们。

代码从第十章的 `part-02/chapter-10` 继续，完成状态为 `part-02/chapter-11`。仍使用内存存储，不新增数据库、登录、业务冲突规则或新业务接口。本章增加运行时 Schema、显式响应映射、Problem Details 错误响应，以及 `/docs` 和 `/openapi.json` 两个文档入口。成功响应、状态码、Location／Allow、GET 的 ETag 条件响应、查询顺序与原文保存规则延续；**错误响应正文改为新结构**，旧客户端读取 `error` 的代码需要同步修改。

时间参考（估算）：只阅读约 63～73 分钟；跟做另加约 50～60 分钟，合计约 113～133 分钟。首次下载新增依赖另计，附录按需查阅，支线单列。

按正文约 7800 个汉字、约 310 行代码与命令，以及输入迁移、响应与错误改造、文档生成和成功／失败请求对照估算，尚未经过读者实测。

## 11.1 从记录接口收到不合法输入出发，解释 TypeScript 类型与 Zod 运行时校验的区别

### 现有检查到底缺了什么

先沿原来的创建路径走一遍：httpBoundary 先限制查询参数数量；captureBody 限制正文的字节数，严格解码 UTF-8 并解析 JSON，Controller 排除 null、数组和非对象，Service 检查 originalText 是否为非空白字符串、是否超过长度上限，然后才保存。

这套检查已经在工作，不能为了引入新库先说它“不安全”。只有一个字段时，手写条件直观、依赖少。继续使用它也是有效方案。当前真正不够集中的是接口契约：请求结构在 Controller，部分规则在 Service，调用说明另写一份，错误只有文本。前端想知道字段位置、我们想生成接口说明时，都要再解释同一套要求。

先尝试最省事的改法，把 `@Body() body: unknown` 改成 `body: { originalText: string }`。这样 IDE 能补全属性，但 JSON 中的数字不会因此变成字符串，也不会被拒绝。第五章已经用类型断言观察过同一件事：类型用于检查程序写法，外部数据到来时仍需执行检查代码。Nest 的 Body 装饰器负责取得值，参数旁边的 TypeScript 类型没有自动变成校验器。

因此我们需要一份运行时也存在的描述：执行它以后，要么得到符合当前输入约定的值，要么得到具体的失败位置。可以继续写一个返回成功／失败结果的解析函数；也可以选用 Schema 库。这里采用 Zod，是因为同一份描述既能执行检查、推导 TypeScript 类型，也能转换出部分接口文档结构。它仍要增加依赖、执行成本与转换边界；不是只要安装了库，数据就自动可信。

新增依赖，在项目根目录执行：

```bash
nvm use
npm install --save-exact zod@4.6.6 @nestjs/swagger@11.4.7
```

本章后面使用 @nestjs/swagger 提供文档页面；真正的输入检查由 Zod 完成。Nest 其他包仍固定 11.2.5，TypeScript 仍为 5.9.3。package.json 和 package-lock.json 一起保存；已有配套依赖清单时按 `npm ci` 安装即可。

### 从一个字段推导 Schema，不先写整个请求模型

已有约定并不是“接受任意字符串”。原文至少包含一个非空白字符，长度不超过 2000 个 UTF-16 代码单元，而且要保留用户原始空格。于是新增 `src/capture-contract.ts`，先写字段规则和创建请求：

```ts
import { z } from 'zod';

export const OriginalTextSchema = z.string()
  .regex(/\S/, 'originalText must contain a non-whitespace character')
  .refine(text => text.length <= 2000, 'originalText must be at most 2000 code units')
  .describe('Original text; whitespace is preserved. Maximum 2000 UTF-16 code units.');

export const CreateCaptureSchema = z.object({ originalText: OriginalTextSchema });
export type CreateCaptureInput = z.infer<typeof CreateCaptureSchema>;
```

这里的 regex 检查至少存在一个非空白字符，没有修改字符串；refine 执行我们明确写出的长度条件。不能换成 `trim().min(1)` 后直接使用返回值，否则解析时就把原文首尾空格删掉了。校验一个值与规范化一个值可能同时发生，但是否允许修改必须由业务决定。

长度也不能凭 API 名字猜。当前 Zod 4.6.6 的字符串长度检查按 Unicode 码点计算，原项目用的是 JavaScript 的 `text.length`。一个 😀 是两个 UTF-16 代码单元；2000 个这样的字符如果按码点计数可以通过，按原有约定则超限。因此这里直接写出旧约定的判断，而不是把 `.max(2000)` 视为天然等价。16 KiB 的请求体字节上限是另一层限制，不能拿这两个“长度”相互替代。

CreateCaptureInput 由 Schema 推导而来，减少了类型定义与解析描述两处维护。但是，某个变量标成 CreateCaptureInput，不代表它已经执行过 Schema。只有实际调用 parse 或 safeParse，才建立了这次运行中的检查结果。

先用独立调用观察最小行为，不需要启动 Nest：

```bash
npm run build
node --input-type=module <<'JS'
import { CreateCaptureSchema } from './dist/src/capture-contract.js';
for (const value of [
  { originalText: '  Keep my spaces.  ' },
  { originalText: 7 },
  { originaltext: 'A misspelled field.' },
]) {
  const result = CreateCaptureSchema.safeParse(value);
  console.log(result.success ? result.data : result.error.issues.map(issue => issue.path));
}
JS
```

第一项应保留原始空格；后两项失败，位置都是 originalText。safeParse 返回成功／失败结果，让我们在检查位置作决定；parse 遇到不合法值会抛出 ZodError。两者都执行检查，差别是失败交给调用方的形式，不是一个严格、一个宽松。

### 请求结构与业务规则的责任不同

这里出现一个容易疑惑的重复：Service 已经检查原文，为什么入口还要检查？先分清对象不同。入口检查的是一次 HTTP 请求，字段叫 originalText，失败位置要告诉客户端；Service 维护的是记录业务操作，独立程序同样会调用它，不能因为当前 Controller 检查过就放弃自己的约束。

只有这个小规则时，保持两处条件一致的维护成本可以接受，核对空白、长度和原文保留即可。以后规则变复杂，可以抽取共同的规则函数或值对象；不要为了消除几行重复，让业务类反过来依赖 HTTP 请求体。相同约束可以复用，但 HTTP 字段形状和协议错误不应该成为所有业务调用的前提。

Zod 也没有替代 JSON 读取。非法 UTF-8、正文开头的 BOM 或不符合 JSON 语法的文本都不能进入字段检查，应在 readJson 中失败；超过字节上限应尽早停止收集；Content-Type 不合适应在解析前拒绝。Schema 处理的是已经得到的值。把这些失败都归为一个“字段校验失败”，会丢掉调用方判断请求究竟坏在哪一层所需的信息。

## 11.2 为现有记录定义请求和公开响应，明确哪些字段可由用户修改

### 多传字段时，选拒绝还是忽略

现在向创建请求添加 `id: 'client-id'`。我们有三个合理选项：拒绝未知字段、接收但移除未知字段、接收并保留未知字段。它们分别适合希望尽早发现拼写错误、需要兼容调用方额外数据、明确接受可扩展内容的场景，没有一种能脱离契约被称为普遍正确。

前文接口只取 originalText，其余字段都被忽略。本章保留这一行为，使用 Zod 默认的 object：解析结果只留下声明的字段。若改为 strictObject，会让之前成功的“合法原文加额外字段”变成 400；这是收紧契约，需要明确迁移，不能只作为代码风格调整。

关键在于**使用解析结果**。假如只检查 `safeParse(body).success`，随后仍把原始 body 展开交给业务，多余字段还在原始对象里。解析成功证明的是 result.data 满足描述，不是说原始对象被原地清洗了。

新增 `src/input-validation.ts`，将请求解析失败转成我们自己的输入错误：

```ts
import { z } from 'zod';
import { HttpError } from './http.js';

export function parseInput<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issues = result.error.issues.map(issue => ({
      path: issue.path.map(part => typeof part === 'number' ? part : String(part)),
      message: issue.message,
    }));
    throw new HttpError(400, 'Request validation failed', 'VALIDATION_ERROR', issues);
  }
  return result.data;
}
```

HttpError 在下一节增加 code 与 issues 参数。这里把问题位置转换成字符串／数字数组，并只带出位置与提示，不把完整请求值或库的内部错误对象交给客户端。调用方可用 `['originalText']` 标记字段，用 `['items', 2, 'name']` 表示数组项；空数组表示整个输入。message 用于阅读，程序分支依据后面约定的稳定 code，不依赖 Zod 当前版本的英文措辞。

接入 Controller 时，原来的对象判断和字段提取替换为：

```ts
const input = parseInput(CreateCaptureSchema, body);
const capture = await this.captures.create(input.originalText);
```

id 与 createdAt 不在输入 Schema 中，也没有传给 Service，由服务端继续生成。未知字段被忽略不意味着允许客户端修改这些字段。反过来，即使把一个 userId 写进 Schema 并通过字符串检查，也没有证明调用者可以访问那个用户的数据；权限判断将在身份篇建立。

### 查询参数先检查表示，再转换数值

第八章已经区分了 URL 中的字符串与业务需要的整数。本章保持那套约定：q 与 limit 至多出现一次，q 是非空白的字面子串，limit 是 1～100 的十进制文本，不接收空格、正号、前导零或指数形式。没有 limit 时仍返回全部匹配记录。

在 `src/capture-contract.ts` 增加：

```ts
export const ListQuerySchema = z.object({
  q: z.string().regex(/\S/, 'q must contain a non-whitespace character')
    .refine(text => text.length <= 200, 'q must be at most 200 code units')
    .describe('Literal, case-sensitive substring; maximum 200 UTF-16 code units.').optional(),
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/)
    .describe('One decimal integer from 1 to 100; no signs, spaces or leading zeros.').optional(),
});
```

再修改 `src/capture-query.ts`：

```ts
import type { CaptureListOptions } from './capture.js';
import { ListQuerySchema } from './capture-contract.js';
import { parseInput } from './input-validation.js';

export function parseListQuery(q: unknown, limit: unknown): CaptureListOptions {
  const parsed = parseInput(ListQuerySchema, { q, limit });
  return {
    text: parsed.q,
    limit: parsed.limit === undefined ? undefined : Number(parsed.limit),
  };
}
```

为什么不直接写 `z.coerce.number()`？因为它使用数值转换，而我们还要约束请求中允许的写法。空字符串可能被转成 0，`1e1` 被转成 10；转换成功并不代表表示符合接口约定。先对字符串使用完整正则，再 Number，转换才能承接已成立的条件。

重复查询键会由当前 Express simple 查询解析器形成数组。Schema 要求字符串，所以数组被拒绝；未知查询键继续忽略，因为 Controller 只提取 q 与 limit。`q[]=x` 在当前解析器中是另一个键，不会自动成为 q。这些行为来自“解析器怎样表示输入”与“Schema 接受什么”的组合，不能仅凭最终业务类型为 string 就推导。

这里继续依赖第八章建立的查询数量边界：非空查询串按 `&` 分隔后最多 1000 项，未知键与空片段也计数，超过上限由 httpBoundary 返回 400。本章给这条失败增加 QUERY_TOO_LARGE 错误码。这个检查发生在 Express 解析之前，否则 simple 解析器只保留前 1000 项，排在后面的重复 q 或 limit 可能消失，Schema 根本看不到完整输入。未知键忽略只是业务字段策略，不表示它们可以绕过整个请求的数量限制；详情与 POST 上携带的查询串也接受同一检查。

### 返回类型不会帮我们删除内部字段

输入已有明确字段，再看输出。当前 Capture 只有 id、originalText、createdAt，直接 return 看起来没有问题。若以后内部对象增加 internalNote，函数返回类型即使仍标成原来的公开类型，JavaScript 对象也可能带着多余字段。类型检查不是序列化投影。

我们先决定对外承诺这三个字段，再在 `src/capture-contract.ts` 增加响应描述和映射函数：

```ts
import type { Capture } from './capture.js';

export const CaptureResponseSchema = z.object({
  id: z.uuid(),
  originalText: OriginalTextSchema,
  createdAt: z.iso.datetime(),
});
export const CaptureListResponseSchema = z.object({
  items: z.array(CaptureResponseSchema),
});
export type CaptureResponse = z.infer<typeof CaptureResponseSchema>;

export function toCaptureResponse(capture: Capture): CaptureResponse {
  return CaptureResponseSchema.parse({
    id: capture.id,
    originalText: capture.originalText,
    createdAt: capture.createdAt,
  });
}
```

显式构造新对象让字段去向一目了然。再执行响应 Schema，能发现内部实现没有兑现公开承诺，例如 createdAt 变成无法使用的字符串。只生成类型不会发现这种运行时偏差；只删除几个已知内部字段，也容易漏掉后续新增字段。

这次 parse 失败属于服务端错误，不能告诉客户端“你的请求不合法”。因此只在 parseInput 中把失败标成输入错误；不能在最外层把所有 ZodError 都映射为 400。写入结果、第三方返回值和外部请求都可能用 Zod 检查，但责任方不同。

完整的 `src/captures.controller.ts` 如下。三个入口都明确等待业务结果，再映射公开响应；错误仍在入口附近转换：

```ts
import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CapturesService } from './captures.service.js';
import { parseListQuery } from './capture-query.js';
import { httpResult } from './http.js';
import { CreateCaptureSchema, toCaptureResponse } from './capture-contract.js';
import { parseInput } from './input-validation.js';

@Controller('captures')
export class CapturesController {
  constructor(private readonly captures: CapturesService) {}

  @Get()
  list(
    @Query('q') q: unknown,
    @Query('limit') limit: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return httpResult(async () => ({
      items: (await this.captures.list(parseListQuery(q, limit))).map(toCaptureResponse),
    }), response);
  }

  @Post()
  create(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return httpResult(async () => {
      const input = parseInput(CreateCaptureSchema, body);
      const capture = await this.captures.create(input.originalText);
      const result = toCaptureResponse(capture);
      response.setHeader('Location', `/captures/${capture.id}`);
      return result;
    }, response);
  }

  @Get(':id')
  detail(@Param('id') id: string, @Res({ passthrough: true }) response: Response) {
    return httpResult(async () => toCaptureResponse(await this.captures.find(id)), response);
  }
}
```

response 的 passthrough 保留 Nest 自动发送成功值，只让我们设置 Location 或错误的媒体类型；第八章的响应责任没有改变。创建时先完成响应映射，再设置 Location，避免一个无法形成正常公开结果的操作先留下成功响应头。

等下一节的错误映射接好并重新构建后，运行 `node examples/response-boundary.mjs`，可以看到公开对象只有三个键；把 createdAt 故意改成非法值后，错误会归为 500，同时已保存的记录仍为一条。响应校验发生在写入之后，不能回滚已经发生的业务动作。客户端遇到 500 不能据此断言“服务端一定没保存”，更不能无条件重复 POST；可靠重试需要后续的幂等机制。

## 11.3 校验失败、业务冲突、权限错误与系统故障的错误契约；权限类型先说明含义，身份篇再落地

### 从客户端要采取的动作决定错误信息

原来的 `{ "error": "..." }` 便于人阅读，但客户端若用英文字符串做判断，修改措辞或升级校验库就可能破坏分支。只看 400 也不够：JSON 语法坏了与 originalText 缺失，修正位置并不相同。

我们先确定需要区分的动作。字段错误要让调用方修改输入；记录不存在要让它停止展示这条记录；系统故障应给出可控提示并保留诊断线索。响应不应直接包含异常堆栈、SQL、内部路径或依赖凭据。于是除了 HTTP 状态，我们还需要稳定的应用错误码，输入错误还可以带字段位置。

可以在旧结构旁增加 code 和 issues，这样旧客户端仍能读 error。另一种选择是采用已有的 Problem Details 格式。本章选择后者，让基础字段采用明确的通用含义，同时把 code 与 issues 作为本项目扩展；这是一次有意的错误契约升级。若已有必须持续服务的旧客户端，可以先保留 error 作为过渡字段，或者安排版本迁移，不能静默删掉它后要求调用方自己发现。

一份缺少 originalText 的响应将具有这样的结构，具体字段提示不作为固定措辞：

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "detail": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "issues": [
    { "path": ["originalText"], "message": "Invalid input: expected string, received undefined" }
  ]
}
```

HTTP 状态行仍为 400，Content-Type 改为 `application/problem+json`。status 是正文中的状态信息，不应与状态行冲突；客户端仍以实际 HTTP 状态为基础。title 是状态的简短说明，detail 说明这一次失败，code 才承担应用内稳定分类。type 使用标准的 about:blank，表示这里未为每种业务错误定义单独的问题类型 URI；不要把它当成我们已经发布了一套问题说明网站。

issues 是本项目约定，不是每个 Problem Details 服务都会返回的标准字段。客户端应允许没有 issues，也应允许未来出现未知 code，退回通用提示，而不是遇到新错误码就崩溃。我们暂不增加 instance 或请求追踪 ID，后面建立请求关联时再明确它们的来源与用途。

### 先完成一处明确映射，再接到不同失败位置

扩展 `src/http.ts` 中的 HttpError：

```ts
export class HttpError extends Error {
  readonly statusCode: number;

  constructor(
    statusCode: number,
    message: string,
    readonly code = `HTTP_${statusCode}`,
    readonly issues?: Array<{ path: Array<string | number>; message: string }>,
  ) {
    super(message);
    this.statusCode = statusCode;
  }
}
```

它表达已确认可以公开的协议错误。普通 Error 不能因为 message 看起来很友好就直接公开。保持业务错误类型独立，在 HTTP 边界映射为公开结果：

```ts
import { STATUS_CODES } from 'node:http';

export type Problem = {
  type: string;
  title: string;
  status: number;
  detail: string;
  code: string;
  issues?: Array<{ path: Array<string | number>; message: string }>;
};

export function httpFailure(error: unknown): {
  statusCode: number;
  body: Problem;
} {
  const statusCode = error instanceof HttpError ? error.statusCode
    : error instanceof InvalidCaptureError ? 400
    : error instanceof CaptureNotFoundError ? 404 : 500;
  if (statusCode === 500) console.error('Unhandled request failure:', error instanceof Error ? error.name : 'UnknownError');
  const code = statusCode === 500 ? 'INTERNAL_ERROR'
    : error instanceof InvalidCaptureError ? 'INVALID_CAPTURE'
    : error instanceof CaptureNotFoundError ? 'CAPTURE_NOT_FOUND'
    : error instanceof HttpError ? error.code : 'INTERNAL_ERROR';
  return {
    statusCode,
    body: {
      type: 'about:blank',
      title: STATUS_CODES[statusCode] ?? 'Error',
      status: statusCode,
      detail: statusCode === 500 ? 'Internal server error' : errorMessage(error),
      code,
      ...(error instanceof HttpError && error.issues ? { issues: error.issues } : {}),
    },
  };
}
```

InvalidCaptureError 对应业务输入不成立；CaptureNotFoundError 对应不存在；其余未识别异常统一为 500，公开正文不使用原始 message。普通存储错误不能自动归为 409，因为程序失败不等于发现了可由调用方解决的业务冲突。输出 Schema 的 ZodError 也走未知故障路径，所以不会误报成输入失败。

本章保留了现有 console 错误记录位置，用于开发时定位内部异常；第十三章会统一日志和请求关联。对外正文与内部诊断不能混成一份对象，后续记录日志时也要继续约束秘密和原始请求数据的进入范围。

然后修改 httpResult，让 Controller 使用 Nest 的异常响应，同时明确媒体类型：

```ts
export async function httpResult<T>(
  action: () => T | Promise<T>,
  response: ServerResponse,
): Promise<T> {
  try {
    return await action();
  } catch (error: unknown) {
    const failure = httpFailure(error);
    response.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
    throw new HttpException(failure.body, failure.statusCode);
  }
}
```

这里仍然使用 `return await action()`，把异步失败留在这个 try／catch 的范围内。只返回 Promise 却不等待，会让后续拒绝绕过这段转换。没有给正常响应套额外外壳，返回值仍由 Nest 发送；传入 response 只用于发生错误时设置头部。

readJson 和 captureBody 发生在 Controller 之前，它们用的是 respond，不能指望 Controller 的 try／catch 捕获。将 respond 的 catch 中发送部分改为：

```ts
const failure = httpFailure(error);
sendJson(response, failure.statusCode, failure.body, {
  'Content-Type': 'application/problem+json; charset=utf-8',
  Connection: 'close',
});
```

原来检查 response 已销毁或结束的条件保留。sendJson 的默认 JSON 头可以被这里显式传入的头覆盖，因此发送的是相同的 Problem 结构与正确媒体类型。两条处理路径调用同一个错误映射函数，避免字节读取错误和 Controller 错误各长成一种格式。

为读取与路径判断的错误增加明确 code，修改对应 new HttpError 调用的第三个参数：

| 失败位置 | 状态与 code | 客户端应理解什么 |
| --- | --- | --- |
| readJson：严格 UTF-8 解码或 JSON.parse 失败 | 400／INVALID_JSON | 非法编码、BOM 或 JSON 语法错误，尚未进入字段检查 |
| readJson：请求流读取失败 | 400／BODY_READ_FAILED | 正文没有完整取得 |
| readJson：超过字节上限 | 413／BODY_TOO_LARGE | 缩小整个正文，字段长度不是唯一原因 |
| captureBody：媒体类型不符 | 415／UNSUPPORTED_MEDIA_TYPE | 使用本接口接受的请求表示 |
| httpBoundary：URL 不合法 | 400／INVALID_URL | 请求地址无法按约定解释 |
| httpBoundary：查询串超过 1000 项 | 400／QUERY_TOO_LARGE | 缩小查询串；未知键与空片段也占用数量 |
| httpBoundary：未匹配路径 | 404／ROUTE_NOT_FOUND | 这个业务路由不存在 |
| httpBoundary：方法不支持 | 405／METHOD_NOT_ALLOWED | 查看 Allow，不能任意换方法 |
| 详情不存在或保留的编码边界 | 404／CAPTURE_NOT_FOUND | 没有可返回的记录 |

`src/http-boundary.ts` 在 URL 构造成功后、路由判断前的数量检查保留原位置，只补上错误码：

```ts
const queryParts = url.search === '' ? 0 : url.search.slice(1).split('&').length;
if (queryParts > 1000) {
  throw new HttpError(400, 'Query string must contain at most 1000 parameters', 'QUERY_TOO_LARGE');
}
```

readJson 保留严格解码，并将这两种解析失败归到同一公开错误码。`src/http.ts` 中 end 处理函数里的 try／catch 为：

```ts
try {
  const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
    .decode(Buffer.concat(chunks));
  resolve(JSON.parse(text));
} catch {
  reject(new HttpError(400, 'Request body must be valid UTF-8 JSON', 'INVALID_JSON'));
}
```

fatal 拒绝非法字节，不把它们替换成另一个合法字符；ignoreBOM 保留开头的 BOM 字符，随后由 JSON.parse 拒绝，维持当前不接受 BOM 的契约。即使字段 Schema 可以接受替换后的字符串，也不能据此更改用户提交的原文字节所表达的内容。

例如 captureBody 中现在是：

```ts
throw new HttpError(415, 'Content-Type must be application/json', 'UNSUPPORTED_MEDIA_TYPE');
```

方法不支持的分支不再单独发送旧的 error 对象。保留 Allow，然后交给同一错误路径：

```ts
if (!allowed.includes(request.method)) {
  response.setHeader('Allow', allowed.join(', '));
  throw new HttpError(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}
```

查询数量检查通过后，当前业务路径的 HEAD 仍返回 405 和 Allow，但响应没有正文；不能因为采用 Problem Details 就要求所有错误一定有可解析的 JSON。客户端也可能收到代理生成的 HTML 错误，或者在根本没有响应时遭遇网络异常。因此读取错误正文时要容许解析失败，保留 HTTP 状态与通用提示；fetch 收到 400／500 通常仍正常返回 Response，它们和网络异常的判断分支不同。

### 什么时候才是 409、401 或 403

当前记录允许重复原文，每次 POST 都生成新 ID，所以“这段原文已经出现过”现在不是冲突。只有业务真正规定了互斥条件，例如后续某个版本只能被采纳一次，才需要在条件不满足时表达业务冲突。一个请求结构正确、字段值也合法，仍可能因为当前资源状态而无法执行；409 描述的正是这类需结合状态理解的问题，不是字段 Schema 的另一种写法。

同样，401 与 403 不能靠检查 userId 是否是字符串实现。401 表达缺少有效认证凭据，并涉及相应的认证挑战；403 表达服务器拒绝执行这个请求。身份与资源授权建立后，要根据所选认证方式、调用者及资源条件决定响应。某些场景会用 404 隐藏资源是否存在，也必须是明确策略，而不是捕获异常时随机改状态。

本章不增加虚构的 ConflictError、登录 Guard 或测试账号来凑齐状态码。先建立分类依据，等真实的业务约束、身份与权限落地，再在同一错误契约中增加具体错误码。Schema 能回答输入是否符合描述，不能替我们判断并发状态与权限。

## 11.4 生成并使用现有接口的 OpenAPI／Swagger 文档，观察调用方如何定位字段和错误

### 文档要描述什么，哪些内容不能从类型里猜

现在的接口已有清楚的运行时边界，但调用方还需要找到方法、路径、请求表示、成功结果与失败结果。OpenAPI 用一个可交换的文档描述这些约定；Swagger UI 将文档呈现为可浏览、可发请求的页面。页面本身不参与 Service 的业务判断，也不会让未校验的请求突然安全。

可以手写整个 OpenAPI 文档；也可以用装饰器描述每个 DTO 和响应，让 Nest 扫描生成。本章已经选择 Zod 表达字段，若再手写一套 class-validator 或 Swagger DTO，就重新引入两份字段规则。我们采用折中：**字段结构从 Zod 转换，方法、路径、状态和头部由明确的文档代码组装**。

这意味着并非所有内容都“自动同步”。路径和响应状态修改以后，仍须同步文档；一些 JavaScript 条件也无法无损转换成 JSON Schema。把自动生成的范围说清楚，比只看到 Swagger 页面出现就认为接口描述完整更重要。

在 `src/capture-contract.ts` 增加 Problem 的 Schema，用于描述现有错误结果，而不是把每个 Error 对象直接序列化：

```ts
export const ProblemSchema = z.object({
  type: z.literal('about:blank'),
  title: z.string(),
  status: z.number().int().min(400).max(599),
  detail: z.string(),
  code: z.string(),
  issues: z.array(z.object({
    path: z.array(z.union([z.string(), z.number().int()])),
    message: z.string(),
  })).optional(),
});
```

新增 `src/openapi.ts`。开头导入各 Schema，并准备三个小的组装函数：

```ts
import { z } from 'zod';
import type { OpenAPIObject, SchemaObject, ResponseObject, ParameterObject } from '@nestjs/swagger';
import {
  CreateCaptureSchema, ListQuerySchema, CaptureResponseSchema,
  CaptureListResponseSchema, ProblemSchema,
} from './capture-contract.js';

function schema(value: z.ZodType, io: 'input' | 'output'): SchemaObject {
  return z.toJSONSchema(value, { target: 'openapi-3.0', io }) as SchemaObject;
}
function jsonResponse(name: string, description: string): ResponseObject {
  return { description, content: {
    'application/json': { schema: { $ref: `#/components/schemas/${name}` } },
  } };
}
function problem(description: string): ResponseObject {
  return { description, content: {
    'application/problem+json': { schema: { $ref: '#/components/schemas/Problem' } },
  } };
}
```

这里选择 OpenAPI 3.0 的 Schema 表达，输入用 io 为 input，响应用 output。创建请求默认移除额外字段，所以输入描述允许额外属性；输出只包含公开字段，输出描述可以封闭属性范围。把同一份对象 Schema 的输出描述误当成请求描述，会让文档声称“额外字段不允许”，实际接口却接受它。

转换函数返回的 JSON 描述在这个固定目标下按 SchemaObject 使用，类型断言并没有执行校验。转换之后仍要核对内容，特别是原文的 UTF-16 长度条件：refine 中的 JavaScript 函数不会变成等价的标准 maxLength。本文用 description 明确这个限制，服务端继续执行原有检查。不能为了让文档生成漂亮，就删掉运行时约束或把无法表达的规则悄悄改成允许任意值。

`createOpenApiDocument()` 返回 OpenAPI 3.0.3 文档；字段组件集中在 components.schemas：

```ts
components: { schemas: {
  CreateCapture: schema(CreateCaptureSchema, 'input'),
  Capture: schema(CaptureResponseSchema, 'output'),
  CaptureList: schema(CaptureListResponseSchema, 'output'),
  Problem: schema(ProblemSchema, 'output'),
} },
```

各操作通过 `$ref` 引用这些组件，避免每个响应再复制一遍字段。下面是 POST /captures 的实际描述，位于 paths 的 `/captures` 下：

```ts
post: {
  operationId: 'createCapture', summary: 'Create a capture',
  description: 'Only originalText is used. Extra properties, including id and createdAt, are ignored. Body limit: 16 KiB of bytes. Requires valid UTF-8 JSON without a BOM. URL query limit: 1000 ampersand-separated parts.',
  requestBody: { required: true, content: { 'application/json': {
    schema: { $ref: '#/components/schemas/CreateCapture' },
    example: { originalText: 'I want to explain this clearly.' },
  } } },
  responses: {
    '201': { ...jsonResponse('Capture', 'Saved record'), headers: {
      Location: { description: 'Relative URL of the new record', schema: { type: 'string' } },
    } },
    '400': problem('Malformed UTF-8/JSON or invalid input/query; code INVALID_JSON, VALIDATION_ERROR or QUERY_TOO_LARGE'),
    '413': problem('Body exceeds 16 KiB; code BODY_TOO_LARGE'),
    '415': problem('Expected application/json; code UNSUPPORTED_MEDIA_TYPE'),
    '500': problem('Unexpected failure; code INTERNAL_ERROR'),
  },
},
```

GET /captures 的 q 与 limit 参数从 ListQuerySchema 对应字段取得描述，200 引用 CaptureList，400 和 500 引用 Problem；GET /captures/{id} 把 id 声明为必需路径参数，200 引用 Capture，400、404 和 500 引用 Problem。两个 GET 和 POST 都可能在 httpBoundary 遇到 QUERY_TOO_LARGE，不能因为详情没有业务查询参数，就把这条 400 从文档中漏掉。id 描述为字符串，不额外加入 UUID 请求校验，因此查询一个陌生字符串仍保持 404，而不会偷偷变为 400。

两个 GET 还要描述已有的条件响应：可选请求头 If-None-Match，200 响应头 ETag，以及不含 content 的 304 响应和它的 ETag。在 `src/openapi.ts` 的三个辅助函数后定义可复用的描述：

```ts
const etagHeaders = {
  ETag: { description: 'Validator for this representation; send back with If-None-Match.', schema: { type: 'string' as const } },
};
const ifNoneMatch: ParameterObject = {
  name: 'If-None-Match', in: 'header', required: false, schema: { type: 'string' },
  description: 'A matching ETag, or *, can produce 304 without a body. Use a stored response for that URL; omit this header if no cached response is available.',
};
const notModified: ResponseObject = {
  description: 'Not modified. No response body; reuse the cached representation.',
  headers: etagHeaders,
};
```

两个 GET 的 parameters 中加入 ifNoneMatch，200 响应增加 `headers: etagHeaders`，responses 增加 `'304': notModified`。第八章[支线 8B](../chapter-08-controllers/side-02-response-ownership.md)已说明，匹配当前表示的条件请求可以返回 304，实际响应没有正文，也没有 JSON Content-Type。这里不能给 304 复用 jsonResponse 或 Problem，否则文档会承诺一个并不存在的 JSON 正文。调用方只有保存了对应表示，才能用它解释“未修改”；没有本地内容却只保存了标签时，应去掉条件头重新获取，而不是对 304 调用 JSON 解析。

列表描述还要保留插入顺序、先筛选再截取、缺少 limit 返回全部、重复查询键拒绝、未知键忽略和整个查询串最多 1000 项。字段类型无法自动推出这些语义。查询数量检查通过后，业务路径的未支持方法返回 405 和 Allow，未知路径返回 404；文档不需要为每个错误方法发明一个可调用操作，但调用说明必须保留这条约定。

完整路径声明在配套 `src/openapi.ts` 中。用以下脚本导出一份可以单独查看的文档，新增 `scripts/export-openapi.mjs`：

```js
import { writeFile } from 'node:fs/promises';
import { createOpenApiDocument } from '../dist/src/openapi.js';

await writeFile(new URL('../dist/openapi.json', import.meta.url),
  JSON.stringify(createOpenApiDocument(), null, 2) + '\n');
console.log('Wrote dist/openapi.json');
```

```bash
npm run build
node scripts/export-openapi.mjs
```

打开 dist/openapi.json，先查 CreateCapture 的 required，应该只有 originalText；再查 Capture 的字段，应该只有三个公开字段；最后看 POST 的 201 是否描述了 Location，400 是否使用 application/problem+json；两个 GET 是否包含 If-None-Match、ETag 和没有 content 的 304，详情是否也列出了 QUERY_TOO_LARGE 对应的 400。这样能在页面接入之前先检查文档究竟承诺了什么。

### 把文档接入应用，再用它发出真实请求

文档页面也是应用入口。开发需要 Try it out，生产不应仅因安装了 Swagger 就自动开放它。先新增 `src/http-options.ts`，把模式与显式开关在创建应用前验证：

```ts
export function readHttpOptions(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.NODE_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(mode)) {
    throw new Error('NODE_ENV must be development, test or production');
  }
  const rawDocs = env.DOCS_ENABLED;
  if (rawDocs !== undefined && rawDocs !== 'true' && rawDocs !== 'false') {
    throw new Error('DOCS_ENABLED must be true or false');
  }
  return { docsEnabled: rawDocs === undefined ? mode === 'development' : rawDocs === 'true' };
}
```

development 默认开放，test/production 默认关闭。显式 `DOCS_ENABLED=true` 或 `false` 覆盖默认值，其他字符串立即失败；不能把字符串 "false" 当作 truthy 值转换。npm 脚本已经指定 NODE_ENV，直接调用 Node 时也要明确模式。开发的 `.env` 可以设置开关，修改后重新启动；生产由目标环境注入，不读取本机开发文件。

修改 `src/app.ts`：

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { captureBody } from './capture-body.js';
import { httpBoundary } from './http-boundary.js';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi.js';
import { readHttpOptions } from './http-options.js';

export async function createApp(): Promise<NestExpressApplication> {
  const { docsEnabled } = readHttpOptions();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    abortOnError: false,
  });
  app.set('query parser', 'simple');
  if (docsEnabled) {
    SwaggerModule.setup('docs', app, createOpenApiDocument(), {
      jsonDocumentUrl: 'openapi.json', raw: ['json'],
      swaggerOptions: { validatorUrl: null },
    });
  }
  app.use(httpBoundary);
  app.use(captureBody);
  return app;
}
```

日常保持 `npm run dev`，访问 `/docs` 与 `/openapi.json`。要核对生产行为，在另一终端执行 `npm run check`，再用 `PORT=3001 npm start` 运行产物。Postman 的产物集合指向 3001：两个文档路径应为 404，正常业务接口仍能响应。显式设置 `DOCS_ENABLED=true PORT=3001 npm start` 后才开放文档；开启文档本身不提供身份校验，是否允许外部访问需要单独决定。验证时先结束同端口的旧进程，避免误判配置没有生效。静态 OpenAPI 导出不依赖 HTTP 文档开关，关闭页面仍可导出契约供内部使用。

文档路由在现有 httpBoundary 之前注册。第八章的边界只接受记录路径，若先让它拦截所有请求，/docs 和文档静态资源会被判为未知路由。这里为文档保留明确的注册位置，没有让所有陌生路径绕过业务边界；访问 /docs-unrelated 仍应失败。

这条顺序来自我们现有 Express 接入方式，下一章再系统追踪 Nest 请求过程。现在不需要为了显示文档就引入全局过滤器或自定义 Pipe。

完成文档导出后运行默认开发入口 `npm run dev`，打开 `http://127.0.0.1:3000/docs`。Swagger UI 资源由依赖包提供；页面请求当前服务，示例禁用了外部 validator。先展开 POST /captures，查看 originalText 的说明，再用 Try it out 提交带首尾空格的原文。执行会真正创建记录，多点一次就多一条，不是文档页中的虚拟演示。

核对状态 201、Location 和返回字段，然后把 originalText 改成数字，再执行。应得到 400，code 为 VALIDATION_ERROR，issues 中出现 originalText 的位置。最后通过 GET 列表确认失败请求没有产生记录。若浏览器预先阻止了某种输入，用下面的 curl 检查服务端；浏览器控件不是接口可信边界。

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":7}'
curl -i 'http://127.0.0.1:3000/captures?limit=01'
curl -i http://127.0.0.1:3000/captures/missing
curl -i -X DELETE http://127.0.0.1:3000/captures
curl -s http://127.0.0.1:3000/openapi.json
```

依次观察字段错误、表示错误、记录不存在、方法不支持与机器可读文档。不要只核对 HTTP 状态，还要看媒体类型、code、字段位置和 Allow 是否与语义一致。当前文档页用于本机实践；它没有为服务增加认证与权限，后面部署时还须决定文档访问范围。

## 11.5 此章先在入口直接校验并返回明确错误；下一章再用 Nest 请求机制统一接入

现在沿一次创建请求，可以明确说出每一步完成了什么：先判断路径与方法，再确认媒体类型并限制、解析正文；Controller 使用 Schema 得到允许的输入，调用 Service；Service 再维护业务规则，等待存储；Controller 将结果投影为公开响应，设置成功头部。每一步的失败都有对应的责任位置，不能拿最后一份 TypeScript 类型概括整条链。

这一章刻意保留 Controller 中的 parseInput、httpResult 和响应映射调用。规则刚建立时，明确写在调用位置便于看出先后关系；如果马上换成多个装饰器和全局机制，容易把“规则是什么”与“框架在什么时候执行规则”混成同一个问题。下一章会在这些行为已经明确后，处理重复调用与统一接入。

换几个条件，检查是否知道该改哪里。若未知请求字段必须立即报错，应收紧请求对象 Schema，同时更新客户端兼容策略与文档；不能去改存储。如果响应要增加一个允许公开的字段，需要同时决定数据来源、显式映射和输出 Schema，不能仅修改返回类型。若 limit 需要接受新的表示，应先改变输入表示规则，再核对转换与文档；不是直接放宽 Number 的使用。

另一个条件是未来记录规则改变。若原文允许 4000 个代码单元，HTTP Schema、Service 约束与文档说明要一起核对，同时检查请求体字节上限是否仍能容纳目标输入。16 KiB 并不等于 4000 个任意字符。这种跨层一致性需要实际输入来确认，不能因为代码里搜索到所有 2000 都已替换就认为完成。

本章的兼容边界也需要准确交代。合法请求仍产生同样的成功字段，原文空格、严格 UTF-8 JSON 读取、UTF-16 长度、未知字段忽略、1000 项查询数量上限、查询顺序、默认全量行为与状态码继续保持。GET 的条件响应仍可能是无正文的 304，不能把所有成功读取都理解为返回 JSON。错误正文不再有 error 字段，媒体类型也改变；客户端应改为读取 Problem 的 detail／code／issues，并容许未知错误。没有数据库迁移或旧数据回填，内存寿命也没有改变。

只检查能否成功创建记录还不够。能够解释错误来自哪一层、为什么输入失败与输出失败要走不同状态、哪些文档内容无法自动生成，才有依据在新字段或新入口出现时继续维护这个边界。

本章完成代码状态：`part-02/chapter-11`。

## 本章知识支线

- [支线 11A：Schema 的输入、输出与转换边界](side-01-schema-boundaries.md)：用缺失／null／空串、未知字段、数值转换、Unicode 长度与文档生成，解释“解析成功”究竟保证了什么。

- [支线 11B：用接口工具和断点追完一次失败请求](side-02-request-debugging.md)：使用 Swagger、Network、Postman 与 curl 固定请求，分别定位两类 400，再观察一次已写入但输出失败的 500。

两条支线分别补足输入表示与实际排错方法，操作与时间单列。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| unknown | 标记尚未核对的外部值 | 类型断言不会执行检查 |
| z.object／strictObject／looseObject | 决定额外字段的处理 | 移除、拒绝与保留是不同契约 |
| safeParse／parse | 执行运行时描述 | 应使用返回的数据；失败归属取决于检查位置 |
| regex／refine | 约束表示与已有长度规则 | 不默认转换输入；任意函数无法完整成为 JSON Schema |
| z.infer／input／output | 从 Schema 取得静态类型 | 类型不证明某次解析已经执行 |
| 显式响应映射 | 限定公开字段 | 返回类型不是运行时字段删除器 |
| TextDecoder 的 fatal／ignoreBOM | 保留严格 UTF-8 JSON 读取契约 | 非法字节不替换，BOM 保留后由 JSON.parse 拒绝 |
| 查询数量边界 | 在解析前拒绝超过 1000 项的查询串 | 未知键和空片段计数，避免解析器静默截断 |
| ETag／If-None-Match／304 | 描述已有 GET 条件响应 | 304 无 JSON 正文，需结合调用方保存的表示 |
| Problem Details | 组织错误基础字段 | application/problem+json；状态行与正文状态一致 |
| code／issues | 本项目错误分类与字段定位 | 扩展字段，不是标准保证；不依赖英文 message 分支 |
| HttpException／httpResult／respond | 在两种调用位置转换失败 | Controller 之前的读取失败不进入 Controller 的 catch |
| z.toJSONSchema | 生成可表达的字段描述 | 区分 input／output 和目标规范；补充无法转换的约束 |
| OpenAPI／SwaggerModule.setup | 描述接口并提供调用页面 | 文档不执行校验；Try it out 会产生真实业务操作 |
| export-openapi.mjs | 从构建产物生成文档 | 构建后运行，不依赖监听端口 |

官方查阅：[Zod Schema API](https://zod.dev/api)、[Zod JSON Schema 转换](https://zod.dev/json-schema)、[Nest 11 OpenAPI](https://docs.nestjs.com/v11/openapi/introduction)、[OpenAPI 3.0.3](https://spec.openapis.org/oas/v3.0.3.html)、[RFC 9457 Problem Details](https://www.rfc-editor.org/rfc/rfc9457.html)、[RFC 9110 HTTP 状态语义](https://www.rfc-editor.org/rfc/rfc9110.html)。本章代码固定 Zod 4.6.6、@nestjs/swagger 11.4.7；通用文档的新版本功能不自动成为当前项目行为。

[上一章：Module 建立清楚的业务边界](../chapter-10-modules/chapter.md) · [下一章：请求经过 Nest 时发生了什么](../chapter-12-request-pipeline/chapter.md) · [返回第二篇](../README.md) · [返回全书目录](../../README.md)
