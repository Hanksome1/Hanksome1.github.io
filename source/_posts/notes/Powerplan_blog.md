---
# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記
title: APR Power Plan
date: '2025-12-22'
updated: '2026-10-16 00:24:32'
tags:
  - ICLAB
  - APR
  - Power
summary: Power ring、stripe、rail 三層供電網路怎麼規劃：ring 要多寬、stripe 要多密、最下層的 stripe 為什麼一定要垂直，以及 macro 的電源怎麼接。
permalink: notes/iclab-apr-powerplan/
synced: obsidian
---

Power plan 是 [[ICLAB_APR_blog|APR 流程]]的第三步：建立晶片的供電網路，確保電能穩定地送到每一個元件。

## 三層水管

| | 比喻 | 位置 |
| --- | --- | --- |
| Power ring | 大水管 | 繞著 core（或 macro）一圈 |
| Power stripe（strap） | 中水管 | 在 core 上方橫跨整個晶片 |
| Power rail（follow pin） | 小水管 | 沿著每一排 standard cell 的上下緣，在 Metal 1 |

電從 power pad 進到 ring，經過 stripe 分配到整個 core，最後由 rail 送進每一個 cell。Ring 的轉角可以加 corner bridge，用更多的 via 把相鄰的 ring 接在一起。

## Power ring 要多寬

以晶片功耗 $P = 100\ \text{mW}$、$V = 1\ \text{V}$ 為例，電流是

$$
I = \frac{P}{V} = 100\ \text{mA}
$$

接著查製程檔裡的 max current density。假設 M4 / M5 是 $10\ \text{mA}/\mu\text{m}$，ring 的總寬度就至少要 $100 / 10 = 10\ \mu\text{m}$，而且 VDD 和 VSS 各自都要這麼寬。

另一個判斷方式：ring 的總寬度應該不小於 power pad 的寬度，pad 送進來的電流才吃得下。

金屬的 DRC 有最大寬度的限制，ring 不能無限加寬，所以實務上會用好幾組 VDD / VSS ring 並排來提供足夠的電流。

## Stripe 要多密

Stripe 越密，IR drop 越小，但佔掉的繞線資源也越多。密度的算法是 stripe 寬度除以 pitch：

| 功耗 | Stripe 密度 |
| --- | --- |
| 低 | 3–5% |
| 中 | 5–10% |
| 高 | 10–20% |

Stripe 建好之後要做 IR drop 分析，確認電壓降不會大到讓電路功能失效。

## 最下層的 stripe 一定要垂直

Standard cell 的 power rail 在 Metal 1，方向是水平的。最下層的 stripe 必須和 rail 正交，每經過一條 rail 就能用 via 接下去；如果 stripe 也是水平的，就可能整條壓在另一個 net 的 rail 上方，完全接不到。

先進製程裡，每一層金屬都有固定的繞線方向，APR 也跟著 standard cell 的 rail 方向走。ICLAB 的設定是奇數層（Metal 1、3、…、9）水平、偶數層（Metal 2、4、…、8）垂直。這不是硬性規定，但違反的話要花更多的繞線資源。

## Macro 的電源

| Macro 的 power pin | 接法 |
| --- | --- |
| Scattered pin（散落在各處） | 在 macro 外圍加一圈 ring，從 ring 接到每個 pin |
| Long pin（長條） | 用和 pin 正交的 stripe 直接接下去 |
| Ring pin | 用 ring 或 stripe 接都可以 |

## Innovus 的步驟

### 1. Add ring

Power → Power Planning → Add Ring。

- **Number of bits**：要建幾組 VDD / VSS。
- **Interleaving**：讓 VDD 和 VSS 交錯排列。
- Spacing 依照 metal spacing rule 決定；寬度依照功耗決定，但受 metal width rule 限制。

### 2. Add stripes

Power → Power Planning → Add Stripes，先加垂直的，再加水平的。

### 3. 接 follow pin

Route → Special Route，把 standard cell 的 power rail 接到 stripe 和 ring 上。
