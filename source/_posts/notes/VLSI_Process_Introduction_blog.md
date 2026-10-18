---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: MOS 元件特性與 CMOS 製程
date: '2024-10-01'
updated: '2026-10-17 21:26:07'
tags:
  - VLSI
  - Device
summary: 為什麼 NMOS 只能傳 strong 0、PMOS 只能傳 strong 1；threshold voltage、channel length modulation、velocity saturation、body effect 與各種漏電流；最後是 CMOS 的剖面、製程順序和 latch-up。
permalink: notes/vlsi-process/
synced: obsidian
---

這一章把 MOS 當成電路元件：什麼時候導通、能把輸出拉到多高或多低，以及後面電路設計常遇到的非理想效應。課程總覽見 [[VLSI_blog|積體電路設計導論筆記總覽]]。

## NMOS 傳 strong 0、PMOS 傳 strong 1

把 NMOS 當開關用，gate 接 $V_{DD}$：

- **傳 0**：source 端在 0，$V_{GS} = V_{DD}$ 一直大於 $V_{Tn}$，電晶體一路導通，輸出可以被拉到 0。
- **傳 1**：輸出端是 source，輸出上升時 $V_{GS}$ 跟著變小，降到 $V_{Tn}$ 時電晶體就關掉，輸出最高只到

$$
V_{out,\max} = V_{G} - V_{Tn} = V_{DD} - V_{Tn}
$$

所以 NMOS 是 **strong 0、weak 1**。PMOS 相反，傳 1 沒問題，傳 0 時輸出只能降到 $\lvert V_{Tp} \rvert$，是 **strong 1、weak 0**。

![[vlsi-pass-strength.svg|NMOS 和 PMOS 當開關傳 0 和 1：NMOS 傳 1 時輸出只到 VDD − VTn，PMOS 傳 0 時輸出只降到 PMOS 的 threshold]]


> [!note] 我的理解方式：水桶
> 把每顆 MOS 想成水桶，最多只裝得下 $V_{GS} - V_{th}$ 的水。電壓從 voltage source 傳過來，每經過一顆 MOS，都要看這顆最多能裝多少，再往下傳。

Static CMOS 用 PMOS 做 pull-up、NMOS 做 pull-down，以及 pass-transistor logic 的訊號衰減，都是因為這個特性，見 [[VLSI_Logics_blog|組合邏輯電路]]。

## Threshold voltage 與短通道效應

$V_{th}$ 不是固定的。Short channel 元件的 $V_{th}$ 會隨 $V_{DS}$ 改變：$V_{DS}$ 越大，$V_{th}$ 越低，也就是後面漏電流一節的 DIBL。

### Channel length modulation

理想的 MOS 在 saturation 時，電流和 $V_{DS}$ 無關，輸出電阻無限大。實際上 $V_{DS}$ 變大時，有效通道長度變短，電流會稍微上升，用 $\lambda$ 描述：

$$
I_D = \frac{k_n'}{2}\frac{W}{L}\left(V_{GS} - V_T\right)^2\left(1 + \lambda V_{DS}\right),
\qquad r_o \approx \frac{1}{\lambda I_D}
$$

### $V_{DSAT}$ 與 velocity saturation

$V_{DSAT}$ 是 MOS 進入 saturation 所需的最小 $V_{DS}$。長通道元件是 $V_{GS} - V_T$；短通道元件在電場夠大時載子速度就飽和，電流提早飽和，所以 $V_{DSAT}$ 常常比 $V_{GS} - V_T$ 小。

### Body effect

$$
V_T = V_{T0} + \gamma\left(\sqrt{\lvert -2\phi_F + V_{SB} \rvert} - \sqrt{\lvert 2\phi_F \rvert}\right)
$$

- 一般會把 body 接到 source（$V_{SB} = 0$），避免 body effect。
- $V_{SB}$ 上升 → $V_T$ 上升 → $I_D$ 下降。Body 相對 source 的電壓變低，MOS 要在 gate 下方感應出一層電子就更難，所以 threshold 變高。
- $V_{SB}$ 下降 → $V_T$ 下降 → $I_D$ 上升。

Body effect 讓 NMOS 傳 1 的情況更差：輸出（source）上升時 $V_{SB}$ 變大，$V_{Tn}$ 也變大，最後的電壓比 $V_{DD} - V_{Tn0}$ 還低。

## 漏電流

電晶體關閉時也會漏電，路徑有很多種：

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

**DIBL**（drain-induced barrier lowering）：$V_{DS}$ 很高時，drain 的空乏區影響到 source 那一側，把 source 的位障壓低，$V_{GS}$ 還不夠大時載子就被注入通道。$V_{DS}$ 越高 DIBL 越明顯，通道越短 $V_{th}$ 降得越多。

$V_{th}$ 的選擇要取捨：

- $V_{th}$ 低：速度快，但漏電多
- $V_{th}$ 高：漏電少，但速度慢

所以 standard cell library 會為同一個邏輯閘準備不同 $V_{th}$ 的版本，讓工具依需求選擇，見 [[ICLAB_Intro_blog|數位 IC 的設計流程]]。

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

畫 layout 時，這些就是一層一層的圖層，順序大致相同。

## Latch-up

CMOS 的結構裡有兩顆寄生的 BJT：PMOS 的 p+ source、n-well、p substrate 形成 PNP；NMOS 的 n+ source、p substrate、n-well 形成 NPN。兩顆 BJT 的 collector 各自接到對方的 base，形成正回授。迴路一旦被觸發，$V_{DD}$ 到 GND 之間就出現低阻抗的路徑，流過大電流，這就是 latch-up。

![[vlsi-latchup.svg|CMOS 裡寄生的 PNP 和 NPN 互相把 collector 接到對方的 base，形成正回授的迴路]]


假設 well 和 substrate 的寄生電阻很大，base 電流不會被分流。如果某個時刻 $i_{b1}(t_0) > 0$：

$$
i_{b2}(t_0 + \Delta t) \approx i_{c1}(t_0 + \Delta t) = \beta_1 \, i_{b1}(t_0)
$$

$$
i_{b1}(t_0 + \Delta t) \approx i_{c2}(t_0 + \Delta t) = \beta_2 \, i_{b2}(t_0 + \Delta t) = \beta_1 \beta_2 \, i_{b1}(t_0)
$$

電流每繞一圈就乘上 $\beta_1 \beta_2$，只要 $\beta_1 \beta_2 > 1$，$i_{b1}$ 就會持續放大，最後發生 latch-up。

預防方法是讓 **substrate contact 和 well contact 盡量靠近電晶體**。Contact 越近寄生電阻越小，base 和 emitter 之間接近短路，BJT 就不容易導通。
