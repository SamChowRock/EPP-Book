# EPP 实践环境：从 Mac 开发到 Debian 部署

第一次跟做时，只要能从 Mac 上的 Postman 向你启动的 Node 程序发送请求，读回空列表，就准备好了。直接从[在 Mac 上跑通第一个请求](#2-在-mac-上跑通第一个请求)开始。读到第 17 章，才需要给这个程序接上数据库。以后每当一章用到新的软件，都可以从下表回到它的准备步骤。

## 1. 需要准备哪些软件

第九篇第 69～80 章依次准备原生托管、容器、运行维护、备份、发布与故障恢复所需工具；第 79～80 章沿用已有工具，在独立恢复目标与事故副本操作。具体主机、身份与安装验证仍按下表和各章入口核对。

| 读到哪里 | 软件与安装位置 | 用它完成什么 |
| --- | --- | --- |
| 第 2 章 | [Xcode Command Line Tools、Git](#准备-mac-命令行)（Mac） | 在终端使用开发工具，取得章节代码 |
| 第 2 章 | [nvm、Node.js 24.22.1、npm](#选择项目使用的-node)（Mac） | 在项目指定的 Node 版本下安装依赖、启动 API |
| 第 2 章 | [Visual Studio Code](#打开项目并启动-api)、[Postman 桌面客户端](#发送并保存第一个请求)（Mac） | 在编辑器打开项目，在客户端发出并保存请求 |
| 第 2～3 章 | [curl](#发送并保存第一个请求)、[Google Chrome](#观察请求如何经过代码)（Mac） | 用命令行复查 HTTP 结果，用浏览器连接 Node 调试器 |
| 第 12 章 | [Swagger UI](#观察请求如何经过代码)（随项目安装） | 在 API 提供的文档页面试发请求 |
| 第 16 章 | [沿用 Node、VS Code、Postman](#第-16-章在独立目录观察文件写入)（Mac） | 在私有临时目录重开 JSON，控制两个独立写入者；无新增软件 |
| 第 17 章 | [Homebrew、PostgreSQL 18.x](#homebrew-与数据库程序)、[DBeaver Community](#用-dbeaver-确认连的是哪个库)（Mac） | 建立学习实例，用 SQL 查看数据 |
| 第 25 章 | [pg_dump、pg_restore](#用备份建立练习副本)（PostgreSQL 18 自带） | 把原库备份并恢复到独立练习库 |
| 第 30 章 | [沿用Chrome、Postman、DBeaver与Node](#第-30-章在同一页签恢复待确认的提交)（Mac） | 通过回环页面和故障代理观察刷新恢复；固定身份夹具只用于独立VERIFY副本 |
| 第 34 章 | [沿用Chrome、Postman、DBeaver与Node](#第-34-章比较旧列表与分页读取)（Mac） | 比较全量与分页、模拟一次续页失败；使用独立VERIFY和已有签名密钥 |
| 第 41 章 | [沿用Node、PostgreSQL、psql、Postman、DBeaver与浏览器](#第-41-章让两个-api-共用登录额度)（Mac） | 两个正式API接同一VERIFY，观察末格竞争及计数表撤权；无新增软件 |
| 第 42 章 | [Mailpit 1.33.0](#在本机收取注册邮件)（Mac） | 用本地收件箱完成注册验证，第 43 章继续用它收重置邮件 |
| 第 44、47 章选做 | [微信开发者工具](#真实平台登录选做)（Mac） | 导入小程序，使用真实 AppID 联调 |
| 第 50 章选读 | [沿用Git、PostgreSQL客户端、DBeaver、Postman、Mailpit与浏览器](#第-50-章分别升级两种历史)（Mac） | 分别备份恢复两种非空历史；可选8350观察页只持有本机私有配置，无新增软件 |
| 第 51 章 | [邮件 Worker](#让独立进程寄信)（随项目运行） | 把入队后的邮件交给 Mailpit；第 55 章再启动通知角色 |
| 第 54 章选读 | [Svix 2.10.0、独立回执进程](#第-54-章准备发送记录与签名回执)（随项目安装；Mac） | 在独立数据库副本验证发送记录、签名与重复回执，沿用Mailpit |
| 第 54 章真实邮箱选做 | [Resend账号、已验证发信域与受控收件箱](#第-54-章准备发送记录与签名回执)；[cloudflared](#第-54-章临时接收公网回执选做)（临时回调选用，Mac） | 取得外部接受与实际收件证据，让供应商访问独立HTTPS回执入口 |
| 第 59 章 | [sharp 0.35.5、libvips](#让-api-生成并保存头像)（随项目安装） | 解码图片并生成 WebP 预览 |
| 第 60 章 | [SeaweedFS 4.52](#启动私有存储)（Mac） | 给头像提供私有存储，重启后仍能读回原文件 |
| 第 61 章 | [沿用 Node、PostgreSQL 客户端、DBeaver、Postman、Chrome 与 SeaweedFS](#为头像核对建立独立观察身份)（Mac） | 配对非空副本，用独立只读身份分页清点；无新增软件 |
| 第 64 章 | [Biome、Prisma 生成器辅助包](#5-从开发目录交付一份可运行的服务)（随项目安装） | 检查代码和生成文件；远程运行 GitHub Actions 属选做 |
| 第 64 章 | [Bash](#用-bash-启动服务选做-mac-托管)（Mac 自带）；[launchd、iTerm2](#用-bash-启动服务选做-mac-托管)（选做） | Bash 运行独立目录里的 API；69B 用 launchd 在 Mac 托管，iTerm2 可复现书中界面 |
| 第 67 章 | [tar、shasum、Bash 与既有 Node、数据库、存储及图形工具](#第-67-章准备两套本机制品验收环境)（Mac） | 封存同平台运行包，在两套隔离副本核对摘要、配置和新记录归属 |
| 第 69 章 | [OpenSSH](#从-mac-建立-ssh-连接)（Mac 客户端、部署机服务端） | 从 Mac 登录另一台机器并转发请求 |
| 第 69 章起 | [Debian 13、systemd](#准备-debian-13-部署端)（部署机）；[Lima](#准备-debian-13-部署端)（选用 Mac 虚拟机路线） | 建立可独立管理用户和服务的 Linux 主机 |
| 第 69 章部署端 | [PostgreSQL 18、SeaweedFS 4.52、Mailpit 1.33.0 和 lsof](#在-debian-接手已有的数据库桶和收件箱)（Debian；已有独立数据机时可复用） | 将第 68 章的非空练习副本交给部署环境，退出操作终端后仍可访问 |
| 第 69 章起 | [Linux 版 Node.js 24.22.1、npm](#安装部署端共用的-linux-node)（部署机） | 以各自的系统用户运行 API、邮件和通知 |
| 第 71 章 | [OpenSSL 3](#两端准备-openssl)（管理 Mac 和部署 Debian）、[nginx](#在-debian-准备-nginx)（Debian） | 练习签发时核对名称和根指纹；由 nginx 在可达的私网地址接收页面、API 和头像请求 |
| 第 71 章 | [curl、浏览器及证书信任设置](#在独立使用设备验证入口)（独立使用设备，如另一台 Mac 上的 Chrome 与系统钥匙串） | 准备私网解析和受信根，再从浏览器登录、读写和收通知 |
| 第 71 章证书诊断支线选做 | [Firefox ESR、libnss3-tools](#用-firefox-查看证书错误选做)（有图形会话的 Debian） | 用专用浏览器配置观察导入练习根证书前后的变化 |
| 第 71 章公网回调选做 | [cloudflared](#为公网回调准备连接器选做)（仅选用 Cloudflare Tunnel 的常驻部署端） | 家庭主机主动连到公网入口，让平台能访问指定回调 |
| 第 72～78 章正文 | [Docker Engine、Buildx 与 Compose](#为容器部署准备引擎与-compose)（Debian 部署机；在 Mac 练习可选 Docker Desktop） | 构建目标平台镜像，管理卷、网络和 Compose，取证、更新并恢复原数据 |
| 第 72 章镜像构建 | [ca-certificates、Python 3、make、g++](#为容器部署准备引擎与-compose)（Dockerfile 的镜像阶段） | CA 集合供运行时验证出站 TLS；后三项只在构建阶段支持原生模块编译，无须在操作 Mac 另装 |
| 第 76 章 | [复用 PostgreSQL 18、curl 和 Mailpit](#让两个实例接到同一份练习数据) | 用同一份业务数据检查两个 API、后台进程和旧连接 |
| 支线 77A | [PostgreSQL 18 物理备份、校验与启动工具](#为隔离恢复演练准备-postgresql-18)（数据库练习主机） | 选做按时间点恢复时使用，检查基础备份并在独立数据目录回放 WAL |

<details>
<summary>后续选做路线和下部还会用到什么？</summary>

第 72 章正文开始使用 Docker 与 Compose，接在已经完成的原生托管与 HTTPS 交付之后。第 71 章沿用已经托管的私网 HTTPS 入口，从独立设备验收。容器日志先用 Engine 自带命令读取，图形入口可使用已安装的 Docker Desktop。第十篇真实模型调用需要供应商账号、密钥和额度，第 90 章用到 pgvector，第十三篇按所选 MCP 宿主准备客户端。[全书目录](README.md)

</details>

## 2. 在 Mac 上跑通第一个请求

### 准备 Mac 命令行

打开 Mac 的“终端”，使用默认的 Zsh。先看看开发工具是否已经就位：

```bash
xcode-select -p
git --version
```

第一条应返回开发工具目录，第二条应显示 Git 版本。若系统提示缺少开发工具，执行下面的命令，在弹出的窗口完成安装，再重试上面两条。这里用到的是 Command Line Tools，装这一套即可。[nvm 的 macOS 安装说明](https://github.com/nvm-sh/nvm#troubleshooting-on-macos)

```bash
xcode-select --install
```

### 选择项目使用的 Node

本书固定使用 Node.js `24.22.1`，npm 使用该版本随附的一份。nvm 让你在当前终端选择项目所需的 Node。先运行 `command -v nvm`，若输出 `nvm`，可直接选择版本。首次安装时，先下载脚本，下载成功后再运行第二行。[nvm 安装说明](https://github.com/nvm-sh/nvm#installing-and-updating)

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh -o /tmp/nvm-install.sh
bash /tmp/nvm-install.sh
```

重新打开终端运行 `command -v nvm`。仍无输出时，查看 `~/.zshrc` 有没有加载 nvm。默认安装目录的配置如下，使用自定义目录时换成实际路径。补齐缺少的行，重开终端再查。

```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

从空目录开始，可以先选好版本：

```bash
nvm install 24.22.1
nvm use 24.22.1
node --version
npm --version
```

看到 `v24.22.1` 和 npm 的版本号，就可以打开项目了。以后新开的终端，包括 VS Code 集成终端，都要进入项目目录执行 `nvm use`，它会读取项目的 `.nvmrc`。

### 打开项目并启动 API

按 Mac 的芯片类型下载 VS Code，将它放进“应用程序”。用 **File → Open Folder** 打开练习目录。如果习惯在终端运行 `code .`，在 VS Code 按 `Cmd+Shift+P`，搜索 `Shell Command` 并选择把 `code` 加入 PATH，重开终端用 `code --version` 检查。[VS Code 的 macOS 安装说明](https://code.visualstudio.com/docs/setup/mac)

**从空目录跟写第 2 章**，就在刚打开的文件夹建立 `.nvmrc`、`package.json` 和服务源码。跟着正文做到 `npm run check` 通过，再运行 `npm run dev`。[第 2 章：建立第一个 HTTP 服务](part-01-nodejs/chapter-02-first-http/chapter.md)

**使用现成的章节代码**，先核对章号和该分支的 README。打开含 `package.json` 的代码根目录，有 `package-lock.json` 和 `.nvmrc` 时执行：

```bash
nvm install
nvm use
node --version
npm ci
```

`npm ci` 按锁文件安装该章的依赖，后面的 TypeScript、Nest、Prisma 和数据库驱动都这样取得。若打开的是第 2 章快照，接着执行 `npm run check` 和 `npm run dev`。其他分支保存的是相应章节完成时的代码，按该章 README 准备运行条件；数据库篇或更晚的版本可能已经需要迁移和连接配置。

### 发送并保存第一个请求

在第 2 章的终端看到 `EPP listening on http://127.0.0.1:3000` 后，让进程保持运行。安装并打开 **The Postman app**，新建一个 GET 请求，地址填 `http://127.0.0.1:3000/captures`，点击 **Send**。第一次应读到状态 **200** 和正文 `{"items":[]}`。保存这个请求，下次重启服务还可以原样再发一次。使用其他 HTTP 客户端时，填写相同的方法和地址即可。[Postman 桌面版下载](https://www.postman.com/downloads/)

从章节快照起步时，若代码里有 `requests/epp.postman_collection.json`，可用 **Import** 导入；有专用集合的章节按 README 选文件。核对请求最终使用的 `baseUrl`，尤其留意所选环境是否也设置了同名变量。创建记录时在 **Body → raw → JSON** 填正文，发送后在响应区查看状态、Headers 和内容。[第 3 章的请求操作](part-01-nodejs/chapter-03-minimal-service/chapter.md#33-让请求结果变得可以观察)

想复查客户端看到的结果，可在另一个 Mac 终端运行 `curl --version` 确认系统自带的客户端可用，再运行 `curl -i http://127.0.0.1:3000/captures`。输出里可以同时看到 HTTP 状态行和空列表。第一次准备环境，做到这里就可以回第 2 章继续。

### 观察请求如何经过代码

第 3 章开始在处理请求的那一行停下来。装好 Chrome，保持 `npm run dev` 运行，在地址栏打开 `chrome://inspect`，到 **Devices** 选择本次 Node 进程的 **inspect**。列表为空时看启动终端的调试监听地址，再检查 **Discover network targets → Configure** 中是否有 `127.0.0.1:9229`。服务端口 `3000` 接收 Postman 的请求，调试端口 `9229` 供调试器连接。[Chrome 下载](https://www.google.com/chrome/) · [第 3 章断点操作](part-01-nodejs/chapter-03-minimal-service/chapter.md)

后面仍用同一个项目目录。第 4 章首次将 `.env.example` 复制为 `.env`，设置开发端口。已有文件就补缺项，改动后重启开发进程，并让请求地址跟随实际端口。第 6 章起，`npm run check` 还会检查类型与构建。支线 6B 提供 `.vscode/launch.json` 后，也可以在 VS Code 的 **Run and Debug** 中选择 **EPP: attach to npm run dev**，连接已经启动的进程。[在 VS Code 中调试](part-01-nodejs/chapter-06-typescript/side-02-debugging-workbench.md)

到第 12 章，有些请求可以直接在浏览器里试。Swagger UI 随项目依赖安装，启动开发 API 后打开 `http://127.0.0.1:3000/docs`（换成实际端口），展开接口，点 **Try it out → Execute**，在 **Server response** 查看响应。以后观察网页自身发出的请求，则在该网页打开 DevTools，例如第 56 章在 **Network → EventStream** 里看持续连接传来的事件。[第 12 章接口文档](part-02-nestjs/chapter-12-contracts/chapter.md) · [第 56 章事件流](part-06-background/chapter-56-sse/chapter.md)

## 3. 让数据留在 PostgreSQL 里

从第 17 章开始，Mac 上会同时运行 API 和一个有自己数据目录的数据库进程。先把数据库单独连通，等命令行和图形客户端看到同一个库，再把连接地址交给项目。

### Homebrew 与数据库程序

在 Mac 终端运行 `brew --version`。若没有 Homebrew，按官网安装并完成安装器 **Next steps** 中的 shell 配置。重开终端确认命令可用，再安装 PostgreSQL 18。[Homebrew 安装入口](https://brew.sh/) · [支持的系统与硬件](https://docs.brew.sh/Installation)

```bash
brew install postgresql@18
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
postgres --version
psql --version
```

`postgres` 和 `psql` 都应显示 18.x。`brew --prefix` 会找到这台 Mac 上的安装位置。若希望新终端也用这套程序，把上面的 `export` 行写入 `~/.zshrc`，放在加载 Homebrew 的配置之后，然后重开终端检查 `command -v psql`。[PostgreSQL 18 安装包](https://formulae.brew.sh/formula/postgresql@18)

现在机器上有了数据库程序，还需要一个保存练习数据的实例。第一次按第 17.3 节创建数据目录、设置回环监听与密码认证，用 `pg_ctl` 启动，再建立角色 `epp_owner` 和数据库 `epp_dev`。本书使用的实例在 `127.0.0.1:55432`；`brew services` 启动的是 Homebrew 默认实例。有过练习数据时，按该节检查并启动原目录里的实例。[第 17.3 节：从初始化到首次连接](part-03-postgresql/chapter-17-postgresql-environment/chapter.md#173-安装启动再从两个客户端连接同一个库)

### 用 DBeaver 确认连的是哪个库

安装与 Mac 芯片匹配的 DBeaver Community，选择 **New Database Connection → PostgreSQL**。Host 填 `127.0.0.1`，Port 填 `55432`，Database 填 `epp_dev`，Username 填 `epp_owner`，Password 填刚才设置的密码。点击 **Test Connection**；首次提示下载 PostgreSQL 驱动时完成下载再重试。[DBeaver Community 下载](https://dbeaver.io/download/)

保存连接，打开该连接的 SQL 编辑器，执行：

```sql
SELECT current_database(), current_user,
       inet_server_addr(), inet_server_port(), version();
```

结果中应看到 `epp_dev`、`epp_owner`、`127.0.0.1`、`55432` 和 PostgreSQL 18.x。如果能登录却看到另一个库名，先改连接，再运行会写入数据的操作。[第 17 章连接界面与查询结果](part-03-postgresql/chapter-17-postgresql-environment/chapter.md)

### 给开发、迁移和测试各自选库

开发库以后会留下你手工创建的账号与记录。需要验证迁移或运行测试时，另建练习库，并按实际启动的程序选连接文件。密码保存在本机配置中，不提交到 Git；连接 URL 里密码所含的保留字符按章节说明编码。

| 谁读取配置 | 从什么时候用 | 连接与检查 |
| --- | --- | --- |
| 数据库命令 | 第 20 章 | `.env.database` 指向开发库，`.env.database-verify` 指向独立校验库。按本章顺序迁移并核对原数据。 |
| 开发 API | 第 21 章 | 在开发 `.env` 设置 `DATABASE_URL`。只改数据库命令的文件，已启动的 API 仍用原连接。 |
| 测试进程 | 第 22 章 | 首次将 `test/database.env.example` 复制为 `.env.test`，让 `TEST_DATABASE_URL` 指向已迁移且有固定测试用户的校验库。 |
| 独立回归 | 第 58 章 | 在 `.env.test-regression` 中，把迁移用的 `DATABASE_URL` 和测试用的 `TEST_DATABASE_URL` 都指向另建的回归库。 |

使用 `.env.test` 前在当前终端执行 `unset TEST_DATABASE_URL DB_QUERY_DEBUG DOCS_ENABLED`，避免同名变量盖过文件，并确认测试配置中 `DB_QUERY_DEBUG=false`。测试会写数据，有些用例还会临时修改约束。后续升级项目时，按当前章 README 追加迁移，再启动相应版本的 API。[第 20 章数据库配置](part-03-postgresql/chapter-20-prisma/chapter.md) · [第 22 章校验与测试](part-03-postgresql/chapter-22-prisma-nest/chapter.md) · [第 58 章独立回归](part-07-profiles/chapter-58-profile/chapter.md)

### 用备份建立练习副本

第 25 章需要带着已有数据换到练习副本。运行 `pg_dump --version` 和 `pg_restore --version`，两条都应为 18.x，它们与 `psql` 在同一个目录。照正文备份原库、恢复到新库，再从新连接查看原记录。后面的交接和部署会沿用这种做法。[第 25 章备份与恢复](part-04-consistency/chapter-25-revisions/chapter.md)

## 4. 为登录、寄信和头像接上本机服务

数据库准备好后，大部分章节沿用原来的开发环境，只在使用新功能时补配置。第 33 章为签名游标设置 `CURSOR_HMAC_KEY`，生产运行要保存这把密钥。第 38 章为浏览器请求设置 `APP_ORIGIN`，填写用户实际访问的协议、主机和端口。到注册验证时，API 才第一次需要另一个程序接走邮件。

### 第 41 章让两个 API 共用登录额度

第40章的Map只记当前进程；多开一个API后，第41章把来源额度移入已有PostgreSQL。所有操作仍在Mac完成，不需要先准备Linux、Docker或Redis。沿前面的备份步骤恢复一个独立、UTF8的非空VERIFY，保留原账号和素材，在DBeaver核对主机、端口、库名、角色及 `SHOW server_encoding`。

在代码目录执行 `nvm use`、`node --version`、`npm ci`，版本应为24.22.1。先用第40章构建观察旧Map，再按第41章正文停旧API、追加迁移并构建。API与迁移配置分别核对同一个VERIFY；两API复用持久CURSOR_HMAC_KEY，APP_ORIGIN均为 `http://127.0.0.1:8341`。A/B监听3341/3342，各终端应有不同PID的app.started。第三个终端执行 `node examples/shared-auth-limit/server.mjs`，浏览器打开 `http://127.0.0.1:8341`；它只发送固定虚构错误凭据，真实登录仍用原Postman集合。页面提示启动但请求显示链路错误时，先查两个API的监听和APP_ORIGIN，不要反复点击消耗额度。

定向撤权使用新建非所有者数据库角色，按正文用psql隐藏提示设置密码，并执行随书逐对象授权SQL；先验证角色可以正常登录和读取，启动API后才撤计数表权限，结束必须恢复。本轮不对日常库或超级用户做撤权实验。进入[第41章正文](part-05-identity/chapter-41-shared-limit/chapter.md)。

### 在本机收取注册邮件

第 42 章使用虚构的练习邮箱。Mailpit 同时开两个入口：API 把邮件发到 SMTP 端口，你在浏览器从网页端口查看它。下载 Mailpit 1.33.0 的 macOS 压缩包（Apple Silicon 选 `darwin-arm64`，Intel 选 `darwin-amd64`），解压后在放有 `mailpit` 的目录打开终端。先确认版本，再启动服务。[Mailpit 发行文件](https://github.com/axllent/mailpit/releases/tag/v1.33.0)

```bash
./mailpit version
./mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 \
  --disable-version-check --block-remote-css-and-fonts
```

保留这个终端，在 API 配置中将 `LOCAL_SMTP_PORT` 设为 `1025`。用虚构地址申请注册，再在浏览器打开 `http://127.0.0.1:8025`，按收件人找到本次邮件。第 43 章重置密码继续用同一个收件箱。若之后换端口，分别更新发送方的 SMTP 配置和浏览器地址。后文命令若简写为 `mailpit`，用解压安装的读者仍可从程序目录执行 `./mailpit`。[第 42 章注册验证](part-05-identity/chapter-42-verified-signup/chapter.md)

### 真实平台登录（选做）

第 44～47 章的本机登录实验由章节代码提供。选择与真实平台联调时，只准备所走路线的账号、客户端和回调地址。

- **微信小程序（第 44、47 章）**　在 Mac 安装微信开发者工具，用有开发资格的微信账号登录，导入配套代码的 `mini-program/` 并填写真实 AppID。与后端核对 AppID，AppSecret 只放在服务端。真机预览时，手机需要能访问已在平台登记的 HTTPS 请求域名；手机上的 `127.0.0.1` 指向手机自己。[开发者工具下载](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) · [小程序接入](part-05-identity/chapter-44-mini-program/chapter.md) · [扫码确认](part-05-identity/chapter-47-mini-confirm/chapter.md)
- **OIDC（第 45 章）**　本机自带实验提供方。接入真实提供方时，注册服务端 Web 客户端，取得 issuer、Client ID 和 Client Secret，逐字登记 EPP 的 HTTPS 回调地址。准备用于验证登录和关联的两个测试账号。[提供方配置](part-05-identity/chapter-45-oidc/chapter.md)
- **微信网站登录（第 46 章）**　准备已审核且已开通登录权限的网站应用，核对其授权回调域。后端使用这份网站应用的 AppID 和 AppSecret。用电脑访问 HTTPS 网站，再用手机微信扫码。[网站应用联调](part-05-identity/chapter-46-wechat-website/chapter.md)

### 第 50 章分别升级两种历史

先完成[备份与恢复工具验证](#用备份建立练习副本)和[Mailpit准备](#在本机收取注册邮件)。仍在Mac操作，不需要另一台主机或新平台账号。关闭旧API与发送者后，分别把44、49历史恢复到新的VERIFY；DBeaver用current_database()核对每个副本。第三个空库只用于bootstrap结构对照，不能代替非空升级。

可选观察页使用随书Node脚本，固定监听127.0.0.1:8350，连接启动时指定的本机API。先确认8350空闲，在项目之外用umask 077创建0600私有配置，填写原Cookie、素材ID及选做mini令牌；浏览器只显示实际状态和摘要。未选择mini时省略其令牌，未配置观察与API认证失败分开显示。[第50章操作与退出](part-06-background/chapter-50-login-integration/chapter.md#503-原凭据原素材与原消息一起验收)

### 让独立进程寄信

第 51 章开始，API 把邮件写入数据库，由独立的邮件 Worker 取出并投递。寄信用的 Nodemailer 随项目依赖安装。即使 API 已经接受注册请求，收件箱也要等 Worker 工作才会有信。沿用前面的 Mailpit，在项目根目录把 `database/chapter-43/worker.env.example` 复制为 `.env.worker`，填入与 API 相同的练习库以及本轮 SMTP 端口。

在两个项目终端分别执行 `nvm use`，一边运行 `npm run dev`，另一边运行 `npm run dev:worker -- epp_ch43_verify`，末尾换成实际练习库名。调试 API 连 `9229`，调试 Worker 连 `9230`。第 55 章复用 Worker 入口，选择 `notifications` 角色，处理结果在数据库的站内收件箱查看。[第 51 章 Worker 启动与调试](part-06-background/chapter-51-worker/chapter.md) · [第 55 章站内通知](part-06-background/chapter-55-notifications/chapter.md)

### 第 54 章准备发送记录与签名回执

第53章的 Mailpit 接受应答只覆盖本机 SMTP。第54章新增发送明细和独立回执进程，用签名确认异步通知来自预期供应商。仍在开发 Mac 操作；先按[备份与恢复](#用备份建立练习副本)把停写的53库恢复到独立 `epp_ch54_verify`，原主线库保留。不要用空库替代已有账号与消息的升级对照。

Node仍为24.22.1。在54完成代码目录运行 `nvm use`、`npm ci`，然后 `npm ls svix`，应解析到2.10.0。Svix是随项目安装的验签库，不需全局CLI。沿53源码跟写时用 `npm install --save-exact svix@2.10.0`，一并保存锁文件。正文的本机签名请求还会验证库确实能核验原始字节，而非只检查版本号。[Svix JavaScript实现](https://github.com/svix/svix-webhooks/tree/main/javascript)

本机练习沿用[Mailpit安装](#在本机收取注册邮件)，为本轮单独启动 SMTP 1054、网页8054。打开浏览器输入 `http://127.0.0.1:8054`，页面可访问还不代表应用已发送；按正文发一笔新申请，在此找到那封邮件与原始头。第54章的本地供应商例子借这台Mailpit接收邮件，不连接外部邮件网络。

```bash
./mailpit --smtp 127.0.0.1:1054 --listen 127.0.0.1:8054
```

**真实邮箱路线再准备以下资源。** 在自己拥有管理权的Resend账号里添加发信子域，按该域的 Records 页逐项填写DNS记录并验证。SPF声明获准的发信来源，DKIM供收件端验证域名签署；控制台可能给出TXT、MX或CNAME等记录，以本账号显示的类型、名称和值为准，不照抄别人的DNS。选用独立发信子域，避免替换现有邮箱主域的收信记录。核对发送能力已验证，再继续。[域名状态与DNS记录](https://resend.com/docs/dashboard/domains/manage-domains)

在 **API keys → Create API Key** 新建本轮凭据，选 **Sending access** 并限制到已验证的发信域。值只在创建时展示，直接保存到私有发送配置；不用全权限key运行邮件Worker。另确定自己控制并获准本次试发的收件箱。[创建发信key](https://resend.com/docs/create-an-api-key)

Webhook签名密钥在添加回执入口后取得，放进另一份私有回执配置。它不是发信key。本地实验用独立随机练习密钥，不能拿本地签名事件冒充供应商投递记录。各角色配置的文件名、变量、目标库核对及启动顺序见[54.3](part-06-background/chapter-54-mail-delivery/chapter.md#543-把重复迟到和伪造回执送入入口)。

### 第 54 章临时接收公网回执选做

只做本机实验时跳过此节。外部供应商无法访问你Mac的回环地址；临时联调可以让cloudflared主动连接公网，再把HTTPS请求转到本机独立回执端口3354。已有可用的HTTPS回执主机时直接复用，不需安装连接器，也不需先学后面的Debian部署。

在Mac终端运行 `command -v cloudflared` 和 `cloudflared --version`。没有时，用已准备的Homebrew运行 `brew install cloudflared`，再检查版本；也可从官方页下载匹配芯片的Darwin发行包。使用官方当前支持的版本。[macOS安装](https://developers.cloudflare.com/tunnel/downloads/)

先沿正文的本机步骤生成独立练习签名密钥并启动回执进程，暂时不启动外部邮件发送者。在Mac用下面的请求确认唯一入口会拒绝未签名请求，预期400，而不是连接失败。再开单独终端启动Quick Tunnel；仅指向3354，不能换成API、Mailpit或观察页的端口。

```bash
curl -i -X POST http://127.0.0.1:3354/webhooks/resend \
  -H 'Content-Type: application/json' --data-binary '{}'
cloudflared tunnel --url http://127.0.0.1:3354
```

终端给出临时HTTPS域名，把它与 `/webhooks/resend` 拼接后填入 Resend **Webhooks → Add Webhook**。选择本章的 sent、delivered、delivery_delayed、bounced、complained 事件，取得该入口签名密钥，更新私有回执配置并重启接收进程。真实事件后在控制台看该次HTTP响应，数据库按同一个svix-id核对落地；只看到连接器在线不算接入完成。[创建Webhook](https://resend.com/docs/webhooks/create-webhook)

Quick Tunnel用于临时开发，域名随重启改变，没有持续可用保证；改名后要同步平台入口。不能加要求浏览器邮箱验证码的访问门禁，自动回调无法通过，身份由正文验签保证。结束后停连接器，并在平台停用临时回执入口；长期运行改用稳定入口与运维方案。[Quick Tunnel边界](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

### 让 API 生成并保存头像

第 59 章先做到返回预览图。在运行 API 的 Mac 项目目录执行 `npm ci`，保留可选依赖，npm 会按操作系统和 CPU 架构取得 sharp 的原生组件。用同一目录下的 Node 加载模块：

```bash
node --input-type=module -e "import sharp from 'sharp'; console.log(sharp.versions.sharp, sharp.versions.vips)"
```

配套版本为 sharp 0.35.5、libvips 8.18.7。再把该章的灯塔 PNG 发给预览接口，应得到 256 × 256 的 WebP。到下一章需要把图片留给下一次请求读取时，再启动下面的存储服务。[第 59 章头像预览](part-07-profiles/chapter-59-avatar/chapter.md)

### 启动私有存储

在第 60 章代码根目录完成 `nvm use` 和 `npm ci`。下面三行依次下载并校验 SeaweedFS 4.52、建立本机数据与身份目录、启动服务。首次按顺序执行；已有 `.chapter51-store/` 时，用 `.chapter51-tools/weed version` 核对版本，从最后一行启动原存储。

```bash
sh database/chapter-51/install-weed.sh
node database/chapter-51/init-store.mjs
sh database/chapter-51/start-store.sh
```

保留前台进程，另开项目终端执行 `nvm use`。把下面的 `12345` 换成启动行显示的 PID，检查十个监听均在回环地址上，再用配套工具建桶。

```bash
sh database/chapter-51/listeners.sh 12345
node database/chapter-51/store-probe.mjs buckets
```

用 Chrome **访客窗口**打开 `http://127.0.0.1:18632/`，点 **buckets → avatars** 可在 Filer 管理界面查看文件。API 走的是另一个入口 `http://127.0.0.1:18633`。按章节命令加载 `.chapter51-store/app.env` 中的四项 `AVATAR_S3_*`，它们配合项目安装的 AWS SDK 访问对象；`admin.env` 留给建桶操作。执行 `node database/chapter-51/store-probe.mjs write`，核对应用能读回刚写入的字节，匿名读取返回 403。随后按正文重启验证并清理样图，第 62 章继续使用原来的数据和身份。[第 60 章存储与权限验证](part-07-profiles/chapter-60-avatar-storage/chapter.md)

### 为头像核对建立独立观察身份

第 61 章沿用第 60 章的软件与同一套头像结构。先用 `node --version`、`psql --version`、`pg_dump --version`、`pg_restore --version` 与 `.chapter51-tools/weed version` 确认 Node 24.22.1、PostgreSQL 18.x、SeaweedFS 4.52；DBeaver 和 Postman 使用原来的账号资料。所有操作在 Mac 的新练习代码目录完成，无须另一台主机。

先停妥原写入者，把非空数据库恢复到新的 VERIFY，再正常停止 SeaweedFS、复制整个 `.chapter51-store`。副本与原实例不能同时占用同一组端口；不要重新初始化桶身份。恢复后用原 Cookie 读取同一资料、素材和头像，核对 ID 和图片摘要，确认库与桶成对。

本章新增的 `.mjs` 工具直接使用已安装的 pg 和 AWS SDK，不需要单独构建或新守护进程。按正文先放齐 `database/chapter-61-reconcile/`，停止副本存储后运行 `init-observer.mjs`，由它首次建立 `.chapter61-private/`。再用管理员在已核对的副本执行 `readonly.sql`，通过 psql 隐藏提示设置观察角色密码。DBeaver 新连接只选这个观察角色，确认指定列可读、其他列和更新被拒。对象观察身份只获 List/Read，API 原身份保持。

观察配置分别在私有 `db.env` 与 `s3.env`，不要把 API 配置替换成它们；取消终端已有的同名 `RECONCILE_` 变量后再加载。首次两份分页结果都显示完整、来源正确，生成的静态 HTML 可直接在本机 Chrome 打开；无需启动网页服务器。扫描中断时保留不完整文件，另取新文件重扫。详见[第 61 章的配置、权限核对与第一次清点](part-07-profiles/chapter-61-object-reconcile/chapter.md#611-为对账准备两份独立清单)。

## 5. 从开发目录交付一份可运行的服务

以前打开 VS Code、启动开发服务器就可以工作。现在要让另一个人拿到构建产物后，能连到约定的数据库、查询原来那笔业务，并在你关闭终端后继续运行。先在熟悉的 Mac 上把这件事走通。

**先从一个管理命令试起。** 第 63 章的账号管理 CLI 随项目一起构建。在该章代码目录完成迁移、构建，用预期库名与账号 ID 预览一次操作；确认查到目标账号后，再决定是否执行。开发终端里的 `.env` 供开发命令使用，运行生产产物时要由启动者明确提供配置。用该章的 `npm run build` 构建后，生产 API 通过 `npm start` 启动。[第 63 章管理命令](part-08-maintenance/chapter-63-account-cli/chapter.md)

**在一个独立目录检验交付。** 第 64 章先在源码根目录执行 `nvm use`、`npm ci`。Biome 2.6.6 和 Prisma 生成器辅助包 7.10.1 由锁文件安装，运行 `npm run ci:check` 会检查格式、Lint、类型、构建和两份生成文件。在 VS Code 1.121 或更新版打开 `docs/generated/ERD.md`，选择 **Markdown: Open Preview to the Side** 查看数据关系。再按正文把构建产物放到单独目录，只安装生产依赖，用 `.env.delivery` 的 `DATABASE_URL` 连接独立空库，实际启动各角色。练习 API 默认使用回环端口 3354。选择远程 CI 时，准备自己的 GitHub 练习仓库并启用 Actions，让作业启动自己的 PostgreSQL。[第 64 章构建与交付检查](part-08-maintenance/chapter-64-build-ci/chapter.md)

**给性能采样留一个专用库。** 第 65 章要观察请求为什么会变慢，让专用库承担实验中的等待和写入。在代码根目录的 `.env.perf` 中只填指向本机 `epp_ch55_lab` 的 `DATABASE_URL`。池等待实验使用临时端口。CPU profile 保存到私有临时目录，堆快照从合成进程生成，分别在 Chrome 的 **Performance** 和 **Memory** 导入。投递实验也用自己的 API、SMTP 和网页端口，例如 3355、1055、8055。[第 65 章性能采样](part-08-maintenance/chapter-65-performance/chapter.md)

**为空间回收保留三个独立会话。** 支线 65B 沿用 PostgreSQL 18 与 DBeaver。按前文建立数据库的方法另建由练习角色拥有的空库 `epp_ch65b_lab`，不执行 EPP 的 bootstrap；在 DBeaver 新建连接后分别建立 A、B、C 独立连接，用 `current_database()`、`inet_server_port()` 和三个不同的 `pg_backend_pid()` 核对目标。B 建普通练习表并写入，A 保留事务快照，C 在自动提交模式执行维护。仅练习表暂时关闭 autovacuum，收尾恢复；检查磁盘余量的 `df` 在数据库宿主机执行。[65B 三连接与空间回收](part-08-maintenance/chapter-65-performance/side-02-pg-maintenance.md)

**为坏记录保留来源与现场两份库。** 第 66 章沿用 PostgreSQL 18、Node 24.22.1、DBeaver 和 Postman。用第 65 章非空副本建立 `epp_ch66_source`，在停写备份恢复出的独立 `epp_ch66_verify` 核对原始历史；只在 source 的两个明确合成 ID 注入缺修订故障。API 使用原 Cookie 和配置，维护 CLI 用 `.env.ch66` 与 `.env.ch66-verify` 分别选库并显式校验预期库名。本机 API 使用 scripts/dev.mjs 编译监听并开启 Inspector 9229，按正文用轮询模式做保存、重启与退出对照；为 HTTP 留一个回环端口（如 3366）；证据文件保存在 Git 之外，审批后固定摘要。新版本需要新增的完整性迁移；旧库升级与新空库 bootstrap 分别验证，不能仅切分支。[第 66 章操作](part-08-maintenance/chapter-66-bad-data/chapter.md)

### 第 67 章准备两套本机制品验收环境

本章继续在 Mac 操作，不需要先安装 Debian 或 Docker。沿用 Node 24.22.1、PostgreSQL 18、SeaweedFS、Mailpit、DBeaver 和 Postman；安装入口见上方软件表。系统自带 Bash、tar、shasum 与 awk，先执行 `command -v bash tar shasum awk`，应分别找到程序。`tar --version` 可核对本机 libarchive 版本；`shasum -a 256` 用于归档摘要。无需另装 GNU tar。

按[第 62 章](part-07-profiles/chapter-62-review/chapter.md)的停写与配对恢复步骤准备两套非空库和独立桶副本，先保留原账号、素材 ID、收据与头像摘要。数据应已完成第 66 章的迁移与隔离核对；配置从 `.env.ch66-api` 复制并分别改为本轮副本目标。两套 API 可使用 3368、3369，数据库与存储端口按已有实例的分配记录填写；DBeaver 对每套连接查询实际库名与服务器地址，Postman 保存两套 baseUrl。配置、可写 work 和程序归档分开保存，env 文件权限 0600。邮件只连接练习收件箱。

在[第 67 章](part-08-maintenance/chapter-67-artifact-promotion/chapter.md)先按锁安装与构建，在独立目录安装生产依赖；归档解包后真正完成密码登录和 PNG 转 WebP，才能证明该平台的原生模块可用。只检查版本、require 或摘要，不能代替这些操作。源码修改沿用第 66 章调试模式；解包后的生产入口不启 Inspector、不监听源码。

### 第 68 章准备维护与制品交接

**带着已有数据交接。** 空库能检验交付文件是否齐全，已有账号和收据则能检验服务接到了哪一份数据。第 68 章用第 66 章的代码，将有历史数据的库恢复为交接副本，连接写入仅自己可读的 `.env.handoff`，空库仍由 `.env.delivery` 选中。分别为交接 API 与交付探测留出回环端口（如 3357 和 3356），另开两个连接到交接副本的 SQL 会话，才能在一个会话持锁时从另一个观察。[第 68 章维护交接](part-08-maintenance/chapter-68-review/chapter.md)

### 用 Bash 启动服务，选做 Mac 托管

第 64 章在独立工作目录验证产物，部署篇沿用第 68 章的程序与配置。若部署目标就是 Mac，支线 69B 用 macOS 自带的 launchd 托管它们。在已图形登录的 Mac 上打开终端。书中分标签页观察各角色，若要使用相同界面，首次执行 `brew install --cask iterm2` 安装 iTerm2。系统“终端”也能运行相同的 Bash 命令。[iTerm2 安装入口](https://formulae.brew.sh/cask/iterm2)

在项目目录的 Zsh 先执行 `nvm use`，再输入 `/bin/bash`。这样子 shell 会继承已选 Node 的路径。在 Bash 中用 `echo "$BASH_VERSION"`、`node --version` 确认 shell 和 Node 24.22.1，即可开始第 64 章。选做 69B 时用 `command -v launchctl plutil` 确认系统工具可用。项目脚本用 Node 生成任务文件，`plutil` 可以读文件，`launchctl` 将任务交给宿主管理。按正文把产物、配置、工作文件和日志放入各自的持久目录。启动邮件角色前，核对待发任务和 Mailpit 地址。[第 64 章前台启动](part-08-maintenance/chapter-64-build-ci/chapter.md) · [69B 在 Mac 托管](part-09-deployment/chapter-69-target-environment/side-02-macos-supervision.md)

## 6. 从 Mac 接手另一台机器上的 EPP

从第 69 章开始，请求仍在手边的 Mac 上发出，程序和日志可以在另一台机器上。下文把前者叫**操作端**，后者叫**部署端**。`127.0.0.1` 始终指运行当前命令的那台机器。给两个终端页分别标上机器名，切换时用 `hostname`、`id -un` 查看自己在哪里、以谁的身份操作。

### 准备 Debian 13 部署端

第 69 章从干净的 Debian 13 部署机起步。你可以用已有练习主机，或从 Mac 上创建一台独立虚拟机。后续分权、交付、HTTPS 与运维都接着用这台主机。

**只有一台 Mac**，可用 Lima 创建 Debian 虚拟机。下面在 Mac 终端执行。已有 Lima 时先查版本；首次创建名为 `epp-debian` 的实例时，Lima 会下载 Debian 13 镜像，为它建立虚拟磁盘。已有这个实例时直接用 `limactl start epp-debian` 启动原磁盘。[Lima 安装说明](https://lima-vm.io/docs/installation/) · [Debian 13 镜像模板](https://github.com/lima-vm/lima/blob/master/templates/debian-13.yaml)

```bash
brew install lima
limactl --version
limactl start --name=epp-debian --containerd=none template:debian-13
limactl list
limactl shell epp-debian
```

在 `limactl list` 中看到 `epp-debian` 为 Running 后，最后一行才进入 Debian。**有独立练习机**，可按机器架构选官方安装指南，安装 Debian 13，选择 SSH server，准备一个有管理权限的账号。**已有 Debian 主机**，从它的控制台直接做下面的检查。[Debian 13 安装指南](https://www.debian.org/releases/trixie/installmanual)

以下在 **Debian 部署端**执行：

```bash
cat /etc/os-release
ps -p 1 -o comm=
systemctl is-active ssh
sudo -v
```

应看到 `ID=debian`、`VERSION_ID="13"`，PID 1 为 `systemd`。`sudo -v` 成功表示账号可通过 sudo 认证。如果 SSH 显示 inactive，用 `sudo systemctl enable --now ssh` 启动；若提示找不到 unit，先执行 `sudo apt-get update` 和 `sudo apt-get install openssh-server`。再查 `systemctl is-active ssh` 应为 `active`。[Debian OpenSSH 服务端](https://packages.debian.org/trixie/openssh-server)

### 从 Mac 建立 SSH 连接

在 **Mac 操作端**用 `command -v ssh ssh-keygen scp` 和 `ssh -V` 确认系统自带的 OpenSSH 客户端。先从[Debian 部署端控制台](#准备-debian-13-部署端)取得主机身份，再发起首次登录。

在首次连接前取得地址、端口、允许登录的账号，以及从部署机控制台或可信交接渠道取得的主机公钥指纹。Lima 用户可在 Mac 用 `limactl list --format '{{.SSHConfigFile}}' epp-debian` 找到实例的 SSH 配置，查看实际的 HostName、Port、User 和 IdentityFile。`limactl shell` 本身也经过 SSH。从 Lima 2.3 起，首次启动新实例时会把主机公钥保存在实例目录的 `ssh.known_hosts`；若实例由你在可信 Mac 上创建并确认过，可用 `ssh-keygen -lf` 加该文件路径读回已有指纹。接手别人的主机时，向管理者核对。[Lima 的 SSH 配置与主机公钥](https://lima-vm.io/docs/usage/ssh/)

第 69 章把练习目标写入 Mac 的 `~/.ssh/epp71.conf`，起名 `epp-lab`。用 `ssh -F ~/.ssh/epp71.conf -G epp-lab` 检查展开后的目标，再用 `ssh -F ~/.ssh/epp71.conf epp-lab` 登录，比对首次提示的指纹。后文会简写为 `ssh epp-lab` 或 `scp … epp-lab:…`。要使用简写，在 Mac 的 `~/.ssh/config` 开头加入 `Include ~/.ssh/epp71.conf`；也可继续显式带 `-F ~/.ssh/epp71.conf`。若从别的主机切换到 Debian，更新连接参数并核对新主机指纹。[第 69 章远程连接与换钥](part-09-deployment/chapter-69-target-environment/chapter.md)

确认主机和账号后，在第 69 章传入目标平台的制品、接通隔离依赖，在前台验证一次读取。换主机钥匙的支线使用专用的第二个监听。[第 69 章](part-09-deployment/chapter-69-target-environment/chapter.md)

### 在 Debian 接手已有的数据库、桶和收件箱

第 69 章要关闭操作 Mac 上的终端，Debian 上的 API 仍需读到昨天的账号和头像。本书用一台常驻的 Debian 练习机同时运行 PostgreSQL、SeaweedFS 和 Mailpit。管理端与浏览器可在同一台笔记本上。若用 Lima 在这台笔记本内模拟 Debian，退出 SSH 可以测试进程归属；关掉笔记本也会关掉虚拟机。要实际关掉操作机，部署机需独立供电和联网。已有独立数据主机的读者也可以保留它，[70B 的数据通路](part-09-deployment/chapter-70-service-runtime/side-02-private-data-link.md)说明怎样让 Debian 自行连接。

**先准备目标机。** 在第 69 章已核过指纹的 Debian SSH 页运行 `hostname`、`cat /etc/os-release` 和 `dpkg --print-architecture`。下面按 Debian 13 的 amd64 或 arm64 操作。PostgreSQL 用 18.x，SeaweedFS 用 4.52，邮件收进本机的 Mailpit 1.33.0。三个服务都只接受部署端回环连接。

1. 从 PostgreSQL 官方 Debian 安装页启用 PGDG 软件源，安装 `postgresql-18` 和 `postgresql-client-18`。用 `/usr/lib/postgresql/18/bin/pg_restore --version` 确认主版本，`pg_lsclusters` 查看实例。给本书新建实例前先用 `ss -lnt` 检查 55471 空闲，确认没有同名 18/epp 练习实例；再运行 `sudo pg_createcluster 18 epp --port 55471 --start`。从 `sudo -u postgres psql -X -p 55471 -d postgres` 检查 `SHOW data_directory;`、`SHOW listen_addresses;` 和 `SHOW port;`，实际监听只应出现在部署端回环。已有自己的专用实例时，后文都用那一实例的端口。[PostgreSQL 在 Debian 的安装说明](https://www.postgresql.org/download/linux/debian/)
2. 在 Debian 的新私有暂存目录下载对应架构的两个发行包，分别解压并安装 Linux 可执行文件。下面用固定版本的官方发行资产和公开摘要。另装 `lsof` 供第 60 章的原启动脚本检查端口。[SeaweedFS 4.52](https://github.com/seaweedfs/seaweedfs/releases/tag/4.52) · [Mailpit 1.33.0](https://github.com/axllent/mailpit/releases/tag/v1.33.0)

```bash
(
  set -eu
  stage=$(mktemp -d)
  cd "$stage"
  arch=$(dpkg --print-architecture)
  case "$arch" in
    arm64) weed_sha=b70a09540bf8aa2b9ea2a48b3b16abe27e162e90a0c3bf041f8d414caf52de8a
           mail_sha=1d27c819e1a5dd2761ed9fd07022443e35a47793b2e92de5b49cf3656a649ef9 ;;
    amd64) weed_sha=8b538c22d47d0c3fb6792adaa6b0c735a967401270a53427d5a476dcaca9b7ae
           mail_sha=d0ec50080cbf3e7c1fa2cda2ee68125d7894175811084b1f8f47c6cfc6f487c8 ;;
    *) exit 1 ;;
  esac
  curl -fL --retry 2 -o weed.tgz "https://github.com/seaweedfs/seaweedfs/releases/download/4.52/linux_${arch}.tar.gz"
  curl -fL --retry 2 -o mail.tgz "https://github.com/axllent/mailpit/releases/download/v1.33.0/mailpit-linux-${arch}.tar.gz"
  printf '%s  weed.tgz\n%s  mail.tgz\n' "$weed_sha" "$mail_sha" | sha256sum -c -
  tar xf weed.tgz weed
  tar xf mail.tgz mailpit
  sudo install -d -m 0755 /opt/epp-data/bin
  sudo install -m 0755 weed mailpit /opt/epp-data/bin/
  /opt/epp-data/bin/weed version
  /opt/epp-data/bin/mailpit version
)
```

**从第 68 章的交接副本接手。** 在 Mac 上记录实际源库名、端口、当前的 avatarId 和已保存图的 SHA-256。停掉 API、邮件和通知进程及其他会向该库和桶写入的练习程序，等在途请求结束，保持 PG 在线。正常停止本轮 SeaweedFS，确认原 PID 已退出。以下的 `store` 填实际运行的 `.chapter51-store` 绝对路径，里面有原 s3.json、config 和 data。这个目录只用于书中的单机、同版本 mini 练习。将下列归档保存在权限 0700 的私有目录，其中包含桶凭据。

```bash
umask 077
handoff=$(mktemp -d)
pg_dump -h 127.0.0.1 -p "$source_port" -U "$owner" -W -d "$source_db" -Fc -f "$handoff/epp.dump"
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$handoff/store.tgz" -C "$store" .
(cd "$handoff" && shasum -a 256 epp.dump store.tgz)
```

每一步成功再继续。在 Mac 的配套仓库根目录把 `database/chapter-51/start-store.sh` 和 `examples/deployment/runtime-grants.sql` 与上面两份归档一起通过 scp 交给 Debian 登录者的**新私有目录**。例如先执行 `ssh -F ~/.ssh/epp71.conf epp-lab 'umask 077; mkdir epp-data-in'`，再执行 `scp -F ~/.ssh/epp71.conf "$handoff/epp.dump" "$handoff/store.tgz" database/chapter-51/start-store.sh examples/deployment/runtime-grants.sql epp-lab:epp-data-in/`。进入 Debian 的 ~/epp-data-in，用 sha256sum 对照从源机独立记下的两个摘要。

在 **Debian** 的全新 18/epp 实例建立一套专用库。以下用 epp_owner 作为迁移所有者，epp57_run 作为接手阶段临时使用的受限运行角色。先在上面的 postgres 会话用 `\du`、`\l` 查重。设置自己的数据库口令；将新运行口令写入部署端专用配置，保留已验的应用签名密钥。库名可以沿用源副本的名字，下面示例为 epp_ch72_handoff，全程用实际选择的同一名字。

```sql
CREATE ROLE epp_owner LOGIN;
CREATE ROLE epp57_run LOGIN;
\password epp_owner
\password epp57_run
CREATE DATABASE epp_ch72_handoff OWNER epp_owner;
```

在 Debian 登录用户的暂存目录依次执行。恢复在单事务中完成，当前所有者重新建立数据库对象，随后装回运行所需的最小授权。后续第 70 章会在同一实例中拆分 epp57_run。

```bash
db=epp_ch72_handoff
pg_restore -h 127.0.0.1 -p 55471 -U epp_owner -W -d "$db" \
  --exit-on-error --single-transaction --no-owner --no-privileges epp.dump
psql -X -h 127.0.0.1 -p 55471 -U epp_owner -W -d "$db" \
  -v expected_db="$db" -f runtime-grants.sql
```

**让数据服务留下来。** 在这台专用 Debian 上为桶与收件箱各建一个普通服务身份。先确认名称、路径和端口均空闲；接手续做时查看已有 unit 的身份和目录，别对已有库桶重新初始化。Mailpit 使用一个新练习收件箱，历史投递结论看恢复库；若旧通道仍被 unknown 消息占用，继续保持停发。

```bash
sudo apt-get install -y lsof
sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin epp-store
sudo useradd --system --user-group --no-create-home --shell /usr/sbin/nologin epp-inbox
sudo install -d -m 0755 /opt/epp-data/.chapter51-tools
sudo ln -s /opt/epp-data/bin/weed /opt/epp-data/.chapter51-tools/weed
sudo install -m 0755 start-store.sh /opt/epp-data/start-store.sh
sudo install -d -m 0700 -o epp-store -g epp-store /opt/epp-data/.chapter51-store
sudo -u epp-store tar --no-same-owner -xzf - -C /opt/epp-data/.chapter51-store < store.tgz
```

`start-store.sh` 从工作目录找二进制和数据；把整个存储目录交给 epp-store 后，它才能按原身份文件打开桶，并同时找到 Filer 元数据和 Volume 内容。在 /etc/systemd/system/epp-store.service 和 epp-inbox.service 分别写入下面两份定义。

```ini
[Unit]
Description=EPP private avatar store
[Service]
User=epp-store
WorkingDirectory=/opt/epp-data
ExecStart=/bin/sh /opt/epp-data/start-store.sh
Restart=on-failure
UMask=0077
[Install]
WantedBy=multi-user.target
```

```ini
[Unit]
Description=EPP practice mail inbox
[Service]
User=epp-inbox
StateDirectory=epp-inbox
StateDirectoryMode=0700
ExecStart=/opt/epp-data/bin/mailpit --smtp 127.0.0.1:1025 --listen 127.0.0.1:8025 --database /var/lib/epp-inbox/mail.db
Restart=on-failure
UMask=0077
[Install]
WantedBy=multi-user.target
```

运行 `sudo systemctl daemon-reload`、`sudo systemctl enable --now epp-store epp-inbox`。用 `systemctl status epp-store epp-inbox`、`ss -lnt` 查看进程和回环监听。若存储不起来，用 `sudo -u epp-store tail /opt/epp-data/.chapter51-store/weed.log` 找首个错误。回到第 69 章，以受限角色查原收据，用原会话从当前桶真正下载旧图、与源摘要比对。到第 70 章再让一封新邮件经过 1025 并在 8025 的收件界面按收件人核对。将目标库名、数据库与 S3 端口、SMTP 与网页端口和原记录交给各自的应用进程。此后可以关闭操作机；数据文件及三个服务都在部署机上。

### 安装部署端共用的 Linux Node

第 69 章首次启动服务时需要目标平台的 Node。第 70 章再让 API、邮件和通知各用自己的系统用户。先在 Debian 执行 `systemctl --version`、`command -v useradd install`。创建用户、指定文件属主和安装系统级 unit 需要管理权限。服务还需要一个各账号都能执行的 Linux 版 Node，绝对路径固定在 `/opt/epp72/node/bin/node`。

在 **Debian 部署端**用 `uname -m` 查看架构，`aarch64` 选 Linux arm64，`x86_64` 选 Linux x64。从官方 v24.22.1 发布目录下载对应的 `.tar.xz` 和同目录的 `SHASUMS256.txt`。将两者放在同一练习目录，在该目录的 Bash 执行下面的命令。已有指定路径和版本时，直接做最后的路径与版本检查。[Node.js 24.22.1 官方发行文件](https://nodejs.org/dist/v24.22.1/)

```bash
(
  set -eu
  case "$(uname -m)" in aarch64) arch=arm64 ;; x86_64) arch=x64 ;; *) exit 1 ;; esac
  archive="node-v24.22.1-linux-$arch.tar.xz"
  awk -v name="$archive" '$2 == name {print; found=1} END {if (!found) exit 1}' SHASUMS256.txt > node-linux.sha256
  sha256sum -c node-linux.sha256
  sudo install -d /opt/epp72
  sudo mkdir /opt/epp72/node
  sudo tar --no-same-owner -xJf "$archive" -C /opt/epp72/node --strip-components=1
)
export PATH="/opt/epp72/node/bin:$PATH"
node -p 'process.version + " " + process.platform + " " + process.arch'
npm --version
```

`command -v node` 应指向 `/opt/epp72/node/bin/node`，版本、平台和架构应为 `v24.22.1 linux arm64` 或 `v24.22.1 linux x64`。若收到含生产依赖的完整 Linux 归档，先核对系统、CPU、Node 版本和整包摘要，再解开使用。在目标平台补装依赖的路径中，按锁安装后须重新封包；按第 69 章用旧账号实际登录、预览 PNG 得到可解码的 WebP，再核对旧数据与归档摘要，记录这个平台的验收结果。模块能 require 只是加载检查。

部署前准备 PostgreSQL 18 非空副本、与它配对的头像桶，以及邮件角色可达的私有 Mailpit。旧账号应已开通，留好原收据 ID。由迁移管理员建视图、数据库实例管理员建登录角色，各服务使用各自的凭据。Mac 上仍用 Postman 发请求、DBeaver 查数据。[第 70 章服务身份与验证](part-09-deployment/chapter-70-service-runtime/chapter.md)

第 70 章在同一个 release 下分别核对受限 API 的工作目录、只读收据身份与配对桶。第 75 章才为到期对象安装 systemd 定时器，保留独立的桶观察身份，并使用允许停机的练习主机。[第 70 章](part-09-deployment/chapter-70-service-runtime/chapter.md) · [第 75 章](part-09-deployment/chapter-75-maintenance-jobs/chapter.md)

### 给原来的 HTTP 服务接上 HTTPS

第 70 章的数据库、桶和私有收件箱已经能在管理者退出后继续提供服务。使用者要在自己的浏览器打开 EPP，也要能从 API 签发的地址读到实际头像。选一台使用设备能直接到达的 Debian 主机；使用虚拟机时，需要让来宾接入这台设备可达的私网。部署端用 `hostname`、`ip -br -4 addr` 查主机与私网地址，用 `ss -lnt` 确认 API 在同机 `[::1]:3374`，预定的私网 8443、9443 可供 nginx 使用。管理 Mac 可沿用已核过指纹的 SSH 别名管理 Debian。使用设备直接访问私网地址。各机用 `date -u` 对照时间，避免证书或短时签名因时钟偏差失效。[第 71 章：把 EPP 放到使用者能访问的 HTTPS 地址](part-09-deployment/chapter-71-service-access/chapter.md)

在 Debian、管理 Mac 和独立使用端的私网 DNS 或各自的 hosts 中，将 `api.epp.test` 指向部署机实际私网 IP。Debian 用 `getent ahostsv4 api.epp.test` 检查，Mac 用 `dscacheutil -q host -a name api.epp.test` 检查。若任意一台仍解析到回环，先修好它的记录。8443 在该名称下接收页面和 API 请求，9443 为浏览器和 API 共同提供私有对象入口。[71.1 的解析步骤](part-09-deployment/chapter-71-service-access/chapter.md#711-先让客户端按名字找到目标)

#### 两端准备 OpenSSL

**Mac 签发练习证书。** 在本次操作端 Bash 运行 `openssl version`。若输出 LibreSSL 或早于 3 的 OpenSSL，用 `brew install openssl@3` 安装，再执行 `export PATH="$(brew --prefix openssl@3)/bin:$PATH"`。在同一个终端用 `command -v openssl` 和 `openssl version` 确认会调用 OpenSSL 3。[Homebrew 的 OpenSSL 3](https://formulae.brew.sh/formula/openssl@3)

**Debian 为服务生成私钥和签名请求。** 在部署端也检查 `openssl version`，缺少 OpenSSL 时用 `sudo apt-get update`、`sudo apt-get install openssl` 安装并复查版本。签发用的私钥留在 Mac，服务自己的私钥留在 Debian，两端只传签名请求和公开证书。

#### 在 Debian 准备 nginx

在 Debian Bash 先用 `/usr/sbin/nginx -v` 检查系统版。还没有时，用 `sudo apt-get update`、`sudo apt-get install nginx` 安装程序和依赖。系统包可能同时启用默认站点，请用 `ss -lnt` 核对当前监听。书中另用普通部署账号自己的持久工作目录、配置文件和高位端口。在部署会话里核对二进制和 TLS 模块，记下正文所用的绝对路径。[Debian nginx 软件包](https://packages.debian.org/trixie/nginx)

```bash
nginx_bin=/usr/sbin/nginx
"$nginx_bin" -v
"$nginx_bin" -V 2>&1 | grep -o -- '--with-http_ssl_module'
```

最后一行应输出 `--with-http_ssl_module`。以前按练习说明单独解过 Debian 软件包的读者，也可把 nginx_bin 设为那份持久目录下的绝对路径并做同样的检查。第 71 章在 Debian 使用 nginx-private.conf，把访问范围限定到练习网。8443 的两个精确路径提供页面和脚本，其余业务请求转发到同机 3374。9443 使用同一名称的证书，把带原 Host 和签名参数的请求送往原桶，默认上游为回环 18633；单独数据机路线按 70B 的通路填写上游。

入口需要证书，按 71.2 生成并核对公开根、服务证书和完整链。随后在 71.3 把已核指纹的公开根安装到 Debian，给 epp72-api 服务设置 `NODE_EXTRA_CA_CERTS=/etc/epp72/practice-root.crt`，在 API 配置使用真实的 HTTPS Origin 和对象地址，预检 nginx 候选并托管入口，重启 API 使 Node 从进程启动时就能读取额外的根。管理端用自己的 curl 指定这份根，从私网名称请求本人资料，匿名收到 EPP 的 `401 AUTH_REQUIRED` 后准备交接。若要定位存储故障，可按 71.4 用部署者的练习账号上传新图并从 9443 实际下载，比对 avatarId 与文件字节。日常交付时，使用者在第 71 章用自己的账号完成浏览器端的首次发布与读回。[71.3 入口与存储配置](part-09-deployment/chapter-71-service-access/chapter.md#713-接通同源页面api-和头像存储)

#### 在独立使用设备验证入口

准备一台能连同一练习私网、装有浏览器的使用设备。Mac 可沿用前文的 Chrome，也可用系统 Safari。若需安装 Chrome，沿用[首次安装与启动步骤](#观察请求如何经过代码)。拿到的文件应是**公开根证书**。在其所在目录用 `openssl x509 -in root.crt -noout -fingerprint -sha256` 读出完整指纹，另行与管理端核对。在这台练习 Mac 的「钥匙串访问」里选登录钥匙串，导入这份根，打开证书的「信任」，将 SSL 设为始终信任，再重新打开浏览器。Firefox 独立配置也可在其「证书颁发机构」中导入该根，允许它标识网站。练习结束时按指纹移除本次导入的根。[71.2 交接证书与浏览器信任](part-09-deployment/chapter-71-service-access/chapter.md#712-签一张带正确名称的练习证书)

部署者在 71.5 安装两份公开文件并退出管理会话后，使用端先用 `curl --noproxy '*' --cacert ./root.crt https://api.epp.test:8443/profile/me` 取得匿名的业务响应，再在浏览器打开 `https://api.epp.test:8443/handoff/`。应看到没有证书警告的登录表单，在 Network 中确认 HTML 和脚本均为 200。第 71 章从这张表单继续，用自己的会话保存素材、从 9443 打开头像并收到通知。[71.5 交接地址](part-09-deployment/chapter-71-service-access/chapter.md#715-把这个-https-地址交给下一班) · [第 71 章使用者验收](part-09-deployment/chapter-71-service-access/chapter.md)

#### 用 Firefox 查看证书错误（选做）

如果想亲自看到证书诊断支线里的两张错误页，可以在**有图形会话的 Debian** 上安装 Firefox ESR 和 `libnss3-tools`，后者提供 `certutil`。这样可以只改变本次浏览器配置的信任，再与 curl 对照。只有终端的 Lima 虚拟机可以用前面的 curl 完成名称、证书链和换证练习。[Debian NSS 工具包](https://packages.debian.org/trixie/libnss3-tools)

```bash
sudo apt-get update
sudo apt-get install firefox-esr libnss3-tools
firefox-esr --version
command -v certutil
```

在 Debian 确认版本和 `certutil` 路径后，按正文创建专用 Firefox 配置，核对练习根指纹，观察导入前后的页面。撤销信任时先保留 nginx 在线，再用同一浏览器配置访问原地址，才能看到证书再次被拒绝。[浏览器证书诊断](part-09-deployment/chapter-71-service-access/side-01-certificate-diagnostics.md)

### 让两个实例接到同一份练习数据

轮换从第 71 章交给使用者的 HTTPS 地址开始。保留证书、服务名称、客户端信任和现有会话。准备两个 API 监听、各自的工作目录、独立 PostgreSQL 18 集群副本、配对桶和私有 Mailpit。数据库登录权限属于整个集群，先核对副本端口、数据目录和库名。记录一张旧收据、一笔投递状态和可以续页的账号数据。定向请求实验的路由与外部验收分别见[第 76 章](part-09-deployment/chapter-76-rotate-credentials/chapter.md)。

### 为隔离恢复演练准备 PostgreSQL 18

在持有隔离集群数据目录的数据库练习主机操作。Mac 可复用[第 17 章的 PostgreSQL 18 安装](#homebrew-与数据库程序)。使用 Linux 时，在已安装 PostgreSQL 18 的练习主机找同一套服务器程序的 bin 目录。将其放到当前 shell 的 PATH 前，再用运行该练习集群的系统账号依次检查：

```bash
hostname
id -un
pg_basebackup --version
pg_verifybackup --version
pg_ctl --version
```

三个程序都应显示 18.x。用明确指定的实例地址、端口和管理员连接运行 `SHOW data_directory`、`SHOW hba_file`，对照本轮隔离副本。基础备份需要允许复制连接的数据库角色，且这条连接在该副本的 pg_hba.conf 有匹配的 replication 规则。按本次实际使用的本地套接字或回环地址授权，重新加载该副本配置；普通业务登录成功只验证了业务库的连接规则。再按支线保存 WAL、校验备份并恢复到另一空目录，使用不同的端口。[支线 78A](part-09-deployment/chapter-77-backups/side-01-pitr.md)

### 为公网回调准备连接器（选做）

使用已有公网 HTTPS 主机时直接核对回调域名、证书与路由。选用 Cloudflare Tunnel 时，先准备自己有管理权的域名与 Cloudflare 账号。在常驻 Debian 部署端运行 `dpkg --print-architecture`，按官方入口选择匹配的 Linux 架构与安装方式，运行 `cloudflared --version` 验证。按控制台指引建立隧道，在部署端执行该隧道专用的运行命令，连接凭据只留在受限配置中。确认连接器在线，再将测试子域和所需路径指向 EPP 上游。若回源使用 HTTPS，须让连接器验证正确的源站名称和签发者。从外部网络验证实际回调，结束练习后撤下临时公网路由。[下载与安装](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/) · [创建隧道与路由](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/get-started/create-remote-tunnel/)

### 为容器部署准备引擎与 Compose

第 69 章已能在目标平台运行生产产物。容器路线还要将 Node、系统库和生产依赖一起交付，并管理进程替换后的数据与网络。Docker Engine 运行 Linux 容器，CLI 发管理请求，Buildx 构建镜像，Compose 管理一组角色。安装在将要运行容器的部署端；Mac Desktop 用于本机机制实验时属于另一个引擎。

在 Debian 的 SSH 终端运行 `hostname`、`cat /etc/os-release`、`uname -m`，核对已进入第 69 章的 Debian 13 练习机和目标架构。打开 [Docker Debian 安装页](https://docs.docker.com/engine/install/debian/)，按“Install using the apt repository”准备官方签名密钥和 apt 来源；若机器已有其他容器服务，先核对包冲突与现有资源，再安排安装。配置好来源后在这台机执行：

```bash
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl status docker --no-pager
sudo docker context show
sudo docker version
sudo docker buildx version
sudo docker compose version
sudo docker run --rm hello-world
```

Docker 服务应为 active，`version` 同时显示 Client 和 Server；Buildx 与 Compose 各自显示版本。最后一次运行需要下载镜像，输出 hello-world 的成功说明后退出。若服务未启动，先用 `sudo systemctl start docker` 再复查；出现权限拒绝、无法连接引擎或下载失败时，分别查操作身份、服务/context、网络与仓库。记录此次 Engine、Compose 版本和架构，后续按这组版本核对配置支持。

本书的 Debian 示例默认沿用 `sudo docker`。支线为便于阅读写成 `docker` 的命令，在 Debian 每次调用也加 `sudo`；Mac Desktop 使用普通用户的 `docker`。不要混用两种身份后只看 context 名，CLI 配置与仓库登录可能属于不同用户。容器内以 node 身份运行和谁能管理引擎是两项权限；加入 docker 组会得到管理 rootful 引擎的高权限，不能给 API、邮件等运行用户加组来解决文件读权问题。[Linux 安装后的权限说明](https://docs.docker.com/engine/install/linux-postinstall/)

如果当前网络必须经过 HTTP 代理，终端里的 curl 能下载并不能证明引擎也能下载：CLI、Docker daemon 和构建阶段是不同的进程。按[官方 daemon 代理配置](https://docs.docker.com/engine/daemon/proxy/)为实际引擎配置可达的代理；再按[构建代理参数](https://docs.docker.com/build/building/variables/#proxy-arguments)把构建时所需代理传给安装依赖的步骤。使用 sudo 时还要确认客户端是否保留了所需代理环境。代理地址取自己的网络配置，不照抄他人的回环或虚拟机地址；不把代理凭据写进 Dockerfile 的 ENV 或项目配置。分别用 pull 和一次实际构建判断下载通路，不以换成未核验的镜像源代替排查。

只在 Mac 做独立进程、卷与网络实验时，按处理器选择 [Docker Desktop 安装包](https://docs.docker.com/desktop/setup/install/mac-install/)，启动应用后在 Mac 终端运行 `docker context show`、`docker version`、`docker buildx version`、`docker compose version`，再运行 `docker run --rm hello-world`。在 Desktop 的 Containers 页面打开实验容器，可以查看 Logs、Inspect 与运行状态，再对照终端里的同一个容器 ID。关掉 Mac 后仍要交付服务时，镜像与持久数据须在持续在线的部署环境运行。

进入 Compose 应用集成前，另准备已验证的 EPP Linux 镜像、三份受限角色配置、容器可达的数据库/SMTP/对象端点，以及练习 HTTPS 所用的公开根证书。它们来自前文已有交付，不由 hello-world 自动提供。第 72 章使用 `node:24.22.1-bookworm-slim`，先拉取并记录实际摘要，再用于应用构建；不把可变标签当作固定交付凭据。Dockerfile 在 base 阶段安装 ca-certificates，在 build 阶段安装 Python 3、make、g++，用途是验证出站 TLS 和编译可能缺少预编译产物的原生依赖。最终 runtime 只复制生产依赖与完整 dist，通过镜像里的 Node 版本、argon2 和 sharp 实际运算检查这些依赖。回到[第 72 章镜像交付](part-09-deployment/chapter-72-container-image/chapter.md)，接着完成[第 73 章 Compose](part-09-deployment/chapter-73-compose-deployment/chapter.md)，再进入[第 74 章运行观测](part-09-deployment/chapter-74-observability/chapter.md)。

## 7. 停下后怎样接着做

结束本机开发时，在前台程序的终端按 `Ctrl+C`，等进程退出。关闭 DBeaver 只会断开客户端；学习实例按第 17 章用 `pg_ctl` 停止并保留数据目录。如果用的是 Lima，在部署端按对应章节停妥练习服务，输入 `exit` 回到 Mac，再执行 `limactl stop epp-debian`。

下次从你正在做的那一章恢复：

| 上次停在哪里 | 先恢复什么 | 怎样知道可以继续 |
| --- | --- | --- |
| Mac 上开发 API | 进入原项目执行 `nvm use`。数据库篇起先启动原学习实例，再按本章命令启动 API。 | 重发保存的 Postman 请求，检查实际地址和响应。 |
| 寄信或头像练习 | 寄信时启动 Mailpit，异步寄信还需邮件 Worker；头像存储从原目录启动 SeaweedFS。 | 按本次收件人找到新邮件，或从原桶读回已有头像。 |
| 远程部署 | 启动原主机（Lima 用 `limactl start epp-debian`），确认服务状态，再按本章恢复数据通路及 SSH 转发。 | 从 Mac 访问约定的入口，用原账号核对原业务数据。 |

若要回看旧章，代码分支与数据库要成对选择。切换 Git 分支只改变代码，已经应用的迁移仍在数据库里。需要旧结构时恢复与该章匹配的副本。

| 遇到的现象 | 从哪里查起 |
| --- | --- |
| 找不到 nvm 或提示 `EBADENGINE` | 重开 Zsh，检查 nvm 加载配置。在代码根执行 `nvm use`，核对 `node --version` 和 `command -v node`。 |
| `npm ci` 找不到文件或依赖下载失败 | 先确认当前目录含项目锁文件。从空目录跟做时按该章创建文件。若下载报错，查看具体的网络、证书或权限错误，保留锁文件与证书校验。 |
| Postman 连不上，或请求一直等 | 核对 `baseUrl` 和启动终端的监听地址。如果调试器停在断点，继续执行后再观察；数据库阶段还可按本章检查等待。 |
| 启动提示端口已占用 | 在 Mac 用 `lsof -nP -iTCP:3000 -sTCP:LISTEN` 查占用监听的程序。查数据库换成 `55432`，查调试器换成 `9229`。 |
| `psql` 版本不对，或 DBeaver 连不上 | 先查 `command -v psql` 是否位于 PostgreSQL 18 的目录；在第 17 章检查实例状态，再逐项核对 DBeaver 的主机、端口、库名、账号和密码。 |

[返回全书目录](README.md)

### 第 16 章：在独立目录观察文件写入

沿用前章本机的 [Node 准备](#选择项目使用的-node)、[VS Code](#打开项目并启动-api)和 [Postman](#发送并保存第一个请求)。在独立练习副本执行 `nvm use`、`npm ci`、`npm run check`；确认 Node 为 24.22.1。先停前章 dev，避免 Inspector 9229 冲突。文件 API、readline 都由 Node 自带，无需安装数据库或文件锁包。

在项目根目录用 `mktemp -d` 建立私有实验目录，保存其绝对路径。两个终端各自进入同一项目、选择 Node 并恢复该路径；Shell 变量不会自动跨窗口传递。按[第 16 章](part-03-postgresql/chapter-16-json-file/chapter.md)先显式初始化，再以 JSON_FILE 启动独立入口；app.ready 和 Postman 的 201／原 ID 详情 200 才证明入口可用。CLI 先编译开发产物，生产 build 排除实验目录。停止后保留实验数据，下一次从已知基线复制新文件继续，不覆盖损坏现场。

### 第 30 章：在同一页签恢复待确认的提交

上一章已能保存采纳操作的回执，本章还要观察浏览器刷新以后能否继续一次创建或追加。沿用Chrome、Node、Postman与DBeaver，没有新增系统软件。先完成[数据库连接准备](#给开发迁移和测试各自选库)和[备份副本](#用备份建立练习副本)，在DBeaver用 `SELECT current_database(), current_user;` 核对是独立VERIFY库，保留前章的非空数据。页面、代理和API都运行在开发Mac，不能在部署端或日常数据上做末步失败实验。

进入第30章配套目录，`nvm use` 应显示Node 24.22.1；完成迁移与 `npm run check` 后，按章内命令启动 `examples/write-retry/api-fixture.mjs` 和 `server.mjs`。前者显式接VERIFY及合成用户，只绑定本机API端口；后者监听另一个回环端口并提供页面，不转发任意远端地址。启动后在Chrome打开 `http://127.0.0.1:3030`，看到“可以提交”才说明页面取得了当前练习身份；若一直无法确认，先分别检查API与代理的就绪日志和目标端口。

在Chrome菜单“更多工具 → 开发者工具”的Network中观察创建、身份确认及重试；Application → Session storage可核对本页签待办是否在刷新后保留，仅使用虚构原文，截图前关闭Cookies和真实站点。不要换地址中的主机名或端口来模拟账号切换，那会改变存储所属的源。关闭页签不作为本章的持久恢复保证。

固定身份夹具只用于身份篇之前的甲乙对照，不是登录系统。第38章之后改用正式API与 `SESSION_MODE=true`，第40章再开启 `CSRF_MODE=true`；实际页面源必须与APP_ORIGIN一致，登录与退出沿对应章节进行。故障模式默认关闭，练习开启时会截断每个键第一次成功响应，恢复时保持代理运行。

### 第 34 章：比较旧列表与分页读取

第33章已经安装数据库、客户端与Node，并准备CURSOR_HMAC_KEY。本章增加的是配套中的本地练习页面与转发脚本，没有新系统软件。API、页面与代理都运行在开发Mac，DBeaver连接独立VERIFY；用 `SELECT current_database(), current_user;` 对照预期实例和库名。不能在日常库为凑101条清空旧素材。

从33跟写时先按[取得第34章辅助材料](part-04-consistency/chapter-34-paging-upgrade/chapter.md#用101条数据把错误显出来)准备SQL、页面、集合与测试；不把完成分支的src覆盖到跟写目录。准备好辅助文件或直接检出34完成状态后，`nvm use` 应显示24.22.1。运行 `npm ci`、`npm run db:verify -- migrate status` 和 `npm run check`；本章没有新增迁移，但已有结构必须齐全。在VS Code复制 `.env.database-verify` 为 `.env.paging-verify`，保留VERIFY的DATABASE_URL并加入前章已保存的CURSOR_HMAC_KEY；`git check-ignore .env.paging-verify` 应输出该路径。书中命令先unset同名继承值，再以这份文件启动原有开发脚本，避免自动载入DEV或生成另一把临时密钥。

API在3000就绪后，另一终端运行 `PORT=3034 TARGET_PORT=3000 node examples/paging-upgrade/server.mjs`。Chrome地址栏输入 `http://127.0.0.1:3034`；默认既不截断旧列表，也不制造失败。先用Postman直连API确认能读取素材，再在页面输入本轮q。开发者工具的Network用于比较实际路径、页长、状态与续页；游标含查询上下文，截图前折叠URL参数，不打开Cookie或秘密配置。

LEGACY_CAP和FAULT_NEXT_PAGE_ONCE只在正文对应的隔离实验显式开启，页面会标出模式。重启代理会重置它自己的“一次失败”记录，不会修改数据库。恢复正常对照时去掉两个开关，保留相同页面源。登录章节之后可以开启SESSION_MODE，40起再加CSRF_MODE并将API的APP_ORIGIN设置为页面源；这时用已有账号真实登录，不使用固定身份代替Cookie认证。
