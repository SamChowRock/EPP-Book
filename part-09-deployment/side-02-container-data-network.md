# 支线　容器重建后，数据和地址在哪里

上一条支线把运行程序装进镜像。替换镜像以后，旧账号、收据和头像仍须可用，接下来要决定数据落在哪里，以及谁通过哪个地址访问它。镜像能带走程序，数据库和对象存储还需要自己的交付与恢复安排。

阅读约 20～28 分钟，独立实验约 25～40 分钟，不含首次下载镜像。先完成[容器引擎与 Compose 的准备](../environment-setup.md#为容器部署准备引擎与-compose)。下面在连接本机 Linux 容器引擎的终端操作；Debian 若沿用 `sudo docker`，将下文每次 `docker` 调用也加上 `sudo`。使用临时资源演示机制，输出写的是预期结果。这里只用 Node 演示存储与网络，EPP 全栈还需下一条支线的配置集成。

## 替换程序时，究竟删掉了哪份数据

容器可写层属于这个容器。停止后再启动同一个容器，文件还在；删除容器再按同一镜像创建，旧可写层不会回来。因此重启成功不能证明数据已经持久化。命名卷由引擎管理，绑定挂载则把引擎所在主机的指定路径接进来，两者都能独立于容器保留。挂载覆盖已有目录时，镜像原有内容会被遮住，排查“镜像里的文件消失”应先看挂载。[Docker 存储说明](https://docs.docker.com/engine/storage/)

先做一个只有文本文件的实验。终端保留下面的 `data_volume`，两次 `run` 会创建不同容器，`--rm` 在各自结束后删除容器。`src` 选中同一份卷，`dst` 是容器里的路径。

```bash
data_volume=$(docker volume create)
docker run --rm --mount "type=volume,src=$data_volume,dst=/data" \
  node:24-bookworm-slim node -e \
  'require("node:fs").writeFileSync("/data/receipt", "receipt-A\n")'
docker run --rm --mount "type=volume,src=$data_volume,dst=/data,readonly" \
  node:24-bookworm-slim node -e \
  'process.stdout.write(require("node:fs").readFileSync("/data/receipt"))'
```

预期第二次打印 `receipt-A`。去掉第二条命令的整个 `--mount` 参数再执行，预期是 `ENOENT`，因为新容器没有接到原卷。原数据仍在，先前变量选错、卷名改变也会产生类似现象。用 `docker volume inspect "$data_volume"` 核对卷名和驱动，确认不再需要这个练习文件后才执行 `docker volume rm "$data_volume"`。正式库遇到“空库”先核对挂载来源和实际数据目录，不要立即重新初始化。

EPP 的头像预览暂存可以在进程停止后消失，适合放进有大小限制的 tmpfs。它消耗内存，容器停止后内容丢失，还可能进入宿主 swap，不能据此承诺敏感数据绝不落盘。PostgreSQL 数据、SeaweedFS 的对象内容及 Filer 元数据则需要持久存储。[tmpfs 的寿命与限制](https://docs.docker.com/engine/storage/tmpfs/)

绑定挂载适合由宿主维护的配置和证书。例如 `--mount type=bind,src=/etc/epp/api.env,dst=/run/epp/api.env,readonly` 表示只读接入已有文件，但程序仍须显式加载它。路径属于引擎所在主机，远程 Docker 不会把当前终端的文件自动传过去。`--mount` 在源路径不存在时直接报错，避免把拼错的配置路径悄悄变成新目录。[绑定挂载](https://docs.docker.com/engine/storage/bind-mounts/)

挂载也不会自动解决权限。Linux 核对的是运行进程与文件的数值 UID、GID，容器里的同名用户未必对应宿主同一个身份。运行前确认镜像的运行 UID，检查目标目录所有者、模式和父目录遍历权限；启用 rootless 或用户命名空间映射时，还要核对映射后的宿主身份。已有卷不会因新镜像改了 `USER` 就自动换属主。用实际运行身份验证读取配置、写入暂存，遇到 `EACCES` 修正具体目录或映射，不把整份数据库目录放宽成所有人可写。[用户命名空间与挂载权限](https://docs.docker.com/engine/security/userns-remap/)

保留卷只能应对容器替换。宿主磁盘损坏、误删对象、错误迁移都会影响同一份数据。恢复材料要保存到独立位置，包含数据库、配对的对象数据与 Filer 元数据、恢复所需配置和版本。运行中的 PostgreSQL 数据目录不能当普通文件夹随意打包，应沿用逻辑备份或数据库支持的物理备份方式。数据库与桶分别备份时还须约定一致的写入边界，必要时暂停相关写入和消费者。最后在新卷恢复，按原账号、收据 ID、对象键与摘要复读，才能判断备份是否可用。[PostgreSQL 文件备份的一致性要求](https://www.postgresql.org/docs/18/backup-file.html)

## 从哪一个网络空间发出连接

API 搬进容器后，`127.0.0.1` 指 API 容器自身。数据库在另一容器时，仍写 `127.0.0.1:5432` 就会连接错误位置。用户定义网络提供名称解析，同网容器可用服务名和容器端口通信。发布端口另把宿主端口接到容器端口，镜像中的 `EXPOSE` 本身不会建立这条映射。[Compose 网络](https://docs.docker.com/compose/how-tos/networking/)、[发布端口](https://docs.docker.com/engine/network/port-publishing/)

先用两个临时容器把两条路径分开。在同一终端创建独立网络，让服务以 `probe` 为网络别名监听所有容器接口。资源名带时间与 Shell 进程号后缀，避免与已有服务混用。

```bash
probe_network="epp-net-$(date +%s)-$$"
docker network create "$probe_network"
probe_container=$(docker run -d --network "$probe_network" --network-alias probe \
  -p 127.0.0.1:18080:8080 node:24-bookworm-slim node -e \
  'require("node:http").createServer((q,s)=>s.end("network-A\n")).listen(8080,"0.0.0.0",()=>console.log("ready"))')
docker logs "$probe_container"
```

等日志出现 `ready` 再发请求。端口已占用则选一个空闲宿主端口，同时修改下方 curl 地址；容器内的 8080 不变。

```bash
docker run --rm --network "$probe_network" node:24-bookworm-slim node -e \
  'fetch("http://probe:8080",{signal:AbortSignal.timeout(3000)}).then(r=>r.text()).then(t=>process.stdout.write(t)).catch(e=>{console.error(e.cause?.code||e.message);process.exitCode=1})'
curl --max-time 3 http://127.0.0.1:18080
```

预期两次都得到 `network-A`，前一次靠容器网络和 DNS，后一次靠发布端口。把第一条里的 `probe` 换成 `127.0.0.1`，预期连接失败，因为请求容器没有监听 8080。若服务改为只监听自己的 `127.0.0.1`，其他容器和发布端口也无法因此访问它。EPP 的 `LISTEN_HOST` 搬进桥接网络后应按这个原因调整，而不是照抄宿主部署的回环值。实验结束执行 `docker stop "$probe_container"`、`docker rm "$probe_container"`，最后 `docker network rm "$probe_network"`。

接入真实数据库时，同网 API 使用例如 `db:5432`，无需为此把数据库发布到宿主。排查先看解析失败、拒绝连接或超时，再看数据库认证与授权；TCP 连通不代表账号有权读表。只向宿主本机提供调试入口时显式绑定回环，省略宿主地址通常会发布到所有接口。数据库与 Filer 管理端口保持在需要它们的网络范围内。

## API 能写头像，浏览器为什么仍打不开

数据库地址只需调用它的进程可达。头像签名 URL 会交给浏览器，`s3` 这样的内部服务名不会因此进入用户设备的 DNS。当前 EPP 的 `AvatarObjects` 只有一个 `AVATAR_S3_ENDPOINT`，同一客户端负责上传、删除和生成签名 URL；代码还要求非回环端点使用 HTTPS。因此直接填 `http://s3:8333` 会在配置校验时失败，不能当成当前项目的容器方案。

延续[第 72 章](chapter-72-service-access/chapter.md)，可以继续使用 `https://api.epp.test:9443`。API 容器与浏览器都要解析这个名称、连接对应入口并信任证书。容器内部可让这个名称解析到同网代理，浏览器解析到部署主机，两侧地址可以不同，但名称与证书匹配关系相同。不要把域名固定到即将被重建的容器 IP。公开根证书只读挂入 API，并通过 `NODE_EXTRA_CA_CERTS` 在 Node 启动前加载；浏览器信任仍须单独准备。

签名还包含 `Host`。代理如果把它改成 `s3:8333`，或删掉原有的 `:9443`，即使请求到达正确对象服务也可能被拒。下面仅展示已有 TLS `server` 内需要集成的转发结构，`s3` 必须确实存在于代理所连网络，证书、监听和 DNS 更新策略仍要配齐。

```nginx
location / {
    proxy_pass http://s3:8333;
    proxy_set_header Host $http_host;
    proxy_set_header Cookie "";
    access_log off;
}
```

这里保留原 Host、对象路径与查询参数，不给 `proxy_pass` 添加替换路径。也不要生成 URL 后再用字符串替换域名。访问日志关闭是为避免保存带签名的完整 URL。排查时分别识别 DNS、TLS 信任、入口拒接和 S3 签名错误，重新申请未过期 URL，再用同一对象键比较 API 与浏览器两条路径。[S3 签名字段](https://docs.aws.amazon.com/AmazonS3/latest/developerguide/sigv4-query-string-auth.html)、[nginx 代理头设置](https://nginx.org/en/docs/http/ngx_http_proxy_module.html)

最后再改变一次条件。容器重建可能换 IP，服务名保持，旧连接却会断开。应用需要重新解析并重连；nginx 也须按所用版本配置运行时 DNS 解析，或在上游变更后重新加载，不能把配置里写了服务名理解成永远自动跟随。验收应包含重建一个后端后再读原记录、原头像，观察连接恢复；这才把卷的数据寿命与网络的地址寿命接到了一起。[nginx 上游名称解析](https://nginx.org/en/docs/http/ngx_http_upstream_module.html#resolve)

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| 可写层／命名卷／绑定挂载 | 区分替换容器时保留什么 | 停启与删除重建不同，挂载来源和目标都要核对 |
| tmpfs | 预览暂存 | 停止即丢失，占用内存并可能进入 swap |
| `docker volume inspect` | 核对卷身份与驱动 | 卷存在不证明挂对目录或备份可恢复 |
| `--network`、`--network-alias` | 独立网络及容器间解析 | 名称只在相应网络范围内可用 |
| `-p 宿主地址:宿主端口:容器端口` | 提供宿主入口 | 服务仍须监听可被转发访问的接口 |
| `AVATAR_S3_ENDPOINT` | 上传与浏览器签名 URL 的共同端点 | 两侧都须可达并信任，当前非回环端点必须 HTTPS |
| `proxy_set_header Host $http_host` | 保留签名中的原 Host | 同时保留端口、路径和查询参数 |

[上一篇：应用镜像](side-01-container-deployment.md) · [继续：用 Compose 管理运行与恢复](side-03-compose.md) · [本篇导读](README.md)
