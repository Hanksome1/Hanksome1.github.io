---
tags: [CDC]
aliases: [亞穩態]
summary: Flip-flop 在 setup / hold window 內取樣到變動中的訊號時，輸出會卡在中間電位一段不確定的時間。
---
<!-- 範例筆記 -->

當資料在 [[sta-setup-hold|setup / hold window]] 內變動，flip-flop 可能進入 metastable 狀態：輸出既不是 0 也不是 1，要經過一段**無法預測**的時間才會落到其中一邊。

> [!note] 重點
> Metastability 無法消除，只能把「它傳到後級電路」的機率降到可以接受。衡量指標是 [[MTBF]]。

常見對策就是 [[Two-Flop Synchronizer]]：多給訊號一個 cycle 去穩定。
