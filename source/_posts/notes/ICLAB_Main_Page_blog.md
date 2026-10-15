---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: ICLAB 積體電路設計實驗：筆記總覽
date: '2025-09-28'
updated: '2026-10-16 00:26:42'
tags:
  - ICLAB
  - MOC
summary: 清大 EE4292 積體電路設計實驗（ICLAB）的筆記入口：從 Verilog、testbench、合成、LEC 到 APR，以及每份作業的設計紀錄。
permalink: notes/iclab/
synced: obsidian
---

ICLAB 是清大電機系的 EE4292 積體電路設計實驗（IC Design Laboratory），黃朝宗老師開課，我修的是 2025 年秋季那一學期。一個學期從寫 Verilog 開始，經過 lint、合成、LEC，一路做到 APR，期末再用整套 flow 完成一個自己的設計。

這些是我修課時寫給自己看的筆記，整理之後放上來。

## 課程進度

| 週 | 課程主題 | Lab |
| --- | --- | --- |
| 1 | 課程介紹、cell-based design flow | 工作站環境、SpyGlass |
| 2 | Verilog | Verilog simulator |
| 3 | Testbench、function 與 task | Testbench 的 debug 與撰寫（加上 CPU 介紹） |
| 4 | 合成、FSM | Verdi 除錯平台、FSM 練習 |
| 5 | RTL coding guidelines | RTL 模擬與除錯 |
| 6 | Synthesis (I)：Design Compiler | Design Compiler、coding for synthesis (I) |
| 7 | – | Line-based 影像處理 |
| 8 | Synthesis (II)：為合成做最佳化 | Coding for synthesis (II) |
| 9 | Logic equivalence checking | LEC |
| 10 | LEC 實務 | LEC 實務 |
| 11 | APR (I)：physical design flow | Innovus：floorplan |
| 12 | APR (II)：Cadence Innovus | Innovus：power plan、placement、CTS、routing |
| 13 | Design examples | Innovus：CTS、routing、驗證、power analysis |
| 14–17 | 期末專題 | 專題諮詢與報告 |

作業：HW1 到 HW4 分別在第 3、5、6、8 週繳交，HW5 從第 10 週開始；期末專題第 13 週交 proposal，第 15 週報告前端設計，第 17 週報告最終成果。

## 筆記

### 觀念

- [[ICLAB_Intro_blog|數位 IC 的設計流程]]

### Verilog

- [[ICLAB_verilog_datatype_blog|資料型態與參數]]
- [[ICLAB_verilog_operators_blog|運算子]]
- [[ICLAB_Assignment_blog|賦值：continuous、procedural、blocking、nonblocking]]
- [[ICLAB_Synchronization_blog|時序控制：@、wait 與 #delay]]
- [[ICLAB_Function_blog|function、task 與編譯指令]]
- [[ICLAB_Finite_State_Machine_blog|FSM 的寫法]]
- [[ICLAB_RTL_guideline_blog|RTL coding guidelines]]

### 驗證

- [[ICLAB_Testbench_blog|Testbench 的寫法]]
- [[ICLAB_spyglass_blog|用 SpyGlass 做 lint]]
- [[ICLAB_LEC_blog|Logic equivalence checking]]

### 合成

- [[ICLAB_Synthesis_blog|邏輯合成與 coding for synthesis]]
- [[ICLAB_design_compiler_blog|Design Compiler 使用筆記]]

### APR

- [[ICLAB_APR_blog|APR：從 netlist 到 layout]]
- [[Floorplan_blog|Floorplan]]
- [[Powerplan_blog|Power plan]]

### 作業與 lab

- [[ICLAB_HW1_blog|HW1：ROP3 與窮舉驗證的 testbench]]
- [[ICLAB_HW3_blog|HW2–3：Enigma 電路與合成優化]]
- [[ICLAB_HW4_blog|HW4：QR code 解碼器的 FSM 拆法]]
- [[ICLAB_HW5_blog|HW5：Transformer attention 加速器]]
  - [[cordic_blog|CORDIC]]
- [[ICLAB_lab05_blog|Lab05：三級管線 CPU]]

### 期末專題

- [[3D Gaussian Splatting 硬體加速器]]
- [[ICLAB_FINAL_PROJECT_GoldenFormat_blog|Golden pattern 的格式]]

## 我自己記住的幾條原則

- 合成工具的最佳化不會跨過 module 的邊界，組合邏輯要在哪裡切開要想清楚。
- Module 的 output 盡量直接來自 flip-flop。
- 相關的邏輯放在同一個 always block。
- 每個組合邏輯的 always block，一開始先給所有輸出預設值。
- 切 pipeline 時，輸入也要先擋一級 flip-flop。
- 不需要 reset 的 datapath register，把 reset 拿掉可以省面積。
- Testbench 在 negedge 餵資料、比對答案。
