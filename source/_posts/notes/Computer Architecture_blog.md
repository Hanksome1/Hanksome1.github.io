---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 計算機結構：筆記總覽
date: '2025-02-18'
updated: '2026-10-17 21:09:42'
tags:
  - Computer Architecture
  - MOC
summary: 清大 CS4100 計算機結構的筆記入口：從效能的定義、RISC-V 指令集、ALU 與浮點數，到 single-cycle 和 pipeline CPU、hazard 與 ILP，最後是 cache 和 virtual memory。
permalink: notes/computer-architecture/
synced: obsidian
---

計算機結構是清大資工系的 CS4100（Computer Architecture），由黃稚存老師授課。這堂課以 RISC-V 為例，從指令集開始，接著做出 ALU 和 single-cycle CPU，再改成五級 pipeline，最後是 cache 和 virtual memory。課本是 *Computer Organization and Design*（RISC-V 版）的第 1～5 章。

## 課程進度

| 講次 | 主題 |
| --- | --- |
| 1-1 | 電腦的組成、晶片成本 |
| 1-2 | 效能、功耗、benchmark |
| 2-1 | RISC-V 指令集：運算、記憶體、分支、指令格式 |
| 2-2 | 函式呼叫、定址方式、組譯與連結 |
| 3-1 | ALU、乘法、除法 |
| 3-2 | 浮點數 |
| 4-1 | Single-cycle processor |
| 4-2 | Pipeline |
| 4-3 | Hazard |
| 4-4 | Exception 與 instruction-level parallelism |
| 5-1 | Memory hierarchy、記憶體的可靠度 |
| 5-2 | Cache |
| 5-3 | Virtual memory |

## 筆記

### 概論

- [[computer_architecture_introduction_blog|電腦的組成與晶片成本]]
- [[computer_architecture_performance_blog|效能：CPU time、CPI 與 Amdahl's law]]

### 指令集

- [[computer_architecture_isa_blog|RISC-V 指令集：暫存器、記憶體、指令格式與分支]]
- [[computer_architecture_procedure_blog|函式呼叫：jal、jalr、stack 與 calling convention]]

### 算術

- [[computer_architecture_alu_blog|ALU、乘法器與除法器]]
- [[computer_architecture_fp_blog|浮點數：IEEE 754、運算與 rounding]]

### Processor

- [[computer_architecture_single_cycle_processor_blog|Single-cycle processor]]
- [[computer_architecture_pipeline_blog|Pipeline]]
- [[computer_architecture_harzard_blog|Hazard：forwarding、stall 與 branch prediction]]
- [[computer_architecture_exception_blog|Exception 與 instruction-level parallelism]]

### 記憶體

- [[computer_architecture_memory_blog|Memory hierarchy 與記憶體的可靠度]]
- [[computer_architecture_cache_blog|Cache]]
- [[computer_architecture_virtual_memory_blog|Virtual memory]]

## 重點

- CPU time = 指令數 × CPI × clock cycle time，改善其中一項時，常常會讓另一項變差。
- 常用的情況要做得快：小常數用 immediate、函式呼叫用 `jal`、branch 用 PC-relative 定址。
- 所有指令都是 32 bits，暫存器欄位的位置固定，解碼和讀暫存器才能同時做。
- Pipeline 的 clock 由最慢的那一級決定，各級的延遲要盡量平均。
- 能 forward 就不要 stall；`ld` 的結果下一條指令馬上要用時，一定要停一個 cycle。
- Cache 要顧 hit time，virtual memory 要顧 miss rate，因為 page fault 要花上百萬個 cycle。
