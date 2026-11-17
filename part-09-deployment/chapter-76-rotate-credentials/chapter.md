# 第 76 章　让 API 和后台进程更换凭据与签名密钥

第 75 章那条计时器现在可能没有对应的清理进程，但它下次运行仍会读取数据库口令。交接单上还列有 API、两种 Worker 和收据 CLI。换完凭据后，从第 71 章交付的 HTTPS 地址读资料得到 200，能证明哪些进程已经换好？同一个登录还能不能写入和翻页？

沿第 73 章采用 Compose 时，先给本轮隔离副本开两个与原 API 配置相同的实例，使用已验镜像摘要；各自的可写目录与宿主回环映射端口要分开。宿主 nginx 按下文切换这两个上游，两实例的数据库和桶都指向本轮副本。每次更换启动时读入的配置，都重新创建对应实例，并查实际新连接。邮件和通知沿用各自的服务定义；第 75 章另放在宿主的清理 timer 也纳入凭据清单。先完成下节的新登录准备，再让候选实例使用它。

## 76.1 盘点哪些进程还会以旧身份重连

保留 HTTPS 入口及其原有协议、主机名和端口，练习在带历史的独立集群、配对桶和私有邮件箱上运行。按[两实例环境说明](../../environment-setup.md#让两个实例接到同一份练习数据)核对目标，从[第 71 章](../chapter-71-service-access/chapter.md)取回正确根、受信的客户端、对应来源的 Cookie 和一条旧素材 ID。若原会话已过期，在该 HTTPS 来源登录一次，随后保留这次会话。验证匿名读 401、原会话读资料和旧素材 200。按交接单中的用户 ID、操作 ID 保存同一张旧收据。

在部署机的服务定义里找出 `ExecStart`，沿着 `--env-file` 找到配置文件；在 Mac 上托管时查看对应 launchd 任务。只记录启动用户、路径、数据库登录名和目标，别把连接串贴上交接单。你会数到两份同样执行 `mail-worker.js` 的命令，其中只有带 `notifications` 参数的那份写站内收件箱。还容易漏掉三条平时看不到进程的命令：

| 什么时候运行 | 从哪份配置取数据库身份 | 在业务里留下什么证据 |
| --- | --- | --- |
| API 收到请求 | API 配置，原登录 `epp_api` | 原会话读本人资料；一条有唯一标记的素材写入并读回 |
| 邮件循环或人工单笔寄信 | 邮件配置，`epp_mail` | 消息 ID、发送状态与次数；收件端有没有这封邮件 |
| 通知循环 | 通知配置，`epp_notify` | 同一个 ID 从待办进入用户收件箱 |
| 管理员查旧收据 | 只读 CLI 配置，`epp_receipt74` | 原操作 ID 对应的整张收据 |
| 计时器唤起头像清理 | 清理配置，`epp_cleanup` | 本轮目标库、桶、对象 ID 和领取结果 |

在 DBeaver 用独立观察连接打开会话查询（`examples/credential-rotation/activity.sql`），先看 `usename` 和 `backend_start`。前者是这条数据库连接用谁的名字登录，后者是连接建立的时间。`application_name` 中的 `epp-api`、`epp-worker`、`epp-notifications` 来自程序。同名的两个 API 都叫 `epp-api`。保留自动提交，每次查看重新执行查询；短命 CLI 退出后这一页就看不到它，不应据此删掉交接单上的那一行。

为什么不直接改 `epp_api` 的密码？PostgreSQL 在建立连接时核验身份。API 可以继续复用池里已经登录的连接；池空闲一段时间回收连接，或者进程重启，才会用启动时读到的口令再连。直接改密码也能做计划维护，但先改数据库或先重启应用都会有一边暂时拿错口令。这里希望先让 A 真正试用新登录，同时让 B 继续处理请求，因而需要一小段新旧登录都有效的时间。

第 70 章已经把邮件、通知、API 的权限分开，可以沿用这份劳动。以 API 为例，保留原角色上的对象权限，另建登录角色，让它继承那些权限：

```sql
CREATE ROLE epp_api_v2 LOGIN;
GRANT epp_api TO epp_api_v2 WITH INHERIT TRUE, SET FALSE;
```

`epp_api_v2` 用自己的口令连接，执行查询时可以使用授给 `epp_api` 的表和列权限。`SET FALSE` 关闭这条成员关系的主动身份切换。以后即使原角色被设为 `NOLOGIN`，它仍可作为这些权限的来源。若原角色是对象所有者、管理员，或还继承了其他角色，成员关系可能给得过多；先查前章的授权清单和实际角色，再决定哪些权限值得继承。

从本章配套目录（`examples/credential-rotation`）取 identities.sql、activity.sql 和 repair-notify.sql。照说明在本次隔离集群核对目标后建五个登录，分别交互设置口令。把每份角色配置复制为该角色的 v2 文件，只改其数据库身份，继续使用部署端原运行用户、工作目录、私有依赖地址和文件权限。使用第 73 章容器部署时，交接单还应包括下次重建容器时读取的配置来源。

## 76.2 先切一个进程并迫使它新建连接

在代理后的原上游之外再开一个候选 A。取原服务配置建 A 的副本，给它另一个空闲的回环端口、自己的可写工作目录、新数据库登录；它与原上游 B 使用相同的 HTTPS APP_ORIGIN、库和原签名密钥。在部署端定义[支线 70A 的受限启动函数](../chapter-70-service-runtime/side-01-runtime-diagnostics.md#用服务自己的身份试另一份配置)。A 的工作目录须由 epp-api 拥有、权限 0700，配置文件放在 /etc/epp72 下并让 epp-api 组可读。给 A 取独立单元名并用函数启动；B 占用原端口，继续运行。先核实 A 与 B 的 PID、监听端口及 app.ready。在第 71 章的独立 nginx 配置留存原 upstream 地址与回退副本，仅把 `proxy_pass` 的端口从 B 切到 A，按该章的预检、平滑重载和实际握手步骤生效。只在练习入口切流；有其他使用者时先安排维护窗口。

在原客户端依次让 B、A 通过同一 HTTPS 地址处理一次带原 Cookie 的 GET /profile/me，保存各自的 requestId，去相应进程找同 ID 的 http.completed。每次都查 activity.sql 的登录、连接时间和库名。本次期待先看到 B 的原角色，再看到重启后的 A 以 epp_api_v2 连接。若还去旧 PID，先排查代理重载和仍在处理请求的旧 worker。这样既验证了新凭据，又保留了退回 B 的具体位置。

用同一 Cookie 和正确 Origin 取 `GET /auth/csrf` 及 `GET /notifications?limit=1`，将 CSRF 头和未过期的 nextCursor 各存一份。先确认该用户至少有两条可见通知、旧游标此刻确能翻页。样本不足可按配套说明在副本产生两条通知。Cookie 由库内会话摘要校验，而 CSRF 和通知游标由 API 中的 CURSOR_HMAC_KEY 签名。要判断读资料成功、交叉写 403、续页 400 是否来自密钥分裂，可在[支线 77A](side-01-hmac.md)重放保留的双实例故障与单变量修复。它也给出了在途写入跨过 TERM 的现场。

## 76.3 轮流排空其余角色

数据库身份允许逐台轮换。更换签名密钥时每个进程却只接受一个值。给仍有旧密钥的实例和已换好的实例同时送用户请求，会让同一个会话时好时坏。先在私有目录以 `(umask 077; openssl rand -hex 32 > hmac-v2)` 生成一次新值，经既有私有通路分发给各份 API 配置。让入口进入维护窗口，正常排空旧进程，等待 app.stopped，再启动同一代密钥的进程；库登录也逐台切到已验证的新配置。对外入口保留原域名与证书，维护期间的探测只允许操作端进入。

用上节 nginx 的切换方式确定由哪个实例回答。在原 HTTPS 客户端拿旧 CSRF 写入、原游标续页，到 A、B 各做一次，预期 403 CSRF_REJECTED、400 INVALID_CURSOR。保持同一原 Cookie、Origin 和 limit，向 A 获取新 CSRF 和游标，切上游到 B，用新 CSRF 创建有唯一标记的素材，读取刚创建的 ID，并用 A 的新游标续页。预期为 201、200、200。换一个标记，反方向再做一次，按 requestId 核对实际响应进程。查库确认被拒请求的标记为零、成功的两笔各一。最后经原入口的新 TLS 连接核对名称、完整验证证书链、检查原 HTTPS Cookie 读回原素材，才结束维护窗口。单个上游部署按同样方法比较切换前后；双实例交叉结果需要两个可指定的上游。连接失败或 502 时先看代理的握手和上游，403 时按业务码分辨 Origin 与 CSRF。旧页面重新取得写令牌、从第一页重取游标即可接续工作。

一次隔离演练把 nginx 放在 Debian，两个正式 API 入口和非空 PostgreSQL 副本放在 Mac，经 SSH 接通两端回环。通过同一个带名 HTTPS 地址，原 Secure Cookie 在两端都能识别。两端各自拒绝旧值（403、400），新值交叉写入和续页分别得到 201、200，再从对端读取新素材及原素材均为 200。响应中的 X-Request-Id 能在对应上游的 http.completed 找到；这里用它判断重载后哪一个进程真正收到了请求。

**邮件先看通道，再动进程。** 切换 API 不会替邮件 Worker 重新连接。让原邮件与通知进程正常结束，停妥可能拉起它们的管理器；确认没有其他发件者。在 DBeaver 留下本轮的占用和待办：

```sql
SELECT c.paused_by, o.status, o.attempts
FROM verification_mail_control c LEFT JOIN verification_outbox o ON o.id=c.paused_by
WHERE c.id=1;
SELECT id, status, attempts FROM verification_outbox
WHERE status IN ('pending','attempting','unknown') ORDER BY id;
```

练习副本保留的邮件是 `unknown`，已经尝试一次且占用通道。通过 API 向新的练习邮箱申请注册，保存新消息 ID。新邮件 Worker 以新身份启动，碰到旧占用后退出 2；新消息仍待办。这说明它已连到能读见旧现场的库。换数据库密码没有提供 SMTP 当时是否接收的证据。

若交接的通道应继续暂停，就保持这一状态。在**隔离练习副本**完成新投递对照时，先停止所有发送者，记录旧 ID、未知结果和“不自动重发”的处置，再按第 53 章的定向人工放行 SQL（`database/chapter-45/03-review.sql`）填本轮库名与该消息完整 ID。检查恰好返回那一行；旧消息本身继续是 unknown。确认 SMTP 只通向本次 Mailpit，才启动使用新配置的邮件 Worker。按新的收件人查到一封，核对新消息 ID 已 accepted，原 ID 的尝试次数仍为一。沿用第 55 章的注册请求和确认请求：在 Mailpit 打开这封信，取令牌传给 `POST /auth/register/confirm`（字段 `token` 和 `newPassword`）。用响应的用户 ID 查其新建的通知任务，保留任务 ID。

**通知进程报告 ready 后退出了。** 先别造第二个注册。看新进程能否连接、新任务还在不在、同 ID 是否已进箱。在 DBeaver 的独立观察连接执行下面的查询，把 UUID 换为刚才注册产生的 job ID（可用该用户的 `user_id` 在 `notification_jobs` 找到）：

```sql
SELECT j.id, j.status, n.id IS NOT NULL AS in_inbox
FROM notification_jobs j LEFT JOIN notifications n USING (id)
WHERE j.id = '换成本轮通知任务 UUID'::uuid;
SELECT has_column_privilege('epp_notify_v2','public.notifications','id','INSERT')
       AS can_insert_notification_id;
```

在本轮的缺权候选配置中，读数为 `pending / false`，列权限也为 false。PG 服务端记录了 `permission denied for table notifications`。登录和启动探针都通过，直到实际投递才需要向收件箱插入。插入和完成标记在同一事务中，失败回滚使原任务仍可消费。此时可以退回原通知登录处理这笔工作；本次选择按第 70 章既有权限修复新角色。管理员在预期库执行通知授权修复（`examples/credential-rotation/repair-notify.sql`），给新登录继承原通知角色的权限并收回临时直接授权。重新启动同一 Worker，重新跑相同 ID 的查询，现在应为 `done / true`。

<details>
<summary>运行两个后台入口，以及两条不会在常驻进程表里等你的命令</summary>

在部署端的 Bash 把 `db` 设为交接单上的库名，以下举例沿用第 70 章的 Linux 用户和 release 路径。各 `*-v2.env` 均按本角色设置组权限。分开终端，按上述先后顺序运行；对常驻 Worker 发送 TERM 后，等 `worker.closed` 再启动后继。若原任务由 systemd 托管，也要更新它下一次启动实际读取的文件，手动验证成功后再恢复调度。

```bash
release=/opt/epp72/release
node_bin=/opt/epp72/node/bin/node
db=epp_ch73_handoff
sudo -u epp-mail env -i "$node_bin" --env-file=/etc/epp72/mail-v2.env \
  "$release/dist/src/mail-worker.js" "$db"
# 在通知专用的终端恢复以上三个变量
sudo -u epp-notify env -i "$node_bin" --env-file=/etc/epp72/notify-v2.env \
  "$release/dist/src/mail-worker.js" "$db" notifications
```

邮件循环停妥后，以同一邮件用户、配置和预期库运行 `dist/src/send-one.js "$db" "$message_id"`，最后一项取本次已 accepted 的消息 ID。通道开放时应得到 `empty`，次数保持一次。另按第 75 章单笔清理命令（`examples/maintenance/README.md`），将清理 unit 下一次启动读取的配置换为新登录。先停 timer 并等 service 结束，选一个**仍在使用**的头像 ID，以原来的预期库、端点和桶手工运行同一入口。结果应为领取零笔且无失败。这个对照检验新数据库身份能运行筛选；这个 ID 必须取自 `users.avatar_id`，不能随手挑一条已到期的历史键。若还需验实际对象删除，按第 75 章另选已到期的练习对象，并用独立观察身份读回当前头像。恢复 timer 时核对实际 unit 和下一次触发时刻。

</details>

## 76.4 撤掉旧登录后验证故障边界

管理员用 activity.sql 检查整个练习集群，确认实际工作进程均已换好、原角色上的对象权限仍由新成员继承。在停止的收据命令换配置前以旧身份读原收据并留底。要观察一个已经登录的会话怎样跨过撤权，现在转到[支线 77B](side-02-connections.md)，它包含相同的撤权步骤及按 PID 收尾的实证。主线上先排空所有旧连接，再在管理员连接一次执行：

```sql
BEGIN;
ALTER ROLE epp_api NOLOGIN;
ALTER ROLE epp_mail NOLOGIN;
ALTER ROLE epp_notify NOLOGIN;
ALTER ROLE epp_cleanup NOLOGIN;
ALTER ROLE epp_receipt74 NOLOGIN;
COMMIT;
```

用五份旧身份的原地址与原口令各开一次新连接，预期均被拒；用五份新配置分别连接确认库名及没有越权 DELETE 用户的权限。旧会话若仍存在，即使角色已经不能登录，该连接仍可查库。此时按支线定位来源和 PID，处理后刷新活动视图。把收据工具的启动配置换为新版，用原三个参数再查：

```bash
sudo -u epp-receipt env -i /opt/epp72/node/bin/node \
  --env-file=/etc/epp72/receipt-v2.env /opt/epp72/release/dist/src/account-admin.js \
  "$db" receipt "$user_id" "$operation_id"
```

收据内部的 `dbActor` 记录当年操作时的身份，可以一直是旧值；当前登录另用实际新连接核实。

用 cmp 对照保存的原收据。练习副本中五个旧身份分别新连得到 28000，五个新身份连到预期库，六张旧收据逐值保持。签名故障与重连的现场分别保存在两条支线；它们的 HTTP 读数不能替代上节经 HTTPS 的入口验收。

最后把回退条件写给下一班。计划轮换在旧身份仍被允许时，可以先把故障进程退回原登录配置；撤销后，同一份旧配置已无法重连。需要回退程序时，应把已验证的新凭据交给回退版本。如果因泄露换签名密钥，立即隔离所有仍接受旧签名的入口，换为新值，只在新入口恢复服务，回退程序也不能重新接纳旧钥匙。数据库密码泄露和浏览器会话令牌泄露是两起不同事件：若连 Cookie 也可能被取得，还要按会话撤销流程撤掉受影响的登录，仅换 HMAC 不会让那份 Cookie 失效。

## 76.5 用新配置重建容器，再撤销旧身份

容器将程序固定在镜像内，凭据仍从部署配置进入。换数据库登录时保持原镜像不变，才能把失败归因到身份和权限；不要同时升级应用、改网络和换钥匙。原生流程先启动候选进程，容器流程则创建读取候选配置的新容器。两者都要通过实际连接与原业务核验，不能以配置文件已经写好作为完成证据。

沿第 75.5 节已经迁入的 `/opt/epp-container` 操作，旧 `/opt/epp74` 副本不再修改。由部署管理员把 `secrets/api.env`、`mail.env`、`notify.env` 分别复制为 `api-v2.env`、`mail-v2.env`、`notify-v2.env`，保留 root 属主、10001 组和 0640 权限。只修改各自的数据库登录，保留期望库、私有依赖地址、公开来源与已验证的签名密钥；凭据不要放进镜像、命令行或普通发布记录。先按 76.1 建立新登录、继承原角色权限，再准备候选文件。第 73 章 pg_hba.conf 按登录名精确匹配，角色继承不会自动匹配旧登录名；为实际新登录补上本轮库、`172.28.74.0/24` 与 SCRAM 规则，并在该实例 reload，保留旧规则直到接力完成。网段自定义时用实际值。

在 Compose 中将目标角色的 bind 来源改为对应 v2 文件，容器内目标仍保持 `/run/epp/api.env`、`/run/epp/mail.env`、`/run/epp/notify.env`。先检查解析后的镜像未变化，再逐角色重建，例如先处理 API：

以下函数固定配置目录，不要求普通账号进入 root 的秘密目录；新开 Bash 要重新定义。所有命令仍操作第 73 章已核对的宿主引擎。

```bash
dc() { sudo docker compose --project-directory /opt/epp-container --env-file /opt/epp-container/compose.env -f /opt/epp-container/compose.yaml "$@"; }
dc config --quiet
dc config --images
dc up -d --no-deps --force-recreate api
dc ps -a api
dc logs --since 5m --tail 100 api
```

`config --quiet` 只检查定义，不验证数据库密码。`--force-recreate` 明确替换容器，即使文件路径或镜像没有改变也重新建立挂载。修改宿主文件不会使进程自动重读配置；用原子改名替换 bind 源时，旧挂载还可能指向旧 inode。因此不能用 restart 的成功提示证明进程已读到新内容，也不应打印文件内容来核对秘密。

API 候选通过匿名探针后，用原 Cookie 读资料、原来源写入和续页，并在 `pg_stat_activity` 查新登录与连接启动时刻。只换数据库身份时旧会话应继续符合既有规则；同时换签名密钥则须按 76.2 重新取 CSRF 和游标，不能把预期失效误判成数据库轮换故障。共享镜像不会使 A、B 自动共享签名密钥，必须核对两份配置的密钥版本及交叉请求。

单 API 的重建存在中断窗口。要求连续服务时，应先另建 B 实例和独立宿主端口，保持同一公开来源，通过定向请求验证后切换代理，再排空 A；本节的单服务 up 不代表已完成零停机轮换。旧、新数据库登录需要在这一接力期间同时有效，提前 NOLOGIN 会让仍运行的旧实例重连失败。

随后将 notify 的 bind 来源改为 v2，定向执行 `dc up -d --no-deps --force-recreate notify`，按原任务 ID 核对入箱。邮件先停妥旧发送者、对账原消息，确认允许继续投递后才改其来源并重建 mail。保留退出 2 的人工核查边界；Docker 的通用 on-failure 会把非零退出视为失败，不能借它无条件恢复这类停发。

最后处理第 75 章 cleanup.env 和离线收据工具。停 `epp-container-clean.timer`，等本轮容器退出，将清理配置来源换为新身份，手动运行当前头像取零的对照，再恢复调度。新的一次性容器会读新定义，但已经运行的旧容器仍须排空。只有全部角色、离线入口和实际旧连接都查清，才按 76.4 撤旧登录。撤销后回退程序也要携带新凭据，不能恢复一份已经失效的旧秘密文件。

## 附录：本章必要技术点速查

| 现场问题 | 看哪里 | 能作什么判断 |
| --- | --- | --- |
| 新身份从哪里取得原有对象权限 | 角色成员关系中的 INHERIT、SET 选项 | 新登录可继承原授权；核对所属角色及对象所有权。[PostgreSQL 18 角色成员关系](https://www.postgresql.org/docs/18/role-membership.html) |
| 如何知道进程确实重连 | `pg_stat_activity.usename / pid / backend_start / application_name` | 对齐启动时刻与实际业务，另验离线命令。[PostgreSQL 18 活动视图](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-PG-STAT-ACTIVITY-VIEW) |
| 如何用同一来源点名实例 | curl 的 `--connect-to` | 固定请求 URL、Cookie 与 Origin，只改变实际拨号目标。[curl 选项](https://curl.se/docs/manpage.html#--connect-to) |
| 原会话 200，写入 403 或续页 400 | 固定账号、请求头、查询范围及时间，交叉签发和验证 | 区分来源错误、过期与密钥不一致；换钥后重新取 CSRF、从首页取新游标 |
| bind 文件已替换，进程身份未变 | 配置来源、容器创建时刻与数据库实际登录 | force-recreate 重建挂载与进程，再通过原业务核验 |
| 撤销旧登录后谁还能工作 | `ALTER ROLE … NOLOGIN`、旧连接与新连接对照 | 禁止再登录；需要结束现有会话时先核对目标。[角色属性](https://www.postgresql.org/docs/18/sql-alterrole.html) · [终止后端](https://www.postgresql.org/docs/18/functions-admin.html#FUNCTIONS-ADMIN-SIGNAL) |

阅读约 31～43 分钟，已有 HTTPS 副本、账号及受限角色时，原生入口试切、后台对账与撤权另加 55～80 分钟，容器候选配置、逐角色重建与实际身份核对另加 20～30 分钟。支线 76A 的定向故障另加 25～40 分钟，76B 的旧连接对照另加 10～15 分钟。

配套检出命令 `git switch part-10/chapter-77` · [上一章 · 定时维护](../chapter-75-maintenance-jobs/chapter.md) · [下一章 · 备份与恢复](../chapter-77-backups/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
