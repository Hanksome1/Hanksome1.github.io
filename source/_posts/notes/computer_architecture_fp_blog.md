---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 浮點數：IEEE 754、運算與 rounding
date: '2025-03-30'
updated: '2026-10-17 21:19:28'
tags:
  - Computer Architecture
  - Arithmetic
summary: IEEE 754 浮點數怎麼表示：sign、biased exponent、hidden 1 的 fraction，以及 denormal、infinity、NaN 這些特殊值；浮點加法和乘法的步驟、RISC-V 的 F / D extension 指令，還有 guard / round / sticky bit 怎麼做 round to even。
permalink: notes/ca-fp/
synced: obsidian
---

整數的範圍有限。要表示很大或很小的數（例如 $6.02 \times 10^{23}$ 或 $1.6 \times 10^{-19}$），就要像科學記號一樣另外存一個指數。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## 二進位的科學記號

$$
\pm 1.\text{xxxxx}_2 \times 2^{\text{yyyy}}
$$

- **Significand**（mantissa）：前面的 $1.\text{xxxxx}$，決定精度
- **Exponent**：$2^{\text{yyyy}}$，決定大小範圍
- 二進位的小數點叫 binary point

![[Screenshot 2025-03-30 at 1.57.20 PM.png|二進位的科學記號|360]]

Normalized 的寫法規定小數點前只有一位非零的數字。二進位裡非零只能是 1，所以這個 1 不用存，叫 **hidden 1**，等於多一個 bit 的精度。

## IEEE 754 格式

![[Screenshot 2025-03-30 at 2.06.34 PM.png|IEEE 754 的格式]]

$$
x = (-1)^{S} \times (1 + \text{Fraction}) \times 2^{\text{Exponent} - \text{Bias}}
$$

| | Sign | Exponent | Fraction | Bias |
| --- | --- | --- | --- | --- |
| Single（FP32） | 1 bit | 8 bits | 23 bits | 127 |
| Double（FP64） | 1 bit | 11 bits | 52 bits | 1023 |

- **S**：0 是正、1 是負
- **Fraction**：significand 去掉 hidden 1 之後的部分，所以 $1 \le 1 + \text{Fraction} < 2$
- **Exponent**：存的是加上 bias 之後的值

### 為什麼 exponent 要加 bias

目的是讓浮點數可以直接用整數比較器比大小：sign 相同時 exponent 大的數比較大，所以 exponent 放在 fraction 前面。如果 exponent 用 2's complement，負的指數最高位是 1，看起來反而比較大。加上 bias 之後指數都變成無號數，最小是 `0000 0001`、最大是 `1111 1110`，可以直接比較。

![[Screenshot 2025-03-30 at 2.15.52 PM.png|單精度的 bias 是 127]]

- 存進去：$\text{Exponent} = \text{實際的指數} + 127$
- 讀出來：$\text{實際的指數} = \text{Exponent} - 127$

全 0（`0000 0000`）和全 1（`1111 1111`）保留給特殊值，所以單精度的實際指數是 −126～+127，可以表示的大小大約是 $1.2 \times 10^{-38}$ 到 $3.4 \times 10^{38}$。比最小值更接近 0 叫 **underflow**，比最大值還大叫 **overflow**。

![[Screenshot 2025-03-30 at 2.21.41 PM.png|可表示的範圍，兩端以外是 overflow，0 附近是 underflow]]

### 例子：−0.75

$$
-0.75 = -0.11_2 = -1.1_2 \times 2^{-1}
$$

- S = 1
- Exponent = −1 + 127 = 126 = `0111 1110`
- Fraction = `1000 0000 ... 0`（hidden 1 不存）

```
1 01111110 10000000000000000000000
```

從 bits 讀回數值時，把 exponent 當無號數讀出來減掉 127，再補回 hidden 1。

### 間距不是均勻的

Fraction 的位數固定，每個指數區間（例如 [1, 2)、[2, 4)）裡能表示的數一樣多。區間每大一倍，間距也大一倍，所以靠近 0 的地方很密，數字越大越稀疏。

![[Screenshot 2025-03-30 at 2.02.34 PM.png|浮點數在數線上的分布]]

## 特殊值

| Exponent | Fraction | 代表 | 值 |
| --- | --- | --- | --- |
| 0 | 0 | ±0 | 0 |
| 0 | ≠ 0 | denormal | $(-1)^S \times (0 + \text{Fraction}) \times 2^{1 - \text{Bias}}$ |
| 1～254 | 任意 | normal | $(-1)^S \times (1 + \text{Fraction}) \times 2^{\text{Exponent} - \text{Bias}}$ |
| 255（全 1） | 0 | ±∞ | ∞ |
| 255（全 1） | ≠ 0 | NaN | NaN |

（表中是單精度；雙精度的全 1 是 2047。）

![[Screenshot 2025-03-30 at 2.32.33 PM.png|IEEE 754 各種值的整理]]

### Denormal number

最小的 normal 數是 $1.0 \times 2^{-126}$，它和 0 之間有一大段空隙。Exponent 全 0 時改用 **hidden 0**，讓數值可以逐漸變小到 0（gradual underflow）：

$$
x = (-1)^S \times (0 + \text{Fraction}) \times 2^{1 - \text{Bias}}
$$

指數是 $1 - \text{Bias}$（單精度是 −126），**不是** $0 - \text{Bias}$。這樣 denormal 的間距剛好接上最小的 normal 區間，交界處不會跳一段。

![[Screenshot 2025-03-30 at 2.28.34 PM.png|最小的 normal 數和 denormal 數]]

### Infinity 與 NaN

- **±∞**：例如除以 0。把它當成合法的值，後面還能繼續運算，例如 $X/0 > Y$ 仍然是有意義的比較
- **NaN**（not a number）：例如 $\sqrt{-4}$ 或 $0/0$。任何和 NaN 的運算結果都是 NaN，debug 時容易追到出錯的地方

![[Screenshot 2025-03-30 at 2.30.55 PM.png|Infinity：exponent 全 1、fraction 全 0]]

## 浮點運算

### 加法

以 4 位有效數字的十進位為例，$9.999 \times 10^{1} + 1.610 \times 10^{-1}$：

1. **對齊小數點**：把指數小的那個往右移，$1.610 \times 10^{-1} = 0.01610 \times 10^{1}$
2. **Significand 相加**：$9.999 + 0.01610 = 10.01510$
3. **Normalize**，檢查 overflow / underflow：$1.001510 \times 10^{2}$
4. **Round**，必要時再 normalize：$1.002 \times 10^{2}$

二進位的做法一樣。硬體上需要比較指數的小 ALU、把較小的數右移的 shifter、significand 的加法器，以及 normalize 用的 shifter 和 rounding 電路。

![[Screenshot 2025-03-30 at 2.35.55 PM.png|浮點加法器]]

### 乘法

1. **指數相加**：兩個 biased exponent 相加會多算一次 bias，要減掉一個，$(e_1 + 127) + (e_2 + 127) - 127 = (e_1 + e_2) + 127$
2. **Significand 相乘**
3. **Normalize**，檢查 overflow / underflow
4. **Round**，必要時再 normalize
5. **決定正負號**：兩個 sign bit 做 XOR

浮點乘法器的複雜度和浮點加法器差不多，不像整數乘法比加法複雜很多，因為浮點加法也要對齊和 normalize。

## RISC-V 的浮點指令

浮點數有另一組 32 個 **FP register**（f0～f31，每個 64 bits），浮點指令只操作它們。分開之後暫存器數量加倍，指令裡的暫存器欄位不用變長，整數和浮點的硬體也能分開設計。

- **F extension**（單精度）的指令以 `.s` 結尾，**D extension**（雙精度）以 `.d` 結尾
- Load / store：`flw`、`fsw`、`fld`、`fsd`
- 算術：`fadd.s`、`fsub.s`、`fmul.s`、`fdiv.s`、`fsqrt.s`，以及對應的 `.d`
- 比較：`feq.s`、`flt.s`、`fle.s`，結果是 0 或 1，寫進**整數**暫存器，再用 `beq` / `bne` 分支

```
feq.d x5, f0, f1    # x5 = (f0 == f1) ? 1 : 0
```

- **Fused multiply-add**：`fmadd.s rd, rs1, rs2, rs3` 算 $rs1 \times rs2 + rs3$，一條指令有三個來源。矩陣乘法裡都是乘加，用這條指令快很多，中間結果也只 round 一次

![[Screenshot 2025-04-02 at 8.42.34 PM 1.png|Fused multiply-add 指令和格式]]

### 例子：華氏轉攝氏

```c
float f2c(float fahr) {
    return ((5.0 / 9.0) * (fahr - 32.0));
}
```

```
f2c: flw    f0, const5(x3)    # f0 = 5.0f
     flw    f1, const9(x3)    # f1 = 9.0f
     fdiv.s f0, f0, f1        # f0 = 5.0f / 9.0f
     flw    f1, const32(x3)   # f1 = 32.0f
     fsub.s f10, f10, f1      # f10 = fahr - 32.0
     fmul.s f10, f0, f10      # f10 = (5/9) * (fahr - 32)
     jalr   x0, 0(x1)         # return
```

參數 `fahr` 和回傳值都在 f10。常數 5.0、9.0、32.0 事先放在 static data 區，`const5` 等是它們相對於 gp（x3）的 offset。

### 例子：矩陣乘法

```c
void mm(double c[][32], double a[][32], double b[][32]) {
    for (size_t i = 0; i < 32; i++)
        for (size_t j = 0; j < 32; j++)
            for (size_t k = 0; k < 32; k++)
                c[i][j] = c[i][j] + a[i][k] * b[k][j];
}
```

c、a、b 的起點在 x10、x11、x12，i、j、k 在 x5、x6、x7：

```
mm:  ...
     li     x28, 32           # x28 = 32（列的大小，也是迴圈上限）
     li     x5, 0             # i = 0
L1:  li     x6, 0             # j = 0
L2:  li     x7, 0             # k = 0
     slli   x30, x5, 5        # x30 = i * 32
     add    x30, x30, x6      # x30 = i * 32 + j
     slli   x30, x30, 3       # 乘以 8 變成 byte offset
     add    x30, x10, x30     # x30 = &c[i][j]
     fld    f0, 0(x30)        # f0 = c[i][j]
L3:  slli   x29, x7, 5        # x29 = k * 32
     add    x29, x29, x6      # x29 = k * 32 + j
     slli   x29, x29, 3
     add    x29, x12, x29     # x29 = &b[k][j]
     fld    f1, 0(x29)        # f1 = b[k][j]
     slli   x29, x5, 5        # x29 = i * 32
     add    x29, x29, x7      # x29 = i * 32 + k
     slli   x29, x29, 3
     add    x29, x11, x29     # x29 = &a[i][k]
     fld    f2, 0(x29)        # f2 = a[i][k]
     fmul.d f1, f2, f1        # f1 = a[i][k] * b[k][j]
     fadd.d f0, f0, f1        # f0 = c[i][j] + a[i][k] * b[k][j]
     addi   x7, x7, 1         # k++
     bltu   x7, x28, L3
     fsd    f0, 0(x30)        # c[i][j] = f0
     addi   x6, x6, 1         # j++
     bltu   x6, x28, L2
     addi   x5, x5, 1         # i++
     bltu   x5, x28, L1
```

二維陣列 `c[i][j]` 的位址是 $\text{base} + (i \times 32 + j) \times 8$，乘以 32 和 8 都用 shift。`c[i][j]` 在最內層迴圈裡一直放在 f0，k 的迴圈結束才寫回一次。

## Rounding

運算結果常常比 fraction 長，要 round 回去。IEEE 754 要求硬體運算時在最後一位（ULP，unit in the last place）後面多留三個 bits：

![[Screenshot 2025-04-02 at 9.03.54 PM 1.png|Guard、round、sticky bit]]

- **G**（guard bit）：ULP 後面第一位
- **R**（round bit）：ULP 後面第二位
- **S**（sticky bit）：R 後面只要有任何一個 1，S 就是 1

| G | R | S | 處理 |
| --- | --- | --- | --- |
| 0 | 0 | x | round down |
| 0 | 1 | x | round down |
| 1 | 0 | 0 | round to even |
| 1 | 0 | 1 | round up |
| 1 | 1 | x | round up |

G = 0 代表多出的部分不到 0.5 ULP，捨去；G = 1 且 R、S 不全為 0，代表超過 0.5 ULP，進位。

GRS = 100 剛好是 0.5 ULP。如果一律進位，結果平均會偏大。**Round to even** 的規則是選擇讓 ULP 變成 0（偶數）的那一邊，這樣中間值一半進位、一半捨去，誤差會互相抵銷。

### 浮點數不滿足結合律

浮點數的精度有限，很大的數加上很小的數時，小的數可能在對齊時整個被移出去：

![[Screenshot 2025-04-02 at 9.11.37 PM 1.png|加法的順序不同，結果就不同]]

所以平行程式改變了加法的順序，結果就可能不一樣。

## Subword parallelism

多媒體資料常常只有 8 或 16 bits，用 64-bit 或 128-bit 的加法器一次只算一筆很浪費。**Subword parallelism** 把寬的加法器切開，只要切斷各段之間的 carry，一個 128-bit 加法器就能同時做 16 個 8-bit 加法。這是一種 SIMD（single instruction, multiple data），一條指令對多筆資料做同樣的運算。
