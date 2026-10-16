---
title: Physical-aware 後端流程最佳化：Genus iSpatial、SDP 與 Clock Tree
date: 2026-06-11 10:00:00
layout: project
featured: false
part: SA-MACRO-N16
summary: RTL 一行不改，只改後端流程：替 N16 製程上的一顆 systolic array macro，在 DC／Innovus 的流程裡加上 Genus iSpatial physical-aware 合成、Structured Data Path 相對擺放，以及 H-tree／skew group 時脈樹，逐項和 baseline 比較並做 ablation。SDP 把最高頻率從 1640 推到 1710 MHz，skew group 把功耗降到 145.19 mW；iSpatial 在 1700 MHz 下比一般的 Genus 合成省了 29.7% 功耗。
period: 2026 Spring
role: Genus iSpatial synthesis flow · Genus → Innovus handoff
course: 清大 EE5254 高等數位晶片設計流程 期末專題
team: 3 人小組
stack: [Tcl, N16 FinFET]
tools: [Genus, Innovus, Design Compiler]
tags: [APR, Physical Design, Clock Tree Synthesis, Systolic Array]
floorplan: [iSPATIAL SYN, SDP GRID 8×4, H-TREE, SKEW GROUP, SRAM I/O]
metrics:
  - { label: Fmax, value: 1710 MHz, note: "SDP grid · baseline 1640 MHz (+4.3%)" }
  - { label: Power, value: 145.19 mW, note: "CTS skew group · baseline 154.46 mW (−6.0%)" }
  - { label: iSpatial, value: "−29.7%", note: "power vs. logical Genus · 215.97 → 151.79 mW @ 1700 MHz" }
  - { label: Die, value: "490.86 × 490.752 µm", note: "N16 · fixed for every ablation run" }
---

## Overview

這是大四下修的 EE5254 Advanced Digital Design Flow 的期末專題。題目很單純：**RTL 一行都不改**，只改後端流程，看同一顆設計可以推到多快、多省電。

設計是課程作業用的 `sa_macro`，一顆帶 SRAM 的 systolic array macro，製程是 N16（16 nm FinFET）。原本的流程是常見的組合：Synopsys Design Compiler（DC）合成，netlist 交給 Cadence Innovus 做 APR（auto place & route）。製程縮小之後，線的延遲早就超過電晶體本身的 gate delay [3]，而這個流程在合成階段完全看不到線。它有三個弱點，我們各用一招對付：

| 弱點 | 對策 |
| --- | --- |
| DC 合成時只有 wire-load model 估的線延遲，沒有任何實體資訊；到了 APR 又要從頭 floorplan、placement | **Genus iSpatial**：合成時就讀進 floorplan、把 cell 擺好，用抽出來的 RC 算 net delay，交給 Innovus 時已經是擺好的設計 |
| systolic array 裡有大量一模一樣、規則排列的 register，一般的 placer 不知道它們的關係，擺得四散，線又長又亂 | **SDP（Structured Data Path）**：用相對擺放把 register 釘成和 PE 陣列一樣的格子 |
| 在不規則的 placement 上長出來的 clock tree 不平衡，也很難針對最差的路徑調整 | **H-tree** 讓每個分支的延遲一致；**skew group** 把最差路徑的起點獨立出來，單獨調它的 clock 到達時間 |

![左：原本的流程；右：我們的流程。iSpatial 把合成、floorplan、powerplan 與 placement 合成一個 physical-aware 的階段，placement 時套上 SDP 約束，CTS 時用 H-tree 與 skew group](/images/physical-aware-backend-flow/flow-comparison.png)

每一招都和 DC／Innovus 的 baseline 比較，最後再把它們組合起來做 ablation。單項最好的結果：SDP 把最高頻率從 1640 MHz 推到 **1710 MHz**（+4.3%），skew group 把功耗從 154.46 mW 降到 **145.19 mW**（−6.0%）；iSpatial 在 1700 MHz 下，功耗比一般（logical）的 Genus 合成少了 **29.7%**。但三招疊在一起，並沒有變得更好。

## 設計：sa_macro

![課程提供的 sa_macro：8×4 的 systolic array（左）與其中一個 PE（右）。weight 從左邊的 Weight FIFO 進入，activation 從上方的 Activation FIFO 進入](/images/physical-aware-backend-flow/systolic-array-pe.png)

`sa_macro` 的核心是 8×4 的 systolic array：每一列（Cout #0–#7）由一個 Weight FIFO 餵 weight，每一行由 Activation FIFO 餵資料。每個 PE 裡有三組 register：傳給下一個 PE 的 data register `d_ff`、weight register `w_ff`，以及存累加結果的 `accu`；register 之間是乘法器和累加用的加法器。陣列旁邊是 SRAM macro，擺在 core 的上方。

## Genus iSpatial：合成時就把 cell 擺好

這是我負責的部分。

### 先在 Genus 重現 DC 的流程

為了讓兩套工具站在同一個起跑點，第一步是用 Genus 原生的指令，把原本 DC 的 golden flow 一步一步重做出來：

| DC 流程 | Genus 的對應 |
| --- | --- |
| `analyze` / `elaborate` / `link` / `uniquify` | `read_hdl` / `elaborate` / `uniquify` |
| 套用 timing constraint | `read_sdc` |
| `compile_ultra` | 拆成 `syn_generic` → `syn_map` → `syn_opt` 三個階段 |
| standard cell 與 SRAM 的 Liberty | 用 `set_db` 設定（physical flow 改用 MMMC 的 library set） |
| dont_use 清單 | `.avoid` attribute |
| latch-based clock gating | `lp_clock_gating_*` attributes |

DC 腳本裡的 library 與 design intent 全部保留，這樣兩邊的差別只來自合成引擎本身。

### 打開 iSpatial

第二個版本開啟 iSpatial 的 physical-aware 合成：

1. Timing 環境用 MMMC（Multi-Mode Multi-Corner）定義一次，之後 Innovus 直接沿用同一份 corner 定義。
2. 用 `read_physical` 讀進 tech、standard cell 與 SRAM 的 LEF，用 `read_def` 讀進含 I/O pin 位置的 floorplan。
3. 每個合成階段都加上 `-spatial`，讓 Genus 在 floorplan 上實際擺放 cell，並用抽出來的 RC 計算 net delay，而不是 wire-load model。

### 交給 Innovus

因為 placement 與寄生參數已經和後端一致，結果用 `write_design -innovus` 匯出成 Innovus 可以直接讀的一整包。APR 時，Genus 的 placement DEF 先用 `init_def_file` 註冊，`init_design` 時再以 `defIn` 讀入，cell 就停在 iSpatial 擺好的位置。原本的 `floorPlan` 指令註解掉，APR 直接往下做 routing 與最佳化，省掉重新 placement 的工夫。

Genus 的 iSpatial flow 也能套用 SDP 約束，不過要等 mapping 完成之後才行。

## SDP：把 register 排成格子

SDP（Structured Data Path）是一種相對擺放的方法：描述 cell 之間的相對關係（同一列、同一行或照某個順序），再給這一組一個原點。Innovus 有三種定義方式：SDP Tcl 指令、SDP browser（GUI），以及相對擺放檔（relative-placement file）。我們用第三種，用 `readSdpFile` 讀進檔案、設定好 SDP 的選項，再跑 `place_opt_design`。整個流程是：

1. Import design
2. 定義 SDP 約束（SDP 檔或 SDP Tcl 指令）
3. 帶著 SDP 跑 `place_opt_design`
4. （選擇性）檢查 SDP 的對齊、congestion 與 timing，必要時調整行列，再回到第 3 步
5. Route

### 約束什麼

每個 PE 裡有兩種東西：sequential 的 register（`d_ff`、`w_ff`、`accu`），以及 register 之間的組合邏輯（乘法器與加法器）。只有 register 能可靠地綁進 SDP 約束。

第一次嘗試時我們把 PE 裡的所有東西都約束住，但這行不通：合成時 DC 會重組組合邏輯，那些 cell 沒有穩定、能一對一對應的名字。register 不一樣，合成之後還是以固定的名字存在，可以直接在 `01_netlist_to_gds` 產生的 netlist 裡找到，正好拿來當相對擺放格子的錨點。register 釘住之後，Innovus 會在滿足 route 距離與 timing 的前提下，把周圍的組合邏輯和沒有約束的 accumulator 擺在附近。

### 用腳本產生 SDP 檔

register 有好幾千個，不可能手寫位置。好在 PE 裡 register 的名字有固定的規則：

```text
systolic_array_u0/cin${c}/ch_out[${i}].pix_out[${j}].genblk1.uPE/d_ff_reg[7:0]
```

所以我們寫了一支 Tcl 腳本（`gen_sa_macro_sdp_v2.tcl`），從幾個參數產生整份 `.sdp` 檔：每個 SDP group 的原點是 `(start_x, start_y)`，group 之間水平間距 `pitch_x`、垂直間距 `pitch_y`；兩層迴圈走過 8 個 `ch_out` 和 4 個 `pix_out`，產生 8 列 × 4 行的 PE group，和 systolic array 的排列一致。每個 group 裡，cin0–cin7 的 `d_ff_reg[7:0]` 沿著下緣排，`w_ff_reg[3:0]` 沿著右緣排。改參數就能重新產生，位置、間距和結構都能很快驗證。

### 兩個設計決定

**1. 整個格子往上移。** 最初的 SDP 擺放裡，經過 systolic array 的最差 timing path 太長：格子在 core 裡擺得太低，data register 離它們的 timing-critical 端點太遠，拉長了主要的路徑。我們把整個 SDP 結構往上移，讓陣列靠近 SRAM，最差路徑變短，STA 在所有版本裡最高的頻率下也沒有 violation。原點往下移的兩個版本（Ver 1-1、Ver 1-2）則是反方向的對照。

**2. Accumulator 不約束。** 只約束 data／weight register，accumulator 放著不管。這樣被約束的 register 行列之間留有空間，Innovus 可以把 accumulator 和 MAC 的組合邏輯放進去。保留這份 placement 與 routing 的自由，optimizer 才收得了 timing，不會像全部約束的版本一樣塞住。

## Clock tree：H-tree 與 skew group

### H-tree

H-tree 讓 clock tree 每個分支的長度相同，各分支的延遲因此一致，適合 systolic array 這種規則、對稱的排列。設定時先用 `create_ccopt_clock_tree_spec` 初始化 clock tree spec，定義 CTS non-default rule（NDR）用的 top、trunk、leaf 層，再建立 H-tree：

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

`-sink_grid` 是 H-tree 最底層有幾列、幾行 root，`-sink_grid_sink_area` 是每個 root 的寬和長，`-sink_grid_box` 是整個 H-tree 的範圍，`-trunk_cell` 和 `-final_cell` 指定 trunk 與最後一級用的 cell，這裡分別是驅動力 16 和 8 的 clock inverter。`synthesize_ccopt_flexible_htrees` 把 H-tree 長出來；如果 H-tree 和 placement blockage 重疊，flexible H-tree 會自動刪掉衝突的 root，不需要手動設定 blockage。最後一定要再跑一次 `ccopt_design`，把還沒接上的 clock pin 接起來。

### Skew group

一般的 CTS 會盡量讓所有 sink 平衡；skew group 則是把特定的 register 分到獨立的群組，單獨設定它們的 skew 與 insertion delay，用來修 timing violation，以及 SRAM I/O 上嚴重的 IR drop。

```tcl
### set clock skew group
create_ccopt_skew_group -name sa_array -source clk -sinks topctrl_u0/dest_bb_reg/CP
set_ccopt_property target_insertion_delay 0.0035 -skew_group sa_array
```

`topctrl_u0/dest_bb_reg` 是 sign-off setup report 裡最差路徑的起點。我們把它的 clock pin 獨立成名為 `sa_array` 的 skew group，insertion delay 設為 0.0035 ns：這個 register 的 clock 早一點到，資料就早一點送出，後面那一段路徑的 setup margin 就變大。代價是 insertion delay 調整過頭，可能反過來造成 hold time violation，要小心平衡。

## 實驗結果

四組實驗：A 比較不同的合成方式；B 看 SDP 擺放對規則性與 timing 的影響；C 比較三種 CTS；D 是把幾招組合起來的 ablation。

### A. 合成方式

| 版本 | Frequency (MHz) | Power (mW) | Energy (pJ) | IR drop (V) |
| --- | ---: | ---: | ---: | ---: |
| Baseline（DC） | 1640 | 154.46 | 3,150,513 | 0.7 |
| Genus | **1700** | 215.97 | 4,249,654 | 0.69958 |
| Genus + iSpatial | **1700** | **151.79** | **2,986,781** | 0.69953 |
| DC Topology Mode | 1550 | 164.22 | 3,544,079 | 0.69968 |

- **DC → Genus**：最高頻率從 1640 提高到 1700 MHz（+3.7%），Genus 收 timing 比較積極。但 logical flow 的線延遲仍然是 wire-load model 估的，為了達到目標週期，它把 cell 做大、多插 buffer，功耗從 154.46 升到 215.97 mW（+39.8%）。
- **打開 iSpatial**：一樣是 1700 MHz，功耗降到 151.79 mW，比 logical Genus 少 29.7%，也比 DC baseline 低 1.7%。net delay 改用實際抽出的 RC 計算，optimizer 只在實體上真的需要時才加大驅動力，於是同時拿到最高的頻率和最低的功耗。
- **DC Topology Mode**：DC 自己的 physical-aware 選項沒有同樣的效果，頻率掉到 1550 MHz（−5.5%），功耗升到 164.22 mW（+6.3%），是四者中最差的。兩者都是 physical-aware，但 iSpatial 用的是真實 floorplan 抽出的 RC，timing 估得更準。這也是我們選 Genus iSpatial 當合成引擎的原因。

### B. SDP

| 版本 | Frequency (MHz) | Power (mW) | Energy (pJ) | IR drop (V) |
| --- | ---: | ---: | ---: | ---: |
| Baseline（一般 CTS） | 1640 | 154.46 | 3,150,513 | 0.700 |
| Ver 0（約束所有 register） | fail | – | – | – |
| **Ver 0-1（不約束 accu、pitch 較緊）** | **1710** | **153.38** | **3,000,418** | **0.852** |
| Ver 1-1（往下移） | 1600 | 160.79 | 3,361,616 | 0.846 |
| Ver 1-2（再往下移） | 1600 | 159.99 | 3,344,891 | 0.843 |
| hori v0（轉 90°） | fail | – | – | – |

能跑完的版本都通過了 sign-off 驗證。失敗的版本也列出來，因為正是它們幫我們找到正確的 SDP 策略。Ver 0-1 只綁 data 與 weight register、pitch 比較緊，產生乾淨規則的格子；sign-off STA 在 1710 MHz 沒有 violation，post-layout simulation 也通過。往下移的兩個版本都掉到 1600 MHz，反過來印證了「靠近 SRAM」的判斷。

### C. Clock tree

| 版本 | Frequency (MHz) | Power (mW) | Energy (pJ) | IR drop (V) | IR increase (V) |
| --- | ---: | ---: | ---: | ---: | ---: |
| Baseline（一般 CTS） | 1640 | 154.46 | 3,150,513.09 | 0.6999 | 0.034200 |
| H-tree | 1580 | 154.32 | 3,267,188.81 | 0.6997 | 0.028500 |
| Skew group | **1670** | **145.19** | **2,908,233.95** | 0.8798 | **0.000133** |

三種設定都通過 sign-off DRC／LVS、STA、post-simulation 與 PG integrity check。下面三張是 Innovus 的 clock tree debugger，縱軸是 clock 的延遲（ns）：

![一般 CTS：clock tree 明顯不平衡，最大延遲 0.19 ns](/images/physical-aware-backend-flow/cts-normal.png)

![H-tree：分支最平衡，最大延遲降到 0.15 ns](/images/physical-aware-backend-flow/cts-htree.png)

![Skew group：右邊多出一條獨立的 clock path，就是被分出來的 skew group；最大延遲 0.18 ns](/images/physical-aware-backend-flow/cts-skew-group.png)

- **一般 CTS**：clock tree 不太平衡，最大延遲 0.19 ns；IR drop 集中在 SRAM I/O。
- **H-tree**：最平衡，最大延遲降到 0.15 ns，但最高頻率反而最低（1580 MHz），主要的 IR drop 仍在 SRAM I/O。為了讓所有 sink 的延遲相等而強迫對齊，可能引入 setup 或 hold violation；多插的平衡用 buffer 也增加了能耗。
- **Skew group**：最大延遲 0.18 ns，其他指標卻全部最好：1670 MHz、145.19 mW、能耗最低，IR increase 只有 0.000133 V。SRAM 主導了整個電路的延遲與功耗，把它的 I/O 控制訊號 `dest_bb` 獨立成一個 skew group，就能針對性地最佳化：前一級的 clock 提早到，後面 SRAM I/O 電路的 setup margin 變大，IR drop 也跟著下降。

### D. Ablation

所有版本都用相同的條件合成與 APR：合成目標 2000 MHz、APR 目標 1800 MHz，固定面積 490.86 µm × 490.752 µm，SRAM macro 的位置也相同。名稱裡沒有 Genus 的版本都是用 DC 合成。所有版本都通過 sign-off DRC／LVS、STA、post-simulation，以及沒有未連接 net 的 PG integrity check。

| 版本 | Frequency (MHz) | Power (mW) | Energy (pJ) | IR drop (V) |
| --- | ---: | ---: | ---: | ---: |
| Baseline（DC） | 1640 | 154.46 | 3,150,513 | 0.6999 |
| Genus iSpatial | 1700 | 151.79 | 2,986,781 | 0.6995 |
| SDP | **1710** | 153.38 | 3,000,418 | 0.852 |
| H-tree | 1580 | 154.32 | 3,267,189 | 0.6997 |
| Skew group | 1670 | **145.19** | **2,908,234** | 0.8798 |
| Genus + SDP | 1700 | 196.12 | 3,859,065 | 0.845 |
| Genus + H-tree | **1710** | 195.54 | 3,825,151 | 0.6984 |
| SDP + H-tree | 1630 | 150.42 | 3,086,932 | 0.6997 |
| Genus iSpatial + SDP + H-tree | 1690 | 170.11 | 3,367,071 | 0.6996 |

- 最高頻率 1710 MHz 由 **DC + SDP** 和 **Genus + H-tree** 並列；最低的是 **DC + H-tree**（1580 MHz）。合成工具從 DC 換成 Genus，H-tree 就從最慢的設定變成最快的之一（1580 → 1710 MHz，+130 MHz）。
- 功耗與能耗方面，skew group 一路領先（145.19 mW、2,908,234 pJ），Genus + SDP 最差（196.12 mW、3,859,065 pJ）。整體來說，Genus 拿到較高的頻率，DC 的功耗效率比較好。
- Genus iSpatial + SDP + H-tree 三招合併，頻率比 baseline 高（1690 MHz），但不是最好的。

報告的結論是：這幾招不能疊加。每一招針對的是不同的瓶頸，疊在一起沒有更多好處；要選哪一招，取決於目標是最高頻率、最低功耗與能耗，還是整體的平衡。

## 回頭看：表上的數字怎麼讀

重新整理報告的表格時，有幾個地方值得再想一下。

### Energy 其實是 power 除以 frequency

每一列的 energy 都剛好等於

$$
E = P \times \frac{33{,}451}{f}
$$

例如 baseline：$154.46\ \text{mW} \times 33{,}451 / 1640\ \text{MHz} = 3{,}150{,}513\ \text{pJ}$。報告裡 13 個能跑完的版本無一例外。也就是說，每個版本都是在自己的最高頻率下跑同一段 33,451 個 cycle 的模擬，energy 只是 $P/f$ 乘上一個常數，沒有提供 power 和 frequency 以外的資訊。

這也代表 power 欄位是在不同的頻率下量的：Genus 的 215.97 mW 是在 1700 MHz、baseline 的 154.46 mW 是在 1640 MHz。比較效率時，每個 cycle 的能量 $P/f$ 比 mW 公平：

| 版本 | $P/f$ (pJ/cycle) | vs. baseline |
| --- | ---: | ---: |
| Skew group | 86.9 | −7.7% |
| Genus iSpatial | 89.3 | −5.2% |
| SDP | 89.7 | −4.8% |
| SDP + H-tree | 92.3 | −2.0% |
| Baseline（DC） | 94.2 | – |
| H-tree | 97.7 | +3.7% |
| Genus iSpatial + SDP + H-tree | 100.7 | +6.9% |
| DC Topology Mode | 105.9 | +12.5% |
| Genus + H-tree | 114.4 | +21.4% |
| Genus + SDP | 115.4 | +22.5% |
| Genus | 127.0 | +34.9% |

排名和 energy 欄位一樣，但用 pJ/cycle 看，skew group 的優勢從功耗上的 −6.0% 變成 −7.7%，因為它的頻率也比 baseline 高。

### 「三招合併」沒有用到 skew group

單項來看，功耗最低的是 skew group（145.19 mW），其次是 iSpatial（151.79 mW）；頻率最高的是 SDP（1710 MHz）。但 ablation 裡 skew group 沒有出現在任何一個組合裡，「三招合併」用的是 iSpatial + SDP + **H-tree**，而 H-tree 單獨使用時是頻率最低的設定（1580 MHz）。所以「不能疊加」這個結論，是在包含最弱一項的組合上看到的；最該補跑的組合應該是 iSpatial + SDP + skew group。

另外，Genus + SDP 與 Genus + H-tree 的功耗（196.12、195.54 mW）很接近 logical Genus（215.97 mW），離 iSpatial（151.79 mW）很遠，表上又特別把「Genus iSpatial」和「Genus」分開命名，推測這兩組用的是沒開 iSpatial 的 Genus。如果是這樣，它們多出來的功耗主要來自合成流程本身（實驗 A 已經看到 logical Genus 的 +39.8%），不一定是 SDP 或 H-tree 和 Genus 互相衝突。

### IR drop 欄位不能直接比

IR drop 欄的數字分成兩群：大約 0.70 V（baseline、iSpatial、H-tree 等）和 0.85–0.88 V（SDP 的各個版本、skew group、Genus + SDP）。從 clock tree debugger 裡 FF、SS 兩個 corner 的電壓（0.88 V、0.72 V）看，這個製程的供電在 0.72 V 到 0.88 V 之間；如果 0.70 V 真的是掉了的電壓，電路根本不會動，但這些版本都通過了 post-simulation。所以這一欄應該不是電壓降本身，比較可能是某個節點的電壓，兩群數字也許來自不同的分析條件。報告沒有交代這一欄的定義，所以我不拿它來比較；只有三種 CTS 才有的 IR increase 欄位，意思比較明確。

## 分工

三人小組。我負責 Genus iSpatial flow：在 Genus 重現原本的 DC 流程、建立 iSpatial 的 physical-aware 合成，並讓 Innovus 直接接手 Genus 的 placement。另外兩位組員分別負責 SDP flow，以及 H-tree 與 skew group。

## What I learned

- **合成看到的 timing 要有實體資訊才可信。** 只靠 wire-load model，Genus 為了保險把 cell 做大、多插 buffer，功耗多了 39.8%；同一個工具改用 floorplan 抽出來的 RC，頻率不變，功耗反而比 DC 還低。
- **約束要下在合成之後還認得出來的東西上。** 組合邏輯在合成時會被重組，名字不穩定；register 的名字留得下來，才適合當錨點。約束太多（連 accumulator 都綁住）反而讓 placer 沒有空間，timing 收不起來。
- **平衡不等於快。** H-tree 的 clock tree 最平衡、最大延遲最小，頻率卻最差；skew group 刻意讓一個點不平衡，反而拿到最好的功耗與 timing。CTS 要顧的是 critical path 的 slack，不是 skew 本身。
- **先弄清楚每一欄怎麼來的。** Energy 是 power 和 frequency 推出來的，power 又是在不同頻率下量的；ablation 也要把單項最好的那幾招組合起來跑，結論才站得住。

## References

1. Cadence Design Systems, *Innovus Implementation System User Guide*.
2. Cadence Design Systems, *Genus Synthesis Solution User Guide*.
3. J.-S. Kim, J. Kim, D.-J. Yang, et al., "Addressing Interconnect Challenges for Enhanced Computing Performance," *Science*, vol. 386, no. 6727, eadk6189, 2024.
