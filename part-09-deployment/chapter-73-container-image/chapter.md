# 第 73 章　把应用和运行环境一起交付

第 72 章的 EPP 已经能从可信 HTTPS 入口使用：API、邮件和通知由 systemd 分别托管，数据库权限也按角色拆开。现在要保存一份可以重新部署的版本，问题不再只是“源码是哪次提交”：同一份 dist 在另一台机器上，是否仍有相同的 Node、系统库和原生模块？几个月后换回旧 release，宿主上的运行库可能已经升级。

本章从[第 72 章代码](https://github.com/SamChowRock/epp-public/tree/part-09/chapter-72)继续，把应用及其用户态运行环境构建成镜像，实际检查身份、文件权限、原生依赖与停止过程。原生服务继续处理原有业务；下一章再用 Compose 接管同一套有历史的服务。本章不修改数据库结构，也不启动第二个邮件发送者。

## 73.1 原生托管已经解决什么，镜像补上什么

第 71 章的 systemd 解决了谁启动进程、以哪个身份运行、退出后怎样处理。固定 Node 路径、按锁安装依赖、核对 release 摘要，也已经让原生交付有据可查。继续用脚本管理这些步骤完全可行；若机器环境长期受控，原生服务有直接、容易观察的优点。

但应用会加载 release 之外的文件。EPP 的 argon2 要执行原生密码哈希，sharp 要调用图像处理库；它们受操作系统、CPU 架构、Node 接口和 C 库等条件约束。把 Mac 的 node_modules 原样复制到 Debian，JavaScript 文件虽然还在，二进制模块却未必能加载。即使两边都叫 Linux，换用不同 C 库的发行版，也可能让原先可用的二进制失效。这些差异不会由 package-lock.json 一并固定。

镜像把 Node、应用文件、依赖和所需的用户态系统库作为一份产物保存。部署者取得已验收的内容，再提供该环境自己的配置与数据连接。替换版本时，应用与这些运行文件一起替换，减少逐台重建环境导致的差异。代价也很具体：要维护基础镜像、管理镜像存储，并重新理解容器里的路径和网络。基础镜像升级后，仍要构建与验收新产物，不能以为应用源码没变就无需检查。

这条演进也没有让 systemd 消失。前面它直接启动 Node，后面它仍管理 Docker 引擎和保留在宿主上的数据库、存储与入口；引擎再按容器定义启动 Node。原生 unit 中的运行用户、工作目录、启动参数、日志、重启和停止预算，分别要在容器定义中找到对应安排。某项配置没有迁过去，镜像并不会替作者猜出原来的约束。第 74 章会一项项接管，第十篇再用两种部署方式处理同类故障。

这并不把整台机器装进镜像。Linux 容器共享所在主机的内核；CPU 平台和内核能力仍是部署前提。主机磁盘耗尽、内核故障也不会被镜像隔开。原有权限、业务状态和退出协议继续有效，只是“准备运行文件、创建与停止进程”增加了 Docker 这一层管理。[容器与虚拟机的区别](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/)

## 73.2 先看见镜像、容器与主进程

下面在**第 71 章的 Debian 部署端**操作，保持原生服务运行。按[为容器部署准备引擎与 Compose](../../environment-setup.md#为容器部署准备引擎与-compose)安装并验证 Docker Engine。进入 Bash，先定义本章命令前缀；这里使用 sudo 管理部署端本机引擎，不要求把普通用户加入 docker 组。

```bash
bash
dk() { sudo docker "$@"; }
hostname
uname -m
dk context show
dk version
dk info --format '{{.Name}} {{.OSType}} {{.Architecture}}'
```

先把主机名和架构与第 71 章部署记录对上。`version` 应同时列出 Client 与 Server，`info` 的名称应属于这台部署机，系统为 linux。CLI 只是管理客户端，真正创建容器的是它连接的引擎。只有 Client 时查引擎状态和连接权限；显示另一台主机时先纠正上下文。不要在尚未确认目标时执行后面的构建与删除。Mac 的 Docker Desktop 同样能做机制实验，但 Linux 容器运行在它管理的 Linux 虚拟机里，不能把 Mac 内核当成部署端内核。

先取得与项目 engines.node 一致的基础镜像，再把可变标签解析成这次取得的内容摘要。下面都在同一个 Bash 中执行：

```bash
dk pull node:24.22.1-bookworm-slim
NODE_IMAGE=$(dk image inspect --format '{{index .RepoDigests 0}}' \
  node:24.22.1-bookworm-slim)
printf '%s\n' "$NODE_IMAGE"
dk run --rm "$NODE_IMAGE" node --version
dk run --name epp73-first "$NODE_IMAGE" \
  node -e 'console.log({pid:process.pid,os:process.platform,arch:process.arch})'
dk ps -a --filter name=epp73-first
dk inspect --format '{{.State.Status}} {{.State.ExitCode}}' epp73-first
```

`NODE_IMAGE` 应是带 `@sha256:` 的仓库引用，Node 应输出 v24.22.1。不要用示例摘要填空。拉取失败时核对仓库、网络与目标架构，不能悄悄换成 latest 绕过项目版本。最后应看到 Linux、对应 CPU 架构、PID 1，以及 `exited 0`。普通 `ps` 不列出已退出容器，所以这里加 `-a`。它完成了一次命令，退出是正常结果；用 `dk logs epp73-first` 仍能读到刚才的输出。

为什么进程号是 1？内核的**命名空间（namespace）**让进程看到自己的进程编号、挂载和网络视图；宿主看到的它仍是一个宿主进程，编号可以不同。文件视图以镜像的只读层为底，再加这个容器自己的可写层。重新启动同一容器仍能看到该层，删除后重建则换一层。进入容器手改代码只修了这一份实例，下一次重建会丢失，修复应回到源码再构建。

隔开视图也不等于分配了独占资源。**cgroup** 负责按进程组统计和限制 CPU、内存等资源；没有配置限额，容器仍可能与同机服务争抢资源。后面的实验明确给限额，不从“它在容器里”推断已经受限。[Docker 资源约束](https://docs.docker.com/engine/containers/resource_constraints/)

## 73.3 从构建输入推导 Dockerfile

在部署端一份干净的第 72 章配套源码目录中跟写。它是构建输入，不是正在使用的 release 或数据目录。在**配套仓库根目录**新建 `Dockerfile` 和 `.dockerignore`；运行说明与后续配置放在 `examples/container-deployment`。先写 `.dockerignore`：

```text
# Only the following source/build inputs may enter the build context.
**
!Dockerfile
!.dockerignore
!package.json
!package-lock.json
!.npmrc
!prisma.config.ts
!tsconfig.json
!tsconfig.build.json
!prisma/
!prisma/**
!scripts/
!scripts/**
!src/
!src/**
!config/
!config/service.json
# Generated clients are recreated on the target platform by prebuild.
src/generated/
src/generated/**
```

构建命令末尾的点表示把当前目录当作“构建上下文”，构建器可以从中 COPY 文件。这里先排除全部文件，再用感叹号放行构建必需的目录；config 只放行公开的 service.json，生成的 Prisma 客户端由构建时重新生成。还须检查获准进入的源码目录没有凭据或业务数据。后面的 COPY 再逐项选择输入。把秘密 COPY 进去后另起一层删除，旧层仍可能保留内容，因此生产配置从一开始就不参加构建。

Dockerfile 如下。这里的 Python、make、C++ 编译器只装进构建阶段，为原生模块需要从源码编译时提供工具，不要求在宿主另装一套，也不用于编写随书脚本。

```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_IMAGE=node:24.22.1-bookworm-slim
FROM ${NODE_IMAGE} AS base
RUN node -e 'if (process.versions.node !== "24.22.1") process.exit(1)' \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/epp

FROM base AS build
# Native modules are installed for this Linux image, never copied from the host.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY prisma.config.ts tsconfig.json tsconfig.build.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY src ./src
COPY config ./config
# prebuild generates the Prisma TypeScript client offline; build also copies assets.
RUN npm run build

FROM build AS production-deps
RUN npm prune --omit=dev

FROM base AS runtime
ENV NODE_ENV=production
RUN mkdir -p /work \
    && chown 10001:10001 /work \
    && chmod 0700 /work
COPY --from=production-deps /opt/epp/node_modules ./node_modules
COPY --from=build /opt/epp/dist ./dist
COPY package.json ./package.json
USER 10001:10001
WORKDIR /work
STOPSIGNAL SIGTERM
ENTRYPOINT ["node", "--enable-source-maps"]
CMD ["/opt/epp/dist/src/server.js"]
```

先看依赖安装的位置。若先 COPY 全部源码，再 npm ci，改一行业务代码也会使后面的安装重新执行。这里先复制清单，再安装，源码改变时便有机会复用依赖安装结果。缓存取决于指令和输入，并不会因为上游系统包仓库更新就自动失效。更新基础环境时应有意取得新基础摘要，必要时让安装步骤重新执行；“命中缓存”只说明能复用，不能证明内容最新。[构建缓存的失效规则](https://docs.docker.com/build/cache/invalidation/)

接着看阶段边界。`npm run build` 的 prebuild 会生成 Prisma 客户端，再编译 TypeScript，并把 service.json 复制到 dist/config。生成客户端不需要连接业务数据库。运行时需要完整 dist、package.json 的模块类型声明，以及生产依赖。production-deps 在构建结果上执行 `npm prune --omit=dev`，按生产依赖关系裁剪已有安装。这里不能把“列在 devDependencies”直接等同于“最终一定消失”：这套 Prisma Client 同时把 Prisma CLI 与 TypeScript 声明为可选 peer，实际依赖树会保留它们。可以在对应安装目录用 `npm explain prisma`、`npm explain typescript` 查看是谁仍需要它们；不能为凑体积直接删除包目录。sharp 的平台包属于 optional 依赖，也不能统一省略。最后一段从 base 重新开始，只复制选定产物，构建阶段安装的 Python、make、g++ 不会整体带入运行镜像。应用仍直接执行编译后的 Node 入口，随包存在某个工具不等于要在启动时调用它。迁移仍使用前文独立交付的迁移工具与身份，不能让 API 因为要启动就自动取得迁移权限。[多阶段构建](https://docs.docker.com/build/building/multi-stage/)

base 还安装公开 CA 证书集合，让运行时具备系统信任材料；第 72 章的私有练习根要在启动时另行挂载，不能把签发私钥放进镜像。所有阶段使用相同的基础镜像和当前目标平台，避免在一种系统库上安装、换到另一种环境运行。arm64 上构建的产物不能直接当成 amd64 产物交付；多平台镜像实际保存多份平台产物。需要跨平台发布时，应分别构建和验收，不能把一次模拟构建成功当作另一架构的业务验收。

## 73.4 用实际运算检查镜像，而不只打印版本

在刚才的源码根目录执行，`NODE_IMAGE` 沿用 73.2 的摘要：

```bash
dk build --build-arg NODE_IMAGE="$NODE_IMAGE" \
  -f Dockerfile -t epp:chapter-73 .
EPP_IMAGE=$(dk image inspect --format '{{.Id}}' epp:chapter-73)
printf '%s\n' "$EPP_IMAGE"
dk run --rm "$EPP_IMAGE" --version
dk image inspect --format '{{.Os}}/{{.Architecture}} {{.Config.User}} {{.Config.WorkingDir}}' \
  "$EPP_IMAGE"
```

这里 `ENTRYPOINT` 已经指定 Node，镜像名后面的 `--version` 会替换默认 CMD，实际执行 Node 的版本检查。最后应显示当前 Linux 平台、`10001:10001` 和 `/work`。构建失败时从第一个失败步骤看起：npm 的 engines 错误查 Node 版本，COPY 找不到文件查工作目录与上下文，原生编译报错查该模块及目标系统，不能只反复重跑最后一条命令。

版本正确仍可能缺少动态库。下面在镜像内实际哈希、验证一次密码，并生成、解码一张 WebP。`--network none` 让这次检查不接任何库、桶或邮箱；`--workdir /opt/epp` 让临时脚本能解析这里的 node_modules。

```bash
dk run --rm --network none --workdir /opt/epp "$EPP_IMAGE" \
  --input-type=module -e '
import argon2 from "argon2";
import sharp from "sharp";
const hash = await argon2.hash("container-probe-only");
if (!await argon2.verify(hash, "container-probe-only")) throw Error("hash failed");
const webp = await sharp({create: {
  width: 16, height: 16, channels: 3, background: "#247c69"
}}).webp().toBuffer();
const result = await sharp(webp).raw().toBuffer({resolveWithObject: true});
if (result.info.width !== 16 || result.info.height !== 16) throw Error("decode failed");
console.log({hashVerified: true, decoded: "16x16", uid: process.getuid()});'
```

预期是 `hashVerified: true`、`decoded: '16x16'` 和 UID 10001。它证明这份镜像上的两条原生调用确实工作；EPP 的登录策略、上传限制和历史头像仍要在下一章通过原接口验证。`ERR_DLOPEN_FAILED` 等加载错误优先核对架构、基础系统与依赖安装阶段；网络断开不会解释本段纯本地运算的加载失败。

`epp:chapter-73` 是可重新指向别处的标签，`EPP_IMAGE` 则固定本机这次镜像的 ID。仓库摘要和本地 ID 不是同一种引用：本地构建镜像的 RepoDigests 可能为空。跨机发布要把已验收镜像交给仓库或导出交付，并记录内容与平台；不能让每台部署机重新构建一次再仅凭标签认作同一份产物。下一章先在本部署机使用这次已经检查的镜像。

## 73.5 普通身份怎样写暂存，主进程怎样退出

原生部署已经区分只读 release 与可写 work。镜像仍应如此：`/opt/epp` 的文件由 root 拥有，Node 以 UID/GID 10001 运行，工作目录是权限为 0700 的 `/work`。账号名不是权限判断依据；挂载宿主目录时，内核核对的是数值身份与权限。

下面用同一镜像启动独立长进程。`--read-only` 禁止根文件系统写入；tmpfs 在 `/work` 提供有容量上限的临时存储，覆盖镜像原有目录，因此必须再次指定属主和权限。`--memory` 限制容器内存，tmpfs 也消耗内存；这组数值只服务于这个小实验，不是 EPP 的生产容量结论。

```bash
dk run -d --name epp73-signal --network none \
  --read-only --memory 128m --cpus 0.5 \
  --tmpfs /work:rw,nosuid,nodev,noexec,size=16m,uid=10001,gid=10001,mode=0700 \
  "$EPP_IMAGE" --input-type=module -e '
import {writeFileSync, rmSync} from "node:fs";
writeFileSync("/work/probe", "temporary");
try { writeFileSync("/opt/epp/probe", "unexpected"); }
catch (error) { console.log("application files", error.code); }
const timer = setInterval(() => {}, 1000);
process.once("SIGTERM", () => {
  rmSync("/work/probe");
  console.log("TERM received; temporary file removed");
  clearInterval(timer);
});
console.log("ready", {pid: process.pid, uid: process.getuid()});'
dk logs epp73-signal
```

先看日志，确认写应用目录被拒，并出现 `ready` 与 UID 10001。日志中 `EROFS` 指向只读文件系统，`EACCES` 指向身份或权限；把用户改成 root 会掩盖后一种问题。若 `/work/probe` 就写失败，检查 tmpfs 是否挂到了 `/work`，以及挂载参数里的 UID/GID。看到 ready 后再停止，避免在应用尚未安装信号处理器时结束实验。

```bash
dk stop --timeout 40 epp73-signal
dk logs epp73-signal
dk inspect --format '{{.State.Status}} {{.State.ExitCode}} {{.State.OOMKilled}}' \
  epp73-signal
```

应该看到 TERM 处理日志及 `exited 0 false`。Docker 向主进程发送停止信号，等期限到了才强制 KILL。数组形式 ENTRYPOINT 让 Node 直接接收信号，避免把未转发信号的 shell 留在它前面。PID 1 还有回收孤儿子进程等职责，复杂子进程场景可使用 `--init`，但它不能替应用完成业务排空。[停止行为](https://docs.docker.com/reference/cli/docker/container/stop/)与 [ENTRYPOINT](https://docs.docker.com/reference/dockerfile/#entrypoint)

若得到 137，先查 OOMKilled，再对照停止耗时与日志，区分内存终止、超时 KILL 或其他外部 KILL，不能单凭退出码说“内存不足”。本实验只验证信号路径；EPP 仍需先拒收新工作、处理在途请求、关闭资源，容器停止期限必须覆盖这些已有预算。邮件发送结果未知时仍保留人工核对，不能因换了托管方式就无限重启重发。

## 73.6 镜像完成之后，服务还缺什么

现在得到的是可检查、可替换的运行产物。原生 systemd 配置里写着的数据库、S3、SMTP 地址与分角色身份没有自动搬进来；容器的回环也不会自动指向宿主服务。若此时直接执行默认 API 入口，缺配置或连不上库并不意味着镜像里的 Node 坏了，应先区分“产物能运行”与“服务已经接入正确环境”。

同一镜像可以运行 API，也可以把 CMD 换成 mail-worker.js 的邮件或通知入口。它们仍是独立进程、独立配置与权限，不能因为复用了镜像就合成一个共享高权限账号。已发布头像和数据库数据不能落在容器可写层或 tmpfs 中；下一章从这些具体位置开始，将持久数据、配置、网络和角色入口写进 Compose，接回原 HTTPS 地址并核对旧业务。

结束本章时，只删除两个已停止的实验容器，保留 EPP 镜像与原生服务：

```bash
dk rm epp73-first epp73-signal
```

中途退出终端后，重新确认主机、定义 dk，再用 `dk ps -a --filter name=epp73-` 找到实验状态；不要直接以同名创建第二份。继续下一章前，从 `epp:chapter-73` 重新取得镜像 ID，并与本章记下的值比较，避免标签已经指向后来构建的内容。

## 附录：本章必要技术点速查

| 名称 | 本章用途 | 必要注意点 |
| --- | --- | --- |
| 镜像、容器 | 保存运行文件、创建进程实例 | 只读层可以共享，可写层属于实例 |
| namespace、cgroup | 隔开视图、统计和约束资源 | 共享内核；未设限额不代表资源已隔离 |
| `.dockerignore`、COPY | 限制构建输入 | 秘密不进入上下文；不复制宿主 node_modules |
| 多阶段构建 | 分开构建工具与运行产物 | 保留整个 dist、生产依赖和 package.json |
| 标签、ID、仓库摘要 | 命名与确认镜像内容 | 标签可变；本地 ID 不等于可拉取的仓库摘要 |
| USER、WORKDIR、tmpfs | 普通身份与头像暂存目录 | 挂载后重核 UID/GID；临时数据不能充当持久数据 |
| ENTRYPOINT、CMD | 直接启动 Node、选择角色入口 | 镜像名后参数替换 CMD，不替换 ENTRYPOINT |
| logs、inspect、stop | 读输出、状态和停止结果 | 退出 0 可以正常；137 需要进一步取证 |

命令细节参阅 [docker run](https://docs.docker.com/reference/cli/docker/container/run/)、[Dockerfile](https://docs.docker.com/reference/dockerfile/)、[tmpfs](https://docs.docker.com/engine/storage/tmpfs/)；缓存和停止语义的官方依据见各节。

阅读参考（估算）：正文与代码约 30～38 分钟；准备好引擎后的构建、两组机制实验及原生依赖检查约 25～40 分钟，不含首次下载与网络等待。

[上一章：让客户端通过可信入口访问服务](../chapter-72-service-access/chapter.md) · [下一章：用 Compose 接管同一套服务](../chapter-74-compose-deployment/chapter.md) · [本篇导读](../README.md) · [本章完成代码](https://github.com/SamChowRock/epp-public/tree/part-09/chapter-73)
