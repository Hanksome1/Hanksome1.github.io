---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 積體電路設計導論：筆記總覽
date: '2024-07-08'
updated: '2026-10-17 21:09:42'
tags:
  - VLSI
  - MOC
summary: 清大 EE3230 積體電路設計導論的筆記入口：從 MOS 元件、CMOS 反相器、組合邏輯、寄生 RC、時序電路，到記憶體電路和晶片功耗。
permalink: notes/vlsi/
synced: obsidian
---

積體電路設計導論是清大電機系的 EE3230（Introduction to Integrated Circuit Design），由張孟凡老師授課。這堂課從 MOS 元件開始，依序做出反相器、邏輯閘、latch 與 flip-flop，最後是記憶體和整顆晶片。和 ICLAB 寫 RTL 交給工具合成不同，這裡走的是 full-custom 的流程，每顆電晶體的尺寸都要自己決定。

## 課程內容

| 章 | 主題 |
| --- | --- |
| 1 | 課程介紹、full-custom 設計流程、process corner |
| 2 | MOS 元件特性與 CMOS 製程 |
| 3 | CMOS 反相器 |
| 4 | 組合邏輯：static CMOS、pass transistor、dynamic logic |
| 5 | 寄生電阻、電容與導線模型 |
| 6 | 時序電路：latch 與 flip-flop |
| 7 | 記憶體：SRAM、DRAM、ROM、Flash、新興記憶體 |
| 8 | 晶片：設計流程、I/O、timing、功耗 |

兩次期中考：第一次考到組合邏輯，第二次考寄生 RC、時序電路和記憶體。期末是一個從 schematic 做到 layout 的 full-custom 專題。

## 筆記

### 流程

- [[VLSI_Introduction_blog|Full-custom IC 的設計流程與 process corner]]

### 元件與基本電路

- [[VLSI_Process_Introduction_blog|MOS 元件特性與 CMOS 製程]]
- [[VLSI_inverter_blog|CMOS 反相器：VTC、noise margin 與延遲]]
- [[VLSI_Logics_blog|組合邏輯電路：static CMOS、pass transistor 與 dynamic logic]]
- [[VLSI_RC_blog|寄生電阻、電容與導線模型]]

### 時序與記憶體

- [[VLSI_Sequential_Circuit_blog|時序電路：latch、flip-flop 與時序限制]]
- [[VLSI_Memory_blog|記憶體電路：SRAM、DRAM、ROM、Flash 與新興記憶體]]

### 晶片

- [[VLSI_chip_blog|晶片的功耗：switching、short-circuit 與 leakage]]

### 期末專題

- [ROM macro 全客製化設計](/projects/rom-macro/)：0.18 µm 製程上的 128 × 16 bit contact ROM，自己畫 schematic、拉 layout、過 DRC / LVS，再做 post-layout 模擬。

## 重點

- NMOS 傳 strong 0，PMOS 傳 strong 1，所以 static CMOS 用 PMOS 上拉、NMOS 下拉；pass-transistor logic 也因此需要 level restorer 或 transmission gate。
- 延遲大致就是 RC：反相器是 $0.69 R_{eq} C_L$，MOS 的等效電阻和 W/L 成反比，導線延遲和長度的平方成正比。
- 很多電路要看兩顆電晶體的相對強弱，例如 level restorer、SRAM 的讀寫、reduced load flip-flop，尺寸不是越大越好。
- 只存在電容上的值會漏電流失，所以 dynamic logic 有最低操作頻率，DRAM 要 refresh。
