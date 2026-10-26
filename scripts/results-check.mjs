// Checks «Todas as provas» in a real browser, at 1440, 390 and 320 px wide:
//   - the cards index.html carries (written by stamp.mjs) lay out exactly as high as the ones main.js renders, so the
//     render on load moves nothing below;
//   - a filter (Triatlo, Corrida) keeps the block's height;
//   - nothing makes the page scroll sideways;
//   - without JavaScript every race shows, and the controls are gone.
// Run it after node scripts/stamp.mjs, with the local server on:
//
//   python3 -m http.server 8000 --bind 127.0.0.1 &
//   node scripts/results-check.mjs          (needs Playwright: npm i -g playwright, or PLAYWRIGHT=/path/to/playwright)
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8000/';
const launch = process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] } : {};
const height = () => document.getElementById('provas').getBoundingClientRect().height;
const fails = [];
const expect = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const same = (a, b) => Math.abs(a - b) < 0.5;

const browser = await chromium.launch(launch);
for (const [width, h] of [[1440, 900], [390, 844], [320, 640]]) {
  // the page as first painted: main.js held back, so the block is the baked markup
  const ctx = await browser.newContext({ viewport: { width, height: h }, locale: 'pt-PT' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  let release;
  const held = new Promise((r) => { release = r; });
  await page.route('**/assets/js/main.js*', async (route) => { await held; await route.continue(); });
  await page.goto(`${BASE}?lang=pt`, { waitUntil: 'commit' });
  await page.waitForSelector('#pv-total', { state: 'attached' });
  await page.evaluate(() => document.fonts.ready);
  const baked = await page.evaluate(height);
  release();
  await page.waitForFunction(() => document.documentElement.classList.contains('ready'));
  const rendered = await page.evaluate(height);
  expect(same(baked, rendered), `${width}px: first paint ${baked.toFixed(2)} = render ${rendered.toFixed(2)}`);
  for (const kind of ['tri', 'run', 'all']) {
    await page.click(`#pv-filter button[data-kind="${kind}"]`);
    const hk = await page.evaluate(height);
    expect(same(hk, rendered), `${width}px: filter ${kind} keeps ${hk.toFixed(2)}`);
  }
  const side = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(side <= 0, `${width}px: no sideways page scroll (${side})`);
  expect(!errors.length, `${width}px: no errors ${errors.join(' | ')}`);
  await ctx.close();

  const nojs = await browser.newContext({ viewport: { width, height: h }, javaScriptEnabled: false });
  const np = await nojs.newPage();
  await np.goto(BASE);
  const n = await np.evaluate(() => ({ shown: [...document.querySelectorAll('.pv-card')].filter((c) => c.getBoundingClientRect().height > 0).length,
    total: document.getElementById('pv-total').textContent, nav: getComputedStyle(document.querySelector('.pv-nav')).display }));
  expect(n.shown === Number(n.total) && n.nav === 'none', `${width}px without JS: ${n.shown} of ${n.total} races, controls ${n.nav}`);
  await nojs.close();
}
await browser.close();
if (fails.length) { console.error(`\n${fails.length} failed`); process.exit(1); }
