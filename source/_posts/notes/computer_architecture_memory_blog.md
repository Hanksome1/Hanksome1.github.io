---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Memory hierarchy 與記憶體的可靠度：locality、MTTF、Hamming code
date: '2025-05-11'
updated: '2026-10-17 21:23:17'
tags:
  - Computer Architecture
  - Memory
summary: 為什麼要有 memory hierarchy：快的記憶體貴、便宜的記憶體慢，靠 locality 讓一小塊快的記憶體看起來像一大塊；接著是記憶體的可靠度，MTTF、availability、AFR，以及 parity、Hamming SEC code 和 SECDED 怎麼偵錯、更正。
permalink: notes/ca-memory/
synced: obsidian
---

前四章都假設 memory 又大又快，一個 cycle 就能讀到資料。實際上大的記憶體慢，快的記憶體小而且貴。這篇是 memory hierarchy 的概念，以及記憶體怎麼偵錯和更正；[[computer_architecture_cache_blog|cache]] 和 [[computer_architecture_virtual_memory_blog|virtual memory]] 各自一篇。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## 為什麼要分層

程式設計師希望記憶體無限大、延遲又低，但快的記憶體貴很多：

| 技術 | 存取時間 | 每 GB 價格（美元，2020） |
| --- | --- | --- |
| SRAM | 0.5～2.5 ns | 500～1,000 |
| DRAM | 50～70 ns | 3～6 |
| Flash | 5～50 µs | 0.06～0.12 |
| 磁碟 | 5～20 ms | 0.01～0.02 |

- **SRAM**：像 flip-flop 一樣存 bit，有電就不會消失。密度低、耗電、貴，但快，用來做 cache
- **DRAM**：用電容上的電荷存 bit，電荷會漏掉，要定期 refresh（所以叫 dynamic）。密度高、便宜、慢，用來做 main memory
- **Flash**：非揮發性，比磁碟快 100～1000 倍，但每個 bit 寫幾千次就會壞，要靠 wear leveling 把寫入分散到不同 block

理想的記憶體是 SRAM 的速度加上磁碟的容量和價格。做法是**用一小塊快的記憶體搭配一大塊慢的記憶體**，讓整體看起來像一大塊快的記憶體。

![[Pasted image 20250511022608.png|小而快的 cache 加上大而慢的 main memory|500]]

![[Pasted image 20250511022719.png|Memory hierarchy]]

- 所有資料都放在最大、最慢的那一層，往上每一層只放下一層的一部分
- **Upper level**：靠近 processor，小、快、貴
- **Lower level**：遠離 processor，大、慢、便宜

| 層級 | 容量 | 存取時間 | 誰管理 | 搬運的單位 |
| --- | --- | --- | --- | --- |
| Registers | 數百 bytes | < 1 cycle | 程式 / compiler | 1～8 bytes |
| Cache | MB | 數十 cycles | Cache controller | block，8～128 bytes |
| Main memory | GB | 數百 cycles | OS | page，512 B～1 MB |
| Disk | TB | 百萬 cycles | | |

### Locality

這個方法有效，是因為程式在一段時間內只會存取位址空間的一小部分：

- **Temporal locality**：剛用過的資料很快會再用到，例如迴圈裡的指令和計數變數。所以要把最近用過的資料留在靠近 processor 的地方
- **Spatial locality**：用過的資料附近的資料很快也會用到，例如循序執行的指令和陣列。所以每次不只搬一個 word，而是搬**一整塊連續的資料**（block，又叫 cache line）

Block 是兩層之間搬運資料的最小單位，一個 block 要嘛整個在 upper level，要嘛整個不在。

![[Pasted image 20250511044137.png|以 block 為單位在兩層之間搬資料|600]]

## 記憶體的可靠度

### Fault 與 failure

系統在兩個狀態之間切換：**service accomplishment**（照規格提供服務）和 **service interruption**（偏離規格）。從前者變成後者叫 **failure**，可能是永久的，也可能是間歇的；從後者回到前者叫 restoration。

**Fault** 是某個元件的 failure，不一定會造成整個系統 failure，例如有備援的時候。

### MTTF 與 availability

- **MTTF**（mean time to failure）：平均多久會壞一次，衡量 reliability
- **MTTR**（mean time to repair）：壞了平均要多久才修好，衡量服務中斷的程度
- **MTBF**（mean time between failures）= MTTF + MTTR

$$
\text{Availability} = \frac{\text{MTTF}}{\text{MTTF} + \text{MTTR}}
$$

Availability 越接近 1 越好，常用「幾個 9」表示：一個 9（90%）代表一年有 36.5 天在修，五個 9（99.999%）代表一年只修 5.26 分鐘。

提高 availability 有兩條路：

- **降低 MTTR**：更好的工具和流程，更快發現、診斷、修好
- **提高 MTTF**：
	- **Fault avoidance**：用更可靠的元件，讓 fault 不要發生
	- **Fault tolerance**：加入備援，發生 fault 也不會變成 failure
	- **Fault forecasting**：在壞掉之前預測並更換

### AFR

**AFR**（annual failure rate）：給定 MTTF，一年內預期會壞掉的裝置比例。

有些磁碟標稱 MTTF 是 1,000,000 小時，換算是 114 年，看起來幾乎不會壞。但是：

$$
\text{AFR} = \frac{365 \times 24}{1{,}000{,}000} = 0.876\%
$$

一個有 50,000 台伺服器、每台兩顆磁碟的資料中心，一年預期會壞 876 顆，平均每天超過兩顆。規模一大，就算單一元件很可靠，也要假設隨時有東西在壞。

## 偵錯與更正：Hamming code

### Hamming distance

兩個等長的 bit pattern 有幾個 bit 不同，就是它們的 **Hamming distance**。例如 011011 和 001111 的 Hamming distance 是 2。

一組 code 裡合法的 pattern（codeword）之間最小的 Hamming distance，決定它能偵測、更正多少錯誤。

### Parity：偵測一個錯誤

在資料後面加一個 parity bit，讓 1 的個數是偶數（even parity）。2 bits 的資料 00、01、10、11 加上 parity 變成 000、011、101、110。

![[Pasted image 20250511055553.png|圈起來的是 codeword，相鄰的兩個 pattern 距離為 1|400]]

任兩個 codeword 的 Hamming distance 至少是 2，錯一個 bit 一定會變成不合法的 pattern（1 的個數變奇數），所以偵測得到。但不知道錯的是哪個 bit，因為它和好幾個 codeword 的距離都是 1。

### 距離 3：更正一個錯誤

如果 codeword 之間的距離至少是 3，例如只用 000 和 111，錯一個 bit（例如變成 110）後，它離原本的 111 只有 1，離其他 codeword 至少 2，所以可以改回最近的 codeword。問題是要有方法產生這樣的 codeword。

![[Pasted image 20250511055925.png|只用 000 和 111 當 codeword]]

### Hamming SEC code

Hamming code 的規則：

- bit 從左邊開始，從 1 編號
- **位置是 2 的冪次（1、2、4、8…）的 bit 是 parity bit**，其他位置放資料
- 每個 parity bit 檢查一組位置，讓那一組有偶數個 1：$p_k$ 負責位置編號的二進位含有 k 的所有位置

![[Pasted image 20250511060121.png|每個 parity bit 負責的位置]]

- p1 檢查 1、3、5、7、9、11
- p2 檢查 2、3、6、7、10、11
- p4 檢查 4、5、6、7、12
- p8 檢查 8、9、10、11、12

每個資料位元至少被兩個 parity bit 檢查，而且組合都不一樣。

**編碼**：資料 10011010₂ 依序填進 3、5、6、7、9、10、11、12，再算出各個 parity bit，得到 codeword `011100101010`。

![[Pasted image 20250511060357.png|編碼的例子]]

**更正**：重新檢查每一組的 parity，不對的記成 1，得到 $H = h_8 h_4 h_2 h_1$。H 是 0000 代表沒有錯，否則 **H 的值就是出錯的位置**。

收到 `011100001010`（第 7 個 bit 錯了）：

- 位置 1、3、5、7、9、11：奇數個 1，$h_1 = 1$
- 位置 2、3、6、7、10、11：奇數個 1，$h_2 = 1$
- 位置 4、5、6、7、12：奇數個 1，$h_4 = 1$
- 位置 8、9、10、11、12：偶數個 1，$h_8 = 0$

$H = 0111 = 7$，把第 7 個 bit 翻回來即可。

![[Pasted image 20250511060440.png|更正的例子]]

### 需要幾個 parity bit

d 個資料 bit、p 個 parity bit，H 有 p 個 bit，要能指出 p + d 個位置中哪一個錯，再加上沒有錯的情況：

$$
2^p \ge p + d + 1
$$

例如 d = 8 要 p = 4，code rate 是 8 / 12 ≈ 0.67。Hamming(20, 15) 是 codeword 20 bits、資料 15 bits，code rate = 15 / 20 = 0.75。資料越長，parity 佔的比例越小。

### SECDED

SEC code 遇到兩個 bit 錯時會算出錯誤的位置，反而把正確的 bit 改錯。再加一個涵蓋整個 codeword 的 parity bit $p_n$，讓 Hamming distance 變成 4，就能**更正一個錯誤、偵測兩個錯誤**（single error correcting, double error detecting）。

設 $h_n$ 是整個 codeword 的 parity 檢查結果：

| H | $h_n$ | 判斷 |
| --- | --- | --- |
| 0000 | even | 沒有錯 |
| 0000 | odd | $p_n$ 這個 bit 錯了 |
| ≠ 0000 | odd | 一個 bit 錯，跟 SEC 一樣用 H 更正 |
| ≠ 0000 | even | 兩個 bit 錯，只能偵測，不能更正 |

ECC DRAM 就是這樣做：64 bits 的資料要 7 個 parity bit（$2^7 \ge 7 + 64 + 1$），加上 $p_n$ 共 72 bits。

![[Pasted image 20250516144607.png|Hamming distance 和能偵測、更正的錯誤數]]

一般來說，最小 Hamming distance 為 $d_C$ 的 code：

- 要偵測 k 個錯：$d_C \ge k + 1$
- 要更正 k 個錯：$d_C \ge 2k + 1$
