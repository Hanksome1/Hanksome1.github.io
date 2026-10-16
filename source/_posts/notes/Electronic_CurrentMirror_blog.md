---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 電流鏡與 cascode：複製電流、拉高輸出阻抗
date: '2024-06-03'
updated: '2026-10-16 21:50:47'
tags:
  - Electronics
  - Circuit
summary: Diode-connected 電晶體為什麼是一顆 1/g_m 的電阻；BJT 與 MOS 電流鏡、用面積縮放電流、base 電流造成的誤差和 β helper；以及用 degeneration 和 cascode 讓電流源的輸出阻抗變大，還有 BJT cascode 為什麼被 r_π 卡住。
permalink: notes/electronics-current-mirror/
synced: obsidian
---

類比電路到處都需要穩定的電流源：放大器的偏壓、差動對的 tail、主動負載。但電晶體的參數（$I_S$、$V_{TH}$、$\mu C_{ox}$）隨製程和溫度變化很大，直接用一個固定電壓去偏壓一顆電晶體，電流很難準。電流鏡的做法是：只做一個精準的參考電流 $I_{ref}$，其他地方都去「複製」它。課程總覽見[[Electronic_blog|電子學（一）筆記總覽]]。

## Diode-connected

電流鏡的核心是一顆 diode-connected 的電晶體：MOS 的 gate 接 drain，或 BJT 的 base 接 collector。

![[el-diode-connected.svg|Diode-connected 的 MOS 和它的小訊號模型。受控電流源兩端的電壓正好就是控制它的 v_X，所以它的行為跟一顆 1/g_m 的電阻一模一樣，再並聯 r_o]]

在小訊號模型裡，受控電流源 $g_m v_{gs}$ 兩端的電壓就是 $v_{gs}$ 本身。一個「電流和自己兩端電壓成正比」的元件就是電阻，所以 diode-connected 的電晶體等效成

$$
r = \frac{1}{g_m} \parallel r_o \approx \frac{1}{g_m}
$$

BJT 版本再並聯 $r_\pi$：$\frac{1}{g_m} \parallel r_\pi \parallel r_o$，也大約是 $1/g_m$。這個阻抗從哪一端看都一樣。另外 MOS 接成 diode 之後 $V_{DS} = V_{GS}$，一定在 saturation。

## BJT 電流鏡

![[Pasted image 20240603210005.png|BJT 電流鏡：左邊的 diode-connected 電晶體吃下 I_ref，產生對應的 V_BE；右邊的電晶體用同一個 V_BE，複製出 I_copy]]

$I_{ref}$ 流進左邊 diode-connected 的電晶體，自動產生「剛好讓它流 $I_{ref}$」的那個 $V_{BE}$。右邊的電晶體共用這個 $V_{BE}$，電流就是

$$
I_{copy} = \frac{I_{S,copy}}{I_{S,ref}} I_{ref}
$$

兩顆一樣大時 $I_{copy} = I_{ref}$。不管 $I_S$ 的絕對值變成多少，兩顆一起變，比值不變，這就是電流鏡比直接偏壓穩定的原因。

考慮 Early effect 時，兩顆電晶體的 $V_{CE}$ 不同（左邊是 $V_{BE}$，右邊是輸出電壓 $V_o$），電流會有誤差：

$$
I_{copy} \approx I_{ref} \left( 1 + \frac{V_o - V_{BE}}{V_A} \right)
$$

### 用面積縮放電流

![[Pasted image 20240603210242.png|左：輸出端並聯兩顆電晶體，得到 2I_ref。右：參考端並聯兩顆、輸出端一顆，得到 ½I_ref]]

$I_S$ 和 emitter 面積成正比，所以想要不同的電流，就把電晶體並聯：輸出端並聯兩顆，電流變兩倍；參考端並聯兩顆，電流變一半。實際佈局時常用同一個單位元件並聯，比直接畫一顆兩倍大的電晶體匹配得更好。

### Base 電流造成的誤差

![[Pasted image 20240603223135.png|輸出端的電晶體面積是 nA_E，複製出 I_copy。兩顆電晶體的 base 電流（I_copy/β 和 I_copy/nβ）都要從 I_ref 裡分出來]]

假設輸出端的面積是參考端的 $n$ 倍。兩顆電晶體的 base 電流都要從 $I_{ref}$ 那邊分出來：輸出端吃 $I_{copy}/\beta$，參考端吃 $I_{copy}/(n\beta)$。真正流進參考端 collector 的只有

$$
I_{C,ref} = \frac{1}{n} I_{copy}, \qquad I_{ref} = I_{C,ref} + \frac{I_{copy}}{\beta} + \frac{I_{copy}}{n\beta}
$$

整理得

$$
I_{copy} = \frac{n I_{ref}}{1 + \frac{1}{\beta}(n + 1)}
$$

$n$ 越大、$\beta$ 越小，誤差越大。

### β helper

![[Pasted image 20240603234919.png|β helper：多一顆電晶體從 V_CC 直接供兩顆電晶體的 base 電流，I_ref 只需要供它的 base 電流]]

在參考端多加一顆電晶體，由它從電源直接提供兩顆電晶體的 base 電流。$I_{ref}$ 只需要供這顆 helper 的 base 電流，那已經被再除了一次 $\beta$：

$$
I_{copy} = \frac{n I_{ref}}{1 + \frac{1}{\beta^2}(n + 1)}
$$

誤差從 $1/\beta$ 等級降到 $1/\beta^2$ 等級。

## MOS 電流鏡

![[Pasted image 20240603224138.png|MOS 電流鏡。忽略 channel-length modulation 時 I_copy = (W/L)_1 / (W/L)_ref · I_ref；考慮 r_o 時 I_out = I_ref(1 + λ(V_o − V_B))]]

MOS 的 gate 不吃電流，所以沒有 base 電流的問題，只靠尺寸比縮放：

$$
I_{copy} = \frac{(W/L)_1}{(W/L)_{ref}} I_{ref}
$$

考慮 channel-length modulation，輸出端的 $V_{DS}$（$V_o$）和參考端的 $V_{DS}$（$V_B$，也就是 $V_{GS}$）不同，誤差是

$$
I_{out} \approx I_{ref} \left[ 1 + \lambda (V_o - V_B) \right]
$$

### 複製到很多地方

![[Pasted image 20240603224202.png|一個 I_ref 先用 NMOS 電流鏡複製到中間那一路，再用 PMOS 電流鏡複製到右邊，同時得到往下拉（sink）和往上推（source）的電流源]]

一個參考電流可以先用 NMOS 電流鏡複製出好幾路往下拉的電流（sink），其中一路再經過 PMOS 電流鏡，變成往上推的電流（source）。整顆晶片通常只有一個精準的參考電流，其他偏壓都是這樣一路複製出來的。

## 拉高輸出阻抗

理想電流源的輸出阻抗是無限大：輸出電壓怎麼變，電流都不變。一顆電晶體做的電流源只有 $r_o$，上面 Early effect 和 channel-length modulation 的誤差都來自這裡。想要更理想的電流源，就要把輸出阻抗拉高。

### 1. Degeneration

在 source 下面串 $R_S$，從 drain 看進去變成（見 [[Electronic_MOS_Amplifiers_blog#Source degeneration|source degeneration]]）

$$
Z_{out} = r_o + R_S + g_m R_S r_o
$$

問題是 $R_S$ 上的 DC 壓降會吃掉 headroom，嚴重時讓電晶體進不了 saturation；$R_S$ 太小，阻抗又拉不上去。

### 2. Cascode

把 $R_S$ 換成另一顆電晶體。下面那顆電晶體的 $r_{o}$ 在小訊號下就是一顆大電阻，DC 卻只需要一點點壓降：

![[Pasted image 20240603133812.png|兩顆疊起來的 cascode：Z_out = r_o2 + r_o1 + g_m r_o1 r_o2]]

$$
Z_{out} = r_{o2} + r_{o1} + g_{m} r_{o1} r_{o2} \approx g_m r_{o1} r_{o2}
$$

輸出阻抗被放大了 $g_m r_o$ 倍（本徵增益，通常幾十倍）。可以一直疊下去：

![[Pasted image 20240603133354.png|疊三顆：Z_out ≈ g_m² r_o1 r_o2 r_o3，每多一層再乘一次 g_m r_o]]

$$
Z_{out} \approx g_m^2 r_{o1} r_{o2} r_{o3}
$$

每多疊一層，阻抗再乘一次 $g_m r_o$，代價是每一層都要吃掉一個 $V_{DS,sat}$ 的 headroom。

### BJT cascode 的上限

![[Pasted image 20240606092442.png|BJT cascode：Z_out = (r_o2 ∥ r_π) + r_o1 + g_m1 (r_o2 ∥ r_π) r_o1。下面那顆的 r_o2 被上面那顆的 r_π 並聯掉，所以最多大約 βr_o1]]

BJT 也可以 cascode，但上面那顆電晶體的 emitter 看下去的電阻是 $r_{o2} \parallel r_{\pi1}$，不是 $r_{o2}$：

$$
Z_{out} = g_{m1} (r_{o2} \parallel r_{\pi1}) r_{o1} + r_{o1} + r_{o2} \parallel r_{\pi1}
$$

$r_{o2}$ 再大，並聯 $r_\pi$ 之後也不超過 $r_\pi$，所以 $Z_{out}$ 最多大約 $g_{m1} r_{\pi1} r_{o1} = \beta r_{o1}$。BJT 的 cascode 只能用一次，不能像 MOS 一樣一直疊上去讓阻抗繼續變大。

Cascode 用在差動對的 tail 和負載，見 [[Electronic_Differential_SmallSignal_blog|差動放大器的小訊號分析]]；電子學（二）的 [[AIC_CurrentMirror_Cascode_blog|電流鏡與 cascode]] 有更多 headroom 的討論。
