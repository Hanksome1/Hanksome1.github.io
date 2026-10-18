---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: RISC-V 指令集：暫存器、記憶體、指令格式與分支
date: '2025-02-27'
updated: '2026-10-17 21:17:03'
tags:
  - Computer Architecture
  - ISA
summary: RISC-V（RV64）指令集的基本功：32 個 64-bit 暫存器、byte addressing 的記憶體與 ld / sd、R / I / S 三種指令格式怎麼編碼、邏輯與 shift 運算，以及用 beq / bne 寫出 if 和 while。
permalink: notes/ca-isa/
synced: obsidian
---

這門課用的 ISA 是 64-bit 的 **RISC-V**（RV64I）。這篇整理暫存器、記憶體、常數這些運算元，R / I / S 三種指令格式，以及怎麼用 branch 寫出 if 和迴圈；函式呼叫和其他指令格式在 [[computer_architecture_procedure_blog|下一篇]]。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## CPU 怎麼執行一條指令

![[ca-slide-lec2-1-isa-p5.png|PC 指到下一條指令，指令讀進 IR 後由 controller 解碼]]

- **PC**（program counter）：存下一條要執行的指令在 memory 裡的**位址**
- **IR**（instruction register）：存放從 memory 取回的 32-bit 指令
- **Controller**：根據 IR 裡的指令，送控制訊號給 register file 和 ALU
- **ALU**：做加減和邏輯運算，並輸出 flag 給 controller，例如 Z（結果為 0）、N（結果為負）、V（overflow）

指令和資料一樣都是放在 memory 裡的 0 和 1，差別只在怎麼解讀，這就是 stored-program computer。

### RISC 與 CISC

- **RISC**（reduced instruction set computer）：指令少而規律，每條指令只做簡單的事，例如 RISC-V、MIPS、ARM。手機和平板大多用 ARM
- **CISC**（complex instruction set computer）：指令多，一條指令可以做很複雜的事，例如 x86

不同的硬體有不同的指令集，compiler 要針對目標 ISA 產生機器碼。

## 暫存器

RV64 有 **32 個 general-purpose register**（x0～x31），每個 **64 bits**；PC、IR 則是 special-purpose register。

![[ca-slide-lec2-1-isa-p14.png|RV64 的 32 個暫存器|360]]

- 64 bits 叫 **doubleword**，32 bits 叫 **word**
- 指令一律是 32 bits，暫存器和資料是 64 bits（RV64 的 64 指的是這個）

其他版本：RV32 有 32 個 32-bit 暫存器，RV128 有 32 個 128-bit 暫存器，嵌入式用的 RV32E 只有 16 個 32-bit 暫存器。

暫存器只有 32 個，是因為 **Design principle 2：Smaller is faster**。暫存器越多，硬體越複雜、clock 越慢，指令裡的暫存器編號也要更多 bits。32 個剛好用 5 bits 表示。

### 算術指令

```
add a, b, c        # a = b + c
<op> <rd> <rs1> <rs2>
```

每條算術指令固定是兩個來源、一個目的地，要加三個數就用兩條指令。這是 **Design principle 1：Simplicity favors regularity**：格式規律，硬體就簡單，也比較容易用低成本做到高效能。

C 的 `f = (g + h) - (i + j)`，假設 f、g、h、i、j 分別在 x19～x23：

```
add x5, x20, x21    # x5 = g + h
add x6, x22, x23    # x6 = i + j
sub x19, x5, x6     # f = x5 - x6
```

減法不需要另外做減法器，把減數取 2's complement 再相加即可（見 [[computer_architecture_alu_blog|ALU]]）。

### 暫存器的名字

組合語言裡的暫存器除了寫 x0～x31，也可以寫代表用途的名字（ABI name），例如：

- `zero`（x0）：永遠是 0
- `ra`（x1）：return address
- `sp`（x2）：stack pointer

完整的對照表見 [[computer_architecture_procedure_blog#Procedure call convention|procedure call convention]]。

### 常數（immediate）

程式裡常常出現小常數，每次都從 memory 載入太慢，所以指令可以直接帶一個常數：

```
addi x22, x22, 4    # x22 = x22 + 4
```

這是 **Make the common case fast**。RISC-V 沒有 `subi`，用 `addi` 加負數就好。

### x0 的用途

因為 x0 永遠是 0，有些功能不需要另外做指令：

- `add x22, x20, x0` 就是把 x20 複製到 x22。所以 `mv` 只是 **pseudo-instruction**，assembler 會把它換成 `add` 或 `addi rd, rs, 0`
- `addi x0, x0, 0` 什麼都不做，就是 `nop`。寫進 x0 的值都會被丟掉，`addi x0, x0, 5` 也一樣沒有效果

## 記憶體

暫存器很少，陣列、結構這些資料都放在 memory。運算只能在暫存器上做，所以要先 load 進暫存器，算完再 store 回去。

| | Register | Memory |
| --- | --- | --- |
| 數量 | 32 個 | 非常多 |
| 位址 | 5 bits（$2^5 = 32$） | 64 bits |
| 每個位址存 | 一個 64-bit 的值 | **一個 byte** |

Memory 是 **byte addressed**：每個位址對應一個 byte。一個 doubleword 佔 8 個連續位址，以第一個 byte 的位址當作它的位址；對齊的 doubleword 位址是 8 的倍數，二進位最後三個 bit 都是 0。

![[Pasted image 20250318145349.png|Byte address、word 和 doubleword 的位址]]

暫存器要 64 bits，是因為它要能放下記憶體位址。32 bits 只能定址 $2^{32}$ bytes = 4 GB，現在的記憶體早就超過這個大小。

### Little endian

RISC-V 是 **little endian**：最低位的 byte 放在最小的位址。Big endian 相反，最高位的 byte 放在最小的位址。

![[ca-slide-lec2-1-isa-p25.png|Big endian 與 little endian]]

### ld 與 sd

```
ld x9, 32(x20)    # x9 = Memory[x20 + 32]
sd x9, 32(x20)    # Memory[x20 + 32] = x9
```

位址寫成 `offset(base)`：

$$
\text{Address} = \text{base register} + \text{offset}
$$

Base 可以想成陣列 `A` 的起點（`A[0]` 的位址），offset 是以 byte 為單位的距離。Doubleword 陣列的 `A[i]` 在 `8*i(base)`，所以 offset 32 是 `A[4]`。

其他指令都把目的地寫在最前面，`sd` 卻把來源暫存器寫在前面、記憶體位址寫在後面。這是為了讓 load 和 store 的位址都寫在後面，格式比較一致。

假設 `A` 的起點在 x22、h 在 x21：

```
# g = h + A[8]
ld  x9, 64(x22)       # x9 = A[8]
add x20, x21, x9

# A[9] = h + A[8]
ld  x9, 64(x22)
add x9, x21, x9
sd  x9, 72(x22)       # A[9] = x9
```

### 不同寬度的 load

除了 doubleword，還有 `lw`（word）、`lh`（halfword）、`lb`（byte）。讀進比較窄的資料時，暫存器的高位要補：

- **Sign extension**：複製 sign bit 填滿左邊，用在有號數，例如 `lb`、`lw`
- **Zero extension**：左邊補 0，用在無號數，例如 `lbu`、`lwu`

例如 memory 裡的 byte 是 `0xF7`，`lb` 讀進來是 `0xFFFF...FFF7`（−9），`lbu` 讀進來是 `0x00...00F7`（247）。

這些 load 共用同一個 opcode，靠 funct3 區分：

![[Screenshot 2025-03-25 at 2.26.58 PM.png|各種 load 的 opcode 和 funct3：lb 和 lbu 只差 funct3 的最高位|320]]

## 指令怎麼編碼

每條指令都是 **32 bits**，分成 opcode（哪一類指令）、暫存器編號（各 5 bits）和 immediate 幾個欄位。這篇先看 R、I、S，SB、U、UJ 在 [[computer_architecture_procedure_blog|下一篇]]。

![[Screenshot 2025-03-18 at 11.35.09 AM.png|RISC-V 的六種指令格式]]

### R-format

用在暫存器之間的運算，例如 `add x9, x20, x21`：

![[Screenshot 2025-03-25 at 2.09.46 PM.png|R-format 的欄位]]

| funct7 | rs2 | rs1 | funct3 | rd | opcode |
| --- | --- | --- | --- | --- | --- |
| 7 bits | 5 bits | 5 bits | 3 bits | 5 bits | 7 bits |
| 0 | 21 | 20 | 0 | 9 | 51 |

- opcode 決定指令的類別，funct3、funct7 再區分同一類裡的指令。例如 `add` 和 `sub` 的 opcode、funct3 相同，funct7 只差一個 bit
- 機器碼的欄位順序（rs2、rs1、rd）和組合語言的寫法（rd、rs1、rs2）相反

### I-format

用在帶常數的運算和 load：

```
addi rd, rs1, imm
ld   rd, imm(rs1)
```

| imm[11:0] | rs1 | funct3 | rd | opcode |
| --- | --- | --- | --- | --- |
| 12 bits | 5 bits | 3 bits | 5 bits | 7 bits |

R-format 的 funct7 和 rs2 合併成 12 bits 的 immediate，範圍是 $-2^{11}$～$2^{11}-1$。`addi` 和 `add` 的 opcode 只差一個 bit，硬體上用一個 mux 選第二個運算元是暫存器還是 immediate。

### S-format

用在 store。Store 沒有 rd，但有兩個來源暫存器（base 和要存的值），所以 immediate 拆成兩段，放在原本 rd 和 funct7 的位置：

```
sd rs2, imm(rs1)
```

| imm[11:5] | rs2 | rs1 | funct3 | imm[4:0] | opcode |
| --- | --- | --- | --- | --- | --- |
| 7 bits | 5 bits | 5 bits | 3 bits | 5 bits | 7 bits |

- `rs1`：base address
- `rs2`：要存進 memory 的值
- `sd` 寫入的是 memory 不是暫存器，兩個暫存器都只被讀取，所以都是 source

Immediate 被拆開，但 rs1、rs2 在所有格式裡都在同一個位置，硬體不用等解碼完就能讀暫存器。這是 **Design principle 3：Good design demands good compromises**：多種格式會讓解碼變複雜，但所有指令都能維持 32 bits，格式之間也盡量相似。

## 邏輯與 shift 運算

![[Screenshot 2025-03-25 at 2.33.30 PM.png|邏輯與 shift 指令和 C、Java 運算子的對照]]

NOT 沒有專門的指令，用 `xori rd, rs, -1` 就好。

### Shift

- `sll`：左移，右邊補 0；左移 i bits 等於乘以 $2^i$，比乘法快
- `srl`：**logical** 右移，左邊補 0；等於無號數除以 $2^i$
- `sra`：**arithmetic** 右移，左邊補 sign bit；等於有號數除以 $2^i$。左移不需要分 arithmetic，所以沒有 `sla`

Shift immediate（`slli` 等）是 I-format，但移動量 shamt 用不到 12 bits：RV32 最多移 31 位，5 bits 就夠；RV64 可以移 0～63 位，要 6 bits。剩下的 bits 用來區分 `srli` 和 `srai`。

### AND、OR、XOR 的用途

- **AND** 做 masking：mask 是 1 的位置保留原值，是 0 的位置清成 0
- **OR** 強制設 1：mask 是 1 的位置變成 1，其餘不變
- **XOR** 做 toggle：mask 是 1 的位置翻轉，其餘不變

## 分支與迴圈

- **Conditional branch**：先比較，條件成立才跳
- **Unconditional jump**：直接跳

```
beq  rs1, rs2, L1    # if (rs1 == rs2) goto L1
bne  rs1, rs2, L1    # if (rs1 != rs2) goto L1
blt  rs1, rs2, L1    # if (rs1 <  rs2) goto L1（有號數）
bge  rs1, rs2, L1    # if (rs1 >= rs2) goto L1（有號數）
bltu rs1, rs2, L1    # 無號數比較
bgeu rs1, rs2, L1
```

**Label** 就是一個記憶體位址，組合語言裡用名字代替數字比較好讀，由 assembler 換算（實際編進指令的是相對於 PC 的距離，見 [[computer_architecture_procedure_blog#Branch 與 jump 的定址|下一篇]]）。

有號和無號的比較結果可能不同。例如 x22 = `0xFF...FF`、x23 = 1：`blt` 把 x22 當成 −1，條件成立；`bltu` 把 x22 當成很大的正數，條件不成立。

### if-else

```c
if (i == j) f = g + h;
else        f = g - h;
```

f、g、h、i、j 在 x19～x23：

```
      bne x22, x23, Else    # i != j 就跳去 Else
      add x19, x20, x21     # f = g + h
      beq x0, x0, Exit      # x0 == x0 一定成立，等於無條件跳躍
Else: sub x19, x20, x21     # f = g - h
Exit:
```

條件要反過來寫：C 是相等時做 add，組合語言是不相等時跳過 add。

### while 迴圈

```c
while (save[i] == k) i += 1;
```

i 在 x22、k 在 x24、`save` 的起點在 x25：

```
Loop: slli x10, x22, 3     # x10 = i * 8（doubleword 的 byte offset）
      add  x10, x10, x25   # x10 = save[i] 的位址
      ld   x9, 0(x10)      # x9 = save[i]
      bne  x9, x24, Exit   # save[i] != k 就離開
      addi x22, x22, 1     # i += 1
      beq  x0, x0, Loop
Exit:
```

陣列的 index 要乘以 8 才是 byte offset，這裡用左移 3 位代替乘法。

### Basic block

**Basic block** 是一段連續的指令，除了最後一條以外沒有 branch，除了第一條以外也不會是跳躍的目標。Basic block 裡的指令一定會一起執行，所以 compiler 和硬體常以它為單位做最佳化。
