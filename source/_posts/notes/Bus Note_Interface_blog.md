---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 晶片對外的介面：DDR、PCIe、USB
date: '2026-10-27'
updated: '2026-10-29 21:20:44'
tags:
  - Bus
  - SoC
summary: 晶片對外用 DDR 接 DRAM、PCIe 接 GPU 和 SSD、USB 接外部裝置。這篇整理為什麼高速介面改用 serial，以及這三種介面怎麼傳資料、速度大概多少。
permalink: notes/bus-interfaces/
synced: obsidian
---

晶片內的模組用 AXI 這類 bus 互相溝通（見 [[Bus Note_blog|晶片內的 bus：APB、AHB、AXI]]）。晶片對外就不一樣了：訊號要經過封裝、PCB、連接器，pin 數有限，訊號會衰減、互相干擾。這篇整理三種最常見的對外介面：DDR 接 DRAM，PCIe 接 GPU、NVMe SSD、網卡，USB 接鍵盤、隨身碟、攝影機。

![[bus-soc-overview.svg|DDR、PCIe、USB 的 controller 在晶片內，對內接 AXI interconnect，對外由 PHY 接到晶片外的裝置]]

## 為什麼高速介面都變成 serial

晶片內的 bus 可以很寬，但晶片對外的 pin 很貴，PCB 上的走線也很難做到每條長度一樣。平行介面要所有 bit 在同一個時間點到達，速度一高，線之間的 skew 就超過一個 bit 的時間，這是平行介面的天花板（舊的 PCI 是 32-bit、33 MHz）。

PCIe、USB 3、SATA、Ethernet 改成：

- **差動訊號（differential pair）**：一個 bit 用兩條線的電壓差表示，抗雜訊、可以用很小的擺幅跑很快。
- **Clock 藏在資料裡**：不另外送 clock，接收端用 CDR（clock and data recovery）從資料的轉態中把 clock 抓回來。為了確保資料夠常轉態、0 和 1 數量平衡，資料要先編碼，例如 8b/10b（每 8 bit 多送 2 bit，效率 80%）或 128b/130b（效率約 98.5%）。
- **SerDes**：晶片內部還是寬的平行資料，由 serializer / deserializer 在晶片邊緣轉成一條高速的 serial 訊號。
- **Lane**：一條不夠快就多開幾條（x4、x16），每條 lane 各自獨立，接收端再把資料重新排回來，不需要每條 lane 完全對齊。

DDR 是例外：它還是平行介面，用的方法是另外送一個 data strobe（DQS）跟著資料走，加上開機時的 training 去校正每個 bit 的時間。

## DDR

DDR SDRAM（Double Data Rate Synchronous DRAM）是電腦和大部分 SoC 的主記憶體。Double data rate 指的是 clock 的上升緣和下降緣都傳資料，所以 DDR4-3200 的 clock 是 1600 MHz，資料率是 3200 MT/s（mega transfers per second）。

### DRAM 怎麼存資料

DRAM 每個 bit 是一個電晶體加一個電容（1T1C），電荷會漏掉，所以要定期 **refresh**：每個 row 64 ms 內至少要刷新一次，controller 大約每 7.8 µs 送一次 `REF` 指令。

一顆 DRAM 晶片的層級是 bank group → bank → row → column。讀寫一個 bank 要三個步驟：

1. **ACTIVATE（ACT）**：打開一個 row，把整個 row（幾 KB）讀到 sense amplifier 組成的 row buffer。
2. **READ / WRITE**：從 row buffer 取出一段 column，以 burst 的方式傳出去。
3. **PRECHARGE（PRE）**：把 row buffer 寫回陣列、關閉這個 row，才能開下一個。

![[bus-dram-bank.svg|DRAM bank 的結構，以及 row hit 和 row miss 的指令順序]]

要的 row 剛好開著（row hit）只需要等 CL；要的 row 不是開著的那個（row miss）就要先 PRE、再 ACT，多等 $t_{RP}$ 和 $t_{RCD}$。DDR 規格上常看到的「DDR4-3200 CL22」，CL 就是 READ 指令到資料出來要等幾個 clock。所以 DRAM 的延遲不是固定的，取決於存取的順序，這也是 DDR controller 要重新排序請求的原因。

### 一條 DDR channel

- **DQ**：資料線，一般 PC 的 DIMM 是 64 bit（加 ECC 是 72 bit）。
- **DQS**：data strobe，每 8 條 DQ 一組，跟著資料一起送，接收端用它取樣資料（source-synchronous）。
- **CK**：差動 clock。
- **Command / address**：ACT、RD、WR、PRE、REF 這些指令和 row、column、bank 位址。

頻寬的算法：DDR4-3200、64-bit 的一條 channel 是

$$
3200 \times 10^6 \ \text{transfers/s} \times 8 \ \text{bytes} = 25.6 \ \text{GB/s}
$$

### DDR 的世代

| | 資料率（MT/s） | 電壓 | Prefetch | 變化 |
| --- | --- | --- | --- | --- |
| DDR | 200–400 | 2.5 V | 2n | |
| DDR2 | 400–1066 | 1.8 V | 4n | |
| DDR3 | 800–2133 | 1.5 V | 8n | |
| DDR4 | 1600–3200 | 1.2 V | 8n | 加入 bank group |
| DDR5 | 4800 起，規格延伸到 8800 | 1.1 V | 16n | 每條 DIMM 拆成兩個獨立的 32-bit subchannel、burst length 16、DIMM 上自帶電源管理 IC |

DRAM 陣列本身其實跑不快（核心頻率只有幾百 MHz），每一代變快主要靠 prefetch：一次從陣列讀出 n 倍的資料，再由 I/O 高速送出去。

其他變種：

- **LPDDR**：手機、筆電用，省電，直接焊在主機板上或跟 SoC 疊在一起。
- **GDDR**：顯示卡用，每個 pin 的速度很高，但容量小、比較耗電。
- **HBM**：好幾層 DRAM die 用 TSV 疊起來，和 SoC 一起放在 interposer 上，介面非常寬（HBM3 每個 stack 1024 bit），用在 AI 加速器和高階 GPU。

### 晶片裡的 DDR controller 和 PHY

SoC 裡接 DDR 的部分分兩塊：

- **DDR controller**（數位）：對內是 AXI slave，接收讀寫請求；對外產生 ACT / RD / WR / PRE / REF 指令。它要排程請求、盡量製造 row hit、在不同 bank 之間交錯、遵守一大堆 timing 參數，還要按時 refresh。
- **DDR PHY**（mixed-signal）：負責實際的 I/O、DLL、把資料對齊 DQS。開機時要做 training（write leveling、read gate、Vref 等），校正每個 bit 的時間和電壓。

Controller 和 PHY 之間的介面通常是 DFI（DDR PHY Interface）這個標準，所以兩者可以來自不同廠商。在 Zynq 這類 FPGA 上，DDR controller 在 PS 端，PL 的電路透過 AXI port 去存取 DDR。

## PCIe

PCIe（PCI Express）是電腦裡接 GPU、NVMe SSD、網卡的介面。它取代了舊的 PCI：PCI 是所有裝置共用一條平行 bus，PCIe 改成點對點的 serial link。

### Lane 與拓撲

- 一條 **lane** 有一對 TX 差動線、一對 RX 差動線，共 4 條線，兩個方向可以同時傳（full duplex）。
- 一條 link 可以有 x1、x2、x4、x8、x16 條 lane。顯示卡通常是 x16，NVMe SSD 是 x4。
- 拓撲是一棵樹：CPU 裡的 **root complex** 在最上面，下面可以接 **switch** 擴充，最末端是 **endpoint**（GPU、SSD）。

### 三層協定

![[bus-pcie-layers.svg|PCIe 的三層：每一層把上一層的封包包起來再往下送]]

- **Transaction layer**：產生 TLP（transaction layer packet）。種類有 memory read / write、configuration read / write、completion（回傳讀到的資料）、message（例如中斷）。Memory write 是 posted，送出去就不管了；memory read 是 non-posted，要等對方回一個帶資料的 completion。
- **Data link layer**：替每個 TLP 加上序號和 LCRC。接收端檢查 CRC，對就回 ACK，錯就回 NAK，傳送端從 replay buffer 重送。Flow control 也在這一層：接收端事先告訴傳送端自己還有多少 buffer（credit），credit 用完傳送端就先停。
- **Physical layer**：加上 framing、編碼、scramble，把 byte 分散到各條 lane，再由 SerDes 送出去。開機時由 LTSSM（link training and status state machine）跟對方協商 lane 數和速度。

### 從軟體看 PCIe

雖然實體上是封包，對 CPU 來說 PCIe 裝置還是 memory-mapped：

- 開機時系統讀每個裝置的 **configuration space**，知道它是什麼裝置、需要多大的位址空間。
- 系統把裝置的 **BAR**（base address register）設定到某段位址，之後 CPU 讀寫這段位址，root complex 就把它轉成 TLP 送給裝置。
- 裝置自己也可以當 master，直接發 memory read / write 去存取主記憶體（DMA）。NVMe SSD 就是這樣把資料直接搬進 DRAM。
- 中斷用 MSI / MSI-X：裝置對一個特定位址寫一筆資料，就代表發出中斷。

在 FPGA 上，Xilinx 的 XDMA 這類 IP 把 PCIe 轉成 AXI，FPGA 裡面的電路照樣用 AXI 收發資料。

### PCIe 的世代

| 世代 | 年份 | 每條 lane 速率 | 編碼 | 每條 lane 單向頻寬 | x16 單向頻寬 |
| --- | --- | --- | --- | --- | --- |
| 1.0 | 2003 | 2.5 GT/s | 8b/10b | 250 MB/s | 4 GB/s |
| 2.0 | 2007 | 5 GT/s | 8b/10b | 500 MB/s | 8 GB/s |
| 3.0 | 2010 | 8 GT/s | 128b/130b | 約 985 MB/s | 約 15.8 GB/s |
| 4.0 | 2017 | 16 GT/s | 128b/130b | 約 1.97 GB/s | 約 31.5 GB/s |
| 5.0 | 2019 | 32 GT/s | 128b/130b | 約 3.94 GB/s | 約 63 GB/s |
| 6.0 | 2022 | 64 GT/s | PAM4 + FLIT + FEC | 約 7.5 GB/s | 約 121 GB/s |
| 7.0 | 2025 | 128 GT/s | PAM4 + FLIT + FEC | 約 15 GB/s | 約 242 GB/s |

每一代速率翻倍。6.0 開始改用 PAM4（一個 symbol 有 4 個電壓準位，一次送 2 bit），錯誤率變高，所以加上 FEC，並改成固定大小的 FLIT 封包。

CXL（Compute Express Link）沿用 PCIe 5.0 以後的實體層，在上面加了 cache coherence 和記憶體擴充的協定，讓 CPU 可以把接在 PCIe 插槽上的記憶體當成自己的記憶體用。

## USB

USB（Universal Serial Bus）是接外部裝置用的，重點是隨插即用和通用性，而不是極限速度。

### Host 主導

- 所有傳輸都由 **host** 發起，裝置不能主動講話，只能等 host 來問。
- 拓撲是分層的星狀，透過 hub 擴充，一個 host controller 最多 127 個裝置（位址 7 bit）。
- 每個裝置有好幾個 **endpoint**，endpoint 0 固定用來做控制。

### 四種傳輸

| 類型 | 特性 | 例子 |
| --- | --- | --- |
| Control | 設定裝置，每個裝置都有 | Enumeration |
| Bulk | 資料一定正確（錯了重送），但不保證時間，用剩下的頻寬 | 隨身碟、印表機 |
| Interrupt | 保證固定間隔被 host 詢問一次，延遲有上限 | 鍵盤、滑鼠 |
| Isochronous | 預留固定頻寬，錯了不重送 | 麥克風、攝影機 |

Interrupt 傳輸其實不是中斷，是 host 依照固定的間隔來 polling。

### Enumeration

裝置插上去之後：host 偵測到 → reset → 讀 descriptor（裝置是什麼、有幾個 interface 和 endpoint）→ 分配位址 → 依照 class 載入驅動程式。同一個 class（HID、Mass Storage、UVC 攝影機、CDC 序列埠）的裝置可以共用作業系統內建的驅動，這是隨插即用的基礎。

### USB 的世代

USB 的命名改過好幾次，看傳輸速率比較不會搞混：

| 速率 | 名稱 | 年份 | 線路 |
| --- | --- | --- | --- |
| 1.5 Mb/s | Low Speed（USB 1.0） | 1996 | D+ / D− 一對，半雙工 |
| 12 Mb/s | Full Speed（USB 1.x） | 1996 | 同上 |
| 480 Mb/s | High Speed（USB 2.0） | 2000 | 同上 |
| 5 Gb/s | USB 3.0 = USB 3.1 Gen 1 = USB 3.2 Gen 1 | 2008 | 另外加一對 TX、一對 RX，全雙工，8b/10b |
| 10 Gb/s | USB 3.1 Gen 2 = USB 3.2 Gen 2 | 2013 | 128b/132b |
| 20 Gb/s | USB 3.2 Gen 2x2 | 2017 | 兩條 lane，只能用 Type-C |
| 40 Gb/s | USB4 | 2019 | Type-C；可以 tunnel PCIe 和 DisplayPort |
| 80 Gb/s | USB4 Version 2.0 | 2022 | PAM3 |

Type-C 是接頭的形狀，不代表速度；一條 Type-C 的線可能只跑 USB 2.0。

### 晶片裡的 USB

跟 DDR 一樣分成 controller 和 PHY。Host 端的 controller 現在幾乎都是 xHCI 規格（同時支援所有速度）；controller 和 PHY 之間，USB 2.0 用 UTMI / ULPI，USB 3 用 PIPE（PHY Interface for PCI Express，PCIe 和 USB 3 共用這套 PHY 介面）。

## 整理

| | DDR | PCIe | USB |
| --- | --- | --- | --- |
| 接什麼 | DRAM | GPU、SSD、網卡 | 外部裝置 |
| 形式 | 平行 + strobe | Serial lane | Serial |
| 拓撲 | Controller 直連 DRAM | 樹狀（root complex、switch） | 星狀（hub） |
| 誰發起 | 只有 controller | 兩端都可以 | 只有 host |
| 典型頻寬 | 每條 channel 數十 GB/s | 每條 lane 數 GB/s | 數百 Mb/s 到 80 Gb/s |

把它們串起來看一個例子：一個 AI 加速器卡插在 PCIe 上，主機透過 PCIe 把權重寫進卡上的 DDR（PCIe → XDMA → AXI → DDR controller）；CPU 再透過 AXI4-Lite 或 APB 寫加速器的控制暫存器，叫它開始；加速器自己當 AXI master，用長 burst 從 DDR 讀資料進 SRAM 運算，算完寫回 DDR，最後發一個 MSI 中斷通知主機來取結果。

- DDR 的效能取決於存取順序（row hit / miss），PCIe 和 USB 的速度來自 serial lane 加 SerDes。
- 三種介面在晶片裡都分成 controller 和 PHY：controller 是數位的，可以自己寫或買 IP；PHY 是類比 / 混合訊號，幾乎都是買現成的 IP。
