---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Exception 與 instruction-level parallelism
date: '2025-04-30'
updated: '2026-10-17 21:22:37'
tags:
  - Computer Architecture
  - Pipeline
summary: CPU 遇到 exception 和 interrupt 時怎麼中斷目前的程式、跳到 handler：SEPC、SCAUSE、vectored interrupt，以及 pipeline 裡怎麼 flush。後半是 ILP：static dual issue 怎麼排指令、loop unrolling 和 register renaming，還有 dynamic scheduling 的 reservation station。
permalink: notes/ca-exception-ilp/
synced: obsidian
---

第 4 章的最後兩個主題：pipeline 怎麼處理意外事件，以及怎麼在一個 cycle 裡執行多條指令。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## Exception 與 interrupt

CPU 讀到不認得的 opcode、使用者按下鍵盤，這類事件都要打斷目前的程式，先執行一段專門的程式處理。

- **Exception**：改變控制流程的意外事件，例如 undefined opcode、overflow、system call，像是沒有事先安排的函式呼叫，可能來自內部或外部
- **Interrupt**：外部造成的事件，例如 I/O controller 送來的請求

（x86 不區分，一律叫 interrupt。）

![[Pasted image 20250526173426.png|各種事件的來源和 RISC-V 的叫法]]

外部裝置透過 CPU 的 **IRQ**（interrupt request）pin 通知 CPU；內部的 exception 則是 controller 發現問題時設一個 flag。

### 處理的流程

收到 interrupt 時，CPU：

1. 停在下一條指令之前
2. 把下一條指令的位址存起來
3. 跳到 **ISR**（interrupt service routine，也叫 interrupt handler）

ISR 就是放在固定位置的副程式。為了不影響被打斷的程式，ISR 用到的暫存器要先存到 stack、結束前還原，和 callee-saved 的做法一樣。

RISC-V 處理內部 exception 時：

- 把出問題的指令的 PC 存到 **SEPC**（supervisor exception program counter）
- 把原因存到 **SCAUSE**（supervisor exception cause register），例如 2 是 undefined opcode、12 是 hardware malfunction
- 跳到 OS 的 exception handler（課本假設所有 exception 都從 `0000 0000 1C09 0000`₁₆ 進入）

Handler 讀出原因後決定怎麼處理：可以恢復的話，修正問題後用 SEPC 跳回原本的程式；否則終止程式，用 SEPC、SCAUSE 回報錯誤。

### Vectored interrupt

另一種做法是不同原因跳到不同的 handler。CPU 依中斷來源給出 **exception vector address**，加上 vector table base register 就是 handler 的位址。Handler 可以直接處理，或再跳到真正的 handler。

![[image-17.png|Vectored interrupt：vector address 加上 base register 得到 handler 的位址]]

### Pipeline 裡的 exception

在 pipeline 裡，exception 可以看成另一種 control hazard。假設 `add x1, x2, x1` 在 EX 發生 hardware malfunction，要避免 x1 被寫壞：

1. 讓 `add` **之前**的指令正常做完
2. 把 `add` 和之後的指令 flush 掉（IF.Flush、ID.Flush、EX.Flush，把控制訊號清成 0）
3. 設定 SEPC 和 SCAUSE
4. 從 handler 的位址開始抓指令

| 偵測到 exception | Flush 之後 |
| --- | --- |
| ![[Pasted image 20250526174645.png]] | ![[Pasted image 20250526174721.png]] |

這和 branch 猜錯時的 flush 很像，可以共用大部分硬體。可以重來的 exception，handler 結束後就從 SEPC 重新抓那條指令執行。

Pipeline 裡同時有好幾條指令，可能同時發生好幾個 exception。簡單的做法是先處理**最早那條指令**的 exception，把後面的都 flush 掉，這叫 **precise exception**：handler 看到的狀態，就像程式剛好停在那條指令之前。

### Imprecise exception

有些電腦用 **imprecise exception**：直接停下 pipeline、保存狀態和原因，讓 OS 判斷是哪條指令出錯、哪些要完成、哪些要 flush。硬體變簡單，handler 卻變得很複雜，而且不適用於 multiple issue、out-of-order 的 pipeline。

## Instruction-level parallelism

Pipeline 讓多條指令重疊執行，這叫 **ILP**（instruction-level parallelism）。要再提高 ILP 有兩個方向：

- **更深的 pipeline**：每一級做的事更少，clock 更短，但還是一個 cycle 完成一條指令
- **Multiple issue**：複製 pipeline，每個 cycle 抓取並發出多條指令，CPI 可以小於 1。例如 4 GHz 的 4-way multiple issue，peak CPI = 0.25（peak IPC = 4），但指令之間的 dependence 會讓實際的 IPC 比較低

Multiple issue 又分兩種：

- **Static multiple issue**：compiler 決定哪些指令一起發出並避開 hazard，CPU 不用檢查
- **Dynamic multiple issue**：CPU 在執行時決定每個 cycle 發出哪幾條指令，hazard 也由 CPU 處理

### Speculation

整數程式大約每 5 條指令就有一條 branch，5 條指令裡很難找到足夠多互相獨立的指令；跨過 branch 去找，又不確定那些指令會不會真的執行。解法是 **speculation**：先猜先做，事後檢查，猜對就完成，猜錯就 roll back。

- 猜 branch 的方向（branch prediction）
- 猜 store 之後的 load 不會讀同一個位址，把 load 提前

Compiler 可以把指令移過 branch，再加上猜錯時的修正程式碼；硬體可以先把結果放在 buffer，確定需要才寫入，猜錯就清掉。Speculative 執行的指令如果發生 exception（例如在檢查 null pointer 之前就 load），要等確定這條指令真的該執行才處理。

## Static dual issue

Compiler 把可以在同一個 cycle 發出的指令打包成 **issue packet**，可以把它看成一條很長的指令（VLIW，very long instruction word）。

RISC-V 的 static dual issue，每個 packet 是：

- 一條 **ALU / branch** 指令
- 一條 **load / store** 指令

配不到的位置就放 nop，兩條指令對齊 64-bit 的邊界。

![[Pasted image 20250526182702.png|每個 cycle 發出一個 packet]]

硬體上，ALU / branch 和 load / store 各有自己的運算單元（load / store 多一個算位址的加法器），register file 要多兩個 read port 和一個 write port，變成 4 讀 2 寫。

![[Pasted image 20250526182725.png|Dual-issue 的 datapath]]

### 更多 hazard

同時執行的指令變多，hazard 也更多、影響更大：

- **EX data hazard**：單發射時用 forwarding 就不用停，但同一個 packet 裡的 load / store 不能用同 packet 裡 ALU 指令的結果。例如 `add x10, x0, x1` 和 `ld x2, 0(x10)` 只能分成兩個 packet，等於 stall 一次
- **Load-use hazard**：一樣要等一個 cycle，但現在一個 cycle 浪費的是兩條指令的位置

所以排程要更積極。

### 排程的例子

```
Loop: ld   x31, 0(x20)      # x31 = 陣列元素
      add  x31, x31, x21    # 加上 x21
      sd   x31, 0(x20)      # 存回去
      addi x20, x20, -8     # 指標往前
      blt  x22, x20, Loop   # x22 < x20 就繼續
```

![[Pasted image 20250526182916.png|Dual issue 的排程：IPC = 1.25]]

`addi` 提前到第 2 個 cycle，補上 load-use 的空檔；x20 已經先減了 8，所以 `sd` 的 offset 改成 8。5 條指令用 4 個 cycle，IPC = 1.25，離 peak 的 2 還很遠，因為幾乎每條指令都依賴前一條。

### Loop unrolling

把迴圈展開成好幾份迴圈本體，就有更多互相獨立的指令可以排，迴圈控制（`addi`、`blt`）的 overhead 也變少。

展開時每一份要用**不同的暫存器**，這叫 **register renaming**。原本每一輪都用 x31，展開後如果還共用 x31，第二份的 `ld x31` 必須等第一份的 `sd x31` 讀完才能寫（write after read，anti-dependence，也叫 name dependence）。兩份之間其實沒有資料相依，只是用了同一個暫存器名字，換成 x28～x31 就沒有關係了。

![[Pasted image 20250526183104.png|直接展開時，暫存器名字重複造成 anti-dependence]]

展開 4 次、換暫存器、合併 4 個 `addi` 並調整 offset：

![[Pasted image 20250526183231.png|Register renaming、合併 addi、調整 offset]]

排成 dual issue：

![[Pasted image 20250526183253.png|展開 4 次後的排程：IPC = 1.75]]

14 條指令用 8 個 cycle，IPC = 1.75，更接近 2，代價是用了更多暫存器，程式碼也變長。

## Dynamic multiple issue

**Superscalar** processor 由 CPU 自己決定每個 cycle 發出 0、1 或更多條指令。不需要 compiler 排程（排了還是有幫助），程式也不用為新的 CPU 重新編譯。

### Dynamic pipeline scheduling

CPU **不照順序執行**（out-of-order），但**照順序寫回**暫存器：

```
ld   x31, 20(x21)
add  x1, x31, x2      # 要等 ld
sub  x23, x23, x3     # 跟上面無關，可以先做
andi x5, x23, 20
```

`add` 在等 `ld` 時，`sub` 可以先執行。

五級 pipeline 裡，forwarding 的資料存在各級的 pipeline register。現在有好幾個運算單元（ALU、乘法器、load / store），每個單元前面放幾個 **reservation station**（RS），存放等待執行的指令和需要的運算元。運算元還沒算好時，等運算單元算出來，透過 **common data bus** 送給所有在等它的 RS，這就是 forwarding。結果先放在 **reorder buffer**，再依程式順序寫回暫存器。

![[Pasted image 20250526235206.png|Dynamically scheduled CPU]]

Reservation station 和 reorder buffer 也達到 register renaming 的效果：指令進 RS 時就把運算元複製過去，原本的暫存器之後被覆蓋也沒關係，WAR、WAW 這類假的相依就不存在了。

### 為什麼不全交給 compiler

- 不是所有 stall 都能預測：branch 的結果和 cache miss 都要執行時才知道
- 同一個 ISA 的不同實作，延遲和 hazard 都不一樣，compiler 無法替每一顆 CPU 排程

### 效果有限

Multiple issue 有效，但效果有限：程式本身有真正的相依，pointer aliasing 這類相依很難排除，發出指令時能看的範圍有限，memory 的延遲和頻寬也讓 pipeline 很難保持滿載。Dynamic scheduling 和 speculation 又很耗電，所以後來改成用多顆比較簡單的 core。
