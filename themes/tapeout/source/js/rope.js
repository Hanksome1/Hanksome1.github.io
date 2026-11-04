// RoPE → MRoPE：所有數字從 Ideogram 4 的規格當場算出來（head_dim 256、base 5,000,000、mrope_section (24, 20, 20)）
var RP = (function () {
  'use strict';
  var D = 4608, HEADS = 18, HD = D / HEADS, PAIRS = HD / 2, BASE = 5e6, BASE0 = 1e4, LAYERS = 34;
  var SECTION = [24, 20, 20], OFFSET = 65536, GRID = 64, PATCH = 16, MAX_TEXT = 2048;
  function theta(i, base) { return Math.pow(base || BASE, -2 * i / HD); }
  // 每一對歸哪個軸：照 Ideogram4MRoPE.forward，前 3 × section 的範圍裡 h 取 1 mod 3、w 取 2 mod 3，其餘都留給 t
  var AXIS = [];
  for (var i = 0; i < PAIRS; i++) AXIS.push(0);
  [[1, 1], [2, 2]].forEach(function (a) { for (var j = a[1]; j < SECTION[a[0]] * 3; j += 3) AXIS[j] = a[0]; });
  var COUNT = [0, 0, 0];
  AXIS.forEach(function (a) { COUNT[a]++; });
  var MIXED = Math.max(SECTION[1], SECTION[2]) * 3; // 交錯排的範圍：前 60 對
  // q = k = 全 1 時的內積（除以對數）：128 對的 cos 平均
  function decay(dist, base) { var s = 0; for (var i = 0; i < PAIRS; i++) s += Math.cos(dist * theta(i, base)); return s / PAIRS; }
  // 畫圖用：距離在 [a, b] 之間的平均（cos 的積分有解析解），高頻的震盪才不會因為取樣變成鋸齒
  function decayAvg(a, b, base) {
    if (b - a < 1e-9) return decay(a, base);
    var s = 0;
    for (var i = 0; i < PAIRS; i++) { var th = theta(i, base); s += (Math.sin(b * th) - Math.sin(a * th)) / ((b - a) * th); }
    return s / PAIRS;
  }
  // 一層的參數：attention 4d²、MLP 3dh、調變 512 → 4d（有 bias）；線性層 FLOPs = 2 × 參數
  var layer = 3 * D * 12288 + 4 * D * D + 512 * 4 * D + 4 * D;
  return {
    D: D, HEADS: HEADS, HD: HD, PAIRS: PAIRS, BASE: BASE, BASE0: BASE0, LAYERS: LAYERS,
    SECTION: SECTION, OFFSET: OFFSET, GRID: GRID, PATCH: PATCH, MAX_TEXT: MAX_TEXT,
    AXIS: AXIS, COUNT: COUNT, MIXED: MIXED, theta: theta, decay: decay, decayAvg: decayAvg,
    flops: { rope: 2 * D * 3, linear: 2 * layer }, // RoPE：q、k 各 d 個元素，每個 2 乘 1 加
    SD: { grid: 192, d: 2432, patch: 16, table: 192 * 192 * 2432 }
  };
})();
(function () {
  'use strict';
  var root = document.querySelector('[data-rp]');
  if (!root || !window.RP || !window.Explainer) return;
  document.body.classList.add('is-rope');

  var CY = { intro: 0, absolute: 800, rotate: 1600, freqs: 2400, decay: 3200, raster: 4000, mrope: 4800, text: 5600, angle: 6400, ops: 7200, layer: 8000, cost: 8800 };
  var BEATS = [['intro', 1.4], ['absolute', 1.6], ['rotate', 2.4], ['freqs', 1.8], ['decay', 1.4], ['raster', 1.6], ['mrope', 2.4], ['text', 1.6], ['angle', 3.0], ['ops', 2.6], ['layer', 2.0], ['cost', 1.2]];
  var SHOTS = [['intro', 0, 500, 0, 1120], ['intro', 0.9, 500, 0, 1120]];
  BEATS.slice(1).forEach(function (b) { SHOTS.push([b[0], 0.12, 500, CY[b[0]], 1120], [b[0], 1, 500, CY[b[0]], 1120]); });

  Explainer.mount(root, {
    beats: BEATS,
    hold: 0.35,
    shots: SHOTS,
    narrowZoom: 0.97,
    build: build
  }, Explainer.scrollDriver({ track: '.rp-track', stage: '.rp-stage', panel: '.rp-panel', autoplayMs: 80000 }));

  function build(api) {
    var seg = api.seg, ease = api.ease, lerp = api.lerp, r1 = api.r1, el = api.el, T = api.T, set = api.set, show = api.show;
    var text = api.text, wire = api.wire, draw = api.draw, hide = api.hide, fmt = api.fmt, comma = api.comma, big = api.big, pct = api.pct;
    var region = api.region, live = api.live, rand = api.mulberry32(20241104);
    var TAU = Math.PI * 2;
    var W = {};

    function deg(a) { return fmt(((a * 180 / Math.PI) % 360 + 360) % 360, 0) + '°'; }
    function wave(i, base) { var w = TAU / RP.theta(i, base); return w < 100 ? fmt(w, 1) : big(w); }
    // 轉盤：一個圓 + 一根指針，指針角度從 12 點鐘方向順時針
    function Dial(g, x, y, r, cls) {
      var gg = el('g', { class: cls || '' }, g);
      el('circle', { cx: x, cy: y, r: r, class: 'dial' }, gg);
      el('line', { x1: x, y1: y - r, x2: x, y2: y - r + 6, class: 'tick' }, gg);
      var hand = el('line', { x1: x, y1: y, x2: x, y2: y - r + 4, class: 'hand' }, gg);
      el('circle', { cx: x, cy: y, r: 3, class: 'hub' }, gg);
      return {
        g: gg,
        set: function (a) { set(hand, 'x2', r1(x + Math.sin(a) * (r - 4))); set(hand, 'y2', r1(y - Math.cos(a) * (r - 4))); }
      };
    }
    function arrow(g, cls) {
      var gg = el('g', { class: cls }, g);
      return { g: gg, line: el('line', { class: 'vec' }, gg), head: el('circle', { r: 6, class: 'dot' }, gg) };
    }

    // ---- R0：attention 不知道誰在哪 ----
    var TOK = ['一', '隻', '橘', '貓', '坐', '在', '窗', '台'];
    var ORDER = [6, 7, 3, 4, 0, 5, 2, 1]; // 打亂之後，第 s 格放第 ORDER[s] 個 token：窗台貓坐一在橘隻
    var SLOT = []; ORDER.forEach(function (tok, s) { SLOT[tok] = s; });
    function slotX(s) { return 40 + s * 112; }
    (function () {
      var g = region({ cy: CY.intro });
      T(g, 0, -306, 'attention 的分數 = q · k：q、k 只從 token 的內容算出來', 't-b');
      W.toks = TOK.map(function (s, i) {
        var gg = hide(el('g', { class: i === 3 || i === 6 ? 'lane-b' : 'lane-c' }, g));
        el('rect', { x: 0, y: -224, width: 92, height: 56, rx: 4, class: i === 3 || i === 6 ? 'box is-on' : 'box' }, gg);
        T(gg, 46, -188, s, 't-tok mid');
        return gg;
      });
      W.slots = hide(el('g', {}, g));
      for (var s = 0; s < 8; s++) T(W.slots, slotX(s) + 46, -144, 'm = ' + s, 't-s mid');
      W.arc = el('path', { class: 'arc', opacity: 0 }, g);
      W.arcTx = hide(T(g, 0, 0, 'q·k = 1.37', 't-h mid'));
      W.readout = hide(el('g', {}, g));
      W.rdSent = T(W.readout, 0, -96, '', 't-d');
      W.rdDiff = T(W.readout, 0, -72, '', 't-d');
      W.rdNote = hide(T(g, 0, -40, '句子亂掉了，「貓」看「窗」的分數一模一樣：attention 看不出順序。', 't-h'));
      // 圖片：8 × 8 代表 64 × 64
      W.img = hide(el('g', {}, g));
      for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) {
        el('rect', { x: 40 + c * 28, y: 0 + r * 28, width: 26, height: 26, rx: 2, class: 'cell f-img', 'fill-opacity': r1(0.18 + 0.5 * rand()) }, W.img);
      }
      T(W.img, 40, 252, '（8 × 8 代表 64 × 64）', 't-s');
      T(W.img, 320, 40, '1024 × 1024 的圖，切成 16 × 16 px 的 patch', 't-b');
      T(W.img, 320, 70, '→ 64 × 64 = 4,096 個圖片 token', 't-l');
      T(W.img, 320, 110, '攤成一列送進 attention 之後，誰在左上角、', 't-d');
      T(W.img, 320, 134, '誰在右下角，q · k 一樣看不出來。', 't-d');
      T(W.img, 320, 186, '所以位置一定要另外告訴模型。', 't-h');
    })();

    // ---- R1：SD 3.5 在入口加一張 192 × 192 的表 ----
    var TB = { x: 600, y: 520, size: 360 };
    (function () {
      var g = region({ cy: CY.absolute }), y0 = CY.absolute;
      T(g, 0, y0 - 300, 'SD 3.5 Large：位置向量加在入口，只加一次', 't-b');
      // x + p = 輸入：三根 8 格的柱子
      var cols = [['x', '內容'], ['p', '位置'], ['x + p', '送進第 1 層']];
      var X = [0.9, -0.4, 0.2, 1.3, -1.1, 0.5, -0.7, 0.1];
      var Pv = X.map(function (_, k) { return k % 2 ? Math.cos(3 / Math.pow(4, k >> 1)) : Math.sin(3 / Math.pow(4, k >> 1)); });
      var vals = [X, Pv, X.map(function (v, k) { return v + Pv[k]; })];
      W.add = cols.map(function (cl, ci) {
        var gg = hide(el('g', { class: ci === 1 ? 'lane-a' : 'lane-c' }, g)), x = 20 + ci * 120;
        T(gg, x + 18, y0 - 250, cl[0], 't-l mid');
        vals[ci].forEach(function (v, k) {
          el('rect', { x: x, y: y0 - 232 + k * 24, width: 36, height: 22, rx: 2, class: 'cell ' + (v >= 0 ? 'f-p' : 'f-n'), 'fill-opacity': r1(Math.min(0.9, 0.15 + Math.abs(v) * 0.4)) }, gg);
        });
        T(gg, x + 18, y0 - 26, cl[1], 't-s mid');
        if (ci < 2) T(gg, x + 78, y0 - 128, ci ? '=' : '+', 't-op mid');
        return gg;
      });
      W.expand = hide(el('g', {}, g));
      T(W.expand, 0, y0 + 30, '(xₘ + pₘ)ᵀ W_qᵀ W_k (xₙ + pₙ)', 't-b');
      T(W.expand, 0, y0 + 58, '= 內容·內容 + 內容·位置 + 位置·內容 + 位置·位置', 't-d');
      T(W.expand, 0, y0 + 90, '位置混進內容裡，「相隔幾格」要模型自己', 't-d');
      T(W.expand, 0, y0 + 112, '從兩個絕對位置學出來。', 't-d');
      T(W.expand, 0, y0 + 160, '文字 token（CLIP、T5）在 DiT 裡完全沒有加位置。', 't-n');
      // 表：192 × 192，畫成 24 × 24 格的花紋
      W.table = hide(el('g', { class: 'lane-a' }, g));
      var n = 24, c = TB.size / n;
      for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
        var v = Math.sin(i * 0.55) * Math.cos(j * 0.4);
        el('rect', { x: r1(TB.x + j * c), y: r1(TB.y + i * c), width: r1(c), height: r1(c), class: 'cell ' + (v >= 0 ? 'f-ls' : 'f-n'), 'fill-opacity': r1(0.06 + 0.22 * Math.abs(v)) }, W.table);
      }
      el('rect', { x: TB.x, y: TB.y, width: TB.size, height: TB.size, class: 'frame' }, W.table);
      T(W.table, TB.x, TB.y - 14, '192 × 192 的 2D sincos 表 · 每格 2,432 維', 't-l');
      T(W.table, TB.x, TB.y + TB.size + 22, '存在 checkpoint 裡：' + comma(RP.SD.table) + ' 個數', 't-s');
      W.crop = el('rect', { class: 'crop', opacity: 0 }, g);
      W.cropTx = hide(T(g, 0, 0, '', 't-h mid'));
      W.cropPx = hide(T(g, TB.x + TB.size, TB.y + TB.size + 46, '', 't-big end'));
    })();

    // ---- R2：把 q、k 轉一個角度 ----
    var RO = { x: 290, y: CY.rotate + 10, r: 200, th: 0.45, a: 15 * Math.PI / 180, b: 60 * Math.PI / 180 };
    function polar(a, r) { return [RO.x + Math.sin(a) * r, RO.y - Math.cos(a) * r]; }
    (function () {
      var g = region({ cy: CY.rotate }), y0 = CY.rotate;
      T(g, 0, y0 - 290, '一對 = 平面上一個箭頭 · θ = 0.45 弧度 / 格（示意）', 't-b');
      el('circle', { cx: RO.x, cy: RO.y, r: RO.r, class: 'ring' }, g);
      el('line', { x1: RO.x - RO.r - 14, y1: RO.y, x2: RO.x + RO.r + 14, y2: RO.y, class: 'grid' }, g);
      el('line', { x1: RO.x, y1: RO.y - RO.r - 14, x2: RO.x, y2: RO.y + RO.r + 14, class: 'grid' }, g);
      W.ang = el('path', { class: 'ang', opacity: 0 }, g);
      W.q = arrow(g, 'lane-b'); W.k = arrow(g, 'lane-a');
      W.qTx = T(W.q.g, 0, 0, 'q', 't-l mid'); W.kTx = T(W.k.g, 0, 0, 'k', 't-l mid');
      hide(W.q.g); hide(W.k.g);
      // 位置數線
      W.line = hide(el('g', {}, g));
      for (var s = 0; s <= 11; s++) { el('line', { x1: 70 + s * 40, y1: y0 + 252, x2: 70 + s * 40, y2: y0 + 260, class: 'axis' }, W.line); T(W.line, 70 + s * 40, y0 + 280, String(s), 't-s mid'); }
      el('line', { x1: 70, y1: y0 + 256, x2: 510, y2: y0 + 256, class: 'axis' }, W.line);
      W.mDot = el('g', { class: 'lane-b' }, W.line); el('circle', { r: 7, class: 'dot' }, W.mDot); T(W.mDot, 0, -14, 'm', 't-l mid');
      W.nDot = el('g', { class: 'lane-a' }, W.line); el('circle', { r: 7, class: 'dot' }, W.nDot); T(W.nDot, 0, -14, 'n', 't-l mid');
      // 右邊的讀數
      var rx = 600;
      W.rd = hide(el('g', {}, g));
      W.rdQ = T(el('g', { class: 'lane-b' }, W.rd), rx, y0 - 220, '', 't-l');
      W.rdK = T(el('g', { class: 'lane-a' }, W.rd), rx, y0 - 190, '', 't-l');
      W.rdD = T(W.rd, rx, y0 - 150, '', 't-b');
      T(W.rd, rx, y0 - 110, 'q · k（兩個單位向量）', 't-d');
      W.rdDot = T(W.rd, rx, y0 - 72, '', 't-big');
      W.law = hide(el('g', {}, g));
      T(W.law, rx, y0 + 0, 'qₘ = R(mθ) q　　kₙ = R(nθ) k', 't-b');
      T(W.law, rx, y0 + 30, 'qₘᵀ kₙ = qᵀ R(mθ)ᵀ R(nθ) k = qᵀ R((n − m)θ) k', 't-b');
      T(W.law, rx, y0 + 62, '一起往後挪幾格，夾角不變：只剩 n − m。', 't-h');
      T(W.law, rx, y0 + 112, 'Ideogram 4 的寫法（逐元素，沒有矩陣）', 't-d');
      T(W.law, rx, y0 + 138, 'q·cos + rotate_half(q)·sin', 't-code');
      T(W.law, rx, y0 + 164, 'k·cos + rotate_half(k)·sin', 't-code');
      T(W.law, rx, y0 + 196, 'v 不轉。沒有任何參數。', 't-d');
    })();

    // ---- R3：128 對，128 種轉速 ----
    var FI = [0, 18, 36, 54, 72, 90, 108, 127];
    (function () {
      var g = region({ cy: CY.freqs }), y0 = CY.freqs;
      T(g, 0, y0 - 290, 'θᵢ = base^(−2i / 256) · 位置 m 的第 i 對轉 m · θᵢ', 't-b');
      W.pos = T(g, 1000, y0 - 286, '', 't-big end');
      T(g, 1000, y0 - 256, '位置 m', 't-s end');
      function row(base, y, cls, label) {
        var gg = el('g', { class: cls }, g);
        T(gg, 0, y - 64, label, 't-l');
        return FI.map(function (i, k) {
          var x = 60 + k * 126, d = Dial(gg, x, y, 40);
          T(gg, x, y + 62, '波長 ' + wave(i, base), 't-s mid');
          return { d: d, th: RP.theta(i, base) };
        });
      }
      FI.forEach(function (i, k) { T(g, 60 + k * 126, y0 - 196, 'i = ' + i, 't-s mid'); });
      W.rowA = row(RP.BASE0, y0 - 100, 'lane-a', 'base 10,000 · RoFormer 原本的設定');
      W.rowB = row(RP.BASE, y0 + 90, 'lane-b', 'base 5,000,000 · Ideogram 4');
      W.fNote = hide(el('g', {}, g));
      T(W.fNote, 0, y0 + 210, '← 高頻：轉得飛快，分得出隔壁的 token', 't-d');
      T(W.fNote, 1000, y0 + 210, '低頻：幾乎不動，分得出很遠的距離 →', 't-d end');
      T(W.fNote, 0, y0 + 250, '波長 = 轉一圈要幾個位置 = 2π / θᵢ。只畫 128 對裡的 8 對。', 't-s');
    })();

    // ---- R4：內積跟距離 ----
    var DC = { x0: 60, x1: 960, top: CY.decay - 210, bot: CY.decay + 170, lo: -0.3, hi: 1, dmax: 6 };
    function dx(d) { return DC.x0 + Math.log10(Math.max(1, d)) / DC.dmax * (DC.x1 - DC.x0); }
    function dy(v) { return DC.bot - (v - DC.lo) / (DC.hi - DC.lo) * (DC.bot - DC.top); }
    var BIN = Math.pow(10, 0.03);
    function smooth(d, base) { return RP.decayAvg(Math.max(0, d / BIN), d * BIN, base); }
    (function () {
      var g = region({ cy: CY.decay }), y0 = CY.decay;
      T(g, 0, y0 - 268, '內積 vs 相對距離 · q = k = 全 1 · 128 對的 cos 平均', 't-b');
      [1, 0.5, 0].forEach(function (v) { el('line', { x1: DC.x0, y1: dy(v), x2: DC.x1, y2: dy(v), class: v ? 'grid' : 'zero' }, g); T(g, DC.x0 - 8, dy(v) + 4, fmt(v, 1), 't-s end'); });
      ['1', '10', '100', '1K', '10K', '100K', '1M'].forEach(function (s, k) { T(g, dx(Math.pow(10, k)), DC.bot + 22, s, 't-s mid'); });
      T(g, DC.x1, DC.bot + 44, '相對距離 |n − m|（對數軸）', 't-s end');
      [[64, '一列 64 個 patch'], [4096, '4,096 個圖片 token'], [65536, '文字 → 圖片的 offset']].forEach(function (m, k) {
        var x = dx(m[0]);
        el('line', { x1: x, y1: DC.top - 10 - k * 16, x2: x, y2: DC.bot, class: 'lead' }, g);
        T(g, x + 4, DC.top - 14 - k * 16, m[1], 't-s');
      });
      function path(base) { var s = ''; for (var k = 0; k <= 480; k++) { var d = Math.pow(10, k / 480 * DC.dmax); s += (s ? 'L' : 'M') + r1(dx(d)) + ' ' + r1(dy(smooth(d, base))) + ' '; } return s; }
      W.cA = wire(el('g', { class: 'lane-a' }, g), path(RP.BASE0), 'curve');
      W.cB = wire(el('g', { class: 'lane-b' }, g), path(RP.BASE), 'curve');
      var lg = el('g', {}, g);
      T(el('g', { class: 'lane-a' }, lg), 700, y0 - 170, '— base 10,000', 't-l');
      T(el('g', { class: 'lane-b' }, lg), 700, y0 - 146, '— base 5,000,000 · Ideogram 4', 't-l');
      W.probe = hide(el('line', { y1: DC.top, y2: DC.bot, class: 'probe' }, g));
      W.pA = hide(el('circle', { r: 5, class: 'dot' }, el('g', { class: 'lane-a' }, g)));
      W.pB = hide(el('circle', { r: 5, class: 'dot' }, el('g', { class: 'lane-b' }, g)));
      W.dNote = hide(T(g, 0, y0 + 250, '每一點是附近 ±7% 距離的平均。這是示意：真正的 q、k 是學出來的，這條線只說明「越遠，各對角度越亂」。', 't-s'));
    })();

    // ---- R5：圖片攤成一列 ----
    var RG = { n: 8, c: 34, x: 60, y: CY.raster - 230, lc: 14, lx: 20, ly: CY.raster + 150 };
    var SPECIAL = { 27: 'is-p', 28: 'is-r', 35: 'is-d', 23: 'is-e', 24: 'is-e' }; // P = (3,3)、右鄰、下鄰、一列的尾和下一列的頭
    (function () {
      var g = region({ cy: CY.raster }), y0 = CY.raster;
      T(g, 0, y0 - 270, '圖片 token 排成一列：第 0 列從左到右，接著第 1 列……', 't-b');
      W.cells = [];
      for (var k = 0; k < RG.n * RG.n; k++) {
        W.cells.push(el('rect', { rx: 2, class: 'pix ' + (SPECIAL[k] || '') }, g));
      }
      W.gridTx = hide(el('g', {}, g));
      T(W.gridTx, 400, y0 - 200, '在圖上', 't-b');
      T(el('g', { class: 'lane-b' }, W.gridTx), 400, y0 - 170, '■ P = 第 3 列、第 3 行', 't-l');
      T(W.gridTx, 400, y0 - 144, '右鄰、下鄰：都只隔 1 格', 't-d');
      T(W.gridTx, 400, y0 - 118, '第 2 列最右邊 和 第 3 列最左邊：隔了整張寬', 't-d');
      W.arcs = [
        { a: 27, b: 28, tx: '1', y: 1 },
        { a: 27, b: 35, tx: '8（64 × 64 時是 64）', y: -1 },
        { a: 23, b: 24, tx: '1，但在圖上隔一整列', y: 1 }
      ].map(function (d) {
        var ax = RG.lx + d.a * RG.lc * 1.07 + RG.lc / 2, bx = RG.lx + d.b * RG.lc * 1.07 + RG.lc / 2, h = 26 + (d.b - d.a) * 7;
        var y = d.y < 0 ? RG.ly - 6 : RG.ly + RG.lc + 6, cy = y + d.y * h;
        var p = wire(g, 'M' + r1(ax) + ' ' + y + ' C' + r1(ax) + ' ' + cy + ' ' + r1(bx) + ' ' + cy + ' ' + r1(bx) + ' ' + y, 'arc');
        var t = hide(T(g, r1((ax + bx) / 2), r1(cy + d.y * (d.y < 0 ? 6 : 14)), d.tx, 't-h mid'));
        return { p: p, t: t };
      });
      W.rNote = hide(T(g, 0, y0 + 250, '1D 的位置把兩個方向混成一個數：要的是上下差幾列、左右差幾行，分開量。', 't-h'));
    })();
    function cellBox(k, f) {
      var r = Math.floor(k / RG.n), c = k % RG.n;
      var gx = RG.x + c * RG.c, gy = RG.y + r * RG.c, gs = RG.c - 3;
      var lx = RG.lx + k * RG.lc * 1.07, ly = RG.ly, ls = RG.lc;
      return [lerp(gx, lx, f), lerp(gy, ly, f), lerp(gs, ls, f)];
    }

    // ---- R6：MRoPE ----
    var MB = { x: 40, y: CY.mrope - 250, c: 7, h: 26 };
    var MG = { x: 40, y: CY.mrope - 80, c: 26 };
    var MD = [{ i: 0, x: 380 }, { i: 1, x: 540 }, { i: 2, x: 700 }];
    (function () {
      var g = region({ cy: CY.mrope }), y0 = CY.mrope;
      T(g, 0, y0 - 290, 'head_dim 256 = 128 對 · mrope_section = (24, 20, 20) · 交錯排', 't-b');
      W.bar = RP.AXIS.map(function (a, i) {
        return el('rect', { x: MB.x + i * MB.c, y: MB.y, width: MB.c - 1, height: MB.h, class: 'pair' }, g);
      });
      W.barLbl = hide(el('g', {}, g));
      var mx = MB.x + RP.MIXED * MB.c;
      T(W.barLbl, MB.x, MB.y + MB.h + 20, '0 · 高頻', 't-s');
      T(W.barLbl, MB.x + 128 * MB.c, MB.y + MB.h + 20, '127 · 低頻', 't-s end');
      el('path', { d: 'M' + MB.x + ' ' + (MB.y - 8) + ' V' + (MB.y - 14) + ' H' + (mx - 2) + ' V' + (MB.y - 8), class: 'lead' }, W.barLbl);
      el('path', { d: 'M' + mx + ' ' + (MB.y - 8) + ' V' + (MB.y - 14) + ' H' + (MB.x + 128 * MB.c - 1) + ' V' + (MB.y - 8), class: 'lead' }, W.barLbl);
      T(W.barLbl, (MB.x + mx) / 2, MB.y - 20, '前 ' + RP.MIXED + ' 對：t h w 輪流', 't-s mid');
      T(W.barLbl, (mx + MB.x + 128 * MB.c) / 2, MB.y - 20, '後 ' + (RP.PAIRS - RP.MIXED) + ' 對：全部 t', 't-s mid');
      W.legend = hide(el('g', {}, g));
      ['t', 'h', 'w'].forEach(function (s, a) {
        var gg = el('g', { class: 'ax-' + a }, W.legend), x = MB.x + a * 170;
        el('rect', { x: x, y: MB.y + 52, width: 14, height: 14, class: 'pair is-set' }, gg);
        T(gg, x + 22, MB.y + 64, s + ' · ' + RP.COUNT[a] + ' 對', 't-l');
      });
      T(W.legend, MB.x + 520, MB.y + 64, 'Qwen3-VL 一個 head 只有 64 對，(24, 20, 20) 剛好排滿', 't-s');
      // 下半：圖片 token 在網格上走，三個轉盤
      W.mGrid = hide(el('g', {}, g));
      for (var r = 0; r < 8; r++) for (var c = 0; c < 8; c++) el('rect', { x: MG.x + c * MG.c, y: MG.y + r * MG.c, width: MG.c - 2, height: MG.c - 2, rx: 2, class: 'cell f-img', 'fill-opacity': 0.22 }, W.mGrid);
      W.cursor = el('rect', { width: MG.c - 2, height: MG.c - 2, rx: 2, class: 'cursor' }, W.mGrid);
      T(W.mGrid, MG.x, MG.y + 8 * MG.c + 20, '一張圖：t 固定，(h, w) 是格子座標', 't-s');
      W.mPos = T(W.mGrid, 300, MG.y + 6, '', 't-b');
      W.dials = MD.map(function (m) {
        var a = RP.AXIS[m.i], d = Dial(W.mGrid, m.x + 20, MG.y + 110, 48, 'ax-' + a);
        T(d.g, m.x + 20, MG.y + 186, ['t', 'h', 'w'][a] + ' 組 · 第 ' + m.i + ' 對', 't-l mid');
        return { d: d, a: a, th: RP.theta(m.i), g: d.g };
      });
      W.mNote = T(W.mGrid, 820, MG.y + 100, '', 't-h');
      W.mNote2 = T(W.mGrid, 820, MG.y + 126, '', 't-d');
    })();
    // 游標路徑：先沿第 0 列往右，再沿第 7 行往下
    function cursorAt(t) {
      var a = seg(t, 0.44, 0.64), b = seg(t, 0.7, 0.9);
      return { h: 7 * b, w: 7 * a, moving: a > 0 && a < 1 ? 2 : b > 0 && b < 1 ? 1 : -1 };
    }

    // ---- R7：文字是 (n, n, n) ----
    var NT = 10, NI = 14, SQ = { x: 40, y: CY.text - 230, c: 34 };
    var NL = { y: CY.text + 210, a0: 40, a1: 340, b0: 600, b1: 960 };
    (function () {
      var g = region({ cy: CY.text }), y0 = CY.text;
      T(g, 0, y0 - 280, '同一個序列：[ 文字 token ][ 圖片 token ]', 't-b');
      W.seq = [];
      for (var k = 0; k < NT + NI; k++) {
        var x = SQ.x + k * SQ.c + (k >= NT ? 14 : 0), txt = k < NT;
        W.seq.push(el('rect', { x: x, y: SQ.y, width: SQ.c - 3, height: 30, rx: 2, class: 'cell ' + (txt ? 'f-txt' : 'f-img'), 'fill-opacity': txt ? 0.5 : 0.35, opacity: 0 }, g));
      }
      W.seqLbl = hide(el('g', {}, g));
      T(W.seqLbl, SQ.x, SQ.y + 52, '(0,0,0) (1,1,1) (2,2,2) …', 't-s');
      var ix = SQ.x + NT * SQ.c + 14;
      T(W.seqLbl, ix, SQ.y + 52, '(65536, 65536, 65536) (65536, 65536, 65537) …', 't-s');
      T(W.seqLbl, SQ.x, SQ.y - 10, '文字：位置 (n, n, n)', 't-l');
      T(el('g', { class: 'lane-a' }, W.seqLbl), ix, SQ.y - 10, '圖片：(0, h, w) + 65,536', 't-l');
      W.tCur = el('rect', { y: SQ.y - 3, width: SQ.c + 3, height: 36, rx: 3, class: 'cursor', opacity: 0 }, g);
      W.tDials = MD.map(function (m) {
        var a = RP.AXIS[m.i], d = Dial(g, m.x - 160, y0 - 20, 46, 'ax-' + a);
        T(d.g, m.x - 160, y0 + 50, ['t', 'h', 'w'][a] + ' 組 · 第 ' + m.i + ' 對', 't-l mid');
        hide(d.g);
        return { d: d, th: RP.theta(m.i), g: d.g };
      });
      W.tTx = hide(el('g', {}, g));
      W.tN = T(W.tTx, 640, y0 - 60, '', 't-b');
      T(W.tTx, 640, y0 - 30, '三組都轉 n · θᵢ：128 對全部照 n 轉，', 't-d');
      T(W.tTx, 640, y0 - 6, '跟原本的 1D RoPE 完全一樣。', 't-h');
      T(W.tTx, 640, y0 + 30, 'Qwen3-VL 讀文字時也是這樣排的。', 't-s');
      // 位置數線（中間斷開）
      W.nl = hide(el('g', {}, g));
      el('line', { x1: NL.a0, y1: NL.y, x2: NL.a1, y2: NL.y, class: 'axis' }, W.nl);
      el('line', { x1: NL.b0, y1: NL.y, x2: NL.b1, y2: NL.y, class: 'axis' }, W.nl);
      T(W.nl, (NL.a1 + NL.b0) / 2, NL.y + 5, '//', 't-d mid');
      el('rect', { x: NL.a0, y: NL.y - 10, width: NL.a1 - NL.a0, height: 20, class: 'cell f-txt', 'fill-opacity': 0.35 }, W.nl);
      el('rect', { x: NL.b0, y: NL.y - 10, width: 120, height: 20, class: 'cell f-img', 'fill-opacity': 0.5 }, W.nl);
      T(W.nl, NL.a0, NL.y + 32, '0', 't-s'); T(W.nl, NL.a1, NL.y + 32, comma(RP.MAX_TEXT) + '（max_text_tokens）', 't-s end');
      T(W.nl, NL.b0, NL.y + 32, comma(RP.OFFSET), 't-s'); T(W.nl, NL.b0 + 120, NL.y + 32, '+ 63', 't-s end');
      T(W.nl, NL.a0, NL.y - 24, '文字的位置', 't-s'); T(W.nl, NL.b0, NL.y - 24, '圖片的位置（IMAGE_POSITION_OFFSET 起算）', 't-s');
      T(W.nl, NL.a0, NL.y + 70, '兩段永遠不重疊。無條件那座塔只送圖片 token，位置一樣從 65,536 起算。', 't-d');
    })();

    // ---- R8：cos、sin 怎麼算出來：θᵢ = base^(−2i/d) → φᵢ = m · θᵢ → 單位圓上的 (x, y) ----
    // 跟下一站同一組示範數字：d = 8（4 對，第 j 維配第 j + 4 維），base = 100，位置 m = 2
    var OD = 8, OH = 4, OBASE = 100, OM = 2;
    var OEXP = [0, 1, 2, 3].map(function (i) { return -2 * i / OD; });
    var OTH = OEXP.map(function (e) { return Math.pow(OBASE, e); });
    var OPHI = OTH.map(function (th) { return OM * th; });
    var OCOS = OPHI.concat(OPHI).map(Math.cos), OSIN = OPHI.concat(OPHI).map(Math.sin);
    var AG = { x: 170, w: 100, gap: 108, ch: 32, cx: 812, cy: CY.angle - 110, r: 140, s0: 0.36, slot: 0.12 };
    function agX(i) { return AG.x + i * AG.gap; }
    function agPt(a, r) { return [AG.cx + Math.cos(a) * r, AG.cy - Math.sin(a) * r]; }
    function degs(a) { return fmt(a * 180 / Math.PI, 1) + '°'; }
    function agSlot(t) { var i = Math.max(0, Math.min(OH - 1, Math.floor((t - AG.s0) / AG.slot))); return { i: i, u: seg(t, AG.s0 + i * AG.slot, AG.s0 + (i + 1) * AG.slot) }; }
    (function () {
      var g = region({ cy: CY.angle }), y0 = CY.angle;
      T(g, 0, y0 - 300, 'cos、sin 怎麼來 · 8 維示範：4 對 · base = 100 · 位置 m = 2', 't-b');
      W.aCol = el('rect', { x: agX(0) - 6, y: y0 - 270, width: AG.w + 12, height: 280, rx: 4, class: 'box is-on', opacity: 0 }, el('g', { class: 'lane-b' }, g));
      W.aHead = hide(el('g', {}, g));
      for (var i = 0; i < OH; i++) {
        T(W.aHead, agX(i) + AG.w / 2, y0 - 250, 'i = ' + i, 't-l mid');
        T(W.aHead, agX(i) + AG.w / 2, y0 - 234, '第 ' + i + '、' + (i + OH) + ' 維', 't-s mid');
      }
      function row(y, label, sub, vals, strs, cls) {
        var gg = el('g', { class: cls || '' }, g), lab = hide(el('g', {}, gg));
        T(lab, 0, y + 15, label, 't-b'); if (sub) T(lab, 0, y + 31, sub, 't-s');
        var cells = vals.map(function (v, k) { var n = api.Num(gg, agX(k), y, AG.w, AG.ch); n.upd(v, strs[k], 1.2); return hide(n.g); });
        return { lab: lab, cells: cells };
      }
      function f3(v) { return fmt(v, 3); }
      W.aExp = row(y0 - 218, '−2i / d', '指數，d = 8', OEXP, ['0', '−0.25', '−0.5', '−0.75']);
      W.aTh = row(y0 - 174, 'θᵢ = 100^指數', '每走一格轉幾弧度', OTH, OTH.map(f3));
      W.aPhi = row(y0 - 130, 'φᵢ = m · θᵢ', 'm = 2 · 弧度', OPHI, OPHI.map(f3));
      W.aDeg = hide(el('g', {}, g));
      OPHI.forEach(function (a, k) { T(W.aDeg, agX(k) + AG.w / 2, y0 - 82, '= ' + degs(a), 't-s mid'); });
      W.aCos = row(y0 - 70, 'cos φᵢ', '圓上的 x', OCOS.slice(0, OH), OCOS.slice(0, OH).map(f3), 'lane-c');
      W.aSin = row(y0 - 26, 'sin φᵢ', '圓上的 y', OSIN.slice(0, OH), OSIN.slice(0, OH).map(f3), 'lane-a');
      // 右：半徑 1 的圓。角度從 x 軸正向逆時針量
      W.aCirc = hide(el('g', {}, g));
      T(W.aCirc, AG.cx, y0 - 276, '半徑 1 的圓 · 從 x 軸逆時針轉 φ', 't-s mid');
      el('circle', { cx: AG.cx, cy: AG.cy, r: AG.r, class: 'ring' }, W.aCirc);
      el('line', { x1: AG.cx - AG.r - 16, y1: AG.cy, x2: AG.cx + AG.r + 16, y2: AG.cy, class: 'grid' }, W.aCirc);
      el('line', { x1: AG.cx, y1: AG.cy + AG.r + 16, x2: AG.cx, y2: AG.cy - AG.r - 16, class: 'grid' }, W.aCirc);
      T(W.aCirc, AG.cx + AG.r + 22, AG.cy + 4, 'x', 't-s');
      T(W.aCirc, AG.cx + 8, AG.cy - AG.r - 8, 'y', 't-s');
      T(W.aCirc, AG.cx + AG.r + 4, AG.cy + 18, '1', 't-s');
      T(W.aCirc, AG.cx - AG.r - 4, AG.cy + 18, '−1', 't-s end');
      W.aWedge = el('path', { class: 'ang', opacity: 0 }, g);
      W.aTicks = [0, 1, 2].map(function (m) {
        var gg = hide(el('g', { class: 'lane-b' }, g));
        return { g: gg, c: el('circle', { r: 4, class: 'dot' }, gg), t: T(gg, 0, 0, 'm = ' + m, 't-s mid') };
      });
      var gc = el('g', { class: 'lane-c' }, g), gs = el('g', { class: 'lane-a' }, g);
      W.aCosL = el('line', { class: 'leg', opacity: 0 }, gc);
      W.aSinL = el('line', { class: 'leg', opacity: 0 }, gs);
      W.aCosTx = hide(T(gc, 0, 0, '', 't-l mid'));
      W.aSinTx = hide(T(gs, 0, 0, '', 't-l'));
      W.aVec = arrow(g, 'lane-b'); hide(W.aVec.g);
      W.aRd = hide(el('g', {}, g));
      W.aRd1 = T(W.aRd, 672, y0 + 74, '', 't-l');
      W.aRd2 = T(W.aRd, 672, y0 + 100, '', 't-d');
      // 下：前半、後半各放一份，就是下一站的 cos、sin 列
      var CX = function (j) { return 170 + j * 54 + (j >= OH ? 12 : 0); };
      W.aCopy = hide(el('g', {}, g));
      T(W.aCopy, 0, y0 + 46, '攤回 8 維', 't-b');
      T(W.aCopy, 0, y0 + 64, '前半、後半各一份', 't-s');
      [[OCOS, 'cos', 'lane-c', y0 + 32], [OSIN, 'sin', 'lane-a', y0 + 70]].forEach(function (r) {
        var gg = el('g', { class: r[2] }, W.aCopy);
        T(gg, CX(0) - 10, r[3] + 19, r[1], 't-s end');
        r[0].forEach(function (v, j) { var n = api.Num(gg, CX(j), r[3], 48, 28); n.upd(v, fmt(v, 2), 1.2); });
      });
      T(W.aCopy, CX(0), y0 + 118, 'j = 0…3', 't-s'); T(W.aCopy, CX(OH), y0 + 118, 'j = 4…7：跟前半同一組角度', 't-s');
      W.aNote = hide(el('g', {}, g));
      T(W.aNote, 0, y0 + 164, '程式裡：φ = pos ⊗ θ（外積：L 個位置 × 128 個 θ → L × 128 的角度表），再逐元素取 cos、sin，前後各接一份成 256 維。', 't-d');
      T(W.aNote, 0, y0 + 192, 'Ideogram 4：d = 256、base = 5,000,000 → θ₀ = 1、θ₁₂₇ ≈ ' + RP.theta(127).toExponential(1).replace('-', '−') + '；每一對的 m 換成它那一軸的位置（t、h 或 w）。', 't-d');
      T(W.aNote, 0, y0 + 224, '角度超過 2π 就是多繞幾圈，cos、sin 只看最後停在哪。全部由位置和公式決定，沒有學出來的參數。', 't-h');
    })();

    // ---- R9：實際怎麼算：rotate_half、逐元素乘加、等價的 256 × 256 矩陣 ----
    // 用 8 維示範（4 對，第 j 維配第 j + 4 維，跟 Ideogram 4 的 j 配 j + 128 同一種排法），位置 m = 2
    var OQ = [0.8, -0.5, 0.3, 1.1, 0.6, 0.9, -0.7, 0.2];
    var OROT = OQ.map(function (_, i) { return i < OH ? -OQ[i + OH] : OQ[i - OH]; });
    var OOUT = OQ.map(function (q, i) { return q * OCOS[i] + OROT[i] * OSIN[i]; });
    var OX = function (i) { return 130 + i * 52 + (i >= OH ? 14 : 0); };
    (function () {
      var g = region({ cy: CY.ops }), y0 = CY.ops, cw = 46, ch = 32;
      T(g, 0, y0 - 300, '一個 head 的 q：用 8 維示範 · 第 j 維配第 j + 4 維 · 位置 m = 2', 't-b');
      for (var i = 0; i < 8; i++) T(g, OX(i) + cw / 2, y0 - 266, 'j=' + i, 't-s mid');
      T(g, OX(0), y0 - 282, '前半', 't-s'); T(g, OX(OH), y0 - 282, '後半', 't-s');
      function row(y, label, sub, vals, cls) {
        var gg = hide(el('g', { class: cls || '' }, g));
        T(gg, 0, y + 15, label, 't-b'); if (sub) T(gg, 0, y + 33, sub, 't-s');
        vals.forEach(function (v, i) { var n = api.Num(gg, OX(i), y, cw, ch); n.upd(v, fmt(v, 2), 1.2); });
        return gg;
      }
      W.oq = row(y0 - 252, 'q', '', OQ);
      W.oswap = hide(el('g', {}, g));
      for (var j = 0; j < 8; j++) {
        var from = OX(j) + cw / 2, to = OX(j < OH ? j + OH : j - OH) + cw / 2;
        el('path', { d: 'M' + from + ' ' + (y0 - 218) + ' L' + to + ' ' + (y0 - 196), class: 'lead' }, W.oswap);
      }
      T(W.oswap, OX(7) + cw + 14, y0 - 202, '搬位置、前半取負：', 't-s');
      T(W.oswap, OX(7) + cw + 14, y0 - 186, '沒有乘法', 't-s');
      W.orot = row(y0 - 194, 'rotate_half(q)', '[−後半, 前半]', OROT);
      W.ocos = row(y0 - 132, 'cos φ', '上一站算好的', OCOS, 'lane-c');
      W.osin = row(y0 - 86, 'sin φ', '前半、後半各一份', OSIN, 'lane-c');
      W.oops = hide(el('g', {}, g));
      T(W.oops, OX(7) + cw + 14, y0 - 112, '逐元素：', 't-s');
      T(W.oops, OX(7) + cw + 14, y0 - 96, '同一格對同一格', 't-s');
      W.oout = row(y0 - 24, "q′", 'q⊙cos + rot⊙sin', OOUT, 'lane-b');
      W.oeq = hide(el('g', {}, g));
      T(W.oeq, 0, y0 + 46, "q′ⱼ     = qⱼ · cos φⱼ − qⱼ₊₄ · sin φⱼ", 't-b');
      T(W.oeq, 0, y0 + 72, "q′ⱼ₊₄ = qⱼ₊₄ · cos φⱼ + qⱼ · sin φⱼ", 't-b');
      T(W.oeq, 0, y0 + 102, '每一對 (qⱼ, qⱼ₊₄) 各自乘一個 2 × 2 旋轉矩陣', 't-d');
      T(W.oeq, 0, y0 + 126, '[cos φⱼ  −sin φⱼ ; sin φⱼ  cos φⱼ]，角度只跟這一對的 θⱼ 有關。', 't-d');
      T(W.oeq, 0, y0 + 168, 'Ideogram 4：256 維、第 j 維配第 j + 128 維，128 對各有自己的 φⱼ。', 't-h');
      T(W.oeq, 0, y0 + 194, 'k 用同一組 cos、sin 做一樣的事；v 不轉。', 't-d');
      // 右：等價的 256 × 256 矩陣，只有四條對角線不是 0
      var mx = 660, my = y0 - 250, ms = 300, hs = ms / 2;
      W.omat = hide(el('g', {}, g));
      T(W.omat, mx, my - 16, '等價的矩陣：q′ = R q · R 是 256 × 256', 't-b');
      el('rect', { x: mx, y: my, width: ms, height: ms, class: 'frame' }, W.omat);
      el('line', { x1: mx + hs, y1: my, x2: mx + hs, y2: my + ms, class: 'grid' }, W.omat);
      el('line', { x1: mx, y1: my + hs, x2: mx + ms, y2: my + hs, class: 'grid' }, W.omat);
      [[0, 0, 'cos', 'lane-c'], [1, 0, '−sin', 'lane-a'], [0, 1, 'sin', 'lane-a'], [1, 1, 'cos', 'lane-c']].forEach(function (q) {
        var x = mx + q[0] * hs, y = my + q[1] * hs, gg = el('g', { class: q[3] }, W.omat);
        el('line', { x1: x + 4, y1: y + 4, x2: x + hs - 4, y2: y + hs - 4, class: 'diag' }, gg);
        T(gg, x + hs - 10, y + 26, q[2], 't-l end');
      });
      T(W.omat, mx, my + ms + 24, 'R = [ C  −S ; S  C ]，C、S 是 128 × 128 的對角矩陣', 't-d');
      T(W.omat, mx, my + ms + 48, '65,536 格裡只有 512 格不是 0', 't-d');
      W.ocost = hide(el('g', {}, g));
      T(el('g', { class: 'lane-a' }, W.ocost), mx, my + ms + 88, '照矩陣乘：每個元素 2 × 256 = 512 FLOPs', 't-l');
      T(el('g', { class: 'lane-b' }, W.ocost), mx, my + ms + 114, '逐元素：每個元素 3 FLOPs', 't-l');
      T(W.ocost, mx, my + ms + 140, '（乘 cos、乘 sin、相加）', 't-s');
      T(W.ocost, mx, my + ms + 170, '所以程式裡從來不建 R。', 't-h');
    })();

    // ---- R10：一層 attention 裡的每一步：形狀與運算種類 ----
    var LT = 4096 + 512; // 例：4,096 個圖片 token + 512 個文字 token
    var LSTEPS = [
      ['QKV 投影', 'x · W_qkv', 'L×4608 → L×13824', 'mm', '矩陣乘法', big(2 * RP.D * 3 * RP.D)],
      ['拆成 18 個 head', 'reshape', '→ 3 × (L×18×256)', 'x', '重排', '0'],
      ['QK-RMSNorm', 'q / rms(q) ⊙ w', 'L×18×256', 'ew', '逐元素', '≈' + big(4 * 2 * RP.D)],
      ['角度 φ', 'pos ⊗ θ → cos, sin', '(t,h,w) → L×256', 'x', '外積', '每次 forward 一次'],
      ['RoPE 旋轉', 'q⊙cos + rotate_half(q)⊙sin', 'L×18×256', 'ew', '逐元素', big(RP.flops.rope)],
      ['分數', 'S = q′ k′ᵀ / √256', '每個 head：L×L', 'mm', '矩陣乘法', comma(2 * RP.HD * RP.HEADS) + '·L'],
      ['mask + softmax', 'softmax(S)', 'L×L', 'ew', '逐列', '—'],
      ['加權 v', 'P · v', 'L×L · L×256', 'mm', '矩陣乘法', comma(2 * RP.HD * RP.HEADS) + '·L'],
      ['輸出投影', 'o · W_o', 'L×4608 → L×4608', 'mm', '矩陣乘法', big(2 * RP.D * RP.D)]
    ];
    var LC = { mm: 'lane-a', ew: 'lane-b', x: 'lane-c' };
    (function () {
      var g = region({ cy: CY.layer }), y0 = CY.layer;
      T(g, 0, y0 - 300, '一層 attention · 每一步是哪一種運算 · FLOPs 是每個 token', 't-b');
      [['#', 0], ['步驟', 26], ['算式', 196], ['形狀', 470], ['運算', 712], ['FLOPs / token', 1000]].forEach(function (h) { T(g, h[1], y0 - 262, h[0], 't-s' + (h[1] === 1000 ? ' end' : '')); });
      el('line', { x1: 0, y1: y0 - 254, x2: 1000, y2: y0 - 254, class: 'axis' }, g);
      W.lrows = LSTEPS.map(function (r, i) {
        var y = y0 - 226 + i * 44, gg = hide(el('g', { class: LC[r[3]] }, g)), rope = i === 4;
        if (rope) el('rect', { x: -8, y: y - 24, width: 1016, height: 38, rx: 3, class: 'box is-on' }, gg);
        T(gg, 0, y, String(i + 1), 't-s');
        T(gg, 26, y, r[0], rope ? 't-l' : 't-b');
        T(gg, 196, y, r[1], 't-code');
        T(gg, 470, y, r[2], 't-d');
        el('rect', { x: 708, y: y - 15, width: r[4].length * 15 + 14, height: 22, rx: 11, class: 'badge' }, gg);
        T(gg, 715, y + 1, r[4], 't-l');
        T(gg, 1000, y, r[5], 't-b end');
        el('line', { x1: 0, y1: y + 16, x2: 1000, y2: y + 16, class: 'grid' }, gg);
        return gg;
      });
      W.lnote = hide(el('g', {}, g));
      var yn = y0 - 226 + 9 * 44 + 12;
      T(W.lnote, 0, yn, '矩陣乘法的每一格 = 一個 dot product：S 的第 (m, n) 格就是 q′ₘ · k′ₙ，256 個數相乘再加總。', 't-d');
      T(W.lnote, 0, yn + 26, '位置在第 5 步轉進 q、k，在第 6 步的 dot product 裡變成只剩 n − m。', 't-h');
      T(W.lnote, 0, yn + 52, '·L 是序列長度：例如 4,096 個圖片 token + 512 個文字 token，L = ' + comma(LT) + '，第 6 步是 ' + big(2 * RP.HD * RP.HEADS * LT) + ' / token。', 't-s');
    })();

    // ---- R8：成本 ----
    var CB = { x0: 280, x1: 960, lo: 3, hi: 9 };
    function cbx(v) { return CB.x0 + (Math.log10(v) - CB.lo) / (CB.hi - CB.lo) * (CB.x1 - CB.x0); }
    (function () {
      var g = region({ cy: CY.cost }), y0 = CY.cost;
      T(g, 0, y0 - 280, '每個 token、每一層 · FLOPs（對數軸）', 't-b');
      ['1K', '10K', '100K', '1M', '10M', '100M', '1B'].forEach(function (s, k) {
        var x = cbx(Math.pow(10, k + 3));
        el('line', { x1: x, y1: y0 - 250, x2: x, y2: y0 - 130, class: 'grid' }, g);
        T(g, x, y0 - 112, s, 't-s mid');
      });
      W.cBars = [['線性層（qkv、o、MLP、調變）', RP.flops.linear, 'lane-c'], ['RoPE（q、k 各轉一次）', RP.flops.rope, 'lane-b']].map(function (b, k) {
        var y = y0 - 236 + k * 56, gg = el('g', { class: b[2] }, g);
        T(gg, CB.x0 - 12, y + 22, b[0], 't-l end');
        var r = el('rect', { x: CB.x0, y: y, width: 0, height: 32, rx: 2, class: 'f-ls' }, gg);
        var v = hide(T(gg, 0, y + 22, comma(b[1]), 't-b'));
        return { r: r, v: v, w: cbx(b[1]) - CB.x0 };
      });
      W.cRatio = hide(T(g, CB.x0, y0 - 70, '差 ' + fmt(RP.flops.linear / RP.flops.rope, 0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' 倍：RoPE 佔 ' + pct(RP.flops.rope / (RP.flops.rope + RP.flops.linear), 4), 't-h'));
      // 對照：SD 3.5 vs Ideogram 4
      W.cmp = hide(el('g', {}, g));
      var a = el('g', { class: 'lane-a' }, W.cmp), b = el('g', { class: 'lane-b' }, W.cmp), y = y0 + 0;
      T(W.cmp, 0, y, '', 't-d');
      T(a, 280, y, 'SD 3.5 Large', 't-l'); T(b, 640, y, 'Ideogram 4', 't-l');
      [['位置存在哪', '192 × 192 × 2,432 的表', 'cos、sin 當場算'], ['要存的數', comma(RP.SD.table), '0'], ['加在哪', '入口，一次', '34 層的 q、k'], ['文字 token', '沒有位置', '(n, n, n)'], ['解析度上限', '192 × 16 = 3,072 px', '沒有表可以超出']].forEach(function (r, k) {
        var yy = y + 36 + k * 32;
        T(W.cmp, 0, yy, r[0], 't-d');
        T(a, 280, yy, r[1], 't-b'); T(b, 640, yy, r[2], 't-b');
        el('line', { x1: 0, y1: yy + 12, x2: 1000, y2: yy + 12, class: 'grid' }, W.cmp);
      });
      W.cNote = hide(T(g, 0, y0 + 240, '沒有表的上限，不代表什麼尺寸都畫得好：模型沒訓練過的解析度，是資料的問題。', 't-s'));
    })();

    // ================= 每一段的 renderer：只吃自己的 t =================
    var R = {
      intro: function (t) {
        var kIn = 0, sh = ease(seg(t, 0.4, 0.62));
        W.toks.forEach(function (gg, i) {
          show(gg, ease(seg(t, 0.02 + i * 0.02, 0.1 + i * 0.02)));
          set(gg, 'transform', 'translate(' + r1(lerp(slotX(i), slotX(SLOT[i]), sh)) + ' 0)');
        });
        show(W.slots, ease(seg(t, 0.12, 0.2)));
        var ka = ease(seg(t, 0.22, 0.3)), xa = lerp(slotX(3), slotX(SLOT[3]), sh) + 46, xb = lerp(slotX(6), slotX(SLOT[6]), sh) + 46;
        var top = -262 - Math.min(40, Math.abs(xb - xa) * 0.12);
        set(W.arc, 'd', 'M' + r1(xa) + ' -228 Q' + r1((xa + xb) / 2) + ' ' + r1(top) + ' ' + r1(xb) + ' -228');
        show(W.arc, ka);
        set(W.arcTx, 'x', r1((xa + xb) / 2)); set(W.arcTx, 'y', r1((top - 228) / 2 - 8)); show(W.arcTx, ka);
        show(W.readout, ka);
        var shuffled = sh > 0.5, m = shuffled ? SLOT[3] : 3, n = shuffled ? SLOT[6] : 6;
        text(W.rdSent, '句子：' + (shuffled ? ORDER.map(function (k) { return TOK[k]; }) : TOK).join(''));
        text(W.rdDiff, '貓在 m = ' + m + '，窗在 n = ' + n + '：相隔 ' + fmt(n - m, 0) + (shuffled ? '，q·k 還是 1.37' : '，q·k = 1.37'));
        show(W.rdNote, ease(seg(t, 0.62, 0.7)));
        show(W.img, ease(seg(t, 0.74, 0.86)));
        live.intro = [['句子', shuffled ? '打亂' : '原本', shuffled ? 'ng' : ''], ['貓 → 窗 的位置差', fmt(n - m, 0)], ['貓 → 窗 的 q·k', '1.37（示意）', 'hl'], ['圖片 token', '64 × 64 = 4,096'], ['head_dim', RP.HD + ' = ' + RP.PAIRS + ' 對']];
      },
      absolute: function (t) {
        W.add.forEach(function (gg, i) { show(gg, ease(seg(t, 0.04 + i * 0.08, 0.12 + i * 0.08))); });
        show(W.expand, ease(seg(t, 0.3, 0.4)));
        var kT = ease(seg(t, 0.42, 0.52));
        show(W.table, kT);
        var u = seg(t, 0.55, 0.95), gsz = Math.round(32 * Math.pow(2, 3 * u) / 4) * 4, over = gsz > RP.SD.grid;
        var s = gsz / RP.SD.grid * TB.size, cx = TB.x + TB.size / 2, cy = TB.y + TB.size / 2;
        set(W.crop, 'x', r1(cx - s / 2)); set(W.crop, 'y', r1(cy - s / 2)); set(W.crop, 'width', r1(s)); set(W.crop, 'height', r1(s));
        set(W.crop, 'class', 'crop' + (over ? ' is-over' : ''));
        show(W.crop, kT);
        text(W.cropTx, gsz + ' × ' + gsz + (over ? ' · 超出表' : ''));
        set(W.cropTx, 'x', cx); set(W.cropTx, 'y', r1(cy - s / 2 - 8 < TB.y - 30 ? cy - s / 2 - 8 : cy + 5));
        set(W.cropTx, 'class', over ? 't-x mid' : 't-h mid');
        show(W.cropTx, kT);
        text(W.cropPx, (gsz * RP.SD.patch) + ' px' + (over ? ' · assert 失敗' : ''));
        set(W.cropPx, 'class', 't-big end' + (over ? ' t-x' : ''));
        show(W.cropPx, kT);
        live.absolute = [['解析度', comma(gsz * RP.SD.patch) + ' px'], ['patch 網格', gsz + ' × ' + gsz], ['表', '192 × 192'], ['用到表的', over ? '—' : pct(gsz * gsz / (RP.SD.grid * RP.SD.grid), 0)], ['狀態', over ? 'assert 失敗' : '從中間裁', over ? 'ng' : 'hl']];
      },
      rotate: function (t) {
        var k0 = ease(seg(t, 0.04, 0.16)), kr = ease(seg(t, 0.22, 0.5)), ks = ease(seg(t, 0.56, 0.9));
        var m = 2 * kr + 5 * ks, n = 5 * kr + 5 * ks;
        var aq = RO.a + m * RO.th, ak = RO.b + n * RO.th;
        [[W.q, aq, W.qTx], [W.k, ak, W.kTx]].forEach(function (v) {
          var p = polar(v[1], RO.r * k0 + 1e-3), l = polar(v[1], RO.r + 22);
          set(v[0].line, 'x1', RO.x); set(v[0].line, 'y1', RO.y); set(v[0].line, 'x2', r1(p[0])); set(v[0].line, 'y2', r1(p[1]));
          set(v[0].head, 'cx', r1(p[0])); set(v[0].head, 'cy', r1(p[1]));
          set(v[2], 'x', r1(l[0])); set(v[2], 'y', r1(l[1] + 5));
          show(v[0].g, k0 > 0 ? 1 : 0);
        });
        var a0 = polar(aq, 70), a1 = polar(ak, 70), big1 = ((ak - aq) % TAU + TAU) % TAU > Math.PI ? 1 : 0;
        set(W.ang, 'd', 'M' + r1(RO.x) + ' ' + r1(RO.y) + ' L' + r1(a0[0]) + ' ' + r1(a0[1]) + ' A70 70 0 ' + big1 + ' 1 ' + r1(a1[0]) + ' ' + r1(a1[1]) + ' Z');
        show(W.ang, k0);
        show(W.line, k0);
        set(W.mDot, 'transform', 'translate(' + r1(70 + m * 40) + ' ' + (CY.rotate + 256) + ')');
        set(W.nDot, 'transform', 'translate(' + r1(70 + n * 40) + ' ' + (CY.rotate + 256) + ')');
        show(W.rd, k0);
        var dot = Math.cos(ak - aq);
        text(W.rdQ, 'q 在 m = ' + fmt(m, 1) + ' → 轉 ' + deg(m * RO.th));
        text(W.rdK, 'k 在 n = ' + fmt(n, 1) + ' → 轉 ' + deg(n * RO.th));
        text(W.rdD, 'n − m = ' + fmt(n - m, 1) + '　夾角 ' + deg(ak - aq));
        text(W.rdDot, fmt(dot, 3));
        show(W.law, ease(seg(t, 0.6, 0.72)));
        live.rotate = [['m', fmt(m, 1)], ['n', fmt(n, 1)], ['n − m', fmt(n - m, 1), 'hl'], ['夾角', deg(ak - aq)], ['q · k', fmt(dot, 3), 'hl']];
      },
      freqs: function (t) {
        var u = seg(t, 0.12, 0.9), pos = Math.round(Math.pow(10, 5 * u * u) - 1);
        text(W.pos, comma(pos));
        W.rowA.forEach(function (d) { d.d.set(pos * d.th); });
        W.rowB.forEach(function (d) { d.d.set(pos * d.th); });
        show(W.fNote, ease(seg(t, 0.5, 0.6)));
        var slowA = W.rowA[W.rowA.length - 1].th * pos, slowB = W.rowB[W.rowB.length - 1].th * pos;
        live.freqs = [['位置 m', comma(pos)], ['第 0 對轉了', fmt(pos / TAU, 1) + ' 圈'], ['第 127 對 · 1e4', fmt(slowA / TAU, 3) + ' 圈', 'ng'], ['第 127 對 · 5e6', fmt(slowB / TAU, 5) + ' 圈', 'hl'], ['最長波長 · 5e6', wave(127, RP.BASE), 'hl']];
      },
      decay: function (t) {
        draw(W.cA, ease(seg(t, 0.04, 0.34)));
        draw(W.cB, ease(seg(t, 0.2, 0.5)));
        var kp = seg(t, 0.58, 0.95), on = kp > 0;
        var d = Math.pow(10, kp * DC.dmax), va = smooth(d, RP.BASE0), vb = smooth(d, RP.BASE);
        set(W.probe, 'x1', r1(dx(d))); set(W.probe, 'x2', r1(dx(d))); show(W.probe, on ? 1 : 0);
        set(W.pA, 'cx', r1(dx(d))); set(W.pA, 'cy', r1(dy(va))); show(W.pA, on ? 1 : 0);
        set(W.pB, 'cx', r1(dx(d))); set(W.pB, 'cy', r1(dy(vb))); show(W.pB, on ? 1 : 0);
        show(W.dNote, ease(seg(t, 0.5, 0.58)));
        live.decay = on
          ? [['距離', comma(d)], ['base 10,000', fmt(va, 3), 'ng'], ['base 5,000,000', fmt(vb, 3), 'hl']]
          : [['距離 4,096 · 1e4', fmt(RP.decay(4096, RP.BASE0), 3), 'ng'], ['距離 4,096 · 5e6', fmt(RP.decay(4096, RP.BASE), 3), 'hl'], ['距離 65,536 · 1e4', fmt(RP.decay(65536, RP.BASE0), 3), 'ng'], ['距離 65,536 · 5e6', fmt(RP.decay(65536, RP.BASE), 3), 'hl']];
      },
      raster: function (t) {
        var kIn = ease(seg(t, 0.02, 0.14));
        W.cells.forEach(function (c, k) {
          var r = Math.floor(k / RG.n), f = ease(seg(t, 0.32 + r * 0.025, 0.46 + r * 0.025)), b = cellBox(k, f);
          set(c, 'x', r1(b[0])); set(c, 'y', r1(b[1])); set(c, 'width', r1(b[2])); set(c, 'height', r1(b[2]));
          show(c, kIn);
        });
        show(W.gridTx, ease(seg(t, 0.12, 0.2)) * (1 - ease(seg(t, 0.3, 0.36))));
        W.arcs.forEach(function (a, i) { var k = ease(seg(t, 0.68 + i * 0.07, 0.76 + i * 0.07)); draw(a.p, k); show(a.t, k > 0.9 ? 1 : 0); });
        show(W.rNote, ease(seg(t, 0.9, 0.97)));
        live.raster = [['右鄰', '1D 差 1'], ['下鄰', '1D 差 64', 'ng'], ['列尾 → 下一列頭', '1D 差 1', 'ng'], ['在圖上', '各差 1 格', 'hl']];
      },
      mrope: function (t) {
        var kb = seg(t, 0.04, 0.3);
        W.bar.forEach(function (r, i) { set(r, 'class', 'pair' + (i / RP.PAIRS < kb ? ' is-set ax-' + RP.AXIS[i] : '')); });
        show(W.barLbl, ease(seg(t, 0.28, 0.34)));
        show(W.legend, ease(seg(t, 0.32, 0.38)));
        show(W.mGrid, ease(seg(t, 0.36, 0.44)));
        var c = cursorAt(t), h = Math.round(c.h), w = Math.round(c.w);
        set(W.cursor, 'x', r1(MG.x + c.w * MG.c)); set(W.cursor, 'y', r1(MG.y + c.h * MG.c));
        text(W.mPos, '(t, h, w) = (65536, 65536 + ' + h + ', 65536 + ' + w + ')');
        var P = [RP.OFFSET, RP.OFFSET + c.h, RP.OFFSET + c.w];
        W.dials.forEach(function (d) { d.d.set(P[d.a] * d.th); set(d.g, 'class', 'ax-' + d.a + (d.a === c.moving ? ' is-hot' : '')); });
        text(W.mNote, c.moving === 2 ? '往右走：只有 w 組在轉' : c.moving === 1 ? '往下走：只有 h 組在轉' : t > 0.9 ? 't 組從頭到尾沒動過' : '');
        text(W.mNote2, c.moving > 0 ? 't 組不動（單張圖，t 固定）' : '');
        live.mrope = [['t 組', RP.COUNT[0] + ' 對'], ['h 組', RP.COUNT[1] + ' 對', 'hl'], ['w 組', RP.COUNT[2] + ' 對', 'ng'], ['h', String(h)], ['w', String(w)]];
      },
      text: function (t) {
        W.seq.forEach(function (r, k) { show(r, ease(seg(t, 0.02 + k * 0.006, 0.08 + k * 0.006))); });
        show(W.seqLbl, ease(seg(t, 0.12, 0.2)));
        var kd = ease(seg(t, 0.2, 0.28)), n = Math.min(NT - 1, Math.floor(seg(t, 0.28, 0.62) * NT));
        set(W.tCur, 'x', SQ.x + n * SQ.c - 3); show(W.tCur, kd);
        W.tDials.forEach(function (d) { show(d.g, kd); d.d.set(n * d.th); });
        show(W.tTx, kd);
        text(W.tN, '第 n = ' + n + ' 個文字 token → (' + n + ', ' + n + ', ' + n + ')');
        show(W.nl, ease(seg(t, 0.68, 0.78)));
        live.text = [['文字位置', '(' + n + ', ' + n + ', ' + n + ')'], ['= 1D RoPE', '128 對都轉 n', 'hl'], ['文字上限', comma(RP.MAX_TEXT)], ['圖片起點', comma(RP.OFFSET), 'ng'], ['SD 3.5 的文字', '沒有位置']];
      },
      angle: function (t) {
        show(W.aHead, ease(seg(t, 0.03, 0.08)));
        [[W.aExp, 0.06], [W.aTh, 0.15], [W.aPhi, 0.24]].forEach(function (r) {
          show(r[0].lab, ease(seg(t, r[1], r[1] + 0.04)));
          r[0].cells.forEach(function (c, k) { show(c, ease(seg(t, r[1] + 0.02 + k * 0.022, r[1] + 0.05 + k * 0.022))); });
        });
        show(W.aDeg, ease(seg(t, 0.32, 0.36)));
        show(W.aCirc, ease(seg(t, 0.3, 0.36)));
        show(W.aCos.lab, ease(seg(t, 0.33, 0.37))); show(W.aSin.lab, ease(seg(t, 0.33, 0.37)));
        var sl = agSlot(t), i = sl.i, u = sl.u, th = OTH[i], kin = ease(seg(t, 0.32, 0.36));
        var sw = ease(seg(u, 0.04, 0.5)), a = OPHI[i] * sw, m = OM * sw;
        set(W.aCol, 'x', agX(i) - 6); show(W.aCol, kin);
        var tip = agPt(a, AG.r), w0 = agPt(0, 44), w1 = agPt(a, 44);
        set(W.aVec.line, 'x1', AG.cx); set(W.aVec.line, 'y1', AG.cy); set(W.aVec.line, 'x2', r1(tip[0])); set(W.aVec.line, 'y2', r1(tip[1]));
        set(W.aVec.head, 'cx', r1(tip[0])); set(W.aVec.head, 'cy', r1(tip[1]));
        show(W.aVec.g, kin);
        set(W.aWedge, 'd', 'M' + AG.cx + ' ' + AG.cy + ' L' + r1(w0[0]) + ' ' + r1(w0[1]) + ' A44 44 0 ' + (a > Math.PI ? 1 : 0) + ' 0 ' + r1(w1[0]) + ' ' + r1(w1[1]) + ' Z');
        show(W.aWedge, kin * (a > 1e-3 ? 1 : 0));
        W.aTicks.forEach(function (k, mm) {
          var p = agPt(mm * th, AG.r), l = agPt(mm * th, AG.r + 20);
          set(k.c, 'cx', r1(p[0])); set(k.c, 'cy', r1(p[1]));
          set(k.t, 'x', r1(l[0])); set(k.t, 'y', r1(l[1] + 4));
          show(k.g, kin * (m >= mm - 0.02 ? 1 : 0.25));
          show(k.t, mm === OM || th > 0.25 ? 1 : 0);
        });
        var c = Math.cos(a), s = Math.sin(a), kc = ease(seg(u, 0.52, 0.66)), ks = ease(seg(u, 0.62, 0.76));
        var xe = AG.cx + AG.r * c * kc;
        set(W.aCosL, 'x1', AG.cx); set(W.aCosL, 'y1', AG.cy); set(W.aCosL, 'x2', r1(xe)); set(W.aCosL, 'y2', AG.cy); show(W.aCosL, kc > 0 ? 1 : 0);
        var xs = AG.cx + AG.r * c;
        set(W.aSinL, 'x1', r1(xs)); set(W.aSinL, 'y1', AG.cy); set(W.aSinL, 'x2', r1(xs)); set(W.aSinL, 'y2', r1(AG.cy - AG.r * s * ks)); show(W.aSinL, ks > 0 ? 1 : 0);
        text(W.aCosTx, 'cos = ' + fmt(c, 3)); set(W.aCosTx, 'x', r1(AG.cx + AG.r * c / 2)); set(W.aCosTx, 'y', AG.cy + 24); show(W.aCosTx, kc > 0.9 ? 1 : 0);
        text(W.aSinTx, 'sin = ' + fmt(s, 3));
        var flat = Math.abs(s) < 0.25, right = c >= 0 && !flat; // 角度很小時 sin 那一段幾乎是 0，標籤改放在箭頭左上方，才不會壓到 m 的刻度
        set(W.aSinTx, 'x', r1(xs + (right ? 10 : -10))); set(W.aSinTx, 'y', r1(flat ? AG.cy - AG.r * s - 16 : AG.cy - AG.r * s / 2 + 5));
        set(W.aSinTx, 'class', 't-l' + (right ? '' : ' end')); show(W.aSinTx, ks > 0.9 ? 1 : 0);
        [W.aCos, W.aSin].forEach(function (r) { r.cells.forEach(function (cc, k) { show(cc, k < i ? 1 : k > i ? 0 : ease(seg(u, 0.78, 0.9))); }); });
        show(W.aRd, kin);
        text(W.aRd1, '第 ' + i + ' 對：m 從 0 走到 ' + fmt(m, 2) + '，每格轉 θ' + '₀₁₂₃'[i] + ' = ' + fmt(th, 3));
        text(W.aRd2, 'φ = ' + fmt(m, 2) + ' × ' + fmt(th, 3) + ' = ' + fmt(a, 3) + ' 弧度 = ' + degs(a));
        show(W.aCopy, ease(seg(t, 0.86, 0.92)));
        show(W.aNote, ease(seg(t, 0.9, 0.96)));
        live.angle = [['第幾對', 'i = ' + i], ['θᵢ = 100^(−2i/8)', fmt(th, 3)], ['m', fmt(m, 2)], ['φ = m·θᵢ', fmt(a, 3) + ' rad · ' + degs(a), 'hl'], ['cos φ', fmt(c, 3)], ['sin φ', fmt(s, 3), 'ng']];
      },
      ops: function (t) {
        show(W.oq, ease(seg(t, 0.03, 0.1)));
        show(W.oswap, ease(seg(t, 0.13, 0.2)));
        show(W.orot, ease(seg(t, 0.18, 0.26)));
        show(W.ocos, ease(seg(t, 0.3, 0.37)));
        show(W.osin, ease(seg(t, 0.36, 0.43)));
        show(W.oops, ease(seg(t, 0.4, 0.46)));
        show(W.oout, ease(seg(t, 0.48, 0.56)));
        show(W.oeq, ease(seg(t, 0.58, 0.66)));
        show(W.omat, ease(seg(t, 0.7, 0.8)));
        show(W.ocost, ease(seg(t, 0.82, 0.9)));
        live.ops = [['q 的維度', '256 = 128 對'], ['配對', 'j ↔ j + 128'], ['rotate_half', '重排 + 取負'], ['旋轉', '逐元素乘、加', 'hl'], ['每元素 FLOPs', '3 vs 矩陣 512', 'hl']];
      },
      layer: function (t) {
        W.lrows.forEach(function (r, i) { show(r, ease(seg(t, 0.04 + i * 0.07, 0.12 + i * 0.07))); });
        show(W.lnote, ease(seg(t, 0.72, 0.82)));
        live.layer = [['矩陣乘法', 'QKV、S、P·v、W_o', 'ng'], ['逐元素', 'RMSNorm、RoPE', 'hl'], ['RoPE 在', 'QK-norm 之後、S 之前'], ['S 的每一格', 'dot product · 256 維']];
      },
      cost: function (t) {
        W.cBars.forEach(function (b, i) { var k = ease(seg(t, 0.04 + i * 0.12, 0.2 + i * 0.12)); set(b.r, 'width', r1(Math.max(0, b.w * k))); set(b.v, 'x', r1(CB.x0 + b.w * k + 10)); show(b.v, k > 0.9 ? 1 : 0); });
        show(W.cRatio, ease(seg(t, 0.36, 0.44)));
        show(W.cmp, ease(seg(t, 0.48, 0.62)));
        show(W.cNote, ease(seg(t, 0.8, 0.9)));
      }
    };

    var FACTS = {
      cost: [['RoPE / token / 層', comma(RP.flops.rope) + ' FLOPs', 'hl'], ['線性層 / token / 層', big(RP.flops.linear) + ' FLOPs'], ['RoPE 參數', '0', 'hl'], ['SD 3.5 位置表', big(RP.SD.table) + ' 個數', 'ng'], ['cos、sin', '每次 forward 一次 · 34 層共用']]
    };
    return { render: R, facts: FACTS };
  }
})();
