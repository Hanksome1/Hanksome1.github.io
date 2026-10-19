# Personal Blog — Hexo + `tapeout` theme

以晶片設計為視覺語言的個人網站：專案是一顆顆「晶片」、每個專案頁是一份 datasheet、首頁有可互動的波形檢視器。

## 本機開發

```bash
npm install
npm run server      # http://localhost:4000
```

## 新增內容

```bash
# 專案（會出現在 /projects/，用 project 版型）
npx hexo new project "RISC-V CPU" -p projects/riscv-cpu
# 每個專案都要有英文版，檔名相同（/en/projects/，規則見 CLAUDE.md）
npx hexo new project "RISC-V CPU" -p en/projects/riscv-cpu

# 一般文章（會出現在 /blog/）
npx hexo new "STA 筆記" -p blog/sta-notes
```

專案的 front-matter 欄位說明見 [scaffolds/project.md](scaffolds/project.md)。重點：

| 欄位 | 用途 |
| --- | --- |
| `featured: true` | 優先顯示在首頁，第一個是大卡片 |
| `summary` | 卡片與頁首的一句話摘要 |
| `metrics` | 數據表（Fmax、Area、Power…），卡片會顯示前三個 |
| `floorplan` | 自動產生的晶片佈局圖上要標示的區塊名稱 |
| `cover` | 有放圖就用圖，沒有就用自動生成的 floorplan |
| `links` | GitHub、報告 PDF 等連結 |

## 文章裡可用的元件

````markdown
```verilog
always @(posedge clk) q <= d;
```

{% wavedrom 圖說 %}
{ signal: [ { name: 'clk', wave: 'p....' }, { name: 'd', wave: '01.0.' } ] }
{% endwavedrom %}

{% note warn 注意 %}
內容支援 **Markdown**。種類：info / warn / tip
{% endnote %}

![圖說會自動編號 Fig. N](/images/xxx.png)
````

## LaTeX 數學式

文章、專案與 Obsidian 筆記都可以直接寫 LaTeX。建置時就用 [KaTeX](https://katex.org/) 轉成 HTML，瀏覽器不用跑 JavaScript；只有含數學式的頁面才會載入 KaTeX 的 CSS 與字型。實作在 [`themes/tapeout/scripts/math.js`](themes/tapeout/scripts/math.js)，完整範例見 [`source/_posts/notes/Dynamic Power.md`](<source/_posts/notes/Dynamic Power.md>)。

````markdown
行內 $P = \alpha C V^2 f$ 或 \(P = \alpha C V^2 f\)

$$
E = \int_0^\infty V_{DD} \, i(t) \, dt \label{eq:supply}
$$

\begin{align}
a &= b + c \label{eq:ab} \\
  &= d \nonumber
\end{align}

由式 \eqref{eq:supply} 與 Lemma~\ref{lem:x} 可知……

> [!lemma] 標題可以有 $x^2$
> \label{lem:x}
> 內容支援 Markdown 與數學式。

> [!proof]-
> 加 `-` 會摺疊起來；結尾自動加上證畢符號。
````

| 寫法 | 說明 |
| --- | --- |
| `$…$`、`\(…\)`、`$$…$$`、`\[…\]`、` ```math ` | 行內與區塊數學式；`\$5` 或 `$20 到 $30` 這種錢字號不會被誤判，`中文**$x$**中文` 也能正常加粗 |
| `\displaylines`、`\require`、`\bbox`、`\mathbbm` | HackMD / Obsidian（MathJax）才有的指令，會自動換成 KaTeX 的對應寫法 |
| `\begin{equation}`、`align`、`gather`、`alignat`、`multline`、`eqnarray` | 可以直接寫，不用再包 `$$`；不加 `*` 的版本自動編號 |
| `\label{…}`、`\eqref{…}`、`\ref{…}` | 交叉引用，可以往後引用；`$$ … $$` 只有加了 `\label` 才會編號，`\nonumber`、`\tag{…}` 照 LaTeX 規則 |
| `> [!theorem] 名稱` | 定理類 callout：theorem、lemma、proposition、corollary、definition、example、exercise 共用一組編號；remark、proof 不編號 |
| `{% theorem 名稱 %} … {% endtheorem %}` | 同上的 Hexo tag 寫法（也有 `{% proof %}`） |
| `\newcommand`、`\DeclareMathOperator` | 寫在任何一個式子裡，整篇後面的式子都能用 |
| `_config.tapeout.yml` 的 `math.macros` | 全站共用的巨集，等同 LaTeX 導言區 |
| front-matter `math: false` | 整篇不處理數學式 |

- 寫錯的式子在頁面上會顯示成紅字，`hexo server` / `hexo generate` 的輸出也會出現 `WARN [math] 檔名: 錯誤訊息`；找不到的引用顯示成 **??**。
- 改了 `math.macros` 之後要先 `npx hexo clean`，已經產生過的文章才會重新渲染。
- KaTeX 支援的指令見 [Supported Functions](https://katex.org/docs/supported.html)。TikZ、`\usepackage` 這類需要完整 TeX 的東西沒辦法用。
- Obsidian 預覽時 `\eqref` 不會有編號，`math.macros` 的巨集也要另外在 Obsidian 設定。

## Obsidian 筆記與知識圖譜

用 Obsidian 的「Open folder as vault」打開 **`source/`** 資料夾。[`source/.obsidian/app.json`](source/.obsidian/app.json) 已經設定好：新筆記存到 `_posts/notes/`、貼上的圖片存到 `attachments/`、模板放在 `_templates/`（Hexo 會忽略 `.` 和 `_` 開頭的資料夾）。

- `_posts/notes/` 裡的筆記會出現在 `/notes/`，網址自動轉成小寫、空白換成 `-`
- 不用寫 front-matter，標題直接用檔名；可選欄位：`tags`、`aliases`、`summary`
- 所有頁面（筆記、文章、專案）之間的連結會畫成圖譜：首頁 §03、`/notes/`，以及每一頁底部的 **Linked mentions**（反向連結 + 局部圖譜）

支援的語法：

| 語法 | 結果 |
| --- | --- |
| `[[Note]]`、`[[Note\|顯示文字]]`、`[[Note#標題]]` | 站內連結，用檔名、標題或 `aliases` 比對（不分大小寫） |
| `[[還沒寫的筆記]]` | 虛線連結，圖譜上是虛線圓圈 |
| `![[diagram.png]]`、`![[diagram.png\|400]]`、`![[diagram.png\|圖說]]` | 圖片（從 `source/` 底下任何位置找同名檔案） |
| `![[Note]]` | 筆記連結卡片 |
| `> [!tip] 標題`、`> [!warning]-`（可摺疊） | Callout |
| `==重點==`、`%%註解%%`、`#tag`、`- [ ] 待辦` | 螢光標記、不輸出的註解、標籤、核取方塊 |

### 從主 vault 發佈（`npm run sync`）

平常寫筆記的 iCloud vault 才是真實來源；想公開的筆記在 Properties 勾 `publish: true`，再跑：

```bash
npm run sync        # vault → source/_posts/notes/，附件 → source/attachments/vault/
npm run server      # 預覽沒問題就 commit + push
```

- 同步是單向的，產生的筆記 front-matter 有 `synced: obsidian`，**不要直接改**；取消勾選後下次同步會自動刪除。手寫的筆記不受影響
- 連到沒發佈的筆記會變成純文字（不會洩漏標題、也不會畫成「還沒寫」的虛線）；`%%註解%%`、dataview / tasks 區塊、區塊 ID 不會進 repo
- `![[Excalidraw 圖]]` 會換成外掛自動匯出的 `.svg`；網址用檔名轉成的 slug，可以在 vault 用 `slug:` 自訂
- 設定在 [`_config.yml`](_config.yml) 的 `obsidian_sync`；`npm run sync -- --dry-run` 只看報告不寫檔，`npm run sync -- "某篇.md"` 可以不改 vault 先試發佈一篇
- 改過 `themes/tapeout/scripts/` 之後要先 `npx hexo clean`，已經 render 過的筆記才會套用

## 個人化

- 名字、簡介、連結、首頁波形動畫：[`_config.tapeout.yml`](_config.tapeout.yml)
- 網站標題、網址：[`_config.yml`](_config.yml)
- About 頁的技能腳位圖與經歷：[`source/about/index.md`](source/about/index.md)
- 顏色與字體：[`themes/tapeout/source/css/style.css`](themes/tapeout/source/css/style.css) 最上方的 tokens

## 部署（GitHub Pages）

1. 建立 repo 並 push 到 `main`
2. GitHub repo → Settings → Pages → Source 選 **GitHub Actions**
3. 把 `_config.yml` 的 `url` 改成 `https://<帳號>.github.io`

之後每次 push 都會自動透過 [`.github/workflows/pages.yml`](.github/workflows/pages.yml) 建置與部署。

## 授權

- **主題程式碼**（[`themes/tapeout/`](themes/tapeout/)）：[MIT License](themes/tapeout/LICENSE)，可以自由使用、修改與散布，但要保留著作權聲明。
- **其餘內容**（文章、筆記、專案頁、About、圖片、履歷等附件、網站設定與 `tools/`）：© 2026 吳承翰，保留所有權利，未經同意不得轉載或改作。

兩部分的範圍見根目錄的 [`LICENSE`](LICENSE)。頁尾的授權說明文字在 `themes/tapeout/languages/` 的 `rights_reserved` 與 `theme_license`，MIT 連結的網址是 `_config.tapeout.yml` 的 `license.url`。
