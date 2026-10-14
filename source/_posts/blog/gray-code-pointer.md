---
title: 為什麼 Async FIFO 的指標要用 Gray Code？
date: 2026-03-08 21:30:00
summary: 二進位計數器一次可能翻轉好幾個 bit，跨時脈域取樣時就會讀到根本不存在的值。Gray code 讓每次只變一個 bit，把錯誤限制在「舊值或新值」。
tags: [CDC, Verilog, Notes]
---

<!-- 範例文章：示範這個主題支援的排版元件（程式碼、WaveDrom 時序圖、表格、提示框），可以保留或刪除。 -->

做非同步 FIFO 時，第一個會遇到的問題是：寫指標在 `wclk` 域更新，但讀端要在 `rclk` 域判斷 FIFO 是否為空。指標必須跨時脈域傳過去——而這正是麻煩的開始（CDC 的整體觀念整理在 [[Clock Domain Crossing]]）。

## 問題：多個 bit 同時翻轉

假設寫指標從 `0111` 變成 `1000`，四個 bit 同時改變。由於每個 bit 的走線延遲不同，讀端取樣的那一瞬間，可能看到任何組合：

{% wavedrom 二進位指標從 7 跳到 8 時，接收端可能在過渡期間取樣到錯誤的值 %}
{ signal: [
  { name: 'wclk',      wave: 'p.....' },
  { name: 'wptr_bin',  wave: '=.=...', data: ['0111', '1000'] },
  { name: 'rclk',      wave: '0.1.0.', phase: 0.3 },
  { name: 'sampled',   wave: 'x.=.=.', data: ['1101 ?!', '1000'] }
]}
{% endwavedrom %}

同步器（兩級 flip-flop）只能保證**每一個 bit** 最後會穩定，但不能保證多個 bit 之間的一致性。讀到 `1101` 這種從來沒出現過的值，FIFO 的空/滿判斷就會出錯。

## 解法：Gray code

Gray code 相鄰的兩個值只差一個 bit：

| Decimal | Binary | Gray |
| --- | --- | --- |
| 6 | `0110` | `0101` |
| 7 | `0111` | `0100` |
| 8 | `1000` | `1100` |
| 9 | `1001` | `1101` |

每次只有一個 bit 在變，所以就算取樣在過渡期間，結果也只會是「舊值」或「新值」其中之一。讀到舊值只是讓 FIFO 保守地以為還是空的，不會造成資料錯誤。

### 轉換電路

```verilog
// binary -> gray：右移一位再 XOR
assign wptr_gray = (wptr_bin >> 1) ^ wptr_bin;

// gray -> binary：從 MSB 開始累積 XOR
always @(*) begin
  rptr_bin[N-1] = rptr_gray[N-1];
  for (int i = N-2; i >= 0; i--)
    rptr_bin[i] = rptr_bin[i+1] ^ rptr_gray[i];
end
```

{% note warn 常見錯誤 %}
Gray code 指標一定要先在**來源時脈域打一級暫存器**再送去同步。如果直接把組合邏輯的輸出拿去同步，glitch 會讓「只變一個 bit」的保證失效。
{% endnote %}

## 空與滿的判斷

指標會多用一個 bit（深度 16 用 5-bit 指標）來分辨「繞了一圈」：

- **Empty**：讀端同步過來的寫指標 == 讀指標
- **Full**：寫端同步過來的讀指標，最高兩個 bit 相反、其餘相同

> 一句話總結：Gray code 不是讓 CDC 變「正確」，而是讓錯誤變得**無害**。

## 延伸閱讀

- Clifford E. Cummings, *Simulation and Synthesis Techniques for Asynchronous FIFO Design*, SNUG 2002
