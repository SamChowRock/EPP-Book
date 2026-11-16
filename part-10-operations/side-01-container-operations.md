# 支线　接手容器服务的排障、更新与恢复

第九篇的容器路线已经把三个应用角色交给 Compose，也从客户端走过 HTTPS 交付。过了几天，页面能打开，头像上传却偶尔失败，通知也开始积压。此时重新运行一次 `up -d` 可能改变现场，却未必解决任何一个原因。值班人需要把一次业务失败连接到具体容器、进程、依赖和宿主资源，再决定改变哪一层。

本条沿用[Compose 支线](../part-09-deployment/side-03-compose.md)的应用层结构：`api`、`mail`、`notify` 使用同一个已验镜像，数据库与桶在外部托管，宿主 nginx 提供 HTTPS。先完成[容器环境验证](../environment-setup.md#为容器部署准备引擎与-compose)。所有命令在该部署机的 SSH 终端、原 `compose.yaml` 所在目录执行，使用原项目名和 Docker context。Debian 沿用 `sudo docker` 时，下面每次 Docker 调用也加 `sudo`。阅读约 22～30 分钟；已有隔离部署时，停止、重建与取证对照另加 30～45 分钟，数据恢复时间按实际大小另计。

## 先保留能区分原因的现场

接到头像失败的报障，先保留失败时间、请求 ID、用户看到的状态与原素材或对象标识。不要收集 Cookie、完整签名 URL 或密码。用 `docker context show` 核对引擎，用 `docker compose config --images` 核对项目选中的制品，再查看全部容器和近期日志：

```bash
docker compose ps -a
docker compose logs --since 15m --tail 200 --timestamps api notify mail
api_id=$(docker compose ps -a -q api)
test -n "$api_id"
docker inspect --format '{{.Name}} status={{.State.Status}} exit={{.State.ExitCode}} oom={{.State.OOMKilled}} restarts={{.RestartCount}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}' "$api_id"
docker inspect --format 'reference={{.Config.Image}} local_image={{.Image}}' "$api_id"
```

本例只有一个 API 容器，`api_id` 应得到一行 ID。若为空，停止后面的 inspect，先查是否在原项目、容器是否被删除；若为多行，逐个选择实例，不能把一串 ID 当作一个目标。`ps -a` 能看见已退出的邮件进程，普通运行列表可能漏掉它。inspect 第一行给出当前生命周期状态，第二行同时保留创建时的镜像引用与本地镜像 ID，避免只凭可能已被重指的标签判断版本。[状态字段与格式化](https://docs.docker.com/reference/cli/docker/inspect/)

读数要放回时间线上：`running` 表示容器主进程仍在；健康检查通过表示上一条探针成立；`RestartCount` 增加说明这个容器发生过自动重启。重新创建得到另一个容器后，这个计数从新对象开始，所以不能单凭零重启判断一夜平安。邮件 `exit=2` 先接回投递核查，通知仍 running 却不推进任务，则接回第 73 章按原任务 ID 查数据库。

在重建之前，把这轮脱敏日志和两条 inspect 结果保存到操作端的受限事故目录，记录容器 ID、时间范围与项目。`--tail 200` 只取最后两百行；故障较早就扩大时间与行数，已经轮转掉的内容需要从此前的留存处取得。删除旧容器可能失去它的本地日志，事后新进程的一行 ready 无法解释旧失败。

## 从入口一直查到实际依赖

先重发原客户端请求，确定失败来自 TLS、nginx 还是业务 JSON。nginx 502 说明它没得到可用的上游响应，尚不能判断是 API 没起来、端口接错还是处理时退出。到部署机先读发布的端口，再到运行中的容器自身发一次匿名探针：

```bash
docker compose port api 3000
docker compose exec -T api node -e "fetch('http://127.0.0.1:3000/profile/me').then(r=>{console.log(r.status);process.exit(r.status===401?0:1)}).catch(()=>process.exit(1))"
```

第一条应对应本例的 `127.0.0.1:3374`；第二条在容器内部请求，输出 401 才是本例预期。容器内成功、宿主发布地址失败，查发布端口、宿主监听与防火墙；宿主成功、HTTPS 失败，查 nginx upstream 与入口配置；匿名探针成功、登录后的业务失败，转到原请求 ID、数据库和对象存储。`exec` 要求容器正在运行，启动即退出的容器应先读日志与退出信息，不能靠反复 exec 进入它。

头像可以预览却不能保存时，先用原请求的错误区分临时文件读写和对象存储调用。只读根文件系统下 `/work` 的 tmpfs 是否仍挂在正确位置、是否已满？容器 UID 是否可写？对象地址是否能被 API 解析和信任？最终签名 URL 是否能被浏览器解析和信任？这些问题分别对应两个进程的网络和信任环境。不要在运行容器里临时改 `/etc/hosts` 后就结案；修正部署定义，重建并再次验证，才能让下一次替换保留修复。

数据服务若也由 Compose 托管，用服务名连接，并允许连接池在旧连接断开后重新解析和建立连接。服务替换后 IP 可能变化；把 inspect 看到的 IP 写进配置，只是把本次偶然地址固定下来。S3 的公开名称还参与签名，不能把返回 URL 的主机名随意替换。[容器服务发现与重建](https://docs.docker.com/compose/how-tos/networking/)

## 137、内存和磁盘分别怎样判断

进程退出 137 常对应 SIGKILL。内存不足会导致这种结果，停止期限耗尽或人为强制结束也可能导致。先读 `.State.OOMKilled`，再对照停止记录和部署机内核日志；不能看到 137 就扩大内存。在 Debian 部署机按需要使用 `sudo journalctl -k --since '15 minutes ago'`，找同一时间的内存终止记录。

```bash
docker stats --no-stream "$api_id"
docker inspect --format 'memory={{.HostConfig.Memory}} nano_cpus={{.HostConfig.NanoCpus}}' "$api_id"
docker system df -v
```

`stats` 是当前采样，进程重启后占用很低无法否定刚才的峰值。inspect 的 memory 单位为字节，`nano_cpus` 以十亿表示一个 CPU 的配额。限制能把一次异常的影响约束在预算内，但预算过低也会制造故障。EPP 的头像解码、原生库、Node 堆和 tmpfs 都要考虑；V8 堆上限只约束其中一部分。按同类请求观察并发与峰值，判断是扩大容量、限制并发、缩小输入，还是修复内存持续增长。[内存与 CPU 限制](https://docs.docker.com/engine/containers/resource_constraints/)

磁盘空间要同时看引擎对象和真正的文件系统。`docker system df -v` 列镜像、容器可写层、卷和构建缓存的占用；它不足以证明整个宿主还有可用空间。在**引擎所在 Debian 主机**运行：

```bash
docker_data_root=$(docker info --format '{{.DockerRootDir}}')
sudo df -h "$docker_data_root"
sudo df -i "$docker_data_root"
```

`df -h` 查容量，`df -i` 查 inode；后者耗尽时，即使还有字节空间也可能无法创建文件。数据库、绑定挂载和日志若在其他文件系统，还要对它们的实际路径检查。Mac Docker Desktop 的引擎在 Linux 虚拟机里，返回的 DockerRootDir 不是 Mac 可直接访问的目录，应同时检查 Desktop 的磁盘使用和 Mac 的剩余空间。

清理前先按类型定位。可以删除已经确认不再用于回退的镜像、过期构建缓存与无用的停止容器；数据库卷即使暂时没有容器挂载，仍可能是恢复材料。不要把“unused”解释成“业务不需要”，也不要用带卷删除的全局清理替代定位。[引擎磁盘统计](https://docs.docker.com/reference/cli/docker/system/df/) · [清理对象的范围](https://docs.docker.com/engine/manage-resources/pruning/)

## 日志要有保留边界，告警要看业务结果

应用继续把结构化日志写到 stdout/stderr，容器日志驱动负责接走。Compose 示例显式用了 `local` 驱动与轮转上限；默认 `json-file` 若没有轮转配置，日志会持续占用磁盘。修改日志驱动或上限后，要重建目标容器，使新配置生效；已有容器不会因为更改 daemon 默认值而自动转换。[日志驱动与轮转](https://docs.docker.com/engine/logging/configure/)

轮转解决容量边界，却缩短了可追查的历史。先根据报障可能延迟多久确定保留时间，再决定本地留存是否足够。需要跨主机追查时，集中收集脱敏日志，并把主机、项目、服务、容器 ID、镜像摘要与业务请求 ID 带过去。集中采集器停止时要能发现缺口，不能因为日志页面空白就认定没有错误。

告警至少区分进程退出、持续重启、资源逼近预算与业务积压。API 的 401 健康探针继续通过，通知 Worker 缺表权限仍可能让任务不进箱；一次重启后仍失败的工作不能靠更密集重启解决。第 73 章的等待阈值、采样失败与恢复通知仍适用。邮件的退出 2 则交给人按原消息核对，不能由通用“自动修复容器”脚本无条件拉起。

## 更新一个镜像，究竟会替换什么

先保存旧镜像摘要、Compose 定义版本、配置版本以及数据迁移状态。凭据单独保管，交接记录不保存明文。新版本在独立数据副本上完成旧账号、旧素材、头像与后台任务验证后，才改部署 `.env` 的 `EPP_IMAGE`。镜像按摘要选择可以复现同一产物；安全修复则要重新构建、重新验收并发布新摘要，固定摘要不会自动获得修复。

先拉取应用镜像，保持正在运行的服务；确认第 77 章的数据兼容判断允许旧、新代码接力后，再替换一个角色：

```bash
docker compose config --images
docker compose pull api notify
docker compose up -d --no-deps api
docker compose ps -a api
docker compose logs --since 5m --tail 100 api
```

`pull` 下载选定引用，不替换正在运行的容器。`up` 发现镜像或配置变化才重建；`--no-deps` 将这次操作限定到 API。单实例在停止和重新创建之间有不可用窗口，客户端应按约定处理。若要求连续服务，需要先准备另一实例、独立宿主端口和代理切换，核对共享会话、签名密钥、连接预算及两版数据兼容，等新实例验证后再排空旧实例。Compose 的一次 `up` 不会自动替你完成这一套发布设计。[拉取镜像](https://docs.docker.com/reference/cli/docker/compose/pull/) · [创建与更新](https://docs.docker.com/reference/cli/docker/compose/up/)

API 验过后再更新通知；邮件先确认当前投递已经停止并完成原 ID 对账，再决定何时用新镜像启动。一次性迁移使用独立的迁移身份，并记录是否成功，不让普通服务在每次启动时反复执行。失败回退时，先判断旧程序能否读取迁移后的结构和新增数据；只有仍兼容时才恢复旧摘要并重新创建。把镜像退回去不会撤销已经发出的邮件、数据库写入或对象删除。

凭据轮换也有相同边界。修改 bind 挂载的文件，运行进程不会自动重新读取启动配置；原子替换文件时旧挂载还可能指向旧文件。按第 75 章让新旧身份在限定时段并存，重建目标角色，以实际连接和业务读写确认新身份接手，再停止旧实例、撤销旧登录。不要用 `restart` 的成功提示代替这些判断。

## 有卷以后，怎样恢复整套服务

镜像可以重建进程，持久卷保存运行数据，备份提供离开原宿主后的恢复材料。这三件事各有生命周期。`docker image save` 导出镜像，不包含业务卷；`docker commit` 也不会把挂载卷变成数据库备份。保存在原主机上的命名卷，不能抵挡原盘损坏。[卷的生命周期](https://docs.docker.com/engine/storage/volumes/)

当前 Compose 示例的数据服务在外部，所以应用容器重建不应触碰数据库或桶。若进一步把它们也容器化，先核对各自真正的数据目录和卷挂载点；“挂了一个卷”不能证明程序确实写进了它。创建空卷再启动数据库，会得到一套可登录的空实例。换项目名自动得到另一组卷时也可能出现这种现象，应按原数据库标识、旧收据和对象摘要判断是否接回了数据。

数据库运行时直接打包数据卷，可能得到无法一致恢复的文件集合。第 76 章的逻辑备份或 PostgreSQL 基础备份/WAL 方法仍按其自身要求执行；采用冷复制则先停止写入并正常关闭数据库，再按支持的版本与平台条件恢复。对象存储也要按它的持久布局取得对象与元数据，和库里的对象引用建立同一停写点或明确的追赶方案。应用、Worker 与维护任务都属于写入者，停 API 一个容器不等于业务已经停写。

在另一套专用项目、空卷与隔离网络恢复，邮件默认保持停止，避免旧队列向真实收件人重放。先恢复数据服务并核对原角色权限，再启动受限 API，使用原账号读取旧素材、下载原头像并比摘要。通知按原 ID 核对已经完成与待处理工作，邮件保留未知投递的处置记录。通过这些结果后才准备入口切换；恢复过程中创建的新数据也要能再次读回。定期演练时同时记录用时，才能知道承诺的恢复时间是否成立。

第 74 章的维护 CLI 可以由一次性容器执行，仍需要独立维护凭据、同一镜像和原来的期望库/桶参数。调度器必须知道一次运行何时结束、退出码是什么、错过调度如何处理；Compose 本身不提供 cron 日历。两个调度源重叠时，原任务领取与幂等设计继续承担一致性，不能把“每次都是新容器”当作互斥锁。

## 附录：本章必要技术点速查

| 项目 | 本章用途与边界 |
| --- | --- |
| `ps -a`／定向 `inspect` | 找到退出的容器，关联状态、镜像与时间 |
| `logs --since --tail` | 控制取证范围；轮转与重建可能缩短历史 |
| `exec -T`／`port` | 从容器内与宿主发布两侧对照网络 |
| `stats --no-stream`／`OOMKilled` | 当前采样／内存终止线索，结合历史与内核判断 |
| `system df -v`／`df -h`／`df -i` | 引擎对象占用／文件系统容量／inode |
| `pull`／`up --no-deps` | 下载产物／替换指定角色，单实例有中断窗口 |
| 镜像回退／数据恢复 | 前者替换程序，后者还涉及迁移、历史写入和外部结果 |
| 卷／备份 | 保存活数据／提供经过恢复验证的副本 |

[返回 Compose](../part-09-deployment/side-03-compose.md) · [本篇导读](README.md) · [全书目录](../README.md)
