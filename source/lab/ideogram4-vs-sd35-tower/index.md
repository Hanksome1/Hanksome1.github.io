---
title: Ideogram 4 vs SD 3.5：兩座塔
summary: 把兩個模型畫成兩座並排的塔，每一層 transformer block 是一塊板子。往下捲，鏡頭從塔頂的 prompt 一路往下走，在每個停靠站停下來，看兩邊在這裡怎麼算。
date: 2026-10-29
layout: dit-tower
# 出現在 /notes/ 的 Interactive 區塊（themes/tapeout/layout/notes.ejs），order 小的排前面
explainer:
  order: 1
  meta: Scroll · 鏡頭從塔頂走到塔底
  metrics:
    - { label: Stops, value: '10' }
    - { label: Layers, value: 38 / 34 }
    - { label: PFLOPs, value: 2.37 / 3.40 }
  topics: [Diffusion Transformer, MMDiT, Flow matching, CFG]
---
