---
title: STA 筆記：一次搞懂 Setup 與 Hold
date: 2026-05-02 16:00:00
summary: Setup 看的是「下一個」時脈邊緣、Hold 看的是「同一個」時脈邊緣。把這句話想通，timing report 就不再可怕。
tags: [STA, Notes]
---

<!-- 範例文章，可以保留或刪除。 -->

第一次打開 timing report 時，滿滿的 arrival time、required time 看得頭很痛。後來發現只要抓住一個觀念就好：

> **Setup** 檢查資料有沒有及時趕上**下一個**時脈邊緣；**Hold** 檢查資料有沒有太快、蓋掉**同一個**邊緣正要被抓的值。

## Setup slack

```text
setup slack = (T_clk + t_skew − t_setup) − (t_clk→q + t_logic)
              └──── required time ────┘   └─ arrival time ─┘
```

slack 為負，代表組合邏輯太長。常見解法：

1. 切 pipeline，把長路徑分成兩段
2. 換用更快的 cell（upsizing、低 Vt）
3. 重新安排邏輯，讓晚到的訊號走比較短的路徑

## Hold slack

Hold 與時脈週期**無關**，所以降頻救不了 hold violation。通常是在路徑上插 buffer 增加延遲。

| | Setup | Hold |
| --- | --- | --- |
| 跟時脈週期有關？ | 是 | 否 |
| 降頻能修？ | 能 | 不能 |
| 常見修法 | 切 pipeline / upsizing | 插 delay buffer |
| 最差 corner | Slow (SS) | Fast (FF) |
