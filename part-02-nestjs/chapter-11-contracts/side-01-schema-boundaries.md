# 支线 11A：Schema 的输入、输出与转换边界

主线已经用 Schema 检查了请求，并将通过检查的值交给业务。接下来遇到可选字段、默认值或转换时，“这个 Schema 对应什么类型”就不够用了：它接受哪些值，会返回什么，是否保留原来的内容，是三个不同的问题。

这条支线使用第十一章的 `examples/input-contracts.mjs`。先完成本章代码与构建，再按下面的条件变化逐段观察；不启动 HTTP，也不修改记录服务的行为。

时间参考（估算）：阅读约 15～20 分钟；独立程序与条件修改另加约 10～15 分钟。按约 2300 个汉字、55 行代码与命令，以及字段缺失、转换、Unicode 和文档两端的对照估算，尚未经过读者实测。

## 解析结果符合要求，不等于原对象已经改变

假设调用方提交的对象包含一个不允许指定的 id：

```js
const source = { originalText: '  Keep my spaces.  ', id: 'client-id' };
const parsed = CreateCaptureSchema.parse(source);
console.log(parsed);
console.log(source.id);
```

第一项输出没有 id，第二项仍为 client-id。默认 object 在解析结果中保留声明字段，原始对象不会因为执行 parse 就被原地删掉属性。因此我们在 Controller 继续使用 input.originalText，而不是再次展开 body。

如果需求变为“调用方拼错字段就立即失败”，改成 strictObject 才对应这个要求；如果需求明确允许可扩展的对象内容，looseObject 才会将未知属性保留下来。可以比较：

```js
z.strictObject({ originalText: z.string() }).safeParse(source).success;
z.looseObject({ originalText: z.string() }).parse(source).id;
```

前者为 false，后者为 client-id。拒绝未知字段便于发现拼写错误，却可能阻止旧客户端携带服务端暂时不认识的新字段；忽略未知字段宽容一些，但拼错可选字段时可能静默使用默认行为。先选契约，再选 API；不能让默认行为替我们作出产品决定。

## 没有传值、传 null 与传空字符串是不同条件

假设以后需要一个可选的筛选文本。调用方省略字段，表示没有设置；传空字符串可能表示清除输入，也可能是不合法条件；null 则是一个明确的 JSON 值。这三种情况的含义需要分别决定。

`optional()` 允许 undefined，`nullable()` 允许 null；它们本身都不排除空字符串。用最简单的字符串 Schema 对照：

```js
const optional = z.string().optional();
const nullable = z.string().nullable();
for (const value of [undefined, null, '']) {
  console.log(value, optional.safeParse(value).success, nullable.safeParse(value).success);
}
```

结果分别为 undefined 的 true／false、null 的 false／true、空串的 true／true。若要求“缺失可以，但提供了就必须包含非空白字符”，要像主线 q 一样先描述字符串约束，再允许缺失。optional 并不等于“所有空值都可以”。

JSON 对象省略属性时，读取不存在的属性得到 undefined；JSON 本身没有 undefined 这个字面量。URL 查询又不同：`?q=` 明确传来了空字符串，而不写 q 才是缺失。入口的数据表示决定了 Schema 实际看到什么，这也是为什么不能照搬一个前端表单的空值约定到所有后端入口。

默认值还有独立的含义：

```js
z.string().default('fallback').parse(undefined);
z.string().default('fallback').safeParse(null).success;
```

第一项返回 fallback，第二项为 false。默认值补的是这里允许补全的缺失情况，不是把所有错误都吞掉。假如主线 limit 改成默认 20，省略 limit 时的行为会从全部变成最多 20 条；即使类型检查全部通过，接口含义仍然发生了变化。必须同步说明和调用方判断，不能以“只是增加默认值”忽略它。

## 转换成功不等于输入表示正确

用 Number 可以把许多值变成数字，但接口未必希望接受所有这些写法。最直观的反例是：

```js
z.coerce.number().parse('');
z.coerce.boolean().parse('false');
```

得到的是 0 和 true。第二项没有解析英语单词 false，它使用的是 JavaScript Boolean 转换，非空字符串为真。如果据此决定某个开关是否启用，调用方发送 `'false'` 却触发启用，就不是类型问题，而是转换策略错误。

当前 limit 要求十进制的 1～100 文本。先用字符串正则约束写法，能拒绝空串、`1e1`、`01` 和重复键数组，再转换成数字。这条顺序不仅让结果成为 number，也保留了输入表示的要求。

如果确实希望把转换写进 Schema，可以组合一个独立例子：

```js
const NumberText = z.string().regex(/^[1-9]\d?$/)
  .transform(Number).pipe(z.number().int());
console.log(typeof NumberText.parse('12'));
```

这里特意只接受 1～99 的文本，用于观察类型变化，不是主线 limit 的替代实现。前面限制输入表示，transform 做转换，pipe 再约束转换结果。它的输入类型是 string，输出类型是 number；`z.input<typeof NumberText>` 与 `z.output<typeof NumberText>` 描述不同的两端，`z.infer` 对应输出。

主线选择把 Number 留在解析函数中，是因为只有一个简单转换，先验证、再映射为业务条件更直观。两种写法都能表达要求；不要为使用 transform 而把一个本来清楚的转换埋进很长的链。

## 一个“长度”可能用三种单位计量

再看 😀：JavaScript 的 length 为 2，按 Unicode 码点遍历得到 1，UTF-8 编码后的字节数又是 4。字符组合还可能由多个码点共同形成一个可见符号。字符串、JSON Schema、请求体限额并不天然使用同一个单位。

本章固定的 Zod 4.6.6 对字符串使用 Unicode 码点长度；原服务使用 UTF-16 代码单元。因此迁移时用 `refine(text => text.length <= 2000)` 保持原规则。对照 `CreateCaptureSchema.safeParse({ originalText: '😀'.repeat(2000) })`，应失败；若直接换成字符串的 `.max(2000)`，在这个版本中则会接受。

这并不是说 UTF-16 一定比码点更适合作为产品长度规则。我们维护的是一个已有约定，不能在更换校验机制时顺带改变它。如果以后产品决定按用户可见字符计算，应明确新的计量方式，再一起修改输入检查、业务规则、提示、文档和已有数据策略。现在没有这个需求，所以保留原规则。

字节限制仍在流读取时执行：一个结构里除了 originalText 还可能带很多额外字段，哪怕它们最终被忽略，也会先消耗传输与解析资源。移除未知字段不能代替整个请求体的大小上限。

## 文档可以描述两端，但不能保存任意程序的语义

对 NumberText 生成输入描述：

```js
z.toJSONSchema(NumberText, { io: 'input', target: 'openapi-3.0' });
```

应看到字符串及其正则，而不是 number。调用方发送的是字符串，转换后的数字属于服务内部。若把输出描述发给调用方当请求要求，类型看起来更贴近业务，却描述错了线上输入。

再尝试转换一个只有 transform 的 Schema：

```js
z.toJSONSchema(z.string().transform(text => text.length));
```

默认按输出描述时，这个转换不能自动成为等价 JSON Schema，示例会捕获生成失败。它执行的是任意 JavaScript 函数，不能仅凭函数存在就推导所有可能输出。增加明确的输出 Schema，有时能描述输出形状，但仍不代表文档能重现这个转换的每一步业务语义。

refine 也有类似边界。本章的 UTF-16 条件可以执行，却不会自动生成等价的标准 maxLength。文档中的 description 说明真实限制，服务端保留检查；这需要人工核对。对象的输入／输出范围、可表达的正则等适合生成，不能表达的条件需要明确补充。把 unrepresentable 调整为允许任意值，只会让文档更宽松，不会补回缺失的约束。

## 在一个程序里核对这些区别

完整 `examples/input-contracts.mjs` 如下；按上面的推理，可以在运行前分别判断每行结果代表输入接受、输出变化还是描述能力：

```js
import { z } from 'zod';
import { CreateCaptureSchema, ListQuerySchema } from '../dist/src/capture-contract.js';

const source = { originalText: '  Keep my spaces.  ', id: 'client-id' };
console.log('parsed:', CreateCaptureSchema.parse(source));
console.log('source keeps id:', source.id);
console.log('strict accepts extra:', z.strictObject({ originalText: z.string() }).safeParse(source).success);
console.log('loose keeps id:', z.looseObject({ originalText: z.string() }).parse(source).id);

const optional = z.string().optional();
const nullable = z.string().nullable();
for (const value of [undefined, null, '']) {
  console.log('presence:', value, optional.safeParse(value).success, nullable.safeParse(value).success);
}
console.log('default missing:', z.string().default('fallback').parse(undefined));
console.log('default accepts null:', z.string().default('fallback').safeParse(null).success);
console.log('coerce empty number:', z.coerce.number().parse(''));
console.log('coerce false string:', z.coerce.boolean().parse('false'));
for (const value of ['10', '', '1e1', '01', ['1', '2']]) {
  console.log('limit:', JSON.stringify(value), ListQuerySchema.shape.limit.safeParse(value).success);
}

const NumberText = z.string().regex(/^[1-9]\d?$/).transform(Number).pipe(z.number().int());
console.log('converted type:', typeof NumberText.parse('12'));
console.log('input description:', z.toJSONSchema(NumberText, { io: 'input', target: 'openapi-3.0' }));
try {
  z.toJSONSchema(z.string().transform(text => text.length));
} catch {
  console.log('bare transform has no automatic JSON Schema output');
}
console.log('emoji code units:', '😀'.length, 'code points:', [...'😀'].length);
console.log('2000 emoji accepted:', CreateCaptureSchema.safeParse({ originalText: '😀'.repeat(2000) }).success);
```

运行：

```bash
npm run build
node examples/input-contracts.mjs
```

应看到默认对象移除额外字段但保留原文空格，strict 拒绝、loose 保留；缺失／null／空串分别得到不同结果；空串转数字为 0，字符串 false 转布尔为 true。主线 limit 只接受示例中的 `'10'`，拒绝其他四种表示。转换示例返回 number，输入文档仍描述 string；最后 2000 个 emoji 未通过原文规则。

这些输出不是让我们记一张 Zod 行为表。面对一个新字段，应该先说清缺失与空值含义、允许的表示、是否允许转换、输出承诺什么，再决定 Schema 组合。解析完成后使用它的结果，生成文档后再核对不能自动表达的部分，才能把主线的边界迁移到新需求上。

## 附录：本支线必要技术点速查

| 名称 | 本支线用途 | 必要注意点 |
| --- | --- | --- |
| object／strictObject／looseObject | 比较额外字段策略 | 返回结果的处理不等于原对象修改 |
| optional／nullable／default | 区分缺失、null 与默认补全 | 不自动排除空串，不自动吞掉不合法输入 |
| coerce | 观察 JavaScript 转换语义 | 空串与布尔字符串容易产生意外结果 |
| transform／pipe | 区分输入、转换与输出 | 类型变换不替代输入表示约束 |
| input／output／infer | 表达 Schema 两端的静态类型 | infer 对应输出，不证明数据已经解析 |
| UTF-16／码点／UTF-8 字节 | 保持长度单位一致 | 显示字符还可能由多个码点组成 |
| toJSONSchema 的 io／target | 描述正确的一端和规范版本 | 自定义函数语义不能假定自动生成 |

官方查阅：[Zod Schema API](https://zod.dev/api)、[Zod 基础与类型推导](https://zod.dev/basics)、[JSON Schema 转换](https://zod.dev/json-schema)、[ECMAScript 字符串](https://tc39.es/ecma262/multipage/ecmascript-data-types-and-values.html#sec-ecmascript-language-types-string-type)。本支线以 Zod 4.6.6 的实际行为为准。

[返回第十一章](chapter.md) · [返回第二篇](../README.md)
