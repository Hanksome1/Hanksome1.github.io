---
title: 128×16-bit ROM Macro 全客製化設計
date: 2024-12-24 10:00:00
layout: project
featured: false
part: ROM-128x16
summary: 在 0.18 µm 製程上從電晶體層級設計 128×16 bit 的 contact ROM macro，包含 decoder、MUX、sense amplifier 與 timing control，自己拉 layout、過 DRC／LVS 並做 post-layout 模擬；面積 7,818 µm²，TT corner 平均 access time 1.56 ns。
period: 2024 Fall
role: Schematic · Layout · SPICE simulation
course: 清大 EE3230 積體電路設計導論 期末專題
team: 2 人小組
stack: [Full-custom, SPICE, 0.18 µm CMOS]
tools: [Virtuoso, Calibre, HSPICE]
tags: [Memory, Full-custom, Layout, Sense Amplifier]
floorplan: [ROM ARRAY, X-DECODER, MUX / SA, CTRL / DFF]
cover: /images/rom-macro/layout-cover.png
metrics:
  - { label: Area, value: "7,818 µm²", note: "36.31 × 215.33 µm · DRC / LVS clean" }
  - { label: Access time, value: 1.56 ns, note: "post-sim · TT 25 °C · 4-case avg (worst 3.02 ns)" }
  - { label: Power, value: 563 µW, note: "post-sim · TT 25 °C · 1.8 V · 100 MHz CLK" }
  - { label: FoM, value: "1.07 × 10⁷", note: "T² × P × A (ns² · µW · µm²)" }
---

## Overview

這是大三上「積體電路設計導論」的期末專題：從電晶體層級開始，自己畫 schematic、自己拉 layout，做出一顆 **128 × 16 bit 的 ROM macro**。跟寫 RTL 再交給合成工具不同，這次每一顆電晶體的尺寸、每一條線怎麼走，都要自己決定。

規格要求 access time 在五個 process corner 下都小於 5 ns，最後用 access time、功耗與面積算出 figure of merit，越小越好：

$$
\text{FoM} = T_\text{access}^2 \times P_\text{avg} \times A
$$

我們把重心放在面積。最後整顆 macro 只有 36.31 × 215.33 µm = **7,818 µm²**，2,048 個 bit 加上所有周邊電路，平均每個 bit 約 3.8 µm²。Post-layout 模擬在 TT corner 的平均 access time 是 **1.56 ns**、平均功耗 **563 µW**。

## Architecture

![Block diagram：10 個 DFF 先把位址存起來，X decoder 選 word line，Y decoder 控制兩組 8-to-1 MUX 各挑一條 bit line，最後由 sense amplifier 判斷 0 或 1](/images/rom-macro/block-diagram.jpg)

ROM array 是 128 條 word line（WL）× 16 條 bit line（BL），共 2,048 bits。輸入有 12 根：`CLK`、sense amplifier 的參考電壓 `VREF`，以及 10-bit 位址 `A<9:0>`。位址先經過 10 個 DFF，再拆成兩段：

| 位址 | 位寬 | 去向 |
| --- | ---: | --- |
| `A<6:0>` | 7 | X decoder（7-to-128）→ 打開其中一條 `WL<127:0>` |
| `A<9:7>` | 3 | Y decoder（3-to-8）→ 控制兩組 8-to-1 MUX |

兩組 MUX 分別從 `BL<7:0>` 和 `BL<15:8>` 各挑一條，送進兩個 sense amplifier，所以每次讀出 2 bits（`DOUT<1:0>`）。對外看起來，這顆 128×16 的 array 其實是 **1K × 2-bit** 的 ROM。

一次讀取的時序都由 `CLK` 帶動：

1. **CLK 低**：`Pre_b` 為低，precharge 電路把 16 條 BL 都拉到 VDD；這時 `WLEN` 也是低，所有 WL 都關著。
2. **CLK 上升**：DFF 存下新的位址，`WLEN` 拉高，被選到的 WL 打開，cell 開始對 BL 放電。
3. **SAEN 上升**（比 CLK 晚一點）：sense amplifier 比較 BL 和 `VREF`，輸出 `DOUT`。

## Circuit design

### ROM array 與 precharge

這是 contact/via-type 的 ROM：每個 cell 存的是 0 還是 1，由那個位置有沒有打 contact／via 決定。WL 打開時，有接上的 cell 會把 BL 往下拉；沒接的 BL 則維持在 precharge 的 VDD。

Precharge 電路是 16 顆 PMOS，每條 BL 一顆，gate 都接 `Pre_b`。

### X decoder：7-to-128

如果直接用 128 個 7-input AND gate，面積和 delay 都很難看，所以用 **pre-decode**：把 7 bits 拆成 4 + 3，分別進 4-to-16 和 3-to-8 兩個 pre-decoder，每條 WL 再用一個 NOR2 把兩邊各一根輸出組合起來，16 × 8 剛好是 128 個 NOR2。

![X decoder：左邊的 4-to-16 和下面的 3-to-8 pre-decoder，交叉餵給 16 × 8 = 128 個 NOR2，每個 NOR2 驅動一條 WL](/images/rom-macro/x-decoder.png)

WL 的 enable 訊號 `WLEN` 沒有另外加一層 gate，而是直接併進 3-to-8 pre-decoder：原本 3-input 的 NAND 改成 NAND4（3 個位址 + `WLEN`）。`WLEN` 為低時 NAND4 全部輸出 1，後面的 NOR2 全部輸出 0，所有 WL 就一起關掉。

### Y decoder 與 MUX

Y decoder 是 3-to-8 decoder，內部同樣用 2-to-4 pre-decoder 組成，以減少電晶體數量；layout 的寬度也刻意和 X decoder 對齊，方便整合。

MUX 用 transmission gate 實作，左右各 8 顆，所以 decoder 要同時提供 `Ysel<7:0>` 和反相的 `Yselb<7:0>`。同一組 select 會同時選兩邊對應的 BL：輸入 `000` 選到 `BL<0>` 和 `BL<8>`，輸入 `111` 選到 `BL<7>` 和 `BL<15>`。

### Sense amplifier

用的是差動式、latch-based 的 voltage sense amplifier，4 顆 PMOS、5 顆 NMOS，全部用最小尺寸。

![Sense amplifier：M5、M6 是輸入差動對，M1–M4 交叉耦合成 latch，M9 由 EN 控制 tail current，M7、M8 在 EN 為低時把兩個輸出拉回 VDD](/images/rom-macro/sense-amp.png)

一邊接 MUX 選出來的 `DL`，另一邊接 `VREF`。`DL` 高於 `VREF` 時輸出 1（1.8 V），低於 `VREF` 時輸出 0（0 V）。我們把 `VREF` 設在 **1.75 V，只比 VDD 低 50 mV**，所以 BL 不用整條放電，只要掉 50 mV，sense amplifier 就能判斷出 0，這是讀取能夠快的關鍵。

### Timing control：只用了兩顆 inverter

整個 timing control 比我們原本預期的簡單很多：

- **`Pre_b`、`WLEN`**：一開始用跟 `CLK` 一樣的理想波形模擬就能正常運作。試過加 AND gate 把 pulse 縮短，結果只是多耗電，所以最後兩個都直接接 `CLK`。precharge 的 PMOS 在低電位導通、WL 在高電位打開，同一個 `CLK` 剛好讓兩者錯開，不會同時打開。
- **`SAEN`**：sense amplifier 一定要等 BL 拉出電壓差之後才能啟動，太早 enable 就會讀錯，所以 `SAEN` 要比 `CLK` 晚。我們用 inverter 本身的 delay 來做：把 inverter 的 channel length 加長，驅動能力變弱、delay 就變長；為了不讓訊號反相，用兩級 inverter，第二級的長度大約是第一級的兩倍。最後再掃 inverter 的 W/L，在 delay 和功耗之間找平衡。

### DFF 與 output latch

10 個位址各接一顆 master-slave DFF（transmission gate 架構，rising edge 觸發），讓位址在整個 cycle 內保持穩定；sense amplifier 的輸出再接 D latch，把 `DOUT` 留住。

## Layout & verification

![Top-level：ROM array 與 X decoder 並排，中間是 128 條 WL；precharge、MUX、Y decoder、sense amplifier、latch、DFF 與 timing control 都集中在下方](/images/rom-macro/top-schematic.png)

Floorplan 的想法很單純：X decoder 緊貼著 array 的長邊，128 條 WL 直接橫跨過去；其他周邊電路全部擠在 array 的同一端，盡量不浪費空間。最後的 macro 是一條細長的形狀，36.31 × 215.33 µm。

每個小 block 畫完，就馬上跑 DRC 和 LVS，確認沒問題才往上整合，所以最後組起來的時候沒有遇到太多意外。整顆 macro 通過 DRC 和 LVS 之後，用 Calibre xRC 抽出寄生 RC，再用 HSPICE 做 post-layout simulation。

## Results

### Pre-sim：五個 corner

Access time 定義為四個讀取 case 從 `CLK` 上升到 `DOUT` 改變的平均，功耗是這四個 case 期間的平均功耗（25 °C）：

| Corner | 平均 access time | 最慢的單一 case | 平均功耗 |
| --- | ---: | ---: | ---: |
| TT | 1.344 ns | 2.622 ns | 302.3 µW |
| SS | **1.983 ns** | **3.807 ns** | 330.2 µW |
| FF | 1.208 ns | 2.352 ns | 317.3 µW |
| SF | 1.922 ns | 3.719 ns | 330.3 µW |
| FS | 1.461 ns | 2.855 ns | 307.2 µW |

五個 corner 都在 5 ns 以內，連最慢的單一 case（SS 的 3.81 ns）也有餘裕。SS 最慢，因為 threshold voltage 較高、電流較小。比較有意思的是 **SF 幾乎和 SS 一樣慢，FS 則接近 TT**：慢的兩個 corner 都是 NMOS 偏慢，看得出讀取路徑主要卡在 NMOS，畢竟 BL 是靠 cell 的 NMOS 放電的。功耗在五個 corner 之間差不到 10%。

### Post-sim：layout 之後

![TT corner post-layout 模擬：由上到下是 A<9:0>、CLK、DOUT<0>、DOUT<1>，標出四個 case 的 delay：3.02 ns、107 ps、3 ns、107 ps](/images/rom-macro/postsim-tt.jpg)

| TT @ 25 °C | Pre-sim | Post-sim | 變化 |
| --- | ---: | ---: | ---: |
| 平均 access time | 1.344 ns | 1.559 ns | +16% |
| 最慢的單一 case | 2.622 ns | 3.021 ns | +15% |
| 平均功耗 | 302.3 µW | 563.1 µW | **+86%** |

Access time 增加的主因是整顆 macro 上有很多條又長又平行的走線，帶來寄生電阻和電容。功耗增加得更多，幾乎翻倍：為了壓面積，平行的線靠得很近，線與線之間的 coupling capacitance 變大，switching power 跟著上升。

最後的 FoM（取 post-sim TT 的結果）：

$$
\text{FoM} = 1.5594^2\ \text{ns}^2 \times 563.13\ \mu\text{W} \times 7{,}818.45\ \mu\text{m}^2 \approx 1.07 \times 10^7
$$

{% note info Access time 的「平均」藏了什麼 %}
四個 case 裡，`DOUT` 由 1 變 0 的兩個 case 要等 BL 放電、sense amplifier 判斷，post-sim 約 3 ns；由 0 變 1 的兩個 case 只要約 0.1 ns。平均起來是 1.56 ns，但真正決定這顆 ROM 能跑多快的，是 3.02 ns 的那個 case。
{% endnote %}

## 分工

兩人小組，從各個 block 的 schematic、layout，到整合、DRC／LVS 與 pre-/post-layout 模擬一起完成。

## What I learned

- **設計就是在取捨。** 我們一路以面積為優先，最後的面積很小，但 layout 擠得太密，post-layout 的功耗幾乎翻倍。後來才發現別組的重心放在 access time 和功耗上，沒有唯一的「最好」，只有針對不同目標的最佳化。
- **能省的電路就不要加。** 原本最擔心 timing control，結果兩顆 inverter 就搞定；試著加 AND gate 調 pulse 寬度，反而只多耗電。`WLEN` 併進 pre-decoder 也是同樣的想法。
- **每個 block 畫完就跑 DRC／LVS。** 錯誤在小 block 裡很好找，等全部組起來再查就痛苦得多。
- **Layout 之後的數字才是真的。** 寄生電容讓功耗多了 86%、access time 多了 16%，schematic 階段的模擬明顯太樂觀。
- **先搞清楚指標在量什麼。** 平均 access time 1.56 ns 看起來很快，但最慢的 case 是 3.02 ns。

## References

1. 張孟凡教授，積體電路設計導論課程講義，國立清華大學。
