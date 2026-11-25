/* /lab/ddpm-forward/ — DDPM's forward process, from q(x_t|x_{t-1}) to the closed form q(x_t|x_0), one equation at a time
   (engine: mathwalk.js). The equations are KaTeX rendered at build time in the layout; every number on the stage is
   computed here at load from the linear schedule (β from 1e-4 to 0.02, T = 1000), and the histogram comes from
   4000 seeded paths walked step by step. */
(function () {
  'use strict';
  if (!window.MathWalk || !document.querySelector('[data-mw]')) return;

  // ---------- the schedule and the worked examples: every number on the page is computed from these ----------
  var T = 1000, B1 = 1e-4, BT = 0.02, X0 = 0.8;
  function beta(t) { return B1 + (t - 1) / (T - 1) * (BT - B1); }
  var AB = [1], SB = [0];   // ᾱ_t and Σ β_s for t = 0…T
  for (var t = 1; t <= T; t++) { AB[t] = AB[t - 1] * (1 - beta(t)); SB[t] = SB[t - 1] + beta(t); }
  function info(t) {
    var b = beta(t), a = 1 - b, a1 = 1 - beta(t - 1), ab = AB[t];
    return {
      t: t, b: b, a: a, sa: Math.sqrt(a), sb: Math.sqrt(b), a1: a1,
      v1: a * (1 - a1), v2: 1 - a, s1: Math.sqrt(a * (1 - a1)), s2: Math.sqrt(1 - a),   // the two noise blocks of row 3
      hyp: Math.sqrt(1 - a * a1), saa: Math.sqrt(a * a1),                                  // merged (row 4)
      ab: ab, sab: Math.sqrt(ab), nab: Math.sqrt(1 - ab), mean: X0 * Math.sqrt(ab), vr: 1 - ab
    };
  }
  var TS = [10, 250, 1000], EX = TS.map(info), A = EX[1];

  function sig(v, n) { return String(Number(v.toPrecision(n || 3))).replace('-', '−'); }
  function fix(v, d) { return v.toFixed(d).replace('-', '−'); }
  function near1(v) { return v === 0 || v === 1 ? String(v) : v > 0.99 ? fix(v, 5) : v >= 0.1 ? fix(v, 3) : sig(v, 3); }

  // the blackboard's columns: one per t; each cell is the number that row introduces
  var columns = EX.map(function (e) {
    return {
      name: 't = ' + e.t,
      values: { 1: 'β = ' + sig(e.b), 2: '√α = ' + fix(e.sa, 5), 3: fix(e.s1, 4) + ',  ' + fix(e.s2, 4), 4: fix(e.hyp, 4),
        5: '√ᾱ = ' + near1(e.sab), 6: '1 − ᾱ = ' + near1(e.vr) },
      mark: e.sab < 0.01 ? [5, 6] : []   // x_0 keeps under 1 %
    };
  });

  // the sweep: t = 0, 25, …, 1000
  var tsweep = [];
  for (var k = 0; k <= 40; k++) tsweep.push({ vars: { t: k * 25 } });
  function at(st) { return st.ev ? st.ev.vars.t : A.t; }

  var chapters = [
    { id: 'map', n: '00', name: '概觀' },
    { id: 'one', n: '01', name: '一步', rows: [1, 2] },
    { id: 'two', n: '02', name: '兩步併一步', rows: [3, 4] },
    { id: 'closed', n: '03', name: '閉式解', rows: [5, 6] },
    { id: 'sched', n: '04', name: '線性排程' },
    { id: 'run', n: '05', name: '代入三個時間步', rows: [1, 6], bracket: false },
    { id: 'end', n: '06', name: '回顧' }
  ];
  var steps = [
    { id: 'overview', ch: 'map', board: { mode: 'overview', rows: [1, 6] }, h: 1.4 },
    { id: 'onestep', ch: 'one', eq: 'q1', hot: ['m'], hot2: ['v'],
      notes: [['m', '平均：x 乘 ' + fix(A.sa, 5), 'hot'], ['v', '變異數 ' + sig(A.b), 'hot2']], h: 1.3 },
    { id: 'reparam', ch: 'one', eq: 'x1', from: 'q1', say: '抽樣 = 平均 + 標準差 × ε，記 α = 1 − β', hot: ['sb'],
      notes: [['sa', fix(A.sa, 5)], ['sb', fix(A.sb, 4), 'hot'], ['e', '#n-eps']], h: 1.3 },
    { id: 'var', ch: 'one', eq: 'v1', from: 'x1', say: '兩邊取變異數', hot: ['a'], hot2: ['n'],
      notes: [['a', '縮掉 ' + sig(1 - A.a), 'hot'], ['p', '= 1'], ['n', '補回 ' + sig(A.v2), 'hot2']], fig: 'var', h: 1.4 },
    { id: 'expand', ch: 'two', eq: 'x2a', from: 'x1', say: '把上一步的式子代進來', hot: ['sub'],
      notes: [['sub', '第 ' + (A.t - 1) + ' 步', 'hot']], h: 1.3 },
    { id: 'split', ch: 'two', eq: 'x2b', from: 'x2a', say: '把 √α 乘進括號', zoom: 'n1', zfrac: 0.5, hot: ['n1a', 'n1b'],
      notes: [['n1a', '外面乘進來的', 'hot'], ['n1b', '上一步雜訊的變異數', 'hot']], fig: 'pyth', figMode: 'legs', h: 1.4 },
    { id: 'merge', ch: 'two', eq: 'vsum', from: 'x2b', say: '兩塊獨立的雜訊：變異數相加', hot: ['s1'], hot2: ['s2'],
      notes: [['s1', fix(A.v1, 6), 'hot'], ['s2', fix(A.v2, 6), 'hot2'], ['s', '= ' + fix(A.v1 + A.v2, 6)]], fig: 'pyth', figMode: 'hyp', h: 1.4 },
    { id: 'merged', ch: 'two', eq: 'x2', from: 'x2b', say: '兩塊雜訊換成一塊', hot: ['m'],
      notes: [['c', fix(A.saa, 5)], ['m', fix(A.hyp, 4), 'hot']], h: 1.3 },
    { id: 'closed', ch: 'closed', eq: 'xt', from: 'x2', say: '同一招一路併到第 0 步', hot: ['sab'], hot2: ['nab'],
      notes: [['sab', fix(A.sab, 3), 'hot'], ['nab', fix(A.nab, 3), 'hot2'], ['def', '#n-ab']], fig: 'walk', figMode: 'paths', h: 1.4 },
    { id: 'q0', ch: 'closed', eq: 'q0', from: 'xt', say: '寫回分布', hot: ['mu'], hot2: ['cov'],
      notes: [['mu', '平均 ' + fix(A.mean, 3), 'hot'], ['cov', '變異數 ' + fix(A.vr, 3), 'hot2']], fig: 'walk', figMode: 'hist', h: 1.4 },
    { id: 'sched', ch: 'sched', eq: 'beta', hot: ['b1', 'bT'],
      notes: [['b1', '#n-b1', 'hot'], ['fr', 't = ' + A.t + ' 時 ' + fix((A.t - 1) / (T - 1), 3)], ['bT', sig(BT), 'hot']], fig: 'sched', h: 1.4 },
    { id: 'sweep', ch: 'sched', eq: 'q0', hot: ['mu'], hot2: ['cov'],
      notes: [['mu', function (st) { return 't = ' + at(st) + '：平均 ' + sig(X0 * Math.sqrt(AB[at(st)])); }, 'hot'],
              ['cov', function (st) { return '變異數 ' + near1(1 - AB[at(st)]); }, 'hot2']],
      fig: 'walk', figMode: 'sweep', scrub: { trace: 'tsweep' }, h: 2.8 },
    { id: 'run', ch: 'run', board: { mode: 'run', rows: [1, 6] }, h: 3.2 },
    { id: 'end', ch: 'end', board: { mode: 'end', rows: [1, 6] }, h: 1.3 }
  ];

  // ---------- figures: make(api) builds the SVG once; set(st) only changes attributes ----------
  var W = 600, H = 270;
  function M(api, g, x, y, s, cls, anchor) { return api.T(g, x, y, s, 'mx' + (cls ? ' ' + cls : ''), anchor); }
  function line(pts) { return pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(''); }

  // Var[x_t] over t: with the √(1−β) shrink it stays 1; without it (x_t = x_{t−1} + √β ε) it grows to 1 + Σβ
  var varFig = { title: 'Fig · 每步縮不縮，變異數差多少', make: function (api) {
    var s = api.svg('var', W, H), VM = 12;
    function tx(t) { return 50 + t / T * 330; }
    function fy(v) { return 232 - v / VM * 200; }
    api.P(s, 'M50 ' + fy(0) + 'H380', 'axis'); api.P(s, 'M50 ' + fy(0) + 'V' + fy(VM), 'axis');
    [1, 5, 10].forEach(function (v) { api.T(s, 44, fy(v) + 4, String(v), 'lab', 'end'); api.P(s, 'M47 ' + fy(v) + 'H50', 'axis'); });
    [0, 500, 1000].forEach(function (t) { api.T(s, tx(t), 250, String(t), 'lab', 'middle'); });
    api.T(s, 386, fy(0) + 4, 't', 'lab');
    var clip = api.el('clipPath', { id: 'var-clip' }, s.firstChild), cr = api.R(clip, 40, 0, 0, H);
    var g = api.el('g', { 'clip-path': 'url(#var-clip)' }, s);
    var with1 = [], without = [];
    for (var t = 0; t <= T; t += 5) { with1.push([tx(t), fy(1)]); without.push([tx(t), fy(1 + SB[t])]); }
    api.P(g, line(without), 'curve'); api.P(g, line(with1), 'curve-a');
    var d1 = api.el('circle', { r: 4.5, class: 'dot dot-a' }, s), d2 = api.el('circle', { r: 4.5, class: 'dot dot-z' }, s);
    M(api, s, 410, 64, '有乘 √(1−β)', 'sm'); var r1 = M(api, s, 410, 90, '', 'md hl');
    M(api, s, 410, 134, '不乘，只加雜訊', 'sm'); var r2 = M(api, s, 410, 160, '', 'md');
    var cap = api.T(s, 410, 204, '', 'lab');
    return { node: s, set: function (st) {
      var k = api.ease(api.seg(st.t, 0.08, 0.55)), tk = Math.round(k * T);
      api.set(cr, 'width', (tx(tk) - 40 + 2).toFixed(1));
      api.set(d1, 'cx', tx(tk).toFixed(1)); api.set(d1, 'cy', fy(1).toFixed(1));
      api.set(d2, 'cx', tx(tk).toFixed(1)); api.set(d2, 'cy', fy(1 + SB[tk]).toFixed(1));
      api.txt(r1, 'Var = 1'); api.txt(r2, 'Var = ' + fix(1 + SB[tk], 2));
      api.txt(cap, 't = ' + tk + ' 時');
    } };
  } };

  // the two noise blocks as perpendicular lengths: the merged one is the hypotenuse, not the sum
  var pyth = { title: 'Fig · 標準差當成長度：獨立 = 垂直', make: function (api) {
    var s = api.svg('pyth', W, H), S = 1700, ox = 64, oy = 206;
    var L1 = A.s1 * S, L2 = A.s2 * S;
    var bx = ox + L1, by = oy - L2;
    var ra = api.P(s, 'M' + (bx - 11) + ' ' + oy + 'V' + (oy - 11) + 'H' + bx, 'axis');
    var naive = api.P(s, 'M0 0', 'curve ghost'), nlab = api.T(s, 0, 0, '', 'lab');
    var leg1 = api.P(s, 'M0 0', 'leg-a'), leg2 = api.P(s, 'M0 0', 'leg-b'), hyp = api.P(s, 'M0 0', 'hyp');
    var l1 = M(api, s, ox + L1 / 2, oy + 24, fix(A.s1, 4), 'hl', 'middle');
    var l2 = M(api, s, bx + 10, oy - L2 / 2 + 6, fix(A.s2, 4), 'c2');
    var lh = M(api, s, ox + L1 / 2 - 14, oy - L2 / 2 - 8, fix(A.hyp, 4), 'md', 'end');
    var h1 = api.T(s, 360, 60, '', 'lab'), m1 = M(api, s, 360, 92, ''), m2 = M(api, s, 360, 124, '', 'md'), c1 = api.T(s, 360, 168, '', 'lab'), c2 = api.T(s, 360, 188, '', 'lab');
    return { node: s, set: function (st) {
      var legs = st.mode === 'legs';
      var k1 = legs ? api.ease(api.seg(st.t, 0.12, 0.5)) : 1, k2 = legs ? 0 : api.ease(api.seg(st.t, 0.15, 0.55));
      api.set(leg1, 'd', 'M' + ox + ' ' + oy + 'H' + (ox + L1 * k1).toFixed(1));
      api.set(leg2, 'd', 'M' + bx + ' ' + oy + 'V' + (oy - L2 * k1).toFixed(1));
      api.sop(ra, k1); api.sop(l1, k1); api.sop(l2, k1);
      api.set(hyp, 'd', 'M' + ox + ' ' + oy + 'L' + api.lerp(ox, bx, k2).toFixed(1) + ' ' + api.lerp(oy, by, k2).toFixed(1));
      api.sop(hyp, k2 > 0 ? 1 : 0); api.sop(lh, k2);
      var ny = oy + 46;
      api.set(naive, 'd', 'M' + ox + ' ' + ny + 'H' + (ox + (A.s1 + A.s2) * S * k2).toFixed(1));
      api.sop(naive, k2); api.sop(nlab, k2);
      api.set(nlab, 'x', (ox + (A.s1 + A.s2) * S + 8).toFixed(1)); api.set(nlab, 'y', ny + 4);
      api.txt(nlab, '直接相加 ' + fix(A.s1 + A.s2, 4));
      api.txt(h1, legs ? '兩塊雜訊的標準差（t = ' + A.t + '）' : '合起來的標準差');
      api.txt(m2, legs ? '' : '= ' + fix(A.hyp, 4));
      api.txt(m1, legs ? fix(A.s1, 4) + ' 和 ' + fix(A.s2, 4) : '√(' + fix(A.s1, 4) + '² + ' + fix(A.s2, 4) + '²)');
      api.set(c1, 'y', legs ? 132 : 168); api.set(c2, 'y', legs ? 152 : 188);
      api.txt(c1, legs ? '橘：第 t−1 步的雜訊，又縮一次' : '虛線是直接相加，太長：');
      api.txt(c2, legs ? '藍：第 t 步新加的雜訊' : '獨立的兩塊不會同方向');
    } };
  } };

  // one pixel x_0 = 0.8 walked step by step (seeded), against the closed form
  function rng(a) { return function () { a = a + 0x6D2B79F5 | 0; var r = Math.imul(a ^ a >>> 15, 1 | a); r = r + Math.imul(r ^ r >>> 7, 61 | r) ^ r; return ((r ^ r >>> 14) >>> 0) / 4294967296; }; }
  var NP = 4000, NSHOW = 6, SNAP = 25, EVERY = 5, HB = 26, HLO = -2.6, HW = 0.2, sim = null;
  function simulate() {
    if (sim) return sim;
    var rand = rng(20200619), spare = null;
    function gauss() {
      if (spare !== null) { var z = spare; spare = null; return z; }
      var u = 1 - rand(), v = rand(), r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v);
    }
    var ca = [0], cb = [0], snaps = [], paths = [];
    for (var t = 1; t <= T; t++) { ca[t] = Math.sqrt(1 - beta(t)); cb[t] = Math.sqrt(beta(t)); }
    for (var k = 0; k <= T / SNAP; k++) snaps.push(new Float64Array(NP));
    for (var p = 0; p < NP; p++) {
      var x = X0, path = p < NSHOW ? [x] : null;
      snaps[0][p] = x;
      for (t = 1; t <= T; t++) {
        x = ca[t] * x + cb[t] * gauss();
        if (t % SNAP === 0) snaps[t / SNAP][p] = x;
        if (path && t % EVERY === 0) path.push(x);
      }
      if (path) paths.push(path);
    }
    var hists = snaps.map(function (xs) {
      var c = [], s1 = 0, s2 = 0, i;
      for (i = 0; i < HB; i++) c.push(0);
      for (i = 0; i < NP; i++) { var v = xs[i], b = Math.floor((v - HLO) / HW); s1 += v; s2 += v * v; if (b >= 0 && b < HB) c[b]++; }
      var m = s1 / NP;
      return { dens: c.map(function (n) { return n / (NP * HW); }), mean: m, vr: s2 / NP - m * m };
    });
    return (sim = { paths: paths, hists: hists });
  }
  var walk = { title: 'Fig · 一個像素 0.8：一步一步走 vs 閉式解', trace: 'tsweep', make: function (api) {
    var s = api.svg('walk', W, H), D = simulate();
    var PX0 = 40, PX1 = 330, HX = 352, LD = 150, CAP = 100;
    function tx(t) { return PX0 + t / T * (PX1 - PX0); }
    function fy(v) { return 130 - v * 40; }
    var clip = api.el('clipPath', { id: 'walk-clip' }, s.firstChild), cr = api.R(clip, PX0, fy(2.6), PX1 - PX0, fy(-2.6) - fy(2.6));
    api.P(s, 'M' + PX0 + ' ' + fy(0) + 'H' + PX1, 'zero');
    api.P(s, 'M' + PX0 + ' ' + fy(2.6) + 'V' + fy(-2.6), 'axis');
    [2, 0, -2].forEach(function (v) { api.T(s, PX0 - 6, fy(v) + 4, String(v).replace('-', '−'), 'lab', 'end'); });
    [0, 500, 1000].forEach(function (t) { api.T(s, tx(t), 252, String(t), 'lab', 'middle'); });
    api.T(s, PX1 + 6, fy(0) + 4, 't', 'lab');
    var g = api.el('g', { 'clip-path': 'url(#walk-clip)' }, s);
    var up = [], lo = [], mean = [];
    for (var t = 0; t <= T; t += 5) {
      var m = X0 * Math.sqrt(AB[t]), sd = Math.sqrt(1 - AB[t]);
      up.push([tx(t), fy(m + 2 * sd)]); lo.unshift([tx(t), fy(m - 2 * sd)]); mean.push([tx(t), fy(m)]);
    }
    api.P(g, line(up.concat(lo)) + 'Z', 'area-b');
    D.paths.forEach(function (ps) { api.P(g, line(ps.map(function (v, i) { return [tx(i * EVERY), fy(v)]; })), 'path'); });
    api.P(g, line(mean), 'curve-a');
    var x0dot = api.el('circle', { r: 4.5, cx: tx(0), cy: fy(X0), class: 'dot dot-a' }, s);
    M(api, s, PX0 - 8, fy(X0) + 5, String(X0), 'sm hl', 'end');
    var cur = api.P(s, 'M0 0', 'guide'), curLab = api.T(s, 0, fy(2.6) - 4, '', 'lab', 'middle');
    var ends = D.paths.map(function () { return api.el('circle', { r: 2.6, class: 'dot dot-z' }, s); });
    // the histogram, sideways, sharing the y axis with the paths
    var hist = api.el('g', {}, s);
    api.P(hist, 'M' + HX + ' ' + fy(2.6) + 'V' + fy(-2.6), 'axis');
    var bars = [];
    for (var b = 0; b < HB; b++) bars.push(api.R(hist, HX, fy(HLO + (b + 1) * HW) + 0.6, 0, HW * 40 - 1.2, 'bar'));
    var pdf = api.P(hist, 'M0 0', 'pdf'), hlab = api.T(hist, HX, 252, '', 'lab');   // under the histogram: which t it is
    var RX = 462;
    var r0 = M(api, s, RX, 46, '', 'md'), r1 = M(api, s, RX, 76, '', 'hl'), r2 = M(api, s, RX, 102, '', 'c2');
    var e0 = api.T(s, RX, 144, '', 'lab'), e1 = api.T(s, RX, 164, '', 'lab'), e2 = api.T(s, RX, 184, '', 'lab'), cap = api.T(s, RX, 222, '', 'lab');
    function pdfPath(m, sd) {
      if (sd < 0.02) return 'M' + HX + ' ' + fy(m).toFixed(1) + 'H' + (HX + CAP);
      var pts = [];
      for (var i = 0; i <= 130; i++) {
        var v = 2.6 - i * 0.04, d = Math.exp(-(v - m) * (v - m) / (2 * sd * sd)) / (sd * Math.sqrt(2 * Math.PI));
        pts.push([HX + Math.min(CAP, d * LD), fy(v)]);
      }
      return line(pts);
    }
    return { node: s, set: function (st) {
      var mode = st.mode, tE = at(st), tG = tE;
      if (mode === 'sweep' && st.ev) tG = api.lerp(tE, st.next.vars.t, st.frac);
      var reveal = mode === 'paths' ? api.ease(api.seg(st.t, 0.1, 0.55)) : 1;
      api.set(cr, 'width', ((PX1 - PX0) * reveal + 1).toFixed(1));
      var showCur = mode !== 'paths' || reveal >= 1;
      api.set(cur, 'd', 'M' + tx(tG).toFixed(1) + ' ' + fy(2.6) + 'V' + fy(-2.6));
      api.sop(cur, showCur ? 1 : 0); api.sop(curLab, showCur ? 1 : 0);
      api.set(curLab, 'x', tx(tG).toFixed(1)); api.txt(curLab, 't = ' + tE);
      api.sop(x0dot, 1);
      ends.forEach(function (c, i) {
        api.set(c, 'cx', tx(tE).toFixed(1)); api.set(c, 'cy', fy(D.paths[i][tE / EVERY]).toFixed(1));
        api.sop(c, mode === 'paths' && showCur ? 1 : 0);
      });
      var showHist = mode !== 'paths', h = D.hists[tE / SNAP], m = X0 * Math.sqrt(AB[tE]), sd = Math.sqrt(1 - AB[tE]);
      api.sop(hist, showHist ? 1 : 0);
      if (showHist) {
        bars.forEach(function (r, i) { api.set(r, 'width', Math.min(CAP, h.dens[i] * LD).toFixed(1)); });
        api.set(pdf, 'd', pdfPath(m, sd));
      }
      api.txt(hlab, 't = ' + tE + ' 的分布');
      api.txt(r0, 't = ' + tE);
      api.txt(r1, '√ᾱ = ' + near1(Math.sqrt(AB[tE])));
      api.txt(r2, '√(1−ᾱ) = ' + near1(sd));
      api.txt(e0, showHist ? NP + ' 條路徑 vs 閉式解' : '');
      api.txt(e1, showHist ? '平均 ' + fix(h.mean, 2) + ' vs ' + fix(m, 2) : '');
      api.txt(e2, showHist ? '變異數 ' + fix(h.vr, 2) + ' vs ' + fix(sd * sd, 2) : '');
      api.txt(cap, showHist ? '曲線是閉式解' : '色帶：平均 ± 2 標準差');
    } };
  } };

  // the schedule: β_t (top strip), and the two coefficients √ᾱ_t, √(1−ᾱ_t) crossing where ᾱ_t = 0.5
  var sched = { title: 'Fig · 線性排程與兩個係數', make: function (api) {
    var s = api.svg('sched', W, H);
    function tx(t) { return 50 + t / T * 340; }
    function fb(b) { return 72 - b / BT * 46; }
    function fc(v) { return 236 - v * 126; }
    var tc = 0;
    for (var t = 1; t <= T; t++) if (AB[t] < 0.5) { tc = t - 1 + (AB[t - 1] - 0.5) / (AB[t - 1] - AB[t]); break; }
    var tcN = Math.ceil(tc);
    api.P(s, 'M50 ' + fb(0) + 'H390', 'zero');
    M(api, s, 40, fb(BT / 2) + 6, 'β', 'sm', 'end');
    api.T(s, 56, fb(0) + 14, sig(B1), 'lab');
    api.T(s, 394, fb(BT) + 4, sig(BT), 'lab');
    api.P(s, 'M50 ' + fc(0) + 'H390', 'axis'); api.P(s, 'M50 ' + fc(0) + 'V' + fc(1), 'axis');
    api.T(s, 44, fc(1) + 4, '1', 'lab', 'end'); api.T(s, 44, fc(0) + 4, '0', 'lab', 'end');
    TS.forEach(function (t) { api.P(s, 'M' + tx(t) + ' ' + fc(0) + 'v5', 'axis'); api.T(s, tx(t), fc(0) + 18, String(t), 'lab', t === T ? 'end' : 'middle'); });
    var clip = api.el('clipPath', { id: 'sched-clip' }, s.firstChild), cr = api.R(clip, 45, 0, 0, H);
    var g = api.el('g', { 'clip-path': 'url(#sched-clip)' }, s);
    var pb = [], pa = [], pn = [];
    for (t = 0; t <= T; t += 5) {
      if (t >= 1) pb.push([tx(t), fb(beta(t))]);
      pa.push([tx(t), fc(Math.sqrt(AB[t]))]); pn.push([tx(t), fc(Math.sqrt(1 - AB[t]))]);
    }
    api.P(g, line(pb), 'curve'); api.P(g, line(pa), 'curve-a'); api.P(g, line(pn), 'curve-b');
    var xg = api.P(s, 'M' + tx(tc).toFixed(1) + ' ' + fc(Math.SQRT1_2).toFixed(1) + 'V' + fc(0), 'guide');
    var xl = api.T(s, tx(tc) + 7, fc(0) - 9, 't = ' + tcN + ' 交叉', 'lab');
    var da = api.el('circle', { r: 4, cx: tx(A.t), cy: fc(A.sab).toFixed(1), class: 'dot dot-a' }, s);
    var dn = api.el('circle', { r: 4, cx: tx(A.t), cy: fc(A.nab).toFixed(1), class: 'dot dot-b' }, s);
    api.T(s, 420, 44, 'β：' + sig(B1) + ' → ' + sig(BT), 'lab');
    M(api, s, 420, 128, '√ᾱ：訊號', 'hl'); M(api, s, 420, 158, '√(1−ᾱ)：雜訊', 'c2');
    var c1 = api.T(s, 420, 200, '', 'lab'), c2 = api.T(s, 420, 220, '', 'lab');
    return { node: s, set: function (st) {
      var k = api.ease(api.seg(st.t, 0.08, 0.5)), shown = k >= 1 ? 1 : 0;
      api.set(cr, 'width', (5 + 340 * k + 2).toFixed(1));
      [xg, xl, da, dn].forEach(function (e) { api.sop(e, shown); });
      api.txt(c1, 't = ' + A.t + '：' + fix(A.sab, 3) + ' 對 ' + fix(A.nab, 3));
      api.txt(c2, 't = ' + tcN + ' 之後雜訊比較大');
    } };
  } };

  MathWalk({
    chapters: chapters, steps: steps, traces: { tsweep: tsweep },
    figs: { var: varFig, pyth: pyth, walk: walk, sched: sched },
    board: MathWalk.blackboard({ columns: columns })
  });
})();
