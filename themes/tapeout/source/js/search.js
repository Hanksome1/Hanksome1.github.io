/* 快速切換器：⌘K / Ctrl+K 或 / 打開，像 Obsidian 的 Quick Switcher。
   - 標題、資料夾（Notes/ICLAB）、aliases 用模糊比對，字元依序出現就算；標籤和摘要只認連續的字
   - 每篇文章的 h2 / h3 也是結果（只認連續的字），連到頁內錨點
   - 開頭打 # 只搜標籤；沒有輸入時列出最近看過的頁面，不夠再補最新的文章
   索引是 scripts/search.js 產生的 search.json，第一次打開（或滑過按鈕）時才下載。 */
(function () {
  'use strict';

  var dialog = document.querySelector('.qs');
  if (!dialog || typeof dialog.showModal !== 'function') return;

  var input = dialog.querySelector('.qs-input');
  var list = dialog.querySelector('.qs-list');
  var status = dialog.querySelector('.qs-status');
  var clearBtn = dialog.querySelector('.qs-clear');
  var triggers = Array.prototype.slice.call(document.querySelectorAll('[data-search-open]'));
  var text = {};
  try { text = JSON.parse(dialog.getAttribute('data-text')) || {}; } catch (e) {}

  var isMac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
  var MAX = 40;
  var RECENT_KEY = 'tapeout-recent';
  var KIND_LABEL = { project: 'Project', post: 'Post', note: 'Note', lab: 'Lab', page: 'Page' };

  if (!isMac) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-mod]'), function (k) { k.textContent = 'ctrl'; });
    triggers.forEach(function (b) { var k = b.querySelector('kbd'); if (k) k.textContent = 'Ctrl K'; });
  }

  /* ---- 最近看過的頁面 ---- */
  var here = pathKey(location.pathname);
  function pathKey(u) {
    var p = String(u || '').split('#')[0].split('?')[0];
    try { p = decodeURI(p); } catch (e) {}
    return p.replace(/index\.html$/, '');
  }
  function recents() {
    try { return JSON.parse(localStorage.getItem(RECENT_KEY)) || []; } catch (e) { return []; }
  }
  try {
    var seen = recents().filter(function (p) { return p !== here; });
    seen.unshift(here);
    localStorage.setItem(RECENT_KEY, JSON.stringify(seen.slice(0, 20)));
  } catch (e) {}

  /* ---- 字串比對 ---- */
  // 一個字元對一個字元地轉小寫、全形轉半形，位置不變，才能把比對到的位置標回原字串
  function fold(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      var n = (c.normalize ? c.normalize('NFKC') : c).toLowerCase();
      if (n.length !== 1) n = c.toLowerCase().length === 1 ? c.toLowerCase() : c;
      out += n;
    }
    return out;
  }
  function field(raw, fuzzy) { raw = String(raw || ''); return { raw: raw, low: fold(raw), fuzzy: fuzzy }; }

  var ALNUM = /[a-z0-9]/;
  var CJK = /[㐀-鿿豈-﫿぀-ヿ가-힯]/;
  function isBoundary(f, i) {
    if (i === 0) return true;
    var p = f.low[i - 1], c = f.low[i];
    if (ALNUM.test(c)) return !ALNUM.test(p) || (/[a-z]/.test(p) && f.raw[i] !== c); // 前一個不是英數，或 camelCase
    if (CJK.test(c)) return !CJK.test(p);
    return false;
  }

  function range(start, n) { var a = []; for (var i = 0; i < n; i++) a.push(start + i); return a; }

  // 一個關鍵字在一個欄位裡的最佳比對：先找連續出現，找不到才（在短欄位裡）找依序出現的字元
  function matchToken(tok, f) {
    var low = f.low, best = null;
    for (var i = low.indexOf(tok); i > -1; i = low.indexOf(tok, i + 1)) {
      var s = 10 * tok.length + (i === 0 ? 12 : 0) + (isBoundary(f, i) ? 10 : 0) - Math.min(i, 40) * 0.15;
      if (!best || s > best.s) best = { s: s, idx: range(i, tok.length) };
    }
    if (best || !f.fuzzy || tok.length < 2) return best;
    // 依序出現的字元：從第一個字的每個出現位置往後找，留下分數最高的一組
    for (var start = low.indexOf(tok[0]), tries = 0; start > -1 && tries < 12; start = low.indexOf(tok[0], start + 1), tries++) {
      for (var pass = 0; pass < 2; pass++) {
        var m = walk(tok, f, start, pass === 0);
        if (m && (!best || m.s > best.s)) best = m;
      }
    }
    return best;
  }

  // 下一個字優先接在後面；接不上時 preferHead 先挑字首（3dgs → 3D Gaussian Splatting），沒有才取最近的。
  // 字元散成太多段、而且不是每段都從字首開始的就不算
  function walk(tok, f, start, preferHead) {
    var low = f.low, idx = [start], runs = 1, heads = isBoundary(f, start) ? 1 : 0;
    var sc = 4 + (heads ? 6 : 0);
    for (var k = 1; k < tok.length; k++) {
      var last = idx[idx.length - 1], c = tok[k], j = -1;
      if (low[last + 1] === c) j = last + 1;
      else {
        if (preferHead) {
          for (var x = low.indexOf(c, last + 1); x > -1; x = low.indexOf(c, x + 1)) if (isBoundary(f, x)) { j = x; break; }
        }
        if (j < 0) j = low.indexOf(c, last + 1);
      }
      if (j < 0) return null;
      var next = j === last + 1, head = isBoundary(f, j);
      if (!next) { runs++; if (head) heads++; }
      sc += 4 + (next ? 5 : 0) + (head ? 6 : 0);
      idx.push(j);
    }
    if (runs > Math.max(2, Math.ceil(tok.length / 2)) && heads < runs) return null;
    return { s: sc - (idx[idx.length - 1] - start + 1 - tok.length) * 0.3, idx: idx };
  }

  /* ---- 索引 ---- */
  var index = null, loading = null;

  function prepare(data) {
    var pages = (data.pages || []).map(function (p) {
      var kind = p.k === 'note' && p.f === 'Lab' ? 'lab' : p.k;
      var prefix = p.f ? p.f + '/' : '';
      return {
        t: p.t, u: p.u, k: kind, f: p.f || '', d: p.d || '', key: pathKey(p.u),
        path: field(prefix + p.t, false), titleAt: prefix.length, // 畫面上顯示的「資料夾/標題」
        title: field(p.t, true), folder: field(prefix, true),
        slug: field(pathKey(p.u).replace(/\/+$/, '').split('/').pop(), true), // 網址最後一段，像 Obsidian 的檔名
        aliases: (p.a || []).map(function (a) { return field(a, true); }),
        tags: (p.g || []).map(function (t) { return field(t, false); }),
        summary: field(p.s || '', false),
        heads: (p.h || []).map(function (h) { return { level: h[0], f: field(h[1], false), id: h[2] }; }) // 段落標題只認連續的字，不然結果太雜
      };
    });
    var tags = (data.tags || []).map(function (t) { return { t: t.t, u: t.u, n: t.n, f: field(t.t, true) }; });
    var byKey = {};
    pages.forEach(function (p) { byKey[p.key] = p; });
    return { pages: pages, tags: tags, byKey: byKey };
  }

  function load() {
    if (index) return Promise.resolve(index);
    if (!loading) {
      loading = fetch(dialog.getAttribute('data-index'))
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (data) { index = prepare(data); return index; })
        .catch(function (err) { loading = null; throw err; });
    }
    return loading;
  }

  /* ---- 搜尋 ---- */
  function tokens(q) { return fold(q).split(/\s+/).filter(Boolean); }

  // 標題和資料夾分開比對（資料夾的分數打折），位置換算成「資料夾/標題」字串裡的位置
  function matchPath(tok, p) {
    var t = matchToken(tok, p.title), f = matchToken(tok, p.folder);
    if (t && (!f || t.s >= f.s * 0.5)) return { s: t.s, inTitle: true, idx: t.idx.map(function (i) { return i + p.titleAt; }) };
    return f ? { s: f.s * 0.5, inTitle: false, idx: f.idx } : null;
  }

  function searchPages(toks, raw) {
    var out = [];
    var whole = fold(raw.trim());
    index.pages.forEach(function (p) {
      var total = 0, pathIdx = [], aliasHit = null, slugIdx = [], sumIdx = [], inTitle = 0;
      for (var i = 0; i < toks.length; i++) {
        var tok = toks[i], best = null, m;
        var pm = matchPath(tok, p);
        if (pm) best = { s: pm.s, where: 'path', idx: pm.idx, inTitle: pm.inTitle };
        p.aliases.forEach(function (a, ai) {
          var am = matchToken(tok, a);
          if (am && (!best || am.s * 0.9 > best.s)) best = { s: am.s * 0.9, where: 'alias', alias: ai, idx: am.idx };
        });
        var sm = matchToken(tok, p.slug);
        if (sm && (!best || sm.s * 0.8 > best.s)) best = { s: sm.s * 0.8, where: 'slug', idx: sm.idx };
        p.tags.forEach(function (t) {
          var tm = matchToken(tok, t);
          if (tm && (!best || tm.s * 0.6 > best.s)) best = { s: tm.s * 0.6, where: 'tag' };
        });
        if (!best && (m = matchToken(tok, p.summary))) best = { s: m.s * 0.25, where: 'summary', idx: m.idx };
        if (!best) return;
        total += best.s;
        if (best.inTitle) inTitle++;
        if (best.where === 'path') pathIdx = pathIdx.concat(best.idx);
        else if (best.where === 'alias') {
          if (!aliasHit || aliasHit.i === best.alias) aliasHit = { i: best.alias, idx: (aliasHit ? aliasHit.idx : []).concat(best.idx) };
        } else if (best.where === 'slug') {
          // 標題或資料夾裡也找得到的話，標在畫面上的標題就好，不另外列網址
          if (pm) pathIdx = pathIdx.concat(pm.idx); else slugIdx = slugIdx.concat(best.idx);
        }
        else if (best.where === 'summary') sumIdx = sumIdx.concat(best.idx);
      }
      var title = fold(p.t);
      if (title === whole) total += 60;
      else if (title.indexOf(whole) === 0) total += 25;
      if (inTitle === toks.length) total += 8;
      total -= p.t.length * 0.04;
      out.push({ type: 'page', p: p, s: total, pathIdx: pathIdx, alias: aliasHit, slugIdx: slugIdx, sumIdx: sumIdx });
    });
    return out;
  }

  // 標題：至少一個關鍵字要在標題文字裡，其他的可以落在所屬頁面的路徑上（例如「hw1 位寬」）
  function searchHeadings(toks) {
    var out = [];
    index.pages.forEach(function (p) {
      p.heads.forEach(function (h) {
        var total = 0, idx = [], own = 0, pathIdx = [];
        for (var i = 0; i < toks.length; i++) {
          var m = matchToken(toks[i], h.f);
          var pm = matchPath(toks[i], p);
          if (m && (!pm || m.s >= pm.s * 0.4)) { total += m.s; idx = idx.concat(m.idx); own++; }
          else if (pm) { total += pm.s * 0.4; pathIdx = pathIdx.concat(pm.idx); }
          else return;
        }
        if (!own) return;
        out.push({ type: 'head', p: p, h: h, s: total * 0.72 - h.f.raw.length * 0.04, idx: idx, pathIdx: pathIdx });
      });
    });
    return out;
  }

  function searchTags(q) {
    var toks = tokens(q);
    if (!toks.length) return index.tags.map(function (t) { return { type: 'tag', t: t, s: t.n, idx: [] }; });
    var out = [];
    index.tags.forEach(function (t) {
      var total = 0, idx = [];
      for (var i = 0; i < toks.length; i++) {
        var m = matchToken(toks[i], t.f);
        if (!m) return;
        total += m.s;
        idx = idx.concat(m.idx);
      }
      out.push({ type: 'tag', t: t, s: total + Math.min(t.n, 20) * 0.2 - t.t.length * 0.1, idx: idx });
    });
    return out;
  }

  // 沒有輸入：最近看過的頁面（不含這一頁），再補最新的文章
  function defaults() {
    var out = [], used = {};
    used[here] = true;
    recents().forEach(function (k) {
      var p = index.byKey[k];
      if (p && !used[k] && out.length < 8) { used[k] = true; out.push({ type: 'page', p: p, recent: true }); }
    });
    index.pages
      .filter(function (p) { return p.d && !used[p.key]; })
      .sort(function (a, b) { return a.d < b.d ? 1 : a.d > b.d ? -1 : 0; })
      .slice(0, 14 - out.length)
      .forEach(function (p) { out.push({ type: 'page', p: p }); });
    return out;
  }

  function run(q) {
    if (/^\s*#/.test(q)) return rank(searchTags(q.replace(/^\s*#/, '')));
    var toks = tokens(q);
    if (!toks.length) return defaults();
    var res = searchPages(toks, q);
    if (q.replace(/\s/g, '').length >= 2) res = res.concat(searchHeadings(toks));
    return rank(res);
  }

  function rank(res) {
    return res.sort(function (a, b) {
      if (b.s !== a.s) return b.s - a.s;
      var da = a.p ? a.p.d : '', db = b.p ? b.p.d : '';
      return da < db ? 1 : da > db ? -1 : 0;
    }).slice(0, MAX);
  }

  /* ---- 畫面 ---- */
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // raw[from, to) 裡 idx 標到的字元包成 <mark>
  function mark(raw, idx, from, to) {
    from = from || 0;
    to = to == null ? raw.length : to;
    var on = {};
    (idx || []).forEach(function (i) { on[i] = true; });
    var html = '', open = false;
    for (var i = from; i < to; i++) {
      if (on[i] && !open) { html += '<mark>'; open = true; }
      if (!on[i] && open) { html += '</mark>'; open = false; }
      html += esc(raw[i]);
    }
    return html + (open ? '</mark>' : '');
  }

  // 摘要裡比對到的那一段，前後各留一點
  function snippet(f, idx) {
    var first = Math.min.apply(null, idx), last = Math.max.apply(null, idx);
    var from = Math.max(0, first - 24), to = Math.min(f.raw.length, last + 60);
    return (from > 0 ? '…' : '') + mark(f.raw, idx, from, to) + (to < f.raw.length ? '…' : '');
  }

  function rowHTML(r, i) {
    var href, kind, line, sub = '', side;
    if (r.type === 'tag') {
      href = r.t.u;
      kind = 'tag';
      line = '<span class="qs-title"><span class="qs-folder">#</span>' + mark(r.t.t, r.idx) + '</span>';
      side = r.t.n;
    } else if (r.type === 'head') {
      var p = r.p;
      href = p.u + '#' + encodeURIComponent(r.h.id);
      kind = 'head';
      line = '<span class="qs-title"><span class="qs-folder">' + (r.h.level === 2 ? '#' : '##') + ' </span>' + mark(r.h.f.raw, r.idx) + '</span>';
      sub = esc(text.in || 'in') + ' <span class="qs-folder">' + mark(p.path.raw, r.pathIdx, 0, p.titleAt) + '</span>' + mark(p.path.raw, r.pathIdx, p.titleAt);
      side = 'H' + r.h.level;
    } else {
      var q = r.p;
      href = q.u;
      kind = q.k;
      line = '<span class="qs-title"><span class="qs-folder">' + mark(q.path.raw, r.pathIdx, 0, q.titleAt) + '</span>' + mark(q.path.raw, r.pathIdx, q.titleAt) + '</span>';
      if (r.alias) sub = esc(text.alias || 'alias') + ' ' + mark(q.aliases[r.alias.i].raw, r.alias.idx);
      else if (r.slugIdx && r.slugIdx.length) sub = esc(q.u.replace(/[^/]+\/?$/, '')) + mark(q.slug.raw, r.slugIdx);
      else if (r.sumIdx && r.sumIdx.length) sub = snippet(q.summary, r.sumIdx);
      side = KIND_LABEL[q.k] || '';
    }
    return '<a class="qs-item" role="option" id="qs-o' + i + '" href="' + esc(href) + '" tabindex="-1" data-i="' + i + '" data-k="' + kind + '" aria-selected="false">'
      + '<span class="qs-dot" aria-hidden="true"></span>'
      + '<span class="qs-text"><span class="qs-line">' + line + '</span>' + (sub ? '<span class="qs-sub">' + sub + '</span>' : '') + '</span>'
      + '<span class="qs-side" aria-hidden="true">' + side + '</span></a>';
  }

  var results = [], active = -1;

  function render() {
    var q = input.value;
    clearBtn.hidden = !q;
    if (!index) return;
    results = run(q);
    list.innerHTML = results.map(rowHTML).join('');
    status.textContent = results.length ? '' : (text.empty || 'No matching pages');
    list.scrollTop = 0;
    select(results.length ? 0 : -1);
  }

  function select(i) {
    var items = list.children;
    if (active > -1 && items[active]) items[active].setAttribute('aria-selected', 'false');
    active = i;
    if (i < 0 || !items[i]) { input.removeAttribute('aria-activedescendant'); return; }
    items[i].setAttribute('aria-selected', 'true');
    input.setAttribute('aria-activedescendant', items[i].id);
    items[i].scrollIntoView({ block: 'nearest' });
  }

  function move(d) {
    if (!results.length) return;
    select((active + d + results.length) % results.length);
  }

  function go(i, newTab) {
    var a = list.children[i];
    if (!a) return;
    var href = a.getAttribute('href');
    if (newTab) { window.open(href, '_blank', 'noopener'); return; }
    close();
    location.href = href;
  }

  /* ---- 開關 ---- */
  function open() {
    if (dialog.open) { input.select(); return; }
    dialog.showModal();
    input.focus();
    input.select();
    if (index) { render(); return; }
    status.textContent = text.loading || 'Loading…';
    load().then(render, function () { status.textContent = 'search.json failed to load'; });
  }

  function close() { if (dialog.open) dialog.close(); }

  triggers.forEach(function (b) {
    b.addEventListener('click', open);
    b.addEventListener('pointerenter', function () { load().catch(function () {}); }, { once: true });
  });

  input.addEventListener('input', render);
  clearBtn.addEventListener('click', function () { input.value = ''; render(); input.focus(); });

  input.addEventListener('keydown', function (e) {
    if (e.isComposing || e.keyCode === 229) return; // 注音、拼音選字中的 Enter / 方向鍵交給輸入法
    var ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === 'ArrowDown' || (ctrl && (e.key === 'n' || e.key === 'j'))) { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp' || (ctrl && (e.key === 'p' || e.key === 'k'))) { e.preventDefault(); move(-1); }
    else if (e.key === 'PageDown') { e.preventDefault(); select(Math.min(results.length - 1, active + 8)); }
    else if (e.key === 'PageUp') { e.preventDefault(); select(Math.max(0, active - 8)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (active > -1) go(active, isMac ? e.metaKey : e.ctrlKey);
    }
  });

  // 滑鼠移動才換選取，捲動清單時游標底下經過的項目不會搶走選取
  list.addEventListener('mousemove', function (e) {
    var a = e.target.closest('.qs-item');
    if (a && +a.getAttribute('data-i') !== active) select(+a.getAttribute('data-i'));
  });
  list.addEventListener('click', function (e) {
    var a = e.target.closest('.qs-item');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    go(+a.getAttribute('data-i'), false);
  });

  // 點 dialog 外面（backdrop）就關掉
  dialog.addEventListener('click', function (e) {
    if (e.target !== dialog) return;
    var r = dialog.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close();
  });

  document.addEventListener('keydown', function (e) {
    var k = e.key && e.key.toLowerCase();
    if (k === 'k' && (isMac ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      if (dialog.open) close(); else open();
      return;
    }
    if (e.key === '/' && !dialog.open && !e.metaKey && !e.ctrlKey && !e.altKey) {
      var t = e.target;
      if (t && (t.isContentEditable || /^(input|textarea|select)$/i.test(t.tagName))) return;
      e.preventDefault();
      open();
    }
  });
})();
