# 第 15 章 PostgreSQL 运行环境：安装、连接与实例管理

第二篇已经为存储替换留好了 `CaptureStore` 接口，也建立了配置校验、请求日志和资源关闭流程。接入 PostgreSQL 以后，需要把这些边界落实到外部依赖：连接哪个实例、使用什么权限、什么时候确认写入完成，以及连接失败时去哪里取证。

本章先把 PostgreSQL 环境准备到可以反复开发和排错的程度：安装指定大版本，管理独立实例，建立开发角色，用 psql 与 DBeaver 核对连接，再处理启动、认证和目标库错误。下一章建表，第十七章展开 SQL，第十八章纳入 Prisma 迁移管理，第十九章替换 Nest 存储。先掌握数据库侧的操作，接入 ORM 后才有办法独立判断问题落在哪一层。

代码起点是 `part-02/chapter-14` 的主线：原文上限仍为 2000 个 UTF-16 单元，存储仍为 Map。上一章收紧到 1200 单元及替换数组的练习不进入这里。本章配套分支为 `part-03/chapter-15`，新增 `database/chapter-15/` 中的环境准备和只读诊断文件，业务源码、Node 依赖与接口保持原状。

## 15.1 从现有存储契约确定接入边界

### 替换存储时，哪些行为必须保持

`CaptureStore` 已经提供异步的新增、列表和详情方法。接下来可以替换实现，但原有契约仍需保持：原文保留输入空格，详情使用原 ID，列表先筛选再限量，成功输出继续经过现有响应 Schema。数据库模型需要服务于这些行为，而不是让表结构直接决定公开响应。

有些内存实现中顺带成立的条件，需要重新作出决定。例如 Map 遍历具有插入顺序，SQL 查询若没有明确排序就不能接替这个保证；目前使用 JavaScript 字符串和 ISO 时间，数据库类型及驱动转换也必须与既有契约对齐。下一章先处理模型和类型，第十七章落实查询表达，第十九章再核对适配层。

新增的工程责任在失败路径上更明显。数据库不可用时，创建操作不能自动降级到 Map；写入成功后响应链路失败，也不能简单推断数据库中没有记录。第二篇已经区分过存储完成与响应完成，数据库接入会进一步要求我们以提交状态和实际查询结果判断。这里先确定这些要求，避免接入时只把三个方法改成 ORM 调用便结束。

本篇使用 PostgreSQL，主要考虑后续 API、后台工作进程和管理命令需要共同访问数据，并继续实践并发事务与结构演进。SQLite 可以降低单机应用的服务维护成本；选择独立数据库服务，则需要同时承担连接管理、账号授权和运行维护。下面的环境工作就是这次选型的一部分。

### 数据范围不要跟着工具选择膨胀

首批业务字段仍是 `id`、`originalText`、`createdAt`，下一章逐项确定 SQL 类型、约束及 API 表示。

还有一个以前暂时没有落地的需求：用户只能查看自己的记录。数据库版本因此需要记录归属，并建立最小用户表。不过当前接口尚无登录身份，也没有可靠的 `userId` 来源。下一章会明确建立固定开发用户，先让记录能够指向一个确实存在的用户；这不等于已经实现登录，也不能让客户端随意传一个 userId 就获得访问权。身份和授权在后续篇章接入。

所以这里确定的是持久化范围，而不是假装现有对象已经有全部字段。中文意图到第二十章才增加；修订、候选、采纳也还没有进入模型。眼前先把原有记录和归属保存可靠，再观察增加字段时怎样保留旧数据。

## 15.2 PostgreSQL 实例如何定位和授权

### 用数据目录确定正在管理的实例

一台开发机可能同时装有多个 PostgreSQL 大版本，也可能已经运行着安装器创建的默认实例。此时 `psql --version` 只能说明当前 PATH 选中了哪个客户端，不能回答接下来操作的是哪个服务。我们需要把启动参数和连接结果对应起来。

PostgreSQL 将一个初始化数据目录管理的一组数据库称为 **database cluster**，这里的 cluster 不表示多机高可用。`initdb -D` 初始化这个目录，`pg_ctl -D` 管理它对应的服务；真正执行服务的是 postgres 程序。后面固定同一个 `-D`，再通过管理员查询 `SHOW data_directory` 核对连接目标，就能把操作系统侧的进程管理与数据库侧的诊断接上。

数据目录与大版本有关。安装另一个大版本的程序，不代表已有数据已完成升级；`PG_VERSION` 用于确认目录所属大版本。本章固定 PostgreSQL 18，不用重新 initdb 的方式处理升级或启动错误。

初始化得到的 postgres 库用于管理连接，template0、template1 用于创建数据库；业务实践另建 epp_dev。角色属于整个 cluster，同一角色可以在不同库获得不同权限；Schema 和表则属于具体数据库。因而“在另一个库里也看到了 epp_owner”是正常的，但不能由此推断两个库中的对象授权相同。相关作用范围见 [PostgreSQL 18 数据库概览](https://www.postgresql.org/docs/18/manage-ag-overview.html)。

### 开发库所有者需要哪些权限

本章创建两个数据库角色：`epp_admin` 是初始化时的实例管理员，只在创建角色、数据库和查看管理配置时使用；`epp_owner` 是开发库的所有者，用于本地建表和演进结构。后者没有超级用户、创建数据库或创建角色权限，但它能修改自己拥有的数据库对象，仍然不是生产 API 应当直接使用的最小权限账号。

这样做把“管理整个实例”和“管理一个开发库”先分开。部署时还要区分迁移身份和运行身份：迁移身份允许必要的结构变更，API 身份只获得业务所需的数据权限。现阶段既没有表，也没有数据库版 API，不提前建立一套名字齐全、权限却没有实际对象可核对的生产账号。

### 连接参数中的默认行为会怎样影响排错

本章显式固定 host、port、user 和 dbname，避免客户端默认参数把请求送到另一个实例。以不含密码的 URI 为例：

```text
postgresql://epp_owner@127.0.0.1:55432/epp_dev?connect_timeout=5
```

密码由客户端单独提示，或来自经过保护的秘密配置。不要把真实密码放进终端命令、截图、SQL 文件或仓库。带密码的 URI 还会遇到 `@`、`:`、`/` 等保留字符，必须对密码这一组成部分做百分号编码，不能编码整个 URL。本章用交互密码，先避免让连接串解析掩盖身份问题。

`connect_timeout=5` 约束建立连接的等待，不是每条 SQL 的执行期限，也不保证取消服务器已经开始的工作。后续驱动的连接池参数也不一定与 psql 的参数相同，不能把任意客户端设置原样塞进另一个库。参数与 URI 格式见 [libpq 连接文档](https://www.postgresql.org/docs/18/libpq-connect.html)。

这里始终显式写 `127.0.0.1` 和 `55432`。省略 host 时，macOS/Linux 的 psql 通常尝试 Unix-domain socket，可能走不同的认证规则；省略库名时，客户端还可能使用与角色同名的数据库。`psql` 能进入某个提示符，不足以证明它进入了本章的目标库。我们稍后会让服务器自己返回这些信息。

### Schema 搜索路径不是连接目标

SQL 中只写 `captures` 时，PostgreSQL 会按 `search_path` 找表；明确写 `public.captures` 则把命名空间也写出来。默认常能看到 `"$user", public`，意思是尝试与当前角色同名的 Schema，再找 public；不存在或无权使用的项不会成为可用的搜索目标。`$user` 不会替你自动创建 Schema。

因此，连接 epp_dev 与选择 public 是两个不同动作。DBeaver 里展开了 public，也不能仅凭视觉推断另一个 SQL 编辑器采用了相同的连接上下文。第十六章的建表会显式说明命名空间；现在先知道用 `SHOW search_path` 和 `current_schema()` 查看实际解析环境。把不可信角色可写的 Schema 放在搜索路径上也会带来对象替换风险，这不是一个纯粹的界面偏好，详见 [Schema 与搜索路径](https://www.postgresql.org/docs/18/ddl-schemas.html)。

## 15.3 安装、启动，再从两个客户端连接同一个库

### 先统一运行方式，避免装出两个相互混淆的实例

本篇采用 PostgreSQL **18.x**，安装当前维护的小版本；服务端和 psql 客户端都使用 18。下面分别给出 macOS 和 Ubuntu／WSL Ubuntu 的安装入口，后续初始化与运行命令相同。Windows 延续前文的 WSL 路线，数据库和 psql 都在同一个 WSL 发行版中；不另起 Windows 原生 PostgreSQL 来混用。

我们只用包管理器安装程序，另建一个由当前普通操作系统账号拥有的学习实例，通过 `pg_ctl` 显式启停，端口使用 55432。PostgreSQL 常见默认端口是 5432；这里选择另一个端口，是为了与机器上可能已有的默认实例分开。端口没有特殊语义，后续所有客户端必须保持一致。

直接使用安装器的默认服务也可以，但不同安装方式的管理员身份、数据目录、端口和自动启动行为不同。独立实例让这些条件都在读者眼前建立。部署篇再讨论系统服务和开机恢复；这里使用官方工具，不为数据库另外造一套后台管理脚本。

**macOS** 在已有 Homebrew 的终端执行：

```bash
brew install postgresql@18
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
postgres --version
psql --version
```

尚未安装 Homebrew 时，先按 [Homebrew 官方入口](https://brew.sh/)完成安装并重新打开终端。这里的 PATH 在当前终端生效；新终端先重复 export，熟悉后再将同一行加入自己的 shell 配置。不要为找不到 psql 而随意链接另一个大版本。

Homebrew 的 formula 可能已经创建默认数据目录；本章不启动它，也不执行 `brew services start postgresql@18`。后续只管理自己创建的目录。若已经运行其他实例，保留它，不停止或删除不属于本次实践的服务。[formula 官方说明](https://formulae.brew.sh/formula/postgresql@18)列出其默认目录和服务命令，可以据此分清两者。

**Ubuntu／WSL Ubuntu** 先确认所用系统版本受 PostgreSQL 官方 Apt 仓库支持，再按下面路径安装。没有 sudo 权限或不在支持列表时，先依据[官方 Ubuntu 下载页](https://www.postgresql.org/download/linux/ubuntu/)选择适用安装方法，不把另一个发行版的代号硬填进去。

```bash
sudo apt update
sudo apt install -y postgresql-common
sudo /usr/share/postgresql-common/pgdg/apt.postgresql.org.sh
sudo apt update
sudo apt install -y postgresql-18
export PATH="/usr/lib/postgresql/18/bin:$PATH"
postgres --version
psql --version
```

第三行运行已安装包提供的官方仓库配置工具，按提示完成；后续再安装指定大版本。包安装可能同时创建或启动系统默认实例，那通常由 postgres 系统账号管理，和接下来由你自己创建的实例不同。后续的 `initdb`、`pg_ctl` 不加 sudo，也不去接管系统默认目录。

两条路径都必须看到 18.x。`psql --version` 只说明客户端程序版本，连接后还要查服务器版本。安装成功、服务启动、账号登录和 SQL 执行是四个不同的事实，每一步都有自己的证据。

### 初始化一次，以后反复启动

在普通用户的 shell 中设置数据目录变量：

```bash
export EPP_PGDATA="$HOME/.local/share/epp-book/postgresql-18"
mkdir -p "$HOME/.local/share/epp-book"
```

这是读者自己机器上的持久化目录，不在代码仓库、dist、临时目录或云盘同步目录中。构建清理不应碰到它，切换章节也不应让它消失。WSL 中保存在 Linux 用户目录内，不放到 `/mnt/c` 下。后面的 `$EPP_PGDATA` 均指这个目录；重开终端要重新执行 export。

首次运行下面这段。它在目标路径已经存在时停止初始化，避免把“重新开始”误解成清空数据：

```bash
if [ -e "$EPP_PGDATA" ]; then
  printf '%s\n' '目标目录已经存在；先确认其来源和 PG_VERSION，不重复初始化。'
else
  initdb -D "$EPP_PGDATA" \
    --username=epp_admin --pwprompt \
    --encoding=UTF8 --locale=C \
    --auth-local=scram-sha-256 --auth-host=scram-sha-256
fi
```

出现提示时，为 epp_admin 设置独立的开发管理密码，保存在密码管理工具里。`--username` 命名的是数据库管理员，不会创建同名操作系统账号；数据目录仍归运行命令的系统账号所有。`--pwprompt` 让密码交互输入；两项 auth 明确让 socket 和 TCP 连接使用 SCRAM 密码认证，不依赖安装器可能采用的 trust 默认值。

`UTF8` 决定文字编码，可以保存中文和英语。`C` 是这里明确选择的排序／字符分类区域设置，不是“只支持英文”；它也不保证中文按拼音、人名按自然语言习惯排序。后面设计查询时会把排序字段和顺序明确写出，需要自然语言排序时再选择相应 collation。初始化选项见 [initdb 文档](https://www.postgresql.org/docs/18/app-initdb.html)。

初始化成功以后检查：

```bash
cat "$EPP_PGDATA/PG_VERSION"
```

应是 `18`。若前面提示目录已存在，只有确认它确实是自己的本书实例、版本正确，才继续。若是失败留下的不完整目录，先查看初始化错误和目录内容，改用新的空目录重新尝试；不要用 `rm -rf` 把来源不明的目录变成“可初始化”。

在该目录的 `postgresql.conf` **末尾添加一次**下面的设置；以后需要修改时编辑这几项，不反复追加重复配置：

```conf
listen_addresses = '127.0.0.1'
port = 55432
unix_socket_directories = ''
password_encryption = 'scram-sha-256'
timezone = 'UTC'
```

本例只接受本机 IPv4 TCP 连接，不开放网络地址，也暂时禁用 socket，保证两种客户端走同一条路径。SCRAM 用于密码认证；它不等于连接中的 SQL 和结果已经启用 TLS。这里使用同机回环连接，远程部署要另外建立可信网络、证书验证和最小权限，不能把地址改成 `0.0.0.0` 就宣布可用于公网。

`timezone` 固定服务器会话的默认显示时区为 UTC，便于跨客户端比较。它与时间字段本身的类型不同；下一章会解释时间点、时区显示与 JSON。上述连接配置的生效方式见[服务器连接配置](https://www.postgresql.org/docs/18/runtime-config-connection.html)，监听地址、端口和 socket 目录的变化需要重启。

现在启动：

```bash
pg_ctl -D "$EPP_PGDATA" -l "$EPP_PGDATA/server.log" -w start
pg_ctl -D "$EPP_PGDATA" status
pg_isready -h 127.0.0.1 -p 55432 -t 5
```

`-D` 指定管理哪个实例，`-l` 把服务端启动和错误信息写入指定日志，`-w` 等待启动结果。服务退出启动命令后继续运行；关闭 psql 也不会让它停止。这里没有注册自动启动服务，机器重启后要再次执行 start，而不是再次 initdb。

status 应显示服务正在运行，pg_isready 应显示 accepting connections。后者只证明入口正在接收连接，不证明 epp_owner 已存在、密码正确或表能查询。`pg_isready` 的退出码也可以区分接受、拒绝、无响应和参数问题，见[官方说明](https://www.postgresql.org/docs/18/app-pg-isready.html)。

若启动失败，先执行 `tail -n 50 "$EPP_PGDATA/server.log"`。`address already in use` 表示地址或端口冲突，macOS 可用 `lsof -nP -iTCP:55432 -sTCP:LISTEN`，Linux 可用 `ss -ltnp 'sport = :55432'` 核对监听者。不要杀掉所有 postgres 进程；如确需换端口，修改本实例配置并同步后面所有连接。日志可能带有路径和数据库错误上下文，分享前只保留必要且已清理的信息。

### 从管理员连接建立开发角色和数据库

从配套代码仓库根目录执行以下 shell 命令。它明确连接 postgres 管理库，密码提示中输入的是 epp_admin 的密码：

```bash
psql -X -W -v ON_ERROR_STOP=1 \
  'host=127.0.0.1 port=55432 dbname=postgres user=epp_admin connect_timeout=5'
```

`-X` 不读取个人 psql 启动配置，减少自动切库或事务设置的干扰。`-W` 要求密码提示，但是否校验密码仍由服务器认证规则决定；不能靠看见提示框判断认证安全。`ON_ERROR_STOP` 让后面执行的脚本遇错停止，避免前一步失败后继续做下一步，但不会把已经提交的操作撤销。

进入 psql 后，下面这些是 **psql 内的输入，不是 shell 命令**：

```psql
\conninfo
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SHOW server_version;
SHOW data_directory;
SHOW hba_file;
```

数据库应是 postgres，角色是 epp_admin，端口是 55432，数据目录应对应刚刚初始化的位置。路径由管理员查看即可，不写进应用日志。若这里已经不符合预期，先退出并修正连接，不能在不明实例上继续建角色。

在 `database/chapter-15/01-create-role.psql` 保存以下内容：

```psql
\set ON_ERROR_STOP on

CREATE ROLE epp_owner
  LOGIN
  NOSUPERUSER
  NOCREATEDB
  NOCREATEROLE
  NOREPLICATION;

\password epp_owner
```

`LOGIN` 允许角色登录，后面明确移除实例级管理能力。最后一行是 psql 的交互密码命令，不是 SQL；它避免把明文密码写进 SQL 历史与脚本。这个密码属于 epp_owner，应与管理密码区分。角色定义见 [CREATE ROLE](https://www.postgresql.org/docs/18/sql-createrole.html)。

再保存 `database/chapter-15/02-create-database.sql`：

```sql
CREATE DATABASE epp_dev OWNER epp_owner;
REVOKE ALL ON DATABASE epp_dev FROM PUBLIC;
```

第一句建立数据库并指定所有者。第二句收回所有角色默认通过 PUBLIC 获得的数据库级权限；这里大写 PUBLIC 是“所有角色”的权限集合，不是小写 public Schema。所有者仍能管理自己的库。它不替代 Schema 和表权限设置，也不限制超级用户；这里只让当前开发库的初始授权范围明确。

按顺序在刚才的 psql 会话执行：

```psql
\i database/chapter-15/01-create-role.psql
\i database/chapter-15/02-create-database.sql
\du epp_owner
\l epp_dev
\q
```

`\i` 从 psql 的当前工作目录读取文件；找不到文件时先检查自己从哪里启动客户端，不需要修改数据库。`\du` 查看角色，`\l` 查看数据库，`\q` 只退出客户端。第一份文件的反斜杠命令不能交给 DBeaver 普通 SQL 编辑器。

这里保持 psql 默认自动提交，不在外面套 `BEGIN`，也不使用 `psql --single-transaction`；`CREATE DATABASE` 不允许在事务块中执行。角色、库和授权是依次完成的独立动作，参见 [CREATE DATABASE](https://www.postgresql.org/docs/18/sql-createdatabase.html)。

如果第二步失败，第一步的角色可能已经存在。重新登录管理员，先用 `\du epp_owner`、`\l epp_dev` 查看实际状态：角色存在但密码设置中断，就只重做 `\password epp_owner`；库不存在就只执行建库；库已存在则核对所有者，再补失败的授权语句。不要为了消除 already exists 而删库，也不要把这些文件加入每次 `npm run dev` 的启动流程。

### 换成开发角色，让服务器证明连接目标

重新从 shell 连接，这次输入 epp_owner 的密码：

```bash
psql -X -W -v ON_ERROR_STOP=1 \
  'host=127.0.0.1 port=55432 dbname=epp_dev user=epp_owner connect_timeout=5'
```

不要只依赖提示符里的 epp_dev。把以下只读查询保存为 `database/chapter-15/03-inspect.sql`：

```sql
SELECT
  current_database() AS database_name,
  session_user AS login_role,
  current_user AS effective_role,
  inet_server_addr() AS server_address,
  inet_server_port() AS server_port,
  pg_backend_pid() AS connection_pid,
  current_schema() AS first_schema;

SHOW server_version;
SHOW server_encoding;
SHOW TimeZone;
SHOW search_path;

SELECT
  datname AS database_name,
  pg_get_userbyid(datdba) AS database_owner,
  shobj_description(oid, 'pg_database') AS environment_note
FROM pg_database
WHERE datname = current_database();
```

先在 psql 内执行 `\i database/chapter-15/03-inspect.sql`。第一段读取会话身份和服务端连接信息，SHOW 查看实际生效的设置，最后从系统目录 pg_database 查询当前库的所有者和备注。以后排查应用与客户端结果不一致，可以复用这份查询逐项比较。系统信息函数见[官方说明](https://www.postgresql.org/docs/18/functions-info.html)。

预期 database_name 为 epp_dev，两个角色字段都是 epp_owner，地址与端口为 127.0.0.1 和 55432，first_schema 为 public。server_version 应为 18.x，server_encoding 应为 UTF8，TimeZone 应为 UTC。environment_note 目前可以是 NULL，表示还没写备注。

session_user 表示最初登录角色，current_user 表示当前执行权限的角色；没有切换角色时两者相同。connection_pid 是服务器为这条连接工作的进程编号；两条连接即使账号相同，通常也有不同的编号。它不是 Node 的 PID，不能拿去结束 API 进程。

最后在 psql 执行 `\dt public.*`，核对当前 public 下的表；本章应为空，第十六章再建立业务表。

这里可以先停下：实例、角色和开发库已经建立，03-inspect.sql 可以证明当前连接。保存 SQL 文件，并在自己的开发笔记中记下数据目录、端口和做到的小节，密码仍留在密码管理工具里。下次从本章末尾的[日常恢复入口](#隔天继续开发时从哪里接上)返回，再继续下面的 DBeaver 对照；不用重跑创建角色和建库文件。

### 用 DBeaver 做相同的事情

从 [DBeaver Community 官方下载页](https://dbeaver.io/download/)安装免费社区版。首次连接 PostgreSQL 时可能需要下载 JDBC 驱动；下载失败是客户端依赖获取问题，并不说明服务器密码错误。驱动下载完成后，才开始比较实际数据库连接结果。

1. 选择 **Database → New Database Connection**，搜索并选择 PostgreSQL。
2. 使用 Host 连接方式，Host 填 `127.0.0.1`、Port 填 `55432`、Database 填 `epp_dev`、Username 填 `epp_owner`。密码填这个角色的密码，不填 epp_admin 的密码。保持直接连接，不启用 SSH 隧道；本章实例没有配置 TLS，SSL 设置不要强制要求 TLS。
3. 点击 **Test Connection**。成功后将连接命名为 `EPP · DEV · 55432 · epp_dev`，保存。密码若选择保存，应只在自己的受保护客户端配置中保存，不导出到项目资料。
4. 在左侧 Database Navigator 对这个连接打开 **SQL Editor → New SQL Script**。确认编辑器工具栏所选的数据源就是刚才的连接；打开旧脚本文件并不保证自动关联正确的数据源。
5. 粘贴 03-inspect.sql，先选中第一条 SELECT，通过 **Execute SQL Statement** 执行，查看下方结果表。然后逐条运行 SHOW 和最后的查询；也可以用 **Execute SQL Script** 执行整份只读文件并查看各个结果页。

连接向导和 SQL 执行入口分别见 [DBeaver 连接文档](https://dbeaver.com/docs/dbeaver/Create-Connection/)与[SQL 执行文档](https://dbeaver.com/docs/dbeaver/SQL-Execution/)。菜单译名或快捷键会随平台变化，优先按动作名称找，别把“执行光标所在语句”误当成“执行整个脚本”。

对照 psql 的结果：库、角色、地址、端口和所有者应一致；connection_pid 不要求相同，因为这是两个独立会话。展开 `Schemas → public → Tables`，此时仍没有业务表。导航树缓存了对象信息，后面建表后用 Refresh 刷新；结果表也不会因为另一个客户端写了数据就自动重新查询。

在 SQL 编辑器的事务模式菜单中确认当前为 **Auto-commit**；如果启用了 Smart commit，也记住它可能在修改语句前切到手动提交。保存 SQL 文件只是保存文字，执行修改语句也不总等于提交。下一节的备注写入先在 psql 默认自动提交会话完成，DBeaver 只负责重新查询观察；有真实业务行以后，第十七章会展开两个会话的提交可见性。模式入口可参照 [DBeaver 事务模式](https://dbeaver.com/docs/dbeaver/Auto-and-Manual-Commit-Modes/)。

**Windows 上的 DBeaver 连不上 WSL 时**，先在安装数据库的那个 WSL 发行版中，用上面的完整参数新建 psql 连接并执行诊断。成功只能证明 WSL 内部的连接成立，还要区分 Windows 到 WSL 的 TCP 路径与 DBeaver 的驱动、认证设置。在 **Windows PowerShell** 执行：

```powershell
wsl --list --verbose
Test-NetConnection -ComputerName 127.0.0.1 -Port 55432
```

第一条确认目标发行版正在运行及其 WSL 版本；第二条看 `TcpTestSucceeded`，不要用 Ping 的结果判断数据库端口。若为 True，Windows 已能建立 TCP 连接，继续看 DBeaver 的完整错误，并核对驱动下载、库、账号和 SSL 设置；成功登录后仍须执行 03-inspect.sql，排除端口实际指向另一个服务。若为 False，先处理跨环境路径，改数据库密码没有作用。命令输出含义见 [Test-NetConnection](https://learn.microsoft.com/en-us/powershell/module/nettcpip/test-netconnection)。

对于 WSL 2，在 Windows 用户目录的 `.wslconfig` 中查看 `[wsl2]` 下的 `networkingMode` 与 `localhostForwarding`；文件不存在时使用默认配置。默认 NAT 模式的 localhost 转发默认开启，若此前明确设置了 `localhostForwarding=false`，将该项恢复为 `true`，保留其他设置。镜像模式忽略这一项，不靠反复修改它排错。修改 WSL 配置需要重启 WSL 才能应用：先保存各发行版工作、按本章 15.4 正常停止数据库，再在 PowerShell 执行 `wsl --shutdown`；它会停止所有运行中的发行版。重新打开目标发行版，按日常恢复入口启动数据库，再重复上面的探测。

配置正确仍失败时，沿 [WSL 网络说明](https://learn.microsoft.com/en-us/windows/wsl/networking)与[配置说明](https://learn.microsoft.com/en-us/windows/wsl/wsl-config)核对当前模式及 VPN／防火墙限制。保留“WSL 内 psql 成功、Windows TCP 探测失败”的对照作为定位依据，不通过关闭全部防火墙或放开数据库监听来试运气。此时可以先用 psql 继续 SQL 操作，图形客户端的连接问题仍需沿这条路径解决。

### 改一个条件，区分三类常见失败

先在 DBeaver 复制刚才的开发连接，命名为 `EPP · 连接诊断`。只改副本，每次只改一项，测试后恢复；原连接保留作为成功对照。psql 也可用新连接重复相同操作。

**第一种：入口没有接受连接。** 将诊断副本的端口改到你已确认没有服务监听的本机端口，例如 55433。预期是 connection refused；如果出现别的服务响应，说明这个端口并不空闲，不能继续在该目标上试密码。此时还没有进入 PostgreSQL 的身份验证，不应先重设密码。核对端口、pg_ctl status、pg_isready 和服务日志，修复后再测原来的 55432。

**第二种：到达服务，但身份验证失败。** 恢复正确端口，只改成错误密码，预期出现 password authentication failed。说明连接已经到达某个 PostgreSQL 认证入口，但不能单凭这个错误保证角色存在，也不能证明这一定是期望实例。先和成功连接比较 host、port、user，再以管理员核对角色、密码设置和认证规则。不要改成 trust 来“解决”错误；正确密码能连上、错误密码会失败，才是本例要建立的对照。

**第三种：连接到了不存在的库，或连错了库。** 恢复密码，将 Database 改成 `epp_missing`。在前面认证条件成立时，应看到 database does not exist。这不需要重装服务，只需要核对建库是否成功及拼写。再把 Database 改为 `postgres`：它可能连接成功，却不是 epp_dev。运行 current_database()，就能发现这个更容易误判的问题。连接成功只是连接成功，不能代替目标确认。

恢复诊断副本为 epp_dev，并重新运行 03-inspect.sql。以后排查“DBeaver 有数据，API 没数据”，也先比较这些结果，而不是一开始就怀疑 ORM 缓存。若错误是 permission denied，则已进一步走到对象授权判断；连接账号正确，不代表它对每个 Schema、表或序列都拥有权限。

还有两个发生在客户端或连接建立更早位置的错误：`psql: command not found` 先查 PATH 和客户端安装；连接持续超时先查地址、路由或过滤，不把它与本机立即 connection refused 混为一谈。数据库服务根本没起来时，Nest 的请求日志也不会替数据库解释启动失败，应该回到数据库自己的日志。

## 15.4 验证实例启停，固定后续开发环境

### 保存环境标识，建立跨客户端核对依据

后续会同时使用日常开发库和迁移校验库。除了给客户端连接命名，还可以给库本身加一条用途备注，让诊断查询直接返回环境标识。备注便于人工核对，不能代替实例地址、权限和配置隔离。

在 epp_owner 连接的 psql 中，先用 `\conninfo` 和 03-inspect.sql 确认目标。保持新开的默认自动提交会话，没有进入 BEGIN，然后执行：

```sql
COMMENT ON DATABASE epp_dev IS 'EPP development database; keep across chapters';
```

COMMENT 将说明写入系统目录，03-inspect.sql 中的 shobj_description 负责读取。按 [COMMENT 文档](https://www.postgresql.org/docs/18/sql-comment.html)的可见性约定，这里只保存环境用途，不写密码、连接凭据或个人信息。

在 DBeaver 重新执行 03-inspect.sql 的最后一条 SELECT，environment_note 应出现刚才的文本。若没有看到，先比较实例和库，再确认写入会话是否处于手动事务中；若是，需要明确 COMMIT。后续查询业务数据时，也按目标环境、事务状态、实际查询结果这个顺序排查。

### 选择关闭模式，并核对重新连接的实例

接下来结束 psql 会话，并在 DBeaver 对开发连接选择 Disconnect。只对本章自己建立的实例执行：

```bash
pg_ctl -D "$EPP_PGDATA" -m fast -w stop
pg_ctl -D "$EPP_PGDATA" status
pg_isready -h 127.0.0.1 -p 55432 -t 5
```

预期 status 报告未运行，pg_isready 无响应并返回非零状态。保留当前数据目录，下面使用同一个 -D 重新启动。

`fast` 是 PostgreSQL 定义的一种受控关闭：拒绝新连接，结束已有会话、回滚活动事务，再正常关闭。它不是 `kill -9`。本例先断开客户端是为了让操作更清楚；即便忘了断开，fast 也不会像 smart 模式那样一直等客户端主动退出。不要在共享实例或有重要工作进行时做这个实验。[pg_ctl 文档](https://www.postgresql.org/docs/18/app-pg-ctl.html)解释了 smart、fast、immediate 的区别。

重新启动同一个目录：

```bash
pg_ctl -D "$EPP_PGDATA" -l "$EPP_PGDATA/server.log" -w start
```

在 DBeaver 重新连接，再执行诊断查询；psql 则退出旧的失效连接后，用原命令新建连接。库、角色、所有者和备注都应保留，connection_pid 可能改变。旧结果页没有消失不能证明连接仍有效，必须真的再次发送查询。

为什么 immediate 会把恢复工作留到下次启动？PostgreSQL 修改数据时，会先生成描述变化的预写日志（WAL）。在默认持久化设置下，向客户端确认提交前，相关 WAL 必须可靠落盘；保存表和索引内容的数据页可以稍后再写。这样每次提交不用等待所有改动过的数据页都落盘，异常中断后则可依据 WAL 重做尚未写回的数据变化。这里的 WAL 是数据库恢复协议的一部分，与前面供人排错的 server.log 不同。

fast 会结束活动事务并正常收尾；immediate 跳过正常收尾，下次启动便需要完成崩溃恢复。因此换成 immediate 可能只是把等待推到下一次启动，恢复完成前服务也不能按正常状态使用。日常启停沿用 fast，保留默认持久化设置；关闭 fsync 会破坏上述可靠落盘的前提。进一步的机制见 [WAL 概述](https://www.postgresql.org/docs/18/wal-intro.html)与前面的 pg_ctl 文档。

本次核对的是指定实例的受控启停、新连接及环境状态，崩溃恢复和备份恢复需要另外验证。部署运维篇会建立相应流程；当前实例用于本机开发。

### 从今天起，不用重建来绕过演进

下一章开始，epp_dev 中会有用户、记录和后续字段。本篇一直保留它们：先手写表和 SQL，再把现有结构纳入 Prisma 管理，然后追加迁移。这样才有机会观察“新代码遇到旧数据”的问题；每章重新建库会把最需要理解的兼容责任删掉。

需要练习错误迁移或清空表时，另建可丢弃环境。例如以管理员连接 postgres，执行 `CREATE DATABASE epp_lab OWNER epp_owner;`，随后执行 `REVOKE ALL ON DATABASE epp_lab FROM PUBLIC;`。这个库初始为空，不会复制 epp_dev 的表或数据。以后有了迁移文件，再在这里应用对应结构；不把“建了另一个库”误当作已经得到同一业务状态。

给实验库建立名称醒目的独立 DBeaver 连接，每次操作前运行 current_database()。开发库和实验库可以共享当前实例，便于本机练习，但它们仍共享实例管理员、进程、磁盘和故障范围；这不是生产和开发的充分隔离。正式部署使用独立配置和明确的数据目标，不能只靠连接显示名称区分。

Git 分支保存程序和 SQL 文件，不保存数据库状态。切回第十五章代码不会把已经演进到第二十章的数据库退回去；同样，`npm run build` 不应初始化或清空数据库。要重现旧章节，使用与该章结构匹配的独立环境，不能在承载后续数据的库上随手执行旧建表脚本。

开发流程继续使用 `npm run dev`，数据库独立运行。后续结构变更通过显式迁移完成，不接入源码 watcher；这样一次保存不会隐式修改共享的开发库。生产入口仍是先 `npm run check` 构建，再用 `npm start` 运行 dist，不开放 Inspector、不加载开发 .env。本章尚未引入数据库驱动，连接配置在第十九章随适配层接入。

### 隔天继续开发时，从哪里接上

首次安装、initdb、创建角色和建库只做一次。日常回来先恢复当前终端的程序路径：macOS 执行 `export PATH="$(brew --prefix postgresql@18)/bin:$PATH"`，Ubuntu／WSL 执行 `export PATH="/usr/lib/postgresql/18/bin:$PATH"`，只选自己的那一条。然后恢复实例位置并查看状态：

```bash
export EPP_PGDATA="$HOME/.local/share/epp-book/postgresql-18"
pg_ctl -D "$EPP_PGDATA" status
```

若初始化时选择了别的目录，这里使用当时记下的位置。显示正在运行时直接连接；明确报告服务器未运行时，才执行下面的启动命令。目录不存在或无法访问时先检查路径、系统账号与权限，不能把所有非零退出都当成“需要启动”，更不能顺手重新 initdb。

```bash
pg_ctl -D "$EPP_PGDATA" -l "$EPP_PGDATA/server.log" -w start
```

接着在代码仓库根目录执行一次只读核对：

```bash
psql -X -W -v ON_ERROR_STOP=1 \
  'host=127.0.0.1 port=55432 dbname=epp_dev user=epp_owner connect_timeout=5' \
  -f database/chapter-15/03-inspect.sql
```

它运行后退出客户端，实例继续运行。已经配置过 DBeaver 时，再连接保存的数据源并执行同一份查询；尚未配置时，回到 15.3 的“用 DBeaver 做相同的事情”继续。第十六章以后 public 已经有表，不能再把“没有业务表”当作日常健康条件。若停在建角色或建库中途，先按前面的中断恢复说明补完缺失动作，再使用这个入口。

走到这里，应该能从一条失败连接判断下一步去看客户端、监听、认证还是目标库；能在两个客户端中证明自己操作的是同一环境；也能解释重启后哪一层状态应该保留。下一章将在这个确切的 epp_dev 中建立第一组业务表，解释每个字段和约束来自哪个需求。环境准备由此结束，真实的记录持久化从表和 SQL 开始。

时间参考（估算）：阅读约 75～90 分钟；安装后的配置、连接、故障对照和启停操作另加约 45～60 分钟。按正文约 8800 个汉字、90 余行 SQL／命令，以及两种客户端和失败条件对照估算，未经过读者实测；日常恢复复用已有操作，不重复计时。首次下载软件、网络等待及遇到 WSL 跨环境故障后的处理另计，知识支线单列。

## 知识支线

- [支线 15A：为什么同一个账号，在两种连接方式下结果不同](side-01-connection-and-authentication.md)：从 socket／TCP、操作系统身份和 HBA 规则顺序，推导“密码正确却连不上”“输入错误密码也成功”的原因，并观察规则修改如何影响新连接。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| postgres／psql／DBeaver | 服务端与两种客户端 | 核对服务端版本及连接目标，不只核对客户端安装版本 |
| initdb／PG_VERSION | 首次建立实例，确认数据大版本 | 不用于重启；已有目录先核对来源 |
| pg_ctl -D／-l／-w | 精确控制一个实例并观察启动结果 | 不混用系统服务管理同一数据目录 |
| pg_ctl stop -m fast | 本机实验的受控关闭 | 活动事务回滚，不代表可无影响地停止共享服务 |
| pg_isready | 查看目标入口是否接受连接 | 不验证业务角色、密码或查询权限 |
| Test-NetConnection | 在 Windows 探测 WSL 数据库的 TCP 入口 | 查看 TcpTestSucceeded；成功后仍须核对数据库身份 |
| host／port／dbname／user | 明确连接目标 | 省略参数可能走默认库或 socket |
| -X／-W／ON_ERROR_STOP | 减少个人配置干扰、提示密码、脚本遇错停止 | 停止脚本不撤销此前已提交语句 |
| \password／\i／\conninfo／\q | psql 密码设置、文件执行、连接查看与退出 | 是客户端元命令，不是通用 SQL |
| CREATE ROLE／CREATE DATABASE／REVOKE | 建立身份、库及数据库级授权边界 | 角色在实例内共享，PUBLIC 与 public Schema 不同 |
| current_database／current_user／inet_server_port | 用服务器结果核对环境 | 不能只看连接名称与导航树 |
| search_path／current_schema | 核对未限定对象名的解析环境 | 不等于切换数据库，不自动创建 Schema |
| Auto-commit／COMMIT | 区分执行、提交和保存脚本 | 不同会话及工具可能采用不同模式 |
| COMMENT／shobj_description | 写入并读取无敏感信息的环境备注 | 元信息持久化不等于业务接口已接入 |

官方查阅：[psql 18](https://www.postgresql.org/docs/18/app-psql.html)、[客户端认证](https://www.postgresql.org/docs/18/client-authentication.html)、[事务入门](https://www.postgresql.org/docs/18/tutorial-transactions.html)。其余具体命令与客户端文档入口已附在对应操作处。

[上一章：第二篇回顾](../../part-02-nestjs/chapter-14-review/chapter.md) · [返回第三篇](../README.md) · [返回全书目录](../../README.md)
