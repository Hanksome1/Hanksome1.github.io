---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: BJT 單級放大器：CE、CB 與 CC
date: '2024-06-16'
updated: '2026-10-16 21:50:09'
tags:
  - Electronics
  - Amplifier
summary: BJT 的三種單級放大器：common emitter 與 emitter degeneration、common base 當電流緩衝、common collector（emitter follower）當電壓緩衝，各自的增益、輸入阻抗和輸出阻抗，以及為什麼喇叭前面要加一級 follower。
permalink: notes/electronics-bjt-amps/
synced: obsidian
---

BJT 的三種單級放大器和 MOS 一一對應：common emitter（CE）對應 CS、common base（CB）對應 CG、common collector（CC）對應 CD。公式長得幾乎一樣，差別都來自 BJT 的 base 會吃電流：看進 base 不再是無限大，而是 $r_\pi$。BJT 本身的模型見 [[Electronic_BJT_blog|BJT]]，MOS 版本見 [[Electronic_MOS_Amplifiers_blog|MOS 單級放大器]]，課程總覽見[[Electronic_blog|電子學（一）筆記總覽]]。

## 三個阻抗

![[el-bjt-impedances.svg|從 BJT 的三個端點看進去的小訊號阻抗。base：r_π 加上被放大 (β + 1) 倍的 R_E；emitter：大約 1/g_m；collector：r_o 被 degeneration 放大，但最多大約 βr_o]]

- **看進 base**（emitter 下面接 $R_E$）：$r_\pi + (\beta + 1) R_E$。流過 $R_E$ 的是 emitter 電流，也就是 $(\beta + 1)$ 倍的 base 電流，所以從 base 看，$R_E$ 被放大了 $(\beta + 1)$ 倍。
- **看進 emitter**（base 接固定電壓）：$\frac{1}{g_m} \parallel r_\pi \approx \frac{1}{g_m}$。Base 上串了電阻 $R_B$ 時再加上 $R_B / (\beta + 1)$。
- **看進 collector**（emitter 下面接 $R_E$）：$r_o [1 + g_m (R_E \parallel r_\pi)] + R_E \parallel r_\pi$。

最後一條和 MOS 不同的地方是 $R_E \parallel r_\pi$：$R_E$ 再大，並聯之後也不會超過 $r_\pi$，所以從 collector 看進去最多大約 $g_m r_\pi r_o = \beta r_o$。這個上限後面在 [[Electronic_CurrentMirror_blog|cascode]] 會再遇到。

## Common emitter

![[Pasted image 20240616115902.png|Common emitter：V_in 加在 base（下面串一個偏壓電壓），輸出從 collector 拉出來，負載是 R_C]]

訊號從 base 進、從 collector 出，emitter 接地，是反相放大器：

- 增益：$A_v = -g_m (R_C \parallel r_o)$
- 輸入阻抗：$r_\pi$
- 輸出阻抗：$R_C \parallel r_o$

### Emitter degeneration

![[Pasted image 20240616120547.png|CE 加上 emitter degeneration：emitter 下面串 R_E，V_BE 的變化有一部分被 R_E 上的壓降吃掉]]

![[Pasted image 20240616120728.png|它的小訊號模型。base 電流 i 流過 r_π，collector 的 βi 也往下匯進 emitter，所以流過 R_E 的是 (1 + β)i]]

在 emitter 下面串一顆 $R_E$，可以用來控制增益和輸出阻抗。小訊號模型裡，base 電流流過 $r_\pi$ 後，和 collector 電流一起匯進 emitter，所以流過 $R_E$ 的是 $(1 + \beta)$ 倍的 base 電流。忽略 $r_o$：

- 增益：

$$
A_v = -\frac{g_m R_C}{1 + g_m R_E} \approx -\frac{R_C}{R_E}
$$

- 輸入阻抗：$r_\pi + (1 + \beta) R_E$
- 輸出阻抗：看進 collector 是 $r_o [1 + g_m (R_E \parallel r_\pi)]$（再加上很小的 $R_E \parallel r_\pi$），整級再並聯 $R_C$

和 MOS 的 source degeneration 一樣：增益變小，但變成電阻比，比較線性、對 $\beta$ 和溫度比較不敏感；輸入阻抗和輸出阻抗都變大了。

## Common base

![[Pasted image 20240616132617.png|Common base：base 接固定的 V_B，訊號從 emitter 進，輸出從 collector 拉出來]]

訊號從 emitter 進、從 collector 出，base 接固定電壓，是非反相放大器：

- 增益：$A_v = g_m (R_C \parallel r_o)$
- 輸入阻抗：$\frac{1}{g_m} \parallel r_\pi \approx \frac{1}{g_m}$；把 $r_o$ 考慮進去是 $\frac{1}{g_m} + \frac{R_C}{g_m r_o}$
- 輸出阻抗：$R_C \parallel r_o$（訊號源本身有電阻 $R_S$ 時，看進 collector 會被 degeneration 放大，同上面的公式）

### 電流緩衝

輸入在 emitter、輸出在 collector，流進 emitter 的電流幾乎全部從 collector 流出，只少了 base 分走的那一點：

$$
\frac{i_c}{i_e} = \frac{\beta}{1 + \beta} \approx 1
$$

電流增益接近 1，但輸入阻抗很低（$\approx 1/g_m$），輸出阻抗很高。所以 CB 是一個很好的電流緩衝：前一級可以把電流「倒」進一個低阻抗的節點，CB 再把同樣的電流交給一個高阻抗的輸出。

## Common collector（emitter follower）

![[Pasted image 20240616133327.png|Common collector：訊號從 base 進，輸出從 emitter 拉出來，emitter 下面是 R_E，collector 接 V_CC]]

![[Pasted image 20240616133423.png|它的小訊號模型：輸出節點在 r_π、g_m v_π 和 R_E 的交會處]]

訊號從 base 進、從 emitter 出，collector 接 $V_{CC}$，輸出跟著輸入走（少一個 $V_{BE}$），是非反相的電壓緩衝：

- 增益：

$$
A_v = \frac{(\beta + 1)(R_E \parallel r_o)}{r_\pi + (\beta + 1)(R_E \parallel r_o)} \approx \frac{g_m (R_E \parallel r_o)}{1 + g_m (R_E \parallel r_o)} < 1
$$

- 輸入阻抗：$r_\pi + (1 + \beta)(R_E \parallel r_o)$
- 輸出阻抗：$\frac{1}{g_m} \parallel R_E \parallel r_o$（訊號源本身有電阻 $R_S$ 時，$\frac{1}{g_m}$ 換成 $\frac{r_\pi + R_S}{1 + \beta}$）

輸入阻抗被 $(1 + \beta)$ 放大，輸出阻抗被縮小到大約 $1/g_m$，這正是電壓緩衝要的特性。

### 例子：推喇叭

![[Pasted image 20240616133814.png|左：CE 直接透過電容推喇叭。右：在 CE 和喇叭之間加一級 emitter follower。follower 不貢獻增益，但能改變兩邊看到的阻抗]]

喇叭的阻抗只有幾歐姆（例如 8 Ω）。CE 直接推它時，輸出節點的阻抗變成 $R_C \parallel 8\ \Omega$，增益 $-g_m (R_C \parallel 8\ \Omega)$ 幾乎被吃光。

在中間插一級 emitter follower：CE 看到的負載變成 follower 的輸入阻抗 $r_\pi + (1 + \beta) \cdot 8\ \Omega$，大了 $\beta$ 倍；喇叭看到的則是 follower 的輸出阻抗，大約 $1/g_m$，很小。Follower 本身的增益不到 1，但它把 CE 的增益保住了。

## 整理

| | Common emitter | Common base | Common collector |
| --- | --- | --- | --- |
| 輸入 → 輸出 | base → collector | emitter → collector | base → emitter |
| 增益 | $-g_m (R_C \parallel r_o)$ | $g_m (R_C \parallel r_o)$ | $\approx \dfrac{g_m (R_E \parallel r_o)}{1 + g_m (R_E \parallel r_o)}$ |
| 輸入阻抗 | $r_\pi$ | $\approx 1/g_m$ | $r_\pi + (1 + \beta)(R_E \parallel r_o)$ |
| 輸出阻抗 | $R_C \parallel r_o$ | $R_C \parallel r_o$ | $\frac{1}{g_m} \parallel R_E \parallel r_o$ |
| 用途 | 電壓放大 | 電流緩衝 | 電壓緩衝 |

和 MOS 那張表比較，差別只有兩處：輸入在 base 時多了 $r_\pi$（MOS 是 $\infty$），以及 degeneration 放大輸出阻抗時被 $r_\pi$ 限制住。
