/* 知識圖譜（netlist view）：force-directed graph，畫在 canvas 上。
   不依賴外部函式庫；力學模型參考 d3-force（many-body + link + 向中心的引力）。 */
(function () {
  'use strict';

  var figures = Array.prototype.slice.call(document.querySelectorAll('[data-graph]'));
  if (!figures.length) return;

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var palette = {};
  var TOKENS = ['--ink', '--ink-2', '--ink-3', '--line-2', '--accent', '--surface', '--node-post', '--node-note', '--node-project', '--font-mono'];

  function readPalette() {
    var cs = getComputedStyle(root);
    TOKENS.forEach(function (t) { palette[t] = cs.getPropertyValue(t).trim(); });
  }
  readPalette();

  var graphs = figures.map(createGraph);
  function repaintAll() { readPalette(); graphs.forEach(function (g) { g.redraw(); }); }
  new MutationObserver(repaintAll).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-scheme'] });
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', repaintAll);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(repaintAll);

  function createGraph(fig) {
    var raw = JSON.parse(fig.querySelector('script[type="application/json"]').textContent || '{}');
    raw.nodes = raw.nodes || [];
    raw.links = raw.links || [];
    var isLocal = fig.getAttribute('data-variant') === 'local';
    var stage = fig.querySelector('.netlist-stage');
    var canvas = stage.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var info = fig.querySelector('[data-graph-info]');
    var infoDefault = info ? info.textContent : '';
    var search = fig.querySelector('[data-graph-search]');
    var tagToggle = fig.querySelector('[data-graph-tags]');

    var W = 0, H = 0, dpr = 1;
    var view = { x: 0, y: 0, k: 1 };
    var userView = false;
    var nodes = [], links = [], focus = null;
    var alpha = 1, alphaTarget = 0;
    var ALPHA_MIN = 0.003, ALPHA_DECAY = 0.0228, VELOCITY_DECAY = 0.42;
    var hover = null, query = '', press = null;
    var raf = 0, visible = true;

    // ── data ──────────────────────────────────────────────
    function build(withTags) {
      var keep = {};
      nodes.forEach(function (n) { keep[n.id] = n; });
      nodes = raw.nodes.map(function (d, i) {
        return { id: 'n' + i, title: d.t, kind: d.k, url: d.u, tags: d.g || [], level: d.l || 0, deg: 0, nb: [] };
      });
      links = raw.links.map(function (l) { return { s: nodes[l[0]], t: nodes[l[1]] }; });
      if (withTags) {
        var tagNodes = {};
        raw.nodes.forEach(function (d, i) {
          (d.g || []).forEach(function (tag) {
            var tn = tagNodes[tag];
            if (!tn) {
              tn = tagNodes[tag] = { id: 'tag:' + tag, title: '#' + tag, kind: 'tag', url: (raw.tags || {})[tag], tags: [], level: 0, deg: 0, nb: [] };
              nodes.push(tn);
            }
            links.push({ s: nodes[i], t: tn, tag: true });
          });
        });
      }
      links.forEach(function (l) {
        l.s.deg++; l.t.deg++;
        l.s.nb.push(l.t); l.t.nb.push(l.s);
      });
      focus = raw.focus != null ? nodes[raw.focus] : null;
      ctx.font = '500 11px ' + (palette['--font-mono'] || 'monospace');

      // 初始位置：沿用舊位置，否則用 phyllotaxis 螺旋（度數高的節點在中心）
      nodes.forEach(function (n, i) {
        var old = keep[n.id];
        if (old) { n.x = old.x; n.y = old.y; }
        else if (n.kind === 'tag' && n.nb[0] && n.nb[0].x != null) {
          n.x = n.nb[0].x + (Math.random() - 0.5) * 30;
          n.y = n.nb[0].y + (Math.random() - 0.5) * 30;
        } else {
          var r = 12 * Math.sqrt(0.5 + i), a = i * 2.399963;
          n.x = r * Math.cos(a); n.y = r * Math.sin(a);
        }
        n.vx = 0; n.vy = 0;
        n.r = radius(n);
        n.lw = ctx.measureText(n.title.length > 24 ? n.title.slice(0, 23) + '…' : n.title).width / 2 + 6;
      });
    }

    function radius(n) {
      var base = { project: 6.5, post: 5, note: 4.2, ghost: 3.6, tag: 3.2 }[n.kind] || 4;
      return Math.min(base + Math.sqrt(n.deg) * 1.5, base + 7);
    }

    // ── simulation ────────────────────────────────────────
    function tick() {
      alpha += (alphaTarget - alpha) * ALPHA_DECAY;
      var n = nodes.length, i, j, a, b, dx, dy, l2, w;
      var charge = isLocal ? -190 : -170;

      for (i = 0; i < n; i++) {
        a = nodes[i];
        for (j = i + 1; j < n; j++) {
          b = nodes[j];
          dx = b.x - a.x; dy = b.y - a.y;
          l2 = dx * dx + dy * dy;
          if (l2 > 360000) continue;
          if (l2 < 1) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; l2 = 1; }
          w = charge * alpha / l2;
          a.vx += dx * w; a.vy += dy * w;
          b.vx -= dx * w; b.vy -= dy * w;
        }
      }

      links.forEach(function (l) {
        var s = l.s, t = l.t;
        var lx = t.x + t.vx - s.x - s.vx, ly = t.y + t.vy - s.y - s.vy;
        var d = Math.sqrt(lx * lx + ly * ly) || 1e-6;
        var dist = l.tag ? 40 : (isLocal ? 72 : 62);
        var k = (d - dist) / d * alpha / Math.min(s.deg, t.deg);
        lx *= k; ly *= k;
        var bias = s.deg / (s.deg + t.deg);
        t.vx -= lx * bias; t.vy -= ly * bias;
        s.vx += lx * (1 - bias); s.vy += ly * (1 - bias);
      });

      // 往中心拉：依面板長寬比調整兩個方向的力道，讓圖形的形狀貼合面板
      var aspect = Math.sqrt(Math.max(0.4, Math.min(2.5, W / H)));
      var gx = 0.045 / aspect * alpha, gy = 0.045 * aspect * alpha;
      nodes.forEach(function (p) {
        var g = p.deg ? 1 : 4; // 沒有連結的節點拉得更緊，免得漂到角落
        p.vx -= p.x * gx * g; p.vy -= p.y * gy * g;
        if (press && press.node === p) {
          p.x = p.fx; p.y = p.fy; p.vx = 0; p.vy = 0;
          return;
        }
        p.x += (p.vx *= 1 - VELOCITY_DECAY);
        p.y += (p.vy *= 1 - VELOCITY_DECAY);
      });
    }

    function fitTarget() {
      if (!nodes.length) return { x: 0, y: 0, k: 1 };
      // 上方留給工具列、下方留給標籤與說明列
      var maxK = isLocal ? 1.8 : 1.6, pad = 20, padTop = 56, padBottom = 50;
      var bounds = function (k) {
        var b = { l: Infinity, r: -Infinity, t: Infinity, btm: -Infinity };
        nodes.forEach(function (n) {
          // 第二輪把標籤寬度（螢幕像素）換算成世界座標一起算進邊界，避免文字被切掉
          var half = k ? Math.max(n.r, n.lw / k) : n.r;
          b.l = Math.min(b.l, n.x - half); b.r = Math.max(b.r, n.x + half);
          b.t = Math.min(b.t, n.y - n.r); b.btm = Math.max(b.btm, n.y + n.r);
        });
        return b;
      };
      var scale = function (b) {
        var k = Math.min((W - pad * 2) / Math.max(1, b.r - b.l), (H - padTop - padBottom) / Math.max(1, b.btm - b.t), maxK);
        return Math.max(0.25, k);
      };
      // 縮放比例會影響標籤在世界座標的寬度，迭代幾次讓兩者收斂
      var b = bounds(0), k = scale(b);
      for (var it = 0; it < 4; it++) { b = bounds(k); k = scale(b); }
      return { x: -(b.l + b.r) / 2 * k, y: (padTop - padBottom) / 2 - (b.t + b.btm) / 2 * k, k: k };
    }

    function easeView(immediate) {
      var t = fitTarget();
      var f = immediate ? 1 : 0.12;
      view.x += (t.x - view.x) * f;
      view.y += (t.y - view.y) * f;
      view.k += (t.k - view.k) * f;
      return Math.abs(t.k - view.k) > 0.002 || Math.abs(t.x - view.x) > 0.5 || Math.abs(t.y - view.y) > 0.5;
    }

    // ── drawing ───────────────────────────────────────────
    function colorOf(n) {
      if (n.kind === 'project') return palette['--node-project'];
      if (n.kind === 'note') return palette['--node-note'];
      if (n.kind === 'post') return palette['--node-post'];
      return palette['--ink-3'];
    }

    function matches(n) { return query && n.title.toLowerCase().indexOf(query) > -1; }

    function highlightSet() {
      if (hover) {
        var s = new Set([hover]);
        hover.nb.forEach(function (n) { s.add(n); });
        return s;
      }
      if (query) {
        var m = new Set();
        nodes.forEach(function (n) { if (matches(n)) m.add(n); });
        return m;
      }
      return null;
    }

    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      var ox = W / 2 + view.x, oy = H / 2 + view.y, k = view.k;
      var hl = highlightSet();
      var rs = Math.max(0.7, Math.min(1.5, Math.sqrt(k)));

      // links
      links.forEach(function (l) {
        var on = hl && hl.has(l.s) && hl.has(l.t) && (!hover || l.s === hover || l.t === hover);
        var dim = isLocal && (l.s.level >= 2 || l.t.level >= 2);
        ctx.globalAlpha = hl ? (on ? 0.95 : 0.07) : (dim ? 0.3 : 0.55);
        ctx.strokeStyle = on ? palette['--accent'] : palette['--ink-3'];
        ctx.lineWidth = on ? 1.4 : 1;
        ctx.setLineDash(l.tag || l.t.kind === 'ghost' ? [3, 3] : []);
        ctx.beginPath();
        ctx.moveTo(l.s.x * k + ox, l.s.y * k + oy);
        ctx.lineTo(l.t.x * k + ox, l.t.y * k + oy);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      // nodes
      nodes.forEach(function (n) {
        var x = n.x * k + ox, y = n.y * k + oy, r = n.r * rs;
        if (x < -30 || y < -30 || x > W + 30 || y > H + 30) return;
        ctx.globalAlpha = hl ? (hl.has(n) ? 1 : 0.14) : (isLocal && n.level >= 2 ? 0.45 : 1);
        ctx.fillStyle = colorOf(n);
        ctx.strokeStyle = palette['--surface'];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        if (n.kind === 'project') {
          ctx.rect(x - r, y - r, r * 2, r * 2);
          ctx.fill(); ctx.stroke();
          ctx.fillStyle = palette['--surface'];
          ctx.beginPath(); ctx.arc(x - r * 0.45, y - r * 0.45, Math.max(1, r * 0.18), 0, Math.PI * 2); ctx.fill();
        } else if (n.kind === 'tag') {
          ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r + 1, y); ctx.lineTo(x, y + r + 1); ctx.lineTo(x - r - 1, y); ctx.closePath();
          ctx.fill();
        } else if (n.kind === 'ghost') {
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = palette['--surface']; ctx.fill();
          ctx.setLineDash([2, 2]); ctx.strokeStyle = palette['--ink-3']; ctx.lineWidth = 1.2; ctx.stroke(); ctx.setLineDash([]);
        } else {
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fill(); ctx.stroke();
        }
        if (n === focus || n === hover) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = n === focus ? palette['--accent'] : palette['--ink'];
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(x, y, r + 4.5, 0, Math.PI * 2); ctx.stroke();
        }
      });

      // labels：依優先順序擺放（hover > 目前頁面 > 高亮 > 連結數），和已畫的標籤重疊就略過
      ctx.font = '500 11px ' + (palette['--font-mono'] || 'monospace');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      var rank = function (n) { return n === hover ? 1e6 : n === focus ? 1e5 : n.deg; };
      var placed = [];
      nodes.filter(function (n) {
        if (hl) return hl.has(n);
        return isLocal || n === focus || k >= 1.2 || (n.deg >= 3 && k >= 0.55);
      }).sort(function (a, b) { return rank(b) - rank(a); }).forEach(function (n) {
        var x = n.x * k + ox, y = n.y * k + oy + n.r * rs + 5;
        if (x < -80 || y < -20 || x > W + 80 || y > H + 20) return;
        var text = n.title.length > 24 ? n.title.slice(0, 23) + '…' : n.title;
        var half = ctx.measureText(text).width / 2 + 3;
        var box = { l: x - half, r: x + half, t: y - 1, b: y + 14 };
        var hit = placed.some(function (p) { return box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t; });
        if (hit && n !== hover && n !== focus) return;
        placed.push(box);
        ctx.globalAlpha = !hl && isLocal && n.level >= 2 ? 0.55 : 0.95;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = palette['--surface'];
        ctx.strokeText(text, x, y);
        ctx.fillStyle = n === hover || n === focus ? palette['--ink'] : palette['--ink-2'];
        ctx.fillText(text, x, y);
      });
      ctx.globalAlpha = 1;
    }

    // ── loop ──────────────────────────────────────────────
    function frame() {
      raf = 0;
      var running = alpha > ALPHA_MIN || alphaTarget > 0;
      if (running) tick();
      var easing = !userView && easeView(false);
      draw();
      if ((running || easing) && visible) raf = requestAnimationFrame(frame);
    }
    function request() { if (!raf && visible) raf = requestAnimationFrame(frame); }
    function reheat(a) { alpha = Math.max(alpha, a); request(); }

    // ── interaction ───────────────────────────────────────
    function pointer(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function toWorld(p) {
      return { x: (p.x - W / 2 - view.x) / view.k, y: (p.y - H / 2 - view.y) / view.k };
    }
    function pick(p) {
      var best = null, bestD = Infinity, rs = Math.max(0.7, Math.min(1.5, Math.sqrt(view.k)));
      nodes.forEach(function (n) {
        var dx = n.x * view.k + W / 2 + view.x - p.x, dy = n.y * view.k + H / 2 + view.y - p.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < n.r * rs + 6 && d < bestD) { best = n; bestD = d; }
      });
      return best;
    }
    function setInfo(n) {
      if (!info) return;
      if (!n) { info.textContent = infoDefault; return; }
      var label = { project: 'PROJECT', post: 'WRITING', note: 'NOTE', ghost: 'UNWRITTEN', tag: 'TAG' }[n.kind];
      info.textContent = '▸ ' + label + ' · ' + n.title + ' · ' + n.deg + (n.deg === 1 ? ' link' : ' links') + (n.kind === 'ghost' ? ' · 還沒寫' : '');
    }
    function zoomAt(p, factor) {
      var w = toWorld(p);
      var k = Math.max(0.2, Math.min(4, view.k * factor));
      view.k = k;
      view.x = p.x - W / 2 - w.x * k;
      view.y = p.y - H / 2 - w.y * k;
      userView = true;
      request();
    }

    canvas.addEventListener('pointerdown', function (e) {
      var p = pointer(e);
      var n = pick(p);
      press = { x: p.x, y: p.y, vx: view.x, vy: view.y, node: n, moved: false };
      if (n) { n.fx = n.x; n.fy = n.y; }
      canvas.setPointerCapture(e.pointerId);
      canvas.classList.add('is-grabbing');
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = pointer(e);
      if (press) {
        if (Math.abs(p.x - press.x) + Math.abs(p.y - press.y) > 4) press.moved = true;
        if (!press.moved) return;
        if (press.node) {
          var w = toWorld(p);
          press.node.fx = w.x; press.node.fy = w.y;
          alphaTarget = 0.25; reheat(0.25);
        } else {
          view.x = press.vx + p.x - press.x;
          view.y = press.vy + p.y - press.y;
          userView = true;
          request();
        }
        return;
      }
      var n = pick(p);
      if (n !== hover) {
        hover = n;
        canvas.style.cursor = n ? (n.url ? 'pointer' : 'default') : '';
        setInfo(n);
        request();
      }
    });
    function release(e) {
      if (!press) return;
      var p = press;
      press = null;
      alphaTarget = 0;
      canvas.classList.remove('is-grabbing');
      if (e.type === 'pointerup' && p.node && !p.moved && p.node.url) window.location.href = p.node.url;
      request();
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', function () {
      if (press) return;
      hover = null; setInfo(null); request();
    });
    canvas.addEventListener('wheel', function (e) {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomAt(pointer(e), Math.exp(-e.deltaY * 0.0025));
    }, { passive: false });

    fig.querySelectorAll('[data-graph-zoom]').forEach(function (b) {
      b.addEventListener('click', function () { zoomAt({ x: W / 2, y: H / 2 }, parseFloat(b.getAttribute('data-graph-zoom'))); });
    });
    var fitBtn = fig.querySelector('[data-graph-fit]');
    if (fitBtn) fitBtn.addEventListener('click', function () { userView = false; request(); });
    if (search) {
      search.addEventListener('input', function () { query = search.value.trim().toLowerCase(); request(); });
    }
    if (tagToggle) {
      tagToggle.addEventListener('change', function () {
        build(tagToggle.checked);
        userView = false;
        if (reduceMotion) settle(); else reheat(0.7);
      });
    }

    // ── sizing / visibility ───────────────────────────────
    function resize() {
      var rect = stage.getBoundingClientRect();
      W = Math.max(1, rect.width); H = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
      if (!userView) easeView(true);
      draw();
    }
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(stage);
    else window.addEventListener('resize', resize);

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) request();
      }).observe(fig);
    }

    function settle() {
      for (var i = 0; i < 400 && alpha > ALPHA_MIN; i++) tick();
      alpha = 0;
      easeView(true);
      draw();
    }

    build(tagToggle ? tagToggle.checked : false);
    resize();
    // 先在背景跑幾步，避免一開始節點擠成一團
    for (var i = 0; i < 80; i++) tick();
    easeView(true);
    if (reduceMotion) settle(); else request();

    return { redraw: function () { draw(); } };
  }
})();
