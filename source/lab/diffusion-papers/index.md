---
title: Diffusion 相關論文閱讀
summary: text-to-image 模型背後的論文：text encoder 怎麼讀 prompt、guidance 為什麼每步要算兩次、attention 怎麼知道位置、怎麼算得快，MLP 為什麼換成 SwiGLU，怎麼用 LoRA 微調，模型怎麼壓到 4 bit。每一篇都是可以捲動的動畫。
date: 2026-10-31
updated: 2026-11-05
layout: post
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/
kind: note
# 每一篇一項，依 date（論文第一次公開的年月）由新到舊排，這裡的順序不重要。
# 每一頁頁首的論文清單、頁尾的「較新／較舊」和 /notes/ 的課程卡片都從這裡算；內文的清單要跟著加一行。
# also 是同一篇的另一個版本，不算進篇數和分鐘數
papers:
  - { date: '2026-07', url: /lab/kroquant/, paper: KroQuant }
  - date: '2026-06'
    url: /lab/ideogram4-vs-sd35-tower/
    paper: Ideogram 4 vs SD 3.5
    also: { url: /lab/ideogram4-vs-sd35/, label: 並排版，可以自己調解析度和步數 }
  - { date: '2025-11', url: /lab/ideogram4-qwen-vlm/, paper: Qwen3-VL }
  - { date: '2024-11', url: /lab/svdquant/, paper: SVDQuant }
  - { date: '2022-07', url: /lab/cfg/, paper: Classifier-Free Guidance }
  - { date: '2022-05', url: /lab/flash-attention/, paper: FlashAttention }
  - { date: '2021-06', url: /lab/lora/, paper: LoRA }
  - { date: '2021-04', url: /lab/rope/, paper: RoPE → MRoPE }
  - { date: '2020-02', url: /lab/swiglu/, paper: SwiGLU }
---

論文之間沒有固定的閱讀順序，這裡依發表時間由新到舊排，挑有興趣的看就好。想先看整個模型長什麼樣子，可以從 Ideogram 4 vs SD 3.5 開始，其他幾篇講到的架構都在那一頁。

## 論文

- [[kroquant|KroQuant]]（2026.07）：量化前插一個 32×32 的 block 轉換，每一塊只用 15 個參數，baseline 是 SVDQuant。
- [[ideogram4-vs-sd35-tower|Ideogram 4 vs SD 3.5]]（2026.06）：同一句 prompt 交給兩個模型，一層一層比到總計算量。另有[[ideogram4-vs-sd35|並排版]]，可以自己調解析度和步數。
- [[ideogram4-qwen-vlm|Qwen3-VL]]（2025.11）：Ideogram 4 的 text encoder，36 層怎麼把 prompt 讀成特徵，跟 DiT 哪裡一樣。
- [[svdquant|SVDQuant]]（2024.11）：用一條 16-bit 的低秩分支吸走 outlier，剩下的殘差才壓到 4 bit。
- [[cfg|Classifier-Free Guidance]]（2022.07）：取樣時每一步為什麼要跑兩次 forward。
- [[flash-attention|FlashAttention]]（2022.05）：把 attention 切成 tile 留在晶片上算完，不再來回搬 HBM。
- [[lora|LoRA]]（2021.06）：凍結原本的權重，只訓練兩個瘦矩陣 B、A，部署時再合併回去。
- [[rope|RoPE → MRoPE]]（2021.04）：q、k 依位置轉一個角度，attention 就看得到相對距離；MRoPE 再分給 t、h、w 三個軸。
- [[lab/swiglu/index|SwiGLU]]（2020.02）：MLP 多一條投影當閘門，hidden 縮成 8/3·d，參數和 FLOPs 都不變。
