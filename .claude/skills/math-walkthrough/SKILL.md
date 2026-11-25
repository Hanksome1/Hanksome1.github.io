---
name: math-walkthrough
description: 做捲動式的公式推導解說頁：右邊白底舞台一次只放一個真正的 LaTeX 式子（KaTeX，字母正體），上一式縮小放在上面，講到的那一項變色、推近，底下標出意思和代入的數字；開頭是整面黑板總覽，中間把幾組具體例子代進黑板一行一行算出數值，結尾是填好數字的回顧，需要時配幾何或曲線圖，可調速自動播放。適用於「把這個推導做成動畫／解說頁」、「一步一步解釋這個公式怎麼來的」、「把 X 定理的證明攤開講」、「看不懂這段數學推導」、課本或論文裡的公式推導（物理、機率、訊號、機器學習、擴散模型…），就算使用者只說「解釋這個公式」或「做成像測不準推導那樣」也用。講程式碼用 code-walkthrough；機制、流程、結構的動畫用 scroll-explainer。
---

# Math walkthrough

一頁講一段推導。左欄一個 `<section data-step>` 講一步，右邊白底舞台照 `steps` 設定換畫面：
- 放哪一式（`eq`），它從哪一式來（`from` + `say`）；
- 哪幾項上色（`hot` / `hot2`），推近哪一項（`zoom`），底下標什麼（`notes`）；
- 配哪張圖（`fig`），照哪段 trace 跑（`scrub`）。

開頭和結尾是整面黑板（`board`）。畫面只看捲動位置，所以倒著捲、跳章節、自動播放看到的都一樣。

| 檔案 | 用途 |
| --- | --- |
| `skeleton/page.html` | 可跑的最小例子：配方法推公式解，9 步，涵蓋黑板總覽、推近、註解、面積圖、參數掃描、代入三組係數、回顧。從這裡改 |
| `scripts/build.js <dir>` | 用 KaTeX 排好 TeX，把引擎和字型內嵌成單檔 `index.html`，並印出每個式子有哪些 `\T` 項 |
| `scripts/shoot.js`、`play.js` | Playwright：每步截圖並回報 console 錯誤；測自動播放的行為 |
| `engine.js`、`engine.css`、`tokens.css` | 引擎（跟部落格主題的 `mathwalk.js` / `mathwalk.css` 是同一份）和單檔用的 token。不用讀，API 在下面 |

## 流程

1. **讀懂推導，切成 8–15 步，一步一式。** 挑 2–3 組具體的例子（真實參數）。最好有一組會在某一行出事，例如丟掉一項、變負、無解：黑板上會用橘色標出那一格，讀者一眼看到哪一步有代價。推導本身沒有會壞的例子時，就標結論最明顯的那一格（例如 t = 1000 時 x₀ 的係數只剩 0.006）；連這種格子都沒有就不標。頁面上的每個數字都在頁面 script 裡從這幾組例子算出來，不手填。
2. **動手前跟使用者對大綱。** 要對的內容：
   - 章節：每章對應黑板上的哪幾行；
   - 每一步的式子，以及它從哪一式來；
   - 哪一項要推近拆開講；
   - 哪裡要配圖；
   - 黑板上代入哪幾組例子，每一格放什麼值。
3. **改 skeleton。** `cp <skill>/skeleton/page.html <work>/page.html`，然後改文字、TeX、`steps`、`figs`。
4. **建置。** `node <skill>/scripts/build.js <work>` 會產出 `index.html`。拿它印出的項目清單對 `steps` 裡的 `hot` / `zoom` / `notes`。
5. **驗收**（最後一節）。

## 怎麼排

這些是使用者看過成品後明確要求的。

- **真正的 LaTeX、正體字母、白底。** 引擎已經處理正體：`.mathnormal` 換成正體字型，build 拿掉斜體修正留下的間距。不要另外用 `\mathit`。
- **一次只放一式。** 上一式縮小變灰放在上面，中間一行 `say` 寫「↓ 從上一式怎麼到這一式」。
- **不要排成程式碼的樣子。** 沒有行號、表頭、等寬字，也不要同時列出一堆式子。整段推導只在黑板上出現。
- **顏色只有一個重點。** 全部用墨色，正在講的那一項用 `hot`（accent）。只有兩個東西對比時才加 `hot2`（`--c2`），例如實部對虛部、a² 對 b²。如果整段推導都在比同一組東西（例如 DDPM 的訊號對雜訊），兩個顏色可以每一步都用，但同一個顏色從頭到尾只代表同一件事（橘 = 訊號、藍 = 雜訊），式子、notes、圖、黑板都照這個對應。不要一項一個顏色，太多顏色使用者會看不懂。
- **推近只用在「這一項要拆開講」。** 推近時其他項會變淡，用 notes 標出拆開後的每一塊，例如 `⟨ψ|Ω̃²|ψ⟩` 拆成 bra、算符、ket。
- **notes 要短。** 每個是一句短話或一個代入的數字，一步最多 3 個。寫法有三種：
  - 字串：當 HTML 放進去，不能寫 TeX；
  - `'#id'`：指到 `<span data-note="id">$…$</span>`，內容要有數學時用這個（`say` 也可以這樣寫）；
  - `function (st)`：跟著 trace 變的數字。回傳 HTML 字串，不能寫 TeX 或 `'#id'`。notes 的位置只照 t = 1 時的內容排一次，所以小數位數要固定，長度才不會一直變。
- **黑板分三種用法。** 整段推導排成一個 `aligned`，一行一個 `\T{r<n>}`：
  - `overview`：依序亮出各章；
  - `run`：把例子代進去，一格一格填，出事的格子用 `mark` 標成 accent；
  - `end`：全部填滿。

  每一格是那一行代入例子後的值。等式就放右邊算出來的數；一行是分布或隨機變數、沒有單一的值時，放那一行新出現的數，前面加名字（`β = 0.00506`）。黑板字的大小由最長的那一行決定，所以每行盡量短：375 寬時字小於 9px，就把那一行拆成兩行（第二行左格留空），或用巨集把長的項縮短。
- **圖只放在式子講不清楚的地方。** 例如幾何意義（面積、向量、複數平面）、曲線（分布、拋物線、波包），或掃一個參數看結果怎麼變。掃參數時，參數值和結果放在同一張圖上一起動。圖上的數字跟 notes、內文用同一組例子算。
- **內文每步兩段。** 第一段講這一步做了什麼、為什麼可以這樣做；第二段代入例子的數字。
- **純文字裡的數學符號。** 黑板格子、圖上的字、說明列都是純文字，不能寫 TeX，要用 Unicode（√、ᾱ、β）。
  - 無襯線字（IBM Plex Sans）排 ᾱ 這種組合字、√ 和下標數字（₀、₂₅₀）都會走樣，所以圖上有數學的字一律加 class `mx`（STIX），而且不用下標字元：「x₀ = 0.8」改成在點旁邊標「0.8」，或寫進內文。
  - 章節小標（`.kicker`）和圖標題（`title`）會被轉成大寫，t 會變成 T、β 會變成 Β，這兩處不要放變數。

## page.html

結構照 skeleton：hero → `.mw[data-mw]`（`.mw-text` 裡放 rail、`.mw-src`、一個個 `section.step`；另有 `.mw-stage`）→ outro。沒有 JS 時整頁照順序讀得完，因為式子留在各自的 section 裡，引擎載入後才搬到舞台上。

TeX 的寫法：

- 行內用 `$…$`，獨立一行用 `$$…$$`。`<` 和 `&` 直接寫，不要寫成 `&lt;`；字面上的 `$` 寫 `\$`。
- **標記一項**：`\T{key}{…}`，可以巢狀，例如 `\T{bk}{\T{bra}{\langle\psi|}\,\T{op}{\tilde\Omega^2}\,\T{ket}{|\psi\rangle}}`。關係符號要上色時寫 `\mathrel{\T{ge}{\ge}}`。
- **某一步的式子**：`<div data-eq="id">$$…$$</div>`，放在那一步的 section 裡。後面幾步可以共用同一式（`steps` 寫同一個 `eq`），式子就停在原位不動。
- **黑板**：`<div data-board>$$\begin{aligned} … \end{aligned}$$</div>`，放在 overview 那一步。
  - 每一行左右兩格都包上 `\T{r<n>}{…}`。
  - 右格開頭加 `{}`，`=` 前後的間距才會對：`\T{r2}{x^2} &\T{r2}{{} = 0} \\`。
  - 章與章之間用 `\\[8pt]` 空開。
- **自訂巨集**：寫在 `<script type="text/x-tex-macros">` 裡，一行一個 `\name = body`，參數用 `#1`、`#2`。
- **其他**：
  - 字母上的 tilde 或 hat 寫成 `\tilde{\mathrm{X}}`。用斜體字的位移，換成正體後符號會歪。
  - 平方寫 `^2`，不要寫 `^{\,2}`。

## MathWalk 設定

```js
MathWalk({
  chapters: [{ id: 'tidy', n: '01', name: '整理', rows: [1, 2] }, …],  // rows = 黑板上的行，左邊畫括號；bracket: false 不畫；沒有 rows 的章 overview 不亮，rail 上照樣有
  steps: [{
    id: 'divide', ch: 'tidy', eq: 'tidy',          // eq：這一步的式子（data-eq）
    from: 'std', say: '兩邊除以 a',                 // 上一式（縮小放上面）和中間那行說明
    hot: ['ba'], hot2: ['a2'],                     // 上色的項
    zoom: 'add', zfrac: 0.42, zmax: 2.6,           // 推近到一項：佔舞台寬的比例、最大倍率
    notes: [['ba', '一次項係數 = −2', 'hot'],       // [項, 文字 | '#note-id' | function(st), 'hot' | 'hot2']
            ['d', function (st) { return '判別式 = ' + st.ev.vars.d; }]],
    fig: 'box', figMode: 'split', figEvent: 3,     // 配哪張圖、圖的模式、不 scrub 時停在 trace 的第幾個事件
    scrub: { trace: 'sweep', from: 0, to: 24 },    // 這一步照 trace 跑
    h: 1.3                                         // 佔幾個螢幕高：一般 1.2–1.4，有 trace 的 2.4–3
  }, {
    id: 'run', ch: 'run', board: { mode: 'run', rows: [2, 6] }, h: 3   // 黑板步：mode 是 overview | run | end
  }],
  traces: { sweep: [{ vars: { c: -3, d: 16 } }, …] },
  figs: { box: { title: 'Fig · …', trace: 'sweep', make: function (api) { …; return { node: svg, set: function (st) { … } }; } } },
  board: MathWalk.blackboard({ columns: [{ name: 'x² − 2x − 3', values: { 2: '3', 3: '4' }, mark: [4] }] })
});
```

- **黑板的三種 mode**：
  - `overview` 依序亮出有 `rows` 的章節。
  - `run` 淡掉 `rows` 以外的行，照欄、照行一格一格填（trace `'board'` 會自動產生），一條色帶跟著正在填的那一行。
  - `end` 把每一格都填上。
  - 窄螢幕上，`run` 只顯示正在填的那一欄，`end` 不顯示數字欄。
- **trace 和 scrub**：trace 是一串事件 `{ vars: {…} }`。scrub 時，`st.ev` 是現在的事件，`st.next` 是下一個，`st.frac` 是往下一個走了多少。動畫用 `frac` 平滑移動；印出來的數字用 `st.ev` 的值，才會跟 notes 一致。
- **圖讀哪段 trace**：寫在圖的定義上（`figs.<名稱>.trace`）。某一步沒有 `scrub`、也沒有 `figEvent` 時，`st.ev` 是 `null`，`set` 要能處理。

## 圖

`make(api)` 只建一次 DOM；`set(st)` 只改屬性、文字和 class，不存上一幀的狀態，倒著捲才會對。`make` 在載入時同步執行，要模擬（抽樣、隨機路徑）就在這裡算一次：用固定種子，控制在 50 ms 左右；`set` 裡不要再算。

- **api**：
  - `svg(id, w, h)` 建一張圖，回傳的 `<svg>` 的 `firstChild` 是 `<defs>`，clipPath 放這裡；
  - 畫東西：`T(g, x, y, str, cls, anchor)`、`R(g, x, y, w, h, cls)`、`P(g, d, cls)`、`el(tag, attrs, parent)`；
  - 改東西：`set`、`sop`（透明度）、`cls`、`txt`；
  - 進度：`seg(t, a, b)`、`ease`、`lerp`。
- **st**：
  - `t`：這一步的進度，0–1；
  - `mode`：`figMode`，沒寫時是 `scrub` 或 `event`；
  - `ev` / `next` / `frac`：見上一節；
  - 其他：`step`、`narrow`。
- **class**（定義在 engine.css）：
  - 數學字 `mx`，可加 `.big` `.md` `.sm` `.hl` `.c2`；
  - 文字和軸線：`lab` `num` `axis` `guide`；
  - 曲線：`curve`（可加 `.thin` `.ghost`）、`curve-a` `curve-b`；
  - 面積和方塊：`area-a` `area-b` `sq` `sq-a` `sq-b`；
  - 其他：`brk`、`dot`（加 `.dot-a` / `.dot-b` / `.dot-z`）、`strike`。
- **顏色**只用上面這些 class 或 CSS 變數，深色模式才會對。頁面自己的樣式放在 page.html 的 `<style>`。
- **尺寸**：viewBox 大約 600×270，字放在圖裡面。窄螢幕上圖會縮到 0.6 倍左右，重點數字用 `mx`（17px）以上。

## 成品放哪裡

- **單檔（預設）**：build.js 產出的 `index.html`，用 `file://` 就能開。放在 scratchpad 或使用者指定的地方。KaTeX 的字型已經內嵌，內文字型（IBM Plex、STIX Two Text）則從 Google Fonts 載入，離線時改用系統字型。
- **部落格 repo**（Hexo，tapeout 主題）：引擎、KaTeX 和 `texify` helper（`themes/tapeout/scripts/math.js`，build 時排 TeX）都已經在主題裡。主題的 `source/js/mathwalk.js`、`source/css/mathwalk.css` 跟這裡的 `engine.js`、`engine.css` 是同一份，改引擎時兩邊一起改。一頁需要這些檔案：
  - `source/lab/<slug>/index.md`：front-matter 寫 `layout: <slug>`、`kind: note`、`reading`（閱讀分鐘數）。
  - `themes/tapeout/layout/<slug>.ejs`：`<%- texify(partial('_partial/<slug>'), { '\\T': '\\htmlClass{t-#1}{#2}', … }) %>`。巨集寫在這裡，不用 `x-tex-macros`。
  - `themes/tapeout/layout/_partial/<slug>.ejs`：page.html 從 `<header>` 到 `<footer>` 的部分，hero 和 outro 已經帶有 `wrap`。
  - `themes/tapeout/source/js/<slug>.js`：頁面 script，就是 `MathWalk({...})` 那段。
  - `themes/tapeout/source/css/<slug>.css`：`.is-<slug> .statusbar { display: none; }`，加上頁面自己的圖樣式。
  - `_partial/head.ejs` 加一行：`<% if (page.layout === '<slug>') { %><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=STIX+Two+Text:wght@400;600&display=swap"><%- css('katex/katex.min') %><%- css('css/mathwalk') %><%- css('css/<slug>') %><% } %>`
  - `layout.ejs` 加一行：`<% if (page.layout === '<slug>') { %><%- js('js/mathwalk') %><%- js('js/<slug>') %><% } %>`
  - 完整的實例是 `/lab/uncertainty-derivation/`（測不準關係），它的黑板裝飾是自訂的函式，示範了 `board: function (api) { return { set } }` 的寫法。

## 驗收

```bash
node <skill>/scripts/build.js <work>
node <skill>/scripts/shoot.js file://<work>/index.html 1440 <work>/shots
node <skill>/scripts/shoot.js file://<work>/index.html 1440 <work>/shots 0.62 dark
node <skill>/scripts/shoot.js file://<work>/index.html 375 <work>/shots
node <skill>/scripts/play.js file://<work>/index.html
```

1. build 沒有錯誤，印出的項目跟 `steps` 裡的 `hot` / `zoom` / `notes` 對得上。
2. shoot 的輸出是 `no console errors`。若看到 `mathwalk: no term "…"`，表示 steps 指到一個不存在的項。接著逐張看截圖：
   - 式子沒被切掉（推近的那一步除外）；
   - notes 沒有互相重疊；
   - 圖上的數字跟 notes、內文一致，黑板 `run` 填的數字正確；
   - 深色模式和 375px 都讀得清楚。
3. play.js 輸出的每一行都是 `ok`。
4. 把截圖給使用者看；沒驗到的部分明講，不要說「驗過了」。

KaTeX 找不到時，在頁面資料夾跑 `npm i katex`；skill 放在部落格 repo 裡時會直接用 repo 的 KaTeX。Playwright 找不到時，跑 `npm i -D playwright && npx playwright install chromium`，或用 `NODE_PATH` 指到已經裝了它的 `node_modules`。
