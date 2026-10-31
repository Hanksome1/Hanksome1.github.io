---
title: 'SwiGLU 圖解'
summary: 用捲動看懂 SwiGLU（Ideogram 4 的 MLP 用的啟動函數）跟 ReLU、GELU 差在哪：多一條投影當閘門、hidden 縮成 8/3·d 讓參數不變，以及它在 FLOPs、記憶體搬運和訓練上的實際成本。
date: 2026-10-31
updated: 2026-10-31
layout: swiglu
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/；reading 是列表上顯示的閱讀分鐘數
kind: note
reading: 10
---
