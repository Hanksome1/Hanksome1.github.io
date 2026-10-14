---
title: 3D Gaussian Splatting 硬體加速器
date: 2026-10-14 10:00:00
layout: project
featured: true
part: 3DGS-RTL
summary: 把 3D Gaussian Splatting 的 rendering pipeline（3D／2D covariance、深度排序、alpha blending）寫成 8 級 RTL 並走完 APR，在 5 ns cycle time 下以 2.63 mW 跑出 128×128、64 顆 Gaussian 的 367.8 FPS，期末專題成績全班第一（25 組）。
period: 2026 Spring
role: Algorithm · Golden model & testbench · RTL · Optimization
course: 清大 EE4292 積體電路設計實驗（ICLAB）期末專題
team: 3 人小組
stack: [Verilog, Python]
tools: [SpyGlass, Conformal LEC, Innovus]
tags: [Accelerator, Verilog, 3D Gaussian Splatting, APR]
floorplan: [ROT / COV3D, PROJECTION, SORT, RENDER, SRAM]
cover: /images/3dgs-accelerator/apr-layout.jpg
metrics:
  - { label: Throughput, value: 367.8 FPS, note: "128×128 · 64 Gaussians" }
  - { label: Power, value: 2.63 mW, note: "post-layout · post-sim waveform" }
  - { label: Area, value: "240,128 µm²", note: "post-APR · core util. 75%" }
  - { label: Cycle time, value: 5.0 ns, note: "200 MHz · no violation after APR" }
---

## Overview

[3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)（3DGS，Kerbl et al., SIGGRAPH 2023）不用 mesh，而是用大量帶有顏色、半透明的 3D Gaussian 來表示整個場景。畫面品質很好，但原論文要靠高階 GPU 才能維持 real-time 的 frame rate。這個期末專題想回答一個問題：**如果把整條 rendering pipeline 做成專用硬體，面積和功耗可以壓到多低？**

![3DGS 原論文的流程（圖片來源：Kerbl et al., SIGGRAPH 2023）](/images/3dgs-accelerator/3dgs-pipeline.png)

原論文的流程包含訓練與 rendering：SfM 點雲先初始化成 3D Gaussian，經過 Projection 與 differentiable tile rasterizer 算出影像，再把梯度（藍色箭頭）傳回去調整 Gaussian，adaptive density control 則負責增加或刪除 Gaussian。我們的加速器只做 rendering 這一半：輸入已經訓練好的 Gaussian 與相機參數，輸出影像，不做梯度回傳，也不做 density control。

課程給的規格是 64×64、100 FPS、cycle time 5 ns，面積上限 2,000,000 µm²、功耗上限 150 mW。最後我們把解析度提高到規格的 4 倍（128×128），跑出 **367.8 FPS**，面積只用了上限的 12%，功耗是 **2.63 mW**，而且走完了 synthesis、APR 到 post-layout simulation 的完整流程。這份期末專題拿到全班 25 組中的最高分（全班平均 82.4）。

<figure>
<video src="/images/3dgs-accelerator/demo-orbit.mp4" poster="/images/3dgs-accelerator/demo-orbit-poster.jpg" width="1254" height="298" autoplay loop muted playsinline aria-label="用 3D Gaussian 排出的 ICLAB 字樣，隨相機位置改變繞著字轉一圈"></video>
<figcaption>Demo：用 3D Gaussian 排出「ICLAB」，逐幀改變 camera position 重新 render，串起來就是繞著字轉一圈的畫面。畫面由 Python 模型 render，同樣的輸入跑 RTL simulation，輸出也和 Python 的結果一致</figcaption>
</figure>

![Python 模擬的 rendering 流程：左邊是 camera space 裡的 3D Gaussian，中間是投影到螢幕上的橢圓，右邊是 alpha blending 之後的畫面](/images/3dgs-accelerator/render-demo.png)

## 演算法：從 3D Gaussian 到 pixel

每一顆 Gaussian 有 14 個參數：位置 $(x, y, z)$、縮放 $(s_x, s_y, s_z)$、旋轉的 quaternion $(w, x, y, z)$、不透明度 opacity，以及顏色 $(r, g, b)$。一顆 Gaussian 的形狀由它的 3D covariance $\Sigma$ 決定：

$$
G(\mathbf{x}) = e^{-\frac{1}{2}\mathbf{x}^\top \Sigma^{-1} \mathbf{x}}
$$

整條 pipeline 分成四步：3D covariance → 投影與 2D covariance → 依深度排序 → rasterization。

### 1. 3D covariance

先把 quaternion 轉成旋轉矩陣 $R$，縮放則是對角矩陣 $S$：

$$
R = \begin{bmatrix}
1 - 2(y^2 + z^2) & 2(xy - wz) & 2(xz + wy) \\
2(xy + wz) & 1 - 2(x^2 + z^2) & 2(yz - wx) \\
2(xz - wy) & 2(yz + wx) & 1 - 2(x^2 + y^2)
\end{bmatrix},
\quad
S = \begin{bmatrix} s_x & 0 & 0 \\ 0 & s_y & 0 \\ 0 & 0 & s_z \end{bmatrix}
$$

$$
\Sigma = R S S^\top R^\top
$$

### 2. 投影與 2D covariance

用 view matrix $W$ 把 Gaussian 的位置轉到 camera space，深度太小（在相機後面或太近）的 Gaussian 直接剔除：

$$
\mathbf{t} = \begin{bmatrix} x \\ y \\ z \\ 1 \end{bmatrix} = W \cdot \mathbf{P}
= \begin{bmatrix}
R_{00} & R_{01} & R_{02} & T_x \\
R_{10} & R_{11} & R_{12} & T_y \\
R_{20} & R_{21} & R_{22} & T_z \\
0 & 0 & 0 & 1
\end{bmatrix}
\begin{bmatrix} P_x \\ P_y \\ P_z \\ 1 \end{bmatrix}
$$

透視投影不是線性的，所以用 Jacobian $J$ 在 Gaussian 中心做一階近似（$f_x, f_y$ 是相機焦距），再把 $\Sigma$ 投影成螢幕上的 2D covariance $\Sigma'$：

$$
J = \begin{bmatrix}
f_x / z & 0 & -f_x x / z^2 \\
0 & -f_y / z & f_y y / z^2
\end{bmatrix},
\qquad
\Sigma' = J \, W_{3\times3} \, \Sigma \, W_{3\times3}^\top \, J^\top
$$

rasterization 真正要用的是 $\Sigma'$ 的反矩陣，也就是 conic 參數 $A, B, C$：

$$
\Sigma'^{-1} = \frac{1}{\det(\Sigma')}
\begin{bmatrix} \Sigma'_{11} & -\Sigma'_{01} \\ -\Sigma'_{10} & \Sigma'_{00} \end{bmatrix}
= \begin{bmatrix} A & B \\ B & C \end{bmatrix}
$$

最後算出橢圓在螢幕上的中心 $(u, v)$ 與 bounding box 的半徑，取 3 個標準差：

$$
u = \frac{f_x x}{z} + \frac{\text{width}}{2}, \quad
v = \frac{f_y y}{z} + \frac{\text{height}}{2}, \qquad
R_x = 3\sqrt{\Sigma'_{00}}, \quad R_y = 3\sqrt{\Sigma'_{11}}
$$

![Bounding box：只有落在框內的 pixel 才需要計算這顆 Gaussian 的貢獻](/images/3dgs-accelerator/bounding-box.png)

### 3. 依深度排序

把所有沒被剔除的 Gaussian 依深度由近到遠排好。原論文在 GPU 上用 radix sort，我們改用 bitonic sort，原因放在後面的[最佳化](#Bitonic-sort-取代-radix-sort)。

### 4. Rasterization

對每個 pixel $(p_x, p_y)$，依排序後的順序走過每一顆 Gaussian $i$。pixel 在 bounding box 裡面，才計算這顆 Gaussian 的不透明度 $\alpha$：

$$
\Delta x = p_x - u_i, \quad \Delta y = p_y - v_i, \qquad
P = -\tfrac{1}{2}\left(A\,\Delta x^2 + 2B\,\Delta x \Delta y + C\,\Delta y^2\right)
$$

$$
\alpha = \min\left(0.99,\ \text{opacity} \cdot e^{P}\right)
$$

再用 front-to-back 的 alpha blending 累加顏色。$T$ 是這個 pixel 剩下的穿透率，初始值為 1，小於 0.001 時就提早結束：

$$
C_{\text{acc}} \mathrel{+}= C_i \cdot \alpha \cdot T_{\text{old}}, \qquad
T_{\text{new}} = T_{\text{old}} \cdot (1 - \alpha)
$$

## Architecture

![頂層架構：8 個運算 stage 由 fsm.v 用 valid 訊號串起來，右側的乘法器、除法器與 LUT 由各 stage 共用](/images/3dgs-accelerator/block-diagram.png)

整個設計是 8 個 stage 依序處理，由 `fsm.v` 根據每個 stage 的 `*_valid` 訊號推進：

| Stage | 模組 | 工作 |
| --- | --- | --- |
| 1 | `Rot.v` | quaternion → 旋轉矩陣 $R$ |
| 2 | `Conv.v` | 3D covariance $\Sigma$ |
| 3 | `Campos.v` | 轉到 camera space、依深度剔除 |
| 4 | `Jacobian.v` | 投影的 Jacobian $J$ |
| 5 | `Conv2D.v` | 2D covariance $\Sigma'$ |
| 6 | `Conic.v` | conic 參數 $A, B, C$，寫進 Raster SRAM |
| 7 | `Sort.v` | 依深度 bitonic sort，寫進 Sort SRAM |
| 8 | `Render.v` | 逐 pixel alpha blending，寫進 Output SRAM |

記憶體方面，輸入有兩塊 SRAM：一塊放 view matrix，一塊放 Gaussian 參數。rasterization 需要的中間資料放在 Raster SRAM，排序後的順序放在 Sort SRAM，最後的影像寫進 Output SRAM。

數值格式用 **16-bit 定點數、小數 6 bits**（解析度 1/64），需要更高精度的地方再動態加大小數位數；乘法器和除法器的內部位寬也因此比 16 bits 寬（40×16-bit 乘法、36-bit 除法）。

## 最佳化

### 只算 covariance 的上三角

令 $M = RS$。$S$ 是對角矩陣，所以 $M$ 只是把 $R$ 的每個 column 乘上對應的縮放：

$$
M = RS =
\begin{bmatrix} r_{00} & r_{01} & r_{02} \\ r_{10} & r_{11} & r_{12} \\ r_{20} & r_{21} & r_{22} \end{bmatrix}
\begin{bmatrix} s_x & 0 & 0 \\ 0 & s_y & 0 \\ 0 & 0 & s_z \end{bmatrix}
=
\begin{bmatrix} s_x r_{00} & s_y r_{01} & s_z r_{02} \\ s_x r_{10} & s_y r_{11} & s_z r_{12} \\ s_x r_{20} & s_y r_{21} & s_z r_{22} \end{bmatrix}
$$

$\Sigma = RSS^\top R^\top = MM^\top$，每個元素都是 $M$ 兩個 row 的內積，所以 $\Sigma$ 一定是對稱矩陣，下三角和上三角完全一樣。硬體只需要算框起來的 6 個元素：

$$
\Sigma = MM^\top =
\begin{bmatrix}
\boxed{m_{00}^2 + m_{01}^2 + m_{02}^2} & \boxed{m_{00}m_{10} + m_{01}m_{11} + m_{02}m_{12}} & \boxed{m_{00}m_{20} + m_{01}m_{21} + m_{02}m_{22}} \\
m_{00}m_{10} + m_{01}m_{11} + m_{02}m_{12} & \boxed{m_{10}^2 + m_{11}^2 + m_{12}^2} & \boxed{m_{10}m_{20} + m_{11}m_{21} + m_{12}m_{22}} \\
m_{00}m_{20} + m_{01}m_{21} + m_{02}m_{22} & m_{10}m_{20} + m_{11}m_{21} + m_{12}m_{22} & \boxed{m_{20}^2 + m_{21}^2 + m_{22}^2}
\end{bmatrix}
$$

$$
\text{cov3D} = [\Sigma_{00}, \Sigma_{01}, \Sigma_{02}, \Sigma_{11}, \Sigma_{12}, \Sigma_{22}]
$$

9 個內積少算 3 個，$\Sigma$ 的乘法從 27 次降到 18 次。這是純粹從線性代數省下來的運算，不用付出任何精度代價。

### Bitonic sort 取代 radix sort

Radix sort 在 GPU 上很快，但它每一輪都要依序讀寫記憶體，做成硬體時會卡在 memory access 和 bank conflict。Bitonic sort 是固定的 sorting network：先交替做遞增、遞減的排序來建出 bitonic sequence，再用固定間隔的比較遞迴合併。同一層的比較彼此獨立，最多可以有 $N/2$ 個 comparator 同時運作，不會搶資源。

![Bitonic sorting network（16 筆資料）：藍色區塊是遞增、綠色區塊是遞減，每一條垂直箭頭是一次 compare-and-swap](/images/3dgs-accelerator/bitonic-sort.png)

### 壓縮 sqrt LUT

bounding box 的半徑要開根號，我們用 LUT 實作，但原本的表太大。觀察後發現很多輸入其實對應到同一個輸出值，所以把**出現次數最多的輸出設成 `case` 的 `default`**，其他相同輸出的 entry 就可以整個刪掉，面積明顯下降。

### 共用乘法器與除法器，再把它們 pipeline 化

8 個 stage 不會同時都在算，所以乘法器（`multiply.v`）、除法器（`division.v`）與 LUT 都由各 stage 共用，不是每個 stage 各放一套。問題是位寬一大，乘法在一個 cycle 內做不完，所以要 pipeline。比較的基準用 $\text{performance} = 1 / (A \times T)$：

| 模組 | 版本 | Area (µm²) | Cycle time (ns) | $A \times T$ |
| --- | --- | ---: | ---: | ---: |
| `multiply`（16×16） | 不 pipeline | 15,075 | 5.10 | 76,883 |
| `multiply`（16×16） | 2-stage | 20,239 | 2.94 | **59,503** |
| `multiply_long`（40×16） | 不 pipeline | 35,000 | 5.42 | 189,700 |
| `multiply_long`（40×16） | 4-stage | 66,102 | 2.49 | **164,594** |

pipeline 版本面積比較大，但 $A \times T$ 反而比較小；而且不 pipeline 的兩個版本 cycle time 都超過 5 ns，本來就過不了 timing。

除法器用在 stage 4（Jacobian 裡的 $1/z$）和 stage 6（$\det(\Sigma')$），而且輸入是連續進來的，所以做成 shift register 形式的 pipeline divider（36-bit ÷ 36-bit）。每個 stage 處理越多 bits，latency 越短、但 cycle time 越長，所以這次把 latency $C$ 也算進來，用 $P = 1 / (A \times T \times C)$ 比較：

| bits / stage | Area $A$ (µm²) | Timing $T$ (ns) | Latency $C$ (cycles) | $P$ (×10⁻⁷) |
| --- | ---: | ---: | ---: | ---: |
| 2 | 33,519 | 2.31 | 18 | 7.17 |
| **3** | **27,204** | **3.43** | **12** | **8.93** |
| 4 | 25,510 | 4.98 | 9 | 8.74 |

4 bits/stage 的 timing 已經是 4.98 ns，貼著 5 ns 的邊，到了 layout 幾乎沒有餘裕，所以最後選 3 bits/stage 的 12 級 divider，$P$ 也是三者裡最高的。

### Rasterization：pipeline + bounding box

GPU 的作法是把影像切成 16×16 的 tile，每個 tile 由一個 thread block 的 256 個 thread 負責，一個 thread 算一個 pixel，照排序好的清單由近到遠累加顏色。

我們只有一套硬體，所以把 rasterization 切成 **14 級 pipeline**，每個 cycle 送進一個新的 pixel：

![Rasterization 的 14 級 pipeline：依序算 Δ²、乘上 conic 參數、取指數、乘上 opacity、累加顏色，最後更新穿透率 T](/images/3dgs-accelerator/raster-pipeline.png)

對一張 $N \times N$ 的影像，原本每個 pixel 都要走完 14 個 stage 才換下一個；pipeline 之後每個 cycle 都能送進一個新的 pixel，只多了填滿 pipeline 的 13 個 cycle。一顆 Gaussian 的 cycle 數因此變成：

$$
\underbrace{14 \times N^2}_{\text{no pipeline}} \;\longrightarrow\; \underbrace{N^2 + 13}_{\text{14-stage pipeline}} \qquad (\text{speedup} \approx 14\times)
$$

模擬之後發現 rasterization 還是整個設計最花時間的部分，因為大部分 pixel 根本不在這顆 Gaussian 的影響範圍內。所以我們不像 GPU 一樣每個 pixel 都硬算，而是**先用 bounding box 把框外的 pixel 濾掉**，只對框內的 pixel 做顏色與穿透率的累加：

![64 顆 Gaussian、128×128 下每張 frame 的 cycle 數：加了 bounding box 之後從約 1,071,000 降到 543,882](/images/3dgs-accelerator/bbox-speedup.png)

整體 cycle 數再砍掉一半，speedup **1.969×**。

## Verification & physical design

1. **Pre-sim**：用 Python 產生 1、4、64 顆 Gaussian 各 50 組 pattern，Gaussian 參數放進 Gaussian SRAM、相機參數放進 view SRAM。RTL 寫進 Output SRAM 的影像逐 pixel 和 Python 的 golden 比對，全部通過。
2. **Lint**：用 SpyGlass 確認可合成、沒有 latch。
3. **Synthesis + LEC**：timing constraint 5.0 ns，合成面積 180,073 µm²（gate-level simulation 的 test cycle 設 4.34 ns）；用 Conformal 做 LEC，確認 netlist 和 RTL 邏輯等價。
4. **APR**：用 Innovus 做 placement & routing。一開始把目標設在 4.5 ns，placement 階段就出現大量 violation，最後放寬到 5 ns。花最多時間的是 hold time 和 max fanout violation；routing 之後的 max fanout 很難修，只能回頭調 core utilization 反覆重跑。最後 core utilization 75%，通過 DRC、connectivity 與 antenna 檢查，post-layout netlist 也再做了一次 LEC。
5. **Post-sim + power analysis**：用實際模擬的波形做 time-based power analysis，比 vectorless 的估計更貼近真實。

$$
\text{Core utilization} = \frac{\text{Area}_\text{SYN}}{\text{Area}_\text{APR}} = \frac{180{,}072.922}{240{,}128.460} \approx 75\%
$$

![APR 完成後的 layout](/images/3dgs-accelerator/apr-layout.jpg)

![Layout 的 IR drop 分析](/images/3dgs-accelerator/ir-drop.jpg)

功耗分析做了三種情況：layout 前、layout 後配 pre-sim 波形、layout 後配 post-sim 波形。

| Power (mW) | Pre-layout | Post-layout（pre-sim 波形） | Post-layout（post-sim 波形） |
| --- | ---: | ---: | ---: |
| Net switching | 0.132 | 0.822 | 0.806 |
| Cell internal | 1.847 | 1.840 | 1.819 |
| **Total** | **1.983** | **2.667** | **2.630** |

cell internal power 在 layout 前後幾乎不變，增加的部分幾乎都來自 net switching：layout 之前 wire load 是估的，layout 之後有了真實的繞線電容，net switching power 變成原本的 6 倍左右。

## Results

| | 規格 | 最終結果 |
| --- | ---: | ---: |
| 解析度 | 64 × 64 | **128 × 128** |
| Frame rate | 100 FPS | **367.8 FPS** |
| 面積 | 2,000,000 µm² | 240,128 µm² |
| Cycle time | 5.0 ns | 5.0 ns |
| 功耗 | 150 mW | 2.63 mW |

Frame rate 的算法：64 顆 Gaussian 的測資（pattern 100–149）平均每張 frame 要 543,882 個 cycle，

$$
543{,}882 \times 5\,\text{ns} \approx 2.719\,\text{ms/frame}
\;\Rightarrow\; \frac{1}{2.719\,\text{ms}} \approx 367.8\ \text{FPS}
$$

也就是 100 張 frame 只要 0.272 秒，同樣的 100 張 frame 用 Python 軟體算要 0.870 秒，硬體大約快 **3.2 倍**。

{% note tip 還可以再往上加 %}
目前只有一套 rasterization pipeline 在處理整張影像。原論文在 GPU 上把 1080p 影像切成 16×16 的 tile 平行處理；同樣的切法套到硬體上，多放幾套 `Render` 各自負責一塊 tile，就能往更高的解析度和 frame rate 推。
{% endnote %}

## 分工

三人小組，我負責演算法與 Python golden model／testbench、部分 RTL，以及演算法層面的最佳化。另外兩位組員分別負責 RTL、datapath sharing、合成與 LEC，以及 APR 與功耗分析。

## What I learned

- **比較硬體要看 $A \times T$，不能只看面積。** 不 pipeline 的乘法器面積最小，但 cycle time 根本達不到 5 ns；除法器則還要把 latency 算進去，最佳點落在中間的 3 bits/stage。
- **演算法層的省略最划算。** bounding box 一招就讓 cycle 數砍半，對稱矩陣少算 3 個元素，都比在電路上硬擠來得有效。
- **Timing 目標要留餘裕給 layout。** 4.5 ns 在合成時看起來沒問題，到了 placement 就壓不下來；接近 constraint 的設計（像 4.98 ns 的 divider）到 layout 階段很容易變成問題。
- **Layout 之後的功耗才是真的。** 繞線電容讓 net switching power 變成 6 倍，pre-layout 的數字明顯低估。

## References

1. B. Kerbl, G. Kopanas, T. Leimkühler, and G. Drettakis, "3D Gaussian Splatting for Real-Time Radiance Field Rendering," *ACM Transactions on Graphics (SIGGRAPH)*, vol. 42, no. 4, 2023.
2. H. Matsuki, R. Murai, P. H. J. Kelly, and A. J. Davison, "Gaussian Splatting SLAM," *CVPR*, 2024.
