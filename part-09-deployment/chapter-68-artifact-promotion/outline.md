# 第 68 章 把验过的那份运行制品从验收环境交给发布环境

**章节提要**　第 64 章已经建立构建与持续集成，第 67 章核对过接班人的程序和数据。现在从可运行的目录继续，把一次验收与交给发布环境的那份字节对应起来。练习从[第 66 章配套](https://github.com/SamChowRock/epp-public/tree/part-08/chapter-66)的副本开始，保留第 66 章完整性迁移与维护入口。

本章先在第八篇使用的本机完成同平台演练。验收环境和发布环境分别使用独立运行目录、配置、端口、练习库与配对桶；“发布”在这里表示第二套练习环境，不是日常服务。沿用[第 62 章的配对副本准备](../../part-07-profiles/chapter-62-review/chapter.md)，从同一份已核对的非空数据建立两套副本，分别确认原账号、操作收据和头像字节。邮件只投练习箱，各次验证记录自己的任务 ID；切换环境前正常停止前一组 API 和 Worker，核对下一组配置中的库名与桶端点后再启动。

本机的系统、CPU、运行库和 Node 版本就是这一轮的目标条件，无需先准备 Debian、SSH、systemd 或 HTTPS。第 69 章才把程序和数据送到 Debian，并处理跨平台依赖。本章先验证“接收端拿到的是验过的同一份程序”；[第 78 章](../chapter-78-compatible-release/chapter.md)再讨论数据规则改变、新旧客户端并存时，程序还能退回到哪一版。

## 68.1 从一次构建取得可运行的归档

先记录本机目标。把 OS、CPU、固定的 Node 版本写进交接记录；Linux 还要记录 libc 类型与版本。原生图像模块按这些条件选择二进制。沿用第 64 章构建、Prisma 生成目录与交付检查，在本机干净目录安装生产依赖，打包 dist、运行清单与这些依赖，包含配置模板所需的非秘密文件。在配套根用 Bash 执行下列步骤，构建使用的配置应指向本次练习实例。以后制作 Debian arm64 包时，再在与该目标相容的环境重复这一过程。

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

## 68.2 让验收记录指向归档摘要

在本机另建验收目录，从刚才保存的交接记录抄入 `expected`（64 位十六进制），并设置 `archive` 为原归档的绝对路径。这个摘要要在修改候选包之前独立保留。在使用上面的 digest 函数的同一 Bash 中执行：

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

目标目录必须尚不存在。进入已解包的 accept，取验收副本的库与桶配置，验证旧收据查询、API、邮件与通知进程及一次真实图片解码。用 account-admin.js 的 receipt 子命令传入验收库名、用户 ID、操作 ID，比对该副本的旧收据。启动 API 后从 Postman 发送已有头像预览请求，检查返回 WebP 可实际解码。两个 Worker 沿用已有入口及角色参数、预期库名运行，邮件仅投练习箱；此处沿用前章的练习数据库身份，第 70 章才拆分运行身份与权限。把请求、进程退出结果和摘要写在同一份验收记录。单独改动另一份归档中的配置资源再封包，交给接收端用原摘要验收，确认它在启动前就能拒绝字节不符的候选。

## 68.3 按同一摘要晋级到第二环境

用第二套独立运行目录、端口、库与桶接受原归档；从前一环境的验收记录读取摘要，验后解包，无需重装依赖或再次编译。同机演练执行 `unpack_checked "$archive" "$lab/publish"`。分别从 accept、publish 运行时，记下 `pwd`、实际连接的库名与桶端点，再核对发布标识。用第二环境的用户 ID 和原操作 ID 查询收据，确认复制来的历史仍在；两套副本原本有相同的历史 ID，仅查到旧收据还不能排除连错库。通过第二环境的 API 创建一笔新记录，在原账号下回查，再切回验收环境核对它不能读到这笔。

以后在另一台兼容主机执行时，传递原 tgz，从可信渠道取得前一环境保存的验收摘要；不要仅凭候选包旁一同送来的文本建立信任。在接收机新建自己的私有 lab 并重新定义 digest，再执行同样的校验与解包步骤。

## 68.4 保留能实际退回的版本

在兼容数据副本切回上一份已验归档。若此前没有保留通过 68.2 的旧包，在同一目标平台检出第 63 章配套，运行 npm ci 和该版已有的 npm run check 完成类型检查与构建，再从 68.1 的建包步骤继续，按 68.2 验收旧包并保留它自己的摘要。将其解到另一空目录，用同一配置、工作目录、账号和库测试，更新前先正常停止当前进程再启动旧入口。用原会话读资料、用原操作 ID 取收据，再按原顺序切回本次归档。若数据已演进，记录哪条真实读写阻止回退，交发布迁移章处理。换了目标平台，即使 commit 和 dist 都相同，原生库也可能无法加载。第 69 章首次将运行入口交给 Debian 时，若构建端是 Mac，就用原 dist、清单、锁与 .npmrc，在目标兼容环境重新安装生产依赖，另封一个含本平台依赖的包，重算摘要、重做 68.2 后才能在这一平台晋级。第 70 章给运行角色分权时，先核对本章代码对应的制品和迁移，再把同一 release 交给各角色。回滚时也选择该平台自己验过的旧包。后续容器可用镜像摘要表达同一交接关系。

[上一章 · 第八篇回顾：从维护动作到可交付产物](../../part-08-maintenance/chapter-67-review/chapter.md) · [下一章 · 把应用和数据交给目标环境](../chapter-69-target-environment/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
