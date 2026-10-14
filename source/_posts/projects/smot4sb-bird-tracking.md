---
title: 從無人機追蹤小鳥：MVA 2025 SMOT4SB 挑戰賽第 3 名
date: 2025-07-26 10:00:00
layout: project
featured: false
part: SMOT4SB
summary: 參加 MVA 2025 的 SMOT4SB 挑戰賽，在無人機拍的影片裡偵測並追蹤只有十幾到三十個像素大的鳥。我們的隊伍 elsalabA 用 Co-DETR 偵測器，訓練時把 Stable Diffusion 生成的鳥 copy-paste 進訓練資料，推論時用 SAHI 切塊，再接 BoostTrack++ 追蹤；private test 的 SO-HOTA 43.87，是 baseline 的 4.4 倍，在 78 位參賽者中排名第 3。
period: 2025 Spring
role: Detector training · Ensemble training · Paper (Experiments)
course: MVA 2025 SMOT4SB 挑戰賽
team: elsalabA · 11 人隊伍
stack: [Python, PyTorch]
tools: [Co-DETR, SAHI, BoostTrack++, Stable Diffusion]
tags: [Multi-Object Tracking, Small Object Detection, Computer Vision, Competition]
floorplan: [CROP 640², COPY-PASTE, CO-DETR, SAHI TILES, BOOSTTRACK++]
cover: /images/smot4sb-bird-tracking/dataset-examples.jpg
metrics:
  - { label: Rank, value: "3rd", note: "private test · 78 participants · 308 submissions" }
  - { label: SO-HOTA, value: "43.87", note: "private test · baseline 9.90" }
  - { label: SO-DetRe, value: "53.39", note: "private test · highest in top 5" }
  - { label: Model size, value: 304 M params, note: "0.500 s/img · RTX 3090" }
links:
  - { label: 論文（MVA 2025）, url: "https://doi.org/10.23919/MVA65244.2025.11175122" }
  - { label: Challenge 報告（arXiv）, url: "https://arxiv.org/abs/2507.12832" }
---

## Overview

無人機要避開鳥才不會撞上；反過來，用無人機保護農田與漁場不受鳥害、自動做鳥類數量調查，也都要先知道鳥在哪裡、往哪裡飛。難處在於鳥離鏡頭很遠：在 4K 的畫面裡，一隻鳥常常只佔**十幾到三十個像素**，看不出形狀，更看不出是哪一隻。

MVA 2025 的 **SMOT4SB**（Small Multi-Object Tracking for Spotting Birds）挑戰賽就是這個題目：給一段無人機拍的影片，把每一隻鳥框出來，並在整段影片裡維持同一個 ID。它延續 MVA 2023 只做單張偵測的 SOD4SB，這次加上了時間軸。

我們的隊伍 **elsalabA**（清大、台大、陽明交大共 11 人）做的是兩階段的 tracking-by-detection：

1. **偵測**：Co-DETR，在切成 640×640 的訓練資料上訓練，並用 copy-paste 把真實與 Stable Diffusion 生成的鳥貼進背景，增加小物體的數量與多樣性；推論時用 SAHI 把高解析的畫面切成同樣大小的 tile。
2. **追蹤**：BoostTrack++，把每一幀的偵測串成軌跡。

最後在 private test 拿到 SO-HOTA **43.87**，是主辦單位 baseline（9.90）的 4.4 倍，排名第 3，方法也整理成論文發表在 MVA 2025。

## 題目：SMOT4SB

### 資料集

影片由 DJI Mavic 2 Pro、DJI Phantom 4 Pro V2.0 與 ProDrone PD4B-M 拍攝，30 fps，解析度是 1920×1080 或 3840×2160，場景涵蓋市區、公園、森林、河邊與農田，鳥類有鷹、烏鴉、水鳥、麻雀等，全部只標成一類 `bird`。

![SMOT4SB 的影像範例：放大框裡就是要追的鳥，寬度只有 13 到 32 個像素](/images/smot4sb-bird-tracking/dataset-examples.jpg)

| Subset | Videos | Frames | Instances | IDs |
| --- | ---: | ---: | ---: | ---: |
| Train | 128 | 66,602 | 226,292 | 1,256 |
| Public test | 38 | 16,489 | 51,325 | 509 |
| Private test | 45 | 25,101 | 94,073 | 475 |
| **Total** | **211** | **108,192** | **371,690** | **2,240** |

Train 有影片與標註；public test 只給影片，結果上傳到 CodaBench 評分（每天最多 10 次）；private test 完全不公開，比賽結束時由主辦單位直接跑各隊交出去的程式碼，最終排名以它為準。

這個題目比一般的 MOT 難在三個地方：

- **物體太小**：大部分的鳥都小於 MS COCO 對小物體的定義（32×32 px），外觀資訊幾乎沒有，靠外觀特徵做 re-ID 的方法很難派上用場。
- **相機和鳥都在 3D 空間裡動**：行人追蹤的相機是固定的，UAV 拍車流時車子也只在平面上動；這裡無人機和鳥都在空中自由移動，畫面上的位移是兩者混在一起的結果。
- **成群飛行**：鳥常常一群一起飛，互相遮擋、交錯，ID 很容易換掉。

### 評分：SO-HOTA

一般的 MOT 用 HOTA 評分，判斷一個預測框有沒有對到 ground truth 用的是 IoU。但對小物體來說，IoU 太嚴格了：兩個 $d \times d$ 的框只要垂直錯開 $x$ 個像素，

$$
\text{IoU} = \frac{d - x}{d + x}
$$

16×16 的框只要偏 8 px，IoU 就從 1 掉到 1/3，已經低於常用的 0.5 門檻；偏到 16 px，兩個框完全不重疊，IoU 變成 0，這時離 ground truth「差一點」和「差很遠」被當成一樣錯。

主辦單位因此提出 **SO-HOTA**，把 HOTA 裡的 IoU 換成 **Dot Distance（DotD）**：只看兩個框中心的距離，再用整個資料集的平均物體大小 $S$ 正規化。

$$
\text{DotD}(A, B) = e^{-D/S},
\qquad
D = \sqrt{(x_A - x_B)^2 + (y_A - y_B)^2}
$$

$$
S = \sqrt{\frac{\sum_{i=1}^{M} \sum_{j=1}^{N_i} w_{ij}\, h_{ij}}{\sum_{i=1}^{M} N_i}}
$$

$M$ 是影像數，$N_i$ 是第 $i$ 張影像裡的標註框數，$w_{ij}$、$h_{ij}$ 是框的寬和高。

其餘照 HOTA 的定義：在門檻 $\alpha$ 下，$\text{DotD} \ge \alpha$ 的配對算 true positive，偵測準確度 SO-DetA 與關聯準確度 SO-AssA 取幾何平均，再對 19 個門檻平均：

$$
\text{SO-HOTA}_\alpha = \sqrt{\text{SO-DetA}_\alpha \times \text{SO-AssA}_\alpha}
$$

$$
\text{SO-HOTA} = \frac{1}{19} \sum_{\alpha \in \{0.05,\, 0.1,\, \dots,\, 0.95\}} \text{SO-HOTA}_\alpha
$$

![主辦單位的比較：預測框整段垂直偏 x 個像素。中間是 IoU 與 DotD 隨中心距離的變化，右邊是 HOTA 與 SO-HOTA；HOTA 在框一不重疊時就掉到 0，SO-HOTA 則平滑下降](/images/smot4sb-bird-tracking/so-hota-vs-hota.png)

以 16 px 的框為例：

| 偏移 $x$ [px] | HOTA | SO-HOTA |
| ---: | ---: | ---: |
| 8 | 31.58 | 63.16 |
| 12 | 10.53 | 47.37 |
| 16 | 0.00 | 36.84 |
| 20 | 0.00 | 26.32 |
| 24 | 0.00 | 21.05 |

主辦單位提供的 baseline 是 YOLOX 偵測加 OC-SORT 追蹤，private test 的 SO-HOTA 是 9.90。

## 我們的方法

### 偵測器：Co-DETR

偵測器選用 **Co-DETR**（Collaborative Hybrid Assignments Training）。DETR 類的偵測器是一對一地把預測配給 ground truth，每個物體只有一個正樣本，監督訊號少；Co-DETR 在訓練時額外接上幾個一對多指派的輔助 head（例如 ATSS、Faster R-CNN 式的指派），讓 encoder 學到更多，推論時只留原本的 DETR head，所以不增加推論的成本。

### 訓練：切塊 + 逐步 copy-paste

原始影像是 1080p 或 4K，直接拿來訓練，鳥相對整張圖太小，GPU 記憶體也吃不消。所以先把訓練影像**切成 640×640** 的 crop。

但切完之後，大部分的 crop 裡沒幾隻鳥，正樣本還是太少。於是用 **copy-paste** 把鳥貼進背景，鳥的來源有兩種：

- Kaggle 上的 Birds Flying Dataset 裡的真實鳥。
- 用 **Stable Diffusion** 生成的鳥。

貼的過程分成幾個階段，逐步增加畫面的複雜度與鳥的密度，讓 Co-DETR 在越來越難的樣本上學到小物體的特徵。

![訓練流程：SMOT4SB 切成 640×640 後，分幾個階段 copy-paste 鳥進去，再拿來訓練 Co-DETR](/images/smot4sb-bird-tracking/training-pipeline.png)

### 推論：SAHI 切塊

推論時用 **SAHI**（Slicing Aided Hyper Inference）：把高解析的畫面切成互相重疊、和訓練時一樣大小的 tile，每個 tile 各自丟進 Co-DETR，再把所有 tile 的偵測結果合併回整張畫面。訓練和推論看到的物體尺度一致，小鳥不會因為整張圖被縮小而消失；而且一次只處理一個 tile，GPU 記憶體有限也跑得動。

### 追蹤：BoostTrack++

偵測結果交給 **BoostTrack++** 串成軌跡。它屬於 SORT 系列的 tracker，用 Kalman filter 預測每條軌跡下一幀的位置，再和新的偵測配對；特點是會利用既有軌跡的資訊，把軌跡附近信心分數偏低的偵測「拉上來」，減少小物體被漏掉而斷軌的情況。

![推論流程：SAHI 把畫面切成 tile，Co-DETR 逐塊偵測、合併後交給 BoostTrack++ 追蹤](/images/smot4sb-bird-tracking/inference-pipeline.png)

## 結果

### 排行榜

共 78 位參賽者、308 次提交，最後有 7 隊交出程式碼跑 private test。以下是 private test 的前五名：

| 名次 | 隊伍 | SO-HOTA | SO-DetA | SO-AssA | SO-DetRe | SO-DetPr | HOTA | IDF1 |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | DL Team | 50.59 | 47.27 | 54.30 | 52.67 | 80.38 | 36.74 | 44.86 |
| 2 | zhwa2003 | 46.22 | 42.69 | 50.28 | 48.71 | 75.35 | 31.82 | 37.61 |
| **3** | **elsalabA（我們）** | **43.87** | **40.13** | **48.11** | **53.39** | **59.96** | **28.60** | **33.80** |
| 4 | sgm | 43.71 | 43.85 | 43.72 | 49.97 | 76.57 | 32.81 | 38.68 |
| 5 | xmba15 | 40.49 | 31.85 | 51.59 | 46.46 | 49.51 | 28.94 | 35.12 |
| – | Baseline | 9.90 | 8.67 | 11.32 | 8.83 | 80.67 | 6.51 | 5.18 |

public test 上我們是第 4 名（SO-HOTA 44.54）。

### Ablation

**偵測**（切成 640×640 的 validation set）：拿掉 copy-paste，或只貼真實的鳥、不貼 Stable Diffusion 生成的鳥，AP 都會下降。

| 訓練方式 | AP@0.50 | AP@0.75 |
| --- | ---: | ---: |
| Co-DETR（完整） | 0.59 | 0.13 |
| 不用 copy-paste | 0.54 | 0.11 |
| 不用 Stable Diffusion 生成的鳥 | 0.55 | 0.12 |

AP@0.75 全部只有 0.1 出頭，也呼應了前面 IoU 對小物體太嚴格的問題。

**追蹤**（public test）：同樣的偵測結果，把 BoostTrack++ 換成 BoT-SORT，SO-HOTA 從 42.00 掉到 8.68，recall 從 50.65 掉到 16.70。在這兩組 ablation 裡，換 tracker 造成的落差遠大於偵測器上的任何改動。

| 方法 | SO-HOTA | SO-DetRe | SO-DetPr |
| --- | ---: | ---: | ---: |
| elsalabA pipeline（BoostTrack++） | 42.00 | 50.65 | 47.18 |
| 改用 BoT-SORT | 8.68 | 16.70 | 40.01 |

（這裡的 42.00 和排行榜上 public test 的 44.54 不同，報告沒有說明兩者的設定差在哪裡。）

### 準確度與成本

| 隊伍 | 參數量 [M] | 推論時間 [s/img] | GPU |
| --- | ---: | ---: | --- |
| DL Team | 44 | 0.175 | RTX 3090 |
| zhwa2003 | 215 | 0.111 | RTX 3060 |
| **elsalabA（我們）** | **304** | **0.500** | **RTX 3090** |
| sgm | 57 | 0.107 | RTX 4090 / RTX A6000 |
| xmba15 | 64 | 0.434 | GTX 1080 Ti |

![private test 的 SO-HOTA 對推論時間（log scale），圓圈大小是參數量。我們在最右邊、圓圈最大](/images/smot4sb-bird-tracking/accuracy-vs-speed.png)

我們是前五名裡模型最大、推論最慢的一隊。

## 回頭看：差在 precision 和框的位置

把各項指標拆開來看，我們的強項和弱點都很清楚。

**Recall 是前五名最高，precision 卻偏低。** private test 的 SO-DetRe 53.39 是前五名最高，比第一名的 DL Team（52.67）還高，代表該找到的鳥我們找到最多；但 SO-DetPr 只有 59.96，前三名的另外兩隊都在 75 以上。換句話說，拉低分數的主要是**誤報**。

第 2 名 zhwa2003 的做法正好補在這裡：他們用兩個模型的偵測結果取交集，只保留兩邊都同意的框，在 public test 上讓 SO-DetPr 提高了 20.6 分、SO-HOTA 提高 4.17 分；第 5 名 xmba15 則額外訓練了一個二元分類器來濾掉不是鳥的框。如果我們在 SAHI 合併之後加上類似的過濾，應該是最直接的改進方向。（推測：SAHI 把畫面切成很多 tile，每一塊都是一次產生誤報的機會，電線、樹葉這類背景就容易被當成鳥。）

**用 DotD 看是第 3，用 IoU 看是最後。** 同一份結果，SO-HOTA 是 43.87，換成傳統、以 IoU 為基礎的 HOTA 只有 28.60；前五名裡，我們的 HOTA、IDF1、MT 都是最低，ML 是最高，MOTA 甚至是 −8.12（用 IoU 配對時，錯誤的總數比 ground truth 的物體還多）。也就是說，我們的框**中心大致是對的**，但框的大小或位置和 ground truth 重疊得不夠好。如果比賽用的是 HOTA，我們在這五隊裡會排到最後。

**切塊要切在訓練還是推論。** 我們和第 1 名的 DL Team 都用了切塊，但切的地方不同：我們訓練切、推論也切（SAHI），一張圖要跑很多次 Co-DETR，所以要 0.500 s；DL Team 只在訓練時切，推論時直接把整張高解析的圖丟進 YOLOv8，用 44 M 的參數和 0.175 s 拿到 50.59。對要裝在無人機上的應用來說，後者顯然實際得多。

## 分工

elsalabA 是清大、台大、陽明交大組成的 11 人隊伍，我是論文的共同作者之一。我負責 CNN-based 物體偵測模型的訓練與優化，設計並實作了多種 ensemble training 策略，也負責撰寫 [challenge 報告](https://arxiv.org/abs/2507.12832)中 Experiment 的部分。

偵測器（Co-DETR）、切塊推論（SAHI）、tracker（BoostTrack++）與 Stable Diffusion 都是開源的方法；我們的工作是把它們組成完整的 pipeline，並設計 640×640 切塊訓練與逐步 copy-paste 的資料增強。

## What I learned

- **指標決定排名。** 同一份結果，用 SO-HOTA 是第 3，用 HOTA 是第 5；在小物體上，IoU 和中心距離量到的是兩件不一樣的事。
- **Tracker 的影響可能比偵測器還大。** 換掉 tracker，SO-HOTA 從 42.00 掉到 8.68；拿掉 copy-paste 或 Stable Diffusion，AP 只差幾個百分點。
- **Recall 高不等於分數高。** 該找的都找到了，但誤報太多，precision 就把分數拖下來；過濾 false positive 和多找到幾隻鳥一樣重要。
- **準確度要和成本一起看。** 第 1 名只用了我們大約七分之一的參數、三分之一的時間，分數還更高。

## References

1. Y. Kondo, N. Ukita, R. Kanayama, Y. Yoshida, T. Yamaguchi, et al., "MVA 2025 Small Multi-Object Tracking for Spotting Birds Challenge: Dataset, Methods, and Results," *MVA*, 2025. arXiv:2507.12832.
2. B.-C. Chuang, J.-H. Lee, P.-T. Kuo, I-H. Chu, Y.-S. Hsiao, C.-H. Wu, P.-Y. Wu, J.-C. Tsou, H.-C. Liu, C.-Y. Lee, and Y.-F. Yang, "Boosting Small Object Tracking via Collaborative Detection Transformer," *MVA*, 2025.
3. Z. Zong, G. Song, and Y. Liu, "DETRs with Collaborative Hybrid Assignments Training," *ICCV*, 2023.
4. F. C. Akyon, S. O. Altinuc, and A. Temizel, "Slicing Aided Hyper Inference and Fine-tuning for Small Object Detection," *ICIP*, 2022.
5. V. Stanojević and B. Todorović, "BoostTrack++: Using Tracklet Information to Detect More Objects in Multiple Object Tracking," arXiv, 2024.
6. C. Xu, J. Wang, W. Yang, and L. Yu, "Dot Distance for Tiny Object Detection in Aerial Images," *CVPRW*, 2021.
7. J. Luiten, A. Osep, P. Dendorfer, P. Torr, A. Geiger, L. Leal-Taixé, and B. Leibe, "HOTA: A Higher Order Metric for Evaluating Multi-Object Tracking," *IJCV*, vol. 129, 2021.
