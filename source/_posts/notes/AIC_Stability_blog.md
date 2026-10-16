---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 穩定度與補償：phase margin 與 Miller 補償
date: '2024-11-28'
updated: '2026-10-16 15:36:56'
tags:
  - AIC
  - Feedback
  - Frequency Response
summary: 回授電路為什麼會振盪：每個 pole 帶來的相位延遲、Barkhausen 條件、gain crossover 與 phase crossover，phase margin 要留多少，以及用 dominant pole 補償和 Miller 補償（pole splitting）換回穩定度。
permalink: notes/aic-stability/
synced: obsidian
---

[[AIC_feedback_blog|回授]]用增益換來了精準度、頻寬和理想的阻抗，代價是穩定度：負回授在高頻可能變成正回授，電路就振盪了。這篇整理怎麼判斷一個迴路穩不穩，以及不穩時怎麼補救。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

## 為什麼會振盪

Closed-loop gain 是 $\dfrac{A}{1 + \beta A}$。如果在某個頻率 $\omega_1$，loop gain $\beta A(j\omega_1) = -1$，分母變成 0，電路不需要輸入也能自己維持輸出，這就是振盪。拆成大小和相位，就是 Barkhausen 條件：

$$
|\beta A(j\omega_1)| = 1, \qquad \angle\beta A(j\omega_1) = -180°
$$

直覺上：負回授是「輸出被減回輸入」。如果迴路在某個頻率多轉了 180° 的相位，減回去的訊號正好跟輸入同相，減變成加；這時 loop gain 還大於 1，訊號每繞一圈就被放大一次，越來越大。

相位延遲來自 pole：每個 pole 最多貢獻 −90°（在它的轉折頻率上是 −45°）。

- 只有一個 pole：最多 −90°，永遠不會振盪。
- 兩個 pole：要到頻率無限大才接近 −180°，理論上不會振盪，但 phase margin 可能很小。
- 三個以上：在有限的頻率就會到 −180°，如果那時候 loop gain 還大於 1，就會振盪。

## 判斷穩定度

兩個頻率：

- **Gain crossover $\omega_{GX}$**：loop gain 的大小掉到 1（0 dB）的頻率。
- **Phase crossover $\omega_{PX}$**：loop gain 的相位轉到 −180° 的頻率。

穩定的條件是增益先掉到 1，相位才轉到 −180°：

$$
\omega_{GX} < \omega_{PX}
$$

![[aic-stability-bode.svg|一個三 pole 迴路的 loop gain。增益在 ω_GX 掉到 0 dB 時，相位還離 −180° 有 48°，這就是 phase margin；相位在 ω_PX 轉到 −180° 時，增益已經低於 0 dB，差距是 gain margin]]

### 例子：三級相同的 CS 接成迴路

三顆一模一樣的 CS 串起來、首尾相接，每一級增益 $g_m R_D$，每個節點有一顆 $C$，三個 pole 都在 $\omega_p = 1/(R_D C)$：

$$
\beta A(s) = \frac{(g_m R_D)^3}{(1 + s/\omega_p)^3}
$$

每個 pole 貢獻 −60° 的時候總共 −180°，也就是 $\omega_{PX} = \sqrt{3}\,\omega_p$。在這個頻率，每一級的大小剩 $1/|1 + j\sqrt{3}| = 1/2$，loop gain 是 $(g_m R_D)^3/8$。所以只要 $g_m R_D > 2$，這個迴路就會振盪（這就是 ring oscillator）。

## Phase margin

穩定還不夠，還要穩得「舒服」。Phase margin 是在 $\omega_{GX}$ 時，相位離 −180° 還有多遠：

$$
\text{PM} = 180° + \angle\beta A(j\omega_{GX})
$$

Phase margin 越大越穩定。太小的話，電路雖然不會振盪，但 step response 會有很大的 overshoot 和 ringing：

![[aic-pm-step.svg|兩個 pole 的迴路接成 unity-gain buffer，phase margin 不同時的 step response。45° 時 overshoot 約 16%，60° 時約 6%，76° 時幾乎沒有 overshoot]]

一般會希望 phase margin 在 60° 左右，[[AIC_hw4_blog|HW4]] 的規格是大於 45°。

### 第二個 pole 要擺多遠

只有兩個 pole、而且第一個 pole 遠低於 $\omega_{GX}$ 時，第一個 pole 已經貢獻滿 −90°，phase margin 只看第二個 pole：

$$
\text{PM} \approx 90° - \tan^{-1}\frac{\omega_{GX}}{\omega_{p2}}
$$

| $\omega_{p2}/\omega_{GX}$ | Phase margin |
| --- | --- |
| 1 | 45° |
| 1.7 | 60° |
| 3 | 72° |

這就是「第二個 pole 要在 unity-gain frequency 的 3 倍以外」這條經驗法則的來源。換句話說，在 loop gain 大於 1 的頻段裡，只能有一個 pole。

## 補償

補償就是用頻寬換穩定度：讓 loop gain 在第二個 pole 出現之前就掉到 1。

### Dominant pole 補償

在頻率最低的那個 pole 的節點加一顆大電容，把它往更低的頻率推，讓增益提早掉到 1。簡單，但頻寬犧牲很多，電容也很大。

### Miller 補償

兩級放大器常用的方法：在第二級（反相的 CS）的輸入和輸出之間跨一顆電容 $C_c$。

![[aic-miller-compensation.svg|兩級放大器的小訊號模型，C_c 跨在第二級兩端。補償之後，第一個 pole 被 Miller 效應往低頻推，第二個 pole 被推往高頻，兩者分開（pole splitting），另外多了一個右半平面的 zero]]

對兩個節點寫 KCL，可以解出轉移函數：

$$
\frac{v_{out}}{v_{in}} = \frac{-g_{m1}g_{m2}R_1R_2\,(1 - sC_c/g_{m2})}{1 + s\left[(C_2 + C_c)R_2 + (C_1 + C_c)R_1 + g_{m2}R_1R_2C_c\right] + s^2R_1R_2(C_1C_2 + C_1C_c + C_2C_c)}
$$

用 [[AIC_FrequencyResponse_blog|dominant pole 近似]]，假設 $g_{m2}R_1R_2C_c$ 那一項最大：

$$
\omega_{p1} \approx \frac{1}{g_{m2}R_2R_1C_c}, \qquad
\omega_{p2} \approx \frac{g_{m2}C_c}{C_1C_2 + C_1C_c + C_2C_c} \approx \frac{g_{m2}}{C_1 + C_2}, \qquad
\omega_u \approx \frac{g_{m1}}{C_c}
$$

兩個 pole 往相反方向移動，叫做 pole splitting：

- **第一個 pole 往低頻**：從第一級的輸出看，$C_c$ 被第二級的增益 $g_{m2}R_2$ 放大（[[AIC_FrequencyResponse_blog|Miller 效應]]），等效成一顆很大的電容。
- **第二個 pole 往高頻**：高頻時 $C_c$ 接近短路，第二級變成一顆 diode-connected 的電晶體，輸出節點看到的電阻從 $R_2$ 掉到大約 $1/g_{m2}$。

Unity-gain frequency 是 $A_0\omega_{p1} = g_{m1}/C_c$，只由第一級的 $g_m$ 和 $C_c$ 決定。$C_c$ 越大，$\omega_u$ 越低、$\omega_{p2}$ 越高，phase margin 越好，但頻寬越小。

### 右半平面的 zero

$C_c$ 也提供一條從輸入直通輸出的前饋路徑，在 $\omega_z = g_{m2}/C_c$ 產生一個 zero，而且在右半平面：

$$
H(s) = 1 - \frac{s}{\omega_z} \quad\Rightarrow\quad \angle H(j\omega) = -\tan^{-1}\frac{\omega}{\omega_z}
$$

它讓增益往上升（像一般的 zero），相位卻往下掉（像一個 pole），兩頭都對穩定度不利。所以設計時除了第二個 pole，這個 zero 也要擺在 $\omega_u$ 的幾倍以外。常見的解法是在 $C_c$ 上串一顆電阻把 zero 移走，這門課沒有做到這一步。

[[AIC_hw4_blog|HW4]] 用這些公式設計 $C_c$：頻寬的規格給了 $C_c$ 的上限，phase margin 的規格（$\omega_{p2} > 3\omega_u$）給了下限，最後選 0.315 pF，模擬的 phase margin 是 65.9°。
