---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: SwiGLU 圖解
date: '2026-10-31'
updated: '2026-10-31'
tags:
  - diffusion
  - activation
summary: 用捲動看懂 SwiGLU（Ideogram 4 的 MLP 用的啟動函數）跟 ReLU、GELU 差在哪：多一條投影當閘門、hidden 縮成 8/3·d 讓參數不變，以及它在 FLOPs、記憶體搬運和訓練上的實際成本。
permalink: notes/swiglu/
synced: obsidian
layout: explainer
explainer:
  beats:
    - - intro
      - 1.6
      - Overview
    - - curves
      - 2
      - Curves
    - - gate
      - 2.4
      - Gate
    - - family
      - 1.4
      - Family
    - - width
      - 2
      - Width
    - - flops
      - 2
      - FLOPs
    - - memory
      - 1.6
      - Memory
    - - ideogram
      - 1.4
      - Ideogram 4
  hold: 0.35
  shots:
    - - intro
      - 0
      - 500
      - 0
      - 1120
    - - intro
      - 0.9
      - 500
      - 0
      - 1120
    - - curves
      - 0.12
      - 500
      - 700
      - 1120
    - - curves
      - 1
      - 500
      - 700
      - 1120
    - - gate
      - 0.1
      - 500
      - 1310
      - 1120
    - - gate
      - 1
      - 500
      - 1310
      - 1120
    - - family
      - 0.12
      - 500
      - 2030
      - 1120
    - - family
      - 1
      - 500
      - 2030
      - 1120
    - - width
      - 0.12
      - 500
      - 2700
      - 1120
    - - width
      - 1
      - 500
      - 2700
      - 1120
    - - flops
      - 0.12
      - 500
      - 3440
      - 1120
    - - flops
      - 1
      - 500
      - 3440
      - 1120
    - - memory
      - 0.12
      - 500
      - 4150
      - 1120
    - - memory
      - 1
      - 500
      - 4150
      - 1120
    - - ideogram
      - 0.12
      - 500
      - 4890
      - 1120
    - - ideogram
      - 1
      - 500
      - 4890
      - 1120
  narrowZoom: 0.97
  autoplayMs: 50000
  script: swiglu.js
  style: swiglu.css
---

# SwiGLU：不是換一條曲線，是多一條投影來*開關*

ReLU、GELU、SiLU 都是同一種東西：一個數字進去，一個數字出來。SwiGLU 把 MLP 的第一層拆成兩條投影 `a = W₁x`、`b = W₃x`，輸出是 `silu(a) · b`：一條決定開多大，一條決定送什麼。多了一個矩陣，參數和 FLOPs 卻跟原本一樣。下面用 Ideogram 4 的 MLP 把每一個數字算一次。

- **論文**：[Shazeer, arXiv 2002.05202](https://arxiv.org/abs/2002.05202)（2020）
- **誰在用**：PaLM、LLaMA、Ideogram 4
- **Ideogram 4 的 MLP**：4608 → 12288 → 4608 · 34 層
- **頁面上的例子**：1 個 token、8 個 hidden 單元

相關筆記：[[GELU]]、[[Ideogram 4]]

## 動畫


<!-- explainer:begin -->

<!-- explainer:card intro -->

### 同一個 MLP，兩種接法

Transformer 的每一層是 attention 加一個 MLP（也叫 FFN），每個 token 各算一次。上面是以往的接法：W₁ 放大到 4d，逐格過一個啟動函數 f，再用 W₂ 壓回 d。

下面是 SwiGLU：多一個梯形 **W₃**，x 同時投影成 a、b 兩條，各 8/3·d 寬。silu(a) 當閘門，逐格乘上 b，再用 W₂ 壓回 d。

> [!tip] 重點
> 多一個矩陣，但 hidden 變窄，參數一樣是 8d²。Ideogram 4 一層 264M 參數，MLP 就佔 64%。

<!-- explainer:card curves -->

### 三條曲線，都是 f(x)

**ReLU** 把負數直接變 0，在 0 折一下。原始的 Transformer（2017）用它。負的那半邊梯度永遠是 0。

**GELU** = x·Φ(x)、**SiLU**（Swish）= x·σ(x)：都是平滑版的 ReLU，負數不會整個砍掉，還有一個小凹陷。BERT、GPT-2、SD 3.5 用 GELU。

> [!tip] 共通點
> 都是一個數字進、一個數字出，hidden 的每一格只看自己。換哪一條，參數和 FLOPs 都不變。

<!-- explainer:card gate -->

### 兩條投影，一條開關另一條

SwiGLU 的第一層有兩個矩陣：`a = W₁x`、`b = W₃x`。silu(a) 決定這一格開多大，b 決定送出去的值，兩個逐格相乘。

右邊兩張圖的橫軸是 a、縱軸是 b。GELU 只看 a，所以是一條一條直紋；silu(a)·b 是兩個輸入相乘的曲面，b = 0 那條線整排都是 0。

> [!tip] 差在哪
> 以往的 f(x) 是固定的形狀；SwiGLU 的輸出是兩條投影的乘積（二次項），哪一格要放行由輸入自己決定。

<!-- explainer:card family -->

### 同一個結構，換閘門函數

Dauphin 等人（2017）在卷積語言模型裡提出 GLU：`σ(xW) ⊙ xV`。Shazeer（2020）把它放進 Transformer 的 FFN，閘門換成不同函數：沒有函數是 Bilinear，換 ReLU、GELU、Swish 就是 ReGLU、GEGLU、SwiGLU。

同樣的參數量和 FLOPs 下，GLU 系列的 perplexity 都比 ReLU、GELU 低，GEGLU 和 SwiGLU 最好。

> [!tip] 之後
> PaLM（2022）、LLaMA（2023）都用 SwiGLU，Ideogram 4 的 DiT 也是。

> [!note]
> 長條圖的數字來自論文 Table 1，頁面上的值還沒有跟原文逐字核對過。

<!-- explainer:card width -->

### 多一個矩陣，hidden 縮成 2/3

GELU 的 MLP 兩個矩陣，hidden = 4d：`2 · d · 4d = 8d²`。SwiGLU 有三個矩陣，hidden 也用 4d 的話是 12d²，參數和 FLOPs 都變 1.5 倍。

所以 hidden 改成 4d 的 2/3，也就是 8/3·d：`3 · d · 8/3·d = 8d²`，跟 GELU 一模一樣。

> [!tip] Ideogram 4
> d = 4608，hidden = 12288 = 8/3 × 4608，一點不差。LLaMA-7B 是 4096 → 11008，取到 256 的倍數。

<!-- explainer:card flops -->

### 啟動函數本身幾乎免費

一個 token 過一層 MLP，矩陣乘法是 `2 · 3 · d · h = 16d²` FLOPs。Ideogram 4 是 3.4 億。

啟動函數是逐格的小運算：GELU 每格約 8 個 op × 4d 格，SwiGLU 每格約 5 個 op × 8/3·d 格。長條圖用對數軸：兩者都比矩陣乘法小三到四個數量級。

> [!tip] 結論
> FLOPs 上，換成 SwiGLU 的差別是 0.03% 以下。計算量幾乎全在矩陣乘法，而兩邊的矩陣乘法一樣大。

<!-- explainer:card memory -->

### 逐點運算的成本在搬資料

逐點運算的時間花在 HBM 讀寫，不是在算。沒有融合時，GEMM 寫出 hidden、逐點運算讀進來再寫回去。SwiGLU 要搬 a、b 兩份，總量比 GELU 多一點。

實作上 W₁、W₃ 併成一次 d → 2h 的 GEMM，silu·乘法放在 GEMM 的 epilogue：a、b 不落地，只寫出 h 格，而且 h 比 4d 窄。

> [!tip] 訓練
> 反向傳播要存的張量變多：PyTorch 預設存 a、b、silu(a)、乘積，比 GELU 多 33%；silu(a) 在反向時重算就打平。

<!-- explainer:card ideogram -->

### 34 層，5.78B 參數在 MLP

每一層的 MLP 都是同一個 SwiGLU：4608 → 2 × 12288 → 4608，沒有 bias。34 層加起來 5.78B 參數，一張 1024² 的圖（4096 個圖片 token）每一步光 MLP 就要 47 TFLOPs。

> [!tip] 對照 SD 3.5
> SD 3.5 Large 的 GELU MLP 每條流每層 47.3M，一個圖片 token 過一層是 94.6M FLOPs；Ideogram 4 是 339.7M，貴 3.6 倍。原因是寬度 4608 / 2432 的平方，不是 SwiGLU。

<!-- explainer:end -->


## 三件事

1. **不是換曲線，是換結構**。ReLU、GELU、SiLU 都是 f(x)。SwiGLU 是 `silu(W₁x) ⊙ W₃x`：兩條投影相乘，一條當閘門，閘門開多大由輸入決定。
2. **同樣的預算**。多一個矩陣，hidden 縮到 8/3·d，參數和矩陣乘法的 FLOPs 都是 8d² / 16d²，跟 4d 的 GELU 一樣。Ideogram 4 的 12288 就是這樣來的。
3. **差的只有逐點運算和訓練記憶體**。啟動函數本身佔 FLOPs 不到 0.05%；融合進 GEMM 之後連搬資料都比 GELU 少。代價是訓練時要多存一份 hidden，或在反向時重算。

## 對照表

每個 token、每一層 MLP · d = 寬度

| 項目 | ReLU / GELU FFN | SwiGLU（h = 4d） | SwiGLU（h = 8/3·d） |
| --- | --- | --- | --- |
| 公式 | W₂ f(W₁x) | W₂ (silu(W₁x) ⊙ W₃x) | W₂ (silu(W₁x) ⊙ W₃x) |
| 矩陣 | 2 | 3 | 3 |
| hidden 寬度 | 4d | 4d | 8/3·d |
| 參數 | 8d² | 12d² | 8d² |
| 矩陣乘法 FLOPs | 16d² | 24d² | 16d² |
| 逐點運算（約） | ReLU 4d · GELU 32d | 20d | 13.3d |
| 訓練要存的 hidden | 8d | 16d | 10.7d（重算 silu 時 8d） |
| Ideogram 4 每層參數 | 169.9M | 254.8M | 169.9M |

## 實際用的時候

- PyTorch 一行：`w2(F.silu(w1(x)) * w3(x))`，Ideogram 4 的 `Ideogram4MLP` 就是這樣寫的，三個 Linear 都 `bias=False`。
- 推論框架通常把 W₁、W₃ 接成一個 `gate_up_proj`（d → 2h），一次 GEMM 算完，再用一個融合 kernel 做 silu·乘法。
- hidden 常會取整到 64 或 256 的倍數讓 GEMM 好切。Ideogram 4 剛好整除：12288 = 48 × 256。
- 想看 SwiGLU 在整個模型裡的位置，可以接著看 [Ideogram 4 vs SD 3.5 的塔](https://hanksome1.github.io/lab/ideogram4-vs-sd35-tower/)，第 1 層拆開後最大的那一塊就是它。

## 資料來源與數字怎麼算的

- Ideogram 4 的結構（4608、12288、34 層、18 heads、`w2(silu(w1 x) * w3 x)`、沒有 bias）來自 [ideogram-oss/ideogram4](https://github.com/ideogram-oss/ideogram4) 的 `modeling_ideogram4.py`。SD 3.5 的 2432 → 9728 來自 [Stability-AI/sd3.5](https://github.com/Stability-AI/sd3.5)。
- GLU 變體的定義與 Stop 03 的 perplexity 來自 [Shazeer, GLU Variants Improve Transformer](https://arxiv.org/abs/2002.05202) Table 1（T5-base 大小、524,288 步）；GLU 原始定義來自 [Dauphin et al.](https://arxiv.org/abs/1612.08083)。**這幾個數字還沒有跟原文逐字核對。**
- 逐點運算的 op 數是估計：ReLU 1、GELU（tanh 近似）約 8、SiLU 約 4（取負、exp、加 1、除）、SwiGLU 再加 1 次乘法。實際成本看 kernel 和硬體。
- Stop 06 的搬運量以元素數計，只算 W_in 輸出到 W_out 輸入之間的 hidden，不含 x 和權重。訓練要存的張量照 PyTorch autograd 預設推算：GELU 存 u 與 GELU(u)；SwiGLU 存 a、silu(a)、b 與乘積。
- 一層的參數：attention 4d²（qkv 3d² + o d²）、調變 512 × 4d + 4d、MLP 3dh，norm 忽略不計。每一步的 FLOPs 只算 4096 個圖片 token 過 MLP，不含文字 token 與 attention。
