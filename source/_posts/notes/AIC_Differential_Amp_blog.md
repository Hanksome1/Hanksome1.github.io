---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 差動放大器：共模、差模與 CMRR
date: '2024-10-15'
updated: '2026-10-16 15:34:23'
tags:
  - AIC
  - Amplifier
summary: 差動訊號為什麼比較不怕雜訊、tail current 在做什麼、差動對的大訊號轉移曲線，用半電路分析差模和共模增益，CMRR 怎麼提高，以及用電流鏡負載把差動訊號轉成單端輸出。
permalink: notes/aic-differential-pair/
synced: obsidian
---

單端訊號是拿一條線跟地比，差動訊號是拿兩條線互相比。很多雜訊（電源、基板的耦合）會同時出現在兩條線上，只看兩者的差，這些雜訊就抵消了。差動放大器就是只放大兩個輸入之差、對兩者共同變化不敏感的電路。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

代價是要多用電晶體，而且輸入必須是一對差動訊號，不是每個地方都拿得到。

## 共模與差模

兩個輸入可以拆成兩部分：

- **共模（common mode）**：兩邊一起上升或一起下降的部分，$V_{in,cm} = (V_{in1} + V_{in2})/2$。
- **差模（differential mode）**：兩邊往相反方向動的部分，$V_{in1} - V_{in2}$。

![[aic-diff-pair.svg|電阻負載的差動對，兩顆輸入管的 source 接在一起，由 tail current I_SS 供電。右邊是兩種輸入：共模時 P 點跟著輸入一起動；差模時 P 點不動，電流在兩邊之間重新分配]]

我們希望電路只對差模有反應。

## Tail current 在做什麼

如果兩顆輸入管的 source 直接接地，共模輸入一上升，兩邊的 $V_{GS}$ 都變大、電流都變大，輸出就跟著動了，等於對共模也有增益。

加上 tail current $I_{SS}$ 之後，兩邊電流的總和被固定住。共模輸入上升時，P 點（共同的 source）跟著上升，$V_{GS}$ 不變，兩邊的電流都還是 $I_{SS}/2$，輸出不動。差模輸入時，一邊的 $V_{GS}$ 變大、另一邊變小，P 點正好不動，電流在兩邊之間重新分配，輸出一邊上升一邊下降。

但這不代表共模輸入可以任意高或任意低（[[AIC_hw2_blog|HW2]] 的第一題）：

- **太低**：tail current 是用電晶體做的，它的 $V_{DS}$（也就是 P 點的電壓）至少要有 $V_{ov}$，否則掉進 triode，不再是電流源。所以 $V_{in,cm} \ge V_{GS1} + V_{ov,tail}$。
- **太高**：輸入管的 drain 被負載固定在 $V_{DD} - R_D I_{SS}/2$，共模輸入太高會讓輸入管的 $V_{DS}$ 不夠，掉進 triode。所以 $V_{in,cm} \le V_{DD} - R_D I_{SS}/2 + V_{TH}$。

## 大訊號特性

用 square law 解兩顆電晶體的電流，差模輸入 $\Delta V_{in} = V_{in1} - V_{in2}$ 時：

$$
I_{D1} - I_{D2} = \frac{1}{2}\mu_n C_{ox}\frac{W}{L}\Delta V_{in}\sqrt{\frac{4I_{SS}}{\mu_n C_{ox}W/L} - \Delta V_{in}^2}
$$

![[aic-diff-large-signal.svg|差動對的兩邊電流隨 ΔV_in 的變化。中間一段近似線性，斜率由 g_m 決定；ΔV_in 超過 √2 V_ov（V_ov 是平衡時的 overdrive），電流就全部流到一邊，另一顆電晶體關掉]]

$\Delta V_{in}$ 大到 $\sqrt{2I_{SS}/(\mu_n C_{ox}W/L)} = \sqrt{2}\,V_{ov}$ 時，所有電流都流到一邊，另一邊關掉，輸出就不再變了。平衡點附近是線性的，這段就是小訊號分析的範圍。

## 半電路分析

電路左右對稱時，可以只分析一半。

![[aic-diff-half-circuits.svg|中：把 tail 換成 I_SS 並聯 R_SS，再沿對稱軸拆成兩半，每一半是 I_SS/2 並聯 2R_SS。左：差模時 P 點是 virtual ground，半電路就是普通的 CS。右：共模時兩半各帶一顆 2R_SS，變成 CS 加 source degeneration]]

### 差模

差模輸入時，一邊上升多少、另一邊就下降多少，P 點的電壓不動，可以把它看成交流接地。這叫 virtual ground：它不是真的接地，也不一定是 0 V，只是一個不隨訊號變動的點。半電路就是一顆普通的 CS：

$$
A_{DM} = -g_m(R_D \parallel r_o)
$$

### 共模

共模輸入時，P 點跟著輸入一起動，不能當成接地。實際的 tail current 不是理想電流源，可以看成 $I_{SS}$ 並聯一顆電阻 $R_{SS}$（它的輸出阻抗）。沿對稱軸拆開，每一半分到 $I_{SS}/2$ 並聯 $2R_{SS}$，半電路變成 CS 加上 $2R_{SS}$ 的 source degeneration：

$$
A_{CM} = -\frac{R_D}{1/g_m + 2R_{SS}}
$$

$R_{SS}$ 越大，共模增益越小。理想電流源的 $R_{SS} = \infty$，共模增益是 0。

## CMRR

Common-mode rejection ratio 描述電路「只放大差模、不放大共模」的程度：

$$
\text{CMRR} = \left|\frac{A_{DM}}{A_{CM}}\right| \approx \frac{g_m R_D}{R_D/(1/g_m + 2R_{SS})} = 1 + 2g_m R_{SS}
$$

要提高 CMRR，$g_m$ 和 $R_{SS}$ 都要大。$R_{SS}$ 就是 tail current source 的輸出阻抗：

| Tail current | $R_{SS}$ |
| --- | --- |
| 理想電流源 | $\infty$ |
| 單顆電晶體的電流鏡 | $r_o$ |
| cascode 電流鏡 | $g_m r_o \cdot r_o$ |

用 [[AIC_CurrentMirror_Cascode_blog|cascode 電流鏡]]當 tail，CMRR 可以再大上 $g_m r_o$ 倍。

上面的 $A_{CM}$ 是看單邊輸出的共模增益。如果取兩邊的差當輸出、電路又完全對稱，共模輸入讓兩邊一起動，相減之後是 0。實際上 CMRR 被 mismatch 限制：兩邊的 $R_D$ 或 $g_m$ 不完全一樣時，共模輸入會漏成差動輸出。不管用哪種定義，$R_{SS}$ 越大都越好。

## 從差動轉成單端

很多時候後面的電路只吃單端訊號。可以再接一顆 op amp，也可以直接把負載換成電流鏡：

![[aic-diff-active-load.svg|電流鏡負載的差動對（five-transistor OTA）。M1 多流 Δi，M3 和 M4 把它複製到右邊；M2 同時少流 Δi，兩者的差 2Δi 全部流向輸出]]

差模輸入讓 M1 多流 $\Delta i$、M2 少流 $\Delta i$。M3 是 diode-connected，M4 把 M1 的電流（包含多出來的 $\Delta i$）複製到右邊。在輸出節點，M4 送進來的多了 $\Delta i$，M2 拉走的少了 $\Delta i$，差額 $2\Delta i$ 全部流向輸出，所以單端輸出也拿到了完整的差動訊號：

$$
A_v = g_{m1}(r_{o2} \parallel r_{o4})
$$

跟差動輸出、電流源負載的版本增益一樣，而且只要一個輸出端。這個結構也是兩級 op amp 的第一級（[[AIC_hw4_blog|HW4]]）。[[AIC_hw2_blog|HW2]] 的 diode-connected 負載版本則是另一種選擇：增益只有 $g_{m1}/g_{m3}$，但輸出共模電壓自己就定得住。
