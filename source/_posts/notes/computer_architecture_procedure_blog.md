---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: RISC-V 的函式呼叫：jal、jalr、stack 與 calling convention
date: '2025-03-11'
updated: '2026-10-17 21:17:53'
tags:
  - Computer Architecture
  - ISA
summary: 函式呼叫在組合語言裡怎麼做：jal / jalr 跳過去再跳回來、stack 保存暫存器、caller-saved 與 callee-saved 的分工、遞迴函式；接著是 lui 載入大常數、SB / UJ 格式的 PC-relative 定址，最後是程式從 C 到執行檔的流程。
permalink: notes/ca-procedure/
synced: obsidian
---

接續 [[computer_architecture_isa_blog|上一篇]]，這篇是函式呼叫：怎麼跳到函式、傳參數、再跳回來，以及暫存器不夠用時怎麼用 stack。後半是剩下的指令格式和定址方式。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## 呼叫一個函式要做的事

呼叫的一方叫 **caller**，被呼叫的函式叫 **callee**。整個流程是：

1. Caller 把參數放進暫存器 x10～x17（a0～a7）
2. Caller 跳到函式的開頭，同時把回來的位址（return address）存在 x1（ra）
3. Callee 在 stack 上配置需要的空間
4. Callee 執行函式本體
5. Callee 把回傳值放在 x10（a0）
6. Callee 跳回 x1 存的位址

Caller 和 callee 盡量用暫存器傳遞資料，因為暫存器最快。用到的暫存器要先備份、事後還原，讓 caller 察覺不到 callee 改過暫存器。

函式名稱（例如 `sum`）在組合語言裡是一個 label，代表函式第一條指令的位址。

## jal 與 jalr

### jal：跳到函式

```
jal x1, ProcedureLabel
```

- 把 PC + 4（下一條指令的位址）存進 x1
- 跳到 `ProcedureLabel`

目標是相對於 PC 的距離，編在指令裡（見後面的 [[#Branch 與 jump 的定址|UJ-format]]）。函式呼叫很常見，所以有一條專門的指令，這也是 make the common case fast。

### jalr：跳到暫存器裡的位址

```
jalr x1, 100(x20)
```

- 一樣把 PC + 4 存進 x1
- 跳到 x20 + 100

`jalr` 的目標是暫存器的值加上 offset，執行時才決定。改變 x20 的內容就能跳到不同函式，例如 C 的 function pointer 或 `switch` 的跳躍表。

| | `jal x1, 100` | `jalr x1, 100(x5)` |
| --- | --- | --- |
| 全名 | jump and link | jump and link register |
| 存 return address | x1 = PC + 4 | x1 = PC + 4 |
| 跳到 | PC + 100 | x5 + 100 |
| 格式 | UJ | I |

`jal` 和 branch 一樣，目標都是相對於 PC 的位置；`jalr` 則是相對於某個暫存器。

### 回到 caller

```
jalr x0, 0(x1)
```

跳回 x1 存的 return address。回去時不需要再記錄 return address，所以 rd 用 x0，把 PC + 4 丟掉。

同理，`jal x0, Label` 是不記錄回程的無條件跳躍，pseudo-instruction `j Label` 就是它。

## 用 stack 保存暫存器

暫存器只有 32 個，callee 很可能會用到 caller 正在用的暫存器。所以 callee 使用前先把舊值存到 memory，用完再還原。存放的地方是 **stack**：後放進去的先拿出來，正好符合函式一層一層呼叫的順序。

Stack pointer `sp`（x2）指向 stack 的頂端。Stack 從高位址往低位址長，push 時先減 sp 再存，pop 時先讀回再加 sp：

```
# push x10
addi sp, sp, -8
sd   x10, 0(sp)

# pop x10
ld   x10, 0(sp)
addi sp, sp, 8
```

### 程式在 memory 中的配置

![[ca-slide-lec2-2-procedure-p17.png|程式在 memory 中的配置|420]]

- **Text**：程式碼
- **Static data**：全域變數、C 的 static 變數、常數陣列和字串。Global pointer `gp`（x3）指在這一段附近，用 ±offset 存取
- **Dynamic data（heap）**：C 的 `malloc()` / `free()`、Java 的 `new`
- **Stack**：自動配置的空間，例如區域變數和保存的暫存器

Stack 往下長、heap 往上長，共用中間的空間。

### 例子：leaf procedure

```c
long long int leaf_example(long long int g, long long int h,
                           long long int i, long long int j) {
    long long int f;
    f = (g + h) - (i + j);
    return f;
}
```

參數 g、h、i、j 在 x10～x13，compiler 把 f 放在 x20，暫存值用 x5、x6，回傳值放在 x10。如果 callee 保存所有用到的暫存器：

```
leaf_example:
    addi sp, sp, -24     # 在 stack 上留 3 個 doubleword
    sd   x5, 16(sp)
    sd   x6, 8(sp)
    sd   x20, 0(sp)
    add  x5, x10, x11    # x5 = g + h
    add  x6, x12, x13    # x6 = i + j
    sub  x20, x5, x6     # f = x5 - x6
    addi x10, x20, 0     # 回傳值放進 x10
    ld   x20, 0(sp)      # 還原
    ld   x6, 8(sp)
    ld   x5, 16(sp)
    addi sp, sp, 24
    jalr x0, 0(x1)       # 回到 caller
```

![[ca-slide-lec2-2-procedure-p21.png|leaf_example 執行前、中、後的 stack]]

### Procedure call convention

每次都保存所有用到的暫存器太浪費，所以 RISC-V 約定好哪些暫存器由誰保存：

| Register | ABI name | 用途 | 誰保存 |
| --- | --- | --- | --- |
| x0 | zero | 永遠是 0 | — |
| x1 | ra | Return address | Caller |
| x2 | sp | Stack pointer | Callee |
| x3 | gp | Global pointer | — |
| x4 | tp | Thread pointer | — |
| x5 | t0 | 暫存值 / 備用的 link register | Caller |
| x6～x7 | t1～t2 | 暫存值 | Caller |
| x8 | s0 / fp | Saved register / frame pointer | Callee |
| x9 | s1 | Saved register | Callee |
| x10～x11 | a0～a1 | 參數 / 回傳值 | Caller |
| x12～x17 | a2～a7 | 參數 | Caller |
| x18～x27 | s2～s11 | Saved registers | Callee |
| x28～x31 | t3～t6 | 暫存值 | Caller |

- **Callee-saved**（s0～s11、sp）：callee 要用就得先存起來，返回前還原。Caller 可以假設呼叫完後這些值不變
- **Caller-saved**（t0～t6、a0～a7、ra）：callee 可以直接覆蓋。Caller 呼叫完還要用的話，要自己先存起來

所以上面的 `leaf_example` 不用保存 x5、x6，它們是 temporaries，只有 x20（s4）要存。只備份需要的暫存器，可以省下很多 load / store。

### 遞迴：non-leaf procedure

不呼叫其他函式的叫 **leaf procedure**，會呼叫其他函式（包括自己）的叫 **non-leaf procedure**。Non-leaf 呼叫別的函式時，ra 和參數暫存器會被蓋掉，所以要先存起來。

```c
long long int fact(long long int n) {
    if (n < 1) return 1;
    else       return n * fact(n - 1);
}
```

```
fact: addi sp, sp, -16    # 在 stack 上留兩格
      sd   x1, 8(sp)      # 存 return address
      sd   x10, 0(sp)     # 存參數 n
      addi x5, x10, -1    # x5 = n - 1
      bge  x5, x0, L1     # n - 1 >= 0（也就是 n >= 1）就跳到 L1
      addi x10, x0, 1     # 否則回傳 1
      addi sp, sp, 16     # pop，值沒被改過，不用還原
      jalr x0, 0(x1)      # 回到 caller
L1:   addi x10, x10, -1   # 參數改成 n - 1
      jal  x1, fact       # 呼叫 fact(n - 1)
      addi x6, x10, 0     # x6 = fact(n - 1) 的回傳值
      ld   x10, 0(sp)     # 還原這一層的 n
      ld   x1, 8(sp)      # 還原這一層的 return address
      addi sp, sp, 16     # pop
      mul  x10, x10, x6   # 回傳 n * fact(n - 1)
      jalr x0, 0(x1)      # 回到 caller
```

寫遞迴的步驟：

- 找出呼叫完別的函式後還要用的值（這裡是 ra 和 n），在開頭 push 到 stack
- 呼叫完要用這些值時，先從 stack load 回來，最後 pop
- Base case 沒有呼叫別的函式，暫存器沒被改過，不用還原，但 sp 還是要加回去

![[ca-slide-lec2-2-procedure-p14.png|fact 遞迴時 stack 的變化]]

### Procedure frame

每個還沒結束的函式在 stack 上都有自己的工作空間，叫 **procedure frame**（activation record），放保存的暫存器、ra 和區域變數。Compiler 知道每個 frame 的大小，會在函式開頭產生配置 frame 的指令。函式執行時 sp 可能會變，所以有時另外用 frame pointer `fp`（x8）指著 frame 的起點，讓區域變數的 offset 固定。

![[Screenshot 2025-03-18 at 10.26.46 AM.png|呼叫前、呼叫中、呼叫後的 stack；(b) 是 procedure frame]]

## 處理字元：byte 的 load / store

字元（ASCII）只有一個 byte，不用每次搬 64 bits，用 byte 版本的 load / store 即可：

- `lb` / `lbu`：載入一個 byte，分別做 sign extension / zero extension
- `lh` / `lhu`、`lw` / `lwu`：halfword、word
- `sb`、`sh`、`sw`：存最低的 1、2、4 bytes

C 的 `strcpy`：

```c
void strcpy(char x[], char y[]) {
    size_t i = 0;
    while ((x[i] = y[i]) != '\0')
        i += 1;
}
```

x 的起點在 x10、y 在 x11，i 放在 x19：

```
strcpy: addi sp, sp, -8
        sd   x19, 0(sp)       # x19 是 callee-saved，先存起來
        add  x19, x0, x0      # i = 0
L1:     add  x5, x19, x11     # x5 = &y[i]
        lbu  x6, 0(x5)        # x6 = y[i]
        add  x7, x19, x10     # x7 = &x[i]
        sb   x6, 0(x7)        # x[i] = y[i]
        beq  x6, x0, L2       # 讀到 '\0' 就結束
        addi x19, x19, 1      # i += 1
        jal  x0, L1
L2:     ld   x19, 0(sp)
        addi sp, sp, 8
        jalr x0, 0(x1)
```

和 doubleword 陣列不同，這裡 index 不用乘以 8，因為每個字元只佔一個 byte。

## 大常數：lui

`addi` 的 immediate 只有 12 bits。要放 32-bit 的常數，先用 `lui`（load upper immediate）放高 20 bits，再用 `addi` 加上低 12 bits：

```
lui rd, imm20    # rd = imm20 << 12（並做 sign extension 到 64 bits）
```

例如要把 `0x003D0500` 放進 x19：高 20 bits 是 `0x003D0` = 976，低 12 bits 是 `0x500` = 1280。

```
lui  x19, 976        # x19 = 0x003D0000
addi x19, x19, 1280  # x19 = 0x003D0500
```

要注意 `addi` 的 immediate 會 sign extension。低 12 bits 的最高位是 1（`0x800` 以上）時，加上去的其實是負數，`lui` 的部分要多加 1 補回來。Pseudo-instruction `li` 會自動處理。

`lui` 用的是 **U-format**，只有 rd 和 20 bits 的 immediate：

![[Screenshot 2025-03-18 at 10.48.51 AM.png|U-format]]

## Branch 與 jump 的定址

Branch 存的不是絕對位址，而是**相對於目前 PC 的距離**（PC-relative addressing）：

- 程式載入到 memory 的哪裡都能執行，不用改機器碼
- 大部分 branch 的目標都在附近（迴圈、if-else），不需要完整的位址

### SB-format

用在 `beq`、`bne` 這類條件分支：

| imm[12] | imm[10:5] | rs2 | rs1 | funct3 | imm[4:1] | imm[11] | opcode |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 bit | 6 bits | 5 bits | 5 bits | 3 bits | 4 bits | 1 bit | 7 bits |

![[Screenshot 2025-03-18 at 10.57.15 AM.png|SB-format 和 beq 的編碼例子]]

- 欄位和 S-format 幾乎一樣，rs1、rs2 在原來的位置
- Immediate 存 imm[12:1]，**不存 imm[0]**：目標位址一定是偶數，最低位一定是 0，不用浪費一個 bit，範圍也因此多一倍
- 目標位址 = PC + sign-extend(imm[12:1] × 2)，範圍約 ±4 KiB
- Immediate 的各段看起來很亂，是為了讓每個 bit 在不同格式中盡量在同一個位置，產生 immediate 的硬體比較簡單；sign bit 一律在 bit 31

為什麼是 2 的倍數而不是 4？一般指令是 32 bits，位址一定是 4 的倍數，但 RISC-V 有 C extension（compressed），可以把常用指令壓成 16 bits，例如 `c.add x10, x11` 等於 `add x10, x10, x11`。有 16-bit 指令時，位址只保證是 2 的倍數，所以只省掉最低的 1 個 bit。

例如下面的迴圈，`bne` 往前跳到 Exit 是 +12 bytes，迴圈尾的 `beq` 跳回 Loop 是 −20 bytes，編進指令的 immediate 是除以 2 之後的 +6 和 −10。

![[Screenshot 2025-03-18 at 11.31.19 AM.png|迴圈裡 bne 和 beq 的 offset]]

### UJ-format

用在 `jal`：

![[Screenshot 2025-03-18 at 11.25.10 AM.png|UJ-format 和 jal 的編碼例子]]

- rd = PC + 4，PC = PC + sign-extend(imm[20:1] × 2)
- 20 bits 的 immediate 乘以 2，範圍約 ±1 MiB

要跳到更遠的地方（例如任意 32-bit 位址），先用 `lui` 把位址的 [31:12] 放進暫存器，再用 `jalr` 加上 [11:0] 跳過去。

### RISC-V 的定址方式

1. **Immediate addressing**：運算元就是指令裡的常數，例如 `addi`
2. **Register addressing**：運算元在暫存器裡，例如 `add`
3. **Base addressing**：位址 = 暫存器 + offset，例如 `ld`、`sd`
4. **PC-relative addressing**：位址 = PC + offset，例如 branch、`jal`

![[Screenshot 2025-03-25 at 6.54.27 PM.png|RISC-V 的指令格式總表]]

## 從 C 到執行

```
C program → (compiler) → assembly → (assembler) → object file（machine code）
          → (linker) → executable → (loader) → memory
```

- **Assembler** 除了翻成機器碼，還會展開 **pseudo-instruction**：`li`、`mv`、`j`、`nop` 寫起來方便，但硬體沒有這些指令，assembler 會換成真正的指令，例如 `mv x10, x11` 換成 `addi x10, x11, 0`
- **Linker** 把多個 object file 和用到的 library 接起來，補上彼此之間的位址
	- **Static linking**：把用到的 library 函式複製進執行檔
	- **Dynamic linking**：執行檔不含 library，第一次呼叫時才連結；執行檔比較小，library 更新也不用重新編譯
- **Loader** 把執行檔載入 memory、設定暫存器，再跳到程式開頭

## 其他指令與 extension

- `auipc rd, imm`：rd = PC + (imm << 12)，搭配 `jalr` 可以做 PC-relative 的遠距跳躍
- `slt`、`sltu`、`slti`、`sltiu`：set less than，比較結果寫成 0 或 1
- `addw`、`subw`、`addiw`、`sllw`、`srlw`、`sraw`…：只對低 32 bits 運算，結果 sign-extend 成 64 bits

RISC-V 是模組化的設計，基本指令集加上各種 extension：

- **I**：基本整數指令（RV64I 有 51 條）
- **M**：整數乘、除、餘數
- **A**：atomic memory operation
- **F** / **D**：單精度 / 雙精度浮點數（見 [[computer_architecture_fp_blog|浮點數]]）
- **C**：16-bit 的 compressed 指令

IMAFD 合起來叫 **G**（general），所以 RV64IMAFD 也寫成 RV64G。
