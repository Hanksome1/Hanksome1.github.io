/* 首頁的開場：一開始是首頁那一屏（名字、一句話、波形），往下捲收進左邊一欄；晶種垂下來，晶棒從 2022 長到 2026，
   每一年刻一圈；切下最新的一片轉成正面、一顆一顆曝光出 die，再鑽進正中間那顆，依序經過 floorplan → placement → CTS → routing → tapeout。
   舞台用 position: sticky 釘在畫面上，捲過 .to-track 的距離換算成 0–1 的進度 p，每一段再換算成自己的局部進度 t，
   所以往回捲動畫也會倒著播。最後四個 macro 從封裝底部的接腳拉線（.to-bus），沿著左邊往下接到 §01–§04 的標題；
   §01 那條再繼續往下分岔，接進每張專案卡，把卡片裡的 netlist 畫出來。 */
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
  var CHIP = cfg.chip || 'HW26-A0'; // 這顆晶片的料號：A0 是第一版矽（first silicon）的 stepping

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
  // hero 是首頁那一屏收進左邊一欄，crystal 是晶棒長出來、切成晶圓；這兩段不算 APR 的步驟（steps），左上角的狀態不數它們
  var WEIGHTS = { hero: 0.7, crystal: 1.7, floorplan: 1.8, placement: 1.4, cts: 0.8, routing: 1.4, tapeout: 1.3 }; // floorplan 包含從整片晶圓鑽進來那一段
  var HOLD = 0.3; // 演完之後停留一下才放開舞台
  var steps = (cfg.stages || ['floorplan', 'placement', 'cts', 'routing', 'tapeout']).filter(function (k) { return WEIGHTS[k]; });
  var keys = ['hero', 'crystal'].concat(steps);
  var total = keys.reduce(function (s, k) { return s + WEIGHTS[k]; }, HOLD);
  var spans = {};
  keys.reduce(function (at, k) {
    spans[k] = { start: at / total, len: WEIGHTS[k] / total };
    return at + WEIGHTS[k];
  }, 0);
  function localT(k, p) { return spans[k] ? clamp01((p - spans[k].start) / spans[k].len) : (p > 0 ? 1 : 0); }

  // ---- camera ----
  // 鏡頭是一個正方形的取景框（中心 x, y、邊長 w，單位跟 viewBox 一樣，1 = 1 µm），整個放進 .to-frame 那一格（contain），
  // 所以晶片永遠整顆看得到；.to-frame 外面（文字底下）照樣畫，晶圓會一路鋪到舞台邊。
  // 每一格 [stage, t, x, y, w] 是那一段演到 t 的時候鏡頭的位置，中間平滑插值
  var WAFER_R = 3600; // 晶圓半徑，中心就是這顆 die 的中心
  var PKG_SHOT = [500, 345, 800]; // tapeout 之後框住封裝
  var SEED_SHOT = [700, -9300, 4600]; // 夾頭和晶種
  // 先只看得到晶種，晶棒長到全寬再拉遠看整根；切下來的晶圓轉正之後看到整片，往下捲才鑽進正中間那顆
  var SHOTS = [
    ['hero', 0].concat(SEED_SHOT), ['crystal', 0].concat(SEED_SHOT),
    ['crystal', 0.2, 2900, -4600, 13800], ['crystal', 0.6, 2900, -4600, 13800], ['crystal', 0.97, 500, 500, WAFER_R * 2 + 300],
    ['floorplan', 0.06, 500, 500, WAFER_R * 2 + 300], ['floorplan', 0.42, 500, 500, 1000],
    ['routing', 0, 500, 500, 1000], ['routing', 0.5, 500, 500, 950], ['routing', 1, 500, 500, 1000],
    ['tapeout', 0.25, 500, 500, 1000], ['tapeout', 0.7].concat(PKG_SHOT)
  ];
  var shots = SHOTS.filter(function (s) { return spans[s[0]]; }).map(function (s) {
    return { p: spans[s[0]].start + spans[s[0]].len * s[1], x: s[2], y: s[3], w: s[4] };
  });
  function camera(p) {
    var i = 0;
    while (i < shots.length - 1 && shots[i + 1].p <= p) i++;
    var a = shots[i], b = shots[Math.min(i + 1, shots.length - 1)];
    var k = b.p > a.p ? ease(clamp01((p - a.p) / (b.p - a.p))) : 0;
    // 邊長用對數插值，拉近拉遠的速度才會一致
    return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), k)) };
  }
  var frameEl = root.querySelector('.to-frame');
  var view = { W: 1, H: 1, fx: 0.5, fy: 0.5, fw: 1, fh: 1 };
  // 舞台和 .to-frame 的大小、位置
  function measureView() {
    var sr = svg.getBoundingClientRect(), fr = frameEl.getBoundingClientRect();
    view.W = sr.width || 1;
    view.H = sr.height || 1;
    if (fr.width < 20 || fr.height < 20) fr = sr;
    view.fx = fr.left - sr.left + fr.width / 2;
    view.fy = fr.top - sr.top + fr.height / 2;
    view.fw = fr.width;
    view.fh = fr.height;
  }
  function viewBox(c) {
    var u = Math.max(c.w / view.fw, c.w / view.fh); // 每個 px 幾 µm
    return { x: c.x - view.fx * u, y: c.y - view.fy * u, w: view.W * u, h: view.H * u, u: u };
  }

  // ---- build the chip ----
  var defs = el('defs', {}, svg);
  var pat = el('pattern', { id: 'to-sram', width: 12, height: 12, patternUnits: 'userSpaceOnUse' }, defs);
  el('path', { d: 'M0 6H12M6 0V12', class: 'to-sram-grid' }, pat);
  var grad = el('linearGradient', { id: 'to-scan', x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: 0, class: 'to-scan-0' }, grad);
  el('stop', { offset: 1, class: 'to-scan-1' }, grad);
  var gWafer = el('g', { class: 'to-wafer' }, svg); // 晶圓等晶片長出來之後才填

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
  pkgLabel.textContent = CHIP + ' · QFN48 · TAPED OUT';

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

  // ---- 做完的樣子 ----
  // 把剛剛排好的 cell、繞好的線各併成一條 path，當成整顆晶片做完的圖章，蓋在晶圓上每一格
  (function () {
    var stamp = el('g', { id: 'to-die-done' }, defs);
    el('rect', { x: DIE.x, y: DIE.y, width: DIE.w, height: DIE.h, class: 'to-die-bg' }, stamp);
    el('path', { d: rowsD, class: 'to-rows' }, stamp);
    el('path', { d: cells.map(function (c) { return 'M' + r1(c.x) + ' ' + c.y + 'h' + c.w + 'v' + c.h + 'h-' + c.w + 'Z'; }).join(''), class: 'to-cell to-tone-2' }, stamp);
    MACROS.forEach(function (m) {
      el('rect', { x: m.x, y: m.y, width: m.w, height: m.h, class: 'to-macro-bg' }, stamp);
      el('rect', { x: m.x + 10, y: m.y + 44, width: m.w - 20, height: m.h - 54, class: 'to-macro-array' }, stamp);
      el('rect', { x: m.x, y: m.y, width: m.w, height: m.h, class: 'to-macro-edge' }, stamp);
    });
    LAYERS.forEach(function (L) {
      var g = el('g', { class: 'to-metal to-m' + L.n }, stamp);
      el('path', { d: L.wires.map(function (w) { return w.e.getAttribute('d'); }).join(''), class: 'to-wire', fill: 'none', 'stroke-width': L.width }, g);
    });
    el('rect', { x: DIE.x, y: DIE.y, width: DIE.w, height: DIE.h, class: 'to-wafer-edge' }, stamp);
  })();

  // ---- wafer ----
  // 遠看每顆 die 只有外框和四個 macro 的影子，鏡頭拉近才在旁邊幾顆蓋上做完的圖章；被邊緣切到的只畫外框。
  // 正中間那顆留空、用取景框框起來，就是接下來要做的這顆。整片包在 waferFace 裡：晶圓剛切下來是斜的，crystal 那段把它轉正
  var waferFace = el('g', { opacity: 0 }, gWafer);
  function rectD(x, y, w, h) { return 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h-' + w + 'Z'; }
  var wafer = (function (g) {
    var R = WAFER_R;
    var si = el('radialGradient', { id: 'to-si', cx: 0.38, cy: 0.32, r: 0.85 }, defs);
    el('stop', { offset: 0, class: 'to-si-0' }, si);
    el('stop', { offset: 1, class: 'to-si-1' }, si);
    // 薄膜的干涉色，跟著捲動慢慢滑過去（renderWafer）
    var sheen = el('linearGradient', { id: 'to-sheen', gradientUnits: 'userSpaceOnUse', x1: 500 - R, y1: 500 - R * 0.6, x2: 500 + R, y2: 500 + R * 0.6 }, defs);
    [0, 0.34, 0.44, 0.52, 0.62, 1].forEach(function (off, i) { el('stop', { offset: off, class: 'to-sh-' + i }, sheen); });
    var clip = el('clipPath', { id: 'to-wafer-clip' }, defs);
    el('circle', { cx: 500, cy: 500, r: R }, clip);
    el('circle', { cx: 500, cy: 500, r: R, class: 'to-wafer-disc' }, g);
    el('circle', { cx: 500, cy: 500, r: R - 90, class: 'to-wafer-excl' }, g);

    var tiles = [], silD = '', partD = '', near = [];
    var n = Math.ceil(R / 1000) + 1;
    for (var j = -n; j <= n; j++) {
      for (var i = -n; i <= n; i++) {
        if (!i && !j) continue;
        var x0 = DIE.x + i * 1000, y0 = DIE.y + j * 1000, x1 = x0 + DIE.w, y1 = y0 + DIE.h;
        var far = Math.max(Math.hypot(x0 - 500, y0 - 500), Math.hypot(x1 - 500, y0 - 500), Math.hypot(x0 - 500, y1 - 500), Math.hypot(x1 - 500, y1 - 500));
        var gap = Math.hypot(Math.max(x0 - 500, 0, 500 - x1), Math.max(y0 - 500, 0, 500 - y1));
        if (far < R - 80) {
          tiles.push({ i: i, j: j, e: el('rect', { x: x0, y: y0, width: DIE.w, height: DIE.h, class: 'to-wafer-die', opacity: 0 }, g) });
          silD += MACROS.map(function (m) { return rectD(m.x + i * 1000, m.y + j * 1000, m.w, m.h); }).join('');
          if (Math.abs(i) <= 2 && Math.abs(j) <= 2) near.push([i, j]);
        } else if (gap < R) partD += rectD(x0, y0, DIE.w, DIE.h);
      }
    }
    // 曝光的順序：一排一排、蛇行
    tiles.sort(function (p, q) { return p.j - q.j || (p.j % 2 ? q.i - p.i : p.i - q.i); });
    tiles.forEach(function (tl, k) { tl.at = 0.8 + 0.17 * k / tiles.length; });
    var sil = el('path', { d: silD, class: 'to-wafer-sil', opacity: 0 }, g);
    el('path', { d: partD, class: 'to-wafer-part', 'clip-path': 'url(#to-wafer-clip)' }, g);
    var detail = el('g', { class: 'to-wafer-detail', opacity: 0 }, g);
    near.forEach(function (c) { el('use', { href: '#to-die-done', x: c[0] * 1000, y: c[1] * 1000 }, detail); });
    el('circle', { cx: 500, cy: 500, r: R, fill: 'url(#to-sheen)', class: 'to-wafer-sheen' }, g);

    // 雷射刻號沿著下緣，缺口在正下方
    var mr = R - 230, a0 = 128 * Math.PI / 180, a1 = 52 * Math.PI / 180;
    el('path', { id: 'to-wafer-arc', d: 'M' + r1(500 + mr * Math.cos(a0)) + ' ' + r1(500 + mr * Math.sin(a0)) + 'A' + mr + ' ' + mr + ' 0 0 0 ' + r1(500 + mr * Math.cos(a1)) + ' ' + r1(500 + mr * Math.sin(a1)), fill: 'none' }, defs);
    var mark = el('text', { class: 'to-wafer-laser', 'text-anchor': 'middle' }, g);
    el('textPath', { href: '#to-wafer-arc', startOffset: '50%' }, mark).textContent = 'NTHU EE · LOT 2026-' + CHIP + ' · WAFER 01 · 300 mm';
    el('path', { d: 'M380 ' + (500 + R + 6) + 'L500 ' + (500 + R - 140) + 'L620 ' + (500 + R + 6) + 'Z', class: 'to-wafer-notch' }, g);

    // 正中間這顆：取景框的四個角、從晶圓邊緣指過來的十字和晶片名稱，鑽進去的時候淡掉
    var slot = el('g', { class: 'to-wafer-slot', opacity: 0 }, g);
    el('rect', { x: DIE.x, y: DIE.y, width: DIE.w, height: DIE.h, class: 'to-slot-fill' }, slot);
    var L = 170;
    el('path', {
      d: 'M0 ' + L + 'V0H' + L + 'M' + (1000 - L) + ' 0H1000V' + L + 'M1000 ' + (1000 - L) + 'V1000H' + (1000 - L) + 'M' + L + ' 1000H0V' + (1000 - L),
      class: 'to-slot-bracket'
    }, slot);
    el('path', { d: line(500 - R + 160, 500, -80, 500) + line(1080, 500, 500 + R - 160, 500) + line(500, 500 - R + 160, 500, -80) + line(500, 1080, 500, 500 + R - 160), class: 'to-slot-cross' }, slot);
    var label = el('text', { x: 500, y: -110, 'text-anchor': 'middle', class: 'to-slot-label' }, slot);
    label.textContent = CHIP + '  ·  X00 Y00';

    // 切割道：tapeout 的時候沿著 die 之間的走道切開
    var saw = [];
    for (var k = -n; k <= n + 1; k++) {
      var h = Math.sqrt(Math.max(0, R * R - Math.pow(k * 1000 - 500, 2)));
      if (!h) continue;
      saw.push(el('path', { d: line(k * 1000, 500 - h, k * 1000, 500 + h), class: 'to-saw to-draw', pathLength: 1 }, g));
      saw.push(el('path', { d: line(500 - h, k * 1000, 500 + h, k * 1000), class: 'to-saw to-draw', pathLength: 1 }, g));
    }
    return { slot: slot, label: label, saw: saw, tiles: tiles, sil: sil, detail: detail, sheen: sheen };
  })(waferFace);

  // ---- crystal：晶棒 ----
  // 斜著往下看一根平頂的圓柱：頂面是整個橢圓，側面往下長，底邊是橢圓的前半圈。真的 CZ 晶棒頂上有一段錐形的放肩，
  // 切片前會先切掉、外圓磨平，所以拿去切片的就是這樣一根圓柱。每年一圈，旁邊寫那年做了什麼（cfg.ingot）
  var E = 0.24; // 往下看的角度：圓的截面壓成高 E 倍的橢圓
  var ING = { top: 500 - 9100, slab: 170 }; // 頂面高度、晶圓厚度（跟轉正時的邊一樣厚）
  ING.chuck = ING.top - 1000; // 夾頭底
  function ellipseD(r, y) {
    var a = r1(r) + ' ' + r1(r * E) + ' 0 1 0 ';
    return 'M' + r1(500 - r) + ' ' + y + 'A' + a + r1(500 + r) + ' ' + y + 'A' + a + r1(500 - r) + ' ' + y + 'Z';
  }
  function frontArc(r, y) { return 'M' + r1(500 - r) + ' ' + r1(y) + 'A' + r1(r) + ' ' + r1(r * E) + ' 0 0 0 ' + r1(500 + r) + ' ' + r1(y); }
  function cylinderD(r, yB) { return 'M' + r1(500 - r) + ' ' + ING.top + 'V' + r1(yB) + 'A' + r1(r) + ' ' + r1(r * E) + ' 0 0 0 ' + r1(500 + r) + ' ' + r1(yB) + 'V' + ING.top + 'Z'; }
  var ingot = (function () {
    var R = WAFER_R;
    var side = el('linearGradient', { id: 'to-ingot', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    [0, 0.3, 0.42, 0.75, 1].forEach(function (off, i) { el('stop', { offset: off, class: 'to-ig-' + i }, side); });
    var cap = el('linearGradient', { id: 'to-ingot-top', x1: 0, y1: 0, x2: 1, y2: 1 }, defs);
    [0, 0.42, 0.52, 0.62, 1].forEach(function (off, i) { el('stop', { offset: off, class: 'to-tp-' + i }, cap); });

    // 晶圓轉正時看得到的側邊，畫在晶棒底下
    var rim = el('path', { class: 'to-wafer-rim', opacity: 0 });
    svg.insertBefore(rim, gWafer.nextSibling);
    var g = el('g', { class: 'to-ingot' });
    svg.insertBefore(g, rim.nextSibling);
    var body = el('path', { class: 'to-ingot-body' }, g);
    var top = el('path', { class: 'to-ingot-top' }, g);
    var front = el('path', { class: 'to-ingot-front', opacity: 0 }, g);
    // 拉晶的鋼索、夾頭和晶種是一組，開場收完之後從上面垂下來；晶種插在頂面正中間
    var rig = el('g', { opacity: 0 }, g);
    el('path', { d: line(500, ING.chuck - 4500, 500, ING.chuck - 540), class: 'to-ingot-cable' }, rig);
    el('path', { d: rectD(430, ING.chuck, 140, ING.top - ING.chuck), class: 'to-ingot-seed' }, rig);
    el('rect', { x: 200, y: ING.chuck - 540, width: 600, height: 560, rx: 40, class: 'to-ingot-chuck' }, rig);
    var seedLabel = el('text', { x: 960, y: ING.chuck - 210, class: 'to-ingot-small' }, rig);
    var years = cfg.ingot || [];
    seedLabel.textContent = 'seed crystal' + (years[0] ? ' · ' + years[0].year : '');

    var ry = R * E, y0 = ING.top + 1100, y1 = 500 - 1500;
    var rings = years.map(function (yr, k) {
      var y = years.length > 1 ? lerp(y0, y1, k / (years.length - 1)) : y0;
      var gm = el('g', { opacity: 0 }, g);
      el('path', { d: frontArc(R, y), class: 'to-ingot-ring' }, gm);
      el('path', { d: line(500 + R + 120, y, 500 + R + 620, y), class: 'to-ingot-lead' }, gm);
      el('text', { x: 500 + R + 760, y: y + 95, class: 'to-ingot-year' }, gm).textContent = yr.year;
      el('text', { x: 500 + R + 1900, y: y + 70, class: 'to-ingot-text' }, gm).textContent = yr.title;
      if (yr.note) el('text', { x: 500 + R + 1900, y: y + 330, class: 'to-ingot-sub' }, gm).textContent = yr.note;
      return { y: y, g: gm };
    });
    // 線鋸沿著圓柱表面切一圈：y = 500 這個截面的前半圈，切下來的是最底下厚 ING.slab 的那一片
    var cut = el('path', { d: frontArc(R, 500), class: 'to-ingot-cut to-draw', pathLength: 1, opacity: 0 }, svg);
    var cutLabel = el('text', { x: 500 + R + 760, y: 560, class: 'to-ingot-year', opacity: 0 }, svg);
    cutLabel.textContent = 'slice → wafer 01';
    return { g: g, rim: rim, body: body, top: top, front: front, rig: rig, rings: rings, ry: ry, cut: cut, cutLabel: cutLabel };
  })();

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

  // ---- hero：首頁那一屏收進左邊一欄 ----
  // 名字和一句話用 FLIP 縮放飛到左欄的位置再交棒；波形視窗先淡成一個空的外框，外框一路變形成終端機的大小。
  // 窄螢幕左欄收掉的東西（display: none）量不到位置，就在原地淡掉
  var heroFold = (function () {
    var heroEl = stage.querySelector('.to-hero');
    if (!heroEl) return { measure: function () {}, step: function () {} };
    function q(s) { return stage.querySelector(s); }
    var fly = [['.to-hero .hero-name', '.to-id-name'], ['.to-hero .hero-tagline', '.to-id-tag']].map(function (s) {
      return { src: q(s[0]), dst: q(s[1]) };
    }).filter(function (f) { return f.src && f.dst; });
    var wave = q('.to-hero .wave'), term = q('.to-term');
    var frameBox = document.createElement('div');
    frameBox.className = 'to-hero-frame';
    frameBox.innerHTML = '<i></i><i></i><i></i>';
    stage.appendChild(frameBox);
    var fadeOut = [q('.to-hero .hero-top'), q('.to-hero .spec-strip')].filter(Boolean);
    var swap = fly.map(function (f) { return f.dst; }).concat(term ? [term] : []);
    // 左邊一欄其他的東西等收完再淡進來
    var late = ['.to-status', '.to-id-k', '.to-id-spec', '.to-id-hl', '.to-id-links', '.to-readout', '.to-skip'].map(q).filter(Boolean);
    var box = null, at = 0;
    function measure() {
      fly.forEach(function (f) { f.src.style.transform = ''; f.src._tos_transform = ''; });
      var sr = stage.getBoundingClientRect();
      var tag = q('.to-hero .hero-tagline').getBoundingClientRect();
      stage.style.setProperty('--to-play-y', r1(tag.top - sr.top + tag.height / 2) + 'px'); // 自動播放開關對齊一句話
      fly.forEach(function (f) {
        var s = f.src.getBoundingClientRect(), d = f.dst.getBoundingClientRect();
        f.gone = !d.width;
        f.dx = d.left - s.left;
        f.dy = d.top - s.top;
        f.k = parseFloat(getComputedStyle(f.dst).fontSize) / parseFloat(getComputedStyle(f.src).fontSize);
      });
      box = null;
      if (wave && term) {
        var w = wave.getBoundingClientRect(), m = term.getBoundingClientRect();
        if (w.width && m.width) box = [[w.left - sr.left, w.top - sr.top, w.width, w.height], [m.left - sr.left, m.top - sr.top, m.width, m.height]];
      }
      step(at);
    }
    // h = 1 的時候把 inline 的 opacity 拿掉，交回給 CSS（窄螢幕 tapeout 之後終端機要退場）
    function fade(e, o, h) { setStyle(e, 'opacity', h >= 1 ? '' : String(r1(o * 100) / 100)); }
    function step(h) {
      at = h;
      var k = ease(seg(h, 0.08, 0.78));
      fly.forEach(function (f) {
        setStyle(f.src, 'transform', k && !f.gone ? 'translate(' + r1(f.dx * k) + 'px,' + r1(f.dy * k) + 'px) scale(' + Math.round(lerp(1, f.k, k) * 1e4) / 1e4 + ')' : '');
        setStyle(f.src, 'opacity', String(r1((1 - seg(h, f.gone ? 0.2 : 0.7, f.gone ? 0.45 : 0.78)) * 100) / 100));
      });
      fadeOut.forEach(function (e, i) {
        var o = seg(h, 0.06 + i * 0.04, 0.3 + i * 0.04);
        setStyle(e, 'opacity', String(r1((1 - o) * 100) / 100));
        setStyle(e, 'transform', o ? 'translateY(' + r1(-14 * o) + 'px)' : '');
      });
      if (wave) setStyle(wave, 'opacity', String(r1((1 - seg(h, 0.1, 0.28)) * 100) / 100));
      if (box) {
        var g = ease(seg(h, 0.18, 0.78));
        var b = box[0].map(function (v, i) { return r1(lerp(v, box[1][i], g)); });
        setStyle(frameBox, 'transform', 'translate(' + b[0] + 'px,' + b[1] + 'px)');
        setStyle(frameBox, 'width', b[2] + 'px');
        setStyle(frameBox, 'height', b[3] + 'px');
      }
      setStyle(frameBox, 'opacity', box ? String(r1(seg(h, 0.08, 0.24) * (1 - seg(h, 0.8, 0.9)) * 100) / 100) : '0');
      swap.forEach(function (e) { fade(e, seg(h, 0.76, 0.86), h); });
      late.forEach(function (e, i) { fade(e, seg(h, 0.78 + i * 0.02, 0.92 + i * 0.01), h); });
      heroEl.style.setProperty('--to-hero-bg', String(r1((1 - seg(h, 0.5, 0.8)) * 100) / 100));
      setStyle(heroEl, 'visibility', h >= 1 ? 'hidden' : '');
      setStyle(heroEl, 'pointerEvents', h > 0.3 ? 'none' : '');
    }
    return { measure: measure, step: step };
  })();

  // ---- per-stage renderers（只吃局部進度 t，所以可以任意跳）----
  var R = {
    hero: function (t) {
      heroFold.step(t);
      root.classList.toggle('is-folded', t >= 0.6); // 自動播放開關從一句話旁邊縮成小藥丸
      // 收到最後，夾頭和晶種從上面垂下來
      var drop = ease(seg(t, 0.72, 1));
      set(ingot.rig, 'opacity', r1(seg(t, 0.72, 0.85)));
      set(ingot.rig, 'transform', drop < 1 ? 'translate(0 ' + r1(-2600 * (1 - drop)) + ')' : '');
    },
    crystal: function (t) {
      var R = WAFER_R;
      // 先從晶種底下長出頂面、往外擴到全寬，再以固定的拉晶速度往下長；多長一片晶圓的厚度留給切片
      var rr = lerp(60, R, ease(seg(t, 0.03, 0.15)));
      var yB = t >= 0.68 ? 500 : lerp(ING.top + 60, 500 + ING.slab, seg(t, 0.04, 0.55));
      var on = t > 0.03;
      set(ingot.body, 'd', on ? cylinderD(rr, yB) : '');
      set(ingot.top, 'd', on ? ellipseD(rr, ING.top) : '');
      set(ingot.front, 'd', on ? frontArc(rr, yB) : '');
      set(ingot.front, 'opacity', on ? r1(1 - seg(t, 0.53, 0.57)) : 0);
      ingot.rings.forEach(function (rg) { set(rg.g, 'opacity', r1(seg(yB, rg.y + ingot.ry * 0.4, rg.y + ingot.ry * 1.4))); });
      var c = seg(t, 0.56, 0.68);
      draw(ingot.cut, c);
      set(ingot.cut, 'opacity', c > 0 && t < 0.78 ? 1 : 0);
      set(ingot.cutLabel, 'opacity', r1(seg(t, 0.6, 0.66) * (1 - seg(t, 0.74, 0.8))));
      // 切下來之後晶棒往上退，這一片從斜的轉成正面
      var lift = ease(seg(t, 0.68, 0.92));
      set(ingot.g, 'transform', lift ? 'translate(0 ' + r1(-4200 * lift) + ')' : '');
      set(ingot.g, 'opacity', r1(1 - seg(t, 0.78, 0.92)));
      var tilt = ease(seg(t, 0.68, 0.94));
      var sy = lerp(E, 1, tilt);
      set(waferFace, 'transform', sy < 1 ? 'translate(0 ' + r1(500 - 500 * sy) + ') scale(1 ' + Math.round(sy * 1000) / 1000 + ')' : '');
      set(waferFace, 'opacity', t >= 0.6 ? 1 : 0);
      var th = ING.slab * (1 - tilt), ery = r1(R * sy);
      set(ingot.rim, 'opacity', t >= 0.6 && th > 2 ? 1 : 0);
      set(ingot.rim, 'd', 'M' + (500 - R) + ' 500A' + R + ' ' + ery + ' 0 0 0 ' + (500 + R) + ' 500V' + r1(500 + th) + 'A' + R + ' ' + ery + ' 0 0 1 ' + (500 - R) + ' ' + r1(500 + th) + 'Z');
      // 曝光：die 一顆一顆亮起來，最後才是 macro 的影子和正中間的取景框
      wafer.tiles.forEach(function (tl) { set(tl.e, 'opacity', r1(seg(t, tl.at, tl.at + 0.03))); });
      set(wafer.sil, 'opacity', r1(seg(t, 0.9, 1)));
      set(wafer.slot, 'opacity', r1(seg(t, 0.94, 1)));
      set(die, 'opacity', t >= 0.95 ? 1 : 0);
    },
    floorplan: function (t) {
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
      // crystal 那段把它淡進來；這裡只在 floorplan 開始之後接手，倒著捲回去才不會蓋掉 crystal 設的值
      if (t > 0) set(wafer.slot, 'opacity', r1(1 - seg(t, 0.2, 0.36)));
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
      // 沿切割道切開，旁邊的 die 跟著退場
      wafer.saw.forEach(function (e, i) { var a = 0.2 + 0.08 * (i % 2); draw(e, ease(seg(t, a, a + 0.1))); });
      set(gWafer, 'opacity', r1(1 - seg(t, 0.32, 0.48)));
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
    hero: [],
    crystal: [[0.02, 1, 'pull_crystal -seed 2022 -method CZ'], [0.3, 0, '**INFO: <100> Si · 4 years grown'],
      [0.58, 1, 'wire_saw -slice 1 -thickness 775um'], [0.8, 1, 'litho -stepper -reticle ' + CHIP]],
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
  var LOG_LINES = small ? 3 : 4; // 上面還有 whoami，終端機只捲最後幾行
  function renderConsole(p) {
    var n = 0;
    while (n < log.length && log[n].at <= p) n++;
    if (n === shown) return;
    shown = n;
    var html = '';
    log.slice(Math.max(0, n - LOG_LINES), n).forEach(function (l, i, arr) {
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

  // ---- status / layer legend ----
  // 左上角只說現在做到哪一段：還沒開始是 Ready，tapeout 寫完 GDS 之後是 Taped out
  var names = cfg.names || {};
  var status = root.querySelector('.to-status');
  var statusN = root.querySelector('[data-status-n]');
  var statusName = root.querySelector('[data-status-name]');
  var layerEls = Array.prototype.slice.call(root.querySelectorAll('[data-layer]'));
  var statusKey = '';
  function renderChrome(p) {
    var active = -1;
    steps.forEach(function (k, i) { if (p > spans[k].start) active = i; });
    var done = localT('tapeout', p) >= 0.7;
    var state = active < 0 ? 'idle' : done ? 'done' : 'run';
    var key = state + active;
    if (key !== statusKey) {
      statusKey = key;
      status.setAttribute('data-state', state);
      statusN.textContent = pad(done ? steps.length : active + 1) + '/' + pad(steps.length);
      statusName.textContent = state === 'idle' ? 'Ready' : done ? 'Taped out' : names[steps[active]] || steps[active];
      // 換段的時候重播一次淡入
      statusName.classList.remove('is-new');
      void statusName.offsetWidth;
      statusName.classList.add('is-new');
    }
    var tr = localT('routing', p);
    LAYERS.forEach(function (L, i) {
      var li = layerEls[i];
      if (!li) return;
      li.classList.toggle('is-on', tr > 0 && (L.t || 0) > 0);
      li.classList.toggle('is-cur', tr > 0 && tr < 1 && (L.t || 0) > 0 && (L.t || 0) < 1);
    });
    root.classList.toggle('is-routing', tr > 0 && tr < 1);
    root.classList.toggle('is-done', localT('tapeout', p) >= 0.8);
    root.classList.toggle('is-end', p >= 0.98); // 跑完了，提示底下還有東西（.to-more）
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---- camera → viewBox ----
  // 晶圓跟著鏡頭換細節：拉近才看得到旁邊幾顆做完的樣子，晶片名稱在拉近之後收掉；干涉色跟著捲動滑過去
  function lod(w, near, far) { return clamp01((Math.log(far) - Math.log(w)) / (Math.log(far) - Math.log(near))); }
  function renderWafer(c, p) {
    set(wafer.label, 'opacity', r1(1 - lod(c.w, 3500, 6500)));
    set(wafer.detail, 'opacity', Math.round(0.55 * lod(c.w, 1700, 4800) * 100) / 100);
    var d = r1((p * 5 - 0.6) * WAFER_R * 0.5);
    set(wafer.sheen, 'gradientTransform', 'translate(' + d + ' ' + r1(d * 0.4) + ')');
  }
  var vbKey = '';
  function renderCamera(p) {
    var c = camera(p);
    renderWafer(c, p);
    var vb = viewBox(c);
    var key = [vb.x, vb.y, vb.w, vb.h].map(r1).join(' ');
    if (key === vbKey) return;
    vbKey = key;
    svg.setAttribute('viewBox', key);
  }

  // ---- bus：從亮起來的四根接腳往下，沿左邊的匯流排接到 §01–§04 的 kicker ----
  // §01 那條不停在 kicker：主幹繼續往下，在每一排專案卡上方分岔，插進卡片上排的一根接腳，
  // 接上卡片 floorplan 頂邊的入口 pad，再把卡片裡的 netlist 照資料流畫出來（板子走線 → 封裝接腳 → die）
  var wires = BUS_ORDER.map(function (key, j) {
    var sec = document.getElementById('sec-' + key);
    if (!sec) return null;
    return {
      key: key,
      sec: sec,
      kicker: sec.querySelector('.kicker'),
      lead: busLeads[key],
      j: j,
      e: el('path', { class: 'to-bus-wire' }, bus),
      kick: key === 'projects' ? el('path', { class: 'to-bus-wire' }, bus) : null,
      dot: el('circle', { r: 3, class: 'to-bus-dot', opacity: 0 }, bus)
    };
  }).filter(Boolean);
  var projSec = document.getElementById('sec-projects');
  var cards = projSec ? [].map.call(projSec.querySelectorAll('.chip-card'), function (card) {
    var fp = card.querySelector('.chip-art svg.floorplan');
    var stub = fp && fp.querySelector('.fp-in');
    return {
      card: card,
      link: card.querySelector('.chip-link'),
      art: card.querySelector('.chip-art'),
      fp: stub ? fp : null,
      stub: stub,
      x: stub ? parseFloat(stub.getAttribute('data-x')) : 0,
      net: stub && fp.querySelector('.fp-wire'),
      e: el('path', { class: 'to-bus-wire' }, bus),
      pin: el('rect', { class: 'to-bus-pin', width: 6, height: 7, opacity: 0 }, bus),
      via: el('circle', { r: 2.5, class: 'to-bus-dot', opacity: 0 }, bus)
    };
  }) : [];
  var rowEls = []; // 每一排卡片上方的那段橫向走線，和它在主幹上的 via
  function rowEl(i) {
    return rowEls[i] || (rowEls[i] = { e: el('path', { class: 'to-bus-wire' }, bus), via: el('circle', { r: 2.5, class: 'to-bus-dot', opacity: 0 }, bus) });
  }
  var kickVia = cards.length ? el('circle', { r: 2.5, class: 'to-bus-dot', opacity: 0 }, bus) : null;
  var FANOUT = 3; // 分岔之後的走線（含進到卡片裡）每捲 1 px 走 3 px，橫跨整排卡片才不會拖太久
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
  // 折線從起點量起只畫 len 長
  function cut(pts, len) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length && len > 0; i++) {
      var a = pts[i - 1], b = pts[i];
      var d = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
      var f = Math.min(1, len / (d || 1));
      out.push([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
      len -= d;
    }
    return out;
  }
  function polyline(pts) {
    return pts.length > 1 ? 'M' + pts.map(function (pt) { return r1(pt[0]) + ' ' + r1(pt[1]); }).join('L') : '';
  }
  function setStyle(e, k, v) {
    var key = '_tos_' + k;
    if (e[key] === v) return;
    e[key] = v;
    e.style[k] = v;
  }
  // 卡片在畫面上的位置；有 floorplan 的話入口就是那根 pad（用 svg 的 CTM 換算，不管 meet / slice 怎麼裁切）
  // 封裝接腳（.chip-link::before：left 22px 起，每 16px 一根 6px 寬）跟 die 上的 pad 不同格，
  // 走線先對準最近的那根接腳，進到封裝裡再橫移到 pad，像 bond wire
  function measureCard(c) {
    var lr = c.link.getBoundingClientRect(), ar = c.art.getBoundingClientRect();
    var m = { top: lr.top, cardTop: c.card.getBoundingClientRect().top, artH: ar.height };
    var ctm = c.fp && c.fp.getScreenCTM();
    if (ctm) {
      var sd = c.stub.getAttribute('d').match(/[\d.]+/g);
      m.pad = ctm.a * c.x + ctm.e;
      m.die = ctm.f;
      m.padTop = ctm.f + 4 * ctm.d;
      m.stubLen = Math.max(1, (parseFloat(sd[2]) - parseFloat(sd[1])) * ctm.d);
    } else {
      m.pad = ar.left + ar.width * 0.25;
      m.die = m.padTop = ar.top;
      m.stubLen = 0;
    }
    var x0 = lr.left + c.link.clientLeft + 22 + 3;
    var n = Math.floor((c.link.clientWidth - 44 - 6) / 16);
    m.pin = x0 + 16 * clamp(Math.round((m.pad - x0) / 16), 0, n);
    if (!ctm) m.pad = m.pin;
    return m;
  }
  function renderCard(c, a, m) {
    var wired = a >= 0;
    var stubK = m.stubLen ? clamp01(a / m.stubLen) : wired ? 1 : 0;
    var netK = clamp01((a - m.stubLen) / (m.artH * 1.5));
    c.card.classList.toggle('is-wired', wired);
    c.card.classList.toggle('is-fed', wired && stubK >= 1);
    c.card.classList.toggle('is-routed', wired && stubK >= 1 && netK >= 1);
    if (c.stub) setStyle(c.stub, 'strokeDashoffset', String(r1((1 - stubK) * 1000) / 1000));
    if (c.net) setStyle(c.net, 'strokeDashoffset', String(r1((1 - netK) * 1000) / 1000));
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
      var reach = Math.max(ly, window.innerHeight * 0.92 - rr.top);
      var head = k >= 1 && reduceMotion ? Infinity : ly + (reach - ly) * k;
      var done = head >= ky;
      var pts = [[lx, ly], [lx, jog], [bx, jog], [bx, ky], [contentLeft, ky]];
      if (w.kick) {
        var fan = renderFanout(rects.cards, bx, head, rr, done);
        if (fan > ky) {
          // 主幹接到最後一排的分岔點，kicker 改成 T 字分出去的一小段
          pts = [[lx, ly], [lx, jog], [bx, jog], [bx, fan]];
          set(w.kick, 'd', done ? line(bx, ky, contentLeft, ky) : '');
          set(kickVia, 'cx', r1(bx));
          set(kickVia, 'cy', r1(ky));
          set(kickVia, 'opacity', done ? 1 : 0);
        }
      }
      set(w.e, 'd', k > 0 ? polyline(truncate(pts, head)) : '');
      set(w.dot, 'cx', r1(contentLeft));
      set(w.dot, 'cy', r1(ky));
      set(w.dot, 'opacity', done ? 1 : 0);
      w.sec.classList.toggle('is-wired', done);
    });
  }
  // 專案卡依位置分排；每排在卡片上方從主幹分岔出一條橫線，再往下插進每張卡的入口。回傳最後一個分岔點的 y（沒有卡片就回傳 -Infinity）
  function renderFanout(ms, bx, head, rr, on) {
    var rows = [];
    cards.forEach(function (c, i) {
      var m = ms[i];
      var row = rows.filter(function (r) { return Math.abs(r.top - m.cardTop) < 40; })[0];
      if (!row) rows.push(row = { top: m.cardTop, items: [] });
      row.top = Math.min(row.top, m.cardTop);
      row.items.push({ c: c, m: m });
    });
    rows.sort(function (a, b) { return a.top - b.top; });
    var last = -Infinity;
    rows.forEach(function (row, ri) {
      var y = row.top - 12 - rr.top;
      last = y;
      row.items.sort(function (a, b) { return a.m.pin - b.m.pin; });
      var far = row.items[row.items.length - 1].m.pin - rr.left;
      var d = on ? (head - y) * FANOUT : -Infinity;
      var re = rowEl(ri);
      set(re.e, 'd', d > 0 ? polyline(cut([[bx, y], [far, y]], d)) : '');
      set(re.via, 'cx', r1(bx));
      set(re.via, 'cy', r1(y));
      set(re.via, 'opacity', d > 0 && ri < rows.length - 1 ? 1 : 0);
      row.items.forEach(function (it, ii) {
        var c = it.c, m = it.m;
        var px = m.pin - rr.left, pad = m.pad - rr.left, padTop = m.padTop - rr.top;
        var jogY = (m.die + m.padTop) / 2 - rr.top;
        var a0 = px - bx, drop = (jogY - y) + Math.abs(pad - px) + (padTop - jogY);
        var dd = d - a0;
        set(c.e, 'd', dd > 0 ? polyline(cut([[px, y], [px, jogY], [pad, jogY], [pad, padTop]], dd)) : '');
        set(c.via, 'cx', r1(px));
        set(c.via, 'cy', r1(y));
        set(c.via, 'opacity', dd > 0 && ii < row.items.length - 1 ? 1 : 0);
        var pinY = m.top - 8 - rr.top; // 卡片上排接腳（.chip-link::before）的頂端
        set(c.pin, 'x', r1(px - 3));
        set(c.pin, 'y', r1(pinY));
        set(c.pin, 'opacity', dd >= pinY - y ? 1 : 0);
        renderCard(c, dd - drop, m);
      });
    });
    for (var i = rows.length; i < rowEls.length; i++) { set(rowEls[i].e, 'd', ''); set(rowEls[i].via, 'opacity', 0); }
    return last;
  }

  // ---- 跑完之後的「往下捲」提示（.to-more）：跟著 .to-frame 的底邊中點走 ----
  var more = root.querySelector('.to-more');
  function renderMore(rects) {
    if (!more) return;
    setStyle(more, 'left', r1(rects.stage.left - rects.root.left + view.fx) + 'px');
    setStyle(more, 'top', r1(rects.stage.top - rects.root.top + view.fy + view.fh / 2) + 'px');
  }

  // ---- main loop ----
  var last = {};
  var hh = 64;
  function headerH() { return hh; }
  function measureHeader() { hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64; }
  measureHeader();
  measureView();

  function frame() {
    // 先讀版面，再一次寫回
    var rects = {
      root: root.getBoundingClientRect(),
      track: track.getBoundingClientRect(),
      stage: stage.getBoundingClientRect(),
      leads: wires.map(function (w) { return w.lead.getBoundingClientRect(); }),
      kickers: wires.map(function (w) { return w.kicker.getBoundingClientRect(); }),
      cards: cards.map(measureCard)
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
    renderCamera(p);
    renderConsole(p);
    renderMetrics(p);
    renderChrome(p);
    renderBus(seg(localT('tapeout', p), 0.8, 1), rects);
    renderMore(rects);
    autoplay.render(p);
  }

  var ticking = false;
  function request() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; frame(); });
  }

  // ---- autoplay：按一下就照固定速度把 p 從現在推到 1，用 window.scrollTo 帶著頁面捲，所以跟手動捲的畫面一模一樣 ----
  // 使用者一碰滾輪、觸控、按鍵，或捲動位置被別的東西改掉（拖捲軸、點錨點），就停下來交還給他
  var autoplay = (function () {
    var btn = root.querySelector('[data-to-play]');
    if (!btn || reduceMotion) return { render: function () {} };
    var name = btn.querySelector('[data-to-play-name]');
    var bit = btn.querySelector('[data-to-play-bit]');
    var FULL = 24000; // 從頭播到尾的毫秒數；改了要連 style.css .to-play-hint 的 24 s 和 index.ejs 的 aria-label 一起改
    var raf = 0, p0 = 0, t0 = 0, setY = 0, shown = '';
    function range() {
      var top = track.getBoundingClientRect().top + window.scrollY - headerH();
      return [top, track.offsetHeight - stage.offsetHeight];
    }
    function now() { var r = range(); return r[1] > 0 ? clamp01((window.scrollY - r[0]) / r[1]) : 1; }
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
      p0 = now();
      if (p0 >= 0.98) { p0 = 0; window.scrollTo(0, range()[0]); }
      setY = window.scrollY;
      t0 = 0;
      raf = requestAnimationFrame(tick);
      render(p0);
    }
    function stop() {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
      render(now());
    }
    function render(p) {
      var state = raf ? 'run' : p >= 0.98 ? 'done' : 'idle';
      if (raf) btn.style.setProperty('--to-play-p', String(Math.round(p * 1000) / 1000));
      if (state === shown) return;
      shown = state;
      btn.setAttribute('data-state', state);
      btn.setAttribute('aria-checked', String(state === 'run'));
      bit.textContent = state === 'run' ? '1' : '0';
      name.textContent = state === 'done' ? 'replay' : 'run';
    }
    btn.addEventListener('click', function () { if (raf) stop(); else start(); });
    function interrupt(e) { if (raf && !btn.contains(e.target)) stop(); }
    window.addEventListener('wheel', interrupt, { passive: true });
    window.addEventListener('touchstart', interrupt, { passive: true });
    window.addEventListener('pointerdown', interrupt);
    window.addEventListener('keydown', interrupt);
    return { render: render };
  })();

  root.classList.add(reduceMotion ? 'is-static' : 'is-live');
  heroFold.measure(); // .is-live 之後開場那一屏才排得出來
  function remeasure() { measureView(); heroFold.measure(); vbKey = ''; request(); }
  window.addEventListener('scroll', request, { passive: true });
  window.addEventListener('resize', function () { measureHeader(); remeasure(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(root);
  // 卡片的 .reveal 是 transform 動畫，停下來的時候不會觸發 scroll，要自己再對一次走線位置
  cards.forEach(function (c) { c.card.addEventListener('transitionend', request); });
  frame();
})();
