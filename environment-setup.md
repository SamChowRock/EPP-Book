# EPP 实践环境：从 Mac 开发到 Debian 部署

第一次跟做时，只要能从 Mac 上的 Postman 向你启动的 Node 程序发送请求，读回空列表，就准备好了。直接从[在 Mac 上跑通第一个请求](#2-在-mac-上跑通第一个请求)开始。读到第 17 章，才需要给这个程序接上数据库。以后每当一章用到新的软件，都可以从下表回到它的准备步骤。

## 1. 需要准备哪些软件

| 读到哪里 | 软件与安装位置 | 用它完成什么 |
| --- | --- | --- |
| 第 2 章 | [Xcode Command Line Tools、Git](#准备-mac-命令行)（Mac） | 在终端使用开发工具，取得章节代码 |
| 第 2 章 | [nvm、Node.js 24.22.1、npm](#选择项目使用的-node)（Mac） | 在项目指定的 Node 版本下安装依赖、启动 API |
| 第 2 章 | [Visual Studio Code](#打开项目并启动-api)、[Postman 桌面客户端](#发送并保存第一个请求)（Mac） | 在编辑器打开项目，在客户端发出并保存请求 |
| 第 2～3 章 | [curl](#发送并保存第一个请求)、[Google Chrome](#观察请求如何经过代码)（Mac） | 用命令行复查 HTTP 结果，用浏览器连接 Node 调试器 |
| 第 12 章 | [Swagger UI](#观察请求如何经过代码)（随项目安装） | 在 API 提供的文档页面试发请求 |
| 第 17 章 | [Homebrew、PostgreSQL 18.x](#homebrew-与数据库程序)、[DBeaver Community](#用-dbeaver-确认连的是哪个库)（Mac） | 建立学习实例，用 SQL 查看数据 |
| 第 25 章 | [pg_dump、pg_restore](#用备份建立练习副本)（PostgreSQL 18 自带） | 把原库备份并恢复到独立练习库 |
| 第 42 章 | [Mailpit 1.33.0](#在本机收取注册邮件)（Mac） | 用本地收件箱完成注册验证，第 43 章继续用它收重置邮件 |
| 第 44、47 章选做 | [微信开发者工具](#真实平台登录选做)（Mac） | 导入小程序，使用真实 AppID 联调 |
| 第 51 章 | [邮件 Worker](#让独立进程寄信)（随项目运行） | 把入队后的邮件交给 Mailpit；第 55 章再启动通知角色 |
| 第 59 章 | [sharp 0.35.5、libvips](#让-api-生成并保存头像)（随项目安装） | 解码图片并生成 WebP 预览 |
| 第 60 章 | [SeaweedFS 4.52](#启动私有存储)（Mac） | 给头像提供私有存储，重启后仍能读回原文件 |
| 第 64 章 | [Biome、Prisma 生成器辅助包](#5-从开发目录交付一份可运行的服务)（随项目安装） | 检查代码和生成文件；远程运行 GitHub Actions 属选做 |
| 第 70 章 | [Bash、launchd、iTerm2](#第-70-章在本机托管进程)（Mac） | 让宿主托管 API 和后台进程；iTerm2 用于复现书中终端界面 |
| 第 71 章 | [OpenSSH](#第-71-章从另一台电脑接手)（Mac 客户端、部署机服务端） | 从 Mac 登录另一台机器并转发请求 |
| 第 72 章；第 71 章选 Debian 时提前 | [Debian 13、systemd](#准备-debian-13-部署端)（部署机）；[Lima](#准备-debian-13-部署端)（选用 Mac 虚拟机路线） | 建立可独立管理用户和服务的 Linux 主机 |
| 第 72 章 | [Linux 版 Node.js 24.22.1、npm](#第-72-章为三个服务分配身份)（部署机） | 以各自的系统用户运行 API、邮件和通知 |
| 第 75 章 | [OpenSSL 3](#两端准备-openssl)、[nginx](#在-debian-准备-nginx)（OpenSSL 装在两端，nginx 装在 Debian） | 签发练习证书，由独立入口接收 HTTPS |
| 第 75.3 节选做 | [Firefox ESR、libnss3-tools](#用-firefox-查看证书错误选做)（有图形会话的 Debian） | 用专用浏览器配置观察导入练习根证书前后的变化 |
| 第 76 章 | [复用 PostgreSQL 18、curl 和 Mailpit](#让两个实例接到同一份练习数据) | 用同一份业务数据检查两个 API、后台进程和旧连接 |

<details>
<summary>第 77 章起还会用到什么？</summary>

第 77～80 章可选 Docker 与 Compose，第 81 章准备 Caddy（家庭主机隧道路线另用 Cloudflare Tunnel），第 82 章容器日志支线使用 Dozzle。第十篇做真实模型调用时准备供应商账号、密钥和额度，第 97 章用到 pgvector，第十三篇按所选 MCP 宿主准备客户端。[全书目录](README.md)

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

<a id="第-43-章用-mailpit-收信"></a>

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

### 让独立进程寄信

第 51 章开始，API 把邮件写入数据库，由独立的邮件 Worker 取出并投递。寄信用的 Nodemailer 随项目依赖安装。即使 API 已经接受注册请求，收件箱也要等 Worker 工作才会有信。沿用前面的 Mailpit，在项目根目录把 `database/chapter-43/worker.env.example` 复制为 `.env.worker`，填入与 API 相同的练习库以及本轮 SMTP 端口。

在两个项目终端分别执行 `nvm use`，一边运行 `npm run dev`，另一边运行 `npm run dev:worker -- epp_ch43_verify`，末尾换成实际练习库名。调试 API 连 `9229`，调试 Worker 连 `9230`。第 55 章复用 Worker 入口，选择 `notifications` 角色，处理结果在数据库的站内收件箱查看。[第 51 章 Worker 启动与调试](part-06-background/chapter-51-worker/chapter.md) · [第 55 章站内通知](part-06-background/chapter-55-notifications/chapter.md)

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

## 5. 从开发目录交付一份可运行的服务

以前打开 VS Code、启动开发服务器就可以工作。现在要让另一个人拿到构建产物后，能连到约定的数据库、查询原来那笔业务，并在你关闭终端后继续运行。先在熟悉的 Mac 上把这件事走通。

**先从一个管理命令试起。** 第 63 章的账号管理 CLI 随项目一起构建。在该章代码目录完成迁移、构建，用预期库名与账号 ID 预览一次操作；确认查到目标账号后，再决定是否执行。开发终端里的 `.env` 供开发命令使用，运行生产产物时要由启动者明确提供配置。用该章的 `npm run build` 构建后，生产 API 通过 `npm start` 启动。[第 63 章管理命令](part-08-maintenance/chapter-63-account-cli/chapter.md)

**在一个独立目录检验交付。** 第 64 章先在源码根目录执行 `nvm use`、`npm ci`。Biome 2.6.6 和 Prisma 生成器辅助包 7.10.1 由锁文件安装，运行 `npm run ci:check` 会检查格式、Lint、类型、构建和两份生成文件。在 VS Code 1.121 或更新版打开 `docs/generated/ERD.md`，选择 **Markdown: Open Preview to the Side** 查看数据关系。再按正文把构建产物放到单独目录，只安装生产依赖，用 `.env.delivery` 的 `DATABASE_URL` 连接独立空库，实际启动各角色。练习 API 默认使用回环端口 3354。选择远程 CI 时，准备自己的 GitHub 练习仓库并启用 Actions，让作业启动自己的 PostgreSQL。[第 64 章构建与交付检查](part-08-maintenance/chapter-64-build-ci/chapter.md)

**给性能采样留一个专用库。** 第 66 章要观察请求为什么会变慢，让专用库承担实验中的等待和写入。在代码根目录的 `.env.perf` 中只填指向本机 `epp_ch55_lab` 的 `DATABASE_URL`。池等待实验使用临时端口。CPU profile 保存到私有临时目录，堆快照从合成进程生成，分别在 Chrome 的 **Performance** 和 **Memory** 导入。投递实验也用自己的 API、SMTP 和网页端口，例如 3355、1055、8055。[第 66 章性能采样](part-08-maintenance/chapter-66-performance/chapter.md)

**带着已有数据交接。** 空库能检验交付文件是否齐全，已有账号和收据则能检验服务接到了哪一份数据。第 69 章用第 66 章的代码，将有历史数据的库恢复为交接副本，连接写入仅自己可读的 `.env.handoff`，空库仍由 `.env.delivery` 选中。分别为交接 API 与交付探测留出回环端口（如 3357 和 3356），另开两个连接到交接副本的 SQL 会话，才能在一个会话持锁时从另一个观察。[第 69 章维护交接](part-08-maintenance/chapter-69-review/chapter.md)

<a id="第-70-章在本机托管进程"></a>

### 在 Mac 托管 API 和后台进程

第 70 章沿用交接副本、同一恢复点的头像桶、旧账号与旧收据。要看进程在关闭终端后能否继续工作，可用 macOS 自带的 launchd 托管它们。在已图形登录的 Mac 上打开终端。书中分标签页观察各角色，若要使用相同界面，首次执行 `brew install --cask iterm2` 安装 iTerm2。系统“终端”也能运行相同的 Bash 命令。[iTerm2 安装入口](https://formulae.brew.sh/cask/iterm2)

在项目目录的 Zsh 先执行 `nvm use`，再输入 `/bin/bash`。这样子 shell 会继承已选 Node 的路径。在 Bash 中用 `echo "$BASH_VERSION"`、`node --version` 确认 shell 和 Node 24.22.1，用 `command -v launchctl plutil` 确认系统工具可用。项目脚本用 Node 生成任务文件，`plutil` 可以读文件，`launchctl` 将任务交给宿主管理。按正文把产物、配置、工作文件和日志放入各自的持久目录。启动邮件角色前，核对待发任务和 Mailpit 地址。[第 70 章本机部署](part-09-operations/chapter-70-native-deployment/chapter.md)

## 6. 从 Mac 接手另一台机器上的 EPP

从第 71 章开始，请求仍在手边的 Mac 上发出，程序和日志可以在另一台机器上。下文把前者叫**操作端**，后者叫**部署端**。`127.0.0.1` 始终指运行当前命令的那台机器。给两个终端页分别标上机器名，切换时用 `hostname`、`id -un` 查看自己在哪里、以谁的身份操作。

### 准备 Debian 13 部署端

第 71 章只练远程接手，已有可管理的 Mac 或 Linux 主机就能做。第 72 章开始要用 systemd 分别托管服务，书中选用 Debian 13。若想让同一台主机贯穿两章，可以在第 71 章前就把 Debian 准备好。

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

<a id="第-71-章从另一台电脑接手"></a>

### 从 Mac 建立 SSH 连接

第 71 章若选用一台新的 Linux 虚拟机，先[准备 Debian 部署端](#准备-debian-13-部署端)。在 **Mac 操作端**用 `command -v ssh ssh-keygen scp` 和 `ssh -V` 确认系统自带的 OpenSSH 客户端。若第 71 章选另一台 Mac 做部署端，在那台机器的“系统设置 → 通用 → 共享 → 远程登录”允许练习账号登录。

在首次连接前取得地址、端口、允许登录的账号，以及从部署机控制台或可信交接渠道取得的主机公钥指纹。Lima 用户可在 Mac 用 `limactl list --format '{{.SSHConfigFile}}' epp-debian` 找到实例的 SSH 配置，查看实际的 HostName、Port、User 和 IdentityFile。`limactl shell` 本身也经过 SSH。从 Lima 2.3 起，首次启动新实例时会把主机公钥保存在实例目录的 `ssh.known_hosts`；若实例由你在可信 Mac 上创建并确认过，可用 `ssh-keygen -lf` 加该文件路径读回已有指纹。接手别人的主机时，向管理者核对。[Lima 的 SSH 配置与主机公钥](https://lima-vm.io/docs/usage/ssh/)

第 71 章把练习目标写入 Mac 的 `~/.ssh/epp71.conf`，起名 `epp-lab`。用 `ssh -F ~/.ssh/epp71.conf -G epp-lab` 检查展开后的目标，再用 `ssh -F ~/.ssh/epp71.conf epp-lab` 登录，比对首次提示的指纹。后文会简写为 `ssh epp-lab` 或 `scp … epp-lab:…`。要使用简写，在 Mac 的 `~/.ssh/config` 开头加入 `Include ~/.ssh/epp71.conf`；也可继续显式带 `-F ~/.ssh/epp71.conf`。若从别的主机切换到 Debian，更新连接参数并核对新主机指纹。[第 71 章远程连接与换钥](part-09-operations/chapter-71-remote-host/chapter.md)

能登录后，还要从这台主机找到第 70 章的 API、任务、日志和旧收据。如果是刚装好系统的空机，先按[第 70 章部署步骤](part-09-operations/chapter-70-native-deployment/chapter.md)接回非空库、核对旧收据并托管 API。换主机钥匙的实验使用专用的第二个监听，保留平时的登录入口。

<a id="第-72-章为三个服务分配身份"></a>

### 在 Debian 为三个角色准备运行环境

第 72 章让 API、邮件和通知各用自己的系统用户。先在 Debian 执行 `systemctl --version`、`command -v useradd install`。创建用户、指定文件属主和安装系统级 unit 需要管理权限。服务还需要一个各账号都能执行的 Linux 版 Node，绝对路径固定在 `/opt/epp72/node/bin/node`。

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

`command -v node` 应指向 `/opt/epp72/node/bin/node`，版本、平台和架构应为 `v24.22.1 linux arm64` 或 `v24.22.1 linux x64`。在部署目录中用这份 Node 按锁文件安装生产依赖，这样 sharp 才会取得与 Linux 和当前 CPU 匹配的原生组件。

部署前准备 PostgreSQL 18 非空副本、与它配对的头像桶，以及邮件角色可达的私有 Mailpit。旧账号应已开通，留好原收据 ID。由迁移管理员建视图、数据库实例管理员建登录角色，各服务使用各自的凭据。Mac 上仍用 Postman 发请求、DBeaver 查数据。[第 72 章服务身份与验证](part-09-operations/chapter-72-service-roles/chapter.md)

这套环境会连续用三章。第 73 章新增 systemd 的一次性服务和计时器，保留一个能独立读取桶内对象的观察身份；仅在可以停机的练习实例上做关机对照。第 74 章把同一套产物交给第二个运行目录，留好原会话、收据里的两个 ID 和配对桶。保持操作端访问地址固定，用 Chrome 实读签名对象，转发前核对两端的端口，邮件仍送到练习收件箱。[第 73 章调度与恢复](part-09-operations/chapter-73-maintenance-jobs/chapter.md) · [第 74 章切换运行环境](part-09-operations/chapter-74-portable-release/chapter.md)

<a id="第-75-章给独立-https-入口签发与更换证书"></a>

### 给原来的 HTTP 服务接上 HTTPS

第 74 章中，Mac 通过 SSH 转发访问 Debian 上的 HTTP API。到了第 75 章，同一个客户端要访问 `https://api.epp.test:8443`：SSH 可以把字节送到 Debian，但原 API 在 `[::1]:3374` 等待的是 HTTP 请求。为保留已经交付的 API，并能单独更换证书，在部署端增加 nginx。它在回环端口 8443 完成 TLS 握手，再把请求通过 HTTP 交给原 API。操作端仍用 curl 发请求，沿用已核过指纹的 `epp-lab`。两端各留出回环端口 8443，用 `date -u` 核对时钟。[第 75 章名称、信任与换证](part-09-operations/chapter-75-tls-trust/chapter.md)

#### 两端准备 OpenSSL

**Mac 签发练习证书。** 在本次操作端 Bash 运行 `openssl version`。若输出 LibreSSL 或早于 3 的 OpenSSL，用 `brew install openssl@3` 安装，再执行 `export PATH="$(brew --prefix openssl@3)/bin:$PATH"`。在同一个终端用 `command -v openssl` 和 `openssl version` 确认会调用 OpenSSL 3。[Homebrew 的 OpenSSL 3](https://formulae.brew.sh/formula/openssl@3)

**Debian 为服务生成私钥和签名请求。** 在部署端也检查 `openssl version`，缺少 OpenSSL 时用 `sudo apt-get update`、`sudo apt-get install openssl` 安装并复查版本。签发用的私钥留在 Mac，服务自己的私钥留在 Debian，两端只传签名请求和公开证书。

#### 在 Debian 准备 nginx

在部署端 Bash 用 `command -v nginx` 查找程序。普通用户的 PATH 可能没包含系统管理目录，也可试 `/usr/sbin/nginx -v`。已有程序就直接检查下面的 SSL 模块。若还没有，书中在部署用户自己的目录解开 Debian 软件包，拿其中的程序单独启动练习入口。下面三行只需首次准备时逐行执行。解包成功后再设置 PATH，重新登录时只需恢复变量和 PATH。[Debian nginx 软件包](https://packages.debian.org/trixie/nginx) · [APT 下载命令](https://manpages.debian.org/trixie/apt/apt-get.8.en.html)

```bash
nginx_tools="$HOME/epp75-nginx-tools"
(mkdir -m 700 "$nginx_tools" && cd "$nginx_tools" && apt-get download nginx && dpkg-deb -x ./nginx_*.deb unpacked)
export PATH="$nginx_tools/unpacked/usr/sbin:$PATH"
```

若选用已安装的系统版，先让当前 Bash 能找到它（`export PATH="/usr/sbin:$PATH"`）。在同一个部署端终端执行：

```bash
command -v nginx
nginx -v
nginx -V 2>&1 | grep -o -- '--with-http_ssl_module'
```

书中练习使用 nginx 1.26.3，最后一行应输出 `--with-http_ssl_module`。若解出的程序启动时提示缺共享库，可在这台练习机用 `sudo apt-get update`、`sudo apt-get install nginx` 安装程序和依赖，再用 `/usr/sbin/nginx -V` 检查系统版。系统包可能启动默认站点；第 75 章使用自己的练习目录、配置和回环 8443。在正文的 `nginx_bin` 中使用刚才检查过的路径。

入口按正文启动后，从 Mac 用 curl 指定练习根、按正确名称访问且不带 Cookie。收到 EPP 的 **401 AUTH_REQUIRED**，说明这次证书验证通过，而且请求已经到了原 API。后面再用已有账号登录，检验换证前后能否读到同一笔业务。

#### 用 Firefox 查看证书错误（选做）

如果想亲自看到第 75.3 节两张错误页，可以在**有图形会话的 Debian** 上安装 Firefox ESR 和 `libnss3-tools`，后者提供 `certutil`。这样可以只改变本次浏览器配置的信任，再与 curl 对照。只有终端的 Lima 虚拟机可以用前面的 curl 完成名称、证书链和换证练习。[Debian NSS 工具包](https://packages.debian.org/trixie/libnss3-tools)

```bash
sudo apt-get update
sudo apt-get install firefox-esr libnss3-tools
firefox-esr --version
command -v certutil
```

在 Debian 确认版本和 `certutil` 路径后，按正文创建专用 Firefox 配置，核对练习根指纹，观察导入前后的页面。撤销信任时先保留 nginx 在线，再用同一浏览器配置访问原地址，才能看到证书再次被拒绝。[第 75.3 节浏览器对照](part-09-operations/chapter-75-tls-trust/chapter.md#753-用两个客户端复现名称和信任差异)

### 让两个实例接到同一份练习数据

第 75 章结束时已经恢复了原来的 HTTP 入口。第 76 章用同一练习账号和回环来源，把请求分别送到两个 API。为两个进程各留一个监听端口和可写目录，用操作端原有的 curl 选择目标；远程部署时继续用 SSH 转发。准备私有 Mailpit，并保存旧收据、邮件占用和一份可用于续页的账号数据。数据库轮换要改集群范围的登录权限，所以应使用独立的 PostgreSQL 18 集群副本。确认其端口、数据目录和原实例不同，再让各进程连接副本。[第 76 章的操作与验证](part-09-operations/chapter-76-rotate-credentials/chapter.md)

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
