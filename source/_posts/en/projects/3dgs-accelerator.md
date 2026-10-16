---
title: 3D Gaussian Splatting Hardware Accelerator
date: 2026-10-14 10:00:00
layout: project
featured: true
part: 3DGS-RTL
summary: The 3D Gaussian Splatting rendering pipeline (3D/2D covariance, depth sorting, alpha blending) built as an 8-stage RTL design and taken through APR. A 128×128 scene with 64 Gaussians renders at 367.8 FPS with a 5 ns cycle time and 2.63 mW of post-layout power. Ranked 1st of 25 teams in the class.
period: 2026 Spring
role: Algorithm · Golden model & testbench · RTL · Optimization
course: Final project, EE4292 IC Design Laboratory (ICLAB), NTHU
team: 3-person team
stack: [Verilog, Python]
tools: [SpyGlass, Conformal LEC, Innovus]
tags: [Accelerator, Verilog, 3D Gaussian Splatting, APR]
floorplan: [ROT / COV3D, PROJECTION, SORT, RENDER, SRAM]
metrics:
  - { label: Throughput, value: 367.8 FPS, note: "128×128 · 64 Gaussians" }
  - { label: Power, value: 2.63 mW, note: "post-layout · post-sim waveform" }
  - { label: Area, value: "240,128 µm²", note: "post-APR · core util. 75%" }
  - { label: Cycle time, value: 5.0 ns, note: "200 MHz · no violation after APR" }
---

## Overview

[3D Gaussian Splatting](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) (3DGS; Kerbl et al., SIGGRAPH 2023) represents a scene not with meshes but with a large number of colored, semi-transparent 3D Gaussians. The image quality is excellent, but the original paper needs a high-end GPU to sustain real-time frame rates. In ICLAB, each team picks its own topic for the final project. We picked 3DGS to find out **how low area and power can go if the whole rendering pipeline becomes dedicated hardware**.

![The original 3DGS pipeline (image from Kerbl et al., SIGGRAPH 2023)](/images/3dgs-accelerator/3dgs-pipeline.png)

The paper's pipeline covers both training and rendering. SfM points are initialized as 3D Gaussians, an image is computed through projection and a differentiable tile rasterizer, and the gradients (blue arrows) flow back to refine the Gaussians, while adaptive density control adds and removes Gaussians. Our accelerator implements only the rendering half. It takes already-trained Gaussians and camera parameters and outputs an image, with no gradient flow and no density control.

The finished accelerator renders 64 Gaussians at 128×128 at **367.8 FPS**, with a 5 ns cycle time, an area of 240,128 µm², and **2.63 mW** of post-layout power. The design went all the way from RTL through synthesis and APR to post-layout simulation, and the project received the highest score in the class (1st of 25 teams; class average 82.4).

<figure>
<video src="/images/3dgs-accelerator/demo-orbit.mp4" poster="/images/3dgs-accelerator/demo-orbit-poster.jpg" width="1254" height="298" autoplay loop muted playsinline aria-label="The word ICLAB built from 3D Gaussians, orbiting as the camera position changes"></video>
<figcaption>"ICLAB" built from 3D Gaussians and re-rendered frame by frame as the camera position changes, which strings together into a full orbit around the letters. The frames are rendered by the Python model; with the same inputs, the RTL simulation output matches the Python result too</figcaption>
</figure>

![The rendering flow in the Python model, showing from left to right the 3D Gaussians in camera space, the ellipses projected onto the screen, and the image after alpha blending](/images/3dgs-accelerator/render-demo.png)

## Algorithm

Each Gaussian has 14 parameters, namely a position $(x, y, z)$, a scale $(s_x, s_y, s_z)$, a rotation quaternion $(w, x, y, z)$, an opacity, and a color $(r, g, b)$. A Gaussian's shape is determined by its 3D covariance $\Sigma$, where $\mathbf{x}$ is the offset from its center.

$$
G(\mathbf{x}) = e^{-\frac{1}{2}\mathbf{x}^\top \Sigma^{-1} \mathbf{x}}
$$

The pipeline has four steps, in order 3D covariance, projection and 2D covariance, depth sorting, and rasterization.

### 1. 3D covariance

The quaternion is first converted into a rotation matrix $R$, and the scale is written as a diagonal matrix $S$.

$$
R = \begin{bmatrix}
1 - 2(y^2 + z^2) & 2(xy - wz) & 2(xz + wy) \\
2(xy + wz) & 1 - 2(x^2 + z^2) & 2(yz - wx) \\
2(xz - wy) & 2(yz + wx) & 1 - 2(x^2 + y^2)
\end{bmatrix},
\quad
S = \begin{bmatrix} s_x & 0 & 0 \\ 0 & s_y & 0 \\ 0 & 0 & s_z \end{bmatrix}
$$

Together they give the 3D covariance.

$$
\Sigma = R S S^\top R^\top
$$

### 2. Projection and 2D covariance

The view matrix $W$ transforms each Gaussian's position into camera space.

$$
\mathbf{t} = \begin{bmatrix} x \\ y \\ z \\ 1 \end{bmatrix} = W \cdot \mathbf{P}
= \begin{bmatrix}
R_{00} & R_{01} & R_{02} & T_x \\
R_{10} & R_{11} & R_{12} & T_y \\
R_{20} & R_{21} & R_{22} & T_z \\
0 & 0 & 0 & 1
\end{bmatrix}
\begin{bmatrix} P_x \\ P_y \\ P_z \\ 1 \end{bmatrix}
$$

Gaussians whose depth is too small (behind the camera or too close to it) are culled at this step. Perspective projection isn't linear, so it is approximated to first order at the Gaussian's center with the Jacobian $J$ ($f_x, f_y$ are the camera's focal lengths), which then projects $\Sigma$ into the 2D screen-space covariance $\Sigma'$.

$$
J = \begin{bmatrix}
f_x / z & 0 & -f_x x / z^2 \\
0 & -f_y / z & f_y y / z^2
\end{bmatrix},
\qquad
\Sigma' = J \, W_{3\times3} \, \Sigma \, W_{3\times3}^\top \, J^\top
$$

What rasterization actually needs is the inverse of $\Sigma'$, whose three independent elements are the conic parameters $A, B, C$.

$$
\Sigma'^{-1} = \frac{1}{\det(\Sigma')}
\begin{bmatrix} \Sigma'_{11} & -\Sigma'_{01} \\ -\Sigma'_{10} & \Sigma'_{00} \end{bmatrix}
= \begin{bmatrix} A & B \\ B & C \end{bmatrix}
$$

Finally, we compute the ellipse's center $(u, v)$ on screen and the bounding-box radii $R_x, R_y$, taken at 3 standard deviations.

$$
u = \frac{f_x x}{z} + \frac{\text{width}}{2}, \quad
v = \frac{f_y y}{z} + \frac{\text{height}}{2}, \qquad
R_x = 3\sqrt{\Sigma'_{00}}, \quad R_y = 3\sqrt{\Sigma'_{11}}
$$

![Only pixels inside the bounding box need this Gaussian's contribution](/images/3dgs-accelerator/bounding-box.png)

### 3. Depth sorting

All surviving Gaussians are sorted by depth, nearest first. The original paper uses radix sort on the GPU; we use bitonic sort instead, for reasons covered under [Optimizations](#Bitonic-sort-instead-of-radix-sort).

### 4. Rasterization

For each pixel $(p_x, p_y)$, we walk through the Gaussians $i$ in sorted order. Only if the pixel lies inside a Gaussian's bounding box do we compute that Gaussian's opacity $\alpha$ at the pixel.

$$
\Delta x = p_x - u_i, \quad \Delta y = p_y - v_i, \qquad
P = -\tfrac{1}{2}\left(A\,\Delta x^2 + 2B\,\Delta x \Delta y + C\,\Delta y^2\right)
$$

$$
\alpha = \min\left(0.99,\ \text{opacity} \cdot e^{P}\right)
$$

The color is then accumulated with front-to-back alpha blending, which also updates the pixel's remaining transmittance $T$.

$$
C_{\text{acc}} \mathrel{+}= C_i \cdot \alpha \cdot T_{\text{old}}, \qquad
T_{\text{new}} = T_{\text{old}} \cdot (1 - \alpha)
$$

$T$ starts at 1, and once it drops below 0.001 the loop exits early and the remaining Gaussians are skipped.

## Architecture

![fsm.v chains the 8 compute stages together with valid signals, and the multipliers, dividers, and LUTs on the right are shared across stages](/images/3dgs-accelerator/block-diagram.png)

The design is split into 8 stages that run in sequence, with `fsm.v` advancing to the next stage based on each stage's `*_valid` signal.

| Stage | Module | Job |
| --- | --- | --- |
| 1 | `Rot.v` | quaternion → rotation matrix $R$ |
| 2 | `Conv.v` | 3D covariance $\Sigma$ |
| 3 | `Campos.v` | transform to camera space, depth culling |
| 4 | `Jacobian.v` | projection Jacobian $J$ |
| 5 | `Conv2D.v` | 2D covariance $\Sigma'$ |
| 6 | `Conic.v` | conic parameters $A, B, C$, written to Raster SRAM |
| 7 | `Sort.v` | bitonic sort by depth, written to Sort SRAM |
| 8 | `Render.v` | per-pixel alpha blending, written to Output SRAM |

On the memory side, there are two input SRAMs, one for the view matrix and one for the Gaussian parameters. Intermediate data for rasterization lives in the Raster SRAM, the sorted order in the Sort SRAM, and the final image is written to the Output SRAM.

Numbers use a **16-bit fixed-point format with 6 fractional bits** (a resolution of 1/64), with fractional bits added dynamically where more precision is needed; that's also why the multipliers and dividers are wider than 16 bits internally (40×16-bit multiplies, 36-bit divides).

## Optimizations

### Computing only the upper triangle of the covariance

Let $M = RS$. Since $S$ is diagonal, $M$ simply scales each column of $R$ by the matching scale factor.

$$
M = RS =
\begin{bmatrix} r_{00} & r_{01} & r_{02} \\ r_{10} & r_{11} & r_{12} \\ r_{20} & r_{21} & r_{22} \end{bmatrix}
\begin{bmatrix} s_x & 0 & 0 \\ 0 & s_y & 0 \\ 0 & 0 & s_z \end{bmatrix}
=
\begin{bmatrix} s_x r_{00} & s_y r_{01} & s_z r_{02} \\ s_x r_{10} & s_y r_{11} & s_z r_{12} \\ s_x r_{20} & s_y r_{21} & s_z r_{22} \end{bmatrix}
$$

$\Sigma = RSS^\top R^\top = MM^\top$, so every element is the dot product of two rows of $M$. That makes $\Sigma$ always symmetric, with the lower triangle identical to the upper one, so the hardware only needs to compute the 6 boxed elements.

$$
\Sigma = MM^\top =
\begin{bmatrix}
\boxed{m_{00}^2 + m_{01}^2 + m_{02}^2} & \boxed{m_{00}m_{10} + m_{01}m_{11} + m_{02}m_{12}} & \boxed{m_{00}m_{20} + m_{01}m_{21} + m_{02}m_{22}} \\
m_{00}m_{10} + m_{01}m_{11} + m_{02}m_{12} & \boxed{m_{10}^2 + m_{11}^2 + m_{12}^2} & \boxed{m_{10}m_{20} + m_{11}m_{21} + m_{12}m_{22}} \\
m_{00}m_{20} + m_{01}m_{21} + m_{02}m_{22} & m_{10}m_{20} + m_{11}m_{21} + m_{12}m_{22} & \boxed{m_{20}^2 + m_{21}^2 + m_{22}^2}
\end{bmatrix}
$$

$$
\text{cov3D} = [\Sigma_{00}, \Sigma_{01}, \Sigma_{02}, \Sigma_{11}, \Sigma_{12}, \Sigma_{22}]
$$

That is 3 fewer dot products out of 9, cutting the multiplications for $\Sigma$ from 27 to 18. The saving comes purely from linear algebra and costs no accuracy at all.

### Bitonic sort instead of radix sort

Radix sort is fast on a GPU, but every pass reads and writes memory sequentially, so in hardware it gets bottlenecked on memory access and bank conflicts. Bitonic sort, on the other hand, is a fixed sorting network that first builds a bitonic sequence by alternating ascending and descending sorts, then merges it recursively with comparisons at fixed strides. Comparisons within a layer are independent of each other, so up to $N/2$ comparators can work at once without contending for resources.

![A bitonic sorting network for 16 inputs, with blue blocks sorting ascending and green blocks descending; each vertical arrow is one compare-and-swap](/images/3dgs-accelerator/bitonic-sort.png)

### Compressing the sqrt LUT

The bounding-box radius needs a square root, which we implement as a LUT, but the original table was too large. It turned out that many inputs map to the same output, so we made **the most frequent output the `default` of the `case` statement**, which let us delete every other entry with that output and cut the area noticeably.

### Sharing the multipliers and dividers, then pipelining them

The 8 stages are never all computing at once, so the multiplier (`multiply.v`), divider (`division.v`), and LUTs are shared across stages instead of each stage getting its own set. The catch is that at these bit widths a multiply doesn't fit in one cycle, so it has to be pipelined. The comparison uses $\text{performance} = 1 / (A \times T)$ as the metric, so a smaller $A \times T$ is better.

| Module | Version | Area (µm²) | Cycle time (ns) | $A \times T$ |
| --- | --- | ---: | ---: | ---: |
| `multiply` (16×16) | not pipelined | 15,075 | 5.10 | 76,883 |
| `multiply` (16×16) | 2-stage | 20,239 | 2.94 | **59,503** |
| `multiply_long` (40×16) | not pipelined | 35,000 | 5.42 | 189,700 |
| `multiply_long` (40×16) | 4-stage | 66,102 | 2.49 | **164,594** |

The pipelined versions are larger, yet their $A \times T$ is smaller; and both unpipelined versions have cycle times above 5 ns, so they would never have met timing in the first place.

The divider is used in stage 4 (the $1/z$ in the Jacobian) and stage 6 ($\det(\Sigma')$), and its inputs arrive back to back, so it is built as a shift-register-style pipelined divider (36-bit ÷ 36-bit). Processing more bits per stage shortens the latency but lengthens the cycle time, so this time the latency $C$ goes into the metric as well, and the comparison uses $P = 1 / (A \times T \times C)$, where a larger $P$ is better.

| bits / stage | Area $A$ (µm²) | Timing $T$ (ns) | Latency $C$ (cycles) | $P$ (×10⁻⁷) |
| --- | ---: | ---: | ---: | ---: |
| 2 | 33,519 | 2.31 | 18 | 7.17 |
| **3** | **27,204** | **3.43** | **12** | **8.93** |
| 4 | 25,510 | 4.98 | 9 | 8.74 |

At 4 bits/stage the timing is already 4.98 ns, right at the 5 ns edge and leaving almost no margin for layout. So we chose the 12-stage divider at 3 bits/stage, which also has the highest $P$ of the three.

### Pipelining and bounding boxes in rasterization

On a GPU, the image is split into 16×16 tiles, each handled by a 256-thread block with one thread per pixel, accumulating color front to back through the sorted list.

We only have one copy of the hardware, so rasterization is split into a **14-stage pipeline**.

![The 14-stage rasterization pipeline, which computes Δ², multiplies by the conic parameters, exponentiates, multiplies by opacity, accumulates color, and finally updates the transmittance T](/images/3dgs-accelerator/raster-pipeline.png)

For an $N \times N$ image, without pipelining each pixel has to go through all 14 stages before the next one can start; pipelined, a new pixel enters every cycle, with only 13 extra cycles to fill the pipeline. The cycle count for one Gaussian therefore drops by about 14×.

$$
\underbrace{14 \times N^2}_{\text{no pipeline}} \;\longrightarrow\; \underbrace{N^2 + 13}_{\text{14-stage pipeline}} \qquad (\text{speedup} \approx 14\times)
$$

Simulation showed that rasterization was still the most time-consuming part of the design, and most pixels lie nowhere near a given Gaussian, so computing them is wasted work. So instead of brute-forcing every pixel the way a GPU does, we **first use the bounding box to filter out the pixels outside it**, and accumulate color and update transmittance only for the pixels inside.

![Cycles per frame with 64 Gaussians at 128×128, which the bounding box brings down from about 1,071,000 to 543,882](/images/3dgs-accelerator/bbox-speedup.png)

That cuts the total cycle count nearly in half once more, a **1.969×** speedup.

## Verification & physical design

1. In **pre-sim**, Python generates 50 patterns each for 1, 4, and 64 Gaussians, with the Gaussian parameters going into the Gaussian SRAM and the camera parameters into the view SRAM. The image the RTL writes to the Output SRAM is compared pixel by pixel against the Python golden output, and every pattern passes.
2. **Lint** with SpyGlass confirms the design is synthesizable and latch-free.
3. **Synthesis** uses a 5.0 ns timing constraint, giving a synthesized area of 180,073 µm² (the gate-level simulation test cycle is set to 4.34 ns), and Conformal **LEC** then confirms the netlist is logically equivalent to the RTL.
4. **APR** is done in Innovus. We first targeted 4.5 ns, but placement already showed a large number of violations, so we relaxed the target to 5 ns. Hold time and max fanout violations took the most time; max fanout is hard to fix after routing, so the only option was to go back, adjust the core utilization, and rerun again and again. The final core utilization is 75%, passing DRC, connectivity, and antenna checks, and the post-layout netlist went through LEC once more.
5. After **post-sim**, time-based **power analysis** is driven by the actual simulation waveforms, which is closer to reality than a vectorless estimate.

Core utilization is the ratio of the synthesized area to the APR area.

$$
\text{Core utilization} = \frac{\text{Area}_\text{SYN}}{\text{Area}_\text{APR}} = \frac{180{,}072.922}{240{,}128.460} \approx 75\%
$$

Power analysis compared three settings, namely pre-layout, post-layout with pre-sim waveforms, and post-layout with post-sim waveforms.

| Power (mW) | Pre-layout | Post-layout (pre-sim waveform) | Post-layout (post-sim waveform) |
| --- | ---: | ---: | ---: |
| Net switching | 0.132 | 0.822 | 0.806 |
| Cell internal | 1.847 | 1.840 | 1.819 |
| **Total** | **1.983** | **2.667** | **2.630** |

Cell internal power barely changes from pre- to post-layout; almost all of the increase comes from net switching. Before layout the wire load is only an estimate; after layout the real routing capacitance is in, and net switching power grows to roughly 6× its earlier value.

## Results

The frame rate is measured on the 128×128, 64-Gaussian test patterns (patterns 100–149), which take 543,882 cycles per frame on average.

$$
543{,}882 \times 5\,\text{ns} \approx 2.719\,\text{ms/frame}
\;\Rightarrow\; \frac{1}{2.719\,\text{ms}} \approx 367.8\ \text{FPS}
$$

That means 100 frames take only 0.272 s, while the same 100 frames take 0.870 s in Python software, so the hardware is about **3.2× faster**.

{% note tip Room to scale up %}
Right now a single rasterization pipeline handles the whole image. The original paper splits a 1080p image into 16×16 tiles processed in parallel on the GPU; applying the same split in hardware, with several `Render` units each owning one tile, would push toward higher resolutions and frame rates.
{% endnote %}

## Division of work

A three-person team. I was responsible for the algorithm, the Python golden model and testbench, part of the RTL, and the algorithm-level optimizations. Of the other two teammates, one handled RTL, datapath sharing, synthesis, and LEC, and the other handled APR and power analysis.

## What I learned

- **Compare hardware by $A \times T$, not by area alone.** The unpipelined multiplier has the smallest area but can't reach 5 ns at all; for the divider, latency has to be counted too, and the sweet spot lands in the middle at 3 bits/stage.
- **Algorithm-level shortcuts pay off the most.** The bounding box alone halved the cycle count, and the symmetric matrix saved 3 elements; both were far more effective than squeezing the circuit.
- **Leave timing margin for layout.** 4.5 ns looked fine at synthesis but couldn't be closed at placement; anything that sits close to the constraint (like the 4.98 ns divider) easily turns into a problem at layout.
- **Only post-layout power is real.** Routing capacitance made net switching power 6× larger; the pre-layout number clearly underestimates.

## References

1. B. Kerbl, G. Kopanas, T. Leimkühler, and G. Drettakis, "3D Gaussian Splatting for Real-Time Radiance Field Rendering," *ACM Transactions on Graphics (SIGGRAPH)*, vol. 42, no. 4, 2023.
2. H. Matsuki, R. Murai, P. H. J. Kelly, and A. J. Davison, "Gaussian Splatting SLAM," *CVPR*, 2024.
