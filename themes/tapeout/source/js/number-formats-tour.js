/* ==========================================================================
   數值格式比較的捲動解說（layout: number-formats，接在 js/number-formats.js 後面）
   一條捲動進度 p 驅動整段 SVG：π 的 32 個 bit → mantissa 變短 → E4M3 vs E5M2 → INT8 換線性座標
   → per-tensor scale 被 outlier 撐開 → MXFP4 / NVFP4 的 block scale → NF4 的分位數 → posit 的 regime → 總覽。
   數學（解碼、量化、資料）用 js/number-formats.js 匯出的 window.DFMath，畫面上的數字都是現場算的。
   ========================================================================== */
(function () {
  'use strict';
  var root = document.querySelector('[data-ft]'), M = window.DFMath;
  if (!root || !M) return;
  var track = root.querySelector('.ft-track'), stage = root.querySelector('.ft-stage');
  var svg = root.querySelector('[data-world]'), panel = root.querySelector('.ft-panel');
  var html = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var NS = 'http://www.w3.org/2000/svg';
  var F = M.byId, PI = Math.PI, log2 = Math.log2;

  /* ---------- 小工具 ---------- */
  function P2(k) { return Math.pow(2, k); }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function el(name, attrs, parent, txt) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (txt != null) e.textContent = txt;
    if (parent) parent.appendChild(e);
    return e;
  }
  function T(g, x, y, s, cls) { return el('text', { x: x, y: y, 'class': cls }, g, s); }
  // 值沒變就不寫回 DOM
  function set(e, k, v) { var key = '_x_' + k; if (e[key] === v) return; e[key] = v; e.setAttribute(k, v); }
  function show(e, o) { set(e, 'opacity', Math.round(clamp01(o) * 100) / 100); }
  function text(e, s) { if (e._t !== s) { e._t = s; e.textContent = s; } }
  function wire(g, d, cls) { return el('path', { d: d, 'class': cls, pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1, opacity: 0 }, g); }
  function draw(e, k) { set(e, 'stroke-dashoffset', Math.round((1 - k) * 1000) / 1000); set(e, 'opacity', k > 0 ? 1 : 0); }
  function move(e, x, y) { set(e, 'transform', 'translate(' + r1(x) + ' ' + r1(y) + ')'); }

  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function sup(n) { return String(n).replace(/[-0-9]/g, function (c) { return SUP[c]; }); }
  function num(v, d) {
    if (v !== v) return 'NaN';
    if (v === 0) return '0';
    var a = Math.abs(v), s = a >= 1e6 || a < 1e-4 ? a.toExponential((d || 4) - 1).replace(/\.?0+e/, 'e').replace('e+', 'e').replace('e-', 'e−') : String(+a.toPrecision(d || 7));
    return (v < 0 ? '−' : '') + s;
  }
  function fix(v, d) { return v.toFixed(d).replace('-', '−'); }
  function pct(v) { return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v * 100).toFixed(Math.abs(v) < 0.001 ? 3 : 2) + '%'; }
  function db(v) { return isFinite(v) ? fix(v, 1) + ' dB' : '∞'; }
  function bitAt(code, pos) { return Math.floor(code / P2(pos)) % 2; }
  function nearest(arr, v) {
    var lo = 0, hi = arr.length - 1;
    if (v <= arr[0]) return 0;
    if (v >= arr[hi]) return hi;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (arr[mid] <= v) lo = mid; else hi = mid; }
    return v - arr[lo] <= arr[hi] - v ? lo : hi;
  }
  var f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  function encode(f, x) {
    if (f.A.all) return f.A.codes[nearest(f.A.all, f.q(x))];
    f32[0] = x;
    return u32[0];
  }
  // 一串正值每個 binade [2^k, 2^(k+1)) 有幾個
  function bins(vals) { var b = {}; vals.forEach(function (v) { var k = M.floorLog2(v); b[k] = (b[k] || 0) + 1; }); return b; }

  /* ================= 場景 A：π 的 bit、主數線、[2, 4) 放大條、兩條 lane ================= */
  var wA = el('g', {}, svg), gA = el('g', { 'class': 'ft-scene' }, wA);
  var LU = 32, AX_LO = -16, AX_HI = 17;
  function LX(l) { return 600 + (l - 0.5) * LU; }                 // 主數線：l = log2(v)
  function LIN(v) { return 72 + v / 448 * 1056; }                 // 線性座標：0 到 448
  var SX0 = 300, SX1 = 900;
  function SX(v) { return SX0 + (v - 2) / 2 * (SX1 - SX0); }      // [2, 4) 放大條
  var Y_AX = 150, Y_STRIP = 290, Y_LA = 410, Y_LB = 500, Y_LAX = 548;

  // 主數線
  var gAxis = el('g', { 'class': 'axis-g' }, gA);
  el('line', { x1: LX(AX_LO), x2: LX(AX_HI), y1: Y_AX, y2: Y_AX, 'class': 'axis' }, gAxis);
  for (var k = AX_LO; k <= AX_HI; k++) {
    el('line', { x1: LX(k), x2: LX(k), y1: Y_AX - (k % 4 ? 3 : 6), y2: Y_AX + (k % 4 ? 3 : 6), 'class': 'axis' }, gAxis);
    if (k % 4 === 0) T(gAxis, LX(k), Y_AX + 24, '2' + sup(k), 't-d mid');
  }
  var band = el('rect', { x: LX(1), y: Y_AX - 12, width: LU, height: 24, 'class': 'band', opacity: 0 }, gAxis);
  var bandTx = T(gAxis, LX(1.5), Y_AX - 18, '[2, 4)', 't-h mid');
  var piMark = el('path', { d: 'M' + r1(LX(log2(PI))) + ' ' + (Y_AX - 4) + 'l-6 -10h12z', 'class': 'f-h', opacity: 0 }, gAxis);
  var piTx = T(gAxis, LX(log2(PI)) + 10, Y_AX - 9, 'π', 't-h');
  show(piTx, 0);
  // 現在這個格式的值域
  var rngG = el('g', { opacity: 0 }, gA);
  var rngLine = el('line', { y1: 100, y2: 100, 'class': 'rng-a' }, rngG);
  var rngL = T(rngG, 0, 104, '', 't-s'), rngR = T(rngG, 0, 104, '', 't-s');
  var rngLab = T(rngG, 0, 90, '值域', 't-s end');

  // bit 列：32 格，格式換了就重新排
  var PITCH = 32, CW = 28;
  var gBits = el('g', {}, gA), cells = [];
  for (var i = 0; i < 32; i++) {
    var cg = el('g', { 'class': 'cell' }, gBits);
    el('rect', { x: 0, y: -17, width: CW, height: 34, rx: 3 }, cg);
    cells.push({ g: cg, tx: T(cg, CW / 2, 5, '0', 'mid'), type: i === 0 ? 's' : i <= 8 ? 'e' : 'm' });
  }
  var brk = {}, brkTx = {};
  ['s', 'e', 'm'].forEach(function (f) {
    brk[f] = el('path', { 'class': 'brk', 'data-t': f }, gBits);
    brkTx[f] = T(gBits, 0, -30, '', 't-s');
  });
  var formula = T(gA, 600, -64, '', 't-b mid');
  var cExp = wire(gA, '', 'lead'), cMan = wire(gA, '', 'lead');

  function layoutA(f, e, m) {
    var n = 1 + e + m, code = encode(f, PI), order = [0], j;
    for (j = 1; j <= e; j++) order.push(j);
    for (j = 0; j < m; j++) order.push(9 + j);
    var x0 = 600 - (order.length * PITCH - (PITCH - CW)) / 2;
    var L = { f: f, e: e, m: m, n: n, code: code, vis: [], x: [], bit: [], q: f.q(PI), d: M.decode(f.enc, code) };
    for (j = 0; j < 32; j++) { L.vis[j] = 0; L.x[j] = null; L.bit[j] = 0; }
    order.forEach(function (s, idx) {
      L.vis[s] = 1;
      L.x[s] = x0 + idx * PITCH;
      L.bit[s] = bitAt(code, s === 0 ? n - 1 : s <= 8 ? n - 1 - s : m - 1 - (s - 9));
    });
    L.span = { s: [L.x[0], L.x[0] + CW], e: [L.x[1], L.x[e] + CW], m: [L.x[9], L.x[9 + m - 1] + CW] };
    L.lab = { s: '符號', e: '指數 · ' + e, m: 'mantissa · ' + m };
    var bias = f.enc.bias, mant = 1 + L.d.M / P2(m);
    L.formula = '(−1)' + sup(L.d.s) + ' × 2' + sup(L.d.E) + '⁻' + sup(bias) + ' × ' + String(+mant.toFixed(7)) + ' = ' + num(L.q, 8);
    L.lo = log2(f.A.minPos); L.hi = log2(f.A.max);
    return L;
  }
  var LAY = {
    fp32: layoutA(F.fp32, 8, 23), bf16: layoutA(F.bf16, 8, 7), e4m3: layoutA(F.fp8e4m3, 4, 3),
    fp4: layoutA(F.fp4, 2, 1), e5m2: layoutA(F.fp8e5m2, 5, 2)
  };

  // [2, 4) 放大條：每個格式各一組刻度
  var gStrip = el('g', { opacity: 0 }, gA);
  el('path', { d: 'M' + LX(1) + ' ' + (Y_AX + 12) + 'L' + SX0 + ' ' + (Y_STRIP - 18) + 'M' + LX(2) + ' ' + (Y_AX + 12) + 'L' + SX1 + ' ' + (Y_STRIP - 18), 'class': 'lead' }, gStrip);
  el('line', { x1: SX0, x2: SX1, y1: Y_STRIP, y2: Y_STRIP, 'class': 'axis' }, gStrip);
  [2, 2.5, 3, 3.5, 4].forEach(function (v) { T(gStrip, SX(v), Y_STRIP + 34, String(v), 't-d mid'); });
  var stripTicks = {};
  Object.keys(LAY).forEach(function (key) {
    var L = LAY[key], g = el('g', { opacity: 0 }, gStrip), nT = P2(L.m);
    if (nT > 1024) {
      el('rect', { x: SX0, y: Y_STRIP - 12, width: SX1 - SX0, height: 24, 'class': 'dense' }, g);
      T(g, SX1 + 14, Y_STRIP + 4, '2' + sup(L.m) + ' = ' + nT.toLocaleString('en-US') + ' 格', 't-s');
    } else {
      var d = '';
      for (var t = 0; t <= nT; t++) d += 'M' + r1(SX(2 + 2 * t / nT)) + ' ' + (Y_STRIP - 12) + 'v24';
      el('path', { d: d, 'class': 'grid-t' }, g);
      T(g, SX1 + 14, Y_STRIP + 4, nT + ' 格', 't-s');
    }
    stripTicks[key] = g;
  });
  el('line', { x1: SX(PI), x2: SX(PI), y1: Y_STRIP - 24, y2: Y_STRIP + 18, 'class': 'pi-l' }, gStrip);
  T(gStrip, SX(PI), Y_STRIP - 30, 'π', 't-h mid');
  var qDot = el('circle', { r: 5, cy: Y_STRIP, 'class': 'qdot' }, gStrip);
  var qTx = T(gStrip, 0, Y_STRIP + 52, '', 't-b mid');

  // lane：一串正值畫成值域線、刻度、上面的精度階梯（log 座標時才有）
  var PXB = 7;
  function Lane(parent, f, y, vals, name, note, minNorm) {
    var g = el('g', { 'class': 'lane', 'data-family': f.family, opacity: 0 }, parent);
    var L = { g: g, y: y, vals: vals, max: vals[vals.length - 1], min: vals[0], minNorm: minNorm || vals[0], f: f };
    L.stairs = el('path', { 'class': 'stairs' }, g);
    L.sub = el('line', { y1: y, y2: y, 'class': 'rng rng-sub' }, g);
    L.rng = el('line', { y1: y, y2: y, 'class': 'rng' }, g);
    L.ticks = el('path', { 'class': 'tk' }, g);
    T(g, 58, y + 4, name, 'nm end');
    L.note = el('text', { x: 0, y: y + 26, 'class': 't-s', 'text-anchor': 'end' }, g, note);
    L.bins = bins(vals);
    return L;
  }
  function stairsPath(L, X, y, pxb) {
    var d = '', started = false, lastX = 0;
    Object.keys(L.bins).map(Number).sort(function (a, b) { return a - b; }).forEach(function (b) {
      var xa = Math.max(X(b), X(log2(L.min))), xb = Math.min(X(b + 1), X(log2(L.max))), h = Math.max(1.5, log2(L.bins[b]) * pxb);
      if (xb <= xa) return;
      if (!started || Math.abs(xa - lastX) > 0.5) { if (started) d += 'V' + y; d += 'M' + r1(xa) + ' ' + y; started = true; }
      d += 'V' + r1(y - h) + 'H' + r1(xb);
      lastX = xb;
    });
    return started ? d + 'V' + y + 'Z' : '';
  }
  function laneDraw(L, xOf, km) {
    var t = '';
    for (var j = 0; j < L.vals.length; j++) t += 'M' + r1(xOf(L.vals[j])) + ' ' + (L.y + 3) + 'v7';
    set(L.ticks, 'd', t);
    set(L.rng, 'x1', r1(xOf(L.minNorm))); set(L.rng, 'x2', r1(xOf(L.max)));
    set(L.sub, 'x1', r1(xOf(L.min))); set(L.sub, 'x2', r1(xOf(L.minNorm)));
    set(L.note, 'x', r1(xOf(L.max)));
    show(L.stairs, 1 - km);
  }
  var gLanes = el('g', {}, gA);
  var E4 = F.fp8e4m3.A.pos, E5 = F.fp8e5m2.A.pos, I8 = [];
  for (i = 1; i <= 127; i++) I8.push(i * 448 / 127);
  var lnE4 = Lane(gLanes, F.fp8e4m3, Y_LA, Array.from(E4), 'E4M3', '448', P2(-6));
  var lnE5 = Lane(gLanes, F.fp8e5m2, Y_LB, Array.from(E5), 'E5M2', '57344', P2(-14));
  var lnI8 = Lane(gLanes, F.int8, Y_LB, I8, 'INT8', '448 = 127 × 3.53');
  [lnE4, lnE5, lnI8].forEach(function (L) { set(L.stairs, 'd', stairsPath(L, LX, L.y - 6, PXB)); });
  // lane 的座標軸：log 標籤和線性標籤交叉淡入淡出
  var gLax = el('g', { opacity: 0 }, gA);
  el('line', { x1: 72, x2: 1128, y1: Y_LAX, y2: Y_LAX, 'class': 'axis' }, gLax);
  var laxLog = [], laxLin = [];
  for (k = -16; k <= 16; k += 4) laxLog.push({ v: P2(k), t: T(gLax, 0, Y_LAX + 20, '2' + sup(k), 't-d mid') });
  [0, 112, 224, 336, 448].forEach(function (v) { laxLin.push({ v: v, t: T(gLax, LIN(v), Y_LAX + 20, String(v), 't-d mid') }); });
  var linZone = el('g', { opacity: 0 }, gA);
  el('rect', { x: LIN(0), y: Y_LA - 34, width: LIN(28) - LIN(0), height: Y_LB - Y_LA + 52, 'class': 'zone' }, linZone);
  var e4Below = E4.filter(function (v) { return v < 28; }).length, i8Below = I8.filter(function (v) { return v < 28; }).length;
  T(linZone, LIN(28) + 8, Y_LA - 20, '0 – 28（最大值的 1/16）：E4M3 ' + e4Below + ' 格、INT8 ' + i8Below + ' 格', 't-h');

  /* ================= 場景 B：一個 token 的 256 個 channel ================= */
  var wB = el('g', {}, svg), gB = el('g', { 'class': 'ft-scene' }, wB);
  var B0 = 1050, BH = 170, CX0 = 88;
  function CX(c) { return CX0 + c * 4 + 2; }
  var TOK = 32, CH = 256, OUT = [7, 141];
  var X1 = M.makeData('outlier', 1, 1), NX = X1.length;
  function isOut(i) { var c = i % CH; return c === OUT[0] || c === OUT[1]; }
  var amaxN = 0, amaxO = 0;
  for (i = 0; i < NX; i++) { var a = Math.abs(X1[i]); if (isOut(i)) amaxO = Math.max(amaxO, a); else amaxN = Math.max(amaxN, a); }
  function amaxAt(m) { return Math.max(amaxN, amaxO * m); }
  function tensorAt(m) { var x = new Float64Array(NX); for (var j = 0; j < NX; j++) x[j] = X1[j] * (isOut(j) ? m : 1); return x; }
  var X20 = tensorAt(20);
  var RES = {
    int4: M.quantize(F.int4, X20, { scaling: 'tensor', group: 0 }),
    mx: M.quantize(F.mxfp4, X20, { scaling: 'tensor', group: 0 }),
    nv: M.quantize(F.nvfp4, X20, { scaling: 'tensor', group: 0 })
  };
  // INT4 per-tensor 在倍數 m 時的統計（整個 tensor 8192 個值）
  var int4Cache = {};
  function int4At(m) {
    var key = m.toFixed(3);
    if (int4Cache[key]) return int4Cache[key];
    var s = amaxAt(m) / 7, sig = 0, noise = 0, zero = 0;
    for (var j = 0; j < NX; j++) {
      var x = X1[j] * (isOut(j) ? m : 1), q = F.int4.q(x / s) * s, e = x - q;
      sig += x * x; noise += e * e;
      if (q === 0 && x !== 0) zero++;
    }
    return (int4Cache[key] = { s: s, amax: amaxAt(m), sqnr: 10 * Math.log10(sig / noise), zero: zero / NX });
  }
  T(gB, CX0, 842, '一個 token 的 256 個 channel', 't-b');
  var bTitle = T(gB, 1112, 842, '', 't-s end');
  el('rect', { x: CX0 - 2, y: B0 - BH - 6, width: 1028, height: 2 * BH + 12, 'class': 'plot' }, gB);
  el('line', { x1: CX0 - 2, x2: CX0 + 1026, y1: B0, y2: B0, 'class': 'axis' }, gB);
  var yTop = T(gB, CX0 - 8, B0 - BH + 4, '', 't-d end'), yBot = T(gB, CX0 - 8, B0 + BH + 4, '', 't-d end');
  T(gB, CX0 - 8, B0 + 4, '0', 't-d end');
  var gGrid4 = el('path', { 'class': 'lvl lvl-i' }, gB), gGridMX = el('path', { 'class': 'lvl' }, gB), gGridNV = el('path', { 'class': 'lvl' }, gB);
  var bndMX = [], bndNV = [];
  for (i = 1; i < 16; i++) {
    var bx = CX0 - 2 + i * 64, ln = wire(gB, 'M' + bx + ' ' + (B0 - BH - 6) + 'V' + (B0 + BH + 6), 'bnd');
    (i % 2 ? bndNV : bndMX).push(ln);
  }
  var mxLab = [];
  for (i = 0; i < 8; i++) {
    var sg = RES.mx.segs[i];
    mxLab.push(T(gB, CX0 - 2 + i * 128 + 64, B0 - BH - 14, '×2' + sup(log2(sg.s)), 't-s mid'));
  }
  var stems = el('path', { 'class': 'stem' }, gB), stemsOut = el('path', { 'class': 'stem stem-o' }, gB), clipMk = el('path', { 'class': 'f-h' }, gB);
  var qMarks = el('path', { 'class': 'qm' }, gB), qZero = el('path', { 'class': 'qz' }, gB);
  OUT.forEach(function (c) { T(gB, CX(c), B0 + BH + 24, 'ch ' + c, 't-h mid'); });
  var row = Array.prototype.slice.call(X1, 0, CH);
  function sceneBDraw(m, view, qOf, zeroO, grids) {
    var yS = BH / view, lim = view * 1.03, d = '', dO = '', cm = '', qm = '', qz = '';
    for (var c = 0; c < CH; c++) {
      var v = row[c] * (OUT.indexOf(c) > -1 ? m : 1), vc = Math.max(-lim, Math.min(lim, v)), x = r1(CX(c)), y = r1(B0 - vc * yS);
      if (OUT.indexOf(c) > -1) dO += 'M' + x + ' ' + B0 + 'V' + y; else d += 'M' + x + ' ' + B0 + 'V' + y;
      if (v !== vc) cm += 'M' + x + ' ' + r1(y + (v > 0 ? -8 : 8)) + 'l-4 ' + (v > 0 ? 8 : -8) + 'h8z';
      var q = qOf(c, v), qc = Math.max(-lim, Math.min(lim, q));
      if (q === 0) qz += 'M' + (x - 1.6) + ' ' + B0 + 'h3.2';
      else qm += 'M' + (x - 1.8) + ' ' + r1(B0 - qc * yS) + 'h3.6';
    }
    set(stems, 'd', d); set(stemsOut, 'd', dO); set(clipMk, 'd', cm); set(qMarks, 'd', qm); set(qZero, 'd', qz);
    show(qZero, zeroO);
    text(yTop, '+' + num(view, 3)); text(yBot, '−' + num(view, 3));
    // 格線：只畫看得到的範圍
    function lines(levels, x0, x1) {
      var s = '';
      levels.forEach(function (v) { if (Math.abs(v) <= lim) s += 'M' + r1(x0) + ' ' + r1(B0 - v * yS) + 'H' + r1(x1); });
      return s;
    }
    if (grids.int4) { var s4 = int4At(m).s, lv = []; for (var k2 = -7; k2 <= 7; k2++) lv.push(k2 * s4); set(gGrid4, 'd', lines(lv, CX0 - 2, CX0 + 1026)); }
    show(gGrid4, grids.int4);
    ['mx', 'nv'].forEach(function (key) {
      var path = key === 'mx' ? gGridMX : gGridNV, k3 = grids[key];
      show(path, k3);
      if (!k3) return;
      var nb = key === 'mx' ? 8 : 16, w = 1024 / nb, s = '';
      for (var b = 0; b < nb; b++) {
        var sc = RES[key].segs[b].s, lv2 = Array.prototype.map.call(F.fp4.A.all, function (v) { return v * sc; });
        s += lines(lv2, CX0 - 2 + b * w + 2, CX0 - 2 + (b + 1) * w - 2);
      }
      set(path, 'd', s);
    });
  }
  function qInt4(m) { var s = int4At(m).s; return function (c, v) { return F.int4.q(v / s) * s; }; }

  /* ================= 場景 C：NF4 的分位數 ================= */
  var wC = el('g', {}, svg), gC = el('g', { 'class': 'ft-scene' }, wC);
  var C0 = 1800, CHH = 160, SIG = 1 / 1.8481;   // NF4 用 N(0,1) 在 0.9677 的分位數（1.848）當 ±1
  function UX(u) { return 600 + u * 400; }
  function pdf(u) { return Math.exp(-u * u / (2 * SIG * SIG)); }
  T(gC, 200, 1592, 'NF4 假設的分佈：N(0, 1)，±1 = 第 96.77 百分位', 't-b');
  var curvePts = [];
  for (i = 0; i <= 200; i++) { var u = -1 + i / 100; curvePts.push([UX(u), C0 - pdf(u) * CHH]); }
  var curve = wire(gC, 'M' + curvePts.map(function (p) { return r1(p[0]) + ' ' + r1(p[1]); }).join('L'), 'curve');
  el('line', { x1: UX(-1), x2: UX(1), y1: C0, y2: C0, 'class': 'axis' }, gC);
  var NF = Array.from(F.nf4.A.all), FP4N = Array.from(F.fp4.A.all).map(function (v) { return v / 6; }), I4N = Array.from(F.int4.A.all).filter(function (v) { return v >= -7; }).map(function (v) { return v / 7; });
  var slices = el('g', { opacity: 0 }, gC);
  for (i = 0; i < NF.length - 1; i += 2) {
    var a0 = NF[i], a1 = NF[i + 1], dd = 'M' + r1(UX(a0)) + ' ' + C0;
    for (var s2 = 0; s2 <= 12; s2++) { var uu = lerp(a0, a1, s2 / 12); dd += 'L' + r1(UX(uu)) + ' ' + r1(C0 - pdf(uu) * CHH); }
    el('path', { d: dd + 'L' + r1(UX(a1)) + ' ' + C0 + 'Z', 'class': 'slice' }, slices);
  }
  function levelLane(g, vals, y, name, fam) {
    var lg = el('g', { 'class': 'lane', 'data-family': fam, opacity: 0 }, g), d = '';
    vals.forEach(function (v) { d += 'M' + r1(UX(v)) + ' ' + (y - 13) + 'v26'; });
    el('line', { x1: UX(-1), x2: UX(1), y1: y, y2: y, 'class': 'axis-l' }, lg);
    el('path', { d: d, 'class': 'tk-b' }, lg);
    T(lg, UX(-1) - 14, y + 4, name, 'nm end');
    T(lg, UX(1) + 14, y + 4, vals.length + ' 個值', 't-s');
    return lg;
  }
  var lnNF = levelLane(gC, NF, 1842, 'NF4', 'other'), lnFP4 = levelLane(gC, FP4N, 1886, 'FP4 ÷ 6', 'float'), lnI4 = levelLane(gC, I4N, 1930, 'INT4 ÷ 7', 'int');
  var nfGuides = el('path', { d: NF.map(function (v) { return 'M' + r1(UX(v)) + ' ' + r1(C0 - pdf(v) * CHH) + 'V1829'; }).join(''), 'class': 'lead', opacity: 0 }, gC);
  [-1, -0.5, 0, 0.5, 1].forEach(function (v) { T(gC, UX(v), 1964, String(v).replace('-', '−'), 't-d mid'); });
  var X1g = M.makeData('gauss', 1, 1), G64 = {};
  ['nf4', 'fp4', 'int4'].forEach(function (id) { G64[id] = M.quantize(F[id], X1g, { scaling: 'group', group: 64 }); });

  /* ================= 場景 E：posit 的 regime ================= */
  var wE = el('g', {}, svg), gE = el('g', { 'class': 'ft-scene' }, wE);
  function LXP(l) { return 600 + l * 21; }
  var Y_PB = 2392, Y_PAX = 2520, Y_PE = 2612, Y_PP = 2702;
  T(gE, 96, 2336, 'Posit8（es = 2）', 't-b');
  var pCells = [], PW = 40, PP = 46, PX0 = 600 - (8 * PP - 6) / 2;
  for (i = 0; i < 8; i++) {
    var pg = el('g', { 'class': 'cell' }, gE);
    move(pg, PX0 + i * PP, Y_PB);
    el('rect', { x: 0, y: -20, width: PW, height: 40, rx: 3 }, pg);
    pCells.push({ g: pg, tx: T(pg, PW / 2, 6, '0', 'mid') });
  }
  var pBrk = [], pBrkTx = [];
  for (i = 0; i < 4; i++) { pBrk.push(el('path', { 'class': 'brk' }, gE)); pBrkTx.push(T(gE, 0, Y_PB - 34, '', 't-s mid')); }
  var pVal = T(gE, 600, Y_PB + 50, '', 't-b mid');
  el('line', { x1: LXP(-24), x2: LXP(24), y1: Y_PAX, y2: Y_PAX, 'class': 'axis' }, gE);
  for (k = -24; k <= 24; k += 4) {
    el('line', { x1: LXP(k), x2: LXP(k), y1: Y_PAX - 5, y2: Y_PAX + 5, 'class': 'axis' }, gE);
    T(gE, LXP(k), Y_PAX + 22, '2' + sup(k), 't-d mid');
  }
  var POS = Array.from(F.posit8.A.pos);
  var lnPE = Lane(gE, F.fp8e4m3, Y_PE, Array.from(E4), 'E4M3', '', P2(-6));
  var lnPP = Lane(gE, F.posit8, Y_PP, POS, 'Posit8', '');
  [lnPE, lnPP].forEach(function (L) { set(L.stairs, 'd', stairsPath(L, LXP, L.y - 6, 12)); laneDraw(L, function (v) { return LXP(log2(v)); }, 0); });
  text(lnPE.note, '17.8 binade'); text(lnPP.note, '48 binade');
  set(lnPP.note, 'x', LXP(24)); set(lnPE.note, 'x', LXP(log2(448)));
  var pLine = el('line', { y1: Y_PAX - 14, y2: Y_PP + 14, 'class': 'pi-l', opacity: 0 }, gE);

  /* ================= 場景 D：總覽 ================= */
  var wD = el('g', {}, svg), gD = el('g', { 'class': 'ft-scene' }, wD);
  var WRAP = ['fp16', 'bf16', 'int8', 'mxint8', 'fp8e4m3', 'mxfp8e4m3', 'fp8e5m2', 'posit8', 'nvfp4', 'nf4', 'mxfp4', 'fp4', 'int4'];
  var Xg = M.makeData('gauss', 1, 1), Xo = M.makeData('outlier', 1, 20), D0 = 3070, DR = 26, DX = 330, DU = 10;
  T(gD, 96, 3008, '同一組 8192 個數，每個格式量化一次（SQNR，越高越準）', 't-b');
  var lgG = el('g', {}, gD);
  el('rect', { x: DX, y: 3026, width: 14, height: 8, 'class': 'bar-g' }, lgG); T(lgG, DX + 20, 3034, '常態分佈', 't-s');
  el('rect', { x: DX + 110, y: 3026, width: 14, height: 8, 'class': 'bar-o' }, lgG); T(lgG, DX + 130, 3034, '兩個 outlier channel × 20', 't-s');
  for (k = 0; k <= 80; k += 20) {
    el('line', { x1: DX + k * DU, x2: DX + k * DU, y1: D0 - 14, y2: D0 + WRAP.length * DR - 4, 'class': 'gl' }, gD);
    T(gD, DX + k * DU, D0 + WRAP.length * DR + 12, k + ' dB', 't-d mid');
  }
  var wrapRows = WRAP.map(function (id, idx) {
    var f = F[id], y = D0 + idx * DR, g = el('g', { 'class': 'lane', 'data-family': f.family }, gD);
    var rg = M.quantize(f, Xg, { scaling: 'tensor', group: 0 }), ro = M.quantize(f, Xo, { scaling: 'tensor', group: 0 });
    T(g, DX - 70, y + 4, f.name + (f.block ? ' ▦' : ''), 'nm end');
    T(g, DX - 12, y + 4, String(+rg.bitsPer.toFixed(2)) + ' b', 't-d end');
    var bg = el('rect', { x: DX, y: y - 9, height: 9, width: 0, 'class': 'bar-g' }, g), bo = el('rect', { x: DX, y: y + 1, height: 7, width: 0, 'class': 'bar-o' }, g);
    var tx = T(g, DX, y + 4, '', 't-s');
    return { f: f, g: g, bg: bg, bo: bo, tx: tx, sg: rg.sqnr, so: ro.sqnr };
  });

  /* ================= 段落與鏡頭 ================= */
  var BEATS = [['intro', 0.7], ['fields', 1.6], ['shrink', 2.0], ['tradeoff', 1.8], ['int', 1.8], ['scale', 1.6], ['block', 2.2], ['nf4', 1.2], ['posit', 1.2], ['wrap', 1.0]];
  var HOLD = 0.35, STOPS = ['fields', 'shrink', 'tradeoff', 'int', 'scale', 'block', 'nf4', 'posit', 'wrap'];
  var total = BEATS.reduce(function (s, b) { return s + b[1]; }, HOLD), spans = {}, acc = 0;
  BEATS.forEach(function (b) { spans[b[0]] = { start: acc / total, len: b[1] / total }; acc += b[1]; });
  function localT(k, p) { return clamp01((p - spans[k].start) / spans[k].len); }
  function beatAt(p) { var cur = BEATS[0][0]; BEATS.forEach(function (b) { if (p >= spans[b[0]].start) cur = b[0]; }); return cur; }
  // [beat, t, 中心 x, 中心 y, 寬]：同一個位置放兩格 = 鏡頭停住
  var SHOTS = [
    ['intro', 0, 600, 50, 1150], ['intro', 0.6, 600, 50, 1150],
    ['fields', 0.12, 600, 60, 1100], ['fields', 0.45, 600, 110, 1150], ['fields', 0.95, 600, 175, 1150],
    ['shrink', 0.95, 600, 175, 1150],
    ['tradeoff', 0.3, 600, 250, 1300], ['tradeoff', 0.95, 600, 250, 1300],
    ['int', 0.2, 600, 470, 1200], ['int', 0.95, 600, 470, 1200],
    ['scale', 0.12, 600, 1048, 1240], ['scale', 0.95, 600, 1048, 1240], ['block', 0.95, 600, 1048, 1240],
    ['nf4', 0.18, 600, 1775, 1080], ['nf4', 0.95, 600, 1775, 1080],
    ['posit', 0.18, 600, 2520, 1260], ['posit', 0.95, 600, 2520, 1260],
    ['wrap', 0.2, 600, 3200, 1150], ['wrap', 1, 600, 3200, 1150]
  ];
  var shots = SHOTS.map(function (s) { return { p: spans[s[0]].start + spans[s[0]].len * s[1], x: s[2], y: s[3], w: s[4] }; });
  function camera(p) {
    var j = 0;
    while (j < shots.length - 1 && shots[j + 1].p <= p) j++;
    var a = shots[j], b = shots[Math.min(j + 1, shots.length - 1)];
    var kk = b.p > a.p ? ease(clamp01((p - a.p) / (b.p - a.p))) : 0;
    return { x: lerp(a.x, b.x, kk), y: lerp(a.y, b.y, kk), w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), kk)) };
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
    var w = view.narrow ? c.w * 0.8 : c.w;
    var s = Math.min(view.fw / w, view.fh / (w * 0.62));
    var vx = c.x - (view.fx + view.fw / 2) / s, vy = c.y - (view.fy + view.fh / 2) / s;
    set(svg, 'viewBox', [r1(vx), r1(vy), r1(view.W / s), r1(view.H / s)].join(' '));
  }

  /* ================= 每個場景的 renderer：只吃各段的 t ================= */
  var live = {};
  function renderA(t) {
    var appear = 1;   // 開場畫面一進來就是完整的：π、32 個 bit、公式都在，不等捲動
    // 現在是哪兩個格式之間：π 從 FP32 一路壓到 FP4，再回到 E4M3 換成 E5M2
    var La, Lb, kk;
    if (t.tradeoff > 0) {
      var kt1 = seg(t.tradeoff, 0.45, 0.6);
      if (kt1 > 0) { La = LAY.e4m3; Lb = LAY.e5m2; kk = kt1; } else { La = LAY.fp4; Lb = LAY.e4m3; kk = seg(t.tradeoff, 0, 0.12); }
    } else {
      var k3 = seg(t.shrink, 0.72, 0.86), k2 = seg(t.shrink, 0.4, 0.54);
      if (k3 > 0) { La = LAY.e4m3; Lb = LAY.fp4; kk = k3; } else if (k2 > 0) { La = LAY.bf16; Lb = LAY.e4m3; kk = k2; } else { La = LAY.fp32; Lb = LAY.bf16; kk = seg(t.shrink, 0.08, 0.22); }
    }
    var ke = ease(kk), cur = kk < 0.5 ? La : Lb;
    var rowO = 1 - ease(seg(t.int, 0, 0.15));
    var fl = t.fields, hl = fl > 0.02 && fl < 0.98 && t.shrink === 0 ? (fl < 0.2 ? 's' : fl < 0.55 ? 'e' : 'm') : null;
    cells.forEach(function (c, s) {
      var xa = La.x[s] != null ? La.x[s] : Lb.x[s], xb = Lb.x[s] != null ? Lb.x[s] : La.x[s];
      if (xa == null) { show(c.g, 0); return; }
      var stag = ease(seg(appear, 0.05 + s * 0.012, 0.25 + s * 0.012));
      move(c.g, lerp(xa, xb, ke), 0);
      show(c.g, lerp(La.vis[s], Lb.vis[s], kk) * stag * rowO);
      var bit = cur.bit[s];
      text(c.tx, String(bit));
      set(c.g, 'class', 'cell t-' + c.type + (bit ? ' on' : '') + (hl && hl !== c.type ? ' dim' : '') + (hl === c.type ? ' hot' : ''));
    });
    ['s', 'e', 'm'].forEach(function (f) {
      var x0 = lerp(La.span[f][0], Lb.span[f][0], ke), x1 = lerp(La.span[f][1], Lb.span[f][1], ke);
      set(brk[f], 'd', 'M' + r1(x0) + ' -22V-26H' + r1(x1) + 'V-22');
      set(brkTx[f], 'x', r1(x0)); text(brkTx[f], cur.lab[f]);
      var o = ease(seg(appear, 0.5, 0.8)) * rowO * (hl && hl !== f ? 0.35 : 1);
      show(brk[f], o); show(brkTx[f], o);
    });
    text(formula, cur.formula);
    show(formula, ease(seg(appear, 0.6, 0.9)) * rowO);
    // fields：指數 → binade，mantissa → 放大條
    var ex = cur.span.e, mx = cur.span.m;
    set(cExp, 'd', 'M' + r1((ex[0] + ex[1]) / 2) + ' 20C' + r1((ex[0] + ex[1]) / 2) + ' 90 ' + r1(LX(1.5)) + ' 80 ' + r1(LX(1.5)) + ' ' + (Y_AX - 30));
    set(cMan, 'd', 'M' + r1((mx[0] + mx[1]) / 2) + ' 20C' + r1((mx[0] + mx[1]) / 2) + ' 160 ' + r1(SX(3)) + ' 200 ' + r1(SX(3)) + ' ' + (Y_STRIP - 40));
    var off = 1 - ease(seg(t.shrink, 0, 0.08));
    draw(cExp, ease(seg(fl, 0.22, 0.4)) * off);
    draw(cMan, ease(seg(fl, 0.58, 0.76)) * off);
    var bandO = ease(seg(fl, 0.22, 0.4)) * (1 - ease(seg(t.tradeoff, 0, 0.15)));
    show(band, bandO); show(bandTx, bandO);
    show(piMark, ease(seg(appear, 0.3, 0.6))); show(piTx, ease(seg(appear, 0.3, 0.6)));
    show(gAxis, 1 - 0.8 * ease(seg(t.int, 0, 0.15)));
    // 放大條
    var stripO = ease(seg(fl, 0.55, 0.75)) * (1 - ease(seg(t.tradeoff, 0.12, 0.26)));
    show(gStrip, stripO);
    Object.keys(stripTicks).forEach(function (key) { show(stripTicks[key], LAY[key] === La ? 1 - kk : LAY[key] === Lb ? kk : 0); });
    var qx = lerp(SX(La.q), SX(Lb.q), ke);
    set(qDot, 'cx', r1(qx)); set(qTx, 'x', r1(qx));
    text(qTx, cur.f.name + ' → ' + num(cur.q, 8) + '（' + pct((cur.q - PI) / PI) + '）');
    // 值域線
    var lo = lerp(La.lo, Lb.lo, ke), hi = lerp(La.hi, Lb.hi, ke), xl = LX(Math.max(lo, AX_LO)), xh = LX(Math.min(hi, AX_HI));
    set(rngLine, 'x1', r1(xl)); set(rngLine, 'x2', r1(xh));
    // 超出主數線的那一端：標籤放到線下面、往內對齊
    var cl = lo < AX_LO, cr = hi > AX_HI;
    set(rngL, 'x', r1(cl ? xl : xl - 8)); set(rngL, 'y', cl ? 118 : 104); set(rngL, 'text-anchor', cl ? 'start' : 'end');
    set(rngR, 'x', r1(cr ? xh : xh + 8)); set(rngR, 'y', cr ? 118 : 104); set(rngR, 'text-anchor', cr ? 'end' : 'start');
    text(rngL, (cl ? '◀ ' : '') + '2' + sup(Math.round(cur.lo)));
    text(rngR, num(cur.f.A.max, 3) + (cr ? ' ▶' : ''));
    set(rngLab, 'x', r1(xl - 8));
    show(rngG, ease(seg(t.shrink, 0, 0.1)) * (1 - ease(seg(t.tradeoff, 0, 0.15))));
    // lane：E4M3 vs E5M2，然後 E5M2 換成 INT8、座標從 log 變成線性再變回來
    var km = ease(seg(t.int, 0.25, 0.45)) * (1 - ease(seg(t.int, 0.72, 0.92)));
    function xOf(v) { return v > 0 ? lerp(LX(log2(v)), LIN(v), km) : LIN(0); }
    var oE4 = ease(seg(t.tradeoff, 0.15, 0.35)), oE5 = ease(seg(t.tradeoff, 0.3, 0.5)) * (1 - ease(seg(t.int, 0, 0.15))), oI8 = ease(seg(t.int, 0.08, 0.22));
    show(lnE4.g, oE4); show(lnE5.g, oE5); show(lnI8.g, oI8); show(gLax, oE4);
    if (oE4 > 0) laneDraw(lnE4, xOf, km);
    if (oE5 > 0) laneDraw(lnE5, xOf, km);
    if (oI8 > 0) laneDraw(lnI8, xOf, km);
    laxLog.forEach(function (o) { set(o.t, 'x', r1(xOf(o.v))); show(o.t, 1 - km); });
    laxLin.forEach(function (o) { set(o.t, 'x', r1(xOf(o.v))); show(o.t, km); });
    show(linZone, ease(seg(t.int, 0.44, 0.5)) * (1 - ease(seg(t.int, 0.66, 0.72))));
    live.shrink = [['格式', cur.f.name], ['mantissa', cur.m + ' bits'], ['[2, 4) 裡的格數', P2(cur.m).toLocaleString('en-US')],
      ['π 存成', num(cur.q, 8), 'hl'], ['誤差', pct((cur.q - PI) / PI)], ['值域', fix(cur.f.A.range, 1) + ' binade']];
    live.int = km > 0.5
      ? [['座標', '線性 0 – 448'], ['INT8 格距', '3.53（448 ÷ 127）'], ['0 – 28 的格數', 'E4M3 ' + e4Below + ' · INT8 ' + i8Below, 'hl'], ['E4M3 小於 1 的格數', E4.filter(function (v) { return v < 1; }).length + ' / 126']]
      : [['座標', 'log₂'], ['精度（最大值附近）', 'E4M3 3 bits · INT8 6 bits', 'hl'], ['值域', 'E4M3 17.8 · INT8 7.0 binade'], ['INT8 最小正值', '3.53（再小就是 0）']];
  }

  function renderB(t) {
    var m = t.block > 0 ? 20 : Math.exp(lerp(0, Math.log(20), ease(seg(t.scale, 0.15, 0.55))));
    var st = int4At(m), zoom = t.block > 0 ? 1 : ease(seg(t.scale, 0.62, 0.9));
    var view = Math.exp(lerp(Math.log(st.amax * 1.05), Math.log(4.2), zoom));
    var appear = ease(seg(t.scale, 0, 0.12));
    show(gB, appear);
    var kMX = ease(seg(t.block, 0.1, 0.35)), kNV = ease(seg(t.block, 0.55, 0.8));
    var grids = { int4: 1 - ease(seg(t.block, 0, 0.1)), mx: kMX * (1 - kNV), nv: kNV };
    var q4 = qInt4(m), qmx = RES.mx.out, qnv = RES.nv.out;
    var qOf = t.block > 0 ? function (c, v) {
      var a = q4(c, v), b = qmx[c], d = qnv[c];
      return kNV > 0 ? lerp(b, d, kNV) : lerp(a, b, kMX);
    } : q4;
    sceneBDraw(m, view, qOf, 1 - kMX, grids);
    bndMX.forEach(function (l, j) { draw(l, ease(seg(t.block, 0.02 + j * 0.01, 0.12 + j * 0.01))); });
    bndNV.forEach(function (l, j) { draw(l, ease(seg(t.block, 0.5 + j * 0.006, 0.6 + j * 0.006))); });
    mxLab.forEach(function (l) { show(l, kMX * (1 - kNV)); });
    text(bTitle, t.block > 0 ? (kNV > 0.5 ? 'NVFP4 · 每 16 個一個 E4M3 scale' : 'MXFP4 · 每 32 個一個 E8M0 scale') : 'INT4 · 整個 tensor 一個 scale');
    live.scale = [['outlier 倍數', fix(m, 1) + '×'], ['整個 tensor 的 absmax', num(st.amax, 3)], ['INT4 格距', num(st.s, 3)],
      ['變成 0', fix(st.zero * 100, 1) + '%', st.zero > 0.5 ? 'ng' : ''], ['SQNR', db(st.sqnr), 'hl']];
    var rows = [['INT4 per-tensor', db(RES.int4.sqnr) + ' · 4 b', kMX < 0.5 ? 'hl' : ''],
      ['MXFP4', db(RES.mx.sqnr) + ' · 4.25 b', kMX >= 0.5 && kNV < 0.5 ? 'hl' : ''],
      ['NVFP4', db(RES.nv.sqnr) + ' · 4.5 b', kNV >= 0.5 ? 'hl' : ''],
      ['變成 0（INT4 · MX · NV）', [RES.int4, RES.mx, RES.nv].map(function (r) { return fix(r.zero * 100, 0) + '%'; }).join(' · ')]];
    live.block = rows;
  }

  function renderC(t) {
    draw(curve, ease(seg(t.nf4, 0, 0.15)));
    show(slices, ease(seg(t.nf4, 0.15, 0.35)) * 0.9);
    show(nfGuides, ease(seg(t.nf4, 0.2, 0.38)));
    show(lnNF, ease(seg(t.nf4, 0.15, 0.3)));
    show(lnFP4, ease(seg(t.nf4, 0.42, 0.56)));
    show(lnI4, ease(seg(t.nf4, 0.6, 0.74)));
  }

  function renderE(t) {
    var appear = ease(seg(t.posit, 0, 0.15)), l = lerp(-22, 22, seg(t.posit, 0.15, 0.9)), v = P2(l);
    show(gE, appear); show(lnPE.g, appear); show(lnPP.g, appear);
    var code = encode(F.posit8, v), d = M.decode(F.posit8.enc, code), pos = 7;
    var spansP = [];
    d.fields.forEach(function (fd) { spansP.push({ t: fd.t, a: 7 - pos, n: fd.n }); pos -= fd.n; });
    pCells.forEach(function (c, j) {
      var bit = bitAt(code, 7 - j), fd = spansP.filter(function (s) { return j >= s.a && j < s.a + s.n; })[0];
      text(c.tx, String(bit));
      set(c.g, 'class', 'cell t-' + (fd ? fd.t : 'f') + (bit ? ' on' : ''));
    });
    var NAMES = { s: 'S', r: 'regime', x: 'exp', f: 'fraction' };
    pBrk.forEach(function (b, j) {
      var s = spansP[j];
      if (!s) { show(b, 0); show(pBrkTx[j], 0); return; }
      var x0 = PX0 + s.a * PP, x1 = x0 + s.n * PP - 6;
      set(b, 'd', 'M' + r1(x0) + ' ' + (Y_PB - 24) + 'V' + (Y_PB - 28) + 'H' + r1(x1) + 'V' + (Y_PB - 24));
      set(b, 'data-t', s.t);
      show(b, 1); show(pBrkTx[j], 1);
      set(pBrkTx[j], 'x', r1((x0 + x1) / 2)); text(pBrkTx[j], s.n > 1 || s.t === 's' ? NAMES[s.t] : NAMES[s.t][0]);
    });
    var fBits = d.fLen || 0, rBits = d.fields[1] ? d.fields[1].n : 0;
    text(pVal, '2' + sup(Math.round(l)) + ' 附近 → ' + num(d.v, 4) + ' · regime ' + rBits + ' bits · fraction ' + fBits + ' bits');
    var x = LXP(l);
    set(pLine, 'x1', r1(x)); set(pLine, 'x2', r1(x)); show(pLine, seg(t.posit, 0.12, 0.16));
    var e4 = F.fp8e4m3.A, inE4 = v >= e4.minPos && v <= e4.max, c4 = M.binCount(F.fp8e4m3.enc, e4, M.floorLog2(v));
    live.posit = [['數值', '2' + sup(Math.round(l))], ['regime', rBits + ' bits'], ['指數', (d.eLen || 0) + ' bits'], ['fraction', fBits + ' bits', 'hl'],
      ['E4M3 在這裡', inE4 ? log2(c4) + ' bits' : '超出值域', inE4 ? '' : 'ng']];
  }

  function renderD(t) {
    wrapRows.forEach(function (r, j) {
      var k2 = ease(seg(t.wrap, 0.05 + j * 0.035, 0.3 + j * 0.035));
      set(r.bg, 'width', r1(Math.max(0, r.sg) * DU * k2)); set(r.bo, 'width', r1(Math.max(0, r.so) * DU * k2));
      set(r.tx, 'x', r1(DX + Math.max(r.sg, r.so) * DU * k2 + 8));
      text(r.tx, fix(r.sg, 1) + ' / ' + fix(r.so, 1));
      show(r.tx, k2 > 0.95 ? 1 : 0);
    });
  }

  /* ================= 說明欄 ================= */
  var caps = {};
  [].forEach.call(root.querySelectorAll('[data-cap]'), function (c) { caps[c.getAttribute('data-cap')] = c; });
  var statusEl = root.querySelector('[data-status]'), factsEl = root.querySelector('[data-facts]');
  var stopBtns = [].slice.call(root.querySelectorAll('[data-stop]'));
  var L32 = LAY.fp32;
  function wrapRow(id) { var r = wrapRows.filter(function (x) { return x.f.id === id; })[0]; return fix(r.sg, 1) + ' → ' + fix(r.so, 1) + ' dB'; }
  var FACTS = {
    intro: [['數字', 'π = 3.14159265…'], ['FP32 存成', num(L32.q, 8), 'hl'], ['bits', '32'], ['編碼', '0x' + L32.code.toString(16).toUpperCase()]],
    fields: [['符號', L32.d.s + ' → 正數'], ['指數', L32.d.E + ' − 127 = 1 → [2, 4)'], ['mantissa', L32.d.M.toLocaleString('en-US') + ' / 2²³'], ['值', '2 × ' + (1 + L32.d.M / P2(23)).toFixed(7) + ' = ' + num(L32.q, 8), 'hl']],
    tradeoff: [['', 'E4M3 · E5M2'], ['值域', '17.8 · 31.8 binade', 'hl'], ['每個 binade', '8 · 4 個值'], ['最大值', '448 · 57344'], ['最小正值', '2⁻⁹ · 2⁻¹⁶'], ['π 存成', num(LAY.e4m3.q, 4) + ' · ' + num(LAY.e5m2.q, 4)]],
    nf4: [['每 64 個值一個 absmax', 'SQNR（常態）'], ['NF4', db(G64.nf4.sqnr), 'hl'], ['FP4 E2M1', db(G64.fp4.sqnr)], ['INT4', db(G64.int4.sqnr)], ['|x| ≤ 0.25 的格點', 'NF4 ' + NF.filter(function (v) { return Math.abs(v) <= 0.25; }).length + ' · FP4 ' + FP4N.filter(function (v) { return Math.abs(v) <= 0.25 + 1e-9; }).length + ' · INT4 ' + I4N.filter(function (v) { return Math.abs(v) <= 0.25; }).length]],
    wrap: [['常態 → outlier ×20', 'SQNR'], ['FP8 E4M3', wrapRow('fp8e4m3')], ['NVFP4', wrapRow('nvfp4'), 'hl'], ['MXFP4', wrapRow('mxfp4')], ['INT8', wrapRow('int8'), 'ng'], ['INT4', wrapRow('int4'), 'ng']]
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
    stopBtns.forEach(function (b, j) {
      b.classList.toggle('is-on', j === si);
      if (j === si) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.querySelector('i').style.setProperty('--p', j < si ? 1 : j === si ? Math.round(localT(beat, p) * 100) / 100 : 0);
    });
    root.classList.toggle('is-end', p > 0.97);
  }

  /* ================= 每一幀：只看 p，所以倒著捲、跳站都對 ================= */
  function renderVis(t) {
    show(wA, 1 - ease(seg(t.scale, 0, 0.1)));
    show(wB, 1 - ease(seg(t.nf4, 0, 0.1)));
    show(wC, ease(seg(t.nf4, 0, 0.1)) * (1 - ease(seg(t.posit, 0, 0.1))));
    show(wE, ease(seg(t.posit, 0, 0.1)) * (1 - ease(seg(t.wrap, 0, 0.1))));
    show(wD, ease(seg(t.wrap, 0, 0.12)));
  }
  var SCENES = [
    [renderVis, ['scale', 'nf4', 'posit', 'wrap']], [renderA, ['intro', 'fields', 'shrink', 'tradeoff', 'int']],
    [renderB, ['scale', 'block']], [renderC, ['nf4']], [renderE, ['posit']], [renderD, ['wrap']]
  ];
  var lastKey = [], force = true;
  function render(p) {
    var t = {};
    BEATS.forEach(function (b) { t[b[0]] = localT(b[0], p); });
    SCENES.forEach(function (sc, j) {
      var key = sc[1].map(function (k2) { return t[k2]; }).join(',');
      if (!force && lastKey[j] === key) return;
      lastKey[j] = key;
      sc[0](t);
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
  function stickyTop() { return parseFloat(getComputedStyle(stage).top) || headerH(); }
  function trackTop() { return track.getBoundingClientRect().top + window.scrollY - stickyTop(); }
  stopBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      var s = spans[b.getAttribute('data-stop')];
      window.scrollTo({ top: trackTop() + (track.offsetHeight - stage.offsetHeight) * (s.start + s.len * 0.3), behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* ---------- 自動播放：照固定速度把 p 推到 1，用 scrollTo 帶著頁面捲；使用者一碰就停 ---------- */
  var autoplay = (function () {
    var btn = root.querySelector('[data-play]'), label = root.querySelector('[data-play-label]');
    if (!btn || reduceMotion) { if (btn) btn.hidden = true; return { render: function () {} }; }
    var FULL = 50000, raf = 0, p0 = 0, t0 = 0, setY = 0, shown = '';
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

  /* ---------- 啟動 ---------- */
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
