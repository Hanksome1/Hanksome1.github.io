---
name: scroll-explainer
description: 做捲動驅動的動畫解說頁（scrollytelling）：一個釘住的舞台、一條捲動進度 p 驅動整段 SVG 動畫、鏡頭推拉、停靠站與說明欄、自動播放。適用於「做一個像首頁開場那樣的動畫」、「用動畫比較兩個模型 / 架構 / 流程」、「把 X 畫成可以捲動看的 explainer」、把一段技術流程做成互動頁面。整理自 Hank 部落格首頁的 tapeout 開場（晶棒 → 晶圓 → APR → 封裝）和 Ideogram 4 vs SD 3.5 的兩版比較頁。
---

# Scroll explainer

一段很長的捲動距離換成一個 0–1 的進度 `p`，畫面上的每一樣東西都是 `p` 的純函式。捲下去動畫往前，捲回來就倒著播，點停靠站可以直接跳過去，自動播放只是幫使用者捲。

參考實作（動手前先讀，照它們的寫法）：

| | 位置 | 看什麼 |
| --- | --- | --- |
| 首頁開場 | `themes/tapeout/source/js/tapeout.js`、`themes/tapeout/layout/index.ejs`、`themes/tapeout/source/css/style.css` 的 `13c. Tapeout intro` | 單一場景一路演下去：鏡頭從 µm 拉到整片晶圓再鑽進一顆 die、hero 用 FLIP 收進左欄、終端機 log、最後拉線接到下面的章節 |
| 比較 v2「兩座塔」 | `themes/tapeout/source/js/dit-tower.js`、`layout/dit-tower.ejs`、`source/css/dit-tower.css` | 一個 SVG 世界放兩個並排的主角、斜投影的 2.5D 方塊、左邊說明欄 + 停靠站 + 對照表 |
| 比較 v1「逐章並排」 | `themes/tapeout/source/js/dit-compare.js`、`layout/dit-compare.ejs`、`source/css/dit-compare.css` | 左邊章節文字、右邊兩條 lane 各畫一次同一個場景、Δ 差異列、可以拉的參數 |
| 論文圖解 | `themes/tapeout/source/js/kroquant.js`、`layout/kroquant.ejs`、`source/css/kroquant.css` | 把一篇論文從問題、推導到實驗結果走完一遍；新頁面要放進部落格時，照這頁的接法（見 `CLAUDE.md` 的「發佈」） |

最小可跑的骨架在 [skeleton.html](skeleton.html)：從它開始改，不要從零寫。

## 先寫分鏡，再寫程式

動手前先跟使用者對一張分鏡表，每一列是一個 beat：

| beat | 權重 | 鏡頭看哪裡 | 這一段發生什麼 | 說明欄 / 數字 |
| --- | --- | --- | --- | --- |
| intro | 0.7 | 全景 | 兩座塔淡入 | 層數、寬度、參數量 |
| layer | 3.2 | 第 1 層 | 第 1 層拆開，五個子段落各亮一次 | 每一塊的參數佔比 |

- 權重 = 這一段佔多少捲動距離。資訊多、動作多的段落給大權重（tower 的 `layer` 3.2、`middle` 2.2），過場給小的（0.7–1.1）。
- 一個 beat 裡再切子段落：用 `seg(t, a, b)` 錯開出場時間，不要另開 beat。
- 最後加一段 `HOLD`（0.3–0.4）：演完停一下才放開舞台。
- 比較兩個東西時，每一站兩邊都要有對應的畫面和一句話；一邊沒有的東西畫成空的 / 虛線，不要省略。

## 架構

```
.root[data-x]                 JS 成功跑起來才加 .is-live
  .track                      .is-live 時拉長：height: 620svh（窄螢幕 430svh；內容多的可以到 1650svh）
    .stage                    position: sticky; top: var(--header-h); height: calc(100svh - var(--header-h))
      svg.world               一個 SVG 裝整個世界，鏡頭只改 viewBox
      .frame                  鏡頭要把主角放進的那一格（避開說明欄、左欄文字）
      .panel                  說明欄：狀態、自動播放、停靠站、說明卡、對照表
```

- **漸進增強**：沒有 `.is-live` 時 track 是一般高度、舞台不釘、SVG 隱藏，只剩說明文字照順序排好。說明文字寫在 HTML 裡（給搜尋引擎、輔助科技、沒 JS 的人），JS 只負責切換哪一張顯示。
- **reduced-motion**：首頁的做法是加 `.is-static` 不加 `.is-live`、`p` 固定為 1（直接看完成的樣子）；自動播放鍵藏起來；CSS 的 transition / animation 在 `@media (prefers-reduced-motion: reduce)` 裡關掉。
- 程式碼一律包在 IIFE，`'use strict'`，找不到 root 就 `return`。設定資料從 layout 用 `<script type="application/json">` 傳進來（首頁的 `cfg`），不要寫死在 JS 裡要翻譯的字串。

## 進度與時間軸

```js
function progress() {
  var r = track.getBoundingClientRect(), range = r.height - stage.offsetHeight;
  return range > 0 ? clamp01((headerH - r.top) / range) : 1;
}
// beat 權重 → 每段在 p 上的起點與長度
var total = BEATS.reduce(function (s, b) { return s + b[1]; }, HOLD), spans = {}, acc = 0;
BEATS.forEach(function (b) { spans[b[0]] = { start: acc / total, len: b[1] / total }; acc += b[1]; });
function localT(k, p) { return clamp01((p - spans[k].start) / spans[k].len); }
function seg(t, a, b) { return clamp01((t - a) / (b - a)); }   // t 落在 [a, b] 的局部進度
```

規則：

- 每個 beat 一個 renderer，**只吃自己的局部進度 `t`**。不准存「上一幀做到哪」的狀態，不准用 setTimeout 演動畫，這樣任意跳、倒著捲都對。
- 跨 beat 的東西（例如第 1 層拆開又合起來）寫成兩段進度相乘：`k = ease(seg(t.layer, 0, 0.18)) * (1 - ease(seg(t.middle, 0, 0.15)))`。
- 數字跟著捲動跑（第幾層、累積 FLOPs、第幾步、乾淨的圖佔多少）是最有說服力的地方，從同一組規格常數算出來，不要手填。
- 緩動用 `ease`（cubic in-out）；長度、大小這種跨好幾個數量級的值用對數插值。

## 鏡頭

鏡頭是一張關鍵格表，每格 `[beat, t, x, y, w]`：那一段演到 `t` 時，取景框中心在世界座標 `(x, y)`、寬 `w`。

```js
var shots = SHOTS.map(function (s) { return { p: spans[s[0]].start + spans[s[0]].len * s[1], x: s[2], y: s[3], w: s[4] }; });
function camera(p) {
  var i = 0;
  while (i < shots.length - 1 && shots[i + 1].p <= p) i++;
  var a = shots[i], b = shots[Math.min(i + 1, shots.length - 1)];
  var k = b.p > a.p ? ease(clamp01((p - a.p) / (b.p - a.p))) : 0;
  return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), k)) };
}
```

- 寬度用 `log` 插值，推近拉遠的速度才一致（首頁從 13800 µm 推到 1000 µm 靠的就是這個）。
- 把取景框放進 `.frame`（或舞台上沒被說明欄蓋住的那塊），用 contain 算出整個 SVG 的 viewBox；框外照樣畫，背景會一路鋪到舞台邊。
- 同一格停兩個關鍵格（`['intro', 0, …]`、`['intro', 0.2, …]` 一樣）＝鏡頭停住讓人看。
- 依鏡頭遠近換細節（LOD）：`lod(w, near, far)` 決定標籤、細節的透明度，拉遠時收掉小字。
- 窄螢幕放大一點（tower 用 `0.78`），兩側標籤會被切掉，所以說明欄要有同樣的資訊。

## 畫法

- **DOM 一次建好，之後每幀只改屬性**。元素全部在初始化時建好，renderer 只改 `opacity`、`d`、`transform`、`class`。
- `set(e, k, v)` 把上次寫的值記在元素上，沒變就不寫；數值先 `r1()` 四捨五入到 0.1，才不會每幀都算成「有變」。
- `frame()` 先讀所有 `getBoundingClientRect`，再一次寫回；某個 beat 的 `t` 跟上一幀一樣就跳過它的 renderer。
- scroll 事件只做 `requestAnimationFrame` 節流；`resize`、`ResizeObserver`、`document.fonts.ready` 都要重新量。
- 畫線：`pathLength="1"` + `stroke-dasharray: 1 1`，`stroke-dashoffset = 1 - k`，`k = 0` 看不到、`k = 1` 畫完。
- 2.5D：斜投影 `(x, y, z) → (x + z·KX, y − z·KY)`，一個方塊畫正面、頂面、右側面三個 path；由下往上、由後往前畫，前面的才蓋得住後面。面積照真實比例畫（tower 的子區塊厚度 ∝ 參數量 ÷ 寬度），比例尺本身就在講故事。
- 狀態用 class：`is-hot`（現在講的）、`is-past`（走過的）、`is-ghost`（還沒到 / 不存在）、`is-twin`（虛線分身）。
- 程序生成的東西（cell、晶圓上的 die、雜訊圖）用固定種子的 `mulberry32(hash(seed))`，每次載入長一樣。
- `vector-effect: non-scaling-stroke`：鏡頭推近時線不會變粗。

## 說明欄與控制

- 說明卡全部疊在同一格（`grid-area: 1 / 1`），只有 `.is-on` 那張 `opacity: 1`，切換時淡入並往上滑 8px。
- 狀態膠囊：`Stop 03 / 10`、`00/05 Floorplan`；停靠站一排按鈕，底下一條進度條吃 `--p`（走過的 1、現在這站 `localT`、還沒到 0）。點了捲到那一站 `start + len * 0.3`，`behavior: smooth`（reduced-motion 用 `auto`）。
- 對照表（facts）：三欄 `項目 | A | B`，兩邊的顏色跟各自的 lane 一樣；隨 beat 換內容，數字跟著捲動變；HTML 字串沒變就不重寫。
- 首頁的變體：左欄一個終端機，log 每行掛在某個 `p` 上，只顯示最後 3–4 行加游標；旁邊 metrics 跟著跑。
- 跑完之後在舞台底部放「繼續往下捲 ↓」提示，`p > 0.97` 時淡掉 / 出現。

### 自動播放

照固定速度把 `p` 推到 1，用 `window.scrollTo` 帶著頁面捲，所以畫面跟手動捲完全一樣。

- 全程時間：首頁 24 s、tower 36 s（beat 越多越長）。
- 使用者一碰 `wheel`、`touchstart`、`pointerdown`（按鈕本身除外）、`keydown`，或捲動位置被別的東西改掉（`|scrollY − 上次設的值| > 2`），就停下來交還給他。
- 三個狀態 `idle / run / done` → 按鈕文字 `Auto-play / Pause / Replay`；`done` 時再按從頭開始。
- reduced-motion 時整顆按鈕藏起來。

## 兩個東西並排比較

兩種版型，看內容選：

- **同一個世界兩個主角**（v2 塔）：兩者結構可以畫成同一種東西（都是一疊 layer）。一個 SVG、一個鏡頭，左右各一座，標籤 A 寫在左外側、B 寫在右外側。適合「從頭走到尾」的旅程。
- **左文字、右兩條 lane**（v1）：每一章是一個不同的場景，兩條 lane 用同一個場景、各自的規格各畫一次（`S[key].build(lane)`、`update(lane.c, p)`、`stats(lane)`、`diff()`）。章節在畫面 55% 高度的啟動線越過時切換；長章節 `min-height: 190–300svh` 而且文字 sticky，捲動只拿來驅動右邊的動畫。適合需要可調參數（解析度、token 數、步數 preset）和下面一張總表的情況。

共同規則：

- 兩邊各一個顏色，定義成 CSS 變數（`--dc-sd: #2f67d0`、`--dc-ig: var(--accent)`），深色模式另給一組（`#7ea6ff`）；填色用 `color-mix(in srgb, var(--lane) 30%, var(--surface))` 做深淺，不另外挑色。
- 說明卡每一站兩段：`<p class="cap-a"><b>A</b>…</p><p class="cap-b"><b>B</b>…</p>`，左邊框線用 lane 顏色。
- 結尾放一張逐項對照總表、三點 takeaway、資料來源與「數字怎麼算的」（理論值的假設）。
- 規格、數字一律從原始碼 / 論文查來，在頁尾標來源；推算出來的值註明是推算。

## 版面與主題

- 字型、顏色、間距沿用所在網站的 token（部落格是 `--ink / --ink-2 / --ink-3 / --line / --surface / --accent`，IBM Plex Mono 做標籤）。SVG 的 fill / stroke 全部吃 CSS 變數，切深淺色和配色時不用重畫。
- 舞台上的文字欄跟背景之間用漸層淡出（`linear-gradient(90deg, var(--bg) 82%, transparent)`），字才讀得清楚。
- 寬螢幕：說明欄在左（寬 340px，跟網站的 `--wrap` 對齊），取景框是右邊剩下的部分。
- 窄螢幕（≤ 900px）：SVG 佔滿舞台，說明欄疊在下面（半透明 + blur），停靠站只留編號，對照表和「繼續往下捲」藏起來。
- 全部用 `svh`，不要用 `vh`（手機網址列伸縮時不會跳）。

## 做完要驗

用瀏覽器開頁面，對每一項截圖或讀數值。Desktop app 用 built-in browser；cloud session 沒有的話，先試 headless 瀏覽器，連這個也跑不起來就照下面的「沒有瀏覽器時」做。

1. 一路往下捲到底，再一路捲回頂端：每一站都正確，倒著播沒有殘影。
2. 點每一個停靠站：直接跳過去畫面也對（證明沒有偷存狀態）。
3. 自動播放：會跑、碰滾輪會停、跑完變 Replay、再按從頭開始。
4. 375px 寬、深色模式、每一種配色各看一次。
5. 模擬 `prefers-reduced-motion: reduce`：顯示靜態完成圖或純文字，沒有任何會動的東西。
6. 停用 JS 時說明文字依序可讀。
7. Console 沒有錯誤；捲動時 Performance 沒有長 frame（每幀只改有變的屬性）。

### 沒有瀏覽器時

1. `npx hexo generate` 輸出沒有任何 `WARN`，`public/` 裡有新頁面。
2. `node --check` 檢查新的 JS；把 `BEATS`、`SHOTS` 用 Node 跑一次，確認 `p` 從 0 到 1 都算得出值、沒有 `NaN`。
3. 回報時明講哪幾項沒驗到，不要說「驗過了」。使用者要在手機或 Mac 上看過才算完成。
