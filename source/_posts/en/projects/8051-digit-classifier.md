---
title: "A Neural Network on the 8051: 8×8 Handwritten Digit Recognition"
date: 2024-01-20 10:00:00
layout: project
featured: false
part: NN-8051
summary: A 64→18→10 fully connected neural network running on an AT89S52, a member of the 8051 family. It is trained in PyTorch on a PC and its parameters are multiplied by 100 and stored as integers; an LED dot matrix serves as an 8×8 writing board, buttons do the writing, and the result appears on an OLED. Recomputing the C code afterwards showed that the output layer's multiply-accumulate overflows in 16-bit integers.
period: 2023 Fall
role: Model training · Integer conversion · 8051 firmware · Hardware I/O
course: Final project, EE2401 Microcomputer Systems, NTHU
team: Solo project
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

The 8051 has no floating-point unit and its memory is counted in bytes: the AT89S52 used here has only 8 KB of flash and 256 bytes of RAM, and it resets when the program ends, so it cannot even train a model. This final project set out to find out: **can a microcontroller like this run a neural network at all?**

The project has three steps:

1. **Train in PyTorch**: train a 64→18→10 fully connected network on MNIST on a PC and export its weights and biases.
2. **Write inference in C**: multiply the parameters by 100, convert them to integers, and do the matrix multiplications and ReLU in integer arithmetic on the 8051.
3. **Build the hardware features**: an 8×8 LED dot matrix serves as the writing board, with each LED being one input pixel of the network; buttons move a cursor and turn LEDs on or off, and after the classify button is pressed the result appears on the OLED.

![The actual hardware. Left: the 8×8 LED dot matrix (driven by a MAX7219), the OLED on the breadboard, and the 8051 lab board at the bottom right; right: a 0 written on the dot matrix, with the OLED showing "The number is: 0"](/images/8051-digit-classifier/demo.jpg)

In the demo video, both the 0 and the 1 that were written are recognized correctly. Recomputing the C code now, however, shows that the output layer's multiply-accumulate actually goes beyond the range of a 16-bit integer — the details are in [Looking back](#Looking-back-where-things-likely-went-wrong).

## Hardware limits: why 18 hidden nodes

The report estimated with the basic 8051 specs: 4,096 bytes of ROM and 128 bytes of RAM. Storing the 8×8 input at one bit per pixel takes only 8 bytes; the remaining RAM also has to hold every layer's node values, so the node type directly decides how large the network can be:

| Node type | Per node | Hidden + output | Total |
| --- | --- | --- | --- |
| `float` | 4 bytes | 4 + 10 | 56 bytes |
| `short int` | 2 bytes | 18 + 10 | 56 bytes |

With `float`, the hidden layer only has room for 4 nodes. A network this small still sits at a validation loss of about 0.93 after 200 epochs of training:

![Training log with only 4 hidden nodes: at epochs 195–199, the training loss is about 0.975 and the validation loss about 0.93](/images/8051-digit-classifier/loss-4-hidden.png)

So I switched to storing all parameters and nodes as integers. Integers drop the fractional part, so the weights and biases are first **multiplied by 100 and then rounded to integers**, keeping two decimal places. The same RAM then holds 18 hidden nodes, and the loss drops to about 0.3.

The AT89S52 on the lab board is actually twice that: 8 KB of flash and 256 bytes of RAM. The compiled program is 5,997 bytes, of which 3,090 bytes are constants, mostly weights — it would not fit in a real 4 KB. The extra 128 bytes of RAM can only be addressed indirectly, and SDCC uses them for the stack by default, so the global variables and nodes are all packed into the first 128 bytes, up to 0x72; the network size is therefore still limited by those 128 bytes. Looking back, declaring the node arrays `__idata` to put them in the upper 128 bytes would have left room for a few more hidden nodes.

## Training: a 64→18→10 network in PyTorch

$$
x \in \mathbb{R}^{64} \ (8 \times 8) \;\xrightarrow{\text{Linear + ReLU}}\; h \in \mathbb{R}^{18} \;\xrightarrow{\text{Linear}}\; o \in \mathbb{R}^{10}
$$

- **ReLU as the activation**: sigmoid needs exponentials and floating point, which is too heavy for the 8051; ReLU only needs a comparison with 0.
- **Data**: MNIST images are 28×28 and are shrunk to 8×8 with OpenCV's bicubic interpolation; there is roughly four times as much training data as validation data.
- **Training**: SGD with a learning rate of 0.01, momentum of 0.9, and weight decay of 1e-6, using cross-entropy loss. With only fully connected layers and no convolution it is hard to push the loss very low; it ended up held at about 0.3.
- **Export**: every parameter in `state_dict()` is written to a text file, multiplied by 100, rounded, and pasted into a C array declared `__code` so it lives in ROM and takes no RAM:

```c
__code short int hidden_layer_bias[]   = { -20, 24, -26, 7, ... };   // 18 values
__code short int hidden_layer_weight[] = { 24, 5, -13, 2, 56, ... }; // 18 × 64 = 1,152 values
```

## Inference on the 8051

### Input: 64 pixels in 8 bytes

The board's state is stored in `unsigned char word[8]`: one byte per row, one bit per LED. To read column $j$, AND the row with a mask whose only 1 is bit $j$.

### First layer: additions only

Since the input is only 0s and 1s, the first layer's $w \cdot x$ actually needs no multiplication: for each lit pixel, add the corresponding weight to the hidden node, and simply skip the dark ones.

```c
for (i = 0; i < para; i++) {          // para = 18; one hidden node at a time
    for (k = 0; k < 8; k++) {         // row k
        temp = 0b10000000;            // mask, starting from the leftmost bit
        for (j = 0; j < 8; j++) {     // column j
            if (temp & word[k]) {     // this LED is lit, so add its weight
                hidden_node[i] += hidden_layer_weight[64*i + 8*k + j];
            }
            temp = temp >> 1;         // shift right to check the next bit
        }
    }
}
```

After the sums, add the bias and apply ReLU:

```c
short int ReLu(short int number) {
    if (number > 0) return number;
    else return 0;
}

hidden_node[i] = ReLu(hidden_node[i] + hidden_layer_bias[i]);
```

### Second layer: matrix multiplication

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

Finally, a scan over the 10 output nodes picks the one with the highest score as the result.

Before going on the board, the same inference was run in floating point on a PC. For a drawn 3, the highest score is 3 (4.45), followed by 8 (3.42); what the screenshot calls "possibility" is really a score without softmax:

![The floating-point version on a PC: the 8×8 input drawn as # and ., followed by the scores of the 10 classes and the final answer, 3](/images/8051-digit-classifier/pc-result.png)

## The writing board: LED dot matrix, buttons, and OLED

### Display

- **8×8 LED dot matrix**: driven by a MAX7219. The 8051 sends data over three GPIOs (`DOUT`, `CLK`, `LOAD`) following SPI timing, 16 bits at a time: an 8-bit register address plus 8 bits of data, with one register per row.
- **OLED**: connected over I²C, showing "The number is:" and the result.

### Cursor blinking: the Timer 0 interrupt

Timer 0 runs in 16-bit mode and interrupts once every 1,000 machine cycles; after 250 interrupts it toggles a flag. While the flag is 1, the cursor's cell is shown inverted, so it blinks whether that cell is lit or dark, without touching what is stored in `word`.

### Writing / erasing: flipping one bit with XOR

With 64 pixels packed into 8 bytes, there is no way to access them directly as `matrix[1][1]`, so a single bit is flipped with XOR:

$$
a \oplus 0 = a, \qquad a \oplus 1 = \bar{a}
$$

Preparing a mask that is 1 only at the target position and XOR-ing it with that row changes just that one bit. For example, to change the last bit of `0b1001`: $\texttt{0b1001} \oplus \texttt{0b0001} = \texttt{0b1000}$.

```c
void select(short int index) {    // index = 0–63, the cursor position
    number = index / 8;           // which row
    patt   = index % 8;           // which column
    temp   = 0b10000000;
    while (patt--) {
        temp = temp >> 1;         // move the 1 to bit patt
    }
    word[number] = temp ^ word[number];
}
```

### Buttons

| Button | Function |
| --- | --- |
| Left | Moves the cursor back one cell; pressing it at cell 0 wraps around to cell 63 |
| Right | Moves the cursor forward one cell |
| Write / erase | Flips the pixel under the cursor |
| Classify | Runs one inference and shows the result on the OLED |

The cursor position is a single number from 0 to 63, so moving past the end of a row continues at the start of the next one. The write/erase and classify buttons detect the moment of the press and then wait 50 ms to debounce, so one press triggers once; the two cursor buttons keep moving the cursor while held.

## Looking back: where things likely went wrong

At the time, only the floating-point version on the PC was verified — the screenshot above. Going back now and recomputing the C code that actually runs on the 8051, step by step in 16-bit integers in Python, turned up three problems that went unnoticed then.

### The output layer's multiply-accumulate exceeds 16 bits

In SDCC, both `short int` and `int` are 16 bits, with a range of −32,768 to 32,767. The hidden nodes are on a ×100 scale and the output weights were also multiplied by 100, so their product is on a ×10⁴ scale:

$$
\underbrace{(100\,w)}_{\text{weight}} \cdot \underbrace{(100\,h)}_{\text{hidden node}} = 10^4 \cdot w h
$$

In other words, once a score's absolute value exceeds 3.2767, the 16-bit `output_node` overflows: positive values wrap to negative and negative ones to positive. Recomputing the 3 used as the test case in the report, following the C code:

| Class | Score without overflow | Actual 16-bit result | After ReLU |
| --- | --- | --- | --- |
| 3 | 45,520 | −20,016 | 0 |
| 8 | 35,873 | −29,663 | 0 |
| 5 | 21,580 | 21,580 | **21,580** |
| 9 | 13,864 | 13,864 | 13,864 |
| 1 | −53,623 | 11,913 | 11,913 |

The top-scoring 3 and the runner-up 8 both wrap to negative values and are zeroed by ReLU, while 1, originally a large negative number, wraps to a positive one. The 8051's final answer is 5. I also drew a few more digits on the 8×8 grid to test, and every one of them had at least one class out of range. The more confident a class is, the larger its score, and the more likely it is to overflow.

In the demo video, the 0 and the 1 are both recognized correctly, but the `main.hex` in the backup was compiled on January 18 and its output-layer parameters differ from the final source code, so there is no way to tell which version the video was recorded with.

The fix is simple: use a 32-bit `long` as the accumulator, and divide by 100 after the multiply-accumulate to return to the ×100 scale:

```c
long acc = 0;
for (j = 0; j < para; j++) {
    acc += (long)hidden_node[j] * output_layer_weight[para*i + j];
}
output_node[i] = acc / 100 + output_layer_bias[i];   // back to ×100, then add the bias
```

Recomputing with this version, the scores for 3 and 8 are 4.62 and 3.62, and the answer is 3 again.

### The output-layer bias is effectively never added

The original `output_node[i]` is on a ×10⁴ scale, but the bias added to it is only ×100, which shrinks the bias by a factor of 100. On top of that, `output_layer_bias` in the source code has 18 values identical to `hidden_layer_bias` — most likely left over from copying the hidden layer's file. Working backwards from the floating-point results in the report's screenshot, the output biases of the classes that can be recovered range from −0.5 (digit 0) to +1.2 (digit 9), which is not a negligible size. After the division by 100 in the fix above, the bias scale lines up, and all that remains is to swap in the correct 10 biases.

### Training and on-board inputs don't match

The transform in the report is written like this:

```python
transform_funcs = transforms.Compose([
    transforms.ToTensor(),
    transforms.Normalize((0.5), (0.5))
])
```

`ToTensor` maps pixels to 0–1, and `Normalize((0.5), (0.5))` then maps them to $(x - 0.5) / 0.5$, so the background is −1 and the strokes are +1, and after shrinking to 8×8 the values stay roughly in that range. On the board (and in the floating-point check on the PC), however, the network is fed 0s and 1s. Substituting $x_\text{train} = 2x - 1$:

$$
w \cdot (2x - 1) + b = 2\,(w \cdot x) + \Big(b - \sum_i w_i\Big)
$$

The hidden layer is followed by ReLU, so a wrong bias directly changes which nodes get zeroed, and it cannot be compensated for at the output layer alone. Again the fix needs no code changes: multiply the hidden weights by 2, replace the biases with $b - \sum_i w_i$, and regenerate those two arrays. The training code was not kept in the backup, so there is no way to measure how much accuracy this mismatch cost.

## What I learned

- **Converting to integers is more than multiplying by 100.** Every layer needs to track "what scale is this number on now": the product of two ×100 values is ×10⁴ and has to be divided back before it can be added to a bias, and the accumulator needs enough bit width.
- **Verify with the same arithmetic as the hardware.** A floating-point version that works on a PC says nothing about whether the 16-bit integer version on the 8051 works; rerunning the same C code with `int16_t` on the PC back then would have shown a different answer on the very first test. Half a year later, the [FPGA neural network](/en/projects/fpga-nn-mnist/) project ran into the same set of problems (fixed-point products not scaled back, 16-bit overflow, normalizing during training but feeding 0s and 1s on the board), for the same reason.
- **Resource limits decide the architecture.** The 128 bytes of directly addressable RAM decided the node type and count; with inputs of only 0 and 1, the first layer needs no multiplication at all.
- **If it fits in a bit, store it in a bit.** Storing 64 pixels in 8 bytes, reading with AND and writing with XOR, takes 1/8 of the memory.

## References

1. Y. LeCun, L. Bottou, Y. Bengio, and P. Haffner, "Gradient-Based Learning Applied to Document Recognition," *Proceedings of the IEEE*, vol. 86, no. 11, 1998.
2. [Verilog Implementation of a Digit Classifier Using Deep Learning Primitives](https://scholarworks.calstate.edu/downloads/9306t619f), California State University ScholarWorks
3. [Machine learning lecture videos by Prof. Hung-yi Lee, NTU](https://www.youtube.com/watch?v=zzbr1h9sF54&list=PLJV_el3uVTsMhtt7_Y6sgTHGHp1Vb2P2J&index=5) (in Chinese)
4. [PyTorch](https://pytorch.org/)
