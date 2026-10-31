---
name: keynote-tour
description: 做「發表會式」的捲動導覽首頁：黑底、一拍一句大標、畫面在正中間換場景、每一拍底下接到對應的筆記或章節，當成一門課、一個大專案、一系列文章的入口。適用於「幫 X 課做一個像 ICLAB 那樣的首頁」、「把這門課 / 這個專案的筆記串成一條動畫導覽」、「課程總覽 / 專案首頁看起來太廉價，做幾個版本給我挑」、要把很多篇內容收成一條故事線的入口頁。整理自 /lab/iclab/（ICLAB 設計流程）。單一機制、單一流程的動畫解說用 scroll-explainer。
---

# Keynote tour

一門課、一個大專案有幾十篇筆記，總覽頁只是一張清單。這個版型把它們串成一條故事：用**同一個小例子**從頭走到尾，每走一站畫面換一次，標題一句話講完這一站，底下直接連到那一站的筆記。看完動畫的人知道整門課在做什麼，也知道要點哪一篇。

參考實作：ICLAB 設計流程 `/lab/iclab/`（commit `f9935e4`）

| 檔案 | 看什麼 |
| --- | --- |
| `themes/tapeout/source/js/iclab-flow.js` | 上半 `ART`：9 個場景，每個都是 `make(parent) → { set(t) }`；下半是舞台 controller |
| `themes/tapeout/layout/iclab-flow.ejs` | `NOTES` 對照表、`reads()`、hero、14 個 `<article data-beat>`、outro |
| `themes/tapeout/source/css/iclab-flow.css` | 強制深色、舞台版面、沒有 JS / reduced-motion 的退路、SVG 的 class |
| `source/lab/iclab/index.md` | front-matter 的 `tour.stops`（總覽筆記標頭的縮圖用） |

最小可跑的骨架在 [skeleton.html](skeleton.html)：有 5 拍、3 個場景，其中一個場景連用 3 拍，最後一拍拉遠並發光；也有章節列、自動播放和 outro。從它開始改，controller 照抄。捲動進度、`seg`、`pathLength` 畫線、漸進增強這些共同的底子，寫在 `scroll-explainer` 的 SKILL.md，這裡不重複。

## 跟 scroll-explainer 的差別

| | scroll-explainer | keynote-tour |
| --- | --- | --- |
| 用途 | 解說一個機制（tapeout、兩個模型比較、一篇論文） | 一門課 / 一個專案的**入口**，把很多篇內容串起來 |
| 畫面 | 一個世界、鏡頭推拉（viewBox 關鍵格） | 鏡頭不動；每站一個場景，在正中間淡入淡出 |
| 文字 | 左邊說明欄、停靠站、對照表 | 上面一句大標，下面一兩句說明加「讀筆記」連結 |
| 配色 | 跟網站的深淺色走 | 不管網站是什麼模式，這頁一律黑底 |
| 結尾 | 「繼續往下捲」接下面的章節 | 拉遠看完成品、發光，接 CTA 按鈕和 outro |

## 流程

### 1. 先做幾個方向讓使用者挑

使用者說「看起來很廉價」、「做幾個版本」時，先查知名網站怎麼做同類的頁面，再各做一個可以捲的原型，不要只給文字描述。ICLAB 做了四版，使用者選 A：

| 版本 | 參考 | 長相 |
| --- | --- | --- |
| **A 發表會** | Apple 產品頁 | 黑底、一拍一句大標、畫面置中換場景（就是這個 skill） |
| B 圖文捲動 | NYT、The Pudding | 淺色、左文右圖，圖釘住、文字卡片捲過去 |
| C 產品架構圖 | Stripe、Linear | 白底卡片、整張架構圖、捲到哪一塊就亮起來 |
| D 互動長文 | Distill | 一般文章排版，圖插在段落之間，各自跟著捲動演 |

- 原型放在 `_prototypes/<slug>/`，不要 commit。場景程式寫在 `common.js` 讓各版共用；每一版是一個 `x.src.html`，裡面用 `/*COMMON*/` 佔位，再用一支小 `build.js` 把 `common.js` 塞進去，產生單檔的 `x.html`。
- 每一版都用真的內容（真的站名、真的筆記標題、真的數字），只是版型不同。用 lorem ipsum 的話，使用者沒辦法判斷哪一版好。
- 單檔 HTML 用 `mcp__claude-artifacts__publish_files` 發成 artifact 給使用者看。artifact 只會載 Google Fonts，所以 CSS 和 JS 都要內嵌。
- 使用者選定後，正式版照選中的那一版重寫，把它接進主題（下面第 4 步），不要直接把原型搬進去。

### 2. 分鏡：一個例子、幾站、幾拍

先跟使用者對一張分鏡表。

| 拍 | 權重 | 章節 | 場景 | 大標（一句，`<em>` 包重點） | 讀筆記 |
| --- | --- | --- | --- | --- | --- |
| code | 1.3 | RTL | code | 先寫 *11 行* Verilog。 | 資料型態、運算子、時序控制… |
| circuit | 1.3 | RTL | circuit | 每一行，*都是一塊電路*。 | 賦值、RTL guidelines |
| floorplan … route | 0.75–1.3 | APR | layout（連用 5 拍） | 畫出 core 的*邊界*。… | APR、floorplan、power plan |
| final | 1.1 | Labs | layout（拉遠） | 這就是 ICLAB 的*一學期*。 | CTA：看全部筆記、期末專題 |

- **一個貫穿全頁的小例子**。ICLAB 用一個 11 行的 8-bit 累加器 `acc`，從 code 到 circuit、netlist、layout 都是它。例子要小到每一站都畫得完整，又要真的能走完整條流程。它的數字（cell 數、key point 數、波形）要照例子實際算出來，outro 再註明哪些畫面是示意圖。
- **站的順序照「流程」排，不一定照上課週次**。ICLAB 的 Lint 是第 1 週教的，但放在 FSM 之後、模擬之前。每一拍的 kicker 寫上週次（`03 — Lint · W1`），outro 再放一張「週次 → 這頁的哪一站」對照表。
- 一拍一件事。同一個場景可以連用好幾拍，一拍多長一點東西：ICLAB 的 layout 用了 5 拍，floorplan、power、place、CTS、route 各一拍。
- **最後一拍拉遠**：完成品縮小 14%、外框換成強調色、後面打一圈光（`--glow`）。這一拍放成果的代表數字（「367.8 FPS、2.63 mW，25 組裡第一」），加兩顆 CTA 按鈕。
- 權重：資訊多的拍 1.2–1.3，連用場景裡的過場拍 0.75–0.95；總長約每拍 100–110svh（ICLAB 14 拍用 `1500svh`）。
- 章節 4–5 個，每章 2–5 拍，名字用短的英文（`RTL|Verify|Synthesis|APR|Labs`），放在底下的章節列。

### 3. 文字的寫法

每一拍固定三層：

```html
<article class="ic-beat" data-beat="lec" data-w="1.2" data-ch="2">
  <header class="ic-head"><p class="ic-kick">06 — LEC · W9–10</p><h2>證明它<em>沒有被改壞</em>。</h2></header>
  <div class="ic-cap"><p>一兩句：這一站在做什麼、為什麼要做，數字取自筆記。</p><%- reads(['lec']) %></div>
</article>
```

- **kicker**：`編號 — 站名 · 週次`，等寬字、強調色。
- **大標**：一句話、句號結尾，重點兩三個字用 `<em>` 上強調色。大標是寫給沒修過這門課的人看的，不用術語開頭。
- **說明**：最多兩句、`max-width: 36em`，術語用 `<code>`。只講這一站的重點，細節留給筆記。
- **讀筆記**：2–5 個連結。用短標題（「時序控制 @ wait #」），完整標題放在 `title` 屬性。
- Hero：上面是 kicker（課名 · 代碼 · 學校），中間一行大標（ICLAB 用「11 行 Verilog，變成一塊晶片。」，「變成」用 `--ink-3` 壓暗），下面是 lede。另外放一個「直接看筆記總覽（N 篇）→」的連結，給不想看動畫的人。
- Outro 寫成一般的文章排版：三點 takeaway、進度對照表、這頁連到的筆記，以及資料來源和「哪些畫面是示意圖」。

### 4. 接進網站

照 `CLAUDE.md` 的「新增頁面」接好 `source/lab/<slug>/index.md`、`layout/<slug>.ejs`、`css/<slug>.css`、`js/<slug>.js`，以及 `head.ejs`、`layout.ejs` 各一行。另外：

- **筆記連結從 layout 算，不寫死標題**：`NOTES = { key: [網址, 短標題, 小標] }`，用 `site.posts` 比對 path，拿到筆記的完整標題。比對前兩邊都要去掉頭尾的 `/`，因為 obsidian 同步來的筆記 path 開頭有 `/`。篇數用課程 tag 算（扣掉總覽本身）。連到的筆記不存在時，就退回寫死的短標題，不讓頁面壞掉。
- **課程入口**：`_config.tapeout.yml` 的 `notes.courses` 那一門加 `tour: /lab/<slug>/`。加了之後：
  - `/notes/` 的課程卡片會直接連到動畫頁（`notes.ejs` 的 `c.tour || c.hub.path`）。
  - 總覽筆記的標頭會出現動畫入口卡（`course_tour()` → `_partial/course-tour.ejs`）。它讀的是動畫頁 front-matter 的 `tour.tagline` 和 `tour.stops`（每站 `id / n / label / weeks / sub / notes`），縮圖的格數就是站數。
- 動畫頁 front-matter 加 `kind: note` 和 `reading`，它才會列在 `/notes/`。
- **強制深色**：layout 會給 `<body>` 加 `is-<layout>` 的 class。在 `body.is-<slug>` 上把網站的變數全部覆寫成深色（`--bg --surface --ink --ink-2 --ink-3 --line --line-2 --accent --header-bg`，加上 `color-scheme: dark`），再用 `html:has(body.is-<slug>) { background: … }` 讓捲過頭時露出來的也是黑色；這一頁不需要的 statusbar 藏起來。header、footer 吃同一組變數，會自動變深色，不用另外改。
- CSS 和 JS 的網址由 `css()`、`js()` 自動加 `?v=<hash>`（`fb1c919`），改了檔案不用手動 bust cache。

## 程式架構

```
.ic[data-ic]                       JS 跑起來加 .is-live，下一幀加 .is-ready；reduced-motion 加 .is-static
  header.ic-hero
  section.ic-track                 .is-live 才拉長（1500svh）
    .ic-stage                      sticky; top: var(--header-h); height: calc(100svh - var(--header-h))
      .ic-viz > svg.ic-world       absolute，夾在大標和說明中間：top clamp(128px,22vh,190px)、bottom clamp(150px,23vh,200px)
      .ic-beats > article×N        每一拍 absolute; inset: 0，flex column + space-between（大標在上、說明在下）
      nav.ic-rail[data-names]      JS 依 data-ch 長出章節按鈕，底線吃 --p
      button.ic-play               自動播放
  section.ic-outro
```

- **ART 和 controller 分開**。ART 只管畫：每個場景都是 `make(parent) → { set(t) }`，`t` 是 0–1，畫面是 `t` 的純函式，顏色全部用 class。controller 只管「現在第幾拍、哪個場景、它的 `t` 是多少」。這樣做原型時 ART 可以在四個版本之間共用，正式版也是整段搬過去。
- **一個固定的世界**：`viewBox="-40 -30 680 470"`，每個場景用 `translate` 擺在世界裡一次就不再動，`.ic-world > g` 設 `transform-box: view-box; transform-origin: 300px 210px`，所以場景的 `scale` 以世界中心為準。
- **場景 run**：連續用同一個場景的幾拍算一段 run。骨架把場景寫在 `data-scene`，ICLAB 寫在 JS 的 `SCENE` 表；新頁面用 `data-scene`。可見度：
  ```js
  v = (i ? seg(lt(r.first, p), 0.06, 0.2) : 1) * (r.next ? 1 - seg(lt(r.next, p), 0, 0.1) : 1)
  ```
  舊場景在下一段第一拍的 0–10% 淡出，新場景 6–20% 淡入，兩個畫面幾乎不重疊。一開始用 0–18% 同時淡入淡出，結果 FSM 的殘影會疊在 lint 底下。淡出時再加 `scale: 0.97 + 0.03·v`，有一點點往後退的感覺。
- **連用好幾拍的場景**：`t` 從 run 的第一拍走到最後一拍（finale 那一拍不算），場景裡面用 `PHASES = [[名字, 起, 迄], …]` 切段（ICLAB layout 的 floorplan / power / place / cts / route）。
- 單拍場景的 `t = seg(lt(id, p), 0.08, 0.8)`：前 8% 讓文字先進來，後 20% 停在完成的樣子讓人看。
- 文字切換用 class：`render` 只在拍數改變時切 `.is-on`，淡入和上滑 12px 交給 CSS transition；而且 transition 只寫在 `.is-ready` 底下，從中段重新整理時才不會整排一起淡入。
- 章節列：點了捲到那一章第一拍的 60%。自動播放大約每拍 5.5 秒（ICLAB 75 秒），碰到滾輪、觸控、鍵盤就停；`p > 0.985` 時加 `.is-end`，播放鍵淡掉。
- 場景素材：
  - code：用 `clipPath` 一行一行打出來，再加游標和行高亮。
  - 電路、netlist：先放 cell，再用 `pathLength=1` 畫線。
  - 波形：游標掃過去，下面的讀數用 hex。
  - layout：固定種子的 `rng(seed)`，每次載入長一樣。
  - lint、LEC：一列一列出現的報表。
  - 作業：卡片陣列。

## 踩過的坑

- **SVG 變兩倍大**：`.ic-viz` 用 grid 加 `height: 100%` 時，高度解不出來。改成 `.ic-viz` absolute 夾在上下之間，SVG `position: absolute; inset: 0`。
- **某個場景整個看不到**：共用的 `defsOf()` 用 `querySelector('defs')` 抓到別的場景裡的 `<defs>`，那個場景被 `visibility: hidden` 藏起來，clip 和 marker 就一起失效。一律用 `:scope > defs` 只抓根層。
- 換場景時兩個畫面疊在一起：淡出要比淡入早結束（見上面的公式）。
- 沒有 JS 時舞台元素要藏起來（`.ic-world, .ic-rail, .ic-play { display: none }`），每一拍改用 grid 依序排好；`.is-static`（reduced-motion）先放 `render(1)` 的完成圖，再排文字。
- `pkill -f hexo` 會把自己的 shell 一起殺掉（exit 144）：停 server 要另外下一個指令。
- `hexo server` 偶爾會卡住，Playwright 的 `goto` 就 timeout。這時改成 `npx hexo generate` 之後 `cd public && python3 -m http.server 4100`。
- 合併 `origin/main` 時，`_config.tapeout.yml` 的 `notes.courses` 註解很容易衝突（別的 session 也在加課程），兩邊的內容都要保留。

## 驗證

```bash
npx hexo generate                       # 不能有任何 WARN
(cd public && python3 -m http.server 4100 &)
node .claude/skills/keynote-tour/shoot.js http://localhost:4100/lab/<slug>/ 1440 /tmp/shots
node .claude/skills/keynote-tour/shoot.js http://localhost:4100/lab/<slug>/ 390  /tmp/shots
```

[shoot.js](shoot.js) 會截下面這些圖，最後印出 console 錯誤：

- hero；
- 每一拍演到 60% 的畫面；
- outro；
- reduced-motion 和停用 JS 的整頁。

字型這類外部資源在沙盒裡連不到，那些錯誤會被忽略。截圖要一張一張看（可以拼成一張 contact sheet 再讀），檢查：

1. 大標、畫面、說明三層沒有互相蓋住；畫面沒有被裁切，也沒有大到撐出舞台。
2. 每一拍的畫面跟大標講的是同一件事；換場景的地方沒有殘影。
3. 連用的場景一拍一拍往前長，最後一拍有拉遠和發光。
4. 390px 寬時說明沒有擠到章節列上。
5. reduced-motion 是「完成圖 + 依序排好的文字」，停用 JS 是依序排好的文字，兩者都讀得完。
6. `/notes/` 的課程卡片連到動畫頁，總覽筆記的標頭有入口卡。

要給使用者先看時，跑 [preview.js](preview.js) 把產生的頁面做成單檔（站內 CSS 和 JS 內嵌，其他站內連結改成正式站的網址），再用 `publish_files` 發成 artifact：

```bash
node .claude/skills/keynote-tour/preview.js public/lab/<slug>/index.html /tmp/<slug>-preview.html
```

## 做專案首頁時

同一個版型可以給大專案用（例如 3DGS 加速器：演算法 → 架構 → RTL → 驗證 → 合成 → APR → 結果）。要改的地方：

- 「一個例子走到底」換成一筆資料或一個 frame 走過整個系統；「讀筆記」換成專案頁的章節錨點、報告、repo。
- **專案是中英雙語**（`CLAUDE.md`）：專案首頁如果放在 `/projects/` 底下，英文版要一起做；放在 `/lab/` 的動畫頁不在 `i18n.js` 的檢查範圍內，但如果從英文專案頁連過來，也要準備英文版或明寫 (in Chinese)。
- 專案頁和 `/projects/` 列表的入口要另外接（目前 `tour` 只有 `notes.courses` 認得），接的時候照 `course_tour()` 的做法加一個 helper，不要在 layout 裡寫死網址。
