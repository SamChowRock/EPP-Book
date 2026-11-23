# 第 22 章 管理连接池、等待与服务关闭

上章从 API 读到了旧记录，并由 DBeaver 独立核对了新建记录。现在保留同一数据库和已保存的 ID，沿用 `part-03/chapter-22` 的同一份程序，观察这一次读写实际占用了哪些资源。一个请求迟迟不返回时，先判断它有没有取得数据库连接，再决定应到哪一侧找证据。

阅读约 125～150 分钟；用明细还原列表、观察连接与阻塞、核对重启和产物另加约 55～70 分钟。

## 22.1 在 Nest 中明确数据库资源的所有者

先从[上章的运行连接配置和存储组装](../chapter-21-existing-records/chapter.md)恢复同一 API。以下实现已经接入；对照源码找出某次初始化或查询失败时，哪些字段会进入公开响应和服务日志。

### 先接好故障出口和安全日志

数据库访问失败与成功查询没有行，是两件不同的事。连接资源在启动和查询时都可能失败，因此先定义它们能交给上层的错误，再创建使用这些定义的资源对象。原始 message、meta、stack 和参数可能含有原文或连接信息，不直接写入日志。

先看一个请求结束后的问题。Controller 已把列表送回 Postman，刚才借出的连接接下来归谁？沿上章的注入关系往回找，`PrismaCaptureStore` 拿到的是 `DatabaseModule` 导出的同一个 `DatabaseService`。请求只在执行查询时借用资源。若在每次列表请求里都建一个上限为五的池，同时来的十个请求就各有一份限额；若在每个请求的 finally 里关闭共享池，下一个请求又会拿着已经关闭的池。这里把建池和关池都交给创建这份服务的应用实例，查询结束只需让驱动归还连接。

可以从正在运行的两次详情请求倒推这个决定。第一次读素材甲，第二次读素材乙，需要隔开的东西是两个路径参数、各自的响应和日志中的请求号。谁先完成都不能把甲的结果送给乙。两次查询却可以先后经过同一条已经认证的连接，因为每次送去的语句都带着自己的查询条件。连接保存的是数据库会话的状态，既不保存哪一个网页正在看详情，也不会因为换了一条连接就自动换一个素材所有人。当前归属来自查询里的固定用户条件。以后接入登录，业务用户仍要从每次请求取得，不能靠“这个连接上一次服务过谁”来猜。

共享到什么程度才合适？假设在同一个进程里先后建立两个测试应用，一个指向开发库，一个指向校验库。如果用文件顶层的全局变量缓存第一份客户端，后一个应用的配置即使正确，也可能通过前一个应用的连接读数据。关掉其中一个测试又可能使另一个测试突然失去连接。现在从模块取得服务，两套独立应用各自根据自己的配置创建资源。相反，同一应用内的详情和列表即使由不同对象处理，也都注入那一份服务。要判断改动有没有破坏这层关系，沿着对象的构造位置数有几次建池，再问每一份池最后是由哪个应用关闭的。仅数有几个地方导入了类，得不出实例数。

池中复用的会话还带来一个比连接数更隐蔽的问题。假如在启动代码里随手发一句设置时区的语句，再依次读取两次详情，两次可能恰好借到那条改过的连接，时间看起来一直正常。等两个请求重叠，池新建第二条连接，它只接受建连时给定的配置，未曾执行过第一条连接上的设置。同一个部署因而可能随负载改变时间表示，单请求调试很难抓住。往下读构造函数时留意时区选项所在的位置。把它交给建立每一条连接的驱动，才能覆盖后来增开的连接和空闲回收后重建的连接。在自己的数据库编辑器里改显示时区，同理只影响那个会话。

下面按依赖顺序读已经接入的 `src/database-errors.ts`。资源初始化和查询都使用这套分类：读取结构化错误码，只对明确认识的连接、容量与超时失败标记 temporarily unavailable；其他失败保留为内部故障。

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

新增 `src/database.service.ts`。先把完整资源生命周期放在一起看，22.4 再用实际等待与关闭观察这些选项：

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

还有一种失败发生在两个请求之间。连接已经归还，数据库此时重启，空闲连接也可能收到断开通知。上一个请求的 try/catch 早已结束，下一个请求甚至还没有到达，所以由池监听 `error`，记录 `database.idle_error`。这能解释为什么日志里出现了数据库事件，而 Postman 上一次 GET 依然是 200。要判断服务是否恢复，需要看后续请求能否重新取得连接并完成查询。

日志中的 `DEV_USER_MISSING` 指向前章开发用户准备；`P2021`、`P2022` 等则应回到实际表、列和连接目标。不能把所有启动失败都解释成“密码不对”。对外不暴露内部异常；本机从安全错误码、连接身份和 DBeaver 结构逐步定位。

把启动探测里的两次读分开理解，能解释一种容易修错的情况。第一条按主键只找一个用户。数据库应答了、查到行，才能继续。若查询顺利完成却没有行，程序自己构造缺用户的错误，这个错误是应用对数据的要求。第二条只取至多一条素材，空素材表也能通过，因为建好账号还没录入素材是合法状态。但即使表里没有行，服务器也必须先解析表名、列名并检查读取权限。只要列已经被改名，一条数据都没有也会失败。因此给空表补一条测试素材解决不了列名错误，反而会改变原本要检验的起始状态。反过来，把这两次查询都换成读取常量一，数据库可以在完全没有这两张业务表的情况下回答，启动绿灯就失去了含义。

为什么不在探测中试写再删除一条素材？应用每重启一次就会进行一次人工制造的业务写入，删除失败还会留下假素材。就算把试写包在回滚事务里，也额外要求特定的写权限和可取得的锁，启动成本和阻塞关系都改变了。这里选的读操作只承担开门前最低限度的检查。写路径由带来真实业务输入的接口和独立校验环境覆盖。由此也能解释一种合理的现场现象：启动通过，列表能打开，新增失败。接手人应沿新增所需的权限、外键及输入约束查起；一次绿色启动日志没有检验过这些条件。

配置解析也有类似的边界。打开配套的 `database-config.ts`，跟一遍从环境字符串到驱动选项的变化。池上限没给时使用默认值，给了零或小数就应在打开连接前失败。如果用常见的“转成数字，假值就取默认”写法，零和缺省会变成同一个结果。运维人员以为自己停用了连接，程序却带着五个名额启动了。配套先验证输入形式再转换，错误日志给出字段名。连接地址中的库名交给驱动，而本章允许的公共模式由适配器显式选择；解析时会移走地址的查询部分。排查时看到程序与命令行的配置形式不同，要追到各自的最终消费者。尤其不要为了证明它们相等，把包含密码的两个地址打印出来逐字对照。

最后再看关闭函数返回的值。若只保存一个“正在关闭”的布尔量，第一次调用刚开始等断开，第二个调用者看到标记就直接返回，外层可能已经报告停止，实际上连接还在收尾。保存那一次工作的承诺对象，后到的调用者可以等待同一结果，包括同一次失败。这里还特意把结束外部池放在最终清理分支里。若断开客户端时发生异常，执行流仍有机会到达池的释放动作，后面的成功日志则不会正常写出。从日志判断一次启动失败时，先读原因，再检查资源是否收尾；只有关闭事件而没有就绪事件，完全符合“取得了一部分资源后退出”的顺序。

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

## 22.2 从已接入的旧记录定位一次查询

旧记录的行、时间点与 HTTP 投影在[上一章](../chapter-21-existing-records/chapter.md)核过。本节使用同一查询和相同用户，追踪数据库执行的语句及绑定参数。

### 从程序中的查询回到 SQL 编辑器

排错时先固定一个虚构输入，例如搜索 `%`。在 `.env` 将 `DB_QUERY_DEBUG=true`，结束并重新运行 dev；只有明确 development 模式才能打开。日志等级设为 debug 后会看到 `database.query` 的耗时，SQL 和参数仍不打印。

在 DatabaseService 的 `$on('query', event => ...)` 回调设置断点，发同一个查询。展开 event.query、event.params 与 event.duration：SQL 结构中应看到参数占位，参数包含固定用户、搜索词和可选 limit；核对 WHERE、ORDER BY 和 LIMIT，而非只确认“SQL 有输出”。事件在查询完成后到达，不能靠它定位一条仍在锁上等待的语句；等待时看 22.4 的活动会话。

![VS Code：在 query 回调观察查询事件，常态日志只取耗时](images/vscode-query-event.jpg)

左侧 Local 展开 `event` 后可以看到 `query`、`params`、`duration`；Watch 中的 `JSON.parse(event.params)` 把参数字符串展开为数组。这次虚构查询有三个参数，依次是固定用户、`%`、`10`。窄侧栏会截断长值，可展开 Watch，或在 Debug Console 分别求值 `event.query` 和 `JSON.parse(event.params)`，不要把省略号当成实际 SQL。图中的约 17.29 毫秒是该次事件的查询耗时，不包含随后停在断点上的观察时间；黄色行也能看到写入日志的只有 `durationMs`。

断点可能先停在你没打算研究的地方。应用还没开始监听时就要读用户和素材列，只看“查询了素材表”很容易把启动探测认成列表。等终端显示就绪再启用断点，只从一个标签发列表。先认语句的用途，再给占位符编号。模型发出的详情查询要收窄到某条素材，而列表要按时间和编号排列多条素材。后者即使本次只返回一行，仍然保留决定先后次序的条件。观察事件时可以据此剔除启动时只为确认列存在而发的读取。不要依靠事件回调一定带着发起请求的上下文来配对，在并发和启动查询交织时，单凭事件出现的相邻位置不足以建立对应关系。

参数数组也需要和当次语句结伴解读。上图的第三项控制行数，是因为搜索片段和限制片段都存在。只去掉搜索词而保留限制时，拼装器会把整段搜索条件移走，限制值就跟在用户之后。若把三参数版本的第二项机械地抄成空字符串，执行的仍是一次带搜索表达式的查询。即使两次碰巧返回同样多的素材，也不能用来核对程序是否正确省略了条件。可以在 Postman 的 Params 中取消勾选搜索这一行，保留限制，重新看这次事件的参数个数和每个占位出现的位置。取消勾选与保留一项空值会产生不同的请求形状，先从实际发出的请求和输入校验判断有没有到达列表查询。

复制占位 SQL 到 DBeaver 直接执行，会因为没有参数绑定而失败。应重新表达为 PREPARE 的参数类型和 EXECUTE 的值，配套脚本已经保存等价形式。接下来的三次取数共用一个准备语句。在同一个 DBeaver 会话中只选中下面的 PREPARE 执行，再单独执行第一条 EXECUTE。配套 SQL 文件在首次执行后有一条释放语句，逐句跟做到第三次结果核对完再执行它。

```sql
PREPARE ch19_list(uuid, text, integer) AS
SELECT id, original_text, created_at
FROM public.captures
WHERE user_id = $1 AND strpos(original_text COLLATE "C", $2) > 0
ORDER BY created_at, id
LIMIT $3;
EXECUTE ch19_list('10000000-0000-4000-8000-000000000001', '%', 10);
```

为什么专门搜索百分号？把上章两条含 `cook` 的种子原文摆在一起，它们都没有百分号。如果把筛选误写为 `LIKE '%'`，两条都会命中；这里 `strpos` 查的是字符的位置，找不到就返回 0，两条都应排除。占位符负责把收到的值完整交给 SQL，选用的运算才决定这个值有没有通配含义。在 Postman 的 Params 把 `q` 的值填成一个百分号，在断点确认收到的参数也是一个百分号。随后只把 EXECUTE 的第二个实参换成 `'cook'`，在 DEALLOCATE 前再执行一次。同一用户下还可能有其他记录，按返回的 ID、排序和 limit 与相同参数的 GET 对照，不把“整库恰好两行”当作验收条件。

若 PREPARE 提示名字已存在，可以确认是自己上轮留下的同名语句后，在当前会话执行 `DEALLOCATE ch19_list;` 再重新准备。对同一输入比较 SQL 行和 HTTP items：两边 ID 集合不同，先核对连接目标、用户、实际 q 和 limit；若 ID 与行序都对得上，只有时间或字段表示不同，再看投影、Date 与响应 Schema。

不熟悉复杂查询时，可以从“我究竟要比较哪一行”开始自己还原。打开配套的 `database/chapter-19/01-inspect-api-data.sql`，先执行开头的连接身份查询，再执行按固定用户取原文的明细。此时结果网格的一行代表一条素材，先用完整编号记下两个候选，肉眼找出哪几条包含所搜字符。若想知道为什么某一条被排除，可以让数据库把判断所依据的数值显示出来。下面在同一个开发库编辑器执行，只读，不限量，故意保留不匹配的行。

```sql
SELECT id, original_text, strpos(original_text COLLATE "C", 'cook') AS pos
FROM public.captures
WHERE user_id = '10000000-0000-4000-8000-000000000001'
ORDER BY created_at, id;
```

从第一行往下读位置列，零意味着没有出现，正数表示第一次出现的位置，开头就是第一个字符。若把条件写成大于一，开头命中的素材会无声消失。现在用手划去位置为零的行，再从余下的行取前一条，便得到限制为一时应该返回的编号。接着把准备语句的第二个参数设为同一个词、第三个参数设为一，与手算比。这样定位差异比反复刷新列表有效：若明细里的位置就与预期不同，要看搜索值和原文；若位置都对而接口选了别的编号，要看排序方向以及限制是在筛选之前还是之后执行。原数据里若恰好每条都匹配，两个执行顺序会给出相同答案，这组输入就没有能力区分实现。

仍用刚才的 DBeaver 会话，单独执行下面第一句，核对它返回的完整 ID 是否与手算一致。完成 `%` 限十条、`cook` 限十条和 `cook` 限一条这三次比较后，再执行第二句释放准备语句。

```sql
EXECUTE ch19_list('10000000-0000-4000-8000-000000000001', 'cook', 1);
DEALLOCATE ch19_list;
```

例如按时间从早到晚有“记下菜单”“学会 cook”“再试 cook”三条合成素材，限制为一。先截取第一条再在程序里找词，得到空列表；数据库在同一用户内先筛再取，会返回第二条。去掉限制，两条匹配行都出现，刚才的错误就可能被掩盖。若两个匹配行又恰好同一时刻写入，单凭时间也无法决定哪条应排在前面。物理存储顺序会随执行方式改变，网格今天碰巧排对并不能替接口做承诺。配套以完整编号补足时间相等时的次序，所以对账时应保留有序的编号序列。把两侧结果都转成集合会消除重复和顺序差异，正好抹掉你要找的两种错误。

还有一种差异只在输出阶段出现。上面的明细保留了数据库列名，列表的裸查询却要用别名把结果交给同一个投影函数。若少写时间列的驼峰别名，数据库照样能查出时间，开发工具里显示的生成类型也可能仍有这个字段，因为泛型表达的是代码预期。实际对象取值为空时，调用时间转换才失败。排查这类问题可以沿同一编号比较三个断点：编辑器结果网格先看时间值是否存在，列表查完后在映射之前看实际对象的键，最后才看对外字符串。若走模型的详情成功而同一素材的列表失败，二者共用公开字段约定，却由不同路径取得行，应该优先检查裸查询的列别名。反过来，若两个入口给出完全相同但偏移数小时的字符串，应拿数据库的时间点作独立依据；两个接口复用同一投影，互相印证有可能只是重复了同一个误差。

做这次对照时还要考虑读取时刻。在点完接口又切到编辑器的间隙，另一个进程可能刚好新增一条命中素材。即使筛选和映射都正确，两次读也各自看到了当时已经提交的数据。如果差一行，先以完整编号查明数据库是否多了一笔提交，暂停自己的其他写入后再读，而不要先把列表排序改掉去迎合旧截图。准备语句使两轮使用相同的结构与参数类型，执行时仍然会读取那一刻可见的数据。断开编辑器再重连还会丢失先前准备的名字；遇到找不到准备语句，在当前会话重新准备即可，无需改动表。

需要查看失败异常时，在 DatabaseService.run 的 catch 处暂停，查看 code 与必要的约束信息，再到数据库重现对应的最小操作；不要把完整错误对象复制进公共日志。结束研究后恢复 DB_QUERY_DEBUG=false 并重启。生产拒绝开启该开关，避免临时诊断习惯变成默认数据泄漏渠道。

## 22.3 从数据库异常得到业务上诚实的结果

把所有异常转换成 undefined，会让数据库掉线变成 404，列表失败变成空数组，调用方可能据此覆盖本地数据。以详情请求为例，配套先检查路径是否符合它接受的小写 UUID 格式。`GET /captures/abc` 在发 SQL 前就能判定没有可匹配的 ID；换成格式正确的 ID，就必须在固定用户范围内查询。后者若成功返回零行才能报 404，若读取中断，则连“有没有这一行”都还没有答案。因而排查“为什么没有查询事件”时，先看实际路径是否走到了数据库。

22.1 已经接好 `DatabaseService.run`、`database-errors.ts` 与 HTTP 出口，现在用业务结果检查这套分类是否诚实。Prisma code、raw 查询的 meta.code 和适配器 cause 中的 SQLSTATE 属于不同层，不能只看最外层异常名字。资源层只记录允许的诊断字段，再由 HTTP 层区分暂时不可用的 503 与其他内部故障的 500。

从调用详情的页面来倒推这个约定会更直观。页面先前已经显示素材甲，现在用户点了刷新。若读取成功且在当前归属范围找不到甲，页面有依据撤去旧详情。若数据库恰好无法应答，页面手里的甲只是尚未得到更新；把它删除再提示“素材不存在”，就把服务端的暂时故障传播成了用户看得见的错误事实。列表也一样，成功取得零条可以显示空状态，未能取得列表应该保留上次成功内容及其时间，并清楚表明刷新失败。界面要作出这两个不同决定，依赖服务端保留“查询有没有完成”的信息。若底层已经捕获一切异常并返回空数组，控制器再仔细检查数组长度也无法还原这个信息。

顺着快照读一次异常经过的路径。资源层的 `run` 把真正异步查询放在 try 内等待，因此数据库稍后拒绝这个操作时，异常会进入本地的 catch。若改成在 try 内直接返回尚未完成的承诺对象，函数已经离开这个保护范围，稍后发生的拒绝就可能绕过这里的分类和日志。这个差别在正常请求上看不出来。资源层向上抛出已经去掉敏感信息的错误，外面的存储观察对象记下是哪种操作失败，再把错误继续抛给 HTTP 出口。于是同一请求可以留下数据库失败和存储失败两条日志，这是同一异常向上传播留下的两个观察点。若把两种日志行数相加当作失败请求数，一次列表失败就可能被算两次。

再回头读错误分类函数，会发现它做了两个不同的选择。判断“能否归入暂时不可用”时，会检查外层及内层的多个结构化代码；挑一个能安全记下的诊断码时，则从允许的形状中按次序挑选。因此假设裸查询外层标示查询失败、内部指出服务器取消了语句，前一个判断可以采用内部依据，日志仍可显示外层码。只看到外层码，无法反推出里面一定是取消；同一个外层码也能包住缺列等问题。定位时可先把响应状态、操作名和日志码放在一起，再查这次是否观察到锁和取消期限。单独拿一条外层码去匹配一张状态对照表，会漏掉正是内层信息决定的区别。

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

假设同事转来一句“新建失败，数据库报冲突”，能让你决定是否让用户改输入吗？先看冲突的字段是谁给的。本章的编号由程序生成，固定归属也由程序填入，用户只提交原文。若违反外键的是那列归属，叫用户反复改原文不会改变任何一个参与外键检查的值。即使一个更晚的业务真的要求用户输入唯一名称，并把重名作为可纠正的业务拒绝，也要在那个操作上识别具体约束，才能把提示给对人。仅把所有唯一约束错误改成“名字已被占用”，会让本章完全无关的主键冲突变成一句无从修复的提示。数据库在说明某条规则没满足；将它译成业务结果，还要知道该操作对输入承诺了什么。

再比较两次只差一步的创建。第一次在取得连接前就退出，当前操作的插入语句还没有送到服务器。第二次已经执行成功，服务器确认的消息却没抵达调用方。对页面来说都可能只剩失败提示；对存储来说，两次请求之间相差一条已提交的行。若在这时由拦截器悄悄重试，第一次也许恰好补成功，第二次却变成用户从未要求的两笔。仅靠原文搜索也无法把第二次还原出来，因为用户本来就可以保存两次完全一样的原文。即使按时间找出最接近的一笔，另一份并发请求也可能恰好带着同样的内容。只有知道本次确切编号并核对归属时，读回才有针对性；客户端连编号也没拿到时，保留“结果待确认”比在界面上补造一个肯定答案更准确。

如果要向接班人交代这样的故障，先说明你知道的最后一步。例如“列表已经获得连接，数据库当时报告它在等锁，三秒左右该请求返回存储不可用”，下一位就知道该去找同一事务的持锁者。“某次创建在页面显示失败”则没有这些依据。可以用请求号沿操作日志追到资源层，并说明缺少数据库确认还是缺少返回给页面的确认；请求号只把这些证据串在一起，查不到日志也可能只是级别、进程或采集时间不对。尤其在关闭期间，要先区分这笔工作有没有被应用接收。收到正在排空的明确拒绝，和先接收再在查询时失败，对是否需要核实写入有不同的含义。

## 22.4 连接池、等待与关闭的真实顺序

### 五个连接不是五个用户

数据库连接是可复用的会话资源。一个用户可以同时发多个请求，一个请求也可能顺序执行多条 SQL；因此连接池上限不能按“有多少用户”直接指定。查询短时占用连接，完成后归还；下一次请求可使用同一连接。长期停在事务里、慢查询或锁等待都会延长占用时间，即使 Node 事件循环没有被阻塞，后来的数据库工作仍然会排队。

`max=5` 是当前本机服务的初始容量选择，不是数据库最佳实践的固定数字。若一个进程有五个连接，四个进程最多就是二十个，再加后台任务、迁移、DBeaver 与管理员连接。应从实例可用连接预算中给它们分配额度并预留维护空间；单纯把每个进程都调大，可能把本地排队变成数据库整体过载。

池上限也不等于请求队列上限。当前 pg 可以让更多请求等待，连接等待期限使一次等待有终点，却不能替代未来的入口并发限制。小范围本机实践可以观察这套机制；公开服务的容量控制需要结合真实负载继续设计。

`connectionTimeoutMillis=2000` 限定新连接建立与池获取的等待；`statement_timeout=3000` 由服务器约束单条语句执行时间，包含锁等待；`idleTimeoutMillis=10000` 回收已经归还、空闲十秒的连接，不会中止正在执行的查询。三个值不是同一种“接口超时”，也不保证请求总耗时最多三秒：同一次请求可能先排队，再执行，还要经过 Node 与网络。

服务端超时真正取消数据库语句，与前端停止等待或 `Promise.race` 胜出不同。后两者不自动取消已接受的写入。读者如果希望把多种期限合成整体预算，需要先分清执行到了哪里，支线 22A 再展开这些差别。

估一个池的大小，可以先算“一秒钟内，连接一共被借用了多久”。假设只有列表流量，每秒平均完成四十次，每次只借一次，平均从取得到归还占五十毫秒。在工作稳定的这段时间里，每秒累加约两千毫秒的连接占用，平均就有两条连接在使用。这里相乘的时间不含借到连接之前的等待，也不含归还以后前端绘制列表的时间。如果从浏览器取二百毫秒直接相乘，就会估出八条，把别处消耗的时间也分配给了数据库。反过来，一条查询在服务器上等锁时虽没处理多少行，连接却一直无法交给别人，这段等待要完整计入占用。这个算例说明应当量哪段时间，不能拿假设的四十次当成项目已测的吞吐。

平均两条也不意味着把上限设为二就可以保证没人排队。仍然是每秒四十次、每次五十毫秒，若每隔二十五毫秒来一次，完成和新到达大致错开；若四十次都在这一秒开始时到达，同样的两条连接一次只能交给两次查询，最后一批得等前面十九批完成。在这个忽略额外开销的算例里，最后一批光等就要约九百五十毫秒，用户看到的延迟和第一种情形差很多。现在再改变一个条件，其中一条查询突然要等锁三秒，池就只剩另一条能轮流服务。上一秒的平均耗时解释不了下一秒的拥堵。把上限调大之前要分清，新增的连接能否真的并行做有用工作，还是刚拿到便加入同一个锁的等待队伍。

连接预算还会在发布或开发重启时短暂变化。例如实例可分给这些应用的普通连接只有三十个，后台工作、人工检查和维护已经从总额中扣除。常态四个进程，每个上限五，最忙时合计二十。若替换过程中四个旧进程还在排空，四个新进程已经启动，理论上可同时索取四十个，超过三十个。哪怕各个进程自己的池都没满，新进程建连也可能被实例拒绝。这里不能把“理论上可索取”当作“此刻已经占用”；空池会按需建立连接，实际是否撞线还得看并存期间的会话和失败日志。接手时若只在故障结束后数平稳运行的四个进程，很容易漏掉重叠那段时间。

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

要把图里的“谁在等谁”读成可以采取行动的信息，先回到持锁编辑器，记住执行锁语句的那个会话编号。结果网格左边的 pid 来自活动会话，是想读素材的那一方；最右列括号里装的是妨碍它继续的会话编号，可以有多个。在这一轮只有一个人为持锁者，只要右边的编号与自己先前记下的相同，就知道下一步能由哪个窗口解除阻塞。若拿左边编号去找“占着锁的人”，找到的恰好是受影响的查询。取消它只会让这一条查询失败，下一条读取仍然要等。右边若出现陌生编号，此时保持只读观察，先核对自己用了哪个开发库及哪个事务，不要替未确认的会话结束工作。

持锁窗口此时可能已经显示“执行成功”，光标也回到了编辑器。成功指锁语句已经取得要求的锁，外面的事务尚未结束，所以窗口在等你决定下一步，锁却继续有效。观察窗口若也看到自己停在事务里，要特别检查两个编辑器是否真的使用了独立连接。窗口标题不同只能说明打开了两份文档，可以分别执行 `SELECT pg_backend_pid(), current_database()`：本实验要求同一个数据库名、不同的会话编号。数据库名不同会造成毫无冲突的正常读取，会话编号相同又不可能让一个窗口独立观察另一个事务。从这个检查开始，比先猜“这张表是不是太小，读得太快所以锁不住”更接近机制；强表锁与普通读的冲突不会因为表里只有一行而消失。

如果手速赶不上两个期限，不必把查询调慢或把锁留得更久。可以先单独完成一轮，只发第一条，提前在观察窗口选好活动查询，发送后立即执行，留下带等待类型和阻塞者的结果，再回原窗口回滚。另一轮专心记录两条请求的发送间隔和各自响应。两轮可以检验同一种解释，但每轮都要用自己的编号和当时的读数，不能借用上一轮的会话编号解释下一轮。当截图和日志已经足以还原一次等待时也不必在调试器里暂停服务；暂停会改变驱动处理超时和归还连接的时机，此时页面上的秒数已不再代表正常调度。

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

同样的池配置也能产生两次语句超时。假设 A 在第 0 秒开始等锁，B 到第 1.5 秒才开始等连接。A 在约第 3 秒结束时，B 的两秒预算还剩约半秒；若它及时取得可用连接并发出 SQL，锁又一直未释放，B 也会进入数据库等待。此时加大池只会让更多查询同时等同一个锁。判断该不该调池大小，先看是谁占着连接、在等谁，再看两个请求实际相隔多久。

若两条都得到语句超时，除发送间隔外，还应确认池确实为 1、修改环境文件后整个 dev 已重启；若只有一条请求，检查是否复用了同一个正在发送的标签；若直接成功，确认锁仍然持有且连到同一库。

观察后立即回到**原持锁编辑器**执行 `ROLLBACK`。如果十五秒保护已断开会话，事务和锁已随断开回滚，重连再查；不要在观察会话中执行 ROLLBACK 并误以为释放了别人的锁。重新发送列表，应恢复 200；确认没有残留阻塞，把 DB_POOL_MAX 恢复 5，重启 API。实验没有新增、修改或删除业务行。

![Postman：原持锁事务结束后，同一列表请求恢复 200](images/postman-lock-recovered.jpg)

URL 与 `limit=1` 保持，恢复后返回已有记录。这里比较的是锁释放前后的请求结果，不是改 URL 换到另一个正常服务。恢复 200 还需配合活动／锁查询确认没有残留阻塞；最后恢复连接池配置，不把实验用的单连接限制留在日常环境。

### 为什么关闭必须晚于已经接受的工作

第十四章的 serve 已负责信号：标记 draining，停止 HTTP 接收，等待在途响应和 ApplicationState 追踪的工作，再调用 app.close。Nest 随之调用 DatabaseService.onModuleDestroy。这里不再调用 `enableShutdownHooks()` 登记第二套信号协调，避免两个关闭流程同时争夺顺序。

为什么不在收到 SIGTERM 时立刻 `$disconnect()`？已接受的 POST 可能还在使用连接；提前断开会把本可完成的工作变成错误或未知结果。先停止接收、再排空、最后释放，才使资源寿命覆盖使用它的工作。HTTP 客户端取消也不等于数据库工作停止，因此原有 ObservedCaptureStore 的追踪仍保留。

本章主动创建外部 pg.Pool，明确设置 `disposeExternalPool:false`。因此 `$disconnect()` 负责 Prisma 侧，随后 `pool.end()` 负责自有池；finally 保证前者失败时仍尝试释放后者。不能既让适配器关闭外部池，又自行不加区分地结束一次；也不能以为 `$disconnect()` 必然替应用结束所有外部池。

正常关闭日志应依次看到 app.draining、database.closed、app.stopped。在观察连接中重新查询，epp-api 会话应消失，DBeaver 会话仍在。如果关闭期限到达，第十四章的外层期限会以非零状态强制终止；SIGKILL 也不会执行 JS 钩子。操作系统连接断开后，数据库会清理会话和未提交事务，已经提交的行仍然保留。关闭钩子有助于正常完成工作，不能替代持久化的恢复设计。

把关闭过程放回一次具体的列表请求。用户已经点开列表，数据库暂时还没给出行，浏览器此时关闭标签页。网络连接消失可以让 HTTP 一侧知道响应送不出去了，却没有替服务端把先前的查询收回。此时如果执行重启，仅等待监听端口可以关闭，随后就销毁资源，仍可能与这条查询相撞。配套的存储观察对象在调用内部存储前把工作交给应用状态追踪，成功和失败都要等这份工作落定。因而关闭协调先等 HTTP 服务收尾，再等被追踪的工作归零。即便这一轮客户端还活着，两次等待看起来几乎同时完成，也应当保留后一个条件，它覆盖的是客户端已经离开的路径。

可以把终端日志当成这段程序的执行路线。看到进入排空后一直没有数据库关闭事件，仍有几种可能：启动中的初始化还在结束，已有 HTTP 连接尚未收完，或者存储工作仍在等数据库。先回同一进程看信号前是否已经就绪，再去观察连接是否仍在等锁。服务器上刚查不到活动语句，只能排除采样那一刻可见的执行，不能据此宣告所有应用工作已经完成。若最终出现关闭期限到达的日志，它记录的是整个收尾过程未能按时结束；即使当时记录的活动数为零，资源清理本身也可能还在等待。接班人需要的是最后实际走到的位置，而非看到“超时”两字就去增大语句期限。

还有一个较少遇到的顺序是服务尚在启动就收到停止信号。此刻对外可能根本没有监听端口，但初始化已经创建了部分资源。配套先记下停止意图，等待正在进行的启动流程结束，并在启动步骤之间检查这个意图。这样不会出现使用者刚要求停机，较慢的初始化结束后却又开放一个新端口的情况。若同样的停止流程被重复触发，外层也会等待已经开始的关闭。资源层共享一次关闭结果与服务层只协调一次信号解决了不同范围的问题，缺一层都可能在重复重启或启动中断时出现与平常顺序不同的日志。

## 22.5 保留事实，分别核对开发重启与交付产物

先记下刚创建的实际 ID、原文和时间。停止 API，保持 PostgreSQL 与 DBeaver 运行。在 DBeaver 查询该 ID，行仍在；再运行 `npm run dev`，通过 Postman 详情读取，三个字段应与停止前一致。接着保存一个无业务变化的源码编辑，等待自动编译、旧进程退出、新进程 app.ready，再读同一 ID。自动重启不会清空数据库，也不会自动重放你的 POST。

![Postman：开发进程自动重启后仍读到原来的记录](images/postman-after-dev-restart.jpg)

把这张详情图和 上章创建特殊字符原文的响应对照：完整 ID 仍为 `033ea9e4-ade9-4746-9aac-e11845427b05`，原文和 `01:23:14.553Z` 都保持。3251 是此处开发进程端口。先在终端确认旧 PID 退出、新 PID 出现 `app.ready`，再发送请求；仅有 200 响应无法证明重启确实发生，也不能证明自动重放了创建请求。

这次观察的重点是资源独立：API 进程管理连接，PostgreSQL 管理数据，DBeaver 只是另一个客户端。关闭客户端不停止服务端，关闭 API 不撤销已提交记录。持久化也不等于备份，误删和磁盘故障仍需要后面的恢复方案。

如果新进程读不到旧 ID，先看这个进程有没有输出 `app.ready`。按第二十章留下的状态，VERIFY 已有表，固定开发用户却尚未提交到这个库。此时若误把 API 指向 VERIFY，启动探测会记录 `DEV_USER_MISSING` 并退出。如果 Postman 同时收到了 404，先核对实际请求端口和响应来自哪个进程。若 API 已经就绪并且确实返回了 404，再查这条素材在它连接的库中是否属于固定用户。在 DBeaver 的 DEV 与 VERIFY 编辑器分别执行下面的查询，两处都把示例 ID 换成上章由 API 创建、已经保存的完整 ID。

```sql
SELECT current_database() AS db, EXISTS (
  SELECT 1 FROM public.captures
  WHERE id = '20000000-0000-4000-8000-000000000001'
    AND user_id = '10000000-0000-4000-8000-000000000001'
) AS visible_to_api_user;
```

外层 SELECT 即使碰到空素材表也会返回库名和一个布尔值。按眼下的数据，DEV 应为 true，VERIFY 应为 false。这能区分两库中的素材，却不能告诉你运行中的进程连到了哪边。把结果和该进程的连接目标对起来：后面给 VERIFY 补入并提交固定用户后，指向它的进程也能就绪，但仍查不到原来只在 DEV 创建的那条素材，那时才会出现这条详情返回 404 的情形。保留原 ID 继续对账，再 POST 一条相同原文只会得到另一个 ID。

同一个布尔值还可能遮住两种不同原因。上面的存在性查询把编号和归属写在一起，得到假，只说明没有同时满足这两个条件的行。如果接手者有权在自己的开发库核对数据，可以在同一编辑器只按那个完整编号读出 `id, user_id`。仍然没有行，应回看最初创建响应来自哪个库；有行而所有人不同，则详情按固定用户查询时本来就应该看不到。不要为了让页面显示而去修改素材所有人，那会把一次正确的归属限制变成数据错误。若换到另外一个库又能看到相同编号，也先问两库是否都从同一份种子或副本建立；种子编号本来就能重复出现在不同的库里。用自己在上一章创建的那一笔来对照，比用两库天生共有的固定用户更能区分读的是哪份数据。

开发重启的核对最好把“重启了哪个程序”和“它读到了什么”各留一份证据。文件保存只触发监听器，终端还可能正在编译，发得太早会遇到旧进程或暂无监听的短窗口。等新进程就绪后，在 Postman 点发送并查看本次响应的请求号，再用终端这次请求的记录对齐。若只回到此前的标签页，显示的可能是上一次响应，即使数据库现在已经停了也仍会留着那份正文。数据库编辑器也同样要重新执行详情查询。这两个动作都无需再发创建，因而对照前后可以使用原先保存的唯一编号。

### 接入后，原来的小检查怎样调整

第十三章已有一条非法 JSON 请求检查，原先以“新进程列表为空”为起点。现在不能再假设空库，更不能为了测试先清表。它改为先保存当前列表，发送非法 JSON，再比较列表未变。测试连接也从开发连接中分开：`NODE_ENV=test` 只选择程序模式，不会替我们选择另一个数据库。后续加入写入与回滚检查时，这个边界尤其重要。

首次将配套 `test/database.env.example` 复制为项目根目录 `.env.test`，将 `TEST_DATABASE_URL` 填为已应用本章迁移、含固定开发用户的独立校验库连接，可以沿用第二十章建立的 VERIFY；保持 `DB_QUERY_DEBUG=false`。已有配置文件只补字段，不覆盖；凭据仍不提交。测试不自动建库、迁移或清表，也不能仅给 DEV 换一个环境变量名就称为隔离。

第二十章在 VERIFY 中验证约束后回滚了事务，users 与 captures 都应仍为空；迁移成功也不会自动插入开发用户。本章应用启动会检查固定用户 `10000000-0000-4000-8000-000000000001`，缺少它时以 `DEV_USER_MISSING` 拒绝启动，测试还没有机会发送请求。因此首次测试前，在 DBeaver 的 **VERIFY** SQL 编辑器先单独执行：

```sql
SELECT current_database(), current_user;
```

确认库名是独立校验库 `epp_migration_check`，且使用本章准备数据的所有者角色 `epp_owner`，再执行：

```sql
INSERT INTO public.users (id)
VALUES ('10000000-0000-4000-8000-000000000001')
ON CONFLICT (id) DO NOTHING;

SELECT id FROM public.users
WHERE id = '10000000-0000-4000-8000-000000000001';
```

应查到这一行；若使用手动提交模式，提交后测试连接才能看见它。该语句可重复执行，只补缺失的固定用户，不复制 DEV 数据，不插入记录，也不清空已有校验数据。下次继续测试时先确认这一行仍存在即可。

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

接着修改 `test/captures.test.mjs` 中已有的非法 JSON 用例。取得 `baseUrl` 后、发出那次 POST **之前**，插入这一行，让基线来自同一个应用、同一个固定用户的列表：

```js
const before = await (await fetch(`${baseUrl}/captures`)).json();
```

保留原有的非法请求、400 与问题码断言，以及事后列表的 GET 和 200 断言。把最后一行与 `{ items: [] }` 比较的断言替换为：

```js
assert.deepEqual(await list.json(), before);
```

这样，即使校验库里昨天就有一条合法素材，今天仍能用它作基线。在独占校验库的这一轮里，如果非法请求多写了一条当前用户可见的素材，事后列表就会比基线多出那个 ID。若只加环境导入而保留旧断言，空库上也可能通过，一旦已有素材就会把正常保留的数据报成失败。

`package.json` 的 test 命令改为 `npm run build && NODE_ENV=test node --env-file-if-exists=.env.test --test test/*.test.mjs`。它只加载测试配置，不读取开发 `.env`；缺少明确的测试连接时，在打开应用前退出。测试进程用 `TEST_DATABASE_URL` 替换继承的 `DATABASE_URL`，日常开发和生产入口不受影响。

进程中已有的同名变量优先于文件。使用文件前先执行 `unset TEST_DATABASE_URL DB_QUERY_DEBUG DOCS_ENABLED`，核对文件指向的主机、端口与库名，再运行 `npm test`，不要打印含密码的完整连接串。运行期间暂停该校验库的其他写入，否则合法并发变化会破坏前后比较。只运行单个文件时使用 `NODE_ENV=test node --env-file-if-exists=.env.test --test test/captures.test.mjs`，同样必须提供测试连接。

这仍是一条最小回归证据，不扩建测试工程。表约束、特殊字符、池等待和重启分别通过前面的实际操作观察。旧章节独立创建 MemoryCaptureStore 的机制示例仍可以研究内存行为；第十五章改变为数组的参考源码在其独立分支运行；本章已经接入数据库，跟做旧练习时应回到对应章节的独立目录。

读一下这条回归的前后两次列表比较，会发现它比“返回四百就算通过”多覆盖了一种故障。假设接口错误地先存了素材才发现正文格式不对，响应仍然可能显示拒绝。只查响应码，使用者看不到那个多出来的副作用。测试先保存同一用户的完整列表，收到拒绝后再读，比较数组、顺序及各字段；若偷偷多了一笔，该用户可见的结果就会不同。反过来，两次列表相等所支持的是在这个观察范围里没有可见变化。它没有读取其他用户的行，也没有逐笔监视两次读取之间的中间状态，不能从这一次断言推断所有表都未写入。明白证据的范围，才能知道哪个回归应由这条检查发现，哪个应另找验证位置。

为什么要让独立校验库在测试前保持安静？假设非法请求被正确拒绝，但你在另一个 Postman 标签里恰好往同一校验库创建了一条合法素材，两次列表就会不相等。这里比较的是跨两次正常 HTTP 读取的业务结果，两个读取没有共享一份冻结的数据视图，第二次理应看到新提交。这时为让测试变绿而忽略新行，会把它原本要发现的副作用一并忽略。更合适的处理是从前后差异里拿到多出的编号，确认合法请求使用了哪个地址，停掉那份并行写入再跑。已提交的合法行可以作为下一轮比较的起点，无需把校验库清成空白。若测试在监听之前就退出，则两次列表根本还没有发生；先看是否缺测试连接、迁移或已提交的固定用户，修改比较断言解决不了启动失败。

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

独立目录要能区分“构建漏带文件”和“运行环境接错库”。前一种故障常在服务器还没有发出第一条查询时就出现，例如加载生成客户端时找不到模块。在原项目里运行成功无法排除这个原因，因为源码目录、生成文件和开发依赖在那里恰好都存在。临时目录应放在项目树之外；若放在原项目某个子目录，模块解析有机会向上找到原项目安装的依赖，缺漏就可能被掩盖。遇到模块加载错误先按错误中缺的模块名核对运行依赖声明和产物中的导入位置，回到构建来源修正。若拷完旧的依赖目录才通过，得到的是另一套运行条件，下一次干净安装仍可能失败。

后一种故障能够走得更远。进程已开始执行数据库初始化，可能还取到了固定用户，直到查列时才失败。若把这个现象也归因于“缺少开发依赖”，在运行目录重新安装生成工具只会增加变量。此时应该在目标连接下核对实际结构，再与打进产物的模型所要求的列比对。构建、启动、按原编号读取和提交新记录分别回答四个问题：程序能否生成、运行依赖能否初始化、它读的是不是预期的那份事实、当前角色和结构能否接受这一笔写入。把同一端口上的一次健康响应当作四项都通过，就无法解释“构建成功却不能写”“能够新建却找不到昨天那一笔”等接手问题。

正式迁移仍是单独任务，使用有 CLI 和迁移目录的工具环境执行；API 启动不自动 migrate deploy。正式部署要为运行库准备真实数据和适当权限，运行角色与迁移所有者应分开，不能直接把本章 epp_owner 的开发连接暴露到公网。当前固定用户路线也尚未提供登录和用户隔离，生产模式说明的是运行方式，不是已经满足开放服务条件。

如果重启失败，按失败位置恢复：配置字段错误先改配置并重启父进程；数据库不可达回到第十七章核对实例与身份；缺表、缺列查第二十章的实际结构与迁移历史；固定用户缺失核对开发数据。已存在两张表但忘记登记历史，不能由 API 的启动成功反推历史已经正确。不要用 reset、重新 seed 或切回 Map 掩盖这些差异。

完成这一章后，HTTP 输入、业务规则、存储适配、连接资源和数据库事实已经接成同一条可观察的链。下一章增加中文意图时，会在这条链上保留旧记录、追加迁移并更新接口，不再通过换库或重新开始绕过兼容问题。

本章完成代码分支为 `part-03/chapter-22`。

## 知识支线

[支线 22A：等待结束后，写入到底发生了没有](side-01-timeouts-and-outcomes.md)区分池等待、数据库执行、HTTP 等待与提交结果，用具体时序推导取消、重试和幂等的责任。阅读约 20～25 分钟，不另设操作。

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

[上一章：让记录接口读写已有的 PostgreSQL 数据](../chapter-21-existing-records/chapter.md) · [下一章：Migration：给已有记录增加中文意图](../chapter-23-migrations/chapter.md) · [返回第三篇](../README.md) · [返回全书目录](../../README.md)
