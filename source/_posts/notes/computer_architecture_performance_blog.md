---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 效能：CPU time、CPI 與 Amdahl's law
date: '2025-02-20'
updated: '2026-10-17 21:16:00'
tags:
  - Computer Architecture
  - Performance
summary: 怎麼量一台電腦有多快：用執行時間定義效能，拆成 instruction count × CPI × clock cycle time；功耗牆為什麼讓 clock rate 停止成長；benchmark 為什麼用幾何平均；以及 Amdahl's law、MIPS 這些常見的陷阱。
permalink: notes/ca-performance/
synced: obsidian
---

課程總覽見 [[Computer Architecture_blog|計算機結構筆記總覽]]。

## 用時間定義效能

「快」有兩種量法：

- **Execution time**（response time、latency）：做完一件工作要多久
- **Throughput**：單位時間內做完多少工作

兩者不一定一起變好：換一顆更快的 processor，兩個都會改善；多加幾顆 processor 分工，單一工作的 latency 不變，但 throughput 會變高。這門課主要看 execution time，把效能定義成它的倒數：

$$
\text{Performance} = \frac{1}{\text{Execution time}}
$$

「X 比 Y 快 n 倍」的意思是：

$$
\frac{\text{Performance}_X}{\text{Performance}_Y} = \frac{\text{Execution time}_Y}{\text{Execution time}_X} = n
$$

### 量哪一種時間

- **Elapsed time**（wall clock time）：從開始到結束的總時間，包含 I/O、OS overhead、其他程式分到的時間
- **CPU time**：CPU 實際花在這個工作上的時間，不含等 I/O 和執行其他工作的時間
	- User CPU time：執行程式本身
	- System CPU time：OS 替這個程式做事（例如 system call）

設計 processor 時看的是 CPU time。

## CPU time 的三個因子

數位電路由固定頻率的 clock 驅動，所以時間可以用經過幾個 clock 來表示：

$$
\text{CPU time} = \text{CPU clock cycles} \times \text{Clock cycle time} = \frac{\text{CPU clock cycles}}{\text{Clock rate}}
$$

Clock period 不能無限縮短：combinational logic 必須在下一個 clock edge 之前算完，所以 period 至少要大於最長的 combinational delay。如果硬要提高 clock rate，就得把 combinational logic 切成更小段，代價是同一件事要花更多 cycle 才做得完。

Clock cycle 的數量取決於執行了多少條指令，以及每條指令要幾個 cycle：

$$
\text{CPU time} = \text{Instruction count} \times \text{CPI} \times \text{Clock cycle time}
$$

- **Instruction count（IC）**：由程式、compiler 和 ISA 決定
- **CPI**（cycles per instruction，平均每條指令要幾個 cycle）：由硬體實作決定，也跟程式用到哪些指令（instruction mix）有關，所以不是常數
- **Clock cycle time**：由電路和製程決定

如果有 n 類指令，各自的 CPI 不同：

$$
\text{Clock cycles} = \sum_{i=1}^{n} \text{CPI}_i \times \text{IC}_i, \qquad
\text{CPI} = \frac{\text{Clock cycles}}{\text{IC}}
$$

CPI 越小越好。一個 cycle 只發出一條指令的 processor，CPI 不會小於 1；第 4 章的 [[computer_architecture_exception_blog|multiple issue]] 每個 cycle 發出多條指令，CPI 才可能小於 1。

這三項會互相影響，只看其中一項容易誤判。課堂上的例子：電腦 A 的 clock 是 2 GHz，跑某個程式要 10 秒；B 的目標是 6 秒，但提高 clock 會讓 cycle 數變成 1.2 倍。

$$
\text{Clock rate}_B = \frac{1.2 \times (10\,\text{s} \times 2\,\text{GHz})}{6\,\text{s}} = 4\,\text{GHz}
$$

![[ca-slide-lec1-2-performance-p12.png|課堂例題：Computer B 需要多快的 clock]]

Clock rate 變成兩倍，速度只快了 $10/6 \approx 1.67$ 倍。另一個方向是減少 cycle 數，例如乘以 2 的冪次時用 shift 取代 `mul`。

## 功耗牆

Clock rate 在 2004 年左右就不再往上，原因是功耗和散熱跟不上。

![[ca-slide-lec1-2-performance-p21.png|Intel processor 的 clock rate 與功耗]]

CMOS 電路主要的功耗是 dynamic power，來自節點在 0 和 1 之間切換時對電容充放電：

$$
\text{Power} = \frac{1}{2} \times \text{Capacitive load} \times \text{Voltage}^2 \times \text{Frequency switched}
$$

以前靠降低電壓抵銷頻率提高帶來的功耗，但電壓降到一定程度後，leakage current 造成的 static power 變得明顯，電壓降不下去，頻率也就推不上去。

### Multicore

單顆 core 做不快，就在一顆晶片上放多顆 core。兩顆小 core 的功耗比一顆效能相同的大 core 低，但程式設計師要自己寫平行程式，硬體不會自動把一個程式拆開執行。

## Benchmark

Benchmark 是一組用來量測效能的程式，最常見的是 **SPEC**（Standard Performance Evaluation Corporation）：

- `SPECspeed`：整數和浮點數兩組測試，各跑一份
- `SPECrate`：每個測試同時跑 n 份，量多核心的 throughput
- `SPECpower`：伺服器在 10 種負載等級下，每瓦特換到多少效能

把多個程式的結果合成一個數字時，直接加總執行時間會被跑最久的程式主導；改用相對於參考機器的時間比值取算術平均，換一台參考機器結論就可能不同：

![[ca-slide-lec1-2-performance-p31.png|用算術平均，以 A 或 B 為參考會得到不同結論]]

所以 SPEC 對各程式的時間比值取**幾何平均**：

$$
\text{Geometric mean} = \sqrt[n]{\prod_{i=1}^{n} \text{Execution time ratio}_i}
$$

用幾何平均，不管以哪台機器為參考，兩台電腦的相對排名都一樣。

## 常見的陷阱

### Pitfall：Amdahl's law

只改善系統的一部分，整體加速會有上限：

$$
T_{\text{improved}} = \frac{T_{\text{affected}}}{\text{Improvement factor}} + T_{\text{unaffected}}
$$

例如一個程式 100 秒裡有 80 秒在做乘法，想讓整體快 5 倍（20 秒），就算乘法快到 0 秒也還剩 20 秒，所以做不到。優化前要先 profiling，找出時間花在哪裡。

### Pitfall：用 MIPS 當效能指標

MIPS（millions of instructions per second）只看了效能公式的一部分：

$$
\text{MIPS} = \frac{\text{Instruction count}}{\text{Execution time} \times 10^6} = \frac{\text{Clock rate}}{\text{CPI} \times 10^6}
$$

不同 ISA 的指令做的事不一樣多，一條複雜的指令可能抵好幾條簡單的指令，MIPS 卻一視同仁。同一台電腦跑不同程式的 CPI 也不同，所以 MIPS 連一台電腦本身都沒有固定的值。

### Fallacy：電腦閒置時幾乎不耗電

實際上不是。i7 伺服器滿載時 258 W，50% 負載 170 W（66%），10% 負載還有 121 W（47%），理想上應該只有 10%。Google 的資料中心大部分時間都在 10%～50% 的負載，所以功耗最好能跟負載成正比（energy-proportional computing）。

![[ca-slide-lec1-2-performance-p38.png|SPECpower：不同負載下的效能與功耗]]

### Fallacy：追求效能和追求能源效率是兩回事

$\text{Energy} = \text{Power} \times \text{Time}$。效能好代表執行時間短，就算功率稍高，總能量也可能比較少。
