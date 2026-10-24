/* /tapeout/ 的開場：捲動頁面時，晶片依序經過 floorplan → placement → CTS → routing → tapeout。
   舞台用 position: sticky 釘在畫面上，捲過 .to-track 的距離換算成 0–1 的進度 p，每一段再換算成自己的局部進度 t，
   所以往回捲動畫也會倒著播。最後四個 macro 從封裝底部的接腳拉線（.to-bus），沿著左邊往下接到 §01–§04 的標題。 */
(function () {
  'use strict';

  var root = document.querySelector('[data-tapeout]');
  if (!root) return;
  var cfg = JSON.parse(root.querySelector('script[type="application/json"]').textContent || '{}');
  var track = root.querySelector('.to-track');
  var stage = root.querySelector('.to-stage');
  var svg = root.querySelector('[data-to-chip]');
  var bus = root.querySelector('[data-to-bus]');
  var consoleEl = root.querySelector('.to-console');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = window.innerWidth < 640;
  var NS = 'http://www.w3.org/2000/svg';

  // ---- helpers ----
  function hash(str) {
    var h = 2166136261;
    for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rnd = mulberry32(hash(cfg.seed || 'tapeout'));
  function rand(a, b) { return a + (b - a) * rnd(); }
  function pick(list) { return list[Math.floor(rnd() * list.length)]; }
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function clamp01(x) { return clamp(x, 0, 1); }
  function seg(t, a, b) { return clamp01((t - a) / (b - a)); } // t 落在 [a, b] 的局部進度
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function lerp(a, b, k) { return a + (b - a) * k; }
  function r1(n) { return Math.round(n * 10) / 10; }
  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  // 值沒變就不寫回 DOM：每一幀要更新幾百個元素
  function set(e, k, v) {
    var key = '_to_' + k;
    if (e[key] === v) return;
    e[key] = v;
    e.setAttribute(k, v);
  }
  // 用 pathLength = 1 的虛線畫線：k = 0 看不到，k = 1 整條畫完
  function draw(e, k) {
    set(e, 'stroke-dashoffset', r1((1 - k) * 1000) / 1000);
    set(e, 'opacity', k > 0 ? 1 : 0);
  }
  function line(x1, y1, x2, y2) { return 'M' + r1(x1) + ' ' + r1(y1) + 'L' + r1(x2) + ' ' + r1(y2); }

  // ---- geometry（viewBox 1000 × 1000）----
  var DIE = { x: 40, y: 40, w: 920, h: 920 };
  var CORE = { x: 130, y: 130, w: 740, h: 740 };
  var ROW = 24, NROWS = 30;
  var PAD_IN = 54; // pad 從 die 邊往內佔的深度（10 間隙 + 44 pad）
  // 四個 macro 就是網站的四個區塊。接腳由左到右是 §04 §03 §02 §01（這樣往下接到左邊匯流排的線才不會交叉），
  // 所以左下、右下的 macro 直接往下接，上面兩個走中間的通道
  var MACROS = [
    { key: 'netlist', sec: '03', name: 'NETLIST', x: 150, y: 150, w: 270, h: 200, route: [[420, 300], [470, 300], [470, 906]] },
    { key: 'writing', sec: '02', name: 'WRITING', x: 580, y: 150, w: 270, h: 180, route: [[580, 290], [530, 290], [530, 906]] },
    { key: 'about', sec: '04', name: 'ABOUT', x: 150, y: 660, w: 250, h: 190, route: [[275, 850], [275, 906]] },
    { key: 'projects', sec: '01', name: 'PROJECTS', x: 580, y: 620, w: 270, h: 230, route: [[715, 850], [715, 906]] }
  ];
  var BUS_ORDER = ['about', 'netlist', 'writing', 'projects']; // 封裝底部亮起來的四根接腳，由左到右

  function hitsMacro(x0, y0, x1, y1, halo) {
    return MACROS.some(function (m) {
      return x0 < m.x + m.w + halo && x1 > m.x - halo && y0 < m.y + m.h + halo && y1 > m.y - halo;
    });
  }
  // 一個 row 扣掉 macro（含 halo）之後剩下的區段
  function freeSpans(y0, y1, halo) {
    var spans = [[CORE.x, CORE.x + CORE.w]];
    MACROS.forEach(function (m) {
      if (!(y0 < m.y + m.h + halo && y1 > m.y - halo)) return;
      var a = m.x - halo, b = m.x + m.w + halo;
      spans = spans.reduce(function (out, s) {
        if (b <= s[0] || a >= s[1]) out.push(s);
        else {
          if (a > s[0]) out.push([s[0], a]);
          if (b < s[1]) out.push([b, s[1]]);
        }
        return out;
      }, []);
    });
    return spans;
  }

  // ---- stages ----
  var WEIGHTS = { floorplan: 1, placement: 1.4, cts: 0.8, routing: 1.4, tapeout: 1.3 };
  var HOLD = 0.3; // 演完之後停留一下才放開舞台
  var keys = (cfg.stages || ['floorplan', 'placement', 'cts', 'routing', 'tapeout']).filter(function (k) { return WEIGHTS[k]; });
  var total = keys.reduce(function (s, k) { return s + WEIGHTS[k]; }, HOLD);
  var spans = {};
  keys.reduce(function (at, k) {
    spans[k] = { start: at / total, len: WEIGHTS[k] / total };
    return at + WEIGHTS[k];
  }, 0);
  function localT(k, p) { return spans[k] ? clamp01((p - spans[k].start) / spans[k].len) : (p > 0 ? 1 : 0); }

  // ---- build the chip ----
  var defs = el('defs', {}, svg);
  var pat = el('pattern', { id: 'to-sram', width: 12, height: 12, patternUnits: 'userSpaceOnUse' }, defs);
  el('path', { d: 'M0 6H12M6 0V12', class: 'to-sram-grid' }, pat);
  var grad = el('linearGradient', { id: 'to-scan', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, class: 'to-scan-0' }, grad);
  el('stop', { offset: 1, class: 'to-scan-1' }, grad);

  // 封裝在 die 底下，最後才淡入
  var S = 0.46, FY = 330; // tapeout 後 die 的縮放比例與中心
  var half = DIE.w * S / 2;
  var BODY = { x: 500 - half - 34, y: FY - half - 34, w: (half + 34) * 2, h: (half + 34) * 2 };
  var pkg = el('g', { class: 'to-pkg', opacity: 0 }, svg);
  el('rect', { x: r1(BODY.x), y: r1(BODY.y), width: r1(BODY.w), height: r1(BODY.h), rx: 10, class: 'to-pkg-body' }, pkg);
  var LEADS = 12, pitch = BODY.w / (LEADS + 1), LW = 16, LL = 30;
  var leads = [];
  ['top', 'bottom', 'left', 'right'].forEach(function (side) {
    for (var i = 0; i < LEADS; i++) {
      var c = (side === 'top' || side === 'bottom' ? BODY.x : BODY.y) + pitch * (i + 1);
      var r = side === 'top' ? { x: c - LW / 2, y: BODY.y - LL, w: LW, h: LL }
        : side === 'bottom' ? { x: c - LW / 2, y: BODY.y + BODY.h, w: LW, h: LL }
        : side === 'left' ? { x: BODY.x - LL, y: c - LW / 2, w: LL, h: LW }
        : { x: BODY.x + BODY.w, y: c - LW / 2, w: LL, h: LW };
      leads.push({ side: side, c: c, e: el('rect', { x: r1(r.x), y: r1(r.y), width: r.w, height: r.h, class: 'to-lead' }, pkg) });
    }
  });
  var pkgLabel = el('text', { x: 500, y: r1(BODY.y - LL - 16), class: 'to-pkg-label', 'text-anchor': 'middle', opacity: 0 }, svg);
  pkgLabel.textContent = 'HW-26 · QFN48 · TAPED OUT';

  var die = el('g', { class: 'to-die' }, svg);
  var dieBg = el('rect', { x: DIE.x, y: DIE.y, width: DIE.w, height: DIE.h, class: 'to-die-bg', opacity: 0 }, die);
  var ghost = el('rect', { x: DIE.x, y: DIE.y, width: DIE.w, height: DIE.h, class: 'to-die-ghost' }, die);
  var dieEdge = el('path', { d: 'M' + DIE.x + ' ' + DIE.y + 'h' + DIE.w + 'v' + DIE.h + 'h-' + DIE.w + 'Z', class: 'to-die-edge to-draw', pathLength: 1 }, die);

  // IO pads：每邊 12 個；底邊留出四個接到 macro 的 pad
  var gPads = el('g', { class: 'to-pads' }, die);
  var pads = [];
  var accentX = MACROS.map(function (m) { return m.route[m.route.length - 1][0]; });
  ['top', 'right', 'bottom', 'left'].forEach(function (side) {
    for (var i = 0; i < 12; i++) {
      var c = 100 + 800 * (i + 0.5) / 12;
      if (side === 'bottom' && accentX.some(function (x) { return Math.abs(x - c) < 32; })) continue;
      var r = side === 'top' ? [c - 14, DIE.y + 10, 28, 44]
        : side === 'bottom' ? [c - 14, DIE.y + DIE.h - PAD_IN, 28, 44]
        : side === 'left' ? [DIE.x + 10, c - 14, 44, 28]
        : [DIE.x + DIE.w - PAD_IN, c - 14, 44, 28];
      pads.push(el('rect', { x: r1(r[0]), y: r1(r[1]), width: r[2], height: r[3], class: 'to-pad', opacity: 0 }, gPads));
    }
  });
  pads.forEach(function (e, i) { e._at = 0.15 + 0.3 * i / pads.length; });
  var accentPads = accentX.map(function (x) {
    return el('rect', { x: x - 14, y: DIE.y + DIE.h - PAD_IN, width: 28, height: 44, class: 'to-pad to-pad-accent', opacity: 0 }, gPads);
  });

  // rows
  var rowsD = '';
  for (var ri = 0; ri <= NROWS; ri++) rowsD += 'M' + CORE.x + ' ' + (CORE.y + ri * ROW) + 'h' + CORE.w;
  var rows = el('path', { d: rowsD, class: 'to-rows', opacity: 0 }, die);

  // power ring + stripes（上層金屬，畫得很淡）
  var gPower = el('g', { class: 'to-power' }, die);
  var ring = [106, 118].map(function (o) {
    var w = 1000 - o * 2;
    return el('path', { d: 'M' + o + ' ' + o + 'h' + w + 'v' + w + 'h-' + w + 'Z', class: 'to-ring to-draw', pathLength: 1 }, gPower);
  });
  var stripes = [];
  for (var sx = 190; sx < 870; sx += 125) {
    [sx, sx + 9].forEach(function (x) {
      stripes.push(el('path', { d: line(x, 106, x, 894), class: 'to-stripe to-draw', pathLength: 1 }, gPower));
    });
  }

  // standard cells：先排出合法的位置，再算 global placement 時的散開位置
  var WIDTHS = [8, 10, 12, 12, 16, 16, 20, 24, 32];
  var cells = [];
  var freeArea = 0;
  for (var r = 0; r < NROWS; r++) {
    var y = CORE.y + r * ROW;
    freeSpans(y, y + ROW, 10).forEach(function (s) {
      freeArea += (s[1] - s[0]) * ROW;
      var x = s[0] + rand(0, 6);
      for (;;) {
        var w = pick(WIDTHS);
        if (x + w > s[1]) break;
        if (rnd() < 0.72) cells.push({ x: x, y: y + 3, w: w, h: ROW - 6 });
        x += w + 2;
      }
    });
  }
  var target = small ? 200 : 420;
  while (cells.length > target) cells.splice(Math.floor(rnd() * cells.length), 1);
  var CX = 500, CY = 490;
  var cellArea = 0;
  var gCells = el('g', { class: 'to-cells' }, die);
  cells.forEach(function (c) {
    cellArea += c.w * c.h;
    var gx = clamp(lerp(c.x, CX, 0.22) + rand(-90, 90), CORE.x, CORE.x + CORE.w - c.w);
    var gy = clamp(lerp(c.y, CY, 0.22) + rand(-70, 70), CORE.y, CORE.y + CORE.h - c.h);
    c.dx = gx - c.x;
    c.dy = gy - c.y;
    // 從中心往外散開：離中心越遠越晚出現
    var dist = Math.hypot(gx - CX, gy - CY) / 520;
    c.a = clamp(dist * 0.3 + rand(0, 0.1), 0, 0.38);
    c.b = rand(0.48, 0.7);
    c.e = el('rect', { x: r1(c.x), y: c.y, width: c.w, height: c.h, class: 'to-cell to-tone-' + pick([1, 1, 2, 2, 2, 3]), opacity: 0 }, gCells);
  });
  var util = cellArea / freeArea;

  // macros：整塊是連到對應區塊的連結
  var gMacros = el('g', { class: 'to-macros' }, die);
  var gLabels = el('g', { class: 'to-labels' }, die);
  MACROS.forEach(function (m, i) {
    var a = el('a', { href: '#sec-' + m.key, class: 'to-macro', opacity: 0, 'aria-label': '§' + m.sec + ' ' + m.name }, gMacros);
    el('rect', { x: m.x, y: m.y, width: m.w, height: m.h, class: 'to-macro-bg' }, a);
    el('rect', { x: m.x + 10, y: m.y + 44, width: m.w - 20, height: m.h - 54, class: 'to-macro-array' }, a);
    el('rect', { x: m.x, y: m.y, width: m.w, height: m.h, class: 'to-macro-edge' }, a);
    m.e = a;
    m.at = 0.35 + 0.12 * i;
    // 外層跟著 macro 淡入（floorplan），裡面的文字在 tapeout 縮小前淡出
    m.labelGroup = el('g', { opacity: 0 }, gLabels);
    var t1 = el('text', { x: m.x + 14, y: m.y + 26, class: 'to-macro-name' }, m.labelGroup);
    t1.textContent = 'u_' + m.key;
    var t2 = el('text', { x: m.x + m.w - 14, y: m.y + 26, class: 'to-macro-sec', 'text-anchor': 'end' }, m.labelGroup);
    t2.textContent = '§' + m.sec + ' ' + m.name;
    m.labels = [t1, t2];
  });

  // CTS：時脈從上方的 pad 進來，在中心分成 H-tree
  var gCts = el('g', { class: 'to-cts' }, die);
  var ctsSegs = [{ d: line(500, DIE.y + PAD_IN, 500, CY), level: 0 }];
  var sinks = [];
  (function htree(x, y, len, depth, horiz) {
    if (depth === 5) { sinks.push([x, y]); return; }
    var dx = horiz ? len / 2 : 0, dy = horiz ? 0 : len / 2;
    ctsSegs.push({ d: line(x, y, x - dx, y - dy), level: depth + 1 });
    ctsSegs.push({ d: line(x, y, x + dx, y + dy), level: depth + 1 });
    htree(x - dx, y - dy, len / Math.SQRT2, depth + 1, !horiz);
    htree(x + dx, y + dy, len / Math.SQRT2, depth + 1, !horiz);
  })(CX, CY, 400, 0, true);
  ctsSegs.forEach(function (s) {
    s.e = el('path', { d: s.d, class: 'to-clk to-draw to-clk-' + s.level, pathLength: 1 }, gCts);
  });
  var sinkEls = sinks.map(function (s) { return el('circle', { cx: r1(s[0]), cy: r1(s[1]), r: 5, class: 'to-sink', opacity: 0 }, gCts); });

  // routing：M1、M3 水平，M2、M4 垂直；越上層越粗越長
  var LAYERS = [
    { n: 1, horiz: true, count: 110, len: [18, 70], width: 2.2, win: [0, 0.3] },
    { n: 2, horiz: false, count: 80, len: [30, 140], width: 2.6, pitch: 10, win: [0.22, 0.52] },
    { n: 3, horiz: true, count: 50, len: [80, 300], width: 3.4, pitch: 12, win: [0.44, 0.74] },
    { n: 4, horiz: false, count: 34, len: [140, 420], width: 4.2, pitch: 16, win: [0.66, 0.96] }
  ];
  var wireTotal = 0;
  LAYERS.forEach(function (L) {
    var g = el('g', { class: 'to-metal to-m' + L.n }, die);
    var used = [];
    L.wires = [];
    L.vias = [];
    L.total = 0;
    var n = Math.round(L.count * (small ? 0.6 : 1));
    for (var i = 0; i < n; i++) {
      for (var tries = 0; tries < 30; tries++) {
        var len = rand(L.len[0], L.len[1]);
        var track = L.n === 1
          ? CORE.y + ROW * Math.floor(rnd() * NROWS) + ROW / 2 + pick([-4, 0, 4])
          : CORE.x + L.pitch * Math.floor(rnd() * (CORE.w / L.pitch));
        var a0 = rand(CORE.x, CORE.x + CORE.w - len), a1 = a0 + len;
        var h = L.width / 2;
        var hit = L.horiz ? hitsMacro(a0, track - h, a1, track + h, 6) : hitsMacro(track - h, a0, track + h, a1, 6);
        if (hit || used.some(function (u) { return u[0] === track && a0 < u[2] + 6 && a1 > u[1] - 6; })) continue;
        used.push([track, a0, a1]);
        var w = {
          len: len,
          s: rand(0, 0.55),
          e: el('path', {
            d: L.horiz ? line(a0, track, a1, track) : line(track, a0, track, a1),
            class: 'to-wire to-draw', 'stroke-width': L.width, pathLength: 1
          }, g)
        };
        if (L.n > 1) {
          w.vias = [a0, a1].map(function (a) {
            var vx = L.horiz ? a : track, vy = L.horiz ? track : a;
            return el('rect', { x: r1(vx - 3.5), y: r1(vy - 3.5), width: 7, height: 7, class: 'to-via', opacity: 0 }, g);
          });
        }
        L.wires.push(w);
        L.total += len;
        break;
      }
    }
    wireTotal += L.total;
  });
  var WIRE_SCALE = 1.9e6 / wireTotal; // 顯示用：整顆晶片繞完約 1.9 m

  // tapeout：四個 macro 接到底邊的 pad、DRC 掃描線
  var gAccent = el('g', { class: 'to-accent' }, die);
  MACROS.forEach(function (m) {
    m.routeEl = el('path', { d: 'M' + m.route.map(function (pt) { return pt.join(' '); }).join('L'), class: 'to-route to-draw', pathLength: 1 }, gAccent);
  });
  var scanGlow = el('rect', { x: DIE.x, y: DIE.y, width: DIE.w, height: 70, fill: 'url(#to-scan)', opacity: 0 }, die);
  var scanLine = el('rect', { x: DIE.x, y: DIE.y, width: DIE.w, height: 3, class: 'to-scan-line', opacity: 0 }, die);

  var hint = el('text', { x: 500, y: 505, class: 'to-hint', 'text-anchor': 'middle' }, die);
  hint.textContent = small ? 'scroll ↓' : 'scroll ↓ to place & route';

  // 打線：die 邊上的 pad（縮小之後的位置）接到封裝的接腳
  var gBonds = el('g', { class: 'to-bonds' }, svg);
  function scaled(x, y) { return [500 + (x - 500) * S, FY + (y - 500) * S]; }
  var dieL = scaled(DIE.x, DIE.y), dieR = scaled(DIE.x + DIE.w, DIE.y + DIE.h);
  var busLeads = {};
  leads.forEach(function (ld) {
    var inner, pad;
    if (ld.side === 'top' || ld.side === 'bottom') {
      var px = lerp(500, ld.c, 0.9);
      inner = [ld.c, ld.side === 'top' ? BODY.y + 2 : BODY.y + BODY.h - 2];
      pad = [px, ld.side === 'top' ? dieL[1] + 8 : dieR[1] - 8];
    } else {
      var py = lerp(FY, ld.c, 0.9);
      inner = [ld.side === 'left' ? BODY.x + 2 : BODY.x + BODY.w - 2, ld.c];
      pad = [ld.side === 'left' ? dieL[0] + 8 : dieR[0] - 8, py];
    }
    ld.bond = el('path', { d: line(pad[0], pad[1], inner[0], inner[1]), class: 'to-bond to-draw', pathLength: 1 }, gBonds);
  });
  // 亮起來的四根：底邊離 macro pad 最近的接腳
  MACROS.forEach(function (m) {
    var px = scaled(m.route[m.route.length - 1][0], 0)[0];
    var best = null;
    leads.forEach(function (ld) {
      if (ld.side !== 'bottom' || ld.used) return;
      if (!best || Math.abs(ld.c - px) < Math.abs(best.c - px)) best = ld;
    });
    best.used = true;
    best.bond.setAttribute('d', line(px, dieR[1] - 8, best.c, BODY.y + BODY.h - 2));
    best.bond.setAttribute('class', 'to-bond to-bond-accent to-draw');
    best.e.setAttribute('class', 'to-lead to-lead-accent');
    busLeads[m.key] = best.e;
  });

  // ---- per-stage renderers（只吃局部進度 t，所以可以任意跳）----
  var R = {
    floorplan: function (t) {
      set(hint, 'opacity', r1(1 - seg(t, 0, 0.2)));
      set(ghost, 'opacity', r1(1 - seg(t, 0.2, 0.35)));
      draw(dieEdge, ease(seg(t, 0, 0.3)));
      set(dieBg, 'opacity', r1(seg(t, 0.05, 0.3)));
      pads.forEach(function (e) { set(e, 'opacity', r1(seg(t, e._at, e._at + 0.08))); });
      accentPads.forEach(function (e) { set(e, 'opacity', r1(seg(t, 0.45, 0.55))); });
      MACROS.forEach(function (m) {
        var k = ease(seg(t, m.at, m.at + 0.2));
        set(m.e, 'opacity', r1(k));
        set(m.labelGroup, 'opacity', r1(k));
        var cx = m.x + m.w / 2, cy = m.y + m.h / 2, s = r1(lerp(0.9, 1, k) * 100) / 100;
        set(m.e, 'transform', 'translate(' + r1(cx * (1 - s)) + ' ' + r1(cy * (1 - s)) + ') scale(' + s + ')');
      });
      ring.forEach(function (e) { draw(e, ease(seg(t, 0.62, 0.82))); });
      stripes.forEach(function (e, i) { var a = 0.72 + 0.16 * i / stripes.length; draw(e, ease(seg(t, a, a + 0.12))); });
    },
    placement: function (t) {
      set(rows, 'opacity', r1(seg(t, 0.42, 0.55)));
      cells.forEach(function (c) {
        var k = 1 - ease(seg(t, c.b, c.b + 0.22));
        set(c.e, 'opacity', r1(seg(t, c.a, c.a + 0.08)));
        set(c.e, 'transform', k ? 'translate(' + r1(c.dx * k) + ' ' + r1(c.dy * k) + ')' : '');
      });
    },
    cts: function (t) {
      ctsSegs.forEach(function (s) { var a = s.level * 0.14; draw(s.e, seg(t, a, a + 0.16)); });
      sinkEls.forEach(function (e, i) { var a = 0.84 + 0.12 * i / sinkEls.length; set(e, 'opacity', r1(seg(t, a, a + 0.04))); });
    },
    routing: function (t) {
      LAYERS.forEach(function (L) {
        var lt = seg(t, L.win[0], L.win[1]);
        L.drawn = 0;
        L.wires.forEach(function (w) {
          var k = seg(lt, w.s, w.s + 0.45);
          draw(w.e, k);
          L.drawn += w.len * k;
          if (w.vias) w.vias.forEach(function (v) { set(v, 'opacity', k >= 1 ? 1 : 0); });
        });
        L.t = lt;
      });
    },
    tapeout: function (t) {
      var sk = seg(t, 0, 0.2);
      var sy = DIE.y + DIE.h * sk;
      set(scanLine, 'y', r1(sy - 1.5));
      set(scanGlow, 'y', r1(sy - 70));
      var on = sk > 0 && sk < 1 ? 1 : 0;
      set(scanLine, 'opacity', on);
      set(scanGlow, 'opacity', on);
      var lit = t >= 0.16;
      MACROS.forEach(function (m) {
        draw(m.routeEl, ease(seg(t, 0.16, 0.3)));
        m.e.classList.toggle('is-lit', lit);
        m.labels.forEach(function (e) { set(e, 'opacity', r1(1 - seg(t, 0.3, 0.4))); });
      });
      var k = ease(seg(t, 0.3, 0.62));
      var s = lerp(1, S, k), cy = lerp(500, FY, k);
      set(die, 'transform', k ? 'translate(' + r1(500 - 500 * s) + ' ' + r1(cy - 500 * s) + ') scale(' + (Math.round(s * 1000) / 1000) + ')' : '');
      set(pkg, 'opacity', r1(seg(t, 0.5, 0.66)));
      leads.forEach(function (ld, i) { draw(ld.bond, seg(t, 0.62 + 0.1 * (i % 12) / 12, 0.68 + 0.1 * (i % 12) / 12)); });
      set(pkgLabel, 'opacity', r1(seg(t, 0.7, 0.8)));
      svg.classList.toggle('is-packaged', t >= 0.78);
    }
  };

  // ---- console + metrics ----
  var LOG = {
    floorplan: [[0.02, 1, 'floorPlan -site core -r 1.0 0.70 40 40 40 40'], [0.3, 0, '**INFO: 48 IO pads placed'],
      [0.4, 1, 'placeInstance u_netlist u_writing u_about u_projects'], [0.64, 1, 'addRing -nets {VDD VSS} -layer {M7 M8}'],
      [0.8, 1, 'addStripe -nets {VDD VSS} -layer M8 -spacing 125']],
    placement: [[0.02, 1, 'place_opt_design'], [0.25, 0, '**INFO: global placement · ' + cells.length + ' instances'],
      [0.5, 0, '**INFO: refinePlace · legalizing'], [0.95, 0, '**INFO: density ' + (util * 100).toFixed(1) + '% · overflow 0.00%']],
    cts: [[0.02, 1, 'ccopt_design'], [0.5, 0, '**INFO: H-tree · 5 levels · ' + sinks.length + ' sinks'], [0.95, 0, '**INFO: skew 11.8 ps']],
    routing: [[0.02, 1, 'routeDesign -globalDetail']].concat(LAYERS.map(function (L) {
      return [L.win[1] + 0.01, 0, '**INFO: M' + L.n + ' routed · ' + L.wires.length + ' nets'];
    })),
    tapeout: [[0.02, 1, 'verify_drc'], [0.2, 0, '**INFO: 0 violations ✓'], [0.32, 1, 'streamOut chip.gds'],
      [0.7, 0, '**INFO: GDSII written · taped out ✓'], [0.86, 0, '// pins 01–04 → §01–§04 ↓']]
  };
  var log = [];
  keys.forEach(function (k) {
    LOG[k].forEach(function (l) { log.push({ at: spans[k].start + spans[k].len * l[0], cmd: l[1], text: l[2] }); });
  });
  var shown = -1;
  function renderConsole(p) {
    var n = 0;
    while (n < log.length && log[n].at <= p) n++;
    if (n === shown) return;
    shown = n;
    var html = '';
    log.slice(Math.max(0, n - 5), n).forEach(function (l, i, arr) {
      var txt = l.text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      html += '<span class="to-line">' + (l.cmd ? '<span class="to-prompt">innovus&gt;</span> ' + txt : '<span class="to-out">' + txt + '</span>') +
        (i === arr.length - 1 ? '<span class="to-cursor"></span>' : '') + '</span>';
    });
    consoleEl.innerHTML = html || '<span class="to-line"><span class="to-prompt">innovus&gt;</span> <span class="to-cursor"></span></span>';
  }

  var metric = {};
  Array.prototype.forEach.call(root.querySelectorAll('[data-metric]'), function (e) { metric[e.getAttribute('data-metric')] = e; });
  function setMetric(k, text, cls) {
    var e = metric[k];
    if (!e) return;
    if (e.textContent !== text) e.textContent = text;
    e.className = cls || '';
  }
  function fmtLen(um) {
    if (um < 1000) return Math.round(um) + ' µm';
    if (um < 1e6) return (um / 1000).toFixed(2) + ' mm';
    return (um / 1e6).toFixed(3) + ' m';
  }
  function renderMetrics(p) {
    var tp = localT('placement', p), tc = localT('cts', p), tr = localT('routing', p), tt = localT('tapeout', p);
    var placed = cells.reduce(function (s, c) { return s + (p > spans.placement.start ? seg(tp, c.a, c.a + 0.08) * c.w * c.h : 0); }, 0);
    setMetric('util', tp > 0 ? (placed / freeArea * 100).toFixed(1) + '%' : '—');
    var drawn = tr > 0 ? LAYERS.reduce(function (s, L) { return s + (L.drawn || 0); }, 0) : 0;
    setMetric('wire', tr > 0 ? fmtLen(drawn * WIRE_SCALE) : '—');
    if (tr >= 1) setMetric('wns', '+0.013 ns', 'is-ok');
    else if (spans.cts && tc >= 1) setMetric('wns', '−0.041 ns', 'is-bad');
    else if (tp >= 0.95) setMetric('wns', '−0.184 ns', 'is-bad');
    else setMetric('wns', '—');
    if (tt >= 0.2) setMetric('drc', '0 ✓', 'is-ok');
    else if (tr > 0) setMetric('drc', String(Math.round(180 * Math.sin(Math.PI * Math.min(1, tr * 1.15)))), tr < 0.87 ? 'is-bad' : '');
    else setMetric('drc', '—');
  }

  // ---- stepper / captions / layer legend ----
  var steps = keys.map(function (k) { return root.querySelector('[data-step="' + k + '"]'); });
  var captions = keys.map(function (k) { return root.querySelector('[data-caption="' + k + '"]'); });
  var layerEls = Array.prototype.slice.call(root.querySelectorAll('[data-layer]'));
  var activeStep = -1;
  function renderChrome(p) {
    var active = 0;
    keys.forEach(function (k, i) {
      var t = localT(k, p);
      if (p >= spans[k].start) active = i;
      var li = steps[i];
      if (!li) return;
      li.style.setProperty('--t', t.toFixed(3));
      li.classList.toggle('is-done', t >= 1);
    });
    if (active !== activeStep) {
      activeStep = active;
      steps.forEach(function (li, i) { if (li) li.classList.toggle('is-active', i === active); });
      captions.forEach(function (c, i) { if (c) c.classList.toggle('is-on', i === active); });
    }
    var tr = localT('routing', p);
    LAYERS.forEach(function (L, i) {
      var li = layerEls[i];
      if (!li) return;
      li.classList.toggle('is-on', tr > 0 && (L.t || 0) > 0);
      li.classList.toggle('is-cur', tr > 0 && tr < 1 && (L.t || 0) > 0 && (L.t || 0) < 1);
    });
  }
  steps.forEach(function (li, i) {
    if (!li) return;
    li.querySelector('button').addEventListener('click', function () {
      var k = keys[i];
      var range = track.offsetHeight - stage.offsetHeight;
      var top = track.getBoundingClientRect().top + window.pageYOffset - headerH();
      window.scrollTo({ top: top + range * (spans[k].start + spans[k].len * 0.96), behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  // ---- bus：從亮起來的四根接腳往下，沿左邊的匯流排接到 §01–§04 的 kicker ----
  var wires = BUS_ORDER.map(function (key, j) {
    var sec = document.getElementById('sec-' + key);
    if (!sec) return null;
    return {
      sec: sec,
      kicker: sec.querySelector('.kicker'),
      lead: busLeads[key],
      j: j,
      e: el('path', { class: 'to-bus-wire' }, bus),
      dot: el('circle', { r: 3, class: 'to-bus-dot', opacity: 0 }, bus)
    };
  }).filter(Boolean);
  var busSize = '';
  // 折線在 y = head 的地方截斷
  function truncate(pts, head) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var a = pts[i - 1], b = pts[i];
      if (b[1] <= head) { out.push(b); continue; }
      if (a[1] < head) out.push([b[0], head]);
      break;
    }
    return out;
  }
  function renderBus(k, rects) {
    var rr = rects.root;
    var size = Math.round(rr.width) + 'x' + Math.round(rr.height);
    if (size !== busSize) {
      busSize = size;
      bus.setAttribute('width', Math.round(rr.width));
      bus.setAttribute('height', Math.round(rr.height));
      bus.setAttribute('viewBox', '0 0 ' + Math.round(rr.width) + ' ' + Math.round(rr.height));
    }
    var trackBottom = rects.track.bottom - rr.top;
    wires.forEach(function (w, i) {
      var lr = rects.leads[i], kr = rects.kickers[i];
      var contentLeft = kr.left - rr.left;
      var g = clamp((contentLeft - 6) / 4, 3, 8);
      var lx = lr.left + lr.width / 2 - rr.left, ly = lr.bottom - rr.top;
      var jog = trackBottom + 30 + 14 * w.j;
      var bx = contentLeft - g * (4 - w.j);
      var ky = kr.top + kr.height / 2 - rr.top;
      var pts = [[lx, ly], [lx, jog], [bx, jog], [bx, ky], [contentLeft, ky]];
      var reach = Math.max(ly, window.innerHeight * 0.92 - rr.top);
      var head = k >= 1 && reduceMotion ? Infinity : ly + (reach - ly) * k;
      var shownPts = k > 0 ? truncate(pts, head) : [];
      set(w.e, 'd', shownPts.length > 1 ? 'M' + shownPts.map(function (pt) { return r1(pt[0]) + ' ' + r1(pt[1]); }).join('L') : '');
      var done = head >= ky;
      set(w.dot, 'cx', r1(contentLeft));
      set(w.dot, 'cy', r1(ky));
      set(w.dot, 'opacity', done ? 1 : 0);
      w.sec.classList.toggle('is-wired', done);
    });
  }

  // ---- main loop ----
  var last = {};
  var hh = 64;
  function headerH() { return hh; }
  function measureHeader() { hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64; }
  measureHeader();

  function frame() {
    // 先讀版面，再一次寫回
    var rects = {
      root: root.getBoundingClientRect(),
      track: track.getBoundingClientRect(),
      leads: wires.map(function (w) { return w.lead.getBoundingClientRect(); }),
      kickers: wires.map(function (w) { return w.kicker.getBoundingClientRect(); })
    };
    var p = 1;
    if (!reduceMotion) {
      var range = rects.track.height - stage.offsetHeight;
      p = range > 0 ? clamp01((headerH() - rects.track.top) / range) : 1;
    }
    keys.forEach(function (k) {
      var t = localT(k, p);
      if (last[k] === t) return;
      last[k] = t;
      R[k](t);
    });
    renderConsole(p);
    renderMetrics(p);
    renderChrome(p);
    renderBus(seg(localT('tapeout', p), 0.8, 1), rects);
  }

  var ticking = false;
  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; frame(); });
  }

  root.classList.add(reduceMotion ? 'is-static' : 'is-live');
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { measureHeader(); request(); });
  if ('ResizeObserver' in window) new ResizeObserver(request).observe(root);
  frame();
})();
