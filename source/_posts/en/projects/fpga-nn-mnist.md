---
title: "FPGA Neural Network Accelerator: Handwritten Digit Recognition and a VAE"
date: 2024-06-18 10:00:00
layout: project
featured: false
part: MNIST-FPGA
summary: Two MNIST neural networks in Verilog on a Basys 3 FPGA. One is a 784→10 digit classifier with mouse input and VGA display that runs 10 neurons in parallel and answers in 784 cycles; the other is a 2→10→196 VAE decoder, cut down heavily to fit the board's LUTs, whose on-board output was unrecognizable — later traced mainly to a fixed-point scaling bug.
period: 2024 Spring
role: Model training · Fixed-point conversion · NN RTL · VGA layout
course: Final project, EE2230 Logic Design Lab, NTHU
team: 2-person team
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

CPUs are poor at the huge numbers of independent multiply-accumulates in a neural network, which is why the industry uses GPUs and TPUs to parallelize them; an FPGA can do the same. This final project set out to try it in practice: **write a neural network directly in Verilog, run it on an FPGA, and see how much parallelism helps.**

We built two features on the same board:

1. **Handwritten digit recognition**: hold the left mouse button to write a digit on the VGA screen (the right button erases), and the neural network on the FPGA decides which of 0–9 it is and shows the result on the seven-segment display.
2. **Handwritten digit generation**: the decoder of a variational autoencoder (VAE) generates an image of a handwritten digit and draws it on the VGA screen.

Digit recognition worked on the board and recognized all of 0–9 correctly. The VAE trained well in PyTorch, but on the FPGA it produced nothing but noise. At the time we blamed the FPGA's resource and precision limits, but rereading the code now, the main cause was actually a fixed-point scaling bug — the details are in [Looking back](#Looking-back-where-things-likely-went-wrong).

## System: mouse, VGA, and canvas

![System block diagram: the mouse module decodes PS/2 packets, vga_sync generates the scan position, and vga_display decides each pixel's color from that position](/images/fpga-nn-mnist/system-block.png)

| Signal | Purpose |
| --- | --- |
| `CLK`, `RESET` | 100 MHz system clock, reset button |
| `ps2_clk`, `ps2_data` | USB mouse (through the board's PS/2 bridge) |
| `hsync`, `vsync`, `RGB[11:0]` | VGA output, 4 bits per color |
| `segs[7:0]` | Seven-segment display showing the result |

- **`vga_sync`**: scans an 800×525 frame, of which 640×480 is the visible area; `vga_en` marks whether the current position is inside it.
- **`mouse`**: decodes PS/2 packets and outputs the cursor position and button states. This part is based on the open-source project [Police-Simulator-FPGA-Verilog](https://github.com/Z-Fran/Police-Simulator-FPGA-Verilog).
- **`vga_display`**: decides from the current scan position whether to draw the cursor, the canvas, or the background.

The canvas is a 280×280 px area in the middle of the screen, divided into **28×28 cells of 10×10 px each**, so one cell corresponds to one MNIST pixel. Pressing the left button with the cursor on the canvas sets that cell to 1; the right button sets it back to 0. These 784 cells are also the neural network's input, so no data needs to be moved anywhere.

![Screen layout: 180 px margins to the left and right of the canvas and 100 px above and below it; pixel coordinates are converted to cell coordinates, which map to array element x + 28y](/images/fpga-nn-mnist/display-layout.png)

## Digit recognition: a single 784 → 10 layer

### Training

We trained a single fully connected layer on MNIST in PyTorch: 784 input pixels map straight to 10 class scores, with no hidden layer. With the Adam optimizer, a learning rate of 0.001, and 20 epochs, the test accuracy is **92.56%**.

Since the final answer is simply the highest-scoring class (argmax), only the ordering matters, so the hardware needs no softmax or sigmoid and avoids exponentials entirely.

### Floats to integers

The FPGA has no native floating point, so every weight and bias is **multiplied by 1024 and rounded to an integer**, and all the math is done in integers. Argmax only looks at the ordering, so scaling every parameter by 1024 doesn't change the result.

There are 7,850 parameters in total, far too error-prone to convert by hand, so I wrote a small C++ program that reads the parameter file exported from PyTorch and emits Verilog array syntax directly:

```verilog
wire signed [width-1:0] bias0 = '{4};
wire signed [width-1:0] weight0 [0:input_number-1] = '{45,10,19,44,-7,48,19,45, ...};
wire signed [width-1:0] weight1 [0:input_number-1] = '{20,25,16,22,79,62,13,42, ...};
```

### Hardware: 10 neurons in parallel, each accumulating sequentially

![Digit recognition block diagram: the NN computes 10 scores, select_max finds the largest one, and the result goes to the seven-segment display](/images/fpga-nn-mnist/classifier-block.png)

Each neuron is an `nnsingle` module containing just one multiply-accumulator (MAC) and an address counter. Every cycle it takes the `address`-th input and weight, multiplies them, and accumulates the product into `sum_temp`; once all 784 inputs have been added, it raises `finish`:

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

![Structure of nnsingle: a counter generates the address, which selects the matching product to accumulate in the adder; finish goes high when address reaches input_number](/images/fpga-nn-mnist/nnsingle.png)

Ten `nnsingle` instances run at the same time, one per class. One inference takes **784 cycles**, under 8 µs at 100 MHz; computing the 10 neurons one after another with a single MAC would take 7,840 cycles.

![A small test with 3 inputs and 4 neurons: each neuron does one multiply-accumulate per cycle. For output_node[1], the weights are (5, 6, 7) and the inputs are all 1, so it accumulates 5, 11, 18, then adds the bias of 1 to reach 19 and raises finish](/images/fpga-nn-mnist/nnsingle-sim.png)

Once `finish` goes high, `select_max` scans the 10 scores over 10 cycles, keeps track of the maximum and its index, and passes the result to the seven-segment display.

## VAE: generating handwritten digits on the FPGA

### Model

![VAE pipeline: the encoder compresses an image into a distribution in latent space (mean and variance), and the decoder reconstructs an image from a latent vector](/images/fpga-nn-mnist/vae-pipeline.png)

A VAE consists of an encoder and a decoder: the encoder compresses an image into a distribution in latent space, and the decoder reconstructs an image from a latent vector $z$ sampled from that distribution. To "generate" new digits, only the decoder is needed, so only the decoder goes on the FPGA.

To keep the model small, the MNIST images are first reduced to 14×14 with 2×2 max pooling, and the latent space is only 2-dimensional. The decoder architecture is:

$$
z \in \mathbb{R}^2 \;\xrightarrow{\text{Linear + ReLU}}\; h \in \mathbb{R}^{10} \;\xrightarrow{\text{Linear + Sigmoid}}\; \hat{x} \in \mathbb{R}^{196} \ (14 \times 14)
$$

It was trained in PyTorch for 50 epochs, with the loss being the reconstruction loss (binary cross-entropy) plus the KL divergence. Sweeping $z$ over $[-1, 1] \times [-1, 1]$, the generated digits go from 1 and 7 through 4, 6, 0, and 5, with 2, 3, and 8 in between, changing continuously from one cell to the next:

![Decoder output in PyTorch: z[0] on the horizontal axis and z[1] on the vertical axis, each swept from −1 to 1](/images/fpga-nn-mnist/vae-latent.png)

The parameters are again converted to integers, this time by multiplying by 512.

### Hardware

![VAE top level: ClockGen produces the 25 MHz VGA clock, VAE computes the 14×14 image, and Draw renders it according to the VGA scan position](/images/fpga-nn-mnist/vae-block.png)

The VAE chains two layer modules: `decoder0` (2→10, followed by ReLU) and `decoder2` (10→196). The names follow the indices in PyTorch's `nn.Sequential`, where `decoder.1` is the ReLU in between. The `finish` of `decoder0` drives the `enable` of `decoder2`, so the second layer starts only after the first one is done.

Each layer has the same structure as the digit classifier, a row of parallel `nnsingle`s, so both share the same module:

![One decoder layer: one nnsingle per output node, all computing at once; the layer is done when every finish is high](/images/fpga-nn-mnist/decoder-layer.png)

The latent vector $z$ is selected with the board's DIP switches — $(1, 0)$, $(-1, 0)$, $(0, 1)$, $(0, -1)$, $(1, 1)$ — with another switch acting as `enable`. The `Draw` module scales the 14×14 image up to the same 280×280 px area, drawing each pixel as a 20×20 px block and converting its value to 4-bit grayscale.

### It didn't fit on the board

The first problem was area. The original design needed more than 60,000 LUTs, but the board has only 20,800. Even the version below still needed 35,184, and Vivado failed during placement:

![Vivado error: the design needs 35,184 Slice LUTs, but the board has only 20,800](/images/fpga-nn-mnist/vivado-lut-error.png)

To make it fit, we did a few things:

- **Cut a layer**: the decoder went from three layers down to two, the 2→10→196 above.
- **Cut the border neurons**: MNIST digits sit in the middle, so the outermost pixels are almost always black. We removed the neurons for one row at the top and bottom and two columns at the left and right, keeping only 120 of the 196 output neurons.
- **Lower the parameter precision**: store the parameters in fewer bits.

In the end it fit, but the generated images were completely unrecognizable as digits:

![Images generated by the VAE on the FPGA](/images/fpga-nn-mnist/vae-fpga-output.jpg)

## Results

Digit recognition worked as expected. Flip the `enable` switch, the NN starts computing, and the seven-segment display shows the result. Below are some digits written with the mouse on the VGA screen, all recognized correctly:

![Digits 0–9 written with the mouse on the VGA canvas, all recognized correctly](/images/fpga-nn-mnist/digits-grid.jpg)

The model copes with fairly sloppy handwriting, but it has one clear weakness: **digits that aren't centered on the canvas are often misrecognized**. Every MNIST digit has been centered, and our model, a single fully connected layer with no convolution, can't learn that the same shape in a different position is still the same digit.

As described above, the VAE's images were unrecognizable as digits.

| | Digit recognition | VAE decoder |
| --- | --- | --- |
| Architecture | 784 → 10 | 2 → 10 → 196 |
| PyTorch | test accuracy 92.56% | clearly recognizable digits |
| FPGA | recognizes 0–9; off-center digits get misrecognized | fits on the board, but the output is noise |

## Looking back: where things likely went wrong

The report attributed the VAE's failure to the FPGA's resource limits and insufficient precision. Rereading the Verilog from back then, I found two problems we didn't catch at the time: a fixed-point scaling bug in the VAE, and a mismatch between the training inputs and the on-board inputs for digit recognition.

### VAE: the second layer's fixed-point scale was never realigned

Multiplying the parameters by 512 means every number carries a scale factor of 512. The first layer's input $z$ is an unscaled integer, so $W_1 z + B_1$ lands exactly on the ×512 scale, and that layer is fine. But the second layer's input $H$ is already ×512, and it gets multiplied by weights that are also ×512:

$$
\underbrace{(512\,w_2)}_{W_2} \cdot \underbrace{(512\,h)}_{H} = 512^2 \cdot w_2 h
$$

The product is now on a $512^2$ scale, and it should be shifted right by 9 bits to get back to ×512 before the bias is added. The original RTL skipped this step, and both the product and the accumulator were only 16 bits wide (maximum 32,767). Running the actual parameters through it, the first layer's outputs fall roughly between 0 and 3,400, while the second layer's multiply-accumulate results exceed 18 million, having long since overflowed many times over.

To confirm this, I recomputed it in Python following the RTL's arithmetic. The top row uses the original 16-bit arithmetic; the bottom row uses the same parameters with a 9-bit right shift after the multiply, the accumulator widened to 32 bits, and a sigmoid at the end as in the PyTorch model:

![Outputs for the five DIP-switch settings. Top: recomputed with the original RTL's 16-bit arithmetic, which gives pure noise. Bottom: the same parameters with only the right shift and a wider accumulator added, which turns them back into digits](/images/fpga-nn-mnist/vae-resim.png)

The LUT shortage was real, but the main reason the output turned into noise wasn't insufficient precision: it was that the fixed-point scale wasn't tracked layer by layer. Digit recognition never ran into this because it has only one layer and its inputs are just 0 and 1.

### Digit recognition: training and on-board inputs didn't match

During training, the PyTorch transform normalized the inputs with the MNIST mean $\mu = 0.1307$ and standard deviation $\sigma = 0.3081$, so the background was about −0.42 and the strokes about 2.82; on the board, however, the canvas fed in 0s and 1s. Expanding it, the correct score should be

$$
w \cdot \frac{x - \mu}{\sigma} + b = \frac{1}{\sigma}\Big( w \cdot x + \underbrace{\sigma b - \mu \textstyle\sum_i w_i}_{b'} \Big)
$$

Argmax isn't affected by the leading $1/\sigma$, so the only difference is in the bias. Converted to the FPGA's input units, the correct $b'$ falls between −0.03 (digit 8) and +1.40 (digit 5), but the biases actually used were all close to 0. In other words, the scores of classes like 1, 5, and 7 were systematically underestimated by more than 1.

The fix requires no hardware changes at all: just compute $b'$ and replace those 10 bias constants. The off-center problem also has a cheaper fix than adding convolution: before feeding the network, shift the strokes so their center of mass sits in the middle, which is how MNIST itself was preprocessed.

### Parallelism should be set by the requirements

Each of the VAE's output neurons had its own multiplier, and the weights were written as constant arrays implemented in LUTs; with all 196 neurons fully unrolled, the area naturally blew up. But it didn't need to be that fast: even with a single MAC, 2→10→196 takes only about 2,000 cycles, or 20 µs at 100 MHz, far below the 16.7 ms of one VGA frame. A better approach is to store the weights in BRAM and time-share a handful of MACs.

## Division of work

A two-person team. I handled training the PyTorch models (the digit classifier and the VAE), converting the parameters to integers, the neural network RTL, and the VGA screen layout; my teammate handled the VGA timing and the mouse interface.

## What I learned

- **Track the fixed-point scale layer by layer.** At every layer you need to know what scale factor a number currently carries, remember to scale back down after each multiply, and leave the accumulator enough width.
- **Compare every layer against a golden model.** Back then we only looked at the final image, so seeing noise told us nothing about which layer was wrong; had each layer's output been checked against Python, the second layer would have been caught immediately. On the later [3DGS accelerator](/en/projects/3dgs-accelerator/), I wrote the Python golden model first and compared the RTL output against it pixel by pixel.
- **Training and deployment data must match.** Normalization, stroke thickness, centering: if any one of them differs, accuracy won't be what it was in training.
- **Estimate resources before choosing the parallelism.** Fully unrolling everything is fastest, but fast enough is enough, and the leftover area is better spent on things that matter more.

## References

1. Y. LeCun, L. Bottou, Y. Bengio, and P. Haffner, "Gradient-Based Learning Applied to Document Recognition," *Proceedings of the IEEE*, vol. 86, no. 11, 1998.
2. D. P. Kingma and M. Welling, "Auto-Encoding Variational Bayes," *ICLR*, 2014.
3. The PyTorch training flow for the VAE follows: [a VAE PyTorch tutorial on Medium](https://medium.com/@rekalantar/variational-auto-encoder-vae-pytorch-tutorial-dce2d2fe0f5f)
4. The mouse interface is based on: [Z-Fran/Police-Simulator-FPGA-Verilog](https://github.com/Z-Fran/Police-Simulator-FPGA-Verilog)
