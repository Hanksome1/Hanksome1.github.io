---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 單級放大器：common source、common gate 與 source follower
date: '2024-09-10'
updated: '2026-10-16 15:32:26'
tags:
  - AIC
  - Amplifier
summary: 一顆 MOS 能做的三種放大器：CS 的轉移曲線與三種負載（電阻、電流源、diode-connected）、source degeneration，CG 當電流緩衝，CD 當電壓緩衝，以及它們的增益、輸入阻抗和輸出阻抗。
permalink: notes/aic-single-stage/
synced: obsidian
---

一顆 MOS 有三個端點，訊號從其中一個進、從另一個出，剩下那個接在固定的電壓上（交流接地），就得到三種單級放大器：common source（CS）、common gate（CG）、common drain（CD）。名字裡的 common 指的就是那個固定的端點，固定不一定是 0 V，只要它不隨訊號變動就好。MOS 本身的特性見 [[AIC_MOS_blog|MOS 元件]]，課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

## Common source

訊號從 gate 進、從 drain 出，source 接地。$V_{in}$ 改變電流 $I_D$，$I_D$ 流過 $R_D$ 產生壓降，輸出是

$$
V_{out} = V_{DD} - I_D R_D
$$

$V_{in}$ 越大、電流越大、$V_{out}$ 越低，所以 CS 是反相放大器。

![[aic-cs-vtc.svg|電阻負載的 CS 和它的轉移曲線。V_in 低於 V_TH 時電晶體關閉，輸出停在 V_DD；進入 saturation 後曲線陡降，這段就是放大區，斜率是增益；V_in 再大，V_out 掉到 V_in − V_TH 以下，電晶體進入 triode，增益迅速變小]]

偏壓點要放在 saturation 那段的中間。$V_{in}$ 太大時，$R_D$ 上的壓降太大，$V_{DS}$ 小到讓電晶體掉進 triode；這時的「增益」只是負載和 triode 電阻之間的分壓，最多也只有 1 左右。

小訊號下：

- 增益：$A_v = -g_m (R_D \parallel r_o)$
- 輸入阻抗：$\infty$（看進 gate）
- 輸出阻抗：$R_D \parallel r_o$

## CS 的三種負載

![[aic-cs-loads.svg|同一顆 CS 輸入管，換三種負載。電阻負載的增益和壓降互相牽制；電流源負載用一顆 PMOS 提供大的小訊號電阻，卻只吃掉 V_ov 的壓降；diode-connected 負載的增益由兩顆電晶體的尺寸比決定]]

### 電阻負載

電阻同時決定增益和 DC 壓降，受歐姆定律綁住：$R_D$ 大，增益大，但 $I_D R_D$ 也大，輸出偏壓被壓低，可能把電晶體擠進 triode；$R_D$ 小，壓降小了，增益也小了。

### 電流源負載（active load）

把負載換成一顆偏壓在 saturation 的 PMOS。它對小訊號來說是一顆 $r_{o2}$ 的大電阻，DC 上卻只需要 $|V_{ov}|$ 的壓降就能維持電流：

$$
A_v = -g_{m1}(r_{o1} \parallel r_{o2})
$$

增益和 headroom 的取捨被解開了，代價是輸出的 DC 電壓變得很敏感：兩顆電晶體的電流必須剛好相等，一點點不匹配就會讓輸出往某一邊跑，通常需要回授來固定它。

### Diode-connected 負載

Gate 和 drain 接在一起的電晶體，兩端電壓就是它自己的 $V_{GS}$，流過的電流又是 $g_m v_{gs}$，所以在小訊號下它就是一顆 $1/g_m$ 的電阻（並聯 $r_o$，但 $g_m r_o \gg 1$，通常 $1/g_m$ 小得多）。拿它當負載：

$$
A_v \approx -\frac{g_{m1}}{g_{m2}} = -\sqrt{\frac{\mu_n (W/L)_1}{\mu_p (W/L)_2}}
$$

增益只由兩顆電晶體的尺寸比決定，跟偏壓電流、製程的絕對值無關，所以比較穩定、可以預測，代價是增益不大。（如果負載也用 NMOS，mobility 消掉，變成 $\sqrt{(W/L)_1/(W/L)_2}$，但要再考慮 body effect。）

## Source degeneration

在 source 和地之間串一顆 $R_S$：

![[aic-three-stages.svg|三種單級放大器。左：CS 加上 source degeneration，等效轉導被 1 + g_m R_S 除掉。中：CG，訊號從 source 進，gate 接固定偏壓。右：CD，輸出跟著輸入走，增益接近 1]]

$R_S$ 上的壓降會抵掉一部分 $V_{GS}$ 的變化（這其實是一種回授），等效轉導變小：

$$
G_m = \frac{g_m}{1 + g_m R_S}, \qquad A_v = -\frac{g_m R_D}{1 + g_m R_S} = -\frac{R_D}{R_S + 1/g_m}
$$

$g_m R_S \gg 1$ 時 $A_v \approx -R_D/R_S$，增益由兩顆電阻的比值決定，跟電晶體無關，線性度也變好。輸出阻抗則被放大：

$$
R_{out} = (1 + g_m R_S) r_o + R_S \approx (1 + g_m R_S) r_o
$$

拿它當電流源時，輸出阻抗越大越好，這是後面 [[AIC_CurrentMirror_Cascode_blog|cascode]] 的出發點。

## Common gate

訊號從 source 進、從 drain 出，gate 接固定偏壓。

- 增益：$A_v = g_m (R_D \parallel r_o)$（忽略 $r_o$ 的回授和 body effect），同相
- 輸入阻抗：約 $1/g_m$，比 CS 小很多
- 輸出阻抗：$R_D \parallel r_o$；如果訊號源有內阻 $R_S$，看進 drain 的阻抗會變成 $(1 + g_m R_S)r_o$ 的量級
- 電流增益 = 1：gate 不吃電流，從 source 流進來的電流全部從 drain 流出去

CS 和 CG 本質上是同一件事：電流只看 $V_{GS} = V_G - V_S$。CS 固定 source、動 gate；CG 固定 gate、動 source。$V_S$ 上升，$V_{GS}$ 變小，電流變小，$R_D$ 上的壓降變小，$V_{out}$ 上升，所以 CG 是同相的。

因為輸入阻抗小、輸出阻抗大、電流增益為 1，CG 是一個電流緩衝器（current buffer）：電流不變，但把阻抗從很低轉換到很高。它最重要的用途是疊在 CS 上面組成 [[AIC_CurrentMirror_Cascode_blog|cascode]]。

## Common drain（source follower）

訊號從 gate 進、從 source 出，drain 接 $V_{DD}$。Source 會跟著 gate 走，差一個 $V_{GS}$：

$$
A_v = \frac{g_m (R_S \parallel r_o)}{1 + g_m (R_S \parallel r_o)} \approx 1
$$

- 輸入阻抗：$\infty$
- 輸出阻抗：約 $1/g_m$（並聯 $R_S$、$r_o$）

輸入阻抗大、輸出阻抗小，是一個電壓緩衝器（voltage buffer），用來推小的負載電阻而不損失增益。輸出永遠比輸入低一個 $V_{GS}$，所以也可以當 level shifter，把訊號的 DC 準位往下移。NMOS 的 body 接地時，body effect 會讓增益掉到 $g_m/(g_m + g_{mb})$ 左右；[[AIC_hw1_blog|HW1]] 用 PMOS 做 source follower，把 body 接到 source，就沒有這個問題。

## 整理

| | CS | CG | CD |
| --- | --- | --- | --- |
| 增益 | $-g_m(R_D \parallel r_o)$ | $g_m(R_D \parallel r_o)$ | $\approx 1$ |
| 輸入阻抗 | $\infty$ | $\approx 1/g_m$ | $\infty$ |
| 輸出阻抗 | $R_D \parallel r_o$ | $R_D \parallel r_o$ | $\approx 1/g_m$ |
| 常見用途 | 主要的增益級 | 電流緩衝、cascode | 電壓緩衝、level shifter |

這三種接法的設計練習見 [[AIC_hw1_blog|HW1]]；它們的頻率響應見[[AIC_FrequencyResponse_blog|頻率響應]]。
