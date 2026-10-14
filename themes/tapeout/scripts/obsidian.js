'use strict';

// Obsidian 語法支援：[[wikilink]]、![[embed]]、> [!callout]、==highlight==、%%comment%%、#inline-tag
// 建議把 source/ 當成 Obsidian vault，筆記放在 source/_posts/notes/，附件放在 source/attachments/。

const { escapeHTML, slugize, url_for } = require('hexo-util');
const { basename, extname } = require('path');

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp|avif|bmp)$/i;

function notesDir() {
  const cfg = hexo.theme.config.notes || {};
  return String(cfg.dir || 'notes').replace(/^\/+|\/+$/g, '');
}

const norm = s => String(s || '').normalize('NFC').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
const fileTitle = source => basename(String(source || ''), extname(String(source || '')));
const toArray = v => (Array.isArray(v) ? v : v ? [v] : []);

// ── 名稱索引：檔名 / 標題 / aliases → 文章 ──────────────────────
let nameIndex = new Map();
let hiddenIndex = new Map(); // published: false 的文章：[[連結]] 連過去會變成純文字，不會產生壞掉的連結
let assetIndex = new Map();
let lastSignature = null;

const isHidden = doc => doc.published === false && !hexo.config.render_drafts;

function buildIndexes() {
  nameIndex = new Map();
  hiddenIndex = new Map();
  const add = (name, doc) => {
    const key = norm(name);
    const index = isHidden(doc) ? hiddenIndex : nameIndex;
    if (key && !index.has(key)) index.set(key, doc);
  };
  const posts = hexo.model('Post').toArray();
  const pages = hexo.model('Page').toArray();
  // 翻譯版（scripts/i18n.js）排在後面：同名的中英文兩篇，[[連結]] 連到預設語言的那一篇
  const langOf = hexo.extend.helper.get('lang_of');
  const defaultLang = hexo.extend.helper.get('default_lang')();
  const isTranslation = doc => (langOf(doc) === defaultLang ? 0 : 1);
  posts.concat(pages).sort((a, b) => isTranslation(a) - isTranslation(b)).forEach(doc => {
    const file = fileTitle(doc.source);
    add(file === 'index' ? basename(String(doc.source).replace(/\/index\.\w+$/, '')) : file, doc);
    add(doc.source && doc.source.replace(/^_posts\//, '').replace(/\.md$/i, ''), doc);
    if (doc.title) add(doc.title, doc);
    toArray(doc.aliases).forEach(a => add(a, doc));
  });

  assetIndex = new Map();
  hexo.model('Asset').toArray().forEach(a => {
    const key = basename(a.path).toLowerCase();
    if (!assetIndex.has(key)) assetIndex.set(key, a.path);
  });
}

// 新增 / 刪除 / 改名筆記時，舊文章裡的 [[連結]] 需要重新解析，所以讓全部文章重新 render
hexo.extend.filter.register('before_generate', function () {
  const docs = hexo.model('Post').toArray().concat(hexo.model('Page').toArray());
  const signature = docs
    .map(d => d.source + '|' + (isHidden(d) ? 'hidden' : '') + '|' + toArray(d.aliases).join(',') + '|' + (d.title || ''))
    .sort()
    .join('\n');
  const changed = signature !== lastSignature;
  lastSignature = signature;
  buildIndexes();
  if (!changed) return;
  return Promise.all(docs.filter(d => d.content != null).map(d => {
    d.content = undefined; // render_post 只會重新 render content == null 的文章
    return d.save();
  }));
}, 5);

function lookup(index, name) {
  const clean = String(name || '').trim().replace(/\.md$/i, '');
  if (!clean) return null;
  return index.get(norm(clean)) || index.get(norm(basename(clean))) || null;
}
const resolve = name => lookup(nameIndex, name);

function assetUrl(name) {
  const key = basename(String(name).trim()).toLowerCase();
  const path = assetIndex.get(key) || 'attachments/' + String(name).trim();
  return url_for.call(hexo, path); // url_for 已經編碼過，再 encodeURI 一次空白會變成 %2520
}

function tagMarkup(tag) {
  const doc = hexo.model('Tag').findOne({ name: tag });
  const text = escapeHTML('#' + tag);
  return doc
    ? `<a class="inline-tag" href="${url_for.call(hexo, doc.path)}">${text}</a>`
    : `<span class="inline-tag">${text}</span>`;
}

function wikilink(embed, inner) {
  const parts = inner.split(/\\?\|/);
  const target = parts[0].trim();
  const label = parts.slice(1).join('|').trim();
  const hashAt = target.indexOf('#');
  const name = hashAt > -1 ? target.slice(0, hashAt) : target;
  const heading = hashAt > -1 ? target.slice(hashAt + 1).replace(/^\^/, '').trim() : '';

  // 圖片 / 附件嵌入：![[diagram.png|400]]、![[diagram.png|圖說]]
  if (embed && IMAGE_EXT.test(name)) {
    const src = assetUrl(name);
    const size = label.match(/^(\d+)(?:x(\d+))?$/);
    if (size) {
      return `<img src="${src}" alt="${escapeHTML(fileTitle(name))}" width="${size[1]}"${size[2] ? ` height="${size[2]}"` : ''} loading="lazy">`;
    }
    return `![${label.replace(/[[\]]/g, '')}](${src})`;
  }
  if (embed && /\.\w{2,4}$/.test(name) && !/\.md$/i.test(name)) {
    return `<a class="wikilink" href="${assetUrl(name)}">${escapeHTML(label || name)}</a>`;
  }

  const anchor = heading ? '#' + slugize(heading) : '';
  if (!name) {
    return `<a class="wikilink" href="${anchor}">${escapeHTML(label || heading)}</a>`;
  }
  const doc = resolve(name);
  const text = label || (heading ? `${name} › ${heading}` : name);
  if (!doc && lookup(hiddenIndex, name)) return escapeHTML(text);
  if (!doc) {
    return `<span class="wikilink is-missing" data-missing="${escapeHTML(name.trim())}" title="這篇筆記還沒寫">${escapeHTML(text)}</span>`;
  }
  const href = url_for.call(hexo, doc.path) + anchor;
  if (embed) {
    return `<a class="wikilink wikilink-embed" href="${href}"><span>↳</span>${escapeHTML(label || doc.title || name)}</a>`;
  }
  return `<a class="wikilink" href="${href}">${escapeHTML(text)}</a>`;
}

// 程式碼、行內 code、Hexo tag、HTML 註解不處理
const PROTECT = /(<hexoPostRenderCodeBlock>[\s\S]*?<\/hexoPostRenderCodeBlock>|```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]+`|\{%\s*(?:wavedrom|raw|codeblock|code|include_code)\b[\s\S]*?\{%\s*end\w+\s*%\}|\{%[\s\S]*?%\}|<!--[\s\S]*?-->)/;

function transform(text) {
  return text
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/(!?)\[\[([^[\]\n]+?)\]\]/g, (_, bang, inner) => wikilink(bang === '!', inner))
    // Obsidian 的 Markdown 連結：[文字](Other%20Note.md#標題)
    .replace(/\]\(([^)\s]+?\.md)(#[^)\s]*)?\)/gi, (all, file, hash) => {
      let name = file;
      try { name = decodeURI(file); } catch (e) {}
      const doc = resolve(name);
      if (!doc) return all;
      const anchor = hash ? '#' + slugize(decodeURI(hash.slice(1))) : '';
      return `](${url_for.call(hexo, doc.path)}${anchor})`;
    })
    .replace(/==(?=\S)([^=\n]*?\S)==/g, '<mark>$1</mark>')
    .replace(/(^|[\s(（])#([\p{L}\p{N}_/-]*[\p{L}_/-][\p{L}\p{N}_/-]*)/gmu, (all, pre, tag) => {
      if (/^[0-9a-f]{3,8}$/i.test(tag) && /\d/.test(tag)) return all; // 色碼，例如 #ff5418
      return pre + tagMarkup(tag);
    });
}

hexo.extend.filter.register('before_post_render', function (data) {
  if (!data.title && data.source) data.title = fileTitle(data.source);
  if (!data.content) return data;
  data.content = data.content
    .split(PROTECT)
    .map((chunk, i) => (i % 2 ? chunk : transform(chunk)))
    .join('');
  return data;
}, 20);

// ── Callouts：> [!note] 標題 ─────────────────────────────────
const CALLOUT_KIND = {
  note: 'info', info: 'info', todo: 'info', abstract: 'info', summary: 'info', tldr: 'info',
  question: 'info', help: 'info', faq: 'info', example: 'info', quote: 'info', cite: 'info',
  tip: 'tip', hint: 'tip', important: 'tip', success: 'tip', check: 'tip', done: 'tip',
  warning: 'warn', caution: 'warn', attention: 'warn', danger: 'warn', error: 'warn',
  bug: 'warn', failure: 'warn', fail: 'warn', missing: 'warn'
};

function convertCallouts(html) {
  // 標題可以含數學式（math.js 的 <tex-ph> 佔位標籤）
  const OPEN = /<blockquote>\s*<p>\[!([\w-]+)\]([+-]?)[ \t]*((?:[^\n<]|<tex-ph data-i=\d+><\/tex-ph>)*)(?:\n|<br>)?/g;
  let out = '';
  let pos = 0;
  let m;
  while ((m = OPEN.exec(html))) {
    // 找到對應的 </blockquote>（考慮巢狀）
    let depth = 1;
    let i = OPEN.lastIndex;
    const tagRe = /<(\/?)blockquote>/g;
    tagRe.lastIndex = i;
    let t;
    while (depth && (t = tagRe.exec(html))) depth += t[1] ? -1 : 1;
    if (depth) break;
    const closeAt = t.index;
    const type = m[1].toLowerCase();
    const kind = CALLOUT_KIND[type] || 'info';
    const title = m[3].trim() || type.toUpperCase();
    let body = html.slice(OPEN.lastIndex, closeAt).replace(/^\s*<\/p>/, '');
    if (!/^\s*</.test(body) || /^\s*<(a|code|strong|em|mark|span|tex-ph)\b/.test(body)) body = '<p>' + body;
    const cls = `note note-${kind} callout callout-${type}`;
    const block = m[2]
      ? `<details class="${cls}"${m[2] === '+' ? ' open' : ''}><summary class="note-title">${title}</summary>${body}</details>`
      : `<aside class="${cls}"><div class="note-title">${title}</div>${body}</aside>`;
    out += html.slice(pos, m.index) + block;
    pos = closeAt + '</blockquote>'.length;
    OPEN.lastIndex = pos;
  }
  return out + html.slice(pos);
}

hexo.extend.filter.register('after_post_render', function (data) {
  if (data.content && data.content.indexOf('[!') > -1) {
    data.content = convertCallouts(data.content).replace(/<p>\s*<\/p>/g, '');
  }
  return data;
});

// 檔名有空白的筆記，網址改成用 - 連接；筆記資料夾內的網址統一小寫
hexo.extend.filter.register('post_permalink', function (permalink) {
  if (typeof permalink !== 'string') return permalink;
  let p = permalink.replace(/\s+/g, '-');
  const dir = notesDir() + '/';
  if (p.replace(/^\//, '').startsWith(dir)) p = p.toLowerCase();
  return p;
}, 20);
