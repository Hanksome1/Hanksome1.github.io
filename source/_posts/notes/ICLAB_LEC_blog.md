---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Logic Equivalence Checking（LEC）
date: '2025-11-04'
updated: '2026-10-16 00:24:06'
tags:
  - ICLAB
  - Verification
summary: 用 Cadence Conformal 證明合成後的 netlist 和 RTL 功能相同：key point 的對應、flat 與 hierarchical compare，以及為什麼有乘法器的設計特別難比。
permalink: notes/iclab-lec/
synced: obsidian
---

模擬只能驗證跑過的 pattern；LEC 用 formal 的方法，證明兩個設計在**所有**輸入下都等價。

- **Golden**：當作標準的設計，通常是 RTL。
- **Revised**：要被驗證的設計，例如合成後或 APR 後的 netlist。

Flow 裡每一次轉換之後都要跑：RTL ↔ 合成後的 netlist、合成後 ↔ APR 後的 netlist，以及 ECO 之後，見 [[ICLAB_Intro_blog#設計流程|設計流程]]。

## Key point

LEC 不會把整個電路攤成一個超大的布林函數來比，而是先把兩邊的 key point 一一對應起來，再比較每個 key point 前面的那一團組合邏輯（logic cone）是否等價：

| Key point | 意思 |
| --- | --- |
| PI | primary input |
| PO | primary output |
| DFF | flip-flop |
| DLAT | latch |
| BBOX | black box：不比內容的模組，例如 SRAM macro |

Lab09 的一個設計對應到 PI 44 個、PO 33 個、DFF 1,284 個、BBOX 2 個，總共 1,363 個 key point。

> [!note] 多出來的 latch
> 這個設計的 revised netlist 還多了 132 個 unreachable 的 DLAT。它們是合成時插進去的 clock-gating cell 裡面的 latch，RTL 裡沒有對應的東西。dofile 裡的 `set flatten model -gated_clock` 就是讓 Conformal 認得 clock gating 的結構。

## Dofile

把 Conformal 的流程整理成一個最簡單的 flat compare：

```tcl
set system mode setup
read design -file golden.f  -golden -verilog2k   ;# RTL
read design -file revised.f -revised             ;# netlist 加上 standard cell 的 Verilog model

set flatten model -gated_clock                   ;# 認得 clock gating
set flatten model -seq_constant                  ;# 值固定不變的 flip-flop 當成常數
set root module my_div -golden
set root module my_div -revised

set system mode lec                              ;# 進入比對模式，自動對應 key point
add compared points -all
compare
report verification
```

## 例子：查表做除法（Lab09）

Lab09 的 `my_div` 用查表加乘法做除法：先查出除數的倒數（`inverse_table`），再和被除數相乘、右移（`mul_and_shift`）。

- 對應到的 key point：PI 22、PO 16、DFF 16。
- 32 個 compared point（16 個 PO 加上 16 個 DFF）全部 equivalent，最後的 verification report 是 PASS。
- 但只有 32 個點，比對就跑了 445 秒，幾乎都花在那顆乘法器上。

乘法器是 formal 比對最頭痛的東西：RTL 裡只是一個 `*`，netlist 裡卻是 DesignWare 生成、結構完全不同的乘法器，很難從結構上證明兩者相同。Conformal 的 `analyze multiplier` 會替每個乘法器回報一個「quality evaluated xx% success」，可以當成它分析這個乘法器有多順利的指標。

## Flat 與 hierarchical，basic 與 MDP（Lab10）

- **Flat compare**：整個設計攤平之後一次比。
- **Hierarchical compare**：照 module 的階層，一個 module 一個 module 比。比過的子 module 在上一層就當成 black box，每次要處理的問題都比較小。
- **MDP flow**（module-based datapath）：讀入合成工具產生的 resource report，讓 Conformal 知道 DesignWare 的 datapath 元件（乘法器、加法器）的邊界在哪裡，再針對這些元件做分析。

Lab10 的設計有 16 個乘法器，四種組合跑出來是這樣：

| | Flat compare | Hierarchical compare |
| --- | --- | --- |
| Basic flow | abort | abort（20.95 秒就放棄） |
| MDP flow | 2,071 秒 | 538 秒 |

Basic flow 裡每個乘法器的 quality 都只有 15–16%，比對很快就 abort。MDP flow 的 flat compare 比完了全部 6,001 個點（33 個 PO、5,968 個 DFF）且全部 equivalent，但花了 2,071 秒和 4 GB 的記憶體；hierarchical compare 只要 538 秒。

所以大型設計的選擇是：**MDP flow 搭配 hierarchical compare**。
