---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: ALU、乘法器與除法器
date: '2025-03-20'
updated: '2026-10-17 21:18:49'
tags:
  - Computer Architecture
  - Arithmetic
summary: 從 1-bit ALU 疊出 64-bit ALU：怎麼用 Ainvert / Bnegate 做出減法和 NOR、怎麼偵測 overflow 和 zero、slt 怎麼借用 sign bit；接著是 shift-and-add 乘法器和 restoring 除法器，從直觀版本優化到只用一個 64-bit ALU。
permalink: notes/ca-alu/
synced: obsidian
---

這篇先用 64 個 1-bit ALU 組出 64-bit ALU，再看乘法和除法怎麼用加法器和 shift 做出來。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## ALU 要支援什麼

RISC-V 的整數指令會用到 ALU 的這幾種運算：

![[Screenshot 2025-03-20 at 10.36.15 AM.png|ALU 的輸入、輸出和 ALUctr 的編碼]]

| ALUctr | 運算 | 用到的指令 |
| --- | --- | --- |
| 0000 | AND | `and`, `andi` |
| 0001 | OR | `or`, `ori` |
| 0010 | add | `add`, `addi`, `ld`, `sd`（算位址） |
| 0110 | sub | `sub`, `beq`, `bne`, `blt`, `bge`（比較） |
| 0111 | set-less-than | `slt`, `sltu`, `slti`, `sltiu` |
| 1100 | NOR | — |

A、B 和 Result 都是 64 bits，另外輸出兩個 flag 給 controller：

- **V**（overflow）：結果溢位
- **Z**（zero）：結果為 0。`beq x21, x22, L1` 就是算 x21 − x22，再看 Z 是否為 1

`slt x9, x21, x22`：x21 < x22 時 x9 = 1，否則 x9 = 0。

## 1-bit ALU

64-bit ALU 由 64 個 1-bit ALU 串成（bit-slice），每個處理一個 bit，carry 逐級往高位傳，和 ripple-carry adder 一樣。

![[Screenshot 2025-03-20 at 10.39.59 AM.png|64 個 1-bit ALU 串成 64-bit ALU]]

最基本的 1-bit ALU 有 AND、OR 和一個 full adder，由 mux 選出結果：

![[Screenshot 2025-03-20 at 10.41.30 AM.png|1-bit ALU]]

ALUctr 的 4 個 bits 分成三組：

- **ALUctr[3]（Ainvert）**：a 要不要先反相
- **ALUctr[2]（Bnegate）**：b 要不要先反相
- **ALUctr[1:0]（Operation）**：輸出 mux 選哪一個：00 AND、01 OR、10 加法器、11 Less

用這幾個控制訊號組合出所有運算：

- **減法**：$a - b = a + \bar{b} + 1$。Bnegate = 1 讓 b 反相（1's complement），最低位（bit 0）的 CarryIn 再加 1，就是 2's complement。所以 bit 0 的 CarryIn 直接接到 Bnegate

![[Screenshot 2025-03-20 at 10.45.35 AM.png|加上 Bnegate 做減法]]

![[Screenshot 2025-03-30 at 12.48.42 PM.png|最低位的 ALU：Bnegate 同時接到 CarryIn]]

- **NOR**：$\overline{a + b} = \bar{a} \cdot \bar{b}$（De Morgan），所以 Ainvert = 1、Bnegate = 1 再選 AND 就是 NOR，不用另外做 NOR 閘。這也解釋了 ALUctr 的編碼：sub 是 0110，NOR 是 1100

![[Screenshot 2025-03-30 at 12.51.49 PM.png|加上 Ainvert 做 NOR]]

考試常出變化題：要 ALU 多支援一種運算，就用反相和現有的閘組出來。

## 64-bit ALU

### Overflow

兩個正數相加得到負數，或兩個負數相加得到正數，就是 overflow。從最高位來看：

- 兩個輸入的 sign bit 都是 0、輸出是 1：進入 bit 63 的 carry 是 1，出去的是 0
- 兩個輸入的 sign bit 都是 1、輸出是 0：進入的 carry 是 0，出去的是 1

所以比較最高位的 carry in 和 carry out 就知道有沒有 overflow：

$$
V = C_{\text{in},63} \oplus C_{\text{out},63}
$$

![[Screenshot 2025-03-30 at 12.49.23 PM.png|Overflow 偵測（以 4 bits 為例）]]

### Zero

把 64 個 Result bit 接到一個 NOR：只要有一個 bit 是 1，輸出就是 0；全部為 0 時輸出才是 1。

![[Screenshot 2025-03-30 at 12.55.24 PM.png|Zero 偵測]]

### Set-less-than

$a < b$ 等於 $a - b < 0$，也就是 $a - b$ 的 sign bit 為 1。做法是：

- 讓 ALU 做減法（Bnegate = 1）
- 把 **bit 63 加法器的輸出**拉出來（叫 Set），接回 **bit 0 的 Less 輸入**。注意不是 bit 63 的 Result，因為 Result 已經被 mux 選成 Less
- 其他 63 個 bit 的 Less 都接 0

Operation 選 11 時，Result 就是 `000...0` 或 `000...1`。（如果減法 overflow，sign bit 會是錯的，完整的設計還要用 V 修正。）

![[Screenshot 2025-03-20 at 11.03.37 AM.png|完整的 64-bit ALU：Set 接回 ALU0 的 Less]]

## 乘法

$$
\text{Multiplicand} \times \text{Multiplier} = \text{Product}
$$

二進位的直式乘法：乘數的某一位是 1，就把被乘數左移到對應位置後加進去；是 0 就不加。m bits 乘 n bits 的結果最多 m + n bits，所以 64 × 64 要 128 bits。

### 直觀版本

| | Multiplicand | Multiplier | Product |
| --- | --- | --- | --- |
| 大小 | 128 bits（起初放在右半） | 64 bits | 128 bits |
| 每一輪 | 左移 1 bit | 右移 1 bit | 看 multiplier 的最低位決定要不要加 |

每一輪看 multiplier 的最低位，是 1 就把 multiplicand 加到 product；接著 multiplicand 左移、multiplier 右移，總共 64 輪。

![[Screenshot 2025-03-30 at 1.04.38 PM.png|直觀的乘法器]]

![[Screenshot 2025-03-30 at 1.09.48 PM.png|用 4 bits 算 2 × 3|360]]

Multiplicand 要左移 64 次，所以需要 128-bit 的暫存器和 **128-bit 的 ALU**，但每次相加時有一半都是 0，很浪費。

### 優化版本

讓 product 往右移，效果和 multiplicand 往左移一樣。

![[Screenshot 2025-03-30 at 1.14.39 PM.png|優化的乘法器：multiplier 放在 product 的右半]]

- Multiplicand 固定 64 bits，ALU 也只要 64 bits，每次加到 product 的**高 64 bits**
- Product register 每輪右移 1 bit。右半一開始沒有用到，所以把 **multiplier 放在 product 的右半**：每右移一次，multiplier 用過的 bit 被推出去，空出的位置剛好給 product
- Product register 有 129 bits，多出的一個 bit 存加法的 carry out

每一輪：

1. Product 的最低位（multiplier 目前這一位）是 1，就把 multiplicand 加到 product 的高 64 bits
2. 整個 product register 右移 1 bit

| | 直觀版本 | 優化版本 |
| --- | --- | --- |
| Multiplicand | 每輪左移 | 不動 |
| Multiplier | 每輪右移，移出的 bit 決定要不要加 | 放在 product 右半，和 product 一起右移 |
| Product | 不動 | 每輪右移 |
| ALU | 128 bits | 64 bits |

一輪一個 clock，乘一次大約 64 個 clock，比加法慢很多。

用 4 bits 算 $2 \times 3$：

![[Screenshot 2025-03-30 at 1.17.25 PM.png|優化版本算 2 × 3：紅色是 product，綠色是還沒用到的 multiplier|360]]

### 乘法指令

128-bit 的結果放不進一個暫存器，所以分成兩條指令：

- `mul`：結果的低 64 bits
- `mulh`、`mulhu`、`mulhsu`：結果的高 64 bits（有號 × 有號、無號 × 無號、有號 × 無號）

`mulh` 和 `mul` 緊接著出現、運算元又相同時，硬體可以只乘一次，把高低兩半分別寫進兩個暫存器，這叫 **fusion**。

## 除法

$$
\text{Dividend} = \text{Quotient} \times \text{Divisor} + \text{Remainder}
$$

二進位長除法的每一步只有兩種情況：夠減，商是 1；不夠減，商是 0。硬體的判斷方法是**直接減，再看 sign bit**：

- 結果 ≥ 0：夠減，保留相減的結果，商補 1
- 結果 < 0：不夠減，把 divisor 加回去（restoring），商補 0

### 直觀版本

| | Divisor | Remainder | Quotient |
| --- | --- | --- | --- |
| 大小 | 128 bits（起初放在左半） | 128 bits（起初放 dividend） | 64 bits |
| 每一輪 | 右移 1 bit | 減掉 divisor，看 sign bit | 左移，補上這一位的商 |

![[Screenshot 2025-04-07 at 1.41.47 PM 1.png|直觀的除法器]]

![[Screenshot 2025-04-07 at 1.44.37 PM 1.png|直觀版本的步驟：用 4 bits 算 7 ÷ 2]]

和乘法一樣，divisor 要右移，需要 128-bit 的 ALU，每次也有一半是浪費的。

### 優化版本

![[Screenshot 2025-03-30 at 1.34.19 PM.png|優化的除法器：dividend 放在 remainder register 的右半]]

- Divisor 固定 64 bits，ALU 也只要 64 bits，每次和 remainder register 的**左半**相減
- Remainder register 每輪左移。Dividend 一開始放在右半，每左移一次右邊就空出一個位置，用來放這一輪的商，所以不需要 quotient register
- 結束時左半是 remainder、右半是 quotient。最後一輪多左移了一次，所以左半要再右移 1 bit

用 4 bits 算 $7 \div 2$，結果商是 0011 = 3，餘數是 0001 = 1：

![[Screenshot 2025-03-30 at 1.38.37 PM.png|優化版本算 7 ÷ 2]]

### 有號數的除法

先用絕對值除，再調整正負號：

- 餘數的正負號跟 dividend 相同
- Dividend 和 divisor 的正負號不同時，商取負號

例如 $-7 \div 2 = -3$ 餘 $-1$，$-7 \div -2 = 3$ 餘 $-1$。這樣一定滿足 $\text{Dividend} = \text{Quotient} \times \text{Divisor} + \text{Remainder}$，而且商的大小不會因為正負號而改變。

### 除法指令

- `div` / `divu`：有號 / 無號的商
- `rem` / `remu`：有號 / 無號的餘數

相鄰的 `div` 和 `rem` 一樣可以 fusion 成一次除法。RISC-V 除以 0 不會產生 exception，要由軟體檢查。
