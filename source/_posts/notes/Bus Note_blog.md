---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 晶片內的 bus：APB、AHB、AXI
date: '2026-10-27'
updated: '2026-10-29 21:20:49'
tags:
  - Bus
  - SoC
summary: 晶片裡的 CPU、DMA、加速器和周邊用 AMBA 的 APB、AHB、AXI 互相溝通。這篇整理 bus 的基本概念，以及三種 bus 各自怎麼傳資料：APB 的 setup / access、AHB 的 pipeline、AXI 的 5 個 channel 和 VALID / READY handshake。
permalink: notes/bus-amba/
synced: obsidian
---

一顆 SoC 裡有 CPU、DMA、加速器、SRAM、一堆周邊，這些模組之間怎麼傳資料，靠的是 on-chip bus 的規格。晶片內的線只走幾 mm、跟著 clock 同步、可以很寬（32～512 bit），最常見的是 ARM 制定的 AMBA 家族：APB、AHB、AXI。晶片對外接 DRAM、SSD、USB 裝置的介面寫在 [[Bus Note_Interface_blog|晶片對外的介面：DDR、PCIe、USB]]。

![[bus-soc-overview.svg|一顆 SoC 的典型架構：master 經過 AXI interconnect 存取各個 slave；低速周邊掛在 APB 上；DDR、PCIe、USB 的 controller 在晶片內、PHY 負責對外]]

## 基本概念

- **Master / Slave**：發起讀寫的一方是 master（CPU、DMA、加速器），回應的一方是 slave（SRAM、DDR controller、周邊的暫存器）。AMBA 5 之後改叫 manager / subordinate，意思一樣。
- **Memory-mapped**：每個 slave 分到一段位址，master 讀寫哪個位址，interconnect 裡的 decoder 就把請求送到哪個 slave。軟體眼中，控制一個周邊就是讀寫幾個位址。
- **Address map**：位址怎麼切由 SoC 決定，例如：

| 位址範圍 | 對應 |
| --- | --- |
| `0x0000_0000` – `0x0000_FFFF` | Boot ROM |
| `0x2000_0000` – `0x2003_FFFF` | SRAM |
| `0x4000_0000` – `0x4000_0FFF` | UART 的暫存器（APB） |
| `0x4000_1000` – `0x4000_1FFF` | GPIO 的暫存器（APB） |
| `0x8000_0000` – `0xFFFF_FFFF` | DDR |

- **Transfer / beat / burst**：一個 beat 是一個 clock 傳一個 data width 的資料；burst 是只給一次起始位址、連續傳好幾個 beat。
- **Handshake**：雙方用 valid / ready（或 select / enable / ready）確認這一拍資料真的傳出去了。Slave 還沒準備好就把 ready 拉低，叫做 wait state 或 back-pressure。
- **Arbiter**：好幾個 master 要用同一個 slave 時，由 arbiter 決定誰先。
- **頻寬**：理論頻寬 = data width × clock 頻率。128-bit、1 GHz 的 AXI bus 理論上是 16 GB/s，實際會被 wait state、arbitration、位址切換吃掉一部分。

## AMBA：APB、AHB、AXI

AMBA（Advanced Microcontroller Bus Architecture）是 ARM 公開、免授權費的 on-chip bus 規格，幾乎所有 SoC 和 FPGA 的 IP 都用它。版本的演進：

| 版本 | 年份 | 主要內容 |
| --- | --- | --- |
| AMBA 2 | 1999 | AHB、APB |
| AMBA 3 | 2003 | AXI3、AHB-Lite、APB3（加 `PREADY`、`PSLVERR`） |
| AMBA 4 | 2010 | AXI4、AXI4-Lite、AXI4-Stream、APB4、ACE（cache coherence） |
| AMBA 5 | 2013 起 | CHI（多核心 coherent interconnect）、AHB5、AXI5 |

三種 bus 的定位：

| | APB | AHB | AXI |
| --- | --- | --- | --- |
| 用途 | 低速周邊的暫存器 | 中速；小型 MCU 的主 bus | 高效能主 bus |
| 一次傳輸最少 | 2 個 cycle | 1 個 cycle（pipeline） | 1 個 cycle |
| Pipeline | 沒有 | address / data 兩級 | 5 個 channel 各自獨立 |
| Burst | 沒有 | 有，固定長度最多 16 beats | 有，AXI4 最多 256 beats |
| 同時進行的傳輸 | 1 筆 | 1 筆 | 多筆（outstanding），可以亂序完成 |
| 讀寫同時 | 不行 | 不行 | 可以，讀寫走不同 channel |
| 面積、複雜度 | 最小 | 中 | 最大 |

實際的 SoC 通常三種混用：CPU、DMA、DDR 走 AXI；UART、GPIO、timer 這種一秒才讀寫幾次的周邊掛在 APB 上，中間用一個 AXI-to-APB bridge 轉接。

### APB

APB（Advanced Peripheral Bus）的設計目標是簡單、省面積、省電。沒有 pipeline、沒有 burst，一次只做一筆傳輸。

主要訊號：

| 訊號 | 方向 | 意思 |
| --- | --- | --- |
| `PADDR` | M → S | 位址 |
| `PSEL` | M → S | 選中這個 slave（每個 slave 一條） |
| `PENABLE` | M → S | 進入 access phase |
| `PWRITE` | M → S | 1 = 寫、0 = 讀 |
| `PWDATA` / `PRDATA` | M → S / S → M | 寫入 / 讀出的資料 |
| `PREADY` | S → M | Slave 完成了（APB3） |
| `PSLVERR` | S → M | 傳輸出錯（APB3） |
| `PSTRB` / `PPROT` | M → S | Byte 寫入遮罩 / 保護等級（APB4） |

每筆傳輸分兩個 phase：

1. **Setup**：`PSEL = 1`、`PENABLE = 0`，位址和控制訊號放上去，固定一個 cycle。
2. **Access**：`PENABLE = 1`。Slave 把 `PREADY` 拉高的那個 clock edge，傳輸完成；`PREADY = 0` 就繼續等。

![[bus-apb-write.svg|APB 寫入，slave 插了一個 wait state：T1 進入 setup，T2 進入 access，T3 時 PREADY 還是 0，T4 才完成]]

所以 APB 每筆至少 2 個 cycle。寫一個 APB slave 很簡單，下面是一個只有兩個暫存器、永遠不需要等的 slave：

```verilog
// 一個 APB slave：offset 0x000 是可寫的控制暫存器，0x004 是唯讀的狀態暫存器
assign PREADY  = 1'b1;   // 不插 wait state
assign PSLVERR = 1'b0;

always @(posedge PCLK or negedge PRESETn) begin
    if (!PRESETn)
        ctrl <= 32'd0;
    else if (PSEL && PENABLE && PWRITE && PADDR[11:0] == 12'h000)
        ctrl <= PWDATA;
end

always @(*) begin
    case (PADDR[11:0])
        12'h000: PRDATA = ctrl;
        12'h004: PRDATA = status;
        default: PRDATA = 32'd0;
    endcase
end
```

### AHB

AHB（Advanced High-performance Bus）比 APB 多了 pipeline 和 burst。每筆傳輸分成 **address phase** 和 **data phase**，下一筆的 address phase 和這一筆的 data phase 重疊，所以每個 cycle 都能完成一筆。

![[bus-ahb-pipeline.svg|AHB 的 pipeline：B 的 data phase 被 HREADY = 0 延長一拍，C 的 address phase 也跟著被延長]]

主要訊號：

- `HADDR`、`HWRITE`、`HSIZE`（一個 beat 幾 byte）、`HBURST`（`SINGLE`、`INCR`、`WRAP4`、`INCR4`… 到 16 beats）
- `HTRANS`：這一拍的狀態，`IDLE`、`BUSY`、`NONSEQ`（burst 的第一個 beat 或單筆）、`SEQ`（burst 後續的 beat）
- `HWDATA` / `HRDATA`
- `HREADY`：slave 還沒好就拉低，**整條 pipeline 一起停**，包括下一筆的位址
- `HRESP`：`OKAY` 或 `ERROR`

最早的 AHB 支援多個 master，要有 arbiter（`HBUSREQ`、`HGRANT`）和 split / retry 這些機制，很複雜。AMBA 3 推出 AHB-Lite：只有一個 master，多 master 的情況交給外面的 interconnect 處理。現在 Cortex-M 系列的 MCU 大多用 AHB-Lite（AHB5）。

AHB 的限制在於讀和寫共用同一組控制訊號，而且一次只能有一筆在 data phase。如果 slave 是 DDR 這種要等幾十個 cycle 才回資料的東西，整條 bus 就卡在那裡。

### AXI

AXI（Advanced eXtensible Interface）把一次傳輸拆成 5 個獨立的 channel，每個 channel 有自己的 `VALID` / `READY` handshake：

![[bus-axi-channels.svg|AXI 的 5 個 channel：寫入用 AW、W、B，讀取用 AR、R]]

| Channel | 方向 | 內容 |
| --- | --- | --- |
| AW（write address） | M → S | 起始位址、burst 長度、ID |
| W（write data） | M → S | 資料、`WSTRB`（哪些 byte 要寫）、`WLAST` |
| B（write response） | S → M | 寫入結果 `BRESP` |
| AR（read address） | M → S | 起始位址、burst 長度、ID |
| R（read data） | S → M | 資料、`RRESP`、`RLAST` |

讀只要兩個 channel：master 從 AR 送位址，slave 從 R 回資料。寫要三個：位址走 AW，資料走 W，全部寫完 slave 再從 B 回一個 response。因為讀寫分開，同一時間可以一邊讀一邊寫。

**VALID / READY handshake**。傳送端（source）有資料就拉 `VALID`，接收端（destination）能收就拉 `READY`，兩個在同一個 clock 上升緣都是 1，這筆就傳出去了。

![[bus-valid-ready.svg|VALID / READY 的三種情況，傳輸都發生在兩者同時為 1 的上升緣]]

規格裡有兩條規則一定要守：

- `VALID` 一旦拉高，在 handshake 完成之前不能放掉，資料也不能變。
- `VALID` 不能等 `READY`。`READY` 可以等 `VALID`，反過來不行，否則兩邊互相等就 deadlock。

```verilog
// 錯：等到 READY 才拉 VALID。如果另一邊也是等 VALID 才拉 READY，兩邊會一直互等
assign m_valid = have_data && m_ready;

// 對：有資料就拉 VALID，VALID && READY 的那一拍才算傳出去
assign m_valid = have_data;
assign fire    = m_valid && m_ready;
```

**Burst**。位址 channel 只給起始位址，後面的位址由 slave 自己算：

- `AxLEN`：burst 有幾個 beat（填的是 beats − 1）。AXI4 的 `INCR` 最多 256 beats，`FIXED` 和 `WRAP` 最多 16。
- `AxSIZE`：每個 beat 幾 byte。
- `AxBURST`：`FIXED`（位址不變，例如一直讀同一個 FIFO）、`INCR`（位址遞增，最常用）、`WRAP`（遞增到邊界繞回來，用在 cache line fill）。
- 一個 burst 不能跨過 4 KB 的邊界，因為一個 4 KB page 可能對應到不同的 slave。

**Outstanding 與 ID**。Master 不用等上一筆的資料回來，就可以繼續送下一筆的位址。DDR 讀一筆要等幾十到上百個 cycle，如果一次只能等一筆，大部分時間 bus 都閒著；送出多筆 outstanding 請求可以把這段延遲蓋掉。每筆請求帶一個 ID（`AWID`、`ARID`），**同一個 ID 的回應必須照順序回來，不同 ID 可以亂序**，這讓 slave（例如 DDR controller）可以先回應命中 row buffer 的請求。

**Response**：`OKAY`、`EXOKAY`（exclusive access 成功）、`SLVERR`（slave 回報錯誤）、`DECERR`（位址沒有對應到任何 slave，通常是 interconnect 回的）。

AXI4 另外定義了兩個簡化版：

- **AXI4-Lite**：burst 長度固定為 1、沒有 ID，data width 只能是 32 或 64 bit。用來讀寫控制暫存器，例如加速器的 start、status、設定參數。
- **AXI4-Stream**：沒有位址，只有 `TVALID`、`TREADY`、`TDATA`、`TLAST`（封包的最後一筆）、`TKEEP`、`TUSER`。用在點對點的資料流，例如影像一個 pixel 接一個 pixel 送進運算單元。

一個加速器 IP 常見的介面組合是三個一起用：AXI4-Lite 給 CPU 設定暫存器、AXI4 讓自己去 DDR 搬資料，或是 AXI4-Stream 接 DMA。Xilinx 的 AXI DMA 做的就是 AXI4（記憶體）和 AXI4-Stream 之間的轉換：MM2S 從 DDR 讀出來變成 stream，S2MM 把 stream 寫回 DDR。

### Interconnect 與其他 on-chip bus

- **Interconnect**：把多個 master 和多個 slave 接起來。Shared bus 同一時間只能有一組在傳；crossbar 讓不同的 master–slave 組合同時傳。Master 和 slave 很多時（幾十個核心），會改用 NoC（network-on-chip），把傳輸打成封包在 router 之間轉送。
- **Bridge**：AXI-to-APB、AXI-to-AHB 這類轉接，也負責不同 data width、不同 clock domain 之間的轉換（裡面通常是 async FIFO）。
- **Cache coherence**：多個有 cache 的 master 共用記憶體時，要確保大家看到的資料一致。ACE 在 AXI 上加了 snoop channel；CHI 則是完全以封包為基礎的協定，用在多核心伺服器晶片。
- **其他家族**：TileLink（RISC-V，Chipyard 和 SiFive 在用）、Wishbone（OpenCores 的開源 IP）、Avalon（Intel / Altera FPGA）。

## 整理

- APB 管周邊的暫存器，AHB 用在小型 MCU，AXI 負責搬大量資料。
- 寫 IP 最常碰到的是 AXI 的 VALID / READY、burst 和 outstanding。
- 一個加速器 IP 通常同時有 AXI4-Lite（給 CPU 設定）和 AXI4 或 AXI4-Stream（搬資料）兩種介面。
