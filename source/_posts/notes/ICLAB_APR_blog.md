---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: APR：從 netlist 到 layout
date: '2025-11-14'
updated: '2026-10-16 00:24:06'
tags:
  - ICLAB
  - APR
summary: 用 Cadence Innovus 把合成後的 netlist 擺放、繞線成 layout 的完整流程：design setup、floorplan、power plan、placement、CTS、routing 到 sign-off。
permalink: notes/iclab-apr/
synced: obsidian
---

APR（auto placement and routing）依照 timing constraint 和 design rule，把合成出來的 gate-level netlist 擺放、繞線，變成 layout。ICLAB 用的工具是 Cadence Innovus。

## 晶片上有什麼

- **Core**：放 standard cell 的區域，RTL 描述的邏輯都在這裡，由 APR 自動處理。Core 裡也會有 macro：SRAM、clock generator、類比電路等預先做好的區塊。
- **I/O pad**：晶片對外的接腳，也負責內外電壓準位的轉換。
- **Power network**：把電送到每一個 cell。

## 流程總覽

| 步驟 | 做什麼 |
| --- | --- |
| 1. Design setup | 讀入 netlist、library 和 constraint |
| 2. Floorplan | 決定晶片的大小、I/O 和 macro 的位置 |
| 3. Power plan | 建立 power ring、stripe，接到每個 cell 的 power rail |
| 4. Placement | 擺放 standard cell |
| 5. CTS | 建立 clock tree |
| 6. Routing | 實際繞線 |
| 7. Sign-off | DRC、LVS、LEC、STA、power analysis |

## 1. Design setup

Innovus 需要的輸入：

| 類別 | 檔案 | 內容 |
| --- | --- | --- |
| Netlist | `.v` | 合成後的 gate-level netlist |
| Timing library | `.lib` | 各個 corner 下每個 cell 的 timing |
| Physical library | `.lef` | Cell 的形狀、pin 的位置、blockage；tech LEF 裡還有金屬層、spacing rule、電流密度 |
| Parasitic extraction | `.tch` | 估算繞線 RC 用的技術檔 |
| Timing constraint | `.sdc` | 和合成用的 constraint 語法相同 |
| MMMC | `.view` | Multi-mode multi-corner：不同電壓、溫度、製程 corner 的組合 |
| I/O | `.io` | I/O pin 的位置 |

Timing constraint 和合成時用的 SDC 一樣，但不需要：

- Corner：改在 MMMC 裡定義。
- Wire load model：layout 已經畫出來了，不用再估繞線的 RC。

> [!tip] 每一步都留一點 margin
> 例如目標是 4 ns：合成時壓 3.2 ns，APR 時壓 3.6 ns，sign-off 才用 4 ns。越後面的階段，繞線的影響越真實，timing 只會越來越差。

其他設定：

```tcl
setDesignMode -process 45
```

Power net 設成 `VDD`，ground net 設成 `VSS`。存出 I/O 檔之後可以手動調整，例如把 `clk`、`rst_n` 移到每一邊的中間，離邏輯比較近。

### Connect global nets

把每一個 standard cell 的 VDD、VSS pin，邏輯上接到全域的 VDD、VSS net（這時還沒有真的繞線）。這件事不是做一次就好：只要有新的 cell 被加進來，例如 CTS 插的 buffer、最佳化時換掉的 cell、tie cell，就要再跑一次。

## 2. Floorplan

見 [[Floorplan_blog|Floorplan]]。

## 3. Power plan

見 [[Powerplan_blog|Power plan]]。

## 4. Placement

- **Global placement**：先把 standard cell 大致擺好，同時估計 congestion，也就是某個區域的繞線密度。密度太高，到了 routing 階段可能會繞不出來。
- **Detailed placement**（`place_opt_design`）：把 cell 對齊到 row 上、消除重疊，同時最佳化。兩個目標會互相拉扯：
  - Timing-driven：有關聯的 cell 擺近一點，線短、delay 小。
  - Congestion-driven：擺鬆一點，留空間給繞線。

### Tie cell

邏輯上的常數 0 / 1 不能直接接到 VSS / VDD：電源上的突波可能直接打穿 gate。所以要經過 tie cell（tie-high、tie-low），它就像中間的一個 buffer。因為處理的是常數，不需要考慮 timing。

### Tap cell

沒有邏輯功能的實體 cell，裡面只有把 N-well 接到 VDD、P-substrate 接到 VSS 的擴散層和接觸孔，用來固定 well 的電位、防止 latch-up。每隔一段距離就要放一個。

## 5. Clock tree synthesis

合成時 clock 是 ideal network，CTS 才真正把 clock 接到每一個 flip-flop，中間插入 buffer 來平衡延遲。要盡量壓低兩個值：

- **Clock skew**：不同 flip-flop 收到 clock 的時間差。
- **Insertion delay**：從 clock source 到 flip-flop clock pin 的延遲。

這個階段最重要的是 hold time。Timing report 的起點從 clock source 開始，經過一串 clock buffer 才到 flip-flop。Hold 要成立，必須滿足：

$$
t_{launch} + t_{clk \to q} + t_{data} \ge t_{capture} + t_{hold}
$$

$t_{launch}$、$t_{capture}$ 分別是 clock 到達發送端和接收端 flip-flop 的時間。不等式不成立就是 hold violation：新的資料到得太快，把接收端還沒取樣完的舊資料蓋掉了。

## 6. Routing

用 NanoRoute 實際連接所有的金屬線和 via。這個階段要處理 signal integrity（crosstalk）和 antenna effect。

## 7. Sign-off

| 檢查 | 確認什麼 |
| --- | --- |
| DRC | Layout 符合製程的設計規則 |
| LVS | Layout 和 netlist 是同一個電路 |
| LEC | APR 後的 netlist 和 RTL（或合成後的 netlist）功能等價，見 [[ICLAB_LEC_blog\|LEC]] |
| STA | 用 RC extraction 得到的 SPEF 做最終的 timing 分析 |
| Post-layout simulation | 帶入 STA 產生的 SDF（真實的延遲）跑 netlist 模擬 |
| Power analysis | 用 post-layout simulation 的波形算功耗 |

Lab11 到 Lab13 把這整套流程從頭跑過一次，期末專題 [[3D Gaussian Splatting 硬體加速器]] 用的也是同一套 flow。
