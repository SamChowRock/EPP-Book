# 第 30 章 创建素材与追加修订怎样承受重试

第二十九章让采纳操作在响应丢失后找到原结果，但保存素材的入口仍然是另一回事。用户在编辑框里写了一段话，点击保存，页面一直转圈；刷新以后再次提交，服务会产生第二条素材。若第一次是在追加修订，重发还会产生下一版。数据库事务没有失效：两个请求各自都完整提交了，只是服务不知道它们表示同一次决定。

这次把操作身份扩展到 `POST /captures` 和 `POST /captures/:id/revisions`，并把客户端也放回链条。服务器保存回执，浏览器保存待确认的身份与输入；刷新、断线、换账号以及旧客户端请求，分别有明确的行为。原文相等不充当去重依据，追加修订也不再拿当前最新版冒充第一次的结果。

代码从[第 29 章](https://github.com/SamChowRock/epp-public/tree/part-04/chapter-29)继续，完成状态为[第 30 章](https://github.com/SamChowRock/epp-public/tree/part-04/chapter-30)。Node 24.22.1、PostgreSQL 18、Prisma 7.10.1、Postman、DBeaver和Chrome沿用前章；浏览器页面、固定身份夹具与故障代理的准备见[本章环境入口](../../environment-setup.md#第-30-章在同一页签恢复待确认的提交)。练习使用非空VERIFY副本，保留旧素材、修订、候选和采纳回执。尚未有真实登录，当前用户由服务端固定；第五篇把同一能力接到Cookie会话，不能将练习身份当成认证。

阅读约 175～210 分钟，跟做另加 135～170 分钟。跟做包括用原键核对历史修订、从父记录与回执各写一条查询，以及同页签恢复后的交付对照。可在结构迁移核对后、正式API重放通过后、浏览器恢复完成后分别停下，故障约束必须先移除，服务与代理停妥，再离开练习。

## 30.1 先区分重试、再次记录与再次编辑

### 两次相同的文本，不一定是一件事

先在第 29 章的VERIFY服务发两次原创建请求，Body都用 `{"originalText":"Take a break."}`。保存两次201中的ID，DBeaver按这两个ID查询captures及其revision_no=1的修订。两份素材都有自己的身份，这符合“今天记一次，明天又主动记一次”。不能在original_text上加唯一约束，强迫每个人只记录一次相同的话。

问题出在另一种经历：第一次实际上已经提交，客户端不知道；第二次只是想确认第一次。两次HTTP的requestId不同，Body又与主动再次记录完全一样，仅靠服务器观察请求内容无法区分。操作身份必须由能区分意图的调用方保存，在第一次发送之前就决定。

追加修订也一样。连续两次向 `/captures/原ID/revisions` 提交相同正文，可能产生第2版和第3版。修订号唯一约束防的是同一个素材出现两份第2版，不会阻止两次合法的顺序追加。幂等解决同一意图重复发送，版本校验解决编辑是否基于过期前提，内容比较解决两个版本有哪些差异；三个判断不能互相替代。

保留这些旧请求作为对照。本章新增**可选**请求头 `Idempotency-Key`，使用小写UUID。它是本项目明确约定的接口字段，不依赖浏览器自动生成，也不意味着代理或框架自动替我们实现了幂等。请求体保持已有契约：

```http
POST /captures
Content-Type: application/json
Idempotency-Key: 30000000-0000-4000-8000-000000000001

{"originalText":"Take a break.","chineseIntent":null}
```

导入配套 `requests/chapter-30.postman_collection.json`；在集合变量中保存自己生成的createKey、revisionKey、nextRevisionKey。先保存集合，等30.3完成代码并启动正式VERIFY API后，再按01～09操作；01完成后把响应ID填入captureId。在Postman的Headers中核对键与变量，保存请求。首次发送与重试使用同一值；只有用户明确开始另一件事时才生成新值。不要在每次请求的Pre-request Script里无条件生成UUID，那样点击Send重试就会悄悄变成新操作。正文中的UUID只用于说明，跟做时为自己的新操作生成一次并保存。

在决定给哪个请求加头之前，先用两种用户动作检验方案。一位学习者上午在听力课上记下这句英语，下午又从另一段对话里摘录同一句，各点了一次“新建”。另一位学习者上午点了一次保存，页面没拿到结果，下午重新打开练习页，只想完成上午那笔。把请求里的原文和中文意图抄在纸上，两种经历完全可以逐字相同。第一种应返回两个素材标识，第二种应返回同一个。这给服务端划出了一个信息边界：如果不能从用户选择的入口多得到一点信息，写再复杂的文本比较也推不出正确答案。

那一点信息可以来自两个清楚的交互。“开始新提交”把编辑框在这一刻的值固定下来，同时生成一个此前未用过的操作键；“继续上次提交”则取回那一笔已经固定的值与键。表单上的文字有没有变化不是判断入口的条件。用户可以关掉一个已成功的结果重新录入同一句，也可以在另一个草稿里写了新文案以后回来确认旧稿。以前端习惯的受控组件来说，当前输入值随每次键入变化，已提交的请求参数应该是点击时取走的一个快照。把两者绑在同一个随时可改的对象上，第一次发送与恢复就可能只有键相同，内容却已经不同。

沿用前几章已经建好的素材与修订关系，先把这两种行分开数。上面两次无键创建以后，若只按原文搜索，会看到两句相同的文字；加上素材标识并把对应的初始修订标识并排显示，会看到两组各自独立的父子关系。再对其中第一条连续追加两次，父表仍是原来的两行，子表则由两行变为四行：第一条有第一、二、三版，第二条只有第一版。若把子表总数当成素材数，会误以为又创建了两个素材。若只观察素材总数，则两次意外重复追加也不会引起任何警觉。验收重试时，受影响的是哪一个集合，要从用户选择的动作推导。

可以先写一个简短查询核对这个起点。在 DBeaver 新开同一 VERIFY 连接的 SQL 编辑器，只从 capture_revisions 取 capture_id、revision_no、id 三列，用 WHERE 的 IN 条件只保留刚刚从两次创建取得的父标识，再按 capture_id、revision_no 排序。即使两笔原文相同，这个查询也不需要依赖字符串匹配。希望列表里同时保留某条缺第一版的异常素材时，再换成从 captures 出发并左连接修订，否则一条没有子行的素材本来就不会出现在子表查询里。练习时只需要前一种明细就能验证正常创建留下的两组事实，迁移验收则还要关心后一种遗漏。

把注意力从库内移回请求。创建前还没有服务器分配的素材标识，因此不能要求页面按素材标识恢复第一次创建。追加前已经有目标素材，却还不知道这次将得到的修订标识和版号。倘若用“现有最大版号加一”直接当操作身份，另一人先编辑一次就会抢走这个数字；倘若用本次准备好的下一版内容作身份，有意再次写回旧句子又会被误合并。给尚未完成的决定单独起一个名字，才能在执行前就安排恢复。真正成功后，回执把这个预先选的名字接到数据库最终给出的标识上。

### 用户、动作与操作键共同划定身份

本章的身份是 `(userId, action, operationId)`。创建动作叫 `create-capture/v1`，追加叫 `append-revision/v1`。同一个用户在同一动作下复用键，必须仍指向同一份输入；另一用户使用同一键是独立操作。创建和追加即使误用了相同字符串，也不会读到对方的响应类型。

动作为什么放进主键？上一章只有采纳，主键以用户和操作键界定统一空间；这次允许不同写入类别各自管理键，因此把类别明确放进身份。两种设计都可以成立，关键是把范围写进契约，并让锁名、查询和约束一致。不能只在查回执时带action，主键却仍限制另一个范围。

路径目标不放进主键。若追加操作K原本针对素材A，重试时把URL换成B，应被识别为K改了意图，而不是自动获得第二个可成功的位置。目标和输入放在请求指纹中；锁仍只按用户、动作和K协调。采纳继续使用自己的command_receipts，本章不改写其历史，也不把采纳结果塞进新的创建响应。

请求指纹从**解析后的业务输入**计算。创建省略chineseIntent，与显式null都表示没有意图，因而归一成null；追加的chineseIntent仍必填。inputSource省略时是manual，chunks省略时是null。文本的空白、大小写和chunks顺序都保持：本章原文契约没有授权丢弃这些区别。

```ts
const normalized = {
  originalText: input.originalText,
  chineseIntent: input.chineseIntent ?? null,
};
const fingerprint = createHash('sha256')
  .update(JSON.stringify([action, targetId, normalized])).digest('hex');
```

固定字段顺序避免对象键排列改变摘要。不要直接哈希原始HTTP字节；格式化JSON、属性顺序和省略默认值不该凭空制造不同操作。反过来，也不要为了让重试通过而trim原文。摘要只能比较输入，不能替代用户范围、权限和业务对象的真实ID。

先不写哈希，手工把两份请求翻译成服务看到的参数。第一份创建只提交有首尾空格的原文，第二份把同一原文和一个值为 null 的意图显式写出。解析并填默认值后，两份都是那串保留空格的原文和空意图；键相同就应该命中同一结果。现在只删去原文末尾的一个普通空格，屏幕上看起来几乎一样，保存后按标识读回的值却本应不同。如果指纹计算前先把原文两端都裁切，两个不同提交就会被说成相同，以至于调用者明明请求保存新文本，拿到的还是旧文本。判断是否等价要看一笔成功写入会留下什么事实，不能看界面显示时人眼是否分辨得出。

追加的情况再多一层。假设两个分块分别是「先读」和「再写」。调换 JSON 对象里几个属性的书写顺序，解析后程序仍按固定次序构造内容对象；把分块数组中两项对调，却改变了学习者安排的阅读顺序。数组为空也与没有提供分块不同，前者是一个确实提供的空列表，后者在本章规范化为空值。把它们一律翻译成空数组，可能让同一键换参数后仍被当作合法恢复。分析时先把每个位置允许的缺省值、显式空值和顺序列出来，再决定哪些能在解析后合并。只拿一个所有字段都填满且只有一个分块的样本，无法检验这些取舍。

把这几项推导记在 Postman 请求说明里就足够了：哪一个键代表本次创建，哪一个键代表本次追加，哪个素材是追加目标。集合里的 nextRevisionKey 用于第二次有意编辑，因此应另取新值；若误填成 revisionKey，服务会对比第一次编辑的输入，拒绝改变同一决定。若两次输入又恰好一样，服务还可能成功重放旧版，返回二百零一，却没有你以为的第三版。稍后联调时同时检查新修订标识和版号，就是为了区分“发生了一次新的编辑”和“页面再次看到了同一个成功结果”。

## 30.2 回执保存的是过去的决定

### 创建与追加分别需要找回什么

创建第一次返回素材ID、原文、意图和createdAt，Location指向 `/captures/原ID`。后来即使追加了新修订，重发创建K仍返回第一次的原文；GET详情则返回当前最新版。两者不同不是缓存过期，而是回答的问题不同：一个是“那次创建返回了什么”，一个是“现在是什么”。

追加需要保存原修订ID、captureId、revisionNo、原文、意图、来源、chunks和createdAt。若K产生了第2版，另一次操作已产生第3版，K重放依然返回第2版。不能先查最大版号，再拿那一行拼响应；那会把别人的后续编辑误认成这次提交的结果。

```mermaid
sequenceDiagram
  participant P as 页面
  participant A as API
  participant D as PostgreSQL
  P->>A: 追加K，原输入
  A->>D: 修订2与K的结果共同提交
  A--xP: 201在途中丢失
  Note over D: 另一个操作已经提交修订3
  P->>A: 原K、原路径、原输入
  A->>D: 当前归属允许后读取K
  D-->>A: 修订2的历史响应
  A-->>P: 原修订ID与revisionNo=2
```

把时间线具体到三个按钮。第一次点“创建”，库里有了素材甲和它的第一份修订，创建回执保存的是给创建页的公开结果。第二次点“追加”，对甲写了第二版，追加回执里的 id 是这次修订的标识，另外还有 captureId 指回甲。第三次再追加，库中多了第三版和另一份回执。此时若把三个回执的 response.id 各拿来拼成素材详情地址，会只有创建回执的那一条能按约定打开。另两条的 id 都指修订。接口同样把字段叫 id，含义必须由“这行代表哪一种动作的结果”决定，因此动作不仅参与唯一键，也决定读回时用哪一份结果结构。

可以把这个例子手算成四个问题。按甲查当前详情，原文应来自第三版；按甲列修订，能分别看见三份依据；拿创建的键重放，原文应回到初建值；拿第一次追加的键重放，应得到第二版的修订标识。若四个界面最终都显示第三版，很可能是读取端共用了一次“取最新”的查询。共享取最新的方法适合详情页，却无法供另外两项历史操作使用。反过来，若详情页一直显示初建原文，就该查看是否读了创建回执或父记录上的原始值，而非为当前详情设计的投影。区分这两类故障并不需要更多测试数据，一条经过三次变化的素材就足够。

现在从客户端能提供的信息推导新表的两条访问路径。恢复时知道用户、动作和键，期望直接取得唯一结果，所以这三列形成主键；维护时可能只知道一条素材，想查有哪些操作与它有关，这一条路径可以容许多行，迁移里另建了 capture_id 的普通索引。如果误把这个索引设为唯一，第一次创建有回执之后，第一次带键追加就再也不能为同一素材保存第二份回执。反过来，只给三列建普通索引而不要求唯一，查询虽快，数据层却不再保证“唯一结果”。看 DBeaver 的 Indexes 与 Constraints 两页时，先写出每种查法最多允许多少行，再判断眼前看到的索引究竟在加速什么、约束什么。

状态码和 Location 看起来像可以现算的小字段，也要把当前实现说精确。回执里的创建路径应是规定前缀加上 capture_id，追加回执这一栏则为空。重放代码先校验存下来的成功状态和路径是否符合动作，再解析保存的公开响应；Controller 用返回的创建标识设置 Location，追加入口不设置这个头。它没有从数据库搬出一大袋首次请求的 HTTP 头逐一照抄。若路径列指向甲而返回对象的标识却指向乙，按当前代码不能当成一笔完整的创建成功。验收时既看回执中的路径，也看真正发送给客户端的响应头，对上两边才能证明最终恢复出来的链接可用。

### 追加新表，保留已有业务事实

本章新增 `capture_write_receipts`，不修改第29章迁移，也不给无键历史生成虚构的键。从第29章自行实现时，先在 `prisma/schema.prisma` 的User和Capture模型中各加入下面这一行；已有关系保持：

```prisma
captureWriteReceipts CaptureWriteReceipt[]
```

再在同文件新增完整模型：

```prisma
model CaptureWriteReceipt {
  userId String @map("user_id") @db.Uuid
  action String @db.Text
  operationId String @map("operation_id") @db.Uuid
  captureId String @map("capture_id") @db.Uuid
  fingerprint String @db.Text
  statusCode Int @map("status_code")
  location String? @db.Text
  response Json @db.JsonB
  recordedAt DateTime @default(now()) @map("recorded_at") @db.Timestamptz(3)
  user User @relation(fields: [userId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "capture_write_receipts_user_id_fkey")
  capture Capture @relation(fields: [captureId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "capture_write_receipts_capture_id_fkey")
  @@id([userId, action, operationId], map: "capture_write_receipts_pkey")
  @@index([captureId], map: "capture_write_receipts_capture_id_idx")
  @@map("capture_write_receipts")
}
```

主键的字段顺序与SQL保持一致，生成客户端后才有 `userId_action_operationId` 查找键。保留下面手写CHECK，Prisma模型不能表达JSON顶层形状及Location与动作的关系。

创建目录 `prisma/migrations/20261116160000_capture_write_receipts/`，将以下完整SQL保存为其中的 `migration.sql`；完成分支已经包含该文件，直接核对即可，不再执行第二份同义CREATE：

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';

CREATE TABLE public.capture_write_receipts (
  user_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create-capture/v1', 'append-revision/v1')),
  operation_id uuid NOT NULL,
  capture_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  status_code integer NOT NULL CHECK (status_code = 201),
  location text,
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  recorded_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT capture_write_receipts_pkey PRIMARY KEY (user_id, action, operation_id),
  CONSTRAINT capture_write_receipts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT capture_write_receipts_capture_id_fkey FOREIGN KEY (capture_id) REFERENCES public.captures(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT capture_write_receipts_location_check CHECK (
    (action = 'create-capture/v1' AND location IS NOT NULL AND location = '/captures/' || capture_id::text)
    OR (action = 'append-revision/v1' AND location IS NULL))
);
CREATE INDEX capture_write_receipts_capture_id_idx ON public.capture_write_receipts(capture_id);

COMMIT;
```

user_id和capture_id分别引用既有用户及素材。response只保存公开Schema验证过的JSON，status_code保存201；创建的location保存原资源路径，追加没有Location时保存null。外键证明引用存在，不能单独证明调用者有权访问；重放之前仍查当前归属。

回执不是免费缓存。它增加了原文的另一份副本，备份、读取权限、后续删除和账号生命周期都要覆盖它。当前与采纳回执一样不自动清理，客户端可持原键恢复；保留期限变化的推导沿用[支线29A](../chapter-29-idempotency/side-01-retry-boundaries.md)，不能靠定时DELETE悄悄释放旧键。

先停妥VERIFY写入口，在DBeaver保留至少一份旧素材、修订以及旧采纳回执的ID和字段。按前章方式备份到独立副本，配置 `.env.database-verify`；不要把日常DEV当故障库。在配套分支根目录执行：

```bash
nvm use
npm ci
unset DATABASE_URL SHADOW_DATABASE_URL
npm run db:verify -- migrate deploy
npm run db:verify -- migrate status
npm run db:verify -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run prisma:generate
```

此处先核对结构并生成客户端；类型检查与构建放在30.3代码改完之后。完成分支也沿同一顺序核对，不需要改写迁移。

这里的迁移名用于稳定标识同一份变更，不代表业务记录的发生时间。Prisma按迁移历史登记已执行脚本；部署已有后续章节数据库时，也只追加本次缺失的迁移，不改写已执行文件及校验和。检查旧行逐字段保持、新回执表为空，再继续联调。先在VERIFY验证，日常DEV沿同样停写和核对步骤升级。

新服务启动会读取新表并核对主键；30.3会加入对应探针。表缺失、读取所需列权限不足或唯一身份约束不符，都应拒绝就绪；不能以“兼容旧版”为由默默退回无幂等路径。遇到迁移锁超时，沿前章先查首因和实际回滚，再处理失败历史；不要删除回执表让启动暂时成功。

给迁移验收写查询时，先决定数哪些事实，再选聚合。假定甲迁移前有两个素材，一个已有三版，另一个只有第一版，旧采纳回执还在。新增写入回执的迁移没有改业务行，所以期望仍是两个素材、四个修订，新表零份写入回执。若直接把三张表全做普通连接，新表为空会让整组结果都是零。改成全左连接也还没解决计数问题：一个素材有三版，同时有两份回执时，按同一素材配对将得到六行，数修订变成六，数回执也变成六。先把每一种事实分别按自己的行来数，再把数字摆在一行，最容易手算验证。

例如要以一个素材为单位核对三种数据，先从父表找当前用户的素材，投影它的 id；接着在 SELECT 里为这个 id 分别取两项统计。下面用实际素材标识替换全零值。迁移后、开始新写入前先对保留的旧素材运行，稍后在新建样本上用同一查询追踪每次操作。对同一条素材重复追加，修订数应该变化；重复请求同一个已经成功的追加，修订数与回执数都不变。

```sql
SELECT c.id,
       (SELECT count(*) FROM public.capture_revisions v
        WHERE v.capture_id = c.id) AS revisions,
       (SELECT count(*) FROM public.capture_write_receipts w
        WHERE w.capture_id = c.id AND w.user_id = c.user_id) AS write_receipts
FROM public.captures c
WHERE c.user_id = '10000000-0000-4000-8000-000000000001'
  AND c.id = '00000000-0000-0000-0000-000000000000';
```

外层按父标识而且限定属主，目标不存在时是零行；目标存在但还没有新式回执时是一行，最后一列为零。这两个结果对定位问题很不一样。若你想追问“这里究竟是创建回执还是追加回执”，可以另开一个编辑器，只从写入回执选 action、operation_id、capture_id，在 WHERE 带相同的用户和素材，把明细摆到统计结果旁边。旧素材通过无键入口追加以后，修订数可以上升而回执数不变；换成带键的首次追加，两列各加一。因此不能把所有历史的“修订数减回执数”解释为漏记，必须知道哪些操作原本就没承诺写回执。

第一次核对还应把旧采纳回执单独按用户和原操作键查出来，确认它仍指向原候选及学习记录。本章两张回执表并存，查询工具自动补全的名字很相似；查新表找不到上章的采纳键，完全可能是起点选错了。重启前后也要先确定拿来对照的是同一个副本，别在 VERIFY 完成了迁移和写入，转头去 DEV 截一张没有新行的图。连接名称可以自己起，最可靠的连贯证据是查询里的实际数据库名、保存的旧样本标识以及本轮刚观察到的结果都相符。

## 30.3 同一身份只保存一份成功决定

### 先协调操作，再读取结果

用 `CaptureCommands` 承担带键的创建和追加，原 `CapturesService` 保留无键路径。这样兼容逻辑在入口清楚分开，不把可选字段一路混进存储内容。Controller通过 `@Headers('idempotency-key')` 取得可选头并选择服务；输入验证、指纹、事务与重放在新服务内完成，直接调用它的测试也不能绕过校验。

在 `src/captures.controller.ts` 的 `@nestjs/common` 导入中增加 `Headers`，并新增 `import { CaptureCommands } from './capture-commands.js';`。保留已有Schema、类型、Response及拦截器导入。将构造函数改为：

```ts
constructor(private readonly captures: CapturesService, private readonly commands: CaptureCommands) {}
```

替换创建和追加这两个方法，其余读取与PATCH方法保持：

```ts
  @Post()
  @UseInterceptors(new ResponseSchemaInterceptor(CaptureResponseSchema))
  async create(
    @Body(new SchemaPipe(CreateCaptureSchema)) input: CreateCaptureInput,
    @Res({ passthrough: true }) response: Response,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    const capture = key === undefined ? await this.captures.create(input.originalText, input.chineseIntent)
      : await this.commands.create(key, input);
    response.setHeader('Location', `/captures/${capture.id}`);
    return capture;
  }

  @Post(':id/revisions')
  @UseInterceptors(new ResponseSchemaInterceptor(RevisionResponseSchema))
  appendRevision(
    @Param('id') id: string,
    @Body(new SchemaPipe(AppendRevisionSchema)) input: AppendRevisionInput,
    @Headers('idempotency-key') key: string | undefined,
  ) { return key === undefined ? this.captures.appendRevision(id, input) : this.commands.appendRevision(id, key, input); }
```

空头、非法UUID和同名头被合并后的多值都应400；只有**没有这个头**才走旧路径。不要用 `if (!operationId)` 把错误输入当成旧客户端。请求范围来自服务端用户注入，任何正文里的userId都不能改变它。

事务按下列顺序工作：取得操作级建议锁；用新的SQL语句读取已有结果；复核当前归属并比较指纹；没有结果才写业务；校验公开响应，插入回执；等待外层事务确认提交后返回。锁名使用动作、用户和操作键，与主键一致。取锁和读结果分开，沿用READ COMMITTED的逐语句快照；把二者揉成一条语句会丢掉等待后重新取得快照的前提。

新建 `src/capture-commands.ts`，以下完整文件包含入口校验、指纹、事务及错误映射。先顺着create和appendRevision进入execute，再对照取锁、重放、首次写入三个分支；无需把不同段落的片段自行拼成类。

<details>
<summary>展开完整 CaptureCommands 实现</summary>

```ts
import { createHash, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Prisma } from './generated/prisma/client.js';
import { DatabaseService } from './database.service.js';
import { ApplicationState } from './application-state.js';
import { AppendRevisionSchema, CreateCaptureSchema, CaptureResponseSchema, RevisionResponseSchema } from './capture-contract.js';
import type { Capture } from './capture.js';
import type { CaptureRevision } from './capture-revision.js';
import { RevisionConflictError } from './capture-revision.js';
import { CaptureNotFoundError, InvalidCaptureError } from './captures.service.js';
import { OperationConflictError } from './candidates.service.js';
import { StorageFailureError } from './database-errors.js';
import { HttpError } from './http.js';

const validId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
export function validateIdempotencyKey(key: unknown): asserts key is string {
  if (typeof key !== 'string' || !validId(key)) {
    throw new HttpError(400, 'Idempotency-Key must be one lowercase UUID', 'INVALID_IDEMPOTENCY_KEY');
  }
}
type Content = { originalText: string; chineseIntent: string | null; inputSource?: 'manual'; chunks?: { text: string }[] | null };

/** userId comes only from the server's identity provider, never the request body. */
export class CaptureCommands {
  constructor(private readonly database: DatabaseService, private readonly state: ApplicationState,
    private readonly userId: string) {}

  async create(key: string, input: unknown): Promise<Capture> {
    validateIdempotencyKey(key);
    const parsed = CreateCaptureSchema.safeParse(input);
    if (!parsed.success) throw new InvalidCaptureError('Invalid capture content');
    return this.execute('create-capture/v1', key, null, {
      originalText: parsed.data.originalText, chineseIntent: parsed.data.chineseIntent ?? null,
    }) as Promise<Capture>;
  }
  async appendRevision(id: string, key: string, input: unknown): Promise<CaptureRevision> {
    validateIdempotencyKey(key);
    if (!validId(id)) throw new CaptureNotFoundError('Capture not found');
    const parsed = AppendRevisionSchema.safeParse(input);
    if (!parsed.success) throw new InvalidCaptureError('Invalid revision content');
    return this.execute('append-revision/v1', key, id, {
      originalText: parsed.data.originalText, chineseIntent: parsed.data.chineseIntent,
      inputSource: 'manual', chunks: parsed.data.chunks ?? null,
    }) as Promise<CaptureRevision>;
  }

  private async execute(action: string, operationId: string, target: string | null, content: Content) {
    const fingerprint = createHash('sha256').update(JSON.stringify([action, target, content])).digest('hex');
    const result = await this.state.track(() => this.database.run('captureCommand', async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.database.client.$transaction(async tx => {
            await tx.$executeRaw`SET LOCAL lock_timeout = '1s'`;
            const lockKey = JSON.stringify(['capture-write', this.userId, action, operationId]);
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))::text`;
            // Separate statement after acquiring the lock: READ COMMITTED gets a fresh snapshot.
            const previous = await tx.captureWriteReceipt.findUnique({
              where: { userId_action_operationId: { userId: this.userId, action, operationId } },
            });
            const captureId = target ?? previous?.captureId ?? randomUUID();
            if (target !== null || previous) {
              const owned = await tx.$queryRaw<{ id: string }[]>`
                SELECT id FROM public.captures WHERE id = ${captureId}::uuid
                AND user_id = ${this.userId}::uuid FOR SHARE`;
              if (!owned.length) return 'missing' as const;
            }
            if (previous) {
              if (previous.fingerprint !== fingerprint || (target !== null && previous.captureId !== target)) {
                return 'operation-conflict' as const;
              }
              if (previous.statusCode !== 201 || previous.location !== (target === null ? `/captures/${captureId}` : null)) {
                throw new StorageFailureError();
              }
              const response = target === null ? CaptureResponseSchema.parse(previous.response) : RevisionResponseSchema.parse(previous.response);
              if ((target === null ? response.id : (response as CaptureRevision).captureId) !== captureId) throw new StorageFailureError();
              return response;
            }
            let response: Capture | CaptureRevision;
            if (target === null) {
              const now = new Date();
              await tx.capture.create({ data: { id: captureId, userId: this.userId,
                originalText: content.originalText, chineseIntent: content.chineseIntent, createdAt: now,
                revisions: { create: { id: randomUUID(), revisionNo: 1,
                  originalText: content.originalText, chineseIntent: content.chineseIntent,
                  inputSource: 'manual', chunks: Prisma.DbNull, createdAt: now } },
              }, select: { id: true } });
              response = CaptureResponseSchema.parse({ id: captureId, ...content, createdAt: now.toISOString() });
            } else {
              const rows = await tx.$queryRaw<{ id: string; captureId: string; revisionNo: number; createdAt: Date }[]>`
                INSERT INTO public.capture_revisions
                  (id, capture_id, revision_no, original_text, chinese_intent, input_source, chunks)
                SELECT ${randomUUID()}::uuid, ${captureId}::uuid, revision_no + 1,
                  ${content.originalText}, ${content.chineseIntent}, 'manual',
                  ${content.chunks === null ? null : JSON.stringify(content.chunks)}::jsonb
                FROM public.capture_revisions WHERE capture_id = ${captureId}::uuid
                ORDER BY revision_no DESC LIMIT 1
                ON CONFLICT (capture_id, revision_no) DO NOTHING
                RETURNING id, capture_id AS "captureId", revision_no AS "revisionNo", created_at AS "createdAt"`;
              if (!rows[0]) {
                const existing = await tx.captureRevision.count({ where: { captureId } });
                if (!existing) throw new StorageFailureError();
                return 'revision-conflict' as const;
              }
              response = RevisionResponseSchema.parse({ ...content, ...rows[0], createdAt: rows[0].createdAt.toISOString() });
            }
            await tx.captureWriteReceipt.create({ data: { userId: this.userId, action, operationId,
              captureId, fingerprint, statusCode: 201, location: target === null ? `/captures/${captureId}` : null,
              response: response as Prisma.InputJsonValue,
            } });
            return response;
          }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 2000, timeout: 5000 });
        } catch (error) {
          // Only known-aborted transactions can retry; unknown commit outcomes escape.
          if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2034' || attempt >= 2) throw error;
          await delay(25 * 2 ** attempt + Math.floor(Math.random() * 25));
        }
      }
    }));
    if (result === 'missing') throw new CaptureNotFoundError('Capture not found');
    if (result === 'operation-conflict') throw new OperationConflictError('Operation identity was already used for another request');
    if (result === 'revision-conflict') throw new RevisionConflictError();
    return result;
  }
}
```

</details>

创建需要在同一事务中插入captures及初始修订。追加沿用既有修订号唯一约束；同一键先等待同一操作，取得锁后读到第一人的结果，不再分配新版号。不同键表示不同编辑，仍可能竞争同一修订号；出现REVISION_CONFLICT应由用户重新查看编辑前提，不自动生成新键或把任意唯一冲突当成成功。

`CaptureCommands`通过构造函数接收database、state和userId。在 `src/captures.module.ts` 新增 `CaptureCommands` 和 `DEVELOPMENT_USER_ID` 导入（分别来自 `./capture-commands.js`、`./database-config.js`）；DatabaseService、ApplicationState沿用已有导入。在 `CapturesModule.providers` 增加下面的Provider，与Controller的构造注入配对；不要让页面传来的userId覆盖第三个参数：

```ts
{ provide: CaptureCommands,
  useFactory: (database: DatabaseService, state: ApplicationState) =>
    new CaptureCommands(database, state, DEVELOPMENT_USER_ID),
  inject: [DatabaseService, ApplicationState] },
```

在 `src/database.service.ts` 的onModuleInit中，将下列探针放在既有学习记录唯一约束检查之后、commandReceipt探针之前。StorageFailureError已从 `./database-errors.js` 导入；原catch中的日志、关闭连接和启动失败处理保留。

```ts
await this.client.captureWriteReceipt.findMany({ take: 1 });
const writeKeys = await this.client.$queryRaw<{ definition: string; condeferrable: boolean }[]>`
  SELECT pg_get_constraintdef(oid) AS definition, condeferrable
  FROM pg_constraint WHERE conrelid = 'public.capture_write_receipts'::regclass
    AND conname = 'capture_write_receipts_pkey' AND contype = 'p' AND convalidated
`;
if (writeKeys.length !== 1 || writeKeys[0]?.definition !== 'PRIMARY KEY (user_id, action, operation_id)'
  || writeKeys[0].condeferrable) throw new StorageFailureError();
```

这项启动检查验证读取与主键，并不代替真正的INSERT权限验收；新回执表为空时也要执行它。

新建素材仍使用嵌套写入，把父记录与初始修订交给同一个tx。追加在已确认归属后执行以下语句；读最大版号和尝试插入在一个SQL中完成，争号失败不插行：

```sql
INSERT INTO public.capture_revisions
  (id, capture_id, revision_no, original_text, chinese_intent, input_source, chunks)
SELECT $1::uuid, $2::uuid, revision_no + 1, $3, $4, 'manual', $5::jsonb
FROM public.capture_revisions WHERE capture_id = $2::uuid
ORDER BY revision_no DESC LIMIT 1
ON CONFLICT (capture_id, revision_no) DO NOTHING
RETURNING id, capture_id, revision_no, created_at;
```

这里的$1～$5依次是服务端生成的修订ID、已验证目标、原文、意图和chunks；配套用Prisma参数化模板传入，不拼接原文。如果没有返回行，再区别原素材根本没有初始修订（存储结构异常）与合法争号失败（REVISION_CONFLICT），不能把两者都说成正常重试。

公开结果先经过CaptureResponseSchema或RevisionResponseSchema，再保存：

```ts
await tx.captureWriteReceipt.create({ data: {
  userId: this.userId, action, operationId, captureId, fingerprint,
  statusCode: 201,
  location: target === null ? `/captures/${captureId}` : null,
  response: response as Prisma.InputJsonValue,
} });
return response;
```

外层 `state.track`覆盖事务完整Promise，关闭时等待在途工作；`database.run`保留安全错误分类。预期的missing、operation-conflict与revision-conflict先作为事务结果返回，再在数据库错误包装之外映射404/409，避免把业务冲突统一包成500。只有外层事务Promise完成，Controller才可返回201。

回执插入发生在业务之后，却仍使用同一个tx。故意令最后的回执INSERT失败，业务必须一起回滚。若改用根client保存回执，它可能借到另一连接，丢掉共同提交的保证。HTTP响应、普通日志和浏览器sessionStorage都不属于这个数据库事务，不能把它们的失败倒推成业务回滚。

不看完整实现，试着从三种入口各还原一遍 captureId 的来源。首次带键创建没有路径目标，也还没有回执，只有在这一分支才需要新分配一个素材标识。重放创建同样没有路径目标，却已经有回执，应取回执关联的素材标识，再确认当前仍可读取它。追加始终带路径目标，所以先用 URL 里的标识核对归属；如果也查到了这个键的旧回执，还要比较旧目标是否与本次目标一致。当编辑器停在 captureId 的赋值处，把 target 与 previous 两个局部变量同时展开，比只盯最后得到的随机标识更能说明自己走到了哪一条路。调试事务先读源码预测，实际停住后尽快继续，时间测量留给不带断点的运行。

重放创建时为什么还要再看素材？回执只说明当时服务有充分理由完成这件事。现在请求要得到保存的原文，仍要按这次的用户范围核实目标。源码用用户、素材两项条件读父行，并在事务内取得共享行锁。这个读与其他同类读取可以并存，却会牵制同时改变这行归属的更新，使“核对完就返回”这一段有一致的依据。若目标不再属于请求者，读不到匹配行，便到不了交还快照的分支。这里观察的是服务自己的判断次序；读者用两个正常的虚构账号各操作自己的素材，就能验证同名键不共享结果，不需要在页面里操作任何身份字段。

现在手算同键两次创建。两份请求都用甲账号、创建动作和键一，第一次进入事务后没有回执，选定素材标识甲，生成其第一版，建回执并提交。第二次若已经开始，却还在等同一把建议锁，等待结束后发出的是另一条查询，故能拿到第一份回执。它根据已有素材复核归属，校验快照并返回。再拿三类计数核对：一个父记录、一条第一版、一份创建回执。若调换顺序，在取锁前就查询并把“没有回执”缓存成一个布尔变量，事后即使排到了队首，也会拿过期判断去执行首次写入。锁只规定谁当前能走这一段，不能替先前做出的判断更新内容。

不同键的两个追加要另画一张纸。甲、乙都看到素材当前最大版号为一，各自打算插二。操作键不同，建议锁不会强制这两笔一个接一个读版号。若乙的插入语句在甲提交之后才开始，它读到最大版号二，可正常得到三；若两个语句都从同一旧版号出发，唯一约束只让一个二生效，另一个在所指定的冲突目标上不插入。也就是说，按顺序发两个不同键通常都成功，并不能证明真实重叠时也一定都成功。反过来，有一次出现争号冲突也不能据此断言所有并发追加都会失败。要重现这个区别，需要控制两边读到的基础版号，而非在两张 Postman 请求页上比较谁的鼠标点得快。

从空白写那条插入语句也可以从一个普通读取起步。先选定某个素材，列出它的全部 revision_no，按降序排列；加上只取一行才得到用于分配的那一版。在 SELECT 的输出里把这一列改成加一，手算从一得到二、从三得到四，再把新标识和已经验证过的文本填到同一行，最后才把这组输出接到 INSERT。为何不用一个无条件的最大值加一再替空值补零？任何能正常追加的素材按前章约定必须已有初始修订；如果连一行都选不到，应查结构异常，而不是让追加分支擅自创建第一版。当插入没有返回行时，还要区分源查询根本没有行，还是有来源却在争号时放弃了插入，源码后续检查修订数正是为这两条路径留的。

### 唯一约束冲突后，不能留在坏事务里继续查

建议锁是各参与者遵守的协调协议，主键是最后的存储防线。正确的同键请求先取同一把锁，后来的请求从正常事务中重读成功回执，通常不会靠主键异常来“认出”重试。若存在绕过操作锁的写入口，唯一约束仍会拒绝第二份身份，但当前事务已经失败。

不要在交互式事务的catch里继续 `findUnique`，试图把数据库异常变成成功；应让整个事务回滚，修复不遵守协议的入口。若确实设计为捕获唯一冲突后恢复，也必须先退出失败事务，再在新事务中重新检查身份、归属与完整指纹。不能把任何P2002都套进同一个恢复分支：冲突也可能来自修订号、业务关系或别的约束。

与第28、29章一样，内部自动重试只处理明确已中止的事务，不处理未知提交。操作锁等待有上限，超过预算返回存储不可用；客户端保留原键和原输入。事务回调可以执行多次，但同一成功操作只留下一个结果，这比承诺“代码只运行一次”准确。

### 用数据库与两条请求核对承诺

代码补齐后，在配套根目录执行以下命令。确认3000没有前章服务占用；本节使用正式API及VERIFY，浏览器夹具到30.4才启动。

```bash
nvm use
npm run check
unset DATABASE_URL
NODE_ENV=development PORT=3000 node --env-file=.env.database-verify --enable-source-maps dist/src/server.js
```

对于集合里的前九笔，可以在发请求之前先画出素材甲的修订清单。第一笔创建成功，纸上写第一版的原文与素材标识；第二笔原键创建只能在旁边补一个新请求编号，不添新行；第三笔换输入却保留键，产生冲突，也不添行。第四笔没有操作头，成功时会多出另一条素材，它自己的第一版不该出现在甲的清单里。因此发送第四笔时尤其要看集合的 captureId 是否还指第一笔的素材，不能习惯性把最近一次响应的 id 填回所有请求。若甲后来没有第二版而另一条素材有了第二版，先看第五笔实际用的路径，再判断是否是数据库丢行。

到第五笔，回执响应里的 revisionNo 应为二；记下它的 id 与 captureId，这两个 UUID 指代不同。第六笔使用另一操作键产生第三版；第七笔若仍按第一次追加的键和原参数重放，返回的应是刚才写在第二行的修订标识。第八笔详情读到第三版的原文，第九笔列历史能从同一素材找到各自对应的标识。读回这两条之后，可以不看屏幕回答一个反向问题：若第七笔错用了第三版的键却仍发送第二版的文本，正确结果应该是什么？同一身份收到不同内容应返回键冲突；若程序只按素材标识去读最新回执，就可能返回第三版，看起来格式正确，实际上悄悄接受了错误的提交。

出现服务就绪日志后，Postman集合baseUrl设为 `http://127.0.0.1:3000`。先按01～09检查顺序重放，再另存新键K，将创建请求复制为两个请求页，使用相同Body与K，紧接着发送；精确强制重叠由专用回归补充，不能仅凭手动点得快就断言两条事务已经重叠。

两条连接同时发送同键同参时，两边都201，ID、时间与Location相同；数据库只增加一条素材、一个初始修订和一份回执。只看两次201不能证明正确：无键路径同样会返回两次201，却产生两个ID。

然后改变K的原文，应该409 OPERATION_CONFLICT，不增加任何行。换新键K2、仍使用原来的文本，应创建另一个ID。对追加做相同对照，再用新键追加下一版，重放旧键，检查旧版号仍保持。

在DBeaver按本次操作定位，不把整个库的历史总量当作验收前提。将operation_id替换为自己保存的createKey；追加时同时把action改为append-revision/v1，并使用revisionKey：

```sql
SELECT action, operation_id, capture_id, status_code, location,
       response->>'id' AS result_id,
       response->>'revisionNo' AS revision_no
FROM public.capture_write_receipts
WHERE user_id = '10000000-0000-4000-8000-000000000001'
  AND action = 'create-capture/v1'
  AND operation_id = '30000000-0000-4000-8000-000000000001';
```

取该行capture_id填入下面的查询，核对业务与修订；重放第2版时，将返回修订ID与回执response中的id比较，再看同素材当前最大版号：

```sql
SELECT c.id AS capture_id, c.user_id, r.id AS revision_id,
       r.revision_no, r.original_text, r.chinese_intent
FROM public.captures c JOIN public.capture_revisions r ON r.capture_id = c.id
WHERE c.id = '30000000-0000-4000-8000-000000000010'
ORDER BY r.revision_no;
```

跨用户对照使用专用夹具：用户由启动进程时的LAB_USER_ID指定，绝不从业务请求体读取。甲与乙同键同参得到不同素材，乙访问甲的素材404；甲改过归属后也不能凭旧键绕过当前归属检查。夹具只用于本机虚构数据；真正的会话入口在第五篇复用同组断言。

要把这件事用 SQL 查清楚，可以先有意不写聚合。把回执行的 response 视为当时的交付结果，从中取出修订标识，再按修订表的主键去连接当前保存的那一版。在结果中保留回执目标和修订所属的素材，并同时显示快照版号与存储版号。筛选时一定带动作，创建回执也有 response.id，却指向父素材，不应拿它与修订主键比较。下面先按用户与追加操作键定位历史那一笔，再独立从其目标求当前最大版号。用户列限定为固定甲；把末尾唯一的全零占位符替换为产生第二版的操作键。

```sql
SELECT w.capture_id, v.capture_id AS revision_owner_capture,
       w.response ->> 'revisionNo' AS saved_number,
       v.revision_no AS actual_number,
       (SELECT max(newer.revision_no) FROM public.capture_revisions newer
        WHERE newer.capture_id = w.capture_id) AS current_number
FROM public.capture_write_receipts w
LEFT JOIN public.capture_revisions v ON v.id::text = (w.response ->> 'id')
WHERE w.user_id = '10000000-0000-4000-8000-000000000001'
  AND w.action = 'append-revision/v1'
  AND w.operation_id = '00000000-0000-0000-0000-000000000000';
```

在这个三版样本中，预期两个素材标识相同，三个版号顺次为二、二、三。第一列历史版号来自 JSON 文本，另外两个是数据库整数；显示相同可以人工核对，若要排序或算差值，应先确认类型并转换，否则文本排序会把十排到二之前。若历史侧出现一行而 actual_number 为空，已找到回执却没有连上那条修订，应先单查 response.id；若根本没有结果行，先查错库、错用户、错动作或错键。若三个数都为三，未必是代码出错，可能拿来查询的是第六笔的键。把键与第五笔保存的修订标识交叉核对，比直接删掉最新一版重新试更能区分原因。

### 让最后一次INSERT失败，再用原键恢复

保持本节正式VERIFY API运行，其他练习请求暂停。DBeaver确认 `SELECT current_database(), current_user;` 是独立副本，并结束前次未提交事务。给这轮故障单独生成一个小写UUID，保存为failKey；以下SQL中的 `30000000-0000-4000-8000-000000000099` 都要换成它。先查询确认此键还没有回执，不能用已经成功的键，否则请求直接重放，不会触发INSERT。

```sql
SELECT action, capture_id FROM public.capture_write_receipts
WHERE user_id = '10000000-0000-4000-8000-000000000001'
  AND operation_id = '30000000-0000-4000-8000-000000000099';

BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.capture_write_receipts
  ADD CONSTRAINT ch30_reject_one_write
  CHECK (user_id <> '10000000-0000-4000-8000-000000000001'::uuid
    OR operation_id <> '30000000-0000-4000-8000-000000000099'::uuid) NOT VALID;
COMMIT;
```

NOT VALID只略过已有行检查，新INSERT仍受约束。约束限定用户与本轮键，创建和追加两个动作都拒绝。DBeaver记下甲的素材数、修订数及一个已有素材的修订清单，下面这条查询只在其他写入已暂停的故障对照中比较前后，不要求基线为零：

```sql
SELECT
  (SELECT count(*) FROM public.captures
   WHERE user_id = '10000000-0000-4000-8000-000000000001') AS captures,
  (SELECT count(*) FROM public.capture_revisions r JOIN public.captures c ON c.id = r.capture_id
   WHERE c.user_id = '10000000-0000-4000-8000-000000000001') AS revisions;
```

在Postman复制01，Idempotency-Key改为failKey，Body用 `{"originalText":"Rollback this practice write.","chineseIntent":null}`，保存而不再修改。发送应500；素材、修订数都不增加，本轮回执仍为零。再复制05，目标设为刚记录的已有素材、键仍为failKey、Body用 `{"originalText":"Rollback this revision.","chineseIntent":null}`。发送也应500，原修订清单与数量保持，回执仍为零。两个动作的身份独立，故可在这次受控实验中使用同一字符串；平时分别生成更便于追踪。

前面的业务INSERT执行过，末步失败仍不留下行，才说明业务与回执共同回滚。只看到500不够；若数据变了，先检查是否把回执写到了根client，不要删数据掩盖问题。

先在 DBeaver 单独执行下方移除约束的事务，看到提交完成，再重发刚保存的两条请求。各自保持原路径、键与正文。创建应201、增加一素材和初始修订；追加应201、原素材增加一版；本轮按键查询得到两个不同action的回执。再次重发，各自返回第一次成功结果，数量不再增加。

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
ALTER TABLE public.capture_write_receipts DROP CONSTRAINT ch30_reject_one_write;
COMMIT;
```

若在加约束、失败观察或移除期间中断，先结束DBeaver未完成事务，再检查下面的结果；有约束就从失败观察或移除继续，无约束且已有回执就核对并重放，不重新加约束冒充首次写入。DDL若超时，先ROLLBACK并处理持锁原因，再重做该块。

```sql
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.capture_write_receipts'::regclass
  AND conname = 'ch30_reject_one_write';
```

清理只移除自己的实验约束，不删除成功回执。实验结束确认查询返回零行，再继续浏览器练习。

## 30.4 浏览器要保存的是待确认的提交

### 写入待办成功以后，才允许发送

只在内存变量里保存UUID经不起刷新。页面需要先保存这次操作的主人、动作入口、键和业务输入，再发请求。本章使用当前源、当前页签的sessionStorage：刷新后仍可读取，关闭页签不作为持久离线队列；相同源的新页签也不是共享的全局待办。完整页面在 `examples/write-retry/`，不需要新增前端框架。

```js
const pending = {
  owner: confirmedIdentity,
  operationId: crypto.randomUUID(),
  path: '/captures',
  body: JSON.stringify({ originalText, chineseIntent: null }),
};
sessionStorage.setItem('epp.pending-write.v1', JSON.stringify(pending));
// setItem成功后，才用pending中的固定内容发送。
```

存储可能被禁用、超过配额或抛异常。此时页面停在未发送状态，不能先发出去再弹一句“保存失败”。若网络报错、返回无法识别的成功正文，或请求被取消，仍保留待确认项；“取消等待”不证明服务没有提交。再次点击“继续上次提交”读取保存的原始输入，不使用用户刚在编辑框改过的内容。

页面只允许一条待确认操作，避免首次练习就引入队列调度。存在待办时先解决它，再开始新操作；明确清除只删除本地恢复依据，不能撤销已经发出的业务。成功验证返回结果后才清理，用户再次主动提交使用新键。API层同键冲突是最后防线，前端禁用按钮只是帮助用户表达意图。

沿一次点击的执行顺序看看哪一个等待最容易被忽略。点击进入 submit 时，如果等到身份查询回来才设置忙碌状态，那么在这个等待期间第二次点击也会通过入口检查，两次都能开始生成操作键。数据库会非常认真地把它们当作两笔不同的合法创建，回执机制没有机会替界面合并。配套先同步切到 checking，再等待身份确认；第二次调用看到当前阶段不接受新提交，就在分配键以前结束。一旦待办已有值，新的 submit 也不会拿当前编辑框覆盖它。按钮变灰便于使用者理解状态，而模型自己的入口检查则使这个约定不依赖界面重绘是否已经完成。

时间线继续往前。保存操作键与保存正文是同一份 sessionStorage 记录里的字段，如果分别写在两个条目里，中途页面刷新，下一次可能读到新键搭配旧文本。这里把主人、键、路径和序列化后的正文写成一条记录，setItem 顺利返回才调用发送。存储写失败时即使内存里刚刚生成了一个漂亮的 UUID，也没有可跨刷新恢复的依据。这时允许用户处理存储问题后重新开始，因为本轮发写请求的步骤还没发生。要是在网络请求已经发出之后才发现无法写待办，表面上也是“本地保存失败”，可服务已经可能创建了素材，两种失败的下一步就完全不同。

打开 Chrome 开发者工具，Network 留意请求方法，Application 里选本页源的 Session Storage。后面实际跑代理时，只查看本轮虚构输入，不需要手工修改存储。提交后看到身份读取并不等于已经发送写请求，只有对应的 POST 才可能改变业务。响应断开后看存储那一行，正文里的引号在外层 JSON 里会被转义；这是把请求正文作为字符串保留下来的结果，不代表服务原文里突然多了反斜线。恢复时发送函数将 record.body 直接作为请求正文。如果再把这串文本当普通表单对象多序列化一次，服务将读到一个字符串而非创建对象，合法文本也无法通过外层校验。

再把两个观察窗口并排想一遍。页面是待确认、存储有键，表示有一笔可以尝试恢复的提交，不表示数据库一定已经提交；Network 有二百零一的状态行，不等于成功对象已经读完；数据库有一份回执，不等于页面已经按它更新显示。代理练习恰好能制造三者不同步的短暂阶段。查看时依次记录服务端落下的素材标识、页签留存的键，以及浏览器是否有足够完整的 JSON 解析成公开对象。只有前后属于同一个待办，而且当前主体仍匹配，页面才有依据移除待办。若只是为了让红色提示消失就点“清除”，你放弃的是本页定位原决定的材料，数据库里已提交的历史不会随按钮一起删除。

### 刷新后，先认主人，再显示内容

页面启动先读取服务端当前身份，成功确认后才取出和展示属于它的待办。网络不可用时，不能用旧identity缓存冒充当前登录者；应隐藏待办正文并等待恢复。当前身份与保存主人不同，清除旧待办与编辑内容，禁止发送。请求返回后还要确认页面仍处于原身份代次，否则甲的迟到响应可能出现在乙的页面里。

```mermaid
flowchart TD
  A[打开或刷新页面] --> B[从服务端确认当前身份]
  B -->|无法确认| C[隐藏私人内容，不发送]
  B --> D{待办主人一致}
  D -->|否| E[清理旧待办与编辑内容]
  D -->|是| F[允许手动继续原键原参]
  F --> G{得到可验证的成功结果}
  G -->|是且身份未改变| H[显示原结果并清理待办]
  G -->|网络失败或结果不明| I[保留待确认]
```

主人不是权限凭证。前端比较只能避免拿错本地草稿，后端仍从真实身份限定用户和资源；恶意脚本可以修改sessionStorage，不能因此取得别人的数据。业务正文不能设置userId，旧回执也不能绕过已经撤销的访问资格。

sessionStorage含原文，是私人数据副本。不要把会话Cookie、密码或CSRF Token存进去，不把待办整体写到控制台。页面使用textContent呈现原文与结果，不把用户输入拼到innerHTML。恢复协议也不替代XSS防护；同源恶意脚本仍可能读取本地存储。

### 把恢复规则落实为一个状态机

下面的 `examples/write-retry/pending.mjs` 不依赖DOM。storage负责本页签存储，identify读取服务端身份，send发送已保存的记录，changed通知界面重绘。owner是 `[userId, sessionId]` 的JSON字符串；当前固定身份使用fixed-lab占位，真实会话篇再使用实际sessionId。body在第一次提交时序列化成字符串，重试直接发送该字符串，不重新读取编辑框。

epoch只表示本页内的身份代次。初始化、清理身份或放弃本地待办会增加它；每次异步操作记住开始时的epoch，返回时若不一致便丢弃迟到结果。它不是修订号、操作键或登录凭据。发送前重新确认身份防止恢复旧主体待办，发送后再次确认防止结果显示给已切换的主体；Cookie切换与实际POST的绑定由后面会话篇的服务端检查承担。

<details>
<summary>展开完整 pending.mjs：保存、恢复、身份确认与成功验证</summary>

```js
// No DOM or network globals: the same state transitions run in the page and tests.
export const STORAGE_KEY = 'epp.pending-write.v1';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function validPath(path) {
  return path === '/captures' || /^\/captures\/[0-9a-f-]{36}\/revisions$/.test(path);
}
export class PendingWrite {
  constructor({ storage, identify, send, uuid, changed = () => {} }) {
    Object.assign(this, { storage, identify, send, uuid, changed });
    this.epoch = 0;
    this.state = { owner: null, pending: null, result: null, phase: 'checking' };
  }
  update(patch) { Object.assign(this.state, patch); this.changed(this.state); }
  remove() { this.storage.removeItem(STORAGE_KEY); }
  clearIdentity() {
    this.epoch++;
    this.controller?.abort();
    // Even if storage throws, forget all visible content and suppress late callbacks.
    this.update({ owner: null, pending: null, result: null, phase: 'signed-out' });
    try { this.remove(); return true; }
    catch { this.update({ phase: 'storage-error' }); return false; }
  }
  async checkIdentity(epoch) {
    const identity = await this.identify();
    if (epoch !== this.epoch) return false;
    if (!identity || typeof identity.userId !== 'string' || !identity.userId) {
      this.clearIdentity(); return false;
    }
    const owner = JSON.stringify([identity.userId, identity.sessionId ?? 'fixed-lab']);
    if (this.state.owner && this.state.owner !== owner) {
      if (this.clearIdentity()) this.update({ owner, phase: 'identity-changed' });
      return false;
    }
    this.update({ owner }); return true;
  }
  async verifyIdentity() {
    if (!this.state.owner || this.state.phase === 'unavailable') {
      await this.initialize();
      return ['ready', 'pending'].includes(this.state.phase);
    }
    const epoch = this.epoch;
    try {
      const matched = await this.checkIdentity(epoch);
      return matched || (this.epoch === epoch + 1 && this.state.phase === 'identity-changed');
    } catch { return false; }
  }
  async initialize() {
    const epoch = ++this.epoch;
    this.update({ owner: null, pending: null, result: null, phase: 'checking' });
    try {
      if (!await this.checkIdentity(epoch)) return;
      const raw = this.storage.getItem(STORAGE_KEY);
      let record = null;
      try { record = raw ? JSON.parse(raw) : null; } catch { this.remove(); }
      if (record && (record.owner !== this.state.owner || !uuidPattern.test(record.operationId)
        || !validPath(record.path) || typeof record.body !== 'string')) {
        this.remove(); record = null;
      }
      this.update({ pending: record, phase: record ? 'pending' : 'ready' });
    } catch { if (epoch === this.epoch) this.update({ phase: 'unavailable' }); }
  }
  async submit(path, body) {
    if (this.state.pending || !this.state.owner
      || !['ready', 'success', 'identity-changed', 'storage-error'].includes(this.state.phase)) return;
    if (!validPath(path)) throw Error('Unsupported write path');
    // Lock before awaiting identity, so a double click cannot allocate two intents.
    this.update({ result: null, phase: 'checking' });
    const epoch = this.epoch;
    try { if (!await this.checkIdentity(epoch)) return; }
    catch { if (epoch === this.epoch) this.update({ phase: 'unavailable' }); return; }
    const record = { owner: this.state.owner, operationId: this.uuid(), path, body: JSON.stringify(body) };
    try { this.storage.setItem(STORAGE_KEY, JSON.stringify(record)); }
    catch { this.update({ phase: 'storage-error' }); return; }
    this.update({ pending: record });
    await this.dispatch(record, epoch);
  }
  async retry() {
    if (!this.state.pending || ['sending', 'checking'].includes(this.state.phase)) return;
    const epoch = this.epoch;
    this.update({ result: null, phase: 'checking' });
    try { if (!await this.checkIdentity(epoch)) return; }
    catch { if (epoch === this.epoch) this.update({ phase: 'unavailable' }); return; }
    await this.dispatch(this.state.pending, epoch);
  }
  async dispatch(record, epoch) {
    this.update({ phase: 'sending' });
    const controller = new AbortController();
    this.controller = controller;
    try {
      const result = await this.send(record, { signal: controller.signal, isCurrent: () => epoch === this.epoch });
      if (epoch !== this.epoch) return;
      // Another tab may have logged out while this request was in flight.
      if (!await this.checkIdentity(epoch)) return;
      this.remove();
      this.update({ pending: null, result, phase: 'success' });
    } catch (error) {
      if (epoch !== this.epoch) return;
      if (error.status === 401) { this.clearIdentity(); return; }
      // A session mismatch can be reported as 403. Do not leave A's draft
      // visible after the trusted identity endpoint confirms B. Offline checks
      // preserve the original operation so connectivity loss is still recoverable.
      try { if (!await this.checkIdentity(epoch)) return; } catch { /* outcome remains unknown */ }
      if (epoch === this.epoch) this.update({ phase: 'uncertain' });
    }
  }
  clearPending() {
    this.epoch++;
    this.controller?.abort();
    this.update({ pending: null, result: null, phase: this.state.owner ? 'ready' : 'signed-out' });
    try { this.remove(); } catch { this.update({ owner: null, phase: 'storage-error' }); }
  }
}

// The session expectation comes from the persisted operation, never from a new
// /me or /csrf result. The server still authenticates the actual cookie and must
// reject a mismatch before executing the command (the header is not a credential).
export async function writeHeaders(owner, { sessionMode, csrfMode, request }) {
  const headers = { 'Content-Type': 'application/json' };
  if (sessionMode) {
    const [, sessionId] = JSON.parse(owner);
    if (typeof sessionId !== 'string' || !sessionId || sessionId === 'fixed-lab') throw Error('Missing session identity');
    headers['X-Expected-Session'] = sessionId;
  }
  if (csrfMode) {
    headers['X-EPP-Request'] = '1';
    const { csrfToken } = await request('/auth/csrf');
    if (typeof csrfToken !== 'string' || !csrfToken) throw Error('Invalid CSRF response');
    headers['X-CSRF-Token'] = csrfToken;
  }
  return headers;
}
function storedText(value, maxLength) {
  return typeof value === 'string' && value.length <= maxLength && /\S/.test(value)
    && !value.includes('\0') && value.isWellFormed();
}
function validSuccess(value, path) {
  if (!value || !uuidPattern.test(value.id) || !storedText(value.originalText, 2000)
    || !(value.chineseIntent === null || storedText(value.chineseIntent, 2000))
    || typeof value.createdAt !== 'string'
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value.createdAt)
    || !Number.isFinite(Date.parse(value.createdAt))) return false;
  if (path === '/captures') return true;
  return value.captureId === path.split('/')[2]
    && Number.isInteger(value.revisionNo) && value.revisionNo > 0 && value.revisionNo <= 2147483647
    && ['manual', 'unknown'].includes(value.inputSource)
    && (value.chunks === null || (Array.isArray(value.chunks) && value.chunks.length <= 25
      && value.chunks.every(chunk => chunk && storedText(chunk.text, 200))));
}
export async function sendPendingWrite(record, { request, sessionMode, csrfMode, signal, isCurrent }) {
  const headers = await writeHeaders(record.owner, { sessionMode, csrfMode, request });
  headers['Idempotency-Key'] = record.operationId;
  if (!isCurrent()) throw Error('Local identity cleared');
  const result = await request(record.path, { method: 'POST', headers, body: record.body, signal, expectedStatus: 201 });
  if (!validSuccess(result, record.path)) throw Error('Invalid success response');
  return result;
}

export async function loginSession(model, { userId, password, sessionMode, csrfMode, request }) {
  if (!sessionMode) throw Error('Login is unavailable in fixed-identity practice');
  // Clear before issuing login, including the callbacks of an earlier write.
  if (!model.clearIdentity()) throw Error('Cannot clear the previous operation');
  const headers = { 'Content-Type': 'application/json' };
  if (csrfMode) headers['X-EPP-Request'] = '1';
  // Login has no existing session to bind and requires no CSRF token. The
  // browser supplies Origin and handles HttpOnly Set-Cookie without JS access.
  await request('/auth/login', { method: 'POST', headers, expectedStatus: 200,
    body: JSON.stringify({ userId, password, label: 'Write retry practice' }) });
  await model.initialize();
}
```

</details>

从第29章自行实现时，按以上内容新建pending.mjs；页面外壳 `index.html`、DOM与fetch接线 `page.mjs`、固定身份夹具 `api-fixture.mjs`、同源故障代理 `server.mjs` 直接从[本章配套页面目录](https://github.com/SamChowRock/epp-public/tree/part-04/chapter-30/examples/write-retry)取得，保留在同一个examples/write-retry目录，不复制进src。它们是本章的练习工具，不要求读者另造一套UI。page.mjs通过changed更新按钮与textContent，页面回到前台先隐藏内容、确认身份后才显示；request检查HTTP状态并解析JSON。完整状态机保留供后续真实会话使用的writeHeaders和loginSession，本章不启用sessionMode或csrfMode。

| 入口 | 本章职责 | 使用边界 |
| --- | --- | --- |
| 正式API | Controller接收可选键，验证输入并调用带键或无键服务 | 兼容性、完整路由与产物重启验收 |
| api-fixture.mjs | 服务端固定甲/乙，调用同一个CaptureCommands | 仅虚构用户及所需读取；缺键400，不支持PATCH和候选 |
| server.mjs | 提供同源页面并转发到固定回环端口，按键截断首次201 | 保持运行才保留本轮“已经丢过”的集合 |
| pending.mjs / page.mjs | 保存待办、核对主人、原样恢复及显示结果 | 无法改变服务端认证或撤销已提交业务 |

### 在已提交以后丢掉响应，再刷新同一页签

使用同源练习代理加载页面；它只将请求转到明确配置的本机API，不接受客户端传入任意目标。默认不丢响应，开启故障模式后，先消费完整上游201，再让下游收到201响应头和未完成的JSON正文，随后中断连接。这样才确定本次实验是“已经提交、响应丢失”，而不是在请求送达之前就关网。只在发送任何响应字节前关连接，浏览器可能透明重试，页面直接显示成功；这不证明故障未发生。原键能防住透明重试，而传到一半的正文让这轮人工恢复更容易稳定观察。

```bash
# 先在DBeaver的VERIFY副本准备两个虚构用户；甲已存在则保持。
# INSERT INTO public.users(id) VALUES
# ('10000000-0000-4000-8000-000000000001'),
# ('10000000-0000-4000-8000-000000000002') ON CONFLICT (id) DO NOTHING;

# 第一终端：先在原正式API终端按Ctrl+C，等退出并释放3000。
# 完成npm run check后，以VERIFY配置启动甲的固定身份夹具。
unset DATABASE_URL
NODE_ENV=development API_PORT=3000 \
LAB_USER_ID=10000000-0000-4000-8000-000000000001 \
node --env-file=.env.database-verify examples/write-retry/api-fixture.mjs

# 第二终端：保持此代理运行，再在Chrome打开 http://127.0.0.1:3030。
PORT=3030 TARGET_PORT=3000 DROP_SUCCESS_ONCE=true \
node examples/write-retry/server.mjs
```

![响应正文中断后仍保留原操作键和原参数](images/browser-pending.jpg)

图中编辑框与新提交按钮被禁用，原操作键和输入仍在下方。这个界面表示结果未知；数据库里已经存在同键回执，不能据它判断业务未执行。

页面提交后显示待确认。此时先在DBeaver查本次操作键，确认业务和回执都在，再刷新页面。页面重新获取当前身份后，“继续上次提交”应仍可用；发送后取得原ID，数据库没有增加第二份素材。页面核对201和JSON形状；Location另外在Postman的Headers和数据库回执中逐值核对，不把页面成功提示当作完整HTTP契约验证。

![刷新后继续原键，取回同一素材ID](images/browser-recovered.jpg)

恢复得到的ID与首次落库的 `df415c9f-…` 相同；上方待办已清除，重新点击提交将是另一件事。

接着在页面操作下拉框选“追加修订”，目标ID填刚创建的素材ID，原文填另一段虚构文本，再提交并保留待确认。不要清除待办，也不要重启代理。在Postman复制集合06，请求直连 `http://127.0.0.1:3000/captures/刚才的素材ID/revisions`，生成另一个新键，Body换为第三版文本与chineseIntent:null，发送并确认201、revisionNo=3。此请求绕过故障代理，页面中的原键不变。然后刷新原页签、继续上次提交，应恢复第2版；DBeaver按该素材ID查询历史，应同时看到第2、3版。若这不是一个只有初始修订的新素材，则按自己的基线版号比较，不强求数字为2和3。

![已经存在第3版时，旧操作仍返回第2版](images/browser-old-revision.jpg)

这轮先让页面追加第2版并丢响应，再由另一请求成功追加第3版，最后刷新、继续旧操作。结果中的revisionNo仍是2，数据库最大版号为3；二者各自符合历史回执与当前数据的语义。

再准备一条甲的待办，保留同一页面源与页签。在第一终端Ctrl+C停止甲的固定身份夹具并等待退出，第二终端代理保持运行。在同一配套根目录按相同端口、同一VERIFY启动乙：

```bash
unset DATABASE_URL
NODE_ENV=development API_PORT=3000 \
LAB_USER_ID=10000000-0000-4000-8000-000000000002 \
node --env-file=.env.database-verify examples/write-retry/api-fixture.mjs
```

看到夹具就绪后刷新原页面。待办不能显示甲的原文，也不能自动提交；Chrome Network中应只有身份确认及用户主动发出的请求，不应出现甲的旧POST。在Postman向 `http://127.0.0.1:3000/captures` 发送GET读取乙的列表，它也不应增加甲的内容；不要在页面里寻找不存在的列表控件。改变端口会改变源并得到另一份存储，不能用这种方式伪装成“同页签切换身份已验证”。

![同源同页签切换主体后，原输入与继续按钮已清空](images/browser-identity-changed.jpg)

图中原文为空、继续按钮禁用。单张空页面不能证明没有重发，还要对照乙的列表和数据库：甲的旧键仍只属于甲，乙没有对应新行。这里是在相同源与页签内改变服务器固定主体，未新开另一个端口逃开原存储。

固定身份夹具不是退出登录。它让我们在身份篇之前改变服务端主体，检查恢复协议对主体变化的反应；夹具不提供密码、Cookie或权限结论。第五篇用真实登录、退出、CSRF与资格检查完成同一组对照。

把身份变化按最不利于界面的顺序走一遍。甲的页面开始恢复，先发身份读取；这段等待期间用户已经切换了页面上下文并清除了旧待办。第一次读取晚到，即使返回的主人确实是甲，也不能把甲的文字重新画回屏幕。模型给一轮工作记下发起时的 epoch，清理身份时递增，晚到的回调先比较代次再决定能否继续。它解决的是“同一页中，哪个异步回调还有资格更新当前界面”。数据库里的操作键则从第一次提交起一直稳定，解决“这几次发送是否在问同一个已保存的决定”。若把代次拿来生成每次恢复的新键，页面切换虽然看似有序，数据库却会把恢复当新提交。

这里有两个容易在代码审查中混为一处的等待。发送前等待身份，决定可否用原主人的记录发请求；收到可用结果后再次等待身份，决定可否把它交给眼前的使用者。在第二次等待期间仍要保留待办。假设业务已经成功，页面下一步查询身份时遇到暂时断线；这次没能确认主人，不能因手上已经有结果对象就立即清除恢复依据。等恢复连接，仍可凭原键取回同一个结果。如果身份查询明确表明主体已换，则应清除旧主人在本页可见的输入，不再重放。这两条路径看起来都暂时没有成功页面，只有前一种保留了恢复旧决定的可能。

前台切换还有一个纯显示层的时序。用户离开页签时先隐藏表单、待办与结果；回来时向身份入口核对，在回答之前保持隐藏。否则即使稍后核对发现已换主人并清理，旧文也可能先显示一帧。相反，同一主人只是切出去查词，已有请求仍在等待，返回时确认主人未变就应让原工作继续，没有理由把每次 focus 都解释成一次退出。实际看 Network，切回页签可能产生身份读取；这个读取本身既没有创建素材也没有追加版号。想证明没有自动提交，应过滤出 POST 的方法和对应业务路径，不要把“又发了一次请求”和“又写了一次数据库”混为一件事。

还可以从成功正文的校验推一个正常输入的边界。正式服务的原文与意图按 UTF-16 代码单元计长，页面校验这两个字段也按字符串 length 检查。但修订的分块文本在配套服务的 ChunkSchema 用 Zod 的 max，而页面的 storedText 用字符串 length。固定版本中，一百零一个笑脸在前者占一百零一个码点，在后者占二百零二个代码单元，超过页面对分块的二百上限。因此若将来给此页面接入带这种分块的提交，服务可以接受这份修订，页面仍可能把返回结果判为不可确认。用同一键再发会读到同一结果，不能靠不断重试修复两个读取规则的差异。本章表单只发原文和意图，配套界面没有分块编辑控件；这个差别要在扩展输入控件或复用成功校验函数时处理，不必为了当前演练改动已保存的数据。

最后回到本轮固定身份切换。确认乙能正常读自己的列表后，如果还想证明甲的那笔没有因清理页签而撤销，可以在 DBeaver 用甲的用户标识、动作与保存的操作键查询；能查到原素材，并且在乙的范围内没有对应写入。只有列表行数相同还不够：两个用户可能本来就各有一行。用用户和操作键筛明细，再把素材标识与先前记下的一对值相配，便能分别解释“页面不再显示”“甲的数据仍存在”“乙没有替甲新增”。这一组观察只依赖合成账号正常使用自己的入口，不要求读者借用真实账号，也不借页面能否恢复来推断认证已经建好。

### 从固定身份接到会话，不换掉恢复协议

第38章之后，页面以 `/auth/me` 确认当前userId和sessionId；同一用户重新登录也可能是新会话，旧待办按当前页面策略清除，不能靠“还是同一账号”忽略一次明确退出。退出先清理编辑内容和本地待办，再发服务端撤销请求；撤销失败要明确显示仍需确认，不能谎称Cookie已失效。

第40章加入CSRF后，每次需要时取得当前会话Token，附在写请求头；操作键仍保留，Token不能从旧待办恢复。页面与API同源，APP_ORIGIN配置为页面实际源，代理保留Cookie和Origin；同源不意味着可以跳过CSRF、来源或权限检查。旧会话已失效时应401，资格撤销应403，而不是为了拿回历史响应暂时绕过认证。

另一页签可能在本页确认身份与实际发送之间改变共享Cookie。仅在浏览器先GET一次身份不足以把下一次POST绑定到那个身份；真实会话章节使用 `X-Expected-Session` 携带待办原主人的sessionId，在写入边界比较它与Cookie解析出的实际sessionId；不一致便拒绝，不能接受页面指定的sessionId作为登录凭据。否则旧主体的原文可能被作为新主体的一次合法创建写入。这个检查独立于幂等表中的用户范围：后者能隔离回执，不能猜出浏览器正文原本属于谁。

## 30.5 旧客户端、旧结果与交付怎样同时成立

无键请求继续按旧契约工作，不会因为缺键被拒，也不会由服务端临时生成一个客户端不知道的键。旧客户端断线后仍只能查询已有素材、历史和自身保存的结果；找不到结果不等于首次未提交，相同文本也不能证明就是那次操作。它缺少的是可靠的操作对应关系，升级客户端之前不能许诺安全自动重发。

带键请求则必须一路保留字段。在 `src/openapi.ts` 的createOpenApiDocument内，document定义之前增加以下参数，ParameterObject沿用已有类型导入：

```ts
const idempotencyKey: ParameterObject = { name: 'Idempotency-Key', in: 'header', required: false,
  schema: { type: 'string', pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' },
  description: 'Save one lowercase UUID before sending. Reuse it only with the original parsed input and target. Scoped to current user and action; no automatic expiry. Matching success replays the original 201; changed input returns 409 OPERATION_CONFLICT. Missing header keeps legacy behavior.' };
```

在 `/captures` 的post对象增加 `parameters: [idempotencyKey]`；在 `/captures/{id}/revisions` 的post对象将parameters改为 `[idempotencyKey, 原有id路径参数]`，保留原路径参数对象。两处201说明覆盖首次与重放，400补非法键，409分别写明OPERATION_CONFLICT和原有REVISION_CONFLICT；503说明带键请求保留原键原参，未带键不能据未知结果自动重发。创建的Location仍保留在201响应headers中。重新构建后打开Swagger核对这两个POST，确认键是可选头，不能只修改说明文字而遗漏parameters。

网关丢弃这个头会让新请求退回旧语义，因此发布时实际从使用端经过入口核对，而不是只测服务函数。成功响应仍受原公开Schema约束，不能顺手把用户ID或内部回执暴露给旧客户端。

先结束浏览器故障练习：在两个终端分别Ctrl+C停止夹具与代理，等两者退出。此时3000不再由乙的夹具提供服务。回配套根目录，用正式API重新接VERIFY：

```bash
nvm use
npm run check
unset DATABASE_URL
NODE_ENV=development PORT=3000 node --env-file=.env.database-verify --enable-source-maps dist/src/server.js
```

Postman恢复baseUrl为 `http://127.0.0.1:3000`。正式API在本章仍是固定开发用户甲；不要把夹具返回的FIXTURE_REQUIRES_KEY当成正式无键兼容失败。先发集合04两次，均应201但ID不同；再验收PATCH、候选以及前章原采纳重放。

自动回归在另一个终端运行 `npm test`，它从 `.env.test` 的显式TEST_DATABASE_URL选择已迁移的独立测试库；不把当前API环境或日常DEV当作测试配置。回归脚本含约束与竞争故障，测试期间暂停该库其他写入口。完成后按前章方式交付dist及锁定依赖到独立目录，提供运行环境配置；停妥本节正式API后再启动产物，避免端口混用。用已经成功的创建键和追加键，在产物停止、重新启动之后重放；原ID、时间、版号与Location保持。浏览器待办和数据库回执分别经得起页面刷新和进程重启，才说明恢复依据不只停在某个内存对象里。

最后保留第29章原采纳键再发一次，结果不变；无键创建、PATCH意图和候选接口继续按各自契约工作。第31章从本章继续整合表达身份，创建与追加的恢复能力不应在切分支后消失。后续受限运行身份必须对新表拥有读回执与插入成功结果的列权限；漏授权会导致整个事务回滚，不能通过暂时改成无键请求绕过去。

如果你现在接手的是一个已上线的前端，升级顺序可以从一次具体保存推出。旧页面只会发正文，新页面会在保存待办后带操作键。先让服务认识可选请求头，旧页面照常可用；再让新页面发送键，才可能得到可重放的写入。若反过来先发布新页面，在旧服务仍处理流量的这段时间里，页面可能看到普通的创建成功，也可能在响应丢失后反复用键发送。旧服务并没有登记那个键的义务，事后升级服务也无法补出确切的对应关系。两边都返回二百零一，单看接口成功率看不出这段兼容差异。能否给用户呈现“继续上次提交”，取决于实际处理请求的入口是否兑现该契约。

可以从空白的交接单推导最少应保留哪些值。先记服务入口和本次数据目标；针对创建，记用户、键、原参数、创建标识、创建时间和 Location；针对追加，还要记路径中的素材标识、结果里的修订标识与版号。原请求存进自己的 Postman 集合就已经保留了参数，不必把原文全文打印进日志。然后注明哪一笔后来有了更新的版本，哪一笔是无键对照。如果只交给接手者“两个请求都返回过二百零一”，他既无法构造同一键的输入，也无法说明重启以后出现的新标识究竟来自哪里。保留原操作材料，才能在不同运行制品之间比较同一件事。

对产物做这项验收时，先在开发服务上取得一组真正的成功结果，并在同一数据库的只读窗口看见对应回执。停止开发服务，再从独立交付目录启动产物，等到就绪，确认请求确实打到新进程。先用已保存的创建参数和键重放，再用已保存的追加参数和键重放，记录从网络读回的值；不要为“准备数据”重新运行会生成新素材或下一版的请求。若误连一个结构齐全但没有原数据的空库，创建的重试可能作为首次请求成功，产生一个新的素材标识；追加到旧目标则可能报告找不到。两个现象组合起来，首先指向数据目标或恢复点不同，不能仅据一次成功就判定产物接手了原来的历史。

还有一种比错库更隐蔽的交付错误。开发页发出键，浏览器工具看得到，后端入口接收时该头却已经缺失。本章为兼容旧客户端会正常完成这次创建，因此页面一次操作从头到尾都可能是绿色。要判断从使用端到服务的整段路径，先保留写前的范围与键，写后查看是否有**这个用户、这个动作、这个键**的回执；再原样重放并比较标识。如果没有回执而素材确实多了一条，在确认地址与数据库相符后，检查入口转发和控制器接线。反过来，直接调用 CaptureCommands 的测试即使通过，也没有走过任何 HTTP 请求头，不能替这段交付检查作证。遇到这样的结果先停在本地练习样本，别拿真实业务反复创建来确认现象。

恢复以后，页面团队也要知道怎样结束一笔旧操作。已有完整成功结果并完成主人核对，下一次明确点击新建才能生成另一键；如果只是取消等待、关掉结果面板或暂时断线，应先判断待办还在不在。无键的旧客户端没有那份恢复依据，即便它在列表里搜到一条逐字相同的原文，也可能是此前另一份主动记录。可以让用户通过已有资料人工确认，但不能在后台偷偷把某条相似结果绑成这次请求的成功回执。把这个限制交代给使用方，下一次有人提出“给所有失败保存加自动重发”，就有办法问清楚：失败发生在什么位置，原键是否存在，后端能否给出过去的决定，还是只能查询现在的素材。

本章分别改变了三个条件：相同文本换新键、旧键对应对象已经有新版、页面恢复时主体已经变化。由此可区分新意图与重试、过去结果与现在状态、恢复便利与访问权限。更换数据库、前端框架或客户端都不会免除这些判断。

离开 VERIFY 之前再看一次版号和操作键的关系。如果两位编辑者各持新键提交，各自都代表独立意图；其中一位收到版本冲突，首先需要重新看当前原文和修订历史，判断自己的改动还有没有意义。若内容要随之改变，应明确开始一次新的编辑决定；若只是想找回已经提交的旧版本，才应继续用原键原参请求旧结果。操作键不会替用户判断文本是否陈旧，也不会阻止两个独立的有效编辑。下一章继续整合表达身份时，同样要先说清相等的是一次操作、一份业务对象，还是两段恰好相同的文本。

## 本章知识支线

- [支线 30A：服务已保存，客户端为什么还在等待确认](side-01-unconfirmed-success.md)。用一条合法修订对照 POST 的原键重放、PATCH 的历史读回，以及客户端怎样校验已经提交的结果。阅读约 20～25 分钟，跟做另加 25～35 分钟，单独计时。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| Idempotency-Key | 创建、追加的可选操作身份 | 小写UUID；有头但非法不能回退无键路径 |
| userId/action/operationId | 精确界定操作范围 | 路径目标放指纹，不放主键放宽身份 |
| response与Location | 找回当时的公开结果 | 不拿当前最新版替换历史快照 |
| pg_advisory_xact_lock | 同身份串行决定 | 新语句读取等待后已提交结果；事务结束释放 |
| 唯一约束／失败事务 | 最后防线及恢复边界 | 已失败事务不能继续查；不把所有P2002都当重试 |
| sessionStorage | 同源同页签刷新恢复 | 发送前写成功；不是跨设备队列或登录凭证 |
| 身份代次／会话绑定 | 防止跨账号显示或提交 | 前端确认与后端请求身份必须一起核对 |
| 无键旧请求 | 保持原客户端兼容 | 不自动获得安全重发保证 |

官方查阅：[PostgreSQL 18建议锁](https://www.postgresql.org/docs/18/explicit-locking.html#ADVISORY-LOCKS)、[事务快照](https://www.postgresql.org/docs/18/transaction-iso.html)、[sessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage)。

[上一章：幂等与审计](../chapter-29-idempotency/chapter.md) · [下一章：一致性整合](../chapter-31-integration/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
