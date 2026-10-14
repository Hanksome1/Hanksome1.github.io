---
tags: [Accelerator]
summary: 資料像心跳一樣在 PE 之間規律流動的陣列架構，適合矩陣乘法與卷積。
---
<!-- 範例筆記 -->

每個 PE 只和鄰居溝通，資料每個 cycle 往下一個 PE 傳。好處是**佈線短、容易拉高頻率**。

依照哪一種資料留在 PE 裡，可以分成不同的 [[Dataflow Taxonomy|dataflow]]：

- Weight stationary
- Output stationary
- Row stationary（Eyeriss）
