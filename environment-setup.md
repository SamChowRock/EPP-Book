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
| Google Chrome | 按书中界面连接 Node Inspector，后续在 DevTools 观察请求、Cookie 和事件流 | 第 3 章调试前 |
| Homebrew | 按本书 macOS 路线安装 PostgreSQL | 第 17 章前 |
| PostgreSQL | 数据库服务与 `psql` 等工具，使用 **18.x** | 第 17 章前 |
| DBeaver Community | 图形化连接数据库、执行 SQL、查看数据和事务 | 第 17 章前 |

读到下列章节时，再准备对应的工具。已经完成前一阶段的读者可以从这里接着走。

| 软件或组件 | 用途 | 何时准备 |
| --- | --- | --- |
| Swagger UI | API 提供的交互文档，在浏览器中发送请求 | 第 12 章，随项目依赖安装 |
| PostgreSQL 的 `pg_dump`、`pg_restore` | 从已有数据备份并恢复到独立练习库 | 第 25 章，复用已装的 PostgreSQL 18 |
| Mailpit 1.33.0 | 在本机接收注册和重置邮件，在网页收件箱查看 | 第 42 章首次注册验证，第 43 章和后台寄信实验继续使用 |
| 微信开发者工具 | 导入小程序、用真实 AppID 登录和预览 | 选做第 44、47 章真实小程序联调时 |
| sharp 0.35.5 与 libvips | 把上传的图片解码并生成 WebP 预览 | 第 59 章，按项目锁文件安装 |
| SeaweedFS 4.52 | 在本机运行私有对象存储，用浏览器里的 Filer 查看文件 | 第 60 章，第 62 章复用 |

TypeScript、Nest、Prisma CLI 和数据库驱动都由各章项目的 `package.json` 和锁文件管理。寄信使用的 Nodemailer、接入 S3 使用的 AWS SDK 也随项目安装。

后续篇章按[全书目录](README.md)安排准备时间。第 64 章在本机运行构建检查，有自己的 GitHub 仓库时可接入 Actions。第 70 章用 Node 直接启动各角色并在 Mac 上演示宿主托管，第 71～74 章需要一台自己可管理的 SSH 练习主机，在那里分配角色、安排维护并核对同一组启动条件。第 75、76 章要在练习客户端建立信任并轮换数据库凭据。之后可选做第 77～80 章 Docker 与 Compose，或直接继续第 81 章，用 Caddy 做反向代理，选择家庭主机隧道路线时再准备 Cloudflare Tunnel，第 82 章的容器支线再用 Dozzle 查看日志。真实模型调用在第十篇准备供应商账号、密钥和费用额度，第 97 章再为 PostgreSQL 增加 pgvector；第十三篇接入 MCP 时按所选宿主准备客户端。

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

从空项目跟做时，按[第 2 章](part-01-nodejs/chapter-02-first-http/chapter.md)建立启动脚本，再按第 3 章用 Chrome 的 `chrome://inspect` 连接调试。到[支线 6B](part-01-nodejs/chapter-06-typescript/side-02-debugging-workbench.md)再建立 VS Code 的 `.vscode/launch.json`，不需要提前复制后续章节的配置。

章节代码提供该配置后，先在集成终端执行 `nvm use` 和本章启动命令，再到 **Run and Debug** 选择 `EPP: attach to npm run dev`，连接 `127.0.0.1:9229`。

### Chrome、Node Inspector 与 Swagger UI

若 Mac 上还没有 Chrome，从 [Google Chrome 下载页](https://www.google.com/chrome/)安装。第 3 章运行 `npm run dev` 后，在 Chrome 地址栏打开 `chrome://inspect`。在 **Devices** 中找到本次 Node 进程并点 **inspect**。列表为空时，核对终端的调试监听地址，再检查 **Discover network targets → Configure** 是否含 `127.0.0.1:9229`。[第 3 章断点操作](part-01-nodejs/chapter-03-minimal-service/chapter.md)

第 12 章的开发 API 启动后，在浏览器打开 `http://127.0.0.1:3000/docs`（端口以开发终端为准）。展开列表接口，点 **Try it out → Execute**，在 **Server response** 查看状态码和响应正文。Swagger UI 由该章 API 提供。第 56 章观察 SSE 时，打开的是实验页面自身的 DevTools，在 **Network** 里选择持续连接并查看 **EventStream**。[第 12 章接口文档](part-02-nestjs/chapter-12-contracts/chapter.md) · [第 56 章浏览器实验](part-06-background/chapter-56-sse/chapter.md)

### Postman

从 [Postman 下载页](https://www.postman.com/downloads/)选择 **The Postman app** 对应的 Mac 版本。本文使用桌面应用；页面中的 CLI、插件和 Desktop Agent 有其他用途，不是这里的安装目标。

打开应用后，通过 **Import** 导入当前章节代码中的 `requests/epp.postman_collection.json`；本章若提供专用集合，按该章 README 导入对应文件。选择集合中的查看列表请求，核对 `baseUrl` 为 `http://127.0.0.1:3000`。所选环境中若有同名变量，检查最终解析地址，避免请求落到另一套服务。

从空目录跟做、尚无集合文件时，先安装客户端即可；第 2 章会带你新建并保存列表请求，不需要先把后续章节的文件复制进来。

此时还没有启动服务的话，连接失败是预期结果。完成第 2 章并启动 `npm run dev` 后，再点击 **Send**，应看到 200 和列表结果。创建请求从 **Body → raw → JSON** 编辑，响应区域查看状态、正文和 Headers；保存请求后可重复发送。详细操作及实际界面见[第 3 章的请求观察](part-01-nodejs/chapter-03-minimal-service/chapter.md#33-让请求结果变得可以观察)。

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

**接下来完整执行[第 17 章 17.3 节](part-03-postgresql/chapter-17-postgresql-environment/chapter.md#173-安装启动再从两个客户端连接同一个库)**：初始化数据目录、设置回环监听与密码认证、启动服务，再建立 `epp_owner` 和 `epp_dev`。已有该实例时从状态检查与启动继续，不重复初始化、建角色或建库。

第 25 章开始使用数据库备份与恢复。在准备运行备份命令的那个终端，执行 `pg_dump --version` 和 `pg_restore --version`，两条都应显示 18.x。这两个程序与 `psql` 在同一个 `bin` 目录。备份原库、建立副本及恢复后的数据核对见[第 25 章](part-04-consistency/chapter-25-revisions/chapter.md)。

### DBeaver Community

从 [DBeaver Community 官方下载页](https://dbeaver.io/download/)下载适合本机芯片的 macOS 安装包并安装。Community 版即可。

完成第 17 章的建库步骤后，在 DBeaver 选择 **New Database Connection → PostgreSQL**，填写：

| 字段 | 本书开发库的值 |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `55432` |
| Database | `epp_dev` |
| Username | `epp_owner` |
| Password | 你在第 17 章设置的开发库密码 |

点击 **Test Connection**；首次连接若提示下载 PostgreSQL 驱动，完成下载后重试。连接成功后保存，并打开该连接的 SQL 编辑器，执行：

```sql
SELECT current_database(), current_user,
       inet_server_addr(), inet_server_port(), version();
```

结果应分别对应 `epp_dev`、`epp_owner`、`127.0.0.1`、`55432` 和 PostgreSQL 18.x。这样核对的是实际连接的服务端，而不只是本机安装的客户端版本。SQL 编辑、结果网格与连接界面的实图见[第 17 章](part-03-postgresql/chapter-17-postgresql-environment/chapter.md)。

## 5. 安装项目依赖与配置本机文件

从空项目跟做时，按章节逐步创建文件与安装依赖。使用章节配套代码时，先核对章节分支和 README；章节分支保存的是该章完成状态，后续分支可能已经依赖数据库与迁移，不能直接套用第 3 章的启动前提。

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
| 第 4 章起 | 首次把 `.env.example` 复制为 `.env`，设置开发端口；已有 `.env` 时只补缺少的项 |
| 第 20 章起 | 按该章建立 `.env.database`、`.env.database-verify`，供数据库命令连接开发库和独立校验库 |
| 第 21 章起 | 在 `.env` 设置 API 的 `DATABASE_URL` 等运行配置；API 不自动加载数据库 CLI 的配置文件 |
| 第 22 章起运行测试 | 首次将 `test/database.env.example` 复制为 `.env.test`，设置 `TEST_DATABASE_URL` 指向已迁移的独立校验库；测试不读取开发 `.env`，缺少测试连接时退出 |
| 第 33、38 章起 | 第 33 章的 `CURSOR_HMAC_KEY` 用于签名游标，生产运行要提供持久密钥；第 38 章用 `APP_ORIGIN` 指定用户实际打开的网站来源，开发时与访问 API 的协议、主机和端口对齐 |
| 第 42、51 章起 | 最初由 API 读取 `LOCAL_SMTP_PORT`；独立寄信 Worker 启用后，在 `.env.worker` 核对它连接的数据库和 SMTP 端口 |
| 第 58 章独立回归 | 另建回归库，按[第 58 章](part-07-profiles/chapter-58-profile/chapter.md)建立 `.env.test-regression`，让迁移用的 `DATABASE_URL` 和测试用的 `TEST_DATABASE_URL` 指向同一个回归库，保留手工联调库的数据 |
| 第 60 章起 | 接入头像存储时，按章节启动命令为 API 加载 `.chapter51-store/app.env` 中的四项 `AVATAR_S3_*` 配置；`admin.env` 供建桶使用 |
| 后续数据库章节 | 按本章 README 追加迁移并核对数据，再启动相应版本的 API |

密码写入本机配置，不提交到 Git；URL 中密码的保留字符需按章节说明编码。修改 `.env` 后手动重启开发进程。数据库校验、回填和迁移会操作数据，具体顺序见[第 20 章](part-03-postgresql/chapter-20-prisma/chapter.md)、[第 22 章](part-03-postgresql/chapter-22-prisma-nest/chapter.md)及后续章节，不能把一条“初始化命令”反复应用到所有章节。

运行 `npm test` 前按第 22 章核对测试库的迁移与固定用户，保持 `DB_QUERY_DEBUG=false`；使用 `.env.test` 时先执行 `unset TEST_DATABASE_URL DB_QUERY_DEBUG DOCS_ENABLED`，避免终端中同名变量覆盖文件。测试可能写入数据或临时修改约束，不要将 `TEST_DATABASE_URL` 指向日常开发库。

具备本章运行前提后执行 `npm run dev`；第 6 章起另用 `npm run check` 做类型与构建检查。静态检查通过后仍需在 Postman 发送请求。生产产物按对应章节使用 `npm run build` 与 `npm start`，后者不自动读取开发 `.env`，需要由启动环境提供配置。

## 6. 第五篇起按章节准备服务

<a id="第-43-章用-mailpit-收信"></a>

### 第 42 章用 Mailpit 收信

从 [Mailpit 1.33.0 发行页](https://github.com/axllent/mailpit/releases/tag/v1.33.0) 下载 macOS 压缩包。Apple Silicon 选 `darwin-arm64`，Intel 选 `darwin-amd64`。解压后在放有 `mailpit` 的目录打开终端，核对版本，再启动本机收件服务。

```bash
./mailpit version
./mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 \
  --disable-version-check --block-remote-css-and-fonts
```

保留这个终端。浏览器打开 `http://127.0.0.1:8025` 查看收件箱；API 的 `LOCAL_SMTP_PORT` 填寄信用的 `1025`。按第 42 章用虚构地址申请注册后，在收件箱按收件人找到本次邮件。后续练习若换端口，寄信进程的配置要跟随本轮 SMTP 端口，浏览器要打开本轮网页端口。章节命令写作 `mailpit` 时，若使用解压安装，可在程序所在目录执行 `./mailpit`。[第 42 章本地寄信](part-05-identity/chapter-42-verified-signup/chapter.md)

第 51 章把寄信移入独立的 Node 进程。在两个项目终端分别选择项目的 Node 版本。先按本章配置 API，将 `database/chapter-43/worker.env.example` 复制为项目根的 `.env.worker`，填入同一练习库的连接和 Mailpit 的 SMTP 端口，再分别运行 `npm run dev` 和 `npm run dev:worker -- epp_ch43_verify`，最后一个参数换成实际练习库名。VS Code 调试 API 连 `9229`，调试 Worker 连 `9230`。第 55 章的站内通知复用 Worker 入口，选 `notifications` 角色，消息写入数据库。[第 51 章 Worker 启动与调试](part-06-background/chapter-51-worker/chapter.md) · [第 55 章角色切换](part-06-background/chapter-55-notifications/chapter.md)

### 第 44～47 章选做真实平台登录

这几章的本机实验入口随各章配套代码提供。要做真实联调，再按所选路线准备。

- **微信小程序（第 44、47 章）。** 安装[微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)，用有该小程序开发资格的微信登录。选择导入项目，选配套代码的 `mini-program/`，填写真实小程序 AppID，与后端配置核对。AppSecret 只放在服务端。真机用手机微信打开开发版或体验版，API 需要手机可达的 HTTPS 地址，并已在平台登记为合法请求域名。手机上的 `127.0.0.1` 指向手机自己。[第 44 章小程序接入](part-05-identity/chapter-44-mini-program/chapter.md) · [第 47 章扫码确认](part-05-identity/chapter-47-mini-confirm/chapter.md)
- **OIDC（第 45 章）。** 本机练习带有实验提供方。接真实提供方时，注册服务端 Web 客户端，取得 issuer、Client ID 和 Client Secret，逐字登记 EPP 的 HTTPS 回调地址，准备两个测试账号验证登录与关联。[第 45 章提供方配置](part-05-identity/chapter-45-oidc/chapter.md)
- **微信网站登录（第 46 章）。** 准备微信开放平台已审核、已开通登录权限的网站应用，在平台核对授权回调域，在后端配置这份网站应用自己的 AppID 和 AppSecret。电脑浏览器访问 HTTPS 网站，手机微信扫码确认。[第 46 章网站应用联调](part-05-identity/chapter-46-wechat-website/chapter.md)

### 第 59 章检查图片处理依赖

在本机对应章节的代码目录执行 `npm ci` 时保留可选依赖，npm 会按系统和 CPU 架构安装 sharp 所需的原生组件。在实际运行 API 的目录执行下面的命令，应能加载模块并打印版本。书中使用 sharp 0.35.5，配套验证的 libvips 为 8.18.7。随后用该章的灯塔 PNG 发送预览请求，应得到 256 × 256 的 WebP。[第 59 章头像预览](part-07-profiles/chapter-59-avatar/chapter.md)

```bash
node --input-type=module -e "import sharp from 'sharp'; console.log(sharp.versions.sharp, sharp.versions.vips)"
```

### 第 60 章启动 SeaweedFS 并打开 Filer

在第 60 章配套代码根目录完成 `nvm use` 和 `npm ci` 后，首次运行以下三步。安装脚本根据 Mac 芯片下载 4.52 并核对 SHA-256。初始化脚本创建 `.chapter51-store/`，保存本机数据、管理身份和应用身份。已有同一套环境时，先用 `.chapter51-tools/weed version` 确认版本，重启只执行最后一行。

```bash
sh database/chapter-51/install-weed.sh
node database/chapter-51/init-store.mjs
sh database/chapter-51/start-store.sh
```

保留前台进程，另开项目终端，运行 `nvm use`。把下面的 `12345` 换成启动行显示的 PID；检查应显示十个回环监听，然后建桶。

```bash
sh database/chapter-51/listeners.sh 12345
node database/chapter-51/store-probe.mjs buckets
```

在 Chrome **访客窗口**打开 `http://127.0.0.1:18632/`，点 **buckets → avatars**。这是直通底层文件的 Filer 管理界面，可按第 60.3 节在自己的练习子目录上传和查看样图。EPP 使用的是 S3 端点 `http://127.0.0.1:18633`。回到操作终端执行 `node database/chapter-51/store-probe.mjs write`，核对应用能写入并读回相同字节、匿名读取返回 403；按第 60.3 节继续完成重启后的读取和清理。第 62 章沿用上章数据与身份。[第 60 章存储安装、操作与权限验证](part-07-profiles/chapter-60-avatar-storage/chapter.md)

### 第 64 章准备构建与持续集成

核心路线沿用 Node 24.22.1、npm 和本机 PostgreSQL 18。进入第 64 章配套项目执行 `nvm use`、`npm ci`，锁文件安装开发工具 Biome 2.6.6 和 Prisma 生成器辅助包 7.10.1；`npm run ci:check` 会检查格式、Lint、类型、构建以及两份生成文件。VS Code 1.121 起的内置 Markdown 预览能显示 ERD；在 docs/generated/ERD.md 选择 **Markdown: Open Preview to the Side** 核对关系。交付演练另建独立空库，在本地 .env.delivery 中设置 DATABASE_URL，默认 API 回环端口 3354。远程 CI 属选做路线，需要可运行 Actions 的 GitHub 练习仓库，PostgreSQL 服务在该 job 内启动。操作和结果见[第 64 章](part-08-maintenance/chapter-64-build-ci/chapter.md)。

### 第 66 章准备性能采样

沿用 Node 24.22.1、Chrome DevTools、PostgreSQL 18 和本机 Mailpit。在代码根目录的 .env.perf 只填写指向回环独立库 epp_ch55_lab 的 DATABASE_URL；池等待实验启动自己的临时端口，不占用日常 API。CPU profile 放在私有临时目录，堆快照仅从合成进程生成，分别在 Performance 和 Memory 导入。投递实验另用回环 API、SMTP 和 Mailpit 网页（例：3355、1055、8055）。见[第 66 章](part-08-maintenance/chapter-66-performance/chapter.md)。

### 第 69 章准备维护交接

在第 66 章代码根目录准备两份仅自己可读的连接配置。用 `.env.handoff` 指向含旧账号与迁移历史的交接副本，用 `.env.delivery` 指向另建的空库。练习 API 和交付探测分别使用空闲回环端口，如 3357 和 3356。另开两个独立 SQL 会话连交接副本，在其中一个持锁期间用另一个观察。登录性能对照仍使用第 66 章的 `.env.perf`。[第 69 章的环境与操作](part-08-maintenance/chapter-69-review/chapter.md)

### 第 70 章在本机托管进程

沿用第 69 章非空副本、同一恢复点的私有桶、旧账号与旧收据。本章在 iTerm2 中运行 Bash，分窗口操作 API、邮件和通知。Mac 需要在图形登录会话中运行 launchctl，配套脚本用项目的 Node 生成任务文件，plutil 只用于在 Mac 上查看文件。在配套根目录运行 `nvm use`，用 `node --version` 核对版本，再用 `command -v launchctl plutil` 查看两项系统工具的路径。构建与运行使用相同平台的 Node 24.22.1，在持久目录准备 release、config、work、logs。数据库、存储和 SMTP 均用练习环境的回环入口，邮件角色启动前核对遗留待办与收件端。关机与注销实验安排在专用机或虚拟机中。[第 70 章的部署步骤](part-09-operations/chapter-70-native-deployment/chapter.md)

## 7. 下次继续与常见问题

第 63 章的账号管理 CLI 随项目构建，沿用本机 Node 和 PostgreSQL。在对应章节的代码目录完成迁移和构建后，按正文用预期库名和账号 ID 预览操作，再决定是否执行变更。[第 63 章管理命令](part-08-maintenance/chapter-63-account-cli/chapter.md)

下次打开项目时，先在终端执行 `nvm use`。数据库阶段先确认学习实例运行。做寄信实验时启动 Mailpit，异步寄信还要启动邮件 Worker；继续头像存储实验时，沿用原目录启动 SeaweedFS。再执行当前章节的开发命令，连接调试器，最后重发已保存的 Postman 请求。不要因为隔了一晚就重新安装依赖、初始化数据库或重复迁移。

| 现象 | 先核对什么 |
| --- | --- |
| `nvm: command not found` | 当前 shell 是否加载 nvm；检查 `~/.zshrc`，重开终端 |
| `EBADENGINE` 或 Node 版本不符 | 在项目根目录执行 `nvm use`，再检查 `node --version`、`command -v node` |
| `npm ci` 找不到文件 | 是否进入代码根目录；正文目录不包含运行依赖，空项目要按章节先建立文件 |
| 依赖或驱动下载失败 | 先读具体的网络、证书或权限错误；不要通过关闭证书校验或删除锁文件绕过 |
| `psql` 找不到或版本不对 | PostgreSQL 18 的 `bin` 是否进入当前 PATH；检查 `command -v psql` |
| Postman 连接失败 | 服务是否已启动、终端是否报错、`baseUrl` 是否指向本机正确端口 |
| 请求一直等待 | VS Code 是否停在断点上；继续执行后再观察，数据库等待按相关章节排查 |
| DBeaver 连接失败 | 是否已执行第 17 章初始化，实例是否运行，端口、库名、身份与密码是否匹配 |
| 端口被占用 | 用 `lsof -nP -iTCP:3000 -sTCP:LISTEN` 找到监听者；数据库查 `55432`，调试器查 `9229`；确认归属后再处理 |

结束时在开发终端按 `Ctrl+C`，等待服务退出。关闭 DBeaver 只会关闭客户端，不会停止 PostgreSQL；学习实例的停止与恢复按第 17 章操作，保留数据目录。切换旧章节代码也不会撤销数据库迁移，需要回看旧版本时使用章节要求的隔离数据库。

[返回全书目录](README.md)
