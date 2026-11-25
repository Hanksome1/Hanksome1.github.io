// One screenshot per step (scrolled to local t), plus a no-JS shot; prints console errors.
// node shoot.js <url> [width=1440] [outDir=./shots] [t=0.62] [light|dark]      (t = where in each step to shoot)
const { chromium } = require('playwright');
const fs = require('fs');
const [, , url, w = '1440', out = './shots', tArg = '0.62', scheme = 'light'] = process.argv;
const H = +w < 600 ? 812 : 900, T = +tArg;
fs.mkdirSync(out, { recursive: true });

(async () => {
  const b = await chromium.launch();
  const errs = [];
  async function page(opts) {
    const pg = await b.newPage(Object.assign({ viewport: { width: +w, height: H }, colorScheme: scheme }, opts));
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
    await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });   // not 'load': a slow Google Fonts request can hold it 30 s+; the engine waits for fonts itself
    await pg.waitForTimeout(2600);
    return pg;
  }
  const pg = await page();
  const live = await pg.evaluate(() => !!document.querySelector('.mw.is-live'));
  const ids = await pg.evaluate(() => [...document.querySelectorAll('[data-step]')].map(s => s.dataset.step));
  for (const [i, id] of ids.entries()) {
    await pg.evaluate(([id, t]) => {
      const s = document.querySelector('[data-step="' + id + '"]'), r = s.getBoundingClientRect();
      window.scrollTo(0, r.top + scrollY + r.height * t - innerHeight * (innerWidth <= 900 ? 0.8 : 0.5));
    }, [id, T]);
    await pg.waitForTimeout(350);
    await pg.screenshot({ path: `${out}/${String(i).padStart(2, '0')}-${id}-${w}${scheme === 'dark' ? '-dark' : ''}.png` });
  }
  await pg.close();
  if (scheme === 'light' && +w > 600) {
    const nojs = await page({ javaScriptEnabled: false });
    await nojs.screenshot({ path: `${out}/nojs-${w}.png` });
    await nojs.close();
  }
  console.log(`${ids.length} steps → ${out}${live ? '' : '  (WARNING: engine did not start — .is-live missing)'}`);
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
})();
