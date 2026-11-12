# 第 21 章 让记录接口读写已有的 PostgreSQL 数据

第二十章结束时，PostgreSQL 里有原来的两条记录，有能从空库重放的结构历史，也有生成好的 Prisma Client。Nest 却仍然在使用 Map。这不是再建一套项目的理由：第十章留下的 `CaptureStore`，现在应该真正承担存储替换的边界。

本章检出 `part-03/chapter-21`，下一章检出 `part-03/chapter-22`；两份快照沿用同一套数据库读写实现。样例已经把数据库连接、故障分类和关闭钩子接好，两章使用同一批记录。若从前章手写，先按下节配置运行时，再从这份配套代码取连接所需文件，然后自己实现存储切换。下面首先验证一个没有通过 API 创建过的旧 ID，最后创建一条含特殊字符的新记录，供下章在重启后核对。

阅读约 70～85 分钟，接线、查询与写入核对另加约 35～45 分钟。

日常操作继续以 Postman、VS Code 调试器和 DBeaver 为主。它们分别观察请求、程序状态和数据库事实；三处证据能对应起来，才有依据判断问题在哪一层。固定开发用户仍是 `10000000-0000-4000-8000-000000000001`，它是数据库行的归属，不代表请求已经完成身份认证。

## 21.1 为旧记录接上存储适配器

### 替换的是存储能力，新增的是资源责任

先打开 `src/capture-store.ts`。Service 使用的仍是三个异步方法：`insert(capture)`、`list(options)`、`find(id)`。这三个方法描述业务需要的能力，并不要求调用者知道 SQL、Prisma 或连接密码。

最直接的接法是在 Controller 中新建 PrismaClient，然后把查询结果返回。问题不在于这段代码短，而在于它把请求协议、数据库字段、资源创建放进同一个变化点：换一次连接策略要改 Controller，新增一个调用入口又容易创建一个池，未来数据库增加内部字段还可能直接进入响应。另一种常见写法是在每个请求开始时连接、结束时断开；它让本可复用的资源随着请求反复建立，增加认证与连接成本。

当前的责任分配是：`DatabaseService` 管理客户端、连接池与数据库故障；`PrismaCaptureStore` 将 CaptureStore 操作翻译成数据库读写；已有 `CapturesService` 继续维护原文规则、生成 ID 和时间；Controller 继续处理 HTTP。保留第十四章的 `ObservedCaptureStore`，让存储调用仍被追踪，断开客户端的请求也不会使已接受的数据库工作突然从关闭流程中消失。

```mermaid
flowchart TD
    C["CapturesController"] --> S["CapturesService"]
    S --> O["CAPTURE_STORE：ObservedCaptureStore"]
    O --> R["PrismaCaptureStore"]
    R --> D["DatabaseService"]
    D --> P["Prisma Client 与驱动适配器"]
    P --> Q["pg 连接池"]
    Q --> DB["PostgreSQL"]
    L["serve：排空后 app.close"] --> D
```

这是两种不同的适配：业务存储适配器把“保存一条原文”转换为模型与查询；`@prisma/adapter-pg` 把 Prisma 执行过程接到 PostgreSQL 驱动。二者名字相似，但一个理解业务字段，一个处理数据库驱动协议。不要为了套某种架构再加一层所有表通用的 CRUD Repository；当前三个方法已经表达了消费者真正需要的边界，后续只有出现新的业务责任才扩展。

`DatabaseService` 使用组合，内部持有 Prisma Client，没有继承它。继承也可以接上 Nest 生命周期，但会把整个 ORM API 当成服务自身的公开接口；组合更容易明确谁管理连接、哪些地方允许访问客户端。这里没有试图把 Prisma 的所有方法重新包装一遍。

### 补上 Prisma 7 的运行时驱动

沿前章代码操作时，在项目根目录执行：

```bash
nvm use
npm install --save-exact @prisma/adapter-pg@7.10.1 pg@8.16.3
npm install --save-dev --save-exact @types/pg@8.16.0
```

Client、CLI、适配器统一为 7.10.1；pg 是实际连接 PostgreSQL 的运行依赖，`@types/pg` 只提供编译期声明。使用完成代码时按锁文件 `npm ci`。不能只在开发依赖安装适配器：生产产物里仍会导入它，即使 TypeScript 编译已经成功。

本章使用 Node 24 的 `String.prototype.isWellFormed()` 检查字符串，因此把 `tsconfig.json` 的 `compilerOptions.lib` 改为 `["ES2024"]`，`target` 继续保留 ES2023。lib 告诉编译器哪些内建 API 有类型声明，不会给旧 Node 安装 polyfill；真正运行能力由固定 Node 版本提供。

### CLI 的配置不会自动进入应用

`.env.database` 是第二十章为迁移 CLI 明确加载的文件。`npm run dev` 加载的是 `.env`；生成客户端也不会把 CLI 连接串偷偷编译进产物。现在需要在原有 `.env` 中补齐以下配置，保留已经设置的端口和日志等级：

```dotenv
DATABASE_URL="postgresql://epp_owner:REPLACE_WITH_URL_ENCODED_PASSWORD@127.0.0.1:55432/epp_dev?schema=public"
DB_POOL_MAX=5
DB_QUERY_DEBUG=false
```

密码仍只编码 URL 的密码部分，不能把整条 URL 编码。两个文件可以指向同一个开发库，但不是互相导入。已有进程环境优先于 Node 的 env 文件；若终端保留了旧值，先清除相关变量再启动，不通过打印完整 URL 确认目标。

新增 `src/database-config.ts`：

```ts
import { z } from 'zod';
import { ConfigError } from './config.js';

export const DATABASE_CONFIG = Symbol('DATABASE_CONFIG');
export const DEVELOPMENT_USER_ID = '10000000-0000-4000-8000-000000000001';
const positive = (max: number) => z.string().regex(/^[1-9][0-9]*$/)
  .transform(Number).pipe(z.number().int().max(max));
const Schema = z.object({
  DATABASE_URL: z.string().min(1).refine(value => {
    try {
      const url = new URL(value);
      return ['postgres:', 'postgresql:'].includes(url.protocol)
        && !!url.hostname && !!url.username && url.pathname.length > 1
        && !url.hash && [...url.searchParams.keys()].every(key => key === 'schema')
        && url.searchParams.getAll('schema').length <= 1
        && (!url.searchParams.has('schema') || url.searchParams.get('schema') === 'public');
    } catch { return false; }
  }),
  DB_POOL_MAX: positive(20).default(5),
  DB_QUERY_DEBUG: z.enum(['true', 'false']).default('false'),
});
export type DatabaseConfig = Readonly<{
  url: string; poolMax: number; queryDebug: boolean;
}>;
export function parseDatabaseConfig(env: NodeJS.ProcessEnv): DatabaseConfig {
  const result = Schema.safeParse(env);
  if (!result.success) throw new ConfigError(String(result.error.issues[0]?.path[0] ?? 'database'));
  if (result.data.DB_QUERY_DEBUG === 'true' && env.NODE_ENV !== 'development') {
    throw new ConfigError('DB_QUERY_DEBUG');
  }
  // CLI schema is not a pg connection option. The adapter uses explicit public below.
  const url = new URL(result.data.DATABASE_URL);
  url.search = '';
  return Object.freeze({ url: url.toString(), poolMax: result.data.DB_POOL_MAX,
    queryDebug: result.data.DB_QUERY_DEBUG === 'true' });
}
```

这里沿用第十四章“校验失败只报告字段名”的规则。Zod 的完整错误、连接 URL 都不进入日志。DATABASE_CONFIG 由模块创建一次，然后交给 DatabaseService；HTTP 配置继续由 RuntimeModule 提供，两个配置对象各自有明确的使用者。独立的请求管线、文件生命周期实验没有导入数据库模块，也就不因主服务接入而凭空要求数据库密码。

本章刻意只接受既定本机连接格式：URL 可带 `schema=public`，其他查询参数拒绝。`schema` 是 Prisma CLI 的约定，不能指望 pg 自动照办；解析后将它去掉，再在适配器明确指定 `public`。这也防止 URL 中随手加的参数覆盖池选项，让正文声明的超时与实际行为不同。以后接远程 TLS 或连接代理，应明确增加对应配置和验证，不能把当前限制解释成 pg 不支持这些能力，更不能遇到证书错误就关闭验证。

开发服务重启后才能读取新 `.env`。保存 TypeScript 会触发自动编译重启；保存环境文件则需要结束整个 `npm run dev` 后重新启动，因为父进程已经持有旧环境。两种动作的边界不能混淆。

从前章跟写时，在另一份配套代码目录打开 `part-03/chapter-21` 的完成快照，把 `src/database-errors.ts`、`src/database.service.ts`、`src/database.module.ts` 及配套版本的 `src/app-logger.ts`、`src/http.ts` 接入自己的工程。后两个已有文件的变动分别给数据库事件增加日志字段、给存储失败增加 HTTP 出口；若自己改过相应文件，请对照差异合并。再复制配套的 `database/chapter-19/` 和 `requests/chapter-19.postman_collection.json` 供验证。配置、资源和依赖都到位后先运行 `npm run check`。此刻手写项目仍在使用内存存储。

## 21.2 用原来的记录验证查询与公开响应

### 先确定“相同接口”到底保留什么

表里一行有 id、user_id、original_text、created_at；HTTP 公开对象只有 id、originalText、createdAt。数据库字段是存储事实，响应字段是调用契约。直接返回 ORM 对象会把 userId 一起带出去；即使暂时没有敏感字段，也已经让数据库结构变化变成接口变化。

时间还有一次表示转换：Prisma 将 timestamptz 映射为 Date，API 继续使用 ISO UTC 字符串。不能用 `String(date)` 或本地格式化代替 `toISOString()`，否则会把服务器时区和本地显示格式带入协议。本章仍由 Service 在创建时生成 UUID 和毫秒时间，再显式写入数据库，保留“返回什么就保存什么”的责任。表的时间默认值主要服务未提供时间的其他 SQL 写入，不在一次 API 创建中混用两个时钟。

新增 `src/prisma-capture.store.ts`，其中完整实现包括本节的读和下一节要分析的写：

```ts
import { Prisma } from './generated/prisma/client.js';
import type { Capture, CaptureListOptions } from './capture.js';
import type { CaptureStore } from './capture-store.js';
import { DatabaseService } from './database.service.js';
import { DEVELOPMENT_USER_ID } from './database-config.js';

const selection = { id: true, originalText: true, createdAt: true } as const;
type Row = Prisma.CaptureGetPayload<{ select: typeof selection }>;
const project = (row: Row): Capture => ({
  id: row.id, originalText: row.originalText, createdAt: row.createdAt.toISOString(),
});

export class PrismaCaptureStore implements CaptureStore {
  constructor(private readonly database: DatabaseService) {}

  async insert(capture: Capture): Promise<void> {
    await this.database.run('insert', () => this.database.client.capture.create({
      data: { id: capture.id, userId: DEVELOPMENT_USER_ID,
        originalText: capture.originalText, createdAt: new Date(capture.createdAt) },
      select: { id: true },
    }));
  }

  async list({ text, limit }: CaptureListOptions): Promise<Capture[]> {
    const rows = await this.database.run('list', () => this.database.client.$queryRaw<Row[]>(Prisma.sql`
      SELECT c.id, c.original_text AS "originalText", c.created_at AS "createdAt"
      FROM public.captures AS c
      WHERE c.user_id = ${DEVELOPMENT_USER_ID}::uuid
        ${text === undefined ? Prisma.empty : Prisma.sql`AND strpos(c.original_text COLLATE "C", ${text}) > 0`}
      ORDER BY c.created_at ASC, c.id ASC
      ${limit === undefined ? Prisma.empty : Prisma.sql`LIMIT ${limit}`}
    `));
    return rows.map(project);
  }

  async find(id: string): Promise<Capture | undefined> {
    // Preserve literal path semantics: invalid or noncanonical IDs are misses, not cast errors.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) return undefined;
    const row = await this.database.run('find', () => this.database.client.capture.findFirst({
      where: { id, userId: DEVELOPMENT_USER_ID }, select: selection,
    }));
    return row === null ? undefined : project(row);
  }
}
```

`selection` 只选择公开映射需要的三个字段，`project` 再明确构造业务对象。`Prisma.CaptureGetPayload` 从选择条件得到 TypeScript 行类型，不额外手写一份可能漂移的 ORM 模型。原来的响应 Interceptor 继续运行时校验和投影；数据库查询投影、业务映射和响应边界各解决一个问题：减少取出的字段、转换内部表示、守住对外输出。

`$queryRaw<Row[]>` 的泛型是作者给出的类型承诺，不是数据库返回值的运行时校验。如果把 SQL 中别名写错，泛型不会替数据库验证；后面的映射和响应检查会失败。改 raw SQL 时必须核对实际行，不能把编译通过当成查询已经正确。

### 存储实现完成后再切换模块

现在三个存储方法都已定义，再将 `src/captures.module.ts` 从内存实现切换到 Prisma：

```ts
import { Module } from '@nestjs/common';
import { CapturesController } from './captures.controller.js';
import { CapturesService } from './captures.service.js';
import { CAPTURE_STORE } from './capture-store.js';
import type { CaptureStore } from './capture-store.js';
import { CaptureListQueryPipe } from './capture-query.js';
import { DatabaseModule } from './database.module.js';
import { DatabaseService } from './database.service.js';
import { PrismaCaptureStore } from './prisma-capture.store.js';
import { ObservedCaptureStore } from './observed-capture.store.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';

@Module({
  imports: [DatabaseModule],
  controllers: [CapturesController],
  providers: [
    CaptureListQueryPipe,
    { provide: PrismaCaptureStore,
      useFactory: (database: DatabaseService) => new PrismaCaptureStore(database),
      inject: [DatabaseService] },
    {
      provide: CAPTURE_STORE,
      useFactory: (store: PrismaCaptureStore, logger: AppLogger, state: ApplicationState) =>
        new ObservedCaptureStore(store, logger, state),
      inject: [PrismaCaptureStore, AppLogger, ApplicationState],
    },
    {
      provide: CapturesService,
      useFactory: (store: CaptureStore) => new CapturesService(store),
      inject: [CAPTURE_STORE],
    },
  ],
  exports: [CapturesService],
})
export class CapturesModule {}
```

DatabaseModule 导出 DatabaseService；CapturesModule 导入它，随后在同一个依赖链中创建存储。不要在每个使用者的 providers 再登记一次 DatabaseService，否则又把“消费同一个资源”写成“创建一个资源”。普通 Provider 的默认作用域是应用上下文内共享，不是操作系统全局单例；两个 API 进程仍各有自己的池。

Controller 与 CapturesService 的注入令牌没有变化，`ObservedCaptureStore` 仍包在真正的存储外侧。到这里已具备启动所需的全部类型、日志、故障出口与存储方法。先继续核对下面的读取语义，再执行本节末尾的 check、启动和已有记录 GET；无需提前跳到 21.3 补文件。写入的编码规则与创建实验在 21.3 完成，本节先不发送 POST。

### 时间点要用独立证据核对

还有一个容易被“写完再读回来”掩盖的问题。本章固定的 `@prisma/adapter-pg` 7.10.1 在非 UTC 会话下处理 timestamptz 存在兼容问题：读取时会把返回文本的偏移替换成 UTC 标记，写入 Date 时又可能发送不带时区的时间文本。只核对同一个驱动写入、再由它读取的结果，两边偏差可能相互抵消。

因此池配置显式使用 `options: '-c TimeZone=UTC'`，让**每条新连接**在建立时就进入 UTC 会话。这是当前固定版本的适配要求，不是 PostgreSQL 只能在 UTC 下保存时间。不要在启动时随手执行一次 SET TIME ZONE 就结束：连接池以后创建的其他连接未必执行过它。也不要给结果减八小时，服务器可能在另一个时区，夏令时还会改变偏移。

用前章带明确 `Z` 的 seed 作为独立事实，在 DBeaver 查：

```sql
SELECT created_at::text AS server_text,
       extract(epoch FROM created_at)::text AS epoch_seconds
FROM public.captures
WHERE id = '20000000-0000-4000-8000-000000000001';
```

其 epoch 应为 `1793433600.123000`，HTTP 对应 `2026-10-31T08:00:00.123Z`。DBeaver 自己的会话改为上海时区后，server_text 可以显示 16:00+08，但 epoch 和 HTTP 时间点不应变。21.3 创建新记录时，再比较响应时间对应的 epoch 与 DBeaver 中实际保存的 epoch，不能只比较 POST 与 GET 两份 JSON。

读列表、读详情和创建都经过同一个池，才共同遵守这项设置。以后代码不要随意修改池会话时区；要给用户显示当地时间，在显示层转换。升级适配器后重新执行这个交叉核对，而非仅凭新版本号移除兼容配置。相关问题可查 [Prisma 的时间适配问题记录](https://github.com/prisma/orm/issues/28629)；判断当前项目仍以固定版本与实际数据核对为准。

### 为什么这里没有直接使用 contains

原来的 `q` 是大小写敏感的字面子串。例如搜索 `%`，应只找到包含百分号的原文。Prisma 的常用字符串 contains 在 PostgreSQL 中可能经 LIKE 表达；SQL 参数化能阻止输入变成 SQL 结构，却不会自动取消 LIKE 的通配语义。把 `%` 作为安全参数传入，仍可能扩大匹配范围。这是“安全”和“符合业务含义”两个不同问题。

可以继续使用 contains，但要针对当前生成 SQL 的 LIKE 规则正确转义反斜线、百分号和下划线，并持续维护该约定。本章沿用第十九章已经推导过的 `strpos`：找到字面片段时返回正的位置，否则返回 0。显式 `COLLATE "C"` 固定当前文字比较方式，不增加大小写折叠或 Unicode 规范化；预组合字符和组合序列也不会被自动当成同一段字符串。

只在这个查询中使用参数化 SQL，是为保持准确含义，不是放弃 ORM。详情与创建仍使用模型 API。`Prisma.sql` 是标记模板，`${text}` 进入参数值，动态 SQL 结构只有我们自己选择的固定片段。不要先生成普通插值字符串，再交给 `$queryRawUnsafe`；那会把第十九章建立的结构和值的边界重新打破。表名、列名和排序方向都是固定代码，当前没有接受用户 SQL 的入口。

空查询条件使用 `Prisma.empty`，意味着不附加该条件；提供了空白 q 则在入口拒绝，不把它偷偷当成“没有筛选”。`limit` 同样只有明确提供时才加入，始终发生在筛选和排序之后。

### 顺序不能靠 ORM 默认值碰运气

Map 按插入先后遍历，而关系查询没有天然顺序。这里落实第十九章确定的 `created_at ASC, id ASC`：时间相同再按 UUID 排序。因此它是稳定的时间顺序，不等于精确的写入先后，也不等于事务提交顺序。

前章两条记录有相同毫秒时间，ID 尾数 1、2，列表应按这个次序出现。如果两个 HTTP 请求恰好在同一毫秒生成记录，UUID 的顺序可以与请求到达顺序不同。依赖旧 Map 顺序的客户端必须调整理解；文档与 OpenAPI 已将此变化写明。若产品要求严格的事件先后，需要另外定义可保存的顺序事实，不能假装随机 UUID 编码了它。

没有 limit 时仍返回全部匹配记录，保持原接口范围。`LIMIT 10` 也不等于数据库只检查十行：筛选和排序可能处理更多行。本章建立查询正确性和连接上限；数据增长后还需分页与执行计划设计，第 32～35 章继续展开。当前不要为了看起来“生产化”悄悄加默认 100 条，让已有调用方漏数据。

### 详情的不存在与类型错误

数据库 UUID 类型会把 `not-a-uuid` 拒绝为类型输入错误，旧 Map 则只会查不到。把这次异常当 500 会使存储替换改变无效详情路径的结果。因此先识别本服务使用的规范小写 UUID 文本，其他路径直接作为 miss；再把合法 ID 与固定 userId 一起查询。不存在返回 undefined，由已有 Service 转为 404。

这里不把大写、无横线等 PostgreSQL 也能接受的表示规范化后查询；原来的路径契约使用创建返回的字面 ID，没有承诺它们是别名。合法但属于别的用户的行同样不返回，然而“固定开发用户条件”仍不是鉴权：每个调用者此时都使用同一个用户范围。服务继续绑定本机，不把它部署成多用户公开应用。

切换到数据库后，接口描述也要反映本节已经落实的行为。在 `src/openapi.ts` 将版本改为 0.3.0，列表说明写明 `createdAt ASC, id ASC`；三个操作的公共响应中增加 503／STORAGE_UNAVAILABLE，并保留 SERVICE_DRAINING 的说明。21.3 再随 Unicode 校验更新字段描述。文档版本不会自动改变代码，这里是同步已经实现的行为。

### 在 Postman 和 DBeaver 对照同一批行

先在 DBeaver 日常连接打开 `database/chapter-19/01-inspect-api-data.sql`，执行身份与列表查询。确认 `epp_dev / epp_owner / 55432`，原来的两条记录和空格仍在。若前章已经增加过合法记录，应保留它们并记下自己的基线，不为凑两行而删数据。

`npm run check` 后启动 `npm run dev`。顺序应是数据库完成初始化，再出现 `app.ready`。在 Postman 导入 `requests/chapter-19.postman_collection.json`，先发送“01 已有列表”和“02 前章固定详情”。不要先 POST：读取 SQL 阶段已经存在的行，才证明接口连到了同一份事实。

标准前置数据的第一条公开对象应为：

```json
{
  "id": "20000000-0000-4000-8000-000000000001",
  "originalText": "  I am not much of a cook.  ",
  "createdAt": "2026-10-31T08:00:00.123Z"
}
```

DBeaver Data 网格可能不明显显示两端空格，可查看文本编辑器或配套 `char_length` 结果；它的服务器时间文本也可能显示 `+00`，与 JSON 的 `Z` 表示同一个时间点，不应按显示字符串判断时间变化。响应不出现 userId，第一条原文长度仍为 28。

![DBeaver 显示前章原文、字符数和 UTC 时间](images/01-existing-data.jpg)

图中为便于完整显示，id_tail 只展示 UUID 的最后四位，实际查询仍按完整 ID 排序；两个字符数分别为 28、21，utc_time 通过 SQL 显式显示 UTC。接口查询和详情仍使用完整 UUID，不能把四位尾数当作唯一标识。左侧连接名称只是标签，目标身份仍以查询为准。

![Postman：通过完整 UUID 读取 SQL 阶段已有的记录](images/postman-existing-record.jpg)

这里没有重新 POST。详情返回前置数据的完整 ID、两端空格与 `2026-10-31T08:00:00.123Z`，可以逐项和上方数据库结果对应。图中 Postman 使用 3219 端口；端口只标识这次请求的 API 进程，不能据此判断其连接的数据库，仍要核对启动配置与数据库身份。

也可复用第十二章的 Swagger：打开 `/docs`，展开 GET /captures，点击 Try it out，再点击 Execute，查看 Server response 而不是下方静态 Example Value。

![Swagger 实际返回前章记录与 UTC 时间](images/02-http-data.jpg)

图中演示实例使用 3019 端口；跟做沿用自己的 PORT，默认仍是 3000。响应中的完整 UUID、原文空格和 `08:00:00.123Z` 与数据库侧相同；这里显示的是已执行请求的 200 响应，不是文档生成的示例值。

在 VS Code attach 到已有调试进程，在 `prisma-capture.store.ts` 的 `project` 返回对象处设置断点，再发送前面的详情 GET。黄色行表示程序停在这里；此时可以在 Debug Console 输入下面的表达式，把内部类型、输出值和输出类型放在一起比较：

```js
JSON.stringify({
  isDate: row.createdAt instanceof Date,
  iso: row.createdAt.toISOString(),
  type: typeof row.createdAt.toISOString(),
}, null, 2)
```

![VS Code：在 project 暂停，核对 Date 与 ISO 字符串的对应关系](images/vscode-date-mapping.jpg)

控制台中的 `isDate: true`、`08:00:00.123Z` 和 `type: "string"` 分别回答内部是什么、转换后是哪一刻、对外用什么表示。这里求值的是转换表达式，不能把暂停画面当成客户端已收到响应；继续执行后再核对 GET 的 200 与完整对象。避免把断点暂停导致的请求等待当成数据库慢查询。到这里可以中断：读路径已跑通，数据库没有因读操作新增业务行；恢复时从身份核对和列表请求继续。

### 在映射处验一次 bigint 的往返

在已有 Prisma 查询的调试位置，用同一 client 执行 `SELECT 9007199254740993::bigint AS n` 的 $queryRaw，查看 `typeof rows[0].n`。这里的 TypeScript 泛型可以写成 `{ n: bigint }[]`；泛型描述预期，不会替你转换运行时值。先在 Node 交互提示符单独复现映射。

```js
const row = { n: 9007199254740993n };
JSON.stringify(row)
JSON.stringify({ n: row.n.toString(10) })
BigInt(JSON.parse(JSON.stringify({ n: row.n.toString(10) })).n) === row.n
```

逐行运行。第一种序列化会抛 TypeError，第二种返回带引号的十进制整数，最后一行应为 true。若公开契约明确只接受安全整数，则在转 Number 前按两端的安全整数上下界检查，超界交给错误分支。数据库中的大数、驱动返回值和响应 JSON 要逐层比对；只用 COUNT 为 2 的夹具会漏掉精度错误。

## 21.3 写入、输入边界与错误如何连接起来

### 一次创建的完成点放在哪里

CapturesService 已经在 `await this.store.insert(capture)` 成功后才返回对象；现在 insert 等待的是真实数据库写入。Prisma 的 create 显式提供 id、归属、原文和时间，只取回 id。没有把请求体展开到 data，也没有接受调用方提供的 userId、id、createdAt。

为什么不先查询 ID 是否存在，再写入？“查询时没出现”无法保证另一并发操作稍后不会写入；主键才是共同的最终约束。当前 UUID 由服务器生成，用户没有选择 ID，碰撞并不是调用方能修正的业务冲突。本章遇到它会视为内部失败，而不是机械地把所有唯一约束异常转成 409。业务以后引入用户可选择的唯一名称时，才根据那个具体规则映射可理解的冲突。

一次 INSERT 已由 PostgreSQL 作为语句事务处理，本章不为了展示 `$transaction` 再套一层。它能保证该语句的行和约束一起成立，不能把“写入”与“客户端收到了响应”变成原子动作；这两个完成点分别属于数据库和网络。

### 有效 JSON 不等于可以原样存入 text

第十八章支线已经观察过两个边界。PostgreSQL text 不能保存零字符 U+0000；JavaScript 字符串又允许孤立 UTF-16 代理项，转成 UTF-8 时可能被替换为 U+FFFD。请求字节是合法 UTF-8，仍然可以通过 JSON 转义 `\ud800` 产生这样的 JS 字符串。

如果驱动替换之后“写入成功”，API 返回的原文与实际保存的内容就可能不同。删除 NUL 或调用 `toWellFormed()` 也会改写原文。当前产品要求保留原值，所以采取明确拒绝，不能用修复字符串的方式伪装成接受同一条输入。

`src/postgres-text.ts` 的共同判断只有这一段：

```ts
// Reject instead of silently replacing lone surrogates or removing NUL.
export function isPostgresText(value: string): boolean {
  return value.isWellFormed() && !value.includes('\u0000');
}
```

把它同时接到 `OriginalTextSchema`、查询 q 的 Schema，以及 Service 的非 HTTP 调用边界。只改请求 Pipe，未来直接调用 Service 时仍可能绕过去；只改 Service，则字段错误无法继续使用已有的输入问题结构。共享底层谓词，分别保留两层失败的职责。

例如原文 Schema 的开头变为：

```ts
export const OriginalTextSchema = z.string()
  .refine(isPostgresText, 'originalText must be well-formed Unicode without NUL')
  .regex(/\S/, 'originalText must contain a non-whitespace character')
  .refine(text => text.length <= 2000, 'originalText must be at most 2000 code units')
  .describe('Original text; whitespace is preserved. Maximum 2000 UTF-16 code units; well-formed Unicode without NUL.');
```

上述文件和 `captures.service.ts` 都显式导入 `isPostgresText`。q 的 Schema 接法是：

```ts
export const ListQuerySchema = z.object({
  q: z.string().refine(isPostgresText, 'q must be well-formed Unicode without NUL').regex(/\S/, 'q must contain a non-whitespace character')
    .refine(text => text.length <= 200, 'q must be at most 200 code units')
    .describe('Literal, case-sensitive substring; maximum 200 UTF-16 code units; well-formed Unicode without NUL.').optional(),
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/)
    .describe('One decimal integer from 1 to 100; no signs, spaces or leading zeros.').optional(),
});
```

Service.create 在确认输入是非空字符串之后、生成 ID 之前拒绝不可表示的文本：

```ts
    if (!isPostgresText(originalText)) {
      throw new InvalidCaptureError('originalText must be well-formed Unicode without NUL');
    }
```

Service.list 的 text 条件同时加入 `!isPostgresText(text)`，放在 `typeof text !== 'string'` 之后的短路判断中，避免对非字符串调用字符串方法；错误说明也加入良构 Unicode 与无 NUL。这样绕过 HTTP 直接调用 Service，仍得到同一条拒绝规则。

这是一次明确的输入契约收紧；成功字段不变，emoji 等正确代理对继续合法。原文仍至多 2000 个 UTF-16 单元，q 仍至多 200，长度没有改成码点数。Schema 的自定义 refine 不会完整转换成 OpenAPI 的标准限制，因此 description 要说明规则，再用真实请求核对。

写入规则和字段描述补齐后，停止旧 dev，运行 `npm run check`，再启动 `npm run dev`。下面开始创建请求；本节之前的读取验证保留了数据库基线，现在可以比较写入前后的同一条记录。

在 Postman “03 创建特殊字符原文”使用以下 JSON：

```json
{"originalText":"  Literal 100% a_b C:\\temp 😀  "}
```

应返回 201、Location 与完整原文。把返回 id 保存到集合 captureId，发送“04 按返回 ID 读取”；再刷新 DBeaver Data 页按该 ID 查同一行。不要把集合的初始占位 ID 当成刚才创建的 ID。随后在各搜索请求中分别发送 `%`、`_`、反斜线、emoji 和不同大小写的词，检查只匹配包含那段字面的记录。Params 由客户端负责 URL 编码，反斜线作为查询值只填一个字符，不把 JSON 转义写法直接抄进 Params。

![Postman：数据库写入路径保留空格、特殊字符与 emoji](images/postman-special-text.jpg)

请求和响应中的百分号、下划线、反斜线与 emoji 均保留；JSON 里的双反斜线表示原文中的一个反斜线。复制这次响应的完整 id，再到数据库查同一行；201 本身不能代替数据库对照。端口以当前启动地址为准。

![DBeaver：按 Postman 返回的完整 ID 读取同一行](images/dbeaver-same-capture.jpg)

WHERE 使用上一张响应的完整 UUID，表格只将 ID 尾部缩短显示。created_utc 显式转换为 UTC，与响应中带 Z 的 createdAt 对照：两者都是 01:23:14.553。网格里的 C:\temp 是实际文本，JSON 显示的双反斜线是转义表示。首尾空格难以目测时，再用本篇已有的长度或定界显示查询确认。

![Postman：q 中的百分号按普通字符搜索](images/postman-literal-search.jpg)

Params 中的 q 是一个 `%`，limit 为 10。响应只包含刚才那条带 `100%` 的原文，没有把其他不含百分号的记录一起匹配出来；它不是 SQL LIKE 中代表任意长度文本的通配符。发送前核对勾选状态，让 Postman 处理 URL 编码。再分别替换为 `_`、反斜线和 emoji，继续比较同一条记录；不要把一次百分号成功扩展成所有特殊字符都已验证。

“12 拒绝 NUL”和“13 拒绝孤立代理项”保存的正文分别包含 `a\u0000b`、`a\ud800b`。应返回 400／VALIDATION_ERROR，而不是 500 或保存替换后的字符。再次在 DBeaver 查询，失败请求没有产生新行。搜索 q 同样拒绝 NUL；前端通常会把孤立代理项先替换或拒绝编码，服务内的共同判断仍不能省略。

![Postman：JSON 转义出的 NUL 被原文字段校验拒绝](images/postman-reject-nul.jpg)

Body 中的 `\u0000` 是 JSON 转义，解析后是一个 NUL；若写成 `\\u0000`，得到的是反斜线与字母数字组成的普通文本，检验的就不是同一种输入。观察 400、`VALIDATION_ERROR` 和 `issues[0].path` 中的 `originalText`，而不只看状态码的颜色。

![Postman：孤立高代理项同样返回字段校验错误](images/postman-reject-surrogate.jpg)

这里的 `\ud800` 没有配对的低代理项。响应沿用“合法 Unicode 且不含 NUL”的共同规则，不意味着这次输入也含有 NUL。两张图展示的是请求输入被拒绝；拒绝后数据库行数是否保持，仍按前面的数据库查询核对，不能单靠一张 400 响应图得出结论。图中服务端口为 3219，跟做使用自己的实际端口。

记录本轮新建记录的完整 ID、原文和 UTC 时间，再回到 DBeaver 按 ID 查询一次。确认输入拒绝前后行没有增加。下一章关闭和重启 API 时仍要查这条记录；若中途停下，保留数据库和集合变量。

[上一章：Prisma：将已有表纳入 Schema 与迁移管理](../chapter-20-prisma/chapter.md) · [下一章：管理连接池、等待与服务关闭](../chapter-22-prisma-nest/chapter.md) · [返回第三篇](../README.md) · [返回全书目录](../../README.md)

[本章配套代码](https://github.com/SamChowRock/epp-public/tree/part-03/chapter-21)
