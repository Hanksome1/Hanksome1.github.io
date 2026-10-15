---
title: "Physical-Aware Back-End Flow Optimization: Genus iSpatial, SDP, and Clock Tree"
date: 2026-06-11 10:00:00
layout: project
featured: false
part: SA-MACRO-N16
summary: Not a single line of RTL changed — only the back-end flow. For a systolic-array macro in N16, we added Genus iSpatial physical-aware synthesis, Structured Data Path relative placement, and an H-tree / skew-group clock tree to a DC / Innovus flow, compared each against the baseline, and ran an ablation. SDP pushed the maximum frequency from 1640 to 1710 MHz, the skew group cut power to 145.19 mW, and iSpatial used 29.7% less power than plain Genus synthesis at 1700 MHz.
period: 2026 Spring
role: Genus iSpatial synthesis flow · Genus → Innovus handoff
course: Final project, EE5254 Advanced Digital Design Flow, NTHU
team: 3-person team
stack: [Tcl, N16 FinFET]
tools: [Genus, Innovus, Design Compiler]
tags: [APR, Physical Design, Clock Tree Synthesis, Systolic Array]
floorplan: [iSPATIAL SYN, SDP GRID 8×4, H-TREE, SKEW GROUP, SRAM I/O]
cover: /images/physical-aware-backend-flow/sdp-route.jpg
metrics:
  - { label: Fmax, value: 1710 MHz, note: "SDP grid · baseline 1640 MHz (+4.3%)" }
  - { label: Power, value: 145.19 mW, note: "CTS skew group · baseline 154.46 mW (−6.0%)" }
  - { label: iSpatial, value: "−29.7%", note: "power vs. logical Genus · 215.97 → 151.79 mW @ 1700 MHz" }
  - { label: Die, value: "490.86 × 490.752 µm", note: "N16 · fixed for every ablation run" }
---

## Overview

This was the final project for EE5254 Advanced Digital Design Flow, which I took in the spring of my fourth year. The brief was simple: **don't touch a single line of RTL**, change only the back-end flow, and see how much faster and how much more power-efficient the same design can get.

The design is `sa_macro`, the course's systolic-array macro with SRAM, in the N16 (16 nm FinFET) process. The original flow is the usual combination: Synopsys Design Compiler (DC) for synthesis, with the netlist handed to Cadence Innovus for APR (auto place & route). As processes shrink, wire delay has long since overtaken the transistors' own gate delay [3], yet this flow can't see the wires at all during synthesis. It has three weak spots, and we went after each with one technique:

| Weak spot | Remedy |
| --- | --- |
| DC synthesizes with wire delays estimated by a wire-load model and no physical information at all; APR then has to floorplan and place everything from scratch | **Genus iSpatial**: read the floorplan and place cells during synthesis, compute net delay from extracted RC, and hand Innovus a design that is already placed |
| The systolic array has a large number of identical, regularly tiled registers; a generic placer doesn't know how they relate, scatters them, and ends up with long, messy wires | **SDP (Structured Data Path)**: use relative placement to pin the registers into a grid that mirrors the PE array |
| A clock tree grown on an irregular placement is unbalanced and hard to tune for the worst path | **H-tree** gives every branch the same delay; a **skew group** isolates the start point of the worst path so its clock arrival can be tuned on its own |

![Left: the original flow; right: ours. iSpatial merges synthesis, floorplan, powerplan, and placement into one physical-aware stage; the SDP constraint is applied at placement, and the H-tree and skew group at CTS](/images/physical-aware-backend-flow/flow-comparison.png)

Each technique was compared against the DC / Innovus baseline, and then we combined them in an ablation. The best single results: SDP pushed the maximum frequency from 1640 MHz to **1710 MHz** (+4.3%), the skew group cut power from 154.46 mW to **145.19 mW** (−6.0%), and iSpatial, at 1700 MHz, used **29.7%** less power than plain (logical) Genus synthesis. Stacking all three, however, did not make things better.

## The design: sa_macro

![The course-provided sa_macro: an 8×4 systolic array (left) and one of its PEs (right). Weights enter from the Weight FIFOs on the left, activations from the Activation FIFOs on top](/images/physical-aware-backend-flow/systolic-array-pe.png)

The core of `sa_macro` is an 8×4 systolic array: each row (Cout #0–#7) is fed weights by a Weight FIFO, and each column is fed data by an Activation FIFO. Each PE holds three sets of registers: the data register `d_ff` and the weight register `w_ff`, which pass values on to the next PE, and `accu`, which holds the running sum; between the registers sit a multiplier and an accumulating adder. Next to the array are the SRAM macros (the blocks labeled 12x45 along the top of the layout pictures below).

## Genus iSpatial: placing cells during synthesis

This was my part.

### Reproducing the DC flow in Genus first

To compare the two tools on equal footing, the first step was to rebuild the existing DC golden flow, step by step, with Genus's native commands:

| DC flow | Genus equivalent |
| --- | --- |
| `analyze` / `elaborate` / `link` / `uniquify` | `read_hdl` / `elaborate` / `uniquify` |
| Applying timing constraints | `read_sdc` |
| `compile_ultra` | Split into three stages: `syn_generic` → `syn_map` → `syn_opt` |
| Liberty for standard cells and SRAM | Set with `set_db` (the physical flow uses an MMMC library set instead) |
| dont_use list | `.avoid` attribute |
| Latch-based clock gating | `lp_clock_gating_*` attributes |

Every library and design intent from the DC scripts was kept, so any difference between the two comes from the synthesis engine alone.

### Turning on iSpatial

The second version enables iSpatial physical-aware synthesis:

1. The timing environment is defined once in MMMC (Multi-Mode Multi-Corner), so Innovus can later reuse the identical corner definitions.
2. `read_physical` loads the tech, standard-cell, and SRAM LEFs; `read_def` loads a floorplan with the I/O pin positions.
3. Every synthesis stage runs with `-spatial`, so Genus actually places cells on the floorplan and computes net delay from extracted RC rather than from a wire-load model.

### Handing off to Innovus

Because placement and parasitics are now consistent with the back end, the result is exported with `write_design -innovus` as a single Innovus-ready package. At APR, Genus's placement DEF is registered with `init_def_file` and read in with `defIn` during `init_design`, so the cells stay exactly where iSpatial put them. The original `floorPlan` command is commented out, and APR goes straight on to routing and optimization, skipping the placement rework.

![The iSpatial result just after loading into Innovus: not one line of the APR placement scripts has run, and the cells are already placed](/images/physical-aware-backend-flow/ispatial-placement.png)

Genus's iSpatial flow can apply SDP constraints too, but only after mapping is finished.

## SDP: lining the registers up into a grid

SDP (Structured Data Path) is a relative-placement methodology: you describe how cells relate to one another (same row, same column, or a given order) and give the group an origin. Innovus offers three ways to define it: SDP Tcl commands, the SDP browser (GUI), and a relative-placement file. We used the third, reading the file with `readSdpFile`, setting the SDP options, and then running `place_opt_design`. The whole flow is:

1. Import design
2. Define the SDP constraints (SDP file or SDP Tcl commands)
3. Run `place_opt_design` with the SDPs
4. (Optional) Check SDP alignment, congestion, and timing, adjust columns and rows if needed, and go back to step 3
5. Route

### What is constrained

Each PE contains two kinds of things: sequential registers (`d_ff`, `w_ff`, `accu`) and the combinational logic between them (the multiplier and the adder). Only the registers can be reliably bound by an SDP constraint.

Our first attempt constrained everything in the PE, and it didn't work: DC restructures the combinational logic during synthesis, so those cells have no stable one-to-one names to reference. Registers are different. They survive synthesis under stable names and can be read directly from the netlist produced in `01_netlist_to_gds`, which makes them ideal anchors for a relative-placement grid. With the registers pinned, Innovus places the surrounding combinational logic and the unconstrained accumulator nearby, subject to route distance and timing.

### Generating the SDP file with a script

There are thousands of registers, far too many to place by hand. Fortunately the register names in the PEs follow a fixed pattern:

```text
systolic_array_u0/cin${c}/ch_out[${i}].pix_out[${j}].genblk1.uPE/d_ff_reg[7:0]
```

So we wrote a Tcl script (`gen_sa_macro_sdp_v2.tcl`) that produces the whole `.sdp` file from a few parameters: each SDP group's origin is `(start_x, start_y)`, groups are spaced `pitch_x` apart horizontally and `pitch_y` vertically, and nested loops over the 8 `ch_out` and 4 `pix_out` produce an 8-row × 4-column array of PE groups that matches the layout of the systolic array. Within each group, the `d_ff_reg[7:0]` of cin0–cin7 run along the bottom edge and the `w_ff_reg[3:0]` along the right edge. Changing a parameter regenerates the file, so position, pitch, and structure can be checked quickly.

### Two design decisions

**1. Move the whole grid up.** In the initial SDP placement, the worst timing path through the systolic array was too long: the grid sat low in the core, the data registers ended up far from their timing-critical endpoints, and that stretched the dominant path. We shifted the entire SDP structure upward so the array sits closer to the SRAM, which shortened the worst path and let STA pass with no violation at the highest frequency of any version. The two versions with the origin moved down (Ver 1-1, Ver 1-2) test the opposite direction.

**2. Leave the accumulator unconstrained.** Only the data / weight registers are constrained; the accumulator is left free. That leaves whitespace between the constrained register rows and columns, so Innovus has room to place the accumulator and the MAC's combinational logic there. Keeping that placement and routing freedom is what lets the optimizer close timing instead of jamming up the way the fully constrained version did.

![Left: the SDP constraints of the best version (Ver 0-1); right: the routed result, with the SDP-constrained PEs colored](/images/physical-aware-backend-flow/sdp-layout.jpg)

## Clock tree: H-tree and skew group

### H-tree

An H-tree makes every branch of the clock tree the same length, so every branch has the same delay, which suits a regular, symmetric arrangement like a systolic array. Setup starts with `create_ccopt_clock_tree_spec` to initialize the clock tree spec and define the top, trunk, and leaf layers for the CTS non-default rule (NDR); then the H-tree itself is built:

```tcl
create_ccopt_flexible_htree -name hTree \
                            -sink_instance_prefix HT \
                            -sink_grid {4 4} \
                            -sink_grid_sink_area {30 30} \
                            -sink_grid_box {0 0 430 430} \
                            -trunk_cell <CLK_INV_X16> \
                            -final_cell <CLK_INV_X8> \
                            -pin clk

synthesize_ccopt_flexible_htrees
ccopt_design
```

`-sink_grid` sets how many rows and columns of roots the bottom level of the H-tree has, `-sink_grid_sink_area` is the width and length of each root, `-sink_grid_box` is the extent of the whole H-tree, and `-trunk_cell` and `-final_cell` choose the cells used for the trunk and the final stage — here, clock inverters with drive strengths 16 and 8. `synthesize_ccopt_flexible_htrees` grows the H-tree; if it overlaps a placement blockage, the flexible H-tree automatically deletes the conflicting roots, with no manual blockage setup needed. A final `ccopt_design` run is mandatory to connect any clock pins still left unattached.

### Skew group

Standard CTS tries to balance every sink; a skew group instead puts specific registers into an independent group whose skew and insertion delay are set on their own, which can fix timing violations and the severe IR drop at the SRAM I/Os.

```tcl
### set clock skew group
create_ccopt_skew_group -name sa_array -source clk -sinks topctrl_u0/dest_bb_reg/CP
set_ccopt_property target_insertion_delay 0.0035 -skew_group sa_array
```

`topctrl_u0/dest_bb_reg` is the launch point of the worst path in the sign-off setup report. We put its clock pin into its own skew group named `sa_array` with an insertion delay of 0.0035 ns: the clock reaches this register a little earlier, the data launches a little earlier, and the setup margin of the path after it grows. The catch is that pushing the insertion delay too far can cause hold-time violations instead, so it needs careful balancing.

## Results

Four experiments: A compares synthesis methods; B looks at how SDP placement affects regularity and timing; C compares three CTS methods; D is an ablation that combines the techniques.

### A. Synthesis methods

| Version | Frequency (MHz) | Power (mW) | Energy (pJ) | IR drop (V) |
| --- | ---: | ---: | ---: | ---: |
| Baseline (DC) | 1640 | 154.46 | 3,150,513 | 0.7 |
| Genus | **1700** | 215.97 | 4,249,654 | 0.69958 |
| Genus + iSpatial | **1700** | **151.79** | **2,986,781** | 0.69953 |
| DC Topology Mode | 1550 | 164.22 | 3,544,079 | 0.69968 |

- **DC → Genus**: the maximum frequency rises from 1640 to 1700 MHz (+3.7%); Genus closes timing more aggressively. But the logical flow still estimates wire delay with a wire-load model, so to meet the target period it upsizes cells and adds buffers, and power rises from 154.46 to 215.97 mW (+39.8%).
- **Turning on iSpatial**: still 1700 MHz, with power down to 151.79 mW — 29.7% below logical Genus and 1.7% below the DC baseline. Net delay now comes from actually extracted RC, so the optimizer adds drive strength only where it is physically needed, and the result has both the highest frequency and the lowest power.
- **DC Topology Mode**: DC's own physical-aware option doesn't reproduce this. Frequency drops to 1550 MHz (−5.5%) and power rises to 164.22 mW (+6.3%), the worst of the four. Both are physical-aware, but iSpatial computes timing from RC extracted on the real floorplan, so its estimates are more accurate. That's why we chose Genus iSpatial as the synthesis engine.

### B. SDP

| Version | Frequency (MHz) | Power (mW) | Energy (pJ) | IR drop (V) |
| --- | ---: | ---: | ---: | ---: |
| Baseline (normal CTS) | 1640 | 154.46 | 3,150,513 | 0.700 |
| Ver 0 (all registers constrained) | fail | – | – | – |
| **Ver 0-1 (accu unconstrained, tighter pitch)** | **1710** | **153.38** | **3,000,418** | **0.852** |
| Ver 1-1 (moved down) | 1600 | 160.79 | 3,361,616 | 0.846 |
| Ver 1-2 (moved further down) | 1600 | 159.99 | 3,344,891 | 0.843 |
| hori v0 (rotated 90°) | fail | – | – | – |

Every version that completed passed sign-off verification. The failed versions are listed too, because they are exactly what led us to the right SDP strategy. Ver 0-1 binds only the data and weight registers at a tighter pitch and produces the clean, regular grid shown above; its sign-off STA reaches 1710 MHz with no violation, and post-layout simulation passes. Both moved-down versions fall to 1600 MHz, which confirms the "closer to the SRAM" decision from the other side.

### C. Clock tree

| Version | Frequency (MHz) | Power (mW) | Energy (pJ) | IR drop (V) | IR increase (V) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline (normal CTS) | 1640 | 154.46 | 3,150,513.09 | 0.6999 | 0.034200 |
| H-tree | 1580 | 154.32 | 3,267,188.81 | 0.6997 | 0.028500 |
| Skew group | **1670** | **145.19** | **2,908,233.95** | 0.8798 | **0.000133** |

All three configurations passed sign-off DRC / LVS, STA, post-simulation, and PG integrity checks. The three pictures below are from Innovus's clock tree debugger; the vertical axis is clock delay (ns):

![Normal CTS: the clock tree is visibly unbalanced, with a maximum delay of 0.19 ns](/images/physical-aware-backend-flow/cts-normal.png)

![H-tree: the most balanced branches, with the maximum delay down to 0.15 ns](/images/physical-aware-backend-flow/cts-htree.png)

![Skew group: the separate clock path on the right is the isolated skew group; maximum delay 0.18 ns](/images/physical-aware-backend-flow/cts-skew-group.png)

- **Normal CTS**: the clock tree is fairly unbalanced, with a maximum delay of 0.19 ns; the IR drop is concentrated at the SRAM I/Os.
- **H-tree**: the most balanced, with the maximum delay down to 0.15 ns, yet the lowest maximum frequency (1580 MHz), and the major IR drop is still at the SRAM I/Os. Forcing equal clock delay across all sinks can introduce setup or hold violations, and the extra balancing buffers add energy.
- **Skew group**: a maximum delay of 0.18 ns, but the best on every other metric: 1670 MHz, 145.19 mW, the lowest energy, and an IR increase of only 0.000133 V. The SRAM dominates the circuit's delay and power, so isolating its I/O control signal `dest_bb` into its own skew group allows targeted optimization: the preceding stage's clock arrives earlier, the setup margin of the SRAM I/O circuits after it grows, and the IR drop comes down with it.

### D. Ablation

Every version was synthesized and implemented under identical conditions: a 2000 MHz target for synthesis and 1800 MHz for APR, a fixed area of 490.86 µm × 490.752 µm, and the same SRAM macro placement. Versions without "Genus" in their name were synthesized with DC. Every version passed sign-off DRC / LVS, STA, post-simulation, and PG integrity checks with no unconnected nets.

| Version | Frequency (MHz) | Power (mW) | Energy (pJ) | IR drop (V) |
| --- | ---: | ---: | ---: | ---: |
| Baseline (DC) | 1640 | 154.46 | 3,150,513 | 0.6999 |
| Genus iSpatial | 1700 | 151.79 | 2,986,781 | 0.6995 |
| SDP | **1710** | 153.38 | 3,000,418 | 0.852 |
| H-tree | 1580 | 154.32 | 3,267,189 | 0.6997 |
| Skew group | 1670 | **145.19** | **2,908,234** | 0.8798 |
| Genus + SDP | 1700 | 196.12 | 3,859,065 | 0.845 |
| Genus + H-tree | **1710** | 195.54 | 3,825,151 | 0.6984 |
| SDP + H-tree | 1630 | 150.42 | 3,086,932 | 0.6997 |
| Genus iSpatial + SDP + H-tree | 1690 | 170.11 | 3,367,071 | 0.6996 |

- The top frequency of 1710 MHz is shared by **DC + SDP** and **Genus + H-tree**; the lowest is **DC + H-tree** (1580 MHz). Switching the synthesis tool from DC to Genus takes the H-tree from the slowest configuration to one of the fastest (1580 → 1710 MHz, +130 MHz).
- On power and energy, the skew group leads throughout (145.19 mW, 2,908,234 pJ), and Genus + SDP is the worst (196.12 mW, 3,859,065 pJ). Overall, Genus reaches higher frequencies, while DC is more power-efficient.
- Combining all three, Genus iSpatial + SDP + H-tree, beats the baseline frequency (1690 MHz) but is not the best.

The report's conclusion: the techniques are not additive. Each one targets a different bottleneck, so stacking them brings no further benefit; the right choice depends on whether the goal is maximum frequency, minimum power and energy, or the best overall balance.

## Looking back: how to read the numbers

Going back over the report's tables, a few things deserve a second look.

### Energy is really power divided by frequency

The energy in every row is exactly

$$
E = P \times \frac{33{,}451}{f}
$$

For example, the baseline: $154.46\ \text{mW} \times 33{,}451 / 1640\ \text{MHz} = 3{,}150{,}513\ \text{pJ}$. All 13 completed versions in the report fit without exception. In other words, every version ran the same 33,451-cycle simulation at its own maximum frequency, and energy is just $P/f$ times a constant — it carries no information beyond power and frequency.

It also means the power column was measured at different frequencies: Genus's 215.97 mW is at 1700 MHz, the baseline's 154.46 mW at 1640 MHz. When comparing efficiency, energy per cycle, $P/f$, is fairer than mW:

| Version | $P/f$ (pJ/cycle) | vs. baseline |
| --- | ---: | ---: |
| Skew group | 86.9 | −7.7% |
| Genus iSpatial | 89.3 | −5.2% |
| SDP | 89.7 | −4.8% |
| SDP + H-tree | 92.3 | −2.0% |
| Baseline (DC) | 94.2 | – |
| H-tree | 97.7 | +3.7% |
| Genus iSpatial + SDP + H-tree | 100.7 | +6.9% |
| DC Topology Mode | 105.9 | +12.5% |
| Genus + H-tree | 114.4 | +21.4% |
| Genus + SDP | 115.4 | +22.5% |
| Genus | 127.0 | +34.9% |

The ranking is the same as the energy column, but in pJ/cycle the skew group's advantage grows from −6.0% in power to −7.7%, because its frequency is also higher than the baseline's.

### The "all three" combination leaves out the skew group

Individually, the lowest power comes from the skew group (145.19 mW), then iSpatial (151.79 mW); the highest frequency from SDP (1710 MHz). Yet the skew group doesn't appear in any combination in the ablation. The "all three" run is iSpatial + SDP + **H-tree**, and the H-tree on its own is the lowest-frequency configuration (1580 MHz). So the "not additive" conclusion was observed on a combination that includes the weakest component; the combination most worth running next is iSpatial + SDP + skew group.

Also, the power of Genus + SDP and Genus + H-tree (196.12 and 195.54 mW) is close to logical Genus (215.97 mW) and far from iSpatial (151.79 mW), and the table names "Genus iSpatial" and "Genus" separately, so my guess is that these two runs used Genus without iSpatial. If so, their extra power comes mainly from the synthesis flow itself (experiment A already showed +39.8% for logical Genus), not necessarily from SDP or the H-tree conflicting with Genus.

### The IR drop column can't be compared directly

The IR drop numbers fall into two clusters: about 0.70 V (baseline, iSpatial, H-tree, and others) and 0.85–0.88 V (every SDP version, the skew group, Genus + SDP). Judging by the voltages of the FF and SS corners in the clock tree debugger (0.88 V and 0.72 V), the supply in this process is between 0.72 V and 0.88 V; if 0.70 V had really been lost, the circuit wouldn't work at all, yet every one of these versions passed post-simulation. So this column can't be the voltage drop itself — more likely it is the voltage at some node, and the two clusters may come from different analysis conditions. The report doesn't define the column, so I don't use it for comparison; the IR increase column, which only the three CTS runs have, has a clearer meaning.

## Division of work

A 3-person team. I owned the Genus iSpatial flow: reproducing the original DC flow in Genus, building the iSpatial physical-aware synthesis, and having Innovus take over Genus's placement directly. The other two teammates owned the SDP flow and the H-tree / skew group, respectively.

## What I learned

- **Timing seen at synthesis is only trustworthy with physical information.** Relying on a wire-load model alone, Genus played it safe by upsizing cells and adding buffers, costing 39.8% more power; the same tool using RC extracted from the floorplan kept the frequency and ended up with lower power than DC.
- **Put constraints on things that are still recognizable after synthesis.** Combinational logic gets restructured during synthesis and its names aren't stable; register names survive, which makes registers the right anchors. Too many constraints (binding the accumulators too) left the placer no room and timing wouldn't close.
- **Balanced isn't the same as fast.** The H-tree gave the most balanced clock tree with the smallest maximum delay, yet the worst frequency; the skew group deliberately unbalanced one point and got the best power and timing. What CTS needs to serve is the slack on the critical path, not skew for its own sake.
- **Know where every column comes from.** Energy is derived from power and frequency, and power was measured at different frequencies; an ablation also needs to combine the best individual techniques for its conclusion to hold.

## References

1. Cadence Design Systems, *Innovus Implementation System User Guide*.
2. Cadence Design Systems, *Genus Synthesis Solution User Guide*.
3. J.-S. Kim, J. Kim, D.-J. Yang, et al., "Addressing Interconnect Challenges for Enhanced Computing Performance," *Science*, vol. 386, no. 6727, eadk6189, 2024.
