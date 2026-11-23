# 第 80 章　用 Northflank 部署后端服务，用 Cloudflare DNS 接入自有域名

第 79 章关掉了源虚拟机，恢复端仍在同一台 Mac 上。这次把运行位置移出开发机：两名受邀者各用自己的设备登录，一个人写入的素材，另一个人即使知道 ID 也读不到。开发者关机后，两人仍能回来读原文、打开头像。先用平台提供的 HTTPS 地址做到这一步，再为已经能用的服务买域名。Northflank 运行应用并为业务域名签发 HTTPS 证书，Cloudflare 托管权威 DNS。用户输入自有域名后，浏览器根据 DNS 解析结果连接 Northflank。头像由 Backblaze B2 的私有桶保存，注册和重置邮件由 Resend 投递到受邀者已有的邮箱。

本章的交付目标是让两名受邀使用者从外网完成登录、素材读写与头像读取，并交接他们实际用过的入口和记录。从第 78 章的 B 版开始，另建空库和私有桶，只录入受邀者同意用于试用的数据。平台界面、规格、费用按创建当天的控制台核对。Northflank 将免费 Sandbox 定位于测试和个人项目；需要承担正式生产承诺时，还要确定运行保障、备份留存和故障响应。阅读约 35～45 分钟，首次配置和两端验收另需约 110～175 分钟，镜像传输、DNS 生效、独立恢复和次日复验另计。[Northflank 套餐定位](https://northflank.com/docs/v1/application/billing/pricing-on-northflank)

## 80.1 在控制台划出本次试用的范围

在 Northflank 选择 **Sandbox → Create project**，例如命名为 `epp-invite`。选 Northflank 托管区域。本章按**域名注册和续费以外，云服务月预算为 0** 来配置。截至 2026 年 11 月 19 日，Sandbox 价格页列出两个常驻服务、两个作业、一个数据库，每月最多包含价值 20 美元的 Northflank Cloud 资源。创建每项时核对 Sandbox 标识、项目合计用量估算和应付金额；若需要转为按量付费才能继续，就停在该项。[套餐与限额](https://northflank.com/pricing)

首次开户还要核对一个条件。Northflank 价格页写着 Sandbox 无需绑卡，计费文档却写着创建资源前所有方案都要添加付款方式以验证身份。以自己账号的创建页面为准。遇到绑卡提示时，先辨明是身份验证还是切换套餐；如果你只接受免绑卡方案，就在创建资源前停下。官方将 Sandbox 用于测试和个人项目，本章的公网目标是两人受邀试用。[价格页](https://northflank.com/pricing) · [计费文档](https://northflank.com/docs/v1/application/billing/pricing-on-northflank)

| 在哪里 | 建什么 | 怎样识别配置正确 |
|---|---|---|
| Northflank Services | `api`、`notify` 各一个实例 | 只有 API 有公开 HTTP 端口；无人浏览时通知仍能消费 |
| Northflank Addons | 一个私网 PostgreSQL 18 | API、通知与邮件用三个不同的登录访问同一库 |
| Northflank Jobs | `mail-one`，先手动，后按需定时 | 一次最多领取一封，退出码和数据库结果能互相印证 |
| Backblaze B2 | 一个私有头像桶 | 未签名访问拒绝；本人登录记录服务后取得的短时地址能打开图片 |
| Cloudflare DNS | 试用通过后添加业务子域 | 同一地址提供交付网页和 API；手机使用默认受信证书 |
| Resend 与受控收件箱 | 第 80.6 节在 Resend 验证发信域，为邮件作业配置仅可发送的密钥；收件人使用已有邮箱 | 在 Resend 查到此次发送，收件人实际收到邮件并在有效期内完成确认 |

开始前在 Mac 上核对三项准备：

- **源码和镜像。** 用 GitHub Desktop 或 Git 取第 78 章源码，在编辑器中修改；用 Node 24.22.1 和 npm 按锁文件安装、编译。Docker Desktop 的 Buildx 负责构建目标平台镜像，Northflank 的 Images 接收导出的归档。首次构建需要能下载 npm 依赖和 Dockerfile 指定的 Node 基础镜像。
- **数据库。** Mac 上要有能启动的 PostgreSQL 18 实例，用来制作种子库。DBeaver 负责查看和操作连接，Backup 与 Restore 还会调用本机的 `pg_dump`、`pg_restore`；在这两个对话框的 **Local Client** 选中 PostgreSQL 18。另备同版本 `psql` 执行授权文件。连接云端私网库时，再启动 Northflank CLI 转发。
- **验证和交接。** 准备 Postman、两个独立浏览器会话、一部能切换到移动数据的手机，以及能实际打开的受邀邮箱。用已有密码管理器保存各角色凭据。备份留在云项目和头像桶之外的受限位置，例如已有的加密外置盘，确保停止服务后仍能取回数据库归档和实际图片文件。

API 和通知已经用完两个服务名额。下面在 Docker Desktop 构建一次，将同一份镜像导入项目给服务与作业选用。数据库、头像和备份都要能跨应用重建保存。

## 80.2 让第 78 章镜像带上网页、邀请范围和正确的签名区域

在开发机新目录取[第 78 章配套快照](https://github.com/SamChowRock/epp-public/tree/part-09/chapter-78)。GitHub Desktop 可克隆配套仓库、选择 `part-09/chapter-78`，再从提交 `dd82558` 建自己的部署分支。下文文件名均相对于这个独立目录。锁定版本很重要：主索引、旧章快照和发布后的 B 镜像所带的程序不同。

**先让浏览器拿到登录页。** 私网部署用 nginx 提供 `examples/handoff-client/`，原 Dockerfile 只装了 API。为了让同一个 HTTPS 来源同时提供二者，在 `.dockerignore` 末尾追加以下四行，只允许这两个公开文件进入构建上下文：

```dockerignore
!examples/
!examples/handoff-client/
!examples/handoff-client/index.html
!examples/handoff-client/client.js
```

在 Dockerfile 最后一个阶段的 `USER 10001:10001` 之前加入：

```dockerfile
COPY examples/handoff-client/index.html examples/handoff-client/client.js /opt/epp/web/
```

在 `src/app.ts` 导入 `import { static as serveStatic } from 'express';`。在 `app.use(browserBoundary(config));` **之后**、`if (config.docsEnabled)` **之前**加下面的挂载。这样 API 继续使用原来的会话与响应策略；只有交付页能加载自己的脚本和桶中的图片。打开页面时用带尾斜线的 `/handoff/`，让浏览器把相对脚本地址解析为 `/handoff/client.js`。

```ts
const imageOrigin = process.env.AVATAR_S3_ENDPOINT
  ? new URL(process.env.AVATAR_S3_ENDPOINT).origin
  : "'self'";
app.use('/handoff', serveStatic('/opt/epp/web', {
  setHeaders(response) {
    response.setHeader('Content-Security-Policy', [
      "default-src 'none'", "script-src 'self'", "connect-src 'self'",
      'img-src ' + imageOrigin, "frame-ancestors 'none'", "base-uri 'none'",
      "form-action 'self'",
    ].join('; '));
  },
}));
```

**把邀请限制放在发信之前。** 域名一旦公开，别人也能直接请求 API。在 `src/recovery.service.ts` 的 `request(purpose, email)` 方法开头、检查 `activeRequests` 之前加入下面这段。注册和重置都从此方法进入，原请求 schema 已把地址转为小写。初始名单为空，等寄信准备就绪再填。名单外请求仍得到原先的通用答复，库里不产生发往这个地址的意图或待办。此分支只在新建的试用库运行。

```ts
const invited = (process.env.EPP_INVITED_EMAILS ?? '').split(',')
  .map(address => address.trim().toLowerCase()).filter(Boolean);
if (!invited.includes(email)) return Promise.resolve(accepted);
```

**让对象签名使用桶的真实区域。** 在 `src/avatar-objects.ts` 的 `new S3Client` 参数中，将 `region: 'us-east-1'` 改为 `region: process.env.AVATAR_S3_REGION ?? 'us-east-1'`。原配套的独立 `database/chapter-51/store-probe.mjs` 也有这个字面量，若用它检查 B2，应作相同调整。保留原来的 `forcePathStyle: true` 和 30 秒下载有效期。文件名、桶是否私有以及签名中的 Host/区域分别决定能否取到原图；域名换成 Cloudflare 业务地址后，B2 的签名地址仍须原样使用。

## 80.3 在独立库准备结构和两个试用账号

在项目 **Addons → Create addon → PostgreSQL** 选择 18、免费规格、单实例和 TLS，保留私网访问。若所选区域没有兼容的免费版本，先回到区域与规格选择。打开 addon 的 **Connection details**，记下内部证书主机名、端口、实际库名及所有者；管理员凭据只供操作端使用。首次连接按[环境准备](../../environment-setup.md#准备-northflank-公网试运行)登录 CLI。在这个 addon 的 **Overview → Local access** 复制专属转发命令，核对其中的项目和 addon。默认方式会请求 Mac 管理员权限，以便把证书对应的主机名临时解析到本地转发入口。在 Mac 单独终端保持转发，按平台显示的转发主机名与端口在 DBeaver 创建连接，设置 PostgreSQL SSL 为 `verify-full`，如需 CA 则导入平台指定的根。核对证书名，避免直接换成与证书不匹配的 localhost。[PostgreSQL 控制台与本地访问](https://northflank.com/docs/v1/application/databases-and-persistence/deploy-databases-on-northflank/deploy-postgresql-on-northflank) · [CLI 与数据库访问](https://northflank.com/docs/v1/application/databases-and-persistence/access-a-database)

第 78 章的运行镜像已经裁掉 Prisma CLI；源码自带的库名检查也只接受 `schema=public` 这一种 URL 参数。这里沿用第 77 章的归档交付：在 Mac 的独立 PG18 空库按正式顺序生成结构和控制行，再用原生 PostgreSQL 工具经验证 TLS 恢复到云端空库。这样初次建库能用现成脚本，云上 API 也无需持有迁移权限。

1. 在 DBeaver 为本轮新建本地库 `epp_invite_seed`。在源码目录另开终端，按[环境准备](../../environment-setup.md)使用 Node 24.22.1。把本地新库所有者的 `DATABASE_URL` 单独存进仓库外、权限 0600 的环境文件，设置 shell 变量 `SEED_ENV` 为其绝对路径。下面的 `bootstrap` 核对真实库名并检查 public 为空；若提示非空，回到连接界面辨认实例。
2. 在这个新库的 DBeaver SQL 编辑器运行一次下方 INSERT，保存两行不同的 UUID 作为 A、B 的用户 ID。受邀者用 ID 和密码登录。直接创建的这两个试用身份没有已验证邮箱，后面验证实际邮件时走一次完整的注册流程。
3. 给每个 ID 设置不同的初始密码。配套的 `scripts/password.mjs init` 从标准输入读密码并用项目自己的 Argon2 参数保存摘要。在 **Bash** 中分别执行下方密码步骤；`read -s` 避免回显，`printf` 避免把换行算入密码。仅把各自的凭据私下交给对应受邀者。

```bash
unset DATABASE_URL
npm ci
npm run build
node --env-file="$SEED_ENV" scripts/deploy-verify.mjs bootstrap epp_invite_seed
```

```sql
INSERT INTO public.users (id, web_enabled)
VALUES (gen_random_uuid(), true), (gen_random_uuid(), true)
RETURNING id, web_enabled;
```

```bash
read -r -p '本轮用户 UUID: ' invite_id
read -r -s -p '该用户独立的初始密码（15～128 个字符）: ' invite_pw
printf '\n'
printf '%s' "$invite_pw" | node --env-file="$SEED_ENV" scripts/password.mjs init "$invite_id"
unset invite_pw
```

每次看见 `PASSWORD_CREATED` 才继续。在 DBeaver 用 PG18 原生工具对本地库 **Tools → Backup**，选 Custom、全库且包含数据；放进私有目录。云端连接上先执行下面的查询。记下数据库名、当前用户和 TLS 结果。预期 `ssl` 为真、TLS 版本有值、`has_history` 为空。第二个查询列出 public 中的表、视图、序列等关系对象，以及函数和类型。在刚建的专用空库应得零行；若有结果，先辨认已有对象的用途和归属，再选用空目标。此归档已含账号凭据摘要，应按[第 77 章](../chapter-77-backups/chapter.md)保管。

```sql
SELECT current_database(), current_user, ssl, version AS tls_version,
       to_regclass('public._prisma_migrations') AS has_history
FROM pg_stat_ssl WHERE pid = pg_backend_pid();

SELECT 'relation' AS kind, relname AS name FROM pg_class
WHERE relnamespace = 'public'::regnamespace
UNION ALL
SELECT 'routine', proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace
UNION ALL
SELECT 'type', typname FROM pg_type WHERE typnamespace = 'public'::regnamespace
ORDER BY kind, name;
```

对云端连接打开 **Tools → Restore**，选刚生成的 Custom 归档、忽略原所有者和权限、遇错停止、单事务，保持清理已有对象的选项关闭。DBeaver 在这里启动独立的 PG18 原生客户端。若无法确认它沿用证书主机名、CA 和 `verify-full`，可在保持转发的另一个终端，导出 `PGHOST`、`PGPORT`、`PGDATABASE`、`PGUSER`、`PGSSLROOTCERT` 及 `PGSSLMODE=verify-full`，用 `psql -X -W` 重做上面两项查询并退出。接着将 `ARCHIVE` 设为刚才的归档绝对路径，在同一终端执行 `pg_restore -W --no-owner --no-acl --single-transaction --exit-on-error --dbname="$PGDATABASE" "$ARCHIVE"`。这两种入口任选其一。转发中断后重新检查目标库；若原来的两个用户 ID 已可读，先核对恢复结果，避免重复导入。

导入完成后在云端查 `SELECT id, web_enabled FROM public.users ORDER BY id`，应读到刚才的两个 ID。再对照已完成的迁移和 `verification_mail_control` 的初始记录。以能创建角色的管理员分别建立 `epp_api`、`epp_notify`、`epp_mail` 三个独立 LOGIN，不授予管理权限，用 psql 的 `\password` 分别设置随机口令。示例中数据库名 `epp_invite` 要换成云端查询的实际值。在操作端从源码根目录运行下面的连接命令。先将 PGHOST、PGPORT、PGDATABASE、PGUSER 分别设为转发入口的证书主机名、转发端口、云端实际库名和管理员，PGSSLROOTCERT 指向受信 CA 文件。密码在 psql 提示时输入。用 `\conninfo` 检查连接的库与 TLS 状态。

```bash
PGSSLMODE=verify-full psql -X -W
```

在这个新 addon 中，管理员可用 `CREATE ROLE epp_api LOGIN;` 创建第一个登录，再用 `\password epp_api` 设置口令；用另外两个角色名重复。若管理员与还原对象的所有者不同，完成建角色后切换回对象所有者，再运行下列授权脚本：

```psql
\set expected_db epp_invite
\i examples/service-roles/grants.sql
\i examples/compatible-release/activate.sql
```

前者给运行身份所需的表和列授权；后者配合稍后 API 的 `required` 模式启用第 78 章的修订插入保护。切到通知角色，查 `SELECT id,status FROM public.notification_recipients LIMIT 0` 应成功，查 `verification_intents.token_digest` 应被拒绝。若平台身份无法创建受限登录或还原所需对象，先查 addon 权限；把所有者密码交给 API 会让这轮分权验收失去意义。

## 80.4 创建私有桶，构建一次并启动两个角色

在 Backblaze 控制台 **Buckets → Create a Bucket** 建立独立的 **Private** 桶。记下实际桶名、S3 Endpoint 和区域，例如端点中的 `us-west-004`；不同账户看到的值可能不同。在 **Application Keys** 创建限定此桶、满足读写操作的应用密钥。Key ID 对应 S3 access key，新生成的 Application Key 对应 secret。保持无付款方式的免费账户。前 10 GB 存储免费，直接从 B2 下载头像还要核对出站流量，按月平均存储量的三倍计算免费流量。[B2 定价](https://www.backblaze.com/cloud-storage/pricing)

在 **Caps & Alerts → Edit Caps** 逐项检查存储、下载和交易的每日金额，取消 **No Cap**，按界面允许的零支出上限保存，再打开确认；告警邮箱另设。历史对象版本也占空间。若账户要求加入付费方式或提高上限，本轮停在这里。默认使用 HTTPS 的 S3 端点，不把密钥交给浏览器。[B2 免费账户](https://www.backblaze.com/sign-up/s3) · [用量上限](https://www.backblaze.com/docs/cloud-storage-create-and-manage-caps-and-alerts) · [S3 兼容接口](https://www.backblaze.com/docs/cloud-storage-s3-compatible-api)

在 Docker Desktop 确认引擎运行。在源码根执行以下命令，假设项目目标为 Linux amd64；若控制台选的是 arm64，就把平台和标签一并改掉。基础镜像按[第 72 章](../chapter-72-container-image/chapter.md)从受信清单取得匹配的摘要，通过 Dockerfile 的 `NODE_IMAGE` 构建参数固定。这里的 `NODE_IMAGE` 是你本次核对过的完整镜像引用。若要随后实发邮件，可先完成第 80.6 节的源码调整，再做本节构建。

```bash
docker buildx build --platform linux/amd64 --load --build-arg "NODE_IMAGE=${NODE_IMAGE:?请先设置基础镜像的完整摘要引用}" -t epp-invite:amd64-v1 .
docker image inspect epp-invite:amd64-v1 --format '{{.Os}}/{{.Architecture}} {{.Id}}'
docker save -o epp-invite-amd64-v1.tar epp-invite:amd64-v1
```

在 Northflank 项目 **Config & data → Images → Import image → Upload Archive** 上传未压缩的 tar，保持页面打开直至传输结束，填唯一版本标签，等状态 Ready。后续服务和作业的部署来源选 **Northflank → Link image source**，选择这个具体版本；保留上一个可用版本。若免费规格不能导入或放下制品，检查账户实际配额和构建产物大小，再决定本次是否继续。[导入镜像](https://northflank.com/docs/v1/application/build/import-container-images)

创建 Deployment Service `api`，选导入的镜像，保留 Dockerfile 的入口和默认命令。在网络设置添加 **HTTP → 容器端口 3000 → Public**，取得平台分配的完整 HTTPS 来源。若初次创建后才显示域名，取得域名、保存下表运行变量并重新部署，再邀请用户。公开端口只给 API；数据库仍使用内部名。密钥填各服务自己的 **Runtime variables / Secrets**。

| API 运行变量 | 本轮值的来源 |
|---|---|
| `NODE_ENV`、`LISTEN_HOST`、`PORT` | `production`、`0.0.0.0`、`3000` |
| `APP_ORIGIN` | 完整的 `https://…code.run` 来源，不带路径或结尾斜线 |
| `DATABASE_URL`、`PGSSLMODE` | 以 epp_api 登录；内部证书主机名、实际库名、密码做 URL 百分号编码。连接串只保留可选的 `?schema=public`。`PGSSLMODE=verify-full` 让 node-postgres 使用 TLS；若需要另配 CA，把平台 CA 挂成文件并设 `NODE_EXTRA_CA_CERTS` |
| `CURSOR_HMAC_KEY` | 密码管理器生成 32 字节随机值，用 64 个小写十六进制字符保存；重建继续用同一值 |
| `CAPTURE_INTENT_MODE`、`DOCS_ENABLED`、`DB_QUERY_DEBUG` | `required`、`false`、`false`。仅在核实直接上游的受控 IP 后才填 `TRUST_PROXY_IPS`，保留共享限流 |
| `AVATAR_S3_ENDPOINT`、`AVATAR_S3_REGION`、`AVATAR_S3_BUCKET` | B2 所示的 HTTPS 来源（无路径、无结尾斜线）、区域、私有桶名 |
| `AVATAR_S3_ACCESS_KEY`、`AVATAR_S3_SECRET_KEY` | 本桶应用密钥的两部分 |
| `EPP_INVITED_EMAILS` | 初次留空，只在第 80.6 节填同意收信的地址 |

给 API 设置 TCP readiness 探针，端口 3000。再看 **Logs** 中的 `database.ready`、`app.ready`。从浏览器打开 `/profile/me`，匿名应得 401 和 `AUTH_REQUIRED`；若平台把该路径当普通 HTTP 200 健康检查，健康的 API 也会被判失败。再打开 `/handoff/`：在浏览器网络面板确认 HTML 和 client.js 都是 200。只有页面能打开而按钮无反应，先查脚本路径和 CSP；登录返回 `ORIGIN_REJECTED` 则核对地址栏与 `APP_ORIGIN`。

再建 Deployment Service `notify`，选同一镜像版本，不设公开端口。只注入通知角色的 `DATABASE_URL`、相同 TLS 设置以及 `NODE_ENV=production`、`LOG_LEVEL=info`。在 **CMD override** 保留原 ENTRYPOINT，将 CMD 参数逐个设为 `/opt/epp/dist/src/mail-worker.js`、实际数据库名、`notifications`。镜像的入口已经是 Node；重复填写 node 会把它当成要加载的文件。看见 `worker.ready` 后，确认日志所属服务是 notify。库名不匹配或缺读权限时，应从该进程的配置和受限角色查起。[覆盖镜像命令](https://northflank.com/docs/v1/application/run/override-command-entrypoint)

## 80.5 验收平台地址，再用 Cloudflare DNS 接入自有域名

A 和 B 在独立浏览器会话打开 `/handoff/`，分别用自己的 UUID、密码登录，填入不同的中文意图并点“创建本轮素材”。页面会生成一段带随机标记的原文。记下两个素材 ID、原文与意图。各自按原 ID 读回应成功；将对方的 ID 填进去，应得 404。A 再选一张无隐私的 PNG 或 JPEG，点“发布并打开头像”。浏览器应先从 API 取得头像 ID 与短时地址，再直接从 B2 下载 WebP，页面显示 256 × 256。签名接口成功而对象请求 403 时，用新签名重试，并核对区域、主机、桶、密钥范围和过期时间；页面报 CSP 拦截则查第 80.2 节的图片来源。不要把完整签名 URL 放进截图。

图片上传过程中若 API 自身返回 500，先查 API 日志与资源使用，确认容器沿用镜像的工作目录 /work、运行 UID 10001 对它可写；头像处理要在此创建暂存文件。B2 权限正确也无法修复本地暂存失败。

先让受邀者离开原 Wi-Fi，用手机流量试一次。关闭开发机后，从用户端重新登录，次日再凭原 ID 读回。整理脱敏记录：时间、镜像版本、响应码、素材 ID 与头像 ID，另存可以配对恢复的库和对象副本。若只有登录成功，或对象只能在开发机打开，这次验收就停在对应步骤。

**给这次公网试用留一份能还原的副本。** 约一个短维护窗口，暂停邮件排程、等在途作业结束，停 API、通知以及已启用的清理任务，按[第 77 章](../chapter-77-backups/chapter.md)核对库中写入会话。保持写入暂停，导出云端库，并在 B2 的 **Browse Files** 打开本轮专用桶。以刚发布的头像为例，按头像 ID 在 `avatars/` 下找到同名的 `.webp`，下载文件并记录完整对象键、B2 版本和 SHA-256。Mac 可用 `shasum -a 256 文件路径` 核对。把这个恢复点所需的全部对象及仍待清理的旧版本一起保存，归档和文件均放到项目外的加密位置。取齐后恢复服务与原排程。

按[第 79 章](../chapter-79-disaster-recovery/chapter.md)在独立空库和隔离的私有存储恢复，可复用本机 PG18 和 SeaweedFS，避免另开付费资源。恢复副本关闭发信、通知和清理，用原素材 ID 读回原文，再重新取得短时地址，下载同一头像并比较文件摘要；把两项结果和备份时间记在一起。

默认地址验收通过后，再为同一套服务换上自有域名。打开 Northflank 和 Cloudflare 两个控制台，按下面的顺序操作。

1. **在 Cloudflare 确认域名已生效。** 新购域名时先核对首年价和续费价。若已在别处注册，在 Cloudflare 添加该域并选择 **Free**，核对已有网站和邮件记录，再到注册商将权威名称服务器改成 Cloudflare 分配的那一组。回到 Cloudflare，等域名状态显示 **Active**。若注册商仍发布旧 DNS 服务商的 DNSSEC DS 记录，按官方迁移顺序处理，否则即使填对 CNAME，部分用户仍会遇到解析失败。[Cloudflare 权威 DNS 接入](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)
2. **在 Cloudflare 填两类记录。** 打开 Northflank 的 **Domains → Add domain**，复制验证记录的名称和值。在 Cloudflare 的 **DNS → Records → Add record** 添加 TXT，让 Northflank 能核对你对这个域的控制权。再按 Northflank 显示的目标为业务子域（例如 app）添加 CNAME。代理状态选 **DNS only**，本章沿用这个设置，浏览器的 HTTPS 连接由 Northflank 接收。
3. **在 Northflank 绑定业务子域。** 将它关联到 api 的公开 3000 端口，等待域名验证通过、证书就绪。若验证一直未通过，先对照 TXT 的完整名称和值；若能解析但浏览器报告证书错误，再查 Northflank 的域名绑定和证书状态。
4. **从手机验收新入口。** 将 API 的 `APP_ORIGIN` 更新为新 HTTPS 来源并部署，保留原数据库、桶和 HMAC。手机关闭 Wi-Fi，用新域名重新登录，按 A 原有的素材 ID 读回原文并打开同一头像。旧平台域名的 Cookie 不会迁移；另建一笔素材并按 ID 读回，确认新来源下的写请求也能通过。[Northflank 域名绑定](https://northflank.com/docs/v1/application/getting-started/add-a-and-verify-domain) · [Cloudflare 的 DNS 代理状态](https://developers.cloudflare.com/dns/proxy-status/)

## 80.6 让一封受邀邮件走完整条链

做到上一步，两个预建账号已经可以使用服务。真实邮箱注册还差一个发信身份。第 78 章的 `src/send-one.ts` 已经能核对数据库、领取一笔并退出；持续运行的 `mail-worker.js` 则会在空队列时等待。其现有投递器专用于练习 SMTP，使用本地端点、`ignoreTLS: true` 和 `no-reply@epp.test`。只更换主机名无法完成外部投递。

在 Resend 选择事务邮件 Free，一个发信域，每日最多 100 封、每月最多 3,000 封；发送前先看本账号剩余额度。[Resend 定价](https://resend.com/pricing)

打开 **Domains → Add Domain**，填入自己控制的发信子域，例如 `mail.example.com`。把这次显示的 DKIM 和 SPF 所需记录逐行加到 **Cloudflare → DNS → Records**，逐项核对名称、类型、值和 MX 优先级，保留原有收信 MX 和业务子域的 CNAME。回到 Resend 验证，等到域名为 **Verified** 且发信已启用，再打开 **API Keys → Create API Key**，权限选 **Sending access**，范围选刚验证的域。发件地址使用该子域，密钥只填进 Northflank 的邮件作业。[发信域准备](../../part-06-background/chapter-54-mail-delivery/chapter.md) · [Resend 域名验证](https://resend.com/docs/dashboard/domains/manage-domains) · [Resend 密钥权限](https://resend.com/docs/dashboard/api-keys/introduction)

第 78 章并未合并第 54 章完整的逐次投递记录模块。下面的最小适配只给单笔入口增加 HTTPS 投递，继续沿用原 outbox 的领取、暂停和状态转换。

新建 `src/invite-delivery.ts`。先检查配置再领取任务；供应商未返回可识别的接受结果时抛出普通异常，让现有分类器保留待对账的状态。令牌只进入发给受邀收件人的正文。

```ts
import { z } from 'zod';
import type { VerificationDelivery } from './verification-delivery.js';

export function inviteDelivery(): VerificationDelivery {
  const key = process.env.RESEND_API_KEY;
  const from = z.email().parse(process.env.EPP_MAIL_FROM);
  if (!key) throw new Error('RESEND_KEY_REQUIRED');
  return {
    async send(recipient, purpose, token, issuedAt, expiresAt) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
        redirect: 'error',
        body: JSON.stringify({
          from, to: [recipient],
          subject: purpose === 'register' ? 'EPP 注册确认' : 'EPP 重置密码',
          text: [
            '本次验证令牌：' + token,
            '申请时间：' + issuedAt.toISOString(),
            '到期时间：' + expiresAt.toISOString(),
            '如果不是你申请的，请忽略此邮件。',
          ].join('\n'),
        }),
      });
      if (!response.ok) throw new Error('MAIL_NOT_CONFIRMED');
      z.object({ id: z.uuid() }).parse(await response.json());
    },
  };
}
```

在 `src/send-one.ts` 导入 `import { inviteDelivery } from './invite-delivery.js';`。将原先定义 `endpoint` 的一行替换为下面的选择，并把调用改为 `sendOne(database, delivery, process.argv[3])`。本地练习照常使用 Mailpit。运行 `npm run check` 并按第 80.4 节重新构建、导入新版本，邮件作业选包含此入口的版本。[Resend 发送 API](https://resend.com/docs/api-reference/emails/send-email)

```ts
const delivery = process.env.EPP_MAIL_TRANSPORT === 'resend'
  ? inviteDelivery() : new LocalMailDelivery(parseMailEndpoint(process.env));
```

1. 在 Northflank **Jobs → Create job** 创建未启用排程的 `mail-one`，选新镜像。使用 epp_mail 的库连接和 TLS，注入 `EPP_MAIL_TRANSPORT=resend`、`RESEND_API_KEY`、`EPP_MAIL_FROM`（已验证域中的发件地址）。保留 Node ENTRYPOINT，CMD 两个参数为 `/opt/epp/dist/src/send-one.js`、实际库名。设自动重试为零。先对空队列手动 **Run**，日志应为 `empty`。
2. 在 API 的邀请名单中仅加入同意测试的真实地址，保存部署。Postman 打开[第 51 章请求集合](https://github.com/SamChowRock/epp-public/blob/part-09/chapter-78/requests/chapter-51.postman_collection.json)，在自己的工作区逐个发送 **01 请求注册邮件** 和 **02 验证邮箱并设置密码**。在 Variables 把 `baseUrl` 设为当前 HTTPS 来源，无末尾斜线；两个请求的 **Headers** 都手动加 `Origin: {{baseUrl}}`，保留已有的 `X-EPP-Request: 1` 和 JSON 类型。Postman 可以省略 Origin；这里显式填写，是为了验证浏览器实际使用的来源。先把 `email` 设为名单外的自控地址，发送 01，在 DBeaver 确认没有相应的待办；再把 `email` 改为名单内尚未注册的地址，重发 01，核对新 `verification_outbox.id`、pending 和 attempts=0。两次客户端都应得到 202。
3. 首次投递在 **Run job → Override command** 给库名后追加本次 outbox UUID，只处理这封。在 Northflank 看本次 Run 的日志，在 Resend 的 **Emails** 按收件地址与时间打开对应记录。Delivered 表示对方邮件服务器已接收；请收件人再检查收件箱和垃圾邮件文件夹。成功条件是作业报 accepted、库行 accepted 且收件箱确实收到一封；令牌只在收件人自己的确认请求中使用。若出现 unknown、paused 或 lost-after-send，保持排程关闭，按[第 79 章](../chapter-79-disaster-recovery/chapter.md)先查外部发送记录和通道。作业结束、供应商接受、用户实际收信是三件事。
4. 由收件人在令牌有效期内发送 02。将邮件中的令牌填到本地变量 `registrationToken`，将新密码填到本地变量 `password`；请求脚本用后者生成 JSON 的 `newPassword` 字段。避免共享变量值，操作完清空。201 返回新 userId 以及 `webEnabled: false`。观察 notify 将这笔有效注册通知由 pending 变为 done，并在 notifications 以同一 ID 入账。记下新账号 UUID。完成下方的准入操作后，让收件人用这个 UUID 和自己的密码登录网页、刷新通知收件箱。

在 DBeaver 云端管理员连接上，申请前后分别执行第一条查询，提示输入 `recipient_email` 时填本次测试地址。名单外地址应无新增行，名单内地址应能按同一邮件 ID 看到 pending、accepted 的先后变化。确认注册后再执行第二条，输入 02 实际返回的 `userId`。通知消费可能在你打开编辑器之前就已完成；看到 done 和同一通知 ID 即可。邮件 ID 和注册通知 ID 分别来自申请、确认两次写入。

```sql
SELECT id, status, attempts
FROM public.verification_outbox
WHERE purpose = 'register' AND recipient = :recipient_email
ORDER BY available_at DESC, id DESC;

SELECT j.id AS job_id, j.status, n.id AS notification_id
FROM public.notification_jobs AS j
LEFT JOIN public.notifications AS n
  ON n.id = j.id AND n.user_id = j.user_id AND n.kind = j.kind
WHERE j.user_id = CAST(:user_id AS uuid) AND j.kind = 'registered';
```

**给刚确认的账号开通网页。** 两个预建账号在种子库就有网页权限，邮件注册建立的账号初始为关闭。资格由[第 63 章的账号维护命令](../../part-08-maintenance/chapter-63-account-cli/chapter.md)修改。保持私网转发，在已确认目标库的 psql 会话，由管理员创建一次专用维护登录；以下表授权由表所有者执行。将 `expected_db` 设为本次真实库名。示例由同时具备建角色和上述授权权力的实例管理员运行。维护凭据只留操作端。

```psql
\set ON_ERROR_STOP on
\set expected_db epp_invite
SELECT current_database() = :'expected_db' AS right_db \gset
\if :right_db
BEGIN;
CREATE ROLE epp_access_admin LOGIN;
GRANT CONNECT ON DATABASE :"expected_db" TO epp_access_admin;
GRANT USAGE ON SCHEMA public TO epp_access_admin;
GRANT SELECT (id, status, web_enabled), UPDATE (web_enabled)
  ON public.users TO epp_access_admin;
GRANT SELECT, INSERT ON public.web_access_receipts TO epp_access_admin;
COMMIT;
\password epp_access_admin
\else
\echo 请重新核对库名和连接
\endif
```

在 Mac 的源码目录，给维护命令准备独立的私有环境文件，内含该角色的 `DATABASE_URL`（转发主机名、端口、云端库名）、`PGSSLMODE=verify-full`，需要自签根时另设 `NODE_EXTRA_CA_CERTS`。开一个干净终端，把 `ACCESS_ENV` 设为文件绝对路径，`PGDATABASE` 设为预期云端库名，`account_id` 设为 02 返回的 UUID。先执行预览，核对账号和库名、原值 false、目标 true，再生成本次审批的操作 ID。

```bash
node --env-file="$ACCESS_ENV" dist/src/account-admin.js "$PGDATABASE" preview "$account_id" on
```

```bash
operation_id=$(node -p 'crypto.randomUUID()')
node --env-file="$ACCESS_ENV" dist/src/account-admin.js "$PGDATABASE" apply "$account_id" on "$operation_id"
node --env-file="$ACCESS_ENV" dist/src/account-admin.js "$PGDATABASE" receipt "$account_id" "$operation_id"
```

保留这对账号与操作 ID。若 apply 发出后连接中断，重新连接后用原 ID 查 receipt；需要重试时沿用原 ID。收据应显示本次请求开通、执行者为专用维护角色。到这里才请收件人实际登录。

两人试用默认保留手动运行，空队列也按分钟启动会消耗作业额度。确实需要自动寄信且剩余额度足够时，再设置 Cron（例如每分钟一笔），恢复只带库名的 CMD，并发策略选 **Forbid**，避免调度重叠。手动 Run 不受此策略限制。每分钟一笔适合此次小名单；若待办可能超过一封的 15 分钟有效期，就缩小开放范围或调整一次处理上限，仍需有明确退出边界。[作业并发与重试](https://northflank.com/docs/v1/application/run/run-an-image-once-or-on-a-schedule)

## 80.7 中断、回退和交接

网页和 API 更新失败时，在 Northflank 先切回同一数据库结构兼容的已知镜像，并恢复该版本对应的运行变量；核对两个原 ID、旧头像和一笔新写入。域名绑定失败时暂时把 `APP_ORIGIN` 恢复为已验的平台来源，让用户回到对应地址重新登录。数据库和桶保持原样。邮件结果不明就先暂停邮件排程，保留 outbox、供应商记录和用户后来保存的素材，逐笔对账。若数据库本身受损，才沿第 77～79 章在**另一目标**恢复并核对配对对象。

交接时写下使用者入口、镜像版本、启用的作业、域名续费日期、数据副本位置和最近一次实际恢复结果。结束试用时先停新写入和排程，取回并验证所需数据，再撤下 DNS、撤销专用密钥并按保留约定处理云端副本。对外说明只列已经由客户端验证过的能力。

## 附录：本章必要技术点速查

| 看到什么 | 去哪里辨认原因 |
|---|---|
| 平台显示运行中，访问网页却 401 或白屏 | 浏览器 Network 分开看 /handoff/ 和 client.js，再查镜像内两文件与 CSP |
| 两个用户同时遇到登录 429 | 对照共享来源限流与入口代理地址；只信任已核实的直接代理 |
| 已取得头像 ID，图片加载失败 | 浏览器区分 CSP、B2 响应、签名过期；重取地址后再比较区域与 Host |
| 申请已返回 202，始终没有来信 | 依次查邀请名单、outbox 行、作业是否真的运行、发送结果和真实收件箱 |
| 新域可打开页面，写入报 403 | 对照当前 HTTPS 来源、APP_ORIGIN、Cookie 与这次登录取得的 CSRF |

[上一章 · 原主机失联以后，哪些业务能先恢复](../chapter-79-disaster-recovery/chapter.md) · [下一章 · 第九篇回顾：接手一次原因未知的报障](../chapter-81-operations-review/outline.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
