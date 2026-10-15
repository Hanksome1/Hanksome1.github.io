---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Testbench 的寫法
date: '2025-09-17'
updated: '2026-10-16 00:22:41'
tags:
  - ICLAB
  - Verilog
  - Verification
summary: 一個 testbench 的五個步驟：定義參數、接上待測電路、reset 與 clock、餵 pattern、比對答案；再加上檔案 I/O、從命令列切換測試，以及 VCS 和 Verdi 的指令。
permalink: notes/iclab-testbench/
synced: obsidian
---

RTL 描述的是硬體的架構，一定要有 clock；testbench 描述的是行為：給什麼輸入、預期什麼輸出，不用在意能不能合成。

驗證的基本精神是：**testbench 產生正確答案的方法，要跟 RTL 不一樣**。如果 testbench 用跟 RTL 一樣的邏輯算答案，錯誤只會被算兩次，根本驗證不到東西。電路複雜時，答案通常由另一個程式（Python、C）先算好存成 golden file，testbench 只負責讀進來比對。

> [!important] 在 negedge 餵資料
> 電路在 posedge 取樣輸入。如果 testbench 也在 posedge 改變輸入，同一個時間點「testbench 寫入」和「電路讀取」誰先發生取決於模擬器的排程，這就是 race condition。習慣上 testbench 在 `@(negedge clk)` 更新輸入、比對輸出，和電路的取樣點錯開半個週期。

## 一個 testbench 的五個步驟

0. 定義參數、dump 波形
1. 實例化待測電路（DUT）
2. Reset 與 clock
3. 餵 pattern
4. 比對答案

以下用一個 8-bit ALU 的 testbench 當例子。

### 0. 定義參數與 dump 波形

```verilog
parameter CYCLE = 10;    // 一個 clock 週期
parameter N     = 256;   // 每個輸入有 256 種值

// 也可以用 define
`define CYCLE     10
`define END_CYCLE 10000  // 模擬最多跑幾個 cycle

initial begin
  $fsdbDumpfile("lab2_alu.fsdb");   // 給 Verdi 看的波形檔
  $fsdbDumpvars;
end

// 超過時間還沒結束就強制停止，避免電路卡住時模擬永遠跑不完
initial begin
  #(`CYCLE * `END_CYCLE);
  $display("Timeout!");
  $finish;
end
```

### 1. 接上待測電路

```verilog
lab2_alu u_alu (
  .clk         (clk),
  .rst_n       (rst_n),
  .inputA      (inputA),
  .inputB      (inputB),
  .instruction (instruction),
  .alu_out     (alu_out)
);
```

### 2. Reset 與 clock

```verilog
initial begin : proc_system
  clk   = 1;
  rst_n = 1;
  #(CYCLE) rst_n = 0;   // system reset
  #(CYCLE) rst_n = 1;
end

always #(CYCLE/2) clk = ~clk;
```

### 3. 餵 pattern

Pattern 有兩種來源：用 for 迴圈直接產生，或從檔案讀進來再用 for 迴圈依序送出。這個例子窮舉 6 種指令和兩個 8-bit 輸入的所有組合：

```verilog
initial begin
  inputA = 0; inputB = 0; instruction = 0;
  wait (rst_n == 0);
  wait (rst_n == 1);
  for (k = 0; k < 6; k = k + 1)
    for (i = 0; i < N; i = i + 1)
      for (j = 0; j < N; j = j + 1) begin
        @(negedge clk);
        instruction = k;
        inputA      = i[7:0];
        inputB      = j[7:0];
      end
end
```

用 for 迴圈窮舉時，迴圈變數的位寬有個常見的陷阱，見 [[ICLAB_HW1_blog#陷阱：迴圈計數器的位寬|HW1]]。

### 4. 比對答案

這個 ALU 的 latency 是固定的，所以可以直接等兩個 cycle 之後開始比對。如果不知道電路要算幾個 cycle，就讓電路在算完時拉高一個 `out_valid`，testbench 等它變成 1 再比對。比對同樣在 negedge 做。

```verilog
reg [27:0] golden [0:6*N*N-1];

initial begin
  $readmemh("golden.dat", golden);
  wait (rst_n == 0);
  wait (rst_n == 1);
  #(CYCLE*2);
  for (l = 0; l < 6*N*N; l = l + 1) begin
    @(negedge clk);
    if (alu_out !== golden[l][7:0]) begin
      $display("Pattern %0d is wrong: A = %b, B = %b, inst = %b",
               l, golden[l][23:16], golden[l][15:8], golden[l][27:24]);
      $display("golden = %b, but your answer is %b", golden[l][7:0], alu_out);
      $finish;
    end
  end
  $display("Congratulations! All patterns passed.");
  #(CYCLE) $finish;
end
```

比對用的是 `!==`，輸出是 X 時才會被抓出來，原因見 [[ICLAB_verilog_operators_blog#Logical equality 與 case equality|運算子]]。

## 用 macro 從命令列切換測試

同一個 testbench 要測好幾種模式或好幾組 pattern 時，可以用 macro 控制，再從命令列決定要定義哪些：

```verilog
initial begin
`ifdef ENCRYPT
  crypt_mode = 1'b0;
`elsif DECRYPT
  crypt_mode = 1'b1;
`endif
end

localparam integer PATTERN_LEN = `PAT_LEN;
```

```bash
vcs -R +v2k -full64 -f rtl_sim.f +define+DECRYPT +define+PAT_LEN=111 -debug_access+all -l vcs_decrypt.log
```

| 參數 | 意思 |
| --- | --- |
| `-R` | 編譯完直接執行 |
| `+v2k` | 支援 Verilog-2001 |
| `-full64` | 64-bit 模式 |
| `-f rtl_sim.f` | 從檔案讀入要編譯的原始碼清單 |
| `+define+NAME=VALUE` | 定義 macro |
| `-debug_access+all` | 讓波形工具可以存取所有訊號 |
| `-l xxx.log` | 把輸出存成 log |

## 輸出與檔案 I/O

### `$display` 與 `$write`

用法跟 C 的 `printf` 很像，`$display` 會自動換行，`$write` 不會。`$time` 可以印出目前的模擬時間：

```verilog
$display("time = %0t, var = %b", $time, var2);
```

### 寫檔：`$fopen`

只給檔名時，`$fopen` 回傳的是 multichannel descriptor：每個檔案佔一個 bit（one-hot）。所以把兩個 descriptor OR 起來，就能一次寫進兩個檔案：

```verilog
integer f1, f2;
initial begin
  f1 = $fopen("a.log");
  f2 = $fopen("b.log");
  $fdisplay(f1 | f2, "written to both files");
end
```

### 讀檔：`$readmemh`、`$readmemb`

把文字檔讀進 memory 陣列，`h` 是十六進位、`b` 是二進位。檔案裡可以用 `@`（十六進位）指定位址，不用每個位址都寫：

```text
@100
1111_1110
@3FF
1110_1111
```

上面的第一筆資料會寫到位址 0x100（256），第二筆寫到 0x3FF。

```verilog
reg [5:0] rotorA_mem    [0:63];
reg [5:0] plaintext_mem [0:PATTERN_LEN-1];

initial begin
  $readmemh("rotor/rotorA.dat", rotorA_mem);
  $readmemh("pat/plaintext.dat", plaintext_mem);
end
```

### 結束模擬

- `$finish`：結束模擬。
- `$stop`：暫停模擬，可以在互動模式下檢查訊號，看完再繼續執行。

## 用 task 整理 testbench

Testbench 長了之後，可以把每個步驟包成 task，讓 initial block 只剩流程。task 怎麼存取 testbench 的變數、要注意什麼，見 [[ICLAB_Function_blog#Task|function 與 task]]。

## 看波形：Verdi

```bash
verdi -f rtl_sim.f -sv -ssf wave.fsdb &
```

`-f` 讀入原始碼清單，`-ssf` 載入 `$fsdbDumpfile` 產生的波形檔。
