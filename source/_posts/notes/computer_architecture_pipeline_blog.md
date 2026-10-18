---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Pipeline：五級管線的 datapath 與 control
date: '2025-04-17'
updated: '2026-10-17 21:20:40'
tags:
  - Computer Architecture
  - Pipeline
summary: 把 single-cycle CPU 切成 IF、ID、EX、MEM、WB 五級：pipeline 的 speedup 怎麼算、為什麼不平衡的 stage 會拉低 speedup，以及 pipeline register 要存哪些東西、控制訊號和 rd 為什麼要跟著指令往後傳。
permalink: notes/ca-pipeline/
synced: obsidian
---

[[computer_architecture_single_cycle_processor_blog|Single-cycle CPU]] 的每個硬體在一個 cycle 裡只用一次，其他時間都閒著。Pipeline 把指令拆成幾段，讓不同指令的不同階段同時進行。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## Pipeline 的概念

一件工作如果能拆成幾個有先後順序、互不干擾的步驟，就可以像生產線一樣：第一件做完第一步交給下一站，第二件就能開始第一步。課本用洗衣服當例子：

![[Pasted image 20250417045643.png|洗衣服：一次做完一批 vs. pipeline]]

- 一開始要花時間把 pipeline **填滿**（filling），最後也要時間把裡面的工作**清空**（draining）
- 單一工作的 **latency 沒有變短**（甚至可能變長），變好的是 **throughput**
- 整條線的速度受**最慢的一站**限制

k 級的 pipeline 做 N 件工作，每一級花 1 單位時間：

$$
\text{Speedup} = \frac{\text{不用 pipeline}}{\text{用 pipeline}} = \frac{kN}{k + (N - 1)}
$$

分母的 k 是第一件工作走完整條線的時間，之後每單位時間完成一件。N 很大時 speedup 趨近 k，也就是理想的 speedup 等於 stage 數；N 小的時候，填滿和清空的時間會拉低 speedup。

![[Pasted image 20250417050028.png|前 k 個時間在填滿 pipeline，之後每個時間完成一件|300]]

## CPU 的 pipeline

Single-cycle 的五個步驟就是五級：

- **IF**：instruction fetch
- **ID**：instruction decode、讀暫存器
- **EX**：運算或算位址
- **MEM**：存取 data memory
- **WB**：寫回暫存器

各指令花的時間不同，single-cycle 只能讓每條指令都等最慢的那一條；pipeline 裡某一級閒著，其他級還是可以繼續做事。

![[Pasted image 20250417220029.png|Single-cycle 和 pipeline 的比較]]

假設各級的延遲是 IF 200 ps、ID 100 ps、EX 200 ps、MEM 200 ps、WB 100 ps：

![[Pasted image 20250417220458.png|三條 ld：single-cycle 要 2400 ps，pipeline 要 1400 ps]]

- **Single-cycle**：clock 要等最慢的指令（`ld` 走完五級是 800 ps）
- **Pipeline**：clock 只要等最慢的一級（200 ps）。ID 和 WB 雖然只要 100 ps，也要等滿 200 ps

三條 `ld` 的 speedup 是 2400 / 1400 ≈ 1.7。指令夠多時每 200 ps 完成一條，是 800 ps 的 4 倍。

### 為什麼不是 5 倍

如果五級完全平衡，每一級是 800 / 5 = 160 ps：

$$
\text{Speedup} = \frac{N \times 800\,\text{ps}}{800\,\text{ps} + (N - 1) \times 160\,\text{ps}} \xrightarrow{N \to \infty} 5
$$

實際上各級不平衡，最慢的一級是 200 ps，clock 只能是 200 ps：

$$
\text{Speedup} = \frac{N \times 800\,\text{ps}}{1000\,\text{ps} + (N - 1) \times 200\,\text{ps}} \xrightarrow{N \to \infty} 4
$$

Speedup 的上限是 single-cycle 的 clock 除以最慢一級的延遲。而單一指令的 latency 從 800 ps 變成 5 × 200 = 1000 ps，反而變長了。

## RISC-V 很適合 pipeline

- **所有指令都是 32 bits**，IF 每次取一樣長，ID 也很單純。x86 的指令長度從 1 到 15 bytes 都有，光是切出一條指令就很麻煩
- **格式少且規律**，rs1、rs2 的位置固定，可以邊解碼邊讀暫存器
- **只有 load / store 存取 memory**，位址在 EX 算好、MEM 再存取，沒有運算元在 memory 裡、要多跑一趟的指令

## Pipeline register

各級之間要插入暫存器，存住上一級的結果，下一個 cycle 交給下一級，否則後面的指令一進來，前一條的訊號就被蓋掉。四個 pipeline register 以兩側的 stage 命名：

![[ca-slide-lec4-2-pipeline-p28.png|各級之間插入 pipeline register]]

- **IF/ID**：取回的指令、這條指令的 PC

![[ca-slide-lec4-2-pipeline-p29.png|IF：寫入 IF/ID]]

- **ID/EX**：PC、從暫存器讀出的 rs1 和 rs2、sign-extend 後的 immediate、rd、還沒用到的控制訊號

![[Pasted image 20250417233217.png|ID：寫入 ID/EX]]

- **EX/MEM**：ALU 的結果、分支目標、要寫進 memory 的值（rs2）、rd、控制訊號

![[Pasted image 20250417233351.png|EX：寫入 EX/MEM]]

- **MEM/WB**：從 memory 讀出的值、ALU 的結果、rd、控制訊號

![[Pasted image 20250417233513.png|MEM：寫入 MEM/WB]]

### rd 為什麼要一路傳下去

WB 要把結果寫回 rd，但這時 IF/ID 裡已經是三條之後的指令，直接用 IF/ID 解碼出的 rd 就會寫錯暫存器。所以 rd 要跟著指令存在每個 pipeline register 裡，WB 時用 MEM/WB 裡的 rd。

![[Screenshot 2025-04-28 at 4.42.37 PM.png|rd 跟著指令一路傳到 WB]]

同理，後面才會用到的資訊都要跟著往後傳，例如 `beq` 的 PC 要傳到算分支目標的那一級。

### 看圖的方式

畫 pipeline 有兩種圖：

- **Multi-cycle pipeline diagram**：橫軸是時間、縱軸是指令，可以看出每條指令在哪個 cycle 走到哪一級

![[Screenshot 2025-04-28 at 4.44.16 PM.png|Multi-cycle pipeline diagram]]

- **Single-cycle pipeline diagram**：畫出某一個 cycle 的 datapath，標出每一級正在處理哪條指令

![[Screenshot 2025-04-28 at 4.44.51 PM.png|上圖 CC5 的 single-cycle pipeline diagram]]

在 single-cycle 的圖裡，**越左邊的硬體放的是越新的指令**：IF 是剛取進來的，WB 是最早進來的。

## Pipeline 的 control

控制訊號和 single-cycle 一樣，只是使用的時間不同：opcode 在 ID 解碼，控制訊號卻到 EX、MEM、WB 才用。所以 ID 產生所有控制訊號後，依使用的階段分成三組，放進 pipeline register 往後傳：

- **EX**：ALUSrc、ALUOp
- **M**：Branch、MemRead、MemWrite
- **WB**：MemtoReg、RegWrite

每過一級用掉一組：ID/EX 有三組，EX/MEM 剩 M 和 WB，MEM/WB 只剩 WB。

![[Screenshot 2025-04-28 at 4.47.27 PM.png|控制訊號分組往後傳]]

![[Screenshot 2025-04-28 at 4.48.17 PM.png|Pipelined datapath 加上 control]]

Pipeline 填滿後，每個 cycle 完成一條指令，**effective CPI = 1**，clock 卻只有 single-cycle 的約 1/4。

前提是後面的指令不會用到前面還沒算完的結果，但實際上常常會，這就是下一篇的 [[computer_architecture_harzard_blog|hazard]]。
