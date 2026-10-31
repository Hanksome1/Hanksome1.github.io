// 每一拍截一張圖（演到 60% 的地方），外加 hero、outro、reduced-motion、no-JS，順便收 console 錯誤。
// node shoot.js <url> [寬=1440] [輸出資料夾=/tmp/shots]
//   url 用 http://（hexo 頁面先 `cd public && python3 -m http.server 4100`）或 file://（骨架、原型）
// 跟頁面的 controller 用同一套算法：每拍的 data-w 加總再加 HOLD，track 是 [data-beat] 外層的 *-track
const { chromium } = require('playwright');
const fs = require('fs');
const [, , url, w = '1440', out = '/tmp/shots'] = process.argv;
if (!url) { console.error('usage: node shoot.js <url> [width] [outdir]'); process.exit(1); }
const HOLD = 0.35, H = +w < 600 ? 844 : 900;
fs.mkdirSync(out, { recursive: true });

(async () => {
  const b = await chromium.launch();
  const errs = [];
  async function page(opts) {
    const pg = await b.newPage(Object.assign({ viewport: { width: +w, height: H } }, opts));
    pg.on('pageerror', e => errs.push(e.message));
    // 外部資源（字型、analytics）在沙盒裡連不到，不算頁面的錯
    pg.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await pg.goto(url, { waitUntil: 'load' });
    await pg.waitForTimeout(600);
    return pg;
  }

  const pg = await page();
  await pg.screenshot({ path: `${out}/00-hero-${w}.png` });
  const stops = await pg.evaluate(HOLD => {
    const beats = [...document.querySelectorAll('[data-beat]')];
    const track = beats[0] && beats[0].closest('[class$="-track"], [data-track]');
    if (!track) return [];
    const stage = track.firstElementChild, top = parseFloat(getComputedStyle(stage).top) || 0;
    const range = track.offsetHeight - stage.offsetHeight, y0 = track.getBoundingClientRect().top + scrollY - top;
    const total = beats.reduce((s, n) => s + (+n.dataset.w || 1), HOLD);
    let acc = 0;
    return beats.map(n => { const ww = +n.dataset.w || 1, p = (acc + ww * 0.6) / total; acc += ww; return { id: n.dataset.beat, y: y0 + p * range }; });
  }, HOLD);
  for (const [i, s] of stops.entries()) {
    await pg.evaluate(y => window.scrollTo(0, y), s.y);
    await pg.waitForTimeout(700);
    await pg.screenshot({ path: `${out}/${String(i + 1).padStart(2, '0')}-${s.id}-${w}.png` });
  }
  await pg.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await pg.waitForTimeout(500);
  await pg.screenshot({ path: `${out}/99-outro-${w}.png` });
  await pg.close();

  const rm = await page({ reducedMotion: 'reduce' });
  await rm.screenshot({ path: `${out}/rm-${w}.png`, fullPage: true });
  await rm.close();
  const nojs = await page({ javaScriptEnabled: false });
  await nojs.screenshot({ path: `${out}/nojs-${w}.png`, fullPage: true });
  await nojs.close();

  console.log(`${stops.length} beats → ${out}`);
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
})();
