---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 三級管線 CPU：接上 SRAM 與 BEQ 分支
date: '2025-10-06'
updated: '2026-10-16 00:26:08'
tags:
  - ICLAB
  - Verilog
  - Computer Architecture
summary: Lab05 在一顆三級管線 CPU 上接上 instruction 和 data SRAM、補上 LW / SW 的控制訊號，並用一個小 FSM 處理 BEQ 分支。順便整理 single-port SRAM 的控制腳位。
permalink: notes/iclab-lab05-cpu/
synced: obsidian
---

## 要做的事

1. 指令和資料各接一顆 single-port SRAM（256 × 32），補上 LW、SW 兩個指令。
2. 加入 BEQ，用一個 FSM 控制分支。
3. RTL 要通過 [[ICLAB_spyglass_blog|SpyGlass]]，確保可以合成、符合 coding style。

驗證的方式是：testbench 跑完之後把 register file 的內容 dump 成檔案，和 golden 比對。

## Single-port SRAM 怎麼控制

所有的位址、資料和控制訊號都在 clock 的 rising edge 取樣。腳位名稱最後的 B 代表 active low。

| 動作 | CSB | WEB | OEB | 說明 |
| --- | --- | --- | --- | --- |
| Read | 0 | 1 | 0 | 下一個 cycle 資料出現在輸出 `O` |
| Write | 0 | 0 | 1 | 把輸入 `I` 的資料寫進去；`OEB = 1` 讓輸出變成 tri-state |
| Standby | 1 | – | – | 不讀也不寫，資料保留 |

- Instruction SRAM 只讀不寫，位址來自 PC。
- Data SRAM 可讀可寫，位址是 ALU 算出來的結果，寫入的資料來自 register file。
- 用不到的 enable 拉高，讓它保持在不動作的狀態。

## LW 與 SW 的控制訊號

| 指令 | Opcode | RegWrite | ALUSrc | MemRead | MemWrite | MemtoReg | RegDst |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LW | `100011` | 1 | 1 | 1 | 0 | 1 | 0 |
| SW | `101011` | 0 | 1 | 0 | 1 | 0 | – |

BEQ（opcode `000100`）則是 `Branch = 1`、`ALUOp = 01`，不寫 register 也不寫 memory。

## BEQ 的 FSM

用一個 posedge 觸發的 FSM 控制分支，三個狀態：

- **NORMAL**：照順序 fetch 指令，`beq_en = 0`、`PCSrc = 0`。
- **BEQ_IN**：抓住兩個要比較的 register，啟動比較，並準備好可能的分支目標。
- **EQUAL**：如果兩個 register 相等，拉高 `PCSrc = 1`，讓 PC 跳到分支目標，然後回到 NORMAL。

遇到 BEQ 時，IF stage 要停一個 cycle 等比較的結果，所以 FSM 的輸出要和 pipeline register 配合好。這就是管線處理器的 control hazard，見 [[Pipeline Hazards]]。
