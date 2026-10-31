/* ==========================================================================
   ICLAB 設計流程（layout: iclab-flow）：黑底發表會式的捲動導覽。
   上半是 ART：各站的畫面，acc.v 的程式碼、RTL 電路、FSM、lint、波形、netlist、LEC、layout、作業。
   每個 scene 都是 make(parent) → { set(t) }，t 是 0–1 的進度，畫面是 t 的純函式。
   顏色全部用 class，由 css/iclab-flow.css 決定。下半是舞台：捲動進度 p 決定現在是哪一拍。
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
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // 用 pathLength=1 的 dash 把線「畫出來」
  function wire(parent, d, cls) { return el('path', { d: d, class: cls || 'a-wire', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1 }, parent); }
  function draw(p, k) { p.setAttribute('stroke-dashoffset', 1 - clamp01(k)); }
  function show(e, k, dy) { k = clamp01(k); e.style.opacity = k; if (dy) e.style.transform = 'translateY(' + ((1 - ease(k)) * dy) + 'px)'; }

  /* ---------- 1. acc.v ---------- */
  var CODE = [
    'module acc #(parameter W = 8) (',
    '  input              clk, rst_n, in_valid,',
    '  input      [W-1:0] din,',
    '  output reg [W-1:0] sum',
    ');',
    '  wire [W-1:0] nxt = sum + din;',
    '',
    '  always @(posedge clk or negedge rst_n)',
    '    if (!rst_n)        sum <= 0;',
    '    else if (in_valid) sum <= nxt;',
    'endmodule'
  ];
  var KW = /^(module|parameter|input|output|reg|wire|always|posedge|negedge|or|if|else|endmodule)$/;
  var ID = /^(clk|rst_n|in_valid|din|sum|nxt|acc|W)$/;
  function code(parent, o) {
    o = o || {};
    var lh = o.lh || 26, g = el('g', { class: 'a-code' }, parent), lines = [], uid = 'c' + Math.random().toString(36).slice(2, 7);
    var defs = el('defs', {}, g);
    CODE.forEach(function (s, i) {
      var y = 20 + i * lh;
      var hl = el('rect', { x: -8, y: y - lh + 8, width: o.w || 480, height: lh, class: 'a-code-hl', opacity: 0 }, g);
      T(g, 0, y, String(i + 1).padStart(2, ' '), 'a-ln');
      var cp = el('clipPath', { id: uid + i }, defs), r = el('rect', { x: 26, y: y - lh + 6, width: 0, height: lh }, cp);
      var t = el('text', { x: 34, y: y, class: 'a-src', 'clip-path': 'url(#' + uid + i + ')' }, g);
      s.split(/(\s+|[A-Za-z_]\w*|\d+)/).forEach(function (tok) {
        if (!tok) return;
        var ts = el('tspan', { class: KW.test(tok) ? 'a-kw' : ID.test(tok) ? 'a-id' : /^\d+$/.test(tok) ? 'a-num' : 'a-op' }, t);
        ts.textContent = tok;
      });
      lines.push({ y: y, clip: r, text: t, hl: hl, len: s.length, w: 0 });
    });
    var caret = el('rect', { x: 34, y: 0, width: 2, height: lh - 8, class: 'a-caret' }, g);
    function measure() { lines.forEach(function (L) { L.w = L.len ? L.text.getComputedTextLength() : 0; }); }
    var api = {
      g: g, lines: lines, lh: lh,
      set: function (t, hi) {
        measure();
        var n = t * CODE.length, cur = Math.min(CODE.length - 1, Math.floor(n));
        lines.forEach(function (L, i) {
          var k = clamp01(n - i);
          L.clip.setAttribute('width', 8 + L.w * k + (k >= 1 ? 40 : 0));
          L.hl.setAttribute('opacity', hi && hi.indexOf(i) > -1 ? 1 : 0);
        });
        var L = lines[cur], k = clamp01(n - cur);
        caret.setAttribute('x', 36 + L.w * k);
        caret.setAttribute('y', L.y - lh + 10);
        caret.style.opacity = t > 0 && t < 1 ? 1 : 0;
      }
    };
    return api;
  }

  /* ---------- 2. RTL 電路：加法器 → MUX → 8 個 DFF ---------- */
  function circuit(parent) {
    var g = el('g', { class: 'a-circ' }, parent);
    var W = [
      wire(g, 'M0 90 H148'),                                   // din → +
      wire(g, 'M192 90 H280'),                                 // nxt → mux
      wire(g, 'M298 20 V77', 'a-wire a-ctl'),                  // in_valid
      wire(g, 'M316 130 H380'),                                // mux → D
      wire(g, 'M460 130 H560'),                                // Q → sum
      wire(g, 'M510 130 V220 H170 V112', 'a-wire a-fb'),       // 回授到加法器
      wire(g, 'M250 220 V165 H280', 'a-wire a-fb'),            // 保持原值
      wire(g, 'M420 250 V170', 'a-wire a-clk')                 // clk
    ];
    var parts = [];
    var add = el('g', {}, g); el('circle', { cx: 170, cy: 90, r: 22, class: 'a-cell' }, add); T(add, 170, 97, '+', 'a-sym', 'middle'); parts.push(add);
    var mux = el('g', {}, g); el('path', { d: 'M280 70 L316 84 L316 176 L280 190 Z', class: 'a-cell' }, mux); T(mux, 288, 99, '1', 'a-pin'); T(mux, 288, 169, '0', 'a-pin'); parts.push(mux);
    var ff = el('g', {}, g); el('rect', { x: 380, y: 90, width: 80, height: 80, rx: 3, class: 'a-cell a-ff' }, ff);
    el('path', { d: 'M412 170 L420 160 L428 170', class: 'a-wire' }, ff); T(ff, 388, 135, 'D', 'a-pin'); T(ff, 452, 135, 'Q', 'a-pin', 'end'); T(ff, 420, 112, '×8', 'a-pin', 'middle'); parts.push(ff);
    var dots = el('g', {}, g); el('circle', { cx: 510, cy: 130, r: 3.5, class: 'a-dot' }, dots); el('circle', { cx: 250, cy: 220, r: 3.5, class: 'a-dot' }, dots);
    var labs = el('g', {}, g);
    T(labs, 0, 80, 'din[7:0]', 'a-lab'); T(labs, 236, 82, 'nxt', 'a-lab', 'middle'); T(labs, 298, 12, 'in_valid', 'a-lab', 'middle');
    T(labs, 560, 120, 'sum[7:0]', 'a-lab', 'end'); T(labs, 420, 266, 'clk', 'a-lab', 'middle'); T(labs, 340, 238, 'sum', 'a-lab a-dim', 'middle');
    return {
      g: g, parts: parts, wires: W,
      set: function (t) {
        show(parts[0], seg(t, 0, 0.2), 6); show(parts[1], seg(t, 0.1, 0.3), 6); show(parts[2], seg(t, 0.2, 0.4), 6);
        draw(W[0], seg(t, 0.15, 0.4)); draw(W[1], seg(t, 0.3, 0.5)); draw(W[2], seg(t, 0.35, 0.55)); draw(W[3], seg(t, 0.45, 0.6));
        draw(W[4], seg(t, 0.55, 0.7)); draw(W[5], seg(t, 0.6, 0.9)); draw(W[6], seg(t, 0.75, 0.95)); draw(W[7], seg(t, 0.5, 0.7));
        show(dots, seg(t, 0.85, 1)); show(labs, seg(t, 0.4, 0.8));
      }
    };
  }

  /* ---------- 3. gate-level netlist：8 個 FA、8 個 MUX、8 個 DFF ---------- */
  function netlist(parent) {
    var g = el('g', { class: 'a-net' }, parent), rows = [], H = 31;
    var head = el('g', {}, g);
    [[90, 'U_add · FA1D1'], [250, 'U_mux · MUX2D1'], [400, 'U_reg · DFQD1']].forEach(function (h) { T(head, h[0], 8, h[1], 'a-lab a-dim', 'middle'); });
    for (var i = 0; i < 8; i++) {
      var y = 26 + i * H, r = el('g', {}, g);
      wire(r, 'M0 ' + (y + 11) + ' H58', 'a-wire');
      el('rect', { x: 58, y: y, width: 64, height: 22, rx: 2, class: 'a-cell' }, r); T(r, 90, y + 15, 'FA', 'a-pin', 'middle');
      wire(r, 'M122 ' + (y + 11) + ' H222', 'a-wire');
      el('path', { d: 'M222 ' + (y - 2) + ' L278 ' + (y + 3) + ' L278 ' + (y + 19) + ' L222 ' + (y + 24) + ' Z', class: 'a-cell' }, r); T(r, 250, y + 15, 'MUX', 'a-pin', 'middle');
      wire(r, 'M278 ' + (y + 11) + ' H364', 'a-wire');
      el('rect', { x: 364, y: y - 1, width: 72, height: 24, rx: 2, class: 'a-cell a-ff' }, r); T(r, 400, y + 15, 'DFF', 'a-pin', 'middle');
      wire(r, 'M436 ' + (y + 11) + ' H560', 'a-wire');
      T(r, 0, y + 6, 'din[' + i + ']', 'a-tiny'); T(r, 560, y + 6, 'sum[' + i + ']', 'a-tiny', 'end');
      rows.push(r);
    }
    var carry = wire(g, 'M90 48 V' + (26 + 7 * H), 'a-wire a-carry');
    var clk = wire(g, 'M500 ' + (26 + 8 * H + 6) + ' H456 V36 ' + Array.from({ length: 8 }, function (_, i) { return 'M456 ' + (37 + i * H) + ' H436'; }).join(' '), 'a-wire a-clk');
    var lab = T(g, 504, 26 + 8 * H + 10, 'clk', 'a-lab');
    return {
      g: g,
      set: function (t) {
        show(head, seg(t, 0, 0.15));
        rows.forEach(function (r, i) {
          var k = seg(t, 0.05 + i * 0.06, 0.25 + i * 0.06);
          show(r, k, 8);
          r.querySelectorAll('path[pathLength]').forEach(function (p) { draw(p, k); });
        });
        draw(carry, seg(t, 0.55, 0.8)); draw(clk, seg(t, 0.7, 1)); show(lab, seg(t, 0.85, 1));
      }
    };
  }

  /* ---------- 4. APR layout：floorplan → power → place → CTS → route ---------- */
  var PHASES = [['floorplan', 0, 0.14], ['power', 0.14, 0.32], ['place', 0.32, 0.56], ['cts', 0.56, 0.74], ['route', 0.74, 1]];
  function layout(parent, seed) {
    var g = el('g', { class: 'a-lay' }, parent), R = rng(seed || 7);
    var X0 = 44, Y0 = 44, CW = 472, RH = 30, NR = 11, CH = RH * NR, X1 = X0 + CW, Y1 = Y0 + CH;
    // floorplan
    var fp = el('g', {}, g);
    var die = wire(fp, 'M0 0 H560 V' + (Y1 + 44) + ' H0 Z', 'a-die');
    var core = wire(fp, 'M' + X0 + ' ' + Y0 + ' H' + X1 + ' V' + Y1 + ' H' + X0 + ' Z', 'a-core');
    var rowLines = [];
    for (var i = 1; i < NR; i++) rowLines.push(wire(fp, 'M' + X0 + ' ' + (Y0 + i * RH) + ' H' + X1, 'a-row'));
    var pins = el('g', {}, fp);
    ['clk', 'rst_n', 'in_valid', 'din', 'sum'].forEach(function (s, i) {
      var x = 120 + i * 80; el('rect', { x: x - 5, y: -4, width: 10, height: 8, class: 'a-pinbox' }, pins); T(pins, x, -10, s, 'a-tiny', 'middle');
    });
    // power：兩組 ring、垂直 stripe、水平 rail
    var pw = el('g', {}, g), rings = [];
    [[13, 'a-vdd'], [25, 'a-vss']].forEach(function (r) {
      var o = r[0]; rings.push(wire(pw, 'M' + o + ' ' + o + ' H' + (560 - o) + ' V' + (Y1 + 44 - o) + ' H' + o + ' Z', 'a-ring ' + r[1]));
    });
    var stripes = [];
    [150, 280, 410].forEach(function (x) {
      stripes.push(wire(pw, 'M' + (x - 4) + ' 12 V' + (Y1 + 32), 'a-stripe a-vdd'));
      stripes.push(wire(pw, 'M' + (x + 4) + ' 26 V' + (Y1 + 18), 'a-stripe a-vss'));
    });
    var rails = [];
    for (i = 0; i <= NR; i++) rails.push(wire(pw, 'M' + X0 + ' ' + (Y0 + i * RH) + ' H' + X1, 'a-rail ' + (i % 2 ? 'a-vss' : 'a-vdd')));
    // place：每一排塞 cell，FF 比較寬
    var pl = el('g', {}, g), rowsG = [], ffs = [], cells = [];
    for (i = 0; i < NR; i++) {
      var rg = el('g', {}, pl), x = X0 + 4 + R() * 6, y = Y0 + i * RH;
      while (x < X1 - 30) {
        var ff = R() < 0.16, w = ff ? 30 : [9, 12, 15, 18, 22][Math.floor(R() * 5)];
        if (Math.abs(x + w / 2 - 150) < 8 || Math.abs(x + w / 2 - 280) < 8 || Math.abs(x + w / 2 - 410) < 8) { x += 10; continue; } // 留給 stripe 的 via
        el('rect', { x: x, y: y + 4, width: w, height: RH - 8, class: ff ? 'a-pc a-pff' : 'a-pc' }, rg);
        var c = { x: x + w / 2, y: y + RH / 2, ff: ff }; cells.push(c); if (ff) ffs.push(c);
        x += w + (R() < 0.35 ? 2 + R() * 10 : 1.5);
      }
      rowsG.push(rg);
    }
    // CTS：從中心長一棵樹到每個 FF
    var cts = el('g', {}, g), cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, trunk = [], leaves = [];
    var q = [[X0 + CW / 4, Y0 + CH / 4], [X1 - CW / 4, Y0 + CH / 4], [X0 + CW / 4, Y1 - CH / 4], [X1 - CW / 4, Y1 - CH / 4]];
    trunk.push(wire(cts, 'M' + cx + ' ' + (Y1 + 44) + ' V' + cy, 'a-ctsw'));
    trunk.push(wire(cts, 'M' + q[0][0] + ' ' + q[0][1] + ' V' + q[2][1] + ' M' + q[1][0] + ' ' + q[1][1] + ' V' + q[3][1] + ' M' + q[0][0] + ' ' + cy + ' H' + q[1][0], 'a-ctsw'));
    ffs.forEach(function (f) {
      var b = q[(f.y < cy ? 0 : 2) + (f.x < cx ? 0 : 1)];
      leaves.push(wire(cts, 'M' + b[0] + ' ' + b[1] + ' H' + f.x + ' V' + f.y, 'a-ctsl'));
    });
    var bufs = el('g', {}, cts);
    q.forEach(function (b) { el('path', { d: 'M' + (b[0] - 6) + ' ' + (b[1] + 5) + ' L' + b[0] + ' ' + (b[1] - 6) + ' L' + (b[0] + 6) + ' ' + (b[1] + 5) + ' Z', class: 'a-buf' }, bufs); });
    // route：曼哈頓繞線，水平 M3、垂直 M2，轉彎打 via
    var rt = el('g', {}, g), nets = [];
    for (i = 0; i < 90; i++) {
      var a = cells[Math.floor(R() * cells.length)], b2 = cells[Math.floor(R() * cells.length)];
      if (Math.abs(a.x - b2.x) + Math.abs(a.y - b2.y) > 220 || a === b2) { i--; continue; }
      var ng = el('g', {}, rt);
      var h = wire(ng, 'M' + a.x + ' ' + a.y + ' H' + b2.x, 'a-m3'), v = wire(ng, 'M' + b2.x + ' ' + a.y + ' V' + b2.y, 'a-m2');
      el('rect', { x: b2.x - 2, y: a.y - 2, width: 4, height: 4, class: 'a-via' }, ng);
      nets.push({ g: ng, h: h, v: v });
    }
    function phase(t, name) { for (var j = 0; j < PHASES.length; j++) if (PHASES[j][0] === name) return seg(t, PHASES[j][1], PHASES[j][2]); }
    return {
      g: g, cells: cells.length, ffs: ffs.length, nets: nets.length,
      phase: function (t) { var n = PHASES[0][0]; PHASES.forEach(function (P) { if (t >= P[1]) n = P[0]; }); return n; },
      set: function (t) {
        var f = phase(t, 'floorplan'), p = phase(t, 'power'), l = phase(t, 'place'), c = phase(t, 'cts'), r = phase(t, 'route');
        draw(die, f * 1.6); draw(core, f * 1.6 - 0.4); rowLines.forEach(function (L, i) { draw(L, f * 2 - 0.6 - i * 0.03); }); show(pins, f * 2 - 1);
        fp.style.opacity = 1;
        rings.forEach(function (w, i) { draw(w, p * 2.2 - i * 0.3); });
        stripes.forEach(function (w, i) { draw(w, p * 2.4 - 0.7 - i * 0.05); });
        rails.forEach(function (w, i) { draw(w, p * 2.6 - 1.3 - i * 0.04); });
        rowsG.forEach(function (rg, i) { show(rg, l * 1.8 - i * 0.07, -6); });
        trunk.forEach(function (w, i) { draw(w, c * 2.5 - i * 0.6); }); leaves.forEach(function (w, i) { draw(w, c * 2.2 - 1 - i * 0.004); }); show(bufs, c * 3 - 1);
        nets.forEach(function (n, i) { var k = r * 1.9 - i / nets.length * 0.9; draw(n.h, k * 2); draw(n.v, k * 2 - 1); n.g.style.opacity = k > 0 ? 1 : 0; });
      }
    };
  }

  function op(e, k) { e.style.opacity = clamp01(k); }
  function defsOf(g) {
    // 只找 svg 底下第一層的 defs：場景自己的 defs 會跟著場景被藏起來（visibility: hidden），clip 也會跟著失效
    var s = g.ownerSVGElement || g, d = s.querySelector(':scope > defs');
    if (!d) d = s.insertBefore(document.createElementNS(NS, 'defs'), s.firstChild);
    if (!d.querySelector('#arr')) { var m = el('marker', { id: 'arr', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, d); el('path', { d: 'M0 0 L10 5 L0 10 z', class: 'a-head' }, m); }
    return d;
  }

  /* ---------- 5. 其他站：FSM、lint、波形、LEC、作業 ---------- */
  function fsm(g) {
    defsOf(g);
    var S = [['IDLE', 90, 190], ['ACC', 300, 70], ['DONE', 500, 190]], st = [], ar = [];
    ar.push(wire(g, 'M128 168 Q170 90 254 78', 'f-arrow')); ar.push(wire(g, 'M346 82 Q440 92 470 156', 'f-arrow')); ar.push(wire(g, 'M462 210 Q300 290 128 210', 'f-arrow'));
    ar.push(wire(g, 'M282 30 C250 -10 350 -10 318 30', 'f-arrow'));
    S.forEach(function (s) { var c = el('circle', { cx: s[1], cy: s[2], r: 42, class: 'f-st' }, g); T(g, s[1], s[2] + 5, s[0], 'f-name', 'middle'); st.push(c); });
    var lb = el('g', {}, g); T(lb, 150, 104, 'load', 'a-lab', 'end'); T(lb, 430, 104, '!load', 'a-lab'); T(lb, 300, 282, 'busy = 0', 'a-lab', 'middle'); T(lb, 300, -14, 'load', 'a-lab', 'middle');
    T(lb, 0, 330, 'state register（循序）+ next-state、output logic（組合）', 'a-lab a-dim');
    return { set: function (t) { st.forEach(function (c, i) { op(c, seg(t, i * 0.1, i * 0.1 + 0.2)); }); ar.forEach(function (a, i) { draw(a, seg(t, 0.3 + i * 0.1, 0.5 + i * 0.1)); }); op(lb, seg(t, 0.6, 0.9));
      var on = t < 0.75 ? -1 : Math.floor((t - 0.75) * 12) % 3; st.forEach(function (c, i) { c.classList.toggle('on', t >= 1 ? i === 1 : i === on); }); } };
  }
  function lint(g) {
    var c = code(g, { lh: 24, w: 470 }), box = el('g', { transform: 'translate(250 160)' }, g);
    el('rect', { x: 0, y: 0, width: 340, height: 150, rx: 8, class: 'r-box' }, box);
    T(box, 16, 26, 'spy.tcl · report', 'a-lab a-dim');
    var rows = [['lint_rtl', '0 error', 'r-ok'], ['lint_turbo_rtl', '0 error', 'r-ok'], ['lint_functional_rtl', '0 error', 'r-ok'], ['lint_abstract', '0 error', 'r-ok']].map(function (r, i) {
      var y = 54 + i * 24, rg = el('g', {}, box); el('circle', { cx: 22, cy: y - 4, r: 4, class: r[2] }, rg); T(rg, 36, y, r[0], 'a-lab'); T(rg, 322, y, r[1], 'a-lab', 'end'); return rg;
    });
    return { set: function (t) { c.set(Math.min(1, t * 2)); op(box, seg(t, 0.4, 0.55)); rows.forEach(function (r, i) { op(r, seg(t, 0.5 + i * 0.1, 0.6 + i * 0.1)); }); } };
  }
  function wave(g) {
    var X0 = 90, P = 48, N = 10, din = [0, 5, 3, 10, 0, 7, 2, 0, 0, 0], val = [0, 1, 1, 1, 0, 1, 1, 0, 0, 0], sum = [], s = 0;
    for (var i = 0; i < N; i++) { sum.push(s); if (val[i]) s = (s + din[i]) & 255; }
    var uid = 'wv' + Math.random().toString(36).slice(2, 6), cp = el('clipPath', { id: uid }, defsOf(g)), cr = el('rect', { x: X0, y: -10, width: 0, height: 400 }, cp);
    var body = el('g', { 'clip-path': 'url(#' + uid + ')' }, g);
    for (i = 0; i <= N; i++) el('path', { d: 'M' + (X0 + i * P + P / 2) + ' 0 V300', class: 'w-edge' }, body);
    function row(name, y) { T(g, 0, y + 14, name, 'a-lab'); }
    row('clk', 10); row('in_valid', 70); row('din', 130); row('sum', 190);
    var d = 'M' + X0 + ' 30'; for (i = 0; i < N; i++) d += ' H' + (X0 + i * P + P / 2) + ' V8 H' + (X0 + (i + 1) * P) + ' V30';
    el('path', { d: d, class: 'w-sig w-clk' }, body);
    d = 'M' + X0 + ' 90'; for (i = 0; i < N; i++) d += ' V' + (val[i] ? 68 : 90) + ' H' + (X0 + (i + 1) * P);
    el('path', { d: d, class: 'w-sig' }, body);
    function bus(arr, y, cls) {
      for (var j = 0; j < N; j++) {
        var x = X0 + j * P, k = 4;
        el('path', { d: 'M' + x + ' ' + (y + 11) + ' L' + (x + k) + ' ' + y + ' H' + (x + P - k) + ' L' + (x + P) + ' ' + (y + 11) + ' L' + (x + P - k) + ' ' + (y + 22) + ' H' + (x + k) + ' Z', class: 'w-bus ' + (cls || '') }, body);
        T(body, x + P / 2, y + 15, arr[j].toString(16).toUpperCase().padStart(2, '0'), 'a-pin', 'middle');
      }
    }
    bus(din, 130); bus(sum, 190, 'w-sum');
    T(g, 0, 268, 'testbench 在 negedge 改輸入、比對輸出', 'a-lab a-dim');
    T(g, 0, 290, 'sum 從 00 累加到 ' + s.toString(16).toUpperCase().padStart(2, '0') + '（十進位 ' + s + '），只在 in_valid = 1 的 cycle 更新', 'a-lab a-dim');
    var cur = el('g', { opacity: 0 }, g), cl = el('path', { d: 'M0 -6 V246', class: 'w-cur' }, cur), ct = T(cur, 0, -12, '', 'a-lab w-curt', 'middle');
    return { N: N, set: function (t) { cr.setAttribute('width', P * N * ease(t)); },
      cursor: function (k) { if (k == null) { cur.setAttribute('opacity', 0); return null; } var j = Math.min(N - 1, Math.floor(k * N)), x = X0 + j * P + P / 2 + P / 2; cur.setAttribute('opacity', 1); cur.setAttribute('transform', 'translate(' + x + ' 0)');
        ct.textContent = 'cycle ' + j; return { cycle: j, valid: val[j], din: din[j], sum: sum[j], next: val[j] ? (sum[j] + din[j]) & 255 : sum[j] }; } };
  }
  function lec(g) {
    var K = ['din[7:0]', 'in_valid', 'rst_n', 'sum[0] · DFF', 'sum[1] · DFF', '… sum[7] · DFF', 'sum[7:0] · PO'], L = [], ok = [];
    T(g, 0, 0, 'Golden · RTL', 'a-lab'); T(g, 600, 0, 'Revised · netlist', 'a-lab', 'end');
    K.forEach(function (k, i) {
      var y = 26 + i * 40;
      el('rect', { x: 0, y: y, width: 170, height: 28, rx: 6, class: 'l-key' }, g); T(g, 12, y + 18, k, 'a-pin');
      el('rect', { x: 430, y: y, width: 170, height: 28, rx: 6, class: 'l-key' }, g); T(g, 442, y + 18, k, 'a-pin');
      L.push(wire(g, 'M170 ' + (y + 14) + ' C300 ' + (y + 14) + ' 300 ' + (y + 14) + ' 430 ' + (y + 14), 'l-link'));
      var o = el('g', {}, g); el('circle', { cx: 300, cy: y + 14, r: 9, class: 'r-ok' }, o); el('path', { d: 'M' + 295.5 + ' ' + (y + 14) + ' l3 3 l5.5 -6', fill: 'none', stroke: '#fff', 'stroke-width': 1.8 }, o); ok.push(o);
    });
    var res = T(g, 300, 330, '', 'c-big', 'middle');
    return { set: function (t) { L.forEach(function (l, i) { draw(l, seg(t, i * 0.08, i * 0.08 + 0.3)); }); ok.forEach(function (o, i) { op(o, seg(t, 0.35 + i * 0.08, 0.4 + i * 0.08)); });
      res.textContent = Math.round(16 * seg(t, 0.35, 0.95)) + ' / 16 compared points equivalent'; } };
  }
  function labs(g) {
    var C = [['HW1', 'ROP3 窮舉驗證', 'Sim'], ['HW3', 'Enigma 合成優化', 'Synth'], ['HW4', 'QR code 解碼器', 'FSM'], ['HW5', 'Attention 加速器', 'RTL'], ['LAB05', '三級管線 CPU', 'RTL'], ['FINAL', '3DGS 硬體加速器', 'APR · 全班第一']], cs = [];
    C.forEach(function (c, i) {
      var x = (i % 3) * 200, y = Math.floor(i / 3) * 170 + 20, cg = el('g', {}, g);
      el('rect', { x: x, y: y, width: 184, height: 150, rx: 12, class: 'c-card', style: i === 5 ? 'stroke: var(--accent)' : null }, cg);
      T(cg, x + 16, y + 30, c[0], 'a-lab a-dim'); T(cg, x + 16, y + 64, c[1], 'c-sub', null);
      el('rect', { x: x + 16, y: y + 106, width: c[2].length * 7.5 + 16, height: 22, rx: 11, class: 'c-tag' }, cg); T(cg, x + 24, y + 121, c[2], 'c-tagt');
      cs.push(cg);
    });
    return { set: function (t) { cs.forEach(function (c, i) { op(c, seg(t, i * 0.1, i * 0.1 + 0.3)); c.style.transform = 'translateY(' + (1 - ease(seg(t, i * 0.1, i * 0.1 + 0.3))) * 10 + 'px)'; }); } };
  }


  return { el: el, T: T, clamp01: clamp01, seg: seg, ease: ease, code: code, circuit: circuit, netlist: netlist, layout: layout, fsm: fsm, lint: lint, wave: wave, lec: lec, labs: labs, PHASES: PHASES };
})();

/* ---------- 舞台：捲動進度 p → 哪一拍、哪個場景、畫到哪裡 ---------- */
(function () {
  'use strict';
  var root = document.querySelector('[data-ic]');
  if (!root) return;
  var A = ART, el = A.el, seg = A.seg, ease = A.ease, clamp01 = A.clamp01;
  var track = root.querySelector('.ic-track'), stage = root.querySelector('.ic-stage'), svg = root.querySelector('[data-world]');
  var beats = [].slice.call(root.querySelectorAll('[data-beat]')), rail = root.querySelector('[data-rail]'), playBtn = root.querySelector('[data-play]');
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 每一拍的權重寫在 HTML 的 data-w；章節寫在 data-ch
  var B = beats.map(function (b) { return { id: b.dataset.beat, w: +b.dataset.w || 1, ch: +b.dataset.ch, node: b }; });
  var HOLD = 0.35, total = B.reduce(function (s, b) { return s + b.w; }, HOLD), acc = 0, span = {};
  B.forEach(function (b) { span[b.id] = { s: acc / total, l: b.w / total }; acc += b.w; });
  function lt(id, p) { return span[id] ? clamp01((p - span[id].s) / span[id].l) : 0; }

  /* 場景：每個都放在 680×470 的世界裡，鏡頭不動，只有淡入淡出 */
  function place(tx, ty, s) { return el('g', { transform: 'translate(' + tx + ' ' + ty + ')' + (s ? ' scale(' + s + ')' : '') }, svg); }
  var win = place(40, 40);
  el('rect', { x: 0, y: 0, width: 520, height: 350, rx: 10, class: 'win' }, win);
  el('path', { d: 'M0 36 H520', class: 'win-bar' }, win);
  A.T(win, 20, 23, 'acc.v', 'a-lab'); A.T(win, 500, 23, 'Verilog', 'a-lab a-dim', 'end');
  var S = {
    code: { g: win, sc: A.code(el('g', { transform: 'translate(22 52)' }, win), { lh: 26, w: 490 }) },
    circuit: { g: place(20, 80) }, fsm: { g: place(40, 70) }, lint: { g: place(10, 50) }, wave: { g: place(14, 70) },
    netlist: { g: place(20, 50) }, lec: { g: place(0, 40) }, labs: { g: place(8, 30) }, layout: { g: place(20, 0) }
  };
  S.circuit.sc = A.circuit(S.circuit.g); S.fsm.sc = A.fsm(S.fsm.g); S.lint.sc = A.lint(S.lint.g); S.wave.sc = A.wave(S.wave.g);
  S.netlist.sc = A.netlist(S.netlist.g); S.lec.sc = A.lec(S.lec.g); S.labs.sc = A.labs(S.labs.g); S.layout.sc = A.layout(S.layout.g, 11);
  // 哪一拍用哪個場景
  var SCENE = { code: 'code', circuit: 'circuit', fsm: 'fsm', lint: 'lint', sim: 'wave', synth: 'netlist', lec: 'lec', floorplan: 'layout', power: 'layout', place: 'layout', cts: 'layout', route: 'layout', labs: 'labs', final: 'layout' };
  var RUNS = [];
  B.forEach(function (b, i) {
    var name = SCENE[b.id], r = RUNS[RUNS.length - 1];
    if (r && r.name === name) return;
    if (r) r.next = b.id;
    RUNS.push({ name: name, first: b.id, next: null });
  });

  // 章節列
  var CH = [];
  B.forEach(function (b) { (CH[b.ch] = CH[b.ch] || []).push(b.id); });
  var names = (rail.dataset.names || '').split('|');
  CH.forEach(function (ids, i) { rail.insertAdjacentHTML('beforeend', '<button type="button" data-ch="' + i + '"><i></i>' + (names[i] || i + 1) + '</button>'); });
  var chBtns = [].slice.call(rail.children);

  function vis(g, k, s) { g.style.opacity = k; g.style.visibility = k > 0.001 ? 'visible' : 'hidden'; g.style.scale = s == null ? 1 : s; }
  var cur = -1;
  function render(p) {
    var bi = 0; B.forEach(function (b, i) { if (p >= span[b.id].s) bi = i; });
    if (bi !== cur) { cur = bi; B.forEach(function (b, i) { b.node.classList.toggle('is-on', i === bi); }); }
    // 每個場景的可見度：連續用同一個場景的幾拍算一段，下一段第一拍的前 10% 淡出、6–20% 淡入，兩個畫面不會疊太久
    var k = {};
    RUNS.forEach(function (r, i) {
      var v = (i ? seg(lt(r.first, p), 0.06, 0.2) : 1) * (r.next ? 1 - seg(lt(r.next, p), 0, 0.1) : 1);
      k[r.name] = Math.max(k[r.name] || 0, v);
    });
    var t = function (id, a, b) { return seg(lt(id, p), a == null ? 0.08 : a, b == null ? 0.8 : b); };
    S.code.sc.set(t('code', 0.05, 0.72), lt('code', p) > 0.78 ? [5, 7, 8, 9] : null);
    S.circuit.sc.set(t('circuit')); S.fsm.sc.set(t('fsm', 0.05, 0.9)); S.lint.sc.set(t('lint')); S.wave.sc.set(t('sim', 0.08, 0.85));
    S.netlist.sc.set(t('synth')); S.lec.sc.set(t('lec', 0.08, 0.85)); S.labs.sc.set(t('labs', 0.08, 0.7));
    var a = span.floorplan.s, b = span.route.s + span.route.l;
    S.layout.sc.set(clamp01((p - a) / (b - a)));
    var tf = lt('final', p);
    Object.keys(S).forEach(function (n) {
      vis(S[n].g, k[n] || 0, n === 'layout' ? 1 - 0.14 * ease(tf) : 0.97 + 0.03 * (k[n] || 0));
    });
    S.layout.g.classList.toggle('glow', tf > 0.1);
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

  // 點章節：跳到那一章第一拍演到 60% 的地方
  rail.addEventListener('click', function (e) {
    var btn = e.target.closest('button'); if (!btn) return;
    stop(); var id = CH[+btn.dataset.ch][0];
    scrollTo({ top: topOf(span[id].s + span[id].l * 0.6), behavior: 'smooth' });
  });

  // 自動播放：幫使用者捲，碰到滾輪、觸控、鍵盤就停
  var playing = 0, last = 0, SPEED = 1 / 75; // 75 秒走完
  function step(now) {
    if (!playing) return;
    var dt = Math.min(64, now - last); last = now;
    var p = progress();
    if (p >= 1) { stop(); return; }
    var r = range(), y = scrollY + dt / 1000 * SPEED * r;
    window.scrollTo(0, y);
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
