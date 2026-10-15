---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: ICLAB HW5：Transformer attention 加速器
date: '2025-11-07'
updated: '2026-10-16 00:26:08'
tags:
  - ICLAB
  - Verilog
  - Accelerator
summary: HW5 用 RTL 實作一層 Transformer：normalization、Q/K/V projection、attention、softmax、O projection 與 residual，中間結果都量化成 10-bit 存在 SRAM。這篇記錄整個資料流，以及怎麼讓乘法器被各個階段共用。
permalink: notes/iclab-hw5-attention/
synced: obsidian
---

HW5 要用 RTL 實作一層 Transformer 的 attention，兩個 head、64 個 token。核心是

$$
\text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^\top}{\sqrt{c_{head}}}\right) V
$$

## SRAM 與量化

四顆 SRAM（A、B、C、D）輪流存放中間結果。每個 word 是 80 bit，放 8 個 channel、每個 channel 10 bit；8-bit 的 word mask 每個 bit 控制一個 channel 要不要寫入。每個運算階段的輸出都先量化成 10-bit，再寫回 SRAM。

## 資料流

1. 從 SRAM A 讀入 patch embedding，做 normalization，量化後寫入 SRAM B。
2. 從 SRAM B 讀出，算 head 0 的 Q、K、V projection，量化後寫入 SRAM C。
3. 從 SRAM C 讀出 Q、K，先算 attention score $QK^\top$ 的前 16 列，乘上 $1/\sqrt{c_{head}}$，量化後寫入 SRAM D。
4. 從 SRAM D 讀出，做 softmax，量化後寫入 SRAM B。
5. 從 SRAM C 讀出 V、從 SRAM B 讀出 softmax 的結果，相乘後量化，寫入 SRAM D。
6. 重複 3–5，完成剩下的 48 列。
7. 從步驟 1 重新開始，完成 head 1。
8. 從 SRAM D 讀出兩個 head 的結果，做 O projection，量化後寫入 SRAM C。

最後再加上 residual connection。

## Normalization

![[ICLAB_HW5_normalization.svg|Normalization 的 FSM：讀入 weight 和 bias 之後進入計算，datapath 依序算出平均、誤差，再做 channel-wise 的 affine transformation 並寫回]]

每個 token 有 16 個 channel。這裡的 normalization 用平均絕對誤差（mean absolute error）取代標準差，省掉平方和開根號：

$$
\mu = \frac{1}{16}\sum_{i=1}^{16} x_i, \qquad
e = \frac{1}{16}\sum_{i=1}^{16} \left| x_i - \mu \right|, \qquad
y_i = \gamma_i \, \frac{x_i - \mu}{e} + \beta_i
$$

$\gamma_i$、$\beta_i$ 是每個 channel 自己的 weight 和 bias。Datapath 切成 pipeline，最後把 cycle time 壓到 4 ns 以內。

## Attention 怎麼切

一個 head 的 $Q$ 是 64 個 token × 8 個 channel，$K^\top$ 是 8 × 64。每次取 16 個 token 的 $Q$（16 × 8）乘上整個 $K^\top$，得到 16 × 64 的 attention score，64 個 token 分 4 次做完。SRAM C 分成 4 個 bank，一次可以讀出 4 組 8-channel 的資料。

## 共用 datapath

每個階段需要的運算量：

| 階段 | 乘法器 | 加法器與其他 |
| --- | --- | --- |
| Normalization | – | 16 個加法、16 個除法 |
| Q/K/V projection | 16 | 16 |
| Attention（$QK^\top$） | 8 | 8 |
| Softmax | – | 64 個加法，另外需要 exp 和除法 |
| 乘上 V | 4 | 4 |
| O projection | 16 | 16 |
| Residual | – | 16 |

每個階段都各做一組乘加器的話，大部分的時間這些硬體都閒著。所以我把乘加的 datapath 從各個 module 抽出來，放在 top module，每個階段都透過它來運算，同一組乘法器被所有階段共用，提高硬體的使用率。

還可以再進一步的兩個想法：

- 把 O projection 和 residual 合在同一個階段做。
- 把 softmax 和 $QK^\top$ 合在一起做。

Softmax 需要算 $e^x$，這時讀到的方法見 [[cordic_blog|CORDIC]]。每個 module 最後都通過了 [[ICLAB_spyglass_blog|SpyGlass]] 的檢查。
