---
title: 'RoPE 與 MRoPE 圖解'
summary: 用捲動看懂 RoPE（Ideogram 4 每一層 attention 裡的位置編碼）：把 q、k 依位置轉一個角度，內積裡只剩相對距離；再看 MRoPE 怎麼把 128 對轉盤分給 t、h、w，讓圖片的上下、左右各量各的。
date: 2026-11-04
updated: 2026-11-04
layout: rope
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/；reading 是列表上顯示的閱讀分鐘數
kind: note
reading: 14
---
