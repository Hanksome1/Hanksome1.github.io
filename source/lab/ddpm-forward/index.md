---
title: 'DDPM 前向過程：一步一步併成一步'
summary: 從 DDPM 每一步加的雜訊 q(x_t|x_{t−1}) 一式一式推到閉式解 q(x_t|x_0)：為什麼每步要先縮一點、兩步怎麼併成一步，再代入線性排程（β 從 10⁻⁴ 到 0.02、T = 1000），用 4000 條一步一步走的路徑對照閉式解。
date: 2026-11-25
updated: 2026-11-25
layout: ddpm-forward
# kind: note 讓這一頁跟 source/_posts/notes/ 的筆記一起列在 /notes/；reading 是列表上顯示的閱讀分鐘數
kind: note
reading: 12
---
