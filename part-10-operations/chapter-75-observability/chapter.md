# 第 75 章　通知已经积压，怎样在人来报障之前发现

第 74 章已经让 API、邮件和通知在 Compose 中接手原有数据，HTTPS 登录也正常。现在用户能改密码，却迟迟看不到通知。重启 API 没有依据：接收请求与把通知送进收件箱，本来就是两个进程的工作。本章沿同一笔通知找出断点，再把人工发现变成可重复的采样规则。原生部署保留第 71 章的 systemd 单元；容器部署沿用第 74 章的项目、配置和外部数据服务，应用代码不变。

## 75.1 先把一次报障接到具体进程

记录失败时间、用户看到的状态、请求 ID 和通知任务 ID。不要记录 Cookie、令牌、正文或完整签名 URL。任务与收件箱可以按相同事件 ID 对齐；同一用户可能连续申请两次改密，仅凭邮箱和相近时间不能逐笔关联 HTTP 与投递。当前 nginx 关闭了访问日志，请求上下文也不会自动进入 Worker；需要这段证据时，应在代理记录上游返回的请求 ID、状态和耗时，并在创建任务处补请求 ID 与任务 ID 的脱敏关联记录。没有补齐前，明确记录只能追到哪一步。

先看原生部署怎样取证。在 Debian 的 SSH 终端执行：

```bash
systemctl show epp72-api epp72-notify epp72-mail \
  -p MainPID -p ActiveState -p SubState -p ExecMainStatus
sudo journalctl -u epp72-api -u epp72-notify -u epp72-mail \
  --since '15 minutes ago' --no-pager -o short-iso
```

`show` 选中三个既有单元，给出当前 PID、状态与主进程退出结果；`journalctl` 按单元和时间取日志，`short-iso` 保留便于对照的时间。`active` 只能说明托管状态；通知进程可能还活着，却持续遇到数据库错误。日志为空时先核对单元、权限和时间范围，不能认定没有失败。

容器把进程执行环境固定在镜像里，也增加了项目、容器和镜像这些定位信息。先完成[引擎与 Compose 验证](../../environment-setup.md#为容器部署准备引擎与-compose)，在 Debian 部署机执行。新开 Bash 时恢复第 74 章的函数 `docker() { sudo /usr/bin/docker "$@"; }`，保持同一管理身份与引擎。再定义 `dc() { docker compose --project-directory /opt/epp74 --env-file /opt/epp74/compose.env -f /opt/epp74/compose.yaml "$@"; }`，固定项目目录与插值文件，避免当前终端目录改变后读到另一份定义。

```bash
docker context show
dc ps -a
dc logs --since 15m --tail 200 --timestamps api notify mail
api_id=$(dc ps -a -q api)
```

核对 context 是原部署引擎。`ps -a` 包括已退出的容器，`logs` 合并三个角色最近十五分钟内的最后两百行；故障更早就扩大范围。确认 `api_id` **只有一行且非空**，才继续：

```bash
docker inspect --format 'status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}}' "$api_id"
docker inspect --format 'reference={{.Config.Image}} image={{.Image}}' "$api_id"
```

第一行区分运行、退出与自动重启；第二行记录创建时的引用和本地镜像 ID。空 ID 要先找原项目，多行要逐实例观察。重新创建后的容器计数从头开始，`restarts=0` 不能证明昨夜无故障。邮件退出 2 要按原消息核对投递结果，不能让通用重启脚本把它拉起。在重建前保存脱敏日志、容器 ID 和时间范围；删掉旧容器后，新进程的 ready 无法解释旧失败。

## 75.2 分开检查入口、资源与业务

先从原客户端重发请求，区分 TLS 错误、nginx 502 与 EPP 业务 JSON。502 表示代理没取得可用上游响应，还不能断言 API 程序有错。容器部署继续比较内外两跳：

```bash
dc port api 3000
dc exec -T api node -e "fetch('http://127.0.0.1:3000/profile/me',{signal:AbortSignal.timeout(3000)}).then(r=>{console.log(r.status);process.exit(r.status===401?0:1)}).catch(()=>process.exit(1))"
```

`port` 查宿主发布地址，须与第 74 章 nginx 的上游一致。`exec -T` 在运行中的 API 容器内执行 Node，不分配交互终端；匿名探针预期输出 401 并退出 0。容器内成功而宿主失败，查端口发布和宿主监听；宿主成功而 HTTPS 失败，查代理与证书；匿名探针成功而通知积压，继续查任务。没有配置健康检查的容器不会凭空产生 health 状态；即使检查通过，也只证明那条探针成立。读取健康结果时同时核对容器是否正在运行及探针时间，停止后的状态不能充当当前服务可用的证据。

若进程退出 137，先读 OOMKilled，再在 Debian 用 `sudo journalctl -k --since '15 minutes ago'` 对照内核记录。137 常对应强制结束，超出停止期限、人为终止和内存不足都可能造成，不能据此直接扩内存。

```bash
docker stats --no-stream "$api_id"
docker inspect --format 'memory={{.HostConfig.Memory}} nano_cpus={{.HostConfig.NanoCpus}}' "$api_id"
docker system df -v
```

`stats` 是当前采样，重启后低占用不能否定此前峰值。memory 以字节计，nano_cpus 的十亿代表一个 CPU 配额；值为零通常表示未显式设置该限制。头像解码、原生库、Node 堆和 `/work` 的 tmpfs 都占内存，堆上限不能代替进程总预算。结合并发请求判断是需要限制并发、修复持续增长，还是调整容量。[Docker 资源限制](https://docs.docker.com/engine/containers/resource_constraints/)

`system df -v` 只说明引擎对象占用。Debian 引擎宿主还要执行：

```bash
docker_data_root=$(docker info --format '{{.DockerRootDir}}')
sudo df -h "$docker_data_root"
sudo df -i "$docker_data_root"
```

前者看字节容量，后者看 inode；两者任一耗尽都可能阻止写文件。原生 PG、存储和绑定挂载位于别处时，还须检查各自文件系统。Desktop 的 DockerRootDir 在 Linux 虚拟机里，不能拿它当 Mac 路径。先查占用来源，再清理已确认无用的缓存或镜像；“没有容器使用的卷”仍可能是唯一恢复材料。

## 75.3 从同一任务算出等待时间

在隔离练习副本停通知进程，保持 API 在线。原生用 `sudo systemctl stop epp72-notify`；容器在原项目用 `dc stop notify`。按第 72 章完成一次密码重置，用该账号的 user_id 和本轮操作时间在 `notification_jobs` 查询候选，核对 kind 为 password-reset 并保存实际任务 ID；若同一时段有多次操作，先逐笔辨认，不随意取最新一行。在 DBeaver 的只读观察连接执行，先把 UUID 换成本轮实际值：

```sql
SELECT j.id, j.created_at, j.expires_at, j.status,
       n.id IS NOT NULL AS in_inbox
FROM public.notification_jobs j
LEFT JOIN public.notifications n USING (id)
WHERE j.id = '替换为本轮任务的UUID'::uuid;
```

预期是 `pending / false`；查不到时先核对库名、用户和改密是否真正完成，不要立即生成第二笔。通知入队即可消费，等待从 created_at 算起；expires_at 是业务失效时间。下面查询只读积压，不改变任务：

```sql
SELECT count(*) AS pending,
       count(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP) AS valid_pending,
       count(*) FILTER (WHERE expires_at <= CURRENT_TIMESTAMP) AS expired_pending,
       COALESCE(extract(epoch FROM CURRENT_TIMESTAMP - min(created_at)), 0)
         AS oldest_wait_seconds
FROM public.notification_jobs
WHERE status = 'pending';
```

空队列得到零；查询失败没有这个含义。过期任务仍可能 pending，后续消费会将其判为 obsolete；“积压消失”因此不等于每条通知都已送到。观察账号需要这些列的 SELECT 权限，权限失败应修复观察身份，不能临时改用应用写入身份。

## 75.4 让采样变成能关闭的告警

当前配套没有独立定时采样与告警发送器。先用上面的查询取得读数，再按以下规则接入自己的检查进程：例如每 30 秒采样，最老待办超过 120 秒且连续三次超限时开单；阈值是本轮练习选择，实际值由业务允许等待多久决定。检查器必须独立于 notify，否则 Worker 停止时检查也停止。

检查器保存“正常／已告警”、连续超限次数和最近一次成功采样时刻。正常状态满足触发条件才发送一次；已告警且有效采样恢复到阈值内时发送解除。数据库连接失败另记采样失败并提示检查链路不可用，不能写零或清除原告警。发送失败保留待发送状态并重试，接收处使用告警 ID 去重；不能借当前故障通知队列给值班人报警。应用 stdout 的错误日志本身也不等于值班人收到通知。

短暂停工后及时恢复，应只产生短暂积压；持续停工应跨过连续三次阈值。接入检查器后分别验证两种条件，记录采样时刻与实际收件时刻，才能称为自动告警。当前 Worker 的启动 ready 不是巡视心跳；若要在空队列时发现它已停止，另加进程检查，或先实现带时间戳的巡视证据。

恢复通知进程：原生 `sudo systemctl start epp72-notify`，容器 `dc start notify`，后者适用于容器仍在且配置未变。按原 ID 核对 `done / true`，再由原账号读取该通知。若已过期变成 obsolete，记录这笔承诺未完成，不能因为总数归零就结案。邮件 unknown 仍沿原 ID 人工核查。

最后检查能追查多久。原生 journal 与容器日志都可能轮转；本章 Compose 使用 `json-file`，`max-size: "10m"`、`max-file: "3"` 为每个容器限定轮转容量，不能据此承诺保留固定天数；请求量增大会缩短可追查时间。用 `docker inspect --format '{{json .HostConfig.LogConfig}}' "$api_id"` 核对实际容器，而非只看 YAML。改日志配置后须重建目标容器。用轮转前后两笔请求 ID 检索留存，依据报障延迟决定是否需要集中采集。采集失败也应能被发现，空白页面不代表没有错误。

## 附录：必要技术点速查

| 证据 | 能回答的问题 |
| --- | --- |
| systemd 状态／容器状态 | 托管对象与主进程当前怎样 |
| 请求 ID／任务 ID | 哪次请求、哪笔后台工作出了问题 |
| OOMKilled／内核日志 | 是否存在内存终止证据 |
| 字节容量／inode | 哪种文件系统资源耗尽 |
| 积压采样／原 ID 入箱 | 等待是否超标／这一笔是否完成 |
| 解除告警 | 检查恢复；仍须核对业务承诺 |

按日志、SQL 与资源命令量估算，阅读约 22～30 分钟；已有隔离部署时，停工、取证和恢复另加 25～40 分钟。检查器的实现与接收端接入按所用系统另计。

[上一章 · 用 Compose 接手应用部署](../../part-09-deployment/chapter-74-compose-deployment/chapter.md) · [下一章 · 定时维护](../chapter-76-maintenance-jobs/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
