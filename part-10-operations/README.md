# 第十篇 运行、发布与恢复

使用者已经拿到了 EPP 的 HTTPS 地址。今天他能登录，却一直等不到通知。先从他看到的现象查到哪一笔工作停了，再决定该恢复哪个进程。随后在这套仍有新写入的服务上轮换凭据、备份、发布和恢复。

从第 74 章经 Compose 接管的服务开始，继续保留原生部署的对照与回退方法。第 75 章沿告警找到失约的请求或任务，第 76、77 章分别处理定时维护和凭据轮换，第 78 章在服务完好时准备并验证恢复材料。接着带旧记录升级，最后在失去原主机的条件下接班。第 81 章只先给报障现象，由你决定取证和处置顺序。

## 主线

[第 75 章 通知已经积压，怎样在人来报障之前发现](chapter-75-observability/chapter.md)　阅读与操作时间见各章正文。

[第 76 章 定时维护漏跑或同时启动两次以后怎么办](chapter-76-maintenance-jobs/chapter.md)　按原生与容器调度定义、SQL 和三幅运行现场估计，阅读约 36～48 分钟。已有 Linux 练习机、可登录的副本和配对桶时，原生配置、断点、五分钟等待与恢复另加 50～75 分钟，容器调度接手与失败复查另加 20～30 分钟；首次复制环境和可选的整机关机演练另计。

[第 77 章 让 API 和后台进程更换凭据与签名密钥](chapter-77-rotate-credentials/chapter.md)　阅读约 31～43 分钟，已有 HTTPS 副本、账号及受限角色时，原生入口试切、后台对账与撤权另加 55～80 分钟，容器候选配置、逐角色重建与身份核对另加 20～30 分钟。支线 77A 的定向故障另加 25～40 分钟，77B 的旧连接对照另加 10～15 分钟。

[第 78 章 备份保存的是完整恢复能力](chapter-78-backups/chapter.md)　阅读约 22～30 分钟，小型副本恢复另加 40～65 分钟。

[第 79 章 发布、迁移与回退](chapter-79-compatible-release/chapter.md)　阅读约 20～28 分钟，隔离发布与回退另加 45～70 分钟。

[第 80 章 原主机失联以后，哪些业务能先恢复](chapter-80-disaster-recovery/outline.md)　章节提要

[第 81 章 运维回顾：接手一次原因未知的报障](chapter-81-operations-review/outline.md)　章节提要

## 知识支线

- [支线 77A　固定来源，让两个实例交叉签发与验证](chapter-77-rotate-credentials/side-01-hmac.md)
- [支线 77B　让旧会话跨过禁止登录的时刻](chapter-77-rotate-credentials/side-02-connections.md)
- [支线 78A　回到误操作之前，再把一条业务记录修回现在](chapter-78-backups/side-01-pitr.md)

[第九篇导读](../part-09-deployment/README.md) · [中部独立交付](../middle-capstone/chapter-82-booking/outline.md) · [全书目录](../README.md)
