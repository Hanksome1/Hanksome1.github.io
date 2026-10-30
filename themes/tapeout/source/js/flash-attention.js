// toy attention: N = 12, d = 4, split into 3 blocks; exact, FA-1 and FA-2 all run on the same numbers
var FA = (function () {
  'use strict';
  var N = 12, D = 4, B = 4, T = 3, SEED = 943, ROW = 5;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function rand(r, s) { var X = []; for (var i = 0; i < N; i++) { var a = []; for (var j = 0; j < D; j++) a.push(gauss(r) * s); X.push(a); } return X; }
  function data() {
    var r = mulberry32(SEED), Q = rand(r, 1.5), K = rand(r, 1.5), V = rand(r, 1);
    var S = Q.map(function (q) { return K.map(function (k) { return q.reduce(function (s, x, i) { return s + x * k[i]; }, 0) / Math.sqrt(D); }); });
    return { Q: Q, K: K, V: V, S: S };
  }
  function exact(S, V) {
    var P = S.map(function (s) {
      var m = Math.max.apply(null, s), l = s.reduce(function (a, x) { return a + Math.exp(x - m); }, 0);
      return s.map(function (x) { return Math.exp(x - m) / l; });
    });
    var O = P.map(function (p) { var o = new Array(D).fill(0); p.forEach(function (w, t) { for (var x = 0; x < D; x++) o[x] += w * V[t][x]; }); return o; });
    return { P: P, O: O };
  }
  // FA-2：一列走完三段；每段留下更新前後的 m、ℓ、Ô，頁面照著播
  function fa2Row(s, V) {
    var m = -Infinity, l = 0, O = new Array(D).fill(0), steps = [];
    for (var c = 0; c < T; c++) {
      var sub = s.slice(c * B, c * B + B), m0 = m, l0 = l, O0 = O.slice();
      m = Math.max(m0, Math.max.apply(null, sub));
      var scale = m0 === -Infinity ? 0 : Math.exp(m0 - m);
      var Pt = sub.map(function (x) { return Math.exp(x - m); });
      var sum = Pt.reduce(function (a, b) { return a + b; }, 0), pv = new Array(D).fill(0);
      Pt.forEach(function (w, k) { for (var x = 0; x < D; x++) pv[x] += w * V[c * B + k][x]; });
      l = scale * l + sum;
      O = O.map(function (o, x) { return scale * o + pv[x]; });
      steps.push({ m0: m0, m: m, l0: l0, l: l, scale: scale, Pt: Pt, sum: sum, pv: pv, O0: O0, O: O.slice() });
    }
    return { steps: steps, m: m, l: l, O: O.map(function (o) { return o / l; }), L: m + Math.log(l) };
  }
  // FA-1：外圈 K/V、內圈 Q；O 每一步都保持正規化
  function fa1(S, V) {
    var m = S.map(function () { return -Infinity; }), l = S.map(function () { return 0; }), O = S.map(function () { return new Array(D).fill(0); });
    for (var j = 0; j < T; j++) for (var i = 0; i < N; i++) {
      var sub = S[i].slice(j * B, j * B + B), mt = Math.max.apply(null, sub);
      var Pt = sub.map(function (x) { return Math.exp(x - mt); }), lt = Pt.reduce(function (a, b) { return a + b; }, 0);
      var mn = Math.max(m[i], mt), a = Math.exp(m[i] - mn), b = Math.exp(mt - mn), ln = a * l[i] + b * lt, pv = new Array(D).fill(0);
      Pt.forEach(function (w, k) { for (var x = 0; x < D; x++) pv[x] += w * V[j * B + k][x]; });
      for (var x2 = 0; x2 < D; x2++) O[i][x2] = (l[i] * a * O[i][x2] + b * pv[x2]) / ln;
      m[i] = mn; l[i] = ln;
    }
    return { O: O, m: m, l: l };
  }
  return { N: N, D: D, B: B, T: T, ROW: ROW, mulberry32: mulberry32, data: data, exact: exact, fa2Row: fa2Row, fa1: fa1 };
})();
(function () {
  'use strict';
  var html = document.documentElement;
  var root = document.querySelector('[data-fa]');
  if (!root || !window.FA) return;
  document.body.classList.add('is-flash-attention');
  var track = root.querySelector('.fa-track'), stage = root.querySelector('.fa-stage');
  var svg = root.querySelector('[data-world]'), panel = root.querySelector('.fa-panel');
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
  function fmt(n, d) { return n.toFixed(d).replace('-', '−'); }
  function hide(e) { e.setAttribute('opacity', 0); return e; }
  function bytes(b) {
    if (b >= 1073741824) return fmt(b / 1073741824, b >= 10737418240 ? 0 : 1) + ' GiB';
    if (b >= 1048576) return fmt(b / 1048576, b >= 10485760 ? 0 : 1) + ' MiB';
    return fmt(b / 1024, 0) + ' KiB';
  }

  // ---- 資料：同一組 Q、K、V，三種算法各跑一次 ----
  var N = FA.N, D = FA.D, BL = FA.B, TB = FA.T, ROW = FA.ROW;
  var d = FA.data(), ex = FA.exact(d.S, d.V), row = FA.fa2Row(d.S[ROW], d.V), one = FA.fa1(d.S, d.V);
  var sRow = d.S[ROW], pRow = ex.P[ROW], oRow = ex.O[ROW], ST = row.steps;
  var Ls = d.S.map(function (s) { return FA.fa2Row(s, d.V).L; });
  function maxErr(a, b) { var e = 0; a.forEach(function (v, i) { e = Math.max(e, Math.abs(v - b[i])); }); return e; }
  var errP = maxErr(sRow.map(function (s) { return Math.exp(s - row.m) / row.l; }), pRow);
  var errO = maxErr(row.O, oRow), errA = 0, errL = maxErr(sRow.map(function (s) { return Math.exp(s - row.L); }), pRow);
  one.O.forEach(function (o, i) { errA = Math.max(errA, maxErr(o, ex.O[i])); });
  function sci(x) { return x === 0 ? '0' : x.toExponential(0).replace('-', '−'); }
  var sMax = 0, vMax = 0;
  d.S.forEach(function (r) { r.forEach(function (v) { sMax = Math.max(sMax, Math.abs(v)); }); });
  d.V.concat(d.Q, d.K).forEach(function (r) { r.forEach(function (v) { vMax = Math.max(vMax, Math.abs(v)); }); });

  function tp(M) { return M[0].map(function (_, j) { return M.map(function (r) { return r[j]; }); }); }
  function Mat(g, x, y, M, cw, ch, vmax, gamma) {
    var gg = el('g', {}, g), cells = [];
    M.forEach(function (r, i) {
      cells.push(r.map(function (v, j) {
        return el('rect', { x: x + j * cw, y: y + i * ch, width: cw, height: ch, class: 'cell ' + (v >= 0 ? 'f-p' : 'f-n'), 'fill-opacity': Math.round((0.08 + 0.82 * Math.pow(Math.min(1, Math.abs(v) / vmax), gamma || 1)) * 100) / 100 }, gg);
      }));
    });
    el('rect', { x: x, y: y, width: M[0].length * cw, height: M.length * ch, class: 'frame' }, gg);
    return { g: gg, cells: cells };
  }
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

  // ================= 世界：建一次，之後每幀只改屬性 =================
  var W = {}, regions = [];
  // 一段一個 <g>，鏡頭離開時淡掉，才不會跟下一段疊在一起
  function region(cy) { var g = el('g', {}, svg); regions.push({ g: g, cy: cy }); return g; }

  // ---- R0：整條計算流程 ----
  (function () {
    var g = region(90), c = 14, y = 0, h = N * c, Sm = ex.P;
    T(g, 0, -56, 'O = softmax(Q Kᵀ) V', 't-serif');
    T(g, 936, -56, 'S ∈ ℝ^(N×N)、Q K V O ∈ ℝ^(N×d)', 't-d end');
    W.pipe = [];
    function step(fn) { var gg = hide(el('g', {}, g)); fn(gg); W.pipe.push(gg); return gg; }
    step(function (gg) {
      Mat(gg, 0, y, d.Q, c, c, vMax); T(gg, 28, y - 12, 'Q', 't-b mid'); T(gg, 28, y + h + 22, 'N × d', 't-s mid');
      T(gg, 76, y + h / 2 + 8, '×', 't-big mid');
      Mat(gg, 96, y + 56, tp(d.K), c, c, vMax); T(gg, 180, y + 44, 'Kᵀ', 't-b mid'); T(gg, 180, y + 136, 'd × N', 't-s mid');
    });
    step(function (gg) {
      T(gg, 284, y + h / 2 + 8, '=', 't-big mid');
      Mat(gg, 306, y, d.S, c, c, sMax); T(gg, 390, y - 12, 'S', 't-h mid'); T(gg, 390, y + h + 22, 'N × N', 't-s mid');
      T(gg, 390, y + h + 42, '① MatMul', 't-d mid');
    });
    step(function (gg) {
      el('path', { d: 'M482 84 h44 m-6 -5 l6 5 l-6 5', class: 'wire' }, gg);
      T(gg, 504, 72, 'softmax', 't-s mid');
      Mat(gg, 536, y, Sm, c, c, 0.5, 0.6); T(gg, 620, y - 12, 'P', 't-h mid'); T(gg, 620, y + h + 22, 'N × N', 't-s mid');
      T(gg, 620, y + h + 42, '② 每列 softmax', 't-d mid');
    });
    step(function (gg) {
      T(gg, 726, y + h / 2 + 8, '×', 't-big mid');
      Mat(gg, 746, y, d.V, c, c, vMax); T(gg, 774, y - 12, 'V', 't-b mid'); T(gg, 774, y + h + 22, 'N × d', 't-s mid');
      T(gg, 826, y + h / 2 + 8, '=', 't-big mid');
      Mat(gg, 848, y, ex.O, c, c, 1.6); T(gg, 876, y - 12, 'O', 't-b mid'); T(gg, 876, y + h + 22, 'N × d', 't-s mid');
      T(gg, 812, y + h + 42, '③ MatMul', 't-d mid');
    });
  })();

  // ---- R1：SRAM 與 HBM ----
  var SC = 0.072;
  (function () {
    var g = region(560), y = 380;
    Box(g, 0, y, 330, 320, 'die'); T(g, 16, y + 26, 'GPU die', 't-b');
    Box(g, 30, y + 60, 270, 120, 'box'); T(g, 44, y + 86, 'SRAM', 't-d');
    W.tile0 = el('rect', { x: 44, y: y + 100, width: 128 * SC, height: 128 * SC, class: 'f-h' }, g);
    T(g, 60, y + 110, '一塊 128×128 的 tile：32 KiB', 't-s');
    T(g, 44, y + 150, '同一個比例尺 ↑', 't-s');
    Box(g, 30, y + 198, 270, 92, 'box'); T(g, 165, y + 240, 'MatMul · Softmax · Dropout', 't-s mid'); T(g, 165, y + 262, '運算單元', 't-d mid');
    Box(g, 530, y, 480, 320, 'die'); T(g, 546, y + 26, 'HBM', 't-b');
    W.sq = el('rect', { x: 546, y: y + 14, class: 'card-h', opacity: 0 }, g);
    W.sqTx = T(g, 1000, y + 300, '', 't-h end');
    W.sqSub = T(g, 1000, y + 278, '', 't-d end');
    el('path', { d: 'M330 505 H530 m-7 -5 l7 5 l-7 5', class: 'wire' }, g);
    el('path', { d: 'M530 575 H330 m7 -5 l-7 5 l7 5', class: 'wire' }, g);
    T(g, 430, 495, '寫回', 't-s mid'); T(g, 430, 597, '讀出', 't-s mid');
    W.pkt = el('rect', { width: 50, height: 16, rx: 2, class: 'pkt', opacity: 0 }, g);
    var steps = ['① 寫回 S', '② 讀 S 做 softmax', '③ 寫回 P', '④ 讀 P 乘 V'];
    W.trip = steps.map(function (s, i) { return T(g, 0 + i * 258, 740, s, 't-d'); });
  })();

  // ---- R2：切 tile，一塊進 SRAM ----
  var S2 = { x: 48, y: 900, c: 28 };
  (function () {
    var g = region(1060), c = S2.c, X = S2.x, Y = S2.y, L = N * c;
    T(g, 48, 858, 'Kᵀ（K/V 切成 3 塊）', 't-d');
    Mat(g, X, 866, tp(d.K), c, 7, vMax);
    T(g, 0, 896, 'Q', 't-d');
    Mat(g, 8, Y, d.Q, 7, c, vMax);
    Mat(g, X, Y, d.S, c, c, sMax);
    W.cuts = [];
    for (var k = 1; k < TB; k++) {
      W.cuts.push(wire(g, 'M' + (X + k * BL * c) + ' ' + (Y - 40) + ' V' + (Y + L + 6), 'wire-h'));
      W.cuts.push(wire(g, 'M2 ' + (Y + k * BL * c) + ' H' + (X + L + 6), 'wire-h'));
    }
    W.rowBand = hide(el('rect', { x: X - 2, y: Y + ROW * c - 1, width: L + 4, height: c + 2, class: 'frame-h' }, g));
    W.rowTx = hide(T(g, X + L + 12, Y + ROW * c + 18, '第 6 列', 't-h'));
    W.tileRect = hide(el('rect', { class: 'frame-h' }, g));

    var sx = 500, sy = 870;
    Box(g, sx, sy, 520, 366, 'die');
    T(g, sx + 16, sy + 26, 'SRAM · 一次放一塊', 't-b');
    W.sram = hide(el('g', {}, g));
    var i0 = BL, Qi = d.Q.slice(i0, i0 + BL), Kj = d.K.slice(0, BL), Sij = d.S.slice(i0, i0 + BL).map(function (r) { return r.slice(0, BL); });
    var v = sy + 56, cc = 22;
    Mat(W.sram, sx + 24, v, Qi, cc, cc, vMax); T(W.sram, sx + 68, v + 108, 'Q₂', 't-d mid');
    T(W.sram, sx + 132, v + 52, '×', 't-big mid');
    Mat(W.sram, sx + 152, v, tp(Kj), cc, cc, vMax); T(W.sram, sx + 196, v + 108, 'K₁ᵀ', 't-d mid');
    T(W.sram, sx + 262, v + 52, '=', 't-big mid');
    W.sijAt = { x: sx + 284, y: v, s: 88 };
    W.sij = Mat(W.sram, sx + 284, v, Sij, cc, cc, sMax);
    T(W.sram, sx + 328, v + 108, 'S₂₁', 't-h mid');
    T(W.sram, sx + 400, v + 40, 'S、P 不寫回', 't-s');
    T(W.sram, sx + 400, v + 58, 'HBM', 't-s');
    W.fuse = ['MatMul', 'Softmax', 'Dropout', 'MatMul'].map(function (s, i) {
      var gg = el('g', {}, W.sram), x = sx + 24 + i * 120, b = Box(gg, x, sy + 200, 104, 44);
      T(gg, x + 52, sy + 227, s, 't-b mid');
      if (i < 3) el('path', { d: 'M' + (x + 104) + ' ' + (sy + 222) + ' h16', class: 'wire' }, gg);
      return b;
    });
    T(W.sram, sx + 24, sy + 270, '同一個 kernel 做完這四步（kernel fusion）', 't-d');
    W.warn = hide(el('g', {}, g));
    T(W.warn, sx + 24, sy + 310, 'softmax 要整列的總和，一塊 tile 只看到其中 4 個值', 't-h');
    T(W.warn, sx + 24, sy + 334, '→ 需要一種可以分段算的 softmax', 't-b');
  })();

  // ---- R3：online softmax ----
  var R3 = { base: 1730, h: 196, x: function (j) { return j * 62 + Math.floor(j / BL) * 26; } };
  (function () {
    var g = region(1625);
    T(g, 0, 1416, '第 6 列的 12 個分數 s，分三段進來', 't-b');
    W.scores = []; W.bars = []; W.ghosts = [];
    for (var c = 0; c < TB; c++) T(g, R3.x(c * BL), 1444, 'K/V 第 ' + (c + 1) + ' 塊', 't-d');
    el('line', { x1: -6, y1: R3.base - R3.h, x2: R3.x(N - 1) + 56, y2: R3.base - R3.h, class: 'grid' }, g);
    T(g, -10, R3.base - R3.h + 4, '1', 't-s end');
    el('line', { x1: -6, y1: R3.base, x2: R3.x(N - 1) + 56, y2: R3.base, class: 'axis' }, g);
    T(g, -10, R3.base + 4, '0', 't-s end');
    W.barTitle = T(g, 0, R3.base - R3.h - 14, '', 't-d');
    for (var j = 0; j < N; j++) {
      var x = R3.x(j), n = Num(g, x, 1452, 56, 34);
      n.upd(sRow[j], fmt(sRow[j], 2), sMax);
      W.scores.push(n);
      W.bars.push(el('rect', { x: x + 6, width: 44, y: R3.base, height: 0, class: 'bar' }, g));
      W.ghosts.push(hide(el('rect', { x: x + 6, width: 44, y: R3.base - pRow[j] * R3.h, height: pRow[j] * R3.h, class: 'ghost' }, g)));
    }
    var rx = 860;
    function Reg(y, label) {
      var gg = el('g', {}, g), b = Box(gg, rx, y, 156, 76);
      T(gg, rx + 12, y + 22, label, 't-d');
      return { g: gg, b: b, v: T(gg, rx + 12, y + 58, '', 't-big') };
    }
    W.regM = Reg(1452, 'm · 最大值');
    W.regL = Reg(1544, 'ℓ · 總和');
    W.regR = Reg(1636, 'rescale');
    W.eq1 = T(g, 0, 1780, '', 't-b');
    W.eq2 = T(g, 0, 1810, '', 't-d');
    W.eq3 = T(g, 0, 1840, '', 't-h');
  })();

  // ---- R4：Ô 累加 ----
  var R4 = { y: function (c) { return 2040 + c * 98; } };
  (function () {
    var g = region(2200);
    T(g, 0, 2012, '第 6 列的輸出：每一段加進 Ô', 't-b');
    W.ptRow = []; W.pvRow = [];
    for (var c = 0; c < TB; c++) {
      var y = R4.y(c), gg = hide(el('g', {}, g)), st = ST[c], cells = [];
      T(gg, 0, y + 26, 'P̃' + '₁₂₃'[c], 't-b');
      st.Pt.forEach(function (v, k) { var n = Num(gg, 40 + k * 52, y + 4, 48, 34); n.upd(v, fmt(v, 2), 1); cells.push(n); });
      T(gg, 266, y + 28, '×', 't-big mid');
      Mat(gg, 288, y - 9, d.V.slice(c * BL, c * BL + BL), 15, 15, vMax);
      T(gg, 368, y + 28, '=', 't-big mid');
      st.pv.forEach(function (v, x) { Num(gg, 392 + x * 58, y + 4, 54, 34).upd(v, fmt(v, 2), 2); });
      W.ptRow.push(gg);
    }
    T(g, 660, 2012, 'Ô · 留在晶片上', 't-b');
    W.acc = [0, 1, 2, 3].map(function (x) { return Num(g, 660 + x * 88, 2030, 82, 42); });
    W.accNote = T(g, 660, 2100, '', 't-d');
    W.lReg = T(g, 660, 2130, '', 't-d');
    W.scaleTag = T(g, 660, 2160, '', 't-h');
    W.outRow = hide(el('g', {}, g));
    T(W.outRow, 0, 2332, 'Ô / ℓ', 't-b');
    W.fin = [0, 1, 2, 3].map(function (x) { var n = Num(W.outRow, 76 + x * 76, 2308, 70, 38); n.upd(row.O[x], fmt(row.O[x], 4), 2); return n; });
    T(W.outRow, 448, 2332, '直接算', 't-b');
    [0, 1, 2, 3].forEach(function (x) { Num(W.outRow, 516 + x * 76, 2308, 70, 38).upd(oRow[x], fmt(oRow[x], 4), 2); });
    T(W.outRow, 0, 2386, 'S 的第 6 列只在 SRAM 裡出現過，而且一次只有 4 個值', 't-h');
  })();

  // ---- R5：兩種走法 ----
  var GR = { y: 2560, c: 100 };
  function Walk(parent, key, x0, name, order, code) {
    var g = el('g', { class: key === 'a' ? 'lane-a' : 'lane-b' }, parent), c = GR.c, y0 = GR.y, tiles = [], labels = [];
    T(g, x0, y0 - 38, name, 't-l');
    T(g, x0, y0 - 16, order.join(' → ').length ? code.sub : '', 't-d');
    for (var i = 0; i < TB; i++) { tiles.push([]); labels.push([]); for (var j = 0; j < TB; j++) {
      tiles[i].push(el('rect', { x: x0 + j * c, y: y0 + i * c, width: c, height: c, class: 'tile' }, g));
      labels[i].push(T(g, x0 + j * c + c / 2, y0 + i * c + c / 2 + 6, 'S' + '₁₂₃'[i] + '₁₂₃'[j], 't-d mid'));
    } }
    function pc(k) { return [x0 + order[k][1] * c + c / 2, y0 + order[k][0] * c + c / 2]; }
    var d0 = order.map(function (o, k) { var p = pc(k); return (k ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
    var route = wire(g, d0, 'route');
    var cursor = el('rect', { width: c, height: c, class: 'frame-h', fill: 'none', style: 'stroke: var(--lane)' }, g);
    var boxes = [0, 1, 2].map(function (i) {
      var bx = x0 + TB * c + 14, by = y0 + i * c + 14, b = Box(g, bx, by, 66, c - 28);
      T(g, bx + 33, by + 22, 'O' + '₁₂₃'[i], 't-d mid');
      return { b: b, n: T(g, bx + 33, by + 54, '0', 't-big mid') };
    });
    T(g, x0 + TB * c + 47, y0 - 16, 'HBM 寫入', 't-s mid');
    var lines = code.lines.map(function (s, i) { return el('text', { x: x0, y: y0 + TB * c + 34 + i * 19, class: 'code' }, g, s); });
    return { g: g, tiles: tiles, order: order, route: route, cursor: cursor, boxes: boxes, lines: lines, x0: x0 };
  }
  (function () {
    var ordA = [], ordB = [], rg = region(2720);
    for (var a = 0; a < TB; a++) for (var b = 0; b < TB; b++) { ordA.push([b, a]); ordB.push([a, b]); }
    W.A = Walk(rg, 'a', 0, 'FlashAttention', ordA, { sub: '一欄一欄走', lines: [
      'for j in K/V 塊:', '  for i in Q 塊:', '    讀 Q_i, O_i, ℓ_i, m_i',
      '    算 tile → m, ℓ, O ÷ ℓ', '    寫 O_i, ℓ_i, m_i'] });
    W.B = Walk(rg, 'b', 540, 'FlashAttention-2', ordB, { sub: '一列一列走', lines: [
      'for i in Q 塊:', '  O, ℓ, m = 0, 0, −∞', '  for j in K/V 塊:',
      '    算 tile → m, ℓ, O', '  O_i = O ÷ ℓ；寫 O_i, L_i'] });
    W.par = hide(el('g', { class: 'lane-b' }, rg));
    W.parC = [0, 1, 2].map(function (i) {
      T(W.par, 530, GR.y + i * GR.c + GR.c / 2 + 4, 'TB ' + (i + 1), 't-l end');
      return el('rect', { y: GR.y + i * GR.c, width: GR.c, height: GR.c, class: 'tile is-hot', style: 'fill-opacity: 0.6' }, W.par);
    });
  })();

  // ---- R6：反向傳播 ----
  (function () {
    var g = region(3280), y = 3190, c = 16;
    T(g, 0, y - 28, '不存：P · N×N', 't-b');
    W.bP = Mat(g, 0, y, ex.P, c, c, 0.5, 0.6);
    W.bRow = el('rect', { x: -2, y: y + ROW * c - 1, width: N * c + 4, height: c + 2, class: 'frame-h' }, g);
    W.bCross = wire(g, 'M4 ' + (y + 4) + ' L' + (N * c - 4) + ' ' + (y + N * c - 4) + ' M' + (N * c - 4) + ' ' + (y + 4) + ' L4 ' + (y + N * c - 4), 'cross');
    W.bL = hide(el('g', {}, g));
    T(W.bL, 250, y - 28, '存：L · N 個數', 't-h');
    Mat(W.bL, 250, y, Ls.map(function (v) { return [v]; }), c * 2, c, 6);
    el('rect', { x: 248, y: y + ROW * c - 1, width: c * 2 + 4, height: c + 2, class: 'frame-h' }, W.bL);
    W.bForm = hide(el('g', {}, g));
    T(W.bForm, 340, y + 8, 'L₆ = m + log ℓ', 't-b');
    T(W.bForm, 340, y + 34, '= ' + fmt(row.m, 3) + ' + log ' + fmt(row.l, 3) + ' = ' + fmt(row.L, 3), 't-d');
    T(W.bForm, 340, y + 74, 'P₆ₜ = exp(s₆ₜ − L₆)', 't-b');
    W.bVals = [];
    for (var j = 0; j < N; j++) {
      var v = hide(el('g', {}, g)), x = 340 + (j % 6) * 112, yy = y + 100 + Math.floor(j / 6) * 48;
      T(v, x, yy + 12, 's = ' + fmt(sRow[j], 2), 't-s');
      T(v, x, yy + 30, '= ' + fmt(Math.exp(sRow[j] - row.L), 3), j === 8 || j === 7 ? 't-h' : 't-b');
      W.bVals.push(v);
    }
  })();

  // ---- R7：causal mask ----
  var CG = { x: 0, y: 3640, c: 34, T: 8 };
  (function () {
    var g = region(3770), c = CG.c;
    T(g, 0, 3596, 'N = 1024、B = 128 · 8 × 8 塊', 't-b');
    W.cTiles = [];
    for (var i = 0; i < CG.T; i++) for (var j = 0; j < CG.T; j++) {
      var r = el('rect', { x: CG.x + j * c, y: CG.y + i * c, width: c, height: c, class: 'tile' }, g);
      W.cTiles.push({ i: i, j: j, r: r });
    }
    W.cNote = T(g, 0, CG.y + CG.T * c + 30, '', 't-h');
    var X = 340, Y = 3640, cc = 54, i0 = BL, sub = d.S.slice(i0, i0 + BL).map(function (r) { return r.slice(i0, i0 + BL); });
    T(g, X, 3596, '對角線上的 tile：S₂₂', 't-b');
    var ms = sub.map(function (r, a) { return Math.max.apply(null, r.slice(0, a + 1)); }); // 每列各一個 m，被遮住的不算
    W.cMask = []; W.cDrop = [];
    var rd = FA.mulberry32(11);
    for (var a = 0; a < BL; a++) for (var b = 0; b < BL; b++) {
      var masked = b > a, n = Num(g, X + b * cc, Y + a * cc, cc - 4, cc - 4), v = sub[a][b];
      n.upd(v, fmt(v, 1), sMax);
      var mk = hide(el('g', {}, g));
      if (masked) { el('rect', { x: X + b * cc, y: Y + a * cc, width: cc - 4, height: cc - 4, rx: 2, class: 'card' }, mk); T(mk, X + b * cc + 25, Y + a * cc + 32, '−∞', 't-h mid'); }
      W.cMask.push(mk);
      var drop = !masked && rd() < 0.22, ptv = masked ? 0 : Math.exp(v - ms[a]), n2 = Num(g, X + 300 + b * cc, Y + a * cc, cc - 4, cc - 4);
      n2.upd(ptv, masked ? '0' : drop ? '0' : fmt(ptv, 2), 1);
      hide(n2.g);
      W.cDrop.push({ n: n2.g, drop: drop });
    }
    W.cArrow = wire(g, 'M' + (X + 222) + ' 3748 h70 m-7 -5 l7 5 l-7 5', 'wire');
    W.cLbl = hide(T(g, X + 300, 3596, 'P̃ = exp(S − m)，每列各一個 m，再 dropout', 't-b'));
  })();

  // ---- R8：Fig. 2 ----
  var RES = [['GFLOPs', 66.6, 75.2, '+13%'], ['HBM 讀寫（GB）', 40.3, 4.4, '÷ 9'], ['時間（ms）', 41.7, 7.3, '÷ 5.7']];
  (function () {
    var g = region(4220), X = 0;
    T(g, 0, 4052, 'GPT-2 medium · N 1024 · 16 heads · batch 64 · A100 · forward + backward', 't-b');
    [['Standard', 'f-i'], ['FlashAttention', 'f-h']].forEach(function (l, i) {
      el('rect', { x: 700 + i * 110, y: 4042, width: 12, height: 12, class: l[1] }, g);
      T(g, 718 + i * 110, 4053, l[0], 't-s');
    });
    W.res = RES.map(function (r, i) {
      var y = 4100 + i * 110, gg = el('g', {}, g), mx = Math.max(r[1], r[2]);
      T(gg, X, y, r[0], 't-b');
      var a = el('rect', { x: X, y: y + 12, width: 0, height: 26, class: 'f-i' }, gg), b = el('rect', { x: X, y: y + 44, width: 0, height: 26, class: 'f-h' }, gg);
      var ta = T(gg, X, y + 31, fmt(r[1], 1), 't-b'), tb = T(gg, X, y + 63, fmt(r[2], 1), 't-h');
      var tag = T(gg, 1000, y + 50, r[3], 't-big end');
      return { a: a, b: b, ta: ta, tb: tb, tag: tag, va: r[1] / mx * 780, vb: r[2] / mx * 780 };
    });
  })();

  // ================= 段落與鏡頭 =================
  var BEATS = [['intro', 0.9], ['standard', 1.7], ['tiles', 1.7], ['softmax', 2.6], ['output', 1.7], ['fa1', 1.5], ['fa2', 1.9], ['backward', 1.3], ['causal', 1.2], ['results', 1.2]];
  var HOLD = 0.35, STOPS = BEATS.slice(1).map(function (b) { return b[0]; });
  var total = BEATS.reduce(function (s, b) { return s + b[1]; }, HOLD), spans = {}, acc = 0;
  BEATS.forEach(function (b) { spans[b[0]] = { start: acc / total, len: b[1] / total }; acc += b[1]; });
  function localT(k, p) { return clamp01((p - spans[k].start) / spans[k].len); }
  function beatAt(p) { var cur = BEATS[0][0]; BEATS.forEach(function (b) { if (p >= spans[b[0]].start) cur = b[0]; }); return cur; }

  // 每格 [beat, t, 中心 x, 中心 y, 寬]：同一個位置放兩格 = 鏡頭停住
  var SHOTS = [
    ['intro', 0, 470, 90, 1120], ['intro', 0.85, 470, 90, 1120],
    ['standard', 0.15, 505, 560, 1120], ['standard', 1, 505, 560, 1120],
    ['tiles', 0.15, 510, 1060, 1120], ['tiles', 1, 510, 1060, 1120],
    ['softmax', 0.1, 505, 1625, 1120], ['softmax', 1, 505, 1625, 1120],
    ['output', 0.12, 510, 2200, 1120], ['output', 1, 510, 2200, 1120],
    ['fa1', 0.12, 480, 2720, 1120], ['fa1', 1, 480, 2720, 1120],
    ['fa2', 0.1, 480, 2720, 1120], ['fa2', 1, 480, 2720, 1120],
    ['backward', 0.15, 505, 3280, 1120], ['backward', 1, 505, 3280, 1120],
    ['causal', 0.15, 510, 3770, 1120], ['causal', 1, 510, 3770, 1120],
    ['results', 0.15, 510, 4220, 1120], ['results', 1, 510, 4220, 1120]
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
    regions.forEach(function (r) { show(r.g, 1 - seg(Math.abs(c.y - r.cy), 140, 380)); });
  }

  // Online softmax 的時間表：每段 [進場, 開始縮放, 長出來]；第 1 段沒有舊值要縮
  var PH = [[0.05, 0.1, 0.1, 0.28], [0.32, 0.38, 0.47, 0.56], [0.6, 0.65, 0.65, 0.74]];
  function softmaxState(t) {
    var mNow = -Infinity, ell = 0, grow = [0, 0, 0], arrive = [0, 0, 0], active = -1;
    for (var c = 0; c < TB; c++) {
      var ph = PH[c], st = ST[c], kA = seg(t, ph[0], ph[1]), kS = c ? ease(seg(t, ph[1], ph[2])) : 1, kG = ease(seg(t, ph[2], ph[3]));
      arrive[c] = kA;
      if (kA <= 0) break;
      active = c;
      if (st.m0 === -Infinity) { mNow = st.m; }
      else mNow = lerp(st.m0, st.m, kS);
      ell = (st.m0 === -Infinity ? 0 : st.l0 * Math.exp(st.m0 - mNow)) + st.sum * kG;
      grow[c] = kG;
    }
    return { m: mNow, l: ell, grow: grow, arrive: arrive, active: active };
  }
  function outputState(t) { // 第 k 段：先縮 Ô，再加 pv
    var O = [0, 0, 0, 0], ell = 0, active = -1;
    for (var c = 0; c < TB; c++) {
      var a = 0.08 + c * 0.24, kA = seg(t, a, a + 0.06), kS = c ? ease(seg(t, a + 0.06, a + 0.13)) : 1, kP = ease(seg(t, a + 0.13, a + 0.2)), st = ST[c];
      if (kA <= 0) break;
      active = c;
      var sc = c ? lerp(1, st.scale, kS) : 0;
      O = st.O0.map(function (o, x) { return o * sc + st.pv[x] * kP; });
      ell = st.l0 * sc + st.sum * kP;
    }
    return { O: O, l: ell, active: active };
  }

  function walkRender(w, t, a, b) {
    var u = seg(t, a, b) * 9, done = Math.min(9, Math.floor(u)), fr = ease(clamp01((u - done) / 0.35)), N9 = w.order.length;
    w.order.forEach(function (o, k) { set(w.tiles[o[0]][o[1]], 'class', 'tile' + (k < done ? ' is-past' : k === done && t >= a ? ' is-hot' : '')); });
    draw(w.route, Math.min(1, u / 8));
    var cur = w.order[Math.min(N9 - 1, done)], prev = w.order[Math.max(0, Math.min(N9 - 1, done) - 1)], c = GR.c;
    set(w.cursor, 'x', r1(w.x0 + lerp(prev[1], cur[1], fr) * c)); set(w.cursor, 'y', r1(GR.y + lerp(prev[0], cur[0], fr) * c));
    show(w.cursor, u > 0 && u < 9 ? 1 : 0);
    return { done: Math.min(9, u >= 9 ? 9 : done), cur: cur };
  }

  // ================= 每一段的 renderer：只吃自己的 t =================
  var R = {
    intro: function (t) {
      W.pipe.forEach(function (g, i) { show(g, ease(seg(t, 0.02 + i * 0.2, 0.2 + i * 0.2))); });
    },
    standard: function (t) {
      var n = t < 0.22 ? Math.exp(lerp(Math.log(128), Math.log(1024), ease(seg(t, 0.02, 0.2)))) : Math.exp(lerp(Math.log(1024), Math.log(4096), ease(seg(t, 0.68, 0.9))));
      var Ni = Math.round(n), b = Ni * Ni * 2, side = r1(Ni * SC);
      set(W.sq, 'width', side); set(W.sq, 'height', side); show(W.sq, seg(t, 0, 0.05));
      text(W.sqTx, bytes(b) + ' / head'); text(W.sqSub, 'S · N = ' + Ni);
      var done = 0;
      [[0.24, 0.32, 1], [0.34, 0.42, 0], [0.44, 0.52, 1], [0.54, 0.62, 0]].forEach(function (w, i) {
        var k = seg(t, w[0], w[1]);
        if (k >= 1) done = i + 1;
        if (k > 0 && k < 1) {
          var x = w[2] ? lerp(330, 480, k) : lerp(480, 330, k);
          set(W.pkt, 'x', r1(x)); set(W.pkt, 'y', w[2] ? 497 : 567); show(W.pkt, 1);
        }
        set(W.trip[i], 'class', k > 0 ? 't-h' : 't-d');
      });
      if (t < 0.24 || t > 0.62 || (done === 1 && t < 0.34) || (done === 2 && t < 0.44) || (done === 3 && t < 0.54)) show(W.pkt, 0);
      live.standard = [['N', String(Ni)], ['S / head', bytes(b), 'hl'], ['S · batch 64 × 16 heads', bytes(b * 1024), 'hl'],
        ['Q + K + V（同設定）', bytes(3 * Ni * 64 * 2 * 1024)], ['S 在 HBM 上搬', done + ' / 4 趟']];
    },
    tiles: function (t) {
      W.cuts.forEach(function (c, i) { draw(c, ease(seg(t, 0.03 + i * 0.03, 0.14 + i * 0.03))); });
      var k = ease(seg(t, 0.2, 0.36)), a = W.sijAt, c = S2.c, x0 = S2.x, y0 = S2.y + BL * c, s0 = BL * c;
      set(W.tileRect, 'x', r1(lerp(x0, a.x, k))); set(W.tileRect, 'y', r1(lerp(y0, a.y, k)));
      set(W.tileRect, 'width', r1(lerp(s0, a.s, k))); set(W.tileRect, 'height', r1(lerp(s0, a.s, k)));
      show(W.tileRect, seg(t, 0.15, 0.2) * (1 - seg(t, 0.72, 0.78)));
      show(W.sram, seg(t, 0.3, 0.4));
      W.fuse.forEach(function (b, i) { var on = t >= 0.42 + i * 0.07; set(b, 'class', on ? 'box is-on' : 'box'); });
      show(W.warn, ease(seg(t, 0.76, 0.86)));
      show(W.rowBand, ease(seg(t, 0.72, 0.8))); show(W.rowTx, ease(seg(t, 0.72, 0.8)));
      live.tiles = [['切法', 'B_r = B_c = 4'], ['Tile 數', '3 × 3 = 9'], ['N = 1024 · 128×128', '8 × 8 = 64 塊'], ['一塊 tile 的 S', '32 KiB', 'hl'], ['Q、K、V、O 一塊', '各 16 KiB'], ['整個 S', '2 MiB / head']];
    },
    softmax: function (t) {
      var s = softmaxState(t), fin = ease(seg(t, 0.82, 0.92)), a = s.active;
      for (var j = 0; j < N; j++) {
        var c = Math.floor(j / BL), f = s.grow[c] > 0 ? Math.exp(sRow[j] - s.m) * s.grow[c] : 0, v = fin ? lerp(f, f / s.l, fin) : f, h = v * R3.h;
        set(W.bars[j], 'y', r1(R3.base - h)); set(W.bars[j], 'height', r1(h));
        set(W.bars[j], 'class', c === a && t < 0.8 ? 'bar is-new' : 'bar');
        show(W.scores[j].g, s.arrive[c] > 0 ? 0.35 + 0.65 * s.arrive[c] : 0.25);
        show(W.ghosts[j], fin > 0.9 ? 1 : 0);
      }
      text(W.barTitle, fin > 0.5 ? 'f / ℓ = softmax，虛線是直接算的結果' : 'f = e^(s − m)，隨著 m 一起變');
      text(W.regM.v, a < 0 ? '−∞' : fmt(s.m, 2));
      text(W.regL.v, a < 0 ? '0' : fmt(s.l, 2));
      var st = a >= 0 ? ST[a] : null, kS = a > 0 ? seg(t, PH[a][1], PH[a][2]) : 0, moved = st && a > 0 && st.m > st.m0;
      text(W.regR.v, st && a > 0 ? '× ' + fmt(st.scale, 3) : '—');
      set(W.regR.b, 'class', moved && t < PH[a][3] ? 'box is-on' : 'box');
      set(W.regM.b, 'class', moved && kS > 0 && kS < 1 || (a === 0 && t < PH[0][3]) ? 'box is-on' : 'box');
      if (fin > 0) {
        text(W.eq1, 'softmax = f / ℓ = e^(s − ' + fmt(row.m, 2) + ') / ' + fmt(row.l, 3));
        text(W.eq2, '最大的一格：e⁰ / ' + fmt(row.l, 3) + ' = ' + fmt(1 / row.l, 3));
        text(W.eq3, '跟直接算 softmax 的最大誤差 ' + sci(errP));
      } else if (st) {
        var mPrev = a ? fmt(st.m0, 2) : '−∞', fac = a ? fmt(st.scale, 3) : '0', l0 = a ? fmt(st.l0, 3) : '0';
        text(W.eq1, 'm ← max(' + mPrev + ', ' + fmt(Math.max.apply(null, sRow.slice(a * BL, a * BL + BL)), 2) + ') = ' + fmt(st.m, 2));
        text(W.eq2, 'ℓ ← ' + fac + ' × ' + l0 + ' + Σ e^(s − ' + fmt(st.m, 2) + ') = ' + fmt(st.scale * st.l0, 3) + ' + ' + fmt(st.sum, 3) + ' = ' + fmt(st.l, 3));
        text(W.eq3, a === 1 ? '最大值換人：舊的 ' + BL + ' 條一起乘 ' + fmt(st.scale, 3) + '，不用重算' : a === 2 ? '這一段沒有比 m 更大的值，rescale = 1' : '');
      } else { text(W.eq1, ''); text(W.eq2, ''); text(W.eq3, ''); }
      live.softmax = [['目前這段', a >= 0 ? (a + 1) + ' / 3' : '—'], ['看過的分數', (a < 0 ? 0 : (a + 1) * BL) + ' / 12'], ['m', a < 0 ? '−∞' : fmt(s.m, 3), 'hl'], ['ℓ', fmt(s.l, 3), 'hl'],
        ['記憶體', '2 個數 / 列'], ['跟直接算的誤差', fin > 0.9 ? sci(errP) : '—']];
    },
    output: function (t) {
      var s = outputState(t);
      W.ptRow.forEach(function (g, c) { show(g, ease(seg(t, 0.08 + c * 0.24, 0.14 + c * 0.24))); });
      s.O.forEach(function (v, x) { W.acc[x].upd(v, s.active < 0 ? '0' : fmt(v, 3), 3); });
      var a = s.active, st = a >= 0 ? ST[a] : null;
      text(W.accNote, a >= 0 ? '加完第 ' + (a + 1) + ' 段' : '還沒開始');
      text(W.lReg, 'ℓ = ' + fmt(s.l, 3));
      text(W.scaleTag, a > 0 ? (st.scale < 1 ? 'Ô 和 ℓ 先乘 ' + fmt(st.scale, 3) + '，再加這一段' : 'rescale = 1，直接加') : '');
      show(W.outRow, ease(seg(t, 0.84, 0.94)));
      live.output = [['目前這段', a >= 0 ? (a + 1) + ' / 3' : '—'], ['ℓ', fmt(s.l, 3), 'hl'], ['Ô 的第 1 維', fmt(s.O[0], 3)],
        ['O₆ 第 1 維 · online', t > 0.9 ? fmt(row.O[0], 4) : '—'], ['O₆ 第 1 維 · 直接算', t > 0.9 ? fmt(oRow[0], 4) : '—'], ['最大誤差', t > 0.9 ? sci(errO) : '—', 'hl']];
    },
    fa1: function (t) {
      var w = W.A, s = walkRender(w, t, 0.1, 0.9), cnt = [0, 0, 0], du = s.done;
      w.order.slice(0, du).forEach(function (o) { cnt[o[0]]++; });
      w.boxes.forEach(function (b, i) {
        text(b.n, String(cnt[i]));
        set(b.b, 'class', du < 9 && i === s.cur[0] && t >= 0.1 ? 'box is-on' : 'box');
      });
      w.lines.forEach(function (ln, i) { set(ln, 'class', 'code' + (t >= 0.1 && t < 0.9 && i >= 2 ? ' is-hot' : '')); });
      live.fa1 = [['走過的 tile', du + ' / 9'], ['O_i 寫回 HBM', du + ' 次', 'hl'], ['O ÷ ℓ', du + ' 次', 'hl'],
        ['N = 1024 · O_i 寫回', '64 次'], ['N = 1024 · 除法', '524,288 個元素']];
    },
    fa2: function (t) {
      var w = W.B, s = walkRender(w, t, 0.08, 0.6), du = s.done, cnt = [0, 0, 0];
      cnt[0] = du >= 3 ? 1 : 0; cnt[1] = du >= 6 ? 1 : 0; cnt[2] = du >= 9 ? 1 : 0;
      show(w.g, 0.28 + 0.72 * seg(t, 0, 0.06));
      w.boxes.forEach(function (b, i) {
        text(b.n, String(cnt[i]));
        set(b.b, 'class', du < 9 && t >= 0.08 && i === s.cur[0] && du % 3 === 2 ? 'box is-on' : 'box');
      });
      w.lines.forEach(function (ln, i) { set(ln, 'class', 'code' + (t >= 0.08 && t < 0.6 && i === 4 ? ' is-hot' : '')); });
      var kPar = ease(seg(t, 0.62, 0.7)), run = ease(seg(t, 0.68, 0.95));
      show(W.par, kPar); show(w.route, 1 - kPar);
      var col = run * 3;
      W.parC.forEach(function (r) { set(r, 'x', r1(540 + Math.min(2, col) * GR.c)); });
      var par = t > 0.62;
      live.fa2 = [['走過的 tile', (par ? 9 : du) + ' / 9'], ['O_i 寫回 HBM', cnt[0] + cnt[1] + cnt[2] + ' 次', 'hl'], ['O ÷ ℓ', cnt[0] + cnt[1] + cnt[2] + ' 次', 'hl'],
        ['N = 1024 · O_i 寫回', '8 次', 'hl'], ['N = 1024 · 除法', '65,536 個元素', 'hl'], ['同時走的列', par ? '3（thread block）' : '1']];
    },
    backward: function (t) {
      draw(W.bCross, ease(seg(t, 0.08, 0.24)));
      show(W.bL, ease(seg(t, 0.2, 0.34))); show(W.bForm, ease(seg(t, 0.34, 0.46)));
      W.bVals.forEach(function (v, j) { show(v, ease(seg(t, 0.46 + j * 0.03, 0.52 + j * 0.03))); });
      live.backward = [['第 6 列 L', fmt(row.L, 3), 'hl'], ['重建 P 的誤差', sci(errL), 'hl'], ['存 P · N = 1024', '1,048,576 個'], ['存 L · N = 1024', '1,024 個', 'hl'], ['額外記憶體', 'O(N)']];
    },
    causal: function (t) {
      var u = seg(t, 0.06, 0.4), skip = 0, run = 0, diag = 0;
      W.cTiles.forEach(function (o) {
        var upper = o.j > o.i, isD = o.i === o.j, on = (o.i + (o.j)) / 14 < u * 1.05;
        set(o.r, 'class', !on ? 'tile' : upper ? 'tile is-skip' : isD ? 'tile is-diag' : 'tile is-run');
        if (on) { if (upper) skip++; else if (isD) diag++; else run++; }
      });
      text(W.cNote, u >= 1 ? '跳過 28 塊，要算 36 塊：64 / 36 = 1.78' : '');
      W.cMask.forEach(function (m) { show(m, ease(seg(t, 0.5, 0.62))); });
      draw(W.cArrow, ease(seg(t, 0.62, 0.72)));
      show(W.cLbl, ease(seg(t, 0.68, 0.76)));
      W.cDrop.forEach(function (o, i) { show(o.n, ease(seg(t, 0.68 + i * 0.012, 0.76 + i * 0.012))); });
      live.causal = [['Tile 總數', '64'], ['整塊跳過', skip + ' 塊', 'hl'], ['對角線（要看 mask）', diag + ' 塊'], ['完全不用 mask', run + ' 塊'], ['論文量到', '1.7–1.8×', 'hl']];
    },
    results: function (t) {
      W.res.forEach(function (b, i) {
        var k = ease(seg(t, 0.06 + i * 0.2, 0.34 + i * 0.2)), l = 6;
        set(b.a, 'width', r1(b.va * k)); set(b.b, 'width', r1(b.vb * k));
        set(b.ta, 'x', r1(b.va * k + l)); set(b.tb, 'x', r1(b.vb * k + l));
        show(b.ta, k); show(b.tb, k); show(b.tag, ease(seg(t, 0.28 + i * 0.2, 0.4 + i * 0.2)));
      });
    }
  };

  // ---- 說明欄 ----
  var caps = {};
  [].forEach.call(root.querySelectorAll('[data-cap]'), function (c) { caps[c.getAttribute('data-cap')] = c; });
  var statusEl = root.querySelector('[data-status]'), factsEl = root.querySelector('[data-facts]');
  var stopBtns = [].slice.call(root.querySelectorAll('[data-stop]'));
  var FACTS = {
    intro: [['例子', 'N = 12 · d = 4'], ['S 大小', 'N × N'], ['GPT-2 medium', 'N = 1024 · d = 64'], ['FA-1 vs 直接算', '誤差 ' + sci(errA)]],
    results: [['BERT-large · MLPerf 1.1', '快 15%', 'hl'], ['GPT-2 · HuggingFace', '快 3×', 'hl'], ['Long-range arena', '快 2.4×'], ['FA-2 vs FA-1', '快 1.7–3.0×', 'hl'], ['FA-2 · A100', '225 TFLOPs/s']]
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
    var FULL = 60000, raf = 0, p0 = 0, t0 = 0, setY = 0, shown = '';
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
