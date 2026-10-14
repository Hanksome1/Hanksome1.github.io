---
tags: [CDC, Digital Design]
aliases: [CDC, 跨時脈域]
summary: 訊號從一個時脈域傳到另一個時脈域時會遇到的問題，以及常見解法的總覽。
---
<!-- 範例筆記：示範 Obsidian 語法，可以刪除或改寫。 -->

當訊號的產生端與接收端使用**不同、彼此不同步**的時脈，就是 clock domain crossing。最根本的風險是 [[Metastability]]。

## 單一 bit

用 [[Two-Flop Synchronizer]] 就夠了，前提是訊號維持得夠久，讓接收端一定取樣得到。

## 多個 bit

不能每個 bit 各自同步 —— 它們可能在不同的 cycle 被取樣到。常見作法：

- 計數器 / 指標：改用 [[Gray Code]]，實例見 [[Async FIFO]]
- 一般資料：用 handshake 或 [[MUX Recirculation]]
- 大量資料：直接用非同步 FIFO

> [!warning] 別忘了 reset
> Reset 的釋放（deassertion）也是一種 CDC，需要 [[Reset Synchronizer]]。

#CDC 的檢查通常交給 lint 工具，但==觀念要先懂==，才看得懂報告。
