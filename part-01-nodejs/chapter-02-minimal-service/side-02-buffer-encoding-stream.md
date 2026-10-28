# 支线 2B：从字节到 JSON——Buffer、编码与流

正文用 `Buffer.concat(chunks).toString('utf8')` 得到请求体文本。这一行包含合并字节与解释编码两个动作。我们用一个可以确定重现的小例子看清它们为什么有顺序要求，再判断这种处理方式适合什么输入。

## 同一个字，为什么有两种长度

在 JavaScript 中，`'我'.length` 是 1；将它编码成 UTF-8 后，却需要三个字节。这两个数分别描述字符串表示和传输表示，没有矛盾。

编码规定字符怎样对应字节。`Buffer.from('我', 'utf8')` 把字符串编码成字节；`buffer.toString('utf8')` 按同一种约定将字节解码成字符串。Buffer 本身可以保存任意字节，既可以是文本，也可以是图片的一部分。只有知道这些字节应当按什么格式解释，转换才有意义。

这解释了正文为什么用 `chunk.length` 累计请求体大小，而用 `originalText.length` 检查字段长度。前者面对 Buffer，计量字节；后者面对字符串，计量 UTF-16 代码单元。将来限制昵称的可见字符数，还要进一步处理组合字符等情况，不能把三种计数混成一个概念。

## 主动把一个字符切开

无需真的让网络变慢，我们也能重现分块问题。以下是完整的独立示例，保存为实践代码项目中的 `examples/buffer-boundary.js`，它不启动服务，也不改变记录数据：

```javascript
import { Buffer } from 'node:buffer';
import { StringDecoder } from 'node:string_decoder';

const bytes = Buffer.from('我', 'utf8');
const first = bytes.subarray(0, 1);
const second = bytes.subarray(1);

console.log('字符串长度:', '我'.length);
console.log('UTF-8 字节数:', bytes.length);
console.log('十六进制:', bytes.toString('hex'));
console.log('逐块解码:', first.toString('utf8') + second.toString('utf8'));
console.log('合并后解码:', Buffer.concat([first, second]).toString('utf8'));

const decoder = new StringDecoder('utf8');
console.log('第一次解码:', JSON.stringify(decoder.write(first)));
console.log('第二次解码:', decoder.write(second));
console.log('结束解码:', JSON.stringify(decoder.end()));
```

在项目根目录使用约定的 Node 版本运行：

```bash
nvm use
node examples/buffer-boundary.js
```

输出应为：

```text
字符串长度: 1
UTF-8 字节数: 3
十六进制: e68891
逐块解码: ���
合并后解码: 我
第一次解码: ""
第二次解码: 我
结束解码: ""
```

`subarray` 切出的是字节范围，不会替我们避开字符中间的位置。本例第一块只有 `E6`，第二块是 `88 91`。独立调用 `toString` 时，每次解码都只能看见当前块，于是无法按原来的三个字节还原字符，用替代字符表示无效序列。之后拼接字符串，拼起来的已经是错误解码的结果。

先合并 Buffer 则保留了完整的 `E6 88 91`，所以可以得到原字符。另一种方式是保留解码过程的状态。`StringDecoder` 第一次遇到未完成字符时暂存字节，返回空字符串；第二次拿到其余字节后再产生“我”。它并没有跳过第一次输入，而是推迟了尚不能完成的输出。

最后的 `end()` 通知解码器输入结束。本例没有剩余的不完整字符，因此返回空字符串。如果结尾仍是不完整序列，解码器会处理这些残留；它不是一套拒绝所有损坏输入的严格 UTF-8 校验规则。这一区别在处理不可信文件时也需要考虑。

## 正确解码之后，为什么仍不能逐块解析 JSON

`StringDecoder` 解决的是字符可以跨块的问题。一份 JSON 仍可能在任意属性或字符串中间分开。第一段文字即使每个字符都正确，也未必是一份完整 JSON。

因此我们还需要定义更高一层的完成边界。EPP 当前约定一次请求体是一份 JSON，就在请求体 `end` 后解析。如果换成“一行一条记录”的输入格式，可以逐步解码，再按完整行取出记录；这时还要保留没有换行的末尾片段。选择不同的数据格式，才能相应改变应用处理的单位。

由此能区分三个动作：流分批提供字节，解码器把字节解释成字符，JSON 解析器把完整文本解释成值。后一步的输入条件不会因为前一步成功就自动满足。正文的读取函数把这些条件串起来，业务校验则在得到 JSON 值之后继续检查字段。

## 用了流，为什么内存仍会增长

请求以流的形式到达，只说明可以分批处理。若每收到一块都放进数组，直到结束才合并，程序最终仍然保存了整份输入。流接口不会替应用决定什么时候丢弃已处理的数据。

正文的 16 KiB 上限让这种方式适合短小 JSON。即便如此，合并时可能同时存在原来的块与新 Buffer，解码还会产生字符串，解析之后又有对象，所以这个上限不等于整个请求处理的精确内存上限。同时处理多份请求时，也会分别占用这些资源。

如果要接收一个很大的文件，就应重新选择处理单位：能否把已经收到的部分写入目标，再释放应用不再需要的引用？这样可以避免为整个文件维护一个越来越大的数组。但如果接收速度高于写入速度，尚未写完的数据还是会积压。

这就引出背压：下游忙不过来时，向上游传递暂缓继续提供数据的信号。Node 的可写流在 `write()` 返回 `false` 时，要求调用方等待后续 `drain` 再继续写；返回 `false` 不表示刚才那块数据被拒收，而是提示内部缓冲已达到相应阈值。持续无视这个信号，仍然可能越积越多。

本章的请求体需要整体交给 `JSON.parse`，所以先采用明确上限的缓冲方案。第 44 章接收文件时，会把这里的速度差异落实到流式传输、错误传播与中断清理中。依据输入格式、总大小和处理速度来选择方案，才能将这段认识用于其他后端服务。

阅读参考：约 7～9 分钟；运行示例并对照输出另加约 3～5 分钟。按约 1400 字解释、随文代码与输出对照估算，尚未经过读者实测。

## 附录：必要技术点速查

| API 或机制 | 本支线用途 |
| --- | --- |
| `Buffer.from(text, encoding)` | 将文本按指定编码转换为字节 |
| `Buffer.subarray(start, end)` | 选取字节范围；它与原 Buffer 共享对应内存 |
| `Buffer.concat()` / `toString()` | 合并字节 / 按编码解码 |
| `StringDecoder.write()` / `end()` | 保留跨块解码状态 / 结束解码并处理残留 |
| `write()` 返回值 / `drain` | 协调写入速度，避免持续积压 |

官方查阅：[Buffer](https://nodejs.org/docs/v24.22.1/api/buffer.html)、[StringDecoder](https://nodejs.org/docs/v24.22.1/api/string_decoder.html)、[流与背压](https://nodejs.org/docs/v24.22.1/api/stream.html)。

[回到正文：读取请求体](chapter.md#为什么拿到第一块数据时还不能解析-json) · [第一篇目录](../README.md) · [全书目录](../../README.md)
