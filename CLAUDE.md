# CLAUDE.md

## 專案一律中英雙語

每個專案都有中文版和英文版。新增、修改、刪除專案時，兩個版本在同一次改動裡一起完成。

| | 中文（原文） | 英文 |
| --- | --- | --- |
| 專案頁 | `source/_posts/projects/<slug>.md` → `/projects/<slug>/` | `source/_posts/en/projects/<slug>.md` → `/en/projects/<slug>/` |
| 列表頁 | `source/projects/index.md` | `source/en/projects/index.md` |
| About | `source/about/index.md` | `source/en/about/index.md` |
| 首頁 | `/`（index generator） | `source/en/index.md` → `/en/`（只放 `layout: index` 與英文 `description`） |

完成條件：`npx hexo generate` 的輸出沒有任何 `WARN [i18n]`。[`themes/tapeout/scripts/i18n.js`](themes/tapeout/scripts/i18n.js) 會檢查每個專案是否兩個版本都在，以及共用欄位是否一致。

只有專案、About 和首頁是雙語的；文章與筆記維持中文，英文頁的導覽列和英文首頁的 Writing / Notes 區塊會自動用中文版補上。

首頁的文字來自 `_config.tapeout.yml`：要分語言的欄位（`profile` 的文字欄位、`now` 的 `value`）寫成 `{ zh-TW: …, en: … }`，主題用 `localize()` 依頁面語言取值；改其中一種語言時，另一種一起改。

About 的 `pinout`、`timeline` 的 `period`、`awards` 的 `date` 兩邊相同，`timeline` 的 `note`、`awards` 的 `title` / `note` / `label` 與內文要翻譯，`awards` 的 `url` 連到對應語言的專案頁；這一頁不在 `i18n.js` 的檢查範圍內，改中文版時記得同步改英文版。

### Front-matter

- **兩邊相同**：`date`、`featured`、`part`、`period`、`cover`、`stack`、`tools`、`floorplan`、`tags`、`metrics` 的 `value`、`links` 的 `url`。`tags` 保持原樣，它們決定 `/tags/` 頁面。
- **翻譯**：`title`、`summary`、`role`、`course`（寫成 `Final project, <English course name>, NTHU`）、`team`（`2-person team`、`Solo project`）、`metrics` 的 `label` / `note`、`links` 的 `label`。

### 英文版內文

英文版 mirror 中文版：同樣的章節、圖片、表格、數學式、程式碼和數字，逐段對應；程式碼只翻譯註解。中文版是原文，兩邊有出入時以中文版為準。

- 站內連結：連到其他專案用 `/en/projects/<slug>/`；連到只有中文的文章或筆記沿用原網址，Markdown 連結後面加 (in Chinese)，`[[wikilink]]` 照抄。
- 頁內錨點：標題翻成英文後 id 會變成英文標題以 `-` 連接（例如 `## Looking back: where things likely went wrong` → `#Looking-back-where-things-likely-went-wrong`），`](#…)` 要跟著改，改完在產生的 HTML 裡確認 id 存在。
- 人稱：「我」寫 I、「我們」寫 we。

## 發佈

push 到 `main` 就會由 `.github/workflows/pages.yml` 部署到 https://hanksome1.github.io ，沒有審核這一關。使用者說要發佈時：

1. 跑 `npx hexo generate`（cloud session 先 `npm ci`），輸出不能有任何 `WARN`。
2. commit，然後把改動放進 `main` 並 push；cloud session 在自己的分支上做完，先 merge `origin/main`，再 merge 回 `main`。
3. 使用者只說要先看、或 push 被擋時，停在分支上，請使用者從 session 的 Changes 卡片按 Create PR。

### 新增頁面

- 動畫解說頁用 `scroll-explainer` skill。一頁要有這些檔案，照 `6811dec`（KroQuant）的接法：
  - `source/lab/<slug>/index.md`：front-matter 寫 `layout: <slug>`；要列在 `/notes/` 就加 `kind: note` 和 `reading`（閱讀分鐘數）。
  - `themes/tapeout/layout/<slug>.ejs`、`source/css/<slug>.css`、`source/js/<slug>.js`（後兩個在主題資料夾底下）。
  - `themes/tapeout/layout/_partial/head.ejs` 加一行 CSS、`layout.ejs` 加一行 JS，都用 `page.layout === '<slug>'` 判斷。
- 新的論文解說頁要加進 `source/lab/diffusion-papers/index.md` 的 `chapters`，章節頁的上一章、下一章和 `/notes/` 的課程卡片都從那裡算。
- 文章放 `source/_posts/blog/`，筆記放 `source/_posts/notes/`。
- front-matter 有 `synced: obsidian` 的筆記是 `npm run sync` 從 Obsidian vault 產生的，每次同步都會覆蓋，不要直接改。vault 只在使用者的 Mac 上，cloud session 跑不了同步。
