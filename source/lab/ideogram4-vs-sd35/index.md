---
title: Ideogram 4 vs SD 3.5：一層一層看兩個模型怎麼算一張圖
summary: 同一句 prompt，交給 Stable Diffusion 3.5 Large 和 Ideogram 4，從讀文字、壓 latent、排序列、attention、block、取樣迴圈一路比到總計算量。往下捲，右邊兩個模型會同步走到同一層。
date: 2026-10-29
layout: dit-compare
explainer:
  order: 2
  meta: Side by side · 可以調參數
  metrics:
    - { label: Chapters, value: '9' }
    - { label: Controls, value: 解析度 · 步數 }
    - { label: Table, value: 13 列 }
  topics: [Text encoder, Attention, adaLN, FLOPs]
---
