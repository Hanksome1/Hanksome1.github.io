'use strict';

// 從所有文章 render 後的 HTML 擷取站內連結，建立「知識圖譜」：
// 節點 = 專案 / 文章 / 筆記 / 尚未撰寫的 [[連結]]，邊 = 站內連結。

const { url_for, stripHTML, escapeHTML, unescapeHTML } = require('hexo-util');

const kindOf = post => hexo.extend.helper.get('post_kind').call(hexo, post);
const langOf = post => hexo.extend.helper.get('lang_of')(post);
const baseOf = post => hexo.extend.helper.get('lang_base_key')(post);

function keyOf(path) {
  let s = String(path || '');
  try { s = decodeURI(s); } catch (e) {}
  s = s.replace(/^\/+/, '').replace(/index\.html$/, '');
  if (s && !s.endsWith('/') && !/\.[a-z0-9]+$/i.test(s)) s += '/';
  return s;
}

function hrefKey(href) {
  const root = hexo.config.root || '/';
  const site = String(hexo.config.url || '').replace(/\/+$/, '');
  if (!href || href[0] === '#' || /^(mailto|tel|javascript|data):/i.test(href)) return null;
  if (/^(https?:)?\/\//i.test(href)) {
    if (!site || !href.startsWith(site)) return null;
    href = href.slice(site.length) || '/';
  }
  href = href.split('#')[0].split('?')[0];
  if (!href.startsWith('/')) return null;
  if (root !== '/' && href.startsWith(root)) href = '/' + href.slice(root.length);
  return keyOf(href);
}

// ── 連結附近的文字 ──────────────────────────────────────────
// KaTeX 輸出同時有 MathML（含 TeX 原始碼）和畫面上的字形，直接 stripHTML 會兩份都留下。
// 改用 MathML 轉成一行純文字：a/b、x²、xᵢ、√2、X̂；表格（align、cases、矩陣）每列以 ; 分隔。

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' };
const decodeEntities = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
  if (e[0] !== '#') return ENTITIES[e] || all;
  return String.fromCodePoint(/x/i.test(e[1]) ? parseInt(e.slice(2), 16) : +e.slice(1));
});

const SUP = Object.fromEntries([...'0123456789+-−=()ni'].map((c, i) => [c, '⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁻⁼⁽⁾ⁿⁱ'[i]]));
const SUB = Object.fromEntries([...'0123456789+-−=()aehijklmnoprstuvx'].map((c, i) => [c, '₀₁₂₃₄₅₆₇₈₉₊₋₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ'[i]]));
// \hat \tilde \bar \dot \ddot \vec \overline → 組合用附加符號
const ACCENTS = { '^': '̂', '~': '̃', 'ˉ': '̄', '‾': '̅', '˙': '̇', '¨': '̈', '⃗': '⃗' };

// 多個字的分子、根號內容加括號：(a+b)/c
const group = s => (/^[\p{L}\p{M}\p{N}.]*$/u.test(s) ? s : `(${s})`);
// 上下標：能用 Unicode 上下標字元就用，否則寫成 ^N、_(n=0)
function script(s, map, mark) {
  if (/^[′″‴]+$/.test(s)) return s;
  const chars = [...s];
  if (chars.length && chars.every(c => map[c])) return chars.map(c => map[c]).join('');
  return mark + (chars.length === 1 ? s : `(${s})`);
}

function mathTree(xml) {
  const root = { tag: '', attrs: '', kids: [] };
  const stack = [root];
  const re = /<(\/?)([\w-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m;
  while ((m = re.exec(xml))) {
    const top = stack[stack.length - 1];
    if (m[5]) top.kids.push(decodeEntities(m[5]));
    else if (m[1]) { if (stack.length > 1) stack.pop(); }
    else {
      const el = { tag: m[2], attrs: m[3], kids: [] };
      top.kids.push(el);
      if (!m[4]) stack.push(el);
    }
  }
  return root;
}

function linear(n) {
  if (typeof n === 'string') return n.replace(/[​⁡-⁤]/g, '');
  if (n.tag === 'annotation' || n.tag === 'mphantom') return '';
  if (n.tag === 'mspace') return ' ';
  const k = n.kids.map(linear);
  switch (n.tag) {
    case 'mfrac':
      // \binom 是線寬 0 的 mfrac，外層括號另外有
      return /linethickness="0/.test(n.attrs) ? `${k[0]} ${k[1]}` : `${group(k[0])}/${group(k[1])}`;
    case 'msqrt': return '√' + group(k.join(''));
    case 'mroot': return script(k[1], SUP, '') + '√' + group(k[0]);
    case 'msup': return k[0] + script(k[1], SUP, '^');
    case 'msub': case 'munder': return k[0] + script(k[1], SUB, '_');
    case 'msubsup': case 'munderover': return k[0] + script(k[1], SUB, '_') + script(k[2], SUP, '^');
    case 'mover':
      if (/accent="true"/.test(n.attrs) && ACCENTS[k[1]]) return k[0] + ACCENTS[k[1]];
      return k[0] + script(k[1], SUP, '^');
    case 'mtd': return k.join('').trim();
    case 'mtr': case 'mlabeledtr': return k.filter(Boolean).join(' ');
    case 'mtable': return k.filter(Boolean).join('; ');
    default: return k.join('');
  }
}

// 把 html 裡每個 <span class="katex">…</span> 換成 MathML 的純文字；被切掉一半的式子整段捨棄
function flattenMath(html) {
  let out = '';
  let pos = 0;
  let at;
  while ((at = html.indexOf('<span class="katex">', pos)) > -1) {
    const tags = /<(\/?)span\b[^>]*>/g;
    tags.lastIndex = at;
    let depth = 0;
    let t;
    while ((t = tags.exec(html))) if (!(depth += t[1] ? -1 : 1)) break;
    if (!t) return out + html.slice(pos, at);
    const mathml = /<math[\s\S]*?<\/math>/.exec(html.slice(at, tags.lastIndex));
    let text = mathml ? escapeHTML(linear(mathTree(mathml[0])).trim()) : '';
    // 區塊式子前後是別的段落，補空白才不會跟前後文字黏在一起
    if (mathml && /^<math[^>]*display="block"/.test(mathml[0])) text = ` ${text} `;
    out += html.slice(pos, at) + text;
    pos = tags.lastIndex;
  }
  return out + html.slice(pos);
}

function contextAround(html, idx) {
  const start = Math.max(html.lastIndexOf('<p>', idx), html.lastIndexOf('<li', idx), html.lastIndexOf('<td', idx), 0);
  const ends = ['</p>', '</li>', '</td>'].map(t => html.indexOf(t, idx)).filter(i => i > -1);
  const end = ends.length ? Math.min.apply(null, ends) : idx + 400;
  // 樣板輸出時會再 escape 一次，這裡要還原成純文字
  const clean = s => decodeEntities(stripHTML(flattenMath(s))).replace(/\s+/g, ' ');
  let before = clean(html.slice(start, idx)).trimStart();
  let after = clean(html.slice(idx, end)).trimEnd();
  if (before.length > 60) before = '…' + before.slice(-60);
  if (after.length > 110) after = after.slice(0, 110) + '…';
  return before + after;
}

function buildGraph() {
  const posts = hexo.locals.get('posts').sort('-date').toArray();
  // 同一篇文章有哪些語言版本（scripts/i18n.js）
  const langsOf = new Map();
  posts.forEach(p => {
    const base = baseOf(p);
    if (!langsOf.has(base)) langsOf.set(base, new Set());
    langsOf.get(base).add(langOf(p));
  });
  const nodes = new Map();
  posts.forEach(p => {
    nodes.set(keyOf(p.path), {
      title: p.title,
      kind: kindOf(p),
      url: url_for.call(hexo, p.path),
      tags: p.tags ? p.tags.map(t => t.name) : [],
      lang: langOf(p),
      langs: langsOf.get(baseOf(p))
    });
  });

  const edges = [];
  const undirected = new Set();
  const backlinks = new Map();
  const link = (from, to) => {
    const id = from < to ? from + '\n' + to : to + '\n' + from;
    if (undirected.has(id)) return;
    undirected.add(id);
    edges.push([from, to]);
  };

  posts.forEach(p => {
    const from = keyOf(p.path);
    const html = p.content || '';
    const reA = /<a\s[^>]*?href="([^"]*)"[^>]*>/gi;
    let m;
    while ((m = reA.exec(html))) {
      const to = hrefKey(m[1]);
      if (!to || to === from || !nodes.has(to)) continue;
      if (!backlinks.has(to)) backlinks.set(to, new Map());
      const bl = backlinks.get(to);
      if (!bl.has(from)) bl.set(from, contextAround(html, m.index));
      link(from, to);
    }
    const reMissing = /data-missing="([^"]+)"/g;
    while ((m = reMissing.exec(html))) {
      const name = unescapeHTML(m[1]);
      const key = 'ghost:' + name.toLowerCase();
      if (!nodes.has(key)) nodes.set(key, { title: name, kind: 'ghost', url: null, tags: [] });
      link(from, key);
    }
  });

  return { nodes, edges, backlinks };
}

hexo.locals.set('graph', buildGraph);

// ── Helpers ─────────────────────────────────────────────────

// 某個語言的圖譜看得到哪些節點：這個語言的頁面，加上沒有這個語言版本的頁面（例如只有中文的筆記），
// 這樣中文頁和英文頁的同一個專案不會同時出現
const visibleIn = (graph, lang) => key => {
  const n = graph.nodes.get(key);
  return n.kind === 'ghost' || n.lang === lang || !n.langs.has(lang);
};

// 連結數只算這個語言看得到的邊
function degreesIn(graph, visible) {
  const deg = new Map();
  graph.edges.forEach(([a, b]) => {
    if (!visible(a) || !visible(b)) return;
    deg.set(a, (deg.get(a) || 0) + 1);
    deg.set(b, (deg.get(b) || 0) + 1);
  });
  return deg;
}

function pack(graph, keys, levels, site, deg) {
  const index = new Map(keys.map((k, i) => [k, i]));
  const tags = {};
  const out = {
    nodes: keys.map(k => {
      const n = graph.nodes.get(k);
      n.tags.forEach(t => { tags[t] = true; });
      const o = { t: n.title, k: n.kind, u: n.url, d: deg.get(k) || 0 };
      if (n.tags.length) o.g = n.tags;
      if (levels && levels.get(k)) o.l = levels.get(k);
      return o;
    }),
    links: graph.edges
      .filter(e => index.has(e[0]) && index.has(e[1]))
      .map(e => [index.get(e[0]), index.get(e[1])]),
    tags: {}
  };
  site.tags.forEach(t => { if (tags[t.name]) out.tags[t.name] = url_for.call(hexo, t.path); });
  return out;
}

function neighborhood(graph, focus, depth, visible) {
  const adj = new Map();
  graph.edges.forEach(([a, b]) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  });
  const levels = new Map([[focus, 0]]);
  let frontier = [focus];
  for (let d = 1; d <= depth; d++) {
    const next = [];
    frontier.forEach(k => (adj.get(k) || []).forEach(n => {
      if (!levels.has(n) && visible(n)) { levels.set(n, d); next.push(n); }
    }));
    frontier = next;
  }
  return levels;
}

const safeJSON = obj => JSON.stringify(obj).replace(/</g, '\\u003c');

// graph_data() → 整個網站；graph_data(page, 2) → 以 page 為中心、深度 2 的局部圖
hexo.extend.helper.register('graph_data', function (page, depth) {
  const graph = this.site.graph;
  const visible = visibleIn(graph, langOf(page || this.page));
  const deg = degreesIn(graph, visible);
  if (!page) {
    const keys = Array.from(graph.nodes.keys()).filter(visible)
      .sort((a, b) => (deg.get(b) || 0) - (deg.get(a) || 0));
    const data = pack(graph, keys, null, this.site, deg);
    return { json: safeJSON(data), nodes: data.nodes.length, links: data.links.length };
  }
  const focus = keyOf(page.path);
  if (!graph.nodes.has(focus)) return { json: '{}', nodes: 0, links: 0 };
  const levels = neighborhood(graph, focus, depth || 2, visible);
  const keys = Array.from(levels.keys()).sort((a, b) => levels.get(a) - levels.get(b));
  const data = pack(graph, keys, levels, this.site, deg);
  data.focus = 0;
  return { json: safeJSON(data), nodes: data.nodes.length, links: data.links.length };
});

// 反向連結：哪些頁面連到這一頁，以及連結附近的文字
hexo.extend.helper.register('backlinks', function (page) {
  const graph = this.site.graph;
  const bl = graph.backlinks.get(keyOf(page.path));
  if (!bl) return [];
  const visible = visibleIn(graph, langOf(page));
  return Array.from(bl.entries()).filter(([key]) => visible(key)).map(([key, context]) => {
    const n = graph.nodes.get(key);
    return { title: n.title, url: n.url, kind: n.kind, context };
  });
});
