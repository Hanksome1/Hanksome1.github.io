// Autoplay behaviour: hero button starts it, speed buttons, wheel/key interrupt, end → replay, replay restarts.
// node play.js <url>
const { chromium } = require('playwright');
const url = process.argv[2];
(async () => {
  const b = await chromium.launch(), errs = [];
  const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
  pg.on('pageerror', e => errs.push(e.message));
  // not 'load': a slow Google Fonts request can hold it 30 s+; the engine waits for fonts itself
  await pg.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 }); await pg.waitForTimeout(2600);
  const st = () => pg.evaluate(() => ({ y: Math.round(scrollY), label: document.querySelector('[data-play-label]').textContent,
    run: document.querySelector('[data-player]').classList.contains('is-run'), step: document.querySelector('[data-hud-c]').textContent }));
  const check = (k, ok, v) => console.log((ok ? 'ok   ' : 'FAIL ') + k.padEnd(26), JSON.stringify(v));
  // click with the mouse where the button is: page.click() would scroll it into view first, which the
  // autoplay rightly reads as the reader taking over
  const press = async sel => { const r = await pg.locator(sel).boundingBox(); await pg.mouse.click(r.x + r.width / 2, r.y + r.height / 2); };
  let s = await st();
  check('starts idle', !s.run, s);
  await pg.click('[data-play-hero]'); await pg.waitForTimeout(2500);
  const a = await st(); check('hero click runs', a.run && a.y > s.y, a);
  await press('[data-spd="2"]'); await pg.waitForTimeout(1500);
  s = await st(); check('2× keeps running', s.run && s.y > a.y, s);
  await pg.mouse.move(300, 400); await pg.mouse.wheel(0, 120); await pg.waitForTimeout(500);
  const w1 = await st(); await pg.waitForTimeout(700); const w2 = await st();
  check('wheel stops it', !w1.run && Math.abs(w1.y - w2.y) < 2, w2);
  await press('[data-play]'); await pg.waitForTimeout(1000);
  s = await st(); check('play button resumes', s.run, s);
  await pg.keyboard.press('ArrowDown'); await pg.waitForTimeout(400);
  s = await st(); check('key stops it', !s.run, s);
  await pg.evaluate(() => { const e = [...document.querySelectorAll('[data-step]')].pop(), r = e.getBoundingClientRect();
    scrollTo(0, r.top + scrollY + r.height * 0.95 - innerHeight * 0.5); }); await pg.waitForTimeout(600);
  const end = await st(); check('at end → replay label', !end.run, end);
  await press('[data-play]'); await pg.waitForTimeout(1500);
  s = await st(); check('replay restarts at top', s.run && s.y < end.y, s);
  await press('[data-spd="1"]');
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await b.close();
})();
