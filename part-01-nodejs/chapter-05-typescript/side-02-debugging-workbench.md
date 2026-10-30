# 支线 5B：从“接口不对”到找到出错的那一步

第二章已经用 Chrome 暂停过一次写入。进入 TypeScript 后，问题多了一层：编辑的是 src，执行的是 dist。断点没停下，可能是请求没走到那里，也可能是连错进程、运行旧产物，甚至只是断点对应的代码还没加载。把这些情况都解释成“调试器不好用”，就又会退回到到处加 console.log。

本支线沿第五章的记录服务建立一个可以反复使用的调试工作台：保存一份明确的请求，在对应进程里观察状态，用证据缩小失败范围，再改变输入复验。代码使用 `part-01/chapter-05`，入口仍是 `dist/src/server.js`。后面的 Nest 只是把同一条执行路径拆进不同文件，这套方法可以继续使用。

时间参考（估算）：阅读约 30～38 分钟；配置与操作另加约 30～40 分钟。按约 3800 个汉字、65 行配置与命令，以及三份调试配置、正常／失败请求、两个暂停位置的栈与作用域对照、条件断点与一次旧产物排查估算，不含首次安装编辑器。

## 先明确这次要观察什么

假设调用方说“保存失败了”。先取得这次请求的方法、完整地址、Content-Type、正文与实际响应。这里使用虚构内容，避免一开始就把真实用户原文、Cookie 或令牌复制进工具和共享记录。

先按第五章运行 `npm run dev`，在第二章保存的 Postman 创建请求中，把 raw JSON 改为 `{"originalText":"debug-one"}`，点击 Send，在响应区查看状态、Headers 和 Body。需要终端复现时，对应命令为：

```bash
curl -i http://127.0.0.1:3000/captures \
  -H 'Content-Type: application/json' \
  --data '{"originalText":"debug-one"}'
```

`-i` 把响应头和正文一起显示，正常应有 201、Location 和三个记录字段。没有连接成功与收到 400 是不同事实：前者还没取得应用的 HTTP 答复，后者说明某个服务已经处理了请求。如果连预期端口上是谁都没确定，就先改字段校验，排查方向可能从第一步就错了。

需要核对请求究竟发出了什么时，使用 `curl -v` 查看请求行、头部和连接信息；正文仍以自己明确提供的 `--data` 内容为准。浏览器场景则在 Network 中选中实际失败请求，核对 URL、Headers、Payload 与 Response。页面控制台的报错是调用方的观察，不是后端抛错位置。

这些工具各回答一个问题：HTTP 客户端保留可重现的输入与外部结果；调试器观察进程里的变量和执行位置；日志保存不中断执行时留下的事实。已经能用 curl 重现的字段问题，不必先安装一整套监控平台；只在浏览器中出现的问题，也不能因为 curl 成功就判定已经修复。日常复用第二章保存的 Postman 请求集合；接口契约确定后，再用 Swagger 核对文档与实际响应。

## VS Code 是怎样连到正在执行的代码的

用 VS Code 打开配套代码仓库根目录，先在终端执行 `nvm use`、`node -v`，确认使用项目规定的 Node。Node 的 Inspector 暴露运行时调试能力，VS Code 和第二章使用的 Chrome 是操作它的界面；二者不会把 TypeScript 变成实际执行入口。

现在有两种需要。想从构建、启动到停止都由编辑器管理，使用 launch；已经从终端启动了调试进程，只想连接观察，使用 attach。同一次操作只选择一种，避免启动两个进程争用业务端口。

新增 `.vscode/tasks.json`：

```json
{
  "version": "2.0.0",
  "tasks": [
    {
      "label": "EPP: build",
      "type": "npm",
      "script": "build",
      "problemMatcher": ["$tsc"],
      "group": "build"
    }
  ]
}
```

任务复用项目已有的 build，包括清理产物、编译和复制配置。`problemMatcher` 用来识别 TypeScript 编译诊断；它不负责把失败构建变成可运行程序。启动前如果构建失败，应修复错误，不能选择继续运行旧产物。

再新增 `.vscode/launch.json`：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "EPP: attach to npm run dev",
      "type": "node",
      "request": "attach",
      "address": "127.0.0.1",
      "port": 9229,
      "restart": true,
      "timeout": 30000,
      "sourceMaps": true,
      "outFiles": [
        "${workspaceFolder}/dist/**/*.js"
      ],
      "skipFiles": [
        "<node_internals>/**",
        "${workspaceFolder}/node_modules/**"
      ]
    },
    {
      "name": "EPP: build and launch",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/dist/src/server.js",
      "cwd": "${workspaceFolder}",
      "preLaunchTask": "EPP: build",
      "runtimeArgs": [
        "--enable-source-maps"
      ],
      "sourceMaps": true,
      "outFiles": [
        "${workspaceFolder}/dist/**/*.js"
      ],
      "skipFiles": [
        "<node_internals>/**",
        "${workspaceFolder}/node_modules/**"
      ],
      "console": "integratedTerminal"
    },
    {
      "name": "EPP: attach to npm run debug",
      "type": "node",
      "request": "attach",
      "address": "127.0.0.1",
      "port": 9229,
      "sourceMaps": true,
      "outFiles": [
        "${workspaceFolder}/dist/**/*.js"
      ],
      "skipFiles": [
        "<node_internals>/**",
        "${workspaceFolder}/node_modules/**"
      ]
    }
  ]
}
```

日常学习先在终端运行 `npm run dev`，再在 Run and Debug 选择 `EPP: attach to npm run dev`。在源码中设置断点，发送请求、暂停观察、继续，再修改保存。开发脚本编译后重启进程；restart:true 让 VS Code 尝试连接新的9229目标，原断点继续保留。若长时间类型错误超过连接等待时间，修复后重新执行 attach。编辑器只是连接，不负责自动重发请求；每次重启后的 Map 为空。

先以一条请求确认断点命中，再修改一处启动提示并保存。等新进程监听后重发同一请求，确认断点仍停在当前源码；不要用暂停期间的超时判断接口性能。停止开发时在原终端按 Ctrl+C；断开 attach 不等于停止开发监听。Chrome 可能需要从 chrome://inspect 重新选择新进程。

以下两种方式用于比较产物调试和排查启动过程，它们不自动监听源码。先停止 dev，避免争用业务及调试端口。

先停止正在普通运行的服务，避免争用业务端口。在 Run and Debug 中选择 `EPP: build and launch`，执行 Start Debugging。编辑器先构建再启动 Node，集成终端应出现监听信息。如果提示找不到 node，检查编辑器进程可用的 PATH；终端完成 nvm 切换，并不保证已经打开的编辑器也改变了解释器环境。可先使用下面的终端启动方式，连接那个已经确认版本的进程。

attach 路线是在终端依次运行 `npm run build`、`npm run debug`，再选择 `EPP: attach to npm run debug`。debug 使用 inspect-brk，连接后需要 Continue 才会执行到监听；这个等待不是启动卡死。使用 Chrome 时，沿第二章的 chrome://inspect 连接同一个本机目标即可，不必换另一套业务代码。

3000 是业务请求入口，9229 是 Inspector 入口，HTTP 客户端不能向后者发送记录请求。调试入口允许执行进程中的代码，只绑定本机回环地址，不把它随业务端口公开。结束 attach 后还应回到终端停止自己启动的服务；断开调试连接不等于可靠地结束业务进程。

## 一个断点怎样回答一个具体问题

在 `src/server.ts` 的 `captures.set(capture.id, capture)` 行设置断点，再发送 debug-one 请求。程序暂停在该行执行之前，此时 capture 已生成，但 Map 尚未写入。先在 Variables 或 Scope 中找到 capture，再在 Watch 添加：

```js
capture.originalText
captures.size
captures.has(capture.id)
```

最后一个表达式应为 false。选择 Step Over 执行这一行，再观察同一个表达式，应变为 true。此时响应尚未发出，Postman 仍然等待；Continue 后客户端才能收到 201。这样得到的是“生成、写入、响应”三个时刻的证据，而不只是看到某个对象存在。

Step Over 执行当前语句而不逐层进入所调用的函数；Step Into 用来检查被调用函数；Step Out 返回调用者继续观察。先确定怀疑哪一步，再选择操作。跨越 await 时，执行还会受到 Promise 完成与其他调度的影响，不能把单步当作所有异步工作的全局顺序表。

Call Stack 中选中的活动栈帧决定当前能观察哪些局部变量。这里先不要尝试切到 `readJson` 的 `end` 回调：程序已经越过 `await readJson(request)`，那个回调在兑现 Promise 后已经返回，不是当前调用栈里仍在执行的函数。异步来源记录可能帮助追溯这次等待从哪里发起，但不是所有过去回调及其局部变量的历史快照。

用两个暂停位置把这个区别实际看出来。保留写入行断点，再在 `readJson()` 的 `end` 回调中，找到 `const text = new TextDecoder(...)` 开始的严格解码语句，并在该语句第一行加一个断点。发送新的 debug-one 请求：

1. 首次暂停在合并字节之前。选中当前回调的帧，在 Scope 中查看闭包里的 `chunks` 和 `bytes`；Step Over 后查看局部变量 `text`。此时还没有本次请求的 capture，创建对象的语句尚未执行。先记下当前 Call Stack 中自己的回调位置，再 Continue。
2. 第二次暂停在 `captures.set()`。此时当前活动帧是恢复后的 `handleRequest`，可以读取 `body` 和 `capture`；先前的 `end` 回调已经离开调用栈，不能通过切换栈帧重新检查它当时的 `text`。界面若展示 async／await 来源，可以借它找调用位置，但不要把来源条目当成仍拥有全部局部变量的活动帧。不同调试器能保留的异步来源也可能不同。

这两个断点回答的是同一次请求先后经过的两个边界。若要比较过去与现在的值，应在各自暂停时记录必要信息，或者在对应位置设置日志点；不能期待调用栈保存整条请求历史。继续完成响应后，移除 `end` 回调断点，后面的操作只保留写入行断点。`skipFiles` 让单步优先停在自己的代码中；若证据指向依赖内部，再临时显示或进入对应代码，而不是一开始就在 Node 内部循环单步。

Watch 和 Debug Console 会在目标进程里求值。`captures.has(id)` 是读取，`captures.clear()` 却会真的清空数据；在 Console 调用一次创建函数也会真的产生副作用。调试表达式应尽量只读取状态，不能把求值窗口当成与程序隔离的草稿纸。

## 请求很多时，怎样只停在有关的那一次

把写入行的普通断点改为条件断点，条件为：

```js
capture.originalText === 'debug-one'
```

分别发送原文 debug-other 和 debug-one，前者应正常完成，后者才暂停。条件用的是断点位置已经存在的变量；把它放到 capture 声明之前不会得到同样结果。实际排查可按某个记录 ID 筛选，但不要为了方便把用户原文长期写入日志。

如果只想知道写入前的数量，移除会暂停的断点，在同一行添加 Logpoint：

```text
before insert: size={captures.size}
```

再次发送请求，消息出现在 Debug Console，业务继续运行。日志点适合临时观察，且无需把打印写入源码；它仍有求值和输出成本，也不会自动变成部署后的结构化日志。调完后删除临时日志点与 Watch 表达式，避免下一次调试被旧条件误导。

## 已经被捕获的错误，为什么还值得暂停

发送 `{"originalText":7}`，得到 400。写入断点不命中是正确行为，因为字段检查已经拒绝请求。先在对应的 `throw new HttpError(...)` 行设置断点，确认 body 中的真实类型；继续后应进入请求回调里的 catch，再由 sendJson 返回错误。

若只知道错误结果，却不知道在哪抛出，可在 Breakpoints 面板启用包含已捕获异常的暂停选项。Node 调试器通常以 Caught Exceptions／Uncaught Exceptions 区分；界面文字可能随版本变化，目标是包含随后会被 catch 接住的异常。再次发出失败请求，在暂停处观察异常及自己的第一个相关栈帧，完成后关闭该选项，避免正常处理的异常持续打断其他请求。

只开未捕获异常暂停，往往看不到这次失败：请求边界本来就会捕获它。反过来，暂停到了抛错语句，也不意味着进程会崩溃。必须继续追踪谁接住了它、如何转换结果。把 catch 删除以“方便发现错误”，会同时改变原本要研究的运行行为。

## 断点不命中时，先区分两类问题

假设在创建分支打了断点，却始终不停。先看是否显示为已绑定的断点，再判断请求是否进入那条路径。启动前的空心状态可能只是目标脚本还没加载；运行后仍无法绑定，则需要核对调试目标和源码映射。

| 观察到的事实 | 下一步要核对的证据 |
| --- | --- |
| 目标没有监听日志，刚运行 inspect-brk | 是否仍暂停在启动位置；先 Continue |
| 请求已有响应，但创建断点不命中 | 是否发送了 POST；返回 415／400 是否表明在更早位置被拒绝 |
| 修改源码后仍执行旧逻辑 | 当前进程是否重启，dist 是否由当前源码重新构建 |
| 编译后的 JavaScript 能停，TypeScript 不能停 | .map 是否存在，sources 能否定位到当前源码，outFiles 是否匹配实际 .js |
| 请求到达另一份服务 | 对照监听日志 PID、端口及调试目标；不要只看文件名一样 |

可以做一次可恢复的对照：先停止服务，在已构建后临时修改源码中的启动提示，但不执行 build，直接用 `npm start`。提示仍是旧内容，因为执行的是旧 JavaScript。停止后重新 build，再启动，提示才改变。最后恢复提示文字并再次构建。这个差异解释了为什么“我已经保存文件”不能证明正在调试的进程包含改动。

outFiles 匹配的是编译后的 `.js`，不是 `.ts` 或 `.map`；调试器再从 JavaScript 的 sourceMappingURL 找到映射，映射指向源码位置。`--enable-source-maps` 帮助 Node 输出源码位置的错误栈，编辑器断点绑定还依赖自己的映射读取。这两条路径相关，但不是同一个开关。

暂停整个 JavaScript 执行线程会拖住同一进程里的其他请求，客户端期限仍可能过去。不要拿断点暂停时的延迟判断性能，也不要因客户端超时就重复提交创建请求。结束观察后，先判断原请求是否已写入，再决定后续动作。性能和并发问题需要结合不中断的日志、计时与采样，后面遇到相应负载时再展开。

一次完整排查应留下明确因果：哪份输入、哪个目标进程、在哪个边界看到什么、据此改变了什么，以及同一请求和相邻正常请求是否符合预期。换成 Nest、数据库或后台任务之后，工具会增加，这条证据链仍然成立。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| launch／attach | 启动一个调试目标，或连接已有目标 | 不同时启动两份服务 |
| preLaunchTask | 启动前复用构建任务 | 编译失败不能继续使用旧产物 |
| outFiles／sourceMaps | 从 JavaScript 和映射关联 TypeScript | 匹配 .js；核对目标进程及构建时间 |
| Call Stack／Watch | 观察选定调用位置的变量 | 求值会执行表达式，避免副作用 |
| 条件断点／Logpoint | 限定暂停对象，或不中断地观察值 | 条件中的变量须在当前位置可用 |
| 已捕获异常暂停 | 在错误转换前找到抛出位置 | 暂停不等于进程崩溃，完成后关闭 |
| curl -i／-v | 核对响应及请求连接信息 | 调试输出可能包含敏感头部 |

官方查阅：[VS Code 构建任务](https://code.visualstudio.com/docs/debugtest/tasks)、[VS Code Node 调试](https://code.visualstudio.com/docs/nodejs/nodejs-debugging)、[VS Code 调试操作](https://code.visualstudio.com/docs/debugtest/debugging)、[TypeScript 调试与输出位置](https://code.visualstudio.com/docs/typescript/typescript-debugging)、[Node Inspector 调试](https://nodejs.org/en/learn/getting-started/debugging)、[Chrome 断点](https://developer.chrome.com/docs/devtools/javascript/breakpoints)、[curl 手册](https://curl.se/docs/manpage.html)。

[返回第五章](chapter.md) · [返回第一篇](../README.md)
