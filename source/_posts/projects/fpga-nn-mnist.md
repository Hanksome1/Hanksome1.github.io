---
title: FPGA 神經網路加速器：手寫數字辨識與 VAE
date: 2024-06-18 10:00:00
layout: project
featured: false
part: MNIST-FPGA
summary: 在 Basys 3 FPGA 上用 Verilog 實作兩個 MNIST 神經網路：一個是滑鼠手寫、VGA 顯示的 784→10 數字分類器，10 個 neuron 平行運算，784 個 cycle 出結果；另一個是 2→10→196 的 VAE decoder，為了塞進板子的 LUT 大幅縮減，上板後輸出認不出數字，事後追出主因是定點數縮放的 bug。
period: 2024 Spring
role: Model training · Fixed-point conversion · NN RTL · VGA layout
course: 清大 EE2230 邏輯設計實驗 期末專題
team: 2 人小組
stack: [Verilog, Python, C++]
tools: [Vivado, PyTorch]
tags: [FPGA, Verilog, Neural Network, MNIST]
floorplan: [NN ×10, SELECT MAX, VGA SYNC, PS/2 MOUSE, VAE DECODER]
cover: /images/fpga-nn-mnist/digits-grid.jpg
metrics:
  - { label: Accuracy, value: 92.56 %, note: "PyTorch · MNIST test set" }
  - { label: Latency, value: 784 cycles, note: "≈ 7.8 µs @ 100 MHz" }
  - { label: Parallel MACs, value: "10", note: "one per output neuron" }
  - { label: VAE LUTs, value: "35,184", note: "needed · board has 20,800" }
---

## Overview

CPU 不擅長 neural network 這種大量、彼此獨立的乘加運算，所以業界會用 GPU、TPU 來平行處理；FPGA 也可以做到同樣的事。這個期末專題想實際試試看：**把 neural network 直接寫成 Verilog、放到 FPGA 上跑，平行運算能幫上多少忙？**

我們在同一塊板子上做了兩個功能：

1. **手寫數字辨識**：在 VGA 螢幕上按住滑鼠左鍵寫一個數字（右鍵擦掉），FPGA 上的 neural network 判斷是 0–9 哪一個，結果顯示在七段顯示器上。
2. **生成手寫數字**：用 variational autoencoder（VAE）的 decoder 生成一張手寫數字的圖，畫在 VGA 螢幕上。

數字辨識成功上板，0–9 都能正確辨識；VAE 在 PyTorch 裡訓練得很好，放上 FPGA 後卻只產生出雜訊。當時我們把原因歸給 FPGA 的資源和精度限制，但現在回頭看程式碼，主要原因其實是一個定點數縮放的 bug，細節放在[回頭看](#回頭看：問題可能出在哪)。

## 系統：滑鼠、VGA 與畫布

![系統方塊圖：mouse 模組解讀 PS/2 封包，vga_sync 產生掃描位置，vga_display 依位置決定每個 pixel 的顏色](/images/fpga-nn-mnist/system-block.png)

| 訊號 | 用途 |
| --- | --- |
| `CLK`、`RESET` | 100 MHz 系統時脈、重置按鈕 |
| `ps2_clk`、`ps2_data` | USB 滑鼠（經板上的 PS/2 轉換） |
| `hsync`、`vsync`、`RGB[11:0]` | VGA 輸出，每個顏色 4 bits |
| `segs[7:0]` | 七段顯示器，顯示辨識結果 |

- **`vga_sync`**：掃描範圍是 800×525，其中 640×480 是可見區域；`vga_en` 標記目前是否在可見區域內。
- **`mouse`**：解讀 PS/2 封包，輸出游標座標和左右鍵狀態。這部分參考了開源專案 [Police-Simulator-FPGA-Verilog](https://github.com/Z-Fran/Police-Simulator-FPGA-Verilog)。
- **`vga_display`**：依照目前的掃描位置，決定要畫游標、畫布，還是背景。

畫布放在螢幕正中央 280×280 px 的區域，切成 **28×28 格、每格 10×10 px**，一格就對應 MNIST 的一個 pixel。游標在畫布內按下左鍵，那一格就設成 1，按右鍵設回 0。這 784 格同時也是 neural network 的輸入，不需要另外搬資料。

![畫面配置：畫布左右各留 180 px、上下各留 100 px；pixel 座標換算成格子座標後，對應到陣列的第 x + 28y 格](/images/fpga-nn-mnist/display-layout.png)

## 數字辨識：784 → 10 的單層網路

### 訓練

用 PyTorch 在 MNIST 上訓練一個只有一層的全連接網路：輸入 784 個 pixel，直接輸出 10 個類別的分數，沒有 hidden layer。Adam optimizer、learning rate 0.001，訓練 20 個 epoch 之後，test accuracy 是 **92.56%**。

因為最後只取分數最高的類別（argmax），只看大小順序，所以硬體上不需要 softmax 或 sigmoid，省掉了指數運算。

### 浮點數轉成整數

FPGA 沒有原生的浮點運算，所以把每個 weight 和 bias **乘上 1024 再取整數**，用整數來運算。argmax 只看大小順序，所有參數一起放大 1024 倍不會影響結果。

參數總共有 7,850 個，手動轉換太容易出錯，所以我寫了一個 C++ 小程式，讀 PyTorch 匯出的參數檔，直接輸出 Verilog 的陣列語法：

```verilog
wire signed [width-1:0] bias0 = '{4};
wire signed [width-1:0] weight0 [0:input_number-1] = '{45,10,19,44,-7,48,19,45, ...};
wire signed [width-1:0] weight1 [0:input_number-1] = '{20,25,16,22,79,62,13,42, ...};
```

### 硬體：10 個 neuron 平行，每個 neuron 依序累加

![數字辨識的方塊圖：NN 算出 10 個分數，select_max 找出最大的那一個，再交給七段顯示器](/images/fpga-nn-mnist/classifier-block.png)

每個 neuron 是一個 `nnsingle` 模組，裡面只有一組乘加器（MAC）和一個 address counter。每個 cycle 取出第 `address` 個輸入和 weight 相乘、累加進 `sum_temp`，784 個輸入都加完之後拉高 `finish`：

```verilog
always @(posedge clk or negedge rst_n) begin
  if (~rst_n) begin
    address  <= 0;
    sum_temp <= 0;
  end else if (address < input_number && enable) begin
    sum_temp <= sum_temp + weight[address] * input_node[address];
    address  <= address + 1;
  end
end
assign sum    = sum_temp + bias;
assign finish = (address >= input_number);
```

![nnsingle 的結構：counter 產生 address，選出對應的乘積累加進 adder；address 等於 input_number 時輸出 finish](/images/fpga-nn-mnist/nnsingle.png)

10 個 `nnsingle` 同時運作，每個負責一個類別。一次推論需要 **784 個 cycle**，在 100 MHz 下不到 8 µs；如果只用一組 MAC 依序算完 10 個 neuron，就要 7,840 個 cycle。

![3 個輸入、4 個 neuron 的小測試：每個 cycle 每個 neuron 各做一次乘加。以 output_node[1] 為例，weight 是 (5, 6, 7)、輸入都是 1，依序累加成 5、11、18，最後加上 bias 1 變成 19，finish 拉高](/images/fpga-nn-mnist/nnsingle-sim.png)

`finish` 拉高之後，`select_max` 用 10 個 cycle 依序掃過 10 個分數，記下最大值和它的 index，再交給七段顯示器。

## VAE：在 FPGA 上生成手寫數字

### 模型

![VAE 的流程：encoder 把影像壓成 latent space 上的分布（平均值與變異數），decoder 再從 latent 向量還原出影像](/images/fpga-nn-mnist/vae-pipeline.png)

VAE 由 encoder 和 decoder 組成：encoder 把影像壓成 latent space 上的一個分布，decoder 從這個分布取樣出的 latent 向量 $z$ 還原影像。要「生成」新的數字，只需要 decoder，所以只有 decoder 放上 FPGA。

為了讓模型夠小，MNIST 的影像先用 2×2 max pooling 縮成 14×14，latent space 只有 2 維。decoder 的架構是：

$$
z \in \mathbb{R}^2 \;\xrightarrow{\text{Linear + ReLU}}\; h \in \mathbb{R}^{10} \;\xrightarrow{\text{Linear + Sigmoid}}\; \hat{x} \in \mathbb{R}^{196} \ (14 \times 14)
$$

在 PyTorch 裡訓練 50 個 epoch，loss 是 reconstruction loss（binary cross-entropy）加上 KL divergence。把 $z$ 在 $[-1, 1] \times [-1, 1]$ 的範圍內掃一遍，decoder 生成的數字會從 1、7 一路變到 4、6、0、5，中間也夾著 2、3、8，相鄰的格子之間是連續變化的：

![Decoder 在 PyTorch 裡的輸出：橫軸是 z[0]、縱軸是 z[1]，各從 −1 掃到 1](/images/fpga-nn-mnist/vae-latent.png)

參數一樣轉成整數，這次是乘上 512。

### 硬體

![VAE 的頂層：ClockGen 產生 VGA 用的 25 MHz，VAE 算出 14×14 的影像，Draw 依 VGA 的掃描位置畫出來](/images/fpga-nn-mnist/vae-block.png)

VAE 由兩個 layer 模組串起來：`decoder0`（2→10，接 ReLU）和 `decoder2`（10→196）。名字沿用 PyTorch `nn.Sequential` 的 index，`decoder.1` 是中間那個 ReLU。`decoder0` 的 `finish` 接到 `decoder2` 的 `enable`，第一層算完第二層才開始。

每一層的結構和數字辨識一樣，都是一排平行的 `nnsingle`，所以兩邊共用同一個模組：

![一個 decoder layer：每個 output node 一個 nnsingle，全部同時計算，所有 finish 都拉高才算完成](/images/fpga-nn-mnist/decoder-layer.png)

latent 向量 $z$ 由板子上的 DIP switch 選擇：$(1, 0)$、$(-1, 0)$、$(0, 1)$、$(0, -1)$、$(1, 1)$，另一個 switch 當作 `enable`。`Draw` 模組把 14×14 的影像放大到同樣 280×280 px 的區域，每個 pixel 畫成 20×20 px 的方塊，數值轉成 4-bit 的灰階。

### 塞不進板子

第一個問題是面積。原本的設計需要超過 60,000 個 LUT，但板子上只有 20,800 個。下面這個版本也還需要 35,184 個，Vivado 在 placement 階段就失敗了：

![Vivado 的錯誤訊息：這個設計需要 35,184 個 Slice LUT，板子上只有 20,800 個](/images/fpga-nn-mnist/vivado-lut-error.png)

為了塞進去，我們做了幾件事：

- **砍 layer**：decoder 從三層減成兩層，也就是上面的 2→10→196。
- **砍邊框的 neuron**：MNIST 的數字都在中間，最外圈的 pixel 幾乎永遠是黑的。所以把上下各 1 列、左右各 2 行對應的 neuron 拿掉，輸出層 196 個 neuron 只留下 120 個。
- **降低參數精度**：參數用更少的 bits 存。

最後放得進去了，但生成出來的影像完全認不出是數字：

![FPGA 上 VAE 生成的影像](/images/fpga-nn-mnist/vae-fpga-output.jpg)

## Results

數字辨識的部分照預期運作。打開 `enable` 的 switch，NN 開始計算，七段顯示器顯示結果。下面是幾個在 VGA 螢幕上用滑鼠寫、而且都辨識正確的數字：

![在 VGA 畫布上用滑鼠寫的 0–9，全部辨識正確](/images/fpga-nn-mnist/digits-grid.jpg)

即使字寫得有點潦草，模型也能辨識，但它有一個明顯的弱點：**數字不在畫布中央時就容易認錯**。MNIST 的每個數字都經過置中處理，而我們的模型只有一層全連接、沒有 convolution，學不到「同一個形狀換個位置還是同一個數字」。

VAE 的部分如上所述，影像認不出是數字。

| | 數字辨識 | VAE decoder |
| --- | --- | --- |
| 架構 | 784 → 10 | 2 → 10 → 196 |
| PyTorch | test accuracy 92.56% | 生成的數字清楚可辨 |
| FPGA | 0–9 都能辨識，偏離中央的數字會認錯 | 放得進板子，但輸出是雜訊 |

## 回頭看：問題可能出在哪

報告裡把 VAE 失敗歸給 FPGA 的資源限制與精度不足。現在回頭重讀當時的 Verilog，找到兩個當時沒發現的問題：VAE 的定點數縮放 bug，以及數字辨識在訓練和上板時的輸入不一致。

### VAE：第二層的定點數縮放沒有對齊

把參數乘上 512，代表每個數都帶著一個 512 的倍率。第一層的輸入 $z$ 是沒有放大的整數，所以 $W_1 z + B_1$ 剛好落在 ×512 的尺度上，這一層沒問題。但第二層的輸入 $H$ 已經是 ×512 了，再乘上 ×512 的 weight：

$$
\underbrace{(512\,w_2)}_{W_2} \cdot \underbrace{(512\,h)}_{H} = 512^2 \cdot w_2 h
$$

乘積的尺度變成 $512^2$，乘完應該右移 9 bits 才能回到 ×512、和 bias 相加。原本的 RTL 沒有做這一步，而且 product 和 accumulator 都只有 16 bits（上限 32,767）。用實際的參數算一次，第一層輸出約在 0–3,400 之間，第二層的乘加結果卻超過 1,800 萬，早就 overflow 了好幾輪。

為了確認，我用 Python 照 RTL 的算法重算了一次，上排照原本的 16-bit 算法，下排是同一組參數、乘完右移 9 bits、accumulator 加寬到 32 bits，最後照 PyTorch 模型接 sigmoid：

![五個 DIP switch 設定的輸出。上排：照原本 RTL 的 16-bit 算法重算，是一片雜訊；下排：同一組參數，只補上右移與較寬的 accumulator，就變回數字](/images/fpga-nn-mnist/vae-resim.png)

LUT 不夠是真的，但輸出變成雜訊的主因不是精度不足，而是定點數的尺度沒有一層一層追好。數字辨識之所以沒踩到這個問題，是因為它只有一層，輸入又只有 0 和 1。

### 數字辨識：訓練和上板的輸入不一致

訓練時，PyTorch 的 transform 用 MNIST 的平均值 $\mu = 0.1307$、標準差 $\sigma = 0.3081$ 把輸入正規化，背景約是 −0.42、筆跡約是 2.82；上板之後，畫布送進去的卻是 0 和 1。展開來看，正確的分數應該是

$$
w \cdot \frac{x - \mu}{\sigma} + b = \frac{1}{\sigma}\Big( w \cdot x + \underbrace{\sigma b - \mu \textstyle\sum_i w_i}_{b'} \Big)
$$

argmax 不受前面 $1/\sigma$ 的影響，所以差別只在 bias。換算到 FPGA 的輸入單位，正確的 $b'$ 落在 −0.03（數字 8）到 +1.40（數字 5）之間，實際用的 bias 卻都接近 0。也就是說，1、5、7 這幾類的分數被系統性地少算了 1 以上。

修正不用改任何硬體，只要把 $b'$ 算好、換掉那 10 個 bias 常數就好。偏離中央的問題也有比加 convolution 便宜的解法：送進網路之前，先依筆跡的重心把它平移到中央，這也是 MNIST 本身的前處理方式。

### 平行度應該由需求決定

VAE 的每個輸出 neuron 都配一組自己的乘法器，weight 也寫成常數陣列、用 LUT 實作，196 個 neuron 全部攤開，面積自然爆掉。但其實不需要這麼快：就算只用一組 MAC，2→10→196 也只要大約 2,000 個 cycle，在 100 MHz 下是 20 µs，遠遠小於 VGA 一個 frame 的 16.7 ms。比較好的作法是把 weight 放進 BRAM，用少數幾組 MAC 分時共用。

## 分工

兩人小組。我負責 PyTorch 模型訓練（數字分類器與 VAE）、參數的整數轉換、neural network 的 RTL，以及 VGA 的畫面配置；組員負責 VGA 時序與滑鼠介面。

## What I learned

- **定點數的尺度要一層一層追。** 每一層都要知道「這個數現在帶著多少倍率」，乘法之後要記得縮回來，accumulator 也要留夠位寬。
- **每一層都要跟 golden model 比對。** 當時只看最後的影像，看到雜訊也不知道錯在哪一層；如果每層輸出都和 Python 對過，第二層一定會馬上抓到。後來做 [3DGS 加速器](/projects/3dgs-accelerator/) 時，就是先寫 Python golden model，再拿 RTL 的輸出逐 pixel 比對。
- **訓練和部署的資料要一致。** 正規化、筆跡粗細、置中與否，任何一個不一致，accuracy 都不會是訓練時的數字。
- **先估資源，再決定平行度。** 全部攤開最快，但速度只要夠用就好，剩下的面積留給更重要的東西。

## References

1. Y. LeCun, L. Bottou, Y. Bengio, and P. Haffner, "Gradient-Based Learning Applied to Document Recognition," *Proceedings of the IEEE*, vol. 86, no. 11, 1998.
2. D. P. Kingma and M. Welling, "Auto-Encoding Variational Bayes," *ICLR*, 2014.
3. VAE 的 PyTorch 訓練流程參考：[Medium 上的 VAE PyTorch tutorial](https://medium.com/@rekalantar/variational-auto-encoder-vae-pytorch-tutorial-dce2d2fe0f5f)
4. 滑鼠介面參考：[Z-Fran/Police-Simulator-FPGA-Verilog](https://github.com/Z-Fran/Police-Simulator-FPGA-Verilog)

