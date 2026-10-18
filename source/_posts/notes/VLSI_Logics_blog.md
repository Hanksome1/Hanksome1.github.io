---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 組合邏輯電路：static CMOS、pass transistor 與 dynamic logic
date: '2024-09-24'
updated: '2026-10-17 21:27:36'
tags:
  - VLSI
  - Circuit
summary: 用電晶體實作邏輯閘的幾種做法：static CMOS 的 PUN 與 PDN、只用 N 顆電晶體的 pass-transistor logic 和 transmission gate，以及靠電容暫存的 dynamic logic、它的五個問題，還有 domino 和 np-CMOS 怎麼解決串接的問題。
permalink: notes/vlsi-logic/
synced: obsidian
---

同一個邏輯函數有很多種電晶體電路的做法，差別在電晶體數量、速度、功耗和對雜訊的敏感度。這一章依序是 static CMOS、pass-transistor logic 和 dynamic logic。課程總覽見 [[VLSI_blog|積體電路設計導論筆記總覽]]。

## Static CMOS

Static CMOS 由兩個網路組成：

- **PUN**（pull-up network）：只用 PMOS，負責把輸出拉到 $V_{DD}$
- **PDN**（pull-down network）：只用 NMOS，負責把輸出拉到 GND

這樣分工是因為 PMOS 傳得出 strong 1、NMOS 傳得出 strong 0（見 [[VLSI_Process_Introduction_blog|MOS 元件特性]]）。除了切換的瞬間，輸出隨時都經由低阻抗路徑接到 $V_{DD}$ 或 GND，所以叫 static。N 個輸入的邏輯閘需要 **2N** 顆電晶體。

電晶體串聯和並聯對應的邏輯：

| | 串聯 | 並聯 |
| --- | --- | --- |
| PDN（NMOS，輸入 1 時導通） | NAND：全部是 1 才拉低 | NOR：任一個是 1 就拉低 |
| PUN（PMOS，輸入 0 時導通） | NOR：全部是 0 才拉高 | NAND：任一個是 0 就拉高 |

所以 PUN 和 PDN 互為 **dual**：PDN 裡串聯的地方，在 PUN 裡就是並聯，反之亦然。設計時先畫 PDN，再對調串並聯、把 NMOS 換成 PMOS，就得到 PUN。

例如 $F = \overline{A \cdot B + C}$：

- PDN：A、B 兩顆 NMOS 串聯，再和 C 並聯
- PUN：A、B 兩顆 PMOS 並聯，再和 C 串聯

![[vlsi-static-cmos-gate.svg|F = NOT(A·B + C) 的 static CMOS：PDN 是 A、B 串聯再和 C 並聯，PUN 剛好相反]]


## Pass-transistor logic

Pass-transistor（PT）logic 除了把輸入接到 gate，也把輸入接到 source / drain，由 gate 的電壓決定訊號能不能通過。例如 $F = A \cdot B$ 可以用一顆 gate 接 B 的 NMOS 把 A 傳到輸出，再用一顆 gate 接 $\overline{B}$ 的 NMOS 在 B = 0 時把輸出拉到 0。

- 只需要 N 顆電晶體，不用 2N 顆
- 理想上沒有 static power
- 但 PT 本身沒有驅動能力，訊號每經過一顆 PT 就衰減一些，串太多級時要插入 static CMOS 反相器把訊號補回來

### 問題：weak 1 與 weak 0

NMOS 只能傳 strong 0、weak 1，PMOS 只能傳 strong 1、weak 0。NMOS 傳 1 時，節點 x 只到 $V_{DD} - V_{Tn}$（加上 body effect 還會更低）。如果 x 接著去推一個反相器，反相器的 PMOS 沒辦法完全關掉，$V_{DD}$ 到 GND 之間就有靜態電流。

如果把 PT 的輸出接到下一顆 PT 的 **gate**，每一級都會再掉一個 $V_{Tn}$，所以不能這樣串接。

### 解法一：Level restorer

在反相器輸出和節點 x 之間加一顆回授的 PMOS $M_r$：x 高到讓反相器輸出變 0 時，$M_r$ 導通，把 x 拉到完整的 $V_{DD}$，反相器就不會有靜態電流。$M_r$ 只在輸出是 0（x 是 1）時打開，其他時候不會和 PT 互相干擾。

![[vlsi-level-restorer.svg|Level restorer：x 被拉高之後 Out 變 0，回授的 PMOS Mr 打開，把 x 補到完整的 VDD]]


但這是 **ratioed** 電路，尺寸要算好：

- 要把 x 從 1 拉回 0 時，pass transistor $M_n$ 必須比 $M_r$ 強。$M_n$ 太弱的話，x 會被 $M_r$ 卡在高電位，訊號傳不進去。
- $M_r$ 太大會增加 x 上的電容，讓這個節點變慢。

### 解法二：Transmission gate

把一顆 NMOS 和一顆 PMOS 並聯，gate 分別接 C 和 $\overline{C}$。C = 1 時兩顆都導通，NMOS 負責傳 0、PMOS 負責傳 1，所以兩種值都是 full swing，而且是雙向的。這是最常用的做法。

![[vlsi-transmission-gate.svg|Transmission gate：NMOS 和 PMOS 並聯，由互補的 C 控制；右邊是它的符號，泡泡那一端接 PMOS 的 gate]]


Transmission gate 很適合做 MUX 和 XOR：transmission gate 加上反相器，6 顆電晶體就能做出 XOR，常用在加法器裡。

## Dynamic logic

Dynamic circuit 把訊號暫存在高阻抗節點的電容上。Dynamic gate 由三部分組成：

- 一顆 clock 控制的 PMOS $M_p$，接在 $V_{DD}$ 和輸出之間
- 實作邏輯的 PDN
- 一顆 clock 控制的 NMOS $M_e$（evaluation transistor），接在 PDN 和 GND 之間

運作分兩個階段：

1. **Precharge**（CLK = 0）：$M_p$ 導通、$M_e$ 關閉，輸出被充到 $V_{DD}$。
2. **Evaluate**（CLK = 1）：$M_p$ 關閉、$M_e$ 導通。PDN 導通的話輸出放電到 0；否則輸出維持 1，但這時沒有任何東西驅動它，電壓只存在負載電容上。

![[vlsi-dynamic-gate.svg|Dynamic gate：CLK = 0 時 precharge 到 1，CLK = 1 時由 PDN 決定要不要放電。橘色是可選的 keeper，用來補回漏掉的電荷]]


特性：

- 邏輯只由 PDN 實作，只需要 **N + 2** 顆電晶體。
- 速度快：電晶體少、負載電容小，也沒有 PUN 和 PDN 同時導通的 short-circuit current。輸出 1 在 precharge 時就準備好了，所以 $t_{pLH} = 0$。
- 需要額外的 precharge clock。
- 輸出在 evaluation 時放電後，要等下一次 precharge 才能回到 1。所以 evaluation 期間輸入最多只能變一次，而且只能從 0 變 1。

### 功耗跟資料有關

只有前一個 cycle 輸出是 0 時，precharge 才要重新充電，所以 dynamic gate 的功耗和資料有關，switching activity 也可能比 static CMOS 高。以 2 輸入 NOR 為例，假設 A、B 各有一半機率是 1：

- 輸出是 0 的機率是 3/4。Dynamic NOR 每次輸出是 0，下一次 precharge 都要再充回 1，所以 $P_{0 \to 1} = 3/4$。
- Static NOR 只有在輸出從 0 變 1 時才充電，$P_{0 \to 1} = P_0 \times P_1 = \frac{3}{4} \times \frac{1}{4} = \frac{3}{16}$。

Switching activity 對功耗的影響見 [[VLSI_chip_blog|晶片的功耗]]。

### Evaluation 時間與雜訊

輸出在 evaluation 時是浮接的，輸入就算只是因為雜訊稍微高於 0，PDN 也會微微導通，輸出慢慢漏掉。掉多少取決於：

- 輸入的電壓：越接近 $V_{Tn}$，電流越大，放電越快。
- 可用的 evaluation 時間：時間越長，掉得越多。

也就是說，evaluation 時間越短，能容忍的雜訊越大，dynamic gate 的抗雜訊能力和時間有關。

### Dynamic logic 的五個問題

1. **Charge leakage**：輸出是 1 時沒有電源驅動，電荷會經由漏電流慢慢流到 GND。clock 太慢的話，電壓掉到下一級的切換點以下就會被讀成 0，所以 dynamic logic 有最低操作頻率（大約幾 kHz）。解法是加一顆 **keeper**：小 PMOS，gate 接輸出反相後的訊號，輸出是 1 時持續補充電荷，和 level restorer 的概念相同。
2. **Charge sharing**：PDN 的中間節點也有電容。中間節點原本是 0 時，evaluation 時它和輸出接通（但到 GND 的路徑沒通），輸出的電荷會被分過去。中間節點電容 $C_a$、輸出電容 $C_L$ 時，最壞情況是
   $$
   \Delta V_{out} = -V_{DD} \, \frac{C_a}{C_a + C_L}
   $$
   掉到下一級的切換點以下就會出錯。解法是 precharge 時也把中間節點充到 $V_{DD}$，代價是面積和功耗。
3. **Backgate coupling**：dynamic gate 的輸出 out1 接到下一級 static gate 的 gate（例如 M4）。out2 下降時，會經由 M4 的 $C_{gs}$ 和 $C_{gd}$ 耦合到 out1；out1 是浮接節點，電壓就被拉低。
4. **Clock feedthrough**：precharge PMOS 的 gate 接 clock，clock 的快速邊緣會經由電容耦合到輸出。CLK 從 0 變 1 時輸出可能高於 $V_{DD}$，從 1 變 0 時可能低於 0。
5. **Cascading gates**：dynamic gate 直接推另一個 dynamic gate 會出錯。Evaluation 一開始，第一級的 out1 還是 precharge 的 1，即使稍後會放電成 0，第二級已經看到 1 並開始讓 out2 放電。等 out1 變 0 時，out2 放掉的電荷已經補不回來。所以 evaluation 期間輸入只能有 0 → 1 的變化。

![[vlsi-charge-sharing.svg|Charge sharing：evaluate 時 A = 1、B = 0，輸出沒有放電路徑，但 CL 上的電荷會分一部分給中間節點的 Ca]]


## Domino logic

解決串接問題最直接的方法，是在每個 dynamic gate 後面接一個 static 反相器：

- Precharge 時 dynamic node 是 1，反相器輸出 **0**，所以下一級 PDN 的輸入一開始都是 0，不會被誤觸發。
- Evaluation 時每一級的輸出只會 0 → 1，符合下一級的要求。

訊號一級一級往後傳，像骨牌一樣，所以叫 domino。

![[vlsi-domino.svg|Domino logic：每個 dynamic gate 後面接一個反相器，下一級的輸入在 evaluate 時只會從 0 變 1]]


Domino logic 的特性：

- **只能做 non-inverting 的邏輯**，因為每一級的輸出只能從 0 變 1。要做反相的函數，可以用 Boolean 轉換重新安排邏輯、用 dual-rail（同時算出正反兩種結果），或改用 np-CMOS。
- 速度很快，後面的 static 反相器也可以依 fan-out 單獨調整尺寸。

例如 zero detector：8 顆 NMOS 並聯成 PDN，任一個輸入是 1，dynamic node 就放電，反相後輸出 1；全部是 0 時輸出才維持 0，可以用來檢查一串 bit 是否全為 0。

## np-CMOS（zipper）

另一種做法是交替使用兩種 dynamic gate：

- **n 型**：PDN 實作邏輯，precharge 到 1，evaluation 時輸出只會 1 → 0
- **p 型**：PUN 實作邏輯，clock 反相，pre-discharge 到 0，evaluation 時輸出只會 0 → 1

兩種網路各有不能接受的輸入變化：

- PDN（NMOS）不能接受 1 → 0 的輸入，因為 NMOS 會先被打開，提早放電。
- PUN（PMOS）不能接受 0 → 1 的輸入，因為 PMOS 會先被打開。

n 型輸出的 1 → 0 適合接 p 型的 PUN，p 型輸出的 0 → 1 適合接 n 型的 PDN。兩種交錯串接就不需要中間的反相器；n 型一定要接 n 型時，再像 domino 一樣插一個反相器。

![[vlsi-np-cmos.svg|np-CMOS：n 型的輸出只會 1 → 0，剛好接 p 型的 PUN；p 型的輸出只會 0 → 1，再接下一級 n 型的 PDN]]
