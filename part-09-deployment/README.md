# 第九篇 部署、运行与持续交付

第八篇已经得到可以交付的程序。本篇把它交给目标环境，并持续维护同一套服务：从 Debian 目标环境接手已验制品和配对数据，建立原生托管与可信入口，再演进到镜像和 Compose，随后处理运行观测、定时维护、凭据轮换、备份与兼容升级，最后完成异机恢复、向受邀用户交付公网服务和独立故障接班。

前篇已在本机两套隔离环境之间验收和晋级同一份制品。第 69～71 章建立跨主机的原生部署，保留账号、素材、头像与后台工作的实际证据；第 72～73 章用容器接管同一服务。第 74～76 章继续解决长期运行中怎样发现失败、补回欠账和替换身份；第 77 章先验证恢复材料，第 78 章才在带旧数据的副本发布并回退。第 79 章拿走原主机，验证恢复与外部结果对账；第 80 章把 EPP 部署到开发机之外，由受邀用户通过公网读写并留下交接记录。第 81 章不再预告故障原因，由接班人独立调查报障、恢复服务，并把运行记录交给下一位维护者。

构建与持续集成沿用第 64 章，CPU、查询和等待的定位沿用第 65 章；制品的验收、晋级与旧版保留沿用第八篇第 67 章。这里把它们用于 Debian 私网部署。进入第 79 章的恢复演练时，先备好第 77 章的恢复材料和第 78 章的版本记录，再根据故障条件决定恢复顺序。

## 章节导航

| 章节 | 本章解决的问题 | 阅读入口 |
| --- | --- | --- |
| 第 69 章 把应用和数据交给目标环境 | 把验过的应用和数据搬到 Debian，在新机器上读回原记录 | [阅读正文](chapter-69-target-environment/chapter.md) · [技术点速查](chapter-69-target-environment/chapter.md#附录本章必要技术点速查) |
| 第 70 章 让 API 和后台进程以各自身份持续运行 | 让 API 和后台进程各用自己的账号运行，断开终端后也能继续工作 | [阅读正文](chapter-70-service-runtime/chapter.md) · [技术点速查](chapter-70-service-runtime/chapter.md#附录本章必要技术点速查) |
| 第 71 章 让客户端通过可信入口访问服务 | 让另一台设备通过 HTTPS 登录，并检查证书和访问权限 | [阅读正文](chapter-71-service-access/chapter.md) · [技术点速查](chapter-71-service-access/chapter.md#附录本章必要技术点速查) |
| 第 72 章 把应用和运行环境一起交付 | 在 Docker Desktop 构建镜像，对照重启和重建后文件的去向 | [阅读正文](chapter-72-container-image/chapter.md) · [技术点速查](chapter-72-container-image/chapter.md#附录本章必要技术点速查) |
| 第 73 章 用 Compose 接管已有服务、数据与网络 | 让容器接手 API 和后台进程，再用原账号读回同一笔数据 | [阅读正文](chapter-73-compose-deployment/chapter.md) · [技术点速查](chapter-73-compose-deployment/chapter.md#附录本章必要技术点速查) |
| 第 74 章 通知已经积压，怎样在人来报障之前发现 | 发现积压的通知，沿告警找到卡住的任务 | [阅读正文](chapter-74-observability/chapter.md) · [技术点速查](chapter-74-observability/chapter.md#附录本章必要技术点速查) |
| 第 75 章 定时维护漏跑或同时启动两次以后怎么办 | 从日志分辨漏跑和重复执行，让定时任务恢复工作 | [阅读正文](chapter-75-maintenance-jobs/chapter.md) · [技术点速查](chapter-75-maintenance-jobs/chapter.md#附录本章必要技术点速查) |
| 第 76 章 让 API 和后台进程更换凭据与签名密钥 | 逐个替换服务凭据，再查旧凭据还能做什么 | [阅读正文](chapter-76-rotate-credentials/chapter.md) · [技术点速查](chapter-76-rotate-credentials/chapter.md#附录本章必要技术点速查) |
| 第 77 章 备份 保存的是完整恢复能力 | 把数据库和头像一起备份，在另一份环境中还原并读回 | [阅读正文](chapter-77-backups/chapter.md) · [技术点速查](chapter-77-backups/chapter.md#附录本章必要技术点速查) |
| 第 78 章 发布、迁移与回退 | 让新旧版本访问同一笔素材，检查迁移和程序回退的结果 | [阅读正文](chapter-78-compatible-release/chapter.md) · [技术点速查](chapter-78-compatible-release/chapter.md#附录本章必要技术点速查) |
| 第 79 章 原主机失联以后，哪些业务能先恢复 | 在原机失联时恢复素材和头像，核对一封可能已经寄出的信 | [阅读正文](chapter-79-disaster-recovery/chapter.md) · [技术点速查](chapter-79-disaster-recovery/chapter.md#附录本章必要技术点速查) |
| 第 80 章 用 Northflank 部署 EPP，用 Cloudflare DNS 接入自有域名 | 给服务接上自有域名，让受邀用户从外网上传头像并收取验证邮件 | [阅读正文](chapter-80-public-deployment/chapter.md) · [技术点速查](chapter-80-public-deployment/chapter.md#附录本章必要技术点速查) |
| 第 81 章 第九篇回顾：接手一次原因未知的报障 | 从一份报障开始查找原因，处理故障并保留期间的合法写入 | [阅读提要](chapter-81-operations-review/outline.md) |

## 时间参考

| 章节 | 阅读与跟做 |
| --- | --- |
| 第 69 章 | 阅读约 23～31 分钟。已有 Debian 和交接数据时，传包、配置与前台验证另加 35～50 分钟。空机安装数据服务和迁移另加 45～85 分钟，下载与复制等待按实际数据量另计。 |
| 第 70 章 | 阅读约 39～52 分钟。已有上一章的 Debian 前台部署时，迁移、分权、托管、断线重连与一轮缺权恢复另加 65～95 分钟。70C 跟写实现和双会话实验另计。 |
| 第 71 章 | 阅读约 30～40 分钟。已有第 70 章部署、可路由私网和练习账号时，签发、配置及客户端交付另加 55～80 分钟。71.4 故障对照另加 15～25 分钟，后台改密核对另加 10～20 分钟。首次准备环境和额外排错的时间另计。证书诊断与换证回退按需选读。 |
| 第 72 章 | 阅读约 38～48 分钟，构建、图形观察与机制实验另加 40～55 分钟，首次下载和跨机传送另计。 |
| 第 73 章 | 阅读约 45～55 分钟，已有原生部署与镜像时操作另加 60～90 分钟。 |
| 第 74 章 | 阅读约 22～30 分钟，隔离取证与恢复另加 25～40 分钟；检查器的实现与接收端接入另计。 |
| 第 75 章 | 阅读约 36～48 分钟。已有 Linux 练习机、可登录的副本和配对桶时，原生配置、断点、五分钟等待与恢复另加 50～75 分钟，容器调度接手与失败复查另加 20～30 分钟；首次复制环境和可选的整机关机演练另计。 |
| 第 76 章 | 阅读约 31～43 分钟，已有 HTTPS 副本、账号及受限角色时，原生入口试切、后台对账与撤权另加 55～80 分钟，容器候选配置、逐角色重建与身份核对另加 20～30 分钟。支线 76A 的定向故障另加 25～40 分钟，76B 的旧连接对照另加 10～15 分钟。 |
| 第 77 章 | 阅读约 28～38 分钟，小型副本的授权重建、定时备份与恢复核验另加 60～90 分钟。 |
| 第 78 章 | 阅读约 35～48 分钟，已有恢复副本、受限角色与 HTTPS 入口时，构建与演练另加 75～110 分钟。 |
| 第 79 章 | 阅读约 25～35 分钟；双端准备、演练与验收另加 55～85 分钟。 |
| 第 80 章 | 阅读约 35～45 分钟，首次配置和双端验收约 110～175 分钟，镜像传输、DNS 生效、独立恢复和次日复验另计。 |

## 知识支线

- [支线 69A　SSH 报主机密钥变化时怎样重新接手](chapter-69-target-environment/side-01-host-key.md)
- [支线 69B　在 Mac 托管服务并追查意外退出](chapter-69-target-environment/side-02-macos-supervision.md)
- [支线 70A　能读资料，为什么预览头像仍会失败](chapter-70-service-runtime/side-01-runtime-diagnostics.md)
- [支线 70B　数据库和桶在另一台机器上，谁维持连接](chapter-70-service-runtime/side-02-private-data-link.md)
- [支线 70C　列授权怎样改变应用访问数据库的方式](chapter-70-service-runtime/side-03-database-roles.md)
- [支线 71A　定位浏览器的证书错误](chapter-71-service-access/side-01-certificate-diagnostics.md)
- [支线 71B　验证签发链并演练换证回退](chapter-71-service-access/side-02-certificate-rotation.md)
- [支线 76A　固定来源，让两个实例交叉签发与验证](chapter-76-rotate-credentials/side-01-hmac.md)
- [支线 76B　让旧会话跨过禁止登录的时刻](chapter-76-rotate-credentials/side-02-connections.md)
- [支线 77A　回到误操作之前，再把一条业务记录修回现在](chapter-77-backups/side-01-pitr.md)

[第八篇导读](../part-08-maintenance/README.md) · [上部独立交付](../upper-capstone/chapter-82-booking/outline.md) · [全书目录](../README.md)
