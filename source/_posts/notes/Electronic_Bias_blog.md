---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 偏壓：讓電晶體停在對的操作點
date: '2024-05-22'
updated: '2026-10-16 21:48:32'
tags:
  - Electronics
  - Circuit
summary: 放大器在放大之前，要先把電晶體擺在 active / saturation 區的中間。BJT 的 simple bias、分壓偏壓與 self bias，MOS 的分壓偏壓與 self bias，以及 base 電流為什麼讓 BJT 的偏壓比較麻煩。
permalink: notes/electronics-bias/
synced: obsidian
---

小訊號模型裡的 $g_m$、$r_o$、$r_\pi$ 全部由 DC 操作點決定，所以設計放大器的第一步是偏壓（bias）：決定 DC 的電壓和電流，讓電晶體停在 BJT 的 active region、或 MOS 的 saturation 區，並且離區域邊界夠遠，訊號擺動時才不會掉出去。

這一頁的電路都在輸入端串一顆電容。電容在 DC 是開路、在訊號頻率是短路，所以偏壓電路決定 DC，訊號從電容耦合進來，兩者互不干擾。課程總覽見[[Electronic_blog|電子學（一）筆記總覽]]。

## BJT

BJT 偏壓的麻煩都來自 base 電流 $I_B = I_C / \beta$，而 $\beta$ 隨製程、溫度變化很大。

### Simple bias

![[Pasted image 20240616120155.png|Simple bias：一顆 R_B 從 V_CC 接到 base。I_B = (V_CC − V_BE)/R_B，I_C = βI_B]]

用一顆 $R_B$ 直接從 $V_{CC}$ 供 base 電流：

$$
I_B = \frac{V_{CC} - V_{BE}}{R_B}, \qquad I_C = \beta I_B = \beta \frac{V_{CC} - V_{BE}}{R_B}
$$

最簡單，但 $I_C$ 直接正比於 $\beta$。換一顆 $\beta$ 不同的電晶體，操作點就跑掉了。

### 分壓偏壓

![[Pasted image 20240616120309.png|分壓偏壓：R_1、R_2 分出 base 電壓。右邊把分壓電路換成 Thevenin 等效：V_Thev = R_2/(R_1 + R_2)·V_CC、R_Thev = R_1 ∥ R_2，base 電壓還要再扣掉 I_B R_Thev]]

用 $R_1$、$R_2$ 分出 base 電壓。如果流過分壓電阻的電流 $I_1$ 遠大於 $I_B$，可以直接當成分壓：

$$
V_X = \frac{R_2}{R_1 + R_2} V_{CC}, \qquad I_C = I_S \exp\left( \frac{V_X}{V_T} \right)
$$

$I_B$ 不能忽略時，把分壓電路換成 Thevenin 等效電路，base 電壓要扣掉 $I_B$ 在 $R_{Thev}$ 上的壓降：

$$
V_{Thev} = \frac{R_2}{R_1 + R_2} V_{CC}, \qquad R_{Thev} = R_1 \parallel R_2, \qquad V_X = V_{Thev} - I_B R_{Thev}
$$

這個電路的問題是 $I_C$ 對 $V_X$ 是指數關係，$V_X$ 差幾 mV，電流就差很多。實際上通常會在 emitter 下面再加一顆 $R_E$（degeneration），讓電流主要由 $(V_X - V_{BE})/R_E$ 決定，對 $V_{BE}$ 和 $\beta$ 都比較不敏感。

### Self bias

![[Pasted image 20240616120418.png|Self bias：R_B 從 collector 接到 base。V_out = V_CC − I_C R_C = V_BE + I_B R_B]]

把 $R_B$ 改接到 collector：

$$
V_{out} = V_{CC} - I_C R_C = V_{BE} + I_B R_B
$$

$$
I_C = \frac{V_{CC} - V_{BE}}{R_C + R_B / \beta}
$$

（這裡把流過 $R_C$ 的 $I_C + I_B$ 近似成 $I_C$。）只要 $R_C \gg R_B / \beta$，$I_C$ 幾乎和 $\beta$ 無關。它還有負回授的效果：$I_C$ 變大，$V_{out}$ 下降，base 電流跟著變小，把 $I_C$ 拉回來。而且 $V_{CE} = V_{BE} + I_B R_B$ 一定比 $V_{BE}$ 大，base-collector 接面不會被順偏，電晶體一定留在 active region。

## MOS

MOS 的 gate 不吃電流，偏壓就只是想辦法給 gate 一個固定電壓，簡單很多。

### 分壓偏壓

![[2024-05-22_18-13_2.jpeg|MOS 的分壓偏壓：R_1、R_2 分出 gate 電壓，source 下面接 R_S。gate 沒有電流，所以分壓公式是準的]]

Gate 沒有電流（$I = 0$），所以分壓公式是準的：

$$
V_G = \frac{R_2}{R_1 + R_2} V_{DD}
$$

Source 下面有 $R_S$ 時，$V_G = V_{GS} + I_D R_S$，和 square law 聯立就能解出 $I_D$。$R_S$ 的角色跟 BJT 的 $R_E$ 一樣，讓電流對 $V_{TH}$ 的變化比較不敏感。

### Self bias

![[2024-05-22_18-15.jpeg|MOS 的 self bias：R_G 從 drain 接到 gate。gate 不吃電流，所以 R_G 上沒有壓降，V_G = V_D]]

$R_G$ 從 drain 接到 gate。因為 gate 不吃電流，$R_G$ 上沒有壓降，$V_G = V_D$，整條路徑的電流都流過 $R_D$、電晶體和 $R_S$：

$$
V_{DD} = I_D R_D + V_{GS} + I_D R_S
$$

$$
V_{out} = V_{DD} - I_D R_D = V_{GS} + I_D R_S
$$

$V_G = V_D$ 代表 $V_{DS} = V_{GS} > V_{GS} - V_{TH}$，所以電晶體一定在 saturation。輸入訊號經過電容進到 gate，這個電路就是一顆偏壓好的 [[Electronic_MOS_Amplifiers_blog|common source]]。$R_G$ 通常選得很大，讓它對訊號的分流可以忽略。
