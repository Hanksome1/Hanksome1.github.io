---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 數位 IC 的設計流程
date: '2025-09-05'
updated: '2026-10-16 00:21:16'
tags:
  - ICLAB
  - Digital Design
summary: ICLAB 第一週的內容：數位與類比 IC 的差別、cell-based design flow 的每一步、standard cell，以及 static 與 dynamic analysis 各自用在哪裡。
permalink: notes/iclab-intro/
synced: obsidian
---

ICLAB 第一週在講一顆數位晶片從規格到 layout 會經過哪些步驟，以及這門課負責其中哪一段。課程總覽見 [[ICLAB_Main_Page_blog|ICLAB 筆記總覽]]。

## 數位 IC 與類比 IC

最簡單的分法是看「結果是不是唯一」。同一個加法器，只要輸入一樣，算幾次結果都一樣；類比電路處理的是連續的訊號，任何一點雜訊或元件誤差都會反映在輸出上，所以每次的結果不會完全相同。

實際的系統兩種都需要：類比電路負責把真實世界的訊號（聲音、光、溫度）轉成數位訊號，數位電路再處理這些 0 和 1。

## 設計流程

![[IC_verification_Concept.svg|從應用到晶圓：design 把規格變成 RTL / netlist，manufacture 把 netlist 做成晶圓；反方向的 verification 和 testing 確認每一步沒有做錯]]

一顆晶片大致會經過這些階段：

1. System specification
2. Architectural design
3. Functional design and logic design
4. Circuit design
5. Physical design（partitioning、floorplanning、placement、clock tree synthesis、routing、timing closure）
6. Physical verification and sign-off
7. Layout post-processing
8. Fabrication
9. Packaging and testing

ICLAB 涵蓋的是從 logic design 到 physical design 這一段；sign-off 之後更完整的後端流程，是研究所課程 ADDF（Advanced Digital Design Flow）的範圍，我在那門課的期末專題見 [ADDF 期末專題](/projects/physical-aware-backend-flow/)。

在這門課裡，實際要做的事情是：

1. 用 Verilog 描述電路（RTL）
2. **Synthesis**：用 EDA 工具把 RTL 轉成 gate-level netlist，見 [[ICLAB_Synthesis_blog|邏輯合成]]
3. **APR**（auto placement and routing）：把 netlist 擺放、繞線成 layout，見 [[ICLAB_APR_blog|APR 流程]]

每一次轉換之後都要確認功能沒有被改壞：

| 比對的兩邊 | 方法 |
| --- | --- |
| RTL ↔ 合成後的 netlist | LEC |
| 合成後的 netlist ↔ APR 後的 netlist | LEC |
| APR 後的 netlist ↔ layout | LVS |
| RTL ↔ ECO 之後的 netlist | LEC |

LEC 的細節見 [[ICLAB_LEC_blog|Logic Equivalence Checking]]。ECO（engineering change order）是在 layout 階段發現問題時，直接修改 netlist 和繞線、不重跑整個流程；改完一樣要用 LEC 確認功能和 RTL 一致。

## 數位 IC 的三種做法

- **Full custom**：每一個邏輯閘、每一條線都自己設計。效能最好，也最花時間。
- **Semi-custom**：常用的 macro 或 sub-circuit 自己設計好，之後重複使用。
- **Cell-based**：用 hardware description language 描述電路，EDA 工具用 standard cell 組出功能，再自動擺放繞線。ICLAB 走的就是這條路。

### Standard cell

AND、OR、XOR、flip-flop 這些基本元件用得非常頻繁，所以由別人先設計好、量測好特性，做成 standard cell library。合成工具從 library 裡挑 cell，組出複雜的電路。

Standard cell 有兩個常被提到的特性：

- **Cell height**：同一個 library 裡的 cell 高度相同，才能整齊地排在 placement row 上，共用上下兩條 power rail。
- **Threshold voltage**：同一種邏輯閘會有不同 $V_{th}$ 的版本。$V_{th}$ 低的比較快、但漏電比較多，$V_{th}$ 高的則相反。

## Static 與 dynamic analysis

| | Static analysis | Dynamic analysis |
| --- | --- | --- |
| 需要 input pattern 嗎 | 不需要 | 需要 |
| 分析的是 | worst case | average case |
| 通常用在 | timing、signal integrity | power |

Timing 要保證「任何輸入下都不會出錯」，所以用 static timing analysis 窮舉所有路徑的最壞情況；power 則跟訊號實際翻轉的頻率有關，要有真實的 input pattern 跑模擬才估得準。

後面每一個步驟都在看同樣三個數字：**area、timing、power**（PPA），它們彼此互相拉扯，設計就是在三者之間取捨。
