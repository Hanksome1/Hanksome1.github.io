---
tags: [CDC, Verilog]
aliases: [2FF synchronizer, 雙級同步器]
summary: 最基本的單一 bit 同步器：串接兩個 flip-flop，讓第一級的 metastability 有一整個 cycle 可以平息。
---
<!-- 範例筆記 -->

![[two-flop-sync.svg|雙級同步器：第一級可能 metastable，第二級輸出給後面的邏輯]]

```verilog
module sync_2ff (
  input  wire clk_dst, rst_n,
  input  wire d_async,
  output reg  q_sync
);
  reg meta;
  always @(posedge clk_dst or negedge rst_n)
    if (!rst_n) {q_sync, meta} <= 2'b00;
    else        {q_sync, meta} <= {meta, d_async};
endmodule
```

- 第一級可能 [[Metastability|metastable]]，第二級幾乎一定穩定
- 只適用於**單一 bit**、而且變化夠慢的訊號
- 時脈很快或要求更高的 [[MTBF]] 時，可以改用三級

待辦：

- [x] 加上 `ASYNC_REG` 屬性，讓工具把兩級放在一起
- [ ] 研究 pulse synchronizer

延伸閱讀：[[Clock Domain Crossing#多個 bit]]
