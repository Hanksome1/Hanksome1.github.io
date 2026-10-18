---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: CMOS 反相器：VTC、noise margin 與延遲
date: '2024-10-14'
updated: '2026-10-17 21:26:49'
tags:
  - VLSI
  - Circuit
summary: CMOS 反相器的 voltage transfer characteristic、切換點與 noise margin，process variation 怎麼讓切換點偏移，延遲公式 0.69RC 的由來，以及驅動大負載時 inverter chain 要放幾級。
permalink: notes/vlsi-inverter/
synced: obsidian
---

反相器是最簡單的 CMOS 電路，後面的延遲、尺寸和功耗分析，幾乎都是先在反相器上推導，再推廣到其他邏輯閘。課程總覽見 [[VLSI_blog|積體電路設計導論筆記總覽]]。

## 結構

PMOS 接在 $V_{DD}$ 和輸出之間，NMOS 接在輸出和 GND 之間，兩顆的 gate 接在一起當輸入：

- 輸入 0：PMOS 導通、NMOS 關閉，輸出被拉到 $V_{DD}$
- 輸入 $V_{DD}$：NMOS 導通、PMOS 關閉，輸出被拉到 0

穩態時 $V_{DD}$ 到 GND 之間一定有一顆電晶體是關的，所以沒有直流電流；只有切換的瞬間兩顆同時導通，才有短暫的 short-circuit current。

## VTC 與切換點

輸入從 0 掃到 $V_{DD}$，記錄輸出，得到的曲線是 voltage transfer characteristic（VTC）。曲線和 $V_{in} = V_{out}$ 的交點叫 switching threshold $V_M$。

$V_M$ 由 PMOS 和 NMOS 的相對強弱決定：PMOS 的 W/L 相對越大，輸入要更高 NMOS 才拉得贏，$V_M$ 越高；NMOS 越強，$V_M$ 越低。

### Process variation 的影響

NMOS 和 PMOS 落在不同的 process corner 時（見 [[VLSI_Introduction_blog|process corner]]），VTC 會左右平移：

- **PMOS fast、NMOS slow**：PMOS 比較強，輸入要更高輸出才會被拉下來，VTC 往右移，$V_M$ 變大。
- **PMOS slow、NMOS fast**：NMOS 比較強，VTC 往左移，$V_M$ 變小。

![[vlsi-vtc-corners.svg|NMOS 和 PMOS 一強一弱時，VTC 左右平移，切換點 VM（曲線和虛線的交點）跟著移動]]


反過來，從量到的 VTC 往哪邊偏，就能判斷哪一顆電晶體比較強。

## Noise margin

邏輯閘的輸入不會剛好是 0 或 $V_{DD}$，前一級的輸出會帶雜訊。Noise margin 表示輸入可以偏離多少，這一級還能正確判斷。先定義四個電壓：

| 符號 | 意義 |
| --- | --- |
| $V_{IH}$ | 會被當成 1 的最小輸入電壓，高電位和不確定區的分界 |
| $V_{IL}$ | 會被當成 0 的最大輸入電壓，低電位和不確定區的分界 |
| $V_{OH}$ | 輸出 1 時的最小電壓 |
| $V_{OL}$ | 輸出 0 時的最大電壓 |

$V_{IH}$ 和 $V_{IL}$ 取在 VTC 斜率為 $-1$ 的兩點。Noise margin 是前一級最差的輸出和這一級能接受的範圍之間的距離：

$$
NM_L = V_{IL} - V_{OL}, \qquad NM_H = V_{OH} - V_{IH}
$$

![[vlsi-inverter-vtc.svg|左：CMOS 反相器。中：VTC，斜率為 −1 的兩點定出 VIL、VIH 和 VOH、VOL。右：前一級輸出的範圍和這一級能接受的範圍之間的距離，就是 noise margin]]


## 延遲

把反相器的輸出看成等效電阻 $R_{eq}$ 對負載電容充放電。負載包括反相器本身 drain 端的寄生電容 $C_{int}$，和外部的電容 $C_{ext}$（下一級的 gate、導線）：

$$
t_p = 0.69 \, R_{eq} \left(C_{int} + C_{ext}\right)
$$

下降和上升分開算，分別用 NMOS 和 PMOS 的等效電阻：

$$
t_{pHL} = 0.69 \, R_{eq,n} C_L, \qquad t_{pLH} = 0.69 \, R_{eq,p} C_L, \qquad t_p = \frac{t_{pHL} + t_{pLH}}{2}
$$

> [!note] 0.69 的由來
> Propagation delay 是輸出到達 $\frac{1}{2}V_{DD}$ 的時間。把輸出當成一階 RC 電路充電：
> $$
> V_{out}(t) = \left(1 - e^{-t/RC}\right) V_{DD} = \frac{1}{2} V_{DD}
> \;\Rightarrow\; t = \ln 2 \cdot RC \approx 0.69\,RC
> $$

$t_{pLH}$、$t_{pHL}$、rise time、fall time 的定義，以及 $R_{eq}$ 和各種電容的估算，見 [[VLSI_RC_blog|寄生電阻、電容與導線模型]]。

## 讓反相器變快

從 $t_p = 0.69 R_{eq} C_L$ 來看，能調整的只有電阻和電容：

- **減少 $C_L$**：drain 的擴散區畫小一點、導線短一點、fan-out 少一點。
- **加大 W/L**：$R_{eq}$ 變小，但電晶體本身的寄生電容 $C_{int}$ 也變大（self-loading）。$C_{int}$ 比外部負載大之後，再加大 W 就沒有幫助。
- **提高 $V_{DD}$**：電流變大、速度變快，代價是能量，而且超過某個電壓後改善有限。
- **調整 P/N ratio**：加大 PMOS 可以讓 $t_{pLH}$ 變小，但會加重前一級的負載，要在上升和下降之間取平衡。

## Inverter chain

用一個小邏輯閘推很大的負載（例如長導線、I/O pad、整排 word line），直接推會很慢。做法是中間串幾級反相器，每一級比前一級大一些。

![[vlsi-inverter-chain.svg|Inverter chain：每一級比前一級大 f 倍，N 級總共放大 F 倍]]


先定義幾個量：

- $t_{p0} = 0.69 R_{eq} C_{int}$：反相器只推自己寄生電容時的 intrinsic delay
- $\gamma = C_{int} / C_g$：寄生電容和輸入電容的比例，和尺寸無關，大約是 1
- $f = C_{ext} / C_g$：effective fan-out

一級反相器的延遲是 $t_p = t_{p0}\left(1 + f/\gamma\right)$。串 $N$ 級、整體 fan-out 是 $F = C_L / C_{g,1}$ 時，每一級放大相同倍數 $f = \sqrt[N]{F}$ 最好，總延遲是

$$
t_p = N \, t_{p0}\left(1 + \frac{\sqrt[N]{F}}{\gamma}\right)
$$

對 $N$ 微分求最小值：

- 如果忽略寄生電容（$\gamma = 0$），最佳的每級倍數是 $f = e \approx 2.7$，級數 $N = \ln F$。
- 實際上 $\gamma \approx 1$，最佳的 $f$ 大約是 3.6，實務上每級放大 3 到 4 倍。

級數太多或太少都不好：

- $N$ 太大：每一級都有 intrinsic delay，寄生效應主導。
- $N$ 太小：每一級的 fan-out 太大，fan-out delay 主導。

例如 $F = 64$、$\gamma = 1$：

| 級數 $N$ | 每級倍數 $f$ | $t_p / t_{p0}$ |
| --- | --- | --- |
| 1 | 64 | 65 |
| 2 | 8 | 18 |
| 3 | 4 | 15 |
| 4 | 2.83 | 15.3 |

從一級改成三級，延遲少了四倍多；超過三級後再加就沒有好處。
