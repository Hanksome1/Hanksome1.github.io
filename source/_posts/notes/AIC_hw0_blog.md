---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: AIC HW0：用 HSPICE 量 MOS 的參數
date: '2024-09-15'
updated: '2026-10-16 15:37:45'
tags:
  - AIC
  - HSPICE
  - Device
summary: 電子學（二）的暖身作業：掃通道長度，看 V_th、g_m r_o、f_T 怎麼變（短通道與 reverse short-channel effect、增益和速度的取捨），從量到的電流反推 μC_ox 設計出 45 µA，再比較 body 接地和接 source 時的 body effect。
permalink: notes/aic-hw0/
synced: obsidian
---

第一份作業是熟悉 HSPICE：把 MOS 接成最簡單的電路，掃尺寸和電壓，看[[AIC_MOS_blog|課本上的那些參數]]在真實的 model 裡長什麼樣子。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

![[aic-hw0-setup.svg|左、中：Part 1 的量測電路，NMOS 和 PMOS 都接成 diode-connected，由 45 µA 的電流源偏壓，W/L 固定為 4、掃 L。右：Part 3 比較 body 的兩種接法，接地時 V_SB 等於 source 電壓，接 source 時 V_SB 恆為 0]]

## Part 1：參數隨通道長度的變化

W/L 固定為 4，L 從最小尺寸掃到 10 µm，用 `.probe` 拉出 $V_{th}$、$g_m$、$g_{ds}$、$V_{Dsat}$、intrinsic gain $g_m r_o$、power efficiency $g_m/I_D$ 和速度 $f_T$，另外對 $V_{th}$ 和 $g_m r_o$ 比較 TT、SS、FF 三個 corner。

### Threshold voltage

![[Pasted image 20240915220612.png|V_th 對通道長度 L（0 到 10 µm）。紫色是 PMOS 的 |V_th|，青色是 NMOS 的 V_th，兩者都在 L ≈ 0.25 µm 附近最大，之後隨 L 增加而下降]]

- PMOS 的 $|V_{th}|$ 比 NMOS 大。
- **L < 0.25 µm**：L 越短，$V_{th}$ 越低。這是 short-channel effect，通道很短時 drain 的電場也在幫忙空乏通道，電子比較容易從 source 流到 drain，gate 不用那麼大的電壓就能打開。
- **L > 0.25 µm**：L 越長，$V_{th}$ 反而越低。這是 reverse short-channel effect，來自 source、drain 邊緣不均勻的摻雜（halo implant）：它們讓短通道的 $V_{th}$ 變高，通道越長，邊緣占的比例越小，效果就越弱。
- Corner 的順序跟名字一樣：SS 的 $V_{th}$ 最高，FF 最低。

### Intrinsic gain 和速度

![[Pasted image 20240916003547.png|g_m r_o 對通道長度。藍色是 PMOS，紅色是 NMOS，兩者都隨 L 增加，L = 10 µm 時 PMOS 約 550、NMOS 約 200]]

$g_m r_o$ 隨 L 一路上升，因為 $\lambda \propto 1/L$，L 越長 $r_o$ 越大。速度剛好相反：

![[Pasted image 20240916004654.png|f_T 對通道長度。藍色是 NMOS，紅色是 PMOS。L 接近 0.18 µm 時 f_T 上百 GHz，L 超過 1 µm 後就掉到很低]]

$f_T \approx g_m/(2\pi C_{gg})$，L 變長，gate 電容變大、同樣電流下的 $g_m$ 變小，$f_T$ 掉得很快（大約跟 $1/L^2$ 成正比）。NMOS 的 mobility 比較高，同樣尺寸下比 PMOS 快。

這兩張圖放在一起，就是類比設計最基本的取捨：要增益就用長的 L，要速度就用短的 L。後面幾份作業的輸入管、電流源都選 1 到 3 µm 的 L，就是在這之間找平衡。

## Part 2：I_D–V_GS 曲線

W/L 固定為 4、取幾個不同的 L，把 $I_D$ 和 $\sqrt{I_D}$ 對 $V_{GS}$ 作圖。照 square law，$\sqrt{I_D}$ 應該是一條直線，延伸到 $I_D = 0$ 的地方就是 $V_{th}$。量到的曲線在 $V_{GS}$ 0.5 V 以上確實很直，不同 L 的曲線也幾乎重疊；但在 $V_{th}$ 附近會彎成一條平滑的尾巴，因為電晶體在 subthreshold 時還是有電流，square law 在這一段不適用。

## Part 3：設計 45 µA 和 body effect

### 從量到的電流反推參數

要讓 NMOS（L = 4 µm）在 $V_{GS}$ = 0.75 V 時流 45 µA。$\mu_n C_{ox}$ 不知道，先拿一組尺寸試：W/L = 16 µm / 4 µm 時，$V_{th}$ = 324.6 mV，$I_D$ = 92.5 µA，代回 square law：

$$
92.5\ \mu\text{A} = \frac{1}{2}\mu_n C_{ox}\cdot 4\cdot(0.75 - 0.3246)^2
\quad\Rightarrow\quad
\mu_n C_{ox} \approx 255\ \mu\text{A/V}^2
$$

再反推 45 µA 需要的 W：

$$
45\ \mu\text{A} = \frac{1}{2}\cdot 255\ \mu\cdot\frac{W}{4\ \mu\text{m}}\cdot 0.181
\quad\Rightarrow\quad
W \approx 7.83\ \mu\text{m}
$$

模擬出來是 44.76 µA，略小，再把 W 微調大一點：

| W | $I_D$ |
| --- | --- |
| 7.867 µm | 44.996 µA |
| 7.868 µm | 45.002 µA |
| 7.869 µm | 45.008 µA |

### Body effect

把 source 電壓 $V_S$ 從 0 往上掃，比較 body 接地和 body 接 source：

![[Pasted image 20240918215235.png|V_th 對 source 電壓 V_S（0 到 1.8 V）。紅色是 body 接地，V_th 從約 0.34 V 一路升到約 0.6 V；藍色是 body 接 source，V_th 幾乎不變]]

Body 接地時，$V_{SB}$ 就等於 $V_S$，$V_{th}$ 隨著 [[AIC_MOS_blog|body effect 的公式]]一路上升，電流也跟著一路下降；body 接 source 時 $V_{SB} = 0$，$V_{th}$ 不動，電流維持在 45 µA 附近，直到 $V_S$ 高到電晶體的 headroom 不夠為止。$g_m$ 也是同樣的趨勢。

這就是為什麼 [[AIC_hw1_blog|HW1]] 的 source follower 用 PMOS、把 body 接到自己的 source：source follower 的 source 跟著訊號動，body 接固定電壓的話，$V_{th}$ 會隨訊號變化，增益和線性度都會變差。
