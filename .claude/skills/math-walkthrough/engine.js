/* mathwalk: a scroll-driven derivation walkthrough. Left: prose steps. Right: a pinned stage that shows
   one equation at a time, with the previous one above it, smaller; the overview and the recap show the whole
   derivation as one aligned board.
   Equations are KaTeX rendered at build time (the texify helper). A term is a \htmlClass{t-<key>}{…} span,
   which a step can colour (hot / hot2), zoom into (zoom) or annotate from below (notes).
   The page calls MathWalk({ chapters, steps, traces, figs, board }); board is usually MathWalk.blackboard({ columns })
   (chapter brackets + one value column per worked example, defined at the bottom of this file).
   Every frame is a function of (step i, local t) read from the scroll position: no stored animation state,
   so scrolling back, jumping chapters and autoplay all render the same picture.
   The skill .claude/skills/math-walkthrough ships this same file as engine.js: change both together. */
(function () {
  'use strict';
  window.MathWalk = function (opts) {
    opts = opts || {};
    var root = document.querySelector('[data-mw]');
    if (!root) return;
    var NS = 'http://www.w3.org/2000/svg';
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var stage = root.querySelector('[data-stage]');
    var eqHost = stage.querySelector('[data-eqs]'), noteHost = stage.querySelector('[data-notes]');
    var ovSvg = stage.querySelector('[data-ov]'), boardHost = stage.querySelector('[data-board-host]');
    var figWrap = stage.querySelector('[data-figwrap]'), figHost = stage.querySelector('[data-figs]');
    var figTitle = stage.querySelector('[data-fig-title]');
    var TR = opts.traces || {};
    if (opts.board && opts.board.trace && !TR.board) TR.board = opts.board.trace;   // the blackboard's fill order

    // ---------- helpers ----------
    function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
    function seg(t, a, b) { return b > a ? clamp01((t - a) / (b - a)) : (t >= b ? 1 : 0); }
    function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
    function lerp(a, b, k) { return a + (b - a) * k; }
    function r2(n) { return Math.round(n * 100) / 100; }
    function r4(n) { return Math.round(n * 10000) / 10000; }
    function pick(v) { return Array.isArray(v) ? v[view.narrow ? 1 : 0] : (v || 0); }
    function el(name, attrs, parent, text) {
      var e = document.createElementNS(NS, name);
      for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
      if (text != null) e.textContent = text;
      if (parent) parent.appendChild(e);
      return e;
    }
    function div(c, parent) { var e = document.createElement('div'); e.className = c; if (parent) parent.appendChild(e); return e; }
    // write to the DOM only when the value changed
    function set(e, k, v) { var key = '_x_' + k; if (e[key] === v) return; e[key] = v; e.setAttribute(k, v); }
    function op(e, o) { set(e, 'opacity', r2(o)); }
    function sop(e, o) { o = r2(o); if (e._so === o) return; e._so = o; e.style.opacity = o; e.style.visibility = o > 0 ? 'visible' : 'hidden'; }
    function sty(e, k, v) { var key = '_s_' + k; if (e[key] === v) return; e[key] = v; e.style[k] = v; }
    function cls(e, c, on) { var key = '_c_' + c; on = !!on; if (e[key] === on) return; e[key] = on; e.classList.toggle(c, on); }
    function txt(e, s) { s = String(s); if (e._t === s) return; e._t = s; e.textContent = s; }
    function html(e, s) { if (e._h === s) return; e._h = s; e.innerHTML = s; }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function union(a, b) {
      if (!a) return b;
      var x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
      return { x: x0, y: y0, w: Math.max(a.x + a.w, b.x + b.w) - x0, h: Math.max(a.y + a.h, b.y + b.h) - y0 };
    }

    // ---------- equations and the board: moved from the prose (where they serve readers without JS) into the stage ----------
    var eqs = {}, board = null, noteSrc = {};
    function collect() {
      [].forEach.call(root.querySelectorAll('.mw-text [data-eq]'), function (e) {
        eqs[e.getAttribute('data-eq')] = { id: e.getAttribute('data-eq'), el: e, spans: {}, terms: {} };
        eqHost.appendChild(e);
      });
      var b = root.querySelector('.mw-text [data-board]');
      if (b) {
        var wrap = div('mw-bwrap', boardHost);
        wrap.appendChild(b);
        board = { el: wrap, body: b, layer: div('mw-blayer', wrap), rows: {}, spans: {} };
      }
      [].forEach.call(root.querySelectorAll('.mw-text [data-note]'), function (e) { noteSrc[e.getAttribute('data-note')] = e; e.parentNode.removeChild(e); });
    }
    // a term's box: the span and everything inside it (KaTeX raises scripts with relative positioning), in natural px.
    // KaTeX draws stretchy marks (√, long arrows, braces) as 400em-wide SVGs clipped by a .hide-tail span: measure that span.
    function boxOf(sp, r0) {
      var b = null;
      [sp].concat([].slice.call(sp.querySelectorAll('*'))).forEach(function (n) {
        if (n !== sp && !n.classList.contains('hide-tail') && n.closest('.hide-tail')) return;
        var r = n.getBoundingClientRect();
        if (r.width > 0.5 && r.height > 0.5) b = union(b, { x: r.left - r0.left, y: r.top - r0.top, w: r.width, h: r.height });
      });
      return b || { x: 0, y: 0, w: 0, h: 0 };
    }
    function measureTerms(node, into, spans) {
      var r0 = node.getBoundingClientRect();
      [].forEach.call(node.querySelectorAll('.katex-html [class*="t-"]'), function (sp) {
        [].forEach.call(sp.classList, function (c) {
          if (c.indexOf('t-') !== 0) return;
          var k = c.slice(2);
          into[k] = union(into[k], boxOf(sp, r0));
          (spans[k] || (spans[k] = [])).push(sp);
        });
      });
      return r0;
    }
    function measureEqs() {
      Object.keys(eqs).forEach(function (id) {
        var E = eqs[id];
        E.el.style.transform = 'none'; E.el._s_transform = null;
        E.terms = {}; E.spans = {};
        var r0 = measureTerms(E.el, E.terms, E.spans);
        E.w = r0.width; E.h = r0.height;
      });
      if (board) {
        board.el.style.transform = 'none'; board.el._s_transform = null;
        board.rows = {}; board.spans = {};
        var r0 = measureTerms(board.body, board.rows, board.spans);
        board.w = r0.width; board.h = r0.height;
      }
    }
    function rowsBox(a, b) {
      var box = null;
      for (var n = a; n <= b; n++) if (board.rows['r' + n]) box = union(box, board.rows['r' + n]);
      return box || { x: 0, y: 0, w: board.w, h: board.h };
    }

    // ---------- trace ----------
    function events(name) { var t = TR[name]; if (!t) throw new Error('no trace ' + name); return t; }

    // ---------- steps & chapters ----------
    var steps = opts.steps.map(function (c, i) {
      var sec = root.querySelector('[data-step="' + c.id + '"]');
      if (!sec) throw new Error('no <section data-step="' + c.id + '">');
      if (c.board && c.board.mode === 'run' && !c.scrub && TR.board) c.scrub = { trace: 'board' };
      sec.style.setProperty('--h', c.h || 1);
      return { cfg: c, i: i, section: sec };
    });
    var chapters = opts.chapters.map(function (c) {
      var idx = steps.filter(function (st) { return st.cfg.ch === c.id; }).map(function (st) { return st.i; });
      return { cfg: c, first: idx[0], count: idx.length };
    }).filter(function (c) { return c.count; });
    var chapterOf = {};
    chapters.forEach(function (c) { chapterOf[c.cfg.id] = c; });

    // a caption or note: plain text, or '#id' = a KaTeX snippet from the page's <span data-note="id"> sources
    function fill(e, s) {
      if (!/^#/.test(s)) return txt(e, s);
      var src = noteSrc[s.slice(1)];
      if (!src) return console.error('mathwalk: no note source ' + s);
      e.innerHTML = src.innerHTML;
    }
    // per-step overlay: the caption ("say") and the notes under terms, built once
    function buildStep(st) {
      var c = st.cfg;
      if (c.eq && !eqs[c.eq]) console.error('mathwalk: no equation "' + c.eq + '" (step ' + c.id + ')');
      if (c.from && !eqs[c.from]) console.error('mathwalk: no equation "' + c.from + '" (step ' + c.id + ')');
      st.say = c.say ? div('mw-say', noteHost) : null;
      if (st.say) fill(st.say, c.say);
      st.ovG = el('g', { class: 'mw-ovg', opacity: 0 }, ovSvg);
      st.notes = (c.notes || []).map(function (n) {
        var e = div('mw-note' + (n[2] ? ' is-' + n[2] : ''), noteHost), live = typeof n[1] === 'function';
        if (!live) fill(e, n[1]);
        return { key: n[0], fn: live ? n[1] : null, el: e, brk: el('path', { class: 'brk' + (n[2] ? ' is-' + n[2] : ''), d: 'M0 0' }, st.ovG) };
      });
      if (st.say) sop(st.say, 0);
      st.notes.forEach(function (n) { sop(n.el, 0); });
    }

    // ---------- layout: every step's poses for the current stage size ----------
    var view = {};
    function zones(st) {
      var pad = view.narrow ? 12 : 30, top = view.narrow ? 12 : 26;
      var fig = null;
      if (st.cfg.fig) {
        var fh = Math.round(view.narrow ? view.H * 0.47 : Math.min(view.H * 0.45, 370));
        fig = { x: pad, y: view.H - fh - (view.narrow ? 6 : 16), w: view.W - 2 * pad, h: fh };
      }
      return { eq: { x: pad, y: top, w: view.W - 2 * pad, h: (fig ? fig.y - 8 : view.H - 18) - top }, fig: fig };
    }
    var SAY_H = 20, NOTE_H = 44;
    function layoutFocus(st) {
      var c = st.cfg, Z = st.zone.eq, E = eqs[c.eq], P = c.from ? eqs[c.from] : null;
      var maxS = c.smax || (view.narrow ? 1 : 1.3), cx = Z.x + Z.w / 2;
      var s = Math.min(maxS, Z.w * 0.94 / E.w), xC;
      var ps = P ? Math.min(s * 0.62, Z.w * 0.94 / P.w) : 0;
      var hp = P ? P.h * ps + 10 : 0, hs = c.say ? SAY_H + 8 : 0, hn = st.notes.length ? NOTE_H : 0;
      var tr = c.zoom ? E.terms[c.zoom] : null;
      if (c.zoom && !tr) console.error('mathwalk: no term "' + c.zoom + '" in ' + c.eq);
      if (tr) s = Math.min(c.zmax || 2.6, Z.w * 0.92 / tr.w, Math.max(s, Z.w * (c.zfrac || 0.42) / tr.w));
      s = Math.min(s, Math.max(0.3, (Z.h - hp - hs - hn) / E.h));
      xC = tr ? cx - (tr.x + tr.w / 2) * s : cx - E.w * s / 2;
      var total = hp + hs + E.h * s + hn, y = Z.y + Math.max(0, (Z.h - total) / 2) - (hn ? 0 : 4);
      st.poses = {};
      if (P) { st.poses[c.from] = { x: cx - P.w * ps / 2, y: y, s: ps, o: c.fromO || 0.42 }; y += hp; }
      st.sayY = y; y += hs;
      st.poses[c.eq] = { x: xC, y: y, s: s, o: 1 };
      st.board = null;
      // notes: brackets on one baseline under the equation, labels pushed apart left to right
      var base = y + E.h * s + 2, ns = [];
      st.notes.forEach(function (n) {
        var t = E.terms[n.key];
        if (!t) { console.error('mathwalk: no term "' + n.key + '" in ' + c.eq); return; }
        var x0 = xC + t.x * s, x1 = xC + (t.x + t.w) * s;
        if (n.fn) html(n.el, n.fn(stateOf(st, 1, 1), api));   // widest-ish content, so the labels are spaced for it
        set(n.brk, 'd', 'M' + r2(x0 + 1) + ' ' + r2(base) + 'v5H' + r2(x1 - 1) + 'V' + r2(base));
        ns.push({ n: n, cx: (x0 + x1) / 2, w: n.el.offsetWidth });
      });
      ns.sort(function (a, b) { return a.cx - b.cx; });
      var right = -1e9, edge = view.narrow ? 6 : 14;
      ns.forEach(function (q) { q.x = Math.max(q.cx - q.w / 2, right + 12, edge); right = q.x + q.w; });
      for (var j = ns.length - 1, lim = view.W - edge; j >= 0; j--) { ns[j].x = Math.min(ns[j].x, lim - ns[j].w); lim = ns[j].x - 12; }
      ns.forEach(function (q) { sty(q.n.el, 'transform', 'translate(' + r2(q.x) + 'px,' + r2(base + 12) + 'px)'); });
      if (st.say) sty(st.say, 'transform', 'translate(' + r2(cx - st.say.offsetWidth / 2) + 'px,' + r2(st.sayY) + 'px)');
    }
    // the board's frame: the rows in b.rows, plus what the decor draws around them (decor.extent), or the step's left/right/top
    function layoutBoard(st) {
      var b = st.cfg.board, Z = st.zone.eq, rows = rowsBox(b.rows ? b.rows[0] : 1, b.rows ? b.rows[1] : 99);
      var ext = boardDecor && boardDecor.extent ? boardDecor.extent(b, rows) : {};
      var x0 = b.left != null ? -pick(b.left) : ext.x0 != null ? ext.x0 : Math.min(0, rows.x);
      var x1 = Math.max(rows.x + rows.w, b.wide ? board.w : 0, ext.x1 || 0) + pick(b.right);
      var y0 = rows.y - (b.top != null ? pick(b.top) : ext.top != null ? ext.top : 8), y1 = rows.y + rows.h + 6;
      var s = Math.min(b.smax || 1.2, Z.w / (x1 - x0), Z.h / (y1 - y0));
      st.poses = {};
      st.board = { x: Z.x + Z.w / 2 - (x0 + x1) / 2 * s, y: Z.y + Z.h / 2 - (y0 + y1) / 2 * s, s: s, o: 1 };
    }
    function measure() {
      var r = stage.getBoundingClientRect();
      view.W = r.width; view.H = r.height;
      view.narrow = window.matchMedia('(max-width: 900px)').matches;
      view.act = view.narrow ? 0.8 : 0.5;
      set(ovSvg, 'viewBox', '0 0 ' + r2(view.W) + ' ' + r2(view.H));
      measureEqs();
      steps.forEach(function (st) {
        st.zone = zones(st);
        if (st.cfg.board) layoutBoard(st); else if (st.cfg.eq) layoutFocus(st); else { st.poses = {}; st.board = null; }
        var b = st.section.getBoundingClientRect();
        st.top = b.top + window.scrollY; st.h = Math.max(1, b.height);
        st.mv = Math.min(0.42, Math.max(0.1, 0.42 * window.innerHeight / st.h));   // camera move = first part of the step
      });
      lastShown = null;
    }

    // ---------- poses → transforms ----------
    function mix(A, B, k) {
      if (A && B) return { x: lerp(A.x, B.x, k), y: lerp(A.y, B.y, k), s: Math.exp(lerp(Math.log(A.s), Math.log(B.s), k)), o: lerp(A.o, B.o, k) };
      if (B) return { x: B.x, y: B.y + (1 - k) * 12, s: B.s, o: B.o * seg(k, 0.35, 1) };
      if (A) return { x: A.x, y: A.y, s: A.s, o: A.o * (1 - seg(k, 0, 0.6)) };
      return null;
    }
    function place(e, p) {
      var o = p ? r2(p.o) : 0;
      if (o > 0) sty(e, 'transform', 'translate(' + r2(p.x) + 'px,' + r2(p.y) + 'px) scale(' + r4(p.s) + ')');
      sop(e, o);
    }

    // ---------- figures: make(api) → { node, set(state) } ----------
    function figSvg(id, w, h) {
      var s = el('svg', { class: 'fig fig-' + id, viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'xMidYMid meet' });
      figHost.appendChild(s);
      var defs = el('defs', {}, s), m = el('marker', { id: 'ah-' + id, viewBox: '0 0 10 10', refX: 8.5, refY: 5, markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' }, defs);
      el('path', { d: 'M0 0L10 5L0 10z', class: 'ah' }, m);
      return s;
    }
    function T(g, x, y, s, c, anchor) { return el('text', { x: x, y: y, class: c, 'text-anchor': anchor || null }, g, s); }
    function R(g, x, y, w, h, c, rx) { return el('rect', { x: x, y: y, width: w, height: h, class: c, rx: rx || 0 }, g); }
    function P(g, d, c, arrow) { return el('path', { d: d, class: c, 'marker-end': arrow ? 'url(#ah-' + arrow + ')' : null }, g); }
    var api = { svg: figSvg, el: el, div: div, T: T, R: R, P: P, set: set, op: op, sop: sop, sty: sty, cls: cls, txt: txt, html: html, esc: esc,
      seg: seg, ease: ease, lerp: lerp, clamp01: clamp01, events: events, view: view };
    var FIGDEF = opts.figs || {}, figs = {};

    // t (local progress of the step) → which trace event; frac = how far toward the next one
    function scrubAt(st, t) {
      var sc = st.cfg.scrub, evs = events(sc.trace), to = sc.to == null ? evs.length - 1 : sc.to, from = sc.from || 0;
      var u = seg(t, st.mv, 0.9), f = from + u * (to - from), e = Math.min(to, Math.floor(f + 1e-9));
      return { e: e, frac: e >= to ? 0 : f - e, ev: evs[e], next: evs[Math.min(e + 1, to)], prev: evs[Math.max(from, e - 1)], from: from, to: to };
    }
    function stateOf(st, t, k) {
      var c = st.cfg, sc = c.scrub ? scrubAt(st, t) : null, tr = (FIGDEF[c.fig] || {}).trace || (c.scrub && c.scrub.trace);
      var s = { t: t, k: k, mode: c.figMode || (sc ? 'scrub' : 'event'), ev: null, next: null, prev: null, frac: 0, hover: hoverCh, step: c.id, cfg: c, narrow: view.narrow, sc: sc };
      if (sc) { s.ev = sc.ev; s.next = sc.next; s.prev = sc.prev; s.frac = sc.frac; }
      else if (c.figEvent != null && tr) s.ev = s.next = s.prev = events(tr)[c.figEvent];
      return s;
    }

    // ---------- rail at the top of the text column: step counter + chapter buttons sized by step count ----------
    var hud = { c: root.querySelector('[data-hud-c]') };
    function buildHud() {
      var ol = root.querySelector('[data-chaps]');
      chapters.forEach(function (c) {
        var li = document.createElement('li'), b = document.createElement('button');
        li.style.setProperty('--n', c.count);
        b.type = 'button'; b.title = c.cfg.n + ' ' + c.cfg.name; b.setAttribute('aria-label', b.title);
        b.innerHTML = '<span class="cn">' + esc(c.cfg.n) + '</span><span class="cl">' + esc(c.cfg.name) + '</span><i></i>';
        b.addEventListener('click', function () {
          var st = steps[c.first];
          window.scrollTo({ top: st.top - window.innerHeight * view.act + st.h * (st.mv + 0.03), behavior: reduce ? 'auto' : 'smooth' });
        });
        li.appendChild(b); ol.appendChild(li); c.btn = b;
      });
    }

    // ---------- every frame: only the scroll position matters ----------
    var lastI = -1, lastShown = null, hoverCh = null, boardDecor = null, autoplay = { paint: function () {} };
    function where() {
      var act = window.scrollY + window.innerHeight * view.act, i = 0;
      for (var k = 0; k < steps.length; k++) if (steps[k].top <= act) i = k;
      return { i: i, t: clamp01((act - steps[i].top) / steps[i].h) };
    }
    function moveK(st, t) { return reduce ? (t >= st.mv * 0.5 ? 1 : 0) : ease(seg(t, 0, st.mv)); }
    function render() {
      if (!(view.W > 40 && view.H > 120)) return;   // stage not laid out yet
      var w = where(), i = w.i, t = w.t, st = steps[i], pv = steps[Math.max(0, i - 1)];
      var k = i === 0 ? 1 : moveK(st, t), shown = k >= 0.5 ? st : pv;

      // equations: glide from the previous step's pose to this one's
      Object.keys(eqs).forEach(function (id) {
        var E = eqs[id];
        place(E.el, mix(pv === st ? null : pv.poses[id], st.poses[id], pv === st ? 1 : k));
        var on = shown.cfg.eq === id ? shown.cfg : null;
        Object.keys(E.spans).forEach(function (key) {
          var hot = on && on.hot && on.hot.indexOf(key) > -1, hot2 = on && on.hot2 && on.hot2.indexOf(key) > -1, foc = on && on.zoom === key;
          E.spans[key].forEach(function (sp) { cls(sp, 'is-hot', hot); cls(sp, 'is-hot2', hot2); cls(sp, 'is-focus', foc); });
        });
        cls(E.el, 'is-zoom', !!(on && on.zoom));
      });
      if (board) {
        var bp = mix(pv === st ? null : pv.board, st.board, pv === st ? 1 : k);
        place(board.el, bp);
        if (bp && bp.o > 0 && boardDecor) {
          var bs = st.board ? st : pv;
          boardDecor.set(stateOf(bs, bs === st ? t : 1, k));
        }
      }

      // caption and notes: the old step's fade out while the camera moves, the new step's fade in after it
      steps.forEach(function (s2, j) {
        var o = j === i ? (i === 0 ? 1 : seg(t, s2.mv * 0.85, s2.mv * 0.85 + 0.07)) : j === i - 1 ? 1 - seg(k, 0, 0.4) : 0;
        if (s2.say) sop(s2.say, j === i ? (i === 0 ? 1 : seg(t, s2.mv * 0.55, s2.mv * 0.55 + 0.08)) : j === i - 1 ? 1 - seg(k, 0, 0.4) : 0);
        op(s2.ovG, o);
        s2.notes.forEach(function (n) {
          sop(n.el, o);
          if (n.fn && o > 0) html(n.el, n.fn(stateOf(s2, j === i ? t : 1, k), api));
        });
      });

      // figure zone: cross-fade this step's figure with the previous one; the same figure stays lit
      var zf = (st.cfg.fig ? st : pv).zone.fig;
      if (zf) { sty(figWrap, 'transform', 'translate(' + r2(zf.x) + 'px,' + r2(zf.y) + 'px)'); sty(figWrap, 'width', r2(zf.w) + 'px'); sty(figWrap, 'height', r2(zf.h) + 'px'); }
      sop(figWrap, lerp(pv.cfg.fig && pv !== st ? 1 : st.cfg.fig ? 1 : 0, st.cfg.fig ? 1 : 0, k));
      var showFig = shown.cfg.fig ? shown : st.cfg.fig ? st : pv;
      txt(figTitle, (FIGDEF[showFig.cfg.fig] || {}).title || '');
      Object.keys(figs).forEach(function (id) {
        var a = pv !== st && pv.cfg.fig === id, b = st.cfg.fig === id;
        sop(figs[id].node, a && b ? 1 : (b ? (pv.cfg.fig && pv !== st ? k : 1) : 0) + (a ? 1 - k : 0));
      });
      if (st.cfg.fig) figs[st.cfg.fig].set(stateOf(st, t, k));
      if (pv !== st && pv.cfg.fig && pv.cfg.fig !== st.cfg.fig && k < 1) figs[pv.cfg.fig].set(stateOf(pv, 1, 1));

      var ch = chapterOf[st.cfg.ch];
      txt(hud.c, (i + 1) + ' / ' + steps.length);
      chapters.forEach(function (c) {
        cls(c.btn, 'is-on', c === ch);
        var p = i < c.first ? 0 : i >= c.first + c.count ? 1 : (i - c.first + t) / c.count;
        var v = String(r2(p));
        if (c.btn._p !== v) { c.btn._p = v; c.btn.style.setProperty('--p', v); }
      });
      if (i !== lastI) {
        steps.forEach(function (s2, j) { cls(s2.section, 'is-on', j === i); });
        lastI = i;
      }
      autoplay.paint();
    }

    var ticking = false;
    function request() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(function () { ticking = false; render(); });
    }

    // ---------- autoplay: advance (step, t) in time and scrollTo it, so it looks exactly like manual scrolling ----------
    // camera move = MOVE ms; dwell = text length (CPS chars/s) or trace length (EV ms per event); all divided by speed.
    // Any wheel / touch / click (outside the player) / key stops it.
    function makeAutoplay() {
      var box = root.querySelector('[data-player]'), btn = box.querySelector('[data-play]'), label = box.querySelector('[data-play-label]');
      var icon = btn.querySelector('svg'), heroBtn = document.querySelector('[data-play-hero]'), spd = [].slice.call(box.querySelectorAll('[data-spd]'));
      if (reduce) { box.hidden = true; return { paint: function () {} }; }
      if (heroBtn) heroBtn.hidden = false;
      var MOVE = 520, CPS = 26, EV = 160, MIN = 700, END_T = 0.9;
      var ICON = { idle: '<path d="M4.5 2.8v10.4L13 8z"/>', run: '<path d="M4 3h3v10H4zM9 3h3v10H9z"/>',
        done: '<path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12.6 2.2v3.4H9.2z"/>' };
      var LABEL = { idle: box.getAttribute('data-l-idle') || 'Auto-play', run: box.getAttribute('data-l-run') || 'Pause', done: box.getAttribute('data-l-done') || 'Replay' };
      var speed = 1, raf = 0, last = 0, pos = null, lead = null, setY = 0, shownState = '';
      try { var saved = parseFloat(localStorage.getItem('cw-speed')); if (saved > 0) speed = saved; } catch (e) {}
      function paintSpeed() { spd.forEach(function (b) { b.setAttribute('aria-pressed', String(+b.getAttribute('data-spd') === speed)); }); }
      spd.forEach(function (b) {
        b.addEventListener('click', function () {
          speed = +b.getAttribute('data-spd'); paintSpeed();
          try { localStorage.setItem('cw-speed', String(speed)); } catch (e) {}
        });
      });
      paintSpeed();
      function readMs(st) {
        if (st.readMs == null) {
          var s = [].map.call(st.section.querySelectorAll('h2, p:not(.kicker)'), function (n) { return n.textContent; }).join(' ');
          var cjk = (s.match(/[㐀-鿿]/g) || []).length, words = (s.match(/[A-Za-z0-9_.]+/g) || []).length;
          st.readMs = (cjk + words * 2) / CPS * 1000;
        }
        return st.readMs;
      }
      function restMs(st, mv) {   // with a trace: it plays between t = mv..0.9, at least EV ms per event
        var ms = Math.max(MIN, readMs(st)), sc = st.cfg.scrub;
        if (sc) { var n = (sc.to == null ? events(sc.trace).length - 1 : sc.to) - (sc.from || 0); ms = Math.max(ms, n * EV * (1 - mv) / Math.max(0.1, 0.9 - mv)); }
        return ms;
      }
      function yOf(i, t) { return steps[i].top + t * steps[i].h - window.innerHeight * view.act; }
      function go(y) { window.scrollTo(0, y); setY = window.scrollY; }
      function atEnd() { var w = where(); return w.i === steps.length - 1 && w.t >= END_T - 0.05; }
      function tick(ts) {
        var dt = last ? Math.min(250, ts - last) : 0;   // don't leap after a background tab
        last = ts;
        if (Math.abs(window.scrollY - setY) > 2) return stop();   // something else moved the page
        if (lead) {   // glide from the current position to the start point
          if (!lead.t0) lead.t0 = ts;
          lead.u = Math.min(1, (ts - lead.t0) / lead.ms);
          go(lerp(lead.y0, yOf(pos.i, pos.t), ease(lead.u)));
          if (lead.u >= 1) lead = null;
        } else {
          var st = steps[pos.i], mv = pos.i === 0 ? 0 : st.mv, d = dt * speed;
          if (pos.t < mv) pos.t = Math.min(mv, pos.t + d / MOVE * mv);
          else pos.t += d / restMs(st, mv) * (1 - mv);
          if (pos.i === steps.length - 1 && pos.t >= END_T) { go(yOf(pos.i, END_T)); return stop(); }
          if (pos.t >= 1) { pos.i++; pos.t = 0; }
          go(yOf(pos.i, pos.t));
        }
        raf = requestAnimationFrame(tick);
      }
      function start() {
        if (raf) return;
        measure();
        var w = where(), above = window.scrollY + window.innerHeight * view.act < steps[0].top;
        pos = above || atEnd() ? { i: 0, t: 0 } : { i: w.i, t: w.t };
        var y0 = window.scrollY, dist = Math.abs(y0 - yOf(pos.i, pos.t));
        lead = null; setY = y0; last = 0;
        if (dist > 2.5 * window.innerHeight) go(yOf(pos.i, pos.t));   // replay: jump, don't rewind the whole page
        else if (dist > 4) lead = { y0: y0, u: 0, t0: 0, ms: 250 + dist * 0.12 };
        raf = requestAnimationFrame(tick);
        paint();
      }
      function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; lead = null; paint(); }
      function paint() {
        var state = raf ? 'run' : atEnd() ? 'done' : 'idle';
        if (state === shownState) return;
        shownState = state;
        txt(label, LABEL[state]); btn.setAttribute('aria-label', LABEL[state]);
        icon.innerHTML = ICON[state];
        cls(box, 'is-run', state === 'run');
      }
      btn.addEventListener('click', function () { if (raf) stop(); else start(); });
      if (heroBtn) heroBtn.addEventListener('click', start);
      function interrupt(e) { if (raf && !box.contains(e.target) && !(heroBtn && heroBtn.contains(e.target))) stop(); }
      ['wheel', 'touchstart', 'pointerdown', 'keydown'].forEach(function (k) { window.addEventListener(k, interrupt, { passive: true }); });
      return { paint: paint };
    }

    function init() {
      if (root.classList.contains('is-live')) return;
      collect();
      root.classList.add('is-live');
      steps.forEach(buildStep);
      var used = {};
      steps.forEach(function (st) { if (st.cfg.fig) used[st.cfg.fig] = 1; });
      Object.keys(used).forEach(function (id) {
        if (!FIGDEF[id]) throw new Error('no figure "' + id + '" — pass it in MathWalk({ figs })');
        figs[id] = FIGDEF[id].make(api);
        sop(figs[id].node, 0);
      });
      buildHud();
      autoplay = makeAutoplay();
      measure();
      if (board && opts.board) {
        api.board = board; api.chapters = opts.chapters || [];
        boardDecor = opts.board(api);
        measure();   // the decor may have added labels that the layout reads
      }
      render();
      window.addEventListener('scroll', request, { passive: true });
      window.addEventListener('resize', function () { measure(); request(); });
      if ('ResizeObserver' in window) new ResizeObserver(function () { measure(); request(); }).observe(root);
      if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { measure(); request(); });
      var text = root.querySelector('.mw-text');
      text.addEventListener('mouseover', function (e) { var c = e.target.closest('.ch'); var h = c ? c.getAttribute('data-ch') : null; if (h !== hoverCh) { hoverCh = h; request(); } });
      text.addEventListener('mouseout', function (e) { if (e.target.closest('.ch') && hoverCh) { hoverCh = null; request(); } });
    }
    // term boxes are measured from the rendered glyphs, so wait for the math fonts (or 2 s)
    var fonts = document.fonts && document.fonts.load ? Promise.all([
      document.fonts.load('20px KaTeX_Main'), document.fonts.load('20px KaTeX_Size1'), document.fonts.load('20px KaTeX_Size2'),
      document.fonts.load('20px "STIX Two Text"', 'ψ'), document.fonts.ready]) : Promise.resolve();
    Promise.race([fonts, new Promise(function (r) { setTimeout(r, 2000); })]).then(init, init);
  };

  /* MathWalk.blackboard({ columns, colWidth }): the standard board decoration. Board rows are \T{r<n>}{…} spans.
     · chapters with rows: [a, b] get a bracket (number + name) left of those rows; the overview board lights them in turn
       (bracket: false skips one, e.g. a chapter that only reruns earlier rows).
     · columns: [{ name, values: { <row>: 'text' }, mark: [<row>, …] }], one per worked example, placed right of the rows
       that have values. The 'run' board fills them row by row, column by column (its scrub defaults to the trace
       'board', made here), fades the rows outside board.rows and moves a band to the row being filled; the 'end' board
       shows every value. Rows in mark are drawn in the accent: where that example loses something or breaks. */
  window.MathWalk.blackboard = function (cfg) {
    cfg = cfg || {};
    var COLS = cfg.columns || [], order = [];
    COLS.forEach(function (col, c) {
      Object.keys(col.values || {}).map(Number).sort(function (a, b) { return a - b; })
        .forEach(function (row) { order.push({ vars: { col: c, row: row } }); });
    });
    function make(api) {
      var B = api.board, L = B.layer, groups = [], cells = [], heads = [], at = {}, vrows = [], colW = 0;
      var band = api.div('mw-band', L);
      order.forEach(function (e, i) {
        at[e.vars.col + ':' + e.vars.row] = i;
        if (vrows.indexOf(e.vars.row) < 0) vrows.push(e.vars.row);
      });
      vrows.sort(function (a, b) { return a - b; });
      api.chapters.forEach(function (c) {
        if (!c.rows || c.bracket === false) return;
        var g = api.div('mw-grp', L);
        g.innerHTML = '<span class="mw-gn">' + api.esc(c.n) + '</span><span class="mw-gl">' + api.esc(c.name) + '</span>';
        groups.push({ c: c, el: g });
      });
      COLS.forEach(function (col, c) {
        var h = api.div('mw-colh', L);
        api.txt(h, col.name); heads.push(h);
        Object.keys(col.values || {}).forEach(function (row) {
          var e = api.div('mw-cell', L);
          api.txt(e, col.values[row]);
          cells.push({ c: c, row: +row, el: e, mark: (col.mark || []).indexOf(+row) > -1 });
        });
      });
      vrows.forEach(function (n) { if (!B.rows['r' + n]) console.error('mathwalk: a column has a value for row ' + n + ', but the board has no \\T{r' + n + '}{…}'); });
      function box(n) { return B.rows['r' + n]; }
      function colsX() { var x = 0; vrows.forEach(function (n) { if (box(n)) x = Math.max(x, box(n).x + box(n).w); }); return x + 34; }
      function left(narrow) { return groups.length ? (narrow ? 44 : 132) : 0; }
      function showCols(mode, narrow) { return COLS.length > 0 && (mode === 'run' || (mode === 'end' && !narrow)); }
      function px(e, x, y) { api.sty(e, 'transform', 'translate(' + Math.round(x * 10) / 10 + 'px,' + Math.round(y * 10) / 10 + 'px)'); }
      return {
        extent: function (b) {
          var narrow = api.view.narrow, n = showCols(b.mode, narrow) ? (narrow ? 1 : COLS.length) : 0;
          colW = cfg.colWidth || 28 + Math.max.apply(null, [44].concat(heads.concat(cells.map(function (q) { return q.el; })).map(function (e) { return e.offsetWidth; })));
          return { x0: -left(narrow), x1: n ? colsX() + n * colW - 12 : 0, top: n ? 40 : 8 };
        },
        set: function (st) {
          var b = st.cfg.board, mode = b.mode, narrow = st.narrow, t = st.t, x0 = colsX();
          var lit = null;   // rows lit by the overview walk or by hovering a chapter chip
          if (mode === 'overview' && groups.length) {
            var gi = Math.min(groups.length - 1, Math.floor((t - 0.12) / (0.7 / groups.length)));
            if (t > 0.12 && t < 0.86) lit = groups[gi].c.rows;
          }
          if (st.hover) api.chapters.forEach(function (c) { if (c.id === st.hover && c.rows) lit = c.rows; });
          var cur = mode === 'run' && st.ev ? st.ev.vars : null, e = cur && st.sc ? st.sc.e : -1, span = mode === 'run' ? b.rows : null;
          function out(a, z) { return !!span && (z < span[0] || a > span[1]); }
          Object.keys(B.spans).forEach(function (k) {
            if (!/^r\d+$/.test(k)) return;
            var n = +k.slice(1), dim = !!lit && (n < lit[0] || n > lit[1]), o = out(n, n);
            B.spans[k].forEach(function (sp) { api.cls(sp, 'is-dim', dim); api.cls(sp, 'is-out', o); });
          });
          groups.forEach(function (g) {
            var a = box(g.c.rows[0]), z = box(g.c.rows[1]), same = !!lit && lit[0] === g.c.rows[0] && lit[1] === g.c.rows[1];
            if (!a || !z) return;
            px(g.el, -left(narrow), a.y);
            api.sty(g.el, 'height', Math.round(z.y + z.h - a.y) + 'px');
            api.cls(g.el, 'is-hot', same);
            api.cls(g.el, 'is-dim', !!lit && !same);
            api.cls(g.el, 'is-out', out(g.c.rows[0], g.c.rows[1]));
            api.cls(g.el, 'is-narrow', narrow);
          });
          // value columns (narrow: only the column being filled)
          var show = showCols(mode, narrow), top = vrows.length ? box(vrows[0]) : null;
          heads.forEach(function (h, c) {
            if (top) px(h, x0 + (narrow ? 0 : c) * colW, top.y - 30);
            api.sop(h, show && (!narrow || (cur && c === cur.col)) ? (cur && c > cur.col ? 0.35 : 1) : 0);
            api.cls(h, 'is-hot', !!cur && c === cur.col);
          });
          cells.forEach(function (q) {
            var bx = box(q.row), done = mode === 'end' || (!!cur && at[q.c + ':' + q.row] <= e);
            if (!bx) return;
            px(q.el, x0 + (narrow ? 0 : q.c) * colW, bx.y + bx.h / 2 - 11);
            api.sop(q.el, show && done && (!narrow || q.c === cur.col) ? 1 : 0);
            api.cls(q.el, 'is-mark', q.mark);
            api.cls(q.el, 'is-now', !!cur && q.c === cur.col && q.row === cur.row);
          });
          // the band glides to the next row over the second half of an event
          if (cur && box(cur.row)) {
            var nx = st.next ? st.next.vars : cur, a1 = box(cur.row), a2 = nx.col === cur.col && box(nx.row) ? box(nx.row) : a1;
            var kk = api.ease(api.seg(st.frac || 0, 0.55, 1));
            px(band, -14, api.lerp(a1.y, a2.y, kk) - 4);
            api.sty(band, 'height', Math.round(api.lerp(a1.h, a2.h, kk) + 8) + 'px');
            api.sty(band, 'width', Math.round(x0 + (narrow ? 1 : COLS.length) * colW) + 'px');
            api.sop(band, api.seg(t, 0.05, 0.12));
          } else api.sop(band, 0);
        }
      };
    }
    make.trace = order;
    return make;
  };
})();
