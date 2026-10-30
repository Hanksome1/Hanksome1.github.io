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

// ── 課程 ─────────────────────────────────────────────────────
// _config.tapeout.yml 的 notes.courses：hub 是課程總覽筆記的網址，tag 是這門課的筆記共用的標籤。
// /notes/ 頂端用 note_courses() 排出課程入口；筆記頁用 note_course() 在標頭連回所屬課程的總覽。

const trimSlash = s => String(s || '').replace(/^\/+|\/+$/g, '');
const courseConfig = theme => [].concat((theme.notes || {}).courses || []).filter(c => c && c.hub && c.tag);

hexo.extend.helper.register('note_courses', function () {
  const tagNames = hexo.extend.helper.get('tag_names');
  const readingTime = hexo.extend.helper.get('reading_time');
  const notes = hexo.extend.helper.get('split_posts')(this.site.posts).notes;
  return courseConfig(this.theme).map(c => {
    const hub = notes.find(p => trimSlash(p.path) === trimSlash(c.hub));
    if (!hub) {
      hexo.log.warn(`[notes] 找不到課程總覽筆記 ${c.hub}，課程 ${c.tag} 不會出現在 /notes/`);
      return null;
    }
    const members = notes.filter(p => p !== hub && tagNames(p).includes(c.tag));
    // 卡片上的主題：成員筆記最常用的其他標籤
    const count = {};
    members.forEach(p => tagNames(p).forEach(t => {
      if (t !== c.tag && t !== 'MOC') count[t] = (count[t] || 0) + 1;
    }));
    return Object.assign({}, c, {
      hub,
      notes: members,
      minutes: members.reduce((sum, p) => sum + readingTime(p.content), 0),
      updated: [hub].concat(members).reduce((a, p) => (p.updated > a ? p.updated : a), hub.updated),
      topics: Object.keys(count).sort((a, b) => count[b] - count[a]).slice(0, 5)
    });
  }).filter(Boolean);
});

// 這篇筆記屬於哪一門課（總覽筆記本身也算），沒有就回傳 null
hexo.extend.helper.register('note_course', function (post) {
  const tags = hexo.extend.helper.get('tag_names')(post);
  const course = courseConfig(this.theme).find(c => trimSlash(c.hub) === trimSlash(post && post.path) || tags.includes(c.tag));
  return course ? Object.assign({}, course, { isHub: trimSlash(course.hub) === trimSlash(post.path) }) : null;
});

// 課程的動畫導覽（notes.courses 的 tour 指到 source/lab/ 的頁面，頁面 front-matter 的 tour.stops 是站點）。
// 回傳導覽頁的網址、站點，以及這篇筆記在哪一站（hot）；沒有設定 tour 就回傳 null
hexo.extend.helper.register('course_tour', function (course, post) {
  if (!course || !course.tour) return null;
  const page = this.site.pages.toArray().find(p => trimSlash(p.path).replace(/\/?index\.html$/, '') === trimSlash(course.tour));
  if (!page || !page.tour || !page.tour.stops) {
    hexo.log.warn(`[notes] 課程 ${course.tag} 的 tour ${course.tour} 找不到頁面，或頁面沒有 tour.stops`);
    return null;
  }
  const slug = post ? trimSlash(post.path).split('/').pop() : '';
  const stops = page.tour.stops;
  const hot = slug ? stops.find(s => (s.notes || []).includes(slug)) || null : null;
  return { url: course.tour, title: page.title, tagline: page.tour.tagline, stops, hot };
});

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
  const id = 'fp' + hash(`${key}@${W}x${H}`).toString(36); // 繞線的遮罩跟尺寸有關，同一頁的不同尺寸不能共用 id
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

  // 面積大的區塊成為 macro；單字最長的標籤放進最寬的 macro
  const byArea = leaves.map((l, i) => ({ l, i })).sort((a, b) => b.l.w * b.l.h - a.l.w * a.l.h);
  byArea.forEach((item, rank) => {
    if (rank < names.length) {
      item.l.kind = 'macro';
    } else {
      const p = rnd();
      item.l.kind = p < 0.5 ? 'std' : p < 0.78 ? 'sram' : 'keepout';
    }
  });
  const macros = leaves.filter(l => l.kind === 'macro').sort((a, b) => b.w - a.w);
  const longest = s => Math.max(...s.split(/\s+/).map(w => w.length));
  const placed = names.slice(0, macros.length);
  const nets = []; // nets[n] 是放第 n 個標籤的 macro
  placed.map((s, n) => n).sort((a, b) => longest(placed[b]) - longest(placed[a])).forEach((n, k) => {
    macros[k].label = placed[n];
    nets[n] = macros[k];
  });

  // 所有標籤用同一個字級：從最大字級往下找，直到每個標籤在空白處換行後都放得進自己的區塊
  const CH = 0.64; // IBM Plex Mono 字寬 0.6em，加上 letter-spacing 0.04em
  const wrap = (s, max) => s.split(/\s+/).reduce((lines, w) => {
    const last = lines.length - 1;
    if (last >= 0 && lines[last].length + 1 + w.length <= max) lines[last] += ' ' + w;
    else lines.push(w);
    return lines;
  }, []);
  const linesOf = (l, fs) => wrap(l.label, Math.floor((l.w - 16) / (fs * CH)));
  const fits = (l, fs) => {
    const lines = linesOf(l, fs);
    return lines.every(s => s.length * fs * CH <= l.w - 16) && 16 + fs * (1 + (lines.length - 1) * 1.2) <= l.h;
  };
  let fs = W > 800 ? 19 : 15;
  while (fs > 9 && !macros.every(l => fits(l, fs))) fs -= 0.5;

  const out = [];
  out.push(`<svg class="floorplan" viewBox="0 0 ${W} ${H}" role="img" aria-label="Floorplan illustration" preserveAspectRatio="xMidYMid ${opts.fit === 'meet' ? 'meet' : 'slice'}">`);
  out.push('<defs>');
  out.push(`<pattern id="${id}-rows" width="8" height="5" patternUnits="userSpaceOnUse"><path d="M0 .5H8" class="fp-pat"/></pattern>`);
  out.push(`<pattern id="${id}-grid" width="7" height="7" patternUnits="userSpaceOnUse"><path d="M0 .5H7M.5 0V7" class="fp-pat"/></pattern>`);
  out.push(`<pattern id="${id}-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M.5 0V6" class="fp-pat"/></pattern>`);
  out.push(`<mask id="${id}-wires" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#fff"/>`);
  macros.forEach(l => out.push(`<rect x="${r1(l.x)}" y="${r1(l.y)}" width="${r1(l.w)}" height="${r1(l.h)}"/>`));
  out.push('</mask>');
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

  // 繞線：照標籤順序（資料流）用曼哈頓路徑串起 macro；遮罩挖掉 macro 內部，線只出現在區塊之間，不會壓到標籤
  // 線離開起點 macro、進入終點 macro 的地方各放一個 pin
  const exit = (r, pts) => {
    for (let i = 1; i < pts.length; i++) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      if (x1 < r.x || x1 > r.x + r.w || y1 < r.y || y1 > r.y + r.h) {
        return x0 === x1 ? [x0, y1 > y0 ? r.y + r.h : r.y] : [x1 > x0 ? r.x + r.w : r.x, y0];
      }
    }
  };
  const wires = [];
  const pins = [];
  for (let i = 1; i < nets.length; i++) {
    const a = nets[i - 1];
    const b = nets[i];
    const ax = r1(a.x + a.w / 2), ay = r1(a.y + a.h / 2);
    const bx = r1(b.x + b.w / 2), by = r1(b.y + b.h / 2);
    const across = Math.abs(bx - ax) >= Math.abs(by - ay);
    const pts = [[ax, ay], across ? [bx, ay] : [ax, by], [bx, by]];
    wires.push(`M${ax} ${ay}${across ? `H${bx}V${by}` : `V${by}H${bx}`}`);
    pins.push(exit(a, pts), exit(b, pts.slice().reverse()));
  }

  // 外部訊號的入口：資料流第一個 macro 正上方最近的那根頂邊 pad，從 pad 底下直直往下接到 macro 頂端
  // 預設隱藏，只有首頁的開場會把板子上的走線接進來（js 從 data-x 找到這根 pad）
  const head = nets[0];
  let entry = null;
  if (head) {
    const cx = head.x + head.w / 2;
    let best = Infinity;
    for (let x = ring + 6; x < W - ring - 6; x += 18) {
      const c = x + pad / 4;
      if (Math.abs(c - cx) < best) { best = Math.abs(c - cx); entry = { x: r1(c), y: r1(head.y) }; }
    }
  }

  leaves.forEach((l, i) => {
    const fill = l.kind === 'std' ? `url(#${id}-rows)` : l.kind === 'sram' ? `url(#${id}-grid)` : l.kind === 'keepout' ? `url(#${id}-hatch)` : '';
    out.push(`<g class="fp-blk fp-${l.kind}${l === head ? ' fp-entry' : ''}" style="--i:${i}">`);
    out.push(`<rect x="${r1(l.x)}" y="${r1(l.y)}" width="${r1(l.w)}" height="${r1(l.h)}"${fill ? ` fill="${fill}"` : ''}/>`);
    if (l.label) {
      const lines = linesOf(l, fs).map((s, k) => `<tspan x="${r1(l.x + 8)}" y="${r1(l.y + 8 + fs * (1 + k * 1.2))}">${escapeHTML(s)}</tspan>`);
      out.push(`<text font-size="${fs}">${lines.join('')}</text>`);
    }
    out.push('</g>');
  });

  if (wires.length) {
    out.push(`<path class="fp-wire" pathLength="1" mask="url(#${id}-wires)" d="${wires.join('')}"/>`);
    out.push(`<path class="fp-pin" d="${pins.map(([x, y]) => `M${r1(x - 2)} ${r1(y - 2)}h4v4h-4z`).join('')}"/>`);
  }
  if (entry) {
    out.push(`<path class="fp-in" pathLength="1" mask="url(#${id}-wires)" data-x="${entry.x}" d="M${entry.x} 14V${entry.y}"/>`);
    out.push(`<path class="fp-in-pad" d="M${r1(entry.x - 3)} 4h6v10h-6z"/>`);
    out.push(`<path class="fp-in-pin" d="M${r1(entry.x - 2)} ${r1(entry.y - 2)}h4v4h-4z"/>`);
  }
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
