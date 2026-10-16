---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 頻率響應：Bode plot、Miller 效應與單級放大器的 pole
date: '2024-09-21'
updated: '2026-10-16 15:33:13'
tags:
  - AIC
  - Frequency Response
summary: 放大器的增益為什麼會隨頻率下降：轉移函數和 Bode plot 的畫法、每個節點貢獻一個 pole、zero 從哪裡來、Miller 效應把跨接電容放大，以及 CS、CG、CD 三種單級放大器的高頻響應和 f_T。
permalink: notes/aic-frequency-response/
synced: obsidian
---

前面算[[AIC_SingleStageAmp_blog|單級放大器]]的增益時，電容都被忽略了。電容的阻抗 $1/sC$ 隨頻率改變：低頻時像開路，高頻時像短路，所以電路的增益、相位、阻抗都會隨頻率變化。給電路一個頻率不同的小訊號輸入，觀察這三個量怎麼變，就是頻率響應。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

最簡單的例子是一階 RC 低通濾波器：低頻時電容開路，輸出等於輸入；高頻時電容短路，輸出被拉到地。中間的轉折點在 $\omega = 1/RC$。

## 轉移函數與 Bode plot

線性電路的轉移函數可以寫成

$$
H(s) = A_0\frac{(1 + s/\omega_{z1})(1 + s/\omega_{z2})\cdots}{(1 + s/\omega_{p1})(1 + s/\omega_{p2})\cdots}
$$

$\omega_z$ 是 zero、$\omega_p$ 是 pole。Bode plot 用對數的頻率軸畫增益（dB）和相位，每個 pole、zero 的效果可以分開疊加：

- **碰到 zero**：增益的斜率 +20 dB/dec，相位在轉折頻率上 +45°，最後總共 +90°。
- **碰到 pole**：增益的斜率 −20 dB/dec，相位在轉折頻率上 −45°，最後總共 −90°。

反過來，看著 Bode plot 也能寫出轉移函數。例如下面這張圖：一開始就以 −20 dB/dec 下降，代表原點有一個 pole；在 $\omega = 1$ 斜率變平，是一個 zero；在 $\omega = 10$ 又開始下降，是另一個 pole。再用某一點的增益定出常數，得到

$$
H(s) = 10\cdot\frac{s + 1}{s(s + 10)}
$$

![[aic-bode-example.svg|H(s) = 10(s+1) / s(s+10) 的 Bode plot。虛線是用折線畫的近似，實線是真正的曲線；相位從原點 pole 的 −90° 開始，碰到 zero 往上、碰到 pole 往下]]

## 放大器的 pole 和 zero

放大器裡的電容分兩類：

- **大電容**（耦合電容、bypass 電容）決定低頻的響應。
- **小電容**（電晶體本身的寄生電容 $C_{GS}$、$C_{GD}$、$C_{DB}$…）決定高頻的響應，也是這門課主要在處理的。

### 每個節點都是一個 pole

訊號路徑上的每個節點，都有從那裡看出去的阻抗 $R$ 和掛在那裡的總電容 $C$，它們貢獻一個 pole：

$$
\omega_p = \frac{1}{RC}
$$

頻率最低的那個叫 dominant pole，它通常決定了放大器的頻寬。所以看到一個節點，先想「它的 R 多大、C 多大」：電容越大、阻抗越高，pole 越低，頻寬越小。高增益的節點偏偏都是高阻抗節點，這是增益和頻寬互相拉扯的根源。

### Zero 從哪裡來

Zero 通常來自一條「前饋」（feedforward）路徑：訊號在某個頻率以上找到一條繞過低增益節點的捷徑。例如在 CS 的 source degeneration 電阻 $R_S$ 旁邊並聯一顆電容 $C$：

- 低頻：$C$ 開路，$R_S$ 有作用，增益是 degeneration 後的 $R_D/(R_S + 1/g_m)$。
- 高頻：$C$ 把 $R_S$ 短路，degeneration 消失，增益變回 $g_m R_D$。

算出來增益在 $\omega = 1/(R_S C)$ 有一個 zero、在 $(1 + g_m R_S)/(R_S C)$ 有一個 pole，中間那段增益往上升。這種設計可以讓電路在不需要的頻段少放大一點，在需要的頻段多放大一點。

### Dominant pole 近似

分母是二次式 $1 + bs + as^2$ 時，如果兩個 pole 差很遠（$\omega_{p1} \ll \omega_{p2}$），展開

$$
(1 + s/\omega_{p1})(1 + s/\omega_{p2}) = 1 + s\left(\frac{1}{\omega_{p1}} + \frac{1}{\omega_{p2}}\right) + \frac{s^2}{\omega_{p1}\omega_{p2}}
$$

可以直接讀出

$$
\omega_{p1} \approx \frac{1}{b}, \qquad \omega_{p2} \approx \frac{b}{a}
$$

不用解二次方程。[[AIC_hw3_blog|HW3]] 和 [[AIC_hw4_blog|HW4]] 算 pole 都是用這個近似，誤差不到 1%。

## Miller 效應

CS 的 $C_{GD}$ 跨在輸入和輸出之間，兩端都有訊號，沒辦法直接說它屬於哪個節點。Miller 定理把一個跨在增益為 $A_v$ 的放大器兩端的阻抗 $Z$，換成兩個各自接地的阻抗：

$$
Z_1 = \frac{Z}{1 - A_v}, \qquad Z_2 = \frac{Z}{1 - 1/A_v}
$$

反相放大器 $A_v = -A$ 時，$Z_1 = Z/(1+A)$、$Z_2 = Z/(1 + 1/A)$。換成電容（$Z = 1/sC$），輸入端看到的電容被放大 $(1 + A)$ 倍：

$$
C_{in} = (1 + A)C, \qquad C_{out} = \left(1 + \frac{1}{A}\right)C \approx C
$$

![[aic-miller.svg|Miller 定理的直覺：反相放大器輸入是 v_X、輸出是 −A v_X，電壓沿著 Z 線性地從 v_X 降到 −A v_X，在 1 : A 的位置剛好是 0。在那一點把 Z 切開、中間接地，兩段各自成為接地的阻抗]]

我喜歡用一個直覺記它：反相放大器的輸入和輸出往相反方向動，所以沿著 $Z$ 一定有一個點的交流電壓是 0，就像一個 virtual ground。在那裡把 $Z$ 切開接地，靠輸入那段是 $Z/(1+A)$，靠輸出那段是 $AZ/(1+A)$。同相放大器的兩端往同一個方向動，找不到這樣的點，用公式算會得到負的電容。

要小心的是，Miller 定理本身是精確的，前提是 $A_v$ 要用「那個頻率下」的增益。實際上我們都直接代低頻增益（例如 $-g_m R_D$），這一步才是近似：它把輸入端的 pole 估得不錯，但會漏掉 zero，輸出端的 pole 也不準。

## 單級放大器的高頻響應

### Common source

![[aic-cs-highfreq.svg|CS 的寄生電容：C_GS 在輸入、C_DB 在輸出、C_GD 跨在兩端。用 Miller 把 C_GD 拆開之後，輸入節點 X 和輸出節點各有一個 pole]]

把 $C_{GD}$ 用 Miller 拆開，增益 $A = g_m R_D$：

$$
\omega_{in} = \frac{1}{R_S\left[C_{GS} + (1 + g_m R_D)C_{GD}\right]}, \qquad
\omega_{out} \approx \frac{1}{R_D(C_{DB} + C_{GD})}
$$

$C_{GD}$ 被放大 $(1 + g_m R_D)$ 倍，所以 CS 的增益越大，輸入端的 pole 越低，頻寬越小。另外 $C_{GD}$ 也提供一條從輸入直通輸出的前饋路徑，在 $\omega = g_m/C_{GD}$ 產生一個右半平面的 zero，這在後面的 [[AIC_Stability_blog|Miller 補償]]會再出現。

### Common gate

![[aic-cg-highfreq.svg|CG 的 gate 是交流接地，所有寄生電容都變成接地電容：source 端的 C_GS、C_SB 在節點 X，drain 端的 C_GD、C_DB 在節點 Y，沒有跨接電容，也就沒有 Miller 效應]]

Gate 接固定偏壓等於交流接地，所以 $C_{GS}$ 和 $C_{GD}$ 都變成接地電容，電容自然分成兩群：

$$
\omega_X = \frac{1}{(R_S \parallel 1/g_m)(C_{GS} + C_{SB})}, \qquad
\omega_Y = \frac{1}{R_D(C_{GD} + C_{DB})}
$$

沒有電容跨在輸入和輸出之間，不會被 Miller 放大，輸入端看到的電阻又只有 $1/g_m$ 左右，所以 CG 的高頻表現比 CS 好得多。

如果把負載換成 diode-connected PMOS，Y 點的電容要再算上 PMOS 的 $C_{GS}$（它的 gate 接在 drain 上）和 $C_{DB}$，而 PMOS 自己的 $C_{GD}$ 因為 gate 和 drain 接在一起被短路掉；Y 點看到的電阻變成 $1/g_{m2}$。

### Common drain

$C_{GS}$ 跨在 gate（輸入）和 source（輸出）之間，但 source follower 的增益接近 1，$C_{GS}$ 兩端幾乎一起動，流過它的電流很小。等效的輸入電容大約是

$$
C_{in} \approx C_{GD} + (1 - A_v)C_{GS}
$$

$C_{GS}$ 被縮小成 $(1 - A_v)$ 倍。不過要算完整的轉移函數，最好直接對兩個節點寫 KCL，因為這裡兩個 pole 會互相影響，可能是一對複數 pole，Miller 近似不準。

輸出阻抗也會隨頻率改變：低頻時是 $1/g_m$；頻率高到 $C_{GS}$ 短路時，從輸出看回去會經過 $C_{GS}$ 看到訊號源的內阻 $R_S$。$R_S > 1/g_m$ 時，輸出阻抗隨頻率上升，看起來像一顆電感，推電容負載時可能出現 ringing。

## Transit frequency $f_T$

$f_T$ 是電晶體的小訊號電流增益（$i_d/i_g$）掉到 1 的頻率，用來描述一顆電晶體本身最快能多快：

$$
f_T \approx \frac{g_m}{2\pi(C_{GS} + C_{GD})}
$$

它只由 $g_m$ 和寄生電容決定。L 越長，$C_{GS}$ 越大、$g_m$ 越小，$f_T$ 掉得很快；[[AIC_hw0_blog|HW0]] 量到的趨勢就是這樣，跟 intrinsic gain $g_m r_o$ 隨 L 的變化剛好相反。
