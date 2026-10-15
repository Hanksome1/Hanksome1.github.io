---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Verilog 運算子
date: '2025-09-11'
updated: '2026-10-16 00:22:41'
tags:
  - ICLAB
  - Verilog
summary: Bitwise、reduction 和 logical 運算子的差別，== 與 === 該用在哪裡，以及 signed 運算要注意的地方。
permalink: notes/iclab-verilog-operators/
synced: obsidian
---

## Bitwise

| 運算 | 符號 |
| --- | --- |
| NOT | `~` |
| AND | `&` |
| OR | `\|` |
| XOR | `^` |
| XNOR | `~^` 或 `^~` |

逐 bit 運算，結果的寬度和運算元一樣。

## Reduction

同樣的符號只放一個運算元時，會把整個 vector 縮成 1 bit：

```verilog
wire all_one = &data;   // 全部都是 1 才是 1
wire any_one = |data;   // 有任何一個 1 就是 1
wire parity  = ^data;   // 1 的個數是奇數時為 1
```

## Logical

| 運算 | 符號 |
| --- | --- |
| NOT | `!` |
| AND | `&&` |
| OR | `\|\|` |

結果只有 1 bit，代表真或假。`!` 和 `~` 在多 bit 的訊號上意思完全不同：`!4'b0010` 是 `1'b0`，`~4'b0010` 則是 `4'b1101`。

## Logical equality 與 case equality

- **Logical equality `==`**：只有兩邊都是 0 或 1 時才有明確的結果，只要有 X 或 Z，結果就是 X。這是硬體做得到的比較，**RTL 裡用這個**。
- **Case equality `===`**：把 X 和 Z 也當成一種值來比，結果一定是 0 或 1。實際的電路沒辦法判斷一條線是不是 X，所以**只能用在 testbench**。

Testbench 比對答案時要用 `!==`：如果電路輸出是 X，`alu_out != golden` 的結果是 X，`if` 會把它當成假，錯誤就被放過了；`!==` 則會正確地回傳 1。完整的例子見 [[ICLAB_Testbench_blog#4. 比對答案|Testbench]]。

## Conditional

```verilog
assign y = en ? a : b;   // 2-to-1 multiplexer
```

## Concatenation

```verilog
assign new_bus = {regd[6:5], regc[4:3], regb[3:0]};
```

## Signed

```verilog
wire signed [15:0] addr;
```

Vector 預設是 unsigned。要做有號數運算時，參與運算的訊號都要宣告成 `signed`：只要其中一個是 unsigned，整個運算式就會被當成 unsigned 計算。

Signed 和 unsigned 的乘法器是不同的電路，面積也差很多，位寬和有沒有號在寫 RTL 時就要想清楚。
