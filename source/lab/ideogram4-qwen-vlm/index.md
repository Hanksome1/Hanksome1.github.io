---
title: 'Ideogram 4 的 VLM：Qwen3-VL 一層一層算什麼'
summary: 把 Ideogram 4 的文字 encoder（凍結的 Qwen3-VL-8B）畫成一座 36 層的塔，往下捲看 prompt 怎麼變成 token、每一層做哪些運算、哪 13 層被抽出來交給 DiT；最後把它跟 Ideogram 4 的 DiT 並排，看兩邊哪裡一樣、哪裡不一樣。
date: 2026-11-04
updated: 2026-11-04
layout: ideogram4-qwen-vlm
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/；reading 是列表上顯示的閱讀分鐘數
kind: note
reading: 10
---
