# 第 1 章 Unix Shell：从第一条命令到独立写脚本

用 VS Code 打开一个空文件夹，选 **终端 → 新建终端**。如果你在 Windows 的 VS Code 中操作，先连到 WSL，再开终端。看到下方的输入光标后，输入 `printf '<%s>\n' hello world`，按回车。你会看见 `<hello>` 和 `<world>` 各占一行。按 ↑ 找回刚才那行，仅给 `hello world` 加上一对英文双引号，再按回车。现在只剩一行 `<hello world>`。打印程序没换，字母没换，究竟是谁把交给程序的两份东西变成了一份？你已经碰到了 Shell 编程的第一件事。

本章可以在一个普通用户的练习文件夹里从头学。前半程研究一句话怎样变成一次程序调用，再用变量、判断、循环和函数把几次调用组成脚本。后半程打开 Unix 工具箱，实际找文件、查文本、做归档、观察进程、检查网络，最后独立做一次可以失败重试的交付。初次通读约 90～120 分钟，分段跟做另需约 135～190 分钟。可以在 §1.2 留下样本、§1.6 留下自己的脚本，或在 §1.10 留下可还原的归档，下次从那里接着走。章末有按符号和任务查找的两张表。语言以 Unix 系统上的 **sh 公共语法**为底，动手时统一进入 Bash，遇到 Bash 扩展、Zsh 默认行为或系统工具不同再对照。

## 1.1 终端、Shell 与第一份练习目录

### 先认出窗口里的三个角色

在刚才的终端运行 `pwd`。把最后一级名字和左侧资源管理器顶部的文件夹名比较一下。然后选 **终端 → 拆分终端**，两边分别运行 `pwd`。即使起点碰巧相同，这也是两个可以独立输入的窗口。在左边输入 `cd ..` 再运行 `pwd`，右边再运行一次 `pwd`。左边显示父目录，右边以及编辑器的文件树保留原来的位置。在左边输入 `cd -` 回到刚才的地方。若两个窗口起点不同，用资源管理器中练习文件夹的右键菜单 **在集成终端中打开**，可直接在该位置开始。

谁保存了左边的位置？终端负责接收按键、显示程序写回的字。等你输入命令、记着当前目录、解释引号并决定启动什么程序的是 **Shell**。刚才 `cd` 改了这一个 Shell 的工作目录。稍后 `cat` 读文件和 `sort` 排序，会由 Shell 调用各自的程序。脚本就是把准备交给解释器的这些文字存成文件。把一行放进编辑器保存，尚未调用解释它的程序，什么也不会执行。

macOS 可在 VS Code 的终端下拉菜单选择 Bash 或 Zsh；Linux 用发行版终端，Windows 用 WSL 中打开的 VS Code 窗口和终端。如果看见 PowerShell 的 `PS C:\…>`，先从终端的配置菜单选 WSL。进入练习目录后，在选定的 Unix 终端逐行输入：

```sh
bash --noprofile --norc
printf 'Bash %s\n' "$BASH_VERSION"
pwd
```

第一行启动一个用于练习的 Bash，跳过个人启动文件。这让下文预测的引号、通配符和管道行为有同一起点；原来窗口的 Shell 正在等待。第二行应能打印版本；第三行应指向你专门新建的空文件夹。提示符因机器而异，只输入代码块里的命令。完成后输入 `exit` 回到原来的 Shell。重开一个窗口继续时，再从这个目录进入 Bash。`$SHELL` 常常仍指向账号的登录 Shell，观察眼前这个 Bash 用 `$BASH_VERSION` 更直接。

### 建两份能看懂、也能复原的输入

在这个 Bash 里执行下列三行，再点开左侧的 `logs`。想练习图形操作，也可以直接在 VS Code 建同名目录与文件，按下方命令里的行内容填写，每条记录占一行，最后一条后也按一次回车。

```sh
mkdir -p logs out
printf '%s\n' '200 GET /home' '404 GET /icon' '200 GET /item/404' > 'logs/day one.log'
printf '%s\n' '503 GET /api' '200 GET /home' > logs/day-two.log
```

左侧应有两个并列的目录 `logs` 和 `out`，前者两份文件，后者为空。展开文件对照：第一天有三条，其中状态码为 404 的只一条；第二天有两条，其中一条为 503。后面会用这五行检验工具是否在回答我们的问题。`mkdir -p` 创建缺少的目录；`printf` 用相同格式逐个输出后面的值，`\n` 换行。`>` 把本次输出写进指定文件，会覆盖这个文件的旧内容。想重做时可以原样恢复这两份合成输入。每节写出的小产物可在编辑器中点开。暂时只做到能指出 `/item/404` 开头的数字，就有了下次继续的起点。

### 输入错了怎样退回来

试着输入 `printf '%s\n' '还没写完`，按回车。终端换了一行等待，通常出现 `>`。补一个单引号并回车，会连同刚才输入的换行一起打印。重试一次，在等待时按 **Ctrl+C**，这次你回到提示符，没有产生那段输出。以后看见提示符变了，先想上一行是否有引号、反斜线或 `if` 尚未闭合。

另一次，直接输入 `cat` 并回车。输入一行 `hello` 并回车，你会看见同一行又出现一次。前一次是终端回显你打的字，后一次是程序把读到的输入写回了屏幕。在新空行按 **Ctrl+D**，`cat` 读到输入结束并返回。**Ctrl+C** 会向前台作业请求中断；**Ctrl+D** 在这里让一次终端读取碰到结尾；阅读手册时用 **q** 退出分页器。辨认是谁在等输入，比随手关掉整个窗口更有用。

## 1.2 命令、选项、路径与帮助

### 读一句陌生命令，从交给谁、交了几项开始

```sh
ls logs
ls -l logs
ls -ld logs
```

第一条列出两个名字；第二条各多出一排权限、大小和时间；第三条只列 `logs` 自己的一排，行首是 `d`。你没有改目录，只改了 `ls` 如何呈现它。把最后一条拆开看，`ls` 是命令名，`-l` 和 `-d` 是它认识的选项，`logs` 是选项作用的对象。这里可把两个单字母选项合并；其他程序有各自的约定。`head -n 2 'logs/day one.log'` 中 `2` 属于 `-n`。读文档里的 `命令 [选项] 文件…` 时，方括号表示可省，省略号表示可重复，不用把这些符号敲进去。

回头解释开篇的 `printf`。Shell 先把输入识别为词和操作符，然后展开变量、匹配文件名、接好输入输出，再把命令及独立参数交给执行者。英文引号参与这道工序，普通情况下程序收到的字符串里已经没有那对引号。`printf` 的第一个参数是格式，`%s` 取一个字符串，`\n` 在格式中产生换行，还有多余字符串时格式会再用。试试 `printf '<%s>\n' 'hello world' '' done`，中间一行 `<>` 说明空字符串也可以占据一个参数位置。遇到格式来自用户输入的 `%` 时，把原文放在固定格式之后，如 `printf '%s\n' '进度 80%'`。

`pwd` 给出当前位置。`logs/day-two.log` 从这里起算，`./logs/day-two.log` 明写“从当前目录”，`../` 回到父目录，以 `/` 开头则从文件系统根起算。`~` 在未加引号的词首可以展开为家目录，`'~'` 保留一个波浪号。实际走一下：

```sh
(cd logs && pwd && head -n 1 day-two.log)
pwd
head -n 1 logs/day-two.log
```

两次 `head` 都读到 `503 GET /api`。括号让里面的 `cd` 在单独的 Shell 环境中生效，最后的 `pwd` 仍显示练习根目录。`&&` 让前一步成功才走下一步，避免切目录失败后在原目录继续干活。给文件加 `/` 的意义也值得试：`ls -d logs/` 能选中目录，换成 `logs/day-two.log/` 会报错，结尾的斜线要求目标是目录。

### 同名命令到底从哪里来

```sh
type cd printf ls
command -v ls
printf '%s\n' "$PATH" | tr ':' '\n'
```

看第一条中哪项标成 `builtin`。Bash 自带的命令叫内建命令，像 `cd` 必须能改变当前 Shell。外部程序如 `ls` 通常位于一个可执行文件中。对于不带斜线的命令名，Shell 能先识别别名、函数、内建命令，或沿 `PATH` 的目录去找外部文件。`command -v` 报这个环境会怎样解析名字；Bash 的 `type -a printf` 可以看到同名的多种实现。输入 `./check.sh` 则直接指向当前目录的文件，不走这份目录名单。若 `command -v` 没有输出，紧接着运行 `printf '%s\n' "$?"`，非零表示查找失败。`$?` 只保存刚完成的那条命令的状态。

在自己的练习 Bash 输入 `alias ll='ls -l'`，下一行运行 `type ll`，再试 `ll logs` 和 `unalias ll`。可用一个短名字节省敲键；脚本中直接写清实际命令，避免依赖某个人的交互设置。Tab 补全可以在打出 `logs/day` 后帮助看候选，↑ 找回上一条，Ctrl+R 用片段搜索 Bash 的历史。`history` 展示这个 Shell 可见的历史。它记录的是输入过什么，是否成功要看当时的输出和状态。

### 在机器上查一个选项，而不靠背

打开 `man head`，用 `/lines` 搜索，按 `n` 看下一处，`q` 回来。看 SYNOPSIS 里 `-n` 后面要什么，再用两行样本验证。`man 1 printf` 读系统随附的外部命令手册；在 Bash 中 `help printf`、`help test`、`help if` 解释当前解释器自己的实现或语法。`man -k archive` 在有手册索引的机器上按描述查候选。Mac 自带工具和 Linux 工具有时接受不同选项，例如不能假定 `ls --help` 处处可用。先在实际执行机器上查手册，再用练习文件试一个会改变结果的值，这个习惯也适用于以后遇到的 `git`、`npm` 或数据库客户端。

停一下，自己从第二天的文件里取**最后**一行。可以在 `man tail` 里找限制行数的选项，拿 `200 GET /home` 核对。把文件名前移到 `logs/` 之外时，若得到找不到文件，先 `pwd` 再对照相对路径，别急着去改选项。

## 1.3 引号、通配符与参数展开

回到练习目录。在 VS Code 左栏，`day one.log` 占一行。现在要把它的名字交给一个程序。怎样看出程序究竟收到了几个参数？暂时放下读文件的 `cat`，换一把看得见分界的尺。下面三行逐行运行，比较尖括号的对数。

```sh
printf '<%s>\n' logs/day one.log
printf '<%s>\n' 'logs/day one.log'
printf '<%s>\n' logs/day\ one.log
```

第一行得到 `<logs/day>` 和 `<one.log>`，后两行都只得到 `<logs/day one.log>`。这里的 `printf` 按格式里的 `%s` 填一个字符串，按 `\n` 换一行，还有参数就重复使用格式。Shell 已经在启动命令前认出了单词边界。包住名字的引号和用来保护空格的反斜杠都已经完成工作，文件名里没有这些字符。把两个引号分别挪到空格两边，试试 `logs/'day one'.log`，程序仍收到一个完整名字。**同一个单词可以由几段相邻的文字拼成。**

下面是同一问题在 VS Code 里的实际画面。图中的文件叫“今日 请求.log”；先只看左侧有几个文件，再数下方第一次 `cat` 报了几个找不到的名字。回到自己的 `day one.log`，同样的解释可以预测加引号后的结果。

![VS Code 中文件树的一份日志与终端中引用前后的实参](images/01-path.png)

### 要交出名字本身，还是名字指向的值

把上面的路径收进一个变量，再预测这三行哪个会把美元符号印在屏幕上。

```sh
file='logs/day one.log'
printf '<%s>\n' '$file'
printf '<%s>\n' "$file"
printf '<%s>\n' "copy of ${file}"
```

依次看到 `<$file>`、`<logs/day one.log>`、`<copy of logs/day one.log>`。单引号保留其中字符的字面意思；双引号让 Shell 先取变量的值，再把整个结果作为一个参数。要在后面紧接字母，比较 `"${file}_copy"` 与 `"$file_copy"`，后者寻找另一个名字叫 `file_copy` 的变量。反斜杠只照顾紧跟的字符。要印出带引号的英文句子，直接试 `printf '%s\n' "It's ready"`。把行尾反斜杠紧贴换行，可以把同一条命令分到两行；反斜杠后多一个空格，它保护的就变成空格了。

用同一把尺看空值。先执行 `set -- '' 'a b'`，再执行 `printf '个数=%s，第一个=<%s>，第二个=<%s>\n' "$#" "$1" "$2"`。得到个数 2，第一对括号中间是空的。把第一条改成 `set -- 'a b'` 再数一次。**一个内容为空的参数也有位置**。这里的 `set --` 把当前 Shell 的位置参数换成后面的清单；后面写脚本时，调用者输入的每个参数也这样占一个位置。要取第十个写 `${10}`，写 `$10` 会把第一个参数的值与字面字符 0 拼起来。

### 让目录提供候选项

```sh
printf '<%s>\n' logs/*.log
printf '<%s>\n' 'logs/*.log'
printf '<%s>\n' logs/day?one.log
printf '<%s>\n' logs/day[-a-z]*.log
```

第一条列出两条路径，含空格的路径仍完整占一项。第二条只列出星号本身。第三条中的问号刚好吃掉 `day` 和 `one` 之间的一个空格。第四条要求 `day` 后的第一个字符属于括号中的集合，样本中只有连字符合条件。这里 `-` 放在集合开头代表连字符，`a-z` 是一个范围。把第四条换成 `logs/day[[:space:]]*.log`，再预测留下哪份日志。每条命令都是 Shell 先用模式在目录中找名字，然后才调用 `printf`。一个 `*` 可以匹配零个或多个字符，默认不会跨过路径分隔符，也不会在目录项的首位匹配点文件。想查隐藏项可以用 `ls -a logs`。

现在故意查 `logs/*.absent`。默认 Bash 会把未命中的模式原样交给程序，默认交互 Zsh 会在运行程序前报 `no matches found`。这解释了同一行复制给同事可能出现的两种结果。写要兼容两者的查找时，用 `find logs -name '*.absent'`，让引号保护模式到达 `find`，由它逐项匹配。Shell 的文件名模式和文本搜索的正则表达式各有语法；`*.log` 能挑文件，`grep -E '[.]log$'` 则在文字里找以字面句点加 log 结尾的行。

在 Bash 里再比较 `printf '<%s>\n' $file` 与 `printf '<%s>\n' "$file"`。前者的空格又造成了拆分。默认 Zsh 对普通未引用的标量参数展开不做这一步，因此同事可能一次也没复现。已经存进字符串的引号也不会重新成为 Shell 源码。要保存**一组**路径，可移植脚本用位置参数，Bash 或 Zsh 脚本还可以用数组。不要为了保住一个空格而把引号字符也写进文件名。

## 1.4 变量、环境与计算

设想编辑器上同时开了开发预览与发布窗口。两个任务都要读 `logs`，其中一个临时改读 `archive`。先在练习终端看一次父子两个 Shell 的视野。

```sh
unset EPP_LOG_DIR
EPP_LOG_DIR=logs
printf '当前 <%s>\n' "$EPP_LOG_DIR"
sh -c 'printf "子进程 <%s>\n" "${EPP_LOG_DIR-没有设置}"'
export EPP_LOG_DIR
sh -c 'printf "子进程 <%s>\n" "$EPP_LOG_DIR"'
EPP_LOG_DIR=archive sh -c 'printf "单次 <%s>\n" "$EPP_LOG_DIR"'
printf '返回 <%s>\n' "$EPP_LOG_DIR"
```

依次看到 logs、没有设置、logs、archive、logs。赋值号两侧要紧贴名字和值，写成 `EPP_LOG_DIR = logs` 会让 Shell 去找名为 `EPP_LOG_DIR` 的命令。单独赋值改当前 Shell；`export` 给这个名字加上可继承的属性，后来启动的程序取得当时的一份值；放在外部命令前的赋值只给这一次调用。子 Shell 中用单引号包住整段程序，才把里面的美元符号留给子 Shell 解释。若直接写成双引号，可能是父窗口先填好了答案。要看具体应用的环境，用 `printenv EPP_LOG_DIR`；同名 Shell 变量还没导出时，用 `printf` 在当前窗口读。结束这组对照可运行 `unset EPP_LOG_DIR`。

试着在括号里改目录，或把变量标为只读。

```sh
( cd logs && pwd )
pwd
( readonly batch=morning; printf '%s\n' "$batch" )
```

第一行显示以 logs 结尾的路径，第二行回到练习目录。圆括号让这一组命令在子 Shell 环境执行，目录、变量、位置参数的改动随它结束。花括号也能把几条命令合在一起，`{ cd logs && pwd; }` 却会改变当前 Shell 的目录；想试这一句，随后用 `cd ..` 回来。花括号两边留空格，结束花括号前用分号或换行结束命令。只读变量会拒绝后续赋值，把它放在小括号里能让试验只影响里面。

### 没填写、填了空串、填了实际值

交班时允许省略报告名，有时也允许显式传空表示“不加标签”。在运行前先填一张三行小表，猜每行会打印什么。

```sh
unset label
printf '<%s> <%s>\n' "${label-morning}" "${label:-morning}"
label=''
printf '<%s> <%s>\n' "${label-morning}" "${label:-morning}"
label=night
printf '<%s> <%s>\n' "${label-morning}" "${label:-morning}"
```

看两列的三组成对结果，依次为 morning/morning、空/morning、night/night。`-` 测试有没有设置过，`:-` 连空串也视作缺省。按同样的三个输入，下表可以随手复查。前两种写法只取值，后两种会赋值或中断。

| 要解决的问题 | 写法 | 怎样验证 |
| --- | --- | --- |
| 临时替换显示 | `${label:-morning}` | 显示后再读原变量，原值保持。 |
| 仅在已有非空值时放入另一段文字 | `${label:+已标记}` | 让 label 为空和 night，分别得到空串和“已标记”。 |
| 缺省值要成为下次的起点 | `${label:=morning}` | 清空后运行 `printf '%s\n' "${label:=morning}"`，再读 label 得 morning。 |
| 缺少必填参数就结束此次脚本 | `${label:?需要标签}` | 在单独一条 `sh -c 'label=; : "${label:?需要标签}"'` 里试，读诊断和退出码；`:` 自身什么也不做，Shell 在展开参数时就发现了问题。 |

表中的 `+`、`=`、`?` 也各有不带冒号的形式，只检查未设置。若每次打出的命令相同，却有时读到旧值，先看前一次试验是否用了 `:=`。

### 从路径取名字，从命令取文本，从整数取结果

```sh
file='logs/day one.log'
name=${file##*/}
printf '名字 <%s>，主名 <%s>\n' "$name" "${name%.log}"
printf '长度 <%s>\n' "${#name}"
piece='a/b/c.log'
printf '<%s> <%s> <%s> <%s>\n' "${piece#*/}" "${piece##*/}" "${piece%/*}" "${piece%%/*}"
```

先看最后一行，得到 `b/c.log`、`c.log`、`a/b`、`a`。画三个方框表示路径的三段，单井号从左去掉最短的匹配前缀，双井号去掉最长的匹配前缀。百分号从右去掉后缀，单个与双个的取舍相同。模式里的星号与 1.3 一样能吃零个或多个字符；这里匹配的是变量里的字符串，斜杠也是普通字符。文件树不会因此发生改变。`${#name}` 在这组 ASCII 名字上给出 11，空格与点各占一位。

```sh
lines=$(wc -l < 'logs/day one.log')
printf '读到 <%s>，再来一行共 %d\n' "$lines" "$((lines + 1))"
printf '余数 %d，整数商 %d\n' "$((5 % 2))" "$((5 / 2))"
captured=$(printf 'a\n\n')
printf '<%s>\n' "$captured"
```

第一个结果外面可能有补齐宽度的空格，算出来的总数都是 4。`$(命令)` 运行命令，收集标准输出，去掉末尾全部换行，内部换行仍在。最后一行于是只有 `<a>`。若报告需要一字不差地保留结尾，直接重定向到文件。看见 `$((…))` 则走整数算术，5 除以 2 得 2，余 1。先前输出的状态要另用 `$?`，并且紧接要查的命令读取。给算术表达式的应是自己确认过的整数；带前导零的文本（例如日期中的 08）、小数和任意读者输入都需要先校验或转换。

## 1.5 条件、分支与循环

先在编辑器左栏确认两份日志都还在，然后观察一件古怪的事。下面两个检查都可能一行字也不打印，脚本要怎样知道能否继续？

```sh
test -f 'logs/day one.log'
printf '现有文件 %s\n' "$?"
test -f logs/no-such.log
printf '缺少文件 %s\n' "$?"
```

得到 0 与 1。Shell 的 `if` 会执行条件位置上的命令，看它的退出状态。把第一行直接搬到条件里，不必再取一次数字。

```sh
file='logs/day one.log'
if [ ! -f "$file" ]; then
  printf '缺文件 <%s>\n' "$file"
elif [ -s "$file" ]; then
  printf '有内容 <%s>\n' "$file"
else
  printf '空文件 <%s>\n' "$file"
fi
```

分别换成缺少的路径和用编辑器新建的空文件，观察哪一行先接住它。`[` 是一个做测试的命令，结尾的 `]` 要独立成为最后一个参数。因此 `[ "$file" = x ]` 两侧有空格。把条件换为 `if grep -q '^404 ' "$file"; then`，就能根据匹配结果执行后续工作；缺文件和无匹配的 `grep` 都返回非零，业务要区分两者时应在 `else` 的第一句保存 `$?`，1 表示无匹配，大于 1 表示出错。

| 手里的问题 | 可移植写法 | 对照输入 |
| --- | --- | --- |
| 路径指向什么 | `[ -d "$p" ]`、`[ -f "$p" ]`、`[ -L "$p" ]` | 目录、普通文件、符号链接；链接若指向普通文件，后两项都可以为真。 |
| 有字节、可读、可写、可执行或可搜索吗 | `-s`、`-r`、`-w`、`-x` | 空文件与有内容的文件；目录的 x 关系到能否按名字访问里面的项目。真正的读写仍需处理失败。 |
| 字符串如何比 | `[ -z "$v" ]`、`[ -n "$v" ]`、`[ "$a" = "$b" ]`、`[ "$a" != "$b" ]` | 空串、一个空格、文字 0。后两种长度都大于零。 |
| 整数如何比 | `-eq`、`-ne`、`-lt`、`-le`、`-gt`、`-ge` | 文本 02 与 2 用 `=` 不同，用 `-eq` 相等；数值比较前先确认内容是整数。 |
| 条件要组合 | `[ -f "$p" ] && [ -s "$p" ]`、`[ -z "$v" ] \|\| [ "$v" = auto ]` | 左侧已能决定答案时，右侧不会执行；可用 `!` 反转命令状态。 |

试 `true && false || printf '补发\n'`。明明最左边成功，仍然打印“补发”，因为中间那个命令失败了。这正是需要两个互斥分支时该写完整 `if … else … fi` 的理由。Bash 和 Zsh 还认 `[[ … ]]`。试 `[[ "$file" == *.log ]]` 与 `[[ "$file" == '*.log' ]]`，各自立即打印 `$?`，第二种会寻找含星号的字面文本。里面还可用 `=~` 匹配扩展正则，例如 `[[ 404 =~ ^[0-9]{3}$ ]]`。写给通用 sh 的脚本，使用上表的 `[` 或下面的 `case`。

### 从一个值选一路，从一批输入逐个取值

```sh
code=404
case "$code" in
  2[0-9][0-9]) printf '成功\n' ;;
  4[0-9][0-9]|5[0-9][0-9]) printf '需要检查\n' ;;
  *) printf '其他值 <%s>\n' "$code" ;;
esac
```

改成 40x、503、302 后各走哪一路？这个 `case` 逐个尝试 Shell 模式，`|` 在这里隔开候选模式，`;;` 在第一条命中后结束本次选择，末尾的星号接住余项。若在最前面就写星号，其余分支将没有机会。

```sh
for file in 'logs/day one.log' logs/day-two.log logs/no-such.log; do
  if [ ! -f "$file" ]; then
    printf '跳过 <%s>\n' "$file"
    continue
  fi
  printf '已读 <%s>\n' "$file"
done
```

运行结果是两条“已读”和一条“跳过”。把缺件移到两个好文件之间，再依次把 `continue` 换成 `break`。哪个版本仍能到达第三项？`continue` 回到本层循环选下一项，`break` 跳出本层循环，后面若有命令仍会执行。可选整数如 `break 2` 表示跳出两层。循环要逐个保住文件名的边界，所以直接使用参数或通配符产生的清单；解析 `ls` 的显示文本会重新把空格、换行当成可能的分隔线。

```sh
n=0
while [ "$n" -lt 3 ]; do
  printf '第 %d 行\n' "$((n + 1))"
  n=$((n + 1))
done
until [ "$n" -eq 0 ]; do
  printf '还剩 %d\n' "$n"
  n=$((n - 1))
done
```

第一圈打印 1、2、3，第二圈打印 3、2、1。`while` 在条件成功时进入，`until` 在条件失败时进入，两者都先试条件，所以可能一次也不进。写轮询时还需要退出边界和等待间隔，先用这个能自然停下的计数看清判断与更新的顺序。

日志行数由文件决定，预先猜次数就走远了。让读取本身充当条件。

```sh
count=0
while IFS= read -r line || [ -n "$line" ]; do
  count=$((count + 1))
  printf '第 %s 行 <%s>\n' "$count" "$line"
done < 'logs/day one.log'
printf '合计 %s\n' "$count"
```

出现三条原文，最后合计 3。重定向跟在 `done` 后面，整圈循环共用一个输入。`read` 从中取一行；局部的 `IFS=` 保留两端空白，`-r` 保留反斜杠。最后一行即使没有换行，`read` 会留下已读的文字却返回非零，右侧长度检查让它有一次处理机会。可用 `printf '  a\\b\nz' > out/lines.txt` 制造两行，第二行没有换行，改读这个文件来验证。若把整段改写成 `cat 文件 | while …`，在默认 Bash 中循环运行于子 Shell，回到当前 Shell 时 count 仍是原值；Zsh 的管道末段行为可以不同。

## 1.6 函数、脚本入口与选项解析

每次交接都要先打印参数。假如同事把路径连同空格发过来，你怎样确认自己的包装函数按原样转交了它们？

```sh
show_args() {
  printf '共 %d 项\n' "$#"
  for item do
    printf '<%s>\n' "$item"
  done
}
set -- 'logs/day one.log' '' 'logs/day-two.log'
show_args "$@"
show_args "$*"
```

第一遍有三项，其中第二项为空；第二遍只有一项，默认用空格连成一条长串。`for item do` 省略清单，相当于 `for item in "$@"; do`。调用函数时，它在函数体里取得自己的 `$1`、`$2`、`$#`，返回后恢复调用者的位置参数。`"$@"` 逐项转交，恰好能保住空项和带空格的项。`"$*"` 则以 IFS 的首字符连接所有值，适合项目约定要生成一句文字的场合。遇到选项需要消耗第一个参数时，`shift` 把第二个移成第一个，一次移走多个用 `shift n`。先确认 `$#` 足够。

变量要另看。函数中普通赋值可以改到调用方，上例中的 item 会留下最终值。Bash 与 Zsh 可在函数开头写 `local item`；通用 sh 的可移植办法是把函数体写成 `show_args() ( … )`，使用子 Shell 环境隔开改动。要从函数带出计算结果，小段文本可以写标准输出由调用者收集，成功与失败用状态。试 `check_one() { [ -f "$1" ] || return 2; [ -s "$1" ]; }`，分别用一份有内容的日志和缺件调用，紧跟 `printf '%s\n' "$?"`。得到 0 与 2。没有显式 `return` 时，函数沿用最后执行的命令的状态。若在函数里写 `exit`，会要求执行它的整个 Shell 退出。

### 把命令写成一份别人也能调用的工具

先定调用形状：`sh report.sh -n 2 'logs/day one.log' logs/day-two.log` 应选两份文件，每份显示前两行。`-n 0` 应读到哪几个文件？遇到缺件和非法选项应怎样告诉调用者？在 VS Code 练习目录新建 **report.sh**，先只写下列内容，保存并运行。

```sh
#!/bin/sh
printf '脚本 <%s>，收到 %s 项\n' "$0" "$#"
for arg do printf '<%s>\n' "$arg"; done
```

能看到脚本名和四项。第一项是 `-n`，第二项是 2，这两个都不能直接当成路径。将文件内容替换为下面一版。冒号、引号、换行的位置都可以拿上节的条件和循环来读。

```sh
#!/bin/sh
usage() {
  printf '用法：%s [-n 行数] [--] 文件…\n' "$0" >&2
}

limit=1
while getopts ':n:h' opt; do
  case "$opt" in
    n) limit=$OPTARG ;;
    h) usage; exit 0 ;;
    :) printf '选项 -%s 缺少值\n' "$OPTARG" >&2; exit 2 ;;
    \?) printf '未知选项 -%s\n' "$OPTARG" >&2; exit 2 ;;
  esac
done
shift "$((OPTIND - 1))"

case "$limit" in ''|*[!0-9]*) usage; exit 2 ;; esac
if [ "$#" -eq 0 ]; then usage; exit 2; fi
for file do
  if [ ! -f "$file" ]; then
    printf '缺少普通文件 <%s>\n' "$file" >&2
    exit 1
  fi
  printf '文件 <%s>\n' "$file"
  case "$file" in -*) file=./$file ;; esac
  case "$limit" in
    *[1-9]*) head -n "$limit" "$file" || exit 1 ;;
  esac
done
```

`getopts` 每次取出一个短选项名放进 opt。`n:` 表示 n 后面需要值，值放在 OPTARG，h 单独出现就行。最开头的冒号让脚本接管错误提示；缺值时 opt 取冒号，陌生选项时 opt 取问号。写成 `\?)` 才会匹配字面问号。`OPTIND` 指着下一项的位置，从 1 开始；循环停下后移走它前面用掉的参数，留下文件。选项写在文件前，`--` 可以明确结束选项；下一项即使以连字符开头，也会交给本脚本当路径。调用内部命令时仍需照顾这类名字，所以在传给 head 前给它补 `./`。

| 在练习目录运行 | 在屏幕和退出状态中核对什么 |
| --- | --- |
| `sh report.sh -n 2 'logs/day one.log' logs/day-two.log` | 两个文件标题，文件下各两行，结束状态 0。 |
| `sh report.sh -n 0 'logs/day one.log'` | 仍有标题，下面零行。 |
| `sh report.sh -n`、`sh report.sh -x`、`sh report.sh -n x logs/day-two.log` | 分别是缺值、未知选项、行数无效，紧接着读状态均为 2。 |
| `sh report.sh -- logs/no-such.log` | 选项部分已经通过，诊断变成缺文件，状态 1。 |

若 limit 全是零，脚本直接结束这一项的输出。这样在不接受 `head -n 0` 的 macOS 版本上也能交付同样的结果。

第一行 `#!/bin/sh` 供系统直接启动可执行脚本时选择解释器。试 `chmod u+x report.sh`，然后 `./report.sh -h`。这里的 `./` 给出了路径；只写 `report.sh` 通常会去 PATH 中查找。反过来，显式写 `bash report.sh` 就已经由调用者选择了 Bash，Shell 只需能读这个文件。Windows 编辑器若把首行保存为 CRLF，系统可能把回车也当作解释器路径的一部分；在 VS Code 状态栏选择 LF 再保存。要看执行顺序，先 `sh -n report.sh` 检查语法，再用 `sh -x report.sh -n 0 logs/day-two.log` 追踪这个合成样本，比较选项消耗前后。

当你希望一个文件只提供函数时，在编辑器另建 **helpers.sh**，内容写 `say_file() { printf '文件 <%s>\n' "$1"; }`。运行 `sh helpers.sh` 后，当前窗口并没有得到 say_file。再运行 `. ./helpers.sh` 和 `say_file 'logs/day one.log'`，这次就有了。第一个点是“在当前 Shell 环境读取并执行”的命令，后面的 `./` 表示当前目录。Bash 与 Zsh 也认 `source`。若把带有 `exit` 的整份 report.sh 当作函数库加载，它的退出会作用到当前环境。分开存放入口和函数库，调用时就能看清谁拥有这个窗口的状态。

### 什么时候值得选用数组

回到“明天要交哪几份日志”。调用参数足够简单，若还想在同一个脚本中同时保留“输入清单”和“已选清单”，就需要两组独立的位置。明确选用 Bash 后，在终端另开 `bash` 运行下面一段。

```bash
files=('logs/day one.log' 'logs/day-two.log')
printf '数量 %d，首项 <%s>\n' "${#files[@]}" "${files[0]}"
files+=('logs/no-such.log')
for file in "${files[@]}"; do printf '<%s>\n' "$file"; done
```

先见到数量 2 和首项，追加后出现三项，空格仍留在第一项内部。`"${files[@]}"` 和先前的 `"$@"` 有相同的逐项效果。默认 Zsh 也能用这组括号与逐项展开，但普通数组的首项写 `${files[1]}`；系统 sh 脚本应使用位置参数或逐行读取。若手里的 Bash 示例用 `declare -A` 声明关联数组，还要看 `bash --version`，它要求 Bash 4 或更新；系统配备的旧版 Bash 可继续做上面的索引数组练习。运行 `exit` 返回原终端。

最后改一项需求：给 report.sh 加一个 `-q`，只隐藏每个文件的标题，仍须保留正文、缺件诊断和原状态。先在纸上选出哪三处需要改，再用 `-q -n 0` 对比一份存在与一份缺少的文件。两次都应没有正文，退出状态却应分别为 0 和 1。若两次都得到 0，检查自己的分支有没有把读文件或缺件检查一起跳过。

## 1.7 标准输入输出、重定向、管道与退出状态

### 去屏幕的两句话，为什么只有一句进文件

先把下面一行当成一个会说两句话的小程序。在练习 Bash 输入它，然后打开左侧的 `out` 看一眼。

```sh
sh -c 'printf "report\n"; printf "diagnostic\n" >&2'
```

屏幕上先有 `report`，再有 `diagnostic`。`sh -c '…'` 临时开一个 sh 执行引号里的命令文本，分号分隔两条命令。给这整个调用加一个出口，再把两条路分开接：

```sh
sh -c 'printf "report\n"; printf "diagnostic\n" >&2' > out/report.txt
sh -c 'printf "report\n"; printf "diagnostic\n" >&2' > out/report.txt 2> out/diagnostic.txt
cat out/report.txt
cat out/diagnostic.txt
```

第一次写文件时，屏幕上仍有 `diagnostic`。第二次屏幕安静，点开两份文件却各有一行。程序启动时通常有三个编号的通道，叫文件描述符。**0** 从标准输入读；**1** 把正常结果写到标准输出；**2** 把诊断写到标准错误。交互终端通常同时显示 1 和 2，眼睛原先看不出区别。内层的 `>&2` 把那个 `printf` 的正常输出接到 2；外层的 `2>` 为整个 `sh` 选择诊断目的地。`2` 必须紧邻 `>`；写成 `2 > 文件` 会交给程序一个额外参数 `2`。

比较 `wc -l 'logs/day one.log'` 和 `wc -l < 'logs/day one.log'`。第一条得到行数和路径，第二条只有行数。前者是 `wc` 拿到文件名后自行打开；后者是 Shell 打开文件接到 0，`wc` 从 0 读取，压根没收到名字。试一次换成缺失文件：重定向打不开时连 `wc` 都不会启动。

| 想让文字去哪儿 | 写法 | 自己能核对什么 |
| --- | --- | --- |
| 从头写／接着写 | `printf 'A\n' > out/letters`，再 `printf 'B\n' >> out/letters` | 两行 A、B；重做第一条马上只剩 A。打开并截短发生在启动命令之前。 |
| 只留诊断／追加诊断 | `cat logs/absent 2> out/error`，再把 `2>` 换成 `2>>` | 两次都失败，诊断从一条变两条；换语言时原文可能不同。 |
| 一段时间内丢掉一个通道 | `wc -l < logs/day-two.log > /dev/null` | 屏幕静默；紧接着打印 `$?` 得 0。`/dev/null` 接受写入；从它读取立即到末尾。 |
| 一组命令共用同一目的地 | `{ printf 'A\n'; printf 'B\n'; } > out/group` | 文件两行。`{` 和 `}` 是单独的词，闭合前需要换行或分号。组内变量、`cd` 可影响本 Shell；圆括号把这些变化隔开。 |

一个容易被日志外观掩盖的次序问题，可以靠同一对词解开。先只预测第二行的 `diagnostic` 会出现在哪里：

```sh
sh -c 'echo report; echo diagnostic >&2' > out/both 2>&1
sh -c 'echo report; echo diagnostic >&2' 2>&1 > out/one
cat out/both
cat out/one
```

第一条先让 1 指向 `both`，再让 2 复制**此时**的 1，文件里两行。第二条先让 2 复制尚指向屏幕的 1，接着才把 1 改向 `one`。所以执行第二条时就会在屏幕看到 `diagnostic`，`one` 里只有 `report`。`2>&1` 的 `&` 在这里区分“复制通道 1”和“打开名叫 1 的文件”。

### 管道里流动的是字节，成功与失败另有一条线索

```sh
grep '404' 'logs/day one.log'
grep '^404 ' 'logs/day one.log' | tee out/missing.txt | wc -l
```

先看第一条匹配了哪两行。第二条的 `^` 要求从行首匹配，空格要求这一列到此结束。`grep` 把完整记录写到 1；`|` 把那一端连给下一程序的 0；`tee` 把同一串字节写到文件并继续送往下游；`wc -l` 数到一个换行。打开 `missing.txt` 看见 `/icon`，屏幕只看见数字 1。`tee -a` 会追加。要看长管道中间发生了什么，先执行第一段，结果对了再接下一段；若必须让数据继续流过，可在中间插入 `tee`。下游可能在上游还没结束时就开始读取，大文件不必先塞进一个变量。

现在拿走输入。执行下列每组时，先留意屏幕有没有诊断，再看管道最后报出的状态。

```sh
cat logs/absent | wc -l
printf 'pipeline=%s\n' "$?"
(set -o pipefail; cat logs/absent | wc -l; printf 'pipeline=%s\n' "$?")
```

两次都可能看到 0 行。默认规则用最后一段的状态，`wc` 确实数完了收到的空输入，所以第一组的 `pipeline=0`。第二组在子 Shell 的 Bash 开启 `pipefail`，只要有一段失败，管道取最右边非零的状态。读数依旧相同，**现在才有理由决定这一批不能交**。要看 Bash 每一段的状态，可重新运行那条管道，紧接着 `printf '%s\n' "${PIPESTATUS[@]}"`；原生 Zsh 对应 `"${pipestatus[@]}"`。中间插一次 `echo` 就会换成新命令的状态。

在交接实验里，两次运行的终端都回到了提示符。对照图中两次状态：已读完且全为 200 的日志可以交接，缺少输入的检查需要补件再跑。

![VS Code 终端中对照两次检查的退出状态与诊断](images/03-status.png)

再试 `grep '^418 ' logs/day-two.log`。它完整读完却没有匹配，状态为 1；`grep` 的 0 表示匹配，出错大于 1。`diff` 也有它自己的状态约定。对于这种程序，问清状态的含义，比笼统地给每条命令加“失败就退出”更好用。若脚本需要特判，紧跟命令保存 `rc=$?`，然后 `case "$rc" in … esac`。`a && b` 表示 `a` 成功才做 `b`，`a || b` 表示 `a` 非零才做 `b`；`a && b || c` 在 **b** 失败时也会做 `c`。需要两个互斥分支时用前面写过的 `if …; then …; else …; fi`。

### 一段文字、一份名单和脚本一起争用输入

要给小程序准备多行样本，可以把输入挨着代码写。运行这两段，先比较两行里出现的是变量名还是今天的值。

```sh
label=morning
cat <<END
run=$label
END
cat <<'END'
run=$label
END
```

第一段得到 `run=morning`，第二段得到字面上的 `run=$label`。这个写法叫 here-document。结束行从行首开始单独写 `END`；引用过分隔词，正文就原样交给命令。`<<-` 允许剥掉行首 **Tab**，空格仍然算正文。Bash 和 Zsh 还有 `wc -l <<< 'one line'`，把一个字符串再加换行送进去；交给旧 `/bin/sh` 的脚本用 `printf '%s\n' 'one line' | wc -l` 或 here-document。

若要在 `while` 里累计，从循环的**输入**接文件更直观：

```sh
count=0
while IFS= read -r line; do
  count=$((count + 1))
done < 'logs/day one.log'
printf '%s\n' "$count"
```

这两份输入都以换行结尾，所以得到 3。换成 `cat 'logs/day one.log' | while …; done`，Bash 默认让循环在管道的子进程环境里运行；循环外可能仍读到原来的 0。某些 Shell 或设置可让最后一段留在当前环境。要在循环外使用累加结果，把 `< 文件` 接在 `done` 后在两类环境都可表达这个意图。处理可能缺末尾换行的清单时，条件可写作 `while IFS= read -r line || [ -n "$line" ]; do`，用残留的非空内容处理最后一条。

还有一种偶尔在部署脚本里见到的 `exec 3< 文件`。试着在**括号内**运行以下代码，让 0 继续留给原来的输入。程序从 3 读两次，会得到两行不同的文字。

```sh
(
  exec 3< 'logs/day one.log' || exit 1
  IFS= read -r first <&3
  IFS= read -r second <&3
  printf '1 [%s]\n2 [%s]\n' "$first" "$second"
  exec 3<&-
)
```

`exec` 没带程序，只为这个 Shell 保留已打开的描述符；`<&3` 暂时借用它，`3<&-` 关闭它。用同一打开位置往下读，就能在某个工作步骤另有标准输入时继续读名单。若 `exec` 后面带命令（如 `exec bash script.sh`），它会用目标程序替换当前 Shell，这两种用法应分开读。

## 1.8 文件、目录、权限与磁盘

你在 VS Code 左边看到两份日志，想把它们交给同事，又想保留自己手边的原稿。打开练习目录的集成终端。先在文件树里展开 `logs` 和 `out`，暂时让它们保持可见。接下来只在 `out` 里做副本。即使跳过了前面的脚本练习，只要有开头那两份日志就能从这里接上。

### 找到的是哪一个目录里的文件

点开 `logs/day one.log`，先看看标签页上的名字，再在终端运行下面三行。第三行中的点代表运行这一刻的工作目录。

```sh
pwd
ls -la logs
find ./logs -type f -name '*.log'
```

第一行末尾应当是练习目录名。第二行左边能看到形如 `-rw-r--r--` 的一列，右边有 `day one.log` 和 `day-two.log`。第三行给出从 `./logs` 开始的两条路径。输出先后可以不同。试把起点换成 `./out`。同样的文件名条件，这次只会列出输出目录里已经有的日志。诊断说起点不存在时，先看 `pwd`，再找编辑器打开的文件夹属于哪一层。

`ls` 回答“这一层看起来怎样”，`find` 会自己沿子目录向下走。`-type f` 只要普通文件，`-name` 匹配路径的最后一段。单引号把星号送到 find 手里，让它对走到的每一个名字重新比较。把 `-name '*.log'` 换成 `-name 'day?one.log'`，问号可以吃掉中间的一个空格；第二天的名字长度和末尾拼写都对不上。要把完整路径交给后续命令，可以直接试下面两种交接。

```sh
find ./logs -type f -name '*.log' -exec wc -l {} \;
find ./logs -type f -name '*.log' -exec wc -l {} +
```

第一种每找到一份就启动一次 `wc`，两份各自报行数 3、2。大括号是路径的位置，反斜杠让分号原样交给 find。第二种允许 find 攒一批名字再启动程序；在这两份文件上，同一次 `wc` 收到两个参数，末尾就多了一行总数 5。哪怕名字带空格，find 递交的也始终是一整个参数。

如果程序之间隔了一根管道，递交的是字节。用下列对照观察参数边界。第一行会把空格当作分隔；第二行采用 macOS 和 Linux 常见工具都支持的零字节分隔。

```sh
find ./logs -type f -print | xargs -n 1 printf '<%s>\n'
find ./logs -type f -print0 | xargs -0 -n 1 printf '<%s>\n'
```

数两次尖括号里的条目。第一轮里 `<./logs/day>` 和 `<one.log>` 各占一行；第二轮是完整的 `<./logs/day one.log>`。文件名甚至可以含有换行符，却不能含零字节；约定由 `-print0` 写分隔、`-0` 读分隔，读写双方必须配套。临时想对找到的每个文件执行一次动作，前面的 `-exec` 可以省下这次格式转换。

### 复制、改名和链接后，编辑器打开的还是同一份吗

```sh
mkdir -p out/files
cp 'logs/day one.log' out/files/draft.txt
mv out/files/draft.txt out/files/notes.txt
cat out/files/notes.txt
```

留意文件树中先出现哪个名字、哪个名字又消失。重做时 `cp` 默认能覆盖目标；想在覆盖前自己判断，交互时可用 `cp -i` 或 `mv -i`。目录有多层时 `mkdir -p` 会补齐上层；复制整棵目录用 `cp -R`，运行前确认目标目录是否已经存在，存在时源目录可能会被放进它下面。

接下来让三个名字同时出现在文件树里。这组命令在 `out/files` 第一次做；重做时先在文件树删除上轮两个 link 名字。先猜，若往 `notes.txt` 追加文字，另外两个名字中哪个会读到它？

```sh
ln out/files/notes.txt out/files/hard-link
ln -s notes.txt out/files/soft-link
ls -li out/files
printf '%s\n' 'handoff' >> out/files/notes.txt
tail -n 1 out/files/hard-link out/files/soft-link
```

两个入口都能读到 `handoff`。仔细看 `ls -li` 第一列，硬链接与 `notes.txt` 的 inode 编号相同。它们在同一文件系统上给同一个文件对象登记了两个名字。符号链接有自己的编号，箭头后面写着 `notes.txt`。试一下 `readlink out/files/soft-link`，屏幕会单独打印这段文字。访问链接时系统从链接所在目录继续解析这段路径。只凭两个入口的文字相同，还分不出它们的机制。改一个名字再测。

```sh
mv out/files/notes.txt out/files/moved.txt
cat out/files/soft-link
tail -n 1 out/files/hard-link
mv out/files/moved.txt out/files/notes.txt
```

中间的 `cat` 会报找不到文件，硬链接仍读得到末行。最后把名字移回来，符号链接随即恢复。`rm out/files/soft-link` 会移去链接这个目录项；要撤销本练习的硬链接可运行 `rm out/files/hard-link`，然后重新打开 `notes.txt`。终端的 `rm` 通常不经过废纸篓。删空练习目录可以用 `rmdir`，目录仍有内容时它会拒绝。遇到“想清空目录再重来”，先在编辑器展开目录，确认要移走的确切成员。

### 读文件、列目录、穿过目录分别需要什么

```sh
mkdir -p out/files/entry
printf 'Friday\n' > out/files/entry/title
chmod 600 out/files/entry/title
ls -ld out/files/entry out/files/entry/title
chmod u-r out/files/entry/title
cat out/files/entry/title
chmod u+r out/files/entry/title
cat out/files/entry/title
```

以普通文件所有者、没有额外授权的终端做，中间一次读取会报权限错误，恢复后读到 Friday。第一列首字符 `d` 表示目录，普通文件此处显示 `-`。往后每三个字符给一组人，依次为属主、组内成员、其他人。读、写、执行三个位的数值为 4、2、1，所以 `600` 让属主读写，后两组各为零；`u-r` 只改属主的读取位。macOS ACL 等额外机制也能参与判定，观察时应使用自己的普通账号。

现在把同一个动作换到目录上。`ls -ld` 查看目录自身；`ls 目录` 要列出里面的名字。普通用户试 `chmod u-x out/files/entry`，再 `cat out/files/entry/title`。即使你知道精确文件名、文件自身允许读，系统走到 `entry` 这层仍要检查能否穿过。用 `chmod u+x out/files/entry` 恢复，再试一次。创建或移走一个名字涉及其父目录的写入和穿过权限；文件自身可写决定能否改里面的字节。遇到 `Permission denied`，应沿完整路径分别检查。用 `id` 查当前身份与附属组，`ls -ln` 用数字显示所有者和组，方便跨机器比对。若一段构建命令运行失败，直接把整棵项目改成 `777` 会把写权限也给无关账号，且掩盖真正出错的层级。

想让新建的私有文件一出生就只有自己能读？先在一个子 Shell 中观察 `umask`。它会屏蔽创建请求里的权限位；程序创建普通数据文件时通常请求 `666`，创建目录通常请求 `777`。下面的条件是 `private-note` 尚未存在，新建后看前三位；若它已存在，`touch` 只更新时间戳，再看文件，原有内容和权限都还在。

```sh
(umask 077; touch out/files/private-note; ls -l out/files/private-note)
```

### 空间不足，该称一个文件还是问整个卷

| 眼前的问题 | 从样本动手 | 重点看哪一列 |
| --- | --- | --- |
| 两份样本分别几字节 | `wc -c logs/*.log` | 文件的逻辑字节数，末行为合计 |
| 当前目录占用多少存储块 | `du -sh ./logs`，再试 `du -ah ./logs` | 前者给整个目录的小计，后者展开成员；很短的文件也可能占一个完整分配块 |
| 当前目录所在文件系统还有多少可用 | `df -h .` | 看 Available 或 Avail，以及挂载点；同一卷还承载其他目录 |
| 某文件是何类型 | `file 'logs/day one.log'` | 看从内容推断的类型；只改扩展名再比较 |
| 精确核对大小和权限 | Mac 用 `stat -f '%z %Sp' 'logs/day one.log'`，GNU/Linux 用 `stat -c '%s %A' 'logs/day one.log'` | 模板选项和字段拼写跟工具实现有关 |
| 从一个路径取得目录部分或最后一段 | `dirname 'logs/day one.log'`、`basename 'logs/day one.log' .log` | 分别得到 logs 和 day one；这两个动作处理路径文字，即使文件已经移走也可能输出相同结果 |

把一份原日志复制到 `out`，再重复 `wc -c`、`du -sh`、`df -h`。预想哪一种能可靠报告副本的精确字节数，哪一种会因显示单位太粗几乎看不见变化。要查单文件为何传少了几字节，先回到第一行；要查“整卷已满但当前项目很小”，则需要同时查目录和卷两个范围。

### 在终端里辨认环境，给交接记录标上时间

想象两位同事各发来一张终端截图，都显示相同的项目文件。你能从文件名判断他们用哪一套 `stat` 参数吗？在自己的终端运行 `uname -s` 和 `uname -m`，前者在 macOS 上通常写 Darwin，在 Linux 上写 Linux，后者给出机器架构。远程登录后再运行时，回答的是运行这条命令的那一端。再用 `hostname` 看机器名，`whoami` 看运行命令的有效用户，`id` 看它还属于哪些组。如果两边系统相同却只有一边能读文件，可以拿刚才的权限实验解释应先核对哪一项。

两位同事又各留下一行“九点开始”，其中一人出差了。试 `date '+%Y-%m-%d %H:%M:%S %z'`，再试 `date -u '+%Y-%m-%d %H:%M:%S %z'`。末列给出本地时差或 `+0000`，两次相差几小时取决于你的时区。给交接单记录 UTC 时间可以这样写：

```sh
printf '交接时间 %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > out/handoff-time.txt
cat out/handoff-time.txt
```

打开文件，哪部分由 Shell 执行，哪部分由 `date` 解释？最外层引号保住替换结果这个参数，百分号交给 `date` 生成日期，末尾 Z 是格式里用来标明 UTC 的字面字符。这一行记录的是某个时刻。想看机器运行了多久，可以读 `uptime`；想量某条练习命令花了多久，可以在它前面加 `time`。三者能回答的问题各不相同。

## 1.9 文本查找、编辑与报表

编辑器里搜索 `404`，第一天日志会亮两处。今天值班的人问“有几次请求真的失败”，你会把两处都圈出来吗？三列分别是状态、方法、路径。`/item/404` 是一个成功请求的路径。先在编辑器中手工选出失败的那一行，留着它校对下面的筛选。这一节只读两份原日志，把中间结果写到 `out/text`。

### 先看形状，再决定搜字符、搜模式还是取字段

```sh
mkdir -p out/text
cat 'logs/day one.log' logs/day-two.log > out/text/all.log
head -n 2 out/text/all.log
tail -n 2 out/text/all.log
grep -nF '404' out/text/all.log
grep -nE '^[45][0-9][0-9] ' out/text/all.log
```

上下各取两行，可以先认出文件的起止。`grep -nF` 给每个匹配行标上原行号，用固定字符串找，第二行和第三行都有 404。最后一行多了 `-E`，这次把条件当扩展正则表达式。从行首 `^` 起，先允许 4 或 5，再要两个数字和一个空格，所以交出的应该是第 2 行 404 和第 4 行 503。末尾若需要锁定，正则用 `$`。想核对“恰好是这一整行”也可以直接写 `grep -Fx '404 GET /icon' out/text/all.log`。加 `-v` 选其余行，`-i` 忽略大小写，`-c` 数命中的行，每行出现两次也只算一行。先改成诸如 `418` 的状态再看退出状态，grep 用 1 表示没匹配，读取错误会给大于 1 的状态。

文件一变大，就用 `less out/text/all.log` 打开，在里面输入 `/404` 回车，按 `n` 找下一处、`q` 回终端。`tail -f` 会继续等新行；可以在一个窗口运行 `tail -f out/text/all.log`，另一个窗口向该副本追加一行后观察，按 Ctrl+C 离开。下次从上面那条 `cat` 重做，恢复五行基线。`wc -l` 数换行符；文件最后半行缺少换行也有可见文字。试 `printf X | wc -l` 和 `printf 'X\n' | wc -l`，两个答案分别是 0 和 1。

### cut、tr、sed、awk 各能看见什么

```sh
cut -d ' ' -f 1,3 'logs/day one.log'
printf '%s\n' '404  GET /icon' | cut -d ' ' -f 2
printf '%s\n' '404  GET /icon' | awk '{print $2}'
printf '%s\n' '404  GET /icon' | tr -s ' '
```

第一行把第 1 和第 3 列投影出来。第二行故意在 404 后放两个空格，cut 每遇一个分隔符就切开，所以第二个字段是空串。awk 默认按连续空白拆字段，再取第二列会得到 GET。`tr -s ' '` 把连续空格压成一个；如果原文某字段允许有意义的空格，这一步也会把它改掉。换成 `tr '[:lower:]' '[:upper:]'`，它做的是逐字符映射，路径也会变大写。要只改“方法”那一列，应该让能辨认字段的程序动手。awk 程序外面的单引号让 `$2` 到 awk 手里仍是字面代码。

```sh
sed -n '2,4p' out/text/all.log
sed 's|/home$|/start|' out/text/all.log > out/text/preview.log
awk '$1 ~ /^[45][0-9][0-9]$/ {print NR, $1, $3}' out/text/all.log
```

用编辑器并排打开 `all.log` 和 `preview.log`。第 1 和第 5 行的路径换成了 `/start`。第二条 sed 的 `s` 做替换，两边模式和替代文本用竖线分隔，路径里的斜杠就不必再转义；行尾条件保住了更长的路径。默认每行最多换第一次，末尾添 `g` 才替换该行所有匹配。第一条 sed 的 `-n` 关掉默认打印，`2,4p` 单独打印第 2 至 4 行。两条 sed 都把结果交给标准输出，所以预览很容易。编辑原文件的 `sed -i` 在 macOS 和 GNU 的无备份写法不同；用单独的输出文件也方便先检查。

最后一条 awk 由“什么行入选”和“大括号里做什么”组成，`NR` 是从起点累计的记录号，`$0` 是整行，`NF` 是本行字段数。自己先写出结果再核对，应是 `2 404 /icon` 和 `4 503 /api`。如果要把文件名放在首列，直接把两份原日志作为 awk 的输入，用 `FILENAME` 和每文件重新从 1 开始的 `FNR` 替换 `NR`。试着推算第二个错误会获得哪个行号。

### 同样叫计数，输入的次序会不会改变答案

```sh
cut -d ' ' -f 1 out/text/all.log > out/text/codes
uniq -c out/text/codes
LC_ALL=C sort out/text/codes | uniq -c
awk '{count[$1]++} END {for (code in count) print code, count[code]}' out/text/all.log | LC_ALL=C sort
```

展开 `codes`，它的顺序是 200、404、200、503、200。第一遍 `uniq -c` 依次给五组 1，因为它只合并相邻的相同行。先排序再合并，会看到三行，200 的计数为 3，其余各为 1。最后一条在扫描时把状态作为键，遇一次加一，扫完才取出所有键；这次排序只决定报告交出的顺序。要按数值比较可用 `sort -n`，逆序加 `-r`，按某列排序再用 `-k` 指定起止列，例如对最后一条的两列结果用 `sort -k2,2nr -k1,1`，次数多的排前，同次数再按状态排。两种思路遇到文件中缺一整类状态都会没有对应行，若报告约定必须显示零，需要给待统计的类别一份独立名单。

要把另一个程序的结果按行贴到旁边，可以在重跑后试这一组。

```sh
cut -d ' ' -f 3 out/text/all.log > out/text/routes
paste out/text/codes out/text/routes | head -n 2
awk 'NF != 3 {print NR, $0}' out/text/all.log
```

paste 输出 `200` 与 `/home`、`404` 与 `/icon`，中间默认是制表符。它按位置拼，任一侧先独自排序或漏一行，屏幕上仍像一份两列表格，却可能把状态贴给了别人的路径。最后一行按字段数找异常。给 **副本** 增加 `404 /icon` 再运行，能指出行号；若写成 `GET 404 /icon`，字段数仍然是三，换成状态字段模式检查才能发现问题。现在把输出目标换成“统计失败最多的路径”。手算两份原日志得到两条并列，`/api` 和 `/icon` 各一次；若出现 `/item/404`，回去看筛选条件落在哪一列。

## 1.10 比较、归档与交付

你要交两天日志，同事只拿到一个压缩包。分别给自己三个可核对的问题：改稿改了哪行？包里有哪几个相对路径？对方收到的字节是否和发出时一致？本节从原始 `logs` 重建材料，上一节的报表可以留在原处。

### 肉眼看差异，程序按状态决定要不要继续

```sh
mkdir -p out/delivery
cp 'logs/day one.log' out/delivery/before.log
sed 's|/icon$|/favicon.ico|' out/delivery/before.log > out/delivery/after.log
diff -u out/delivery/before.log out/delivery/after.log
printf 'diff status = %s\n' "$?"
```

看带单个减号和加号的两行，一行旧路径、一行新路径，周围相同的行保留作上下文。状态为 1。这对自动任务很重要：`diff` 的 0 表示相同，1 表示确有差异，大于 1 表示输入或处理出错。`cmp` 则逐字节比较，到第一次差异就能指出位置。想让脚本只按状态选择，用 `cmp -s`。相同的文本行若一份用 CRLF、一份用 LF，字节比较也会指出不同；用 `od -An -tx1 文件` 看原字节，行尾的 `0d 0a` 与 `0a` 可直接分辨。把 `after.log` 与它自己比较，再拿一个不存在的路径比较，用两次状态和诊断来区分成功、差异及无法完成。

如果要给维护同一份旧稿的人传改动，可以让补丁携带差异和上下文。这里显式提供接收用的文件名，便于观察改动落在哪里。

```sh
diff -u out/delivery/before.log out/delivery/after.log > out/delivery/route.patch
cp out/delivery/before.log out/delivery/received.log
patch out/delivery/received.log < out/delivery/route.patch
cmp out/delivery/received.log out/delivery/after.log
```

最后一行通常安静返回，紧接着查状态应为 0。把 `received.log` 打开，第一天的三笔请求还在，只修订了一个路径。这个补丁有“旧稿是什么样”的前提；拿另一份日志来接时，上下文对不上可能拒绝应用。重做请从复制旧稿开始。

### 把文件和相对名字一起打包

```sh
mkdir -p out/delivery/unpacked
tar -cf out/delivery/logs.tar -C logs 'day one.log' day-two.log
tar -tf out/delivery/logs.tar
gzip -c out/delivery/logs.tar > out/delivery/logs.tar.gz
gzip -t out/delivery/logs.tar.gz && printf 'gzip OK\n'
tar -xzf out/delivery/logs.tar.gz -C out/delivery/unpacked
cmp 'logs/day one.log' 'out/delivery/unpacked/day one.log'
cmp logs/day-two.log out/delivery/unpacked/day-two.log
```

运行第二行后先在编辑器展开 `out/delivery`，两份文件合成了一个 tar。第三行只列成员，屏幕上应能认出 `day one.log` 和 `day-two.log`。创建时的 `-C logs` 让 tar 先切到 logs 取材，于是成员名从这层开始。创建用 `c`，列目录用 `t`，解开用 `x`，`f` 后面跟归档路径。gzip 再把这个字节流压缩到新文件，`-c` 让原 tar 留下。小样本里，压缩头等开销也会占空间，不用以“文件一定更小”作为验收。常见的 `tar -czf` 直接把这两步连起来，`-xzf` 则在展开前先解压。对初次收到的归档，先列成员，在新的空目录里展开，可以观察它自带的层级，同名文件也不会盖住其他工作稿。

练习一次缺件：另外生成 `out/delivery/one.tar.gz`，照上面的命令用 `tar -czf` 只收第一天的文件。先猜 `gzip -t` 能不能替你发现它少了一天，然后用 `tar -tzf out/delivery/one.tar.gz` 看名单。压缩流可以完全健康，交付仍旧缺件。反过来，在同一个目录看到两个正确的文件名，也还没比过文件内容。最后两条 cmp 分别核对了两个成员的字节。

### 为收到的副本复算摘要

Mac 可以从练习根目录运行下面第一行。在常见 GNU/Linux 上改用 `sha256sum out/delivery/logs.tar.gz`。两者都把 SHA-256 摘要列在文件名前面。先让接收端拿到完全相同的包，再看两个摘要列。

```sh
shasum -a 256 out/delivery/logs.tar.gz
cp out/delivery/logs.tar.gz out/delivery/received.tar.gz
shasum -a 256 out/delivery/received.tar.gz
```

同一份字节换了外部文件名，前面的 64 个十六进制字符相同。把归档成员换个顺序重新制包，再比较新旧包的摘要：包字节会变，解开后的每个日志仍然可以各自通过 cmp。现在你可以跟对方约定到底验哪一个对象。发件时把原摘要另行记录，收件时独立复算；如果接收者只有包和同一路径传来的摘要，单靠二者相符还推不出发件人身份。

要在图形文件管理器中也能直接展开交付，可以在工具已安装时试 `(cd logs && zip ../out/delivery/logs.zip 'day one.log' day-two.log)`，用 `unzip -l out/delivery/logs.zip` 列成员，再在 Finder 双击这份新包。用文件树检查展开位置和两份文件名，再选一个成员与原稿做字节比较。同一个交付目标换了容器格式，你仍然能分开检查名字、成员和传输字节。

## 1.11 进程、作业与信号

开发服务器一启动，终端就一直占着。再开一个窗口还能做事，关掉原来的窗口却可能把服务器也关了。先在 VS Code 的练习终端运行下面一行。它只等待，到时间自己结束。

```bash
sleep 90
```

现在按一次 **Ctrl+C**，提示符回来了。立刻运行 `printf 'status=%s\n' "$?"`。在 Bash 中通常看到 130。再运行 `sleep 1`，等提示符自然回来，原样查一次，这次是 0。两次都没有业务输出，Shell 却知道程序怎样结束。在交互终端中，Ctrl+C 通常向前台进程组发送 INT 信号。一条管道的几个进程可以同在这个组里。程序能处理这个信号，因此请以实际退出状态为准。

### 谁还在跑，谁能等到它结束

这回让同一个终端既能接着输命令，又能知道等待何时结束。整块执行，约三秒后看最后一行。

```bash
sleep 3 &
worker=$!
jobs -l
ps -p "$worker" -o pid=,ppid=,comm=
wait "$worker"
printf 'wait=%s\n' "$?"
```

末尾的 `&` 让 Shell 启动后台工作便交还提示符。`$!` 给出刚启动的后台任务的进程号，这里就是 sleep 的 PID。立即保存它，以后再启动后台任务，这个特殊参数就会换值。`jobs -l` 可能写成 `[1]+ 12345 Running ...`，其中 1 是**这个 Shell** 给作业起的编号，12345 才是操作系统的进程号。实际编号以屏幕为准。`ps` 按 PID 查一行，三列依次是它自己、启动它的父进程和程序名。最后的 `wait=0` 表示当前 Shell 等到了这个子任务正常结束。

把第一行换成 `(sleep 1; exit 6) &`，后面照旧。你会先拿到提示符，最后读到 6。发起成功只说明排进去了。脚本需要“两个下载都完成了才能继续”，就要给两个任务分别保存 PID、逐个 wait 并检查两份状态。另开一个终端可以按 PID 用 ps 查看；新 Shell 没有那份父子关系，用 wait 等同一个 PID 会报它不是自己的子进程。

想亲手看“暂停”和“结束”的差别，在**交互**终端再试一次 `sleep 90`，这次按 **Ctrl+Z**。用 `jobs -l` 找到显示 Stopped 或 Suspended 的那一行。如果作业号为 1，输入 `bg %1` 让它在后台继续，再用 `fg %1` 将它移回前台，按 Ctrl+C 收尾。作业号不同就替换数字。在脚本里通常没有这个交互作业控制环境。把任务放到后台也没有建立重启策略、日志保留或跨终端的服务管理。

### 同一个停止动作，怎样留下可解释的结果

```bash
sleep 90 &
worker=$!
kill -TERM "$worker"
wait "$worker"
printf 'wait=%s\n' "$?"
```

这次只操作自己刚启动的进程。kill 发送指定的信号；它返回成功时请求已送达，进程何时退出由接收方决定。因此这里还有 wait。在 Bash 上，这个 sleep 通常给出 143，即 128 加上 TERM 的信号编号 15。Shell 也可能另外打印一行作业结束通知。要模拟使用者在终端中断，优先用 Ctrl+C；要给后台服务一个正常收尾的机会，通常先发 TERM。KILL 会直接终结进程，应用无法运行收尾代码，写到一半的输出也不会因此变完整。

脚本本身若在制作中间文件，怎样让它无论走正常出口还是中断出口都收好现场？在 VS Code 新建 `out/signal-demo.sh`，保存下列内容。

```sh
#!/bin/sh
scratch=$(mktemp -d) || exit 1
trap 'rmdir "$scratch"' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '临时目录 %s\n' "$scratch"
printf '按回车交付；也可以按 Ctrl+C 中断。\n'
IFS= read -r answer || exit 1
printf '交付完成\n'
```

在当前窗口运行 `sh out/signal-demo.sh`。它会停下来等输入，复制它打印的临时目录，在另一窗口用 `ls -ld` 加上引号包住的实际路径查看；此时目录存在。第一次按回车，从观察窗口再查同一路径。第二次重新启动脚本，复制**新路径**，改按 Ctrl+C，再查新路径。两次目录都会撤下，只有第一轮会打印“交付完成”。先在发起窗口查退出码，再运行其他命令。这里的单引号把收尾动作保留下来，等 EXIT 时才读取变量。INT 和 TERM 的处理器先选择退出状态，随后退出路径调用 EXIT 处理器。rmdir 只会移去空目录；若加入了草稿，应在处理器内明确移去脚本自己创建的那份草稿，再移空目录。断电与 KILL 留下的目录需要另有恢复办法。

| 眼前的事 | 工具和观察位置 |
| --- | --- |
| 想知道一个 PID 是否还存在 | `ps -p "$worker" -o pid=,ppid=,stat=,comm=`。任务已经结束时可能只看到空输出。进程号有再利用的可能，隔天别用昨天抄下的 PID 发信号。 |
| 想连续看 CPU 或内存 | 在 macOS 打开“活动监视器”按进程名筛选；终端可以用 `top`，按 q 退出。瞬时 CPU 低也可能是在等输入。 |
| 想继续后台任务或取回前台 | 在启动它的交互 Shell 用 `jobs`、`bg %编号`、`fg %编号`。以当前作业表为准。 |
| 想在登出后继续一个简单任务 | `nohup` 能使程序忽略挂断信号。自行安排输入和日志，例如 `nohup sleep 2 </dev/null >out/nohup.log 2>&1 &`。仍可在启动窗口用 wait 核对。长期服务另由服务管理器负责。 |
| 想测量一次过程的耗时 | `time sleep 1`。real 接近一秒；user、sys 通常很小。经过的钟表时间与实际消耗的 CPU 时间可以差很多。 |

## 1.12 网络、服务与远程传输

浏览器显示“打不开”时，至少有两种值得分开的情况。地址上的程序接到了请求，只是找不到资源；或者那个地址根本没有程序接电话。你可以自己制造这两种情况，用同一个客户端观察差别。

### 在自己电脑上制造一个 200、一个 404 和一次拒绝连接

打开 VS Code 的两个终端。都从本章练习目录开始。下面只需本机的 curl 与一个静态文件服务器；先用 `command -v curl`、`command -v python3` 查看。本段示范使用 Python 3.7 或更新版自带的静态服务器，无须写 Python 或装项目依赖。已经有本地静态服务工具的读者也可以让它仅监听回环地址并以同一个目录为根，使用它实际显示的端口。

在窗口 A 新建一个专门用于发送的子目录，只放一份公开练习文本。这里的 0 让系统选当前空闲端口。

```bash
mkdir -p out/http-demo
printf 'ready\n' > out/http-demo/ready.txt
python3 -m http.server 0 --bind 127.0.0.1 --directory out/http-demo
```

等窗口 A 打印 `Serving HTTP on 127.0.0.1 port ...`。在窗口 B 运行下一段；在提示下输入那行中的**实际端口数字**并按回车。随后在浏览器打开终端打印的完整地址。页面应只有 ready 一行。回看 A，一次 GET 留下路径和状态。个别浏览器还会额外请求网站图标。

```bash
printf '窗口 A 显示的端口：'
IFS= read -r port
```

输完数字，等窗口 B 的提示符回来，再用刚存下的端口拼出地址。

```bash
base="http://127.0.0.1:$port"
printf '%s/ready.txt\n' "$base"
```

现在让 curl 记录三种不同的东西。先执行第一行，再打开 VS Code 中的 `out/body.txt`。注意屏幕和文件各自留下了什么。

```bash
curl --noproxy '*' -sS -o out/body.txt -w 'HTTP %{http_code}\n' "$base/ready.txt"
printf 'curl=%s\n' "$?"
cat out/body.txt
curl --noproxy '*' -sS -o out/body.txt -w 'HTTP %{http_code}\n' "$base/missing.txt"
printf 'curl=%s\n' "$?"
head -n 3 out/body.txt
```

第一轮应是 HTTP 200、curl=0、正文 ready。第二轮应是 HTTP 404、curl=0，文件变成服务器给出的错误页面。curl 成功拿到了 HTTP 回应，它默认把这次传输当作成功。这里 `-sS` 合起两个短选项，关闭进度条同时保留诊断；`-o` 选正文去处，`-w` 在传输结束后打印状态；`--noproxy '*'` 让本机练习绕开可能配置的代理。引号将星号原样交给 curl。

如果脚本要在“只接受有效资源”这个条件下继续，保留这次请求，仅增加 `-f`。它遇到这里的 404 会使 curl 以 22 退出。系统是否正在监听，则是另一层问题。仍让窗口 A 开着，在 B 任选适用于本机的行：

```bash
curl --noproxy '*' -fsS -o /dev/null -w 'HTTP %{http_code}\n' "$base/missing.txt"
printf 'curl=%s\n' "$?"
```

| 从哪里看 | 操作 | 能解释的现象 |
| --- | --- | --- |
| macOS 监听套接字 | `lsof -nP -iTCP:"$port" -sTCP:LISTEN` | 看 COMMAND、PID 和 NAME。应有一行带实际的回环地址和端口。 |
| Linux 监听套接字 | `ss -ltn` | 看 Local Address:Port 列，找到这次端口。加 `-p` 在权限允许时可显示所属进程。 |
| HTTP 响应 | `curl --noproxy '*' -sS -i "$base/ready.txt"` | 首行的协议和状态、响应头、一个空行、正文。换 `-I` 会发 HEAD，只取响应头；有些服务对 HEAD 与 GET 的支持不同。 |

回到 A 按 Ctrl+C，等提示符回来；在 B **保持原来成功的地址不变**，再查一次：

```bash
curl --noproxy '*' -sS --connect-timeout 2 -o /dev/null -w 'HTTP %{http_code}\n' "$base/ready.txt"
printf 'curl=%s\n' "$?"
```

如果端口已释放且没有其他程序接手，你会看到连接失败的诊断、HTTP 000 和 curl=7。000 是 curl 没收到 HTTP 状态时显示的数值。服务端没有机会返回 404。自己把服务开回来再试一下；如果拿到了新端口，得重新给 B 的 base 赋值。这一处也解释了为什么用昨天书签里的端口可能会误判程序没启动。

### 真正的地址比回环地址多了哪些步骤

将上面的地址拆开：`http` 决定协议，`127.0.0.1` 是本机回环地址，冒号后是端口，最后才有资源路径。换成团队提供的 HTTPS 域名后，客户端还需要把名称解析为地址、建立连接、协商 TLS；在浏览器开发者工具的 Network 面板可选中请求，查看 Headers 与 Timing。Shell 中对自己有权访问的地址运行 `curl -v` 可以看到连接尝试与握手进度，诊断在标准错误，详细记录中可能包含自己设置的认证头。不同失败处要换不同的观察手段。

| 要核对的事实 | 可尝试的命令 | 怎样解读 |
| --- | --- | --- |
| 域名的 DNS 回答 | `dig example.com A`，或 `nslookup example.com`（需要对应工具及联网） | 看应答地址与查询类型，AAAA 用于 IPv6。系统还可能经 hosts、缓存、VPN 等路径解析，DNS 工具与应用看见的结果可能不同。 |
| 有地址，能否到 HTTP 层 | 对团队提供的 URL 用 `curl -sS --connect-timeout 3 --max-time 8 -o /dev/null -w '%{http_code}\n' "$url"` | 连接阶段有上限，整个过程也有上限。取得 HTTP 状态之后，才轮得到检查路径、方法和服务器返回的内容。 |
| 是否被重定向 | 先用 curl 的 `-i` 看 3xx 与 Location，再按需要加 `-L` 跟随 | 跳转目标可以换域名，跟随后看到的是最终响应。 |
| 对端是否回答探测包 | `ping -c 2 127.0.0.1` | 成功只说明该地址回答 ICMP。HTTP 服务停掉后，本机仍可能回答 ping；另一台主机也可能屏蔽 ICMP 而网站正常。 |

### 当另一端是自己的开发机

同一份文件名在两台机器上都成立，如何知道正在改哪边？下面是**有受管开发机时**的选做。需要管理员提供登录名、主机名、主机公钥指纹、访问方式和可写的 incoming 目录。以下表格中的 USER、HOST、PORT 都要换成自己的值。没有远端账号，前面的 HTTP 实验已经可以独立完成。

| 任务 | 写法 | 先观察哪里 |
| --- | --- | --- |
| 开一个远端终端 | `ssh -p PORT USER@HOST` | 首次连接按管理员独立提供的指纹核验主机身份。进远端后用 `hostname`、`pwd` 看机器和目录，用 `exit` 退回。 |
| 保持在本机，只请远端执行一条命令 | `ssh -p PORT USER@HOST 'pwd; ls -ld incoming'` | 单引号使分号由远端 Shell 解释。观察远端的工作目录及目标目录是否存在。 |
| 复制本地练习文本到远端新名字 | `scp -P PORT out/http-demo/ready.txt USER@HOST:incoming/shell-ready.txt` | 挑选未使用的目标名字；同名目标可能被覆盖。scp 的端口选项是大写 P。调换源与目标即可取回到一个新的本地名字，再用 cmp 比较。 |
| 预看目录同步会传什么 | `rsync -avni -e 'ssh -p PORT' out/http-demo/ USER@HOST:incoming/` | `-n` 试跑，`-i` 列出变化，`-a` 按归档模式处理，`-v` 展示过程。源路径末尾的斜线表示传目录内容。确认后移去 n 才会写远端，两端都需要 rsync。 |

在本机也能验证最后一行最容易弄混的地方。创建 `out/receive`，运行 `rsync -avni out/http-demo/ out/receive/`，看看清单是否有 ready.txt；去掉源末尾斜线再试，清单中的相对路径会多出 http-demo 这一层。两次均保留 n，打开接收目录检查，它仍为空。这个对照不需要账号，也没有远程副作用。

## 1.13 脚本调试、异常与可移植性

你接到一段同事写的脚本，本意是“文件读到了才能宣布完成”。在 VS Code 保存为 `out/report-check.sh`：

```sh
#!/bin/sh
input=$1
grep -c '^404 ' "$input"
printf '检查完成\n'
```

在练习目录用两次输入运行，先猜最后打印的状态：

```bash
sh -n out/report-check.sh
sh out/report-check.sh 'logs/day one.log'
printf '脚本状态=%s\n' "$?"
sh out/report-check.sh 'logs/absent.log'
printf '脚本状态=%s\n' "$?"
```

第一次能找到一条 404。第二次会在诊断后看到“检查完成”，脚本状态仍是 0。这次可以顺着三个问题定位。结构读得通吗？`sh -n` 只解析脚本，能发现少写 fi 或引号未闭合，不会真的去找日志。参数送对了吗？运行 `sh -x out/report-check.sh 'logs/day one.log'`，观察展开后的命令；单个参数可以含空格，具体显示引号的方式取决于解释器。哪一条命令决定了脚本状态？Shell 默认以最后执行的命令状态退出，而两次 printf 都成功。

在诊断另存到文件时，`sh -x out/report-check.sh 'logs/day one.log' 2>out/trace.txt` 会把跟踪和程序自身的标准错误一起收进文件。拿合成数据练习；跟踪会打印展开后的参数，包括当时传入的真实令牌。另一个工具是 `set -x`、`set +x`，分别放在可疑段的前后，只追那一段。

### 先听懂命令自己的状态约定

再试一份确实存在的文件 `logs/day-two.log`。它没有 404，但你仍希望能宣布“查完，零条”。让脚本自己观察这三条路径：查到，查完没找到，检查根本没做完。将编辑器中脚本替换成下面的版本。

```sh
#!/bin/sh
if [ "$#" -ne 1 ]; then
    printf '用法：sh report-check.sh 日志路径\n' >&2
    exit 2
fi
if count=$(grep -c '^404 ' < "$1"); then
    printf '检查完成，匹配 %s 行\n' "$count"
else
    result=$?
    if [ "$result" -eq 1 ] && [ "$count" = 0 ]; then
        printf '检查完成，匹配 0 行\n'
    else
        printf '未取得完整计数：%s\n' "$1" >&2
        exit 2
    fi
fi
```

按一天、二天、缺件、无参数分别运行；期望依次是“1 行／0”“0 行／0”“诊断／2”“用法／2”，斜线后是脚本状态。为什么还看 count？`grep -c` 对已读完的单份输入会写出行数，零匹配也打印 0 并以 1 退出。但上面用的是 Shell 输入重定向，Shell 打不开文件时 grep 根本没有启动；某些解释器同样给出 1，count 里却没有那个 0。也可以改成 `grep -c ... 文件名` 让 grep 自己开文件；此时要考虑以连字符开头的名字可能被当作选项。改变谁负责打开文件，失败路径也会变。把状态立即存入 result；若先打印一句提示再取 `$?`，拿到的就是打印动作的状态。

### 一次只打开一个选项

常见脚本开头有 `set -euo pipefail`。与其把这串字当作“处理了所有异常”，可以在一次性的 Bash 里逐个打开开关。下面每行都启动新的解释器，因此试错不会关掉当前终端。

```bash
bash -c 'false; printf "到末尾了\n"'
bash -ec 'false; printf "到末尾了\n"'
printf '第二次退出=%s\n' "$?"
bash -ec 'if false; then echo yes; else echo no; fi; echo end'
bash -ec 'false && echo yes; echo end'
bash -c 'false | cat; printf "pipeline=%s\n" "$?"'
bash -c 'set -o pipefail; false | cat; printf "pipeline=%s\n" "$?"'
bash -uc 'unset label; printf "%s\n" "$label"'
bash -uc 'unset label; printf "%s\n" "${label:-未命名}"'
```

第一、二行只差 e。前者继续，后者遇到独立的 false 就退出，状态 1。if 的条件和 `&&` 左边本来就用失败表达选择；两次加 e 的例子仍能打印 end。函数作为 if 的条件执行时，Bash 对函数体内的 errexit 行为也受这个调用位置影响。需要保证停止的步骤，可在该步骤旁写清楚失败如何 return 或 exit。

两条管道的最后一个程序 cat 都顺利读完了空输入。默认取最后一段的状态，得到 0。打开 pipefail 后，Bash 取管道中位置最靠右的非零状态，全成功才取零，这次得到 1。对于“只读到第一行就够”的消费者，上游可能因写向已关闭的管道收到 SIGPIPE。打开 pipefail 后，这种有意提前结束也值得按任务含义判断。需要在 Bash 看每一段时，将 `false | cat` 作为单独一行，**下一条**执行 `printf '<%s>\n' "${PIPESTATUS[@]}"`，会得到 <1> 和 <0>。Zsh 对应数组名是 pipestatus。

最后两行观察 u。引用未设置变量会触发错误，提供默认值后能显示“未命名”。一个已设置成空串的变量本身可以在 u 下读取；要求非空是另一项输入约束，需要显式检查。对于确实允许零参数的脚本，先看参数个数或用 `${1-}`，才能解释自己的用法。

### 同一个终端里，究竟是哪种 Shell 在读脚本

在一个 Bash 窗口里分别运行下面三行，观察打印出的解释器版本和交互标志：

```bash
printf '当前 flags=%s\n' "$-"
bash -c 'printf "子进程 bash=%s flags=%s\n" "$BASH_VERSION" "$-"'
sh -c 'case $- in *i*) echo 交互;; *) echo 非交互;; esac'
```

当前窗口以交互方式运行时，第一行的标志中含 i；`bash -c` 按字符串执行命令，默认不带 i。打开一个新窗口可能加载了别名、函数或路径设置，定时任务或脚本进程则有自己的启动方式。`$SHELL` 往往保存账号的登录 Shell 路径，不能据此判断正在解释一份脚本的是谁。观察调用方式更直接：

| 怎样调用 | 哪一方解释 | 迁移时先核对 |
| --- | --- | --- |
| `sh out/report-check.sh 文件` | 系统提供的 sh | 选择了 sh 语言接口。用 `[ ... ]`、`case`、`$(...)`、`name() { ...; }` 等公共写法。不同系统的 sh 实现可以不同。 |
| `bash 文件`、`zsh 文件` | 明确点名的程序 | 解释器按自身规则解析。这种调用通常不要求脚本有执行位，文件第一行不能把这次调用转交给另一种 Shell。 |
| `./out/report-check.sh 文件` | 在具备执行权限的这个文件上，系统按开头的 `#!` 找解释器 | 先 `chmod u+x out/report-check.sh`。若编辑器将脚本存成 CRLF，解释器路径末尾可能混入回车，从而出现“文件在却无法启动”。可在 VS Code 状态栏改成 LF 后保存。 |
| `. ./某个脚本` | 当前 Shell 直接执行文件中的命令 | 其中的 cd、变量、函数、选项会影响当前环境；里面的 exit 也可能把当前 Shell 关掉。只对专门设计为加载的文件使用。 |

还有两个常见的跨机器变化各属于哪一边？`items=(a b)` 是 Bash、Zsh 有的数组语法，sh 脚本应换用位置参数或逐行输入；数组下标与未加引号的变量展开在 Bash、默认 Zsh 之间也有差异。`sed -i` 参数、`date` 的日期偏移选项以及 `stat` 的输出模板，则来自外部工具，换解释器通常不会换掉这些程序。需要既在 Mac 又在 Linux 上工作时，先确认调用的是哪个解释器，再在目标系统用 `command -v 工具`、`man 工具` 核对工具实现。GNU Bash 的详细规则可在官方手册查到，跨 sh 的语法可按 Shell Command Language 查证。[Bash 手册](https://www.gnu.org/software/bash/manual/bash.html) · [POSIX Shell Command Language](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html)

给自己一个新任务：把检查目标改成 503，并要求脚本有两个参数“状态码、日志路径”。先用纸笔预测这两天的结果，再到 VS Code 改脚本；故意传缺件、少传一个参数、给出含空格的文件名。把脚本交给另一个终端，用 `sh` 调用一次，再按可执行文件调用一次。如果两次交付结果不同，先用命令行中点名的解释器、文件首行、当前工作目录和跟踪展开的实参这四个证据排查。

## 1.14 读懂 Bash 和 Zsh 的扩展语法

在项目里看到 `<(…)`、`((…))`、`[[ … =~ … ]]` 时，前面学过的命令、参数、数据流仍然管用。先看脚本首行或启动它的命令。下面都先在 **Bash** 实验，另注明 Zsh 行为。想比较两个解释器，用 `bash -c '…'` 和 `zsh -f -c '…'` 各执行一次；`-f` 让 Zsh 跳过通常的用户启动配置。遇到直接用 `/bin/sh` 运行的项目，要根据目标系统选择公共写法。

### 花括号、文件名和字符串分别从哪里产生

```bash
printf '<%s>\n' logs/day-{one,two}.log
printf '<%s>\n' logs/day*.log
printf '<%s>\n' 'logs/day-{one,two}.log'
```

第一条印出 `logs/day-one.log` 与 `logs/day-two.log`，哪怕第一份根本不存在；第二条从磁盘匹配，第一份中间真的有空格；第三条只印出包含花括号的原文。Bash 的**花括号展开**可从固定拼写生成一组词，如 `v{1..3}`；文件名展开到后面才发生。试 `last=3; printf '%s\n' {1..$last}`，在 Bash 中只见字面 `{1..3}`。Shell 做花括号展开时还没有把变量换成 3。运行时才知道次数，用普通计数循环。

现在造一组有意匹配不到的路径，在隔离的一对括号里比较 Bash 的选项：

```bash
( set -- logs/*.never; printf '默认：%s 项，第一个 <%s>\n' "$#" "${1-}" )
( shopt -s nullglob; set -- logs/*.never; printf 'nullglob：%s 项\n' "$#" )
```

结果分别为 1 和 0。第一组若把清单交给归档程序，会尝试打开一个带星号的文件；第二组收到空清单，需要自己判断零份输入该做什么。Bash 用 `shopt -s` 打开这类选项、`shopt -u` 关闭；Zsh 的原生默认对无匹配报告错误。还会见到 `dotglob`（Bash 允许一般模式匹配点文件）、`globstar`（支持它的 Bash 开启后可用 `**` 递归）。只想跨系统从某个目录往下选普通文件，1.8 的 `find` 已经能表达这件事。

### 模式、正则、算术，各自在比较什么

```bash
route_path='/item/404'
[[ $route_path == /item/* ]] && printf '属于 item 路径\n'
[[ $route_path == '/item/*' ]] || printf '路径没有字面星号\n'
line='404 GET /icon'
re='^([0-9]{3})[[:space:]]+([^[:space:]]+)[[:space:]]+(.+)$'
if [[ $line =~ $re ]]; then
  printf '状态 <%s>，方法 <%s>，路径 <%s>\n' "${BASH_REMATCH[1]}" "${BASH_REMATCH[2]}" "${BASH_REMATCH[3]}"
fi
```

前两句只差一对引号，第一句右边的星号能匹配后缀，第二句要求真的有一个 `*`。第三次要同时取三段文字，换成 `=~` 的扩展正则，圆括号把匹配分组。正则先存入变量，匹配处留作模式，匹配成功后可按编号读回捕获组。在原生 Zsh，整体匹配通常在 `$MATCH`，捕获组在 `$match` 数组中；跨 Shell 的报表可以用前面写过的 `awk` 明确取字段。`[[ … ]]` 是解释器识别的复合命令，里面的一般变量引用不会因内含空格拆成额外参数；`[ … ]` 按前面学过的命令参数规则解析。照搬时要连同语法环境一起看。

```bash
n=0
((n++)); printf '运算状态 %s，现在 n=%s\n' "$?" "$n"
for ((i=1; i<=3; i++)); do printf '第 %d 次\n' "$i"; done
```

`((n++))` 确实把 n 改成 1，却返回非零，因为表达式取的是递增前的 0。算术命令用非零**数值**表示条件成立并返回 0 **状态**。所以把它放在启用了 `set -e` 的脚本中可能第一圈就退出。`$((…))` 则把算出的数值放进另一个词，如 `n=$((n + 1))`。数着走的 `for ((…;…;…))` 把初始化、继续条件、每轮更新写在一起；公用 sh 脚本可用 `while [ "$i" -le 3 ]` 并显式更新。

### 两个命令都要文件名时，能不能直接比较两段输出

```bash
printf '%s\n' /home /api | sort > out/expected.paths
awk '{print $3}' logs/day-two.log | sort > out/actual.paths
diff out/expected.paths out/actual.paths
diff <(printf '%s\n' /home /api | sort) <(awk '{print $3}' logs/day-two.log | sort)
```

前一种做法可以点开两个文件看明细；后一种的两个 `<(…)` 各给 `diff` 一个读取端的路径，命令在另一端生产内容。这叫**进程替换**。`$()` 会收集输出文字并删去尾部换行，两种括号交给调用者的东西不同。把上例的 `/api` 改成 `/absent`，两条 `diff` 都能展示地址差异。若把内层生产命令改成根本打不开的文件，`diff` 的状态只说明两端字节比较的结果，不能代替两位生产者的状态。要决定是否正式发布，先各自确认生成成功，再比较落地文件。

### 手上脚本还有哪些常见缩写

| 在哪里见到 | 用一个小输入拆开它 | 运行范围或结果 |
| --- | --- | --- |
| 文本替换 `${v/pat/new}`、`${v//pat/new}` | `v=api/api; printf '%s\n' "${v/api/web}" "${v//api/web}"` | Bash 分别输出 `web/api`、`web/web`。模式可带通配符。截子串如 `${v:0:3}` 得 `api`。 |
| `$'…'` 表示带转义的字符串 | `printf '<%s>\n' $'A\tB'` | A 和 B 中间出现一个 Tab；普通 `'A\tB'` 原样保留反斜杠。Bash、Zsh 支持；兼顾较早 sh 可用 `printf 'A\tB\n'`。 |
| 用名字作键 | `bash -c 'declare -A n; n[api]=2; printf "%s\n" "${n[api]}"'` | 需要 Bash 4+；先选解释器。Zsh 用 `typeset -A n`；只为按列统计时，awk 的关联数组已够用。 |
| 从菜单选择 `select` | 在 Bash 输入 `select mode in preview quit; do printf '<%s>\n' "$mode"; break; done` | 输入 `1` 打印 `preview`，输入列表外序号会得到空值；`REPLY` 可读原输入。无人值守时宜把选择显式写成选项。 |
| `time` 和 `!` 放在命令前面 | `time sleep 1`；`! test -e logs/no-such.log; printf '%s\n' "$?"` | 前者量整次运行，后者反转状态，得到 0。`!` 后面有空格。 |
| `alias`、函数和外部命令同名 | 在子 Shell 试 `( ls() { printf '自定义\n'; }; ls; command ls logs )` | 前一个 ls 打出标记，后一个跳过函数查实际命令。Bash 的 `builtin printf` 则明确调用内建实现。 |
| 一个命令要读固定文本，又要写到另一程序的输入 | Bash 的 `>(命令)` 产生可写路径，与 `<(命令)` 相对 | 涉及多个异步消费者时还要安排等待、诊断与状态收集。常规的一对一交接先用普通管道。 |

遇到更多写法按解释器直接查相应章节。POSIX Shell Command Language 把词、展开、重定向和复合命令放在一起；Bash 手册可按 Shell Expansions、Shell Commands、Bash Builtins 找具体语法；Zsh 手册的 Expansion、Parameters 和 Options 能查它自己的规则。[POSIX Shell Command Language](https://pubs.opengroup.org/onlinepubs/9799919799/utilities/V3_chap02.html) · [GNU Bash 手册](https://www.gnu.org/software/bash/manual/bash.html) · [Zsh 手册](https://zsh.sourceforge.io/Doc/Release/)

## 1.15 独立练习：写一个可重复运行的交付脚本

换一个跟日志状态码无关的需求。前端要发一份**静态资源大小清单**给同事，接收方需要知道每个文件的字节数和原来的相对路径。传入顺序由调用者定，可以含空格。输入齐全时替换 `out/assets.tsv`；没有给文件、或任意一个文件打不开时，给操作者诊断并保留上次成功的清单。在练习目录运行：

```sh
mkdir -p assets out
printf 'OK\n' > 'assets/home page.txt'
printf 'ABCDE' > assets/app.txt
```

两个文件在编辑器里都能看，前一个带换行应为 **3** 字节，后一个没有换行应为 **5**。这就是第一份手算答案。在编辑器新建 `asset-list.sh`。先让它能按原顺序逐一打印路径，把一个路径改成两个、含空格时也必须成立；再加按字节计数。最后才解决“第二个输入丢了，昨天的清单怎么办”。先只用前面学过的工具写一版，再展开对照实现。

<details>
<summary>对照一种实现，看看发布动作放在哪一步</summary>

```sh
#!/bin/sh
if [ "$#" -eq 0 ]; then
  printf '用法：sh asset-list.sh 文件…\n' >&2
  exit 2
fi
tmp=$(mktemp out/.assets.XXXXXX) || exit 1
trap 'rm -f "$tmp"' EXIT
trap 'exit 1' HUP INT TERM
for file do
  if [ ! -f "$file" ]; then
    printf '找不到普通文件 <%s>\n' "$file" >&2
    exit 1
  fi
  bytes=$(wc -c < "$file") || exit 1
  printf '%d\t%s\n' "$bytes" "$file" >> "$tmp" || exit 1
done
mv -f "$tmp" out/assets.tsv || exit 1
```

临时文件放在 `out`，每次运行各有自己的文件名。失败时退出触发清理；同一目录内用 `mv` 将写完整的文件改到固定名字，读者在发布前后分别看旧版或新版。若两次都成功，最后一次改名的结果留下。临时文件和目标同在一个文件系统是这个改名性质的前提。本次清单约定路径可含空格，但不含 Tab 或换行；后两者本身就是 TSV 的分隔符，若接收方允许那样的路径，需要另定双方都能解码的格式。`mktemp` 使用本章目标 Mac 和 Linux 上都有的模板形式。

</details>

用下面几次调用验自己的版本。第一次打开 `out/assets.tsv` 应看到两行，先 3 后 5；第二次故意在中间加一个缺件，若此时清单只剩第一行，检查你在哪一步打开了正式文件；第三次两份都存在但顺序调换，清单也要随之变。最后不传参数时状态应是 2，上一份清单仍可读。

```sh
sh asset-list.sh 'assets/home page.txt' assets/app.txt
sh asset-list.sh assets/app.txt assets/absent 'assets/home page.txt'
printf '缺件状态=%s\n' "$?"
cat out/assets.tsv
sh asset-list.sh assets/app.txt 'assets/home page.txt'
sh asset-list.sh
printf '缺参数状态=%s\n' "$?"
cat out/assets.tsv
```

再给自己一道改稿：设计一个 `-n` 预览选项，把将要发布的各行送往终端。拿同一份正式清单做前后 `cmp`，预览成功、预览中途缺件都不该改动它。换成存在但大小为零的文件，预览中应有一行 0。自己解释：这里能接受空**文件**，为什么还是拒绝空**参数名单**？接到项目里时，再把手算的 3 和 5 换成你要发给同事的两件实际资源。

## 附录：本章必要技术点速查

### 读命令时卡在一个符号

| 看到的写法 | 先问自己哪件事 | 回看 |
| --- | --- | --- |
| `cmd -n 2 -- file`、`./cmd`、`command -v` | 哪个词是程序名，哪个选项要占下一个参数，哪个名字走 PATH？ | §[1.2](#12-命令选项路径与帮助)、§[1.6](#16-函数脚本入口与选项解析) |
| `# 注释`、行尾 `\`、`;`、换行 | 未引用的 `#` 在可开始一个词的位置引入注释；`printf '%s\n' a#b` 中的 `#` 属于那个词。行尾反斜杠续行；分号与未被引用的普通命令换行可以结束一条命令。 | §[1.1](#11-终端shell-与第一份练习目录)～[1.3](#13-引号通配符与参数展开) |
| `'…'`、`"…"`、`\`、`*`、`?`、`[…]` | 字符会原样到程序手里，还是先按变量或文件名展开？ | §[1.3](#13-引号通配符与参数展开) |
| `$v`、`${v:-x}`、`${v#p}`、`${v%p}` | 未设置、空串和实值分别应该交什么？去掉的是前缀还是后缀？ | §[1.4](#14-变量环境与计算) |
| `$(cmd)`、`$((n+1))`、`<(cmd)` | 接收者拿到输出文字、整数结果，还是可供读取的路径？ | §[1.4](#14-变量环境与计算)、§[1.14](#114-读懂-bash-和-zsh-的扩展语法) |
| `$0`、`$1`、`${10}`、`$#`、`"$@"`、`"$*"` | 谁启动了我？给了几项？带空格和空字符串的项转手后还在吗？ | §[1.3](#13-引号通配符与参数展开)、§[1.6](#16-函数脚本入口与选项解析) |
| `$?`、`$!`、`$$`、`$-` | 刚结束的状态、最近后台任务 PID、Shell 的进程号、启用的选项字母。用 `sh -c 'printf "%s %s\n" "$$" "$-"'` 启动独立解释器观察。 | §[1.7](#17-标准输入输出重定向管道与退出状态)、§[1.11](#111-进程作业与信号)、§[1.13](#113-脚本调试异常与可移植性) |
| `if`、`elif`、`else`、`fi`、`case`、`esac`、`;;` | 判断的是命令状态还是字符串模式？缺文件与无匹配是否需要分两路？ | §[1.5](#15-条件分支与循环) |
| `for`、`while`、`until`、`do`、`done`、`break`、`continue` | 循环消耗一项参数还是一行输入？跳到下轮或提前结束后，外面还做什么？ | §[1.5](#15-条件分支与循环) |
| `f() { …; }`、`return`、`exit`、`.`、`exec` | 结束的是函数还是整个解释器？文件中的赋值和目录变化会留在哪里？ | §[1.6](#16-函数脚本入口与选项解析)～[1.7](#17-标准输入输出重定向管道与退出状态) |
| `cmd1 && cmd2`、`cmd1 \|\| cmd2`、`!`、`cmd1 \| cmd2` | 下一条按状态决定是否运行，还是两条程序通过数据通道相连？ | §[1.5](#15-条件分支与循环)、§[1.7](#17-标准输入输出重定向管道与退出状态) |
| `<`、`>`、`>>`、`2>`、`2>&1`、`<<'END'`、`<&3` | 谁打开文件？何时截短？诊断接到了哪里？ | §[1.7](#17-标准输入输出重定向管道与退出状态) |
| `( … )`、`{ …; }`、`&`、`wait`、`trap` | 目录和变量的改动留在哪？什么时候能拿到实际完成状态？ | §[1.4](#14-变量环境与计算)、§[1.7](#17-标准输入输出重定向管道与退出状态)、§[1.11](#111-进程作业与信号) |
| `[[ … ]]`、`=~`、`((…))`、`files=(…)`、`<<<` | 谁负责解释这一层？工作机的 Bash、Zsh、sh 是否接受？ | §[1.6](#16-函数脚本入口与选项解析)～[1.7](#17-标准输入输出重定向管道与退出状态)、§[1.13](#113-脚本调试异常与可移植性)～[1.14](#114-读懂-bash-和-zsh-的扩展语法) |

### 按手上的工作找命令

| 想做的事 | 可以从哪些命令下手 | 第一个观察点 |
| --- | --- | --- |
| 定位、换目录、查名字 | `pwd`、`cd`、`ls`、`find`、`basename`、`dirname` | 搜索起点究竟是哪层目录，点文件是否算入。§[1.2](#12-命令选项路径与帮助)、§[1.8](#18-文件目录权限与磁盘) |
| 查看命令来源与帮助 | `type`、`command -v`、`man`、Bash 的 `help`、`alias`、`unalias`、`history` | 眼前运行的是内建、函数还是外部程序。§[1.2](#12-命令选项路径与帮助) |
| 新建、复制、搬移、删除 | `mkdir`、`touch`、`cp`、`mv`、`rm`、`rmdir`、`mktemp` | 是操作新名字、覆盖旧名字，还是修改原内容。§[1.8](#18-文件目录权限与磁盘)、§[1.11](#111-进程作业与信号) |
| 文件类型、权限与容量 | `ln`、`readlink`、`ls -li`、`file`、`stat`、`chmod`、`umask`、`id`、`du`、`df` | 比较 inode、文件逻辑长度、实际磁盘占用和文件系统余量。§[1.8](#18-文件目录权限与磁盘) |
| 看全文、首尾或持续追加 | `cat`、`less`、`head`、`tail`、`wc`、`tee` | 输入有没有最后的换行，输出是否写入文件。§[1.7](#17-标准输入输出重定向管道与退出状态)、§[1.9](#19-文本查找编辑与报表) |
| 匹配、取字段、改文本 | `grep`、`cut`、`tr`、`sed`、`awk`、`paste` | 匹配的是文件名、行首、整行还是某列；重复空白如何处理。§[1.3](#13-引号通配符与参数展开)、§[1.9](#19-文本查找编辑与报表) |
| 汇总、批量调用 | `sort`、`uniq`、`find -exec`、`xargs` | 相同值是否相邻，名字是独立参数还是尚待拆分的文本。§[1.8](#18-文件目录权限与磁盘)～[1.9](#19-文本查找编辑与报表) |
| 比较、制补丁、封装、验包 | `diff`、`cmp`、`patch`、`tar`、`gzip`、`shasum` 或 `sha256sum` | 差异、损坏、成员缺失、同名字节不同各该查哪一层。§[1.10](#110-比较归档与交付) |
| 读取输入、传变量、控制脚本 | `printf`、`read`、`set`、`shift`、`getopts`、`test`、`export`、`unset`、`readonly`、`env` | 参数边界、标准输入、环境继承以及退出状态。§[1.3](#13-引号通配符与参数展开)～[1.7](#17-标准输入输出重定向管道与退出状态) |
| 核对机器、身份和时间 | `uname`、`hostname`、`whoami`、`id`、`date`、`uptime` | 换到另一台机器或时区后，哪一项应当改变。§[1.8](#18-文件目录权限与磁盘) |
| 观察、暂停、结束、等待 | `ps`、`top`、`jobs`、`fg`、`bg`、`kill`、`sleep`、`wait`、`nohup`、`time` | 当前 Shell 的作业编号与系统 PID 属于不同名单。§[1.11](#111-进程作业与信号) |
| 查服务、查 DNS、传文件 | `curl`、`lsof` 或 `ss`、`dig`、`nslookup`、`ping`、`ssh`、`scp`、`rsync` | 收到 HTTP 错误、本机没监听、DNS 未解析、没连通各有何证据。§[1.12](#112-网络服务与远程传输) |
| 只检查脚本、追踪参数与状态 | `sh -n`、`sh -x`、`set -u`、`set -e`、`set -o pipefail` | 语法、参数、执行和整批交付在不同时刻才能判断。§[1.13](#113-脚本调试异常与可移植性) |

## 本章知识支线

- [1A　交付目录里，两个名字指向的是哪一份文件](side-01-file-identity.md)。从 §[1.8](#18-文件目录权限与磁盘) 的权限和链接继续看打开的句柄、目录搬移与版本回退。
- [1B　一份文本报表怎样做到不重算、不漏算](side-02-text-reports.md)。从 §[1.9](#19-文本查找编辑与报表) 的字段统计继续做迟到更正、重放和零请求区域。
- [1C　终端里成功的任务，换成定时运行为什么会失败](side-03-unattended-job.md)。把 §[1.11](#111-进程作业与信号)～[1.13](#113-脚本调试异常与可移植性) 的环境、进程和退出规则放进无人值守任务。
- [1D　在自己的电脑上打开了页面，交给别人还能打开吗](side-04-portable-archive.md)。用 §[1.10](#110-比较归档与交付) 的归档知识，在另一个目录真正打开完整的页面。
- [1E　从一份请求日志到一次值班交接](side-05-log-handoff.md)。八段连续实战，从编辑器搜索一路做到批量、缺件保留和下一班读回。六张实图可以对照操作位置和结果。

[上一章：保存一句英语之后](../chapter-00-epp/chapter.md) · [下一章：完成第一次 HTTP 往返](../chapter-02-first-http/chapter.md) · [返回第一篇](../README.md) · [返回全书目录](../../README.md)
