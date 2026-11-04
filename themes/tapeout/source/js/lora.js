// LoRA 圖解：所有數字都從一個「示意」的方陣（d = k = 4096）與常見設定（r、α、層數）當場算出來，不綁任何特定模型
var LR = (function () {
  'use strict';
  var D = 4096, K = 4096, R = 8, ALPHA = 16, L = 32, MATS = 2; // 示意：方形投影、每層對 q 與 v 做 LoRA
  var RSWEEP = [1, 2, 4, 8, 16, 32, 64];
  function full(d, k) { return d * k; }
  function lora(d, k, r) { return r * (d + k); }
  return {
    D: D, K: K, R: R, ALPHA: ALPHA, L: L, MATS: MATS, RSWEEP: RSWEEP,
    full: full, lora: lora
  };
})();
(function () {
  'use strict';
  var root = document.querySelector('[data-lr]');
  if (!root || !window.LR || !window.Explainer) return;
  document.body.classList.add('is-lora');

  Explainer.mount(root, {
    beats: [['intro', 1.5], ['full', 1.8], ['rank', 2.4], ['forward', 2.2], ['params', 2.0], ['model', 1.8], ['merge', 1.6]],
    hold: 0.35,
    // 每格 [beat, t, 中心 x, 中心 y, 寬]：同一個位置放兩格 = 鏡頭停住
    shots: [
      ['intro', 0, 500, -10, 1160], ['intro', 0.9, 500, -10, 1160],
      ['full', 0.12, 500, 34, 1320], ['full', 1, 500, 34, 1320],
      ['rank', 0.12, 500, 772, 1210], ['rank', 1, 500, 772, 1210],
      ['forward', 0.12, 470, 1500, 1220], ['forward', 1, 470, 1500, 1220],
      ['params', 0.12, 500, 2210, 1180], ['params', 1, 500, 2210, 1180],
      ['model', 0.12, 500, 2960, 1200], ['model', 1, 500, 2960, 1200],
      ['merge', 0.12, 500, 3700, 1210], ['merge', 1, 500, 3700, 1210]
    ],
    narrowZoom: 0.98,
    build: build
  }, Explainer.scrollDriver({ track: '.lr-track', stage: '.lr-stage', panel: '.lr-panel', autoplayMs: 46000 }));

  function build(api) {
    var seg = api.seg, ease = api.ease, lerp = api.lerp, r1 = api.r1, el = api.el, T = api.T, set = api.set, show = api.show;
    var text = api.text, wire = api.wire, draw = api.draw, hide = api.hide, fmt = api.fmt, comma = api.comma, big = api.big, pct = api.pct;
    var region = api.region, live = api.live, clamp01 = api.clamp01;

    var D = LR.D, K = LR.K, R = LR.R, ALPHA = LR.ALPHA, L = LR.L, RSWEEP = LR.RSWEEP;
    var full = LR.full, lora = LR.lora;
    var CELL = 12, CW = 16, RW = 12, RV = 3;          // 16 欄代表 k、12 列代表 d、瓶頸畫 RV 條代表 r
    var GW = CW * CELL, GH = RW * CELL;

    // 畫一個矩陣格子：cols × rows 個 cell
    function grid(parent, x0, y0, cols, rows, cls) {
      var g = el('g', {}, parent), cells = [];
      for (var i = 0; i < rows; i++) for (var j = 0; j < cols; j++)
        cells.push(el('rect', { x: r1(x0 + j * CELL), y: r1(y0 + i * CELL), width: CELL, height: CELL, class: cls || 'cell fz' }, g));
      return { g: g, cells: cells, x: x0, y: y0, w: cols * CELL, h: rows * CELL };
    }

    var W = {};

    // ================= Region A（cy 0）：一個權重矩陣（intro）+ 全量微調（full）=================
    (function () {
      var g = region({ cy: 0 });

      // attention 區塊簡圖
      var blk = W.blk = hide(el('g', {}, g));
      el('rect', { x: 322, y: -274, width: 356, height: 94, rx: 8, class: 'card' }, blk);
      T(blk, 338, -252, 'Transformer 層 · Attention', 't-s');
      ['W_q', 'W_k', 'W_v', 'W_o'].forEach(function (s, i) {
        var x = 336 + i * 86, on = i === 2;
        el('rect', { x: x, y: -238, width: 72, height: 32, rx: 4, class: on ? 'box is-on' : 'box' }, blk);
        T(blk, x + 36, -217, s, (on ? 't-h' : 't-b') + ' mid');
      });
      el('path', { d: 'M544 -206 V-152 H500 V-12', class: 'wire' }, blk);

      // 任務副本（全量微調：每個任務一份）—畫在 W 後面，露出右上角
      W.taskCopies = [1, 2].map(function (k) {
        return hide(el('rect', { x: 404 + k * 15, y: -6 - k * 15, width: GW, height: GH, rx: 2, class: 'f-off' }, g));
      });

      // 主角：W（d×k）
      W.wgrid = grid(g, 404, -6, CW, RW, 'cell fz');
      hide(W.wgrid.g);
      var lab = W.wlabel = hide(el('g', {}, g));
      T(lab, 392, 70, 'd', 't-b end');
      T(lab, 500, GH + 20, 'k', 't-b mid');
      T(lab, 612, 46, 'W', 't-b');
      T(lab, 612, 66, '權重矩陣', 't-s');
      W.pcount = hide(T(g, 404, 198, '', 't-d'));

      // 全量微調：optimizer 要存的量（權重 + 梯度 + Adam m、v）
      W.memTitle = hide(T(g, 624, 2, '全量微調要存的（權重 + 梯度 + Adam m、v）', 't-s'));
      W.memSegs = ['權重', '梯度', 'm', 'v'].map(function (lb, i) {
        var gg = hide(el('g', { class: 'lane-a' }, g));
        el('rect', { x: 624 + i * 70, y: 16, width: 62, height: 32, rx: 2, class: 'f-l' }, gg);
        T(gg, 624 + i * 70 + 31, 37, lb, 't-l mid');
        return gg;
      });
      W.memBig = hide(T(g, 624, 80, '記憶體 ≈ 4 × 可訓練量', 't-h'));
      W.taskCap = hide(T(g, 404, 222, '每個下游任務都要另存一整份 W′', 't-d'));
    })();

    // ================= Region B（cy 760）：低秩分解 ΔW = BA =================
    (function () {
      var g = region({ cy: 760 });
      // 凍結的 W：一個實心灰盒
      var fz = W.frzGroup = hide(el('g', {}, g));
      el('rect', { x: 150, y: 702, width: GW, height: GH, rx: 3, class: 'box' }, fz);
      el('rect', { x: 150, y: 702, width: GW, height: GH, rx: 3, class: 'fz', 'fill-opacity': 0.9 }, fz);
      T(fz, 150 + GW / 2, 702 + GH / 2 + 5, 'W', 't-b mid');
      T(fz, 150, 692, 'W（凍結 · 不更新）', 't-n');
      // 小鎖
      el('rect', { x: 150 + GW - 20, y: 712, width: 14, height: 11, rx: 2, class: 'frame' }, fz);
      el('path', { d: 'M' + (150 + GW - 16.5) + ' 712 v-4 a3.5 3.5 0 0 1 7 0 v4', class: 'wire' }, fz);
      T(fz, 358, 772, '+', 't-big mid');

      // B · A → ΔW
      var cl = W.baGroup = hide(el('g', { class: 'lane-b' }, g));
      W.A = grid(cl, 560, 658, CW, RV, 'cell fz');     // r × k（上）
      W.B = grid(cl, 498, 720, RV, RW, 'cell fz');     // d × r（左）
      W.dw = grid(cl, 560, 720, CW, RW, 'cell fz');    // d × k（右下，被重建）
      T(cl, 560 + GW / 2, 650, 'A · r × k', 't-l mid');
      T(cl, 490, 724, 'B', 't-l end');
      T(cl, 490, 742, 'd×r', 't-s end');
      W.dwLabel = hide(T(cl, 560 + GW / 2, 884, 'ΔW ≈ B · A · d × k', 't-b mid'));

      // 右側文字面板
      var pn = W.rankPanel = hide(el('g', {}, g));
      T(pn, 792, 700, '只學 B 和 A', 't-h');
      var lb = el('g', { class: 'lane-b' }, pn);
      T(lb, 792, 726, 'B：d × r', 't-l');
      T(lb, 792, 746, 'A：r × k', 't-l');
      T(pn, 792, 776, 'rank(ΔW) ≤ r', 't-b');
      W.rk = T(pn, 792, 798, '', 't-d');
    })();

    // ================= Region C（cy 1480）：前向傳播 =================
    (function () {
      var g = region({ cy: 1480 });
      var base = W.fwdBase = hide(el('g', {}, g));
      // 輸入 x
      el('rect', { x: 150, y: 1450, width: 22, height: 90, rx: 2, class: 'f-n' }, base);
      T(base, 161, 1440, 'x', 't-b mid');
      T(base, 161, 1556, 'k 維', 't-s mid');
      // 上路：凍結 W
      el('rect', { x: 262, y: 1430, width: 112, height: 50, rx: 6, class: 'box' }, base);
      T(base, 318, 1452, 'W（凍結）', 't-n mid');
      T(base, 318, 1470, 'd × k', 't-s mid');
      // 下路：A → a → B → ×α/r
      var lb = el('g', { class: 'lane-b' }, base);
      el('rect', { x: 250, y: 1540, width: 86, height: 40, rx: 6, class: 'box is-on' }, lb);
      T(lb, 293, 1560, 'A', 't-l mid'); T(lb, 293, 1575, 'r×k', 't-s mid');
      W.aVec = el('rect', { x: 356, y: 1546, width: 16, height: 28, rx: 2, class: 'f-p' }, lb);
      T(lb, 364, 1596, 'a · r 維', 't-h mid');
      el('rect', { x: 408, y: 1540, width: 86, height: 40, rx: 6, class: 'box is-on' }, lb);
      T(lb, 451, 1560, 'B', 't-l mid'); T(lb, 451, 1575, 'd×r', 't-s mid');
      el('circle', { cx: 540, cy: 1560, r: 18, class: 'box is-on' }, lb);
      T(lb, 540, 1565, '×α/r', 't-l mid');
      // 匯流 ⊕ → h
      el('circle', { cx: 648, cy: 1480, r: 20, class: 'box' }, base);
      T(base, 648, 1487, '+', 't-big mid');
      el('rect', { x: 724, y: 1450, width: 22, height: 90, rx: 2, class: 'f-p' }, base);
      T(base, 735, 1440, 'h', 't-b mid');

      // 可畫的連線（依序亮）
      W.w = {
        xtop: wire(g, 'M172 1465 H258', 'wire'),
        wsum: wire(g, 'M374 1455 H612 V1466', 'wire'),
        xbot: wire(g, 'M172 1525 H214 V1560 H246', 'wire'),
        ab: wire(g, 'M336 1560 H352', 'wire'),
        bB: wire(g, 'M372 1560 H404', 'wire'),
        bsc: wire(g, 'M494 1560 H518', 'wire'),
        scsum: wire(g, 'M562 1560 H612 V1496', 'wire'),
        sumh: wire(g, 'M668 1480 H720', 'wire')
      };
      W.fwdEq = hide(el('g', {}, g));
      T(W.fwdEq, 150, 1648, 'h = Wx + (α/r) · B(Ax)', 't-b');
      T(W.fwdEq, 150, 1672, 'B 初始化為 0 → 一開始 ΔW = 0，模型跟微調前一樣', 't-d');
    })();

    // ================= Region D（cy 2220）：可訓練參數對比（對數軸）=================
    var LG = { x0: 196, dec: 106, lo: 3 };
    function lx(v) { return LG.x0 + (Math.log10(v) - LG.lo) * LG.dec; }
    (function () {
      var g = region({ cy: 2220 });
      T(g, 100, 2056, '可訓練參數 · 一個 d × k 矩陣（示意 d = k = 4096）', 't-b');
      T(g, 100, 2078, '對數軸：每一格差 10 倍', 't-d');
      var ay = 2176;
      W.pAxis = hide(el('g', {}, g));
      el('line', { x1: LG.x0, y1: ay, x2: lx(1e8), y2: ay, class: 'axis' }, W.pAxis);
      ['1K', '10K', '100K', '1M', '10M', '100M'].forEach(function (s, i) {
        var x = LG.x0 + i * LG.dec;
        el('line', { x1: x, y1: 2096, x2: x, y2: ay, class: 'grid' }, W.pAxis);
        T(W.pAxis, x, ay + 18, s, 't-s mid');
      });
      // 全量
      var la = el('g', { class: 'lane-a' }, g);
      T(la, LG.x0 - 10, 2118, '全量', 't-l end');
      W.pFull = el('rect', { x: LG.x0, y: 2104, width: 0, height: 26, class: 'f-ls' }, la);
      W.pFullLbl = hide(T(g, lx(full(D, K)) + 8, 2122, big(full(D, K)) + ' = d·k', 't-n'));
      // LoRA
      var lbn = el('g', { class: 'lane-b' }, g);
      T(lbn, LG.x0 - 10, 2152, 'LoRA', 't-l end');
      W.pLora = el('rect', { x: LG.x0, y: 2138, width: 0, height: 26, class: 'f-ls' }, lbn);
      W.pLoraLbl = hide(T(g, LG.x0, 2156, '', 't-h'));
      // 比值大字 + r 刻度
      W.ratioBig = T(g, 410, 2252, '', 't-big');
      T(g, 410, 2282, 'r（秩）：掃過 1 → 64，停在 8', 't-d');
      W.rTicks = RSWEEP.map(function (rv, i) {
        return T(g, 410 + i * 34, 2302, String(rv), 't-s');
      });
    })();

    // ================= Region E（cy 2960）：放大到整個模型 =================
    var ST = { x: 120, w: 300, h: 7, gap: 2, bottom: 3230 };
    (function () {
      var g = region({ cy: 2960 });
      W.mTitle = hide(T(g, 100, 2716, '放大到整個模型（示意：d = 4096、32 層、只對每層的 q、v）', 't-b'));
      var st = W.stackG = hide(el('g', {}, g));
      // 圖例
      el('rect', { x: 120, y: 2738, width: 14, height: 10, class: 'slab s-base' }, st); T(st, 140, 2747, '凍結的層', 't-s');
      el('rect', { x: 230, y: 2738, width: 14, height: 10, class: 'slab s-lora is-on' }, st); T(st, 250, 2747, 'q、v 的 LoRA adapter', 't-s');
      W.adapters = [];
      for (var i = 0; i < L; i++) {
        var y = ST.bottom - (i + 1) * (ST.h + ST.gap);
        el('rect', { x: ST.x, y: y, width: ST.w, height: ST.h, class: 'slab s-base' }, st);
        var q = el('rect', { x: ST.x + ST.w + 8, y: y, width: 12, height: ST.h, class: 'slab s-lora' }, st);
        var v = el('rect', { x: ST.x + ST.w + 24, y: y, width: 12, height: ST.h, class: 'slab s-lora' }, st);
        W.adapters.push([q, v]);
      }
      T(st, ST.x - 10, ST.bottom - 2, '1', 't-s end');
      T(st, ST.x - 10, ST.bottom - L * (ST.h + ST.gap) + 8, String(L), 't-s end');

      var cn = W.counters = hide(el('g', {}, g));
      T(cn, 540, 2792, '全量微調 · 可訓練參數', 't-d'); W.cFull = T(cn, 540, 2828, '', 't-big');
      T(cn, 540, 2876, 'LoRA（r = 8）· 可訓練參數', 't-d'); W.cLora = T(cn, 540, 2912, '', 't-big');
      T(cn, 540, 2960, 'LoRA adapter 檔案（bf16）', 't-d'); W.cSize = T(cn, 540, 2996, '', 't-big');
      W.cNote = hide(T(g, 540, 3040, '全量微調則要另存一整份模型權重（幾 GB）', 't-d'));
    })();

    // ================= Region F（cy 3700）：合併 / 熱插拔 =================
    (function () {
      var g = region({ cy: 3700 });
      // Part 1：折回去
      var p1 = W.foldG = hide(el('g', {}, g));
      function mbox(x, cls, label, sub) {
        var gg = el('g', { class: cls === 'lane-b' ? 'lane-b' : 'lane-a' }, p1);
        el('rect', { x: x, y: 3560, width: 96, height: 72, rx: 4, class: cls === 'frozen' ? 'box' : 'box is-on' }, gg);
        if (cls === 'frozen') el('rect', { x: x, y: 3560, width: 96, height: 72, rx: 4, class: 'fz', 'fill-opacity': 0.8 }, gg);
        T(gg, x + 48, 3600, label, (cls === 'lane-b' ? 't-l' : cls === 'frozen' ? 't-n' : 't-b') + ' mid');
        if (sub) T(gg, x + 48, 3620, sub, 't-s mid');
        return gg;
      }
      mbox(120, 'frozen', 'W', 'd×k');
      W.mPlus = T(p1, 236, 3600, '+', 't-big mid');
      mbox(262, 'lane-b', '(α/r)BA', 'd×k');
      W.mArrow = hide(T(p1, 390, 3600, '→', 't-big mid'));
      W.mWp = hide(mbox(424, 'merged', 'W′', 'd×k'));
      W.mergeCap = hide(el('g', {}, g));
      T(W.mergeCap, 560, 3584, 'W′ = W + (α/r)·BA', 't-b');
      T(W.mergeCap, 560, 3606, '又是一個 d × k 矩陣', 't-d');
      T(W.mergeCap, 560, 3634, '推論零額外延遲、零額外參數', 't-h');

      // Part 2：熱插拔
      var base = W.base = hide(el('g', {}, g));
      el('rect', { x: 120, y: 3730, width: 150, height: 66, rx: 6, class: 'box' }, base);
      el('rect', { x: 120, y: 3730, width: 150, height: 66, rx: 6, class: 'fz', 'fill-opacity': 0.8 }, base);
      T(base, 195, 3758, '凍結底座', 't-n mid');
      T(base, 195, 3778, '整個大模型', 't-s mid');
      var chipTxt = [['風格 A', '~8 MB'], ['任務 B', '~8 MB'], ['語言 C', '~8 MB'], ['…', '']];
      W.chips = chipTxt.map(function (c, i) {
        var gg = hide(el('g', { class: 'lane-b' }, g)), x = 320, y = 3722 + i * 24;
        el('path', { d: 'M270 3763 H' + (x - 6), class: 'lead' }, gg);
        el('rect', { x: x, y: y, width: 150, height: 18, rx: 3, class: 'box is-on' }, gg);
        T(gg, x + 8, y + 13, c[0], 't-l');
        if (c[1]) T(gg, x + 142, y + 13, c[1], 't-s end');
        return gg;
      });
      W.swapCap = hide(T(g, 320, 3838, '一個底座，掛幾十個幾 MB 的 adapter，隨時切換', 't-d'));
    })();

    // ================= renderers：每一段只吃自己的 t =================
    var R_ = {
      intro: function (t) {
        show(W.blk, ease(seg(t, 0, 0.22)));
        show(W.wgrid.g, ease(seg(t, 0.18, 0.5)));
        show(W.wlabel, ease(seg(t, 0.42, 0.62)));
        var pc = ease(seg(t, 0.6, 0.88));
        show(W.pcount, pc);
        text(W.pcount, 'W：d × k = ' + comma(D) + ' × ' + comma(K) + ' ≈ ' + big(D * K) + ' 個參數');
        live.intro = [['矩陣', 'W · d × k'], ['參數', big(D * K)], ['微調', '更新每一格'], ['示意', 'd = k = 4096'], ['下一步', '成本多大？']];
      },
      full: function (t) {
        var n = Math.round(ease(seg(t, 0, 0.34)) * W.wgrid.cells.length);
        W.wgrid.cells.forEach(function (e, i) { set(e, 'class', i < n ? 'cell f-n' : 'cell fz'); });
        show(W.memTitle, ease(seg(t, 0.28, 0.38)));
        W.memSegs.forEach(function (gg, i) { show(gg, ease(seg(t, 0.34 + i * 0.06, 0.42 + i * 0.06))); });
        show(W.memBig, ease(seg(t, 0.62, 0.72)));
        W.taskCopies.forEach(function (c, i) { show(c, ease(seg(t, 0.68 + i * 0.08, 0.76 + i * 0.08))); });
        show(W.taskCap, ease(seg(t, 0.82, 0.92)));
        live.full = [['可訓練參數', big(D * K)], ['記憶體', '≈ 4×', 'ng'], ['每個任務', '一整份 W′', 'ng'], ['秩限制', '無'], ['旁路', '無']];
      },
      rank: function (t) {
        show(W.frzGroup, ease(seg(t, 0, 0.18)));
        var inBA = ease(seg(t, 0.15, 0.32));
        show(W.baGroup, inBA);
        var prog = seg(t, 0.34, 0.84);
        var lit = prog <= 0 ? 0 : Math.min(RV, Math.floor(prog * RV) + 1);
        W.B.cells.forEach(function (e, idx) { set(e, 'class', 'cell ' + ((idx % RV) < lit ? 'f-p' : 'fz')); });
        W.A.cells.forEach(function (e, idx) { set(e, 'class', 'cell ' + (Math.floor(idx / CW) < lit ? 'f-p' : 'fz')); });
        var dwK = ease(clamp01(prog));
        W.dw.cells.forEach(function (e) { set(e, 'class', 'cell ' + (dwK > 0.05 ? 'f-p' : 'fz')); show(e, dwK); });
        show(W.dwLabel, ease(seg(t, 0.8, 0.9)));
        show(W.rankPanel, ease(seg(t, 0.5, 0.62)));
        text(W.rk, 'r 可小到 1、2、4、8（這裡畫 ' + RV + ' 條示意）');
        live.rank = [['凍結', 'W · d×k', 'ng'], ['要學', 'B、A', 'hl'], ['B', 'd × r'], ['A', 'r × k'], ['rank(ΔW)', '≤ r', 'hl']];
      },
      forward: function (t) {
        show(W.fwdBase, ease(seg(t, 0, 0.14)));
        draw(W.w.xtop, ease(seg(t, 0.1, 0.22)));
        draw(W.w.wsum, ease(seg(t, 0.2, 0.34)));
        draw(W.w.xbot, ease(seg(t, 0.14, 0.26)));
        draw(W.w.ab, ease(seg(t, 0.3, 0.4)));
        var bn = ease(seg(t, 0.4, 0.56));
        set(W.aVec, 'class', bn > 0.4 ? 'f-p' : 'f-p');
        draw(W.w.bB, bn);
        draw(W.w.bsc, ease(seg(t, 0.56, 0.68)));
        draw(W.w.scsum, ease(seg(t, 0.66, 0.8)));
        draw(W.w.sumh, ease(seg(t, 0.8, 0.92)));
        show(W.fwdEq, ease(seg(t, 0.82, 0.92)));
        live.forward = [['式子', 'h = Wx + (α/r)BAx', 'hl'], ['凍結', 'W'], ['旁路', 'A → r → B', 'hl'], ['瓶頸', 'r 維', 'hl'], ['縮放', 'α / r = ' + fmt(ALPHA / R, 1)]];
      },
      params: function (t) {
        show(W.pAxis, ease(seg(t, 0, 0.14)));
        var kf = ease(seg(t, 0.08, 0.26));
        set(W.pFull, 'width', r1((lx(full(D, K)) - LG.x0) * kf));
        show(W.pFullLbl, kf > 0.8 ? 1 : 0);
        var idx = t >= 0.76 ? 3 : Math.min(RSWEEP.length - 1, Math.floor(seg(t, 0.3, 0.76) * RSWEEP.length));
        var rv = RSWEEP[idx], lv = lora(D, K, rv), ratio = Math.round(full(D, K) / lv);
        var appear = ease(seg(t, 0.28, 0.36));
        set(W.pLora, 'width', r1((lx(lv) - LG.x0) * appear));
        show(W.pLoraLbl, appear > 0.8 ? 1 : 0);
        set(W.pLoraLbl, 'x', r1(lx(lv) + 8));
        text(W.pLoraLbl, big(lv) + ' = r·(d+k) · r=' + rv);
        text(W.ratioBig, appear > 0.5 ? comma(ratio) + '× 更少' : '');
        W.rTicks.forEach(function (e, i) { set(e, 'class', i === idx ? 't-h mid' : 't-s mid'); });
        live.params = [['全量 · d·k', big(full(D, K)), 'ng'], ['r', String(rv), 'hl'], ['LoRA · r(d+k)', big(lv), 'hl'], ['少', comma(ratio) + '×', 'hl'], ['示意', 'd = k = 4096']];
      },
      model: function (t) {
        show(W.mTitle, ease(seg(t, 0, 0.1)));
        show(W.stackG, ease(seg(t, 0.05, 0.2)));
        var n = Math.round(seg(t, 0.15, 0.8) * L);
        W.adapters.forEach(function (pair, i) {
          var on = i < n;
          pair.forEach(function (e) { set(e, 'class', 'slab s-lora' + (on ? ' is-on' : '')); });
        });
        show(W.counters, ease(seg(t, 0.2, 0.3)));
        show(W.cNote, ease(seg(t, 0.8, 0.9)));
        var fp = n * 2 * full(D, K), lp = n * 2 * lora(D, K, R);
        text(W.cFull, big(fp));
        text(W.cLora, big(lp));
        text(W.cSize, fmt(lp * 2 / 1e6, 1) + ' MB');
        live.model = [['層', n + ' / ' + L], ['全量可訓練', big(fp), 'ng'], ['LoRA 可訓練', big(lp), 'hl'], ['adapter', fmt(lp * 2 / 1e6, 1) + ' MB', 'hl'], ['省', comma(Math.round(full(D, K) / lora(D, K, R))) + '×']];
      },
      merge: function (t) {
        var k1 = ease(seg(t, 0.04, 0.3));
        show(W.foldG, k1);
        var k2 = ease(seg(t, 0.32, 0.5));
        show(W.mArrow, k2); show(W.mWp, k2);
        show(W.mergeCap, ease(seg(t, 0.44, 0.56)));
        show(W.base, ease(seg(t, 0.56, 0.66)));
        W.chips.forEach(function (c, i) { show(c, ease(seg(t, 0.64 + i * 0.05, 0.72 + i * 0.05))); });
        show(W.swapCap, ease(seg(t, 0.86, 0.95)));
        live.merge = [['合併', 'W′=W+(α/r)BA', 'hl'], ['推論延遲', '+0', 'hl'], ['adapter', '~8 MB'], ['切換', '換一組 B、A'], ['底座', '凍結不動']];
      }
    };

    var FACTS = {
      intro: [['矩陣', 'W · d × k'], ['參數', big(D * K)], ['微調', '更新每一格'], ['示意', 'd = k = 4096'], ['下一步', '成本多大？']]
    };

    return { render: R_, facts: FACTS };
  }
})();
