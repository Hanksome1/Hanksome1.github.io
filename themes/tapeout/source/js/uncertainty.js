// Shankar Ch. 9: the uncertainty relations. Units: hbar = m = omega = 1 (atom scene: atomic units).
// Every number on screen is computed below from these constants; nothing is typed in by hand.
(function () {
  'use strict';

  var SQ2 = Math.SQRT2, SQ3 = Math.sqrt(3), TAU = 2 * Math.PI, HARTREE_EV = 27.211;

  function number(v, places) {
    if (!isFinite(v)) return '∞';
    var s = v.toFixed(places == null ? 2 : places);
    if (Number(s) === 0) s = s.replace('-', '');
    return s.replace('-', '−');
  }
  function signed(v, places) { return (v >= 0 ? '+' : '') + number(v, places); }
  function logLerp(a, b, k) { return Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * k); }

  // --- 06: products for a few real wave shapes, by numerical integration -------------------
  var SHAPES = [
    { name: '高斯', f: function (x) { return Math.exp(-x * x / 2); } },
    { name: 'sech', f: function (x) { return 1 / Math.cosh(x); } },
    { name: '三角形', f: function (x) { return Math.max(0, 1 - Math.abs(x) / 1.5); } },
    { name: '雙峰', f: function (x) { var s = 2 * 0.45 * 0.45; return Math.exp(-(x - 1.3) * (x - 1.3) / s) + Math.exp(-(x + 1.3) * (x + 1.3) / s); } },
    { name: '振子 |1⟩', f: function (x) { return x * Math.exp(-x * x / 2); } },
    { name: '振子 |2⟩', f: function (x) { return (2 * x * x - 1) * Math.exp(-x * x / 2); } }
  ];
  SHAPES.forEach(function (s) {
    // Real psi, so <P> = 0 and (Delta p)^2 = <psi'|psi'> / <psi|psi>.
    var n = 0, m = 0, m2 = 0, d = 0, h = 0.002, f = s.f;
    for (var x = -12; x <= 12; x += h) {
      var v = f(x), dv = (f(x + h) - f(x - h)) / (2 * h);
      n += v * v; m += x * v * v; m2 += x * x * v * v; d += dv * dv;
    }
    s.dx = Math.sqrt(m2 / n - (m / n) * (m / n));
    s.dp = Math.sqrt(d / n);
    s.product = s.dx * s.dp;
  });

  // --- 02: 80 position measurements on copies of one Gaussian state -----------------------
  var MU = 0.8, SIG = 0.7, NSAMP = 80;

  // --- 07: hydrogen estimate, E(dx) = 3/(8 dx^2) - 1/(sqrt3 dx) in Hartree, dx in a0 ------
  function kinetic(dx) { return 3 / (8 * dx * dx); }
  function potential(dx) { return -1 / (SQ3 * dx); }
  var ATOM_DX = 3 * SQ3 / 4, ATOM_E = kinetic(ATOM_DX) + potential(ATOM_DX);

  // --- 08: oscillator (|0> + |1>)/sqrt2, A = X ---------------------------------------------
  var DE = 0.5;
  function meanX(t) { return Math.cos(t) / SQ2; }
  function spreadX(t) { return Math.sqrt(1 - Math.cos(t) * Math.cos(t) / 2); }
  function speedX(t) { return Math.abs(Math.sin(t)) / SQ2; }
  function mtProduct(t) { var v = speedX(t); return v < 1e-9 ? Infinity : DE * spreadX(t) / v; }

  var root = document.querySelector('[data-explainer]');
  if (!root || !window.Explainer) return;

  var ORDER = ['intro', 'waves', 'spread', 'schwarz', 'split', 'cmin', 'shapes', 'atom', 'mt', 'life'];
  var CY = {};
  ORDER.forEach(function (id, i) { CY[id] = i * 750; });
  var BEATS = [['intro', 1.6], ['waves', 2.2], ['spread', 2.4], ['schwarz', 2], ['split', 2.2], ['cmin', 2.6], ['shapes', 2], ['atom', 2.6], ['mt', 2.6], ['life', 2.2]];
  var SHOTS = [];
  BEATS.forEach(function (b) {
    SHOTS.push([b[0], b[0] === 'intro' ? 0 : 0.08, 280, CY[b[0]], 640]);
    SHOTS.push([b[0], 1, 280, CY[b[0]], 640]);
  });
  root.style.setProperty('--ex-weight', BEATS.reduce(function (s, b) { return s + b[1]; }, 0));
  root.style.setProperty('--ex-stops', BEATS.length - 1);

  Explainer.mount(root, {
    beats: BEATS, shots: SHOTS, hold: 0.35, narrowZoom: 1,
    build: build
  }, Explainer.scrollDriver({ track: '.ex-track', stage: '.ex-stage', panel: '.ex-panel', autoplayMs: 90000 }));

  function build(api) {
    var el = api.el, T = api.T, set = api.set, show = api.show, text = api.text;
    var ease = api.ease, seg = api.seg, lerp = api.lerp, r1 = api.r1, live = api.live;

    function scene(id, title) {
      var region = api.region({ cy: CY[id] });
      var g = el('g', { transform: 'translate(0 ' + CY[id] + ')' }, region);
      T(g, 280, -174, title, 't-title mid');
      return g;
    }
    // A formula as one <text>; each term is a <tspan> that can light up.
    function formula(g, x, y, parts, cls) {
      var node = el('text', { x: x, y: y, class: 'eq ' + (cls || 'mid') }, g), part = {};
      parts.forEach(function (p) {
        var s = el('tspan', { class: p[2] || '' }, node);
        s.textContent = p[0];
        if (p[1]) part[p[1]] = s;
      });
      return { node: node, part: part };
    }
    function hot(f, keys) {
      Object.keys(f.part).forEach(function (k) { f.part[k].classList.toggle('is-hot', keys.indexOf(k) > -1); });
    }
    // Sample f on [d0, d1] into a path; px y is clamped so curves never leave their panel.
    // cut = true lifts the pen outside [top, bottom] instead of drawing a flat line on the edge.
    function curve(f, d0, d1, n, X, Y, top, bottom, cut) {
      var out = [], pen = false;
      for (var i = 0; i <= n; i++) {
        var u = d0 + (d1 - d0) * i / n, y = Y(f(u));
        if (!isFinite(y)) y = top;
        if (cut && (y < top || y > bottom)) { pen = false; continue; }
        y = Math.max(top, Math.min(bottom, y));
        out.push((pen ? 'L' : 'M') + r1(X(u)) + ' ' + r1(y));
        pen = true;
      }
      return out.join('');
    }
    function lin(d0, d1, p0, p1) { return function (v) { return p0 + (v - d0) * (p1 - p0) / (d1 - d0); }; }
    function axis(g, x0, y0, x1, y1) { return el('line', { x1: x0, y1: y0, x2: x1, y2: y1, class: 'axis' }, g); }
    function path(g, cls) { return el('path', { d: 'M0 0', class: cls }, g); }
    function bracket(g, cls) { return el('path', { d: 'M0 0', class: 'brk ' + (cls || '') }, g); }
    function hBracket(x0, x1, y) { return 'M' + r1(x0) + ' ' + (y - 6) + 'V' + y + 'H' + r1(x1) + 'V' + (y - 6); }
    function gauss(x, mu, s) { return Math.exp(-(x - mu) * (x - mu) / (2 * s * s)) / (s * Math.sqrt(TAU)); }

    // ======================================================================================
    // 0. Overview: squeeze a Gaussian; the momentum bell widens; the point rides the hyperbola.
    var intro = scene('intro', '擠窄一邊，另一邊就變寬');
    var introEq = formula(intro, 280, -138, [['Δx', 'x', 'c-a'], [' · '], ['Δp', 'p', 'c-n'], [' ≥ ', 'ge'], ['ħ/2', 'b']]);
    var IX = lin(-4, 4, 30, 290);
    var ip = el('g', {}, intro);
    axis(ip, 30, -30, 290, -30); axis(ip, 30, 120, 290, 120);
    T(ip, 30, -108, '|ψ(x)|²', 't-h');
    T(ip, 30, 44, '|φ(p)|²', 't-n');
    T(ip, 296, -25, 'x', 't-s'); T(ip, 296, 125, 'p', 't-s');
    var introPsi = path(ip, 'fillcurve fa'), introPhi = path(ip, 'fillcurve fn');
    var introBx = bracket(ip, 'ba'), introBp = bracket(ip, 'bn');
    var introLx = T(ip, 160, 4, '', 't-h mid'), introLp = T(ip, 160, 154, '', 't-n mid');
    // (dx, dp) plane
    var PX = lin(0, 2, 340, 540), PY = lin(0, 2.6, 150, -110);
    var pl = el('g', {}, intro);
    el('path', { d: 'M340 150V-110H' + r1(PX(0.5 / 2.6)) + curve(function (u) { return 0.5 / u; }, 0.5 / 2.6, 2, 60, PX, PY, -110, 150).replace('M', 'L') + 'V150Z', class: 'forbid' }, pl);
    el('path', { d: curve(function (u) { return 0.5 / u; }, 0.5 / 2.6, 2, 80, PX, PY, -110, 150), class: 'hyper' }, pl);
    axis(pl, 340, 150, 545, 150); axis(pl, 340, 150, 340, -112);
    T(pl, 546, 155, 'Δx', 't-h'); T(pl, 346, -100, 'Δp', 't-n');
    T(pl, 352, 128, '禁區', 't-s');
    T(pl, 352, 108, 'ΔxΔp < ħ/2', 't-s');
    T(pl, 540, 108, 'ħ/2', 't-s end');
    var introGuide = path(pl, 'guide');
    var introDot = el('circle', { r: 6, class: 'dot' }, pl);
    var introProd = T(pl, 0, 0, '', 't-b halo');

    // ======================================================================================
    // 1. Counting crests in a window. The window is the knob; the spectrum is the result.
    var waves = scene('waves', '在一個窗口裡數波峰');
    var wavesEq = formula(waves, 280, -138, [['Δx', 'x', 'c-a'], [' · '], ['Δk', 'k', 'c-n'], [' ~ 2π']]);
    var wavesEq2 = formula(waves, 280, -112, [['k = p/ħ  ⟹  '], ['Δx · Δp ~ 2πħ = h', 'h']], 'mid small');
    var WX = lin(-4, 4, 30, 530), WY = function (v) { return -62 - 34 * v; };
    var wv = el('g', {}, waves);
    var winRect = el('rect', { x: 0, y: -104, width: 0, height: 84, rx: 3, class: 'window' }, wv);
    el('path', { d: curve(function (x) { return Math.cos(TAU * x); }, -4, 4, 400, WX, WY, -110, 0), class: 'wave faint' }, wv);
    var winWave = path(wv, 'wave');
    var crests = [];
    for (var ci = -3; ci <= 3; ci++) crests.push({ x: ci, dot: el('circle', { cx: r1(WX(ci)), cy: r1(WY(1)), r: 4.5, class: 'dot' }, wv) });
    var rulerG = el('g', {}, wv);
    var rulerFull = [];
    for (var ri = 0; ri < 7; ri++) rulerFull.push(el('rect', { x: 0, y: -14, width: 0, height: 8, class: 'ruler' + (ri % 2 ? ' alt' : '') }, rulerG));
    var rulerRest = el('rect', { x: 0, y: -14, width: 0, height: 8, class: 'ruler rest' }, rulerG);
    var wavesCount = T(wv, 280, 12, '', 't-b mid');
    // spectrum of the windowed wave
    var KX = lin(0, 4 * Math.PI, 30, 530), KY = function (v) { return 150 - 74 * v; };
    var sp = el('g', {}, waves);
    axis(sp, 30, 150, 535, 150);
    T(sp, 30, 54, '窗口裡那段波的頻譜', 't-s');
    T(sp, 538, 155, 'k', 't-s');
    [[0, '0'], [TAU, '2π'], [2 * TAU, '4π']].forEach(function (tk) { T(sp, r1(KX(tk[0])), 168, tk[1], 't-s mid'); });
    el('line', { x1: r1(KX(TAU)), y1: 66, x2: r1(KX(TAU)), y2: 150, class: 'guide' }, sp);
    T(sp, r1(KX(TAU)) + 6, 70, 'k₀ = 2π', 't-s');
    var spec = path(sp, 'fillcurve fn');
    var kBracket = bracket(sp, 'bn');
    var kLabel = T(sp, 280, 192, '', 't-n mid');

    // ======================================================================================
    // 2. What Delta means: measure copies, build the histogram, then <x^2> - <x>^2.
    var spread = scene('spread', '一次量一份複本，量很多次');
    var spreadEq = formula(spread, 280, -138, [['(Δx)²', 'd', 'c-a'], [' = '], ['⟨x²⟩', 'x2'], [' − '], ['⟨x⟩²', 'm2']]);
    var SX = lin(-2, 3.6, 30, 530), SY = function (v) { return 40 - 180 * v; };
    var rnd = api.mulberry32(7), samples = [];
    for (var si = 0; si < NSAMP; si += 2) {
      var u1 = Math.max(1e-9, rnd()), u2 = rnd(), rr = Math.sqrt(-2 * Math.log(u1));
      samples.push(MU + SIG * rr * Math.cos(TAU * u2), MU + SIG * rr * Math.sin(TAU * u2));
    }
    samples = samples.map(function (v) { return Math.max(-1.99, Math.min(3.59, v)); });
    var BIN = 0.2, NBIN = Math.round(5.6 / BIN);
    var sg = el('g', {}, spread);
    var bins = [];
    for (var bi = 0; bi < NBIN; bi++) bins.push(el('rect', { x: r1(SX(-2 + bi * BIN) + 1), y: 40, width: r1(SX(BIN) - SX(0) - 2), height: 0, class: 'hist' }, sg));
    el('path', { d: curve(function (x) { return gauss(x, MU, SIG); }, -2, 3.6, 200, SX, SY, -120, 40), class: 'curve-ink' }, sg);
    axis(sg, 30, 40, 530, 40);
    T(sg, 30, -96, '|ψ(x)|²', 't-s');
    var lastDot = el('circle', { r: 5, cy: 40, class: 'dot' }, sg);
    var meanLine = el('line', { x1: 0, y1: -80, x2: 0, y2: 46, class: 'mean' }, sg);
    var sBracket = bracket(sg, 'ba');
    var sCount = T(sg, 530, -96, '', 't-b end');
    var sMean = T(sg, 0, 74, '', 't-h mid');
    var barsG = el('g', {}, spread);
    var BAR0 = 150, BARL = 250;
    T(barsG, BAR0 - 12, 120, '⟨x²⟩', 't-b end');
    T(barsG, BAR0 - 12, 156, '⟨x⟩²', 't-b end');
    var barX2 = el('rect', { x: BAR0, y: 106, width: 0, height: 18, class: 'barbox' }, barsG);
    var barM2 = el('rect', { x: BAR0, y: 142, width: 0, height: 18, class: 'barbox' }, barsG);
    var barDiff = el('rect', { x: BAR0, y: 106, width: 0, height: 18, class: 'bar-a' }, barsG);
    var vX2 = T(barsG, 0, 120, '', 't-s'), vM2 = T(barsG, 0, 156, '', 't-s');
    var vDiff = T(barsG, 0, 186, '', 't-h mid');

    // ======================================================================================
    // 3. Schwarz: the projection of V2 on V1 never beats |V1||V2|.
    var schwarz = scene('schwarz', '內積不會比長度相乘還大');
    var schEq = formula(schwarz, 280, -138, [['⟨V₁|V₁⟩', 'a', 'c-a'], ['⟨V₂|V₂⟩', 'b', 'c-n'], ['  ≥  '], ['|⟨V₁|V₂⟩|²', 'c']]);
    var schEq2 = formula(schwarz, 280, -112, [['V₁ = Ω̃|ψ⟩，V₂ = Λ̃|ψ⟩  ⟹  '], ['(ΔΩ)²(ΔΛ)² ≥ |⟨ψ|Ω̃Λ̃|ψ⟩|²', 'm']], 'mid small');
    var O = [90, 80], L1 = 220, L2 = 176;
    var sv = el('g', {}, schwarz);
    axis(sv, 30, O[1], 330, O[1]);
    var projSeg = el('line', { x1: O[0], y1: O[1] + 10, x2: O[0], y2: O[1] + 10, class: 'proj' }, sv);
    var dropLine = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'guide' }, sv);
    var arc = path(sv, 'arc');
    el('line', { x1: O[0], y1: O[1], x2: O[0] + L1, y2: O[1], class: 'vec va' }, sv);
    T(sv, O[0] + L1 + 6, O[1] + 5, 'V₁', 't-h');
    var vec2 = el('line', { x1: O[0], y1: O[1], x2: O[0], y2: O[1], class: 'vec vn' }, sv);
    var v2Label = T(sv, 0, 0, 'V₂', 't-n halo');
    var thetaLabel = T(sv, O[0] + 30, O[1] - 12, '', 't-s');
    T(sv, O[0], O[1] + 34, '投影長 = |V₂| cos θ', 't-s');
    var sb = el('g', {}, schwarz);
    var SB0 = 140, SBH = 260;
    axis(sb, 380, SB0, 530, SB0);
    el('rect', { x: 390, y: r1(SB0 - 0.64 * SBH), width: 52, height: r1(0.64 * SBH), class: 'barbox' }, sb);
    var prodVal = T(sb, 416, r1(SB0 - 0.64 * SBH - 10), '0.64', 't-b mid');
    var dotBar = el('rect', { x: 466, y: SB0, width: 52, height: 0, class: 'bar-a' }, sb);
    var dotVal = T(sb, 492, SB0, '', 't-h mid');
    T(sb, 416, SB0 + 22, '長度相乘²', 't-s mid');
    T(sb, 492, SB0 + 22, '|內積|²', 't-s mid');
    void prodVal;

    // ======================================================================================
    // 4. Split <Omega~ Lambda~> into Re and Im. A chirped Gaussian supplies a real part.
    var split = scene('split', '把 ⟨Ω̃Λ̃⟩ 拆成實部和虛部');
    var splitEq = formula(split, 280, -138, [['⟨Ω̃Λ̃⟩', 'z'], [' = '], ['½⟨{Ω̃, Λ̃}⟩', 're', 'c-a'], [' + '], ['½⟨[Ω̃, Λ̃]⟩', 'im', 'c-n']]);
    formula(split, 280, -112, [['X、P：[X, P] = iħ  ⟹  虛部永遠是 iħ/2']], 'mid small');
    var ZO = [150, 70], ZS = 150, SIGSQ = 0.5;
    var zp = el('g', {}, split);
    axis(zp, 24, ZO[1], 290, ZO[1]); axis(zp, ZO[0], 180, ZO[0], -60);
    T(zp, 292, ZO[1] + 5, 'Re', 't-s'); T(zp, ZO[0] + 6, -48, 'Im', 't-s');
    el('line', { x1: 24, y1: ZO[1] - 0.5 * ZS, x2: 290, y2: ZO[1] - 0.5 * ZS, class: 'floor' }, zp);
    T(zp, 28, ZO[1] - 0.5 * ZS - 8, 'ħ/2', 't-n');
    var zCircle = el('circle', { cx: ZO[0], cy: ZO[1], r: 0, class: 'bound' }, zp);
    var reArrow = el('line', { x1: ZO[0], y1: ZO[1], x2: ZO[0], y2: ZO[1], class: 'vec va' }, zp);
    var imArrow = el('line', { x1: ZO[0], y1: ZO[1], x2: ZO[0], y2: ZO[1], class: 'vec vn' }, zp);
    var zArrow = el('line', { x1: ZO[0], y1: ZO[1], x2: ZO[0], y2: ZO[1], class: 'vec vi' }, zp);
    var zDot = el('circle', { r: 5, class: 'dot ink' }, zp);
    var zLabel = T(zp, 0, 0, 'z', 't-b halo');
    // phase space ellipse of the chirped Gaussian (Wigner 1-sigma contour)
    var PS = [420, 2], PSS = 70;
    var ph = el('g', {}, split);
    axis(ph, PS[0] - 100, PS[1], PS[0] + 100, PS[1]); axis(ph, PS[0], PS[1] + 80, PS[0], PS[1] - 84);
    T(ph, PS[0] + 102, PS[1] + 5, 'x', 't-s'); T(ph, PS[0] + 6, PS[1] - 74, 'p', 't-s');
    T(ph, 316, PS[1] - 70, '相空間', 't-s');
    var box = el('rect', { x: 0, y: 0, width: 0, height: 0, class: 'boxdash' }, ph);
    var ell = path(ph, 'ellipse');
    var chirpLine = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'guide' }, ph);
    var zr1 = T(split, 300, 92, '', 't-h'), zr2 = T(split, 300, 120, '', 't-n'), zr3 = T(split, 300, 150, '', 't-b'), zr4 = T(split, 300, 178, '', 't-s');

    // ======================================================================================
    // 5. Equality needs P~psi = c X~psi with c pure imaginary. Walk c around the unit circle.
    var cmin = scene('cmin', '等號成立：兩個條件都要滿足');
    var cEq = formula(cmin, 280, -138, [['(P − ⟨P⟩)|ψ⟩', 'l', 'c-n'], [' = '], ['c', 'c', 'c-a'], [' (X − ⟨X⟩)|ψ⟩', 'r']]);
    formula(cmin, 280, -112, [['⟨X⟩ = ⟨P⟩ = 0  ⟹  ψ(x) = ψ(0) · exp(i c x² / 2ħ)']], 'mid small');
    var CO = [130, 50], CS = 100;
    var cp = el('g', {}, cmin);
    el('rect', { x: CO[0] - 128, y: CO[1] - 128, width: 256, height: 128, class: 'okzone' }, cp);
    axis(cp, CO[0] - 130, CO[1], CO[0] + 130, CO[1]); axis(cp, CO[0], CO[1] + 106, CO[0], CO[1] - 130);
    el('circle', { cx: CO[0], cy: CO[1], r: CS, class: 'unit' }, cp);
    el('line', { x1: CO[0], y1: CO[1] - 128, x2: CO[0], y2: CO[1], class: 'imaxis' }, cp);
    T(cp, CO[0] + 128, CO[1] + 22, 'Re c', 't-s end');
    T(cp, CO[0] + 10, CO[1] - 110, '可歸一化', 't-h');
    T(cp, CO[0] + 10, CO[1] - 90, 'Im c > 0', 't-s');
    T(cp, CO[0] - 122, CO[1] + 122, '條件 2：Re c = 0（虛軸）', 't-s');
    var cArrow = el('line', { x1: CO[0], y1: CO[1], x2: CO[0], y2: CO[1], class: 'vec va' }, cp);
    var cDot = el('circle', { r: 6, class: 'dot' }, cp);
    var cLabel = T(cp, 0, 0, 'c', 't-h halo');
    var QX = lin(-3, 3, 290, 540), QY = function (v) { return 50 - 70 * v; };
    var cq = el('g', {}, cmin);
    axis(cq, 290, 50, 540, 50);
    T(cq, 290, -78, '|ψ(x)|', 't-h'); T(cq, 540, -78, 'Re ψ(x)', 't-s end');
    var cRe = path(cq, 'curve-ink thin'), cAbs = path(cq, 'curve-a');
    var cr1 = T(cmin, 290, 112, '', 't-h'), cr2 = T(cmin, 290, 140, '', 't-b'), cr3 = T(cmin, 290, 168, '', 't-s');

    // ======================================================================================
    // 6. Other shapes: every one of them lands above hbar/2.
    var shapes = scene('shapes', '只有高斯碰得到 ħ/2');
    formula(shapes, 280, -138, [['Δx · Δp = ħ/2  ⟺  '], ['ψ ∝ exp(−x²/2Δ²)', 'g', 'c-a']]);
    var HB0 = 232, HBL = 104, rows = [];
    el('line', { x1: HB0 + 0.5 * HBL, y1: -120, x2: HB0 + 0.5 * HBL, y2: 164, class: 'floor' }, shapes);
    T(shapes, HB0 + 0.5 * HBL, -106, 'ħ/2', 't-n mid');
    SHAPES.forEach(function (s, i) {
      var y = -82 + i * 48, g = el('g', {}, shapes), mx = 0;
      for (var x = -3.5; x <= 3.5; x += 0.05) mx = Math.max(mx, s.f(x) * s.f(x));
      T(g, 30, y + 5, s.name, 't-b');
      el('line', { x1: 116, y1: y + 14, x2: 206, y2: y + 14, class: 'axis' }, g);
      el('path', { d: curve(function (x) { return s.f(x) * s.f(x) / mx; }, -3.5, 3.5, 70, lin(-3.5, 3.5, 116, 206), function (v) { return y + 14 - 28 * v; }, y - 16, y + 14), class: 'curve-a thin' }, g);
      var bar = el('rect', { x: HB0, y: y - 7, width: 0, height: 16, class: i === 0 ? 'bar-a' : 'barbox' }, g);
      var lab = T(g, HB0, y + 6, '', 't-b');
      rows.push({ g: g, bar: bar, lab: lab, s: s });
    });

    // ======================================================================================
    // 7. Size of the atom: squeeze the packet into the Coulomb well.
    var atom = scene('atom', '擠得太小，動能就太大');
    var aEq = formula(atom, 280, -138, [['E₀(Δx)', 'e'], [' ≈ '], ['3ħ²/8mΔx²', 'k', 'c-a'], [' − '], ['e²/√3Δx', 'v', 'c-n']]);
    var AX = lin(-4, 4, 30, 260), AV0 = -40;
    var aw = el('g', {}, atom);
    axis(aw, 30, AV0, 262, AV0);
    el('path', { d: curve(function (x) { return -1 / Math.abs(x); }, -4, -0.02, 240, AX, function (v) { return AV0 - 60 * v; }, AV0 - 80, 124, true) + curve(function (x) { return -1 / Math.abs(x); }, 0.02, 4, 240, AX, function (v) { return AV0 - 60 * v; }, AV0 - 80, 124, true), class: 'curve-n' }, aw);
    T(aw, 30, 108, '−e²/r', 't-n');
    var aPacket = path(aw, 'fillcurve fa');
    el('circle', { cx: AX(0), cy: AV0, r: 5, class: 'dot ink' }, aw);
    T(aw, AX(0) + 8, AV0 + 22, '質子', 't-s');
    var aBr = bracket(aw, 'ba');
    var aDx = T(aw, AX(0), 168, '', 't-h mid');
    var EX = lin(0.3, 4, 300, 540), EY = function (v) { return 20 - 130 * v; };
    var ae = el('g', {}, atom);
    axis(ae, 300, 20, 542, 20); axis(ae, 300, 116, 542, 116); axis(ae, 300, 116, 300, -100);
    T(ae, 294, 25, '0', 't-s end');
    T(ae, 542, 134, 'Δx / a₀', 't-s end');
    T(ae, 306, -106, 'E（Hartree）', 't-s');
    el('line', { x1: 300, y1: r1(EY(-0.5)), x2: 540, y2: r1(EY(-0.5)), class: 'floor' }, ae);
    T(ae, 540, r1(EY(-0.5)) + 18, '真實基態 −13.6 eV', 't-n end');
    el('path', { d: curve(kinetic, 0.3, 4, 400, EX, EY, -100, 116, true), class: 'curve-a thin' }, ae);
    el('path', { d: curve(potential, 0.3, 4, 400, EX, EY, -100, 116, true), class: 'curve-n thin' }, ae);
    el('path', { d: curve(function (d) { return kinetic(d) + potential(d); }, 0.3, 4, 400, EX, EY, -100, 116, true), class: 'curve-ink' }, ae);
    T(ae, r1(EX(0.9)), r1(EY(0.6)), '動能', 't-h');
    T(ae, r1(EX(3.1)), r1(EY(-0.33)), '位能', 't-n');
    T(ae, 330, -19, '總能', 't-b');
    var aGuide = el('line', { x1: 0, y1: -100, x2: 0, y2: 116, class: 'guide' }, ae);
    var aDot = el('circle', { r: 6, class: 'dot ink' }, ae);
    var ar1 = T(atom, 300, 160, '', 't-b'), ar2 = T(atom, 300, 186, '', 't-s');

    // ======================================================================================
    // 8. Mandelstam-Tamm: how long until <X> moves by one Delta X?
    var mt = scene('mt', '⟨X⟩ 要移動一個 ΔX，要多久？');
    var mtEq = formula(mt, 280, -138, [['ΔE', 'e', 'c-n'], [' · '], ['Δtₓ', 't', 'c-a'], [' ≥ ħ/2']]);
    formula(mt, 280, -112, [['Δtₓ = ΔX / |d⟨X⟩/dt|   ·   (|0⟩ + |1⟩)/√2   ·   ΔE = ħω/2']], 'mid small');
    var MX = lin(-3.5, 3.5, 30, 290), MY = function (v) { return 10 - 150 * v; };
    var mw = el('g', {}, mt);
    var mBand = el('rect', { x: 0, y: -92, width: 0, height: 102, class: 'band' }, mw);
    axis(mw, 30, 10, 290, 10);
    T(mw, 30, -80, '|ψ(x, t)|²', 't-s');
    var mDens = path(mw, 'fillcurve fa');
    var mMean = el('line', { x1: 0, y1: -92, x2: 0, y2: 16, class: 'mean' }, mw);
    var mVel = el('line', { x1: 0, y1: 32, x2: 0, y2: 32, class: 'vec vn' }, mw);
    var mr = [T(mt, 30, 72, '', 't-h'), T(mt, 30, 100, '', 't-h'), T(mt, 30, 128, '', 't-n'), T(mt, 30, 160, '', 't-b')];
    var TX = lin(0, TAU, 320, 540), TY = function (v) { return 150 - 84 * v; };
    var mc = el('g', {}, mt);
    axis(mc, 320, 150, 542, 150); axis(mc, 320, 150, 320, -62);
    [[0, '0'], [Math.PI / 2, 'π/2'], [Math.PI, 'π'], [3 * Math.PI / 2, '3π/2'], [TAU, '2π']].forEach(function (tk) { T(mc, r1(TX(tk[0])), 170, tk[1], 't-s mid'); });
    T(mc, 542, 192, 'ωt', 't-s end');
    T(mc, 326, -72, 'ΔE · Δtₓ', 't-s');
    el('line', { x1: 320, y1: r1(TY(0.5)), x2: 540, y2: r1(TY(0.5)), class: 'floor' }, mc);
    T(mc, 538, r1(TY(0.5)) + 18, 'ħ/2', 't-n end');
    el('path', { d: curve(mtProduct, 0.001, Math.PI - 0.001, 400, TX, TY, -62, 150, true) + curve(mtProduct, Math.PI + 0.001, TAU - 0.001, 400, TX, TY, -62, 150, true), class: 'curve-ink' }, mc);
    T(mc, r1(TX(Math.PI / 2)), r1(TY(mtProduct(Math.PI / 2)) - 12), number(mtProduct(Math.PI / 2)), 't-b mid halo');
    var mDot = el('circle', { r: 6, class: 'dot' }, mc);

    // ======================================================================================
    // 9. Lifetime and line width: a decaying oscillation and its Lorentzian.
    var life = scene('life', '活得越久，譜線越窄');
    var lEq = formula(life, 280, -138, [['τ', 't', 'c-a'], [' · '], ['ΔE', 'e', 'c-n'], [' = ħ/2']]);
    formula(life, 280, -112, [['ψ(t) = e^(−iE₀t/ħ) e^(−t/2τ)   ⟹   P(E) ∝ 1 / [(E − E₀)² + (ħ/2τ)²]']], 'mid small');
    var E0 = 3, LX = lin(0, 12, 30, 270), LY = function (v) { return 20 - 70 * v; };
    var lw = el('g', {}, life);
    axis(lw, 30, 20, 274, 20);
    T(lw, 30, -66, 'Re ψ(t)', 't-s'); T(lw, 274, 36, 't', 't-s end');
    var lEnv = path(lw, 'envelope'), lWave = path(lw, 'curve-ink thin');
    var lRuler = el('rect', { x: 30, y: 118, width: 0, height: 8, class: 'ruler' }, lw);
    var lTau = T(lw, 30, 148, '', 't-h');
    var RX = lin(0, 6, 300, 540), RY = function (v) { return 120 - 70 * v; };
    var lr = el('g', {}, life);
    axis(lr, 300, 120, 542, 120);
    T(lr, 300, -66, 'P(E)', 't-s'); T(lr, 542, 136, 'E', 't-s end');
    T(lr, r1(RX(E0)), 136, 'E₀', 't-s mid');
    var lLor = path(lr, 'fillcurve fn');
    var lBr = el('line', { x1: 0, y1: 0, x2: 0, y2: 0, class: 'hw' }, lr);
    var lr1 = T(lr, 300, 162, '', 't-n'), lr2 = T(lr, 300, 190, '', 't-b');

    // --------------------------------------------------------------------------------------
    return {
      render: {
        intro: function (t) {
          var s = t < 0.5 ? logLerp(1.2, 0.4, ease(seg(t, 0.06, 0.46))) : logLerp(0.4, Math.SQRT1_2, ease(seg(t, 0.52, 0.9)));
          var sp_ = 1 / (2 * s);
          set(introPsi, 'd', curve(function (x) { return gauss(x, 0, s); }, -4, 4, 160, IX, function (v) { return -30 - 85 * v; }, -118, -30) + 'Z');
          set(introPhi, 'd', curve(function (p) { return gauss(p, 0, sp_); }, -4, 4, 160, IX, function (v) { return 120 - 85 * v; }, 34, 120) + 'Z');
          set(introBx, 'd', hBracket(IX(-s), IX(s), -14));
          set(introBp, 'd', hBracket(IX(-Math.min(sp_, 4)), IX(Math.min(sp_, 4)), 136));
          text(introLx, 'Δx = ' + number(s));
          text(introLp, 'Δp = ' + number(sp_));
          var px = PX(s), py = PY(sp_);
          set(introDot, 'cx', r1(px)); set(introDot, 'cy', r1(py));
          set(introGuide, 'd', 'M340 ' + r1(py) + 'H' + r1(px) + 'V150');
          set(introProd, 'x', r1(px + 12)); set(introProd, 'y', r1(py - 10));
          text(introProd, 'ΔxΔp = ' + number(s * sp_));
          hot(introEq, t < 0.5 ? ['x', 'p'] : ['b']);
          live.intro = [['位置寬度', number(s), 'hl'], ['動量寬度', number(sp_), 'ng'], ['乘積', number(s * sp_) + ' ħ']];
        },
        waves: function (t) {
          var W = logLerp(6.8, 1.25, ease(seg(t, 0.08, 0.78))), a = -W / 2, n = Math.floor(W + 1e-9), rest = W - n;
          set(winRect, 'x', r1(WX(a))); set(winRect, 'width', r1(WX(W) - WX(0)));
          set(winWave, 'd', curve(function (x) { return Math.cos(TAU * x); }, a, a + W, Math.max(40, Math.round(W * 60)), WX, WY, -110, 0));
          crests.forEach(function (c) { show(c.dot, Math.abs(c.x) <= W / 2 ? 1 : 0); });
          var px = WX(1) - WX(0);
          rulerFull.forEach(function (r, i) {
            set(r, 'x', r1(WX(a) + i * px)); set(r, 'width', i < n ? r1(px - 1) : 0);
          });
          set(rulerRest, 'x', r1(WX(a) + n * px)); set(rulerRest, 'width', r1(rest * px));
          text(wavesCount, '數得出 ' + n + ' 個完整波長，剩下的 ' + number(rest) + ' 個看不準');
          set(spec, 'd', curve(function (k) { var u = (k - TAU) * W / 2; return Math.abs(u) < 1e-6 ? 1 : Math.pow(Math.sin(u) / u, 2); }, 0, 4 * Math.PI, 300, KX, KY, 70, 150) + 'Z');
          var k0 = TAU * n / W, k1 = TAU * (n + 1) / W;
          set(kBracket, 'd', hBracket(KX(k0), KX(Math.min(k1, 4 * Math.PI)), 178));
          text(kLabel, 'k 在 ' + number(k0) + ' 到 ' + number(k1) + ' 之間   ·   Δk ≈ 2π/Δx = ' + number(TAU / W));
          show(wavesEq2.node, ease(seg(t, 0.82, 0.96)));
          hot(wavesEq, t < 0.8 ? ['x', 'k'] : []);
          live.waves = [['窗口寬度', number(W), 'hl'], ['完整波長數', String(n)], ['波數寬度約', number(TAU / W), 'ng'], ['兩者相乘', '2π ≈ 6.28']];
        },
        spread: function (t) {
          var count = Math.round(NSAMP * ease(seg(t, 0.04, 0.6))), counts = [], i, sum = 0, sum2 = 0;
          for (i = 0; i < NBIN; i++) counts.push(0);
          for (i = 0; i < count; i++) {
            var v = samples[i];
            counts[Math.min(NBIN - 1, Math.floor((v + 2) / BIN))]++;
            sum += v; sum2 += v * v;
          }
          bins.forEach(function (b, j) {
            var h = count ? counts[j] / (count * BIN) * 180 : 0;
            set(b, 'y', r1(40 - h)); set(b, 'height', r1(h));
          });
          var mean = count ? sum / count : MU, x2 = count ? sum2 / count : MU * MU + SIG * SIG, sd = Math.sqrt(Math.max(0, x2 - mean * mean));
          show(lastDot, count ? 1 : 0);
          set(lastDot, 'cx', r1(SX(count ? samples[count - 1] : MU)));
          show(meanLine, count > 1 ? 1 : 0); show(sBracket, count > 1 ? 1 : 0); show(sMean, count > 1 ? 1 : 0);
          set(meanLine, 'x1', r1(SX(mean))); set(meanLine, 'x2', r1(SX(mean)));
          set(sBracket, 'd', hBracket(SX(mean - sd), SX(mean + sd), 58));
          set(sMean, 'x', r1(SX(mean)));
          text(sMean, '⟨x⟩ = ' + number(mean) + '   Δx = ' + number(sd));
          text(sCount, '已量 ' + count + ' 份');
          var kb = ease(seg(t, 0.62, 0.8)), kd = ease(seg(t, 0.82, 0.95));
          show(barsG, kb);
          set(barX2, 'width', r1(x2 * BARL * kb)); set(barM2, 'width', r1(mean * mean * BARL * kb));
          set(barDiff, 'x', r1(BAR0 + mean * mean * BARL)); set(barDiff, 'width', r1(sd * sd * BARL * kd));
          set(vX2, 'x', r1(BAR0 + x2 * BARL + 8)); text(vX2, number(x2));
          set(vM2, 'x', r1(BAR0 + mean * mean * BARL + 8)); text(vM2, number(mean * mean));
          set(vDiff, 'x', r1(BAR0 + (mean * mean + sd * sd / 2) * BARL)); show(vDiff, kd);
          text(vDiff, '(Δx)² = ' + number(x2) + ' − ' + number(mean * mean) + ' = ' + number(sd * sd));
          hot(spreadEq, t < 0.62 ? [] : t < 0.82 ? ['x2', 'm2'] : ['d']);
          live.spread = [['量測次數', String(count)], ['樣本平均', number(mean), 'hl'], ['樣本寬度', number(sd), 'hl'], ['理論寬度', number(SIG)]];
        },
        schwarz: function (t) {
          var th = lerp(100, 0, ease(seg(t, 0.06, 0.78))) * Math.PI / 180, c = Math.cos(th);
          var tip = [O[0] + L2 * c, O[1] - L2 * Math.sin(th)];
          set(vec2, 'x2', r1(tip[0])); set(vec2, 'y2', r1(tip[1]));
          set(v2Label, 'x', r1(tip[0] - 10)); set(v2Label, 'y', r1(tip[1] - 12));
          set(dropLine, 'x1', r1(tip[0])); set(dropLine, 'y1', r1(tip[1])); set(dropLine, 'x2', r1(tip[0])); set(dropLine, 'y2', O[1]);
          set(projSeg, 'x2', r1(tip[0]));
          var rA = 34;
          set(arc, 'd', 'M' + (O[0] + rA) + ' ' + O[1] + 'A' + rA + ' ' + rA + ' 0 0 0 ' + r1(O[0] + rA * c) + ' ' + r1(O[1] - rA * Math.sin(th)));
          text(thetaLabel, 'θ = ' + Math.round(th * 180 / Math.PI) + '°');
          var dot2 = 0.64 * c * c, h = dot2 * SBH;
          set(dotBar, 'y', r1(SB0 - h)); set(dotBar, 'height', r1(h));
          set(dotVal, 'y', r1(SB0 - h - 10)); text(dotVal, number(dot2));
          show(schEq2.node, ease(seg(t, 0.82, 0.96)));
          hot(schEq, t < 0.8 ? ['c'] : ['a', 'b', 'c']);
          live.schwarz = [['夾角', Math.round(th * 180 / Math.PI) + '°'], ['長度乘積平方', '0.64'], ['內積平方', number(dot2), 'hl'], ['等號', th < 1e-6 ? '成立：V₂ ∥ V₁' : '還沒']];
        },
        split: function (t) {
          var kap = lerp(1, 0, ease(seg(t, 0.1, 0.85))), re = kap * SIGSQ, im = 0.5, mod = Math.sqrt(re * re + im * im);
          var zx = ZO[0] + re * ZS, zy = ZO[1] - im * ZS;
          set(reArrow, 'x2', r1(zx));
          set(imArrow, 'x1', r1(zx)); set(imArrow, 'x2', r1(zx)); set(imArrow, 'y2', r1(zy));
          set(zArrow, 'x2', r1(zx)); set(zArrow, 'y2', r1(zy));
          set(zDot, 'cx', r1(zx)); set(zDot, 'cy', r1(zy));
          set(zLabel, 'x', r1(zx + 8)); set(zLabel, 'y', r1(zy - 8));
          set(zCircle, 'r', r1(mod * ZS));
          var s = Math.sqrt(SIGSQ), dp = Math.sqrt(1 / (4 * SIGSQ) + kap * kap * SIGSQ), dd = [];
          for (var i = 0; i <= 64; i++) {
            var a = TAU * i / 64, x = s * Math.cos(a), p = kap * s * Math.cos(a) + Math.sin(a) / (2 * s);
            dd.push((i ? 'L' : 'M') + r1(PS[0] + x * PSS) + ' ' + r1(PS[1] - p * PSS));
          }
          set(ell, 'd', dd.join('') + 'Z');
          set(box, 'x', r1(PS[0] - s * PSS)); set(box, 'y', r1(PS[1] - dp * PSS));
          set(box, 'width', r1(2 * s * PSS)); set(box, 'height', r1(2 * dp * PSS));
          set(chirpLine, 'x1', r1(PS[0] - 1.2 * PSS)); set(chirpLine, 'y1', r1(PS[1] + kap * 1.2 * PSS));
          set(chirpLine, 'x2', r1(PS[0] + 1.2 * PSS)); set(chirpLine, 'y2', r1(PS[1] - kap * 1.2 * PSS));
          text(zr1, 'Re z = Cov(x, p) = ' + number(re));
          text(zr2, 'Im z = ½⟨Γ⟩ = ' + number(im));
          text(zr3, 'ΔxΔp = |z| = ' + number(s * dp));
          text(zr4, '≥ |Im z| = ħ/2 = 0.50');
          hot(splitEq, t < 0.85 ? ['re'] : ['im']);
          live.split = [['相位彎曲', 'κ = ' + number(kap), 'hl'], ['實部（相關）', number(re), 'hl'], ['虛部', '0.50', 'ng'], ['乘積', number(s * dp) + ' ħ']];
        },
        cmin: function (t) {
          var deg = t < 0.33 ? lerp(-60, 0, ease(seg(t, 0.06, 0.3))) : t < 0.62 ? lerp(0, 30, ease(seg(t, 0.36, 0.58))) : lerp(30, 90, ease(seg(t, 0.66, 0.88)));
          var al = deg * Math.PI / 180, cr = Math.cos(al), cim = Math.sin(al);
          var cx = CO[0] + cr * CS, cy = CO[1] - cim * CS;
          set(cArrow, 'x2', r1(cx)); set(cArrow, 'y2', r1(cy));
          set(cDot, 'cx', r1(cx)); set(cDot, 'cy', r1(cy));
          set(cLabel, 'x', r1(cx + 9)); set(cLabel, 'y', r1(cy - 9));
          // psi = exp(i c x^2 / 2) = exp(-Im c x^2/2) * exp(i Re c x^2/2)
          set(cAbs, 'd', curve(function (x) { return Math.exp(-cim * x * x / 2); }, -3, 3, 200, QX, QY, -90, 140));
          set(cRe, 'd', curve(function (x) { return Math.exp(-cim * x * x / 2) * Math.cos(cr * x * x / 2); }, -3, 3, 300, QX, QY, -90, 140));
          var ok = cim > 1e-6;
          text(cr1, 'c = ' + number(cr) + (cim < 0 ? ' − ' : ' + ') + number(Math.abs(cim)) + 'i');
          text(cr2, ok ? '可歸一化 ✓' : (cim < -1e-6 ? '往兩邊爆開 ✗' : '|ψ| 不衰減 ✗'));
          text(cr3, ok ? 'ΔxΔp = ħ / (2 sin α) = ' + number(0.5 / cim) + ' ħ' : 'ΔxΔp 沒有定義');
          cr2.classList.toggle('t-n', !ok);
          hot(cEq, ['c']);
          live.cmin = [['常數的角度', 'α = ' + Math.round(deg) + '°', 'hl'], ['實部', number(cr)], ['虛部', number(cim)], ['乘積', ok ? number(0.5 / cim) + ' ħ' : '—', ok ? 'hl' : 'ng']];
        },
        shapes: function (t) {
          rows.forEach(function (r, i) {
            var k = ease(seg(t, 0.04 + i * 0.12, 0.2 + i * 0.12));
            show(r.g, ease(seg(t, i * 0.12, 0.06 + i * 0.12)));
            set(r.bar, 'width', r1(r.s.product * HBL * k));
            set(r.lab, 'x', r1(HB0 + r.s.product * HBL * k + 8));
            text(r.lab, number(r.s.product * k, 3));
          });
        },
        atom: function (t) {
          var d = t < 0.45 ? logLerp(3.4, 0.45, ease(seg(t, 0.06, 0.42))) : logLerp(0.45, ATOM_DX, ease(seg(t, 0.5, 0.88)));
          set(aPacket, 'd', curve(function (x) { return gauss(x, 0, d); }, -4, 4, 200, AX, function (v) { return AV0 - 70 * v; }, -130, AV0) + 'Z');
          set(aBr, 'd', hBracket(AX(-Math.min(d, 4)), AX(Math.min(d, 4)), 146));
          text(aDx, 'Δx = ' + number(d) + ' a₀');
          var K = kinetic(d), V = potential(d), E = K + V, ey = Math.max(-100, Math.min(116, EY(E)));
          set(aGuide, 'x1', r1(EX(d))); set(aGuide, 'x2', r1(EX(d)));
          set(aDot, 'cx', r1(EX(d))); set(aDot, 'cy', r1(ey));
          text(ar1, '動能 ' + signed(K * HARTREE_EV, 1) + '  位能 ' + signed(V * HARTREE_EV, 1) + ' eV');
          text(ar2, 'E₀ = ' + signed(E * HARTREE_EV, 2) + ' eV（最低 ' + number(ATOM_E * HARTREE_EV, 2) + '）');
          hot(aEq, d < 0.8 ? ['k'] : d > 2 ? ['v'] : ['e']);
          live.atom = [['寬度', number(d) + ' a₀', 'hl'], ['動能', signed(K * HARTREE_EV, 1) + ' eV'], ['位能', signed(V * HARTREE_EV, 1) + ' eV', 'ng'], ['總能', signed(E * HARTREE_EV, 2) + ' eV']];
        },
        mt: function (t) {
          var tm = t < 0.62 ? lerp(0.25, 2.9, ease(seg(t, 0.05, 0.6))) : lerp(2.9, Math.PI / 2, ease(seg(t, 0.64, 0.9)));
          var c = Math.cos(tm), mx = meanX(tm), dx = spreadX(tm), v = -Math.sin(tm) / SQ2, prod = mtProduct(tm);
          set(mDens, 'd', curve(function (x) {
            var g = Math.exp(-x * x) / Math.sqrt(Math.PI);
            return 0.5 * g * (1 + 2 * x * x + 2 * SQ2 * x * c);
          }, -3.5, 3.5, 200, MX, MY, -92, 10) + 'Z');
          set(mBand, 'x', r1(MX(mx - dx))); set(mBand, 'width', r1(MX(dx) - MX(0)) * 2);
          set(mMean, 'x1', r1(MX(mx))); set(mMean, 'x2', r1(MX(mx)));
          set(mVel, 'x1', r1(MX(mx))); set(mVel, 'x2', r1(MX(mx) + v * 90));
          text(mr[0], '⟨X⟩ = ' + number(mx) + '    ΔX = ' + number(dx));
          text(mr[1], '|d⟨X⟩/dt| = ' + number(Math.abs(v)));
          text(mr[2], 'Δtₓ = ' + number(dx / Math.abs(v)) + '    ΔE = ' + number(DE));
          text(mr[3], 'ΔE · Δtₓ = ' + number(prod) + ' ħ');
          set(mDot, 'cx', r1(TX(tm))); set(mDot, 'cy', r1(Math.max(-62, TY(prod))));
          hot(mtEq, ['t']);
          live.mt = [['時間', 'ωt = ' + number(tm)], ['位置寬度', number(dx), 'hl'], ['平均位置的速度', number(Math.abs(v)), 'ng'], ['乘積', number(prod) + ' ħ', 'hl']];
        },
        life: function (t) {
          var tau = t < 0.5 ? lerp(1, 4, ease(seg(t, 0.06, 0.45))) : lerp(4, 2, ease(seg(t, 0.52, 0.88))), g = 1 / (2 * tau);
          set(lEnv, 'd', curve(function (x) { return Math.exp(-x * g); }, 0, 12, 120, LX, LY, -80, 120) + curve(function (x) { return -Math.exp(-x * g); }, 0, 12, 120, LX, LY, -80, 120));
          set(lWave, 'd', curve(function (x) { return Math.exp(-x * g) * Math.cos(E0 * x); }, 0, 12, 480, LX, LY, -80, 120));
          set(lRuler, 'width', r1(LX(tau) - LX(0)));
          text(lTau, 'τ = ' + number(tau));
          var P = function (E) { return g / Math.PI / ((E - E0) * (E - E0) + g * g); }, top = P(E0);
          set(lLor, 'd', curve(P, 0, 6, 300, RX, RY, -100, 120) + 'Z');
          var hy = RY(top / 2);
          set(lBr, 'x1', r1(RX(E0 - g))); set(lBr, 'x2', r1(RX(E0 + g))); set(lBr, 'y1', r1(hy)); set(lBr, 'y2', r1(hy));
          text(lr1, '半寬 ΔE = ħ/2τ = ' + number(g, 3));
          text(lr2, 'τ · ΔE = ' + number(tau * g) + ' ħ');
          hot(lEq, ['t', 'e']);
          live.life = [['壽命', 'τ = ' + number(tau), 'hl'], ['半寬', number(g, 3), 'ng'], ['乘積', number(tau * g) + ' ħ']];
        }
      },
      facts: {
        shapes: SHAPES.map(function (s, i) { return [s.name, number(s.product, 3) + ' ħ', i === 0 ? 'hl' : '']; })
      }
    };
  }
})();
