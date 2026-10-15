---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Verilog 的時序控制：@、wait 與
date: '2025-09-18'
updated: '2026-10-16 00:21:16'
tags:
  - ICLAB
  - Verilog
summary: Testbench 裡決定「什麼時候做事」的三種寫法，各自的陷阱，以及 timescale 的意思。這些語法幾乎都只用在 testbench。
permalink: notes/iclab-verilog-timing-control/
synced: obsidian
---

## Event control：`@`

`@(expr)` 會等到事件發生才往下執行。RTL 裡的 `always @(posedge clk)` 就是這個語法；testbench 裡則常用來等 clock：

```verilog
initial begin
  repeat (12) begin
    @(posedge clk);
    tog <= ~tog;
  end
end
```

同一個時脈，不要一部分邏輯用 posedge、一部分用 negedge：從 posedge 的 flip-flop 到 negedge 的 flip-flop 只剩半個週期，組合邏輯要在這半個週期內算完，timing 會很緊。

## Level-sensitive：`wait`

`wait(expr)` 會等到條件為真才往下執行。

- **不要拿硬體產生的訊號放進 `wait`**。硬體訊號在穩定之前可能有 glitch，`wait` 一看到短暫的 1 就會往下走。
- `wait` 適合用在 testbench 自己產生的訊號上，例如等 reset 結束：`wait(rst_n == 0); wait(rst_n == 1);`
- 要等硬體的訊號，就在 clock 邊緣取樣，例如 `@(negedge clk) if (out_valid) ...`。

也不要用兩個訊號一起決定時機：

```verilog
wait (set);
@(posedge clk);
```

如果 `set` 只比 clk 晚 0.0001 ns 拉起來，就會多等一整個週期。行為取決於兩個訊號誰先到，不夠 robust。

## Delay control：`#`

```verilog
#10        rst_n = 1;
#(CYCLE/2) clk   = ~clk;
```

- 用在 testbench 裡控制時序。
- **合成時會被忽略**。RTL 裡寫的 `#` 不會變成真正的延遲，只會讓模擬結果和合成出來的電路不一致，所以 RTL 裡不要用。

> [!note] 唯一會在 RTL 附近看到 delay 的情況
> 有些 macro（例如 SRAM 的模擬 model）對 hold time 有要求，送進去的訊號需要一小段時間才算穩定。這時會在模擬用的訊號上加一個很小的 delay，確保資料建立好才被取樣。這一樣只影響模擬。

## `timescale`

`timescale` 這個 compiler directive 指定時間單位和模擬精度：

```verilog
`timescale 1ns/100ps   // 時間單位是 1 ns，最小的模擬單位是 100 ps
```

在這個設定下，`#5` 代表 5 ns，比 100 ps 更細的時間會被四捨五入。

這些語法在 testbench 裡怎麼組合起來用，見 [[ICLAB_Testbench_blog|Testbench 的寫法]]。
