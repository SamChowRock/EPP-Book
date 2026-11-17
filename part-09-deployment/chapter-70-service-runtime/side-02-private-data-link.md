# 支线 70B　数据库和桶在另一台机器上，谁维持连接

API 已经交给 Debian 托管。若数据库和桶也在 Debian，应用自己连回环即可。现在改变一项约束：存储归另一台常驻主机管理，而且它只接本机回环连接。为什么维护者从笔记本开的反向转发，会让整个服务跟着这台笔记本一起离线？

**谁维持这条连接？** 这里有两台常驻主机。Debian 运行 API 和 Worker；一台固定的 Mac 继续存放原库、桶和练习邮箱。打开临时管理窗口的电脑可以随时退出。原数据机是服务的一部分。想让这一台数据 Mac 也能关机，回到[部署端接手原数据](../../environment-setup.md#在-debian-接手已有的数据库桶和收件箱)。

1. **在数据 Mac 控制台确认目的地。** 记录 PG、S3 和 Mailpit SMTP 三个回环监听的实际端口。以下用 55477、18633、1025 举例。核对预期库中的一张原收据和旧账号当前 avatarId，并实际 GET 这个键、留下摘要。开启系统设置中的“远程登录”，仅允许练习账号连接；在数据 Mac 运行 `ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` 读取主机公钥指纹。这里 SSH 服务端在数据 Mac，客户端在 Debian，两者的角色与此前从 Mac 登录 Debian 时相反。[SSH 环境与指纹核对](../../environment-setup.md#从-mac-建立-ssh-连接)
2. **在 Debian 为托管隧道准备凭据。** 首次准备时执行 `sudo useradd --system --user-group --home-dir /var/lib/epp-link --no-create-home --shell /usr/sbin/nologin epp-link` 和 `sudo install -d -o epp-link -g epp-link -m 0700 /var/lib/epp-link`。用 `sudo -u epp-link` 执行 `ssh-keygen -t ed25519 -N '' -f /var/lib/epp-link/id_ed25519`，仅将公钥送到数据 Mac 的练习账号。在该账号的 `~/.ssh/authorized_keys` 中给这一行公钥加前缀 `restrict,port-forwarding,command="/usr/bin/false",permitopen="127.0.0.1:55477",permitopen="127.0.0.1:18633",permitopen="127.0.0.1:1025"`（与实际端口一致）。数据 Mac 的 sshd 对这个专用账号用 `AllowTcpForwarding local` 限定转发方向；例如在该账号的 `Match User 账号名` 段设置这一项，实际账号替换占位文字。用 `sudo /usr/sbin/sshd -t` 核语法，再用 `sudo /usr/sbin/sshd -T -C user=账号名,host=localhost,addr=Debian私网地址` 核对生效值。Debian 以该用户运行 `ssh -N -i /var/lib/epp-link/id_ed25519 -o HostKeyAlgorithms=ssh-ed25519 -o UserKnownHostsFile=/var/lib/epp-link/known_hosts 数据机账号@数据机私网地址`，对照控制台取得的指纹后接受，连通后按 Ctrl-C 退出。主机记录现在由服务身份持有。
3. **在 Debian 交给 systemd。** 下面三个本地端口刻意与旧隧道错开。用 `ss -lnt` 确认它们空闲，在 `/etc/systemd/system/epp-data-link.service` 写入下列定义。把末尾的 SSH 账号、私网地址和三项右端端口换成上一步实值。数据机若使用其他 SSH 端口，首次核指纹和 unit 里均加同一 `-p 端口`。

```ini
[Unit]
Description=EPP private data connections
After=network-online.target
Wants=network-online.target

[Service]
User=epp-link
ExecStart=/usr/bin/ssh -NT -i /var/lib/epp-link/id_ed25519 -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=/var/lib/epp-link/known_hosts -o ExitOnForwardFailure=yes -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -L 127.0.0.1:55474:127.0.0.1:55477 -L 127.0.0.1:18674:127.0.0.1:18633 -L 127.0.0.1:19774:127.0.0.1:1025 数据机账号@数据机私网地址
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

在 Debian 执行 `sudo systemctl daemon-reload`、`sudo systemctl enable --now epp-data-link`，用 `ss -lnt` 对照三个新监听。每个 -L 左边是 Debian 的回环，右边是数据 Mac 的回环。监听出现只表示 SSH 接受了转发；用原收据工具的配置副本把数据库目的地换为 `127.0.0.1:55474`，保持原库、角色、用户 ID 和操作 ID，实际读回那张收据。若 SSH 记录拒绝连接，回查授权行上的端口；若报目标拒接，到数据机查该服务是否真在监听。

把三个服务的数据库连接指向 Debian 回环的 PG 转发端口，保留各自的角色和库名。邮件配置指向这里的 SMTP 端口。在第 71 章配置面向客户端的对象入口时，nginx 的 S3 上游用 18674。单独关闭操作员自己的 SSH 登录；另开一条管理连接用原收据与实际对象读数确认 Debian 发起的通路仍在。再在这套隔离环境停止 epp-data-link，比较原来成功的两次读取；恢复 unit 后按同一 ID 再查。若同一私网中已经有受限的原生数据接口，应用可以直接连接它，省去这个长期 SSH 进程。

## 速查

| 读到的现象 | 能从哪里确认 |
| --- | --- |
| Debian 上有本地监听，读收据仍失败 | 区分 SSH 授权目标、数据机实际监听、数据库认证与库名 |
| 管理员退出后隧道仍在 | 看宿主 unit 持有的 PID，再从另一连接发出实际业务读取 |
| 计划下线存储主机 | 服务仍依赖它保存的数据，先向新的常驻位置移交库、桶和配置 |

阅读约 7～10 分钟。已有一台常驻数据 Mac 和 Debian 时，设置与对照另加 20～35 分钟。

[回到第 70 章](chapter.md#705-交出能由下一班独立验证的部署)
