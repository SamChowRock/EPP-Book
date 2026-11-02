# 第十八章 Prisma：将已有表纳入 Schema 与迁移管理

第十七章已经把查询意图落实成 SQL：一条记录属于谁、怎样排序、关联后的一行代表什么，以及提交前后的结果为什么不同。这些判断接入 ORM 后仍然有效。新的问题是，怎样让 TypeScript 程序持续使用这组结构，以及下一次结构变化怎样留下别人能够检查、另一套环境能够重放的依据。

本章从[第十七章代码](https://github.com/SamChowRock/epp-book-code/tree/part-03/chapter-17)继续。PostgreSQL 中已有 `public.users`、`public.captures`、一个开发用户和两条原文；第十七章的临时记录与事务应已清理。Nest 仍使用 Map。我们先接管数据库结构，第十九章才替换业务存储，避免同时改变模型、迁移机制和接口行为而难以定位差异。

完成后，已有库会保留原来的行并拥有迁移记录；另一个空库能仅凭迁移文件建立同样的业务结构。这个结果比“能生成模型”多了一层证明：现有事实与未来的重建路径能够相互核对。

**时间参考（估算）**：阅读约 110～130 分钟；配置、模型核对、空库重放与基线登记另加约 55～75 分钟。估时依据见篇导读，软件安装与下载等待另计。

## 18.1 先分清模型、客户端与数据库

上一章的参数化 SQL 已经可以安全地把输入值交给 PostgreSQL。如果项目长期只有几个查询，继续使用驱动和 SQL 完全合理。增加 ORM 的理由不是让数据库“变成 JavaScript”，而是后续会有更多表、字段投影、关联与更新：每次变化都需要同步查询参数、返回类型和结构记录。我们希望由同一份可审查的模型生成常用访问接口，并让结构变化有明确历史。

直接使用驱动时，可以写出非常贴近数据库的 SQL，但需要自己维护查询结果类型与数据库的对应。类型断言只能表达作者的信心，不能证明列还存在。另一种路线是保留 SQL 查询，单独引入迁移工具；它同样成立，尤其适合复杂查询占多数的项目。EPP 选择 Prisma，是因为当前主要操作能够自然地表达为按模型读写，生成的 TypeScript 类型有助于持续演进，迁移又保留 SQL 供审查。遇到 ORM 不适合表达的查询，仍然回到参数化 SQL，不为了使用统一 API 改变业务含义。

这里有三种不同产物。`prisma/schema.prisma` 是模型描述文件；生成的 Prisma Client 是程序可导入的代码；PostgreSQL 里才有真实的表、约束与行。三者不会因一个文件保存了就自动同步。

```mermaid
flowchart TD
    D["PostgreSQL 实际结构"] -->|"db pull：读取结构"| S["Prisma Schema"]
    S -->|"generate：生成代码"| C["Prisma Client"]
    S -->|"比较并审查变化"| M["迁移 SQL 历史"]
    M -->|"deploy：执行待应用迁移"| D
    C -->|"通过适配器执行查询"| D
```

例如，把模型中的 `originalText` 改名为 `text`，只重新生成客户端，会改变 TypeScript 调用接口；是否需要改数据库列，取决于映射有没有保留。反过来，在 DBeaver 中直接改一列，当前客户端不会自动得知。代码能够通过编译，也不代表连接的库已经拥有那个字段。

这种分离是数据映射思想的具体应用：程序中的名字和数据库中的名字可以不同，但映射必须明确。它也说明 ORM 并不接管所有设计责任。它不知道“相同原文是否允许重复”，不知道某个更新应该与哪一步组成事务，也不会自动给所有查询补上用户归属条件。第十六、十七章建立的判断，决定我们应该让工具生成什么。

本章固定使用 Prisma CLI 与 `@prisma/client` **7.10.1**，沿用 Node.js **24.22.1**、TypeScript **5.9.3** 和 ESM。Prisma 7 的连接 URL 放在配置文件读取的环境变量里；生成器使用 `prisma-client`，显式指定输出目录。查阅资料时选择官方的 v7 文档，不把新主版本预览、旧版 `prisma-client-js` 初始化方式与当前配置混用。

在 VS Code 打开配套项目。源码、配置和迁移用编辑器查看差异；数据库结构、数据和执行结果继续用 DBeaver。项目任务集中在终端执行少量 npm 命令，因为生成和迁移需要能够被构建与部署重复调用。DBeaver 中编辑表不能替代迁移历史，迁移命令也不能替代对实际结构的观察。

## 18.2 从已有表得到模型，再生成客户端

### 把连接目标与构建配置分开

先在 DBeaver 的原有 `epp_dev` 连接中打开 SQL 编辑器，确认第十七章没有留下未结束的事务，执行：

```sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
```

应连接第十五章保存的实例：`127.0.0.1:55432`，数据库 `epp_dev`，角色 `epp_owner`。刷新 `public` 下的两张表；在 Data 页确认原来的用户和原文还在。若使用了不同的已记录端口，以环境标识为准，不能只看连接名称。

![DBeaver 查询当前数据库、角色、地址、端口与版本](images/01-connection.jpg)

图中上方是 SQL 编辑区，下方是结果网格。数据库为 epp_dev、身份为 epp_owner，端口显示为带千位分隔符的 `55,432`，实际仍是 55432；version 来自 `current_setting('server_version')`，是服务端版本。连接名称只是标签，结果中的身份才是核对依据。本文界面采用 DBeaver Community 26.2.3，其他版本按相同对象和结果识别入口。

沿前章代码跟做时，在项目根目录安装固定版本：

```bash
nvm use
npm install --save-exact @prisma/client@7.10.1
npm install --save-dev --save-exact prisma@7.10.1
```

`prisma` 提供开发和迁移命令，放在开发依赖；`@prisma/client` 提供生成代码依赖的运行时，放在运行依赖。安装更新 `package-lock.json`，后续取得本章完成代码时使用 `npm ci`，不重新选择版本。若 npm 提示安装脚本尚未获准，先看列出的包和脚本；本项目允许 Prisma 的版本检查、引擎准备，以及既有 esbuild 的安装脚本。支持该机制的 npm 可执行：

```bash
npm install-scripts approve prisma @prisma/engines esbuild
npm rebuild prisma @prisma/engines esbuild
```

完成代码保存了对应版本的 `allowScripts`。不支持此命令的旧 npm 无需执行这两行，也不要把安装失败一律解释为需要全局放开脚本；先核对 Node、npm 输出与网络错误。

在项目根目录新增 `prisma.config.ts`：

```ts
import { defineConfig } from 'prisma/config';

// Generation is offline. Database commands receive an explicit environment.
const url = process.env.DATABASE_URL;
const shadowDatabaseUrl = process.env.SHADOW_DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  ...(url ? { datasource: { url, ...(shadowDatabaseUrl ? { shadowDatabaseUrl } : {}) } } : {}),
});
```

路径相对于配置文件解析。`datasource` 只在提供 URL 时加入，让模型校验和客户端生成不依赖数据库密码；读取或修改数据库的命令则必须提供连接配置。影子库暂不填写，18.5 再解释用途。

在 `package.json` 的 `scripts` 中加入以下条目，保留原有脚本：

```json
{
  "prisma": "node node_modules/prisma/build/index.js",
  "db": "node --env-file=.env.database node_modules/prisma/build/index.js",
  "db:verify": "node --env-file=.env.database-verify node_modules/prisma/build/index.js",
  "prisma:generate": "npm run prisma -- generate",
  "predev": "npm run prisma:generate",
  "pretypecheck": "npm run prisma:generate",
  "prebuild": "npm run prisma:generate"
}
```

三个入口调用同一个已锁定的 CLI。`prisma` 读取进程环境，适合生成及以后由部署系统注入配置；`db` 明确加载日常库的文件；`db:verify` 加载校验库文件。这里没有自动执行迁移的启动钩子，启动 API 不应该顺便改变数据库结构。

用 VS Code 将 `database/chapter-18/database.env.example` 的内容保存为根目录的 `.env.database`，将密码占位符替换为第十五章为 `epp_owner` 设置的本地密码：

```dotenv
DATABASE_URL="postgresql://epp_owner:REPLACE_WITH_URL_ENCODED_PASSWORD@127.0.0.1:55432/epp_dev?schema=public"
```

密码中的 `@`、`:`、`/`、`#` 等保留字符需要百分号编码。例如密码字符 `@` 在 URL 中写成 `%40`；双引号只是环境文件的语法，不替代 URL 编码。只编码密码部分，不把整个连接串编码。不要把真实密码粘贴到在线编码网站、正文、命令历史或截图。

原来的 `.gitignore` 已忽略 `.env` 与 `.env.*`，这个文件不进入 Git。数据库命令单独加载它，现有 Map 服务仍沿用 `.env`。Node 的 `--env-file` 不会覆盖进程里已经存在的同名变量；如果此前在终端导出过其他 `DATABASE_URL`，先用 `unset DATABASE_URL SHADOW_DATABASE_URL` 清除本终端旧值，再运行本章本地命令。不通过打印完整连接串核对目标，观察 CLI 的数据库名称、主机和端口，再与 DBeaver 的身份查询对照。

### 读取实物，解释生成结果

首次跟做时先创建 `prisma/schema.prisma`，只放生成器和数据源块：

```prisma
generator client {
  provider               = "prisma-client"
  output                 = "../src/generated/prisma"
  moduleFormat           = "esm"
  generatedFileExtension = "ts"
  importFileExtension    = "js"
}

datasource db {
  provider = "postgresql"
}
```

随后执行：

```bash
npm run db -- db pull
```

Introspection 的意思是读取数据库目录中的结构信息，反推出模型描述。这个命令会改本地 Schema 文件，不会创建、清空或改写业务表。如果直接使用本章完成代码，先在编辑器查看已有模型，再使用 `npm run db -- db pull --print` 观察反向读取的结果；`--print` 输出模型而不覆盖文件，不必为了重新做一遍清空已有模型。

第一次输出通常沿用 `users`、`captures`、`user_id` 等数据库名称。先核对六个实际列、两张表、主外键和索引，再用下面两个模型替换反向读取生成的模型块，保留文件顶部的 generator 与 datasource。不是在原模型之后再追加一套；整理完只有 User 和 Capture 两个模型：

```prisma
model User {
  id        String    @id(map: "users_pkey") @db.Uuid
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(3)
  captures  Capture[]

  @@map("users")
}

/// CHECK captures_original_text_nonempty is maintained in migration SQL.
model Capture {
  id           String   @id(map: "captures_pkey") @db.Uuid
  userId       String   @map("user_id") @db.Uuid
  originalText String   @map("original_text") @db.Text
  createdAt    DateTime @default(now()) @map("created_at") @db.Timestamptz(3)
  user         User     @relation(fields: [userId], references: [id], onDelete: Restrict, onUpdate: Restrict, map: "captures_user_id_fkey")

  @@index([userId], map: "captures_user_id_idx")
  @@map("captures")
}
```

再次 `db pull --print` 时，输出可能省略 `@db.Text`、默认的主键／索引名称，或省略必需关系默认使用的 `onDelete: Restrict`。这是模型语言在默认含义不变时的简写，不等于数据库刚刚丢失了类型或约束。比如 String 在 PostgreSQL 的默认映射就是 text，而当前 `onUpdate: Restrict` 不等于默认的 Cascade，因此仍须保留。比较输出时逐项判断物理含义，不能要求文本逐字相同，也不能把所有省略都当成无害；本章模型保留显式写法，使设计选择可以直接读出。

`User`、`Capture` 是客户端模型名，`@@map` 保持实际表名不变；`createdAt` 等字段上的 `@map` 保持列名不变。`@id` 及关系、索引中的 `map` 指定数据库对象名，和给字段改名字不是同一种作用。把两个层面的命名分开后，TypeScript 可以使用驼峰，历史 SQL 继续使用原有名称。

例如，假设以后只想在程序中把原文叫作 `text`，模型字段可以改成下面这样；这是命名变式，本章仍保留 originalText：

```prisma
text String @map("original_text") @db.Text
```

数据库仍是同一列，结构比较应没有相应差异；重新生成后，使用旧字段名的 TypeScript 查询却需要修改。这属于客户端接口演进，不需要物理迁移。若同时去掉 `@map`，工具看到的物理目标会变成 text 列，就可能提出删除旧列、增加新列的 SQL；它无法从名字猜出“保留原值并重命名”的意图。需要物理改名时必须审查和定制迁移，还要考虑仍在运行的旧程序是否继续查询旧列，不能把两种改名混为一谈。

`String` 只告诉客户端这个值用字符串表示；`@db.Uuid` 才明确数据库存 UUID。去掉它会失去物理类型约束，不能因为两者在 JS 都是字符串就视为等价。同样，`DateTime` 默认映射不足以表达我们选择的时间类型，`@db.Timestamptz(3)` 保留时间点语义和毫秒精度。`@default(now())` 在 PostgreSQL 侧对应已有的时间默认值；它不会给历史行重新赋时间。

两个 `id` 都没有 `@default(uuid())`。第十六章没有数据库 UUID 默认表达式，我们也没有决定把 ID 的生成责任交给 ORM。只为减少一个必填参数加入客户端默认值，会改变写入责任，却不一定让 DBeaver 直接 INSERT 获得同样的默认值。这类差异必须来自设计决定，不能由生成示例顺手带入。

`userId` 是真实列；`user` 和 `captures` 是客户端的关系字段，不是新列。`Capture.user` 没有问号，配合非空 `userId` 表达每条记录必须指向用户；`User.captures` 是列表，仍允许零条。关系字段也不意味着每次读取记录就自动把用户数据查出来，是否查询关联由调用决定。

`onDelete` 与 `onUpdate` 都显式为 `Restrict`，保留原先“存在引用时拒绝”的规则。不能把生成器默认值当成生命周期设计。外键下面的 `@@index` 仍有独立作用：约束负责引用合法性，索引影响检索路径，两者并非同一件事。

还有一个不能略过的警告：Prisma 7 的模型语言不能完整表示现有的 `CHECK (char_length(original_text) > 0)`。Introspection 会提示这类约束，并可能添加说明注释。模型中的三斜线注释只是维护提示，不是会被执行的校验；真实约束继续在 PostgreSQL 中执行，重建它的责任落在迁移 SQL。18.3 会把这条规则放进基线。

### 生成以后，到编辑器里检查什么

在 `.gitignore` 追加 `src/generated/prisma/`，再运行：

```bash
npm run prisma -- format
npm run prisma -- validate
npm run prisma:generate
npm run check
```

格式化整理文件；校验检查模型语法和内部关系；生成器写出 TypeScript；类型检查与构建确认它能进入现有工程。前三项成功都不能证明数据库已迁移，也不能证明数据库连接可用。

打开 `src/generated/prisma/client.ts` 和 `models/Capture.ts`。可看到 `PrismaClient` 入口以及 `id`、`userId`、`originalText`、`createdAt` 对应的类型。创建时间在程序侧是 `Date`，以后响应仍需转换成现有契约的字符串；数据库模型包含 `userId`，并不代表 HTTP 响应应新增这个字段。生成类型帮助检查程序调用，HTTP 输入校验和响应投影仍各自承担责任。

本项目按 NodeNext 编译再运行，生成文件扩展名是 `.ts`，文件内部 import 指向编译后的 `.js`。这些文件位于 `src/`，会被现有编译配置输出到 `dist/src/generated/prisma/`；不需要把 `.ts` 当成生产入口。它们由模型确定，不手工修改、不提交生成结果。`predev`、`pretypecheck`、`prebuild` 让干净安装后先生成再使用；已运行的开发进程不会监视 `.prisma` 文件，修改模型后执行 `npm run prisma:generate`，生成的 `.ts` 变化才会被现有编译监听发现。

生成器已经准备好客户端，但本章不实例化它。Prisma 7 连接 PostgreSQL 时还需要运行时驱动适配器，第十九章会把它与连接池、Nest 生命周期一起接入。现在运行 `npm run dev` 仍是原来的 Map 服务；`npm start` 仍只运行构建产物，不生成代码、不迁移、不加载本地数据库密码。

到这里可以停下：数据库没有被修改，保存的是模型、配置和锁文件。继续时先确认连接，再进入迁移历史的接管。

## 18.3 为已有结构建立可重放的基线

### 一份模型不能代替一次演进的过程

Schema 描述的是某个目标结构；迁移记录的是从一个结构走到另一个结构需要执行的步骤。两份结构快照有差异，不意味着工具知道业务意图。删掉 `original_text` 再新增 `text`，和把原来的列重命名，最终列名可能一样，对旧数据的后果却完全不同。迁移文件保留执行过程，使这种区别能在执行前被审查。

我们还没有第一次 Prisma 迁移，但数据库已经有表。如果直接把“创建两张表”的迁移当作普通待执行迁移应用到 `epp_dev`，会与已有对象冲突。重置库能绕过冲突，却丢掉了本章必须保留的数据。基线的做法是：写出一份足以从空结构重建当前模型的初始迁移；已有库经过核对后只登记“这份迁移描述的结构已经存在”，新库则实际执行它。

因此，同一份迁移有两条进入路径：

| 目标现状 | 应采取的动作 | 应保留的结果 |
| --- | --- | --- |
| 有表、有数据，结构与基线一致 | `migrate resolve --applied 0_init` 登记基线 | 业务表与行保持，新增迁移记录 |
| 全新空库，尚无业务表 | `migrate deploy` 实际执行基线 | 建立业务表与约束，业务行仍为空 |
| 有表，但与基线不一致 | 先查差异来源并决定如何收敛 | 不先登记一个不成立的事实 |

`resolve` 不负责证明结构一致。把一份错误迁移标成已应用，就相当于在维护记录中写下错误结论；后面的部署会相信它并跳过那份 SQL。我们先准备、核对和重放，18.4 最后才执行登记。

### 生成草稿，再把不能表示的规则补回来

创建 `prisma/migrations/0_init/`。`0_init` 的前缀使它排在以后按时间命名的迁移之前。文件夹名就是迁移身份，不随意改名。根目录中已存在的迁移历史不适用“重新初始化”；当前前置代码尚无该目录，才在这里首次建立。

在根目录执行以下命令，先把输出保存到草稿，而不是覆盖将要登记的正式文件：

```bash
npm run db -- migrate diff --from-empty --to-schema prisma/schema.prisma \
  --script --output database/chapter-18/baseline-draft.sql
```

比较方向是“空结构 → 本地模型”，不是“已有库 → 空结构”。这条比较不执行 SQL，也不读取业务行，但当前 CLI 的迁移引擎仍需要数据源配置，所以使用 `db` 入口。打开生成文件确认真的有内容，不能只看命令退出。草稿加入 `.gitignore`，避免把两份类似的初始迁移都交给后续维护者。

草稿包含两次建表、一个普通索引及外键，但没有非空字符串的 `CHECK`。这正好展示模型投影的边界：两份数据库只在工具不支持的对象上不同，工具也可能报告“无差异”。如果以后使用触发器、表达式索引或其他特定特性，同样需要确认当前版本到底能表示和比较哪些部分。

本章最终的 `prisma/migrations/0_init/migration.sql` 如下。它沿用第十六章已经审查过的定义，显式限定 `public`，补回 `CHECK`，不包含任何开发数据：

```sql
-- Baseline of the existing chapter-16 structure. No development seed data.
-- CHECK is preserved explicitly because Prisma 7 PSL cannot express it.
BEGIN;

CREATE TABLE public.users (
  id uuid CONSTRAINT users_pkey PRIMARY KEY,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE public.captures (
  id uuid CONSTRAINT captures_pkey PRIMARY KEY,
  user_id uuid NOT NULL,
  original_text text NOT NULL,
  created_at timestamptz(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT captures_original_text_nonempty CHECK (char_length(original_text) > 0),
  CONSTRAINT captures_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES public.users (id)
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE INDEX captures_user_id_idx ON public.captures (user_id);

COMMIT;
```

PostgreSQL 中这些 DDL 可以在事务中执行，所以本迁移显式使用 `BEGIN/COMMIT`，避免中途失败后只留下部分业务对象。不能由此推断以后任何 DDL 都可以包在同一个事务中，例如并发建索引有不同限制，需要按具体命令设计。

没有使用 `IF NOT EXISTS` 跳过已有业务表。它只能说明名字存在，不能证明列类型、外键和 CHECK 正确；这里希望异常现状使流程停止，而不是伪装成已经重建成功。空库由 PostgreSQL 的标准模板建立，本章沿用已有 `public` schema。

另建 `prisma/migrations/migration_lock.toml`：

```toml
provider = "postgresql"
```

它记录迁移使用的数据库提供者，要与迁移一起提交。它不是数据库锁，也不包含密码；其存在不能阻止并发业务请求。

种子数据与结构迁移要分开。每套环境都需要同样的表和约束，却不都需要那个固定开发用户与两句练习原文。若把第十六章的 INSERT 放进基线，新环境就会带入虚构业务行；若指望基线恢复真实数据，又会把结构重建误当备份恢复。以后必需的参考数据或数据回填可以由明确的迁移管理，但需要单独解释内容、幂等和适用环境，不能把全部开发 seed 当作结构的一部分。

### 用结构事实核对设计，而不只看命令结果

本次接管期间先停止其他结构编辑和手工业务写入；当前 API 仍用 Map，不会改变这两张表。前后数据比较需要相同观察条件，不能一边让另一个会话继续新增记录，一边把行数变化归因于基线登记。多人共享库的接管还要协调变更窗口，不能仅靠自己关闭一个编辑器。

在 DBeaver 的 `epp_dev` 编辑器打开配套 `01-inspect-structure.sql`，按语句执行。它先显示连接身份，再读取列、约束、索引与所有者。`information_schema.columns` 里的必要部分是：

```sql
SELECT table_name, column_name, ordinal_position, data_type, udt_name,
       is_nullable, column_default, datetime_precision
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name IN ('users', 'captures')
ORDER BY table_name, ordinal_position;
```

对照模型看六行列定义：两个 `id` 和 `user_id` 的 `udt_name` 是 `uuid`；原文是 `text`；两个时间列为 `timestamp with time zone`，精度 3，默认值为 `CURRENT_TIMESTAMP`；所有列都不允许 NULL。`users.id`、`captures.id` 没有默认值。这样比较的是物理含义，不是 SQL 大小写和排版。

约束查询使用 `pg_get_constraintdef` 展开数据库实际定义，而不是读取模型里的注释：

```sql
SELECT c.relname AS table_name, con.conname, con.contype,
       con.convalidated, con.conenforced, pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint AS con
JOIN pg_class AS c ON c.oid = con.conrelid
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('users', 'captures')
ORDER BY c.relname, con.conname;
```

找出 `users_pkey`、`captures_pkey`、`captures_user_id_fkey`、`captures_original_text_nonempty`。外键必须指向 `users(id)`，删除与更新均为 RESTRICT；CHECK 必须检查原文字符长度大于零，`convalidated` 与 `conenforced` 都应为真，分别表示已有数据经过验证、后续写入会执行该约束。PostgreSQL 18 也会显示 NOT NULL 的约束条目，不要把结果行数机械地固定成四行。再核对两个主键索引和 `captures_user_id_idx`；表所有者应为 `epp_owner`。

在对象树双击表，从 Properties 中的 Columns、Constraints／Foreign Keys、Indexes 对照这些结果。界面名称可能随版本略有变化；SQL 查询提供可保存和跨环境比较的共同依据。DDL 页适合看整体定义，但不要把展示顺序、格式差异当成模型差异。

![DBeaver 读取 PostgreSQL 实际 CHECK 定义和状态](images/04-check-definition.jpg)

图中单独筛选 captures_original_text_nonempty，valid 与 enforced 分别来自 convalidated 与 conenforced。表达式确实检查 original_text 的字符长度，而不是只在模型中留了一条注释；后面的错误写入实验还会检验执行行为。截图是在基线登记后的日常库观察，左侧因此已有迁移表。

然后执行 `02-inspect-data.sql`。它把会话时区设成 UTC，按固定顺序列出用户和记录。将结果网格通过右键的导出功能保存到本地 CSV，保留列名；开发例子的原文前后空格、ID、归属和时间都参与比较。标准前置状态应是一个用户、两条原文，文本长度分别为 28 与 21，两条记录的时间均为 `2026-10-31 08:00:00.123+00`。用户的创建时间来自当时插入，保存实际值，不要求等于某个示例时间。

如果自己合法增加过数据，保存自己的完整前后结果，不能为了凑预期行数删除它们。行数相同也可能内容已变，所以要比较有序结果中的值。这个小数据导出便于本章对照，不替代真实项目中覆盖完整数据和对象的备份方案。

最后做工具支持范围内的结构比较：

```bash
npm run db -- migrate diff --from-config-datasource \
  --to-schema prisma/schema.prisma --exit-code
```

结果应无差异。指定 `--exit-code` 后，0 表示没有支持范围内的差异，2 表示存在差异，1 表示命令错误；在当前 Bash／Zsh 终端紧接着运行 `echo $?` 可查看。不要把 2 简单当成网络失败，也不要因 0 就省略 CHECK 和所有者的人工核对。URL 上的 `schema=public` 决定本章比较范围，其他 schema 中的对象不在这次接管范围内。

先解释差异，再选修改方向。例如数据库多一个 created_at 索引，而模型没有：当前比较方向会建议移除它，但这没有回答“它是否应该存在”。若它只是刚才的误操作，应按完整定义确认对象后恢复；若它来自已确认的查询需求，则应把需求纳入模型和可重放历史。接管前尚未生效的基线可以修正并重新验证，生效后的基线则不能被回写。判断依据是对象来源、使用者与需求，不是让退出码变成 0 本身。

若模型少了映射、时间精度或引用动作，先修正模型再比较。如果数据库真的被改过，先确认改动是否属于有效需求，决定恢复偏差还是为它设计演进；不能先 `resolve` 再希望后续命令替自己修复。此时还没有登记基线，修正未应用的草稿没有历史兼容负担。

## 18.4 在独立空库重放，再登记已有库

### 空库证明的是结构可以重新建立

先在 DBeaver 使用第十五章保存的管理连接，连接同一实例的 `postgres` 数据库，执行身份查询核对实例。确认自动提交开启，逐条执行配套 `03-create-verification-database.sql`：

```sql
CREATE DATABASE epp_migration_check OWNER epp_owner;
REVOKE ALL ON DATABASE epp_migration_check FROM PUBLIC;
```

`CREATE DATABASE` 不能放在事务块里。`epp_owner` 在第十五章是 NOCREATEDB，因此建库由原有管理身份完成，迁移仍用 `epp_owner`。不用为了这一步把业务开发身份改成超级用户。

如果名字已存在，先查看它的用途和对象，不能直接删库。只有明确是此前本章的校验库时才按下面的中断恢复继续；否则另选新库名，并同步连接和环境文件。

复制 DBeaver 的日常连接，改数据库为 `epp_migration_check`、连接名为“EPP 迁移校验”，身份仍为 `epp_owner`。重新连接并运行身份查询。打开 `public → Tables`，应没有业务表；必要时刷新对象树，避免把旧缓存当成结果。日常连接和校验连接同时保留，在编辑器顶部确认选中的数据源。

将 `database/chapter-18/verify.env.example` 保存为根目录 `.env.database-verify`，填写相同角色的本地密码，但数据库名使用刚才的新库。确认终端没有覆盖文件的旧 `DATABASE_URL`。执行：

```bash
npm run db:verify -- migrate deploy
npm run db:verify -- migrate status
```

`deploy` 读取迁移目录，按顺序执行目标库尚未应用的 SQL，并写入 `_prisma_migrations`。它不根据当前 Schema 临时生成新迁移，也不导入开发 seed。此时应应用 `0_init`，状态显示历史已同步。

刷新校验连接的 `public`，应出现 `users`、`captures` 和 `_prisma_migrations`。在 Data 页，两张业务表都为空。这是正确结果：结构路径已经建立，业务数据没有被复制过去。若想使用第十六章开发样本，应在完成本章空库验证后另行决定，不能在验证前用 seed 遮蔽“基线不应带数据”的判断。

在校验库再次运行 `01-inspect-structure.sql`，把列、业务约束、索引与日常库的结果并排比较。两库名字不同，迁移表是新增维护对象，所有者相同；不要比较对象内部 OID。再运行：

```bash
npm run db:verify -- migrate diff --from-config-datasource \
  --to-schema prisma/schema.prisma --exit-code
```

同样应为 0。现在我们有两类互补证据：工具支持范围内模型一致；数据库目录中那些必须保留、工具可能忽略的规则也一致。

### 让 CHECK 真正拒绝一次错误

在校验连接打开 `05-check-constraint.sql`，先看 `current_database()` 确实是校验库，再逐条选中执行以下语句：

```sql
BEGIN;
SET LOCAL lock_timeout = '3s';
INSERT INTO public.users (id)
VALUES ('50000000-0000-4000-8000-000000000001');

INSERT INTO public.captures (id, user_id, original_text)
VALUES ('50000000-0000-4000-8000-000000000002',
        '50000000-0000-4000-8000-000000000001', '');
```

用户在当前事务中已存在，因此第二条 INSERT 的关键失败不应是外键，而应是 SQLSTATE `23514`，约束名 `captures_original_text_nonempty`。这个安排把想观察的规则和其他失败原因分开。如果没有报错，先回滚，再检查是不是漏了 CHECK、连错库或没有执行目标语句，不能继续给日常库登记基线。

在同一个编辑器单独执行 `ROLLBACK;`。错误后事务进入失败状态，必须先结束它，再运行：

```sql
SELECT (SELECT count(*) FROM public.users) AS users,
       (SELECT count(*) FROM public.captures) AS captures;
```

两个计数都应为 0，临时用户也被回滚。不要在 DBeaver 的“发生错误后继续”设置下整段盲跑，否则很容易只看到后续的事务失败提示，错过第一个约束错误。

### 日常库只登记已有事实

确认重放结果和日常库结构都通过后，保持正式迁移文件不变，回到日常目标执行：

```bash
npm run db -- migrate resolve --applied 0_init
npm run db -- migrate status
```

这次不是执行建表 SQL。Prisma 创建自己的迁移表，并把 `0_init` 标成已应用。回到 DBeaver 的 **epp_dev** 连接，刷新表列表，执行 `04-inspect-history.sql` 的核心查询：

```sql
SELECT migration_name, checksum, started_at, finished_at,
       rolled_back_at, applied_steps_count
FROM public._prisma_migrations
ORDER BY started_at, migration_name;
```

应存在成功的 `0_init`：`finished_at` 有值、`rolled_back_at` 为空。再在校验库查询同一表。二者的 `migration_name` 和文件 `checksum` 应一致，但执行时间、内部记录 ID 和 `applied_steps_count` 不必一致；登记与实际执行本来就是不同路径，不应为了对齐它们手改迁移表。

![DBeaver 中成功登记的基线历史](images/03-history.jpg)

图中为了集中观察状态，将两个时间字段投影为布尔值：finished 为真、not_rolled_back 为真。左侧同一个 public 下保留 users、captures，并新增了迁移记录表。正式比较仍使用上面的完整查询，尤其要比较两库 checksum；一张状态截图不能证明结构或数据一致。

`checksum` 是迁移文件内容的校验值，用来发现同名迁移文件被修改。它不是数据库结构指纹，更不是业务数据备份。`migrate status` 对照的是迁移文件和历史记录；不能用“已同步”推断真实数据库从未被人手改。

再次运行日常库的 `02-inspect-data.sql`，与登记前保存的结果比较。用户 ID 与创建时间、两条记录的 ID、原文空格、归属、时间都应保持。再重新连接或打开新的结果集，确认看到的是提交后的实际状态。到这里，本章的两个目标才同时成立：旧数据仍在，新库能重建结构。

![基线登记后保留的原文、字符长度与 UTC 时间](images/02-data.jpg)

图中摘取原文、长度与 UTC 时间方便辨认：第一行长度 28，第二行 21。网格边界不一定能直观看出尾部空格，因此同时观察长度；完整验证仍比较 `02-inspect-data.sql` 的 ID、归属、时间和原文，不能只比较截图可见的三列。

### 中断以后，从事实决定下一步

停在生成模型后，可以从结构核对继续；停在空库 `deploy` 后，先在该库执行 `migrate status` 和历史查询。若已经成功，就继续结构与 CHECK 验证，不重新建库。成功应用的迁移再次 `deploy` 应成为无待执行操作，而不是重复创建对象。

如果 `resolve` 后终端连接中断，不先假设登记失败。检查日常库是否已有成功的 `0_init`；已有就继续数据对照，没有才在确认结构一致后重新登记。报“已应用”时也应核对状态，而不是删除历史表再重来。

若 `deploy` 失败，先读第一条错误、历史状态和实际对象。本章显式事务使业务 DDL 可以整体回滚，但迁移引擎仍可能保留失败记录。对于这个专用校验库，确认没有业务对象残留、没有其他数据且事务已经回滚后，修正尚未被任何目标成功应用的 SQL，使用 `npm run db:verify -- migrate resolve --rolled-back 0_init` 标记那条失败记录，再执行 `deploy`。`--rolled-back` 只改迁移状态，不会替你撤销 SQL；若对象仍在或不知道执行到了哪里，先调查，不先标记。

如果 CLI 只显示 `current transaction is aborted`，这是事务失败后的后续错误，尚未解释首因。在 DBeaver 查询失败记录：

```sql
SELECT migration_name, started_at, finished_at, rolled_back_at, logs
FROM public._prisma_migrations
WHERE finished_at IS NULL AND rolled_back_at IS NULL
ORDER BY started_at;
```

`logs` 也可能为空：若迁移事务失败后引擎未能写入错误详情，就只能看到未完成记录。此时用编辑器打开第十五章 `pg_ctl -l` 指定的 `server.log`，按失败时间和同一后端 PID 向前找第一条 ERROR 及相邻 STATEMENT。例如，迁移中一次除零先导致 `division by zero`，后面的“事务已失败”只是结果；重复执行部署不会修复除零。日志可能含 SQL 和业务值，定位时只在本地查看相关片段，不直接公开整份文件。

修复前还要在对象树刷新 Tables，并通过 `01-inspect-structure.sql` 确认业务表是否真的回滚；迁移表仍存在并不代表业务 DDL 也保留了。修复后成功重试，历史可以同时留下“已回滚的失败尝试”和“已完成的新尝试”，不需要删除失败行来得到一份看似干净的历史。

只要基线在任一目标成功应用或登记，就不再编辑它；需要修正时追加迁移。日常库与校验库都保留，后续不把校验库自动当成可随意清空的空间。真正的生产迁移失败还涉及部署协调、备份、锁与恢复责任，后续运维篇展开；当前必须掌握的是识别目标、执行状态和实际副作用，不能把“重试命令”当作通用恢复策略。

## 18.5 下一次变化怎样进入同一条历史

基线建立后，日常结构变化有了固定入口：先说明需求和兼容条件，修改模型，生成尚未应用的迁移，阅读实际 SQL，必要时补充数据操作，再应用和核对。当前没有新业务字段，不为展示命令制造空迁移。第二十章增加中文意图时会真正完成这一轮。

### 开发时为什么还需要影子库

开发者准备生成新迁移时，工具必须分清两种差异：本地模型表达了一个新需求，还是有人直接在开发库里改了结构。如果只拿“当前库”对比“新模型”，一次意外手改可能被当成正确起点，生成的迁移就无法在别的环境按历史重放。

`migrate dev` 会在影子库中重放已有迁移，得到“按照历史应该长什么样”的结构，再与开发库比较。开发库偏离这个结果叫结构漂移；确认历史没有偏差后，才根据目标模型计算下一步。文件是否被修改还要通过校验值判断，不是影子库独自完成所有检查。

影子库会被清空、重建或重置，不能装需要保留的数据。本章的 `epp_migration_check` 是保留结果供比较的独立校验库，职责不同。第二十章将在同一实例另建专用 `epp_shadow`，所有者仍为 `epp_owner`，通过 `.env.database` 的 `SHADOW_DATABASE_URL` 交给已有配置。这样 NOCREATEDB 的开发角色也能使用事先准备的影子库，不必扩大权限。影子库与日常库必须是不同数据库；不能只给同一数据库换个连接字符串或连接名。

准备好影子库并产生实际模型变化后，`npm run db -- migrate dev --name add_capture_intent --create-only` 会生成供审查的迁移。`--create-only` 的意思是暂不把这次新生成的迁移应用到开发库，不代表命令完全只读：它仍会操作影子库、检查漂移，遇到不一致可能要求 reset。因此保留数据的 `epp_dev` 出现重置提示时应拒绝，先核对连接、历史和手工修改。不能把命令里的 `dev` 理解成数据可以丢。

审查新 SQL 后，再用 `migrate dev` 应用开发迁移，并显式 `npm run prisma:generate`。Prisma 7 的迁移与客户端生成需要分别安排，不依赖旧版教程里自动生成或自动 seed 的行为。第十九章使用的构建前生成钩子也不会替你执行结构迁移。

### 部署时执行已经审查过的历史

`migrate deploy` 只把迁移目录里待执行的文件应用到目标环境，不生成新迁移，不使用影子库，不保证检测所有手工结构漂移，也不生成客户端。因此它适合执行已经准备并审查过的变化，而不适合在生产现场临时解释一个新模型。

部署会先在构建环境安装所需开发工具、生成客户端和编译；迁移任务也必须有 Prisma CLI 与完整迁移目录。若运行容器或主机只安装了生产依赖，不能期待其中还有开发依赖的 `prisma` 命令。迁移任务由部署系统注入目标 `DATABASE_URL`，通过 `npm run prisma -- migrate deploy` 执行；服务运行进程只需要编译产物与运行依赖。连接权限和环境配置各自准备，不复制本地密码文件到生产。

为什么不把 `db push` 放进日常流程？它适合某些无需保留演进历史的原型，把模型直接同步到数据库，却不留下本项目需要审查、重放的迁移步骤。一旦接管已有数据，不能在 `push`、手改表和 Migrate 之间随意切换，却仍假设所有环境拥有同一历史。

同样，Git 切回旧分支只改变文件，不会逆转已执行的数据库修改。删除迁移目录不撤销数据库变化，`resolve --rolled-back` 不执行逆向 SQL，客户端生成成功不让旧程序自动兼容新结构。遇到新增字段，一般可以先扩大结构兼容范围再更新应用；遇到删列，原值可能已经失去，所谓“撤回代码”无法把它变回来。这也是第二十章必须围绕旧记录安排可空字段、回填和约束收紧顺序的原因。

至此，我们建立了一种结构维护方式：模型描述程序可见的目标，迁移保存可审查的过程，数据库保存实际事实；工具支持范围外的规则在 SQL 中维护，并用目录与行为观察补上证据。设计时仍要回答谁拥有事实、什么变化被允许、旧数据怎样继续成立，再让工具执行这个决定。

下一章会把已经生成的客户端接到 Nest 的存储契约，让同一批数据库记录从 HTTP 接口读出来，并处理字段映射、字面搜索、错误与连接关闭。

本章完成代码使用分支 `part-03/chapter-18`。日常服务入口仍为 `npm run dev`，生产产物入口仍为 `npm run build` 后的 `npm start`；本章未改变 HTTP 的存储行为。

## 知识支线

[支线 18A：结构有差异，应该改哪一边](side-01-designing-structural-changes.md)把本章的设计判断展开为两组对照：用映射、删加列和物理重命名比较旧值与程序兼容；用额外索引解释历史同步、结构漂移，以及恢复误操作和保留有效需求的不同路径。阅读约 35～45 分钟，操作约 25～35 分钟，均为估算。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| Prisma Schema／Client／数据库 | 分别保存模型描述、生成代码和真实结构／行 | 一个产物变化不会自动同步全部产物 |
| `prisma.config.ts` | 指定模型、迁移路径和 CLI 数据源 | v7 URL 在配置侧读取；生成不要求本地秘密 |
| `db`／`db:verify` | 分别加载日常库与校验库配置 | 已导出的环境变量优先于 env 文件 |
| `db pull`／`--print` | 反向读取已有结构 | 前者写本地模型，后者只输出；都不建业务表 |
| `@map`／`@@map` | 分离字段／模型名与列／表名 | 不要把客户端改名误做成物理重命名 |
| `@db.Uuid`／`@db.Timestamptz(3)` | 保留物理类型与时间精度 | JS 表示相同不代表数据库语义相同 |
| 关系字段／外键标量 | 表达导航关系与真实引用列 | 关系字段不是新列，也不自动查询或鉴权 |
| `validate`／`generate` | 检查模型、生成 TypeScript | 不执行迁移，不证明连接或结构一致 |
| `migrate diff` | 比较两个结构来源 | 核对方向；不覆盖所有数据库特性；不是数据比较 |
| `--exit-code` | 为 diff 提供可区分的结果状态 | 0 无差异、2 有差异、1 错误 |
| `0_init`／迁移 SQL | 重建接管时的业务结构 | 补回 CHECK，不混入开发 seed，成功应用后不修改 |
| `migration_lock.toml` | 保存迁移提供者信息 | 和迁移一起版本管理，不是数据库运行锁 |
| `resolve --applied` | 在已核对的既有库登记基线 | 不执行该迁移，不验证现有结构 |
| `migrate deploy` | 执行待应用的迁移历史 | 不生成迁移、不用影子库、不生成客户端 |
| `_prisma_migrations`／`status` | 查看迁移执行与历史状态 | checksum 是文件校验值，不是结构或数据指纹 |
| `resolve --rolled-back` | 标记经核实已回滚的失败迁移 | 不撤销数据库中的实际操作 |
| `migrate dev`／影子库 | 在开发中重放历史、检查漂移并生成变化 | 影子库可被重置；与保留数据的库严格分开 |
| `--create-only` | 留出审查新迁移 SQL 的时机 | 不等于整个命令无副作用 |
| `install-scripts approve`／`rebuild` | 在支持该机制的 npm 中批准并执行必要安装脚本 | 查看具体包和版本，不全局放开无关脚本 |

安装行为可回查 [npm 安装脚本管理](https://docs.npmjs.com/cli/v11/commands/npm-install-scripts/)；结构观察可回查 [PostgreSQL 18 的 pg_constraint](https://www.postgresql.org/docs/18/catalog-pg-constraint.html)。

官方查阅：[Prisma 7.10.1 发布记录](https://github.com/prisma/orm/releases/tag/7.10.1)、[v7 配置](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference)、[Introspection](https://www.prisma.io/docs/orm/v7/prisma-schema/introspection)、[数据库映射](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/database-mapping)、[生成器](https://www.prisma.io/docs/orm/v7/prisma-schema/overview/generators)、[数据库特性支持](https://www.prisma.io/docs/orm/v7/reference/database-features)、[基线](https://www.prisma.io/docs/orm/v7/prisma-migrate/workflows/baselining)、[CLI](https://www.prisma.io/docs/orm/v7/reference/prisma-cli-reference)、[影子库](https://www.prisma.io/docs/orm/v7/prisma-migrate/understanding-prisma-migrate/shadow-database)、[升级 v7 的命令变化](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)、[PostgreSQL 18 CREATE DATABASE](https://www.postgresql.org/docs/18/sql-createdatabase.html)。

[上一章：SQL](../chapter-17-sql/chapter.md) · [返回第三篇](../README.md) · [返回全书目录](../../README.md)
