---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: AIC HW3：Transimpedance amplifier 與回授
date: '2024-11-15'
updated: '2026-10-16 21:33:50'
tags:
  - AIC
  - HSPICE
  - Feedback
summary: 用 CMOS 反相器做 transimpedance amplifier：畫小訊號模型、用 direct analysis 推出轉移函數和 pole、zero，設計到 1.82 MΩ 的增益；再加上 50 kΩ 的回授電阻，看輸入、輸出阻抗和頻寬怎麼變，以及為什麼簡化的回授公式會差到一半。
permalink: notes/aic-hw3/
synced: obsidian
---

Transimpedance amplifier（TIA）把電流轉成電壓，常用在光偵測器後面。這份作業用最簡單的結構：一顆 CMOS 反相器，輸入端是電流源 $I_{in}$ 並聯 50 kΩ 的源阻抗 $R_S$，輸出掛 50 nF 的負載 $C_L$。先做 open loop，再加上回授電阻 $R_F$。對應的課程內容是[[AIC_FrequencyResponse_blog|頻率響應]]和[[AIC_feedback_blog|回授]]。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

![[aic-hw3-tia.svg|左：open-loop TIA，NMOS 和 PMOS 的 gate 接在一起成為輸入節點 X，drain 接在一起成為輸出。右：closed-loop TIA，多了一顆 R_F 從輸出接回 X。尺寸是最後的設計（W / L，單位 µm）]]

## Part 1：open-loop TIA

### 小訊號模型

先把兩顆電晶體的小訊號模型和所有寄生電容都畫出來：

![[2024-11-21_20-29_1 1.jpeg|我畫的完整小訊號模型：上面是 PMOS（g_mp、r_op），下面是 NMOS（g_mn、r_on），藍色是各自的寄生電容，輸出掛 50 nF 的 C_L（圖上的 R_S 應為 50 kΩ）]]

兩顆電晶體的 gate 接在同一個節點、drain 也接在同一個節點，小訊號的電壓都一樣，可以合併成一顆：

![[Pasted image 20241122001922 1.png|合併後的模型。輸入節點 X 上有 I_in、R_S 和 C_G；輸出節點 Y 上有 G_m v、R_out、C_D 和 C_L；C_GD 跨在兩個節點之間]]

- $G_m = g_{mn} + g_{mp}$
- $R_{out} = r_{on} \parallel r_{op}$
- $C_G = C_{GSn} + C_{GBn} + C_{GSp} + C_{GBp}$
- $C_D = C_{DSn} + C_{DBn} + C_{DSp} + C_{DBp}$
- $C_{GD} = C_{GDn} + C_{GDp}$

### Direct analysis

對兩個節點寫 KCL：

$$
\text{X：}\quad I_{in} = \frac{V_x}{R_S} + sC_G V_x + sC_{GD}(V_x - V_{out})
$$

$$
\text{輸出：}\quad sC_{GD}(V_x - V_{out}) = G_m V_x + \frac{V_{out}}{R_{out}} + s(C_D + C_L)V_{out}
$$

把第二式代進第一式，$C_{GD}$ 那一項消掉：

$$
I_{in} = V_x\left(\frac{1}{R_S} + sC_G + G_m\right) + V_{out}\left(\frac{1}{R_{out}} + s(C_D + C_L)\right)
$$

再用第二式把 $V_x$ 換成 $V_{out}$，整理得到

$$
\frac{V_{out}}{I_{in}} = \frac{-G_m R_S R_{out}\,(1 - sC_{GD}/G_m)}{1 + bs + as^2}
$$

$$
b = R_{out}(C_{GD} + C_D + C_L) + G_m C_{GD} R_{out} R_S + R_S(C_G + C_{GD})
$$

$$
a = R_S R_{out}\left[C_G(C_D + C_L) + C_G C_{GD} + C_{GD}(C_D + C_L)\right]
$$

用 [[AIC_FrequencyResponse_blog|dominant pole 近似]]：

$$
\omega_{p1} \approx \frac{1}{b}, \qquad \omega_{p2} \approx \frac{b}{a}, \qquad \omega_z = \frac{G_m}{C_{GD}}\ (\text{右半平面})
$$

DC 增益是 $-G_m R_S R_{out}$。$C_L$ = 50 nF 比所有寄生電容大好幾個數量級，$b$ 幾乎就是 $R_{out}C_L$，所以 −3 dB 頻寬

$$
\omega_{-3dB} \approx \frac{1}{(r_{on} \parallel r_{op})C_L}
$$

### 設計

規格：$V_{DD}$ 電流 < 275 µA，DC 增益 > 1.7 MΩ，頻寬 > 150 Hz。

1. **頻寬** → $R_{out} < 1/(2\pi\cdot 150\cdot 50\text{n}) \approx 21.2$ kΩ。$R_{out} = \frac{1}{I_D}\left(\frac{1}{\lambda_n} \parallel \frac{1}{\lambda_p}\right)$，L = 1.5 µm 時 $\lambda_n \approx 0.2$、$\lambda_p \approx 0.02$，並聯起來約 4.55 V，所以 $I_D > 216$ µA。
2. **增益** → $G_m R_{out} R_S > 1.7$ MΩ，即 $G_m R_{out} > 34$。
3. **電流上限** 275 µA。所以電流的範圍是 216 到 275 µA，很窄。
4. **偏壓**：讓 $V_x$ = 0.8 V，NMOS（$V_{th}$ = 0.36 V）和 PMOS（$|V_{th}|$ = 0.49 V）的 overdrive 差不多。$V_x$ 由 $I_{in}$ 流過 $R_S$ 決定，所以 $I_{in}$ = 0.8 V / 50 kΩ = 16 µA。
5. **尺寸**：電流範圍換成 W/L 的範圍，NMOS 大約 7.8 < W/L < 10，選上限附近的 15 µm / 1.5 µm。PMOS 先設成 NMOS 的 3 倍（$\mu_n C_{ox}$ 大約是 $\mu_p C_{ox}$ 的 3 倍），模擬後 NMOS 卻掉進 triode：PMOS 比較弱，輸出被 NMOS 往下拉。把 PMOS 加大到 48.9 µm / 1.5 µm，兩顆都回到 saturation。

| | 規格 | 模擬 | 手算 |
| --- | --- | --- | --- |
| $I_{in}$ | — | 16 µA | — |
| $V_{DD}$ 電流 | < 275 µA | 242.2 µA | 294 µA |
| 增益 | > 1.7 MΩ | 1.818 MΩ | 1.819 MΩ |
| −3 dB 頻寬 | > 150 Hz | 162.3 Hz | 162.7 Hz |
| 輸入阻抗 | — | 50 kΩ | 50 kΩ |
| 輸出阻抗 | — | 19.56 kΩ | 19.56 kΩ |

輸出的 DC 電壓是 0.444 V。

### Pole 和 zero

從 `.op` 讀出 $C_G$ = 603 fF、$C_D$ = 51.5 fF、$C_{GD}$ = 24.7 fF、$G_m$ = 1.86 mS、$R_{out}$ = 19.56 kΩ（$C_G$ 用 cgtot 減掉 cgd，$C_D$ 用 cdtot 減掉 cgd）：

| | 手算 | 模擬 | 誤差 |
| --- | --- | --- | --- |
| $f_{p1}$ | 162.7 Hz | 162.7 Hz | < 0.1% |
| $f_{p2}$ | 5.07 MHz | 5.07 MHz | < 0.1% |
| $f_z$ | 12.0 GHz | 10.7 GHz | 約 11% |

Pole 幾乎完全對上，zero 差比較多，因為 zero 只用了 $G_m/C_{GD}$ 這個最簡單的形式。

輸入阻抗：gate 不吃電流，從輸入看進去只有 $R_S$，50 kΩ。輸出阻抗：$r_{on} = 1/g_{ds,n}$ = 21.5 kΩ，$r_{op}$ = 216.8 kΩ，並聯 19.56 kΩ，和 `.tf` 一致。

## Part 2：closed-loop TIA

### 回授的種類

$R_F$ 在輸出端感測電壓（並聯），在輸入端送回電流（並聯），是一個 I → V 的轉阻放大器，[[AIC_feedback_blog|回授]]會讓輸入阻抗和輸出阻抗都除以 $(1 + \text{loop gain})$，兩者都往理想 TIA 的方向（越小越好）變。

拆迴路時兩端都接地，$R_F$ 變成一顆掛在輸入端、一顆掛在輸出端：

![[2024-11-22_20-45 1.jpeg|我畫的拆迴路：R_F 一份接在輸入節點到地（和 50 kΩ 的 R_S 並聯），一份接在輸出節點到地]]

open-loop gain 是

$$
A = G_m(R_{out} \parallel R_F)\cdot(R_S \parallel R_F)
$$

回授係數 $K = -1/R_F$（輸出電壓變成送回輸入的電流）。Loop gain 夠大時，closed-loop gain $\approx R_F$。規格是 50 kΩ ± 5%，所以 $R_F$ = 50 kΩ。

### Direct analysis

把 $R_F$ 加進小訊號模型，設流進 $R_S$ 的電流是 $i_1$，流過 $R_F$ 的就是 $I_{in} - i_1$：

![[2024-11-22_21-11 1.jpeg|我做 direct analysis 時畫的電流：i_1 流進 R_S，I_in − i_1 流過 R_F，輸出節點上再扣掉 G_m v 流進 r_on ∥ r_op]]

對兩個節點寫 KCL，DC 時：

$$
\frac{V_{out}}{I_{in}} = -\frac{G_m R_S R_{out} - R_S R_{out}/R_F}{1 + \dfrac{R_S + R_{out} + G_m R_S R_{out}}{R_F}}
$$

輸出阻抗的算法是把 $I_{in}$ 拿掉、在輸出端接一個測試電壓源：

![[Pasted image 20241122233557 1.png|我算輸出阻抗時畫的圖：輸出端接測試電壓源 V_out、流進電流 i_out，V_x 是 V_out 經過 R_F、R_S 的分壓]]

輸入、輸出阻抗也有同樣的分母：

$$
R_{in}' = \frac{R_S(1 + R_{out}/R_F)}{1 + \dfrac{R_S + R_{out} + G_m R_S R_{out}}{R_F}}, \qquad
R_{out}' = \frac{R_{out}(1 + R_S/R_F)}{1 + \dfrac{R_S + R_{out} + G_m R_S R_{out}}{R_F}}
$$

$G_m R_S R_{out}$ 很大時，增益趨近 $R_F$；$R_S$、$R_{out}$ 遠小於 $R_F$ 時，這幾個式子會退化成課本上 $R/(1 + KA)$ 的簡化形式。這題的 $R_S$ 等於 $R_F$，退化不了：$R_{out}'$ 分子上的 $(1 + R_S/R_F)$ 是 2，簡化公式少了這個 2，輸出阻抗就算成一半。

頻寬一樣看輸出節點：$\omega_{-3dB} \approx 1/(R_{out}' C_L)$。

### 結果

| | 規格 | 模擬 |
| --- | --- | --- |
| $I_{in}$ | — | 8 µA |
| $V_{DD}$ 電流 | < 275 µA | 248.1 µA |
| $R_F$ | — | 50 kΩ |
| 增益 | 50 kΩ ± 5% | 47.54 kΩ |
| −3 dB 頻寬 | > 3 kHz | 3.114 kHz |
| 輸入阻抗 | — | 1.229 kΩ |
| 輸出阻抗 | — | 1.020 kΩ |

$I_{in}$ 變成 8 µA：加了 $R_F$ 之後，$V_x$ 和 $V_{out}$ 之間多了一條電流路徑，要讓 $V_x$ 留在 0.8 V 附近需要的輸入電流不一樣了。

### 回頭看：手算為什麼一開始對不準

用不同的方法手算，跟 `.tf` 比較：

| | 模擬 | 簡化公式 $R/(1+KA)$ | Direct analysis，Part 1 的 $G_m$、$R_{out}$ | Direct analysis，closed-loop 的 $G_m$、$R_{out}$ |
| --- | --- | --- | --- | --- |
| 增益 | 47.54 kΩ | 48.7 kΩ | 46.4 kΩ | 47.54 kΩ |
| 輸入阻抗 | 1.229 kΩ | 1.338 kΩ | 1.79 kΩ | 1.229 kΩ |
| 輸出阻抗 | 1.020 kΩ | 0.523 kΩ | 1.009 kΩ | 1.020 kΩ |

簡化公式忽略了 $R_F$ 的負載，輸出阻抗差了一半。改用 direct analysis，輸出阻抗對了，輸入阻抗卻還差 46%。

原因是偏壓點變了。加上 $R_F$ 之後，輸出的 DC 電壓從 0.444 V 變成 1.172 V，NMOS 的 $V_{DS}$ 變大，$g_{ds,n}$ 從 46.5 µS 掉到 11.9 µS，$R_{out}$ 從 19.6 kΩ 變成 35.4 kΩ。拿 closed-loop 的 `.op` 重新讀出 $G_m$ = 1.885 mS、$R_{out}$ = 35.44 kΩ，代進同一組 direct analysis 的式子，增益、輸入阻抗、輸出阻抗三個都對到 0.1% 以內，頻寬也算出 3.12 kHz。公式本身沒有問題，問題在小訊號參數要用電路「實際」的偏壓點去讀。

### Open loop 和 closed loop 比較

| | Open loop | Closed loop | 比值 |
| --- | --- | --- | --- |
| 輸入阻抗 | 50 kΩ | 1.229 kΩ | 0.025 |
| 輸出阻抗 | 19.56 kΩ | 1.020 kΩ | 0.052 |

兩個阻抗都變小，對 TIA 都是好事：輸入阻抗小，訊號電流才會流進放大器，而不是被源阻抗 $R_S$ 分走；輸出阻抗小，輸出電壓才不會被負載分掉。輸出阻抗變小也讓輸出節點的 pole 往高頻移，頻寬從 162 Hz 變成 3.1 kHz。

![[2024-11-23_23-07 1.jpeg|藍色是 open-loop，紅色是 closed-loop 的增益（dB）對頻率。Open loop 的低頻增益比較高（125 dB），但在 162 Hz 就開始下降；closed loop 只有 93.5 dB，頻寬到 3.1 kHz。兩條線在 10 MHz 附近重合，之後一起以更陡的斜率下降]]

低頻增益從 125 dB 掉到 93.5 dB，換來將近 20 倍的頻寬。兩條線在高頻重合：那裡的 loop gain 已經小於 1，回授幾乎沒有作用，closed loop 的響應就跟 open loop 一樣。過了第二個 pole（約 5 到 10 MHz）之後，斜率從 −20 dB/dec 變成 −40 dB/dec。

### 手算和模擬的差異從哪裡來

- **電流**：square law 只是長通道的理想模型，模擬用的 BSIM model 還有短通道效應、channel-length modulation、mobility degradation、subthreshold 電流和寄生電阻、電容，所以電流的手算誤差最大（242 µA 算成 294 µA）。
- **$V_{th}$ 會變**：短通道的電晶體有 DIBL（drain-induced barrier lowering），$V_{DS}$ 越大，$V_{th}$ 越低；不同操作點下 $V_{th}$ 都不一樣。
- **$\mu C_{ox}$ 和 $\lambda$ 會變**：垂直電場變強時 mobility 下降，$\lambda$ 也隨偏壓改變，跟簡化模型裡的常數不同。
