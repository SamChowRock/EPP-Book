# 第 77 章　备份保存的是完整恢复能力

第 76 章已经能让新身份接手原库。现在设想原主机的磁盘明天不可读：镜像归档或仓库仍在，Compose 文件仍在，能否恢复原账号、素材和头像？镜像只保存程序，配置只说明怎样启动；真正的业务历史还在数据库和桶中。本章沿用已有应用版本，在原生数据服务上取得共同恢复点，再在隔离目标还原。应用由 systemd 还是 Compose 托管，不改变这份数据责任。

## 77.1 从一张收据倒推要保存什么

先从旧账号挑一张收据和当前头像，保存其 ID、原查询结果、对象键、内容类型与下载字节的 SHA-256。不要只记“库里有几行”：同样行数也可能对应不同数据。接班时还需要数据库角色授权、应用签名密钥、对象存储身份、运行配置、证书和对应的程序产物。密钥独立保管，备份清单只记录取用位置与版本，不贴明文。

约定可以损失多久的数据，是恢复点目标 RPO；从事故发生到业务恢复允许多久，是恢复时间目标 RTO。例如每晚备份一次，即使任务全绿，也可能丢近一天写入。恢复需要两小时就不能承诺半小时恢复。最终判断依据是最近一份**实际能恢复且已到异地**的副本，以及从取回到业务核验的用时。

容器还容易制造一种错觉：重建后数据仍在，所以已经有备份。命名卷在容器删除后可以保留，但仍可能只在同一块磁盘上；`docker image save` 保存镜像，不包含挂载卷，`docker commit` 也不会把卷收入镜像。第 73 章的数据库和桶仍在宿主原生服务中，应用容器的 `/work` 是临时区，既不能保存唯一业务副本，也不应当备份成业务数据。[卷的生命周期](https://docs.docker.com/engine/storage/volumes/)

将来把数据服务容器化，必须核对程序真正的数据目录与挂载目标。换 Compose 项目名后若创建了新卷，数据库可能正常启动却是一套空库；要用旧收据确认数据身份。卷名、挂载和存储权限属于恢复定义，容器 running 不能替代这些证据。

## 77.2 先取得库与桶的共同恢复点

`pg_dump` 可以在数据库运行时取得一致的逻辑快照，但它不会协调外部对象存储。若先导出头像指针，随后清理任务删除旧对象，再复制桶，就可能保存一个指向不存在字节的引用。本章的小规模方案使用停写窗口，让数据库与桶在同一段无业务变化的时间内取得副本。[PostgreSQL 18 逻辑备份](https://www.postgresql.org/docs/18/backup-dump.html)

在独立练习部署先通知使用者进入维护窗口，停止新请求，等在途上传和数据库事务结束，再停 API、邮件、通知和清理调度。原生部署执行 `sudo systemctl stop epp72-api epp72-mail epp72-notify`；容器部署执行 `sudo docker compose --project-directory /opt/epp-container --env-file /opt/epp-container/compose.env -f /opt/epp-container/compose.yaml stop api mail notify`。停止第 75 章当前启用的清理 timer：原生是 `epp-avatar-clean.timer`，容器是 `epp-container-clean.timer`；若两者都存在就逐一确认停用。等待已经启动的清理 service 和实际一次性容器结束。记录邮件是否留下 unknown；停止进程不能改变外部服务器可能已经收信的事实。按第 76 章的活动查询确认没有旧写入者，别漏掉另一台机器或手动 CLI。

数据库继续运行。执行 `sudo systemctl stop epp-store`，再用 `systemctl show epp-store -p MainPID -p ActiveState -p SubState` 确认主进程为 0、服务 inactive，核对原 S3 端口已无监听并确认实际 SeaweedFS 进程已退出，随后复制完整的单机 mini 存储目录；只有一个服务包装进程退出，不足以证明全部子进程已停。沿用[第 69 章数据接手步骤](../../environment-setup.md#在-debian-接手已有的数据库桶和收件箱)核对目录，它须包含 Filer 元数据、Volume 内容、配置和身份文件。复制活 PostgreSQL 数据目录或只复制 SeaweedFS 的部分字节文件，都不能替代这里的备份。

在 Debian 部署者的 SSH 终端，先确认[PG18 备份工具](../../environment-setup.md#用备份建立练习副本)可用。以下 source_db 填本轮实际库名；示例端口沿用原生部署的 55471，修改过端口则同步替换。

```bash
umask 077
backup_dir=$(mktemp -d "$HOME/epp-backup-XXXXXX")
source_db=epp_ch72_handoff
psql -X -h 127.0.0.1 -p 55471 -U epp_owner -W -d "$source_db" \
  -c 'SELECT current_database(), current_user, inet_server_port();'
pg_dump -h 127.0.0.1 -p 55471 -U epp_owner -W -d "$source_db" \
  --format=custom --file="$backup_dir/epp.dump"
```

先读身份查询再运行导出，`-W` 交互输入口令，`custom` 生成供 pg_restore 读取的归档。只有退出 0 且没有未处理告警才继续；失败可能留下文件，文件存在不是成功证明。不要用管道末端压缩程序的退出码代替 pg_dump 结果。

本书原生 SeaweedFS 的完整目录固定如下；自定义部署先从已核对的启动定义确认路径：

```bash
sudo tar -czf - -C /opt/epp-data/.chapter51-store . > "$backup_dir/store.tgz"
(cd "$backup_dir" && sha256sum epp.dump store.tgz > SHA256SUMS)
pg_restore --list "$backup_dir/epp.dump" > "$backup_dir/archive-list.txt"
```

tar 读取停妥后的目录，重定向由当前用户写入私有备份目录。检查每条命令退出状态；`--list` 能发现一部分归档问题，却没有证明每张表和每个对象都可恢复。记录停写起止时刻、库名、PG 与 SeaweedFS 版本、程序摘要、配置版本和旧样本清单。用 `sudo systemctl start epp-store` 启动存储，查看其日志和监听并核对旧对象，恢复 API、通知与本轮实际使用的清理调度；邮件只有完成未决投递核查后才恢复。备份失败也要按这些核对恢复正常服务，同时记录本次没有新增可用恢复点。

## 77.3 副本必须离开原故障范围

把数据库、存储归档、摘要和恢复说明送到另一台有独立存储的受控主机。使用第 69 章已验证主机身份的 SSH/scp 通道；在接收端创建新的 0700 目录，目标存在就另取名称，不覆盖上一份好备份。发送前后分别检查摘要，原样保存源端独立记录的摘要。摘要能检出传输损坏，但若攻击者能同时改文件和摘要，它不能证明来源可信。

SSH 保护传输，不自动保护落盘副本。备份含账号数据、对象存储凭据和可能的敏感正文，接收处应有加密存储和最小读取权限。采用备份系统的认证加密时，例如 AES-256-GCM，密文的认证标签用于拒绝被篡改内容；同一密钥下 nonce 必须保持唯一，不能照抄固定 nonce 写一个“加密脚本”。加密密钥和恢复授权须在原主机失效后仍能取到，且与备份分开管理。本章不假设一个尚未配置的加密备份服务已经存在。

从恢复端实际取回一份副本、验证摘要并完成解密，才知道保管流程可用。在副本上故意改变一个字节，预期摘要或认证校验失败；不能把损坏副本继续送进恢复流程。保留原始好副本作为对照。定期任务也必须把复制、校验和恢复抽查的结果纳入完成条件；只看到本地导出成功不足以更新“最近可恢复时点”。

## 77.4 在空目标恢复，保留原权限边界

本节选一台全新的隔离 Debian 主机，按环境指南建立 18/epp 实例、55471 端口及原生数据程序；它不是原服务主机。这样可以复用已说明的路径与端口而不碰原数据。恢复期间 API 尚不对外，邮件、通知与清理都停止。先建 `epp_owner` 及第 70 章的受限角色，在该恢复实例的管理 psql 中核对 `\conninfo`、`\du`、`\l`，再执行 `CREATE DATABASE epp_restore_check OWNER epp_owner;`。名称已存在则另选空库，不覆盖，也不要先跑迁移或 seed。

在恢复主机进入本次取回的私有备份目录，先执行 `sha256sum -c SHA256SUMS`，两份归档均应为 OK；再用上一节身份查询将库名明确改为 epp_restore_check，确认 host 与 port 指向恢复实例，随后执行：

```bash
pg_restore -h 127.0.0.1 -p 55471 -U epp_owner -W \
  -d epp_restore_check --single-transaction --exit-on-error \
  --no-owner --no-privileges ./epp.dump
```

归档建立表、数据和迁移历史；单事务遇错回滚，不向半恢复的库继续启动应用。`--no-owner --no-privileges` 由恢复 owner 建对象，不复制原访问控制；之后从配套源码根，以 owner 在 epp_restore_check 设置 `expected_db`，执行 `examples/service-roles/grants.sql`；维护和收据身份另按第 75～76 章恢复授权及新角色成员关系。分别验证允许查询与禁止越权，不把第 69 章临时共享身份重新用于三个服务。否则“恢复成功”可能只对管理员成立。单库归档本身也不包含集群角色及其密码。

存储在这台新主机上恢复到 `/opt/epp-data/.chapter51-store`，用第 69 章的 `epp-store` 系统身份、`/opt/epp-data/start-store.sh` 和同版本二进制。先停止该机 epp-store，确认目录未放入其他数据；若已非空，停止并检查，不直接解包覆盖。在备份目录执行：

```bash
sudo install -d -m 0700 -o epp-store -g epp-store /opt/epp-data/.chapter51-store
sudo -u epp-store tar --no-same-owner -xzf - -C /opt/epp-data/.chapter51-store < store.tgz
sudo systemctl start epp-store
systemctl status epp-store --no-pager
```

解包通过 stdin 交给受限身份，不要求它遍历管理员的私有备份目录。启动脚本从 WorkingDirectory 找 `.chapter51-tools/weed` 与 `.chapter51-store`，因此保留环境指南里的目录和链接。失败先看 `sudo -u epp-store tail /opt/epp-data/.chapter51-store/weed.log`，不可初始化新桶来绕过旧数据错误。此处冷复制只适用于前章的单机 mini 布局；多节点或其他对象服务须采用对应的快照、复制与元数据恢复办法，不能把这个 tar 命令推广过去。

容器应用在新主机按 73.2 重建所需 external 网络，按 73.3 准备数据监听、SCRAM 规则及容器的名称与 CA 信任，再使用专用部署目录和项目。仅复制 compose.yaml 不会创建 external 网络，也不会修改宿主数据库监听。配置只指向恢复库、恢复桶及练习收件端；先核对数据库地址、期望库名、S3 地址和发布端口，再启动受限 API。不能仅换项目名却继续挂载生产配置。原生部署同样使用新配置和独立工作目录。按原 ID 比对收据字段，使用原账号读素材，下载原头像核对字节摘要、内容类型和访问权限，再创建一笔新记录并重新读取。

另复制一份恢复目标，用该练习桶的对象接口删除一个已确认的当前对象，预期数据库仍能查询但对象下载失败。这说明只有行数和 API 探针的验收会漏掉库桶错配。从好副本重新恢复这一试验目标后再核验；不要在唯一好备份或原服务上做破坏实验。通知按原 ID 区分已完成和待处理，邮件 unknown 保留原处置记录，不因换主机重新发送。

## 77.5 用失败检验保留策略

在练习定时备份中故意使用不可写的输出目录，确认任务失败、接收端有提示，并且“最近可恢复备份”仍指向上一份成功副本。任务根本没有运行时不会自己报告失败，因此独立检查处还要监测最新成功时刻是否过旧。失败清理只删除本轮临时文件，不能顺手删除最后一份好备份。

按实际业务量制定日、周保留策略，删除旧副本前确保仍满足所需恢复点。恢复记录至少包含取回、解密、还原、授权、业务核验各段用时和仍需人工解决的未决投递。停写窗口只是备份影响，不能冒充整个恢复时间。若目标要求更短的数据损失区间，接着用 77A 的物理基础备份与连续 WAL 学习按时间恢复，同时仍需协调对象数据。

## 本章支线

[77A　回到误操作之前，再把一条业务记录修回现在](side-01-pitr.md)

## 附录：必要技术点速查

| 保存内容 | 恢复时承担的职责 |
| --- | --- |
| 镜像或原生产物 | 重建同一程序与运行库 |
| 配置、身份、授权 | 连接正确目标并恢复最小权限 |
| 逻辑归档与存储副本 | 恢复记录、对象与相互引用 |
| 卷 | 保存活数据，不自动提供异地恢复 |
| 摘要／认证加密 | 检出变化／保护内容并验证完整性 |
| RPO／RTO | 可接受损失区间／可接受服务中断 |

按两类数据、备份命令与恢复判断估算，阅读约 22～30 分钟；小型隔离副本的备份、迁移、恢复与核对另加 40～65 分钟，异地传输时间随大小另计。

[上一章 · 更换凭据与签名密钥](../chapter-76-rotate-credentials/chapter.md) · [下一章 · 发布、迁移与回退](../chapter-78-compatible-release/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
