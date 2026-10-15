---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Verilog 的賦值：continuous、procedural、blocking 與 nonblocking
date: '2025-09-18'
updated: '2026-10-16 00:21:16'
tags:
  - ICLAB
  - Verilog
summary: assign 和 always 的差別、什麼時候用 = 什麼時候用 <=，以及為什麼 IC 設計裡不想看到 latch。
permalink: notes/iclab-verilog-assignment/
synced: obsidian
---

## Continuous assignment

```verilog
assign sum = a + b;
```

描述的是一條一直存在的連線：右邊任何一個訊號改變，左邊就跟著更新。合成出來是組合邏輯，而且不會產生 latch。

同一個 net 不能被兩個 `assign` 驅動：

```verilog
assign sum = a + b;
assign sum = c + d;   // 錯：sum 有兩個 driver（multiple drivers）
```

## Procedural assignment

```verilog
always @(*) begin
  // statements
end
```

一個 always block 不要寫太長，只放一組相關的邏輯：讀的人一眼就知道這個 block 在做什麼，debug 時要同時追的訊號也比較少。

## Blocking 與 nonblocking

| | Blocking `=` | Nonblocking `<=` |
| --- | --- | --- |
| 執行方式 | 依序執行，下一行看得到上一行的新值 | 同一時間點的右式全部先算完，最後才一起更新 |
| RTL | 組合邏輯（`always @(*)`） | 循序邏輯（`always @(posedge clk)`） |
| Testbench | 常用，依時間順序描述行為 | 很少用，除非要模擬 flip-flop |

兩者的差別在循序邏輯裡最明顯：

```verilog
// nonblocking：b 拿到的是 a 的舊值，所以這是兩級 shift register
always @(posedge clk) begin
  a <= in;
  b <= a;
end

// blocking：b 拿到的是剛更新過的 a，結果等於 b <= in，少了一級
always @(posedge clk) begin
  a = in;
  b = a;
end
```

## 避免 latch：先給預設值

組合邏輯的 always block 裡，如果某些條件下輸出沒有被賦值，代表它必須「記住上一次的值」，合成工具就只能用 latch 來實作。

```verilog
// 錯：sel = 0 時 y 沒有被賦值，合成出 latch
always @(*) begin
  if (sel) y = b;
end

// 對：一開始先給預設值
always @(*) begin
  y = a;
  if (sel) y = b;
end
```

case 也一樣，先給所有輸出預設值，或是寫好 `default`。

### 為什麼不要 latch

在 ICLAB，設計裡不應該出現任何 latch：

- Flip-flop 只在 clock 邊緣取樣；latch 在 enable（例如 clk 為 1）的整段期間都是透明的，這段時間內輸入的任何變化都會直接傳到輸出。
- Latch 同樣有 setup / hold 的要求，而且一個週期內會開、關各一次。原本組合邏輯只要在兩個 posedge 之間算完就好，有了 latch，timing 分析會複雜很多。
- Design Compiler 合成出 latch 只會給 warning、不會報錯，要自己去 log 裡確認。

> [!warning] Feedback loop
> 組合邏輯的輸出又接回自己的輸入，就是 combinational loop：狀態很難分析，延遲也不固定。數位設計裡要回授，一定要經過 flip-flop。

相關：[[ICLAB_RTL_guideline_blog|RTL coding guidelines]]、[[ICLAB_Synthesis_blog|coding for synthesis]]。
