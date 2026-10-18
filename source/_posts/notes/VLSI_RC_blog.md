---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 寄生電阻、電容與導線模型
date: '2024-11-16'
updated: '2026-10-17 21:28:02'
tags:
  - VLSI
  - Circuit
summary: 延遲的幾種定義；MOS 本身、fan-out 和導線各自帶來哪些寄生電容；MOS、source / drain、contact 和導線的電阻；最後用 lumped、π model 和 distributed RC 估導線延遲，以及為什麼導線延遲跟長度的平方成正比。
permalink: notes/vlsi-rc/
synced: obsidian
---

Pre-layout simulation 的導線是理想的，做完 layout 和 PEX 之後才會有寄生的電阻和電容（見 [[VLSI_Introduction_blog|full-custom 設計流程]]）。這一章整理寄生效應的來源、和哪些尺寸有關，以及怎麼估計它們造成的延遲。課程總覽見 [[VLSI_blog|積體電路設計導論筆記總覽]]。

## 延遲的定義

| 符號 | 名稱 | 定義 |
| --- | --- | --- |
| $t_{pLH}$ | rising propagation delay | 從輸入切換到輸出上升穿過 $V_{DD}/2$ |
| $t_{pHL}$ | falling propagation delay | 從輸入切換到輸出下降穿過 $V_{DD}/2$ |
| $t_{pd}$ | average propagation delay | $(t_{pHL} + t_{pLH}) / 2$ |
| $t_r$ | rise time | 輸出從 $0.1V_{DD}$ 上升到 $0.9V_{DD}$ |
| $t_f$ | fall time | 輸出從 $0.9V_{DD}$ 下降到 $0.1V_{DD}$ |

## 電容從哪裡來

以反相器推反相器為例，輸出節點上的電容有三個來源：

- **Intrinsic MOS capacitance**：MOS 本身各端點之間的電容，例如 $C_{gs}$、$C_{gd}$
- **Extrinsic（fan-out）capacitance**：下一級邏輯閘的輸入電容
- **Wiring capacitance**：連接兩者的導線

### Intrinsic MOS capacitance

分成三種：

- **Structure（overlap）capacitance**：gate 和 source、drain 重疊部分的電容，大小和 W 成正比：$C_{GSO} = C_{GDO} = C_O W$。
- **Channel capacitance**：gate 和通道之間的電容。依操作區分配給 source、drain 或 body，所以是非線性的，會隨操作電壓改變。
- **Diffusion capacitance**：source、drain 和 body 之間反向偏壓 pn 接面的空乏區電容。

合起來，MOS 各端點之間的電容是：

$$
\begin{aligned}
C_{GS} &= C_{GCS} + C_{GSO}, & C_{GD} &= C_{GCD} + C_{GDO}, & C_{GB} &= C_{GCB} \\
C_{SB} &= C_{S,diff}, & C_{DB} &= C_{D,diff}
\end{aligned}
$$

![[vlsi-mos-capacitance.svg|MOS 各端點之間的寄生電容。橘色粗線是 gate 和 source、drain 重疊的部分，對應 CGSO 和 CGDO]]


Channel capacitance 在不同操作區的分配：

| 操作區 | $C_{GCB}$ | $C_{GCS}$ | $C_{GCD}$ | Gate 總電容 $C_G$ |
| --- | --- | --- | --- | --- |
| Cutoff | $C_{ox}WL$ | 0 | 0 | $C_{ox}WL + 2C_O W$ |
| Linear | 0 | $\frac{1}{2}C_{ox}WL$ | $\frac{1}{2}C_{ox}WL$ | $C_{ox}WL + 2C_O W$ |
| Saturation | 0 | $\frac{2}{3}C_{ox}WL$ | 0 | $\frac{2}{3}C_{ox}WL + 2C_O W$ |

數位電路裡的電晶體大多在 cutoff 或 saturation，所以這兩列最重要。

Diffusion capacitance 分成底面和側面：擴散區的底面是平板電容，四周的側壁也各自形成電容。長 $L_S$、寬 $W$ 的 source：

$$
C_{diff} = C_j \, L_S W + C_{jsw}\left(2L_S + W\right)
$$

擴散區越大電容越大，所以 layout 時 drain 的面積要盡量小。

### Extrinsic（fan-out）capacitance

下一級邏輯閘（NMOS M3 和 PMOS M4）的 gate 總電容：

$$
C_{fan\text{-}out} = C_{gate}(\text{NMOS}) + C_{gate}(\text{PMOS})
= \left(C_{GSO,n} + C_{GDO,n} + W_n L_n C_{ox}\right) + \left(C_{GSO,p} + C_{GDO,p} + W_p L_p C_{ox}\right)
$$

這是簡化的模型，假設這些電容都接在輸出和 GND（或 $V_{DD}$）之間，而且 channel capacitance 是定值。

## 導線電容

導線電容由長度、寬度和周圍的結構決定。以 Metal 2 為例，電容有三種形式：

| 類型 | 和什麼成正比 | 和什麼成反比 |
| --- | --- | --- |
| Area to area | 面積 $W \times L$ | 和上下層的距離 |
| Fringe to area | 長度 $L$ | 和上下層的距離 |
| Fringe to fringe | 長度 $L$ | 和同一層相鄰導線的距離 |

$$
C_{wire} = C_{pp} + C_{fringe} + C_{interwire}
$$

![[vlsi-wire-capacitance.svg|導線電容的三種形式：對下一層的平行板電容、邊緣電容，以及同一層相鄰導線之間的電容]]


- **平行板電容 $C_{pp}$**：導線和上下層之間，和面積成正比、和層間距離成反比。
- **邊緣電容 $C_{fringe}$**：導線邊緣到上下層的電場。導線越窄，平行板面積越小，邊緣的比例越大。
- **線間電容 $C_{interwire}$**：同一層相鄰導線之間。

### 幾個觀察

- $W/H < 1.5$（$H$ 是導線到下一層的距離）時，fringe 的部分會超過平行板的部分，總電容可能是平行板估計值的 10 倍以上。
- $W/H < 1.75$ 時，線間電容開始變成主要的部分。
- 越高層的金屬離基板越遠，線間電容的比例越高。

### 繞線的經驗法則

- 不要用 diffusion 繞線。
- Poly 只用在很短的距離，它的 RC 太大，不適合長距離傳輸。
- 導線越短，R 和 C 都越小。
- 導線越細，C 越小但 R 越大。

## 電阻

### MOS 的等效電阻

把導通的 MOS 看成電阻 $R_{eq}$。它其實是非線性的，所以取切換過程兩個端點（$V_{DD}$ 和 $V_{DD}/2$）的平均：

- $R_{eq}$ 和 W/L 成反比，W 加倍，$R_{eq}$ 減半。
- $V_{DD}$ 遠大於 $V_T + V_{DSAT}/2$ 時，$R_{eq}$ 幾乎和 $V_{DD}$ 無關，再加大 $V_{DD}$ 只有些微改善（來自 channel length modulation）。
- $V_{DD}$ 接近 $V_T$ 時，$R_{eq}$ 急遽上升。

### Source 和 drain 的電阻

$$
R_{S,D} = \frac{L_{S,D}}{W} R_{\square}
$$

$L_{S,D}$ 是 source / drain 擴散區的長度，$R_{\square}$ 是擴散區的 sheet resistance，大約 20 到 100 Ω/□；加了 silicide 之後可以降到 1 到 4 Ω/□。製程越先進、接面越淺，這部分越明顯。

### Contact 的電阻

每換一層繞線都要經過 contact 或 via，多一段電阻：

- 訊號線盡量留在同一層，避免多餘的 contact。
- 把 via 做大，或用多個最小尺寸的 via 並聯，都可以降低電阻。

典型值是 metal 或 poly 到擴散區、metal 到 poly 約 5 到 20 Ω，metal 到 metal 約 1 到 5 Ω。

### 導線的電阻與 sheet resistance

導線厚度 $H$ 在同一層是固定的，所以把 $\rho / H$ 合併成 sheet resistance $R_{\square}$：

$$
R = \frac{\rho L}{H W} = R_{\square} \frac{L}{W}
$$

長 $L$、寬 $W$ 的導線可以看成 $L/W$ 個正方形串聯，每個正方形的電阻都是 $R_{\square}$，和正方形的大小無關。

## 導線模型

導線的寄生效應會影響可靠度、效能和功耗，依情況可以簡化：

- 導線電阻夠大、或訊號的上升下降夠慢時，可以忽略電感。
- 導線很短、截面很大、或材料電阻很低時，可以只考慮電容。
- 相鄰導線距離很遠、或平行的距離很短時，可以忽略線間電容，把所有電容都當成接地。

### 從簡單到精確

- **Ideal wire**：整條導線同一時間是同一個電壓，只適用於很短的導線。
- **Lumped C**：把導線的電容集中成一顆，由 driver 的電阻充電。
- **Lumped RC**：把總電阻和總電容各集中成一顆，適合短導線，長導線就不準。
- **Distributed RC**：把導線切成很多小段，每段有自己的 $r$ 和 $c$（單位長度的電阻和電容）。

![[vlsi-wire-models.svg|三種導線模型：lumped RC、π model，以及切成 N 段的 distributed RC]]


切成小段時用的形狀也有影響：3 段 π model 就能準到 3% 以內，L model 要 100 段才有同樣的準確度。估 Elmore delay 時，一段 π model 就夠了。

### Elmore delay

導線、一串 pass transistor、PUN 和 PDN 都可以看成一個 RC tree：只有一個輸入節點、所有電容都接地、沒有電阻迴路。節點 $i$ 的 Elmore delay 是

$$
\tau_i = \sum_k c_k \, r_{ik}
$$

$r_{ik}$ 是從輸入到節點 $i$、和從輸入到節點 $k$ 兩條路徑**共用的**電阻。

### Distributed RC 導線

長度 $L$ 的導線切成 $N$ 段，每段的電阻和電容是 $rL/N$ 和 $cL/N$。這是一條 RC chain，最末端的 Elmore delay：

$$
\tau_N = \left(\frac{L}{N}\right)^2 \left(cr + 2cr + \cdots + Ncr\right)
= rcL^2 \frac{N + 1}{2N}
= RC \, \frac{N + 1}{2N}
$$

$R = rL$、$C = cL$ 是整條導線的總電阻和總電容。$N \to \infty$ 時：

$$
\tau = \frac{RC}{2} = \frac{rcL^2}{2}
$$

兩個結論：

- **導線延遲和長度的平方成正比**，長度加倍，延遲變四倍，所以長導線要插 repeater。
- Distributed 模型算出的延遲只有 lumped RC 模型的一半。

兩種模型的 step response：

| 電壓範圍 | Lumped RC | Distributed RC |
| --- | --- | --- |
| 0 → 50%（$t_p$） | $0.69RC$ | $0.38RC$ |
| 0 → 63%（$\tau$） | $RC$ | $0.5RC$ |
| 10% → 90%（$t_r$） | $2.2RC$ | $0.9RC$ |
| 0 → 90% | $2.3RC$ | $1.0RC$ |

0.69 是 $\ln 2$，2.2 是 $\ln 9$，分別是一階 RC 電路到 50% 和從 10% 到 90% 的時間，推導見 [[VLSI_inverter_blog|CMOS 反相器]]。
