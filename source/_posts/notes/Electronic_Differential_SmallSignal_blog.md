---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 差動放大器（二）：半電路、共模增益與 CMRR
date: '2024-06-04'
updated: '2026-10-16 21:52:14'
tags:
  - Electronics
  - Amplifier
summary: 差動對的小訊號分析：差模時中間的點是 virtual ground、共模時 tail 拆成兩半，用半電路算出差模增益、共模增益和 CMRR；再看 diode-connected 負載、電流鏡負載（差動轉單端）和用電流鏡偏壓的完整差動放大器，以及差動對為什麼要花兩倍功耗。
permalink: notes/electronics-diff-small-signal/
synced: obsidian
---

[[Electronic_Differential_blog|差動放大器（一）]]看的是大訊號：電流怎麼在兩邊之間分配、輸入能擺多大。這一篇在操作點附近線性化，算增益。課程總覽見[[Electronic_blog|電子學（一）筆記總覽]]。

## 差模：virtual ground

![[Pasted image 20240604102437.png|BJT 差動對的小訊號模型。兩邊電流一增一減，在 P 點的變化剛好抵消，所以 P 是 virtual ground]]

差模輸入時，一邊的電流增加 $\Delta i$，另一邊減少 $\Delta i$。兩股變化在兩顆電晶體共用的那個點（P）剛好抵消，P 的電壓不動，在小訊號下可以直接當成接地，叫做 virtual ground。

P 接地之後，每一邊都只是一顆普通的 common emitter（或 common source），可以只分析一半：

![[aic-diff-half-circuits.svg|左：差模半電路，P 是交流接地，就是一顆 CS。中：利用對稱，把 tail 拆成兩半，每一半的電阻變成兩倍。右：共模半電路，就是一顆 source 下面接了 2R_SS 的 CS（degeneration）]]

差模增益（雙端輸出，$v_{out} = v_{out1} - v_{out2}$，$v_{id} = v_{in1} - v_{in2}$）：

$$
A_{dm} = \frac{v_{out}}{v_{id}} = -g_m (R_D \parallel r_o)
$$

雖然每一邊只拿到 $v_{id}/2$ 的輸入，但輸出也是兩邊相減、變成兩倍，所以增益和單顆 CS 一樣。BJT 版本把 $R_D$ 換成 $R_C$。

- 輸入阻抗：MOS 是 $\infty$；BJT 從一個輸入經過兩個 $r_\pi$ 到另一個輸入，是 $2 r_\pi$。
- 輸出阻抗（兩個輸出之間）：$2(R_D \parallel r_o)$。

## 共模：tail 不再是接地

![[Pasted image 20240604103320.png|共模半電路。理想的 tail 電流源（I_s 固定），V_o 完全不會變，A_v = 0；實際的 tail 有輸出電阻 r_os，A_v = −R_D / (1/g_m + 2r_os)]]

共模輸入時，兩邊的電流同方向變化，P 點會跟著動，不是 virtual ground，所以 **tail 那顆電晶體必須列入考量**。

- 如果 tail 是理想電流源，電流固定是 $I_{SS}$，兩邊各 $I_{SS}/2$，輸入怎麼變都改變不了電流，輸出完全不動：$A_{cm} = 0$。
- 實際的 tail 是一顆電晶體，有輸出電阻 $r_{os}$。把它拆成兩個並聯的 $2 r_{os}$，每一邊就是一顆 source 下面接 $2 r_{os}$ 的 CS（degeneration）：

$$
A_{cm} = -\frac{R_D}{\frac{1}{g_m} + 2 r_{os}}
$$

$r_{os}$ 越大，共模增益越小。

## CMRR

Common-mode rejection ratio 衡量差動對多會「挑」訊號：

$$
\text{CMRR} = \left| \frac{A_{dm}}{A_{cm}} \right|
$$

代入上面兩個結果（忽略輸入電晶體的 $r_o$）：

$$
\text{CMRR} = g_m R_D \cdot \frac{\frac{1}{g_m} + 2 r_{os}}{R_D} = 1 + 2 g_m r_{os}
$$

$R_D$ 消掉了，CMRR 只看 tail 有多接近理想電流源。想要 CMRR 高，就把 tail 的輸出阻抗做大，例如用 [[Electronic_CurrentMirror_blog#2. Cascode|cascode]] 當 tail。

實際上兩邊不可能完全匹配，不匹配會讓一部分共模訊號直接轉成差模輸出，這個效應通常比上面算的 $A_{cm}$ 更限制 CMRR。

## Diode-connected 負載

![[Pasted image 20240604105323.png|差動對配 diode-connected 的 PMOS 負載。右邊是兩個半電路：差模時只要考慮輸入管和負載兩顆；共模時連 tail 的 M_s 也要算進來]]

把 $R_D$ 換成 diode-connected 的 PMOS（每一邊是一顆 $\frac{1}{g_{m3}} \parallel r_{o3}$ 的電阻）。半電路的分法和上面一樣：

- **差模：** P 是 virtual ground，半電路只有輸入管 $M_1$ 和負載 $M_3$ 兩顆：

$$
A_{dm} = -g_{m1} \left( \frac{1}{g_{m3}} \parallel r_{o3} \parallel r_{o1} \right) \approx -\frac{g_{m1}}{g_{m3}}
$$

- **共模：** P 不是接地，三顆都要算，tail 拆成 $2 r_{os}$：

$$
A_{cm} = -\frac{\frac{1}{g_{m3}} \parallel r_{o3}}{\frac{1}{g_{m1}} + 2 r_{os}}
$$

## 電流鏡負載：差動轉單端

![[Pasted image 20240604105400.png|差動對配電流鏡負載。M_1 多出來的 +ΔI 經過 M_3、M_4 鏡射到右邊，M_2 少了 ΔI；兩者在輸出節點相加，用 KCL 得到 2ΔI 流進輸出]]

很多時候下一級只要一個單端訊號。把負載換成電流鏡（$M_3$ diode-connected，$M_4$ 複製它的電流），就能在不浪費一半訊號的情況下轉成單端：

1. 差模輸入讓 $M_1$ 多流 $\Delta I$、$M_2$ 少流 $\Delta I$。
2. $M_1$ 的電流流過 $M_3$，被 $M_4$ 鏡射到右邊，所以 $M_4$ 也多推了 $\Delta I$。
3. 在輸出節點用 KCL：$M_4$ 多推 $\Delta I$，$M_2$ 少拉 $\Delta I$，總共有 $2\Delta I$ 流進輸出節點。

輸出電壓是這 $2\Delta I$ 乘上輸出節點看到的阻抗 $r_{o2} \parallel r_{o4}$，所以

$$
A_v = \frac{v_{out}}{v_{id}} = g_{m1} (r_{o2} \parallel r_{o4})
$$

只拿一邊的輸出，增益卻和雙端輸出一樣，因為左邊那一半的訊號被電流鏡搬過來了。電子學（二）的 [[AIC_Differential_Amp_blog|差動放大器]] 有這個電路更仔細的分析，包括它的共模增益。

## 完整的差動放大器

![[Pasted image 20240604104315.png|一顆完整的差動放大器：左邊的 I_ref 經過 NMOS 電流鏡（綠色）產生 tail 電流，再經過 PMOS 電流鏡（藍色）當兩邊的負載，每一邊流 I_SS/2]]

實際的電路裡，tail 和負載都由同一個參考電流 $I_{ref}$ 經過電流鏡複製而來：NMOS 電流鏡提供 tail 的 $I_{SS}$，PMOS 電流鏡提供兩邊的負載電流。整個放大器只需要一個精準的參考電流（見 [[Electronic_CurrentMirror_blog|電流鏡]]）。

## 差動對的功耗

要和一顆 CS 得到一樣的增益，MOS 差動對必須消耗兩倍的電流。原因是差動對的每一邊只分到 $I_{SS}/2$，而半電路的增益 $g_m R_D$ 裡的 $g_m$ 是由這一半的電流決定的。要讓每一邊的 $g_m$ 和電流 $I$ 的 CS 一樣，每一邊都要流 $I$，總共 $2I$。BJT 差動對也有一樣的取捨。這是差動結構換來抗雜訊和兩倍擺幅的代價。
