# 第34章 已有素材列表怎样从全量读取迁到分页

一个页面显示“共有101条素材”，升级后变成“共有100条”。Network里仍然是200，JSON也能解析，没有一处报错。这种故障比请求直接失败更难发现：服务只返回了一页，客户端却仍把它当作全部。

第33章已经给学习记录和星图加了续页，本章回到更早建立的素材列表。`GET /captures`按素材创建时间、ID升序排列，q检索最新修订中的原文，省略limit时返回全部匹配项；传limit只是截取前几项，并没有后续页。不能因为另一种列表已会分页，就假定所有消费者都会追游标。

从 `part-04/chapter-33` 继续，完成状态为 `part-04/chapter-34`，第35章从本章接续。仍用Node 24.22.1、PostgreSQL 18、Prisma 7.10.1以及原有Chrome、Postman、DBeaver；本章不增加依赖、表、迁移或索引。起点代码见[第33章配套](https://github.com/SamChowRock/epp-public/tree/part-04/chapter-33)。先按[本章环境入口](../../environment-setup.md#第-34-章比较旧列表与分页读取)确认独立VERIFY、固定游标密钥与两个回环端口。保留第30章的写入回执和前面各章留下的数据，练习只增加带本轮标记的虚构素材。

## 34.1 找出哪个客户端把一页当成全部

### 成功响应为什么仍可能破坏旧程序

旧脚本可能只有三行：

```js
const response = await fetch('/captures?q=practice');
const { items } = await response.json();
showCount(items.length);
```

它是否写错，要看当时的契约。如果接口承诺省略limit读全量，items.length确实是这次读取匹配的条数。现在服务为了省资源，悄悄加上默认limit=100，原请求不变、响应字段不变，脚本却少计一条。类型检查只能确认“数组里是素材”，不能确认“数组已经包含本次查询的全部素材”。

不仅统计会出错。导入程序可能把未出现的ID当作已删除；同步脚本可能覆盖一个原本完整的缓存；列表页面可能不再显示后面的内容。这些程序消费的是完整性约定，不能只用“字段没删、仍然200”判断向后兼容。反过来，明确发送limit=100的旧请求本来就只承诺前100项，不能替调用方补出过去没有的全量保证。

先列出真实消费者及用途。页面、定时脚本、手工Postman集合和外部集成不一定由同一个人发布。对每个消费者问一件具体的事：它拿到items之后，是显示这一批、累计全部，还是据缺失项做删除判断？最后一种尤其不能从一页结果推出全局不存在。

### 用101条数据把错误显出来

先取得本章辅助材料，业务源码仍从第33章跟写。保留当前33项目，另开本章配套完成状态 `part-04/chapter-34` 作对照，只复制以下路径到跟写目录；不要把其src覆盖到33项目后再当成逐步升级：

- `database/chapter-34/`：四份SQL。
- `requests/chapter-34-capture-pages.postman_collection.json`：本章独立集合。
- `examples/paging-upgrade/`：index.html、page.mjs、pager.mjs、server.mjs、README.md。
- `test/capture-pages.test.mjs`、`test/paging-upgrade-browser.test.mjs`：两套配套检查。

这些辅助文件只准备实验和消费者，新的CapturePages尚未接入服务。下面先比较旧读取，34.2按随文代码修改src，接线完成后才运行依赖新接口的capture-pages测试。如果直接检出完成状态做行为对照，跳过重复添加代码，仍按各步准备独立数据库与标记。

在DBeaver打开VERIFY连接，新建SQL编辑器，先执行 `SELECT current_database(), current_user;`。必须与独立副本的预期名称相符。打开配套 `database/chapter-34/` 的准备脚本，让01自动生成本轮新标记，整份执行准备事务：建立练习素材时一起建立初始修订，不直接造出缺少修订的父行。脚本使用已有固定开发用户，只为本轮新增样本分配身份；已提交的同轮数据用观察语句复读，不在不确定是否提交时重新插一遍。

运行 `01-seed.sql` 的整份事务，成功后的最后一个结果给出run_id和q，例如 `ch34-match:一串UUID`；实际复制自己的完整q。它新增105条素材、各两版修订：编号1～101的最新版本匹配，0在它们之前、102在之后，104只有历史版本匹配。不要复制示意文字作为筛选词。

接着在**同一SQL编辑器、同一数据库会话**执行 `02-observe.sql`。首个结果应该有101行，且1～101的素材创建时间完全相同；第二个结果显示104的第一版含q、第二版不含q。DBeaver可能只取一批结果，先取完结果集再判断总行数，不拿网格当前显示的前100行当成服务返回值。

临时表ch34_run、ch34_samples在COMMIT后仍保留，但断开连接就消失。在这个会话执行下列只读查询，把结果导出成这轮练习专用CSV，保存run_id、n、id、user_id、created_at；它是后来核对目标的依据，不含密码或游标：

```sql
SELECT run_id, n, id, user_id, created_at
FROM ch34_samples ORDER BY n;
```

不要在另一个新建连接的编辑器直接执行02～04。若01返回错误，先ROLLBACK，检查实际是否已有本轮临时表和已提交数据；若连接已经丢失，按保存的ID逐条复读，不凭原文批量删数据。新一轮使用新标记，前一轮可以保留，不会进入新q的范围。

观察查询要读取每个素材的最新修订，再按本轮标记筛选。看到101条匹配、少量不匹配，以及至少两条created_at相同后，才继续。不要用全库的101作为前提，也不要清空前章记录凑这个数字。保存这一轮的标记、同时间的两个ID、用于修改筛选归属的两个非匹配ID，后面的实验都从这些身份接起。

在项目根先完成安装、迁移状态核对和构建。迁移命令只部署此前已经建立的结构，本章没有新的SQL迁移：

```bash
nvm use
npm ci
npm run db:verify -- migrate status
npm run check
```

沿原开发入口启动API，使用VERIFY和已保存的CURSOR_HMAC_KEY。在VS Code把 `.env.database-verify` 复制为本轮私有的 `.env.paging-verify`，保留其中的DATABASE_URL，再从第33章私有配置加入同一份CURSOR_HMAC_KEY。不要把DEV地址复制进来，也不要公开两项值。用 `git check-ignore .env.paging-verify` 确认这个文件被忽略；没有输出时先停止，修正忽略规则后再保存秘密。该文件只承载这轮练习配置，不自动作为生产配置发布。

Shell中同名环境值优先于env文件，所以先清除继承值。显式载入这一份配置，再交给原有调试／自动重启脚本；开发监听和Inspector仍按前章运行：

```bash
unset DATABASE_URL CURSOR_HMAC_KEY
NODE_ENV=development PORT=3000 \
node --env-file=.env.paging-verify scripts/dev.mjs
```

从本章配套取 `examples/paging-upgrade/` 的完整页面文件到前章项目；这只是开发消费者，当前先使用旧读按钮，34.2才接入新API。第二个终端启动页面，正常模式默认不加任何限制：

```bash
PORT=3034 TARGET_PORT=3000 node examples/paging-upgrade/server.mjs
```

在Chrome打开 `http://127.0.0.1:3034`，输入本轮q，再读取旧列表。正常结果应为101。在Postman直连3000发送相同GET，核对有序ID，确认页面并未自行生成或过滤出这些素材。

接下来只停止页面代理，保留API和数据。在原端口重启代理并显式开启 `LEGACY_CAP=100`，刷新页面再读旧列表：

```bash
PORT=3034 TARGET_PORT=3000 LEGACY_CAP=100 \
node examples/paging-upgrade/server.mjs
```

这个模式先完整读取上游成功响应，再把items截为前100项，用来模拟旧完整性约定被改坏；它不能证明数据库读取量已经减少。页面明确标出实验限制；它是隔离故障演示，正式API的默认行为没有被修改。浏览器仍能收到200，却只数到100；直连API仍有101。对比少掉的ID，便能定位是入口返回范围改变，而非数据库丢行。

![真实浏览器读取隔离代理的旧列表，成功返回100条；顶部明确标出模拟模式，正式API未修改。](images/legacy-cap.jpg)

图34-1　真实浏览器读取隔离代理的旧列表，成功返回100条；顶部明确标出模拟模式，正式API未修改。

关闭该代理，去掉LEGACY_CAP，在同一端口重新启动。刷新后重读旧列表，恢复101。这一步同时是最小回退：还原原请求约定，不靠客户端把100写死为“总数”。后续分页对照必须在正常旧入口下进行，否则两个客户端比较的是不同条件。

## 34.2 让两种读取约定并存

### 新入口明确说“这是一页”

可以让同一路由通过mode分流，也可以新增路径。上一章的学习列表原本已返回limit和hasMore，显式mode顺着它的已有结构继续；素材列表只有items，而且省略limit代表全量。本章选择 `GET /captures/page`，让新调用方主动进入分页契约，旧入口继续工作。它不是给整个API统一改版本，只为这个读取能力增加清楚的入口。

| 请求 | 当前承诺 | 消费者怎样继续 |
| --- | --- | --- |
| `GET /captures?q=...` | 全部匹配素材，旧升序 | 不存在本接口的下一页 |
| `GET /captures?q=...&limit=100` | 前100项，旧截取语义 | 不把它当成可遍历协议 |
| `GET /captures/page?q=...&limit=20` | 最多20项及续页信息 | 保存返回的nextCursor |
| `GET /captures/page?q=...&limit=20&cursor=...` | 原查询范围中边界之后的一页 | 收到合法响应后再更新游标 |

新响应总有items、limit、hasMore和nextCursor；最后一页明确返回false与null。空列表也是200和空数组，不借404表达“没有匹配项”。页长默认20、最大100；不提供Offset，连续读取使用已经学过的游标。新入口严格拒绝未知参数、重复值、空筛选和非法页长。

旧接口的参数处理也不能顺手收紧。它以前可能忽略未知参数；把cursor加到旧路径上，并不会神奇地获得续页，甚至可能每次都读同一个全量列表。迁移必须同时更新路径、参数、响应解析和结束条件，不能只看到请求里有一个叫cursor的字段。

### 取最新内容，沿素材身份继续

排序对象是素材，createdAt取素材最初创建的时间。修订更新内容，但不会把素材变成一条新创建的记录。q仍匹配最新修订的originalText：这是本章继续保持的业务含义，不是“只要某一版含这个词就算匹配”。

数据库查询分四层理解：选当前用户的素材；为每条素材找出最新修订；让最新原文满足q；在符合条件的素材中应用升序边界并取limit+1。LATERAL让子查询能引用外层这一条素材的id。这里最新修订最多返回一行，因此不会因一对多连接把同一素材扩成多项。[PostgreSQL的LATERAL说明](https://www.postgresql.org/docs/18/queries-table-expressions.html#QUERIES-LATERAL)

```sql
SELECT c.id, r.original_text, r.chinese_intent, c.created_at
FROM public.captures c
JOIN LATERAL (
  SELECT original_text, chinese_intent
  FROM public.capture_revisions
  WHERE capture_id = c.id
  ORDER BY revision_no DESC LIMIT 1
) r ON true
WHERE c.user_id = '10000000-0000-4000-8000-000000000001'
  AND strpos(r.original_text COLLATE "C", '本轮筛选词') > 0
ORDER BY c.created_at ASC, c.id ASC
LIMIT 21;
```

在DBeaver先用自己的q观察这个查询，参数必须换成本轮值。正式实现通过Prisma参数化绑定值，不拼接SQL字符串。COLLATE "C"和strpos延续原来区分大小写的字面子串判断，百分号与下划线不变成LIKE通配符；查询词里的空白也不自动trim，否则原来能区分的请求会被悄悄合并。

不要先从captures取21条，再在JavaScript筛最新原文。前21条中只有两条匹配，并不意味着整个集合只有两条；这样也无法正确判断hasMore。也不要先在修订表筛q再选最大revision_no，否则“旧版含词、新版已删词”的素材仍会留下。条件的位置就是业务语义的一部分。

假设上一页最后一个素材的键是(t,id)。两个排序字段都升序，续页条件为：

```text
c.created_at > t
OR (c.created_at = t AND c.id > id)
```

严格大于排除已交付的末项，ID负责同一毫秒内的并列。不能把第33章降序列表中的小于号原样抄过来。查询多取得的第21项只证明还有数据；nextCursor记第20项，下一页才能真正读到第21项。[PostgreSQL的LIMIT与确定顺序](https://www.postgresql.org/docs/18/queries-limit.html)

### 游标既带位置，也带这一次查询的范围

签名沿用第33章CURSOR_HMAC_KEY，新素材游标使用独立资源名和升序版本，绑定当前用户、实际limit、q和边界。q省略与空字符串不是一回事：前者不筛选，后者按新契约拒绝。省略limit与显式20等价；limit=100获得的游标不能在limit=20请求中继续。

整轮遍历仍从第一页起计30分钟，续页继承最初到期时间。HMAC只验证原载荷未被改动，不加密q，不冻结结果，也不能代替每页的用户归属检查。游标进入URL，因此不要复制到公开截图、日志或工单。页面可以显示页号和已接收数，不需要显示完整载荷。

新增 `src/capture-pages.ts`。查询Schema与旧列表共用q规则，输出Schema明确允许游标；其余部分把校验、参数化查询和结果组装放在一个小类中。旧 `PrismaCaptureStore.list` 不改动。

<details>
<summary>完整 CapturePages：从请求范围到升序续页</summary>

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from './generated/prisma/client.js';
import { CaptureResponseSchema, ListQuerySchema } from './capture-contract.js';
import { DatabaseService } from './database.service.js';
import { ApplicationState } from './application-state.js';
import { HttpError } from './http.js';

export const CapturePageQuerySchema = z.object({
  q: ListQuerySchema.shape.q,
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/).optional(),
  cursor: z.string().min(1).max(2048).optional(),
}).strict();
export type CapturePageQuery = z.infer<typeof CapturePageQuerySchema>;
export const CapturePageSchema = z.object({
  items: z.array(CaptureResponseSchema).max(100), limit: z.number().int().min(1).max(100),
  hasMore: z.boolean(), nextCursor: z.string().nullable(),
});
const CursorSchema = z.object({
  v: z.literal(1), scope: z.string(), expires: z.number().int().positive(),
  at: z.iso.datetime({ precision: 3 }), id: z.uuid().regex(/^[0-9a-f-]+$/),
}).strict();
function signature(body: string, key: string) {
  return createHmac('sha256', Buffer.from(key, 'hex')).update(body).digest();
}
type Row = { id: string; originalText: string; chineseIntent: string | null; createdAt: Date };

export class CapturePages {
  constructor(private readonly database: DatabaseService, private readonly state: ApplicationState,
    private readonly cursorKey: string, private readonly userId: string) {}

  list(query: CapturePageQuery) {
    const limit = Number(query.limit ?? '20');
    const scope = JSON.stringify(['capture-list/v1', this.userId, 'createdAt-asc,id-asc', limit, query.q ?? null]);
    let expires = Date.now() + 30 * 60 * 1000;
    let boundary: z.infer<typeof CursorSchema> | undefined;
    if (query.cursor !== undefined) {
      try {
        if (query.cursor.length > 2048 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(query.cursor)) throw new Error();
        const [body, mac] = query.cursor.split('.') as [string, string];
        const decoded = Buffer.from(body, 'base64url');
        const actual = Buffer.from(mac, 'base64url');
        if (decoded.toString('base64url') !== body || actual.toString('base64url') !== mac || actual.length !== 32 ||
          !timingSafeEqual(actual, signature(body, this.cursorKey))) throw new Error();
        boundary = CursorSchema.parse(JSON.parse(decoded.toString('utf8')));
        if (boundary.scope !== scope || boundary.expires <= Date.now() || boundary.at.startsWith('0000-') ||
          new Date(boundary.at).toISOString() !== boundary.at) throw new Error();
        expires = boundary.expires;
      } catch { throw new HttpError(400, 'Invalid or expired cursor; restart from the first page', 'INVALID_CURSOR'); }
    }
    return this.state.track(() => this.database.run('listCapturePage', async () => {
      // Read the latest snapshot before filtering; the immutable parent supplies the boundary.
      const rows = await this.database.client.$queryRaw<Row[]>(Prisma.sql`
        SELECT c.id, r.original_text AS "originalText", r.chinese_intent AS "chineseIntent", c.created_at AS "createdAt"
        FROM public.captures c
        JOIN LATERAL (SELECT original_text, chinese_intent FROM public.capture_revisions
          WHERE capture_id = c.id ORDER BY revision_no DESC LIMIT 1) r ON true
        WHERE c.user_id = ${this.userId}::uuid
          ${query.q === undefined ? Prisma.empty : Prisma.sql`AND strpos(r.original_text COLLATE "C", ${query.q}) > 0`}
          ${boundary === undefined ? Prisma.empty : Prisma.sql`AND (c.created_at, c.id) > (${new Date(boundary.at)}::timestamptz, ${boundary.id}::uuid)`}
        ORDER BY c.created_at ASC, c.id ASC LIMIT ${limit + 1}
      `);
      const hasMore = rows.length > limit;
      let nextCursor: string | null = null;
      if (hasMore) {
        const last = rows[limit - 1]!;
        const body = Buffer.from(JSON.stringify({ v: 1, scope, expires, at: last.createdAt.toISOString(), id: last.id })).toString('base64url');
        nextCursor = body + '.' + signature(body, this.cursorKey).toString('base64url');
      }
      return { items: rows.slice(0, limit).map(row => ({ ...row, createdAt: row.createdAt.toISOString() })), limit, hasMore, nextCursor };
    }));
  }
}
```

</details>

先只新增这个文件并运行 `npm run typecheck`；还没接HTTP时旧读取应照常工作，新路径尚不能取得分页响应。然后完成下面的接线。

新类构造时显式接收userId，避免把固定身份散落到查询和签名中。当前工厂传DEVELOPMENT_USER_ID；第38章换为本请求CURRENT_USER_ID。不能只把SQL换成登录用户、scope却还绑定固定用户，也不能只改scope却让SQL漏掉归属。

CapturePages.list中的游标校验放在database.run外部：签名不匹配属于400，不能被数据库错误包装误报503。真实数据库不可用仍返回失败，不能把异常转换成 `items: []`、nextCursor:null，否则消费者会把故障当作正常读完。

### 从HTTP入口接到公开响应

在 `src/captures.module.ts` 导入CapturePages，把下面的工厂加入已有providers。APP_CONFIG、AppConfig、DatabaseService、ApplicationState和DEVELOPMENT_USER_ID都已在本模块使用：

```ts
import { CapturePages } from './capture-pages.js';
// providers中新增，其他工厂保留
{ provide: CapturePages,
  useFactory: (database: DatabaseService, state: ApplicationState, config: AppConfig) =>
    new CapturePages(database, state, config.cursorKey, DEVELOPMENT_USER_ID),
  inject: [DatabaseService, ApplicationState, APP_CONFIG] },
```

在 `src/captures.controller.ts` 新增两个import，替换构造器，再在现有动态路径之前新增page方法。其余创建、列表、详情、修订方法保持：

```ts
import { CapturePages, CapturePageQuerySchema, CapturePageSchema } from './capture-pages.js';
import type { CapturePageQuery } from './capture-pages.js';
// CapturesController类内
constructor(private readonly captures: CapturesService,
  private readonly commands: CaptureCommands,
  private readonly pages: CapturePages) {}

@Get('page')
@UseInterceptors(new ResponseSchemaInterceptor(CapturePageSchema))
page(@Query(new SchemaPipe(CapturePageQuerySchema)) query: CapturePageQuery) {
  return this.pages.list(query);
}
```

在 `src/http-boundary.ts` 的allowed判断里，紧接旧根路径、先于detail插入静态路径分支：

```ts
const allowed = url.pathname === '/captures' ? ['GET', 'POST']
  : url.pathname === '/captures/page' ? ['GET']
  : detail ? ['GET', 'PATCH'] : revisions || candidates ? ['GET', 'POST'] : discard ? ['POST']
  : learningDetail || ['/learning-records', '/star-map'].includes(url.pathname) ? ['GET'] : undefined;
```

在 `src/request-observation.ts` 的route判断中，将原 `path === '/captures' ? '/captures'` 替换为以下一段，其余固定标签判断不动：

```ts
['/captures', '/captures/page'].includes(path) ? path
```

最后在 `src/openapi.ts` 导入两份Schema，在components.schemas添加 `CapturePage: schema(CapturePageSchema, 'output')`，并在paths增加：

```ts
'/captures/page': {
  get: {
    operationId: 'listCapturePage', summary: 'Read one page of matching captures',
    description: 'Latest revision literal q; createdAt and UUID ascending. Default limit 20, maximum 100. Signed cursors bind user, q and limit, expire 30 minutes after the first page. Live data, not a snapshot. Legacy GET /captures keeps its full default.',
    parameters: [ifNoneMatch, ...Object.entries(CapturePageQuerySchema.shape).map(([name, value]) => ({
      name, in: 'query', required: false, schema: schema(value.unwrap(), 'input'),
    } as ParameterObject))],
    responses: { '200': { ...jsonResponse('CapturePage', 'Matching page'), headers: etagHeaders },
      '304': notModified, '400': problem('Invalid query or INVALID_CURSOR'),
      '500': problem('Unexpected failure') },
  },
},
```

这里缩写了description文字；完整配套额外写明拒绝重复参数、末页null和不能跨资源。文件尾原有循环会为所有操作补503与X-Request-Id，不再为本路由另建一套错误格式。

`page`必须先于动态`:id`被识别。HTTP边界为它只允许GET，其他方法返回405及Allow；请求观察器也先匹配固定 `/captures/page`，否则会把所有新分页计进 `/captures/:id`，后面据日志判断迁移会出错。不要通过删除既有路径检查来让新入口“能进来”。

输出Schema声明四个字段，避免ResponseSchemaInterceptor将算出的nextCursor裁掉。OpenAPI要同时展示新入口的q、limit、cursor及400/503含义，旧路径描述保留省略limit取全量。控制器、边界、响应和文档是同一个契约的不同位置，缺一个就会出现“服务函数能算，客户端却不会用”。

重新运行 `npm run check`，确认 `.env.test` 的TEST_DATABASE_URL仍是独立测试库，再运行 `npm test`（会包含新接口与页面两套测试）。测试库和当前浏览器VERIFY分开，避免清理／并发实验干扰本轮标记。用原开发调试配置连接VS Code。在新查询返回行断下，观察rows.length、实际limit、返回末项ID及额外一项ID；不展开cursorKey。已有至少21项时应读21、返回20、边界指向返回的第20项。继续后在Postman核对响应，不用调试器里有值代替线上字段确实存在。

## 34.3 逐个迁移消费者并核对完整性

### 先让稳定数据的新旧结果相同

导入 `requests/chapter-34-capture-pages.postman_collection.json`，baseUrl指向当前API。先发旧全量请求保存有序ID，再发新首页，q和limit固定。每次成功后只把响应里的nextCursor复制到下一页变量；发送失败时保留当前请求使用的cursor，不复制空值覆盖它。最后一页null时停止，不能再省略cursor请求首页并把它追加到尾部。

集合中01是旧全量、02显式100、03新首页、04续页／原页重试、05改变筛选、06空集。设置**集合变量**baseUrl、q和limit；若环境里存在同名变量，先删除或禁用覆盖，查看实际发送URL确认值。03成功后把nextCursor整串复制到集合变量cursor；发04成功后重复此动作。收到null时停止，不把字符串“null”保存为下一页。

本轮limit=20的页长应依次为20、20、20、20、20、1；末页hasMore=false、nextCursor=null。截图只需保留状态、项数和 ID，隐藏含有查询范围的 cursor。集合不会在 Tests 里自动更新 cursor，核对本页结果后再手动填入下一次请求。

在Chrome的正常练习页读取旧列表，再从分页首页开始。按页继续到末页，比较的不只是条数，还包括完整有序ID：101项逐项相同，才说明这轮稳定数据没有漏项、重复或顺序差异。两份列表恰好都长101，仍可能各自漏掉不同项。比较正文还需固定观察期间不写入，因为最新修订本身会变。

![同一轮稳定数据按20条续读，末页1条，101个有序ID与旧全量逐项相同。图中一次503模拟已经触发并成功重试。](images/ordered-compare.jpg)

图34-2　同一轮稳定数据按20条续读，末页1条，101个有序ID与旧全量逐项相同。图中一次503模拟已经触发并成功重试。

再换三种条件：不存在的q应空页且nextCursor=null；用只能匹配一个页长的数据观察恰好一页；101条按100翻，应先100再1。新页的hasMore表示这一条SELECT是否多看到一项，不表示未来永远没有新数据。匹配项数量小于页长时已经结束，不能把“每页必须20项”当作有效响应的必要条件。

保存一页游标，把q改成另一词但保留原游标，应400/INVALID_CURSOR。再恢复q、只改limit，仍拒绝。损坏签名、使用学习记录游标或换用户，也不能继续同一范围。遇到400要从新查询首页开始并清掉旧累计结果；遇到503则先查请求ID和服务状态，恢复后重试原页。二者不能共用一个“永远重试当前cursor”的按钮逻辑。

### 续页失败时，提交的是页面结果

把页面代理重启为下面的模式，API和数据不变。首页正常；第一次带cursor的分页GET会被代理替换为一次503，后续同请求正常转发。这是只读故障练习，默认不启用：

```bash
PORT=3034 TARGET_PORT=3000 FAULT_NEXT_PAGE_ONCE=true \
node examples/paging-upgrade/server.mjs
```

读完首页记下已接受项数，然后点击下一页。失败后已接受数不变，待请求的cursor也不变；再点重试，成功后才追加这一页并推进。页长20时，典型变化是20→失败仍20→恢复40，而不是失败后直接跳到第三页。

![第一次续页被代理替换为503，页面仍累计20条，并保留同一请求游标；重试成功后才变成40条。](images/page-retry.jpg)

图34-3　第一次续页被代理替换为503，页面仍累计20条，并保留同一请求游标；重试成功后才变成40条。

服务端没有修改业务，并不代表客户端不用考虑重复。双击下一页、两个响应先后回来、请求成功后显示前抛异常，都可能让同一页被累计两次。客户端应把“验证完整响应、接受这批items、保存nextCursor”视为一次本地状态变化。开始请求时锁定按钮和请求参数，不能收到任何200就先改游标，再慢慢解析正文。

`examples/paging-upgrade/pager.mjs` 不访问网络或存储，只管理已接受结果。下面是本页实际使用的完整状态模块；readForOwner末尾的身份复核为第38章接入真实会话留出边界，固定身份阶段也走相同接受顺序。

<details>
<summary>分页状态及接受前的身份复核</summary>

```js
// No network/storage: acceptance is atomic and scoped to one identity/filter epoch.
export const sameIds = (a, b) => a.length === b.length && a.every((item, i) => item.id === b[i].id);
export function validItem(item) {
 return item && typeof item.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)
  && typeof item.originalText === 'string' && /\S/.test(item.originalText) && item.originalText.length <= 2000 && (item.chineseIntent === null || typeof item.chineseIntent === 'string')
  && typeof item.createdAt === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(item.createdAt) && Number.isFinite(Date.parse(item.createdAt)) && new Date(item.createdAt).toISOString() === item.createdAt;
}
export class Pager {
 constructor({limit=20}={}) { if(!Number.isInteger(limit)||limit<1||limit>100) throw Error('Invalid limit'); this.limit=limit; this.epoch=0; this.reset(null,''); }
 reset(owner,q) { this.epoch++; this.owner=owner; this.q=q; this.items=[]; this.pages=[]; this.cursor=null; this.done=false; this.requiresRestart=false; this.active=null; this.error=null; this.seenCursors=new Set(); }
 begin() { if(!this.owner||this.active||this.done||this.requiresRestart) return null; const ticket=Object.freeze({epoch:this.epoch,cursor:this.cursor}); this.active=ticket; this.error=null; return ticket; }
 current(ticket) { return this.active===ticket && ticket.epoch===this.epoch; }
 fail(ticket) { if(!this.current(ticket)) return false; this.active=null; this.error='failed'; return true; }
 invalidate(ticket) { if(!this.current(ticket))return false; this.reset(this.owner,this.q); this.requiresRestart=true; this.error='invalid-cursor'; return true; }
 accept(ticket,result) {
  if(!this.current(ticket)) return false;
  if(!result||!Array.isArray(result.items)||result.limit!==this.limit||typeof result.hasMore!=='boolean'
   ||result.items.length>this.limit||!result.items.every(validItem)
   ||(result.hasMore ? typeof result.nextCursor!=='string'||!result.nextCursor||result.nextCursor.length>2048||this.seenCursors.has(result.nextCursor)||result.items.length!==this.limit : result.nextCursor!==null)) throw Error('Invalid page');
  const ids=new Set(this.items.map(item=>item.id));
  for(const item of result.items) { if(ids.has(item.id)) throw Error('Duplicate ID'); ids.add(item.id); }
  // Mutate only after every field and every ID has passed validation.
  this.items=[...this.items,...result.items]; this.pages=[...this.pages,{count:result.items.length,ids:result.items.map(i=>i.id)}];
  if(result.nextCursor!==null)this.seenCursors.add(result.nextCursor);
  this.cursor=result.nextCursor; this.done=!result.hasMore; this.active=null; this.error=null; return true;
 }
}

// Shared by both page controls. Capture owner/session before issuing the request;
// never publish a response until identity has been rechecked after its arrival.
export async function readForOwner({owner,sessionId,path,request,identify,isCurrent,clearIdentity,accept}) {
 const headers=sessionId?{'X-Expected-Session':sessionId}:{};
 const result=await request(path,{headers});
 if(!isCurrent())return false;
 const confirmedOwner=await identify();
 if(!isCurrent())return false;
 if(confirmedOwner!==owner){clearIdentity();return false;}
 accept(result);return true;
}
```

</details>

`page.mjs` 中的下一页点击处理先调用begin取得ticket，然后用ticket.cursor构造请求。fetch的response.ok必须先检查；非2xx不进入accept。成功响应经过readForOwner确认身份仍一致、ticket仍是当前请求，再调用accept。400调用invalidate并清空旧对照；401／403清空身份和两套结果；其他失败调用fail，下一次begin仍取得原cursor。DOM输出使用textContent，不把素材拼成HTML。

新建页面文件时保留HTML中的filter、legacy、next、restart、progress、pages、comparison这些挂接点；配套 `examples/paging-upgrade/README.md` 说明页面文件与启动方式。此前的旧读按钮已经可用，现在页面请求的新路径开始返回四字段。运行 `node --test test/paging-upgrade-browser.test.mjs` 检查纯状态和独立回环代理，再回到本章正式API做上面的手动故障对照。代理测试中的合成上游不是数据库验收的替代。

每次重新开始查询增加本地代次；旧请求返回时先比较代次，再改变当前列表。即使AbortController已经请求取消，也仍检查代次，因为取消等待不保证旧回调不会完成。这里的代次只属于当前页面，不是数据库版本或分页快照。

若检测到重复ID或不前进的游标，本章页面停止并报告协议异常，不悄悄去重后声称完整。自动去重能遮住错误分页的重复页，最后条数少了也难以发现原因。对长时间持续增长的列表，反复自动加载可能一直没有末页；本章让读者逐页观察，不把无限循环当作完成条件。

### 排序没变，匹配集合仍会变

现在改变的不是页长，而是数据。选择本轮原先不匹配的素材A，使它的素材创建键排在第一页边界之前；另选B排在边界之后。DBeaver先查出它们的位置，确认不是只凭文本名字猜先后。读完第一页后，用正式 `POST /captures/:id/revisions` 为A、B各追加一版含q的原文，保留第30章的独立操作键，避免提交响应丢失时重复追加。

接着沿原分页继续。B可能出现在后续页，A已经位于走过的边界之前，不会回头出现。回到旧全量请求或重新取新首页，会看到A也匹配。没有素材丢失，游标也没有被改坏；这轮读取是在不同时间查询变化中的集合。

先点击“从第一页重新开始”，只读第一页，暂时不要继续。仍在原DBeaver会话中查本轮A、B的ID：

```sql
SELECT n, id, user_id, created_at
FROM ch34_samples WHERE n IN (0, 102) ORDER BY n;
```

n=0作为A，n=102作为B；它们的素材创建时间分别在匹配组之前和之后。用第30章追加修订请求，URL为 `{{baseUrl}}/captures/本条ID/revisions`，方法POST，Content-Type为application/json。A、B各生成并保存**不同**的Idempotency-Key，按下面Body填入本轮实际q；同一条请求未知结果时沿用它原来的键与Body：

```json
{
  "originalText": "这里替换为完整本轮q newly matching #0",
  "chineseIntent": null,
  "inputSource": "manual"
}
```

B把尾部改为#102。两次均应201、revisionNo=3；原键原Body各重发一次，返回同一修订ID和版号，不产生第4版。再用02观察两条最新修订，旧第1／2版仍在。不要同时执行 `03-live-membership.sql`：它是绕开HTTP只观察数据库成员变化的可选对照，不产生第30章回执；本节主线已经通过正式接口完成追加。

回到页面沿原cursor读到末页，累计102条；此时再读旧全量得到103条。展开两套ID，差异应只包含A，B已经被后续页读到。点击重新开始会清空两套结果，数据不再变化时重新遍历，二者就都为103。此处的差异来自查询时间，不能靠“把重复ID去掉”修好。

![分页读到102条，重新全量读取103条](images/live-membership.jpg)

图34-4　真实浏览器在第一页之后，通过正式API给边界前后的两个合成素材追加修订。旧全量重新读到103条，原分页遍历只有102条；这是实时集合的变化。

反过来，另开一轮第一页后，把还未读到的匹配素材最新原文改成不含q，它会从后续结果里消失。把已经看过的素材改成另一段仍匹配的文本，页面上已接受的旧正文不会自动刷新。一次遍历可能保留早先内容和后来内容的混合；稳定的created_at/id只解决接着哪里读，不解决每一页看哪一个历史时刻。

```mermaid
sequenceDiagram
  participant C as 消费者
  participant A as API
  participant D as 数据库
  C->>A: 第一页，筛选q
  A->>D: 查询此刻匹配项
  D-->>C: 前20项与边界K
  Note over D: K之前的A追加匹配修订<br/>K之后的B追加匹配修订
  C->>A: 原q与边界K
  A->>D: 重新查匹配且键大于K的项
  D-->>C: 可包含B，不回头包含A
```

甚至没有修订，也要考虑晚提交。一笔事务较早分配了created_at，却在第一页查询之后才提交；它的键可能落到已越过的位置。客户端只保留最后一个键，无法据此重建当时未提交的行。故障页重试也会重新查询：失败后保持cursor只保证不主动跳过位置，不保证取回第一次尝试时完全相同的那一页。[PostgreSQL READ COMMITTED的逐语句视图](https://www.postgresql.org/docs/18/transaction-iso.html#XACT-READ-COMMITTED)

若业务要求完整导出，先确定是“开始时的成员”“开始时的字段值”，还是“过程结束前出现过的所有记录”。前两者可考虑有界只读快照或保存明确版本的导出任务；第三种通常需要变化事件和结束水位，不能用实时列表末页替代。第33章支线33A已经讲过冻结成员、冻结内容与长事务成本，本章不新增导出表，也不在浏览器两次点击之间持有一个数据库事务。

## 34.4 何时可以退役全量读取

### 发布顺序要让两代消费者都有路可走

新API先发布，新客户端再迁移。第一步只增加新读取能力，旧客户端仍得到原响应；第二步逐个更新消费者，让它们识别nextCursor并正确处理失败。把旧入口删掉再通知客户端升级，会把一次可渐进的迁移变成同时发布所有程序的要求。

```mermaid
flowchart LR
  A[旧服务与旧客户端] --> B[服务增加分页入口<br/>旧入口保留]
  B --> C[逐个消费者改为追游标]
  C --> D[观察实际调用与周期任务]
  D --> E[另行决定旧入口退役]
  C -->|新客户端有问题| B
```

在练习中可以切回旧列表按钮，验证同一服务仍返回完整旧结果；随后恢复分页按钮。这证明客户端回退仍有兼容入口。反过来把服务回退到第33章，新客户端请求 `/captures/page` 会失败，不能因为数据库结构没变就称为无风险回退。代码、配置、客户端、数据库的兼容方向要分别判断。无迁移只是少了一类风险。

### 用调用证据判断，而不只看新版页面

原有结构化日志已经记录method、固定route、status与请求ID。本章把新路由单列，因此可以分别统计成功的GET /captures和GET /captures/page；不靠记录q、完整URL或游标来区分。用练习页分别发一次旧读和分页读，在日志里找到对应的两条http.completed，再确认响应状态由哪一层产生。

在API终端查看同轮 `http.completed` 的method、route、status和requestId。旧读应为 `GET /captures 200`，分页为 `GET /captures/page 200`；改变q重放原cursor时，新路由为400。不要在日志中增加q或cursor来方便查找。

本节代理故意把上游成功响应改成503，所以**API记录200，浏览器看到503**；正式API并没有故障。若据API日志统计模拟失败会数错，需区分响应在哪一层被替换。真实服务数据库故障的503由API自身记录，不能用两者同名状态码推断同一故障来源。

统计旧路由还有调用，足以证明仍有消费者未迁移；一段时间没有调用，却未必证明全部完成。每月跑一次的脚本今天不会出现，休眠客户端也可能下周回来。维护消费者清单、负责人、调用周期和最后一次新入口成功记录；观察窗口应覆盖最长的已知执行周期与失败重试，不用任意的“连续一天为零”替所有场景作决定。

若一次旧读取只为生成小范围预览，迁移可以停在读取第一页，并明确界面显示“前20条”；若它负责逐项同步，就必须遍历到末页，并重新处理集合变化与中断恢复。不能给所有调用方机械地替换同一段循环，更不能为保留“总数”文案就把每次页面打开变成遍历全部数据。

本章不删除或默认限制旧接口，也不自动向旧响应加退役日期。实际计划停用时，应先明确通知范围、版本兼容窗口、无法升级的消费者怎么办，以及日期到达后返回什么。旧响应缓存和代理是否仍会掩盖变化，也要纳入核对。是否需要退役取决于维护与资源成本，不是新增入口存在就必须立刻删除旧路径。

### 原数据与交付产物也要接得上

运行原有回归与本章新增检查，测试库保持独立。除了分页样例，旧全量／limit、素材详情、修订追加、候选采纳和第30章回执重放都应继续工作。前章非空副本升级到34时没有新增迁移，旧行和迁移历史不应因为增加读取代码而变化；空库则仍按既有全部迁移准备，不能因“本章没迁移”误以为无需数据库结构。

沿第33章在独立目录只复制dist、安装文件与运行依赖，给生产进程提供VERIFY地址和持久游标签名密钥。先取分页首页保存nextCursor，停妥进程，保持同一数据与密钥启动新进程，再用原cursor续页；顺序与旧全量结果应能对上。只换密钥后旧cursor应拒绝，需要重新开始；不通过接收所有签名来“恢复兼容”。

第38章接入真实身份时，为CapturePages注入本请求用户ID；第39章现有资格检查继续限制分页，第40章保持浏览器同源与认证边界。分页是GET，并不要求为每一页发CSRF写入Token，但每次仍要认证并限定数据范围。旧游标属于另一个用户时拒绝；退出或资格撤销时先按当前认证／授权规则失败，而不是仅凭签名放行。页面换身份后清掉已加载的私人内容与旧游标，旧响应也不能重新填回。

第35章从这里继续看查询成本。有了limit+1，并不等于数据库最多访问21行；寻找匹配最新修订、排序及深处的边界可能仍很贵。先把契约迁对，再用实际执行计划判断该优化哪一层，不以“使用Cursor”代替性能证据。

## 本章支线

[33A：完整导出、变化中的列表与地区日历](../chapter-33-pagination/side-01-snapshots-and-calendar.md)已覆盖实时分页与固定快照的边界。需要精确导出时回到其中的成员、内容与事务寿命推导；本章没有新增独立支线。

## 附录：本章必要技术点速查

| 技术点 | 在本章承担什么 | 易误判的边界 |
| --- | --- | --- |
| 全量契约与分页契约 | 决定消费者如何解释items | 字段不变、200不等于兼容 |
| 显式新路径 | 允许逐个迁移并观察旧调用 | 新服务兼容旧客户端，不保证旧服务兼容新客户端 |
| 最新修订与LATERAL | 每条素材取当前原文后筛q | 先筛历史修订会纳入已经不匹配的素材 |
| ASC双字段边界 | 同毫秒下仍有严格后继 | 使用大于；不能照抄降序小于 |
| limit+1 | 观察当前查询是否还有一项 | 游标取最后交付项，不取额外项 |
| 查询范围签名 | 绑定用户、排序、q、页长与期限 | 不加密、不授权、不冻结数据 |
| 页面结果确认 | 完整验证后一起接受items与nextCursor | 失败保留原页，不把null当作再次请求首页 |
| 本地代次 | 隔离旧筛选／身份的迟到结果 | 取消请求不能独自证明旧结果不会回来 |
| 固定路由统计 | 找出仍在使用旧接口的消费者 | 无流量不证明周期脚本已迁移 |

本章完成代码状态为 `part-04/chapter-34`；服务实现、SQL、请求集合与浏览器示例一起保存。结束练习用Ctrl-C停止页面代理及API，确认app.stopped后再关闭VERIFY连接。

仅做纯读取或03的SQL对照时，可在原SQL会话运行 `04-cleanup.sql`，按本轮临时ID映射删除练习修订及素材。若已按本章主线产生写入回执，外键会拒绝删除并让事务回滚；执行ROLLBACK后保留这轮样本与回执，不删约束或清空回执表来强行清理。需要重新练习时断开再连接，以新run_id开始即可。独立VERIFY的整体归档与回收沿原环境流程处理。

阅读约 115～140 分钟，编码、比较新旧列表、模拟故障和重启检查另加约 100～130 分钟。首次安装和下载依赖另留时间。

[上一章：分页与时间](../chapter-33-pagination/chapter.md) · [下一章：索引与执行计划](../chapter-35-indexes/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
