---
title: "Tracking Tiny Birds from Drones: 3rd Place at the MVA 2025 SMOT4SB Challenge"
date: 2025-07-26 10:00:00
layout: project
featured: false
part: SMOT4SB
summary: An entry to the MVA 2025 SMOT4SB challenge — detecting and tracking birds that span only a dozen to thirty pixels in drone footage. Our team, elsalabA, used a Co-DETR detector, copy-pasted real and Stable Diffusion–generated birds into the training data, tiled frames with SAHI at inference, and linked detections with BoostTrack++. We scored 43.87 SO-HOTA on the private test, 4.4× the baseline, and placed 3rd out of 78 participants.
period: 2025 Spring
role: Detector training · Ensemble training · Paper (Experiments)
course: MVA 2025 SMOT4SB Challenge
team: elsalabA · 11-person team
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
  - { label: Paper (MVA 2025), url: "https://doi.org/10.23919/MVA65244.2025.11175122" }
  - { label: Challenge report (arXiv), url: "https://arxiv.org/abs/2507.12832" }
---

## Overview

A drone has to avoid birds so it doesn't hit them; the other way around, using drones to protect fields and fisheries from bird damage or to run automated bird surveys also starts with knowing where the birds are and where they're heading. The hard part is that the birds are far from the camera: in a 4K frame, a bird often covers only **a dozen to thirty pixels**, too small to make out its shape, let alone tell one bird from another.

The **SMOT4SB** (Small Multi-Object Tracking for Spotting Birds) challenge at MVA 2025 poses exactly this problem: given drone footage, box every bird and keep the same ID on it throughout the video. It follows SOD4SB at MVA 2023, which was single-frame detection only; this edition adds the time axis.

Our team, **elsalabA** (11 people from NTHU, NTU, and NYCU), built a two-stage tracking-by-detection pipeline:

1. **Detection**: Co-DETR, trained on 640×640 crops, with copy-paste augmentation that pastes real and Stable Diffusion–generated birds into the backgrounds to increase the number and variety of small objects; at inference, SAHI slices the high-resolution frame into tiles of the same size.
2. **Tracking**: BoostTrack++, which links the per-frame detections into trajectories.

We finished with an SO-HOTA of **43.87** on the private test, 4.4× the organizers' baseline (9.90), placing 3rd, and wrote the method up as a paper published at MVA 2025.

## The task: SMOT4SB

### Dataset

The videos were shot with a DJI Mavic 2 Pro, a DJI Phantom 4 Pro V2.0, and a ProDrone PD4B-M at 30 fps, in 1920×1080 or 3840×2160. Scenes cover urban areas, parks, forests, rivers, and farmland; the birds include hawks, crows, waterfowl, and sparrows, all labeled as a single class, `bird`.

![Sample frames from SMOT4SB: the bird inside each zoomed box is the target, only 13 to 32 pixels wide](/images/smot4sb-bird-tracking/dataset-examples.jpg)

| Subset | Videos | Frames | Instances | IDs |
| --- | ---: | ---: | ---: | ---: |
| Train | 128 | 66,602 | 226,292 | 1,256 |
| Public test | 38 | 16,489 | 51,325 | 509 |
| Private test | 45 | 25,101 | 94,073 | 475 |
| **Total** | **211** | **108,192** | **371,690** | **2,240** |

The train split comes with videos and annotations; the public test provides videos only, and results are scored by uploading them to CodaBench (at most 10 times a day); the private test is fully withheld — at the end of the challenge the organizers ran each team's submitted code on it, and the final ranking is based on it.

Three things make this harder than ordinary MOT:

- **The objects are tiny**: most birds are smaller than MS COCO's definition of a small object (32×32 px), so there is almost no appearance information, and methods that rely on appearance features for re-ID have little to work with.
- **Both the camera and the birds move in 3D**: in pedestrian tracking the camera is fixed, and when a UAV films traffic the cars still move on a plane; here the drone and the birds both move freely in the air, and the motion on screen is the two mixed together.
- **Flocking**: birds often fly in groups, occluding and crossing each other, so IDs swap easily.

### Scoring: SO-HOTA

Standard MOT is scored with HOTA, which uses IoU to decide whether a predicted box matches the ground truth. But for small objects IoU is far too strict: if two $d \times d$ boxes are offset vertically by $x$ pixels,

$$
\text{IoU} = \frac{d - x}{d + x}
$$

A 16×16 box offset by just 8 px drops IoU from 1 to 1/3, already below the usual 0.5 threshold; at 16 px the boxes no longer overlap and IoU becomes 0, at which point "just missed" and "way off" count as equally wrong.

The organizers therefore proposed **SO-HOTA**, which replaces the IoU in HOTA with **Dot Distance (DotD)**: it looks only at the distance between box centers, normalized by the average object size $S$ over the whole dataset.

$$
\text{DotD}(A, B) = e^{-D/S},
\qquad
D = \sqrt{(x_A - x_B)^2 + (y_A - y_B)^2}
$$

$$
S = \sqrt{\frac{\sum_{i=1}^{M} \sum_{j=1}^{N_i} w_{ij}\, h_{ij}}{\sum_{i=1}^{M} N_i}}
$$

$M$ is the number of images, $N_i$ the number of labeled boxes in image $i$, and $w_{ij}$, $h_{ij}$ the width and height of each box.

Everything else follows HOTA: at a threshold $\alpha$, pairs with $\text{DotD} \ge \alpha$ count as true positives, detection accuracy SO-DetA and association accuracy SO-AssA are combined by geometric mean, and the result is averaged over 19 thresholds:

$$
\text{SO-HOTA}_\alpha = \sqrt{\text{SO-DetA}_\alpha \times \text{SO-AssA}_\alpha}
$$

$$
\text{SO-HOTA} = \frac{1}{19} \sum_{\alpha \in \{0.05,\, 0.1,\, \dots,\, 0.95\}} \text{SO-HOTA}_\alpha
$$

![The organizers' comparison, with predicted boxes shifted vertically by x pixels throughout. Center: IoU and DotD versus center distance; right: HOTA and SO-HOTA. HOTA drops to 0 as soon as the boxes stop overlapping, while SO-HOTA falls off smoothly](/images/smot4sb-bird-tracking/so-hota-vs-hota.png)

For a 16 px box:

| Offset $x$ [px] | HOTA | SO-HOTA |
| ---: | ---: | ---: |
| 8 | 31.58 | 63.16 |
| 12 | 10.53 | 47.37 |
| 16 | 0.00 | 36.84 |
| 20 | 0.00 | 26.32 |
| 24 | 0.00 | 21.05 |

The organizers' baseline is a YOLOX detector followed by OC-SORT tracking, scoring 9.90 SO-HOTA on the private test.

## Our method

### Detector: Co-DETR

For the detector we chose **Co-DETR** (Collaborative Hybrid Assignments Training). DETR-style detectors assign predictions to ground truth one-to-one, so each object gets a single positive sample and the supervision is sparse; Co-DETR attaches several auxiliary heads with one-to-many assignment during training (e.g. ATSS- and Faster R-CNN–style assignment) so the encoder learns more, and keeps only the original DETR head at inference, so inference cost does not go up.

### Training: crops + staged copy-paste

The source frames are 1080p or 4K. Training on them directly leaves the birds tiny relative to the whole image, and the GPU memory can't take it either. So we first **cropped the training frames to 640×640**.

But after cropping, most crops contain only a few birds, so positive samples were still scarce. We used **copy-paste** to paste birds into the backgrounds, from two sources:

- Real birds from the Birds Flying Dataset on Kaggle.
- Birds generated with **Stable Diffusion**.

Pasting happens over several stages that progressively raise the visual complexity and bird density, so Co-DETR learns small-object features from increasingly hard samples.

![Training pipeline: SMOT4SB is cropped to 640×640, birds are copy-pasted in over several stages, and the result trains Co-DETR](/images/smot4sb-bird-tracking/training-pipeline.png)

### Inference: SAHI tiling

At inference we used **SAHI** (Slicing Aided Hyper Inference): the high-resolution frame is sliced into overlapping tiles the same size as the training crops, each tile goes through Co-DETR separately, and the detections from all tiles are merged back onto the full frame. Training and inference see objects at the same scale, so small birds don't vanish when the whole image is downscaled; and since only one tile is processed at a time, it still runs on limited GPU memory.

### Tracking: BoostTrack++

The detections are handed to **BoostTrack++** to form trajectories. It is a SORT-family tracker that uses a Kalman filter to predict where each track will be in the next frame and then matches it to the new detections; its distinguishing feature is that it uses information from existing tracks to "boost" low-confidence detections near a track, so small objects are missed less often and tracks break less.

![Inference pipeline: SAHI slices the frame into tiles, Co-DETR detects tile by tile, and the merged detections go to BoostTrack++ for tracking](/images/smot4sb-bird-tracking/inference-pipeline.png)

## Results

### Leaderboard

There were 78 participants and 308 submissions, and in the end 7 teams submitted code to run on the private test. The private-test top five:

| Rank | Team | SO-HOTA | SO-DetA | SO-AssA | SO-DetRe | SO-DetPr | HOTA | IDF1 |
| ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | DL Team | 50.59 | 47.27 | 54.30 | 52.67 | 80.38 | 36.74 | 44.86 |
| 2 | zhwa2003 | 46.22 | 42.69 | 50.28 | 48.71 | 75.35 | 31.82 | 37.61 |
| **3** | **elsalabA (us)** | **43.87** | **40.13** | **48.11** | **53.39** | **59.96** | **28.60** | **33.80** |
| 4 | sgm | 43.71 | 43.85 | 43.72 | 49.97 | 76.57 | 32.81 | 38.68 |
| 5 | xmba15 | 40.49 | 31.85 | 51.59 | 46.46 | 49.51 | 28.94 | 35.12 |
| – | Baseline | 9.90 | 8.67 | 11.32 | 8.83 | 80.67 | 6.51 | 5.18 |

On the public test we placed 4th (SO-HOTA 44.54).

### Ablation

**Detection** (validation set cropped to 640×640): removing copy-paste, or pasting only real birds without the Stable Diffusion–generated ones, lowers AP in both cases.

| Training | AP@0.50 | AP@0.75 |
| --- | ---: | ---: |
| Co-DETR (full) | 0.59 | 0.13 |
| Without copy-paste | 0.54 | 0.11 |
| Without Stable Diffusion birds | 0.55 | 0.12 |

AP@0.75 sits just above 0.1 across the board, echoing the earlier point that IoU is too strict for small objects.

**Tracking** (public test): with the same detections, swapping BoostTrack++ for BoT-SORT drops SO-HOTA from 42.00 to 8.68 and recall from 50.65 to 16.70. Across these two ablations, changing the tracker makes a far bigger difference than any change on the detector side.

| Method | SO-HOTA | SO-DetRe | SO-DetPr |
| --- | ---: | ---: | ---: |
| elsalabA pipeline (BoostTrack++) | 42.00 | 50.65 | 47.18 |
| With BoT-SORT | 8.68 | 16.70 | 40.01 |

(The 42.00 here differs from the 44.54 on the public-test leaderboard; the report doesn't say how the two settings differ.)

### Accuracy and cost

| Team | Params [M] | Inference time [s/img] | GPU |
| --- | ---: | ---: | --- |
| DL Team | 44 | 0.175 | RTX 3090 |
| zhwa2003 | 215 | 0.111 | RTX 3060 |
| **elsalabA (us)** | **304** | **0.500** | **RTX 3090** |
| sgm | 57 | 0.107 | RTX 4090 / RTX A6000 |
| xmba15 | 64 | 0.434 | GTX 1080 Ti |

![Private-test SO-HOTA versus inference time (log scale), with bubble size showing parameter count. We are at the far right, with the largest bubble](/images/smot4sb-bird-tracking/accuracy-vs-speed.png)

We had the largest model and the slowest inference of the top five.

## Looking back: precision and box placement

Breaking the metrics apart makes both our strengths and our weaknesses clear.

**Recall was the highest in the top five, but precision was low.** Our private-test SO-DetRe of 53.39 was the highest of the top five, above even first-place DL Team (52.67), meaning we found more of the birds than anyone; but SO-DetPr was only 59.96, while the other two teams in the top three were both above 75. In other words, what pulled the score down was mainly **false positives**.

Second-place zhwa2003's approach targets exactly this: they intersect the detections of two models and keep only boxes both agree on, which raised SO-DetPr by 20.6 points and SO-HOTA by 4.17 on the public test; fifth-place xmba15 trained an extra binary classifier to filter out boxes that aren't birds. Adding a similar filter after the SAHI merge would likely be the most direct improvement for us. (A guess: SAHI cuts the frame into many tiles, and every tile is another chance for a false positive, so background like power lines and leaves is easily mistaken for birds.)

**3rd by DotD, last by IoU.** On the same results, SO-HOTA is 43.87, but the conventional IoU-based HOTA is only 28.60; among the top five, our HOTA, IDF1, and MT were all the lowest and ML the highest, and MOTA was even −8.12 (with IoU matching, the total number of errors exceeds the number of ground-truth objects). In other words, our boxes had **roughly the right centers**, but their size or position didn't overlap the ground truth well enough. Had the challenge used HOTA, we would have come last among these five teams.

**Whether to slice at training or at inference.** Both we and first-place DL Team used slicing, but in different places: we sliced for training and again for inference (SAHI), so each frame takes many Co-DETR passes and 0.500 s; DL Team sliced only for training and fed the full high-resolution frame straight into YOLOv8 at inference, reaching 50.59 with 44 M parameters and 0.175 s. For an application meant to run on a drone, the latter is clearly far more practical.

## Division of work

elsalabA is an 11-person team from NTHU, NTU, and NYCU, and I'm one of the co-authors of the paper. I trained and tuned the CNN-based object detectors, designed and implemented several ensemble training strategies, and wrote the Experiment part of the [challenge report](https://arxiv.org/abs/2507.12832).

The detector (Co-DETR), tiled inference (SAHI), the tracker (BoostTrack++), and Stable Diffusion are all open-source methods; our work was assembling them into a complete pipeline and designing the 640×640 crop training and the staged copy-paste augmentation.

## What I learned

- **The metric decides the ranking.** The same results are 3rd by SO-HOTA and 5th by HOTA; for small objects, IoU and center distance measure two different things.
- **The tracker can matter more than the detector.** Swapping the tracker drops SO-HOTA from 42.00 to 8.68; removing copy-paste or Stable Diffusion changes AP by only a few points.
- **High recall doesn't mean a high score.** We found the birds we were supposed to find, but too many false positives let precision drag the score down; filtering out false positives matters as much as finding a few more birds.
- **Look at accuracy together with cost.** The winner used roughly a seventh of our parameters and a third of our time, and still scored higher.

## References

1. Y. Kondo, N. Ukita, R. Kanayama, Y. Yoshida, T. Yamaguchi, et al., "MVA 2025 Small Multi-Object Tracking for Spotting Birds Challenge: Dataset, Methods, and Results," *MVA*, 2025. arXiv:2507.12832.
2. B.-C. Chuang, J.-H. Lee, P.-T. Kuo, I-H. Chu, Y.-S. Hsiao, C.-H. Wu, P.-Y. Wu, J.-C. Tsou, H.-C. Liu, C.-Y. Lee, and Y.-F. Yang, "Boosting Small Object Tracking via Collaborative Detection Transformer," *MVA*, 2025.
3. Z. Zong, G. Song, and Y. Liu, "DETRs with Collaborative Hybrid Assignments Training," *ICCV*, 2023.
4. F. C. Akyon, S. O. Altinuc, and A. Temizel, "Slicing Aided Hyper Inference and Fine-tuning for Small Object Detection," *ICIP*, 2022.
5. V. Stanojević and B. Todorović, "BoostTrack++: Using Tracklet Information to Detect More Objects in Multiple Object Tracking," arXiv, 2024.
6. C. Xu, J. Wang, W. Yang, and L. Yu, "Dot Distance for Tiny Object Detection in Aerial Images," *CVPRW*, 2021.
7. J. Luiten, A. Osep, P. Dendorfer, P. Torr, A. Geiger, L. Leal-Taixé, and B. Leibe, "HOTA: A Higher Order Metric for Evaluating Multi-Object Tracking," *IJCV*, vol. 129, 2021.
