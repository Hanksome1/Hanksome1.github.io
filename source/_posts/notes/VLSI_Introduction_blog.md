---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Full-custom IC 的設計流程與 process corner
date: '2024-09-10'
updated: '2026-10-17 21:26:07'
tags:
  - VLSI
  - Full-custom
summary: 積體電路設計導論的開頭：full-custom IC 從 schematic、pre-sim、layout 到 DRC、LVS、PEX、post-sim 的流程，以及模擬時一定要跑的 process corner（TT、FF、SS、FS、SF）。
permalink: notes/vlsi-intro/
synced: obsidian
---

這門課用的是 full-custom 設計：每顆電晶體的尺寸、每條線怎麼走，都由設計者決定。ICLAB 則是寫 RTL，再交給工具合成和自動擺放繞線，屬於 cell-based flow，見 [[ICLAB_Intro_blog|數位 IC 的設計流程]]。課程總覽見 [[VLSI_blog|積體電路設計導論筆記總覽]]。

## Full-custom 的設計流程

| 步驟 | 做什麼 | 工具 |
| --- | --- | --- |
| 1. Schematic | 畫電路圖、決定每顆電晶體的 W/L，產生 netlist | Composer、Virtuoso，或直接用文字寫 netlist |
| 2. Pre-layout simulation | 只看電路本身，確認功能和時序 | HSPICE |
| 3. Layout | 把電晶體和導線畫成光罩上的多邊形 | Virtuoso、Laker |
| 4. DRC | Design rule check：layout 有沒有違反 foundry 訂的規則（最小寬度、間距等等） | Calibre |
| 5. LVS | Layout vs. schematic：layout 的連接方式和 schematic 是否一致 | Calibre |
| 6. PEX | Parasitic extraction：從 layout 抽出導線的寄生電阻和電容 | Calibre |
| 7. Post-layout simulation | 把抽出來的寄生 RC 加回 netlist，再模擬一次 | HSPICE |

Pre-sim 和 post-sim 的差別在寄生效應。Pre-sim 的導線是理想的，做完 layout 和 PEX 後，導線的電阻和電容才會加進模擬，延遲通常會變長。寄生 RC 的來源和估算見 [[VLSI_RC_blog|寄生電阻、電容與導線模型]]。

DRC 和 LVS 都要完全沒有錯誤才算 clean。DRC 檢查 layout 能不能做出來，LVS 檢查做出來的是不是設計的電路，兩者都要過。

期末專題照這套流程，從電晶體層級做了一顆 128 × 16 bit 的 contact ROM，見 [ROM macro 全客製化設計](/projects/rom-macro/)。

## Process corner

製程每次做出來都會有些差異，同一份設計的電晶體，threshold voltage 會在一個範圍內變動：$V_{th}$ 小的導通電流大、速度快，$V_{th}$ 大的比較慢。

- **T**（typical）：標準的 $V_{th}$
- **F**（fast）：$V_{th}$ 偏小
- **S**（slow）：$V_{th}$ 偏大

NMOS 和 PMOS 各自變動，所以 corner 用兩個字母表示，**第一個字母是 NMOS，第二個是 PMOS**。例如 FS 代表 NMOS 是 fast、PMOS 是 slow。

以 $V_{TN}$ 為橫軸、$\lvert V_{TP} \rvert$ 為縱軸，製程的範圍是一個方框，常用的五個 corner 是方框的四個角加上中心：

![[vlsi-process-corners.svg|Process corner：橫軸是 NMOS 的 threshold，縱軸是 PMOS 的 threshold 絕對值，越小越快。五個 corner 是製程範圍的四個角和中心，第一個字母是 NMOS、第二個是 PMOS]]


| Corner | NMOS | PMOS | 在方框上的位置 |
| --- | --- | --- | --- |
| TT | typical | typical | 中心 |
| FF | fast | fast | $V_{TN}$ 和 $\lvert V_{TP} \rvert$ 都最小 |
| SS | slow | slow | $V_{TN}$ 和 $\lvert V_{TP} \rvert$ 都最大 |
| FS | fast | slow | $V_{TN}$ 最小、$\lvert V_{TP} \rvert$ 最大 |
| SF | slow | fast | $V_{TN}$ 最大、$\lvert V_{TP} \rvert$ 最小 |

設計在每個 corner 都要符合規格，所以模擬至少要跑這五個 corner（實務上還會搭配不同的電壓和溫度）。FF 最快、SS 最慢；FS 和 SF 是 NMOS 和 PMOS 一強一弱，會讓反相器的切換點偏移，對 SRAM 這類看電晶體相對強弱的電路影響特別大，見 [[VLSI_inverter_blog|CMOS 反相器]] 和 [[VLSI_Memory_blog|記憶體電路]]。
