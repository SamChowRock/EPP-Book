# 第 65 章 把验过的那份运行制品从验收环境交给发布环境

**章节提要**　承接第 64 章「构建与持续集成」。练习从[已有配套](https://github.com/SamChowRock/epp-public/tree/part-08/chapter-64)的副本开始。

## 65.1 从一次构建取得可运行的归档

先定目标。把 OS、CPU、Linux 的 libc 类型与版本，以及固定的 Node 版本写进交接记录；原生图像模块按这些条件选择二进制。沿用第 64 章构建、Prisma 生成目录与交付检查，在指定系统、架构及 Node 版本的干净目录安装生产依赖，打包 dist、运行清单与这些依赖，包含配置模板所需的非秘密文件。在配套根用 Bash 执行下列步骤。构建环境应匹配目标；例如要做 Debian arm64 包，就在该环境执行。构建使用的配置应指向本次练习实例。

```bash
nvm use
set -e
npm ci && npm run ci:check
umask 077
lab=$(mktemp -d)
release="$lab/payload"
mkdir "$release"
cp -R dist package.json package-lock.json .npmrc "$release/"
(cd "$release" && npm ci --omit=dev)
node -p '[process.platform,process.arch,process.version,process.report.getReport().header.glibcVersionRuntime].join(" ")'
git rev-parse HEAD
tar -czf "$lab/release.tgz" -C "$release" .
tar -tzf "$lab/release.tgz" > "$lab/contents"
head -30 "$lab/contents"
digest() { node -e 'const fs=require("node:fs"),c=require("node:crypto").createHash("sha256");fs.createReadStream(process.argv[1]).on("data",b=>c.update(b)).on("end",()=>console.log(c.digest("hex")))' "$1"; }
digest "$lab/release.tgz"
```

这些步骤使用第 64 章已经进入 dist 的配置资源。打包前检查 .npmrc 只有项目安装选项，生产配置、registry 令牌与调试产物均在 payload 之外；后续新增维护入口时将实际调用的脚本及其导入文件一起交付。tar 包顶层的 dist、node_modules 和清单来自同一候选。保留归档、构建记录及其 SHA-256。

## 65.2 让验收记录指向归档摘要

在验收机另建干净目录，从可信交接记录抄入 `expected`（64 位十六进制），并设置 `archive` 为收到的归档绝对路径。在使用上面的 digest 函数的同一 Bash 中执行：

```bash
unpack_checked() (
  set -eu
  actual=$(digest "$1")
  test "$actual" = "$expected" || { echo '归档摘要不符' >&2; exit 1; }
  mkdir "$2"
  tar -xzf "$1" -C "$2"
)
unpack_checked "$archive" "$lab/accept"
```

在另一台机操作时先建该机自己的私有 lab 并重新定义 digest。目标目录必须尚不存在。进入已解包的 accept，取独立库与桶的配置，验证旧收据查询、API、邮件与通知进程及一次真实图片解码。用 account-admin.js 的 receipt 子命令传入原库名、用户 ID、操作 ID，比对旧收据。启动 API 后从 Postman 发送已有头像预览请求，检查返回 WebP 可实际解码。两个 Worker 按各自角色配置、预期库名运行，邮件仅投练习箱。把请求、进程退出结果和摘要写在同一份验收记录。单独改动另一份归档中的配置资源再封包，交给接收端用原摘要验收，确认它在启动前就能拒绝字节不符的候选。

## 65.3 按同一摘要晋级到第二环境

用独立运行目录、端口、库与桶接受同一份归档；从可信交接记录读取摘要，验后解包，无需重装依赖或再次编译。用该环境自己的旧收据和账号检查数据目标，再核对运行目录对应的发布标识。同机演练可用 `unpack_checked "$archive" "$lab/publish"`。在另一台兼容主机则传递原 tgz，再从前一环境的验收记录取得 expected，不要从候选包旁一同送来的文本自行建立信任。分别从 accept、publish 运行时，记下 `pwd` 与实际配置对应的库名。用第二环境的用户 ID 和原操作 ID 查询收据，防止两个目录连向同一个库。若第二环境产生了新的业务记录，在其原账号下回查；验收环境不应能读回这笔。

## 65.4 保留能实际退回的版本

在兼容数据副本切回上一份已验归档。若此前没有保留通过 65.2 的旧包，在同一目标平台检出第 63 章配套，运行 npm ci 和该版已有的 npm run check 完成类型检查与构建，再从 65.1 的建包步骤继续，按 65.2 验收旧包并保留它自己的摘要。将其解到另一空目录，用同一配置、工作目录、账号和库测试，更新前先正常停止当前进程再启动旧入口。用原会话读资料、用原操作 ID 取收据，再按原顺序切回本次归档。若数据已演进，记录哪条真实读写阻止回退，交发布迁移章处理。换了目标平台，即使 commit 和 dist 都相同，原生库也可能无法加载。第 70 章首次将运行入口交给 Debian 时，若构建端是 Mac，就用原 dist、清单、锁与 .npmrc，在目标兼容环境重新安装生产依赖，另封一个含本平台依赖的包，重算摘要、重做 65.2 后才能在这一平台晋级。第 71 章给运行角色分权时，先核对本章代码对应的制品和迁移，再把同一 release 交给各角色。回滚时也选择该平台自己验过的旧包。后续容器可用镜像摘要表达同一交接关系。

[上一章 · 构建与持续集成](../chapter-64-build-ci/chapter.md) · [下一章 · 调试性能与资源问题](../chapter-66-performance/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
