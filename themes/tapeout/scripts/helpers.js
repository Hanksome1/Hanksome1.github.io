'use strict';

const { stripHTML, escapeHTML } = require('hexo-util');

const CJK = /[㐀-䶿一-鿿豈-﫿]/g;

// 中文以 400 字/分鐘、英文以 220 字/分鐘估算
hexo.extend.helper.register('reading_time', function (content) {
  // KaTeX 的 MathML 與 TeX 原始碼是給螢幕閱讀器的，不算字數
  const text = stripHTML(String(content || '').replace(/<span class="katex-mathml">[\s\S]*?<\/math><\/span>/g, ''));
  const cjk = (text.match(CJK) || []).length;
  const words = (text.replace(CJK, ' ').match(/[A-Za-z0-9_]+/g) || []).length;
  return Math.max(1, Math.round(cjk / 400 + words / 220));
});

hexo.extend.helper.register('pad', (n, width = 2) => String(n).padStart(width, '0'));

// 配色：theme.schemes 列出訪客可切換的配色，第一個是預設。bg = [light, dark] 底色，給 <meta name="theme-color">
const SCHEMES = {
  tapeout: { name: 'Tapeout', bg: ['#f3f0e8', '#0c0d0b'] },
  datasheet: { name: 'Datasheet', bg: ['#ffffff', '#000000'] },
  phosphor: { name: 'Phosphor', bg: ['#eef1ea', '#050a07'] },
  soldermask: { name: 'Solder Mask', bg: ['#eef0e8', '#0a2418'] }
};

hexo.extend.helper.register('scheme_list', function () {
  const list = [].concat(this.theme.schemes || []).filter(s => SCHEMES[s]);
  return list.length ? list : ['tapeout'];
});

hexo.extend.helper.register('scheme_info', name => SCHEMES[name] || SCHEMES.tapeout);

hexo.extend.helper.register('is_project', post => post && post.layout === 'project');

// 文章種類：project（layout: project）、note（放在 _posts/<notes.dir>/ 的 Obsidian 筆記）、post（其他）
hexo.extend.helper.register('post_kind', function (post) {
  if (!post) return 'post';
  if (post.layout === 'project') return 'project';
  const dir = String((hexo.theme.config.notes || {}).dir || 'notes').replace(/^\/+|\/+$/g, '');
  if (post.kind === 'note' || String(post.source || '').startsWith('_posts/' + dir + '/')) return 'note';
  return 'post';
});

// 某個語言（預設是網站的預設語言）的文章依日期排序後，分成「專案」、「一般文章」與「筆記」
hexo.extend.helper.register('split_posts', function (posts, lang) {
  const kind = hexo.extend.helper.get('post_kind');
  const list = hexo.extend.helper.get('in_lang')(posts, lang)
    .sort((a, b) => b.date - a.date);
  return {
    projects: list.filter(p => kind(p) === 'project'),
    logs: list.filter(p => kind(p) === 'post'),
    notes: list.filter(p => kind(p) === 'note')
  };
});

// 把 tagline 裡 *文字* 轉成 <em>
hexo.extend.helper.register('emphasize', text =>
  escapeHTML(text || '').replace(/\*(.+?)\*/g, '<em>$1</em>'));

// 把 Hexo 的 tags（Query）轉成名稱陣列
hexo.extend.helper.register('tag_names', post =>
  post && post.tags ? post.tags.map(t => t.name) : []);

// ── Floorplan ────────────────────────────────────────────────
// 以標題當種子，產生一張確定性的晶片佈局圖（沒有封面圖的專案會用它當插圖）

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const r1 = n => Math.round(n * 10) / 10;

hexo.extend.helper.register('floorplan', function (seed, labels, opts = {}) {
  const W = opts.w || 480;
  const H = opts.h || 300;
  const key = String(seed || 'chip');
  const rnd = mulberry32(hash(key));
  const id = 'fp' + hash(key).toString(36);
  const names = Array.isArray(labels) ? labels.map(String) : [];

  const ring = 16;
  const inset = ring + 10;
  const core = { x: inset, y: inset, w: W - inset * 2, h: H - inset * 2 };
  const leaves = [];
  const gap = 6;

  (function split(r, depth) {
    const small = r.w < 90 && r.h < 70;
    if (depth >= 4 || small || (depth >= 2 && rnd() < 0.28)) {
      leaves.push(r);
      return;
    }
    const ratio = r.w / r.h;
    const vertical = ratio > 1.25 ? true : ratio < 0.8 ? false : rnd() < 0.5;
    const t = 0.34 + rnd() * 0.32;
    if (vertical) {
      const aw = r.w * t - gap / 2;
      split({ x: r.x, y: r.y, w: aw, h: r.h }, depth + 1);
      split({ x: r.x + aw + gap, y: r.y, w: r.w - aw - gap, h: r.h }, depth + 1);
    } else {
      const ah = r.h * t - gap / 2;
      split({ x: r.x, y: r.y, w: r.w, h: ah }, depth + 1);
      split({ x: r.x, y: r.y + ah + gap, w: r.w, h: r.h - ah - gap }, depth + 1);
    }
  })(core, 0);

  // 面積大的區塊優先拿到標籤，成為 macro
  const byArea = leaves.map((l, i) => ({ l, i })).sort((a, b) => b.l.w * b.l.h - a.l.w * a.l.h);
  byArea.forEach((item, rank) => {
    if (rank < names.length) {
      item.l.kind = 'macro';
      item.l.label = names[rank];
    } else {
      const p = rnd();
      item.l.kind = p < 0.5 ? 'std' : p < 0.78 ? 'sram' : 'keepout';
    }
  });

  const out = [];
  out.push(`<svg class="floorplan" viewBox="0 0 ${W} ${H}" role="img" aria-label="Floorplan illustration" preserveAspectRatio="xMidYMid ${opts.fit === 'meet' ? 'meet' : 'slice'}">`);
  out.push('<defs>');
  out.push(`<pattern id="${id}-rows" width="8" height="5" patternUnits="userSpaceOnUse"><path d="M0 .5H8" class="fp-pat"/></pattern>`);
  out.push(`<pattern id="${id}-grid" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 .5H7M.5 0V7" class="fp-pat"/></pattern>`);
  out.push(`<pattern id="${id}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M.5 0V6" class="fp-pat"/></pattern>`);
  out.push('</defs>');

  out.push(`<rect class="fp-die" x=".5" y=".5" width="${W - 1}" height="${H - 1}"/>`);

  // IO pads
  const pads = [];
  const pad = 12;
  for (let x = ring + 6; x < W - ring - 6; x += 18) {
    pads.push(`M${x} 4h${pad / 2}v${pad - 2}h${-pad / 2}z`, `M${x} ${H - 4}h${pad / 2}v${-(pad - 2)}h${-pad / 2}z`);
  }
  for (let y = ring + 6; y < H - ring - 6; y += 18) {
    pads.push(`M4 ${y}v${pad / 2}h${pad - 2}v${-pad / 2}z`, `M${W - 4} ${y}v${pad / 2}h${-(pad - 2)}v${-pad / 2}z`);
  }
  out.push(`<path class="fp-pad" d="${pads.join('')}"/>`);
  out.push(`<rect class="fp-core" x="${core.x - 5}" y="${core.y - 5}" width="${core.w + 10}" height="${core.h + 10}"/>`);

  // 繞線：連接相鄰區塊中心的曼哈頓路徑
  const wires = [];
  for (let i = 1; i < leaves.length; i++) {
    if (rnd() < 0.55) continue;
    const a = leaves[i - 1];
    const b = leaves[i];
    const ax = r1(a.x + a.w / 2), ay = r1(a.y + a.h / 2);
    const bx = r1(b.x + b.w / 2), by = r1(b.y + b.h / 2);
    wires.push(`M${ax} ${ay}H${bx}V${by}`);
  }

  leaves.forEach((l, i) => {
    const fill = l.kind === 'std' ? `url(#${id}-rows)` : l.kind === 'sram' ? `url(#${id}-grid)` : l.kind === 'keepout' ? `url(#${id}-hatch)` : '';
    out.push(`<g class="fp-blk fp-${l.kind}" style="--i:${i}">`);
    out.push(`<rect x="${r1(l.x)}" y="${r1(l.y)}" width="${r1(l.w)}" height="${r1(l.h)}"${fill ? ` fill="${fill}"` : ''}/>`);
    if (l.label) {
      const fs = Math.max(9, Math.min(W > 800 ? 19 : 15, l.w / (l.label.length * 0.75 + 1)));
      out.push(`<text x="${r1(l.x + 8)}" y="${r1(l.y + 8 + fs)}" font-size="${r1(fs)}">${escapeHTML(l.label)}</text>`);
    }
    out.push('</g>');
  });

  if (wires.length) out.push(`<path class="fp-wire" pathLength="1" d="${wires.join('')}"/>`);
  out.push('</svg>');
  return out.join('');
});

// 專案料號：沒有自訂 part 時，依日期由舊到新編成 PRJ-001、PRJ-002…（同一個語言裡編號）
hexo.extend.helper.register('part_no', function (post) {
  if (post.part) return post.part;
  const lang = hexo.extend.helper.get('lang_of')(post);
  const projects = hexo.extend.helper.get('in_lang')(this.site.posts.filter(p => p.layout === 'project').sort('date'), lang);
  const i = projects.findIndex(p => p._id === post._id);
  return 'PRJ-' + String(i + 1).padStart(3, '0');
});
