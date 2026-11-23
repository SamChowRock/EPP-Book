# 支线 19B：每人最近两条，遇到并列该留下谁

19.2 给每位用户选一条最近原文。现在编辑要给每个人留两个展示位置，运营却说：“同一时间的素材不能因为 ID 不同而少展示一条。”这两个要求在没有并列时看起来一样。先造一组能让它们分出胜负的数据，再决定 SQL 怎么写。

在 DBeaver 的 DEV 连接打开新的 SQL 编辑器。配套 `part-03/chapter-19` 的 `database/chapter-17/10-window-ranking.sql` 和下文的三条查询都能逐条独立运行。样本是只读的局部整数，minute_no 是同一小时内的分钟，用来代替真实创建时刻。阅读约 22～28 分钟，预测、改写和核对结果另加约 15～22 分钟。

## 先画出要返回的明细

A 在第 8 分钟写下 101，第 9 分钟写下 102 和 103，第 10 分钟写下 104。B 只有 201、202，两条都在第 9 分钟。C 尚未写过。请先单独排 A：

| 要求 | 应选的 ID | 理由 |
| --- | --- | --- |
| 两个展示位置，同时刻让较大的 ID 在前 | 104、103 | 位置用完了 |
| 取前两名，同一时刻并列 | 104、103、102 | 第 2 名有两条 |
| 取最近两个不同的时刻 | 104、103、102 | 第 10、9 分钟各有多少条都算 |

仅看这张表，后两种规则似乎相同。把门槛从二提到三试试。按比赛名次，已有一位第一、两位并列第二，下一位排第四，101 仍进不了前三名。按不同时间数，第 8 分钟刚好是第三个时刻，101 应当出现。选例子时可以先问一句：我的数据能否区分这两种答案？

## 一行素材保留一行，只给它添上组内位置

按 owner_id 写 GROUP BY，可以得到每人最大的分钟，却失去明细身份。现在希望每一条素材都能与同一人的其他素材比较，而且比较完还能取出它的 ID。先把所有候选行摆在网格里，给每行添上三种编号。这就是这里引入窗口函数的原因。

```sql
WITH captures(owner_id, id, minute_no) AS (
  VALUES ('A', 101, 8), ('A', 102, 9), ('A', 103, 9), ('A', 104, 10),
         ('B', 201, 9), ('B', 202, 9)
)
SELECT owner_id, id, minute_no,
       row_number() OVER (PARTITION BY owner_id ORDER BY minute_no DESC, id DESC) AS slot,
       rank() OVER (PARTITION BY owner_id ORDER BY minute_no DESC) AS place,
       dense_rank() OVER (PARTITION BY owner_id ORDER BY minute_no DESC) AS time_group
FROM captures
ORDER BY owner_id, minute_no DESC, id DESC;
```

读第一项可以从括号内部开始。PARTITION BY 指定和谁比，遇到另一位用户就重新编号；里面的 ORDER BY 指定怎样比；row_number 为每个位置分配一个整数。A 的 104、103、102、101 依次占第 1～4 位。rank 和 dense_rank 的排序依据刻意只有分钟，分钟相同就属于同一档。沿着刚才四行读，它们分别给出 1、2、2、4 和 1、2、2、3。B 的两条素材在 slot 列为 1、2，另两列都为 1。外面最后一行的 ORDER BY 决定结果怎样展示；它能稳定两个同档项的显示先后，又保留相同的业务名次。

做一个反向检查：把 id DESC 也加进 rank 的窗口后重新执行。此时同一人的两个排序键合起来已经唯一，A 的 103 和 102 会变成两名。ID 在 slot 里解决了“只剩一个展示位置给谁”，搬到 place 里却改掉了“怎样算并列”。如果只需要组内唯一编号，反而删掉 slot 的 ID 裁决，又无法承诺两个同分钟的素材谁占最后一个位置。做完恢复原查询。

## 把排名作为下一层的输入，再接回完整名单

若在产生 slot 的同一层 WHERE 里写 `slot <= 2`，筛行时还没有这列。先用一层查询计算名次，再在外层使用它。还有一个容易漏的条件：C 没有任何素材，当然也没有可供编号的素材行，但编辑仍要在名单上看到 C。应先在真实素材里排名，再从人员名单找合格项。先自己写出外层，自检结果后再对照：

```sql
WITH owners(owner_id) AS (VALUES ('A'), ('B'), ('C')),
captures(owner_id, id, minute_no) AS (
  VALUES ('A', 101, 8), ('A', 102, 9), ('A', 103, 9), ('A', 104, 10),
         ('B', 201, 9), ('B', 202, 9)
),
ranked AS (
  SELECT owner_id, id, minute_no,
         row_number() OVER (PARTITION BY owner_id ORDER BY minute_no DESC, id DESC) AS slot,
         rank() OVER (PARTITION BY owner_id ORDER BY minute_no DESC) AS place,
         dense_rank() OVER (PARTITION BY owner_id ORDER BY minute_no DESC) AS time_group
  FROM captures
)
SELECT o.owner_id, r.id, r.minute_no, r.slot
FROM owners AS o
LEFT JOIN ranked AS r ON r.owner_id = o.owner_id AND r.slot <= 2
ORDER BY o.owner_id, r.slot;
```

预期从上到下是 A 的 104、103，B 的 202、201，最后是 C 和空的素材列。C 的这一行表示名单成员存在、未找到入选素材。若先把用户与明细外连接，再对展开结果用 row_number，C 的占位行也会被编号为 1；如果下游按非空名次计数，就凭空制造了一次入选。

把 ON 里的 `r.slot <= 2` 换成 `r.place <= 2`。A 现在多出 102，B 和 C 保持原样。再恢复 slot，把门槛从 ON 挪到外层 WHERE，预测消失的是谁。C 的 r.slot 为 NULL，比较不会得到真。若界面需要明确的“还没有素材”，最后一次改法已经改变了名单范围。

再给自己一道不看答案的题：“只考虑第 10 分钟之前的素材，每人给两个位置。”先写下 A 的两个 ID。在 ranked 的 FROM captures 之后添加 `WHERE minute_no < 10` 再编号，A 会留下 103、102。若先给所有素材编号，再在外层的连接条件里排除第 10 分钟，104 虽被拿掉，已经占去的位置却不会重算，A 只剩 103。要区分的是“先定候选再选前二”和“从已经选出的前二里隐藏一项”。

## 看同一行时，计数覆盖到哪一行

编辑希望在素材旁边再标一个数。“这个人一共有几条”“到这一分钟为止一共有几条”“按列表逐条读到这里已经几条”，要用不同的范围。把排序转回从早到晚，先对 A 的 102、103 手算：

```sql
WITH captures(owner_id, id, minute_no) AS (
  VALUES ('A', 101, 8), ('A', 102, 9), ('A', 103, 9), ('A', 104, 10),
         ('B', 201, 9), ('B', 202, 9)
)
SELECT owner_id, id, minute_no,
       count(*) OVER (PARTITION BY owner_id) AS owner_total,
       count(*) OVER (PARTITION BY owner_id ORDER BY minute_no) AS through_minute,
       count(*) OVER (PARTITION BY owner_id ORDER BY minute_no, id
                      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS through_row
FROM captures
ORDER BY owner_id, minute_no, id;
```

A 的 owner_total 每行都是 4。through_minute 依次是 1、3、3、4。同一分钟的 102 和 103 同属一档，带排序的这个默认窗口帧把当前行的同档项都算进来，所以在 102 那行就已经计到 3。through_row 是 1、2、3、4：排序在分钟后补了 ID，ROWS 明确按排好的行从开头取到当前行。B 的两行更好认，through_minute 都为 2，through_row 分别为 1、2。可以先只选 B 验证，再把整份结果按 ID 倒序展示；只改最外层排序，行旁已算好的数字会跟着原来的 ID 移动。

回到 19.2，若报表仍要求每人一个数量和一段最新原文，原来的分组、标量子查询足以交付。只有需求要求保留每条入选明细，才需要把“哪些行参加比较、如何打破或保留并列、比较后哪些人仍要展示”分别写出来。接手另一张报表时，可以先交给同事这六条素材和空用户，请对方圈出该留下的 ID；双方圈得不一样时，改 SQL 之前先改清需求。

## 附录：本支线必要技术点速查

| 需要判断 | 对应写法 |
| --- | --- |
| 每人最多 N 条且结果确定 | 分区内按完整顺序 row_number，在下一层限名额 |
| 同时刻同名次 | rank 允许跳号，dense_rank 按不同排序值连续编号 |
| 空用户也要显示 | 从名单 LEFT JOIN 已排名明细，把入选条件放在匹配侧 |
| 每行显示总量或累计量 | 分开确定分区、排序和窗口帧，再指定最后的展示顺序 |

[PostgreSQL 18 窗口函数](https://www.postgresql.org/docs/18/tutorial-window.html) · [返回第十九章](chapter.md) · [返回第三篇](../README.md)
