# 交接文件：把動畫解說做成 Obsidian 筆記系統

> 給在 Mac 上新開的 Claude Code session。這份文件寫完就能直接開工，不需要回頭看原本的對話。
> 寫於 2026-10-31，整理自部落格 repo（`hanksome1/hanksome1.github.io`）的 cloud session 討論。

---

## 1. 要做什麼

部落格 `source/lab/` 底下的捲動式動畫解說頁（SwiGLU、FlashAttention、CFG、KroQuant、SVDQuant…）對學習很有幫助。使用者（Hank）想把這種形式變成**日常的筆記系統**，而且要跟平常用的 Obsidian 整合。

**已經決定的方向：**

- **做成 Obsidian 外掛，不另外做 app。** 動畫筆記的價值在於跟其他筆記連在一起，例如 `[[GELU]]`、`[[FFN]]`、反向連結和 graph view，這些 Obsidian 本來就有。另外做 app 會變成兩套筆記，同步不了。
- **Obsidian vault 是唯一的資料來源。** 同一份筆記在 Obsidian 裡用播放器看，發佈到部落格時用捲動版看，兩邊用**同一套引擎**。
- **先抽共用引擎，再做外掛。** 現有 10 頁的機制幾乎一樣，抽出來部落格就先受益，外掛也是建立在它上面。

## 2. 現況（部落格 repo）

部落格 repo 在 Mac 上的路徑請問使用者（GitHub 上是 `hanksome1/hanksome1.github.io`），Hexo 8 + 自製主題 `themes/tapeout`。

### 現有的動畫解說頁

| 頁面 | `source/lab/` | JS（在 `themes/tapeout/source/js/`） |
| --- | --- | --- |
| 首頁 tapeout 開場 | （首頁） | `tapeout.js`（61KB） |
| Ideogram 4 vs SD 3.5（逐章並排） | `ideogram4-vs-sd35` | `dit-compare.js` |
| Ideogram 4 vs SD 3.5（兩座塔） | `ideogram4-vs-sd35-tower` | `dit-tower.js` |
| KroQuant 圖解 | `kroquant` | `kroquant.js` |
| SVDQuant 圖解 | `svdquant` | `svdquant.js` |
| FlashAttention 圖解 | `flash-attention` | `flash-attention.js` |
| SwiGLU 圖解 | `swiglu` | `swiglu.js` |
| CFG 圖解 | `cfg` | `cfg.js` |
| ICLAB 設計流程（keynote tour） | `iclab` | `iclab-flow.js` |
| VLSI 課程導覽（keynote tour） | `vlsi` | `vlsi-tour.js` |

### 問題：每一頁都是手寫的

- 每頁 JS 約 30–60KB，加起來約 500KB。
- 至少 9 個檔案各自重寫同一批工具函式：`clamp01`、`seg`、`ease`、`lerp`、`el`、`set`、`show`、`text`、`wire`、`draw`、`hide`。
- 釘住的舞台、捲動進度 `p`、beat 權重換算、鏡頭關鍵格、停靠站、說明欄切換、自動播放也是每頁寫一次。
- 新增一頁要改 5 個地方：`source/lab/<slug>/index.md`、`themes/tapeout/layout/<slug>.ejs`、`themes/tapeout/source/css/<slug>.css`、`themes/tapeout/source/js/<slug>.js`，再到 `_partial/head.ejs` 和 `layout.ejs` 各加一行 `page.layout === '<slug>'`。
- 說明文字寫死在每頁的 `.ejs` 裡，Obsidian 完全看不到。

### 動手前必讀

- **`.claude/skills/scroll-explainer/SKILL.md`**：整套機制的規格，引擎要照它來。重點有：
  - `p` 是 0–1 的進度，畫面上每一樣東西都是 `p` 的純函式，不准存上一幀的狀態，也不准用 setTimeout 演動畫。
  - beat 權重換成 `spans`；每個 beat 一個 renderer，只吃自己的局部進度 `t`。
  - 鏡頭是 `[beat, t, x, y, w]` 關鍵格，寬度用 log 插值。
  - DOM 一次建好，之後只改屬性，`set()` 沒變就不寫。
  - 漸進增強（`.is-live`）、reduced-motion、自動播放的打斷規則。
  - 文件後面有一份驗收清單。
- `.claude/skills/scroll-explainer/skeleton.html`：最小可跑的骨架。
- `.claude/skills/keynote-tour/`：另一種版型（發表會式課程入口），第一版可以先不支援。
- `tools/sync-vault.js`：Obsidian vault → Hexo 的單向同步（`npm run sync`）。
  - vault 路徑在 `_config.yml` 的 `obsidian_sync.vault`，目前是 `~/Library/Mobile Documents/iCloud~md~obsidian/Documents/hanksome`（iCloud）。
  - 只發佈 front-matter 有 `publish: true` 的筆記，輸出到 `source/_posts/notes/`，加上 `synced: obsidian`，每次同步都會覆蓋。
  - `QUERY_LANGS = /^(dataview|dataviewjs|tasks|query)$/i` 的程式碼區塊會被拿掉；其他語言的區塊照原樣保留。
  - 會拿掉 `%%註解%%`，會改寫 wikilink 和附件路徑，只複製有被引用的附件。
- 部落格的 `CLAUDE.md`：發佈流程（push 到 `main` 就直接上線，沒有審核）、新增頁面的接法、雙語規則（只有專案、About、首頁要雙語；筆記和 lab 頁維持中文）。

## 3. 目標架構

```
Obsidian vault（唯一來源）
  SwiGLU.md
    ├─ 一般 Markdown：文字、[[wikilink]]、數學式
    ├─ ```explainer 區塊：beats / shots / world / 指向腳本
    └─ 每一站的說明文字（Markdown 標題）
  explainers/swiglu.js     ← 這一頁自訂的畫法（setup + render）
        │
        ├─ Obsidian 外掛：把區塊畫成播放器（播放 / 暫停、進度條、停靠站、鍵盤 ← →）
        │
        └─ npm run sync → 部落格：通用的 explainer layout，用捲動驅動同一套引擎
```

### 引擎：一個核心、兩種驅動

這是整個設計最關鍵的抽象。**引擎只知道 `p`，不知道 `p` 是從哪來的。**

- `ScrollDriver`（部落格）：釘住的舞台，`p` 由捲動位置算出；自動播放用 `window.scrollTo`。行為照 SKILL.md。
- `PlayerDriver`（Obsidian）：Obsidian 的筆記本身就會捲動，再用捲動驅動動畫會打架，所以改用 rAF 時間軸。提供播放 / 暫停、可以拖的進度條、停靠站按鈕、← → 跳站。

API 草稿（參考用，實作時可以改）：

```js
const ex = Explainer.mount(container, {
  world: [0, 0, 1600, 900],             // SVG 世界座標
  beats: [['intro', 0.7], ['gate', 2.0], ['family', 1.4]],
  hold: 0.35,
  shots: [['intro', 0, 800, 450, 1600], ['gate', 0.2, 600, 420, 900]],
  stops: [{ id: 'gate', label: 'Gate', html: '<p>…</p>' }],   // 從筆記標題來
  setup(api) { /* 建一次 SVG，回傳 refs */ },
  render(t, p, refs, api) { /* t = { intro, gate, … } 各 beat 的局部進度；純函式 */ },
}, { driver: 'scroll' | 'player', reducedMotion: 'auto' });

ex.seek(p); ex.play(); ex.pause(); ex.destroy();
```

`api` 提供原本每頁重寫的那些工具，以及一組常用元件：

- 基本工具：`clamp01 / seg / ease / lerp / el / set / show / text / wire / draw / hide / lod / mulberry32`
- 元件（第一版先做這幾種）：方塊（含 2.5D 斜投影）、連線（`pathLength` 畫線）、矩陣 / tensor 格子、函數曲線（給定 f 和區間）、跟著 `p` 跑的數字、標籤

外觀全部吃 CSS 變數：部落格用 `--ink / --ink-2 / --ink-3 / --line / --surface / --accent`，Obsidian 用 `--text-normal / --background-primary / --interactive-accent` 之類，由驅動層做對應。深色模式要能直接切。

### 筆記格式（草案，Phase 2 跟使用者確認）

````markdown
---
title: SwiGLU 圖解
publish: true
tags: [diffusion, activation]
---

一般的筆記內容，可以連到 [[GELU]]、[[Ideogram 4]]……

```explainer
script: explainers/swiglu.js
world: [0, 0, 1600, 900]
beats: [[intro, 0.7], [curves, 1.6], [gate, 2.0]]
hold: 0.35
shots:
  - [intro, 0, 800, 450, 1600]
  - [gate, 0.2, 600, 420, 900]
```

### Curves ^curves
ReLU、GELU、SiLU 都是一個數字進去、一個數字出來……

### Gate ^gate
SwiGLU 把第一層拆成兩條投影……
````

- 停靠站對應：建議用標題後面的區塊 ID（`^gate`）對應 beat 名稱。這是 Obsidian 原生語法，也能用 `[[SwiGLU#^gate]]` 從別的筆記直接連到某一站。
- 腳本放成獨立的 `.js` 檔，不要整段塞進區塊：現有每頁 JS 動輒 40KB，放在區塊裡很難讀，也很難讓 Claude 改。很小的頁面可以讓區塊直接寫 `script: |` 內嵌。
- 說明文字留在 Markdown 裡，所以可以搜尋，也可以有 wikilink 和數學式。外掛和部落格都從同一處讀。

## 4. 建議的專案結構

新開一個 repo，例如 `explainer-notes`（名稱問使用者）：

```
explainer-notes/
  packages/
    core/              引擎：Explainer.mount、ScrollDriver、PlayerDriver、工具與元件
    obsidian-plugin/   外掛：manifest.json、main.ts、styles.css
  examples/
    test-vault/        測試用 vault（放 1–2 篇範例筆記）
  tools/
    build-core.mjs     把 core 打包成單一 explainer-core.js（給部落格用）
    record.mjs         （選做）用 Playwright 錄 MP4
  CLAUDE.md
```

- 部落格拿 core 的方式：先用最簡單的做法，把打包好的 `explainer-core.js` 複製到 `themes/tapeout/source/js/`，不用發佈 npm 套件。
- 外掛從 Obsidian 官方的 `obsidian-sample-plugin` 樣板開始（TypeScript + esbuild）。

## 5. 分階段計畫

每一步都要有能驗的成果，做完一步再進下一步。

### Phase 0：開專案

- 建 repo 和上面的資料夾結構，寫 `CLAUDE.md`，內容是這份文件的決策和規則精簡版。
- **開一個測試用 vault，不要直接拿使用者的 iCloud vault 開發。** 外掛有 bug 時可能改壞筆記，而且 iCloud 會同步到所有裝置。
- 完成條件：外掛樣板能在測試 vault 裡載入（Obsidian 設定 → 第三方外掛 → 開發者模式）。

### Phase 1：抽出共用引擎

- 讀 SKILL.md 和 `swiglu.js`、`flash-attention.js`、`cfg.js`（三頁結構最接近），把共通部分抽成 `packages/core`。
- 先只做 `ScrollDriver`，**拿 SwiGLU 頁當驗收**：用新引擎重寫 SwiGLU 的骨架，自訂畫法搬進 `setup / render`。
- 驗證畫面一致：用 Playwright 在幾個固定的 `p`（0、0.1、0.25、0.5、0.75、1）分別截圖新舊兩版做比較，再跑 SKILL.md 的驗收清單（倒著捲、點停靠站、自動播放、375px、深色、reduced-motion、停用 JS）。
- 這一步會動到部落格 repo，所以在部落格 repo 開分支做，**不要直接 push `main`**（push 就會上線）。其他 9 頁之後再慢慢搬，舊頁面不能壞。
- 完成條件：SwiGLU 頁的 JS 明顯變小，而且畫面和行為跟原本一樣。

### Phase 2：筆記格式

- 跟使用者確認第 3 節的格式草案，尤其是停靠站怎麼標、腳本放哪個資料夾。
- 寫 parser：Markdown → `{ config, stops[] }`。外掛和部落格共用這一份，放在 core。
- 把 SwiGLU 頁轉成一篇 vault 筆記，當作之後的標準範例。

### Phase 3：Obsidian 外掛

- `registerMarkdownCodeBlockProcessor('explainer', …)`，在閱讀模式和即時預覽都要能顯示。
- 用 `PlayerDriver`：播放 / 暫停、進度條、停靠站按鈕、← →、播到一半點筆記裡的標題會跳到那一站。
- 生命週期：掛在 `MarkdownRenderChild` 上，卸載時一定要 `destroy()`，清掉 rAF 和 listener。切筆記、關分頁都不能漏記憶體。
- 讀腳本檔：用 `app.vault.adapter.read` 讀，檔案改了自動重載，方便邊寫邊看。
- 跟著 Obsidian 的主題切深淺色；也要顧到 Obsidian 手機版（iPhone / iPad）。
- 完成條件：在測試 vault 打開 SwiGLU 筆記，可以播、可以拖、可以跳站，切換筆記 10 次沒有殘留。

### Phase 4：接回部落格

- `tools/sync-vault.js`：
  - 保留 `explainer` 區塊（它不在 `QUERY_LANGS` 裡，現在已經會保留，確認一下就好）。
  - 把區塊引用的 `.js` 腳本當成附件一起複製出去。
  - 在輸出的 front-matter 標記它是 explainer 頁。
- 部落格新增**一個通用的 `explainer` layout**，從筆記內容產生舞台、說明欄和停靠站，用 `ScrollDriver`。
- 目標：之後新增動畫頁不用再碰 `head.ejs` / `layout.ejs`，在 Obsidian 寫一篇筆記、`npm run sync` 就好。部落格 `CLAUDE.md` 的「新增頁面」那一段也要跟著改。
- 注意：sync 產生的筆記會被覆蓋，不要直接改輸出檔。lab 頁和筆記都只需要中文版，不用做英文版。

### Phase 5：寫作流程

- 在新專案（或 vault）裡做一個 skill：讀一篇文字筆記，跟使用者對分鏡表（SKILL.md 的「先寫分鏡，再寫程式」），然後產生 `explainer` 區塊和腳本檔。
- 使用者實際的流程會是：在 Obsidian 寫文字筆記 → 在 Mac 上對 vault 開 Claude Code，請它做成動畫 → 在 Obsidian 裡直接看、提修改。

### 選做

- **匯出 MP4**：用 Playwright 開頁面，`seek(p)` 從 0 跑到 1 逐格截圖再接成影片，拿來複習或分享。
- **keynote-tour 版型**：課程入口頁（ICLAB、VLSI）也改用引擎。
- **舊頁搬家**：其他 9 頁逐一改用引擎，每搬一頁都跑一次截圖比對。

## 6. 限制和注意事項

- **不可能全部用設定檔描述。** 這些頁面直觀，是因為每個主題的圖都是量身畫的，例如 SwiGLU 的曲線是用實際公式和 Ideogram 4 的規格當場算的。引擎提供骨架和元件，畫法一定要能寫 JS。
- **安全性。** 外掛會執行 vault 裡的 JS，只適合自己的 vault。不要上架 Obsidian 社群外掛（審核不接受執行任意程式碼），用手動安裝或 BRAT。
- **只有使用者的 Mac 上有 vault。** cloud session 跑不了同步，外掛也要在 Mac 的 Obsidian 實際試用。
- **reduced-motion 和沒有 JS 的情況照 SKILL.md 處理。** 部落格版停用 JS 時，說明文字要依序可讀。
- **部落格 push 到 `main` 就上線。** 動到部落格 repo 的部分一律在分支上做，等使用者說要發佈再照部落格 `CLAUDE.md` 的流程 merge。

## 7. 待使用者決定

1. 新 repo 的名稱，以及要不要放上 GitHub。
2. 筆記格式：停靠站用 `^block-id` 還是別的標法？腳本統一放在 vault 的哪個資料夾？
3. Obsidian 裡的播放器要嵌在筆記中間，還是開成側邊欄 / 獨立分頁？建議第一版嵌在筆記中間。
4. 現有的 10 頁要全部搬到 vault，還是只有新頁面走新流程？

---

## 開工用的第一句話（貼到新 session）

> 讀 `explainer-notes-handoff.md`，這是這個專案的交接文件。先做 Phase 0：建立 repo 結構、`CLAUDE.md` 和一個測試用 vault。部落格 repo 在 `<路徑>`，動手前先讀它的 `.claude/skills/scroll-explainer/SKILL.md` 和 `themes/tapeout/source/js/swiglu.js`。第 7 節的問題先問我，再開始寫程式。
