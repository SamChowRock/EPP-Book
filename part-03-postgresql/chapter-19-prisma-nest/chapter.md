# 第十九章 Prisma 与 Nest：让记录接口使用持久化数据

第十八章结束时，PostgreSQL 里有原来的两条记录，有能从空库重放的结构历史，也有生成好的 Prisma Client。Nest 却仍然在使用 Map。这不是再建一套项目的理由：第九章留下的 `CaptureStore`，现在应该真正承担存储替换的边界。

本章从 `part-03/chapter-18` 继续，不增加表、不修改基线、不重新导入开发数据。我们要让已有列表、详情和创建接口连接同一批数据库记录，并回答几个仅凭“能调用 ORM”无法解决的问题：相同输入是否仍得到相同含义的结果，字段怎样跨过数据库与 JSON，连接失败算什么，进程退出时谁负责收尾。

从第十八章逐步手写时，按 19.1→19.2→19.3 推进：先定义配置、故障、日志和连接资源，再实现存储并切换模块，读取原有记录后继续补齐写入边界。19.1 结束可以编译，19.2 结束可以启动并验证 GET，19.3 再验证创建与拒绝；不需要跳读后文才能补齐第一次运行的依赖。使用完成代码时，配置连接后直接从 19.2 的图形验证进入，再完成后续实验。

日常操作继续以 Postman、VS Code 调试器和 DBeaver 为主。它们分别观察请求、程序状态和数据库事实；三处证据能对应起来，才有依据判断问题在哪一层。固定开发用户仍是 `10000000-0000-4000-8000-000000000001`，它是数据库行的归属，不代表请求已经完成身份认证。

**时间参考（估算）**：阅读约 150～175 分钟；接入、图形联调、故障与产物核对另加约 70～90 分钟。支线单列，估时依据见篇导读。

## 19.1 在 Nest 中明确数据库资源的所有者

### 替换的是存储能力，新增的是资源责任

先打开 `src/capture-store.ts`。Service 使用的仍是三个异步方法：`insert(capture)`、`list(options)`、`find(id)`。这三个方法描述业务需要的能力，并不要求调用者知道 SQL、Prisma 或连接密码。

最直接的接法是在 Controller 中新建 PrismaClient，然后把查询结果返回。问题不在于这段代码短，而在于它把请求协议、数据库字段、资源创建放进同一个变化点：换一次连接策略要改 Controller，新增一个调用入口又容易创建一个池，未来数据库增加内部字段还可能直接进入响应。另一种常见写法是在每个请求开始时连接、结束时断开；它让本可复用的资源随着请求反复建立，增加认证与连接成本。

当前的责任分配是：`DatabaseService` 管理客户端、连接池与数据库故障；`PrismaCaptureStore` 将 CaptureStore 操作翻译成数据库读写；已有 `CapturesService` 继续维护原文规则、生成 ID 和时间；Controller 继续处理 HTTP。保留第十三章的 `ObservedCaptureStore`，让存储调用仍被追踪，断开客户端的请求也不会使已接受的数据库工作突然从关闭流程中消失。

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

`.env.database` 是第十八章为迁移 CLI 明确加载的文件。`npm run dev` 加载的是 `.env`；生成客户端也不会把 CLI 连接串偷偷编译进产物。现在需要在原有 `.env` 中补齐以下配置，保留已经设置的端口和日志等级：

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

这里沿用第十三章“校验失败只报告字段名”的规则。Zod 的完整错误、连接 URL 都不进入日志。DATABASE_CONFIG 由模块创建一次，然后交给 DatabaseService；HTTP 配置继续由 RuntimeModule 提供，两个配置对象各自有明确的使用者。独立的请求管线、文件生命周期实验没有导入数据库模块，也就不因主服务接入而凭空要求数据库密码。

本章刻意只接受既定本机连接格式：URL 可带 `schema=public`，其他查询参数拒绝。`schema` 是 Prisma CLI 的约定，不能指望 pg 自动照办；解析后将它去掉，再在适配器明确指定 `public`。这也防止 URL 中随手加的参数覆盖池选项，让正文声明的超时与实际行为不同。以后接远程 TLS 或连接代理，应明确增加对应配置和验证，不能把当前限制解释成 pg 不支持这些能力，更不能遇到证书错误就关闭验证。

开发服务重启后才能读取新 `.env`。保存 TypeScript 会触发自动编译重启；保存环境文件则需要结束整个 `npm run dev` 后重新启动，因为父进程已经持有旧环境。两种动作的边界不能混淆。

### 先接好故障出口和安全日志

数据库访问失败与成功查询没有行，是两件不同的事。连接资源在启动和查询时都可能失败，因此先定义它们能交给上层的错误，再创建使用这些定义的资源对象。原始 message、meta、stack 和参数可能含有原文或连接信息，不直接写入日志。

先新增 `src/database-errors.ts`。资源初始化和查询都使用这套分类：读取结构化错误码，只对明确认识的连接、容量与超时失败标记 temporarily unavailable；其他失败保留为内部故障。

```ts
export class StorageUnavailableError extends Error {
  constructor() { super('Storage is temporarily unavailable; write outcome may be unknown'); }
}
export class StorageFailureError extends Error {
  constructor() { super('Storage operation failed'); }
}
const object = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
const transientCodes = new Set([
  'P1001', 'P1002', 'P1008', 'P1017', 'P2024', 'P2037',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND',
  '53300', '57014', '57P01', '57P02', '57P03', '08000', '08003', '08006',
]);
// pg 8.16.3 pool acquisition errors have messages but no stable code.
const acquisitionMessages = new Set([
  'timeout exceeded when trying to connect',
  'Connection terminated due to connection timeout',
]);
export function databaseFailure(error: unknown): { code: string; unavailable: boolean } {
  const root = object(error);
  const meta = object(root.meta);
  const adapterCause = object(object(meta.driverAdapterError).cause);
  const directCause = object(root.cause);
  const codes = [root.code, meta.code, adapterCause.originalCode, adapterCause.code,
    directCause.originalCode, directCause.code].filter((v): v is string => typeof v === 'string');
  const unavailable = codes.some(code => transientCodes.has(code))
    || [root, directCause].some(value => acquisitionMessages.has(String(value.message)));
  // Do not log messages, metadata, parameter values, stack or connection URL.
  const code = codes.includes('DEV_USER_MISSING') ? 'DEV_USER_MISSING' : codes.find(value => /^(?:P[0-9]{4}|[0-9A-Z]{5}|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND)$/.test(value))
    ?? (unavailable ? 'POOL_TIMEOUT' : 'DATABASE_FAILURE');
  return { code, unavailable };
}
```

在 `http.ts` 导入 StorageUnavailableError，在原有 statusCode 分支中让它得到 503，在 code 分支中得到 STORAGE_UNAVAILABLE。保留 HttpError、InvalidCaptureError、CaptureNotFoundError 的原处理，核心结果如下：

```ts
  const statusCode = error instanceof HttpError ? error.statusCode
    : error instanceof InvalidCaptureError ? 400
    : error instanceof CaptureNotFoundError ? 404
    : error instanceof StorageUnavailableError ? 503 : clientStatus ?? 500;
  const code = statusCode === 500 ? 'INTERNAL_ERROR'
    : error instanceof StorageUnavailableError ? 'STORAGE_UNAVAILABLE'
    : error instanceof InvalidCaptureError ? 'INVALID_CAPTURE'
    : error instanceof CaptureNotFoundError ? 'CAPTURE_NOT_FOUND'
    : error instanceof HttpError ? error.code : `HTTP_${statusCode}`;
```

通用 500 的 detail 继续固定为 Internal server error；503 使用存储错误中固定的非敏感说明。这样数据库故障不会被旧的“查不到记录”分支吞掉。

资源对象接下来会记录数据库事件和池计数，先同步 `src/app-logger.ts` 的事件与字段白名单。保留原有 HTTP、存储、生命周期事件，完整文件如下：

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { ConsoleLogger } from '@nestjs/common';
import type { AppConfig } from './config.js';

type Level = AppConfig['logLevel'];
type Event = 'http.started' | 'http.completed' | 'http.aborted' | 'http.failed'
  | 'store.completed' | 'store.failed' | 'app.ready' | 'app.start_failed'
  | 'app.draining' | 'app.stopped' | 'app.stop_failed' | 'app.stop_timeout'
  | 'database.ready' | 'database.start_failed' | 'database.closed'
  | 'database.failed' | 'database.idle_error' | 'database.query'
  | 'resource.opened' | 'resource.closed' | 'resource.used';
type Fields = {
  method?: string; route?: string; status?: number; code?: string;
  operation?: string; durationMs?: number; signal?: string;
  port?: number; active?: number; field?: string;
  total?: number; idle?: number; waiting?: number;
};
const priority: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export class AppLogger {
  private readonly context = new AsyncLocalStorage<{ requestId: string }>();
  private readonly output = new ConsoleLogger('EPP', { json: true, colors: false });
  constructor(private readonly level: Level) {}

  withRequest<T>(requestId: string, action: () => T): T {
    return this.context.run({ requestId }, action);
  }
  write(level: Level, event: Event, fields: Fields = {}): void {
    if (priority[level] < priority[this.level]) return;
    const { method, route, status, code, operation, durationMs, signal, port, active, field, total, idle, waiting } = fields;
    const message = {
      event, requestId: this.context.getStore()?.requestId,
      method, route, status, code, operation, durationMs, signal, port, active, field, total, idle, waiting,
    };
    if (level === 'info') this.output.log(message);
    else this.output[level](message);
  }
  onApplicationShutdown(): void { this.context.disable(); }
}
```

这里增加的 total、idle、waiting 只表示池状态。事件类型、参数解构和最终输出同时列出允许字段，完整异常、连接串和业务文本不会因为多传一个对象就进入日志。

### 创建一次，启动时验证，失败也释放

新增 `src/database.service.ts`。先把完整资源生命周期放在一起看，19.4 再用实际等待与关闭观察这些选项：

```ts
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.js';
import type { DatabaseConfig } from './database-config.js';
import { DEVELOPMENT_USER_ID } from './database-config.js';
import { AppLogger } from './app-logger.js';
import { databaseFailure, StorageFailureError, StorageUnavailableError } from './database-errors.js';

export class DatabaseService {
  readonly pool: pg.Pool;
  readonly client: PrismaClient<'query'>;
  private closing?: Promise<void>;

  constructor(config: DatabaseConfig, private readonly logger: AppLogger) {
    this.pool = new pg.Pool({
      connectionString: config.url, max: config.poolMax,
      connectionTimeoutMillis: 2000, idleTimeoutMillis: 10000,
      statement_timeout: 3000, application_name: 'epp-api',
      options: '-c TimeZone=UTC',
    });
    this.pool.on('error', error => {
      this.logger.write('error', 'database.idle_error', { code: databaseFailure(error).code });
    });
    const adapter = new PrismaPg(this.pool, { schema: 'public', disposeExternalPool: false });
    this.client = new PrismaClient({ adapter,
      log: config.queryDebug ? [{ emit: 'event', level: 'query' }] : [],
    });
    this.client.$on('query', event => {
      // Break here with fabricated data to inspect event.query and event.params locally.
      this.logger.write('debug', 'database.query', { durationMs: event.duration });
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
      const user = await this.client.user.findUnique({
        where: { id: DEVELOPMENT_USER_ID }, select: { id: true },
      });
      if (!user) throw Object.assign(new Error('Development user is missing'), { code: 'DEV_USER_MISSING' });
      // Exercise the columns needed by the API, even when the table is empty.
      await this.client.capture.findMany({ take: 1,
        select: { id: true, userId: true, originalText: true, createdAt: true } });
      this.logger.write('info', 'database.ready');
    } catch (error) {
      this.logger.write('error', 'database.start_failed', { code: databaseFailure(error).code });
      await this.close();
      throw new StorageFailureError();
    }
  }

  async run<T>(operation: string, work: () => Promise<T>): Promise<T> {
    try { return await work(); }
    catch (error) {
      const failure = databaseFailure(error);
      this.logger.write('error', 'database.failed', { operation, code: failure.code,
        total: this.pool.totalCount, idle: this.pool.idleCount, waiting: this.pool.waitingCount });
      throw failure.unavailable ? new StorageUnavailableError() : new StorageFailureError();
    }
  }

  private close(): Promise<void> {
    return this.closing ??= (async () => {
      try { await this.client.$disconnect(); }
      finally { await this.pool.end(); }
      this.logger.write('info', 'database.closed');
    })();
  }
  onModuleDestroy(): Promise<void> { return this.close(); }
}
```

`new Pool()` 创建管理对象，并不立即建满五条连接；`new PrismaClient()` 也不是业务就绪的证明。尤其这里的适配器接收一个外部池，`$connect()` 可以先完成适配器初始化，真正向数据库执行查询才验证网络、认证与模型访问。因此初始化继续读取固定用户，并查询接口需要的列。固定用户缺失时明确停止启动，不悄悄插入 seed；查询业务列可以发现“连接成功但表或列不对”。这不是完整的迁移漂移检查，CHECK 和迁移历史仍由前章的维护流程核对。

为什么启动失败也要清理？用户查询可能成功，而下一次列查询失败，此时池已经拥有连接。如果只抛异常，服务没有监听，连接却还在；开发监听器下一次重启又会创建一组资源。catch 中的 close 释放已取得的资源，`closing` 保存同一个 Promise，使之后 Nest 的关闭钩子再次调用也不会重复结束池。

日志中的 `DEV_USER_MISSING` 指向前章开发用户准备；`P2021`、`P2022` 等则应回到实际表、列和连接目标。不能把所有启动失败都解释成“密码不对”。对外不暴露内部异常；本机从安全错误码、连接身份和 DBeaver 结构逐步定位。

在 `src/database.module.ts` 中通过 factory 登记配置和资源对象：

```ts
import { Module } from '@nestjs/common';
import { ConfigError } from './config.js';
import { AppLogger } from './app-logger.js';
import { DATABASE_CONFIG, parseDatabaseConfig } from './database-config.js';
import type { DatabaseConfig } from './database-config.js';
import { DatabaseService } from './database.service.js';

@Module({
  providers: [
    { provide: DATABASE_CONFIG,
      useFactory: (logger: AppLogger) => {
        try { return parseDatabaseConfig(process.env); }
        catch (error) {
          logger.write('error', 'database.start_failed', {
            code: 'CONFIG_INVALID', field: error instanceof ConfigError ? error.field : undefined,
          });
          throw error;
        }
      }, inject: [AppLogger] },
    { provide: DatabaseService,
      useFactory: (config: DatabaseConfig, logger: AppLogger) => new DatabaseService(config, logger),
      inject: [DATABASE_CONFIG, AppLogger] },
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
```

配置 factory 在异常离开容器之前记录安全字段名。否则外层启动协调只会记录通用 START_FAILURE，读者无法判断是 DATABASE_URL 还是 DB_POOL_MAX 不合法；这条日志仍不包含配置值。

此时 `DatabaseModule` 已经定义，但 `CapturesModule` 仍保留前章的内存实现，尚未导入它。可以先运行 `npm run check`，确认配置、错误、日志和资源文件能够独立编译；这一步不要求数据库在线，也不表示主服务已经接上数据库。下一节实现存储后再切换模块。

## 19.2 用原来的记录验证查询与公开响应

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

Controller 与 CapturesService 的注入令牌没有变化，`ObservedCaptureStore` 仍包在真正的存储外侧。到这里已具备启动所需的全部类型、日志、故障出口与存储方法。先继续核对下面的读取语义，再执行本节末尾的 check、启动和已有记录 GET；无需提前跳到 19.3 补文件。写入的编码规则与创建实验在 19.3 完成，本节先不发送 POST。

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

其 epoch 应为 `1793433600.123000`，HTTP 对应 `2026-10-31T08:00:00.123Z`。DBeaver 自己的会话改为上海时区后，server_text 可以显示 16:00+08，但 epoch 和 HTTP 时间点不应变。19.3 创建新记录时，再比较响应时间对应的 epoch 与 DBeaver 中实际保存的 epoch，不能只比较 POST 与 GET 两份 JSON。

读列表、读详情和创建都经过同一个池，才共同遵守这项设置。以后代码不要随意修改池会话时区；要给用户显示当地时间，在显示层转换。升级适配器后重新执行这个交叉核对，而非仅凭新版本号移除兼容配置。相关问题可查 [Prisma 的时间适配问题记录](https://github.com/prisma/orm/issues/28629)；判断当前项目仍以固定版本与实际数据核对为准。

### 为什么这里没有直接使用 contains

原来的 `q` 是大小写敏感的字面子串。例如搜索 `%`，应只找到包含百分号的原文。Prisma 的常用字符串 contains 在 PostgreSQL 中可能经 LIKE 表达；SQL 参数化能阻止输入变成 SQL 结构，却不会自动取消 LIKE 的通配语义。把 `%` 作为安全参数传入，仍可能扩大匹配范围。这是“安全”和“符合业务含义”两个不同问题。

可以继续使用 contains，但要针对当前生成 SQL 的 LIKE 规则正确转义反斜线、百分号和下划线，并持续维护该约定。本章沿用第十七章已经推导过的 `strpos`：找到字面片段时返回正的位置，否则返回 0。显式 `COLLATE "C"` 固定当前文字比较方式，不增加大小写折叠或 Unicode 规范化；预组合字符和组合序列也不会被自动当成同一段字符串。

只在这个查询中使用参数化 SQL，是为保持准确含义，不是放弃 ORM。详情与创建仍使用模型 API。`Prisma.sql` 是标记模板，`${text}` 进入参数值，动态 SQL 结构只有我们自己选择的固定片段。不要先生成普通插值字符串，再交给 `$queryRawUnsafe`；那会把第十七章建立的结构和值的边界重新打破。表名、列名和排序方向都是固定代码，当前没有接受用户 SQL 的入口。

空查询条件使用 `Prisma.empty`，意味着不附加该条件；提供了空白 q 则在入口拒绝，不把它偷偷当成“没有筛选”。`limit` 同样只有明确提供时才加入，始终发生在筛选和排序之后。

### 顺序不能靠 ORM 默认值碰运气

Map 按插入先后遍历，而关系查询没有天然顺序。这里落实第十七章确定的 `created_at ASC, id ASC`：时间相同再按 UUID 排序。因此它是稳定的时间顺序，不等于精确的写入先后，也不等于事务提交顺序。

前章两条记录有相同毫秒时间，ID 尾数 1、2，列表应按这个次序出现。如果两个 HTTP 请求恰好在同一毫秒生成记录，UUID 的顺序可以与请求到达顺序不同。依赖旧 Map 顺序的客户端必须调整理解；文档与 OpenAPI 已将此变化写明。若产品要求严格的事件先后，需要另外定义可保存的顺序事实，不能假装随机 UUID 编码了它。

没有 limit 时仍返回全部匹配记录，保持原接口范围。`LIMIT 10` 也不等于数据库只检查十行：筛选和排序可能处理更多行。本章建立查询正确性和连接上限；数据增长后还需分页与执行计划设计，第 28～30 章继续展开。当前不要为了看起来“生产化”悄悄加默认 100 条，让已有调用方漏数据。

### 详情的不存在与类型错误

数据库 UUID 类型会把 `not-a-uuid` 拒绝为类型输入错误，旧 Map 则只会查不到。把这次异常当 500 会使存储替换改变无效详情路径的结果。因此先识别本服务使用的规范小写 UUID 文本，其他路径直接作为 miss；再把合法 ID 与固定 userId 一起查询。不存在返回 undefined，由已有 Service 转为 404。

这里不把大写、无横线等 PostgreSQL 也能接受的表示规范化后查询；原来的路径契约使用创建返回的字面 ID，没有承诺它们是别名。合法但属于别的用户的行同样不返回，然而“固定开发用户条件”仍不是鉴权：每个调用者此时都使用同一个用户范围。服务继续绑定本机，不把它部署成多用户公开应用。

切换到数据库后，接口描述也要反映本节已经落实的行为。在 `src/openapi.ts` 将版本改为 0.3.0，列表说明写明 `createdAt ASC, id ASC`；三个操作的公共响应中增加 503／STORAGE_UNAVAILABLE，并保留 SERVICE_DRAINING 的说明。19.3 再随 Unicode 校验更新字段描述。文档版本不会自动改变代码，这里是同步已经实现的行为。

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

也可复用第十一章的 Swagger：打开 `/docs`，展开 GET /captures，点击 Try it out，再点击 Execute，查看 Server response 而不是下方静态 Example Value。

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

## 19.3 写入、输入边界与错误如何连接起来

### 一次创建的完成点放在哪里

CapturesService 已经在 `await this.store.insert(capture)` 成功后才返回对象；现在 insert 等待的是真实数据库写入。Prisma 的 create 显式提供 id、归属、原文和时间，只取回 id。没有把请求体展开到 data，也没有接受调用方提供的 userId、id、createdAt。

为什么不先查询 ID 是否存在，再写入？“查询时没出现”无法保证另一并发操作稍后不会写入；主键才是共同的最终约束。当前 UUID 由服务器生成，用户没有选择 ID，碰撞并不是调用方能修正的业务冲突。本章遇到它会视为内部失败，而不是机械地把所有唯一约束异常转成 409。业务以后引入用户可选择的唯一名称时，才根据那个具体规则映射可理解的冲突。

一次 INSERT 已由 PostgreSQL 作为语句事务处理，本章不为了展示 `$transaction` 再套一层。它能保证该语句的行和约束一起成立，不能把“写入”与“客户端收到了响应”变成原子动作；这两个完成点分别属于数据库和网络。

### 有效 JSON 不等于可以原样存入 text

第十六章支线已经观察过两个边界。PostgreSQL text 不能保存零字符 U+0000；JavaScript 字符串又允许孤立 UTF-16 代理项，转成 UTF-8 时可能被替换为 U+FFFD。请求字节是合法 UTF-8，仍然可以通过 JSON 转义 `\ud800` 产生这样的 JS 字符串。

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

### 从数据库异常得到业务上诚实的结果

把所有异常转换成 undefined，是持久化接入中很危险的“兼容”：数据库掉线会变成 404，列表失败会变成空数组，调用方可能据此覆盖本地数据。只有成功查询后没有行，才是不存在。

19.1 已经接好 `DatabaseService.run`、`database-errors.ts` 与 HTTP 出口，现在用业务结果检查这套分类是否诚实。Prisma code、raw 查询的 meta.code 和适配器 cause 中的 SQLSTATE 属于不同层，不能只看最外层异常名字。资源层只记录允许的诊断字段，再由 HTTP 层区分暂时不可用的 503 与其他内部故障的 500。

当前几类结果应按业务原因理解：

| 事实 | 当前公开结果 | 应当调查什么 |
| --- | --- | --- |
| 输入不符合已声明规则 | 400／VALIDATION_ERROR | 字段问题；不进入数据库写入 |
| 合法范围内详情查询成功但没有行 | 404／CAPTURE_NOT_FOUND | ID 与固定归属范围 |
| 连接中断、连接池等待到期、容量不足或语句超时 | 503／STORAGE_UNAVAILABLE | 连接、池容量、阻塞及执行时间 |
| 表／列缺失、权限不符、未预期约束失败 | 500／INTERNAL_ERROR | 目标库、迁移、应用模型与维护操作 |
| 应用已进入关闭阶段，明确未接收工作 | 503／SERVICE_DRAINING | 进程生命周期；不同于执行中的存储失败 |

![Postman：存储连接不可用时，详情请求返回 503](images/postman-storage-unavailable.jpg)

这张图展示数据库连接不可用时的详情查询：API 仍接收 HTTP 请求，但无法完成读取，因此返回 `STORAGE_UNAVAILABLE`，不能用 404 或空对象假装查询成功。图中的几十毫秒不是后面持锁实验的两秒／三秒等待证据；具体原因需用同次请求的日志区分。detail 是读写共用的保守提示，本次方法为 GET，并不表示发生了未知写入。恢复连接后重新发送同一个 GET，再判断记录是否存在。

Prisma 的错误码不是 PostgreSQL SQLSTATE。模型 create 的主键冲突通常是 P2002、外键冲突为 P2003；相同数据库错误在 raw SQL 路径可能先表现为 P2010，再在元数据里携带 SQLSTATE。本版本 CHECK 在模型写入中可表现为 P2039。不要只背错误码表，把发生位置与实际规则一起看。

固定用户不存在导致的外键失败，此时也不是“调用方传错了 userId”：调用方根本不能选择这个字段，应调查开发数据或应用状态。表被删、列名错误、角色无权限都不因重试而自然恢复，所以不统一标成“暂时不可用”。未知异常保守走 500，不假装已经理解它。

pg 8.16.3 有两种池连接等待失败只提供固定 message，没有稳定 code；本章对这两个已核对的固定文本集中做兼容分类，日志只输出 POOL_TIMEOUT。这个小范围的版本适配不能扩展成 `message.includes('timeout')`：后者会把完全不同的故障随意混在一起。升级驱动时要再次核对实际失败形状。

503 也不授权前端自动重试 POST。数据库可能已经提交，而响应在网络上丢失；相同正文重复 POST 又会生成新 ID。响应的 detail 明确提示写入结果可能未知。本章优先按已知 ID 和数据库事实核对；真正的请求幂等需要预先保存可识别同一次业务意图的依据，后面的幂等章节继续实现，不能拿请求日志 ID 冒充幂等键。

### 从程序中的查询回到 SQL 编辑器

排错时先固定一个虚构输入，例如搜索 `%`。在 `.env` 将 `DB_QUERY_DEBUG=true`，结束并重新运行 dev；只有明确 development 模式才能打开。日志等级设为 debug 后会看到 `database.query` 的耗时，SQL 和参数仍不打印。

在 DatabaseService 的 `$on('query', event => ...)` 回调设置断点，发同一个查询。展开 event.query、event.params 与 event.duration：SQL 结构中应看到参数占位，参数包含固定用户、搜索词和可选 limit；核对 WHERE、ORDER BY 和 LIMIT，而非只确认“SQL 有输出”。事件在查询完成后到达，不能靠它定位一条仍在锁上等待的语句；等待时看 19.4 的活动会话。

![VS Code：在 query 回调观察查询事件，常态日志只取耗时](images/vscode-query-event.jpg)

左侧 Local 展开 `event` 后可以看到 `query`、`params`、`duration`；Watch 中的 `JSON.parse(event.params)` 把参数字符串展开为数组。这次虚构查询有三个参数，依次是固定用户、`%`、`10`。窄侧栏会截断长值，可展开 Watch，或在 Debug Console 分别求值 `event.query` 和 `JSON.parse(event.params)`，不要把省略号当成实际 SQL。图中的约 17.29 毫秒是该次事件的查询耗时，不包含随后停在断点上的观察时间；黄色行也能看到写入日志的只有 `durationMs`。

复制占位 SQL 到 DBeaver 直接执行，会因为没有参数绑定而失败。应重新表达为 PREPARE 的参数类型和 EXECUTE 的值，配套脚本已经保存等价形式：

```sql
PREPARE ch19_list(uuid, text, integer) AS
SELECT id, original_text, created_at
FROM public.captures
WHERE user_id = $1 AND strpos(original_text COLLATE "C", $2) > 0
ORDER BY created_at, id
LIMIT $3;
EXECUTE ch19_list('10000000-0000-4000-8000-000000000001', '%', 10);
DEALLOCATE ch19_list;
```

在同一 DBeaver 会话逐条运行，最后释放预备语句。若名字已存在，说明上次中断后未执行 DEALLOCATE，先处理该会话的遗留状态再重做。对当前虚构输入比较 SQL 行和 HTTP items：SQL 正确但 HTTP 错，回到投影、Date 与响应 Schema；两边都错，先核对连接目标、参数和筛选含义；SQL 有行而 HTTP 没有，还要核对归属范围和实际 q，不急着怀疑缓存。

需要查看失败异常时，在 DatabaseService.run 的 catch 处暂停，查看 code 与必要的约束信息，再到数据库重现对应的最小操作；不要把完整错误对象复制进公共日志。结束研究后恢复 DB_QUERY_DEBUG=false 并重启。生产拒绝开启该开关，避免临时诊断习惯变成默认数据泄漏渠道。

## 19.4 连接池、等待与关闭的真实顺序

### 五个连接不是五个用户

数据库连接是可复用的会话资源。一个用户可以同时发多个请求，一个请求也可能顺序执行多条 SQL；因此连接池上限不能按“有多少用户”直接指定。查询短时占用连接，完成后归还；下一次请求可使用同一连接。长期停在事务里、慢查询或锁等待都会延长占用时间，即使 Node 事件循环没有被阻塞，后来的数据库工作仍然会排队。

`max=5` 是当前本机服务的初始容量选择，不是数据库最佳实践的固定数字。若一个进程有五个连接，四个进程最多就是二十个，再加后台任务、迁移、DBeaver 与管理员连接。应从实例可用连接预算中给它们分配额度并预留维护空间；单纯把每个进程都调大，可能把本地排队变成数据库整体过载。

池上限也不等于请求队列上限。当前 pg 可以让更多请求等待，连接等待期限使一次等待有终点，却不能替代未来的入口并发限制。小范围本机实践可以观察这套机制；公开服务的容量控制需要结合真实负载继续设计。

`connectionTimeoutMillis=2000` 限定新连接建立与池获取的等待；`statement_timeout=3000` 由服务器约束单条语句执行时间，包含锁等待；`idleTimeoutMillis=10000` 回收已经归还、空闲十秒的连接，不会中止正在执行的查询。三个值不是同一种“接口超时”，也不保证请求总耗时最多三秒：同一次请求可能先排队，再执行，还要经过 Node 与网络。

服务端超时真正取消数据库语句，与前端停止等待或 `Promise.race` 胜出不同。后两者不自动取消已接受的写入。读者如果希望把多种期限合成整体预算，需要先分清执行到了哪里，支线 19A 再展开这些差别。

### 在 DBeaver 看到 API 自己的连接

在另一个独立的 `epp_owner` 连接打开 `02-observe-connections.sql`，保持自动提交，重复执行：

```sql
SELECT pid, application_name, state, wait_event_type, wait_event,
       pg_blocking_pids(pid) AS blocked_by
FROM pg_stat_activity
WHERE datname = current_database() AND usename = current_user
  AND application_name = 'epp-api'
ORDER BY pid;
```

application_name 来自池配置。DBeaver 的连接不在这个池里，所以可以在 API 堵住时继续观察。刚发完列表，一条连接可能显示 idle；十秒后池回收空闲连接，结果可能为空。不要要求启动后必须恰好五行，也不要把空闲连接减少误判为服务退出。

![DBeaver：列表请求完成后，epp-api 连接空闲且没有阻塞者](images/dbeaver-api-idle.jpg)

图中 `app` 是 application_name 的简短别名；`idle` 配合 `ClientRead` 表示服务器在等客户端下一条命令，`blocker={}` 表示此刻没有阻塞 PID。它证明 API 的数据库连接仍存在，不证明连接池当前还有多少排队请求。

`active` 只表示当前正在执行某条命令，可能正在等锁；要结合 wait_event 和 blocked_by 判断。数据库里的 idle 表示服务器当前没有执行 SQL，不保证应用已经把该连接归还到池。池的 total、idle、waiting 是进程内计数，pg_stat_activity 是服务器会话状态，它们不是同一份状态表。

每次观察要重新执行查询，不只是回到旧结果标签。默认自动提交避免观察者长期停在事务中使用过期的统计快照。我们没有把 query 原文放进这个观察脚本，避免普通诊断时顺带展示业务值。

### 让“数据库执行等待”和“池等待”分别失败一次

只在自己的独立开发库做这一轮，暂停其他写入。先临时设 `DB_POOL_MAX=1`，重启 API，确认 database.ready 与 app.ready；必须先启动，再持锁，否则启动探测也会被阻塞。

在 DBeaver 单独一个编辑器核对 epp_dev 与 PID，然后分组执行 `03-hold-lock.sql` 的前三步：

```sql
BEGIN;
SET LOCAL idle_in_transaction_session_timeout = '15s';
LOCK TABLE public.captures IN ACCESS EXCLUSIVE MODE;
```

锁放在事务中，未结束时会阻止其他会话对 captures 的普通查询。它只制造暂时等待，不修改数据。15 秒保护针对持锁后空闲的事务，防止中断操作后长时间忘记回滚；它不是上面 API 池的超时。

拿到锁后，在 Postman 两个标签页接近同时发送 `GET /captures`，间隔尽量小于一秒。第一条取得唯一连接，进入数据库等锁；第二条没有连接，在 Node 的池中排队。第三个 DBeaver 观察会话重新执行活动查询，会看到第一条被阻塞的 API 会话，通常只见一条 epp-api 连接：第二条请求尚未进入数据库。

![DBeaver：API 会话 active，但正在等待 relation 锁，阻塞者 PID 可见](images/dbeaver-api-lock-wait.jpg)

这张数据库侧补拍图显示 `active`、`Lock`、`relation` 以及非空的 `blocker`。查询仍限定 `application_name='epp-api'`；`blocker` 是 `pg_blocking_pids` 的别名。它与下方 Postman 图分别记录同一种等待实验，PID 和请求 ID 不跨轮对应。仅凭这一行看不到 Node 池内排队的第二条请求。

预期结果是：第二条约两秒后池获取到期；第一条约三秒后由服务器 statement_timeout 取消。二者均返回 503／STORAGE_UNAVAILABLE，但安全日志的数据库代码与等待阶段不同，第一条 raw 查询通常为 P2010 并在内部携带 57014。Postman 中响应耗时也包含其他开销，不要求刚好等于整数秒。

![Postman：后发请求等待连接池约两秒后返回 503](images/postman-pool-timeout.jpg)

![Postman：先发请求在数据库等锁约三秒后返回 503](images/postman-statement-timeout.jpg)

两张图来自同一轮并发观察：请求 A 先发出，请求 B 约 0.60 秒后发出，耗时分别约 3.03 秒、2.03 秒。图中加 `limit=1` 只是缩短成功响应，不会绕过表锁；3249 是本轮 API 端口。两份 Problem 都是 `STORAGE_UNAVAILABLE`，单看响应正文或耗时不能确定等待层次。应再用各自 `X-Request-Id` 对照日志：这轮 B 对应 `POOL_TIMEOUT`，A 对应 raw 查询的 `P2010`。结合已知持锁步骤，才能解释两个相近的失败为什么需要不同排查入口。图中持锁会话的空闲保护为 60 秒，API 的两秒／三秒期限未变；跟做按上面的 15 秒保护即可。

下面摘出上述两张 Postman 图所对应的实际 `database.failed` 日志字段，省略外层时间、进程和日志级别：

```json
{"event":"database.failed","requestId":"a96d9b40-22e3-42d2-be8f-34321bed7e93","code":"POOL_TIMEOUT","operation":"list","total":1,"idle":0,"waiting":0}
{"event":"database.failed","requestId":"03ddf028-1054-4750-8543-93c8df5c72ee","code":"P2010","operation":"list","total":0,"idle":0,"waiting":0}
```

错误日志写出时，请求已经退出对应的等待，因而 `waiting=0` 不表示它之前没有排队；第二行的 `total=0` 也不能推翻此前连接正在等锁的观察。先按 requestId 对齐请求，再结合错误码和发生阶段读取这些瞬时计数。

把这两个请求放在同一张时序图中，等待位置就不同了。图中的两秒从请求二开始获取连接时计算，三秒从请求一的 SQL 到达服务器后计算；图不按耗时比例绘制。

```mermaid
sequenceDiagram
    participant H as DBeaver 持锁会话
    participant A as API 请求一
    participant Q as pg.Pool：max=1
    participant B as API 请求二
    participant P as PostgreSQL
    H->>P: BEGIN；持有 captures 强表锁
    A->>Q: 获取连接
    Q-->>A: 交付唯一连接
    A->>P: SELECT，等待表锁
    B->>Q: 不到一秒后申请连接
    Note over Q,B: 请求二在池中排队，尚未发送 SQL
    Q-->>B: 约两秒：获取连接超时
    Note over B: HTTP 503
    P-->>A: 约三秒：statement_timeout 取消语句
    A->>Q: 结束占用，释放或移除连接
    Note over A: HTTP 503
    H->>P: 原持锁会话 ROLLBACK
```

因此，活动视图能看到请求一的阻塞会话，却看不到请求二的 SQL；后者还没有进入服务器。两个 503 相同，不代表故障发生在同一层。请求一超时也不会替 DBeaver 结束持锁事务，最后一条 ROLLBACK 仍由持锁者负责。

若两条都得到语句超时，先确认池确实为 1，环境文件修改后整个 dev 是否重启；若只有一条请求，检查是否复用了同一个正在发送的标签；若直接成功，确认锁仍然持有且连到同一库。不要靠重复加锁直到出现红字来验证假设。

观察后立即回到**原持锁编辑器**执行 `ROLLBACK`。如果十五秒保护已断开会话，事务和锁已随断开回滚，重连再查；不要在观察会话中执行 ROLLBACK 并误以为释放了别人的锁。重新发送列表，应恢复 200；确认没有残留阻塞，把 DB_POOL_MAX 恢复 5，重启 API。实验没有新增、修改或删除业务行。

![Postman：原持锁事务结束后，同一列表请求恢复 200](images/postman-lock-recovered.jpg)

URL 与 `limit=1` 保持，恢复后返回已有记录。这里比较的是锁释放前后的请求结果，不是改 URL 换到另一个正常服务。恢复 200 还需配合活动／锁查询确认没有残留阻塞；最后恢复连接池配置，不把实验用的单连接限制留在日常环境。

### 为什么关闭必须晚于已经接受的工作

第十三章的 serve 已负责信号：标记 draining，停止 HTTP 接收，等待在途响应和 ApplicationState 追踪的工作，再调用 app.close。Nest 随之调用 DatabaseService.onModuleDestroy。这里不再调用 `enableShutdownHooks()` 登记第二套信号协调，避免两个关闭流程同时争夺顺序。

为什么不在收到 SIGTERM 时立刻 `$disconnect()`？已接受的 POST 可能还在使用连接；提前断开会把本可完成的工作变成错误或未知结果。先停止接收、再排空、最后释放，才使资源寿命覆盖使用它的工作。HTTP 客户端取消也不等于数据库工作停止，因此原有 ObservedCaptureStore 的追踪仍保留。

本章主动创建外部 pg.Pool，明确设置 `disposeExternalPool:false`。因此 `$disconnect()` 负责 Prisma 侧，随后 `pool.end()` 负责自有池；finally 保证前者失败时仍尝试释放后者。不能既让适配器关闭外部池，又自行不加区分地结束一次；也不能以为 `$disconnect()` 必然替应用结束所有外部池。

正常关闭日志应依次看到 app.draining、database.closed、app.stopped。在观察连接中重新查询，epp-api 会话应消失，DBeaver 会话仍在。如果关闭期限到达，第十三章的外层期限会以非零状态强制终止；SIGKILL 也不会执行 JS 钩子。操作系统连接断开后，数据库会清理会话和未提交事务，已经提交的行仍然保留。关闭钩子有助于正常完成工作，不能替代持久化的恢复设计。

## 19.5 保留事实，分别核对开发重启与交付产物

先记下刚创建的实际 ID、原文和时间。停止 API，保持 PostgreSQL 与 DBeaver 运行。在 DBeaver 查询该 ID，行仍在；再运行 `npm run dev`，通过 Postman 详情读取，三个字段应与停止前一致。接着保存一个无业务变化的源码编辑，等待自动编译、旧进程退出、新进程 app.ready，再读同一 ID。自动重启不会清空数据库，也不会自动重放你的 POST。

![Postman：开发进程自动重启后仍读到原来的记录](images/postman-after-dev-restart.jpg)

把这张详情图和 19.3 创建特殊字符原文的响应对照：完整 ID 仍为 `033ea9e4-ade9-4746-9aac-e11845427b05`，原文和 `01:23:14.553Z` 都保持。3251 是此处开发进程端口。先在终端确认旧 PID 退出、新 PID 出现 `app.ready`，再发送请求；仅有 200 响应无法证明重启确实发生，也不能证明自动重放了创建请求。

这次观察的重点是资源独立：API 进程管理连接，PostgreSQL 管理数据，DBeaver 只是另一个客户端。关闭客户端不停止服务端，关闭 API 不撤销已提交记录。持久化也不等于备份，误删和磁盘故障仍需要后面的恢复方案。

### 接入后，原来的小检查怎样调整

第十二章已有一条非法 JSON 请求检查，原先以“新进程列表为空”为起点。现在不能再假设空库，更不能为了测试先清表。它改为先保存当前列表，发送非法 JSON，再比较列表未变。测试连接也从开发连接中分开：`NODE_ENV=test` 只选择程序模式，不会替我们选择另一个数据库。后续加入写入与回滚检查时，这个边界尤其重要。

首次将配套 `test/database.env.example` 复制为项目根目录 `.env.test`，将 `TEST_DATABASE_URL` 填为已应用本章迁移、含固定开发用户的独立校验库连接，可以沿用第十八章建立的 VERIFY；保持 `DB_QUERY_DEBUG=false`。已有配置文件只补字段，不覆盖；凭据仍不提交。测试不自动建库、迁移或清表，也不能仅给 DEV 换一个环境变量名就称为隔离。

从前章手写时，先建立 `test/database.env.example`，内容如下，再按上述方式复制并填写本机密码；保留示例中的占位值：

```dotenv
TEST_DATABASE_URL="postgresql://epp_owner:REPLACE_WITH_URL_ENCODED_PASSWORD@127.0.0.1:55432/epp_migration_check?schema=public"
DB_QUERY_DEBUG=false
```

新增 `test/database-env.mjs`，并在 `test/captures.test.mjs` 顶部加入 `import './database-env.mjs';`。以后新增需要数据库的测试也从这个入口加载：

```js
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl?.trim()) {
  throw new Error('TEST_DATABASE_URL is required; use an isolated, migrated verification database.');
}
// Never fall back to the application's development connection.
process.env.DATABASE_URL = testUrl;
```

`package.json` 的 test 命令改为 `npm run build && NODE_ENV=test node --env-file-if-exists=.env.test --test test/*.test.mjs`。它只加载测试配置，不读取开发 `.env`；缺少明确的测试连接时，在打开应用前退出。测试进程用 `TEST_DATABASE_URL` 替换继承的 `DATABASE_URL`，日常开发和生产入口不受影响。

进程中已有的同名变量优先于文件。使用文件前先执行 `unset TEST_DATABASE_URL DB_QUERY_DEBUG DOCS_ENABLED`，核对文件指向的主机、端口与库名，再运行 `npm test`，不要打印含密码的完整连接串。运行期间暂停该校验库的其他写入，否则合法并发变化会破坏前后比较。只运行单个文件时使用 `NODE_ENV=test node --env-file-if-exists=.env.test --test test/captures.test.mjs`，同样必须提供测试连接。

这仍是一条最小回归证据，不扩建测试工程。表约束、特殊字符、池等待和重启分别通过前面的实际操作观察。旧章节独立创建 MemoryCaptureStore 的机制示例仍可以研究内存行为；第十四章改变为数组的参考补丁应在对应章节快照应用，不能把针对旧组装代码的补丁直接套到本章数据库分支。

### 构建不应该依赖一个正在运行的数据库

本章 `prebuild` 仍只生成客户端，再编译与复制配置。执行 `npm run check` 不需要 DATABASE_URL，不做迁移，不插 seed。这样构建产物可以在无数据库访问权的构建环境完成，真正目标数据库由运行环境指定。

生产入口仍是 `npm start`：显式 production，只运行 `dist/src/server.js`，不开 Inspector、不监听源码、不读取开发 `.env`。如果想在本机单独核对产物，可使用：

```bash
npm run build
NODE_ENV=production PORT=3001 node --env-file=.env --enable-source-maps dist/src/server.js
```

这条命令是显式使用开发连接的**本机产物检查**；DB_QUERY_DEBUG 必须先设为 false。Postman 复制集合并把 baseUrl 改为 3001，重复已有详情与一次合法创建，在 DBeaver 核对；不带 docs override 时 `/docs` 应不可用。它与 dev 可能连接同一个开发库，所以两边会看到相同的新行，不再有“两份进程各自一份 Map”的效果。

![Postman：生产运行入口读取同一条已持久化的记录](images/postman-production-read.jpg)

这次请求发往 3250，开发请求发往 3251；返回的 ID、原文和时间保持一致，因为两个进程连接同一份数据库事实。端口变化本身不证明生产模式，仍需核对上面的启动命令、环境和进程参数，确认没有 Inspector 与源码监听。此图证明本机产物的读取路径，独立依赖安装仍按下一步验证。

要验证独立运行单元，在新的临时目录只复制 `dist/`、package.json、package-lock.json、.npmrc，安装 `npm ci --omit=dev`；不复制源码、秘密文件和已有 node_modules。生成的 Prisma JS 已随 dist 带上，运行时仍需要 @prisma/client、adapter-pg 与 pg。通过目标环境注入 DATABASE_URL、端口等再运行 npm start；核对成功后停止该进程，保留数据库数据。若依赖安装过程中涉及受控安装脚本，沿前章的固定版本批准规则处理，不因缺少开发 CLI 而在运行目录临时生成客户端。

正式迁移仍是单独任务，使用有 CLI 和迁移目录的工具环境执行；API 启动不自动 migrate deploy。正式部署要为运行库准备真实数据和适当权限，运行角色与迁移所有者应分开，不能直接把本章 epp_owner 的开发连接暴露到公网。当前固定用户路线也尚未提供登录和用户隔离，生产模式说明的是运行方式，不是已经满足开放服务条件。

如果重启失败，按失败位置恢复：配置字段错误先改配置并重启父进程；数据库不可达回到第十五章核对实例与身份；缺表、缺列查第十八章的实际结构与迁移历史；固定用户缺失核对开发数据。已存在两张表但忘记登记历史，不能由 API 的启动成功反推历史已经正确。不要用 reset、重新 seed 或切回 Map 掩盖这些差异。

完成这一章后，HTTP 输入、业务规则、存储适配、连接资源和数据库事实已经接成同一条可观察的链。下一章增加中文意图时，会在这条链上保留旧记录、追加迁移并更新接口，不再通过换库或重新开始绕过兼容问题。

本章完成代码分支为 `part-03/chapter-19`。

## 知识支线

[支线 19A：等待结束后，写入到底发生了没有](side-01-timeouts-and-outcomes.md)区分池等待、数据库执行、HTTP 等待与提交结果，用具体时序推导取消、重试和幂等的责任。阅读约 20～25 分钟，不另设操作。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| CaptureStore／PrismaCaptureStore | 维持业务依赖并实现数据库适配 | 类型相同不保证顺序、失败与字面含义相同 |
| PrismaPg／pg.Pool | 连接 ORM 与 PostgreSQL 驱动 | 池按进程、资源实例分别计数 |
| DATABASE_CONFIG | 一次解析运行连接与池选项 | CLI 配置不自动进入服务；错误不输出值 |
| `select`／`CaptureGetPayload` | 控制读取列与生成类型 | 不能替代公开输出投影 |
| `Prisma.sql`／`Prisma.empty` | 组合固定结构与参数值 | 不插入用户 SQL，不先做普通字符串插值 |
| `$queryRaw<T>` | 表达字面搜索与明确排序 | 泛型不校验真实查询结果 |
| `strpos`／`COLLATE "C"` | 大小写敏感字面子串 | 不做 LIKE 通配、大小写折叠或规范化 |
| `options: '-c TimeZone=UTC'` | 每条新池连接固定 UTC 会话 | 当前适配器的时间兼容要求；用数据库 epoch 交叉核对 |
| `Date.toISOString()` | 时间点映射为公开 UTC 字符串 | 不用本地显示格式作为协议 |
| `String.isWellFormed()`／NUL 判断 | 拒绝不能原样表示的文本 | 原文与 q 同步；不静默修复 |
| `onModuleInit`／`onModuleDestroy` | 验证资源并在排空后释放 | 初始化失败也清理；共享关闭 Promise |
| `$connect`／真实查询 | 初始化客户端并核对实际依赖 | connect 本身不代替表、列和数据检查 |
| `$disconnect`／`pool.end` | 按所有权释放客户端和外部池 | 与 disposeExternalPool 配置保持一致 |
| `connectionTimeoutMillis` | 有界连接建立与池获取等待 | 不等于语句或 HTTP 总超时 |
| `statement_timeout` | 服务器限制单条语句执行 | 包含锁等待；不同于客户端放弃等待 |
| `idleTimeoutMillis` | 回收池中闲置连接 | 不终止正在执行的工作 |
| `pg_stat_activity`／`pg_blocking_pids` | 查看服务端会话与阻塞 | 池中排队请求尚没有对应执行会话 |
| query 事件／安全错误码 | 本机诊断 SQL、参数和耗时 | 日志不直接输出查询原文和错误对象 |
| 503／500／404 | 区分临时故障、内部失约与成功查询无行 | 错误响应不证明写入未发生 |

官方查阅：[Prisma 7 驱动适配器](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers)、[Prisma PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)、[Prisma raw queries](https://www.prisma.io/docs/orm/v7/prisma-client/using-raw-sql/raw-queries)、[错误参考](https://www.prisma.io/docs/orm/v7/reference/error-reference)、[查询日志](https://www.prisma.io/docs/orm/v7/prisma-client/observability-and-logging/logging)、[pg.Pool](https://node-postgres.com/apis/pool)、[pg.Client](https://node-postgres.com/apis/client)、[Nest 生命周期](https://docs.nestjs.com/fundamentals/lifecycle-events)、[PostgreSQL 18 超时](https://www.postgresql.org/docs/18/runtime-config-client.html)、[活动统计](https://www.postgresql.org/docs/18/monitoring-stats.html)。

[上一章：Prisma 模型与迁移](../chapter-18-prisma/chapter.md) · [下一章：Migration](../chapter-20-migrations/chapter.md) · [返回第三篇](../README.md) · [返回全书目录](../../README.md)
