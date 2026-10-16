---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: MOS 元件：操作區、小訊號模型與二階效應
date: '2024-09-03'
updated: '2026-10-16 15:31:53'
tags:
  - AIC
  - Device
summary: 從類比電路的角度看 MOS：三個操作區與 pinch-off、square law、channel-length modulation、body effect、short-channel effect，小訊號模型裡的 gm、ro，以及為什麼手算和 HSPICE 的結果常常對不上。
permalink: notes/aic-mos/
synced: obsidian
---

類比電路裡的 MOS 像一個水龍頭。數位電路只在乎水龍頭開或關，類比電路在乎轉了幾圈、流出多少水：gate 電壓決定電流，而電流對 gate 電壓的敏感度（$g_m$）決定了放大的倍率。這篇整理 MOS 的操作方式和小訊號模型，後面所有放大器都建立在這上面。課程總覽見[[AIC_blog|電子學（二）筆記總覽]]。

## 三個操作區

| 區域 | $V_{GS}$ | $V_{DS}$ | 行為 |
| --- | --- | --- | --- |
| Cutoff | $V_{GS} < V_{TH}$ | 不影響 | 沒有通道，（理想上）沒有電流 |
| Triode（linear） | $V_{GS} > V_{TH}$ | $V_{DS} < V_{GS} - V_{TH}$ | 像一顆受 $V_{GS}$ 控制的電阻 |
| Saturation | $V_{GS} > V_{TH}$ | $V_{DS} > V_{GS} - V_{TH}$ | 像一個受 $V_{GS}$ 控制的電流源 |

$V_{GS}$ 從 0 往上加，gate 上的正電荷先把 p substrate 表面的電洞推開，留下帶負電的空乏區；超過 $V_{TH}$ 之後表面開始聚集電子，形成 n 型的反轉層，也就是 source 和 drain 之間的通道。電子在通道裡靠 drift 移動，所以電流跟通道裡的電荷量、以及兩端的電壓差都有關。

$V_{DS}$ 小的時候，整條通道都在，電流隨 $V_{DS}$ 線性增加，這是 triode。$V_{DS}$ 加大到 $V_{GS} - V_{TH}$ 以上，drain 那端的通道電荷降到零，通道在離 drain 一小段距離的地方被「夾斷」（pinch-off）。電子走到通道盡頭之後，被 drain 周圍空乏區的電場直接掃進 drain，所以再加大 $V_{DS}$，電流也幾乎不變。這就是 saturation：電流由 gate 決定，和 drain 電壓無關。

![[aic-mos-pinchoff.svg|Saturation 時的 NMOS 剖面：反轉層通道從 source 往 drain 越來越薄，在 L' 的位置被夾斷。從 pinch-off 點到 drain 的那段 ΔL 沒有通道，電子是被空乏區的電場掃過去的]]

放大器要的是「gate 控制電流、而且電流不太受輸出電壓影響」的特性，所以類比電路裡的電晶體幾乎都偏壓在 saturation。

## Square law

長通道的 MOS，saturation 的電流是

$$
I_D = \frac{1}{2}\mu_n C_{ox}\frac{W}{L}(V_{GS} - V_{TH})^2
$$

triode 的電流是

$$
I_D = \mu_n C_{ox}\frac{W}{L}\left[(V_{GS} - V_{TH})V_{DS} - \frac{V_{DS}^2}{2}\right]
$$

$V_{GS} - V_{TH}$ 常寫成 overdrive voltage $V_{ov}$，它也是電晶體進入 saturation 所需的最小 $V_{DS}$。

![[aic-mos-iv.svg|NMOS 的 I_D–V_DS 曲線，三條對應三個不同的 V_GS。虛線 V_DS = V_GS − V_TH 左邊是 triode，右邊是 saturation；saturation 的電流還會隨 V_DS 微微上升，這是 channel-length modulation]]

## 二階效應

### Channel-length modulation

實際的 saturation 電流還是會隨 $V_{DS}$ 增加：$V_{DS}$ 越大，pinch-off 點越往 source 移，有效通道長度 $L' = L - \Delta L$ 變短，電流就變大。用一個參數 $\lambda$ 描述：

$$
I_D = \frac{1}{2}\mu_n C_{ox}\frac{W}{L}(V_{GS} - V_{TH})^2(1 + \lambda V_{DS})
$$

$\lambda$ 大約跟 $1/L$ 成正比，因為同樣的 $\Delta L$ 在短通道上占的比例比較大。這就是類比電路常用比最小尺寸長得多的 L 的原因：L 越長，電晶體越接近理想電流源。

### Body effect

Source 和 body 之間有電壓差（$V_{SB} > 0$）時，空乏區裡的負電荷變多，gate 要感應出同樣多的通道電子需要更高的電壓，$V_{TH}$ 變大：

$$
V_{TH} = V_{TH0} + \gamma\left(\sqrt{2\Phi_F + V_{SB}} - \sqrt{2\Phi_F}\right)
$$

NMOS 的 body 通常接地，所以 source 不接地的電晶體（例如 source follower、cascode 上面那顆、差動對）都會受影響。[[AIC_hw0_blog|HW0]] 量過 body 接地和 body 接 source 兩種接法的差別：接地時 $V_{TH}$ 隨 source 電壓一路上升，接 source 時幾乎不動。

### Short-channel effect

通道縮短之後，幾個長通道沒有的問題變得明顯：

- 電晶體關不乾淨，off 的時候還有漏電流。
- Drain 的電壓開始影響通道（$V_{TH}$ 隨 $V_{DS}$ 變化），電流源變得不理想。
- Source、drain 邊緣的效應占整條通道的比例變大。

先進製程用 FinFET 解決：通道做成立起來的鰭，gate 從三面包住，對通道的控制力比平面電晶體強。

### $V_{TH}$ 的取捨

- **$V_{TH}$ 高**：off current（漏電）小，但同樣的電流需要更高的 gate 電壓，速度也比較慢。
- **$V_{TH}$ 低**：速度快、可以在低電壓下工作，但漏電大、比較難關乾淨。

現在的製程大約落在 300 到 500 mV。

## 尺寸怎麼選

需要很寬的電晶體時，通常不是畫一顆 W 很大的，而是把同樣尺寸的電晶體並聯（多根 finger，或 HSPICE 裡的 multiplier `M`）。每一種寬度都單獨生產的話，變異會很大；用相同的單元並聯，匹配比較好。這在 FinFET 製程裡更重要，因為寬度本來就只能是 fin 數的整數倍。

## 小訊號模型

放大器處理的是疊在偏壓上的小訊號。偏壓點附近把 $I_D$ 對 $V_{GS}$ 線性化，MOS 就變成一個受 $v_{gs}$ 控制的電流源：

![[aic-mos-small-signal.svg|MOS 的小訊號模型：gate 開路（i_G = 0），drain 到 source 之間是受 v_gs 控制的電流源 g_m v_gs，並聯輸出電阻 r_o；source 和 body 電壓不同時，還有 body effect 帶來的 g_mb v_bs]]

$g_m$ 描述 gate 電壓的小變化能造成多少 drain 電流的變化，也就是這顆電晶體的「力氣」。三種寫法都會用到：

$$
g_m = \frac{\partial I_D}{\partial V_{GS}} = \mu_n C_{ox}\frac{W}{L}V_{ov} = \sqrt{2\mu_n C_{ox}\frac{W}{L}I_D} = \frac{2I_D}{V_{ov}}
$$

$r_o$ 來自 channel-length modulation：

$$
r_o = \left(\frac{\partial I_D}{\partial V_{DS}}\right)^{-1} \approx \frac{1}{\lambda I_D}
$$

兩者都是偏壓點的函數。所以設計放大器分兩步：DC 決定操作點（$V_{GS}$、$V_{DS}$、$I_D$），操作點決定 $g_m$、$r_o$；AC 再用這些參數算增益 $A_v$、輸入阻抗 $R_{in}$、輸出阻抗 $R_{out}$。

### Intrinsic gain

一顆電晶體自己能提供的最大電壓增益是

$$
g_m r_o = \frac{2I_D}{V_{ov}}\cdot\frac{1}{\lambda I_D} = \frac{2}{\lambda V_{ov}}
$$

想要大：L 長一點（$\lambda$ 小）、$V_{ov}$ 小一點。代價是 L 越長，寄生電容越大、速度越慢，[[AIC_hw0_blog|HW0]] 量到的 $g_m r_o$ 和 $f_T$ 隨 L 的變化剛好是相反的趨勢。

## PMOS 與 CMOS

PMOS 的通道載子是電洞，mobility 只有電子的三分之一到四分之一。作業用的 0.18 µm 製程，$\mu_n C_{ox}$ 大約是 $\mu_p C_{ox}$ 的 3.7 到 4 倍，所以要讓 PMOS 和 NMOS 流一樣的電流，PMOS 的 W/L 要大好幾倍。CMOS 製程在 p substrate 上做一塊 n-well，讓 NMOS 和 PMOS 可以放在同一片基板上。

## 手算和 HSPICE 為什麼對不上

作業用的 model 是 BSIM（HSPICE 的 level 49），裡面包含短通道、mobility degradation、velocity saturation、subthreshold 等效應，跟課本的 square law 差很多。作業裡常見的狀況：

- 用 square law 估的電流可以差到好幾倍，尤其是 $V_{ov}$ 只有幾十 mV、電晶體接近 subthreshold 的時候（[[AIC_hw1_blog|HW1]] 就差了 10 倍）。
- $V_{TH}$ 會隨尺寸、$V_{DS}$、$V_{SB}$ 變，換了尺寸之後要重新讀。
- 進入 saturation 需要的 $V_{DS}$（$V_{Dsat}$）通常比 $V_{GS} - V_{TH}$ 小一點。

所以比較實際的流程是：用 square law 估一組尺寸，模擬一次，從 `.lis` 讀出這組尺寸下的參數，再做下一輪設計。電流很難算準，但設計時真正需要的是增益和偏壓點，這些用讀出來的 $g_m$、$g_{ds}$ 算，結果就準得多。

`.op` 會印出每顆電晶體的 region、$I_D$、$V_{th}$、$V_{Dsat}$、$V_{od}$、$\beta = \mu C_{ox}W/L$、$g_m$、$g_{ds}$、$g_{mb}$ 和各個寄生電容。想看它們怎麼隨某個參數變化，可以用 `.probe` 把元件參數拉出來畫：

```spice
.probe
+ vth(M1)          $ threshold voltage
+ gmo(M1)          $ transconductance g_m
+ gdso(M1)         $ output conductance g_ds
+ '1/gdso(M1)'     $ output resistance r_o
+ vdsat(M1)        $ saturation voltage V_Dsat
```
