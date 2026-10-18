---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Single-cycle processor：datapath 與 control
date: '2025-04-02'
updated: '2026-10-17 21:20:00'
tags:
  - Computer Architecture
  - Datapath
summary: 用 RISC-V 的一小組指令（add、sub、and、or、ld、sd、beq）做出一顆 single-cycle CPU：每條指令拆成 IF、ID、EX、MEM、WB 五步，逐步拼出 datapath，再設計 main control 和兩層式的 ALU control。
permalink: notes/ca-single-cycle/
synced: obsidian
---

這一章開始做 CPU。先做最簡單的版本：每條指令在**一個很長的 clock cycle** 裡做完，CPI = 1；下一篇再改成 [[computer_architecture_pipeline_blog|pipeline]]。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## 要支援的指令

只挑幾條指令，但每種格式都有：

- **R-type**：`add`、`sub`、`and`、`or`（`rd, rs1, rs2`）
- **I-type**：`ld rd, imm12(rs1)`
- **S-type**：`sd rs2, imm12(rs1)`
- **SB-type**：`beq rs1, rs2, imm12`

![[Screenshot 2025-04-02 at 9.30.05 PM 1.png|要實作的指令和它們的編碼]]

四條 R-type 指令的 opcode 相同，只差在 funct3 和 funct7；funct7 只有 instruction[30] 這個 bit 不同，也就是 `add` 和 `sub` 的差別。（指令格式見 [[computer_architecture_isa_blog#指令怎麼編碼|RISC-V 指令集]]。）

## 執行一條指令的五個步驟

1. **IF**（instruction fetch）：用 PC 去 instruction memory 取指令，同時算好 PC + 4
2. **ID**（instruction decode）：解碼，並讀出 rs1、rs2 兩個暫存器
3. **EX**（execute）：用 ALU 運算，或算記憶體位址、比較分支條件
4. **MEM**（memory access）：讀或寫 data memory
5. **WB**（write back）：把結果寫回暫存器

不是每條指令都會用到每一步：

| | R-type | `ld` | `sd` | `beq` |
| --- | --- | --- | --- | --- |
| IF | ✓ | ✓ | ✓ | ✓ |
| ID | ✓ | ✓ | ✓ | ✓ |
| EX | 運算 | 算位址 | 算位址 | 比較 + 算目標位址 |
| MEM | — | 讀 | 寫 | — |
| WB | 寫 rd | 寫 rd | — | — |

## 拼出 datapath

### IF

PC 送進 instruction memory，讀出 32-bit 的指令；同時用加法器算 PC + 4，下一個 clock edge 再寫回 PC。PC 是暫存器，只在 clock edge 更新。

![[Pasted image 20250417032403.png|IF：取指令並算 PC + 4]]

### ID

指令欄位的位置固定，不用等解碼完，就能把 instruction[19:15]（rs1）和 [24:20]（rs2）送進 register file 讀出兩個值。有些指令用不到 rs2（例如 `ld`），但先讀起來沒有壞處，硬體也比較簡單。同時 opcode 送進 controller，解碼成控制各個 mux 的訊號。

### EX

依指令種類而不同：

- **R-type**：ALU 對 Read data 1 和 Read data 2 做 ALU control 指定的運算

![[Pasted image 20250417032548.png|Register file 和 ALU]]

- **`ld` / `sd`**：記憶體位址 = rs1 + immediate。**ImmGen** 從指令中取出 12 bits 的 immediate（不同格式的位置不同），sign-extend 成 64 bits 送進 ALU

![[Pasted image 20250417032944.png|ImmGen 和 data memory]]

- **`beq`**：ALU 算 rs1 − rs2 並看 Zero；另一個加法器算分支目標 PC + (imm << 1)。SB-format 的 immediate 不存最低位，所以要左移 1 位

![[Pasted image 20250417031242.png|Branch 的 datapath]]

### MEM

只有 `ld` 和 `sd` 會用到：`ld` 讓 MemRead = 1 讀出資料，`sd` 讓 MemWrite = 1，把 rs2 的值寫到 ALU 算出的位址。

### WB

R-type 和 `ld` 要寫回 rd（instruction[11:7]）：R-type 寫 ALU 的結果，`ld` 寫 memory 讀出的值，用一個 mux 選擇。只有這兩種指令的 RegWrite 是 1，暫存器在 clock edge 才真的寫入。

四種指令走的路徑：

![[Pasted image 20250417034054.png|R-type]]

![[Pasted image 20250417034409.png|ld]]

![[Pasted image 20250417034955.png|sd]]

![[Pasted image 20250417035125.png|beq]]

## 完整的 datapath

把四種指令的路徑疊在一起，兩條路徑接到同一個輸入的地方就放一個 mux，由 controller 選擇：

![[Pasted image 20250417041055.png|Single-cycle datapath 加上 control]]

- **ALUSrc**：ALU 的第二個輸入要 rs2（R-type、`beq`）還是 immediate（`ld`、`sd`）
- **MemtoReg**：寫回的值要 ALU 結果（R-type）還是 memory 的資料（`ld`）
- **PCSrc**：下一個 PC 是 PC + 4 還是分支目標
- **RegWrite**、**MemRead**、**MemWrite**：要不要寫暫存器、讀寫 memory

### 為什麼 PCSrc 前面要一個 AND

PCSrc = Branch AND Zero，只有是 branch 指令而且兩數相等時才跳。如果只看 Zero，普通的 `sub` 算出 0 時，PC 也會被改到錯誤的位址。

## Control

Controller 分成兩層：

![[Pasted image 20250417035812.png|Controller 分成 main control 和 ALU control]]


- **Main control**：輸入 opcode（instruction[6:0]），輸出 datapath 上所有的控制訊號，以及 2 bits 的 **ALUOp** 給 ALU control
- **ALU control**：輸入 ALUOp 和 funct 欄位，輸出 4 bits 的 ALUctr

### Main control

| 指令 | ALUSrc | MemtoReg | RegWrite | MemRead | MemWrite | Branch | ALUOp |
| --- | --- | --- | --- | --- | --- | --- | --- |
| R-type | 0 | 0 | 1 | 0 | 0 | 0 | 10 |
| `ld` | 1 | 1 | 1 | 1 | 0 | 0 | 00 |
| `sd` | 1 | X | 0 | 0 | 1 | 0 | 00 |
| `beq` | 0 | X | 0 | 0 | 0 | 1 | 01 |

X 是 don't care：`sd` 和 `beq` 不寫暫存器，MemtoReg 選哪個都可以。

### ALU control

ALUOp 的意思：

- **00**（`ld` / `sd`）：ALU 做加法算位址
- **01**（`beq`）：ALU 做減法比較
- **10**（R-type）：只看 opcode 不知道要做什麼，還要看 funct7 和 funct3

| 指令 | ALUOp | funct7 | funct3 | ALU 運算 | ALUctr |
| --- | --- | --- | --- | --- | --- |
| `ld` / `sd` | 00 | X | X | add | 0010 |
| `beq` | 01 | X | X | subtract | 0110 |
| `add` | 10 | 0000000 | 000 | add | 0010 |
| `sub` | 10 | 0100000 | 000 | subtract | 0110 |
| `and` | 10 | 0000000 | 111 | and | 0000 |
| `or` | 10 | 0000000 | 110 | or | 0001 |

ALU control 不需要完整的 funct7 和 funct3，只要能區分這幾條指令的 bits：instruction[30]（funct7 裡唯一不同的 bit）和 instruction[14:12]（funct3）。ALUctr 的編碼見 [[computer_architecture_alu_blog|ALU]]。

![[Pasted image 20250525152402.png|ALU control 的輸入和輸出|360]]

分成兩層之後，main control 不用認得每一條 R-type 指令，ALU control 也只要處理一張小的 truth table。

## Single-cycle 的問題

- CPI = 1，但 clock period 由**最慢的指令**決定。`ld` 要經過 instruction memory、register file、ALU、data memory，再寫回 register file，所有指令都要等這麼久
- 每個硬體在一個 cycle 裡只用一次，例如 R-type 用不到 data memory，還是要等完整個 cycle
- 加入更複雜的指令（例如浮點數）後，最慢的路徑會更長

解法是把指令拆成幾段，讓不同指令的不同階段同時進行，也就是下一篇的 [[computer_architecture_pipeline_blog|pipeline]]。
