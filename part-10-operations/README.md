# 第十篇 运行、发布与恢复

使用者已经拿到了 EPP 的 HTTPS 地址。今天他能登录，却一直等不到通知。先从他看到的现象查到哪一笔工作停了，再决定该恢复哪个进程。随后在这套仍有新写入的服务上轮换凭据、备份、发布和恢复。

从第 72 章交出的服务开始。第 73 章沿告警找到失约的请求或任务，第 74、75 章分别处理定时维护和凭据轮换，第 76 章在服务完好时准备并验证恢复材料。接着带旧记录升级，最后在失去原主机的条件下接班。第 79 章只先给报障现象，由你决定取证和处置顺序。

## 主线

[第 73 章 通知已经积压，怎样在人来报障之前发现](chapter-73-observability/outline.md)　章节提要

[第 74 章 定时维护漏跑或同时启动两次以后怎么办](chapter-74-maintenance-jobs/chapter.md)　按四节 SQL、两份 unit、三幅运行现场估计，阅读约 30～40 分钟。已有 Linux 练习机、可登录的副本和配对桶时，配置、断点、五分钟等待与恢复另加 50～75 分钟；首次复制环境和可选的整机关机演练另计。

[第 75 章 让 API 和后台进程更换凭据与签名密钥](chapter-75-rotate-credentials/chapter.md)　阅读约 25～35 分钟，已有 HTTPS 副本、账号及受限角色时，入口试切、后台对账与撤权另加 55～80 分钟。支线 75A 的定向故障另加 25～40 分钟，75B 的旧连接对照另加 10～15 分钟。

[第 76 章 备份 保存的是完整恢复能力](chapter-76-backups/outline.md)　章节提要

[第 77 章 发布 迁移与回退](chapter-77-compatible-release/outline.md)　章节提要

[第 78 章 原主机失联以后，哪些业务能先恢复](chapter-78-disaster-recovery/outline.md)　章节提要

[第 79 章 运维回顾：接手一次原因未知的报障](chapter-79-operations-review/outline.md)　章节提要

## 容器运维重点路线

[接手容器服务的排障、更新与恢复](side-01-container-operations.md)承接第九篇的 Compose：从一次失败请求追到进程与依赖，区分 OOM、停止超时和磁盘耗尽，再处理日志保留、镜像替换、迁移回退、凭据轮换和数据恢复。第 73～78 章的业务判断在容器环境继续适用。阅读约 22～30 分钟，已有隔离部署时取证与重建对照另加 30～45 分钟，恢复时间按数据量另计。

## 知识支线

- [支线 75A　固定来源，让两个实例交叉签发与验证](chapter-75-rotate-credentials/side-01-hmac.md)
- [支线 75B　让旧会话跨过禁止登录的时刻](chapter-75-rotate-credentials/side-02-connections.md)
- [支线 76A　回到误操作之前，再把一条业务记录修回现在](chapter-76-backups/side-01-pitr.md)

[第九篇导读](../part-09-deployment/README.md) · [上部独立交付](../upper-capstone/chapter-80-booking/outline.md) · [全书目录](../README.md)
