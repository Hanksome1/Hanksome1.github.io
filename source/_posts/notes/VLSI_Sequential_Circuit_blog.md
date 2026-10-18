---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 時序電路：latch、flip-flop 與時序限制
date: '2024-11-17'
updated: '2026-10-17 21:28:41'
tags:
  - VLSI
  - Circuit
  - STA
summary: Setup 和 hold 的時序限制、static 與 dynamic storage；latch 的幾種電晶體實作與 race 問題；master-slave flip-flop 的 setup time、clock-to-Q 和 hold time 從哪裡來；以及 clock 不理想時，two-phase clock 的 overlap 會造成什麼問題。
permalink: notes/vlsi-sequential/
synced: obsidian
---

組合邏輯的輸出只和現在的輸入有關；時序電路的輸出還和過去的輸入有關，需要記憶元件存狀態，例如 FSM 和 pipeline。這一章先看時序限制，再看 latch 和 flip-flop 在電晶體層級的做法。課程總覽見 [[VLSI_blog|積體電路設計導論筆記總覽]]。

## 時序限制

同步電路可以簡化成：暫存器 → 組合邏輯 → 下一排暫存器，全部由週期 $T$ 的同一個 clock 驅動。

| 符號 | 意義 |
| --- | --- |
| $T$ | clock 週期 |
| $t_{setup}$ | 暫存器的 setup time |
| $t_{hold}$ | 暫存器的 hold time |
| $t_{c-q}$ | 暫存器的 propagation delay（clock 到 Q） |
| $t_{cd,reg}$ | 暫存器的 contamination delay |
| $t_{pd,logic}$ | 組合邏輯的 propagation delay |
| $t_{cd,logic}$ | 組合邏輯的 contamination delay |

**Propagation delay** 是輸出最晚穩定的時間，**contamination delay** 是輸出最早開始變化的時間。兩條限制：

$$
T \ge t_{c-q} + t_{pd,logic} + t_{setup}
$$

$$
t_{hold} \le t_{cd,reg} + t_{cd,logic}
$$

![[vlsi-timing-constraints.svg|上：兩級暫存器之間夾著組合邏輯。下：setup 檢查最長路徑要在下一個 clock edge 之前到；hold 檢查最短路徑不能在 hold time 結束前就到]]


- **Max delay constraint**：組合邏輯不能太慢。資料從前一級暫存器出發、經過邏輯，加上 setup time，必須在下一個 clock edge 之前到，否則會取樣到錯的值，這是 **setup time failure**。
- **Min delay constraint**：組合邏輯也不能太快。新資料不能在 hold time 結束前就到下一級，否則會在同一個 clock edge 被取樣，蓋掉原本該存的值，這是 **hold time failure**（race condition）。Hold time 和 clock 週期無關，降頻也沒用，只能讓邏輯變慢（例如插 buffer）。

## Static 與 dynamic storage

- **Static storage**：用正回授（例如兩個反相器頭尾相接）存狀態，有電就一直保持，適合不常更新的情況，例如被 clock gating 關掉的暫存器。
- **Dynamic storage**：把狀態存在寄生電容上，只能保持很短的時間（毫秒等級），要定期 refresh。電路通常比較簡單，所以比較快、比較省電。

兩個反相器頭尾相接能存狀態，是因為這個迴路只有兩個穩定點（0 和 1）。中間還有一個 metastable 點，但迴路在轉換區的增益大於 1，任何擾動都會被放大，最後落到其中一個穩定點。

## Latch

Latch 是 **level sensitive** 的：

- **Positive latch**：clock 為高時 transparent，輸入直接傳到 Q；clock 為低時進入 hold，保持 clock 下降那一刻的值。
- **Negative latch**：相反，clock 為低時 transparent。

### MUX-based latch

Latch 可以看成 2 選 1 的 MUX：transparent 時選輸入 D，hold 時選自己的輸出回授，靠這個迴路保持存的值。要寫入新值時就切斷回授。

![[vlsi-tg-latch.svg|用 transmission gate 做的 positive latch：T1 決定 D 能不能進來，T2 決定回授迴路有沒有接上]]


用電晶體實作 MUX 有兩種方式：

- **Transmission gate**：一個 TG 接 D、一個接回授，由互補的 clock 控制。訊號是 full swing，但 clock 要推 4 顆電晶體，負載比較大。
- **Pass transistor**：把 TG 換成單顆 NMOS，面積和 clock 負載都比較小，但輸出會掉一個 threshold（見 [[VLSI_Logics_blog|pass-transistor logic]]），noise margin 和效能都比較差。

### Latch 的 race 問題

如果整個電路都用同一個 phase 的 latch，clock 為高時所有 latch 都 transparent。訊號從 latch 出來、經過組合邏輯、又回到同一個 latch，只要 clock 還是高，新值就會再被傳進去。最後存的是哪個值，取決於邏輯延遲和 clock 高電位的寬度，結果不確定。所以一般的同步設計用 edge-triggered flip-flop。

## Flip-flop

Flip-flop 是 **edge sensitive** 的，只在 clock 邊緣取樣輸入。最常見的做法是 **master-slave**：把 negative latch（master）和 positive latch（slave）串起來，就是 positive edge-triggered flip-flop。

| clock | Master | Slave |
| --- | --- | --- |
| 0 | transparent，D 傳到 master 的輸出 QM | hold，Q 保持舊值 |
| 1 | hold，鎖住上升緣那一刻的 D | transparent，QM 傳到 Q |

### 三個時序參數的來源

以 transmission gate 做的 master-slave flip-flop 為例：

![[vlsi-ms-flipflop.svg|Master-slave flip-flop：橘色是 setup time 要走完的路徑，藍色是上升緣之後到 Q 的路徑]]


- **Setup time**：上升緣之前，D 的新值除了傳到 master 的輸出，還要繞完 master 的回授迴路，讓迴路兩端一致。資料要經過輸入反相器、一個 TG 和迴路上的兩個反相器，所以 $t_{setup} = 3\,t_{pd,inv} + t_{pd,tx}$。
- **Clock-to-Q**：上升緣之後，QM 的值經過 slave 的 TG 和一個反相器到 Q，所以 $t_{c-q} = t_{pd,tx} + t_{pd,inv}$。
- **Hold time**：上升緣一到，master 的輸入 TG 就關閉，之後 D 怎麼變都進不來，所以 $t_{hold} \approx 0$。

### 各種延遲的名字

| 符號 | 意義 |
| --- | --- |
| $t_{pd}$ | 組合邏輯的 propagation delay：輸入變化後，輸出最晚多久穩定 |
| $t_{cd}$ | 組合邏輯的 contamination delay：輸入變化後，輸出最早多久開始變 |
| $t_{pcq}$ | latch / flip-flop 從 clock 到 Q 的 propagation delay |
| $t_{ccq}$ | latch / flip-flop 從 clock 到 Q 的 contamination delay |
| $t_{pdq}$ | latch 從 D 到 Q 的 propagation delay（latch transparent 時） |
| $t_{cdq}$ | latch 從 D 到 Q 的 contamination delay |
| $t_{setup}$、$t_{hold}$ | latch / flip-flop 的 setup time 和 hold time |

對照前面的時序限制：$t_{c-q}$ 就是 $t_{pcq}$，$t_{cd,reg}$ 就是 $t_{ccq}$。

## 其他 flip-flop

### PowerPC flip-flop

這個設計的重點在回授路徑：

- 回授迴路上有一顆由 clock 控制的開關。D 要寫入時先切斷回授，避免輸入和原本存的值互相競爭。
- 驅動節點的是類似反相器的結構，依內部節點的狀態把 $V_{DD}$ 或 GND 接到節點上。

### Reduced load master-slave flip-flop

Clock 網路的功耗和每個暫存器的 clock 負載直接相關。這個設計拿掉回授路徑上由 clock 控制的開關，只留輸入和 master 到 slave 之間的 TG（T1、T2）由 clock 控制。

- 優點：clock 的負載變小，clock 網路的功耗也變小。
- 缺點：電路變成 **ratioed**，寫入新值時必須壓過回授反相器，尺寸要仔細設計。

尺寸的條件：

- D 經過 T1 寫進 master 時，要壓過 master 的回授反相器 I2，所以 **T1 要比 I2 強**。
- Clock = 1、T2 打開時，slave 的回授反相器 I4 可能經由 T2 把值寫回 master（reverse conduction），所以 **I1 要比 I4 強**，QM 才不會被改寫。

## Clock 不理想時

理想上 clk 和 $\overline{clk}$ 剛好互補，實際上兩者會有 skew，出現兩種 overlap：

- **1-1 overlap**：clk 和 $\overline{clk}$ 同時是高
- **0-0 overlap**：clk 和 $\overline{clk}$ 同時是低

### Pseudostatic two-phase flip-flop（non-overlap）

改用兩個不重疊的 clock：clk1 控制 master、clk2 控制 slave，中間留一段兩者都是 0 的時間。

在 non-overlap 的期間，master 和 slave **都在 hold**，D 不會直接穿過去。但這時節點的值只存在電容上，是 dynamic storage，所以 non-overlap 的時間不能太長。

### Two-phase flip-flop 的 overlap 問題

如果 clk1 和 clk2 有一段同時為高（1-1 overlap），master 和 slave **同時 transparent**：

- **Race condition**：D 在這段時間內可以直接傳到 Q。
- **Undefined state**：同一個節點同時被兩個地方驅動，值無法確定。

![[vlsi-two-phase-clocks.svg|左：non-overlapping 的兩相 clock，中間留一段兩者都是 0 的時間。右：兩者重疊時，master 和 slave 同時 transparent]]


### Two-phase clock generator

產生 non-overlapping clock 的電路：clk 和反相後的 clk 各送進一個 NOR，每個 NOR 的另一個輸入接到另一個 phase 的輸出（經過幾級反相器延遲）。這樣一個 phase 要等另一個 phase 降下來才能升起來，non-overlap 的時間由回授路徑的延遲決定。

## Transistor-level 的 SR latch

SR latch 也可以不用 transmission gate。Ratioed CMOS clocked SR latch 用兩個交叉耦合的反相器存值，S 和 R 經由 clock 控制的 NMOS 把其中一邊拉低。寫入時這些 NMOS 要壓過反相器裡的 PMOS，所以也是 ratioed 電路，尺寸要算好。

Setup 和 hold 在 RTL 和 APR 階段的處理，可以對照 ICLAB 的 [[ICLAB_RTL_guideline_blog|RTL coding guidelines]]，以及 [[ICLAB_APR_blog|APR 流程]]裡 CTS 之後修 hold 的部分。
