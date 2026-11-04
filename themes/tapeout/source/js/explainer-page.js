// 通用的 explainer 頁：筆記的腳本呼叫 explainer(build) 時，用 layout 寫好的設定掛上引擎
window.explainer = function (build) {
  var root = document.querySelector('[data-explainer]');
  if (!root) return;
  var c = JSON.parse(root.querySelector('[data-explainer-config]').textContent);
  Explainer.mount(root, {
    beats: c.beats, shots: c.shots, hold: c.hold, narrowZoom: c.narrowZoom, build: build
  }, Explainer.scrollDriver({ track: '.ex-track', stage: '.ex-stage', panel: '.ex-panel', autoplayMs: c.autoplayMs }));
};
