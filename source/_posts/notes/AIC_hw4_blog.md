---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: AIC HW4：兩級 op amp、local CMFB 與 Miller 補償
date: '2024-11-27'
updated: '2026-10-16 21:34:04'
tags:
  - AIC
  - HSPICE
  - Amplifier
  - Feedback
summary: 從零做一顆兩級 op amp：第一級差動對加上電阻式的 local common-mode feedback，第二級 PMOS common source，用電流鏡偏壓、Miller 電容補償。增益 60.7 dB、頻寬 6.2 kHz、phase margin 65.9°、39 µW。另外分析共模回授迴路本身的增益和穩定度。
permalink: notes/aic-hw4/
synced: obsidian
---

最後一份作業把整學期的東西串起來：[[AIC_Differential_Amp_blog|差動對]]當第一級、[[AIC_SingleStageAmp_blog|CS]] 當第二級、[[AIC_CurrentMirror_Cascode_blog|電流鏡]]偏壓、[[AIC_Stability_blog|Miller 補償]]，再加上一個共模回授（CMFB）迴路。作業一步一步引導：先做第一級，再加第二級，最後補償。$V_{DD}$ = 1.8 V、27°C、TT corner，所有 NMOS 的 body 接地、PMOS 接 $V_{DD}$。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

![[aic-hw4-opamp.svg|完成的兩級 op amp。第一級是 M1、M2 差動對，M3、M4 是 PMOS 負載，兩顆 R_sen 取出輸出的平均回授到 M3、M4 的 gate（local CMFB）；第二級是 M6 的 PMOS common source，M5 是電流源；C_c 跨在第二級兩端做 Miller 補償；M_mir 把 I_ref 複製成 M0、M5 的偏壓]]

## Part 1：第一級

### Step 1：理想偏壓

先用理想電壓源給 M0 的 gate（$V_{bias}$）和 M3、M4 的 gate（$V_x$）。

**功率**：規格 < 20 µW，總電流要小於 11.1 µA，每一邊 5.55 µA，這決定了 tail M0 的尺寸上限。

**$V_{bias}$ 選 0.5 V，不選 0.4 V。** NMOS 的 $V_{th}$ 約 0.38 V，而且隨操作點會飄 0.01 V 左右。$V_{bias}$ = 0.4 V 時 $V_{ov}$ 只有 0.02 V，0.01 V 的飄移就是一半；0.5 V 時 $V_{ov}$ 約 0.12 V，同樣的飄移影響小得多，對 PVT 變異也比較不敏感。代價是 tail 要多吃一點 headroom。

**增益**：差模時中間是 virtual ground，可以只看半邊：

$$
A_v = g_{m1}(r_{o1} \parallel r_{o3}) = \sqrt{\frac{2\mu C_{ox}(W/L)}{I_D}}\left(\frac{1}{\lambda_n} \parallel \frac{1}{\lambda_p}\right)
$$

所以 L 要長（$\lambda$ 小）、W/L 適中、$I_D$ 小（電流本來就被功率限制了）。

**尺寸**：M1、M2 用 2 µm / 2 µm；$\mu_n C_{ox}$ 大約是 $\mu_p C_{ox}$ 的 3.7 倍，PMOS 的 W/L 先設成 3.7 倍，7.4 µm / 2 µm。

**$V_x$**：第一級的輸出 $V_{op1}$ 要接到第二級 PMOS 的 gate，偏壓太低第二級容易掉進 triode，太高又容易關掉，先讓它在 1.2 V 左右，由此推出 M0 的 W/L ≈ 2，選 2 µm / 1 µm。

**調整**：第一次模擬只有 PMOS 在 saturation，NMOS 和 tail 都在 triode。PMOS 的電流能力比 NMOS 小，為了流出一樣的電流，PMOS 的 $V_{SD}$ 被撐得很大，把下面的電晶體擠進 triode。把 $V_x$ 往下調、加大 PMOS 的 overdrive，調到 1.1985 V 時兩邊的電流相等，全部進入 saturation。

結果：差動增益 84.25 V/V，功率 7.77 µW。差動的輸出阻抗是 5.77 MΩ，單邊大約 2.9 MΩ。

### Step 2：加上 local CMFB

第一級是全差動的，兩個輸出的差由輸入決定，但兩個輸出的平均（輸出共模）沒有東西固定它：PMOS 負載和 NMOS 輸入管的電流只要差一點點，輸出共模就會往 $V_{DD}$ 或地跑。Step 1 是用理想的 $V_x$ 硬調到兩邊平衡，換成實際電路就需要回授。

做法是用兩顆大電阻 $R_{senn}$、$R_{senp}$ 把兩個輸出接到 M3、M4 的 gate：

- **共模**：輸出共模上升 → $V_x$ 跟著上升 → PMOS 的 $V_{SG}$ 變小、電流變小 → 輸出被拉下來。這是負回授，輸出共模就被固定住了。
- **差模**：兩個輸出一上一下，兩顆電阻的中點不動（virtual ground），$V_x$ 不變，不影響差模訊號。

但對差模來說，每顆 $R_{sen}$ 都並聯在單邊的輸出上，增益變成

$$
g_{m1}(r_{o1} \parallel r_{o3} \parallel R_{sen})
$$

所以 $R_{sen}$ 要遠大於單邊的輸出阻抗（約 2.9 MΩ），選 1 GΩ 等級。加上之後增益從 84.25 掉到 84.13，損失 0.11 V/V，小於規格允許的 1 V/V。

| 參數 | 規格 | Step 1（理想偏壓） | Step 2（加上 CMFB） |
| --- | --- | --- | --- |
| $V_x$ | — | 1.1985 V（電壓源） | 由 CMFB 決定 |
| $V_{bias}$ | — | 0.5 V | 0.5 V |
| 差動增益 | > 40 V/V | 84.25 V/V | 84.13 V/V |
| 功率 | < 20 µW | 7.77 µW | 7.77 µW |

## Part 2：第二級

第二級是 M6 的 PMOS common source，gate 接 $V_{op1}$；M5 是 NMOS 電流源，gate 用同一個 $V_{bias}$。

- **功率**：總共 < 60 µW，電流 < 33.3 µA。第一級已經用了 4.3 µA，第二級最多 29 µA，換算成 M5 的 W/L < 15.4。
- **增益**：總增益要 > 60 dB（1000 V/V）。第二級只接第一級的單邊輸出 $V_{op1}$，第一級單邊的增益是差動增益的一半，約 42 V/V，所以第二級至少要 24 V/V：

$$
A_{v2} = g_{m6}(r_{o5} \parallel r_{o6}) > 24
$$

- **尺寸比**：M5、M6 流同一個電流，讓兩邊的 square law 相等：$V_{ov,p} = 1.8 - 1.1985 - 0.49 \approx 0.11$ V、$V_{ov,n} = 0.5 - 0.382 = 0.118$ V，再乘上 mobility 的比值，PMOS 的 W/L 大約是 NMOS 的 4 倍。M5 選 6 µm / 1 µm，M6 選 24 µm / 1 µm。

第一次模擬增益只有 −777 V/V，因為 NMOS 剛好在 saturation 的邊緣：NMOS 能流的電流比 PMOS 多，PMOS 要靠很大的 $V_{SD}$ 才追得上，輸出被壓得很低。把 M6 從 24 µm 微調到 24.3 µm，兩邊的電流平衡，增益上到 60.69 dB，功率 32.0 µW。

## Part 3：電流鏡偏壓與 Miller 補償

### 簡化模型

![[aic-miller-compensation.svg|兩級放大器的小訊號模型（第一級的轉導在作業的模型裡是 g_m1/2，因為只取單邊輸出）。C_c 讓兩個 pole 往相反方向分開]]

作業的簡化模型和[[AIC_Stability_blog|穩定度與補償]]那篇一樣，只是第一級的轉導是 $g_{m1}/2$（差動輸入、只取 $V_{op1}$ 一邊）。對兩個節點寫 KCL：

$$
\frac{V_{out}}{V_{ip} - V_{in}} = \frac{-\frac{g_{m1}}{2}g_{m2}R_1R_2\,(1 - sC_c/g_{m2})}{1 + s\left[(C_2 + C_c)R_2 + (C_1 + C_c)R_1 + g_{m2}R_1R_2C_c\right] + s^2R_1R_2(C_1C_2 + C_1C_c + C_2C_c)}
$$

| | 公式 |
| --- | --- |
| DC 增益 | $\frac{g_{m1}}{2}g_{m2}R_1R_2$ |
| $\omega_{p1}$ | $\approx \dfrac{1}{g_{m2}R_1R_2C_c}$ |
| $\omega_{p2}$ | $\approx \dfrac{g_{m2}}{C_1 + C_2}$ |
| $\omega_u$ | $A_0\,\omega_{p1} = \dfrac{g_{m1}}{2C_c}$ |
| $\omega_z$ | $\dfrac{g_{m2}}{C_c}$（右半平面） |

### 電流鏡

$V_{bias}$ 改由電流鏡產生。M0 流 4.32 µA、尺寸 2 µm / 1 µm；為了省功率，參考端 $M_{mir}$ 用四分之一的尺寸 0.5 µm / 1 µm，$I_{ref}$ 就只要四分之一的電流，約 1.08 µA。模擬出來的 $V_{bias}$ 是 0.511 V，比 0.5 V 高一點，把 $I_{ref}$ 降到 0.91 µA，$V_{bias}$ 剛好 0.500 V。

為什麼要電流鏡？把它換回理想電壓源，跑三個 corner：

| Corner | SS | TT | FF |
| --- | --- | --- | --- |
| 電流鏡產生的 $V_{bias}$ | 585.7 mV | 500.4 mV | 455.0 mV |
| 電壓源的 $V_{bias}$ | 500 mV | 500 mV | 500 mV |

SS corner 的 $V_{th}$ 比較高，電流鏡自動給比較高的 $V_{bias}$；FF 反過來。固定電壓的偏壓在 SS 時 $V_{ov}$ 會變得很小，最差的情況電晶體會進不了 saturation。電流鏡讓電流（而不是電壓）保持在設計值，電路對製程變異的免疫力好得多。

### 設計 $C_c$

從 Part 2 讀出 $g_{m1}$ = 29.2 µS、$g_{m2}$ = 174.5 µS、$R_1$ = 2.879 MΩ、$R_2$ = 148 kΩ，$C_1 + C_2 \approx 1.01$ pF（大部分是 1 pF 的負載）。

**頻寬 > 6 kHz**，也就是 $\omega_{p1} > 2\pi\times 6\text{k}$：

$$
\frac{1}{g_{m2}R_1R_2C_c} > 2\pi\times 6\ \text{kHz} \quad\Rightarrow\quad C_c < 0.35\ \text{pF}
$$

**Phase margin > 45°**，用經驗法則讓第二個 pole 在 unity-gain frequency 的 3 倍以外：

$$
\frac{g_{m2}}{C_1 + C_2} > 3\cdot\frac{g_{m1}}{2C_c} \quad\Rightarrow\quad C_c > \frac{3}{2}\cdot\frac{g_{m1}}{g_{m2}}(C_1 + C_2) \approx 0.25\ \text{pF}
$$

兩個條件之間選 $C_c$ = 0.315 pF。模擬的 phase margin 約 65.9°、頻寬 6.20 kHz，不用再調。作業規定測試時在 $V_{on1}$ 也接一份第二級的複製品（同樣的 M5、M6、$C_c$ 和負載），讓第一級兩邊的負載對稱。

### 結果

![[Pasted image 20241222163050.png|補償後的 open-loop 差動增益（上）和相位（下）。DC 增益 60.7 dB，pole 1 在 6.23 kHz，unity-gain frequency 6.36 MHz，此時相位還有 65.9° 的 phase margin；pole 2 在 17.6 MHz，右半平面的 zero 在 85.8 MHz]]

| 參數 | 規格 | 模擬 |
| --- | --- | --- |
| 增益 | > 60 dB | 60.73 dB |
| −3 dB 頻寬 | > 6 kHz | 6.20 kHz |
| Phase margin | > 45° | 65.9° |
| 功率 | < 60 µW | 39.2 µW |

手算和 `.pz` 的比較：

| | 手算 | 模擬 | 誤差 |
| --- | --- | --- | --- |
| DC 增益 | 1086 V/V | 1087 V/V | 0.1% |
| Pole 1 | 6.80 kHz | 6.22 kHz | 9% |
| Zero | 88.2 MHz | 86.1 MHz | 2.4% |

加了電流鏡之後，`.pz` 還多出幾個比 pole 2 更低頻的 pole、zero，它們成對出現、幾乎互相抵消，比較時就先忽略。

### Pole 怎麼移動

| | 補償前 | 補償後 |
| --- | --- | --- |
| Pole 1 | 130.9 kHz | 6.23 kHz |
| Unity-gain frequency | 19.36 MHz | 6.36 MHz |
| Pole 2 | 2.65 MHz | 17.6 MHz |
| Zero | 3.17 GHz | 85.8 MHz |

![[Drawing 2024-12-22 17.35.43.excalidraw.svg|補償後 unity-gain frequency 往低頻移、pole 2 往高頻移，兩者的距離拉開，phase margin 就變大了]]

補償前，pole 2（2.65 MHz）在 unity-gain frequency（19.4 MHz）之內，phase margin 很差。補償後 pole 1 被 Miller 效應往下推了 20 倍，unity-gain frequency 跟著降到 6.36 MHz；pole 2 同時被推到 17.6 MHz，跑到 unity-gain frequency 的將近 3 倍以外。Zero 也從 GHz 掉到 85.8 MHz，但還在 unity-gain frequency 的 13 倍以外，影響不大。

## Bonus：共模回授迴路

### 共模增益

把兩個輸入接在一起，給共模訊號，看單端輸出。共模的路徑可以畫成一個迴路：

![[aic-hw4-cm-loop.svg|共模的簡化模型。A_v1,cm 是第一級的共模增益，A_v2,cm 是第二級；R_sen 取出輸出共模（A_sen = 1），經過 M3、M4（A_cmc）回授到第一級的輸出，形成 CMFB 迴路]]

- **$A_{v1,cm}$**（$V_{in}$ 到 $V_{op1}$，迴路打開時）：[[AIC_Differential_Amp_blog|共模半電路]]是 CS 加上 $2R_{SS}$ 的 degeneration，$R_{SS} = 1/g_{ds0}$ = 1.245 MΩ。輸出端看到的阻抗是 $(2g_{m1}r_{on}R_{SS}) \parallel r_{op} \parallel R_{sen}$ = 255 M ∥ 16.0 M ∥ 1 G ≈ 14.87 MΩ：

$$
A_{v1,cm} = \frac{14.87\ \text{M}}{1/g_{m1} + 2R_{SS}} \approx 5.9
$$

- **$A_{cmc}$**（$V_x$ 到 $V_{op1}$）：PMOS 負載的轉導乘上同一個輸出阻抗，$26.7\ \mu\text{S}\times 14.87\ \text{M} \approx 397$。
- **$A_{v2,cm}$**（$V_{op1}$ 到 $V_{out}$）：第二級的增益，$g_{m6}(r_{o5} \parallel r_{o6})$ = 174.5 µS × 148 kΩ ≈ 25.8。

整體的共模增益：

$$
\frac{V_{out}}{V_{in,cm}} = \frac{A_{v1,cm}}{1 + A_{cmc}A_{sen}}\cdot A_{v2,cm} \approx \frac{5.9}{398}\times 25.8 \approx 0.38
$$

`.tf` 量到的是 0.325，手算高了約 17%，比這份作業其他地方的誤差都大，共模路徑的手算還有改進的空間。

![[Pasted image 20241223005122.png|共模增益（上，dB）和相位（下）對頻率。低頻的共模增益約 −10 dB；1 kHz 以上 CMFB 迴路的增益開始下降，壓制共模的能力變弱，共模增益在 100 kHz 附近升到約 +20 dB，之後才隨著電路本身的 pole 下降]]

共模增益不是一條平的線：CMFB 只在迴路增益夠大的頻段有效。頻率一高，迴路增益掉下來，共模就壓不住了，這也是 CMFB 迴路的頻寬要做夠大的原因。

### 共模迴路的 loop gain 與穩定度

CMFB 本身也是一個回授迴路，也要檢查 phase margin。它的 loop gain 是 $A_{cmc}A_{sen} \approx 397$。

要量 loop gain，得把迴路切開，但切開之後 DC 偏壓又會跑掉。作業用的技巧是在迴路裡串一顆 $10^{100}$ H 的電感、再用一顆 $10^{100}$ F 的電容把測試訊號接進來：DC 時電感短路、電容開路，迴路是閉合的，偏壓點正確；AC 時電感開路、電容短路，迴路被切開，測試訊號從切口注入。

![[aic-ex-hw4-cm-loop-break.svg|我畫的拆迴路方式：R_sen 取出的 V_outCM 經過電感 L 才接到 M3、M4 的 gate（V_x），測試訊號 V_inCM 經過電容 C 從 V_x 注入]]

![[Pasted image 20241223153731.png|CMFB 迴路的 loop gain（上，dB）和相位（下）。低頻 52.2 dB；相位從 180° 開始（負回授本身的反相），在增益掉到 0 dB（約 580 kHz）時還有約 125°]]

量到的 loop gain 是 52.19 dB（408 V/V），和手算的 397 差 2.7%。增益掉到 0 dB 時相位還有約 125°，共模迴路非常穩定。
