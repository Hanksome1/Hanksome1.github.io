---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 電子學（二）：類比積體電路筆記總覽
date: '2024-09-02'
updated: '2026-10-16 21:52:52'
tags:
  - AIC
  - MOC
summary: 清大 EE2260 電子學（二）的筆記入口：MOS 小訊號模型、單級放大器、頻率響應、電流鏡與 cascode、差動放大器、op amp、回授與穩定度，以及 HSPICE 設計作業。
permalink: notes/aic/
synced: obsidian
---

電子學（二）是清大電機系的 EE2260，黃柏鈞老師開課，我修的是 2024 年秋季那一學期。課名叫電子學，內容其實是類比積體電路設計（analog IC，所以我的筆記都叫 AIC）：從一顆 MOS 的小訊號模型出發，組出單級放大器、差動對、兩級 op amp，再用回授和補償讓它變得穩定、可預測。作業全部用 HSPICE 做，每一份都是給規格，尺寸和偏壓自己決定。前一門 [[Electronic_blog|電子學（一）]]已經講過 MOS、BJT 的小訊號模型、單級放大器和差動對，這門課從那裡接著往下。

同一學期我也修了[[VLSI_blog|積體電路設計導論]]，兩門課看電晶體的角度很不一樣。數位電路把 MOS 當開關，只在乎 gate 電壓讓它開或關；類比電路把它當水龍頭，在乎轉了幾圈、流出多少水，以及流量對 gate 電壓有多敏感（$g_m$）。

這些是我修課時寫給自己看的筆記，整理之後放上來。

## 第一堂課：不要當 SPICE monkey

類比電路做的事情大概有幾類：放大（amplification）、濾波（filtration）、供電（supply）、類比與數位之間的轉換（A/D、D/A），以及頻域和時域之間的轉換。要做這些，需要的能力是：

- 決定操作點（bias 電壓、電流）
- 小訊號分析、大訊號分析，以及非線性的行為
- 處理實際的問題：製程變異、溫度、雜訊、干擾
- 估成本

老師第一堂課就說，SPICE 只是一台計算機。在知道答案大概是多少之前，不應該去模擬；只會掃參數、看哪組數字過規格的人（他叫 SPICE monkey），永遠設計不出比現有電路更好的東西。後面每一份作業的規定也是這樣：沒有寫設計流程、直接掃尺寸的答案不給分。

## 課程內容

| 主題 | 內容 |
| --- | --- |
| MOS 元件 | 操作區、square law、小訊號模型、channel-length modulation、body effect |
| 單級放大器 | CS、CG、CD 三種接法，電阻、電流源、diode-connected 三種負載 |
| 頻率響應 | Bode plot、pole 與 zero、Miller 效應、各級的高頻響應 |
| 電流鏡與 cascode | 複製電流、拉高輸出阻抗、headroom |
| 差動放大器 | 共模與差模、半電路、CMRR、主動負載 |
| Op amp | virtual short、反相與非反相放大器、有限增益的誤差 |
| 回授 | 回授的好處、四種放大器、loading 與拆迴路 |
| 穩定度與補償 | phase margin、Miller 補償與 pole splitting |

成績是 HW1 到 HW4 各 12.5%（HW0 是熟悉 HSPICE 的暖身），期中考和期末考各 25%。

## 筆記

### 元件與單級電路

- [[AIC_MOS_blog|MOS 元件：操作區、小訊號模型與二階效應]]
- [[AIC_SingleStageAmp_blog|單級放大器：common source、common gate 與 source follower]]
- [[AIC_FrequencyResponse_blog|頻率響應：Bode plot、Miller 效應與單級放大器的 pole]]

### 多顆電晶體的電路

- [[AIC_CurrentMirror_Cascode_blog|電流鏡與 cascode：複製電流、拉高輸出阻抗]]
- [[AIC_Differential_Amp_blog|差動放大器：共模、差模與 CMRR]]
- [[AIC_opamp_blog|Op amp：virtual short、反相與非反相放大器]]

### 回授

- [[AIC_feedback_blog|回授：用增益換精準度、頻寬與阻抗]]
- [[AIC_Stability_blog|穩定度與補償：phase margin 與 Miller 補償]]

## 作業

每份作業都用 0.18 µm 製程的 model（`n_18`、`p_18`），$V_{DD}$ = 1.8 V。

- [[AIC_hw0_blog|HW0：用 HSPICE 量 MOS 的參數]]：$V_{th}$、$g_m$、$g_m r_o$、$f_T$ 怎麼隨通道長度變化，以及 body effect。
- [[AIC_hw1_blog|HW1：單級放大器設計]]：CS + active load、CG + 電阻負載、PMOS source follower。
- [[AIC_hw2_blog|HW2：差動放大器、電流鏡與 op amp 黑盒子]]：輸出擺幅、cascode 電流鏡當 tail、頻寬估算、有限 open-loop gain 的誤差。
- [[AIC_hw3_blog|HW3：Transimpedance amplifier 與回授]]：用 direct analysis 算 pole、zero，比較 open loop 和 closed loop。
- [[AIC_hw4_blog|HW4：兩級 op amp、local CMFB 與 Miller 補償]]：從第一級做到補償，加上共模回授迴路的分析。

## 整門課反覆出現的幾個觀念

- **增益 = 轉導 × 輸出阻抗。** CS 的 $g_m R_D$、active load 的 $g_m(r_{o1} \parallel r_{o2})$、cascode 的 $g_{m1} \cdot g_{m2} r_{o2} r_{o1}$，都是同一個式子。想要增益就想辦法把輸出阻抗拉高，代價是電壓 headroom。
- **從三個端點看進去的阻抗。** 看進 gate 是無限大，看進 source 大約是 $1/g_m$，看進 drain 是 $r_o$；source 下面接了電阻，看進 drain 的阻抗會被放大 $(1 + g_m R_S)$ 倍。單級放大器、cascode、回授的分析幾乎都在用這三件事。
- **每個節點都是一個 pole。** 節點看到的電阻乘上節點上的總電容，倒數就是那個 pole 的頻率。哪個節點的 RC 最大，誰就決定頻寬。
- **電路對稱就拆一半。** 差模輸入時中間的點是 virtual ground；共模輸入時把 tail 拆成兩個 $2R_{SS}$。差動對、CMRR、CMFB 都是這樣分析的。
- **回授是用增益換東西。** 閉迴路增益幾乎只由回授網路決定，輸入、輸出阻抗都往理想的方向推 $(1 + KA)$ 倍，頻寬也變寬；換來的代價是穩定度，要用 phase margin 檢查。
- **手算是起點，模擬是驗證。** 0.18 µm 的電晶體不太照 square law 走，作業裡用 square law 估出來的電流常常差很多。比較好的流程是：先用 square law 估尺寸，模擬一次，從 `.lis` 讀出真正的 $g_m$、$g_{ds}$、$V_{th}$，再用這些數字手算增益和 pole。用模擬抓出來的小訊號參數手算，誤差通常在幾 % 以內。
