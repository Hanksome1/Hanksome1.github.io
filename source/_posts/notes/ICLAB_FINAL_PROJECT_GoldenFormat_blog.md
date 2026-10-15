---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: 3DGS 期末專題的 golden pattern 格式
date: '2025-11-29'
updated: '2026-10-16 00:26:42'
tags:
  - ICLAB
  - Verification
  - 3D Gaussian Splatting
summary: 期末專題用 Python 為每一個運算階段產生 golden data，讓 RTL 可以一級一級對答案。這篇整理用到的定點數格式和每個檔案的內容。
permalink: notes/iclab-3dgs-golden-pattern/
synced: obsidian
---

ICLAB 的期末專題是 [[3D Gaussian Splatting 硬體加速器]]。RTL 分成好幾個運算階段，如果只比對最後畫出來的影像，錯了也很難知道是哪一級出問題。所以我用 Python 寫了 golden model（`gen_pattern.py`），把**每一個階段**的結果都存成檔案，RTL 可以一級一級對答案。

![[3DGS Visualization.svg|設計初期畫的資料流：8 個運算 stage 與各顆 SRAM 存放的內容。下半是改版後的 rasterization，從「逐 pixel 走過整個排序清單」改成「逐 Gaussian 只掃描它的 bounding box」]]

## 定點數格式

硬體裡不用浮點數，所有的值都是定點數。$Q_{m.n}$ 代表 $m$ 個整數 bit、$n$ 個小數 bit，實際的值是整數除以 $2^n$。

| 名稱 | 格式 | 位寬 | 用在 |
| --- | --- | --- | --- |
| Q_INPUT | Q12.20 | 32-bit | 輸入的 Gaussian 參數 |
| Q_MAIN | Q10.6 | 16-bit | 大部分的中間值和輸出：view matrix、3D / 2D covariance、螢幕座標、深度、顏色 |
| Q_CONIC | Q4.12 | 16-bit | Conic 係數：值很小，需要比較多的小數位 |

## 檔案格式

所有的值都用十六進位表示：32-bit 的值是 8 個字元，16-bit 的值是 4 個字元。每個場景一份檔案，從 `_00.dat` 到 `_49.dat` 共 50 個場景。

| 階段 | 檔案 | 每一行的內容 | 格式 |
| --- | --- | --- | --- |
| 輸入 | `input_gaussian` | 一顆 Gaussian：位置 xyz、scale xyz、rotation wxyz、opacity、顏色 rgb，共 14 個值 | Q12.20 |
| 輸入 | `input_view` | 4×4 的 view matrix，row-major，16 個值 | Q10.6 |
| Stage 1 | `golden_cov3d` | 3D covariance 的上三角，6 個值 | Q10.6 |
| Stage 2 | `golden_proj` | 螢幕座標 xy、conic ABC、bounding box 的 min / max xy、深度，共 10 個值 | 混合 |
| Stage 2 | `golden_cov2d` | 2D covariance 的上三角，3 個值 | Q10.6 |
| Stage 2 | `golden_conic` | Conic 係數 A、B、C | Q4.12 |
| Stage 3 | `golden_sort` | 由近到遠排序後的 Gaussian ID（32-bit）和深度 | – |
| Stage 4 | `golden_image` | 一個 pixel 的 RGB，row-major | Q10.6 |

- Covariance 是對稱矩陣，所以只存上三角。
- `golden_proj` 裡，conic 用 Q4.12，bounding box 是 16-bit 的整數，深度用 Q10.6。
- `golden_sort` 的 Gaussian 數量不足最大容量時，剩下的位置填 `ffffffff`（ID）和 `0000`（深度）。
- `golden_image` 在 proposal 階段是 64×64，共 4,096 行；最後的設計把解析度提高到 128×128。

每個階段實際在算什麼，見專案頁的演算法說明；testbench 怎麼讀這些檔案，見 [[ICLAB_Testbench_blog#輸出與檔案 I/O|Testbench]]。
