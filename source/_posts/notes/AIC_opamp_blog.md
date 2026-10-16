---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Op amp：virtual short、反相與非反相放大器
date: '2024-10-19'
updated: '2026-10-16 15:34:55'
tags:
  - AIC
  - Amplifier
summary: 把 op amp 當成黑盒子：理想 op amp 的三個條件、virtual short 從哪裡來，非反相與反相放大器在 open-loop gain 有限時的誤差，積分器、微分器和加法器，以及用差動對實作 op amp 時要注意什麼。
permalink: notes/aic-opamp/
synced: obsidian
---

這一章先不管 op amp 裡面長怎樣，只把它當成一個增益很大的差動放大器，看它接上電阻、電容之後能做什麼。裡面怎麼用電晶體做出來，見[[AIC_Differential_Amp_blog|差動放大器]]和 [[AIC_hw4_blog|HW4 的兩級 op amp]]。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

## 理想 op amp

- 增益 $A_0$ 非常大
- 輸入阻抗非常大（輸入是電壓，不想吃電流）
- 輸出阻抗非常小（輸出是電壓，要推得動負載）

輸出是兩個輸入之差乘上 $A_0$：

$$
V_{out} = A_0(V_{in+} - V_{in-}) \quad\Rightarrow\quad V_{in+} - V_{in-} = \frac{V_{out}}{A_0}
$$

輸出被電源限制在有限的範圍內，$A_0$ 又趨近無限大，所以只要接成負回授、電路正常工作，兩個輸入端的電壓差就趨近 0。這叫 virtual short：兩端電壓相等，但沒有電流流過（輸入阻抗無限大）。

另外，op amp 的輸出能變多快，受限於它能提供多少電流給負載電容充放電：

$$
I = C\frac{dV}{dt} \quad\Rightarrow\quad \frac{dV}{dt} = \frac{I}{C}
$$

這就是 slew rate 的來源，電路的速度最後都跟可用的電流有關。

## Unity-gain buffer

把輸出直接接回負輸入、訊號接正輸入。因為 virtual short，$V_{out} = V_{in}$：增益是 1，但輸入阻抗很大、輸出阻抗很小，是一個理想的電壓緩衝器。

## 非反相與反相放大器

![[aic-opamp-configs.svg|左：非反相放大器，R_1、R_2 把輸出分壓回負輸入。右：反相放大器，正輸入接地，負輸入的節點 X 是 virtual ground，輸入電流 V_in/R_2 全部流過 R_1]]

### 非反相放大器

負輸入端的電壓是輸出的分壓 $\beta V_{out}$，$\beta = R_2/(R_1 + R_2)$。理想情況下 virtual short 讓 $\beta V_{out} = V_{in}$：

$$
\frac{V_{out}}{V_{in}} = \frac{1}{\beta} = 1 + \frac{R_1}{R_2}
$$

如果 $A_0$ 有限，代回 $V_{out} = A_0(V_{in} - \beta V_{out})$：

$$
\frac{V_{out}}{V_{in}} = \frac{A_0}{1 + \beta A_0} \approx \left(1 + \frac{R_1}{R_2}\right)\left[1 - \left(1 + \frac{R_1}{R_2}\right)\frac{1}{A_0}\right]
$$

相對誤差大約是 $(1 + R_1/R_2)/A_0$：

- closed-loop gain 越大，誤差越大
- open-loop gain 越大，誤差越小

### 反相放大器

正輸入接地，virtual short 讓負輸入端 X 也是 0 V（virtual ground）。流過 $R_2$ 的電流 $V_{in}/R_2$ 不能流進 op amp，只能全部流過 $R_1$：

$$
\frac{V_{out}}{V_{in}} = -\frac{R_1}{R_2}
$$

$A_0$ 有限時：

$$
\frac{V_{out}}{V_{in}} = \frac{-R_1/R_2}{1 + (1 + R_1/R_2)/A_0}
$$

輸入阻抗是 $R_2 + R_1/(1 + A_0)$：$R_1$ 跨在一個增益 $-A_0$ 的放大器兩端，從 X 看下去被 [[AIC_FrequencyResponse_blog|Miller 效應]]縮小成 $R_1/(1 + A_0)$，這就是 virtual ground 的另一種看法。$A_0$ 很大時，輸入阻抗趨近 $R_2$。

### Open-loop gain 要多大

[[AIC_hw2_blog|HW2]] 用 HSPICE 的 E-element（理想的電壓控制電壓源）當 op amp，把兩種放大器都接成增益 10，換不同的 open-loop gain：

![[aic-opamp-gain-error.svg|增益 10 的非反相、反相放大器，gain error 隨 open-loop gain 的變化。點是 HW2 模擬的三個 open-loop gain（20、40、60 dB），open-loop gain 每多 20 dB，誤差大約小 10 倍]]

| Open-loop gain | 非反相的 gain error | 反相的 gain error |
| --- | --- | --- |
| 20 dB | 50% | 52.4% |
| 40 dB | 9.09% | 9.91% |
| 60 dB | 0.99% | 1.09% |

想讓增益準到 1%，open-loop gain 要比 closed-loop gain 大上 100 倍左右，這也是 op amp 要追求高增益的理由。

## 積分器、微分器與加法器

把反相放大器的電阻換成電容，就能做微積分：

![[aic-integrator.svg|左：積分器，回授路徑是電容，輸入電流 V_in/R 全部拿去對電容充電。右：微分器，輸入端是電容，流過電容的電流 C dV_in/dt 全部流過回授電阻]]

$$
\text{積分器：}V_{out} = -\frac{1}{RC}\int V_{in}\,dt, \qquad
\text{微分器：}V_{out} = -RC\frac{dV_{in}}{dt}
$$

反相放大器的 virtual ground 也可以拿來加法：好幾個輸入各自經過電阻接到 X，電流在 X 加總後全部流過回授電阻，

$$
V_{out} = -R_F\left(\frac{V_1}{R_1} + \frac{V_2}{R_2} + \cdots\right)
$$

回授路徑裡放二極體或電晶體，還能做出精密整流、對數放大器這類非線性的運算。

## 用差動對實作

[[AIC_hw2_blog|HW2]] 最後一題問：如果 op amp 用[[AIC_Differential_Amp_blog|電流鏡負載的差動對]]實作，要注意什麼？

- **Open-loop gain 要大。** 增益是 $g_{m1}(r_{on} \parallel r_{op}) = \frac{2}{V_{ov}}\left(\frac{1}{\lambda_n} \parallel \frac{1}{\lambda_p}\right)$，所以 L 要長、$V_{ov}$ 要小。
- **輸出阻抗和增益互相衝突。** 理想 op amp 的輸出阻抗要小，但單級 OTA 的輸出阻抗正是決定增益的 $r_{on} \parallel r_{op}$。要兩者兼得，就要再接一級，這是兩級 op amp 的由來。
- **所有電晶體都要在 saturation。** 輸入共模範圍、輸出擺幅都要留 headroom，見[[AIC_Differential_Amp_blog|差動放大器]]裡 tail current 那一段。
