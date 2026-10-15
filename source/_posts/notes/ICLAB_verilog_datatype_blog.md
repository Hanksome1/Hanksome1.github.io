---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Verilog 資料型態與參數
date: '2025-09-11'
updated: '2026-10-16 00:21:16'
tags:
  - ICLAB
  - Verilog
summary: Verilog 的四種值、net 與 variable 的差別、vector 與 array 的宣告，以及用 parameter 讓模組可以重複使用。
permalink: notes/iclab-verilog-datatype/
synced: obsidian
---

## 四種值

| 值 | 意義 |
| --- | --- |
| `0` | 邏輯 0 |
| `1` | 邏輯 1 |
| `Z` | 高阻抗：沒有被驅動、tri-state |
| `X` | 未知：還沒初始化，或同時被驅動成 0 和 1 |

## Net、variable 與 parameter

- **Net**：代表元件之間實體的連線，例如 `wire`。由 continuous assignment（`assign`）或 module 的 output 驅動。
- **Variable**：代表抽象的儲存單元，只能在 procedural block（`always`、`initial`）裡賦值。
  - `reg`：名字叫 reg，但不一定會變成 flip-flop。寫在 `always @(*)` 裡的 `reg` 合成出來就是組合邏輯。
  - `integer`：其實是 32-bit 的 signed `reg`，通常只拿來當 for 迴圈的計數器。
- **Parameter**：elaboration 時就決定的常數，有 `parameter` 和 `localparam` 兩種，後面會講。

> [!info] 每個訊號都要宣告
> 沒宣告就使用的名字會被自動當成 1-bit 的 `wire`（implicit net），打錯字也不會報錯。所以每個訊號都明確宣告，連 port 也寫清楚型態：
> ```verilog
> input wire a
> ```

## Vector

```verilog
wire [3:0]        a, b;    // 4-bit，預設是 unsigned
wire [`WIDTH-1:0] data;    // 寬度用常數決定
```

### 常數的寫法

格式是 `<位寬>'<進位><數值>`：

```verilog
zbus = 4'b1001;
zbus = 4'd14;
zbus = 8'h2f;   // 位寬要放得下：寫成 4'h2f 會被截成 4'hf
```

### 串接與重複

```verilog
widebus = {2'b00, zbus};   // 在 MSB 補兩個 0
ones    = {N{1'b1}};       // 1'b1 重複 N 次
```

Verilog 不能用 `'1` 表示「任意長度的全 1」，那是 SystemVerilog 的語法，要寫成 `{N{1'b1}}`。

### 取 bit 與取一段

```verilog
select = vect[index];       // 取一個 bit；index 是變數時，合成出來就是一個 multiplexer
slice  = vect[index -: 2];  // 從 index 往下取 2 個 bit：vect[index], vect[index-1]
slice  = vect[index +: 2];  // 從 index 往上取 2 個 bit：vect[index+1], vect[index]
```

`-:`、`+:` 的寬度必須是常數，起點可以是變數，所以 `vect[index -: 2]` 其實就是一個輸出 2 bit 的 multiplexer。

## Array

```verilog
integer   int_a [0:99];        // 100 個 integer
reg [7:0] reg_a [0:99];        // 100 個 8-bit 的 vector，也就是一塊 memory
reg       reg_b [0:99][7:0];   // 二維陣列
```

## Parameter 與 localparam

同一個乘法器可能要用在不同位寬的地方。把位寬寫成 parameter，實例化時再決定，就能用同一份 code 在計算精度和面積之間取捨。所以常數一律用 parameter 宣告，不要直接寫死數字。

```verilog
module us_mult (a, b, product);
  parameter  WIDTH_A  = 5;
  parameter  WIDTH_B  = 6;
  localparam OP_WIDTH = WIDTH_A + WIDTH_B;

  input  [WIDTH_A-1:0]  a;
  input  [WIDTH_B-1:0]  b;
  output [OP_WIDTH-1:0] product;

  assign product = a * b;
endmodule

// 實例化時用 #(...) 覆寫 parameter
us_mult #(.WIDTH_A(8), .WIDTH_B(8)) u_mult (.a(x), .b(y), .product(p));
```

- `parameter`：實例化時可以從外面覆寫。
- `localparam`：外面改不到。適合放不希望被改動的常數，例如 FSM 的狀態編碼、由其他參數算出來的寬度。

大一點的模組常常有好幾個參數：

```verilog
module design #(
  parameter BUS_WIDTH  = 32,
  parameter DATA_WIDTH = 64,
  parameter FIFO_DEPTH = 512
) (
  input clk,
  input rst_n
  // ...
);
endmodule

design #(.BUS_WIDTH(32), .DATA_WIDTH(64)) u_design (
  .clk   (clk),
  .rst_n (rst_n)
  // ...
);
```

跨檔案共用的常數怎麼管理，見 [[ICLAB_Function_blog#編譯指令|編譯指令]]。運算子的部分在 [[ICLAB_verilog_operators_blog|Verilog 運算子]]。
