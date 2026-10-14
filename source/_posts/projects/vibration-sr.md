---
title: 震動馬達驅動的手持多幀超解析
date: 2026-10-14 09:00:00
layout: project
featured: false
part: VIB-SR
summary: 寫了一個 Android app，在連拍時驅動手機的震動馬達（或外接馬達）製造 sub-pixel 位移，並實作 kernel regression 與 TV 最佳化兩種多幀超解析。IMU 證實馬達注入了約 5 倍的位移，但曝光時間內的 motion blur 讓重建結果反而比不上自然手震。
period: 2026 Spring
role: Capture app · Alignment · SR reconstruction
course: 清大 EE6620 計算攝影學 期末專題
team: 2 人小組
stack: [Python, Flutter, Kotlin]
tools: [NumPy, SciPy, ProxImaL, OpenCV, Android Camera2]
tags: [Computational Photography, Super-Resolution, Android, Python]
floorplan: [CAPTURE APP, IMU LOG, ALIGN, KERNEL MERGE, TV SOLVER]
metrics:
  - { label: Kernel merge, value: 6.4 s, note: "TV solver: 2328.9 s" }
  - { label: Upscale, value: "2× · 4× · 5×", note: kernel-regression merge }
  - { label: Injected motion, value: "≈ 5×", note: "IMU path length 4.1 → 20.7 mm (lowFreq)" }
  - { label: Burst, value: 8–32 frames, note: "manual exposure · AE / AF / AWB off" }
---

## Overview

單張手機照片的解析度受限於感光元件：鏡頭能解析的細節常常比像素還細，這些細節落在像素之間，就會折疊成 aliasing。單張照片救不回來，但**連拍**可以：只要相機在幀與幀之間移動不到一個像素，每一幀就會在稍微不同的位置取樣，把這些交錯的樣本合併到更細的網格上，就能重建出單張照片拍不到的高頻細節。

Wronski et al. 的 *Handheld Multi-Frame Super-Resolution*（SIGGRAPH 2019，Google Pixel 的 Super-Res Zoom）發現，拍照時**自然的手震**就已經提供了這種 sub-pixel 位移。但手震是不可控的：可能太小（幾張幾乎一樣）、分布不均，或是混了太多漂移。

我們的想法是：**把幀間位移變成拍攝流程裡可以控制的一部分**。比較三種製造位移的方式：自然手震、驅動手機內建的震動馬達、外接馬達，並用手機的 IMU 驗證實際注入了多少運動。

最後的答案和預期相反：馬達確實注入了更多位移，sub-pixel 的分布也更好，但重建結果反而**沒有比手震清楚**。原因是馬達在曝光時間內就把畫面晃糊了。

## 系統架構

整個系統分成三段，後兩段刻意保留兩條平行的重建路線來比較：

| 階段 | 做什麼 | 實作 |
| --- | --- | --- |
| 產生位移的 burst | 手持／手機震動／外接馬達，連拍 8–32 張 JPEG，同時記錄 IMU | 自製 Android app |
| 對齊 | 估計每一幀相對於參考幀的位移 | coarse-to-fine 對齊（兩條路線共用） |
| 合併 | 把對齊後的多幀重建成高解析影像 | kernel regression **或** TV 最佳化 |

所有超解析運算都在電腦上離線執行，app 只負責收資料。

### Capture app

手機內建的相機 API 既不能連拍也不能手動曝光，所以我們用 Flutter 寫了一個 app，底層用 Kotlin 寫原生的部分。app 有三個互相配合的功能：

- **震動控制**：透過 Flutter 的 vibration 套件與 Android 的 `VibrationEffect`，每種模式是一段（timings, amplitudes）交錯的 on–off 脈衝波形，脈衝週期決定等效頻率，連拍期間一直循環：

  | 模式 | 驅動 |
  | --- | --- |
  | `none` | 不驅動 |
  | `lowFreq` | ≈ 10 Hz |
  | `midFreq` | ≈ 25 Hz |
  | `highFreq` | ≈ 50 Hz |
  | `lowAmp` | 25 Hz、振幅降低（把振幅和頻率的影響分開） |
  | `sweep` | 掃頻 |

- **連拍**：用原生的 Camera2 plugin 做全手動的 still-capture burst，關掉自動曝光、自動對焦、自動白平衡，固定 ISO、短曝光。
- **IMU 記錄**：連拍期間同時訂閱加速度計與陀螺儀，和照片、拍攝參數一起存下來。

IMU 資料用來算運動量、頻譜，以及濾波後的 dead-reckoning 軌跡（1.5 Hz high-pass 再去趨勢）。加速度積分兩次一定會漂移，所以軌跡只拿來**相對比較**不同拍攝方式，不當成絕對的位移量。

![lowFreq 模式一次連拍的 IMU 軌跡：上排是三軸位置，下排是 2D 投影，整個約 1 秒的連拍裡位移在 1 mm 上下](/images/vibration-sr/imu-trace.png)

### 對齊

兩條路線用的是同一套對齊引擎，差別在輸出的形式：kernel regression 需要逐像素的位移場，TV 最佳化則是每個 tile 每一幀只要一個 sub-pixel 平移 $(dx, dy)$。

- **Coarse-to-fine block matching**：在 Gaussian pyramid 上做 block matching，粗層用 L2、細層用 L1，最後在 3×3 鄰域擬合二次曲面取得 sub-pixel 精度。
- **Lucas–Kanade refinement**：再用 dense optical flow 微調。
- **離群值剔除**：平坦或週期性的區域很容易配錯，用兩輪 median 濾掉。
- **逐像素位移場**：把每個 tile 的位移場用 bilinear 內插放大成逐像素的 warp，合併時才不會有 tile 的接縫。

## 兩種合併方法

### Kernel regression

這是 Wronski et al. 的方法：在放大後的網格上，把所有幀的樣本做加權平均。$n$ 是第幾幀，$i$ 是這個輸出像素附近的樣本，$c_{n,i}$ 是樣本的顏色，$d_i$ 是樣本到輸出像素的距離：

$$
C(x, y) = \frac{\sum_n \sum_i c_{n,i}\, w_{n,i}}{\sum_n \sum_i w_{n,i}},
\qquad
w_{n,i} = \exp\left(-\tfrac{1}{2}\, d_i^\top \Omega^{-1} d_i\right)
$$

$\Omega^{-1}$ 來自參考幀亮度的 structure tensor：在邊緣上，kernel 會沿著邊緣方向拉長，讓邊緣保持銳利；在平坦區域則擴散開來，順便降噪。樣本用 bilinear 在反投影回去的連續位置取值，RGB 三個通道共用同一個從亮度算出來的 kernel，另外再用 robustness mask 降低沒對準或有移動物體區域的權重。

這個方法快、穩定，但它本質上是一個 order-0 的 smoother，最好的情況也只能逼近「被相機 PSF 模糊過的真實影像」。

### TV 最佳化

第二種方法把超解析當成反問題：每一張低解析影像 $Y_i$ 都是高解析影像 $X$ 經過模糊 $B_i$（Gaussian PSF 加上這一幀的位移）、降取樣 $D$、再加上雜訊得到的，$Y_i = D B_i X + n$。我們要找一個 $X$，讓它在每一幀的 L1 誤差和 Total Variation 加起來最小：

$$
E(X) = \sum_i \left\lVert D\,(X \otimes B_i) - Y_i \right\rVert_1 + \lambda \left\lVert \nabla X \right\rVert_{TV},
\qquad
\left\lVert \nabla X \right\rVert_{TV} = \sum_p \sqrt{X_x(p)^2 + X_y(p)^2}
$$

和 kernel regression 不同，這個方法會**反卷積掉 PSF**，所以能恢復比 smoother 更多的細節；L1 距離和保邊的 TV 項也讓它對離群值比較不敏感。代價是要迭代求解，而且很依賴 forward model 準不準。我們用開源的 [ProxImaL](https://github.com/comp-imaging/ProxImaL) 求解，跑固定的迭代次數。

實作上有兩個問題要處理：

**把位移拆成整數與小數。** sub-pixel 的 forward model 只有在模糊 kernel 的中心還在它的小視窗裡時才成立。但震動造成的位移常常有好幾個像素，如果整段位移都塞進 kernel，中心會跑出 15×15 的視窗，反卷積就壞掉了。所以把每一幀的位移拆成整數和小數：

$$
dx = \operatorname{round}(dx) + \operatorname{frac}(dx)
$$

整數部分直接移動這一幀讀取 tile 的位置，變成 $(o_x + \operatorname{round}(dx),\ o_y + \operatorname{round}(dy))$；只有小數部分放進 PSF，當作 sub-pixel 的 kernel 中心。配合函式庫降取樣的方式，含位移的 kernel 中心是（$s$ 是放大倍率，$dx, dy$ 是位移的小數部分）：

$$
\text{center} = \left(-\frac{s - 1}{2} + s \cdot dx,\ -\frac{s - 1}{2} + s \cdot dy\right)
$$

**用重疊的 sub-tile 重建大範圍。** 一次 TV 求解假設整個 tile 裡每一幀只有一個平移量，256×256 的小 tile 沒問題，但大範圍的影像裡位移會隨位置改變，甚至有旋轉。所以把 512×512 的低解析區域切成 256×256、stride 128 的 sub-tile，也就是 3×3 共 9 次求解，每次產生一塊 512×512 的高解析 patch，重疊的地方用 Hann window 加權平均：

$$
\text{merge} = \frac{\sum_t w_t \cdot \text{patch}_t}{\sum_t w_t},
\qquad
w_t = 0.5 \cdot \left(1 - \cos\frac{t\pi}{\text{tile}/2}\right)
$$

![左邊是 9 個 sub-tile 各自的重建結果，右邊是用 Hann window 合併後的 1024×1024 影像](/images/vibration-sr/tiled-merge.png)

### 前提假設

1. 在約 1 秒的連拍時間內，場景大致是靜止的。
2. 幀間位移小，而且主要來自相機整體的移動，所以全域 warp 和 tile 對齊加上 median 篩選是合理的。
3. 色度跟著亮度走，所以 RGB 可以共用同一個 kernel。
4. TV 求解時假設的模糊要和真實的 PSF 相符，反卷積才是 well-posed。

## 實驗

| 實驗 | 變因 | 結論 |
| --- | --- | --- |
| A | 兩種合併方法 × 兩個場景 | TV 邊緣最銳利，但怕雜訊又慢了約 360 倍；kernel regression 乾淨又快 |
| B | 輸入幀數 $N$ 與放大倍率 | 細節隨 $N$ 單調增加，邊際效益遞減 |
| C | 手機的震動模式（腳架，同一個場景） | 馬達注入了數倍的位移，但重建沒有變清楚 |
| D | 外接馬達固定在身體的哪個位置 | 適度的運動有幫助，太大就糊掉、也超出對齊範圍 |
| E | 腳架上拍戶外建築的震動模式，分析位移分布 | sub-pixel 的分布變好了，畫質還是沒有變好 |

實驗 B 只改變同一組連拍裡用了幾張，可以直接比較頻譜；實驗 C–E 比較的是不同次的連拍（有些甚至是不同場景），像素層級對不上，所以只比較細節放大圖和 IMU 量到的運動。

### A. Kernel regression vs. TV 最佳化

兩個場景：(1) 明亮、高對比的屋瓦，(2) 陰影裡低對比的磚牆。每個場景都和 nearest-neighbor ×2、bicubic ×2（baseline）比較。TV 的設定是單一 256×256 tile、$\lambda = 5 \times 10^{-3}$、200 次迭代、Gaussian $\sigma = 1.2$。

![實驗 A，屋瓦場景。左起：nearest-neighbor ×2、bicubic ×2、TV 最佳化、kernel regression；下排是局部的 4 倍放大](/images/vibration-sr/exp-a-roof.png)

![實驗 A，陰影中的磚牆。TV 最佳化在暗部出現明顯的 ringing 雜訊](/images/vibration-sr/exp-a-brick.png)

兩種方法都比 bicubic 清楚，差別在三個面向：

- **邊緣銳利度**：兩個場景的排序都是 TV > kernel regression > bicubic。TV 反推了 PSF，又有 TV 項幫忙，不只是把模糊的樣本平均起來；kernel regression 比 bicubic 乾淨，但邊緣稍軟。
- **降噪**：kernel regression 比較好，尤其是光線不足的場景。它就像一個低通濾波器，順便把高頻雜訊濾掉了；TV 則去不掉雜訊，還可能因為 ringing 產生額外的雜訊。看頻譜的話，TV 的高頻成分最大，但裡面同時有邊緣和雜訊。
- **執行時間**：TV 要 2328.9 秒，kernel regression 只要 6.4 秒。TV 要不斷迭代更新目標函數，也需要更多記憶體。

### B. 輸入幀數

用同一組 32 張的手持連拍（靜止的建築外牆），丟掉前 3 張後，用 kernel regression 在 2×、4×、5× 下各跑 $N = 2$ 到 29 張。因為只有 $N$ 在變，可以拿「剛好高於輸入 Nyquist 頻率的頻帶」裡，SR 結果和 bicubic 的功率比當作指標。

![實驗 B：左圖是 SR-Nyquist 附近的頻帶，雜訊主導、不同倍率之間不能比較；右圖是剛好高於輸入 Nyquist 的乾淨頻帶，每個倍率都隨 N 上升](/images/vibration-sr/exp-b-frames.png)

在乾淨的頻帶裡，每個倍率的細節都隨 $N$ 單調上升，從 $N = 2$ 時約 bicubic 的 0.50 倍，到 $N = 29$ 時約 0.72 倍，邊際效益遞減；4×、5× 的網格更密，需要更多張才能填滿。這是唯一一個能直接比較數字的實驗，它確認了多幀合併真的有恢復細節。左圖則提醒我們：只看單一個高頻數字很容易被雜訊誤導。

![實驗 B 的磚牆細節：bicubic、N = 8、N = 29](/images/vibration-sr/exp-b-brick.png)

### C. 手機震動模式

為了把馬達的效果和手的運動分開，手機固定在腳架上，同一個場景用 `none`、`lowFreq`、`midFreq` 各拍一組 32 張的連拍。按快門本身會讓手機晃動，所以只取第 16–32 張重建，同時記錄 IMU。

IMU 證實馬達做了我們想要的事：濾波後的軌跡長度從 `none` 的約 4.1 mm，增加到 `lowFreq` 的約 20.7 mm 和 `midFreq` 的約 12.3 mm，是腳架上殘餘晃動的好幾倍。

但重建結果完全不是這樣：加了震動的版本都沒有變清楚，效果最好的反而是只靠手自然晃動的手持拍攝。更早一輪用手持拍了六種震動模式，結果也一樣：

![手持拍攝時六種震動模式的細節比較。加了震動的版本都沒有比 none 清楚](/images/vibration-sr/exp-c-modes.png)

原因有兩個。第一，**加了震動的輸入影像本身就是糊的**：

![同一個場景的低解析輸入放大：只有手震的版本磚縫清楚，手機震動的版本明顯模糊](/images/vibration-sr/blur-compare.png)

第二，**手持時的手震已經提供了足夠的 sub-pixel 位移**。把每一幀位移的小數部分畫在單位格裡，`none` 的覆蓋率反而是最高的：

![手持拍攝時各震動模式的 sub-pixel 位移分布，coverage 越高代表越均勻地填滿單位格。none 0.839 最高，lowAmp 0.638 最低](/images/vibration-sr/exp-c-coverage.png)

所以對手持拍攝來說，再加上手機震動並不能提高解析度。

### D. 外接馬達的固定位置

手持手機，把外接馬達固定在身體的不同位置：右手、背、左臂、左手，以及左臂並開到最高頻率，每個位置拍一組並記錄 IMU。

固定的位置大幅影響了運動量：濾波後的軌跡長度從右手的約 5 mm 到左手的約 33 mm（峰值頻率約 28 Hz）。大部分位置的重建都比 bicubic 清楚，其中固定在右手的效果最好；但運動最大、最快的左手開始在單一幀內就糊掉，位移也超出對齊器的範圍，合併品質跟著下降。這劃出了「可用的運動範圍」的上限。

![實驗 D：外接馬達固定在不同位置的細節比較。最左邊是 bicubic](/images/vibration-sr/exp-d-external.jpg)

### E. 腳架上的手機震動

如果手震已經夠了，那在**沒有手震**的時候，馬達能不能補上？把手機固定在腳架上，對戶外的建築用 `none`、`lowFreq`、`midFreq` 各拍一組。

位移的分析符合預期。在腳架上，殘餘的相機運動很小，像素層級的位移幾乎縮成原點附近的一小團（下圖上排，藍色是腳架、灰色是之前的手持）；開了震動之後，sub-pixel 位移重新分散開來。換句話說，馬達確實成功注入了多幀 SR 理論上需要的、分布均勻的 sub-pixel 位移。

![上排是像素層級的總位移，下排是 sub-pixel 的相位分布；灰色是手持、藍色是腳架](/images/vibration-sr/exp-e-offsets.png)

但畫質還是沒有跟上：sub-pixel 分布更好，重建卻沒有更銳利，`none` 看起來最好，`lowFreq` 和 `midFreq` 都比較軟。

![實驗 E：腳架上不同震動模式的細節比較](/images/vibration-sr/exp-e-tripod.png)

問題出在輸入：馬達讓手機移動得太快，在**每一次曝光的期間**就移動了明顯的距離，原本想要的「幀與幀之間」的位移，變成了「幀內」的 motion blur。SR 可以合併銳利但彼此錯開的影像，卻沒辦法從模糊的影像裡變出細節。

## 結論

1. 兩種方法都成功重建出高解析影像，而且互補：TV 最佳化的邊緣最銳利，但怕雜訊、會有瑕疵、也慢得多；kernel regression 快、穩定、沒有瑕疵，但比較軟。細節也確實隨幀數單調增加。
2. 和最初的假設相反：IMU 證實馬達注入了數倍的運動、sub-pixel 分布也更好，但加了震動的重建反而比較軟，自然手震（或不驅動）的效果最好。

{% note tip 關鍵在曝光時間 %}
馬達的運動必須慢到不會在曝光期間造成模糊，或者曝光要更短。主動震動仍然有意義：它把隨機的手震變成**可控的**運動，只要驅動和曝光時間搭配得上就能發揮作用。下一步是用 IMU 把模糊的幀篩掉，並讓馬達的運動配合曝光時間與合併 kernel 的需求。
{% endnote %}

## 哪些是我們做的

- **參考與沿用**：Wronski et al. 的演算法是我們自己照論文實作的；TV 最佳化以課程 HW3 的助教程式碼為起點再改進，求解器用開源的 ProxImaL；兩邊的 Python 程式都只用標準的開源函式庫；手機端用 Android 的 Camera2。分析結果用的視覺化腳本（matplotlib 等）有請 Claude 協助撰寫。
- **自己做的**：所有實驗資料、Android app、對齊、兩種合併方法、位移的整數／小數拆分，以及重疊 sub-tile 的大範圍重建。

## What I learned

- **SR 要的是幀間位移，不是更多位移。** 運動量變成 5 倍、sub-pixel 分布也更好，畫質卻變差；真正的限制是曝光時間內的運動。
- **先量測，才能定位問題。** 有 IMU 軌跡和 sub-pixel coverage，才能確定馬達有效、對齊也沒問題，把原因鎖定在輸入的 motion blur，而不是去懷疑合併演算法。
- **銳利不等於好。** TV 最佳化的高頻成分最多，但裡面有一大部分是雜訊和 ringing；單看一個高頻指標很容易被騙，實驗 B 的兩個頻帶就是例子。

## References

1. B. Wronski, I. Garcia-Dorado, M. Ernst, D. Kelly, M. Krainin, C.-K. Liang, M. Levoy, and P. Milanfar, "Handheld Multi-Frame Super-Resolution," *ACM Transactions on Graphics*, vol. 38, no. 4, Art. no. 28, 2019.
2. G. Litterio, J.-D. Lizarazo-Ferro, P. Felzenszwalb, and R. Zia, "Super-Resolution with Structured Motion," *IEEE International Conference on Computational Photography (ICCP)*, 2025.
