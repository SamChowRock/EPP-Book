# 开发环境配置（macOS）

这份文档集中说明跟做 EPP 时需要安装的软件、版本约定和检查方法。已有工具可以直接复用，先核对版本与命令来源。第一、二篇只需要 Node.js 和开发工具；读到第三篇再准备数据库。

本文使用 macOS 的 Zsh。除明确标注的 SQL 外，命令都在终端执行；可以使用系统自带的“终端”或 VS Code 集成终端。软件安装只做一次，打开新终端后仍要选择项目的 Node 版本。安装器的系统要求以各软件官方页面为准。

## 1. 需要准备哪些软件

| 软件 | 用途与版本约定 | 何时准备 |
| --- | --- | --- |
| Xcode Command Line Tools、Git | 提供命令行开发工具与 Git；不需要安装完整 Xcode | 开始实践前 |
| nvm | 管理 Node.js；本书安装示例使用 `v0.40.8` | 第 2 章前 |
| Node.js、npm | Node 固定为 `24.22.1`；npm 使用该 Node 随附版本 | 第 2 章前 |
| Visual Studio Code | 编辑项目、连接 Node 调试器；使用适配本机的稳定版 | 第 2 章前 |
| Postman 桌面客户端 | 发送、保存和重复调用 HTTP 请求；已有同类客户端也可复用 | 第 2 章前 |
| 浏览器 | 打开接口结果及后续 Swagger 页面；现有浏览器即可 | 第 2 章前 |
| Homebrew | 按本书 macOS 路线安装 PostgreSQL | 第 15 章前 |
| PostgreSQL | 数据库服务与 `psql` 等工具，使用 **18.x** | 第 15 章前 |
| DBeaver Community | 图形化连接数据库、执行 SQL、查看数据和事务 | 第 15 章前 |

TypeScript、Nest、Prisma、数据库驱动等由各章项目的 `package.json` 和锁文件管理，随项目安装，不另行全局安装。当前单包实践使用 npm，不需要为它增加 pnpm 或 Yarn。

Docker 与 Compose 属于部署篇的可选路线。AI 工具、模型密钥、云服务器、域名和微信开发者工具也不是开始实践的前提，读到相应内容再准备。

## 2. 准备命令行与 Node.js

### 检查 Command Line Tools 与 Git

先执行：

```bash
xcode-select -p
git --version
```

第一条应返回开发工具目录，第二条应显示 Git 版本。如果提示未安装开发工具，执行下面的命令，并完成 macOS 弹出的安装流程：

```bash
xcode-select --install
```

安装结束后重新运行前两条命令。仅看到安装窗口不代表已经安装完成。[nvm 的 macOS 安装说明](https://github.com/nvm-sh/nvm#troubleshooting-on-macos)也要求先准备 Command Line Tools。

### 安装 nvm，再选择 Node 版本

检查当前终端：

```bash
command -v nvm
```

输出 `nvm` 就可以继续使用。尚未安装时，按 [nvm 官方安装说明](https://github.com/nvm-sh/nvm#installing-and-updating)安装；以下与第 2 章保持一致，两条命令逐条执行，下载成功后再运行脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh -o /tmp/nvm-install.sh
bash /tmp/nvm-install.sh
```

重新打开终端，再检查 `command -v nvm`。如果仍无输出，检查 `~/.zshrc` 是否有安装器添加的 nvm 加载配置；使用默认安装目录时应包含：

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

已有配置不重复追加；自定义安装目录使用自己的实际位置。保存后重新打开终端。nvm 是 shell 函数，使用 `command -v nvm` 检查，不用 `which nvm`。

还没创建项目时，可以先安装书中约定的版本：

```bash
nvm install 24.22.1
nvm use 24.22.1
node --version
npm --version
```

Node 应输出 `v24.22.1`，npm 应能正常显示版本。进入已有章节代码后，以根目录的 `.nvmrc` 为准：

```bash
nvm install
nvm use
```

进入目录本身不会自动切换版本。每次打开新终端，都在项目内执行 `nvm use`；VS Code 集成终端也一样。不要用 `sudo npm install` 修复版本问题。

## 3. 配置编辑器与接口客户端

### Visual Studio Code

按 [VS Code 的 macOS 安装说明](https://code.visualstudio.com/docs/setup/mac)下载，选择适合机器芯片的版本，将应用放入“应用程序”。芯片类型可在苹果菜单“关于本机”中查看。

打开 VS Code，按 `Cmd+Shift+P`，搜索 `Shell Command`，运行添加 `code` 命令到 PATH 的选项。若同时询问安装 Copilot CLI，只添加 `code` 即可。重开终端验证：

```bash
code --version
```

在实践代码根目录执行 `code .`，打开包含 `package.json` 的那一层目录；也可以用 **File → Open Folder**。不要只打开一个源文件，否则项目内的调试配置可能不会加载。

章节代码提供 `.vscode/launch.json` 后，先在集成终端执行 `nvm use` 和本章启动命令，再到 **Run and Debug** 选择 `EPP: attach to npm run dev`，连接 `127.0.0.1:9229`。从空项目跟做时，按[第 2 章](part-01-nodejs/chapter-02-minimal-service/chapter.md)建立启动脚本与调试配置，不需要提前复制后续章节的配置。

### Postman

从 [Postman 下载页](https://www.postman.com/downloads/)选择 **The Postman app** 对应的 Mac 版本。本文使用桌面应用；页面中的 CLI、插件和 Desktop Agent 有其他用途，不是这里的安装目标。

打开应用后，通过 **Import** 导入当前章节代码中的 `requests/epp.postman_collection.json`；本章若提供专用集合，按该章 README 导入对应文件。选择集合中的查看列表请求，核对 `baseUrl` 为 `http://127.0.0.1:3000`。所选环境中若有同名变量，检查最终解析地址，避免请求落到另一套服务。

从空目录跟做、尚无集合文件时，先安装客户端即可；第 2 章会带你新建并保存请求，不需要先把后续章节的文件复制进来。

此时还没有启动服务的话，连接失败是预期结果。完成第 2 章并启动 `npm run dev` 后，再点击 **Send**，应看到 200 和列表结果。创建请求从 **Body → raw → JSON** 编辑，响应区域查看状态、正文和 Headers；保存请求后可重复发送。详细操作及实际界面见[第 2 章的请求观察](part-01-nodejs/chapter-02-minimal-service/chapter.md#23-让请求结果变得可以观察)。

## 4. 第三篇开始前准备 PostgreSQL

### Homebrew 与数据库程序

先检查 `brew --version`。已有 Homebrew 就继续使用；尚未安装时，在 [Homebrew 官网](https://brew.sh/)按官方步骤安装，并执行安装结束时 **Next steps** 给出的 shell 配置。重开终端后确认 `brew --version` 正常，再继续。系统与硬件支持条件见[官方安装要求](https://docs.brew.sh/Installation)。

安装 PostgreSQL 18 的程序，并让当前终端优先使用它的命令：

```bash
brew install postgresql@18
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
postgres --version
psql --version
```

两条版本输出都应为 18.x。安装入口见 [Homebrew 的 PostgreSQL 18 页面](https://formulae.brew.sh/formula/postgresql@18)。这里用 `brew --prefix` 查实际目录，避免把 Apple Silicon 和 Intel 的安装路径混用。

上面的 `export` 只影响当前终端。需要持久生效时，将这一行加到 `~/.zshrc` 一次，放在 Homebrew 已加载之后；已有同样设置不重复添加。重开终端，再检查版本和 `command -v psql`。

本书另建自己的学习实例，通过 `pg_ctl` 启停，固定使用 `127.0.0.1:55432`。不要额外执行 `brew services start postgresql@18` 来代替这套步骤；包管理器的默认实例与书中的学习实例不是同一份数据目录。

**接下来完整执行[第 15 章 15.3 节](part-03-postgresql/chapter-15-postgresql-environment/chapter.md#153-安装启动再从两个客户端连接同一个库)**：初始化数据目录、设置回环监听与密码认证、启动服务，再建立 `epp_owner` 和 `epp_dev`。已有该实例时从状态检查与启动继续，不重复初始化、建角色或建库。

### DBeaver Community

从 [DBeaver Community 官方下载页](https://dbeaver.io/download/)下载适合本机芯片的 macOS 安装包并安装。Community 版即可。

完成第 15 章的建库步骤后，在 DBeaver 选择 **New Database Connection → PostgreSQL**，填写：

| 字段 | 本书开发库的值 |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `55432` |
| Database | `epp_dev` |
| Username | `epp_owner` |
| Password | 你在第 15 章设置的开发库密码 |

点击 **Test Connection**；首次连接若提示下载 PostgreSQL 驱动，完成下载后重试。连接成功后保存，并打开该连接的 SQL 编辑器，执行：

```sql
SELECT current_database(), current_user,
       inet_server_addr(), inet_server_port(), version();
```

结果应分别对应 `epp_dev`、`epp_owner`、`127.0.0.1`、`55432` 和 PostgreSQL 18.x。这样核对的是实际连接的服务端，而不只是本机安装的客户端版本。SQL 编辑、结果网格与连接界面的实图见[第 15 章](part-03-postgresql/chapter-15-postgresql-environment/chapter.md)。

## 5. 安装项目依赖与配置本机文件

从空项目跟做时，按章节逐步创建文件与安装依赖。使用章节配套代码时，先核对章节分支和 README；章节分支保存的是该章完成状态，后续分支可能已经依赖数据库与迁移，不能直接套用第 2 章的启动前提。

在含 `package.json`、`package-lock.json` 和 `.nvmrc` 的代码根目录执行：

```bash
nvm install
nvm use
node --version
npm ci
```

`npm ci` 按锁文件重建 `node_modules`，不会替你升级项目依赖。若当前从零建立的项目还没有锁文件，使用该章给出的安装命令。不要通过删除锁文件或全局安装 Nest、Prisma 来处理依赖报错。

各阶段按需要建立本机配置：

| 阶段 | 配置文件与作用 |
| --- | --- |
| 第 3 章起 | 首次把 `.env.example` 复制为 `.env`，设置开发端口；已有 `.env` 时只补缺少的项 |
| 第 18 章起 | 按该章建立 `.env.database`、`.env.database-verify`，供数据库命令连接开发库和独立校验库 |
| 第 19 章起 | 在 `.env` 设置 API 的 `DATABASE_URL` 等运行配置；API 不自动加载数据库 CLI 的配置文件 |
| 第 19 章起运行测试 | 首次将 `test/database.env.example` 复制为 `.env.test`，设置 `TEST_DATABASE_URL` 指向已迁移的独立校验库；测试不读取开发 `.env`，缺少测试连接时退出 |
| 后续数据库章节 | 按本章 README 追加迁移并核对数据，再启动相应版本的 API |

密码写入本机配置，不提交到 Git；URL 中密码的保留字符需按章节说明编码。修改 `.env` 后手动重启开发进程。数据库校验、回填和迁移会操作数据，具体顺序见[第 18 章](part-03-postgresql/chapter-18-prisma/chapter.md)、[第 19 章](part-03-postgresql/chapter-19-prisma-nest/chapter.md)及后续章节，不能把一条“初始化命令”反复应用到所有章节。

运行 `npm test` 前按第 19 章核对测试库的迁移与固定用户，保持 `DB_QUERY_DEBUG=false`；使用 `.env.test` 时先执行 `unset TEST_DATABASE_URL DB_QUERY_DEBUG DOCS_ENABLED`，避免终端中同名变量覆盖文件。测试可能写入数据或临时修改约束，不要将 `TEST_DATABASE_URL` 指向日常开发库。

具备本章运行前提后执行 `npm run dev`；第 5 章起另用 `npm run check` 做类型与构建检查。静态检查通过后仍需在 Postman 发送请求。生产产物按对应章节使用 `npm run build` 与 `npm start`，后者不自动读取开发 `.env`，需要由启动环境提供配置。

## 6. 下次继续与常见问题

下次打开项目时，先在终端执行 `nvm use`。数据库阶段先确认学习实例运行，再执行当前章节的开发命令，连接调试器，最后重发已保存的 Postman 请求。不要因为隔了一晚就重新安装依赖、初始化数据库或重复迁移。

| 现象 | 先核对什么 |
| --- | --- |
| `nvm: command not found` | 当前 shell 是否加载 nvm；检查 `~/.zshrc`，重开终端 |
| `EBADENGINE` 或 Node 版本不符 | 在项目根目录执行 `nvm use`，再检查 `node --version`、`command -v node` |
| `npm ci` 找不到文件 | 是否进入代码根目录；正文目录不包含运行依赖，空项目要按章节先建立文件 |
| 依赖或驱动下载失败 | 先读具体的网络、证书或权限错误；不要通过关闭证书校验或删除锁文件绕过 |
| `psql` 找不到或版本不对 | PostgreSQL 18 的 `bin` 是否进入当前 PATH；检查 `command -v psql` |
| Postman 连接失败 | 服务是否已启动、终端是否报错、`baseUrl` 是否指向本机正确端口 |
| 请求一直等待 | VS Code 是否停在断点上；继续执行后再观察，数据库等待按相关章节排查 |
| DBeaver 连接失败 | 是否已执行第 15 章初始化，实例是否运行，端口、库名、身份与密码是否匹配 |
| 端口被占用 | 用 `lsof -nP -iTCP:3000 -sTCP:LISTEN` 找到监听者；数据库查 `55432`，调试器查 `9229`；确认归属后再处理 |

结束时在开发终端按 `Ctrl+C`，等待服务退出。关闭 DBeaver 只会关闭客户端，不会停止 PostgreSQL；学习实例的停止与恢复按第 15 章操作，保留数据目录。切换旧章节代码也不会撤销数据库迁移，需要回看旧版本时使用章节要求的隔离数据库。

[返回全书目录](README.md)
