---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: Cache：mapping、replacement、write policy 與效能
date: '2025-05-16'
updated: '2026-10-17 21:24:38'
tags:
  - Computer Architecture
  - Memory
summary: Cache 怎麼運作：位址拆成 tag、index、offset，direct mapped、set associative、fully associative 三種放法；LRU 和它的近似做法；write-through、write-back 與 write allocate；最後用 AMAT 和 CPI 算 cache 對效能的影響，看 block size、associativity、multilevel cache 的取捨。
permalink: notes/ca-cache/
synced: obsidian
---

Cache 是 [[computer_architecture_memory_blog|memory hierarchy]] 裡最靠近 processor 的一層。這篇整理 cache 怎麼找資料、滿了要換掉誰、寫入時怎麼和 memory 保持一致，以及 cache 對效能的影響。課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## 名詞

相鄰兩層之間搬資料的單位，cache 和 memory 之間叫 **block**，memory 和 disk 之間叫 **page**。

![[Pasted image 20250516144757.png|各層之間搬運的單位]]

- **Hit**：要的資料在 upper level
	- **Hit rate**：hit 佔所有存取的比例
	- **Hit time**：存取 upper level 的時間（包括判斷是否 hit）
- **Miss**：資料不在 upper level，要從 lower level 搬上來
	- **Miss rate** = 1 − hit rate
	- **Miss penalty**：從 lower level 搬 block 上來的時間，加上把資料交給 processor 的時間

Hit time 遠小於 miss penalty，所以要盡量 hit。

## Block 要放在哪裡

Cache 比 memory 小很多，同一格 cache 會對應到很多個 memory block。有三種放法：

- **Direct mapped**：每個 memory block 只能放在一個固定位置，$(\text{block address}) \bmod (\text{cache 的 block 數})$
- **Set associative**：cache 分成多個 set，每個 memory block 對應一個 set，$(\text{block address}) \bmod (\text{set 數})$，放在 set 裡的哪一格都可以。每個 set 有 n 格就叫 **n-way**
- **Fully associative**：放在 cache 的任何位置都可以

![[Pasted image 20250516154403.png|同一個位址在三種 cache 中的位置]]

Direct mapped 就是 1-way set associative；fully associative 就是只有一個 set、way 數等於 block 數。

## Direct mapped cache

Block 數是 2 的冪次時，取 mod 就是取位址的低位，所以位址可以拆成三段：

![[Pasted image 20250516150619.png|Direct mapped：每個 memory block 只對應一個位置]]

```
| Tag | Index | Byte offset |
```

- **Byte offset**：block 裡的第幾個 byte。一個 block 是一個 word（4 bytes）時，offset 是最低的 2 bits
- **Index**：放在 cache 的哪一格
- **Tag**：剩下的高位。同一格會對應到很多個 memory block，要存 tag 才知道目前放的是哪一個

例如一個 8 格、每格 1 word 的 cache，10-bit 的位址 `0001011000`：

```
00010   110     00
 tag   index  offset
```

每一格還有一個 **valid bit**，表示這格有沒有資料（開機時全是 0）。

![[Pasted image 20250516151752.png|存取 0001001000 時 miss，把資料搬進 index 010]]

![[Pasted image 20250516152015.png|1024 個 block、每個 block 1 word 的 direct mapped cache]]

讀取時：

1. 用 index 找到那一格
2. 檢查 valid bit
3. 比較存著的 tag 和位址的 tag
4. 都成立就是 hit，把資料送給 CPU

就算 CPU 只要一個 byte，miss 時也要從 memory 搬整個 block。

### Cache 實際的大小

1024 個 block、每個 block 32 bits，通常叫 4 KB 的 cache，只算資料的部分。但每一格還要存 valid bit 和 tag，以 64-bit 位址來說 tag 有 64 − 10 − 2 = 52 bits，實際需要

$$
(1 + 52 + 32) \times 1024 \text{ bits}
$$

比 4 KB 多一倍以上。

### 更大的 block

一個 block 有多個 word 時，offset 再分成 **block offset**（第幾個 word）和 **byte offset**（word 裡的第幾個 byte）。例如同樣 4 KB 改成 256 個 block、每個 16 bytes：index 8 bits、offset 4 bits、tag 52 bits。

去掉 offset 之後的 tag + index 就是 **block address**，也就是 memory 裡的第幾個 block。

## Set associative 與 fully associative

- **Set associative**：index 用來選 set（bit 數是 $\log_2(\text{set 數})$）。一個 set 裡的 n 格要**同時比較 n 個 tag**，硬體上有 n 個比較器，再用 mux 選出比對成功那一路的資料

![[Pasted image 20250527004015.png|4-way set associative cache]]

![[Pasted image 20250516154949.png|2-way set associative 的例子：0、8、6 都對應到 set 0]]

- **Fully associative**：沒有 index，扣掉 offset 全部都是 tag，每一格都要比較

Associativity 每增加一倍，index 少 1 bit、tag 多 1 bit。

| | Direct mapped | n-way set associative | Fully associative |
| --- | --- | --- | --- |
| 可以放的位置 | 1 個 | n 個 | 任何一個 |
| 比較器 | 1 個 | n 個 | block 數個 |
| Hit time | 最快，tag 和資料同時讀 | 多一層 mux | 最慢 |
| Miss rate | 最高 | 中間 | 最低 |

## Replacement：要踢掉誰

Direct mapped 沒有選擇。Set associative 和 fully associative 在 set 滿了時要選一格換掉：

- **理想**：換掉未來最久不會用到的那一格，但無法預知未來
- **LRU**（least recently used）：用過去預測未來，換掉最久沒用的。2-way 很簡單，超過 4-way 就太複雜，要用近似的方法
- **Random**：associativity 高時，效果和 LRU 差不多

### 2-way 的 LRU

每個 set 只要一個 bit R：R = 0 代表 way 0 最久沒用（下次換 way 0），R = 1 代表 way 1 最久沒用。每次存取後把 R 設成另一個 way。

### Counter 的做法

每一格一個 counter：存取到的那格歸零，其他格加一，要換時選 counter 最大的。很準，但硬體太複雜，比較適合用軟體做。

### 近似 LRU：used bit

每一格一個 **used bit**（也叫 reference bit），一開始是 0：

- 存取到某一格時（不論 hit 或 miss），把它的 used bit 設成 1
- 要換時，replacement pointer 從目前位置繞圈往下找 used bit = 0 的格子換掉，沿路遇到 used bit = 1 的就清成 0
- 另一種做法：存取時如果 set 裡其他格的 used bit 都是 1，就把它們都清成 0，只留剛存取的這格

![[Pasted image 20250516161214.png|近似 LRU：replacement pointer 和 used bit]]

Used bit 是 1 代表最近用過，被 pointer 清成 0 之後如果又被用到，就會再設回 1；pointer 繞一圈都沒被用到的才會被換掉。[[computer_architecture_virtual_memory_blog|Virtual memory]] 的 page replacement 也用同樣的方法。

## 寫入

讀取不會改變資料，寫入時就要處理 cache 和 memory 不一致的問題。

### Write hit

- **Write-through**：寫 cache 時也同時寫 memory。兩邊永遠一致，但每次寫都要等 memory，很慢
	- 加一個 **write buffer**：要寫進 memory 的資料先放在 buffer，CPU 繼續執行，buffer 慢慢寫回去，滿了才需要停
- **Write-back**：只寫 cache，不寫 memory。每一格多一個 **dirty bit** 記錄有沒有被改過，**被換掉時**才寫回 memory
	- Dirty = 1：被改過，換掉前要先寫回 memory
	- Dirty = 0：和 memory 一樣，直接蓋掉
	- 被換掉的 dirty block 也可以先放進 write buffer，讓新的 block 先讀進來

### Write miss

要寫的位址不在 cache 裡時：

- **Write allocate**：先把 block 搬進 cache 再寫，之後對這個 block 的讀寫都會 hit
- **No write allocate**：不搬進 cache，直接寫 memory。程式常常把整個陣列寫完才讀（例如初始化），或者寫完就不再用，這時搬進來也沒用

Write-through 兩種都可以搭配；write-back 通常搭配 write allocate，同一個 block 被寫很多次時都在 cache 裡完成，換掉時才寫回一次。如果搭配 no write allocate，每次 write miss 都直接寫 memory，就失去 write-back 的好處。

## Cache 的效能

把 CPU time 拆成執行的時間和等記憶體的時間：

$$
\text{CPU time} = (\text{CPU execution cycles} + \text{Memory stall cycles}) \times \text{Clock cycle time}
$$

$$
\text{Memory stall cycles} = \frac{\text{Memory accesses}}{\text{Program}} \times \text{Miss rate} \times \text{Miss penalty}
= \frac{\text{Instructions}}{\text{Program}} \times \frac{\text{Misses}}{\text{Instruction}} \times \text{Miss penalty}
$$

I-cache 和 D-cache 要分開算：每條指令都要讀 I-cache，只有 load / store 會用到 D-cache。

![[Pasted image 20250516171805.png|Cache 效能的例子]]

例子：I-cache miss rate 2%、D-cache miss rate 4%、miss penalty 100 cycles、理想 CPI 是 2、load / store 佔 36%。

- I-cache：$1 \times 0.02 \times 100 = 2$ cycles / instruction
- D-cache：$0.36 \times 0.04 \times 100 = 1.44$ cycles / instruction
- 實際 CPI = 2 + 2 + 1.44 = 5.44

如果 cache 完美，CPU 會快 5.44 / 2 = 2.72 倍。CPU 越快（CPI 越小、clock 越快），memory stall 佔的比例越大，cache 的影響也越大。

### AMAT

Hit time 也會影響效能，所以另外定義平均記憶體存取時間：

$$
\text{AMAT} = \text{Hit time} + \text{Miss rate} \times \text{Miss penalty}
$$

例如 1 GHz、hit time 1 cycle、miss penalty 20 cycles、miss rate 5%：AMAT = 1 + 0.05 × 20 = 2 cycles = 2 ns。

### 用 memory 的組織降低 miss penalty

假設送位址要 1 個 bus cycle、每次 DRAM 存取要 15 個、傳一個 word 要 1 個，讀一個 4 words 的 block：

| 組織 | Miss penalty | Bandwidth |
| --- | --- | --- |
| 1 word 寬的 memory | 1 + 4 × 15 + 4 × 1 = 65 cycles | 16 B / 65 ≈ 0.25 B/cycle |
| 4 words 寬的 memory | 1 + 15 + 1 = 17 cycles | 16 B / 17 ≈ 0.94 B/cycle |
| 4 個 bank 交錯 | 1 + 15 + 4 × 1 = 20 cycles | 16 B / 20 = 0.8 B/cycle |

| 1 word 寬 | 4 words 寬 | 4 個 bank |
| --- | --- | --- |
| ![[Pasted image 20250527170406.png]] | ![[Pasted image 20250527170358.png]] | ![[Pasted image 20250527170417.png]] |

把 memory 和 bus 加寬最快，但硬體成本很高。Multi-bank 讓 4 個 bank 同時存取 DRAM，只是傳資料還是一次一個 word，用比較少的硬體得到接近的效果。

## Miss 從哪裡來（3C）

- **Compulsory miss**（cold start）：第一次存取某個 block，一定 miss。加大 block 可以減少
- **Capacity miss**：cache 放不下程式需要的所有 block，被換掉之後又要用。加大 cache 可以減少；在 fully associative cache 裡，compulsory 以外的 miss 都是這種
- **Conflict miss**（collision）：cache 還有空間，但好幾個 block 搶同一個 set（只有 direct mapped 和 set associative 會發生）。加大 cache 或提高 associativity 可以減少

![[Pasted image 20250521193553.png|2-way 的例子：前兩次是 compulsory miss，最後一次是 conflict miss]]

每一種解法都有代價：

![[Pasted image 20250522114258.png|各種設計改變對 miss rate 的效果和副作用]]

### Block size

- Block 變大，因為 spatial locality，miss rate 先下降（compulsory miss 變少）
- 但 cache 總大小固定時，block 越大、block 數越少，搶位置的情況變多，miss rate 又會**上升**。一次搬進太多用不到的資料，把有用的擠掉，這叫 **cache pollution**
- Block 越大，miss penalty 也越大，可能抵銷 miss rate 下降的好處

![[Pasted image 20250521194550.png|Block size 對 miss rate、miss penalty 和平均存取時間的影響]]

縮短 miss penalty 的方法有 **early restart**（要的 word 一到就交給 CPU）和 **critical word first**（先搬 CPU 要的 word，再搬 block 其他部分）。

### Associativity

提高 associativity 可以降低 miss rate，但效果遞減：1-way 到 2-way 改善很多，再往上就越來越少。它只能減少 conflict miss，而且需要更多比較器，tag 也更長。

### Multilevel cache

在 L1 後面再加一層更大的 L2（甚至 L3）：

- **L1**：重點是 **hit time**，所以比較小、block 也比較小
- **L2**：重點是 **miss rate**，避免存取很慢的 main memory，所以比較大、block 比較大、associativity 比較高

例子：base CPI = 1、4 GHz（0.25 ns），L1 每條指令的 miss rate 2%，main memory 100 ns。

- 只有 L1：miss penalty = 100 / 0.25 = 400 cycles，CPI = 1 + 0.02 × 400 = 9
- 加一個 5 ns 的 L2，讓去 main memory 的 miss rate 降到 0.5%：L1 miss 到 L2 要 5 / 0.25 = 20 cycles

$$
\text{CPI} = 1 + 0.02 \times 20 + 0.005 \times 400 = 3.4
$$

快了 9 / 3.4 ≈ 2.6 倍。

![[Pasted image 20250521232842.png|Multilevel cache 的例子]]

公式寫成：

$$
\text{Total CPI} = \text{Base CPI} + \text{Primary stalls per instruction} + \text{Secondary stalls per instruction}
$$

第三項要注意 miss rate 是哪一種：

- **Global miss rate**：所有存取中最後要去 main memory 的比例（上面的 0.5%），直接乘 main memory 的 penalty
- **Local miss rate**：進到 L2 的存取中有多少 miss。L1 的 miss rate × L2 的 local miss rate 才是 global miss rate

![[Pasted image 20250527171845.png|用 global 和 local miss rate 算出的 CPI 相同]]

## Cache controller

Cache 的控制可以用 finite state machine 實作。課堂上的例子是 direct mapped、write-back、write allocate、block 16 bytes 的 cache，有四個狀態：

![[Pasted image 20250527172107.png|Cache controller 的 FSM]]

- **Idle**：等 CPU 送出讀寫請求
- **Compare tag**：比對 tag。Hit 就完成讀寫（寫入時設 dirty bit），回到 Idle；miss 的話，舊 block 是 dirty 就去 Write-back，否則去 Allocate
- **Write-back**：把舊 block 寫回 memory，memory 回報完成後去 Allocate
- **Allocate**：從 memory 讀新的 block，完成後回到 Compare tag 再比一次（這次一定 hit）
