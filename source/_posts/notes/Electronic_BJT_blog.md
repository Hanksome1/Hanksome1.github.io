---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: BJT：active region 與小訊號模型
date: '2024-06-16'
updated: '2026-10-16 21:48:03'
tags:
  - Electronics
  - Device
summary: Bipolar transistor 的 active region、指數關係與 β，小訊號模型裡的 g_m、r_π、r_o，以及 BJT 和 MOSFET 放在一起比較：誰的 g_m 大、誰的輸入阻抗大。
permalink: notes/electronics-bjt/
synced: obsidian
---

BJT（bipolar junction transistor）有三個端點：base、collector、emitter。它和 MOS 一樣可以當成受控電流源，差別是控制它的是 base-emitter 接面的電壓，而且 base 一定要吃一點電流。課程總覽見[[Electronic_blog|電子學（一）筆記總覽]]。

![[Pasted image 20240616133948.png|NPN 的電路符號：B 是 base，C 是 collector，E 是 emitter；emitter 上的箭頭指出電流方向]]

## Active region

放大器要用的是 active region：base-emitter 接面順偏、base-collector 接面逆偏。這時 collector 電流和 $V_{BE}$ 是指數關係：

$$
I_C = I_S \exp\left( \frac{V_{BE}}{V_T} \right), \qquad V_T = \frac{kT}{q} \approx 26\ \text{mV}
$$

Base 電流是 collector 電流的 $1/\beta$，emitter 電流是兩者的和：

$$
I_B = \frac{I_C}{\beta}, \qquad I_E = I_C + I_B = (\beta + 1) I_B
$$

$\beta$ 通常在 100 左右，所以 $I_C \approx I_E$，但 $I_B$ 不是 0。很多 BJT 電路的麻煩都出在這個 $I_B$：偏壓電路的分壓會被它拉低（見 [[Electronic_Bias_blog|偏壓]]），電流鏡複製出來的電流會因為它而不準（見 [[Electronic_CurrentMirror_blog|電流鏡]]）。

如果 base-collector 接面也被順偏，電晶體進入 saturation（注意：BJT 的 saturation 跟 MOS 的 saturation 意思剛好相反，BJT 的 saturation 對應的是 MOS 的 triode），這時 $V_{CE}$ 只剩約 0.2 V（$V_{CE,sat}$），電流不再由 $V_{BE}$ 漂亮地控制。

## 小訊號模型

![[Pasted image 20240616134930.png|BJT 的小訊號模型：B 和 E 之間是 r_π，C 和 E 之間是受控電流源 g_m v_π 並聯 r_o]]

- 轉導：

$$
g_m = \frac{\partial I_C}{\partial V_{BE}} = \frac{I_C}{V_T}
$$

- 從 base 看進去的電阻：

$$
r_\pi = \frac{\partial V_{BE}}{\partial I_B} = \frac{\beta}{g_m} = \frac{\beta V_T}{I_C}
$$

- 輸出電阻，來自 Early effect（$V_A$ 是 Early voltage，角色和 MOS 的 $1/\lambda$ 一樣）：

$$
r_o = \frac{\partial V_{CE}}{\partial I_C} = \frac{V_A}{I_C}
$$

## 和 MOS 比較

| | BJT | MOS |
| --- | --- | --- |
| 控制關係 | 指數：$I_C = I_S e^{V_{BE}/V_T}$ | 平方：$I_D \propto (V_{GS} - V_{TH})^2$ |
| $g_m$ | $I_C / V_T$ | $2 I_D / (V_{GS} - V_{TH})$ |
| 看進控制端 | $r_\pi = \beta / g_m$ | $\infty$ |
| 輸出電阻 | $V_A / I_C$ | $1 / (\lambda I_D)$ |

同樣的電流下，BJT 的 $g_m$ 比較大：$V_T$ 只有 26 mV，而 MOS 的 $(V_{GS} - V_{TH})/2$ 通常是 100 mV 以上。另一方面，MOS 的 gate 不吃電流，輸入阻抗是無限大，這讓 MOS 的偏壓和多級串接都簡單得多。

MOS 的 $g_m$ 還多了尺寸（$W/L$）可以調，同一個電流可以選不同的 $V_{ov}$；BJT 的 $g_m$ 只由電流決定，面積只影響 $I_S$。這也是為什麼原本筆記裡會說 MOS 不太需要 degeneration：MOS 本身就有 $V_{ov}$、$I_D$、$W/L$ 好幾個旋鈕可以調增益。

三種 BJT 放大器（CE、CB、CC）見 [[Electronic_BJT_Amplifiers_blog|BJT 單級放大器]]。
