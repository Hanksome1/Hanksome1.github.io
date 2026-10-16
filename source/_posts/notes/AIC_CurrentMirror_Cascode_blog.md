---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 電流鏡與 cascode：複製電流、拉高輸出阻抗
date: '2024-10-01'
updated: '2026-10-16 15:33:44'
tags:
  - AIC
  - Amplifier
summary: 為什麼類比電路用電流而不是電壓來偏壓：電流鏡怎麼複製電流、為什麼參考端要 diode-connected、L 為什麼不能用最小值；cascode 怎麼把輸出阻抗放大 gm·ro 倍，以及疊越多顆電晶體、電壓 headroom 越少的代價。
permalink: notes/aic-current-mirror-cascode/
synced: obsidian
---

這篇的兩個主題其實在解決同一件事：做出一個好的電流源。電流鏡負責「電流要多少就給多少」，cascode 負責「電流不受輸出電壓影響」，也就是輸出阻抗要大。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

## 為什麼要電流鏡

最直接的偏壓方式是給 gate 一個固定電壓，但電流對 $V_{GS} - V_{TH}$ 是平方關係，而 $V_{TH}$ 會隨製程、溫度變動幾十 mV。$V_{ov}$ 只有一兩百 mV 的時候，這點變動就足以讓電流差很多，甚至把電晶體推出 saturation。

比較穩的做法是先產生一個準確的參考電流 $I_{ref}$，再把它複製到需要的地方。[[AIC_hw4_blog|HW4]] 比較過兩種偏壓在不同 corner 下的表現：用固定的 0.5 V 偏壓，三個 corner 都是 0.5 V；用電流鏡產生的偏壓，SS 會自動升到 586 mV、FF 降到 455 mV，讓電流維持在設計值附近。

## 基本電流鏡

![[aic-current-mirror.svg|左：基本的 NMOS 電流鏡，M1 由 I_ref 決定 V_GS，M2 用同一個 V_GS 複製電流。右：I_out 隨 V_out 的變化，V_out 低於 V_ov 時 M2 掉進 triode；之後電流隨 V_out 緩緩上升，只有在 V_DS2 = V_DS1 = V_GS 那一點才和 I_ref 完全相等]]

M1 的 gate 和 drain 接在一起（diode-connected），流過 $I_{ref}$ 時自己產生對應的 $V_{GS}$；M2 的 gate 接在同一個節點，$V_{GS}$ 相同，在 saturation 時就流出相同（或按比例縮放）的電流：

$$
I_{out} = \frac{(W/L)_2}{(W/L)_1} I_{ref}
$$

$V_{TH}$、$\mu C_{ox}$ 這些會飄的參數在比例裡消掉了，只剩尺寸比，這就是電流鏡比固定電壓穩的原因。要複製成 N 倍時，通常 L 保持一樣、把 W 放大 N 倍（或並聯 N 顆），讓兩邊的短通道效應一致。

### 為什麼參考端要 diode-connected

Diode-connected 讓 $V_{DS1} = V_{GS1}$，M1 永遠在 saturation，而且它的偏壓少了一個自由度，參考端的狀態完全由 $I_{ref}$ 決定。

M2 的 $V_{DS}$ 則由外面的電路決定，沒辦法控制。考慮 channel-length modulation：

$$
\frac{I_{out}}{I_{ref}} = \frac{(W/L)_2}{(W/L)_1}\cdot\frac{1 + \lambda V_{DS2}}{1 + \lambda V_{DS1}}
$$

只有 $V_{DS2}$ 剛好等於 $V_{GS}$ 的時候，複製才是準的。所以電流鏡不要用最小的通道長度：L 短，$\lambda$ 大、$r_o$ 小，輸出電流隨 $V_{DS2}$ 變得很厲害，就不是一個好的電流源了。另外，M2 的 $V_{DS}$ 至少要有 $V_{ov}$，電晶體才不會掉進 triode。

## Cascode

### 為什麼需要大的輸出阻抗

放大器的增益是 $G_m R_{out}$，電流源的品質看它的輸出阻抗。單顆電晶體的輸出阻抗只有 $r_o$，想要更大，最直接的想法是用[[AIC_SingleStageAmp_blog|source degeneration]]：source 下面接一顆電阻 $R_S$，看進 drain 的阻抗就變成 $(1 + g_m R_S)r_o$。如果這顆「電阻」本身也是一顆電晶體的 $r_o$ 呢？

![[aic-cascode.svg|左：cascode 放大器，M1 是 CS 輸入管，M2 是疊在上面的 CG，gate 接固定偏壓。看進 M2 的 drain，輸出阻抗被放大成 g_m2 r_o2 · r_o1。右：同樣的 V_DD，每多疊一顆電晶體就要多留一個 V_ov，輸出擺幅跟著變小]]

把一顆 CG（M2）疊在 CS（M1）上面，M1 的 $r_{o1}$ 就是 M2 的 degeneration 電阻：

$$
R_{out} = r_{o2} + (1 + g_{m2}r_{o2})r_{o1} \approx g_{m2}r_{o2}\cdot r_{o1}
$$

輸出阻抗被放大了 $g_{m2}r_{o2}$ 倍，也就是一顆電晶體的 intrinsic gain，通常是幾十倍到上百倍。直覺上，M2 把 M1 的 drain 跟輸出隔開：輸出電壓怎麼擺，M2 的 source（M1 的 drain）幾乎不動，M1 的電流就不受影響。這也結合了兩種接法的優點：CS 的高輸入阻抗，加上 CG 的高輸出阻抗。

### 當放大器用

負載如果是理想電流源，cascode 的增益是

$$
A_v = -g_{m1}R_{out} \approx -g_{m1}g_{m2}r_{o1}r_{o2}
$$

大約是單級 CS 的 $g_m r_o$ 倍。實際上負載也要做成 cascode（PMOS 疊兩顆），否則輸出阻抗會被負載的 $r_o$ 拉下來，cascode 的好處就浪費了。

### 代價：voltage headroom

每顆電晶體都要 $V_{DS} \ge V_{ov}$ 才能留在 saturation。多疊一顆，就要從 $V_{DD}$ 裡多分一個 $V_{ov}$ 給它，留給輸出擺動的範圍跟著變小。上下各疊兩顆的 cascode 放大器，4 顆電晶體分 1.8 V，這在低電壓製程是很實際的限制。

## Cascode 電流鏡

同樣的想法用在電流鏡上：

![[aic-cascode-mirror.svg|Cascode 電流鏡：M1、M3 都是 diode-connected，疊成參考端；M2、M4 疊成輸出端。M4 讓 M2 的 V_DS 固定在 V_GS，複製更準，輸出阻抗也變成 g_m4 r_o4 · r_o2]]

M4 讓 M2 的 drain 電壓被釘在 $V_{GS}$ 附近，正好和 M1 的 $V_{DS}$ 相同，所以複製更準；輸出阻抗也從 $r_{o2}$ 變成 $g_{m4}r_{o4}r_{o2}$。代價一樣是 headroom：這種接法的輸出端至少要 $V_{GS} + V_{ov} = V_{TH} + 2V_{ov}$。

拿它當差動放大器的 tail current，tail 的阻抗 $R_{SS}$ 變大，[[AIC_Differential_Amp_blog|CMRR]] 也跟著變好；[[AIC_hw2_blog|HW2]] 就是這樣做的。
