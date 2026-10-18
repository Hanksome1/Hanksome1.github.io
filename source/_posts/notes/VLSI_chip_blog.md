---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 晶片的功耗：switching、short-circuit 與 leakage
date: '2024-12-09'
updated: '2026-10-17 21:26:49'
tags:
  - VLSI
  - Power
summary: CMOS 的功耗拆成三項：跟資料有關的 switching power、切換瞬間的 short-circuit power，以及一直存在的 leakage power；power 和 energy 的差別；以及 clock gating、multi-VDD 這兩種降低功耗的方法。
permalink: notes/vlsi-power/
synced: obsidian
---

課程最後一章是整顆晶片層級的議題，這裡只整理功耗的部分。課程總覽見 [[VLSI_blog|積體電路設計導論筆記總覽]]。

## 功耗的三個來源

$$
P = \underbrace{C_L V_{DD}^2 \, P_{0 \to 1} \, f}_{\text{switching}}
+ \underbrace{t_{sc} V_{DD} I_{peak} \, P_{0 \to 1} \, f}_{\text{short-circuit}}
+ \underbrace{V_{DD} I_{leak}}_{\text{leakage}}
$$

前兩項只在電路切換時發生，合稱 dynamic power；最後一項不論是否切換都存在，是 static power。$P_{0 \to 1}$ 是每個 clock cycle 節點從 0 變成 1 的機率。

隨著製程演進，switching power 的比例下降，short-circuit power 也變小，leakage power 則快速上升。

### Switching power

輸出每次從 0 充到 1，電源要提供 $C_L V_{DD}^2$ 的能量（一半存在電容、一半消耗在 PMOS，放電時存的那一半也消耗掉）：

$$
P_{sw} = C_L V_{DD}^2 \, P_{0 \to 1} \, f = C_{EFF} V_{DD}^2 f, \qquad C_{EFF} = P_{0 \to 1} C_L
$$

- 和電晶體尺寸沒有直接關係，和負載電容有關。
- **和資料有關**：$P_{0 \to 1}$ 取決於電路的邏輯結構，以及訊號的時序（例如 glitch）。

以 2 輸入 NOR 為例，假設 A、B 各有一半機率是 1，輸出為 1 只有 A = B = 0 一種情況，機率 1/4，所以

$$
P_{0 \to 1} = P_0 \times P_1 = \frac{3}{4} \times \frac{1}{4} = \frac{3}{16}
$$

同一個 NOR 如果用 dynamic logic 做，$P_{0 \to 1}$ 會變成 3/4，見 [[VLSI_Logics_blog|組合邏輯電路]]。

降低 switching power 就是降低公式裡的四個量：負載電容（fan-out、導線長度、電晶體大小）、activity factor（導線多常切換）、供應電壓，以及 clock 頻率。

### Short-circuit power

輸入的上升和下降需要時間，在這段時間 $t_{sc}$ 內 NMOS 和 PMOS 同時導通，$V_{DD}$ 到 GND 之間有直通的電流路徑。

![[vlsi-short-circuit.svg|輸入介於兩個 threshold 之間時，NMOS 和 PMOS 同時導通，產生 short-circuit current]]


這一項和輸入、輸出斜率的比例有關：

- 負載電容很大時，輸出變化比輸入慢很多。輸入已經切換完，輸出還接近原來的電位，short-circuit 電流幾乎是 0。
- 負載電容很小時，輸出很快就切換完，輸入還沒切換完的期間兩顆電晶體都有很大的壓差，short-circuit 電流接近最大。

### Leakage power

漏電流來自 subthreshold current、gate leakage 和 drain junction leakage，其中 **subthreshold current 最主要**，而且都隨溫度指數上升。各種漏電機制見 [[VLSI_Process_Introduction_blog|MOS 元件特性]]。

## Power 與 energy

- **Power**（W）：決定電池能用多久；peak power 決定電源和地線的設計、封裝的限制，也影響 noise margin 和可靠度。
- **Energy**（J）= power × delay：做一次運算花的能量。

功耗低的設計可能只是比較慢，完成同樣的事不一定比較省能量，所以常用 **energy-delay product**（EDP）同時考慮能量和速度。AI 晶片常用 TOPS/W（每瓦特每秒幾兆次運算），但要在指定的 PVT 條件下才有意義。

## 降低功耗的方法

1. **Clock gating**：功能單元閒置時關掉它的 clock。這是最常用的方法，代價是要額外的邏輯產生 disable 訊號，而且要避免在 clock 上產生 glitch。
2. **Multi-$V_{DD}$**：不同區塊用不同電壓，例如 core 和 I/O 各用一個。不同電壓的區塊相接時，要加 **level shifter** 轉換電位。

其他方法還有動態調整電壓和頻率（DVFS）、待機時用 sleep transistor 切斷電源，以及混用不同 $V_{th}$ 的電晶體降低漏電。
