---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 有限狀態機（FSM）的寫法
date: '2025-09-25'
updated: '2026-10-16 00:22:26'
tags:
  - ICLAB
  - Verilog
summary: 把 FSM 拆成 state register、next-state logic、output logic 三塊來寫；Mealy 與 Moore、one-hot 編碼，以及大型設計怎麼把一個大 FSM 拆成好幾個小的。
permalink: notes/iclab-fsm/
synced: obsidian
---

## 三個部分

- **State register**：用 flip-flop 存目前的狀態（循序邏輯）
- **Next-state logic**：由目前的狀態和輸入決定下一個狀態（組合邏輯）
- **Output logic**：由狀態（和輸入）決定輸出（組合邏輯）

寫成 code 就是 1 個 sequential always block 加上 2 個 combinational always block，狀態轉移用一個 `case` 描述。

## 寫法

1. 用 `localparam` 宣告狀態：localparam 不能從外面覆寫，狀態編碼不會被意外改掉。
2. 用組合邏輯描述所有的狀態轉移，一開始先給 next state 預設值，避免 latch。
3. 用循序邏輯更新狀態。

```verilog
localparam IDLE = 2'b00,
           LOAD = 2'b01,
           DONE = 2'b10;

reg [1:0] state, n_state;

// next-state logic
always @(*) begin
  n_state = state;          // 預設：停在原本的狀態
  case (state)
    IDLE:    if (load)  n_state = LOAD;
    LOAD:    if (!load) n_state = DONE;
    DONE:    if (load)  n_state = LOAD;
    default:            n_state = IDLE;
  endcase
end

// output logic（Moore：只看 state）
always @(*) begin
  busy = 1'b0;              // 預設值
  case (state)
    LOAD:    busy = 1'b1;
    default: busy = 1'b0;
  endcase
end

// state register
always @(posedge clk) begin
  if (!srst_n) state <= IDLE;
  else         state <= n_state;
end
```

## Mealy 與 Moore

- **Moore machine**：輸出只由目前的狀態決定。
- **Mealy machine**：輸出由目前的狀態和目前的輸入共同決定。反應比 Moore 早一個 cycle，但輸入上的 glitch 也會直接傳到輸出。

## One-hot 編碼

每個狀態用一個 bit 表示，例如 4 個狀態編成 `4'b0001`、`4'b0010`、`4'b0100`、`4'b1000`。

- 缺點：flip-flop 變多。$N$ 個狀態需要 $N$ 個 bit，binary 編碼只要 $\lceil \log_2 N \rceil$ 個。
- 優點：判斷目前在哪個狀態只要看一個 bit，next-state logic 和 output logic 都變得很簡單，可以直接用 bitwise 運算。

## 例子：紅綠燈

![[greenlight_fsm.svg|Lab04 的紅綠燈 FSM：每個燈號用計數器 cnt 決定要停留多久，數到上限就切到下一個燈號]]

## 大型設計：把 FSM 拆小

不要想用一個 FSM 處理所有事情。比較好的做法是一個 top FSM 負責大流程，每個子功能各自有自己的小 FSM。

很多狀態都要控制同一個訊號時（例如 SRAM 的讀取位址），讓每個子區塊各自算出自己要的值，再由 top FSM 依目前的狀態選一個：

```verilog
always @(*) begin
  sram_raddr = 0;                     // 預設值，避免 latch
  case (state)
    IDLE:    sram_raddr = idle_sram_raddr;
    FIND:    sram_raddr = find_sram_raddr;
    default: sram_raddr = 0;
  endcase
end
```

每個 FSM 一開始都要給它控制的所有訊號預設值，避免 latch。

Lab07 的 line-based 影像處理（從影像中解出藏起來的資料）就是兩層：上層只管「寫 SRAM、解碼」的大流程，解碼的細節交給下層 decoder 自己的 FSM。

![[ICLAB_lab7.svg|Lab07 的兩層 FSM：上層 Steganography.v 只有 IDLE、WRITE_SRAM、DECODE 三個狀態；進入 DECODE 後由 Decoder.v 的 FSM 一步步設定位址、讀資料、解碼]]

更大的例子是 [[ICLAB_HW4_blog|HW4 的 QR code 解碼器]]：一個主 FSM 加上兩個子 FSM。
