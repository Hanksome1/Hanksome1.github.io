---
title: Diffusion 相關論文閱讀
summary: 先看一個 text-to-image 模型一步怎麼算，再看 attention 怎麼算得快，最後看模型怎麼壓到 4 bit。四章都是可以捲動的動畫，照順序讀。
date: 2026-10-31
updated: 2026-10-31
layout: paper-course
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/；reading 是列表上顯示的閱讀分鐘數
kind: note
reading: 44
# 章節的順序就是閱讀順序。每章的分鐘數取自該頁的 reading，章節頁的上一章、下一章也從這裡算。
# also 是同一章的另一個版本，不算進章數和分鐘數
chapters:
  - n: '01'
    url: /lab/ideogram4-vs-sd35-tower/
    group: 模型
    paper: Ideogram 4 vs SD 3.5
    sub: 同一句 prompt 交給兩個模型，走過 text encoder、latent、每一層 transformer block 和取樣迴圈，最後比總計算量。後面三章都會回來用這一章的架構。
    source: 開源實作 ideogram4 · sd3.5
    also: { url: /lab/ideogram4-vs-sd35/, label: 並排版，可以自己調解析度和步數 }
  - n: '02'
    url: /lab/flash-attention/
    group: Attention
    paper: FlashAttention
    sub: 把 N×N 的 S 切成 tile，留在晶片上算完就丟，不再來回搬 HBM。FlashAttention 不是 diffusion 論文，放在這裡是因為 DiT 每一步都要跑 attention，而配對數是 token 數的平方。
    source: arXiv 2205.14135 · 2307.08691
  - n: '03'
    url: /lab/svdquant/
    group: 量化
    paper: SVDQuant
    sub: 權重和 activation 都只剩 4 bit 時，smoothing 只是把 outlier 搬家。SVD 切出一條 16-bit 的低秩分支把它們吸走，剩下的殘差才量化，實驗跑在 FLUX.1。
    source: arXiv 2411.05007 · ICLR 2025
  - n: '04'
    url: /lab/kroquant/
    group: 量化
    paper: KroQuant
    sub: 量化前插一個 32×32 的 block 轉換，每一塊只用 15 個參數，跑起來跟 SmoothQuant 差不多快。它拿 Smooth + SVDQuant 當 baseline，所以排在第 3 章後面。
    source: arXiv 2607.21446
---
這是一條讀 diffusion model 論文的路線：先看一個 text-to-image 模型一步怎麼算，再看 attention 怎麼算得快，最後看模型怎麼壓到 4 bit。四章都是可以捲動的動畫，照順序讀就好。
