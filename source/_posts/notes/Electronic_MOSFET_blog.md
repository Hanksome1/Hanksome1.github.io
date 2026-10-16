---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: MOSFET：操作區、square law 與小訊號模型
date: '2024-05-08'
updated: '2026-10-16 21:47:43'
tags:
  - Electronics
  - Device
summary: MOSFET 的結構、cutoff／triode／saturation 三個操作區和它們的條件（含 PMOS），pinch-off 與 square law，channel-length modulation 與 body effect，以及小訊號模型裡的 g_m 和 r_o。
permalink: notes/electronics-mosfet/
synced: obsidian
---

MOSFET 是 Metal–Oxide–Semiconductor Field-Effect Transistor 的縮寫。它的電流主要是 drift current：gate 電壓在通道裡吸出一層載子，drain 和 source 之間的電場推著這些載子走。課程總覽見[[Electronic_blog|電子學（一）筆記總覽]]。

## 結構

![[Pasted image 20240616134441.png|NMOS 的結構：p 型基板上做兩塊 n+ 區當 source 和 drain，中間上方是隔著薄氧化層的 gate。下排左邊是剖面，右邊是電路符號，B 是 body（基板）]]

NMOS 的 source 和 drain 是做在 p 型基板裡的兩塊 n+ 區；PMOS 反過來，是 n 型 well 裡的兩塊 p+ 區。所謂 N-channel，指的是通道裡負責導電的載子是電子；P-channel 則是電洞。

Gate 和通道之間隔著一層氧化層，所以在低頻時 gate 不吃任何 DC 電流。這是 MOS 和 BJT 最大的差別：BJT 的 base 一定要有電流流進去。

## 三個操作區

以 NMOS 來說，看 $V_{GS}$ 和 $V_{DS}$ 決定在哪一區：

| 操作區 | 條件 | 行為 |
| --- | --- | --- |
| Cutoff | $V_{GS} < V_{TH}$ | 沒有通道，$I_D \approx 0$ |
| Triode | $V_{GS} > V_{TH}$，$V_{DS} < V_{GS} - V_{TH}$ | 通道從 source 連到 drain，像一顆受 $V_{GS}$ 控制的電阻 |
| Saturation | $V_{GS} > V_{TH}$，$V_{DS} > V_{GS} - V_{TH}$ | 通道在 drain 端被夾斷，像一顆受 $V_{GS}$ 控制的電流源 |

$V_{GS} - V_{TH}$ 常常叫做 overdrive voltage（$V_{ov}$）。

PMOS 的條件把所有不等號反過來：$V_{GS} < V_{TH}$（兩者都是負的）才會導通，$V_{DS} < V_{GS} - V_{TH}$ 才在 saturation。比較不容易搞混的寫法是全部取絕對值、改用 $V_{SG}$、$V_{SD}$：

- 導通：$V_{SG} > |V_{TH}|$
- Saturation：$V_{SD} > V_{SG} - |V_{TH}|$

這樣就和 NMOS 的條件長得一模一樣。

![[aic-mos-iv.svg|I_D 對 V_DS 的曲線，三條是不同的 V_GS。虛線 V_DS = V_GS − V_TH 左邊是 triode，右邊是 saturation；saturation 的曲線不是完全水平，斜率來自 channel-length modulation]]

### Triode：一顆可變電阻

Triode 區的電流是

$$
I_D = \mu_n C_{ox} \frac{W}{L} \left[ (V_{GS} - V_{TH}) V_{DS} - \frac{1}{2} V_{DS}^2 \right]
$$

$V_{DS}$ 很小時，平方項可以忽略，$I_D$ 和 $V_{DS}$ 成正比，MOS 就是一顆電阻：

$$
R_{on} = \frac{1}{\mu_n C_{ox} \frac{W}{L} (V_{GS} - V_{TH})}
$$

$V_{GS}$ 越大，通道越厚，電阻越小。數位電路裡把 MOS 當開關用，打開時就是這顆 $R_{on}$。

### Saturation：pinch-off 和 square law

$V_{DS}$ 加大到超過 $V_{GS} - V_{TH}$ 時，drain 端的 gate-to-channel 電壓不夠維持反轉層，通道在 drain 附近被夾斷（pinch-off）。夾斷不代表電流停止：電子走到通道盡頭後，會被夾斷區的強電場直接掃進 drain。這時 $V_{DS}$ 再加大，多出來的電壓幾乎都落在夾斷區上，通道本身看到的電壓維持在 $V_{GS} - V_{TH}$，所以電流不再隨 $V_{DS}$ 增加：

$$
I_D = \frac{1}{2} \mu_n C_{ox} \frac{W}{L} (V_{GS} - V_{TH})^2
$$

電流只由 $V_{GS}$ 決定，MOS 變成一顆電壓控制的電流源。放大器要用的就是這一區。

## 二階效應

### Channel-length modulation

Pinch-off 點會隨 $V_{DS}$ 往 source 移，有效通道長度變短，電流就微微變大：

$$
I_D = \frac{1}{2} \mu_n C_{ox} \frac{W}{L} (V_{GS} - V_{TH})^2 (1 + \lambda V_{DS})
$$

這讓 saturation 區的曲線有一點斜率，MOS 不再是理想電流源。被縮短的長度 $\Delta L$ 跟 $L$ 本身關係不大，所以 $L$ 越短，$\Delta L / L$ 越大，$\lambda$ 大約和 $1/L$ 成正比。想要電流源比較理想（$r_o$ 比較大），就把 $L$ 拉長。

### Body effect

Source 和 body 不接在一起時，$V_{SB} > 0$ 會讓 source-body 接面的空乏區變寬，要吸出通道需要更大的 gate 電壓，也就是 $V_{TH}$ 變大。這個接面必須維持逆偏，所以 NMOS 的 body 通常接到電路的最低電位。

## 小訊號模型

放大器只在乎操作點附近的小變化，把 MOS 線性化，就得到小訊號模型：

![[Pasted image 20240616134828.png|MOS 的小訊號模型：G 是開路，D 和 S 之間是一顆受 v_gs 控制的電流源 g_m v_gs，並聯輸出電阻 r_o]]

- 轉導（transconductance），也就是電流對 $V_{GS}$ 的斜率：

$$
g_m = \frac{\partial I_D}{\partial V_{GS}} = \mu_n C_{ox} \frac{W}{L} (V_{GS} - V_{TH}) = \sqrt{2 \mu_n C_{ox} \frac{W}{L} I_D} = \frac{2 I_D}{V_{GS} - V_{TH}}
$$

- 輸出電阻，來自 channel-length modulation：

$$
r_o = \frac{1}{\lambda I_D}
$$

- 輸入阻抗：看進 gate 是 $\infty$。

$g_m$ 的三種寫法各有用途：固定尺寸、看 $V_{ov}$ 用第一種；固定電流、看尺寸用第二種；固定電流、看 $V_{ov}$ 用第三種。同樣的電流下，$V_{ov}$ 越小，$g_m$ 越大，但電晶體會越寬。

有了 $g_m$ 和 $r_o$，後面所有放大器的增益都可以寫成「轉導 × 輸出阻抗」，見 [[Electronic_MOS_Amplifiers_blog|MOS 單級放大器]]。BJT 的對應模型見 [[Electronic_BJT_blog|BJT]]。
