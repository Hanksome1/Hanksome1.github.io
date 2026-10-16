---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: AIC HW2：差動放大器、電流鏡與 op amp 黑盒子
date: '2024-10-17'
updated: '2026-10-16 21:33:29'
tags:
  - AIC
  - HSPICE
  - Amplifier
summary: 電阻負載差動對的輸出擺幅設計、用 cascode 電流鏡取代理想 tail current、diode-connected 負載的增益與擺幅取捨，手算 −3 dB 頻寬時寄生電容的影響，以及用 E-element 當 op amp 看有限 open-loop gain 帶來的誤差。
permalink: notes/aic-hw2/
synced: obsidian
---

這份作業對應[[AIC_Differential_Amp_blog|差動放大器]]、[[AIC_CurrentMirror_Cascode_blog|電流鏡]]和 [[AIC_opamp_blog|op amp]] 三章，四個部分：差動對、電流鏡當 tail、頻率響應、op amp 當黑盒子。$V_{DD}$ = 1.8 V、25°C、TT corner。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

## Part 1：電阻負載的差動對

![[aic-hw2-circuits.svg|Part 1 的電阻負載差動對，tail 是理想電流源；右邊是輸出節點 V_X 的擺動範圍，偏壓點放在上下限的正中間]]

### 觀念題

**優缺點。** 差動放大器對雜訊比較不敏感：雜訊大多同時出現在兩個輸入，是共模訊號，而差動放大器的共模增益很小。缺點是電晶體多，而且輸入要是一對差動訊號。

**輸入共模為什麼不影響輸出共模？** 共模輸入上升 $\Delta V$，輸入管的 source（也就是 tail 的 drain）跟著上升 $\Delta V$，$V_{GS}$ 不變，電流就不變。但輸入共模不能任意高低：tail current 是電晶體做的，它的 $V_{DS}$ 要夠大才會在 saturation；共模太高，輸入管自己的 $V_{DS}$ 又會不夠。

### 設計

| 規格 | 目標 |
| --- | --- |
| $V_{DD}$ 電流 | < 30 µA |
| 增益 | > 10 V/V |
| Tail current 的 headroom | > 250 mV（輸入管的 source 電壓） |

設計順序：

1. **電流**：$I_{SS}$ 選 6 µA，遠低於上限，省功率。
2. **Tail headroom**：$V_{in,cm}$ = 0.9 V，留 0.45 V 給 tail（規格 0.25 V，多留一點）。輸入管的尺寸決定 $V_{GS}$，也就決定了 $V_{SS} = V_{in,cm} - V_{GS}$。用 square law 估、再用模擬到的 $V_{th}$（0.391 V，比假設的 0.38 V 高）修正，最後 2.87 µm / 1 µm，$V_{SS}$ = 0.453 V。
3. **輸出擺幅**：輸出節點 X 的下限是輸入管剛好不掉進 triode，$V_X = V_{in,cm} - V_{th} \approx 0.51$ V；上限是 $V_{DD}$。偏壓點放在正中間，$V_X$ = (0.51 + 1.8)/2 ≈ 1.155 V，所以

$$
R_D = \frac{V_{DD} - V_X}{I_{SS}/2} = \frac{1.8 - 1.155}{3\ \mu\text{A}} \approx 215\ \text{k}\Omega \rightarrow 220\ \text{k}\Omega
$$

4. **增益**：$A_v = g_m(R_D \parallel r_o)$，要大於 10。$R_D$ 越大增益越大，但 $V_X$ 會被往下拉，擺幅變小；$R_D$ 不能只為了增益加大，這裡 220 kΩ 剛好兩者都滿足。

| 項目 | 規格 | 結果 |
| --- | --- | --- |
| $V_{in,cm}$ | — | 0.9 V |
| $V_{out,cm}$ | — | 1.155 V |
| $V_{DD}$ 電流 | < 30 µA | 6 µA |
| 增益 | > 10 V/V | 10.1 V/V |
| Tail headroom | > 250 mV | 453 mV |

量到的輸出擺幅是 0.506 V 到 1.8 V，共 1.294 V，偏壓點 1.155 V 剛好在中間（(1.8 + 0.506)/2 = 1.153 V）。

## Part 2：電流鏡

### 電流鏡怎麼複製電流

參考端的電晶體 diode-connected，$I_{ref}$ 流過它時產生對應的 $V_{GS}$；輸出端的電晶體 gate 接在同一個節點，$V_{GS}$ 相同，在 saturation 時就流出相同的電流。輸出端的 W/L 是參考端的 N 倍，電流就是 N 倍。兩邊的 $V_{DS}$ 不同時，channel-length modulation 會讓電流有一點誤差。

### Cascode 電流鏡對差動對有什麼好處

把 tail current 看成理想電流源 $I_{SS}$ 並聯一顆 $R_{SS}$：

![[ExcalidrawDifferential_AMP.svg|我畫的半電路。左：tail 簡化成 I_SS 並聯 R_SS。中：共模半電路，tail 拆成 I_SS/2 並聯 2R_SS。右：差模半電路，V_SS 是 virtual ground]]

| Tail current | $R_{SS}$ |
| --- | --- |
| 理想電流源 | $\infty$ |
| 單顆電晶體的電流鏡 | $r_o$ |
| Cascode 電流鏡 | $g_m r_o \cdot r_o$ |

用[[AIC_Differential_Amp_blog|半電路]]分析，共模半電路是 CS 加上 $2R_{SS}$ 的 degeneration，差模半電路是普通的 CS，兩者相除：

$$
\text{CMRR} = \left|\frac{A_{DM}}{A_{CM}}\right| = 1 + 2g_m R_{SS}
$$

Cascode 電流鏡的 $R_{SS}$ 大了 $g_m r_o$ 倍，CMRR 也就跟著變大，電路對共模輸入更不敏感。

### Q3：把理想 tail 換成 cascode 電流鏡

$I_{ref}$ = 1 µA，tail 要 6 µA，所以輸出端的 W/L 是參考端的 6 倍。L 選長一點，$r_o$ 大，CMRR 好。

設計時先把 1.8 V 分給每一顆元件：

![[Drawing 2024-11-10 08.17.24.excalidraw.svg|我畫的電壓分配：R_D 上 0.66 V、輸入管 0.76 V，tail 的 cascode 電流鏡兩顆各 0.2 V，V_SS 約 0.4 V]]

Cascode 電流鏡要兩顆電晶體都在 saturation，tail 至少要留兩個 $V_{ov}$。模擬後發現 tail 的空間還是不夠，下面那顆掉進了 triode，所以把 $V_{in,cm}$ 從 0.9 V 拉到 0.94 V，讓 tail 多一點空間。輸出擺幅從 0.56 V 到 1.8 V，偏壓點 1.14 V，可擺 1.16 V，增益 10.7。

### Q4：diode-connected 負載

負載換成 diode-connected PMOS，tail 用 cascode 電流鏡把 1 µA 複製成 20 µA：

![[aic-ex-hw2-diode-load.svg|我畫的 Q4 電路和尺寸：輸入管 M1n、M2n 66/2，diode-connected 負載 M1p、M2p，tail 的 cascode 電流鏡參考端 4/3、輸出端 80/3（W / L，單位 µm）]]

增益變成兩顆電晶體 $g_m$ 的比值（下式的 M1 是輸入管、M3 是負載）：

$$
A_v \approx \frac{g_{m1}}{g_{m3}} = \sqrt{\frac{\mu_n (W/L)_1}{\mu_p (W/L)_3}}
$$

規格要 7 V/V 以上，$\mu_n/\mu_p$ 大約 3，$(W/L)_1/(W/L)_3$ 要 16 以上。

一開始想同時照顧擺幅：讓 PMOS 的尺寸把輸出偏壓放在擺幅中間（9.23/1，$V_X$ = 1.11 V），但增益只有 1.23。尺寸比要拉到 30 倍以上，增益才上得來，輸出共模也就跟著往下掉。這題的擺幅和增益互相衝突，最後選增益，用 66/2 對 2/2（33 倍）：

| 項目 | 規格 | 結果 |
| --- | --- | --- |
| $I_{ref}$ | 1 µA | 1 µA |
| $V_{in,cm}$ | — | 0.9 V |
| $V_{out,cm}$ | — | 0.63 V |
| $V_{DD}$ 電流 | < 30 µA | 25.8 µA |
| 增益 | > 7 V/V | 7.22 V/V |
| Tail headroom | > 250 mV | 460 mV |

tail 電流取 20 µA，電流大一點，輸出阻抗小一點，代價是功率。

## Part 3：頻率響應

在 Part 1 的電路兩個輸出各掛 10 fF，一個輸入給 AC 訊號，看單端輸出：

![[2024-11-10_13-18 1.jpeg|Part 1 差動對的單端輸出 AC 響應（dB）。低頻增益 14.1 dB，−3 dB 頻寬 57.6 MHz，增益在 303 MHz 掉到 0 dB]]

低頻增益 14.13 dB，也就是 5.08 V/V，剛好是差動增益 10.1 的一半（只看一邊的輸出）。−3 dB 頻寬 57.6 MHz，unity-gain 頻率 303 MHz。

### 手算頻寬

![[aic-ex-hw2-bandwidth.svg|我算頻寬時畫的圖：輸出節點 V_X 上掛著 10 fF，這個節點的 RC 決定了 pole]]

輸出節點的電阻是 $R_D \parallel r_o$，用前一份作業的 $\lambda \approx 0.1$ 估 $r_o$：

$$
R_{out} = 220\ \text{k}\parallel\frac{1}{0.1\times 3\ \mu\text{A}} = 220\ \text{k}\parallel 3.33\ \text{M} \approx 206\ \text{k}\Omega
$$

只算外掛的 10 fF：$f = 1/(2\pi\cdot 206\text{k}\cdot 10\text{f}) \approx 77.3$ MHz，誤差 34%。

從 `.lis` 讀出輸出節點上真正的總電容是 14.1 fF，多出來的 4 fF 是輸入管 drain 端的寄生電容。代進去：$f \approx 55.4$ MHz，誤差降到 3.7%。在 fF 等級的負載下，寄生電容不能忽略。

### 想提高 unity-gain 頻寬

我把 $R_D$ 從 220 kΩ 降到 216 kΩ：輸出阻抗變小，pole 往高頻移，但增益也跟著掉了一點。

| | 原本 | $R_D$ = 216 kΩ |
| --- | --- | --- |
| Unity-gain 頻寬 | 304.19 MHz | 304.18 MHz |
| 增益 | 14.13 dB | 13.99 dB |
| 輸出阻抗 | 207.9 kΩ | 204.3 kΩ |
| 輸出電容 | 14.09 fF | 14.08 fF |

**回頭看。** 表上的 unity-gain 頻寬其實一點都沒變。只有一個 pole 時，unity-gain 頻寬是增益乘上 pole：

$$
\omega_u = A_0\,\omega_p = g_m R_{out}\cdot\frac{1}{R_{out}C} = \frac{g_m}{C}
$$

$R_{out}$ 消掉了。降低 $R_D$ 只是讓 −3 dB 頻寬變寬、增益變小，兩者的乘積不變。要提高 unity-gain 頻寬，得讓 $g_m$ 變大（更多電流或更大的 W/L）或讓輸出電容變小。

## Part 4：op amp 當黑盒子

### 為什麼要 closed loop

Open-loop 放大器可以有很高的增益、電路也簡單，但增益會隨元件變異和訊號大小飄動，做不準。Closed loop 用一部分增益換來穩定、可預測的增益（見[[AIC_feedback_blog|回授]]）。

### 非反相與反相放大器

用 HSPICE 的 E-element（電壓控制電壓源）當 op amp，增益設 $10^6$，目標都是增益 10（誤差 3% 以內）：

![[aic-ex-hw2-noninverting.svg|我畫的非反相放大器：R_1 = 90 kΩ、R_2 = 10 kΩ 把輸出分壓回 V_in2]]

- 非反相：$R_1$ = 90 kΩ、$R_2$ = 10 kΩ，增益 $1 + R_1/R_2$ = 10，模擬 9.9999。
- 反相：$R_1$ = 100 kΩ、$R_2$ = 10 kΩ，增益 $-R_1/R_2$ = −10，模擬 −9.9999。電阻選大一點，op amp 的輸出不用推太大的電流。

推導見 [[AIC_opamp_blog|op amp]]。把 E-element 的增益改小：

| Open-loop gain | 非反相 gain error | 反相 gain error | 反相的輸入阻抗 |
| --- | --- | --- | --- |
| 20 dB | 50% | 52.4% | 19.09 kΩ |
| 40 dB | 9.09% | 9.91% | 10.99 kΩ |
| 60 dB | 0.99% | 1.09% | 10.10 kΩ |

非反相放大器的輸入阻抗都是 $10^{20}$ Ω（E-element 的輸入不吃電流），兩種的輸出阻抗都是 0。反相放大器的輸入阻抗是 $R_2 + R_1/(1 + A_0)$：open-loop gain 越大，X 點越接近 virtual ground，輸入阻抗越接近 $R_2$。

Open-loop gain 越小，gain error 越大，因為 closed-loop gain 不能再近似成只由電阻決定：非反相的增益是 $1/(\beta + 1/A_0)$，$1/A_0$ 不再能忽略。

### 用差動對實作 op amp

如果 op amp 用電流鏡負載的差動對做：

![[aic-ex-hw2-active-load.svg|我畫的電流鏡負載差動對：M1 多流 ΔI，上面的電流鏡把它複製到右邊，右邊的輸入管同時少流 ΔI，輸出拿到 2ΔI]]

open-loop gain 是

$$
g_{m}(r_{on} \parallel r_{op}) = \frac{2}{V_{ov}}\left(\frac{1}{\lambda_n} \parallel \frac{1}{\lambda_p}\right)
$$

所以 L 要長、$V_{ov}$ 要小。但理想 op amp 的輸出阻抗要小，偏偏單級 OTA 的輸出阻抗就是決定增益的 $r_{on} \parallel r_{op}$；加大電流可以降低輸出阻抗，增益卻也跟著掉。兩者要兼得，就要再接一級，這是 [[AIC_hw4_blog|HW4]] 的兩級 op amp。另外也要檢查偏壓點，確定每顆電晶體都在 saturation。
