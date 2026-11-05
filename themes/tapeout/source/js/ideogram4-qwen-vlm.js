/* Ideogram 4 的 VLM（Qwen3-VL-8B）inference 解說（layout: ideogram4-qwen-vlm）
   左邊一座 Qwen 的塔（36 × 4096），右邊一座 Ideogram 4 的 DiT（34 × 4608），板子寬度照 hidden size 畫（4608 → 300）。
   前半段鏡頭從 prompt 走進 Qwen 的每一層，後半段把兩邊的第 1 層一起拆開比較。
   舞台用 position: sticky 釘住，捲過 .qv-track 的距離換成 0–1 的進度 p，再分給各段（BEATS）自己的局部進度 t，
   每一幀都只從 p 算出畫面，所以往回捲、點停靠站都對。
   規格出自 ideogram-oss/ideogram4（pipeline_ideogram4.py、modeling_ideogram4.py）與 Qwen3-VL-8B-Instruct 的 config.json。 */
(function () {
  'use strict';

  var root = document.querySelector('[data-qv]');
  if (!root) return;
  var track = root.querySelector('.qv-track');
  var stage = root.querySelector('.qv-stage');
  var svg = root.querySelector('[data-qv-world]');
  var panel = root.querySelector('.qv-panel');
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
    var key = '_qv_' + k;
    if (e[key] === v) return;
    e[key] = v;
    e.setAttribute(k, v);
  }
  function show(e, o) { set(e, 'opacity', r1(o * 100) / 100); }
  function txt(e, s) { if (e._qv_text !== s) { e._qv_text = s; e.textContent = s; } }
  function cls(e, c) { set(e, 'class', c); }
  function T(g, x, y, s, c, anchor, size) {
    return el('text', { x: x, y: y, class: c || null, 'text-anchor': anchor || null, style: size ? 'font-size:' + size + 'px' : null }, g, s);
  }
  // pathLength = 1 的線：k = 0 看不到，k = 1 整條畫完
  function wire(g, d, c) { return el('path', { d: d, class: c, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, g); }
  function draw(e, k) { set(e, 'stroke-dashoffset', r1((1 - k) * 1000) / 1000); set(e, 'opacity', k > 0 ? 1 : 0); }
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- 規格與數字（MAC = 乘加次數，只算矩陣乘法；1024²、T = 333、20 步） ----
  var Q = { L: 36, H: 4096, heads: 32, kv: 8, hd: 128, F: 12288, vocab: 151936 };
  var D = { L: 34, H: 4608, heads: 18, hd: 256, F: 12288, A: 512, E: 4096 * 13 };
  var TT = 333, IMG = 4096, LC = TT + IMG, STEPS = 20;
  var TAPS = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 35];
  var qTok = 2 * Q.H * Q.H + 2 * Q.H * Q.kv * Q.hd + 3 * Q.H * Q.F; // 每 token 每層的線性層
  var dTok = 4 * D.H * D.H + 3 * D.H * D.F;
  function qLayer(n) { return n * qTok + 2 * n * n * Q.H; }
  var qLayerMac = qLayer(TT), qTotal = Q.L * qLayerMac, qPad = Q.L * qLayer(LC);
  function dBlock(n) { return n * dTok + 2 * n * n * D.H + 4 * D.A * D.H; }
  function dPass(n) { return D.L * dBlock(n) + n * 128 * D.H + n * D.E * D.H + n * D.H * 128 + 2 * D.H * D.H + 2 * D.H * D.A; }
  var dStep = dPass(LC) + dPass(IMG), dTotal = STEPS * dStep, VAE = 5.237326741504e12;
  var pipeRef = qPad + dTotal + VAE, pipeMin = qTotal + dTotal + VAE;
  function fmt(n) {
    if (n >= 1e12) return (n / 1e12).toFixed(n >= 1e14 ? 0 : n >= 1e13 ? 1 : 2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' T';
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e11 ? 0 : 1) + ' G';
    return (n / 1e6).toFixed(1) + ' M';
  }
  function pct(a, b) { var v = 100 * a / b; return (v < 1 ? v.toFixed(2) : v.toFixed(1)) + '%'; }

  // ---- 斜投影：(x, y, z) → (x + z·KX, y − z·KY)，看得到正面、頂面和右側面 ----
  var KX = 0.55, KY = 0.38;
  function Box(parent, c) {
    var g = el('g', { class: 'qv-box ' + (c || '') }, parent);
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
  var DZ = 70, PITCH = 20, TH = 14, SUBGAP = 20, DX = DZ * KX, DY = DZ * KY;
  var TW = {
    q: { L: 36, x: 0, w: 267, lab: -18, anchor: 'end' },
    d: { L: 34, x: 620, w: 300, lab: 986, anchor: 'start' }
  };
  TW.q.right = TW.q.x + TW.q.w; TW.d.right = TW.d.x + TW.d.w;
  // 第 1 層拆開之後的每一塊：厚度 ∝ 參數量 ÷ 寬度，所以面積 ∝ 參數量（跟「兩座塔」同一個比例尺，170M / 300 寬 → 90）
  // 兩邊的清單一一對應（同一個 k 在同一個位置），比較時才能拉線；ghost 是「DiT 有、Qwen 沒有」的空格，只在比較時長出來
  // parts：同一塊裡左右並排的幾個矩陣（寬度比例）；heads：每個矩陣切成幾個 head
  var SUB = {
    q: [
      { k: 'ada', h: 5, label: '（沒有 adaLN）', ghost: true },
      { k: 'norm', h: 3, label: 'RMSNorm' },
      { k: 'qkv', h: 15.1, label: 'Q ‖ K ‖ V · 25.2M', parts: [4, 1, 1], heads: [32, 8, 8], names: ['Q', 'K', 'V'] },
      { k: 'rope', h: 4, label: 'QK-norm · MRoPE' },
      { k: 'attn', h: 8, label: 'Attention · causal', hatch: true },
      { k: 'o', h: 10.1, label: 'O · 16.8M' },
      { k: 'post', h: 3, label: '（沒有 post-norm）', ghost: true, gap: 4 },
      { k: 'norm', h: 3, label: 'RMSNorm' },
      { k: 'mlp', h: 59.9, label: 'gate ‖ up · 100.7M', parts: [1, 1], names: ['gate', 'up'] },
      { k: 'mlp', h: 30, label: 'down · 50.3M' },
      { k: 'post', h: 3, label: null, ghost: true, gap: 4 }
    ],
    d: [
      { k: 'ada', h: 5, label: 'adaLN · 9.4M' },
      { k: 'norm', h: 3, label: 'RMSNorm · ×(1+s)' },
      { k: 'qkv', h: 33.8, label: 'Q ‖ K ‖ V · 63.7M', parts: [1, 1, 1], heads: [18, 18, 18], names: ['Q', 'K', 'V'] },
      { k: 'rope', h: 4, label: 'QK-norm · MRoPE' },
      { k: 'attn', h: 8, label: 'Attention · full', hatch: true },
      { k: 'o', h: 11.3, label: 'O · 21.2M' },
      { k: 'post', h: 3, label: 'RMSNorm · ×tanh(g)', gap: 4 },
      { k: 'norm', h: 3, label: 'RMSNorm · ×(1+s)' },
      { k: 'mlp', h: 60, label: 'gate ‖ up · 113.2M', parts: [1, 1], names: ['gate', 'up'] },
      { k: 'mlp', h: 30, label: 'down · 56.6M' },
      { k: 'post', h: 3, label: 'RMSNorm · ×tanh(g)', gap: 4 }
    ]
  };

  var world = el('g', {}, svg);
  var LANE = { q: el('g', { class: 'lane-q' }, world), d: el('g', { class: 'lane-d' }, world) };

  // 塔身：從最下面一層往上畫，上面的板子才會蓋住下面板子的頂面
  var tower = {};
  ['q', 'd'].forEach(function (key) {
    var tw = TW[key], g = el('g', {}, LANE[key]), rows = [];
    for (var i = tw.L - 1; i >= 1; i--) rows.push({ i: i, box: Box(g) });
    var subs = SUB[key].map(function (s) { return { s: s }; });
    subs.slice().reverse().forEach(function (sb) {
      var parts = sb.s.parts || [1], sum = parts.reduce(function (a, b) { return a + b; }, 0);
      sb.fr = parts.map(function (p) { return p / sum; });
      sb.boxes = parts.map(function () { return Box(g, sb.s.ghost ? 'is-ghost' : sb.s.hatch ? 'is-hatch' : ''); });
      if (sb.s.heads) { sb.heads = el('path', { class: 'heads' }, g); }
      if (sb.s.names) sb.names = sb.s.names.map(function (n) { return T(g, 0, 0, n, 't-on', 'middle', 10); });
    });
    var first = Box(g);
    var labels = el('g', {}, LANE[key]);
    subs.forEach(function (sb) {
      if (!sb.s.label) return;
      sb.label = T(labels, tw.lab, 0, sb.s.label, sb.s.ghost ? 't-d' : null, tw.anchor, 13);
      sb.lead = el('path', { class: 'lead' }, labels);
    });
    var base = el('g', {}, LANE[key]);
    var tx = tw.x + tw.w / 2;
    var title = T(base, tx, 0, key === 'q' ? 'Qwen3-VL-8B · 語言模型' : 'Ideogram 4 · DiT', 't-l', 'middle', 18);
    var sub = T(base, tx, 0, key === 'q' ? '36 層 × 4096 · 凍結' : '34 層 × 4608', 't-d', 'middle', 13);
    var cur = el('g', {}, LANE[key]);
    var curLab = T(cur, tw.lab, 0, '', 't-l', tw.anchor, 16);
    var curNote = T(cur, tw.lab, 0, '', 't-d', tw.anchor, 12);
    var curLead = el('path', { class: 'lead' }, cur);
    tower[key] = { rows: rows, subs: subs, first: first, title: title, sub: sub, cur: cur, curLab: curLab, curNote: curNote, curLead: curLead, off: 0 };
  });

  // k：第 1 層拆開的程度；kg：ghost 空格長出來的程度；hot：現在講的那幾種塊；cur：鏡頭走到第幾層（-1 = 沒有）
  function layoutTower(key, k, kg, hot, cur) {
    var t = tower[key], tw = TW[key];
    var sum = SUB[key].reduce(function (s, x) { return s + (x.ghost ? 0 : x.h); }, 0);
    var scale = lerp(TH / sum, 1, k), y = 0;
    t.subs.forEach(function (sb) {
      var s = sb.s, h = s.ghost ? s.h * kg : s.h * scale;
      var on = !!hot && hot.indexOf(s.k) >= 0;
      var o = s.ghost ? kg * (hot && !on ? 0.5 : 1) : k > 0 ? (hot && !on ? 0.4 : 1) : 0;
      sb.y = y; sb.h = h;
      var x = tw.x;
      sb.boxes.forEach(function (b, j) {
        var w = tw.w * sb.fr[j];
        b.set(x, y, w, h, DZ);
        b.g.classList.toggle('is-hot', on && !s.ghost);
        show(b.g, o);
        if (sb.names) {
          set(sb.names[j], 'x', r1(x + w / 2)); set(sb.names[j], 'y', r1(y + h / 2 + 3.5));
          show(sb.names[j], on && h > 12 ? o : 0);
        }
        x += w;
      });
      if (sb.heads) {
        var d = '', hx = tw.x;
        if (on && k > 0.5) sb.s.heads.forEach(function (n, j) {
          var w = tw.w * sb.fr[j];
          for (var m = 1; m < n; m++) d += 'M' + r1(hx + w * m / n) + ' ' + r1(y + 1) + 'v' + r1(Math.max(0, h - 2));
          hx += w;
        });
        set(sb.heads, 'd', d || 'M0 0');
        show(sb.heads, d ? 1 : 0);
      }
      if (sb.label) {
        var lo = seg(k, 0.6, 1) * (s.ghost ? kg : 1) * (hot && !on ? 0.4 : 1);
        set(sb.label, 'y', r1(y + h / 2 + 4));
        set(sb.label, 'class', on && !s.ghost ? 't-l' : s.ghost ? 't-d' : '');
        show(sb.label, lo);
        var x0 = key === 'q' ? tw.lab + 6 : tw.lab - 6, x1 = key === 'q' ? tw.x - 3 : tw.right + DX * 0.5;
        set(sb.lead, 'd', 'M' + x0 + ' ' + r1(y + h / 2) + 'H' + r1(x1));
        show(sb.lead, lo);
      }
      y += h + (s.gap != null ? s.gap : SUBGAP) * (s.ghost ? kg : k);
    });
    t.off = y - TH + 16 * k;
    t.rows.forEach(function (row) {
      row.box.set(tw.x, row.i * PITCH + t.off, tw.w, TH, DZ);
      row.box.g.classList.toggle('is-hot', row.i === cur);
      row.box.g.classList.toggle('is-past', cur >= 0 && row.i < cur);
    });
    t.first.set(tw.x, 0, tw.w, TH, DZ);
    show(t.first.g, 1 - seg(k, 0, 0.25));
    t.first.g.classList.toggle('is-hot', cur === 0);
    t.first.g.classList.toggle('is-past', cur > 0);
    var bottom = (tw.L - 1) * PITCH + TH + t.off;
    set(t.title, 'y', r1(bottom + 44));
    set(t.sub, 'y', r1(bottom + 64));
  }
  function subOf(key, k) { return tower[key].subs.filter(function (sb) { return sb.s.k === k && !sb.s.ghost; }); }

  // ---- Qwen 上面：prompt、token、嵌入表 ----
  var above = el('g', { class: 'lane-q' }, world);
  var prompt = (function () {
    var g = el('g', {}, above), out = { g: g };
    T(g, -10, -676, 'JSON prompt + chat template', 't-l', null, 13);
    el('rect', { x: -10, y: -664, width: 300, height: 176, rx: 6, class: 'card-l' }, g);
    var lines = [
      ['<|im_start|>user', 't-d'],
      ['{"high_level_description":', 't-b'],
      ['   "A corgi astronaut on the moon…",', 't-b'],
      [' "style_description": {"medium": "photo"},', 't-b'],
      [' "compositional_deconstruction": {', 't-b'],
      ['   "elements": [{"bbox": [120, 80, …]}]}}', 't-b'],
      ['<|im_end|>', 't-d'],
      ['<|im_start|>assistant', 't-d']
    ];
    out.lines = lines.map(function (l, i) { return T(g, 2, -640 + i * 19, l[0], 't-pre ' + l[1], null, 11.5); });
    // token：兩排小格子代表 333 個 token（一格 ≈ 4.6 個）
    out.chips = [];
    for (var r = 0; r < 2; r++) for (var c = 0; c < 36; c++) {
      out.chips.push(el('rect', { x: r1(c * 7.42), y: -454 + r * 13, width: 6, height: 10, rx: 1, class: 'cell' }, g));
    }
    T(g, TW.q.lab, -446, 'BPE tokenizer', 't-b', 'end', 13);
    T(g, TW.q.lab, -430, '詞表 151,936', 't-d', 'end', 12);
    out.count = T(g, 300, -436, '', 't-b', null, 13);
    out.pipe = wire(g, 'M133 -486V-460', 'pipe');
    return out;
  })();
  var embed = (function () {
    var g = el('g', {}, above), out = { g: g }, y0 = -380, rowsN = 36, rh = 5;
    el('rect', { x: 0, y: y0, width: 267, height: rowsN * rh, class: 'card' }, g);
    for (var i = 1; i < rowsN; i++) el('path', { d: 'M0 ' + (y0 + i * rh) + 'h267', class: 'rowline' }, g);
    T(g, TW.q.lab, y0 + 14, '嵌入表', 't-l', 'end', 14);
    T(g, TW.q.lab, y0 + 32, '151,936 × 4096', 't-b', 'end', 12);
    T(g, TW.q.lab, y0 + 48, '622M 參數 · 只查表', 't-d', 'end', 12);
    var rnd = rng(42);
    out.picks = [];
    for (var j = 0; j < 12; j++) {
      var ri = Math.floor(rnd() * rowsN), cx = 3 + Math.floor(rnd() * 36) * 7.42;
      out.picks.push({
        row: el('rect', { x: 0, y: y0 + ri * rh, width: 267, height: rh, class: 'f-l' }, g),
        lead: el('path', { d: 'M' + r1(cx) + ' -420C' + r1(cx) + ' -400 ' + r1(cx) + ' ' + (y0 + ri * rh + 10) + ' ' + r1(cx < 133 ? -2 : 269) + ' ' + (y0 + ri * rh + 2.5), class: 'lead' }, g)
      });
    }
    out.pipe = wire(g, 'M133 ' + (y0 + rowsN * rh + 2) + 'V-132', 'pipe');
    out.strip = Box(g, 'is-hot');
    out.strip.set(0, -124, 267, 10, DZ);
    T(g, TW.q.lab, -116, '333 × 4096', 't-l', 'end', 14);
    T(g, TW.q.lab, -100, '每個 token 一列', 't-d', 'end', 12);
    out.pos = el('g', {}, g);
    T(out.pos, 330, -126, 'pos = (i, i, i)', 't-b', null, 13);
    T(out.pos, 330, -108, '三軸同值 → 1D RoPE', 't-d', null, 12);
    out.pipe2 = wire(g, 'M133 -112V-6', 'pipe');
    return out;
  })();
  // Qwen 的 vision encoder：Ideogram 只餵文字，整座都用不到
  var vision = (function () {
    var g = el('g', { class: 'lane-q' }, world);
    Box(g, 'is-ghost').set(-330, 120, 110, 420, 40);
    T(g, -275, 96, 'Vision encoder', 't-d', 'middle', 13);
    T(g, -275, 80, 'Qwen3-VL 的 ViT', 't-d', 'middle', 12);
    var x = T(g, -264, 350, '✕', 't-x', 'middle', 60);
    T(g, -275, 568, '只餵文字，用不到', 't-d', 'middle', 12);
    return { g: g, x: x };
  })();

  // ---- 每一層的旁註：attention mask、SwiGLU、兩邊相同的連線 ----
  var side = el('g', {}, world);
  function maskFig(key, x0, causal) {
    var g = el('g', { class: key === 'q' ? 'lane-q' : 'lane-d' }, side), n = 10, cs = 11;
    for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) {
      var on = causal ? c <= r : true, text = !causal && (r < 2 || c < 2);
      el('rect', { x: c * cs, y: r * cs, width: cs - 1.5, height: cs - 1.5, rx: 1, class: on ? (text ? 'f-mid' : 'f-l') : 'f-line' }, g);
    }
    T(g, 0, -8, causal ? 'causal · T × T' : 'full · (T + 4096)²', 't-l', null, 12);
    T(g, 0, n * cs + 14, causal ? '只看自己和前面' : '文字 ↔ 圖片 互看', 't-d', null, 11);
    return { g: g, x: x0, h: n * cs };
  }
  var masks = { q: maskFig('q', 330, true), d: maskFig('d', 480, false) };
  var swi = (function () {
    var g = el('g', { class: 'lane-q' }, side);
    T(g, 330, 0, 'silu(gate) ⊙ up', 't-l', null, 13);
    T(g, 330, 18, '→ down → + residual', 't-d', null, 12);
    return g;
  })();
  var gqa = (function () {
    var g = el('g', { class: 'lane-q' }, side);
    T(g, 330, 0, '4 個 Q head', 't-b', null, 12);
    T(g, 330, 16, '共用 1 組 K、V', 't-d', null, 12);
    return g;
  })();
  var same = SUB.q.map(function (s, i) {
    if (['norm', 'rope', 'mlp'].indexOf(s.k) < 0) return null;
    var g = el('g', { class: 'lane-n' }, side);
    return { i: i, g: g, line: el('path', { class: 'same' }, g), eq: T(g, 0, 0, '=', 't-b', 'middle', 16) };
  }).filter(Boolean);

  // ---- 13 個 tap 拼成 53,248 維 ----
  var bar = (function () {
    var g = el('g', { class: 'lane-q' }, world), segH = 720 / 13, bx = 470;
    var taps = TAPS.map(function (li, j) {
      var y = li * PITCH + TH / 2, sy = j * segH + segH / 2;
      return {
        li: li,
        lead: el('path', { d: 'M' + r1(TW.q.right + DX * 0.5) + ' ' + r1(y - DY / 2) + 'C' + 400 + ' ' + r1(y - DY / 2) + ' ' + 400 + ' ' + r1(sy) + ' ' + bx + ' ' + r1(sy), class: 'lead' }, g),
        sq: el('rect', { x: bx, y: r1(j * segH + 1.5), width: 26, height: r1(segH - 3), rx: 2, class: 'f-line' }, g),
        n: T(g, bx + 13, r1(sy + 4), String(li), 't-on', 'middle', 10)
      };
    });
    T(g, bx + 13, 746, '13 × 4096', 't-b', 'middle', 12);
    T(g, bx + 13, 762, '= 53,248', 't-l', 'middle', 13);
    return { g: g, taps: taps };
  })();

  // ---- Qwen 塔底：不跑的部分 ----
  var skip = (function () {
    var g = el('g', { class: 'lane-q' }, world), y0 = 770;
    var items = [
      { h: 5, a: 'final RMSNorm', b: '第 35 層直接抓，不過最後的 norm' },
      { h: 40, a: 'LM head', b: '4096 × 151,936 · 622M' },
      { h: 12, a: 'softmax → 取樣 → 下一個字', b: '不生成，也沒有 KV cache' }
    ];
    var y = y0;
    items.forEach(function (it) {
      Box(g, 'is-ghost').set(0, y, 267, it.h, DZ);
      T(g, TW.q.lab, y + it.h / 2 + 2, it.a, 't-b', 'end', 13);
      T(g, TW.q.lab, y + it.h / 2 + 18, it.b, 't-d', 'end', 12);
      T(g, 133, y + it.h / 2 + 8, '✕', 't-x', 'middle', 22);
      y += it.h + 44;
    });
    T(g, 330, y0 + 30, '只跑一次 prefill', 't-l', null, 16);
    T(g, 330, y0 + 50, '0 個字被生成', 't-d', null, 13);
    return g;
  })();

  // ---- DiT 上面：交接（13 層的特徵 → RMSNorm → Linear → 入口） ----
  var hand = (function () {
    var g = el('g', { class: 'lane-d' }, world), out = { g: g };
    out.pipe1 = wire(g, 'M483 -2V-84', 'pipe');
    el('rect', { x: 430, y: -110, width: 170, height: 26, rx: 4, class: 'card-l' }, g);
    T(g, 515, -93, 'RMSNorm(53,248)', null, 'middle', 12);
    el('path', { d: 'M515 -110V-124', class: 'pipe' }, g);
    el('rect', { x: 430, y: -150, width: 170, height: 26, rx: 4, class: 'card-l' }, g);
    T(g, 515, -133, 'Linear → 4608', 't-b', 'middle', 12);
    T(g, 430, -160, 'DiT 的文字投影 · 245M', 't-l', null, 12);
    out.pipe2 = wire(g, 'M600 -137H632V-52', 'pipe');
    el('rect', { x: 760, y: -160, width: 160, height: 40, rx: 4, class: 'card' }, g);
    T(g, 840, -144, 'z_t · 4096 × 128', 't-b', 'middle', 12);
    T(g, 840, -128, 'Linear 128 → 4608', null, 'middle', 12);
    out.pipe3 = wire(g, 'M840 -120V-52', 'pipe-d');
    out.ent = Box(g, 'is-ink');
    out.ent.set(620, -46, 300, 12, DZ);
    var split = 620 + 300 * TT / LC;
    el('path', { d: 'M' + r1(split) + ' -46v12M' + r1(split) + ' -46l' + r1(DX) + ' ' + r1(-DY), class: 'lead' }, g);
    T(g, TW.d.lab, -42, '入口：[ 333 文字 | 4096 圖片 ]', 't-b', 'start', 13);
    T(g, TW.d.lab, -26, '+ 角色 embedding（文字 / 圖片）', 't-d', 'start', 12);
    return out;
  })();

  // ---- 取樣迴圈：forward 次數、無條件分支的分身塔 ----
  var loop = (function () {
    var g = el('g', {}, world), out = { g: g };
    var q = el('g', { class: 'lane-q' }, g);
    out.qSq = el('rect', { x: 113, y: 800, width: 40, height: 40, rx: 3, class: 'f-line' }, q);
    T(q, 133, 870, '1 次 forward', 't-l', 'middle', 18);
    T(q, 133, 892, '跟時間步無關，算一次一直用', 't-d', 'middle', 13);
    var d = el('g', { class: 'lane-d' }, g);
    out.cells = [];
    for (var s = 0; s < STEPS; s++) for (var b = 0; b < 2; b++) {
      out.cells.push(el('rect', { x: 620 + s * 15, y: 800 + b * 20, width: 12, height: 16, rx: 2, class: 'f-line' }, d));
    }
    T(d, 612, 813, '有條件', 't-d', 'end', 12);
    T(d, 612, 833, '無條件', 't-d', 'end', 12);
    out.lab = T(d, 770, 870, '', 't-l', 'middle', 18);
    T(d, 770, 892, '每步 2 次 · 兩組權重', 't-d', 'middle', 13);
    out.twin = el('g', {}, d);
    for (var i = 33; i >= 0; i--) Box(out.twin, 'is-twin').set(1080, i * PITCH, 300, TH, DZ);
    T(out.twin, 1080, -60, '無條件分支', 't-l', null, 24);
    T(out.twin, 1080, -34, '另一組 9.3B 權重 · 只送圖片 token', 't-b', null, 15);
    return out;
  })();

  // ---- 總帳 ----
  var cost = (function () {
    var g = el('g', {}, world), out = { g: g, rows: [] }, y0 = 1000, W = 900;
    T(g, 0, y0 - 24, '一張 1024² 的圖 · 矩陣乘法的總 MAC（T = 333、20 步）', 't-b', null, 15);
    [
      { lane: 'lane-d', a: 'DiT · 20 步 × 2', v: dTotal },
      { lane: 'lane-n', a: 'VAE decoder · 1 次', v: VAE },
      { lane: 'lane-q', a: 'Qwen · reference（多跑 4096 個空位置）', v: qPad, note: '佔全部 ' + pct(qPad, pipeRef) },
      { lane: 'lane-q', a: 'Qwen · 只算 333 個文字 token', v: qTotal, note: '佔全部 ' + pct(qTotal, pipeMin) }
    ].forEach(function (r, i) {
      var rg = el('g', { class: r.lane }, g), y = y0 + i * 58;
      T(rg, 0, y + 12, r.a, null, null, 13);
      var w = Math.max(1.5, W * r.v / dTotal);
      var bar = el('rect', { x: 0, y: y + 20, width: 0, height: 16, rx: 2, class: 'f-l' }, rg);
      var val = T(rg, 0, y + 33, fmt(r.v) + ' MAC' + (r.note ? '　' + r.note : ''), 't-b', null, 13);
      out.rows.push({ bar: bar, val: val, w: w });
    });
    return out;
  })();

  // ---- 段落與鏡頭 ----
  var BEATS = [['intro', 0.8], ['prompt', 1.0], ['embed', 1.0], ['qlayer', 3.4], ['stack', 1.8], ['skip', 0.8],
    ['handoff', 1.2], ['compare', 3.0], ['loop', 1.2], ['cost', 1.0]];
  var HOLD = 0.35;
  var STOPS = ['prompt', 'embed', 'qlayer', 'stack', 'skip', 'handoff', 'compare', 'loop', 'cost'];
  var total = BEATS.reduce(function (s, b) { return s + b[1]; }, HOLD), spans = {}, acc = 0;
  BEATS.forEach(function (b) { spans[b[0]] = { start: acc / total, len: b[1] / total }; acc += b[1]; });
  function localT(k, p) { return clamp01((p - spans[k].start) / spans[k].len); }
  function beatAt(p) {
    var cur = BEATS[0][0];
    BEATS.forEach(function (b) { if (p >= spans[b[0]].start) cur = b[0]; });
    return cur;
  }

  var SHOTS = [
    ['intro', 0, 460, 320, 1550], ['intro', 0.25, 460, 320, 1550], ['intro', 1, 140, -560, 920],
    ['prompt', 1, 140, -540, 920],
    ['embed', 0.4, 140, -250, 920], ['embed', 1, 140, -240, 920],
    ['qlayer', 0.12, 110, 185, 780], ['qlayer', 1, 110, 195, 780],
    ['stack', 0.12, 180, 160, 1000], ['stack', 0.92, 180, 600, 1000],
    ['skip', 0.35, 10, 560, 1180], ['skip', 1, 10, 570, 1180],
    ['handoff', 0.35, 640, 220, 1150], ['handoff', 1, 640, 230, 1150],
    ['compare', 0.12, 480, 200, 1300], ['compare', 1, 480, 200, 1300],
    ['loop', 0.3, 700, 420, 1950], ['loop', 1, 700, 430, 1950],
    ['cost', 0.35, 470, 1100, 1020], ['cost', 1, 470, 1100, 1020]
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
    var s = view.fw / (c.w * (view.narrow ? 0.78 : 1));
    var minH = c.w * 0.62;
    if (!view.narrow && view.fh / s < minH) s = view.fh / minH;
    var vx = c.x - (view.fx + view.fw / 2) / s, vy = c.y - (view.fy + view.fh / 2) / s;
    set(svg, 'viewBox', [r1(vx), r1(vy), r1(view.W / s), r1(view.H / s)].join(' '));
  }

  // ---- 說明欄 ----
  var caps = {};
  [].forEach.call(root.querySelectorAll('[data-cap]'), function (c) { caps[c.getAttribute('data-cap')] = c; });
  var statusEl = root.querySelector('[data-qv-status]');
  var factsEl = root.querySelector('[data-qv-facts]');
  var stopBtns = [].slice.call(root.querySelectorAll('[data-qv-stop]'));
  var M = ' MAC';
  // 每一列 [項目, Qwen, DiT]；DiT 是 null 時 Qwen 那格佔兩欄
  var FACTS = {
    intro: [['層數', '36', '34'], ['寬度', '4096', '4608'], ['參數', '7.57B', '9.28B'], ['forward', '1 次', '40 次']],
    prompt: [['詞表', '151,936', null], ['這個 prompt', TT + ' token（含 template）', null], ['上限', '2048 token', null]],
    embed: [['嵌入表', '151,936 × 4096', null], ['輸出', TT + ' × 4096', null], ['MAC', '0（只查表）', null]],
    qlayer: [['每層參數', '192.9M', null], ['attention 投影', '41.9M · 22%', null], ['SwiGLU', '151.0M · 78%', null]],
    'q-norm': [['權重', '4096 個', null], ['運算', 'x / rms(x) · w', null], ['MAC', '不計（逐元素）', null]],
    'q-qkv': [['Q', '32 head × 128', null], ['K、V', '8 head × 128（GQA）', null], ['MAC', fmt(TT * Q.H * (Q.H + 2 * Q.kv * Q.hd)) + M, null]],
    'q-rope': [['QK-norm', 'RMSNorm(128)', null], ['RoPE θ', '5,000,000', null], ['位置', '(i, i, i)', null]],
    'q-attn': [['mask', 'causal', null], ['QKᵀ + AV', fmt(2 * TT * TT * Q.H) + M, null], ['隨 T 成長', '∝ T²', null]],
    'q-o': [['O', '4096 → 4096', null], ['MAC', fmt(TT * Q.H * Q.H) + M, null]],
    'q-mlp': [['SwiGLU', '4096 → 12288 → 4096', null], ['MAC', fmt(3 * TT * Q.H * Q.F) + M, null], ['佔一層', pct(3 * TT * Q.H * Q.F, qLayerMac), null]],
    skip: [['LM head', '不跑（622M）', null], ['final norm', '不跑', null], ['vision encoder', '不跑', null], ['生成', '0 個字', null]],
    handoff: [['特徵', TT + ' × 53,248', TT + ' × 4608'], ['投影', '—', '245M 參數'], ['算幾次', '1 次', '每步重算']],
    compare: [['每層參數', '192.9M', '264.3M'], ['MAC / token / 層', '192.9M', '254.8M'], ['層 × 寬', '36 × 4096', '34 × 4608']],
    'c-same': [['norm', 'RMSNorm', 'RMSNorm'], ['QK-norm', '有', '有'], ['RoPE', 'MRoPE 5e6', 'MRoPE 5e6'], ['MLP', 'SwiGLU 12288', 'SwiGLU 12288']],
    'c-mask': [['mask', 'causal', 'full'], ['序列', String(TT), TT + ' + 4096'], ['QKᵀ+AV / 層', fmt(2 * TT * TT * Q.H), fmt(2 * LC * LC * D.H)]],
    'c-heads': [['Q head', '32 × 128', '18 × 256'], ['K/V head', '8（GQA）', '18（MHA）'], ['QKV 參數', '25.2M', '63.7M']],
    'c-ada': [['時間步', '沒有', 't → 512'], ['調變', '—', '2 scale + 2 gate'], ['post-norm', '沒有', '有'], ['gate', '—', 'tanh']],
    cost: [['MAC', fmt(qTotal) + ' / ' + fmt(qPad), fmt(dTotal)], ['佔全部', pct(qTotal, pipeMin) + ' / ' + pct(qPad, pipeRef), pct(dTotal, pipeRef)], ['跑幾次', '1', '40']]
  };
  var live = {};
  var Q_SUBS = ['norm', 'qkv', 'rope', 'attn', 'o', 'mlp'], C_SUBS = ['same', 'mask', 'heads', 'ada'];
  var C_HOT = { same: ['norm', 'rope', 'mlp'], mask: ['attn'], heads: ['qkv'], ada: ['ada', 'post'] };
  function subAt(t, list) { return t < 0.15 ? null : list[Math.min(list.length - 1, Math.floor((t - 0.15) / 0.85 * list.length))]; }
  function capKey(beat, t) {
    if (beat === 'qlayer') { var a = subAt(t.qlayer, Q_SUBS); return a ? 'q-' + a : 'qlayer'; }
    if (beat === 'compare') { var b = subAt(t.compare, C_SUBS); return b ? 'c-' + b : 'compare'; }
    return beat;
  }
  var shownCap = '', factsHTML = '';
  function renderPanel(beat, key, p) {
    if (key !== shownCap) {
      if (caps[shownCap]) caps[shownCap].classList.remove('is-on');
      if (caps[key]) caps[key].classList.add('is-on');
      shownCap = key;
    }
    var si = STOPS.indexOf(beat);
    txt(statusEl, si >= 0 ? 'Stop 0' + (si + 1) + ' / 0' + STOPS.length : 'Overview');
    var rows = live[key] || FACTS[key] || [];
    var html = '<dt></dt><dd class="q">Qwen3-VL</dd><dd class="d">DiT</dd>' + rows.map(function (f) {
      return '<dt>' + f[0] + '</dt>' + (f[2] == null ? '<dd class="span">' + f[1] + '</dd>' : '<dd>' + f[1] + '</dd><dd>' + f[2] + '</dd>');
    }).join('');
    if (html !== factsHTML) { factsEl.innerHTML = html; factsHTML = html; }
    stopBtns.forEach(function (b, i) {
      b.classList.toggle('is-on', i === si);
      var v = i < si ? 1 : i === si ? localT(beat, p) : 0;
      b.querySelector('[data-qv-bar]').style.setProperty('--p', r1(v * 100) / 100);
    });
    root.classList.toggle('is-end', p > 0.97);
  }

  // ---- 每一幀 ----
  function render(p) {
    var t = {};
    BEATS.forEach(function (b) { t[b[0]] = localT(b[0], p); });
    var beat = beatAt(p);
    var key = capKey(beat, t);

    // 開場：vision encoder 只在開場和 Stop 05 出現
    show(vision.g, Math.max(1 - seg(t.intro, 0.6, 1), seg(t.skip, 0.1, 0.3) * (1 - seg(t.handoff, 0, 0.2))));
    show(vision.x, seg(t.skip, 0.2, 0.4));

    // Stop 01：prompt → token
    show(prompt.g, Math.max(0.25 * seg(t.intro, 0.5, 1), seg(t.prompt, 0, 0.15)) * (1 - seg(t.qlayer, 0, 0.1)));
    var nl = Math.ceil(seg(t.prompt, 0.05, 0.45) * prompt.lines.length);
    prompt.lines.forEach(function (l, i) { show(l, i < nl ? 1 : 0.15); });
    draw(prompt.pipe, seg(t.prompt, 0.45, 0.55));
    var tok = Math.round(TT * seg(t.prompt, 0.5, 0.95));
    var nChip = Math.round(prompt.chips.length * tok / TT);
    prompt.chips.forEach(function (c, i) { cls(c, i < nChip ? 'cell on' : 'cell'); });
    txt(prompt.count, t.prompt > 0.5 ? tok + ' / 2048 token' : '');

    // Stop 02：嵌入表
    show(embed.g, Math.max(0.25 * seg(t.intro, 0.5, 1) * (1 - seg(t.prompt, 0, 1)), seg(t.prompt, 0.8, 1), seg(t.embed, 0, 0.1)) * (1 - seg(t.qlayer, 0, 0.1)));
    embed.picks.forEach(function (pk, j) {
      var a = seg(t.embed, 0.1 + j * 0.03, 0.2 + j * 0.03);
      show(pk.row, a); show(pk.lead, a * (1 - seg(t.embed, 0.65, 0.8)) * 0.8);
    });
    draw(embed.pipe, seg(t.embed, 0.5, 0.65));
    show(embed.strip.g, seg(t.embed, 0.6, 0.72));
    show(embed.pos, seg(t.embed, 0.7, 0.85));
    draw(embed.pipe2, seg(t.embed, 0.8, 1));

    // Stop 03 / 07：拆開第 1 層
    var kq = ease(seg(t.qlayer, 0, 0.12)) * (1 - ease(seg(t.stack, 0, 0.12)));
    var kc = ease(seg(t.compare, 0, 0.12)) * (1 - ease(seg(t.loop, 0, 0.12)));
    var qSub = beat === 'qlayer' ? subAt(t.qlayer, Q_SUBS) : null;
    var cSub = beat === 'compare' ? subAt(t.compare, C_SUBS) : null;
    var hotQ = qSub ? [qSub] : cSub ? C_HOT[cSub] : null;
    var hotD = cSub ? C_HOT[cSub] : null;
    // Stop 04：鏡頭走到第幾層
    var cur = -1;
    if (beat === 'stack' && t.stack > 0.12) cur = Math.min(35, Math.floor(seg(t.stack, 0.12, 0.92) * 36));
    else if (beat === 'stack' || beat === 'skip') cur = beat === 'skip' ? 36 : -1;
    layoutTower('q', Math.max(kq, kc), kc, hotQ, cur);
    layoutTower('d', kc, 0, hotD, -1);

    // 旁註
    var attnQ = subOf('q', 'attn')[0], attnD = subOf('d', 'attn')[0];
    var mq = (qSub === 'attn' ? 1 : 0) + (cSub === 'mask' ? 1 : 0), md = cSub === 'mask' ? 1 : 0;
    set(masks.q.g, 'transform', 'translate(' + masks.q.x + ' ' + r1(attnQ.y + attnQ.h / 2 - masks.q.h / 2) + ')');
    set(masks.d.g, 'transform', 'translate(' + masks.d.x + ' ' + r1(attnD.y + attnD.h / 2 - masks.d.h / 2) + ')');
    show(masks.q.g, mq * Math.max(kq, kc)); show(masks.d.g, md * kc);
    var mlpQ = subOf('q', 'mlp')[0], qkvQ = subOf('q', 'qkv')[0];
    set(swi, 'transform', 'translate(0 ' + r1(mlpQ.y + mlpQ.h / 2) + ')');
    show(swi, qSub === 'mlp' ? kq : 0);
    set(gqa, 'transform', 'translate(0 ' + r1(qkvQ.y + qkvQ.h / 2) + ')');
    show(gqa, qSub === 'qkv' ? kq : 0);
    same.forEach(function (s) {
      var a = tower.q.subs[s.i], b = tower.d.subs[s.i];
      var ya = a.y + a.h / 2, yb = b.y + b.h / 2, x0 = TW.q.right + DX + 6, x1 = TW.d.x - 8;
      set(s.line, 'd', 'M' + r1(x0) + ' ' + r1(ya) + 'L' + r1(x1) + ' ' + r1(yb));
      set(s.eq, 'x', r1((x0 + x1) / 2)); set(s.eq, 'y', r1((ya + yb) / 2 - 4));
      show(s.g, cSub === 'same' ? kc : 0);
    });

    // 現在走到的層
    var tq = tower.q;
    show(tq.cur, cur >= 0 && cur < 36 ? 1 : 0);
    var nTap = 0;
    TAPS.forEach(function (li) { if (li <= cur) nTap++; });
    if (cur >= 0 && cur < 36) {
      var y = cur * PITCH + TH / 2, isTap = TAPS.indexOf(cur) >= 0;
      set(tq.curLab, 'y', r1(y + 6));
      txt(tq.curLab, 'Layer ' + cur + (isTap ? '  ● tap' : ''));
      set(tq.curNote, 'y', r1(y + 24));
      txt(tq.curNote, '累積 ' + fmt((cur + 1) * qLayerMac) + ' MAC');
      set(tq.curLead, 'd', 'M' + (TW.q.lab + 6) + ' ' + r1(y) + 'H-4');
    }
    live.stack = cur >= 0 ? [
      ['第幾層（從 0 數）', cur + ' / 35', null],
      ['已抓的 tap', nTap + ' / 13', null],
      ['累積 MAC', fmt((Math.min(cur, 35) + 1) * qLayerMac) + M, null]
    ] : [['每層 MAC', fmt(qLayerMac) + M, null], ['tap 的層', '0, 3, 6, …, 33, 35', null]];

    // 13 個 tap
    var kAny = Math.max(kq, kc);
    var barOn = seg(t.stack, 0.05, 0.15) * (1 - kAny) * (1 - seg(t.cost, 0, 0.2));
    show(bar.g, barOn);
    var allLit = t.stack >= 1;
    bar.taps.forEach(function (tp) {
      var lit = allLit || tp.li <= cur;
      show(tp.lead, lit ? 0.9 : 0.12);
      cls(tp.sq, lit ? 'f-l' : 'f-line');
      show(tp.n, lit ? 1 : 0);
    });

    // Stop 05：不跑的部分
    show(skip, seg(t.skip, 0.1, 0.35) * (1 - seg(t.handoff, 0, 0.2)));

    // Stop 06：交接
    var hOn = seg(t.handoff, 0, 0.15) * (1 - seg(t.cost, 0, 0.2));
    show(hand.g, hOn * (1 - kc));
    draw(hand.pipe1, seg(t.handoff, 0.1, 0.4));
    draw(hand.pipe2, seg(t.handoff, 0.4, 0.7));
    draw(hand.pipe3, seg(t.handoff, 0.55, 0.8));

    // Stop 08：取樣迴圈
    var lOn = seg(t.loop, 0.08, 0.25) * (1 - seg(t.cost, 0, 0.2));
    show(loop.g, lOn);
    show(loop.twin, seg(t.loop, 0.1, 0.3) * (1 - seg(t.cost, 0, 0.2)));
    cls(loop.qSq, t.loop > 0.2 ? 'f-l' : 'f-line');
    var passes = Math.round(seg(t.loop, 0.25, 0.9) * 40);
    loop.cells.forEach(function (c, i) {
      // 依步數排：第 s 步的有條件、無條件兩格
      cls(c, i < passes ? 'f-l' : 'f-line');
    });
    txt(loop.lab, 'step ' + Math.ceil(passes / 2) + ' / 20');
    live.loop = [['forward', '1 次', passes + ' / 40 次'], ['權重', '1 組', '2 組'], ['輸入', '文字', '文字 + 圖片 / 只有圖片']];

    // Stop 09：總帳
    show(cost.g, seg(t.cost, 0, 0.2));
    cost.rows.forEach(function (r, i) {
      var w = r.w * ease(seg(t.cost, 0.15 + i * 0.08, 0.55 + i * 0.08));
      set(r.bar, 'width', r1(Math.max(w, 0)));
      set(r.val, 'x', r1(Math.max(w, 1.5) + 10));
    });

    // 塔底的標題
    var titleOn = Math.max(1 - seg(t.prompt, 0, 0.2), seg(t.handoff, 0.05, 0.25) * (1 - seg(t.loop, 0, 0.1)));
    show(tower.q.title, titleOn); show(tower.q.sub, titleOn);
    show(tower.d.title, titleOn); show(tower.d.sub, titleOn);

    renderCamera(camera(p));
    renderPanel(beat, key, p);
    autoplay.render(p);
  }

  function headerH() { return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64; }
  function progress() {
    var r = track.getBoundingClientRect(), range = r.height - stage.offsetHeight;
    return range > 0 ? clamp01((headerH() - r.top) / range) : 1;
  }
  var ticking = false;
  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; render(progress()); });
  }

  // 停靠站按鈕：捲到那一站的 30% 處
  function trackTop() { return track.getBoundingClientRect().top + window.scrollY - headerH(); }
  function scrollToP(p, smooth) {
    window.scrollTo({ top: trackTop() + (track.offsetHeight - stage.offsetHeight) * p, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
  }
  stopBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var s = spans[b.getAttribute('data-qv-stop')];
      scrollToP(s.start + s.len * 0.3, true);
    });
  });

  // ---- 自動播放：照固定速度把 p 推到 1，用 scrollTo 帶著頁面捲；使用者一碰滾輪、觸控或按鍵就停 ----
  var autoplay = (function () {
    var btn = root.querySelector('[data-qv-play]');
    if (!btn || reduceMotion) { if (btn) btn.hidden = true; return { render: function () {} }; }
    var label = btn.querySelector('[data-qv-play-label]');
    var FULL = 40000;
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

  // reduced-motion：不釘舞台、不捲動驅動，只留說明文字（同沒有 JS 的樣子）
  if (reduceMotion) { root.classList.add('is-static'); return; }
  root.classList.add('is-live');
  measure();
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { measure(); request(); });
  if ('ResizeObserver' in window) new ResizeObserver(function () { measure(); request(); }).observe(stage);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); request(); });
  render(progress());
})();
