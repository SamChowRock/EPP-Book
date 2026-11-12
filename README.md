# EPP 后端开发实践

面向已有 JavaScript、前端开发和前后端联调经验的开发者，从空项目开始，逐步搭建一个公开的 EPP，掌握后端开发与维护。\
围绕 Node.js、Nest、数据库与部署运维，在同一个持续演进的项目中讲清原理、实现与取舍；所需代码随实践逐步编写。\
全书分为两部。[上部 独立开发与交付一个后端服务](#上部-独立开发与交付一个后端服务)（第一至九篇，第 1～87 章）从第一个 HTTP 请求走到一次独立交付。[下部 在已有服务上演进产品能力](#下部-在已有服务上演进产品能力)（第十至十四篇，第 88～119 章）沿用同一套服务，继续处理模型调用、搜索、练习、Agent 工具与账号处置。

学习默认使用开启本机调试与自动重启的开发模式，通过 Postman 等图形客户端发送和保存请求，修改保存后再次点击发送验证；生产构建与运行方式在对应章节分别声明。首次跟做前可按[开发环境配置（macOS）](environment-setup.md)准备所需软件。

## 上部 独立开发与交付一个后端服务

### [第一篇 先运行起来：从浏览器走进 Node.js](part-01-nodejs/README.md)

**阅读路径**：核心实践。

**起点**：已有 JavaScript、前端开发和前后端联调经验；从一个空的独立实践项目开始。

**本篇结果**：启动、调用、调试和停止一个内存版记录服务，解释运行环境与异步执行的边界，并能检查、构建和在独立目录运行 TypeScript 服务。

**阶段边界**：先用单包和内存存储；后续接入 Nest 与 PostgreSQL。运行所需的语法按已有基础使用。

#### [第 1 章 先认识我们要建设的 EPP](part-01-nodejs/chapter-01-epp/chapter.md)

- [1.1 用一条英语表达串起记录、修订、候选、采纳和练习，先分清这些业务对象。](part-01-nodejs/chapter-01-epp/chapter.md#11-从一条英语表达开始)
- [1.2 用一张请求路径图认识客户端、API、Worker、数据库和外部服务；复杂机制在使用时展开。](part-01-nodejs/chapter-01-epp/chapter.md#12-一条记录怎样经过整个系统)
- [1.3 明确项目的建设范围与演进路线，以及开发数据的隔离边界。](part-01-nodejs/chapter-01-epp/chapter.md#13-项目的建设范围与演进路线)

- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-01-epp/chapter.md#附录本章必要技术点速查)

阅读参考（估算）：约 22～25 分钟。场景推演可选做，附录供回查。

#### [第 2 章 完成第一次 HTTP 往返](part-01-nodejs/chapter-02-first-http/chapter.md)

阅读约 16～20 分钟，建项目、发请求与复查监听另加约 12～18 分钟。

- [2.1 为项目选定运行版本](part-01-nodejs/chapter-02-first-http/chapter.md#21-为项目选定运行版本)
- [2.2 让一次 GET 有状态、头部和正文](part-01-nodejs/chapter-02-first-http/chapter.md#22-让一次-get-有状态头部和正文)
- [2.3 对照 200、404 和连接失败](part-01-nodejs/chapter-02-first-http/chapter.md#23-对照-200404-和连接失败)

#### [第 3 章 可靠接收请求正文并保存原文](part-01-nodejs/chapter-03-minimal-service/chapter.md)

阅读约 35～42 分钟，创建、拒绝、断点和重启观察另加约 25～35 分钟。

- [3.1 先确定三个接口和一条记录](part-01-nodejs/chapter-03-minimal-service/chapter.md#31-先确定三个接口和一条记录)
- [3.2 用原生 Node.js 把服务写出来](part-01-nodejs/chapter-03-minimal-service/chapter.md#32-用原生-nodejs-把服务写出来)
- [3.3 让请求结果变得可以观察](part-01-nodejs/chapter-03-minimal-service/chapter.md#33-让请求结果变得可以观察)
- [3.4 暂停一次请求，再停止整个服务](part-01-nodejs/chapter-03-minimal-service/chapter.md#34-暂停一次请求再停止整个服务)

#### [第 4 章 Node.js 程序究竟运行在哪里](part-01-nodejs/chapter-04-node-runtime/chapter.md)

- [4.1 从启动上下文理解进程、工作目录、环境变量继承与标准输入输出。](part-01-nodejs/chapter-04-node-runtime/chapter.md#41-进程工作目录环境变量与标准输入输出)
- [4.2 区分运行时能力与访问权限，理解文件内容与资源访问的不同寿命。](part-01-nodejs/chapter-04-node-runtime/chapter.md#42-浏览器与-nodejs-的全局对象文件访问和权限边界)
- [4.3 区分启动参数、退出状态、活动资源与信号收尾，解释服务为何持续运行。](part-01-nodejs/chapter-04-node-runtime/chapter.md#43-启动参数退出码信号以及为什么服务能持续运行)
- [4.4 从换目录失败推导路径基准与启动配置，再迁移到调用者指定的输入输出文件。](part-01-nodejs/chapter-04-node-runtime/chapter.md#44-相对路径文件读写与环境差异复现换目录后启动失败)
- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-04-node-runtime/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 43～48 分钟；跟做另加约 33～43 分钟，边读边做合计约 76～91 分钟。附录按需查阅。

#### [第 5 章 事件循环如何影响服务的响应能力](part-01-nodejs/chapter-05-event-loop/chapter.md)

- [5.1 从慢速上传观察 I/O 等待期间其他请求如何继续，区分并发与并行。](part-01-nodejs/chapter-05-event-loop/chapter.md#51-一个请求等待-io-时其他请求能否继续)
- [5.2 对照等待、连续计算与分段计算，解释 async、计时边界和输入规模。](part-01-nodejs/chapter-05-event-loop/chapter.md#52-cpu-密集计算为什么阻塞服务)
- [5.3 从定时器迟到、异步异常与超时实验，区分停止等待和取消工作。](part-01-nodejs/chapter-05-event-loop/chapter.md#53-定时器异常超时与取消)
- [5.4 用合作取消、期限清理与有界批次落实异步工作的资源归属。](part-01-nodejs/chapter-05-event-loop/chapter.md#54-把异步能力用于服务端资源管理)
- [5.5 区分 JavaScript、libuv 线程池、Worker Threads 和独立进程，沿新需求选择执行位置。](part-01-nodejs/chapter-05-event-loop/chapter.md#55-执行到底发生在哪里)
- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-05-event-loop/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 53～63 分钟；跟做另加约 40～50 分钟，边读边做合计约 93～113 分钟。附录按需查阅。

#### [第 6 章 TypeScript 如何变成可运行的服务](part-01-nodejs/chapter-06-typescript/chapter.md)

- [6.1 从类型迁移与运行时输入边界，区分类型检查、转译与运行的责任。](part-01-nodejs/chapter-06-typescript/chapter.md#61-类型检查转译与运行各自负责什么)
- [6.2 沿 CommonJS、ESM、包入口与扩展名解释模块解析的实际报错。](part-01-nodejs/chapter-06-typescript/chapter.md#62-commonjsesm-与模块解析的实际报错)
- [6.3 用 TypeScript watch 与 tsc 建立开发、检查和构建命令，并用 tsx 独立示例对照开发工具与产物解析。](part-01-nodejs/chapter-06-typescript/chapter.md#63-建立开发检查与构建命令)
- [6.4 区分锁文件、开发依赖与运行依赖，在独立目录核对完整运行单元。](part-01-nodejs/chapter-06-typescript/chapter.md#64-锁文件依赖与一份能够搬走的程序)
- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-06-typescript/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 53～63 分钟；跟做另加约 43～53 分钟，合计约 96～116 分钟。首次下载依赖另计。

#### [第 7 章 第一篇回顾：把服务搬离开发目录](part-01-nodejs/chapter-07-review/chapter.md)

- [7.1 第一篇结束后，怎样理解自己对 Node.js 的掌握。](part-01-nodejs/chapter-07-review/chapter.md#71-第一篇结束后怎样理解自己对-nodejs-的掌握)
- [7.2 不先改代码，先说明程序依赖什么。](part-01-nodejs/chapter-07-review/chapter.md#72-不先改代码先说明程序依赖什么)
- [7.3 用一条有效输入和一条无效输入确认边界。](part-01-nodejs/chapter-07-review/chapter.md#73-用一条有效输入和一条无效输入确认边界)
- [7.4 把进程寿命、配置寿命与产物寿命分开。](part-01-nodejs/chapter-07-review/chapter.md#74-把进程寿命配置寿命与产物寿命分开)
- [7.5 需求变成批量处理时，先判断成本再选执行方式。](part-01-nodejs/chapter-07-review/chapter.md#75-需求变成批量处理时先判断成本再选执行方式)
- [7.6 如何确认这一篇已经形成可迁移的能力。](part-01-nodejs/chapter-07-review/chapter.md#76-如何确认这一篇已经形成可迁移的能力)
- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-07-review/chapter.md#附录本章必要技术点速查)

时间参考（估算）：先按顺序读完第 1～6 章；本章阅读约 38～48 分钟，新增操作另加约 35～50 分钟，附录按需查阅。

**第一篇时间参考（估算）**：第 1～7 章正文，阅读约 260～309 分钟，跟做另加约 188～249 分钟，合计约 448～558 分钟（约 7 小时 28 分～9 小时 18 分）。知识支线单列，首次环境安装与依赖下载另计；计算依据和分项见[篇导读](part-01-nodejs/README.md#整篇投入与使用方式)。

### [第二篇 用 Nest 组织一个可持续扩展的服务](part-02-nestjs/README.md)

**阅读路径**：核心实践。

**起点**：已经有能运行的内存版 HTTP 服务和基础调试命令。

**本篇结果**：理解 Nest 的设计取舍与适用条件，将已有记录接口迁入框架，建立业务边界、输入输出契约、可读日志和配置入口。

**阶段边界**：保留内存存储；依赖注入围绕实际组件展开。独立 Worker、管理命令在各自场景引入。

#### [第 8 章 从手写服务走向 Nest](part-02-nestjs/chapter-08-enter-nest/chapter.md)

- [8.1 从职责拆分到框架选择：为什么引入 Nest。](part-02-nestjs/chapter-08-enter-nest/chapter.md#81-从职责拆分到框架选择为什么引入-nest)
- [8.2 将 HTTP 处理与业务规则分开。](part-02-nestjs/chapter-08-enter-nest/chapter.md#82-将-http-处理与业务规则分开)
- [8.3 Nest 怎样把设计原则落实为运行机制。](part-02-nestjs/chapter-08-enter-nest/chapter.md#83-nest-怎样把设计原则落实为运行机制)
- [8.4 把第一篇接口迁入 Nest，并验证行为一致。](part-02-nestjs/chapter-08-enter-nest/chapter.md#84-把第一篇接口迁入-nest并验证行为一致)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-08-enter-nest/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 70～80 分钟；跟做另加约 55～65 分钟，合计约 125～145 分钟。首次下载新增依赖另计，附录按需查阅。

#### [第 9 章 Controller 定义系统的 HTTP 入口](part-02-nestjs/chapter-09-controllers/chapter.md)

- [9.1 路由、路径参数、查询参数、请求体与响应映射。](part-02-nestjs/chapter-09-controllers/chapter.md#91-路由路径参数查询参数请求体与响应映射)
- [9.2 Controller 怎样将 HTTP 输入交给业务逻辑，哪些工作应留在 Service。](part-02-nestjs/chapter-09-controllers/chapter.md#92-controller-怎样将-http-输入交给业务逻辑哪些工作应留在-service)
- [9.3 先用请求和响应观察接口行为，再在依赖注入章节替换组件。](part-02-nestjs/chapter-09-controllers/chapter.md#93-先用请求和响应观察接口行为再在依赖注入章节替换组件)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-09-controllers/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 52～62 分钟；跟做另加约 40～50 分钟，合计约 92～112 分钟。附录按需查阅，支线单列。

#### [第 10 章 Provider 与依赖注入：把组件组装交给容器](part-02-nestjs/chapter-10-providers/chapter.md)

- [10.1 从手动组装对象到构造函数注入，解决真实出现的依赖问题。](part-02-nestjs/chapter-10-providers/chapter.md#101-从手动组装对象到构造函数注入解决真实出现的依赖问题)
- [10.2 Provider、注入令牌，以及类、工厂、值 Provider 的选择。](part-02-nestjs/chapter-10-providers/chapter.md#102-provider注入令牌以及类工厂值-provider-的选择)
- [10.3 将内存存储放在可替换接口后面，为数据库接入留下边界。](part-02-nestjs/chapter-10-providers/chapter.md#103-将内存存储放在可替换接口后面为数据库接入留下边界)
- [10.4 开发中的依赖替换与 Fake：用固定详情返回观察替换位置与适用范围。](part-02-nestjs/chapter-10-providers/chapter.md#104-开发中的依赖替换与-fake)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-10-providers/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 55～65 分钟；跟做另加约 45～55 分钟，合计约 100～120 分钟。附录按需查阅，支线单列。

#### [第 11 章 Module 建立清楚的业务边界](part-02-nestjs/chapter-11-modules/chapter.md)

- [11.1 imports、providers、controllers 与 exports 如何组装已有记录服务。](part-02-nestjs/chapter-11-modules/chapter.md#111-importsproviderscontrollers-与-exports-如何组装已有记录服务)
- [11.2 模块公开能力与内部实现，避免把数据库操作随意泄漏给调用方。](part-02-nestjs/chapter-11-modules/chapter.md#112-模块公开能力与内部实现避免把数据库操作随意泄漏给调用方)
- [11.3 通过一处循环依赖理解职责划分；复杂业务模块在对应篇章再对照。](part-02-nestjs/chapter-11-modules/chapter.md#113-通过一处循环依赖理解职责划分复杂业务模块在对应篇章再对照)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-11-modules/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 45～55 分钟；跟做另加约 35～45 分钟，合计约 80～100 分钟。附录按需查阅，支线单列。

#### [第 12 章 建立可信的输入与错误边界](part-02-nestjs/chapter-12-contracts/chapter.md)

- [12.1 从记录接口收到不合法输入出发，解释 TypeScript 类型与 Zod 运行时校验的区别。](part-02-nestjs/chapter-12-contracts/chapter.md#121-从记录接口收到不合法输入出发解释-typescript-类型与-zod-运行时校验的区别)
- [12.2 为现有记录定义请求和公开响应，明确哪些字段可由用户修改。](part-02-nestjs/chapter-12-contracts/chapter.md#122-为现有记录定义请求和公开响应明确哪些字段可由用户修改)
- [12.3 校验失败、业务冲突、权限错误与系统故障的错误契约；权限类型先说明含义，身份篇再落地。](part-02-nestjs/chapter-12-contracts/chapter.md#123-校验失败业务冲突权限错误与系统故障的错误契约权限类型先说明含义身份篇再落地)
- [12.4 生成并使用现有接口的 OpenAPI／Swagger 文档，观察调用方如何定位字段和错误。](part-02-nestjs/chapter-12-contracts/chapter.md#124-生成并使用现有接口的-openapiswagger-文档观察调用方如何定位字段和错误)
- [12.5 此章先在入口直接校验并返回明确错误；下一章再用 Nest 请求机制统一接入。](part-02-nestjs/chapter-12-contracts/chapter.md#125-此章先在入口直接校验并返回明确错误下一章再用-nest-请求机制统一接入)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-12-contracts/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 68～78 分钟；跟做另加约 50～60 分钟，合计约 118～138 分钟。首次下载新增依赖另计，附录按需查阅，支线单列。

#### [第 13 章 请求经过 Nest 时发生了什么](part-02-nestjs/chapter-13-request-pipeline/chapter.md)

- [13.1 从重复处理推导执行位置：Middleware、Guard、Pipe、Interceptor 与 Filter 各自能看见什么。](part-02-nestjs/chapter-13-request-pipeline/chapter.md#131-从重复处理推导执行位置)
- [13.2 把已有契约接到正确的边界，集中输入解析、公开输出与 Problem Details，保持业务接口行为。](part-02-nestjs/chapter-13-request-pipeline/chapter.md#132-把已有契约接到正确的边界)
- [13.3 沿失败的位置选择断点，再改变执行条件，观察拒绝、恢复、短路与局部过滤器。](part-02-nestjs/chapter-13-request-pipeline/chapter.md#133-沿失败的位置选择断点再改变执行条件)
- [13.4 用一个最小请求断言留下回归证据，说明运行方法与适用范围。](part-02-nestjs/chapter-13-request-pipeline/chapter.md#134-用一个最小请求断言留下回归证据)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-13-request-pipeline/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 50～60 分钟；跟做另加约 40～50 分钟，合计约 90～110 分钟。附录按需查阅，支线单列。

#### [第 14 章 配置与生命周期：让应用可靠地启动和退出](part-02-nestjs/chapter-14-configuration-lifecycle/chapter.md)

- [14.1 把启动输入变成一份可注入的配置。](part-02-nestjs/chapter-14-configuration-lifecycle/chapter.md#141-把启动输入变成一份可注入的配置)
- [14.2 环境、秘密与诊断信息各有边界。](part-02-nestjs/chapter-14-configuration-lifecycle/chapter.md#142-环境秘密与诊断信息各有边界)
- [14.3 沿同一次请求找到耗时与失败。](part-02-nestjs/chapter-14-configuration-lifecycle/chapter.md#143-沿同一次请求找到耗时与失败)
- [14.4 让停止接收、完成工作和释放资源按顺序发生。](part-02-nestjs/chapter-14-configuration-lifecycle/chapter.md#144-让停止接收完成工作和释放资源按顺序发生)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-14-configuration-lifecycle/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 90～105 分钟；配置、日志与关闭实验另加约 65～80 分钟，合计约 155～185 分钟。按约8500个汉字、580行代码与命令，以及正常/失败启动、请求关联、处理中关闭和期限对照估算，尚未经过读者实测；支线单列，首次安装环境不计入。

#### [第 15 章 第二篇回顾：沿一次请求解释职责与生命周期](part-02-nestjs/chapter-15-review/chapter.md)

**阅读前提**：先完成第 8～14 章。

- [15.1 从启动到响应，重建一条有证据的执行路径。](part-02-nestjs/chapter-15-review/chapter.md#151-从启动到响应重建一条有证据的执行路径)
- [15.2 改变输入规则，并证明存储仍可替换。](part-02-nestjs/chapter-15-review/chapter.md#152-改变输入规则并证明存储仍可替换)
- [15.3 用日志、故障与交付产物核对同一套判断。](part-02-nestjs/chapter-15-review/chapter.md#153-用日志故障与交付产物核对同一套判断)
- [15.4 带着已有边界进入数据库篇。](part-02-nestjs/chapter-15-review/chapter.md#154-带着已有边界进入数据库篇)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-15-review/chapter.md#附录本章必要技术点速查)

时间参考（估算）：阅读约 45～55 分钟；独立改造、请求排错、关闭与产物核对另加约 50～65 分钟，合计约 95～120 分钟。

第二篇主线第 8～15 章合计：阅读约 475～560 分钟，操作另加约 380～470 分钟，总计约 855～1030 分钟（14 小时 15 分～17 小时 10 分）。按各章实际内容估算，非读者实测；支线单列在[篇导读](part-02-nestjs/README.md#全篇时间参考)，不并入主线。

### [第三篇 持久化与结构演进：PostgreSQL、SQL、Prisma](part-03-postgresql/README.md)

**阅读路径**：核心实践。

**起点**：已有能保存原文并查询的内存版 Nest 服务；重启后会丢失数据。

**本篇结果**：为原有功能建立最小表，接入 Prisma 持久化，再给已有记录追加中文意图，完成第一次带数据的结构演进。

**阶段边界**：先用 SQL 建立并理解两张最小表，再将已有结构纳入 Prisma 迁移管理；后续全部沿同一批数据追加迁移，修订与候选尚未创建。

#### [第 16 章 两次都写成功，JSON 文件里为什么少了一条素材](part-03-postgresql/chapter-16-json-file/outline.md)

[章节提要](part-03-postgresql/chapter-16-json-file/outline.md)

- [16.1 给素材仓储换一份可以重开的文件](part-03-postgresql/chapter-16-json-file/outline.md#161-给素材仓储换一份可以重开的文件)
- [16.2 把两次修改停在读完旧文件的位置](part-03-postgresql/chapter-16-json-file/outline.md#162-把两次修改停在读完旧文件的位置)
- [16.3 完整替换文件能保住两次写入吗](part-03-postgresql/chapter-16-json-file/outline.md#163-完整替换文件能保住两次写入吗)
- [16.4 把丢失的 ID 带到数据库篇](part-03-postgresql/chapter-16-json-file/outline.md#164-把丢失的-id-带到数据库篇)

#### [第 17 章 PostgreSQL 运行环境：安装、连接与实例管理](part-03-postgresql/chapter-17-postgresql-environment/chapter.md)

**时间参考（估算）**：阅读约 80～95 分钟；配置、连接、故障对照和启停操作另加约 50～65 分钟，首次软件下载、网络等待及遇到 WSL 跨环境故障后的处理另计。

- [17.1 从现有存储契约确定接入边界](part-03-postgresql/chapter-17-postgresql-environment/chapter.md#171-从现有存储契约确定接入边界)：核对存储替换中的查询顺序、类型映射、失败语义和首批模型范围。
- [17.2 PostgreSQL 实例如何定位和授权](part-03-postgresql/chapter-17-postgresql-environment/chapter.md#172-postgresql-实例如何定位和授权)：通过数据目录定位实例，划分开发权限，解释连接参数默认值与 search_path。
- [17.3 安装、启动，再从两个客户端连接同一个库](part-03-postgresql/chapter-17-postgresql-environment/chapter.md#173-安装启动再从两个客户端连接同一个库)：本机独立 PostgreSQL 18 实例，psql 与 DBeaver 对照，实际区分入口、认证和目标库错误。
- [17.4 验证实例启停，固定后续开发环境](part-03-postgresql/chapter-17-postgresql-environment/chapter.md#174-验证实例启停固定后续开发环境)：保存环境标识，选择关闭模式并核对重连，安排开发库与迁移校验环境。

#### [第 18 章 关系建模：为已有记录设计第一组表](part-03-postgresql/chapter-18-relational-modeling/chapter.md)

**时间参考（估算）**：阅读约 125～145 分钟；建表、写入、关系图核对、约束失败对照及时间／重连操作另加约 50～65 分钟，环境沿用上一章，支线单列。

- [18.1 从记录归属推导最小模型](part-03-postgresql/chapter-18-relational-modeling/chapter.md#181-从记录归属推导最小模型)：从需求确定行粒度，以函数依赖、修改异常和事实归属推导分表，再衔接现有接口。
- [18.2 让类型和约束分别承担明确的责任](part-03-postgresql/chapter-18-relational-modeling/chapter.md#182-让类型和约束分别承担明确的责任)：区分候选键、代理键与业务唯一性，选择类型与约束，保留已有字符串契约。
- [18.3 建表、写入，再确认留下了什么](part-03-postgresql/chapter-18-relational-modeling/chapter.md#183-建表写入再确认留下了什么)：创建用户与记录表、外键和索引，在 DBeaver 关系图与属性中核对模型，提交首批数据并处理失败。
- [18.4 一对多关系到底保证了什么](part-03-postgresql/chapter-18-relational-modeling/chapter.md#184-一对多关系到底保证了什么)：用约束失败解释数量与删除边界，从共享需求推导关联实体及当前关系与历史事件的区别。
- [18.5 时间经过数据库与 JSON 时发生了什么](part-03-postgresql/chapter-18-relational-modeling/chapter.md#185-时间经过数据库与-json-时发生了什么)：核对时区、精度、默认时间与 API 表示，区分稳定排序和插入顺序，保留数据供后续查询与迁移使用。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-18-relational-modeling/chapter.md#附录本章必要技术点速查)。

#### [第 19 章 SQL：查询、筛选和修改自己的记录](part-03-postgresql/chapter-19-sql/chapter.md)

**时间参考（估算）**：阅读约 115～135 分钟；查询、写入回滚、关联聚合、参数与双会话观察另加约 60～80 分钟，支线单列。

- [19.1 从读取意图推导条件、顺序与修改范围](part-03-postgresql/chapter-19-sql/chapter.md#191-从读取意图推导条件顺序与修改范围)：明确创建时间与 ID 排序、字面搜索和 OFFSET 边界，用归属条件与 RETURNING 观察写入结果。
- [19.2 先决定结果粒度，再选择 JOIN、分组与子查询](part-03-postgresql/chapter-19-sql/chapter.md#192-先决定结果粒度再选择-join分组与子查询)：解释外连接、NULL 占位、COUNT、ON／WHERE、HAVING 和 EXISTS 的不同问题。
- [19.3 把输入值与 SQL 结构分开](part-03-postgresql/chapter-19-sql/chapter.md#193-把输入值与-sql-结构分开)：用 PREPARE 观察值参数，以独立 JS 示例推导动态条件与排序白名单。
- [19.4 从冲突结果回到设计规则](part-03-postgresql/chapter-19-sql/chapter.md#194-从冲突结果回到设计规则)：区分冲突跳过、内容一致与幂等，保留既有唯一性和删除语义。
- [19.5 用两个会话看清提交与可见性](part-03-postgresql/chapter-19-sql/chapter.md#195-用两个会话看清提交与可见性)：在 DBeaver 按 PID 核对独立会话，观察 READ COMMITTED 下提交、回滚和结果刷新，处理未知结果并清理实验。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-19-sql/chapter.md#附录本章必要技术点速查)。

#### [第 20 章 Prisma：将已有表纳入 Schema 与迁移管理](part-03-postgresql/chapter-20-prisma/chapter.md)

**时间参考（估算）**：阅读约 110～130 分钟；配置、模型核对、空库重放与基线登记另加约 55～75 分钟，支线单列，安装与下载等待另计。

- [20.1 先分清模型、客户端与数据库](part-03-postgresql/chapter-20-prisma/chapter.md#201-先分清模型客户端与数据库)：从手写 SQL 的维护责任比较 ORM 与独立迁移工具，建立三种产物的对应关系。
- [20.2 从已有表得到模型，再生成客户端](part-03-postgresql/chapter-20-prisma/chapter.md#202-从已有表得到模型再生成客户端)：固定 Prisma 7 配置，核对映射、物理类型、关系和约束，区分客户端改名与数据库演进。
- [20.3 为已有结构建立可重放的基线](part-03-postgresql/chapter-20-prisma/chapter.md#203-为已有结构建立可重放的基线)：区分目标模型与执行历史，补回 CHECK，以目录查询和数据对照核对基线，保留旧数据。
- [20.4 在独立空库重放，再登记已有库](part-03-postgresql/chapter-20-prisma/chapter.md#204-在独立空库重放再登记已有库)：先验证建表与约束，再登记日常库，解释状态、校验值与中断恢复。
- [20.5 下一次变化怎样进入同一条历史](part-03-postgresql/chapter-20-prisma/chapter.md#205-下一次变化怎样进入同一条历史)：推导影子库、开发迁移与部署迁移的责任，区分结构重建、代码回退与数据恢复。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-20-prisma/chapter.md#附录本章必要技术点速查)。

#### [第 21 章 让记录接口读写已有的 PostgreSQL 数据](part-03-postgresql/chapter-21-existing-records/chapter.md)

阅读约 70～85 分钟，接线、查询与写入核对另加约 35～45 分钟。

- [21.1 为旧记录接上存储适配器](part-03-postgresql/chapter-21-existing-records/chapter.md#211-为旧记录接上存储适配器)
- [21.2 用原来的记录验证查询与公开响应](part-03-postgresql/chapter-21-existing-records/chapter.md#212-用原来的记录验证查询与公开响应)
- [21.3 写入、输入边界与错误如何连接起来](part-03-postgresql/chapter-21-existing-records/chapter.md#213-写入输入边界与错误如何连接起来)

#### [第 22 章 管理连接池、等待与服务关闭](part-03-postgresql/chapter-22-prisma-nest/chapter.md)

阅读约 80～95 分钟，连接观察、故障复现与产物核对另加约 40～50 分钟。

- [22.1 在 Nest 中明确数据库资源的所有者](part-03-postgresql/chapter-22-prisma-nest/chapter.md#221-在-nest-中明确数据库资源的所有者)
- [22.2 从已接入的旧记录定位一次查询](part-03-postgresql/chapter-22-prisma-nest/chapter.md#222-从已接入的旧记录定位一次查询)
- [22.3 从数据库异常得到业务上诚实的结果](part-03-postgresql/chapter-22-prisma-nest/chapter.md#223-从数据库异常得到业务上诚实的结果)
- [22.4 连接池、等待与关闭的真实顺序](part-03-postgresql/chapter-22-prisma-nest/chapter.md#224-连接池等待与关闭的真实顺序)
- [22.5 保留事实，分别核对开发重启与交付产物](part-03-postgresql/chapter-22-prisma-nest/chapter.md#225-保留事实分别核对开发重启与交付产物)

#### [第 23 章 Migration：给已有记录增加中文意图](part-03-postgresql/chapter-23-migrations/chapter.md)

**时间参考**：阅读约 135～155 分钟，操作另加 75～100 分钟（估算；支线单列）。

- [23.1 先决定旧数据的含义，再决定列怎么加](part-03-postgresql/chapter-23-migrations/chapter.md#231-先决定旧数据的含义再决定列怎么加)。
- [23.2 从模型变更到可审查、可重放的迁移](part-03-postgresql/chapter-23-migrations/chapter.md#232-从模型变更到可审查可重放的迁移)。
- [23.3 让创建、补充和读取共享同一份事实](part-03-postgresql/chapter-23-migrations/chapter.md#233-让创建补充和读取共享同一份事实)。
- [23.4 如果以后要求必填，如何不让旧数据突然失效](part-03-postgresql/chapter-23-migrations/chapter.md#234-如果以后要求必填如何不让旧数据突然失效)。
- [23.5 漂移、迁移失败与回退：先找出哪一层不一致](part-03-postgresql/chapter-23-migrations/chapter.md#235-漂移迁移失败与回退先找出哪一层不一致)。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-23-migrations/chapter.md#附录本章必要技术点速查)。

#### [第 24 章 第三篇回顾：带着旧记录完成一次结构演进](part-03-postgresql/chapter-24-review/chapter.md)

**阅读前提**：本章练习使用第 17～23 章建立的数据库、迁移记录和接口。

- [24.1 从接口结果回到 SQL、模型和历史](part-03-postgresql/chapter-24-review/chapter.md#241-从接口结果回到-sql模型和历史)。
- [24.2 保留旧记录，安排一次约束放宽](part-03-postgresql/chapter-24-review/chapter.md#242-保留旧记录安排一次约束放宽)。
- [24.3 用失败和恢复区分三个版本](part-03-postgresql/chapter-24-review/chapter.md#243-用失败和恢复区分三个版本)。
- [24.4 单行正确之后，下一步为什么是一致性](part-03-postgresql/chapter-24-review/chapter.md#244-单行正确之后下一步为什么是一致性)。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-24-review/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：只阅读约75～90分钟；跟做另加50～70分钟，合计约125～160分钟。第三篇第 17～24 章阅读约 790～930 分钟，操作约 415～550 分钟。支线用时见本篇导读。

### [第四篇 业务一致性：修订、候选、事务与采纳](part-04-consistency/README.md)

**阅读路径**：核心实践。

**起点**：原文、中文意图与记录归属已经持久化；具备 SQL、Prisma 和追加迁移能力。

**本篇结果**：从保留修改历史逐步扩展到候选和正式表达，围绕采纳掌握状态机、事务、并发、幂等与查询优化。

**阶段边界**：先说明新业务和数据关系，再实现其技术保证。候选内容仅用少量示例输入；AI 接入前不创建向量或付费调用。

#### [第 25 章 关系演进：从覆盖输入到保留修订历史](part-04-consistency/chapter-25-revisions/chapter.md)

- [25.1 覆盖保存以后，哪些问题已经无法回答](part-04-consistency/chapter-25-revisions/chapter.md#251-覆盖保存以后哪些问题已经无法回答)：定义完整快照、旧 PATCH 兼容与历史边界。
- [25.2 把记录身份和内容快照分开](part-04-consistency/chapter-25-revisions/chapter.md#252-把记录身份和内容快照分开)：推导一对多、版本身份、联合唯一与当前读取，解释快照重复及旧列保留。
- [25.3 停写、回填、核对，再切换读取](part-04-consistency/chapter-25-revisions/chapter.md#253-停写回填核对再切换读取)：保留旧值建立初始修订，检查覆盖和差异，安排失败与中断恢复。
- [25.4 追加修订，并让所有读路径理解最新内容](part-04-consistency/chapter-25-revisions/chapter.md#254-追加修订并让所有读路径理解最新内容)：创建原子性、参数化追加、序号冲突、最新搜索和有界历史，贯通图形请求及产物核对。
- [25.5 来源与 chunks：什么时候用列，什么时候用 JSON](part-04-consistency/chapter-25-revisions/chapter.md#255-来源与-chunks什么时候用列什么时候用-json)：区分未知与空数组，按身份、引用和查询需求选择 JSON 或关系表。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-25-revisions/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约145～165分钟，跟做另加95～120分钟；按约12800个汉字、约255行代码／命令、三张机制图、十三张实际界面图及迁移与图形联调步骤估算，支线单列于篇导读。

#### [第 26 章 状态机与关系建模：修订如何进入候选确认](part-04-consistency/chapter-26-candidates/chapter.md)

- [26.1 从用户操作推导候选状态](part-04-consistency/chapter-26-candidates/chapter.md#261-从用户操作推导候选状态)：区分命令与事实，定义pending、discarded及拒绝转移。
- [26.2 先说明采纳后哪些事实需要保存](part-04-consistency/chapter-26-candidates/chapter.md#262-先说明采纳后哪些事实需要保存)：推导候选、学习记录、正式表达和形式的行粒度与引用责任。
- [26.3 追加候选表，旧修订保持无候选](part-04-consistency/chapter-26-candidates/chapter.md#263-追加候选表旧修订保持无候选)：用有限占位与约束建立候选集，不伪造旧候选。
- [26.4 保存、读取与放弃，让状态真正影响写入](part-04-consistency/chapter-26-candidates/chapter.md#264-保存读取与放弃让状态真正影响写入)：实现归属检查、空集合、条件转移与完整接口，观察CHECK和状态机的不同。
- [26.5 采纳、放弃、未选择与旧修订是不同事实](part-04-consistency/chapter-26-candidates/chapter.md#265-采纳放弃未选择与旧修订是不同事实)：绑定确认对象，保留旧版决定，并按实际事实恢复。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-26-candidates/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约130～150分钟，跟做另加80～100分钟；按约9200个汉字、约290行代码／命令、三张机制图、十一张实际界面图及迁移、接口与产物恢复步骤估算，支线单列于篇导读。

#### [第 27 章 事务：让多次修改成为一次业务动作](part-04-consistency/chapter-27-transactions/chapter.md)

- [27.1 建立采纳结果，再观察半次成功](part-04-consistency/chapter-27-transactions/chapter.md#271-建立采纳结果再观察半次成功)：追加正式表达、形式与学习记录，比较自动提交、回滚和完整提交。
- [27.2 把采纳放进一个数据库事务](part-04-consistency/chapter-27-transactions/chapter.md#272-把采纳放进一个数据库事务)：贯通状态契约、条件写入、关联结果与HTTP，核对失败回滚。
- [27.3 一个事务，也可能两次读到不同结果](part-04-consistency/chapter-27-transactions/chapter.md#273-一个事务也可能两次读到不同结果)：用两个真实会话比较读取视图与40001，解释隔离的保证与代价。
- [27.4 让事务短而完整，不把网络等待包进去](part-04-consistency/chapter-27-transactions/chapter.md#274-让事务短而完整不把网络等待包进去)：划定数据库提交边界，从已有事实处理超时、未知结果和旧程序恢复。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-27-transactions/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约120～140分钟，跟做另加90～115分钟；按约7800个汉字、约190行代码／命令、三张机制图、十二张实际界面图及迁移、采纳、两会话实验和产物恢复估算，支线单列于篇导读。

#### [第 28 章 并发控制：两个请求同时到来怎么办](part-04-consistency/chapter-28-concurrency/chapter.md)

- [28.1 两次都读到pending，为什么不能两次都采纳](part-04-consistency/chapter-28-concurrency/chapter.md#281-两次都读到pending为什么不能两次都采纳)：用两个连接复现过期判断，再由条件UPDATE裁决竞争。
- [28.2 唯一约束守住关系，迁移先面对已有事实](part-04-consistency/chapter-28-concurrency/chapter.md#282-唯一约束守住关系迁移先面对已有事实)：审核重复、追加约束并核对启动前提与原数据。
- [28.3 需要保护一段判断时，锁住什么](part-04-consistency/chapter-28-concurrency/chapter.md#283-需要保护一段判断时锁住什么)：比较行锁、等待策略与事务建议锁，按PID定位阻塞。
- [28.4 等待、死锁与重试，分别在哪里结束](part-04-consistency/chapter-28-concurrency/chapter.md#284-等待死锁与重试分别在哪里结束)：统一锁序，只对明确中止做有限的完整事务重试。
- [28.5 用户与表达边界，为什么不能只锁候选](part-04-consistency/chapter-28-concurrency/chapter.md#285-用户与表达边界为什么不能只锁候选)：从生命周期与表达复用推导共享前提和扩展顺序。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-28-concurrency/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约130～150分钟，跟做另加90～115分钟；按约9500个汉字、约110行代码／命令、三张机制图、十七张实际操作图及迁移、双会话锁实验与产物恢复估算，支线单列于篇导读。

#### [第 29 章 幂等与审计：响应丢失后如何安全重试](part-04-consistency/chapter-29-idempotency/chapter.md)

- [29.1 采纳已经提交，但客户端没有收到响应](part-04-consistency/chapter-29-idempotency/chapter.md#291-采纳已经提交但客户端没有收到响应)。
- [29.2 给成功操作保存一份可核对的回执](part-04-consistency/chapter-29-idempotency/chapter.md#292-给成功操作保存一份可核对的回执)。
- [29.3 把业务修改和重放结果放进同一事务](part-04-consistency/chapter-29-idempotency/chapter.md#293-把业务修改和重放结果放进同一事务)。
- [29.4 响应丢失、请求变化和旧历史，各自怎样恢复](part-04-consistency/chapter-29-idempotency/chapter.md#294-响应丢失请求变化和旧历史各自怎样恢复)。
- [29.5 领域审计与运行日志，分别留下什么](part-04-consistency/chapter-29-idempotency/chapter.md#295-领域审计与运行日志分别留下什么)。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-29-idempotency/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约115～135分钟，跟做另加80～100分钟；按本章正文、代码、机制图与迁移、响应丢失、重放、锁等待、断点和交付恢复操作估算，支线单列于篇导读。

#### [第 30 章 创建素材与追加修订怎样承受重试](part-04-consistency/chapter-30-write-retry/outline.md)

[章节提要](part-04-consistency/chapter-30-write-retry/outline.md)

- [30.1 重发同一段文本会多出什么](part-04-consistency/chapter-30-write-retry/outline.md#301-重发同一段文本会多出什么)
- [30.2 为两种写入划定操作身份](part-04-consistency/chapter-30-write-retry/outline.md#302-为两种写入划定操作身份)
- [30.3 让重复请求争用同一份决定](part-04-consistency/chapter-30-write-retry/outline.md#303-让重复请求争用同一份决定)
- [30.4 让旧客户端继续工作](part-04-consistency/chapter-30-write-retry/outline.md#304-让旧客户端继续工作)

#### [第 31 章 一致性整合：完成可靠的候选采纳](part-04-consistency/chapter-31-integration/chapter.md)

- [31.1 先把一次采纳的不同身份放回同一条链](part-04-consistency/chapter-31-integration/chapter.md#311-先把一次采纳的不同身份放回同一条链)。
- [31.2 给相同内容一个可重建的身份，同时保留原文](part-04-consistency/chapter-31-integration/chapter.md#312-给相同内容一个可重建的身份同时保留原文)。
- [31.3 在同一事务里复用表达，保留每一次决定](part-04-consistency/chapter-31-integration/chapter.md#313-在同一事务里复用表达保留每一次决定)。
- [31.4 把生成与语义能力放在正确的边界外](part-04-consistency/chapter-31-integration/chapter.md#314-把生成与语义能力放在正确的边界外)。
- [31.5 让新旧数据一起通过迁移、读取与恢复](part-04-consistency/chapter-31-integration/chapter.md#315-让新旧数据一起通过迁移读取与恢复)。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-31-integration/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约125～145分钟，跟做另加85～110分钟；按正文、规范化与迁移代码、两张机制图、九张实拍及旧数据升级、图形请求、锁等待、断点与交付恢复估算，支线单列于篇导读。

#### [第 32 章 构建可供客户端使用的查询接口](part-04-consistency/chapter-32-queries/chapter.md)

- [32.1 先决定一行代表什么，再决定查哪些表](part-04-consistency/chapter-32-queries/chapter.md#321-先决定一行代表什么再决定查哪些表)。
- [32.2 把存储关系变成公开响应](part-04-consistency/chapter-32-queries/chapter.md#322-把存储关系变成公开响应)。
- [32.3 先提供有界列表，再把分页问题留在明处](part-04-consistency/chapter-32-queries/chapter.md#323-先提供有界列表再把分页问题留在明处)。
- [32.4 用历史数据走完概览、来源和详情](part-04-consistency/chapter-32-queries/chapter.md#324-用历史数据走完概览来源和详情)。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-32-queries/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约100～120分钟，跟做另加60～85分钟；按正文、查询与契约代码、一张机制图、六张实拍、图形请求、数据库对照、断点与旧数据交付验证估算，支线单列于篇导读。

#### [第 33 章 分页与时间：下一页从哪里继续](part-04-consistency/chapter-33-pagination/chapter.md)

- [33.1 Offset跳过位置，Cursor接着边界](part-04-consistency/chapter-33-pagination/chapter.md#331-offset跳过位置cursor接着边界)。
- [33.2 给边界加上可验证的查询上下文](part-04-consistency/chapter-33-pagination/chapter.md#332-给边界加上可验证的查询上下文)。
- [33.3 接回两个列表，保留旧调用方](part-04-consistency/chapter-33-pagination/chapter.md#333-接回两个列表保留旧调用方)。
- [33.4 先确定是哪一天，再形成UTC区间](part-04-consistency/chapter-33-pagination/chapter.md#334-先确定是哪一天再形成utc区间)。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-33-pagination/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约125～150分钟，跟做另加70～95分钟；按正文、分页与签名代码、两张机制图、五张操作截图、图形请求、SQL日期边界、断点和产物恢复估算，支线单列于篇导读。

#### [第 34 章 已有素材列表怎样从全量读取迁到分页](part-04-consistency/chapter-34-paging-upgrade/outline.md)

[章节提要](part-04-consistency/chapter-34-paging-upgrade/outline.md)

- [34.1 找出哪个客户端把一页当成全部](part-04-consistency/chapter-34-paging-upgrade/outline.md#341-找出哪个客户端把一页当成全部)
- [34.2 让两种读取约定并存](part-04-consistency/chapter-34-paging-upgrade/outline.md#342-让两种读取约定并存)
- [34.3 逐个迁移消费者并核对完整性](part-04-consistency/chapter-34-paging-upgrade/outline.md#343-逐个迁移消费者并核对完整性)
- [34.4 何时可以退役全量读取](part-04-consistency/chapter-34-paging-upgrade/outline.md#344-何时可以退役全量读取)

#### [第 35 章 索引与执行计划：查询为什么变慢](part-04-consistency/chapter-35-indexes/chapter.md)

- [35.1 从列表和详情看索引的收益与写入成本](part-04-consistency/chapter-35-indexes/chapter.md#351-从列表和详情看索引的收益与写入成本)
- [35.2 单列索引、联合索引与排序](part-04-consistency/chapter-35-indexes/chapter.md#352-单列索引联合索引与排序)
- [35.3 用 EXPLAIN 看数据库实际读了多少行](part-04-consistency/chapter-35-indexes/chapter.md#353-用-explain-看数据库实际读了多少行)
- [35.4 区分查询次数、返回体积和连接占用](part-04-consistency/chapter-35-indexes/chapter.md#354-区分查询次数返回体积和连接占用)
- [35.5 将选定索引追加到已有库](part-04-consistency/chapter-35-indexes/chapter.md#355-将选定索引追加到已有库)

时间参考（估算）：阅读约65～85分钟，跟做另加50～70分钟；按执行计划对照、六张实拍、请求与连接池诊断、已有库升级估算，支线单列。

#### [第 36 章 第四篇回顾：让采纳经得起竞争与重试](part-04-consistency/chapter-36-review/chapter.md)

**阅读前提**：先完成第 25～35 章。

- [36.1 一次采纳里，究竟什么不能重复](part-04-consistency/chapter-36-review/chapter.md#361-一次采纳里究竟什么不能重复)
- [36.2 把采纳和放弃换个顺序，再丢掉一次响应](part-04-consistency/chapter-36-review/chapter.md#362-把采纳和放弃换个顺序再丢掉一次响应)
- [36.3 两个人抢最后一个预约名额](part-04-consistency/chapter-36-review/chapter.md#363-两个人抢最后一个预约名额)
- [36.4 从学习列表查回来源，也查清是谁的来源](part-04-consistency/chapter-36-review/chapter.md#364-从学习列表查回来源也查清是谁的来源)
- [附录：本章必要技术点速查](part-04-consistency/chapter-36-review/chapter.md#附录本章必要技术点速查)

时间参考（估算）：阅读约45～60分钟，跟做另加40～60分钟。第四篇十章（第 25～29、31～33、35～36 章）合计阅读约1100～1300分钟，跟做约740～970分钟；支线另列于篇导读。

### [第五篇 让服务认识用户：身份、会话与权限](part-05-identity/README.md)

**阅读路径**：核心实践。

**起点**：已有完整记录业务，但身份仍是隔离环境里的固定开发用户。

**本篇结果**：替换开发身份，建立密码登录、会话管理、权限和注册流程；按需增加小程序与外部身份登录，使不同登录方式归入同一本地账号与权限体系。

**阶段边界**：先用密码登录走通身份、会话和权限，再扩展注册与重置；邮件先同步发到本地 SMTP 服务，后续用 Outbox 改造可靠性。第 44～47 章是可选登录分支，不依赖共享契约拆包或 MCP；跳过后从第 43 章进入第 48 章回顾，再进入第 49 章。平台资质、应用配置和可访问地址在对应章节列出；需要部署环境的真实联调，在完成第九篇后回到本篇，不用模拟结果代替接通事实。

#### [第 37 章 安全地保存密码与秘密](part-05-identity/chapter-37-secrets/chapter.md)

阅读约100～120分钟；编码与跟做另加65～90分钟（估算）。

- [37.1 同样是秘密，为什么不能都存成摘要](part-05-identity/chapter-37-secrets/chapter.md#371-同样是秘密为什么不能都存成摘要)
- [37.2 用 Argon2id 验证密码，也量出它的成本](part-05-identity/chapter-37-secrets/chapter.md#372-用-argon2id-验证密码也量出它的成本)
- [37.3 随机令牌只保存摘要，比较前先确定字节](part-05-identity/chapter-37-secrets/chapter.md#373-随机令牌只保存摘要比较前先确定字节)
- [37.4 让秘密只出现在需要它的地方](part-05-identity/chapter-37-secrets/chapter.md#374-让秘密只出现在需要它的地方)
- [37.5 给已有用户增加凭据，不搬动旧记录](part-05-identity/chapter-37-secrets/chapter.md#375-给已有用户增加凭据不搬动旧记录)
- [附录：本章必要技术点速查](part-05-identity/chapter-37-secrets/chapter.md#附录本章必要技术点速查)

#### [第 38 章 Session 与 Cookie 登录状态从哪里来](part-05-identity/chapter-38-sessions/chapter.md)

阅读约130～155分钟；编码与跟做另加155～195分钟。

- [38.1 密码通过以后，服务端保存什么](part-05-identity/chapter-38-sessions/chapter.md#381-密码通过以后服务端保存什么)
- [38.2 用 Cookie 传递令牌，让请求带上正确身份](part-05-identity/chapter-38-sessions/chapter.md#382-用-cookie-传递令牌让请求带上正确身份)
- [38.3 看见会话，再分别撤销和退出](part-05-identity/chapter-38-sessions/chapter.md#383-看见会话再分别撤销和退出)
- [38.4 主动改密，为什么必须同时撤销全部会话](part-05-identity/chapter-38-sessions/chapter.md#384-主动改密为什么必须同时撤销全部会话)
- [38.5 登录以后，原来的记录仍在哪里](part-05-identity/chapter-38-sessions/chapter.md#385-登录以后原来的记录仍在哪里)
- [附录：本章必要技术点速查](part-05-identity/chapter-38-sessions/chapter.md#附录本章必要技术点速查)

#### [第 39 章 鉴权与授权 登录了也不代表能操作](part-05-identity/chapter-39-authorization/chapter.md)

阅读约85～105分钟；编码与跟做另加90～120分钟。

- [39.1 三个问题，分别在哪里回答](part-05-identity/chapter-39-authorization/chapter.md#391-三个问题分别在哪里回答)
- [39.2 新字段的默认值，也是一项权限决定](part-05-identity/chapter-39-authorization/chapter.md#392-新字段的默认值也是一项权限决定)
- [39.3 建立第二个本地账号，亲眼看见资源边界](part-05-identity/chapter-39-authorization/chapter.md#393-建立第二个本地账号亲眼看见资源边界)
- [39.4 资格每次读取，改动才能影响现有会话](part-05-identity/chapter-39-authorization/chapter.md#394-资格每次读取改动才能影响现有会话)
- [39.5 请求停止在哪里，必须有明确的先后关系](part-05-identity/chapter-39-authorization/chapter.md#395-请求停止在哪里必须有明确的先后关系)
- [附录：本章必要技术点速查](part-05-identity/chapter-39-authorization/chapter.md#附录本章必要技术点速查)

#### [第 40 章 保护基于浏览器的服务入口](part-05-identity/chapter-40-browser-boundary/chapter.md)

**时间参考（估算）**：阅读约120～145分钟；编码、浏览器联调与产物核对另加110～145分钟。

- [40.1 浏览器替谁携带Cookie，又允许谁读响应](part-05-identity/chapter-40-browser-boundary/chapter.md#401-浏览器替谁携带cookie又允许谁读响应)
- [40.2 让写请求提供会话之外的证明](part-05-identity/chapter-40-browser-boundary/chapter.md#402-让写请求提供会话之外的证明)
- [40.3 保护响应解释，也给请求成本设边界](part-05-identity/chapter-40-browser-boundary/chapter.md#403-保护响应解释也给请求成本设边界)
- [40.4 谁转发了请求，决定转发头能不能信](part-05-identity/chapter-40-browser-boundary/chapter.md#404-谁转发了请求决定转发头能不能信)
- [40.5 在真实浏览器里分清发送、携带和读取](part-05-identity/chapter-40-browser-boundary/chapter.md#405-在真实浏览器里分清发送携带和读取)
- [附录：本章必要技术点速查](part-05-identity/chapter-40-browser-boundary/chapter.md#附录本章必要技术点速查)

#### [第 41 章 两个 API 实例如何共用登录额度](part-05-identity/chapter-41-shared-limit/outline.md)

[章节提要](part-05-identity/chapter-41-shared-limit/outline.md)

- [41.1 交替访问两个独立端口](part-05-identity/chapter-41-shared-limit/outline.md#411-交替访问两个独立端口)
- [41.2 在数据库内作出一次配额决定](part-05-identity/chapter-41-shared-limit/outline.md#412-在数据库内作出一次配额决定)
- [41.3 在只余一格时同时发起](part-05-identity/chapter-41-shared-limit/outline.md#413-在只余一格时同时发起)
- [41.4 当共享计数不可用时怎样恢复](part-05-identity/chapter-41-shared-limit/outline.md#414-当共享计数不可用时怎样恢复)

#### [第 42 章 从一封验证邮件建立账号](part-05-identity/chapter-42-verified-signup/chapter.md)

阅读约 95～115 分钟，迁移、接线、收信与注册验证另加约 95～125 分钟。

- [42.1 先有注册意图，再有真正的账号](part-05-identity/chapter-42-verified-signup/chapter.md#421-先有注册意图再有真正的账号)
- [42.2 地址、有效期与一次性消费，要落到同一个事实边界](part-05-identity/chapter-42-verified-signup/chapter.md#422-地址有效期与一次性消费要落到同一个事实边界)
- [42.3 接上本地SMTP，观察请求到底等了什么](part-05-identity/chapter-42-verified-signup/chapter.md#423-接上本地smtp观察请求到底等了什么)
- [42.4 用收件箱和数据库核对新账号](part-05-identity/chapter-42-verified-signup/chapter.md#424-用收件箱和数据库核对新账号)

#### [第 43 章 恢复已有账号并撤销旧会话](part-05-identity/chapter-43-registration/chapter.md)

阅读约 60～75 分钟，重置、会话撤销与产物核对另加约 70～90 分钟。

- [43.1 找到可恢复的原账号](part-05-identity/chapter-43-registration/chapter.md#431-找到可恢复的原账号)
- [43.2 把重置机会绑定到签发时的身份](part-05-identity/chapter-43-registration/chapter.md#432-把重置机会绑定到签发时的身份)
- [43.3 重置密码，必须处理旧会话和旧重置意图](part-05-identity/chapter-43-registration/chapter.md#433-重置密码必须处理旧会话和旧重置意图)
- [43.4 用原会话验证重置的结果](part-05-identity/chapter-43-registration/chapter.md#434-用原会话验证重置的结果)
- [43.5 换成短信以前，先看哪些前提一起改变](part-05-identity/chapter-43-registration/chapter.md#435-换成短信以前先看哪些前提一起改变)

#### [第 44 章 小程序登录与独立会话](part-05-identity/chapter-44-mini-program/chapter.md)

**时间参考（估算）**：阅读约130～160分钟；编码、迁移、本地联调与产物核对另加145～190分钟；具备平台账号与HTTPS入口后，真实联调另加45～70分钟。

**可选登录分支**：复用已有用户、会话与权限；只准备登录所需的最小小程序入口，不展开完整客户端开发。

- [44.1 三种凭证，分别证明什么](part-05-identity/chapter-44-mini-program/chapter.md#441-三种凭证分别证明什么)
- [44.2 平台身份映射到用户，关联必须同时证明两边](part-05-identity/chapter-44-mini-program/chapter.md#442-平台身份映射到用户关联必须同时证明两边)
- [44.3 独立会话不是再造一套用户系统](part-05-identity/chapter-44-mini-program/chapter.md#443-独立会话不是再造一套用户系统)
- [44.4 平台交换、配置与最小小程序入口](part-05-identity/chapter-44-mini-program/chapter.md#444-平台交换配置与最小小程序入口)
- [44.5 用旧记录验证映射，用失败路径验证边界](part-05-identity/chapter-44-mini-program/chapter.md#445-用旧记录验证映射用失败路径验证边界)
- [附录：本章必要技术点速查](part-05-identity/chapter-44-mini-program/chapter.md#附录本章必要技术点速查)

#### [第 45 章 先理解 OAuth，再接入 OIDC 外部登录](part-05-identity/chapter-45-oidc/chapter.md)

**时间参考（估算）**：阅读约75～100分钟；实现、迁移与本地两站联调另加100～140分钟，供应商注册与部署另计。

**可选登录分支**：外部平台接入按需完成；第 45.1～45.3 节的协议基础也是后续 MCP 授权的前置知识，不要求先完成 OIDC 平台接入。

- [45.1 谁授权谁，授权码为什么还要换令牌](part-05-identity/chapter-45-oidc/chapter.md#451-谁授权谁授权码为什么还要换令牌)
- [45.2 外部登录到底相信哪份证明](part-05-identity/chapter-45-oidc/chapter.md#452-外部登录到底相信哪份证明)
- [45.3 跟着一次回调看 state、nonce 与 PKCE](part-05-identity/chapter-45-oidc/chapter.md#453-跟着一次回调看-statenonce-与-pkce)
- [45.4 用 openid-client 完成兑换，先让旧数据原样留下](part-05-identity/chapter-45-oidc/chapter.md#454-用-openid-client-完成兑换先让旧数据原样留下)
- [45.5 首次登录、关联和冲突，分别提交什么](part-05-identity/chapter-45-oidc/chapter.md#455-首次登录关联和冲突分别提交什么)
- [45.6 用两个站点走一遍，再决定怎样接真实供应商](part-05-identity/chapter-45-oidc/chapter.md#456-用两个站点走一遍再决定怎样接真实供应商)
- [附录：本章必要技术点速查](part-05-identity/chapter-45-oidc/chapter.md#附录本章必要技术点速查)

#### [第 46 章 微信网站扫码登录](part-05-identity/chapter-46-wechat-website/chapter.md)

时间参考（估算）：阅读约 35～50 分钟，实现与本地联调另加约 70～100 分钟，平台申请和部署时间另计。

**可选登录分支**：承接第 45 章协议基础，沿用第 44 章的微信身份映射。

- [46.1 手机确认以后，哪台设备取得会话](part-05-identity/chapter-46-wechat-website/chapter.md#461-手机确认以后哪台设备取得会话)
- [46.2 用网站 AppID 发起授权，在服务端兑换](part-05-identity/chapter-46-wechat-website/chapter.md#462-用网站-appid-发起授权在服务端兑换)
- [46.3 把微信身份接回原账号，再签发网站会话](part-05-identity/chapter-46-wechat-website/chapter.md#463-把微信身份接回原账号再签发网站会话)
- [46.4 在本机走完回跳，再联调真实网站应用](part-05-identity/chapter-46-wechat-website/chapter.md#464-在本机走完回跳再联调真实网站应用)
- [附录：本章必要技术点速查](part-05-identity/chapter-46-wechat-website/chapter.md#附录本章必要技术点速查)

#### [第 47 章 用已登录的小程序扫码确认网站登录](part-05-identity/chapter-47-mini-confirm/chapter.md)

时间参考（估算）：阅读约 45～60 分钟，编码、迁移与本地联调另加约 90～125 分钟，真机接入另计。

**可选登录分支**：依赖第 44 章的小程序会话和已有网站会话。

- [47.1 谁发起、谁同意、谁领走会话](part-05-identity/chapter-47-mini-confirm/chapter.md#471-谁发起谁同意谁领走会话)
- [47.2 一次登录申请，单独占一行](part-05-identity/chapter-47-mini-confirm/chapter.md#472-一次登录申请单独占一行)
- [47.3 两端如何走到同一次消费](part-05-identity/chapter-47-mini-confirm/chapter.md#473-两端如何走到同一次消费)
- [47.4 用两个客户端验证归属和失败时点](part-05-identity/chapter-47-mini-confirm/chapter.md#474-用两个客户端验证归属和失败时点)
- [附录：本章必要技术点速查](part-05-identity/chapter-47-mini-confirm/chapter.md#附录本章必要技术点速查)

其中第 37～43 章及第 48 章回顾为核心实践，第 44～47 章为可选登录分支。

#### [第 48 章 第五篇回顾：身份有效之后，操作是否仍被允许](part-05-identity/chapter-48-review/chapter.md)

**阅读前提**：完成第 37～43 章；第 44～47 章只核对已选择的登录入口。阅读约 42～55 分钟，跟做另加约 65～85 分钟（估算）。

- [48.1 一条修改请求要通过哪些判断](part-05-identity/chapter-48-review/chapter.md#481-一条修改请求要通过哪些判断)
- [48.2 同一条素材，为什么先是 403 又是 404](part-05-identity/chapter-48-review/chapter.md#482-同一条素材为什么先是-403-又是-404)
- [48.3 先退出、再重置，哪些旧证明还可用](part-05-identity/chapter-48-review/chapter.md#483-先退出再重置哪些旧证明还可用)
- [48.4 换一种登录方式，回到同一条旧记录](part-05-identity/chapter-48-review/chapter.md#484-换一种登录方式回到同一条旧记录)
- [48.5 邮件请求返回以后，谁接着做](part-05-identity/chapter-48-review/chapter.md#485-邮件请求返回以后谁接着做)
- [附录：本章必要技术点速查](part-05-identity/chapter-48-review/chapter.md#附录本章必要技术点速查)

核心章节（第 37～40、42～43、48 章）阅读约 632～770 分钟，跟做另加 650～850 分钟。四个可选登录分支全部跟做时，额外阅读约 285～370 分钟，本地操作另加 405～555 分钟。七条知识支线全部阅读另加 167～224 分钟，46A 的本地复现另加 5～10 分钟。真实平台申请、部署与真机联调另计。

### [第六篇 请求返回以后：后台任务与用户通知](part-06-background/README.md)

**阅读路径**：核心实践。

**起点**：第 42、43 章的注册与重置申请已能寄出验证邮件，第 48 章看到了验证意图提交后 API 退出的故障。

**本篇结果**：申请返回后，独立 Worker 仍能接着寄信。用户持证明确认成功后，站内收件箱会记下结果，在线页面可及时刷新，断线的页面回来后仍能补查。

**阶段边界**：第 49～53 章处理要发往外部邮箱的工作，第 55～56 章处理可在本库提交、按账号查询的通知。第 57 章结合两种目的地推导故障后的恢复动作。

#### [第 49 章 Transactional Outbox：业务和消息如何一起提交](part-06-background/chapter-49-outbox/chapter.md)

阅读约 60～75 分钟，实现、迁移与本机联调另加 85～115 分钟（估算）。

- [49.1 在旧请求中找出两次写入之间的空隙](part-06-background/chapter-49-outbox/chapter.md#491-在旧请求中找出两次写入之间的空隙)
- [49.2 给每一轮寄信留下一行](part-06-background/chapter-49-outbox/chapter.md#492-给每一轮寄信留下一行)
- [49.3 让冷却、替换和入队共用一次提交](part-06-background/chapter-49-outbox/chapter.md#493-让冷却替换和入队共用一次提交)
- [49.4 让另一个进程寄出一封仍然有效的信](part-06-background/chapter-49-outbox/chapter.md#494-让另一个进程寄出一封仍然有效的信)
- [附录：本章必要技术点速查](part-06-background/chapter-49-outbox/chapter.md#附录本章必要技术点速查)

#### [第 50 章 选读：让小程序登录与事务发件箱在同一服务工作](part-06-background/chapter-50-login-integration/outline.md)

选读章 · [章节提要](part-06-background/chapter-50-login-integration/outline.md)

- [50.1 为两个已在使用的分支各留一份基线](part-06-background/chapter-50-login-integration/outline.md#501-为两个已在使用的分支各留一份基线)
- [50.2 让两种迁移历史都能走到同一结构](part-06-background/chapter-50-login-integration/outline.md#502-让两种迁移历史都能走到同一结构)
- [50.3 用 Cookie 与 Bearer 找回同一条旧素材](part-06-background/chapter-50-login-integration/outline.md#503-用-cookie-与-bearer-找回同一条旧素材)
- [50.4 让选读入口可以退出](part-06-background/chapter-50-login-integration/outline.md#504-让选读入口可以退出)

#### [第 51 章 为什么需要独立 Worker](part-06-background/chapter-51-worker/chapter.md)

阅读约 70～85 分钟，实现、迁移、双进程调试及联调另加 100～130 分钟（估算）。

- [51.1 谁来发现下一条待办](part-06-background/chapter-51-worker/chapter.md#511-谁来发现下一条待办)
- [51.2 用 Nest 建一个没有 HTTP 监听的应用](part-06-background/chapter-51-worker/chapter.md#512-用-nest-建一个没有-http-监听的应用)
- [51.3 用同一个账号分清受理、寄达与生效](part-06-background/chapter-51-worker/chapter.md#513-用同一个账号分清受理寄达与生效)
- [51.4 在一封信发送到一半时关停](part-06-background/chapter-51-worker/chapter.md#514-在一封信发送到一半时关停)
- [附录：本章必要技术点速查](part-06-background/chapter-51-worker/chapter.md#附录本章必要技术点速查)

#### [第 52 章 安全领取任务与识别过期执行者](part-06-background/chapter-52-claims/chapter.md)

阅读约 55～70 分钟，实现、迁移与双执行者实验另加 80～105 分钟（估算）。

- [52.1 增加一个执行者以前先算哪笔账](part-06-background/chapter-52-claims/chapter.md#521-增加一个执行者以前先算哪笔账)
- [52.2 让一次领取有独立的身份和期限](part-06-background/chapter-52-claims/chapter.md#522-让一次领取有独立的身份和期限)
- [52.3 把准许发送和准许写回分开检查](part-06-background/chapter-52-claims/chapter.md#523-把准许发送和准许写回分开检查)
- [52.4 让 A 在两处停下来](part-06-background/chapter-52-claims/chapter.md#524-让-a-在两处停下来)
- [52.5 看懂领取索引和被锁的队头](part-06-background/chapter-52-claims/chapter.md#525-看懂领取索引和被锁的队头)
- [52.6 在旧库上完成交接](part-06-background/chapter-52-claims/chapter.md#526-在旧库上完成交接)
- [附录：本章必要技术点速查](part-06-background/chapter-52-claims/chapter.md#附录本章必要技术点速查)

#### [第 53 章 失败、重试与未知结果](part-06-background/chapter-53-retries/chapter.md)

阅读约 45～60 分钟，实现、升级与故障实验另加 75～105 分钟（估算）。

- [53.1 在哪一步失败才足以决定再寄](part-06-background/chapter-53-retries/chapter.md#531-在哪一步失败才足以决定再寄)
- [53.2 让重试预算和下次执行时间跨过重启](part-06-background/chapter-53-retries/chapter.md#532-让重试预算和下次执行时间跨过重启)
- [53.3 第二次执行凭什么还能使用这次申请](part-06-background/chapter-53-retries/chapter.md#533-第二次执行凭什么还能使用这次申请)
- [53.4 在本机分别制造暂时拒绝、死信和积压](part-06-background/chapter-53-retries/chapter.md#534-在本机分别制造暂时拒绝死信和积压)
- [53.5 对端读完正文以后如何放行和清理](part-06-background/chapter-53-retries/chapter.md#535-对端读完正文以后如何放行和清理)
- [附录：本章必要技术点速查](part-06-background/chapter-53-retries/chapter.md#附录本章必要技术点速查)

#### [第 54 章 选读：追踪一封事务邮件的实际送达与异步退信](part-06-background/chapter-54-mail-delivery/outline.md)

选读章 · [章节提要](part-06-background/chapter-54-mail-delivery/outline.md)

- [54.1 从本地接收跨到受控邮箱](part-06-background/chapter-54-mail-delivery/outline.md#541-从本地接收跨到受控邮箱)
- [54.2 把接收应答与收件箱证据配成一组](part-06-background/chapter-54-mail-delivery/outline.md#542-把接收应答与收件箱证据配成一组)
- [54.3 把重复、迟到和伪造回执送入入口](part-06-background/chapter-54-mail-delivery/outline.md#543-把重复迟到和伪造回执送入入口)
- [54.4 恢复一个地址并保留事故线索](part-06-background/chapter-54-mail-delivery/outline.md#544-恢复一个地址并保留事故线索)

#### [第 55 章 先让通知成为可查询的数据](part-06-background/chapter-55-notifications/chapter.md)

阅读约 50～65 分钟，实现、升级、双角色联调和重放实验另加 75～100 分钟（估算）。

- [55.1 收件箱的一行代表什么](part-06-background/chapter-55-notifications/chapter.md#551-收件箱的一行代表什么)
- [55.2 让当前账号能翻页、标记和清除](part-06-background/chapter-55-notifications/chapter.md#552-让当前账号能翻页标记和清除)
- [55.3 在一次业务提交后，由另一个事务生成通知](part-06-background/chapter-55-notifications/chapter.md#553-在一次业务提交后由另一个事务生成通知)
- [55.4 用两次确认走完收件箱](part-06-background/chapter-55-notifications/chapter.md#554-用两次确认走完收件箱)
- [55.5 重放一次已清除事件，再改变收件条件](part-06-background/chapter-55-notifications/chapter.md#555-重放一次已清除事件再改变收件条件)
- [附录：本章必要技术点速查](part-06-background/chapter-55-notifications/chapter.md#附录本章必要技术点速查)

#### [第 56 章 用 SSE 传递实时更新](part-06-background/chapter-56-sse/chapter.md)

阅读约 50～65 分钟，实现、浏览器联调与断线实验另加 65～90 分钟（估算）。

- [56.1 从一张停在旧数据的页面开始](part-06-background/chapter-56-sse/chapter.md#561-从一张停在旧数据的页面开始)
- [56.2 一个响应怎样传来多次提示](part-06-background/chapter-56-sse/chapter.md#562-一个响应怎样传来多次提示)
- [56.3 从另一个进程发现已提交的通知](part-06-background/chapter-56-sse/chapter.md#563-从另一个进程发现已提交的通知)
- [56.4 断线期间新增的通知去哪里找](part-06-background/chapter-56-sse/chapter.md#564-断线期间新增的通知去哪里找)
- [56.5 定位成批到达的提示与迟迟不关的连接](part-06-background/chapter-56-sse/chapter.md#565-定位成批到达的提示与迟迟不关的连接)
- [附录：本章必要技术点速查](part-06-background/chapter-56-sse/chapter.md#附录本章必要技术点速查)

#### [第 57 章 第六篇回顾：从一封验证邮件追到站内收件箱](part-06-background/chapter-57-review/chapter.md)

先完成第 49～56 章。阅读约 30～40 分钟，沿用上章账号操作另加 25～40 分钟，从新账号完整复现约 40～60 分钟。

- [57.1 先决定查什么](part-06-background/chapter-57-review/chapter.md#571-先决定查什么)
- [57.2 在两处中断执行，复核邮件事故](part-06-background/chapter-57-review/chapter.md#572-在两处中断执行复核邮件事故)
- [57.3 有一封信停在 attempting，用户还能改密吗](part-06-background/chapter-57-review/chapter.md#573-有一封信停在-attempting用户还能改密吗)
- [57.4 把目的地换成头像文件](part-06-background/chapter-57-review/chapter.md#574-把目的地换成头像文件)
- [附录：本章必要技术点速查](part-06-background/chapter-57-review/chapter.md#附录本章必要技术点速查)

第六篇第 49、51～53、55～57 章合计阅读约 360～460 分钟，连续沿用练习账号时操作另加 505～685 分钟。六条支线阅读另加 58～81 分钟，56A 的双会话实验另加 8～12 分钟。

### [第七篇 用户资料与文件：数据库之外的数据](part-07-profiles/README.md)

**阅读路径**：核心实践。

从第 57 章的账号与会话继续。先让同一个昵称按查看者和可见性返回，再接收头像，最后把通过检查的图片发布为账号当前引用。

#### [第 58 章 用户资料的业务约束与隐私](part-07-profiles/chapter-58-profile/chapter.md)

阅读约 50～65 分钟。已有两个账号时，编码、迁移与联调另加 70～95 分钟；需准备新账号时再加 10～20 分钟。

- [58.1 一张资料卡有两种读法](part-07-profiles/chapter-58-profile/chapter.md#581-一张资料卡有两种读法)
- [58.2 把旧账号接到资料上](part-07-profiles/chapter-58-profile/chapter.md#582-把旧账号接到资料上)
- [58.3 一个昵称究竟有多长](part-07-profiles/chapter-58-profile/chapter.md#583-一个昵称究竟有多长)
- [58.4 两个改名请求争最后一次机会](part-07-profiles/chapter-58-profile/chapter.md#584-两个改名请求争最后一次机会)
- [58.5 用两个账号检查可见性和配额](part-07-profiles/chapter-58-profile/chapter.md#585-用两个账号检查可见性和配额)
- [附录：本章必要技术点速查](part-07-profiles/chapter-58-profile/chapter.md#附录本章必要技术点速查)

#### [第 59 章 安全地接收和处理头像](part-07-profiles/chapter-59-avatar/chapter.md)

阅读约 55～75 分钟。已有第 58 章练习账号时，编码、图片联调与退出实验另加 75～105 分钟。

- [59.1 给已登录用户返回一次预览](part-07-profiles/chapter-59-avatar/chapter.md#591-给已登录用户返回一次预览)
- [59.2 接收端怎样跟上慢速写入](part-07-profiles/chapter-59-avatar/chapter.md#592-接收端怎样跟上慢速写入)
- [59.3 一张小文件会解码出多少像素](part-07-profiles/chapter-59-avatar/chapter.md#593-一张小文件会解码出多少像素)
- [59.4 在中断与重启后找回资源](part-07-profiles/chapter-59-avatar/chapter.md#594-在中断与重启后找回资源)
- [附录：本章必要技术点速查](part-07-profiles/chapter-59-avatar/chapter.md#附录本章必要技术点速查)

#### [第 60 章 对象存储与数据库如何协作](part-07-profiles/chapter-60-avatar-storage/chapter.md)

阅读约 75～95 分钟；沿用两个练习账号时，本机安装、编码、发布与故障实验另加 110～155 分钟。

- [60.1 一张头像需要保存哪些事实](part-07-profiles/chapter-60-avatar-storage/chapter.md#601-一张头像需要保存哪些事实)
- [60.2 在本机启动一个私有桶](part-07-profiles/chapter-60-avatar-storage/chapter.md#602-在本机启动一个私有桶)
- [60.3 用两个身份验证读写和到期](part-07-profiles/chapter-60-avatar-storage/chapter.md#603-用两个身份验证读写和到期)
- [60.4 把一次写入预订在旧账号上](part-07-profiles/chapter-60-avatar-storage/chapter.md#604-把一次写入预订在旧账号上)
- [60.5 先预订，写完对象再争发布资格](part-07-profiles/chapter-60-avatar-storage/chapter.md#605-先预订写完对象再争发布资格)
- [60.6 在删除以前先取得处置权](part-07-profiles/chapter-60-avatar-storage/chapter.md#606-在删除以前先取得处置权)
- [附录：本章必要技术点速查](part-07-profiles/chapter-60-avatar-storage/chapter.md#附录本章必要技术点速查)

#### [第 61 章 从头像记录与私有桶的差异追查缺件和多件](part-07-profiles/chapter-61-object-reconcile/outline.md)

[章节提要](part-07-profiles/chapter-61-object-reconcile/outline.md)

- [61.1 为对账准备两份独立清单](part-07-profiles/chapter-61-object-reconcile/outline.md#611-为对账准备两份独立清单)
- [61.2 按当前指针和写入尝试解释差异](part-07-profiles/chapter-61-object-reconcile/outline.md#612-按当前指针和写入尝试解释差异)
- [61.3 让发布过程穿过一次扫描](part-07-profiles/chapter-61-object-reconcile/outline.md#613-让发布过程穿过一次扫描)
- [61.4 用第二次观察决定怎样修复](part-07-profiles/chapter-61-object-reconcile/outline.md#614-用第二次观察决定怎样修复)

#### [第 62 章 第七篇回顾：文件与数据库没有一起成功时怎么办](part-07-profiles/chapter-62-review/chapter.md)

**阅读前提**：先完成第 58～60 章。沿用第 60 章代码。

阅读约 30～40 分钟；已有第 60 章环境时，联调与故障复现另加 40～60 分钟。

- [62.1 接手这张报障单](part-07-profiles/chapter-62-review/chapter.md#621-接手这张报障单)
- [62.2 在三个窗口里核对同一笔写入](part-07-profiles/chapter-62-review/chapter.md#622-在三个窗口里核对同一笔写入)
- [62.3 让三种中断留下不同的证据](part-07-profiles/chapter-62-review/chapter.md#623-让三种中断留下不同的证据)
- [62.4 决定这一笔能否清理](part-07-profiles/chapter-62-review/chapter.md#624-决定这一笔能否清理)
- [附录：本章必要技术点速查](part-07-profiles/chapter-62-review/chapter.md#附录本章必要技术点速查)

第七篇第 58～60、62 章合计阅读约 210～275 分钟，连续沿用两个练习账号时操作另加 295～415 分钟。三条支线阅读另加 26～37 分钟。首次准备账号和下载工具另计；第 62 章可次日观察复查结果，约一天的等待不计入操作时间。

### [第八篇 开发与维护：管理命令、构建和性能](part-08-maintenance/README.md)

**阅读路径**：核心实践。

**起点**：记录、登录、邮件任务、通知和头像已形成可操作的系统，需要统一管理、构建和排障。

**本篇结果**：将实际用到的账号管理整理为 CLI，完成干净环境构建，并定位当前业务的性能问题。

**阶段边界**：先围绕现有单包应用与 API／Worker 入口实现；多包、AI 和向量工具随对应专题扩展。

#### [第 63 章 为后台操作提供可靠的管理命令](part-08-maintenance/chapter-63-account-cli/chapter.md)

阅读约 32～43 分钟，已有练习账号时编码、迁移与两窗口操作另加 48～70 分钟。

- [63.1 给一次暂停分配身份](part-08-maintenance/chapter-63-account-cli/chapter.md#631-给一次暂停分配身份)
- [63.2 把命令接进一次性应用上下文](part-08-maintenance/chapter-63-account-cli/chapter.md#632-把命令接进一次性应用上下文)
- [63.3 让事实与收据一起提交](part-08-maintenance/chapter-63-account-cli/chapter.md#633-让事实与收据一起提交)
- [63.4 把入口复用到下一项维护工作](part-08-maintenance/chapter-63-account-cli/chapter.md#634-把入口复用到下一项维护工作)
- [附录：本章必要技术点速查](part-08-maintenance/chapter-63-account-cli/chapter.md#附录本章必要技术点速查)

#### [第 64 章 构建与持续集成](part-08-maintenance/chapter-64-build-ci/chapter.md)

阅读约 45～60 分钟，本机跟做另加 65～90 分钟；选做远程 CI 另加 10～18 分钟。

- [64.1 从一份干净的工作目录开始](part-08-maintenance/chapter-64-build-ci/chapter.md#641-从一份干净的工作目录开始)
- [64.2 交付目录里究竟要有什么](part-08-maintenance/chapter-64-build-ci/chapter.md#642-交付目录里究竟要有什么)
- [64.3 两份生成文件，两个需要核对的事实](part-08-maintenance/chapter-64-build-ci/chapter.md#643-两份生成文件两个需要核对的事实)
- [64.4 把同样的检查交给 GitHub Actions](part-08-maintenance/chapter-64-build-ci/chapter.md#644-把同样的检查交给-github-actions)
- [附录：本章必要技术点速查](part-08-maintenance/chapter-64-build-ci/chapter.md#附录本章必要技术点速查)

#### [第 65 章 把验过的那份运行制品从验收环境交给发布环境](part-08-maintenance/chapter-65-artifact-promotion/outline.md)

[章节提要](part-08-maintenance/chapter-65-artifact-promotion/outline.md)

- [65.1 从一次构建取得可运行的归档](part-08-maintenance/chapter-65-artifact-promotion/outline.md#651-从一次构建取得可运行的归档)
- [65.2 让验收记录指向归档摘要](part-08-maintenance/chapter-65-artifact-promotion/outline.md#652-让验收记录指向归档摘要)
- [65.3 按同一摘要晋级到第二环境](part-08-maintenance/chapter-65-artifact-promotion/outline.md#653-按同一摘要晋级到第二环境)
- [65.4 保留能实际退回的版本](part-08-maintenance/chapter-65-artifact-promotion/outline.md#654-保留能实际退回的版本)

#### [第 66 章 调试性能与资源问题](part-08-maintenance/chapter-66-performance/chapter.md)

阅读约 35～48 分钟；在本机跟做另加 45～65 分钟（估算）。

- [66.1 给耗时找一个起点和终点](part-08-maintenance/chapter-66-performance/chapter.md#661-给耗时找一个起点和终点)
- [66.2 同样过了半秒，Node 做了什么](part-08-maintenance/chapter-66-performance/chapter.md#662-同样过了半秒node-做了什么)
- [66.3 请求在等池、等锁，还是在读行](part-08-maintenance/chapter-66-performance/chapter.md#663-请求在等池等锁还是在读行)
- [66.4 一次只改变并发，把成功和代价一起记下](part-08-maintenance/chapter-66-performance/chapter.md#664-一次只改变并发把成功和代价一起记下)
- [66.5 根据证据选择改动](part-08-maintenance/chapter-66-performance/chapter.md#665-根据证据选择改动)
- [附录：本章必要技术点速查](part-08-maintenance/chapter-66-performance/chapter.md#附录本章必要技术点速查)

#### [第 67 章 长事务结束以后，PostgreSQL 怎样回收旧行占用的空间](part-08-maintenance/chapter-67-pg-maintenance/outline.md)

[章节提要](part-08-maintenance/chapter-67-pg-maintenance/outline.md)

- [67.1 让两个会话看到同一行的不同版本](part-08-maintenance/chapter-67-pg-maintenance/outline.md#671-让两个会话看到同一行的不同版本)
- [67.2 在快照仍有效时检查清理结果](part-08-maintenance/chapter-67-pg-maintenance/outline.md#672-在快照仍有效时检查清理结果)
- [67.3 结束快照后重复同一组写入](part-08-maintenance/chapter-67-pg-maintenance/outline.md#673-结束快照后重复同一组写入)
- [67.4 需要把空间还给文件系统时怎样取舍](part-08-maintenance/chapter-67-pg-maintenance/outline.md#674-需要把空间还给文件系统时怎样取舍)

#### [第 68 章 一条历史坏记录应该让多少服务停下来](part-08-maintenance/chapter-68-bad-data/outline.md)

[章节提要](part-08-maintenance/chapter-68-bad-data/outline.md)

- [68.1 从缺少首版修订的旧素材开始](part-08-maintenance/chapter-68-bad-data/outline.md#681-从缺少首版修订的旧素材开始)
- [68.2 按受影响的承诺划定停用范围](part-08-maintenance/chapter-68-bad-data/outline.md#682-按受影响的承诺划定停用范围)
- [68.3 在有界扫描中记录并隔离](part-08-maintenance/chapter-68-bad-data/outline.md#683-在有界扫描中记录并隔离)
- [68.4 依可信来源修复后再开放](part-08-maintenance/chapter-68-bad-data/outline.md#684-依可信来源修复后再开放)

#### [第 69 章 第八篇回顾：从维护动作到可交付产物](part-08-maintenance/chapter-69-review/chapter.md)

先完成第 63～66 章。阅读约 24～34 分钟，本机跟做另加 40～55 分钟。

- [69.1 接手一张尚未结案的维护单](part-08-maintenance/chapter-69-review/chapter.md#691-接手一张尚未结案的维护单)
- [69.2 在副本重建一次超时的重放](part-08-maintenance/chapter-69-review/chapter.md#692-在副本重建一次超时的重放)
- [69.3 用同一份产物逐个启动入口](part-08-maintenance/chapter-69-review/chapter.md#693-用同一份产物逐个启动入口)
- [69.4 把资源判断交给下一班](part-08-maintenance/chapter-69-review/chapter.md#694-把资源判断交给下一班)
- [附录：本章必要技术点速查](part-08-maintenance/chapter-69-review/chapter.md#附录本章必要技术点速查)

第八篇第 63、64、66、69 章合计阅读约 136～185 分钟，连续跟做另加 198～280 分钟。三条支线阅读另加 18～27 分钟，缓存对照另加 2～3 分钟。选做远程 CI 另加 10～18 分钟。首次安装和下载另计。

### [第九篇 部署与运维：发布、观测和恢复](part-09-operations/README.md)

**阅读路径**：核心实践。

**起点**：接过第 69 章的构建和交接单，在带旧账号、迁移历史和收据的练习副本上部署 EPP。第 69 章另建的交付检查库只用于探测产物。

**本篇结果**：让另一客户端通过 HTTPS 使用已有服务，在后台任务积压时收到告警，用备份在原主机不可用时接手服务，并判断一次失败发布可以退到哪一步。最后独立发布预约服务，再带着第一版的预约交付取消截止规则。

**阶段边界**：主线使用本地进程，不要求 Docker；第 77～80 章为可选容器化支线，跳过后可直接继续第 81 章。部署当前已经实现的服务，不要求预先具备 AI 或多端接入。完整 EPP 的账号处置恢复门禁在最后综合篇接入。

#### [第 70 章 在本机直接部署服务](part-09-operations/chapter-70-native-deployment/chapter.md)

阅读约 50～65 分钟，已有交接副本时本机跟做另加 75～105 分钟。

- [70.1 用一张旧收据辨认部署目标](part-09-operations/chapter-70-native-deployment/chapter.md#701-用一张旧收据辨认部署目标)
- [70.2 让运行账号只拿到这次部署需要的东西](part-09-operations/chapter-70-native-deployment/chapter.md#702-让运行账号只拿到这次部署需要的东西)
- [70.3 这台机器还容得下哪些进程](part-09-operations/chapter-70-native-deployment/chapter.md#703-这台机器还容得下哪些进程)
- [70.4 先在前台证明配置对得上](part-09-operations/chapter-70-native-deployment/chapter.md#704-先在前台证明配置对得上)
- [70.5 关掉窗口以后由谁负责启动](part-09-operations/chapter-70-native-deployment/chapter.md#705-关掉窗口以后由谁负责启动)
- [70.6 同样少了一个进程，下一步可以相反](part-09-operations/chapter-70-native-deployment/chapter.md#706-同样少了一个进程下一步可以相反)
- [附录：本章必要技术点速查](part-09-operations/chapter-70-native-deployment/chapter.md#附录本章必要技术点速查)

#### [第 71 章 用 iTerm2 经 SSH 接手另一台主机上的服务](part-09-operations/chapter-71-remote-host/outline.md)

[章节提要](part-09-operations/chapter-71-remote-host/outline.md)

- [71.1 先识别将要接手的主机](part-09-operations/chapter-71-remote-host/outline.md#711-先识别将要接手的主机)
- [71.2 通过隧道核对只监听回环的 API](part-09-operations/chapter-71-remote-host/outline.md#712-通过隧道核对只监听回环的-api)
- [71.3 断开终端以后由谁维持服务](part-09-operations/chapter-71-remote-host/outline.md#713-断开终端以后由谁维持服务)
- [71.4 在主机身份改变时恢复接手](part-09-operations/chapter-71-remote-host/outline.md#714-在主机身份改变时恢复接手)

#### [第 72 章 为 API、邮件和通知进程分别分配运行权限](part-09-operations/chapter-72-service-roles/outline.md)

[章节提要](part-09-operations/chapter-72-service-roles/outline.md)

- [72.1 从三笔工作推导各自的权限](part-09-operations/chapter-72-service-roles/outline.md#721-从三笔工作推导各自的权限)
- [72.2 给每个进程独立的启动身份](part-09-operations/chapter-72-service-roles/outline.md#722-给每个进程独立的启动身份)
- [72.3 先让需要的工作通过，再越权一次](part-09-operations/chapter-72-service-roles/outline.md#723-先让需要的工作通过再越权一次)
- [72.4 恢复漏授的权限并交接](part-09-operations/chapter-72-service-roles/outline.md#724-恢复漏授的权限并交接)

#### [第 73 章 定时维护漏跑或同时启动两次以后怎么办](part-09-operations/chapter-73-maintenance-jobs/outline.md)

[章节提要](part-09-operations/chapter-73-maintenance-jobs/outline.md)

- [73.1 把到期头像清理接入宿主调度](part-09-operations/chapter-73-maintenance-jobs/outline.md#731-把到期头像清理接入宿主调度)
- [73.2 让主机错过一个触发时刻](part-09-operations/chapter-73-maintenance-jobs/outline.md#732-让主机错过一个触发时刻)
- [73.3 两个执行者同时工作时认出谁已占用](part-09-operations/chapter-73-maintenance-jobs/outline.md#733-两个执行者同时工作时认出谁已占用)
- [73.4 根据业务进度恢复调度](part-09-operations/chapter-73-maintenance-jobs/outline.md#734-根据业务进度恢复调度)

<a id="第-58-章-运行环境变了怎样交付同一份服务"></a>

#### 第 74 章 运行环境变了，怎样交付同一份服务

- 74.1 把三个长期进程和一次性 CLI 移到第二个部署目录。只交付程序、生产依赖和运行约定，换一个工作目录、账号和端口，用原收据辨认目标。
- 74.2 分别站在 API、邮件 Worker 和浏览器的位置画出连接方向。用进程配置切换监听地址与练习 SMTP 接收端，核对公开 Origin、数据库连接和签名对象地址各由谁解析。
- 74.3 给应用目录只读权限，另给暂存目录写权限。沿一次头像请求定位错误路径或权限，核对标准输出、标准错误以及需要在重启后保留的数据。
- 74.4 用同一程序入口接收终止信号。在第二套环境用旧会话、原操作 ID 和邮件占用做接手验收，再决定是否开启后台消费。交付一份可给本机托管器或镜像使用的启动说明。

核心路线先完成第 75、76 章的证书验证和凭据轮换，再进入[第 81 章](#第-81-章-从域名到服务-dns-https-与反向代理)。选做容器路线也先完成第 75、76 章，再读第 77～80 章。

#### [第 75 章 客户端怎样确认访问的是自己的 HTTPS 服务](part-09-operations/chapter-75-tls-trust/outline.md)

[章节提要](part-09-operations/chapter-75-tls-trust/outline.md)

- [75.1 先让客户端按名字找到目标](part-09-operations/chapter-75-tls-trust/outline.md#751-先让客户端按名字找到目标)
- [75.2 签一张带正确名称的练习证书](part-09-operations/chapter-75-tls-trust/outline.md#752-签一张带正确名称的练习证书)
- [75.3 用两个客户端复现名称和信任差异](part-09-operations/chapter-75-tls-trust/outline.md#753-用两个客户端复现名称和信任差异)
- [75.4 换证后回到原业务请求](part-09-operations/chapter-75-tls-trust/outline.md#754-换证后回到原业务请求)

#### [第 76 章 让 API 和后台进程更换凭据与签名密钥](part-09-operations/chapter-76-rotate-credentials/outline.md)

[章节提要](part-09-operations/chapter-76-rotate-credentials/outline.md)

- [76.1 盘点哪些进程还会以旧身份重连](part-09-operations/chapter-76-rotate-credentials/outline.md#761-盘点哪些进程还会以旧身份重连)
- [76.2 先切一个进程并迫使它新建连接](part-09-operations/chapter-76-rotate-credentials/outline.md#762-先切一个进程并迫使它新建连接)
- [76.3 轮流排空其余角色](part-09-operations/chapter-76-rotate-credentials/outline.md#763-轮流排空其余角色)
- [76.4 撤掉旧登录后验证故障边界](part-09-operations/chapter-76-rotate-credentials/outline.md#764-撤掉旧登录后验证故障边界)

<a id="第-58-章-docker-基础从本地进程到容器"></a>

<a id="第-59-章-docker-基础从本地进程到容器"></a>

#### 第 77 章 Docker 基础：从本地进程到容器

**可选支线**：第 77～80 章可以整体跳过；本地部署主线从第 76 章直接进入第 81 章。

- 77.1 从已能本地运行的服务出发，说明环境交付与隔离的问题，以及直接部署和容器化各自的成本。
- 77.2 认识 Docker 客户端、运行引擎、镜像、容器与镜像仓库；区分容器、普通进程和虚拟机。
- 77.3 准备运行环境，解释 macOS 上 Linux 容器的运行层与 Linux 主机的差异，核对 CPU 架构与资源分配。
- 77.4 拉取固定版本镜像，用 run、ps、logs、exec、inspect 观察容器进程、配置与退出状态。
- 77.5 前台与后台运行、主进程退出、信号传递、停止与删除；区分重新启动原容器和创建新容器。
- 77.6 复现启动即退出、命令错误和资源不足，沿退出码、日志与配置定位；明确容器运行不代表业务可用。

<a id="第-59-章-dockerfile把现有应用构建成镜像"></a>

<a id="第-60-章-dockerfile把现有应用构建成镜像"></a>

#### 第 78 章 Dockerfile：把现有应用构建成镜像

**可选支线**：承接容器基础，为同一个 API、Worker 与管理命令交付镜像。

- 78.1 构建上下文、.dockerignore、FROM、WORKDIR 与 COPY；避免把本地依赖、数据和秘密带入镜像。
- 78.2 镜像分层与构建缓存，先复制依赖清单和锁文件，再安装依赖、复制源码并构建。
- 78.3 多阶段构建，区分构建期与运行期依赖，核对 Prisma 生成产物和运行时所需文件。
- 78.4 用 CMD、ENTRYPOINT 和启动参数从运行镜像启动 API、Worker 和账号 CLI。Prisma 迁移 CLI 属开发依赖，另备同一版本的迁移镜像，带齐 CLI、配置和迁移历史，用迁移账号在发布时执行。
- 78.5 非 root 用户、文件权限、只读文件系统与必要的可写目录；运行时注入秘密，不写入镜像层。
- 78.6 用标签和摘要标识版本，理解镜像仓库的推送与拉取；核对主机架构和原生依赖，避免把本机可运行当作跨机可运行。
- 78.7 在干净容器中运行编译产物，排查缺失依赖、路径错误与权限问题，比较修改源码前后的缓存命中。

<a id="第-60-章-容器的数据与网络重建后什么还在"></a>

<a id="第-61-章-容器的数据与网络重建后什么还在"></a>

#### 第 79 章 容器的数据与网络：重建后什么还在

**可选支线**：在编排之前，先单独理解存储与连接边界；使用独立实验库和对象，原实践数据继续保留。

- 79.1 区分容器可写层、命名数据卷与绑定挂载，说明它们的生命周期、适用场景与宿主机权限。
- 79.2 为 PostgreSQL 与 SeaweedFS 配置持久化目录，分别核对 Filer 元数据与 Volume 内容的实际路径；写入实验数据后删除并重建容器，检查记录、对象与权限是否保留。
- 79.3 区分删除容器、删除镜像与删除数据卷；数据卷不等于备份，清理前先确认挂载与数据归属。
- 79.4 从另一容器访问 API，观察仅绑定回环时连接为何失败。沿用第 74 章的运行配置，改变容器的监听地址并复测，保留本机部署的回环默认值。用自定义网络名称连接依赖，为存储配置网络内可解析的 HTTPS 名称，并让应用容器信任签发证书的 CA。
- 79.5 区分服务网络与宿主机发布端口。先让浏览器信任同一 CA，实际上传头像，再从浏览器打开短期签名地址，分别核对服务端和客户端解析的名称、端口与证书；数据库和存储管理入口保持在内部网络。
- 79.6 排查连接拒绝、名称解析失败、端口冲突和挂载权限错误，区分网络不通、服务未就绪与凭据错误。

<a id="第-61-章-compose组装与维护完整运行环境"></a>

<a id="第-62-章-compose组装与维护完整运行环境"></a>

#### 第 80 章 Compose：组装与维护完整运行环境

**可选支线**：复用前三章的镜像、网络和数据卷，容器化同一套已有功能。

- 80.1 从逐条启动命令整理出 services、networks 与 volumes，连接 API、Worker、PostgreSQL 和 SeaweedFS；对照本地进程配置说明变化。
- 80.2 build 与 image、环境变量插值、env_file 和运行时秘密的职责；检查最终配置，避免把秘密提交仓库。
- 80.3 启动顺序、healthcheck、就绪条件与应用重连的区别；解释 depends_on 不能保证依赖一直可用。
- 80.4 从同一次构建选择迁移镜像和运行镜像。用一次性迁移服务核对目标库并应用迁移，成功后启动业务进程；从运行镜像按需执行管理命令，分别检查应用、迁移与备份账号权限。
- 80.5 使用 up、ps、logs、exec、run、stop 与 down 管理环境，解释重建、重启、项目名称和删除卷选项的影响。
- 80.6 配置重启策略、资源限制、日志轮转与优雅停止；复现依赖重启，观察 API 和 Worker 的退出与恢复。
- 80.7 先完成空环境的功能核对；后续备份恢复章节再把原实践数据转储和对象复制到容器环境，核对数量、引用与权限，不直接搬用正在写入的数据目录。
- 80.8 记录镜像版本与配置，后续发布、观测和恢复复用同一流程；明确 Compose 单机编排的边界，不扩展为 Kubernetes 主线。

<a id="第-62-章-从域名到服务-dns-https-与反向代理"></a>

<a id="第-63-章-从域名到服务-dns-https-与反向代理"></a>

#### 第 81 章 从域名到服务 DNS HTTPS 与反向代理

- 81.1 沿局域网中另一设备或独立虚拟机的一次请求追踪名称解析、连接地址、证书名称与信任链、代理到上游的转发。在局域网给练习主机设置可解析名称，使用客户端信任的本地 CA 完成 HTTPS 主线。
- 81.2 用本机 Caddy 提供静态资源和 API 代理。核对应用 Origin、可信代理与转发头，从真实浏览器完成密码登录和一次需要写令牌的请求。
- 81.3 在同一客户端订阅 SSE，观察首帧、长连接超时及断开后的补查。再从 API 取得头像签名地址并实际取图，核对签名使用的主机名、客户端可达的对象入口和匿名访问权限。
- 81.4 需要公网访问时，比较公网主机直接接入与家庭主机经 Tunnel 接入的域名解析、证书和信任边界。
- 81.5 选做 Cloudflare Tunnel，从目标网络验证请求和回调地址；具备相应平台资质时再回到第五篇完成真实登录联调。

<a id="第-63-章-日志-健康检查与告警"></a>

<a id="第-64-章-日志-健康检查与告警"></a>

#### 第 82 章 日志 健康检查与告警

**从告警回到一次请求、一个任务和一次投递**

同一练习收件人先后申请两次，一笔确定临时失败后重试，一笔在 SMTP 收完正文后丢失最终应答。受理端保存 requestId 与新建的 outbox.id，领取端保存 message_id、claim_id、实际进入发送的尝试序号和结果；区分领取后还未寄送与已经进入投递两种状态。现有 attempts 是累计数，claim_id 在完成后会清除。要按次回查历史，增加可持久查询的尝试记录或明确保留期的结构化日志，在提交或应答丢失处单列证据不足。从单个请求 ID 找到对应的消息、全部尝试、最终状态和通道占用；用同收件人的另一笔检验关联不会串单。

**轮转后按事故时间取回旧日志**

在 macOS 原生任务与 Linux journal 各确定实际输出落点，记录轮转前后两笔请求 ID、时间、角色和进程身份。分别在活动文件和归档、当前和上一时间窗取证，观测磁盘用量与最早可查询时间。在专用练习实例设置容量或时间保留条件，制造有限的日志量，复核达到条件后哪一段证据仍存在。若历史已超出保留窗口，交接单须明确可查的时间范围。将主机重启、服务重启和日志文件重新打开分开验证。


- 82.1 从一次失败请求入手，在代理和现有 JSON 日志中查找时间、进程、构建版本与请求 ID。补齐缺少的关联字段，核对失败日志也会避开 Cookie、正文和签名地址。
- 82.2 分别从进程、API 就绪探测和用户请求观察依赖中断。停下通知 Worker，保持 API 可用，提交产生站内通知的操作，沿事件 ID 查到一笔已到期、尚未处理的任务。
- 82.3 根据最早到期任务的等待时间和 Worker 心跳设置告警，约定触发窗口与接收处；实际收到告警后恢复消费，核对积压消退、用户能读到通知以及告警解除。用短暂波动对照持续故障。
- 82.4 用系统服务日志定位一次重启，把错误、容量与外部投递异常对应到可采取的动作。按关联检索、脱敏或采集需求评估 Pino、集中日志与错误追踪；容器路线补看 Dozzle 与 Docker Socket 代理的读取权限。

<a id="第-64-章-备份-保存的是完整恢复能力"></a>

<a id="第-65-章-备份-保存的是完整恢复能力"></a>

#### 第 83 章 备份 保存的是完整恢复能力

- 83.1 先约定可接受的数据损失时长（RPO）与服务中断时长（RTO）。从一笔旧收据和一个账号的当前头像倒推恢复需要的数据库、桶、角色授权、构建、配置和密钥，标出各自保管处。
- 83.2 在维护窗口停止接收写入，等在途上传结束，停妥 Worker、对象清理和其他写入者。在同一停写窗口导出数据库、复制对象字节，保存对象清单、摘要、元数据与桶权限，再恢复原服务写入。
- 83.3 用支持认证加密的工具保护备份，说明 AES-256-GCM 的作用，分开保管密钥与异地副本；从恢复端验证能取回、解密，并能识别损坏的副本。
- 83.4 安排定时备份与保留策略。让一次备份失败，检查接收端告警和最近一份可恢复的完整备份，按它的时点计算可能丢失的写入。
- 83.5 在隔离空库和独占空桶恢复，恢复期间保持后台投递与清理关闭。按原 ID 读回记录和收据，核对当前头像的摘要、元数据和访问权限；用一份缺少当前对象的副本验证怎样发现错配。
- 83.6 记录停写窗口、备份时点、恢复耗时与未满足的目标，说明恢复端还依赖哪些身份和外部服务。把经验证的备份位置与取用条件交给接班人。

#### [第 84 章 回到误操作之前，再把一条业务记录修回现在](part-09-operations/chapter-84-pitr/outline.md)

[章节提要](part-09-operations/chapter-84-pitr/outline.md)

- [84.1 为一条误改留下可定位的恢复点](part-09-operations/chapter-84-pitr/outline.md#841-为一条误改留下可定位的恢复点)
- [84.2 在隔离目标上重放到误改之前](part-09-operations/chapter-84-pitr/outline.md#842-在隔离目标上重放到误改之前)
- [84.3 决定是回退全库还是移回一笔业务](part-09-operations/chapter-84-pitr/outline.md#843-决定是回退全库还是移回一笔业务)
- [84.4 证明今天仍能继续使用](part-09-operations/chapter-84-pitr/outline.md#844-证明今天仍能继续使用)

<a id="第-65-章-发布-迁移与回退"></a>

<a id="第-66-章-发布-迁移与回退"></a>

#### 第 85 章 发布 迁移与回退

- 85.1 在带旧数据的独立发布副本演练一次规则变更。今后保存的当前记录必须有中文意图，旧记录只能按可信来源补齐，历史修订保留原意。先重发旧客户端的省略和清空请求，确定受影响的契约。下部 EPP 继续沿用原有可空契约。
- 85.2 固定新旧构建、配置与迁移版本，保留发布前备份。在列仍可空时部署能读旧值的过渡版，比较新旧写入方，确定何时可以停止接受清空请求。
- 85.3 切换所有写入方后保护新写入，按可信来源分批回填。遇到没有来源的旧记录，保留原值并说明此时能提供的服务；在另一份所有缺值均可溯源的副本完成回填，再验证并收紧整列约束。
- 85.4 切换托管进程，观察停机、排空与就绪，再用旧客户端和新版分别读写。容器路线按固定镜像摘要做同一轮切换。记录每一步实际运行的构建与数据库约束。
- 85.5 在约束收紧前后各尝试一次程序回退，分别验证旧版能否读历史、能否接受原来合法的写入。按失败位置决定退回兼容版本、停写或向前修复。
- 85.6 新版接收一笔用户写入后再提出整库还原。用发布前备份与当前数据指认会丢失的记录，写明本次处置的依据、可退到的版本及恢复服务的条件。

<a id="第-66-章-故障恢复与日常操作"></a>

<a id="第-67-章-故障恢复与日常操作"></a>

#### 第 86 章 故障恢复与日常操作

- 86.1 从“页面打不开”开始，在客户端、代理、应用和数据库逐层缩小范围；用同一请求的证据决定是否需要碰持久数据。
- 86.2 在隔离环境比较磁盘不足、进程反复退出、任务积压与供应商停发。先限制影响，再确认哪项操作能恢复服务；容器路线补查重启次数、退出原因和卷。
- 86.3 假设原主机已不可用，只凭异地备份、构建和交接资料在另一主机或独立虚拟机重建。选择恢复点，核对角色、密钥与库桶配对，指出可能丢失的写入区间。
- 86.4 前台先在受限入口验证旧账号、记录、头像和操作收据。隔离旧写入者后再切换入口；逐项判断何时开放写入、通知、邮件和对象清理，保留无法确认投递结果的任务。
- 86.5 从接报计时到用户能完成约定业务，比较实际恢复耗时与目标，交代仍暂停的工作及补救条件。账号处置后防止旧数据复活的门禁在下部综合篇接入。

<a id="第-67-章-第九篇回顾与上部综合实践恢复已有服务独立交付新需求"></a>

<a id="第-68-章-第九篇回顾与上部综合实践恢复已有服务独立交付新需求"></a>

#### 第 87 章 第九篇回顾与上部综合实践：恢复已有服务，独立交付新需求

**阅读前提**：先完成第 70～76、81～86 章；第 77～80 章容器化路线按需完成。

- 87.1 接手一次发布后的用户报障。从现象出发，自行选择先查客户端、进程、任务还是数据库与对象存储。
- 87.2 按请求、构建和业务记录判断影响范围。给出下一步处置及其依据，用一条现场证据排除一个看似可行的方案。
- 87.3 在事故副本按选定方案处置，从用户入口核对旧记录、头像、待办和权限。容器路线另核对网络、卷与镜像版本。
- 87.4 揭示故障位置后再改变一个条件，比较回退程序、修复配置、暂停投递和从备份恢复对用户数据的影响，说明处置决定是否随之改变。
- 87.5 交接已恢复的业务、仍有疑问的记录和继续开放的条件。下一次实践从独立的预约项目开始。
- 87.6 第一次交付：一场活动有固定名额，每个账号最多占一个，只有本人可以查看或取消自己的预约，取消后名额归还。自行设计接口、模型与并发规则，部署可由两个账号使用的第一版。
- 87.7 两个账号竞争最后一席，模拟成功响应丢失与重试。再取消、重新预约、重发针对旧预约的取消请求，核对新预约、余量和归属。保存第一版构建以及有效、已取消、重订三种情形的业务记录。
- 87.8 第二次交付：增加取消截止时间。发布前约定旧预约的规则，以及截止前发出、等到取得写入资格时已过线的请求如何裁决。带第一版数据升级并实际制造跨线等待；在另一环境恢复后，用两个账号复核旧单、新单、余量与越权查看或取消的结果。需求和可观察的验收条件先给，参考推导留到独立交付之后。

## 下部 在已有服务上演进产品能力

下部从上部已部署的 EPP 继续，中文意图仍可空；第 85 章的必填演练与第 87 章的预约交付各自留在独立环境。从这里开始，候选表达有了新的来源：模型可能在用户修改原文之后才返回结果。第十篇先解决这一次调用怎样计费、校验和写回，再把已有的表达、账号与任务用于后面的专题。

### 第十篇 接入 AI：外部调用、费用与结果质量

**阅读路径**：EPP 专题。

**起点**：记录、采纳、后台任务与基本运维已完成；现在需要让候选内容由模型生成。

**本篇结果**：以真实模型替换示例候选来源，扩展持久化调用、费用记录和质量判断，继续复用原有确认与采纳流程。

**阶段边界**：先沿记录生成一条业务链讲透；练习调用随练习业务实现。模型访问条件不足时保留现有示例输入，不重复建设 Fake 层。

<a id="第-68-章-把模型放在清楚的业务边界之后"></a>

<a id="第-69-章-把模型放在清楚的业务边界之后"></a>

#### 第 88 章 把模型放在清楚的业务边界之后

- 88.1 业务规则、能力接口和供应商适配的职责，结合 EPP AI Core、Runtime 与 Ports 解释现有取舍。
- 88.2 开发时如何选择真实调用、暂时关闭或少量固定结果；讲清接入条件、费用和开发效率。
- 88.3 准备开发配置、秘密、模型权限和一次调用的费用上限，再开始真实请求。

<a id="第-69-章-完成一次真实的模型调用"></a>

<a id="第-70-章-完成一次真实的模型调用"></a>

#### 第 89 章 完成一次真实的模型调用

- 89.1 AI SDK、供应商适配和模型选择，先完成一次受控调用。
- 89.2 请求参数、结构化输出与响应解析。
- 89.3 超时、取消、限流、连接错误与供应商错误映射。
- 89.4 记录 Token、延迟和已知／未知费用，不把缺失用量当作零费用。

<a id="第-70-章-让生成结果符合业务契约"></a>

<a id="第-71-章-让生成结果符合业务契约"></a>

#### 第 90 章 让生成结果符合业务契约

- 90.1 Prompt、输出 Schema 与确定性业务规则的职责。
- 90.2 表达槽位、语言规则、来源与补充内容。
- 90.3 策略版本、内容摘要与生成身份，解释它们如何影响复用。
- 90.4 结构合法不代表语义可靠：区分程序可拒绝的违规与需要人工／模型评价的质量问题。

<a id="第-71-章-将-ai-调用编排为持久化任务"></a>

<a id="第-72-章-将-ai-调用编排为持久化任务"></a>

#### 第 91 章 将 AI 调用编排为持久化任务

- 91.1 现有记录链能够保存示例候选，现在把真实生成请求编排为 CaptureCall。
- 91.2 新增调用表、输入快照和调用身份；不为已采纳的历史记录自动补发模型请求。
- 91.3 API 写入调用意图，Worker 执行、保存结果并更新当前修订的候选；说明它与通知 Outbox 的职责区别。
- 91.4 供应商成功但结果入库失败时记录未知状态；使用租约身份限制旧执行者写回。
- 91.5 账号不可用或修订已改变时的写回条件；保留原查询与采纳接口，让新生成结果进入既有业务链。

<a id="第-72-章-配置-用量与费用控制"></a>

<a id="第-73-章-配置-用量与费用控制"></a>

#### 第 92 章 配置 用量与费用控制

- 92.1 开发与生产配置隔离、模型策略和配置证据。
- 92.2 预算约束、调用门禁、用量统计与匿名成本记录。
- 92.3 查询、停止、人工对账与恢复；确认未知结果后再决定是否重试。
- 92.4 费用、延迟、可用性和效果之间的取舍，结合 EPP 实际做法解释。
- 92.5 补充费用精度、用量字段和保留规则；旧调用缺失费用时保留未知，不按零费用回填。

<a id="第-73-章-评价-ai-功能-而不只看几个演示"></a>

<a id="第-74-章-评价-ai-功能-而不只看几个演示"></a>

#### 第 93 章 评价 AI 功能 而不只看几个演示

- 93.1 从表达质量目标定义可判断的标准，观察结构正确但不好用的输出。
- 93.2 用有代表性的案例和留出样本比较版本，避免只挑成功演示。
- 93.3 人工语义复核、确定性规则和成本／延迟的共同取舍。
- 93.4 用本项目的评价示例说明结果留存、缓存和复评分；重点是判断结果的方法，不展开评价框架建设。

<a id="第-74-章-第十篇回顾模型返回成功之后业务是否完成"></a>

<a id="第-75-章-第十篇回顾模型返回成功之后业务是否完成"></a>

#### 第 94 章 第十篇回顾：模型返回成功之后，业务是否完成

**阅读前提**：先完成第 88～93 章。

- 94.1 沿调用意图、输入快照、供应商结果、校验和候选写回，区分协议成功、业务成功与效果达标。
- 94.2 改变修订版本，再让旧调用迟到返回；核对过期结果、未知结果与重复费用的处理依据。
- 94.3 用已有评价案例比较质量、成本和延迟，说明何时重试、停止或人工对账，不把未知费用记为零。
- 94.4 归纳真实调用与持久化编排的能力边界，将模型版本、调用成本和失效判断带入向量与搜索。

### 第十一篇 表达管理与搜索：关系、向量和内容演进

**阅读路径**：EPP 专题。

**起点**：已有正式表达、ExpressionForm、基础列表和真实 AI 调用。

**本篇结果**：完成语义检索、关系维护、表达合并与内容变化后的派生数据处理。

**阶段边界**：先解释关系和身份，再进行搜索；具体合并在候选检索之后。练习对表达版本的消费在下一篇落实。

<a id="第-75-章-先理清表达身份形式与关系"></a>

<a id="第-76-章-先理清表达身份形式与关系"></a>

#### 第 95 章 先理清表达身份、形式与关系

- 95.1 同一文本、不同义项、不同形式与同义表达之间的区别。
- 95.2 回看 ExpressionUnit、ExpressionForm、学习记录和来源的关系。
- 95.3 ExpressionAnchor 的方向、关系类型、解释、来源与启用状态。
- 95.4 精确重复、语义相近、关联和合并是不同操作，先明确各自的产品含义。
- 95.5 在已有表达上新增关系结构并保留原 ID、形式和学习记录；关系初始为空，不自动推断为历史事实。

<a id="第-76-章-embedding-把文本转换为可比较的向量"></a>

<a id="第-77-章-embedding-把文本转换为可比较的向量"></a>

#### 第 96 章 Embedding 把文本转换为可比较的向量

- 96.1 从 EPP 的表达查重与语义检索需求出发。
- 96.2 维度、距离、归一化与相似度。
- 96.3 模型、版本和向量命名空间。
- 96.4 文档构造、批量生成与非法向量校验。

<a id="第-77-章-用-postgresql-保存和检索向量"></a>

<a id="第-78-章-用-postgresql-保存和检索向量"></a>

#### 第 97 章 用 PostgreSQL 保存和检索向量

- 97.1 在现有 PostgreSQL 中启用 pgvector，理解向量字段与原生 SQL。
- 97.2 Prisma 不能完整描述的数据库能力如何通过迁移维护。
- 97.3 精确搜索、近似搜索、距离和 HNSW 索引。
- 97.4 用户过滤、内容版本与索引选择，结合执行计划观察结果与性能。
- 97.5 追加扩展、向量列与索引迁移；旧表达暂时没有向量，先处理本次新增表达，下一章保留关键词查询兜底。

<a id="第-78-章-建设星图搜索接口"></a>

<a id="第-79-章-建设星图搜索接口"></a>

#### 第 98 章 建设星图搜索接口

- 98.1 基于已有表达形式和义项组合文本匹配与语义匹配。
- 98.2 查询词向量缓存、调用身份与重复费用控制。
- 98.3 搜索排序、分页、筛选及公开结果投影。
- 98.4 向量不可用时的降级，区分无结果、暂时不可用和检索质量不足。

<a id="第-79-章-去重建议与表达关系如何由用户决定"></a>

<a id="第-80-章-去重建议与表达关系如何由用户决定"></a>

#### 第 99 章 去重建议与表达关系如何由用户决定

- 99.1 从相似结果形成候选建议，说明置信度与来源。
- 99.2 用户接受、拒绝和暂不处理建议时分别保存什么。
- 99.3 建立、修改、移除表达关系，维护引用和关系状态。
- 99.4 精确重复与语义相似采用不同处理，防止自动丢失用户意图。

<a id="第-80-章-合并表达时如何保留引用和历史"></a>

<a id="第-81-章-合并表达时如何保留引用和历史"></a>

#### 第 100 章 合并表达时如何保留引用和历史

- 100.1 选择主表达、处理形式与关系、保留学习记录来源。
- 100.2 合并后的旧 ID、查询跳转和重复操作。
- 100.3 事务、锁顺序与并发合并，避免循环或引用错位。
- 100.4 对已有历史和后续练习的影响；练习快照在下一篇补充实现。

<a id="第-81-章-表达修改之后-派生数据怎么办"></a>

<a id="第-82-章-表达修改之后-派生数据怎么办"></a>

#### 第 101 章 表达修改之后 派生数据怎么办

- 101.1 重新润色、用户接受和内容版本递增。
- 101.2 旧向量、旧建议与旧任务为何失效。
- 101.3 向量重建的预览、执行、缓存复用与安全写回。
- 101.4 删除表达、移除关系和派生数据清理。
- 101.5 将表达版本作为练习目标的输入，为下一篇准备稳定契约。
- 101.6 为已有表达显式安排重建任务，分批回填向量并记录失败；内容版本变化后的旧结果不得覆盖新内容。

<a id="第-82-章-第十一篇回顾表达变了搜索与引用怎样保持有效"></a>

<a id="第-83-章-第十一篇回顾表达变了搜索与引用怎样保持有效"></a>

#### 第 102 章 第十一篇回顾：表达变了，搜索与引用怎样保持有效

**阅读前提**：先完成第 95～101 章。

- 102.1 回顾表达身份、内容版本、关系、向量与检索结果之间的依赖，不把相似度等同于同一表达。
- 102.2 在修改或合并表达后核对旧 ID、引用、搜索结果和重建任务，让迟到向量无法覆盖新内容。
- 102.3 改变向量可用性与候选规模，解释关键词降级、执行计划和检索质量各自回答的问题。
- 102.4 说明哪些内容保持历史事实、哪些派生结果需要重建，为下一篇的练习目标与内容快照确定边界。

### 第十二篇 动态练习：从目标选择到掌握证据

**阅读路径**：EPP 专题。

**起点**：表达身份、内容版本、合并规则和 AI 持久化调用已清楚。

**本篇结果**：实现完整练习闭环，并能解释辅助行为、内容变化与重复操作如何影响掌握证据。

**阶段边界**：复用已有任务和模型适配，不重新讲一遍框架。PracticeCall 从本篇实际操作推导。

<a id="第-83-章-练习池目标选择与内容快照"></a>

<a id="第-84-章-练习池目标选择与内容快照"></a>

#### 第 103 章 练习池、目标选择与内容快照

- 103.1 表达进入／退出练习池的条件，已删除、已合并和候选表达如何排除。
- 103.2 目标选择、换题与没有可用目标时的行为。
- 103.3 PracticeAttempt 的阶段、允许操作与状态迁移。
- 103.4 目标内容快照、版本和练习历史；开始练习后原表达改变意味着什么。
- 103.5 追加练习池字段与 PracticeAttempt 结构，旧表达默认是否参与由明确规则决定；不伪造历史练习或掌握证据。

<a id="第-84-章-出题作答辅助与评价"></a>

<a id="第-85-章-出题作答辅助与评价"></a>

#### 第 104 章 出题、作答、辅助与评价

- 104.1 从出题操作建立 PracticeCall，复用已有调用编排。
- 104.2 题目要求、提示和参考答案分别提供什么信息。
- 104.3 保存原始答案、表达归属和答案来源，区分用户输入与辅助内容。
- 104.4 答案评价、自评以及公开响应，避免让模型结果直接改写业务事实。
- 104.5 将题目、答案、辅助记录和评价连成一次可追踪的练习。
- 104.6 新增 PracticeCall 与回答、辅助和评价记录；复用生成调用基础，但按练习状态定义写回条件。

<a id="第-85-章-重试与中断恢复让练习继续进行"></a>

<a id="第-86-章-重试与中断恢复让练习继续进行"></a>

#### 第 105 章 重试与中断恢复：让练习继续进行

- 105.1 网络中断后先查询练习事实，再判断能否重新提交。
- 105.2 出题失败、评价失败、结果未知与换题的不同处理。
- 105.3 重复操作、并发操作与旧调用结果的写回条件。
- 105.4 表达修改、合并、删除后，历史快照如何保留，哪些证据不再适用。

<a id="第-86-章-从练习结果计算掌握证据"></a>

<a id="第-87-章-从练习结果计算掌握证据"></a>

#### 第 106 章 从练习结果计算掌握证据

- 106.1 用户自评与系统证据分别表达什么。
- 106.2 辅助程度、有效使用与答案来源如何影响证据。
- 106.3 自然日、证据窗口与表达版本；在实际计算中使用 Temporal 处理日期边界。
- 106.4 同一练习重复提交不重复累计，历史证据如何投影为当前掌握状态。
- 106.5 用几条完整练习记录解释状态变化，区分规则判断和学习效果假设。
- 106.6 新增证据记录与投影规则，保留原练习内容；规则或内容版本变化时明确哪些历史证据仍适用。

<a id="第-87-章-第十二篇回顾一次练习留下了什么可靠证据"></a>

<a id="第-88-章-第十二篇回顾一次练习留下了什么可靠证据"></a>

#### 第 107 章 第十二篇回顾：一次练习留下了什么可靠证据

**阅读前提**：先完成第 103～106 章。

- 107.1 沿目标快照、出题、回答、辅助、评价与证据投影，区分用户行为、模型输出和规则判断。
- 107.2 在网络中断、重复提交与旧调用迟到时恢复练习，核对同一行为不会重复累计证据。
- 107.3 改变表达版本、辅助程度或日期边界，说明哪些历史快照保留、哪些证据仍适用。
- 107.4 回顾练习状态与掌握判断的保证范围，为工具入口复用这些业务规则说明输入、权限和恢复约束。

### 第十三篇 共享契约与 Agent 接入：MCP、授权与工具

**阅读路径**：EPP 专题；共享契约按客户端协作需要阅读，MCP 与 Agent 按接入目标阅读。

**起点**：已有可部署的业务、账号和 HTTPS 入口；记录工具消费记录业务，练习工具还需完成练习篇。

**本篇结果**：提取跨端共享契约，让 MCP 与 Agent 复用已有业务规则；在已有用户登录之上，建立面向工具客户端的授权、确认和恢复机制。

**阶段边界**：用户登录方式在第五篇说明，本篇聚焦共享契约与工具客户端授权。MCP 授权前先读第 45.1～45.3 节协议基础，无需完成外部平台登录；沿已有 HTTPS 环境接入真实宿主，未验收条件明确标注。

<a id="第-88-章-共享契约与四仓协作"></a>

<a id="第-89-章-共享契约与四仓协作"></a>

#### 第 108 章 共享契约与四仓协作

- 108.1 服务内部 Shared 与跨端 Contracts 的职责，明确接口公开边界。
- 108.2 Schema、运行时校验和跨端类型；从已有接口逐步提取稳定契约。
- 108.3 CommonJS／ESM、条件导出、原生环境和依赖限制。
- 108.4 精确版本、兼容性、锁文件与消费者升级。
- 108.5 客户端消费：请求身份、错误映射、会话失效与重试策略；用 Web 或已接入的小程序调用记录业务，对照 client-core，不重复讲解登录流程或展开完整前端实现。
- 108.6 从现有运行接口提取契约并迁移消费者；检查旧客户端仍能读取已有记录，随后新增入口沿用这些契约。

<a id="第-89-章-mcp-服务端的职责"></a>

<a id="第-90-章-mcp-服务端的职责"></a>

#### 第 109 章 MCP 服务端的职责

- 109.1 Host、Client、Server 与工具调用。
- 109.2 以 MCP 2026-07-28 的逐请求元数据与 server/discover 为主线，对照旧版 initialize；用官方 SDK 的兼容入口共用工具定义，并按实际宿主请求版本验证兼容范围。
- 109.3 输入 Schema、工具结果与协议错误。
- 109.4 将 EPP 业务服务接入 MCP，保持规则一致。

<a id="第-90-章-作为-oauth-服务端签发授权码和访问令牌"></a>

<a id="第-91-章-作为-oauth-服务端签发授权码和访问令牌"></a>

#### 第 110 章 作为 OAuth 服务端签发授权码和访问令牌

- 110.1 复用第五篇第 45.1～45.3 节的 OAuth 角色与协议知识，明确 MCP 客户端授权与用户登录的区别；已有密码会话即可作为用户登录基础。
- 110.2 元数据发现、已知客户端预登记、redirect URI、issuer 和 resource 约束；比较 CIMD 与旧 DCR 的适用条件，按所选宿主确定接入方式。
- 110.3 用户授权、授权码的一次性消费与 S256 PKCE。
- 110.4 访问令牌、Scope、资源绑定和业务权限校验。
- 110.5 新增授权记录及令牌存储，不更换用户的业务身份；授权后的调用访问原有数据和服务。

<a id="第-91-章-刷新撤销与授权恢复"></a>

<a id="第-92-章-刷新撤销与授权恢复"></a>

#### 第 111 章 刷新、撤销与授权恢复

- 111.1 访问令牌过期和刷新令牌的不同职责。
- 111.2 刷新轮换、重放检测与授权撤销。
- 111.3 并发刷新、断线后的未知结果及客户端恢复。
- 111.4 会话、账号状态、Web 权限与 MCP scope 的相互边界。

<a id="第-92-章-设计可恢复的批量工具"></a>

<a id="第-93-章-设计可恢复的批量工具"></a>

#### 第 112 章 设计可恢复的批量工具

- 112.1 业务身份、客户端操作身份与逐项结果。
- 112.2 批量限制、部分成功与错误隔离。
- 112.3 断线后先查事实，再决定是否重试。
- 112.4 EPP 记录、修订、采纳与查询工具的实现。

<a id="第-93-章-把用户确认落实为服务端事实"></a>

<a id="第-94-章-把用户确认落实为服务端事实"></a>

#### 第 113 章 把用户确认落实为服务端事实

- 113.1 工具调用许可与具体候选采纳的区别。
- 113.2 确认页、候选集合和修订版本绑定；按宿主能力比较普通链接与 URL elicitation，区分同意打开页面和服务端已保存采纳事实。
- 113.3 过期、修改、取消、部分选择与重复确认。
- 113.4 HTML 转义、登录跳转与跨用户操作防护。

<a id="第-94-章-让-agent-自身生成-epp-负责校验与保存"></a>

<a id="第-95-章-让-agent-自身生成-epp-负责校验与保存"></a>

#### 第 114 章 让 Agent 自身生成 EPP 负责校验与保存

- 114.1 EPP 模型生成与 Agent 自身生成两条路径，各自的费用和信任边界。
- 114.2 GenerationRequest、输出契约与生成者声明。
- 114.3 接入 Agent 候选、出题与答案评价，复用已有业务校验和确认规则。
- 114.4 Skills、插件配置、STDIO 代理与 HTTP 服务的边界。
- 114.5 从实际宿主走完记录和练习，解释工具权限不等于用户已采纳具体内容。

<a id="第-95-章-第十三篇回顾换一个调用入口业务边界是否仍然成立"></a>

<a id="第-96-章-第十三篇回顾换一个调用入口业务边界是否仍然成立"></a>

#### 第 115 章 第十三篇回顾：换一个调用入口，业务边界是否仍然成立

**阅读前提**：先完成所选接入路线：共享契约阅读第 108 章；MCP 与 Agent 路线继续完成第 109～114 章，并满足所调用业务的前置条件。

- 115.1 只选择契约路线时，改变契约版本并核对已有消费者，解释类型检查、运行时校验与兼容性的区别。
- 115.2 完成 MCP 路线后，对照 HTTP 与工具调用同一业务，核对用户身份、Scope、资源归属和具体操作确认。
- 115.3 沿批量部分成功、断线与授权撤销还原事实，确定可查询、可重试与必须重新确认的范围。
- 115.4 接入 Agent 生成后核对候选与练习的写回条件，真实宿主联调按所选路线记录结果。
- 115.5 归纳多入口共享业务的能力边界，将授权、在途调用和对象引用纳入下一篇的账号处置范围。

### 第十四篇 数据生命周期与综合实践

**阅读路径**：下部深入机制与专题综合实践。

**起点**：账号状态、事务、任务、外部调用、对象写入跟踪和基础备份恢复已经建立。

**本篇结果**：完成跨系统账号处置与恢复核对，再用已完成的下部专题独立处理一次产品需求变更。

**阶段边界**：完整处置机制按 EPP 的实际需求和风险解释，不默认要求所有小项目采用同等复杂度。真实平台未验收的部分保持明确标注。

<a id="第-96-章-把账号处置建模为可靠流程"></a>

<a id="第-97-章-把账号处置建模为可靠流程"></a>

#### 第 116 章 把账号处置建模为可靠流程

- 116.1 从数据范围和实际删除需求决定处置流程的复杂度。
- 116.2 删除请求、重新认证、明确确认与受理回执。
- 116.3 冻结账号、撤销会话与阻止新操作，接入前文的账号状态约定。
- 116.4 幂等请求、状态查询和失败恢复。
- 116.5 识别数据库之外仍在进行的发送、模型调用和对象写入。
- 116.6 为已有账号追加处置请求和进度结构，先冻结，再沿现有业务关系逐项清理；前面建立的记录与对象是本篇操作对象。

<a id="第-97-章-清理在线数据与对象"></a>

<a id="第-98-章-清理在线数据与对象"></a>

#### 第 117 章 清理在线数据与对象

- 117.1 沿关系追踪应删除和应保留的数据，说明审计与匿名成本的边界。
- 117.2 停止任务、处理正在进行的调用，复用前文的状态与租约检查。
- 117.3 数据库锁、对象写入预留和账号冻结如何共同约束并发操作。
- 117.4 删除文件、清理版本和核对残留；处置中断后的恢复。
- 117.5 结合已有业务观察删除期间的写回行为，不新增独立故障测试体系。

<a id="第-98-章-防止恢复备份让已删除账号重新出现"></a>

<a id="第-99-章-防止恢复备份让已删除账号重新出现"></a>

#### 第 118 章 防止恢复备份让已删除账号重新出现

- 118.1 为什么恢复旧备份会重新引入已删除账号，以及独立处置事实的必要性。
- 118.2 签名链、检查点、序号与完整性校验，说明适用条件和运维负担。
- 118.3 混合备份清理、恢复后重新核对及遗漏处置事实时的停止条件。
- 118.4 API、Worker 在恢复门禁通过前保持关闭。
- 118.5 在基础恢复上加入处置核对，完成一次包含已删除账号的完整恢复操作。

<a id="第-99-章-第十四篇回顾与下部综合实践账号处置后的产品演进"></a>

<a id="第-100-章-第十四篇回顾与下部综合实践账号处置后的产品演进"></a>

#### 第 119 章 第十四篇回顾与下部综合实践：账号处置后的产品演进

**阅读前提**：先完成第 116～118 章。综合实践从自己已接入的下部专题中选一项。

- 119.1 回顾账号冻结、在线清理与恢复门禁；复用上一章恢复结果，改变在途写回或处置事实缺失的条件，说明哪些资源必须保持关闭、凭什么恢复服务。
- 119.2 选择一个已有专题，交付与账号处置有关的需求变更。例如，账号冻结后收到先前发出的模型结果，或从备份恢复出该账号的搜索条目。先写明用户应能看到什么、哪些写入仍可能发生。
- 119.3 自行确定需要保留的事实、拒绝写入的位置和恢复条件，带着已有数据实现变更。
- 119.4 重现所选专题中的迟到写入或旧数据恢复，核对已处置账号及另一正常账号的结果。对照验收依据说明证据、取舍和剩余限制。


## 阅读说明与导航

### 篇章跳转

**[上部 独立开发与交付一个后端服务](#上部-独立开发与交付一个后端服务)**

- [第一篇 先运行起来：从浏览器走进 Node.js](#第一篇-先运行起来从浏览器走进-nodejs)（第 1～7 章）
- [第二篇 用 Nest 组织一个可持续扩展的服务](#第二篇-用-nest-组织一个可持续扩展的服务)（第 8～15 章）
- [第三篇 持久化与结构演进：PostgreSQL、SQL、Prisma](#第三篇-持久化与结构演进postgresqlsqlprisma)（第 16～24 章）
- [第四篇 业务一致性：修订、候选、事务与采纳](#第四篇-业务一致性修订候选事务与采纳)（第 25～36 章）
- [第五篇 让服务认识用户：身份、会话与权限](#第五篇-让服务认识用户身份会话与权限)（第 37～48 章）
- [第六篇 请求返回以后：后台任务与用户通知](#第六篇-请求返回以后后台任务与用户通知)（第 49～57 章）
- [第七篇 用户资料与文件：数据库之外的数据](#第七篇-用户资料与文件数据库之外的数据)（第 58～62 章）
- [第八篇 开发与维护：管理命令、构建和性能](#第八篇-开发与维护管理命令构建和性能)（第 63～69 章）
- [第九篇 部署与运维：发布、观测和恢复](#第九篇-部署与运维发布观测和恢复)（第 70～87 章）
**[下部 在已有服务上演进产品能力](#下部-在已有服务上演进产品能力)**

- [第十篇 接入 AI：外部调用、费用与结果质量](#第十篇-接入-ai外部调用费用与结果质量)（第 88～94 章）
- [第十一篇 表达管理与搜索：关系、向量和内容演进](#第十一篇-表达管理与搜索关系向量和内容演进)（第 95～102 章）
- [第十二篇 动态练习：从目标选择到掌握证据](#第十二篇-动态练习从目标选择到掌握证据)（第 103～107 章）
- [第十三篇 共享契约与 Agent 接入：MCP、授权与工具](#第十三篇-共享契约与-agent-接入mcp授权与工具)（第 108～115 章）
- [第十四篇 数据生命周期与综合实践](#第十四篇-数据生命周期与综合实践)（第 116～119 章）

### 阅读方式与范围

这组技术分享从已有 JavaScript 和前端经验出发，围绕 EPP 的实际问题，从零搭建一个公开的 EPP。代码、数据结构和运行步骤随章节逐步建立，开发数据与真实用户数据隔离。从篇标题进入导读，从章题查看正文或章节提要。

每篇以导读明确起点，以正式总结章回顾能力、综合应用并衔接后续内容。总结章在完成本篇相应主线后阅读；可选路线只核对已选择的部分，不能成为核心路线的新前提。上部在第 87 章从已有服务的恢复转入新需求的独立交付；下部在第 119 章用所选专题完成综合实践。

全书分两部、十四篇。各章分别估算阅读和动手时间，篇导读列出适用的章次与选读路线。

[目标与能力路线](backend-capabilities.md)说明各项后端能力由哪些章节共同建立，以及怎样通过改变约束、跨场景应用和独立交付核对。EPP 的功能进度与读者能力进度分别维护；必要基础的覆盖范围由独立后端开发的目标决定。

- **核心实践**：第一至九篇按顺序阅读，建立服务、数据、身份、任务、文件和本地部署能力，在第 87.6～87.8 节完成上部独立交付；第 44～47 章登录分支、第 50 章登录分支接线、第 54 章隔离交付之外的真实邮件，以及第 77～80 章容器部署均按需选读。OAuth／OIDC 的协议基础在需要跨端授权前补读第 45.1～45.3 节。
- **EPP 专题**：第十至十二篇接入 AI、搜索和练习；第十三篇讲共享契约、MCP 与 Agent 工具接入；小程序与外部登录分支已归入第五篇。
- **深入机制**：第十四篇在既有数据和系统上完成账号处置；第 119 章结合已接入的专题，验证账号处置后迟到结果与恢复数据的处理。

JavaScript 基础语法直接使用。测试仅简短介绍，依赖替换只说明开发条件和费用取舍。早期候选使用少量示例内容，后续替换其来源；不会因此另建一套贯穿全书的模拟系统。

PostgreSQL 与对象存储先以本地进程运行，在对应章节说明必要的安装、启动和连接；部署运维篇继续以本机直接部署为主线。Docker、容器数据卷与 Compose 归入第九篇的可选支线，跳过容器化仍能完成发布、观测、备份、恢复及后续专题。

### 技术主线与业务演进

篇章以技术主题组织。每个主题从当前系统的具体问题出发，讲清机制、实现和适用边界，再把结果接回同一个实践项目；原理需要展开时保留完整篇幅。下面列出各阶段的业务需求、技术重点和数据演进方式。

每章交代四件事：**已有功能、当前问题、需要掌握的技术、完成后的行为**。凡涉及持久化变化，再交代旧表／新表、迁移与回填、接口变化和旧数据是否仍可用；迁移随需求发生，不在数据库篇讲完后消失。

| 篇章 | 业务为什么需要变化 | 技术重点 | 数据与系统如何延续 |
| --- | --- | --- | --- |
| 第一篇 | 接收并再次查看英语原文 | Node.js 请求、进程和运行环境 | 内存记录；暂不持久化 |
| 第二篇 | 同一接口需要清楚的职责和错误响应 | Nest、依赖注入、契约和配置 | 接口行为延续；只调整代码组织 |
| 第三篇 | 重启后仍可读取，再补充中文意图 | 关系模型、SQL、ORM 和迁移 | 最小用户／记录表 → 迁移基线 → 新字段；保留原记录 |
| 第四篇 | 保留输入历史，确认候选成为正式表达 | 关系演进、状态机、事务、并发和幂等 | 旧记录回填首个修订；追加候选、表达及命令结构 |
| 第五篇 | 用户通过不同方式登录并访问自己的已有记录 | 密码、会话、权限；可选小程序、外部登录与扫码确认 | 新增凭据、会话和注册意图；可选追加平台身份与登录票据，原 userId 和记录归属延续 |
| 第六篇 | 请求结束后能接续寄信，确认成功后能查到站内通知 | Outbox、独立进程、重试和 SSE | 申请留下邮件工作，确认留下通知工作；在线提示触发收件箱回查 |
| 第七篇 | 账号可以维护资料和头像 | 文件处理、私有对象存储与补偿 | 原账号增加可见性与改名记录，临时预览验证后再发布头像引用，跟踪候选对象与回收 |
| 第八篇 | 现有服务需要日常管理和稳定构建 | 独立 CLI、构建和性能定位 | 复用业务服务；增加操作记录与构建产物 |
| 第九篇 | 服务需要在线运行、更新与恢复 | 本地部署、进程托管、HTTPS、观测、备份和兼容发布；容器化可选 | 带历史的 EPP 验证发布与接管，独立的预约服务带第一版数据完成第二次交付 |
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
| 可靠采纳 | 先有修订／候选与结果模型，再实现事务、并发和幂等；不以未解释的表为例 |
| Worker 发送 | 已有同步 SMTP 发送，再建立 Outbox 数据与一次性处理，最后启动 Worker |
| SSE | 通知先能持久化和补查，再增加实时传递 |
| 对象存储接入 | 已有用户与头像处理；第 60 章以本地进程提供存储端点，不依赖 Compose |
| 本地部署 | 已有构建产物与本地依赖；第 70 章完成配置、启动和进程托管，无需 Docker |
| 容器化部署（可选） | 已有本地可运行的服务；第 77～79 章依次讲容器、镜像构建、存储与网络，第 80 章再用 Compose 组装环境 |
| 真实 AI | 已有候选确认、任务执行与部署基础；先配置费用边界，再接调用与结果写回 |
| 搜索与练习 | 原表达继续有效，搜索先处理无向量旧数据；练习再引入自己的状态和调用表 |
| 小程序与外部登录（可选） | 已有用户、会话与权限；在第五篇接入身份映射，不依赖共享契约拆包或 MCP；真实联调需满足对应平台条件 |
| 平台真实联调（可选） | 对应登录章节先列明资质、配置与访问要求；需要公网 HTTPS 时，完成第九篇后返回第五篇联调 |
| MCP 授权 | 已有用户登录与 HTTPS；先读第 45.1～45.3 节协议基础及第 108 章共享契约，无需先接入外部登录平台 |
| 小程序网站扫码（可选） | 已有用户、小程序会话与网站会话；先用轮询推进票据状态，不依赖 SSE 或微信网站开放平台扫码支线 |
| 完整处置与恢复 | 基础备份恢复先完成，再沿原数据增加处置事实和恢复门禁 |

## 配套参考资料

参考资料供实践时按需查阅，原理仍在对应正文讲清。扩展讨论可根据项目需要选读。

| 资料 | 范围 |
| --- | --- |
| A 源码导航 | 随公开项目的代码逐步建立，索引前文已编写的模块、命令与配置 |
| B 数据库字典 | 表、字段、关系、约束、索引及业务原因 |
| C 状态与操作索引 | 记录、候选、调用、练习、授权、登录票据与账号处置 |
| D 配置手册 | 读取方、用途、默认行为、秘密属性和环境约束 |
| E 接口与工具索引 | REST、MCP、回调、错误响应与权限 |
| F 操作与排障速查 | 本地启动、迁移、管理命令、现有测试命令、重建、发布与恢复 |
| G 安全边界索引 | 身份、权限、用户确认、数据归属与防重放 |
| H 机制比较 | Session／JWT、轮询／消息队列、SSE／WebSocket 等实际选择 |
| I 扩展讨论 | 缓存、独立队列、多实例与更复杂部署的适用条件 |

Redis、BullMQ、Kubernetes 等作为有条件的演进讨论，在相应需求出现时再说明适用条件。平台接入的验证方法与结果在对应实践中说明。
