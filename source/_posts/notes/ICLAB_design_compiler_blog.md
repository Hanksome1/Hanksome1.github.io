---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Design Compiler 使用筆記
date: '2025-10-09'
updated: '2026-10-16 00:24:06'
tags:
  - ICLAB
  - Synthesis
  - STA
summary: Synopsys Design Compiler 的 library 設定、合成流程、compile log 每一欄的意思，以及合成階段的 delay 和 power 是怎麼估出來的。
permalink: notes/iclab-design-compiler/
synced: obsidian
---

## 輸入

- **Technology library**：基本的邏輯閘和 flip-flop（AND、OR、DFF…）
- **DesignWare library**：Synopsys 提供的複雜元件和演算法（加法器、乘法器、比較器…）。RTL 寫 `a * b` 時，DC 會從 DesignWare 挑一個符合 timing 的乘法器架構。
- **Constraint**：設計者下的指令，控制 DC 往哪個方向最佳化。

兩種 library 都是跟製程綁在一起的檔案。ICLAB 用的是 Cadence 的 45 nm generic PDK（GPDK45），library 設定長這樣：

```tcl
set search_path       ". /usr/cadtool/GPDK45/gsclib045_svt_v4.4/gsclib045/db/ $search_path"
set target_library    "slow_vdd1v2_basicCells_wl.db"           ;# 合成時可以用的 standard cell
set link_library      "* $target_library dw_foundation.sldb"    ;# 解析 reference 時會去找的 library
set symbol_library    "generic.sdb"                             ;# Design Vision 畫 schematic 用
set synthetic_library "dw_foundation.sldb"                      ;# DesignWare

# 辨認同步 reset，避免 reset 和一般邏輯混在一起被最佳化
set hdlin_ff_always_sync_set_reset true
```

## 流程

1. **Read**：讀入 RTL。
2. **Elaborate**：把 parameter 展開。同一個 `.v` 檔用不同的參數實例化，實際上是好幾個不同的電路，elaborate 之後才會變成各自獨立的 design。
3. **Uniquify**：同一個 module 被實例化很多次時，讓每個 instance 都有自己的一份 design，才能依各自的情況分別最佳化。同樣是加法器，在 critical path 上的要做快，其他的可以做小。DC 預設會做。
4. **Compile**：mapping 到 library 的 cell，同時最佳化。
5. **Report、寫出 netlist**。

合成完要確認 netlist 和 RTL 邏輯等價。Synopsys 的工具是 Formality，ICLAB 用的是 Cadence Conformal，見 [[ICLAB_LEC_blog|LEC]]。

## 最佳化的種類

- **Datapath**：例如把乘法和加法合起來做。
- **Timing**：在 constraint 給的時間內，把所有運算做完。
- **Area**：在 timing 滿足的前提下，把面積做小。
- **Power**：要知道每個訊號的 toggle rate 才能估，沒有實際的 pattern 時只能用猜的。

## 看懂 compile log

Compile 的過程中，DC 會一直印出目前的狀態：

| 欄位 | 意思 |
| --- | --- |
| Worst neg slack | 最差的路徑違反了多少時間。例如 clock 設 10 ns，這一欄是 3.33，代表最慢的路徑需要 13.33 ns |
| Total setup cost | 所有違反 setup 的路徑，negative slack 的總和 |
| Design rule cost | 違反 max transition、max capacitance、max fanout 這些 design rule 的總量 |

Design rule 存在的原因是：cell delay 是查 library 裡的表格算出來的，表格以 input transition 和 output load 為索引。transition 或負載超出表格的範圍時只能外插，算出來的 delay 不可信。

Log 的順序大致是：

1. 先把 timing 壓下來
2. Design rule fixing
3. Area recovery：在不破壞 timing 的前提下縮小面積

如果 design rule cost 突然跳得很高，通常是工具為了壓 timing 開始用很大的 cell、推很大的負載，後面的 design rule fixing 有機會再修回來。

## 常用的 constraint

```tcl
set_ideal_network [get_ports clk]
set_max_fanout    <N> [current_design]
set_max_area      0
set_input_delay   <delay> -clock clk [all_inputs]
```

- `set_ideal_network`：沒設的話，DC 會把 clock 當成一般訊號，看到它接了所有的 flip-flop、負載超大，就開始插 buffer。Clock tree 應該留給 APR 的 CTS 來做。
- `set_max_fanout`：限制一條線最多接幾個輸入。
- `set_max_area 0`：要求面積越小越好，timing 滿足後會繼續做 area recovery。
- `set_input_delay`：輸入訊號在 clock 邊緣之後多久才會到，代表前一級 module 的組合邏輯已經用掉的時間。

## Port 與 pin

- **Port**：目前這個 design 自己的 I/O。
- **Pin**：design 裡面某個 instance（reference）的 I/O。

## Static timing analysis

STA 不跑模擬，而是檢查每一條 timing path 的最壞情況。Timing path 的起點是 input port 或 flip-flop 的 clock pin，終點是 output port 或 flip-flop 的 D：

- input → flip-flop
- flip-flop → flip-flop
- flip-flop → output
- input → output

每一段的 delay 由 cell delay 和 net delay 組成：

$$
t_{cell} = f\left(t_{transition,\,in},\ C_{net} + C_{pin}\right), \qquad
t_{net} = f\left(R_{net},\ C_{net} + C_{pin}\right)
$$

合成的時候只知道 $C_{pin}$（library 裡有），$R_{net}$、$C_{net}$ 要等 layout 畫出來才知道，所以合成階段用 wire load model 估計。到了 APR 也還只是初估，做完 RC extraction 的數字才可信。製程越先進，wire 的影響越大。

## Power

$$
P_{total} = P_{switching} + P_{internal} + P_{leakage}
$$

- **Switching**：對負載電容充放電。
- **Internal**：cell 內部的功耗，包含輸入轉態時 VDD 到 GND 短暫導通的 short-circuit current。Input transition 越慢，短路的時間越長。
- **Leakage**：電晶體關閉時仍然存在的漏電。

動態功耗的推導見 [[Dynamic Power]]。

## 一點心得

合成工具可以把邏輯化簡得很好，但 pipeline 要切在哪裡、哪裡要放 flip-flop，還是要人決定。寫 RTL 時要怎麼配合工具，見 [[ICLAB_Synthesis_blog|coding for synthesis]]。
