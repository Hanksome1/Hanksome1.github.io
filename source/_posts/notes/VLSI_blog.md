---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 積體電路設計導論：筆記總覽
date: '2024-07-08'
updated: '2026-10-16 01:12:06'
tags:
  - VLSI
  - MOC
summary: 清大 EE3230 積體電路設計導論的筆記入口：從 MOS 元件、CMOS 反相器、組合邏輯、寄生 RC、時序電路，到記憶體電路和晶片功耗。
permalink: notes/vlsi/
synced: obsidian
---

積體電路設計導論（Introduction to Integrated Circuit Design）是清大電機系的 EE3230，張孟凡老師開課，我修的是 2024 年秋季那一學期。這門課從電晶體開始往上蓋：先看 MOS 本身的特性，再用它組出反相器、邏輯閘、latch 和 flip-flop，最後是記憶體和整顆晶片。跟 ICLAB 寫 RTL 交給工具合成不同，這門課走的是 full-custom 的路，每顆電晶體的尺寸都要自己決定。

這些是我修課時寫給自己看的筆記，整理之後放上來。

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

## 整門課反覆出現的幾個觀念

- **NMOS 傳 strong 0、PMOS 傳 strong 1。** Static CMOS 為什麼用 PMOS 做 pull-up、pass-transistor logic 為什麼要 level restorer 或 transmission gate，都是從這一點來的。
- **延遲就是 RC。** 反相器是 $0.69 R_{eq} C_L$，MOS 的等效電阻跟 W/L 成反比，導線延遲跟長度的平方成正比。要變快，就是想辦法讓 R 或 C 變小。
- **很多電路是在比力氣。** Level restorer 裡 pass transistor 要贏過回授的 PMOS，SRAM 讀取時 PD 要贏過 PG、寫入時 PG 要贏過 PU，reduced load flip-flop 的輸入 TG 要贏過回授反相器。這些電路的尺寸不是越大越好，重點是兩顆電晶體之間的相對強弱。
- **存在電容上的東西都會漏。** Dynamic logic、DRAM、two-phase flip-flop 的 non-overlap 期間，值都只存在寄生電容上，所以會有最低操作頻率，或需要 refresh。
