# Personal Blog — Hexo + `tapeout` theme

A personal website that uses chip design as its visual language: each project is a "chip", each project page is a datasheet, and the home page has an interactive waveform viewer.

## Local development

```bash
npm install
npm run server      # http://localhost:4000
```

## Adding content

```bash
# Project (appears on /projects/, uses the project layout)
npx hexo new project "RISC-V CPU" -p projects/riscv-cpu
# Every project needs an English version with the same filename (/en/projects/; rules in CLAUDE.md)
npx hexo new project "RISC-V CPU" -p en/projects/riscv-cpu

# Regular post (appears on /blog/)
npx hexo new "STA Notes" -p blog/sta-notes
```

The project front-matter fields are described in [scaffolds/project.md](scaffolds/project.md). The main ones:

| Field | Purpose |
| --- | --- |
| `featured: true` | Shown first on the home page; the first one gets the large card |
| `summary` | One-line summary for the card and page header |
| `metrics` | Data table (Fmax, Area, Power…); the card shows the first three |
| `floorplan` | Block names to label on the auto-generated chip floorplan |
| `cover` | Uses the image if there is one, otherwise the auto-generated floorplan |
| `links` | Links such as GitHub or a report PDF |

## Components available in posts

````markdown
```verilog
always @(posedge clk) q <= d;
```

{% wavedrom Caption %}
{ signal: [ { name: 'clk', wave: 'p....' }, { name: 'd', wave: '01.0.' } ] }
{% endwavedrom %}

{% note warn Warning %}
The body supports **Markdown**. Types: info / warn / tip
{% endnote %}

![Captions are numbered automatically as Fig. N](/images/xxx.png)
````

## LaTeX math

Posts, projects, and Obsidian notes can all contain LaTeX. It is converted to HTML with [KaTeX](https://katex.org/) at build time, so the browser doesn't need to run JavaScript, and only pages with math load the KaTeX CSS and fonts. The implementation is in [`themes/tapeout/scripts/math.js`](themes/tapeout/scripts/math.js), and [`source/_posts/notes/Dynamic Power.md`](<source/_posts/notes/Dynamic Power.md>) is a full example.

````markdown
Inline $P = \alpha C V^2 f$ or \(P = \alpha C V^2 f\)

$$
E = \int_0^\infty V_{DD} \, i(t) \, dt \label{eq:supply}
$$

\begin{align}
a &= b + c \label{eq:ab} \\
  &= d \nonumber
\end{align}

From \eqref{eq:supply} and Lemma~\ref{lem:x}, it follows that…

> [!lemma] Titles can contain $x^2$
> \label{lem:x}
> The body supports Markdown and math.

> [!proof]-
> Adding `-` collapses it; a QED symbol is added at the end automatically.
````

| Syntax | Notes |
| --- | --- |
| `$…$`, `\(…\)`, `$$…$$`, `\[…\]`, ` ```math ` | Inline and block math. Dollar signs in `\$5` or `$20 到 $30` aren't mistaken for math, and `中文**$x$**中文` (bold math between CJK text) also renders correctly |
| `\displaylines`, `\require`, `\bbox`, `\mathbbm` | Commands that exist only in HackMD / Obsidian (MathJax); they are replaced with their KaTeX equivalents automatically |
| `\begin{equation}`, `align`, `gather`, `alignat`, `multline`, `eqnarray` | Can be written directly without wrapping in `$$`; versions without `*` are numbered automatically |
| `\label{…}`, `\eqref{…}`, `\ref{…}` | Cross-references, including forward references. `$$ … $$` is numbered only if it has a `\label`; `\nonumber` and `\tag{…}` follow LaTeX rules |
| `> [!theorem] Name` | Theorem-style callout. theorem, lemma, proposition, corollary, definition, example, and exercise share one counter; remark and proof are unnumbered |
| `{% theorem Name %} … {% endtheorem %}` | The same thing as a Hexo tag (`{% proof %}` is also available) |
| `\newcommand`, `\DeclareMathOperator` | Write them in any expression and all later expressions on the page can use them |
| `math.macros` in `_config.tapeout.yml` | Site-wide macros, equivalent to a LaTeX preamble |
| Front-matter `math: false` | Skips math processing for the whole page |

- Invalid expressions appear in red on the page, and the `hexo server` / `hexo generate` output shows `WARN [math] filename: error message`. Unresolved references appear as **??**.
- After changing `math.macros`, run `npx hexo clean` first so that already generated posts are re-rendered.
- See [Supported Functions](https://katex.org/docs/supported.html) for the commands KaTeX supports. Anything that needs full TeX, such as TikZ or `\usepackage`, won't work.
- In Obsidian's preview, `\eqref` has no number, and `math.macros` macros must be set up separately in Obsidian.

## Obsidian notes and the knowledge graph

Open the **`source/`** folder with Obsidian's "Open folder as vault". [`source/.obsidian/app.json`](source/.obsidian/app.json) is already configured: new notes go to `_posts/notes/`, pasted images go to `attachments/`, and templates live in `_templates/` (Hexo ignores folders starting with `.` or `_`).

- Notes in `_posts/notes/` appear on `/notes/`; their URLs are lowercased automatically, with spaces replaced by `-`
- No front-matter is needed, because the filename is the title. Optional fields: `tags`, `aliases`, `summary`
- Links between all pages (notes, posts, projects) are drawn as a graph: on home page §03, on `/notes/`, and in the **Linked mentions** section at the bottom of each page (backlinks plus a local graph)

Supported syntax:

| Syntax | Result |
| --- | --- |
| `[[Note]]`, `[[Note\|display text]]`, `[[Note#Heading]]` | Internal link, matched case-insensitively by filename, title, or `aliases` |
| `[[Unwritten note]]` | Dashed link, shown as a dashed circle on the graph |
| `![[diagram.png]]`, `![[diagram.png\|400]]`, `![[diagram.png\|caption]]` | Image (a file with that name anywhere under `source/`) |
| `![[Note]]` | Note link card |
| `> [!tip] Title`, `> [!warning]-` (collapsible) | Callout |
| `==highlight==`, `%%comment%%`, `#tag`, `- [ ] todo` | Highlight, comment left out of the output, tag, checkbox |

### Publishing from the main vault (`npm run sync`)

The iCloud vault used for everyday note-taking is the source of truth. To make a note public, check `publish: true` in its Properties, then run:

```bash
npm run sync        # vault → source/_posts/notes/, attachments → source/attachments/vault/
npm run server      # if the preview looks right, commit and push
```

- Sync is one-way. Generated notes have `synced: obsidian` in their front-matter, so **don't edit them directly**. Unchecking `publish` removes the note on the next sync. Hand-written notes aren't affected
- Links to unpublished notes become plain text, so they neither leak the title nor appear as "unwritten" dashed links. `%%comments%%`, dataview / tasks blocks, and block IDs never reach the repo
- `![[Excalidraw drawing]]` is replaced with the `.svg` the plugin exports automatically. The URL uses a slug derived from the filename, which you can override with `slug:` in the vault
- Settings are under `obsidian_sync` in [`_config.yml`](_config.yml). `npm run sync -- --dry-run` only prints the report without writing files, and `npm run sync -- "Some note.md"` test-publishes one note without changing the vault
- After changing `themes/tapeout/scripts/`, run `npx hexo clean` first so that already rendered notes pick up the change

## Personalization

- Name, bio, links, and the home page waveform animation: [`_config.tapeout.yml`](_config.tapeout.yml)
- Site title and URL: [`_config.yml`](_config.yml)
- The skills pinout diagram and experience on the About page: [`source/about/index.md`](source/about/index.md)
- Colors and fonts: the tokens at the top of [`themes/tapeout/source/css/style.css`](themes/tapeout/source/css/style.css)

## Deployment (GitHub Pages)

1. Create a repo and push to `main`
2. In the GitHub repo, go to Settings → Pages and set Source to **GitHub Actions**
3. Change `url` in `_config.yml` to `https://<username>.github.io`

After that, every push builds and deploys automatically through [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

## License

- **Theme code** ([`themes/tapeout/`](themes/tapeout/)): [MIT License](themes/tapeout/LICENSE). You may freely use, modify, and distribute it, but must keep the copyright notice.
- **Everything else** (posts, notes, project pages, About, images, attachments such as the résumé, site configuration, and `tools/`): © 2026 Hank Wu (吳承翰). All rights reserved. It may not be reproduced or adapted without permission.

The scope of each part is set out in the root [`LICENSE`](LICENSE). The license text in the page footer is in `rights_reserved` and `theme_license` under `themes/tapeout/languages/`, and the MIT link's URL is `license.url` in `_config.tapeout.yml`.
