---
title: 'LoRA 圖解'
summary: 用捲動看懂 LoRA（Low-Rank Adaptation）：為什麼全量微調要存好幾份權重，更新量 ΔW 低秩是什麼意思，怎麼拆成兩個瘦矩陣 B、A，前向傳播怎麼多接一條旁路，省下多少可訓練參數，以及部署時怎麼合併或熱插拔。
date: 2026-11-04
updated: 2026-11-04
layout: lora
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/；reading 是列表上顯示的閱讀分鐘數
kind: note
reading: 9
---
