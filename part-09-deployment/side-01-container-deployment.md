# 支线　把运行环境装进镜像

第 70 章已经把生产产物交到目标平台。再增加一台机器时，还要核对 Node、系统库与原生依赖。容器镜像把这些运行文件一起保存，让不同机器从同一份产物创建进程。本支线先用独立 Node 实验理解生命周期，再推导 EPP 镜像的交付边界。选择容器路线时，先按[容器引擎与 Compose](../environment-setup.md#为容器部署准备引擎与-compose)安装并确认引擎可用。

## 镜像交付了什么，进程在哪里运行

镜像包含文件系统的只读层和入口、环境等默认配置。容器从镜像创建，获得自己的可写层与运行设置。Linux 内核用命名空间隔开进程、网络和挂载视图，用 cgroup 统计和限制资源。同一引擎上的 Linux 容器共享内核，内核故障或主机磁盘耗尽仍会影响多个服务。Mac 上 Docker Desktop 让它们运行在 Linux 虚拟机中，Debian 上的引擎可直接使用部署机内核。[Docker 架构](https://docs.docker.com/get-started/docker-overview/)与[容器和虚拟机](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/)说明了这两层关系。

在准备好 Docker 的操作终端执行下面两条命令。Debian 若沿用 `sudo docker`，本支线每次 Docker 调用也使用相同前缀。CLI 是发送管理请求的客户端，真正创建容器的是当前连接的引擎，因此先确认管理目标。

```bash
docker context show
docker version
```

前者显示上下文名称，后者分别列 Client 和 Server。只有客户端版本而没有 Server 信息，先排查引擎是否启动、上下文是否选对以及连接权限。Docker Desktop 用户也可打开 Containers 页面，点击容器查看 Logs 与 Inspect。

下面创建名为 `epp-container-first` 的独立容器，不连接 EPP 的库与桶。官方 `node:24-bookworm-slim` 用于机制实验，标签可能更新，不能作为 EPP 固定版本交付的凭据。

```bash
docker run --name epp-container-first node:24-bookworm-slim \
  node -e 'console.log({pid:process.pid,os:process.platform,arch:process.arch})'
docker ps -a --filter name=epp-container-first
docker logs epp-container-first
docker inspect --format '{{.State.Status}} {{.State.ExitCode}}' epp-container-first
```

第一次可能先下载镜像。程序应打印 `os: 'linux'` 和镜像的平台架构，然后退出，最后一条应得到 `exited 0`。`docker ps` 默认只显示运行中的容器，加 `-a` 才能找到它。进程完成了自己的任务，退出不代表故障。拉取失败时查网络、仓库与镜像名称。名称占用时先找已有对象，再换实验名称。进程启动后报错，则从 `logs` 读程序错误。[容器启动命令](https://docs.docker.com/reference/cli/docker/container/run/)区分了创建与重新启动。

重启原容器保留其可写层，删除并重建会换一层。因此进入容器手工改代码，修复只留在这个实例里。修复应回到源码、重新构建镜像，再替换容器。需要跨实例保留的数据将在[下一条支线](side-02-container-data-network.md)放到独立存储。

## 构建缓存与目标平台

Dockerfile 描述构建步骤。每一步以此前结果为输入，文件内容或指令变化时，相关缓存失效。若先复制整个项目再安装依赖，改一行源码也会让安装重做。把依赖清单放在前面，业务修改便可复用安装结果。下面只是构建阶段片段，后续还需复制源码、Prisma 定义、配置与构建脚本。

```dockerfile
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
```

构建上下文是交给构建器的输入目录。根目录 `.dockerignore` 至少要排除本机 `node_modules`、`.git`、各类 `.env`、凭据、业务数据和临时文件。生产连接配置在启动时注入，放进某层再删除，旧层仍可能保留它。`COPY` 尽量点名所需目录。

锁文件固定 npm 依赖，不能固定基础镜像标签，也不能让缓存里的系统包自动更新。修复基础环境漏洞时，要有意取得新基础镜像并重新构建、验证，再晋级新摘要。[缓存失效规则](https://docs.docker.com/build/cache/invalidation/)解释了哪些变化会触发重做。

EPP 的 `argon2` 和 `sharp` 带有原生依赖，Mac 的 `node_modules` 不能直接交给 Linux 镜像。`linux/arm64` 与 `linux/amd64` 要分别准备兼容依赖，基础发行版的系统库也影响加载。优先在目标平台构建和验证。跨架构模拟能帮助构建，但速度和运行表现需要另行判断。多平台镜像实际包含多份平台产物，由引擎选择匹配的一份，详见[多平台构建](https://docs.docker.com/build/building/multi-platform/)。

## 分开构建工具与运行产物

TypeScript 和 Prisma 生成工具参与构建，API 需要编译结果、配置资源与生产依赖。多阶段构建用多个 `FROM` 建立独立阶段，只把所需产物复制进最终阶段。EPP 的构建阶段需要完整开发依赖，`npm run build` 会先生成 Prisma 客户端，再编译并复制 `config/service.json` 到 `dist/config`。运行阶段须保留完整 `dist`，只复制入口会丢失模块与资源。[多阶段构建](https://docs.docker.com/build/building/multi-stage/)说明了阶段间复制。

下方是**运行阶段的结构示例**。它假定此前已有 `build` 阶段，在 `/app` 完成构建并得到同平台生产依赖。构建阶段与运行阶段采用相同的目标平台和基础系统，构建结束后可用 `npm prune --omit=dev` 留下生产依赖。完整 Dockerfile 仍须补齐构建输入与依赖准备，并在目标平台验证。`NODE_IMAGE` 必须传入符合项目 `engines.node` 的精确 Node 版本及固定摘要，不能用上面的实验标签代替。

```dockerfile
# NODE_IMAGE 须在整个文件第一个 FROM 之前用 ARG 声明
FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
RUN mkdir /work && chown node:node /work && chmod 0700 /work
ENV NODE_ENV=production
USER node
WORKDIR /work
CMD ["node", "--enable-source-maps", "/app/dist/src/server.js"]
```

`package.json` 保留模块类型声明，`/app` 保存产物，`/work` 承担头像暂存。API、邮件和通知进程可用同一镜像，分别选择已有入口、参数和凭据。迁移还需要 CLI 与完整迁移历史，可交付同版本迁移阶段。API 容器不因此取得迁移权限。

标签便于命名，发布还要记录不可变摘要与目标平台。对已拉取的实验镜像查看仓库摘要。

```bash
docker image inspect --format '{{json .RepoDigests}}' node:24-bookworm-slim
```

结果中的 `仓库名@sha256:…` 可用于按内容取镜像。仅本地构建、尚无仓库关联的镜像可能返回空数组。发布 EPP 时，把验证过的镜像推入选定仓库，记录摘要，再按同一摘要部署。摘要确定内容，不证明应用健康，也不包含外部数据与运行配置。[镜像摘要](https://docs.docker.com/dhi/explore/security-concepts/digests/)说明了它与标签的区别。

## 信号、运行身份与可写位置

容器的主进程承担生命周期，在自己的进程命名空间里通常是 PID 1。Docker 默认先向它发 `SIGTERM`，超过等待时间再用 `SIGKILL`。JSON 数组形式的 `CMD` 让 Node 直接成为入口，避免额外 shell 阻断信号。应用仍须按前文关闭监听、等待在途工作并清理资源，容器停止期限要覆盖应用的退出预算。配置依据见[停止行为](https://docs.docker.com/reference/cli/docker/container/stop/)与 [Dockerfile 入口](https://docs.docker.com/reference/dockerfile/#entrypoint)。

下面另建独立长进程。`-d` 让命令返回后继续运行，收到 TERM 后清掉定时器，事件循环便可自然退出。

```bash
docker run -d --name epp-signal-demo node:24-bookworm-slim \
  node -e 'const t=setInterval(()=>{},1000); process.once("SIGTERM",()=>{console.log("TERM received");clearInterval(t)}); console.log("ready",process.pid)'
docker logs epp-signal-demo
```

看到 `ready` 后再停止，避免在信号处理器尚未安装时结束实验。

```bash
docker stop --timeout 40 epp-signal-demo
docker logs epp-signal-demo
docker inspect --format '{{.State.ExitCode}} {{.State.OOMKilled}}' epp-signal-demo
```

预期日志出现 `TERM received`，最后读数为 `0 false`。若是 137，结合 `OOMKilled` 和停止时间判断内存耗尽、超时强杀或其他 KILL 来源，不能只凭退出码认定原因。需要回收子进程时可用 `--init`，它不能代替应用的退出处理。

[官方 Node 镜像定义](https://github.com/nodejs/docker-node/blob/main/24/bookworm-slim/Dockerfile)提供 UID/GID 为 1000 的普通用户 `node`，本组结构示例沿用它。EPP 以普通身份运行，产物归构建阶段管理。启动时加 `--read-only` 让根文件系统拒绝写入，仍须给 `/work` 独立可写挂载。头像暂存可用限额 tmpfs，停止后丢弃，数据库与已发布对象不能放在这里。tmpfs 消耗内存且可能进入交换空间，详见 [tmpfs 挂载](https://docs.docker.com/engine/storage/tmpfs/)。

`EROFS` 提示检查只读文件系统，`EACCES` 提示检查运行 UID/GID、目录属主与权限。改用 root 会掩盖权限设计的问题。镜像准备好后，还需以实际身份解码图片、读取原收据并观察停止过程，确认依赖、数据目标和退出行为一起成立。

## 附录：本支线必要技术点速查

| 现象 | 先检查什么 |
| --- | --- |
| 无 Server 信息 | 引擎、context 与连接权限 |
| 容器已退出 | `docker ps -a`、退出码与 `docker logs` |
| 原生模块加载失败 | Node 版本、CPU 架构、系统库与安装平台 |
| 停止超时或 137 | 主进程、TERM 日志、退出预算与 `OOMKilled` |
| 暂存写入失败 | `/work` 挂载、UID/GID 与容量 |

观察完后，可用 `docker rm epp-container-first epp-signal-demo` 删除两个已停止的实验容器，镜像仍保留。

阅读参考（估算）：约 18～23 分钟。已准备好引擎后，两个独立进程实验另加约 10～15 分钟，不含首次下载镜像与 EPP 镜像构建适配。

[继续：容器的数据、配置与网络](side-02-container-data-network.md) · [本篇导读](README.md)
