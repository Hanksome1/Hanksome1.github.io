var Explainer = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // packages/core/src/index.ts
  var index_exports = {};
  __export(index_exports, {
    CORE_VERSION: () => CORE_VERSION,
    mount: () => mount,
    scrollDriver: () => scrollDriver
  });

  // packages/core/src/components.ts
  var components_exports = {};
  __export(components_exports, {
    Box: () => Box,
    Num: () => Num
  });

  // packages/core/src/tools.ts
  var tools_exports = {};
  __export(tools_exports, {
    T: () => T,
    big: () => big,
    clamp01: () => clamp01,
    comma: () => comma,
    draw: () => draw,
    ease: () => ease,
    el: () => el,
    fmt: () => fmt,
    hide: () => hide,
    lerp: () => lerp,
    lod: () => lod,
    mulberry32: () => mulberry32,
    pct: () => pct,
    r1: () => r1,
    seg: () => seg,
    set: () => set,
    show: () => show,
    text: () => text,
    wire: () => wire
  });
  var NS = "http://www.w3.org/2000/svg";
  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }
  function seg(t, a, b) {
    return clamp01((t - a) / (b - a));
  }
  function ease(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
  }
  function lerp(a, b, k) {
    return a + (b - a) * k;
  }
  function r1(n) {
    return Math.round(n * 10) / 10;
  }
  function lod(w, near, far) {
    return clamp01((Math.log(far) - Math.log(w)) / (Math.log(far) - Math.log(near)));
  }
  function mulberry32(seed) {
    let a = seed;
    return function() {
      a |= 0;
      a = a + 1831565813 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function fmt(n, d) {
    return n.toFixed(d).replace("-", "\u2212");
  }
  function comma(n) {
    return Math.round(n).toLocaleString("en-US");
  }
  function big(n) {
    if (n >= 1e12) return fmt(n / 1e12, 2) + "T";
    if (n >= 1e9) return fmt(n / 1e9, 2) + "B";
    if (n >= 1e6) return fmt(n / 1e6, 1) + "M";
    if (n >= 1e3) return fmt(n / 1e3, n >= 1e5 ? 0 : 1) + "K";
    return String(Math.round(n));
  }
  function pct(x, d) {
    return fmt(x * 100, d == null ? 1 : d) + "%";
  }
  function el(name, attrs, parent, text2) {
    const e = document.createElementNS(NS, name);
    if (attrs) {
      for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, String(attrs[k]));
    }
    if (text2 != null) e.textContent = text2;
    if (parent) parent.appendChild(e);
    return e;
  }
  function T(g, x, y, s, cls) {
    return el("text", { x, y, class: cls }, g, s);
  }
  function set(e, k, v) {
    const key = "_x_" + k, t = e;
    if (t[key] === v) return;
    t[key] = v;
    e.setAttribute(k, String(v));
  }
  function show(e, o) {
    set(e, "opacity", Math.round(o * 100) / 100);
  }
  function text(e, s) {
    const t = e;
    if (t._t !== s) {
      t._t = s;
      e.textContent = s;
    }
  }
  function hide(e) {
    e.setAttribute("opacity", "0");
    return e;
  }
  function wire(g, d, cls) {
    return el("path", { d, class: cls, pathLength: 1, "stroke-dasharray": "1 1", "stroke-dashoffset": 1, opacity: 0 }, g);
  }
  function draw(e, k) {
    set(e, "stroke-dashoffset", Math.round((1 - k) * 1e3) / 1e3);
    set(e, "opacity", k > 0 ? 1 : 0);
  }

  // packages/core/src/components.ts
  function Box(g, x, y, w, h, cls) {
    return el("rect", { x, y, width: w, height: h, rx: 3, class: cls || "box" }, g);
  }
  function Num(g, x, y, w, h) {
    const gg = el("g", {}, g);
    const bg = el("rect", { x, y, width: w, height: h, rx: 2, class: "cell f-p", "fill-opacity": 0 }, gg);
    el("rect", { x, y, width: w, height: h, rx: 2, class: "frame" }, gg);
    const tx = T(gg, x + w / 2, y + h / 2 + 5, "", "t-b mid");
    return {
      g: gg,
      upd(v, s, vmax) {
        text(tx, s == null ? "" : s);
        set(bg, "class", "cell " + (v >= 0 ? "f-p" : "f-n"));
        set(bg, "fill-opacity", s == null ? 0 : Math.round(Math.min(0.55, Math.abs(v) / vmax * 0.55) * 100) / 100);
      }
    };
  }

  // packages/core/src/panel.ts
  function createPanel(root, { stops, localT, factsFor }) {
    const caps = {};
    root.querySelectorAll("[data-cap]").forEach((c) => {
      caps[c.getAttribute("data-cap")] = c;
    });
    const statusEl = root.querySelector("[data-status]");
    const factsEl = root.querySelector("[data-facts]");
    const stopBtns = Array.from(root.querySelectorAll("[data-stop]"));
    let shownCap = "", factsHTML = "";
    return {
      stopBtns,
      render(beat, p) {
        var _a, _b;
        const si = stops.indexOf(beat);
        if (beat !== shownCap) {
          (_a = caps[shownCap]) == null ? void 0 : _a.classList.remove("is-on");
          (_b = caps[beat]) == null ? void 0 : _b.classList.add("is-on");
          shownCap = beat;
          if (statusEl) statusEl.textContent = si >= 0 ? `Stop ${pad(si + 1)} / ${pad(stops.length)}` : "Overview";
        }
        if (factsEl) {
          const h = factsFor(beat).map((f) => `<dt>${f[0]}</dt><dd${f[2] ? ` class="${f[2]}"` : ""}>${f[1]}</dd>`).join("");
          if (h !== factsHTML) {
            factsEl.innerHTML = h;
            factsHTML = h;
          }
        }
        stopBtns.forEach((b, i) => {
          var _a2;
          b.classList.toggle("is-on", i === si);
          if (i === si) b.setAttribute("aria-current", "step");
          else b.removeAttribute("aria-current");
          const fill = i < si ? 1 : i === si ? Math.round(localT(beat, p) * 100) / 100 : 0;
          (_a2 = b.querySelector("i")) == null ? void 0 : _a2.style.setProperty("--p", String(fill));
        });
        root.classList.toggle("is-end", p > 0.97);
      }
    };
  }
  function pad(n) {
    return String(n).padStart(2, "0");
  }

  // packages/core/src/timeline.ts
  function createTimeline(beats, hold) {
    const total = beats.reduce((s, b) => s + b[1], hold);
    const spans = {};
    let acc = 0;
    for (const [name, weight] of beats) {
      spans[name] = { start: acc / total, len: weight / total };
      acc += weight;
    }
    return {
      spans,
      localT(name, p) {
        const s = spans[name];
        return clamp01((p - s.start) / s.len);
      },
      beatAt(p) {
        let cur = beats[0][0];
        for (const [name] of beats) if (p >= spans[name].start) cur = name;
        return cur;
      }
    };
  }
  function createCamera(shots, spans) {
    const keys = shots.map(([beat, t, x, y, w]) => {
      const s = spans[beat];
      if (!s) throw new Error(`shot \u6307\u5411\u4E0D\u5B58\u5728\u7684 beat\uFF1A${beat}`);
      return { p: s.start + s.len * t, x, y, w };
    });
    return function camera(p) {
      let i = 0;
      while (i < keys.length - 1 && keys[i + 1].p <= p) i++;
      const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
      const k = b.p > a.p ? ease(clamp01((p - a.p) / (b.p - a.p))) : 0;
      return { x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), w: Math.exp(lerp(Math.log(a.w), Math.log(b.w), k)) };
    };
  }

  // packages/core/src/engine.ts
  var defaultFade = (r, c) => 1 - seg(Math.abs(c.y - r.cy), 160, 400);
  function mount(root, config, driver) {
    var _a;
    const svg = root.querySelector("[data-world]");
    if (!svg) throw new Error("\u627E\u4E0D\u5230 [data-world]");
    const { beats, hold = 0.35, narrowZoom = 1, regionFade = defaultFade } = config;
    const timeline = createTimeline(beats, hold);
    const camera = createCamera(config.shots, timeline.spans);
    const stops = (_a = config.stops) != null ? _a : beats.slice(1).map((b) => b[0]);
    const landing = (name) => {
      const s = timeline.spans[name];
      if (!s) return null;
      return driver.landing ? driver.landing(s) : s.start + s.len * 0.3;
    };
    const regions = [];
    const live = {};
    const api = {
      ...tools_exports,
      ...components_exports,
      live,
      spans: timeline.spans,
      region(props) {
        const g = el("g", {}, svg);
        regions.push({ ...props, g });
        return g;
      }
    };
    const scene = config.build(api);
    for (const [name] of beats) if (!scene.render[name]) throw new Error(`beat \u6C92\u6709 renderer\uFF1A${name}`);
    const panel = createPanel(root, {
      stops,
      localT: timeline.localT,
      factsFor: (beat) => {
        var _a2, _b, _c;
        return (_c = (_b = live[beat]) != null ? _b : (_a2 = scene.facts) == null ? void 0 : _a2[beat]) != null ? _c : [];
      }
    });
    const lifetime = new AbortController();
    let view;
    let force = true;
    const lastT = {};
    function renderCamera(c) {
      const w = view.narrow ? c.w * narrowZoom : c.w;
      const s = Math.min(view.fw / w, view.fh / (w * 0.62));
      const vx = c.x - (view.fx + view.fw / 2) / s, vy = c.y - (view.fy + view.fh / 2) / s;
      set(svg, "viewBox", [r1(vx), r1(vy), r1(view.W / s), r1(view.H / s)].join(" "));
      for (const r of regions) show(r.g, regionFade(r, c));
    }
    function render(p) {
      var _a2;
      const t = {};
      const beat = timeline.beatAt(p);
      for (const [name] of beats) {
        const v = t[name] = timeline.localT(name, p);
        if (!force && lastT[name] === v) continue;
        lastT[name] = v;
        scene.render[name](v);
      }
      force = false;
      (_a2 = scene.frame) == null ? void 0 : _a2.call(scene, t, p, beat);
      renderCamera(camera(p));
      panel.render(beat, p);
      driver.rendered(p);
    }
    driver.attach({
      root,
      svg,
      signal: lifetime.signal,
      beats: beats.map((b) => timeline.spans[b[0]]),
      render,
      refresh() {
        view = driver.measure();
        force = true;
        driver.request();
      }
    });
    panel.stopBtns.forEach((b) => {
      b.addEventListener("click", () => {
        const at = landing(b.getAttribute("data-stop"));
        if (at !== null) driver.seek(at, true);
      }, { signal: lifetime.signal });
    });
    view = driver.measure();
    render(driver.progress());
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!lifetime.signal.aborted) root.classList.add("is-ready");
    }));
    return {
      seek(p) {
        driver.seek(p);
      },
      /** 跳到某一站；不認得的 beat 回傳 false */
      seekBeat(name, smooth = true) {
        const at = landing(name);
        if (at === null) return false;
        driver.seek(at, smooth);
        return true;
      },
      progress() {
        return driver.progress();
      },
      play() {
        driver.play();
      },
      pause() {
        driver.pause();
      },
      destroy() {
        lifetime.abort();
        driver.destroy();
        svg.replaceChildren();
        root.classList.remove("is-ready", "is-end");
      }
    };
  }

  // packages/core/src/scroll-driver.ts
  function scrollDriver({ track: trackSel, stage: stageSel, panel: panelSel, autoplayMs = 5e4 }) {
    let host, track, stage, panel;
    let reduceMotion = false, ticking = false, tickRaf = 0, observer = null;
    let autoplay = null;
    function isLive() {
      return host.root.classList.contains("is-live");
    }
    function headerH() {
      return parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h")) || 0;
    }
    function stickyTop() {
      return parseFloat(getComputedStyle(stage).top) || headerH();
    }
    function trackTop() {
      return track.getBoundingClientRect().top + window.scrollY - stickyTop();
    }
    function range() {
      return track.offsetHeight - stage.offsetHeight;
    }
    function progress() {
      if (!isLive()) return 1;
      const r = track.getBoundingClientRect(), len = r.height - stage.offsetHeight;
      return len > 0 ? clamp01((stage.getBoundingClientRect().top - r.top) / len) : 1;
    }
    function request() {
      if (ticking) return;
      ticking = true;
      tickRaf = requestAnimationFrame(() => {
        ticking = false;
        host.render(progress());
      });
    }
    function measure() {
      const r = host.svg.getBoundingClientRect(), pr = panel.getBoundingClientRect();
      const W = r.width || 1, H = r.height || 1;
      const narrow = window.matchMedia("(max-width: 900px)").matches;
      if (!isLive()) return { W, H, narrow, fx: 0, fy: 0, fw: W, fh: H };
      if (narrow) return { W, H, narrow, fx: 0, fy: 0, fw: r.width, fh: Math.max(120, pr.top - r.top) };
      const fx = pr.right - r.left;
      return { W, H, narrow, fx, fy: 0, fw: r.width - fx, fh: r.height };
    }
    function createAutoplay() {
      const btn = host.root.querySelector("[data-play]");
      const label = host.root.querySelector("[data-play-label]");
      if (!btn || reduceMotion) {
        if (btn) btn.hidden = true;
        return null;
      }
      let raf = 0, p0 = 0, t0 = 0, setY = 0, shown = "";
      function tick(ts) {
        if (!t0) t0 = ts;
        if (Math.abs(window.scrollY - setY) > 2) return stop();
        const p = Math.min(1, p0 + (ts - t0) / autoplayMs);
        window.scrollTo(0, trackTop() + range() * p);
        setY = window.scrollY;
        if (p >= 1) return stop();
        raf = requestAnimationFrame(tick);
      }
      function start() {
        if (raf) return;
        p0 = progress();
        if (p0 >= 0.98) {
          p0 = 0;
          window.scrollTo(0, trackTop());
        } else if (window.scrollY < trackTop()) window.scrollTo(0, trackTop() + range() * p0);
        setY = window.scrollY;
        t0 = 0;
        raf = requestAnimationFrame(tick);
        render(p0);
      }
      function stop() {
        if (!raf) return;
        cancelAnimationFrame(raf);
        raf = 0;
        render(progress());
      }
      function render(p) {
        const state = raf ? "run" : p >= 0.98 ? "done" : "idle";
        if (state === shown) return;
        shown = state;
        btn.setAttribute("data-state", state);
        if (label) label.textContent = state === "run" ? "Pause" : state === "done" ? "Replay" : "Auto-play";
      }
      function interrupt(e) {
        if (raf && !(e.target instanceof Node && btn.contains(e.target))) stop();
      }
      const { signal } = host;
      btn.addEventListener("click", () => {
        if (raf) stop();
        else start();
      }, { signal });
      window.addEventListener("wheel", interrupt, { passive: true, signal });
      window.addEventListener("touchstart", interrupt, { passive: true, signal });
      window.addEventListener("pointerdown", interrupt, { signal });
      window.addEventListener("keydown", interrupt, { signal });
      return { start, stop, render };
    }
    function find(sel) {
      const e = host.root.querySelector(sel);
      if (!e) throw new Error(`\u627E\u4E0D\u5230 ${sel}`);
      return e;
    }
    return {
      attach(h) {
        var _a;
        host = h;
        track = find(trackSel);
        stage = find(stageSel);
        panel = find(panelSel);
        reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        autoplay = createAutoplay();
        h.root.classList.add(reduceMotion ? "is-static" : "is-live");
        window.addEventListener("scroll", request, { passive: true, signal: h.signal });
        window.addEventListener("resize", h.refresh, { signal: h.signal });
        if ("ResizeObserver" in window) {
          observer = new ResizeObserver(h.refresh);
          observer.observe(h.svg);
        }
        (_a = document.fonts) == null ? void 0 : _a.ready.then(() => {
          if (!h.signal.aborted) h.refresh();
        });
      },
      rendered(p) {
        autoplay == null ? void 0 : autoplay.render(p);
      },
      progress,
      measure,
      request,
      seek(p, smooth) {
        window.scrollTo({ top: trackTop() + range() * p, behavior: smooth && !reduceMotion ? "smooth" : "auto" });
      },
      play() {
        autoplay == null ? void 0 : autoplay.start();
      },
      pause() {
        autoplay == null ? void 0 : autoplay.stop();
      },
      destroy() {
        autoplay == null ? void 0 : autoplay.stop();
        cancelAnimationFrame(tickRaf);
        observer == null ? void 0 : observer.disconnect();
        host.root.classList.remove("is-live", "is-static");
      }
    };
  }

  // packages/core/src/index.ts
  var CORE_VERSION = "0.1.0";
  return __toCommonJS(index_exports);
})();
