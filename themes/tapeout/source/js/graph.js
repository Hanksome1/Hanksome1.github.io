/* 知識圖譜（netlist view）：force-directed graph，畫在 canvas 上。
   不依賴外部函式庫；力學模型參考 d3-force（many-body + link + 向中心的引力）。
   觸控裝置：頁面上的圖只負責預覽（單指照常捲動頁面、點一下選取節點），
   按 Expand 進入全螢幕後才能拖曳、雙指縮放。 */
(function () {
  'use strict';

  var figures = Array.prototype.slice.call(document.querySelectorAll('[data-graph]'));
  if (!figures.length) return;

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var touchUI = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  var palette = {};
  var TOKENS = ['--ink', '--ink-2', '--ink-3', '--line-2', '--accent', '--surface', '--node-post', '--node-note', '--node-project', '--font-mono'];
  var KIND = { project: 'PROJECT', post: 'WRITING', note: 'NOTE', ghost: 'UNWRITTEN', tag: 'TAG' };

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

  function createGraph(fig, idx) {
    var raw = JSON.parse(fig.querySelector('script[type="application/json"]').textContent || '{}');
    raw.nodes = raw.nodes || [];
    raw.links = raw.links || [];
    var isLocal = fig.getAttribute('data-variant') === 'local';
    var stage = fig.querySelector('.netlist-stage');
    var canvas = stage.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var tools = fig.querySelector('.netlist-tools');
    var info = fig.querySelector('[data-graph-info]');
    var search = fig.querySelector('[data-graph-search]');
    var tagToggle = fig.querySelector('[data-graph-tags]');
    var expandBtn = fig.querySelector('[data-graph-expand]');
    var card = fig.querySelector('[data-graph-card]');
    var cardMeta = card.querySelector('[data-card-meta]');
    var cardTitle = card.querySelector('[data-card-title]');
    var cardOpen = card.querySelector('[data-card-open]');
    var cardNb = card.querySelector('[data-card-nb]');

    var W = 0, H = 0, dpr = 1;
    var view = { x: 0, y: 0, k: 1 };
    var userView = false; // 使用者自己移動過視角，就不再自動 fit
    var target = null;    // 視角要移動到的位置（選取的節點跑出畫面時用）
    var autoPan = false;  // 視角是因為選取節點才移動的，取消選取時回到 fit
    var nodes = [], links = [], focus = null;
    var alpha = 1, alphaTarget = 0;
    var ALPHA_MIN = 0.003, ALPHA_DECAY = 0.0228, VELOCITY_DECAY = 0.42;
    var hover = null, sel = null, query = '';
    var press = null, pinch = null, pointers = {};
    var raf = 0, visible = true;
    var full = false, holder = null;

    // ── data ──────────────────────────────────────────────
    function build(withTags) {
      var keep = {};
      nodes.forEach(function (n) { keep[n.id] = n; });
      var selId = sel && sel.id;
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
      });

      // 重建後換成新的節點物件；選取的 tag 節點在關掉 Tags 後就消失了
      hover = null;
      sel = null;
      if (selId) nodes.forEach(function (n) { if (n.id === selId) sel = n; });
      if (selId) showCard(sel);
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

      // 往中心拉：依面板長寬比調整兩個方向的力道，讓圖形的形狀貼合面板。
      // 直式面板（手機）開根號不夠力，各群組還是會橫著排，所以直接用長寬比
      var ratio = W / H;
      var aspect = ratio < 1 ? Math.max(0.4, ratio) : Math.sqrt(Math.min(2.5, ratio));
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

    // 工具列底下、資訊卡上面，節點不會被擋住的範圍
    function safeTop() { return tools.offsetTop + tools.offsetHeight + 12; }
    function safeBottom() { return H - (card.hidden ? 50 : card.offsetHeight + 24); }

    function fitTarget() {
      if (!nodes.length) return { x: 0, y: 0, k: 1 };
      // 上方留給工具列、下方留給標籤與說明列。標籤不算進邊界（畫的時候會推回畫面內），
      // 否則手機上標籤寬度佔掉大半個面板，整張圖會被縮得很小
      var maxK = isLocal ? 1.8 : 1.6, pad = 24, padTop = full ? safeTop() : 56, padBottom = 50;
      var b = { l: Infinity, r: -Infinity, t: Infinity, btm: -Infinity };
      nodes.forEach(function (n) {
        b.l = Math.min(b.l, n.x - n.r); b.r = Math.max(b.r, n.x + n.r);
        b.t = Math.min(b.t, n.y - n.r); b.btm = Math.max(b.btm, n.y + n.r);
      });
      var k = Math.min((W - pad * 2) / Math.max(1, b.r - b.l), (H - padTop - padBottom) / Math.max(1, b.btm - b.t), maxK);
      k = Math.max(0.25, k);
      return { x: -(b.l + b.r) / 2 * k, y: (padTop - padBottom) / 2 - (b.t + b.btm) / 2 * k, k: k };
    }

    function easeView(immediate) {
      var t = target || (userView ? null : fitTarget());
      if (!t) return false;
      var f = immediate ? 1 : target ? 0.16 : 0.12;
      view.x += (t.x - view.x) * f;
      view.y += (t.y - view.y) * f;
      view.k += (t.k - view.k) * f;
      var moving = Math.abs(t.k - view.k) > 0.002 || Math.abs(t.x - view.x) > 0.5 || Math.abs(t.y - view.y) > 0.5;
      if (!moving && target) { view.x = t.x; view.y = t.y; view.k = t.k; target = null; }
      return moving;
    }

    // ── drawing ───────────────────────────────────────────
    function colorOf(n) {
      if (n.kind === 'project') return palette['--node-project'];
      if (n.kind === 'note') return palette['--node-note'];
      if (n.kind === 'post') return palette['--node-post'];
      return palette['--ink-3'];
    }

    function nodeScale() { return Math.max(0.7, Math.min(1.5, Math.sqrt(view.k))); }
    function screenOf(n) { return { x: n.x * view.k + W / 2 + view.x, y: n.y * view.k + H / 2 + view.y }; }

    function matches(n) { return query && n.title.toLowerCase().indexOf(query) > -1; }

    function highlightSet() {
      var h = hover || sel;
      if (h) {
        var s = new Set([h]);
        h.nb.forEach(function (n) { s.add(n); });
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
      var center = hover || sel;
      var rs = nodeScale();

      // links
      links.forEach(function (l) {
        var on = hl && hl.has(l.s) && hl.has(l.t) && (!center || l.s === center || l.t === center);
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
        if (n === focus || n === hover || n === sel) {
          ctx.globalAlpha = 1;
          ctx.strokeStyle = n === focus ? palette['--accent'] : palette['--ink'];
          ctx.lineWidth = n === sel ? 2 : 1.5;
          ctx.beginPath(); ctx.arc(x, y, r + (n === sel ? 5.5 : 4.5), 0, Math.PI * 2); ctx.stroke();
        }
      });

      // labels：依優先順序擺放（hover > 選取 > 目前頁面 > 高亮 > 連結數），和已畫的標籤重疊就略過
      ctx.font = '500 11px ' + (palette['--font-mono'] || 'monospace');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.lineJoin = 'round';
      var rank = function (n) { return n === hover ? 1e6 : n === sel ? 5e5 : n === focus ? 1e5 : n.deg; };
      var placed = [];
      nodes.filter(function (n) {
        if (hl) return hl.has(n);
        return isLocal || n === focus || k >= 1.2 || (n.deg >= 3 && k >= 0.55);
      }).sort(function (a, b) { return rank(b) - rank(a); }).forEach(function (n) {
        var x = n.x * k + ox, y = n.y * k + oy + n.r * rs + 5;
        if (x < -80 || y < -20 || x > W + 80 || y > H + 20) return;
        var text = n.title.length > 24 ? n.title.slice(0, 23) + '…' : n.title;
        var half = ctx.measureText(text).width / 2 + 3;
        x = Math.max(half + 4, Math.min(W - half - 4, x)); // 靠邊的標籤推回畫面內
        var box = { l: x - half, r: x + half, t: y - 1, b: y + 14 };
        var hit = placed.some(function (p) { return box.l < p.r && box.r > p.l && box.t < p.b && box.b > p.t; });
        if (hit && n !== hover && n !== focus && n !== sel) return;
        placed.push(box);
        ctx.globalAlpha = !hl && isLocal && n.level >= 2 ? 0.55 : 0.95;
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = palette['--surface'];
        ctx.strokeText(text, x, y);
        ctx.fillStyle = n === hover || n === focus || n === sel ? palette['--ink'] : palette['--ink-2'];
        ctx.fillText(text, x, y);
      });
      ctx.globalAlpha = 1;
    }

    // ── loop ──────────────────────────────────────────────
    function frame() {
      raf = 0;
      var running = alpha > ALPHA_MIN || alphaTarget > 0;
      if (running) tick();
      var easing = easeView(false);
      draw();
      if ((running || easing) && visible) raf = requestAnimationFrame(frame);
    }
    function request() { if (!raf && visible) raf = requestAnimationFrame(frame); }
    function reheat(a) { alpha = Math.max(alpha, a); request(); }

    // ── selection & info card ─────────────────────────────
    function linkCount(n) {
      return n.deg + (n.deg === 1 ? ' link' : ' links') + (n.kind === 'ghost' ? ' · 還沒寫' : '');
    }
    function hint() {
      var key = 'data-hint' + (full ? '-full' : '') + (touchUI ? '-touch' : '');
      return info.getAttribute(key) || info.getAttribute('data-hint');
    }
    function setInfo(n) {
      info.textContent = n ? '▸ ' + KIND[n.kind] + ' · ' + n.title + ' · ' + linkCount(n) : hint();
    }

    function showCard(n) {
      if (!n) { card.hidden = true; fig.classList.remove('has-sel'); return; }
      cardMeta.textContent = KIND[n.kind] + ' · ' + linkCount(n);
      cardTitle.textContent = n.title;
      cardOpen.hidden = !n.url;
      if (n.url) cardOpen.href = n.url;
      // 鄰居做成可以點的 chip：手機上比直接點小小的節點好按
      cardNb.textContent = '';
      var seen = new Set();
      n.nb.filter(function (m) { return !seen.has(m) && seen.add(m); })
        .sort(function (a, b) { return b.deg - a.deg; })
        .forEach(function (m) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'nl-chip';
          var dot = document.createElement('i');
          dot.className = 'lg lg-' + m.kind;
          var label = document.createElement('span');
          label.textContent = m.title;
          b.appendChild(dot); b.appendChild(label);
          b.addEventListener('click', function () { select(m); });
          cardNb.appendChild(b);
        });
      cardNb.hidden = !seen.size;
      cardNb.scrollLeft = 0;
      card.hidden = false;
      fig.classList.add('has-sel');
    }

    function select(n) {
      sel = n;
      showCard(n);
      if (n) ensureVisible(n);
      else if (autoPan) { autoPan = false; userView = false; target = null; }
      request();
    }

    // 選取的節點和它的鄰居被工具列或資訊卡擋住、或跑出畫面時，用最小的位移把它們移進可見範圍；
    // 鄰居散得比可見範圍還大時，只確保節點本身看得到
    function ensureVisible(n) {
      var c = screenOf(n), b = { l: c.x, r: c.x, t: c.y, btm: c.y };
      n.nb.forEach(function (m) {
        var q = screenOf(m);
        b.l = Math.min(b.l, q.x); b.r = Math.max(b.r, q.x);
        b.t = Math.min(b.t, q.y); b.btm = Math.max(b.btm, q.y);
      });
      var shift = function (lo, hi, min, max, at) {
        if (hi - lo > max - min) return at < min || at > max ? (min + max) / 2 - at : 0;
        return lo < min ? min - lo : hi > max ? max - hi : 0;
      };
      var top = safeTop() + 12, bottom = safeBottom() - 18; // 18：節點下方的標籤
      var dx = shift(b.l - 12, b.r + 12, 0, W, c.x), dy = shift(b.t, b.btm, top, bottom, c.y);
      if (!dx && !dy) return;
      if (!userView) autoPan = true;
      userView = true;
      target = { x: view.x + dx, y: view.y + dy, k: view.k };
      if (reduceMotion) easeView(true);
      request();
    }

    function go(n) { if (n && n.url) window.location.href = n.url; }

    // ── interaction ───────────────────────────────────────
    function pointer(e) {
      var rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function toWorld(p) {
      return { x: (p.x - W / 2 - view.x) / view.k, y: (p.y - H / 2 - view.y) / view.k };
    }
    // extra：節點外圍多算幾 px；min：觸控時至少要有的半徑（手指點的範圍）
    function pick(p, extra, min) {
      var best = null, bestD = Infinity, rs = nodeScale();
      nodes.forEach(function (n) {
        var s = screenOf(n), dx = s.x - p.x, dy = s.y - p.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < Math.max(n.r * rs + extra, min) && d < bestD) { best = n; bestD = d; }
      });
      return best;
    }
    function zoomAt(p, factor) {
      var w = toWorld(p);
      var k = Math.max(0.2, Math.min(4, view.k * factor));
      view.k = k;
      view.x = p.x - W / 2 - w.x * k;
      view.y = p.y - H / 2 - w.y * k;
      takeView();
      request();
    }
    function takeView() { userView = true; target = null; autoPan = false; }

    function pointList() { return Object.keys(pointers).map(function (id) { return pointers[id]; }); }
    function startPinch() {
      var pts = pointList(), a = pts[0], b = pts[1];
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      press = null;
      alphaTarget = 0;
      pinch = { d: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)), k: view.k, w: toWorld(mid) };
    }
    function movePinch() {
      var pts = pointList(), a = pts[0], b = pts[1];
      var mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      // 兩指中點下的那個世界座標跟著中點走，所以縮放的同時也能平移
      var k = Math.max(0.2, Math.min(4, pinch.k * Math.hypot(b.x - a.x, b.y - a.y) / pinch.d));
      view.k = k;
      view.x = mid.x - W / 2 - pinch.w.x * k;
      view.y = mid.y - H / 2 - pinch.w.y * k;
      takeView();
      request();
    }

    canvas.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var p = pointer(e);
      pointers[e.pointerId] = p;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      var count = Object.keys(pointers).length;
      if (count === 2 && full) { startPinch(); return; }
      if (count > 1) { press = null; return; }
      var mouse = e.pointerType === 'mouse';
      // 頁面上的圖在觸控時只能點選；拖曳交給瀏覽器捲動頁面（touch-action），全螢幕才能操作
      var live = mouse || full;
      // 觸控時只有按在節點本體上才拖節點，旁邊一點的位置拿來平移，免得一直拖到節點
      var grab = live ? (mouse ? pick(p, 6, 0) : pick(p, 4, 0)) : null;
      press = {
        id: e.pointerId, x: p.x, y: p.y, vx: view.x, vy: view.y, moved: false, live: live, mouse: mouse,
        node: grab, tap: mouse ? grab : pick(p, 10, 22)
      };
      if (grab) { grab.fx = grab.x; grab.fy = grab.y; }
      if (mouse) canvas.classList.add('is-grabbing');
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = pointer(e);
      if (pointers[e.pointerId]) pointers[e.pointerId] = p;
      if (pinch) { movePinch(); return; }
      if (press) {
        if (press.id !== e.pointerId) return;
        if (Math.abs(p.x - press.x) + Math.abs(p.y - press.y) > (press.mouse ? 4 : 8)) press.moved = true;
        if (!press.moved || !press.live) return;
        if (press.node) {
          var w = toWorld(p);
          press.node.fx = w.x; press.node.fy = w.y;
          alphaTarget = 0.25; reheat(0.25);
        } else {
          view.x = press.vx + p.x - press.x;
          view.y = press.vy + p.y - press.y;
          takeView();
          request();
        }
        return;
      }
      if (e.pointerType !== 'mouse') return;
      var n = pick(p, 6, 0);
      if (n !== hover) {
        hover = n;
        canvas.style.cursor = n ? (n.url ? 'pointer' : 'default') : '';
        setInfo(n);
        request();
      }
    });
    function release(e) {
      delete pointers[e.pointerId];
      if (pinch) {
        // 放開一指後，剩下那一指接著平移（不算點擊）
        pinch = null;
        var rest = Object.keys(pointers);
        if (rest.length === 1) {
          var q = pointers[rest[0]];
          press = { id: +rest[0], x: q.x, y: q.y, vx: view.x, vy: view.y, moved: true, live: true, node: null, tap: null };
        }
        return;
      }
      if (!press || press.id !== e.pointerId) return;
      var p = press;
      press = null;
      alphaTarget = 0;
      canvas.classList.remove('is-grabbing');
      if (e.type === 'pointerup' && !p.moved) tap(p);
      request();
    }
    // 滑鼠：點節點直接打開（沒有網址的節點改成選取）。觸控：第一下選取，再點一下才打開
    function tap(p) {
      var n = p.tap;
      if (!n) { if (sel) select(null); return; }
      if (p.mouse ? n.url : n === sel) go(n);
      else select(n);
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', function (e) {
      if (press || !hover || e.pointerType !== 'mouse') return;
      hover = null; setInfo(null); request();
    });
    canvas.addEventListener('wheel', function (e) {
      // 頁面上要按住 ⌘/Ctrl 才縮放（避免搶走頁面捲動）；全螢幕時直接縮放
      if (!full && !(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      zoomAt(pointer(e), Math.exp(-e.deltaY * 0.0025));
    }, { passive: false });

    fig.querySelectorAll('[data-graph-zoom]').forEach(function (b) {
      b.addEventListener('click', function () { zoomAt({ x: W / 2, y: H / 2 }, parseFloat(b.getAttribute('data-graph-zoom'))); });
    });
    var fitBtn = fig.querySelector('[data-graph-fit]');
    if (fitBtn) fitBtn.addEventListener('click', function () { userView = false; target = null; autoPan = false; request(); });
    if (search) {
      search.addEventListener('input', function () {
        query = search.value.trim().toLowerCase();
        if (sel) select(null);
        request();
      });
      // Enter：選取最符合的節點（開頭符合的優先，其次看連結數），並收起手機鍵盤
      search.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || !query) return;
        e.preventDefault();
        var best = null, score = -1;
        nodes.forEach(function (n) {
          if (!matches(n)) return;
          var s = (n.title.toLowerCase().indexOf(query) === 0 ? 1000 : 0) + n.deg;
          if (s > score) { best = n; score = s; }
        });
        if (best) { select(best); search.blur(); }
      });
    }
    if (tagToggle) {
      tagToggle.addEventListener('change', function () {
        build(tagToggle.checked);
        userView = false; target = null; autoPan = false;
        if (reduceMotion) settle(); else reheat(0.7);
      });
    }
    card.querySelector('[data-card-close]').addEventListener('click', function () { select(null); });

    // ── full screen ───────────────────────────────────────
    // 用 position: fixed 疊在頁面上（iPhone 的 Safari 不支援對一般元素用 Fullscreen API）。
    // 進入時 push 一筆 history，手機的返回鍵就會關掉全螢幕；從這裡點進別頁再返回，也會回到全螢幕。
    function ownState() { return !!history.state && history.state.netlist === idx; }
    function setFull(on) {
      if (on === full) return;
      full = on;
      if (on) {
        // 搬到 body 底下，避免祖先元素的 transform 讓 fixed 失效；原位置放一個同高的佔位
        holder = document.createElement('div');
        holder.style.height = fig.offsetHeight + 'px';
        fig.parentNode.insertBefore(holder, fig);
        document.body.appendChild(fig);
      } else if (holder) {
        holder.parentNode.replaceChild(fig, holder);
        holder = null;
      }
      fig.classList.toggle('is-full', on);
      root.classList.toggle('nl-lock', on);
      expandBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
      expandBtn.setAttribute('aria-label', expandBtn.getAttribute(on ? 'data-label-close' : 'data-label-open'));
      press = null; pinch = null; pointers = {}; hover = null;
      userView = false; target = null; autoPan = false;
      setInfo(null);
      resize();
      // 面板的長寬比變了，讓圖重新排一下
      if (reduceMotion) settle(); else reheat(0.3);
      if (sel) ensureVisible(sel);
      try { expandBtn.focus({ preventScroll: true }); } catch (err) {}
    }
    function openFull() {
      if (full) return;
      try { history.pushState({ netlist: idx }, ''); } catch (err) {}
      setFull(true);
    }
    function closeFull() {
      if (!full) return;
      var back = ownState();
      setFull(false);
      if (back) history.back();
    }
    expandBtn.addEventListener('click', function () { if (full) closeFull(); else openFull(); });
    window.addEventListener('popstate', function () { setFull(ownState()); });
    window.addEventListener('pageshow', function (e) { if (e.persisted) setFull(ownState()); });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (sel && (full || fig.contains(document.activeElement))) select(null);
      else if (full) closeFull();
    });

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
    setInfo(null);
    resize();
    // 先在背景跑幾步，避免一開始節點擠成一團
    for (var i = 0; i < 80; i++) tick();
    easeView(true);
    if (reduceMotion) settle(); else request();
    if (ownState()) setFull(true);

    return { redraw: function () { draw(); } };
  }
})();
