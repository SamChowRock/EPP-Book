# 第 71 章　让客户端通过可信入口访问服务

第 70 章已经把 API、邮件和通知交给宿主管理，运行账号能读取各自的配置。使用者却仍不能直接拿这个部署当网站使用。API 只听部署机回环，头像地址里的回环又会指向发起请求的那台电脑；把监听改到网卡，还没有解决客户端如何确认服务身份的问题。

本章从这几个地址的归属出发，把公开页面、API 和私有头像放到使用者能访问并验证的 HTTPS 入口。程序、账号与业务数据沿用前章。章末在管理连接退出后，从独立客户端完成一次实际交付，后续运行维护就从这套服务继续。

## 71.1 先让客户端按名字找到目标

使用一台能从练习私网直接到达的 Debian 部署机和一台独立使用设备。Mac 仍可作为签发端和管理端，也可以充当这台使用设备。只有宿主能访问的虚拟机回环转发适合复现证书故障；要交给另一台设备，请给来宾接入可路由的私网，或选同一私网内的 Debian 主机。先确认第 70 章的数据库、对象存储和练习邮箱在操作员退出后仍可达，再进行本章。需要使用另一台固定数据机时，在第 70 章完成数据通路。

**在 Debian** 用 `ip -br -4 addr` 找到面向使用设备的实际 IPv4 地址，核对接口名。下文的 192.168.50.10 仅为示例。选定本次服务名 api.epp.test，使用端和 Debian 都应把这个名字解析到刚找到的地址。若已有私网 DNS，就给这个名字配置 A 记录；只有两三台练习机器时，在各台 Mac 或 Debian 用 `sudoedit /etc/hosts` 写一行 `192.168.50.10 api.epp.test`，先替换示例 IP，清掉这个名字指向旧回环的条目。在 Debian 执行 `getent ahostsv4 api.epp.test`，Mac 上执行 `dscacheutil -q host -a name api.epp.test`。只在操作员电脑改 hosts，另一个人的浏览器仍会找不到站点。

**在部署端** 启动第 70 章的 `sudo systemctl start epp72-api`。用 `curl -g --noproxy '*' 'http://[::1]:3374/profile/me'` 读到 AUTH_REQUIRED，说明上游已经在处理 HTTP。若把客户端的 HTTPS URL 直接指到 3374，它送来的第一个消息是 TLS 握手，正在等 HTTP 请求的 Node 无法回答。可以改应用让它管理私钥；这次让另一个进程 **nginx** 先完成握手，再把业务请求送到原来的 API。同一个进程还能把公开页面直接交给客户端。按环境说明在 Debian 准备 nginx 并核对 SSL 模块。[Debian 安装与验证 nginx](../../environment-setup.md#在-debian-准备-nginx)

```text
浏览器 → api.epp.test:8443 → nginx → 页面文件，或 [::1]:3374 上的 API
浏览器 → api.epp.test:9443 → nginx → 同机回环上的私有 S3 接口
API    → api.epp.test:9443 → nginx → 同一个 S3 接口
```

浏览器先用服务名找到 IP，握手时报出想访问的名称（SNI），让 nginx 选择证书。它还要核实证书由谁签发，以及证书上允许的名字是否包含地址栏里的 api.epp.test。SSH 主机指纹供操作者辨认部署机；使用者的浏览器需要一份自己能验证的服务证书。[HTTPS 名称匹配](https://www.rfc-editor.org/rfc/rfc9525.html)

## 71.2 签一张带正确名称的练习证书

部署端生成私钥，握手时用它证明自己控制着证书里的公钥。谁能证明这把公钥可以代表 api.epp.test？在本练习中，管理端充当签发者，通过已核实的 SSH 连接收取部署端的签名请求，核对负责的名称，由中间 CA 签发包含该名称的叶证书。nginx 对外提供叶证书和中间证书；客户端事先通过可信渠道取得根证书，用它验证这条链。实际已有受信证书、完整链和私钥的部署可沿用它们，使用证书所覆盖的名称并保持下文两个端口一致。以下使用受控私网的练习 CA。

在**管理端配套仓库**检出 `part-09/chapter-72`，用已核过主机指纹的别名 epp-lab。保留两端的 Bash 会话，在练习期间保存 lab 和 edge 路径。设定本次签发目录，生成一次根和中间证书，下面用这套材料直接做私网交付。分支里的 `examples/tls-trust/nginx.conf` 原样保留了回环测试配置，71.3 再修改部署副本。

先按[两端准备 OpenSSL](../../environment-setup.md#两端准备-openssl)核对签发端和部署端的版本。操作端在配套根目录执行。umask 077 限制新文件权限，mkdir 只在新位置建立本轮专属目录，保留用于续签的 CA；已有目录时先核实是否为同一轮。make-ca.sh 创建 90 天的根与 30 天的中间 CA，中间 CA 的 pathlen 为 0，仅用于签叶证书。记下根的完整 SHA-256 指纹供第二个客户端核对。遇到已存在的部署目录先核实归属，另一次练习不要往旧目录混放文件。

```bash
umask 077
src="$PWD/examples/tls-trust"
lab="$HOME/epp73-issuing"
mkdir -m 0700 "$lab" &&
  sh "$src/make-ca.sh" "$lab/ca"
openssl x509 -in "$lab/ca/root.crt" -noout -fingerprint -sha256
ssh -F ~/.ssh/epp71.conf epp-lab 'umask 077; mkdir "$HOME/epp75-edge"' &&
  scp -F ~/.ssh/epp71.conf "$src/nginx.conf" epp-lab:epp75-edge/nginx.conf
```

部署端在另一个 Bash 生成 A 的私钥和 CSR，私钥保存在私有目录。tls.conf 把同一套链与私钥放在一起。若 nginx 未进 PATH，给 nginx_bin 填实际绝对路径。

```bash
edge="$HOME/epp75-edge"
cd "$edge"
nginx_bin=$(command -v nginx || printf %s /usr/sbin/nginx)
"$nginx_bin" -V
umask 077
new_key() (
  set -eu
  slot=$1
  mkdir "$slot"
  openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -noenc \
    -subj /CN=api.epp.test -keyout "$slot/leaf.key" -out "$slot/leaf.csr"
  printf 'ssl_certificate %s/fullchain.pem;\nssl_certificate_key %s/leaf.key;\n' \
    "$slot" "$slot" > "$slot/tls.conf"
)
new_key slot-a
```

操作端取 CSR，检查来源后签发并返回公开的链。issue-leaf.sh 用 openssl x509 -req 校验 CSR 签名并签发，指定服务用途和随机序列号，验证通过再拼成 fullchain.pem。保留两个函数供换证时使用。

```bash
issue() (
  set -eu
  slot=$1
  scp -F ~/.ssh/epp71.conf "epp-lab:epp75-edge/$slot/leaf.csr" "$lab/$slot.csr"
  sh "$src/issue-leaf.sh" "$lab/ca" "$lab/$slot.csr" "$lab/$slot-issued"
  scp -F ~/.ssh/epp71.conf "$lab/$slot-issued/fullchain.pem" "epp-lab:epp75-edge/$slot/fullchain.pem"
)
issue slot-a
```


在部署端执行 `cd "$edge" && ln -s slot-a/tls.conf active.conf`。若刚做过故障支线，先用 `readlink active.conf` 确认已经指向 slot-a/tls.conf 即可。管理端用 `openssl x509 -in "$lab/slot-a-issued/leaf.crt" -noout -dates -serial -ext subjectAltName` 核对有效期、序列号和 DNS:api.epp.test。用 `scp -F ~/.ssh/epp71.conf "$lab/ca/root.crt" epp-lab:epp75-edge/root.crt` 交给部署端；通过已验证的文件通道把同一份**公开根证书**交给使用端。各自执行 `openssl x509 -in root.crt -noout -fingerprint -sha256`，把完整指纹与签发端读数另行核对。签发私钥和服务私钥留在各自机器。

curl 可以对单次请求指定根；浏览器的信任还要单独设置。例如，在练习 Mac 上打开「钥匙串访问」，选登录钥匙串，导入核过指纹的 root.crt，打开该证书的「信任」，将 SSL 设为始终信任，再重新打开使用该钥匙串的浏览器。仅在受控练习账号这样配置，并记下练习结束时要撤去的根指纹。若使用隔离 Firefox 配置，可在「设置 → 隐私与安全 → 证书 → 查看证书 → 证书颁发机构」中导入同一根，允许其标识网站；使用自己的私网 DNS 或 hosts。要复现 Firefox 报错及服务端漏发中间证书，见[支线 71A](side-01-certificate-diagnostics.md)。[Firefox 的 CA 信任](https://support.mozilla.org/en-US/kb/setting-certificate-authorities-firefox)

## 71.3 接通同源页面、API 和头像存储

前端部署时已经遇到过“页面能开，接口却不通”。现在先把浏览器看到的地址与 Node 监听分开。页面从 `https://api.epp.test:8443/handoff/` 加载，脚本向 `/auth/login` 发请求时，浏览器连接的仍是同一个协议、主机名和端口。nginx 接到这个 HTTP 请求后，按路径选择静态文件或把请求转发到 `[::1]:3374`。这一步由部署机发起，浏览器无需知道内部端口。

同源判定使用协议、主机名和端口三者。把页面和 API 放在 8443，现有同源 Cookie 与写请求机制就能沿用。API 的 APP_ORIGIN 应填写浏览器地址栏里的 `https://api.epp.test:8443`。若填了内部上游地址，浏览器发来的 Origin 会被拒绝，即使 nginx 已成功解密并转发了请求。TLS 检查服务名及证书，Origin 与 CSRF 检查写请求的来源与会话；遇到错误要看是哪一层已经给出了响应。

头像多走一条连接。API 的 AVATAR_S3_ENDPOINT 同时用于访问桶和生成签名 URL。它若保留 127.0.0.1，API 在部署机可以写桶，使用者打开图片却会连接自己电脑的回环。这里给对象接口使用 `https://api.epp.test:9443`，让 API 和浏览器都能解析、连接并信任它。端口变了，来源也随之改变；页面可以把这个限时签名地址交给 img 加载，API 写请求仍留在 8443。对象读权来自签名，存储不需要使用者的登录 Cookie。

两个入口复用 api.epp.test 的证书，因为证书名匹配检查不包含端口；对象签名却包含 Host 及其端口。因此修改访问地址时要一起检查 DNS、入口监听、证书名、APP_ORIGIN 和签名端点，并分别查看浏览器和 Node 的信任配置。它们使用同一个名称，各自承担的校验不同。

**在 Debian 编辑 nginx 的候选。** 在原部署会话执行 `cd "$edge" && cp nginx.conf nginx-private.conf`，在 nginx-private.conf 的 http 内保留原访问日志关闭、临时目录等共用配置，用下面两个 server 替换原 server。把示例 IP 换成 71.1 的部署端地址，两个 allow 网段换成实际获准练习的设备范围（范围很小时逐项 allow 单个地址，包括部署机自身）。本节先约定网页的两个地址，交接时才装入页面文件。在部署端用 `echo "$edge/public"` 取得公开目录的绝对路径。将下面 root 改为该目录，脚本的 alias 改为该目录下 handoff/client.js 的绝对路径。工件、配置和密钥都在静态目录之外。首个 server 的其余路径通向 API；它继续忽略客户端自报的代理头。当前按来源地址计数的防护会让用户共享代理地址的额度。

```nginx
server {
    listen 192.168.50.10:8443 ssl default_server;
    server_name api.epp.test;
    allow 192.168.50.0/24;
    deny all;
    include active.conf;
    ssl_protocols TLSv1.2 TLSv1.3;
    client_max_body_size 3m;
    location = /handoff/ {
        root /home/DEPLOY/epp75-edge/public;
        try_files /handoff/index.html =404;
        add_header Content-Security-Policy "default-src 'none'; script-src 'self'; connect-src 'self'; img-src https://api.epp.test:9443; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
        add_header Referrer-Policy no-referrer always;
        add_header X-Content-Type-Options nosniff always;
        default_type text/html;
        charset utf-8;
    }
    location = /handoff/client.js {
        alias /home/DEPLOY/epp75-edge/public/handoff/client.js;
        add_header X-Content-Type-Options nosniff always;
        default_type application/javascript;
        charset utf-8;
    }
    location / {
        proxy_pass http://[::1]:3374;
        proxy_set_header Host $http_host;
        proxy_set_header X-Forwarded-For "";
        proxy_set_header X-Forwarded-Proto "";
        proxy_set_header Forwarded "";
        proxy_buffering off;
    }
}
server {
    listen 192.168.50.10:9443 ssl;
    server_name api.epp.test;
    allow 192.168.50.0/24;
    deny all;
    include active.conf;
    ssl_protocols TLSv1.2 TLSv1.3;
    access_log off;
    error_log /dev/null;
    location / {
        proxy_set_header Host $http_host;
        proxy_set_header Cookie "";
        proxy_hide_header Set-Cookie;
        proxy_pass http://127.0.0.1:18633;
    }
}
```

页面地址以斜线结尾。try_files 从公开目录选中 handoff/index.html，文件尚未装入时返回 nginx 的 404。若在这个 location 直接用 alias 指向 index.html，预检可以通过，实际请求却可能再次拼接默认首页名而返回 500。脚本地址以文件名结尾，可以直接用 alias。71.5 放好文件后，要分别请求这两个 URL。

页面的内容安全策略允许同源脚本和 API 请求，并允许显示来自 9443 的图。使用其他证书名或对象端口时也要调整 img-src；浏览器若报 CSP 拦截，可在 Network 或 Console 确认它甚至还没向对象服务发出 GET。

8443 的 3m 上限让应用能够自行解释超过 2 MiB 的图片。默认的 1 MiB 会先拒绝一部分合法 PNG。一次入口边界实验中，1,770,843 字节的 PNG 在默认限制处被拒，放宽后进入上传与渲染代码，得到 24,902 字节 WebP。另请在主机或虚拟网络防火墙上只允许获准设备访问 8443、9443；3374、PG、原始 S3 与 SMTP 保持部署机私有。用 `ss -lnt` 核对实际绑定。SSH 管理入口沿用原来的访问范围。

9443 的上游在第 69 章同机路线为 18633，选择第 70 章独立数据机转发时换为 Debian 回环 18674。对象服务按原桶权限认证请求。SDK 的签名覆盖 Host（含 9443）、路径和查询参数，所以代理传原 Host，proxy_pass 后面不接 URI，也不重写查询。Cookie 按域名、路径等条件发送，换端口仍可能收到同名站点的会话 Cookie，转发给存储之前要去掉它。关闭对象访问日志，并在这个练习的对象 server 内丢弃可能包含完整请求的错误日志；生产日志若要保留请求诊断，应在进入持久日志前屏蔽签名参数。客户端分享记录时也只留路径、状态、类型和摘要。[nginx 代理指令](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)

**让 Node 也信任这个地址。** 在 Debian 用 `sudo install -o root -g root -m 0644 "$edge/root.crt" /etc/epp72/practice-root.crt` 安装已核指纹的公开根。用 `sudoedit /etc/epp72/api.env` 设置 `APP_ORIGIN=https://api.epp.test:8443`、`AVATAR_S3_ENDPOINT=https://api.epp.test:9443`，保留原库、桶、应用身份以及 `LISTEN_HOST=::1`、`PORT=3374`。执行 `sudo systemctl edit epp72-api`，在编辑器的有效区写下两行，使 Node 在启动时就能读取额外的受信根。

```ini
[Service]
Environment=NODE_EXTRA_CA_CERTS=/etc/epp72/practice-root.crt
```

浏览器的信任用于读图，Node 的信任用于写图。读回一个旧头像可以检验使用端到对象入口的路径，只有再上传新图并按新 ID 取回，才同时走过 API 的存储连接。保持清理任务原有的受限配置；若它后来也改走这个 HTTPS 端点，要给该进程同样的名称解析与根证书。

**让入口在退出后继续工作。** 在 Debian 保留私有前缀和原来的部署账号，确认 `systemctl cat epp74-https` 没有与他人服务撞名。前缀和 nginx_bin 须是持久、无空格的绝对路径。先核候选，再写入服务配置。若以前已有练习入口，应先查明它的工作目录与监听归属，再接手。

```bash
cd "$edge"
"$nginx_bin" -t -p "$edge/" -c nginx-private.conf
```

看到语法和文件检查通过，执行下面一段。root 管理 unit，nginx 实际使用第 71.2 节创建私有目录的普通部署账号；该账号有权读本次证书与页面、写预设临时目录。systemd 使用前台 master 进程跟踪服务。

```bash
cat > "$edge/epp74-https.service" <<UNIT
[Unit]
Description=EPP private HTTPS entry
After=network-online.target epp72-api.service
Wants=network-online.target epp72-api.service

[Service]
User=$(id -un)
WorkingDirectory=$edge
ExecStartPre=$nginx_bin -t -p $edge/ -c nginx-private.conf
ExecStart=$nginx_bin -p $edge/ -c nginx-private.conf -g "daemon off;"
ExecReload=/bin/kill -HUP \$MAINPID
KillSignal=SIGQUIT
Restart=on-failure
RestartSec=5
UMask=0077

[Install]
WantedBy=multi-user.target
UNIT
sudo install -m 0644 "$edge/epp74-https.service" /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemd-analyze verify /etc/systemd/system/epp74-https.service
```

预检通过后执行 `sudo systemctl restart epp72-api epp74-https`。用 `systemctl show epp72-api epp74-https -p Id -p MainPID -p ActiveState` 对上两项进程，用 `ss -lnt` 核对 8443、9443 在预期私网地址、3374 在 ::1。若端口缺席，按 unit 用 `sudo journalctl -u epp74-https -b -n 20 --no-pager` 查绑定和文件读取；若 502，检查上游 app.ready 及 3374。需要开机自启时先让数据服务也能独立恢复，再用 `sudo systemctl enable epp72-api epp74-https` 登记。

**在管理端检验信任，再发密码。** 管理 Mac 也须按 71.1 将该名称解析到真实的私网地址。在原 Bash 直接访问，不做 SSH 本地转发。第一次使用默认信任，未曾信任此根时通常在握手处报 60；第二次只为本次调用指定已核实的根。应读到 EPP 的 401 AUTH_REQUIRED，并且 remote_ip 是部署机的私网地址。

```bash
site=https://api.epp.test:8443
curl -q --noproxy '*' --max-time 8 -sS -w '\n%{http_code} %{remote_ip}\n' "$site/profile/me"
client=(curl -q --noproxy '*' --max-time 12 -sS --cacert "$lab/ca/root.crt")
"${client[@]}" -w '\n%{http_code} %{remote_ip}\n' "$site/profile/me"
```

## 71.4 从可信入口登录并核对业务

交接前给使用者准备他自己的练习账号。沿用第 70 章已开通 Web 资格、已经有头像的账号，核对 userId，留下该账号一条已知素材的 ID、原文，以及旧头像的 avatarId 和摘要。若这些都在交接单上，直接到 71.5 安装页面；71.6 由使用者用自己的密码在新名字下登录。旧 HTTP 主机下的 Cookie 不会自动带到这个站点。

缺少可辨认的素材时，请账号持有人在原有客户端找到一条属于自己的记录；如果还没有，才按下方的登录、取令牌和正常写入步骤准备一条，记下 ID 与原文。有意更换头像、制造来源错误和错令牌，都是诊断单项故障时的操作。跳过下面的练习可保留使用者的原头像，继续到本章末尾的交付实践。

<details>
<summary>需要补素材、检查 Cookie 或诊断写入时，在管理端建立练习会话</summary>

在管理 Mac 原 Bash 用有 Web 资格的练习账号登录。密码隐藏输入，写令牌留在本机私有目录。如果随后要诊断上传，用部署者自己可换头像的账号。

```bash
umask 077
read -r -p '练习账号 userId: ' uid75
read -r -s -p '练习账号密码: ' pass75
printf '\n'
printf '%s' "$pass75" | node -e '
  const fs = require("node:fs");
  process.stdout.write(JSON.stringify({userId:process.argv[1],password:fs.readFileSync(0,"utf8")}));
' "$uid75" | "${client[@]}" -c "$lab/cookies" -H "Origin: $site" -H 'X-EPP-Request: 1' \
  -H 'Content-Type: application/json' --data-binary @- -o "$lab/login.json" -w 'login %{http_code}\n' "$site/auth/login"
unset pass75
```

登录 200 后，执行下面这一行，只看 Cookie 的作用域、路径和 Secure 标志，保留最后一列的会话值在私有文件里。应为本机指定的 api.epp.test、路径 /、TRUE。随后用这份 Cookie 取写令牌。

```bash
awk '$6 == "__Host-epp_session" {sub(/^#HttpOnly_/, "", $1); print $1, $3, $4, $6}' "$lab/cookies"
```

取到本次会话的写令牌后，定义 write_capture。只补素材时，用正确来源和令牌写入一次即可。

```bash
(
  set -o pipefail
  "${client[@]}" -f -b "$lab/cookies" "$site/auth/csrf" |
    node -e 'const t=JSON.parse(require("node:fs").readFileSync(0)).csrfToken;
      if(!/^[0-9a-f]{64}$/.test(t)) process.exit(1);
      console.log("X-CSRF-Token: "+t)' > "$lab/write-header"
)
printf '%s\n' '{"originalText":"verify private HTTPS handoff","chineseIntent":"从可信入口复读素材"}' > "$lab/input.json"
write_capture() {
  "${client[@]}" -b "$lab/cookies" -H "Origin: $1" -H "$2" -H 'X-EPP-Request: 1' \
    -H 'Content-Type: application/json' --data-binary @"$lab/input.json" \
    -o "$lab/$3.json" -w '%{http_code}\n' "$site/captures"
}
```

```bash
write_capture "$site" "@$lab/write-header" saved
```

返回 201 后从 saved.json 读出新 ID。已经有素材、只想准备换证支线的人，可把 id 直接设为原 ID，从定义 read_capture 开始。

```bash
id=$(node -pe 'JSON.parse(require("node:fs").readFileSync(0)).id' < "$lab/saved.json")
read_capture() {
  "${client[@]}" -f -b "$lab/cookies" -o "$lab/$1.json" -w '%{http_code}\n' "$site/captures/$id"
}
read_capture before
```

HTTP 200 后，保留 before.json 供读回对照。需要定位 403 时，用同一个 Cookie 各改变一个条件：

```bash
write_capture 'http://127.0.0.1:3374' "@$lab/write-header" wrong-origin
write_capture "$site" 'X-CSRF-Token: invalid' bad-csrf
```

第一笔的来源与部署配置不符，预期为 403 ORIGIN_REJECTED；第二笔的来源正确，但写令牌无效，预期为 403 CSRF_REJECTED。具体业务码在各自的响应文件中。

</details>

<details>
<summary>核对原来通过直连的合法 PNG 能否经过代理</summary>

在已登录的管理端 Bash 选择一张符合第 59 章像素限制、大小介于 1 MiB 和 2 MiB 的有效 PNG。把 png 设为文件的绝对路径，沿用上方命令保存的 Cookie 和写令牌。预览只返回处理后的图像，保留原头像。

```bash
wc -c < "$png"
"${client[@]}" -b "$lab/cookies" -H "Origin: $site" -H 'X-EPP-Request: 1' \
  -H "@$lab/write-header" -H 'Content-Type: image/png' --data-binary "@$png" \
  -o "$lab/preview.webp" -w '%{http_code} %{content_type}\n' "$site/profile/avatar/preview"
```

应为 200、image/webp。打开文件确认能解码。若相同图像直连上游能预览，经代理却只有 nginx 的 413，检查 8443 的活动配置和 client_max_body_size。[nginx 请求体上限](https://nginx.org/en/docs/http/ngx_http_core_module.html#client_max_body_size)

</details>

<details>
<summary>定位对象端口或桶故障时：用部署者账号实际上传并读回</summary>

先按本节第一处展开内容取得 Cookie 和写令牌，可止于定义 write_capture，无需创建素材。发布会更换练习账号的当前头像。若章末还要核对原账号的旧头像，在本节开头选择另一个允许发布的练习账号。若允许更换并需要记录旧图，则在上传前先执行下方读取 current.json 和下载文件的命令，将旧对象另存为 old.webp。管理端把 `png` 设为配套目录中 `examples/avatar-preview/harbor.png` 的绝对路径，使用同一个登录会话、Origin 和写令牌。上传时 API 需通过 9443 的证书检查，使用自己的存储权限完成写入。

```bash
"${client[@]}" -f -b "$lab/cookies" -H "Origin: $site" -H 'X-EPP-Request: 1' \
  -H "@$lab/write-header" -H 'Content-Type: image/png' --data-binary "@$png" \
  -o "$lab/published.json" -w '%{http_code}\n' "$site/profile/avatar"
"${client[@]}" -f -b "$lab/cookies" -o "$lab/current.json" "$site/profile/avatar"
node -e '
  const fs=require("node:fs"), load=p=>JSON.parse(fs.readFileSync(p));
  const [published,current]=process.argv.slice(1).map(load);
  if(!published.avatarId || published.avatarId!==current.avatarId) process.exit(1);
  console.log("avatarId",current.avatarId)' "$lab/published.json" "$lab/current.json"
```

读回同一个 ID 后，管理端用返回的签名 URL 立即下载。签名只有 30 秒有效，过期就重取 current.json。下面用 curl 的配置输入传地址，避免把签名印在终端或放进命令行参数。下载用可信根，不携带 API 会话。先检查地址属于预定的对象来源，结果应为 200、image/webp；打开文件验证可解码，记录字节数和摘要。若旧图能读、发布失败，回 Debian 查运行中的 Node 是否信根、解析到本次地址，以及原桶身份是否允许写。

```bash
(
  set -o pipefail
  node -e '
    const {url}=JSON.parse(require("node:fs").readFileSync(process.argv[1]));
    const u=new URL(url);
    if(u.origin!=="https://api.epp.test:9443" || /["\\\r\n]/.test(url)) process.exit(1);
    console.log("url = "+JSON.stringify(url))' "$lab/current.json" |
    "${client[@]}" -f -K - -o "$lab/object.webp" -w '%{http_code} %{content_type}\n'
)
wc -c < "$lab/object.webp"
shasum -a 256 "$lab/object.webp"
```

在返回的 URL 去掉查询串访问同一私有对象应被拒绝。新取得的签名也报 403 时，查 9443 的 Host、转发路径与桶权限。交接单区分原账号的历史头像和本次写入的练习头像，分别记下对应的账号和 ID。

</details>

## 71.5 把这个 HTTPS 地址交给下一班

**在管理端安装公开页面。** 本章配套的 examples/handoff-client 提供一个调用已有接口的页面，用于走通浏览器会话、素材和头像。应用仍由原 API 处理。下面在本章配套根目录执行，只将 index.html 和 client.js 放入 nginx 公开目录。

```bash
(
  set -eu
  test -f examples/handoff-client/index.html
  test -f examples/handoff-client/client.js
  ssh -F ~/.ssh/epp71.conf epp-lab 'mkdir -p "$HOME/epp75-edge/public/handoff"'
  scp -F ~/.ssh/epp71.conf examples/handoff-client/index.html examples/handoff-client/client.js \
    epp-lab:epp75-edge/public/handoff/
)
```

**从独立使用设备验入口。** 先关闭管理 SSH 和临时访问转发，保留托管的数据通路。在使用端 Bash 的当前目录放入 71.2 核过指纹的公开 root.crt。用真实名称测试一次，不带 Cookie 和口令；检查三个响应的实际远端地址。前两份静态文件应为 200，分别是 HTML 和 JavaScript，业务探针应为 401。

```bash
site=https://api.epp.test:8443
for path in /handoff/ /handoff/client.js /profile/me; do
  curl -q --noproxy '*' --max-time 8 --cacert ./root.crt -sS -o /dev/null \
    -w '%{remote_ip} %{http_code} %{content_type}\n' "$site$path"
done
```

在该设备的浏览器打开 `https://api.epp.test:8443/handoff/`。浏览器应在无证书警告的情况下显示登录表单，Network 中脚本为 200。若 curl 成功、浏览器报错，回查浏览器自己的名称解析、有效期和信任库。若网页报 403，检查来源许可和目录读权。nginx 的 404 先查 root 下的 handoff/index.html 是否已放好；API 返回的 JSON 404 则查末尾斜线与实际匹配的 location。把这个地址、根指纹与有效期、两个 unit 名、数据所在主机、部署者留存的原账号和素材 ID、头像摘要交给下一班。保持部署在线，下面从这个表单完成交付。

## 71.6 从独立客户端完成部署交付

这次从另一台设备的浏览器开始，关闭操作端的管理登录及临时访问转发。部署端、数据机和使用端要继续运行；如果 Debian 就在操作笔记本的虚拟机里，可以验证退出 SSH 后的行为，要检验笔记本关机则需要独立的部署设备。沿用自己的已开通账号，在已信任的地址登录，用交接记录里的素材 ID 读取原文，并点“打开当前头像”对照该账号当前的 avatarId。尚未开通 Web 资格的新注册账号不能承担这次登录验收。

在页面点“创建本轮素材”，按返回 ID 再读一次；选择不超过 2 MiB 且符合第 59 章像素限制的 PNG 或 JPEG，点“发布并打开头像”。这次会替换练习账号当前头像。记下新 avatarId，页面应显示实际解码后的宽高。重新打开页面并登录，再读取刚才的素材和当前头像，核对自己留下的这笔写入。

这个交付页的创建按钮沿用第 30 章保留的无键客户端契约，每次主动点击都是新操作；它没有保存待办，响应中断时不能据此自动重发。要验收带键恢复，沿[第 30 章的带键写入与重放](../../part-04-consistency/chapter-30-write-retry/chapter.md)保存原操作键与原正文，从当前 HTTPS 入口发送并重放，核对原 ID、Location 和单份回执。API 具备恢复协议，不意味着所有旧客户端按钮已经实现了它。

如果素材可读、新头像却打不开，在 Network 按次序找上传 POST、向 API 取签名地址的 GET、浏览器到 9443 的 GET。没有最后一笔请求，先查页面策略；连接或 TLS 失败，查使用设备的解析、网络与信任；已经收到对象服务的 403，再查签名有效期、Host 与路径是否被改写。若失败的是上传，回看 API 的错误与请求 ID，检查它到 9443 的连接、桶权限及工作目录。这样一次故障可以定位到具体连接，无需把所有配置都重填一遍。

<details>
<summary>用一次密码重置核对邮件和通知也已接手</summary>

API 的素材和头像请求不会触发通知 Worker。选一个邮箱、密码都由自己掌握，且已开通 Web 的练习账号，完成一次密码重置，沿同一用户的邮件、任务和通知检查后台部署。没有验证邮箱的旧账号可只做前面的访问实验，本步骤使用第 43 章已经完成恢复的练习账号。

1. 登录后点“刷新收件箱”，记下已有通知 ID。展开“重置练习账号密码”，输入这个账号已验证的邮箱，点“申请重置邮件”。202 表示请求已接受。到本次私有 Mailpit 找刚收到的信，将令牌和新密码填回页面，点“确认重置密码”，成功应得 204。收信网页仅绑定部署端回环时，管理员可临时转发 8025 供账号持有人查看，读取后关闭转发。
2. 保留页面，用旧会话点“刷新收件箱”，应得到 401 AUTH_REQUIRED。用同一用户 ID 和新密码重新登录，再点“订阅通知”和“刷新收件箱”，核对本轮 password-reset 及其 ID。订阅首帧也会提示刷新，实际入箱结果以查询返回的那一行为准。
3. 在独立观察连接，把下面的两个 UUID 换为这个用户和页面里的通知 ID。原任务应为 done，收件箱行与任务同 ID。若没有新通知，先按 user_id、kind 和本轮确认时间找候选任务，取得实际 ID 后查状态，避免把另一用户的消息当成本轮结果。

```sql
SELECT j.id, j.kind, j.status, n.id AS inbox_id
FROM public.notification_jobs AS j
LEFT JOIN public.notifications AS n ON n.id = j.id AND n.user_id = j.user_id
WHERE j.user_id = '本轮用户UUID'::uuid AND j.id = '浏览器显示的通知UUID'::uuid;
```

如果邮件通道仍因 unknown 结果停发，保留原占用和尝试次数，明确这次邮件与重置尚未验收。按已有投递核查处置后再做这一轮。信已收到、密码已改而通知仍 pending 时，用户刷新页面也无法启动消费进程；第 74 章就从这种在线服务中的积压开始建立告警。

</details>

<details>
<summary>平台回调需要从公网进入时，怎样接着部署？</summary>

平台回调要从平台所在网络解析你的域名并访问它。私网 hosts 和练习根只对已配置的设备生效。已有公网主机时，可把受控域名指向它，在入口使用匹配该名称的公信证书，放行所需路由。家庭主机没有公网入站时，也可在常驻部署端运行 Cloudflare Tunnel，由外部 HTTPS 入口接收请求，再经连接器送到指定上游。选这条路线时才准备账号、域名和连接器。[环境与安装](../../environment-setup.md#为公网回调准备连接器选做)

先用测试域名从外部网络访问指定回调路由，在部署日志按同一请求 ID 核对到达。再按对应平台要求登记完整 URL，用测试账号走一次实际登录。要交付整个页面，还须同步 APP_ORIGIN、头像签名端点和允许的图片来源，从外部网络重走本节实际请求。数据库、对象管理界面与 Mailpit 继续留在管理网络。[第五篇平台登录准备](../../environment-setup.md#真实平台登录选做)

</details>

程序能够在目标平台运行、宿主能管理它、客户端能从实际网络访问它，这三部分现在接到同一次交付中。交接记录留下当前构建、服务身份与配置位置、可信入口，以及用户写入和后台处理的结果。接班人据此维护正在使用的服务。

暂停练习时在 Debian 用 `sudo systemctl stop epp74-https epp72-api` 停入口与 API，依第 70 章记录停妥数据和消费者。恢复时先恢复依赖，再 `sudo systemctl start epp72-api epp74-https`，用原地址、原根和原数据再查。若证书已经过期，先检查叶、中间 CA 和根的有效期；只有签发链仍有效时才直接续签叶，链也过期时按支线 71B 重新准备可信材料，再用新连接检验；若 Cookie 过期，重新登录并注明。[支线 71B　验证签发链并演练换证回退](side-02-certificate-rotation.md)

## 附录：本章必要技术点速查

| 观察 | 接下来查哪里 |
| --- | --- |
| curl 6，或 7 / HTTP 000 | 在使用设备查名称是否解析；再查私网可达性、防火墙和部署机监听 |
| curl 60 / HTTP 000 | 查 URL、SAN、有效期、受信根和线上出示的链 |
| nginx 502 | 握手已通过，检查同机 API 或对象存储上游 |
| EPP 401 / 403 | 用项目错误码定位登录会话、Origin 或写令牌 |
| 页面成功，对象取图失败 | 区分 API 签发、浏览器到 9443 的握手与 S3 签名验证 |
| 对象可读，上传失败 | 查上传响应、API 的 Node 根与 DNS、桶身份和写权限 |

阅读约 30～40 分钟。已有第 70 章部署、可路由私网和练习账号时，签发、配置及客户端交付另加 55～80 分钟。71.4 故障对照另加 15～25 分钟，后台改密核对另加 10～20 分钟。估时按正文、命令和一次顺利操作估算，首次环境准备另计。证书诊断与换证回退按需选读。

配套检出命令 `git switch part-09/chapter-72` · [上一章 · 让 API 和后台进程以各自身份持续运行](../chapter-70-service-runtime/chapter.md) · [下一章 · 把应用和运行环境一起交付](../chapter-72-container-image/chapter.md) · [本篇导读](../README.md) · [全书目录](../../README.md)
