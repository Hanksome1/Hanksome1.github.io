---
title: 8051 上的神經網路：8×8 手寫數字辨識
date: 2024-01-20 10:00:00
layout: project
featured: false
part: NN-8051
summary: 在 8051 系列的 AT89S52 上跑一個 64→18→10 的全連接神經網路：在電腦上用 PyTorch 訓練，參數乘上 100 存成整數；LED 點矩陣當 8×8 手寫板，用按鈕寫字，辨識結果顯示在 OLED 上。事後照 C code 重算，發現輸出層的乘加在 16-bit 整數下會 overflow。
period: 2023 Fall
role: Model training · Integer conversion · 8051 firmware · Hardware I/O
course: 清大 EE2401 微處理機系統 期末專題
team: 個人專案
stack: [C, Python, 8051]
tools: [SDCC, PyTorch]
tags: [8051, Embedded, Neural Network, MNIST]
floorplan: [NN 64→18→10, LED MATRIX 8×8, MAX7219, OLED I²C, BUTTONS ×4]
cover: /images/8051-digit-classifier/cover.jpg
metrics:
  - { label: Network, value: 64→18→10, note: "fully connected · ReLU" }
  - { label: Loss, value: ≈ 0.3, note: "cross-entropy · 0.93 with 4 hidden nodes" }
  - { label: Parameters, value: "1,360", note: "int16 ×100 · 2,720 bytes" }
  - { label: Input, value: 8 bytes, note: "8×8 board · 1 bit per pixel" }
---

## Overview

8051 沒有浮點運算單元，記憶體以 byte 計算：這次用的 AT89S52 只有 8 KB 的 flash、256 bytes 的 RAM，程式跑完就 reset，連訓練模型都做不到。這個期末專題想試試看：**在這樣的微控制器上，跑得動 neural network 嗎？**

整個專題分成三步：

1. **用 PyTorch 訓練**：在電腦上用 MNIST 訓練一個 64→18→10 的全連接網路，匯出 weight 和 bias。
2. **用 C 寫推論**：把參數乘上 100 轉成整數，在 8051 上用整數做矩陣乘法和 ReLU。
3. **完成硬體功能**：8×8 LED 點矩陣當手寫板，每一顆 LED 就是網路的一個輸入 pixel；用按鈕移動游標、點亮或熄滅 LED，按下辨識鍵之後，結果顯示在 OLED 上。

![實際的硬體。左：麵包板上的 8×8 LED 點矩陣（MAX7219 驅動）、OLED 和右下角的 8051 實驗板；右：在點矩陣上寫一個 0，OLED 顯示「The number is: 0」](/images/8051-digit-classifier/demo.jpg)

Demo 影片裡寫的 0 和 1 都辨識正確。不過現在回頭照 C code 重算，輸出層的乘加其實會超出 16-bit 整數的範圍，細節放在[回頭看](#回頭看：問題可能出在哪)。

## 硬體限制：為什麼是 18 個 hidden node

報告裡是用 8051 的基本規格來估算：ROM 4,096 bytes、RAM 128 bytes。8×8 的輸入如果每個 pixel 用一個 bit 存，只要 8 bytes；剩下的 RAM 還要放每一層 node 的值，node 的型別直接決定網路能有多大：

| node 的型別 | 每個 node | hidden + output | 合計 |
| --- | --- | --- | --- |
| `float` | 4 bytes | 4 + 10 | 56 bytes |
| `short int` | 2 bytes | 18 + 10 | 56 bytes |

用 `float` 的話，hidden layer 只放得下 4 個 node。網路這麼小，訓練 200 個 epoch 之後，validation loss 還停在 0.93 左右：

![只有 4 個 hidden node 時的訓練紀錄：第 195–199 個 epoch，training loss 約 0.975、validation loss 約 0.93](/images/8051-digit-classifier/loss-4-hidden.png)

所以改成把所有參數和 node 都存成整數。整數會丟掉小數，因此先把 weight 和 bias **乘上 100 再取整數**，保留到小數第二位。同樣的 RAM 可以放 18 個 hidden node，loss 降到 0.3 左右。

實驗板上的 AT89S52 其實比這個規格大一倍：flash 8 KB、RAM 256 bytes。實際編譯出來的程式有 5,997 bytes，其中 3,090 bytes 是常數，大部分是 weight，真的只有 4 KB 的話是放不下的。RAM 多出來的 128 bytes 只能間接定址，SDCC 預設拿來放 stack，全域變數和 node 都擠在前 128 bytes 裡，用到 0x72，所以限制網路大小的還是那 128 bytes。回頭看，如果把 node 陣列宣告成 `__idata`、放進後 128 bytes，其實還有空間再多放一些 hidden node。

## 訓練：PyTorch 上的 64→18→10

$$
x \in \mathbb{R}^{64} \ (8 \times 8) \;\xrightarrow{\text{Linear + ReLU}}\; h \in \mathbb{R}^{18} \;\xrightarrow{\text{Linear}}\; o \in \mathbb{R}^{10}
$$

- **Activation 用 ReLU**：sigmoid 要算指數和浮點數，對 8051 來說太重；ReLU 只要跟 0 比大小。
- **資料**：MNIST 的影像是 28×28，用 OpenCV 的 bicubic interpolation 縮成 8×8；training data 大約是 validation data 的四倍。
- **訓練**：SGD，learning rate 0.01、momentum 0.9、weight decay 1e-6，loss 是 cross-entropy。只有全連接層、沒有 convolution，loss 很難壓得很低，最後控制在 0.3 左右。
- **匯出**：把 `state_dict()` 裡的每個參數寫成文字檔，乘上 100、取整數之後貼成 C 的陣列，宣告成 `__code` 放進 ROM，不佔 RAM：

```c
__code short int hidden_layer_bias[]   = { -20, 24, -26, 7, ... };   // 18 個
__code short int hidden_layer_weight[] = { 24, 5, -13, 2, 56, ... }; // 18 × 64 = 1,152 個
```

## 在 8051 上推論

### 輸入：8 個 byte 存 64 個 pixel

手寫板的狀態存在 `unsigned char word[8]` 裡：一個 byte 是一列，一個 bit 是一顆 LED。要讀第 $j$ 行，就拿一個只有第 $j$ 個 bit 是 1 的遮罩和這一列做 AND。

### 第一層：只有加法

輸入只有 0 和 1，所以第一層的 $w \cdot x$ 其實不需要乘法：LED 亮著的 pixel，就把對應的 weight 加進 hidden node，暗的直接跳過。

```c
for (i = 0; i < para; i++) {          // para = 18，一次算一個 hidden node
    for (k = 0; k < 8; k++) {         // 第 k 列
        temp = 0b10000000;            // 遮罩，從最左邊的 bit 開始
        for (j = 0; j < 8; j++) {     // 第 j 行
            if (temp & word[k]) {     // 這顆 LED 亮著，就加上對應的 weight
                hidden_node[i] += hidden_layer_weight[64*i + 8*k + j];
            }
            temp = temp >> 1;         // 右移，檢查下一個 bit
        }
    }
}
```

加完之後補上 bias、通過 ReLU：

```c
short int ReLu(short int number) {
    if (number > 0) return number;
    else return 0;
}

hidden_node[i] = ReLu(hidden_node[i] + hidden_layer_bias[i]);
```

### 第二層：矩陣乘法

$$
\begin{bmatrix} o_1 \\ o_2 \\ \vdots \\ o_{10} \end{bmatrix}
=
\begin{bmatrix}
w_{1,1} & w_{1,2} & \cdots & w_{1,18} \\
w_{2,1} & w_{2,2} & \cdots & w_{2,18} \\
\vdots & & & \vdots \\
w_{10,1} & w_{10,2} & \cdots & w_{10,18}
\end{bmatrix}
\begin{bmatrix} h_1 \\ h_2 \\ \vdots \\ h_{18} \end{bmatrix}
$$

```c
for (i = 0; i < 10; i++) {
    for (j = 0; j < para; j++) {
        output_node[i] += hidden_node[j] * output_layer_weight[para*i + j];
    }
}
```

最後掃過 10 個 output node，分數最大的那一個就是辨識結果。

上板之前，先在電腦上用浮點數跑同一套推論。畫一個 3，分數最高的是 3（4.45），其次是 8（3.42）；截圖裡寫的 possibility 其實是沒有經過 softmax 的分數：

![電腦上的浮點數版本：8×8 的輸入畫成 # 和 .，下面是 10 個類別的分數，最後判斷是 3](/images/8051-digit-classifier/pc-result.png)

## 手寫板：LED 點矩陣、按鈕與 OLED

### 顯示

- **8×8 LED 點矩陣**：由 MAX7219 驅動。8051 用三支 GPIO（`DOUT`、`CLK`、`LOAD`）照 SPI 的時序送資料，一次 16 bits：8-bit 的 register address 加上 8-bit 的資料，一個 register 對應一列。
- **OLED**：走 I²C，顯示「The number is:」和辨識結果。

### 游標閃爍：Timer 0 中斷

Timer 0 設成 16-bit 模式，每 1,000 個 machine cycle 中斷一次；中斷累積 250 次，就切換一次旗標。旗標為 1 時，游標那一格以反相顯示，所以不管那一格原本是亮是暗，都會一閃一閃，而且不會動到 `word` 裡存的內容。

### 寫入 / 擦除：用 XOR 翻轉一個 bit

64 個 pixel 擠在 8 個 byte 裡，沒辦法用 `matrix[1][1]` 這種寫法直接存取，所以用 XOR 翻轉單一個 bit：

$$
a \oplus 0 = a, \qquad a \oplus 1 = \bar{a}
$$

只要準備一個只有目標位置是 1 的遮罩，和那一列做 XOR，就只會改到那一個 bit。例如要改 `0b1001` 的最後一位：$\texttt{0b1001} \oplus \texttt{0b0001} = \texttt{0b1000}$。

```c
void select(short int index) {    // index = 0–63，游標的位置
    number = index / 8;           // 第幾列
    patt   = index % 8;           // 第幾行
    temp   = 0b10000000;
    while (patt--) {
        temp = temp >> 1;         // 把 1 移到第 patt 個 bit
    }
    word[number] = temp ^ word[number];
}
```

### 按鈕

| 按鈕 | 功能 |
| --- | --- |
| 左移 | 游標往前一格，在第 0 格再按會繞回第 63 格 |
| 右移 | 游標往後一格 |
| 寫 / 擦 | 翻轉游標所在的 pixel |
| 辨識 | 跑一次推論，結果顯示在 OLED 上 |

游標的位置是 0–63 的一個數字，移到一列的尾端會接到下一列的開頭。寫 / 擦和辨識兩顆按鈕有偵測按下的瞬間，再等 50 ms 去彈跳，按一次只觸發一次；移動游標的兩顆按住就會一直移動。

## 回頭看：問題可能出在哪

當時只在電腦上驗證過浮點數版本，也就是上面那張截圖。現在回頭照 8051 上實際跑的 C code，用 Python 以 16-bit 整數一步一步重算，找到三個當時沒發現的問題。

### 輸出層的乘加超過 16 bits

SDCC 的 `short int` 和 `int` 都是 16 bits，範圍是 −32,768 到 32,767。hidden node 是 ×100 的尺度，output weight 也乘過 100，兩個相乘之後就變成 ×10⁴：

$$
\underbrace{(100\,w)}_{\text{weight}} \cdot \underbrace{(100\,h)}_{\text{hidden node}} = 10^4 \cdot w h
$$

也就是說，分數的絕對值只要超過 3.2767，16-bit 的 `output_node` 就會 overflow：正的繞成負的，負的繞成正的。把報告裡測試用的那個 3 照 C code 重算一次：

| 類別 | 不會 overflow 時的分數 | 16-bit 實際算出 | ReLU 之後 |
| --- | --- | --- | --- |
| 3 | 45,520 | −20,016 | 0 |
| 8 | 35,873 | −29,663 | 0 |
| 5 | 21,580 | 21,580 | **21,580** |
| 9 | 13,864 | 13,864 | 13,864 |
| 1 | −53,623 | 11,913 | 11,913 |

分數最高的 3 和第二高的 8 都繞成負數，被 ReLU 歸零；原本是很大負數的 1 反而繞成正數。最後 8051 回答的是 5。我另外在 8×8 上畫了幾個數字來測，每一個都至少有一個類別超出範圍。越有把握的類別分數越大，也就越容易 overflow。

Demo 影片裡的 0 和 1 都辨識正確，但備份裡的 `main.hex` 是 1 月 18 日編譯的，output layer 的參數和最後的原始碼不一樣，沒辦法確定影片是用哪一版錄的。

修法很簡單：accumulator 改用 32-bit 的 `long`，乘加完再除以 100，回到 ×100 的尺度：

```c
long acc = 0;
for (j = 0; j < para; j++) {
    acc += (long)hidden_node[j] * output_layer_weight[para*i + j];
}
output_node[i] = acc / 100 + output_layer_bias[i];   // 回到 ×100，再加上 bias
```

照這個算法重算，3 和 8 的分數分別是 4.62 和 3.62，答案回到 3。

### 輸出層的 bias 等於沒加

原本的 `output_node[i]` 是 ×10⁴ 的尺度，加上的 bias 卻只有 ×100，等於把 bias 縮小了 100 倍。另外，原始碼裡的 `output_layer_bias` 有 18 個數字，和 `hidden_layer_bias` 一模一樣，應該是複製 hidden layer 的檔案時沒有換掉。用報告截圖裡的浮點數結果反推，能算出來的幾個類別裡，output bias 從 −0.5（數字 0）到 +1.2（數字 9）都有，不是可以忽略的大小。上面的修法除以 100 之後，bias 的尺度就對齊了，再換上正確的 10 個 bias 就好。

### 訓練和上板的輸入不一致

報告裡的 transform 是這樣寫的：

```python
transform_funcs = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize((0.5), (0.5))
])
```

`ToTensor` 把 pixel 換成 0–1，`Normalize((0.5), (0.5))` 再換成 $(x - 0.5) / 0.5$，背景是 −1、筆跡是 +1，縮成 8×8 之後大致也在這個範圍。但上板之後（包括電腦上的浮點數驗證），送進網路的是 0 和 1。把 $x_\text{train} = 2x - 1$ 代進去：

$$
w \cdot (2x - 1) + b = 2\,(w \cdot x) + \Big(b - \sum_i w_i\Big)
$$

hidden layer 後面接著 ReLU，bias 不對會直接改變哪些 node 被歸零，沒辦法只在輸出層補償。修法同樣不用改程式：hidden weight 乘 2、bias 換成 $b - \sum_i w_i$，重新產生那兩個陣列就好。訓練的程式沒有留在備份裡，沒辦法量化這個不一致讓 accuracy 掉了多少。

## What I learned

- **整數化不只是乘上 100。** 每一層都要追「這個數現在是幾倍」：兩個 ×100 相乘是 ×10⁴，要除回來才能和 bias 相加，accumulator 也要留夠位寬。
- **驗證要用跟硬體一樣的算法。** 電腦上的浮點數版本跑對，不代表 8051 上的 16-bit 整數版本也對；當時只要在電腦上用 `int16_t` 重跑一次同樣的 C code，第一個測試就會發現答案不一樣。半年後的 [FPGA 神經網路](/projects/fpga-nn-mnist/) 專題又踩到同一組問題（定點數乘完沒縮回尺度、16-bit overflow、訓練時正規化但上板送 0 和 1），原因也一樣。
- **資源限制決定架構。** 可以直接定址的 128 bytes RAM 決定了 node 的型別和數量；輸入只有 0 和 1，第一層就可以完全不用乘法。
- **能用 bit 存就用 bit。** 64 個 pixel 用 8 個 byte 存，用 AND 讀、用 XOR 寫，只要原本 1/8 的記憶體。

## References

1. Y. LeCun, L. Bottou, Y. Bengio, and P. Haffner, "Gradient-Based Learning Applied to Document Recognition," *Proceedings of the IEEE*, vol. 86, no. 11, 1998.
2. [Verilog Implementation of a Digit Classifier Using Deep Learning Primitives](https://scholarworks.calstate.edu/downloads/9306t619f)，California State University ScholarWorks
3. [台大李宏毅老師的機器學習課程影片](https://www.youtube.com/watch?v=zzbr1h9sF54&list=PLJV_el3uVTsMhtt7_Y6sgTHGHp1Vb2P2J&index=5)
4. [PyTorch](https://pytorch.org/)
