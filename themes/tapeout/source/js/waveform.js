/* 首頁的波形檢視器：把 _config.tapeout.yml 的 waveform.signals 畫成會捲動的時序圖，
   游標所在位置的訊號值會顯示在 value 欄。 */
(function () {
  'use strict';

  var root = document.querySelector('[data-waveform]');
  if (!root) return;
  var cfg = JSON.parse(root.querySelector('script[type="application/json"]').textContent || '{}');
  var sigs = cfg.signals || [];
  if (!sigs.length) return;

  var NS = 'http://www.w3.org/2000/svg';
  var canvas = root.querySelector('[data-wv-canvas]');
  var pane = root.querySelector('.wave-pane');
  var cursor = root.querySelector('[data-wv-cursor]');
  var timeEl = root.querySelector('[data-wv-time]');
  var valueEls = root.querySelectorAll('.wave-value');
  var period = cfg.period || 10;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var HEAD = 28, ROW = 38, PADY = 10, SLEW = 4;

  // ---- parse wave strings into one state per cycle ----
  var L = Math.max.apply(null, sigs.map(function (s) { return String(s.wave || '').length; })) || 16;
  var model = sigs.map(function (s) {
    var w = String(s.wave || '');
    var data = s.data || [];
    var di = 0;
    var clock = /^[pnPN]/.test(w);
    var states = [];
    var prev = { v: 'x' };
    for (var i = 0; i < L; i++) {
      var c = w[i] || '.';
      if (clock || c === '.') { states.push(prev); continue; }
      if (c === '=' || /[2-9]/.test(c)) {
        prev = { v: '=', label: data.length ? String(data[di++ % data.length]) : '' };
      } else if (c === 'h' || c === 'H') {
        prev = { v: '1' };
      } else if (c === 'l' || c === 'L') {
        prev = { v: '0' };
      } else if ('01xz'.indexOf(c) > -1) {
        prev = { v: c };
      }
      states.push(prev);
    }
    return { clock: clock, neg: /^[nN]/.test(w), states: states };
  });

  function node(name, attrs) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }

  var CYC, loopW, group;
  var offset = 0, loops = 0;

  function build() {
    var width = canvas.clientWidth || 600;
    CYC = width < 520 ? 40 : 52;
    loopW = L * CYC;
    var copies = Math.ceil(width / loopW) + 1;
    var N = copies * L;
    var H = HEAD + ROW * model.length;
    offset = offset % loopW;

    var svg = node('svg', { class: 'wave-svg', width: '100%', height: H, 'aria-hidden': 'true' });
    var defs = node('defs', {});
    var pat = node('pattern', { id: 'wv-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
    pat.appendChild(node('path', { d: 'M0 0V6', class: 'wv-hatch' }));
    defs.appendChild(pat);
    svg.appendChild(defs);

    // static row separators
    var rows = 'M0 ' + (HEAD - 0.5) + 'H' + width;
    var rowLines = '';
    for (var r = 1; r < model.length; r++) rowLines += 'M0 ' + (HEAD + r * ROW - 0.5) + 'H' + width;
    svg.appendChild(node('path', { d: rows, class: 'wv-headline' }));
    if (rowLines) svg.appendChild(node('path', { d: rowLines, class: 'wv-rowline' }));

    group = node('g', {});
    svg.appendChild(group);

    var ticks = '', grid = '';
    for (var c = 0; c <= N; c++) {
      var x = c * CYC + 0.5;
      ticks += 'M' + x + ' ' + (HEAD - (c % 4 === 0 ? 11 : 5)) + 'V' + HEAD;
      grid += 'M' + x + ' ' + HEAD + 'V' + H;
    }
    group.appendChild(node('path', { d: grid, class: 'wv-gridline' }));
    group.appendChild(node('path', { d: ticks, class: 'wv-tick' }));

    model.forEach(function (m, row) {
      var top = HEAD + row * ROW + PADY;
      var bot = HEAD + (row + 1) * ROW - PADY;
      var mid = (top + bot) / 2;

      if (m.clock) {
        var hi = m.neg ? bot : top, lo = m.neg ? top : bot;
        var d = 'M0 ' + lo;
        for (var k = 0; k < N; k++) {
          var x0 = k * CYC, xh = x0 + CYC / 2;
          d += 'L' + x0 + ' ' + lo + 'L' + (x0 + SLEW / 2) + ' ' + hi + 'L' + xh + ' ' + hi + 'L' + (xh + SLEW / 2) + ' ' + lo;
        }
        d += 'L' + N * CYC + ' ' + lo;
        group.appendChild(node('path', { d: d, class: 'wv-line wv-clk' }));
        return;
      }

      // merge consecutive cycles into segments
      var segs = [];
      for (var i = 0; i < N; i++) {
        var s = m.states[i % L];
        var last = segs[segs.length - 1];
        var same = last && (s.v === '=' ? last.s === s : last.s.v === s.v);
        if (same) last.end = i + 1;
        else segs.push({ s: s, start: i, end: i + 1 });
      }

      var line = '';
      var levelY = function (v) { return v === '1' ? top : v === '0' ? bot : mid; };
      segs.forEach(function (seg, idx) {
        var x0 = seg.start * CYC, x1 = seg.end * CYC, v = seg.s.v;
        if (v === '=' || v === 'x') {
          var pts = [x0, mid, x0 + SLEW, top, x1 - SLEW, top, x1, mid, x1 - SLEW, bot, x0 + SLEW, bot].join(' ');
          var poly = node('polygon', { points: pts, class: v === 'x' ? 'wv-x' : 'wv-bus' });
          if (v === 'x') poly.setAttribute('fill', 'url(#wv-hatch)');
          group.appendChild(poly);
          if (v === '=' && seg.s.label) {
            var room = x1 - x0 - SLEW * 2 - 10;
            var label = seg.s.label;
            var maxChars = Math.floor(room / 6.8);
            if (maxChars < label.length) label = maxChars >= 3 ? label.slice(0, maxChars - 1) + '…' : '';
            if (label) {
              var t = node('text', { x: (x0 + x1) / 2, y: mid + 4, 'text-anchor': 'middle', class: 'wv-text' });
              t.textContent = label;
              group.appendChild(t);
            }
          }
          return;
        }
        var y = levelY(v);
        var prev = segs[idx - 1];
        if (!prev) {
          line += 'M' + x0 + ' ' + y;
        } else if (prev.s.v === '=' || prev.s.v === 'x') {
          line += 'M' + x0 + ' ' + mid + 'L' + (x0 + SLEW) + ' ' + y;
        } else {
          line += 'L' + (x0 + SLEW) + ' ' + y;
        }
        line += 'L' + x1 + ' ' + y;
      });
      if (line) group.appendChild(node('path', { d: line, class: 'wv-line' }));
    });

    canvas.innerHTML = '';
    canvas.appendChild(svg);
    render();
  }

  // ---- cursor & values ----
  var cursorX = null;
  function render() {
    if (!group) return;
    group.setAttribute('transform', 'translate(' + (-offset).toFixed(2) + ' 0)');
    var width = canvas.clientWidth;
    var x = cursorX == null ? Math.round(width * 0.62) : cursorX;
    cursor.style.transform = 'translateX(' + x + 'px)';
    var t = x + offset;
    var cyc = Math.floor(t / CYC);
    var phase = t / CYC - cyc;
    model.forEach(function (m, i) {
      var v;
      if (m.clock) v = (phase < 0.5) !== m.neg ? '1' : '0';
      else {
        var s = m.states[((cyc % L) + L) % L];
        v = s.v === '=' ? s.label : s.v;
      }
      var el = valueEls[i];
      if (el && el.textContent !== v) el.textContent = v;
    });
    var ns = (loops * L + t / CYC) * period;
    timeEl.textContent = Math.max(0, Math.round(ns)).toLocaleString('en-US');
  }

  // ---- animation loop ----
  var BASE_SPEED = reduceMotion ? 0 : 36; // px / s
  var speed = BASE_SPEED, target = BASE_SPEED;
  var raf = 0, lastT = 0, visible = true;

  function frame(now) {
    var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0;
    lastT = now;
    speed += (target - speed) * Math.min(1, dt * 6);
    offset += speed * dt;
    if (offset >= loopW) { offset -= loopW; loops++; }
    render();
    raf = visible && BASE_SPEED ? requestAnimationFrame(frame) : 0;
  }
  function start() {
    if (!raf && BASE_SPEED && visible && !document.hidden) { lastT = 0; raf = requestAnimationFrame(frame); }
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  pane.addEventListener('pointermove', function (e) {
    var rect = canvas.getBoundingClientRect();
    cursorX = Math.max(0, Math.min(rect.width - 1, e.clientX - rect.left));
    target = 0;
    if (!raf) render();
  });
  pane.addEventListener('pointerleave', function () {
    cursorX = null;
    target = BASE_SPEED;
    if (!raf) render();
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) start(); else stop();
    }).observe(root);
  }
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else start(); });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(build, 150);
  });

  build();
  start();
})();
