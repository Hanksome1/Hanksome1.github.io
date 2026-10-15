---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: RTL Coding Guidelines
date: '2025-10-02'
updated: '2026-10-16 00:22:41'
tags:
  - ICLAB
  - Verilog
summary: 寫給合成工具和隊友看的 RTL：命名規則、module 怎麼切、reset 的選擇、時脈與 clock gating、case 與 if-else，以及幾個不要用的語法。
permalink: notes/iclab-rtl-guideline/
synced: obsidian
---

## Top-down 與 bottom-up

- **Top-down**：先有市場需求和規格，再一路往下設計實作（market pull）。
- **Bottom-up**：先有很強的底層技術，再找應用推向市場（technology push）。

## 命名

- 名字要反映意義，後綴反映類別：`_n` 代表 active low（例如 `rst_n`）、`_i` 代表 input、`_reg` 代表 register 的輸出。
- 訊號用小寫，常數（`localparam`、`` `define ``）用大寫。
- 避免長得很像的字元：`1` 和 `l`、`0` 和 `O`。
- Port 的順序：clock → reset → enable → 控制訊號 → data 與 address。

## Module 怎麼切

- **合成工具的最佳化預設不會跨過 module 的邊界**。組合邏輯在哪裡被切開，就決定了工具能化簡的範圍，所以相關的組合邏輯要放在同一個 module 裡。
- **Module 的 output 盡量直接來自 flip-flop**。下一個 module 拿到的是乾淨、不帶組合邏輯延遲的訊號，跨 module 的 timing 也比較好估。
- 相關的邏輯放在同一個 always block，不相關的分開寫。

接 macro 時也是同樣的道理：在 macro 的 output 擋一級 flip-flop 就好，input、output 都擋的話 latency 會比較長。如果 macro 最後一級 flip-flop 後面還接著組合邏輯，下一個 macro 的輸入路徑就得把這段一起算進去，兩邊的時間都很難估。

## Reset

| | Synchronous reset | Asynchronous reset |
| --- | --- | --- |
| 寫法 | `always @(posedge clk)` | `always @(posedge clk or negedge rst_n)` |
| 優點 | 好合成，reset 和一般邏輯一樣處理 | 不需要 clock 在跑；不影響 data path 的 timing |
| 缺點 | 需要 clock 在跑；reset 邏輯會在 data path 上多一點 delay | reset 是一條特殊的 net，要像 clock 一樣處理；對 glitch 敏感，RTL 模擬無法涵蓋所有情況；需要 reset tree 讓所有 flip-flop 同時被 reset |

課堂上大部分的設計用同步 reset。非同步 reset 用在 clock 還沒建立、就需要讓系統進入已知狀態的時候，例如開機初始化。

不是每個 flip-flop 都需要 reset：控制電路（FSM、counter、valid 訊號）一定要 reset；只存 datapath 資料的 register 可以不接 reset，省下面積。

## 時脈

- **Hold time 比 setup time 更要緊**。Setup violation 大不了把時脈調慢；hold violation 跟時脈頻率無關，晶片做出來就是壞的。
- Setup time 在 max delay corner（最慢的條件）檢查，確保電路不會太慢；hold time 在 min delay corner（最快的條件）檢查，確保電路不會太快。
- 整個設計用同一個時脈的同一個邊緣觸發，保持同步。

### Clock gating

時脈網路每個週期都在翻轉，是功耗的大宗。Register 不需要更新的時候，可以把送給它的 clock 關掉：

```verilog
always @(posedge clk)
  if (en) reg_a[31:0] <= reg_in[31:0];
```

直覺的硬體是在 flip-flop 前面接一個 MUX，`en = 0` 時把自己的值接回去，但 clock 還是每個週期都在翻轉。合成工具開啟 clock gating 之後，會把這個 MUX 拿掉，改在 clock 的路徑上插一個 clock-gating cell，`en = 0` 時 flip-flop 根本收不到 clock；同一個 enable 控制的整組 register 可以共用同一個 gating cell。RTL 不用改寫，交給工具處理就好。實際省了多少，見 [[ICLAB_Synthesis_blog#Clock gating（Lab06）|Lab06 的數字]]，更多細節見 [[Clock Gating]]。

## 用 case，少用 if-else

`if / else if` 的鏈表達的是優先順序，條件之間可以重疊，合成出來是一串串接的 MUX；`case` 的各個分支通常是互斥的常數，工具可以做成平行的多工器。`case` 也比較好讀、好 trace。

## 不要用的語法

- **`casex`**：會把輸入的 X 也當成 don't care。模擬時，輸入是 X 卻可能被當成「符合」，bug 就被藏起來了。需要 don't care 時用 `casez`，只有 `?`（和 Z）是 don't care：

```verilog
casez (req)
  4'b1???: grant = 4'b1000;
  4'b01??: grant = 4'b0100;
  4'b001?: grant = 4'b0010;
  4'b0001: grant = 4'b0001;
  default: grant = 4'b0000;
endcase
```

- **`full_case`、`parallel_case`**：這些寫給合成工具的指示會讓合成結果和 RTL 模擬不一致。`full_case` 想解決的問題用 `default` 就好；`parallel_case` 告訴工具各分支互斥、可以平行比較，但如果實際上有重疊，合成出來的電路就和模擬的行為不同。
- **條件編譯**（`` `ifdef ``、`` `ifndef ``）：同一份 code 在不同設定下會變成不同的電路。
- **`#delay`**：不會被合成，見 [[ICLAB_Synchronization_blog|時序控制]]。
- **把 attribute 寫進 RTL**：要給工具的指示放在合成 script 裡，不要汙染 RTL。

## 可攜性

- 常數用 `parameter` / `localparam` 定義，模組才能重複使用。
- 用一個共用的設定檔管理所有常數，確保每個檔案用的值一致，見 [[ICLAB_Function_blog#編譯指令|編譯指令]]。

## Latch

Design Compiler 合成出 latch 只會給 warning，不會報錯，要記得在 log 裡確認沒有 latch。怎麼避免，見 [[ICLAB_Assignment_blog#避免 latch：先給預設值|先給預設值]]。
