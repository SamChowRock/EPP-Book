# 后端开发实践

如果你已经会写 JavaScript，也和后端一起调过接口，这次可以从接口的另一端写起。假设你在学英语，想记下自己说过的一句话，等有了更合适的说法，再把它收进练习本。你会从空目录写出接收原文的第一个接口，逐步让每个用户都能找回自己的原话和选中的表达。

[上部](#上部-开发一个后端服务)（第 1～82 章）从第一个 HTTP 接口写到部署、维护和故障恢复，最后独立交付一个预约服务。[下部](#下部-在已有服务上演进产品能力)（第 83～113 章）接着扩展英语学习工具，让用户可以请模型给出修改建议、搜索收录过的表达、做练习，也能在 Agent 对话中完成这些操作。最后再处理账号注销后的数据。

第一次跟做，可以先打开[开发环境配置（macOS）](environment-setup.md)。平时用开发模式启动服务，在 Postman 保存请求。改完代码，等服务自动重启，再发一次同样的请求，就能看到改动的效果。

## 上部 开发一个后端服务

### [第一篇 先运行起来：从浏览器走进 Node.js](part-01-nodejs/README.md)

#### [第 1 章 保存一句英语之后](part-01-nodejs/chapter-01-epp/chapter.md)

#### [第 2 章 完成第一次 HTTP 往返](part-01-nodejs/chapter-02-first-http/chapter.md)

#### [第 3 章 可靠接收请求正文并保存原文](part-01-nodejs/chapter-03-minimal-service/chapter.md)

#### [第 4 章 Node.js 程序究竟运行在哪里](part-01-nodejs/chapter-04-node-runtime/chapter.md)

#### [第 5 章 事件循环如何影响服务的响应能力](part-01-nodejs/chapter-05-event-loop/chapter.md)

#### [第 6 章 TypeScript 如何变成可运行的服务](part-01-nodejs/chapter-06-typescript/chapter.md)

#### [第 7 章 第一篇回顾：把服务搬离开发目录](part-01-nodejs/chapter-07-review/chapter.md)

### [第二篇 用 Nest 组织一个可持续扩展的服务](part-02-nestjs/README.md)

#### [第 8 章 从手写服务走向 Nest](part-02-nestjs/chapter-08-enter-nest/chapter.md)

#### [第 9 章 Controller 定义系统的 HTTP 入口](part-02-nestjs/chapter-09-controllers/chapter.md)

#### [第 10 章 Provider 与依赖注入：把组件组装交给容器](part-02-nestjs/chapter-10-providers/chapter.md)

#### [第 11 章 Module 建立清楚的业务边界](part-02-nestjs/chapter-11-modules/chapter.md)

#### [第 12 章 建立可信的输入与错误边界](part-02-nestjs/chapter-12-contracts/chapter.md)

#### [第 13 章 请求经过 Nest 时发生了什么](part-02-nestjs/chapter-13-request-pipeline/chapter.md)

#### [第 14 章 配置与生命周期：让应用可靠地启动和退出](part-02-nestjs/chapter-14-configuration-lifecycle/chapter.md)

#### [第 15 章 第二篇回顾：沿一次请求解释职责与生命周期](part-02-nestjs/chapter-15-review/chapter.md)

### [第三篇 持久化与结构演进：PostgreSQL、SQL、Prisma](part-03-postgresql/README.md)

#### [第 16 章 两次都写成功，JSON 文件里为什么少了一条素材](part-03-postgresql/chapter-16-json-file/chapter.md)

#### [第 17 章 PostgreSQL 运行环境：安装、连接与实例管理](part-03-postgresql/chapter-17-postgresql-environment/chapter.md)

#### [第 18 章 关系建模：为已有记录设计第一组表](part-03-postgresql/chapter-18-relational-modeling/chapter.md)

#### [第 19 章 SQL：查询、筛选和修改自己的记录](part-03-postgresql/chapter-19-sql/chapter.md)

#### [第 20 章 Prisma：将已有表纳入 Schema 与迁移管理](part-03-postgresql/chapter-20-prisma/chapter.md)

#### [第 21 章 让记录接口读写已有的 PostgreSQL 数据](part-03-postgresql/chapter-21-existing-records/chapter.md)

#### [第 22 章 管理连接池、等待与服务关闭](part-03-postgresql/chapter-22-prisma-nest/chapter.md)

#### [第 23 章 Migration：给已有记录增加中文意图](part-03-postgresql/chapter-23-migrations/chapter.md)

#### [第 24 章 第三篇回顾：带着旧记录完成一次结构演进](part-03-postgresql/chapter-24-review/chapter.md)

### [第四篇 业务一致性：修订、候选、事务与采纳](part-04-consistency/README.md)

#### [第 25 章 关系演进：从覆盖输入到保留修订历史](part-04-consistency/chapter-25-revisions/chapter.md)

#### [第 26 章 状态机与关系建模：修订如何进入候选确认](part-04-consistency/chapter-26-candidates/chapter.md)

#### [第 27 章 事务：让多次修改成为一次业务动作](part-04-consistency/chapter-27-transactions/chapter.md)

#### [第 28 章 并发控制：两个请求同时到来怎么办](part-04-consistency/chapter-28-concurrency/chapter.md)

#### [第 29 章 幂等与审计：响应丢失后如何安全重试](part-04-consistency/chapter-29-idempotency/chapter.md)

#### [第 30 章 创建素材与追加修订怎样承受重试](part-04-consistency/chapter-30-write-retry/chapter.md)

#### [第 31 章 一致性整合：完成可靠的候选采纳](part-04-consistency/chapter-31-integration/chapter.md)

#### [第 32 章 构建可供客户端使用的查询接口](part-04-consistency/chapter-32-queries/chapter.md)

#### [第 33 章 分页与时间：下一页从哪里继续](part-04-consistency/chapter-33-pagination/chapter.md)

#### [第 34 章 已有素材列表怎样从全量读取迁到分页](part-04-consistency/chapter-34-paging-upgrade/chapter.md)

#### [第 35 章 索引与执行计划：查询为什么变慢](part-04-consistency/chapter-35-indexes/chapter.md)

#### [第 36 章 第四篇回顾：让采纳经得起竞争与重试](part-04-consistency/chapter-36-review/chapter.md)

### [第五篇 让服务认识用户：身份、会话与权限](part-05-identity/README.md)

#### [第 37 章 安全地保存密码与秘密](part-05-identity/chapter-37-secrets/chapter.md)

#### [第 38 章 Session 与 Cookie 登录状态从哪里来](part-05-identity/chapter-38-sessions/chapter.md)

#### [第 39 章 鉴权与授权 登录了也不代表能操作](part-05-identity/chapter-39-authorization/chapter.md)

#### [第 40 章 保护基于浏览器的服务入口](part-05-identity/chapter-40-browser-boundary/chapter.md)

#### [第 41 章 两个 API 实例如何共用登录额度](part-05-identity/chapter-41-shared-limit/chapter.md)

#### [第 42 章 从一封验证邮件建立账号](part-05-identity/chapter-42-verified-signup/chapter.md)

#### [第 43 章 恢复已有账号并撤销旧会话](part-05-identity/chapter-43-registration/chapter.md)

#### [第 44 章 小程序登录与独立会话](part-05-identity/chapter-44-mini-program/chapter.md)

#### [第 45 章 先理解 OAuth，再接入 OIDC 外部登录](part-05-identity/chapter-45-oidc/chapter.md)

#### [第 46 章 微信网站扫码登录](part-05-identity/chapter-46-wechat-website/chapter.md)

#### [第 47 章 用已登录的小程序扫码确认网站登录](part-05-identity/chapter-47-mini-confirm/chapter.md)

#### [第 48 章 第五篇回顾：身份有效之后，操作是否仍被允许](part-05-identity/chapter-48-review/chapter.md)

### [第六篇 请求返回以后：后台任务与用户通知](part-06-background/README.md)

#### [第 49 章 Transactional Outbox：业务和消息如何一起提交](part-06-background/chapter-49-outbox/chapter.md)

#### [第 50 章 选读：让小程序登录与事务发件箱在同一服务工作](part-06-background/chapter-50-login-integration/chapter.md)

#### [第 51 章 为什么需要独立 Worker](part-06-background/chapter-51-worker/chapter.md)

#### [第 52 章 安全领取任务与识别过期执行者](part-06-background/chapter-52-claims/chapter.md)

#### [第 53 章 失败、重试与未知结果](part-06-background/chapter-53-retries/chapter.md)

#### [第 54 章 选读：追踪一封事务邮件的实际送达与异步退信](part-06-background/chapter-54-mail-delivery/chapter.md)

#### [第 55 章 先让通知成为可查询的数据](part-06-background/chapter-55-notifications/chapter.md)

#### [第 56 章 用 SSE 传递实时更新](part-06-background/chapter-56-sse/chapter.md)

#### [第 57 章 第六篇回顾：从一封验证邮件追到站内收件箱](part-06-background/chapter-57-review/chapter.md)

### [第七篇 用户资料与文件：数据库之外的数据](part-07-profiles/README.md)

#### [第 58 章 用户资料的业务约束与隐私](part-07-profiles/chapter-58-profile/chapter.md)

#### [第 59 章 安全地接收和处理头像](part-07-profiles/chapter-59-avatar/chapter.md)

#### [第 60 章 对象存储与数据库如何协作](part-07-profiles/chapter-60-avatar-storage/chapter.md)

#### [第 61 章 从头像记录与私有桶的差异追查缺件和多件](part-07-profiles/chapter-61-object-reconcile/chapter.md)

#### [第 62 章 第七篇回顾：文件与数据库没有一起成功时怎么办](part-07-profiles/chapter-62-review/chapter.md)

### [第八篇 开发、维护与交付准备](part-08-maintenance/README.md)

#### [第 63 章 为后台操作提供可靠的管理命令](part-08-maintenance/chapter-63-account-cli/chapter.md)

#### [第 64 章 构建与持续集成](part-08-maintenance/chapter-64-build-ci/chapter.md)

#### [第 65 章 调试性能与资源问题](part-08-maintenance/chapter-65-performance/chapter.md)

#### [第 66 章 一条历史坏记录应该让多少服务停下来](part-08-maintenance/chapter-66-bad-data/chapter.md)

#### [第 67 章 把验过的那份运行制品从验收环境交给发布环境](part-08-maintenance/chapter-67-artifact-promotion/chapter.md)

#### [第 68 章 第八篇回顾：从维护动作到可交付产物](part-08-maintenance/chapter-68-review/chapter.md)

### [第九篇 部署、运行与持续交付](part-09-deployment/README.md)

#### [第 69 章 把应用和数据交给目标环境](part-09-deployment/chapter-69-target-environment/chapter.md)

#### [第 70 章 让 API 和后台进程以各自身份持续运行](part-09-deployment/chapter-70-service-runtime/chapter.md)

#### [第 71 章 让客户端通过可信入口访问服务](part-09-deployment/chapter-71-service-access/chapter.md)

#### [第 72 章 把应用和运行环境一起交付](part-09-deployment/chapter-72-container-image/chapter.md)

#### [第 73 章 用 Compose 接管已有服务、数据与网络](part-09-deployment/chapter-73-compose-deployment/chapter.md)

#### [第 74 章 通知已经积压，怎样在人来报障之前发现](part-09-deployment/chapter-74-observability/chapter.md)

#### [第 75 章 定时维护漏跑或同时启动两次以后怎么办](part-09-deployment/chapter-75-maintenance-jobs/chapter.md)

#### [第 76 章 让 API 和后台进程更换凭据与签名密钥](part-09-deployment/chapter-76-rotate-credentials/chapter.md)

#### [第 77 章 备份 保存的是完整恢复能力](part-09-deployment/chapter-77-backups/chapter.md)

#### [第 78 章 发布、迁移与回退](part-09-deployment/chapter-78-compatible-release/chapter.md)

#### [第 79 章 原主机失联以后，哪些业务能先恢复](part-09-deployment/chapter-79-disaster-recovery/chapter.md)

#### [第 80 章 用 Northflank 部署后端服务，用 Cloudflare DNS 接入自有域名](part-09-deployment/chapter-80-public-deployment/chapter.md)

#### [第 81 章 第九篇回顾：接手一次原因未知的报障](part-09-deployment/chapter-81-operations-review/outline.md)

### 上部独立交付

#### [第 82 章 上部独立交付：发布预约服务并带旧单升级](upper-capstone/chapter-82-booking/outline.md)

## 下部 在已有服务上演进产品能力

### [第十篇 接入 AI：外部调用、费用与结果质量](part-10-ai/README.md)

#### 第 83 章 在业务边界内完成一次真实的模型调用

#### 第 84 章 让生成结果符合业务契约

#### 第 85 章 将 AI 调用编排为持久化任务

#### 第 86 章 配置 用量与费用控制

#### 第 87 章 评价 AI 功能 而不只看几个演示

#### 第 88 章 第十篇回顾：模型返回成功之后，业务是否完成

### [第十一篇 表达管理与搜索：关系、向量和内容演进](part-11-search/README.md)

#### 第 89 章 先理清表达身份、形式与关系

#### 第 90 章 Embedding 把文本转换为可比较的向量

#### 第 91 章 用 PostgreSQL 保存和检索向量

#### 第 92 章 建设星图搜索接口

#### 第 93 章 去重建议与表达关系如何由用户决定

#### 第 94 章 合并表达时如何保留引用和历史

#### 第 95 章 表达修改之后 派生数据怎么办

#### 第 96 章 第十一篇回顾：表达变了，搜索与引用怎样保持有效

### [第十二篇 动态练习：从目标选择到掌握证据](part-12-practice/README.md)

#### 第 97 章 练习池、目标选择与内容快照

#### 第 98 章 出题、作答、辅助与评价

#### 第 99 章 重试与中断恢复：让练习继续进行

#### 第 100 章 从练习结果计算掌握证据

#### 第 101 章 第十二篇回顾：一次练习留下了什么可靠证据

### [第十三篇 共享契约与 Agent 接入：MCP、授权与工具](part-13-agent/README.md)

#### 第 102 章 共享契约与四仓协作

#### 第 103 章 MCP 服务端的职责

#### 第 104 章 作为 OAuth 服务端签发授权码和访问令牌

#### 第 105 章 刷新、撤销与授权恢复

#### 第 106 章 设计可恢复的批量工具

#### 第 107 章 把用户确认落实为服务端事实

#### 第 108 章 由 Agent 生成候选表达，交给后端校验与保存

#### 第 109 章 第十三篇回顾：换一个调用入口，业务边界是否仍然成立

### [第十四篇 数据生命周期与综合实践](part-14-lifecycle/README.md)

#### 第 110 章 把账号处置建模为可靠流程

#### 第 111 章 清理在线数据与对象

#### 第 112 章 防止恢复备份让已删除账号重新出现

#### 第 113 章 第十四篇回顾与下部综合实践：账号处置后的产品演进

## 阅读方式与范围

点篇名可以看这一篇从哪里开始，点章名可以读正文或提要。上部适合按顺序跟做，后面的练习会用到你前面建的账号、留下的素材和备份。练习请使用专门的测试数据。

- **先把服务交到别人手里。** 前七篇从接收原文写到登录、后台寄信和头像。第八篇准备可交付的程序，第九篇先把它交给 Debian 托管，用另一台设备通过 HTTPS 验证，再用 Docker 和 Compose 接管同一套服务。第 80 章请受邀用户从外网访问，第 81 章接手一次故障，第 82 章换一个需求，独立交付预约服务。
- **按需要选择登录和发信练习。** 需要小程序或外部登录时再做第 44～47 章和第 50 章的接线。第 54 章可以在隔离环境练习，真实邮件按需发送。如果后面要做跨端授权，先读第 45.1～45.3 节的 OAuth／OIDC 基础。
- **在已有服务上继续做产品。** 第十至十二篇为英语学习工具加入模型调用、搜索和练习，第十三篇让客户端与 Agent 共用业务接口。第十四篇处理账号注销。到第 113 章，你会用自己选过的专题检查两件事：注销后才返回的结果怎么处理，从备份恢复时怎样避免把已删除的账号带回来。

跟做时可以直接用已有的 JavaScript 基础。测试从各章需要验证的行为入手。早期练习用几条固定内容生成候选表达，等到接入真实模型时，再比较调用条件和费用。PostgreSQL 和对象存储也先在本机运行，到了部署篇再用容器接管应用。

想看看自己能否独立处理一个新问题，可以对照[目标与能力路线](backend-capabilities.md)。例如，原来只需查到一条素材，升级后还得保证老用户用原来的链接也能读到它。

### 技术主线与业务演进

可以沿着一条原文看这张表。起初它只存在内存里，重启就消失了。存进数据库后，用户又想修改原文、保留旧版、确认候选表达。每次加功能，都要回头检查已有的记录还能不能读、原有的接口还能不能用。

| 篇章 | 业务为什么需要变化 | 技术重点 | 数据与系统如何延续 |
| --- | --- | --- | --- |
| 第一篇 | 接收并再次查看英语原文 | Node.js 请求、进程和运行环境 | 内存记录；暂不持久化 |
| 第二篇 | 同一接口需要清楚的职责和错误响应 | Nest、依赖注入、契约和配置 | 接口行为延续；只调整代码组织 |
| 第三篇 | 重启后仍可读取，再补充中文意图 | 关系模型、SQL、ORM 和迁移 | 最小用户／记录表 → 迁移基线 → 新字段；保留原记录 |
| 第四篇 | 保留输入历史，确认候选成为正式表达 | 关系演进、状态机、事务、并发和幂等 | 旧记录回填首个修订；追加候选、表达及命令结构 |
| 第五篇 | 用户通过不同方式登录并访问自己的已有记录 | 密码、会话、权限；可选小程序、外部登录与扫码确认 | 新增凭据、会话和注册意图；可选追加平台身份与登录票据，原 userId 和记录归属延续 |
| 第六篇 | 请求结束后能接续寄信，确认成功后能查到站内通知 | Outbox、独立进程、重试和 SSE | 申请留下邮件工作，确认留下通知工作；在线提示触发收件箱回查 |
| 第七篇 | 账号可以维护资料和头像 | 文件处理、私有对象存储与补偿 | 原账号增加可见性与改名记录，临时预览验证后再发布头像引用，跟踪候选对象与回收 |
| 第八篇 | 现有服务需要日常管理、稳定构建与局部数据修复 | 独立 CLI、构建与制品晋级、性能与空间诊断、坏记录隔离恢复 | 复用业务服务；增加操作与修复记录，保留可信历史、验收归档及其适用范围 |
| 第九篇 | 交付、维护并恢复同一套服务 | 原生托管、HTTPS、容器、观测、调度、轮换、备份、兼容发布与故障恢复 | 用原业务验证部署和升级，从外网核对素材、头像与投递，在故障时独立接班 |
| 上部独立交付 | 发布预约第一版，再交付取消截止规则 | 独立设计、实现、部署和维护 | 保留第一版预约、归属和余量 |
| 第十篇 | 示例候选替换为真实模型输出 | 外部调用、持久化编排、费用与质量 | 新增调用及费用记录；不自动重跑历史采纳 |
| 第十一篇 | 表达变多后需要搜索、关系维护和合并 | 向量检索、关系一致性与派生数据失效 | 保留表达 ID；追加关系／向量，显式安排历史回填 |
| 第十二篇 | 将已有表达用于出题与练习 | 状态快照、调用恢复和证据投影 | 新增练习、回答、辅助和证据；旧内容不伪造学习历史 |
| 第十三篇 | 客户端共享契约，Agent 调用已有业务 | 契约提取、MCP、OAuth 服务端与工具确认 | 复用第五篇的用户和登录；新增客户端授权与确认记录，业务数据保持同源 |
| 第十四篇 | 用户离开后要清理数据，恢复也不应复活账号 | 跨系统处置、独立事实与恢复门禁 | 沿全部已有关系和对象执行处置，再核对备份恢复 |

### 前置依赖

| 后续能力 | 需要此前交付什么 |
| --- | --- |
| PostgreSQL 接入 | 内存版记录接口已有明确输入与查询行为；第 17 章完成本地安装与连接，再按这些字段建表 |
| Prisma 持久化 | SQL 表与已有数据已建立，Schema 映射和初始迁移基线已核对 |
| 结构演进 | 保留旧记录；本篇先增加中文意图，后续篇再追加修订、候选等结构 |
| 可靠采纳 | 先有修订／候选与结果模型，再实现事务、并发和幂等 |
| Worker 发送 | 已有同步 SMTP 发送，再建立 Outbox 数据与一次性处理，最后启动 Worker |
| SSE | 通知先能持久化和补查，再增加实时传递 |
| 对象存储接入 | 已有用户与头像处理；第 60 章以本地进程提供存储端点，不依赖 Compose |
| 本地部署 | 已有构建产物与本地依赖；第 69 章接手目标环境，第 70 章在 Debian 托管；Mac 宿主托管见 69B |
| 容器部署与运维路线 | 已有生产产物、角色权限和历史数据；第九篇接通镜像、持久存储与 Compose，接续日常维护、更新和故障恢复 |
| 公网受邀交付 | 第 80 章将第 78 章制品部署到独立云环境，从受邀用户的网络核对业务，再把记录交给第 81 章接班人 |
| 真实 AI | 已有候选确认、任务执行与部署基础；先配置费用边界，再接调用与结果写回 |
| 搜索与练习 | 原表达继续有效，搜索先处理无向量旧数据；练习再引入自己的状态和调用表 |
| 小程序与外部登录（可选） | 已有用户、会话与权限；在第五篇接入身份映射，不依赖共享契约拆包或 MCP；真实联调需满足对应平台条件 |
| 平台真实联调（可选） | 对应登录章节先列明资质、配置与访问要求；第九篇完成私网 HTTPS；需要公网回调时，另备平台可达的域名、证书和回调地址，再返回第五篇联调 |
| MCP 授权 | 已有用户登录与 HTTPS；先读第 45.1～45.3 节协议基础及第 102 章共享契约，无需先接入外部登录平台 |
| 小程序网站扫码（可选） | 已有用户、小程序会话与网站会话；先用轮询推进票据状态，不依赖 SSE 或微信网站开放平台扫码支线 |
| 完整处置与恢复 | 基础备份恢复先完成，再沿原数据增加处置事实和恢复门禁 |

## 配套参考资料

遇到具体问题时，可以按下面的主题回查。

| 资料 | 范围 |
| --- | --- |
| A 源码导航 | 查找项目中的模块、命令与配置 |
| B 数据库字典 | 表、字段、关系、约束、索引及业务原因 |
| C 状态与操作索引 | 记录、候选、调用、练习、授权、登录票据与账号处置 |
| D 配置手册 | 读取方、用途、默认行为、秘密属性和环境约束 |
| E 接口与工具索引 | REST、MCP、回调、错误响应与权限 |
| F 操作与排障速查 | 本地启动、迁移、管理命令、现有测试命令、重建、发布与恢复 |
| G 安全边界索引 | 身份、权限、用户确认、数据归属与防重放 |
| H 机制比较 | Session／JWT、轮询／消息队列、SSE／WebSocket 等实际选择 |
| I 扩展讨论 | 缓存、独立队列、多实例与更复杂部署的适用条件 |

Redis、BullMQ、Kubernetes 等作为有条件的演进讨论，在相应需求出现时再说明适用条件。平台接入的验证方法与结果在对应实践中说明。
