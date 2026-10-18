---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 電子學（一）：電晶體與放大器筆記總覽
date: '2024-06-27'
updated: '2026-10-16 22:31:57'
tags:
  - Electronics
  - MOC
summary: 電子學（一）的筆記入口：MOSFET 與 BJT 的操作區和小訊號模型、偏壓、六種單級放大器、電流鏡與 cascode與差動放大器。
permalink: notes/electronics/
synced: obsidian
---

電子學（一）是我在 112 學年度下學期修的課。這裡的筆記從學期中開始：把 MOSFET 和 BJT 當成受控電流源，學會偏壓、畫小訊號模型，然後把一顆、兩顆、四顆電晶體組成放大器。下一門是 113 學年度上學期的 [[AIC_blog|電子學（二）]]，從這裡的單級放大器和差動對繼續往 op amp、頻率響應、回授走。

筆記裡的電路圖大多是我上課時在平板上畫的，另外補了幾張把觀念畫清楚的圖。這些都是我修課期間用 Obsidian 做的筆記，後來整理過後放到部落格上面。

## 筆記

### 元件

- [[Electronic_MOSFET_blog|MOSFET：操作區、square law 與小訊號模型]]
- [[Electronic_BJT_blog|BJT：active region 與小訊號模型]]
- [[Electronic_Bias_blog|偏壓：讓電晶體停在對的操作點]]

### 單級放大器

- [[Electronic_MOS_Amplifiers_blog|MOS 單級放大器：CS、CG 與 CD]]
- [[Electronic_BJT_Amplifiers_blog|BJT 單級放大器：CE、CB 與 CC]]

### 多顆電晶體

- [[Electronic_CurrentMirror_blog|電流鏡與 cascode：複製電流、拉高輸出阻抗]]
- [[Electronic_Differential_blog|差動放大器（一）：為什麼要差動，以及大訊號行為]]
- [[Electronic_Differential_SmallSignal_blog|差動放大器（二）：半電路、共模增益與 CMRR]]

## 整門課反覆出現的幾個觀念

- **電晶體是受控電流源。** MOS 在 saturation、BJT 在 active region 時，電流由控制端電壓決定（平方或指數），輸出端電壓只造成小小的誤差（$r_o$）。放大器做的事就是把電壓變化轉成電流變化（$g_m$），再讓電流流過一個阻抗變回電壓。
- **增益 = 轉導 × 輸出阻抗。** CS 的 $g_m R_D$、電流源負載的 $g_m (r_{o1} \parallel r_{o2})$、degeneration 的 $\frac{g_m}{1 + g_m R_S} R_D$，都是同一個式子。
- **從三個端點看進去的阻抗。** 看進 gate 是 $\infty$（base 是 $r_\pi$）；看進 source / emitter 大約是 $1/g_m$；看進 drain / collector 是 $r_o$，下面接了電阻還會被放大。單級放大器、電流鏡、cascode、差動對全部建立在這三件事上。

![[el-mos-impedances.svg|從 MOS 的三個端點看進去的阻抗：gate 無限大、source 約 1/g_m、drain 約 r_o（加了 R_S 之後放大成 g_m r_o R_S）]]

- **BJT 和 MOS 的差別幾乎都來自 base 電流。** 偏壓電路被 $I_B$ 拉偏、電流鏡被 $I_B$ 吃掉一點、看進 base 只有 $r_\pi$、cascode 的阻抗被 $r_\pi$ 卡住。換來的是同樣電流下比較大的 $g_m$。
- **對稱的電路拆一半。** 差模時中間的點是 virtual ground，差動對變成一顆 CS；共模時 tail 拆成兩個 $2 r_{os}$，變成一顆有 degeneration 的 CS。
- **先算電流，再算電壓。** 偏壓、電流鏡、差動對的大訊號分析都是這樣：電流由電流源或 tail 決定，電壓只是電流乘上電阻的結果。
