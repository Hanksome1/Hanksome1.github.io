---
title: 'Classifier-Free Guidance 圖解'
summary: 用捲動看懂 classifier-free guidance：條件模型為什麼不夠聽話、classifier guidance 怎麼推、訓練時丟掉 prompt、ε_∅ + w(ε_c − ε_∅) 在做什麼、w 拉大之後換到什麼又失去什麼、兩次 forward 的代價和修過頭的方法。
date: 2026-10-31
updated: 2026-10-31
layout: cfg
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/；reading 是列表上顯示的閱讀分鐘數
kind: note
reading: 10
---
