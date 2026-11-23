# 第 21 章 让记录接口读写已有的 PostgreSQL 数据

第二十章结束时，PostgreSQL 里有原来的两条记录，有能从空库重放的结构历史，也有生成好的 Prisma Client。Nest 却仍然在使用 Map。这不是再建一套项目的理由：第十章留下的 `CaptureStore`，现在应该真正承担存储替换的边界。

本章检出 `part-03/chapter-21`，下一章检出 `part-03/chapter-22`；两份快照沿用同一套数据库读写实现。样例已经把数据库连接、故障分类和关闭钩子接好，两章使用同一批记录。若从前章手写，先按下节配置运行时，再从这份配套代码取连接所需文件，然后自己实现存储切换。下面首先验证一个没有通过 API 创建过的旧 ID，最后创建一条含特殊字符的新记录，供下章在重启后核对。

阅读约 125～155 分钟，接线、查询改写与写入核对另加约 55～75 分钟。可以在旧记录的列表和详情都读通后停下，下一次从创建前的数据库基线继续。

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

接手时可以先看一次详情调用对两端各有什么要求。上游拿着路径中的字符串，希望得到一条可向调用方展示的素材，或者得到“没有这条素材”。至于要读几张表、列名里有没有下划线，上游没有理由作决定。下游拿着一个数据库连接，却必须知道业务上允许返回谁的素材、时间用什么形式交回。把这几个判断留在存储实现中，同一条详情规则就能服务于 HTTP 以外的调用者。若把归属条件只写在 Controller，今天从网页读是对的，明天另一个入口直接调用 Service，就有了两套不同的详情含义。

可以用旧实现反推接口上容易漏读的约定。查不到指定键，Map 能正常完成查找，结果是空缺。换到数据库，查到零行也可以正常结束。倘若连接根本没有建立，则连“有几行”都不知道。两种情况都能让页面暂时看不到原文，调用方的下一步却完全不同。把驱动抛出的所有异常接住并返回空缺，会让故障看起来像一条可信的删除消息。如果列表也这样处理，一次故障就可能触发页面用空数组覆盖已有列表。这里的方法除了规定成功时返回什么，还要允许失败向外传播。

再读写入方法的返回类型。它不需要返回整条数据库记录，是因为当前业务在调用存储之前已经决定了将写入的所有公开值。这个接口成立有一个条件：数据库成功接受的就是这组值。如果未来改为让数据库统一生成创建时间，Service 手中的对象就少了一个权威值。届时应该让插入操作取回并交出生成的时间，再构造响应。继续使用今天的无返回值方法，另外在 Node 取一次当前时间，恰好会把数据库时间和回给客户端的时间分成两份。可见这个边界是从谁有权确定字段推出来的，换库时也要逐项复查。

沿图走一次失败路径还能看清两层包装各有什么用。配套中外层先把实际调用交给应用状态跟踪，然后等待里面的操作完成。里面能接触到驱动错误和连接池，适合记录具体操作与数据库错误码。外层只知道一次存储操作结束或失败，写完自己的观察记录后仍会抛出原异常。若在查日志时同时看到一次数据库失败和一次存储失败，先沿同一次请求对时间和操作名；它们完全可能来自这一条调用链。将两行日志各算成一次数据库请求，排错一开始就把次数数错了。

这也解释为什么实现里要传一个稍后才执行的函数。创建这个函数时只记住接下来要做的查询，真正调用它的代码有机会先登记工作、再等待结果、在异常经过时分类。若先把查询执行完，再把成功结果交给观察层，查询失败时这层连入口都到不了。前端也会用包装函数记录一次异步操作，这里多出来的约束是应用准备关闭时还得知道哪些被接受的工作尚未结束。请求发起者是否仍在等待，不能替数据库决定这笔操作的终态。

### 补上 Prisma 7 的运行时驱动

沿前章代码操作时，在项目根目录执行：

```bash
nvm use
npm install --save-exact @prisma/adapter-pg@7.10.1 pg@8.16.3
npm install --save-dev --save-exact @types/pg@8.16.0
```

Client、CLI、适配器统一为 7.10.1；pg 是实际连接 PostgreSQL 的运行依赖，`@types/pg` 只提供编译期声明。使用完成代码时按锁文件 `npm ci`。不能只在开发依赖安装适配器：生产产物里仍会导入它，即使 TypeScript 编译已经成功。

本章使用 Node 24 的 `String.prototype.isWellFormed()` 检查字符串，因此把 `tsconfig.json` 的 `compilerOptions.lib` 改为 `["ES2024"]`，`target` 继续保留 ES2023。lib 告诉编译器哪些内建 API 有类型声明，不会给旧 Node 安装 polyfill；真正运行能力由固定 Node 版本提供。

跟写到这里，可以把“装好了”分成两个可独立判断的问题。编辑器在模型上能提示 originalText，说明前章生成的类型中已经有这个属性。此时关掉数据库，类型提示照样存在。反过来，即使 DBeaver 能读到原文，只要当前工程缺少生成客户端，导入客户端的代码仍可能在编译时失败。一个结果来自工程里的文件，另一个来自运行着的数据库；换分支后出现缺模块或缺模型属性时，先在报错的导入位置确认用的是哪一份生成目录和 Schema，再决定要不要重新生成。去改数据库密码无法修复编译器找不到的文件。

即使编译、生成都通过，在实际运行入口仍有一次交接。客户端负责把模型操作交给适配器，适配器从传入的池取得通往 PostgreSQL 的连接。数据库管理员在 DBeaver 建立的会话并不共享给它。可以想象两个人打开同一篇原文，一人已有通行凭据，另一人手里只有表结构图；数据库照样会分别查验两个人。遇到启动失败，先辨认程序是停在加载模块阶段，还是已经运行到数据库初始化。前者还没有发起数据库业务读，后者才值得沿目标库、身份和表结构继续查。

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

为什么日常库与校验库的表一模一样，应用却只能直接在其中一个库上工作？看配套 DatabaseService 的 `onModuleInit`。它先连接数据库，再按固定 ID 读取开发用户，最后试读 captures 的四个业务列，三步都成功才记录 `database.ready`。第三步即使返回零条素材也能成功，用户还没写过原文本来就是合法状态。第二步若找不到用户，则以 `DEV_USER_MISSING` 记录启动失败：接下来每次创建都需要把这个 ID 写进外键，服务无法兑现写入承诺。

因此，若日志出现这个代码，在 DBeaver 中对照应用配置的主机、端口、库名，打开对应连接的 users 表，按固定 ID 筛选。若应用误连了第二十章故意保留为空的校验库，应修正应用目标并重启；在校验库补一行用户虽然能越过这次启动检查，却会把后面的新原文都写到另一个库。即使两个库碰巧都有同一个种子用户，启动检查也会同时通过，仍要从连接目标和实际记录确认用的是哪份数据。

从前章跟写时，在另一份配套代码目录打开 `part-03/chapter-21` 的完成快照，把 `src/database-errors.ts`、`src/database.service.ts`、`src/database.module.ts` 及配套版本的 `src/app-logger.ts`、`src/http.ts` 接入自己的工程。后两个已有文件的变动分别给数据库事件增加日志字段、给存储失败增加 HTTP 出口；若自己改过相应文件，请对照差异合并。再复制配套的 `database/chapter-19/` 和 `requests/chapter-19.postman_collection.json` 供验证。配置、资源和依赖都到位后先运行 `npm run check`。此刻手写项目仍在使用内存存储。

把配置带回一次具体的交接。前一位同事在校验库完成迁移，终端里的 CLI 报告已经应用，DBeaver 的日常库标签上也能看到 captures。接下来由你启动服务。这里其实有三个各自选目标的动作：迁移命令从它的配置取地址，图形客户端按编辑器关联的连接执行语句，服务按启动进程拿到的配置建池。即使都在同一台开发机上，也不存在一个“这台机器当前选中的数据库”。在 DBeaver 切换到另一个库，再次发送 Postman 请求，正在运行的 API 仍然使用原先的连接配置。这能解释为什么图中点对了表，应用却似乎一直读旧结果。

校验配置时要问两层不同的问题。第一层可以只靠读字符串回答，例如池上限写成小数是否符合本服务的取值规则，URL 是否明确给出了库名。第二层必须真的访问目标才能回答，例如密码能否认证、那张表是否在这个库的 public 中。即使第一层通过，也有可能把正确格式的密码配给了错误的角色。反过来，配置字段在解析阶段就被拒绝时，反复在 DBeaver 测试连接成功也无法越过它。若字段名指向池上限，核对的是十进制正整数和上界；若指向调试开关，还要同时看启动模式。不要为查这个问题把整份环境贴进日志。

观察启动探针时，不妨在纸上画两个内容完全相同的库结构。甲库只有固定用户，没有素材；乙库只有空表。先猜哪一个能启动。读用户时，甲库能交出那一个 ID，乙库只能交出空缺，到了这里两条路径已经分开。甲库接着查询指定的素材列，表中没有行不妨碍数据库解析列名和执行查询，于是可以报告就绪。再把甲库想成有用户但素材表还缺时间列，即使没有任何素材，查询也不能顺利执行。按具体列试读比只查一张表有几行多验证了一件事情：这份运行程序使用的列确实能在此处读出。它仍没有试插一条业务行，因此不能把就绪事件当作创建已经验收。

这一点决定了何时值得动数据。探针失败后先读启动事件中的代码，回到对应数据库用只读查询确认固定用户。若在图形界面看到了用户，应用却说缺失，还可以核对图形会话里的事务状态。假如这条用户记录刚由你在手动提交的窗口插入，该窗口内的查询可以读到自己的修改，应用的独立连接却读不到未提交的行。先弄清该事务本来打算做什么；前章用来回滚的演示数据不能因排错顺手提交。用同一目标的新连接查一次，就能把“只在原窗口可见”与“两个连接其实去了不同库”拆开判断。

探针通过以后也有一个便宜的交叉检查。先挑前章通过 SQL 写入的一条素材，抄下完整键和原文，再启动应用走详情。如果改成先由 API 新建一条、马上在 API 中读取，两步都可能在错误的库上成功。用已知来源的旧键，就多了一项独立证据。若两库都是从同一份种子生成，连这项检查都可能相同，此时应回到真实连接的库名和端口作区分；不能为了让目标“看起来对”而复制更多数据。接下来的读取一节就从这条独立的旧记录开始。

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

`$queryRaw<Row[]>` 的泛型告诉 TypeScript 预期拿到哪些字段，数据库返回时仍须核对实际行。如果把 SQL 中别名写错，泛型不会替数据库验证；后面的映射和响应检查会失败。改 raw SQL 时必须核对实际行，不能把编译通过当成查询已经正确。

为什么详情查询直接写 createdAt，列表的 SQL 却要写 `c.created_at AS "createdAt"`？详情由生成的客户端翻译，知道模型上的 `@map`；列表把 SELECT 直接交给 PostgreSQL，结果对象的键取自查询输出的列名。连双引号也有作用：写成 `AS createdAt`，PostgreSQL 会把未加引号的名字折叠成小写，返回 createdat。若改完 SQL 后详情仍是 200，列表却在时间转换处失败，可先在 DBeaver 执行 SELECT 部分（保留 FROM），看结果网格列头，再对照 project 取的属性。两个入口共享同一个 project，但传给它的行来自两条路径。

先把这条 SELECT 当作接手时要自行写的一条查询。产品给的输入是一个可有可无的关键字和一个可有可无的条数，结果中每个元素都应当是一笔素材。确定这个粒度后，只需从素材表起步。归属键已经保存在这一行，当前既不需要用户名称，也不需要按照用户的其他属性筛选，因此可以直接比较 user_id。再连用户表只为取回同一个键，会给读者一个错觉，好像只要连过用户表就已经限制了范围。实际把素材和它的主人配上，仍可能把每个主人的素材都列出来，限制某一个主人还得有等值条件。

到这里可以先略去选取哪些输出列，手算一遍候选行。假设开发用户有甲、乙两条，另一位用户有丙一条，乙和丙都写了 learning。只按原文查会得到乙、丙，两条都确实含有那个词，因此逐句检查原文本身发现不了错误。先要求归属等于开发用户，候选行只剩甲、乙；再要求命中关键字，只剩乙。现在去掉关键字，应该回来甲、乙，丙仍然不出现。这给编写可选条件一个约束：关键字的有无只能影响第二次筛选，不能决定是否附加第一次筛选。两张只含同一用户的种子行无论如何比较都发现不了漏写归属，这个纸面上的第三行便有了作用。

选好行以后再读投影。WHERE 可以读取归属键而不在 SELECT 中交出它，ORDER BY 也可以依据数据库中的值来排序。不能因为响应不显示归属，就在整理 SQL 时把归属从整条查询中一起删掉。相反，如果把数据库里的原始行全部取出，再在 Controller 里删除当前不需要的字段，每增加一个内部字段，都得重新确认所有出口是否记得删除。明确列出要交出的三列，后续数据库新增字段时，接口能继续只履行现有承诺。这个选择同时减少了流入 Node 的数据，但先把它写对的理由是接口含义。

这里有两个常被混为一谈的“小写”。数据库表里的 created_at 是含下划线的列名；未引用别名 createdAt 得到的 createdat 是另外一个拼写。给前者套上双引号并不会自动得到驼峰名，双引号只让数据库按你写的字符解释标识符。要自己找到改错位置，可以在 DBeaver 的 SQL 编辑器先选同一个物理列两次，一次取未加引号的别名，一次取带双引号的别名。网格里的两个值相同，列头却不同。把这行想成 JS 对象，点访问时取键的拼写必须和列头一致，数据库中能查到正确的时间值并不足以保证 project 能拿到它。

行数也会掩盖映射错误。假如列表 SQL 返回的列名有误，在空库上发送列表请求，空数组调用 map 时一次也不会执行 project，随后响应可能完全正常。恰好又用一个不存在的键测试详情，也只能验证空缺分支。至少有一条已知应命中的素材，才能让代码真正经历“取到行、读属性、转时间、序列化”这段路。反过来，若所有请求都只用存在的键，正常响应也无法说明找不到时会落到业务约定的错误。两条路径对样本的要求不同，不能靠增加同一种成功请求的次数弥补。

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

若应用已经打印就绪，页面列表却像刚启动的空 Map，可以沿工厂的实参定位。先看 Service 构造时通过哪个令牌取存储，再看提供这个令牌的工厂把谁传给外层包装，最后看里层调用的是哪个 client。TypeScript 接口在运行时没有可供容器查找的对象，两个实现的方法签名又完全可以相同，所以类型检查不会因为接成旧实现而失败。只导入了数据库模块，足以让初始化逻辑有机会运行，仍不能说明处理请求的 Service 已经改用这个模块提供的资源。在项目里搜到一个新类，也不能代替核对实际工厂的接线。

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

用一个具体钟面演算这个故障，比记住把时区配成什么更容易接手。种子中的八点带 Z，表示零偏移下的八点。在东八区，同一时刻的钟面已经走到十六点，文本末尾的加八恰好说明读者需要减去这八小时才能换成零偏移钟面。若读取代码只保留十六点这个数并把后缀写成 Z，就等于宣称真实时间又过去了八小时。格式看起来依旧很标准，甚至毫秒也一个没少，只有和种子所代表的时刻相比才看得出问题。把页面最后展示的本地时间再加减一次，只会让正确的记录也受影响。

写入方向可以反过来推。假定应用要保存零偏移八点，发送的文本却只有八点而没有偏移，数据库会用连接自身的时区解释这个钟面。若该会话在东八区，存下的就是零偏移零点。随后由同一套有偏差的读取逻辑把东八区的八点读成零偏移八点，HTTP 两次显示完全一致，数据库中的实际时刻却提早了。把输入输出画成这一圈以后，就知道该在哪儿截断自证：读路径用带明确偏移的独立种子作输入，写路径用数据库算出的 epoch 检查落盘结果。两个方向各有一个独立参照。

对照时注意小数点的位置。数据库算出的是秒，JS 中 Date 的数值按毫秒计。对这条种子，在终端输入 `node` 进入交互提示符，用 `Date.parse('2026-10-31T08:00:00.123Z')` 得到的应是 1793433600123；把数据库的秒乘一千，也应当落在这个整数上。末尾的零只是数据库显示小数位的方式。若两边整数相同，只是一个窗口显示十六点，另一个显示八点，改写库里的值反而会制造真正的偏差。若整数相差二千八百八十万，才有了相差八小时的量化证据；还要结合已知种子或创建响应，分清偏差来自读取还是写入。

### 为什么这里没有直接使用 contains

原来的 `q` 是大小写敏感的字面子串。例如搜索 `%`，应只找到包含百分号的原文。Prisma 的常用字符串 contains 在 PostgreSQL 中可能经 LIKE 表达；SQL 参数化能阻止输入变成 SQL 结构，却不会自动取消 LIKE 的通配语义。把 `%` 作为安全参数传入，仍可能扩大匹配范围。这是“安全”和“符合业务含义”两个不同问题。

可以继续使用 contains，但要针对当前生成 SQL 的 LIKE 规则正确转义反斜线、百分号和下划线，并持续维护该约定。本章沿用第十九章已经推导过的 `strpos`：找到字面片段时返回正的位置，否则返回 0。显式 `COLLATE "C"` 固定当前文字比较方式，不增加大小写折叠或 Unicode 规范化；预组合字符和组合序列也不会被自动当成同一段字符串。

只在这个查询中使用参数化 SQL，是为保持准确含义，不是放弃 ORM。详情与创建仍使用模型 API。`Prisma.sql` 是标记模板，`${text}` 进入参数值，动态 SQL 结构只有我们自己选择的固定片段。不要先生成普通插值字符串，再交给 `$queryRawUnsafe`；那会把第十九章建立的结构和值的边界重新打破。表名、列名和排序方向都是固定代码，当前没有接受用户 SQL 的入口。

空查询条件使用 `Prisma.empty`，意味着不附加该条件；提供了空白 q 则在入口拒绝，不把它偷偷当成“没有筛选”。`limit` 同样只有明确提供时才加入，始终发生在筛选和排序之后。

从页面搜索框到数据库还有一处容易看漏的翻译。界面参数叫 q，进入 Service 后字段叫 text；列表条数在 URL 中是文本，经过请求管道校验后才变成数字。配套的管道先用 Schema 处理输入，再把两个值放进存储认识的 options。于是存储接到的数字一已经满足条数范围，可以用于 LIMIT；字符串形式的前导零在更早的入口就已拒绝。如果直接在控制台调用 Service，应按内部参数的名字和类型传值。以有两条种子的库为例，在 JS 中直接传 `{ q: "learning" }`，Service 只解构 `text` 和 `limit`，两者都没有值，于是两条都会返回。若再传 `limit: "1"`，字符串过不了整数检查，Service 会在查询前抛出 `InvalidCaptureError`。改用 `{ text: "learning", limit: 1 }` 才与经过管道的网页请求等价，标准种子中只剩尾号二。

以搜索 cook 为例，第一条种子的两端各有空格，目标片段仍出现在句子中。第二句结尾也是 cook，同样能命中。把搜索值换成带尾随空格的 `cook `，两句中紧随 k 的都是句点，应当都落选。这里要保存的不只是原文的空格，还有过滤条件本身的空格。入口检查“是不是只含空白”并不授权把非空白查询修剪后再搜索。否则页面里用户输入的值、服务执行的值和 DBeaver 手工对照的值会变成三件事。匹配结果空了时，先看 Params 中实际勾选的键和值，再用同一个值检查原文片段。

在 DBeaver 里可以先让数据库告诉你原因，再写最终过滤式。取两条种子的完整 ID 和原文，在 SELECT 中再加一列 `strpos(original_text COLLATE "C", 'learning') AS pos`，暂时不要把这个表达式放到 WHERE 中。第一句没有这个片段，位置是零；第二句开头的 I、撇号、m 和空格一共占四个字符，learning 的起点是五。现在才把位置大于零写进 WHERE，零对应的行被排除，位置五对应的行保留。如果沿用 JS 的 indexOf 思路去判断“大于等于零”，没命中的第一句也会被保留下来。两个语言都返回数字，要先看清各自拿哪个数表达缺失。

同样的方法能解释为什么需要区分缺省和空串。未提供关键字，生成的 SQL 可以完全没有片段条件；这说明请求方要浏览归属范围内的记录。若把缺省替换成空串传给位置函数，空片段会匹配到字符串的起点，对这两行样本恰好也得到“全有”。但这样无法向调用方交代为什么显式提交一个空查询应当得到字段错误。仅凭两个列表恰好相等推断实现可以互换，就会漏掉错误分支。先判断请求是否表达了一个有效筛选，再谈它在库中能命中几条。

### 顺序不能靠 ORM 默认值碰运气

Map 按插入先后遍历，而关系查询没有天然顺序。这里落实第十九章确定的 `created_at ASC, id ASC`：时间相同再按 UUID 排序。因此它是稳定的时间顺序，不等于精确的写入先后，也不等于事务提交顺序。

前章两条记录有相同毫秒时间，ID 尾数 1、2，列表应按这个次序出现。如果两个 HTTP 请求恰好在同一毫秒生成记录，UUID 的顺序可以与请求到达顺序不同。依赖旧 Map 顺序的客户端必须调整理解；文档与 OpenAPI 已将此变化写明。若产品要求严格的事件先后，需要另外定义可保存的顺序事实，不能假装随机 UUID 编码了它。

“第一条”还取决于在哪里筛选。以两条种子为例，只有尾号 2 的原文含有 learning。如果先取一条，再用 JavaScript 过滤，取到尾号 1 就会返回空数组。按需求先筛选，剩下尾号 2，再取一条就能读到它。这个先后说的是结果应怎样算，数据库执行时可以自行选择扫描路径。

没有 limit 时仍返回全部匹配记录，保持原接口范围。`LIMIT 10` 也不等于数据库只检查十行：筛选和排序可能处理更多行。本章建立查询正确性和连接上限；数据增长后还需分页与执行计划设计，第 32～35 章继续展开。当前不要为了看起来“生产化”悄悄加默认 100 条，让已有调用方漏数据。

换个要求检验这条排序能否独立改写。假如页面要显示“最近收集的一条含 cook 的素材”，先在两条种子上预测答案。两条都命中，时间也相同，因此“最近”这个词本身还不能交给你一个确定的 ID。和调用方约定并列时仍选较小的 ID，则时间应降序而 ID 应升序；若约定沿当前列表从末尾向前取，则两个方向都反过来。标准种子在第一种约定下应出尾号一，第二种才出尾号二。在 DBeaver 新开一个只读查询，用上面得到的位置条件自己写出这两个版本，各取一行，再与预测的完整 ID 对照。两次查询都只需要现有素材，不用调整对外接口。

为什么只用这两条还不能核实“最近”？因为交换时间的升降方向，对一个所有时间都相同的结果集没有影响。如果有一条更晚且也包含 cook 的记录，无论前两条如何打破并列，它都应排在最前。可以在查询编辑器里临时用下面的结果集作 FROM 的来源，把刚写的两个排序放回去，替换掉外层的试读 SELECT。这里的编号只是让你认出各行，第三行没有写入素材表。

```sql
WITH sample(id, original_text, created_at) AS (
  VALUES (1, 'cook', timestamptz '2026-10-31 08:00:00.123+00'),
         (2, 'cook again', timestamptz '2026-10-31 08:00:00.123+00'),
         (3, 'cook later', timestamptz '2026-11-01 08:00:00+00')
)
SELECT id, original_text, created_at FROM sample;
```

第三行出现后两种约定都该选三。再只把第三行的文字换成 read，最新时刻虽然仍在表内，却不再属于要挑选的集合；答案应重新分开。这样可以看出错误究竟是比较时间的方向反了，还是先在全表拿最新，再去判断这个人要找的词。把这个推导带回现行接口时，记得它承诺的是时间升序。改变问题是为了找出查询里哪部分对应哪条约定，不能把演算中的降序悄悄交付给原调用方。

### 详情的不存在与类型错误

数据库 UUID 类型会把 `not-a-uuid` 拒绝为类型输入错误，旧 Map 则只会查不到。把这次异常当 500 会使存储替换改变无效详情路径的结果。因此先识别本服务使用的规范小写 UUID 文本，其他路径直接作为 miss；再把合法 ID 与固定 userId 一起查询。不存在返回 undefined，由已有 Service 转为 404。

这里不把大写、无横线等 PostgreSQL 也能接受的表示规范化后查询；原来的路径契约使用创建返回的字面 ID，没有承诺它们是别名。合法但属于别的用户的行同样不返回，然而“固定开发用户条件”仍不是鉴权：每个调用者此时都使用同一个用户范围。服务继续绑定本机，不把它部署成多用户公开应用。

切换到数据库后，接口描述也要反映本节已经落实的行为。在 `src/openapi.ts` 将版本改为 0.3.0，列表说明写明 `createdAt ASC, id ASC`；三个操作的公共响应中增加 503／STORAGE_UNAVAILABLE，并保留 SERVICE_DRAINING 的说明。21.3 再随 Unicode 校验更新字段描述。文档版本不会自动改变代码，这里是同步已经实现的行为。

### 在 Postman 和 DBeaver 对照同一批行

先在 DBeaver 日常连接打开 `database/chapter-19/01-inspect-api-data.sql`，执行身份与列表查询。确认 `epp_dev / epp_owner / 55432`，原来的两条记录和空格仍在。若前章已经增加过合法记录，应保留它们并记下自己的基线，不为凑两行而删数据。

`npm run check` 后启动 `npm run dev`。顺序应是数据库完成初始化，再出现 `app.ready`。在 Postman 导入 `requests/chapter-19.postman_collection.json`，先发送“01 已有列表”和“02 前章固定详情”。不要先 POST：读取 SQL 阶段已经存在的行，才证明接口连到了同一份事实。

要观察刚才推算的“第一条”，在请求 01 的 Params 中填入键 limit、值 1，再填入键 q、值 learning。先取消勾选 q 发送一次，再勾选 q 发送一次，比较两次响应的 `items[0].id`。两条种子对应的结果依次是尾号 1、2。若此前还收集过其他原文，查 DBeaver 中同一用户的有序列表：第一遍取首行，第二遍只在包含 learning 的行中取首行。这样即使自己的结果与书中不同，也能判断查询是否正确。

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

在 VS Code 附加到刚才启动并接收请求的 dev 进程。若要核对模块接线，在 `PrismaCaptureStore.find` 的入口设置断点，用 Postman 请求 02 再发一次已知旧键。停下后先核对参数是不是那条完整的 ID，再往下看是否进入带归属条件的查询。若断点未命中，先核对请求的端口与调试器附加的进程，再检查工厂交给外层包装的存储实现。若是其他输入在格式检查处就返回，数据库还没有收到查询。继续执行，核对 Postman 中这次请求的响应，再取消入口断点。

接下来在同一进程的 `prisma-capture.store.ts` 中，给 `project` 返回对象处设置断点，重新发送详情 GET。黄色行表示程序停在这里；此时可以在 Debug Console 输入下面的表达式，把内部类型、输出值和输出类型放在一起比较：

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

从 Postman 看，没收到 201 时，为什么不能直接再按一次 Send？设想数据库已提交，连接在返回 Location 前断开。再发同一份正文，Service 会重新生成 UUID；两条原文相同、主键不同，主键和外键都会放行。按原文搜索也无法认领某一条就是刚才的请求，因为产品允许重复收集同一句话。拿到了响应 ID，就可以用详情和数据库按 ID 对账；丢的是整个响应时，当前接口没有让调用方凭原请求唯一查回结果的标识。这也是配套集合把创建和核对拆成两个请求的理由。

沿正常的创建逐步追一次 ID，能看清哪些证据是后来才出现的。Service 生成键时，只能说已经为这次调用挑好了一个候选键。此时若停在写入之前，DBeaver 按这个键查不到，完全符合预期。等插入成功以后，Service 才把素材对象交回 Controller，Controller 据此拼出 Location。于是一个成功响应有两处可以互查：正文中的 id 和 Location 的末段应逐字符一致。再拿这个路径按原端口发详情请求，才验证了“返回的资源地址可读”。仅有状态码和看起来正确的原文，还可能漏掉一个不能使用的地址。

为何插入的 select 只取键，Service 却能返回原文？当前快照里，捕获对象中的原文一路原样传给模型，创建时间也由这个对象转换成 Date 写入；库里对应列精度为毫秒。create 的结果用来等待这次写入成功，响应内容仍来自写入前构造的对象。由此可以推得一次很实际的排错顺序：如果 POST 显示两端空格都在，详情却少了空格，不能说插入一定正确。先按同一键在 DBeaver 读事实；若库中已经少了，追传给 create 的 data；若库中还在，追读路径和最终展示。只对着创建响应研究页面的渲染方式，会跳过唯一能裁决这两种解释的位置。

再看约束报错该落在哪里。假设服务启动后，有人在一个本可移除的空开发用户上改变了数据，下一次写入引用的用户已不存在。请求方既没传这个用户键，也无从选择另一位主人。此时让调用方“检查原文格式再试”解决不了任何问题。外键检查恰好让不一致暴露出来，阻止产生找不到主人的素材。值班人应沿数据库事件中的操作名定位到 insert，再核实固定用户及目标库，而不能在插入失败后改为随便选一个存在的用户重试。哪怕后者返回了正常的创建响应，归属已经写错，后续列表的结果也会随之改变。

并非每次数据库失败都说明请求含义错误。配套的 databaseFailure 会沿异常对象查找已知的暂时不可用代码，连接中断等情形可以走到对外的存储不可用响应；其余未识别的存储失败留作内部错误。对调用方，这保留了“现在无法完成”和“你提交的字段不符合规则”的差别。对维护者，内部日志能看到操作名与经过筛选的代码，却不需要为解释一次插入失败而暴露整条原文。若客户端只见到服务不可用，还应读响应里的业务码，应用正在排空也可能返回同一个状态码。下一章会观察等待和关闭的过程，这里先确保能找到这次请求经过的出口。

接手一个“刚刚可能点了两次”的反馈时，也可以从已知证据往前推。如果两次都收到了创建响应，先比两个键，再分别查详情。键不同且两条都可读，已经能确定有两笔素材；并不能由原文相同推断其中一笔必定应该删除。若只留下一次响应，则只有其中一个键能精确追踪。这个限制来自请求之间缺少可复用的标识，单纯延长前端等待时间只能减少部分误判。将来要让失败后的重试能够认回同一次创建，需要事先约定怎样标识一次提交，并使这个标识与落库结果保持一致；等到响应丢失后才由客户端补编一个号码，数据库无法倒推它属于之前哪次请求。

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

同一个 😀，JavaScript 的 `'😀'.length` 是 2；在 UTF-8 的数据库执行 `SELECT char_length('😀'), octet_length('😀');`，得到 1 和 4。三个数字分别数 UTF-16 单元、数据库字符和存储字节。因此只由这个表情组成的原文，1000 个恰好达到 API 上限，1001 个已经超限，在数据库中却仍只有 1001 个字符。若希望其他写入程序也遵守接口限制，照抄一个 `char_length(original_text) <= 2000` 还不能得到相同的规则。先说清长度按什么数，再决定在哪些入口共同执行。

这些判断的次序还保护了一项容易被“清洗输入”破坏的承诺。以两端带空格的种子为例，trim 后检查是否还有内容，回答的是这句话有没有可收集的文字；把 trim 后的值赋回原文，回答的却是系统打算保存哪个版本。两种写法都能拒绝纯空白，后者也会改变合法句子。跟踪一个混有普通字母、空格和表情的样本时，可以在创建前看原字符串的长度，再看提交给模型的原文长度，两处应相同。如果在 Schema 转换时已经改了值，Service 后面的所有检查即使写对了，也无法从修剪后的内容恢复最初的输入。

字符的外观同样不能替代这项判断。比如表示带尖音的字母 é，可以用单个预组合字符，也可以用一个 e 后接组合重音；屏幕上往往读成同一个字。两种序列都可以良构、都可以保存在数据库里，按当前的字面搜索约定，拿前一种作完整片段不会自动匹配后一种。可以在 Node 里比较 `'é'.length` 和 `'e\u0301'.length`，一个占一单元，一个占两单元。这样就能把“写进去会改变值”与“能完整保存，但另一种拼写搜不到它”区分开。若产品以后希望同形检索，可以另外设计用来匹配的规范表示；改动保存的原文会影响复制、回显和已有数据，不能仅以搜索框看起来更方便就作决定。

也可以从一个混合样本反算长度边界。若原文全是普通汉字，每个这里选用的常用字占一个 UTF-16 单元，放入一千九百九十八个“学”再加一个 😀，总数刚好两千。此时再保留一个确实属于原文的句末空格，肉眼可能看不出变化，单元数却已经超过上限。只把表情按屏幕上的一个图形计数，或者在计数前去掉句末空格，都会让边缘输入的判断与服务不一致。在 Node 提示符对同一串实际求 length，就能决定应该接受哪一个版本，不需要为验证上限往日常库里塞一整页文本。

写入规则和字段描述补齐后，停止旧 dev，运行 `npm run check`，再启动 `npm run dev`。下面开始创建请求；本节之前的读取验证保留了数据库基线，现在可以比较写入前后的同一条记录。

在 Postman “03 创建特殊字符原文”使用以下 JSON：

```json
{"originalText":"  Literal 100% a_b C:\\temp 😀  "}
```

应返回 201、Location 与完整原文。把返回 id 保存到集合 captureId，发送“04 按返回 ID 读取”；再刷新 DBeaver Data 页按该 ID 查同一行。不要把集合的初始占位 ID 当成刚才创建的 ID。随后在各搜索请求中分别发送 `%`、`_`、反斜线、emoji 和不同大小写的词，检查只匹配包含那段字面的记录。Params 由客户端负责 URL 编码，反斜线作为查询值只填一个字符，不把 JSON 转义写法直接抄进 Params。

![Postman：数据库写入路径保留空格、特殊字符与 emoji](images/postman-special-text.jpg)

请求和响应中的百分号、下划线、反斜线与 emoji 均保留；JSON 里的双反斜线表示原文中的一个反斜线。配套集合的 captureId 初值恰好就是请求 02 能读到的旧 ID，03 没有脚本自动覆盖它。若 04 返回 200 却仍读到 cook 那一句，先比较 03 响应的 id 与 04 实际发送的 URL，再查数据库。在集合 Variables 中保存新 id 后，用它同时核对详情和数据库行。端口以当前启动地址为准。

![DBeaver：按 Postman 返回的完整 ID 读取同一行](images/dbeaver-same-capture.jpg)

WHERE 使用上一张响应的完整 UUID，表格只将 ID 尾部缩短显示。created_utc 显式转换为 UTC，与响应中带 Z 的 createdAt 对照：两者都是 01:23:14.553。网格里的 C:\temp 是实际文本，JSON 显示的双反斜线是转义表示。首尾空格难以目测时，再用本篇已有的长度或定界显示查询确认。

![Postman：q 中的百分号按普通字符搜索](images/postman-literal-search.jpg)

Params 中的 q 是一个 `%`，limit 为 10。响应只包含刚才那条带 `100%` 的原文，没有把其他不含百分号的记录一起匹配出来；它不是 SQL LIKE 中代表任意长度文本的通配符。发送前核对勾选状态，让 Postman 处理 URL 编码。再分别替换为 `_`、反斜线和 emoji，继续比较同一条记录；不要把一次百分号成功扩展成所有特殊字符都已验证。

合法创建和读回都已完成，现在为两次拒绝请求留一份基线。确认这段时间只有你在向开发库写入，在 DBeaver 的 DEV 编辑器执行下句，记下当前固定用户的素材数。保留这个编辑器和查询，等两次请求结束后再执行一次。

```sql
SELECT count(*) AS capture_count
FROM public.captures
WHERE user_id = '10000000-0000-4000-8000-000000000001';
```

“12 拒绝 NUL”和“13 拒绝孤立代理项”保存的正文分别包含 `a\u0000b`、`a\ud800b`。现在依次发送，两次均应返回 400／VALIDATION_ERROR，而不是 500 或保存替换后的字符。搜索 q 同样拒绝 NUL；前端通常会把孤立代理项先替换或拒绝编码，服务内的共同判断仍不能省略。

![Postman：JSON 转义出的 NUL 被原文字段校验拒绝](images/postman-reject-nul.jpg)

Body 中的 `\u0000` 是 JSON 转义，解析后是一个 NUL；若写成 `\\u0000`，得到的是反斜线与字母数字组成的普通文本，检验的就不是同一种输入。观察 400、`VALIDATION_ERROR` 和 `issues[0].path` 中的 `originalText`，而不只看状态码的颜色。

![Postman：孤立高代理项同样返回字段校验错误](images/postman-reject-surrogate.jpg)

这里的 `\ud800` 没有配对的低代理项。响应沿用“合法 Unicode 且不含 NUL”的共同规则，不意味着这次输入也含有 NUL。两张图展示的是请求输入被拒绝；拒绝后数据库行数是否保持，仍按前面的数据库查询核对，不能单靠一张 400 响应图得出结论。图中服务端口为 3219，跟做使用自己的实际端口。

收到两次拒绝后，回到刚才的 DEV 编辑器重新执行计数查询，与事前记下的值比较。在这段独占的观察时间里，固定用户的可见素材数应保持一致。切回旧结果标签只会看见上次取到的数字，不能充当事后读数；如果中途另有合法创建，前后差值也就不能单独归因给这两次请求。

现在可以用同一个键解释一次看似矛盾的交接。Postman 详情能够读取刚建的原文，但用列表搜索却找不到。详情已经说明该进程在它的归属范围内能读到这一行；若两个请求发向同一地址，优先检查列表特有的条件。先把实际关键字拿到 DBeaver 对这一行求片段位置，若为零，检查大小写、空格与输入字符。若位置为正，再查同一用户的全部匹配行，按创建时间和键排好，看新行前面已经有几笔。只要前面已有十笔而请求限十条，它便应该在这个响应之外。这样定位之后，恢复搜索框或调整请求范围就能解释现象，不必为了“让它出现”重复创建一笔。

记录本轮新建记录的完整 ID、原文和 UTC 时间，再回到 DBeaver 按 ID 查询一次。确认输入拒绝前后行没有增加。下一章关闭和重启 API 时仍要查这条记录；若中途停下，保留数据库和集合变量。

## 附录：本章必要技术点速查

| 名称 | 在哪里用 | 怎样核对 |
| --- | --- | --- |
| `CaptureStore` | 让 Service 通过 `insert`、`list`、`find` 访问存储 | 先在 DBeaver 找到一条旧记录，再用 Postman 按完整 ID 读取，对上原文和 UTC 时间。 |
| `strpos`、`COLLATE "C"` | 按字面片段搜索原文，保留大小写差异 | 搜索 `%` 时只应命中含百分号的原文。`strpos` 未找到片段时返回 0。 |
| `ORDER BY created_at, id` | 按创建时间升序排列，同一时刻用 ID 排出稳定顺序 | 比较列表和 SQL 查询的有序 ID，时间相同的行也要逐一核对。 |
| NUL、孤立代理项 | 在写入 PostgreSQL 前拒绝无法原样保存的文本 | Postman 应返回 400 和 `VALIDATION_ERROR`，再到 DBeaver 确认没有新增记录。 |

查阅 `strpos` 的参数和返回值，可看 [PostgreSQL 18 字符串函数](https://www.postgresql.org/docs/18/functions-string.html)。

[上一章：Prisma：将已有表纳入 Schema 与迁移管理](../chapter-20-prisma/chapter.md) · [下一章：管理连接池、等待与服务关闭](../chapter-22-prisma-nest/chapter.md) · [返回第三篇](../README.md) · [返回全书目录](../../README.md)

[本章配套代码](https://github.com/SamChowRock/epp-public/tree/part-03/chapter-21)
