---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: ICLAB HW1：ROP3 與窮舉驗證的 testbench
date: '2025-09-18'
updated: '2026-10-16 00:26:42'
tags:
  - ICLAB
  - Verilog
  - Verification
summary: HW1 用查表和布林邏輯兩種方式實作 ROP3，再寫 testbench 窮舉所有輸入、比對兩個版本。重點是迴圈計數器的位寬陷阱，以及怎麼從查表的規律看出 K-map。
permalink: notes/iclab-hw1-rop3/
synced: obsidian
---

## 題目

ROP3（ternary raster operation）是點陣圖形裡常見的運算：把 pattern（P）、source（S）、destination（D）三個輸入逐 bit 做某一個布林函數。三個輸入的布林函數總共有 $2^{2^3} = 256$ 種，由一個 8-bit 的 `mode` 指定要用哪一種。

這份作業有幾個版本的 ROP3 模組：

- `rop3_lut16`：只支援 16 種 mode，用查表實作
- `rop3_lut256`：支援全部 256 種 mode，也是查表
- `rop3_smart`：不查表，直接用布林邏輯算出結果

再寫 testbench 窮舉所有輸入，證明查表版和 smart 版的輸出完全一樣。

## 從查表看出 K-map

觀察助教給的 16 種 mode 的查表結果，可以發現 `mode` 的 8 個 bit 本身就是一張真值表：P、S、D 的 8 種組合，各自對應到 `mode` 的一個 bit。

![[Pasted image 20250927060030.png|把 mode 的 8 個 bit 依序填進 K-map：藍色數字是 mode 的第幾個 bit，第 1 個 bit 在左上角，第 8 個在右下角]]

把 `mode` 的每一個 bit 依照上圖填進 K-map，就能圈出這個 mode 最簡的布林式。也就是說，`rop3_smart` 不需要存 256 組結果，只要依 `mode` 的 bit 組出布林式即可。

## Testbench：窮舉所有輸入

做法是把同樣的輸入同時送給兩個模組，比對兩邊的輸出。輸入有 `din`、`sel`、`mode` 三組，用三層 for 迴圈跑過所有組合。

### 陷阱：迴圈計數器的位寬

要讓 16-bit 的 `din` 從 0 跑到 `16'hFFFF`，直覺的兩種寫法都是錯的：

```verilog
reg [15:0] din;

// 少測一個：迴圈在 din == 16'hFFFF 時就結束了
for (din = 0; din < 16'hFFFF; din = din + 1) ...

// 無窮迴圈：16'hFFFF + 1 溢位成 0，條件永遠成立
for (din = 0; din <= 16'hFFFF; din = din + 1) ...
```

解法是另外用一個多 1 bit 的計數器：

```verilog
reg [16:0] din_t;

for (din_t = 0; din_t < 17'h10000; din_t = din_t + 1) begin
  din = din_t[15:0];
  // ...
end
```

### 不連續的 mode

`rop3_lut16` 支援的 16 種 mode，編碼不是連續的數字，沒辦法直接用 for 迴圈跑。做法是另外用一個 `mode_t` 從 0 數到 15，再用一個 always block 把 `mode_t` 對應到實際的 `mode` 值。

### 把比對獨立出來

為了讓 testbench 保持簡單，比對寫在另一個 block 裡，用一個 1-bit 的 `stop_flag` 記錄窮舉是否結束：`stop_flag` 初始為 1，for 迴圈全部跑完才設成 0；比對的 while 迴圈在 `stop_flag` 為 1 的期間一直比對兩個輸出。Part 3 還會一邊比對、一邊印出目前測到哪一個 mode，方便掌握進度。

### 先測小的

參數 N = 8 時，窮舉要跑很久。所以先用 N = 4 跑完所有組合，確定 testbench 和電路都沒問題，再跑 N = 8。

## 合成結果

後來在 HW3 把 `rop3_lut256` 和 `rop3_smart` 拿去合成：

| | `rop3_lut256` | `rop3_smart` |
| --- | --- | --- |
| Timing (ns) | 1.74 | 1.30 |
| Area | 3,695 | 667 |
| Power | 0.370 | 0.0944 |

用布林邏輯直接算，面積只有查表版的 18%，而且更快、更省電。

Testbench 的基本架構見 [[ICLAB_Testbench_blog|Testbench 的寫法]]。
