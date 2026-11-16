# 第九篇 部署与首次交付

第八篇已经得到可以交付的程序。本篇把它放进实际运行的环境，建立独立于操作终端的服务，再把可信的访问入口交给使用者。程序、后台任务与数据共同构成部署，接收请求的地址也要能被真正的客户端访问。

## [第 70 章 把应用和数据交给目标环境](chapter-70-target-environment/chapter.md)

阅读约 20～28 分钟。已有 Debian 和交接数据时，传包、配置与前台验证另加 30～45 分钟。空机安装数据服务和迁移另加 45～85 分钟，下载与复制等待按实际数据量另计。

- [支线 70A　SSH 报主机密钥变化时怎样重新接手](chapter-70-target-environment/side-01-host-key.md)
- [支线 70B　在 Mac 托管服务并追查意外退出](chapter-70-target-environment/side-02-macos-supervision.md)

## [第 71 章 让 API 和后台进程以各自身份持续运行](chapter-71-service-runtime/chapter.md)

阅读约 35～48 分钟。已有上一章的 Debian 前台部署时，迁移、分权、托管、断线重连与一轮缺权恢复另加 65～95 分钟。71C 跟写实现和双会话实验另计。

- [支线 71A　能读资料，为什么预览头像仍会失败](chapter-71-service-runtime/side-01-runtime-diagnostics.md)
- [支线 71B　数据库和桶在另一台机器上，谁维持连接](chapter-71-service-runtime/side-02-private-data-link.md)
- [支线 71C　列授权怎样改变应用访问数据库的方式](chapter-71-service-runtime/side-03-database-roles.md)

## [第 72 章 让客户端通过可信入口访问服务](chapter-72-service-access/chapter.md)

阅读约 30～40 分钟。已有第 71 章部署、可路由私网和练习账号时，签发、配置及客户端交付另加 55～80 分钟。72.4 故障对照另加 15～25 分钟，后台改密核对另加 10～20 分钟。估时按正文、命令和一次顺利操作估算，首次环境准备另计。证书诊断与换证回退按需选读。

- [支线 72A　定位浏览器的证书错误](chapter-72-service-access/side-01-certificate-diagnostics.md)
- [支线 72B　验证签发链并演练换证回退](chapter-72-service-access/side-02-certificate-rotation.md)

## 容器部署与运维重点路线

容器路线从第 70 章的可运行产物出发，连续展开镜像、数据与网络、Compose 和日常运维。第 71 章的角色权限、投递处置与停止约定仍是前提。独立容器实验可以先做；EPP 的 Compose 集成在第 72 章原生 HTTPS 交付之后进行，复用已经验证的入口与历史数据，替换应用后重做同一客户端验收，再在第十篇处理故障、更新与恢复。

- [支线　把运行环境装进镜像](side-01-container-deployment.md)：阅读约 18～23 分钟，独立进程实验另加 10～15 分钟。
- [支线　容器重建后，数据和地址在哪里](side-02-container-data-network.md)：阅读约 20～28 分钟，卷与网络实验另加 25～40 分钟。
- [支线　用 Compose 管理已经验过的服务](side-03-compose.md)：阅读约 18～25 分钟，已有镜像与数据环境时操作另加 35～55 分钟。
- [接续第十篇：接手容器服务的排障、更新与恢复](../part-10-operations/side-01-container-operations.md)：阅读约 22～30 分钟，隔离部署的取证与重建对照另加 30～45 分钟。

以上按正文和一次顺利操作估算，首次下载、EPP 镜像构建适配及数据恢复等待另计。独立 Node 实验可先做；应用层 Dockerfile、Compose 是待按目标环境集成验证的结构示例。

[第八篇导读](../part-08-maintenance/README.md) · [第十篇导读](../part-10-operations/README.md) · [全书目录](../README.md)
