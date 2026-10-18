---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Virtual memory：page table、TLB 與 page replacement
date: '2025-05-22'
updated: '2026-10-17 21:25:21'
tags:
  - Computer Architecture
  - Memory
summary: Virtual memory 把 main memory 當成 disk 的 cache：每個 process 有自己的虛擬位址空間，透過 page table 翻譯成實體位址；TLB 讓翻譯變快；page fault 交給 OS 處理。最後比較 FIFO、LRU 和用 reference bit 近似 LRU 的 page replacement。
permalink: notes/ca-virtual-memory/
synced: obsidian
---

[[computer_architecture_cache_blog|Cache]] 是 main memory 的 cache；virtual memory 則把 main memory 當成 disk（手機上是 flash）的 cache，由 CPU 和 OS 一起管理。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## 為什麼要 virtual memory

執行中的程式叫 **process**。多個 process 共用 main memory 時，virtual memory 讓：

- 每個 process 有**自己的虛擬位址空間**，好像整個記憶體都是自己的，也存取不到別的 process 的資料
- 實體記憶體可以比虛擬位址空間小很多，暫時用不到的部分放在 disk

程式和 CPU 只看得到虛擬位址，`ld`、`sd` 產生的都是 **virtual address**；cache 和 memory 則用 **physical address** 存取。兩者之間的轉換叫 **address translation**（address mapping）。

![[Pasted image 20250522121849.png|Virtual address 對應到 physical memory 或 disk]]

和 cache 對照：

| | Cache | Virtual memory |
| --- | --- | --- |
| 搬運的單位 | block | **page** |
| Miss 叫 | cache miss | **page fault** |
| 放在 upper level 的位置 | cache line | **page frame**（main memory 被切成一樣大的格子） |
| 處理 miss | 硬體 | OS（軟體） |

Page fault 時，OS 到 disk 的 swap space 找到那個 page，搬進 memory 的某個 page frame，再更新 page table，把 virtual page 對應到這個 frame。

![[Pasted image 20250522122315.png|程式的各段以 page 為單位對應到 physical memory]]

## Address translation

RISC-V 的位址是 64 bits，但虛擬位址空間有 39、48、57 bits 幾種設定，page 都是 **4 KB**。以 48-bit 為例：

- Page 大小 4 KB = $2^{12}$ bytes，所以最低的 12 bits 是 **page offset**
- 剩下的 36 bits 是 **virtual page number**（VPN），一個 process 最多 $2^{36}$ 個 page
- 假設實體記憶體 1 TB = $2^{40}$ bytes，physical address 是 40 bits，其中 **physical page number**（PPN）28 bits

**Page offset 不用翻譯**：page 是整塊搬的，在 page 裡的位置不會變，所以 $\text{page offset 的 bit 數} = \log_2(\text{page size})$，只有 VPN 要換成 PPN。

![[Pasted image 20250522173000.png|VPN 經過翻譯變成 PPN，page offset 直接照抄]]

### Page table

Cache 用 index 和 tag 找資料，virtual memory 則用 **page table** 記錄每個 page 放在哪裡：

- 每個 process 有自己的 page table，放在 main memory 裡
- Page table 是一個 **PTE**（page table entry）的陣列，**用 VPN 當 index**
- CPU 裡的 **page table register** 指向目前這個 process 的 page table 的起點
- Page 在 memory 裡時，PTE 存它的 PPN 和 valid、dirty、reference 等狀態位元；不在時，PTE 可以記錄它在 disk swap space 的位置

![[Pasted image 20250522173757.png|用 VPN 0x02307 查 page table 得到 PPN 0x0c2，page offset 0x6A4 直接照抄]]

### Page fault 的代價很大

Page fault 要到 disk 搬資料，需要**數百萬個 cycle**，所以 virtual memory 的設計都以減少 page fault 為優先：

- **Page 比較大**（4 KB～64 KB），一次多搬一點，分攤 disk 很長的存取時間
- **Fully associative**：page 可以放在任何 page frame，miss rate 最低。雖然比較複雜，但查詢用的是 page table，複雜的部分又交給 OS 處理，花的時間和 disk 存取比起來還是很少
- **好的 replacement 演算法**：盡量接近 LRU
- **Write-back**：見後面的 [[#Write policy|write policy]]

## TLB：讓翻譯變快

用 page table 翻譯時，每次存取都要讀兩次記憶體：

1. 讀 page table 裡的 PTE
2. 用得到的 physical address 真正去存取

取指令、`ld`、`sd` 都要翻譯，記憶體存取次數等於加倍。好在存取 page table 也有很好的 locality，所以在 CPU 裡放一個專門存 PTE 的小 cache，叫 **TLB**（translation lookaside buffer）：

- 通常 16～512 個 PTE，hit 只要 0.5～1 cycle，miss 要 10～100 cycles，miss rate 0.01%～1%
- 用 VPN 查詢，得到 PPN

![[Pasted image 20250522174316.png|有 TLB 時的存取流程]]

![[Pasted image 20250522174417.png|TLB 是 page table 的 cache]]

### TLB miss

- **Page 在 memory 裡**：只是 PTE 不在 TLB。從 page table 把 PTE 載入 TLB 後重新執行。可以用硬體處理，也可以用軟體：產生 exception，跳到 TLB miss handler 找 PTE 並載入 TLB，再重新執行那條指令
- **Page 不在 memory 裡**：這就是 **page fault**，一定由 OS 處理
	1. TLB miss 觸發 exception，OS 保存整個 process 的狀態
	2. 用出錯的虛擬位址找到 PTE，從 PTE 知道 page 在 disk 的哪裡
	3. 需要的話選一個 page 換掉（如果它是 dirty，先寫回 disk）
	4. 從 disk 把 page 載入，更新 page table
	5. 讓 process 回到可執行的狀態，從出錯的指令重新開始

Disk 很慢，等待期間 OS 會先 **context switch** 去執行別的 process，資料搬完再回來。

### TLB、page table、cache 的組合

Cache 的 tag 用的是 physical address，所以要先翻譯才能查 cache。一次存取可能的組合：

| Cache | TLB | Page table | 可能嗎？ |
| --- | --- | --- | --- |
| miss | hit | hit | 可能。TLB hit 就不用查 page table |
| hit | miss | hit | 可能。TLB miss，在 page table 找到，重試後 cache hit |
| miss | miss | hit | 可能。TLB miss，在 page table 找到，重試後 cache miss |
| miss | miss | miss | 可能。TLB miss 接著 page fault，重試後 cache miss |
| miss | hit | miss | 不可能：page 不在 memory，TLB 裡不會有它 |
| hit | hit | miss | 不可能：同上 |
| hit | miss | miss | 不可能：page 不在 memory，cache 裡也不會有它的資料 |

也就是說，資料在 cache 裡，它的 page 一定在 memory 裡，page table 一定查得到。

## Page replacement

Memory 滿了就要選一個 page 換掉。以 4 個 page frame、存取順序 0、1、3、0、2、0、1、3、4 為例，前 8 次存取後 frame 都滿了，第 9 次要存取 page 4：

### FIFO

換掉**最早載入**的 page，不管最近有沒有用到。0、1、3、2 依序載入，所以換掉 0，即使 0 在第 5 次才剛用過。

### LRU

換掉**最久沒用到**的 page。可以想成一個 queue：存取某個 page 就把它移到最前面，要換時換掉最後面的。到第 9 次時，各 page 最後一次被用到的時間是 0 在第 5 次、1 在第 6 次、3 在第 7 次、2 在第 4 次，所以換掉 2。

![[Pasted image 20250522175503.png|LRU：被存取的 page 移到最上面，換掉最下面的 2]]

另一種做法是 **counter**：存取某個 page 時它的 counter 歸零、其他 page 加一，要換時換 counter 最大的。

![[Pasted image 20250522175800.png|Counter 的做法]]

### 近似 LRU：reference bit

完整的 LRU 每次存取都要更新，成本太高。實際上會在 PTE 裡放一個 **reference bit**（used bit）：

- 存取某個 page 時，把它的 reference bit 設成 1
- Reference bit = 0 的 page 代表最近沒用過，可以換掉

![[Pasted image 20250527183705.png|PTE 裡的 used bit 和 replacement pointer]]

搭配一個繞圈掃描的 **replacement pointer**：

- 要換的時候，pointer 從目前的位置往下掃，找 reference bit = 0 的 entry 換掉；沿路經過 reference bit = 1 的就把它清成 0
- 換完之後把新的 entry 的 reference bit 設成 1，pointer 移到下一格。**Pointer 只有在要換的時候才移動**
- Hit 或有空的 entry 可以放時，不用換，只把 reference bit 設成 1
- 如果 reference bit 全都變成 1，就把剛存取的以外的全部清成 0

照這些規則走一次：一個 4 格的 fully associative TLB，pointer 在第一格，第四格還是 invalid。

| 請求 | 狀況 | 處理 | 之後的 reference bits |
| --- | --- | --- | --- |
| 初始 | | | 0x0:1、0x1:0、0x2:1、（空） |
| 0x1 | hit | 0x1 設成 1；三個 valid 的都是 1 了，其他的清成 0 | 0x0:0、0x1:1、0x2:0、（空） |
| 0x4 | miss，有空的格子 | 放進第四格，設成 1，pointer 不動 | 0x0:0、0x1:1、0x2:0、0x4:1 |
| 0x5 | miss，沒有空位 | 從第一格掃：0x0 是 0，換掉；pointer 移到第二格 | 0x5:1、0x1:1、0x2:0、0x4:1 |
| 0x1 | hit | 已經是 1，pointer 不動 | 0x5:1、0x1:1、0x2:0、0x4:1 |
| 0x3 | miss | 從第二格掃：0x1 是 1，清成 0；0x2 是 0，換掉；pointer 移到第四格 | 0x5:1、0x1:0、0x3:1、0x4:1 |

最後一步的 0x1 雖然剛用過，還是被 pointer 清成 0；如果 pointer 繞回來之前又被用到，就會再設回 1，否則下一輪就會被換掉。

## Write policy

Disk 寫一次要數百萬個 cycle，write-through 不可行，所以 virtual memory 都用 **write-back + write allocate**：

- 寫入某個 page 時，把 PTE 裡的 **dirty bit** 設成 1
- 換掉 page 時，dirty 的才要寫回 disk；clean 的直接丟掉，disk 上的那份還是對的
