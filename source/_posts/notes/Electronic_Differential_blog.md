---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 差動放大器（一）：為什麼要差動，以及大訊號行為
date: '2024-06-03'
updated: '2026-10-16 21:51:41'
tags:
  - Electronics
  - Amplifier
summary: 差動電路用「兩邊相減」消掉電源雜訊、讓擺幅變兩倍；BJT 和 MOS 差動對在共模輸入下的範圍限制、在差模輸入下電流如何在兩邊之間分配，以及「先算電流、再算電壓」的分析方式。
permalink: notes/electronics-diff-pair/
synced: obsidian
---

差動電路是電子學（一）最後一個大主題，也是電子學（二）大部分電路的起點。這一篇整理概念和大訊號行為；小訊號、CMRR 和負載見 [[Electronic_Differential_SmallSignal_blog|差動放大器（二）]]。課程總覽見[[Electronic_blog|電子學（一）筆記總覽]]。

## 為什麼要差動

![[Pasted image 20240603224657.png|概念：電源上的雜訊（黃色）同時出現在兩個 CS 的輸出上；把訊號從兩邊一正一反地輸入，再把兩個輸出相減，雜訊就消掉了]]

$V_{DD}$ 並不乾淨，上面常有其他電路造成的波動。單端的放大器（例如一顆 CS）輸出是相對於地量的，電源上的雜訊會直接經過負載跑到輸出。

差動電路做兩個一模一樣的放大器，把要放大的訊號一邊加正、一邊加負，最後取兩個輸出的差：

$$
V_{out} = V_{out+} - V_{out-}
$$

![[el-diff-cm-dm.svg|上：差模訊號在兩邊一正一反，相減之後振幅變成兩倍。下：電源上的雜訊在兩邊同相，相減之後抵消，只剩下訊號]]

- 想要的訊號在兩邊大小相同、相位相反，相減之後變成兩倍。
- 雜訊在兩邊大小相同、相位也相同，相減之後抵消。

### Swing

![[Pasted image 20240603225011.png|Swing：振幅 A 的訊號，最高點到最低點是 2A（V_p-p）。差動輸出 V_+ − V_− = 2A sin ωt，振幅變成 2A]]

Swing 指的是波形最高點到最低點的差（peak-to-peak），是振幅的兩倍。單邊輸出的振幅是 $A$，差動輸出 $V_+ - V_- = 2A \sin \omega t$，振幅變成 $2A$：在同樣的電源電壓下，差動電路能輸出的擺幅是單端的兩倍。

代價是所有東西都要做兩份，功耗也是兩倍（見[[Electronic_Differential_SmallSignal_blog#差動對的功耗|差動對的功耗]]）。

### 對稱是前提

![[Pasted image 20240603225330.png|兩種差動對：左邊是 emitter-coupled pair（BJT），右邊是 source-coupled pair（MOS），下面都是一個 tail 電流源]]

雜訊能抵消，前提是兩邊完全一樣：

1. **電路相同：** 兩邊的元件、尺寸、負載都要一樣，才能產生一個大小相同、相位差 180° 的輸出。
2. **操作點相同：** 兩邊的偏壓也要一模一樣，否則小訊號參數就不同。
3. **結構對稱：** 佈局也要對稱，才不會有一邊多出寄生效應。

兩邊不對稱時，共模的雜訊會有一部分被轉成差模，相減也消不掉。

## 兩種輸入

任何一組輸入 $(V_{in1}, V_{in2})$ 都可以拆成兩個部分：

- **共模（common mode, CM）：** 兩邊相同的部分，$V_{icm} = \frac{V_{in1} + V_{in2}}{2}$。它決定差動對的 DC 操作點；雜訊也屬於這一類。
- **差模（differential mode, DM）：** 兩邊相反的部分，$V_{id} = V_{in1} - V_{in2}$。這才是要放大的訊號。

分析時分開掃：固定差模、掃共模，看電路什麼時候能正常工作；固定共模、掃差模，看電流和輸出怎麼變。

## BJT 差動對

![[Pasted image 20240603225518.png|BJT 差動對：兩顆電晶體的 emitter 接在一起，下面是 tail 電流源 I_EE，collector 上各接 R_C。tail 電流源本身也是一顆電晶體]]

兩顆電晶體的 emitter 接在一起，下面是一個 tail 電流源 $I_{EE}$。兩邊輸入相同時，電流平分，各是 $\frac{1}{2} I_{EE}$。

### 共模輸入

![[Pasted image 20240604000000.png|共模輸入下 I_C1、I_C2 對 V_icm：V_icm 太低時電晶體不會導通；超過 V_BE + V_CE,sat 之後，tail 電流源開始正常工作，電流固定在 I_EE/2]]

$V_{icm}$ 要設在一個範圍內：

1. **下限：** 要大於 $V_{BE} + V_{CE,sat}$。輸入電晶體需要 $V_{BE}$ 才會導通，下面的 tail 電晶體也需要至少 $V_{CE,sat}$ 才能留在 active region、當電流源。超過這個值之後，電流完全由 tail 決定，$V_{icm}$ 再怎麼變，每邊都是 $\frac{1}{2} I_{EE}$。
2. **上限：** 不能讓輸入電晶體進入 saturation。Collector 電壓是 $V_{CC} - \frac{1}{2} I_{EE} R_C$，base 電壓（$V_{icm}$）不能比它高太多，否則 base-collector 接面會被順偏。

![[Pasted image 20240604001242.png|共模輸入下的輸出電壓：電晶體導通後，輸出固定在 V_CC − (I_EE/2)R_C，不隨 V_icm 改變]]

在這個範圍內，兩邊的輸出都是

$$
V_{CC} - \frac{I_{EE}}{2} R_C
$$

而且不隨 $V_{icm}$ 改變：共模輸入完全沒有被放大。這正是差動對想要的。

### 差模輸入

![[Pasted image 20240604001608.png|差模輸入下的 I_C1、I_C2：一邊電流增加，另一邊減少，兩者的和永遠是 I_EE]]

![[Pasted image 20240604001823.png|差模輸入下的 V_X、V_Y：在 V_CC 和 V_CC − I_EE R_C 之間交叉，交叉點是 V_CC − (I_EE/2)R_C]]

輸入差變大時，一邊的電流增加、另一邊減少，但兩邊的和永遠是 tail 提供的 $I_{EE}$，不可能更多。最極端的情況是電流全部流到一邊，另一邊完全沒有電流。所以輸出電壓的範圍是：

- 上限：$V_{CC}$（那一邊沒有電流）
- 下限：$V_{CC} - I_{EE} R_C$（全部電流都流過這一邊）

![[el-bjt-diff-large-signal.svg|BJT 差動對的大訊號特性。電流的分配是 tanh 的形狀：中間大約 ±4V_T 的範圍是放大區，再往外電流幾乎全部跑到一邊，輸出就停在 V_CC 或 V_CC − R_C I_EE]]

BJT 的電流是指數關係，把兩邊的 $I_C$ 相除再配上 $I_{C1} + I_{C2} = I_{EE}$，可以解出

$$
I_{C1} - I_{C2} = I_{EE} \tanh\left( \frac{V_{in1} - V_{in2}}{2 V_T} \right)
$$

$V_T$ 只有 26 mV，所以大約 ±100 mV 的輸入差就足以把電流幾乎全部推到一邊。放大區很窄。

### 分析的訣竅

1. 共模電壓（只要在正常範圍內）不影響電流，電流由 tail 決定。
2. 先用電流算，再用電流換算電壓：先想「$I_{EE}$ 怎麼分到兩邊」，再用 $V_{CC} - I_C R_C$ 得到輸出。反過來從電壓推電流，很容易卡住。

## MOS 差動對

![[Pasted image 20240604101635.png|MOS 差動對：輸入用電容耦合，gate 的共模電壓由 R_1、R_2 偏壓到 V_icm；兩邊各接 R_D，下面的 tail 是 M_s。輸入一邊加 ΔI、另一邊減 ΔI]]

結構和 BJT 版本完全一樣，換成兩顆 source 接在一起的 MOS，tail 是一顆電晶體 $M_s$ 提供 $I_{SS}$。左右兩邊必須 identical。

### 共模輸入

![[Pasted image 20240604102116.png|MOS 差動對的共模轉移曲線：V_icm 超過 V_GS + V_DS,sat 之後，輸出固定在 V_DD − (I_SS/2)R_D]]

- **下限：** $V_{icm} > V_{GS} + V_{DS,sat}$，tail 的 $M_s$ 才會在 saturation、當電流源。
- **上限：** 輸入電晶體不能掉進 triode，也就是 $V_{DS} > V_{GS} - V_{TH}$。Drain 電壓是 $V_{DD} - \frac{I_{SS}}{2} R_D$，所以

$$
V_{icm} < V_{DD} - \frac{I_{SS}}{2} R_D + V_{TH}
$$

在這個範圍內，兩邊的輸出固定在 $V_{DD} - \frac{I_{SS}}{2} R_D$。

### 差模輸入

![[Pasted image 20240604102217.png|MOS 差動對的差模轉移曲線：V_X、V_Y 在 V_DD 和 V_DD − I_SS R_D 之間交叉]]

和 BJT 一樣，輸出在 $V_{DD}$ 和 $V_{DD} - I_{SS} R_D$ 之間擺動。差別是 MOS 的電流是平方關係，要把電流全部推到一邊，輸入差要達到 $\sqrt{2}(V_{GS} - V_{TH})$，其中 $V_{GS} - V_{TH}$ 是平衡時的 overdrive。這通常是好幾百 mV，比 BJT 的 ±100 mV 寬得多：MOS 差動對比較線性，但同樣電流下 $g_m$ 比較小。

小訊號增益、共模增益和 CMRR 見 [[Electronic_Differential_SmallSignal_blog|差動放大器（二）]]。
