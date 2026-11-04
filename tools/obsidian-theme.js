#!/usr/bin/env node
'use strict';

// 把部落格的 tapeout 主題做成 Obsidian 主題「Tapeout」，安裝到 vault。
//
//   npm run obsidian-theme                    產生並安裝到 <vault>/.obsidian/themes/Tapeout/
//   npm run obsidian-theme -- --out <資料夾>   改寫到別的資料夾（只看產生的 CSS，不動 vault）
//
// 配色和字型都從部落格讀，改了部落格之後重跑一次 Obsidian 就跟著變：
//   - themes/tapeout/source/css/style.css 的 :root tokens、深色模式、每個 data-scheme 配色
//   - themes/tapeout/_config.yml（和 _config.tapeout.yml）的 fonts.google
// Obsidian 這一側的對應寫在 tools/obsidian-theme.css。
// 配色、標題編號、點狀網格、callout 圖示可以在 Obsidian 的 Style Settings 外掛裡切換。

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const NAME = 'Tapeout';
const STYLE = path.join(ROOT, 'themes/tapeout/source/css/style.css');
const TEMPLATE = path.join(__dirname, 'obsidian-theme.css');
// Obsidian 這邊用得到的 tokens；其他（尺寸、陰影、波形）留在部落格
const TOKENS = [
  'bg', 'bg-2', 'surface', 'ink', 'ink-2', 'ink-3', 'line', 'line-2', 'grid-dot',
  'accent', 'accent-ink', 'accent-soft', 'ok', 'code-bg', 'code-line', 'code-ink',
  'node-post', 'node-note', 'node-project'
];
const FONTS = ['font-sans', 'font-mono', 'font-serif'];

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

function readYaml(file) {
  try { return yaml.load(fs.readFileSync(path.join(ROOT, file), 'utf8')) || {}; } catch (e) { return {}; }
}

// ── 讀 style.css ─────────────────────────────────────────────

const css = fs.readFileSync(STYLE, 'utf8');

// 頂層（行首）的 selector { … } 區塊；@media 裡縮排的那份是同樣的值，不用讀
function block(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('^' + esc + '\\s*\\{([\\s\\S]*?)^\\}', 'm').exec(css);
  return m ? decls(m[1]) : null;
}

function decls(body) {
  const out = {};
  const re = /--([\w-]+)\s*:\s*([^;]+);/g;
  let m;
  while ((m = re.exec(body))) out[m[1]] = m[2].trim();
  return out;
}

const base = block(':root');
const baseDark = block(':root[data-theme="dark"]');
if (!base || !baseDark) fail('style.css 裡找不到 :root 或 :root[data-theme="dark"] 的 tokens');

// 配色的名字和說明：html[data-scheme="x"] 前一行的 /* Name — 說明 */
const schemes = [{ id: 'tapeout', label: 'Tapeout — datasheet paper / logic analyzer', light: {}, dark: {} }];
const schemeRe = /(?:\/\*\s*([^*\n]+?)\s*\*\/\s*\n)?^html\[data-scheme="([\w-]+)"\]\s*\{/gm;
let sm;
while ((sm = schemeRe.exec(css))) {
  const id = sm[2];
  const light = block(`html[data-scheme="${id}"]`);
  const dark = block(`:root[data-scheme="${id}"][data-theme="dark"]`);
  if (!light || !dark) { console.warn(`! 略過配色 ${id}：缺淺色或深色的區塊`); continue; }
  schemes.push({ id, label: sm[1] || id, light, dark });
}

// 跟瀏覽器的層疊順序一樣：:root (0,1,0) < html[data-scheme] (0,1,1) < [data-theme=dark] (0,2,0) < 配色的深色 (0,3,0)
function palette(s, mode) {
  const all = mode === 'light'
    ? Object.assign({}, base, s.light)
    : Object.assign({}, base, s.light, baseDark, s.dark);
  const missing = TOKENS.filter(t => !all[t]);
  if (missing.length) fail(`配色 ${s.id}（${mode}）少了 ${missing.join(', ')}`);
  const lines = TOKENS.map(t => `  --tp-${t}: ${all[t]};`);
  const hsl = hexToHsl(all.accent);
  // Obsidian 有些地方直接用 --accent-h/s/l 算顏色
  if (hsl) lines.push(`  --accent-h: ${hsl[0]};`, `  --accent-s: ${hsl[1]}%;`, `  --accent-l: ${hsl[2]}%;`);
  return lines.join('\n');
}

function hexToHsl(hex) {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(hex).trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.replace(/./g, c => c + c);
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let hue = 0;
  let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
  }
  return [Math.round(hue), Math.round(sat * 1000) / 10, Math.round(l * 1000) / 10];
}

// ── 組出 theme.css ───────────────────────────────────────────

const themeCfg = readYaml('themes/tapeout/_config.yml');
const siteCfg = readYaml('_config.tapeout.yml');
const fontUrl = Object.assign({}, themeCfg.fonts, siteCfg.fonts).google;

const settings = [
  '/* @settings',
  'name: Tapeout',
  'id: tapeout',
  'settings:',
  '  -',
  '    id: tp-scheme',
  '    title: Color scheme',
  '    description: The palettes from the blog (themes/tapeout/source/css/style.css). Light / dark follows Obsidian.',
  '    type: class-select',
  '    allowEmpty: false',
  '    default: tp-scheme-tapeout',
  '    options:',
  ...schemes.flatMap(s => ['      -', `        label: ${JSON.stringify(s.label)}`, `        value: tp-scheme-${s.id}`]),
  '  -',
  '    id: tp-heading-numbers',
  '    title: Number headings (§01, 1.2)',
  '    description: Reading view and PDF export. Long notes render in chunks, so numbers can skip until you have scrolled through the note.',
  '    type: class-toggle',
  '  -',
  '    id: tp-no-grid',
  '    title: Hide the dot grid',
  '    type: class-toggle',
  '  -',
  '    id: tp-callout-icons',
  '    title: Show callout icons',
  '    type: class-toggle',
  '*/'
].join('\n');

const tokens = schemes.map(s => {
  const sel = s.id === 'tapeout' ? '' : `.tp-scheme-${s.id}`;
  return `body.theme-light${sel} {\n${palette(s, 'light')}\n}\nbody.theme-dark${sel} {\n${palette(s, 'dark')}\n}`;
}).join('\n');

const fonts = 'body {\n' + FONTS.map(f => base[f] && `  --tp-${f}: ${base[f]};`).filter(Boolean).join('\n') + '\n}';

const out = [
  `/* ${NAME} — Hank 部落格（themes/tapeout）的 Obsidian 版。`,
  `   由 tools/obsidian-theme.js 產生，請改部落格的 style.css 或 tools/obsidian-theme.css 後重跑 npm run obsidian-theme。 */`,
  fontUrl ? `@import url("${fontUrl}");` : '',
  '',
  settings,
  '',
  '/* ---------- 00. Tokens（從 style.css 產生） ---------- */',
  tokens,
  fonts,
  '',
  fs.readFileSync(TEMPLATE, 'utf8')
].join('\n');

const manifest = {
  name: NAME,
  version: '1.0.0',
  minAppVersion: '1.5.0',
  author: 'Hank',
  authorUrl: 'https://hanksome1.github.io'
};

// ── 寫出去 ───────────────────────────────────────────────────

const args = process.argv.slice(2);
const outArg = args.indexOf('--out') > -1 ? args[args.indexOf('--out') + 1] : null;
let dest;
if (outArg) {
  dest = path.resolve(outArg);
} else {
  const cfg = readYaml('_config.yml').obsidian_sync || {};
  const vault = process.env.OBSIDIAN_VAULT || cfg.vault;
  if (!vault) fail('請在 _config.yml 設定 obsidian_sync.vault，或用 --out 指定資料夾');
  const VAULT = path.resolve(String(vault).replace(/^~(?=\/|$)/, os.homedir()));
  if (!fs.existsSync(path.join(VAULT, '.obsidian'))) fail(`找不到 vault：${VAULT}`);
  dest = path.join(VAULT, '.obsidian/themes', NAME);
}

fs.mkdirSync(dest, { recursive: true });
fs.writeFileSync(path.join(dest, 'theme.css'), out);
fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`✓ ${NAME}（${schemes.map(s => s.id).join(', ')}）→ ${dest}`);
if (!outArg) console.log('  Obsidian：設定 → 外觀 → 主題 選 Tapeout；配色在 Style Settings → Tapeout');
