---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Pipeline hazard：forwarding、stall 與 branch prediction
date: '2025-04-28'
updated: '2026-10-17 21:21:35'
tags:
  - Computer Architecture
  - Pipeline
summary: Pipeline 的三種 hazard：structural、data、control。Data hazard 用 forwarding 解決，forwarding unit 的判斷條件怎麼寫；load-use 為什麼一定要 stall、怎麼偵測；branch 提早到 ID 判斷後還剩哪些 stall，以及 1-bit、2-bit branch predictor。
permalink: notes/ca-hazard/
synced: obsidian
---

[[computer_architecture_pipeline_blog|理想的 pipeline]] 每個 cycle 都能開始一條新指令；讓下一條指令無法在下一個 cycle 開始的情況叫 **hazard**。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

- **Structural hazard**：需要的硬體正在被別的指令使用
- **Data hazard**：要等前面的指令寫完資料，才讀得到正確的值
- **Control hazard**：下一條要執行哪條指令，取決於前面指令（branch）的結果

## Structural hazard

如果 instruction 和 data 共用一個 memory，`ld` 在 MEM 讀資料的同一個 cycle，另一條指令正好在 IF 取指令，兩者會搶同一個 memory。

![[Screenshot 2025-04-28 at 5.04.12 PM.png|ld 的 MEM 和 Instr 3 的 IF 同時用到 memory]]

解法是把 memory 分成 **instruction memory** 和 **data memory**（實際上是分開的 I-cache 和 D-cache）。RISC-V 的 pipeline 就是這樣設計，所以沒有 structural hazard。

## Data hazard

```
sub x2, x1, x3     # 寫 x2
and x12, x2, x5    # 讀 x2
or  x13, x6, x2    # 讀 x2
add x14, x2, x2    # 讀 x2
sd  x15, 100(x2)   # 讀 x2
```

![[Screenshot 2025-04-28 at 5.07.17 PM.png|sub 讀 x19 時，add 還沒寫回]]

`sub` 到 CC5 的 WB 才把 x2 寫回 register file，但 `and` 在 CC3、`or` 在 CC4 的 ID 就要讀 x2，讀到的是舊值。

![[Pasted image 20250428171225.png|and、or 讀到舊的 x2；add 和 sd 沒有問題]]

會出問題的是 **read after write（RAW，flow dependence）**：後面的指令讀前面指令寫的暫存器。在這個 in-order 的五級 pipeline 裡，write after read 和 write after write 不會出錯，因為寫入都發生在 WB，順序和程式一樣。

`add` 沒有問題：它在 CC5 的 ID 讀 x2，`sub` 也在 CC5 的 WB 寫 x2，register file **前半個 cycle 寫、後半個 cycle 讀**，所以讀得到新值。

有 dependence 不一定有 hazard，要看兩條指令離多近。

### 解法一：插入 bubble

最簡單的做法是讓後面的指令等：插入 **bubble**（nop，pipeline stall），直到前一條指令寫回 register file，也就是讓寫入的 WB 和讀取的 ID 落在同一個 cycle。上面的 `and` 就要等兩個 cycle，代價是效能。

![[Pasted image 20250428171425.png|插入兩個 bubble]]

### 解法二：forwarding

其實 `sub` 的結果在 CC3 的 EX 結束時就算好了，只是還沒寫回 register file。直接從 pipeline register 把結果拉給需要的指令，就不用等，這叫 **forwarding**（bypassing）。

![[Pasted image 20250428171601.png|把 EX 算出的結果直接送給下一條指令]]

![[Pasted image 20250428171809.png|and 從 EX/MEM、or 從 MEM/WB 拿到 x2]]

- `and` 在 CC4 的 EX 需要 x2，這時 `sub` 的結果在 **EX/MEM** 裡
- `or` 在 CC5 的 EX 需要 x2，這時 `sub` 的結果在 **MEM/WB** 裡

在時間上是往後送，在電路上卻是從後面的 pipeline register 拉線回到前面的 ALU 輸入，看起來像 feedback，因為同一個 cycle 裡越右邊的硬體放的是越舊的指令。

Forward 的來源是 **pipeline register**，不是 ALU 的輸出：ALU 的結果要在 clock edge 存進 EX/MEM 後才穩定，直接把 ALU 輸出接回輸入會形成組合邏輯迴圈。

### Forwarding unit

在 ALU 的兩個輸入前各加一個三選一的 mux，由 forwarding unit 控制：

![[Pasted image 20250428173216.png|Forwarding unit 和 ALU 前的 mux]]

| ForwardA / ForwardB | 來源 | 意思 |
| --- | --- | --- |
| 00 | ID/EX | 從 register file 讀出的值，沒有 hazard |
| 10 | EX/MEM | 前一條指令的 ALU 結果 |
| 01 | MEM/WB | 前兩條指令的結果（ALU 結果或 memory 讀出的值） |

**EX hazard**（跟前一條指令相依）：

```
if (EX/MEM.RegWrite
    and EX/MEM.RegisterRd ≠ 0
    and EX/MEM.RegisterRd = ID/EX.RegisterRs1)
  ForwardA = 10
```

**MEM hazard**（跟前兩條指令相依）：

```
if (MEM/WB.RegWrite
    and MEM/WB.RegisterRd ≠ 0
    and MEM/WB.RegisterRd = ID/EX.RegisterRs1)
  ForwardA = 01
```

ForwardB 一樣，把 Rs1 換成 Rs2。每個條件的原因：

![[Pasted image 20250428172719.png|EX hazard：和前一條指令相依]]

![[Pasted image 20250428172842.png|MEM hazard：和前兩條指令相依]]


- **RegWrite = 1**：前一條指令真的會寫暫存器。`sd`、`beq` 沒有 rd，那個欄位是 immediate 的一部分，不檢查會誤判
- **Rd ≠ 0**：x0 永遠是 0，寫進去沒有效果，不能 forward
- **Rd = Rs**：寫的正是要讀的暫存器

### 兩種 hazard 同時發生

```
add x1, x1, x2
sub x1, x1, x3
and x1, x1, x4
```

`and` 的 x1 同時和 `add`（MEM hazard）、`sub`（EX hazard）相依。正確的值是**最近的** `sub` 的結果，所以 MEM hazard 的條件要加上 EX hazard 不成立：

![[Pasted image 20250428173614.png|兩種 hazard 同時發生時，用比較近的 EX/MEM]]

```
if (MEM/WB.RegWrite
    and MEM/WB.RegisterRd ≠ 0
    and not (EX/MEM.RegWrite and EX/MEM.RegisterRd ≠ 0
             and EX/MEM.RegisterRd = ID/EX.RegisterRs1)
    and MEM/WB.RegisterRd = ID/EX.RegisterRs1)
  ForwardA = 01
```

## Load-use hazard：不能只靠 forwarding

R-type 在 EX 結束就有結果，但 `ld` 要到 **MEM 結束**才拿到資料。下一條指令如果馬上要用，它進 EX 時資料還不存在，forwarding 也沒辦法把資料送回過去。

![[Pasted image 20250526165602.png|ld 後面緊接著用 x2，只能插入一個 bubble]]

只能停一個 cycle，等 `ld` 到了 MEM/WB 再 forward 過去。

![[image-10.png|and 停在 ID 一個 cycle，EX 收到 bubble]]

### 偵測

在 ID 階段用 **hazard detection unit** 檢查：

```
if (ID/EX.MemRead
    and (ID/EX.RegisterRd = IF/ID.RegisterRs1
         or ID/EX.RegisterRd = IF/ID.RegisterRs2))
  stall
```

- ID/EX.MemRead = 1：在 EX 的指令是 load
- 它的 rd 是 ID 那條指令要讀的暫存器

![[image-11.png|Hazard detection unit 檢查 MemRead 和 Rd = Rs]]

### 怎麼 stall

- **不更新 PC 和 IF/ID**（PCWrite = 0、IF/IDWrite = 0）：IF 和 ID 的兩條指令下個 cycle 再做一次
- **把 ID/EX 的控制訊號全設成 0**：送進 EX 的就變成 nop。控制訊號全 0 代表不寫暫存器也不寫 memory，走完 pipeline 也不會改變任何狀態

![[image-12.png|PC 和 IF/ID 不更新，ID/EX 的控制訊號設成 0]]

### Reorder：讓 compiler 避開

Compiler 如果知道 pipeline 的結構，可以把不相關的指令排進 load 和使用之間。例如 `A = B + E; C = B + F;`：

![[image-13.png|調整順序後不需要 stall]]

把第三個 `ld` 往前移，兩個 stall 都不見了，從 13 個 cycle 變成 11 個。

## Control hazard

`beq` 要比較完兩個暫存器才知道下一條要執行哪裡。原本的設計到 **MEM** 才決定要不要跳，這時後面已經有三條指令進了 pipeline，跳的話三條都要 flush，代價太大。

![[image-14.png|beq 在 MEM 才決定是否跳躍]]

### 提早到 ID 決定

把判斷搬到 ID：

- 在 ID 用 XOR 比較兩個暫存器是否相等（不用等 ALU）
- 把算分支目標的加法器也搬到 ID

![[image-15.png|在 ID 比較並算出分支目標]]

這樣只會多抓一條錯的指令。要跳的話，用 **IF.Flush** 把 IF/ID 裡的指令清成 nop，penalty 只剩 1 個 cycle。

![[Pasted image 20250526170746.png|IF.Flush 把抓錯的指令變成 bubble]]

### 新的問題：branch 的 data hazard

原本的 forwarding 送到 EX，現在 branch 在 **ID** 就要用暫存器的值，早了一個 cycle：

| 一般指令 | Branch |
| --- | --- |
| 在 EX 需要運算元 | 在 ID 就需要運算元 |
| 前一條是 R-type：forward 就好 | 前一條是 R-type：stall 1 個 cycle |
| 前一條是 `ld`：stall 1 個 cycle | 前一條是 `ld`：stall 2 個 cycle |

- 比較的暫存器是前 2、3 條 ALU 指令的結果：forward 到 ID 就好
- 是**前一條** ALU 指令或**前兩條** `ld` 的結果：stall 1 個 cycle
- 是**前一條** `ld` 的結果：stall 2 個 cycle

![[Pasted image 20250526171605.png|前兩條是 ld、前一條是 ALU 指令時，beq 要停一個 cycle]]

### Branch prediction

Pipeline 越深，branch 的結果越晚知道，stall 的代價越大。另一個做法是**預測**：照預測的方向繼續抓指令，猜錯再 flush，猜對就沒有 penalty。

**1-bit predictor**：每個 branch 記一個 bit，記住上一次有沒有跳，這次就猜一樣；猜錯就把 bit 改成這次的結果。

![[Pasted image 20250526172107.png|1-bit predictor：迴圈的頭尾各猜錯一次]]

問題在迴圈：離開迴圈時猜錯一次（bit 變成 not taken），下次再進入迴圈的第一次又猜錯一次，每輪迴圈錯兩次。

**2-bit predictor**：要**連續猜錯兩次**才改變預測方向。

![[Pasted image 20250526172146.png|2-bit predictor 的狀態圖]]

離開迴圈時只會從 strongly taken 退到 weakly taken，下次進迴圈還是猜 taken，每輪只錯一次。
