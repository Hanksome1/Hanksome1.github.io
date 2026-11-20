/* ==========================================================================
   加速器數值格式比較（layout: number-formats）
   格式的編碼參數和說明在 layout 的 <script type="application/json" data-df-formats>，
   這裡只管數學（解碼、列舉、量化）和畫圖。總表和圖上的數字都是把編碼一個一個解碼出來算的，不手填。
   ========================================================================== */
(function () {
  'use strict';

  /* ---------- 01. 數學：解碼、列舉、量化 ---------- */

  function P2(k) { return Math.pow(2, k); }
  // round half to even
  function rne(y) { var f = Math.floor(y), d = y - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); }
  function floorLog2(a) { var e = Math.floor(Math.log2(a)); if (P2(e) > a) e--; else if (P2(e + 1) <= a) e++; return e; }
  // 從 code 取出第 lo 位開始、長 len 的欄位；用除法不用位元運算，32-bit 的 code 也不會變成負數
  function field(code, lo, len) { return Math.floor(code / P2(lo)) % P2(len); }
  function nBits(enc) { return enc.kind === 'float' ? 1 + enc.e + enc.m : enc.kind === 'posit' ? enc.n : enc.kind === 'e8m0' ? 8 : enc.bits; }

  function decFloat(enc, code, n) {
    var e = enc.e, m = enc.m, s = field(code, n - 1, 1), E = field(code, m, e), M = field(code, 0, m), top = P2(e) - 1;
    var fields = [{ t: 's', n: 1 }, { t: 'e', n: e }, { t: 'm', n: m }];
    function out(v, cls) { return { v: v, cls: cls, fields: fields, s: s, E: E, M: M }; }
    if (enc.special === 'ieee' && E === top) return M ? out(NaN, 'nan') : out(s ? -Infinity : Infinity, 'inf');
    if (enc.special === 'fn' && E === top && M === P2(m) - 1) return out(NaN, 'nan');
    if (enc.special === 'fnuz' && s === 1 && E === 0 && M === 0) return out(NaN, 'nan');
    var mag = E === 0 ? P2(1 - enc.bias - m) * M : P2(E - enc.bias) * (1 + M / P2(m));
    return out(s ? -mag : mag, mag === 0 ? 'zero' : E === 0 ? 'sub' : 'norm');
  }
  function decInt(enc, code, n) {
    var raw = code >= P2(n - 1) ? code - P2(n) : code;
    return { v: raw * P2(-enc.frac), cls: raw === 0 ? 'zero' : 'norm', raw: raw, fields: [{ t: 's', n: 1 }, { t: 'i', n: n - 1 }] };
  }
  function decPosit(enc, code, n) {
    var es = enc.es, whole = [{ t: 's', n: 1 }, { t: 'r', n: n - 1 }];
    if (code === 0) return { v: 0, cls: 'zero', fields: whole };
    if (code === P2(n - 1)) return { v: NaN, cls: 'nar', fields: whole };
    var s = field(code, n - 1, 1), c = s ? P2(n) - code : code;   // 負數先取二補數
    var i = n - 2, r0 = field(c, i, 1), k = 0;
    while (i >= 0 && field(c, i, 1) === r0) { k++; i--; }
    var rLen = k + (i >= 0 ? 1 : 0);   // regime 加上終止位元
    i--;
    var ex = 0, eLen = 0;
    for (var j = 0; j < es; j++) { ex *= 2; if (i >= 0) { ex += field(c, i, 1); i--; eLen++; } }
    var fLen = Math.max(0, i + 1), F = fLen ? field(c, 0, fLen) : 0;
    var R = r0 ? k - 1 : -k, mag = P2(R * P2(es) + ex) * (1 + F / P2(fLen));
    var fields = [{ t: 's', n: 1 }, { t: 'r', n: rLen }];
    if (eLen) fields.push({ t: 'x', n: eLen });
    if (fLen) fields.push({ t: 'f', n: fLen });
    return { v: s ? -mag : mag, cls: 'norm', fields: fields, s: s, R: R, r0: r0, k: k, ex: ex, eLen: eLen, F: F, fLen: fLen };
  }
  function decode(enc, code) {
    var n = nBits(enc);
    if (enc.kind === 'float') return decFloat(enc, code, n);
    if (enc.kind === 'int') return decInt(enc, code, n);
    if (enc.kind === 'posit') return decPosit(enc, code, n);
    if (enc.kind === 'lut') { var v = enc.values[code]; return { v: v, cls: v === 0 ? 'zero' : 'norm', fields: [{ t: 'k', n: n }] }; }
    return code === 255 ? { v: NaN, cls: 'nan', fields: [{ t: 'e', n: 8 }] } : { v: P2(code - 127), cls: 'norm', fields: [{ t: 'e', n: 8 }] };
  }

  // 16 bits 以下全部列舉：回傳排好的有限值（±0 併成一個）和每個值對應的 code
  function enumerate(enc) {
    var n = nBits(enc);
    if (n > 16) return null;
    var pairs = [], seen = Object.create(null);
    for (var c = 0; c < P2(n); c++) {
      var v = decode(enc, c).v;
      if (!isFinite(v)) continue;
      if (v === 0) v = 0;
      if (seen[v] === undefined) { seen[v] = c; pairs.push(v); }
    }
    pairs.sort(function (a, b) { return a - b; });
    var all = Float64Array.from(pairs), codes = pairs.map(function (v) { return seen[v]; });
    return { all: all, codes: codes };
  }

  function analyze(enc) {
    var A = { bits: nBits(enc) }, en = enumerate(enc);
    if (en) {
      A.all = en.all; A.codes = en.codes;
      A.pos = en.all.filter(function (v) { return v > 0; });
      A.max = A.pos[A.pos.length - 1]; A.minPos = A.pos[0]; A.count = en.all.length;
      A.bins = Object.create(null);
      A.pos.forEach(function (v) { var k = floorLog2(v); A.bins[k] = (A.bins[k] || 0) + 1; });
    } else {   // FP32、TF32：位元太多，用公式
      var emaxE = P2(enc.e) - 2 - enc.bias;
      A.max = (2 - P2(-enc.m)) * P2(emaxE); A.minPos = P2(1 - enc.bias - enc.m);
      A.count = 2 * (P2(enc.e + enc.m) - P2(enc.m)) - 1;
    }
    A.minNorm = enc.kind === 'float' ? P2(1 - enc.bias) : null;   // 只有浮點分 normal / subnormal
    A.range = Math.log2(A.max / A.minPos);
    A.emax = floorLog2(A.max);
    A.kLo = floorLog2(A.minPos); A.kHi = A.emax;
    A.peak = 0;
    for (var k = A.kLo; k <= A.kHi; k++) A.peak = Math.max(A.peak, Math.log2(binCount(enc, A, k) || 1));
    return A;
  }
  // [2^k, 2^(k+1)) 裡有幾個正值
  function binCount(enc, A, k) {
    if (A.bins) return A.bins[k] || 0;
    var emin = 1 - enc.bias, lo = emin - enc.m;
    return k > A.emax ? 0 : k >= emin ? P2(enc.m) : k >= lo ? P2(k - lo) : 0;
  }

  // 元素的量化：回傳一個 x → 最近的可表示值（round to nearest even，超過最大值飽和）
  function quantizer(enc, A) {
    if (enc.kind === 'float') {
      if (enc.e === 8 && enc.m === 23) return Math.fround;
      var emin = 1 - enc.bias, m = enc.m, max = A.max;
      return function (x) {
        if (x === 0 || x !== x) return x;
        var a = Math.abs(x), st = P2(Math.max(floorLog2(a), emin) - m), q = rne(a / st) * st;
        if (q > max) q = max;
        return x < 0 ? -q : q;
      };
    }
    if (enc.kind === 'int') {
      var f = P2(enc.frac), qm = P2(enc.bits - 1) - 1;   // 對稱：不用 −2^(n−1)
      return function (x) { var q = rne(x * f); return (q > qm ? qm : q < -qm ? -qm : q) / f; };
    }
    // posit、查表：在排好的值裡找最近的
    var all = A.all, last = all.length - 1, isPosit = enc.kind === 'posit', minpos = A.minPos;
    return function (x) {
      if (x <= all[0]) return all[0];
      if (x >= all[last]) return all[last];
      var lo = 0, hi = last;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (all[mid] <= x) lo = mid; else hi = mid; }
      var q = x - all[lo] <= all[hi] - x ? all[lo] : all[hi];
      if (isPosit && q === 0 && x !== 0) q = x < 0 ? -minpos : minpos;   // posit 不會 underflow 成 0
      return q;
    };
  }

  var ENC_E4M3 = { kind: 'float', e: 4, m: 3, bias: 7, special: 'fn' };
  var ENC_FP16 = { kind: 'float', e: 5, m: 10, bias: 15, special: 'ieee' };
  var qE4M3 = quantizer(ENC_E4M3, analyze(ENC_E4M3));
  var qFP16 = quantizer(ENC_FP16, analyze(ENC_FP16));
  var SCALE_BITS = { e8m0: 8, ue4m3: 8, fp32: 32 };

  function absmax(x, lo, hi) { var m = 0; for (var i = lo; i < hi; i++) { var a = Math.abs(x[i]); if (a > m) m = a; } return m; }

  // 整個 tensor 量化一次。opt.scaling：tensor / group / pow2 / none（只用在沒有 block 的格式）；opt.group：0 = 依規格
  function quantize(f, x, opt) {
    var A = f.A, q = f.q, N = x.length, out = new Float64Array(N), segs = [], clip = 0, zero = 0, bitsPer = f.encBits, desc;
    function run(lo, hi, s, amax) {
      segs.push({ lo: lo, hi: hi, s: s, amax: amax });
      for (var i = lo; i < hi; i++) {
        if (!s) { out[i] = 0; if (x[i] !== 0) zero++; continue; }
        var y = x[i] / s;
        if (Math.abs(y) > A.max) clip++;
        var r = q(y) * s;
        out[i] = r;
        if (r === 0 && x[i] !== 0) zero++;
      }
    }
    var B = f.block, g, lo, hi, am, tAmax = absmax(x, 0, N);
    if (B) {
      g = opt.group || B.size;
      bitsPer += SCALE_BITS[B.scale] / g;
      if (B.scale === 'e8m0') {
        desc = 'block ' + g + ' · E8M0';
        for (lo = 0; lo < N; lo += g) {
          hi = Math.min(N, lo + g); am = absmax(x, lo, hi);
          run(lo, hi, am ? P2(Math.max(-127, Math.min(127, floorLog2(am) - A.emax))) : 0, am);
        }
      } else if (B.scale === 'ue4m3') {
        desc = 'block ' + g + ' · E4M3 + FP32';
        var st = tAmax / (448 * A.max);
        for (lo = 0; lo < N; lo += g) {
          hi = Math.min(N, lo + g); am = absmax(x, lo, hi);
          run(lo, hi, am ? qE4M3(am / A.max / st) * st : 0, am);
        }
      } else {
        desc = 'block ' + g + ' · FP32 absmax';
        for (lo = 0; lo < N; lo += g) { hi = Math.min(N, lo + g); am = absmax(x, lo, hi); run(lo, hi, am / A.max, am); }
      }
    } else if (opt.scaling === 'group' && f.encBits <= 8) {
      g = opt.group || 128;
      bitsPer += 16 / g;
      desc = 'group ' + g + ' · FP16 absmax';
      for (lo = 0; lo < N; lo += g) { hi = Math.min(N, lo + g); am = absmax(x, lo, hi); run(lo, hi, qFP16(am / A.max), am); }
    } else if (opt.scaling === 'pow2') {
      // 每個格式自己找一個讓誤差最小的 2^k：用四分之一的資料加上所有的大值找（大值被截掉的誤差最大），再套用到全部
      var k0 = floorLog2(tAmax) - A.emax - 2, best = k0, bestE = Infinity, idx = [];
      for (var i = 0; i < N; i++) if (i % 4 === 0 || Math.abs(x[i]) > tAmax / 2) idx.push(i);
      for (var k = k0; k <= k0 + 50; k++) {
        var s = P2(k), err = 0;
        for (var ii = 0; ii < idx.length; ii++) { var d = x[idx[ii]] - q(x[idx[ii]] / s) * s; err += d * d; }
        if (err < bestE) { bestE = err; best = k; }
      }
      desc = '2ᵏ，k = ' + fmtInt(best);
      run(0, N, P2(best), tAmax);
    } else if (opt.scaling === 'none') {
      desc = '不縮放';
      run(0, N, 1, tAmax);
    } else {
      desc = 'per-tensor absmax' + (opt.scaling === 'group' ? '（16 bits 以上不分組）' : '');
      run(0, N, tAmax / A.max, tAmax);
    }
    var sig = 0, noise = 0;
    for (var j = 0; j < N; j++) { var e = x[j] - out[j]; sig += x[j] * x[j]; noise += e * e; }
    return { out: out, segs: segs, clip: clip / N, zero: zero / N, bitsPer: bitsPer, desc: desc, sqnr: noise ? 10 * Math.log10(sig / noise) : Infinity };
  }

  /* ---------- 02. 資料：固定種子 ---------- */

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  var TOKENS = 32, CHANNELS = 256, OUTLIER_CH = [7, 141];
  // 每一種分佈的變異數都是 1；outlier channel 再乘上倍數
  function makeData(dist, seed, mult) {
    var R = mulberry32(seed), N = TOKENS * CHANNELS, x = new Float64Array(N);
    function gauss() { return Math.sqrt(-2 * Math.log(1 - R())) * Math.cos(2 * Math.PI * R()); }
    for (var i = 0; i < N; i++) {
      var v;
      if (dist === 'laplace') { var u = R() - 0.5; v = -Math.SQRT1_2 * Math.sign(u) * Math.log(Math.max(1e-12, 1 - 2 * Math.abs(u))); }
      else if (dist === 't3') { var z = gauss(), a = gauss(), b = gauss(), c = gauss(); v = z / Math.sqrt((a * a + b * b + c * c) / 3) / Math.sqrt(3); }
      else if (dist === 'uniform') v = (R() * 2 - 1) * Math.sqrt(3);
      else v = gauss();
      if (dist === 'outlier' && OUTLIER_CH.indexOf(i % CHANNELS) > -1) v *= mult;
      x[i] = v;
    }
    return x;
  }

  /* ---------- 03. 數字格式化 ---------- */

  var SUP = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
  function sup(n) { return String(n).replace(/[-0-9]/g, function (c) { return SUP[c]; }); }
  function fmtInt(n) { return String(n).replace('-', '−'); }
  function isP2(v) { var a = Math.abs(v); return a > 0 && isFinite(a) && P2(floorLog2(a)) === a; }
  function num(v, d) {
    if (v !== v) return 'NaN';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (v === 0) return Object.is(v, -0) ? '−0' : '0';
    var a = Math.abs(v), s;
    if (a >= 1e6 || a < 1e-4) s = a.toExponential((d || 4) - 1).replace(/\.?0+e/, 'e').replace('e+', 'e').replace('e-', 'e−');
    else s = String(+a.toPrecision(d || 7));
    return (v < 0 ? '−' : '') + s;
  }
  function compact(v) {
    if (v !== v) return 'NaN';
    if (!isFinite(v)) return v > 0 ? '∞' : '−∞';
    if (v === 0) return Object.is(v, -0) ? '−0' : '0';
    var a = Math.abs(v), s;
    if (a >= 1e4 || a < 0.01) s = isP2(a) ? '2' + sup(floorLog2(a)) : a.toExponential(1).replace('.0e', 'e').replace('e+', 'e').replace('e-', 'e−');
    else s = String(+a.toPrecision(3));
    return (v < 0 ? '−' : '') + s;
  }
  function p2tag(v) { return isP2(v) ? ' <small>2' + sup(floorLog2(Math.abs(v))) + '</small>' : ''; }
  function fix(v, d) { return v.toFixed(d).replace('-', '−'); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // 給 Node 測試用：沒有 document 時只匯出數學
  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined') module.exports = { decode: decode, enumerate: enumerate, analyze: analyze, quantizer: quantizer, quantize: quantize, makeData: makeData, binCount: binCount, prep: prep };
    return;
  }

  var root = document.querySelector('[data-df]');
  if (!root) return;
  var cfgEl = root.querySelector('[data-df-formats]');
  var CFG = JSON.parse(cfgEl.textContent);

  /* ---------- 04. 格式表：每個格式先算好 ---------- */

  function prep(cfg) {
    var byId = {};
    cfg.formats.forEach(function (f, i) {
      f.idx = i;
      f.A = analyze(f.enc);
      f.q = quantizer(f.enc, f.A);
      f.encBits = f.A.bits;
      f.bitsPer = f.A.bits + (f.block ? SCALE_BITS[f.block.scale] / f.block.size : 0);
      byId[f.id] = f;
    });
    return byId;
  }
  var FMT = CFG.formats, byId = prep(CFG);

  var PRESETS = {
    default: ['fp16', 'bf16', 'fp8e4m3', 'fp8e5m2', 'int8', 'posit8', 'fp4', 'int4', 'nf4', 'mxfp8e4m3', 'mxfp4', 'mxint8', 'nvfp4'],
    b8: ['fp8e4m3', 'fp8e4m3fnuz', 'fp8e5m2', 'int8', 'posit8', 'posit8e0', 'mxfp8e4m3', 'mxfp8e5m2', 'mxint8'],
    b4: ['fp4', 'int4', 'nf4', 'mxfp4', 'mxint4', 'nvfp4'],
    mx: ['mxfp8e4m3', 'mxfp8e5m2', 'mxfp6e3m2', 'mxfp6e2m3', 'mxfp4', 'mxint8', 'mxint4', 'nvfp4', 'nf4'],
    all: FMT.map(function (f) { return f.id; })
  };
  var FAMILY = { float: '浮點', int: '整數', other: 'Posit / 查表' };
  var SPECIAL = { ieee: '±∞ · NaN', fn: 'NaN', fnuz: 'NaN（0x80）', none: '—' };
  function specialOf(f) { return f.enc.kind === 'float' ? SPECIAL[f.enc.special] : f.enc.kind === 'posit' ? 'NaR' : '—'; }
  function scaleOf(f) {
    if (!f.block) return '—';
    return f.block.scale === 'e8m0' ? 'E8M0 / ' + f.block.size : f.block.scale === 'ue4m3' ? 'E4M3 / ' + f.block.size + ' + FP32' : 'FP32 / ' + f.block.size;
  }
  function bitsNum(b) { return String(+b.toFixed(3)); }
  function bitsText(f) { return bitsNum(f.bitsPer); }

  /* ---------- 05. 狀態 ---------- */

  var state = { sel: {}, rangeMode: 'raw', dist: 'gauss', mult: 20, scaling: 'tensor', group: 0, seed: 1, gridX: 'amax', gridBlock: 'max', sort: { key: 'idx', dir: 1 } };
  var saved = null;
  try { saved = JSON.parse(localStorage.getItem('df-sel') || 'null'); } catch (e) {}
  (Array.isArray(saved) && saved.length ? saved : PRESETS.default).forEach(function (id) { if (byId[id]) state.sel[id] = true; });
  function selected() { return FMT.filter(function (f) { return state.sel[f.id]; }); }
  function saveSel() { try { localStorage.setItem('df-sel', JSON.stringify(Object.keys(state.sel))); } catch (e) {} }

  function $(s, r) { return (r || root).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || root).querySelectorAll(s)); }
  function seg(sel, cb) {
    var box = $(sel);
    box.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-v]');
      if (!b) return;
      $$('button', box).forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      cb(b.getAttribute('data-v'));
    });
  }

  /* ---------- 06. 選格式 ---------- */

  var pick = $('[data-pick]'), pickToggle = $('[data-pick-toggle]');
  function chipHTML(f) {
    return '<button type="button" class="df-chip" data-family="' + f.family + '" data-id="' + f.id + '" aria-pressed="false"><i aria-hidden="true"></i>' + esc(f.name) + (f.block ? '<span class="df-badge">▦</span>' : '') + '</button>';
  }
  pick.innerHTML = CFG.groups.map(function (g) {
    return '<div class="df-pick-group"><span class="df-field-label">' + esc(g.name) + '</span><div class="df-chips">' +
      FMT.filter(function (f) { return f.group === g.id; }).map(chipHTML).join('') + '</div></div>';
  }).join('');
  pick.addEventListener('click', function (e) {
    var b = e.target.closest('.df-chip');
    if (!b) return;
    var id = b.getAttribute('data-id');
    if (state.sel[id]) { if (selected().length > 1) delete state.sel[id]; } else state.sel[id] = true;
    onSelect();
  });
  pickToggle.addEventListener('click', function () {
    var open = pick.hidden;
    pick.hidden = !open;
    pickToggle.setAttribute('aria-expanded', String(open));
  });
  $('[data-presets]').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-preset]');
    if (!b) return;
    state.sel = {};
    PRESETS[b.getAttribute('data-preset')].forEach(function (id) { state.sel[id] = true; });
    onSelect();
  });
  function syncPicker() {
    var ids = selected().map(function (f) { return f.id; }).join(',');
    $$('.df-chip', pick).forEach(function (b) { b.setAttribute('aria-pressed', String(!!state.sel[b.getAttribute('data-id')])); });
    $$('[data-preset]').forEach(function (b) { b.setAttribute('aria-pressed', String(PRESETS[b.getAttribute('data-preset')].filter(function (id) { return byId[id]; }).sort(byIdx).join(',') === ids)); });
    $('[data-count]').textContent = selected().length;
  }
  function byIdx(a, b) { return byId[a].idx - byId[b].idx; }
  function onSelect() { saveSel(); syncPicker(); drawSpec(); drawRange(); runQuant(); }

  /* ---------- 07. 總表 ---------- */

  var COLS = [
    { key: 'idx', label: '格式' },
    { key: 'layout', label: '位元配置', nosort: true },
    { key: 'bitsPer', label: 'bits / 值', num: true },
    { key: 'max', label: '最大值', num: true },
    { key: 'minNorm', label: '最小正規值', num: true },
    { key: 'minPos', label: '最小正值', num: true },
    { key: 'range', label: '動態範圍', num: true },
    { key: 'peak', label: '峰值精度', num: true },
    { key: 'count', label: '不同的值', num: true },
    { key: 'special', label: '特殊值', nosort: true },
    { key: 'scale', label: 'Scale', nosort: true }
  ];
  function sortVal(f, key) {
    if (key === 'idx' || key === 'bitsPer') return f[key];
    var v = f.A[key];
    return v == null ? -Infinity : v;
  }
  function nameCell(f) {
    return '<span class="df-name" data-family="' + f.family + '"><i aria-hidden="true"></i><a href="#fmt-' + f.id + '">' + esc(f.name) + '</a>' +
      (f.block ? '<span class="df-badge" title="block scaling：每 ' + f.block.size + ' 個值共用一個 scale">▦</span>' : '') + '</span>';
  }
  function layoutCell(f) {
    var A = f.A, enc = f.enc, parts;
    if (enc.kind === 'float') parts = [['s', 1], ['e', enc.e], ['m', enc.m]];
    else if (enc.kind === 'int') parts = [['s', 1], ['i', enc.bits - 1]];
    else if (enc.kind === 'posit') parts = [['s', 1], ['r', A.bits - 1]];
    else parts = [['k', A.bits]];
    var bar = parts.map(function (p) { return '<span data-t="' + p[0] + '" style="flex:' + p[1] + '"></span>'; }).join('');
    return '<span class="df-lay"><span class="df-lay-bar" style="width:' + Math.min(A.bits, 32) * 3 + 'px">' + bar + '</span>' + esc(f.layout) + '</span>';
  }
  function drawSpec() {
    var t = $('[data-spec]'), k = state.sort.key, dir = state.sort.dir;
    var rows = selected().slice().sort(function (a, b) { return (sortVal(a, k) - sortVal(b, k)) * dir || a.idx - b.idx; });
    var head = '<thead><tr>' + COLS.map(function (c) {
      var on = c.key === k;
      return c.nosort ? '<th scope="col">' + c.label + '</th>'
        : '<th scope="col"' + (on ? ' aria-sort="' + (dir > 0 ? 'ascending' : 'descending') + '"' : '') + '><button type="button" data-sort="' + c.key + '">' + c.label + '<i aria-hidden="true">' + (on ? (dir > 0 ? '↑' : '↓') : '↕') + '</i></button></th>';
    }).join('') + '</tr></thead>';
    var body = '<tbody>' + rows.map(function (f) {
      var A = f.A;
      return '<tr>' +
        '<th scope="row">' + nameCell(f) + '</th>' +
        '<td>' + layoutCell(f) + '</td>' +
        '<td class="n">' + bitsText(f) + (f.storeBits ? '<small>存 ' + f.storeBits + '</small>' : '') + '</td>' +
        '<td class="n">' + num(A.max, 5) + p2tag(A.max) + '</td>' +
        '<td class="n">' + (A.minNorm == null ? '—' : num(A.minNorm, 4) + p2tag(A.minNorm)) + '</td>' +
        '<td class="n">' + num(A.minPos, 4) + p2tag(A.minPos) + '</td>' +
        '<td class="n">' + fix(A.range, 1) + '<small>binade</small></td>' +
        '<td class="n">' + fix(A.peak, A.peak % 1 ? 1 : 0) + '<small>bits</small></td>' +
        '<td class="n">' + (A.count > 1e6 ? num(A.count, 3) : A.count.toLocaleString('en-US')) + '</td>' +
        '<td>' + specialOf(f) + '</td>' +
        '<td>' + scaleOf(f) + '</td></tr>';
    }).join('') + '</tbody>';
    t.innerHTML = head + body;
  }
  $('[data-spec]').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-sort]');
    if (!b) return;
    var k = b.getAttribute('data-sort');
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : (k === 'idx' ? 1 : -1) };
    drawSpec();
  });
  $('[data-legend]').innerHTML = Object.keys(FAMILY).map(function (k) { return '<span class="df-name" data-family="' + k + '"><i aria-hidden="true"></i>' + FAMILY[k] + '</span>'; }).join('') +
    '<span><span class="df-badge">▦</span> block scaling</span>' +
    '<span class="df-lay-key"><span data-t="s"></span>符號 <span data-t="e"></span>指數 / regime <span data-t="m"></span>mantissa / 整數 / 索引</span>';

  /* ---------- 08. SVG 小工具與 tooltip ---------- */

  var NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function r1(v) { return Math.round(v * 10) / 10; }
  function powLabel(parent, x, y, k, cls) {
    var t = el('text', { x: x, y: y, 'class': cls || 'ax', 'text-anchor': 'middle' }, parent, '2');
    el('tspan', { dy: -4, 'font-size': '0.78em' }, t, fmtInt(k));
    return t;
  }
  function tipFor(box) {
    var tip = box.querySelector('.df-tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'df-tip'; tip.hidden = true; box.appendChild(tip); }
    return {
      show: function (html, px, py) {
        tip.innerHTML = html; tip.hidden = false;
        var bw = box.clientWidth, tw = tip.offsetWidth, th = tip.offsetHeight;
        var left = px + 14 + tw > bw ? px - 14 - tw : px + 14;
        tip.style.left = Math.max(4, left) + 'px';
        tip.style.top = Math.max(4, py - th - 10) + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }
  function nearestIdx(arr, v) {
    var lo = 0, hi = arr.length - 1;
    if (v <= arr[0]) return 0;
    if (v >= arr[hi]) return hi;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (arr[mid] <= v) lo = mid; else hi = mid; }
    return v - arr[lo] <= arr[hi] - v ? lo : hi;
  }

  /* ---------- 09. 值域與精度 ---------- */

  var rangeBox = $('[data-range-chart]'), rangeTip = tipFor(rangeBox);
  function drawRange() {
    var W = rangeBox.clientWidth;
    if (!W) return;
    var fs = selected(), mode = state.rangeMode, narrow = W < 640;
    var LW = narrow ? 100 : 150, RW = narrow ? 8 : 92, TOP = 34, RH = narrow ? 40 : 46, BOT = 10;
    function off(f) { return mode === 'align' ? Math.log2(f.A.max) : 0; }
    // 橫軸範圍：BF16、FP32 這種值域上百個 binade 的不算進來（兩端畫箭頭），不然 8-bit 的會擠成一點
    var lo = Infinity, hi = -Infinity, cap = 1, narrowFs = fs.filter(function (f) { return f.A.range <= 100; });
    (narrowFs.length ? narrowFs : fs).forEach(function (f) {
      lo = Math.min(lo, Math.log2(f.A.minPos) - off(f));
      hi = Math.max(hi, Math.log2(f.A.max) - off(f));
    });
    fs.forEach(function (f) { cap = Math.max(cap, f.A.peak); });
    lo = Math.max(Math.floor(lo) - 1, -42);
    hi = mode === 'align' ? 1 : Math.min(Math.ceil(hi) + 1, 42);
    if (mode === 'raw') { lo = Math.min(lo, -2); hi = Math.max(hi, 3); }
    cap = Math.min(10, Math.ceil(cap));
    var H = TOP + fs.length * RH + BOT, PW = W - LW - RW;
    function X(l) { return LW + (l - lo) / (hi - lo) * PW; }
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'class': narrow ? 'df-svg is-narrow' : 'df-svg', role: 'img',
      'aria-label': '值域與精度分佈：' + fs.map(function (f) { return f.name + ' 值域 ' + fix(f.A.range, 1) + ' binade'; }).join('、') });

    // 格線：每個整數 k 一條，標籤間距至少 34px
    var px = PW / (hi - lo), step = [1, 2, 4, 5, 8, 10, 16, 20].filter(function (s) { return s * px >= 34; })[0] || 20;
    var grid = el('g', {}, svg);
    for (var k = Math.ceil(lo); k <= Math.floor(hi); k++) {
      el('line', { x1: r1(X(k)), x2: r1(X(k)), y1: TOP - 6, y2: H - BOT, 'class': k === 0 ? 'gl gl0' : 'gl' }, grid);
      if (k % step === 0) {
        if (mode === 'align' && k === 0) el('text', { x: X(0), y: TOP - 12, 'class': 'ax ax0', 'text-anchor': 'middle' }, grid, 'max');
        else powLabel(grid, X(k), TOP - 12, k, k === 0 ? 'ax ax0' : 'ax');
      }
    }
    if (!narrow) {
      el('text', { x: W - RW + 12, y: TOP - 12, 'class': 'ax' }, svg, '值域');
      el('text', { x: W - 4, y: TOP - 12, 'class': 'ax', 'text-anchor': 'end' }, svg, '精度');
    }

    fs.forEach(function (f, i) {
      var A = f.A, o = off(f), y0 = TOP + i * RH, base = y0 + RH - 13, pxBit = (RH - 19) / cap;
      var g = el('g', { 'class': 'row', 'data-family': f.family }, svg);
      if (i) el('line', { x1: 0, x2: W, y1: y0, y2: y0, 'class': 'sep' }, g);
      el('text', { x: LW - 10, y: base - 7, 'class': 'nm', 'text-anchor': 'end' }, g, f.name + (f.block ? ' ▦' : ''));
      el('text', { x: LW - 10, y: base + 6, 'class': 't-d', 'text-anchor': 'end' }, g, bitsText(f) + ' bits' + (narrow ? '' : ' · ' + f.layout));

      // 精度：每個 binade 一格，高度 = log2(這一格有幾個值)；只畫在最小正值到最大值之間
      var lMin = Math.log2(A.minPos) - o, lNorm = A.minNorm ? Math.log2(A.minNorm) - o : lMin, lMax = Math.log2(A.max) - o;
      var d = '', started = false, lastX = 0;
      for (var b = Math.max(A.kLo, Math.floor(lo + o) - 1); b <= Math.min(A.kHi, Math.ceil(hi + o)); b++) {
        var c = binCount(f.enc, A, b);
        var xa = Math.max(LW, X(b - o), X(lMin)), xb = Math.min(W - RW, X(b + 1 - o), X(lMax));
        if (xb <= xa) continue;
        var hgt = c ? Math.max(1.5, Math.min(Math.log2(c), cap) * pxBit) : 0, y = r1(base - hgt);
        if (!started) { d += 'M' + r1(xa) + ',' + base + 'V' + y; started = true; } else d += 'V' + y;
        d += 'H' + r1(xb);
        lastX = xb;
      }
      if (started) el('path', { d: d + 'V' + base + 'H' + r1(lastX) + 'Z', 'class': 'prec' }, g);

      // 值域線：subnormal 那段畫虛線
      function clampX(l) { return Math.max(LW, Math.min(W - RW, X(l))); }
      if (f.block && mode === 'raw') el('line', { x1: LW, x2: W - RW, y1: base, y2: base, 'class': 'ext' }, g);
      if (lNorm > lMin) el('line', { x1: r1(clampX(lMin)), x2: r1(clampX(lNorm)), y1: base, y2: base, 'class': 'rng rng-sub' }, g);
      el('line', { x1: r1(clampX(lNorm)), x2: r1(clampX(lMax)), y1: base, y2: base, 'class': 'rng' }, g);
      if (lMin < lo) el('text', { x: LW + 2, y: base - 3, 'class': 't-d' }, g, '◀ 2' + sup(Math.floor(lMin)));
      if (lMax > hi) el('text', { x: W - RW - 2, y: base - 3, 'class': 't-d', 'text-anchor': 'end' }, g, '2' + sup(Math.ceil(lMax)) + ' ▶');

      // 每一個可以表示的正值一根刻度
      if (A.pos && A.pos.length <= 600) {
        var t = '';
        for (var j = 0; j < A.pos.length; j++) {
          var l = Math.log2(A.pos[j]) - o;
          if (l < lo || l > hi) continue;
          t += 'M' + r1(X(l)) + ',' + (base + 2) + 'v5';
        }
        if (t) el('path', { d: t, 'class': 'tick' }, g);
      }
      if (!narrow) {
        el('text', { x: W - RW + 12, y: base - 7, 'class': 'nm' }, g, fix(A.range, 1));
        el('text', { x: W - RW + 12, y: base + 6, 'class': 't-d' }, g, 'binade');
        el('text', { x: W - 4, y: base - 7, 'class': 'nm', 'text-anchor': 'end' }, g, fix(A.peak, A.peak % 1 ? 1 : 0));
        el('text', { x: W - 4, y: base + 6, 'class': 't-d', 'text-anchor': 'end' }, g, 'bits');
      }
    });

    var cross = el('line', { y1: TOP - 6, y2: H - BOT, 'class': 'cross', visibility: 'hidden' }, svg);
    var hit = el('rect', { x: LW, y: TOP, width: PW, height: fs.length * RH, 'class': 'hit' }, svg);
    function move(e) {
      var r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      var i = Math.floor((my - TOP) / RH), f = fs[i];
      if (!f) return leave();
      var A = f.A, o = off(f), l = lo + (mx - LW) / PW * (hi - lo), b = Math.floor(l + o), c = binCount(f.enc, A, b), html, cx = mx;
      html = '<b>' + esc(f.name) + '</b>';
      if (A.pos) {
        var j = nearestIdx(A.pos.map(Math.log2), l + o), v = A.pos[j];
        cx = X(Math.log2(v) - o);
        html += '<span>最接近的值 <em>' + num(v, 6) + '</em>' + p2tag(v) + '</span>';
        if (j < A.pos.length - 1) html += '<span>下一個值 ' + num(A.pos[j + 1], 6) + '，間距 ' + fix((A.pos[j + 1] / v - 1) * 100, 1) + '%</span>';
        if (mode === 'align') html += '<span>= 最大值 × 2' + sup(fix(Math.log2(v) - o, 2).replace('.00', '')) + '</span>';
      }
      html += '<span>這個 binade [2' + sup(b) + ', 2' + sup(b + 1) + ') 有 ' + c.toLocaleString('en-US') + ' 個值' + (c ? '，' + fix(Math.log2(c), 1) + ' bits' : '') + '</span>';
      if (f.block && mode === 'raw') html += '<span>▦ 乘上 scale 之後整段可以平移</span>';
      cross.setAttribute('x1', r1(cx)); cross.setAttribute('x2', r1(cx)); cross.setAttribute('visibility', 'visible');
      rangeTip.show(html, mx, TOP + i * RH + 6);
    }
    function leave() { cross.setAttribute('visibility', 'hidden'); rangeTip.hide(); }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerleave', leave);
    var old = rangeBox.querySelector('svg');
    if (old) rangeBox.replaceChild(svg, old); else rangeBox.insertBefore(svg, rangeBox.firstChild);
  }
  seg('[data-range-mode]', function (v) { state.rangeMode = v; drawRange(); });

  /* ---------- 10. 量化實驗 ---------- */

  var DATA = null, RES = {};
  function opt() { return { scaling: state.scaling, group: state.group }; }
  function makeDATA() {
    var x = makeData(state.dist, state.seed, state.mult), s2 = 0;
    for (var i = 0; i < x.length; i++) s2 += x[i] * x[i];
    DATA = { x: x, amax: absmax(x, 0, x.length), sigma: Math.sqrt(s2 / x.length) };
  }
  function runQuant() {
    if (!DATA) makeDATA();
    RES = {};
    selected().forEach(function (f) { RES[f.id] = quantize(f, DATA.x, opt()); });
    drawResults();
    drawGrid();
  }
  function drawResults() {
    var rows = selected().slice().sort(function (a, b) { return RES[b.id].sqnr - RES[a.id].sqnr || a.idx - b.idx; });
    var finite = rows.map(function (f) { return RES[f.id].sqnr; }).filter(isFinite);
    var top = Math.min(80, Math.max.apply(null, finite.concat([10])));
    $('[data-results]').innerHTML = '<thead><tr><th scope="col">格式</th><th scope="col" class="df-sqnr-h">SQNR（dB）</th><th scope="col" class="n">bits / 值</th><th scope="col" class="n">變成 0</th><th scope="col" class="n">飽和</th><th scope="col">縮放</th></tr></thead><tbody>' +
      rows.map(function (f) {
        var r = RES[f.id], w = isFinite(r.sqnr) ? Math.max(0, Math.min(1, r.sqnr / top)) : 1;
        return '<tr><th scope="row">' + nameCell(f) + '</th>' +
          '<td class="df-sqnr"><div><span class="df-sqnr-bar" data-family="' + f.family + '"><i style="width:' + fix(w * 100, 1) + '%"></i>' + (r.sqnr > top ? '<b aria-hidden="true">›</b>' : '') + '</span><em>' + (isFinite(r.sqnr) ? fix(r.sqnr, 1) : '∞') + '</em></div></td>' +
          '<td class="n">' + bitsNum(r.bitsPer) + '</td>' +
          '<td class="n">' + pct(r.zero) + '</td><td class="n">' + pct(r.clip) + '</td>' +
          '<td class="df-desc">' + esc(r.desc) + '</td></tr>';
      }).join('') + '</tbody>';
  }
  function pct(v) { return v === 0 ? '0' : v < 0.0005 ? '&lt;0.1%' : fix(v * 100, 1) + '%'; }

  var gridBox = $('[data-grid-chart]'), gridTip = tipFor(gridBox);
  function pickSeg(r) {
    var segs = r.segs.filter(function (s) { return s.s > 0; });
    if (!segs.length) return null;
    if (state.gridBlock === 'max' || segs.length === 1) return segs.reduce(function (a, b) { return b.amax > a.amax ? b : a; });
    var sorted = segs.slice().sort(function (a, b) { return a.amax - b.amax; });
    return sorted[Math.floor(sorted.length / 2)];
  }
  function drawGrid() {
    var W = gridBox.clientWidth;
    if (!W || !DATA) return;
    var fs = selected(), narrow = W < 640, x = DATA.x;
    var D = state.gridX === 'amax' ? DATA.amax : 3 * DATA.sigma;
    var LW = narrow ? 100 : 150, RW = 12, TOP = 16, HH = 86, AX = 22, RH = narrow ? 26 : 28, BOT = 8;
    var H = TOP + HH + AX + fs.length * RH + BOT, PW = W - LW - RW;
    function X(v) { return LW + (v + D) / (2 * D) * PW; }
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H, 'class': narrow ? 'df-svg is-narrow' : 'df-svg', role: 'img', 'aria-label': '資料直方圖與每個格式的量化格點' });

    // 直方圖
    var NB = narrow ? 61 : 101, bins = new Array(NB).fill(0), out = 0;
    for (var i = 0; i < x.length; i++) {
      var bi = Math.floor((x[i] + D) / (2 * D) * NB);
      if (bi < 0 || bi >= NB) { if (x[i] === D || x[i] === -D) bi = x[i] > 0 ? NB - 1 : 0; else { out++; continue; } }
      bins[bi]++;
    }
    var bmax = Math.max.apply(null, bins), bw = PW / NB, hd = '';
    bins.forEach(function (c, j) {
      if (!c) return;
      var h = Math.max(1, c / bmax * (HH - 6)), x0 = LW + j * bw;
      hd += 'M' + r1(x0 + 0.5) + ',' + (TOP + HH) + 'v' + r1(-h) + 'h' + r1(Math.max(0.6, bw - 1)) + 'v' + r1(h) + 'Z';
    });
    el('path', { d: hd, 'class': 'hist' }, svg);
    el('text', { x: LW - 10, y: TOP + HH - 6, 'class': 'nm', 'text-anchor': 'end' }, svg, '資料');
    el('text', { x: LW - 10, y: TOP + HH + 7, 'class': 't-d', 'text-anchor': 'end' }, svg, out ? out + ' 個在範圍外' : x.length + ' 個值');
    // 橫軸
    var ay = TOP + HH;
    el('line', { x1: LW, x2: W - RW, y1: ay, y2: ay, 'class': 'axl' }, svg);
    [-1, -0.5, 0, 0.5, 1].forEach(function (t) {
      var xx = X(t * D);
      el('line', { x1: r1(xx), x2: r1(xx), y1: ay, y2: H - BOT, 'class': t ? 'gl' : 'gl gl0' }, svg);
      el('text', { x: r1(xx), y: ay + 15, 'class': 'ax', 'text-anchor': t === -1 ? 'start' : t === 1 ? 'end' : 'middle' }, svg, num(t * D, 3));
    });

    var rowsInfo = [];
    fs.forEach(function (f, i) {
      var r = RES[f.id], sg = pickSeg(r), y0 = TOP + HH + AX + i * RH, mid = y0 + RH / 2;
      var g = el('g', { 'class': 'row', 'data-family': f.family }, svg);
      el('line', { x1: LW, x2: W - RW, y1: r1(mid), y2: r1(mid), 'class': 'sep' }, g);
      el('text', { x: LW - 10, y: mid + 4, 'class': 'nm', 'text-anchor': 'end' }, g, f.name + (f.block || (state.scaling === 'group' && f.encBits <= 8) ? ' ▦' : ''));
      var info = { f: f, sg: sg, lv: null, inView: 0 };
      rowsInfo.push(info);
      if (!sg) return;
      var top = f.A.max * sg.s;
      // 超過最大值的地方會飽和：畫成斜線區
      if (top < D) {
        el('rect', { x: LW, y: y0 + 4, width: r1(X(-top) - LW), height: RH - 8, 'class': 'sat' }, g);
        el('rect', { x: r1(X(top)), y: y0 + 4, width: r1(W - RW - X(top)), height: RH - 8, 'class': 'sat' }, g);
      }
      if (!f.A.all) { el('rect', { x: LW, y: mid - 5, width: PW, height: 10, 'class': 'band' }, g); info.inView = Infinity; return; }
      var lv = [], all = f.A.all;
      for (var j = 0; j < all.length; j++) { var v = all[j] * sg.s; if (v >= -D && v <= D) lv.push(v); }
      info.lv = lv; info.inView = lv.length;
      if (lv.length > 700) {
        el('rect', { x: r1(X(lv[0])), y: mid - 5, width: r1(X(lv[lv.length - 1]) - X(lv[0])), height: 10, 'class': 'band' }, g);
      } else {
        var t = '';
        lv.forEach(function (v) { t += 'M' + r1(X(v)) + ',' + r1(mid - 7) + 'v14'; });
        el('path', { d: t, 'class': 'lvl' }, g);
      }
    });

    var cross = el('line', { y1: TOP, y2: H - BOT, 'class': 'cross', visibility: 'hidden' }, svg);
    var hit = el('rect', { x: LW, y: TOP, width: PW, height: H - TOP - BOT, 'class': 'hit' }, svg);
    hit.addEventListener('pointermove', function (e) {
      var rc = svg.getBoundingClientRect(), mx = e.clientX - rc.left, my = e.clientY - rc.top;
      var v = -D + (mx - LW) / PW * 2 * D, i = Math.floor((my - TOP - HH - AX) / RH), info = rowsInfo[i], html;
      cross.setAttribute('x1', r1(mx)); cross.setAttribute('x2', r1(mx)); cross.setAttribute('visibility', 'visible');
      if (!info) {
        html = '<b>資料</b><span>x = ' + num(v, 4) + '</span><span>σ = ' + num(DATA.sigma, 4) + '，最大值 = ' + num(DATA.amax, 4) + '</span>';
      } else {
        var f = info.f, r = RES[f.id];
        html = '<b>' + esc(f.name) + '</b><span>' + esc(r.desc) + '</span>';
        if (info.sg) {
          html += '<span>這一段的 scale = ' + num(info.sg.s, 4) + '，absmax = ' + num(info.sg.amax, 4) + '</span>';
          var q = f.q(v / info.sg.s) * info.sg.s;
          html += '<span>x = ' + num(v, 4) + ' → <em>' + num(q, 4) + '</em></span>';
          html += '<span>畫面裡有 ' + (isFinite(info.inView) ? info.inView.toLocaleString('en-US') : '非常多') + ' 個格點</span>';
        } else html += '<span>這一段全部是 0</span>';
      }
      gridTip.show(html, mx, my);
    });
    hit.addEventListener('pointerleave', function () { cross.setAttribute('visibility', 'hidden'); gridTip.hide(); });
    var old = gridBox.querySelector('svg');
    if (old) gridBox.replaceChild(svg, old); else gridBox.insertBefore(svg, gridBox.firstChild);
  }

  seg('[data-dist]', function (v) { state.dist = v; $('[data-outlier-field]').hidden = v !== 'outlier'; DATA = null; runQuant(); });
  seg('[data-scaling]', function (v) { state.scaling = v; runQuant(); });
  seg('[data-group]', function (v) { state.group = +v; runQuant(); });
  seg('[data-grid-x]', function (v) { state.gridX = v; drawGrid(); });
  seg('[data-grid-block]', function (v) { state.gridBlock = v; drawGrid(); });
  var outlier = $('[data-outlier]'), outlierRaf = 0;
  outlier.addEventListener('input', function () {
    state.mult = +outlier.value;
    $('[data-outlier-out]').textContent = state.mult + '×';
    cancelAnimationFrame(outlierRaf);
    outlierRaf = requestAnimationFrame(function () { DATA = null; runQuant(); });
  });
  $('[data-reseed]').addEventListener('click', function () { state.seed++; $('[data-seed]').textContent = '#' + state.seed; DATA = null; runQuant(); });

  /* ---------- 11. 位元遊樂場 ---------- */

  var SCALE_ENC = { e8m0: { kind: 'e8m0' }, ue4m3: ENC_E4M3 };
  var FIELD_NAME = { s: '符號', e: '指數', m: 'mantissa', r: 'regime', x: '指數', f: 'fraction', i: '整數', k: '索引' };
  var FIELD_SHORT = { s: 'S', e: 'E', m: 'M', r: 'R', x: 'E', f: 'F', i: 'I', k: 'K' };   // 只有 1 bit 的欄位放不下全名
  var pgSel = $('[data-pg-fmt]'), pgRows = $('[data-pg-rows]'), pgOut = $('[data-pg-out]'), pgMap = $('[data-pg-map]'), pgIn = $('[data-pg-in]');
  var pg = { f: null, code: 0, scode: 0, absmax: 1 };
  pgSel.innerHTML = CFG.groups.map(function (g) {
    return '<optgroup label="' + esc(g.name) + '">' + FMT.filter(function (f) { return f.group === g.id; }).map(function (f) {
      return '<option value="' + f.id + '">' + esc(f.name) + '</option>';
    }).join('') + '</optgroup>';
  }).join('');

  var f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
  // 最接近 x 的編碼
  function encode(f, x) {
    var A = f.A;
    if (A.all) {
      var i = nearestIdx(A.all, f.q(x));
      return A.codes[i];
    }
    f32[0] = f.q(x);   // FP32 / TF32：先量化，再取 FP32 的位元
    return f.enc.m === 23 ? u32[0] : Math.floor(u32[0] / P2(23 - f.enc.m));
  }
  function scaleValue(f) {
    if (!f.block) return 1;
    if (f.block.scale === 'fp32') return pg.absmax;
    return decode(SCALE_ENC[f.block.scale], pg.scode).v;
  }
  function pgSetFormat(id, keepValue) {
    var f = byId[id];
    var v = keepValue && pg.f ? pgValue() : 1;
    pg.f = f;
    pgSel.value = id;
    if (!isFinite(v)) v = 1;
    pgEncodeValue(v);
  }
  function pgValue() { var e = decode(pg.f.enc, pg.code).v; return e * scaleValue(pg.f); }
  // 輸入一個數：block 格式照規格從這個數（當作 block 的 absmax）挑 scale
  function pgEncodeValue(v) {
    var f = pg.f, B = f.block, a = Math.abs(v);
    if (B && B.scale === 'e8m0') pg.scode = a ? Math.max(0, Math.min(254, floorLog2(a) - f.A.emax + 127)) : 127;
    else if (B && B.scale === 'ue4m3') pg.scode = encodeScaleE4M3(a ? a / f.A.max : 1);
    else if (B) pg.absmax = a || 1;
    var s = scaleValue(f);
    pg.code = encode(f, s ? v / s : 0);
    pgRender();
  }
  var E4M3_A = analyze(ENC_E4M3);
  function encodeScaleE4M3(v) {
    var i = nearestIdx(E4M3_A.all, qE4M3(v));
    var c = E4M3_A.codes[i];
    return E4M3_A.all[i] > 0 ? c : 0x08;   // 0 不能當 scale：退到最小的正規值
  }

  function bitsRow(label, sub, enc, code, n, kind, locked) {
    var dec = decode(enc, code), fields = dec.fields, html = '', pos = n - 1;
    html += '<div class="df-pg-row"><div class="df-pg-row-head"><b>' + label + '</b><span>' + sub + '</span></div><div class="df-bits" style="--n:' + n + '">';
    fields.forEach(function (fd) { html += '<span class="df-fd" data-t="' + fd.t + '" style="grid-column:span ' + fd.n + '" title="' + FIELD_NAME[fd.t] + '">' + (fd.n === 1 ? FIELD_SHORT[fd.t] : FIELD_NAME[fd.t]) + '</span>'; });
    fields.forEach(function (fd) {
      for (var j = 0; j < fd.n; j++, pos--) {
        var bit = field(code, pos, 1), lock = locked && pos === n - 1;
        html += '<button type="button" class="df-bit" data-t="' + fd.t + '" data-row="' + kind + '" data-pos="' + pos + '" aria-pressed="' + (bit ? 'true' : 'false') + '" aria-label="' + label + ' bit ' + pos + '"' + (lock ? ' disabled' : '') + '>' + bit + '</button>';
      }
    });
    return html + '</div></div>';
  }
  function hex(code, n) { var h = code.toString(16).toUpperCase(); while (h.length < Math.ceil(n / 4)) h = '0' + h; return '0x' + h; }
  function bin(code, n) { var b = code.toString(2); while (b.length < n) b = '0' + b; return b; }

  function formula(f, code) {
    var enc = f.enc, d = decode(enc, code), n = f.A.bits;
    if (enc.kind === 'float') {
      if (d.cls === 'nan') return enc.special === 'ieee' ? '指數全 1、mantissa 不是 0 → NaN' : enc.special === 'fn' ? 'S.1111.111 是 E4M3 唯一的 NaN（沒有 ∞）' : '0x80（原本的 −0）是 FNUZ 唯一的 NaN';
      if (d.cls === 'inf') return '指數全 1、mantissa 是 0 → ' + (d.s ? '−∞' : '∞');
      if (d.cls === 'zero') return '指數和 mantissa 都是 0 → ' + (d.s ? '−0' : '0');
      var sgn = '(−1)<sup>' + d.s + '</sup> × ';
      if (d.cls === 'sub') return sgn + '2<sup>1 − ' + enc.bias + '</sup> × (0 + ' + d.M + '/' + P2(enc.m) + ')　<small>subnormal：指數是 0，沒有隱含的 1</small>';
      return sgn + '2<sup>' + d.E + ' − ' + enc.bias + '</sup> × (1 + ' + d.M + '/' + P2(enc.m) + ')';
    }
    if (enc.kind === 'int') return '二補數 ' + fmtInt(d.raw) + (enc.frac ? ' × 2<sup>−' + enc.frac + '</sup>（隱含的小數點）' : '') + (d.raw === -P2(n - 1) ? '　<small>對稱量化不用這個碼</small>' : '');
    if (enc.kind === 'posit') {
      if (d.cls === 'zero') return '全 0 是 0（posit 只有一個 0）';
      if (d.cls === 'nar') return '1 後面全 0 是 NaR（Not a Real），posit 唯一的例外值';
      return (d.s ? '負數先取二補數。' : '') + 'regime ' + d.k + ' 個 ' + d.r0 + ' → k = ' + fmtInt(d.R) + '；' +
        (enc.es ? '指數 ' + d.ex + (d.eLen < enc.es ? '（被擠掉 ' + (enc.es - d.eLen) + ' bit，補 0）' : '') + '；' : '') +
        'fraction ' + d.F + '/' + P2(d.fLen) + ' → (−1)<sup>' + d.s + '</sup> × 2<sup>' + fmtInt(d.R) + '·' + P2(enc.es) + ' + ' + d.ex + '</sup> × (1 + ' + d.F + '/' + P2(d.fLen) + ')';
    }
    return '查表第 ' + code + ' 個值（' + bin(code, n) + '）';
  }

  function pgRender() {
    var f = pg.f, A = f.A, n = A.bits, B = f.block, focus = document.activeElement, fKey = focus && focus.getAttribute && focus.getAttribute('data-pos') ? focus.getAttribute('data-row') + ':' + focus.getAttribute('data-pos') : null;
    var html = '';
    if (B && B.scale !== 'fp32') html += bitsRow('Scale', B.scale === 'e8m0' ? 'E8M0 · 每 ' + B.size + ' 個值一個' : 'E4M3 · 每 ' + B.size + ' 個值一個（符號固定 0）', SCALE_ENC[B.scale], pg.scode, 8, 'scale', B.scale === 'ue4m3');
    if (B && B.scale === 'fp32') html += '<div class="df-pg-row"><div class="df-pg-row-head"><b>Scale</b><span>FP32 absmax · 每 ' + B.size + ' 個值一個</span></div><label class="df-pg-absmax">absmax = <input type="number" step="any" value="' + pg.absmax + '" data-pg-absmax></label></div>';
    html += bitsRow(B ? '元素' : '編碼', f.name + ' · ' + f.layout, f.enc, pg.code, n, 'elem');
    pgRows.innerHTML = html;
    if (fKey) { var again = pgRows.querySelector('[data-row="' + fKey.split(':')[0] + '"][data-pos="' + fKey.split(':')[1] + '"]'); if (again) again.focus(); }

    var d = decode(f.enc, pg.code), s = scaleValue(f), v = d.v * s, out = '';
    out += '<div class="df-pg-val"><span class="df-field-label">值</span><b>' + num(v, 9) + '</b>' + p2tag(v) + '<span class="df-cls" data-cls="' + d.cls + '">' + ({ zero: '零', sub: 'subnormal', norm: d.v === A.max || d.v === -A.max ? '最大值' : f.enc.kind === 'float' ? 'normal' : '數值', nan: 'NaN', inf: '∞', nar: 'NaR' })[d.cls] + '</span></div>';
    out += '<p class="df-pg-f">' + (B ? '元素 = ' : '') + formula(f, pg.code) + ' = ' + num(d.v, 9) + '</p>';
    if (B) {
      var sd = B.scale === 'fp32' ? null : decode(SCALE_ENC[B.scale], pg.scode);
      out += '<p class="df-pg-f">scale = ' + (B.scale === 'e8m0' ? (pg.scode === 255 ? '0xFF 是 NaN' : '2<sup>' + pg.scode + ' − 127</sup>') : B.scale === 'ue4m3' ? 'E4M3 ' + hex(pg.scode, 8) : 'absmax') + ' = ' + num(s, 6) + (B.scale === 'ue4m3' ? '　<small>per-tensor 的 FP32 scale 當作 1</small>' : '') + '</p>';
      out += '<p class="df-pg-f">值 = scale × 元素 = ' + num(s, 6) + ' × ' + num(d.v, 6) + ' = <b>' + num(v, 9) + '</b></p>';
      if (sd && !isFinite(sd.v)) out += '<p class="df-pg-f"><small>scale 是 NaN，整個 block 都是 NaN</small></p>';
    }
    out += '<dl class="df-pg-meta"><div><dt>編碼</dt><dd>' + hex(pg.code, n) + (n <= 16 ? ' · ' + bin(pg.code, n) : '') + '</dd></div>';
    if (A.all && isFinite(d.v)) {
      var i = nearestIdx(A.all, d.v), nx = A.all[i + 1], pv = A.all[i - 1];
      out += '<div><dt>前一個值</dt><dd>' + (pv === undefined ? '—' : num(pv * s, 6)) + '</dd></div>';
      out += '<div><dt>下一個值</dt><dd>' + (nx === undefined ? '—（最大）' : num(nx * s, 6)) + '</dd></div>';
      if (nx !== undefined && d.v !== 0) out += '<div><dt>到下一個的間距</dt><dd>' + num((nx - d.v) * s, 4) + '（' + fix(Math.abs((nx - d.v) / d.v) * 100, 2) + '%）</dd></div>';
    }
    if (pg.target != null && isFinite(pg.target)) {
      var err = v - pg.target;
      out += '<div><dt>輸入</dt><dd>' + num(pg.target, 10) + '</dd></div>';
      out += '<div><dt>誤差</dt><dd>' + num(err, 4) + (pg.target ? '（' + fix(Math.abs(err / pg.target) * 100, 3) + '%）' : '') + '</dd></div>';
    }
    out += '</dl>';
    pgOut.innerHTML = out;
    drawMap();
  }

  function drawMap() {
    var f = pg.f, A = f.A, n = A.bits;
    if (n > 8) { pgMap.innerHTML = '<p class="df-ctl-note">' + esc(f.name) + ' 有 ' + P2(n).toLocaleString('en-US') + ' 個編碼，太多了不排成表。</p>'; return; }
    var cols = P2(Math.ceil(n / 2)), rows = P2(Math.floor(n / 2)), lb = Math.ceil(n / 2), hb = n - lb;
    var lmin = Math.log2(A.minPos), lmax = Math.log2(A.max);
    var html = '<p class="df-field-label">全部 ' + P2(n) + ' 個編碼（列 = 高 ' + hb + ' bits，行 = 低 ' + lb + ' bits）</p><div class="df-map" data-bits="' + n + '" data-family="' + f.family + '" style="--cols:' + cols + '"><span></span>';
    for (var c = 0; c < cols; c++) html += '<span class="df-map-h">' + (n === 8 ? c.toString(16).toUpperCase() : bin(c, lb)) + '</span>';
    for (var r = 0; r < rows; r++) {
      html += '<span class="df-map-h">' + (n === 8 ? r.toString(16).toUpperCase() + '_' : bin(r, hb)) + '</span>';
      for (c = 0; c < cols; c++) {
        var code = r * cols + c, d = decode(f.enc, code), t = 0;
        if (isFinite(d.v) && d.v !== 0) t = lmax > lmin ? (Math.log2(Math.abs(d.v)) - lmin) / (lmax - lmin) : 1;
        html += '<button type="button" class="df-cell" data-code="' + code + '" data-cls="' + d.cls + '"' + (code === pg.code ? ' aria-current="true"' : '') +
          ' style="--m:' + fix(t, 3) + '" title="' + hex(code, n) + ' = ' + num(d.v, 8) + '"><span>' + compact(d.v) + '</span></button>';
      }
    }
    pgMap.innerHTML = html + '</div>';
  }

  pgSel.addEventListener('change', function () { pg.target = null; pgSetFormat(pgSel.value, false); });
  pgRows.addEventListener('click', function (e) {
    var b = e.target.closest('.df-bit');
    if (!b || b.disabled) return;
    var p = +b.getAttribute('data-pos'), w = P2(p);
    pg.target = null;
    if (b.getAttribute('data-row') === 'scale') pg.scode = field(pg.scode, p, 1) ? pg.scode - w : pg.scode + w;
    else pg.code = field(pg.code, p, 1) ? pg.code - w : pg.code + w;
    pgRender();
  });
  pgRows.addEventListener('change', function (e) {
    if (!e.target.matches('[data-pg-absmax]')) return;
    var v = parseFloat(e.target.value);
    if (isFinite(v) && v > 0) { pg.absmax = v; pg.target = null; pgRender(); }
  });
  pgMap.addEventListener('click', function (e) {
    var b = e.target.closest('.df-cell');
    if (!b) return;
    pg.code = +b.getAttribute('data-code'); pg.target = null;
    pgRender();
  });
  function readInput() {
    var v = parseFloat(String(pgIn.value).replace(/[−–]/g, '-').replace(/,/g, ''));
    if (!isFinite(v)) return;
    pg.target = v;
    pgEncodeValue(v);
  }
  pgIn.addEventListener('change', readInput);
  pgIn.addEventListener('keydown', function (e) { if (e.key === 'Enter') readInput(); });
  $$('[data-pg-step]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = pg.f, A = f.A, dir = +b.getAttribute('data-pg-step'), d = decode(f.enc, pg.code);
      pg.target = null;
      if (A.all) {
        var i = isFinite(d.v) ? nearestIdx(A.all, d.v) : (dir > 0 ? -1 : A.all.length);
        var j = Math.max(0, Math.min(A.all.length - 1, i + dir));
        pg.code = A.codes[j];
      } else {   // FP32 / TF32：照符號決定 code 要加還是減
        var sign = P2(A.bits - 1), neg = pg.code >= sign, c = pg.code;
        if (!neg) c = dir > 0 ? c + 1 : (c === 0 ? sign + 1 : c - 1);
        else c = dir > 0 ? (c === sign + 1 || c === sign ? 0 : c - 1) : c + 1;
        if (isFinite(decode(f.enc, c).v)) pg.code = c;
      }
      pgRender();
    });
  });
  $$('[data-go]').forEach(function (b) {
    b.addEventListener('click', function () {
      pg.target = null;
      pgSetFormat(b.getAttribute('data-go'), false);
      var sec = document.getElementById('df-bits');
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      sec.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
  });

  /* ---------- 12. 開始 ---------- */

  root.classList.add('is-live');
  syncPicker();
  drawSpec();
  pgSetFormat('fp8e4m3', false);
  drawRange();
  runQuant();
  var lastW = { r: 0, g: 0 }, raf = 0;
  function onResize() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(function () {
      if (rangeBox.clientWidth !== lastW.r) { lastW.r = rangeBox.clientWidth; drawRange(); }
      if (gridBox.clientWidth !== lastW.g) { lastW.g = gridBox.clientWidth; drawGrid(); }
    });
  }
  if (window.ResizeObserver) { var ro = new ResizeObserver(onResize); ro.observe(rangeBox); ro.observe(gridBox); }
  else window.addEventListener('resize', onResize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { drawRange(); drawGrid(); });
})();
