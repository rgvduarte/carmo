// Renders the pictures of the suit and the helmet used by the entry cards of chapter 05 and as the stages' stand-ins
// (before a model is drawn, and on devices without 3D). They come from the site's own models (assets/js/suit.js and
// helmet.js), with the spot frames drawn but no prices, numbers or sponsor logos, so they never go out of date when a
// spot is sold. Run it again after changing a model:
//
//   python3 -m http.server 8000 --bind 127.0.0.1 &
//   node scripts/model-shots.mjs            (needs Playwright: npm i -g playwright, or PLAYWRIGHT=/path/to/playwright)
//
// Writes assets/img/model-fato-{600,1200}.webp + model-fato-600.png and model-capacete-{700,1400}.webp + -700.png.
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE || 'http://127.0.0.1:8000/';
const launch = process.env.CHROMIUM
  ? { executablePath: process.env.CHROMIUM, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
  : { args: ['--use-gl=angle'] };

const HARNESS = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.min.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/" } }</script>
<style>html, body { margin: 0; background: transparent; } .box { position: absolute; left: 0; top: 0; }</style></head>
<body><div class="box" id="suit"></div><div class="box" id="helmet"></div>
<script type="module">
import { Suit } from '/assets/js/suit.js';
import { Helmet } from '/assets/js/helmet.js';
const data = await (await fetch('/data/spots.json', { cache: 'no-cache' })).json();
// every spot as a free spot, no logo: the frames show where the spaces are, whatever is sold later
const spots = data.spots.map((s) => ({ ...s, status: 'available', logo: undefined }));
const box = (id, w, h) => { const el = document.getElementById(id); el.style.width = w + 'px'; el.style.height = h + 'px'; return el; };
// one still of a model at its home pose, cropped to what it drew and scaled to each width (supersampled down)
async function still(m, widths) {
  const fill = m.octx.fillText; m.octx.fillText = () => {}; m.drawOverlay(); m.octx.fillText = fill;   // frames, no text
  const u = m.uni; u.uSpots.value = 1; u.uReveal.value = 1.2; u.uDim.value = 0; u.uSelOn.value = 0; u.uHovOn.value = 0;
  m.active = false;                                   // the loop stops; this frame is drawn by hand
  // no floor shadow: the cards and stages have their own ground, and the crop follows the model alone
  for (const o of m.scene.children) if (o.isMesh && o.material && o.material.isMeshBasicMaterial && o.material.transparent) o.visible = false;
  const p = { ...m.constructor.HOME };
  m.model.rotation.y = p.rot;
  m.camera.position.set(p.x, p.y, p.dist * (m.fit || 1)); m.camera.lookAt(p.x, p.ty, 0);
  m.renderer.render(m.scene, m.camera);
  const c = m.canvas, g = document.createElement('canvas'); g.width = c.width; g.height = c.height;
  const x = g.getContext('2d'); x.drawImage(c, 0, 0);
  const d = x.getImageData(0, 0, g.width, g.height).data;
  let x0 = g.width, y0 = g.height, x1 = 0, y1 = 0;
  for (let y = 0; y < g.height; y++) for (let i = 0; i < g.width; i++) if (d[(y * g.width + i) * 4 + 3] > 24) { if (i < x0) x0 = i; if (i > x1) x1 = i; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const pad = Math.round((x1 - x0) * 0.03); x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(g.width - 1, x1 + pad); y1 = Math.min(g.height - 1, y1 + pad);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = {};
  for (const w of widths) {
    const o = document.createElement('canvas'); o.width = w; o.height = Math.round((ch * w) / cw);
    const ox = o.getContext('2d'); ox.imageSmoothingQuality = 'high'; ox.drawImage(g, x0, y0, cw, ch, 0, 0, o.width, o.height);
    out[w] = { w: o.width, h: o.height, webp: o.toDataURL('image/webp', 0.9), png: o.toDataURL('image/png') };
  }
  return out;
}
window.shoot = async () => {
  const suit = new Suit(box('suit', 900, 1300), { spots: spots.filter((s) => (s.item || 'suit') === 'suit'), labels: { sold: '', reserved: '', top: '' } });
  suit.reveal();
  const a = await still(suit, [600, 1200]);
  const helmet = new Helmet(box('helmet', 1300, 1000), { spots: spots.filter((s) => s.item === 'helmet'), labels: { sold: '', reserved: '', top: '' }, active: true });
  await helmet.prepare(); helmet.drawBase(); await helmet.ready();
  const b = await still(helmet, [700, 1400]);
  return { suit: a, helmet: b };
};
window.ready = true;
</script></body></html>`;

const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1400, height: 1400 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.error('page:', e.message));
await page.route(`${BASE}__model-shots.html`, (r) => r.fulfill({ contentType: 'text/html', body: HARNESS }));
await page.goto(`${BASE}__model-shots.html`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.ready === true, null, { timeout: 60000 });
const res = await page.evaluate(() => window.shoot());
const save = (name, url) => { const f = path.join(ROOT, 'assets/img', name); writeFileSync(f, Buffer.from(url.split(',')[1], 'base64')); console.log(name); };
for (const [w, r] of Object.entries(res.suit)) { save(`model-fato-${w}.webp`, r.webp); if (w === '600') save('model-fato-600.png', r.png); console.log(`  suit ${w}: ${r.w} x ${r.h}`); }
for (const [w, r] of Object.entries(res.helmet)) { save(`model-capacete-${w}.webp`, r.webp); if (w === '700') save('model-capacete-700.png', r.png); console.log(`  helmet ${w}: ${r.w} x ${r.h}`); }
await browser.close();
