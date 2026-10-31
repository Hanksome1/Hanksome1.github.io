// SwiGLU vs 以往的啟動函數：所有數字都從 Ideogram 4 的規格（d = 4608、h = 12288、34 層）當場算出來
var SG = (function () {
  'use strict';
  var D = 4608, H = 12288, LAYERS = 34, TOKENS = 4096, ADA = 512;
  var SD = { d: 2432, h: 9728 };
  function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }
  function relu(x) { return x > 0 ? x : 0; }
  function gelu(x) { return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * x * x * x))); } // tanh 近似，SD 3.5 用的版本
  function silu(x) { return x * sigmoid(x); }
  // 一層的參數：attention 4d²（qkv + o，沒有 bias）、調變 512 → 4d（有 bias）、MLP 3dh
  var mlp = 3 * D * H, attn = 4 * D * D, mod = ADA * 4 * D + 4 * D, layer = mlp + attn + mod;
  // 每個 token、每一層：矩陣乘法 2 FLOPs / MAC；逐點運算的 op 數是估計（ReLU 1、GELU ≈ 8、SiLU ≈ 4 + 乘 1）
  var OPS = { relu: 1, gelu: 8, swiglu: 5 };
  var flops = {
    matmul: 2 * mlp,
    relu: OPS.relu * 4 * D,
    gelu: OPS.gelu * 4 * D,
    swiglu: OPS.swiglu * H
  };
  function minOf(f) { var m = 0, xm = 0; for (var x = -5; x < 0; x += 1e-4) { var y = f(x); if (y < m) { m = y; xm = x; } } return { x: xm, y: m }; }
  return {
    D: D, H: H, LAYERS: LAYERS, TOKENS: TOKENS, SD: SD,
    relu: relu, gelu: gelu, silu: silu,
    params: { mlp: mlp, attn: attn, mod: mod, layer: layer },
    flops: flops, OPS: OPS,
    min: { gelu: minOf(gelu), silu: minOf(silu) }
  };
})();
(function () {
  'use strict';
  var html = document.documentElement;
  var root = document.querySelector('[data-sg]');
  if (!root || !window.SG) return;
  document.body.classList.add('is-swiglu');
  var track = root.querySelector('.sg-track'), stage = root.querySelector('.sg-stage');
  var svg = root.querySelector('[data-world]'), panel = root.querySelector('.sg-panel');
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
  function T(g, x, y, s, cls) { return el('text', { x: x, y: y, class: cls }, g, s); }
  // 值沒變就不寫回 DOM
  function set(e, k, v) { var key = '_x_' + k; if (e[key] === v) return; e[key] = v; e.setAttribute(k, v); }
  function show(e, o) { set(e, 'opacity', Math.round(o * 100) / 100); }
  function text(e, s) { if (e._t !== s) { e._t = s; e.textContent = s; } }
  function wire(g, d, cls) { return el('path', { d: d, class: cls, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1, opacity: 0 }, g); }
  function draw(e, k) { set(e, 'stroke-dashoffset', Math.round((1 - k) * 1000) / 1000); set(e, 'opacity', k > 0 ? 1 : 0); }
  function hide(e) { e.setAttribute('opacity', 0); return e; }
  function fmt(n, d) { return n.toFixed(d).replace('-', '−'); }
  function comma(n) { return Math.round(n).toLocaleString('en-US'); }
  function big(n) { // 339738624 → 339.7M
    if (n >= 1e12) return fmt(n / 1e12, 2) + 'T';
    if (n >= 1e9) return fmt(n / 1e9, 2) + 'B';
    if (n >= 1e6) return fmt(n / 1e6, 1) + 'M';
    if (n >= 1e3) return fmt(n / 1e3, n >= 1e5 ? 0 : 1) + 'K';
    return String(Math.round(n));
  }
  function pct(x, d) { return fmt(x * 100, d == null ? 1 : d) + '%'; }
  function Box(g, x, y, w, h, cls) { return el('rect', { x: x, y: y, width: w, height: h, rx: 3, class: cls || 'box' }, g); }
  // 一格有數字的方塊：值、顏色都可以換
  function Num(g, x, y, w, h) {
    var gg = el('g', {}, g), bg = el('rect', { x: x, y: y, width: w, height: h, rx: 2, class: 'cell f-p', 'fill-opacity': 0 }, gg);
    el('rect', { x: x, y: y, width: w, height: h, rx: 2, class: 'frame' }, gg);
    var tx = T(gg, x + w / 2, y + h / 2 + 5, '', 't-b mid');
    return { g: gg, upd: function (v, s, vmax) {
      text(tx, s == null ? '' : s);
      set(bg, 'class', 'cell ' + (v >= 0 ? 'f-p' : 'f-n'));
      set(bg, 'fill-opacity', s == null ? 0 : Math.round(Math.min(0.55, Math.abs(v) / vmax * 0.55) * 100) / 100);
    } };
  }

  var D = SG.D, H = SG.H, P = SG.params, F = SG.flops, L = SG.LAYERS, N = SG.TOKENS;
  var stepMatmul = F.matmul * N * L, stepDiff = (F.gelu - F.swiglu) * N * L;

  // ================= 世界：建一次，之後每幀只改屬性 =================
  var W = {}, regions = [];
  // 一段一個 <g>，鏡頭離開時淡掉，才不會跟下一段疊在一起
  function region(cy) { var g = el('g', {}, svg); regions.push({ g: g, cy: cy }); return g; }

  // ---- R0：FFN 的骨架、Ideogram 4 一層的參數 ----
  (function () {
    var g = region(0), cy = -102;
    T(g, 0, -244, 'FFN(x) = W₂ · f(W₁ x)', 't-serif');
    T(g, 1000, -244, '每個 token 各算一次', 't-d end');
    W.pipe = [];
    function step(fn) { var gg = hide(el('g', {}, g)); fn(gg); W.pipe.push(gg); return gg; }
    function col(gg, x, h, cls) { el('rect', { x: x, y: cy - h / 2, width: 24, height: h, rx: 2, class: cls }, gg); }
    function trap(gg, x0, x1, h0, h1, label, sub) {
      el('path', { d: 'M' + x0 + ' ' + (cy - h0 / 2) + ' L' + x1 + ' ' + (cy - h1 / 2) + ' L' + x1 + ' ' + (cy + h1 / 2) + ' L' + x0 + ' ' + (cy + h0 / 2) + ' Z', class: 'card' }, gg);
      T(gg, (x0 + x1) / 2, cy + 5, label, 't-b mid');
      T(gg, (x0 + x1) / 2, cy + Math.max(h0, h1) / 2 + 24, sub, 't-s mid');
    }
    step(function (gg) { var lc = el('g', { class: 'lane-c' }, gg); col(lc, 40, 40, 'f-l'); T(gg, 52, cy - 32, 'x', 't-b mid'); T(gg, 52, cy + 44, 'd', 't-s mid'); });
    step(function (gg) { trap(gg, 84, 250, 40, 160, 'W₁', 'd → 4d'); });
    step(function (gg) {
      var lc = el('g', { class: 'lane-c' }, gg); col(lc, 266, 160, 'f-l'); T(gg, 278, cy - 92, 'u', 't-b mid'); T(gg, 278, cy + 104, '4d', 't-s mid');
      var la = el('g', { class: 'lane-a' }, gg);
      el('circle', { cx: 345, cy: cy, r: 30, class: 'box is-on' }, la);
      T(la, 345, cy + 6, 'f', 't-l mid');
      el('path', { d: 'M290 ' + cy + ' H315 M375 ' + cy + ' H400', class: 'wire' }, gg);
      T(gg, 345, cy + 60, 'ReLU / GELU', 't-s mid');
    });
    step(function (gg) { var la = el('g', { class: 'lane-a' }, gg); col(la, 404, 160, 'f-l'); T(gg, 416, cy - 92, 'f(u)', 't-b mid'); T(gg, 416, cy + 104, '4d', 't-s mid'); });
    step(function (gg) {
      trap(gg, 444, 610, 160, 40, 'W₂', '4d → d');
      var lc = el('g', { class: 'lane-c' }, gg); col(lc, 626, 40, 'f-l'); T(gg, 638, cy - 32, 'y', 't-b mid'); T(gg, 638, cy + 44, 'd', 't-s mid');
    });
    W.introNote = hide(el('g', {}, g));
    T(W.introNote, 700, cy - 50, '中間那格 f 就是啟動函數。', 't-b');
    T(W.introNote, 700, cy - 24, '它逐格作用：u 的每一格', 't-d');
    T(W.introNote, 700, cy - 4, '只看自己，算出 f(u) 的同一格。', 't-d');
    T(W.introNote, 700, cy + 30, 'SwiGLU 要改的就是這一段。', 't-h');

    // 一層的參數，寬度照比例
    var y = 120, w = 1000, parts = [['s-mod', P.mod, '調變'], ['s-attn', P.attn, 'Attention'], ['s-mlp', P.mlp, 'MLP · SwiGLU']];
    T(g, 0, y - 22, 'Ideogram 4 的一層 · ' + big(P.layer) + ' 參數', 't-b');
    W.layerBar = []; var x = 0;
    parts.forEach(function (p) {
      var pw = p[1] / P.layer * w, r = el('rect', { x: x, y: y, width: 0, height: 44, class: 'slab ' + p[0] + (p[0] === 's-mlp' ? ' is-on' : '') }, g);
      var lbl = hide(T(g, p[0] === 's-mod' ? x : x + pw / 2, y + (p[0] === 's-mod' ? 94 : 72), p[2] + ' · ' + big(p[1]) + ' · ' + pct(p[1] / P.layer), p[0] === 's-mlp' ? 't-h mid' : p[0] === 's-mod' ? 't-s' : 't-d mid'));
      W.layerBar.push({ r: r, x: x, w: pw, lbl: lbl });
      x += pw;
    });
  })();

  // ---- R1：ReLU、GELU、SiLU ----
  var C = { X0: 330, Y0: 820, S: 78, xa: -4, xb: 3 };
  function cx(x) { return C.X0 + x * C.S; }
  function cyv(y) { return C.Y0 - y * C.S; }
  (function () {
    var g = region(700);
    T(g, 0, 440, 'f(x)：一個數字進，一個數字出', 't-b');
    for (var k = 1; k <= 3; k++) { el('line', { x1: cx(C.xa), y1: cyv(k), x2: cx(C.xb), y2: cyv(k), class: 'grid' }, g); T(g, cx(0) - 8, cyv(k) + 4, String(k), 't-s end'); }
    el('line', { x1: cx(C.xa), y1: C.Y0, x2: cx(C.xb), y2: C.Y0, class: 'axis' }, g);
    el('line', { x1: C.X0, y1: cyv(-0.55), x2: C.X0, y2: cyv(3.2), class: 'axis' }, g);
    for (var x = C.xa; x <= C.xb; x++) if (x) T(g, cx(x), C.Y0 + 46, String(x).replace('-', '−'), 't-s mid');
    T(g, cx(C.xb) + 6, C.Y0 + 4, 'x', 't-d');
    function path(f) { var s = ''; for (var x = C.xa; x <= C.xb + 1e-9; x += 0.05) s += (s ? 'L' : 'M') + r1(cx(x)) + ' ' + r1(cyv(f(x))) + ' '; return s; }
    var defs = [
      { k: 'relu', f: SG.relu, lane: 'lane-c', name: 'ReLU', eq: 'max(0, x)', who: 'Transformer（2017）' },
      { k: 'gelu', f: SG.gelu, lane: 'lane-a', name: 'GELU', eq: 'x · Φ(x)', who: 'BERT、GPT-2、SD 3.5' },
      { k: 'silu', f: SG.silu, lane: 'lane-b', name: 'SiLU / Swish', eq: 'x · σ(x)', who: 'SwiGLU 的閘門' }
    ];
    W.curves = defs.map(function (d, i) {
      var lg = el('g', { class: d.lane }, g), c = wire(lg, path(d.f), 'curve');
      var cg = el('g', { class: d.lane }, g), y = 470 + i * 104, b = Box(cg, 620, y, 380, 90);
      T(cg, 640, y + 28, d.name, 't-l');
      T(cg, 640, y + 56, d.name.split(' ')[0] + '(x) = ' + d.eq, 't-b');
      T(cg, 640, y + 78, d.who, 't-d');
      var dot = el('circle', { r: 5, class: 'dot', opacity: 0 }, lg);
      return { d: d, c: c, card: cg, box: b, dot: dot };
    });
    W.mins = [['gelu', 'lane-a', SG.min.gelu], ['silu', 'lane-b', SG.min.silu]].map(function (m, i) {
      var gg = hide(el('g', { class: m[1] }, g)), px = cx(m[2].x), py = cyv(m[2].y);
      el('circle', { cx: px, cy: py, r: 4.5, class: 'dot' }, gg);
      el('path', { d: 'M' + px + ' ' + (py + 6) + ' V' + (C.Y0 + 70 + i * 22), class: 'lead' }, gg);
      T(gg, px + (i ? -6 : 6), C.Y0 + 74 + i * 22, 'min ' + fmt(m[2].y, 3) + ' @ x = ' + fmt(m[2].x, 2), 't-l' + (i ? ' end' : ''));
      return gg;
    });
    W.probe = hide(el('line', { y1: cyv(3.2), y2: cyv(-0.55), class: 'probe' }, g));
    W.curveNote = hide(T(g, 0, 960, '三條都是逐點函數：hidden 的每一格只看自己的 x。', 't-h'));
  })();

  // ---- R2：閘門 ----
  var A = [1.8, -0.6, 2.4, -1.9, 0.3, -1.3, 1.1, -0.2], B = [0.9, -1.5, -0.1, -1.2, 2.0, 0.7, -1.8, 1.4];
  var SA = A.map(SG.silu), PR = A.map(function (a, i) { return SG.silu(a) * B[i]; });
  var HM = { n: 20, c: 8, r: 3 };
  (function () {
    var g = region(1400), x0 = 110, cw = 46, step = 50;
    T(g, 0, 1100, '一個 token 的 8 個 hidden 單元（示意數字）', 't-b');
    for (var i = 0; i < 8; i++) T(g, x0 + i * step + cw / 2, 1130, '#' + (i + 1), 't-s mid');
    function row(y, label, cls, vals, vmax) {
      var gg = el('g', {}, g);
      T(gg, 0, y + 22, label, cls);
      var cells = vals.map(function (v, i) { var n = Num(gg, x0 + i * step, y, cw, 34); n.upd(v, fmt(v, 2), vmax); hide(n.g); return n.g; });
      return cells;
    }
    W.rowA = row(1140, 'a = W₁x', 't-b', A, 2.5);
    W.rowB = row(1190, 'b = W₃x', 't-b', B, 2.5);
    W.rowS = row(1262, 'silu(a)', 't-h', SA, 2.5);
    W.rowP = row(1334, 'silu(a)·b', 't-h', PR, 2.5);
    W.ops = hide(el('g', {}, g));
    T(W.ops, 0, 1248, '↓ 閘門：silu 作用在 a', 't-s');
    T(W.ops, 0, 1320, '↓ 乘上 b（逐格）', 't-s');
    W.gNotes = hide(el('g', {}, g));
    T(W.gNotes, 0, 1410, '#3：silu(a) = ' + fmt(SA[2], 2) + ' 開得很大，但 b ≈ 0，輸出只剩 ' + fmt(PR[2], 2) + '。GELU 只看 a，會是 ' + fmt(SG.gelu(A[2]), 2) + '。', 't-d');
    T(W.gNotes, 0, 1434, '#4：a、b 都是負的，乘起來變成正的 ' + fmt(PR[3], 2) + '。單一條 f(x) 做不到。', 't-d');
    T(W.gNotes, 0, 1490, 'SwiGLU(x) = W₂ · (silu(W₁x) ⊙ W₃x)', 't-b');
    T(W.gNotes, 0, 1516, 'GELU 版：W₂ · GELU(W₁x)，每一格只看自己的 u', 't-d');

    function heat(x, y, f, vmax, title, cls) {
      var gg = hide(el('g', {}, g)), n = HM.n, c = HM.c, r = HM.r;
      T(gg, x, y - 14, title, cls);
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
        var a = -r + (j + 0.5) / n * 2 * r, b = r - (i + 0.5) / n * 2 * r, v = f(a, b);
        el('rect', { x: x + j * c, y: y + i * c, width: c, height: c, class: 'cell ' + (v >= 0 ? 'f-p' : 'f-n'), 'fill-opacity': Math.round((0.04 + 0.86 * Math.pow(Math.min(1, Math.abs(v) / vmax), 0.7)) * 100) / 100 }, gg);
      }
      el('rect', { x: x, y: y, width: n * c, height: n * c, class: 'frame' }, gg);
      T(gg, x, y + n * c + 16, '−3', 't-s'); T(gg, x + n * c, y + n * c + 16, 'a  3', 't-s end');
      T(gg, x - 6, y + 10, '3', 't-s end'); T(gg, x - 6, y + n * c, '−3', 't-s end'); T(gg, x - 6, y + n * c / 2 + 4, 'b', 't-s end');
      return gg;
    }
    var hx1 = 590, hx2 = 820, hy = 1160, side = HM.n * HM.c;
    W.h1 = heat(hx1, hy, function (a) { return SG.gelu(a); }, 3, 'GELU(a) · 不看 b', 't-n');
    W.h2 = heat(hx2, hy, function (a, b) { return SG.silu(a) * b; }, 6, 'silu(a) · b', 't-h');
    el('line', { x1: hx2, y1: hy + side / 2, x2: hx2 + side, y2: hy + side / 2, class: 'lead' }, W.h2);
    T(W.h2, hx2 + side, hy + side + 34, 'b = 0 這條線整排是 0', 't-s end');
    T(W.h1, hx1, hy + side + 34, '每一欄都一樣：直紋', 't-s');
    W.hDots = A.map(function (a, i) {
      var gg = hide(el('g', { class: 'lane-c' }, g)), px = hx2 + (a + HM.r) / (2 * HM.r) * side, py = hy + (HM.r - B[i]) / (2 * HM.r) * side;
      el('circle', { cx: r1(px), cy: r1(py), r: 4, class: 'dot' }, gg);
      T(gg, r1(px + 6), r1(py - 5), String(i + 1), 't-s');
      return gg;
    });
    W.hLegend = hide(el('g', {}, g));
    el('rect', { x: hx1, y: 1372, width: 12, height: 12, class: 'f-p' }, W.hLegend); T(W.hLegend, hx1 + 18, 1383, '正', 't-s');
    el('rect', { x: hx1 + 50, y: 1372, width: 12, height: 12, class: 'f-n' }, W.hLegend); T(W.hLegend, hx1 + 68, 1383, '負', 't-s');
    T(W.hLegend, hx1 + 104, 1383, '點 = 左邊 8 個單元的 (a, b)', 't-s');
  })();

  // ---- R3：GLU 家族、論文 Table 1、時間軸 ----
  // log-perplexity，Shazeer 2020 Table 1 · 524,288 步（還沒跟原文逐字核對）
  var PPL = [['ReLU', 1.677, 'a'], ['GELU', 1.679, 'a'], ['Swish', 1.683, 'a'], ['GLU', 1.663, 'b'], ['Bilinear', 1.648, 'b'], ['ReGLU', 1.645, 'b'], ['GEGLU', 1.633, 'b'], ['SwiGLU', 1.636, 'b']];
  (function () {
    var g = region(2100);
    T(g, 0, 1800, 'FFN = W₂ · (g(xW) ⊙ xV)，換 g', 't-b');
    var fam = [['GLU', 'σ(xW) ⊙ xV', 'Dauphin 2017'], ['Bilinear', 'xW ⊙ xV', '沒有 g'], ['ReGLU', 'ReLU(xW) ⊙ xV', ''], ['GEGLU', 'GELU(xW) ⊙ xV', ''], ['SwiGLU', 'Swish(xW) ⊙ xV', 'Ideogram 4 用這個']];
    W.fam = fam.map(function (f, i) {
      var gg = hide(el('g', { class: 'lane-b' }, g)), y = 1844 + i * 40, last = i === fam.length - 1;
      if (last) el('rect', { x: -8, y: y - 22, width: 470, height: 34, rx: 3, class: 'box is-on' }, gg);
      T(gg, 0, y, f[0], 't-l');
      T(gg, 110, y, f[1], last ? 't-b' : 't-d');
      T(gg, 450, y, f[2], 't-s end');
      return gg;
    });
    T(g, 0, 2060, 'W 和 V 就是 SwiGLU 的 W₁ 和 W₃', 't-s');

    var z = 830, sc = 3200, base = PPL[0][1];
    T(g, 540, 1800, 'log-perplexity 跟 ReLU 差多少 · 越低越好', 't-b');
    T(g, 540, 1822, 'Shazeer 2020 Table 1 · 524,288 步', 't-s');
    el('line', { x1: z, y1: 1834, x2: z, y2: 2100, class: 'zero' }, g);
    W.ppl = PPL.map(function (p, i) {
      var y = 1846 + i * 30, dv = p[1] - base, gg = el('g', { class: 'lane-' + p[2] }, g);
      T(gg, 640, y + 14, p[0], 't-l end');
      var r = el('rect', { x: z, y: y, width: 0, height: 18, class: p[0] === 'SwiGLU' ? 'f-ls' : 'f-l' }, gg);
      var v = hide(T(gg, z + Math.max(0, dv * sc) + 8, y + 14, fmt(p[1], 3) + (i ? '（' + (dv > 0 ? '+' : '') + fmt(dv, 3) + '）' : ''), 't-s'));
      return { r: r, w: dv * sc, v: v };
    });

    var TL = [['2016', 'GELU 論文', 'a'], ['2016', 'GLU · Dauphin', 'b'], ['2017', 'Transformer · ReLU', 'c'], ['2017', 'Swish', 'b'], ['2018', 'BERT · GELU', 'a'], ['2019', 'GPT-2 · GELU', 'a'],
      ['2020', 'SwiGLU · Shazeer', 'b'], ['2022', 'PaLM · SwiGLU', 'b'], ['2023', 'LLaMA · SwiGLU', 'b'], ['2024', 'SD 3 · GELU', 'a'], ['', 'Ideogram 4 · SwiGLU', 'b']];
    var ty = 2250, sp = 960 / (TL.length - 1);
    el('line', { x1: 0, y1: ty, x2: 1000, y2: ty, class: 'axis' }, g);
    W.tl = TL.map(function (e, i) {
      var gg = hide(el('g', { class: 'lane-' + e[2] }, g)), x = 20 + i * sp, up = i % 2 === 0;
      el('circle', { cx: r1(x), cy: ty, r: 5, class: 'dot' }, gg);
      el('line', { x1: r1(x), y1: up ? ty - 8 : ty + 8, x2: r1(x), y2: up ? ty - 30 : ty + 30, class: 'lead' }, gg);
      var anc = i === TL.length - 1 ? ' end' : ' mid', lx0 = i === TL.length - 1 ? x + 8 : x;
      T(gg, r1(lx0), up ? ty - 54 : ty + 50, e[0], 't-s' + anc);
      T(gg, r1(lx0), up ? ty - 36 : ty + 68, e[1], 't-l' + anc);
      return gg;
    });
  })();

  // ---- R4：參數 = 面積 ----
  var WD = { x: 150, k: 100, h: 36 };
  (function () {
    var g = region(2800);
    T(g, 0, 2510, '參數 = 方塊面積', 't-b');
    T(g, 0, 2532, '每塊高度固定代表 d，寬度是 hidden 的寬（4d = 400）', 't-d');
    var la = el('g', { class: 'lane-a' }, g), lb = el('g', { class: 'lane-b' }, g);
    T(la, 0, 2600, 'GELU', 't-l'); T(la, 0, 2620, 'h = 4d', 't-s');
    W.barsA = ['W₁', 'W₂'].map(function (n, i) {
      var y = 2565 + i * 42, r = el('rect', { x: WD.x, y: y, width: 0, height: WD.h, class: 'f-l' }, la);
      T(la, WD.x + 10, y + 23, n, 't-b');
      return r;
    });
    T(lb, 0, 2720, 'SwiGLU', 't-l'); W.hLbl = T(lb, 0, 2740, '', 't-s');
    W.barsB = ['W₁', 'W₃', 'W₂'].map(function (n, i) {
      var y = 2665 + i * 42;
      el('rect', { x: WD.x, y: y, width: 4 * WD.k, height: WD.h, class: 'f-off' }, lb);
      var r = el('rect', { x: WD.x, y: y, width: 0, height: WD.h, class: 'f-l' }, lb);
      T(lb, WD.x + 10, y + 23, n, 't-b');
      return r;
    });
    W.cut = hide(el('line', { x1: WD.x + 8 / 3 * WD.k, y1: 2650, x2: WD.x + 8 / 3 * WD.k, y2: 2800, class: 'lead' }, g));
    W.cutTx = hide(T(g, WD.x + 8 / 3 * WD.k, 2818, '8/3·d', 't-h mid'));
    T(la, 600, 2590, '2 · d · 4d = 8d²', 't-l');
    T(la, 600, 2614, 'd = 4608 時：' + big(2 * D * 4 * D), 't-d');
    W.eqB = T(lb, 600, 2690, '', 't-l');
    W.eqBn = T(lb, 600, 2714, '', 't-d');
    W.ratio = T(lb, 600, 2766, '', 't-big');

    var cols = [0, 250, 400, 520, 660, 800], rows = [
      ['Transformer base', 'ReLU', 512, 2048, 'a'], ['SD 3.5 Large', 'GELU', SG.SD.d, SG.SD.h, 'a'],
      ['LLaMA-7B', 'SwiGLU', 4096, 11008, 'b'], ['Ideogram 4', 'SwiGLU', D, H, 'b']];
    var hy = 2858;
    W.tblHead = hide(el('g', {}, g));
    ['模型', 'f', 'd', 'hidden', 'hidden / d', '每層 MLP 參數'].forEach(function (s, i) { T(W.tblHead, cols[i], hy, s, 't-s'); });
    el('line', { x1: 0, y1: hy + 8, x2: 1000, y2: hy + 8, class: 'axis' }, W.tblHead);
    W.tbl = rows.map(function (r, i) {
      var gg = hide(el('g', { class: 'lane-' + r[4] }, g)), y = hy + 36 + i * 32, n = (r[1] === 'SwiGLU' ? 3 : 2) * r[2] * r[3];
      var hot = r[0] === 'Ideogram 4' ? 't-h' : 't-b';
      T(gg, cols[0], y, r[0], hot); T(gg, cols[1], y, r[1], 't-l'); T(gg, cols[2], y, comma(r[2]), 't-d'); T(gg, cols[3], y, comma(r[3]), 't-d');
      T(gg, cols[4], y, fmt(r[3] / r[2], 2), r[1] === 'SwiGLU' ? 't-l' : 't-d'); T(gg, cols[5], y, big(n), hot);
      return gg;
    });
  })();

  // ---- R5：FLOPs（對數軸）----
  var LG = { x0: 230, dec: 125, lo: 3 };
  function lx(v) { return LG.x0 + (Math.log10(v) - LG.lo) * LG.dec; }
  (function () {
    var g = region(3500);
    T(g, 0, 3210, '一個 token 過一層 MLP · Ideogram 4（d = 4608）', 't-b');
    T(g, 0, 3232, '對數軸：每一格差 10 倍', 't-d');
    var items = [['矩陣乘法 · 16d²', F.matmul, 'c', 'FLOPs'], ['ReLU · 4d × 1', F.relu, 'a', 'op'], ['GELU · 4d × ≈8', F.gelu, 'a', 'op'], ['SwiGLU · 8/3·d × ≈5', F.swiglu, 'b', 'op']];
    W.fb = items.map(function (it, i) {
      var y = 3262 + i * 48, gg = el('g', { class: 'lane-' + it[2] }, g);
      T(gg, LG.x0 - 12, y + 19, it[0], 't-l end');
      var r = el('rect', { x: LG.x0, y: y, width: 0, height: 28, class: i ? 'f-l' : 'f-ls' }, gg);
      var v = hide(T(gg, lx(it[1]) + 8, y + 19, big(it[1]) + (i ? ' · ' + pct(it[1] / F.matmul, 3) : ''), i ? 't-s' : 't-b'));
      return { r: r, w: lx(it[1]) - LG.x0, v: v, v0: it[1] };
    });
    var ay = 3462;
    el('line', { x1: LG.x0, y1: ay, x2: lx(1e9), y2: ay, class: 'axis' }, g);
    ['1K', '10K', '100K', '1M', '10M', '100M', '1B'].forEach(function (s, i) {
      var x = LG.x0 + i * LG.dec;
      el('line', { x1: x, y1: 3250, x2: x, y2: ay, class: 'grid' }, g);
      T(g, x, ay + 18, s, 't-s mid');
    });
    W.fSum = hide(el('g', {}, g));
    T(W.fSum, 0, 3560, '一張 1024² 的圖、一步 = 4096 個圖片 token × 34 層', 't-d');
    W.fA = T(W.fSum, 0, 3606, '', 't-big');
    T(W.fSum, 0, 3630, '矩陣乘法（GELU 4d 跟 SwiGLU 8/3·d 一樣）', 't-s');
    W.fB = T(W.fSum, 520, 3606, '', 't-big');
    T(W.fSum, 520, 3630, 'GELU → SwiGLU 少掉的逐點運算', 't-s');
    W.fC = hide(T(g, 0, 3690, '差距 ' + pct(stepDiff / stepMatmul, 3) + '：計算量幾乎全在矩陣乘法，而兩邊的矩陣乘法一樣大。', 't-h'));
  })();

  // ---- R6：HBM 搬運、訓練要存的張量 ----
  var MU = 30; // 1d = 30px
  (function () {
    var g = region(4200), x0 = 260, h3 = H / D;
    T(g, 0, 3910, 'hidden 在 HBM 上搬了多少 · 每個 token · 以 d 為單位', 't-b');
    function Row(y, label, lane, segs) {
      var gg = el('g', { class: 'lane-' + lane }, g), x = x0, out = [];
      T(gg, x0 - 12, y + 20, label, 't-l end');
      segs.forEach(function (s) {
        var w = s[0] * MU, r = el('rect', { x: r1(x), y: y, width: 0, height: 30, class: s[1] }, gg);
        var tx = hide(T(gg, r1(x + w / 2), y + 20, s[2], 't-s mid' + (s[1] === 'f-ls' ? ' t-inv' : '')));
        out.push({ r: r, w: w, tx: tx, cls: s[1] });
        if (s[1] === 'f-off') r.setAttribute('width', r1(w - 2));
        x += w;
      });
      var tot = segs.reduce(function (a, s) { return a + (s[1] === 'f-off' ? 0 : s[0]); }, 0);
      var tt = hide(T(gg, r1(x + 10), y + 20, (Math.abs(tot - Math.round(tot)) < 0.01 ? String(Math.round(tot)) : fmt(tot, 1)) + 'd', 't-b'));
      return { segs: out, tt: tt };
    }
    W.mem = [
      Row(3940, 'GELU · 未融合', 'a', [[4, 'f-ls', '寫 u'], [4, 'f-l', '讀 u'], [4, 'f-ls', '寫 f(u)']]),
      Row(3986, 'GELU · 融合', 'a', [[4, 'f-ls', '寫 f(u)']]),
      Row(4032, 'SwiGLU · 未融合', 'b', [[2 * h3, 'f-ls', '寫 a, b'], [2 * h3, 'f-l', '讀 a, b'], [h3, 'f-ls', '寫 h']]),
      Row(4078, 'SwiGLU · 融合', 'b', [[h3, 'f-ls', '寫 h']])
    ];
    W.memLeg = hide(el('g', { class: 'lane-c' }, g));
    el('rect', { x: x0, y: 4126, width: 14, height: 12, class: 'f-ls' }, W.memLeg); T(W.memLeg, x0 + 20, 4137, '寫回 HBM', 't-s');
    el('rect', { x: x0 + 110, y: 4126, width: 14, height: 12, class: 'f-l' }, W.memLeg); T(W.memLeg, x0 + 130, 4137, '從 HBM 讀', 't-s');
    T(W.memLeg, x0 + 230, 4137, '融合：W₁、W₃ 併成一次 GEMM，silu·乘法在 epilogue 做完', 't-s');

    T(g, 0, 4200, '訓練：反向傳播要存的 hidden（PyTorch autograd 預設）', 't-b');
    W.train = [
      Row(4224, 'GELU', 'a', [[4, 'f-l', 'u'], [4, 'f-l', 'f(u)']]),
      Row(4270, 'SwiGLU', 'b', [[h3, 'f-l', 'a'], [h3, 'f-l', 'silu(a)'], [h3, 'f-l', 'b'], [h3, 'f-l', 'a⊙b']]),
      Row(4316, 'SwiGLU · 重算 silu', 'b', [[h3, 'f-l', 'a'], [h3, 'f-off', ''], [h3, 'f-l', 'b'], [h3, 'f-l', 'a⊙b']])
    ];
    W.trainTag = hide(T(g, x0 + 4 * h3 * MU + 70, 4290, '+' + pct(4 * h3 / 8 - 1, 0), 't-h'));
    W.memNote = hide(T(g, 0, 4410, '融合之後 SwiGLU 只寫出 h = 8/3·d 格，比 GELU 的 4d 少 1/3；代價在訓練記憶體。', 't-h'));
  })();

  // ---- R7：Ideogram 4 的 34 層 ----
  var ST = { x: 0, w: 520, h: 8, gap: 2, bottom: 5130 };
  (function () {
    var g = region(4900);
    T(g, 0, 4640, 'Ideogram 4 · 34 層 · 每一層的 MLP 都是同一個 SwiGLU', 't-b');
    [['s-mod', '調變'], ['s-attn', 'Attention'], ['s-mlp is-on', 'MLP · SwiGLU']].forEach(function (l, i) {
      el('rect', { x: i * 150, y: 4662, width: 14, height: 12, class: 'slab ' + l[0] }, g);
      T(g, i * 150 + 20, 4673, l[1], 't-s');
    });
    var fr = [P.mod / P.layer, P.attn / P.layer, P.mlp / P.layer];
    W.slabs = [];
    for (var i = 0; i < L; i++) {
      var y = ST.bottom - (i + 1) * (ST.h + ST.gap), x = ST.x, parts = [];
      ['s-mod', 's-attn', 's-mlp'].forEach(function (c, j) { var w = fr[j] * ST.w; parts.push(el('rect', { x: r1(x), y: y, width: r1(w), height: ST.h, class: 'slab ' + c }, g)); x += w; });
      W.slabs.push(parts[2]);
    }
    T(g, -10, ST.bottom - 2, '1', 't-s end'); T(g, -10, ST.bottom - L * (ST.h + ST.gap) + 8, String(L), 't-s end');
    W.layerTx = T(g, ST.w + 12, ST.bottom, '', 't-h');
    var rx = 660;
    T(g, rx, 4720, 'MLP 參數（累計）', 't-d'); W.cP = T(g, rx, 4756, '', 't-big');
    T(g, rx, 4796, '一步 · 4096 個圖片 token · MLP', 't-d'); W.cF = T(g, rx, 4832, '', 't-big');
    T(g, rx, 4872, '佔一層的參數', 't-d'); T(g, rx, 4908, pct(P.mlp / P.layer), 't-big');
    W.cmp = hide(el('g', {}, g));
    var sdTok = 2 * 2 * SG.SD.d * SG.SD.h;
    T(W.cmp, rx, 4964, '每個圖片 token、每一層 MLP', 't-b');
    var a = el('g', { class: 'lane-a' }, W.cmp), b = el('g', { class: 'lane-b' }, W.cmp);
    T(a, rx, 4992, 'SD 3.5 Large · GELU', 't-l'); T(a, 1000, 4992, big(sdTok) + ' FLOPs', 't-l end');
    T(b, rx, 5018, 'Ideogram 4 · SwiGLU', 't-l'); T(b, 1000, 5018, big(F.matmul) + ' FLOPs', 't-l end');
    T(W.cmp, rx, 5052, fmt(F.matmul / sdTok, 2) + ' 倍 = (4608 / 2432)²', 't-h');
    T(W.cmp, rx, 5076, '貴在寬度，不是 SwiGLU。', 't-d');
  })();

  // ================= 段落與鏡頭 =================
  var BEATS = [['intro', 0.8], ['curves', 2.0], ['gate', 2.4], ['family', 1.4], ['width', 2.0], ['flops', 2.0], ['memory', 1.6], ['ideogram', 1.4]];
  var HOLD = 0.35, STOPS = BEATS.slice(1).map(function (b) { return b[0]; });
  var total = BEATS.reduce(function (s, b) { return s + b[1]; }, HOLD), spans = {}, acc = 0;
  BEATS.forEach(function (b) { spans[b[0]] = { start: acc / total, len: b[1] / total }; acc += b[1]; });
  function localT(k, p) { return clamp01((p - spans[k].start) / spans[k].len); }
  function beatAt(p) { var cur = BEATS[0][0]; BEATS.forEach(function (b) { if (p >= spans[b[0]].start) cur = b[0]; }); return cur; }

  // 每格 [beat, t, 中心 x, 中心 y, 寬]：同一個位置放兩格 = 鏡頭停住
  var SHOTS = [
    ['intro', 0, 500, 0, 1120], ['intro', 0.85, 500, 0, 1120],
    ['curves', 0.12, 500, 700, 1120], ['curves', 1, 500, 700, 1120],
    ['gate', 0.1, 500, 1310, 1120], ['gate', 1, 500, 1310, 1120],
    ['family', 0.12, 500, 2030, 1120], ['family', 1, 500, 2030, 1120],
    ['width', 0.12, 500, 2700, 1120], ['width', 1, 500, 2700, 1120],
    ['flops', 0.12, 500, 3440, 1120], ['flops', 1, 500, 3440, 1120],
    ['memory', 0.12, 500, 4150, 1120], ['memory', 1, 500, 4150, 1120],
    ['ideogram', 0.12, 500, 4890, 1120], ['ideogram', 1, 500, 4890, 1120]
  ];
  var shots = SHOTS.map(function (s) { return { p: spans[s[0]].start + spans[s[0]].len * s[1], x: s[2], y: s[3], w: s[4] }; });
  function camera(p) {
    var i = 0;
    while (i < shots.length - 1 && shots[i + 1].p <= p) i++;
    var a = shots[i], b = shots[Math.min(i + 1, shots.length - 1)];
    var k = b.p > a.p ? ease(clamp01((p - a.p) / (b.p - a.p))) : 0;
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), k)) };
  }
  var view = {};
  function measure() {
    var r = svg.getBoundingClientRect(), pr = panel.getBoundingClientRect();
    view.W = r.width || 1; view.H = r.height || 1;
    view.narrow = window.matchMedia('(max-width: 900px)').matches;
    if (!root.classList.contains('is-live')) { view.fx = 0; view.fy = 0; view.fw = view.W; view.fh = view.H; }
    else if (view.narrow) { view.fx = 0; view.fy = 0; view.fw = r.width; view.fh = Math.max(120, pr.top - r.top); }
    else { view.fx = pr.right - r.left; view.fy = 0; view.fw = r.width - view.fx; view.fh = r.height; }
  }
  function renderCamera(c) {
    var w = view.narrow ? c.w * 0.97 : c.w;
    var s = Math.min(view.fw / w, view.fh / (w * 0.62));
    var vx = c.x - (view.fx + view.fw / 2) / s, vy = c.y - (view.fy + view.fh / 2) / s;
    set(svg, 'viewBox', [r1(vx), r1(vy), r1(view.W / s), r1(view.H / s)].join(' '));
    regions.forEach(function (r) { show(r.g, 1 - seg(Math.abs(c.y - r.cy), 160, 400)); });
  }

  function grow(rows, t, a, b) { // 一排一排、一段一段長出來
    var all = [];
    rows.forEach(function (row) { row.segs.forEach(function (s) { all.push(s); }); all.push({ tt: row.tt }); });
    var n = all.length;
    all.forEach(function (s, i) {
      var k = ease(seg(t, a + (b - a) * i / n, a + (b - a) * (i + 1) / n));
      if (s.tt) { show(s.tt, k); return; }
      if (s.cls === 'f-off') { show(s.r, k); return; }
      set(s.r, 'width', r1(Math.max(0, s.w - 2) * k)); show(s.tx, k > 0.9 && s.w > 52 ? 1 : 0);
    });
  }

  // ================= 每一段的 renderer：只吃自己的 t =================
  var live = {};
  var R = {
    intro: function (t) {
      W.pipe.forEach(function (g, i) { show(g, ease(seg(t, 0.02 + i * 0.1, 0.12 + i * 0.1))); });
      show(W.introNote, ease(seg(t, 0.5, 0.6)));
      W.layerBar.forEach(function (b, i) {
        var k = ease(seg(t, 0.6 + i * 0.08, 0.72 + i * 0.08));
        set(b.r, 'width', r1(b.w * k)); show(b.lbl, k > 0.6 ? 1 : 0);
      });
    },
    curves: function (t) {
      var on = -1;
      W.curves.forEach(function (c, i) {
        var a = 0.05 + i * 0.2, k = ease(seg(t, a, a + 0.18));
        draw(c.c, k);
        show(c.card, 0.25 + 0.75 * seg(t, a, a + 0.05));
        if (k > 0 && k < 1) on = i;
      });
      var probe = t >= 0.7;
      if (probe) on = -1;
      W.curves.forEach(function (c, i) { set(c.box, 'class', i === on || probe ? 'box is-on' : 'box'); });
      W.mins.forEach(function (m, i) { show(m, ease(seg(t, 0.64 + i * 0.04, 0.7 + i * 0.04)) * (1 - 0.6 * seg(t, 0.72, 0.76))); });
      var x = lerp(C.xa, 2.5, ease(seg(t, 0.72, 0.96)));
      show(W.probe, probe ? 1 : 0); set(W.probe, 'x1', r1(cx(x))); set(W.probe, 'x2', r1(cx(x)));
      W.curves.forEach(function (c) { show(c.dot, probe ? 1 : 0); set(c.dot, 'cx', r1(cx(x))); set(c.dot, 'cy', r1(cyv(c.d.f(x)))); });
      show(W.curveNote, ease(seg(t, 0.86, 0.94)));
      live.curves = probe
        ? [['x', fmt(x, 2)], ['ReLU(x)', fmt(SG.relu(x), 3)], ['GELU(x)', fmt(SG.gelu(x), 3), 'ng'], ['SiLU(x)', fmt(SG.silu(x), 3), 'hl'], ['都只看', 'x 本身']]
        : [['ReLU', '負的砍成 0'], ['GELU 最低', fmt(SG.min.gelu.y, 3) + ' @ ' + fmt(SG.min.gelu.x, 2), 'ng'], ['SiLU 最低', fmt(SG.min.silu.y, 3) + ' @ ' + fmt(SG.min.silu.x, 2), 'hl'], ['換哪一條', '參數不變']];
    },
    gate: function (t) {
      function rowIn(cells, a, b) { cells.forEach(function (c, i) { show(c, ease(seg(t, a + (b - a) * i / 10, a + (b - a) * (i + 3) / 10))); }); }
      rowIn(W.rowA, 0.04, 0.16); rowIn(W.rowB, 0.12, 0.24); rowIn(W.rowS, 0.28, 0.4); rowIn(W.rowP, 0.42, 0.54);
      show(W.ops, ease(seg(t, 0.26, 0.32)));
      show(W.gNotes, ease(seg(t, 0.55, 0.63)));
      show(W.h1, ease(seg(t, 0.62, 0.72))); show(W.h2, ease(seg(t, 0.7, 0.8))); show(W.hLegend, ease(seg(t, 0.7, 0.8)));
      W.hDots.forEach(function (d, i) { show(d, ease(seg(t, 0.82 + i * 0.012, 0.86 + i * 0.012))); });
    },
    family: function (t) {
      W.fam.forEach(function (g, i) { show(g, ease(seg(t, 0.04 + i * 0.05, 0.1 + i * 0.05))); });
      W.ppl.forEach(function (b, i) {
        var k = ease(seg(t, 0.32 + i * 0.03, 0.42 + i * 0.03)), w = b.w * k;
        set(b.r, 'x', r1(830 + Math.min(0, w))); set(b.r, 'width', r1(Math.max(Math.abs(w), k > 0 ? 1.5 : 0)));
        show(b.v, k > 0.8 ? 1 : 0);
      });
      W.tl.forEach(function (g, i) { show(g, ease(seg(t, 0.66 + i * 0.024, 0.72 + i * 0.024))); });
    },
    width: function (t) {
      var kA = ease(seg(t, 0.04, 0.18)), kB = ease(seg(t, 0.2, 0.36)), kS = ease(seg(t, 0.46, 0.68));
      W.barsA.forEach(function (r) { set(r, 'width', r1(4 * WD.k * kA)); });
      var hd = lerp(4, 8 / 3, kS), h = Math.round(hd * D);
      W.barsB.forEach(function (r) { set(r, 'width', r1(hd * WD.k * kB)); });
      show(W.cut, seg(t, 0.4, 0.46)); show(W.cutTx, seg(t, 0.4, 0.46));
      var n = 3 * D * h, ratio = n / (2 * D * 4 * D);
      text(W.hLbl, 'h = ' + (kS >= 1 ? '8/3·d' : kS > 0 ? fmt(hd, 2) + 'd' : '4d'));
      text(W.eqB, kB > 0 ? '3 · d · ' + (kS >= 1 ? '8/3·d = 8d²' : kS > 0 ? fmt(hd, 2) + 'd = ' + fmt(3 * hd, 1) + 'd²' : '4d = 12d²') : '');
      text(W.eqBn, kB > 0 ? 'd = 4608 時：' + big(n) + ' · h = ' + comma(h) : '');
      text(W.ratio, kB > 0.5 ? fmt(ratio, 2) + '× GELU' : '');
      set(W.ratio, 'class', 't-big' + (ratio > 1.01 ? '' : ' t-h'));
      show(W.tblHead, ease(seg(t, 0.72, 0.78)));
      W.tbl.forEach(function (g, i) { show(g, ease(seg(t, 0.76 + i * 0.05, 0.82 + i * 0.05))); });
      live.width = [['h', comma(h)], ['h / d', fmt(hd, 2)], ['SwiGLU 參數 / 層', big(n), ratio > 1.01 ? 'ng' : 'hl'], ['GELU 參數 / 層', big(8 * D * D)], ['相對 GELU', fmt(ratio, 2) + '×', ratio > 1.01 ? 'ng' : 'hl']];
    },
    flops: function (t) {
      W.fb.forEach(function (b, i) {
        var k = ease(seg(t, 0.04 + i * 0.12, 0.16 + i * 0.12));
        set(b.r, 'width', r1(b.w * k)); show(b.v, k > 0.85 ? 1 : 0);
      });
      var kS = ease(seg(t, 0.56, 0.62)), kc = ease(seg(t, 0.62, 0.86));
      show(W.fSum, kS);
      text(W.fA, fmt(stepMatmul * kc / 1e12, 2) + ' TFLOPs');
      text(W.fB, fmt(stepDiff * kc / 1e12, 3) + ' TFLOPs');
      show(W.fC, ease(seg(t, 0.86, 0.94)));
      live.flops = [['矩陣乘法 / token', big(F.matmul) + ' FLOPs'], ['GELU 逐點', '≈' + big(F.gelu) + ' · ' + pct(F.gelu / F.matmul, 3), 'ng'], ['SwiGLU 逐點', '≈' + big(F.swiglu) + ' · ' + pct(F.swiglu / F.matmul, 3), 'hl'],
        ['一步 · 矩陣乘法', fmt(stepMatmul / 1e12, 2) + ' TFLOPs'], ['一步 · 逐點差', fmt(stepDiff / 1e12, 3) + ' TFLOPs', 'hl']];
    },
    memory: function (t) {
      grow(W.mem, t, 0.04, 0.46);
      show(W.memLeg, ease(seg(t, 0.06, 0.12)));
      grow(W.train, t, 0.52, 0.84);
      show(W.trainTag, ease(seg(t, 0.84, 0.9)));
      show(W.memNote, ease(seg(t, 0.88, 0.95)));
    },
    ideogram: function (t) {
      var u = seg(t, 0.06, 0.78) * L, n = Math.floor(u + 1e-9);
      W.slabs.forEach(function (s, i) { set(s, 'class', 'slab s-mlp' + (i < n ? ' is-on' : '')); });
      text(W.layerTx, n > 0 ? '第 ' + Math.min(n, L) + ' 層' : '');
      set(W.layerTx, 'y', r1(ST.bottom - Math.max(1, n) * (ST.h + ST.gap) + 8));
      text(W.cP, big(P.mlp * n));
      text(W.cF, fmt(F.matmul * N * n / 1e12, 2) + ' TFLOPs');
      show(W.cmp, ease(seg(t, 0.8, 0.9)));
      live.ideogram = [['層', n + ' / ' + L], ['MLP 參數', big(P.mlp * n), 'hl'], ['一步 · MLP', fmt(F.matmul * N * n / 1e12, 2) + ' TFLOPs', 'hl'], ['hidden', '2 × 12,288'], ['bias', '無']];
    }
  };

  // ---- 說明欄 ----
  var caps = {};
  [].forEach.call(root.querySelectorAll('[data-cap]'), function (c) { caps[c.getAttribute('data-cap')] = c; });
  var statusEl = root.querySelector('[data-status]'), factsEl = root.querySelector('[data-facts]');
  var stopBtns = [].slice.call(root.querySelectorAll('[data-stop]'));
  var h3 = H / D;
  var FACTS = {
    intro: [['Ideogram 4 一層', big(P.layer)], ['MLP', big(P.mlp) + ' · ' + pct(P.mlp / P.layer), 'hl'], ['Attention', big(P.attn) + ' · ' + pct(P.attn / P.layer)], ['調變', big(P.mod) + ' · ' + pct(P.mod / P.layer)]],
    gate: [['GELU 一格看', 'u', 'ng'], ['SwiGLU 一格看', 'a 和 b', 'hl'], ['b = 0', '輸出 0'], ['a、b 都負', '輸出 > 0', 'hl'], ['#3 · GELU vs SwiGLU', fmt(SG.gelu(A[2]), 2) + ' vs ' + fmt(PR[2], 2)]],
    family: [['ReLU', fmt(PPL[0][1], 3)], ['GELU', fmt(PPL[1][1], 3), 'ng'], ['GEGLU', fmt(PPL[6][1], 3), 'hl'], ['SwiGLU', fmt(PPL[7][1], 3), 'hl'], ['d_ff', '3072 · GLU 2048']],
    memory: [['GELU · 未融合', '12d', 'ng'], ['SwiGLU · 未融合', fmt(5 * h3, 1) + 'd', 'ng'], ['GELU · 融合', '4d'], ['SwiGLU · 融合', fmt(h3, 1) + 'd', 'hl'], ['訓練多存', '+' + pct(4 * h3 / 8 - 1, 0) + ' · 重算 0']]
  };
  var shownCap = '', factsHTML = '';
  function renderPanel(beat, p) {
    if (beat !== shownCap) {
      if (caps[shownCap]) caps[shownCap].classList.remove('is-on');
      if (caps[beat]) caps[beat].classList.add('is-on');
      shownCap = beat;
      var i0 = STOPS.indexOf(beat);
      statusEl.textContent = i0 >= 0 ? 'Stop 0' + (i0 + 1) + ' / 0' + STOPS.length : 'Overview';
    }
    var rows = live[beat] || FACTS[beat] || [];
    var h = rows.map(function (f) { var c = f[2] ? ' class="' + f[2] + '"' : ''; return '<dt>' + f[0] + '</dt><dd' + c + '>' + f[1] + '</dd>'; }).join('');
    if (h !== factsHTML) { factsEl.innerHTML = h; factsHTML = h; }
    var si = STOPS.indexOf(beat);
    stopBtns.forEach(function (b, i) {
      b.classList.toggle('is-on', i === si);
      if (i === si) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.querySelector('i').style.setProperty('--p', i < si ? 1 : i === si ? Math.round(localT(beat, p) * 100) / 100 : 0);
    });
    root.classList.toggle('is-end', p > 0.97);
  }

  // ---- 每一幀：只看 p，所以倒著捲、跳站都對 ----
  var lastT = {}, force = true;
  function render(p) {
    BEATS.forEach(function (b) {
      var k = b[0], t = localT(k, p);
      if (!force && lastT[k] === t) return;
      lastT[k] = t;
      R[k](t);
    });
    force = false;
    renderCamera(camera(p));
    renderPanel(beatAt(p), p);
    autoplay.render(p);
  }
  function headerH() { return parseFloat(getComputedStyle(html).getPropertyValue('--header-h')) || 0; }
  function progress() {
    if (!root.classList.contains('is-live')) return 1;
    var r = track.getBoundingClientRect(), range = r.height - stage.offsetHeight;
    return range > 0 ? clamp01((stage.getBoundingClientRect().top - r.top) / range) : 1;
  }
  var ticking = false;
  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; render(progress()); });
  }
  // p = 0 時的 scrollY：track 頂端碰到舞台釘住的位置
  function trackTop() { return track.getBoundingClientRect().top + window.scrollY - stickyTop(); }
  function stickyTop() { return parseFloat(getComputedStyle(stage).top) || headerH(); }
  stopBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var s = spans[b.getAttribute('data-stop')];
      window.scrollTo({ top: trackTop() + (track.offsetHeight - stage.offsetHeight) * (s.start + s.len * 0.3), behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  // ---- 自動播放：照固定速度把 p 推到 1，用 scrollTo 帶著頁面捲；使用者一碰就停 ----
  var autoplay = (function () {
    var btn = root.querySelector('[data-play]'), label = root.querySelector('[data-play-label]');
    if (!btn || reduceMotion) { if (btn) btn.hidden = true; return { render: function () {} }; }
    var FULL = 50000, raf = 0, p0 = 0, t0 = 0, setY = 0, shown = '';
    function range() { return [trackTop(), track.offsetHeight - stage.offsetHeight]; }
    function tick(ts) {
      if (!t0) t0 = ts;
      if (Math.abs(window.scrollY - setY) > 2) return stop(); // 捲動位置被別的東西改掉
      var p = Math.min(1, p0 + (ts - t0) / FULL), r = range();
      window.scrollTo(0, r[0] + r[1] * p);
      setY = window.scrollY;
      if (p >= 1) return stop();
      raf = requestAnimationFrame(tick);
    }
    function start() {
      p0 = progress();
      if (p0 >= 0.98) { p0 = 0; window.scrollTo(0, range()[0]); }
      else if (window.scrollY < range()[0]) window.scrollTo(0, range()[0] + range()[1] * p0);
      setY = window.scrollY; t0 = 0;
      raf = requestAnimationFrame(tick);
      render(p0);
    }
    function stop() { if (!raf) return; cancelAnimationFrame(raf); raf = 0; render(progress()); }
    function render(p) {
      var state = raf ? 'run' : p >= 0.98 ? 'done' : 'idle';
      if (state === shown) return;
      shown = state;
      btn.setAttribute('data-state', state);
      label.textContent = state === 'run' ? 'Pause' : state === 'done' ? 'Replay' : 'Auto-play';
    }
    btn.addEventListener('click', function () { if (raf) stop(); else start(); });
    function interrupt(e) { if (raf && !(e.target instanceof Node && btn.contains(e.target))) stop(); }
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pointerdown', interrupt);
    window.addEventListener('keydown', interrupt);
    return { render: render };
  })();

  // ---- 啟動 ----
  if (reduceMotion) root.classList.add('is-static');
  else root.classList.add('is-live');
  measure();
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { measure(); force = true; request(); });
  if ('ResizeObserver' in window) new ResizeObserver(function () { measure(); force = true; request(); }).observe(svg);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); force = true; request(); });
  render(progress());
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('is-ready'); }); });
})();
