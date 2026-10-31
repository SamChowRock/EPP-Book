# 支线 15A：为什么同一个账号，在两种连接方式下结果不同

正文已经让 psql 与 DBeaver 使用相同地址、端口、库和角色连接，也明确验证过错误密码会失败。换到另一台开发机，事情可能变得奇怪：终端不输入密码也能连，DBeaver 却失败；或者 DBeaver 保存了错误密码，点击测试仍然成功。

如果只会反复改密码，就很难解释这些现象。需要把“连接找到了哪里”和“服务器用什么方式确认身份”分开，再沿服务器实际采用的规则判断。

这条支线只操作正文创建的独立学习实例。保持数据目录、55432 端口和角色不变，不在系统默认实例或共享数据库上修改认证。配套只读查询位于 `database/chapter-15/04-auth-rules.sql`；主服务和业务表均无变化。

## 一条连接依次经过哪些判断

psql 和 DBeaver 都是客户端，但客户端名称不是数据库认证策略。服务器先要接受来自某条通道的连接，随后根据连接类型、目标库、声明的角色和来源地址匹配认证规则，再用匹配的认证方式检查身份。通过认证以后，数据库和对象权限还会限制能做哪些操作。

因此至少有三道不同的门：到达服务，证明身份，获得操作权限。出现 connection refused 时还没走到密码校验；出现 password authentication failed 时不能靠给表增加 SELECT 权限修复；出现 permission denied for table 时，重新安装 psql 也不会改变角色拥有的权限。

客户端可以提出“我要以 epp_owner 身份进入 epp_dev”，但它不能自己宣称“我的密码应该被接受”。决定身份验证方式的是服务器配置。

## TCP 与 socket，不只是两种 host 写法

显式设置 host 为 127.0.0.1 时，连接通过本机 TCP。省略 host 时，Unix 平台的 libpq 客户端通常尝试 Unix-domain socket；这是操作系统本机通信通道，不通过 TCP 端口监听。host 若填写 socket 所在目录，也是在指定这种本机通道。

HBA 配置中的 `host` 类型匹配 TCP，`local` 类型匹配 socket。`local` 不是“所有来自本机 IP 的连接”；同机使用 127.0.0.1 仍属于 host。角色、数据库相同而通道不同，就可能匹配不同的规则。IPv4 的 127.0.0.1 与 IPv6 的 ::1 也有不同的地址匹配条件。

正文明确禁用了 socket，并固定 IPv4 TCP，就是为了先让两种客户端处于相同条件。若你去掉 host 后反而连接成功，应核对是否经由环境变量、个人配置或其他默认实例进入了另一个地方，不能据此说“PostgreSQL 有时不需要密码”。当前实例根本没有提供 socket 入口。

在成功连接中，`inet_server_addr()`、`inet_server_port()` 可以提供证据：TCP 会返回服务端地址和端口，Unix socket 连接对应值为 NULL。NULL 在这里不是查询失败，而是这两个 TCP 属性不适用。相关行为见 [libpq 连接参数](https://www.postgresql.org/docs/18/libpq-connect.html)与[系统信息函数](https://www.postgresql.org/docs/18/functions-info.html)。

## trust、peer 和 SCRAM 各自信任什么

**trust** 允许匹配连接直接使用它声明的数据库角色，不验证密码。psql 的 `-W` 可以先弹出密码提示，但如果服务器匹配 trust，输入的密码不会成为能否通过的依据。这就解释了“我明明输入了错误密码，为什么也成功”：提示来自客户端，身份验证规则来自服务器。

**peer** 用于本机 socket，由操作系统提供发起进程的系统用户身份，服务器据此匹配数据库角色或配置的映射。某些 Linux 安装方式下，使用 postgres 系统账号运行 psql 能直接进入 postgres 数据库角色，而换成你自己的系统账号就报 peer authentication failed。这不表示那个数据库角色没有密码，也不表示 GUI 客户端应该使用你的电脑开机密码；当前这条规则根本没有使用数据库密码认证。

**scram-sha-256** 使用密码认证协议确认客户端拥有对应凭据。它不等于 TLS，也不意味着 SQL 内容在网络上全部加密。正文分别控制了认证方法、监听范围和访问身份；远程部署还要另外处理传输保护。

本书学习实例从 initdb 就为 local 和 host 指定 SCRAM，没有通过改成 trust 绕过初次连接问题。另一个环境如果采用 peer，并不是一定配置错误；先理解它的身份来源，再决定是否符合使用方式。具体边界参见 [trust](https://www.postgresql.org/docs/18/auth-trust.html)、[peer](https://www.postgresql.org/docs/18/auth-peer.html)和[HBA 配置](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html)。

## HBA 是按顺序选择一条，不是逐条尝试直到成功

先以 epp_admin 连接正文的 postgres 管理库。在配套代码根目录启动 psql：

```bash
psql -X -W -v ON_ERROR_STOP=1 \
  'host=127.0.0.1 port=55432 dbname=postgres user=epp_admin connect_timeout=5'
```

将下列查询保存为 `database/chapter-15/04-auth-rules.sql`，在这个管理员会话执行 `\i database/chapter-15/04-auth-rules.sql`：

```sql
SELECT current_database(), current_user, inet_server_addr(), inet_server_port();
SHOW data_directory;
SHOW hba_file;

SELECT
  rule_number,
  line_number,
  type,
  database,
  user_name,
  address,
  auth_method,
  error
FROM pg_hba_file_rules
ORDER BY line_number;
```

先核对实例和当前身份，再查看文件。系统视图默认限制管理员读取，普通角色无权查看不应通过授予超级用户来解决。它反映的是 **当前文件内容的解析结果**，不是服务器已成功加载规则的历史快照；error 不为空要先修正对应文件行。视图定义见 [pg_hba_file_rules](https://www.postgresql.org/docs/18/view-pg-hba-file-rules.html)。

在本章没有 include 的默认文件中，关注下面这一类 IPv4 规则：

```conf
host    all    all    127.0.0.1/32    scram-sha-256
```

五列依次表示通道、数据库、角色、来源地址、认证方式。`/32` 表示这一个 IPv4 地址，而不是整个局域网；两个 all 则表示匹配所有普通目标库与角色。其他 local、IPv6 或 replication 行仍可能存在，它们有不同适用条件，不是看到 all 就对所有连接生效。

服务器按文件规则顺序找第一条匹配项，选定后就在这一项上完成认证。密码验证失败，不会继续找后面的 trust；第一条匹配 reject，也不会再尝试后面的 SCRAM。先后顺序因此属于访问策略本身。

## 加一条只影响开发角色的拒绝规则，再恢复

保持刚才的管理员会话打开，同时在 DBeaver 保留已连接的 epp_owner 会话。两边先执行只读诊断，确认它们都指向本章实例。

回到 shell，确认 `$EPP_PGDATA` 与管理员 SHOW hba_file 显示的目录一致，再保存修改前的文件。此处只备份认证配置，不是数据库数据备份：

```bash
cp -i "$EPP_PGDATA/pg_hba.conf" "$EPP_PGDATA/pg_hba.conf.before-15a"
```

`-i` 避免无提示覆盖之前的备份。若备份已存在，先核对内容和上次实验是否完成，不直接覆盖唯一的恢复依据。

用编辑器打开该实例的 pg_hba.conf，**在所有实际规则之前**加入一行：

```conf
host    epp_dev    epp_owner    127.0.0.1/32    reject
```

它只拒绝来自这个地址、目标为 epp_dev、声明角色为 epp_owner 的新 TCP 连接。管理员连接的是 postgres、角色是 epp_admin，不匹配这行；保留管理员会话可用于检查和恢复。若把库和角色都写成 all，影响范围就变了，不能把两个写法当作等价。

保存后，在管理员会话重新运行 04-auth-rules.sql，确认新增行的 error 为 NULL，然后请求加载：

```sql
SELECT pg_reload_conf();
```

返回 true 表示重载信号已成功发出，不保证每个配置项都已成功应用。查看本实例 server.log 中是否有解析或加载错误，再建立新连接验证实际行为。这里不需要重启数据库；监听地址等需要重启的配置，与可重新加载的 HBA 规则不同。函数语义见[服务器管理函数](https://www.postgresql.org/docs/18/functions-admin.html)。

从另一个终端用正确密码新建 epp_owner 连接，应收到 pg_hba.conf rejects connection 一类错误。此时密码再正确也不会通过，因为匹配项是 reject。即使下面仍有允许 SCRAM 的通用规则，也不会继续尝试。

回到实验开始前已连接的 DBeaver，重新执行一条只读 SELECT，通常仍能成功。HBA 主要控制建立新连接时的认证，不会因为文件变化就自动撤销所有已有会话。图形客户端可能为其他操作另开连接；某个导航操作失败而旧编辑器还能查询，并不矛盾。可以比较查询返回的 connection_pid，判断当前操作是否仍使用原来的会话。

完成观察以后，立即恢复刚才确认过的原文件：

```bash
cp "$EPP_PGDATA/pg_hba.conf.before-15a" "$EPP_PGDATA/pg_hba.conf"
```

管理员再次检查规则、执行 `SELECT pg_reload_conf();`，并核对日志。重新建立一条 epp_owner 连接，正确密码应恢复成功；再以错误密码建立连接，仍应失败。最后执行 03-inspect.sql 核对库、角色和端口。只有新连接验证通过，才算恢复完成，不能用一直存活的旧连接替代证明。

如果原管理员会话意外断开，新增规则只针对 epp_owner/epp_dev，仍可用原管理参数重连。如果规则写错并影响范围更大，用数据目录所有者恢复已保存的文件，再执行 `pg_ctl -D "$EPP_PGDATA" reload`；它通过操作系统向自己的实例发信号，不需要先通过 SQL 登录。随后查日志并重新连接验证，不删除数据目录、不重新 initdb。

## 把这套判断带回主线

以后把 Prisma 或其他数据库驱动接入 Nest，出现认证错误时先把运行时最终使用的非敏感连接字段与成功客户端逐项比较：host、port、database、user、是否要求 TLS。不要把完整连接串直接写进日志；密码和连接串都可能包含敏感内容。

相同机器上的两个客户端不一定采用相同通道，相同角色不一定进入相同数据库，相同库名也可能存在于两个实例。一旦这些条件对齐，再查看认证规则和角色状态，才能判断该改哪一处。相反，身份验证已成功而对象操作被拒绝时，应进入对象所有者与权限分析，而不是继续更换连接密码。

本条支线没有让应用接入数据库，也没有建立生产权限模型。它建立的是一种可以迁移的排错方法：先找到服务器真正采用的条件，再用一次只改变一个条件的实验验证因果，最后用新连接证明恢复。

时间参考（估算）：阅读约 25～32 分钟；规则检查、拒绝与恢复实验另加约 20～25 分钟。按约 2800 个汉字、22 行查询／命令／配置与两种会话的对照估算，未经过读者实测，不并入主线时间。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| host／local | 区分 TCP 与 Unix socket 规则 | 本机 TCP 仍是 host，不是 local |
| trust／peer／scram-sha-256 | 判断身份依据来自哪里 | 密码输入提示不能证明服务器校验了密码 |
| pg_hba.conf | 定义连接身份验证规则 | 第一条匹配项决定方法，认证失败不向后回退 |
| pg_hba_file_rules | 检查文件行及解析错误 | 当前文件内容不等于已加载状态 |
| pg_reload_conf／pg_ctl reload | 请求重读可加载配置 | 返回或命令成功后仍要检查日志和新连接 |
| reject／127.0.0.1/32 | 有限范围的拒绝实验 | 必须恢复；不扩大到其他库、角色或网络 |
| pg_backend_pid | 辅助判断是否新建了会话 | 同一个客户端也可能管理多条连接 |

[返回第十五章](chapter.md) · [返回第三篇](../README.md)
