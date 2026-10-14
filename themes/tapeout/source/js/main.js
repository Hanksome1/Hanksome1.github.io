(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
  var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };

  /* ---- Theme toggle ---- */
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var toggle = $('.theme-toggle');
  function currentTheme() { return root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light'); }
  function syncToggle() {
    var dark = currentTheme() === 'dark';
    var bit = $('[data-theme-bit]');
    if (bit) bit.textContent = dark ? '1' : '0';
    if (toggle) toggle.setAttribute('aria-pressed', String(dark));
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('tapeout-theme', next); } catch (e) {}
      syncToggle();
    });
  }
  if (mq.addEventListener) mq.addEventListener('change', syncToggle);
  syncToggle();

  /* ---- Color scheme switch ---- */
  var swatches = $$('[data-scheme-set]');
  function syncScheme() {
    var cur = root.getAttribute('data-scheme');
    swatches.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-scheme-set') === cur)); });
  }
  swatches.forEach(function (b) {
    b.addEventListener('click', function () {
      var name = b.getAttribute('data-scheme-set');
      if (!window.tapeoutScheme || !window.tapeoutScheme(name)) return;
      try { localStorage.setItem('tapeout-scheme', name); } catch (e) {}
      syncScheme();
    });
  });
  syncScheme();

  /* ---- Reveal on scroll ---- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window && !reduceMotion) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.classList.add('is-in');
        io.unobserve(e.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    reveals.forEach(function (el, i) {
      el.style.transitionDelay = Math.min(i % 4, 3) * 70 + 'ms';
      io.observe(el);
    });
  } else {
    reveals.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ---- Reading progress + TOC scrollspy ---- */
  var progress = $('.progress');
  var article = $('.article');
  var tocLinks = $$('.toc-link');
  var heads = tocLinks.map(function (a) {
    return document.getElementById(decodeURIComponent(a.getAttribute('href').slice(1)));
  });
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      if (progress && article) {
        var r = article.getBoundingClientRect();
        var total = r.height - window.innerHeight * 0.6;
        var p = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
        progress.style.setProperty('--progress', (p * 100).toFixed(2) + '%');
      }
      if (tocLinks.length) {
        var active = -1;
        heads.forEach(function (h, i) { if (h && h.getBoundingClientRect().top < 140) active = i; });
        tocLinks.forEach(function (a, i) { a.classList.toggle('is-active', i === active); });
      }
    });
  }
  if (progress || tocLinks.length) {
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    onScroll();
  }

  /* ---- Filters (projects / archive) ---- */
  $$('[data-filter-group]').forEach(function (group) {
    var target = $(group.getAttribute('data-filter-group'));
    var attr = group.getAttribute('data-filter-attr') || 'tags';
    if (!target) return;
    group.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      $$('button[data-filter]', group).forEach(function (b) { b.classList.toggle('is-on', b === btn); });
      var f = btn.getAttribute('data-filter');
      $$('[data-' + attr + ']', target).forEach(function (el) {
        var vals = (el.getAttribute('data-' + attr) || '').split('|');
        el.hidden = !(f === '*' || vals.indexOf(f) > -1);
      });
      $$('.year-block', target).forEach(function (yb) {
        yb.hidden = !$('[data-' + attr + ']:not([hidden])', yb);
      });
    });
  });

  /* ---- Filters: 收成一排，排不下的用 toggle 展開 ---- */
  $$('.filters[data-collapsible]').forEach(function (group) {
    var toggle = $('[data-filters-toggle]', group);
    var chips = Array.prototype.filter.call(group.children, function (c) { return c !== toggle; });
    if (!toggle || chips.length < 2) return;
    var open = false;

    function label(text, count) {
      toggle.textContent = text;
      if (count) {
        var sup = document.createElement('sup');
        sup.textContent = '+' + count;
        toggle.appendChild(sup);
      }
    }

    function layout() {
      chips.forEach(function (c) { c.classList.remove('is-clipped'); });
      toggle.hidden = true;
      toggle.classList.remove('has-active');
      var top = chips[0].offsetTop;
      if (chips[chips.length - 1].offsetTop === top) return; // 一排就放得下
      toggle.hidden = false;
      toggle.setAttribute('aria-expanded', String(open));
      if (open) { label(toggle.getAttribute('data-less')); return; }

      // 第一個換行的 chip 之後全部藏起來，再往前藏到 toggle 也擠得進第一排
      var k = 1;
      while (k < chips.length && chips[k].offsetTop === top) k++;
      for (var i = k; i < chips.length; i++) chips[i].classList.add('is-clipped');
      label(toggle.getAttribute('data-more'), chips.length - k);
      while (toggle.offsetTop !== top && k > 1) {
        chips[--k].classList.add('is-clipped');
        label(toggle.getAttribute('data-more'), chips.length - k);
      }
      // 目前選到的標籤被收起來時，toggle 要看得出來
      toggle.classList.toggle('has-active', !!$('.is-on.is-clipped', group));
    }

    toggle.addEventListener('click', function () { open = !open; layout(); });
    window.addEventListener('resize', layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    layout();
  });

  /* ---- Tables: 包一層讓窄螢幕可以橫向捲動 ---- */
  $$('.prose table').forEach(function (t) {
    if (t.closest('figure.highlight') || t.parentNode.classList.contains('table-wrap')) return;
    var w = document.createElement('div');
    w.className = 'table-wrap';
    t.parentNode.insertBefore(w, t);
    w.appendChild(t);
  });

  /* ---- Code blocks: language label + copy ---- */
  $$('.prose figure.highlight').forEach(function (fig) {
    var lang = (fig.className.replace('highlight', '').trim().split(/\s+/)[0] || 'code');
    if (lang === 'plaintext' || lang === 'plain') lang = 'text';
    var bar = document.createElement('div');
    bar.className = 'code-bar';
    var label = document.createElement('span');
    label.className = 'code-lang';
    label.textContent = lang;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.textContent = 'Copy';
    bar.appendChild(label);
    bar.appendChild(btn);
    fig.insertBefore(bar, fig.firstChild);
    btn.addEventListener('click', function () {
      var code = $('td.code pre', fig) || $('pre', fig);
      if (!code || !navigator.clipboard) return;
      navigator.clipboard.writeText(code.innerText.replace(/\n$/, '')).then(function () {
        btn.textContent = 'Copied';
        setTimeout(function () { btn.textContent = 'Copy'; }, 1400);
      });
    });
  });

  /* ---- Status bar ---- */
  var sb = $('.statusbar');
  if (sb && window.matchMedia('(pointer: fine)').matches) {
    var sx = $('[data-sb-x]', sb), sy = $('[data-sb-y]', sb);
    var sec = $('[data-sb-section]', sb), st = $('[data-sb-time]', sb);
    var pending = null;
    var fmt = function (n) { return String(Math.max(0, Math.round(n))).padStart(4, '0'); };
    document.addEventListener('pointermove', function (e) {
      if (pending) return;
      pending = requestAnimationFrame(function () {
        pending = null;
        sx.textContent = fmt(e.pageX);
        sy.textContent = fmt(e.pageY);
      });
    }, { passive: true });

    var sections = $$('[data-section]');
    if ('IntersectionObserver' in window && sections.length) {
      var sio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) sec.textContent = en.target.getAttribute('data-section');
        });
      }, { rootMargin: '-45% 0px -50% 0px' });
      sections.forEach(function (s) { sio.observe(s); });
    }

    // 1 秒真實時間 = 1 µs 模擬時間
    var t0 = performance.now();
    setInterval(function () {
      var us = (performance.now() - t0) / 1000;
      st.textContent = us < 1 ? Math.round(us * 1000) + ' ns' : us.toFixed(2) + ' µs';
    }, 100);
  } else if (sb) {
    sb.hidden = true;
  }
})();
