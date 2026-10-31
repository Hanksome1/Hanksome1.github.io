/* ==========================================================================
   VLSI 導覽（layout: vlsi-tour）：黑底發表會式的捲動導覽，版型同 /lab/iclab/。
   上半是 ART：各站的畫面，從 full-custom 流程、process corner、MOS、反相器、邏輯閘、
   導線 RC、時序，一路到 SRAM、期末的 ROM macro 和功耗。
   每個 scene 都是 make(parent) → { set(t, fin) }，t 是 0–1 的進度，畫面是 t 的純函式；
   fin 只有 finale 那個場景會拿到，是拉遠的進度。顏色全部用 class，由 css/vlsi-tour.css 決定。
   下半是舞台：捲動進度 p 決定現在是哪一拍。哪一拍用哪個場景寫在 HTML 的 data-scene。
   ========================================================================== */
var ART = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, a, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function T(parent, x, y, s, cls, anchor) { var t = el('text', { x: x, y: y, class: cls, 'text-anchor': anchor }, parent); t.textContent = s; return t; }
  // 有下標的文字：parts 是 [[字, 'sub'], ...]，第二格是 'sub' 的那一段畫成下標
  function TS(parent, x, y, parts, cls, anchor) {
    var t = el('text', { x: x, y: y, class: cls, 'text-anchor': anchor }, parent);
    parts.forEach(function (p) {
      var s = typeof p === 'string' ? [p] : p, ts = el('tspan', s[1] === 'sub' ? { class: 'a-sub', dy: 3 } : {}, t);
      ts.textContent = s[0];
      if (s[1] === 'sub') { var back = el('tspan', { dy: -3 }, t); back.textContent = '​'; }
    });
    return t;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // 用 pathLength=1 的 dash 把線「畫出來」
  function wire(parent, d, cls) { return el('path', { d: d, class: cls || 'a-wire', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, parent); }
  function draw(p, k) { p.setAttribute('stroke-dashoffset', 1 - clamp01(k)); }
  function show(e, k, dy) { k = clamp01(k); e.style.opacity = k; e.style.transform = dy ? 'translateY(' + ((1 - ease(k)) * dy) + 'px)' : ''; }
  function curve(f, x0, w, y0, h, n) { var d = ''; for (var i = 0; i <= (n || 60); i++) { var s = i / (n || 60); d += (i ? ' L' : 'M') + (x0 + w * s).toFixed(1) + ' ' + (y0 - h * f(s)).toFixed(1); } return d; }
  function ground(g, x, y) { el('path', { d: 'M' + (x - 9) + ' ' + y + ' H' + (x + 9) + ' M' + (x - 5.5) + ' ' + (y + 4) + ' H' + (x + 5.5) + ' M' + (x - 2) + ' ' + (y + 8) + ' H' + (x + 2), class: 'a-gnd' }, g); }
  function axes(g, x0, y0, w, h, xl, yl) {
    var a = wire(g, 'M' + x0 + ' ' + (y0 - h) + ' V' + y0 + ' H' + (x0 + w), 'a-axis');
    var lab = el('g', {}, g);
    if (xl) TS(lab, x0 + w, y0 + 20, xl, 'a-lab a-dim', 'end');
    if (yl) TS(lab, x0 - 8, y0 - h + 4, yl, 'a-lab a-dim', 'end');
    return { axis: a, lab: lab };
  }
  // 電晶體畫成開關：一個框、gate 的名字寫在框裡，PMOS 左邊多一個小圈
  function fet(g, x, y, name, pmos, w) {
    var f = el('g', { class: 'a-fet' + (pmos ? ' is-p' : ' is-n') }, g); w = w || 36;
    el('rect', { x: x - w / 2, y: y - 14, width: w, height: 28, rx: 5, class: 'a-cell' }, f);
    if (pmos) el('circle', { cx: x - w / 2 - 5, cy: y, r: 3.6, class: 'a-bubble' }, f);
    T(f, x, y + 5, name, 'a-fname', 'middle');
    return f;
  }

  /* ---------- 1. Full-custom 流程：七個步驟依序打勾 ---------- */
  var FLOW = [
    ['Schematic', 'Virtuoso', '每顆 W/L'], ['Pre-layout sim', 'HSPICE', '5 corners'], ['Layout', 'Virtuoso', '7,818 µm²'],
    ['DRC', 'Calibre', 'clean'], ['LVS', 'Calibre', 'clean'], ['PEX', 'Calibre xRC', 'R · C'], ['Post-layout sim', 'HSPICE', '1.56 ns']
  ];
  function flow(g) {
    el('rect', { x: 0, y: 0, width: 560, height: 370, rx: 10, class: 'win' }, g);
    el('path', { d: 'M0 36 H560', class: 'win-bar' }, g);
    T(g, 20, 23, 'rom_macro · full-custom flow', 'a-lab'); T(g, 540, 23, 'EE3230', 'a-lab a-dim', 'end');
    var spine = wire(g, 'M44 72 V' + (72 + 6 * 44), 'a-wire a-fb'), rows = [];
    FLOW.forEach(function (f, i) {
      var y = 72 + i * 44, r = el('g', {}, g);
      var dot = el('circle', { cx: 44, cy: y, r: 7, class: 'f-dot' }, r);
      T(r, 70, y + 5, f[0], 'c-sub'); T(r, 250, y + 5, f[1], 'a-lab a-dim');
      var ok = T(r, 536, y + 5, f[2], 'a-lab ' + (f[2] === 'clean' ? 'f-ok' : 'f-val'), 'end');
      rows.push({ g: r, dot: dot, ok: ok });
    });
    return { set: function (t) {
      draw(spine, seg(t, 0, 0.85));
      rows.forEach(function (r, i) {
        var a = 0.02 + i * 0.12;
        show(r.g, seg(t, a, a + 0.08), 6);
        r.dot.classList.toggle('on', t >= a + 0.1);
        r.ok.style.opacity = seg(t, a + 0.08, a + 0.14);
      });
    } };
  }

  /* ---------- 2. Process corner：五個點，標上 ROM 的 pre-sim access time ---------- */
  function corner(g) {
    var X0 = 70, Y0 = 330, ax = axes(g, X0, Y0, 440, 320, [['V', ''], ['TN', 'sub'], ' → 慢'], [['|V', ''], ['TP', 'sub'], '|']);
    var box = wire(g, 'M150 70 H430 V280 H150 Z', 'a-range');
    var P = [['TT', 290, 175, '1.34 ns'], ['FF', 150, 280, '1.21 ns'], ['SS', 430, 70, '1.98 ns'], ['FS', 150, 70, '1.46 ns'], ['SF', 430, 280, '1.92 ns']], pts = [];
    P.forEach(function (c) {
      var pg = el('g', {}, g), slow = c[0] === 'SS' || c[0] === 'SF';
      el('circle', { cx: c[1], cy: c[2], r: 9, class: 'k-dot' + (slow ? ' is-slow' : '') }, pg);
      var right = c[1] < 300;
      T(pg, c[1] + (right ? 18 : -18), c[2] - 3, c[0], 'k-name', right ? null : 'end');
      T(pg, c[1] + (right ? 18 : -18), c[2] + 15, c[3], 'a-lab' + (slow ? ' k-slow' : ' a-dim'), right ? null : 'end');
      pts.push(pg);
    });
    var note = el('g', {}, g);
    T(note, 290, 372, '期末 ROM 的 pre-sim 平均 access time · spec < 5 ns', 'a-lab a-dim', 'middle');
    T(note, 290, 394, 'NMOS 慢的 SS、SF 最慢：bit line 靠 cell 的 NMOS 放電', 'a-lab k-slow', 'middle');
    return { set: function (t) {
      draw(ax.axis, seg(t, 0, 0.2)); show(ax.lab, seg(t, 0.1, 0.25)); draw(box, seg(t, 0.1, 0.35));
      pts.forEach(function (p, i) { show(p, seg(t, 0.3 + i * 0.09, 0.42 + i * 0.09), 6); });
      show(note.children[0], seg(t, 0.7, 0.85)); show(note.children[1], seg(t, 0.85, 1));
      g.classList.toggle('is-hl', t > 0.85);
    } };
  }

  /* ---------- 3. MOS：NMOS 傳 0 傳到底，傳 1 只到 V_DD − V_Tn ---------- */
  function mos(g) {
    var sch = el('g', {}, g);
    T(sch, 20, 138, 'in', 'a-lab'); el('circle', { cx: 50, cy: 150, r: 3.5, class: 'a-dot' }, sch);
    var w1 = wire(sch, 'M50 150 H96', 'a-wire'), w2 = wire(sch, 'M184 150 H240', 'a-wire');
    el('path', { d: 'M96 150 V164 H184 V150', class: 'a-chan' }, sch);
    el('path', { d: 'M100 176 H180', class: 'a-gate' }, sch);
    var w3 = wire(sch, 'M140 176 V214', 'a-wire a-ctl');
    TS(sch, 140, 232, ['G = V', ['DD', 'sub']], 'a-lab', 'middle'); T(sch, 140, 130, 'NMOS', 'a-lab a-dim', 'middle');
    el('circle', { cx: 240, cy: 150, r: 3.5, class: 'a-dot' }, sch); T(sch, 240, 136, 'out', 'a-lab', 'middle');
    var w4 = wire(sch, 'M240 150 V176 M228 176 H252 M228 184 H252 M240 184 V204', 'a-wire');
    ground(sch, 240, 204); TS(sch, 258, 186, ['C', ['L', 'sub']], 'a-lab a-dim');
    var X0 = 310, Y0 = 300, W = 270, H = 250;
    var ax = axes(g, X0, Y0, W, H, ['t'], [['V', ''], ['out', 'sub']]);
    var ref = el('g', {}, g);
    el('path', { d: 'M' + X0 + ' ' + (Y0 - H * 0.92) + ' H' + (X0 + W), class: 'a-ref' }, ref); TS(ref, X0 + W, Y0 - H * 0.92 - 8, ['V', ['DD', 'sub']], 'a-lab a-dim', 'end');
    el('path', { d: 'M' + X0 + ' ' + (Y0 - H * 0.66) + ' H' + (X0 + W), class: 'a-ref is-hot' }, ref); TS(ref, X0 + W, Y0 - H * 0.66 - 8, ['V', ['DD', 'sub'], ' − V', ['Tn', 'sub']], 'a-lab k-slow', 'end');
    var c0 = wire(g, curve(function (s) { return 0.92 * Math.exp(-6 * s); }, X0, W, Y0, H), 'a-curve');
    var c1 = wire(g, curve(function (s) { return 0.66 * (1 - Math.exp(-5 * s)); }, X0, W, Y0, H), 'a-curve is-hot');
    var lab = el('g', {}, g);
    T(lab, X0 + 150, Y0 - 30, '傳 0：strong 0', 'a-lab', null); T(lab, X0 + 120, Y0 - H * 0.66 + 26, '傳 1：weak 1', 'a-lab k-slow');
    return { set: function (t) {
      show(sch, seg(t, 0, 0.15)); draw(w1, seg(t, 0.05, 0.2)); draw(w3, seg(t, 0.1, 0.25)); draw(w2, seg(t, 0.15, 0.3)); draw(w4, seg(t, 0.2, 0.35));
      draw(ax.axis, seg(t, 0.15, 0.3)); show(ax.lab, seg(t, 0.2, 0.35)); show(ref.children[0], seg(t, 0.25, 0.35)); show(ref.children[1], seg(t, 0.25, 0.35));
      [2, 3].forEach(function (i) { show(ref.children[i], seg(t, 0.6, 0.75)); });
      draw(c0, seg(t, 0.3, 0.55)); draw(c1, seg(t, 0.5, 0.8));
      show(lab.children[0], seg(t, 0.5, 0.6)); show(lab.children[1], seg(t, 0.75, 0.9));
    } };
  }

  /* ---------- 4. 反相器：電路 + VTC，切換點與 noise margin ---------- */
  var VTC_K = 14;
  function vtcF(shift) { return function (s) { return 1 / (1 + Math.exp(VTC_K * (s - 0.5 - (shift || 0)))); }; }
  function inv(g) {
    var sch = el('g', {}, g);
    T(sch, 110, 16, 'VDD', 'a-lab a-dim', 'middle');
    var ws = [wire(sch, 'M80 24 H140', 'a-wire a-vddw'), wire(sch, 'M110 24 V66', 'a-wire'), wire(sch, 'M110 114 V226', 'a-wire'), wire(sch, 'M110 274 V300', 'a-wire'),
      wire(sch, 'M110 170 H190', 'a-wire'), wire(sch, 'M20 170 H52 M52 90 V250 M52 90 H68 M52 250 H72', 'a-wire a-ctl')];
    ground(sch, 110, 300);
    var P = fet(sch, 110, 90, 'P', true), N = fet(sch, 110, 250, 'N', false);
    T(sch, 20, 158, 'in', 'a-lab'); T(sch, 190, 158, 'out', 'a-lab', 'end'); el('circle', { cx: 110, cy: 170, r: 3.5, class: 'a-dot' }, sch);
    var X0 = 260, Y0 = 320, W = 300, H = 300;
    var ax = axes(g, X0, Y0, W, H, [['V', ''], ['in', 'sub']], [['V', ''], ['out', 'sub']]);
    var diag = wire(g, 'M' + X0 + ' ' + Y0 + ' L' + (X0 + W) + ' ' + (Y0 - H), 'a-ref-w');
    var ghost = [wire(g, curve(vtcF(-0.09), X0, W, Y0, H), 'a-curve is-ghost'), wire(g, curve(vtcF(0.09), X0, W, Y0, H), 'a-curve is-ghost')];
    var gl = el('g', {}, g); T(gl, X0 + W * 0.36, Y0 - H * 0.52, 'FS', 'a-tiny', 'end'); T(gl, X0 + W * 0.66, Y0 - H * 0.52, 'SF', 'a-tiny');
    var main = wire(g, curve(vtcF(0), X0, W, Y0, H, 80), 'a-curve is-hot');
    var vm = el('g', {}, g); el('circle', { cx: X0 + W / 2, cy: Y0 - H / 2, r: 6, class: 'k-dot is-slow' }, vm); TS(vm, X0 + W / 2 + 12, Y0 - H / 2 - 8, ['V', ['M', 'sub']], 'a-lab k-slow');
    // 斜率 −1 的兩點：v(1 − v) = 1/k
    var r = Math.sqrt(1 - 4 / VTC_K), vil = 0.5 + Math.log(1 / ((1 + r) / 2) - 1) / VTC_K, vih = 0.5 + Math.log(1 / ((1 - r) / 2) - 1) / VTC_K;
    var nm = el('g', {}, g);
    [[vil, 'IL'], [vih, 'IH']].forEach(function (v) {
      var x = X0 + W * v[0], y = Y0 - H * vtcF(0)(v[0]);
      el('path', { d: 'M' + x + ' ' + y + ' V' + Y0, class: 'a-ref' }, nm); el('circle', { cx: x, cy: y, r: 3.5, class: 'a-dot' }, nm);
      TS(nm, x, Y0 + 20, ['V', [v[1], 'sub']], 'a-lab', 'middle');
    });
    return { set: function (t) {
      show(sch, seg(t, 0, 0.12)); ws.forEach(function (w, i) { draw(w, seg(t, 0.03 + i * 0.03, 0.15 + i * 0.03)); });
      show(P, seg(t, 0.05, 0.2), 6); show(N, seg(t, 0.1, 0.25), 6);
      draw(ax.axis, seg(t, 0.2, 0.32)); show(ax.lab, seg(t, 0.25, 0.35)); draw(diag, seg(t, 0.3, 0.42));
      draw(main, seg(t, 0.35, 0.6)); show(vm, seg(t, 0.58, 0.68)); show(nm, seg(t, 0.66, 0.78));
      ghost.forEach(function (w) { draw(w, seg(t, 0.78, 0.95)); }); show(gl, seg(t, 0.9, 1));
    } };
  }

  /* ---------- 5. Inverter chain：推 64 倍負載，串幾級最快 ---------- */
  function chain(g) {
    var top = el('g', {}, g), stg = [];
    var S = [[1, 40], [4, 150], [16, 285]], cy = 70;
    var lines = wire(top, 'M0 ' + cy + ' H40 M58 ' + cy + ' H150 M190 ' + cy + ' H285 M345 ' + cy + ' H470', 'a-wire');
    S.forEach(function (s) {
      var h = 18 + Math.log2(s[0]) * 10, w = h * 0.95, x = s[1], sg = el('g', {}, top);
      el('path', { d: 'M' + x + ' ' + (cy - h / 2) + ' L' + (x + w) + ' ' + cy + ' L' + x + ' ' + (cy + h / 2) + ' Z', class: 'a-cell' }, sg);
      el('circle', { cx: x + w + 4, cy: cy, r: 3.5, class: 'a-bubble' }, sg);
      T(sg, x + w / 2 - 4, cy + h / 2 + 20, '×' + s[0], 'a-lab', 'middle');
      stg.push(sg);
    });
    var load = el('g', {}, top);
    el('path', { d: 'M470 ' + cy + ' V' + (cy + 18) + ' M450 ' + (cy + 18) + ' H490 M450 ' + (cy + 26) + ' H490 M470 ' + (cy + 26) + ' V' + (cy + 44), class: 'a-wire' }, load);
    ground(load, 470, cy + 44); TS(load, 500, cy + 26, ['C', ['L', 'sub'], ' = 64 C', ['g', 'sub']], 'a-lab');
    var D = [[1, '64', 65], [2, '8', 18], [3, '4', 15], [4, '2.83', 15.3]], bars = [], X0 = 150, BW = 400;
    var head = TS(g, 0, 182, ['t', ['p', 'sub'], ' / t', ['p0', 'sub'], '（F = 64，γ = 1）'], 'a-lab a-dim');
    D.forEach(function (d, i) {
      var y = 204 + i * 44, bg = el('g', {}, g);
      T(bg, 0, y + 18, 'N = ' + d[0], 'c-sub'); T(bg, 70, y + 18, 'f = ' + d[1], 'a-lab a-dim');
      var r = el('rect', { x: X0, y: y + 4, width: 0, height: 20, rx: 3, class: 'b-bar' + (d[0] === 3 ? ' is-hot' : '') }, bg);
      var v = T(bg, X0, y + 19, String(d[2]), 'a-lab' + (d[0] === 3 ? ' k-slow' : ''));
      bars.push({ g: bg, r: r, v: v, w: BW * d[2] / 65 });
    });
    return { set: function (t) {
      draw(lines, seg(t, 0, 0.3)); stg.forEach(function (s, i) { show(s, seg(t, 0.03 + i * 0.08, 0.15 + i * 0.08), 6); }); show(load, seg(t, 0.2, 0.3));
      show(head, seg(t, 0.3, 0.4));
      bars.forEach(function (b, i) {
        var k = ease(seg(t, 0.35 + i * 0.1, 0.55 + i * 0.1));
        show(b.g, seg(t, 0.35 + i * 0.1, 0.4 + i * 0.1));
        b.r.setAttribute('width', b.w * k); b.v.setAttribute('x', X0 + b.w * k + 10);
      });
    } };
  }

  /* ---------- 6. Static CMOS：F = ¬(A·B + C)，PUN 和 PDN 互為對偶 ---------- */
  function cmos(g) {
    var wires = [], parts = [];
    var pun = el('g', {}, g), pdn = el('g', {}, g);
    T(g, 230, 8, 'VDD', 'a-lab a-dim', 'middle');
    wires.push(wire(pun, 'M150 16 H310', 'a-wire a-vddw'));
    // PUN：A、B 並聯，再串 C
    wires.push(wire(pun, 'M180 16 V42 M280 16 V42 M180 70 V92 M280 70 V92 M180 92 H280 M230 92 V116 M230 144 V176', 'a-wire'));
    parts.push(fet(pun, 180, 56, 'A', true), fet(pun, 280, 56, 'B', true), fet(pun, 230, 130, 'C', true));
    // 輸出
    var out = wire(g, 'M180 176 H420', 'a-wire'); var od = el('circle', { cx: 230, cy: 176, r: 3.5, class: 'a-dot' }, g);
    var fl = T(g, 428, 181, 'F', 'f-name');
    // PDN：A、B 串聯，和 C 並聯
    wires.push(wire(pdn, 'M180 176 V200 M180 228 V246 M180 274 V300 M280 176 V236 M280 264 V300 M180 300 H280 M230 300 V318', 'a-wire'));
    parts.push(fet(pdn, 180, 214, 'A', false), fet(pdn, 180, 260, 'B', false), fet(pdn, 280, 250, 'C', false));
    ground(pdn, 230, 318);
    var lab = el('g', {}, g);
    T(lab, 0, 60, 'PUN', 'k-name'); T(lab, 0, 80, 'PMOS · 上拉', 'a-lab a-dim');
    T(lab, 0, 240, 'PDN', 'k-name'); T(lab, 0, 260, 'NMOS · 下拉', 'a-lab a-dim');
    var eq = el('g', {}, g);
    T(eq, 600, 60, 'F = ¬(A·B + C)', 'c-big', 'end');
    T(eq, 600, 84, '3 個輸入 → 2N = 6 顆', 'a-lab a-dim', 'end');
    var dual = el('g', {}, g);
    T(dual, 600, 232, 'PDN：A、B 串聯 ∥ C', 'a-lab', 'end'); T(dual, 600, 254, 'PUN：A、B 並聯 → C', 'a-lab', 'end');
    T(dual, 600, 284, '串聯 ↔ 並聯', 'a-lab k-slow', 'end');
    return { set: function (t) {
      show(eq, seg(t, 0, 0.12));
      draw(wires[2], seg(t, 0.08, 0.35)); [3, 4, 5].forEach(function (i) { show(parts[i], seg(t, 0.1 + (i - 3) * 0.06, 0.22 + (i - 3) * 0.06), 6); });
      draw(out, seg(t, 0.25, 0.4)); show(od, seg(t, 0.35, 0.4)); show(fl, seg(t, 0.35, 0.45)); show(lab.children[2], seg(t, 0.15, 0.25)); show(lab.children[3], seg(t, 0.15, 0.25));
      draw(wires[0], seg(t, 0.4, 0.5)); draw(wires[1], seg(t, 0.42, 0.7)); [0, 1, 2].forEach(function (i) { show(parts[i], seg(t, 0.45 + i * 0.06, 0.57 + i * 0.06), -6); });
      show(lab.children[0], seg(t, 0.5, 0.6)); show(lab.children[1], seg(t, 0.5, 0.6));
      show(dual, seg(t, 0.75, 0.9));
      g.classList.toggle('is-hl', t > 0.8);
    } };
  }

  /* ---------- 7. Dynamic logic：precharge → evaluate ---------- */
  function dyn(g) {
    var sch = el('g', {}, g), ws = [];
    T(sch, 110, 8, 'VDD', 'a-lab a-dim', 'middle');
    ws.push(wire(sch, 'M80 16 H140 M110 16 V42 M110 70 V120 M110 196 V226 M110 254 V280', 'a-wire'));
    ws.push(wire(sch, 'M110 96 H170 M170 96 V112 M158 112 H182 M158 120 H182 M170 120 V134', 'a-wire'));
    ground(sch, 170, 134); ground(sch, 110, 280);
    ws.push(wire(sch, 'M20 56 H66 M20 240 H86', 'a-wire a-clk'));
    var mp = fet(sch, 110, 56, 'M', true), me = fet(sch, 110, 240, 'M', false);
    mp.querySelector('text').textContent = 'Mp'; me.querySelector('text').textContent = 'Me';
    el('rect', { x: 70, y: 120, width: 80, height: 76, rx: 8, class: 'a-cell d-pdn' }, sch); T(sch, 110, 163, 'PDN', 'f-name', 'middle');
    T(sch, 20, 48, 'CLK', 'a-lab a-clkt'); T(sch, 20, 232, 'CLK', 'a-lab a-clkt'); T(sch, 180, 90, 'out', 'a-lab');
    TS(sch, 190, 124, ['C', ['L', 'sub']], 'a-lab a-dim'); T(sch, 40, 162, 'A B C', 'a-lab a-dim', 'middle');
    el('circle', { cx: 110, cy: 96, r: 3.5, class: 'a-dot' }, sch);
    var X0 = 270, P = 110, N = 3, uid = 'dy' + Math.random().toString(36).slice(2, 6);
    var cp = el('clipPath', { id: uid }, defsOf(g)), cr = el('rect', { x: X0, y: -20, width: 0, height: 400 }, cp);
    var body = el('g', { 'clip-path': 'url(#' + uid + ')' }, g), on = [1, 0, 1];
    for (var i = 0; i < N; i++) {
      el('rect', { x: X0 + i * P, y: 20, width: P / 2, height: 270, class: 'd-pre' }, body);
      el('rect', { x: X0 + i * P + P / 2, y: 20, width: P / 2, height: 270, class: 'd-eval' }, body);
    }
    var d = 'M' + X0 + ' 100'; for (i = 0; i < N; i++) d += ' H' + (X0 + i * P + P / 2) + ' V60 H' + (X0 + (i + 1) * P) + ' V100';
    el('path', { d: d, class: 'w-sig a-clkw' }, body);
    // out：precharge 時充到 1；evaluate 時 PDN 導通就放電，沒導通就停在 1（只存在 C_L 上）
    var lv = 0; d = 'M' + X0 + ' 220';
    for (i = 0; i < N; i++) {
      var x = X0 + i * P;
      if (!lv) d += ' L' + (x + 14) + ' 160';
      d += ' H' + (x + P / 2 + 6);
      if (on[i]) { d += ' L' + (x + P / 2 + 30) + ' 220 H' + (x + P); lv = 0; } else { d += ' H' + (x + P); lv = 1; }
    }
    el('path', { d: d, class: 'w-sig d-out' }, body);
    ['on', 'off', 'on'].forEach(function (s, i) { T(body, X0 + i * P + P * 0.75, 250, 'PDN ' + s, 'a-tiny', 'middle'); });
    T(body, X0 + P * 1.75, 150, '只存在電容上', 'a-tiny k-slow', 'middle');
    T(g, X0 - 8, 84, 'CLK', 'a-lab a-clkt', 'end'); T(g, X0 - 8, 194, 'out', 'a-lab', 'end');
    var ph = el('g', {}, g); T(ph, X0 + P / 2 - 4, 12, 'precharge', 'a-tiny', 'end'); T(ph, X0 + P / 2 + 4, 12, 'evaluate', 'a-tiny k-slow');
    T(ph, X0 + P * N, 312, 't →', 'a-tiny', 'end'); T(ph, X0, 312, 'CLK = 0 充電 · CLK = 1 求值', 'a-tiny');
    return { set: function (t) {
      show(sch, seg(t, 0, 0.12)); ws.forEach(function (w, i) { draw(w, seg(t, 0.02 + i * 0.08, 0.2 + i * 0.08)); });
      show(mp, seg(t, 0.05, 0.18), 6); show(me, seg(t, 0.1, 0.22), 6);
      cr.setAttribute('width', P * N * ease(seg(t, 0.3, 0.92))); show(ph, seg(t, 0.3, 0.42));
    } };
  }

  /* ---------- 8. 導線 RC：切成 N 段，Elmore delay → RC/2，延遲 ∝ L² ---------- */
  function rc(g) {
    var top = el('g', {}, g), segG = el('g', {}, top), X0 = 60, X1 = 560, Y = 60;
    el('path', { d: 'M8 ' + (Y - 14) + ' L36 ' + Y + ' L8 ' + (Y + 14) + ' Z', class: 'a-cell' }, top); T(top, 22, Y + 34, 'driver', 'a-tiny', 'middle');
    el('path', { d: 'M36 ' + Y + ' H' + X0, class: 'a-wire' }, top);
    var nT = T(g, 0, 160, '', 'c-sub'), tauT = T(g, 600, 160, '', 'c-big', 'end');
    var lastN = 0;
    function build(n) {
      while (segG.firstChild) segG.removeChild(segG.firstChild);
      var w = (X1 - X0) / n;
      for (var i = 0; i < n; i++) {
        var a = X0 + i * w, b = a + w, za = a + w * 0.18, zb = b - w * 0.18, zz = 'M' + a + ' ' + Y + ' H' + za, k = 6;
        for (var j = 0; j < k; j++) zz += ' L' + (za + (zb - za) * (j + 0.5) / k) + ' ' + (Y + (j % 2 ? 6 : -6));
        zz += ' L' + zb + ' ' + Y + ' H' + b;
        el('path', { d: zz, class: 'a-wire r-res' }, segG);
        el('path', { d: 'M' + b + ' ' + Y + ' V' + (Y + 22) + ' M' + (b - 8) + ' ' + (Y + 22) + ' H' + (b + 8) + ' M' + (b - 8) + ' ' + (Y + 28) + ' H' + (b + 8) + ' M' + b + ' ' + (Y + 28) + ' V' + (Y + 40), class: 'a-wire' }, segG);
        ground(segG, b, Y + 40);
        el('circle', { cx: b, cy: Y, r: 2.6, class: 'a-dot' }, segG);
      }
      T(segG, (X0 + X1) / 2, Y - 18, 'r·L/N  ×  N 段', 'a-tiny', 'middle');
    }
    var PX = 60, PY = 370, PW = 440, PH = 150;
    var ax = axes(g, PX, PY, PW, PH, ['L'], ['τ']);
    var par = wire(g, curve(function (s) { return s * s; }, PX, PW, PY, PH), 'a-curve is-hot');
    var lin = wire(g, curve(function (s) { return s; }, PX, PW, PY, PH, 4), 'a-curve is-ghost');
    var pl = el('g', {}, g);
    T(pl, PX + PW + 8, PY - PH + 4, 'τ = rcL²/2', 'a-lab k-slow');
    el('circle', { cx: PX + PW / 2, cy: PY - PH / 4, r: 4, class: 'a-dot' }, pl); el('circle', { cx: PX + PW, cy: PY - PH, r: 4, class: 'a-dot' }, pl);
    T(pl, PX + PW / 2 + 8, PY - PH / 4 + 18, 'L → τ', 'a-tiny'); T(pl, PX + PW - 8, PY - PH + 18, '2L → 4τ', 'a-tiny', 'end');
    return { set: function (t) {
      var n = t < 0.12 ? 1 : t < 0.24 ? 2 : t < 0.36 ? 4 : 8;
      if (n !== lastN) { build(n); lastN = n; }
      show(top, seg(t, 0, 0.08));
      nT.textContent = 'N = ' + n; tauT.textContent = 'τ = RC × ' + ((n + 1) / (2 * n)).toFixed(n > 4 ? 4 : 3).replace(/0+$/, '') + (n === 8 ? ' → ½' : '');
      show(nT, seg(t, 0.02, 0.1)); show(tauT, seg(t, 0.02, 0.1));
      draw(ax.axis, seg(t, 0.42, 0.55)); show(ax.lab, seg(t, 0.48, 0.58));
      draw(lin, seg(t, 0.52, 0.65)); draw(par, seg(t, 0.55, 0.8)); show(pl, seg(t, 0.78, 0.92));
    } };
  }

  /* ---------- 9. 時序：setup 怕慢、hold 怕快 ---------- */
  function timing(g) {
    var top = el('g', {}, g), ws = [];
    el('rect', { x: 20, y: 30, width: 66, height: 76, rx: 3, class: 'a-cell a-ff' }, top); T(top, 53, 74, 'FF₁', 'a-pin', 'middle');
    el('rect', { x: 170, y: 36, width: 240, height: 64, rx: 22, class: 'a-cell d-pdn' }, top); T(top, 290, 66, '組合邏輯', 'c-sub', 'middle');
    TS(top, 290, 88, ['t', ['pd', 'sub'], ' 最長 · t', ['cd', 'sub'], ' 最短'], 'a-tiny', 'middle');
    el('rect', { x: 494, y: 30, width: 66, height: 76, rx: 3, class: 'a-cell a-ff' }, top); T(top, 527, 74, 'FF₂', 'a-pin', 'middle');
    ws.push(wire(top, 'M86 68 H170 M410 68 H494', 'a-wire'));
    ws.push(wire(top, 'M53 106 V132 H527 V106', 'a-wire a-clk')); T(top, 290, 148, 'clk', 'a-lab a-clkt', 'middle');
    var X0 = 90, E1 = 150, E2 = 470, uid = 'tm' + Math.random().toString(36).slice(2, 6);
    var cp = el('clipPath', { id: uid }, defsOf(g)), cr = el('rect', { x: X0, y: 160, width: 0, height: 240 }, cp);
    var body = el('g', { 'clip-path': 'url(#' + uid + ')' }, g);
    T(g, X0 - 12, 214, 'clk', 'a-lab a-clkt', 'end'); T(g, X0 - 12, 274, 'D₂', 'a-lab', 'end');
    // 保持窗與建立窗
    el('rect', { x: E1, y: 180, width: 34, height: 120, class: 'm-hold' }, body); el('rect', { x: E2 - 40, y: 180, width: 40, height: 120, class: 'm-setup' }, body);
    el('path', { d: 'M' + X0 + ' 220 H' + E1 + ' V190 H' + (E1 + 160) + ' V220 H' + E2 + ' V190 H' + (E2 + 80), class: 'w-sig a-clkw' }, body);
    // D₂：舊值 → 不確定 → 新值
    var A = E1 + 50, Z = E1 + 236, y = 262;
    el('path', { d: 'M' + X0 + ' ' + (y + 12) + ' L' + (X0 + 6) + ' ' + y + ' H' + (A - 6) + ' L' + A + ' ' + (y + 12) + ' L' + (A - 6) + ' ' + (y + 24) + ' H' + (X0 + 6) + ' Z', class: 'w-bus' }, body);
    el('path', { d: 'M' + A + ' ' + (y + 12) + ' L' + (A + 6) + ' ' + y + ' H' + (Z - 6) + ' L' + Z + ' ' + (y + 12) + ' L' + (Z - 6) + ' ' + (y + 24) + ' H' + (A + 6) + ' Z', class: 'w-bus m-x' }, body);
    el('path', { d: 'M' + Z + ' ' + (y + 12) + ' L' + (Z + 6) + ' ' + y + ' H' + (E2 + 80) + ' V' + (y + 24) + ' H' + (Z + 6) + ' Z', class: 'w-bus w-sum' }, body);
    T(body, (X0 + A) / 2, y + 16, 'old', 'a-pin', 'middle'); T(body, (A + Z) / 2, y + 16, '還在變', 'a-pin', 'middle'); T(body, (Z + E2) / 2, y + 16, 'new', 'a-pin', 'middle');
    var notes = el('g', {}, g);
    T(notes, E1 + 17, 318, 'hold', 'a-tiny m-holdt', 'middle'); T(notes, E2 - 20, 318, 'setup', 'a-tiny k-slow', 'middle');
    T(notes, A - 3, 250, '↓ 最短路徑', 'a-tiny'); T(notes, Z + 3, 250, '最長路徑 ↓', 'a-tiny', 'end');
    var eqs = el('g', {}, g);
    TS(eqs, 300, 352, ['setup：T ≥ t', ['c-q', 'sub'], ' + t', ['pd,logic', 'sub'], ' + t', ['setup', 'sub']], 'a-lab k-slow', 'middle');
    TS(eqs, 300, 378, ['hold：t', ['hold', 'sub'], ' ≤ t', ['cd,reg', 'sub'], ' + t', ['cd,logic', 'sub'], '（跟 T 無關）'], 'a-lab m-holdt', 'middle');
    return { set: function (t) {
      show(top, seg(t, 0, 0.12), 6); draw(ws[0], seg(t, 0.06, 0.22)); draw(ws[1], seg(t, 0.12, 0.3));
      cr.setAttribute('width', (E2 + 80 - X0) * ease(seg(t, 0.25, 0.7)));
      show(notes, seg(t, 0.62, 0.75)); show(eqs.children[0], seg(t, 0.72, 0.82)); show(eqs.children[1], seg(t, 0.82, 0.92));
    } };
  }

  /* ---------- 10. 6T SRAM ---------- */
  function sram(g) {
    var ws = [], parts = [];
    var wl = wire(g, 'M20 30 H580', 'a-wire a-wl'); T(g, 590, 35, 'WL', 'a-lab');
    ws.push(wire(g, 'M60 20 V330', 'a-wire a-bl')); ws.push(wire(g, 'M540 20 V330', 'a-wire a-bl'));
    T(g, 60, 350, 'BL', 'a-lab', 'middle'); T(g, 540, 350, 'BLB', 'a-lab', 'middle');
    // 兩個交叉耦合的反相器
    var i1 = el('g', {}, g), i2 = el('g', {}, g);
    el('path', { d: 'M250 106 L310 136 L250 166 Z', class: 'a-cell' }, i1); el('circle', { cx: 315, cy: 136, r: 4, class: 'a-bubble' }, i1); T(i1, 268, 182, 'PU + PD', 'a-tiny', 'middle');
    el('path', { d: 'M350 224 L290 254 L350 284 Z', class: 'a-cell' }, i2); el('circle', { cx: 285, cy: 254, r: 4, class: 'a-bubble' }, i2); T(i2, 332, 300, 'PU + PD', 'a-tiny', 'middle');
    parts.push(i1, i2);
    ws.push(wire(g, 'M200 136 H250 M200 136 V254 H280', 'a-wire'));
    ws.push(wire(g, 'M320 136 H400 V254 H350', 'a-wire'));
    var pg1 = fet(g, 130, 196, 'PG', false, 44), pg2 = fet(g, 470, 196, 'PG', false, 44); parts.push(pg1, pg2);
    ws.push(wire(g, 'M60 196 H108 M152 196 H200 M130 182 V30', 'a-wire'));
    ws.push(wire(g, 'M400 196 H448 M492 196 H540 M470 182 V30', 'a-wire'));
    var q = el('g', {}, g); el('circle', { cx: 200, cy: 196, r: 4, class: 'a-dot' }, q); el('circle', { cx: 400, cy: 196, r: 4, class: 'a-dot' }, q);
    var qv = T(q, 200, 226, 'Q', 'f-name', 'middle'), qbv = T(q, 400, 226, 'Q̄', 'f-name', 'middle');
    var cnt = T(g, 300, 64, '6T = 2 個反相器 + 2 顆 access transistor', 'a-lab a-dim', 'middle');
    var rd = el('g', {}, g);
    var blv = T(rd, 76, 300, '', 'a-tiny k-slow'), blbv = T(rd, 524, 300, '', 'a-tiny', 'end');
    return { set: function (t) {
      draw(wl, seg(t, 0, 0.15)); draw(ws[0], seg(t, 0.05, 0.2)); draw(ws[1], seg(t, 0.05, 0.2));
      show(i1, seg(t, 0.15, 0.27), 6); show(i2, seg(t, 0.2, 0.32), 6); draw(ws[2], seg(t, 0.25, 0.4)); draw(ws[3], seg(t, 0.28, 0.43));
      show(pg1, seg(t, 0.38, 0.48), 6); show(pg2, seg(t, 0.4, 0.5), 6); draw(ws[4], seg(t, 0.45, 0.6)); draw(ws[5], seg(t, 0.47, 0.62));
      show(q, seg(t, 0.55, 0.65)); show(cnt, seg(t, 0.55, 0.65));
      var r = seg(t, 0.7, 0.95);
      g.classList.toggle('is-read', r > 0);
      qv.textContent = r > 0 ? 'Q = 0' : 'Q'; qbv.textContent = r > 0 ? 'Q̄ = 1' : 'Q̄';
      blv.textContent = r > 0 ? 'BL ↓ ' + Math.round(r * 150) + ' mV' : ''; blbv.textContent = r > 0 ? 'BLB = VDD' : '';
      show(rd, seg(t, 0.7, 0.78));
    } };
  }

  /* ---------- 11. ROM macro：array → decoder → 讀取 → 拉遠看整顆 ---------- */
  var ROM_PH = { array: [0, 0.28], decode: [0.33, 0.58], read: [0.64, 0.97] };
  function rom(g) {
    var R = rng(23), NB = 16, NW = 12, AX = 190, AW = 384, BP = AW / NB, Y0 = 52, WP = 21, SEL = 5, MUXSEL = 3;
    var bx = function (j) { return AX + BP * (j + 0.5); }, wy = function (i) { return Y0 + i * WP; };
    var Y1 = wy(NW - 1);
    var arr = el('g', {}, g), bls = [], wls = [], cells = [], code = [];
    el('rect', { x: AX - 6, y: Y0 - 14, width: AW + 12, height: Y1 - Y0 + 28, rx: 4, class: 'r-arr' }, arr);
    for (var j = 0; j < NB; j++) bls.push(wire(arr, 'M' + bx(j) + ' ' + (Y0 - 30) + ' V' + (Y1 + 30), 'a-wire a-bl'));
    for (var i = 0; i < NW; i++) wls.push(wire(arr, 'M' + (AX - 18) + ' ' + wy(i) + ' H' + (AX + AW), 'a-wire a-wl0'));
    for (i = 0; i < NW; i++) {
      code.push([]);
      for (j = 0; j < NB; j++) {
        var zero = R() < 0.45; code[i].push(zero ? 0 : 1);
        var c = el('rect', { x: bx(j) - 5, y: wy(i) - 4, width: 10, height: 8, rx: 1.5, class: 'r-cell' + (zero ? ' is-c' : '') }, arr);
        cells.push({ e: c, at: R(), i: i });
      }
    }
    var dots = T(arr, AX - 30, Y1 + 18, '⋮', 'a-lab a-dim', 'middle');
    // precharge PMOS
    var pre = el('g', {}, g);
    for (j = 0; j < NB; j++) el('path', { d: 'M' + (bx(j) - 5) + ' ' + (Y0 - 34) + ' H' + (bx(j) + 5) + ' L' + bx(j) + ' ' + (Y0 - 26) + ' Z', class: 'r-pre' }, pre);
    T(pre, AX - 10, Y0 - 26, 'precharge', 'a-tiny', 'end');
    // X decoder：4-to-16 + 3-to-8 → 128 個 NOR2
    var dec = el('g', {}, g);
    el('rect', { x: 40, y: Y0 - 14, width: 120, height: Y1 - Y0 + 28, rx: 4, class: 'a-cell r-blk' }, dec);
    T(dec, 100, Y0 + 14, 'X-DEC', 'f-name', 'middle'); T(dec, 100, Y0 + 32, '7 → 128', 'a-tiny', 'middle');
    el('rect', { x: 54, y: Y0 + 60, width: 92, height: 50, rx: 4, class: 'r-sub' }, dec); T(dec, 100, Y0 + 90, '4 → 16', 'a-pin', 'middle');
    el('rect', { x: 54, y: Y0 + 124, width: 92, height: 50, rx: 4, class: 'r-sub' }, dec); T(dec, 100, Y0 + 154, '3 → 8', 'a-pin', 'middle');
    T(dec, 100, Y0 + 200, '128 × NOR2', 'a-tiny', 'middle');
    for (i = 0; i < NW; i++) el('path', { d: 'M160 ' + (wy(i) - 5) + ' Q172 ' + wy(i) + ' 160 ' + (wy(i) + 5) + ' Z', class: 'r-nor' }, dec);
    var addr = el('g', {}, g); wire(addr, 'M-36 ' + (Y0 + 120) + ' H40', 'a-wire a-ctl'); T(addr, -36, Y0 + 110, 'A<6:0>', 'a-lab');
    var addrBits = T(addr, -36, Y0 + 138, '', 'a-tiny k-slow');
    var selWl = el('path', { d: 'M' + (AX - 18) + ' ' + wy(SEL) + ' H' + (AX + AW), class: 'r-wlon' }, g);
    // 下方：MUX、SA、DFF / CTRL
    var bot = el('g', {}, g), MY = Y1 + 34;
    el('rect', { x: AX, y: MY, width: AW / 2 - 4, height: 22, rx: 3, class: 'a-cell r-blk' }, bot); T(bot, AX + AW / 4, MY + 15, 'MUX 8:1', 'a-pin', 'middle');
    el('rect', { x: AX + AW / 2 + 4, y: MY, width: AW / 2 - 4, height: 22, rx: 3, class: 'a-cell r-blk' }, bot); T(bot, AX + AW * 0.75, MY + 15, 'MUX 8:1', 'a-pin', 'middle');
    var sa = [AX + AW / 4, AX + AW * 0.75].map(function (x) {
      var s = el('g', {}, bot); el('rect', { x: x - 34, y: MY + 32, width: 68, height: 22, rx: 3, class: 'a-cell r-blk r-sa' }, s); T(s, x, MY + 47, 'SA', 'a-pin', 'middle'); return s;
    });
    el('rect', { x: 40, y: MY, width: 120, height: 54, rx: 3, class: 'a-cell r-blk' }, bot); T(bot, 100, MY + 24, 'DFF × 10', 'a-pin', 'middle'); T(bot, 100, MY + 42, 'timing ctrl', 'a-tiny', 'middle');
    var dout = T(bot, AX + AW / 2, MY + 82, '', 'c-big', 'middle');
    var vref = T(bot, AX + AW + 4, MY + 47, 'VREF 1.75 V', 'a-tiny');
    // 讀取：被選到的 BL
    var selBl = [MUXSEL, MUXSEL + 8];
    var hlBl = selBl.map(function (j) { return el('path', { d: 'M' + bx(j) + ' ' + (Y0 - 30) + ' V' + (MY), class: 'r-blsel' }, g); });
    var bitOf = selBl.map(function (j) { return code[SEL][j]; });
    // 拉遠：整顆 macro 的尺寸
    var fin = el('g', {}, g);
    el('path', { d: 'M40 ' + (MY + 64) + ' V' + (MY + 72) + ' H' + (AX + AW) + ' V' + (MY + 64), class: 'a-ref' }, fin);
    T(fin, 40, -6, 'ROM 128 × 16 · contact ROM · 0.18 µm', 'a-lab', null); T(fin, AX + AW, -6, '36.31 × 215.33 µm', 'a-lab k-slow', 'end');
    T(fin, (40 + AX + AW) / 2, MY + 90, '7,818 µm² · DRC / LVS clean · 1.56 ns · 563 µW', 'a-lab', 'middle');
    function ph(t, n) { return seg(t, ROM_PH[n][0], ROM_PH[n][1]); }
    return { set: function (t, f) {
      var a = ph(t, 'array'), d = ph(t, 'decode'), r = ph(t, 'read');
      show(arr.firstChild, seg(a, 0, 0.2));
      bls.forEach(function (b, j) { draw(b, seg(a, 0.05 + j * 0.01, 0.35 + j * 0.01)); });
      wls.forEach(function (w, i) { draw(w, seg(a, 0.15 + i * 0.015, 0.45 + i * 0.015)); });
      cells.forEach(function (c) { c.e.style.opacity = seg(a, 0.4 + c.at * 0.4, 0.5 + c.at * 0.4); });
      show(dots, seg(a, 0.6, 0.8));
      show(dec, seg(d, 0, 0.3), 6); show(addr, seg(d, 0.2, 0.4));
      addrBits.textContent = d > 0.4 ? '0000101' : '';
      selWl.style.opacity = seg(d, 0.55, 0.75);
      show(bot, Math.max(seg(r, 0, 0.2), f || 0));
      show(pre, seg(r, 0, 0.15));
      g.classList.toggle('is-pre', r > 0.08 && r < 0.95);
      var dis = seg(r, 0.35, 0.6);
      cells.forEach(function (c) { c.e.classList.toggle('is-sel', c.i === SEL && dis > 0); });
      bls.forEach(function (b, j) { b.classList.toggle('is-low', dis > 0 && code[SEL][j] === 0); });
      hlBl.forEach(function (h) { h.style.opacity = seg(r, 0.55, 0.7); });
      sa.forEach(function (s) { s.classList.toggle('is-on', r > 0.7); });
      dout.textContent = r > 0.75 ? 'DOUT<1:0> = ' + bitOf[1] + bitOf[0] : '';
      vref.style.opacity = seg(r, 0.6, 0.7);
      show(fin, f || 0); dout.style.opacity = 1 - seg(f || 0, 0, 0.4);
    } };
  }

  /* ---------- 12. 功耗：coupling capacitance，post-sim 功耗幾乎翻倍 ---------- */
  function power(g) {
    var left = el('g', {}, g), ws = [];
    TS(left, 0, 20, ['P', ['sw', 'sub'], ' = α · C', ['L', 'sub'], ' · V', ['DD', 'sub'], '² · f'], 'c-big');
    ws.push(wire(left, 'M0 110 H240', 'a-wire p-line')); ws.push(wire(left, 'M0 170 H240', 'a-wire p-line'));
    T(left, 0, 98, 'BL<3>', 'a-tiny'); T(left, 0, 196, 'BL<4>', 'a-tiny');
    var caps = el('g', {}, left);
    [40, 100, 160, 220].forEach(function (x) { el('path', { d: 'M' + x + ' 110 V134 M' + (x - 9) + ' 134 H' + (x + 9) + ' M' + (x - 9) + ' 146 H' + (x + 9) + ' M' + x + ' 146 V170', class: 'a-wire p-cc' }, caps); });
    TS(caps, 250, 145, ['C', ['c', 'sub']], 'a-lab k-slow');
    T(left, 0, 236, '為了壓面積，平行的線靠得很近', 'a-lab a-dim'); T(left, 0, 258, 'coupling capacitance 變大', 'a-lab a-dim');
    var B = [['Access time', 1.344, 1.559, 'ns', '+16%'], ['Power', 302.3, 563.1, 'µW', '+86%']], X0 = 330, BASE = 300, HM = 230, bars = [];
    var base = wire(g, 'M' + (X0 - 10) + ' ' + BASE + ' H600', 'a-axis');
    B.forEach(function (b, i) {
      var x = X0 + i * 150, bg = el('g', {}, g);
      [[b[1], 'pre', 'b-bar'], [b[2], 'post', 'b-bar is-hot']].forEach(function (v, k) {
        var h = HM * v[0] / b[2], r = el('rect', { x: x + k * 56, y: BASE, width: 44, height: 0, rx: 3, class: v[2] }, bg);
        var lab = T(bg, x + k * 56 + 22, BASE - 8, String(v[0]), 'a-tiny' + (k ? ' k-slow' : ''), 'middle');
        T(bg, x + k * 56 + 22, BASE + 18, v[1], 'a-tiny', 'middle');
        bars.push({ r: r, h: h, lab: lab, g: bg });
      });
      T(bg, x + 50, BASE + 42, b[0] + ' (' + b[3] + ')', 'a-lab', 'middle');
      T(bg, x + 50, 24, b[4], 'c-big k-slow', 'middle');
    });
    var foot = T(g, 600, 380, 'ROM macro · TT 25 °C · pre-sim vs post-layout sim', 'a-lab a-dim', 'end');
    return { set: function (t) {
      show(left.children[0], seg(t, 0, 0.12));
      ws.forEach(function (w, i) { draw(w, seg(t, 0.05 + i * 0.05, 0.25 + i * 0.05)); });
      [1, 2].forEach(function (i) { show(left.children[i + 2], seg(t, 0.15, 0.25)); });
      show(caps, seg(t, 0.25, 0.4)); show(left.children[6], seg(t, 0.35, 0.45)); show(left.children[7], seg(t, 0.4, 0.5));
      draw(base, seg(t, 0.3, 0.45));
      bars.forEach(function (b, i) {
        var k = ease(seg(t, 0.4 + i * 0.1, 0.6 + i * 0.1));
        b.r.setAttribute('height', b.h * k); b.r.setAttribute('y', BASE - b.h * k); b.lab.setAttribute('y', BASE - b.h * k - 8);
        b.lab.style.opacity = seg(t, 0.55 + i * 0.1, 0.65 + i * 0.1);
      });
      [0, 2].forEach(function (i) { show(bars[i].g, seg(t, 0.38 + i * 0.1, 0.45 + i * 0.1)); });
      show(foot, seg(t, 0.85, 1));
    } };
  }

  function defsOf(g) {
    // 只找 svg 底下第一層的 defs：場景自己的 defs 會跟著場景被藏起來（visibility: hidden），clip 也會跟著失效
    var s = g.ownerSVGElement || g, d = s.querySelector(':scope > defs');
    if (!d) d = s.insertBefore(document.createElementNS(NS, 'defs'), s.firstChild);
    return d;
  }

  return { el: el, seg: seg, ease: ease, clamp01: clamp01,
    flow: flow, corner: corner, mos: mos, inv: inv, chain: chain, cmos: cmos, dyn: dyn, rc: rc, timing: timing, sram: sram, rom: rom, power: power };
})();

/* ---------- 舞台：捲動進度 p → 哪一拍、哪個場景、畫到哪裡（照 keynote-tour 的骨架） ---------- */
(function () {
  'use strict';
  var root = document.querySelector('[data-vt]');
  if (!root) return;
  var A = ART, el = A.el, seg = A.seg, ease = A.ease, clamp01 = A.clamp01;
  var track = root.querySelector('.vt-track'), stage = root.querySelector('.vt-stage'), svg = root.querySelector('[data-world]');
  var rail = root.querySelector('[data-rail]'), playBtn = root.querySelector('[data-play]');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var B = [].map.call(root.querySelectorAll('[data-beat]'), function (n) {
    return { id: n.dataset.beat, w: +n.dataset.w || 1, ch: +n.dataset.ch || 0, scene: n.dataset.scene, finale: n.hasAttribute('data-finale'), node: n };
  });
  var HOLD = 0.35, total = B.reduce(function (s, b) { return s + b.w; }, HOLD), acc = 0, span = {};
  B.forEach(function (b) { span[b.id] = { s: acc / total, l: b.w / total }; acc += b.w; });
  function lt(id, p) { return span[id] ? clamp01((p - span[id].s) / span[id].l) : 0; }

  // 場景：同一個 680×470 世界，位置只在這裡擺一次，鏡頭不動
  function place(tx, ty) { return el('g', { transform: 'translate(' + tx + ' ' + ty + ')' }, svg); }
  var POS = { flow: [20, 20], corner: [20, 10], mos: [10, 40], inv: [40, 30], chain: [30, 30], cmos: [0, 30], dyn: [10, 30], rc: [20, 0], timing: [10, 0], sram: [0, 30], rom: [30, 10], power: [10, 20] };
  var S = {};
  Object.keys(POS).forEach(function (n) { var g = place(POS[n][0], POS[n][1]); S[n] = { g: g, sc: A[n](g) }; });

  // 連續用同一個場景的幾拍是一段 run：場景的 t 走過整段（finale 那拍不算，留給拉遠）。
  // 同一個場景可以出現在好幾段 run（ROM 在讀取之後、finale 又出現一次）：t 取最近一段已經開始的 run，只有 finale 的那段 t = 1
  var RUNS = [];
  B.forEach(function (b) {
    var r = RUNS[RUNS.length - 1];
    if (r && r.name === b.scene) { if (!b.finale) r.ids.push(b.id); return; }
    if (r) r.next = b.id;
    RUNS.push({ name: b.scene, first: b.id, ids: b.finale ? [] : [b.id], next: null });
  });
  function runT(r, p) {
    if (!r.ids.length) return 1;
    var a = span[r.ids[0]].s, z = span[r.ids[r.ids.length - 1]];
    return seg(clamp01((p - a) / (z.s + z.l - a)), 0.08 / r.ids.length, 1 - 0.15 / r.ids.length);
  }
  var finale = B.filter(function (b) { return b.finale; })[0];

  var CH = [];
  B.forEach(function (b) { (CH[b.ch] = CH[b.ch] || []).push(b.id); });
  var names = (rail.dataset.names || '').split('|');
  CH.forEach(function (ids, i) { rail.insertAdjacentHTML('beforeend', '<button type="button" data-ch="' + i + '"><i></i>' + (names[i] || i + 1) + '</button>'); });
  var chBtns = [].slice.call(rail.children);

  function vis(g, k, s) { g.style.opacity = k; g.style.visibility = k > 0.001 ? 'visible' : 'hidden'; g.style.scale = s; }
  var cur = -1;
  function render(p) {
    var bi = 0; B.forEach(function (b, i) { if (p >= span[b.id].s) bi = i; });
    if (bi !== cur) { cur = bi; B.forEach(function (b, i) { b.node.classList.toggle('is-on', i === bi); }); }
    // 換場景：舊的在下一段第一拍的 0–10% 淡出，新的 6–20% 淡入，兩個畫面幾乎不重疊
    var k = {}, t = {};
    RUNS.forEach(function (r, i) {
      var v = (i ? seg(lt(r.first, p), 0.06, 0.2) : 1) * (r.next ? 1 - seg(lt(r.next, p), 0, 0.1) : 1);
      k[r.name] = Math.max(k[r.name] || 0, v);
      if (t[r.name] == null || p >= span[r.first].s) t[r.name] = runT(r, p);
    });
    var tf = finale ? lt(finale.id, p) : 0;
    Object.keys(S).forEach(function (n) {
      var isFin = finale && finale.scene === n;
      S[n].sc.set(t[n] || 0, isFin ? ease(tf) : 0);
      vis(S[n].g, k[n] || 0, isFin ? 1 - 0.14 * ease(tf) : 0.97 + 0.03 * (k[n] || 0));
      if (isFin) S[n].g.classList.toggle('glow', tf > 0.1);
    });
    root.style.setProperty('--glow', (0.22 * ease(tf)).toFixed(3));
    chBtns.forEach(function (btn, i) {
      var ids = CH[i], s0 = span[ids[0]].s, last = span[ids[ids.length - 1]];
      btn.style.setProperty('--p', clamp01((p - s0) / (last.s + last.l - s0)).toFixed(3));
      btn.classList.toggle('is-on', B[bi].ch === i);
    });
    root.classList.toggle('is-end', p > 0.985);
  }

  function headerH() { return parseFloat(getComputedStyle(stage).top) || 0; }
  function range() { return track.offsetHeight - stage.offsetHeight; }
  function progress() { var r = track.getBoundingClientRect(), R = range(); return R > 0 ? clamp01((headerH() - r.top) / R) : 1; }
  function topOf(p) { return track.getBoundingClientRect().top + scrollY - headerH() + p * range(); }

  if (reduce) { root.classList.add('is-static'); render(1); return; }
  root.classList.add('is-live');

  var raf = 0;
  function tick() { raf = 0; render(progress()); }
  addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(tick); }, { passive: true });
  addEventListener('resize', tick);
  if (document.fonts) document.fonts.ready.then(tick);
  tick();
  requestAnimationFrame(function () { root.classList.add('is-ready'); });

  // 點章節：跳到那一章第一拍演到 60%
  rail.addEventListener('click', function (e) {
    var btn = e.target.closest('button'); if (!btn) return;
    stop(); var id = CH[+btn.dataset.ch][0];
    scrollTo({ top: topOf(span[id].s + span[id].l * 0.6), behavior: 'smooth' });
  });

  // 自動播放：幫使用者捲，碰到滾輪、觸控、鍵盤就停
  var playing = 0, last = 0, SPEED = 1 / (B.length * 5.5);   // 每拍約 5.5 秒
  function step(now) {
    if (!playing) return;
    var dt = Math.min(64, now - last); last = now;
    if (progress() >= 1) { stop(); return; }
    window.scrollTo(0, scrollY + dt / 1000 * SPEED * range());
    playing = requestAnimationFrame(step);
  }
  function start() {
    if (progress() >= 0.99 || track.getBoundingClientRect().top > headerH() + 2) window.scrollTo(0, topOf(progress() >= 0.99 ? 0 : progress()));
    last = performance.now(); playing = requestAnimationFrame(step);
    playBtn.dataset.state = 'run'; playBtn.querySelector('[data-play-label]').textContent = 'Pause';
  }
  function stop() {
    if (!playing) return;
    cancelAnimationFrame(playing); playing = 0;
    playBtn.dataset.state = ''; playBtn.querySelector('[data-play-label]').textContent = 'Auto-play';
  }
  playBtn.addEventListener('click', function () { playing ? stop() : start(); });
  ['wheel', 'touchstart', 'keydown'].forEach(function (ev) { addEventListener(ev, function (e) { if (ev === 'keydown' && e.target === playBtn) return; stop(); }, { passive: true }); });
})();
