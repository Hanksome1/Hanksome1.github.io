---
tags: [Computer Architecture]
aliases: [hazard]
summary: 管線處理器的三種 hazard 與硬體上的解法。
---
<!-- 範例筆記 -->

| 類型 | 原因 | 解法 |
| --- | --- | --- |
| Structural | 硬體資源衝突 | 複製資源 / stall |
| Data | 指令相依（RAW） | [[Forwarding]]、load-use stall |
| Control | 分支結果未知 | [[Branch Prediction]]、flush |

> [!tip]- Load-use 為什麼一定要 stall？
> Load 的資料要到 MEM 階段結束才拿得到，這時下一道指令的 EX 已經開始，forwarding 也來不及。
