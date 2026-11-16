# 第九篇 部署与首次交付

第八篇已经得到可以交付的程序。本篇先在原生环境建立独立于操作终端的服务，交出可信入口；随后从环境差异与重复部署的具体问题演进到容器镜像和 Compose。原生托管与容器部署共同构成本篇正文。程序、后台任务与数据共同构成部署，接收请求的地址也要能被真正的客户端访问。

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

## [第 73 章 把应用和运行环境一起交付](chapter-73-container-image/chapter.md)

从原生托管已经解决的启动、权限与退出问题出发，定位运行库仍随宿主变化的缺口，再用镜像保存同平台运行环境。实际构建完整 Dockerfile，核对原生模块计算、普通身份、可写目录和停止信号。阅读约 30～38 分钟，构建与机制实验另加 25～40 分钟，首次下载另计。

## [第 74 章 用 Compose 接管已有服务、数据与网络](chapter-74-compose-deployment/chapter.md)

保留第 72 章的库、桶与 HTTPS 来源，把三个角色交给 Compose。先解释卷与网络，再建立容器到原生数据服务的私网通路，分角色配置、停止重建，最后从同一客户端验收旧数据。阅读约 45～55 分钟，已有原生部署与镜像时操作另加 60～90 分钟。

[第八篇导读](../part-08-maintenance/README.md) · [第十篇导读](../part-10-operations/README.md) · [全书目录](../README.md)
