# 支线　用 Compose 管理已经验过的服务

前两条容器支线已经确定镜像、数据位置与连接地址。现在要让 API、邮件和通知三个进程在退出终端以后继续工作，并让下一班能按同一份定义重新创建它们。逐条保存 `docker run` 可以做到，但参数散落后容易让两个角色共用凭据，或漏掉可写目录。Compose 把服务、挂载、网络和停止约定放在一份声明里，Docker Engine 负责实际运行进程。

先完成[引擎与 Compose 的安装验证](../environment-setup.md#为容器部署准备引擎与-compose)。以下命令在选定部署机的 SSH 终端执行，使用同一个 Docker context 和操作身份。Debian 沿用环境指南的 `sudo docker` 时，每次调用也加 `sudo`。阅读约 18～25 分钟；已有镜像、容器可达的数据服务与隔离配置时，配置和停止重建对照另加 35～55 分钟。

## 从三个角色写出一份服务定义

第 71 章的三个入口运行同一份程序，但使用不同的数据库身份。保留这项设计：镜像保存代码，运行配置决定角色，API、邮件与通知各有一个容器。容器里的 UID 可以相同，因为各自只挂入自己的配置；数据库权限仍由三个不同的登录限制。不要把宿主上的三个 systemd 单元和容器同时接到正在使用的库上消费同一批任务。

独立的镜像、卷与网络实验可以先做；本节 EPP 集成先完成第 72 章的原生 HTTPS 交付，再用容器替换应用进程，以便保留已经验过的入口与数据作为对照。

下面是**应用层 Compose 结构示例**，需要按前两条支线制作并验证 EPP 镜像，不能直接当作配套仓库已经交付的整栈部署包。约定镜像在 `/app` 保存 Linux 生产产物和依赖，提供 UID/GID 1000 的运行身份，入口分别为 `dist/src/server.js` 与 `dist/src/mail-worker.js`。数据库、对象存储、SMTP 与 nginx 继续在各自已经验证的位置运行。本例只替换三个应用进程。

在本次专用部署目录准备 `compose.yaml` 和 `secrets/`。将第 71 章核对过的三份角色配置分别放为 `api.env`、`mail.env`、`notify.env`，按数据网络支线改成容器真正能访问的地址。宿主回环地址不能直接搬入文件。本例接回第 72 章的练习 HTTPS 对象入口：创建 `trust/`，把管理端核过指纹的公开根证书放为 `trust/root.crt`，普通运行身份可读。下面将它只读挂入 API，并通过 `NODE_EXTRA_CA_CERTS` 加入 Node 的出站信任。CA 私钥不交给应用。

```yaml
name: epp-container-lab

x-runtime: &runtime
  image: ${EPP_IMAGE:?set EPP_IMAGE to the verified image reference}
  user: "1000:1000"
  working_dir: /work
  entrypoint: ["node"]
  read_only: true
  cap_drop: [ALL]
  security_opt: ["no-new-privileges:true"]
  tmpfs:
    - /work:uid=1000,gid=1000,mode=0700,size=67108864
    - /tmp:mode=1777,size=67108864
  stop_grace_period: 40s
  logging:
    driver: local
    options:
      max-size: "10m"
      max-file: "3"

services:
  api:
    <<: *runtime
    command: ["--env-file=/run/epp.env", "/app/dist/src/server.js"]
    environment:
      LISTEN_HOST: "0.0.0.0"
      PORT: "3000"
      NODE_EXTRA_CA_CERTS: "/run/epp-ca.crt"
    ports: ["127.0.0.1:3374:3000"]
    volumes:
      - type: bind
        source: ./secrets/api.env
        target: /run/epp.env
        read_only: true
        bind:
          create_host_path: false
      - type: bind
        source: ./trust/root.crt
        target: /run/epp-ca.crt
        read_only: true
        bind:
          create_host_path: false
    restart: unless-stopped
    mem_limit: 512m
    cpus: 1.0
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:3000/profile/me').then(r=>process.exit(r.status===401?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s

  mail:
    <<: *runtime
    command: ["--env-file=/run/epp.env", "/app/dist/src/mail-worker.js", "${EPP_DATABASE:?set EPP_DATABASE}"]
    volumes:
      - type: bind
        source: ./secrets/mail.env
        target: /run/epp.env
        read_only: true
        bind:
          create_host_path: false
    restart: "no"
    mem_limit: 256m

  notify:
    <<: *runtime
    command: ["--env-file=/run/epp.env", "/app/dist/src/mail-worker.js", "${EPP_DATABASE:?set EPP_DATABASE}", "notifications"]
    volumes:
      - type: bind
        source: ./secrets/notify.env
        target: /run/epp.env
        read_only: true
        bind:
          create_host_path: false
    restart: unless-stopped
    mem_limit: 256m
```

`x-runtime` 是公共配置，`&runtime` 为它命名，`<<: *runtime` 将这些键合入每个服务。三个进程共享镜像与停止约定，各自的命令和配置仍可单独核对。内存、CPU 和 tmpfs 数值是练习起点，要按头像解码、并发与实际峰值调整；tmpfs 会占用内存预算，上传的压缩字节数也不等于解码后的占用。[资源限制](https://docs.docker.com/engine/containers/resource_constraints/)

文件只读挂载控制容器能否修改，文件自身权限控制进程能否读取。在普通 rootful Debian Engine 上，将专用目录保留给部署者，三份文件分别设成容器 UID 1000 可读、其他无关身份不可读；改变属主前先确认主机上 UID 1000 对应谁。采用 rootless 或用户命名空间映射时，须按映射后的宿主身份授权。不要用放宽到所有人可读解决失败。填好下一节的两个插值变量后，可用 `docker compose run --rm --no-deps api -e "require('node:fs').accessSync('/run/epp.env',4)"` 检查读权，它只检测访问，不打印文件。

在普通 rootful Debian 上，确认 `getent passwd 1000` 对应的宿主身份可被信任，并且当前目录中的三份文件确为本次专用副本后，可这样落实读权：

```bash
chmod 700 ./secrets
sudo chown 1000:1000 ./secrets/api.env ./secrets/mail.env ./secrets/notify.env
sudo chmod 400 ./secrets/api.env ./secrets/mail.env ./secrets/notify.env
stat -c '%u:%g %a %n' ./secrets/api.env ./secrets/mail.env ./secrets/notify.env
```

三行应显示 `1000:1000 400`。这里只改部署目录里的副本，原 `/etc/epp72` 配置仍供原生服务使用。用前面的 accessSync 命令无输出、退出 0 确认容器实际可读；失败时核对是否选错 context、运行 UID 或源文件。rootless、用户命名空间与 Mac 文件共享应按各自映射验证，不能机械套用这组宿主属主值。

Node 直接作入口，40 秒停止期覆盖现有 API 的排空设置和 Worker 的退出期限。只读根文件系统保护产物，头像临时文件落在 `/work`；容器停止后 tmpfs 内容消失，所以它只接临时处理，不接最终头像或数据库。宿主源文件不存在时 `create_host_path: false` 使部署失败，避免把拼错的秘密文件路径自动建成目录。[Compose 服务配置](https://docs.docker.com/reference/compose-file/services/)

## 把配置的两个阶段分清楚

在 `compose.yaml` 旁的 `.env` 只写 `EPP_IMAGE` 和 `EPP_DATABASE`：前者为已验收的镜像引用，正式交付记录仓库摘要；后者为本次专用库的实际名称。`${...}` 由运行 Compose 的客户端替换；`?` 形式让缺值立即报错。Shell 中已导出的同名变量可能覆盖 `.env`，所以每次切换部署目录，都先核对最终选择。

这份 `.env` 不会自动成为容器里的环境变量。YAML 的 `environment` 才会注入进程环境，三份 `secrets/*.env` 则由 Node 的 `--env-file` 读取。API 的两个监听参数来自 `environment`，优先于配置文件中的同名值。完整 `docker compose config` 可能展开敏感配置；此处用 `config --quiet` 检查结构，用 `config --images` 只看镜像引用。[Compose 插值](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/)

项目名 `epp-container-lab` 将容器、默认网络与 Compose 管理的卷关联起来。下次换了目录仍要保留这个身份；做第二套演练则选另一个项目名，并调整宿主端口和数据目标。项目名不能隔离配置中主动填入的同一个业务数据库。以下命令均在本项目的目录内运行。

```bash
docker compose config --quiet
docker compose config --images
docker compose up -d api notify
docker compose ps -a
docker compose logs --since 5m --tail 100 api notify
```

`up -d` 根据定义创建或更新选定服务，返回终端以后容器继续运行；`ps -a` 把已退出的容器也列出来。API 应进入运行状态并通过 HTTP 探针，通知日志应出现 `worker.ready`。接着按原账号读旧素材、预览头像，并让一笔新的通知变成 `done` 且能被用户读取。只看到容器名称或 ready 不能替代这些业务结果。

API 的宿主端口只发布到 `127.0.0.1:3374`。本例继续由**同一宿主上的 nginx** 接收外部 HTTPS，因此将第 72 章 API upstream 改为 `http://127.0.0.1:3374`，检查并重新加载该配置。原 `[::1]:3374` 不会自动转到这条 IPv4 发布。浏览器仍访问原 HTTPS 域名，`APP_ORIGIN` 仍取浏览器看到的来源；迁移前先停下占用宿主 3374 的旧 API。

API 经桥接网络接收宿主代理请求，看到的对端通常是桥接网关，不能沿用原生部署的回环代理白名单。检查这次网络的网关与实际连接来源，只把已确认的代理地址配置为 `TRUST_PROXY_IPS`；当前配置接受逗号分隔的 IP，不接受 CIDR。nginx 继续覆盖转发头，发布入口继续限制在宿主回环。验证真实客户端地址及伪造转发头被忽略，避免把所有调用者都当成同一个代理或盲目信任任意来源。

## 依赖就绪与业务恢复各解决什么

本例的数据服务由外部托管，Compose 不会启动或等待它们。先从容器网络核对连接，再启动应用。以后把数据库也纳入同一 Compose 文件，可以用 `depends_on` 配合 `service_healthy` 等待健康检查通过；普通依赖关系只保证启动次序。数据库能接受连接之后，迁移仍可能没完成，应用角色也可能没得到授权。

一次性迁移可作为独立服务，用迁移专用身份，成功退出后再放行应用。不要让每个 API 副本携带迁移凭据并同时改表。依赖运行后掉线，仍由应用处理错误与重连，Compose 的启动等待不会持续代替业务恢复。[启动顺序与就绪条件](https://docs.docker.com/compose/how-tos/startup-order/)

示例 HTTP 探针把匿名 `/profile/me` 的 401 当作成功：这是预期的鉴权拒绝，能证明 HTTP 路由已工作。它没有登录、没有查旧素材，也没有观察通知队列。`unhealthy` 会改变健康状态；普通 Engine 的重启策略依据进程退出触发，不会因为这个标记自动重启。保持第 73 章按任务等待时间判断的告警，才能发现“API 健康，通知一直积压”。

## 邮件为什么需要单独的启动决定

现有邮件 Worker 在 SMTP 结果为 `unknown`、暂停或发送后失去占用时退出 2。Debian 单元用 `RestartPreventExitStatus=2` 保留人工核对点。Docker 的 `on-failure` 会把非零退出都纳入重启，不能直接表达这一条排除规则。因此此处给邮件 `restart: "no"`，退出 1 或 2 都告警并由接班人判断；API 与通知则可按各自恢复约定自动重启。[Engine 重启策略](https://docs.docker.com/engine/containers/start-containers-automatically/)

首次启动前，按原任务 ID 核对已有未知投递与占用，完成第 71 章的处置再运行 `docker compose up -d mail`。之后若邮件容器退出，先读最后一轮日志和数据库里的原消息、次数与占用，再决定是否启动。进程重启不能证明上一封邮件没发出去，也不会消除外部结果的不确定性。邮件在宿主重启后也需要按这一约定接手；交接单应写清谁接告警和谁处理该笔投递。

## 停止、重建，再接回交付

第一次停止练习只选 API，保留通知与数据依赖：先发起一笔能观察到的头像处理，再在另一个 SSH 窗口执行 `docker compose stop api`。观察旧请求结果、排空日志和退出状态。超过停止期限仍未退出会被强制结束；若出现 137，下一条运维支线会结合 OOM 与停止记录判断原因。随后 `docker compose up -d api`，用旧会话与原对象再次核对。

接着执行 `docker compose up -d --no-deps --force-recreate api`，让容器身份改变，镜像和外部数据保持。这次重建应仍能读到旧素材和同一头像。两次结果意义不同：停止后再启动沿用原容器；重建移除了旧可写层，能暴露把持久数据误放在容器内的问题。

修改环境定义或镜像后执行 `up -d` 才会重新核对并更新容器。`restart` 只是重启已有容器，不应用新的配置定义；bind 文件被原子替换时也要重建，确认挂入的是新文件。`down` 删除项目容器和网络；加 `-v` 还会删除它管理的命名卷与附属匿名卷。日常调整某个角色，按服务名处理更容易保留现场。[更新行为](https://docs.docker.com/reference/cli/docker/compose/up/) · [restart](https://docs.docker.com/reference/cli/docker/compose/restart/) · [down](https://docs.docker.com/reference/cli/docker/compose/down/)

完成后回到第 72 章，让使用者从自己的设备完成素材、头像、改密和通知。再进入[容器日常运维](../part-10-operations/side-01-container-operations.md)，学习服务已经有人使用时如何取证、升级和恢复。

## 附录：本章必要技术点速查

| 项目 | 本章用途与边界 |
| --- | --- |
| service／project | 角色定义／一组资源的归属；数据配置仍须独立核对 |
| `config --quiet`／`--images` | 检查声明／查看选中的镜像，减少秘密输出 |
| `run --rm --no-deps` | 临时运行服务的命令，不启动其依赖 |
| `up -d`／`stop`／`restart` | 创建更新／停止／重启现有定义 |
| `healthcheck`／`depends_on` | 状态观察／创建时依赖等待，不能替代业务告警 |
| `restart`／`stop_grace_period` | 退出后的策略／正常停止的等待期限 |
| `logging`／`mem_limit` | 日志保留与内存预算，按实际负载验证 |

[上一条 · 数据与网络](side-02-container-data-network.md) · [接回客户端交付](chapter-72-service-access/chapter.md) · [本篇导读](README.md)
