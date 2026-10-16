---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 記憶體電路：SRAM、DRAM、ROM、Flash 與新興記憶體
date: '2024-11-12'
updated: '2026-10-16 14:36:27'
tags:
  - VLSI
  - Memory
summary: 記憶體的整體架構；6T SRAM 的讀寫機制、cell ratio 與 pull-up ratio、SNM 與 DRV；各種 sense amplifier；8T SRAM 與 CAM；DRAM 的 1T1C 與 charge sharing；NOR / OR-type ROM；Flash 的 floating gate；PCRAM、STT-MRAM、ReRAM；以及 process variation。
permalink: notes/vlsi-memory/
synced: obsidian
---

記憶體在現在的 SoC 裡常常佔掉一大半的面積和功耗。一顆記憶體同時包含數位電路、類比電路（sense amplifier、參考電壓），甚至高壓電路（Flash），所以這一章的範圍很廣。課程總覽見 [[VLSI_blog|積體電路設計導論筆記總覽]]。

## 記憶體的架構

- **Cell array**：存資料的 bit cell 排成陣列，同一列（row）共用一條 word line（WL），同一行（column）共用 bit line（BL）。
- **Decoder**：把位址解碼成 one-hot 的訊號，打開對應的那一條 word line。
- **Timing control**：產生 precharge、word line、sense amplifier 等各個訊號的時序。
- **讀寫電路**：讀取用的 sense amplifier（SA）、寫入用的 write driver。

![[vlsi-memory-architecture.svg|記憶體的架構：row decoder 打開一條 WL，這一列的 cell 把資料放到各自的 bit line 上，經過 column MUX 交給 sense amplifier]]


## SRAM

### 6T SRAM cell

一個 SRAM cell 由 6 顆電晶體組成：

- 兩個交叉耦合的反相器存資料，每個反相器由一顆 pull-up PMOS（PU）和一顆 pull-down NMOS（PD）組成，兩個儲存節點是 Q 和 QB。
- 兩顆 access transistor（pass gate，PG），gate 接 word line，分別把 Q 接到 BL、把 QB 接到 BLB。

所以每個 cell 有兩條 bit line（BL 和 BLB）。

![[vlsi-6t-sram.svg|6T SRAM cell：PU 和 PD 組成兩個交叉耦合的反相器存資料，PG 由 WL 控制，把 Q 和 Q̄ 接到兩條 bit line]]


### 讀取

同步 SRAM 的讀取時序：CEB（chip enable）和 WEB（write enable）都是 low active；位址和控制訊號在 clock edge 前後要各自滿足 setup time 和 hold time，資料在 clock 之後經過 $t_{CD}$（clock to data delay）出現在輸出。

讀取的機制：

1. BL 和 BLB 先 precharge 到 $V_{DD}$。
2. Word line 打開，存 0 的那一側經由 PG 和 PD 把它的 bit line 慢慢往下拉，另一側維持在 $V_{DD}$。
3. 兩條 bit line 之間出現一點電壓差，交給 sense amplifier 放大。

### 讀取的穩定度：cell ratio

讀取時，存 0 的節點會被「頂高」一點（voltage bump）：bit line 經由 PG 往節點灌電流，PD 往 GND 拉，節點電壓由 PG 和 PD 分壓決定。如果頂得太高，超過另一個反相器的切換點，cell 就會被翻掉，讀取反而把資料改壞了。

$$
\text{Cell ratio (CR)} = \frac{(W/L)_{PD}}{(W/L)_{PG}}
$$

CR 越大，PD 越強，節點越不容易被頂高，讀取越穩定。

### 寫入

寫入時，兩條 bit line 一樣先在 $V_{DD}$，再由 write driver 把要寫 0 那一側的 bit line 拉低。以 Q 原本是 1、要寫成 0 為例：

- BL 被拉低，BLB 維持在高電位。
- Q 經由 PG 被往下拉，同時 PU 把 Q 往上拉，兩者在比力氣。
- 只要 Q 被拉到另一個反相器的切換點以下，正回授就會完成翻轉。主導整個寫入的是把 Q 拉到 0 的這一側。

### Write margin：pull-up ratio

BL 要降到多低，cell 才會被成功寫入，這段電壓就是 write margin（WM）。這是 PG 和 PU 之間的競爭：

$$
\text{Pull-up ratio (PR)} = \frac{(W/L)_{PU}}{(W/L)_{PG}}
$$

PR 越大，PU 越強，越難寫入。

![[vlsi-sram-read-write.svg|左：讀取時 BL 經由 PG、PD 放電，Q 被頂高多少由 PG 和 PD 分壓決定。右：寫入時 PG 要把 Q 拉下來，同時 PU 在把 Q 往上拉]]


### 尺寸怎麼定

讀取要穩，PD 要比 PG 強；寫入要寫得進去，PG 要比 PU 強。所以 6T cell 的強弱順序是

$$
PD > PG > PU
$$

### Static noise margin（SNM）

SNM 是衡量 cell 穩定度最常用的指標：在兩個反相器之間串入兩個雜訊電壓源，cell 能承受、還不會翻掉的最大雜訊電壓就是 SNM。

![[vlsi-snm-butterfly.svg|SNM 的 butterfly curve。讀取時存 0 的節點被頂高，兩條曲線圍出的眼睛變小，SNM 也跟著變小]]


- $V_{DD}$ 越低，SNM 越小。
- **Read SNM < Hold SNM**：讀取時 PG 會把存 0 的節點頂高，cell 比單純保持資料時更脆弱。

### Data retention voltage（DRV）

SRAM 能可靠地保持資料的最低供電電壓。電壓低於 DRV，存的位元可能會翻轉，資料就遺失了。待機時把 $V_{DD}$ 降到略高於 DRV，是常見的省電做法。

## Array 與周邊電路

Sense amplifier 比 SRAM cell 大得多，不可能每一條 bit line 都配一個。所以會用 **column MUX**（Y-MUX）讓好幾條 bit line 共用一個 SA，由位址的一部分決定這次要讀哪一條。

## Sense amplifier

### 為什麼需要 SA

- **放大**：bit line 掛著一整行的 cell，電容很大，cell 的電流又很小，bit line 電壓變化很慢。SA 只需要很小的電壓差就能判斷出結果。
- **加速**：不用等 bit line 完整擺盪，word line 可以開得很短，差一點點就交給 SA。
- **省電**：bit line 不用完整地充放電。
- **恢復訊號**：DRAM 的讀取會破壞資料，SA 判斷完要把 bit line 拉到完整的電位，順便把資料寫回去。

### 種類

- **Differential SA**：輸入是兩條 bit line 之間的小訊號差，輸出單端的大訊號。兩條線上同樣的雜訊會互相抵銷（common-mode rejection）。適合有 BL 和 BLB 的 SRAM。又分成電壓感測（current mirror、latch 型）和電流感測。
- **Single-ended SA**：只有一條 bit line 的記憶體要用這種，例如 DRAM、ROM、Flash。

### Latch 型 SA（Type A）

兩個交叉耦合的反相器，輸入直接接在內部的兩個節點上：

- 兩個節點的電壓差決定 latch 往哪邊翻，正回授讓決定很快。
- 決定完之後電流就停了，沒有靜態功耗。
- 缺點：它會在判斷的過程中試著把 bit line 放電到 0，不能直接接在 bit line 上，需要額外的控制把兩者隔開。

### Latch 型 SA（Type B）

輸入改接到兩顆輸入電晶體的 gate，bit line 只看到 gate，所以**可以直接接在 bit line 上**。

運作分三個階段：

1. EN 打開，兩顆輸入電晶體依照兩個輸入的大小，以不同的速度對兩個輸出節點放電。
2. 其中一個節點先降到讓交叉耦合的電晶體導通，強烈的正回授把差距拉大。
3. 另一邊的電晶體關掉，latch 完成。

缺點：

- 同樣的尺寸下，Type A 的速度大約是 Type B 的兩倍（把 Type B 的尾電流電晶體加大，可以追上 A）。
- 可以看成兩級電路，offset voltage $V_{OS}$ 比 Type A 大。

Yield 和偏壓的關係：

- **$V_{INDC}$**（輸入端的直流偏壓）：$V_{INDC}$ 越低，偏壓電流越小，兩個輸出節點一開始拉開的電壓差越大，判斷越準。
- **$V_{DD}$**：$V_{DD}$ 越低 yield 越好，但影響比 $V_{INDC}$ 小，而且 delay 會變長。

### 電流型 SA

直接感測 bit line 上的電流，而不是電壓。需要一直有直流電流，所以比較耗電（可以用脈衝控制，只在需要時打開）。

- 左半部負責把兩條 data line 的電壓維持在一樣的值，bit line 的大電容不需要充放電。
- 右半部用 current mirror：一邊把 DL 上的電流 mirror 過來，另一邊把 DLB 上的電流 mirror 過來，在輸出節點相減，得到結果。

## 其他 SRAM cell

### Dual-port 8T SRAM

在 6T 的基礎上多一組 word line、一組 bit line 和兩顆 access transistor，可以同時有兩個存取：兩組輸入、兩組輸出。

代價是 voltage bump 更大：兩個 port 同時讀取時，存 0 的節點同時被兩顆 PG 頂高，read SNM 變差。

### Two-port 8T SRAM

把讀和寫分開：

- 寫入 port：WWL 加上 WBL、WBLB，跟 6T 一樣。
- 讀取 port：RWL 加上單一條 RBL，透過兩顆額外的電晶體讀。儲存節點只接到讀取電晶體的 gate，讀的時候不會被頂高，**沒有 voltage bump**。

讀取不會干擾存的值，所以適合在低電壓操作。

### 10T CAM

一般的記憶體是用位址找內容；**content addressable memory**（CAM）反過來，輸入一筆資料，找出它存在哪個位址。常用在 cache 的 tag 比對、查表。

10T CAM cell 是 6T SRAM 加上 4 顆比對用的電晶體：

- 寫入和 6T SRAM 一樣。
- 搜尋時，bit line 上放的是要比對的值，而不是 precharge 的 $V_{DD}$。
- 同一列的所有 cell 共用一條 **match line**，先 precharge 到高電位（NOR 型）。
- 每個 cell 的比對電路功能類似 XOR：存的值和搜尋的值不同時，比對電晶體導通，把 match line 放電。

只有每一個 bit 都相同的那一列，match line 才會維持在高電位。同時有好幾列 match 時，再用 priority decoder 挑一個。

## DRAM

### 1T1C cell

一顆電晶體加一顆儲存電容 $C_s$：

- **寫入**：打開 word line，由 bit line 把 $C_s$ 充到 $V_{DD}$ 或放到 0。
- **讀取**：bit line 先 precharge 到 $V_{DD}/2$，打開 word line 後，$C_s$ 和 bit line 的電容 $C_{BL}$ 做 charge sharing：

$$
\Delta V_{BL} = \left(V_{cell} - \frac{V_{DD}}{2}\right)\frac{C_s}{C_s + C_{BL}}
$$

$C_{BL}$ 遠大於 $C_s$，所以這個電壓差很小，要靠 SA 放大。

![[vlsi-dram-read.svg|1T1C DRAM 的讀取：BL 先 precharge 到 VDD/2，WL 打開後和 Cs 做 charge sharing，產生很小的 ΔV，再由 SA 放大]]


> [!note] 讀取是破壞性的
> Charge sharing 之後，$C_s$ 上原本的電荷已經被改掉了，所以每次讀完都要把資料寫回去（restore）。$C_s$ 上的電荷也會慢慢漏掉，所以 DRAM 需要定期 refresh。

### 儲存電容

$C_s$ 越大，讀取的訊號越大，所以儲存電容通常往垂直方向做，有疊在上面的 stacked capacitor，也有挖進基板的 trench capacitor。Stacked capacitor 又分兩種：

- **CUB**（capacitor-under-bitline）：cell array 和周邊電路的高度差很大，金屬線不好畫，還會有微影對準（lithographic alignment）的問題。
- **COB**（capacitor-over-bitline）：沒有微影對準的問題，電容也比較容易做大。

### DRAM 的 sense amplifier

- Bit line precharge 到 $V_{DD}/2$。
- 用交叉耦合的反相器放大：NMOS 把比較低的那條 bit line 放電到 0，PMOS 把比較高的那條充到 $V_{DD}$。
- 放大完 bit line 是完整的電位，剛好順便把資料寫回 cell。

## ROM

Read-only memory 的內容在製造時就決定了，之後只能讀、不能改。適合開發完就不會再變的程式和資料，面積小，資料也比較安全。

- **NOR-type ROM**：bit line 先 precharge 到 1。Word line 打開時，如果那個位置有電晶體接到 GND，bit line 被拉成 0；沒有電晶體就維持 1。
- **OR-type ROM**：bit line 先 pre-discharge 到 0。Word line 打開時，如果那個位置有電晶體接到 $V_{DD}$，bit line 被拉成 1；沒有就維持 0。

![[vlsi-nor-rom.svg|4 × 4 的 NOR-type ROM：有電晶體的位置存 0，沒有的存 1]]


NOR-type ROM 的 code 可以用不同的光罩層來決定：

- **Diffusion ROM**：用 diffusion 層決定，code 1 是沒有電晶體，code 0 是有電晶體。
- **Contact ROM**：每個位置都有電晶體，用 contact / via 層決定，code 1 是 cell 和 bit line 之間沒有 contact，code 0 是有 contact。面積比較大，但成本比較低：contact 在製程的後段，換 code 時前面的步驟都可以照舊。

我在這門課的期末專題就是一顆 contact ROM，見 [ROM macro 全客製化設計](/projects/rom-macro/)。

## Flash

Flash 的 cell 是一顆有 **floating gate** 的電晶體：control gate 和通道之間多夾了一層被絕緣層包住的 gate。Floating gate 上有沒有電子，會改變電晶體的 threshold voltage，資料就存在這裡，斷電也不會消失。

- **Program**：在 gate 和 drain 都加高電壓，用 channel hot electron injection 把電子打進 floating gate。
- **Erase**：用高電壓在 floating gate 和基板之間建立很強的電場，靠 F-N tunneling 把 floating gate 裡的電子趕走。（早期的 EPROM 是用紫外光照射整顆晶片來清除。）
- **Read**：只用一條線感測，cell 的電流很小。

### NOR flash 與 NAND flash

- **NOR flash**：可以 random access，讀取快，適合存程式碼。
- **NAND flash**：一次只能讀寫一整個 page，讀取比較慢，但寫入快、密度高，適合存資料。

| | NAND | NOR |
| --- | --- | --- |
| 密度 | 高 | 低 |
| 讀取速度 | 慢 | 快 |
| 寫入速度 | 快 | 慢 |
| 抹除速度 | 快 | 慢 |

### MLC

原本一個 cell 只存 0 或 1 兩種狀態。Multi-level cell（MLC）把 floating gate 裡的電子數量分成更多個等級，對應到多個不同的 threshold voltage，一個 cell 就能存好幾個 bit。

## 新興記憶體

這幾種新興的記憶體都用**電阻**來存資料：高電阻狀態（HRS）和低電阻狀態（LRS）各代表一個值。

| 種類 | HRS | LRS |
| --- | --- | --- |
| PCRAM（phase change） | 非晶態（amorphous） | 結晶態（crystalline） |
| STT-MRAM（spin-torque transfer） | 兩層磁化方向反平行 | 兩層磁化方向平行 |
| ReRAM（resistive） | 導電細絲斷開 | 導電細絲連通 |

各自的挑戰：

- **PCRAM**：電阻會隨時間慢慢漂移（結構鬆弛）；反覆寫入之後，cell 之間的差異變大；set 和 reset 需要的條件（時間、電流）不一樣。
- **STT-MRAM**：兩個電阻狀態差得不多，讀取的 margin 很小；特性跟溫度有關；寫入電流和讀取電流之間的差距越來越小，讀的時候可能不小心改寫資料。
- **ReRAM**：電阻值的變異很大。

## Process variation

- **Local variation**：同一顆 die 上、彼此相鄰的電晶體之間的差異。來自原子數量和位置的隨機差異，例如摻雜原子的數量不同，造成 $V_{th}$ 的隨機 mismatch，很難控制。
- **Global variation**：不同批次、不同 wafer、不同 die 之間的差異，來自通道長度、寬度、氧化層厚度等等的偏移，大致可以被製程控制住。

SRAM 和 sense amplifier 都靠一對電晶體互相比較，對 local mismatch 特別敏感。陣列裡的 cell 數量非常多，就算只有分佈尾端極少數的 cell 失效，整顆記憶體也就壞了，這也是 SRAM 的最低操作電壓很難再往下降的原因。
