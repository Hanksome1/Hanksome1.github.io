/* Ideogram 4 vs SD 3.5 Large — 捲動式的逐層比較（layout: dit-compare）
   左邊每一章（[data-step]）對應右邊舞台的一個場景；兩條 lane 用同一個場景、各自的規格畫。
   章節內的捲動進度 p（0–1）驅動場景的動畫，§03 / §08 / §09 的控制項改的是共用的 state。
   規格出自 ideogram-oss/ideogram4（modeling_ideogram4.py、pipeline_ideogram4.py）與 Stability-AI/sd3.5（mmditx.py、sd3_infer.py）。 */
(function () {
  'use strict';

  var root = document.querySelector('[data-dc]');
  if (!root) return;

  var NS = 'http://www.w3.org/2000/svg';
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── 規格 ─────────────────────────────────────────────────────
  var SPEC = {
    sd: {
      D: 2432, L: 38, heads: 38, hd: 64, mlp: 9728, C: 16, text: 154,
      encParams: 0.123e9 + 0.695e9 + 4.8e9 // CLIP-L、OpenCLIP bigG、T5-XXL encoder
    },
    ig: {
      D: 4608, L: 34, heads: 18, hd: 256, mlp: 12288, C: 32, ada: 512, llm: 4096 * 13,
      encParams: 8e9 // Qwen3-VL-8B 的語言模型（只用文字模式）
    }
  };
  (function () {
    var s = SPEC.sd, D = s.D;
    // 兩條流各一份：attention 4D²、MLP 8D²、adaLN 6D²
    s.blk = { attn: 2 * 4 * D * D, mlp: 2 * 8 * D * D, ada: 2 * 6 * D * D };
    var g = SPEC.ig, E = g.D;
    g.blk = { attn: 4 * E * E, mlp: 3 * E * g.mlp, ada: g.ada * 4 * E + 4 * E };
    [s, g].forEach(function (m) { m.blkTotal = m.blk.attn + m.blk.mlp + m.blk.ada; });
  })();

  // 一個 block 一次 forward 的 FLOPs（乘加算 2）：線性層 + attention 的 QKᵀ 與 AV
  function blockFlops(key, nText, nImg) {
    var m = SPEC[key], N = nText + nImg;
    var linear = key === 'sd' ? 24 * m.D * m.D * N : 2 * (4 * m.D * m.D + 3 * m.D * m.mlp) * N;
    var attn = 4 * N * N * m.D;
    return { linear: linear, attn: attn, total: linear + attn };
  }
  function passFlops(key, nText, nImg) {
    var m = SPEC[key];
    var f = m.L * blockFlops(key, nText, nImg).total;
    if (key === 'ig') f += 2 * m.llm * m.D * nText; // 53,248 → 4608 的投影在 transformer 裡，每一步都要算
    return f;
  }

  // ── 共用狀態 ───────────────────────────────────────────────
  var state = { res: 1024, txt: 300, sd: 'large', ig: 20 };
  var IG_PRESETS = { 12: { mu: 0.5, std: 1.75, polish: 1 }, 20: { mu: 0, std: 1.75, polish: 2 }, 48: { mu: 0, std: 1.5, polish: 3 } };

  function nImg() { var g = state.res / 16; return g * g; }
  function sdSteps() { return state.sd === 'turbo' ? 4 : 40; }
  function sdPasses() { return state.sd === 'turbo' ? 1 : 2; }
  function costs() {
    var n = nImg();
    var sdPass = passFlops('sd', SPEC.sd.text, n);
    var igCond = passFlops('ig', state.txt, n), igUncond = passFlops('ig', 0, n);
    var sd = {
      text: 2 * SPEC.sd.encParams * 77 * sdPasses(), // 有 prompt、空 prompt 各編一次
      cond: sdSteps() * sdPass,
      uncond: sdPasses() > 1 ? sdSteps() * sdPass : 0,
      step: sdPass * sdPasses(), condPass: sdPass, uncondPass: sdPasses() > 1 ? sdPass : 0
    };
    var ig = {
      text: 2 * SPEC.ig.encParams * state.txt,
      cond: state.ig * igCond, uncond: state.ig * igUncond,
      step: igCond + igUncond, condPass: igCond, uncondPass: igUncond
    };
    sd.total = sd.text + sd.cond + sd.uncond;
    ig.total = ig.text + ig.cond + ig.uncond;
    return { sd: sd, ig: ig };
  }

  // ── 小工具 ─────────────────────────────────────────────────
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function seg(p, a, b) { return clamp((p - a) / (b - a), 0, 1); }
  function num(n) { return Math.round(n).toLocaleString('en-US'); }
  function fmtP(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e8 ? 0 : 1) + 'M';
    return num(n);
  }
  function fmtF(n) {
    if (n >= 1e15) return (n / 1e15).toFixed(2) + ' PFLOPs';
    if (n >= 1e12) return (n / 1e12).toFixed(n >= 1e14 ? 0 : 1) + ' TFLOPs';
    return (n / 1e9).toFixed(0) + ' GFLOPs';
  }
  function fmtBig(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    return num(n);
  }
  function el(tag, attrs, parent, text) {
    var n = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
    if (text != null) n.textContent = text;
    if (parent) parent.appendChild(n);
    return n;
  }
  function T(g, x, y, s, cls, anchor) { return el('text', { x: x, y: y, class: cls || null, 'text-anchor': anchor || null }, g, s); }
  function R(g, x, y, w, h, cls, rx) { return el('rect', { x: x, y: y, width: Math.max(0, w), height: Math.max(0, h), class: cls || null, rx: rx || null }, g); }
  function P(g, d, cls) { return el('path', { d: d, class: cls || null }, g); }
  function G(g, cls) { return el('g', { class: cls || null }, g); }
  function setW(r, w) { r.setAttribute('width', Math.max(0, w)); }
  function setText(n, s) { if (n.textContent !== s) n.textContent = s; }
  function op(n, v) { n.style.opacity = v; }
  function arrow(L, g, x1, y1, x2, y2) {
    var a = Math.atan2(y2 - y1, x2 - x1), k = 5;
    P(g, 'M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2, 's-ink3');
    return P(g, 'M' + x2 + ' ' + y2 + 'L' + (x2 - k * Math.cos(a - 0.45)) + ' ' + (y2 - k * Math.sin(a - 0.45)) +
      'L' + (x2 - k * Math.cos(a + 0.45)) + ' ' + (y2 - k * Math.sin(a + 0.45)) + 'Z', 'f-ink3');
  }
  function node(g, x, y, w, h, label) {
    var n = G(g);
    R(n, x, y, w, h, 'node', 3);
    T(n, x + w / 2, y + h / 2 + 3.5, label, null, 'middle');
    return n;
  }
  function cls(n, name, on) { n.classList.toggle(name, !!on); }

  // 標準常態分佈的反函數（Acklam 近似），給 Ideogram 4 的 logit-normal 排程用
  function ndtri(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    var a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
    var b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
    var c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
    var d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
    var q, r;
    if (p < 0.02425) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    }
    if (p > 1 - 0.02425) return -ndtri(1 - p);
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // 走完 k 步之後，latent 裡「乾淨的圖」佔多少（x = a·圖 + (1 − a)·雜訊）
  function cleanFrac(key, k) {
    if (key === 'sd') {
      var N = sdSteps(), shift = 3;
      if (k >= N) return 1;
      var s = 1 - (k / (N - 1)) * 0.999;
      return 1 - shift * s / (1 + (shift - 1) * s);
    }
    var n = state.ig, pr = IG_PRESETS[n];
    var mean = pr.mu + 0.5 * Math.log((state.res * state.res) / (512 * 512));
    var y = pr.std * ndtri(k / n) - mean;
    return clamp(1 / (1 + Math.exp(-y)), 0, 1);
  }

  // ── 場景 ───────────────────────────────────────────────────
  // build(L) 畫出這一章的圖、回傳要更新的節點；update(c, p, L) 依捲動進度更新；stats / diff 給 lane 底下的數字和舞台底下的一句話。
  var S = {};
  var hover = null; // §04 滑鼠指著的圖片格子，兩條 lane 共用

  // §01 Prompt
  var JSON_LINES = [
    '{',
    '  "high_level_description":',
    '    "A golden retriever riding a skate…",',
    '  "style_description": {',
    '    "medium": "photograph",',
    '    "color_palette": [',
    '  },',
    '  "compositional_deconstruction": {',
    '    "background": "A sunny street…",',
    '    "elements": [',
    '      {"type":"obj","bbox":[250,150,800,650],',
    '      {"type":"obj","bbox":[760,180,880,640],',
    '      {"type":"text","text":"SKATE DOG",',
    '       "bbox":[80,560,230,960]}',
    ']}}'
  ];
  var PALETTE = ['#e9a93a', '#8cc8e8', '#c4392d', '#2b2b2b', '#f4efe6'];
  // bbox 是 [y_min, x_min, y_max, x_max]（0–1000）
  var BOXES = [
    { line: 10, b: [250, 150, 800, 650], label: 'dog' },
    { line: 11, b: [760, 180, 880, 640], label: 'board' },
    { line: 13, b: [80, 560, 230, 960], label: 'SKATE DOG' }
  ];
  S.prompt = {
    tag: { sd: 'natural language', ig: 'structured JSON' },
    build: function (L) {
      var g = L.g, c = {};
      if (L.key === 'sd') {
        T(g, 12, 20, 'INPUT · 一句英文', 't-cap');
        R(g, 10, 30, 340, 64, 'box', 6);
        T(g, 22, 56, 'A golden retriever riding a skateboard');
        T(g, 22, 76, "past a shop sign that reads 'SKATE DOG'.");
        c.rows = [['CLIP-L tokenizer', 19], ['OpenCLIP bigG tokenizer', 19], ['T5-XXL tokenizer', 22]].map(function (r, i) {
          var y = 128 + i * 66;
          T(g, 12, y, r[0], 't-s');
          var cnt = T(g, 348, y, '', 't-s', 'end');
          var cells = [];
          for (var k = 0; k < 77; k++) cells.push(R(g, 12 + k * 4.4, y + 8, 3.4, 24, 'cell'));
          return { cells: cells, n: r[1], cnt: cnt };
        });
        T(g, 12, 340, '77 格是上限：多的字截掉，不夠補 padding', 't-d');
        c.out = G(g, 'fade');
        R(c.out, 10, 366, 340, 46, 'box-l', 6);
        T(c.out, 180, 394, '77 + 77 = 154 個文字 token', 't-b', 'middle');
      } else {
        T(g, 12, 20, 'INPUT · 結構化 JSON', 't-cap');
        c.lines = JSON_LINES.map(function (s, i) {
          var t = T(g, 12, 38 + i * 14.4, s, 't-s t-pre');
          t.classList.add('fade');
          return t;
        });
        c.swatches = G(g, 'fade');
        PALETTE.forEach(function (col, i) { el('rect', { x: 132 + i * 15, y: 38 + 5 * 14.4 - 9, width: 12, height: 10, rx: 2, fill: col, stroke: 'var(--line-2)' }, c.swatches); });
        var cx = 12, cy = 262, cs = 130;
        R(g, cx, cy, cs, cs, 'box', 3);
        T(g, cx, cy + cs + 14, '版面（bbox）', 't-d');
        c.boxes = BOXES.map(function (b) {
          var n = G(g, 'fade');
          var x = cx + b.b[1] * cs / 1000, y = cy + b.b[0] * cs / 1000;
          R(n, x, y, (b.b[3] - b.b[1]) * cs / 1000, (b.b[2] - b.b[0]) * cs / 1000, 'box-l', 2);
          T(n, x + 4, y + 11, b.label, 't-d');
          return { n: n, line: b.line };
        });
        var mx = 160, mw = 188;
        T(g, mx, 274, 'QWEN3 TOKENS', 't-cap');
        R(g, mx, 284, mw, 12, 'f-line', 2);
        c.fill = R(g, mx, 284, 0, 12, 'f-l', 2);
        var tick = mx + mw * 77 / 2048;
        P(g, 'M' + tick + ' 280V300', 's-ink3');
        T(g, tick, 312, '↑ SD 的 77', 't-d');
        c.count = T(g, mx, 350, '', 't-xb');
        T(g, mx, 368, '/ 2048 上限', 't-s');
        T(g, mx, 392, 'bbox、色票、要寫的字', 't-d');
        T(g, mx, 406, '都直接寫在 prompt 裡', 't-d');
      }
      return c;
    },
    update: function (c, p, L) {
      if (L.key === 'sd') {
        var f = seg(p, 0.05, 0.55), pad = seg(p, 0.55, 0.8);
        c.rows.forEach(function (r) {
          var shown = Math.round(r.n * f), padded = Math.round((77 - r.n) * pad);
          r.cells.forEach(function (cell, k) {
            cls(cell, 'is-tok', k < shown);
            cls(cell, 'is-pad', k >= r.n && k < r.n + padded);
          });
          setText(r.cnt, '≈ ' + shown + ' / 77');
        });
        op(c.out, 0.15 + 0.85 * seg(p, 0.75, 0.9));
      } else {
        var n = Math.floor(seg(p, 0, 0.7) * JSON_LINES.length) + 1;
        c.lines.forEach(function (t, i) { op(t, i < n ? 1 : 0.14); });
        op(c.swatches, n > 5 ? 1 : 0);
        c.boxes.forEach(function (b) { op(b.n, n > b.line ? 1 : 0); });
        var tok = state.txt * seg(p, 0.05, 0.75);
        setW(c.fill, 188 * tok / 2048);
        setText(c.count, '≈ ' + num(tok));
      }
    },
    stats: function (L) {
      return L.key === 'sd'
        ? [['格式', '一句話'], ['token 上限', '77 + 77'], ['文字 token', '154']]
        : [['格式', 'JSON'], ['token 上限', '2048'], ['文字 token', '≈ ' + num(state.txt)]];
    },
    diff: function () {
      return '<span class="sd">SD 3.5</span> 讀一句話，最多 77 個 token；<span class="ig">Ideogram 4</span> 讀一份帶 bbox 和色票的 JSON，最多 2048 個。';
    }
  };

  // §02 Text encoder
  S.encoder = {
    tag: { sd: 'CLIP-L + bigG + T5-XXL', ig: 'Qwen3-VL-8B · 13 taps' },
    build: function (L) {
      var g = L.g, c = {};
      if (L.key === 'sd') {
        T(g, 12, 20, 'TEXT ENCODERS · 三個並聯', 't-cap');
        var towers = [
          { name: 'CLIP-L', L: 12, dim: 768, w: 44, x: 24, tap: 10, note: '倒數第 2 層' },
          { name: 'bigG', L: 32, dim: 1280, w: 62, x: 104, tap: 30, note: '倒數第 2 層' },
          { name: 'T5-XXL', L: 24, dim: 4096, w: 96, x: 204, tap: 23, note: '最後一層' }
        ];
        c.towers = towers.map(function (t) {
          var layers = [];
          for (var i = 0; i < t.L; i++) layers.push(R(g, t.x, 250 - (i + 1) * 6 + 1, t.w, 5, 'f-line'));
          T(g, t.x + t.w / 2, 266, t.name, null, 'middle');
          T(g, t.x + t.w / 2, 279, t.L + ' 層 · ' + t.dim, 't-d', 'middle');
          return { t: t, layers: layers };
        });
        T(g, 12, 298, '■ 取用的那一層', 't-d').classList.add('t-l');
        c.out = G(g, 'fade');
        var x0 = 40, sc = 300 / 4096;
        T(c.out, 12, 326, '77', 't-s');
        R(c.out, x0, 316, 768 * sc, 13, 'f-l');
        R(c.out, x0 + 768 * sc, 316, 1280 * sc, 13, 'f-mid');
        R(c.out, x0 + 2048 * sc, 316, 2048 * sc, 13, 'ghost');
        T(c.out, x0 + 3072 * sc, 326, '補 0', 't-d', 'middle');
        T(c.out, 12, 344, '77', 't-s');
        R(c.out, x0, 334, 300, 13, 'f-l');
        T(c.out, x0 + 150, 344, 'T5 · 4096', 't-inv', 'middle');
        T(c.out, 12, 368, '→ context 154 × 4096 → Linear → 2432', 't-s');
        c.pool = G(g, 'fade');
        R(c.pool, 12, 386, 768 * sc, 11, 'f-l');
        R(c.pool, 12 + 768 * sc, 386, 1280 * sc, 11, 'f-mid');
        T(c.pool, 12 + 2048 * sc + 8, 395, 'pooled 2048 → 加到 t 上', 't-s');
        T(c.pool, 12, 418, '→ 調變每一層（adaLN），§06 會看到', 't-d');
      } else {
        T(g, 12, 20, 'TEXT ENCODER · Qwen3-VL-8B（凍結）', 't-cap');
        var taps = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 35];
        var bottom = 404, lh = 9.4, tx = 20, tw = 150, colX = 216, colW = 26, segH = (bottom - 62) / 13;
        c.layers = [];
        for (var i = 0; i < 36; i++) c.layers.push(R(g, tx, bottom - (i + 1) * lh + 1, tw, lh - 2, 'f-line'));
        T(g, tx - 4, bottom - 2, '0', 't-d', 'end');
        T(g, tx - 4, bottom - 35 * lh - 2, '35', 't-d', 'end');
        c.taps = taps.map(function (li, j) {
          var y = bottom - (li + 0.5) * lh;
          var sy = bottom - (j + 0.5) * segH;
          var line = P(g, 'M' + (tx + tw + 2) + ' ' + y + 'C' + (tx + tw + 26) + ' ' + y + ' ' + (colX - 22) + ' ' + sy + ' ' + colX + ' ' + sy, 's-l');
          line.classList.add('fade');
          var s = R(g, colX, bottom - (j + 1) * segH + 1, colW, segH - 2, 'f-line');
          return { li: li, line: line, seg: s };
        });
        T(g, colX + colW / 2, 54, 'concat', 't-d', 'middle');
        c.right = G(g, 'fade');
        var rx = 254;
        T(c.right, rx, 150, '13 × 4096', 't-s');
        T(c.right, rx, 170, '= 53,248 維', 't-b');
        arrow(L, c.right, rx + 40, 182, rx + 40, 204);
        node(c.right, rx, 210, 96, 22, 'RMSNorm');
        arrow(L, c.right, rx + 40, 236, rx + 40, 256);
        node(c.right, rx, 262, 96, 22, 'Linear');
        T(c.right, rx, 306, '→ 每個 token', 't-s');
        T(c.right, rx, 322, '4608 維進 DiT', 't-s');
      }
      return c;
    },
    update: function (c, p, L) {
      var s = seg(p, 0, 0.62);
      if (L.key === 'sd') {
        c.towers.forEach(function (tw) {
          tw.layers.forEach(function (r, i) {
            var on = (i + 1) / tw.t.L <= s + 1e-6;
            r.setAttribute('class', on ? (i === tw.t.tap ? 'f-l' : 'f-mid') : (i === tw.t.tap ? 'box-l' : 'f-line'));
          });
        });
        op(c.out, 0.12 + 0.88 * seg(p, 0.62, 0.76));
        op(c.pool, 0.12 + 0.88 * seg(p, 0.76, 0.9));
      } else {
        var tapSet = {};
        c.taps.forEach(function (t) { tapSet[t.li] = true; });
        c.layers.forEach(function (r, i) {
          var on = (i + 1) / 36 <= s + 1e-6;
          r.setAttribute('class', on ? (tapSet[i] ? 'f-l' : 'f-mid') : (tapSet[i] ? 'box-l' : 'f-line'));
        });
        c.taps.forEach(function (t) {
          var on = (t.li + 1) / 36 <= s + 1e-6;
          op(t.line, on ? 1 : 0.1);
          t.seg.setAttribute('class', on ? 'f-l' : 'f-line');
        });
        op(c.right, 0.12 + 0.88 * seg(p, 0.66, 0.82));
      }
    },
    stats: function (L) {
      return L.key === 'sd'
        ? [['encoder', '3 個'], ['輸出', '154 × 4096'], ['參數', '≈ 5.6B']]
        : [['encoder', '1 個 VLM'], ['輸出', 'N × 53,248'], ['參數', '8B 級']];
    },
    diff: function () {
      return '<span class="sd">SD 3.5</span> 讓三個 encoder 各讀一次、各取一層；<span class="ig">Ideogram 4</span> 只用一個 VLM，但把 13 層的特徵全部接起來交給 DiT。';
    }
  };

  // §03 Latent
  S.latent = {
    tag: { sd: 'VAE 16 ch · patch 2×2', ig: 'VAE 32 ch · patch 2×2' },
    build: function (L) {
      var g = L.g, c = {}, C = SPEC[L.key].C;
      T(g, 12, 20, 'IMAGE → LATENT → TOKENS', 't-cap');
      // 1. 圖
      c.a = G(g, 'fade');
      var ix = 24, iy = 34, is = 108;
      R(c.a, ix, iy, is, is, 'f-soft', 2);
      el('circle', { cx: ix + 26, cy: iy + 26, r: 12, class: 'f-mid' }, c.a);
      R(c.a, ix + 62, iy + 12, 38, 22, 'f-ink', 2);
      R(c.a, ix, iy + 80, is, 28, 'f-line2');
      el('ellipse', { cx: ix + 50, cy: iy + 68, rx: 22, ry: 13, class: 'f-l' }, c.a);
      R(c.a, ix + 26, iy + 82, 50, 5, 'f-ink3', 2);
      T(c.a, 170, iy + 30, 'IMAGE', 't-cap');
      c.aDim = T(c.a, 170, iy + 50, '', 't-b');
      T(c.a, 170, iy + 68, 'RGB 像素', 't-d');
      arrow(L, g, 66, 150, 66, 172);
      T(g, 80, 165, 'VAE encoder · 每邊 ÷ 8', 't-d');
      // 2. latent：一張張疊起來的通道
      c.b = G(g, 'fade');
      var lx = 24, ly = 202, ls = 84, off = 1.2;
      for (var k = C - 1; k >= 0; k--) R(c.b, lx + k * off, ly - k * off * 0.6, ls, ls, k === 0 ? 'f-mid' : 'box', 1);
      T(c.b, 170, ly + 18, 'LATENT', 't-cap');
      c.bDim = T(c.b, 170, ly + 38, '', 't-b');
      T(c.b, 170, ly + 56, C + ' 個通道', 't-s').classList.add('t-l');
      arrow(L, g, 66, 292, 66, 312);
      T(g, 80, 306, 'patchify · 2 × 2 打包', 't-d');
      // 3. token
      c.c = G(g, 'fade');
      var gx = 24, gy = 318, gs = 72, gn = 12;
      for (var r = 0; r < gn; r++) for (var q = 0; q < gn; q++) R(c.c, gx + q * gs / gn, gy + r * gs / gn, gs / gn - 1, gs / gn - 1, (r + q) % 7 ? 'f-mid' : 'f-l');
      T(c.c, 170, gy + 14, 'TOKENS', 't-cap');
      c.cDim = T(c.c, 170, gy + 34, '', 't-b');
      T(c.c, 170, gy + 52, '每個 token 是 ' + C + ' × 4 = ' + C * 4 + ' 維', 't-s');
      // 一個 token 的向量，用同一個比例尺畫：128 維寬一倍
      var vx = 170, vw = 178 * (C * 4) / 128;
      for (var d = 0; d < C * 4; d++) R(c.c, vx + d * vw / (C * 4), gy + 64, Math.max(0.6, vw / (C * 4) - 0.5), 14, d % 4 === 0 ? 'f-l' : 'f-mid');
      T(c.c, vx, gy + 94, 'token 向量（同比例）', 't-d');
      return c;
    },
    update: function (c, p, L) {
      var C = SPEC[L.key].C, r = state.res, n = r / 16;
      setText(c.aDim, r + ' × ' + r + ' × 3');
      setText(c.bDim, r / 8 + ' × ' + r / 8 + ' × ' + C);
      setText(c.cDim, n + ' × ' + n + ' = ' + num(n * n));
      op(c.a, 0.25 + 0.75 * seg(p, 0, 0.15));
      op(c.b, 0.15 + 0.85 * seg(p, 0.2, 0.4));
      op(c.c, 0.15 + 0.85 * seg(p, 0.45, 0.65));
    },
    stats: function (L) {
      var n = nImg();
      return [['解析度', state.res + '²'], ['圖片 token', num(n)], ['token 維度', String(SPEC[L.key].C * 4)]];
    },
    diff: function () {
      return '兩邊都是每 16 × 16 像素一個 token，' + state.res + '² 就是 <b>' + num(nImg()) + ' 個</b>。差在每個 token 的寬度：<span class="sd">64 維</span> vs <span class="ig">128 維</span>。';
    }
  };

  // §04 Sequence & position
  S.position = {
    tag: { sd: '2 streams · additive 2D sin-cos', ig: '1 sequence · 3D MRoPE' },
    build: function (L) {
      var g = L.g, c = {}, sd = L.key === 'sd';
      T(g, 12, 20, sd ? 'TWO STREAMS · 位置加在輸入' : 'ONE SEQUENCE · 位置轉進 q、k', 't-cap');
      // 文字
      var nt = sd ? 154 : state.txt;
      T(g, 12, 44, sd ? 'TEXT STREAM · W_ctx' : 'TEXT', 't-s');
      T(g, 348, 44, num(nt) + ' tokens', 't-d', 'end');
      c.tbar = R(g, 12, 52, 336, 16, 'f-mid', 2);
      for (var i = 1; i < 24; i++) P(g, 'M' + (12 + i * 14) + ' 52v16', 's-line');
      c.tHi = R(g, 12, 50, 4, 20, 'f-ink', 1);
      // 圖片
      var gx = 12, gy = sd ? 108 : 100, cs = 13, gn = 16;
      if (sd) {
        P(g, 'M12 84H348', 'ghost');
        T(g, 12, 100, 'IMAGE STREAM · W_x', 't-s');
        T(g, 348, 100, num(nImg()) + ' tokens', 't-d', 'end');
      } else {
        P(g, 'M12 72V77H348V72', 's-l');
        T(g, 12, 92, 'IMAGE（同一條序列接下去）', 't-s');
        T(g, 348, 92, num(nImg()) + ' tokens', 't-d', 'end');
      }
      c.cells = [];
      var grid = G(g);
      for (var r = 0; r < gn; r++) for (var q = 0; q < gn; q++) {
        var cell = R(grid, gx + q * cs, gy + r * cs, cs - 1, cs - 1, 'f-l');
        cell.dataset.r = r; cell.dataset.q = q;
        var base = sd ? 0.18 : 0.42;
        cell.dataset.base = base;
        cell.dataset.pe = sd ? 0.5 + 0.5 * Math.sin(r * 0.8) * Math.cos(q * 0.55) : 0;
        c.cells.push(cell);
      }
      c.iHi = R(g, gx, gy, cs - 1, cs - 1, 's-ink3');
      c.iHi.setAttribute('stroke-width', 2);
      c.iHi.style.stroke = 'var(--ink)';
      var side = gx + gn * cs + 14;
      if (sd) {
        c.peLabel = T(g, side, gy + 16, '+ 2D sin-cos', 't-s');
        T(g, side, gy + 32, '從 192 × 192', 't-d');
        T(g, side, gy + 46, '的表裁出來', 't-d');
      } else {
        T(g, side, gy + 16, '不加位置向量', 't-s');
        T(g, side, gy + 32, '位置在每層', 't-d');
        T(g, side, gy + 46, 'attention 裡', 't-d');
        T(g, side, gy + 60, '旋轉 q、k', 't-d');
      }
      // 讀數
      var ry = gy + gn * cs + 16;
      R(g, 10, ry, 340, 50, 'box', 4);
      c.r1 = T(g, 22, ry + 20, '');
      c.r2 = T(g, 22, ry + 38, '', 't-s');
      c.r2.classList.add('t-l');
      // 頻率怎麼分給各軸
      var fy = 410;
      if (sd) {
        T(g, 12, fy - 8, 'pos_embed 2432 維：一半編 h、一半編 w', 't-d');
        R(g, 12, fy, 168, 10, 'f-l');
        R(g, 180, fy, 168, 10, 'f-mid');
      } else {
        T(g, 12, fy - 8, '每個 head 128 組頻率：t 88 · h 20 · w 20', 't-d');
        for (var k = 0; k < 128; k++) {
          var ax = k < 60 && k % 3 === 1 ? 'f-l' : k < 60 && k % 3 === 2 ? 'f-mid' : 'f-line2';
          R(g, 12 + k * 336 / 128, fy, 336 / 128 - 0.6, 10, ax);
        }
      }
      // 滑鼠指到哪一格，兩邊都顯示同一個位置的 token
      grid.addEventListener('pointermove', function (e) {
        var t = e.target;
        if (t.dataset && t.dataset.r != null) hover = { r: +t.dataset.r, q: +t.dataset.q };
        schedule();
      });
      grid.addEventListener('pointerleave', function () { hover = null; schedule(); });
      return c;
    },
    update: function (c, p, L) {
      var sd = L.key === 'sd', nt = sd ? 154 : state.txt, g = state.res / 16;
      var peOn = sd ? seg(p, 0.3, 0.5) : 0;
      c.cells.forEach(function (cell) {
        var v = +cell.dataset.base + peOn * 0.7 * +cell.dataset.pe;
        cell.style.opacity = v;
      });
      var r1, r2, hi;
      if (hover || p >= 0.32) {
        var h, w;
        if (hover) { h = Math.floor((hover.r + 0.5) * g / 16); w = Math.floor((hover.q + 0.5) * g / 16); }
        else { var idx = Math.floor(seg(p, 0.32, 1) * (g * g - 1)); h = Math.floor(idx / g); w = idx % g; }
        hi = { r: Math.floor(h * 16 / g), q: Math.floor(w * 16 / g) };
        r1 = 'image token (h = ' + h + ', w = ' + w + ')';
        r2 = sd ? '→ x + pos_embed[' + h + '][' + w + ']' : '→ (65536, ' + (65536 + h) + ', ' + (65536 + w) + ')';
        op(c.tHi, 0);
        op(c.iHi, 1);
        c.iHi.setAttribute('x', 12 + hi.q * 13);
        c.iHi.setAttribute('y', (sd ? 108 : 100) + hi.r * 13);
      } else {
        var i = Math.floor(seg(p, 0, 0.3) * (nt - 1));
        r1 = 'text token #' + i;
        r2 = sd ? '→ DiT 裡不加位置' : '→ (' + i + ', ' + i + ', ' + i + ')';
        op(c.tHi, 1);
        op(c.iHi, 0);
        c.tHi.setAttribute('x', 12 + (i / Math.max(1, nt - 1)) * 332);
      }
      setText(c.r1, r1);
      setText(c.r2, r2);
    },
    stats: function (L) {
      return L.key === 'sd'
        ? [['序列', '2 條'], ['位置', '加法 · 2D'], ['文字位置', '無']]
        : [['序列', '1 條'], ['位置', 'MRoPE · 3D'], ['文字位置', '(i, i, i)']];
    },
    diff: function () {
      return '<span class="sd">SD 3.5</span> 把位置「加」在圖片 token 上，文字沒有位置；<span class="ig">Ideogram 4</span> 在每一層 attention 裡「旋轉」q、k，文字和圖片共用一個座標系。滑鼠移到格子上可以看單一個 token。';
    }
  };

  // §05 Attention
  S.attention = {
    tag: { sd: 'joint · W_ctx + W_x', ig: 'joint · shared W' },
    build: function (L) {
      var g = L.g, c = {}, sd = L.key === 'sd', m = SPEC[L.key];
      var nt = sd ? 154 : state.txt, N = nt + nImg();
      var mx = 70, my = 48, ms = 240, t = ms * nt / N;
      T(g, 12, 20, 'ATTENTION · 每個 query 看得到全部 key', 't-cap');
      // 左邊：Q 由誰算；上面：K、V 由誰算
      R(g, mx - 16, my, 10, t, sd ? 'f-mid' : 'f-l');
      R(g, mx - 16, my + t, 10, ms - t, 'f-l');
      R(g, mx, my - 16, t, 10, sd ? 'f-mid' : 'f-l');
      R(g, mx + t, my - 16, ms - t, 10, 'f-l');
      T(g, mx - 20, my + Math.max(t, 10) - 1, 'text', 't-d', 'end');
      T(g, mx - 20, my + t + 40, 'image', 't-d', 'end');
      R(g, mx, my, ms, ms, 'f-soft');
      P(g, 'M' + (mx + t) + ' ' + my + 'V' + (my + ms) + 'M' + mx + ' ' + (my + t) + 'H' + (mx + ms), 'ghost');
      R(g, mx, my, ms, ms, 's-line');
      c.row = R(g, mx, my, ms, 3, 'f-l');
      c.rowLabel = T(g, mx + ms + 6, my, '', 't-d');
      c.mx = mx; c.my = my; c.ms = ms;
      // 權重
      var wy = my + ms + 30;
      if (sd) {
        R(g, 12, wy, 12, 10, 'f-mid'); T(g, 30, wy + 9, 'W_ctx 算文字的 QKV', 't-s');
        R(g, 190, wy, 12, 10, 'f-l'); T(g, 208, wy + 9, 'W_x 算圖片的', 't-s');
      } else {
        R(g, 12, wy, 12, 10, 'f-l'); T(g, 30, wy + 9, '同一個 W 算全部 token 的 QKV', 't-s');
      }
      // heads：寬度照 hidden size 畫
      var hy = wy + 34, hw = 336 * m.D / 4608;
      T(g, 12, hy - 6, m.heads + ' heads × ' + m.hd + ' 維 = ' + num(m.D), 't-s');
      for (var h = 0; h < m.heads; h++) R(g, 12 + h * hw / m.heads, hy, hw / m.heads - 1, 18, h % 2 ? 'f-l' : 'f-mid');
      T(g, 12, hy + 36, '寬度照 hidden size 的比例畫', 't-d');
      T(g, 12, hy + 56, 'N = ' + num(N) + ' tokens', 't-b');
      return c;
    },
    update: function (c, p) {
      var y = c.my + seg(p, 0.05, 0.95) * (c.ms - 3);
      c.row.setAttribute('y', y);
      c.rowLabel.setAttribute('y', y + 4);
      setText(c.rowLabel, '← 一整列');
    },
    stats: function (L) {
      var N = (L.key === 'sd' ? 154 : state.txt) + nImg();
      return [['序列長度', num(N)], ['配對數 N²', fmtBig(N * N)], ['QKV 權重', L.key === 'sd' ? '2 組' : '1 組']];
    },
    diff: function () {
      return '兩邊都是 joint attention。<span class="sd">SD 3.5</span> 的文字和圖片用不同權重算 QKV；<span class="ig">Ideogram 4</span> 用同一組，head 也寬了 4 倍（256 vs 64）。';
    }
  };

  // §06 Block：一個運算一個運算地走過
  var PH = [
    { sd: 'LayerNorm', ig: 'RMSNorm', d: '進 attention 前先正規化：<span class="sd">LayerNorm</span> 減平均再除標準差；<span class="ig">RMSNorm</span> 只除 RMS，少一步。' },
    { sd: '×(1+scale) + shift', ig: '×(1+scale)', mod: true, d: '用時間步調變：<span class="sd">SD 3.5</span> 有 scale 也有 shift；<span class="ig">Ideogram 4</span> 只有 scale。' },
    { sd: 'Joint attention', ig: 'Self-attention', attn: true, d: '<span class="sd">兩條流各算 QKV，拼起來做一次 attention</span>；<span class="ig">一條序列、一組 QKV</span>。兩邊都對 q、k 做 RMSNorm。' },
    { sd: null, ig: 'RMSNorm', d: '<span class="ig">Ideogram 4</span> 在 attention 輸出後再做一次 RMSNorm（sandwich norm）；<span class="sd">SD 3.5</span> 沒有這一步。' },
    { sd: '× gate', ig: '× tanh(gate)', mod: true, d: '閘門決定這一層要改動多少：<span class="ig">Ideogram 4</span> 先過 tanh，限制在 ±1 之間。' },
    { sd: '+ residual', ig: '+ residual', d: '加回 residual，兩邊一樣。' },
    { sd: 'LayerNorm', ig: 'RMSNorm', d: 'MLP 前再正規化一次。' },
    { sd: '×(1+scale) + shift', ig: '×(1+scale)', mod: true, d: '第二組調變向量。<span class="sd">SD 3.5</span> 每條流一個 block 用掉 6 個，<span class="ig">Ideogram 4</span> 用 4 個。' },
    { sd: 'MLP · GELU', ig: 'MLP · SwiGLU', mlp: true, d: '<span class="sd">2432 → 9728 → 2432，兩個矩陣</span>；<span class="ig">4608 → 12288 → 4608，三個矩陣（gate、up、down）</span>。這是參數最多的地方。' },
    { sd: null, ig: 'RMSNorm', d: '又一個 sandwich norm，只有 <span class="ig">Ideogram 4</span> 有。' },
    { sd: '× gate', ig: '× tanh(gate)', mod: true, d: '第二個閘門。' },
    { sd: '+ residual', ig: '+ residual', d: '一個 block 結束，輸出交給下一層。往下捲進入 §07，把 block 疊起來。' }
  ];
  function phaseOf(p) { return Math.min(PH.length - 1, Math.floor(seg(p, 0.02, 0.96) * PH.length)); }
  S.block = {
    tag: { sd: '213M params / block', ig: '264M params / block' },
    build: function (L) {
      var g = L.g, c = { nodes: [] }, sd = L.key === 'sd';
      var y0 = 34, dy = 25, nh = 19;
      var cols = sd ? [[16, 158], [186, 158]] : [[80, 200]];
      if (sd) { T(g, 95, 24, 'TEXT · W_ctx', 't-cap', 'middle'); T(g, 265, 24, 'IMAGE · W_x', 't-cap', 'middle'); }
      else T(g, 180, 24, 'TEXT + IMAGE · 共用 W', 't-cap', 'middle');
      cols.forEach(function (col) { P(g, 'M' + (col[0] + col[1] / 2) + ' ' + y0 + 'V' + (y0 + dy * (PH.length - 1) + nh), 's-line'); });
      PH.forEach(function (ph, i) {
        var y = y0 + i * dy, label = ph[L.key], group = [];
        if (sd && ph.attn) group.push(node(g, 16, y, 328, nh, label + '（兩條流拼在一起）'));
        else cols.forEach(function (col) {
          if (label) group.push(node(g, col[0], y, col[1], nh, label));
          else { var n = G(g); R(n, col[0] + col[1] / 2 - 18, y + 3, 36, nh - 6, 'ghost', 3); T(n, col[0] + col[1] / 2, y + nh / 2 + 3.5, '—', 't-d', 'middle'); group.push(n); }
        });
        c.nodes.push(group);
      });
      // 調變訊號從哪來
      var sy = y0 + dy * PH.length + 4;
      c.src = G(g);
      R(c.src, 10, sy, 340, 22, 'node', 3);
      T(c.src, 180, sy + 15, sd ? 'c = t + pooled 文字 → Linear 2432 → 6 × 2432' : 't → 512 → Linear 512 → 4 × 4608', 't-s', 'middle');
      // 參數長條：兩邊同一個比例尺
      var m = SPEC[L.key], by = sy + 34, scale = 340 / SPEC.ig.blkTotal, x = 10;
      c.bars = {};
      [['attn', 'f-l'], ['mlp', 'f-mid'], ['ada', 'f-ink3']].forEach(function (k) {
        var w = m.blk[k[0]] * scale;
        c.bars[k[0]] = R(g, x, by, w - 1, 12, k[1]);
        x += w;
      });
      T(g, 10, by + 26, 'attn ' + fmtP(m.blk.attn) + ' · MLP ' + fmtP(m.blk.mlp) + ' · adaLN ' + fmtP(m.blk.ada), 't-d');
      return c;
    },
    update: function (c, p) {
      var ph = phaseOf(p);
      c.nodes.forEach(function (group, i) {
        group.forEach(function (n) { cls(n, 'is-hot', i === ph); cls(n, 'is-past', i < ph); });
      });
      cls(c.src, 'is-hot', PH[ph].mod);
      op(c.bars.attn, PH[ph].attn || PH[ph].mlp || PH[ph].mod ? (PH[ph].attn ? 1 : 0.3) : 1);
      op(c.bars.mlp, PH[ph].attn || PH[ph].mod ? 0.3 : 1);
      op(c.bars.ada, PH[ph].attn || PH[ph].mlp ? 0.3 : 1);
    },
    stats: function (L, p) {
      var m = SPEC[L.key];
      return [['運算', (phaseOf(p) + 1) + ' / ' + PH.length], ['block 參數', fmtP(m.blkTotal)], ['adaLN 佔', (100 * m.blk.ada / m.blkTotal).toFixed(L.key === 'sd' ? 0 : 1) + '%']];
    },
    diff: function (p) { return PH[phaseOf(p)].d; }
  };

  // §07 Depth：一層一層往下
  function layerAt(key, p) { var n = SPEC[key].L; return clamp(Math.floor(seg(p, 0.02, 0.97) * n) + 1, 1, n); }
  S.depth = {
    tag: { sd: '38 layers × 2432', ig: '34 layers × 4608' },
    build: function (L) {
      var g = L.g, c = { rows: [] }, sd = L.key === 'sd', m = SPEC[L.key];
      var top = 40, h = 360, lh = h / m.L, bh = lh - 2.2, unit = 190 / 4608;
      var w = m.D * unit, x0 = 12;
      if (sd) { T(g, x0 + w / 2, 30, 'TEXT', 't-cap', 'middle'); T(g, x0 + w + 6 + w / 2, 30, 'IMAGE', 't-cap', 'middle'); }
      else T(g, x0 + w / 2, 30, 'TEXT + IMAGE', 't-cap', 'middle');
      for (var i = 0; i < m.L; i++) {
        var y = top + i * lh, parts = [];
        if (sd) {
          var last = i === m.L - 1;
          parts.push(R(g, x0 + (last ? w * 0.6 : 0), y, last ? w * 0.4 : w, bh, 'f-line', 1));
          parts.push(R(g, x0 + w + 6, y, w, bh, 'f-line', 1));
        } else parts.push(R(g, x0, y, w, bh, 'f-line', 1));
        c.rows.push(parts);
      }
      var bx = sd ? x0 + 2 * w + 6 : x0 + w;
      if (sd) {
        c.kv = T(g, x0 + w * 0.55, top + (m.L - 1) * lh + bh - 1, 'K,V', 't-d', 'end');
        c.kv.classList.add('fade');
      }
      c.mark = P(g, '', 's-l');
      var rx = 240;
      T(g, rx, 60, 'LAYER', 't-cap');
      c.n = T(g, rx, 92, '1', 't-xb');
      T(g, rx, 110, '/ ' + m.L, 't-s');
      T(g, rx, 150, 'THIS LAYER', 't-cap');
      T(g, rx, 168, fmtP(m.blkTotal) + ' params', 't-s');
      c.lf = T(g, rx, 184, '', 't-s');
      c.share = T(g, rx, 200, '', 't-d');
      T(g, rx, 240, 'SO FAR', 't-cap');
      c.cp = T(g, rx, 258, '', 't-s');
      c.cf = T(g, rx, 274, '', 't-s');
      c.cf.classList.add('t-l');
      c.top = top; c.lh = lh; c.bh = bh; c.bx = bx; c.rx = rx;
      return c;
    },
    update: function (c, p, L) {
      var key = L.key, m = SPEC[key], k = layerAt(key, p);
      var bf = blockFlops(key, key === 'sd' ? 154 : state.txt, nImg());
      c.rows.forEach(function (parts, i) {
        parts.forEach(function (r, j) {
          var cl = i + 1 < k ? (key === 'sd' && j === 0 ? 'f-soft' : 'f-mid') : i + 1 === k ? (key === 'sd' && j === 0 ? 'f-mid' : 'f-l') : 'f-line';
          r.setAttribute('class', cl);
        });
      });
      if (c.kv) op(c.kv, k === m.L ? 1 : 0);
      var y = c.top + (k - 1) * c.lh + c.bh / 2;
      c.mark.setAttribute('d', 'M' + (c.bx + 4) + ' ' + y + 'H' + (c.rx - 8));
      setText(c.n, String(k));
      setText(c.lf, fmtF(bf.total));
      setText(c.share, 'attn 佔 ' + Math.round(100 * bf.attn / bf.total) + '%');
      setText(c.cp, fmtP(k * m.blkTotal) + ' params');
      setText(c.cf, fmtF(k * bf.total));
    },
    stats: function (L, p) {
      var key = L.key, m = SPEC[key], k = layerAt(key, p);
      var bf = blockFlops(key, key === 'sd' ? 154 : state.txt, nImg());
      return [['layer', k + ' / ' + m.L], ['累積參數', fmtP(k * m.blkTotal)], ['累積計算', fmtF(k * bf.total)]];
    },
    diff: function (p) {
      var a = layerAt('sd', p), b = layerAt('ig', p);
      var fa = a * blockFlops('sd', 154, nImg()).total, fb = b * blockFlops('ig', state.txt, nImg()).total;
      if (a === SPEC.sd.L) return '走完了。一次有條件的 forward：<span class="sd">SD 3.5 ≈ ' + fmtF(passFlops('sd', 154, nImg())) + '</span>，<span class="ig">Ideogram 4 ≈ ' + fmtF(passFlops('ig', state.txt, nImg())) + '</span>。可是這只是取樣迴圈裡的一次 →';
      return '<span class="sd">SD 3.5 第 ' + a + ' / 38 層</span>、<span class="ig">Ideogram 4 第 ' + b + ' / 34 層</span>。到這裡累積 <b>' + fmtF(fa) + '</b> vs <b>' + fmtF(fb) + '</b>：Ideogram 4 每一層約 ' + (blockFlops('ig', state.txt, nImg()).total / blockFlops('sd', 154, nImg()).total).toFixed(1) + ' 倍。';
    }
  };

  // §08 Sampling
  // 目標圖：天空、太陽、招牌、狗、滑板。24 × 24 格，每格是 [r, g, b]
  var PIX = 24;
  function target(x, y) {
    var sky = [140 + y * 3, 196 + y * 1.5, 232];
    if (y >= 17) return [150, 150, 146];
    var dx = x - 5, dy = y - 5;
    if (dx * dx + dy * dy < 9) return [250, 210, 90];
    if (x >= 14 && x <= 22 && y >= 2 && y <= 6) return (y === 4 && x >= 15 && x <= 21 && x % 2) ? [245, 240, 230] : [40, 40, 42];
    var ex = (x - 9.5) / 5.5, ey = (y - 11) / 4;
    if (ex * ex + ey * ey < 1) return [226, 166, 58];
    if (x >= 5 && x <= 15 && y === 16) return [196, 57, 45];
    return sky;
  }
  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  S.sampling = {
    tag: { sd: 'DPM++ 2M · CFG 4.5', ig: 'Euler · guidance 7 → 3' },
    rebuildOnState: true,
    build: function (L) {
      var g = L.g, c = { px: [] }, sd = L.key === 'sd';
      var N = sd ? sdSteps() : state.ig;
      T(g, 12, 20, 'DENOISING · 從雜訊走到圖', 't-cap');
      var rand = rng(sd ? 7 : 11), cs = 5, ox = 12, oy = 30;
      for (var y = 0; y < PIX; y++) for (var x = 0; x < PIX; x++) {
        var r = R(g, ox + x * cs, oy + y * cs, cs, cs);
        var n = [rand() * 255, rand() * 255, rand() * 255];
        c.px.push({ r: r, n: n, t: target(x, y) });
      }
      var rx = 150;
      T(g, rx, 44, 'STEP', 't-cap');
      c.step = T(g, rx, 74, '', 't-xb');
      c.clean = T(g, rx, 96, '', 't-s');
      c.gw = T(g, rx, 112, '', 't-s');
      c.gw.classList.add('t-l');
      T(g, rx, 136, sd ? (state.sd === 'turbo' ? '每步 1 次 forward' : '每步 2 次 forward · 同一組權重') : '每步 2 次 forward · 兩組權重', 't-d');
      // 柱狀圖：每一步一根，高度 ∝ 一步的計算量，寬度兩邊一致，所以面積 ∝ 總計算量
      var cost = costs(), maxStep = Math.max(cost.sd.step, cost.ig.step);
      var maxN = Math.max(sdSteps(), state.ig), cw = 336 / maxN;
      var base = 380, H = 190, me = cost[L.key];
      var hCond = H * me.condPass / maxStep, hUn = H * me.uncondPass / maxStep;
      T(g, 12, base - H - 12, '每一步的計算量（兩邊同比例）', 't-d');
      P(g, 'M12 ' + base + 'H348', 's-line');
      c.cols = [];
      for (var i = 0; i < N; i++) {
        var x0 = 12 + i * cw, col = G(g, 'fade');
        R(col, x0, base - hCond, Math.max(1, cw - 1), hCond, 'f-l');
        if (hUn) R(col, x0, base - hCond - hUn, Math.max(1, cw - 1), hUn - 1, sd ? 'f-mid' : 'f-ink3');
        c.cols.push(col);
      }
      R(g, 12, base + 12, 10, 10, 'f-l'); T(g, 26, base + 21, '有條件', 't-s');
      if (hUn) { R(g, 84, base + 12, 10, 10, sd ? 'f-mid' : 'f-ink3'); T(g, 98, base + 21, sd ? '空 prompt（同權重）' : '只有圖片（另一組權重）', 't-s'); }
      c.total = T(g, 12, base + 46, '', 't-b');
      c.N = N;
      return c;
    },
    update: function (c, p, L) {
      var sd = L.key === 'sd', N = c.N;
      var k = Math.min(N, Math.floor(seg(p, 0.04, 0.92) * N + (p >= 0.92 ? 1 : 0)));
      var a = cleanFrac(L.key, k);
      if (c.lastK !== k) {
        c.lastK = k;
        c.px.forEach(function (q) {
          var v = [0, 1, 2].map(function (j) { return Math.round(a * q.t[j] + (1 - a) * q.n[j]); });
          q.r.setAttribute('fill', 'rgb(' + v.join(',') + ')');
        });
      }
      c.cols.forEach(function (col, i) { op(col, i < k ? 1 : 0.22); });
      setText(c.step, k + ' / ' + N);
      setText(c.clean, '乾淨的圖佔 ' + Math.round(a * 100) + '%');
      var gw;
      if (sd) gw = state.sd === 'turbo' ? 'CFG 1（不需要負向）' : 'CFG 4.5';
      else gw = 'guidance ' + (k > 0 && N - k < IG_PRESETS[N].polish ? 3 : 7);
      setText(c.gw, gw);
      var cost = costs()[L.key];
      setText(c.total, 'DiT 總計 ' + fmtF(cost.cond + cost.uncond));
    },
    stats: function (L) {
      var cost = costs()[L.key];
      return L.key === 'sd'
        ? [['步數', String(sdSteps())], ['每步', sdPasses() + ' 次 forward'], ['每步計算', fmtF(cost.step)]]
        : [['步數', String(state.ig)], ['每步', '2 次 forward'], ['每步計算', fmtF(cost.step)]];
    },
    diff: function () {
      var c = costs();
      return '<span class="sd">SD 3.5</span> ' + sdSteps() + ' 步 × ' + sdPasses() + ' 次 = ' + fmtF(c.sd.cond + c.sd.uncond) + '；<span class="ig">Ideogram 4</span> ' + state.ig + ' 步 × 2 次 = ' + fmtF(c.ig.cond + c.ig.uncond) + '。柱子的面積就是計算量。';
    }
  };

  // §09 Cost
  var GB = 2 / 1e9; // bf16：每個參數 2 bytes
  var MEM = {
    sd: [['DiT', 8.1e9, 'f-l'], ['T5-XXL', 4.8e9, 'f-mid'], ['CLIP ×2', 0.82e9, 'f-ink3']],
    ig: [['DiT', 9.3e9, 'f-l'], ['無條件 DiT', 9.3e9, 'f-mid'], ['Qwen3-VL', 8.8e9, 'f-ink3']]
  };
  function memOf(key) { return MEM[key].reduce(function (s, m) { return s + m[1]; }, 0) * GB; }
  S.cost = {
    tag: { sd: 'per image', ig: 'per image' },
    rebuildOnState: true,
    build: function (L) {
      var g = L.g, key = L.key, cost = costs(), me = cost[key];
      var max = Math.max(cost.sd.total, cost.ig.total), top = 74, H = 250, base = top + H, bx = 24, bw = 72;
      T(g, 12, 20, 'ONE IMAGE · ' + state.res + '² · ' + (key === 'sd' ? sdSteps() : state.ig) + ' 步', 't-cap');
      T(g, 12, 54, fmtF(me.total), 't-xb');
      R(g, bx, top, bw, H, 'ghost');
      var y = base;
      [['文字 encoder', me.text, 'f-ink3'], ['DiT · 有條件', me.cond, 'f-l'], ['DiT · 無條件', me.uncond, 'f-mid']].forEach(function (s) {
        if (!s[1]) return;
        var h = H * s[1] / max;
        y -= h;
        R(g, bx, y, bw, Math.max(0.5, h - (h > 2 ? 1 : 0)), s[2]);
        if (h > 9 || s[1] === me.text) {
          var ly = Math.min(base - 4, Math.max(top + 10, y + h / 2 + 4));
          if (s[1] === me.text) ly = base - 4;
          T(g, bx + bw + 12, ly, s[0] + ' · ' + fmtF(s[1]), 't-s');
        }
      });
      var other = key === 'sd' ? 'ig' : 'sd', ratio = me.total / cost[other].total;
      T(g, bx + bw + 12, top + 12, ratio >= 1 ? '對方的 ' + ratio.toFixed(2) + ' 倍' : '對方的 ' + (ratio * 100).toFixed(0) + '%', 't-s').classList.add('t-l');
      // 權重記憶體
      var my = 372, mmax = Math.max(memOf('sd'), memOf('ig')), x = 12;
      T(g, 12, my - 8, '權重（bf16）≈ ' + memOf(key).toFixed(0) + ' GB', 't-s');
      MEM[key].forEach(function (m) {
        var w = 336 * m[1] * GB / mmax;
        R(g, x, my, w - 1, 14, m[2]);
        x += w;
      });
      T(g, 12, my + 32, MEM[key].map(function (m) { return m[0] + ' ' + (m[1] * GB).toFixed(1); }).join(' · ') + ' GB', 't-d');
      return {};
    },
    update: function () {},
    stats: function (L) {
      var cost = costs(), me = cost[L.key], other = cost[L.key === 'sd' ? 'ig' : 'sd'];
      return [['總計算量', fmtF(me.total)], ['相對對方', (me.total / other.total).toFixed(2) + '×'], ['權重 bf16', '≈ ' + memOf(L.key).toFixed(0) + ' GB']];
    },
    diff: function () {
      var c = costs();
      return state.res + '²、JSON ' + num(state.txt) + ' token：一步 <span class="ig">Ideogram 4</span> 是 <span class="sd">SD 3.5</span> 的 <b>' + (c.ig.step / c.sd.step).toFixed(1) + ' 倍</b>，整張圖是 <b>' + (c.ig.total / c.sd.total).toFixed(2) + ' 倍</b>。';
    }
  };

  // ── 舞台 ───────────────────────────────────────────────────
  var stage = root.querySelector('[data-dc-stage]');
  var steps = [].slice.call(root.querySelectorAll('[data-step]'));
  var railBtns = [].slice.call(root.querySelectorAll('[data-rail]'));
  var diffEl = root.querySelector('[data-diff]');
  var lanes = [].slice.call(root.querySelectorAll('[data-lane]')).map(function (sec) {
    var L = {
      key: sec.getAttribute('data-lane'),
      svg: sec.querySelector('[data-lane-svg]'),
      stats: sec.querySelector('[data-lane-stats]'),
      tag: sec.querySelector('[data-lane-tag]'),
      g: null, c: null, statsHTML: ''
    };
    return L;
  });
  if (!stage || !steps.length || lanes.length !== 2) return;

  var current = null, active = 0, progress = 0, diffHTML = '';

  function setScene(key, instant) {
    current = key;
    lanes.forEach(function (L) {
      var old = L.g;
      if (old) {
        if (instant || reduceMotion) old.remove();
        else { old.classList.add('is-out'); setTimeout(function () { old.remove(); }, 320); }
      }
      L.g = el('g', { class: 'scene' }, L.svg);
      L.c = S[key].build(L) || {};
      setText(L.tag, S[key].tag[L.key]);
    });
  }

  function measure() {
    var vh = window.innerHeight;
    var header = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    var narrow = window.matchMedia('(max-width: 900px)').matches;
    var line = narrow ? header + stage.offsetHeight + (vh - header - stage.offsetHeight) * 0.3 : vh * 0.55;
    var idx = 0;
    for (var i = 0; i < steps.length; i++) if (steps[i].getBoundingClientRect().top <= line) idx = i;
    var r = steps[idx].getBoundingClientRect();
    var span = Math.max(1, r.height - (narrow ? 0 : vh * 0.2));
    return { idx: idx, p: clamp((line - r.top) / span, 0, 1), line: line };
  }

  function render() {
    var m = measure();
    var key = steps[m.idx].getAttribute('data-step');
    if (key !== current) {
      setScene(key);
      // 窄螢幕上導覽列放不下全部章節：把現在這一章捲到看得見的地方
      var list = railBtns[m.idx].closest('ol'), li = railBtns[m.idx].parentNode;
      if (list.scrollWidth > list.clientWidth) list.scrollTo({ left: li.offsetLeft - (list.clientWidth - li.offsetWidth) / 2, behavior: reduceMotion ? 'auto' : 'smooth' });
    }
    active = m.idx; progress = m.p;
    steps.forEach(function (s, i) { cls(s, 'is-on', i === active); });
    railBtns.forEach(function (b, i) {
      cls(b, 'is-on', i === active);
      cls(b, 'is-done', i < active);
      b.querySelector('[data-rail-bar]').style.setProperty('--p', i === active ? progress : i < active ? 1 : 0);
    });
    var sc = S[current];
    lanes.forEach(function (L) {
      sc.update(L.c, progress, L);
      var html = sc.stats(L, progress).map(function (s) { return '<div><dt>' + s[0] + '</dt><dd>' + s[1] + '</dd></div>'; }).join('');
      if (html !== L.statsHTML) { L.stats.innerHTML = html; L.statsHTML = html; }
    });
    var d = sc.diff(progress);
    if (d !== diffHTML) { diffEl.innerHTML = '<span>' + d + '</span>'; diffHTML = d; }
  }

  var queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () { queued = false; render(); });
  }

  // 章節導覽：跳到那一章的開頭
  railBtns.forEach(function (b, i) {
    b.addEventListener('click', function () {
      var m = measure();
      var top = steps[i].getBoundingClientRect().top + window.scrollY - m.line + 2;
      window.scrollTo({ top: top, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  // ── 控制項 ─────────────────────────────────────────────────
  var ctls = [].slice.call(root.querySelectorAll('[data-ctl]'));
  var outs = [].slice.call(root.querySelectorAll('[data-out]'));
  function syncControls() {
    ctls.forEach(function (n) {
      var k = n.getAttribute('data-ctl');
      if (n.tagName === 'INPUT') { if (+n.value !== state[k]) n.value = state[k]; }
      else n.setAttribute('aria-pressed', String(n.value === String(state[k])));
    });
    outs.forEach(function (o) {
      var k = o.getAttribute('data-out');
      o.textContent = k === 'res' ? state.res + ' × ' + state.res : num(state.txt) + ' tokens';
    });
  }
  ctls.forEach(function (n) {
    var k = n.getAttribute('data-ctl');
    n.addEventListener(n.tagName === 'INPUT' ? 'input' : 'click', function () {
      state[k] = k === 'sd' ? n.value : +n.value;
      syncControls();
      if (S[current].rebuildOnState || current === 'position' || current === 'attention') setScene(current, true);
      schedule();
    });
  });

  // 總表裡的數字：固定用 1024²、300 token、預設步數
  (function () {
    var saved = { res: state.res, txt: state.txt, sd: state.sd, ig: state.ig };
    state.res = 1024; state.txt = 300; state.sd = 'large'; state.ig = 20;
    var c = costs();
    var put = function (k, v) { [].forEach.call(root.querySelectorAll('[data-sum="' + k + '"]'), function (n) { n.textContent = v; }); };
    put('sdStep', fmtF(c.sd.step) + '（2 次 forward）');
    put('igStep', fmtF(c.ig.step) + '（有條件 + 只有圖片）');
    put('stepRatio', (c.ig.step / c.sd.step).toFixed(1));
    put('totalRatio', (c.ig.total / c.sd.total).toFixed(1));
    state.res = saved.res; state.txt = saved.txt; state.sd = saved.sd; state.ig = saved.ig;
  })();

  root.classList.add('is-live');
  syncControls();
  render();
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
})();
