---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: MOS 單級放大器：CS、CG 與 CD
date: '2024-05-22'
updated: '2026-10-16 21:49:33'
tags:
  - Electronics
  - Amplifier
summary: 從三個端點看進 MOS 的阻抗出發，整理 common source（電阻、電流源、diode-connected 三種負載）、source degeneration、common gate（附一個偏壓設計例題）和 common drain 的增益、輸入阻抗與輸出阻抗。
permalink: notes/electronics-mos-amps/
synced: obsidian
---

一顆 MOS 有三個端點，訊號從一個端點進、從另一個出，剩下那個接在交流接地，就得到三種單級放大器：common source（CS）、common gate（CG）、common drain（CD）。MOS 本身的模型見 [[Electronic_MOSFET_blog|MOSFET]]，課程總覽見[[Electronic_blog|電子學（一）筆記總覽]]。

## 先記住三個阻抗

分析單級放大器時，幾乎只需要知道「從某個端點看進去是多少歐姆」：

![[el-mos-impedances.svg|從 MOS 的三個端點看進去的小訊號阻抗。gate 是無限大；source 大約是 1/g_m，很小；drain 本來是 r_o，source 下面接了 R_S 之後被放大成大約 g_m r_o R_S]]

- **看進 gate：** $\infty$。
- **看進 source**（gate 接固定電壓）：$\dfrac{1}{g_m} + \dfrac{R_D}{g_m r_o} \approx \dfrac{1}{g_m}$，很小。
- **看進 drain**（source 下面接 $R_S$）：$r_o + (1 + g_m r_o) R_S \approx g_m r_o R_S$。$R_S = 0$ 時就是 $r_o$。

再加上一句：**增益 ≈ −（輸入端的等效轉導）×（輸出節點看到的總阻抗）**。下面每個公式都是這兩件事的組合。

## Common source

訊號從 gate 進、從 drain 出，source 接地。

![[2024-05-22_18-19.jpeg|電阻負載的 common source：V_in 接 gate，I_D 流過上面的電阻產生 V_out]]

![[2024-05-22_18-20 1.jpeg|它的小訊號模型：gate 開路，drain 上的 g_m v_gs、r_o 和 R_D 並聯]]

$V_{in}$ 越大，$I_D$ 越大，$R_D$ 上的壓降越大，$V_{out}$ 越低，所以 CS 是反相放大器（輸出和輸入差 180°）：

- 增益：$A_v = -g_m (R_D \parallel r_o)$
- 輸入阻抗：$\infty$
- 輸出阻抗：$R_D \parallel r_o$

### 負載的取捨

![[2024-05-22_18-31_1.jpeg|三種負載。(I) 電阻：R 大時 IR drop 很大。(II) 電流源（PMOS）：只吃掉很小的壓降。(III) diode-connected 的 PMOS：增益只看兩顆電晶體的尺寸比]]

**(I) 電阻負載。** 增益和壓降被歐姆定律綁在一起：$R_D$ 大，增益大，但 $I_D R_D$ 也大，drain 電壓被壓低，電晶體可能掉進 triode；$R_D$ 小，壓降小了，增益也小了。

**(II) 電流源負載。** 把電阻換成一顆偏壓在 saturation 的 PMOS：

![[2024-05-22_18-26.jpeg|電流源負載的 CS 和它的轉移曲線。V_in 從小到大，依序是：M1 關閉、輸出停在 V_DD；M1 saturation 而 M2 triode；兩顆都在 saturation（中間陡峭的那段）；M1 掉進 triode]]

![[2024-05-22_18-26_1.jpeg|小訊號模型：上面那顆 PMOS 的 gate 接固定電壓，所以它只剩 r_o2，和 M1 的 r_o1 並聯]]

PMOS 的 gate 接固定電壓，在小訊號下它只剩一顆 $r_{o2}$，所以

- 增益：$A_v = -g_{m1} (r_{o1} \parallel r_{o2})$
- 輸入阻抗：$\infty$
- 輸出阻抗：$r_{o1} \parallel r_{o2}$

$r_o$ 通常比能放的 $R_D$ 大很多，增益也就大很多；而 PMOS 只需要 $|V_{GS} - V_{TH}|$ 左右的壓降就能維持電流。轉移曲線中間那段兩顆都在 saturation 的區域非常陡，那就是高增益的放大區。

**(III) Diode-connected 負載。** 把負載 PMOS 的 gate 和 drain 接在一起（原本的筆記叫它 self bias）。Diode-connected 的電晶體在小訊號下就是一顆 $\frac{1}{g_m} \parallel r_o \approx \frac{1}{g_m}$ 的電阻（為什麼，見 [[Electronic_CurrentMirror_blog#Diode-connected|diode-connected]]），所以

$$
A_v = -g_{m1} \left( \frac{1}{g_{m2}} \parallel r_{o1} \parallel r_{o2} \right) \approx -\frac{g_{m1}}{g_{m2}} = -\sqrt{\frac{\mu_n (W/L)_1}{\mu_p (W/L)_2}}
$$

（兩顆電晶體電流相同，$g_m = \sqrt{2 \mu C_{ox} (W/L) I_D}$ 的比值裡電流消掉了。）$r_o$ 都遠大於 $1/g_m$，並聯時可以忽略，所以增益只剩尺寸比。增益不大，但跟偏壓電流、製程的絕對參數無關，可以很精準地設計。

## Source degeneration

在 source 和地之間串一顆 $R_S$：

![[Pasted image 20240522223206.png|CS 加上 source degeneration：source 下面接 R_S。紅線框起來的部分可以看成一顆等效轉導 G_m 的電晶體]]

$R_S$ 上的壓降會吃掉一部分輸入電壓，真正落在 $v_{gs}$ 上的變少了。把 MOS 和 $R_S$ 一起看成一顆「新的電晶體」，它的等效轉導是

$$
G_m = \frac{g_m}{1 + g_m R_S}
$$

（$g_m$ 倍的電流流進 $R_S$，所以分母多了 $g_m R_S$。）忽略 $r_o$ 時：

- 增益：$A_v = -G_m R_D = -\dfrac{g_m R_D}{1 + g_m R_S} \approx -\dfrac{R_D}{R_S}$（$g_m R_S \gg 1$ 時）
- 輸入阻抗：$\infty$
- 輸出阻抗：看進 drain 是 $r_o + (1 + g_m r_o) R_S \approx g_m r_o R_S$，整級再並聯 $R_D$

Degeneration 用增益換來兩件事：增益變成兩顆電阻的比值，不再依賴 $g_m$，比較線性、比較穩定；從 drain 看進去的阻抗被放大，這是後面 cascode 的基礎（見 [[Electronic_CurrentMirror_blog|電流鏡與 cascode]]）。我原本的筆記裡寫 MOS 的 degeneration 沒有 BJT 那麼有用，因為 MOS 本身就有 $V_{GS} - V_{TH}$、$I_D$、$W/L$ 好幾個旋鈕可以調；要拉高阻抗時，它還是很有用。

## Common gate

訊號從 source 進、從 drain 出，gate 接固定偏壓 $V_b$。$v_{in}$ 往上，$v_{gs}$ 變小，電流變小，drain 電壓上升，所以 CG 是非反相的。

![[Pasted image 20240522223605.png|Common gate：gate 接 V_B，輸入從 source 經過 R_S 進來，負載是 R_D。右邊是小訊號模型]]

設輸入訊號源串著電阻 $R_S$，忽略 $r_o$：

- 增益：

$$
A_v = \frac{g_m R_D}{1 + g_m R_S} = \frac{R_D}{\frac{1}{g_m} + R_S}
$$

- 輸入阻抗（從 source 看進去）：

$$
Z_{in} = \frac{1}{g_m} + \frac{R_D}{g_m r_o} \approx \frac{1}{g_m}
$$

- 輸出阻抗：

$$
Z_{out} = R_D \parallel \left[ (1 + g_m r_o) R_S + r_o \right]
$$

增益的式子可以這樣讀：訊號源的電壓先在 $R_S$ 和 $1/g_m$ 之間分壓，流進 source 的電流全部從 drain 出來，在 $R_D$ 上變成電壓。CG 的輸入阻抗很低、輸出阻抗很高，很適合當電流緩衝（current buffer）：把電流從一個低阻抗的地方搬到高阻抗的地方。

### 例題：CG 的偏壓設計

![[Pasted image 20240522224953.png|課本 Example 7.14 的手算：設計一顆 CG，輸入阻抗 1/g_m = 50 Ω、功耗 2 mW，V_TH = 0.5 V，μ_n C_ox = 100 μA/V²，V_DD = 1.8 V]]

規格：$1/g_m = 50\ \Omega$，功耗 2 mW，$V_{DD} = 1.8$ V，$V_{TH} = 0.5$ V，$\mu_n C_{ox} = 100\ \mu\text{A/V}^2$。Gate 用 $R_1$、$R_2$ 分壓偏壓，source 經過 $R_S$ 接地，輸入用電容耦合到 source。

1. **分配電流。** 總電流 $= 2\ \text{mW} / 1.8\ \text{V} = 1.11$ mA。電晶體拿 1.1 mA 來放大，分壓電阻只拿 0.01 mA 來偏壓，所以 $R_1 + R_2 = 1.8\ \text{V} / 0.01\ \text{mA} = 180\ \text{k}\Omega$。
2. **選 $R_S$。** 從輸入看進去是 $R_S \parallel \frac{1}{g_m}$。$R_S$ 選成 $1/g_m$ 的 10 倍（500 Ω），大部分訊號電流就會流進電晶體，而不是被 $R_S$ 分走。
3. **算 $V_{GS}$。** $g_m = \frac{2 I_D}{V_{GS} - V_{TH}}$，所以 $V_{GS} - V_{TH} = 2 \times 1.1\ \text{mA} \times 50\ \Omega = 0.11$ V，$V_{GS} = 0.61$ V。代回 square law，$W/L = \frac{2 I_D}{\mu_n C_{ox} (V_{GS} - V_{TH})^2} \approx 1800$。
4. **算 gate 電壓。** $V_X = V_{GS} + I_D R_S = 0.61 + 1.1\ \text{mA} \times 500\ \Omega = 1.16$ V。
5. **分壓電阻。** $R_2 = 1.16\ \text{V} / 0.01\ \text{mA} = 116\ \text{k}\Omega$，$R_1 = 180 - 116 = 64\ \text{k}\Omega$。

## Common drain（source follower）

訊號從 gate 進、從 source 出，drain 接 $V_{DD}$。

![[Pasted image 20240522225939.png|Common drain：輸出從 source 拉出來，source 下面是 R_L。右邊是小訊號模型]]

![[Pasted image 20240531215239.png|把電晶體看成一顆 1/g_m 的電阻：輸出就是 1/g_m 和 R_S ∥ r_o 之間的分壓]]

從 source 看上去是 $1/g_m$，所以輸出就是輸入在 $1/g_m$ 和 $R_S \parallel r_o$ 之間的分壓（忽略 body effect）：

- 增益：

$$
A_v = \frac{R_S \parallel r_o}{\frac{1}{g_m} + R_S \parallel r_o} < 1
$$

- 輸入阻抗：$\infty$
- 輸出阻抗：$\frac{1}{g_m} \parallel R_S \parallel r_o$

增益接近 1、輸入阻抗無限大、輸出阻抗很小，所以 CD 常被當成電壓緩衝（voltage follower）：不放大，只負責把一個高阻抗節點的電壓「搬」去推一個低阻抗的負載。

## 整理

![[Pasted image 20240522230759.png|我自己整理的三種接法：CS、CG、CD 的增益、輸入阻抗和輸出阻抗]]

| | Common source | Common gate | Common drain |
| --- | --- | --- | --- |
| 輸入 → 輸出 | gate → drain | source → drain | gate → source |
| 增益 | $-g_m (R_D \parallel r_o)$ | $\approx \dfrac{R_D}{1/g_m + R_S}$ | $\dfrac{R_S \parallel r_o}{1/g_m + R_S \parallel r_o}$ |
| 相位 | 反相 | 同相 | 同相 |
| 輸入阻抗 | $\infty$ | $\approx 1/g_m$ | $\infty$ |
| 輸出阻抗 | $R_D \parallel r_o$ | $R_D \parallel [(1 + g_m r_o) R_S + r_o]$ | $\frac{1}{g_m} \parallel R_S \parallel r_o$ |
| 用途 | 電壓放大 | 電流緩衝 | 電壓緩衝 |

BJT 的三種對應電路見 [[Electronic_BJT_Amplifiers_blog|BJT 單級放大器]]，它們的頻率響應和更多負載變化見電子學（二）的 [[AIC_SingleStageAmp_blog|單級放大器]]。
