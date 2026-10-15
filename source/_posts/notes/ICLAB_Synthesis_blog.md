---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 邏輯合成與 coding for synthesis
date: '2025-09-25'
updated: '2026-10-16 00:24:06'
tags:
  - ICLAB
  - Verilog
  - Synthesis
summary: 合成工具在做什麼、什麼樣的 RTL 會合成出什麼樣的電路，以及 clock gating、pipeline 和資源共用在 lab 裡實際換到的面積與時間。
permalink: notes/iclab-synthesis/
synced: obsidian
---

## 合成在做什麼

- 輸入：RTL、design constraint（時脈、輸入輸出延遲…）、technology library（製程提供的 standard cell）
- 輸出：gate-level netlist

```bash
dc_shell -f synthesis.tcl | tee synthesis.log
```

過程大致是：RTL → boolean network（和製程無關的邏輯）→ technology mapping（從 library 挑剛好合適的 cell）→ gate-level netlist。Design Compiler 的實際操作與 report 怎麼看，見 [[ICLAB_design_compiler_blog|Design Compiler 使用筆記]]。

### FPGA 與 ASIC

- **FPGA**：電路由一大堆 lookup table 和可程式化的繞線組成，不是 standard cell。
- **ASIC**：由 standard cell 兜出來的電路。

### 合成工具擅長與不擅長的事

擅長：同步設計的邏輯化簡、datapath 的最佳化。

不擅長，要交給其他工具或手動處理：

- Clock tree：交給 APR 的 CTS
- 複雜的 clocking scheme
- Memory、I/O pad

DC 對自己的 DesignWare 元件很熟，可以用 retiming 自動把 datapath 切到需要的地方。代價是 netlist 裡 flip-flop 的位置跟 RTL 對不上，驗證和 debug 都比較麻煩，所以課堂上的建議是 pipeline 盡量自己在 RTL 裡切好。

## Coding for synthesis

### Sensitivity list 要完整

```verilog
always @(a or b) begin   // 少了 sel
  y = a;
  if (sel) y = b;
end
```

模擬時 `sel` 改變不會觸發這個 block，但合成工具照樣把它當成組合邏輯，模擬和合成的結果就不一致了。組合邏輯一律寫 `always @(*)`。

### 先給預設值

```verilog
always @(*) begin
  y = 1'b0;          // 所有輸出先給預設值
  case (b)
    1'b1: y = a;
  endcase
end
```

沒有預設值就會合成出 latch，原因見 [[ICLAB_Assignment_blog#避免 latch：先給預設值|賦值]]。`assign` 則永遠不會產生 latch。

### 循序邏輯與 reset

控制電路的 flip-flop 一定要有 reset；只有存 datapath 資料的 register 可以不 reset，省面積。

```verilog
// asynchronous reset
always @(posedge clk or negedge rst_n)
  if (!rst_n) cnt <= 0;
  else        cnt <= cnt + 1;

// synchronous reset
always @(posedge clk)
  if (!rst_n) cnt <= 0;
  else        cnt <= cnt + 1;
```

兩種 reset 的取捨見 [[ICLAB_RTL_guideline_blog#Reset|RTL coding guidelines]]。

### 不要用合成指示

`full_case`、`parallel_case` 這類寫在 RTL 裡的指示會讓模擬和合成結果不一致。真的要給工具指示，就放在合成的 script 裡，不要汙染 RTL。

### 常數位移寫成 concatenation

常數位移在硬體上只是重新接線，例如 `a << 2` 等於 `{a, 2'b0}`。習慣上直接寫成 concatenation，意圖比較清楚；真正要小心的是位移量是變數的時候，那會合成出一整個 barrel shifter。

## Pipeline

![[ICLAB_DesignNote.svg|上：兩級 flip-flop 之間的組合邏輯延遲 t_delay 決定了最短的 cycle time。下：在中間插一級 flip-flop，每一段只剩 t_delay / 2，cycle time 可以減半，代價是多一個 cycle 的 latency 和一排 flip-flop]]

合成工具可以把組合邏輯化簡得很好，但 flip-flop 要放在哪裡，還是要人來決定。切 pipeline 時記得 module 的輸入也要先擋一級 flip-flop，不然外面送進來的訊號帶著前一級的組合邏輯延遲，第一個 stage 的時間就不夠用。

## Lab 裡的數字

### Clock gating（Lab06）

同一個設計，合成時有沒有開 clock gating：

| | 沒有 clock gating | 有 clock gating |
| --- | --- | --- |
| Cycle time (ns) | 3.08 | 3.14 |
| 總面積 | 174,469 | 146,549 |
| 其中 ALU 的面積 | 2,338 | 2,332 |
| Dynamic power | 11.833 | 2.359 |
| Leakage power | 4.5 × 10⁶ | 3.7 × 10⁶ |

數字直接取自 DC 的 report，單位也沿用 report。

- 總面積少了 16%：每個 flip-flop 前面的 enable MUX 被拿掉，換成少數幾個共用的 clock-gating cell。ALU 本身的面積幾乎沒變，省下來的都在 register 那一側。
- Dynamic power 只剩約 1/5。
- Total power 和 dynamic power 幾乎一樣，leakage 在這個設計裡可以忽略。
- Cycle time 幾乎不受影響。

原理見 [[ICLAB_RTL_guideline_blog#Clock gating|RTL coding guidelines]]。

### FIR：平行、共用與 pipeline（Lab06、Lab08）

同一個 FIR filter 的幾種寫法，用 Area × Cycle time × Cycles 當指標（越小越好）：

| 寫法 | 面積 | Cycle time (ns) | Cycles | Area × Time × Cycles |
| --- | --- | --- | --- | --- |
| 全部平行 | 23,239 | 3.28 | 505 | 3.85 × 10⁷ |
| 只用一個乘法器和一個加法器 | 8,594 | 3.60 | 16,764 | 5.19 × 10⁸ |
| Fir1 | 13,270 | 3.20 | 1,110 | 4.71 × 10⁷ |
| Fir1 加上 pipeline | 14,642 | 3.21 | 1,112 | 5.23 × 10⁷ |

- 全部平行的面積最大，但 cycle 數最少，綜合指標最好。
- 只用一組乘加器，面積只有平行版的 37%，cycle 數卻多了 33 倍，綜合起來最差。
- 只看這組數字，Fir1 加上 pipeline 並沒有換到更短的 cycle time，反而多了約 10% 的面積和 2 個 cycle 的 latency。
