---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Verilog function、task 與編譯指令
date: '2025-09-18'
updated: '2026-10-16 00:22:26'
tags:
  - ICLAB
  - Verilog
summary: function 和 task 的差別與用法，以及 `define、`include、`ifdef 這些編譯指令為什麼要少用。
permalink: notes/iclab-verilog-function-task/
synced: obsidian
---

## Function

- 只能回傳一個值，裡面不能有任何時間控制（`@`、`#`、`wait`）。
- RTL 裡盡量不用 function：同樣的邏輯寫成 module 比較清楚，也比較好重複使用。
- 最適合拿來算常數，例如由 memory 的深度算出位址需要幾個 bit：

```verilog
function integer clog2;
  input integer value;
  begin
    value = value - 1;
    for (clog2 = 0; value > 0; clog2 = clog2 + 1)
      value = value >> 1;
  end
endfunction

localparam ADDR_W = clog2(DEPTH);
```

## Task

Task 的寫法跟 module 很像，可以有多個 input、output，也可以有時間控制：

```verilog
task zcount;          // 數一個 byte 裡有幾個 0
  input  [7:0] in_bus;
  output [3:0] count;
  integer i;
  begin
    count = 0;
    for (i = 0; i < 8; i = i + 1)
      if (in_bus[i] == 1'b0) count = count + 1;
  end
endtask
```

Task 在 testbench 裡非常好用，可以把 initial block 的步驟分組：

```verilog
initial begin
  init_task;
  test_task;
  ends_task;
end
```

### 傳值方式

- Task 和 function 的參數都是 pass by value：input 在呼叫的那一刻被複製進去，output 在 task 結束時才複製出來。task 執行期間外面的訊號怎麼變，task 裡面都看不到。
- 所以 testbench 裡的 task 通常不傳 input，而是直接讀寫 testbench 裡的變數。task 定義在 module 裡，本來就看得到 module 內所有的變數。
- 也可以用階層名稱 `module_name.variable` 存取其他 module 的訊號：

```verilog
task cpu_driver;
  begin
    busif_tb.data_valid = 1'b0;
  end
endtask
```

### 同一個 task 不要同時被呼叫

Verilog-2001 的 task 預設是 static 的：所有呼叫共用同一份參數和區域變數。如果兩個 initial block 同時呼叫同一個 task，它們會互相蓋掉對方的變數。真的需要同時呼叫時，要宣告成 `task automatic`。

## 編譯指令

### `define

```verilog
`define WIDTH 7
```

`define 是全域的：定義之後，之後編譯的每一個檔案都看得到。不同檔案用了同名的 macro 就會互相影響，結果還跟檔案的編譯順序有關。**能用 parameter / localparam 的地方就不要用 define。**

### `include

把另一個檔案的文字原封不動地貼進來。常見的用法是把全域的常數集中在一個設定檔，裡面用 `localparam` 宣告，再讓每個 module 自己 include：

```verilog
// global.vh
localparam DATA_W = 16;
localparam ADDR_W = 10;

// 每個需要的 module 裡
`include "global.vh"
```

這樣常數只有一份，又不會變成全域的 macro。

### `ifdef

條件編譯會讓同一份 code 在不同設定下變成不同的電路，review 和驗證時很容易漏掉其中一個版本，RTL 裡盡量不要用。在 testbench 裡拿來切換測試模式倒是很方便，例子見 [[ICLAB_Testbench_blog#用 macro 從命令列切換測試|Testbench]]。
