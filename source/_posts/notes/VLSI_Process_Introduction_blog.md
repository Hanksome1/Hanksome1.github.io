---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: MOS 元件特性與 CMOS 製程
date: '2024-10-01'
updated: '2026-10-16 14:36:27'
tags:
  - VLSI
  - Device
summary: 為什麼 NMOS 只能傳 strong 0、PMOS 只能傳 strong 1；threshold voltage、channel length modulation、velocity saturation、body effect 與各種漏電流；最後是 CMOS 的剖面、製程順序和 latch-up。
permalink: notes/vlsi-process/
synced: obsidian
---

這一章把 MOS 當成電路元件來看：它什麼時候導通、導通時能把輸出拉到多高或多低，以及有哪些非理想效應會在後面的電路設計裡一再出現。課程總覽見 [[VLSI_blog|積體電路設計導論筆記總覽]]。

## NMOS 傳 strong 0、PMOS 傳 strong 1

把 NMOS 當開關用，gate 接 $V_{DD}$：

- **傳 0**：source 端在 0，$V_{GS} = V_{DD}$ 一直大於 $V_{Tn}$，電晶體一路導通，輸出可以被拉到 0。
- **傳 1**：輸出端是 source，輸出往上升的同時 $V_{GS}$ 在變小。等到 $V_{GS}$ 降到 $V_{Tn}$，電晶體就關了，輸出最高只能到

$$
V_{out,\max} = V_{G} - V_{Tn} = V_{DD} - V_{Tn}
$$

所以 NMOS 是 **strong 0、weak 1**。PMOS 剛好相反，傳 1 沒問題，傳 0 時輸出只能降到 $\lvert V_{Tp} \rvert$，是 **strong 1、weak 0**。

![[vlsi-pass-strength.svg|NMOS 和 PMOS 當開關傳 0 和 1：NMOS 傳 1 時輸出只到 VDD − VTn，PMOS 傳 0 時輸出只降到 PMOS 的 threshold]]


> [!note] 我自己的想法：裝水桶
> 可以把每一顆 MOS 想成一個水桶，最多只裝得下 $V_{GS} - V_{th}$ 這麼多水。電壓從 voltage source 一路傳過來，每經過一顆 MOS，都要看這顆最多能裝多少，再繼續往下傳。

這件事決定了後面很多設計：static CMOS 為什麼用 PMOS 做 pull-up、NMOS 做 pull-down，pass-transistor logic 為什麼會有訊號衰減，都是從這裡來的，見 [[VLSI_Logics_blog|組合邏輯電路]]。

## Threshold voltage 與短通道效應

$V_{th}$ 不是一個固定的數字。對 short channel 的元件來說，$V_{th}$ 還會隨 $V_{DS}$ 改變：$V_{DS}$ 越大，$V_{th}$ 越低，這就是下面漏電流那一節的 DIBL。

### Channel length modulation

理想的 MOS 進入 saturation 之後，電流跟 $V_{DS}$ 無關，等於輸出電阻是無限大。實際上 $V_{DS}$ 變大時，有效的通道長度會縮短，電流會跟著微微上升，用 $\lambda$ 描述：

$$
I_D = \frac{k_n'}{2}\frac{W}{L}\left(V_{GS} - V_T\right)^2\left(1 + \lambda V_{DS}\right),
\qquad r_o \approx \frac{1}{\lambda I_D}
$$

### $V_{DSAT}$ 與 velocity saturation

$V_{DSAT}$ 是讓 MOS 進入 saturation 所需的最小 $V_{DS}$。長通道元件的理論值是 $V_{GS} - V_T$；短通道元件裡，載子的速度在電場夠大時就飽和了，電流會提早飽和，所以實際的 $V_{DSAT}$ 常常比 $V_{GS} - V_T$ 小。

### Body effect

$$
V_T = V_{T0} + \gamma\left(\sqrt{\lvert -2\phi_F + V_{SB} \rvert} - \sqrt{\lvert 2\phi_F \rvert}\right)
$$

- 一般會把 body 接到 source（$V_{SB} = 0$），避免 body effect。
- $V_{SB}$ 上升 → $V_T$ 上升 → $I_D$ 下降。可以想成 body 相對 source 變成更低的電壓：MOS 要導通，得先在 gate 下方感應出一層電子，底下的基板越負，就越難感應出來，所以 threshold 變高。
- $V_{SB}$ 下降 → $V_T$ 下降 → $I_D$ 上升，道理相同。

Body effect 會讓 NMOS 傳 1 的情況更糟：輸出（source）往上升時 $V_{SB}$ 跟著變大，$V_{Tn}$ 也變大，最後的電壓比 $V_{DD} - V_{Tn0}$ 還低。

## 漏電流

電晶體「關著」的時候也會漏電，路徑有很多條：

| 機制 | 從哪裡漏到哪裡 | 原因 |
| --- | --- | --- |
| Reverse-biased pn junction | drain / source → substrate | 反向偏壓的 pn 接面本身就有小電流 |
| Subthreshold（weak inversion） | drain → source | $V_{GS} < V_{th}$ 時通道沒有完全關掉 |
| DIBL | drain → source | 高 $V_{DS}$ 降低了 source 端的位障，等效於 $V_{th}$ 下降 |
| GIDL | drain → substrate | gate 和 drain 電壓差很大時（例如 off 狀態下 gate 接 0、drain 接 $V_{DD}$），重疊區的強電場造成 band-to-band tunneling |
| Punchthrough | drain → source | 短通道下，drain 和 source 的空乏區直接接在一起 |
| Narrow width effect | drain → source | 通道寬度很小時 $V_{th}$ 會偏移 |
| Gate oxide tunneling | gate → channel / substrate | 氧化層太薄，載子直接穿隧過去 |
| Hot carrier injection | channel → gate | 高能量的載子被打進 gate oxide |

其中最主要的是 **subthreshold current**，而且會隨溫度上升而變大。

**DIBL**（drain-induced barrier lowering）值得多寫一點：$V_{DS}$ 很高時，drain 的空乏區會影響到 source 那一側，把 source 的位障壓低，於是 $V_{GS}$ 還不夠大，載子就已經被注入通道。$V_{DS}$ 越高，DIBL 越明顯；通道越短，$V_{th}$ 被拉低得越多。

$V_{th}$ 的選擇是一個取捨：

- $V_{th}$ 低：速度快，但漏電多
- $V_{th}$ 高：漏電少，但速度慢

Standard cell library 會為同一個邏輯閘準備不同 $V_{th}$ 的版本，就是為了讓工具在這兩者之間挑，見 [[ICLAB_Intro_blog|數位 IC 的設計流程]]。

## CMOS 的剖面與製程

一般的 CMOS 做在 p-type substrate 上：

- **NMOS** 直接做在 p substrate 裡：source / drain 是 n+ 擴散區，gate 是 n+ poly。
- **PMOS** 要先做一個 n-well，再在 well 裡做 p+ 的 source / drain，gate 是 p+ poly。
- **Substrate contact**（p+）接 GND，**well contact**（n+）接 $V_{DD}$，讓 body 維持在正確的偏壓。

![[vlsi-cmos-cross-section.svg|CMOS 反相器的剖面：NMOS 做在 p substrate 裡，PMOS 做在 n well 裡；substrate contact 接 GND、well contact 接 VDD]]


製程的順序大致是：

1. N-well
2. Diffusion（active）
3. Poly
4. P implant 和 N implant
5. Contact
6. Metal
7. Via，再往上疊更多層 metal

畫 layout 時，這些就是一層一層的圖層，順序也大致照這樣疊上去。

## Latch-up

CMOS 的結構裡藏著兩顆寄生的 BJT：PMOS 的 p+ source、n-well、p substrate 形成一顆 PNP；NMOS 的 n+ source、p substrate、n-well 形成一顆 NPN。這兩顆 BJT 互相把自己的 collector 接到對方的 base，構成一個正回授的迴路。一旦迴路被觸發，$V_{DD}$ 到 GND 之間就會出現一條低阻抗的路徑，流過大電流，這就是 latch-up。

![[vlsi-latchup.svg|CMOS 裡寄生的 PNP 和 NPN 互相把 collector 接到對方的 base，形成正回授的迴路]]


假設 well 和 substrate 的寄生電阻很大，base 電流不會被分流掉。如果某個時刻 $i_{b1}(t_0) > 0$：

$$
i_{b2}(t_0 + \Delta t) \approx i_{c1}(t_0 + \Delta t) = \beta_1 \, i_{b1}(t_0)
$$

$$
i_{b1}(t_0 + \Delta t) \approx i_{c2}(t_0 + \Delta t) = \beta_2 \, i_{b2}(t_0 + \Delta t) = \beta_1 \beta_2 \, i_{b1}(t_0)
$$

電流每繞迴路一圈就乘上 $\beta_1 \beta_2$。只要 $\beta_1 \beta_2 > 1$，$i_{b1}$ 就會一路放大，直到發生 latch-up。

預防的方法是讓 **substrate contact 和 well contact 盡量靠近電晶體**。Contact 越近，寄生電阻越小，base 和 emitter 之間被短路，BJT 就不容易被打開。
