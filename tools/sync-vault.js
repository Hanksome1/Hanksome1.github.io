#!/usr/bin/env node
'use strict';

// Obsidian vault → Hexo 單向同步。vault 是唯一的真實來源，這裡產生的檔案每次都會被覆蓋。
//
//   npm run sync                       同步 front-matter 有 publish: true 的筆記
//   npm run sync -- --dry-run          只列出會做什麼，不寫檔
//   npm run sync -- "Some Note.md"     額外把指定筆記當成已發佈（測試用，不用改 vault；下次同步沒指定就會移除）
//
// 設定在 _config.yml 的 obsidian_sync。repo 是公開的，所以寫出去之前會：
//   - front-matter 只留白名單欄位（title、date、tags、aliases、summary…）
//   - 拿掉 %%註解%%、dataview / tasks 查詢區塊
//   - 連到「存在但沒發佈」的筆記改成純文字，不洩漏、也不會被畫成「還沒寫」的虛線
//   - 只複製有被引用的附件；Excalidraw 圖改用外掛自動匯出的 .svg

const fs = require('fs');
const path = require('path');
const os = require('os');
const yaml = require('js-yaml');

const ROOT = path.resolve(__dirname, '..');
const MARK = 'obsidian'; // 產生的筆記 front-matter 會有 synced: obsidian，只有這些會被自動刪除
const HEADER = '# 由 tools/sync-vault.js 從 Obsidian vault 產生，請到 vault 修改原始筆記\n';
const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;
const QUERY_LANGS = /^(dataview|dataviewjs|tasks|query)$/i;

// ── 設定與參數 ───────────────────────────────────────────────

function readYaml(file) {
  try { return yaml.load(fs.readFileSync(path.join(ROOT, file), 'utf8')) || {}; } catch (e) { return {}; }
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const vaultArg = args.indexOf('--vault') > -1 ? args[args.indexOf('--vault') + 1] : null;
const extras = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--vault');

const cfg = Object.assign({
  vault: '',
  flag: 'publish',
  ignore: ['.obsidian', '.trash', 'Template'],
  private_links: 'text'
}, readYaml('_config.yml').obsidian_sync);
const notesDir = String((readYaml('_config.tapeout.yml').notes || {}).dir || 'notes').replace(/^\/+|\/+$/g, '');

const VAULT = path.resolve(String(vaultArg || process.env.OBSIDIAN_VAULT || cfg.vault).replace(/^~(?=\/|$)/, os.homedir()));
const OUT_NOTES = path.join(ROOT, 'source/_posts', notesDir);
const OUT_ASSETS = path.join(ROOT, 'source/attachments/vault');
const FLAGS = [].concat(cfg.flag);

if (!cfg.vault && !vaultArg && !process.env.OBSIDIAN_VAULT) fail('請在 _config.yml 設定 obsidian_sync.vault');
if (!fs.existsSync(VAULT)) fail(`找不到 vault：${VAULT}`);

function fail(msg) {
  console.error('✗ ' + msg);
  process.exit(1);
}

// ── 掃描 vault ───────────────────────────────────────────────

const lower = s => String(s).normalize('NFC').toLowerCase();
const ignored = new Set([].concat(cfg.ignore || []).map(p => lower(String(p).replace(/^\/+|\/+$/g, ''))));

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const abs = path.join(dir, ent.name);
    const rel = path.relative(VAULT, abs).split(path.sep).join('/');
    if (ignored.has(lower(rel))) continue;
    if (ent.isDirectory()) walk(abs, out);
    else if (ent.isFile()) out.push(rel);
  }
  return out;
}

function splitFrontMatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { data: {}, body: text };
  let data = {};
  // CORE_SCHEMA：日期保持字串，交給 Hexo 用網站時區解析
  try { data = yaml.load(m[1], { schema: yaml.CORE_SCHEMA }) || {}; } catch (e) { data = { __error: e.message }; }
  return { data: typeof data === 'object' ? data : {}, body: text.slice(m[0].length) };
}

const files = walk(VAULT);
const byName = new Map(); // 小寫檔名（md 不含副檔名、附件含副檔名）→ [相對路徑]
files.forEach(rel => {
  const base = path.posix.basename(rel);
  const key = lower(/\.md$/i.test(base) ? base.slice(0, -3) : base);
  if (!byName.has(key)) byName.set(key, []);
  byName.get(key).push(rel);
});

const notes = new Map(); // 相對路徑 → { data, body, stat }
function loadNote(rel) {
  if (!notes.has(rel)) {
    const abs = path.join(VAULT, rel);
    notes.set(rel, Object.assign(splitFrontMatter(fs.readFileSync(abs, 'utf8')), { stat: fs.statSync(abs) }));
  }
  return notes.get(rel);
}

const isExcalidraw = rel => /\.excalidraw\.md$/i.test(rel) || 'excalidraw-plugin' in loadNote(rel).data;
const truthy = v => v === true || /^(true|yes)$/i.test(String(v));

// 跟 Obsidian 一樣用檔名找筆記；同名時優先選路徑相符、再選路徑最短的
function find(target, isNote) {
  const clean = String(target).trim().replace(/^\.?\//, '');
  const key = lower(path.posix.basename(isNote ? clean.replace(/\.md$/i, '') : clean));
  const hits = (byName.get(key) || []).filter(rel => isNote ? /\.md$/i.test(rel) : !/\.md$/i.test(rel));
  if (!hits.length) return null;
  const want = lower(isNote ? clean.replace(/\.md$/i, '') + '.md' : clean);
  return hits.find(rel => lower(rel) === want || lower(rel).endsWith('/' + want))
    || hits.slice().sort((a, b) => a.length - b.length)[0];
}

// ── 要發佈哪些筆記 ───────────────────────────────────────────

const published = new Map(); // 相對路徑 → 輸出檔名
const problems = [];
files.filter(rel => /\.md$/i.test(rel)).forEach(rel => {
  const { data } = loadNote(rel);
  if (FLAGS.some(f => truthy(data[f])) && !isExcalidraw(rel)) published.set(rel, null);
});
extras.forEach(arg => {
  const rel = path.isAbsolute(arg) ? path.relative(VAULT, arg).split(path.sep).join('/') : find(arg, true) || arg;
  if (!fs.existsSync(path.join(VAULT, rel))) problems.push(`找不到筆記：${arg}`);
  else published.set(rel, null);
});

const outNames = new Map();
for (const rel of published.keys()) {
  const name = path.posix.basename(rel);
  if (outNames.has(lower(name))) {
    problems.push(`檔名重複，跳過 ${rel}（已有 ${outNames.get(lower(name))}）`);
    published.delete(rel);
    continue;
  }
  outNames.set(lower(name), rel);
  published.set(rel, name);
}

// ── 轉換內文 ─────────────────────────────────────────────────

const assets = new Map(); // vault 相對路徑 → 輸出檔名
function useAsset(rel) {
  const name = path.posix.basename(rel);
  assets.set(rel, name);
  return name;
}

// 程式碼與 $$ 區塊不處理
const PROTECT = /(^([ \t]*)(`{3,}|~{3,})[^\n]*\n[\s\S]*?\n\2\3[ \t]*$|`[^`\n]+`|\$\$[\s\S]+?\$\$)/m;

function transform(rel, body, title, report) {
  const linkText = (name, heading, label) => label || (heading ? `${name} › ${heading}` : name);

  function wikilink(all, bang, inner) {
    const embed = bang === '!';
    const parts = inner.split(/\\?\|/);
    const target = parts[0].trim();
    const label = parts.slice(1).join('|').trim();
    const sep = label ? (inner.includes('\\|') ? '\\|' : '|') : '';
    const hashAt = target.indexOf('#');
    const name = hashAt > -1 ? target.slice(0, hashAt).trim() : target;
    const heading = hashAt > -1 ? target.slice(hashAt + 1) : '';
    if (!name) return all; // [[#標題]]：同一頁的錨點

    // 附件：png / svg / pdf…
    if (/\.\w{2,5}$/.test(name) && !/\.md$/i.test(name)) {
      const hit = find(name, false);
      if (!hit) { report.missingAssets.add(name); return all; }
      return `${bang}[[${useAsset(hit)}${sep}${label}]]`;
    }

    const hit = find(name, true);
    if (!hit) return all; // 還沒寫的筆記：交給佈景主題畫成虛線

    if (isExcalidraw(hit)) {
      const svg = find(hit.replace(/(\.excalidraw)?\.md$/i, '.svg'), false)
        || find(hit.replace(/\.md$/i, '.png'), false);
      if (svg) return `${embed ? '!' : ''}[[${useAsset(svg)}${sep}${label}]]`;
      report.notes.push(`Excalidraw「${name}」沒有匯出的 .svg / .png，已略過（外掛設定開 Auto-export SVG）`);
      return '';
    }

    if (published.has(hit)) {
      const out = published.get(hit).replace(/\.md$/i, '');
      return `${bang}[[${out}${heading ? '#' + heading : ''}${sep}${label}]]`;
    }

    report.privateLinks.add(name);
    if (embed) return '';
    return cfg.private_links === 'ghost' ? all : linkText(name, heading, label);
  }

  function mdLink(all, bang, text, url) {
    if (/^[a-z][\w+.-]*:|^#|^\//i.test(url)) return all;
    let file = url.split('#')[0];
    try { file = decodeURI(file); } catch (e) {}
    if (/\.md$/i.test(file)) {
      const hit = find(file, true);
      if (!hit || published.has(hit)) return all;
      report.privateLinks.add(path.posix.basename(file, '.md'));
      return bang ? '' : text;
    }
    const hit = find(file, false);
    if (!hit) { report.missingAssets.add(file); return all; }
    return `${bang}[${text}](/attachments/vault/${encodeURI(useAsset(hit))})`;
  }

  function plain(chunk) {
    return chunk
      .replace(/%%[\s\S]*?%%/g, '')
      .replace(/(!?)\[\[([^[\]\n]+?)\]\]/g, wikilink)
      .replace(/(!?)\[([^\]\n]*)\]\(<?([^)<>\n]+?)>?\)/g, mdLink)
      .replace(/[ \t]+\^[A-Za-z0-9-]+[ \t]*$/gm, ''); // 區塊 ID：段落 ^abc123
  }

  const chunks = body.split(PROTECT);
  let out = '';
  // split 帶 3 個捕獲群組：[文字, 整段, 縮排, 圍欄, 文字, …]
  for (let i = 0; i < chunks.length; i += 4) {
    out += plain(chunks[i]);
    const block = chunks[i + 1];
    if (block === undefined) continue;
    const lang = /^[ \t]*(?:`{3,}|~{3,})\s*([\w-]*)/.exec(block);
    if (lang && QUERY_LANGS.test(lang[1])) {
      report.notes.push(`拿掉了 ${lang[1]} 查詢區塊（網站是靜態的，沒辦法執行）`);
      continue;
    }
    out += block;
  }

  // 開頭的 # 標題跟頁面標題一樣就拿掉，避免重複
  out = out.replace(/^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*\r?\n/, (all, h) => (lower(h.trim()) === lower(title) ? '' : all));
  return out.replace(/^\s*\n/, '').replace(/\s+$/, '\n');
}

// ── front-matter ─────────────────────────────────────────────

const pad = n => String(n).padStart(2, '0');
const localTime = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const list = v => [].concat(v == null ? [] : v).map(x => String(x).replace(/^#/, '').trim()).filter(Boolean);
const pick = (data, ...keys) => keys.map(k => data[k]).find(v => v != null && String(v).trim() !== '');

function slugOf(s) {
  return lower(s).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
}

function frontMatter(rel, note) {
  const d = note.data;
  const title = String(pick(d, 'title') || path.posix.basename(rel, '.md'));
  const fm = {
    title,
    date: String(pick(d, 'date', 'Date', 'created', 'Created') || localTime(note.stat.birthtime)),
    // 用 vault 的修改時間；CI checkout 會把檔案 mtime 全部重設，所以要寫死
    updated: String(pick(d, 'updated', 'modified') || localTime(note.stat.mtime)),
    tags: list(d.tags),
    aliases: list(d.aliases),
    summary: pick(d, 'summary', 'Summary', 'description')
  };
  // 網址：/notes/<slug>/，可以在 vault 用 slug: 自訂；檔名的 & % ' 等符號不會進網址
  fm.permalink = `${notesDir}/${slugOf(pick(d, 'slug') || path.posix.basename(rel, '.md'))}/`;
  ['math', 'toc'].forEach(k => { if (d[k] != null) fm[k] = d[k]; });
  fm.synced = MARK;
  Object.keys(fm).forEach(k => {
    if (fm[k] == null || (Array.isArray(fm[k]) && !fm[k].length)) delete fm[k];
  });
  return fm;
}

// ── 寫檔 ─────────────────────────────────────────────────────

function writeIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  if (!dryRun) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return true;
}

const results = [];
const handWritten = new Set();
const existing = fs.existsSync(OUT_NOTES) ? fs.readdirSync(OUT_NOTES).filter(f => /\.md$/i.test(f)) : [];
existing.forEach(f => {
  const { data } = splitFrontMatter(fs.readFileSync(path.join(OUT_NOTES, f), 'utf8'));
  if (data.synced !== MARK) handWritten.add(lower(f));
});

for (const [rel, outName] of published) {
  if (handWritten.has(lower(outName))) {
    problems.push(`${outName} 已經是手寫的筆記，跳過（改 vault 檔名或把手寫的那篇刪掉）`);
    continue;
  }
  const note = loadNote(rel);
  if (note.data.__error) problems.push(`${rel} 的 front-matter 不是合法 YAML：${note.data.__error}`);
  const report = { privateLinks: new Set(), missingAssets: new Set(), notes: [] };
  const fm = frontMatter(rel, note);
  const body = transform(rel, note.body, fm.title, report);
  const text = '---\n' + HEADER + yaml.dump(fm, { lineWidth: -1 }) + '---\n\n' + body;
  const changed = writeIfChanged(path.join(OUT_NOTES, outName), text);
  results.push({ rel, outName, url: '/' + fm.permalink, changed, report });
}

// 已經取消發佈（或改名）的筆記
const removed = existing.filter(f => !handWritten.has(lower(f)) && !outNames.has(lower(f)));
removed.forEach(f => { if (!dryRun) fs.unlinkSync(path.join(OUT_NOTES, f)); });

// 附件：整個資料夾都歸同步管，沒被引用的就刪掉
const keepAssets = new Set(assets.values());
const oldAssets = fs.existsSync(OUT_ASSETS) ? fs.readdirSync(OUT_ASSETS) : [];
const staleAssets = oldAssets.filter(f => !keepAssets.has(f));
let copied = 0;
for (const [rel, name] of assets) {
  const src = path.join(VAULT, rel);
  const dst = path.join(OUT_ASSETS, name);
  const same = fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size
    && fs.readFileSync(dst).equals(fs.readFileSync(src));
  if (same) continue;
  copied++;
  if (!dryRun) {
    fs.mkdirSync(OUT_ASSETS, { recursive: true });
    fs.copyFileSync(src, dst);
  }
}
staleAssets.forEach(f => { if (!dryRun) fs.unlinkSync(path.join(OUT_ASSETS, f)); });

// ── 報告 ─────────────────────────────────────────────────────

const home = s => s.replace(os.homedir(), '~');
console.log(`Obsidian → Hexo${dryRun ? '（dry run，沒有寫檔）' : ''}`);
console.log(`  vault  ${home(VAULT)}（${files.filter(f => /\.md$/i.test(f)).length} 篇筆記）`);
console.log(`  發佈   ${results.length} 篇，更新 ${results.filter(r => r.changed).length} 篇，移除 ${removed.length} 篇`);
console.log(`  附件   ${assets.size} 個，複製 ${copied} 個，移除 ${staleAssets.length} 個`);
results.forEach(r => {
  console.log(`\n${r.changed ? '●' : '○'} ${r.rel}  →  ${r.url}`);
  const { privateLinks, missingAssets, notes: msgs } = r.report;
  if (privateLinks.size) {
    console.log(`  ${privateLinks.size} 個連結指向沒發佈的筆記（${cfg.private_links === 'ghost' ? '保留成虛線' : '改成純文字'}）：`);
    console.log('    ' + Array.from(privateLinks).join('、'));
  }
  if (missingAssets.size) console.log('  找不到附件：' + Array.from(missingAssets).join('、'));
  Array.from(new Set(msgs)).forEach(m => console.log('  ' + m));
});
removed.forEach(f => console.log(`\n✕ ${f}（已取消發佈）`));
if (problems.length) {
  console.log('');
  problems.forEach(p => console.log('⚠ ' + p));
}
