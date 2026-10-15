---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: APR Floorplan
date: '2025-12-21'
updated: '2026-10-16 00:24:32'
tags:
  - ICLAB
  - APR
summary: Floorplan 決定 core 的大小和長寬比、I/O 的位置，以及要替 power ring 預留多少空間；再用一次試擺放檢查 timing 和 congestion。
permalink: notes/iclab-apr-floorplan/
synced: obsidian
---

Floorplan 是 [[ICLAB_APR_blog|APR 流程]]的第二步：決定晶片的框架，哪裡放什麼東西。

- 定義邊界與比例：core 的面積、長寬比、utilization
- 分配 I/O 的位置
- 放置 macro，例如 SRAM

## 三個參數

Core 外面一圈是 power ring，再外面才是晶片的邊界。設 core 的寬和高是 $X$、$Y$，所有 standard cell 的面積總和是 $S$：

- **Core utilization** $= S / (X \times Y)$
- **Aspect ratio** $= Y / X$
- **Core-to-boundary margin** $Z$：core 到邊界之間的距離，留給 power ring

需要很多 I/O pin 時可以把 core 做成長方形：同樣的面積下，長方形的周長比正方形長，放得下更多 pin。

### Margin 要留多少

Margin 要放得下整組 power ring：兩側的 offset、每一條 ring 的寬度，以及 ring 之間的間距。以 lab 的設定為例，3 組 VDD / VSS（共 6 條 ring）、每條寬 4 µm、間距 1.5 µm、兩側的 offset 各 2 µm：

$$
Z = \underbrace{2}_{\text{offset}} + \underbrace{6 \times 4}_{\text{rings}} + \underbrace{5 \times 1.5}_{\text{spacing}} + \underbrace{2}_{\text{offset}} = 35.5\ \mu\text{m}
$$

Margin 要大到放得下 power ring，但為了面積又要越小越好。

Power ring 的寬度跟 core 需要的電流成正比，怎麼算見 [[Powerplan_blog#Power ring 要多寬|Power plan]]。實務上可以先隨便跑一次完整的 APR，看 power analysis 的結果，再決定 ring 要加寬還是縮窄。

## Innovus 的步驟

### 1. 讀入 I/O 檔

讀入在 design setup 時存出、調整過的 I/O 檔，決定每個 pin 在哪一邊、什麼位置。

### 2. 試擺放

先在 placement 的設定裡切到 floorplan mode，再做一次初步的擺放：

```tcl
place_design
refinePlace -checkRoute 1
```

### 3. Early global route

Route → Early Global Route，粗略地估計繞線。

### 4. 看 timing

Timing → Report Timing → Pre-Place。

> [!info] Timing 不過怎麼辦
> - 重新安排 I/O 的位置
> - 用更合適的 constraint 重新合成
> - 放寬 clock period

### 5. 分析 congestion

Route → NanoRoute → Analyze Congestion。有壅塞的地方可以用 `congRepair` 修。

### 6. 清掉試擺的結果

```tcl
unplaceAllInsts
editDelete -type Signal
```

這一步的擺放和繞線都只是用來評估的，看完 congestion map 就清掉，正式的 placement 和 routing 在後面的階段才做。
