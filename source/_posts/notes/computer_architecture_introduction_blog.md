---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 電腦的組成與晶片成本
date: '2025-02-18'
updated: '2026-10-17 21:15:27'
tags:
  - Computer Architecture
summary: 一台電腦由 processor（control unit 加 datapath）、memory 和 I/O 組成，ISA 是軟體和硬體之間的介面；晶片成本則由 wafer 成本、die 面積和良率決定。
permalink: notes/ca-introduction/
synced: obsidian
---

課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## 電腦的組成

![[computer_architecture_introduction.svg|電腦的組成，以及 wafer 和 die]]

一台電腦分成三個部分，彼此透過 interconnection（bus）連接：

- **Processor**：負責執行指令，裡面分成兩塊
	- **Control unit**：一個 finite state machine。從 memory 取出指令、解碼，再產生控制訊號，決定其他部分要做什麼
	- **Datapath**：實際做運算的地方，例如 ALU（arithmetic & logic unit）負責加減和邏輯運算
- **Memory**：程式執行時，程式碼和資料都放在這裡
- **I/O devices**：輸入和輸出裝置

Control unit 和 datapath 會在第 4 章實際做出來（[[computer_architecture_single_cycle_processor_blog|single-cycle processor]]），memory 則是第 5 章的內容。

## Instruction Set Architecture

ISA（指令集架構，也簡稱 architecture）是軟體和硬體之間的介面：

- Compiler 只需要知道 ISA 有哪些指令，就能把高階語言翻成機器碼，不用管硬體怎麼做
- 硬體只要正確執行 ISA 定義的每條指令，用什麼方式實作都可以，例如 single-cycle、pipeline 或 multiple issue

![[截圖 2025-03-04 下午8.20.51.png|ISA 位在軟體和硬體的交界|500]]

## 晶片成本

一片 wafer 會切出很多顆 die，每顆 die 的成本是：

$$
\text{Cost per die} = \frac{\text{Cost per wafer}}{\text{Dies per wafer} \times \text{Yield}}
$$

$$
\text{Dies per wafer} \approx \frac{\text{Wafer area}}{\text{Die area}}
$$

$$
\text{Yield} = \frac{1}{\left(1 + \text{Defects per area} \times \dfrac{\text{Die area}}{2}\right)^2}
$$

（上面手繪圖裡的 yield 公式少了平方，以這裡為準。）

在同一個製程下，wafer 的成本和面積大致固定，能改變成本的是：

- **Defect rate**：由製程決定
- **Die area**：由架構和電路設計決定

Die 面積越大，一片 wafer 能切的 die 越少；yield 又和面積成非線性關係，面積稍微變大，良率就掉很多。所以設計時要很在意面積。
