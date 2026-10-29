/* Ideogram 4 vs SD 3.5 Large，第二版：兩座塔（layout: dit-tower）
   每一層 transformer block 是一塊長方體板子，SD 3.5 每層兩根細柱（文字、圖片各一組權重），Ideogram 4 每層一整塊寬板。
   舞台用 position: sticky 釘住，捲過 .tw-track 的距離換成 0–1 的進度 p，再分給各段（BEATS）自己的局部進度 t，
   所以往回捲也會倒著播。鏡頭是世界座標裡的一個取景框（中心 x, y、寬 w），在 SHOTS 之間平滑移動。
   板子的寬度照 hidden size 畫（4608 → 300），第 1 層拆開時每一塊的面積照參數量畫。
   規格出自 ideogram-oss/ideogram4 與 Stability-AI/sd3.5 的參考程式碼。 */
(function () {
  'use strict';

  var root = document.querySelector('[data-tw]');
  if (!root) return;
  var track = root.querySelector('.tw-track');
  var stage = root.querySelector('.tw-stage');
  var svg = root.querySelector('[data-tw-world]');
  var panel = root.querySelector('.tw-panel');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';

  // ---- helpers ----
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function el(name, attrs, parent, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  // 值沒變就不寫回 DOM
  function set(e, k, v) {
    var key = '_tw_' + k;
    if (e[key] === v) return;
    e[key] = v;
    e.setAttribute(k, v);
  }
  function show(e, o) { set(e, 'opacity', r1(o * 100) / 100); }
  function T(g, x, y, s, cls, anchor, size) {
    return el('text', { x: x, y: y, class: cls || null, 'text-anchor': anchor || null, style: size ? 'font-size:' + size + 'px' : null }, g, s);
  }
  // pathLength = 1 的線：k = 0 看不到，k = 1 整條畫完
  function wire(g, d, cls) { return el('path', { d: d, class: cls, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, g); }
  function draw(e, k) { set(e, 'stroke-dashoffset', r1((1 - k) * 1000) / 1000); set(e, 'opacity', k > 0 ? 1 : 0); }

  var PIX = 24;
  function target(x, y) {
    var sky = [140 + y * 3, 196 + y * 1.5, 232];
    if (y >= 17) return [150, 150, 146];
    var dx = x - 5, dy = y - 5;
    if (dx * dx + dy * dy < 9) return [250, 210, 90];
    if (x >= 14 && x <= 22 && y >= 2 && y <= 6) return (y === 4 && x >= 15 && x <= 21 && x % 2) ? [245, 240, 230] : [40, 40, 42];
    var ex = (x - 9.5) / 5.5, ey = (y - 11) / 4;
    if (ex * ex + ey * ey < 1) return [226, 166, 58];
    if (x >= 5 && x <= 15 && y === 16) return [196, 57, 45];
    return sky;
  }
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- 斜投影：(x, y, z) → (x + z·KX, y − z·KY)，看得到正面、頂面和右側面 ----
  var KX = 0.55, KY = 0.38;
  function Box(parent, cls) {
    var g = el('g', { class: 'tw-box ' + (cls || '') }, parent);
    var tp = el('path', { class: 'tp' }, g), sd = el('path', { class: 'sd' }, g), f = el('path', { class: 'f' }, g);
    return {
      g: g,
      set: function (x, y, w, h, dz) {
        x = r1(x); y = r1(y); w = r1(w); h = r1(Math.max(0.4, h));
        var dx = r1(dz * KX), dy = r1(dz * KY);
        set(f, 'd', 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + (-w) + 'Z');
        set(tp, 'd', 'M' + x + ' ' + y + 'l' + dx + ' ' + (-dy) + 'h' + w + 'l' + (-dx) + ' ' + dy + 'Z');
        set(sd, 'd', 'M' + (x + w) + ' ' + y + 'l' + dx + ' ' + (-dy) + 'v' + h + 'l' + (-dx) + ' ' + dy + 'Z');
      }
    };
  }

  // ---- 世界 ----
  var DZ = 70, PITCH = 20, TH = 14, EX = 260; // 板子深度、層距、厚度；第 1 層拆開時下面的層往下讓出的距離
  var TOWERS = {
    sd: { L: 38, cols: [{ x: 0, w: 158 }, { x: 172, w: 158 }], right: 330 },
    ig: { L: 34, cols: [{ x: 470, w: 300 }], right: 770 }
  };
  // 第 1 層拆開之後的每一塊：厚度 ∝ 參數量 ÷ 寬度，所以面積 ∝ 參數量（IG 的 MLP 170M / 300 寬 → 90）
  var SUB = {
    sd: [
      { k: 'ada', h: 35.7, label: 'adaLN 35.5M ×2' },
      { k: 'norm', h: 3, label: 'LayerNorm' },
      { k: 'attn', h: 23.8, label: 'Attention 23.7M ×2' },
      { k: 'norm', h: 3, label: 'LayerNorm' },
      { k: 'mlp', h: 47.6, label: 'MLP · GELU 47.3M ×2' }
    ],
    ig: [
      { k: 'ada', h: 5, label: 'adaLN 9.4M' },
      { k: 'norm', h: 3, label: 'RMSNorm' },
      { k: 'attn', h: 45, label: 'Attention 84.9M' },
      { k: 'norm', h: 3, label: 'RMSNorm（後）＋（前）', gap: 4 },
      { k: 'norm', h: 3, label: null },
      { k: 'mlp', h: 90, label: 'MLP · SwiGLU 170M' },
      { k: 'norm', h: 3, label: 'RMSNorm（後）', gap: 4 }
    ]
  };
  var SUBGAP = 13;

  var world = el('g', {}, svg);
  var L = { sd: el('g', { class: 'lane-sd' }, world), ig: el('g', { class: 'lane-ig' }, world) };
  var LEFT_LABEL = -18, RIGHT_LABEL = 836; // SD 的標籤寫在塔的左邊，IG 的寫在右邊

  // 塔身：從最下面一層往上畫，上面的板子才會蓋住下面板子的頂面
  var tower = {};
  ['sd', 'ig'].forEach(function (key) {
    var tw = TOWERS[key], g = el('g', {}, L[key]), rows = [];
    for (var i = tw.L - 1; i >= 1; i--) {
      var row = { i: i, boxes: tw.cols.map(function () { return Box(g); }) };
      if (key === 'ig') row.rot = T(g, 0, 0, '⟳', 't-l', 'middle', 12);
      rows.push(row);
    }
    // 第 1 層：拆開後的每一塊（由下往上畫），再蓋上整塊的板子
    var subs = SUB[key].slice().reverse().map(function (s) {
      return { s: s, boxes: tw.cols.map(function () { return Box(g); }) };
    }).reverse();
    var joint = key === 'sd' ? el('rect', { class: 'joint', rx: 4 }, g) : null;
    var first = { boxes: tw.cols.map(function () { return Box(g); }) };
    if (key === 'ig') first.rot = T(g, 0, 0, '⟳', 't-l', 'middle', 12);
    var labels = el('g', {}, L[key]);
    subs.forEach(function (sb) {
      if (!sb.s.label) return;
      sb.label = T(labels, key === 'sd' ? LEFT_LABEL : RIGHT_LABEL, 0, sb.s.label, null, key === 'sd' ? 'end' : 'start', 13);
      sb.lead = el('path', { class: 'lead' }, labels);
    });
    // residual：從這一層的頂端繞過每一塊，在 attention 和 MLP 之後加回來
    var res = tw.cols.map(function (c) {
      var rg = el('g', {}, labels);
      return { g: rg, x: c.x - 7, line: el('path', { class: 'pipe' }, rg), plus: [0, 1].map(function () { return T(rg, 0, 0, '⊕', 't-l', 'middle', 13); }) };
    });
    // 標題放在塔底、避開第 8 站從塔底接出去的線：SD 放在文字柱下面（文字流在塔底就結束了），IG 靠左
    var base = el('g', {}, L[key]);
    var tx = key === 'sd' ? 70 : 470, ta = key === 'sd' ? 'middle' : 'start';
    var title = T(base, tx, 0, key === 'sd' ? 'SD 3.5 Large' : 'Ideogram 4', 't-l', ta, 18);
    var sub = T(base, tx, 0, key === 'sd' ? '38 層 · 文字 ｜ 圖片' : '34 層 · 文字 + 圖片 共用 W', 't-d', ta, 13);
    // 第 6、7 站：鏡頭走到哪一層，旁邊就標出層數
    var cur = el('g', {}, L[key]);
    var curLab = T(cur, key === 'sd' ? LEFT_LABEL : RIGHT_LABEL, 0, '', 't-l', key === 'sd' ? 'end' : 'start', 16);
    var curLead = el('path', { class: 'lead' }, cur);
    var curNote = T(cur, key === 'sd' ? LEFT_LABEL : RIGHT_LABEL, 0, '', 't-d', key === 'sd' ? 'end' : 'start', 12);
    tower[key] = { tw: tw, rows: rows, subs: subs, first: first, joint: joint, res: res, title: title, sub: sub, base: base, cur: cur, curLab: curLab, curLead: curLead, curNote: curNote };
  });

  // 第 1 層的位置：k = 0 是一塊完整的板子，k = 1 是拆開的樣子
  // cur：第 6、7 站鏡頭所在的層（從 0 數），沒有就是 -1
  function layoutTower(key, k, hot, rotOn, cur) {
    var t = tower[key], tw = t.tw, dx = DZ * KX, dy = DZ * KY;
    t.rows.forEach(function (row) {
      var y = row.i * PITCH + EX * k;
      row.y = y;
      row.boxes.forEach(function (b, j) {
        // SD 最後一層的文字柱只算 K、V（pre_only），畫得比較薄
        var thin = key === 'sd' && j === 0 && row.i === tw.L - 1;
        b.set(tw.cols[j].x, y, tw.cols[j].w, thin ? 6 : TH, DZ);
        b.g.classList.toggle('is-hot', row.i === cur);
        b.g.classList.toggle('is-past', cur >= 0 && row.i < cur);
      });
      if (row.rot) {
        set(row.rot, 'x', r1(tw.right + dx / 2));
        set(row.rot, 'y', r1(y + TH / 2 - dy / 2 + 4));
        show(row.rot, rotOn(row.i));
      }
    });
    var sum = SUB[key].reduce(function (s, x) { return s + x.h; }, 0);
    var scale = lerp(TH / sum, 1, k), y = 0, dim = hot ? 0.5 : 1;
    t.subs.forEach(function (sb) {
      var h = sb.s.h * scale;
      sb.y = y; sb.h = h;
      sb.boxes.forEach(function (b, j) {
        b.set(tw.cols[j].x, y, tw.cols[j].w, h, DZ);
        b.g.classList.toggle('is-hot', hot === sb.s.k || (hot === 'gate' && (sb.s.k === 'attn' || sb.s.k === 'mlp')));
        show(b.g, k > 0 ? (hot && hot !== sb.s.k && !(hot === 'gate' && (sb.s.k === 'attn' || sb.s.k === 'mlp')) ? dim : 1) : 0);
      });
      var on = hot === sb.s.k || (hot === 'gate' && (sb.s.k === 'attn' || sb.s.k === 'mlp'));
      if (!sb.label) { y += h + (sb.s.gap != null ? sb.s.gap : SUBGAP) * k; return; }
      var ly = r1(y + h / 2 + 4);
      set(sb.label, 'y', ly);
      sb.label.setAttribute('class', on ? 't-l' : '');
      show(sb.label, seg(k, 0.6, 1) * (hot && !on ? 0.45 : 1));
      var x0 = key === 'sd' ? LEFT_LABEL + 6 : RIGHT_LABEL - 6, x1 = key === 'sd' ? tw.cols[0].x - 2 : tw.right + dx * 0.5;
      set(sb.lead, 'd', 'M' + x0 + ' ' + r1(y + h / 2) + 'H' + r1(x1));
      show(sb.lead, seg(k, 0.6, 1) * (hot && !on ? 0.45 : 1));
      y += h + (sb.s.gap != null ? sb.s.gap : SUBGAP) * k;
    });
    t.blockH = y;
    t.first.boxes.forEach(function (b, j) {
      b.set(tw.cols[j].x, 0, tw.cols[j].w, TH, DZ);
      show(b.g, 1 - seg(k, 0, 0.25));
      b.g.classList.toggle('is-past', cur > 0);
    });
    if (t.first.rot) {
      set(t.first.rot, 'x', r1(tw.right + dx / 2));
      set(t.first.rot, 'y', r1(TH / 2 - dy / 2 + 4));
      show(t.first.rot, rotOn(0) * (1 - seg(k, 0, 0.25)));
    }
    if (t.joint) {
      var a = t.subs[2];
      set(t.joint, 'x', -6); set(t.joint, 'y', r1(a.y - dy - 6));
      set(t.joint, 'width', r1(tw.right + dx + 12)); set(t.joint, 'height', r1(a.h + dy + 12));
      show(t.joint, hot === 'attn' ? 1 : 0);
    }
    var attn = t.subs.filter(function (s) { return s.s.k === 'attn'; })[0];
    var mlp = t.subs.filter(function (s) { return s.s.k === 'mlp'; })[0];
    t.res.forEach(function (r) {
      var bot = y - SUBGAP * k;
      set(r.line, 'd', 'M' + r.x + ' -4V' + r1(bot + 6));
      set(r.plus[0], 'x', r.x); set(r.plus[0], 'y', r1(attn.y + attn.h + 9));
      set(r.plus[1], 'x', r.x); set(r.plus[1], 'y', r1(mlp.y + mlp.h + 9));
      show(r.g, hot === 'gate' ? 1 : 0);
    });
    var bottom = (tw.L - 1) * PITCH + TH + EX * k;
    set(t.title, 'y', r1(bottom + 44));
    set(t.sub, 'y', r1(bottom + 64));
  }

  // ---- 塔頂上面：prompt、文字 encoder、latent、入口 ----
  var above = { sd: el('g', {}, L.sd), ig: el('g', {}, L.ig) };

  // Stop 1：prompt 卡片
  var prompt = (function () {
    var out = {};
    // SD：一句英文 + 三個 tokenizer 的 77 格
    var g = el('g', {}, above.sd);
    T(g, 0, -978, 'SD 3.5 · 一句英文', 't-l', null, 13);
    el('rect', { x: -6, y: -966, width: 342, height: 190, rx: 6, class: 'card-l' }, g);
    T(g, 8, -938, 'A golden retriever riding a', 't-b', null, 15);
    T(g, 8, -916, "skateboard past a", 't-b', null, 15);
    T(g, 8, -894, "'SKATE DOG' sign.", 't-b', null, 15);
    out.sdRows = [['CLIP-L', 19], ['bigG', 19], ['T5', 22]].map(function (r, i) {
      var y = -870 + i * 26;
      var lab = T(g, 8, y + 12, '', 't-d', null, 12);
      var cells = [];
      for (var k = 0; k < 77; k++) cells.push(el('rect', { x: r1(92 + k * 3.15), y: y, width: 2.4, height: 15, class: 'cell' }, g));
      return { name: r[0], n: r[1], cells: cells, lab: lab };
    });
    out.sd = g;
    // IG：一份 JSON + token 計量
    var h = el('g', {}, above.ig);
    T(h, 470, -978, 'Ideogram 4 · 結構化 JSON', 't-l', null, 13);
    el('rect', { x: 464, y: -966, width: 342, height: 190, rx: 6, class: 'card-l' }, h);
    var lines = [
      '{"high_level_description":',
      '   "A golden retriever riding…",',
      ' "style_description": {',
      '   "medium": "photo", "color_palette":',
      '     [               ]},',
      ' "compositional_deconstruction": {',
      '   "elements": [{"bbox": [250,150,…]},',
      '     {"type":"text","text":"SKATE DOG"}]}}'
    ];
    out.igLines = lines.map(function (s, i) { return T(h, 474, -944 + i * 15.5, s, 't-pre', null, 12.5); });
    out.swatch = el('g', {}, h);
    ['#e9a93a', '#8cc8e8', '#c4392d', '#2b2b2b', '#f4efe6'].forEach(function (c, i) {
      el('rect', { x: 504 + i * 16, y: -891, width: 12, height: 11, rx: 1.5, fill: c, stroke: 'var(--line-2)' }, out.swatch);
    });
    el('rect', { x: 476, y: -810, width: 318, height: 8, rx: 2, class: 'f-line' }, h);
    out.meter = el('rect', { x: 476, y: -810, width: 0, height: 8, rx: 2, class: 'f-l' }, h);
    el('path', { d: 'M' + r1(476 + 318 * 77 / 2048) + ' -816v20', class: 'lead' }, h);
    out.count = T(h, 794, -786, '', 't-b', 'end', 12);
    T(h, 476, -786, '↑ SD 的 77', 't-d', null, 12);
    out.ig = h;
    return out;
  })();

  // Stop 2：文字 encoder
  var enc = (function () {
    var out = {};
    var g = el('g', { class: 'lane-sd' }, above.sd), bottom = -436;
    var specs = [
      { name: 'CLIP-L', n: 12, x: 0, w: 40, tap: 10 },
      { name: 'bigG', n: 32, x: 62, w: 60, tap: 30 },
      { name: 'T5-XXL', n: 24, x: 144, w: 96, tap: 23 }
    ];
    out.sdTowers = specs.map(function (s) {
      var layers = [];
      for (var i = s.n - 1; i >= 0; i--) {
        var b = Box(g);
        b.set(s.x, bottom - (i + 1) * 8 + 2, s.w, 6, 24);
        layers[i] = b;
      }
      T(g, s.x + s.w / 2, bottom + 16, s.name, 't-d', 'middle', 11);
      return { s: s, layers: layers };
    });
    out.sdOut = el('g', {}, g);
    var bar = Box(out.sdOut, 'is-hot');
    bar.set(0, -404, 240, 8, 24);
    T(out.sdOut, LEFT_LABEL, -396, '154 × 4096', 't-l', 'end', 13);
    out.sdPipe = wire(g, 'M79 -394V-62', 'pipe');
    out.pool = el('g', {}, g);
    el('rect', { x: -196, y: -478, width: 150, height: 26, rx: 4, class: 'card-l' }, out.pool);
    T(out.pool, -121, -461, 'pooled 768+1280', null, 'middle', 12);
    out.poolWire = wire(g, 'M0 -470H-46', 'pipe-d');
    out.sd = g;

    var h = el('g', { class: 'lane-ig' }, above.ig);
    var taps = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 35], segH = 288 / 13;
    out.qwen = [];
    for (var i = 35; i >= 0; i--) {
      var b = Box(h);
      b.set(470, bottom - (i + 1) * 8 + 2, 120, 6, 24);
      out.qwen[i] = b;
    }
    T(h, 530, bottom - 300, 'Qwen3-VL-8B · 36 層（凍結）', 't-d', 'middle', 11);
    out.taps = taps.map(function (li, j) {
      var y = bottom - (li + 0.5) * 8 - 1, sy = bottom - (j + 0.5) * segH;
      var lead = el('path', { d: 'M' + 604 + ' ' + r1(y - 4) + 'C620 ' + r1(y - 4) + ' 614 ' + r1(sy) + ' 630 ' + r1(sy), class: 'lead' }, h);
      var sq = el('rect', { x: 630, y: r1(bottom - (j + 1) * segH + 1.5), width: 22, height: r1(segH - 3), rx: 1.5, class: 'f-line' }, h);
      return { li: li, lead: lead, sq: sq };
    });
    out.igOut = el('g', {}, h);
    T(out.igOut, 672, -680, '13 × 4096', null, null, 12);
    T(out.igOut, 672, -662, '= 53,248 維', 't-b', null, 14);
    el('rect', { x: 672, y: -620, width: 104, height: 24, rx: 4, class: 'card-l' }, out.igOut);
    T(out.igOut, 724, -604, 'RMSNorm', null, 'middle', 12);
    el('rect', { x: 672, y: -584, width: 104, height: 24, rx: 4, class: 'card-l' }, out.igOut);
    T(out.igOut, 724, -568, 'Linear→4608', null, 'middle', 12);
    T(out.igOut, RIGHT_LABEL, -396, 'N × 4608', 't-l', null, 13);
    out.igPipe = wire(h, 'M724 -560V-414H545V-62', 'pipe');
    out.ig = h;
    return out;
  })();

  // Stop 3：latent（純雜訊）→ 2 × 2 打包成 token
  var lat = (function () {
    function stack(parent, x, n, label, dims, cx) {
      var g = el('g', {}, parent), sheets = [];
      for (var i = n - 1; i >= 0; i--) {
        var b = Box(g, i % 4 ? '' : 'is-hot');
        b.set(x, -330 + i * 5, 120, 3, 50);
        sheets[i] = b;
      }
      T(g, x, -372, label, 't-l', null, 13);
      T(g, x, -356, '純雜訊（VAE 只在最後解碼用）', 't-d', null, 12);
      var pat = T(g, cx, -128, '2×2 → 4,096 × ' + dims, 't-b', 'middle', 13);
      var pipe = wire(g, 'M' + cx + ' ' + (-330 + n * 5 + 8) + 'V-140M' + cx + ' -118V-62', 'pipe');
      return { g: g, sheets: sheets, pat: pat, pipe: pipe };
    }
    return {
      sd: stack(el('g', { class: 'lane-sd' }, above.sd), 190, 16, 'z_t  128² × 16', 64, 250),
      ig: stack(el('g', { class: 'lane-ig' }, above.ig), 640, 32, 'z_t  128² × 32', 128, 700)
    };
  })();

  // Stop 4：入口（embedding）、SD 的位置表、IG 的 text | image 分界
  var gate = (function () {
    var out = {};
    var g = el('g', { class: 'lane-sd' }, above.sd);
    out.sdIn = [Box(g, 'is-ink'), Box(g, 'is-ink')];
    out.sdIn[0].set(0, -46, 158, 12, DZ);
    out.sdIn[1].set(172, -46, 158, 12, DZ);
    out.pe = Box(g, 'is-hot');
    out.peLab = T(g, LEFT_LABEL, 0, '+ 2D sin-cos 位置表', 't-l', 'end', 13);
    out.peLead = el('path', { class: 'lead' }, g);
    out.sdLab = T(g, LEFT_LABEL, -40, '入口 embed', 't-b', 'end', 13);
    T(g, LEFT_LABEL, -24, '文字 4096→2432 ｜ 圖片 64→2432', null, 'end', 12);
    out.sd = g;
    var h = el('g', { class: 'lane-ig' }, above.ig);
    out.igIn = Box(h, 'is-ink');
    out.igIn.set(470, -46, 300, 12, DZ);
    var split = 470 + 300 * 300 / 4396;
    el('path', { d: 'M' + r1(split) + ' -46v12', class: 'lead' }, h);
    el('path', { d: 'M' + r1(split) + ' -46l' + r1(DZ * KX) + ' ' + r1(-DZ * KY), class: 'lead' }, h);
    T(h, r1(split + DZ * KX - 4), -80, 'text', 't-b', 'end', 12);
    T(h, r1(split + DZ * KX + 4), -80, 'image →', 't-b', null, 12);
    out.igLab = T(h, RIGHT_LABEL, -40, '入口 embed', 't-b', 'start', 13);
    T(h, RIGHT_LABEL, -24, '圖片 128→4608 ｜ 文字 53,248→4608', null, 'start', 12);
    out.ig = h;
    return out;
  })();

  // 第 5 站：調變訊號從哪裡來
  var mod = (function () {
    var out = {};
    var g = el('g', { class: 'lane-sd' }, above.sd);
    el('rect', { x: -196, y: -112, width: 150, height: 26, rx: 4, class: 'card-l' }, g);
    T(g, -121, -95, 'c = t + pooled', 't-b', 'middle', 12);
    out.sdWire = el('path', { class: 'pipe-d' }, g);
    out.sdPool = wire(g, 'M-121 -452V-112', 'pipe-d');
    out.sd = g;
    var h = el('g', { class: 'lane-ig' }, above.ig);
    el('rect', { x: 846, y: -112, width: 130, height: 26, rx: 4, class: 'card-l' }, h);
    T(h, 911, -95, 't → 512', 't-b', 'middle', 12);
    out.igWire = el('path', { class: 'pipe-d' }, h);
    out.ig = h;
    return out;
  })();

  // ---- 塔底下面：final layer、速度 v、取樣器、迴圈、無條件分身塔、VAE、總帳 ----
  var below = { sd: el('g', { class: 'lane-sd' }, L.sd), ig: el('g', { class: 'lane-ig' }, L.ig) };
  var EXIT = {
    sd: { x: 172, w: 158, sx: 191, C: 16, bottom: 37 * PITCH + TH, pipeX: 300, dims: 64, note: 'Linear 2432 → 64' },
    ig: { x: 470, w: 300, sx: 640, C: 32, bottom: 33 * PITCH + TH, pipeX: 740, dims: 128, note: 'Linear 4608 → 128' }
  };
  var ex = {};
  ['sd', 'ig'].forEach(function (key) {
    var e = EXIT[key], g = el('g', {}, below[key]), o = { g: g };
    o.pipe = wire(g, 'M' + e.pipeX + ' ' + (e.bottom + 6) + 'V852', 'pipe');
    o.fin = el('g', {}, g);
    Box(o.fin, 'is-ink').set(e.x, 860, e.w, 10, DZ);
    var lx = key === 'sd' ? LEFT_LABEL : RIGHT_LABEL, la = key === 'sd' ? 'end' : 'start';
    T(o.fin, lx, 864, 'final layer', 't-b', la, 13);
    T(o.fin, lx, 880, 'norm · ×(1+scale)', null, la, 12);
    T(o.fin, lx, 895, e.note, null, la, 12);
    if (key === 'ig') {
      // 文字那一段的輸出丟掉，只取圖片 token
      var tw = 300 * 300 / 4396;
      el('rect', { x: e.x, y: 860, width: r1(tw), height: 10, class: 'f-line' }, o.fin);
      T(o.fin, e.x + 2, 896, '✕ text 丟掉', 't-d', null, 12);
    }
    o.v = el('g', {}, g);
    var vs = [];
    for (var i = e.C - 1; i >= 0; i--) { var b = Box(o.v, i % 4 ? '' : 'is-hot'); b.set(e.sx, 918 + i * 4, 120, 2.5, 50); vs[i] = b; }
    var vb = 918 + e.C * 4;
    T(o.v, lx, 940, 'v  128² × ' + e.C, 't-l', la, 13);
    T(o.v, lx, 956, '速度：往乾淨的圖走的方向', 't-d', la, 12);
    o.vPipe = wire(g, 'M' + (e.sx + 60) + ' 874V' + (918 - 22), 'pipe');
    o.up = el('g', {}, g);
    el('rect', { x: e.sx - 30, y: vb + 22, width: 180, height: 28, rx: 4, class: 'card-l' }, o.up);
    T(o.up, e.sx + 60, vb + 41, key === 'sd' ? 'z ← DPM++ 2M 一步' : 'z ← z + v·Δt', 't-b', 'middle', 13);
    o.upPipe = wire(g, 'M' + (e.sx + 60) + ' ' + (vb + 4) + 'V' + (vb + 20), 'pipe');
    o.upY = vb + 36;
    // 迴圈：從取樣器繞到塔外，回到最上面的 latent
    var lpX = key === 'sd' ? -250 : 1230, inX = key === 'sd' ? 186 : 760 + 50 * KX + 4;
    o.loop = wire(g, 'M' + (key === 'sd' ? e.sx - 30 : e.sx + 150) + ' ' + o.upY + 'H' + lpX + 'V-290H' + inX, 'pipe-d');
    o.loopLab = T(g, lpX + (key === 'sd' ? 10 : -10), 400, '', 't-l', key === 'sd' ? 'start' : 'end', 22);
    o.loopNote = T(g, lpX + (key === 'sd' ? 10 : -10), 424, key === 'sd' ? '× 2 forward / 步' : '× 2 forward / 步', 't-d', key === 'sd' ? 'start' : 'end', 13);
    // VAE 解碼（只在最後一次）與輸出的圖
    o.dec = el('g', {}, g);
    var dy0 = vb + 90;
    el('path', { d: 'M' + (e.sx + 20) + ' ' + dy0 + 'H' + (e.sx + 100) + 'L' + (e.sx + 150) + ' ' + (dy0 + 50) + 'H' + (e.sx - 30) + 'Z', class: 'card-l' }, o.dec);
    T(o.dec, e.sx + 60, dy0 + 31, 'VAE decoder', 't-b', 'middle', 13);
    T(o.dec, lx, dy0 + 24, '只在最後一步之後', 't-d', la, 12);
    o.decPipe = wire(g, 'M' + (e.sx + 60) + ' ' + (o.upY + 14) + 'V' + (dy0 - 4), 'pipe-d');
    o.img = [];
    var iy = dy0 + 66, cs = 7;
    o.imgY = iy;
    var rnd = rng(key === 'sd' ? 7 : 11);
    for (var y = 0; y < PIX; y++) for (var x = 0; x < PIX; x++) {
      o.img.push({ r: el('rect', { x: e.sx + 60 - PIX * cs / 2 + x * cs, y: iy + y * cs, width: cs + 0.3, height: cs + 0.3 }, g), n: [rnd() * 255, rnd() * 255, rnd() * 255], t: target(x, y) });
    }
    o.imgLab = T(g, e.sx + 60, iy + PIX * cs + 22, '', 't-b', 'middle', 14);
    o.imgEnd = iy + PIX * cs;
    // 總帳
    o.cost = el('g', {}, g);
    o.costY = iy + PIX * cs + 70;
    ex[key] = o;
  });
  // Ideogram 4 的無條件分支：旁邊一座獨立權重的分身塔，只吃圖片 token
  var twin = (function () {
    var g = el('g', { class: 'lane-ig' }, L.ig), boxes = [];
    for (var i = 33; i >= 0; i--) { var b = Box(g, 'is-twin'); b.set(1290, i * PITCH, 300, TH, DZ); boxes[i] = b; }
    T(g, 1290, -40, '無條件分支', 't-l', null, 16);
    T(g, 1290, -22, '另一組 9.3B 權重 · 只有圖片 token', 't-d', null, 12);
    T(g, 1290, 34 * PITCH + 30, '每一步跑一次', 't-d', null, 12);
    return { g: g };
  })();
  var sdTwice = (function () {
    var g = el('g', { class: 'lane-sd' }, L.sd);
    T(g, -250, -330, '每一步這座塔跑兩次：', 't-l', null, 14);
    T(g, -250, -312, '有 prompt 一次、空 prompt 一次', 't-d', null, 12);
    return g;
  })();

  // 總帳的數字（1024²、JSON 300 token、預設步數），算法同第一版
  var COST = (function () {
    function blockFlops(key, nText, nImg) {
      var D = key === 'sd' ? 2432 : 4608, N = nText + nImg;
      var linear = key === 'sd' ? 24 * D * D * N : 2 * (4 * D * D + 3 * D * 12288) * N;
      return { total: linear + 4 * N * N * D };
    }
    var nImg = 4096;
    var sdPass = 38 * blockFlops('sd', 154, nImg).total;
    var igCond = 34 * blockFlops('ig', 300, nImg).total + 2 * 53248 * 4608 * 300, igUn = 34 * blockFlops('ig', 0, nImg).total;
    var sd = { block: blockFlops('sd', 154, nImg).total, steps: 40, step: 2 * sdPass, pass: sdPass, text: 2 * 5.6e9 * 77 * 2 };
    var ig = { block: blockFlops('ig', 300, nImg).total, steps: 20, step: igCond + igUn, cond: igCond, text: 2 * 8e9 * 300 };
    sd.total = sd.steps * sd.step + sd.text;
    ig.total = ig.steps * ig.step + ig.text;
    sd.mem = (8.1 + 4.8 + 0.82) * 2; ig.mem = (9.3 * 2 + 8.8) * 2;
    sd.params = 213e6; ig.params = 264e6;
    return { sd: sd, ig: ig };
  })();
  function fmtF(n) { return n >= 1e15 ? (n / 1e15).toFixed(2) + ' PFLOPs' : n >= 1e12 ? (n / 1e12).toFixed(n >= 1e14 ? 0 : 1) + ' TFLOPs' : (n / 1e9).toFixed(0) + ' GFLOPs'; }
  function fmtP(n) { return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : (n / 1e6).toFixed(0) + 'M'; }
  ['sd', 'ig'].forEach(function (key) {
    var o = ex[key], c = COST[key], e = EXIT[key], y = o.costY, max = Math.max(COST.sd.total, COST.ig.total), mm = Math.max(COST.sd.mem, COST.ig.mem);
    var x0 = e.sx - 30;
    T(o.cost, x0, y, '一張圖', 't-d', null, 12);
    T(o.cost, x0, y + 30, fmtF(c.total), 't-big');
    o.bar = el('rect', { x: x0, y: y + 42, width: 0, height: 14, rx: 2, class: 'f-l' }, o.cost);
    o.barW = 300 * c.total / max;
    T(o.cost, x0, y + 76, c.steps + ' 步 × ' + fmtF(c.step) + ' / 步', null, null, 12);
    T(o.cost, x0, y + 104, '權重 bf16 ≈ ' + c.mem.toFixed(0) + ' GB', 't-d', null, 12);
    o.mem = el('rect', { x: x0, y: y + 112, width: 0, height: 8, rx: 2, class: 'f-soft' }, o.cost);
    o.memW = 300 * c.mem / mm;
  });

  // ---- 段落與鏡頭 ----
  var BEATS = [['intro', 0.7], ['prompt', 1.1], ['encoder', 1.4], ['latent', 1.1], ['position', 1.1], ['layer', 3.2],
    ['middle', 2.2], ['last', 1.0], ['exit', 1.4], ['loop', 2.2], ['cost', 1.2]];
  var HOLD = 0.4;
  var STOPS = ['prompt', 'encoder', 'latent', 'position', 'layer', 'middle', 'last', 'exit', 'loop', 'cost'];
  var total = BEATS.reduce(function (s, b) { return s + b[1]; }, HOLD), spans = {}, acc = 0;
  BEATS.forEach(function (b) { spans[b[0]] = { start: acc / total, len: b[1] / total }; acc += b[1]; });
  function localT(k, p) { return clamp01((p - spans[k].start) / spans[k].len); }
  function beatAt(p) {
    var cur = BEATS[0][0];
    BEATS.forEach(function (b) { if (p >= spans[b[0]].start) cur = b[0]; });
    return cur;
  }

  var CX = 405;
  var SHOTS = [
    ['intro', 0, CX, 400, 1500], ['intro', 0.2, CX, 400, 1500], ['intro', 0.95, CX, -860, 1350], ['prompt', 1, CX, -850, 1350],
    ['encoder', 0.35, CX, -570, 1350], ['encoder', 1, CX, -550, 1350],
    ['latent', 0.35, CX, -260, 1350], ['latent', 1, CX, -240, 1350],
    ['position', 0.35, CX, -10, 1350], ['position', 1, CX, 10, 1350],
    ['layer', 0.2, CX, 160, 1380], ['layer', 1, CX, 175, 1380],
    ['middle', 0.15, CX, 200, 1380], ['middle', 1, CX, 600, 1380],
    ['last', 0.35, CX, 690, 1350], ['last', 1, CX, 700, 1350],
    ['exit', 0.3, CX, 950, 1350], ['exit', 1, CX, 980, 1350],
    ['loop', 0.25, 690, 260, 2500], ['loop', 0.8, 690, 280, 2500], ['loop', 1, CX, 1200, 1450],
    ['cost', 0.35, CX, 1420, 1450], ['cost', 1, CX, 1430, 1450]
  ];
  var shots = SHOTS.map(function (s) { return { p: spans[s[0]].start + spans[s[0]].len * s[1], x: s[2], y: s[3], w: s[4] }; });
  function camera(p) {
    var i = 0;
    while (i < shots.length - 1 && shots[i + 1].p <= p) i++;
    var a = shots[i], b = shots[Math.min(i + 1, shots.length - 1)];
    var k = b.p > a.p ? ease(clamp01((p - a.p) / (b.p - a.p))) : 0;
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), k)) };
  }

  // 取景框放進舞台上沒被說明欄蓋住的那一塊（寬螢幕是右邊，窄螢幕是上面）
  var view = { W: 1, H: 1, fx: 0, fy: 0, fw: 1, fh: 1 };
  function measure() {
    var r = stage.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    view.W = r.width; view.H = r.height;
    var narrow = view.narrow = window.matchMedia('(max-width: 900px)').matches;
    if (narrow) { view.fx = 0; view.fy = 0; view.fw = r.width; view.fh = Math.max(120, pr.top - r.top); }
    else { view.fx = pr.right - r.left; view.fy = 0; view.fw = r.width - view.fx; view.fh = r.height; }
    set(svg, 'width', r1(view.W)); set(svg, 'height', r1(view.H));
  }
  function renderCamera(c) {
    // 世界寬 c.w 對到取景框寬 fw（太扁的取景框改成以高為準），再把整個 svg 的 viewBox 推算出來
    // 窄螢幕放大一點：兩側的標籤會被切掉，說明欄裡有同樣的資訊
    var s = view.fw / (c.w * (view.narrow ? 0.78 : 1));
    var minH = c.w * 0.62;
    if (!view.narrow && view.fh / s < minH) s = view.fh / minH;
    var vx = c.x - (view.fx + view.fw / 2) / s, vy = c.y - (view.fy + view.fh / 2) / s;
    set(svg, 'viewBox', [r1(vx), r1(vy), r1(view.W / s), r1(view.H / s)].join(' '));
  }

  // ---- 說明欄 ----
  var caps = {};
  [].forEach.call(root.querySelectorAll('[data-cap]'), function (c) { caps[c.getAttribute('data-cap')] = c; });
  var statusEl = root.querySelector('[data-tw-status]');
  var factsEl = root.querySelector('[data-tw-facts]');
  var stopBtns = [].slice.call(root.querySelectorAll('[data-tw-stop]'));
  var FACTS = {
    intro: [['層數', '38', '34'], ['寬度', '2432', '4608'], ['DiT 參數', '8.1B', '9.3B']],
    prompt: [['輸入', '一句話', 'JSON'], ['token 上限', '77 × 3', '2048']],
    encoder: [['encoder', 'CLIP ×2 + T5', 'Qwen3-VL-8B'], ['輸出', '154 × 4096', 'N × 53,248']],
    latent: [['latent', '128² × 16', '128² × 32'], ['每個 token', '64 維', '128 維']],
    position: [['柱子', '2 根', '1 根'], ['位置', '入口加 2D 表', '每層旋轉 q、k']],
    layer: [['每層參數', '213M', '264M'], ['寬 × 層數', '2432 × 38', '4608 × 34']],
    'layer-ada': [['adaLN', '71M · 33%', '9.4M · 3.6%'], ['調變來源', 't + pooled', '只有 t']],
    'layer-norm': [['Norm', 'LayerNorm', 'RMSNorm'], ['調變', 'scale + shift', 'scale']],
    'layer-attn': [['heads', '38 × 64', '18 × 256'], ['QKV 權重', '2 組', '1 組']],
    'layer-mlp': [['MLP', 'GELU 9728', 'SwiGLU 12288'], ['參數', '95M', '170M']],
    'layer-gate': [['gate', '× gate', '× tanh(gate)'], ['下一站', '第 2 層', '第 2 層']],
    last: [['輸出', '只有圖片流', '只取圖片 token'], ['一次 forward', fmtF(COST.sd.pass), fmtF(COST.ig.cond)]],
    exit: [['輸出', 'v · 128² × 16', 'v · 128² × 32'], ['取樣器', 'DPM++ 2M', 'Euler']],
    cost: [['一張圖', fmtF(COST.sd.total), fmtF(COST.ig.total)], ['每一步', fmtF(COST.sd.step), fmtF(COST.ig.step)], ['權重 bf16', '≈ ' + COST.sd.mem.toFixed(0) + ' GB', '≈ ' + COST.ig.mem.toFixed(0) + ' GB']]
  };
  // 第 6、9 站的數字跟著捲動變
  var live = { middle: null, loop: null };
  var LAYER_SUBS = ['ada', 'norm', 'attn', 'mlp', 'gate'];
  function capKey(beat, t) {
    if (beat !== 'layer') return beat;
    if (t < 0.2) return 'layer';
    return 'layer-' + LAYER_SUBS[Math.min(4, Math.floor((t - 0.2) / 0.8 * 5))];
  }
  var shownCap = '', factsHTML = '';
  function renderPanel(beat, key, p) {
    if (key !== shownCap) {
      if (caps[shownCap]) caps[shownCap].classList.remove('is-on');
      if (caps[key]) caps[key].classList.add('is-on');
      shownCap = key;
      var si0 = STOPS.indexOf(beat);
      statusEl.textContent = si0 >= 0 ? 'Stop ' + (si0 < 9 ? '0' : '') + (si0 + 1) + ' / 10' : 'Overview';
    }
    var rows = live[key] || FACTS[key] || [];
    var html = '<dt></dt><dd class="sd">SD 3.5</dd><dd class="ig">Ideogram 4</dd>' +
      rows.map(function (f) { return '<dt>' + f[0] + '</dt><dd>' + f[1] + '</dd><dd>' + f[2] + '</dd>'; }).join('');
    if (html !== factsHTML) { factsEl.innerHTML = html; factsHTML = html; }
    var si = STOPS.indexOf(beat);
    stopBtns.forEach(function (b, i) {
      b.classList.toggle('is-on', i === si);
      var v = i < si ? 1 : i === si ? localT(beat, p) : 0;
      b.querySelector('[data-tw-bar]').style.setProperty('--p', r1(v * 100) / 100);
    });
    root.classList.toggle('is-end', p > 0.97);
  }

  // ---- 每一幀 ----
  function render(p) {
    var t = {};
    BEATS.forEach(function (b) { t[b[0]] = localT(b[0], p); });
    var beat = beatAt(p);

    // Stop 1
    show(prompt.sd, seg(t.prompt, 0, 0.2) || (t.intro > 0.6 ? 0.35 : 0));
    show(prompt.ig, seg(t.prompt, 0, 0.2) || (t.intro > 0.6 ? 0.35 : 0));
    var fill = seg(t.prompt, 0.15, 0.6), pad = seg(t.prompt, 0.6, 0.85);
    prompt.sdRows.forEach(function (r) {
      var on = Math.round(r.n * fill), padded = Math.round((77 - r.n) * pad);
      r.cells.forEach(function (c, k) { set(c, 'class', k < on ? 'cell on' : k >= r.n && k < r.n + padded ? 'cell pad' : 'cell'); });
      r.lab.textContent = r.name + ' ' + on + '/77';
    });
    var lines = Math.floor(seg(t.prompt, 0.1, 0.55) * prompt.igLines.length + 0.999);
    prompt.igLines.forEach(function (l, i) { show(l, i < lines ? 1 : 0.15); });
    show(prompt.swatch, lines > 4 ? 1 : 0);
    var tok = 300 * seg(t.prompt, 0.2, 0.75);
    set(prompt.meter, 'width', r1(318 * tok / 2048));
    prompt.count.textContent = '≈ ' + Math.round(tok) + ' / 2048';

    // Stop 2
    var eOn = seg(t.encoder, 0, 0.15), scan = seg(t.encoder, 0.12, 0.7);
    show(enc.sd, eOn); show(enc.ig, eOn);
    enc.sdTowers.forEach(function (tw) {
      tw.layers.forEach(function (b, i) {
        var lit = (i + 1) / tw.s.n <= scan + 1e-6;
        b.g.setAttribute('class', 'tw-box' + (lit && i === tw.s.tap ? ' is-hot' : lit ? '' : ' is-ghost'));
      });
    });
    var tapSet = {};
    enc.taps.forEach(function (tp) { tapSet[tp.li] = true; });
    enc.qwen.forEach(function (b, i) {
      var lit = (i + 1) / 36 <= scan + 1e-6;
      b.g.setAttribute('class', 'tw-box' + (lit && tapSet[i] ? ' is-hot' : lit ? '' : ' is-ghost'));
    });
    enc.taps.forEach(function (tp) {
      var lit = (tp.li + 1) / 36 <= scan + 1e-6;
      show(tp.lead, lit ? 1 : 0.15);
      set(tp.sq, 'class', lit ? 'f-l' : 'f-line');
    });
    show(enc.sdOut, seg(t.encoder, 0.7, 0.82));
    show(enc.igOut, seg(t.encoder, 0.7, 0.82));
    draw(enc.sdPipe, seg(t.encoder, 0.78, 1));
    draw(enc.igPipe, seg(t.encoder, 0.78, 1));
    show(enc.pool, seg(t.encoder, 0.8, 0.92));
    draw(enc.poolWire, seg(t.encoder, 0.8, 0.92));

    // Stop 3
    ['sd', 'ig'].forEach(function (k) {
      var s = lat[k], n = s.sheets.length;
      show(s.g, seg(t.latent, 0, 0.1));
      s.sheets.forEach(function (b, i) { show(b.g, seg(t.latent, 0.05 + 0.4 * i / n, 0.1 + 0.4 * i / n)); });
      show(s.pat, seg(t.latent, 0.5, 0.65));
      draw(s.pipe, seg(t.latent, 0.6, 0.95));
    });

    // Stop 4
    var gIn = seg(t.position, 0, 0.25);
    show(gate.sd, gIn); show(gate.ig, gIn);
    var drop = ease(seg(t.position, 0.25, 0.6)), peY = lerp(-130, -52, drop);
    gate.pe.set(172, peY, 158, 4, DZ);
    show(gate.pe.g, seg(t.position, 0.2, 0.3));
    set(gate.peLab, 'y', r1(peY - 6));
    set(gate.peLead, 'd', 'M' + (LEFT_LABEL + 6) + ' ' + r1(peY) + 'H170');
    show(gate.peLab, seg(t.position, 0.2, 0.3)); show(gate.peLead, seg(t.position, 0.2, 0.3));
    var rotT = seg(t.position, 0.45, 0.85);
    function rotOn(i) { return seg(rotT, i / 34 * 0.7, i / 34 * 0.7 + 0.3); }

    // Stop 5：拆開第 1 層
    var k = ease(seg(t.layer, 0, 0.18)) * (1 - ease(seg(t.middle, 0, 0.15)));
    var key = capKey(beat, t.layer);
    var hot = key.indexOf('layer-') === 0 ? key.slice(6) : null;
    // Stop 6、7：目前走到的層
    var curs = { sd: -1, ig: -1 };
    if (beat === 'middle' && t.middle > 0.12) {
      var m = seg(t.middle, 0.12, 1);
      curs.sd = 1 + Math.min(35, Math.floor(m * 36));
      curs.ig = 1 + Math.min(31, Math.floor(m * 32));
    } else if (beat === 'last') { curs.sd = 37; curs.ig = 33; }
    layoutTower('sd', k, hot, function () { return 0; }, curs.sd);
    layoutTower('ig', k, hot, rotOn, curs.ig);
    ['sd', 'ig'].forEach(function (kk) {
      var tw = tower[kk], c = curs[kk], L0 = TOWERS[kk].L;
      show(tw.cur, c >= 0 ? 1 : 0);
      if (c < 0) return;
      var y = c * PITCH + TH / 2, lx = kk === 'sd' ? LEFT_LABEL : RIGHT_LABEL;
      set(tw.curLab, 'y', r1(y + 6));
      tw.curLab.textContent = 'Layer ' + (c + 1) + ' / ' + L0;
      set(tw.curNote, 'y', r1(y + 24));
      tw.curNote.textContent = beat === 'last' ? (kk === 'sd' ? '文字柱只算 K、V' : '文字的輸出會被丟掉') : '累積 ' + fmtF((c + 1) * COST[kk].block);
      set(tw.curLead, 'd', 'M' + (kk === 'sd' ? lx + 6 : lx - 6) + ' ' + r1(y) + 'H' + (kk === 'sd' ? -4 : r1(TOWERS.ig.right + DZ * KX + 4)));
    });
    live.middle = curs.sd > 0 ? [
      ['第幾層', (curs.sd + 1) + ' / 38', (curs.ig + 1) + ' / 34'],
      ['累積參數', fmtP((curs.sd + 1) * COST.sd.params), fmtP((curs.ig + 1) * COST.ig.params)],
      ['累積計算', fmtF((curs.sd + 1) * COST.sd.block), fmtF((curs.ig + 1) * COST.ig.block)]
    ] : [['每層參數', '213M', '264M'], ['每層計算', fmtF(COST.sd.block), fmtF(COST.ig.block)]];
    var titleOn = Math.max(1 - seg(t.prompt, 0, 0.2), seg(t.loop, 0.05, 0.2) * (1 - seg(t.loop, 0.85, 1)));
    show(tower.sd.base, titleOn); show(tower.ig.base, titleOn);

    // Stop 8：塔底
    ['sd', 'ig'].forEach(function (kk) {
      var o = ex[kk];
      draw(o.pipe, seg(t.exit, 0, 0.2));
      show(o.fin, seg(t.exit, 0.12, 0.3));
      draw(o.vPipe, seg(t.exit, 0.28, 0.42));
      show(o.v, seg(t.exit, 0.35, 0.55));
      draw(o.upPipe, seg(t.exit, 0.55, 0.68));
      show(o.up, seg(t.exit, 0.6, 0.78));
    });

    // Stop 9：取樣迴圈
    show(twin.g, seg(t.loop, 0.08, 0.3));
    show(sdTwice, seg(t.loop, 0.08, 0.3));
    var steps = seg(t.loop, 0.3, 0.85), done = t.loop >= 0.85;
    var n = { sd: Math.round(steps * 40), ig: Math.round(steps * 20) };
    var frac = {};
    ['sd', 'ig'].forEach(function (kk) {
      var o = ex[kk], N = COST[kk].steps, kk2 = n[kk];
      draw(o.loop, seg(t.loop, 0.02, 0.3));
      o.loopLab.textContent = t.loop > 0.02 ? 'step ' + kk2 + ' / ' + N : '';
      show(o.loopLab, seg(t.loop, 0.2, 0.3)); show(o.loopNote, seg(t.loop, 0.2, 0.3) * (kk === 'sd' ? 1 : 1));
      // 乾淨的圖佔多少：SD 用 shift = 3 的排程，IG 的 logit-normal 排程在 1024² 大致相當於 shift ≈ 2
      var sh = kk === 'sd' ? 3 : 2, sg = 1 - kk2 / N, a = kk2 >= N ? 1 : 1 - sh * sg / (1 + (sh - 1) * sg);
      frac[kk] = a;
      if (o.lastK !== kk2) {
        o.lastK = kk2;
        o.img.forEach(function (q) {
          q.r.setAttribute('fill', 'rgb(' + [0, 1, 2].map(function (j) { return Math.round(a * q.t[j] + (1 - a) * q.n[j]); }).join(',') + ')');
        });
      }
      draw(o.decPipe, seg(t.loop, 0.85, 0.95));
      show(o.dec, seg(t.loop, 0.85, 0.95));
      o.img.forEach(function (q) { if (q.r._tw_o !== (t.loop > 0.25 ? 1 : 0)) { q.r._tw_o = t.loop > 0.25 ? 1 : 0; q.r.style.opacity = q.r._tw_o; } });
      o.imgLab.textContent = done ? '1024 × 1024 ✓' : t.loop > 0.25 ? '第 ' + kk2 + ' 步的樣子' : '';
    });
    live.loop = [
      ['步數', n.sd + ' / 40', n.ig + ' / 20'],
      ['每步', '2 次 · 同一座塔', '2 次 · 兩座塔'],
      ['乾淨的圖', Math.round(frac.sd * 100) + '%', Math.round(frac.ig * 100) + '%']
    ];

    // Stop 10：總帳
    ['sd', 'ig'].forEach(function (kk) {
      var o = ex[kk];
      show(o.cost, seg(t.cost, 0, 0.2));
      set(o.bar, 'width', r1(o.barW * ease(seg(t.cost, 0.15, 0.6))));
      set(o.mem, 'width', r1(o.memW * ease(seg(t.cost, 0.4, 0.8))));
    });

    var modOn = seg(t.layer, 0.1, 0.2) * (1 - seg(t.middle, 0, 0.15));
    show(mod.sd, modOn); show(mod.ig, modOn);
    var sdAda = tower.sd.subs[0], igAda = tower.ig.subs[0];
    set(mod.sdWire, 'd', 'M-46 -99H-8V' + r1(sdAda.y + sdAda.h / 2) + 'H-2');
    set(mod.igWire, 'd', 'M846 -99H824V' + r1(igAda.y + igAda.h / 2) + 'H' + r1(770 + DZ * KX + 2));
    mod.sdWire.style.strokeWidth = hot === 'ada' ? 2.4 : '';
    mod.igWire.style.strokeWidth = hot === 'ada' ? 2.4 : '';
    draw(mod.sdPool, modOn);

    renderCamera(camera(p));
    renderPanel(beat, capKey(beat, t.layer), p);
    autoplay.render(p);
  }

  function progress() {
    var r = track.getBoundingClientRect(), range = r.height - stage.offsetHeight;
    var hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    return range > 0 ? clamp01((hh - r.top) / range) : 1;
  }
  var ticking = false;
  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; render(progress()); });
  }

  // 停靠站按鈕：捲到那一站的開頭
  function trackTop() {
    var hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    return track.getBoundingClientRect().top + window.scrollY - hh;
  }
  function scrollToP(p, smooth) {
    window.scrollTo({ top: trackTop() + (track.offsetHeight - stage.offsetHeight) * p, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  }
  stopBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var s = spans[b.getAttribute('data-tw-stop')];
      scrollToP(s.start + s.len * 0.3, true);
    });
  });

  // ---- 自動播放：照固定速度把 p 推到 1，用 scrollTo 帶著頁面捲；使用者一碰滾輪、觸控或按鍵就停 ----
  var autoplay = (function () {
    var btn = root.querySelector('[data-tw-play]');
    if (!btn || reduceMotion) { if (btn) btn.hidden = true; return { render: function () {} }; }
    var label = btn.querySelector('[data-tw-play-label]');
    var FULL = 36000;
    var raf = 0, p0 = 0, t0 = 0, setY = 0, shown = '';
    function range() { return [trackTop(), track.offsetHeight - stage.offsetHeight]; }
    function tick(ts) {
      if (!t0) t0 = ts;
      if (Math.abs(window.scrollY - setY) > 2) return stop();
      var p = Math.min(1, p0 + (ts - t0) / FULL), r = range();
      window.scrollTo(0, r[0] + r[1] * p);
      setY = window.scrollY;
      if (p >= 1) return stop();
      raf = requestAnimationFrame(tick);
    }
    function start() {
      p0 = progress();
      if (p0 >= 0.98) { p0 = 0; window.scrollTo(0, range()[0]); }
      setY = window.scrollY; t0 = 0;
      raf = requestAnimationFrame(tick);
      render(p0);
    }
    function stop() {
      if (!raf) return;
      cancelAnimationFrame(raf); raf = 0;
      render(progress());
    }
    function render(p) {
      var state = raf ? 'run' : p >= 0.98 ? 'done' : 'idle';
      if (state === shown) return;
      shown = state;
      btn.setAttribute('data-state', state);
      label.textContent = state === 'run' ? 'Pause' : state === 'done' ? 'Replay' : 'Auto-play';
    }
    btn.addEventListener('click', function () { if (raf) stop(); else start(); });
    function interrupt(e) { if (raf && !btn.contains(e.target)) stop(); }
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pointerdown', interrupt);
    window.addEventListener('keydown', interrupt);
    return { render: render };
  })();

  root.classList.add('is-live');
  measure();
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { measure(); request(); });
  if ('ResizeObserver' in window) new ResizeObserver(function () { measure(); request(); }).observe(stage);
  render(progress());
})();
