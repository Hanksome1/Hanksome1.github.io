// toy KroQuant: one 32-channel block, shared by the page and the offline optimizer
var TOY = (function () {
  'use strict';
  var N = 32, M = 64, O = 32;
  var FP4 = [0, 0.5, 1, 1.5, 2, 3, 4, 6];
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  // activations: channel scales spread over ~10x, two outlier channels that keep their sign
  function makeData(seed) {
    var r = mulberry32(seed), A = [], W = [], cs = [], OUT = { 5: 22, 21: -15 };
    for (var j = 0; j < N; j++) cs.push(Math.exp((r() - 0.5) * 2.2));
    for (var i = 0; i < M; i++) {
      var row = [], tok = 0.6 + r();
      for (var j2 = 0; j2 < N; j2++) row.push(OUT[j2] ? OUT[j2] * tok * (0.8 + 0.4 * r()) : gauss(r) * cs[j2]);
      A.push(row);
    }
    for (var o = 0; o < O; o++) { var w = []; for (var j3 = 0; j3 < N; j3++) w.push(gauss(r) * 0.18); W.push(w); }
    return { A: A, W: W, outliers: [5, 21] };
  }
  // MXFP4 E2M1: shared power-of-two scale per 32 values, elements on the FP4 grid
  function q4(x, out) {
    var amax = 0;
    for (var j = 0; j < x.length; j++) amax = Math.max(amax, Math.abs(x[j]));
    var s = amax > 0 ? Math.pow(2, Math.floor(Math.log2(amax)) - 2) : 1;
    for (var k = 0; k < x.length; k++) {
      var v = Math.abs(x[k]) / s, best = 0, bd = 1e9;
      for (var g = 0; g < 8; g++) { var d = Math.abs(v - FP4[g]); if (d < bd) { bd = d; best = FP4[g]; } }
      out[k] = (x[k] < 0 ? -best : best) * s;
    }
    return s;
  }
  // G = L·U = [[1,0],[c,1]]·[[a,b],[0,-1/a]]
  function G(a, b, c) { return [a, b, c * a, c * b - 1 / a]; }
  function Ginv(g) { var det = g[0] * g[3] - g[1] * g[2]; return [g[3] / det, -g[1] / det, -g[2] / det, g[0] / det]; }
  function kron5(gs) { // K[r][c] = prod_k G_k[bit(r)][bit(c)], G1 on the most significant bit
    var K = [];
    for (var r = 0; r < N; r++) { var row = []; for (var c = 0; c < N; c++) {
      var p = 1; for (var k = 0; k < 5; k++) { var sh = 4 - k, br = (r >> sh) & 1, bc = (c >> sh) & 1; p *= gs[k][br * 2 + bc]; }
      row.push(p); } K.push(row); }
    return K;
  }
  var H0 = [Math.SQRT1_2, Math.SQRT1_2, 1]; // a, b, c that give the 2x2 Hadamard
  function hadamardTheta() { var t = []; for (var k = 0; k < 5; k++) t.push(H0[0], H0[1], H0[2]); return t; }
  function build(theta) {
    var gs = [], gi = [];
    for (var k = 0; k < 5; k++) { var g = G(theta[3 * k], theta[3 * k + 1], theta[3 * k + 2]); gs.push(g); gi.push(Ginv(g)); }
    var T = kron5(gs), Ti = kron5(gi), TiT = [];
    for (var r = 0; r < N; r++) { TiT.push([]); for (var c = 0; c < N; c++) TiT[r].push(Ti[c][r]); }
    return { T: T, TiT: TiT, gs: gs };
  }
  function mul(X, Y) { // X (p×N) · Y (N×N)
    var Z = [];
    for (var i = 0; i < X.length; i++) { var z = new Array(N).fill(0); for (var k = 0; k < N; k++) { var x = X[i][k]; if (!x) continue; for (var j = 0; j < N; j++) z[j] += x * Y[k][j]; } Z.push(z); }
    return Z;
  }
  function qAll(X) { var Q = [], S = []; for (var i = 0; i < X.length; i++) { var q = new Array(N); S.push(q4(X[i], q)); Q.push(q); } return { Q: Q, S: S }; }
  // L_out, L_A, L_W (eq. 7-8) plus the STE gradients of L_out w.r.t. X = AT and Y = W T^-T
  function evaluate(data, theta, wantGrad) {
    var b = build(theta), X = mul(data.A, b.T), Y = mul(data.W, b.TiT);
    var qx = qAll(X), qy = qAll(Y), ref = [], R = [], lout = 0, la = 0, lw = 0, i, j, k;
    for (i = 0; i < M; i++) { R.push([]); for (j = 0; j < O; j++) {
      var s = 0, s0 = 0; for (k = 0; k < N; k++) { s += qx.Q[i][k] * qy.Q[j][k]; s0 += data.A[i][k] * data.W[j][k]; }
      R[i].push(s - s0); lout += (s - s0) * (s - s0); } }
    for (i = 0; i < M; i++) for (k = 0; k < N; k++) la += Math.pow(qx.Q[i][k] - X[i][k], 2);
    for (j = 0; j < O; j++) for (k = 0; k < N; k++) lw += Math.pow(qy.Q[j][k] - Y[j][k], 2);
    var res = { lout: lout / (M * O), la: la / (M * N), lw: lw / (O * N), X: X, Y: Y, qx: qx, qy: qy, T: b.T, gs: b.gs };
    if (!wantGrad) return res;
    var gX = [], gY = [], c = 2 / (M * O);
    for (i = 0; i < M; i++) { gX.push(new Array(N).fill(0)); for (j = 0; j < O; j++) for (k = 0; k < N; k++) gX[i][k] += c * R[i][j] * qy.Q[j][k]; }
    for (j = 0; j < O; j++) { gY.push(new Array(N).fill(0)); for (i = 0; i < M; i++) for (k = 0; k < N; k++) gY[j][k] += c * R[i][j] * qx.Q[i][k]; }
    res.gX = gX; res.gY = gY;
    return res;
  }
  return { N: N, M: M, O: O, FP4: FP4, mulberry32: mulberry32, makeData: makeData, q4: q4, build: build, mul: mul,
    evaluate: evaluate, hadamardTheta: hadamardTheta };
})();
(function () {
  'use strict';
  var html = document.documentElement;

  var darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  var root = document.querySelector('[data-kq]');
  if (!root || !window.TOY) return;
  document.body.classList.add('is-kroquant');
  var track = root.querySelector('.kq-track'), stage = root.querySelector('.kq-stage');
  var svg = root.querySelector('[data-world]'), panel = root.querySelector('.kq-panel');
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
  function fmt(n, d) { return n.toFixed(d); }
  function rng(seed) { return TOY.mulberry32(seed); }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

  // ---- 資料：合成的 32-channel block 和離線跑好的 100 步參數 ----
  var TRAJ = JSON.parse(document.getElementById('kq-traj').textContent).traj;
  var N = TOY.N, TOK = 9, data = TOY.makeData(7);
  var steps = TRAJ.map(function (th) {
    var e = TOY.evaluate(data, th);
    return { lout: e.lout, la: e.la, lw: e.lw, x: e.X[TOK], q: e.qx.Q[TOK], s: e.qx.S[TOK], T: e.T, gs: e.gs };
  });
  var x0 = data.A[TOK], q0 = new Array(N), s0 = TOY.q4(x0, q0);
  // 對照：不轉換（det = −1 的對角 ±1，量化結果跟不轉換一樣）與 SmoothQuant α = 0.5
  var noneL = TOY.evaluate(data, [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0]).lout;
  var smoothL = (function () {
    var s = [], j, i, o, k;
    for (j = 0; j < N; j++) {
      var a = 0, w = 0;
      data.A.forEach(function (r) { a = Math.max(a, Math.abs(r[j])); });
      data.W.forEach(function (r) { w = Math.max(w, Math.abs(r[j])); });
      s.push(Math.sqrt(a / w));
    }
    function q(X) { return X.map(function (r) { var out = new Array(N); TOY.q4(r, out); return out; }); }
    var qx = q(data.A.map(function (r) { return r.map(function (v, j2) { return v / s[j2]; }); }));
    var qy = q(data.W.map(function (r) { return r.map(function (v, j2) { return v * s[j2]; }); }));
    var L = 0;
    for (i = 0; i < TOY.M; i++) for (o = 0; o < TOY.O; o++) {
      var a2 = 0, b2 = 0;
      for (k = 0; k < N; k++) { a2 += qx[i][k] * qy[o][k]; b2 += data.A[i][k] * data.W[o][k]; }
      L += (a2 - b2) * (a2 - b2);
    }
    return L / (TOY.M * TOY.O);
  })();

  // ---- 熱圖：畫在小 canvas 上，用 <image> 放大（pixelated）；換配色時重畫 ----
  var palette = {};
  function hex(c) {
    c = c.trim();
    if (c[0] === '#' && c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    var n = parseInt(c.slice(1, 7), 16);
    return [n >> 16 & 255, n >> 8 & 255, n & 255];
  }
  function readPalette() {
    var cs = getComputedStyle(root);
    palette = { pos: hex(cs.getPropertyValue('--accent')), neg: hex(cs.getPropertyValue('--neg')), bg: hex(cs.getPropertyValue('--surface')) };
  }
  function heatURL(M, vmax, gamma) {
    var h = M.length, w = M[0].length, c = document.createElement('canvas');
    c.width = w; c.height = h;
    var ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
    for (var i = 0; i < h; i++) for (var j = 0; j < w; j++) {
      var v = M[i][j], t = Math.pow(Math.min(1, Math.abs(v) / vmax), gamma || 0.55), to = v >= 0 ? palette.pos : palette.neg, p = (i * w + j) * 4;
      d[p] = lerp(palette.bg[0], to[0], t); d[p + 1] = lerp(palette.bg[1], to[1], t); d[p + 2] = lerp(palette.bg[2], to[2], t); d[p + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c.toDataURL();
  }
  var heats = []; // [{ img, make: () => [M, vmax, gamma] }]
  function Heat(g, x, y, w, h, make) {
    var img = el('image', { x: x, y: y, width: w, height: h, preserveAspectRatio: 'none' }, g);
    var hm = { img: img, make: make };
    heats.push(hm);
    return hm;
  }
  function paintHeat(hm) { var a = hm.make(); img(hm.img, heatURL(a[0], a[1], a[2])); }
  function img(e, url) { if (e._href !== url) { e._href = url; e.setAttribute('href', url); } }
  function paintAll() { readPalette(); heats.forEach(paintHeat); learnCache = {}; force = true; request(); }

  function blockDiag(blocks) {
    var n = blocks.length * N, M = [];
    for (var i = 0; i < n; i++) M.push(new Array(n).fill(0));
    blocks.forEach(function (B, b) { for (var i2 = 0; i2 < N; i2++) for (var j = 0; j < N; j++) M[b * N + i2][b * N + j] = B[i2][j]; });
    return M;
  }
  function kronList(gs) {
    var K = [[1]];
    gs.forEach(function (g) {
      var n = K.length, R = [];
      for (var i = 0; i < 2 * n; i++) { R.push([]); for (var j = 0; j < 2 * n; j++) R[i].push(g[(i >= n ? 2 : 0) + (j >= n ? 1 : 0)] * K[i % n][j % n]); }
      K = R;
    });
    return K;
  }
  var H2 = [Math.SQRT1_2, Math.SQRT1_2, Math.SQRT1_2, -Math.SQRT1_2];

  // ================= 世界：建一次，之後每幀只改屬性 =================
  var W = {};

  // ---- R1 熱圖：A，24 個 token × 128 個 channel（4 個 block）----
  (function () {
    var g = el('g', {}, svg), rows = 24, A = [];
    var others = [8, 9, 10].map(function (sd) { return TOY.makeData(sd).A; }), shift = [0, 11, 19, 6];
    for (var i = 0; i < rows; i++) {
      var r = data.A[i].slice();
      others.forEach(function (B, b) { for (var j = 0; j < N; j++) r.push(B[i][(j + shift[b + 1]) % N]); });
      A.push(r);
    }
    T(g, 0, -58, 'A ∈ ℝ^(m×d)', 't-b');
    T(g, 1024, -40, 'O = A · Wᵀ', 't-serif end');
    T(g, 0, -38, 'token ↓   channel →', 't-d');
    Heat(g, 0, 0, 1024, 192, function () { return [A, 24, 0.5]; });
    el('rect', { x: 0, y: 0, width: 1024, height: 192, class: 'frame' }, g);
    for (var b = 1; b < 4; b++) el('line', { x1: b * 256, y1: -4, x2: b * 256, y2: 196, class: 'grid' }, g);
    for (var b2 = 0; b2 < 4; b2++) T(g, b2 * 256 + 128, 216, 'block ' + b2 + ' · 32 ch', 't-s mid');
    W.row = el('rect', { x: -2, y: TOK * 8 - 1, width: 260, height: 10, class: 'frame-h', opacity: 0 }, g);
    W.outTag = el('g', { opacity: 0 }, g);
    el('path', { d: 'M44 -2 V-10 M172 -2 V-10', class: 'lead' }, W.outTag);
    T(W.outTag, 44, -14, 'ch 5', 't-h mid');
    T(W.outTag, 172, -14, 'ch 21', 't-n mid');
    W.leadA = wire(g, 'M130 ' + (TOK * 8 + 10) + ' C 130 250, 512 220, 512 296', 'lead');
  })();

  // ---- 長條圖：一個 block 的 32 個值、量化格點 ----
  function Bars(g, o) {
    var gg = el('g', {}, g), grid = el('g', { opacity: 0 }, gg), lines = [], bars = [], ghosts = [], zs = [];
    for (var l = -7; l <= 7; l++) {
      if (!l) continue;
      lines.push({ L: l, ln: el('line', { x1: o.x0 - 8, x2: o.x0 + o.pitch * N, class: 'grid' }, grid), tx: l > 0 ? T(grid, o.x0 + o.pitch * N + 8, 0, '', 't-s') : null });
    }
    el('line', { x1: o.x0 - 12, y1: o.y0, x2: o.x0 + o.pitch * N + 4, y2: o.y0, class: 'axis' }, gg);
    for (var j = 0; j < N; j++) {
      var x = o.x0 + j * o.pitch;
      ghosts.push(el('rect', { x: x, width: o.bw, class: 'ghost', opacity: 0 }, gg));
      bars.push(el('rect', { x: x, width: o.bw, class: 'bar' }, gg));
      zs.push(el('circle', { cx: x + o.bw / 2, cy: o.y0, r: 4, class: 'zmark', opacity: 0 }, gg));
    }
    function box(e, v) { var h = Math.min(o.max, Math.abs(v) * o.sc); set(e, 'y', r1(v >= 0 ? o.y0 - h : o.y0)); set(e, 'height', r1(Math.max(0.01, h))); }
    return {
      // x：原始值；q：量化後；kj(j)：第 j 條從 x 吸到 q 的進度；grow：一開始長出來
      update: function (x, q, s, grow, kj, gridK, outCls) {
        var zeros = 0;
        lines.forEach(function (ln) {
          var y = o.y0 - ln.L / Math.abs(ln.L) * TOY.FP4[Math.abs(ln.L)] * s * o.sc, inside = Math.abs(o.y0 - y) <= o.max + 0.5;
          set(ln.ln, 'y1', r1(y)); set(ln.ln, 'y2', r1(y)); show(ln.ln, inside ? 1 : 0);
          if (ln.tx) { set(ln.tx, 'y', r1(y + 4)); text(ln.tx, r1(TOY.FP4[ln.L] * s) + ''); show(ln.tx, inside ? 1 : 0); }
        });
        show(grid, gridK);
        for (var j2 = 0; j2 < N; j2++) {
          var k = kj(j2), v = lerp(x[j2] * grow, q[j2], k), isZ = q[j2] === 0 && k > 0.5;
          box(bars[j2], v); box(ghosts[j2], x[j2]);
          show(ghosts[j2], k > 0 ? 1 : 0);
          set(bars[j2], 'class', isZ ? 'bar is-zero' : outCls && Math.abs(x[j2]) > 10 ? 'bar is-out' : 'bar');
          show(zs[j2], isZ ? 1 : 0);
          if (isZ) zeros++;
        }
        return zeros;
      }
    };
  }

  // ---- R2：一個 token 的第一個 block ----
  (function () {
    var g = el('g', {}, svg);
    T(g, 0, 312, 'token 10 · block 0 · 32 個值', 't-b');
    W.scaleTx = T(g, 0, 840, '', 't-d');
    W.bars0 = Bars(g, { x0: 0, pitch: 32, bw: 22, y0: 560, sc: 220 / 28, max: 228 });
    [0, 5, 21, 31].forEach(function (j) { T(g, j * 32 + 11, 806, 'ch ' + j, 't-s mid'); });
  })();

  // ---- R3：插入 T，折不進 AdaLN ----
  function Card(g, x, y, w, h, label, cls, sub) {
    var gg = el('g', {}, g);
    el('rect', { x: x, y: y, width: w, height: h, rx: 3, class: cls || 'card' }, gg);
    T(gg, x + w / 2, y + h / 2 + (sub ? 2 : 9), label, 't-serif mid');
    if (sub) T(gg, x + w / 2, y + h - 12, sub, 't-s mid');
    return gg;
  }
  (function () {
    var g = el('g', {}, svg), y = 1000, h = 90;
    Card(g, 0, y, 130, h, 'Linear', 'card', '前一層');
    Card(g, 180, y, 140, h, 'AdaLN', 'card', 'norm + scale(t)');
    Card(g, 390, y, 90, h, 'A');
    W.tCards = el('g', { opacity: 0 }, g);
    Card(W.tCards, 520, y, 80, h, 'T', 'card-h');
    Card(W.tCards, 640, y, 90, h, 'T⁻¹', 'card-h');
    T(W.tCards, 500, y + 52, '·', 't-big mid');
    T(W.tCards, 620, y + 52, '·', 't-big mid');
    T(W.tCards, 750, y + 52, '·', 't-big mid');
    Card(g, 770, y, 90, h, 'Wᵀ');
    T(g, 890, y + 52, '=', 't-big mid');
    Card(g, 920, y, 104, h, 'O');
    el('path', { d: 'M130 1045 H180 M320 1045 H390', class: 'wire' }, g);
    W.brace = wire(g, 'M522 1102 v10 H728 v-10 M625 1112 v8', 'wire-h');
    W.braceTx = T(g, 625, 1142, 'T · T⁻¹ = I，輸出不變', 't-h mid');
    W.fold = wire(g, 'M560 996 C 560 900, 65 900, 65 996', 'wire-h');
    W.foldTx = T(g, 312, 912, 'LLM：把 T 折進前一層的權重', 't-d mid');
    W.cross = wire(g, 'M228 1022 L272 1068 M272 1022 L228 1068', 'cross');
    W.normTx = T(g, 250, 1142, 'Norm(xT)T⁻¹ ≠ Norm(x)', 't-h mid');
    W.onlineTx = T(g, 512, 1206, '→ 每一層 × 每一個去噪步，T 都要在線上算一次', 't-b mid');
    [W.braceTx, W.foldTx, W.normTx, W.onlineTx].forEach(function (e) { e.setAttribute('opacity', 0); });
  })();

  // ---- R4：四種 T（d = 128 的示意）----
  (function () {
    var g = el('g', {}, svg), r = rng(42), D = 128;
    var diag = [], dense = [];
    for (var i = 0; i < D; i++) { diag.push(new Array(D).fill(0)); diag[i][i] = Math.exp(gauss(r) * 0.6); dense.push([]); for (var j = 0; j < D; j++) dense[i].push(gauss(r) * 0.1); }
    var had = blockDiag([0, 1, 2, 3].map(function () { return kronList([H2, H2, H2, H2, H2]); }));
    var kro = blockDiag([0, 1, 2, 3].map(function (b) {
      var th = TRAJ[100].map(function (v) { return b ? v * (1 + gauss(r) * 0.15) : v; });
      return TOY.build(th).T;
    }));
    var mats = [
      { M: diag, v: 2, name: 'SmoothQuant', sub: '對角 · 每 channel 一個數', p: '4,096', c: '4,096' },
      { M: had, v: 0.3, name: 'Block Hadamard', sub: '32×32 · 固定', p: '0（固定）', c: '131k' },
      { M: dense, v: 0.25, name: 'FlatQuant', sub: 'd×d · 學習', p: '16.8M', c: '16.8M' },
      { M: kro, v: 0.45, name: 'KroQuant', sub: '32×32 · 學習', p: '1,920', c: '131k' }
    ];
    W.mats = mats.map(function (m, i) {
      var x = i * 275, gg = el('g', { opacity: 0 }, g);
      T(gg, x, 1366, m.name, i === 3 ? 't-h' : 't-b');
      T(gg, x, 1386, m.sub, 't-s');
      Heat(gg, x, 1400, 200, 200, function () { return [m.M, m.v, 0.55]; });
      el('rect', { x: x, y: 1400, width: 200, height: 200, class: 'frame' }, gg);
      T(gg, x, 1630, '參數 ' + m.p, 't-d');
      T(gg, x, 1652, '每 token ' + m.c + ' MAC', 't-d');
      return gg;
    });
    W.kroFrame = el('rect', { x: 817, y: 1342, width: 216, height: 324, rx: 4, class: 'frame-h', opacity: 0 }, g);
    T(g, 0, 1700, 'd = 4096 時每層的數字；矩陣畫的是 d = 128 的示意', 't-s');
  })();

  // ---- R5：Kronecker 積一層一層長大 ----
  function Tile(g, x, y, size, vals) {
    var c = size / 2, gg = el('g', {}, g), cells = [];
    for (var k = 0; k < 4; k++) {
      var cx = x + (k % 2) * c, cy = y + (k >> 1) * c;
      var rc = el('rect', { x: cx, y: cy, width: c, height: c }, gg);
      var tx = T(gg, cx + c / 2, cy + c / 2 + 5, '', 't-s mid');
      cells.push({ rc: rc, tx: tx });
    }
    el('rect', { x: x, y: y, width: size, height: size, class: 'frame' }, gg);
    function upd(v) {
      cells.forEach(function (cl, k2) {
        set(cl.rc, 'class', v[k2] >= 0 ? 'f-h' : 'f-n');
        set(cl.rc, 'fill-opacity', Math.round((0.12 + 0.6 * Math.min(1, Math.abs(v[k2]) / 1.4)) * 100) / 100);
        text(cl.tx, fmt(v[k2], 2));
      });
    }
    upd(vals);
    return { g: gg, upd: upd };
  }
  function Mat2(g, x, y, cells) { // 一個 2×2 的方括號矩陣，cells 是文字
    var gg = el('g', {}, g), w = 104, h = 56;
    el('path', { d: 'M' + (x + 6) + ' ' + y + ' h-6 v' + h + ' h6 M' + (x + w - 6) + ' ' + y + ' h6 v' + h + ' h-6', class: 'wire' }, gg);
    cells.forEach(function (s, k) { T(gg, x + 28 + (k % 2) * 48, y + 22 + (k >> 1) * 24, s, 't-b mid'); });
    return gg;
  }
  (function () {
    var g = el('g', {}, svg);
    T(g, 0, 1856, 'K = G₁ ⊗ G₂ ⊗ G₃ ⊗ G₄ ⊗ G₅（Hadamard 初始值）', 't-b');
    W.tiles = [];
    for (var k = 0; k < 5; k++) {
      var t = Tile(g, k * 128, 1880, 90, H2);
      T(t.g, k * 128 + 45, 1992, 'G' + '₁₂₃₄₅'[k], 't-b mid');
      if (k < 4) T(g, k * 128 + 109, 1932, '⊗', 't-big mid');
      W.tiles.push(t);
    }
    T(g, 660, 1932, '=', 't-big mid');
    el('rect', { x: 700, y: 1880, width: 320, height: 320, class: 'frame-d' }, g);
    W.stages = [];
    for (var s = 1; s <= 5; s++) {
      (function (s2) {
        var size = Math.pow(2, s2) * 10;
        var hm = Heat(g, 700, 1880, size, size, function () { return [kronList([H2, H2, H2, H2, H2].slice(0, s2)), 0.75, 0.5]; });
        hm.img.setAttribute('opacity', 0);
        W.stages.push(hm.img);
      })(s);
    }
    W.kSize = T(g, 700, 2226, '', 't-d');
    W.lu = el('g', { opacity: 0 }, g);
    T(W.lu, 0, 2082, 'Gₖ =', 't-b');
    Mat2(W.lu, 56, 2060, ['1', '0', 'c', '1']);
    T(W.lu, 182, 2094, '·', 't-big mid');
    Mat2(W.lu, 200, 2060, ['a', 'b', '0', '−1/a']);
    T(W.lu, 316, 2082, 'L · U', 't-d');
    T(W.lu, 316, 2104, 'det = a · (−1/a) = −1', 't-h');
    T(W.lu, 0, 2156, 'a = b = 1/√2、c = 1 → Gₖ = ½√2 · [1 1; 1 −1]（2×2 Hadamard）', 't-d');
    T(W.lu, 0, 2180, '反矩陣：K⁻¹ = G₁⁻¹ ⊗ G₂⁻¹ ⊗ … ⊗ G₅⁻¹', 't-d');
    W.pcount = el('g', { opacity: 0 }, g);
    T(W.pcount, 0, 2250, '15', 't-big');
    T(W.pcount, 40, 2250, '個參數 / 塊', 't-b');
    T(W.pcount, 200, 2250, 'dense GL(32)：1,024 · 68× · 每 channel 0.47 個', 't-d');
  })();

  // ---- R5b：x·K 拆成 5 層 butterfly（Hadamard 初始值，輸入是 Stop 01 的 token）----
  var BF = { x: function (s) { return 1300 + s * 170; }, y: function (i) { return 1880 + i * 14; }, vals: [x0.slice()], HL: 5 };
  (function () {
    var g = el('g', {}, svg), k, i;
    for (k = 1; k <= 5; k++) { // 第 k 層：bit (5 − k) 不同的兩個 channel 一對，乘 Gₖ
      var d = 16 >> (k - 1), prev = BF.vals[k - 1], cur = [];
      for (i = 0; i < N; i++) { var cb = (i & d) ? 1 : 0, lo = i & ~d; cur.push(prev[lo] * H2[cb] + prev[lo | d] * H2[2 + cb]); }
      BF.vals.push(cur);
    }
    T(g, 1300, 1834, 'x · K = 5 層 butterfly（Hadamard 初始值）', 't-b');
    T(g, BF.x(0), 1860, 'x', 't-d mid');
    for (k = 1; k <= 5; k++) T(g, BF.x(k), 1860, 'G' + '₁₂₃₄₅'[k - 1] + ' · 距離 ' + (16 >> (k - 1)), 't-d mid');
    T(g, BF.x(5) + 22, BF.y(15) + 30, '= x·K', 't-serif');
    [[0, 't-s'], [5, 't-h'], [21, 't-n'], [31, 't-s']].forEach(function (l) { T(g, BF.x(0) - 16, BF.y(l[0]) + 4, 'ch ' + l[0], l[1] + ' end'); });
    BF.stages = [];
    for (k = 1; k <= 5; k++) {
      var dd = 16 >> (k - 1), eg = el('g', { opacity: 0 }, g), hl = el('g', { opacity: 0 }, g), pair = [BF.HL & ~dd, BF.HL | dd];
      for (i = 0; i < N; i++) {
        var on = pair.indexOf(i) >= 0, parent = on ? hl : eg, x1 = BF.x(k - 1), x2 = BF.x(k);
        el('line', { x1: x1, y1: BF.y(i), x2: x2, y2: BF.y(i), class: on ? 'bf-h' : 'bf' }, parent);
        el('line', { x1: x1, y1: BF.y(i), x2: x2, y2: BF.y(i ^ dd), class: on ? 'bf-h' : 'bf' }, parent);
      }
      var gt = T(hl, (BF.x(k - 1) + BF.x(k)) / 2, BF.y(pair[0]) - 8, 'G' + '₁₂₃₄₅'[k - 1], 't-h mid');
      gt.setAttribute('class', 't-h mid');
      BF.stages.push({ eg: eg, hl: hl });
    }
    BF.cols = BF.vals.map(function (v, s) {
      var cg = el('g', { opacity: s ? 0 : 1 }, g);
      v.forEach(function (val, i2) {
        el('circle', { cx: BF.x(s), cy: BF.y(i2), r: r1(1.6 + Math.sqrt(Math.abs(val)) * 1.45), class: val >= 0 ? 'nd-p' : 'nd-n' }, cg);
      });
      return cg;
    });
    T(g, 1300, 2364, '每個 ✕：(u, v) → (u·g₀₀ + v·g₁₀,  u·g₀₁ + v·g₁₁)', 't-d');
    T(g, 1300, 2388, '5 層 × 16 對 × 4 次乘法 = 320 次；dense 的 32×32 是 1,024 次', 't-d');
    var q = new Array(N); TOY.q4(BF.vals[5], q);
    BF.zeros = q.filter(function (v) { return v === 0; }).length;
    BF.max = BF.vals.map(function (v) { return Math.max.apply(null, v.map(Math.abs)); });
    BF.big = BF.vals.map(function (v) { return v.filter(function (a) { return Math.abs(a) > 2; }).length; });
  })();

  // ---- R6：從 Hadamard 開始學（合成資料，真的跑過）----
  var learnVmax = 0, learnMax = 0, loutMax = 0;
  steps.forEach(function (s) {
    s.T.forEach(function (r) { r.forEach(function (v) { learnVmax = Math.max(learnVmax, Math.abs(v)); }); });
    s.x.forEach(function (v) { learnMax = Math.max(learnMax, Math.abs(v)); });
    loutMax = Math.max(loutMax, s.lout);
  });
  var learnCache = {};
  (function () {
    var g = el('g', {}, svg);
    W.kStep = T(g, 0, 2556, '', 't-b');
    W.kImg = el('image', { x: 0, y: 2570, width: 320, height: 320, preserveAspectRatio: 'none' }, g);
    el('rect', { x: 0, y: 2570, width: 320, height: 320, class: 'frame' }, g);
    T(g, 400, 2556, 'AT · token 10：原始（虛線）與量化後', 't-b');
    W.bars1 = Bars(g, { x0: 400, pitch: 19.5, bw: 13, y0: 2730, sc: 150 / learnMax, max: 160 });
    var pts = steps.map(function (s, i) { return [400 + i * 6.2, 3040 - s.lout / loutMax * 110]; });
    T(g, 400, 2918, 'L_out', 't-d');
    el('line', { x1: 400, y1: 3040, x2: 1024, y2: 3040, class: 'axis' }, g);
    W.curve = wire(g, 'M' + pts.map(function (p) { return r1(p[0]) + ' ' + r1(p[1]); }).join(' L'), 'curve');
    W.dot = el('circle', { r: 5, class: 'f-h' }, g);
    W.pts = pts;
    W.lossTx = T(g, 1024, 2918, '', 't-h end');
    T(g, 400, 3062, '0', 't-s'); T(g, 1024, 3062, '100 步', 't-s end');
  })();

  // ---- R7：LoRaQ 的兩條路 ----
  (function () {
    var g = el('g', {}, svg);
    T(g, 0, 3160, 'Ô = Q(AT) · Q(W̃ − LR)ᵀ + AT · LR', 't-b');
    T(g, 0, 3182, 'W̃ = W · T⁻ᵀ，L、R、殘差都是 offline 先算好', 't-d');
    Card(g, 0, 3290, 110, 60, 'AT', 'card-h');
    W.up = el('g', { opacity: 0 }, g);
    Card(W.up, 200, 3210, 90, 56, 'Q₄', 'card');
    Card(W.up, 340, 3200, 300, 76, '× Q₄(W̃ − LR)ᵀ', 'card', 'W4A4 GEMM · 殘差');
    W.lo = el('g', { opacity: 0 }, g);
    Card(W.lo, 200, 3380, 440, 76, '× L · R', 'card-n', '16-bit activation × MXFP4 低秩 · rank 128');
    W.sum = el('g', { opacity: 0 }, g);
    el('circle', { cx: 752, cy: 3318, r: 22, class: 'card' }, W.sum);
    T(W.sum, 752, 3326, '+', 't-big mid');
    Card(W.sum, 820, 3288, 110, 60, 'Ô');
    W.wUp = wire(g, 'M110 3320 H150 V3238 H200 M290 3238 H340', 'wire-h');
    W.wLo = wire(g, 'M150 3320 V3418 H200', 'wire-n');
    W.wSum = wire(g, 'M640 3238 H752 V3296 M640 3418 H752 V3340 M774 3318 H820', 'wire');
  })();

  // ---- R8：K2 kernel 與延遲 ----
  var KR = 22, KC = 13, LAT = [['Q4 only', 22.64, 'f-i'], ['Scale (diag)', 25.52, 'f-n'], ['K1 · dense 讀入', 23.88, 'f-h'], ['K2 · 15 參數', 27.80, 'f-h2'], ['FWHT', 68.04, 'f-i']];
  (function () {
    var g = el('g', {}, svg), x0 = 0, y0 = 3690;
    T(g, 0, 3672, 'K[r, c]，32 × 32', 't-b');
    for (var i = 0; i <= 32; i += 4) {
      el('line', { x1: x0, y1: y0 + i * 10, x2: x0 + 320, y2: y0 + i * 10, class: 'grid' }, g);
      el('line', { x1: x0 + i * 10, y1: y0, x2: x0 + i * 10, y2: y0 + 320, class: 'grid' }, g);
    }
    el('rect', { x: x0, y: y0, width: 320, height: 320, class: 'frame' }, g);
    W.kband = el('g', { opacity: 0 }, g);
    el('rect', { x: x0, y: y0 + KR * 10, width: 320, height: 10, class: 'band' }, W.kband);
    el('rect', { x: x0 + KC * 10, y: y0, width: 10, height: 320, class: 'band' }, W.kband);
    el('rect', { x: x0 + KC * 10, y: y0 + KR * 10, width: 10, height: 10, class: 'f-h' }, W.kband);
    T(W.kband, x0 - 6, y0 + KR * 10 + 9, 'r', 't-s end');
    T(W.kband, x0 + KC * 10 + 5, y0 - 6, 'c', 't-s mid');
    var gs = steps[100].gs, Kv = steps[100].T[KR][KC], rb = KR.toString(2).padStart(5, '0'), cb = KC.toString(2).padStart(5, '0');
    T(g, 360, 3700, 'r = 22 = ' + rb + '₂', 't-b');
    T(g, 360, 3722, 'c = 13 = ' + cb + '₂', 't-b');
    W.bits = [];
    for (var k = 0; k < 5; k++) {
      var br = +rb[k], bc = +cb[k], v = gs[k][br * 2 + bc];
      var gg = el('g', { opacity: 0 }, g);
      T(gg, 360, 3770 + k * 36, 'G' + '₁₂₃₄₅'[k] + '[' + br + '][' + bc + ']', 't-d');
      T(gg, 620, 3770 + k * 36, (v >= 0 ? '+' : '−') + fmt(Math.abs(v), 3), v >= 0 ? 't-h end' : 't-n end');
      W.bits.push(gg);
    }
    W.bitsSum = el('g', { opacity: 0 }, g);
    el('line', { x1: 360, y1: 3946, x2: 620, y2: 3946, class: 'axis' }, W.bitsSum);
    T(W.bitsSum, 360, 3972, 'K[22, 13] = Π', 't-b');
    T(W.bitsSum, 620, 3972, (Kv >= 0 ? '+' : '−') + fmt(Math.abs(Kv), 3), 't-h end');
    T(W.bitsSum, 360, 4000, '用到的是學完的 15 個參數', 't-s');
    T(g, 690, 3672, 'MI350 · m = d = 4096 · 含 MXFP4 量化', 't-b');
    W.lat = LAT.map(function (l, i) {
      var y = 3712 + i * 62, gg = el('g', {}, g);
      T(gg, 690, y - 8, l[0], 't-d');
      var bar = el('rect', { x: 690, y: y, width: 0, height: 20, class: l[2] }, gg);
      var tx = T(gg, 690, y + 15, fmt(l[1], 2) + ' µs', 't-s');
      return { bar: bar, tx: tx, v: l[1] };
    });
  })();

  // ---- R9：LPIPS ----
  var RES = [['PixArt-Σ', 'MJHQ', 0.433, 0.381, 0.347], ['PixArt-Σ', 'SDCI', 0.476, 0.399, 0.378], ['SANA', 'MJHQ', 0.256, 0.229, 0.206],
    ['SANA', 'SDCI', 0.285, 0.259, 0.241], ['FLUX.1', 'MJHQ', 0.378, 0.331, 0.336], ['FLUX.1', 'SDCI', 0.589, 0.343, 0.283]];
  (function () {
    var g = el('g', {}, svg), base = 4620;
    T(g, 0, 4228, 'LPIPS ↓（跟 16-bit 原圖的距離）· W4A4 MXFP4', 't-b');
    [['Smooth + SVDQuant', 'f-i'], ['Smooth + LoRaQ', 'f-n'], ['KroQuant + LoRaQ', 'f-h']].forEach(function (l, i) {
      el('rect', { x: 560 + i * 160, y: 4216, width: 12, height: 12, class: l[1] }, g);
      T(g, 578 + i * 160, 4227, l[0], 't-s');
    });
    el('line', { x1: -6, y1: base, x2: 1030, y2: base, class: 'axis' }, g);
    W.res = [];
    RES.forEach(function (r, gi) {
      var x0 = gi * 172 + 8;
      T(g, x0 + 66, base + 22, r[0], 't-s mid');
      T(g, x0 + 66, base + 38, r[1], 't-s mid');
      ['f-i', 'f-n', 'f-h'].forEach(function (cls, k) {
        var x = x0 + k * 46, bar = el('rect', { x: x, y: base, width: 38, height: 0, class: cls }, g);
        var tx = T(g, x + 19, base - 6, r[2 + k].toFixed(3), (k === 2 ? 't-h' : 't-s') + ' mid');
        tx.setAttribute('opacity', 0);
        W.res.push({ bar: bar, tx: tx, v: r[2 + k], gi: gi, base: base });
      });
    });
  })();

  // ================= 段落與鏡頭 =================
  var BEATS = [['intro', 0.8], ['outlier', 1.6], ['invariance', 1.3], ['design', 1.6], ['kronecker', 2.0], ['butterfly', 1.8], ['learn', 2.0], ['lowrank', 1.2], ['kernel', 1.6], ['results', 1.4]];
  var HOLD = 0.35, STOPS = BEATS.slice(1).map(function (b) { return b[0]; });
  var total = BEATS.reduce(function (s, b) { return s + b[1]; }, HOLD), spans = {}, acc = 0;
  BEATS.forEach(function (b) { spans[b[0]] = { start: acc / total, len: b[1] / total }; acc += b[1]; });
  function localT(k, p) { return clamp01((p - spans[k].start) / spans[k].len); }
  function beatAt(p) { var cur = BEATS[0][0]; BEATS.forEach(function (b) { if (p >= spans[b[0]].start) cur = b[0]; }); return cur; }

  // 每格 [beat, t, 中心 x, 中心 y, 寬]：同一個位置放兩格 = 鏡頭停住
  var SHOTS = [
    ['intro', 0, 512, 96, 1240], ['intro', 0.55, 512, 96, 1240],
    ['outlier', 0.3, 512, 560, 1120], ['outlier', 1, 512, 570, 1120],
    ['invariance', 0.2, 512, 1060, 1120], ['invariance', 1, 512, 1070, 1120],
    ['design', 0.2, 512, 1515, 1120], ['design', 1, 512, 1515, 1120],
    ['kronecker', 0.15, 512, 2060, 1120], ['kronecker', 1, 512, 2065, 1120],
    ['butterfly', 0.15, 1770, 2110, 1000], ['butterfly', 1, 1770, 2110, 1000],
    ['learn', 0.15, 512, 2800, 1120], ['learn', 1, 512, 2805, 1120],
    ['lowrank', 0.2, 465, 3320, 1040], ['lowrank', 1, 465, 3320, 1040],
    ['kernel', 0.15, 310, 3850, 720], ['kernel', 0.55, 310, 3850, 720], ['kernel', 0.75, 512, 3850, 1120], ['kernel', 1, 512, 3850, 1120],
    ['results', 0.2, 512, 4440, 1120], ['results', 1, 512, 4440, 1120]
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
    var w = view.narrow ? c.w * 0.86 : c.w;
    var s = Math.min(view.fw / w, view.fh / (w * 0.62));
    var vx = c.x - (view.fx + view.fw / 2) / s, vy = c.y - (view.fy + view.fh / 2) / s;
    set(svg, 'viewBox', [r1(vx), r1(vy), r1(view.W / s), r1(view.H / s)].join(' '));
  }

  // ================= 每一段的 renderer：只吃自己的 t =================
  var R = {
    intro: function (t) {
      show(W.outTag, ease(seg(t, 0.25, 0.6)));
      show(W.row, ease(seg(t, 0.6, 0.95)));
    },
    outlier: function (t) {
      draw(W.leadA, ease(seg(t, 0, 0.25)));
      var grow = ease(seg(t, 0.05, 0.3)), snap = seg(t, 0.45, 0.92);
      var zeros = W.bars0.update(x0, q0, s0, grow, function (j) { return ease(seg(snap, j / N * 0.6, j / N * 0.6 + 0.4)); }, ease(seg(t, 0.3, 0.45)), true);
      text(W.scaleTx, t > 0.3 ? 'scale s = 2^(⌊log₂ 26.3⌋ − 2) = ' + s0 + '；格點 = s × {0.5, 1, 1.5, 2, 3, 4, 6}' : '');
      var err = 0, nrm = 0, n = 0;
      for (var j = 0; j < N; j++) if (j !== 5 && j !== 21) { err += Math.pow(q0[j] - x0[j], 2); nrm += x0[j] * x0[j]; n++; }
      live.outlier = [['block 最大值', '26.30'], ['scale s', String(s0)], ['變成 0 的值', zeros + ' / 32', 'hl'],
        ['其餘 30 個的相對誤差', snap > 0.9 ? fmt(Math.sqrt(err / nrm) * 100, 0) + '%' : '—']];
    },
    invariance: function (t) {
      show(W.tCards, ease(seg(t, 0.04, 0.22)));
      draw(W.brace, ease(seg(t, 0.22, 0.36))); show(W.braceTx, seg(t, 0.3, 0.4));
      draw(W.fold, ease(seg(t, 0.42, 0.62))); show(W.foldTx, seg(t, 0.5, 0.6));
      draw(W.cross, ease(seg(t, 0.66, 0.78))); show(W.normTx, seg(t, 0.7, 0.8));
      show(W.onlineTx, seg(t, 0.84, 0.95));
    },
    design: function (t) {
      W.mats.forEach(function (m, i) { show(m, ease(seg(t, 0.04 + i * 0.17, 0.2 + i * 0.17))); });
      show(W.kroFrame, ease(seg(t, 0.78, 0.92)));
    },
    kronecker: function (t) {
      var u = seg(t, 0.1, 0.62) * 5, st = Math.max(1, Math.min(5, Math.ceil(u)));
      if (u <= 0) st = 0;
      W.tiles.forEach(function (tl, k) { show(tl.g, k < st ? 1 : 0.3); });
      W.stages.forEach(function (im, k) { show(im, k + 1 === st ? 1 : 0); });
      var n = st ? Math.pow(2, st) : 0;
      text(W.kSize, st ? '目前 ' + n + ' × ' + n + (st === 5 ? '：一個完整的 32×32 block' : '') : '');
      show(W.lu, ease(seg(t, 0.62, 0.78)));
      show(W.pcount, ease(seg(t, 0.8, 0.94)));
      live.kronecker = [['K 的邊長', st ? n + ' × ' + n : '—'], ['參數 / 塊', '15', 'hl'], ['dense GL(32)', '1,024'], ['壓縮', '68×'], ['SmoothQuant / 32 ch', '32']];
    },
    butterfly: function (t) {
      show(BF.cols[0], ease(seg(t, 0, 0.08)));
      var done = 0;
      BF.stages.forEach(function (st, k) {
        var ks = ease(seg(t, 0.1 + k * 0.15, 0.24 + k * 0.15));
        show(st.eg, ks * 0.9); show(st.hl, ks); show(BF.cols[k + 1], ks);
        if (ks > 0.5) done = k + 1;
      });
      live.butterfly = [['層 · 配對距離', done + ' / 5 · ' + (done ? 16 >> (done - 1) : '—')], ['最大 |值|', fmt(BF.max[done], 2), 'hl'],
        ['量化後變 0', done === 5 ? BF.zeros + ' / 32（原本 22）' : '—', 'hl'], ['|值| > 2 的 channel', BF.big[done] + ' / 32'], ['乘法 · butterfly / dense', '320 / 1,024']];
    },
    learn: function (t) {
      var si = Math.round(seg(t, 0.12, 0.9) * 100), s = steps[si];
      if (!learnCache[si]) learnCache[si] = heatURL(s.T, learnVmax, 0.6);
      img(W.kImg, learnCache[si]);
      text(W.kStep, 'K · 第 ' + si + ' 步' + (si === 0 ? '（= Hadamard）' : ''));
      W.bars1.update(s.x, s.q, s.s, 1, function () { return 1; }, 1, false);
      draw(W.curve, si / 100);
      set(W.dot, 'cx', r1(W.pts[si][0])); set(W.dot, 'cy', r1(W.pts[si][1]));
      text(W.lossTx, 'L_out = ' + fmt(s.lout, 3));
      live.learn = [['步數', si + ' / 100'], ['L_out', fmt(s.lout, 3), 'hl'], ['L_A · L_W', fmt(s.la, 3) + ' · ' + fmt(s.lw, 4)],
        ['Hadamard（第 0 步）', fmt(steps[0].lout, 3)], ['SmoothQuant', fmt(smoothL, 3), 'ng'], ['不轉換', fmt(noneL, 3)]];
    },
    lowrank: function (t) {
      draw(W.wUp, ease(seg(t, 0.08, 0.35))); show(W.up, ease(seg(t, 0.15, 0.35)));
      draw(W.wLo, ease(seg(t, 0.35, 0.55))); show(W.lo, ease(seg(t, 0.4, 0.6)));
      draw(W.wSum, ease(seg(t, 0.62, 0.85))); show(W.sum, ease(seg(t, 0.7, 0.85)));
    },
    kernel: function (t) {
      show(W.kband, ease(seg(t, 0.04, 0.16)));
      W.bits.forEach(function (b, k) { show(b, ease(seg(t, 0.16 + k * 0.06, 0.22 + k * 0.06))); });
      show(W.bitsSum, ease(seg(t, 0.48, 0.56)));
      W.lat.forEach(function (l, i) {
        var k = ease(seg(t, 0.62 + i * 0.05, 0.8 + i * 0.05));
        set(l.bar, 'width', r1(l.v * 4.6 * k));
        set(l.tx, 'x', r1(696 + l.v * 4.6 * k));
        show(l.tx, k);
      });
    },
    results: function (t) {
      W.res.forEach(function (b) {
        var k = ease(seg(t, 0.04 + b.gi * 0.07, 0.3 + b.gi * 0.07)), h = b.v * 480 * k;
        set(b.bar, 'y', r1(b.base - h)); set(b.bar, 'height', r1(h));
        set(b.tx, 'y', r1(b.base - h - 6)); show(b.tx, k > 0.95 ? 1 : 0);
      });
    }
  };

  // ---- 說明欄 ----
  var caps = {};
  [].forEach.call(root.querySelectorAll('[data-cap]'), function (c) { caps[c.getAttribute('data-cap')] = c; });
  var statusEl = root.querySelector('[data-status]'), factsEl = root.querySelector('[data-facts]');
  var stopBtns = [].slice.call(root.querySelectorAll('[data-stop]'));
  var FACTS = {
    intro: [['資料格式', 'MXFP4 E2M1'], ['Block', '32 個值'], ['Scale', 'E8M0 · 2 的冪次'], ['FP4 的大小', '0 – 6，8 種']],
    invariance: [['Norm(XR)Rᵀ − Norm(X)', '最大誤差'], ['AdaLN', '4.2 ✗', 'hl'], ['RMSNorm', '1.7e-6 ✓'], ['LayerNorm', '0.92 ✗'], ['AdaRMSNorm', '4.4 ✗'], ['GroupNorm', '2.1 ✗']],
    design: [['d = 4096', '參數 · MAC/token'], ['SmoothQuant', '4,096 · 4,096'], ['Hadamard-32', '0 · 131k'], ['FlatQuant', '16.8M · 16.8M'], ['KroQuant', '1,920 · 131k', 'hl']],
    lowrank: [['低秩 rank', '128'], ['L、R 格式', 'MXFP4'], ['殘差 GEMM', 'W4A4'], ['LoRaQ 校正', 'Adam · 500 步'], ['SVDQuant 對照', 'rank 32 · FP16']],
    kernel: [['Scale (diag)', '25.52 µs', 'ng'], ['K1', '23.88 µs', 'hl'], ['K2', '27.80 µs'], ['FWHT', '68.04 µs'], ['Q4 only（下限）', '22.64 µs'], ['K2 vs FWHT', '2.45× 快']],
    results: [['LPIPS', 'LoRaQ → Kro'], ['PixArt-Σ MJHQ', '0.381 → 0.347', 'hl'], ['SANA MJHQ', '0.229 → 0.206', 'hl'], ['FLUX.1 MJHQ', '0.331 → 0.336'], ['FLUX.1 SDCI', '0.343 → 0.283', 'hl'], ['Had-32 → Kro PSNR', '15.7 → 16.5 dB']]
  };
  var live = {}, shownCap = '', factsHTML = '';
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
    var FULL = 45000, raf = 0, p0 = 0, t0 = 0, setY = 0, shown = '';
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
  readPalette();
  heats.forEach(paintHeat);
  if (reduceMotion) root.classList.add('is-static');
  else root.classList.add('is-live');
  measure();
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { measure(); force = true; request(); });
  if ('ResizeObserver' in window) new ResizeObserver(function () { measure(); force = true; request(); }).observe(svg);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { measure(); force = true; request(); });
  new MutationObserver(paintAll).observe(html, { attributes: true, attributeFilter: ['data-theme', 'data-scheme'] });
  if (darkMQ.addEventListener) darkMQ.addEventListener('change', paintAll);
  render(progress());
  requestAnimationFrame(function () { requestAnimationFrame(function () { root.classList.add('is-ready'); }); });
})();
