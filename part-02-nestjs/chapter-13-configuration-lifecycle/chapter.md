# 第 13 章 配置与生命周期：让应用可靠地启动和退出

第十二章让请求的输入、输出与错误各有归属。现在保存一条记录，可能先经过 Middleware、Pipe、Controller、Service 和存储，最后由 Interceptor 或 Filter 决定响应。可是，当这个请求做到一半时按下 Ctrl+C，前面的职责划分并不能自动回答：请求还会不会完成，下一条请求是否继续进入，存储连接应在什么时候释放？

配置也有同样的问题。第三章让端口在启动前校验，第十一章给文档入口加了开关，但它们由不同函数读取 process.env。如果以后一个 Provider 读到修改前的变量，另一个读到修改后的变量，同一进程就可能依据两份配置工作。到处补一个默认值只会把这种分歧藏得更深。

本章从 `part-02/chapter-12` 继续，完成三件相互关联的事：启动时产生唯一、有效的配置快照；关闭时按正在进行的工作决定收尾顺序；请求出错时用日志还原它经历的边界。业务仍是内存版三个记录接口。数据库将在第三篇接入，因此资源实验使用独立应用和真实文件句柄，不提前把模拟数据库塞进主线。

日常继续 `npm run dev`，Postman 使用已有集合，VS Code 选择 `EPP: attach to npm run dev`。保存会重新编译到 .dev 并重启，不保留 Map；交付使用 dist 与 `npm start`。第十三章代码分支为 `part-02/chapter-13`。

这一章的配置、关闭状态和日志要接到同一个应用里，13.1 中的模块会先引用后文才实现的类。阅读可以按小节推进；从第十二章跟做时，先停止 dev，读完这些对象的关系，再一起接齐文件。具体可先建立 config、13.3 的 ApplicationState 和 13.4 的 AppLogger，再组装 RuntimeModule、AppModule、请求观察与存储包装，最后接入 serve 和入口。接齐后再运行检查与各节的请求实验，避免把中间态的缺文件错误误当成容器故障。已有完整第十三章代码时，则可以随文直接运行对照。

## 13.1 把启动输入变成一份可注入的配置

### 配置读取结束以后，谁可以继续作决定

考虑 `PORT=3001oops`。端口必须在监听前拒绝，这一点第三章已经建立。现在再考虑 `DOCS_ENABLED=false`：如果某处使用 Boolean(raw)，字符串仍为真，文档会意外开放。TypeScript 的 boolean 类型不能替我们解释环境变量字符串。

我们需要的路径是：取得文件和进程环境，校验各自表示，按明确的优先级合并，生成内部类型，交给需要它的组件。组件接收到的是已经解释过的值，不再各自读取 process.env。配置快照不会因另一段代码修改环境对象而改变。

可以继续使用普通函数返回对象，再通过构造参数传递；Nest 的 `@nestjs/config` 也提供加载与注入能力，适合多组命名配置、模块化配置工厂和较复杂的加载需求。它仍需要我们确定校验和秘密边界，不能仅靠安装包得到正确配置。当前只有五个运行参数，已经有 Node 的 env-file 加载、Zod 和 Provider，我们使用这些既有能力集中解析；配置数量或来源增长后，再评估 ConfigModule。不要同时让 Node 与另一加载器按照不同规则重复读取同一份 .env。

替换 `src/config.ts`。公开默认文件仍是 `config/service.json`，内容仍为 `{"port":3000}`；即使环境中已有 PORT，默认文件也必须有效，避免漏交资源被某台机器上的变量掩盖。

```ts
import { readFile } from 'node:fs/promises';
import { z } from 'zod';

export const APP_CONFIG = Symbol('APP_CONFIG');
export type AppConfig = Readonly<{
  port: number;
  mode: 'development' | 'test' | 'production';
  docsEnabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  shutdownTimeoutMs: number;
}>;
export class ConfigError extends Error {
  constructor(readonly field: string) { super(`Invalid configuration: ${field}`); }
}
const DefaultsSchema = z.object({ port: z.number().int().min(1).max(65535) });
const decimal = (max: number) => z.string().regex(/^[0-9]+$/)
  .transform(Number).pipe(z.number().int().min(1).max(max));
const EnvironmentSchema = z.object({
  PORT: decimal(65535).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DOCS_ENABLED: z.enum(['true', 'false']).optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  SHUTDOWN_TIMEOUT_MS: decimal(30000).default(5000),
});

export function parseConfig(defaults: unknown, env: NodeJS.ProcessEnv): AppConfig {
  const file = DefaultsSchema.safeParse(defaults);
  if (!file.success) throw new ConfigError('config/service.json.port');
  const parsed = EnvironmentSchema.safeParse(env);
  if (!parsed.success) {
    // Only a schema-owned field name is reported, never its value or Zod dump.
    throw new ConfigError(String(parsed.error.issues[0]?.path[0] ?? 'environment'));
  }
  const value = parsed.data;
  return Object.freeze({
    port: value.PORT ?? file.data.port,
    mode: value.NODE_ENV,
    docsEnabled: value.DOCS_ENABLED === undefined
      ? value.NODE_ENV === 'development' : value.DOCS_ENABLED === 'true',
    logLevel: value.LOG_LEVEL,
    shutdownTimeoutMs: value.SHUTDOWN_TIMEOUT_MS,
  });
}

export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<AppConfig> {
  let text: string;
  try { text = await readFile(new URL('../config/service.json', import.meta.url), 'utf8'); }
  catch { throw new ConfigError('config/service.json: unreadable'); }
  let defaults: unknown;
  try { defaults = JSON.parse(text); }
  catch { throw new ConfigError('config/service.json: invalid JSON'); }
  return parseConfig(defaults, env);
}
```

这里有几处刻意的限制。PORT 先匹配十进制字符串再转数字，因此空字符串、空格和科学计数法不会被宽松转换成看似有效的端口。NODE_ENV 只接受三个已支持的模式；DOCS_ENABLED 必须写出 true 或 false。关闭期限以毫秒表示，必须是 1～30000 的整数；它有确定上界，后面才能给开发进程管理器留出更大的外层期限。

EnvironmentSchema 的输入是整个环境对象，它会忽略无关系统变量；不能用 strict 模式把 PATH 等正常变量当成应用配置错误。失败时只报告由 Schema 定义的字段名，不输出输入值、整份 process.env 或 Zod 错误对象。`PORT` 配错与数据库密码配错，定位时都需要知道字段，通常都不需要把原值写进日志。

返回对象只包含标量，Object.freeze 足以阻止这里的属性被改写；Readonly 则在编译阶段约束调用者。如果以后包含嵌套对象，浅冻结不会自动保护内层，要重新考虑复制和不可变边界。它也不是动态配置系统：更改 .env 或部署变量后仍需重启，不能期待一个启动快照自动追踪文件变化。

第十一章独立的 `src/http-options.ts` 由这份解析替代，避免维护两套模式与文档规则。规则本身没有改变：development 默认开文档，test/production 默认关，显式开关优先。

### 把同一份配置放进容器，而不是重复加载

接口和日志组件都需要运行时设施，但它们不应各自建立一份配置或日志上下文。新增 `src/runtime.module.ts`：

```ts
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_CONFIG } from './config.js';
import type { AppConfig } from './config.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';

@Module({})
export class RuntimeModule {
  static register(config: AppConfig, logger: AppLogger): DynamicModule {
    return {
      module: RuntimeModule,
      global: true,
      providers: [
        { provide: APP_CONFIG, useValue: config },
        { provide: AppLogger, useValue: logger },
        ApplicationState,
      ],
      exports: [APP_CONFIG, AppLogger, ApplicationState],
    };
  }
}
```

register 是我们定义的静态方法，名字本身没有框架魔法。它返回带有 module、providers 和 exports 的动态模块描述，允许调用者把启动前得到的值填进登记。useValue 交出同一个对象，不重新读文件；APP_CONFIG 是对象的运行时令牌，AppConfig 只是编译时类型。

这里有意将 RuntimeModule 设为 global，且每个应用只在根部登记一次。它只公开配置、日志和工作计数这三项进程基础设施，业务 Service 与存储仍按第十章的模块边界导出。全局模块省掉重复 imports，也会使依赖来源不如显式 imports 直观，因此不能把所有业务模块都照搬成 global，更不能在多个子模块分别 register 不同配置。

AppLogger 与 ApplicationState 在本章后面给出完整实现。先看根模块如何组合，替换 `src/app.module.ts`：

```ts
import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ProblemFilter } from './problem.filter.js';
import { CapturesModule } from './captures.module.js';
import { RuntimeModule } from './runtime.module.js';
import type { AppConfig } from './config.js';
import { AppLogger } from './app-logger.js';

@Module({})
export class AppModule {
  static register(config: AppConfig, logger: AppLogger): DynamicModule {
    return {
      module: AppModule,
      imports: [RuntimeModule.register(config, logger), CapturesModule],
      providers: [{ provide: APP_FILTER, useClass: ProblemFilter }],
    };
  }
}
```

需要配置的 Provider 使用 `@Inject(APP_CONFIG)`，参数声明为 AppConfig；后面的资源实验会实际使用它。直接 `app.get(APP_CONFIG)` 适合启动编排，不应变成每个业务方法随意查容器的方式。业务对象应继续通过构造参数暴露依赖。

独立的 Nest 应用上下文也是一个新的容器，不会继承另一个 HTTP 应用的 global 模块。因此当前分支中，第十章消费 CapturesModule 的三个独立示例也在自己的根模块登记 RuntimeModule；第十章快照仍保持当时的实现。手动 `new CapturesService(store)` 不经过容器，仍可使用原来的构造参数。

## 13.2 环境、秘密与诊断信息各有边界

### 开发方便，不意味着沿用开发启动条件交付

现在的配置来源可以明确写出：命令启动时的进程环境优先于开发 .env；缺少 PORT 时使用公开默认文件；NODE_ENV 由 npm 脚本明确指定。dev/debug 加载 .env，start 不加载。新的 `.env.example` 如下：

```dotenv
# Local development only. Production injects environment variables.
PORT=3000
LOG_LEVEL=debug
SHUTDOWN_TIMEOUT_MS=5000
# Optional override; development defaults to true, test/production to false.
# DOCS_ENABLED=false
```

第一次使用时复制为 .env；已经有个人 .env 时，只补入需要的新字段，不覆盖自己的设置。要临时提高日志详细程度，可执行 `LOG_LEVEL=debug npm run dev`。更改依赖、启动脚本或环境文件后手动重启；保存 TypeScript 文件则继续由 watch 处理。

开发、测试和生产可以运行同一份业务代码，但输入不同。用开发模式观察变量，用测试模式运行最小请求断言，用生产模式验证交付目录、运行依赖和默认关闭的文档。不要把“线上不方便，所以先跑 dev”当成部署方案：Inspector 允许执行进程内代码，文件监听也不是生产进程托管。

本章仍只绑定 127.0.0.1。production 模式代表使用交付入口与环境策略，不表示已经开放公网或可以长期保存用户记录；Map 在退出时消失这一事实没有变化。公网入口、HTTPS、持久化与托管会按各自章节建立。

### 秘密不等于一个叫 .env 的文件

当前这五个参数都不是秘密，不应为了展示秘密管理而提前添加没有消费者的 TOKEN。后面接数据库时，连接串中的密码才形成真实秘密需求。机制仍可先判断清楚：配置文件决定值从哪里读，文件权限决定谁可以读，日志策略决定值是否被再输出；把变量放进 .env，并不会自动解决后两件事。

例如本机 .env 有实际秘密时，可使用 `chmod 600 .env`，让文件所有者具有读写权限，并沿第三章核对父目录的访问条件。这不能阻止同一账号下的其他进程读取，也不能撤销已经提交、复制或截图的内容。生产应由目标运行环境注入秘密，或以服务账号可读的受控文件提供；不要把真实秘密写进 shell 示例、Git、构建资源复制或 Postman 共享集合。

发现泄漏时，仅从当前文件删除还不够。先撤销或轮换旧凭据，确认依赖使用新凭据恢复，再处理历史、日志和分享范围。隐藏一张截图不能让已经泄漏的凭据重新可信。具体平台如何发放和轮换，会在引入该依赖时展开。

诊断同样需要选择信息。原文可能进入 body，也可能出现在查询 q 或异常消息；只删除名为 password 的字段不能解决原文泄漏。本章日志只从固定字段中取方法、静态路由标签、状态、稳定错误码和耗时，不接收 request、response、异常或配置对象。请求编号由服务端生成，后面可以把错误响应与日志关联起来，不需要保存原文。

### 用错误配置验证启动边界

将本章后面的日志、入口与关闭代码接齐后，先运行 `npm run check`，它完成类型检查与交付构建。在另一个终端尝试：

```bash
PORT=3001oops npm start
DOCS_ENABLED=FALSE npm start
SHUTDOWN_TIMEOUT_MS=0 npm start
```

三次都应在监听前失败，日志为 app.start_failed，code 为 CONFIG_INVALID，field 分别指出对应字段，退出码为 1。看到“构建通过”不能证明运行配置有效；这是两个不同输入边界。不要用一个失败配置后不断重试请求，因为根本没有一个可接收请求的新进程。

用 `PORT=3001 npm start` 核对正常产物，Postman 的产物集合指向 3001，开发集合仍指向 3000。创建和查询照常工作；生产的 `/docs` 与 `/openapi.json` 默认 404。只有有意提供 `DOCS_ENABLED=true` 才改变文档入口，开文档不附带身份校验。验证完结束该进程，不要让下一次检查误连仍在运行的旧产物。

## 13.3 让停止接收、完成工作和释放资源按顺序发生

### 构造完成、初始化完成、监听成功不是一件事

构造函数适合建立对象关系。把异步连接丢进构造函数，又不让容器等待，注入成功时资源可能还没有准备好。可以使用异步 Provider 工厂，等待后再提供值；也可以由拥有资源的 Provider 在 onModuleInit 中初始化。前者影响依赖实例何时可获得，后者适合实例建立后统一准备资源，但调用者必须等待应用初始化完成。

在当前 Nest 11 中，create 建立容器；app.init 会完成模块初始化与应用启动钩子；app.listen 必要时先初始化，然后真正绑定端口。只有 listen 成功后，才应该记录 app.ready。onApplicationBootstrap 已执行，不代表操作系统已经允许监听目标端口。

可以先运行一个不需要 HTTP 的对照。`examples/lifecycle-order.mjs`：

```js
import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

class Resource {
  onModuleInit() { console.log('resource: init'); }
  onApplicationBootstrap() { console.log('resource: bootstrap'); }
  onModuleDestroy() { console.log('resource: destroy'); }
  beforeApplicationShutdown() { console.log('resource: before shutdown'); }
  onApplicationShutdown() { console.log('resource: after shutdown'); }
}
class Root {}
Module({ providers: [Resource] })(Root);
const app = await NestFactory.createApplicationContext(Root, { logger: false });
console.log('caller: context ready (no HTTP listener)');
await app.close();
console.log('caller: close complete');
```

它应依次输出 init、bootstrap、调用者确认上下文可用，再输出 destroy、before shutdown、after shutdown，最后是 close complete。createApplicationContext 的 ready 只是容器初始化完成，没有创建 HTTP 监听。显式 await app.close 会等待钩子返回的 Promise；只调用不等待，则无法证明资源已释放。

Nest 也提供 enableShutdownHooks，让 SIGINT、SIGTERM 等信号触发关闭。适合使用框架默认关闭顺序的应用，可以采用这一路径。需要注意，默认 app.close 的大致顺序是 onModuleDestroy、beforeApplicationShutdown、适配器关闭连接、onApplicationShutdown；模块内部的多个 Provider 钩子也不能被当成任意业务依赖的串行执行表。

这就产生了一个实际风险：如果在 onModuleDestroy 关闭数据库连接，而 HTTP 请求还在使用连接，请求会在“优雅退出”期间失败。钩子的名字不保证“现在已经没有用户”。我们必须先建立停止接收与等待的边界，再让资源拥有者执行释放。

### HTTP 连接结束了，业务工作也可能还在执行

Node 的 server.close 停止接受新连接，并等待现有 HTTP 连接收尾；Node 24 会处理空闲 keep-alive 连接。但客户端主动断开后，连接可能已经消失，先前启动的异步写入却仍在执行。第十二章已经看到，响应失败与取消等待都不意味着回滚。

因此需要同时观察两个事实：传输是否收尾，已经开始的依赖操作是否结束。新增 `src/application-state.ts`：

```ts
export class ApplicationState {
  draining = false;
  private pending = 0;
  private readonly waiters = new Set<() => void>();
  get active(): number { return this.pending; }

  async track<T>(work: () => Promise<T>): Promise<T> {
    this.pending++;
    try { return await work(); }
    finally {
      this.pending--;
      if (this.pending === 0) {
        for (const resolve of this.waiters) resolve();
        this.waiters.clear();
      }
    }
  }
  whenIdle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise(resolve => this.waiters.add(resolve));
  }
}
```

track 在执行 work 前增加计数，在成功或失败的 finally 中减少。whenIdle 等待当前被追踪的工作归零，不靠每隔一段时间猜测。draining 只是应用入口的状态，不能靠它取消已经开始的 Promise。

当前主线所有异步存储操作通过 ObservedCaptureStore 进入 track，稍后同时用它记录耗时。它覆盖当前三个接口的存储调用；未来新增队列消费者、外部请求或脱离请求继续执行的任务时，需要把相应工作也纳入拥有者的生命周期，不能认为这个计数器会自动发现整个 Node 进程里的所有 Promise。

不要在每个 store 调用里看到 draining 就拒绝：信号到来前已经接收的请求可能还需要完成后面的步骤。是否接收新请求应在最前面的 HTTP 入口判断；已接受工作则按原有约定完成。在请求完成后才另行启动的后台工作需要独立接收规则，当前服务没有这种工作。

### 一次关闭由一个协调者负责

新增 `src/serve.ts`，主线与资源实验共用相同的关闭流程：

```ts
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import type { AppConfig } from './config.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';

export async function serve(
  config: AppConfig,
  logger: AppLogger,
  create: () => Promise<INestApplication>,
): Promise<void> {
  let app: INestApplication | undefined;
  let stopping = false;
  let closing: Promise<void> | undefined;
  let boot: Promise<void>;
  const stop = (signal: string): Promise<void> => {
    if (closing) return closing;
    stopping = true;
    if (app) app.get(ApplicationState).draining = true;
    logger.write('info', 'app.draining', { signal });
    const deadline = setTimeout(() => {
      logger.write('error', 'app.stop_timeout', { active: app?.get(ApplicationState).active });
      (app?.getHttpServer() as Server | undefined)?.closeAllConnections();
      // The hard deadline covers hung work AND hung resource cleanup.
      process.exit(1);
    }, config.shutdownTimeoutMs);
    closing = (async () => {
      await boot.catch(() => {});
      if (app) {
        const state = app.get(ApplicationState);
        state.draining = true;
        const server = app.getHttpServer() as Server;
        await new Promise<void>((resolve, reject) => {
          server.close(error => {
            if (error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
            else resolve();
          });
        });
        // A disconnected HTTP client does not cancel an accepted store operation.
        await state.whenIdle();
        await app.close();
      }
      logger.write('info', 'app.stopped', { signal });
    })().catch(() => {
      logger.write('error', 'app.stop_failed');
      (app?.getHttpServer() as Server | undefined)?.closeAllConnections();
      process.exit(1);
    }).finally(() => {
      clearTimeout(deadline);
      process.off('SIGINT', onInt);
      process.off('SIGTERM', onTerm);
    });
    return closing;
  };
  const onInt = () => { void stop('SIGINT'); };
  const onTerm = () => { void stop('SIGTERM'); };
  process.on('SIGINT', onInt);
  process.on('SIGTERM', onTerm);
  boot = (async () => {
    app = await create();
    if (stopping) return;
    await app.init();
    if (stopping) return;
    await app.listen(config.port, '127.0.0.1');
    if (!stopping) logger.write('info', 'app.ready', { port: config.port });
  })();
  try { await boot; }
  catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    logger.write('error', 'app.start_failed', { code: code === 'EADDRINUSE' ? code : 'START_FAILURE' });
    process.exitCode = 1;
    await stop('startup-failure');
  }
}
```

信号处理器先登记，再开始创建和初始化应用。信号如果到在初始化中间，stopping 会让启动流程不再继续监听，关闭流程等待已开始的初始化交出资源；初始化本身卡住时，外层期限仍会到期。重复信号返回同一个 closing Promise，避免对同一资源同时执行两次 close。正常收尾让进程自然结束，退出码为0；启动失败、关闭失败与期限耗尽则以1表示失败。注册处理器后，不能再套用未处理 SIGINT 的默认退出状态来解释结果。

我们主动处理了信号，因此这里不再调用 enableShutdownHooks，否则两套处理器会同时组织关闭。app.close 使用公共接口触发资源钩子；本实现的信号名记录在 app.draining 中，不依赖手动 close 向钩子传递信号参数。

有 HTTP 应用时，先标记 draining，再停止接受连接并等待传输结束，再等待已追踪工作，最后 app.close 释放资源。readiness 的外部摘流、负载均衡宽限期和多实例发布尚不在这个本机应用中；接入它们时，需要在这个顺序前增加摘流协调，不能仅复制一个 SIGTERM 回调就声称完成无损发布。

关闭期限覆盖整个流程，包括资源自己的关闭钩子。超时用 closeAllConnections 中止仍在连接上的请求，随后以非零状态强制结束进程。这里允许丢失最后的响应或日志，是为了不给卡住的进程无限等待；不能称其为正常完成，更不能推断已经发生的写入被撤销。JavaScript 线程被同步代码阻塞时，定时器也不能准时执行，因此正式部署仍需进程托管器的外层期限和强制终止能力。

主入口改成 `src/server.ts`：

```ts
import { createApp } from './app.js';
import { ConfigError, loadConfig } from './config.js';
import { AppLogger } from './app-logger.js';
import { serve } from './serve.js';

try {
  const config = await loadConfig();
  const logger = new AppLogger(config.logLevel);
  await serve(config, logger, () => createApp(config, logger));
} catch (error) {
  new AppLogger('error').write('error', 'app.start_failed', {
    field: error instanceof ConfigError ? error.field : undefined,
    code: error instanceof ConfigError ? 'CONFIG_INVALID' : 'START_FAILURE',
  });
  process.exitCode = 1;
}
```

配置不合法时，还没有创建应用，直接给出安全的字段信息与非零退出码。创建或监听失败时，serve 会尝试释放已取得的应用；如果异步工厂在返回对象之前就申请了资源，然后抛错，它仍需要自己清理尚未移交的资源。不能只依赖“容器最终会关掉一切”。

开发 runner 的停止兜底也必须配套修改：`scripts/dev.mjs` 中 SIGKILL 定时器由 2000 改为 35000 毫秒，留出大于配置最大 30000 毫秒的外层窗口。它只在子进程没有正常退出时触发，普通保存不需要等 35 秒。否则应用明明配置五秒排空，开发工具却在两秒时杀掉它，实验会得出错误结论。

### 用真实资源观察关闭中的请求

主线的 Map 写入很快，不适合靠手速碰关闭时机。独立实验放在 `src/labs/lifecycle.ts`，使用临时目录和真实文件句柄。除了资源本身，还要交代谁接收请求、谁追踪工作、哪些对象属于同一个应用，否则“等待资源再释放”只是一句承诺。下面是这个文件的完整实现：

```ts
import 'reflect-metadata';
import { Body, Controller, Inject, Injectable, Module, Post } from '@nestjs/common';
import { APP_FILTER, NestFactory } from '@nestjs/core';
import { mkdtemp, open, rm } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { APP_CONFIG } from '../config.js';
import type { AppConfig } from '../config.js';
import { RuntimeModule } from '../runtime.module.js';
import { ApplicationState } from '../application-state.js';
import { AppLogger } from '../app-logger.js';
import { ProblemFilter } from '../problem.filter.js';
import { requestObservation } from '../request-observation.js';
import { parseInput } from '../input-validation.js';

const Input = z.object({
  delayMs: z.number().int().min(0).max(15000).default(1500),
  fail: z.boolean().default(false),
});
export type LabMode = 'normal' | 'init-fail' | 'close-hang';

export async function createLifecycleApp(config: AppConfig, logger: AppLogger, mode: LabMode) {
  @Injectable()
  class Resource {
    private directory?: string;
    private handle?: FileHandle;
    constructor(
      @Inject(APP_CONFIG) private readonly config: AppConfig,
      @Inject(AppLogger) private readonly log: AppLogger,
    ) {}
    async onModuleInit(): Promise<void> {
      this.directory = await mkdtemp(join(tmpdir(), 'epp-lifecycle-'));
      try {
        this.handle = await open(join(this.directory, 'events.log'), 'wx', 0o600);
        if (mode === 'init-fail') throw new Error('Demonstration initialization failure');
        this.log.write('info', 'resource.opened', { port: this.config.port });
      } catch (error) {
        await this.release();
        throw error;
      }
    }
    async use(ms: number, fail: boolean): Promise<void> {
      await delay(ms);
      if (fail) throw new Error('Demonstration resource failure');
      if (!this.handle) throw new Error('Resource already closed');
      await this.handle.writeFile('completed\n');
      this.log.write('info', 'resource.used');
    }
    private async release(): Promise<void> {
      await this.handle?.close();
      this.handle = undefined;
      if (this.directory) await rm(this.directory, { recursive: true, force: true });
      this.directory = undefined;
    }
    async onModuleDestroy(): Promise<void> {
      if (mode === 'close-hang') await new Promise<void>(() => {});
      await this.release();
      this.log.write('info', 'resource.closed');
    }
  }
  @Controller('lifecycle')
  class LifecycleController {
    constructor(
      @Inject(Resource) private readonly resource: Resource,
      @Inject(ApplicationState) private readonly state: ApplicationState,
    ) {}
    @Post('work')
    async work(@Body() body: unknown) {
      const value = parseInput(Input, body);
      await this.state.track(() => this.resource.use(value.delayMs, value.fail));
      return { completed: true };
    }
  }
  @Module({
    imports: [RuntimeModule.register(config, logger)],
    controllers: [LifecycleController],
    providers: [Resource, { provide: APP_FILTER, useClass: ProblemFilter }],
  })
  class LifecycleModule {}
  const app = await NestFactory.create(LifecycleModule, { logger: false, abortOnError: false });
  app.use(requestObservation(logger, app.get(ApplicationState), ['/lifecycle/work']));
  return app;
}
```

createLifecycleApp 的 config、logger 和 mode 由本次启动传入。Resource定义在这个工厂内部，因此它读取的是该应用选定的mode；每次创建独立应用都有自己的资源类型和容器。RuntimeModule登记配置、Logger和ApplicationState，Controller与观察中间件取得的是同一个状态对象，不是在各自文件里新建计数器。

请求先经过requestObservation，建立编号并在排空时拒绝新工作。Controller解析输入后，关键调用是 `await this.state.track(() => this.resource.use(value.delayMs, value.fail))`。track覆盖整个延迟与写入Promise，而不是只包住创建定时器的瞬间；即使客户端取消等待，这个Promise没有因此结束，工作计数就不会提前归零。serve可以先等待传输关闭，再等whenIdle，最后app.close触发资源释放。这里把观察、接收、工作完成和资源拥有者连成了一条可检查的关系。

初始化失败时，资源还没有交付给请求，catch立即释放已经打开的句柄和临时目录；正常关闭由拥有者的onModuleDestroy调用release。release允许部分初始化后的清理，也允许失败清理后再次调用，不能假定初始化每一步都成功。init-fail与close-hang分别改变初始化、释放条件，不把它们混成同一种超时。

这个模块只登记Resource、实验Controller和ProblemFilter；没有导入业务AppModule，也没有把实验路由加入主服务。实验采用Nest自带JSON解析，主线依旧保留严格字节边界。临时文件只写固定字符串，不保存业务原文；生产构建排除整个src/labs。

实验的入口文件为 `src/labs/lifecycle-server.ts`，它解析实验模式并复用同一个 serve：

```ts
import { ConfigError, loadConfig } from '../config.js';
import { AppLogger } from '../app-logger.js';
import { serve } from '../serve.js';
import { createLifecycleApp } from './lifecycle.js';

try {
  const mode = process.env.LAB_MODE ?? 'normal';
  if (mode !== 'normal' && mode !== 'init-fail' && mode !== 'close-hang') {
    throw new ConfigError('LAB_MODE');
  }
  const config = await loadConfig({ ...process.env, PORT: process.env.PORT ?? '3007' });
  const logger = new AppLogger(config.logLevel);
  await serve(config, logger, () => createLifecycleApp(config, logger, mode));
} catch (error) {
  new AppLogger('error').write('error', 'app.start_failed', {
    field: error instanceof ConfigError ? error.field : undefined,
    code: error instanceof ConfigError ? 'CONFIG_INVALID' : 'START_FAILURE',
  });
  process.exitCode = 1;
}
```

package.json 的 scripts 增加以下属性；PORT 放在命令环境中，会覆盖本机 .env 的端口，避免把实验误启在主线目标上：

```json
{
  "dev:lifecycle": "NODE_ENV=development PORT=3007 node --env-file-if-exists=.env scripts/dev.mjs .dev/src/labs/lifecycle-server.js"
}
```

本章完整实现接齐后，结束主线 dev，执行：

```bash
npm run dev:lifecycle
```

命令固定开发端口 3007，沿用 .dev、Inspector 和自动重启。导入 `requests/lifecycle.postman_collection.json`，VS Code 继续 attach 到 dev。主线、管线实验和生命周期实验共享 9229 与 .dev，一次只开一个。

先从 app.ready 日志取得 **服务子进程 pid**，在另一个终端准备好 `kill -TERM <pid>`，暂不执行；将占位符换成实际数字，不要选 npm 或 watcher 的 pid。再发送“01 正常收尾”，看到 http.started 后执行准备好的停止命令。1500 毫秒的工作应先出现 resource.used，HTTP 完成，再出现 resource.closed 和 app.stopped。Postman 应收到 201。若发信号前已出现 http.completed，这次只观察到了空闲关闭，需要重新运行再对照。开发父进程会等待下一次源码变化，所以杀掉子进程后终端没有返回提示符，并不代表资源仍未关闭；观察 app.stopped 和子进程状态。

先用 Ctrl+C 结束仍在等待源码变化的开发父进程，再运行 `npm run dev:lifecycle`，从新的 app.ready 取得新的子进程 pid。发送“01”，随后在 Postman 取消请求。应先看到 http.aborted，之后仍可能看到 resource.used。这一次客户端已不等响应，但工作已经接受；再发送停止信号时，state.whenIdle 会保护仍在进行的操作。断开连接不能被误用成取消事务或撤销写入的方案。之后每次重新启动也按这个方式取得新 pid，不复用上次的数字。

发送“02 资源失败”，响应应为 500／INTERNAL_ERROR，日志保留同一请求编号和 http.failed，实验错误消息不进入响应或日志。它与初始化失败不同：应用已可用，失败只属于这次请求，不应因此直接关闭整个进程。

“03 超过关闭期限”会执行 15 秒。发送后向子进程发 SIGTERM，默认五秒期限内无法结束，应出现 app.stop_timeout，进程失败退出，Postman 可能看到连接断开，不能要求它一定得到 503。503 只适用于关闭期间仍在已有连接上到达、并被入口明确拒绝的新请求；停止接受连接后，新连接通常直接失败。

两种资源生命周期失败不需要修改业务代码。停止当前开发父进程后分别运行：

```bash
LAB_MODE=init-fail npm run dev:lifecycle
LAB_MODE=close-hang npm run dev:lifecycle
```

init-fail 在打开句柄后主动失败，应释放已申请资源、没有 app.ready，并让服务子进程以非零状态结束；watcher 仍等待修复或重新启动。close-hang 可以正常启动，但关闭钩子故意永不返回；收到信号后应在期限到达时失败退出。强制结束不会执行后续 finally，这次实验的临时目录可能留下；仅在确定实验进程已结束后，检查系统临时目录中本实验创建的 `epp-lifecycle-*` 目录并按准确路径清理，不使用宽泛通配删除。结束实验恢复 LAB_MODE，再回到主线 `npm run dev`。

## 13.4 沿同一次请求找到耗时与失败

### 先确定日志要回答的问题

多个请求交错运行时，连续几行日志不一定属于同一个请求。给每个请求分配编号并在异步调用中保留，才能回答“这次响应为何失败”和“时间主要耗在哪一层”。编号不表示身份或权限，也不是幂等键；再次发送相同正文会得到新编号和新的记录。

我们始终在服务端生成 UUID，不直接相信客户端传来的 X-Request-Id。这样日志里的关联值长度与格式可控，调用者不能通过重复编号把两次请求伪装成一次。以后接可信代理或分布式 tracing，需要显式定义传播协议与信任边界，再决定如何接收外部 trace 标识。

Nest 自带 ConsoleLogger 支持 JSON 输出，先用它承担序列化和输出，不自制日志传输系统。需要高吞吐、采样、脱敏规则或远程采集时，可以评估 Pino 等成熟方案；换日志库仍不会替我们决定哪些数据可以记录。新增 `src/app-logger.ts`：

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { ConsoleLogger } from '@nestjs/common';
import type { AppConfig } from './config.js';

type Level = AppConfig['logLevel'];
type Event = 'http.started' | 'http.completed' | 'http.aborted' | 'http.failed'
  | 'store.completed' | 'store.failed' | 'app.ready' | 'app.start_failed'
  | 'app.draining' | 'app.stopped' | 'app.stop_failed' | 'app.stop_timeout'
  | 'resource.opened' | 'resource.closed' | 'resource.used';
type Fields = {
  method?: string; route?: string; status?: number; code?: string;
  operation?: string; durationMs?: number; signal?: string;
  port?: number; active?: number; field?: string;
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
    const { method, route, status, code, operation, durationMs, signal, port, active, field } = fields;
    const message = {
      event, requestId: this.context.getStore()?.requestId,
      method, route, status, code, operation, durationMs, signal, port, active, field,
    };
    if (level === 'info') this.output.log(message);
    else this.output[level](message);
  }
  onApplicationShutdown(): void { this.context.disable(); }
}
```

JSON 输出中，pid 和 timestamp 在外层，业务字段位于 message。INFO 对应 ConsoleLogger 的 log 级别，debug 用于正常依赖细节，warn 表示被拒绝或中断的请求，error 表示内部失败和异常关闭。LOG_LEVEL=info 会省略 store.completed，但保留 store.failed；需要定位延迟时临时提高到 debug，不能因为缺少一行 debug 就断言没有调用存储。

withRequest 使用 Node 的 AsyncLocalStorage.run 建立异步上下文。它不是把编号放进一个全局 currentId 变量；两个交错请求的 Promise 和计时回调能各自取到创建它们时的编号。存储包装层无需新增 requestId 参数，业务 Service 也不因此依赖 Express Request。上下文只在当前进程中传播，不会自动跨网络或消息队列。更细的机制与事件回调边界放在章末支线。

### 观察入口必须早于可能失败的处理

只在 Controller 的 Interceptor 里记录入口，会漏掉 Middleware 的非法 JSON、方法拒绝和文档资源请求。因此观察 Middleware 要放在 Swagger 与已有边界之前。新增 `src/request-observation.ts`：

```ts
import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';
import { HttpError } from './http.js';

export function requestObservation(logger: AppLogger, state: ApplicationState, knownPaths: readonly string[] = []): RequestHandler {
  return (request, response, next) => {
    const requestId = randomUUID();
    const started = performance.now();
    const method = ['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(request.method)
      ? request.method : 'OTHER';
    const path = request.url.split('?')[0] ?? '';
    // Route labels are constants, never raw paths or resource IDs.
    const route = knownPaths.includes(path) ? path : path === '/captures' ? '/captures'
      : /^\/captures\/[^/]+$/.test(path) ? '/captures/:id'
      : path === '/openapi.json' || path === '/docs' || path.startsWith('/docs/') ? 'docs' : 'unmatched';
    response.setHeader('X-Request-Id', requestId);
    logger.withRequest(requestId, () => {
      logger.write('info', 'http.started', { method, route });
      let reported = false;
      const complete = (aborted: boolean) => {
        if (reported) return;
        reported = true;
        logger.withRequest(requestId, () => logger.write(aborted ? 'warn' : 'info',
          aborted ? 'http.aborted' : 'http.completed', {
            method, route, status: aborted ? undefined : response.statusCode,
            durationMs: Math.round(performance.now() - started),
          }));
      };
      response.once('finish', () => complete(false));
      response.once('close', () => complete(!response.writableFinished));
      if (state.draining) {
        response.setHeader('Connection', 'close');
        next(new HttpError(503, 'Service is shutting down', 'SERVICE_DRAINING'));
      } else next();
    });
  };
}
```

我们记录固定的 `/captures/:id` 标签而不是实际 id，更不会把 q 的内容记下来。未知路径统一为 unmatched；实验可以显式提供已知固定路径。标签只用于定位入口，不决定路由是否有效，原有 httpBoundary 仍负责方法、路径与查询数量规则。

finish 说明服务端已经把响应数据交给底层发送，不证明客户端读到并理解了内容。close 也会出现在正常完成之后，不能遇到 close 就记录失败；这里通过 writableFinished 区分，并用 reported 保证只记一次完成事件。回调显式捕获 requestId 并重新进入上下文，避免依赖事件发出位置恰好保留了同一个上下文。

state.draining 时返回可识别的 SERVICE_DRAINING，Connection: close 提示结束当前连接。这个判断在正文读取与业务写入之前，避免接受了新工作才发现要停服。所有能走到此 Middleware 的应用请求都有 X-Request-Id；如果 HTTP 报文在 Node 解析阶段就非法，应用根本没有收到 Request，不能承诺它也带应用编号。

`src/app.ts` 的组装顺序如下：

```ts
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { captureBody } from './capture-body.js';
import { httpBoundary } from './http-boundary.js';
import { SwaggerModule } from '@nestjs/swagger';
import { createOpenApiDocument } from './openapi.js';
import { loadConfig } from './config.js';
import type { AppConfig } from './config.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';
import { requestObservation } from './request-observation.js';

export async function createApp(
  config?: AppConfig,
  logger?: AppLogger,
): Promise<NestExpressApplication> {
  config ??= await loadConfig();
  logger ??= new AppLogger(config.logLevel);
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config, logger), {
    logger: false,
    bodyParser: false,
    abortOnError: false,
  });
  app.set('query parser', 'simple');
  app.use(requestObservation(logger, app.get(ApplicationState)));
  if (config.docsEnabled) {
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

框架自动启动日志在这里关闭，由同一套 JSON 事件记录应用生命周期；这让 app.ready 具有明确的监听成功含义，也避免把未筛选的框架异常信息直接混入应用日志。关闭框架日志意味着初始化故障的细节需要开发调试器补充：在启动前使用 build/launch 或 debug，开启已捕获异常暂停，查看抛出位置，分享时仍清理敏感变量。

### 依赖耗时与响应耗时不能混为一谈

不把日志塞进每个业务方法，我们在第九章的 CaptureStore 边界外包一层。`src/observed-capture.store.ts`：

```ts
import type { CaptureStore } from './capture-store.js';
import type { Capture, CaptureListOptions } from './capture.js';
import { AppLogger } from './app-logger.js';
import { ApplicationState } from './application-state.js';

export class ObservedCaptureStore implements CaptureStore {
  constructor(
    private readonly inner: CaptureStore,
    private readonly logger: AppLogger,
    private readonly state: ApplicationState,
  ) {}
  private async call<T>(operation: string, work: () => Promise<T>): Promise<T> {
    const started = performance.now();
    return this.state.track(async () => {
      try {
        const value = await work();
        this.logger.write('debug', 'store.completed', {
          operation, durationMs: Math.round(performance.now() - started),
        });
        return value;
      } catch (error) {
        this.logger.write('error', 'store.failed', {
          operation, code: 'STORE_FAILURE', durationMs: Math.round(performance.now() - started),
        });
        throw error;
      }
    });
  }
  insert(capture: Capture): Promise<void> {
    return this.call('insert', () => this.inner.insert(capture));
  }
  list(options: CaptureListOptions): Promise<Capture[]> {
    return this.call('list', () => this.inner.list(options));
  }
  find(id: string): Promise<Capture | undefined> {
    return this.call('find', () => this.inner.find(id));
  }
}
```

包装层只观察操作名与耗时，传递原结果、重新抛出原错误；它不把失败变成空数组，也不把写入成功提前。计时使用 performance.now 的单调时钟，不用两个可能因校时跳变的日期相减。durationMs 包含该调用内的等待，不是数据库服务器纯执行时间，更不能据此推断连接池等待或网络各占多少；后续接真实依赖时再细分。

CapturesModule 中保留 MemoryCaptureStore 实例，并用工厂提供同一个 CAPTURE_STORE 令牌：

```ts
MemoryCaptureStore,
{
  provide: CAPTURE_STORE,
  useFactory: (store: MemoryCaptureStore, logger: AppLogger, state: ApplicationState) =>
    new ObservedCaptureStore(store, logger, state),
  inject: [MemoryCaptureStore, AppLogger, ApplicationState],
},
```

失败出口则由 ProblemFilter 统一记录稳定错误码，`httpFailure` 只做转换，不再自行打印。这样不会把同一个异常的任意 message 和 stack重复输出。更新后的 `src/problem.filter.ts`：

```ts
import { Catch, Inject } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { httpFailure, sendJson } from './http.js';
import { AppLogger } from './app-logger.js';

@Catch()
export class ProblemFilter implements ExceptionFilter {
  constructor(@Inject(AppLogger) private readonly logger: AppLogger) {}
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (response.destroyed || response.writableEnded) return;
    if (response.headersSent) {
      this.logger.write('error', 'http.failed', { code: 'RESPONSE_ALREADY_STARTED' });
      response.destroy();
      return;
    }
    // A failed response must not advertise the success-only resource location.
    response.removeHeader('Location');
    const failure = httpFailure(error);
    this.logger.write(failure.statusCode >= 500 ? 'error' : 'warn', 'http.failed', {
      status: failure.statusCode, code: failure.body.code,
    });
    sendJson(response, failure.statusCode, failure.body, {
      'Content-Type': 'application/problem+json; charset=utf-8',
    });
  }
}
```

一次依赖失败可能同时出现 store.failed 与 http.failed：前者说明失败发生在存储调用，后者说明 HTTP 最终如何回应；它们不是两次业务失败。响应已经开始后再抛错，只能记录 RESPONSE_ALREADY_STARTED 并中止连接，不能改写成一个看似完整的 500 JSON。

构造参数改变后，还要适配第十二章的独立管线实验。`src/labs/request-pipeline.ts` 中的 TraceFilter 继承了 ProblemFilter，原来的 `super()` 现在缺少 Logger，类型检查会失败。在该文件导入 `AppLogger`，并将 TraceFilter 的构造器改为：

```ts
constructor(private readonly name: string) { super(new AppLogger('info')); }
```

导入路径是 `../app-logger.js`。这个实验手工创建 Filter，只观察阶段顺序，因此显式提供自己的 Logger；它没有接入本章的 requestObservation，不能期待阶段日志自动具有请求编号。主应用仍由 RuntimeModule 提供同一份 Logger，并由容器注入 ProblemFilter，不能把实验的手工构造方式复制回主应用。

OpenAPI 也要描述 X-Request-Id 响应头及 503／SERVICE_DRAINING。在 `src/openapi.ts` 的 `createOpenApiDocument` 中，把原来的 `return { ... }` 改为 `const document: OpenAPIObject = { ... }`，保留已有路径和组件定义，然后在函数末尾加入：

```ts
  for (const path of Object.values(document.paths)) {
    for (const operation of [path.get, path.post]) {
      if (!operation?.responses) continue;
      operation.responses['503'] = problem('Shutdown in progress; code SERVICE_DRAINING');
      for (const response of Object.values(operation.responses)) {
        if (!response || '$ref' in response) continue;
        response.headers = { ...response.headers, 'X-Request-Id': {
          description: 'Server-generated correlation ID; not an idempotency key.',
          schema: { type: 'string', format: 'uuid' },
        } };
      }
    }
  }
  return document;
```

这段遍历当前已有的 GET 和 POST 操作，先增加 503，再给各响应补关联头；展开原 headers 是为了保留 Location 与 ETag。`$ref` 指向的响应没有内联字段，不能直接当作 ResponseObject 修改；当前各响应都以内联对象定义，后续若提取为引用，需要在引用目标上补齐。重新构建并导出文档，核对 201、400、304 和 503 都保留各自原有含义并声明关联头。文档声明不会替应用生成头，真正的设置仍在 requestObservation。

成功 JSON 和 Problem 的字段没有因此改变，条件 GET 仍可返回无正文的 304；请求编号仍随这次响应产生，不要把它当作记录 ID 或缓存内容。

### 保存失败事实，再决定用日志还是断点

先在终端保存开发输出：

```bash
mkdir -p logs
LOG_LEVEL=debug npm run dev 2>&1 | tee logs/dev.log
```

这些命令沿用本书的 macOS、Linux 或 WSL shell。文件中会有 npm 和编译器的非 JSON 行，也有应用的 JSON 行；这不表示所有终端输出都满足一个 JSON 文件格式。日志保存在本机，分享前仍检查内容，长期采集与轮转不靠无限增长的 tee 文件解决。

在 Postman 的创建请求点击 Send，查看响应 Headers 的 X-Request-Id。复制编号，在编辑器打开 logs/dev.log 搜索；应关联 http.started、store.completed(insert) 和 http.completed(201)。将 Body 改为 `{"originalText":7}` 后再发一次，取得新的编号；应有 VALIDATION_ERROR 和完成状态400，没有对应的 store.completed(insert)。把 Body 改成非法 JSON，又会在更早的读取边界失败。这里不是凭“没看到写入”下结论，而是结合已启用 debug、稳定的编号和入口/出口证据判断。

需要精确筛选时，使用配套 `examples/filter-logs.mjs`，把响应中的编号作为第一个参数：

```bash
node examples/filter-logs.mjs 00000000-0000-0000-0000-000000000000 < logs/dev.log
```

示例中的全零编号不会匹配真实请求，运行时替换成刚才复制的值。脚本逐行解析 JSON，跳过编译器文本，只保留 message.requestId 精确相等的行；它不会通过原文搜索来猜测请求身份。也可以继续在编辑器按编号查找，日常无需为了查看几行日志安装平台。

若 HTTP 总耗时明显高于存储耗时，先看客户端是否正在慢速发送正文、调试器是否暂停、输出校验或序列化是否占用时间，再增加有目的的观测点。不要根据一条内存存储的毫秒值认定生产数据库也会同样快。需要查看具体分支和局部变量时，在 requestObservation、SchemaPipe、ObservedCaptureStore.call 与 ProblemFilter.catch 设置断点；断点会改变请求时序，不适合测量正常延迟或判断关闭期限。

日志适合在不暂停的情况下重建交错顺序，断点适合观察一次执行中的值。修复后用同一份保存请求复验，取得新的编号，比较错误码、状态和调用边界是否按推导变化。不要在断点停住十秒后，用超时日志指责五秒关闭期限“不可靠”。

本章完成状态保存在 `part-02/chapter-13`。检查继续使用 `npm run check`，最小 HTTP 断言继续用 `npm test`；需要验证真实网络时必须看到客户端收到响应，进程日志不能替代它。生产产物不含 labs，开发资源实验不能混进交付接口。下一章将沿一次完整请求回顾第二篇，并改变配置与执行条件检验这些职责能否接起来。

时间参考（估算）：只阅读约 85～100 分钟；配置、日志与关闭实验另加约 55～70 分钟，合计约 140～170 分钟。按约8000个汉字、550行代码与命令，以及正常/失败启动、请求关联、处理中关闭和期限对照估算，尚未经过读者实测；支线单列，首次安装环境不计入。

## 本章知识支线

- [支线 13A：请求编号为什么不会串到另一个请求](side-01-async-context.md)：从全局变量错误开始，解释异步资源继承、事件触发位置、绑定与上下文寿命，再判断后台任务应如何传递身份。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| Zod safeParse／transform | 把启动字符串变成有效配置 | 转换前验证表示；错误不回显原值 |
| DynamicModule／useValue | 注入已解析的唯一配置 | register 是自定义方法；同应用只登记一次 |
| global 模块 | 共享少量运行基础设施 | 不自动跨容器，不推广到所有业务模块 |
| onModuleInit／onApplicationBootstrap | 初始化资源和应用 | 完成不代表 HTTP 已监听；失败要清理已申请部分 |
| onModuleDestroy／关闭钩子 | 由资源拥有者释放资源 | 默认关闭顺序不保证请求已结束 |
| server.close／closeAllConnections | 正常排空和超时中止 | 后者会中断活动请求；不取消已经完成的副作用 |
| SIGINT／SIGTERM | 请求停止进程 | 只保留一个协调者；强制结束不能保证 finally |
| AsyncLocalStorage.run／getStore | 在异步链内关联请求 | 不跨进程；全局变量与事件注册不是同一机制 |
| ConsoleLogger JSON | 结构化事件输出 | 应用字段在 message；不记录原文、凭据和原始异常 |
| performance.now | 测量本进程经过时间 | 包含等待，不等于依赖服务端纯执行时间 |
| X-Request-Id | 从响应找到日志 | 服务端生成；不用于权限、幂等或去重 |

官方查阅：[Nest 配置](https://docs.nestjs.com/v11/techniques/configuration)、[动态模块](https://docs.nestjs.com/fundamentals/dynamic-modules)、[生命周期](https://docs.nestjs.com/fundamentals/lifecycle-events)、[日志](https://docs.nestjs.com/techniques/logger)、[Node 24 HTTP](https://nodejs.org/docs/latest-v24.x/api/http.html)、[异步上下文](https://nodejs.org/api/async_context.html)、[进程信号](https://nodejs.org/docs/latest-v24.x/api/process.html#signal-events)。实现以项目锁定的依赖为准；读取框架内部顺序用于判断行为，不把内部方法变成应用 API。

[上一章：请求经过 Nest 时发生了什么](../chapter-12-request-pipeline/chapter.md) · [下一章：第二篇回顾](../chapter-14-review/chapter.md) · [返回第二篇](../README.md) · [返回全书目录](../../README.md)
