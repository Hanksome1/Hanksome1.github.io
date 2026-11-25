// Render a math walkthrough's TeX with KaTeX and inline everything into one self-contained HTML file.
//   node build.js <dir | page.html> [out.html]        default: <dir>/page.html → <dir>/index.html
//
// · $$…$$ (display) and $…$ (inline) outside <script>/<style> become KaTeX HTML at build time; \$ is a literal dollar.
//   Write < and & in TeX as they are (not &lt; / &amp;).
// · Macros: \T{key}{…} tags a term (→ \htmlClass{t-key}{…}). Page macros go in
//     <script type="text/x-tex-macros">  \Xt = \tilde{\mathrm{X}}   (one per line; #1, #2 for arguments)  </script>
// · <link rel="stylesheet" href="katex.css|tokens.css|engine.css"> and <script src="engine.js"></script> are replaced by
//   the files themselves; KaTeX's fonts become data URIs, so the math renders offline. The text fonts (IBM Plex,
//   STIX Two Text) still come from Google Fonts; offline, system fonts stand in.
// · Letters are set upright by engine.css, so KaTeX's italic-correction margins are removed (else ⟨P⟩ gets a gap).
// Prints every equation's term keys and the board's rows: check the steps config against them.
const fs = require('fs');
const path = require('path');

const skill = path.resolve(__dirname, '..');
const [, , arg, outArg] = process.argv;
if (!arg) fail('usage: node build.js <dir | page.html> [out.html]');
const src = fs.statSync(arg).isDirectory() ? path.join(arg, 'page.html') : arg;
const out = outArg || path.join(path.dirname(src), 'index.html');
if (path.resolve(out) === path.resolve(src)) fail('the output would overwrite the source page; name the source page.html');

function fail(msg) { console.error('build failed: ' + msg); process.exit(1); }

// KaTeX from the page folder, the current folder, NODE_PATH, or the blog repo this skill lives in
function katexDir() {
  const roots = [path.dirname(path.resolve(src)), process.cwd(), path.resolve(skill, '../../..')];
  for (const r of roots) {
    try { return path.dirname(require.resolve('katex/package.json', { paths: [r] })); } catch (e) {}
  }
  try { return path.dirname(require.resolve('katex/package.json')); } catch (e) {}
  fail('katex not found: run `npm i katex` in the page folder, or set NODE_PATH to a node_modules that has it');
}
const KDIR = katexDir();
const katex = require(KDIR);

let page = fs.readFileSync(src, 'utf8');

// ---------- macros ----------
const macros = { '\\T': '\\htmlClass{t-#1}{#2}' };
page = page.replace(/[ \t]*<script type="text\/x-tex-macros">([\s\S]*?)<\/script>\s*/, (all, body) => {
  body.split('\n').map(l => l.trim()).filter(Boolean).forEach(l => {
    const m = l.match(/^(\\[A-Za-z]+)\s*=\s*(.+)$/);
    if (!m) fail(`bad macro line ${JSON.stringify(l)} (want "\\name = body")`);
    macros[m[1]] = m[2];
  });
  return '';
});

// ---------- TeX → KaTeX HTML ----------
const ITALIC_GAP = /(<span class="mord mathnormal") style="margin-right:[\d.]+em;"/g;
const opts = display => ({
  displayMode: display, macros, globalGroup: true, strict: 'ignore', throwOnError: true,
  trust: ({ command }) => command === '\\htmlClass' || command === '\\htmlData'
});
const errors = [];
let count = 0;
page = page.split(/(<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>)/).map((part, i) => i % 2 ? part :
  part.replace(/\\\$|\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (all, d, inl) => {
    if (all === '\\$') return '$';
    const tex = (d || inl).trim();
    try { count++; return katex.renderToString(tex, opts(!!d)).replace(ITALIC_GAP, '$1'); }
    catch (e) { errors.push(`${e.message.replace(/^KaTeX parse error: /, '')}\n      in: ${tex.slice(0, 100)}`); return all; }
  })).join('');
if (errors.length) fail(`${errors.length} TeX error(s):\n  ` + errors.join('\n  '));

// ---------- what the steps config can refer to ----------
const keys = html => [...new Set([...html.matchAll(/class="[^"]*?\bt-([\w-]+)/g)].map(m => m[1]))];
const eqs = [...page.matchAll(/<div[^>]*\bdata-eq="([^"]+)"[^>]*>([\s\S]*?)<\/div>/g)];
const seen = new Set();
eqs.forEach(([, id]) => { if (seen.has(id)) fail(`two equations are both data-eq="${id}"`); seen.add(id); });
const stepIds = [...page.matchAll(/data-step="([^"]+)"/g)].map(m => m[1]);
stepIds.forEach((id, i) => { if (stepIds.indexOf(id) !== i) fail(`two sections are both data-step="${id}"`); });
const boardM = page.match(/<div[^>]*\bdata-board\b[^>]*>([\s\S]*?)<\/div>/);
const rows = boardM ? keys(boardM[1]).filter(k => /^r\d+$/.test(k)).map(k => +k.slice(1)).sort((a, b) => a - b) : [];
const notes = [...page.matchAll(/data-note="([^"]+)"/g)].map(m => m[1]);

// ---------- inline the engine and KaTeX's CSS (fonts as data URIs) ----------
const read = f => fs.readFileSync(path.join(skill, f), 'utf8');
const katexCss = fs.readFileSync(path.join(KDIR, 'dist/katex.min.css'), 'utf8')
  .replace(/src:url\(fonts\/([\w-]+)\.woff2\) format\("woff2"\)[^;}]*/g, (all, name) =>
    `src:url(data:font/woff2;base64,${fs.readFileSync(path.join(KDIR, 'dist/fonts', name + '.woff2')).toString('base64')}) format("woff2")`);
const swaps = [
  [/<link rel="stylesheet" href="katex\.css">/, () => `<style>${katexCss}</style>`],
  [/<link rel="stylesheet" href="tokens\.css">/, () => `<style>\n${read('tokens.css')}</style>`],
  [/<link rel="stylesheet" href="engine\.css">/, () => `<style>\n${read('engine.css')}</style>`],
  [/<script src="engine\.js"><\/script>/, () => `<script>\n${read('engine.js').replace(/<\/script/g, '<\\/script')}</script>`]
];
for (const [re, fn] of swaps) {
  if (!re.test(page)) fail(`${src} has no ${re.source.replace(/\\/g, '')}`);
  page = page.replace(re, fn);
}
fs.writeFileSync(out, page);

const kb = (Buffer.byteLength(page) / 1024).toFixed(0);
console.log(`${out}: ${kb} KB · ${stepIds.length} steps · ${count} formulas · KaTeX ${require(path.join(KDIR, 'package.json')).version}`);
eqs.forEach(([, id, body]) => console.log(`  eq ${id.padEnd(10)} ${keys(body).join(' ') || '(no \\T terms)'}`));
if (boardM) console.log(`  board      ${rows.length ? 'r' + rows.join(' r') : '(no \\T{r<n>} rows)'}`);
if (notes.length) console.log(`  notes      ${notes.map(n => '#' + n).join(' ')}`);
