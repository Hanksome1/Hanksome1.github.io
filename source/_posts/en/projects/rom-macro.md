---
title: 128×16-bit ROM Macro, Full-Custom Design
date: 2024-12-24 10:00:00
layout: project
featured: false
part: ROM-128x16
summary: A 128×16-bit contact ROM macro designed from the transistor level up in a 0.18 µm process — decoders, MUXes, sense amplifiers, and timing control — with hand-drawn layout, clean DRC/LVS, and post-layout simulation. 7,818 µm² and a 1.56 ns average access time at the TT corner.
period: 2024 Fall
role: Schematic · Layout · SPICE simulation
course: Final project, EE3230 Introduction to Integrated Circuit Design, NTHU
team: 2-person team
stack: [Full-custom, SPICE, 0.18 µm CMOS]
tools: [Virtuoso, Calibre, HSPICE]
tags: [Memory, Full-custom, Layout, Sense Amplifier]
floorplan: [ROM ARRAY, X-DECODER, MUX / SA, CTRL / DFF]
cover: /images/rom-macro/layout-cover.png
metrics:
  - { label: Area, value: "7,818 µm²", note: "36.31 × 215.33 µm · DRC / LVS clean" }
  - { label: Access time, value: 1.56 ns, note: "post-sim · TT 25 °C · 4-case avg (worst 3.02 ns)" }
  - { label: Power, value: 563 µW, note: "post-sim · TT 25 °C · 1.8 V · 100 MHz CLK" }
  - { label: FoM, value: "1.07 × 10⁷", note: "T² × P × A (ns² · µW · µm²)" }
---

## Overview

This was the final project for Introduction to Integrated Circuit Design in the fall of my third year: starting from the transistor level, drawing our own schematics and our own layout to build a **128 × 16-bit ROM macro**. Unlike writing RTL and handing it to a synthesis tool, this time the size of every transistor and the route of every wire were ours to decide.

The spec required an access time under 5 ns at all five process corners, and the final figure of merit combines access time, power, and area — smaller is better:

$$
\text{FoM} = T_\text{access}^2 \times P_\text{avg} \times A
$$

We put our focus on area. The finished macro is just 36.31 × 215.33 µm = **7,818 µm²**: 2,048 bits plus all the peripheral circuitry, about 3.8 µm² per bit. Post-layout simulation at the TT corner gives an average access time of **1.56 ns** and an average power of **563 µW**.

## Architecture

![Block diagram: 10 DFFs latch the address, the X decoder selects a word line, the Y decoder drives two 8-to-1 MUXes that each pick one bit line, and the sense amplifiers resolve 0 or 1](/images/rom-macro/block-diagram.jpg)

The ROM array is 128 word lines (WL) × 16 bit lines (BL), 2,048 bits in total. There are 12 inputs: `CLK`, the sense-amplifier reference voltage `VREF`, and the 10-bit address `A<9:0>`. The address first goes through 10 DFFs and is then split in two:

| Address | Width | Destination |
| --- | ---: | --- |
| `A<6:0>` | 7 | X decoder (7-to-128) → turns on one of `WL<127:0>` |
| `A<9:7>` | 3 | Y decoder (3-to-8) → drives the two 8-to-1 MUXes |

The two MUXes each pick one line, from `BL<7:0>` and from `BL<15:8>`, and feed two sense amplifiers, so every read returns 2 bits (`DOUT<1:0>`). From the outside, this 128×16 array is really a **1K × 2-bit** ROM.

Every read is clocked by `CLK`:

1. **CLK low**: `Pre_b` is low, and the precharge circuit pulls all 16 BLs up to VDD; `WLEN` is also low, so every WL is off.
2. **CLK rises**: the DFFs capture the new address, `WLEN` goes high, the selected WL turns on, and the cells start discharging the BLs.
3. **SAEN rises** (slightly after CLK): the sense amplifiers compare each BL against `VREF` and drive `DOUT`.

## Circuit design

### ROM array and precharge

This is a contact/via-type ROM: whether a cell stores 0 or 1 is set by whether there is a contact/via at that position. When a WL turns on, the connected cells pull their BLs down; the BLs without a connection stay at the precharged VDD.

The precharge circuit is 16 PMOS transistors, one per BL, with all gates tied to `Pre_b`.

### X decoder: 7-to-128

128 seven-input AND gates would be bad for both area and delay, so we use **pre-decoding**: the 7 bits are split into 4 + 3 and fed into a 4-to-16 and a 3-to-8 pre-decoder, and each WL then combines one output from each side with a NOR2 — 16 × 8 is exactly 128 NOR2s.

![X decoder: the 4-to-16 pre-decoder on the left and the 3-to-8 pre-decoder below cross-feed 16 × 8 = 128 NOR2s, each driving one WL](/images/rom-macro/x-decoder.png)

The WL enable `WLEN` doesn't get its own gate level; it is merged straight into the 3-to-8 pre-decoder, turning its 3-input NANDs into NAND4s (3 address bits + `WLEN`). When `WLEN` is low, every NAND4 outputs 1, every NOR2 after it outputs 0, and all WLs turn off together.

### Y decoder and MUX

The Y decoder is a 3-to-8 decoder, also built internally from a 2-to-4 pre-decoder to cut the transistor count; its layout width was deliberately matched to the X decoder to make integration easier.

The MUXes are built from transmission gates, 8 on each side, so the decoder has to provide both `Ysel<7:0>` and the inverted `Yselb<7:0>`. One select value picks the corresponding BL on both sides: `000` selects `BL<0>` and `BL<8>`, and `111` selects `BL<7>` and `BL<15>`.

### Sense amplifier

We use a differential, latch-based voltage sense amplifier with 4 PMOS and 5 NMOS transistors, all minimum-sized.

![Sense amplifier: M5 and M6 are the input differential pair, M1–M4 are cross-coupled into a latch, M9 controls the tail current through EN, and M7 and M8 pull both outputs back to VDD while EN is low](/images/rom-macro/sense-amp.png)

One side connects to `DL`, the line selected by the MUX, and the other to `VREF`. When `DL` is above `VREF` the output is 1 (1.8 V); below it, 0 (0 V). We set `VREF` to **1.75 V, only 50 mV below VDD**, so the BL never has to discharge fully — a 50 mV drop is enough for the sense amplifier to resolve a 0. This is the key to a fast read.

### Timing control: just two inverters

The timing control turned out to be much simpler than we had expected:

- **`Pre_b`, `WLEN`**: simulating them with the same ideal waveform as `CLK` already worked. We tried adding AND gates to shorten the pulses, but that only burned more power, so in the end both are tied directly to `CLK`. The precharge PMOS conducts when its gate is low and the WLs turn on when high, so the same `CLK` naturally keeps the two from ever being on at the same time.
- **`SAEN`**: the sense amplifier must not start until the BL has developed a voltage difference — enabling it too early gives a wrong read — so `SAEN` has to lag `CLK`. We get the delay from the inverters themselves: a longer channel length weakens the drive and lengthens the delay. Two inverter stages keep the signal from being inverted, with the second stage about twice as long as the first. Finally we swept the inverters' W/L to balance delay against power.

### DFFs and output latch

Each of the 10 address bits has a master-slave DFF (transmission-gate based, rising-edge triggered) that holds the address stable for the whole cycle; the sense-amplifier outputs then go into D latches that hold `DOUT`.

## Layout & verification

![Top level: the ROM array sits side by side with the X decoder, with the 128 WLs running between them; precharge, MUXes, Y decoder, sense amplifiers, latches, DFFs, and timing control are all grouped at the bottom](/images/rom-macro/top-schematic.png)

The floorplan idea was simple: the X decoder hugs the long side of the array so the 128 WLs run straight across, and every other peripheral circuit is packed at one end of the array to waste as little space as possible. The result is a long, thin macro of 36.31 × 215.33 µm.

We ran DRC and LVS on every small block as soon as it was drawn and only integrated it upward once it was clean, so there were few surprises during final assembly. Once the whole macro passed DRC and LVS, we extracted parasitic RC with Calibre xRC and ran post-layout simulation in HSPICE.

## Results

### Pre-sim: five corners

Access time is defined as the average delay from the rising edge of `CLK` to the change of `DOUT` across four read cases; power is the average power over those four cases (25 °C):

| Corner | Avg. access time | Slowest single case | Avg. power |
| --- | ---: | ---: | ---: |
| TT | 1.344 ns | 2.622 ns | 302.3 µW |
| SS | **1.983 ns** | **3.807 ns** | 330.2 µW |
| FF | 1.208 ns | 2.352 ns | 317.3 µW |
| SF | 1.922 ns | 3.719 ns | 330.3 µW |
| FS | 1.461 ns | 2.855 ns | 307.2 µW |

All five corners are within 5 ns, and even the slowest single case (3.81 ns at SS) has margin. SS is the slowest because of its higher threshold voltage and lower current. More interesting is that **SF is almost as slow as SS, while FS is close to TT**: both slow corners have a slow NMOS, which shows the read path is limited mainly by the NMOS — after all, the BL is discharged through the cell's NMOS. Power varies by less than 10% across the five corners.

### Post-sim: after layout

![TT-corner post-layout simulation: from top to bottom, A<9:0>, CLK, DOUT<0>, and DOUT<1>, annotated with the delays of the four cases: 3.02 ns, 107 ps, 3 ns, and 107 ps](/images/rom-macro/postsim-tt.jpg)

| TT @ 25 °C | Pre-sim | Post-sim | Change |
| --- | ---: | ---: | ---: |
| Avg. access time | 1.344 ns | 1.559 ns | +16% |
| Slowest single case | 2.622 ns | 3.021 ns | +15% |
| Avg. power | 302.3 µW | 563.1 µW | **+86%** |

Access time goes up mainly because the macro is covered in long, parallel wires that add parasitic resistance and capacitance. Power goes up even more — it nearly doubles: to keep the area down, the parallel wires were packed closely together, raising the coupling capacitance between them and the switching power along with it.

The final FoM (using the post-sim TT results):

$$
\text{FoM} = 1.5594^2\ \text{ns}^2 \times 563.13\ \mu\text{W} \times 7{,}818.45\ \mu\text{m}^2 \approx 1.07 \times 10^7
$$

{% note info What the "average" access time hides %}
Of the four cases, the two where `DOUT` goes from 1 to 0 have to wait for the BL to discharge and the sense amplifier to resolve, taking about 3 ns post-sim; the two where it goes from 0 to 1 take only about 0.1 ns. The average comes out at 1.56 ns, but what really determines how fast this ROM can run is the 3.02 ns case.
{% endnote %}

## Division of work

A two-person team. We did everything together, from each block's schematic and layout through integration, DRC/LVS, and pre- and post-layout simulation.

## What I learned

- **Design is about trade-offs.** We prioritized area the whole way; the area ended up very small, but the layout was packed so tightly that post-layout power nearly doubled. Only later did we notice that other teams had focused on access time and power instead — there is no single "best", only optimization toward different goals.
- **Leave out any circuit you can do without.** Timing control was our biggest worry, and two inverters solved it; adding AND gates to tune the pulse width only burned more power. Merging `WLEN` into the pre-decoder follows the same idea.
- **Run DRC/LVS as soon as each block is drawn.** Errors are easy to find in a small block and far more painful to track down once everything is assembled.
- **Only post-layout numbers are real.** Parasitic capacitance added 86% to the power and 16% to the access time; schematic-level simulation was clearly too optimistic.
- **Know what a metric actually measures.** An average access time of 1.56 ns looks fast, but the slowest case is 3.02 ns.

## References

1. Prof. Meng-Fan Chang, lecture notes for Introduction to Integrated Circuit Design, National Tsing Hua University.
