---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 晶片的功耗：switching、short-circuit 與 leakage
date: '2024-12-09'
updated: '2026-10-16 14:36:27'
tags:
  - VLSI
  - Power
summary: CMOS 的功耗拆成三項：跟資料有關的 switching power、切換瞬間的 short-circuit power，以及一直存在的 leakage power；power 和 energy 的差別；以及 clock gating、multi-VDD 這兩種降低功耗的方法。
permalink: notes/vlsi-power/
synced: obsidian
---

課程最後一章講整顆晶片層級的議題，這裡整理其中功耗的部分。課程總覽見 [[VLSI_blog|積體電路設計導論筆記總覽]]。

## 功耗的三個來源

$$
P = \underbrace{C_L V_{DD}^2 \, P_{0 \to 1} \, f}_{\text{switching}}
+ \underbrace{t_{sc} V_{DD} I_{peak} \, P_{0 \to 1} \, f}_{\text{short-circuit}}
+ \underbrace{V_{DD} I_{leak}}_{\text{leakage}}
$$

前兩項只在電路切換時發生，合稱 dynamic power；最後一項不管有沒有切換都在，是 static power。這裡的 $P_{0 \to 1}$ 是機率：每個 clock cycle，節點從 0 變成 1 的機率。

隨著製程演進，switching power 的比例相對下降，short-circuit power 的絕對值下降，leakage power 則急遽上升。

### Switching power

每次輸出從 0 充到 1，電源要提供 $C_L V_{DD}^2$ 的能量（一半存在電容裡、一半消耗在 PMOS 上，下一次放電時存的那一半也消耗掉）：

$$
P_{sw} = C_L V_{DD}^2 \, P_{0 \to 1} \, f = C_{EFF} V_{DD}^2 f, \qquad C_{EFF} = P_{0 \to 1} C_L
$$

- 跟電晶體尺寸沒有直接關係，跟負載電容有關。
- **跟資料有關**：$P_{0 \to 1}$ 取決於電路的邏輯結構（static 的部分）和訊號的時序，例如 glitch（dynamic 的部分）。

以 2 輸入 NOR 為例，假設 A、B 各有一半機率是 1：輸出是 1 只有 A = B = 0 這一種情況，機率 1/4，所以

$$
P_{0 \to 1} = P_0 \times P_1 = \frac{3}{4} \times \frac{1}{4} = \frac{3}{16}
$$

同一個 NOR 如果用 dynamic logic 做，$P_{0 \to 1}$ 會變成 3/4，見 [[VLSI_Logics_blog|組合邏輯電路]]。

降低 switching power 就是公式裡的四個量：負載電容（fan-out、導線長度、電晶體大小）、activity factor（導線平均多常切換）、供應電壓（一代一代在降低），以及 clock 頻率（一直在增加）。

### Short-circuit power

輸入訊號的上升和下降有一定的斜率，在這段時間 $t_{sc}$ 內，NMOS 和 PMOS 同時導通，$V_{DD}$ 到 GND 之間有一條直通的電流路徑。

![[vlsi-short-circuit.svg|輸入介於兩個 threshold 之間時，NMOS 和 PMOS 同時導通，產生 short-circuit current]]


這項跟輸入和輸出斜率的比例很有關係：

- 負載電容很大時，輸出下降得比輸入上升慢很多。輸入已經切換完，輸出還接近原本的電位，short-circuit 電流幾乎是 0。
- 負載電容很小時，輸出很快就切換完，在輸入還沒切換完的期間，兩顆電晶體都有很大的壓差，short-circuit 電流接近最大值。

### Leakage power

漏電流的來源有 subthreshold current、gate leakage 和 drain junction leakage，其中 **subthreshold current 是最主要的**，而且全部都隨溫度指數上升。各種漏電機制見 [[VLSI_Process_Introduction_blog|MOS 元件特性]]。

## Power 與 energy

- **Power**（W）：決定電池能撐多久；peak power 決定電源和地線的設計、封裝的限制，也影響 noise margin 和可靠度。
- **Energy**（J）= power × delay：做一次運算要花多少能量。

功耗低的設計可能只是比較慢，做同樣的事花的能量不一定比較少。所以常用的指標是 **energy-delay product**（EDP），同時考慮能量和速度。AI 晶片則常用 TOPS/W（每瓦特每秒做幾兆次運算），但這個數字要在指定的 PVT 條件下才有意義。

## 降低功耗的方法

1. **Clock gating**：功能單元閒置時，把送給它的 clock 關掉。這是最常用的方法，代價是要額外的邏輯產生 disable 訊號，而且 gating 的邏輯要小心處理，避免在 clock 上產生 glitch。
2. **Multi-$V_{DD}$**：不同區塊用不同的電壓，例如 core 一個電壓、I/O 一個電壓。不同電壓的區塊之間連接時，要加 **level shifter** 轉換訊號的電位。

課程也提到其他手段，例如動態調整電壓和頻率（DVFS）、用 sleep transistor 在待機時切斷電源，以及混用不同 $V_{th}$ 的電晶體來降低漏電。
