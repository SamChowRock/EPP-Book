# 第33章 分页与时间：下一页从哪里继续

第三十二章的列表最多返回100项，hasMore只说明这一次查询还看到了更多记录。客户端现在知道列表没有展示完，却没有合法的办法继续。把limit调大并不能解决问题：来源会持续增加，两次请求之间还可能发生新的采纳。“再取20条”需要先回答，接着哪个位置取，位置改变以后又算谁的下一页。

本章沿学习记录和基础星图建立两种分页方式，再把日期筛选接到同一套查询上。分页与时间放在一起，是因为我们已经按createdAt排序；时间既是续页边界的一部分，也会被用户理解成“今天收录的内容”。数据库里的时间点、页面上的日期、两次读取之间的变化，需要各自有明确含义。

从 `part-04/chapter-32` 继续，完成状态为 `part-04/chapter-33`。保持Node.js 24.22.1、Prisma 7.10.1、PostgreSQL 18与固定开发用户。本章沿用现有时间列，不改模型、不追加迁移、不增加依赖。先核对既有数据库迁移状态，再修改代码；不用重建数据。

## 33.1 Offset跳过位置，Cursor接着边界

### 先把“第二页”写成一次具体变化

学习记录按createdAt降序，再按id降序排列。为了看清位置变化，先用4、3、2、1表示同一时刻的四条记录，页长为2。第一页得到4、3，下一次跳过两行，就得到2、1。这里的limit是每页最多返回几条，offset（偏移量）是从当前列表开头跳过几条。数据不变时，页码从1开始，第p页的offset是 `(p - 1) * limit`。

问题发生在第一页读完后。另一条采纳5进入队头，当前顺序变成5、4、3、2、1。第二页仍然跳过两个位置，得到3、2；3重复了。若第一次读完后删除的是4，当前顺序变成3、2、1，再跳两行只得到1，2被漏掉。

换一种问法：我上次看到3，排在它后面的还有什么？客户端第一次请求 `/learning-records?mode=cursor&limit=2`，服务返回4、3，以及一个叫 `nextCursor` 的字符串。这就是游标（cursor）：服务把最后一条的创建时间和ID记在里面。下一次仍用相同的筛选和页长，把这串值原样作为 `cursor` 参数传回。服务按这两个字段找排在3后面的记录，得到2、1；客户端不用自己拆游标，也不用数前面有几条。

```mermaid
flowchart LR
  A[第一次读取 4 3 2 1] --> B[第一页 4 3]
  B --> C[页首新增5]
  C --> D[当前顺序 5 4 3 2 1]
  D --> E[Offset跳过2个位置 得到3 2]
  D --> F[按游标记住的3往后读 得到2 1]
```

两种分页各有适用情形。后台列表需要跳到第十页，且允许刷新后位置变化，可以使用Offset；连续向下加载学习记录，更关心接着已经看过的位置读取，适合按键值继续。Cursor不提供任意页码跳转；没有前面的边界，服务不知道所谓第十页从哪一行开始。不要为了界面有页码就宣称两者可以无损互换。

Offset还有成本：数据库仍要处理被跳过的行，返回20行不等于只访问20行。当前将offset限制为0～10000，是接口的资源预算，不是这个数字以下一定很快。第三十五章会检查实际查询计划。需要深翻或全量处理时应重新选择读取方式，不能不断放宽上限。[PostgreSQL 18的LIMIT／OFFSET说明](https://www.postgresql.org/docs/18/queries-limit.html)给出了跳过位置、唯一排序及深Offset的行为边界。

先替界面上的两个按钮各写一句需求。页码按钮问「按此刻的顺序，第三个位置开始是什么」；继续加载问「我已经读到这条，在同一排列规则下，后面还有什么」。数据静止时，两句问话常得到相同的答案；数据刚好变化时，它们仍分别答对了自己的问题。因而不能仅凭第二页有重复，就诊断数据库没有按指定字段排序。要重现那个差异，需要同时留存第一页的末项和两次查询之间发生的变化。只截第二页，别人甚至无法判断重复的是同一个来源，还是两个来源刚好引用了同一句表达。

可以把书合上，从空白写第一条查询。先选输出的两列：我要能指认一行，也要知道它为什么排在这里，所以保留标识和创建时刻。然后定 ORDER BY：最晚的事件要在前；同一毫秒没有更多时序信息，用标识降序补全。这时还不用写 LIMIT，先在结果网格中亲眼找到预计的第二、第三行，再给查询加上页长。回到纸面想第二页，若仍要求一个位置，原查询只须再跳过两行；若要求末项后面的所有候选，先写 WHERE 缩小候选集，再沿用原排序和相同的上限。这两个 SELECT 可以在同一个编辑器并排放着，改变中间的表状态，就能看清究竟哪一条子句使结果分开。

再把变化的位置移到列表中间。第一次仍交付四、三，随后在二与一之间插入一条较早的来源。此时前两位没动，按位置和按边界取得的第二页可能完全相同，且都可能包含这条第一次读取时尚未出现的来源。键值续页没有答应排除新成员。若新写入的一条排在四的前面，它才会留待下次从首页刷新时看。是否可见取决于它与上一次边界的大小关系，以及这次查询时是否已提交；仅知道「它是刚插入的」还无法预测。这个区分也解释了同步程序为何不能把一次翻到底的列表直接当作变化日志。

页长变化也会让页码失去原意。以每页两条读完第一页后，用户在下拉框改成每页三条；若仍用页码二从头跳三条，原来还没交付的第三条被跳过了。可以选择切换页长就回首页，也可以另行定义从原位置继续的协议。本章的游标绑定实际页长，改页长应从首页重新开始；Offset 请求独立计算位置，服务不会记得上次的页长。界面若支持跳页，就保留当时有效的页长和筛选；若支持连续阅读，就保存服务返回的末项边界。只有一项「当前页数」的前端状态无法还原这两种操作各自的依据。

### 用DBeaver观察两种读法

在DBeaver连接独立VERIFY库，打开配套 `database/chapter-29/01-page-boundaries.sql`。若正从第 32 章跟写，在另一个目录打开完成分支的资料文件；业务源码仍在当前项目逐步修改。先选中BEGIN、SET LOCAL、临时表与INSERT执行；后面的SELECT逐条选中执行，不要一次运行整个文件后只看最后一个结果。临时表只存在于当前连接，换编辑器时先确认仍是同一会话。

先在同一编辑器准备四条创建时间相同的记录。`timestamptz(3)` 是 PostgreSQL 用来保存时间点的类型，这里的 3 表示小数秒保留三位，也就是毫秒。时间末尾的 `Z` 表示按 UTC（协调世界时）书写；`SET LOCAL` 让当前事务也按 UTC 显示时间，方便对照输入和结果。

```sql
BEGIN;
SET LOCAL TIME ZONE 'UTC';
CREATE TEMP TABLE page_lab (
  id integer PRIMARY KEY, created_at timestamptz(3) NOT NULL
) ON COMMIT DROP;
INSERT INTO page_lab VALUES
 (4, '2026-11-05T00:00:00Z'), (3, '2026-11-05T00:00:00Z'),
 (2, '2026-11-05T00:00:00Z'), (1, '2026-11-05T00:00:00Z');
```

接下来逐条执行。读到最后一条 SELECT 时，把 `(created_at, id) < (时间, 3)` 看成两步：先比时间，较早的入选；时间相同才比 ID，小于 3 的入选。这里比较的是数据库里的两个值。

```sql
SELECT * FROM page_lab
ORDER BY created_at DESC, id DESC LIMIT 2;
-- 第一页：4、3；它们的created_at相同。

INSERT INTO page_lab VALUES (5, '2026-11-05T00:00:01Z');
SELECT * FROM page_lab
ORDER BY created_at DESC, id DESC LIMIT 2 OFFSET 2;
-- 第二次按位置：3、2。

SELECT * FROM page_lab
WHERE (created_at, id) < (timestamptz '2026-11-05T00:00:00Z', 3)
ORDER BY created_at DESC, id DESC LIMIT 2;
-- 第二次按边界：2、1。
```

这里只用一个连接，先改临时表再读下一页，便于看清哪条记录移过了分页边界。HTTP操作稍后再在两次读取之间提交真实采纳。结果网格中同时看created_at和id：若只记时间，四条并列记录会被看成一个位置。

继续执行文件里的DELETE，只删除临时表的3，再运行相同边界查询，仍得到2、1。边界保存了值，不需要那一行继续存在。最后执行ROLLBACK，撤销整个临时实验；SQL报错导致事务失败时也先ROLLBACK，再从BEGIN重新开始。此实验不修改captures或learning_records。

### 同一毫秒下，为什么不能只带时间

下一页的条件必须是：时间早于上一页最后一项，或者时间相等但ID更小。只用 `created_at < lastTime`，会把同一毫秒剩余的项全部排除；用 `<=`，又会重复已经返回的项。两个字段共同组成一个严格的边界：

```text
created_at < lastTime
OR (created_at = lastTime AND id < lastId)
```

排序方向和比较方向必须一致。当前两个字段都降序，所以取“小于”；若改成升序，边界也要改成“大于”。如果一个字段升序、另一个降序，就要分别判断方向，不能对整对值直接用“小于”。UUID是唯一补充键，不是发生先后的证据；同一时间内按UUID排序，只保证这组数据有确定顺序。

已有列使用毫秒精度，Prisma读出的Date和toISOString也保留毫秒，边界往返不会把更精细的值截掉。若以后列改成微秒，仍用JavaScript Date保存边界会丢精度，可能重复或漏项；应保留数据库的完整精度表示并同步查询实现。这里没有为了分页新增序号，也没有把ID误当成提交顺序。

要自己写续页条件，可以先画一张只有三行的判断表。把上页末项写在纸的正中间，给它时间十点、标识三。第一行候选是九点、标识九，它的时间更早，不管标识多大都应留下。第二行是十点、标识二，同一时间要看第二列，它也留下。第三行是十一点、标识一，标识虽然小，却排在已读边界前，应排除。然后再放入原来那行十点、三，严格比较应当为假。根据这四格写条件，会自然得到「时间早，或时间相等且标识小」。若写成时间和标识都小，只要试九点、九就能推翻；若把两个小于直接用 OR 相连，只要试十一点、一就能推翻。

在 DBeaver 另起一条只读语句，把这些纸面值变成可见的中间列。先预测哪几行的两个判定不同，再执行。整数时刻只用来模拟小时先后，标识是并列时的次序；正式表仍按原类型比较。

```sql
WITH samples(hour_no, id) AS (VALUES (9,9), (10,2), (11,1), (10,3))
SELECT hour_no, id,
       hour_no < 10 AS earlier,
       hour_no = 10 AND id < 3 AS tied_and_lower,
       (hour_no, id) < (10, 3) AS after_boundary
FROM samples
ORDER BY hour_no DESC, id DESC;
```

结果按顺序先出现十一点、一，再出现十点、三。这两行最后一列都应为假。接着是十点、二和九点、九，最后一列为真，但让它们入选的原因不同。自己把最后一列替换为刚推导的两段布尔表达式，比较四行有没有一处改变，再把表达式移到 WHERE 中。这样从判断一行是否要保留，到得到整页候选，中间没有一步需要记忆某种数据库专用写法。正式查询仍要写 ORDER BY，因为筛选只回答谁合格，两条合格的行谁先交付由排序决定。

现在看一个能骗过前面四条同毫秒样本的错误实现：只保存数字三，第二次查询条件写成标识小于三。它在原来的临时表恰好也返回二、一，删去边界行后甚至仍然通过。加入九点、九就会看见它漏项。这是构造小数据时值得花力气的一步：确保第一排序列与第二排序列有一次意见不同，才能验证程序确实先看了时间。同样，每条记录都给不同时间也不够，因为错误地省去标识仍可能全部通过。既要有并列，也要有跨时刻反向的标识，这组数据才足以区分三种看似合理的实现。

若换成「时间仍按新到旧，同一时刻标识从小到大」，不用另学一套算法。拿十点、三作界，九点、九仍入选；十点、二现在已经走过，十点、四才在后面。先调整这张判断表，再写成时间早或同时间标识大，并把第二个 ORDER BY 方向一并修改。原来的游标是按旧排序签发，不能套上新比较方向沿用。这个假设变化只用来检验能否独立推出谓词，本章交付仍使用两个字段都降序的规则。

## 33.2 给边界加上可验证的查询上下文

### 游标不是最后一项的ID，也不是一张通行证

只发一个UUID看似简单，但服务需要重新查出那行的时间，行删除后会丢失位置。我们选择把时间和ID一起放进游标。进一步考虑：学习来源列表拿到的游标，能否用于星图？按表达E1查询后，把expressionId改成E2还能继续吗？同一串边界值在不同集合里没有相同含义。

本章将这些条件绑定到游标：资源名称、当前用户、固定排序版本、实际limit、expressionId、from和to。缺省limit与显式20等价；其他条件按已经校验的值处理。不允许客户端传userId决定身份；目前由固定开发用户提供，身份篇接入后替换成已认证用户，每页仍保留关系归属条件。

这些要求是否一定需要签名？如果接口允许客户端自行选择一个合法的时间／ID边界，只要严格校验输入，并在每次查询中保留归属条件，无签名的键集分页也能成立。把查询条件一并带回再比较，可以发现客户端原样错用游标；但客户端仍能同时改写边界、载荷中的条件和请求参数。这不必然构成越权，却不再保证“只接受服务端此前签发的上下文”。

本章选择后一项更强的接口约定：边界、查询上下文和到期时间由服务签发，客户端原样交回。它让篡改明确失败，代价是密钥配置、轮换和过期恢复。若另一业务并不需要这个约定，可以选择无签名边界；不能把本章取舍推广成“Cursor分页必须带签名”。[Stripe的列表接口](https://docs.stripe.com/api/pagination)使用对象ID表达续页位置，便是另一种公开契约；本章保存双字段值，是为了不依赖边界行继续存在。

拿到 `nextCursor` 时，客户端看到的是一串形如 `body.mac` 的字符，中间用点分开。左边是游标带回的数据（载荷）：`at` 和 `id` 记位置，`scope` 记上面这组查询条件，`v` 是格式版本（本章为 1），`expires` 是到期时间。右边用来检查左边有没有被改过。整轮遍历从第一页开始计30分钟，后续页继承同一个到期时间，不因翻页无限续期。过期意味着重新读取第一页，不代表数据消失。30分钟是本接口选择的期限，不是分页标准，也不表示保存了30分钟的结果或需要回收服务端分页会话；当前没有这种会话存储。

期限也不会自动解决格式升级。当前只接受v=1，换密钥则立即拒绝全部旧签名。若以后想让旧格式自然过期，需要先让各实例兼容新旧格式，并从停止签发旧格式时计算兼容窗口；不能只看到expires字段就断言升级期间可以无缝续页。

编码本身不能防修改。左边用 Base64url 把 JSON 的字节写成适合放进 URL 的字符，客户端也能解码。如果右边只是用 SHA-256 算出的摘要（由内容算出的一串固定长度的字节），客户端改了左边也能重算右边。所以服务端用只有自己知道的密钥和左边的字符串计算校验值。用密钥和哈希函数（这里选 SHA-256）生成这种校验值的算法叫 HMAC，算出的值就是右边的 `mac`，下文也叫游标签名。收到续页请求时，服务端用同一把密钥重算，对不上就拒绝。它能发现篡改，不能隐藏内容，所以游标里不放原文、密码或令牌；日常日志也不记录游标、日期或查询条件。也不拿“签名有效”代替用户权限：即使游标曾由服务签发，数据库条件仍须限定当前用户可见的来源。

有效游标可以重复使用，客户端也能反复取首页或合法翻遍可见集合。因此签名不限制请求次数、查询成本或累计费用；这些要由页长、索引、超时和后续限流分别处理。[Google AIP-158](https://google.aip.dev/158)同样要求每页独立鉴权，但它允许续页改变page_size，本章则绑定limit：比较方案时应区分通用机制与具体接口选择。

```mermaid
flowchart TD
  Q[请求参数] --> V[校验形状 模式 时间区间]
  V --> C[校验游标签名 版本 期限 查询范围]
  C --> W[归属条件 时间范围 边界条件]
  W --> DB[数据库排序并多取一项]
  DB --> R[返回前limit项]
  R --> N[用最后实际返回项签发下一页边界]
```

设想用户在学习列表里同时打开两个标签页。甲看全部来源，每页两条；乙只看其中一个表达，也设成每页两条。两页可能碰巧有相同的末项，尤其当最近的两次采纳都来自这个表达时。若前端把两个按钮的游标都塞进同一个全局变量，乙读取下一页时，拿到的字符串在格式上完全正常。单看末项的时间和标识也完全说得通。可是乙之前已经看过的集合与甲不一样，不能证明甲的末项就是乙该继续的位置。把表达条件列入范围，服务才有依据对这个正常的操作失误给出确定的拒绝；前端也应让每个列表持有自己的加载状态。

可以从这个场景独立列出 scope 的字段。先写「在哪类集合里读」：来源的标识和表达节点的标识代表两种实体。接着写「替谁读」：即使两个用户刚好设置相同，服务仍要根据当前调用确定归属。再写「怎样决定成员」：特定表达和起止时间会让一些行消失。最后写「怎样决定到哪儿停」：排序方向和每页实际项数共同决定前一次界面已经交付的范围。每加入一个字段，都能指出删掉它以后哪两次不同操作会被误认成同一次。另一方面，请求的跟踪号每次都变，却不改变查询含义；若把它也算进去，合法续页反而次次都失败。

输入值先经 Schema 解释的好处可以从两次等价操作看出来。第一页省略页长，服务实际按二十计算；下一次客户端明确发送二十，只要两次其余范围相同，这仍是原来的读取。若直接对整条 URL 求标记，连参数排列顺序、转义写法都可能变成范围变化。反过来，把所有「看起来差不多」的参数都忽略也不对，增加一个下界，即使因为当前数据刚好集中在这段时间内而没改变结果，查询承诺仍然改变了。这里比较的是经过输入检查的查询意图，不是对两页结果做相似度判断。

从客户端恢复操作出发还能解释期限为什么继承。假设十点零五请求首页，十点三十四刚好又翻一页；在服务时钟没有跳变时，留给这一轮的时间约一分钟。若生成下一串时一律取「现在加三十分钟」，反复翻页就能持续延长这一轮的配置兼容负担。继承原到期时间以后，到了时间就要以当时的数据重新建立范围；把页面已累计的旧结果清掉再接新首页，才不会把新一轮第一页重复追加在旧页尾部。期限是从签发路径里的服务时钟算起，浏览器切到后台或电脑休眠，并不会暂停这个期限。

若用户只想比较同一页的两个显示样式，在合法期限内可以再提交同一个已保存的请求。服务重新依据同一个边界执行查询，不会因为上次用过这个游标便自动跳去下一页。这里没有“已消费一次”的数据库记录。反之，要前进必须接受本次响应里新给出的串。如果两次结果不同，先检查期间数据和可见条件是否变化；如果两次总是返回同样的两条，先检查下一次请求选用的是哪次响应留下的变量。前一个现象涉及实时读取，后一个现象往往只是客户端没移动位置。

### 在现有配置入口管理密钥

`src/config.ts`增加cursorKey，并在EnvironmentSchema中接受 CURSOR_HMAC_KEY：32 个随机字节，每个字节写成两个十六进制字符，共 64 个字符，字母用小写。这是留在服务端的密钥。生产缺失时在监听前报配置字段错误；日志只出现字段名，不出现值。开发和测试未配置时，每次创建应用临时生成一把密钥，这意味着开发自动重启后旧游标会失效。

```ts
import { randomBytes } from 'node:crypto';
// AppConfig增加 readonly cursorKey: string。
// EnvironmentSchema中：
CURSOR_HMAC_KEY: z.string().regex(/^[0-9a-f]{64}$/).optional(),
// parseConfig拿到parsed.data后、返回Object.freeze之前：
if (value.NODE_ENV === 'production' && !value.CURSOR_HMAC_KEY) {
  throw new ConfigError('CURSOR_HMAC_KEY');
}
// 返回对象中增加：
cursorKey: value.CURSOR_HMAC_KEY ?? randomBytes(32).toString('hex'),
```

需要在开发重启前后接着翻页时，在项目根目录运行一次下面的命令，然后把生成值写入已忽略的.env；不要覆盖已有数据库配置，不要把生成结果放进截图或提交。生产由环境注入同一把持久密钥，不自动读取开发.env。密钥是在.env中单独新增一行 `CURSOR_HMAC_KEY=生成的64位值`；等号右边换成刚生成的值，不能照抄这段说明文字。

```bash
node --input-type=module -e "import { randomBytes } from 'node:crypto'; console.log(randomBytes(32).toString('hex'))"
```

单机重启要保持密钥；以后多实例必须使用同一个配置，否则请求落到另一实例就会被拒绝。轮换密钥会使旧游标失效，客户端重新开始即可。当前只用新密钥验证，不同时接受新旧两把密钥。

### 核心实现：先验证原字节，再相信载荷

新增 `src/pagination.ts`，用Node内置crypto与已有Zod，完整签名函数和载荷Schema如下：

```ts
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { LearningQuery } from './learning-contract.js';
import { HttpError } from './http.js';

const CursorSchema = z.object({
  v: z.literal(1), scope: z.string(), expires: z.number().int().positive(),
  at: z.iso.datetime({ precision: 3 }), id: z.uuid().regex(/^[0-9a-f-]+$/),
}).strict();
function signature(body: string, key: string) {
  return createHmac('sha256', Buffer.from(key, 'hex')).update(body).digest();
}
```

pageRequest根据已验证的query构造scope，固定数组顺序消除对象属性排列的歧义。它只包含明确的协议字段，不直接序列化整个请求对象。随后先验签，再解析左边的 JSON。留意正则里的 43：右边传的是 32 字节的校验值，写成不带填充的 Base64url 字符串后是 43 个字符。它随游标发给客户端，密钥仍留在服务端。

```ts
export function pageRequest(query: LearningQuery, resource: string,
  userId: string, key: string) {
  const limit = Number(query.limit ?? '20');
  const scope = JSON.stringify([resource, userId, 'createdAt-desc,id-desc', limit,
    query.expressionId ?? null, query.from ?? null, query.to ?? null]);
  let expires = Date.now() + 30 * 60 * 1000;
  let boundary: { at: string; id: string } | undefined;
  if (query.cursor !== undefined) {
    try {
      if (query.cursor.length > 2048 ||
        !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(query.cursor)) throw new Error();
      const [body, mac] = query.cursor.split('.') as [string, string];
      const actual = Buffer.from(mac, 'base64url');
      if (actual.toString('base64url') !== mac || actual.length !== 32 ||
        !timingSafeEqual(actual, signature(body, key))) throw new Error();
      const parsed = CursorSchema.parse(
        JSON.parse(Buffer.from(body, 'base64url').toString('utf8')));
      if (parsed.scope !== scope || parsed.expires <= Date.now() ||
        new Date(parsed.at).toISOString() !== parsed.at) throw new Error();
      boundary = parsed;
      expires = parsed.expires;
    } catch {
      throw new HttpError(400,
        'Invalid or expired cursor; restart from the first page', 'INVALID_CURSOR');
    }
  }
  // 下面接where构造和返回值，不在这里结束函数。
```

timingSafeEqual要求两侧长度相同，所以先检查32字节；固定长度比较避免简单逐字符比较提前结束，但不能据此宣称整段HTTP处理都具有恒定时间。把收到的校验值解码再编码，是为了只接受服务端会生成的那一种拼写。验证签名使用收到的body原字符串，不能先改写JSON再验证另一份内容。[Node 24 crypto文档](https://nodejs.org/docs/latest-v24.x/api/crypto.html)说明了HMAC及恒定时间比较的接口与边界。

接在同一函数里建立 where。先看日期：`gte` 是“大于或等于”，所以起点 from 算在内；`lt` 是“小于”，所以终点 to 不算。再看 OR：它给出上一节的两种续页条件。记录既要落在日期范围内，又要排在游标之后，不能让一组条件覆盖另一组：

```ts
  const where = {
    ...(query.from || query.to ? { createdAt: {
      ...(query.from ? { gte: new Date(query.from) } : {}),
      ...(query.to ? { lt: new Date(query.to) } : {}),
    } } : {}),
    ...(boundary ? { OR: [
      { createdAt: { lt: new Date(boundary.at) } },
      { createdAt: new Date(boundary.at), id: { lt: boundary.id } },
    ] } : {}),
  };
  return { limit, offset: Number(query.offset ?? '0'),
    mode: query.mode, scope, expires, where };
}
```

这种用上一页末项的排序字段值继续读取的做法，叫键集分页（keyset pagination）。它使用Prisma的where表达边界，没有使用Prisma内置cursor参数。内置cursor通常以一个可定位记录的唯一条件建立起点，本章希望即使边界行不再存在，仍能用保存的值继续。选哪一种取决于记录生命周期与所需语义，不取决于方法名字是否叫cursor。

最后从本次返回项生成下一页；多取的那一行只用来判断hasMore，不能拿它当边界，否则它会被跳过：

```ts
export function pageResult(page: ReturnType<typeof pageRequest>,
  rows: { id: string; createdAt: Date }[], key: string) {
  const more = rows.length > page.limit;
  if (page.mode === 'offset') {
    const next = page.offset + page.limit;
    return { nextOffset: more && next <= 10000 ? next : null };
  }
  if (page.mode !== 'cursor') return {};
  if (!more) return { nextCursor: null };
  const last = rows[page.limit - 1]!;
  const body = Buffer.from(JSON.stringify({
    v: 1, scope: page.scope, expires: page.expires,
    at: last.createdAt.toISOString(), id: last.id,
  })).toString('base64url');
  return { nextCursor: body + '.' + signature(body, key).toString('base64url') };
}
```

Offset达到预算上限时，可能hasMore=true而nextOffset=null：数据仍有，但这个入口不允许继续深跳。界面应该说明达到页深上限，收窄日期或从Cursor首页重新开始；不能把null解释成总数据已经耗尽。Cursor的null才表示本次读取没有观察到更多匹配行；之后新增数据仍可能改变结果。

用纸笔走一次 pageResult，可以发现一个发生在最后两页之间的错位。五条按顺序叫甲乙丙丁戊，页长二。数据库第一次交还甲乙丙，响应只交甲乙。若开发者看变量名叫 rows 就用它的最后一项丙当边界，第二次从丙之后开始，得到丁戊，界面会显示甲乙丁戊。每一页的条数都很合理，总共只有四条被看见。正确边界取数组下标一的乙，第二次读丙丁戊，交丙丁；第三次才读戊。要复查这类错误，保存的是上一页「最后交付项」和下一页「第一交付项」，额外行的身份只用来解释它们为何相接。

再把样本减少到四条。第一页仍多看到丙，第二次只得到丙丁，虽然项目数等于页长，已经没有额外行。若用「恰好两条就一定有下一页」生成游标，前端要再发一次空读才能知道结束。在第一页只有一条或零条时，更没有可用来产生继续位置的额外证据。于是计算顺序应先确认是否观察到超出页长的一项，只有确实观察到了，才需要访问末项生成签名。把同一段代码放到空集也应自然得到空数组和结束信息，不需要捏造一个最小时间或空标识充当位置。

还有一种现实问题与数据条数无关。开发时重启后，新取的首页正常，原来的下一页却被拒绝。先保留原请求作为对照，核对资源、筛选、实际页长以及距首页签发过了多久，再看开发终端是否重建了应用、当时是否有持久配置。若同一进程中新首页立即就能接下一页，说明当前签发与验证能配合；这还不能证明重启前后使用同一配置。若只有重启前的串失败，配置寿命和到期都可能解释。诊断依据是重启时序、配置是否明确注入，以及在有效期限内重做一次受控对照，无需打开密钥值或把游标贴到日志中。

从数据库看，收到拒绝并不意味着 WHERE 找不到数据。这里有三个可区分的终点：当范围与签发信息不一致，方法在进入数据库包装器之前抛出错误；范围成立而边界之后恰无匹配行，数据库顺利交还空数组；数据库读取本身失败，原异常映射成服务不可用。把后两种混成「无更多数据」会让用户在服务恢复后仍以为已经读完，把第一种也当作普通空页则掩盖了前端传错范围的问题。在调试器分开看 pageRequest 返回处和查询完成处，比给所有空白界面统一加一次自动重试更容易找到中断的位置。

## 33.3 接回两个列表，保留旧调用方

### 模式与输入一起校验

旧客户端只会发送limit和expressionId。若服务突然要求传mode，或给严格校验的旧响应加字段，就可能把正常请求升级成错误。本章采用显式选择：不传mode，仍返回旧有items／nodes、limit和hasMore；传mode=offset才增加nextOffset，传mode=cursor才增加nextCursor。默认limit仍20，最大100，旧详情不变。

在 `src/learning-contract.ts` 用下面的PageQuerySchema与validPage替换原列表查询定义，再分别派生学习与星图Schema。这里只接受已经写成三位毫秒 UTC 格式的日期边界，不负责把当地钟表换成 UTC；33.4再把用户所说的一天换算到它。

```ts
const InstantSchema = z.iso.datetime({ precision: 3 }).refine(value => {
  const date = new Date(value);
  return !value.startsWith('0000-') && Number.isFinite(date.getTime()) &&
    date.toISOString() === value;
}, 'Expected a UTC millisecond instant in years 0001..9999');
const PageQuerySchema = z.object({
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/).optional(),
  mode: z.enum(['offset', 'cursor']).optional(),
  offset: z.string().regex(/^(?:0|[1-9]\d{0,3}|10000)$/).optional(),
  cursor: z.string().min(1).max(2048).optional(),
  from: InstantSchema.optional(), to: InstantSchema.optional(),
}).strict();
function validPage(query: z.infer<typeof PageQuerySchema>) {
  return (query.offset === undefined || query.mode === 'offset') &&
    (query.cursor === undefined || query.mode === 'cursor') &&
    !(query.from && query.to && query.from >= query.to);
}
export const LearningQuerySchema = PageQuerySchema.extend({
  expressionId: z.uuid().regex(/^[0-9a-f-]+$/).optional(),
}).refine(validPage, 'Invalid pagination mode or time range');
export const StarMapQuerySchema = PageQuerySchema.refine(
  validPage, 'Invalid pagination mode or time range');
export type LearningQuery = z.infer<typeof LearningQuerySchema>;
```

不传offset视为0，但传了offset就必须选择offset模式。cursor与offset不能混用；重复参数被simple解析成数组后不能通过string校验；未知字段仍由strict拒绝。from、to允许只给一端，两端都有时要求from严格早于to。输入里的 `2026-02-30` 不会被悄悄滚到三月；日期有效性由Schema检查，ISO往返再确认规范表示。接口年份限定0001～9999；JavaScript能表示的0000年不直接作为当前数据库适配器的合法输入。也不接受无时区本地时间或额外的小数精度。refine里的Date仍要先检查是否有效：不能假定前面的格式检查失败就一定不会执行后续细化；直接对Invalid Date调用toISOString会抛异常，把坏参数变成500。这里返回false，让统一输入校验产生400。

在LearningListSchema和StarMapSchema中都展开PageInfo，其他字段原样保留：

```ts
const PageInfo = {
  nextCursor: z.string().nullable().optional(),
  nextOffset: z.number().int().nonnegative().nullable().optional(),
};
// 两个列表Schema的z.object开头都增加 ...PageInfo。
```

服务发出响应前，只保留输出 Schema 列出的字段。如果这里漏写 nextCursor，断点里明明算出了它，Postman 收到的 JSON 里却没有。新增字段optional是为了旧模式允许省略；显式分页时pageResult负责返回对应字段，即使最后一页也明确给null。

把这次扩展当作一次客户端升级来读。旧的列表组件只认识 items、limit、hasMore，看到还有数据可以提示「还有更多」，但它没有任何已承诺的续页入口。若服务在它原有的请求下直接增发一个字段，宽松的客户端可能忽略，严格做输出检查的客户端则可能把整个成功响应当作结构异常。让调用方明确选 mode，有两个收益：旧响应仍能用原来的形状检验，新调用方也能区分「我没有请求续页协议」和「我请求了续页，但已经没有下一页」。这两个状态在代码里分别表现为属性不存在、属性存在且值为空。

可以用只有两条的结果验证这个差别，把页长也设成二。旧读取应返回两项且没有更多；偏移模式应返回相同两项并带空的下一偏移；游标模式同样返回两项并带空的下一游标。如果三个按钮调用同一个处理器，简单地检测 nextCursor 是否为假值，会把旧模式、偏移模式、游标末页一概归为同一状态。如果界面已经知道自己发出的模式，就按该模式检查应有的字段，再解释里面的值。在数据恰满一页时检查比在只有一条时更有区分力，因为还能顺手发现把「拿满」误读为「还有」的实现。

输入也可以沿这条线倒推。用户选了日期但没有点分页选项，日期改变成员范围，可以与旧读取形状共存；给了数量偏移却不给模式，则不知道调用者是否真的选择了偏移协议。本章在字段检查之外加组合检查，正是因为合法的单个数字放在这组参数里可能没有合法含义。若看到四百，先在 Postman 的 Params 查看实际勾选的行；关掉游标模式时若留着上次的 cursor 行，发送出去的地址仍然携带它。修复时将不再使用的参数从请求移除，把值清成空串仍表示明确给了一个不合约定的值。

返回数据也经过两道选择。查询 select 决定服务这一次从数据层拿到哪些事实，响应 Schema 决定允许哪些字段发给客户端。如果调试器在 pageResult 后看见正确的下一位置，前端却没有，先从 Network 看原始 JSON 是缺字段还是值为 null；若原始响应缺字段而查询方法返回对象里有，沿输出映射查；若方法返回时已经是 null，回到多取一行和实际匹配的行数。只凭页面「下一页」按钮置灰，既不能证明数据库没数据，也不能证明签名算法出了错。

### 查询条件留在数据库中

在 `src/learning.queries.ts` 导入pageRequest、pageResult，构造函数增加私有cursorKey。list的完整查询主体改成：

```ts
list(query: LearningQuery) {
  const page = pageRequest(query, 'learning-records',
    DEVELOPMENT_USER_ID, this.cursorKey);
  const { limit } = page;
  return this.state.track(() => this.database.run('listLearningRecords', async () => {
    const rows = await this.database.client.learningRecord.findMany({
      where: { ...ownedRecord, ...page.where,
        ...(query.expressionId ? { expressionId: query.expressionId } : {}) },
      select: recordSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1, skip: page.offset,
    });
    return { items: rows.slice(0, limit).map(recordView), limit,
      hasMore: rows.length > limit, ...pageResult(page, rows, this.cursorKey) };
  }));
}
```

pageRequest放在database.run之外。游标错误是客户端400，不该被存储包装器误判成数据库故障。真正SQL失败仍走原503路径，不能返回空页。日期、边界、表达与归属一起参与where；先取一页再在JavaScript筛日期，会使页长和hasMore失真。

starMap使用相同的边界机制，但绑定不同资源。完整方法如下，沿用第三十二章的 expressionSelect。`some` 要求这个表达至少有一条当前用户可见的来源，`_count` 只数这些可见来源。控制器参数类型同步改为 `Omit<LearningQuery, 'expressionId'>`，学习详情不改。

```ts
starMap(query: Omit<LearningQuery, 'expressionId'>) {
  const page = pageRequest(query, 'star-map', DEVELOPMENT_USER_ID, this.cursorKey);
  const { limit } = page;
  return this.state.track(() => this.database.run('readStarMap', async () => {
    const rows = await this.database.client.expression.findMany({
      where: { ...page.where, userId: DEVELOPMENT_USER_ID, learningRecords: { some: ownedRecord } },
      select: { ...expressionSelect, _count: { select: { learningRecords: { where: ownedRecord } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1, skip: page.offset,
    });
    return { nodes: rows.slice(0, limit).map(row => ({ ...expressionView(row), recordCount: row._count.learningRecords })),
      limit, hasMore: rows.length > limit, ...pageResult(page, rows, this.cursorKey) };
  }));
}
```

这里日期与游标针对表达自己的createdAt。某个老表达今天再次被采纳，会增加recordCount，但不会变成今天新创建的节点。星图的recordCount仍统计全部可见来源，不随节点日期范围截断；若用户要“今天学过的表达”，查询应从LearningRecord的时间推导，这时要看的是每次采纳发生在哪一天，而不是每个表达创建在哪一天，不能靠给现有参数改文案完成。

`src/captures.module.ts`的工厂新增APP_CONFIG注入，模块顶部导入APP_CONFIG及AppConfig类型：

```ts
{ provide: LearningQueries,
  useFactory: (database: DatabaseService, state: ApplicationState,
    config: AppConfig) => new LearningQueries(database, state, config.cursorKey),
  inject: [DatabaseService, ApplicationState, APP_CONFIG] },
```

同时更新openapi.ts：两个列表描述默认模式、offset上限、日期语义、30分钟期限和INVALID_CURSOR；参数从各自Schema的shape生成，不能只有实现接受cursor而文档不出现。Zod的跨字段refine不会自动变成OpenAPI能表达的全部组合规则，模式互斥与from＜to仍需写进接口说明。输出字段由各自响应Schema导出。

先脱离 ORM 手算一组来源与节点。设同一用户周一采纳了表达甲，周三又通过另一份素材采纳了它，周四首次采纳表达乙。读周三到周五的学习来源时，结果应是乙的一次、甲的第二次，按各自采纳时刻倒排。读同一范围的星图时，甲若在周一创建，就只有周四创建的乙入选。若把起点放宽到周一使甲也入选，节点甲的来源数应为二，图中仍只有一个甲节点。这样画出来源三行、表达两行，能先回答 API 返回的一行代表什么，再决定数据库 WHERE 的时间条件应该挂在哪个实体上。

要把这个推理写成查询，不妨先省去分页，只写「属于当前用户的每条来源」。对照 ownedRecord，可以看到服务同时限定记录、表达以及沿候选修订找到的素材归属。再加一个表达标识，就把上述三行缩小为某一个表达的若干来源。然后才在这个结果里写时间范围、严格边界、排序和页长。若先在所有来源里截取三行，再按表达筛掉两行，剩下的一行只能说明这三行里有一个匹配，完全不能说明更远处没有同一表达的其他来源。这个错误有时只表现为首页数量偏少，前端还会因错误的 hasMore 提前关掉下一页。

星图可以从另一端开始写。在表达集合里对每一行问「是否存在至少一条可见来源」，这正对应 some；另一个问题是「这一行关联了多少条可见来源」，对应带条件的计数。前者决定节点进不进列表，后者只决定进去以后显示的数字。若把每条来源与表达直接连起来后立刻限两行，甲的两条来源就可能花掉两个名额，页面看上去只有一个节点。若为避免重复只保留一个甲，又容易把它的计数算成一。先让外层的一行始终代表一个表达，才同时保住节点页长与来源计数这两个要求。

下文接好 HTTP 并按顺序完成集合第十一笔操作后，可以查证这个区别：看 Postman 集合的第九、第十笔采纳响应，将学习记录标识和表达标识分成两列，保留实际值。表达列应相同，来源列应不同。第十一笔对应另一义项，表达列应改变。随后列表要比较的是学习记录顶层 id，星图比较节点 id。如果拿两条来源里的 expression.id 做去重，前端会把一个真实的学习事件吞掉；若拿候选 id 给星图当节点，又会把一次表达复用误画成两个节点。字段名都叫 id，只有把它与所在对象和操作一起记录，才能让后面的重复判定有意义。

开始下文的联调前，先决定第十五步写入前要留下什么证据。第十七步验证续页里没有第一页已见的来源，只能排除一种重复，不能证明中间一条也没有漏。假设多取的第三条被误作边界，下一页仍可完全不含前两条，检查照样成功。要发现错位，在第十五步写入前另用同样条件的只读请求取得至少前三条，记下应紧接第二条的原第三条标识，保留第十三步保存的 firstCursor 不覆盖。第十五步写入确实排到队头且没有其他变化时，第十七步第一项应是这条原第三条。若不符，先按创建时刻和标识核对新来源究竟排在哪里，再沿返回末项、签发位置、下一页谓词依次查。

### 用已保存请求观察真实变化

运行 `npm run check` 后，用 `npm run dev` 启动。导入 `requests/chapter-29.postman_collection.json`，在集合Variables确认baseUrl对应当前API。它沿用前章的创建、修订、候选与采纳入口，没有实验业务路由。用新的虚构输入做一次准备；已有集合和真实数据不清空。

01～11新建一条输入，保存A～E候选，追加新修订，再采纳旧版A、B、C。A、B复用表达，仍有各自来源；D留待两页之间采纳。中断时保留变量，已创建或已采纳的步骤不要为了翻页重新运行。采纳超时仍按原operationId查证或重试，不能换一个操作身份。

12发送旧limit请求，响应仍只有旧字段。13发送Cursor首页，limit=2；测试脚本把nextCursor存为firstCursor，同时保存第一页ID。14读Offset首页。此时先记下两项身份，再执行15采纳D，使新学习记录进入队头；16按offset=2读取，17按保存的firstCursor读取。若期间没有其他写入，Offset会重复原第一页末项，Cursor沿旧边界继续。观察learningRecord.id，别只看英文文本：不同来源可能恰好共享表达。做16、17的对照期间不要重新发送13，否则脚本会用新首页覆盖firstCursor和第一页ID，比较的就不再是插入前的边界。

18保留firstCursor但将limit改成1，应为400／INVALID_CURSOR；19传损坏游标，也拒绝。20、21分别读取星图首页与下一页，使用单独starCursor；不要混用两种资源的游标。集合没有假设第二页之后一定结束，手工继续时用刚返回的nextCursor替换上一轮值，直到null。参数变化、期限到达或密钥轮换后，删除cursor重新取首页。

![Postman返回400和INVALID_CURSOR](images/postman-invalid-cursor.jpg)

图33-1：损坏的cursor在查询前被拒绝。这里只展示虚构的broken值；核对状态、code和重新开始的提示，不用把真实游标复制到截图。

![Postman集合运行结果32项断言通过](images/postman-run.jpg)

图33-2：按集合顺序运行后，32项断言通过。集合检查的是预定的行为样例，不能由通过数量推导完整的并发或生产保证。

开发重启使游标失效时，先区分是否使用了临时密钥。若配置了固定密钥却仍失败，逐项比较limit、资源、日期、expressionId和当前用户；用X-Request-Id关联400，日志不记录游标本体。不要把失败恢复写成不断重试同一个无效cursor。

在 VS Code 的 Run and Debug 中启动 `EPP: attach to npm run dev`，在 `src/learning.queries.ts` 的 `list` 方法给 `return { items: ... }` 这一行设置断点。用 Postman 新开一个 GET 请求，发送 `/learning-records?mode=cursor&limit=2`，这样可以保留请求13为前面的对照实验保存的变量。请求会等在断点处。确认黄色箭头停在返回行，再切到 Debug Console。已有至少三条匹配记录时，输入下面的表达式：

```js
JSON.stringify({
  read: rows.length,
  limit: page.limit,
  returned: rows.slice(0, limit).length,
  boundary: rows[limit - 1].id.slice(-8),
  extra: rows[limit].id.slice(-8)
})
```

![VS Code在学习列表返回行暂停，控制台显示读取3条、返回2条，以及第2条和第3条记录的ID末尾](images/vscode-cursor-boundary.jpg)

图33-3中，`boundary` 是第2条记录的ID末8位，`extra` 是第3条的末8位，截短只是为了方便比对。第2条是客户端已经看过的最后一项，服务端用它的完整ID和创建时间签发游标。第3条让本页的 `hasMore` 为真，下一次查询仍应能读到它。

按 F5 继续后回到 Postman，检查响应有两项、`hasMore` 为 true，以及供续页使用的 `nextCursor`。若调试器里有续页字段而响应中缺少它，沿 ResponseSchemaInterceptor 检查公开Schema。调试时只查看本次查询所需的变量，不展开密钥配置。

### 稳定排序不等于固定快照

每次翻页，服务都会重新查数据库。游标只记住“上次读到哪”，没有固定“上次查询时能看见哪些记录、它们当时是什么值”。数据库快照固定的就是这样的可见范围和版本。页首新项不会插入已经走过的边界后面；但若新数据被回填到更早时间，它仍可能出现在后续页。排序字段被修改，旧项可能跨过边界；关系归属或可见来源变化，也会改变后续结果。星图计数尤其是实时事实，不承诺各页取自同一时刻。

当前业务入口不允许修改学习记录与表达的createdAt，这使边界稳定；管理员SQL、导入和未来修复工具仍可能改变前提。若需求是“导出任务开始时所有记录，每条恰好一次”，就不能直接复用UI分页并宣布完成。需要明确快照、冻结成员集合或可追踪导出任务，支线33A继续推导。没有相应索引时，Cursor也不自动等于快查询，成本留给第 35 章验证。

## 33.4 先确定是哪一天，再形成UTC区间

### 时间点、当地钟表和日历日期各是什么

`2026-11-05T00:00:00.000Z`是一个时间点。在上海显示为11月5日08:00；若用户筛“上海的11月5日”，起点其实是前一天16:00Z。对ISO字符串取前10位得到的是UTC日期，不能直接当作所有用户的本地日期。

PostgreSQL的timestamptz保存时间点，输出按会话TimeZone显示，不保留原始输入的时区名称；timestamp without time zone保存一组钟表读数，单凭它不能确定全球时间点；date只表达日历日期。为“某天生日”保留date、为“某次采纳发生时刻”保留timestamptz，是对事实的不同选择。预约“纽约每天九点”还需要地区时区与日历规则，单存一个UTC时间点不能表达将来的全部重复计划。[PostgreSQL日期与时间类型](https://www.postgresql.org/docs/18/datatype-datetime.html)说明了这些类型与显示转换。

API 会重复使用一组数据库连接，这组连接叫连接池。前篇已让它们按 UTC 显示时间。DBeaver 用自己的连接，可以按不同的时区显示同一条记录。判断是否同一时刻，可以把两边都转成 UTC 再比较，不能仅凭两块界面相差八小时就给数据加八小时“修复”。

假设学习页面上某条来源标为「五日凌晨零点十分」，同事从响应里复制的 createdAt 却写着四日下午。先请双方说清手上拿的事实：页面是在某地区把一个时刻格式化成当地钟表，响应给的是全球同一时间轴上的位置。比如上海的五日零点十分，减去八小时就是四日十六点十分的 UTC。这里日号减少只是换算跨过午夜，没有第二次采纳。若把页面日期直接拼上 UTC 午夜当下界，查询会从上海五日上午八点才开始，那条凌晨的记录自然不在结果中。改显示格式不会把它补进数据库已经筛完的列表。

要写「某地区某一天」的查询，先在空白编辑器把需求改写为两个界桩：当地这一天刚刚开始，和当地下一天刚刚开始。输入是一组地区名称加一个日历日，输出才是两项可拿来与列值比较的时间点。先不碰业务表，只写 SELECT 检查这两个界桩落在哪个 UTC 日期。两项都对了，再把它们接进素材或学习来源的 WHERE。这样若查询返回零行，可以分别追问是区间本身计算错，还是合法区间里面确实没有本用户的来源。若一上来就把换算、关联、筛选和限量写在一起，一个空网格很难指明出错位置。

这里有两次看起来很像的类型转换。第一次从「上海十一月五日零点」出发，钟表没有偏移，要告诉数据库按哪个地区解释，于是得到一个确定的时间点。第二次从已经确定的时间点出发，想把它写成便于复制给 API 的 UTC 文本，需要先按 UTC 展开年月日时分秒，再格式化。一个方向是解释人写下的钟表，另一个方向是展示事件；把地区名称加上去不等于无条件加减若干小时。在 DBeaver 把中间的 start_at 单列出来，与最终的 from_utc 并排显示，前者可能随当前连接的显示设置变化，后者的字符串由查询显式指定。要比较时刻就比时间点或统一表示，不能对任意显示文本做字典序比较。

还有一种似是而非的修复：把每条记录先截成年月日，再与用户选择的日期相等。若取日期时采用连接默认地区，换台机器就可能换答案。即使显式指定正确地区，这个写法也把换算放到了每条候选行上；用户这次只选了一个地区和一个日期，完全可以先算两个常量，用原始时间列与常量比较。后一种表述直接保留了范围的方向，也给后面检查普通时间索引留下机会。实际是否用索引要看数据和执行计划，本章先把含义写到无需借助连接默认值也能检查的程度。

### 自然日用左闭右开，不找最后一微秒

本章API接受from包含、to不包含，条件为 `created_at >= from AND created_at < to`。上海2026年11月5日对应：

```text
from = 2026-11-04T16:00:00.000Z
 to = 2026-11-05T16:00:00.000Z
```

下一天从前一天的to接着开始，午夜只属于其中一天。不要把结束时间写成23:59:59；那会漏掉最后一秒里的记录。写成23:59:59.999虽然适配当前毫秒列，却把正确性绑在存储精度上。用下一天起点作排除边界，不必猜最后一个可表示时刻，也避免BETWEEN两端都包含造成相邻日期重复。

在DBeaver打开 `database/chapter-29/02-natural-day.sql`，先执行第一条只读查询。先看上海这一行：`day::timestamp` 把 11 月 5 日这个日期写成 11 月 5 日 00:00 的钟表读数；`AT TIME ZONE zone` 指明这是上海的午夜，于是能确定它在全球对应哪个时间点。对下一天也做一次同样的换算，再用两个时间点相减。`extract(epoch FROM end_at-start_at)` 在这里取出相差的秒数，除以 3600 就是两次午夜之间实际经过的小时数：

```sql
WITH days(zone, day) AS (VALUES
 ('Asia/Shanghai', DATE '2026-11-05'),
 ('America/New_York', DATE '2026-03-08'),
 ('America/New_York', DATE '2026-11-01')),
 bounds AS (SELECT zone, day,
   day::timestamp AT TIME ZONE zone AS start_at,
   (day + 1)::timestamp AT TIME ZONE zone AS end_at FROM days)
SELECT zone, day,
 to_char(start_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS from_utc,
 to_char(end_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS to_utc,
 extract(epoch FROM end_at-start_at)/3600 AS hours
FROM bounds;
```

![DBeaver显示三个自然日对应的UTC边界和小时数](images/dbeaver-natural-days.jpg)

图33-4：相邻的本地午夜分别换算成UTC后，上海示例为24小时，纽约两个切换日分别为23和25小时。

上海这一行是24小时，纽约两行分别是23与25小时。自然日不是恒定86400000毫秒：夏令时开始会跳过一段钟表时间，结束会重复一段。应先在目标地区日历中求下一天，再把两个边界各自换成时间点，不能给起点固定加24小时。[PostgreSQL的AT TIME ZONE与时间运算](https://www.postgresql.org/docs/18/functions-datetime.html)提供了这一转换机制。

本章选定的示例日期在这些地区具有明确的午夜边界；并非所有地区、历史日期都如此。某些地区切换可能跨午夜，甚至跳过整个日历日。面向全球预约时必须定义不存在或重复的本地时间如何处理，不能靠数据库默认选择替产品作决定；支线33A进一步区分历史展示与未来计划。

再执行文件的第二条查询，四个虚构时间点分别位于起点前1毫秒、起点、终点前1毫秒和终点。included应依次为false、true、true、false。此处是只读VALUES，不改任何业务时间。Postman的22把同一from／to传给真实学习列表，范围内没有已有记录时返回200空集是正确的；想对照一条实际记录，就先查看它的createdAt，选覆盖它的地区日期，再用前述SQL求边界。23验证不存在的日期被拒绝，24仍读取旧来源详情。

![DBeaver显示半开区间的四个边界样例](images/dbeaver-half-open.jpg)

图33-5：included只勾选起点和终点前1毫秒；起点前与下一日起点都不属于本日。

当前API刻意只接收规范UTC边界，没有加入任意day／timeZone的服务端换算入口。这样，分页条件明确且可复核；调用方选择某个自然日时负责先求出边界。未来客户端若需要服务端统一处理日期与地区，应定义地区白名单、无效日与换区规则，再增加对应契约，而不是让服务器默认时区猜测用户意图。

可以把配套 SQL 拆成三个能各自运行的草稿。第一稿只有 days 的 VALUES，把日期与地区并排打印，先确认输入确实是日期，地区由数据提供。第二稿在 SELECT 里计算 day 和 day 加一分别对应的午夜，暂时只看换算出的两个时间点。第三稿再用差值算小时数并格式化两端。每加一步都要问它是在当地日历上计算，还是在全球时间轴上计算；「当地明天」属于前者，「过了多少小时」属于后者。把这两步的次序对调，上海样本仍会通过，纽约样本才会把差错显出来。

以纽约三月八日为例，零点尚在冬季偏移，映到 UTC 是五点；次日零点已采用夏季偏移，映到 UTC 是四点。两个边界的日号相差一，时刻只差二十三小时。若用第一天的起点直接加二十四小时作上界，次日当地零点半也会被收进前一天。十一月反过来，前一午夜映到四点，后一午夜映到五点，固定加二十四小时会把当晚的最后一小时排除。这不是显示时标签错一小时，而是两笔本应分属不同集合的学习记录真的被查询错收或漏收。可以先手算两端，再去 SQL 结果中对照小时列，避免只记住春短秋长而不会写边界。

现在从空白写第二条样本查询，不抄 included 一列。先给四行各写一个标签和一个时间点，在结果中加两列布尔值，分别回答「已经到达起点吗」「还没有到达终点吗」。起点之前一毫秒只满足第二问，起点恰好两问都满足，最后一毫秒仍都满足，下一日零点只满足第一问。把两列以 AND 合起来，自然得到当天应入选的两行。接下来把同一批样本送进相邻日的判定：下一日零点在原日为假，在次日为真；若两个都真，优先检查是不是用了包含终点的条件。用这同一行跨两个查询验算，才能检验业务日拼起来既连续又不重叠。

对接 Postman 时不妨挑本轮真实采纳的一条，在响应中抄下完整的毫秒时间和来源标识，先不用自然日，只令 from 等于它，看看包含起点的请求是否能找回它。若同一时间还有许多来源，放宽页长或沿合法游标继续，不要以「第一页没看见」断言起点不包含。再令 to 等于它，移除 from（或换成更早的起点），该来源就应被排除。这里每次改条件都从首页开始，不能把上次保存的串带到新范围中。确认接口对两个边界的解释后，才换成刚算出的整日区间，出现差异就能缩小到日历换算、请求范围或列表实体之一。

一笔记录同时携带来源和表达的创建时刻，选错字段时，这种对照尤其重要。页面显示表达名称及其最早创建日期，用户却点了「当天采纳」，应取来源的时刻来验证。如果只用第一次创建表达的那笔来源作样本，两种选法可能恰好都落在同一天，看不出错。选一笔复用已有表达的后续采纳，再分别对照节点和来源的日期，两个筛选的含义才真正可分。在没有跨日样本时，可以用上述三行纸面事件先判断预期，不能因为眼下两个接口都返回一项就把它们写成同一个日期定义。

### 交付时把时间、密钥与旧数据一起核对

先用 `npm run check` 核对类型与产物，再在独立校验库运行现有 `npm test`。测试只从.env.test的TEST_DATABASE_URL取连接，不读取日常.env，不回退到继承的DATABASE_URL。本章小范围回归覆盖并列边界、页首插入、边界行删除、签名与查询范围、到期、日期区间、两个列表和旧响应；正常操作仍以保存的图形请求与SQL为主。

交付核对沿用独立目录：复制dist、package.json、package-lock.json、.npmrc，运行 `npm ci --omit=dev`。先由运行环境设置DATABASE_URL与持久CURSOR_HMAC_KEY，再启动 `NODE_ENV=production PORT=3001 node dist/src/server.js`。不要把.env或密钥文件复制到交付目录。缺少密钥应启动失败并只报告字段名，提供后生产/docs默认404且不开Inspector。

读取升级前的学习ID和原采纳回执，比较原结果；再取一页游标，正常停止并用相同密钥重启，继续下一页。若为了验证轮换改用新密钥，预期是旧游标400、重新取首页200；数据库记录不应因此变化。生产游标期限基于服务时钟，多实例时还需要时钟同步，不能用客户端时间决定是否过期。

中断后保留数据库、章节代码、已保存的操作身份和请求条件。30分钟内且密钥不变可以继续，超过期限重新读取首页；不要重新执行01来“恢复分页”。本章建立了可解释的下一页与日期区间，第 35 章会沿这些真实where、orderBy、skip和take检查执行成本，判断哪些索引有用、哪些只增加写入负担。

交接这轮结果时，选一笔旧来源和它的详情作为不随分页模式改变的对照，再单独保存这次首页的有序来源标识。两者解决的问题不同：旧详情能读回，说明原有标识和来源内容仍能使用；同一密钥重启后能沿首页继续，则说明进程更替没有丢掉重建位置所需的信息。假设重启成功且旧详情依旧可读，续页却失效，此时重新做一次采纳不会修复配置问题，反而改变了正在观察的集合。先核对同一资源、日期条件、实际页长和签发时间；新首页到下一页若能在同一进程完成，再检查启动前配置的来源。

还有一种中断恰好发生在页与页之间：页面已经显示第二页，但只留下了第一次请求的串。恢复后若直接追加从这个串取得的结果，很可能又追加第二页。要继续保留已读列表，需把「已经接受到哪一项」与「接下来要发送什么」一起保存；若做不到成对恢复，清掉旧累计、从首页开始更容易解释。在本章的 Postman 对照中，firstCursor 特意保留作插入前的实验基准，所以手工向第三页前进时应另用当前响应的 nextCursor。固定证据和可推进的位置各有用途，换掉了前者，就无法再复核最初的两种第二页。

## 知识支线

[支线33A：完整导出、变化中的列表与地区日历](side-01-snapshots-and-calendar.md)改变读取目标，推导快照、成员冻结与未来日历规则为什么不能由一个游标替代。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点与官方入口 |
| --- | --- | --- |
| LIMIT／OFFSET | 跳过位置后截取 | 唯一排序仍不能阻止跨请求漂移，[PostgreSQL 18](https://www.postgresql.org/docs/18/queries-limit.html) |
| 行比较与OR边界 | 按时间和唯一ID继续 | 顺序方向与边界严格性一起推导，[行比较](https://www.postgresql.org/docs/18/functions-comparisons.html#ROW-WISE-COMPARISON) |
| Prisma skip／take／where | 将分页和筛选放在数据库 | 本章自己表达键集条件，不依赖边界行存在，[Prisma 7分页](https://www.prisma.io/docs/orm/v7/prisma-client/queries/pagination) |
| createHmac／randomBytes | 签发游标与生成密钥 | 密钥需持久保存，HMAC不是加密，[Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html) |
| timingSafeEqual | 比较固定长度摘要 | 先检查长度，整个处理流程不因此自动恒定时间，[Node 24 crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptotimingsafeequala-b) |
| base64url | URL适用的字节表示 | 能解码，不保密，[Node Buffer](https://nodejs.org/docs/latest-v24.x/api/buffer.html) |
| z.iso.datetime与refine | 日期表示及跨字段输入校验 | 日期必须有效，跨字段规则另写接口说明，[Zod日期](https://zod.dev/api#iso-datetimes) |
| AT TIME ZONE | 当地钟表与时间点互换 | 根据输入类型有不同方向，[PostgreSQL时间函数](https://www.postgresql.org/docs/18/functions-datetime.html#FUNCTIONS-DATETIME-ZONECONVERT) |
| 左闭右开区间 | 相邻自然日无重叠衔接 | 使用下一日边界，不猜最大精度；列类型见[时间类型](https://www.postgresql.org/docs/18/datatype-datetime.html) |

本章完成代码状态为 `part-04/chapter-33`，配套入口为 `database/chapter-29/README.md`。

阅读约 175～205 分钟，跟做另加 95～125 分钟。可在临时表回滚、游标函数接齐、Postman 两种次页对照完成后分次停下。跨次恢复时重新核对范围和期限。支线另计。

[上一章：构建可供客户端使用的查询接口](../chapter-32-queries/chapter.md) · [第四篇导读](../README.md) · [全书目录](../../README.md)

[下一章：已有素材列表怎样从全量读取迁到分页](../chapter-34-paging-upgrade/chapter.md)
