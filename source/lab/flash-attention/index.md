---
title: 'FlashAttention 圖解'
summary: 用捲動看懂 FlashAttention 怎麼算：S 為什麼不能存下來、切成 tile 之後 softmax 怎麼跨 tile 算完、FlashAttention-2 對調迴圈換到什麼、反向傳播和 causal mask 怎麼接。
date: 2026-10-31
updated: 2026-10-31
layout: flash-attention
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/；reading 是列表上顯示的閱讀分鐘數
kind: note
reading: 12
---
