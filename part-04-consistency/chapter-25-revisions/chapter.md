# 第 25 章 关系演进：从覆盖输入到保留修订历史

第二十四章结束时，原文、中文意图和记录归属已经保存在数据库中，意图的读写上限统一为 2000 个 UTF-16 单元。我们能够保留旧数据追加迁移，也能判断旧程序是否读得懂新值。但现在的 `PATCH /captures/:id` 仍直接覆盖意图：修改成功后，数据库只剩下修改后的内容。

第四篇从这里继续。用户整理一句表达时，可能先补充意思，再修改原文，随后还想知道某份候选是根据哪一版输入产生的。本章先让内容有稳定的版本身份，再进入候选、采纳和事务。我们不提前创建候选或调用 AI；把“保留哪一个事实”说清楚，后面的并发保证才有对象。

先完成第 17～24 章，从 `part-03/chapter-24` 的最终状态继续，回到第二十四章的 C 源码目录并停掉 A/B 旧产物。沿用 Node 24.22.1、PostgreSQL 18、Prisma 7.10.1、DBeaver、Postman 和开发调试入口。日常库及旧记录保留，不能换一个空库跳过回填。

主线阅读约 230～275 分钟，跟做另加 125～160 分钟，支线另计。可以先完成模型与样本推导，第二次从停写做到恢复库升级与旧值核对，第三次完成日常库切换、修订读写和 SQL 对账。停写到新协议接管之间保持旧写入口关闭。

## 25.1 覆盖保存以后，哪些问题已经无法回答

继续使用一条虚构记录。用户最初写下 `I am not much of cook.`，意图为“我不太会做饭”。后来改成 `Cooking is not my strength.`，意图变为“想自然地说我不擅长做饭”。这是同一条正在整理的记录，不是两条毫无关联的记录。

如果直接 UPDATE 两个字段，详情可以展示新内容，却无法回答“原文曾经是什么”。如果再给这条记录加 `updated_at`，只能知道最后一次修改时间；时间不会把已经覆盖的原文恢复出来。运行日志也不适合充当历史数据库：日志可能脱敏、采样、轮转，没有公开查询契约，更不应为了版本功能把每次原文完整打印出来。

于是我们需要保留每次成功保存后的完整内容。记录 ID 继续标识这件事，修订 ID 标识某一次具体内容。以后用户确认候选时，应能确认候选依据的那一版输入，而不是只指向一个随时会变的“当前原文”。这也是本章要保留修订身份而不只保存一段修改说明的原因。

设想给素材做一个详情页，页面上只有一个编辑框，同一个网址昨天打开是第一句，今天打开是第二句。产品现在要在页面下方显示“上一次保存的原文”。拿今天库里的那一行，分别假设两种过去：昨天录的是带语法问题的句子，或昨天就已经是今天这句话，只是今天改了意图。两种操作完全可能留下同样的原文、意图和最后修改时间。任何只读这几个字段的查询拿到的输入都一样，却被要求给出两个不同答案。缺的不是更巧的查询，而是保存发生时丢掉的一份事实。这种先构造两条最终相同的路径、再看产品是否需要分辨它们的办法，也能帮助判断一次需求能否靠现有数据解决。

新字段应追到什么程度，也可以这样判断。如果需求只是“显示今天是否修改过”，记录一个恰当定义的时间也许足够；如果需求是“把前一次的内容放回编辑框给用户对照”，知道时间就不够；如果需求继续变成“告诉我这次是谁审核通过的”，保留前后两份文字依然不够。本章解决中间那个问题，决定记录的是服务接受的输入。输入框内曾经打过几个字又退格，没有提交，就不会落入历史。点击保存却被规则拒绝，也不能在历史里占一版。这样读者在 Postman 连续发送一条正常输入和一条被拒输入时，就知道应当新增一行，而非按请求次数增加两行。

把页面上的“编辑同一条素材”拆成两个独立观察。第一，返回列表后，仍能凭原来的记录标识回到这个编辑框；第二，用户从历史里点开昨天那次保存，应看到昨天的文字。若每次修改都新建一条普通素材，第二个观察看似有了数据，第一个观察却失去了明确的接续关系。拿文字相似程度来猜两行是不是同一条也不可靠，用户可能恰好在两条独立素材里写过同一句话。从原有稳定标识旁边分出一组修订，就能既留住入口，又让一次保存产生独立结果。以后比较任意两版，先确认属于同一条素材，再比较内容，不用从内容反猜身份。

还要把读者熟悉的“撤销输入”和这里的“查看过去”分清。页面点开昨天的内容，是读操作，集合里最高的序号不变。若用户把昨天的文字重新提交，服务接受的是今天的一次保存，历史尾端会多一版；夹在两者之间的修改也仍可读。以“甲、乙、甲”为例，比较第一和第三行只能说原文相同；它们中间确实保存过乙，第三行也可能配有不同意图。按原文去重会把这个过程压缩成两行，使再次选择甲看起来从未发生。用这种很短的反例检查设计，比先争论要不要给整表加一个唯一文本索引更有效。

### 先明确保存的语义

这里先把 chunks 理解为调用方随输入提供的一组有序短语片段，例如 `[{"text":"not my strength"}]`；它们没有独立身份，也不是下一章的候选，25.5再从查询和引用需求展开存储取舍。

本章选择完整快照：一次新修订同时保存原文、中文意图，以及这一版内容携带的来源和 chunks。客户端追加时提交完整原文与意图；即使只改原文，也明确带上希望保留的意图，清空意图使用 null。这样读一版时不用重放此前几十次 PATCH，也不会把缺失字段误认为清空。

保留旧 PATCH 入口，避免前章保存的请求全部失效，但它的实现要改变：在数据库语句中取得最新快照，复制原文与附加信息，只替换意图，然后插入新修订。它不再更新旧行。旧请求依然得到同样形状的 Capture 响应，新增历史则通过新接口读取。

下面几种结果必须分开：

| 操作 | 本章结果 | 不能据此推断什么 |
| --- | --- | --- |
| 追加不同内容 | 新增一个完整修订 | 不能证明客户端基于最新内容编辑 |
| 重复发送相同内容 | 仍新增一个修订 | 内容相同不等于同一次操作，尚未提供幂等 |
| 输入被校验拒绝 | 不执行插入 | 不等于任意 500 或网络失败都没有写入 |
| 两次写入争用同一序号 | 一次成功，另一条明确冲突或遇到等待超时 | 不会自动合并，也不自动重试 |
| 查看过去一版 | 返回当时保存的内容 | 不能把它当成当前可采纳的候选或最新事实 |

相同文本也可以形成两次保存。这是一个明确选择：此处记录成功提交的内容快照，不建设内容去重，也不把字符串哈希当作操作身份。第二十九章再为需要安全重试的业务建立命令身份。

“不可修改历史”在本章指应用行为：没有修改、删除修订的接口，PATCH 也只追加。当前开发连接仍持有表所有者权限；外键和唯一约束不阻止有权限的人直接 UPDATE 历史。需要数据库级不可变约束或完整审计时，还要设计角色权限、维护入口和审计机制，不能把一张历史表宣传成防篡改系统。

从调用方准备请求的那一刻开始推。页面读到原文甲、意图一，用户只把原文改成乙。页面能够明确交给“完整追加”的，是乙和一；如果用户实际清空了意图，交给它的则是乙和空值。这两个请求有不同的结果。若约定省略意图也算清空，表单序列化遗漏字段就会和用户作出清除决定留下同样一版，回看时已经无法分辨。让该字段必填但可空，正好把“这份消息完整”和“这个值可以没有”分成两个条件。它们在 TypeScript 表单里常被都写成可选，落到持久历史却不能混用。

旧页面并没有完整编辑框，只有修改意图的动作。它保存时只知道要交给服务的新意图，不应为了凑齐新接口而把页面上很久以前加载的原文强行塞回去。设它打开后另一窗口已把原文从甲改成乙。若旧页面提交甲和新意图，最高版本就可能又显示甲。若它仍只提交新意图，由服务在写入时取前一版的原文和来源，顺序先后执行时产生的是乙和新意图。两种提交方式都可以写出一行完整快照，区别是哪些值来自用户这一次明确表达的决定，哪些来自执行时可见的已有事实。并行时能否取到同一前版，还要看后面的争号处理。

一份完整修订回答“存了什么”，成功响应回答“服务对这笔请求报告了什么”，两者也可能在观察上分开。假如用户点保存后立刻关掉页面，客户端没有记下响应，随后看到历史里恰好多了一份相同内容。这与刚才提交成功相容，也与另一窗口提交同样内容相容。可以查看新增版本与当时的列表来判断当前数据，却没有依据把其中一行精确认定为丢失响应的那一次。若产品要求能原样重放某一次提交结果，需要能指认操作本身的资料；把版本号当作重试凭据会遇到一个实际难题，客户端正是因为没有收到结果才不知道分到了哪一个号。

要给已有客户端说明这次演进，可以先各写一句它仍能依赖的行为。保存意图仍返回那条记录的身份和最初创建时间；获取详情仍只返回一个当前对象；进入历史才出现版号与每版身份。这样既不强迫原列表界面理解一整份历史，也不会让历史界面拿详情里的创建时间当作最后编辑时间。等到实现时，拿同一次 PATCH 的响应和紧随其后的历史第一项对看，文字可以相同，标识与时间却应按各自代表的对象解释。读者若能在看字段名之前先说出“一行究竟代表谁”，后面两种投影就容易区分。

## 25.2 把记录身份和内容快照分开

先回到行粒度。`captures` 的一行仍表示一条归属于用户的记录，保留 `id`、`user_id` 和最初创建时间。`capture_revisions` 的一行表示某次保存的完整内容，有自己的 `id`、所属 `capture_id`、记录内的 `revision_no`、内容字段和修订创建时间。

```mermaid
erDiagram
    USERS ||--o{ CAPTURES : owns
    CAPTURES ||--o{ CAPTURE_REVISIONS : has
    USERS {
        uuid id PK
    }
    CAPTURES {
        uuid id PK
        uuid user_id FK
        timestamptz created_at
        text original_text "保留的初始内容"
        text chinese_intent "保留的初始内容"
    }
    CAPTURE_REVISIONS {
        uuid id PK
        uuid capture_id FK
        int revision_no "与 capture_id 联合唯一"
        text original_text
        text chinese_intent
        text input_source
        jsonb chunks
        timestamptz created_at
    }
```

图中的数据库外键允许一条 Capture 暂时没有修订，表示实际约束的能力；本章迁移核对和创建路径共同建立“每条记录至少有一个修订”的应用不变量。不要把图上画成一对多，理解成 PostgreSQL 自动要求父表至少有一行子表。外键检查的是子行能否找到父行。

### 为什么保留两个 ID 和一个序号

Capture ID 用于稳定路由、归属和未来的整条记录操作。Revision ID 可被候选引用，明确绑定一个不会随当前内容变化而改变的快照。`revision_no` 则用来表达同一记录内的顺序，例如 1、2、3；不同 Capture 都可以有自己的第 1 版。

因此候选键是 `(capture_id, revision_no)`，不是 `revision_no` 单独唯一，也不是 `(user_id, original_text)`。同一用户完全可能在不同上下文中记录相同文字；用内容唯一会把业务去重偷偷加入模型。修订表也不复制 `user_id`：归属目前通过 Capture 得到，复制以后就必须额外保证两份归属永远相同。后面所有历史查询仍先约束父记录的用户，不能因为子表没有 user_id 就省略权限范围。

序号也不由时间戳替代。两次写入可以落在同一毫秒，时钟有精度和校准问题，`CURRENT_TIMESTAMP` 还是当前事务的起始时间，不能拿最大时间证明最后提交。UUID 是身份，本章也不依赖其排序表达业务顺序。最新修订明确使用本记录最大的序号。

当前不增加 `current_revision_id`。查询时按序号取一条，省去“插入历史后还要更新当前指针”的第二份状态。以后出现正式采纳、回退选择或读性能需求，再根据具体规则设计指针及其一致性。读取变复杂是当前取舍的成本；少一个字段并不是永远更好的模型。

从一张没有列名的纸开始设计键。写两条素材“早餐”和“晚餐”，各自先保存一次，再只改早餐。纸上现在有三个内容格。要指给别人“晚餐的第一版”，单说第一版会命中两个格；只说晚餐，今天能命中一个，将来再保存一次就不再唯一；说晚餐加第一版，才能在素材内部定位那个格。数据库把这两项合起来检查唯一，允许早餐也有第一版。另给每个格一个修订标识，则将来要引用它的表只需保存一个值。即便两条素材都属于同一用户，且两份原文恰好同字，这套识别方法也不需要改变。在 DBeaver 看约束列顺序时，检查的是两列共同出现，分别给其中任一列设唯一都会误拒合法数据。

接着试着故意给格子编号一、三。两个序号都是正数而且互不相等，数据库的正数检查与联合唯一都能成立。由此可知，不能仅从看到约束名便断言序号连续。连续是目前写路径从一开始，每次取前一号加一、成功才落一行的结果，还依赖历史没有被其他途径移除或跳号写入。读历史时按小于上页边界查，遇到有空号的集合仍能正确翻页；若页面把“最高号减去当前号”当作必然等于隔了几次保存，就悄悄增加了一个更强的前提。对一个已有库做检查时，最好把“同号不能出现两次”“没有缺第一版”“序号没有空洞”写成三个问题，分别用合适的证据回答。

一个可在 SQL 编辑器里独立重建的检查是先分组，写出每条素材的条数、最小号和最大号。对于刚才纸上的三行，早餐是二、一、二，晚餐是一、一、一。换成一、三以后，早餐变成二、一、三。只有在序号为正且组内唯一的前提下，最小号为一、总数等于最大号才能证明从一到最大号已经填满。若把唯一前提去掉，一、一、三也有三行，却仍然缺二。下面的样本可把一个数字改掉比较结果。这里按修订分组，完全没有修订的素材不会出现；真要查缺首版，还要以下一节的父表为起点。

```sql
WITH sample(capture_id, revision_no) AS (
  VALUES ('早餐',1), ('早餐',2), ('晚餐',1)
)
SELECT capture_id, count(*) AS versions,
       min(revision_no) AS first_no, max(revision_no) AS last_no
FROM sample
GROUP BY capture_id
ORDER BY capture_id;
```

再问“哪条素材最近建立”和“这条素材最近保存的内容”是否应该用同一列排序。早餐比晚餐早建立，却可能刚刚被编辑。前章列表按素材创建时间与标识排序，本章改变的是每一行里的内容来源，编辑动作不会把早餐挪到列表末尾。若拿修订时间替换排序字段，界面看起来也有新内容，却改变了列表的相对位置。产品真想按最近活动排列时，应该另行定义排序与并列时的稳定依据；不能把这项改动夹带在一次存储迁移里。检查兼容性要同时看哪些行留下、每行的值、行与行的顺序，三者可以分别出错。

### 快照中的重复，为什么不是设计错误

第三版可能只修改意图，原文却与第二版相同。把原文再保存一次，看起来重复，但它表达的是“第三版当时的完整输入”，不是两份声称代表同一可变事实的当前值。查询任何一版都能独立解释，代价是存储随修订数量增加。

只保存差量可以减少部分重复，却要求明确差量格式、应用顺序、基础版本和字段删除语义。缺一段差量、修改差量解释规则，都会影响后面的重建。这里文本短、需要按版直接查询，完整快照更简单。若以后保存大文件，可能改成不可变对象引用，而不是在每一版重复存文件字节；不能把现在的选择机械外推。

旧 `captures.original_text/chinese_intent` 暂时保留，含义固定为迁移时或新建时的初始内容，用于核对和兼容迁移期间的旧结构。切换之后它们不再是当前内容，也不跟随新修订更新。数据库暂存了有意的过渡冗余，我们必须标明其生命周期，不能让两处都成为事实来源。

重复是否有害可以借一个具体修改来检验。假设用户将第三版的意图补充得更具体。若两版共同引用一行可以原地修改的意图，修改那行后第二版也会显示新意图，这会污染历史。若两版分别保存同一个字符串的值，第三版变成新字符串时，第二版仍可独立解释。相同的字面值在不同版本有不同的有效时点，不能因相同就认定重复维护了同一个事实。反过来，素材属于谁只在父行确定，若每一版都另存归属，转移或修复归属时就要决定究竟这些归属是当时快照还是当前所有者。没有这种需求时只保存一份，减少了要保持一致的事实数量。

试着按差量重建三版，就能估算这次取舍的代价。第一版字段齐全，第二版只写“原文改为乙”，第三版只写“意图清空”。只读第三条说明，看不出最后的原文；把第三条与第一版相接而漏掉第二条，又会得到甲和空值，看上去完全合法，却没有还原第三版。要让差量成立，必须先找可靠起点，再按正确顺序接每一次，区分未改变、应删除、应设为空。当前每一版文字有限，又要经常展示用户看到的完整输入，存储多几个相同值换来单版可直接读取，是能指明受益读路径的决定。若未来连长音频都重复复制，成本模型会变，届时要问保存不可变引用能否保住内容，而不是沿用文字很短时的直觉。

父表保留的初始内容尤其容易被维护者误用。刚迁移或刚创建时，查父表和查最新版得到完全一样的值，此时两条实现都能通过“详情返回刚写的文字”这一个测试。真正有区分度的样本需要至少两版，并且要有一个在两版之间确实改变的字段。若只改意图却拿原文搜索，旧列和新列仍可能一起命中，测试同样无法揭出读错来源。可以预先指定两个不同词，只在初版保留旧词、最新版保留新词，再要求旧词找不到这条素材而新词能找到。检查实现时先设计一个能让两种解释得出不同结果的数据集，比把正确答案写进变量名更可靠。

### Prisma 表达关系，SQL 表达完整约束

在 `prisma/schema.prisma` 的 Capture 加入 `revisions CaptureRevision[]`，新增模型的关键部分如下；已有 Capture 列和 User 关系全部保留：

```prisma
model CaptureRevision {
  id            String   @id(map: "capture_revisions_pkey") @db.Uuid
  captureId     String   @map("capture_id") @db.Uuid
  revisionNo    Int      @map("revision_no")
  originalText  String   @map("original_text") @db.Text
  chineseIntent String?  @map("chinese_intent") @db.Text
  inputSource   String   @map("input_source") @db.Text
  chunks        Json?    @db.JsonB
  createdAt     DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  capture       Capture  @relation(fields: [captureId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "capture_revisions_capture_id_fkey")

  @@unique([captureId, revisionNo], map: "capture_revisions_capture_no_key")
  @@map("capture_revisions")
}
```

唯一约束建立的联合 B-tree 索引既维护序号唯一，也能为按 capture_id 找修订、按序号排列提供访问路径；无需机械再加一个完全同列索引。具体执行计划在第三十五章继续研究。删除仍选 RESTRICT：目前没有“删除记录并清理全部关联事实”的业务，不用 CASCADE 先替未来作出决定。

来源和 chunks 的取舍在 25.5 展开。先知道迁移旧行时来源是 `unknown`、chunks 是 SQL NULL；新手工输入来源为 `manual`。这些值是有含义的约定，不从旧文本内容猜测来源。

## 25.3 停写、回填、核对，再切换读取

这次变化与前章只放宽 CHECK 不同。旧程序只写 captures，新程序只向修订表追加。如果先回填再允许旧程序继续 PATCH，后续改动只留在旧列，新程序会读到过期快照。数据库结构兼容，不代表写入协议兼容。

本章采用有停写窗口的切换，适合当前单服务和少量开发数据：停止 API 和旧产物，确认没有维护脚本或 DBeaver 网格在修改这两张业务表，完成扩表和回填，核对后启动新服务。不是零停机方案。若业务不能停写，需要先建立所有写入口的过渡协议、增量追赶和最后的切换门槛；只说“临时双写”没有解决双写部分成功的问题。

```mermaid
flowchart TD
    A["停止旧 API 与全部内容写入口"] --> B["保存旧行并确认迁移起点"]
    B --> C["同一迁移：建修订表与回填第 1 版"]
    C -->|成功| D["核对覆盖数、字段及约束"]
    C -->|失败| E["核对事务回滚和失败记录"]
    E -->|修复首因后重跑| C
    D -->|核对通过| F["启动新服务：读修订、只追加"]
    D -->|不一致| G["维持停写并调查，禁止旧版混写"]
    F --> H["新修订已存在：旧列不再代表当前内容"]
```

### 冻结的到底是什么

先停止 DEV 的全部内容写入口并在原会话处理完未提交事务，再在 DBeaver DEV 的 SQL 编辑器执行：

```sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SELECT id, user_id, original_text, chinese_intent, created_at,
       extract(epoch FROM created_at) AS created_epoch
FROM public.captures ORDER BY created_at, id;
```

确认是日常库，导出结果到受控的本机位置，用于之后逐字段核对。这里沿用前章导出操作，不把包含实际内容的导出加入代码仓库。旧记录为 null 的意图继续保留 null；原文中的空格、原来的 Capture 创建时间与归属都不能改变。

“冻结写入”也包括第二十四章为了对照而启动的 A/B/C 实例。停止当前 dev 并不意味着端口 3001 的旧产物也退出。DBeaver 中未提交的事务应在原编辑器明确提交或回滚；Disconnect 不是数据库停止，也不是完整的发布措施。

先把操作顺序落到一条有值的记录上。早上九点导出，九点零一旧服务成功修改了意图，九点零二才停止旧服务，九点零三从库里回填。导出与修订第一版不同，不能据此断定回填损坏了数据，因为两个观察之间确实有一次合法写入。若顺序变成停服务、确认没有未结束的写入、导出、归档、回填，记录上的差异才需要作为迁移问题调查。因此把导出作为比较基线之前先完成停写；若先前为了解规模已查过一次列表，可以保留它用于估量，但要在停写后重新执行查询保存最终结果。单击网格刷新只会让客户端重新读取，不会替别的连接提交或结束工作。

还要弄清一次“停止运行”停在了哪一段。停止源码监听可以阻止它再拉起子进程，但不必然停止另一个独立终端里的生产产物；Postman 没有正在发送请求，也不能证明 DBeaver 的网格没有一笔待提交修改。回到自己本次实践开启过的服务和编辑器，逐项结束写入口，在原会话处理明确知道用途的未提交事务。若看到锁等待，先确认等待者和持有者是否都属于本次演示，并回原会话结束对应操作。迁移能成功拿锁只说明它在那一刻能进入临界区，不能从锁的成功倒推停写窗口之后也不会再出现旧写入。

在 DBeaver 同时开三个相似的编辑器时，可以给自己设一个不用猜库名的比较。把三个窗口分别理解为“备份的来源”“从它恢复出来的独立目标”“日常使用的原库”。从来源和目标各执行同一条显示身份的查询。恢复完成后的目标应有不同库名，却能找到同一个业务标识与原值；若两处库名也完全相同，所做的只是对同库查了两遍。反过来，两个库名不同却找不到原标识，也不能以“目标能连接”作为成功。这个判定有两个轴，身份要不同，内容要按原标识相同。等验证库升级以后，目标与来源的结构又应有意地出现差别，然后才谈得上验证含旧数据的升级。

### 先备份，再在另一个库恢复一次

前面导出的查询结果便于逐字段比较，但没有表定义、约束和迁移历史，不能拿它重建一个完整的库。这里使用 PostgreSQL 自带的 `pg_dump`，把当前一个数据库的结构和数据保存为归档文件；`pg_restore` 读取这个归档，向指定的空库恢复。归档包括 `_prisma_migrations`，不包含数据库外的角色、密码、服务配置或程序。我们在同一学习实例使用已经建立的 epp_owner；跨实例恢复还需要另行准备角色与权限。

若当前工作目录仍停在第二十四章，先从[第 25 章配套 SQL 目录](https://github.com/SamChowRock/epp-public/tree/part-04/chapter-25/database/chapter-22)取得这组文件供 DBeaver 使用。此时仍对第二十四章结构的数据库做备份，取得本章脚本不会替数据库执行迁移。

先在仍为第二十四章结构的 VERIFY 完成一次恢复练习。按前文停止全部写入者、结束未提交事务；在 DBeaver 执行 `database/chapter-22/00-verify-samples.sql`，先单独核对连接查询，再执行事务，保存两条虚构样本的全部返回字段。固定 ID 已存在时先查询复用，不重复插入。若 VERIFY 已升级且没有旧备份，按本节末尾建立独立旧结构样本库，不清空现有库。

在终端检查客户端：

```bash
pg_dump --version
pg_restore --version
```

两者应为 18.x。找不到命令或版本不对时，回到[环境准备的 PostgreSQL 安装与 PATH](../../environment-setup.md#homebrew-与数据库程序)，同一个 bin 目录也提供这两个工具。数据库服务器已经运行，不表示客户端工具在当前 PATH 中。

在 DBeaver 核对 VERIFY 的实际库名、端口和角色。本书默认库名是 `epp_migration_check`；若自己改过名字，替换下面源库名。不要把连接显示名称当作库名。

```bash
umask 077
backup_dir=$(mktemp -d "$HOME/epp-backup-XXXXXX")
pg_dump -h 127.0.0.1 -p 55432 -U epp_owner -W \
  -d epp_migration_check --format=custom --file="$backup_dir/before.dump"
```

`-W` 会在终端提示输入数据库密码，不把密码写进命令历史。`--format=custom` 保存 pg_restore 可读的归档。只在 pg_dump 成功退出、没有未处理告警后继续；失败生成的文件不能当作备份。`umask 077` 让新文件只供本机当前账号访问，目录放在代码仓库外；归档仍含完整原文，需要按原数据保护。记下准确路径和源库、章节、备份时间，重开终端后先恢复 backup_dir 的值，不重新猜文件。

在 DBeaver 切到第二十章使用的**管理连接**，目标为 postgres，开启自动提交，单独执行：

```sql
CREATE DATABASE epp_ch21_restore OWNER epp_owner;
```

这个库名必须尚不存在。已存在就先识别用途，为本次选一个新名字，不 DROP、不覆盖。创建后，按第二十章方式复制连接，数据库改为 epp_ch21_restore、角色仍为 epp_owner；在新连接执行身份查询并确认没有业务表。不要在它上面先运行迁移或 seed，恢复工具会建立归档中的对象。

```bash
pg_restore -h 127.0.0.1 -p 55432 -U epp_owner -W \
  -d epp_ch21_restore --single-transaction --exit-on-error \
  --no-owner --no-privileges "$backup_dir/before.dump"
```

`-d` 是恢复目标；这里没有 `--create`，不会按归档里的原库名另选目标。单事务让本次恢复整体成功或回滚，遇错立即停止；`--no-owner --no-privileges` 让对象由当前 epp_owner 建立，不搬运原库授权。这样适合本机同角色的小库练习，不等同还原生产访问控制。没有 `--clean`，因为我们不向已有业务库覆盖对象。

恢复成功后，分别在源 VERIFY 和新连接执行配套 `database/chapter-22/04-backup-check.sql`。先看身份结果，再比较 users、captures 的完整行和 `_prisma_migrations` 的迁移名、校验值及完成状态；两条样本的 ID、空格、NULL／非空意图与 created_at 都应保持。约束结果应仍有主键、外键和 CHECK。恢复后约束表达式的括号排版可能变化，应核对判断条件与拒绝行为，不以显示字符串逐字相等为标准。只看到恢复命令退出 0，或只比较总行数，都不能证明关键内容完整。

确认恢复正确后，把第 25 章项目 `.env.database-verify` 的 DATABASE_URL **仅数据库名改为 epp_ch21_restore**，保留原主机、角色及个人密码；API 的 `.env` 先不改，也不启动旧服务向恢复库写入。后文先在这个恢复库部署第 25 章迁移，DBeaver 同样选它。这就把“恢复了旧结构”继续验证到“旧数据能升级”。原 VERIFY 保留作为对照。修改连接后按下一段的 unset 清除继承变量，避免命令仍连旧目标。

真正升级 DEV 前也按同样次序停止写入，以 DEV 为源重新备份，在另一个全新恢复库验证；VERIFY 的归档不能替代 DEV 的备份。pg_dump 取得的是一致快照，不会持续收集备份以后发生的写入；若升级后已经接收新记录，直接退回这份旧快照会丢掉那段新数据。此时维持停写并选择保留新数据的修复方案，不能把“能恢复归档”当成自动无损回退。长期备份、异机保存和按时间恢复在运维篇继续展开。

**已经升级、又没有第二十四章归档时**，这轮只能重新建立虚构的旧结构实验，不能重现自己的历史数据。用管理连接在自动提交下执行 `CREATE DATABASE epp_ch21_replay OWNER epp_owner;`，名称已存在则另选。另取第二十四章代码：

```bash
git clone --single-branch --branch part-03/chapter-24 \
  https://github.com/SamChowRock/epp-public.git ../epp-ch21-replay
cd ../epp-ch21-replay
nvm use
npm ci
```

在这个目录按第二十章方法由 `database/chapter-18/database.env.example` 新建 `.env.database`，填写自己的密码，DATABASE_URL 只指向 epp_ch21_replay。清除终端旧变量后执行 `npm run db -- migrate deploy`，在 DBeaver 的新连接核对迁移已到第二十四章，再执行上面的两条虚构样本脚本。现在用 epp_ch21_replay 作为 pg_dump 源库，按同样步骤恢复到另一个新库；回到第 25 章代码目录，把 `.env.database-verify` 指向恢复库再继续。切换代码或克隆完成不会改变原来的 DEV／VERIFY。

备份演练可以从“我要证明哪件事”来组织。一个文件存在，只能证明目标目录里有文件；能列出归档内容，能说明它至少含有可识别的目录信息；把归档恢复到空库以后按原标识读取，验证的是表、数据和依赖能在这次目标环境重新建立。最后拿恢复出来的旧库跑本章迁移，验证的又是含有旧值的升级路径。前一个结果是后一个动作的前提，不能用其中最方便的一项代替整段链路。若恢复后不小心先运行了种子脚本，再看到一个熟悉的账号，更难区分它来自归档还是刚刚写入。因此恢复目标在读到原样本以前，应留在只读核对阶段。

两条旧样本刻意选择了不同形状。第一条首尾带空格，意图是空值；第二条有实际意图。只挑一条所有字段都有普通文字的行，很难发现数据导出时把空值写成空串，或回填时把空值替成某句默认话。图形网格里空格与空值不一定容易分辨，可以临时在只读投影里加上 `quote_nullable(original_text)`、`chinese_intent IS NULL` 和 `char_length(original_text)`。看见带引号的原文、明确的布尔值和长度，就不必靠肉眼数单元格边缘的空白。用同一条投影对来源、恢复库各运行一次，比较的是每个标识对应的值，不受网格按哪个标题排序影响。

时间也可能给出虚假的不一致。同一个带时区的数据库时刻，在两个会话里可能显示不同的本地钟点。比较前确认两边会话时区，或在导出阶段同时保存 `extract(epoch FROM created_at)`，对照数值时保留毫秒精度。等回填后，要比较父行的原创建时间与备份值；修订行的创建时间表示迁移建立快照的时刻，本来就不要求等于父行。若两列都叫创建时间，导出时分别起清楚的列名，读者便能据此说明“父行没被重建，第一版是后来才开始记录的”。若只保存截图中的一个本地钟点，之后无法可靠分辨列选错、时区不同还是数据真的变化。

停写与恢复也提供了一个有明确结束条件的暂停点。假设实践今天只能做到恢复库能查到两条旧样本。留下源库、恢复库、归档位置和已比对的标识，明天分别查迁移历史与修订表是否存在，就能判断是继续升级还是已跨过部署步骤。不要仅凭目录里有本章迁移文件推定库已变更，同一份源码可以指向还在旧结构的来源、正在验证的目标以及尚未触碰的日常库。若明天发现来源重新接收过写入，已有归档仍可用来练习旧结构升级，但它不再是今天日常库的切换基线，要为真正切换重新建立可恢复的停写点。

### 为旧行生成的第 1 版，只能代表已知现状

旧系统可能已经覆盖过十次意图，我们只能看到最后一次留下的值。因此迁移生成的第 1 版表示“从开始记录修订时观察到的内容”，不能称为“用户最初输入”。它的修订时间用迁移事务时间，Capture 的创建时间仍保留原值。来源未知、chunks 未知，不能填成手工输入和空数组来伪造过去的事实。

真正动笔写回填，可以先遮住 INSERT，只写一条打算用作来源的 SELECT。要生成的每一行是一条已有素材的第一版，驱动表应是素材而非用户。假如从用户起步再外连素材，没有素材的用户会多出一行没有记录标识的占位；按用户分组又会把同一个人的两条素材压成一行。把查询先写成 `SELECT id, original_text, chinese_intent FROM public.captures`，在恢复库的网格里按原标识找那两条样本。结果的行粒度对了，再给每一行补上固定的一、未知来源、空的片段字段。此处原意图为空的行仍然有完整身份，不能因为某一列缺值就把整行从来源过滤掉。

现在按目标列顺序手算投影。修订标识与所属素材标识在这次回填中都取父行的标识，同一个值要写进两个含义不同的格；序号不是从所有素材的排列名次取，而是每条都填一。若写成按创建时间依次编号的窗口函数，第二条素材直接从二开始，虽然两行都能插入、总数也一样，按素材查首版就会发现漏了一条。时间一列另取迁移时刻，来源没有记录就不能标手动。按列名一一对齐后，才把 SELECT 接到带显式列清单的 INSERT 后面。这样即使未来表增加默认字段，当前迁移表达的映射仍然可以独立阅读，不靠表列碰巧排列一致。

为什么把诊断查询放到同一个事务里？假设建表、插入和检查各自独立提交。插入刚完成时观察者已能看见新表，随后才发现某项映射写错，这时“检查失败”并不能取消已经提交的行。若建表、生成快照、检查一起提交，同一事务能读到自己刚插入的值，检查失败就能阻止对外发布这组结果。另一会话在提交前不能把这些新行当成已完成迁移；提交成功以后再读，才进入下一层对照。外层迁移登记又有自己的完成状态，数据库事务回滚不等于迁移工具已经把失败尝试抹掉。排错时先看最先触发的数据库错误，再看表是否真的存在与迁移记录是否标记完成，不凭一句部署失败就重新生成相同迁移。

若在验证库看到“修订表已存在”，合理原因至少有两种：这个恢复目标已经部署过，或连接被指到了另一份库。先在 DBeaver 复查身份、查迁移登记与两条指定样本；新表存在、迁移成功且样本吻合，就从验收接下去；目标身份错误，就修正配置重新确认。若登记和物理结构矛盾，应维持停写，沿上章失败恢复流程调查。把建表改成“若不存在就建”并不能保证已有表具有正确列、约束与数据，而且会掩盖为何重复来到这一步。把状态判断放到恢复操作之前，比试图用一个容错语句兼容所有未知起点稳妥。

在修改 Schema 后，从前章逐步实现的读者运行：

```bash
unset DATABASE_URL SHADOW_DATABASE_URL
npm run db -- migrate dev --name capture_revisions --create-only
```

审查草稿，在首次成功应用前加入事务、有限超时、约束及回填。使用本章成品时已有 `20261102100000_capture_revisions`，不要再生成一份相同迁移。以下迁移的 CHECK 延续旧字段的数据库底线。原文与意图的 UTF-16 长度、空白规则以及每个 chunk 的字段和长度仍由应用校验，回填沿用旧值。

```sql
BEGIN;
SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '10s';
LOCK TABLE public.captures IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE public.capture_revisions (
  id uuid CONSTRAINT capture_revisions_pkey PRIMARY KEY,
  capture_id uuid NOT NULL,
  revision_no integer NOT NULL,
  original_text text NOT NULL,
  chinese_intent text,
  input_source text NOT NULL,
  chunks jsonb,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT capture_revisions_capture_id_fkey FOREIGN KEY (capture_id)
    REFERENCES public.captures(id) ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT capture_revisions_capture_no_key UNIQUE (capture_id, revision_no),
  CONSTRAINT capture_revisions_no_positive CHECK (revision_no > 0),
  CONSTRAINT capture_revisions_original_nonempty CHECK (char_length(original_text) > 0),
  CONSTRAINT capture_revisions_intent_shape CHECK (chinese_intent IS NULL OR
    (char_length(chinese_intent) BETWEEN 1 AND 2000 AND btrim(chinese_intent) <> '')),
  CONSTRAINT capture_revisions_source CHECK (input_source IN ('manual', 'unknown')),
  CONSTRAINT capture_revisions_chunks_shape CHECK (
    chunks IS NULL OR CASE WHEN jsonb_typeof(chunks) = 'array'
      THEN jsonb_array_length(chunks) <= 25 ELSE false END)
);
INSERT INTO public.capture_revisions
  (id, capture_id, revision_no, original_text, chinese_intent, input_source, chunks, created_at)
SELECT id, id, 1, original_text, chinese_intent, 'unknown', NULL, CURRENT_TIMESTAMP
FROM public.captures;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.captures c LEFT JOIN public.capture_revisions r
      ON r.capture_id = c.id AND r.revision_no = 1
    WHERE r.id IS NULL OR r.original_text IS DISTINCT FROM c.original_text
      OR r.chinese_intent IS DISTINCT FROM c.chinese_intent
  ) THEN RAISE EXCEPTION 'Revision backfill mismatch'; END IF;
END $$;
COMMIT;
```

表锁会阻止并发写 captures，允许普通读取；等待已有写事务超过期限会失败。它只保护本次迁移期间，COMMIT 后就释放，不能代替停掉旧写入者。当前数据量少，把建表、回填和核对放在一个有界事务里，失败则一起回滚；数据量大时需要按第二十三章支线拆分可恢复回填，不能照搬十秒限制并无限调大。

旧 Capture ID 在第 1 版回填时也用作 Revision ID。两个表分别有主键命名空间，因此不冲突；这是让本次回填映射直观、可核对的办法，不表示以后可以互换两类 ID。新建记录和后续修订都生成各自的 UUID，不依赖相等关系。

`IS DISTINCT FROM` 用于比较包含 NULL 的值：两边都 NULL 认为没有变化，一边 NULL 一边字符串认为不同。普通 `<>` 在有 NULL 时得到未知，会漏掉本来想报告的差异。DO 块在迁移内部发现差异就抛错，让整个事务不能成功提交；迁移工具的“完成”不能早于业务核对。

在 DBeaver 打开上面已恢复并核对过的独立库。后文称它为本轮 VERIFY；确认 `.env.database-verify` 与图形连接都指向它。两条旧样本已随归档恢复，不再重复插入；使用备份前保存的结果作迁移后逐字段比较。若中断后发现它已经升级，先核对迁移记录与旧行，不再回填；要重做则从原归档恢复到另一个新库。

先只部署到 VERIFY。清除终端继承的连接变量，让命令读取本章的验证库配置。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL
npm run db:verify -- migrate deploy
npm run db:verify -- migrate status
npm run db:verify -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

### 数量对了，还要核对什么

留在 VERIFY 连接，先用两个样本 ID 查 captures，对照刚才保存的 ID、归属、原文、意图和创建时间。再在 capture_revisions 按这两个 capture_id 筛选，各应有一个第 1 版，原文和意图逐字一致，input_source 为 unknown，chunks 为 SQL NULL。

DBeaver 刷新 public → Tables，找到 `capture_revisions`，在 Properties 的 Columns、Constraints／Foreign Keys 和 Indexes 中核对列类型、联合唯一和 RESTRICT；在 ER Diagram 中同时选择 captures 与修订表，确认外键连向 captures.id。打开 Data 页按 capture_id 筛选，看同一记录的多版，不直接编辑历史网格。用 SQL 编辑器执行配套 `database/chapter-22/01-inspect.sql`，保存核对结果。

```sql
SELECT count(*) AS captures, count(r.id) AS initial_revisions,
       count(*) FILTER (WHERE r.id IS NULL) AS missing_initial
FROM public.captures c LEFT JOIN public.capture_revisions r
  ON r.capture_id = c.id AND r.revision_no = 1;

SELECT c.id FROM public.captures c LEFT JOIN public.capture_revisions r
  ON r.capture_id = c.id AND r.revision_no = 1
WHERE r.id IS NULL OR c.original_text IS DISTINCT FROM r.original_text
  OR c.chinese_intent IS DISTINCT FROM r.chinese_intent;
```

第一项要覆盖所有父记录，第二项要没有差异。总修订数等于 Capture 数，只在尚未追加其他版本时成立；之后要比较“第 1 版数量”，不能把正常新增版本误判成重复回填。另与迁移前导出核对 Capture 的全部旧字段，确认旧列确实没改；只比较两张已经改过的表，不能证明原值被保留。`migrate diff` 不覆盖所有 CHECK，仍用 `pg_get_constraintdef` 查看完整定义。

![DBeaver：修订表的外键与联合唯一约束](images/dbeaver-revision-constraints.jpg)

图中将 pg_constraint 筛选为外键和唯一约束：第一行把 capture_id 指向 captures.id，更新、删除均为 RESTRICT；第二行约束同一 capture_id 的 revision_no 不重复。它核对的是数据库现场定义，不是仅在 Prisma Schema 中写下的意图；CHECK 仍需另查。

要独立写出上面的核对 SQL，先不要统计。左边摆两张父记录卡片，右边摆甲的第一、二版。甲有两版、乙没有首版，总修订数恰好等于父记录数，可从乙的详情却无法给出任何内容。问题问的是“哪张卡片缺第一版”，所以上来要为每张父卡找其第一版，写连接条件时同时写父键和序号一。把甲二排除在匹配集合之外，乙仍作为左边的一行留下来。展开明细只有两行：甲和甲一，乙和空。再在明细上统计，数整行得二，数右边非空标识得一，专门数右边为空的行也得一。由明细推回统计就不会误以为两个裸的总数能证明覆盖。

如果把序号等于一挪到最外层 WHERE，乙那一行的序号是空，等于一这个判断得不到真，乙在统计前已经消失。结果只剩甲，看起来所有留下的素材都有第一版，正好藏起需要修的那一条。下面这组只读数据可以在任意本章编辑器原样执行。先看输出的明细，再把 SELECT 列换成前面的三项计数，最后只移动序号条件，比较哪一个数首先失真。这里以短名称模拟两类标识，不需要增删真实记录。

```sql
WITH parents(id) AS (VALUES ('甲'), ('乙')),
versions(id, parent_id, no) AS (
  VALUES ('甲一','甲',1), ('甲二','甲',2)
)
SELECT p.id AS parent_id, v.id AS first_id
FROM parents p LEFT JOIN versions v
  ON v.parent_id = p.id AND v.no = 1
ORDER BY p.id;
```

行找齐之后再比较值。甲的意图在旧行和首版都是空，两边缺值符合要求；若左边空右边却是“补过”，应当报差异。把两种情况都写成普通不等号，数据库遇空得到未知，WHERE 只保留为真的行，于是错误也被忽略。不要用“先把空都替成一个显示用字符串”来解这个问题，那个字符串本身也可能是某条合法输入。拿 `IS DISTINCT FROM` 说清空对空相等、空对有值不同，比较结果就只剩明确的两种。还要把右边标识是否为空单独判断，因为即使两侧意图同为空，也不能说明乙真有一版可供比较。

能跑出零差异后，再去审视核对查询本身依赖什么。假如错误的脚本先裁剪父行原文，再从裁剪后的父行拷贝第一版，两边现在完全相同，前面的差异查询仍为零。这是为何要和停写时另存的原始结果按同一个标识再比较一次。相反，若导出内容完好、两张表也一致，但查询应用详情显示另一段文字，应查运行程序实际使用的数据库和读取字段，而非再跑回填。把证据按导出、父行、首版、响应逐段连接，可以具体说出第一对不相等出现在什么地方，避免从最后一项失败直接跳到重做整库迁移。

把上述观察用于 VERIFY 后，它应能交出三个互不代替的结果：旧记录没有失去原值，每条旧记录都获得了自己的首版，新增表具有让后续写路径成立的键与检查。切换日常库要重新在它自身做同样判断，不能把验证库的那两个样本标识当作日常库也必有的业务数据。若日常库的素材更多，覆盖与差异查询继续适用于全集，人工核对则优先选择已导出的、能辨认空意图和非空意图的真实旧标识。下一节再新建虚构样本练写入，旧行此时只用于读回。这种分工让开发者随时能说明某一行来自回填还是本章的新建操作。

只有 VERIFY 的迁移状态、结构差异和旧行核对都通过，再升级已停写的 DEV。随后在 DBeaver 切回 DEV，重复上面的覆盖数、字段和约束检查，用本节开头保存的 DEV 导出逐行对照。

```bash
unset DATABASE_URL SHADOW_DATABASE_URL
npm run db -- migrate deploy
npm run db -- migrate status
npm run db -- migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
npm run prisma:generate
npm run check
```

迁移失败时先看第一个错误。等锁超时就找到持锁事务，由原操作方结束；字段约束失败则定位原行和规则，不能删掉原行只为让迁移通过。此迁移显式 BEGIN，连接退出后应回滚，但仍核对 `to_regclass('public.capture_revisions')` 和失败历史再处理。确认所有动作已回滚、根因已处理后，用实际迁移名执行 `migrate resolve --rolled-back`，再 deploy。它只登记失败尝试的处理，不负责撤销 SQL。成功迁移不再编辑文件；后续发现业务差异用追加修复处理。

这里可以暂停：结构和回填已完成、写入仍关闭。记下两个库的迁移状态和核对结果。下次先确认有没有旧写入口复活，再继续切换；不要先启动第二十四章服务“临时用一下”。

## 25.4 追加修订，并让所有读路径理解最新内容

迁移只解决旧数据起点，运行代码还需要同时改变创建、修改、读取和接口边界。完成分支是 `part-04/chapter-25`；先从同时写入素材和第一个修订的创建请求开始。

### 先把完整快照变成明确的请求契约

新增 `POST /captures/:id/revisions`，接收完整内容，返回本次保存的修订，成功状态 201。新增 `GET /captures/:id/revisions`，按序号倒序读取历史。已有创建、详情、列表与 PATCH 保留路径和响应形状。详情中的 `id`、`createdAt` 始终来自 Capture；原文和意图来自最新修订。需要修订 ID、序号和修订时间时查询历史。

`src/capture-revision.ts` 定义存储与服务共同使用的结果形状：

```ts
export type InputChunk = { text: string };
export type RevisionContent = {
  originalText: string;
  chineseIntent: string | null;
  inputSource: 'manual' | 'unknown';
  chunks: InputChunk[] | null;
};
export type CaptureRevision = RevisionContent & {
  id: string;
  captureId: string;
  revisionNo: number;
  createdAt: string;
};
export type RevisionPage = { items: CaptureRevision[]; nextBefore: number | null };
```

写入 Schema 不允许客户端提交 `unknown` 冒充迁移历史，也不允许指定 revisionNo、ID 和 createdAt。已有 `OriginalTextSchema`、`ChineseIntentSchema` 的规则复用，意图必须显式提供，保留 null 的语义。新增接口拒绝未知字段，避免拼错字段却被静默忽略；旧创建／PATCH 保留原有“忽略额外字段”的兼容约定：

```ts
export const ChunkSchema = z.object({
  text: z.string().refine(isPostgresText).regex(/\S/).max(200),
}).strict();
export const ChunksSchema = z.array(ChunkSchema).max(25).nullable();
export const AppendRevisionSchema = z.object({
  originalText: OriginalTextSchema,
  chineseIntent: ChineseIntentSchema.nullable(),
  inputSource: z.literal('manual').optional(),
  chunks: ChunksSchema.optional(),
}).strict();
```

Controller 的 SchemaPipe 提供字段级 400，Service 再通过同一 Schema 检查非 HTTP 调用。`appendRevision` 把省略的来源变为 manual、chunks 变为 null，调用 Store；父记录不存在则沿用 `CaptureNotFoundError`。响应 Schema 明确列出修订字段、允许读取 unknown、约束序号为正整数且不超过 PostgreSQL integer 上限，日期转成 ISO 字符串。查询历史与写入响应都挂上 ResponseSchemaInterceptor，不直接把 ORM 关系对象透传给外部。

`src/capture-contract.ts` 接着增加输出和查询 Schema，不能只声明 TypeScript 类型就认为外部值已经验证：

```ts
export const RevisionResponseSchema = z.object({
  id: z.uuid(), captureId: z.uuid(),
  revisionNo: z.number().int().positive().max(2147483647),
  originalText: OriginalTextSchema,
  chineseIntent: StoredChineseIntentSchema.nullable(),
  inputSource: z.enum(['manual', 'unknown']), chunks: ChunksSchema,
  createdAt: z.iso.datetime(),
});
export const RevisionPageSchema = z.object({
  items: z.array(RevisionResponseSchema),
  nextBefore: z.number().int().positive().nullable(),
});
export const RevisionQuerySchema = z.object({
  before: z.string().regex(/^[1-9]\d{0,9}$/)
    .refine(v => Number(v) <= 2147483647).optional(),
  limit: z.string().regex(/^(?:[1-9]\d?|100)$/).optional(),
}).strict();
```

Service 的新写入方法先完整解析，再给省略字段赋予含义，不从旧列拼出半份快照：

```ts
async appendRevision(id: string, input: unknown): Promise<CaptureRevision> {
  const parsed = AppendRevisionSchema.safeParse(input);
  if (!parsed.success) throw new InvalidCaptureError('Invalid revision content');
  const content = { ...parsed.data, inputSource: 'manual' as const,
    chunks: parsed.data.chunks ?? null };
  const revision = await this.store.appendRevision(id, content);
  if (!revision) throw new CaptureNotFoundError('Capture not found');
  return revision;
}
```

CaptureStore 增加两个方法，既有方法保持名称：

```ts
appendRevision(id: string, content: RevisionContent): Promise<CaptureRevision | undefined>;
revisions(id: string, before: number | undefined, take: number): Promise<CaptureRevision[] | undefined>;
```

ObservedCaptureStore 对这两个方法继续使用已有 `call()` 包装，保留工作追踪、耗时和安全日志；MemoryCaptureStore 也改成保存快照并返回深拷贝，避免章节里的手动组装示例失去同一契约。内存实现不能证明数据库并发正确，但接口变更后也不能留下一个没有历史的假替代实现。

前端填表时可以先把“屏幕没显示”和“希望保存为空”分开。比如这次只显示原文与意图，没有编辑片段的控件。如果走完整追加，省略 chunks 会得到未提供片段的新快照；服务不会因为界面没显示控件就自动拷贝上一版。若产品希望完整编辑保留已有片段，页面必须先读到要编辑的那一版，把希望保留的数组纳入请求。旧的修改意图动作有另一条契约，读取上一版并继承原文、来源与片段。选择哪个动作应该在组装请求时就决定，而非期待服务从哪几个属性恰好丢失来猜页面意图。

按一组具体值检验判断。上一版有原文甲、意图一、来源未知和一个片段；现在一个操作者只想清空意图。走旧 PATCH，下一版应仍为甲、空、未知、原片段。走完整追加，明确提交甲和空，未提供来源与片段，则应是甲、空、手工、新版片段为空值。两份结果的详情只展示原文与意图，表面上可能没有差别，要看历史中的来源与片段才能辨认。若两条路径只用详情作断言，就可能把一个错误地清掉片段的 PATCH 当成正常。设计验收样本时，让此前存在的附加内容有机会被误清除，比从一份所有可选字段都为空的样本开始更有区分力。

也可以从响应端反查请求类型。拿到的对象若包含版号和该版来源，应去历史里找相同的修订标识；若只见素材标识、原文、意图和最初创建时间，则是素材视图，需要另取历史才能对到刚产生的版。即使两个视图的原文完全相同，也不能把第一个响应的标识写到“素材详情”的集合变量里。尤其是回填行两类标识恰好相等，在它上面误用变量有时还能读通，等换到正常新建的素材就会失败。先用一条新建素材练区分身份，再拿旧素材比较回填的特殊映射，能较早发现这个偶然相等带来的错觉。

### 创建记录时，不能留下没有第 1 版的父行

如果先 `capture.create()`，再独立 `captureRevision.create()`，第二步失败会留下空壳 Capture。新建路径使用 Prisma 的关系嵌套写入，让父行和第 1 版一起成功或一起失败：

```ts
await this.database.run('insert', () => this.database.client.capture.create({
  data: { id: capture.id, userId: DEVELOPMENT_USER_ID,
    originalText: capture.originalText, chineseIntent: capture.chineseIntent,
    createdAt: new Date(capture.createdAt),
    revisions: { create: { id: randomUUID(), revisionNo: 1,
      originalText: capture.originalText, chineseIntent: capture.chineseIntent,
      inputSource: 'manual', chunks: Prisma.DbNull,
      createdAt: new Date(capture.createdAt) } } },
  select: { id: true },
}));
```

嵌套写入是 Prisma 提供的事务能力，不是两条普通 await 恰好写在一起。原子性在这里负责这个已知的创建动作，第二十七章再从采纳需求展开多次业务写入、隔离与失败。创建时旧列保存初始副本，之后不更新；原有 `POST /captures` 不接收 chunks，需要带 chunks 的完整快照走追加接口。

应用启动还要检查新表的列存在，并查询是否有 `revisions: { none: {} }` 的 Capture。发现空壳时拒绝就绪，先调查迁移或绕过应用的写入，不能一边记录 database.ready 一边让列表悄悄漏掉数据。这个启动检查不替代写入不变量，也不防止管理员在启动后删除历史。

把初次创建的两次数据变化也放到时间线上看。给用户返回素材以前，库里要同时有一张带归属的父行和一张可按号读取的首版。若拆成两笔分别提交的调用，即使代码中紧挨着写两个 await，第一笔完成后第二笔仍可能失败。随后列表按当前修订联接，刚出现的素材反倒不在列表里；用户再创建一次会另得一个标识，库里却留着先前的空壳。两个 await 保证这个函数先后等待，不保证两次提交一起成败。嵌套创建把这两个紧密依赖的事实交给同一次数据库操作，失败时不对其他读者展示只有父行的半个结果。

反方向也要核对，数据库提交完成以后，响应发送仍在事务之外。若 Postman 明确收到成功，先按返回素材标识读历史，确认只有首版且内容与创建一致；若请求结果不明，则没有可靠理由仅凭界面仍空就再点一次。特别是只有新建时，父行原文和首版原文按设计相同，可以借核对归属、两个标识、序号和创建时刻把“数据库只写了旧列”和“新建时确实写入首版”区分开来。等下一次追加导致两处内容不同时，又用同一个素材标识检查父行仍存在、当前视图已换成修订内容。把连续两次观察配在一起，就同时验证了创建起点和后续读取切换。

### 用一条追加语句连接“从哪一版继续”和“插入什么”

追加只写修订表，不更新 Capture 或当前指针。先根据父记录 ID 与固定用户选中一条记录，再取得其最大序号，然后插入加一后的快照。不要让客户端给序号，也不要在 JS 内先查最大值、隔很久再拼接 SQL。

`src/prisma-capture.store.ts` 的共享私有方法 `writeRevision` 同时服务新 POST 和旧 PATCH。它把完整输入与“只改意图”区分开，动态选择固定的 SQL 片段；用户的实际字符串仍全部参数化：

```ts
const full = 'originalText' in change;
const original = full ? Prisma.sql`${change.originalText}::text` : Prisma.sql`original_text`;
const source = full ? Prisma.sql`${change.inputSource}::text` : Prisma.sql`input_source`;
const chunks = full
  ? Prisma.sql`${change.chunks === null ? null : JSON.stringify(change.chunks)}::jsonb`
  : Prisma.sql`chunks`;
```

完整请求插入提交的内容；PATCH 的三个固定列引用从数据库读到的上一版继承。读下面这条 SQL 时，可以先看两个名字。`WITH` 给同一条语句里的中间结果起名。先看 `previous`，它为这条输入找出上一版；其中 `LATERAL` 让右边的小查询能用左边当前输入的 ID。再看 `inserted`，它用 `RETURNING` 取回这次真正插入的行。最后的 SELECT 把两份结果放在一起，应用据此判断本次追加是否成功。`revisionColumns` 列出返回给应用的修订字段。

```ts
const revisionColumns = Prisma.sql`r.id, r.capture_id AS "captureId", r.revision_no AS "revisionNo",
  r.original_text AS "originalText", r.chinese_intent AS "chineseIntent",
  r.input_source AS "inputSource", r.chunks, r.created_at AS "createdAt"`;

const statement = Prisma.sql`
  WITH previous AS (
    SELECT c.id AS capture_id, c.created_at AS parent_created_at, latest.*
    FROM public.captures c
    LEFT JOIN LATERAL (
      SELECT revision_no, original_text, chinese_intent, input_source, chunks
      FROM public.capture_revisions WHERE capture_id = c.id
      ORDER BY revision_no DESC LIMIT 1
    ) latest ON true
    WHERE c.id = ${id}::uuid AND c.user_id = ${DEVELOPMENT_USER_ID}::uuid
  ), inserted AS (
    INSERT INTO public.capture_revisions
      (id, capture_id, revision_no, original_text, chinese_intent, input_source, chunks)
    SELECT ${randomUUID()}::uuid, capture_id, revision_no + 1, ${original},
      ${change.chineseIntent}::text, ${source}, ${chunks}
    FROM previous WHERE revision_no IS NOT NULL
    ON CONFLICT (capture_id, revision_no) DO NOTHING
    RETURNING *
  )
  SELECT p.parent_created_at AS "parentCreatedAt", p.revision_no AS "previousNo", ${revisionColumns}
  FROM previous p LEFT JOIN inserted r ON true
`;
```

为最后 SELECT 的结果明确类型，再执行 statement。左连接的 id 可能为 null，必须先经过下面的结果分支才能把其他修订字段当作真实内容；泛型只是 TypeScript 声明，不替代数据库约束与公开响应校验：

```ts
type AppendRow = Omit<CaptureRevision, 'id' | 'createdAt'> & {
  id: string | null;
  createdAt: Date;
  parentCreatedAt: Date;
  previousNo: number | null;
};
const rows = await this.database.run('appendRevision', () =>
  this.database.client.$queryRaw<AppendRow[]>(statement));
```

SQL 时间返回 Date，分别用 `toISOString()` 转成公开字符串。配套源码把 statement 直接写在同一 `$queryRaw` 调用内，参数化行为相同。

数据库在这一条语句里为每条父记录选取最多一版。这里左连接保留“父记录存在但没有修订”的异常状态。previous 是本条语句看到的前提，inserted 是实际插入的结果；读取新行使用 RETURNING 输出，不再从基础表重查、期待同一语句的其他部分看见自己的写入。

真正防止同一记录出现两个第 3 版的是联合唯一约束。两条语句都可能看到第 2 版并尝试插入 3；把查询和写入写在同一个 SQL 文本里，并没有自动给整个业务排队。`ON CONFLICT (capture_id, revision_no) DO NOTHING` 只跳过这个已明确的冲突，不覆盖对方的内容，也不把所有错误都吞掉。

结果的三种空值需要分别解释。方法先验证 ID 是规范的小写 UUID；非法或未命中的 ID 返回 undefined。查询有父行但 previousNo 是 null，属于历史不变量损坏，返回内部存储失败。previousNo 存在而新修订 id 是 null，表示序号竞争，没有插入本次内容：

```ts
const row = rows[0];
if (!row) return undefined;
if (row.previousNo === null) throw new StorageFailureError();
if (row.id === null) throw new RevisionConflictError();
```

这些判断在 `database.run` 返回之后做，避免业务冲突被数据库通用错误包装成 500。新增 `RevisionConflictError` 在 `httpFailure` 映射为 409／`REVISION_CONFLICT`。HTTP 调用方先重新读取内容，再决定重新提交；服务端不自动重试完整快照，因为用户可能仍基于过期页面编辑。发生等锁或连接超时仍沿用 503，未知写入结果继续先查事实，不以自动重发制造重复版本。

成功时用返回行组装两种结果：新 POST 得到修订对象；旧 PATCH 得到 `{ id, originalText, chineseIntent, createdAt }`，其中 createdAt 使用 parentCreatedAt。不要在插入后再 GET 最新一版作为“本次返回值”：另一请求可能已经追加下一版，客户端会误以为自己提交的是别人刚保存的内容。

先把写入语句改读成几张只有一行的小结果，能自己解释为何要在最后使用外连接。第一张回答“有这条属于当前用户的素材吗，它目前最高的修订是多少”。素材不存在时没有结果，存在却无修订时有父行但前版字段全空。把后一种情况也当作普通不存在，会让调用者以为自己记错地址，实际却是新服务读到了违反迁移前提的数据。反过来，遇到这种情况直接把下一号算成一，也会把损坏悄悄变成一条貌似正常的新首版。写路径因此需要保留父行，同时让前版缺失在写入前变成可辨认的状态。

第二张回答“在刚才这份前版的基础上，这次究竟插入了什么”。只有第一张有前版时才生成待插入行，新号是在同一素材内部把前一号加一。完整追加从传入值取原文与附加字段；修改意图则用库里前一行的列，给意图代入参数。这里若把“使用上一版列”写成一个内容为列名的字符串参数，数据库接到的将是那几个字母，而非当前行的值。因此配套在代码里选择事先确定的列引用或参数表达式，用户给出的原文始终按值传递。要看懂查询构造器生成的语句，先问每个位置需要的是数据库列、固定结构还是本次的值，不能只看最后都放进同一段 SQL 文本。

最后一张把第一张和第二张对在一起。假设正常更新丙，前版为七，查询结果应当同时看到七和八，还有本次新修订的标识。若此号已被另一次成功写入占走，前版行还在，插入返回关系却没有行，左连接在新标识一侧补空。由此可返回明确的争用结果，而不是把占号的另一份内容当成本次写入结果。若直接从修订表另查最大号，恰好也可能看到八，然而那一行未必代表自己刚提交的内容。用 RETURNING 把“由我这次插入产生的行”传到最后一步，才不必从全表现状猜这是谁的成果。

这张判断表可以倒着用来排查调试器。结果数组长度为零，要检查的是素材身份和用户条件；有第一行但前版为空，要查首版覆盖；前版存在但新标识为空，才检查复合键的争用；新标识存在而客户端仍没收到成功，应往投影、输出和连接方向看。别从某个可空的字段判断插入是否成功，合法的修订本来就允许空意图。也不要在尚未从数据库调用返回时就解释局部变量，等待锁、等待可用连接和已经确定冲突处在不同阶段。这些条件之所以能分清，是因为结果保留了可证明存在性的非空身份列。

给争用再换一个条件。两个合作编辑者几乎同时准备在第四版上保存，若两个语句都先看到四，都提议写五，唯一约束只准一个五留下。另一方可能在等对方决定期间还没有拿到最终结果；若占号者回滚，空出来的位置仍有可能由等待者写入。若占号者已提交，另一个语句按冲突分支结束。若等待先超时，程序手上的事实又不同，尚不能把超时解释为对方肯定成功。换成第二个请求到达时第一笔已完成，后者看到的起点就是五，便可能顺利写出六。要区别这些结果，应该问“各语句在取前版时能看到哪一版”，而不是仅凭两个操作者说“我们同时点了按钮”判断数据库一定报错。

### 详情、列表和搜索必须一起切换

详情用 Prisma 读取父记录的 id、createdAt，再选择 `revisions: { orderBy: { revisionNo: 'desc' }, take: 1 }` 的内容。明确投影，不展开旧 originalText/chineseIntent，否则极容易让旧字段覆盖新值。

列表使用相同的“先选最新，再筛选”语义，保留原来的 Capture 创建时间和 ID 升序。下面展示无搜索条件时的核心 SQL，配套实现用 Prisma.sql 参数化用户和 q，原来的 limit 在筛选与排序之后应用：

```sql
SELECT c.id, c.created_at, r.original_text, r.chinese_intent
FROM public.captures c
JOIN LATERAL (
  SELECT original_text, chinese_intent FROM public.capture_revisions
  WHERE capture_id = c.id ORDER BY revision_no DESC LIMIT 1
) r ON true
WHERE c.user_id = '10000000-0000-4000-8000-000000000001'::uuid
ORDER BY c.created_at, c.id;
```

这里使用 `src/database-config.ts` 的固定开发用户 ID；若调整过演示身份，就一起替换。不能因为 SQL 返回零行就判断迁移失败。q 在外层用 `strpos(r.original_text COLLATE "C", 参数) > 0` 判断最新原文，不搜索历史。如果把这个条件放进 LATERAL 内部，含义就变成“找最新一条曾经匹配 q 的历史”，旧词即使已经改掉也会命中。配套 `03-content-choice.sql` 用只读 VALUES 对照这两种问题，直接在 DBeaver 运行即可。

普通 `captures JOIN capture_revisions` 得到一行一版，用于历史；加上每个父记录取一版，才得到一行一条 Capture。不能先随意 JOIN 再全局 LIMIT 20，否则同一记录的 20 个版本可能占满列表。这是第十九章结果粒度问题在新关系中的继续应用。

### 历史要能完整读完，又不能一次返回无限版本

历史默认取 20 条，最多 100 条，倒序排列。请求允许 `before`，表示只取小于该序号的版本。例如第一页得到 6、5，下一页带 `before=5`，得到 4、3。它只在同一条 Capture 内使用，序号不变，追加 7 不会让第二页重复 5。

这是一种范围分页，本章先为历史提供必要的有界入口；第三十三章再完整展开跨记录排序、Cursor、条件绑定与时间问题。这里不需要对一个序号做签名来证明权限，权限来自每次查询父记录的用户条件。修改 before 最多改变浏览范围，不能越过归属条件。

Service 请求 `limit + 1` 条，多取的一条用于判断是否还有历史：

```ts
const rows = await this.store.revisions(id, before, limit + 1);
if (!rows) throw new CaptureNotFoundError('Capture not found');
const items = rows.slice(0, limit);
return { items, nextBefore: rows.length > limit ? items.at(-1)!.revisionNo : null };
```

参数先经过严格 Schema：before 为正十进制整数字符串且不超过 2147483647，limit 为 1～100，拒绝重复参数、未知键、小数、负数和前导零；Service 同样检查数字形状。Store 先按 ID 与用户选父记录，再嵌套读取满足 revisionNo 条件的历史，倒序 take。已有记录没有更早版本返回 200 和空数组；父记录不存在返回 404，两者不能混为一谈。以后若允许维护操作删除历史，范围分页仍可跨过空号，但历史完整性的承诺需要重新设计。

自己写历史页时，先用四张卡片演算服务和客户端各自要留什么值。最高号从六、五、四到三，每页两条。数据库若只取六和五，服务还不知道五下面有没有四；多取一条，发现四就足以确定还有下一页。对外展示六和五，续读边界记五。若误记多取的四，再用“小于四”取下一页，四会直接被跳过；若边界用五却用“小于等于五”，五会重新出现。这个边界属于刚刚展示的最后一条，与猜测下一页将出现的第一条不同。到只有四和三那一页，没有多取到第三条，服务即可返回空续读标记，客户端不需要另发一次空页才能知道结束。

把条件换成只有六与四，没有五，上一段依然成立。边界是严格比较已有号，不要求下一条的序号恰好小一。再假设客户端已拿到六和五，另一窗口在它续读前新建了七。续读仍以五为界，下一页只会读到小于五的版本，不会因为顶部插入七就把以前显示的五挤到第二页。若读者想看七，应重新从没有边界的第一页读。这个效果依赖本章成功写入只向更大号追加，历史没有编辑和删除入口；它没有让前后两次 HTTP 读取共享同一个数据库事务。把操作先后写清，才能判断这类翻页在当前需求下提供了哪种稳定性。

还有一种很像错误的结果是请求一个合法边界，却收到空列表。先确认目标素材本身存在，再看前面是否还有比该边界更小的序号。例如用一作边界，所有实际序号都至少为一，这一页应为空；若素材根本不在作用范围，连作为入口的父行都不存在，应返回找不到。若只查子表再把“取到零行”一概翻译成找不到，这两个用户动作就被混为一谈。配套从限定归属的父记录出发，子集合附上分页条件，正是为了让父对象的存在性与这页有多少子项分别保留。

在 DBeaver 写与 HTTP 对照的只读版本时，不必先实现分页控件。先给同一素材列出序号、修订标识和原文，按号降序排；再加严格边界；最后给当前页长加一，核对最后一条是只供探测还是应展示。例如眼前只有三、二、一且每页两条，第一次实际可以取得三行，展示两行。将二代回边界后只余一行，再无下一页。若网格与响应顺序相反，先看 SQL 是否沿用前面展示演变过程用的升序；若数量多一，先看自己是不是忘了去掉探测行。这两个差异都可由读取算法解释，不是数据库又生成了一版。

### 接上框架入口，再观察实际行为

Controller 增加 `@Post(':id/revisions')` 与 `@Get(':id/revisions')`，分别使用上述输入／查询 SchemaPipe 和响应 Interceptor；Nest 的 POST 默认成功状态为 201。`src/http-boundary.ts` 也必须接纳 `/captures/一个路径段/revisions` 的 GET、POST，否则请求在到 Controller 前就会被原有边界拦成 404。其他方法继续返回 405 和正确 Allow；含百分号的非字面 ID 路径沿用 404 语义。Body 解析继续经过 16 KiB、Content-Type 与 UTF-8 检查，不能为新接口绕开原有入口。

在 `src/captures.controller.ts` 中导入新增 Schema、`AppendRevisionInput` 和 `z` 类型，然后将下面两个方法加入原 Controller。保留原有四个方法：

```ts
@Post(':id/revisions')
@UseInterceptors(new ResponseSchemaInterceptor(RevisionResponseSchema))
appendRevision(
  @Param('id') id: string,
  @Body(new SchemaPipe(AppendRevisionSchema)) input: AppendRevisionInput,
) { return this.captures.appendRevision(id, input); }

@Get(':id/revisions')
@UseInterceptors(new ResponseSchemaInterceptor(RevisionPageSchema))
revisions(
  @Param('id') id: string,
  @Query(new SchemaPipe(RevisionQuerySchema)) query: z.infer<typeof RevisionQuerySchema>,
) {
  return this.captures.revisions(id,
    query.before === undefined ? undefined : Number(query.before),
    query.limit === undefined ? 20 : Number(query.limit));
}
```

`AppendRevisionInput` 在契约文件用 `z.infer<typeof AppendRevisionSchema>` 导出。边界文件在原 `detail` 匹配之后增加路径匹配，再调整 allowed；原百分号检查也扩展到这条新路径，其他错误处理不改：

```ts
const revisions = /^\/captures\/([^/]+)\/revisions$/.exec(url.pathname);
const allowed = url.pathname === '/captures' ? ['GET', 'POST']
  : detail ? ['GET', 'PATCH'] : revisions ? ['GET', 'POST'] : undefined;
// 保留原有 allowed 未命中与不支持方法的处理，然后检查字面 ID。
if ((detail?.[1] ?? revisions?.[1])?.includes('%')) {
  throw new HttpError(404, 'Capture not found', 'CAPTURE_NOT_FOUND');
}
```

`src/openapi.ts` 同步两个路径、输入／响应组件、历史参数和 PATCH 的新语义，版本改为 0.6.0，列出 409；既有 503 提醒改为“重试可能追加重复快照”。文档不只多两个 URL，还必须撤掉“没有修订历史”的旧描述。开发文档默认开，生产仍默认关。`src/request-observation.ts` 同步识别新路径，日志只记录固定标签 `/captures/:id/revisions`，不记录真实 ID、查询值或内容。

完成上述改动再 `npm run check`，随后 `npm run dev`；VS Code 继续使用已有 attach 配置，源码保存后自动编译并重启。数据库不会因重启清空，创建请求也不会自动重放。

Postman Import 本章 `requests/chapter-22.postman_collection.json`，确认集合 Variables 中的 baseUrl 指向当前服务。桌面版若处于 Local mode，可以从 Import 导入集合 JSON，再在 Local Items → Collections 中打开本章集合；直接浏览本地目录时出现的“Upgrade to v3”提示是另一条文件升级路径，不必为跟做本章批量转换旧章节集合。下面按请求名称逐项手动发送。

1. “01 新建本章演示记录”返回 201，集合脚本只在成功时保存 captureId，不发送下一条请求。打开 Variables 核对这个 ID，再发“02 初始修订”，看到第 1 版、manual 和 chunks:null。
2. “03 追加完整修订”发送新的原文、意图和一个 chunk，应返回第 2 版。发“04 详情”，ID 和 Capture 创建时间保持，原文与意图来自第 2 版。

   ![Postman 追加完整快照：请求正文及 201 返回的第 2 版](images/postman-append-revision.jpg)

   上半区是发出的完整快照，下半区是实际响应。这里的 `id` 是这次新建的修订 ID，`captureId` 才是原记录 ID；`revisionNo:2`、`inputSource:"manual"` 和 chunks 应与本次写入对应。不要把修订的 createdAt 当成 Capture 最初的创建时间。

3. “05 旧 PATCH 清空意图并追加”返回 200。历史增加第 3 版，原文、来源和 chunks 继承第 2 版，意图为 null；前两版仍在，不被清空。

   ![Postman 旧 PATCH 显式传 null，响应保留记录身份和原创建时间](images/postman-patch-clear-intent.jpg)

   这里仍返回兼容的 Capture 响应，因此 `id` 是记录 ID，且没有 revisionNo。看到 `chineseIntent:null` 只能确认当前内容已经清空；是否保留旧版，要继续查询历史，不能只靠这次 200 判断。

4. “06 历史第一页”用 limit=2，应看到 3、2。把响应 nextBefore 填进集合 before，再发“07 继续历史”，看到第 1 版及 nextBefore:null。不要写死示例序号：重复点过发送，当前最大号会不同。

   ![Postman 用 before 继续历史：第 1 版仍在，nextBefore 为 null](images/postman-history-next-page.jpg)

   本次 Variables 中 before 的值为 2，地址栏保留 `{{before}}` 引用。返回的第 1 版仍是最初的 “I am not much of cook.” 和原意图，说明清空最新意图没有回头修改这版。nextBefore 为 null 表示这次查询范围内没有更早的一页。

5. 依次发送缺失意图、空白原文、非法 chunks、非法历史参数和未知字段，观察 400；不存在的 ID 返回 404。

   ![Postman 缺失 chineseIntent 返回 400，issues 指向缺失字段](images/postman-reject-missing-intent.jpg)

   图中只提供 originalText，`issues.path` 指向 chineseIntent。完整修订要求显式表达意图：没有意图应传 null，漏字段则拒绝。旧 PATCH 只提交意图，原文、来源和 chunks 从上一版继承；意图本身仍必填，传 null 才表示清空。两种入口都不能用省略意图代替明确决定。

   失败请求之后重新发送“02 初始修订”，同一个 GET 在三版样本中一页就能显示全部历史；若已有更多版本，按 nextBefore 续读。展开响应筛选功能，输入 JSONPath `$.items[*].revisionNo`，可以只看序号：

   ![Postman 失败后重新读取历史，响应筛选显示 3、2、1](images/postman-history-after-rejections.jpg)

   这是 Postman 对已收到响应的显示筛选，不是服务端新参数，也没有修改响应数据。这里只有 3、2、1，没有第 4 版；关闭筛选可以恢复完整快照。失败状态与重新读取的历史共同核对，才能确认本次失败没有追加。

6. 发送“11 原文旧关键词不再匹配”。本章这条记录应从旧关键词搜索中消失，其他原本匹配的记录不受影响。

   ![Postman 搜索旧原文中的 of cook.，当前示例返回空列表](images/postman-search-latest-only.jpg)

   图中的 `q=of%20cook.` 对应原文片段 `of cook.`，不是搜索中文意图。它仍存在于第 1 版，但最新原文已经改为 “Cooking is not my strength.”，因此本条记录不再命中。示例返回空列表；若自己的库有其他最新原文匹配，应按 captureId 判断本章记录是否消失，不能要求所有人的 items 都为空。

把一条迁移前已存在的 ID 填到集合 captureId，只发 GET 历史，核对第 1 版 unknown、chunks:null 和迁移时保存的内容；不要把失败实验对准旧业务记录。Postman 的 01 会把变量切换到新记录，继续操作前核对目标。

开发文档也能核对同一契约：打开 `/docs`，展开 `GET /captures/{id}/revisions`，点 Try it out，填入演示记录 ID。下面用 `before=4&limit=2` 固定查看第 3、2 版；即使已经继续追加，也能回看这一段历史。请求仍发往当前服务，端口以自己的 baseUrl 为准。

![Swagger 实际历史响应：第 3 版意图为空，第 2 版仍保留原意图](images/swagger-revision-history.jpg)

观察 Server response 中实际返回的 200 和 Response body，不要把下方自动生成的 Example Value 当成数据库内容。两版的 captureId 相同、修订 id 不同；第 3 版清空意图，没有改写第 2 版。继续浏览时把响应的 nextBefore 作为下一次 before；本次为 2，下一页才会读到第 1 版。

DBeaver 的历史 JOIN 查询要能对应每次成功响应的 captureId、修订响应中的 id、revisionNo 和内容。下面先按同一 capture_id 查看三版内容，再对照父表旧列与最新修订。查询里的 UUID 换成自己的演示记录 ID。

![DBeaver：同一记录保留第 1、2、3 版内容](images/dbeaver-revision-history.jpg)

这里按 revision_no 升序显示，与 HTTP 历史接口的降序相反。第 2 版改变原文和意图，第 3 版只清空意图；旧版没有被覆盖。input_source 都是 manual，因为这条记录在新接口建立后手工创建；迁移回填的旧记录应为 unknown，不能混为一类。

![DBeaver：父表旧原文与第 3 版最新内容不同](images/dbeaver-legacy-and-latest.jpg)

legacy_original 来自 captures，latest_original 来自修订表。结合前面的 GET 响应，才能确认应用已切换到修订读取；单独看到两列不同，只能证明数据库中保存了两份不同内容。这里按单个记录排序并 LIMIT 1；列表查询仍须使用前面“每条记录先选最新版”的写法。

在约束实验前先查询 count(*)、min(revision_no)、max(revision_no)，保存本次基线。下面示例分别是 3、1、3。

配套 `02-constraints.sql` 对本章虚构记录复制第 1 版序号。先单独执行 BEGIN，再执行 INSERT；应触发 23505，并显示联合唯一约束名。

![DBeaver：复制第 1 版触发 23505 与联合唯一约束](images/dbeaver-duplicate-revision.jpg)

错误明细中的键是 (capture_id, revision_no)，不是新生成的修订 id。INSERT 0 0 只是占位 ID 没命中，不能当作约束已经起效。失败后单独执行 ROLLBACK，再执行基线查询，数量与首末序号应保持；还要重新读三版内容，不能仅从错误响应推断数据状态。

![DBeaver：失败实验结束后重新查询，仍为三版](images/dbeaver-revision-count-after-rejection.jpg)

这里重新执行了同一 ID 的统计，revisions、first_no、latest_no 仍为 3、1、3，与实验前基线一致。它证明该记录的版本数量与首末序号保持；每版内容是否保持仍用上面的历史查询逐项对照。

调试断点放在 Service.appendRevision、Store.writeRevision 中数据库调用前后、ResponseSchemaInterceptor.parse。前置 Schema 拒绝时写入断点不命中；数据库返回后 id 为空才是序号冲突，不能把所有 400 或 500 都叫并发问题。检查 SQL 参数只使用虚构内容，不把原文和 chunks 加入常态日志。断点暂停会改变并发时序和超时，不能拿暂停时的耗时作性能结论。

例如，另建一条虚构记录，在 `writeRevision` 的 `if (row.id === null)` 行设断点，再发送完整修订请求。Watch 分别添加 `row.previousNo`、`row.revisionNo` 和 `row.id !== null`：

![VS Code：追加返回后，旧序号为 1、新序号为 2，修订 ID 非空](images/vscode-revision-result.jpg)

黄色行表示即将执行判断，不表示已经抛出冲突。此处 SQL 已返回，三个观察值分别为 1、2、true，说明本次成功追加；F5 继续后客户端才收到 201。若 previousNo 存在而 id 为 null，才走序号冲突分支。此图使用独立调试记录，不向前面的三版记录继续追加；实验后断开调试器，避免遗留暂停影响后续请求。

这组观察还有一个不依赖截图中具体数字的核对方法。把创建、追加、清空三次成功请求各写成一行，分别填“本次接受了哪种输入”“响应的标识属于谁”“哪一行应当新增”。第一次新增一个素材和首版，但对外响应仍只给素材；第二次只增加修订，直接得到修订身份；第三次也只增加修订，对外却继续返回素材。从这些条件能推出一个可用的对账式：同一素材在实验前后，父行总数没有因后两次操作再增加，修订数相对首版增加二，最新修订的原文等于第二次提交的原文。假如数据库结果变成三条父行各一版，三个响应都可能看起来像成功，实际是调用方每次都走了新建入口。

若观测差一版，不要立刻把请求再发一遍。先看 Postman 当前选中的集合变量值，再对照每次成功响应中实际返回的素材身份。创建新演示记录会更新变量，而另一个标签页还可能显示旧响应；同一请求名称并不能证明两次发送访问了同一条素材。然后检查历史是否只展示了第一页，续读边界是否已用到另一个素材上。最后在 DBeaver 用刚确认过的素材标识重跑全历史明细。若网格行数完整、HTTP 页少一条，可能是分页显示；若 HTTP 与库一致，记录却比预期多一版，要查是否有一次重复提交也成功。暂时隐藏某行或按原文去重会让这些差异消失，却无法说明真实执行过哪几次动作。

换一个与图不同的正常输入检验继承。完整追加时把片段显式传成空数组，然后只通过 PATCH 更新意图，再查两版历史。两版均应显示空数组，因为 PATCH 复制的是上一版的数据库值。若改成再次完整追加并省略片段，下一版公开字段应为空值。这两趟变化只从历史看得清，列表与详情都可能看不出差别。比较完把这个新样本与三版演示记录分别记下，不要把新得到的最高号拿去套用原截图中的续读参数。

### 成功编号没有覆盖历史，仍然不等于拒绝了过期编辑

设两个页面都读到第 2 版。A 保存第 3 版以后，B 的完整快照请求才到达数据库，它会读取当前最大序号 3 并追加第 4 版；不会发生序号冲突，但 B 的原文可能仍来自过期页面。历史都在，当前显示却可能退回 B 提交的旧内容。

```mermaid
sequenceDiagram
    participant A as 页面 A
    participant B as 页面 B
    participant API as 服务
    participant DB as 数据库
    A->>API: 读取第 2 版
    B->>API: 读取第 2 版
    A->>API: 提交完整内容 A
    API->>DB: 追加第 3 版
    DB-->>API: 成功
    B->>API: 根据旧页面提交内容 B
    API->>DB: 基于当前最大号追加第 4 版
    DB-->>API: 成功；第 2、3、4 版均保留
```

本章保证保留成功快照、序号唯一，并对同时争号给出明确结果；没有承诺检测编辑者的基础版本。若需求是“用户基于第 2 版编辑，当前已是第 3 版时必须拒绝”，就需要客户端带 baseRevision，并把比较纳入原子写入条件。[支线 28A](../chapter-28-concurrency/side-01-optimistic-version.md) 会用独立示例解释这种版本条件与冲突处理；主线服务并未加入这个写入前提，仍允许上图中先后到达的完整内容各自追加为新修订。不能声称“已有唯一约束，所以一切竞争都解决了”。

### 交付与恢复依据也要切换

生产仍先执行迁移，再构建独立产物并提供运行环境，最后用 `npm start` 启动；没有 Inspector、没有源码监听、默认没有 docs。迁移 CLI 和历史属于部署步骤，不塞入每个应用进程启动。先用当前调试服务确认旧数据和新修订，再停 dev，用生产入口读相同 ID，确认读取结果不是依赖进程内状态。

迁移成功但尚未写任何新修订时，如果决定恢复旧版写入，必须承认这会让迁移快照再次落后；本章没有提供自动追赶脚本。因此常规恢复目标是修复当前读取并继续新协议，而不是直接启动旧写入者。已经产生新修订后，第二十四章程序虽可能启动，却只读初始副本；让它写入还会制造两条分叉内容线。保留旧字段的目的不是授予任意回退许可。

发生未知结果时先查询历史和当前内容。由于还没有操作身份，仅凭相同内容不能可靠判断“是否就是刚才那一次”；不要自动重发。这一边界会在幂等章节解决。暂停前保存本章演示 ID、最近序号和迁移阶段，结束 SQL 事务；下次从 GET 和核对脚本接上，保留所有历史，不再次回填或重复创建。

### 先在纸上圈出每条原文的当前版

A 有第 1、2、3 版，B 只有第 1 版。读者打开列表时应该看见哪两行？若先把四行都按 revision_no 倒序排列再取两行，A 会占两个位置。改成先把纸分成 A、B 两叠，各自取最上面一行，才有两条不同的记录。在 DBeaver 运行这个不碰业务表的样本。

```sql
WITH parents(id) AS (VALUES ('A'), ('B')),
revisions(capture_id, revision_no, original_text) AS (
  VALUES ('A',1,'old'), ('A',2,'middle'), ('A',3,'new'), ('B',1,'old')
)
SELECT c.id, r.revision_no, r.original_text
FROM parents c
CROSS JOIN LATERAL (
  SELECT revision_no, original_text FROM revisions
  WHERE capture_id = c.id ORDER BY revision_no DESC LIMIT 1
) r
ORDER BY c.id;
```

想单查 A 时，保留开头整段 WITH 样本定义，把最后的主查询替换成 `SELECT revision_no, original_text FROM revisions WHERE capture_id = 'A' ORDER BY revision_no DESC LIMIT 1;`，可取到第 3 版。换为 'B' 得第 1 版。LATERAL 让右边的查询可以引用左边当前这一条 c，把两次手工替换写成一次查询。恢复完整的横向连接查询，在最外层 ORDER BY 前加 `WHERE r.original_text = 'old'`，预测应该只剩谁。然后去掉该外层条件，把它改成内层的 `AND original_text = 'old'`。A 的旧版会重新出现，说明“当前版含此词”和“找含此词的最后一版”回答了两个不同的问题。若有父记录没有任何修订，CROSS JOIN 会让它消失，因此切换真实列表前还要核对回填是否覆盖全部旧记录。

现在从空白查询窗重写一次当前列表，只给需求，不先抄上面的联接。先写出结果四列的来源：素材标识与创建时刻要从父记录取，原文与意图要从当前修订的同一行取。不能分别取最大的原文和最大的意图，字符串的最大值只是排序规则下靠后的一项，两个最大值甚至可能出自不同版本。即使只用最大序号分组，所得仍只是一个号码，要回到同时匹配素材与号码的那一行，才能选出彼此对应的两个内容字段。只按号码连接，甲的一号可能会找上乙的一号，纸上两条素材都有第一版时便能看出这个错误。

不用 LATERAL 也能表达同一选择。下面把“每叠纸上最大的号”先单独算出，再把属于同一叠的那张卡取回来。只在本章迁移已经完成的数据库运行。这是用来核对关系与字段来源的只读查询，限定为配套固定开发用户，实际库里匹配的条数以自己的素材为准。在 DBeaver 可先只执行括号里的分组查询，看每个素材是否只有一个最高号；再一起执行外层，结果应沿原列表顺序排列。

```sql
WITH last_no AS (
  SELECT capture_id, max(revision_no) AS no
  FROM public.capture_revisions
  GROUP BY capture_id
)
SELECT c.id, r.revision_no, r.original_text, r.chinese_intent, c.created_at
FROM public.captures c
JOIN last_no m ON m.capture_id = c.id
JOIN public.capture_revisions r
  ON r.capture_id = m.capture_id AND r.revision_no = m.no
WHERE c.user_id = '10000000-0000-4000-8000-000000000001'::uuid
ORDER BY c.created_at, c.id;
```

接着给需求加两个词：“只显示当前仍含旧词的前一条”。先决定在哪一层判断含词。若把关键词放进最高号的分组查询，最高号已经变成“含词修订里的最高号”，一条后来改掉旧词的素材也会入选。正确的判断要等到外层得到选定的内容以后，再决定是否符合关键词；需要条数上限则在最终排序之后限制。以前面的纸样本为准，旧词应只留下乙。把乙也改成新词，就应返回零条；如果仍能读到甲的一版，说明过滤提前了。如果已有多条匹配却返回错误的一条，要检查是否先限制了父集合才判断关键词。这与是否使用横向连接无关，替代写法必须保持同一组运算的语义。

比较两条正确的写法时也不宜把纸面直觉当作性能证明。对于指定的一条素材，联合索引提供从该素材范围取最大号的机会；对于列出许多素材，分组求最大号又有另一种组织方式。能从代码推断的是需检查哪些键、结果应落在哪一行，不能从语句看起来短就断言在自己的库里一定更快。先用同样的归属、排序、关键词和页长核对输出；若结果都一样且真的有慢查询，再用后面的执行计划方法比较实际访问了多少行。把语义核对放在计划优化之前，才能避免把一个错误地少读了旧版或父记录的查询误认成优化成果。

最后回到列表与单条详情的不对称处。列表的内连接只能展示找得到最新版的父行；详情若已经找到了父对象，却拿不到任何修订，配套会报告存储异常。不能指望靠列表显示成功就发现所有缺失首版的旧素材，因为它恰好可能把问题行隐藏了。迁移时从父表外连核覆盖、日常列表从父表选当前版、单条详情对缺修订报错，这三种查询看似都在读同两张表，任务却不同。根据当前问题选择应保留的左侧行，比死记某一种连接在所有场合都要使用可靠。

## 25.5 来源与 chunks：什么时候用列，什么时候用 JSON

到目前为止，前章只有原文和中文意图，没有已有的 chunks 表或历史数组。本章所说的 chunks，是调用方已经准备好、希望随这一版输入保存的短语片段，例如 `[{"text":"not my strength"}]`。当前不生成它们，不把它们叫作候选，也不假设它们已经成为正式表达。它们与版本内容一起保存、一起读取、一起被下一次完整快照替换。

来源 `input_source` 用结构化 text 列加 CHECK，因为它是稳定、低复杂度、需要有明确值域的标记。旧内容不知道来源就 unknown；本章手工完整提交只接收 manual。这里的来源表示原文输入方式，不是操作者身份、客户端可信度或授权证据。旧 PATCH 没修改原文，所以复制上一版的来源；新完整提交声明 manual。以后增加导入或 OCR，需要同时定义具体含义、输入授权和读取兼容，再追加允许值，不能看到一段中文就推断为某种来源。

chunks 目前没有独立身份、单独修改接口和跨版本引用，数量又有上限，所以用 jsonb 保存一个有序数组。与之相比，另建 `revision_chunks` 子表会增加每次写入和读取的协调成本；全部塞进一个 `payload` JSON 又会丢掉原文、意图、版本号等稳定字段的直接约束和查询边界。选择按字段职责作出，不是“关系数据库绝不能用 JSON”，也不是“有 JSON 就不用设计”。

| 保存值 | 本章含义 | 迁移或请求来源 |
| --- | --- | --- |
| SQL NULL | 没有提供或不知道 chunks | 旧数据回填；新完整请求省略或显式 null |
| `[]` | 明确提供了一个空片段列表 | 客户端明确提交空数组 |
| `[{"text":"not my strength"}]` | 按此顺序保存已提供片段 | 客户端完整提交 |

Prisma 对 JSON 字段区分 `DbNull` 与 `JsonNull`。本章使用 SQL NULL，不保存 JSON 字面量 null；创建关系时传 `Prisma.DbNull`，原始 SQL 则传参数 null 并转换为 jsonb。CHECK 中只接受 SQL NULL 或数组，因此 JSON null、对象、字符串不能冒充数组。不能把 `'null'::jsonb` 和 `NULL::jsonb` 当成同一回事。

数据库 CHECK 用 CASE 先判断数组类型，再用 `jsonb_array_length` 限制最多 25 项。每个元素由应用的 `ChunkSchema` 校验，只允许一个 `text` 字段，值须含非空白字符且能由 PostgreSQL 原样保存。本章锁定的 Zod 4.6.6 对字符串的 `.max(200)` 按 **Unicode 码点**计数。一个 😀 占一个码点、两个 UTF-16 代码单元。连续 101 个 😀 的 `text.length` 已是 202，作为一个片段仍会通过；连续 200 个恰好通过，201 个才超限。

原文 `originalText` 显式检查 `text.length <= 2000`，按 **UTF-16 代码单元**计数。同样的 😀 用作原文，1000 个通过，1001 个超限。排查一次追加时，先定位具体字段：若客户端用 `text.length <= 200` 检查片段，它会把含 101 个 😀 的合法片段拦下。先看请求是否发出、服务端返回了什么，再判断哪一侧拒绝。追加输入和修订响应复用同一份片段 Schema，直接写库的维护程序也应遵守它，否则历史行可能在读回时才被输出校验拒绝。

数组顺序表示片段顺序，jsonb 不保留对象键的顺序和原始 JSON 排版，因此不能用 JSON 序列化字节是否相等判断内容历史相同。我们保存的 text 字符串仍保留实际空格，JSON 文本的排版空格与字符串内部空格是两回事。整个 HTTP 正文仍受 16 KiB 限制，满足各字段长度不保证编码后的请求体一定不超限。

现在改变需求：如果用户要单独标记某个 chunk 已学会、候选要外键引用某个 chunk，或者经常跨记录按 chunk 查询统计，它就不再只是随快照携带的一段有界数据。可以推导 `revision_chunks(id, revision_id, position, text, ...)`：revision_id 外键表达所属版本，`(revision_id, position)` 唯一表达顺序，独立 ID 供引用。迁移时按 JSON 数组位置展开，每项生成身份，核对展开数和顺序，再切换读取；没有 chunks 的旧版不能凭空造子行。此时是否需要索引、是否保留 JSON 兼容副本，也由查询和切换要求决定。

这种变式说明，今天不拆表是有条件的选择。需求一旦改变，应回到行粒度、身份、关系、约束和生命周期重新设计，而不是先规定整个项目永远只用 JSON 或永远拆成表。

可以把这个设计落实为一次数据分析。现在要回答“有多少版明确交了一张空片段清单，有多少版连清单都没有提供”。把这两类都在读取时默认显示成空数组，对界面渲染很方便，但显示层的统一会丢掉这个问题需要的区别。分析应从每一版的一行出发，先区分 SQL 空值，再对确为数组的版本计算长度。字面量为空数组的长度是零；缺值时没有可报告的数组长度。若先无条件把缺值替成空数组再统计，得到的所谓“主动提供空清单的次数”就会混入所有回填版本。把缺失、空、非空三类的数量相加，应与选定范围内的修订数一致，而非素材数。

在 DBeaver 新开只读查询，先用下面四个快照预测输出。甲只有首版且当时没有片段；乙的三版分别是空清单、两个片段、同样两个片段。每版得到一行，长度依次是空、零、二、二。最后两行说明观察到两次非空快照，即便字符串相同也不能合并成一次保存。在业务库查询时把样本换成目标素材的修订集合，保留版号作排序依据；先看每版的分类，再按分类分组计数，不要一开始就用总计遮住来源差异。

```sql
WITH versions(parent_id, no, chunks) AS (
  VALUES ('甲',1,NULL::jsonb), ('乙',1,'[]'::jsonb),
         ('乙',2,'[{"text":"起步"},{"text":"收尾"}]'::jsonb),
         ('乙',3,'[{"text":"起步"},{"text":"收尾"}]'::jsonb)
)
SELECT parent_id, no, chunks IS NULL AS unspecified,
       jsonb_array_length(chunks) AS supplied_count
FROM versions
ORDER BY CASE parent_id WHEN '甲' THEN 1 ELSE 2 END, no;
```

再改变要交付的结果，现在希望列表里一行是一段片段，同时保留它在原数组中的顺序。这个问题与上面的“一行一版”不同，需要把数组展开。先只拿乙的第二版，逐个取元素时顺便取得位置，检查第一项是否确实为“起步”。位置只在本数组内有意义，另一个版本也能有第一项。若查询要恢复原顺序，应显式按位置排序，不按片段文字排序；若允许两个不同位置文字相同，也不能用去重去掉后一项。想继续展示无清单的素材或版本时，还需要单独选择是列出一行无片段说明，还是只列出真实存在的片段，二者会导致不同的计数。

```sql
SELECT p.position, p.item ->> 'text' AS phrase
FROM jsonb_array_elements('[{"text":"起步"},{"text":"收尾"}]'::jsonb)
     WITH ORDINALITY AS p(item, position)
ORDER BY p.position;
```

这里有个值得提前发现的迁移陷阱。若将来真拆成子表，缺清单和空清单都会展开成零个子行，只靠对子表计数就无法还原原先的区别。若产品仍关心“用户明确给过一张空清单”，就得在父快照上留下是否提供的标记，或者保留能表达这层含义的另一份记录。若业务决定两者从此等价，也应先量出有多少旧版属于两种状态，再明确接受合并。迁移不仅是从数组生成若干子行，还需要证明今后要问的问题用新形状仍问得出来。上一节的回填原则在这里再次适用，未知不能借数据格式变化就变成已知。

最后拿一个不会触及表结构的界面需求作对照。若页面只想把片段按原顺序显示为标签，并支持点击后复制文字，这些操作所需数据在版本数组内已经具备，排序与复制都不需要数据库赋予每个片段新的业务身份。若要在下周准确打开“上周我标记的那一个片段”，同一句短语可能在同一数组出现两次，文字不能唯一定位；用位置可以在不可编辑的指定版本里定位，但引用方需要同时保存版与位置，还要定义来源版本的保留策略。真正需要跨版跟踪同一片段时，又要决定新版本里删掉或改写它意味着什么。由这个具体引用问题推回身份及生命周期，才知道何时拆表值得付出额外成本。

进入下一章时也沿用这个判断。一版可以携带几段输入片段，但其中一句文字碰巧与某份候选的英文相同，并不能从文字相等推出它们是同一对象。片段表达用户提供了什么，候选表达针对这版提出了什么建议。前者跟随完整快照，后者有自己的标识与处置过程。若用本章片段数组直接冒充候选列表，即使页面看上去都是几行文字，也无法回答用户后来放弃的是哪一份建议。这正是下一章要从修订身份而不是数组文字继续建模的地方。

本章结束时，同一 Capture 可以保留多版完整输入；旧记录已经接入历史，旧 PATCH、列表和详情也都沿新内容来源工作。下一章将在明确的修订上保存候选，先定义状态、事件和关系，再决定用户确认究竟绑定哪一个对象。

## 知识支线

- [支线 25A：快照历史、事件记录与当前投影有什么不同](side-01-snapshots-and-events.md)：从订单地址变更推导历史保存方式，解释快照并不等于事件溯源，以及当前指针何时值得引入。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| pg_dump／pg_restore | 单库归档并恢复到独立空库 | 归档不含角色；源与目标先核对；恢复结果还需逐行、结构与迁移核验 |
| Capture / CaptureRevision | 稳定身份与某版内容 | 记录创建时间和修订时间不混用 |
| `(capture_id, revision_no)` 唯一约束 | 防止同记录序号重复 | 不是编辑基础版本校验，也不保证无空号 |
| `INSERT ... SELECT` | 从已有行建立初始修订 | 保留旧值，不编造未知来源 |
| `IS DISTINCT FROM` | 核对可空字段 | 两个 NULL 认为相同 |
| `LOCK TABLE ... SHARE ROW EXCLUSIVE` | 回填期间阻止父表写入 | 提交即释放，不替代停旧程序 |
| Prisma nested create | 父记录与第 1 版一起保存 | 具有事务语义，不能拆成两个独立 await |
| `LATERAL` | 每个父记录选取一条最新修订 | 搜索放在取最新之前／之后，含义不同 |
| 修改型 CTE / `RETURNING` | 取得本次插入结果 | 不用基础表重查冒充本次结果 |
| `ON CONFLICT ... DO NOTHING` | 明确识别序号争用 | 本次没插入必须返回冲突；不覆盖旧快照 |
| `before`、`limit + 1` | 有界读取全部历史 | before 排除边界本身，空页不等于记录不存在 |
| `DbNull` / `JsonNull` | 区分 SQL NULL 与 JSON null | 本章只存 SQL NULL 或数组 |
| jsonb / `jsonb_typeof` | 保存有界片段数组 | JSON 合法不等于业务形状合法 |
| 409 / `REVISION_CONFLICT` | 指示序号竞争 | 先读取再决定，不自动重试完整快照 |

官方入口：[PostgreSQL 18 约束](https://www.postgresql.org/docs/18/ddl-constraints.html)、[LATERAL 与表表达式](https://www.postgresql.org/docs/18/queries-table-expressions.html)、[WITH 查询](https://www.postgresql.org/docs/18/queries-with.html)、[INSERT 与 ON CONFLICT](https://www.postgresql.org/docs/18/sql-insert.html)、[锁模式](https://www.postgresql.org/docs/18/explicit-locking.html)、[JSON 类型](https://www.postgresql.org/docs/18/datatype-json.html)、[Prisma v7 关系写入](https://www.prisma.io/docs/orm/v7/prisma-client/queries/relation-queries)、[事务与嵌套写入](https://www.prisma.io/docs/orm/v7/prisma-client/queries/transactions)、[JSON 字段](https://www.prisma.io/docs/orm/v7/prisma-client/special-fields-and-types/working-with-json-fields)。

本章完成代码分支：`part-04/chapter-25`。

[下一章：状态机与关系建模：修订如何进入候选确认](../chapter-26-candidates/chapter.md)

[上一章：第三篇回顾：带着旧记录完成一次结构演进](../../part-03-postgresql/chapter-24-review/chapter.md) · [第四篇导读](../README.md) · [返回全书目录](../../README.md)
