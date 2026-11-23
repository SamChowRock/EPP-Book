# 支线 30A：服务已保存，客户端为什么还在等待确认

Postman 收到 201，能够展开完整的 JSON，DBeaver 里也找得到对应修订。把这份响应交给第 30 章配套的客户端校验函数，它却抛出 `Invalid success response`。即便没有丢一个字节，页面状态机仍会保留待办。要决定下一步是恢复原操作还是修正客户端，得先找到这三处观察第一次出现分歧的位置。

阅读约 20～25 分钟，跟做另加 25～35 分钟。起点是 30.5 已就绪的**正式 API、固定用户甲和独立 VERIFY 库**，沿用 Postman、DBeaver 及项目的 Node 24。若刚做完浏览器实验，先按 30.5 停掉夹具和代理，再启动正式 API。这里直连该 API，不开启丢响应模式。练习用一条新素材，保留修订与回执供对账。[第 30 章配套快照](https://github.com/SamChowRock/epp-public/tree/828225ab1a921bcf65bb000023371048b6a3a340)

## 一、同一个「最多二百」，两边各数了什么

修订可以带分块，例如 `chunks: [{ text: 'Take a break.' }]`。服务端用 `ChunkSchema` 校验每块文字。固定的 Zod 4.6.6 在这里用 `.max(200)` 限制 Unicode 码点数。客户端的 `validSuccess` 检查修订响应时却调用 `storedText(chunk.text, 200)`，其中的 `value.length` 按 UTF-16 代码单元计数。普通汉字「学」在两边各占一；单个 😀 是一个码点，在 JavaScript 字符串里占两个代码单元，按 UTF-8 编码占四字节。[服务端字段规则](https://github.com/SamChowRock/epp-public/blob/828225ab1a921bcf65bb000023371048b6a3a340/src/capture-contract.ts) · [客户端成功校验](https://github.com/SamChowRock/epp-public/blob/828225ab1a921bcf65bb000023371048b6a3a340/examples/write-retry/pending.mjs)

| 一项分块的 text | 码点 | UTF-16 单元 | 服务端字段检查 | 客户端字段检查 |
| --- | ---: | ---: | --- | --- |
| 200 个「学」 | 200 | 200 | 通过 | 通过 |
| 100 个 😀 | 100 | 200 | 通过 | 通过 |
| 101 个 😀 | 101 | 202 | 通过 | 拒收 |
| 201 个「学」 | 201 | 201 | 拒绝输入 | 此次没有成功响应可检 |

选第三行做实验，只让一个字段在两端得出不同判断。它是合法文本，整个 JSON 也远小于请求体字节上限。本章原文和中文意图各自的 2000 上限由服务端显式用 `text.length` 判断，页面的同类检查与它相符。把 101 个笑脸填进页面的**原文**框，会测到另一个字段。

## 二、用 Postman 写一次，用 DBeaver 找到那一版

1. 在第 30 章集合核对 `baseUrl` 指向正式 API，例如 `http://127.0.0.1:3000`。复制「04 无键旧客户端」，用 `{"originalText":"Practice a pause."}` 创建一条专用素材，只发一次。将 201 响应的素材 id 存入新的集合变量 `a30Capture`。此时它只有第一版，也没有创建回执。
2. 新建集合变量 `a30Key`，填入一次生成的小写 UUID 并保存。可以在 Node 终端运行 `node -p 'crypto.randomUUID()'` 取值。复制「05 追加第2版」，地址改成 `{{baseUrl}}/captures/{{a30Capture}}/revisions`，确认方法为 POST，Headers 中只启用一个 `Idempotency-Key: {{a30Key}}`。在这个请求的 Scripts → Pre-request 写入下面一行，只生成文本样本，每次发送都保留同一操作键。

   ```js
   pm.variables.set('a30Chunk', '😀'.repeat(101));
   ```

3. Body 选 raw → JSON，发送以下正文。应收到 201，`captureId` 等于专用素材，`revisionNo` 为 2，`id` 是新修订标识。展开 `chunks[0].text`，确认存在这个分块。把这份**追加的成功响应正文**保存为临时目录中的 `revision-30a.json`，第三节要把同一对象交给真实的客户端代码。可以使用 Postman 的保存响应功能，也可把响应 Body 完整复制到编辑器后保存。

   ```json
   {
     "originalText": "Pause here.",
     "chineseIntent": null,
     "chunks": [{ "text": "{{a30Chunk}}" }]
   }
   ```

在 DBeaver 选与 API 相同的 VERIFY 连接，先核对 `SELECT current_database(), current_user;`。若从修订表按素材查最大版号，你只知道“有一版写进去了”。这里还要证明“键 K 对应的就是这一版”，所以从回执出发，用快照里的修订标识连到业务行，再比较两边的文本。把唯一的全零占位替换为 **a30Key**，用户与动作保留如下。

```sql
SELECT w.capture_id, v.id AS revision_id, v.revision_no,
       w.status_code, w.response ->> 'revisionNo' AS saved_no,
       char_length(v.chunks #>> '{0,text}') AS code_points,
       octet_length(v.chunks #>> '{0,text}') AS utf8_bytes,
       (w.response #>> '{chunks,0,text}') = (v.chunks #>> '{0,text}') AS same_chunk
FROM public.capture_write_receipts AS w
LEFT JOIN public.capture_revisions AS v
  ON v.capture_id = w.capture_id AND v.id::text = w.response ->> 'id'
WHERE w.user_id = '10000000-0000-4000-8000-000000000001'
  AND w.action = 'append-revision/v1'
  AND w.operation_id = '00000000-0000-0000-0000-000000000000';
```

UTF-8 库中应有一行，修订标识等于 Postman 响应的 id；版号与快照版号都是 2，状态码为 201，分块计量是 **101 个码点、404 字节**，两处内容相等。若读到的是十来个普通字符，先看 Postman 发出的正文里变量是否已展开；零行则先核对库、用户、动作和键。若有回执行而右侧修订标识为空，再单查该素材的修订明细。不要另建一条素材来解释原来的查询。

现在原样重发刚保存的 POST。仍应得到同一修订 id、版号、创建时间和分块。再发 `GET {{baseUrl}}/captures/{{a30Capture}}/revisions`，历史里应只有第二版和第一版。这样分两次看，既证实同键映射到一个结果，也证实重放没有额外追加。面向客户端的恢复入口是**对同一路径重发原键原参**；按键 SELECT 是维护者的数据库对账，本章没有按键 GET 回执的公开接口。

## 三、把同一份已收全的 JSON 交给页面校验器

Postman 能解析 JSON，仍没有执行本书页面的 `validSuccess`。而配套 `page.mjs` 提交的表单只构造 originalText 和 chineseIntent。选择“追加修订”可以选目标，页面没有 chunks 编辑框、待办导入按钮或 PATCH 入口。Postman 产生的修订也不会自动进入某个页签的 sessionStorage。[页面组装请求的位置](https://github.com/SamChowRock/epp-public/blob/828225ab1a921bcf65bb000023371048b6a3a340/examples/write-retry/page.mjs)

可以直接检验这个缺口，无须给页面增加控件。在**配套代码项目根目录**打开终端，把下列命令第一行的路径换成刚保存的响应文件。这个小程序通过状态机自己的 submit 准备含分块的原输入，用内存 Map 代替本页存储，用文件里的完整成功对象代替已经结束的网络读取。身份、键和运输层都是本地实验输入；检查成功字段、保留待办、初始化后恢复、再次提交这几步使用配套原函数。它不访问数据库，也不会改动浏览器里的待办。

```bash
node --input-type=module - "/临时目录/revision-30a.json" <<'JS'
import { readFile } from 'node:fs/promises';
import { PendingWrite, sendPendingWrite, STORAGE_KEY } from './examples/write-retry/pending.mjs';

const reply = JSON.parse(await readFile(process.argv[2], 'utf8'));
const text = reply.chunks[0].text;
console.log('码点 / UTF-16 单元:', [...text].length, text.length);
const path = `/captures/${reply.captureId}/revisions`;
const memory = new Map();
const seen = [];
const args = {
  storage: {
    getItem: k => memory.get(k) ?? null,
    setItem: (k, v) => memory.set(k, v),
    removeItem: k => memory.delete(k),
  },
  identify: async () => ({ userId: '10000000-0000-4000-8000-000000000001' }),
  uuid: () => crypto.randomUUID(),
  send: async (record, context) => {
    seen.push([record.operationId, record.path, record.body]);
    try {
      return await sendPendingWrite(record, {
        ...context, sessionMode: false, csrfMode: false,
        request: async () => reply,
      });
    } catch (error) {
      console.log(error.message);
      throw error;
    }
  },
};
const first = new PendingWrite(args);
await first.initialize();
await first.submit(path, { originalText: 'Pause here.', chineseIntent: null, chunks: [{ text }] });
console.log(first.state.phase, memory.has(STORAGE_KEY));
const reopened = new PendingWrite(args);
await reopened.initialize();
console.log(reopened.state.phase);
if (reopened.state.pending) {
  await reopened.retry();
  console.log(reopened.state.phase, JSON.stringify(seen[0]) === JSON.stringify(seen[1]));
}
JS
```

依次应看到 `101 202`、`Invalid success response`、`uncertain true`、`pending`，再次出现相同错误，最后是 `uncertain true`。前一个 true 表示待办还在，后一个表示两次尝试的键、路径和正文完全相同。这里生成的键只用于本地状态机；第二节才是对数据库中 a30Key 的真实重放。要做单条件对照，可在这段本地程序读取 reply 后、取得 text 前临时加入 `reply.chunks[0].text = '😀'.repeat(100)`，再运行。第一次就应为 `success false`，重新初始化为 `ready`，retry 没有待办可发。这次改的是本地对照对象，原回执仍保存 101 个。

如果未来的客户端支持设置或导入含 chunks 的待办，需要保存其原主人、追加路径、原键和序列化正文，并经过正常身份核对后再发送。上面的模型对照说明这样的合法输入能走到哪一步；直接改页面显示文字，或仅把分块写进 Postman 的环境变量，都不会让现有表单获得分块提交能力。

## 四、PATCH 成功后怎样读回

在同一份专用素材上准备一次意图修改。Postman 新建 `PATCH {{baseUrl}}/captures/{{a30Capture}}`，Body 选 raw → JSON，填 `{"chineseIntent":"这里稍停一下"}`，不用操作键，先保留请求尚未发送。正式 API 应返回 **200 和素材对象**，其 id 是素材标识。存储实现从最新修订沿用原文、来源和分块，用新的意图追加第三版；给客户端的素材投影只含 id、原文、意图与素材创建时间。**PATCH 的响应没有 chunks 或 revisionNo**。分块计长不一致直接影响的是追加 POST 的修订响应。[PATCH 的控制器](https://github.com/SamChowRock/epp-public/blob/828225ab1a921bcf65bb000023371048b6a3a340/src/captures.controller.ts) · [修订写入与素材投影](https://github.com/SamChowRock/epp-public/blob/828225ab1a921bcf65bb000023371048b6a3a340/src/prisma-capture.store.ts)

若要亲眼分开“HTTP 成功”和“客户端拒收”，**在发送这一笔 PATCH 之前**，在它的 Scripts → Post-response 设置下面两条断言，然后只发一次。第一条检查真实契约；第二条有意模拟把追加修订的读法套在 PATCH 上的旧客户端。若已发送 PATCH，直接在现有响应 Body 核对同样的字段即可。

```js
pm.test('PATCH 返回素材及新意图', () => {
  pm.response.to.have.status(200);
  pm.expect(pm.response.json().chineseIntent).to.equal('这里稍停一下');
});
pm.test('对照：按修订对象读取 PATCH', () => {
  pm.expect(pm.response.json()).to.have.property('revisionNo');
});
```

响应区应同时看到 200、第一项通过、第二项失败。后者是这个对照客户端的断言失败。用 GET 读素材详情应得到新意图；再 GET 修订历史，应看到第三版有新意图和沿用的分块，第二版仍为 null。DBeaver 可以只选取核对所需的字段，把占位换成 **a30Capture**：

```sql
SELECT revision_no, id, chinese_intent,
       char_length(chunks #>> '{0,text}') AS chunk_points
FROM public.capture_revisions
WHERE capture_id = '00000000-0000-0000-0000-000000000000'
ORDER BY revision_no;
```

在本轮没有其他写入的前提下，三行版号为 1、2、3，分块长度分别为空、101、101。再次执行第二节的回执查询，原追加键仍指第二版。甚至此刻原样重放那个 POST，也应返回第二版的原意图和修订标识。PATCH 本身没有写操作回执，重复 PATCH 即使意图值相同也可能追加第四版。因此 PATCH 客户端拒收后先读详情与历史；若有其他人同时编辑，读到相同意图只能证明当前有这个值，不能凭它认领某次未确认的操作。

## 五、修一条规则，让历史结果也读得回来

先明确要维护哪个既有承诺。这个版本已经接受每块至多 200 个码点，也可能已经把结果写进持久回执。兼容的修法是把客户端的**分块**长度检查对齐到同一单位，例如在分块专用规则中用 `[...text].length <= 200`；继续检查值是字符串、Unicode 完整、没有 NUL 且含非空白内容。原文和意图继续按各自的 UTF-16 上限检查，修订结果仍需验证目标素材、标识、版号和其他字段。若能共用一份响应 Schema，就从它派生校验；若客户端独立发布，就让两端至少使用同一组正常样本和边界样本。

用第一节四行样本分别核对服务端输入与客户端成功读取，再把**修正前已保存**的 101 笑脸响应原样交给新读者。它应接受旧结果，不需要改数据库、改正文、换键或再追加一版。若产品日后真要把写入上限收紧为 200 个 UTF-16 单元，应单独演进新写入规则，继续读得懂既有历史与回执。PATCH 的修法则落在操作选择上：按 200 和素材结构读取结果，需要修订细节时再读历史。把所有成功校验整体关闭，会连错素材和不完整结果也一并接纳。

这对应两种不同的恢复工作。传输中断时，持原键取回完整响应可以完成确认；客户端对同一合法字段一直作出错误判断时，原键只能稳定取回那份被拒收的结果。先用数据库与 HTTP 定位写入是否成功，再用同一份结果定位读取规则，才知道该恢复哪一步。

## 附录：本支线必要技术点速查

| 观察点 | 能回答的问题 |
| --- | --- |
| POST 201、追加回执、原修订标识 | 那次带键操作提交了哪份历史结果 |
| 码点、UTF-16 单元、UTF-8 字节 | 同一正常文本在三个计量位置分别占多少 |
| `uncertain` 与仍在的待办 | 此客户端尚未接受成功结果，原提交材料仍可恢复 |
| PATCH 200、素材详情与修订历史 | 当前意图与修订如何变化；本章 PATCH 无同键重放 |

[返回第 30 章](chapter.md#本章知识支线) · [返回第四篇](../README.md)
