---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: ICLAB HW4：QR code 解碼器的 FSM 拆法
date: '2025-10-24'
updated: '2026-10-16 00:26:08'
tags:
  - ICLAB
  - Verilog
summary: HW4 要從存在 SRAM 裡的影像找出 QR code 並解碼。這篇記錄我怎麼把它拆成一個主 FSM 加上兩個子 FSM，以及掃描時怎麼重複利用已經讀進來的 SRAM 區塊。
permalink: notes/iclab-hw4-qrcode/
synced: obsidian
---

HW4 的輸入是一張存在 SRAM 裡的影像，電路要找出其中的 QR code、判斷它的方向，再解出裡面的資料。

## 主 FSM

| 狀態 | 做什麼 | 下一步 |
| --- | --- | --- |
| IDLE | 等待 `start` | → FIND |
| FIND | 掃描影像，尋找 finder pattern（QR code 角落的回字形） | 找到候選位置 → ROTATE；沒找到就繼續掃下一個區塊 |
| ROTATE | 檢查候選位置的右方和下方是否也有 finder pattern，確認 QR code 的位置和方向 | 確認 → LOAD；右方、下方都沒有（誤判） → 回到 FIND |
| LOAD | 依照旋轉後的座標讀入整個 QR code | → DEMASK |
| DEMASK | 去掉 QR code 的 mask pattern | → DECODE |
| DECODE | 解出資料 | → IDLE |

Finder pattern 的正中間是一塊 3×3 的黑色方塊，FIND 只要掃描這塊黑色方塊就能找到候選位置。

## 子 FSM：FIND 怎麼讀 SRAM

影像是一塊一塊存在 SRAM 裡的，判斷一個位置需要的範圍會橫跨 2×2 個 SRAM block。如果每移動一次就把 4 個 block 全部重新讀一次，大部分的時間都花在等 SRAM。

所以 FIND 底下有自己的小 FSM（IDLE → FETCH → CHECK / UPDATE），並且維護目前左上角 block 的座標：往旁邊移動時，有兩個 block 和上一次重疊，只要再讀 2 個新的 block 就好。4 個 block 都到齊了才開始檢查。

## 子 FSM：ROTATE

ROTATE 也有一個小 FSM（IDLE → FETCH → CHECK → ROTATE）：讀入候選位置周圍的資料、檢查 finder pattern 的位置；沒有符合的 pattern 就回到 IDLE，交還給主 FSM 繼續掃描。

## 學到的事

- 主 FSM 只管流程，讀 SRAM 這種細節交給子 FSM。主 FSM 的狀態很少，每個子 FSM 也都很小，debug 時一次只要看一個。
- 很多個狀態都要控制 SRAM 位址時，每個子區塊各自算出自己的位址，再由主 FSM 依狀態選一個，寫法見 [[ICLAB_Finite_State_Machine_blog#大型設計：把 FSM 拆小|FSM 的寫法]]。
- SRAM 的讀取有 latency，掃描時重複利用已經讀進來的資料，能省下很多 cycle。
