// toy CFG：平面上三類資料，每類兩個高斯；頁面上的軌跡、箭頭、數字都是從這裡當場算出來的
var CF = (function () {
  'use strict';
  // 每類一個集中的核心、一個寬的尾巴伸向中間（有些貓長得像狗）
  var COMP = [
    { c: 0, mu: [-2.0, 0.75], s: 0.42, pi: 0.62 }, { c: 0, mu: [-0.9, 0.25], s: 0.8, pi: 0.38 },
    { c: 1, mu: [2.0, 0.85], s: 0.42, pi: 0.62 }, { c: 1, mu: [0.9, 0.35], s: 0.8, pi: 0.38 },
    { c: 2, mu: [0.0, -2.05], s: 0.45, pi: 0.65 }, { c: 2, mu: [0.0, -1.0], s: 0.8, pi: 0.35 }
  ];
  var STEPS = 64, OFF = 0.004;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  // flow matching：x_t = (1 − t)·x₀ + t·ε。每個高斯在 t 時還是高斯，所以 E[x₀ | x_t]、E[ε | x_t] 都有精確解
  // cond = 0 / 1 / 2 是那一類，−1 是無條件（∅）
  function predict(x, y, t, cond) {
    var a = 1 - t, lw = [], ks = [], best = -Infinity;
    COMP.forEach(function (k) {
      if (cond >= 0 && k.c !== cond) return;
      var V = a * a * k.s * k.s + t * t, dx = x - a * k.mu[0], dy = y - a * k.mu[1];
      var l = Math.log(k.pi) - (dx * dx + dy * dy) / (2 * V) - Math.log(V);
      lw.push(l); ks.push(k); if (l > best) best = l;
    });
    var z = 0, x0 = [0, 0], e = [0, 0];
    ks.forEach(function (k, i) {
      var w = Math.exp(lw[i] - best), V = a * a * k.s * k.s + t * t, dx = x - a * k.mu[0], dy = y - a * k.mu[1];
      z += w;
      x0[0] += w * (k.mu[0] + a * k.s * k.s / V * dx); x0[1] += w * (k.mu[1] + a * k.s * k.s / V * dy);
      e[0] += w * t / V * dx; e[1] += w * t / V * dy;
    });
    return { x0: [x0[0] / z, x0[1] / z], e: [e[0] / z, e[1] / z] };
  }
  // p(c | x_t)；t = 0 就是乾淨資料上的貝氏 classifier
  function posterior(x, y, t) {
    var a = 1 - (t || 0), b = t || 0, p = [0, 0, 0];
    COMP.forEach(function (k) {
      var V = a * a * k.s * k.s + b * b, dx = x - a * k.mu[0], dy = y - a * k.mu[1];
      p[k.c] += k.pi * Math.exp(-(dx * dx + dy * dy) / (2 * V)) / V;
    });
    var z = p[0] + p[1] + p[2];
    return z > 0 ? p.map(function (v) { return v / z; }) : [1 / 3, 1 / 3, 1 / 3];
  }
  function density(x, y) {
    var d = 0;
    COMP.forEach(function (k) { var dx = x - k.mu[0], dy = y - k.mu[1]; d += k.pi / 3 * Math.exp(-(dx * dx + dy * dy) / (2 * k.s * k.s)) / (2 * Math.PI * k.s * k.s); });
    return d;
  }
  function lin(u, c, w) { return [u[0] + w * (c[0] - u[0]), u[1] + w * (c[1] - u[1])]; }
  // ε̃ = ε_neg + w (ε_c − ε_neg)；neg 沒給就是 ∅。x̂₀ 是 ε 的線性函數，所以做同一個外插
  function guided(x, y, t, cond, w, neg) {
    var u = predict(x, y, t, neg == null ? -1 : neg);
    if (cond < 0) return u;
    var c = predict(x, y, t, cond);
    return { x0: lin(u.x0, c.x0, w), e: lin(u.e, c.e, w) };
  }
  // spec：{ cond, w, neg, iv }；iv = [t0, t1] 時只在這段 t 開 guidance，其他時候 w = 1
  function run(start, spec) {
    var x = start[0], y = start[1], path = [[x, y]], dt = 1 / STEPS;
    for (var i = 0; i < STEPS; i++) {
      var t = 1 - i / STEPS, w = spec.iv && (t < spec.iv[0] || t > spec.iv[1]) ? 1 : spec.w;
      var p = guided(x, y, t, spec.cond, w, spec.neg);
      x -= dt * (p.e[0] - p.x0[0]); y -= dt * (p.e[1] - p.x0[1]); // dx/dt = ε − x₀，從 t = 1 往 0 走
      path.push([x, y]);
    }
    return path;
  }
  function starts(n, seed) { var r = mulberry32(seed), s = []; for (var i = 0; i < n; i++) s.push([gauss(r), gauss(r)]); return s; }
  function argmax(p) { return p[0] >= p[1] && p[0] >= p[2] ? 0 : p[1] >= p[2] ? 1 : 2; }
  function stats(ends, cond) {
    var n = ends.length, split = [0, 0, 0], post = [0, 0, 0], off = 0, m = [0, 0];
    ends.forEach(function (e) {
      var p = posterior(e[0], e[1], 0);
      split[argmax(p)]++; post[0] += p[0]; post[1] += p[1]; post[2] += p[2];
      if (density(e[0], e[1]) < OFF) off++;
      m[0] += e[0]; m[1] += e[1];
    });
    m = [m[0] / n, m[1] / n];
    var sp = 0;
    ends.forEach(function (e) { sp += (e[0] - m[0]) * (e[0] - m[0]) + (e[1] - m[1]) * (e[1] - m[1]); });
    return { inC: split[cond < 0 ? 0 : cond] / n, split: split.map(function (v) { return v / n; }), post: post.map(function (v) { return v / n; }), off: off / n, spread: Math.sqrt(sp / n) };
  }
  // 直接從 p(x | c) 抽樣，拿來跟 w = 1 的軌跡比
  function sample(cond, n, seed) {
    var r = mulberry32(seed), ks = COMP.filter(function (k) { return k.c === cond; }), out = [];
    for (var i = 0; i < n; i++) { var k = r() < ks[0].pi ? ks[0] : ks[1]; out.push([k.mu[0] + k.s * gauss(r), k.mu[1] + k.s * gauss(r)]); }
    return out;
  }
  return { COMP: COMP, STEPS: STEPS, OFF: OFF, mulberry32: mulberry32, gauss: gauss, predict: predict, posterior: posterior, density: density, guided: guided, run: run, starts: starts, stats: stats, argmax: argmax, sample: sample };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = CF;

(function () {
  'use strict';
  if (typeof document === 'undefined') return;
  var html = document.documentElement;
  var root = document.querySelector('[data-cf]');
  if (!root || !window.CF) return;
  var track = root.querySelector('.cf-track'), stage = root.querySelector('.cf-stage');
  var svg = root.querySelector('[data-world]'), panel = root.querySelector('.cf-panel');
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
  function pct(v) { return Math.round(v * 100) + '%'; }
  function pt(v) { return '(' + fmt(v[0], 2) + ', ' + fmt(v[1], 2) + ')'; }

  // ---- 平面座標：資料的 1 單位 = U px，y 往上 ----
  var U = 80;
  function X(x) { return r1(x * U); }
  function Y(y) { return r1(-y * U); }
  // 從 a 指到 b 的箭頭，箭頭頭部 9 px
  function arrowD(a, b) {
    var x1 = X(a[0]), y1 = Y(a[1]), x2 = X(b[0]), y2 = Y(b[1]), dx = x2 - x1, dy = y2 - y1, L = Math.sqrt(dx * dx + dy * dy);
    if (L < 0.5) return 'M' + x1 + ' ' + y1;
    var ux = dx / L, uy = dy / L, h = Math.min(9, L * 0.5);
    return 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 +
      'M' + r1(x2 - ux * h - uy * h * 0.55) + ' ' + r1(y2 - uy * h + ux * h * 0.55) + 'L' + x2 + ' ' + y2 +
      'L' + r1(x2 - ux * h + uy * h * 0.55) + ' ' + r1(y2 - uy * h - ux * h * 0.55);
  }
  function add(a, b, k) { return [a[0] + b[0] * (k == null ? 1 : k), a[1] + b[1] * (k == null ? 1 : k)]; }
  var NAMES = ['貓', '狗', '車'], CLS = ['cat', 'dog', 'car'];

  // ================= 軌跡：同一組起點，換 spec 重算；結果記起來 =================
  var NT = 48, NSTAT = 300, SUB = 2;
  var S0 = CF.starts(NSTAT, 7), SV = S0.slice(0, NT);
  function key(s) { return [s.cond, s.w, s.neg == null ? '' : s.neg, s.iv ? s.iv.join('-') : ''].join('|'); }
  var memoP = {}, memoS = {};
  function pathsFor(s) {
    var k = key(s);
    if (!memoP[k]) memoP[k] = SV.map(function (st) { return CF.run(st, s).filter(function (_, i) { return i % SUB === 0; }); });
    return memoP[k];
  }
  function statsFor(s) {
    var k = key(s);
    if (!memoS[k]) memoS[k] = CF.stats(S0.map(function (st) { var p = CF.run(st, s); return p[p.length - 1]; }), s.cond);
    return memoS[k];
  }
  function q05(w) { return Math.round(w * 20) / 20; } // w 量化到 0.05，記憶體跟計算量才有上限
  var UNC = { cond: -1, w: 0 }, IV = [0.15, 0.6];
  var SP = { w15: { cond: 0, w: 1.5 }, neg: { cond: 0, w: 1.5, neg: 1 }, w7: { cond: 0, w: 7 }, iv: { cond: 0, w: 7, iv: IV } };
  var base = statsFor(UNC);

  // ================= 世界：建一次，之後每幀只改屬性 =================
  var W = {}, regions = [];
  function region(cx, cy, r) { var g = el('g', {}, svg); regions.push({ g: g, cx: cx, cy: cy, r: r }); return g; }
  var Qp = [0, 0.6], QT = 0.6; // classifier 和公式那兩站看的那一個點
  var qU = CF.predict(Qp[0], Qp[1], QT, -1), qC = CF.predict(Qp[0], Qp[1], QT, 0), qPost = CF.posterior(Qp[0], Qp[1], QT);
  var qD = [qC.x0[0] - qU.x0[0], qC.x0[1] - qU.x0[1]];
  var sU = [-qU.e[0] / QT, -qU.e[1] / QT], sG = [-(qC.e[0] - qU.e[0]) / QT, -(qC.e[1] - qU.e[1]) / QT]; // ∇log p(x_t)、∇log p(貓 | x_t)
  function len(v) { return Math.sqrt(v[0] * v[0] + v[1] * v[1]); }

  // ---- 平面 ----
  (function () {
    var g = region(0, 0, 640);
    W.plane = g;
    for (var gx = -5; gx <= 3; gx++) el('line', { x1: X(gx), y1: Y(-2.9), x2: X(gx), y2: Y(2.6), class: 'grid' }, g);
    for (var gy = -2; gy <= 2; gy++) el('line', { x1: X(-5.2), y1: Y(gy), x2: X(3.4), y2: Y(gy), class: 'grid' }, g);
    T(g, X(-5.2), Y(2.6) - 14, 'x ∈ ℝ² · 玩具資料集', 't-d');

    // classifier 那一站的背景：t = 0.6 時「這是貓」的機率。用 mask 畫，顏色才吃得到 CSS 變數
    W.heat = hide(el('g', {}, g));
    var HX0 = -5.2, HX1 = 3.4, HY0 = -2.9, HY1 = 2.6, cw = 86, ch = 55;
    var cv = document.createElement('canvas'), ctx = cv.getContext && cv.getContext('2d');
    if (ctx) {
      cv.width = cw; cv.height = ch;
      var img = ctx.createImageData(cw, ch);
      for (var j = 0; j < ch; j++) for (var i = 0; i < cw; i++) {
        var px = HX0 + (i + 0.5) / cw * (HX1 - HX0), py = HY1 - (j + 0.5) / ch * (HY1 - HY0), v = Math.round(CF.posterior(px, py, QT)[0] * 255), o = (j * cw + i) * 4;
        img.data[o] = img.data[o + 1] = img.data[o + 2] = v; img.data[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      var defs = el('defs', {}, svg), mk = el('mask', { id: 'cf-heat' }, defs);
      el('image', { href: cv.toDataURL(), x: X(HX0), y: Y(HY1), width: X(HX1) - X(HX0), height: Y(HY0) - Y(HY1), preserveAspectRatio: 'none' }, mk);
      el('rect', { x: X(HX0), y: Y(HY1), width: X(HX1) - X(HX0), height: Y(HY0) - Y(HY1), class: 'heat', mask: 'url(#cf-heat)' }, W.heat);
    }
    T(W.heat, X(3.4), Y(-2.9) + 24, '背景：t = 0.6 時 p(貓 | x_t)', 't-h end');

    // 三團資料
    W.data = [0, 1, 2].map(function (c) {
      var gg = el('g', { class: 'c-' + CLS[c] }, g);
      CF.sample(c, 110, 31 + c).forEach(function (q) { el('circle', { cx: X(q[0]), cy: Y(q[1]), r: 2.6, class: 'pt' }, gg); });
      return gg;
    });
    W.lbl = [0, 1, 2].map(function (c) {
      var k = CF.COMP[c * 2], dx = c === 0 ? -0.95 : c === 1 ? 0.95 : 0.85, dy = c === 2 ? -0.45 : 0.75;
      return T(g, X(k.mu[0] + dx), Y(k.mu[1] + dy), NAMES[c], 't-cls c-' + CLS[c] + ' mid');
    });
    W.negRing = hide(el('ellipse', { cx: X(1.55), cy: Y(0.7), rx: 2.1 * U, ry: 1.2 * U, class: 'ring-n' }, g));
    W.negTx = hide(T(g, X(1.55), Y(2.05), 'negative prompt：狗', 't-n mid'));

    // 箭頭場：t = 0.6 時每一點往哪走
    W.field = hide(el('g', { class: 'field' }, g));
    W.arrows = [];
    for (var ax = -4.5; ax <= 3.01; ax += 0.5) for (var ay = -2.5; ay <= 2.01; ay += 0.5) W.arrows.push({ p: [ax, ay], e: el('path', { class: 'arw' }, W.field) });
    T(W.field, X(3.4), Y(2.6) - 14, '箭頭：t = 0.6 時每一點往哪走', 't-d end');

    // 軌跡、起點、終點
    W.tr = el('g', {}, g);
    W.paths = SV.map(function () { return el('path', { class: 'traj', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, W.tr); });
    W.starts = SV.map(function (s) { return el('circle', { cx: X(s[0]), cy: Y(s[1]), r: 2.4, class: 'st' }, W.tr); });
    W.ends = SV.map(function () { return el('circle', { r: 4.2, class: 'end', opacity: 0 }, W.tr); });
    W.wTx = T(g, X(-5.2), Y(-2.9) + 40, '', 't-big');
    W.wSub = T(g, X(-5.2), Y(-2.9) + 64, '', 't-d');
  })();

  // ---- classifier guidance：x_t 上的兩支箭頭 ----
  (function () {
    var g = W.cls = hide(el('g', {}, W.plane));
    W.cA = el('path', { class: 'vec-u' }, g);
    W.cB = el('path', { class: 'vec-c' }, g);
    W.cS = el('path', { class: 'vec-g' }, g);
    el('circle', { cx: X(Qp[0]), cy: Y(Qp[1]), r: 5, class: 'q' }, g);
    T(g, X(Qp[0]) + 10, Y(Qp[1]) + 20, 'x_t', 't-b');
    W.cAt = T(g, 0, 0, '∇log p(x_t)', 't-u');
    W.cBt = T(g, 0, 0, '', 't-h');
    W.cSt = T(g, 0, 0, '合起來', 't-b');
    W.cEq = T(g, X(-5.4), Y(-1.4), '∇log p(x_t | 貓) = ∇log p(x_t) + ∇log p(貓 | x_t)', 't-b');
    W.cEq2 = T(g, X(-5.4), Y(-1.4) + 24, '', 't-d');
  })();

  // ---- 公式：把預測換算成 x̂₀，往差的方向外插 w 倍 ----
  (function () {
    var g = W.fm = hide(el('g', {}, W.plane));
    var far = add(qU.x0, qD, 7.6);
    W.fLine = el('path', { d: 'M' + X(qU.x0[0]) + ' ' + Y(qU.x0[1]) + 'L' + X(far[0]) + ' ' + Y(far[1]), class: 'lead' }, g);
    W.fTicks = [0, 1, 3, 7].map(function (w) {
      var p = add(qU.x0, qD, w), gg = el('g', {}, g);
      el('line', { x1: X(p[0]), y1: Y(p[1]) - 7, x2: X(p[0]), y2: Y(p[1]) + 7, class: 'tick' }, gg);
      if (w) T(gg, X(p[0]), Y(p[1]) + 26, 'w = ' + w, 't-s mid'); // w = 0 的位置就是 x̂₀(∅)，標籤在旁邊
      return gg;
    });
    W.fU = el('path', { d: arrowD(Qp, qU.x0), class: 'vec-u' }, g);
    W.fC = el('path', { d: arrowD(Qp, qC.x0), class: 'vec-c' }, g);
    W.fG = el('path', { class: 'vec-g' }, g);
    el('circle', { cx: X(Qp[0]), cy: Y(Qp[1]), r: 5, class: 'q' }, g);
    T(g, X(Qp[0]) + 10, Y(Qp[1]) - 12, 'x_t · t = 0.6', 't-b');
    el('circle', { cx: X(qU.x0[0]), cy: Y(qU.x0[1]), r: 5, class: 'f-u' }, g);
    T(g, X(qU.x0[0]) + 12, Y(qU.x0[1]) + 26, 'x̂₀(∅) · w = 0', 't-u');
    el('circle', { cx: X(qC.x0[0]), cy: Y(qC.x0[1]), r: 5, class: 'f-c' }, g);
    T(g, X(qC.x0[0]), Y(qC.x0[1]) - 16, 'x̂₀(貓)', 't-h mid');
    W.fDot = el('circle', { r: 6.5, class: 'f-g' }, g);
    W.fDotT = T(g, 0, 0, '', 't-b mid');
    var fx = X(-5.6), fy = -292;
    T(g, fx, fy, 'x̂₀ = x̂₀(∅) + w · (x̂₀(貓) − x̂₀(∅))', 't-serif');
    T(g, fx, fy + 28, 'x̂₀ = (x_t − t·ε) / (1 − t) 是 ε 的線性函數：對 ε 外插，就是對 x̂₀ 外插', 't-d');
    W.fNote = hide(T(g, fx, fy + 54, 'w = 7：預測已經衝出資料範圍，但這一步只朝它走 1/64', 't-h'));
  })();

  // ---- w 掃過去時的三條曲線 ----
  var CH = { x: 360, y: -170, w: 280, h: 300, wMax: 8 };
  function chX(w) { return r1(CH.x + w / CH.wMax * CH.w); }
  function chY(v) { return r1(CH.y + CH.h - v * CH.h); }
  var CURVE = [];
  (function () {
    var g = W.chart = hide(el('g', {}, W.plane));
    for (var w = 0; w <= CH.wMax + 1e-9; w += 0.5) { var s = statsFor({ cond: 0, w: w }); CURVE.push([w, s.post[0], s.spread / base.spread, s.off]); }
    el('rect', { x: CH.x, y: CH.y, width: CH.w, height: CH.h, class: 'frame' }, g);
    [0, 1, 3, 7].forEach(function (w) { el('line', { x1: chX(w), y1: CH.y, x2: chX(w), y2: CH.y + CH.h, class: 'grid' }, g); T(g, chX(w), CH.y + CH.h + 18, String(w), 't-s mid'); });
    T(g, CH.x + CH.w, CH.y + CH.h + 36, 'w', 't-d end');
    T(g, CH.x - 6, CH.y + 4, '1', 't-s end'); T(g, CH.x - 6, CH.y + CH.h + 4, '0', 't-s end');
    T(g, CH.x, CH.y - 14, '300 個起點，終點的統計', 't-d');
    var LS = [['平均 p(貓 | x)', 1, 'ln-c'], ['散布（相對 w = 0）', 2, 'ln-s'], ['衝出資料範圍', 3, 'ln-o']];
    W.cur = LS.map(function (l, i) {
      el('path', { d: CURVE.map(function (c, j) { return (j ? 'L' : 'M') + chX(c[0]) + ' ' + chY(c[l[1]]); }).join(''), class: l[2] }, g);
      el('line', { x1: CH.x + 4, y1: CH.y + CH.h + 58 + i * 20, x2: CH.x + 22, y2: CH.y + CH.h + 58 + i * 20, class: l[2] }, g);
      T(g, CH.x + 30, CH.y + CH.h + 62 + i * 20, l[0], 't-s');
      return el('circle', { r: 4.5, class: 'dot ' + l[2] }, g);
    });
    W.cursor = el('line', { y1: CH.y, y2: CH.y + CH.h, class: 'cursor' }, g);
  })();

  // ---- 修過頭的方法：三張卡 ----
  (function () {
    var g = W.fixes = hide(el('g', {}, W.plane));
    var C = [['Negative prompt', '把 ∅ 換成「狗」', 'ε_neg + w (ε_c − ε_neg)'], ['Guidance interval', 'w = 7 只在 ' + IV[0] + ' ≤ t ≤ ' + IV[1], '其他時間 w = 1'], ['Rescale · Thresholding', '把 x̂₀ 的數值拉回合理範圍', '像素才有的問題，這裡不畫']];
    W.fixCards = C.map(function (c, i) {
      var y = CH.y + i * 112, b = el('rect', { x: CH.x, y: y, width: CH.w, height: 96, rx: 3, class: 'card' }, g);
      T(g, CH.x + 14, y + 26, c[0], 't-b'); T(g, CH.x + 14, y + 52, c[1], 't-d'); T(g, CH.x + 14, y + 76, c[2], 't-s');
      return b;
    });
  })();

  // ---- 訓練時把 prompt 換成 ∅ ----
  var DX = 1700;
  (function () {
    var g = region(DX, 0, 500), x0 = DX - 500;
    T(g, x0, -250, '訓練：每一筆以一定機率把 prompt 換成 ∅', 't-b');
    var PROMPTS = [0, 1, 2, 0, 2, 1, 0, 1, 2, 0], DROP = [2, 7];
    W.cards = PROMPTS.map(function (c, i) {
      var x = x0 + i * 100, gg = hide(el('g', {}, g));
      el('rect', { x: x, y: -220, width: 88, height: 60, rx: 3, class: 'card' }, gg);
      el('circle', { cx: x + 18, cy: -190, r: 6, class: 'c-' + CLS[c] + ' f-cls' }, gg);
      var pr = T(gg, x + 32, -184, NAMES[c], 't-b');
      var drop = DROP.indexOf(i) >= 0, dg = null;
      if (drop) {
        dg = hide(el('g', {}, gg));
        el('rect', { x: x, y: -220, width: 88, height: 60, rx: 3, class: 'card-u' }, dg);
        T(dg, x + 44, -183, '∅', 't-big mid');
      }
      return { g: gg, drop: dg, pr: pr };
    });
    W.trainWire = wire(g, 'M' + DX + ' -150 V-92', 'wire');
    el('rect', { x: DX - 150, y: -90, width: 300, height: 70, rx: 4, class: 'box' }, g);
    T(g, DX, -60, '網路 θ', 't-b mid'); T(g, DX, -36, 'DiT / U-Net · 只有一組權重', 't-s mid');
    W.trainTx = T(g, DX + 170, -50, '', 't-d');

    var y = 60;
    W.inf = hide(el('g', {}, g));
    T(W.inf, x0, y - 20, '取樣：每一步呼叫兩次', 't-b');
    [['x_t, 「貓」', 'ε(x_t, 貓)', 'f-c', 0], ['x_t, ∅', 'ε(x_t, ∅)', 'f-u', 1]].forEach(function (r, i) {
      var yy = y + 10 + i * 90;
      el('rect', { x: x0, y: yy, width: 180, height: 56, rx: 3, class: i ? 'card-u' : 'card-h' }, W.inf);
      T(W.inf, x0 + 90, yy + 34, r[0], 't-b mid');
      el('path', { d: 'M' + (x0 + 180) + ' ' + (yy + 28) + 'h80', class: 'wire' }, W.inf);
      el('rect', { x: x0 + 260, y: yy, width: 180, height: 56, rx: 3, class: 'box' }, W.inf);
      T(W.inf, x0 + 350, yy + 34, 'θ', 't-b mid');
      el('path', { d: 'M' + (x0 + 440) + ' ' + (yy + 28) + 'h80', class: 'wire' }, W.inf);
      T(W.inf, x0 + 530, yy + 34, r[1], i ? 't-u' : 't-h');
    });
    T(W.inf, x0 + 350, y + 186, '同一組權重，batch 疊兩份一起算', 't-s mid');
    el('path', { d: 'M' + (x0 + 650) + ' ' + (y + 38) + 'h40 v90 h-40 M' + (x0 + 690) + ' ' + (y + 83) + 'h40', class: 'wire' }, W.inf);
    el('rect', { x: x0 + 740, y: y + 50, width: 280, height: 66, rx: 3, class: 'box' }, W.inf);
    T(W.inf, x0 + 880, y + 90, 'ε_∅ + w (ε_c − ε_∅)', 't-b mid');
  })();

  // ---- 代價：每一步幾次 forward ----
  var CX = -1900;
  var COST = [
    ['SD 3.5 Large', '40 步 · CFG 4.5 · 無條件 = 空 prompt', 40, 2, 'u'],
    ['Ideogram 4', '20 步 · guidance 7 → 3 · 無條件跑另一組權重', 20, 2, 'x'],
    ['FLUX.1 [dev]', '28 步 · guidance 3.5 當成輸入（蒸餾）', 28, 1, ''],
    ['SD 3.5 Large Turbo', '4 步 · CFG 1', 4, 1, '']
  ];
  (function () {
    var g = region(CX, 0, 500), x0 = CX - 500, BW = 9, GAP = 2.5;
    T(g, x0, -240, '每一格是一次 forward，同一個比例尺', 't-b');
    [['f-c', '有 prompt'], ['f-u', '無條件 · 同一組權重'], ['f-x', '無條件 · 另一組權重']].forEach(function (l, i) {
      el('rect', { x: x0 + 520 + i * 170, y: -251, width: 12, height: 12, class: l[0] }, g);
      T(g, x0 + 538 + i * 170, -240, l[1], 't-s');
    });
    W.cost = COST.map(function (c, r) {
      var y = -190 + r * 105, n = c[2] * c[3], blocks = [];
      T(g, x0, y, c[0], 't-b'); T(g, x0 + 200, y, c[1], 't-d');
      for (var i = 0; i < n; i++) {
        var uncond = c[3] === 2 && i % 2 === 1;
        blocks.push(hide(el('rect', { x: r1(x0 + i * (BW + GAP)), y: y + 14, width: BW, height: 34, class: uncond ? (c[4] === 'x' ? 'f-x' : 'f-u') : 'f-c' }, g)));
      }
      return { blocks: blocks, n: n, steps: c[2], tx: T(g, x0 + 1000, y + 40, '', 't-big end') };
    });
  })();

  // ================= 段落與鏡頭 =================
  var BEATS = [['intro', 0.8], ['cond', 1.6], ['classifier', 1.4], ['dropout', 1.2], ['formula', 2.4], ['sweep', 2.6], ['cost', 1.4], ['fixes', 1.6]];
  var HOLD = 0.35, STOPS = BEATS.slice(1).map(function (b) { return b[0]; });
  var total = BEATS.reduce(function (s, b) { return s + b[1]; }, HOLD), spans = {}, acc = 0;
  BEATS.forEach(function (b) { spans[b[0]] = { start: acc / total, len: b[1] / total }; acc += b[1]; });
  function localT(k, p) { return clamp01((p - spans[k].start) / spans[k].len); }
  function beatAt(p) { var cur = BEATS[0][0]; BEATS.forEach(function (b) { if (p >= spans[b[0]].start) cur = b[0]; }); return cur; }

  // 每格 [beat, t, 中心 x, 中心 y, 寬]：同一個位置放兩格 = 鏡頭停住
  var FULL = [-30, 0, 1000], WIDE = [110, 0, 1180];
  var SHOTS = [
    ['intro', 0].concat(FULL), ['intro', 1].concat(FULL),
    ['cond', 1].concat(FULL),
    ['classifier', 0.15, -90, -30, 780], ['classifier', 1, -90, -30, 780],
    ['dropout', 0.15, DX, 0, 1150], ['dropout', 1, DX, 0, 1150],
    ['formula', 0.12, -90, -30, 780], ['formula', 0.66, -90, -30, 780], ['formula', 0.86, -370, -30, 1000], ['formula', 1, -370, -30, 1000],
    ['sweep', 0.1].concat(WIDE), ['sweep', 1].concat(WIDE),
    ['cost', 0.15, CX, 0, 1150], ['cost', 1, CX, 0, 1150],
    ['fixes', 0.12].concat(WIDE), ['fixes', 1].concat(WIDE)
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
    var w = c.w; // 窄螢幕不放大：場景本來就寬，放大會把兩側切掉
    var s = Math.min(view.fw / w, view.fh / (w * 0.62));
    var vx = c.x - (view.fx + view.fw / 2) / s, vy = c.y - (view.fy + view.fh / 2) / s;
    set(svg, 'viewBox', [r1(vx), r1(vy), r1(view.W / s), r1(view.H / s)].join(' '));
    regions.forEach(function (r) { show(r.g, 1 - seg(Math.sqrt((c.x - r.cx) * (c.x - r.cx) + (c.y - r.cy) * (c.y - r.cy)), r.r, r.r + 420)); });
  }

  // ================= 平面上的軌跡：整段只看 p 決定現在是哪一組 spec =================
  // sweep 的 w：1 → 0 → 1 → 3 → 7，中間停一下
  var WK = [[0, 1], [0.1, 1], [0.2, 0], [0.28, 0], [0.4, 1], [0.48, 1], [0.62, 3], [0.7, 3], [0.85, 7], [1, 7]];
  function sweepW(t) {
    for (var i = 1; i < WK.length; i++) if (t <= WK[i][0]) return lerp(WK[i - 1][1], WK[i][1], ease(seg(t, WK[i - 1][0], WK[i][0])));
    return 7;
  }
  function planeCfg(beat, t) {
    var c1 = { cond: 0, w: 1 };
    switch (beat) {
      case 'intro': return { a: UNC, draw: ease(seg(t, 0.1, 0.85)), dim: 0, label: '無條件', sub: 'ε(x_t, ∅)', field: 0 };
      case 'cond': var w = ease(seg(t, 0.12, 0.5)); return { a: { cond: 0, w: q05(w) }, dim: 0, label: 'w = ' + fmt(q05(w), 2), sub: '條件：貓', field: seg(t, 0.55, 0.65) * (1 - seg(t, 0.92, 1)) };
      case 'classifier': return { a: c1, dim: ease(seg(t, 0, 0.12)), label: 'w = 1.00', sub: '條件：貓', field: 0 };
      case 'dropout': return { a: c1, dim: 1, label: 'w = 1.00', sub: '條件：貓', field: 0 };
      case 'formula': return { a: c1, dim: 1, label: 'w = 1.00', sub: '條件：貓', field: 0 };
      case 'sweep': var ws = q05(sweepW(t)); return { a: { cond: 0, w: ws }, dim: 1 - ease(seg(t, 0, 0.1)), label: 'w = ' + fmt(ws, 2), sub: ws === 0 ? '條件：貓（w = 0 就是無條件）' : '條件：貓', field: 0 };
      case 'cost': return { a: SP.w7, dim: 0, label: 'w = 7.00', sub: '條件：貓', field: 0 };
    }
    // fixes：w 7 → 1.5 → 換 negative → w 7 → 只開一段
    if (t < 0.13) return { a: SP.w7, b: SP.w15, k: ease(seg(t, 0.02, 0.12)), dim: 0, label: 'w = 1.50', sub: '條件：貓 · 無條件分支：∅', field: 0, show: SP.w15 };
    if (t < 0.5) return { a: SP.w15, b: SP.neg, k: ease(seg(t, 0.15, 0.38)), dim: 0, label: 'w = 1.50', sub: '條件：貓 · 無條件分支：' + (t > 0.26 ? '狗' : '∅'), field: 0, show: t > 0.26 ? SP.neg : SP.w15 };
    if (t < 0.6) return { a: SP.neg, b: SP.w7, k: ease(seg(t, 0.5, 0.58)), dim: 0, label: 'w = 7.00', sub: '條件：貓 · 每一步都開', field: 0, show: SP.w7 };
    return { a: SP.w7, b: SP.iv, k: ease(seg(t, 0.62, 0.8)), dim: 0, label: 'w = 7.00', sub: t > 0.71 ? '條件：貓 · 只在 ' + IV[0] + ' ≤ t ≤ ' + IV[1] + ' 開' : '條件：貓 · 每一步都開', field: 0, show: t > 0.71 ? SP.iv : SP.w7 };
  }
  var planeKey = '', fieldKey = '';
  function renderPlane(cfg) {
    var pa = pathsFor(cfg.a), pb = cfg.b ? pathsFor(cfg.b) : pa, k = cfg.b ? Math.round(cfg.k * 100) / 100 : 0;
    var kk = key(cfg.a) + '>' + (cfg.b ? key(cfg.b) : '') + '@' + k;
    if (kk !== planeKey) {
      planeKey = kk;
      pa.forEach(function (P, i) {
        var Q = pb[i], d = '', e;
        for (var j = 0; j < P.length; j++) { e = [lerp(P[j][0], Q[j][0], k), lerp(P[j][1], Q[j][1], k)]; d += (j ? 'L' : 'M') + X(e[0]) + ' ' + Y(e[1]); }
        set(W.paths[i], 'd', d);
        set(W.ends[i], 'cx', X(e[0])); set(W.ends[i], 'cy', Y(e[1]));
        set(W.ends[i], 'class', 'end c-' + CLS[CF.argmax(CF.posterior(e[0], e[1], 0))] + (CF.density(e[0], e[1]) < CF.OFF ? ' is-off' : ''));
      });
    }
    var dr = cfg.draw == null ? 1 : cfg.draw;
    W.paths.forEach(function (p) { draw(p, dr); });
    W.ends.forEach(function (e) { show(e, seg(dr, 0.9, 1)); });
    show(W.tr, 1 - 0.8 * cfg.dim);
    W.data.forEach(function (g) { show(g, 1 - 0.6 * cfg.dim); });
    text(W.wTx, cfg.label); text(W.wSub, cfg.sub);
    show(W.wTx, 1 - cfg.dim); show(W.wSub, 1 - cfg.dim);
    // 箭頭場跟著 cond 那一站的 w 走
    show(W.field, cfg.field);
    if (cfg.field > 0) {
      var fk = key(cfg.a);
      if (fk !== fieldKey) {
        fieldKey = fk;
        W.arrows.forEach(function (a) {
          var g = CF.guided(a.p[0], a.p[1], 0.6, cfg.a.cond, cfg.a.w), v = [g.x0[0] - g.e[0], g.x0[1] - g.e[1]], L = len(v), s = Math.min(0.32, L * 0.16) / (L || 1);
          set(a.e, 'd', arrowD(a.p, add(a.p, v, s)));
        });
      }
    }
  }

  // ================= 每一段的 renderer：只吃自己的 t =================
  var live = {};
  function statRows(s, cond) {
    return [['落在' + NAMES[cond] + '的比例', pct(s.split[cond]), 'hl'], ['平均 p(' + NAMES[cond] + ' | x)', fmt(s.post[cond], 2)], ['散布（相對 w = 0）', pct(s.spread / base.spread)], ['衝出資料範圍', pct(s.off), s.off > 0.05 ? 'ng' : '']];
  }
  var R = {
    intro: function () {},
    cond: function (t) {
      var w = q05(ease(seg(t, 0.12, 0.5))), s = statsFor({ cond: 0, w: w });
      live.cond = [['w', fmt(w, 2)]].concat(statRows(s, 0));
    },
    classifier: function (t) {
      var on = ease(seg(t, 0.06, 0.18)) * (1 - seg(t, 0.94, 1));
      show(W.cls, on); show(W.heat, ease(seg(t, 0.12, 0.3)) * 0.9 * (1 - seg(t, 0.94, 1)));
      var sc = lerp(1, 3, ease(seg(t, 0.55, 0.85))), k = 0.5, a = add(Qp, sU, k), b = add(a, sG, k * sc); // score 的 1 單位畫成 0.5
      set(W.cA, 'd', arrowD(Qp, a)); set(W.cB, 'd', arrowD(a, b)); set(W.cS, 'd', arrowD(Qp, b));
      show(W.cA, seg(t, 0.2, 0.3)); show(W.cB, seg(t, 0.32, 0.42)); show(W.cS, seg(t, 0.44, 0.52));
      set(W.cAt, 'x', X(a[0]) + 10); set(W.cAt, 'y', Y(a[1]) + 18); show(W.cAt, seg(t, 0.2, 0.3));
      text(W.cBt, fmt(sc, 1) + ' × ∇log p(貓 | x_t)');
      set(W.cBt, 'x', X(b[0]) + 10); set(W.cBt, 'y', Y(b[1]) + 30); set(W.cBt, 'class', 't-h'); show(W.cBt, seg(t, 0.32, 0.42));
      var m = [(Qp[0] + b[0]) / 2, (Qp[1] + b[1]) / 2];
      set(W.cSt, 'x', X(m[0])); set(W.cSt, 'y', Y(m[1]) - 14); set(W.cSt, 'class', 't-b mid'); show(W.cSt, seg(t, 0.44, 0.52));
      text(W.cEq2, sc > 1.05 ? 's = ' + fmt(sc, 1) + '：classifier 那一項放大，往貓推得更用力' : 's = 1：就是條件模型本身');
      live.classifier = [['t', fmt(QT, 1)], ['p(貓 | x_t)', fmt(qPost[0], 2), 'hl'], ['p(狗 | x_t)', fmt(qPost[1], 2)], ['|∇log p(x_t)|', fmt(len(sU), 2)], ['|∇log p(貓 | x_t)|', fmt(len(sG), 2)], ['s', fmt(sc, 1), 'hl']];
    },
    dropout: function (t) {
      var n = 0;
      W.cards.forEach(function (c, i) {
        var a = 0.05 + i * 0.04;
        show(c.g, ease(seg(t, a, a + 0.05)));
        if (t >= a) n = i + 1;
        if (c.drop) { var k = ease(seg(t, a + 0.06, a + 0.1)); show(c.drop, k); show(c.pr, 1 - k); }
      });
      draw(W.trainWire, ease(seg(t, 0.1, 0.5)));
      var dropped = W.cards.slice(0, n).filter(function (c, i) { return c.drop && t >= 0.05 + i * 0.04 + 0.06; }).length;
      text(W.trainTx, n ? dropped + ' / ' + n + ' 筆沒有 prompt' : '');
      show(W.inf, ease(seg(t, 0.56, 0.7)));
      live.dropout = [['這一批', n + ' 筆'], ['換成 ∅', dropped + ' 筆', 'hl'], ['論文試過的 p_uncond', '0.1、0.2'], ['∅ 是什麼', '空 prompt 的 embedding'], ['每步 forward', t > 0.56 ? '2 次' : '—', 'hl']];
    },
    formula: function (t) {
      var on = ease(seg(t, 0.04, 0.14)) * (1 - seg(t, 0.95, 1));
      show(W.fm, on);
      var w = t < 0.3 ? 0 : t < 0.42 ? ease(seg(t, 0.3, 0.42)) : t < 0.5 ? 1 : t < 0.64 ? lerp(1, 3, ease(seg(t, 0.5, 0.64))) : t < 0.7 ? 3 : lerp(3, 7, ease(seg(t, 0.7, 0.86)));
      var G = add(qU.x0, qD, w);
      set(W.fG, 'd', arrowD(Qp, G)); show(W.fG, seg(t, 0.24, 0.3));
      set(W.fDot, 'cx', X(G[0])); set(W.fDot, 'cy', Y(G[1])); show(W.fDot, seg(t, 0.24, 0.3));
      set(W.fDotT, 'x', X(G[0])); set(W.fDotT, 'y', Y(G[1]) - 16); text(W.fDotT, 'w = ' + fmt(w, 1)); show(W.fDotT, seg(t, 0.24, 0.3));
      show(W.fU, seg(t, 0.12, 0.18)); show(W.fC, seg(t, 0.17, 0.23));
      W.fTicks.forEach(function (g) { show(g, seg(t, 0.24, 0.3)); });
      show(W.fLine, seg(t, 0.24, 0.3)); show(W.fNote, seg(t, 0.86, 0.92));
      var inside = CF.density(G[0], G[1]) >= CF.OFF;
      live.formula = [['w', fmt(w, 2), 'hl'], ['x̂₀(∅)', pt(qU.x0)], ['x̂₀(貓)', pt(qC.x0)], ['x̂₀(guided)', pt(G), 'hl'], ['在資料範圍內', inside ? '是' : '否', inside ? '' : 'ng'], ['ε_c − ε_∅ ∥ ∇log p(貓 | x_t)', '同方向']];
    },
    sweep: function (t) {
      var w = q05(sweepW(t)), s = statsFor({ cond: 0, w: w });
      W.cur.forEach(function (c, i) { set(c, 'cx', chX(w)); set(c, 'cy', chY([s.post[0], s.spread / base.spread, s.off][i])); });
      set(W.cursor, 'x1', chX(w)); set(W.cursor, 'x2', chX(w));
      live.sweep = [['w', fmt(w, 2), 'hl']].concat(statRows(s, 0));
    },
    cost: function (t) {
      var u = ease(seg(t, 0.15, 0.85));
      W.cost.forEach(function (c) {
        var n = Math.round(u * c.n);
        c.blocks.forEach(function (b, i) { show(b, i < n ? 1 : 0); });
        text(c.tx, n + ' 次');
      });
      var at = function (i) { return Math.round(u * W.cost[i].n) + ' / ' + W.cost[i].n; };
      live.cost = [['SD 3.5 Large', at(0)], ['Ideogram 4', at(1)], ['FLUX.1 [dev]', at(2), 'hl'], ['SD 3.5 Large Turbo', at(3), 'hl'], ['CFG 的額外成本', '每步 ×2']];
    },
    fixes: function (t) {
      var on = 0;
      if (t >= 0.13 && t < 0.5) on = 0; else if (t >= 0.5 && t < 0.88) on = 1; else if (t >= 0.88) on = 2; else on = -1;
      W.fixCards.forEach(function (c, i) { set(c, 'class', i === on ? 'card-h' : 'card'); });
      var nk = ease(seg(t, 0.15, 0.25)) * (1 - ease(seg(t, 0.48, 0.55)));
      show(W.negRing, nk); show(W.negTx, nk);
      var cfg = planeCfg('fixes', t), s = statsFor(cfg.show);
      live.fixes = [['設定', cfg.show === SP.neg ? 'neg = 狗 · w 1.5' : cfg.show === SP.iv ? 'w 7 · 只開一段' : cfg.show === SP.w7 ? 'w 7 · 全程' : 'w 1.5 · ∅'], ['落在貓的比例', pct(s.split[0]), 'hl'], ['平均 p(狗 | x)', fmt(s.post[1], 3)], ['散布（相對 w = 0）', pct(s.spread / base.spread)], ['衝出資料範圍', pct(s.off), s.off > 0.05 ? 'ng' : '']];
    }
  };
  // 跨段的東西：曲線圖從 sweep 開始、到 fixes 換成三張卡
  function renderShared(t) {
    var cards = ease(seg(t.fixes, 0, 0.1));
    show(W.chart, ease(seg(t.sweep, 0, 0.1)) * (1 - cards));
    show(W.fixes, cards);
  }

  // ---- 說明欄 ----
  var caps = {};
  [].forEach.call(root.querySelectorAll('[data-cap]'), function (c) { caps[c.getAttribute('data-cap')] = c; });
  var statusEl = root.querySelector('[data-status]'), factsEl = root.querySelector('[data-facts]');
  var stopBtns = [].slice.call(root.querySelectorAll('[data-stop]'));
  var FACTS = {
    intro: [['資料', '2 維 · 3 類'], ['每一類', '2 個高斯'], ['軌跡', NT + ' 條 · ' + CF.STEPS + ' 步 Euler'], ['無條件落在 貓 · 狗 · 車', base.split.map(pct).join(' · '), 'hl']]
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
    var t = {}, beat = beatAt(p);
    BEATS.forEach(function (b) {
      var k = b[0];
      t[k] = localT(k, p);
      if (!force && lastT[k] === t[k]) return;
      lastT[k] = t[k];
      R[k](t[k]);
    });
    force = false;
    renderShared(t);
    renderPlane(planeCfg(beat, t[beat]));
    renderCamera(camera(p));
    renderPanel(beat, p);
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
    var FULL_MS = 48000, raf = 0, p0 = 0, t0 = 0, setY = 0, shown = '';
    function range() { return [trackTop(), track.offsetHeight - stage.offsetHeight]; }
    function tick(ts) {
      if (!t0) t0 = ts;
      if (Math.abs(window.scrollY - setY) > 2) return stop(); // 捲動位置被別的東西改掉
      var p = Math.min(1, p0 + (ts - t0) / FULL_MS), r = range();
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
