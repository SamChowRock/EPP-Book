# EPP 后端开发实践

面向已有 JavaScript、前端开发和前后端联调经验的开发者，从空项目开始，逐步搭建一个公开的 EPP，掌握后端开发与维护。\
围绕 Node.js、Nest、数据库与部署运维，在同一个持续演进的项目中讲清原理、实现与取舍；所需代码随实践逐步编写。\
以下按篇、章、小节展开；阅读路线和前置依赖附在完整目录之后。

学习默认使用开启本机调试与自动重启的开发模式，通过 Postman 等图形客户端发送和保存请求，修改保存后再次点击发送验证；生产构建与运行方式在对应章节分别声明。首次跟做前可按[开发环境配置（macOS）](environment-setup.md)准备所需软件。

## [第一篇 先运行起来：从浏览器走进 Node.js](part-01-nodejs/README.md)

**阅读路径**：核心实践。

**起点**：已有 JavaScript、前端开发和前后端联调经验；从一个空的独立实践项目开始。

**本篇结果**：启动、调用、调试和停止一个内存版记录服务，解释运行环境与异步执行的边界，并能检查、构建和在独立目录运行 TypeScript 服务。

**阶段边界**：先用单包和内存存储；后续接入 Nest 与 PostgreSQL。运行所需的语法按已有基础使用。

### [第 1 章 先认识我们要建设的 EPP](part-01-nodejs/chapter-01-epp/chapter.md)

- [1.1 用一条英语表达串起记录、修订、候选、采纳和练习，先分清这些业务对象。](part-01-nodejs/chapter-01-epp/chapter.md#11-从一条英语表达开始)
- [1.2 用一张请求路径图认识客户端、API、Worker、数据库和外部服务；复杂机制在使用时展开。](part-01-nodejs/chapter-01-epp/chapter.md#12-一条记录怎样经过整个系统)
- [1.3 明确项目的建设范围与演进路线，以及开发数据的隔离边界。](part-01-nodejs/chapter-01-epp/chapter.md#13-项目的建设范围与演进路线)

- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-01-epp/chapter.md#附录本章必要技术点速查)

阅读参考（估算）：约 22～25 分钟。场景推演可选做，附录供回查。

### [第 2 章 先启动一个最小记录服务](part-01-nodejs/chapter-02-minimal-service/chapter.md)

- [2.1 明确最小需求：输入一条英语原文，可以查看列表和详情；先只保存 ID、原文与创建时间。](part-01-nodejs/chapter-02-minimal-service/chapter.md#21-先确定三个接口和一条记录)
- [2.2 用 nvm 固定运行环境，从 HTTP 输入、流读取、写入条件与响应责任推导内存版服务。](part-01-nodejs/chapter-02-minimal-service/chapter.md#22-用原生-nodejs-把服务写出来)
- [2.3 用 Postman 和浏览器观察请求与错误，核对输入校验发生在写入之前。](part-01-nodejs/chapter-02-minimal-service/chapter.md#23-让请求结果变得可以观察)
- [2.4 用断点区分对象构造、写入与响应；处理端口占用，通过重启解释状态寿命与持久化需要。](part-01-nodejs/chapter-02-minimal-service/chapter.md#24-暂停一次请求再停止整个服务)
- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-02-minimal-service/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 47～52 分钟；跟做另加约 30～40 分钟，边读边做合计约 77～92 分钟。附录按需查阅，首次安装 nvm 与 Node.js 另计。

### [第 3 章 Node.js 程序究竟运行在哪里](part-01-nodejs/chapter-03-node-runtime/chapter.md)

- [3.1 从启动上下文理解进程、工作目录、环境变量继承与标准输入输出。](part-01-nodejs/chapter-03-node-runtime/chapter.md#31-进程工作目录环境变量与标准输入输出)
- [3.2 区分运行时能力与访问权限，理解文件内容与资源访问的不同寿命。](part-01-nodejs/chapter-03-node-runtime/chapter.md#32-浏览器与-nodejs-的全局对象文件访问和权限边界)
- [3.3 区分启动参数、退出状态、活动资源与信号收尾，解释服务为何持续运行。](part-01-nodejs/chapter-03-node-runtime/chapter.md#33-启动参数退出码信号以及为什么服务能持续运行)
- [3.4 从换目录失败推导路径基准与启动配置，再迁移到调用者指定的输入输出文件。](part-01-nodejs/chapter-03-node-runtime/chapter.md#34-相对路径文件读写与环境差异复现换目录后启动失败)
- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-03-node-runtime/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 43～48 分钟；跟做另加约 33～43 分钟，边读边做合计约 76～91 分钟。附录按需查阅。

### [第 4 章 事件循环如何影响服务的响应能力](part-01-nodejs/chapter-04-event-loop/chapter.md)

- [4.1 从慢速上传观察 I/O 等待期间其他请求如何继续，区分并发与并行。](part-01-nodejs/chapter-04-event-loop/chapter.md#41-一个请求等待-io-时其他请求能否继续)
- [4.2 对照等待、连续计算与分段计算，解释 async、计时边界和输入规模。](part-01-nodejs/chapter-04-event-loop/chapter.md#42-cpu-密集计算为什么阻塞服务)
- [4.3 从定时器迟到、异步异常与超时实验，区分停止等待和取消工作。](part-01-nodejs/chapter-04-event-loop/chapter.md#43-定时器异常超时与取消)
- [4.4 用合作取消、期限清理与有界批次落实异步工作的资源归属。](part-01-nodejs/chapter-04-event-loop/chapter.md#44-把异步能力用于服务端资源管理)
- [4.5 区分 JavaScript、libuv 线程池、Worker Threads 和独立进程，沿新需求选择执行位置。](part-01-nodejs/chapter-04-event-loop/chapter.md#45-执行到底发生在哪里)
- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-04-event-loop/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 53～63 分钟；跟做另加约 40～50 分钟，边读边做合计约 93～113 分钟。附录按需查阅。

### [第 5 章 TypeScript 如何变成可运行的服务](part-01-nodejs/chapter-05-typescript/chapter.md)

- [5.1 从类型迁移与运行时输入边界，区分类型检查、转译与运行的责任。](part-01-nodejs/chapter-05-typescript/chapter.md#51-类型检查转译与运行各自负责什么)
- [5.2 沿 CommonJS、ESM、包入口与扩展名解释模块解析的实际报错。](part-01-nodejs/chapter-05-typescript/chapter.md#52-commonjsesm-与模块解析的实际报错)
- [5.3 用 TypeScript watch 与 tsc 建立开发、检查和构建命令，并用 tsx 独立示例对照开发工具与产物解析。](part-01-nodejs/chapter-05-typescript/chapter.md#53-建立开发检查与构建命令)
- [5.4 区分锁文件、开发依赖与运行依赖，在独立目录核对完整运行单元。](part-01-nodejs/chapter-05-typescript/chapter.md#54-锁文件依赖与一份能够搬走的程序)
- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-05-typescript/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 53～63 分钟；跟做另加约 43～53 分钟，合计约 96～116 分钟。首次下载依赖另计。

### [第 6 章 第一篇回顾：把服务搬离开发目录](part-01-nodejs/chapter-06-review/chapter.md)

- [6.1 第一篇结束后，怎样理解自己对 Node.js 的掌握。](part-01-nodejs/chapter-06-review/chapter.md#61-第一篇结束后怎样理解自己对-nodejs-的掌握)
- [6.2 不先改代码，先说明程序依赖什么。](part-01-nodejs/chapter-06-review/chapter.md#62-不先改代码先说明程序依赖什么)
- [6.3 用一条有效输入和一条无效输入确认边界。](part-01-nodejs/chapter-06-review/chapter.md#63-用一条有效输入和一条无效输入确认边界)
- [6.4 把进程寿命、配置寿命与产物寿命分开。](part-01-nodejs/chapter-06-review/chapter.md#64-把进程寿命配置寿命与产物寿命分开)
- [6.5 需求变成批量处理时，先判断成本再选执行方式。](part-01-nodejs/chapter-06-review/chapter.md#65-需求变成批量处理时先判断成本再选执行方式)
- [6.6 如何确认这一篇已经形成可迁移的能力。](part-01-nodejs/chapter-06-review/chapter.md#66-如何确认这一篇已经形成可迁移的能力)
- [章末附录：本章必要技术点速查。](part-01-nodejs/chapter-06-review/chapter.md#附录本章必要技术点速查)

时间参考（估算）：先按顺序读完第 1～5 章；本章阅读约 38～48 分钟，新增操作另加约 35～50 分钟，附录按需查阅。

**第一篇时间参考（估算）**：第 1～6 章正文，阅读约 256～299 分钟，跟做另加约 181～236 分钟，合计约 437～535 分钟（约 7 小时 17 分～8 小时 55 分）。知识支线单列，首次环境安装与依赖下载另计；计算依据和分项见[篇导读](part-01-nodejs/README.md#整篇投入与使用方式)。

## [第二篇 用 Nest 组织一个可持续扩展的服务](part-02-nestjs/README.md)

**阅读路径**：核心实践。

**起点**：已经有能运行的内存版 HTTP 服务和基础调试命令。

**本篇结果**：理解 Nest 的设计取舍与适用条件，将已有记录接口迁入框架，建立业务边界、输入输出契约、可读日志和配置入口。

**阶段边界**：保留内存存储；依赖注入围绕实际组件展开。独立 Worker、管理命令在各自场景引入。

### [第 7 章 从手写服务走向 Nest](part-02-nestjs/chapter-07-enter-nest/chapter.md)

- [7.1 从职责拆分到框架选择：为什么引入 Nest。](part-02-nestjs/chapter-07-enter-nest/chapter.md#71-从职责拆分到框架选择为什么引入-nest)
- [7.2 将 HTTP 处理与业务规则分开。](part-02-nestjs/chapter-07-enter-nest/chapter.md#72-将-http-处理与业务规则分开)
- [7.3 Nest 怎样把设计原则落实为运行机制。](part-02-nestjs/chapter-07-enter-nest/chapter.md#73-nest-怎样把设计原则落实为运行机制)
- [7.4 把第一篇接口迁入 Nest，并验证行为一致。](part-02-nestjs/chapter-07-enter-nest/chapter.md#74-把第一篇接口迁入-nest并验证行为一致)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-07-enter-nest/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 70～80 分钟；跟做另加约 55～65 分钟，合计约 125～145 分钟。首次下载新增依赖另计，附录按需查阅。

### [第 8 章 Controller 定义系统的 HTTP 入口](part-02-nestjs/chapter-08-controllers/chapter.md)

- [8.1 路由、路径参数、查询参数、请求体与响应映射。](part-02-nestjs/chapter-08-controllers/chapter.md#81-路由路径参数查询参数请求体与响应映射)
- [8.2 Controller 怎样将 HTTP 输入交给业务逻辑，哪些工作应留在 Service。](part-02-nestjs/chapter-08-controllers/chapter.md#82-controller-怎样将-http-输入交给业务逻辑哪些工作应留在-service)
- [8.3 先用请求和响应观察接口行为，再在依赖注入章节替换组件。](part-02-nestjs/chapter-08-controllers/chapter.md#83-先用请求和响应观察接口行为再在依赖注入章节替换组件)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-08-controllers/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 52～62 分钟；跟做另加约 40～50 分钟，合计约 92～112 分钟。附录按需查阅，支线单列。

### [第 9 章 Provider 与依赖注入：把组件组装交给容器](part-02-nestjs/chapter-09-providers/chapter.md)

- [9.1 从手动组装对象到构造函数注入，解决真实出现的依赖问题。](part-02-nestjs/chapter-09-providers/chapter.md#91-从手动组装对象到构造函数注入解决真实出现的依赖问题)
- [9.2 Provider、注入令牌，以及类、工厂、值 Provider 的选择。](part-02-nestjs/chapter-09-providers/chapter.md#92-provider注入令牌以及类工厂值-provider-的选择)
- [9.3 将内存存储放在可替换接口后面，为数据库接入留下边界。](part-02-nestjs/chapter-09-providers/chapter.md#93-将内存存储放在可替换接口后面为数据库接入留下边界)
- [9.4 开发中的依赖替换与 Fake：用固定详情返回观察替换位置与适用范围。](part-02-nestjs/chapter-09-providers/chapter.md#94-开发中的依赖替换与-fake)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-09-providers/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 55～65 分钟；跟做另加约 45～55 分钟，合计约 100～120 分钟。附录按需查阅，支线单列。

### [第 10 章 Module 建立清楚的业务边界](part-02-nestjs/chapter-10-modules/chapter.md)

- [10.1 imports、providers、controllers 与 exports 如何组装已有记录服务。](part-02-nestjs/chapter-10-modules/chapter.md#101-importsproviderscontrollers-与-exports-如何组装已有记录服务)
- [10.2 模块公开能力与内部实现，避免把数据库操作随意泄漏给调用方。](part-02-nestjs/chapter-10-modules/chapter.md#102-模块公开能力与内部实现避免把数据库操作随意泄漏给调用方)
- [10.3 通过一处循环依赖理解职责划分；复杂业务模块在对应篇章再对照。](part-02-nestjs/chapter-10-modules/chapter.md#103-通过一处循环依赖理解职责划分复杂业务模块在对应篇章再对照)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-10-modules/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 45～55 分钟；跟做另加约 35～45 分钟，合计约 80～100 分钟。附录按需查阅，支线单列。

### [第 11 章 建立可信的输入与错误边界](part-02-nestjs/chapter-11-contracts/chapter.md)

- [11.1 从记录接口收到不合法输入出发，解释 TypeScript 类型与 Zod 运行时校验的区别。](part-02-nestjs/chapter-11-contracts/chapter.md#111-从记录接口收到不合法输入出发解释-typescript-类型与-zod-运行时校验的区别)
- [11.2 为现有记录定义请求和公开响应，明确哪些字段可由用户修改。](part-02-nestjs/chapter-11-contracts/chapter.md#112-为现有记录定义请求和公开响应明确哪些字段可由用户修改)
- [11.3 校验失败、业务冲突、权限错误与系统故障的错误契约；权限类型先说明含义，身份篇再落地。](part-02-nestjs/chapter-11-contracts/chapter.md#113-校验失败业务冲突权限错误与系统故障的错误契约权限类型先说明含义身份篇再落地)
- [11.4 生成并使用现有接口的 OpenAPI／Swagger 文档，观察调用方如何定位字段和错误。](part-02-nestjs/chapter-11-contracts/chapter.md#114-生成并使用现有接口的-openapiswagger-文档观察调用方如何定位字段和错误)
- [11.5 此章先在入口直接校验并返回明确错误；下一章再用 Nest 请求机制统一接入。](part-02-nestjs/chapter-11-contracts/chapter.md#115-此章先在入口直接校验并返回明确错误下一章再用-nest-请求机制统一接入)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-11-contracts/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 68～78 分钟；跟做另加约 50～60 分钟，合计约 118～138 分钟。首次下载新增依赖另计，附录按需查阅，支线单列。

### [第 12 章 请求经过 Nest 时发生了什么](part-02-nestjs/chapter-12-request-pipeline/chapter.md)

- [12.1 从重复处理推导执行位置：Middleware、Guard、Pipe、Interceptor 与 Filter 各自能看见什么。](part-02-nestjs/chapter-12-request-pipeline/chapter.md#121-从重复处理推导执行位置)
- [12.2 把已有契约接到正确的边界，集中输入解析、公开输出与 Problem Details，保持业务接口行为。](part-02-nestjs/chapter-12-request-pipeline/chapter.md#122-把已有契约接到正确的边界)
- [12.3 沿失败的位置选择断点，再改变执行条件，观察拒绝、恢复、短路与局部过滤器。](part-02-nestjs/chapter-12-request-pipeline/chapter.md#123-沿失败的位置选择断点再改变执行条件)
- [12.4 用一个最小请求断言留下回归证据，说明运行方法与适用范围。](part-02-nestjs/chapter-12-request-pipeline/chapter.md#124-用一个最小请求断言留下回归证据)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-12-request-pipeline/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 50～60 分钟；跟做另加约 40～50 分钟，合计约 90～110 分钟。附录按需查阅，支线单列。

### [第 13 章 配置与生命周期：让应用可靠地启动和退出](part-02-nestjs/chapter-13-configuration-lifecycle/chapter.md)

- [13.1 把启动输入变成一份可注入的配置。](part-02-nestjs/chapter-13-configuration-lifecycle/chapter.md#131-把启动输入变成一份可注入的配置)
- [13.2 环境、秘密与诊断信息各有边界。](part-02-nestjs/chapter-13-configuration-lifecycle/chapter.md#132-环境秘密与诊断信息各有边界)
- [13.3 沿同一次请求找到耗时与失败。](part-02-nestjs/chapter-13-configuration-lifecycle/chapter.md#133-沿同一次请求找到耗时与失败)
- [13.4 让停止接收、完成工作和释放资源按顺序发生。](part-02-nestjs/chapter-13-configuration-lifecycle/chapter.md#134-让停止接收完成工作和释放资源按顺序发生)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-13-configuration-lifecycle/chapter.md#附录本章必要技术点速查)

时间参考（估算）：只阅读约 90～105 分钟；配置、日志与关闭实验另加约 65～80 分钟，合计约 155～185 分钟。按约8500个汉字、580行代码与命令，以及正常/失败启动、请求关联、处理中关闭和期限对照估算，尚未经过读者实测；支线单列，首次安装环境不计入。

### [第 14 章 第二篇回顾：沿一次请求解释职责与生命周期](part-02-nestjs/chapter-14-review/chapter.md)

**阅读前提**：先完成第 7～13 章。

- [14.1 从启动到响应，重建一条有证据的执行路径。](part-02-nestjs/chapter-14-review/chapter.md#141-从启动到响应重建一条有证据的执行路径)
- [14.2 改变输入规则，并证明存储仍可替换。](part-02-nestjs/chapter-14-review/chapter.md#142-改变输入规则并证明存储仍可替换)
- [14.3 用日志、故障与交付产物核对同一套判断。](part-02-nestjs/chapter-14-review/chapter.md#143-用日志故障与交付产物核对同一套判断)
- [14.4 带着已有边界进入数据库篇。](part-02-nestjs/chapter-14-review/chapter.md#144-带着已有边界进入数据库篇)
- [章末附录：本章必要技术点速查。](part-02-nestjs/chapter-14-review/chapter.md#附录本章必要技术点速查)

时间参考（估算）：阅读约 45～55 分钟；独立改造、请求排错、关闭与产物核对另加约 50～65 分钟，合计约 95～120 分钟。

第二篇主线第 7～14 章合计：阅读约 475～560 分钟，操作另加约 380～470 分钟，总计约 855～1030 分钟（14 小时 15 分～17 小时 10 分）。按各章实际内容估算，非读者实测；支线单列在[篇导读](part-02-nestjs/README.md#全篇时间参考)，不并入主线。

## [第三篇 持久化与结构演进：PostgreSQL、SQL、Prisma](part-03-postgresql/README.md)

**阅读路径**：核心实践。

**起点**：已有能保存原文并查询的内存版 Nest 服务；重启后会丢失数据。

**本篇结果**：为原有功能建立最小表，接入 Prisma 持久化，再给已有记录追加中文意图，完成第一次带数据的结构演进。

**阶段边界**：先用 SQL 建立并理解两张最小表，再将已有结构纳入 Prisma 迁移管理；后续全部沿同一批数据追加迁移，修订与候选尚未创建。

### [第 15 章 PostgreSQL 运行环境：安装、连接与实例管理](part-03-postgresql/chapter-15-postgresql-environment/chapter.md)

**时间参考（估算）**：阅读约 80～95 分钟；配置、连接、故障对照和启停操作另加约 50～65 分钟，首次软件下载、网络等待及遇到 WSL 跨环境故障后的处理另计。

- [15.1 从现有存储契约确定接入边界](part-03-postgresql/chapter-15-postgresql-environment/chapter.md#151-从现有存储契约确定接入边界)：核对存储替换中的查询顺序、类型映射、失败语义和首批模型范围。
- [15.2 PostgreSQL 实例如何定位和授权](part-03-postgresql/chapter-15-postgresql-environment/chapter.md#152-postgresql-实例如何定位和授权)：通过数据目录定位实例，划分开发权限，解释连接参数默认值与 search_path。
- [15.3 安装、启动，再从两个客户端连接同一个库](part-03-postgresql/chapter-15-postgresql-environment/chapter.md#153-安装启动再从两个客户端连接同一个库)：本机独立 PostgreSQL 18 实例，psql 与 DBeaver 对照，实际区分入口、认证和目标库错误。
- [15.4 验证实例启停，固定后续开发环境](part-03-postgresql/chapter-15-postgresql-environment/chapter.md#154-验证实例启停固定后续开发环境)：保存环境标识，选择关闭模式并核对重连，安排开发库与迁移校验环境。

### [第 16 章 关系建模：为已有记录设计第一组表](part-03-postgresql/chapter-16-relational-modeling/chapter.md)

**时间参考（估算）**：阅读约 125～145 分钟；建表、写入、关系图核对、约束失败对照及时间／重连操作另加约 50～65 分钟，环境沿用上一章，支线单列。

- [16.1 从记录归属推导最小模型](part-03-postgresql/chapter-16-relational-modeling/chapter.md#161-从记录归属推导最小模型)：从需求确定行粒度，以函数依赖、修改异常和事实归属推导分表，再衔接现有接口。
- [16.2 让类型和约束分别承担明确的责任](part-03-postgresql/chapter-16-relational-modeling/chapter.md#162-让类型和约束分别承担明确的责任)：区分候选键、代理键与业务唯一性，选择类型与约束，保留已有字符串契约。
- [16.3 建表、写入，再确认留下了什么](part-03-postgresql/chapter-16-relational-modeling/chapter.md#163-建表写入再确认留下了什么)：创建用户与记录表、外键和索引，在 DBeaver 关系图与属性中核对模型，提交首批数据并处理失败。
- [16.4 一对多关系到底保证了什么](part-03-postgresql/chapter-16-relational-modeling/chapter.md#164-一对多关系到底保证了什么)：用约束失败解释数量与删除边界，从共享需求推导关联实体及当前关系与历史事件的区别。
- [16.5 时间经过数据库与 JSON 时发生了什么](part-03-postgresql/chapter-16-relational-modeling/chapter.md#165-时间经过数据库与-json-时发生了什么)：核对时区、精度、默认时间与 API 表示，区分稳定排序和插入顺序，保留数据供后续查询与迁移使用。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-16-relational-modeling/chapter.md#附录本章必要技术点速查)。

### [第 17 章 SQL：查询、筛选和修改自己的记录](part-03-postgresql/chapter-17-sql/chapter.md)

**时间参考（估算）**：阅读约 115～135 分钟；查询、写入回滚、关联聚合、参数与双会话观察另加约 60～80 分钟，支线单列。

- [17.1 从读取意图推导条件、顺序与修改范围](part-03-postgresql/chapter-17-sql/chapter.md#171-从读取意图推导条件顺序与修改范围)：明确创建时间与 ID 排序、字面搜索和 OFFSET 边界，用归属条件与 RETURNING 观察写入结果。
- [17.2 先决定结果粒度，再选择 JOIN、分组与子查询](part-03-postgresql/chapter-17-sql/chapter.md#172-先决定结果粒度再选择-join分组与子查询)：解释外连接、NULL 占位、COUNT、ON／WHERE、HAVING 和 EXISTS 的不同问题。
- [17.3 把输入值与 SQL 结构分开](part-03-postgresql/chapter-17-sql/chapter.md#173-把输入值与-sql-结构分开)：用 PREPARE 观察值参数，以独立 JS 示例推导动态条件与排序白名单。
- [17.4 从冲突结果回到设计规则](part-03-postgresql/chapter-17-sql/chapter.md#174-从冲突结果回到设计规则)：区分冲突跳过、内容一致与幂等，保留既有唯一性和删除语义。
- [17.5 用两个会话看清提交与可见性](part-03-postgresql/chapter-17-sql/chapter.md#175-用两个会话看清提交与可见性)：在 DBeaver 按 PID 核对独立会话，观察 READ COMMITTED 下提交、回滚和结果刷新，处理未知结果并清理实验。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-17-sql/chapter.md#附录本章必要技术点速查)。

### [第 18 章 Prisma：将已有表纳入 Schema 与迁移管理](part-03-postgresql/chapter-18-prisma/chapter.md)

**时间参考（估算）**：阅读约 110～130 分钟；配置、模型核对、空库重放与基线登记另加约 55～75 分钟，支线单列，安装与下载等待另计。

- [18.1 先分清模型、客户端与数据库](part-03-postgresql/chapter-18-prisma/chapter.md#181-先分清模型客户端与数据库)：从手写 SQL 的维护责任比较 ORM 与独立迁移工具，建立三种产物的对应关系。
- [18.2 从已有表得到模型，再生成客户端](part-03-postgresql/chapter-18-prisma/chapter.md#182-从已有表得到模型再生成客户端)：固定 Prisma 7 配置，核对映射、物理类型、关系和约束，区分客户端改名与数据库演进。
- [18.3 为已有结构建立可重放的基线](part-03-postgresql/chapter-18-prisma/chapter.md#183-为已有结构建立可重放的基线)：区分目标模型与执行历史，补回 CHECK，以目录查询和数据对照核对基线，保留旧数据。
- [18.4 在独立空库重放，再登记已有库](part-03-postgresql/chapter-18-prisma/chapter.md#184-在独立空库重放再登记已有库)：先验证建表与约束，再登记日常库，解释状态、校验值与中断恢复。
- [18.5 下一次变化怎样进入同一条历史](part-03-postgresql/chapter-18-prisma/chapter.md#185-下一次变化怎样进入同一条历史)：推导影子库、开发迁移与部署迁移的责任，区分结构重建、代码回退与数据恢复。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-18-prisma/chapter.md#附录本章必要技术点速查)。

### [第 19 章 Prisma 与 Nest：让记录接口使用持久化数据](part-03-postgresql/chapter-19-prisma-nest/chapter.md)

**时间参考（估算）**：阅读约 150～175 分钟；接入、图形联调、故障与产物核对另加约 70～90 分钟，支线单列，依赖下载另计。

- [19.1 在 Nest 中明确数据库资源的所有者](part-03-postgresql/chapter-19-prisma-nest/chapter.md#191-在-nest-中明确数据库资源的所有者)：推导资源归属与运行时配置，先接好错误和安全日志，再建立适配器与初始化失败清理。
- [19.2 用原来的记录验证查询与公开响应](part-03-postgresql/chapter-19-prisma-nest/chapter.md#192-用原来的记录验证查询与公开响应)：实现存储后接通模块，保持字段、字面搜索与时间点，落实明确排序，并从 DBeaver 核对已有行。
- [19.3 写入、输入边界与错误如何连接起来](part-03-postgresql/chapter-19-prisma-nest/chapter.md#193-写入输入边界与错误如何连接起来)：拒绝不可原样表示的文本，区分数据库错误与不存在，从断点返回 SQL 复现。
- [19.4 连接池、等待与关闭的真实顺序](part-03-postgresql/chapter-19-prisma-nest/chapter.md#194-连接池等待与关闭的真实顺序)：用池耗尽和等锁实验定位等待阶段，排空已有工作后释放资源。
- [19.5 保留事实，分别核对开发重启与交付产物](part-03-postgresql/chapter-19-prisma-nest/chapter.md#195-保留事实分别核对开发重启与交付产物)：保留数据重启，检查独立运行依赖、生产配置与恢复路径。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-19-prisma-nest/chapter.md#附录本章必要技术点速查)。

### [第 20 章 Migration：给已有记录增加中文意图](part-03-postgresql/chapter-20-migrations/chapter.md)

**时间参考**：阅读约 135～155 分钟，操作另加 75～100 分钟（估算；支线单列）。

- [20.1 先决定旧数据的含义，再决定列怎么加](part-03-postgresql/chapter-20-migrations/chapter.md#201-先决定旧数据的含义再决定列怎么加)。
- [20.2 从模型变更到可审查、可重放的迁移](part-03-postgresql/chapter-20-migrations/chapter.md#202-从模型变更到可审查可重放的迁移)。
- [20.3 让创建、补充和读取共享同一份事实](part-03-postgresql/chapter-20-migrations/chapter.md#203-让创建补充和读取共享同一份事实)。
- [20.4 如果以后要求必填，如何不让旧数据突然失效](part-03-postgresql/chapter-20-migrations/chapter.md#204-如果以后要求必填如何不让旧数据突然失效)。
- [20.5 漂移、迁移失败与回退：先找出哪一层不一致](part-03-postgresql/chapter-20-migrations/chapter.md#205-漂移迁移失败与回退先找出哪一层不一致)。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-20-migrations/chapter.md#附录本章必要技术点速查)。

### [第 21 章 第三篇回顾：带着旧记录完成一次结构演进](part-03-postgresql/chapter-21-review/chapter.md)

**阅读前提**：先完成第 15～20 章。

- [21.1 从接口结果回到 SQL、模型和历史](part-03-postgresql/chapter-21-review/chapter.md#211-从接口结果回到-sql模型和历史)。
- [21.2 保留旧记录，安排一次约束放宽](part-03-postgresql/chapter-21-review/chapter.md#212-保留旧记录安排一次约束放宽)。
- [21.3 用失败和恢复区分三个版本](part-03-postgresql/chapter-21-review/chapter.md#213-用失败和恢复区分三个版本)。
- [21.4 单行正确之后，下一步为什么是一致性](part-03-postgresql/chapter-21-review/chapter.md#214-单行正确之后下一步为什么是一致性)。
- [章末附录：本章必要技术点速查](part-03-postgresql/chapter-21-review/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：只阅读约75～90分钟；跟做另加50～70分钟，合计约125～160分钟。第三篇全部主线阅读约790～925分钟，操作约410～545分钟；支线另列于篇导读。

## [第四篇 业务一致性：修订、候选、事务与采纳](part-04-consistency/README.md)

**阅读路径**：核心实践。

**起点**：原文、中文意图与记录归属已经持久化；具备 SQL、Prisma 和追加迁移能力。

**本篇结果**：从保留修改历史逐步扩展到候选和正式表达，围绕采纳掌握状态机、事务、并发、幂等与查询优化。

**阶段边界**：先说明新业务和数据关系，再实现其技术保证。候选内容仅用少量示例输入；AI 接入前不创建向量或付费调用。

### [第 22 章 关系演进：从覆盖输入到保留修订历史](part-04-consistency/chapter-22-revisions/chapter.md)

- [22.1 覆盖保存以后，哪些问题已经无法回答](part-04-consistency/chapter-22-revisions/chapter.md#221-覆盖保存以后哪些问题已经无法回答)：定义完整快照、旧 PATCH 兼容与历史边界。
- [22.2 把记录身份和内容快照分开](part-04-consistency/chapter-22-revisions/chapter.md#222-把记录身份和内容快照分开)：推导一对多、版本身份、联合唯一与当前读取，解释快照重复及旧列保留。
- [22.3 停写、回填、核对，再切换读取](part-04-consistency/chapter-22-revisions/chapter.md#223-停写回填核对再切换读取)：保留旧值建立初始修订，检查覆盖和差异，安排失败与中断恢复。
- [22.4 追加修订，并让所有读路径理解最新内容](part-04-consistency/chapter-22-revisions/chapter.md#224-追加修订并让所有读路径理解最新内容)：创建原子性、参数化追加、序号冲突、最新搜索和有界历史，贯通图形请求及产物核对。
- [22.5 来源与 chunks：什么时候用列，什么时候用 JSON](part-04-consistency/chapter-22-revisions/chapter.md#225-来源与-chunks什么时候用列什么时候用-json)：区分未知与空数组，按身份、引用和查询需求选择 JSON 或关系表。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-22-revisions/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约145～165分钟，跟做另加95～120分钟；按约12800个汉字、约255行代码／命令、三张机制图、十三张实际界面图及迁移与图形联调步骤估算，支线单列于篇导读。

### [第 23 章 状态机与关系建模：修订如何进入候选确认](part-04-consistency/chapter-23-candidates/chapter.md)

- [23.1 从用户操作推导候选状态](part-04-consistency/chapter-23-candidates/chapter.md#231-从用户操作推导候选状态)：区分命令与事实，定义pending、discarded及拒绝转移。
- [23.2 先说明采纳后哪些事实需要保存](part-04-consistency/chapter-23-candidates/chapter.md#232-先说明采纳后哪些事实需要保存)：推导候选、学习记录、正式表达和形式的行粒度与引用责任。
- [23.3 追加候选表，旧修订保持无候选](part-04-consistency/chapter-23-candidates/chapter.md#233-追加候选表旧修订保持无候选)：用有限占位与约束建立候选集，不伪造旧候选。
- [23.4 保存、读取与放弃，让状态真正影响写入](part-04-consistency/chapter-23-candidates/chapter.md#234-保存读取与放弃让状态真正影响写入)：实现归属检查、空集合、条件转移与完整接口，观察CHECK和状态机的不同。
- [23.5 采纳、放弃、未选择与旧修订是不同事实](part-04-consistency/chapter-23-candidates/chapter.md#235-采纳放弃未选择与旧修订是不同事实)：绑定确认对象，保留旧版决定，并按实际事实恢复。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-23-candidates/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约130～150分钟，跟做另加80～100分钟；按约9200个汉字、约290行代码／命令、三张机制图、十一张实际界面图及迁移、接口与产物恢复步骤估算，支线单列于篇导读。

### [第 24 章 事务：让多次修改成为一次业务动作](part-04-consistency/chapter-24-transactions/chapter.md)

- [24.1 建立采纳结果，再观察半次成功](part-04-consistency/chapter-24-transactions/chapter.md#241-建立采纳结果再观察半次成功)：追加正式表达、形式与学习记录，比较自动提交、回滚和完整提交。
- [24.2 把采纳放进一个数据库事务](part-04-consistency/chapter-24-transactions/chapter.md#242-把采纳放进一个数据库事务)：贯通状态契约、条件写入、关联结果与HTTP，核对失败回滚。
- [24.3 一个事务，也可能两次读到不同结果](part-04-consistency/chapter-24-transactions/chapter.md#243-一个事务也可能两次读到不同结果)：用两个真实会话比较读取视图与40001，解释隔离的保证与代价。
- [24.4 让事务短而完整，不把网络等待包进去](part-04-consistency/chapter-24-transactions/chapter.md#244-让事务短而完整不把网络等待包进去)：划定数据库提交边界，从已有事实处理超时、未知结果和旧程序恢复。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-24-transactions/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约120～140分钟，跟做另加90～115分钟；按约7800个汉字、约190行代码／命令、三张机制图、十二张实际界面图及迁移、采纳、两会话实验和产物恢复估算，支线单列于篇导读。

### [第 25 章 并发控制：两个请求同时到来怎么办](part-04-consistency/chapter-25-concurrency/chapter.md)

- [25.1 两次都读到pending，为什么不能两次都采纳](part-04-consistency/chapter-25-concurrency/chapter.md#251-两次都读到pending为什么不能两次都采纳)：用两个连接复现过期判断，再由条件UPDATE裁决竞争。
- [25.2 唯一约束守住关系，迁移先面对已有事实](part-04-consistency/chapter-25-concurrency/chapter.md#252-唯一约束守住关系迁移先面对已有事实)：审核重复、追加约束并核对启动前提与原数据。
- [25.3 需要保护一段判断时，锁住什么](part-04-consistency/chapter-25-concurrency/chapter.md#253-需要保护一段判断时锁住什么)：比较行锁、等待策略与事务建议锁，按PID定位阻塞。
- [25.4 等待、死锁与重试，分别在哪里结束](part-04-consistency/chapter-25-concurrency/chapter.md#254-等待死锁与重试分别在哪里结束)：统一锁序，只对明确中止做有限的完整事务重试。
- [25.5 用户与表达边界，为什么不能只锁候选](part-04-consistency/chapter-25-concurrency/chapter.md#255-用户与表达边界为什么不能只锁候选)：从生命周期与表达复用推导共享前提和扩展顺序。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-25-concurrency/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约130～150分钟，跟做另加90～115分钟；按约9500个汉字、约110行代码／命令、三张机制图、十七张实际操作图及迁移、双会话锁实验与产物恢复估算，支线单列于篇导读。

### [第 26 章 幂等与审计：响应丢失后如何安全重试](part-04-consistency/chapter-26-idempotency/chapter.md)

- [26.1 采纳已经提交，但客户端没有收到响应](part-04-consistency/chapter-26-idempotency/chapter.md#261-采纳已经提交但客户端没有收到响应)。
- [26.2 给成功操作保存一份可核对的回执](part-04-consistency/chapter-26-idempotency/chapter.md#262-给成功操作保存一份可核对的回执)。
- [26.3 把业务修改和重放结果放进同一事务](part-04-consistency/chapter-26-idempotency/chapter.md#263-把业务修改和重放结果放进同一事务)。
- [26.4 响应丢失、请求变化和旧历史，各自怎样恢复](part-04-consistency/chapter-26-idempotency/chapter.md#264-响应丢失请求变化和旧历史各自怎样恢复)。
- [26.5 领域审计与运行日志，分别留下什么](part-04-consistency/chapter-26-idempotency/chapter.md#265-领域审计与运行日志分别留下什么)。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-26-idempotency/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约115～135分钟，跟做另加80～100分钟；按本章正文、代码、机制图与迁移、响应丢失、重放、锁等待、断点和交付恢复操作估算，支线单列于篇导读。

### [第 27 章 一致性整合：完成可靠的候选采纳](part-04-consistency/chapter-27-integration/chapter.md)

- [27.1 先把一次采纳的不同身份放回同一条链](part-04-consistency/chapter-27-integration/chapter.md#271-先把一次采纳的不同身份放回同一条链)。
- [27.2 给相同内容一个可重建的身份，同时保留原文](part-04-consistency/chapter-27-integration/chapter.md#272-给相同内容一个可重建的身份同时保留原文)。
- [27.3 在同一事务里复用表达，保留每一次决定](part-04-consistency/chapter-27-integration/chapter.md#273-在同一事务里复用表达保留每一次决定)。
- [27.4 把生成与语义能力放在正确的边界外](part-04-consistency/chapter-27-integration/chapter.md#274-把生成与语义能力放在正确的边界外)。
- [27.5 让新旧数据一起通过迁移、读取与恢复](part-04-consistency/chapter-27-integration/chapter.md#275-让新旧数据一起通过迁移读取与恢复)。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-27-integration/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约125～145分钟，跟做另加85～110分钟；按正文、规范化与迁移代码、两张机制图、九张实拍及旧数据升级、图形请求、锁等待、断点与交付恢复估算，支线单列于篇导读。

### [第 28 章 构建可供客户端使用的查询接口](part-04-consistency/chapter-28-queries/chapter.md)

- [28.1 先决定一行代表什么，再决定查哪些表](part-04-consistency/chapter-28-queries/chapter.md#281-先决定一行代表什么再决定查哪些表)。
- [28.2 把存储关系变成公开响应](part-04-consistency/chapter-28-queries/chapter.md#282-把存储关系变成公开响应)。
- [28.3 先提供有界列表，再把分页问题留在明处](part-04-consistency/chapter-28-queries/chapter.md#283-先提供有界列表再把分页问题留在明处)。
- [28.4 用历史数据走完概览、来源和详情](part-04-consistency/chapter-28-queries/chapter.md#284-用历史数据走完概览来源和详情)。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-28-queries/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约100～120分钟，跟做另加60～85分钟；按正文、查询与契约代码、一张机制图、六张实拍、图形请求、数据库对照、断点与旧数据交付验证估算，支线单列于篇导读。

### [第 29 章 分页与时间：下一页从哪里继续](part-04-consistency/chapter-29-pagination/chapter.md)

- [29.1 Offset跳过位置，Cursor接着边界](part-04-consistency/chapter-29-pagination/chapter.md#291-offset跳过位置cursor接着边界)。
- [29.2 给边界加上可验证的查询上下文](part-04-consistency/chapter-29-pagination/chapter.md#292-给边界加上可验证的查询上下文)。
- [29.3 接回两个列表，保留旧调用方](part-04-consistency/chapter-29-pagination/chapter.md#293-接回两个列表保留旧调用方)。
- [29.4 先确定是哪一天，再形成UTC区间](part-04-consistency/chapter-29-pagination/chapter.md#294-先确定是哪一天再形成utc区间)。
- [章末附录：本章必要技术点速查](part-04-consistency/chapter-29-pagination/chapter.md#附录本章必要技术点速查)。

时间参考（估算）：阅读约125～150分钟，跟做另加70～95分钟；按正文、分页与签名代码、两张机制图、五张操作截图、图形请求、SQL日期边界、断点和产物恢复估算，支线单列于篇导读。

### [第 30 章 索引与执行计划：查询为什么变慢](part-04-consistency/chapter-30-indexes/chapter.md)

- [30.1 从列表和详情看索引的收益与写入成本](part-04-consistency/chapter-30-indexes/chapter.md#301-从列表和详情看索引的收益与写入成本)
- [30.2 单列索引、联合索引与排序](part-04-consistency/chapter-30-indexes/chapter.md#302-单列索引联合索引与排序)
- [30.3 用 EXPLAIN 看数据库实际读了多少行](part-04-consistency/chapter-30-indexes/chapter.md#303-用-explain-看数据库实际读了多少行)
- [30.4 区分查询次数、返回体积和连接占用](part-04-consistency/chapter-30-indexes/chapter.md#304-区分查询次数返回体积和连接占用)
- [30.5 将选定索引追加到已有库](part-04-consistency/chapter-30-indexes/chapter.md#305-将选定索引追加到已有库)

时间参考（估算）：阅读约65～85分钟，跟做另加50～70分钟；按执行计划对照、六张实拍、请求与连接池诊断、已有库升级估算，支线单列。

### [第 31 章 第四篇回顾：让采纳经得起竞争与重试](part-04-consistency/chapter-31-review/chapter.md)

**阅读前提**：先完成第 22～30 章。

- [31.1 一次采纳里，究竟什么不能重复](part-04-consistency/chapter-31-review/chapter.md#311-一次采纳里究竟什么不能重复)
- [31.2 把采纳和放弃换个顺序，再丢掉一次响应](part-04-consistency/chapter-31-review/chapter.md#312-把采纳和放弃换个顺序再丢掉一次响应)
- [31.3 两个人抢最后一个预约名额](part-04-consistency/chapter-31-review/chapter.md#313-两个人抢最后一个预约名额)
- [31.4 从学习列表查回来源，也查清是谁的来源](part-04-consistency/chapter-31-review/chapter.md#314-从学习列表查回来源也查清是谁的来源)
- [附录：本章必要技术点速查](part-04-consistency/chapter-31-review/chapter.md#附录本章必要技术点速查)

时间参考（估算）：阅读约45～60分钟，跟做另加40～60分钟。第四篇主线合计阅读约1100～1300分钟，跟做约740～970分钟；支线另列于篇导读。

## [第五篇 让服务认识用户：身份、会话与权限](part-05-identity/README.md)

**阅读路径**：核心实践。

**起点**：已有完整记录业务，但身份仍是隔离环境里的固定开发用户。

**本篇结果**：替换开发身份，建立密码登录、会话管理、权限和注册流程；按需增加小程序与外部身份登录，使不同登录方式归入同一本地账号与权限体系。

**阶段边界**：先用密码登录走通身份、会话和权限，再扩展注册与重置；邮件先同步发到本地 SMTP 服务，后续用 Outbox 改造可靠性。第 37～40 章是可选登录分支，不依赖共享契约拆包或 MCP；跳过后从第 36 章进入第 41 章回顾，再进入第 42 章。平台资质、应用配置和可访问地址在对应章节列出；需要部署环境的真实联调，在完成第九篇后回到本篇，不用模拟结果代替接通事实。

### [第 32 章 安全地保存密码与秘密](part-05-identity/chapter-32-secrets/chapter.md)

阅读约100～120分钟；编码与跟做另加65～90分钟（估算）。

- [32.1 同样是秘密，为什么不能都存成摘要](part-05-identity/chapter-32-secrets/chapter.md#321-同样是秘密为什么不能都存成摘要)
- [32.2 用 Argon2id 验证密码，也量出它的成本](part-05-identity/chapter-32-secrets/chapter.md#322-用-argon2id-验证密码也量出它的成本)
- [32.3 随机令牌只保存摘要，比较前先确定字节](part-05-identity/chapter-32-secrets/chapter.md#323-随机令牌只保存摘要比较前先确定字节)
- [32.4 让秘密只出现在需要它的地方](part-05-identity/chapter-32-secrets/chapter.md#324-让秘密只出现在需要它的地方)
- [32.5 给已有用户增加凭据，不搬动旧记录](part-05-identity/chapter-32-secrets/chapter.md#325-给已有用户增加凭据不搬动旧记录)
- [附录：本章必要技术点速查](part-05-identity/chapter-32-secrets/chapter.md#附录本章必要技术点速查)

### [第 33 章 Session 与 Cookie 登录状态从哪里来](part-05-identity/chapter-33-sessions/chapter.md)

阅读约130～155分钟；编码与跟做另加155～195分钟。

- [33.1 密码通过以后，服务端保存什么](part-05-identity/chapter-33-sessions/chapter.md#331-密码通过以后服务端保存什么)
- [33.2 用 Cookie 传递令牌，让请求带上正确身份](part-05-identity/chapter-33-sessions/chapter.md#332-用-cookie-传递令牌让请求带上正确身份)
- [33.3 看见会话，再分别撤销和退出](part-05-identity/chapter-33-sessions/chapter.md#333-看见会话再分别撤销和退出)
- [33.4 主动改密，为什么必须同时撤销全部会话](part-05-identity/chapter-33-sessions/chapter.md#334-主动改密为什么必须同时撤销全部会话)
- [33.5 登录以后，原来的记录仍在哪里](part-05-identity/chapter-33-sessions/chapter.md#335-登录以后原来的记录仍在哪里)
- [附录：本章必要技术点速查](part-05-identity/chapter-33-sessions/chapter.md#附录本章必要技术点速查)

### [第 34 章 鉴权与授权 登录了也不代表能操作](part-05-identity/chapter-34-authorization/chapter.md)

阅读约85～105分钟；编码与跟做另加90～120分钟。

- [34.1 三个问题，分别在哪里回答](part-05-identity/chapter-34-authorization/chapter.md#341-三个问题分别在哪里回答)
- [34.2 新字段的默认值，也是一项权限决定](part-05-identity/chapter-34-authorization/chapter.md#342-新字段的默认值也是一项权限决定)
- [34.3 建立第二个本地账号，亲眼看见资源边界](part-05-identity/chapter-34-authorization/chapter.md#343-建立第二个本地账号亲眼看见资源边界)
- [34.4 资格每次读取，改动才能影响现有会话](part-05-identity/chapter-34-authorization/chapter.md#344-资格每次读取改动才能影响现有会话)
- [34.5 请求停止在哪里，必须有明确的先后关系](part-05-identity/chapter-34-authorization/chapter.md#345-请求停止在哪里必须有明确的先后关系)
- [附录：本章必要技术点速查](part-05-identity/chapter-34-authorization/chapter.md#附录本章必要技术点速查)

### [第 35 章 保护基于浏览器的服务入口](part-05-identity/chapter-35-browser-boundary/chapter.md)

**时间参考（估算）**：阅读约120～145分钟；编码、浏览器联调与产物核对另加110～145分钟。

- [35.1 浏览器替谁携带Cookie，又允许谁读响应](part-05-identity/chapter-35-browser-boundary/chapter.md#351-浏览器替谁携带cookie又允许谁读响应)
- [35.2 让写请求提供会话之外的证明](part-05-identity/chapter-35-browser-boundary/chapter.md#352-让写请求提供会话之外的证明)
- [35.3 保护响应解释，也给请求成本设边界](part-05-identity/chapter-35-browser-boundary/chapter.md#353-保护响应解释也给请求成本设边界)
- [35.4 谁转发了请求，决定转发头能不能信](part-05-identity/chapter-35-browser-boundary/chapter.md#354-谁转发了请求决定转发头能不能信)
- [35.5 在真实浏览器里分清发送、携带和读取](part-05-identity/chapter-35-browser-boundary/chapter.md#355-在真实浏览器里分清发送携带和读取)
- [附录：本章必要技术点速查](part-05-identity/chapter-35-browser-boundary/chapter.md#附录本章必要技术点速查)

### [第 36 章 注册、验证与密码重置](part-05-identity/chapter-36-registration/chapter.md)

**时间参考（估算）**：阅读约155～185分钟；编码、迁移、邮件联调与产物核对另加165～210分钟。

- [36.1 先有注册意图，再有真正的账号](part-05-identity/chapter-36-registration/chapter.md#361-先有注册意图再有真正的账号)
- [36.2 地址、有效期与一次性消费，要落到同一个事实边界](part-05-identity/chapter-36-registration/chapter.md#362-地址有效期与一次性消费要落到同一个事实边界)
- [36.3 重置密码，必须处理旧会话和旧重置意图](part-05-identity/chapter-36-registration/chapter.md#363-重置密码必须处理旧会话和旧重置意图)
- [36.4 接上本地SMTP，观察请求到底等了什么](part-05-identity/chapter-36-registration/chapter.md#364-接上本地smtp观察请求到底等了什么)
- [36.5 换成短信以前，先看哪些前提一起改变](part-05-identity/chapter-36-registration/chapter.md#365-换成短信以前先看哪些前提一起改变)
- [附录：本章必要技术点速查](part-05-identity/chapter-36-registration/chapter.md#附录本章必要技术点速查)

### [第 37 章 小程序登录与独立会话](part-05-identity/chapter-37-mini-program/chapter.md)

**时间参考（估算）**：阅读约130～160分钟；编码、迁移、本地联调与产物核对另加145～190分钟；具备平台账号与HTTPS入口后，真实联调另加45～70分钟。

**可选登录分支**：复用已有用户、会话与权限；只准备登录所需的最小小程序入口，不展开完整客户端开发。

- [37.1 三种凭证，分别证明什么](part-05-identity/chapter-37-mini-program/chapter.md#371-三种凭证分别证明什么)
- [37.2 平台身份映射到用户，关联必须同时证明两边](part-05-identity/chapter-37-mini-program/chapter.md#372-平台身份映射到用户关联必须同时证明两边)
- [37.3 独立会话不是再造一套用户系统](part-05-identity/chapter-37-mini-program/chapter.md#373-独立会话不是再造一套用户系统)
- [37.4 平台交换、配置与最小小程序入口](part-05-identity/chapter-37-mini-program/chapter.md#374-平台交换配置与最小小程序入口)
- [37.5 用旧记录验证映射，用失败路径验证边界](part-05-identity/chapter-37-mini-program/chapter.md#375-用旧记录验证映射用失败路径验证边界)
- [附录：本章必要技术点速查](part-05-identity/chapter-37-mini-program/chapter.md#附录本章必要技术点速查)

### [第 38 章 先理解 OAuth，再接入 OIDC 外部登录](part-05-identity/chapter-38-oidc/chapter.md)

**时间参考（估算）**：阅读约75～100分钟；实现、迁移与本地两站联调另加100～140分钟，供应商注册与部署另计。

**可选登录分支**：外部平台接入按需完成；第 38.1～38.3 节的协议基础也是后续 MCP 授权的前置知识，不要求先完成 OIDC 平台接入。

- [38.1 谁授权谁，授权码为什么还要换令牌](part-05-identity/chapter-38-oidc/chapter.md#381-谁授权谁授权码为什么还要换令牌)
- [38.2 外部登录到底相信哪份证明](part-05-identity/chapter-38-oidc/chapter.md#382-外部登录到底相信哪份证明)
- [38.3 跟着一次回调看 state、nonce 与 PKCE](part-05-identity/chapter-38-oidc/chapter.md#383-跟着一次回调看-statenonce-与-pkce)
- [38.4 用 openid-client 完成兑换，先让旧数据原样留下](part-05-identity/chapter-38-oidc/chapter.md#384-用-openid-client-完成兑换先让旧数据原样留下)
- [38.5 首次登录、关联和冲突，分别提交什么](part-05-identity/chapter-38-oidc/chapter.md#385-首次登录关联和冲突分别提交什么)
- [38.6 用两个站点走一遍，再决定怎样接真实供应商](part-05-identity/chapter-38-oidc/chapter.md#386-用两个站点走一遍再决定怎样接真实供应商)
- [附录：本章必要技术点速查](part-05-identity/chapter-38-oidc/chapter.md#附录本章必要技术点速查)

### [第 39 章 微信网站扫码登录](part-05-identity/chapter-39-wechat-website/chapter.md)

时间参考（估算）：阅读约 35～50 分钟，实现与本地联调另加约 70～100 分钟，平台申请和部署时间另计。

**可选登录分支**：承接第 38 章协议基础，沿用第 37 章的微信身份映射。

- [39.1 手机确认以后，哪台设备取得会话](part-05-identity/chapter-39-wechat-website/chapter.md#391-手机确认以后哪台设备取得会话)
- [39.2 用网站 AppID 发起授权，在服务端兑换](part-05-identity/chapter-39-wechat-website/chapter.md#392-用网站-appid-发起授权在服务端兑换)
- [39.3 把微信身份接回原账号，再签发网站会话](part-05-identity/chapter-39-wechat-website/chapter.md#393-把微信身份接回原账号再签发网站会话)
- [39.4 在本机走完回跳，再联调真实网站应用](part-05-identity/chapter-39-wechat-website/chapter.md#394-在本机走完回跳再联调真实网站应用)
- [附录：本章必要技术点速查](part-05-identity/chapter-39-wechat-website/chapter.md#附录本章必要技术点速查)

### [第 40 章 用已登录的小程序扫码确认网站登录](part-05-identity/chapter-40-mini-confirm/chapter.md)

时间参考（估算）：阅读约 45～60 分钟，编码、迁移与本地联调另加约 90～125 分钟，真机接入另计。

**可选登录分支**：依赖第 37 章的小程序会话和已有网站会话。

- [40.1 谁发起、谁同意、谁领走会话](part-05-identity/chapter-40-mini-confirm/chapter.md#401-谁发起谁同意谁领走会话)
- [40.2 一次登录申请，单独占一行](part-05-identity/chapter-40-mini-confirm/chapter.md#402-一次登录申请单独占一行)
- [40.3 两端如何走到同一次消费](part-05-identity/chapter-40-mini-confirm/chapter.md#403-两端如何走到同一次消费)
- [40.4 用两个客户端验证归属和失败时点](part-05-identity/chapter-40-mini-confirm/chapter.md#404-用两个客户端验证归属和失败时点)
- [附录：本章必要技术点速查](part-05-identity/chapter-40-mini-confirm/chapter.md#附录本章必要技术点速查)

其中第 32～36 章及第 41 章回顾为核心实践，第 37～40 章为可选登录分支。

### [第 41 章 第五篇回顾：身份有效之后，操作是否仍被允许](part-05-identity/chapter-41-review/chapter.md)

**阅读前提**：完成第 32～36 章；第 37～40 章只核对已选择的登录入口。阅读约 42～55 分钟，跟做另加约 65～85 分钟（估算）。

- [41.1 一条修改请求要通过哪些判断](part-05-identity/chapter-41-review/chapter.md#411-一条修改请求要通过哪些判断)
- [41.2 同一条素材，为什么先是 403 又是 404](part-05-identity/chapter-41-review/chapter.md#412-同一条素材为什么先是-403-又是-404)
- [41.3 先退出、再重置，哪些旧证明还可用](part-05-identity/chapter-41-review/chapter.md#413-先退出再重置哪些旧证明还可用)
- [41.4 换一种登录方式，回到同一条旧记录](part-05-identity/chapter-41-review/chapter.md#414-换一种登录方式回到同一条旧记录)
- [41.5 邮件请求返回以后，谁接着做](part-05-identity/chapter-41-review/chapter.md#415-邮件请求返回以后谁接着做)
- [附录：本章必要技术点速查](part-05-identity/chapter-41-review/chapter.md#附录本章必要技术点速查)

第五篇按成稿与实际操作步骤估算。核心路线（第 32～36、41 章）阅读约 632～765 分钟，跟做另加 650～845 分钟。四个可选登录分支全部跟做时，额外阅读约 285～370 分钟，本地操作另加 405～555 分钟。七条知识支线全部阅读另加 167～224 分钟，39A 的本地复现另加 5～10 分钟。真实平台申请、部署与真机联调另计。

## [第六篇 可靠后台执行：Outbox、Worker 与实时更新](part-06-background/README.md)

**阅读路径**：核心实践。

**起点**：注册已经能同步发送邮件，但慢发送和失败会影响请求；已有事务、幂等和账号状态检查。

**本篇结果**：让业务修改与投递意图一起提交，由独立 Worker 处理，再通过通知和 SSE 告知客户端。

**阶段边界**：先保存 Outbox 意图并实际投递一条，再引入 Worker 持续执行、领取和恢复。最后新增通知数据并接 SSE；AI 任务以后按模型调用特点单独接入。

### [第 42 章 Transactional Outbox：业务和消息如何一起提交](part-06-background/chapter-42-outbox/chapter.md)

阅读约 55～70 分钟，实现、迁移与本机联调另加 80～110 分钟（估算）。

- [42.1 在旧请求中找出两次写入之间的空隙](part-06-background/chapter-42-outbox/chapter.md#421-在旧请求中找出两次写入之间的空隙)
- [42.2 给每一轮寄信留下一行](part-06-background/chapter-42-outbox/chapter.md#422-给每一轮寄信留下一行)
- [42.3 让冷却、替换和入队共用一次提交](part-06-background/chapter-42-outbox/chapter.md#423-让冷却替换和入队共用一次提交)
- [42.4 让另一个进程寄出一封仍然有效的信](part-06-background/chapter-42-outbox/chapter.md#424-让另一个进程寄出一封仍然有效的信)
- [附录：本章必要技术点速查](part-06-background/chapter-42-outbox/chapter.md#附录本章必要技术点速查)

### [第 43 章 为什么需要独立 Worker](part-06-background/chapter-43-worker/chapter.md)

阅读约 65～80 分钟，实现、迁移、双进程调试及联调另加 95～125 分钟（估算）。

- [43.1 谁来发现下一条待办](part-06-background/chapter-43-worker/chapter.md#431-谁来发现下一条待办)
- [43.2 用 Nest 建一个没有 HTTP 监听的应用](part-06-background/chapter-43-worker/chapter.md#432-用-nest-建一个没有-http-监听的应用)
- [43.3 用同一个账号分清受理、寄达与生效](part-06-background/chapter-43-worker/chapter.md#433-用同一个账号分清受理寄达与生效)
- [43.4 在一封信发送到一半时关停](part-06-background/chapter-43-worker/chapter.md#434-在一封信发送到一半时关停)
- [附录：本章必要技术点速查](part-06-background/chapter-43-worker/chapter.md#附录本章必要技术点速查)

### [第 44 章 安全领取任务与识别过期执行者](part-06-background/chapter-44-claims/chapter.md)

阅读约 55～70 分钟，实现、迁移与双执行者实验另加 80～105 分钟（估算）。

- [44.1 增加一个执行者以前先算哪笔账](part-06-background/chapter-44-claims/chapter.md#441-增加一个执行者以前先算哪笔账)
- [44.2 让一次领取有独立的身份和期限](part-06-background/chapter-44-claims/chapter.md#442-让一次领取有独立的身份和期限)
- [44.3 把准许发送和准许写回分开检查](part-06-background/chapter-44-claims/chapter.md#443-把准许发送和准许写回分开检查)
- [44.4 让 A 在两处停下来](part-06-background/chapter-44-claims/chapter.md#444-让-a-在两处停下来)
- [44.5 看懂领取索引和被锁的队头](part-06-background/chapter-44-claims/chapter.md#445-看懂领取索引和被锁的队头)
- [44.6 在旧库上完成交接](part-06-background/chapter-44-claims/chapter.md#446-在旧库上完成交接)
- [附录：本章必要技术点速查](part-06-background/chapter-44-claims/chapter.md#附录本章必要技术点速查)

### [第 45 章 失败、重试与未知结果](part-06-background/chapter-45-retries/chapter.md)

阅读约 40～55 分钟，实现、升级与故障实验另加 65～90 分钟（估算）。

- [45.1 在哪一步失败才足以决定再寄](part-06-background/chapter-45-retries/chapter.md#451-在哪一步失败才足以决定再寄)
- [45.2 让重试预算和下次执行时间跨过重启](part-06-background/chapter-45-retries/chapter.md#452-让重试预算和下次执行时间跨过重启)
- [45.3 第二次执行凭什么还能使用这次申请](part-06-background/chapter-45-retries/chapter.md#453-第二次执行凭什么还能使用这次申请)
- [45.4 在本机分别制造暂时拒绝、死信和积压](part-06-background/chapter-45-retries/chapter.md#454-在本机分别制造暂时拒绝死信和积压)
- [45.5 对端读完正文以后如何放行和清理](part-06-background/chapter-45-retries/chapter.md#455-对端读完正文以后如何放行和清理)
- [附录：本章必要技术点速查](part-06-background/chapter-45-retries/chapter.md#附录本章必要技术点速查)

### 第 46 章 先让通知成为可查询的数据

- 46.1 为注册完成等已有业务增加站内通知：先定义 Notification 表、未读和清除的含义。
- 46.2 追加迁移并提供可分页查询；历史用户从空通知列表开始。
- 46.3 新增 notification.create 投递类型，在同一业务事务中创建意图，复用 Worker 处理。
- 46.4 对重复投递、过期和接收者状态变化作处理；此时客户端先通过查询获取通知。

### 第 47 章 用 SSE 传递实时更新

- 47.1 HTTP 长连接、SSE 事件格式和 Observable 的最小使用。
- 47.2 连接建立、心跳、客户端离开时的资源释放。
- 47.3 断线重连、事件标识、重放与客户端去重。
- 47.4 EPP 如何用数据库对账补偿进程内事件的边界。
- 47.5 客户端凭据、代理缓冲与空闲超时；部署时再次核对长连接配置。
- 47.6 将已有通知查询接上实时提示，断线后仍能补查；数据库通知记录继续作为事实来源。

### 第 48 章 第六篇回顾：进程退出后，工作还能否被正确接续

**阅读前提**：先完成第 42～47 章。

- 48.1 沿业务提交、任务领取、外部发送、通知保存和 SSE 传递，区分各阶段的完成事实。
- 48.2 在领取后退出、租约过期和发送结果未知等位置改变条件，根据持久化状态决定恢复动作。
- 48.3 核对旧执行者迟到写回、重复投递和断线补查，说明租约、幂等与通知游标的保证边界。
- 48.4 回顾 API 与 Worker 的资源和关闭责任，将数据库之外的失败判断带入下一篇的文件与对象写入。

## 第七篇 用户资料与文件：数据库之外的数据

**阅读路径**：核心实践。

**起点**：已有身份权限、并发控制和后台任务，能够限制文件的所有者和访问者。

**本篇结果**：完成资料更新、头像处理、私有对象访问，以及失败后的补偿清理。

**阶段边界**：先处理替换、上传失败与对象残留；账号删除期间的写入竞争在综合篇结合已有机制展开。

### 第 49 章 用户资料的业务约束与隐私

- 49.1 自己的资料与对其他用户公开的资料。
- 49.2 字段级可见性与响应白名单。
- 49.3 Unicode 字符长度与昵称修改配额。
- 49.4 滚动时间窗口下的并发更新控制。
- 49.5 在原账号上追加资料、可见性和昵称历史结构；旧用户采用明确默认值，并更新响应白名单。

### 第 50 章 安全地接收和处理头像

- 50.1 上传请求与大小限制，Buffer、流与背压在文件接收中的作用。
- 50.2 真实格式、解码限制，为什么扩展名和 MIME 不够可靠。
- 50.3 使用 Sharp 重编码图片，理解处理时间与内存开销。
- 50.4 上传中断、处理失败和安全错误响应。

### 第 51 章 对象存储与数据库如何协作

- 51.1 Bucket、Object Key、私有权限与 S3 兼容接口。
- 51.2 以固定版本 SeaweedFS 4.52 的原生 weed mini 运行本地对象存储，说明 S3、Filer 元数据与 Volume 内容的分工；只监听本机，禁用无关入口，分开管理身份与头像桶应用权限，用固定 AWS SDK v3 完成上传、受控读取、预签名过期与删除。
- 51.3 数据库与对象存储无法共享普通数据库事务时的处理。
- 51.4 对象写入预留、上传成功但入库失败的补偿、替换后的清理。
- 51.5 保留账号状态检查与写入跟踪，供后续账号处置复用。
- 51.6 为已有用户增加头像对象引用与写入跟踪，旧用户保持无头像；失败清理与引用变更沿同一账号继续操作。

### 第 52 章 第七篇回顾：文件与数据库没有一起成功时怎么办

**阅读前提**：先完成第 49～51 章。

- 52.1 串起上传、解码处理、对象写入和账号引用，明确数据大小、权限与资源归属。
- 52.2 在慢速上传、中途断开、对象成功而数据库失败时核对资源释放与补偿依据。
- 52.3 改变头像替换与清理的先后顺序，说明当前引用、历史对象和待清理对象怎样区分。
- 52.4 回顾已建立的文件处理能力及适用限制，将残留核对和批量维护需求接到下一篇管理命令。

## 第八篇 开发与维护：管理命令、构建和性能

**阅读路径**：核心实践。

**起点**：记录、登录、邮件任务、通知和头像已形成可操作的系统，需要统一管理、构建和排障。

**本篇结果**：将实际用到的账号管理整理为 CLI，完成干净环境构建，并定位当前业务的性能问题。

**阶段边界**：先围绕现有单包应用与 API／Worker 入口实现；多包、AI 和向量工具随对应专题扩展。

### 第 53 章 为后台操作提供可靠的管理命令

- 53.1 权限管理已经需要反复操作，把先前本地配置入口整理为独立 CLI。
- 53.2 用一次性 Nest 应用上下文复用账号业务服务，处理参数、退出码、目标环境确认与资源关闭。
- 53.3 预览、执行、幂等、审计和操作收据，失败后先查询事实而不是直接修改数据库。
- 53.4 此处交付账号命令；后续 AI 对账和向量重建复用这套入口方式，具体业务在对应篇实现。

### 第 54 章 构建与持续集成

- 54.1 将当前服务的格式、Lint、类型检查与构建串成可重复流程；已有测试命令只作简短说明。
- 54.2 从空依赖环境运行编译产物，核对 API、Worker 与管理命令的入口。
- 54.3 为当前 Schema 生成 ERD，与已有 OpenAPI 一起检查生成文件的一致性。
- 54.4 GitHub Actions 与锁文件；多包构建的扩展随共享契约拆分再加入，不提前要求四仓协作。

### 第 55 章 调试性能与资源问题

- 55.1 围绕当前记录查询、登录、邮件投递与 SSE，从日志区分请求和依赖耗时。
- 55.2 使用 Node CPU profile、Chrome DevTools 与堆快照观察事件循环阻塞、内存增长、连接泄漏和高成本密码计算；解释采样、快照的观测成本及敏感数据边界。
- 55.3 结合 EXPLAIN、数据库活动与锁等待、连接池指标定位慢 SQL、连接耗尽、任务积压和长连接问题。
- 55.4 用适量并发和资源观察确定瓶颈；后续模型调用沿同样方式增加供应商耗时与费用维度。
- 55.5 根据瓶颈比较查询优化、限流、缓存、执行隔离与多实例；解释缓存失效、容量与共享状态，即使当前方案不采用，也要能说明取舍依据。

### 第 56 章 第八篇回顾：从维护动作到可交付产物

**阅读前提**：先完成第 53～55 章。

- 56.1 说明同一业务从 API 与管理命令进入时，哪些规则复用、哪些启动和退出责任不同。
- 56.2 对一个已有维护动作先预览再执行，核对参数、作用范围、操作结果与失败后的重跑条件。
- 56.3 从干净运行目录核对 API、Worker 与 CLI 的产物和配置；用已有性能观察区分计算、查询与连接等待。
- 56.4 根据瓶颈解释优化选择及新增成本，整理下一篇部署需要的进程、配置、数据与资源条件。

## 第九篇 部署与运维：发布、观测和恢复

**阅读路径**：核心实践。

**起点**：已有可构建的记录、身份、通知、文件服务与管理命令。

**本篇结果**：先在本机直接部署这些已有功能，带迁移历史完成观测、备份、兼容发布和基础恢复；后续专题沿同一部署方式升级。需要容器化时再选读 Docker 与 Compose。

**阶段边界**：主线使用本地进程，不要求 Docker；第 58～61 章为可选容器化支线，跳过后可直接继续第 62 章。部署当前已经实现的服务，不要求预先具备 AI 或多端接入。完整 EPP 的账号处置恢复门禁在最后综合篇接入。

### 第 57 章 在本机直接部署服务

- 57.1 运行账号、进程、文件权限和目录布局，分开源码、构建产物、配置与持久化数据。
- 57.2 网络接口、端口、防火墙与对外暴露。
- 57.3 CPU、内存、磁盘与容量判断。
- 57.4 macOS 开发／家庭主机与 Linux 部署的操作差异。
- 57.5 沿用本地 PostgreSQL 与 SeaweedFS，配置并启动编译后的 API、Worker 和管理命令，核对迁移版本与原有数据；区分 S3 应用权限与内部服务访问，部署时检查运行账号、内部认证或隔离及全部监听。
- 57.6 用 macOS launchd 或 Linux systemd 托管长期进程，配置重启、开机启动和日志去向，确认关闭终端后服务仍可用。

### 第 58 章 Docker 基础：从本地进程到容器

**可选支线**：第 58～61 章可以整体跳过；本地部署主线从第 57 章直接进入第 62 章。

- 58.1 从已能本地运行的服务出发，说明环境交付与隔离的问题，以及直接部署和容器化各自的成本。
- 58.2 认识 Docker 客户端、运行引擎、镜像、容器与镜像仓库；区分容器、普通进程和虚拟机。
- 58.3 准备运行环境，解释 macOS 上 Linux 容器的运行层与 Linux 主机的差异，核对 CPU 架构与资源分配。
- 58.4 拉取固定版本镜像，用 run、ps、logs、exec、inspect 观察容器进程、配置与退出状态。
- 58.5 前台与后台运行、主进程退出、信号传递、停止与删除；区分重新启动原容器和创建新容器。
- 58.6 复现启动即退出、命令错误和资源不足，沿退出码、日志与配置定位；明确容器运行不代表业务可用。

### 第 59 章 Dockerfile：把现有应用构建成镜像

**可选支线**：承接容器基础，为同一个 API、Worker 与管理命令交付镜像。

- 59.1 构建上下文、.dockerignore、FROM、WORKDIR 与 COPY；避免把本地依赖、数据和秘密带入镜像。
- 59.2 镜像分层与构建缓存，先复制依赖清单和锁文件，再安装依赖、复制源码并构建。
- 59.3 多阶段构建，区分构建期与运行期依赖，核对 Prisma 生成产物和运行时所需文件。
- 59.4 CMD、ENTRYPOINT、环境变量与启动参数；复用镜像启动 API、Worker 和一次性迁移／管理命令。
- 59.5 非 root 用户、文件权限、只读文件系统与必要的可写目录；运行时注入秘密，不写入镜像层。
- 59.6 用标签和摘要标识版本，理解镜像仓库的推送与拉取；核对主机架构和原生依赖，避免把本机可运行当作跨机可运行。
- 59.7 在干净容器中运行编译产物，排查缺失依赖、路径错误与权限问题，比较修改源码前后的缓存命中。

### 第 60 章 容器的数据与网络：重建后什么还在

**可选支线**：在编排之前，先单独理解存储与连接边界；使用独立实验库和对象，原实践数据继续保留。

- 60.1 区分容器可写层、命名数据卷与绑定挂载，说明它们的生命周期、适用场景与宿主机权限。
- 60.2 为 PostgreSQL 与 SeaweedFS 配置持久化目录，分别核对 Filer 元数据与 Volume 内容的实际路径；写入实验数据后删除并重建容器，检查记录、对象与权限是否保留。
- 60.3 区分删除容器、删除镜像与删除数据卷；数据卷不等于备份，清理前先确认挂载与数据归属。
- 60.4 容器内的 localhost、宿主机地址与服务网络；建立自定义网络，用名称连接 API 和依赖服务。
- 60.5 容器监听端口与宿主机发布端口，区分仅本机访问和对外暴露；数据库不因容器化就需要发布公网端口。
- 60.6 排查连接拒绝、名称解析失败、端口冲突和挂载权限错误，区分网络不通、服务未就绪与凭据错误。

### 第 61 章 Compose：组装与维护完整运行环境

**可选支线**：复用前三章的镜像、网络和数据卷，容器化同一套已有功能。

- 61.1 从逐条启动命令整理出 services、networks 与 volumes，连接 API、Worker、PostgreSQL 和 SeaweedFS；对照本地进程配置说明变化。
- 61.2 build 与 image、环境变量插值、env_file 和运行时秘密的职责；检查最终配置，避免把秘密提交仓库。
- 61.3 启动顺序、healthcheck、就绪条件与应用重连的区别；解释 depends_on 不能保证依赖一直可用。
- 61.4 用一次性服务执行迁移和管理命令，完成迁移后再启动应用；区分应用、迁移与备份账号权限。
- 61.5 使用 up、ps、logs、exec、run、stop 与 down 管理环境，解释重建、重启、项目名称和删除卷选项的影响。
- 61.6 配置重启策略、资源限制、日志轮转与优雅停止；复现依赖重启，观察 API 和 Worker 的退出与恢复。
- 61.7 先完成空环境的功能核对；后续备份恢复章节再把原实践数据转储和对象复制到容器环境，核对数量、引用与权限，不直接搬用正在写入的数据目录。
- 61.8 记录镜像版本与配置，后续发布、观测和恢复复用同一流程；明确 Compose 单机编排的边界，不扩展为 Kubernetes 主线。

### 第 62 章 从域名到服务 DNS HTTPS 与反向代理

- 62.1 DNS、TLS 证书与 HTTPS 请求转发。
- 62.2 以本地进程运行 Caddy，配置静态资源和 API 代理，解释来源、协议与代理信任配置。
- 62.3 回调地址、Cookie、SSE 缓冲和长连接超时在部署后的表现。
- 62.4 公网主机与家庭主机 Tunnel 的两条连接路径。
- 62.5 Cloudflare Tunnel 的接入和目标网络验证作为可选部署路线，不把尚未验收的条件写成成功事实。

### 第 63 章 日志 健康检查与告警

- 63.1 沿用开发日志，配置 Pino 输出、请求关联与脱敏。
- 63.2 API 存活、就绪、Worker 心跳和依赖故障。
- 63.3 错误、任务积压、资源不足、外部调用异常的告警。
- 63.4 沿一条故障请求，实际使用日志文件、系统服务日志与请求 ID 定位进程、版本和依赖；比较集中检索与错误追踪平台何时值得接入，容器支线补充 Dozzle 与 Docker Socket 代理及其读取权限边界。

### 第 64 章 备份 保存的是完整恢复能力

- 64.1 RPO、RTO、备份范围与恢复所需的配置、身份和密钥。
- 64.2 暂停相关写入后导出 PostgreSQL 与 S3 对象内容、清单和所需元数据，单独保存桶与权限配置；说明一致性边界及为何不能只复制对象内部数据目录。
- 64.3 AES-256-GCM 的认证加密作用、密钥保管、校验和异地保存；不展开密码算法推导。
- 64.4 定时任务、保留策略、失败告警与备份结果核对。
- 64.5 把备份恢复到独立的空库／空桶，联合核对数据库引用、对象内容摘要、元数据与访问权限，通过后再开放写入。
- 64.6 记录恢复时间与缺失条件；账号处置事实的额外要求在综合篇接入。

### 第 65 章 发布 迁移与回退

- 65.1 固定构建产物与依赖版本、配置检查、发布前备份与停止条件；容器支线使用固定镜像版本。
- 65.2 新增字段、回填、切换读写和收紧约束的兼容发布。
- 65.3 切换构建产物并重启托管进程，完成发布后检查；保留上一版产物、配置与应用回退步骤。
- 65.4 回退应用版本不等于回退数据库，破坏性迁移的处理边界；容器支线同样不能只靠回退镜像恢复数据。
- 65.5 完成一次包含结构变化的发布与兼容回退，解释数据仍然可用的依据。
- 65.6 用此前“中文意图从可选到必填”的变化贯穿发布，实际处理回填、新旧读写与回退兼容，复用同一模型演进案例。

### 第 66 章 故障恢复与日常操作

- 66.1 从页面打不开逐层检查网络、代理、应用和数据库。
- 66.2 磁盘满、进程反复退出或重启、任务积压与供应商故障；容器重启问题按可选支线补充。
- 66.3 在另一台机器恢复数据库、对象、配置和服务身份。
- 66.4 单机工具和操作收据如何帮助确认当前事实。
- 66.5 本篇恢复范围不包含账号处置后的防复活；相应最终恢复检查在综合篇完成。

### 第 67 章 第九篇回顾：在另一环境恢复一份可用服务

**阅读前提**：先完成第 57、62～66 章；第 58～61 章容器化路线按需完成。

- 67.1 回顾从网络入口到进程、迁移和持久数据的部署关系，区分健康、就绪与业务可用。
- 67.2 沿本地进程路线，在另一环境从备份和配置恢复已有服务，核对旧记录、对象、后台任务与权限。
- 67.3 改变发布失败的位置，说明何时回退程序、何时继续修复数据，以及哪些日志和版本事实支持判断。
- 67.4 选择容器化路线时补核对卷、网络与镜像版本；核心核对不依赖 Docker，也不要求提前接入 AI。
- 67.5 将恢复证据与剩余限制整理为交付说明，完成核心路线后进入第 99 章独立交付，再按需要进入专题。

## 第十篇 接入 AI：外部调用、费用与结果质量

**阅读路径**：EPP 专题。

**起点**：记录、采纳、后台任务与基本运维已完成；现在需要让候选内容由模型生成。

**本篇结果**：以真实模型替换示例候选来源，扩展持久化调用、费用记录和质量判断，继续复用原有确认与采纳流程。

**阶段边界**：先沿记录生成一条业务链讲透；练习调用随练习业务实现。模型访问条件不足时保留现有示例输入，不重复建设 Fake 层。

### 第 68 章 把模型放在清楚的业务边界之后

- 68.1 业务规则、能力接口和供应商适配的职责，结合 EPP AI Core、Runtime 与 Ports 解释现有取舍。
- 68.2 开发时如何选择真实调用、暂时关闭或少量固定结果；讲清接入条件、费用和开发效率。
- 68.3 准备开发配置、秘密、模型权限和一次调用的费用上限，再开始真实请求。

### 第 69 章 完成一次真实的模型调用

- 69.1 AI SDK、供应商适配和模型选择，先完成一次受控调用。
- 69.2 请求参数、结构化输出与响应解析。
- 69.3 超时、取消、限流、连接错误与供应商错误映射。
- 69.4 记录 Token、延迟和已知／未知费用，不把缺失用量当作零费用。

### 第 70 章 让生成结果符合业务契约

- 70.1 Prompt、输出 Schema 与确定性业务规则的职责。
- 70.2 表达槽位、语言规则、来源与补充内容。
- 70.3 策略版本、内容摘要与生成身份，解释它们如何影响复用。
- 70.4 结构合法不代表语义可靠：区分程序可拒绝的违规与需要人工／模型评价的质量问题。

### 第 71 章 将 AI 调用编排为持久化任务

- 71.1 现有记录链能够保存示例候选，现在把真实生成请求编排为 CaptureCall。
- 71.2 新增调用表、输入快照和调用身份；不为已采纳的历史记录自动补发模型请求。
- 71.3 API 写入调用意图，Worker 执行、保存结果并更新当前修订的候选；说明它与通知 Outbox 的职责区别。
- 71.4 供应商成功但结果入库失败时记录未知状态；使用租约身份限制旧执行者写回。
- 71.5 账号不可用或修订已改变时的写回条件；保留原查询与采纳接口，让新生成结果进入既有业务链。

### 第 72 章 配置 用量与费用控制

- 72.1 开发与生产配置隔离、模型策略和配置证据。
- 72.2 预算约束、调用门禁、用量统计与匿名成本记录。
- 72.3 查询、停止、人工对账与恢复；确认未知结果后再决定是否重试。
- 72.4 费用、延迟、可用性和效果之间的取舍，结合 EPP 实际做法解释。
- 72.5 补充费用精度、用量字段和保留规则；旧调用缺失费用时保留未知，不按零费用回填。

### 第 73 章 评价 AI 功能 而不只看几个演示

- 73.1 从表达质量目标定义可判断的标准，观察结构正确但不好用的输出。
- 73.2 用有代表性的案例和留出样本比较版本，避免只挑成功演示。
- 73.3 人工语义复核、确定性规则和成本／延迟的共同取舍。
- 73.4 用本项目的评价示例说明结果留存、缓存和复评分；重点是判断结果的方法，不展开评价框架建设。

### 第 74 章 第十篇回顾：模型返回成功之后，业务是否完成

**阅读前提**：先完成第 68～73 章。

- 74.1 沿调用意图、输入快照、供应商结果、校验和候选写回，区分协议成功、业务成功与效果达标。
- 74.2 改变修订版本，再让旧调用迟到返回；核对过期结果、未知结果与重复费用的处理依据。
- 74.3 用已有评价案例比较质量、成本和延迟，说明何时重试、停止或人工对账，不把未知费用记为零。
- 74.4 归纳真实调用与持久化编排的能力边界，将模型版本、调用成本和失效判断带入向量与搜索。

## 第十一篇 表达管理与搜索：关系、向量和内容演进

**阅读路径**：EPP 专题。

**起点**：已有正式表达、ExpressionForm、基础列表和真实 AI 调用。

**本篇结果**：完成语义检索、关系维护、表达合并与内容变化后的派生数据处理。

**阶段边界**：先解释关系和身份，再进行搜索；具体合并在候选检索之后。练习对表达版本的消费在下一篇落实。

### 第 75 章 先理清表达身份、形式与关系

- 75.1 同一文本、不同义项、不同形式与同义表达之间的区别。
- 75.2 回看 ExpressionUnit、ExpressionForm、学习记录和来源的关系。
- 75.3 ExpressionAnchor 的方向、关系类型、解释、来源与启用状态。
- 75.4 精确重复、语义相近、关联和合并是不同操作，先明确各自的产品含义。
- 75.5 在已有表达上新增关系结构并保留原 ID、形式和学习记录；关系初始为空，不自动推断为历史事实。

### 第 76 章 Embedding 把文本转换为可比较的向量

- 76.1 从 EPP 的表达查重与语义检索需求出发。
- 76.2 维度、距离、归一化与相似度。
- 76.3 模型、版本和向量命名空间。
- 76.4 文档构造、批量生成与非法向量校验。

### 第 77 章 用 PostgreSQL 保存和检索向量

- 77.1 在现有 PostgreSQL 中启用 pgvector，理解向量字段与原生 SQL。
- 77.2 Prisma 不能完整描述的数据库能力如何通过迁移维护。
- 77.3 精确搜索、近似搜索、距离和 HNSW 索引。
- 77.4 用户过滤、内容版本与索引选择，结合执行计划观察结果与性能。
- 77.5 追加扩展、向量列与索引迁移；旧表达暂时没有向量，先处理本次新增表达，下一章保留关键词查询兜底。

### 第 78 章 建设星图搜索接口

- 78.1 基于已有表达形式和义项组合文本匹配与语义匹配。
- 78.2 查询词向量缓存、调用身份与重复费用控制。
- 78.3 搜索排序、分页、筛选及公开结果投影。
- 78.4 向量不可用时的降级，区分无结果、暂时不可用和检索质量不足。

### 第 79 章 去重建议与表达关系如何由用户决定

- 79.1 从相似结果形成候选建议，说明置信度与来源。
- 79.2 用户接受、拒绝和暂不处理建议时分别保存什么。
- 79.3 建立、修改、移除表达关系，维护引用和关系状态。
- 79.4 精确重复与语义相似采用不同处理，防止自动丢失用户意图。

### 第 80 章 合并表达时如何保留引用和历史

- 80.1 选择主表达、处理形式与关系、保留学习记录来源。
- 80.2 合并后的旧 ID、查询跳转和重复操作。
- 80.3 事务、锁顺序与并发合并，避免循环或引用错位。
- 80.4 对已有历史和后续练习的影响；练习快照在下一篇补充实现。

### 第 81 章 表达修改之后 派生数据怎么办

- 81.1 重新润色、用户接受和内容版本递增。
- 81.2 旧向量、旧建议与旧任务为何失效。
- 81.3 向量重建的预览、执行、缓存复用与安全写回。
- 81.4 删除表达、移除关系和派生数据清理。
- 81.5 将表达版本作为练习目标的输入，为下一篇准备稳定契约。
- 81.6 为已有表达显式安排重建任务，分批回填向量并记录失败；内容版本变化后的旧结果不得覆盖新内容。

### 第 82 章 第十一篇回顾：表达变了，搜索与引用怎样保持有效

**阅读前提**：先完成第 75～81 章。

- 82.1 回顾表达身份、内容版本、关系、向量与检索结果之间的依赖，不把相似度等同于同一表达。
- 82.2 在修改或合并表达后核对旧 ID、引用、搜索结果和重建任务，让迟到向量无法覆盖新内容。
- 82.3 改变向量可用性与候选规模，解释关键词降级、执行计划和检索质量各自回答的问题。
- 82.4 说明哪些内容保持历史事实、哪些派生结果需要重建，为下一篇的练习目标与内容快照确定边界。

## 第十二篇 动态练习：从目标选择到掌握证据

**阅读路径**：EPP 专题。

**起点**：表达身份、内容版本、合并规则和 AI 持久化调用已清楚。

**本篇结果**：实现完整练习闭环，并能解释辅助行为、内容变化与重复操作如何影响掌握证据。

**阶段边界**：复用已有任务和模型适配，不重新讲一遍框架。PracticeCall 从本篇实际操作推导。

### 第 83 章 练习池、目标选择与内容快照

- 83.1 表达进入／退出练习池的条件，已删除、已合并和候选表达如何排除。
- 83.2 目标选择、换题与没有可用目标时的行为。
- 83.3 PracticeAttempt 的阶段、允许操作与状态迁移。
- 83.4 目标内容快照、版本和练习历史；开始练习后原表达改变意味着什么。
- 83.5 追加练习池字段与 PracticeAttempt 结构，旧表达默认是否参与由明确规则决定；不伪造历史练习或掌握证据。

### 第 84 章 出题、作答、辅助与评价

- 84.1 从出题操作建立 PracticeCall，复用已有调用编排。
- 84.2 题目要求、提示和参考答案分别提供什么信息。
- 84.3 保存原始答案、表达归属和答案来源，区分用户输入与辅助内容。
- 84.4 答案评价、自评以及公开响应，避免让模型结果直接改写业务事实。
- 84.5 将题目、答案、辅助记录和评价连成一次可追踪的练习。
- 84.6 新增 PracticeCall 与回答、辅助和评价记录；复用生成调用基础，但按练习状态定义写回条件。

### 第 85 章 重试与中断恢复：让练习继续进行

- 85.1 网络中断后先查询练习事实，再判断能否重新提交。
- 85.2 出题失败、评价失败、结果未知与换题的不同处理。
- 85.3 重复操作、并发操作与旧调用结果的写回条件。
- 85.4 表达修改、合并、删除后，历史快照如何保留，哪些证据不再适用。

### 第 86 章 从练习结果计算掌握证据

- 86.1 用户自评与系统证据分别表达什么。
- 86.2 辅助程度、有效使用与答案来源如何影响证据。
- 86.3 自然日、证据窗口与表达版本；在实际计算中使用 Temporal 处理日期边界。
- 86.4 同一练习重复提交不重复累计，历史证据如何投影为当前掌握状态。
- 86.5 用几条完整练习记录解释状态变化，区分规则判断和学习效果假设。
- 86.6 新增证据记录与投影规则，保留原练习内容；规则或内容版本变化时明确哪些历史证据仍适用。

### 第 87 章 第十二篇回顾：一次练习留下了什么可靠证据

**阅读前提**：先完成第 83～86 章。

- 87.1 沿目标快照、出题、回答、辅助、评价与证据投影，区分用户行为、模型输出和规则判断。
- 87.2 在网络中断、重复提交与旧调用迟到时恢复练习，核对同一行为不会重复累计证据。
- 87.3 改变表达版本、辅助程度或日期边界，说明哪些历史快照保留、哪些证据仍适用。
- 87.4 回顾练习状态与掌握判断的保证范围，为工具入口复用这些业务规则说明输入、权限和恢复约束。

## 第十三篇 共享契约与 Agent 接入：MCP、授权与工具

**阅读路径**：EPP 专题；共享契约按客户端协作需要阅读，MCP 与 Agent 按接入目标阅读。

**起点**：已有可部署的业务、账号和 HTTPS 入口；记录工具消费记录业务，练习工具还需完成练习篇。

**本篇结果**：提取跨端共享契约，让 MCP 与 Agent 复用已有业务规则；在已有用户登录之上，建立面向工具客户端的授权、确认和恢复机制。

**阶段边界**：用户登录方式在第五篇说明，本篇聚焦共享契约与工具客户端授权。MCP 授权前先读第 38.1～38.3 节协议基础，无需完成外部平台登录；沿已有 HTTPS 环境接入真实宿主，未验收条件明确标注。

### 第 88 章 共享契约与四仓协作

- 88.1 服务内部 Shared 与跨端 Contracts 的职责，明确接口公开边界。
- 88.2 Schema、运行时校验和跨端类型；从已有接口逐步提取稳定契约。
- 88.3 CommonJS／ESM、条件导出、原生环境和依赖限制。
- 88.4 精确版本、兼容性、锁文件与消费者升级。
- 88.5 客户端消费：请求身份、错误映射、会话失效与重试策略；用 Web 或已接入的小程序调用记录业务，对照 client-core，不重复讲解登录流程或展开完整前端实现。
- 88.6 从现有运行接口提取契约并迁移消费者；检查旧客户端仍能读取已有记录，随后新增入口沿用这些契约。

### 第 89 章 MCP 服务端的职责

- 89.1 Host、Client、Server 与工具调用。
- 89.2 以 MCP 2026-07-28 的逐请求元数据与 server/discover 为主线，对照旧版 initialize；用官方 SDK 的兼容入口共用工具定义，并按实际宿主请求版本验证兼容范围。
- 89.3 输入 Schema、工具结果与协议错误。
- 89.4 将 EPP 业务服务接入 MCP，保持规则一致。

### 第 90 章 作为 OAuth 服务端签发授权码和访问令牌

- 90.1 复用第五篇第 38.1～38.3 节的 OAuth 角色与协议知识，明确 MCP 客户端授权与用户登录的区别；已有密码会话即可作为用户登录基础。
- 90.2 元数据发现、已知客户端预登记、redirect URI、issuer 和 resource 约束；比较 CIMD 与旧 DCR 的适用条件，按所选宿主确定接入方式。
- 90.3 用户授权、授权码的一次性消费与 S256 PKCE。
- 90.4 访问令牌、Scope、资源绑定和业务权限校验。
- 90.5 新增授权记录及令牌存储，不更换用户的业务身份；授权后的调用访问原有数据和服务。

### 第 91 章 刷新、撤销与授权恢复

- 91.1 访问令牌过期和刷新令牌的不同职责。
- 91.2 刷新轮换、重放检测与授权撤销。
- 91.3 并发刷新、断线后的未知结果及客户端恢复。
- 91.4 会话、账号状态、Web 权限与 MCP scope 的相互边界。

### 第 92 章 设计可恢复的批量工具

- 92.1 业务身份、客户端操作身份与逐项结果。
- 92.2 批量限制、部分成功与错误隔离。
- 92.3 断线后先查事实，再决定是否重试。
- 92.4 EPP 记录、修订、采纳与查询工具的实现。

### 第 93 章 把用户确认落实为服务端事实

- 93.1 工具调用许可与具体候选采纳的区别。
- 93.2 确认页、候选集合和修订版本绑定；按宿主能力比较普通链接与 URL elicitation，区分同意打开页面和服务端已保存采纳事实。
- 93.3 过期、修改、取消、部分选择与重复确认。
- 93.4 HTML 转义、登录跳转与跨用户操作防护。

### 第 94 章 让 Agent 自身生成 EPP 负责校验与保存

- 94.1 EPP 模型生成与 Agent 自身生成两条路径，各自的费用和信任边界。
- 94.2 GenerationRequest、输出契约与生成者声明。
- 94.3 接入 Agent 候选、出题与答案评价，复用已有业务校验和确认规则。
- 94.4 Skills、插件配置、STDIO 代理与 HTTP 服务的边界。
- 94.5 从实际宿主走完记录和练习，解释工具权限不等于用户已采纳具体内容。

### 第 95 章 第十三篇回顾：换一个调用入口，业务边界是否仍然成立

**阅读前提**：先完成所选接入路线：共享契约阅读第 88 章；MCP 与 Agent 路线继续完成第 89～94 章，并满足所调用业务的前置条件。

- 95.1 只选择契约路线时，改变契约版本并核对已有消费者，解释类型检查、运行时校验与兼容性的区别。
- 95.2 完成 MCP 路线后，对照 HTTP 与工具调用同一业务，核对用户身份、Scope、资源归属和具体操作确认。
- 95.3 沿批量部分成功、断线与授权撤销还原事实，确定可查询、可重试与必须重新确认的范围。
- 95.4 接入 Agent 生成后核对候选与练习的写回条件，真实宿主联调按所选路线记录结果。
- 95.5 归纳多入口共享业务的能力边界，将授权、在途调用和对象引用纳入下一篇的账号处置范围。

## 第十四篇 数据生命周期与综合实践

**阅读路径**：深入机制；最后一章可用于所选阅读路径的综合实践。

**起点**：账号状态、事务、任务、外部调用、对象写入跟踪和基础备份恢复已经建立。

**本篇结果**：完成跨系统账号处置与恢复核对，再独立交付一个范围明确的后端需求。

**阶段边界**：完整处置机制按 EPP 的实际需求和风险解释，不默认要求所有小项目采用同等复杂度。真实平台未验收的部分保持明确标注。

### 第 96 章 把账号处置建模为可靠流程

- 96.1 从数据范围和实际删除需求决定处置流程的复杂度。
- 96.2 删除请求、重新认证、明确确认与受理回执。
- 96.3 冻结账号、撤销会话与阻止新操作，接入前文的账号状态约定。
- 96.4 幂等请求、状态查询和失败恢复。
- 96.5 识别数据库之外仍在进行的发送、模型调用和对象写入。
- 96.6 为已有账号追加处置请求和进度结构，先冻结，再沿现有业务关系逐项清理；前面建立的记录与对象是本篇操作对象。

### 第 97 章 清理在线数据与对象

- 97.1 沿关系追踪应删除和应保留的数据，说明审计与匿名成本的边界。
- 97.2 停止任务、处理正在进行的调用，复用前文的状态与租约检查。
- 97.3 数据库锁、对象写入预留和账号冻结如何共同约束并发操作。
- 97.4 删除文件、清理版本和核对残留；处置中断后的恢复。
- 97.5 结合已有业务观察删除期间的写回行为，不新增独立故障测试体系。

### 第 98 章 防止恢复备份让已删除账号重新出现

- 98.1 为什么恢复旧备份会重新引入已删除账号，以及独立处置事实的必要性。
- 98.2 签名链、检查点、序号与完整性校验，说明适用条件和运维负担。
- 98.3 混合备份清理、恢复后重新核对及遗漏处置事实时的停止条件。
- 98.4 API、Worker 在恢复门禁通过前保持关闭。
- 98.5 在基础恢复上加入处置核对，完成一次包含已删除账号的完整恢复操作。

### 第 99 章 第十四篇回顾与综合实践：独立完成一次完整后端需求

**阅读前提**：本篇回顾先完成第 96～98 章；核心路线完成第 67 章后可直接从 99.2 节进入独立交付，无需先完成账号处置或其他专题。

- 99.1 回顾账号冻结、在线清理与恢复门禁；复用上一章恢复结果，改变在途写回或处置事实缺失的条件，说明哪些资源必须保持关闭、凭什么恢复服务。
- 99.2 按已完成路线给出新业务需求、约束、完成条件与时间预算，明确独立设计范围；核心路线不要求 AI、平台登录、容器化或账号处置机制。
- 99.3 独立推导接口契约、数据模型、状态变化与权限；按需增加后台任务。
- 99.4 实现功能、迁移和调用方消费，检查正常操作、关键失败结果与日志。
- 99.5 完成一次发布和对应恢复操作，说明取舍、限制与后续维护方式；已完成深入机制路线时，再核对处置事实和恢复门禁。
- 99.6 分开需求、结果核对依据与参考推导；复盘能力缺口后返回对应机制补足，再完成核对。扩展路线选题只依赖已完成内容，超出范围的功能另外估时。

## 阅读说明与导航

### 篇章跳转

- [第一篇 先运行起来：从浏览器走进 Node.js](#第一篇-先运行起来从浏览器走进-nodejs)（第 1～6 章）
- [第二篇 用 Nest 组织一个可持续扩展的服务](#第二篇-用-nest-组织一个可持续扩展的服务)（第 7～14 章）
- [第三篇 持久化与结构演进：PostgreSQL、SQL、Prisma](#第三篇-持久化与结构演进postgresqlsqlprisma)（第 15～21 章）
- [第四篇 业务一致性：修订、候选、事务与采纳](#第四篇-业务一致性修订候选事务与采纳)（第 22～31 章）
- [第五篇 让服务认识用户：身份、会话与权限](#第五篇-让服务认识用户身份会话与权限)（第 32～41 章）
- [第六篇 可靠后台执行：Outbox、Worker 与实时更新](#第六篇-可靠后台执行outboxworker-与实时更新)（第 42～48 章）
- [第七篇 用户资料与文件：数据库之外的数据](#第七篇-用户资料与文件数据库之外的数据)（第 49～52 章）
- [第八篇 开发与维护：管理命令、构建和性能](#第八篇-开发与维护管理命令构建和性能)（第 53～56 章）
- [第九篇 部署与运维：发布、观测和恢复](#第九篇-部署与运维发布观测和恢复)（第 57～67 章）
- [第十篇 接入 AI：外部调用、费用与结果质量](#第十篇-接入-ai外部调用费用与结果质量)（第 68～74 章）
- [第十一篇 表达管理与搜索：关系、向量和内容演进](#第十一篇-表达管理与搜索关系向量和内容演进)（第 75～82 章）
- [第十二篇 动态练习：从目标选择到掌握证据](#第十二篇-动态练习从目标选择到掌握证据)（第 83～87 章）
- [第十三篇 共享契约与 Agent 接入：MCP、授权与工具](#第十三篇-共享契约与-agent-接入mcp授权与工具)（第 88～95 章）
- [第十四篇 数据生命周期与综合实践](#第十四篇-数据生命周期与综合实践)（第 96～99 章）

### 阅读方式与范围

这组技术分享从已有 JavaScript 和前端经验出发，围绕 EPP 的实际问题，从零搭建一个公开的 EPP。代码、数据结构和运行步骤随章节逐步建立，开发数据与真实用户数据隔离。目录中的章节链接进入正文，篇标题链接进入篇导读。

每篇以导读明确起点，以正式总结章回顾能力、综合应用并衔接后续内容。总结章在完成本篇相应主线后阅读；可选路线只核对已选择的部分，不能成为核心路线的新前提。第十四篇总结章同时承接全书独立交付，提供单独的核心路线入口。

当前目录共 **14 篇、99 章**。各篇与各章按复杂度分配篇幅，小节数量随内容变化；数据库、业务一致性、后台任务和运维等重点保留足够空间。

[目标与能力路线](backend-capabilities.md)说明各项后端能力由哪些章节共同建立，以及怎样通过改变约束、跨场景应用和独立交付核对。EPP 的功能进度与读者能力进度分别维护；必要基础的覆盖范围由独立后端开发的目标决定。

- **核心实践**：第一至九篇按顺序阅读，建立服务、数据、身份、任务、文件和本地部署能力，并从第 99.2 节开始完成核心路线独立交付；第 37～40 章登录分支与第 58～61 章容器化支线可跳过。OAuth／OIDC 的协议基础在需要跨端授权前补读第 38.1～38.3 节。
- **EPP 专题**：第十至十二篇接入 AI、搜索和练习；第十三篇讲共享契约、MCP 与 Agent 工具接入；小程序与外部登录分支已归入第五篇。
- **深入机制**：第十四篇在既有数据和系统上完成账号处置；第 99 章按已完成路线组织独立交付，核心路线可提前进入，专题路线增加对应的新约束。

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
| 第六篇 | 注册邮件不再被请求中断拖累，结果可通知 | Outbox、独立进程、重试和 SSE | 同步发送 → 持久化投递 → Worker；再新增通知表 |
| 第七篇 | 账号可以维护资料和头像 | 文件处理、私有对象存储与补偿 | 原账号增加资料和对象引用，记录写入跟踪 |
| 第八篇 | 现有服务需要日常管理和稳定构建 | 独立 CLI、构建和性能定位 | 复用业务服务；增加操作记录与构建产物 |
| 第九篇 | 服务需要在线运行、更新与恢复 | 本地部署、进程托管、HTTPS、观测、备份和兼容发布；容器化可选 | 延续本地数据与迁移历史，旧数据进入发布与恢复过程 |
| 第十篇 | 示例候选替换为真实模型输出 | 外部调用、持久化编排、费用与质量 | 新增调用及费用记录；不自动重跑历史采纳 |
| 第十一篇 | 表达变多后需要搜索、关系维护和合并 | 向量检索、关系一致性与派生数据失效 | 保留表达 ID；追加关系／向量，显式安排历史回填 |
| 第十二篇 | 将已有表达用于出题与练习 | 状态快照、调用恢复和证据投影 | 新增练习、回答、辅助和证据；旧内容不伪造学习历史 |
| 第十三篇 | 客户端共享契约，Agent 调用已有业务 | 契约提取、MCP、OAuth 服务端与工具确认 | 复用第五篇的用户和登录；新增客户端授权与确认记录，业务数据保持同源 |
| 第十四篇 | 用户离开后要清理数据，恢复也不应复活账号 | 跨系统处置、独立事实与恢复门禁 | 沿全部已有关系和对象执行处置，再核对备份恢复 |

### 前置依赖

| 后续能力 | 需要此前交付什么 |
| --- | --- |
| PostgreSQL 接入 | 内存版记录接口已有明确输入与查询行为；第 15 章完成本地安装与连接，再按这些字段建表 |
| Prisma 持久化 | SQL 表与已有数据已建立，Schema 映射和初始迁移基线已核对 |
| 结构演进 | 保留旧记录；本篇先增加中文意图，后续篇再追加修订、候选等结构 |
| 可靠采纳 | 先有修订／候选与结果模型，再实现事务、并发和幂等；不以未解释的表为例 |
| Worker 发送 | 已有同步 SMTP 发送，再建立 Outbox 数据与一次性处理，最后启动 Worker |
| SSE | 通知先能持久化和补查，再增加实时传递 |
| 对象存储接入 | 已有用户与头像处理；第 51 章以本地进程提供存储端点，不依赖 Compose |
| 本地部署 | 已有构建产物与本地依赖；第 57 章完成配置、启动和进程托管，无需 Docker |
| 容器化部署（可选） | 已有本地可运行的服务；第 58～60 章依次讲容器、镜像构建、存储与网络，第 61 章再用 Compose 组装环境 |
| 真实 AI | 已有候选确认、任务执行与部署基础；先配置费用边界，再接调用与结果写回 |
| 搜索与练习 | 原表达继续有效，搜索先处理无向量旧数据；练习再引入自己的状态和调用表 |
| 小程序与外部登录（可选） | 已有用户、会话与权限；在第五篇接入身份映射，不依赖共享契约拆包或 MCP；真实联调需满足对应平台条件 |
| 平台真实联调（可选） | 对应登录章节先列明资质、配置与访问要求；需要公网 HTTPS 时，完成第九篇后返回第五篇联调 |
| MCP 授权 | 已有用户登录与 HTTPS；先读第 38.1～38.3 节协议基础及第 88 章共享契约，无需先接入外部登录平台 |
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

## 持续维护

README.md 维护当前目录、阅读路线和前置依赖；[目标与能力路线](backend-capabilities.md)维护能力覆盖与独立应用的对应关系；[AGENTS.md](AGENTS.md) 维护写作原则、篇章文件组织、配套代码与截图规范。

各章沿同一个项目展开：先解释问题与原理，再编写实现并观察结果，后续章节接着已有代码和数据演进。时间参考区分阅读与跟做，便于安排实践。
