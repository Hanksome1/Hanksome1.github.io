---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: AIC HW1：單級放大器設計
date: '2024-09-21'
updated: '2026-10-16 15:38:28'
tags:
  - AIC
  - HSPICE
  - Amplifier
summary: 用 HSPICE 設計三種單級放大器：CS + active load（增益 131）、CG + 60 kΩ 電阻負載（增益 18.07）、PMOS source follower（增益 0.954）。從試驗用的 .op 反推 μC_ox 和 λ，手算尺寸，再看 square law 在 V_ov 只有幾十 mV 時錯得多離譜。
permalink: notes/aic-hw1/
synced: obsidian
---

第一份正式的設計作業，三題各對應一種[[AIC_SingleStageAmp_blog|單級放大器]]。共同條件：$V_{DD}$ = 1.8 V、25°C、TT corner，所有電晶體都要在 saturation，而且不能只掃尺寸找答案，要寫出設計流程。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

![[aic-hw1-circuits.svg|三題的電路和最後的尺寸（W / L，單位 µm）。左：CS，PMOS 當電流源負載。中：CG，訊號從 source 進，負載是 60 kΩ。右：PMOS source follower，body 接到自己的 source]]

三題的做法都一樣：

1. 先隨便帶一組尺寸跑 `.op`，從 `.lis` 讀出 $\beta = \mu C_{ox}W/L$、$g_{ds}$、$V_{th}$，反推 $\mu C_{ox}$ 和 $\lambda = g_{ds}/I_D$。
2. 用這些參數和 square law 算出尺寸、偏壓。
3. 代回去模擬，看哪裡偏了再調整。

## Part 1：CS + active load

| 項目 | 規格 | 模擬 | 手算 |
| --- | --- | --- | --- |
| $V_{in}$ | — | 0.4 V | 0.4 V |
| $V_b$ | — | 1.3 V | 1.3 V |
| $V_o$（DC） | 0.8 V ± 10 mV | 0.803 V | 0.6 V |
| $I_{b1}$ | < 15 µA | 3.50 µA | 2.30 µA |
| $\|A_1\|$ | > 60 | 131.5 | 131.6 |
| M1n（W/L） | — | 10 µm / 3 µm | — |
| M1p（W/L） | — | 79.6 µm / 3 µm | — |

### 讀參數

試驗尺寸 NMOS 10/3、PMOS 40/3，$V_b$ = 1.25 V、$V_{in}$ = 0.4 V：

| | $\beta$ | $g_{ds}$ | $V_{th}$ | 推得 |
| --- | --- | --- | --- | --- |
| NMOS | 1.008 mA/V² | 343.7 nS | 338 mV | $\mu_n C_{ox}$ = 302 µA/V²，$\lambda_n$ = 0.115 |
| PMOS | 989 µA/V² | 50.9 nS | −476 mV | $\mu_p C_{ox}$ = 74 µA/V²，$\lambda_p$ = 0.017 |

（兩顆的 $I_D$ 都是 2.99 µA。）

### 增益

$$
A_v = g_m(r_{o1} \parallel r_{o2}) = \frac{2I_D}{V_{ov}}\left(\frac{1}{\lambda_n I_D} \parallel \frac{1}{\lambda_p I_D}\right) = \frac{2}{V_{ov}}\left(\frac{1}{\lambda_n} \parallel \frac{1}{\lambda_p}\right)
$$

電流在式子裡消掉了，增益只看 $V_{ov}$ 和 $\lambda$：

- $\lambda$ 要小 → L 要長，選 3 µm。
- $V_{ov}$ 要小 → $V_{in}$ 只比 $V_{th,n}$（0.338 V）高一點，選 0.4 V；PMOS 那邊 $V_b$ 也讓 $|V_{ov,p}|$ 很小，選 1.3 V。

### 輸出偏壓

$V_o$ 由兩顆電晶體「誰比較強」決定，所以讓兩邊的電流在 $V_o$ = 0.8 V 時相等（$V_{DS,n}$ = 0.8 V、$V_{SD,p}$ = 1 V）：

$$
\frac{1}{2}\mu_n C_{ox}\left(\frac{W}{L}\right)_n V_{ov,n}^2(1 + \lambda_n V_{DS,n}) = \frac{1}{2}\mu_p C_{ox}\left(\frac{W}{L}\right)_p V_{ov,p}^2(1 + \lambda_p V_{SD,p})
$$

代入 $V_{ov,n} \approx 0.062$ V、$V_{ov,p} \approx 0.025$ V，得到 $(W/L)_p \approx 26.9\,(W/L)_n$。

代回去模擬之後，$V_{th}$ 跟著尺寸變了，而 $V_{ov}$ 本來就只有幾十 mV，$V_{th}$ 差 0.03 V 在比例上就很大，$V_o$ 跑掉了。調整的方向是：$V_o$ 太高，代表 PMOS 太強，就把 PMOS 縮小一點。最後 NMOS 用 10 µm / 3 µm，PMOS 從 80.7 µm 一路微調到 79.6 µm，$V_o$ 落在 0.803 V。

### 結果

![[Pasted image 20241005110405 1.png|Part 1 的 DC sweep：V_out 對 V_in（0 到 1.8 V）。V_in 在 0.4 V 附近，V_out 幾乎垂直地從 1.8 V 掉到接近 0，這段陡峭的斜率就是 131 倍的增益]]

`.tf` 的結果：增益 −131.5，輸入阻抗 $10^{20}$ Ω（看進 gate），輸出阻抗 2.227 MΩ。用 `.op` 讀到的 $g_m$ = 59 µS、$r_{on}$ = 16.89 MΩ、$r_{op}$ = 2.56 MΩ 手算：

$$
A_v = 59\ \mu\text{S}\times(16.89\ \text{M}\parallel 2.56\ \text{M}) \approx 131.6
$$

跟模擬幾乎一樣。但用 square law 算的電流（2.30 µA）和 $V_o$（0.6 V）都差很多，原因在下一題會看得更清楚。

## Part 2：CG + 電阻負載

| 項目 | 規格 | 模擬 | 手算 |
| --- | --- | --- | --- |
| $V_{in}$（DC） | 0.4 V | 0.4 V | 0.4 V |
| $V_{b2}$ | — | 0.8 V | 0.8 V |
| $I_{b2}$ | < 20 µA | 19.13 µA | 1.94 µA（見下面） |
| $\|A_2\|$ | > 18 | 18.07 | 17.84 |
| M2n（W/L） | — | 40 µm / 1 µm | — |

試驗尺寸 30/3、$V_b$ = 0.8 V：$\mu_n C_{ox}$ = 301 µA/V²，$\lambda$ = 0.111，$V_{th}$ = 0.334 V。

增益是 $g_m(r_o \parallel R)$，R = 60 kΩ。L 夠長時 $r_o$ 有好幾百 kΩ，遠大於 R，先忽略：

$$
A_v \approx g_m R = \mu_n C_{ox}\frac{W}{L}V_{ov}\cdot 60\ \text{k} > 18
\quad\Rightarrow\quad
\frac{W}{L}V_{ov} \approx 1
$$

$V_{in}$ 的 DC 固定在 0.4 V，偏壓電壓的最小單位是 0.1 V，選 $V_{GS}$ = 0.4 V（$V_{b2}$ = 0.8 V）。重新模擬後 $V_{th}$ 變成 0.382 V，$V_{ov}$ 只剩 0.018 V，照上式 W/L 要 55 左右；但 50 µm / 1 µm 的電流已經超過 20 µA，最後選 40 µm / 1 µm。

`.tf`：增益 18.07，輸入阻抗 3.19 kΩ（約 $1/g_m$），輸出阻抗 45.76 kΩ。用 `.op` 的 $g_m$ = 389.8 µS 和 $r_o$ = 193 kΩ 手算：

$$
A_v = 389.8\ \mu\text{S}\times(193\ \text{k}\parallel 60\ \text{k}) = 17.84
$$

### 回頭看：square law 差了 10 倍

照 square law，$\beta$ = 12.4 mA/V²、$V_{ov}$ = 17.5 mV 時的電流應該是

$$
I_D = \frac{1}{2}\beta V_{ov}^2(1 + \lambda V_{DS}) = \frac{1}{2}\times 12.4\ \text{m}\times(0.0175)^2\times 1.03 \approx 1.94\ \mu\text{A}
$$

模擬卻是 19.1 µA，差了 10 倍。再看 $g_m/I_D$：square law 預測 $2/V_{ov} \approx 114\ \text{V}^{-1}$，模擬是 $389.8/19.13 \approx 20\ \text{V}^{-1}$。MOS 的 $g_m/I_D$ 有上限，大約是 $1/(nV_T) \approx 25$ 到 30 V⁻¹（subthreshold 時達到），114 根本不可能。

$V_{ov}$ 只有十幾 mV 時，電晶體其實在 weak / moderate inversion，電流有很大一部分是 subthreshold 的擴散電流，square law 不適用。Part 1 的 $V_{ov}$ 也只有幾十 mV，所以電流和 $V_o$ 都算不準。好在增益是用 `.op` 讀到的 $g_m$、$r_o$ 算的，這兩個是模擬器在真正的偏壓點上算出來的，所以手算的增益一直都很準。

## Part 3：PMOS source follower

| 項目 | 規格 | 模擬 | 手算 |
| --- | --- | --- | --- |
| $V_{in}$ | — | 0.1 V | 0.1 V |
| $I_{b3}$ | < 15 µA | 11.83 µA | 11.5 µA |
| $\|A_3\|$ | > 0.95 | 0.954 | 0.989 |
| M3p（W/L） | — | 86.7 µm / 1 µm | — |

**Body 接哪裡。** Body 接 source，避免 body effect。如果接 $V_{DD}$，$V_{SB}$ 會隨輸出電壓變動，$|V_{th}|$ 跟著變，增益下降。[[AIC_hw0_blog|HW0]] 量過這個效應。

**增益。**

$$
A_v = \frac{g_m(r_o \parallel R)}{1 + g_m(r_o \parallel R)} > 0.95
\quad\Rightarrow\quad
g_m(r_o \parallel R) > 19
$$

R = 100 kΩ，$r_o$ 有好幾 MΩ，先忽略它：$g_m > 190$ µS。L 選 1 µm 讓 $r_o$ 夠大。

**偏壓。** PMOS 的 source 就是輸出，$V_o = V_{DD} - I_{b3}R$；要讓 PMOS 導通，$V_o - V_{in}$ 要大於 $|V_{th,p}|$（約 0.49 V）。$V_{in}$ 選 0.1 V（0 V 時增益不好量），電流選 11.5 µA，$V_o$ = 1.8 − 1.15 = 0.65 V，$|V_{GS}|$ = 0.55 V，剛好比 $|V_{th}|$ 大一點。再用 square law 估 W/L，模擬後定在 86.7 µm / 1 µm。

`.tf`：增益 0.954，輸出阻抗 4.28 kΩ。

## 整理

| | 增益（規格） | 電流 | 關鍵的設計選擇 |
| --- | --- | --- | --- |
| CS + active load | 131.5（> 60） | 3.50 µA | L 長、$V_{ov}$ 小；$V_o$ 靠 PMOS 的寬度微調 |
| CG + 60 kΩ | 18.07（> 18） | 19.13 µA | $g_m R > 18$，W/L 被電流上限卡住 |
| PMOS source follower | 0.954（> 0.95） | 11.83 µA | body 接 source；$V_o$ 要比 $V_{in}$ 高一個 $|V_{GS}|$ |
