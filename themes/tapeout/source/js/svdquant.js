// toy SVDQuant: one 64-channel linear layer O = X·W
var SQ = (function () {
  'use strict';
  var N = 64, M = 64, O = 64;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  var OUT_X = { 9: 44, 30: -34, 47: 26 }, OUT_W = { 17: 4.5, 55: 3.5 };
  function makeData(seed) {
    var r = mulberry32(seed), X = [], W = [], cs = [], j;
    for (j = 0; j < N; j++) cs.push(Math.exp((r() - 0.5) * 1.6));
    for (var i = 0; i < M; i++) {
      var row = [], tok = 0.6 + 0.8 * r();
      for (j = 0; j < N; j++) row.push(OUT_X[j] ? OUT_X[j] * tok * (0.85 + 0.3 * r()) : gauss(r) * cs[j]);
      X.push(row);
    }
    for (j = 0; j < N; j++) { var w = [], ws = OUT_W[j] || 1; for (var o = 0; o < O; o++) w.push(gauss(r) * 0.1 * ws); W.push(w); }
    return { X: X, W: W, outX: [9, 30, 47], outW: [17, 55] };
  }
  // symmetric INT4, one scale per group of 64 values: s = max|x| / 7, levels −8 … 7
  function q4(x, out) {
    var amax = 0, k;
    for (k = 0; k < x.length; k++) amax = Math.max(amax, Math.abs(x[k]));
    var s = amax > 0 ? amax / 7 : 1;
    for (k = 0; k < x.length; k++) out[k] = Math.max(-8, Math.min(7, Math.round(x[k] / s))) * s;
    return s;
  }
  function qRows(A) { return A.map(function (r) { var q = new Array(r.length); q4(r, q); return q; }); }
  function T(A) { return A[0].map(function (_, j) { return A.map(function (r) { return r[j]; }); }); }
  function qCols(A) { return T(qRows(T(A))); } // weight groups run along the input channel
  function mul(A, B) {
    var n = B[0].length, Z = [];
    for (var i = 0; i < A.length; i++) { var z = new Array(n).fill(0); for (var k = 0; k < B.length; k++) { var a = A[i][k]; if (!a) continue; for (var j = 0; j < n; j++) z[j] += a * B[k][j]; } Z.push(z); }
    return Z;
  }
  function add(A, B) { return A.map(function (r, i) { return r.map(function (v, j) { return v + B[i][j]; }); }); }
  function sub(A, B) { return A.map(function (r, i) { return r.map(function (v, j) { return v - B[i][j]; }); }); }
  function fro(A) { var s = 0; A.forEach(function (r) { r.forEach(function (v) { s += v * v; }); }); return Math.sqrt(s); }
  function amax(A) { var m = 0; A.forEach(function (r) { r.forEach(function (v) { m = Math.max(m, Math.abs(v)); }); }); return m; }
  function rel(A, B) { return fro(sub(A, B)) / fro(B); }
  // one-sided Jacobi SVD: A = U·diag(s)·Vᵀ, s descending
  function svd(A) {
    var m = A.length, n = A[0].length, U = A.map(function (r) { return r.slice(); }), V = [], i, j, p, q;
    for (i = 0; i < n; i++) { V.push(new Array(n).fill(0)); V[i][i] = 1; }
    for (var sweep = 0; sweep < 60; sweep++) {
      var off = 0;
      for (p = 0; p < n - 1; p++) for (q = p + 1; q < n; q++) {
        var al = 0, be = 0, ga = 0;
        for (i = 0; i < m; i++) { al += U[i][p] * U[i][p]; be += U[i][q] * U[i][q]; ga += U[i][p] * U[i][q]; }
        if (Math.abs(ga) <= 1e-13 * Math.sqrt(al * be)) continue;
        off = Math.max(off, Math.abs(ga) / Math.sqrt(al * be));
        var ze = (be - al) / (2 * ga), t = (ze >= 0 ? 1 : -1) / (Math.abs(ze) + Math.sqrt(1 + ze * ze)), c = 1 / Math.sqrt(1 + t * t), s = c * t;
        for (i = 0; i < m; i++) { var up = U[i][p], uq = U[i][q]; U[i][p] = c * up - s * uq; U[i][q] = s * up + c * uq; }
        for (i = 0; i < n; i++) { var vp = V[i][p], vq = V[i][q]; V[i][p] = c * vp - s * vq; V[i][q] = s * vp + c * vq; }
      }
      if (off < 1e-12) break;
    }
    var sv = [];
    for (j = 0; j < n; j++) { var nn = 0; for (i = 0; i < m; i++) nn += U[i][j] * U[i][j]; sv.push(Math.sqrt(nn)); }
    var order = sv.map(function (_, k) { return k; }).sort(function (a, b) { return sv[b] - sv[a]; });
    return {
      s: order.map(function (k) { return sv[k]; }),
      U: U.map(function (r) { return order.map(function (k) { return sv[k] ? r[k] / sv[k] : 0; }); }),
      V: V.map(function (r) { return order.map(function (k) { return r[k]; }); })
    };
  }
  // rank-r part L1·L2, L1 = U_r·Σ_r (N×r), L2 = V_rᵀ (r×O)
  function lowRank(d, r) {
    var L1 = d.U.map(function (row) { return row.slice(0, r).map(function (u, k) { return u * d.s[k]; }); });
    var L2 = []; for (var k = 0; k < r; k++) L2.push(d.V.map(function (row) { return row[k]; }));
    return { L1: L1, L2: L2, LL: r ? mul(L1, L2) : d.U.map(function () { return new Array(O).fill(0); }) };
  }
  function colMax(A) { return A[0].map(function (_, j) { return A.reduce(function (m, r) { return Math.max(m, Math.abs(r[j])); }, 0); }); }
  function rowMax(A) { return A.map(function (r) { return r.reduce(function (m, v) { return Math.max(m, Math.abs(v)); }, 0); }); }
  // SmoothQuant: λ_j = max|X_j|^α / max|W_j|^(1−α), X̂ = X·diag(λ)⁻¹, Ŵ = diag(λ)·W
  function smooth(d, alpha) {
    var mx = colMax(d.X), mw = rowMax(d.W), lam = mx.map(function (a, j) { return Math.pow(a, alpha) / Math.pow(mw[j], 1 - alpha); });
    return { lam: lam, Xh: d.X.map(function (r) { return r.map(function (v, j) { return v / lam[j]; }); }), Wh: d.W.map(function (r, j) { return r.map(function (v) { return v * lam[j]; }); }) };
  }
  return { N: N, M: M, O: O, mulberry32: mulberry32, makeData: makeData, q4: q4, qRows: qRows, qCols: qCols, mul: mul, add: add, sub: sub,
    fro: fro, amax: amax, rel: rel, svd: svd, lowRank: lowRank, colMax: colMax, rowMax: rowMax, smooth: smooth };
})();
(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var html = document.documentElement;

  var darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
  var root = document.querySelector('[data-sq]');
  if (!root || !window.SQ) return;
  document.body.classList.add('is-svdquant');
  var track = root.querySelector('.sq-track'), stage = root.querySelector('.sq-stage');
  var svg = root.querySelector('[data-world]'), panel = root.querySelector('.sq-panel');
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
  function hidden(e) { e.setAttribute('opacity', 0); return e; }

  // ================= 資料：合成的一層 linear，載入時現算 =================
  var N = SQ.N, ALPHA = 0.5, RANK = 3, data = SQ.makeData(7), X = data.X, W = data.W, Y = SQ.mul(X, W);
  var mxX = SQ.colMax(X), mxW = SQ.rowMax(W);
  var TOK = (function () { var m = SQ.rowMax(X); return m.indexOf(Math.max.apply(null, m)); })();
  var COL = (function () { var m = SQ.colMax(W); return m.indexOf(Math.max.apply(null, m)); })();
  function col(A, j) { return A.map(function (r) { return r[j]; }); }
  function zeroFrac(A) { var z = 0; A.forEach(function (r) { r.forEach(function (v) { if (v === 0) z++; }); }); return z / (A.length * A[0].length); }
  var qX = SQ.qRows(X), qW = SQ.qCols(W);
  var errNone = SQ.rel(SQ.mul(qX, qW), Y);
  var tokX = X[TOK], tokQ = new Array(N), tokS = SQ.q4(tokX, tokQ);
  var colW = col(W, COL), colQ = new Array(N), colS = SQ.q4(colW, colQ);
  // smoothing：k 從 0 到 1，λ^k 一路套上去，先算好 21 格
  var sm = SQ.smooth(data, ALPHA), lam = sm.lam, Xh = sm.Xh, Wh = sm.Wh;
  var smSteps = [];
  for (var si = 0; si <= 20; si++) {
    var kk = si / 20, Xk = X.map(function (r) { return r.map(function (v, j) { return v / Math.pow(lam[j], kk); }); });
    var Wk = W.map(function (r, j) { return r.map(function (v) { return v * Math.pow(lam[j], kk); }); });
    var qXk = SQ.qRows(Xk), qWk = SQ.qCols(Wk);
    smSteps.push({ zx: zeroFrac(qXk), zw: zeroFrac(qWk), eo: SQ.rel(SQ.mul(qXk, qWk), Y), mx: SQ.amax(Xk), mw: SQ.amax(Wk) });
  }
  var errSmooth = smSteps[20].eo;
  // SVD：Ŵ = L1·L2 + R
  var svdW = SQ.svd(W), svdWh = SQ.svd(Wh), lr = SQ.lowRank(svdWh, RANK), Rm = SQ.sub(Wh, lr.LL);
  var qXh = SQ.qRows(Xh), qR = SQ.qCols(Rm);
  var errSVDQ = SQ.rel(SQ.add(SQ.mul(qXh, qR), SQ.mul(Xh, lr.LL)), Y);
  var errLR = (function () { var l = SQ.lowRank(svdW, RANK), R0 = SQ.sub(W, l.LL); return SQ.rel(SQ.add(SQ.mul(qX, SQ.qCols(R0)), SQ.mul(X, l.LL)), Y); })();
  var froWh = SQ.fro(Wh), froR = SQ.fro(Rm), maxWh = SQ.amax(Wh), maxR = SQ.amax(Rm);
  var errQWh = SQ.rel(SQ.qCols(Wh), Wh), errQR = SQ.rel(qR, Rm);
  // α 掃描（每一格一次 SVD）在閒置時才算，算完再重畫
  var sweep = null;
  function runSweep() {
    var out = [];
    for (var a = 0; a <= 10; a++) {
      var s2 = SQ.smooth(data, a / 10), q2 = SQ.qRows(s2.Xh), l2 = SQ.lowRank(SQ.svd(s2.Wh), RANK);
      out.push({ a: a / 10, sm: SQ.rel(SQ.mul(q2, SQ.qCols(s2.Wh)), Y), sv: SQ.rel(SQ.add(SQ.mul(q2, SQ.qCols(SQ.sub(s2.Wh, l2.LL))), SQ.mul(s2.Xh, l2.LL)), Y) });
    }
    return out;
  }

  // Nunchaku 的讀寫量：一層 3072 → 3072、4096 個 token、rank 32（推算，不含 scale）
  var MT = 4096, DD = 3072, RK = 32, MB = 1e6;
  var B16 = MT * DD * 2 / MB, B4 = MT * DD / 2 / MB, BW4 = DD * DD / 2 / MB, BL = DD * RK * 2 / MB, BXL = MT * RK * 2 / MB;
  var TRAFFIC = {
    plain: B16 + B4 + B4 + BW4 + B16,
    naive: (B16 + B4) + (B16 + BL + BXL) + (B4 + BW4 + B16) + (BXL + BL + 2 * B16),
    fused: (B16 + BL + B4 + BXL) + (B4 + BW4 + BXL + BL + B16)
  };

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
  var heats = [];
  function Heat(g, x, y, w, h, make) {
    var img = el('image', { x: x, y: y, width: w, height: h, preserveAspectRatio: 'none' }, g);
    var hm = { img: img, make: make };
    heats.push(hm);
    el('rect', { x: x, y: y, width: w, height: h, class: 'frame' }, g);
    return hm;
  }
  function paintHeat(hm) { var a = hm.make(); hm.img.setAttribute('href', heatURL(a[0], a[1], a[2])); }
  function paintAll() { readPalette(); heats.forEach(paintHeat); force = true; request(); }

  // ================= 世界：建一次，之後每幀只改屬性 =================
  var V = {}, CELL = 300 / N;
  function chX(j) { return (j + 0.5) * CELL; }

  // ---- A：X · W = O ----
  (function () {
    var g = el('g', {}, svg), vO = SQ.amax(Y);
    T(g, 0, -48, 'X · 64 token × 64 channel', 't-b');
    T(g, 370, -48, 'W · 64 in × 64 out', 't-b');
    T(g, 740, -48, 'O = X · W', 't-b');
    T(g, 0, -28, 'token ↓   channel →', 't-d');
    T(g, 370, -28, 'in ↓   out →', 't-d');
    Heat(g, 0, 0, 300, 300, function () { return [X, 30, 0.5]; });
    T(g, 335, 162, '·', 't-big mid');
    Heat(g, 370, 0, 300, 300, function () { return [W, 0.6, 0.6]; });
    T(g, 705, 162, '=', 't-big mid');
    Heat(g, 740, 0, 300, 300, function () { return [Y, vO, 0.6]; });
    V.xTags = hidden(el('g', {}, g));
    data.outX.forEach(function (j) {
      el('path', { d: 'M' + r1(chX(j)) + ' -2 V-10', class: 'lead' }, V.xTags);
      T(V.xTags, chX(j), -12, 'ch ' + j, (mxX[j] && X[TOK][j] < 0 ? 't-n' : 't-h') + ' mid');
    });
    V.wTags = hidden(el('g', {}, g));
    data.outX.concat(data.outW).forEach(function (j) {
      var isW = data.outW.indexOf(j) >= 0;
      el('path', { d: 'M366 ' + r1(chX(j)) + ' H358', class: 'lead' }, V.wTags);
      T(V.wTags, 354, chX(j) + 4, (isW ? 'w' : '') + j, (isW ? 't-n' : 't-h') + ' end');
    });
    V.introTx = hidden(T(g, 0, 336, 'X 的第 j 行（channel j）乘上 W 的第 j 列：X 有 3 條 outlier channel，W 也有 2 列特別大', 't-d'));
  })();

  // ---- 長條圖：一組 64 個值和 INT4 的格點 ----
  function Bars(g, o) {
    var gg = el('g', {}, g), grid = el('g', { opacity: 0 }, gg), lines = [], bars = [], ghosts = [], zs = [];
    for (var l = -7; l <= 7; l++) {
      if (!l) continue;
      lines.push({ L: l, ln: el('line', { x1: o.x0 - 8, x2: o.x0 + o.pitch * N, class: 'grid' }, grid), tx: l === 7 || l === -7 || l === 1 ? T(grid, o.x0 + o.pitch * N + 8, 0, '', 't-s') : null });
    }
    el('line', { x1: o.x0 - 12, y1: o.y0, x2: o.x0 + o.pitch * N + 4, y2: o.y0, class: 'axis' }, gg);
    for (var j = 0; j < N; j++) {
      var x = o.x0 + j * o.pitch;
      ghosts.push(el('rect', { x: x, width: o.bw, class: 'ghost', opacity: 0 }, gg));
      bars.push(el('rect', { x: x, width: o.bw, class: 'bar' }, gg));
      zs.push(el('circle', { cx: x + o.bw / 2, cy: o.y0, r: 3, class: 'zmark', opacity: 0 }, gg));
    }
    function box(e, v) { var h = Math.min(o.max, Math.abs(v) * o.sc); set(e, 'y', r1(v >= 0 ? o.y0 - h : o.y0)); set(e, 'height', r1(Math.max(0.01, h))); }
    return {
      // x：原始值；q：量化後；s：scale；grow：長出來；kj(j)：第 j 條吸到格點的進度；hot(j)：outlier 上色
      update: function (x, q, s, grow, kj, gridK, hot) {
        var nz = 0;
        lines.forEach(function (ln) {
          var y = o.y0 - ln.L * s * o.sc, inside = Math.abs(o.y0 - y) <= o.max + 0.5;
          set(ln.ln, 'y1', r1(y)); set(ln.ln, 'y2', r1(y)); show(ln.ln, inside ? 1 : 0);
          if (ln.tx) { set(ln.tx, 'y', r1(y + 4)); text(ln.tx, (ln.L > 0 ? '' : '−') + fmt(Math.abs(ln.L) * s, Math.abs(ln.L) * s < 1 ? 2 : 1)); show(ln.tx, inside ? 1 : 0); }
        });
        show(grid, gridK);
        for (var j2 = 0; j2 < N; j2++) {
          var k = kj(j2), v = lerp(x[j2] * grow, q[j2], k), isZ = q[j2] === 0 && k > 0.5;
          box(bars[j2], v); box(ghosts[j2], x[j2]);
          show(ghosts[j2], k > 0 ? 1 : 0);
          set(bars[j2], 'class', isZ ? 'bar is-zero' : hot(j2) ? 'bar is-out' : 'bar');
          show(zs[j2], isZ ? 1 : 0);
          if (isZ) nz++;
        }
        return nz;
      }
    };
  }

  // ---- B：一個 token、一個 W 的 column，各自一組 INT4 ----
  (function () {
    var g = el('g', {}, svg);
    T(g, 0, 418, 'X · token ' + TOK + ' · 64 個值 = 一組，一個 scale', 't-b');
    var mT = Math.max.apply(null, tokX.map(Math.abs)), mC = Math.max.apply(null, colW.map(Math.abs));
    V.barsX = Bars(g, { x0: 0, pitch: 15.5, bw: 10, y0: 590, sc: 150 / mT, max: 152 });
    V.scaleX = T(g, 0, 770, '', 't-d');
    T(g, 0, 818, 'W · out ' + COL + ' 的 64 個權重 = 一組', 't-b');
    V.barsW = Bars(g, { x0: 0, pitch: 15.5, bw: 10, y0: 920, sc: 82 / mC, max: 84 });
    V.scaleW = T(g, 0, 1030, '', 't-d');
  })();

  // ---- C：smoothing，上面 X 每個 channel 的 max、下面 W 每一列的 max，log 軸 ----
  var LOG0 = Math.log10(0.1), DEC = 56, AX = 1350;
  function logH(v) { return Math.max(0, (Math.log10(Math.max(v, 0.1)) - LOG0) * DEC); }
  (function () {
    var g = el('g', {}, svg), pitch = 15.5;
    T(g, 0, 1118, '每個 channel 的 max：上 = max|Xⱼ|，下 = max|Wⱼ|（log 軸）', 't-b');
    [1, 10, 100].forEach(function (v) {
      var h = logH(v);
      el('line', { x1: -8, y1: AX - h, x2: pitch * N, y2: AX - h, class: 'grid' }, g);
      el('line', { x1: -8, y1: AX + h, x2: pitch * N, y2: AX + h, class: 'grid' }, g);
      T(g, pitch * N + 8, AX - h + 4, String(v), 't-s');
      T(g, pitch * N + 8, AX + h + 4, String(v), 't-s');
    });
    el('line', { x1: -12, y1: AX, x2: pitch * N + 4, y2: AX, class: 'axis' }, g);
    T(g, -16, AX - 60, 'X', 't-b end'); T(g, -16, AX + 70, 'W', 't-b end');
    V.smUp = []; V.smDn = [];
    for (var j = 0; j < N; j++) {
      var hot = data.outX.indexOf(j) >= 0, wo = data.outW.indexOf(j) >= 0;
      V.smUp.push(el('rect', { x: j * pitch, width: 10, y: AX, height: 0, class: hot ? 'f-h' : 'f-i' }, g));
      V.smDn.push(el('rect', { x: j * pitch, width: 10, y: AX, height: 0, class: wo ? 'f-n' : hot ? 'f-h2' : 'f-i' }, g));
    }
    V.lamTx = T(g, 0, 1568, '', 't-d');
    V.eqTx = hidden(T(g, 0, 1592, 'α = 0.5 時兩邊每個 channel 的 max 一樣大：√(max|Xⱼ| · max|Wⱼ|)', 't-h'));
  })();

  // ---- D：Ŵ = L₁L₂ + R，奇異值 ----
  (function () {
    var g = el('g', {}, svg), vm = maxWh;
    T(g, 0, 1722, 'Ŵ（64 × 64）', 't-b');
    Heat(g, 0, 1740, 240, 240, function () { return [Wh, vm, 0.6]; });
    V.svdEq = hidden(el('g', {}, g));
    T(V.svdEq, 290, 1866, '=', 't-big mid');
    T(V.svdEq, 340, 1722, 'L₁L₂ · rank ' + RANK + ' · 16-bit', 't-h');
    Heat(V.svdEq, 340, 1740, 240, 240, function () { return [lr.LL, vm, 0.6]; });
    T(V.svdEq, 630, 1866, '+', 't-big mid');
    T(V.svdEq, 680, 1722, 'R = Ŵ − L₁L₂ · 4-bit', 't-b');
    Heat(V.svdEq, 680, 1740, 240, 240, function () { return [Rm, vm, 0.6]; });
    T(V.svdEq, 680, 2004, '同一個色階：R 幾乎看不到亮點', 't-s');
    var pitch = 15.5, base = 2290, sc = 180 / svdWh.s[0];
    T(g, 0, 2072, 'Ŵ 的奇異值 σ₁ ≥ σ₂ ≥ … ≥ σ₆₄', 't-b');
    V.svLegend = T(g, 990, 2072, '虛線 = 原本 W 的奇異值', 't-s end');
    el('line', { x1: -8, y1: base, x2: pitch * N, y2: base, class: 'axis' }, g);
    V.sv = svdWh.s.map(function (s, i) {
      var gh = el('rect', { x: i * pitch, width: 10, y: r1(base - svdW.s[i] * sc), height: r1(svdW.s[i] * sc), class: 'ghost', opacity: 0 }, g);
      var b = el('rect', { x: i * pitch, width: 10, y: base, height: 0, class: i < RANK ? 'f-h' : 'f-i' }, g);
      return { b: b, gh: gh, h: s * sc };
    });
    V.svCut = hidden(el('g', {}, g));
    el('line', { x1: RANK * pitch - 3, y1: base - 196, x2: RANK * pitch - 3, y2: base + 6, class: 'frame-d' }, V.svCut);
    T(V.svCut, RANK * pitch + 6, base - 184, '前 ' + RANK + ' 個 → 低秩分支；其餘的就是 R 的奇異值', 't-h');
    T(g, 0, base + 24, 'σ₁', 't-s'); T(g, 63 * pitch, base + 24, 'σ₆₄', 't-s');
  })();

  // ---- E：兩條路 ----
  function Card(g, x, y, w, h, label, cls, sub) {
    var gg = el('g', {}, g);
    el('rect', { x: x, y: y, width: w, height: h, rx: 3, class: cls || 'card' }, gg);
    var t = T(gg, x + w / 2, y + h / 2 + (sub ? 2 : 9), label, 't-serif mid');
    if (sub) T(gg, x + w / 2, y + h - 12, sub, 't-s mid');
    gg._label = t;
    return gg;
  }
  (function () {
    var g = el('g', {}, svg);
    T(g, 0, 2428, 'X·W = X̂·Ŵ = X̂·L₁L₂ + X̂·R  ≈  X̂·L₁L₂ + Q(X̂)·Q(R)', 't-b');
    T(g, 0, 2450, 'X̂ = X·diag(λ)⁻¹，Ŵ = diag(λ)·W；L₁、L₂、Q(R) 都是 offline 先算好', 't-d');
    Card(g, 0, 2570, 110, 60, 'X̂', 'card-h');
    V.up = hidden(el('g', {}, g));
    Card(V.up, 200, 2488, 90, 56, 'Q₄', 'card');
    Card(V.up, 340, 2478, 300, 76, '× Q₄(R)', 'card', '4-bit GEMM · 主幹');
    V.lo = hidden(el('g', {}, g));
    Card(V.lo, 200, 2660, 200, 76, '× L₁', 'card-n', 'down · 64 → ' + RANK);
    Card(V.lo, 440, 2660, 200, 76, '× L₂', 'card-n', 'up · ' + RANK + ' → 64');
    T(V.lo, 420, 2756, '16-bit 低秩分支', 't-n mid');
    V.sum = hidden(el('g', {}, g));
    el('circle', { cx: 752, cy: 2600, r: 22, class: 'card' }, V.sum);
    T(V.sum, 752, 2608, '+', 't-big mid');
    Card(V.sum, 820, 2570, 110, 60, 'O');
    V.wUp = wire(g, 'M110 2600 H150 V2516 H200 M290 2516 H340', 'wire-h');
    V.wLo = wire(g, 'M150 2600 V2698 H200 M400 2698 H440', 'wire-n');
    V.wSum = wire(g, 'M640 2516 H752 V2578 M640 2698 H752 V2622 M774 2600 H820', 'wire');
    V.bound = hidden(el('g', {}, g));
    T(V.bound, 0, 2808, 'X̂R − Q(X̂)Q(R) = X̂·(R − Q(R)) + (X̂ − Q(X̂))·Q(R)', 't-b');
    T(V.bound, 0, 2834, '‖誤差‖ ≤ ‖X̂‖·‖R − Q(R)‖ + ‖X̂ − Q(X̂)‖·‖Q(R)‖：R 越小、越平，誤差的上限越低', 't-d');
    V.eckart = hidden(T(g, 0, 2860, 'Eckart–Young：所有 rank ' + RANK + ' 的 L₁L₂ 裡，截斷 SVD 讓 ‖R‖ 最小 = √(σ²₄ + … + σ²₆₄)', 't-h'));
  })();

  // ---- F：四種做法的誤差、α 掃描 ----
  var CMP = [['不處理', errNone, 'f-i'], ['只做低秩', errLR, 'f-i'], ['只 smooth', errSmooth, 'f-n'], ['SVDQuant', errSVDQ, 'f-h']];
  var CB = 3320, CSC = 240 / 0.27, AX0 = 580, AXW = 420;
  (function () {
    var g = el('g', {}, svg);
    T(g, 0, 3008, '輸出的相對誤差 ‖Ô − O‖ / ‖O‖ · α = 0.5 · r = ' + RANK, 't-b');
    el('line', { x1: -6, y1: CB, x2: 470, y2: CB, class: 'axis' }, g);
    V.cmp = CMP.map(function (c, i) {
      var x = 10 + i * 116, bar = el('rect', { x: x, y: CB, width: 74, height: 0, class: c[2] }, g);
      T(g, x + 37, CB + 22, c[0], (i === 3 ? 't-h' : 't-s') + ' mid');
      var tx = hidden(T(g, x + 37, CB - 8, fmt(c[1], 3), (i === 3 ? 't-h' : 't-s') + ' mid'));
      return { bar: bar, tx: tx, v: c[1] };
    });
    // α 掃描：資料在閒置時才算，先畫軸
    T(g, AX0, 3008, '誤差 vs α（每一格各自重算一次 SVD）', 't-b');
    el('line', { x1: AX0, y1: CB, x2: AX0 + AXW, y2: CB, class: 'axis' }, g);
    el('line', { x1: AX0, y1: CB, x2: AX0, y2: CB - 250, class: 'axis' }, g);
    [0, 0.5, 1].forEach(function (a) { T(g, AX0 + a * AXW, CB + 22, 'α = ' + a, 't-s mid'); });
    V.sweepG = el('g', {}, g);
    V.sweepTx = T(g, AX0, 3372, '', 't-d');
  })();
  function buildSweep() {
    var g = V.sweepG, sc = 240 / Math.max.apply(null, sweep.map(function (s) { return s.sm; }));
    function pts(k) { return sweep.map(function (s) { return r1(AX0 + s.a * AXW) + ' ' + r1(CB - s[k] * sc); }); }
    V.cSm = wire(g, 'M' + pts('sm').join(' L'), 'curve-n');
    V.cSv = wire(g, 'M' + pts('sv').join(' L'), 'curve');
    function best(k) { return sweep.reduce(function (b, s) { return s[k] < b[k] ? s : b; }); }
    var bs = best('sm'), bv = best('sv');
    V.bSm = hidden(el('g', {}, g));
    el('circle', { cx: AX0 + bs.a * AXW, cy: r1(CB - bs.sm * sc), r: 5, class: 'f-n' }, V.bSm);
    el('line', { x1: AX0 + AXW - 250, y1: 3046, x2: AX0 + AXW - 226, y2: 3046, class: 'curve-n' }, V.bSm);
    T(V.bSm, AX0 + AXW, 3050, '只 smooth：最佳 α = ' + bs.a + ' · ' + fmt(bs.sm, 3), 't-n end');
    V.bSv = hidden(el('g', {}, g));
    el('circle', { cx: AX0 + bv.a * AXW, cy: r1(CB - bv.sv * sc), r: 5, class: 'f-h' }, V.bSv);
    el('line', { x1: AX0 + AXW - 250, y1: 3070, x2: AX0 + AXW - 226, y2: 3070, class: 'curve' }, V.bSv);
    T(V.bSv, AX0 + AXW, 3074, 'SVDQuant：最佳 α = ' + bv.a + ' · ' + fmt(bv.sv, 3), 't-h end');
    V.best = { sm: bs, sv: bv };
  }

  // ---- G：Nunchaku 的 kernel fusion ----
  var TB = 0.42; // 讀寫量長條：每 MB 幾個單位
  (function () {
    var g = el('g', {}, svg);
    T(g, 0, 3482, 'Linear 3072 → 3072 · 4096 token · rank 32', 't-b');
    el('path', { d: 'M60 3584 V3758 M360 3584 V3758', class: 'wire' }, g); // 主幹：Quantize 讀 X̂、GEMM 寫 O
    // 主幹兩個 kernel、低秩兩個 kernel；fusion 時低秩那兩個往上併進去
    V.kQ = Card(g, 0, 3520, 220, 64, 'Quantize', 'card');
    V.kG = Card(g, 300, 3520, 220, 64, '4-bit GEMM', 'card');
    V.kD = el('g', {}, g); Card(V.kD, 0, 3630, 220, 56, 'Down Proj', 'card-n');
    V.kU = el('g', {}, g); Card(V.kU, 300, 3630, 220, 56, 'Up Proj', 'card-n');
    V.fQ = hidden(T(g, 110, 3561, 'Quantize + Down', 't-b mid'));
    V.fG = hidden(T(g, 410, 3561, 'GEMM + Up', 't-b mid'));
    el('rect', { x: 0, y: 3760, width: 520, height: 38, rx: 3, class: 'band' }, g);
    T(g, 260, 3784, 'GPU 記憶體（DRAM）', 't-d mid');
    V.xD = wire(g, 'M160 3686 V3758', 'wire-n');                       // Down 再讀一次 X̂
    V.xU = wire(g, 'M460 3686 V3758', 'wire-n');                       // Up 讀寫一次 O
    V.xTx = hidden(el('g', {}, g));
    T(V.xTx, 168, 3740, '再讀一次 X̂（16-bit）', 't-n');
    T(V.xTx, 468, 3740, '再讀寫一次 O', 't-n');
    V.cross = wire(g, 'M150 3712 L170 3732 M170 3712 L150 3732 M450 3712 L470 3732 M470 3712 L450 3732', 'cross');
    // 讀寫量（推算）
    T(g, 600, 3482, '每層的讀寫量（推算，不含 scale）', 't-b');
    V.tr = [['只有 4-bit 主幹', TRAFFIC.plain, 'f-i'], ['加低秩 · 各自跑', TRAFFIC.naive, 'f-n'], ['加低秩 · Nunchaku', TRAFFIC.fused, 'f-h']].map(function (r, i) {
      var y = 3530 + i * 64, gg = el('g', {}, g);
      T(gg, 600, y - 8, r[0], 't-d');
      var bar = el('rect', { x: 600, y: y, width: 0, height: 20, class: r[2] }, gg);
      var tx = T(gg, 600, y + 15, fmt(r[1], 1) + ' MB', 't-s');
      return { bar: bar, tx: tx, v: r[1] };
    });
    V.latTx = hidden(T(g, 600, 3740, '論文：rank 32 直接跑，延遲多 57%', 't-n'));
  })();

  // ---- H：LoRA 直接接在低秩分支旁邊 ----
  (function () {
    var g = el('g', {}, svg), y = 4160;
    T(g, 0, 4110, '低秩分支本來就是 16-bit 的 L₁L₂：LoRA 的 A·B 可以直接併進去', 't-b');
    el('rect', { x: 40, y: y, width: 36, height: 240, class: 'card-n' }, g);
    T(g, 58, y + 264, 'L₁', 't-n mid');
    V.loA = hidden(el('g', {}, g));
    el('rect', { x: 76, y: y, width: 18, height: 240, class: 'card-x' }, V.loA);
    T(V.loA, 85, y + 264, 'A', 't-h mid');
    T(g, 140, y + 124, '·', 't-big mid');
    el('rect', { x: 180, y: y, width: 240, height: 36, class: 'card-n' }, g);
    T(g, 432, y + 24, 'L₂', 't-n');
    V.loB = hidden(el('g', {}, g));
    el('rect', { x: 180, y: y + 36, width: 240, height: 18, class: 'card-x' }, V.loB);
    T(V.loB, 432, y + 50, 'B', 't-h');
    T(g, 40, y + 300, 'd × 32', 't-s'); T(g, 180, y + 84, '32 × n', 't-s');
    V.loEq = hidden(T(g, 180, y + 140, '[L₁  A] · [L₂ ; B] = L₁L₂ + A·B', 't-b'));
    V.loRank = hidden(T(g, 180, y + 166, 'rank 32 + 16 = 48（LoRA rank 16 是示意）', 't-d'));
    T(g, 600, 4140, '殘差 Q(R)：4-bit，不動', 't-b');
    Heat(g, 600, y, 240, 240, function () { return [Rm, maxWh, 0.6]; });
    V.lock = hidden(el('g', {}, g));
    el('rect', { x: 860, y: y + 96, width: 34, height: 28, rx: 3, class: 'f-h' }, V.lock);
    el('path', { d: 'M867 ' + (y + 96) + ' v-8 a10 10 0 0 1 20 0 v8', class: 'wire-h' }, V.lock);
    T(V.lock, 860, y + 150, '不用重新量化', 't-h');
  })();

  // ---- I：結果（官方 repo 的數字）----
  var RES = [['NF4', 'W4A16', 0.272, 'f-i'], ['INT4', '—', 0.322, 'f-n'], ['INT4', 'SVDQ', 0.256, 'f-h2'], ['INT4', '+GPTQ', 0.223, 'f-h'],
    ['NVFP4', '—', 0.242, 'f-n'], ['NVFP4', 'SVDQ', 0.224, 'f-h2'], ['NVFP4', '+GPTQ', 0.203, 'f-h']];
  var SPD = [['模型大小', 3.6, '× 小'], ['記憶體用量', 3.5, '× 少'], ['4090 · 比 NF4 W4A16', 3.0, '× 快'], ['laptop 4090 · 比 BF16', 10.1, '× 快'], ['5090 · NVFP4 比 BF16', 3.1, '× 快']];
  (function () {
    var g = el('g', {}, svg), base = 4990;
    T(g, 0, 4618, 'FLUX.1-dev · MJHQ · LPIPS ↓（跟 BF16 原圖的距離）', 't-b');
    el('line', { x1: -6, y1: base, x2: 520, y2: base, class: 'axis' }, g);
    V.res = RES.map(function (r, i) {
      var x = 8 + i * 72, bar = el('rect', { x: x, y: base, width: 46, height: 0, class: r[3] }, g);
      T(g, x + 23, base + 20, r[0], 't-s mid'); T(g, x + 23, base + 36, r[1], 't-s mid');
      var tx = hidden(T(g, x + 23, base - 6, fmt(r[2], 3), (r[3] === 'f-h' ? 't-h' : 't-s') + ' mid'));
      return { bar: bar, tx: tx, v: r[2], i: i };
    });
    T(g, 600, 4618, 'FLUX.1 · 12B · Nunchaku', 't-b');
    V.spd = SPD.map(function (s, i) {
      var y = 4664 + i * 64, gg = el('g', {}, g);
      T(gg, 600, y - 8, s[0], 't-d');
      var bar = el('rect', { x: 600, y: y, width: 0, height: 20, class: i === 3 ? 'f-h' : 'f-h2' }, gg);
      var tx = hidden(T(gg, 600, y + 15, fmt(s[1], 1) + s[2], 't-h'));
      return { bar: bar, tx: tx, v: s[1], i: i };
    });
    T(g, 600, 5004, 'laptop 4090 的 10.1×：BF16 放不進 16 GB，要 CPU offload', 't-s');
  })();

  // ================= 段落與鏡頭 =================
  var BEATS = [['intro', 0.8], ['outlier', 1.6], ['smooth', 1.6], ['svd', 2.0], ['branch', 1.4], ['compare', 1.6], ['engine', 1.8], ['lora', 1.1], ['results', 1.4]];
  var HOLD = 0.35, STOPS = BEATS.slice(1).map(function (b) { return b[0]; });
  var total = BEATS.reduce(function (s, b) { return s + b[1]; }, HOLD), spans = {}, acc = 0;
  BEATS.forEach(function (b) { spans[b[0]] = { start: acc / total, len: b[1] / total }; acc += b[1]; });
  function localT(k, p) { return clamp01((p - spans[k].start) / spans[k].len); }
  function beatAt(p) { var cur = BEATS[0][0]; BEATS.forEach(function (b) { if (p >= spans[b[0]].start) cur = b[0]; }); return cur; }

  // 每格 [beat, t, 中心 x, 中心 y, 寬]：同一個位置放兩格 = 鏡頭停住
  var SHOTS = [
    ['intro', 0, 520, 150, 1240], ['intro', 0.55, 520, 150, 1240],
    ['outlier', 0.25, 512, 720, 1120], ['outlier', 1, 512, 725, 1120],
    ['smooth', 0.2, 512, 1350, 1120], ['smooth', 1, 512, 1355, 1120],
    ['svd', 0.15, 512, 2010, 1120], ['svd', 1, 512, 2015, 1120],
    ['branch', 0.2, 470, 2640, 1080], ['branch', 1, 470, 2645, 1080],
    ['compare', 0.15, 512, 3190, 1120], ['compare', 1, 512, 3195, 1120],
    ['engine', 0.15, 512, 3640, 1120], ['engine', 1, 512, 3645, 1120],
    ['lora', 0.2, 470, 4290, 1040], ['lora', 1, 470, 4290, 1040],
    ['results', 0.2, 512, 4810, 1120], ['results', 1, 512, 4810, 1120]
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
  function isOutX(j) { return data.outX.indexOf(j) >= 0; }
  function isOutW(j) { return Math.abs(colW[j]) > 3 * colS; }
  var bigW = colW.map(function (v, j) { return isOutW(j) ? 'w' + j : ''; }).filter(Boolean).join('、');
  var R = {
    intro: function (t) {
      show(V.xTags, ease(seg(t, 0.2, 0.5)));
      show(V.wTags, ease(seg(t, 0.4, 0.7)));
      show(V.introTx, ease(seg(t, 0.6, 0.9)));
    },
    outlier: function (t) {
      var grow = ease(seg(t, 0.02, 0.22)), snap = seg(t, 0.32, 0.62), snapW = seg(t, 0.66, 0.92);
      var zx = V.barsX.update(tokX, tokQ, tokS, grow, function (j) { return ease(seg(snap, j / N * 0.6, j / N * 0.6 + 0.4)); }, ease(seg(t, 0.22, 0.32)), isOutX);
      var zw = V.barsW.update(colW, colQ, colS, ease(seg(t, 0.1, 0.3)), function (j) { return ease(seg(snapW, j / N * 0.6, j / N * 0.6 + 0.4)); }, ease(seg(t, 0.6, 0.68)), isOutW);
      text(V.scaleX, t > 0.22 ? 'scale = max|x| / 7 = ' + fmt(tokS, 2) + '；格點只剩 −8 … 7 倍的 scale' : '');
      text(V.scaleW, t > 0.6 ? 'scale = ' + fmt(colS, 3) + '：' + bigW + ' 那一列把格點撐開' : '');
      live.outlier = [['token ' + TOK + ' 最大值', fmt(Math.max.apply(null, tokX.map(Math.abs)), 1)], ['X 的 scale', fmt(tokS, 2)], ['X 變成 0', (snap > 0.9 ? zx : '—') + ' / 64', 'hl'],
        ['W 的 scale', fmt(colS, 3)], ['W 變成 0', (snapW > 0.9 ? zw : '—') + ' / 64', 'hl'], ['W4A4 輸出誤差', snapW > 0.9 ? fmt(errNone, 3) : '—', 'ng']];
    },
    smooth: function (t) {
      var grow = ease(seg(t, 0, 0.2)), k = ease(seg(t, 0.28, 0.82)), st = smSteps[Math.round(k * 20)];
      V.smUp.forEach(function (b, j) { var h = logH(mxX[j] / Math.pow(lam[j], k)) * grow; set(b, 'y', r1(AX - h)); set(b, 'height', r1(h)); });
      V.smDn.forEach(function (b, j) { set(b, 'height', r1(logH(mxW[j] * Math.pow(lam[j], k)) * grow)); });
      text(V.lamTx, t > 0.2 ? 'λⱼ = max|Xⱼ|^α / max|Wⱼ|^(1−α) · α = 0.5 · 套上 λ^' + fmt(k, 2) : '');
      show(V.eqTx, ease(seg(t, 0.84, 0.96)));
      live.smooth = [['套上 λ 的比例', fmt(k, 2)], ['max|X̂|', fmt(st.mx, 2), 'hl'], ['max|Ŵ|', fmt(st.mw, 2), 'ng'],
        ['Q(X̂) 裡的 0', fmt(st.zx * 100, 0) + '%'], ['Q(Ŵ) 裡的 0', fmt(st.zw * 100, 0) + '%'], ['輸出誤差', fmt(st.eo, 3), 'hl']];
    },
    svd: function (t) {
      var grow = ease(seg(t, 0.04, 0.3)), cut = ease(seg(t, 0.4, 0.62)), base = 2290;
      V.sv.forEach(function (s, i) {
        var h = s.h * grow * (i < RANK ? 1 - 0.85 * cut : 1);
        set(s.b, 'y', r1(base - h)); set(s.b, 'height', r1(h));
        show(s.gh, ease(seg(t, 0.25, 0.4)));
        show(s.b, i < RANK ? 1 - 0.6 * cut : 1);
      });
      show(V.svCut, cut);
      show(V.svdEq, ease(seg(t, 0.62, 0.82)));
      live.svd = [['rank r', String(RANK) + '（論文 32）'], ['σ₁ · σ₃ · σ₄', fmt(svdWh.s[0], 1) + ' · ' + fmt(svdWh.s[2], 1) + ' · ' + fmt(svdWh.s[3], 1)],
        ['‖Ŵ‖ → ‖R‖', fmt(froWh, 1) + ' → ' + (cut > 0.5 ? fmt(froR, 1) : '—'), 'hl'], ['max|Ŵ| → max|R|', fmt(maxWh, 2) + ' → ' + (cut > 0.5 ? fmt(maxR, 2) : '—'), 'hl'],
        ['Q(Ŵ) 的誤差', fmt(errQWh * 100, 1) + '%'], ['Q(R) 的誤差', cut > 0.5 ? fmt(errQR * 100, 1) + '%' : '—', 'hl']];
    },
    branch: function (t) {
      draw(V.wUp, ease(seg(t, 0.05, 0.25))); show(V.up, ease(seg(t, 0.1, 0.25)));
      draw(V.wLo, ease(seg(t, 0.25, 0.45))); show(V.lo, ease(seg(t, 0.3, 0.45)));
      draw(V.wSum, ease(seg(t, 0.48, 0.62))); show(V.sum, ease(seg(t, 0.52, 0.62)));
      show(V.bound, ease(seg(t, 0.68, 0.8)));
      show(V.eckart, ease(seg(t, 0.84, 0.95)));
    },
    compare: function (t) {
      V.cmp.forEach(function (c, i) {
        var k = ease(seg(t, 0.04 + i * 0.08, 0.2 + i * 0.08)), h = c.v * CSC * k;
        set(c.bar, 'y', r1(CB - h)); set(c.bar, 'height', r1(h)); set(c.tx, 'y', r1(CB - h - 8)); show(c.tx, k > 0.95 ? 1 : 0);
      });
      if (!sweep) { text(V.sweepTx, '計算中…'); live.compare = null; return; }
      draw(V.cSm, ease(seg(t, 0.45, 0.65))); draw(V.cSv, ease(seg(t, 0.55, 0.75)));
      show(V.bSm, ease(seg(t, 0.75, 0.85))); show(V.bSv, ease(seg(t, 0.82, 0.92)));
      text(V.sweepTx, t > 0.88 ? '有了低秩分支，可以把更多 outlier 推給權重' : '');
      live.compare = [['不處理', fmt(errNone, 3)], ['只做低秩（r = ' + RANK + '）', fmt(errLR, 3)], ['只 smooth', fmt(errSmooth, 3), 'ng'], ['SVDQuant', fmt(errSVDQ, 3), 'hl'],
        ['最佳 α · smooth', t > 0.8 ? V.best.sm.a + ' · ' + fmt(V.best.sm.sm, 3) : '—'], ['最佳 α · SVDQuant', t > 0.88 ? V.best.sv.a + ' · ' + fmt(V.best.sv.sv, 3) : '—', 'hl']];
    },
    engine: function (t) {
      draw(V.xD, ease(seg(t, 0.08, 0.2))); draw(V.xU, ease(seg(t, 0.14, 0.26)));
      show(V.xTx, ease(seg(t, 0.2, 0.3)) * (1 - ease(seg(t, 0.62, 0.72))));
      show(V.latTx, ease(seg(t, 0.3, 0.4)));
      var f = ease(seg(t, 0.5, 0.72));
      set(V.kD, 'transform', 'translate(0 ' + r1(-110 * f) + ')'); show(V.kD, 1 - f);
      set(V.kU, 'transform', 'translate(0 ' + r1(-110 * f) + ')'); show(V.kU, 1 - f);
      show(V.kQ._label, 1 - f); show(V.kG._label, 1 - f); show(V.fQ, f); show(V.fG, f);
      draw(V.cross, ease(seg(t, 0.72, 0.84)));
      V.tr.forEach(function (r, i) {
        var k = ease(seg(t, i < 2 ? 0.08 + i * 0.12 : 0.78, i < 2 ? 0.3 + i * 0.12 : 0.95));
        set(r.bar, 'width', r1(r.v * TB * k)); set(r.tx, 'x', r1(606 + r.v * TB * k)); show(r.tx, k);
      });
      live.engine = [['X̂ · 16-bit', fmt(B16, 1) + ' MB'], ['O · 16-bit', fmt(B16, 1) + ' MB'], ['L₁ 或 L₂', fmt(BL, 2) + ' MB'],
        ['各自跑 / 只有主幹', fmt(TRAFFIC.naive / TRAFFIC.plain, 2) + '×', 'ng'], ['Nunchaku / 只有主幹', f > 0.5 ? fmt(TRAFFIC.fused / TRAFFIC.plain, 3) + '×' : '—', 'hl'], ['論文 · 直接跑的延遲', '+57%', 'ng']];
    },
    lora: function (t) {
      var a = ease(seg(t, 0.1, 0.35));
      set(V.loA, 'transform', 'translate(' + r1(-40 * (1 - a)) + ' 0)'); show(V.loA, a);
      set(V.loB, 'transform', 'translate(0 ' + r1(40 * (1 - a)) + ')'); show(V.loB, a);
      show(V.loEq, ease(seg(t, 0.4, 0.55))); show(V.loRank, ease(seg(t, 0.5, 0.65)));
      show(V.lock, ease(seg(t, 0.68, 0.85)));
    },
    results: function (t) {
      V.res.forEach(function (b) {
        var k = ease(seg(t, 0.04 + b.i * 0.05, 0.25 + b.i * 0.05)), h = b.v * 900 * k;
        set(b.bar, 'y', r1(4990 - h)); set(b.bar, 'height', r1(h)); set(b.tx, 'y', r1(4990 - h - 6)); show(b.tx, k > 0.95 ? 1 : 0);
      });
      V.spd.forEach(function (s) {
        var k = ease(seg(t, 0.45 + s.i * 0.07, 0.65 + s.i * 0.07));
        set(s.bar, 'width', r1(s.v * 36 * k)); set(s.tx, 'x', r1(606 + s.v * 36 * k)); show(s.tx, k);
      });
    }
  };

  // ---- 說明欄 ----
  var caps = {};
  [].forEach.call(root.querySelectorAll('[data-cap]'), function (c) { caps[c.getAttribute('data-cap')] = c; });
  var statusEl = root.querySelector('[data-status]'), factsEl = root.querySelector('[data-facts]');
  var stopBtns = [].slice.call(root.querySelectorAll('[data-stop]'));
  var FACTS = {
    intro: [['max|X|', fmt(SQ.amax(X), 1), 'hl'], ['X 的中位數 |x|', fmt(median(X), 2)], ['max|W|', fmt(SQ.amax(W), 2), 'ng'], ['W 的中位數 |w|', fmt(median(W), 3)], ['INT4 · 一組', '64 個值'], ['NVFP4 · 一組', '16 個值 · FP8 scale']],
    branch: [['主幹', 'W4A4 · Q(X̂)·Q(R)'], ['低秩分支', '16-bit · X̂·L₁·L₂'], ['L₁ · L₂', '64×' + RANK + ' · ' + RANK + '×64'], ['論文的 rank', '32'], ['多出的計算（3072², r = 32）', fmt(2 * 32 / 3072 * 100, 1) + '%', 'hl']],
    lora: [['低秩分支', '16-bit'], ['加 LoRA', '併進 L₁、L₂'], ['殘差 Q(R)', '不動', 'hl'], ['重新量化', '不用', 'hl']],
    results: [['LPIPS · FLUX.1-dev', ''], ['INT4 · 直接量化', '0.322', 'ng'], ['INT4 · SVDQ+GPTQ', '0.223', 'hl'], ['NVFP4 · 直接量化', '0.242', 'ng'], ['NVFP4 · SVDQ+GPTQ', '0.203', 'hl'], ['NF4 W4A16', '0.272']]
  };
  function median(A) { var v = []; A.forEach(function (r) { r.forEach(function (x) { v.push(Math.abs(x)); }); }); v.sort(function (a, b) { return a - b; }); return v[v.length >> 1]; }
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
    var si2 = STOPS.indexOf(beat);
    stopBtns.forEach(function (b, i) {
      b.classList.toggle('is-on', i === si2);
      if (i === si2) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.querySelector('i').style.setProperty('--p', i < si2 ? 1 : i === si2 ? Math.round(localT(beat, p) * 100) / 100 : 0);
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
  // α 掃描比較重，等第一幀畫完、瀏覽器閒下來再算
  (window.requestIdleCallback || function (f) { return setTimeout(f, 300); })(function () { sweep = runSweep(); buildSweep(); force = true; request(); });
})();
