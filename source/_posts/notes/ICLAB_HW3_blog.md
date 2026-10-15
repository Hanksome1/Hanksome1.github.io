---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: ICLAB HW2–3：Enigma 電路與合成優化
date: '2025-10-15'
updated: '2026-10-16 00:26:42'
tags:
  - ICLAB
  - Verilog
  - Synthesis
summary: HW2 用 Verilog 實作 Enigma 加解密電路，HW3 把它拿去合成並一步步優化：rotor 的實作方式、pipeline、拿掉 datapath 的 reset，Area × Cycle time 從 8.8 × 10⁴ 降到 4.8 × 10⁴。
permalink: notes/iclab-hw3-enigma/
synced: obsidian
---

## HW2：Enigma

Enigma 是二戰時德軍用的加密機。訊號依序經過 plugboard 和好幾個 rotor 的置換（permutation），而 rotor 每加密一個字就轉動一次，所以同一個字每次加密出來的結果都不一樣。

HW2 用 Verilog 實作這台機器，電路裡有 rotor A、rotor B 和 plugboard，支援加密和解密兩種模式。Rotor 的置換表在一開始從外部載入，每個 rotor 有 64 個 6-bit 的項目。

### Rotor A 要做的事

1. 載入置換表
2. 查表
3. 正向查表和反向查表

### Rotor 轉動：shift 還是 offset

Rotor 每轉一格，置換表就要整個平移一格。有兩種做法：

- **Shift**：真的把整張表移一格。直覺上，每個 cycle 搬動 64 個 6-bit 的項目很花硬體。
- **Offset**：表不動，另外用一個 register 記錄目前轉了幾格，查表時把位址加上 offset。

HW2 的版本選了 offset。

## HW3：合成優化

用 PI = Area × Cycle time 當指標，越小越好：

| 版本 | Area | Cycle time (ns) | PI |
| --- | --- | --- | --- |
| 起點：rotor 用 offset | 20,111 | 4.38 | 8.8 × 10⁴ |
| Rotor A 改用 shift | 22,334 | 3.30 | 7.3 × 10⁴ |
| Rotor B 改成固定的 permutation | 22,334 | 3.30 | 7.3 × 10⁴ |
| 4 級 pipeline | 20,060 | 3.43 | 6.9 × 10⁴ |
| 更深的 pipeline | 21,939 | 2.75 | 6.0 × 10⁴ |
| 拿掉 datapath 的 reset、plugboard 改用 32 個 register | 17,688 | 2.75 | 4.8 × 10⁴ |

幾個觀察：

- **Shift 比 offset 大，但比較快**。改用 shift 之後面積多了 11%，cycle time 卻從 4.38 ns 降到 3.30 ns，PI 反而比較好。Offset 在查表之前要先做一次加法算位址，這個加法器很可能就在 critical path 上。直覺說「搬整張表很貴」，合成的結果卻是另一回事，還是要跑過才知道。
- **Pipeline**：4 級的版本面積變小、cycle time 差不多，再加深之後 cycle time 降到 2.75 ns。
- **拿掉 datapath 的 reset** 是最後一步省下面積的關鍵。只存資料的 register 不需要 reset，見 [[ICLAB_RTL_guideline_blog#Reset|RTL coding guidelines]]。

合成的基本觀念見 [[ICLAB_Synthesis_blog|邏輯合成與 coding for synthesis]]。
