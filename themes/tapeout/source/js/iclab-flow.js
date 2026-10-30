(function () {
  'use strict';
  var html = document.documentElement;
  var root = document.querySelector('[data-ic]');
  if (!root) return;
  var track = root.querySelector('.ic-track'), stage = root.querySelector('.ic-stage');
  var svg = root.querySelector('[data-world]'), panel = root.querySelector('.ic-panel');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cfg = JSON.parse(document.getElementById('ic-cfg').textContent), NOTE = cfg.notes;
  var NS = 'http://www.w3.org/2000/svg';

  // ---- helpers ----
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function lod(w, near, far) { return clamp01((Math.log(w) - Math.log(near)) / (Math.log(far) - Math.log(near))); }
  function el(name, attrs, parent, text) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function T(g, x, y, s, cls) { return el('text', { x: x, y: y, class: cls }, g, s); }
  function G(parent, attrs) { return el('g', attrs || {}, parent); }
  // 值沒變就不寫回 DOM
  function set(e, k, v) { var key = '_x_' + k; if (e[key] === v) return; e[key] = v; e.setAttribute(k, v); }
  function show(e, o) { set(e, 'opacity', Math.round(clamp01(o) * 100) / 100); }
  function text(e, s) { if (e._t !== s) { e._t = s; e.textContent = s; } }
  function cls(e, c) { set(e, 'class', c); }
  function wire(g, d, c) { return el('path', { d: d, class: c || 'wire', pathLength: 1, 'stroke-dasharray': '1 1', 'stroke-dashoffset': 1, opacity: 0 }, g); }
  function draw(e, k) {
    set(e, 'stroke-dashoffset', Math.round((1 - k) * 1000) / 1000); set(e, 'opacity', k > 0 ? 1 : 0);
    if (e._arr) set(e, 'marker-end', k > 0.96 ? 'url(#' + e._arr + ')' : 'none');
  }
  function arrow(g, d, c, hot) { var w = wire(g, d, c); w._arr = hot ? 'ic-arr-h' : 'ic-arr'; return w; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function comma(n) { return Math.round(n).toLocaleString('en-US'); }
  function hex2(n) { return (n < 16 ? '0' : '') + n.toString(16).toUpperCase(); }

  var defs = el('defs', {}, svg);
  [['ic-arr', 'arr'], ['ic-arr-h', 'arr-h']].forEach(function (m) {
    var mk = el('marker', { id: m[0], viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto-start-reverse' }, defs);
    el('path', { d: 'M0 0 L10 5 L0 10 z', class: m[1] }, mk);
  });
  var world = G(svg);

  // 筆記入口：一張可以點的卡片，h < 46 時小標和標題排成一行
  function Card(g, key, x, y, w, h) {
    var n = NOTE[key], a = el('a', { href: n.href, class: 'note', opacity: 0 }, g);
    el('title', {}, a, n.title);
    el('rect', { x: x, y: y, width: w, height: h, rx: 4, class: 'note-box' }, a);
    if (h < 46) { T(a, x + 12, y + h / 2 + 4, n.kind + ' ↗', 't-k'); T(a, x + 12 + (n.kind.length + 3) * 8, y + h / 2 + 5, n.short, 't-note'); }
    else { T(a, x + 12, y + 20, n.kind + ' ↗', 't-k'); T(a, x + 12, y + h - 13, n.short, 't-note'); }
    return a;
  }

  // ================= 流程線與場景的位置 =================
  // 每一站一個 1200 寬的場景，左右間隔 200；流程線在場景上方 y = -60
  var OX = { rtl: 0, fsm: 1400, lint: 2800, sim: 4200, synth: 5600, lec: 7000, apr: 8400 };
  var LINE_Y = -60, END_X = 9900;
  var STATIONS = [ // [beat, x, 近看的標籤, 拉遠的大字, 週次]
    ['rtl', 600, '01 RTL', 'RTL', 'W2–5'], ['fsm', 2000, '02 FSM', 'FSM', 'W4'], ['lint', 3400, '03 Lint', 'Lint', 'W1'],
    ['sim', 4800, '04 Simulation', 'Sim', 'W3'], ['synth', 6200, '05 Synthesis', 'Synth', 'W6–8'], ['lec', 7600, '06 LEC', 'LEC', 'W9–10'],
    ['floorplan', 8560, '07 Floor', 'APR', 'W11–13'], ['power', 8760, '08 Power'], ['place', 8960, '09 Place'],
    ['cts', 9160, '10 CTS'], ['route', 9360, '11 Route'], ['signoff', 9560, '12 Sign-off']
  ];
  var STX = { intro: 0, projects: 10900 };
  STATIONS.forEach(function (s) { STX[s[0]] = s[1]; });

  var W = {};
  (function () {
    var g = G(world);
    W.flow = g;
    el('path', { d: 'M-1700 ' + LINE_Y + ' H0', class: 'flow-d' }, g);
    el('path', { d: 'M0 ' + LINE_Y + ' H' + END_X, class: 'flow' }, g);
    el('path', { d: 'M' + END_X + ' ' + LINE_Y + ' H11700', class: 'flow-d' }, g);
    W.flowH = el('path', { d: 'M0 ' + LINE_Y + ' H0', class: 'flow-h' }, g);
    // 場景的虛線框：拉遠時看得出每一站佔哪一塊
    Object.keys(OX).forEach(function (k) { el('rect', { x: OX[k], y: 0, width: 1200, height: k === 'synth' ? 800 : 760, class: 'frame-d' }, g); });

    // 拉遠才看得到的大字、大點
    var far = G(g);
    W.far = far;
    W.farDots = [];
    STATIONS.forEach(function (s) {
      if (!s[3]) return;
      var x = s[0] === 'floorplan' ? 9000 : s[1];
      W.farDots.push({ beat: s[0], c: el('circle', { cx: x, cy: LINE_Y, r: 46, class: 'dot' }, far) });
      T(far, x, -190, s[3], 't-xl mid');
      T(far, x, -470, s[4], 't-wk mid');
    });
    [[-1100, 'Spec', 'System spec · Architecture'], [10900, 'Fab', 'Fabrication · Packaging']].forEach(function (s) {
      el('circle', { cx: s[0], cy: LINE_Y, r: 46, class: 'dot is-ghost' }, far);
      T(far, s[0], -190, s[1], 't-xl mid is-ghost');
      T(far, s[0], -470, s[2], 't-wk mid');
    });
    // ICLAB 的範圍
    W.brace = G(far, { opacity: 0 });
    el('path', { d: 'M0 -640 V-700 H' + END_X + ' V-640', class: 'brace' }, W.brace);
    T(W.brace, END_X / 2, -760, 'ICLAB · EE4292：從 RTL 到 layout', 't-lg mid');

    // 近看的小點與標籤
    var near = G(g);
    W.near = near;
    W.dots = STATIONS.map(function (s) {
      return { beat: s[0], c: el('circle', { cx: s[1], cy: LINE_Y, r: s[3] ? 7 : 5, class: 'dot' }, near), t: T(near, s[1], LINE_Y + 26, s[2], 'slab mid') };
    });
    W.tokHalo = el('circle', { cx: 0, cy: LINE_Y, r: 16, class: 'tok-halo' }, g);
    W.tok = el('circle', { cx: 0, cy: LINE_Y, r: 7, class: 'tok' }, g);
    W.tokFar = el('circle', { cx: 0, cy: LINE_Y, r: 60, class: 'tok', opacity: 0 }, far);
  })();
  function scene(k) { return G(world, { transform: 'translate(' + OX[k] + ' 0)' }); }

  // ================= 01 RTL：11 行 code 與它描述的電路 =================
  var CW = 10.2; // IBM Plex Mono 17px 的字寬（0.6 em）
  function Code(g, x, y, lines, lh) {
    return lines.map(function (s, i) { var t = T(g, x, y + i * lh, '', 't-code'); return { e: t, s: s, y: y + i * lh }; });
  }
  function typeLines(L, k) { // k: 0–1，整段打字的進度
    var total = L.reduce(function (s, l) { return s + l.s.length + 4; }, 0), n = Math.round(k * total);
    L.forEach(function (l) { var c = Math.max(0, Math.min(l.s.length, n)); text(l.e, l.s.slice(0, c)); n -= l.s.length + 4; });
  }
  function band(g, L, line, tok, x0, nth, c) {
    var s = L[line].s, col = s.indexOf(tok);
    for (var i = 0; i < (nth || 0); i++) col = s.indexOf(tok, col + 1);
    return el('rect', { x: r1(x0 + col * CW - 3), y: L[line].y - 19, width: r1(tok.length * CW + 6), height: 26, rx: 3, class: c || 'band', opacity: 0 }, g);
  }
  var RTL = {};
  (function () {
    var g = scene('rtl');
    el('rect', { x: 20, y: 20, width: 660, height: 400, rx: 6, class: 'card' }, g);
    el('path', { d: 'M20 52 H680', class: 'wire', style: 'stroke: var(--line-2); stroke-width: 1' }, g);
    T(g, 36, 41, 'acc.v', 't-d');
    var hl = G(g);
    RTL.L = Code(g, 44, 86, [
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
    ], 30);
    var L = RTL.L;
    // 每一個重點：[標記…]、卡片、引線從哪個標記拉出來
    var marks = [
      { bands: [band(hl, L, 2, '[W-1:0]', 44), band(hl, L, 0, 'parameter W = 8', 44)], card: 'datatype' },
      { bands: [band(hl, L, 5, 'sum + din', 44)], card: 'operators' },
      { bands: [band(hl, L, 8, '<=', 44), band(hl, L, 9, '<=', 44)], card: 'assign' },
      { bands: [band(hl, L, 7, '@(posedge clk or negedge rst_n)', 44)], card: 'timing' },
      { bands: [band(hl, L, 8, 'if (!rst_n)', 44)], card: 'guide' },
      { bands: [], card: 'func' }
    ];
    var order = [0, 1, 2, 3, 4, 5]; // 卡片由左到右的順序
    RTL.marks = marks.map(function (m, i) {
      var cx = 20 + order[i] * 196, card = Card(g, m.card, cx, 470, 180, 56), b = m.bands[0], lead = null;
      if (b) {
        var bx = +b.getAttribute('x') + +b.getAttribute('width') / 2, by = +b.getAttribute('y') + 26;
        lead = wire(g, 'M' + r1(bx) + ' ' + by + ' V' + (444 - i * 4) + ' H' + (cx + 90) + ' V470', 'lead');
      }
      return { bands: m.bands, card: card, lead: lead };
    });

    // 右邊：這段 code 描述的硬體
    var c = G(g);
    T(c, 720, 44, '這段 code 描述的硬體', 't-d');
    RTL.add = G(c, { opacity: 0 });
    T(RTL.add, 736, 192, 'din', 't-s');
    el('circle', { cx: 820, cy: 200, r: 22, class: 'gate' }, RTL.add);
    T(RTL.add, 820, 207, '+', 't-b mid');
    T(RTL.add, 820, 160, 'nxt = sum + din', 't-s mid');
    RTL.wDin = arrow(c, 'M736 200 H797', 'wire');
    RTL.wNxt = arrow(c, 'M842 200 H899', 'wire');
    RTL.mux = G(c, { opacity: 0 });
    el('path', { d: 'M900 170 L944 184 L944 266 L900 280 Z', class: 'gate' }, RTL.mux);
    T(RTL.mux, 908, 205, '1', 't-s'); T(RTL.mux, 908, 255, '0', 't-s');
    T(RTL.mux, 922, 350, 'in_valid', 't-s mid');
    RTL.wSel = arrow(c, 'M922 334 V275', 'wire');
    RTL.wMux = arrow(c, 'M944 225 H999', 'wire');
    RTL.ff = G(c, { opacity: 0 });
    el('rect', { x: 1000, y: 180, width: 76, height: 100, class: 'gate-h' }, RTL.ff);
    T(RTL.ff, 1010, 230, 'D', 't-s'); T(RTL.ff, 1056, 230, 'Q', 't-s');
    T(RTL.ff, 1038, 168, '×8 flip-flop', 't-s mid');
    el('path', { d: 'M1000 258 L1012 266 L1000 274', class: 'wire' }, RTL.ff);
    RTL.clk = G(c, { opacity: 0 });
    T(RTL.clk, 958, 300, 'clk, rst_n', 't-h');
    RTL.wClk = arrow(c, 'M976 266 H999', 'wire-h', true);
    RTL.wQ = arrow(c, 'M1076 225 H1176', 'wire');
    RTL.qLab = T(c, 1150, 214, 'sum', 't-s mid'); show(RTL.qLab, 0);
    RTL.wFb = arrow(c, 'M1110 225 V390 H780 V250 H899', 'wire');
    RTL.wFb2 = arrow(c, 'M820 250 V223', 'wire');
    RTL.fbLab = T(c, 945, 382, 'sum 接回加法器', 't-s mid'); show(RTL.fbLab, 0);
  })();

  // ================= 02 FSM =================
  var FSM = {};
  (function () {
    var g = scene('fsm');
    var P = { IDLE: [150, 140], LOAD: [450, 140], DONE: [300, 340] };
    FSM.bub = {};
    FSM.bg = G(g, { opacity: 0 });
    Object.keys(P).forEach(function (k) {
      FSM.bub[k] = el('circle', { cx: P[k][0], cy: P[k][1], r: 52, class: 'bubble' }, FSM.bg);
      T(FSM.bg, P[k][0], P[k][1] + 6, k, 't-b mid');
    });
    FSM.tr = {
      'IDLE>LOAD': [arrow(g, 'M204 128 Q300 86 396 128', 'wire'), T(g, 300, 92, 'load', 't-s mid')],
      'LOAD>DONE': [arrow(g, 'M466 192 Q450 290 352 336', 'wire'), T(g, 462, 290, '!load', 't-s')],
      'DONE>LOAD': [arrow(g, 'M300 287 Q330 220 410 178', 'wire'), T(g, 318, 230, 'load', 't-s')],
      'rst>IDLE': [arrow(g, 'M40 40 L112 102', 'wire'), T(g, 30, 32, 'rst', 't-s')]
    };
    Object.keys(FSM.tr).forEach(function (k) { show(FSM.tr[k][1], 0); });

    FSM.blocks = G(g, { opacity: 0 });
    [[600, 'Next-state logic', 'always @(*)', 'gate', '組合'], [810, 'State register', '@(posedge clk)', 'gate-h', '循序'], [1010, 'Output logic', 'always @(*)', 'gate', '組合']].forEach(function (b, i) {
      var w = i === 1 ? 160 : 170;
      el('rect', { x: b[0], y: 120, width: w, height: 90, rx: 4, class: b[3] }, FSM.blocks);
      T(FSM.blocks, b[0] + w / 2, 160, b[1], 't-b mid');
      T(FSM.blocks, b[0] + w / 2, 186, b[2], 't-s mid');
      T(FSM.blocks, b[0] + w / 2, 110, b[4], i === 1 ? 't-h mid' : 't-s mid');
    });
    FSM.bw = [arrow(g, 'M556 165 H599', 'wire'), arrow(g, 'M770 165 H809', 'wire'), arrow(g, 'M970 165 H1009', 'wire'), arrow(g, 'M1180 165 H1196', 'wire'),
      arrow(g, 'M990 165 V246 H685 V211', 'wire')];
    FSM.bl = G(g, { opacity: 0 });
    T(FSM.bl, 552, 158, 'load', 't-s end'); T(FSM.bl, 1186, 150, 'busy', 't-s mid'); T(FSM.bl, 838, 264, 'state', 't-s mid');

    // 一個 cycle 一格的表
    var LOADS = [0, 1, 1, 0, 0, 1, 0, 1], S = ['IDLE'];
    function nxt(s, l) { return s === 'IDLE' ? (l ? 'LOAD' : 'IDLE') : s === 'LOAD' ? (l ? 'LOAD' : 'DONE') : (l ? 'LOAD' : 'DONE'); }
    for (var i = 0; i < 7; i++) S.push(nxt(S[i], LOADS[i]));
    FSM.S = S; FSM.LOADS = LOADS;
    FSM.tab = G(g, { opacity: 0 });
    FSM.col = el('rect', { x: 0, y: 300, width: 62, height: 128, rx: 3, class: 'col-h', opacity: 0 }, FSM.tab);
    ['cycle', 'load', 'state', 'busy'].forEach(function (r, j) { T(FSM.tab, 600, 322 + j * 32, r, 't-s'); });
    for (var c = 0; c < 8; c++) {
      var x = 706 + c * 64;
      T(FSM.tab, x, 322, String(c), 't-s mid');
      T(FSM.tab, x, 354, String(LOADS[c]), 'mid');
      T(FSM.tab, x, 386, S[c], 't-s mid');
      T(FSM.tab, x, 418, S[c] === 'LOAD' ? '1' : '0', S[c] === 'LOAD' ? 't-h mid' : 'mid');
    }

    // HW4：主 FSM + 子 FSM
    FSM.hw = G(g, { opacity: 0 });
    T(FSM.hw, 20, 490, 'HW4 · QR code 解碼器：主 FSM 只管流程', 't-d');
    var names = ['IDLE', 'FIND', 'ROTATE', 'LOAD', 'DEMASK', 'DECODE'];
    names.forEach(function (n, i) {
      var x = 20 + i * 196;
      el('rect', { x: x, y: 508, width: 160, height: 40, rx: 20, class: i === 1 || i === 2 ? 'pill-h' : 'pill' }, FSM.hw);
      T(FSM.hw, x + 80, 533, n, 't-b mid');
      if (i < 5) el('path', { d: 'M' + (x + 162) + ' 528 H' + (x + 194), class: 'wire', 'marker-end': 'url(#ic-arr)' }, FSM.hw);
    });
    [[216, 'FIND 的子 FSM', 'FETCH → CHECK / UPDATE'], [412, 'ROTATE 的子 FSM', 'FETCH → CHECK → ROTATE']].forEach(function (s, i) {
      var x = i ? 430 : 120;
      el('path', { d: 'M' + (s[0] + 80) + ' 550 V586', class: 'lead-d' }, FSM.hw);
      el('rect', { x: x, y: 586, width: 290, height: 56, rx: 4, class: 'frame-d' }, FSM.hw);
      T(FSM.hw, x + 12, 606, s[1], 't-s');
      T(FSM.hw, x + 12, 630, s[2], 't-b');
    });
    T(FSM.hw, 750, 606, '只重讀 2 個新的 SRAM block，', 't-s');
    T(FSM.hw, 750, 628, '另外 2 個沿用上一次的', 't-s');
    FSM.cards = [Card(g, 'fsm', 20, 680, 180, 56), Card(g, 'hw4', 216, 680, 180, 56), Card(g, 'lab05', 412, 680, 180, 56)];
  })();

  // ================= 03 Lint =================
  var LN = {};
  (function () {
    var g = scene('lint');
    el('rect', { x: 20, y: 20, width: 600, height: 270, rx: 6, class: 'card' }, g);
    el('path', { d: 'M20 52 H620', class: 'wire', style: 'stroke: var(--line-2); stroke-width: 1' }, g);
    T(g, 36, 41, 'decode.v', 't-d');
    LN.scan = el('rect', { x: 24, y: 60, width: 592, height: 28, class: 'scan', opacity: 0 }, g);
    LN.bad = band(g, [{ s: '  case (b)', y: 116 }], 0, 'case (b)', 44, 0, 'band-n');
    var L = Code(g, 44, 86, ['always @(*) begin', '  case (b)', "    1'b1: y = a;", '  endcase', 'end'], 30);
    L.forEach(function (l) { text(l.e, l.s); });
    LN.shift = G(g); // 插入預設值之後，下面四行往下移一行
    L.slice(1).forEach(function (l) { LN.shift.appendChild(l.e); });
    LN.shift.appendChild(LN.bad);
    LN.fix = T(g, 44, 116, "  y = 1'b0;           // default", 't-code');
    LN.fixBand = el('rect', { x: 40, y: 97, width: 120, height: 26, rx: 3, class: 'band', opacity: 0 }, g);

    LN.warn = G(g, { opacity: 0 });
    el('rect', { x: 660, y: 70, width: 520, height: 76, rx: 4, class: 'card-n' }, LN.warn);
    T(LN.warn, 680, 100, '⚠ latch inferred: y', 't-n');
    T(LN.warn, 680, 128, 'b = 0 時沒有給 y 值，y 只好記住舊值', 't-s');
    LN.ok = G(g, { opacity: 0 });
    el('rect', { x: 660, y: 70, width: 520, height: 76, rx: 4, class: 'card-h' }, LN.ok);
    T(LN.ok, 680, 100, '✓ 純組合邏輯', 't-h');
    T(LN.ok, 680, 128, '一開始先給所有輸出預設值，就不會有 latch', 't-s');
    LN.lead = wire(g, 'M190 116 H400 V108 H659', 'lead');

    T(g, 660, 194, 'lint 會抓的', 't-d');
    LN.chips = ['會合成出 latch', '位寬不一致', 'multiple drivers', '宣告了卻沒用到'].map(function (s, i) {
      var cg = G(g, { opacity: 0 }), x = 660 + (i % 2) * 264, y = 208 + Math.floor(i / 2) * 54;
      el('rect', { x: x, y: y, width: 250, height: 42, rx: 4, class: 'card' }, cg);
      T(cg, x + 14, y + 27, s, i ? '' : 't-n');
      return cg;
    });

    T(g, 20, 344, 'spy.tcl · 依序跑四個 lint goal', 't-d');
    LN.goals = ['lint/lint_rtl', 'lint/lint_turbo_rtl', 'lint/lint_functional_rtl', 'lint/lint_abstract'].map(function (s, i) {
      var y = 376 + i * 44;
      T(g, 20, y + 6, s, 't-b');
      el('rect', { x: 330, y: y - 4, width: 260, height: 8, rx: 4, class: 'bar-bg' }, g);
      return { bar: el('rect', { x: 330, y: y - 4, width: 0, height: 8, rx: 4, class: 'bar-h' }, g), ok: T(g, 604, y + 7, '✓', 't-h') };
    });
    LN.goals.forEach(function (q) { show(q.ok, 0); });
    LN.rpt = T(g, 20, 562, '→ capture -append enigma_part2.rpt', 't-s'); show(LN.rpt, 0);
    LN.cards = [Card(g, 'lint', 660, 340, 250, 56), Card(g, 'guide', 924, 340, 250, 56), Card(g, 'synth', 660, 410, 250, 56), Card(g, 'assign', 924, 410, 250, 56)];
  })();

  // ================= 04 Simulation =================
  var SIM = {};
  (function () {
    var g = scene('sim');
    el('rect', { x: 20, y: 20, width: 1160, height: 290, rx: 6, class: 'frame-d' }, g);
    T(g, 36, 44, 'testbench.v', 't-d');
    SIM.boxes = [
      [50, 70, 260, 150, 'card', 'pattern', ['for 迴圈產生，或', '$readmemh 讀檔', '@(negedge clk) 送出']],
      [470, 70, 260, 150, 'card-h', 'acc  (DUT)', ['u_acc', '在 posedge 取樣']],
      [880, 70, 270, 150, 'card', '比對', ['@(negedge clk)', 'if (sum !== golden[i])', '  $display … $finish']]
    ].map(function (b) {
      var bg = G(g, { opacity: 0 });
      el('rect', { x: b[0], y: b[1], width: b[2], height: b[3], rx: 4, class: b[4] }, bg);
      T(bg, b[0] + 16, b[1] + 30, b[5], 't-b');
      b[6].forEach(function (s, i) { T(bg, b[0] + 16, b[1] + 64 + i * 26, s, 't-s'); });
      return bg;
    });
    SIM.gold = G(g, { opacity: 0 });
    el('rect', { x: 880, y: 244, width: 270, height: 46, rx: 4, class: 'card' }, SIM.gold);
    T(SIM.gold, 896, 273, 'golden.dat（Python 算的）', 't-s');
    SIM.clkTx = T(g, 50, 280, 'always #(CYCLE/2) clk = ~clk;', 't-s'); show(SIM.clkTx, 0);
    SIM.w = [arrow(g, 'M310 128 H469', 'wire'), arrow(g, 'M310 176 H469', 'wire'), arrow(g, 'M730 145 H879', 'wire-h', true), arrow(g, 'M1015 244 V221', 'wire')];
    SIM.wl = G(g, { opacity: 0 });
    T(SIM.wl, 390, 120, 'din, in_valid', 't-s mid'); T(SIM.wl, 390, 168, 'clk, rst_n', 't-s mid'); T(SIM.wl, 805, 137, 'sum', 't-h mid');

    // 波形：12 個 cycle，testbench 在 negedge 改輸入，DUT 在 posedge 更新 sum
    var X0 = 160, P = 1000 / 12, NC = 12, ROWS = ['clk', 'rst_n', 'in_valid', 'din', 'sum', 'check'];
    function rowY(r) { return 370 + r * 44; }
    var r = mulberry32(hash('acc-tb')), V = [], D = [];
    for (var j = 0; j < NC; j++) { V.push(j === 0 ? 0 : (r() < 0.75 ? 1 : 0)); D.push(j === 0 ? 0 : Math.floor(r() * 256)); }
    // posedge k（k = 1…11）取樣 negedge (k − 0.5) 送的 V[k−1]、D[k−1]；rst_n 在 1.5P 才放開
    var SUM = [0];
    for (var k = 1; k < NC; k++) SUM.push(k <= 1 ? 0 : (V[k - 1] ? (SUM[k - 1] + D[k - 1]) & 255 : SUM[k - 1]));
    SIM.SUM = SUM; SIM.V = V; SIM.D = D;
    var wg = G(g);
    var clip = el('clipPath', { id: 'ic-wclip' }, defs);
    SIM.clip = el('rect', { x: X0 - 2, y: 340, width: 0, height: 290 }, clip);
    wg.setAttribute('clip-path', 'url(#ic-wclip)');
    SIM.labels = G(g, { opacity: 0 });
    ROWS.forEach(function (n, i) { T(SIM.labels, 30, rowY(i) + 5, n, 't-s'); });
    function x(tm) { return r1(X0 + tm * P); }
    var hi = -12, lo = 12, d = 'M' + X0 + ' ' + (rowY(0) + hi);
    for (var c = 0; c < NC; c++) d += ' H' + x(c + 0.5) + ' V' + (rowY(0) + lo) + ' H' + x(c + 1) + ' V' + (rowY(0) + hi);
    el('path', { d: d, class: 'wave' }, wg);
    el('path', { d: 'M' + X0 + ' ' + (rowY(1) + lo) + ' H' + x(1.5) + ' V' + (rowY(1) + hi) + ' H' + x(NC), class: 'wave' }, wg);
    var dv = 'M' + X0 + ' ' + (rowY(2) + lo), lv = 0;
    for (c = 0; c < NC; c++) { var tv = c + 0.5; if (V[c] !== lv) { dv += ' H' + x(tv) + ' V' + (rowY(2) + (V[c] ? hi : lo)); lv = V[c]; } }
    el('path', { d: dv + ' H' + x(NC), class: 'wave' }, wg);
    function bus(row, segs, cl) { // segs: [[t0, t1, label]]
      var y = rowY(row), dd = '';
      segs.forEach(function (s) {
        var a = x(s[0]), b = x(s[1]), e = 5;
        dd += 'M' + a + ' ' + y + ' L' + (a + e) + ' ' + (y + hi) + ' H' + (b - e) + ' L' + b + ' ' + y + ' L' + (b - e) + ' ' + (y + lo) + ' H' + (a + e) + ' Z ';
        T(wg, (a + b) / 2, y + 5, s[2], 't-s mid');
      });
      el('path', { d: dd, class: cl || 'wave' }, wg);
    }
    var ds = [[0, 1.5, 'xx']];
    for (c = 1; c < NC; c++) ds.push([c + 0.5, c + 1.5 > NC ? NC : c + 1.5, hex2(D[c])]);
    bus(3, ds);
    var ss = [];
    for (c = 0; c < NC; c++) ss.push([c, c + 1, hex2(SUM[c])]);
    bus(4, ss, 'wave-h');
    // 在 negedge 比對：第 2 個 cycle 之後每個 negedge 一個 ✓
    SIM.checks = [];
    for (c = 2; c < NC; c++) SIM.checks.push({ x: x(c + 0.5), t: T(wg, x(c + 0.5), rowY(5) + 6, '✓', 't-h mid') });
    SIM.cursor = el('line', { x1: 0, y1: 344, x2: 0, y2: 600, class: 'cursor', opacity: 0 }, g);
    SIM.neg = G(g, { opacity: 0 });
    el('line', { x1: x(4.5), y1: 330, x2: x(4.5), y2: 600, class: 'mark-h' }, SIM.neg);
    T(SIM.neg, x(4.5) + 6, 334, 'negedge：TB 改輸入、比對', 't-h');
    SIM.pos = G(g, { opacity: 0 });
    el('line', { x1: x(5), y1: 348, x2: x(5), y2: 612, class: 'mark-n' }, SIM.pos);
    T(SIM.pos, x(5) + 6, 628, 'posedge：DUT 取樣、更新 sum', 't-n');
    SIM.count = T(g, 1180, 334, '', 't-s end');
    SIM.done = T(g, 20, 660, 'Congratulations! All patterns passed.', 't-h'); show(SIM.done, 0);
    SIM.X0 = X0; SIM.P = P; SIM.NC = NC;
    SIM.cards = [Card(g, 'tb', 600, 690, 180, 56), Card(g, 'timing', 796, 690, 180, 56), Card(g, 'hw1', 992, 690, 180, 56)];
  })();

  // ================= 05 Synthesis =================
  var SY = {};
  (function () {
    var g = scene('synth');
    SY.files = [['.v', 'RTL'], ['.sdc', 'constraint'], ['.db', 'standard cell library']].map(function (f, i) {
      var fg = G(g, { opacity: 0 }), y = 40 + i * 80;
      el('rect', { x: 20, y: y, width: 210, height: 58, rx: 4, class: 'card' }, fg);
      T(fg, 34, y + 24, f[0], 't-h'); T(fg, 34, y + 46, f[1], 't-s');
      return fg;
    });
    SY.fw = [arrow(g, 'M230 69 H260 V110 H279', 'wire'), arrow(g, 'M230 149 H279', 'wire'), arrow(g, 'M230 229 H260 V190 H279', 'wire')];
    SY.dc = G(g, { opacity: 0 });
    el('rect', { x: 280, y: 70, width: 200, height: 160, rx: 4, class: 'card-h' }, SY.dc);
    T(SY.dc, 296, 100, 'Design Compiler', 't-b');
    T(SY.dc, 296, 128, 'read → elaborate', 't-s'); T(SY.dc, 296, 150, '→ uniquify → compile', 't-s');
    el('rect', { x: 296, y: 196, width: 168, height: 8, rx: 4, class: 'bar-bg' }, SY.dc);
    SY.prog = el('rect', { x: 296, y: 196, width: 0, height: 8, rx: 4, class: 'bar-h' }, SY.dc);
    SY.wOut = arrow(g, 'M480 150 H519', 'wire-h', true);

    el('rect', { x: 520, y: 20, width: 660, height: 400, rx: 4, class: 'frame-d' }, g);
    T(g, 536, 44, 'netlist.v · gate-level（acc，W = 8）', 't-d');
    SY.rows = []; SY.mux = []; SY.byp = [];
    var ck = G(g, { opacity: 0 });
    SY.ck = ck;
    for (var i = 0; i < 8; i++) {
      var y = 60 + i * 40, rg = G(g, { opacity: 0 });
      el('rect', { x: 560, y: y, width: 60, height: 28, class: 'gate' }, rg); T(rg, 590, y + 19, 'FA', 't-s mid');
      if (i < 7) el('path', { d: 'M580 ' + (y + 28) + ' V' + (y + 40), class: 'wire' }, rg);
      el('path', { d: 'M620 ' + (y + 14) + ' H680', class: 'wire' }, rg);
      el('path', { d: 'M716 ' + (y + 14) + ' H780', class: 'wire' }, rg);
      el('rect', { x: 780, y: y, width: 64, height: 28, class: 'gate-h' }, rg); T(rg, 812, y + 19, 'DFF', 't-s mid');
      el('path', { d: 'M844 ' + (y + 14) + ' H884', class: 'wire' }, rg); T(rg, 890, y + 19, 'sum[' + i + ']', 't-s');
      var mx = el('path', { d: 'M680 ' + (y - 2) + ' L716 ' + (y + 6) + ' L716 ' + (y + 22) + ' L680 ' + (y + 30) + ' Z', class: 'gate' }, rg);
      SY.mux.push(mx);
      SY.byp.push(wire(g, 'M620 ' + (y + 14) + ' H780', 'wire-h'));
      el('path', { d: 'M766 ' + (y + 22) + ' H780', class: 'wire' }, ck);
      SY.rows.push(rg);
    }
    el('path', { d: 'M766 52 V380', class: 'wire' }, ck);
    T(ck, 760, 400, 'clk', 't-s end');
    SY.icg = G(g, { opacity: 0 });
    el('rect', { x: 730, y: 372, width: 72, height: 30, class: 'gate-h' }, SY.icg);
    T(SY.icg, 766, 393, 'ICG', 't-h mid');
    T(SY.icg, 720, 393, 'in_valid', 't-s end');
    SY.gck = wire(g, 'M766 372 V52', 'wire-h');
    // Lab06 的數字（另一個設計）
    SY.nums = G(g, { opacity: 0 });
    T(SY.nums, 976, 76, 'Lab06 · clock gating', 't-d');
    T(SY.nums, 976, 96, '（另一個設計的 DC report）', 't-s');
    SY.nv = [['總面積', 174469, 146549, 0], ['Dynamic power', 11.833, 2.359, 3], ['Cycle time (ns)', 3.08, 3.14, 2]].map(function (n, i) {
      var y = 136 + i * 62;
      T(SY.nums, 976, y, n[0], 't-s');
      return { t: T(SY.nums, 976, y + 26, '', 't-big'), a: n[1], b: n[2], d: n[3] };
    });

    // HW3 的 PI
    var PI = [['起點：rotor 用 offset', 8.8], ['Rotor A 改用 shift', 7.3], ['Rotor B 改成固定的 permutation', 7.3], ['4 級 pipeline', 6.9], ['更深的 pipeline', 6.0], ['拿掉 datapath 的 reset', 4.8]];
    SY.pt = T(g, 20, 456, 'HW3 · Enigma 的 Area × Cycle time（×10⁴，越小越好）', 't-d'); show(SY.pt, 0);
    SY.pi = PI.map(function (p, i) {
      var y = 478 + i * 42, pg = G(g, { opacity: 0 });
      T(pg, 20, y + 18, p[0], 't-s');
      var b = el('rect', { x: 330, y: y, width: 0, height: 24, class: i === 5 ? 'bar-h' : 'bar' }, pg);
      var v = T(pg, 340, y + 18, p[1].toFixed(1), i === 5 ? 't-h' : 't-b');
      return { g: pg, bar: b, v: v, w: p[1] / 8.8 * 560 };
    });
    SY.cards = [Card(g, 'synth', 940, 470, 230, 56), Card(g, 'dc', 940, 540, 230, 56), Card(g, 'hw3', 940, 610, 230, 56)];
  })();

  // ================= 06 LEC =================
  var LEC = {};
  (function () {
    var g = scene('lec');
    var hd = G(g, { opacity: 0 });
    LEC.hd = hd;
    T(hd, 60, 44, 'Golden · RTL', 't-b'); T(hd, 1140, 44, 'Revised · netlist', 't-b end');
    ['clk', 'rst_n', 'in_valid', 'din[7:0]'].forEach(function (s, i) {
      [[60 + i * 104, 0], [740 + i * 104, 1]].forEach(function (q) {
        el('rect', { x: q[0], y: 62, width: 96, height: 28, rx: 14, class: 'pill' }, hd);
        T(hd, q[0] + 48, 81, s, 't-s mid');
      });
    });
    T(hd, 600, 81, 'PI 11 ↔ 11', 't-s mid');
    LEC.rows = [];
    for (var i = 0; i < 9; i++) {
      var y = 118 + i * 36, isPO = i === 8, lab = isPO ? 'sum · PO ×8' : 'sum[' + i + ']';
      var rg = G(g, { opacity: 0 });
      if (!isPO) {
        el('path', { d: 'M300 ' + y + ' L420 ' + (y + 12) + ' L420 ' + (y + 16) + ' L300 ' + (y + 28) + ' Z', class: 'cone' }, rg);
        el('path', { d: 'M900 ' + y + ' L780 ' + (y + 12) + ' L780 ' + (y + 16) + ' L900 ' + (y + 28) + ' Z', class: 'cone-n' }, rg);
      } else {
        T(rg, 300, y + 19, 'PO', 't-s'); T(rg, 900, y + 19, 'PO', 't-s end');
      }
      el('rect', { x: isPO ? 380 : 420, y: y, width: isPO ? 120 : 80, height: 28, class: isPO ? 'pill' : 'gate' }, rg);
      el('rect', { x: 700, y: y, width: isPO ? 120 : 80, height: 28, class: isPO ? 'pill' : 'gate' }, rg);
      T(rg, isPO ? 440 : 460, y + 19, lab, 't-s mid'); T(rg, isPO ? 760 : 740, y + 19, lab, 't-s mid');
      var m = el('path', { d: 'M500 ' + (y + 14) + ' H700', class: 'map', opacity: 0 }, g);
      var ok = T(g, 600, y + 10, isPO ? '✓ ×8' : '✓', 't-h mid'); show(ok, 0);
      LEC.rows.push({ g: rg, m: m, ok: ok, n: isPO ? 8 : 1 });
    }
    LEC.lab = G(g, { opacity: 0 });
    T(LEC.lab, 240, 260, 'logic cone', 't-s end');
    T(LEC.lab, 960, 260, 'DesignWare / gates', 't-s');
    LEC.count = T(g, 600, 470, '', 't-b mid');

    LEC.ct = T(g, 20, 520, 'Lab10 · 16 個乘法器，四種比法', 't-d'); show(LEC.ct, 0);
    LEC.bars = [['Basic · flat', 0, 'abort'], ['Basic · hierarchical', 0, 'abort（20.95 秒就放棄）'], ['MDP · flat', 2071, '2,071 s · 4 GB'], ['MDP · hierarchical', 538, '538 s']].map(function (b, i) {
      var y = 538 + i * 38, bg = G(g, { opacity: 0 });
      T(bg, 20, y + 17, b[0], 't-s');
      var bar = el('rect', { x: 250, y: y, width: 0, height: 22, class: i === 3 ? 'bar-h' : 'bar' }, bg);
      var v = T(bg, 258, y + 17, b[2], b[1] ? (i === 3 ? 't-h' : 't-b') : 't-n');
      return { g: bg, bar: bar, v: v, w: b[1] / 2071 * 420 };
    });
    LEC.cards = [Card(g, 'lec', 860, 560, 300, 56), Card(g, 'intro', 860, 630, 300, 56)];
  })();

  // ================= 07–12 APR：一顆 die 一層一層疊上去 =================
  var AP = {};
  (function () {
    var g = scene('apr');
    var D0 = 20, D1 = 740, C0 = 100, C1 = 660, RH = 20; // die、core 的邊界，row 高 20
    AP.die = el('rect', { x: D0, y: D0, width: D1 - D0, height: D1 - D0, class: 'die', opacity: 0 }, g);
    var fp = G(g, { opacity: 0 });
    AP.fp = fp;
    el('rect', { x: C0, y: C0, width: C1 - C0, height: C1 - C0, class: 'core' }, fp);
    for (var r = 0; r <= (C1 - C0) / RH; r++) el('path', { d: 'M' + C0 + ' ' + (C0 + r * RH) + ' H' + C1, class: 'row' }, fp);
    // I/O pin：每邊 9 個，clk、rst_n 在左邊中間
    for (var s = 0; s < 4; s++) for (var p = 0; p < 9; p++) {
      var a = 140 + p * 60;
      if (s === 0) el('rect', { x: a - 5, y: D0, width: 10, height: 14, class: 'pin' }, fp);
      if (s === 1) el('rect', { x: D1 - 14, y: a - 5, width: 14, height: 10, class: 'pin' }, fp);
      if (s === 2) el('rect', { x: a - 5, y: D1 - 14, width: 10, height: 14, class: 'pin' }, fp);
      if (s === 3) el('rect', { x: D0, y: a - 5, width: 14, height: 10, class: 'pin' }, fp);
    }
    T(fp, D0 + 20, 384, 'clk', 't-h'); T(fp, D0 + 20, 444, 'rst_n', 't-h');
    var mac = { x: 130, y: 130, w: 170, h: 150 };
    el('rect', { x: mac.x - 8, y: mac.y - 8, width: mac.w + 16, height: mac.h + 16, class: 'halo' }, fp);
    el('rect', { x: mac.x, y: mac.y, width: mac.w, height: mac.h, class: 'macro' }, fp);
    T(fp, mac.x + mac.w / 2, mac.y + mac.h / 2 + 5, 'SRAM', 't-n mid');
    AP.dim = G(g, { opacity: 0 });
    el('path', { d: 'M' + D0 + ' 560 H' + C0, class: 'wire-h', 'marker-end': 'url(#ic-arr-h)', 'marker-start': 'url(#ic-arr-h)' }, AP.dim);
    T(AP.dim, (D0 + C0) / 2, 552, 'Z', 't-h mid');
    T(AP.dim, 380, C1 + 28, 'X', 't-h mid'); T(AP.dim, C1 + 16, 384, 'Y', 't-h');

    AP.cellLayer = G(g); // cell 在金屬層下面：先建好圖層，placement 的 row 之後再放進來
    // power：3 組 ring（VDD / VSS 交錯），垂直 stripe 先、水平後，最後是每一排的 rail
    AP.rings = [];
    for (var k = 0; k < 6; k++) {
      var d = 30 + k * 8; // 離 die 邊的距離
      AP.rings.push(wire(g, 'M' + (D0 + d) + ' ' + (D0 + d) + ' H' + (D1 - d) + ' V' + (D1 - d) + ' H' + (D0 + d) + ' Z', 'phys ' + (k % 2 ? 'vss' : 'vdd')));
      AP.rings[k].style.strokeWidth = '6px';
    }
    AP.vs = []; AP.hs = [];
    [190, 330, 470, 610].forEach(function (x0) {
      [0, 1].forEach(function (q) { var w = wire(g, 'M' + (x0 + q * 12) + ' ' + (D0 + 30) + ' V' + (D1 - 30), 'phys ' + (q ? 'vss' : 'vdd')); w.style.strokeWidth = '5px'; AP.vs.push(w); });
    });
    [300, 500].forEach(function (y0) {
      [0, 1].forEach(function (q) { var w = wire(g, 'M' + (D0 + 30) + ' ' + (y0 + q * 12) + ' H' + (D1 - 30), 'phys ' + (q ? 'vss' : 'vdd')); w.style.strokeWidth = '5px'; AP.hs.push(w); });
    });
    AP.rails = G(g, { opacity: 0 });
    for (r = 0; r <= (C1 - C0) / RH; r++) el('path', { d: 'M' + C0 + ' ' + (C0 + r * RH) + ' H' + C1, class: r % 2 ? 'rail-n' : 'rail-p' }, AP.rails);

    // placement：固定種子產生每一排的 cell，避開 SRAM 的 halo
    var rnd = mulberry32(hash('iclab-apr')), S = 0, cells = [], nFF = 0;
    AP.rowG = [];
    for (r = 0; r < (C1 - C0) / RH; r++) {
      var y = C0 + r * RH, rg = G(AP.cellLayer, { opacity: 0 }), x = C0 + 2, nextTap = C0 + 4;
      while (x < C1 - 6) {
        var inMac = y + RH > mac.y - 8 && y < mac.y + mac.h + 8 && x + 20 > mac.x - 8 && x < mac.x + mac.w + 8;
        if (inMac) { x = mac.x + mac.w + 10; continue; }
        if (x >= nextTap) { el('rect', { x: x, y: y + 3, width: 3, height: RH - 6, class: 'cell-tap' }, rg); x += 5; nextTap += 130; continue; }
        if (rnd() < 0.16) { x += 4 + Math.floor(rnd() * 10); continue; }
        var ff = rnd() < 0.11, w = ff ? 22 : [6, 8, 10, 12, 14, 18][Math.floor(rnd() * 6)];
        if (x + w > C1 - 2) break;
        el('rect', { x: x, y: y + 2, width: w - 1.5, height: RH - 4, class: ff ? 'cell-ff' : 'cell' }, rg);
        cells.push({ x: x + w / 2, y: y + RH / 2, ff: ff });
        if (ff) nFF++;
        S += w * RH; x += w;
      }
      AP.rowG.push(rg);
    }
    AP.cells = cells.length; AP.nFF = nFF;
    AP.util = S / ((C1 - C0) * (C1 - C0));

    // CTS：clk pin → 中心，再一層一層的 H-tree，16 個 leaf
    var cx = 380, cy = 380, lv = [];
    lv.push(['M' + (D0 + 14) + ' 380 H' + cx]);
    lv.push(['M' + (cx - 140) + ' ' + cy + ' H' + (cx + 140)]);
    var ends = [[cx - 140, cy], [cx + 140, cy]], buf = [[cx, cy]];
    [[0, 140], [70, 0], [0, 70]].forEach(function (dv) {
      var dd = '', nx = [];
      ends.forEach(function (e) {
        buf.push(e);
        dd += 'M' + (e[0] - dv[0]) + ' ' + (e[1] - dv[1]) + ' L' + (e[0] + dv[0]) + ' ' + (e[1] + dv[1]) + ' ';
        nx.push([e[0] - dv[0], e[1] - dv[1]], [e[0] + dv[0], e[1] + dv[1]]);
      });
      lv.push([dd]); ends = nx;
    });
    AP.ck = lv.map(function (l) { return wire(g, l[0], 'ck'); });
    AP.bufs = G(g, { opacity: 0 });
    buf.forEach(function (b) { el('path', { d: 'M' + (b[0] - 7) + ' ' + (b[1] - 7) + ' L' + (b[0] + 7) + ' ' + b[1] + ' L' + (b[0] - 7) + ' ' + (b[1] + 7) + ' Z', class: 'buf' }, AP.bufs); });
    AP.leaves = G(g, { opacity: 0 });
    ends.forEach(function (e) { el('circle', { cx: e[0], cy: e[1], r: 5, class: 'leaf' }, AP.leaves); });
    AP.nBuf = buf.length; AP.nLeaf = ends.length;

    // routing：隨機挑兩個靠近的 cell，先水平（奇數層）再垂直（偶數層），轉角打 via
    var rr = mulberry32(hash('iclab-route')), NB = 10;
    AP.nets = [];
    for (var b = 0; b < NB; b++) AP.nets.push(G(g, { opacity: 0 }));
    var nNet = 0;
    for (var n = 0; n < 900 && nNet < 170; n++) {
      var c1 = cells[Math.floor(rr() * cells.length)], c2 = cells[Math.floor(rr() * cells.length)];
      if (Math.abs(c1.x - c2.x) + Math.abs(c1.y - c2.y) > 220 || c1 === c2) continue;
      var grp = AP.nets[nNet % NB], yy = c1.y + (rr() < 0.5 ? -4 : 4), xx = c2.x + (rr() < 0.5 ? -2 : 2);
      el('path', { d: 'M' + r1(c1.x) + ' ' + yy + ' H' + r1(xx), class: 'm-h' }, grp);
      el('path', { d: 'M' + r1(xx) + ' ' + yy + ' V' + c2.y, class: 'm-v' }, grp);
      el('rect', { x: r1(xx - 2), y: yy - 2, width: 4, height: 4, class: 'via' }, grp);
      nNet++;
    }
    AP.nNet = nNet;

    // 右邊：APR 的七步和這一步的重點
    var info = G(g);
    AP.steps = ['Design setup', 'Floorplan', 'Power plan', 'Placement', 'CTS', 'Routing', 'Sign-off'].map(function (s, i) {
      return T(info, 790, 50 + i * 30, (i + 1) + '  ' + s, 'slab');
    });
    var DET = {
      floorplan: ['Utilization = S / (X·Y)', 'Aspect ratio = Y / X', 'Margin Z 放得下 power ring', 'Z = 2 + 6×4 + 5×1.5 + 2', '  = 35.5 µm（lab 的設定）', 'SRAM macro 先放，四周留 halo'],
      power: ['Ring   大水管：繞著 core', 'Stripe 中水管：橫跨 core', 'Rail   小水管：每一排 cell，M1', 'I = P / V = 100 mW / 1 V = 100 mA', '10 mA/µm → VDD、VSS 各 ≥ 10 µm', 'Stripe 密度：中功耗 5–10%'],
      place: ['Global：大致擺好、估 congestion', 'Detailed：對齊 row、消除重疊', 'Timing-driven ↔ congestion-driven', 'Tie cell：常數 0 / 1 不直接接電源', 'Tap cell：固定 well 電位', '（紅色細條）'],
      cts: ['Clock 從 ideal network 變成樹', 'Skew：各 FF 收到 clock 的時間差', 'Insertion delay：source → clock pin', 'Hold：t_launch + t_clk→q + t_data', '      ≥ t_capture + t_hold', '加了 cell 要再 connect global nets'],
      route: ['NanoRoute：金屬線與 via', '奇數層（M1, M3, …）水平', '偶數層（M2, M4, …）垂直', '處理 crosstalk、antenna effect', 'RC extraction → SPEF', 'Timing 只會越來越差']
    };
    AP.det = {};
    Object.keys(DET).forEach(function (k) {
      var dg = G(info, { opacity: 0 });
      DET[k].forEach(function (s, i) { T(dg, 790, 290 + i * 30, s, i === 0 ? 't-b' : 't-s'); });
      AP.det[k] = dg;
    });
    AP.checks = ['DRC：符合製程規則', 'LVS：layout = netlist', 'LEC：APR 後 = RTL', 'STA：用 SPEF', 'Post-layout sim：帶 SDF', 'Power analysis：用 post-sim 波形'].map(function (s, i) {
      var cg = G(info, { opacity: 0 });
      T(cg, 790, 290 + i * 30, '✓', 't-h'); T(cg, 812, 290 + i * 30, s, 't-s');
      return cg;
    });
    AP.gds = T(info, 790, 490, 'GDSII → 下線', 't-big'); show(AP.gds, 0);
    AP.cards = [Card(g, 'apr', 790, 600, 380, 38), Card(g, 'fp', 790, 646, 380, 38), Card(g, 'pp', 790, 692, 380, 38)];
  })();

  // ================= 13 拉遠：每份作業接到它練的那一站，期末專題橫跨整條 =================
  var PJ = {};
  (function () {
    var g = G(world);
    var CARDS = [[600, 'hw5', 'HW5 · W9', 'Attention 加速器', '乘加 datapath 給各階段共用'], [2000, 'hw4', 'HW4 · W8', 'QR code 解碼器', '主 FSM + 兩個子 FSM'],
      [3400, 'lab05', 'LAB05', '三級管線 CPU', 'SRAM、BEQ FSM、SpyGlass'], [4800, 'hw1', 'HW1 · W3', 'ROP3 窮舉驗證', '迴圈計數器要多 1 bit'],
      [6200, 'hw3', 'HW2–3', 'Enigma 合成優化', 'PI 8.8 → 4.8 ×10⁴'], [7600, 'lec', 'LAB09–10', 'LEC 實務', 'MDP + hierarchical：538 s'],
      [9000, 'apr', 'LAB11–13', 'Innovus APR', 'floorplan 一路到 sign-off']];
    PJ.cards = CARDS.map(function (c) {
      var n = NOTE[c[1]], a = el('a', { href: n.href, class: 'note', opacity: 0 }, g), x = c[0] - 650, y = -2140;
      el('title', {}, a, n.title);
      el('rect', { x: x, y: y, width: 1300, height: 560, rx: 24, class: 'note-box' }, a);
      T(a, x + 60, y + 120, c[2] + ' ↗', 't-xk');
      T(a, x + 60, y + 310, c[3], 't-xt');
      T(a, x + 60, y + 470, c[4], 't-xs');
      var lead = wire(g, 'M' + c[0] + ' ' + (y + 560) + ' V-570', 'lead-d');
      return { a: a, lead: lead };
    });
    var p = NOTE.proj, a = el('a', { href: p.href, class: 'note', opacity: 0 }, g);
    PJ.proj = a;
    el('title', {}, a, p.title);
    el('rect', { x: 0, y: 1000, width: 7300, height: 640, rx: 28, class: 'note-box' }, a);
    T(a, 80, 1130, 'FINAL PROJECT · W14–17 ↗', 't-xk');
    T(a, 80, 1340, '3D Gaussian Splatting 硬體加速器', 't-xt');
    T(a, 80, 1530, '367.8 FPS · 2.63 mW · 240,128 µm² · 5.0 ns · 全班第一（25 組）', 't-xs');
    PJ.golden = el('a', { href: NOTE.golden.href, class: 'note', opacity: 0 }, g);
    el('title', {}, PJ.golden, NOTE.golden.title);
    el('rect', { x: 7500, y: 1000, width: 2400, height: 640, rx: 28, class: 'note-box' }, PJ.golden);
    T(PJ.golden, 7580, 1130, 'NOTE ↗', 't-xk');
    T(PJ.golden, 7580, 1340, 'Golden pattern', 't-xt');
    T(PJ.golden, 7580, 1530, '每一級都能對答案', 't-xs');
    PJ.span = wire(g, 'M0 960 V900 H' + END_X + ' V960', 'brace');
  })();

  // ================= 段落與鏡頭 =================
  var BEATS = [['intro', 1.0], ['rtl', 2.0], ['fsm', 1.6], ['lint', 1.3], ['sim', 1.8], ['synth', 2.2], ['lec', 1.6],
    ['floorplan', 1.4], ['power', 1.4], ['place', 1.3], ['cts', 1.1], ['route', 1.2], ['signoff', 1.0], ['projects', 1.6]];
  var HOLD = 0.35, STOPS = BEATS.slice(1).map(function (b) { return b[0]; });
  var total = BEATS.reduce(function (s, b) { return s + b[1]; }, HOLD), spans = {}, acc = 0;
  BEATS.forEach(function (b) { spans[b[0]] = { start: acc / total, len: b[1] / total }; acc += b[1]; });
  function localT(k, p) { return clamp01((p - spans[k].start) / spans[k].len); }
  function beatAt(p) { var cur = BEATS[0][0]; BEATS.forEach(function (b) { if (p >= spans[b[0]].start) cur = b[0]; }); return cur; }

  // 每格 [beat, t, 中心 x, 中心 y, 寬]：同一個位置放兩格 = 鏡頭停住
  var NEAR = 1340, APX = OX.apr + 600;
  function at(k) { return OX[k] + 600; }
  var SHOTS = [
    ['intro', 0, 4950, -300, 15500], ['intro', 0.5, 4950, -300, 11400],
    ['rtl', 0.2, at('rtl'), 345, NEAR], ['rtl', 1, at('rtl'), 345, NEAR],
    ['fsm', 0.15, at('fsm'), 345, NEAR], ['fsm', 1, at('fsm'), 345, NEAR],
    ['lint', 0.15, at('lint'), 330, NEAR], ['lint', 1, at('lint'), 330, NEAR],
    ['sim', 0.15, at('sim'), 350, NEAR], ['sim', 1, at('sim'), 350, NEAR],
    ['synth', 0.15, at('synth'), 375, NEAR], ['synth', 1, at('synth'), 375, NEAR],
    ['lec', 0.15, at('lec'), 345, NEAR], ['lec', 1, at('lec'), 345, NEAR],
    ['floorplan', 0.2, APX, 360, NEAR], ['floorplan', 1, APX, 360, NEAR],
    ['power', 0.3, OX.apr + 130, 130, 520], ['power', 0.72, OX.apr + 130, 130, 520], ['power', 1, APX, 360, NEAR],
    ['place', 0.35, OX.apr + 470, 430, 780], ['place', 0.8, OX.apr + 470, 430, 780], ['place', 1, APX, 360, NEAR],
    ['cts', 1, APX, 360, NEAR],
    ['route', 0.3, OX.apr + 420, 420, 500], ['route', 0.75, OX.apr + 420, 420, 500], ['route', 1, APX, 360, NEAR],
    ['signoff', 1, APX, 360, NEAR],
    ['projects', 0.35, 4950, -250, 11000], ['projects', 1, 4950, -250, 11000]
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
    var w = view.narrow ? c.w * 0.94 : c.w;
    var s = Math.min(view.fw / w, view.fh / (w * 0.62));
    var vx = c.x - (view.fx + view.fw / 2) / s, vy = c.y - (view.fy + view.fh / 2) / s;
    set(svg, 'viewBox', [r1(vx), r1(vy), r1(view.W / s), r1(view.H / s)].join(' '));
    // 拉遠看大字，推近看小字
    show(W.far, lod(c.w, 2600, 6500));
    show(W.near, 1 - lod(c.w, 1700, 3200));
    show(W.tok, 1 - lod(c.w, 2600, 6500)); show(W.tokHalo, 1 - lod(c.w, 2600, 6500));
  }

  // ---- 流程線：token 從上一站滑到這一站，走過的線變成 accent ----
  var ORDER = BEATS.map(function (b) { return b[0]; });
  function renderFlow(beat, p) {
    var i = ORDER.indexOf(beat), t = localT(beat, p);
    var from = i > 0 ? STX[ORDER[i - 1]] : -1100, x = lerp(from, STX[beat], ease(seg(t, 0, 0.3)));
    if (beat === 'intro') x = lerp(-1100, 0, ease(seg(t, 0.5, 1)));
    set(W.tok, 'cx', r1(x)); set(W.tokHalo, 'cx', r1(x)); set(W.tokFar, 'cx', r1(x));
    set(W.flowH, 'd', 'M0 ' + LINE_Y + ' H' + r1(Math.max(0, Math.min(END_X, x))));
    W.dots.forEach(function (d) {
      var j = ORDER.indexOf(d.beat), st = j < i || beat === 'projects' ? 'is-past' : j === i ? 'is-hot' : '';
      cls(d.c, 'dot ' + st); cls(d.t, 'slab mid ' + st);
    });
    W.farDots.forEach(function (d) {
      var j = ORDER.indexOf(d.beat);
      cls(d.c, 'dot ' + (j < i || beat === 'projects' ? 'is-past' : j === i ? 'is-hot' : ''));
    });
  }

  // ================= 每一段的 renderer：只吃自己的 t =================
  var live = {};
  var R = {
    intro: function () {},
    rtl: function (t) {
      typeLines(RTL.L, seg(t, 0.04, 0.4));
      RTL.marks.forEach(function (m, i) {
        var a = 0.42 + i * 0.075, k = ease(seg(t, a, a + 0.06));
        m.bands.forEach(function (b) { show(b, k * (1 - 0.6 * seg(t, a + 0.075, a + 0.12))); });
        if (m.lead) { draw(m.lead, k); show(m.lead, k * (1 - seg(t, a + 0.075, a + 0.12))); } // 引線只在講到它時出現
        show(m.card, k);
      });
      var kA = ease(seg(t, 0.5, 0.58)), kM = ease(seg(t, 0.6, 0.68)), kF = ease(seg(t, 0.62, 0.7)), kC = ease(seg(t, 0.68, 0.76)), kB = ease(seg(t, 0.78, 0.9));
      show(RTL.add, kA); draw(RTL.wDin, kA); draw(RTL.wNxt, seg(t, 0.55, 0.6));
      show(RTL.mux, kM); draw(RTL.wSel, kM); draw(RTL.wMux, kF);
      show(RTL.ff, kF); draw(RTL.wQ, kF); show(RTL.qLab, kF);
      show(RTL.clk, kC); draw(RTL.wClk, kC);
      draw(RTL.wFb, kB); draw(RTL.wFb2, seg(t, 0.86, 0.92)); show(RTL.fbLab, seg(t, 0.86, 0.94));
      var typed = RTL.L.filter(function (l) { return l.e._t === l.s; }).length;
      live.rtl = [['acc.v', typed + ' / 11 行'], ['參數', 'W = 8'], ['組合邏輯', kA > 0.5 ? '1 個加法器 + MUX' : '—'],
        ['循序邏輯', kF > 0.5 ? '8 個 flip-flop' : '—', 'hl'], ['Reset', '非同步 · active low']];
    },
    fsm: function (t) {
      show(FSM.bg, ease(seg(t, 0.02, 0.16)));
      ['rst>IDLE', 'IDLE>LOAD', 'LOAD>DONE', 'DONE>LOAD'].forEach(function (k, i) {
        var kk = ease(seg(t, 0.12 + i * 0.05, 0.2 + i * 0.05));
        draw(FSM.tr[k][0], kk); show(FSM.tr[k][1], kk);
      });
      show(FSM.blocks, ease(seg(t, 0.3, 0.42)));
      FSM.bw.forEach(function (w, i) { draw(w, ease(seg(t, 0.36 + i * 0.02, 0.44 + i * 0.02))); });
      show(FSM.bl, seg(t, 0.42, 0.48));
      show(FSM.tab, ease(seg(t, 0.46, 0.52)));
      var run = seg(t, 0.5, 0.74), cur = Math.min(7, Math.floor(run * 8)), on = run > 0;
      show(FSM.col, on ? 1 : 0); set(FSM.col, 'x', 706 + cur * 64 - 31);
      var st = FSM.S[cur], prev = cur > 0 ? FSM.S[cur - 1] : null;
      Object.keys(FSM.bub).forEach(function (k) { cls(FSM.bub[k], 'bubble' + (on && k === st ? ' is-hot' : '')); });
      Object.keys(FSM.tr).forEach(function (k) { cls(FSM.tr[k][0], on && prev && prev !== st && k === prev + '>' + st ? 'wire-h' : 'wire'); });
      show(FSM.hw, ease(seg(t, 0.76, 0.88)));
      FSM.cards.forEach(function (c, i) { show(c, ease(seg(t, 0.84 + i * 0.03, 0.92 + i * 0.03))); });
      live.fsm = [['Cycle', on ? cur + ' / 7' : '—'], ['load', on ? String(FSM.LOADS[cur]) : '—'], ['state', on ? st : '—', 'hl'],
        ['busy（Moore）', on ? (st === 'LOAD' ? '1' : '0') : '—'], ['狀態編碼', 'localparam · 2 bit'], ['One-hot', 'N 個狀態 N 個 FF']];
    },
    lint: function (t) {
      LN.chips.forEach(function (c, i) { show(c, ease(seg(t, 0.04 + i * 0.04, 0.12 + i * 0.04))); });
      var sc = seg(t, 0.22, 0.42);
      show(LN.scan, sc > 0 && sc < 1 ? 1 : 0); set(LN.scan, 'y', r1(60 + sc * 150));
      var w = ease(seg(t, 0.36, 0.44)), fx = ease(seg(t, 0.54, 0.64));
      show(LN.bad, w * (1 - fx)); show(LN.warn, w * (1 - fx)); draw(LN.lead, w); show(LN.lead, w * (1 - fx));
      set(LN.shift, 'transform', 'translate(0 ' + r1(30 * fx) + ')');
      show(LN.fix, fx); show(LN.fixBand, fx * (1 - seg(t, 0.68, 0.76)));
      show(LN.ok, fx);
      var done = 0;
      LN.goals.forEach(function (q, i) {
        var k = seg(t, 0.68 + i * 0.06, 0.73 + i * 0.06);
        set(q.bar, 'width', r1(260 * k)); show(q.ok, k >= 1 ? 1 : 0);
        if (k >= 1) done++;
      });
      show(LN.rpt, seg(t, 0.92, 0.96));
      LN.cards.forEach(function (c, i) { show(c, ease(seg(t, 0.12 + i * 0.03, 0.2 + i * 0.03))); });
      live.lint = [['Latch', fx > 0.5 ? '0' : w > 0.5 ? '1 · y' : '—', fx > 0.5 ? 'hl' : 'ng'], ['Lint goals', done + ' / 4'], ['需要 testbench', '不用'], ['工具', 'SpyGlass · sg_shell']];
    },
    sim: function (t) {
      SIM.boxes.forEach(function (b, i) { show(b, ease(seg(t, 0.02 + i * 0.05, 0.1 + i * 0.05))); });
      show(SIM.gold, ease(seg(t, 0.14, 0.2)));
      SIM.w.forEach(function (w, i) { draw(w, ease(seg(t, 0.08 + i * 0.03, 0.16 + i * 0.03))); });
      show(SIM.wl, seg(t, 0.14, 0.2)); show(SIM.clkTx, seg(t, 0.18, 0.24)); show(SIM.labels, seg(t, 0.2, 0.26));
      var run = seg(t, 0.25, 0.85), cx = SIM.X0 + run * SIM.P * SIM.NC;
      set(SIM.clip, 'width', r1(run * SIM.P * SIM.NC + 4));
      show(SIM.cursor, run > 0 && run < 1 ? 1 : 0); set(SIM.cursor, 'x1', r1(cx)); set(SIM.cursor, 'x2', r1(cx));
      var nOk = 0;
      SIM.checks.forEach(function (c) { if (c.x <= cx) nOk++; });
      show(SIM.neg, cx > SIM.X0 + 4.5 * SIM.P ? 1 : 0); show(SIM.pos, cx > SIM.X0 + 5 * SIM.P ? 1 : 0);
      var cyc = Math.min(SIM.NC, Math.floor(run * SIM.NC));
      text(SIM.count, run > 0 ? 'cycle ' + cyc + ' · ' + nOk + ' 次比對 · 0 mismatch' : '');
      show(SIM.done, seg(t, 0.86, 0.9));
      SIM.cards.forEach(function (c, i) { show(c, ease(seg(t, 0.88 + i * 0.03, 0.95 + i * 0.03))); });
      live.sim = [['Cycle', cyc + ' / ' + SIM.NC], ['sum', run > 0 ? '8\'h' + hex2(SIM.SUM[Math.max(0, Math.min(SIM.NC - 1, cyc - 1))]) : '—', 'hl'],
        ['比對', nOk + ' / ' + SIM.checks.length], ['Mismatch', '0'], ['改輸入 / 取樣', 'negedge / posedge']];
    },
    synth: function (t) {
      SY.files.forEach(function (f, i) { show(f, ease(seg(t, 0.02 + i * 0.04, 0.1 + i * 0.04))); });
      SY.fw.forEach(function (w, i) { draw(w, ease(seg(t, 0.1 + i * 0.03, 0.18 + i * 0.03))); });
      show(SY.dc, ease(seg(t, 0.14, 0.22)));
      set(SY.prog, 'width', r1(168 * seg(t, 0.2, 0.32)));
      draw(SY.wOut, ease(seg(t, 0.3, 0.34)));
      var nCell = 0;
      SY.rows.forEach(function (rg, i) { var k = ease(seg(t, 0.32 + i * 0.022, 0.38 + i * 0.022)); show(rg, k); if (k > 0.5) nCell += 3; });
      show(SY.ck, ease(seg(t, 0.44, 0.5)));
      var cg = ease(seg(t, 0.53, 0.66));
      SY.mux.forEach(function (m) { show(m, 1 - 0.85 * cg); });
      SY.byp.forEach(function (w) { draw(w, cg); });
      show(SY.icg, cg); draw(SY.gck, cg);
      show(SY.nums, ease(seg(t, 0.5, 0.56)));
      SY.nv.forEach(function (n) { var v = lerp(n.a, n.b, cg); text(n.t, n.d ? v.toFixed(n.d) : comma(v)); });
      show(SY.pt, seg(t, 0.68, 0.72));
      var curPI = '—';
      SY.pi.forEach(function (b, i) {
        var k = ease(seg(t, 0.7 + i * 0.04, 0.76 + i * 0.04));
        show(b.g, k > 0 ? 1 : 0); set(b.bar, 'width', r1(b.w * k)); set(b.v, 'x', r1(340 + b.w * k));
        if (k > 0.5) curPI = b.v.textContent;
      });
      SY.cards.forEach(function (c, i) { show(c, ease(seg(t, 0.4 + i * 0.03, 0.48 + i * 0.03))); });
      live.synth = [['Cell', nCell ? nCell + (cg > 0.5 ? ' − 8 MUX + 1 ICG' : '（FA·MUX·DFF）') : '—'], ['Lab06 面積', SY.nv[0].t.textContent || '—', cg > 0.5 ? 'hl' : ''],
        ['Lab06 dynamic', SY.nv[1].t.textContent || '—', cg > 0.5 ? 'hl' : ''], ['HW3 PI（×10⁴）', curPI, curPI === '4.8' ? 'hl' : '']];
    },
    lec: function (t) {
      show(LEC.hd, ease(seg(t, 0.02, 0.12)));
      var mapped = 0, eq = 0;
      LEC.rows.forEach(function (r, i) {
        show(r.g, ease(seg(t, 0.06 + i * 0.015, 0.12 + i * 0.015)));
        var km = seg(t, 0.2 + i * 0.02, 0.26 + i * 0.02), ke = seg(t, 0.42 + i * 0.025, 0.46 + i * 0.025);
        show(r.m, km > 0 ? 1 : 0); cls(r.m, ke >= 1 ? 'map is-ok' : 'map'); show(r.ok, ke);
        if (km >= 1) mapped += r.n;
        if (ke >= 1) eq += r.n;
      });
      show(LEC.lab, seg(t, 0.14, 0.2));
      text(LEC.count, t > 0.2 ? 'compared ' + eq + ' / 16' + (eq === 16 ? ' · EQUIVALENT ✓' : '') : '');
      show(LEC.ct, seg(t, 0.7, 0.74));
      LEC.bars.forEach(function (b, i) {
        var k = ease(seg(t, 0.72 + i * 0.05, 0.8 + i * 0.05));
        show(b.g, k > 0 ? 1 : 0); set(b.bar, 'width', r1(b.w * k)); set(b.v, 'x', r1(258 + b.w * k)); show(b.v, k);
      });
      LEC.cards.forEach(function (c, i) { show(c, ease(seg(t, 0.84 + i * 0.04, 0.92 + i * 0.04))); });
      live.lec = [['Key point', 'PI 11 · DFF 8 · PO 8'], ['對應好的', mapped + ' / 16'], ['Equivalent', eq + ' / 16', eq === 16 ? 'hl' : ''],
        ['Lab09 my_div', '32 點 · 445 s'], ['Lab10 MDP + hier', '538 s', 'hl']];
    },
    floorplan: function (t) {
      show(AP.die, ease(seg(t, 0.02, 0.14)));
      show(AP.fp, ease(seg(t, 0.12, 0.3)));
      show(AP.det.floorplan, ease(seg(t, 0.34, 0.44)));
      AP.cards.forEach(function (c, i) { show(c, ease(seg(t, 0.5 + i * 0.05, 0.58 + i * 0.05))); });
      live.floorplan = [['Die / core', '720 / 560（示意）'], ['Utilization', t > 0.34 ? Math.round(AP.util * 100) + '%' : '—', 'hl'], ['Aspect ratio', '1.00'], ['Margin Z（lab）', '35.5 µm'], ['Macro', 'SRAM ×1']];
    },
    power: function (t) {
      AP.rings.forEach(function (w, i) { draw(w, ease(seg(t, 0.06 + i * 0.04, 0.2 + i * 0.04))); });
      AP.vs.forEach(function (w, i) { draw(w, ease(seg(t, 0.42 + i * 0.015, 0.56 + i * 0.015))); });
      AP.hs.forEach(function (w, i) { draw(w, ease(seg(t, 0.6 + i * 0.02, 0.72 + i * 0.02))); });
      show(AP.rails, ease(seg(t, 0.76, 0.88)));
      var nR = AP.rings.filter(function (w) { return +w._x_opacity > 0; }).length;
      live.power = [['Ring', Math.ceil(nR / 2) + ' / 3 組 VDD · VSS'], ['Stripe', t > 0.6 ? '垂直 8 · 水平 ' + (t > 0.72 ? 4 : 0) : t > 0.42 ? '垂直 8' : '—'],
        ['Rail', t > 0.8 ? (AP.rowG.length + 1) + ' 條 · M1' : '—', 'hl'], ['電流（例）', '100 mA'], ['Ring 寬（例）', '≥ 10 µm']];
    },
    place: function (t) {
      var placed = 0;
      AP.rowG.forEach(function (rg, i) {
        var k = ease(seg(t, 0.06 + i * 0.022, 0.12 + i * 0.022));
        show(rg, k); set(rg, 'transform', 'translate(0 ' + r1(-14 * (1 - k)) + ')');
        if (k > 0.5) placed++;
      });
      var frac = placed / AP.rowG.length;
      live.place = [['Row', placed + ' / ' + AP.rowG.length], ['Cell', comma(AP.cells * frac)], ['其中 flip-flop', comma(AP.nFF * frac), 'hl'], ['Utilization', Math.round(AP.util * 100) + '%']];
    },
    cts: function (t) {
      AP.ck.forEach(function (w, i) { draw(w, ease(seg(t, 0.06 + i * 0.14, 0.2 + i * 0.14))); });
      show(AP.bufs, ease(seg(t, 0.5, 0.62))); show(AP.leaves, ease(seg(t, 0.72, 0.8)));
      var lvl = AP.ck.filter(function (w) { return +w._x_opacity > 0; }).length;
      live.cts = [['Tree 層數', lvl + ' / 5'], ['Buffer', t > 0.56 ? String(AP.nBuf) : '—'], ['Leaf', t > 0.76 ? String(AP.nLeaf) : '—', 'hl'], ['合成時', 'ideal network'], ['最怕', 'hold violation']];
    },
    route: function (t) {
      var n = 0;
      AP.nets.forEach(function (gr, i) { var k = seg(t, 0.06 + i * 0.07, 0.14 + i * 0.07); show(gr, k); if (k >= 1) n++; });
      live.route = [['Net', comma(AP.nNet * n / AP.nets.length) + ' / ' + AP.nNet], ['M1, M3, …', '水平'], ['M2, M4, …', '垂直'], ['之後', 'RC extraction → SPEF', 'hl']];
    },
    signoff: function (t) {
      var n = 0;
      AP.checks.forEach(function (c, i) { var k = ease(seg(t, 0.06 + i * 0.1, 0.14 + i * 0.1)); show(c, k); if (k > 0.5) n++; });
      cls(AP.die, t > 0.7 ? 'die is-done' : 'die');
      show(AP.gds, ease(seg(t, 0.72, 0.82)));
      live.signoff = [['檢查', n + ' / 6', n === 6 ? 'hl' : ''], ['Netlist ↔ layout', 'LVS'], ['RTL ↔ APR 後', 'LEC'], ['Timing', 'STA · SPEF'], ['Power', 'post-sim 波形']];
    },
    projects: function (t) {
      PJ.cards.forEach(function (c, i) { var k = ease(seg(t, 0.3 + i * 0.05, 0.4 + i * 0.05)); show(c.a, k); draw(c.lead, k); });
      draw(PJ.span, ease(seg(t, 0.68, 0.78)));
      show(PJ.proj, ease(seg(t, 0.72, 0.84))); show(PJ.golden, ease(seg(t, 0.78, 0.9)));
    }
  };
  // 跨段的東西：兩段的進度相乘，每一幀都算
  function cross(p) {
    show(W.brace, ease(seg(localT('intro', p), 0.2, 0.55)) * (1 - ease(seg(localT('projects', p), 0, 0.2))));
    show(AP.dim, ease(seg(localT('floorplan', p), 0.3, 0.42)) * (1 - ease(seg(localT('power', p), 0, 0.1))));
  }
  // APR 的說明欄：現在這一步亮，走過的變灰
  var APR_BEATS = ['floorplan', 'power', 'place', 'cts', 'route', 'signoff'];
  function renderApr(beat) {
    var i = APR_BEATS.indexOf(beat), proj = beat === 'projects';
    AP.steps.forEach(function (s, j) { cls(s, 'slab ' + (proj || j < i + 1 ? 'is-past' : j === i + 1 ? 'is-hot' : '')); });
    Object.keys(AP.det).forEach(function (k) { show(AP.det[k], k === beat ? 1 : 0); });
  }

  // ---- 說明欄 ----
  var caps = {};
  [].forEach.call(root.querySelectorAll('[data-cap]'), function (c) { caps[c.getAttribute('data-cap')] = c; });
  var statusEl = root.querySelector('[data-status]'), factsEl = root.querySelector('[data-facts]');
  var stopBtns = [].slice.call(root.querySelectorAll('[data-stop]'));
  var FACTS = {
    intro: [['課號', 'EE4292'], ['學期', '114 上 · 17 週'], ['筆記', cfg.count + ' 篇', 'hl'], ['工具', 'VCS · Verdi · SpyGlass'], ['', 'DC · Conformal · Innovus']],
    projects: [['期末專題', '3DGS 加速器', 'hl'], ['Throughput', '367.8 FPS'], ['Power', '2.63 mW'], ['Area', '240,128 µm²'], ['Cycle time', '5.0 ns'], ['成績', '全班第一 / 25 組']]
  };
  var shownCap = '', factsHTML = '';
  function renderPanel(beat, p) {
    if (beat !== shownCap) {
      if (caps[shownCap]) caps[shownCap].classList.remove('is-on');
      if (caps[beat]) caps[beat].classList.add('is-on');
      shownCap = beat;
      var i0 = STOPS.indexOf(beat);
      statusEl.textContent = i0 >= 0 ? 'Stop ' + (i0 < 9 ? '0' : '') + (i0 + 1) + ' / ' + STOPS.length : 'Overview';
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
    var beat = beatAt(p);
    cross(p);
    renderCamera(camera(p));
    renderFlow(beat, p);
    renderApr(beat);
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
    var FULL = 64000, raf = 0, p0 = 0, t0 = 0, setY = 0, shown = '';
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
