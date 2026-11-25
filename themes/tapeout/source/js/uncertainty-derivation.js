/* /lab/uncertainty-derivation/ — Shankar §9.2–9.3, one equation at a time (engine: mathwalk.js).
   The equations are KaTeX rendered at build time in the layout; every number on the stage is computed here
   at load: three test states integrated on a grid, the ODE of §9.3 stepped with RK4, and the phase of c swept. */
(function () {
  'use strict';
  if (!window.MathWalk || !document.querySelector('[data-mw]')) return;

  // ---------- physics, ħ = 1 ----------
  var XB = 0.8, PB = 1.2, SG = 0.7, KA = 0.8;
  var H = 0.002, LIM = 12, N = Math.round(2 * LIM / H) + 1;

  // grid integrals of one normalised state: ⟨X⟩, ⟨P⟩, (ΔX)², (ΔP)², ⟨X̃ψ|P̃ψ⟩ = a + ib
  function measure(f) {
    var re = new Float64Array(N), im = new Float64Array(N), i, x, v, n = 0;
    for (i = 0; i < N; i++) { v = f(-LIM + i * H); re[i] = v[0]; im[i] = v[1]; n += (v[0] * v[0] + v[1] * v[1]) * H; }
    n = Math.sqrt(n);
    for (i = 0; i < N; i++) { re[i] /= n; im[i] /= n; }
    function d(a, j) { return j === 0 || j === N - 1 ? 0 : (a[j + 1] - a[j - 1]) / (2 * H); }
    var mx = 0, mp = 0;
    for (i = 0; i < N; i++) { x = -LIM + i * H; mx += x * (re[i] * re[i] + im[i] * im[i]) * H; mp += (re[i] * d(im, i) - im[i] * d(re, i)) * H; }
    var dx2 = 0, dp2 = 0, a = 0, b = 0;
    for (i = 0; i < N; i++) {
      x = -LIM + i * H;
      var xr = (x - mx) * re[i], xi = (x - mx) * im[i];            // X̃ψ
      var pr = d(im, i) - mp * re[i], pi = -d(re, i) - mp * im[i];  // P̃ψ = −iψ′ − ⟨P⟩ψ
      dx2 += (xr * xr + xi * xi) * H; dp2 += (pr * pr + pi * pi) * H;
      a += (xr * pr + xi * pi) * H; b += (xr * pi - xi * pr) * H;
    }
    var prod = dx2 * dp2, sch = a * a + b * b;
    return { mx: mx, mp: mp, dx2: dx2, dp2: dp2, prod: prod, a: a, b: b, a2: a * a, b2: b * b, sch: sch, dxdp: Math.sqrt(prod), cos2: sch / prod };
  }
  function gaussChirp(k) {
    return function (x) { var u = x - XB, A = Math.exp(-u * u / (4 * SG * SG)), ph = PB * x + k * u * u / 2; return [A * Math.cos(ph), A * Math.sin(ph)]; };
  }
  var STATES = [
    { id: 'gauss', name: '高斯', f: gaussChirp(0) },
    { id: 'chirp', name: 'chirp 高斯', f: gaussChirp(KA) },
    { id: 'ho1', name: '諧振子 |1⟩', f: function (x) { var u = x - XB, A = u * Math.exp(-u * u / 2), ph = PB * x; return [A * Math.cos(ph), A * Math.sin(ph)]; } }
  ];
  STATES.forEach(function (S) { S.m = measure(S.f); });
  var CH = STATES[1].m;   // the running example of the single-equation steps

  // the board rows that carry a number, and what each one is for a state
  var VROWS = [3, 4, 6, 7, 8];
  function rowVal(m, row) { return { 3: m.prod, 4: m.sch, 6: m.a2 + m.b2, 7: m.b2, 8: m.dxdp }[row]; }
  function lost(m, row) { return (row === 4 && m.sch < m.prod - 1e-3) || (row === 7 && m.b2 < m.a2 + m.b2 - 1e-3); }

  // trace "run": the derivation as a function of ψ — three inputs, rows 3…8 each
  var run = [];
  STATES.forEach(function (S, si) { VROWS.forEach(function (row) { run.push({ vars: { s: si, row: row } }); }); });

  // trace "ode": condition ① alone, (P − ⟨P⟩)ψ = c(X − ⟨X⟩)ψ, i.e. ψ′ = i[⟨P⟩ + c(x − ⟨X⟩)]ψ, stepped out from ⟨X⟩
  var C = { re: KA, im: 1 / (2 * SG * SG) }, PSI0 = Math.pow(2 * Math.PI * SG * SG, -0.25);
  function rhs(x, p) {
    var wr = PB + C.re * (x - XB), wi = C.im * (x - XB);
    return [-(wr * p[1] + wi * p[0]), wr * p[0] - wi * p[1]];
  }
  function rk4(x, p, h) {
    var k1 = rhs(x, p), k2 = rhs(x + h / 2, [p[0] + h / 2 * k1[0], p[1] + h / 2 * k1[1]]);
    var k3 = rhs(x + h / 2, [p[0] + h / 2 * k2[0], p[1] + h / 2 * k2[1]]), k4 = rhs(x + h, [p[0] + h * k3[0], p[1] + h * k3[1]]);
    return [p[0] + h / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), p[1] + h / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
  }
  var ODE_DX = 0.02, ODE_N = 135, ODE_EVERY = 5, odeR = [[PSI0, 0]], odeL = [[PSI0, 0]];
  for (var k = 1; k <= ODE_N; k++) {
    odeR.push(rk4(XB + (k - 1) * ODE_DX, odeR[k - 1], ODE_DX));
    odeL.push(rk4(XB - (k - 1) * ODE_DX, odeL[k - 1], -ODE_DX));
  }
  function closed(u) { var A = PSI0 * Math.exp(-C.im * u * u / 2), ph = PB * u + C.re * u * u / 2; return [A * Math.cos(ph), A * Math.sin(ph)]; }
  var ode = [];
  for (k = 0; k <= ODE_N; k += ODE_EVERY) ode.push({ vars: { k: k } });
  ode.push({ vars: { k: ODE_N, done: 1 } });
  var odeErr = 0;
  for (k = 0; k <= ODE_N; k++) {
    var cf = closed(k * ODE_DX);
    odeErr = Math.max(odeErr, Math.hypot(odeR[k][0] - cf[0], odeR[k][1] - cf[1]));
  }

  // trace "alpha": c = |c| e^{iα}; condition ② asks ⟨[X̃, P̃]₊⟩ = 2 Re c ⟨X̃²⟩ = cot α to vanish
  var CABS = 1 / (2 * SG * SG), alpha = [];
  for (var deg = 10; deg <= 170; deg += 10) {
    var r = deg * Math.PI / 180, cre = CABS * Math.cos(r), cim = CABS * Math.sin(r), x2 = 1 / (2 * cim);
    alpha.push({ vars: { deg: deg, cre: cre, cim: cim, x2: x2, anti: 2 * cre * x2, dxdp: 1 / (2 * Math.sin(r)) } });
  }

  // ---------- formatting ----------
  function f3(v) { var s = (Math.round(v * 1000) / 1000).toFixed(3); return minus(s === '-0.000' ? '0.000' : s); }
  function f2(v) { var s = (Math.round(v * 100) / 100).toFixed(2); return minus(s === '-0.00' ? '0.00' : s); }
  function cpx(a, b) { return f3(a) + (b < 0 ? ' − ' : ' + ') + f3(Math.abs(b)) + ' i'; }
  function minus(s) { return String(s).replace(/^-/, '−'); }
  function num(s) { return '<span class="num">' + s + '</span>'; }

  // ---------- chapters & steps ----------
  var chapters = [
    { id: 'map', n: '00', name: '概觀' },
    { id: 'def', n: '01', name: '定義', rows: [1, 2] },
    { id: 'schwarz', n: '02', name: 'Schwarz', rows: [3, 4] },
    { id: 'split', n: '03', name: '拆實虛', rows: [5, 8] },
    { id: 'run', n: '04', name: '代入三個 ψ', rows: [3, 8] },
    { id: 'min', n: '05', name: '最小波包', rows: [9, 13] },
    { id: 'end', n: '06', name: '回顧' }
  ];
  var COLW = 92, LEFT = [132, 44], TOP = [40, 40];
  var steps = [
    { id: 'overview', ch: 'map', board: { mode: 'overview', rows: [1, 13], left: LEFT, top: [8, 8] }, h: 1.4 },
    { id: 'tilde', ch: 'def', eq: 'def', hot: ['Ot'], notes: [['Ot', '#n-Ot'], ['avg', '只是一個數']], fig: 'shift', h: 1.2 },
    { id: 'delta', ch: 'def', eq: 'var', from: 'def', say: '用它定義不確定量', zoom: 'bk', zfrac: 0.46,
      notes: [['bra', '#n-bra'], ['op', '#n-op'], ['ket', '#n-ket']], fig: 'braket', h: 1.3 },
    { id: 'norm', ch: 'schwarz', eq: 'norm', from: 'var', say: '平方拆成兩個，左邊那個搬進 bra', hot: ['a', 'b'], notes: [['nrm', '#n-nrm', 'hot']], fig: 'norm', h: 1.3 },
    { id: 'schwarz', ch: 'schwarz', eq: 'sch', from: 'norm', say: '兩個長度平方相乘', hot: ['ge'],
      notes: [['len', '長度² × 長度²'], ['inr', '內積的絕對值平方']], fig: 'vec', h: 1.3 },
    { id: 'split', ch: 'split', eq: 'split', from: 'sch', say: '內積寫回期望值，再拆成兩半', hot: ['im'], hot2: ['re'],
      notes: [['re', '實數 a = ' + f3(CH.a), 'hot2'], ['im', '純虛數 ib = ' + f3(CH.b) + ' i', 'hot']], fig: 'cplx', figMode: 'split', h: 1.3 },
    { id: 'comm', ch: 'split', eq: 'comm', from: 'split', say: '只看對易子那一半', hot: ['ct'],
      notes: [['ct', '平均值拿掉了'], ['ig', '跟 ψ 無關']], fig: 'expand', h: 1.3 },
    { id: 'pyth', ch: 'split', eq: 'pyth', from: 'comm', say: '代回 Schwarz 的右邊', hot: ['b', 'b2'], hot2: ['a', 'a2'],
      notes: [['a2', 'a² = ' + f3(CH.a2), 'hot2'], ['b2', 'b² = ' + f3(CH.b2), 'hot']], fig: 'cplx', figMode: 'pyth', h: 1.3 },
    { id: 'drop', ch: 'split', eq: 'drop', from: 'pyth', say: 'a² ≥ 0，丟掉它', hot: ['xp'],
      notes: [['b2', '跟 ψ 無關'], ['xp', '測不準關係', 'hot']], fig: 'cplx', figMode: 'drop', h: 1.3 },
    { id: 'run', ch: 'run', board: { mode: 'run', rows: [3, 8], left: LEFT, top: TOP, right: [3 * COLW + 30, COLW + 24], rrows: [3, 8] },
      scrub: { trace: 'run' }, h: 3.4 },
    { id: 'cond', ch: 'min', eq: 'cond', notes: [['c1', '① 兩個向量平行'], ['c2', '② 丟掉的實部是 0']], fig: 'cond', h: 1.3 },
    { id: 'ode', ch: 'min', eq: 'ode', from: 'cond', say: '① 寫在 X 基底', hot: ['p'],
      notes: [['p', 'P 在 X 基底', 'hot'], ['x', 'X 就是乘上 x']], fig: 'ode', scrub: { trace: 'ode' }, h: 2.6 },
    { id: 'sol', ch: 'min', eq: 'sol', from: 'ode', say: '積分', hot: ['env'],
      notes: [['wave', '平面波，帶著 ⟨P⟩'], ['env', 'c 決定包絡和 chirp', 'hot']], fig: 'ode', figEvent: ode.length - 1, h: 1.3 },
    { id: 'phase', ch: 'min', eq: 'phase', from: 'sol', say: '把 ① 代進 ②', hot: ['cc'],
      notes: [['cc', function (st) { var v = st.ev ? st.ev.vars : alpha[0].vars; return '2 Re c = ' + num(f3(2 * v.cre)); }, 'hot'], ['res', '唯一的解']],
      fig: 'alpha', scrub: { trace: 'alpha' }, h: 2.4 },
    { id: 'gauss', ch: 'min', eq: 'gauss', from: 'phase', say: 'c = i|c| 代回去', hot: ['env'],
      notes: [['env', '高斯包絡，ΔX = ' + f2(SG), 'hot']], fig: 'alpha', figMode: 'final', h: 1.3 },
    { id: 'end', ch: 'end', board: { mode: 'end', rows: [1, 13], left: LEFT, top: [8, 8], right: [3 * COLW + 30, 0], rrows: [3, 8] }, h: 1.3 }
  ];

  // ---------- the board: chapter brackets on the left, the three states' numbers on the right ----------
  function boardDecor(api) {
    var B = api.board, L = B.layer, groups = [], cells = [], heads = [], band = api.div('ud-band', L);
    chapters.forEach(function (c) {
      if (!c.rows || c.id === 'run') return;
      var g = api.div('ud-grp', L);
      g.innerHTML = '<span class="ud-gn">' + c.n + '</span><span class="ud-gl">' + api.esc(c.name) + '</span>';
      groups.push({ c: c, el: g });
    });
    STATES.forEach(function (S, si) {
      heads.push(api.div('ud-head', L)); api.txt(heads[si], S.name);
      VROWS.forEach(function (row) {
        var e = api.div('ud-cell', L);
        api.txt(e, f3(rowVal(S.m, row)));
        cells.push({ s: si, row: row, el: e, loss: lost(S.m, row) });
      });
    });
    function box(n) { return B.rows['r' + n]; }
    function colsX() { var x = 0; for (var n = 3; n <= 8; n++) if (box(n)) x = Math.max(x, box(n).x + box(n).w); return x + 34; }
    function px(e, x, y) { api.sty(e, 'transform', 'translate(' + Math.round(x * 10) / 10 + 'px,' + Math.round(y * 10) / 10 + 'px)'); }
    return { set: function (st) {
      var mode = st.cfg.board.mode, narrow = st.narrow, t = st.t, x0 = colsX();
      // which rows are lit: the overview walks the chapters in order; hovering a chapter chip lights its rows
      var lit = null;
      if (mode === 'overview') {
        var gi = Math.min(groups.length - 1, Math.floor((t - 0.12) / (0.7 / groups.length)));
        if (t > 0.12 && t < 0.86) lit = groups[gi].c.rows;
      }
      if (st.hover) chapters.forEach(function (c) { if (c.id === st.hover && c.rows) lit = c.rows; });
      var ev = st.ev, frac = st.frac || 0, cur = mode === 'run' && ev ? ev.vars : null;
      // run: only rows 3–8 take part, the rest of the board nearly disappears
      var span = mode === 'run' ? st.cfg.board.rows : null;
      function out(a, b) { return !!span && (b < span[0] || a > span[1]); }
      for (var n = 1; n <= 13; n++) {
        var dim = lit ? n < lit[0] || n > lit[1] : false, o = out(n, n);
        (B.spans['r' + n] || []).forEach(function (sp) { api.cls(sp, 'is-dim', dim); api.cls(sp, 'is-out', o); });
      }
      groups.forEach(function (g) {
        var a = box(g.c.rows[0]), b = box(g.c.rows[1]);
        px(g.el, -(narrow ? LEFT[1] : LEFT[0]), a.y);
        api.sty(g.el, 'height', Math.round(b.y + b.h - a.y) + 'px');
        api.cls(g.el, 'is-hot', !!lit && lit[0] === g.c.rows[0] && lit[1] === g.c.rows[1]);
        api.cls(g.el, 'is-dim', !!lit && !(lit[0] === g.c.rows[0] && lit[1] === g.c.rows[1]));
        api.cls(g.el, 'is-out', out(g.c.rows[0], g.c.rows[1]));
        api.cls(g.el, 'is-narrow', narrow);
      });
      // value columns: run fills them in trace order (narrow: only the current state's column); end shows them all
      var showCols = mode === 'run' || (mode === 'end' && !narrow);
      var shownS = cur ? cur.s : -1;
      heads.forEach(function (h, si) {
        var col = narrow ? 0 : si, on = showCols && (!narrow || si === shownS);
        px(h, x0 + col * COLW, box(3).y - 30);
        api.sop(h, on ? (mode === 'run' && si > shownS ? 0.35 : 1) : 0);
        api.cls(h, 'is-hot', mode === 'run' && si === shownS);
      });
      cells.forEach(function (c) {
        var b = box(c.row), col = narrow ? 0 : c.s, done = mode === 'end' || (cur && (c.s < cur.s || (c.s === cur.s && VROWS.indexOf(c.row) <= VROWS.indexOf(cur.row))));
        px(c.el, x0 + col * COLW, b.y + b.h / 2 - 11);
        api.sop(c.el, showCols && done && (!narrow || c.s === shownS) ? 1 : 0);
        api.cls(c.el, 'is-loss', c.loss);
        api.cls(c.el, 'is-now', !!cur && c.s === cur.s && c.row === cur.row);
      });
      // the cursor band glides to the next row over the second half of an event
      if (cur) {
        var nx = st.next ? st.next.vars : cur, a1 = box(cur.row), a2 = nx.s === cur.s ? box(nx.row) : a1, kk = api.ease(api.seg(frac, 0.55, 1));
        var y = api.lerp(a1.y, a2.y, kk) - 4, hgt = api.lerp(a1.h, a2.h, kk) + 8;
        px(band, -14, y); api.sty(band, 'height', Math.round(hgt) + 'px');
        api.sty(band, 'width', Math.round(x0 + (narrow ? 1 : 3) * COLW + 14) + 'px');
        api.sop(band, api.seg(t, 0.05, 0.12));
      } else api.sop(band, 0);
    } };
  }

  // ---------- figure helpers ----------
  var W = 600, HH = 270;
  function M(api, g, x, y, s, cls, anchor) { return api.T(g, x, y, s, 'mx' + (cls ? ' ' + cls : ''), anchor); }
  function curve(f, a, b, n, X, Y) {
    var d = '';
    for (var i = 0; i <= n; i++) { var u = a + (b - a) * i / n; d += (i ? 'L' : 'M') + X(u).toFixed(1) + ' ' + Y(f(u)).toFixed(1); }
    return d;
  }
  function band(f, a, b, n, X, Y, y0) {   // closed area between f and the baseline y0
    if (b <= a) return 'M0 0';
    return curve(f, a, b, n, X, Y) + 'L' + X(b).toFixed(1) + ' ' + y0 + 'L' + X(a).toFixed(1) + ' ' + y0 + 'Z';
  }
  function gauss(u, v) { return Math.exp(-u * u / (2 * v)) / Math.sqrt(2 * Math.PI * v); }
  function widthOf(t) { try { return t.getComputedTextLength(); } catch (e) { return 0; } }
  function glide(api, st, read) {   // the value slides to the next event's over the second half of the step
    var a = read(st.ev), b = read(st.next);
    return a == null || b == null ? a : api.lerp(a, b, api.ease(api.seg(st.frac, 0.55, 1)));
  }

  var figs = {
    // Ω̃ = Ω − ⟨Ω⟩: the same distribution, slid so its mean sits at 0
    shift: { title: 'Fig · 減掉平均值 = 整個平移', make: function (api) {
      var s = api.svg('shift', W, HH), g = api.el('g', {}, s);
      var x0 = -2.4, x1 = 3.4, Y0 = 220, peak = gauss(0, SG * SG), sy = 128 / peak;
      function X(x) { return 30 + (x - x0) / (x1 - x0) * 540; }
      function Y(v) { return Y0 - v * sy; }
      api.P(g, 'M20 ' + Y0 + 'H584', 'axis');
      for (var t = -2; t <= 3; t++) { api.P(g, 'M' + X(t) + ' ' + Y0 + 'v5', 'axis'); api.T(g, X(t), Y0 + 20, minus(t), 'lab', 'middle'); }
      api.T(g, 584, Y0 + 20, 'x', 'lab', 'end');
      M(api, g, 20, 30, '|ψ(x)|²', 'sm');
      api.P(g, curve(function (x) { return gauss(x - XB, SG * SG); }, x0, x1, 120, X, Y), 'curve ghost');
      var area = api.P(g, 'M0 0', 'area-a'), live = api.P(g, 'M0 0', 'curve-a');
      var mean = api.P(g, 'M0 0', 'mean'), meanT = M(api, g, 0, 64, '', 'sm hl', 'middle');
      var br = api.P(g, 'M0 0', 'brk'), brT = M(api, g, 0, 0, '±ΔX = ' + f2(SG), 'sm', 'middle');
      var arrow = api.P(g, 'M0 0', 'wire is-on', 'shift');
      var note = api.T(g, 584, 30, '', 'lab', 'end');
      return { node: s, set: function (st) {
        var k = api.ease(api.seg(st.t, 0.32, 0.78)), m = api.lerp(XB, 0, k), hy = Y(gauss(SG, SG * SG));
        api.set(live, 'd', curve(function (x) { return gauss(x - m, SG * SG); }, x0, x1, 120, X, Y));
        api.set(area, 'd', band(function (x) { return gauss(x - m, SG * SG); }, x0, x1, 120, X, Y, Y0));
        api.set(mean, 'd', 'M' + X(m).toFixed(1) + ' 72V' + Y0);
        api.set(meanT, 'x', X(m).toFixed(1));
        api.txt(meanT, k < 0.5 ? '⟨X⟩ = ' + f2(m) : '⟨X̃⟩ = ' + f2(m));
        api.set(br, 'd', 'M' + X(m - SG).toFixed(1) + ' ' + (hy - 6).toFixed(1) + 'v6H' + X(m + SG).toFixed(1) + 'v-6');
        api.set(brT, 'x', X(m).toFixed(1)); api.set(brT, 'y', (hy + 18).toFixed(1));
        api.op(arrow, k > 0.02 && k < 0.98 ? 1 : 0);
        api.set(arrow, 'd', 'M' + X(XB).toFixed(1) + ' 96H' + (X(m) + 8).toFixed(1));
        api.txt(note, k < 0.5 ? '平均值 ⟨X⟩ = ' + f2(XB) : '往左平移 ' + f2(XB) + '，寬度不變');
      } };
    } },

    // ⟨ψ|Ω̃²|ψ⟩ read as an integral; the area under ψ*(x−⟨X⟩)²ψ accumulates to (ΔX)²
    braket: { title: 'Fig · 三塊乘起來積分', make: function (api) {
      var s = api.svg('braket', W, HH), g = api.el('g', {}, s);
      var x0 = XB - 3.2, x1 = XB + 3.2, Y0 = 236, v = SG * SG, sy = 150 / gauss(0, v);
      function X(x) { return 30 + (x - x0) / (x1 - x0) * 540; }
      function Y(y) { return Y0 - y * sy; }
      function integrand(x) { return gauss(x - XB, v) * (x - XB) * (x - XB); }
      var cum = [0], n = 320;
      for (var i = 1; i <= n; i++) {
        var a = x0 + (x1 - x0) * (i - 1) / n, b = x0 + (x1 - x0) * i / n;
        cum.push(cum[i - 1] + (integrand(a) + integrand(b)) / 2 * (b - a));
      }
      api.P(g, 'M20 ' + Y0 + 'H584', 'axis');
      M(api, g, 20, 30, '∫ ψ*(x) (x − ⟨X⟩)² ψ(x) dx', 'md');
      var dens = api.P(g, curve(function (x) { return gauss(x - XB, v); }, x0, x1, 160, X, Y), 'curve ghost');
      var pa = Math.sqrt((Y0 - 70) / 30), para = api.P(g, curve(function (x) { return (x - XB) * (x - XB); }, XB - pa, XB + pa, 120, X, function (y) { return Y0 - y * 30; }), 'curve thin');
      var area = api.P(g, 'M0 0', 'area-a'), edge = api.P(g, 'M0 0', 'curve-a');
      var cur = api.P(g, 'M0 0', 'mean'), val = M(api, g, 584, 30, '', 'md', 'end');
      api.T(g, 20, 258, '虛線 |ψ|²　細線 (x − ⟨X⟩)²　橘色 兩者相乘', 'lab');
      return { node: s, set: function (st) {
        var k = api.ease(api.seg(st.t, 0.36, 0.86)), xc = api.lerp(x0, x1, k), j = Math.round(k * n);
        api.op(dens, api.seg(st.t, 0.2, 0.3)); api.op(para, api.seg(st.t, 0.26, 0.36));
        api.set(area, 'd', band(integrand, x0, xc, 160, X, Y, Y0));
        api.set(edge, 'd', k > 0 ? curve(integrand, x0, xc, 160, X, Y) : 'M0 0');
        api.op(cur, k > 0 && k < 1 ? 1 : 0); api.set(cur, 'd', 'M' + X(xc).toFixed(1) + ' 60V' + Y0);
        api.op(val, api.seg(st.t, 0.36, 0.4));
        api.txt(val, k >= 1 ? '= (ΔX)² = ' + f3(CH.dx2) : '= ' + f3(cum[j]) + ' …');
        api.cls(val, 'hl', k >= 1);
      } };
    } },

    // ⟨ψ|Ω̃Ω̃|ψ⟩: the left Ω̃ hops into the bra — a squared length
    norm: { title: 'Fig · 把一個 Ω̃ 搬到左邊', make: function (api) {
      var s = api.svg('norm', W, 200), g = api.el('g', {}, s), Y = 96;
      var PIECES = [['⟨', 0, 0], ['ψ', 1, 2], ['|', 2, 3], ['Ω̃', 3, 1, 1], ['Ω̃', 4, 4], ['|', 5, -1], ['ψ', 6, 5], ['⟩', 7, 6]];
      var els = PIECES.map(function (p) { return M(api, g, 0, Y, p[0], 'big' + (p[3] ? ' hl' : ''), 'middle'); });
      var ws = els.map(widthOf);
      function layout(order) {
        var pos = [], x = 70, seq = PIECES.map(function (p, i) { return [p[order], i]; }).filter(function (q) { return q[0] >= 0; });
        seq.sort(function (a, b) { return a[0] - b[0]; });
        seq.forEach(function (q) { pos[q[1]] = x + ws[q[1]] / 2; x += ws[q[1]] + 2; });
        return pos;
      }
      var A = layout(1), B = layout(2);
      B[5] = (B[4] + B[6]) / 2;   // the second bar has nowhere to go: it fades where the kets meet
      var rest = M(api, g, 0, Y, '= ‖Ω̃ψ‖²', 'big'), sub = api.T(g, 70, 156, '', 'lab');
      return { node: s, set: function (st) {
        var k = api.ease(api.seg(st.t, 0.3, 0.62));
        els.forEach(function (e, i) {
          api.set(e, 'x', api.lerp(A[i], B[i], k).toFixed(1));
          api.set(e, 'y', (Y - (PIECES[i][3] ? 40 * Math.sin(Math.PI * k) : 0)).toFixed(1));
          if (i === 5) api.op(e, 1 - k);
        });
        api.set(rest, 'x', (B[7] + ws[7] / 2 + 14).toFixed(1)); api.op(rest, api.seg(st.t, 0.64, 0.72));
        api.txt(sub, k < 0.5 ? 'Ω̃ 是 Hermitian：⟨ψ|Ω̃ 就是 Ω̃|ψ⟩ 這個向量的 bra' : '向量 Ω̃|ψ⟩ 和自己的內積：長度的平方');
      } };
    } },

    // Schwarz: |⟨u|v⟩| = ‖u‖‖v‖ cos θ — strict for |1⟩, equality for the (parallel) chirped Gaussian
    vec: { title: 'Fig · 內積 ≤ 長度相乘', make: function (api) {
      var s = api.svg('vec', W, HH), g = api.el('g', {}, s), SC = 100;
      function panel(x0, S, th, title) {
        var gg = api.el('g', {}, g), O = [x0 + 20, 168], lu = Math.sqrt(S.m.dx2) * SC, lv = Math.sqrt(S.m.dp2) * SC, du = th > 0.01 ? 0 : 5;
        var vx = O[0] + lv * Math.cos(th), vy = O[1] - lv * Math.sin(th), px = O[0] + lv * Math.cos(th);
        api.T(gg, x0, 24, title, 'lab');
        api.P(gg, 'M' + O[0] + ' ' + (O[1] + du) + 'H' + (O[0] + lu), 'vec va');
        api.P(gg, 'M' + O[0] + ' ' + (O[1] - du) + 'L' + vx.toFixed(1) + ' ' + (vy - du).toFixed(1), 'vec vb');
        if (th > 0.01) {
          api.P(gg, 'M' + vx.toFixed(1) + ' ' + vy.toFixed(1) + 'V' + O[1], 'guide');
          api.P(gg, 'M' + (O[0] + 34) + ' ' + O[1] + 'A34 34 0 0 0 ' + (O[0] + 34 * Math.cos(th)).toFixed(1) + ' ' + (O[1] - 34 * Math.sin(th)).toFixed(1), 'arc');
          M(api, gg, O[0] + 44, O[1] - 14, 'θ = ' + (th * 180 / Math.PI).toFixed(1) + '°', 'sm');
        }
        M(api, gg, O[0] + lu, O[1] + du + 20, 'X̃ψ', 'sm hl', 'end');
        M(api, gg, vx + 8, vy - du + (th > 0.01 ? -4 : 0), 'P̃ψ', 'sm c2');
        var nums = api.el('g', {}, gg);
        M(api, nums, x0, 222, '長度相乘 ' + f3(S.m.prod) + '　內積 ' + f3(S.m.sch), 'sm');
        M(api, nums, x0, 246, 'cos²θ = ' + f3(S.m.cos2), 'sm hl');
        return { g: gg, nums: nums };
      }
      var A = panel(20, STATES[2], Math.acos(Math.sqrt(STATES[2].m.cos2)), '諧振子 |1⟩：夾角大，丟掉很多');
      var B = panel(320, STATES[1], 0, 'chirp 高斯：兩個向量平行');
      return { node: s, set: function (st) {
        [A, B].forEach(function (p, i) {
          api.op(p.g, api.seg(st.t, 0.12 + i * 0.3, 0.2 + i * 0.3));
          api.op(p.nums, api.seg(st.t, 0.24 + i * 0.3, 0.32 + i * 0.3));
        });
      } };
    } },

    // complex plane: z = ⟨X̃P̃⟩ = a + ib, its real/imaginary halves, then a² + b² and dropping a²
    cplx: { title: 'Fig · ⟨X̃P̃⟩ 在複數平面上', make: function (api) {
      var s = api.svg('cplx', W, HH), g = api.el('g', {}, s), O = [104, 172], SC = 200;
      var a = CH.a, b = CH.b, zx = O[0] + a * SC, zy = O[1] - b * SC, zsy = O[1] + b * SC;
      api.P(g, 'M20 ' + O[1] + 'H300', 'axis'); api.P(g, 'M' + O[0] + ' 14V262', 'axis');
      api.T(g, 300, O[1] + 18, '實', 'lab', 'end'); api.T(g, O[0] + 8, 26, '虛', 'lab');
      var sp = api.el('g', {}, g);
      var zs = api.el('g', {}, sp);
      api.P(zs, 'M' + zx + ' ' + zy + 'L' + zx + ' ' + zsy, 'guide');
      api.el('circle', { cx: zx, cy: zsy, r: 5, class: 'dot ghost-dot' }, zs);
      M(api, zs, zx + 10, zsy + 5, 'z*', 'sm');
      var re = api.el('g', {}, sp);
      api.el('circle', { cx: zx, cy: O[1], r: 5, class: 'dot dot-b' }, re);
      M(api, re, zx + 8, O[1] + 20, 'a', 'sm c2');
      var imp = api.el('g', {}, sp);
      api.P(imp, 'M' + zx + ' ' + zy + 'H' + O[0], 'guide');
      api.el('circle', { cx: O[0], cy: zy, r: 5, class: 'dot dot-a' }, imp);
      M(api, imp, O[0] - 8, zy + 5, 'ib', 'sm hl', 'end');
      var py = api.el('g', {}, g);
      var sqA = api.R(py, O[0], O[1], a * SC, a * SC, 'sq-b'), sqB = api.R(py, zx, zy, b * SC, b * SC, 'sq-a');
      var tA = M(api, py, O[0] + a * SC / 2, O[1] + a * SC / 2 + 6, 'a²', 'sm c2', 'middle'), tB = M(api, py, zx + b * SC / 2, zy + b * SC / 2 + 6, 'b²', 'sm hl', 'middle');
      var legs = api.el('g', {}, py);
      api.P(legs, 'M' + O[0] + ' ' + O[1] + 'H' + zx, 'leg-b'); api.P(legs, 'M' + zx + ' ' + O[1] + 'V' + zy, 'leg-a');
      api.P(legs, 'M' + O[0] + ' ' + O[1] + 'L' + zx + ' ' + zy, 'leg');
      var strike = api.P(py, 'M' + (O[0] - 4) + ' ' + (O[1] + a * SC + 4) + 'L' + (zx + 4) + ' ' + (O[1] - 4), 'strike');
      api.el('circle', { cx: zx, cy: zy, r: 6, class: 'dot dot-z' }, g);
      M(api, g, zx + 10, zy - 6, 'z', 'sm');
      var TX = 336, rows = [];
      for (var i = 0; i < 4; i++) rows.push(M(api, g, TX, 64 + i * 46, '', 'md'));
      var TEXT = {
        split: [['z = ' + cpx(a, b), ''], ['a = ' + f3(a), 'c2'], ['b = ' + f3(b), 'hl'], ['', '']],
        pyth: [['|z|² = a² + b²', ''], ['a² = ' + f3(CH.a2), 'c2'], ['b² = ' + f3(CH.b2), 'hl'], ['合計 ' + f3(CH.sch), '']],
        drop: [['|z|² ≥ b²', ''], ['b² = ħ²/4 = 0.250', 'hl'], ['ΔX · ΔP ≥ 0.500', 'hl'], ['這個例子 ' + f3(CH.dxdp), '']]
      };
      return { node: s, set: function (st) {
        var mode = TEXT[st.mode] ? st.mode : 'split', T = TEXT[mode], t = st.t;
        rows.forEach(function (r, i) {
          api.txt(r, T[i][0]);
          api.cls(r, 'hl', T[i][1] === 'hl'); api.cls(r, 'c2', T[i][1] === 'c2');
          api.op(r, api.seg(t, 0.14 + i * 0.1, 0.2 + i * 0.1));
        });
        var isSplit = mode === 'split';
        api.op(sp, isSplit ? 1 : 0);
        api.op(zs, api.seg(t, 0.22, 0.3)); api.op(re, api.seg(t, 0.34, 0.42)); api.op(imp, api.seg(t, 0.44, 0.52));
        api.op(py, isSplit ? 0 : 1);
        var ga = mode === 'pyth' ? api.ease(api.seg(t, 0.3, 0.5)) : 1, gb = mode === 'pyth' ? api.ease(api.seg(t, 0.45, 0.65)) : 1;
        api.set(sqA, 'width', (a * SC * ga).toFixed(1)); api.set(sqA, 'height', (a * SC * ga).toFixed(1));
        api.set(sqB, 'width', (b * SC * gb).toFixed(1)); api.set(sqB, 'height', (b * SC * gb).toFixed(1));
        api.op(tA, ga); api.op(tB, gb);
        var drop = mode === 'drop' ? api.ease(api.seg(t, 0.3, 0.5)) : 0;
        api.op(sqA, 1 - 0.75 * drop); api.op(strike, drop);
      } };
    } },

    // [Ω̃, Λ̃] = [Ω, Λ]: expand both products; every term with a mean is a number and cancels its partner
    expand: { title: 'Fig · 展開，常數項互相抵消', make: function (api) {
      var s = api.svg('expand', W, HH), g = api.el('g', {}, s);
      var top = M(api, g, 300, 34, '(Ω − ⟨Ω⟩)(Λ − ⟨Λ⟩) − (Λ − ⟨Λ⟩)(Ω − ⟨Ω⟩)', '', 'middle');
      var A = ['ΩΛ', '− Ω⟨Λ⟩', '− ⟨Ω⟩Λ', '+ ⟨Ω⟩⟨Λ⟩'], B = ['− ΛΩ', '+ ⟨Λ⟩Ω', '+ Λ⟨Ω⟩', '− ⟨Λ⟩⟨Ω⟩'];
      var lA = api.T(g, 12, 98, '第一個乘積', 'lab'), lB = api.T(g, 12, 152, '第二個乘積', 'lab');
      var cols = A.map(function (t, i) {
        var x = 170 + i * 122, gg = api.el('g', {}, g), cell = api.el('g', {}, gg);
        var tA = M(api, cell, x, 98, t, 'md', 'middle'), tB = M(api, cell, x, 152, B[i], 'md', 'middle');
        var x1 = api.P(gg, 'M' + (x - 50) + ' 76L' + (x + 50) + ' 162', 'strike'), x2 = api.P(gg, 'M' + (x + 50) + ' 76L' + (x - 50) + ' 162', 'strike');
        api.cls(tA, 'hl', i === 0); api.cls(tB, 'hl', i === 0);
        return { gg: gg, cell: cell, x: [x1, x2] };
      });
      var why = api.T(g, 414, 196, '⟨Ω⟩、⟨Λ⟩ 只是數字，跟誰都可以換位置', 'lab', 'middle');
      var res = M(api, g, 300, 244, '= ΩΛ − ΛΩ = [Ω, Λ] = iΓ', 'md hl', 'middle');
      return { node: s, set: function (st) {
        var t = st.t;
        api.op(top, api.seg(t, 0.08, 0.16)); api.op(lA, api.seg(t, 0.16, 0.24)); api.op(lB, api.seg(t, 0.16, 0.24));
        cols.forEach(function (c, i) {
          api.op(c.gg, api.seg(t, 0.16 + i * 0.03, 0.24 + i * 0.03));
          var k = i ? api.seg(t, 0.32 + (i - 1) * 0.14, 0.42 + (i - 1) * 0.14) : 0;
          c.x.forEach(function (x) { api.op(x, k); });
          api.op(c.cell, 1 - 0.6 * k);
        });
        api.op(why, api.seg(t, 0.34, 0.42)); api.op(res, api.seg(t, 0.78, 0.86));
      } };
    } },

    // the two equality conditions, checked on the three inputs
    cond: { title: 'Fig · 三個 ψ 各過了哪一關', make: function (api) {
      var s = api.svg('cond', W, HH), g = api.el('g', {}, s), CX = [12, 262, 432, 580];
      api.T(g, CX[1], 30, '① 兩個向量平行', 'lab', 'middle'); M(api, g, CX[1], 52, 'cos²θ = 1', 'sm', 'middle');
      api.T(g, CX[2], 30, '② 實部是 0', 'lab', 'middle'); M(api, g, CX[2], 52, 'a = 0', 'sm', 'middle');
      api.T(g, CX[3], 30, '結果', 'lab', 'end'); M(api, g, CX[3], 52, 'ΔX · ΔP', 'sm', 'end');
      api.P(g, 'M12 66H590', 'axis');
      var rows = [2, 1, 0].map(function (si, i) {
        var S = STATES[si], y = 104 + i * 52, gg = api.el('g', {}, g), ok1 = S.m.cos2 > 0.999, ok2 = Math.abs(S.m.a) < 1e-3;
        api.R(gg, 6, y - 28, 588, 44, si === 0 ? 'win' : 'nowin', 8);
        api.T(gg, CX[0] + 6, y, S.name, 'num');
        api.T(gg, CX[1], y, (ok1 ? '✓ ' : '✗ ') + f3(S.m.cos2), ok1 ? 'num' : 'num no', 'middle');
        api.T(gg, CX[2], y, (ok2 ? '✓ ' : '✗ ') + f3(S.m.a), ok2 ? 'num' : 'num no', 'middle');
        api.T(gg, CX[3] - 6, y, f3(S.m.dxdp), si === 0 ? 'num hlt' : 'num', 'end');
        return gg;
      });
      var note = api.T(g, 300, 262, '只有兩關都過的才停在 ħ/2：接下來解出它一定是高斯', 'lab', 'middle');
      return { node: s, set: function (st) {
        rows.forEach(function (r, i) { api.op(r, api.seg(st.t, 0.2 + i * 0.12, 0.28 + i * 0.12)); });
        api.op(note, api.seg(st.t, 0.6, 0.68));
      } };
    } },

    // condition ① as an ODE, stepped out from ⟨X⟩; the last event overlays the closed form
    ode: { title: 'Fig · 一步一步積分', trace: 'ode', make: function (api) {
      var s = api.svg('ode', W, HH), g = api.el('g', {}, s), x0 = XB - 2.9, x1 = XB + 2.9, Y0 = 150, SY = 110;
      function X(x) { return 30 + (x - x0) / (x1 - x0) * 540; }
      function Y(v) { return Y0 - v * SY; }
      M(api, g, 12, 24, 'c = ' + cpx(C.re, C.im), 'sm');
      var prog = api.T(g, 590, 24, '', 'lab', 'end');
      api.P(g, 'M20 ' + Y0 + 'H584', 'axis');
      api.P(g, 'M' + X(XB) + ' 44V244', 'guide'); M(api, g, X(XB), 262, '⟨X⟩', 'sm', 'middle');
      var exact = api.el('g', {}, g);
      api.P(exact, curve(function (x) { return closed(x - XB)[0]; }, x0, x1, 240, X, Y), 'curve-exact');
      api.T(exact, 584, 252, '虛線：解析解（差距 ' + (odeErr < 1e-7 ? '< 10⁻⁷' : odeErr.toExponential(1)) + '）', 'lab', 'end');
      var env = api.P(g, 'M0 0', 'curve'), envN = api.P(g, 'M0 0', 'curve thin'), rep = api.P(g, 'M0 0', 'curve-a');
      var dR = api.el('circle', { r: 4.5, class: 'dot dot-a' }, g), dL = api.el('circle', { r: 4.5, class: 'dot dot-a' }, g);
      api.T(g, 34, 252, '黑 |ψ|　橘 Re ψ', 'lab');
      function pathTo(n, part) {
        var pts = [];
        for (var k = n; k >= 1; k--) pts.push([XB - k * ODE_DX, part(odeL[k])]);
        for (k = 0; k <= n; k++) pts.push([XB + k * ODE_DX, part(odeR[k])]);
        return pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); }).join('');
      }
      return { node: s, set: function (st) {
        var ev = st.ev || ode[0], kk = glide(api, st, function (e) { return e ? e.vars.k : null; }), n = Math.max(1, Math.round(kk));
        function abs(p) { return Math.hypot(p[0], p[1]); }
        api.set(env, 'd', pathTo(n, abs)); api.set(envN, 'd', pathTo(n, function (p) { return -abs(p); }));
        api.set(rep, 'd', pathTo(n, function (p) { return p[0]; }));
        api.set(dR, 'cx', X(XB + n * ODE_DX).toFixed(1)); api.set(dR, 'cy', Y(odeR[n][0]).toFixed(1));
        api.set(dL, 'cx', X(XB - n * ODE_DX).toFixed(1)); api.set(dL, 'cy', Y(odeL[n][0]).toFixed(1));
        api.txt(prog, '第 ' + n + ' / ' + ODE_N + ' 步　x = ' + f2(XB) + ' ± ' + f2(n * ODE_DX));
        api.op(exact, ev.vars.done ? 1 : 0);
      } };
    } },

    // condition ②: sweep the phase of c; only α = 90° kills the anticommutator. Mode "final": the Gaussian it leaves.
    alpha: { title: 'Fig · c 的相位', trace: 'alpha', make: function (api) {
      var s = api.svg('alpha', W, HH), g = api.el('g', {}, s), O = [118, 176], RR = 92;
      api.P(g, 'M' + (O[0] - RR - 10) + ' ' + O[1] + 'H' + (O[0] + RR + 14), 'axis'); api.P(g, 'M' + O[0] + ' 60V' + (O[1] + 40), 'axis');
      api.P(g, 'M' + (O[0] - RR) + ' ' + O[1] + 'A' + RR + ' ' + RR + ' 0 0 1 ' + (O[0] + RR) + ' ' + O[1] + 'Z', 'okzone');
      api.P(g, 'M' + (O[0] - RR) + ' ' + O[1] + 'A' + RR + ' ' + RR + ' 0 0 1 ' + (O[0] + RR) + ' ' + O[1], 'circ');
      api.T(g, O[0], 252, '上半平面：Im c > 0 才能歸一化', 'lab', 'middle');
      api.T(g, 12, 24, 'c 平面', 'lab');
      var reL = api.P(g, 'M0 0', 'leg-b'), imL = api.P(g, 'M0 0', 'leg-a'), rad = api.P(g, 'M0 0', 'leg');
      var dot = api.el('circle', { r: 6, class: 'dot dot-z' }, g), aT = M(api, g, 0, 0, '', 'sm');
      var PX0 = 262, PX1 = 590, PY0 = 132;
      function PXf(u) { return PX0 + (u + 3.4) / 6.8 * (PX1 - PX0); }
      api.P(g, 'M' + PX0 + ' ' + PY0 + 'H' + PX1, 'axis');
      var dens = api.P(g, 'M0 0', 'area-a'), wave = api.P(g, 'M0 0', 'curve thin'), brk = api.P(g, 'M0 0', 'brk'), brkT = M(api, g, 0, 0, '', 'sm', 'middle');
      api.T(g, PX0, 24, '解出來的 ψ：橘 |ψ|²、黑 Re ψ', 'lab');
      var r1 = M(api, g, PX0, 176, '', 'md'), r2 = M(api, g, PX0, 210, '', 'md'), r3 = api.T(g, PX0, 240, '', 'lab');
      return { node: s, set: function (st) {
        var fin = st.mode === 'final';
        var dg = fin ? 90 : glide(api, st, function (e) { return e ? e.vars.deg : null; }), r = dg * Math.PI / 180;
        var cre = CABS * Math.cos(r), cim = CABS * Math.sin(r), x2 = 1 / (2 * cim), anti = 2 * cre * x2, dxdp = 1 / (2 * Math.sin(r));
        var px = O[0] + RR * Math.cos(r), py = O[1] - RR * Math.sin(r);
        api.set(dot, 'cx', px.toFixed(1)); api.set(dot, 'cy', py.toFixed(1));
        api.set(reL, 'd', 'M' + O[0] + ' ' + O[1] + 'H' + px.toFixed(1)); api.set(imL, 'd', 'M' + px.toFixed(1) + ' ' + O[1] + 'V' + py.toFixed(1));
        api.set(rad, 'd', 'M' + O[0] + ' ' + O[1] + 'L' + px.toFixed(1) + ' ' + py.toFixed(1));
        api.set(aT, 'x', (px + (px >= O[0] ? 10 : -10)).toFixed(1)); api.set(aT, 'y', (py - 8).toFixed(1));
        api.set(aT, 'text-anchor', px >= O[0] ? 'start' : 'end');
        api.txt(aT, 'α = ' + Math.round(dg) + '°');
        var sy = 92 / gauss(0, 0.49);
        api.set(dens, 'd', band(function (u) { return gauss(u, x2); }, -3.4, 3.4, 120, PXf, function (v) { return PY0 - v * sy; }, PY0));
        api.set(wave, 'd', curve(function (u) { return Math.sqrt(gauss(u, x2)) * Math.cos(PB * u + cre * u * u / 2) * 46; }, -3.4, 3.4, 220, PXf, function (v) { return PY0 - v; }));
        var hx = Math.sqrt(x2), hy = PY0 - gauss(hx, x2) * sy;
        api.op(brk, fin ? 1 : 0); api.op(brkT, fin ? 1 : 0);
        api.set(brk, 'd', 'M' + PXf(-hx).toFixed(1) + ' ' + (hy - 6).toFixed(1) + 'v6H' + PXf(hx).toFixed(1) + 'v-6');
        api.set(brkT, 'x', PXf(0).toFixed(1)); api.set(brkT, 'y', (hy - 12).toFixed(1)); api.txt(brkT, '±ΔX = ' + f2(hx));
        if (fin) {
          api.txt(r1, '|c| = ħ / 2(ΔX)² = ' + f2(CABS));
          api.txt(r2, 'ΔX · ΔP = 0.500 = ħ/2');
          api.txt(r3, 'c 是純虛數：相位只剩 ⟨P⟩x，|ψ| 就是高斯');
        } else {
          api.txt(r1, '⟨[X̃, P̃]₊⟩ = ħ cot α = ' + f3(anti));
          api.txt(r2, 'ΔX · ΔP = ħ / 2 sin α = ' + f3(dxdp));
          api.txt(r3, Math.abs(anti) < 1e-6 ? 'α = 90°：反對易子是 0，等號成立' : 'Re c ≠ 0：波包帶著 chirp，反對易子不是 0');
        }
        api.cls(r1, 'hl', !fin && Math.abs(anti) < 1e-6);
        api.cls(r2, 'hl', fin || Math.abs(anti) < 1e-6);
      } };
    } }
  };

  MathWalk({ chapters: chapters, steps: steps, traces: { run: run, ode: ode, alpha: alpha }, figs: figs, board: boardDecor });
})();
