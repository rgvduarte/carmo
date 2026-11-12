// GOCARMO Ride: turns the lockup (symbol + GOCARMO, without the small RIDE tag) into a coarse bitmap for the
// start arch of the 3D world, which has no textures. Writes public/js/view3d/gocarmoMark.js.
// usage (from client/): node tools/make-arch-mark.cjs public/brand/gocarmo-ride.svg public/js/view3d/gocarmoMark.js 32
// Needs the Chromium of the devDependency playwright (`npx playwright install chromium` once).
// SPDX-License-Identifier: AGPL-3.0-or-later
/* global document, Path2D -- used inside page.evaluate(), which runs in the browser */
const { chromium } = require('playwright');
const fs = require('fs');
const [svgPath, outPath, rowsArg = '24'] = process.argv.slice(2);
(async () => {
  const ROWS = Number(rowsArg);
  const svg = fs.readFileSync(svgPath, 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 400 }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:#000">${svg}</body></html>`);
  const rows = await page.evaluate(async (ROWS) => {
    const svg = document.querySelector('svg');
    const paths = [...svg.querySelectorAll('path')];
    paths[3].remove(); // the RIDE tag: too small to read at this size
    const kept = paths.slice(0, 3);
    // Bounding box of what is left.
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of kept) { const b = p.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); }
    const S = 16; // samples per cell side
    const cell = (y1 - y0) / ROWS;
    const COLS = Math.ceil((x1 - x0) / cell);
    const canvas = document.createElement('canvas');
    canvas.width = COLS * S; canvas.height = ROWS * S;
    const ctx = canvas.getContext('2d');
    const coverage = (fills) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(S / cell, 0, 0, S / cell, (-x0 * S) / cell, (-y0 * S) / cell);
      ctx.fillStyle = '#fff';
      for (const p of kept) if (fills.includes(p.getAttribute('fill'))) ctx.fill(new Path2D(p.getAttribute('d')));
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const out = [];
      for (let r = 0; r < ROWS; r += 1) { const row = []; for (let c = 0; c < COLS; c += 1) { let sum = 0; for (let y = 0; y < S; y += 1) for (let x = 0; x < S; x += 1) sum += data[((r * S + y) * canvas.width + c * S + x) * 4 + 3]; row.push(sum / (255 * S * S)); } out.push(row); }
      return out;
    };
    const ink = coverage(['#f2f1ec']);
    const gold = coverage(['#e6b450']);
    return ink.map((row, r) => row.map((v, c) => (Math.max(v, gold[r][c]) < 0.45 ? '.' : v >= gold[r][c] ? '#' : 'o')).join(''));
  }, ROWS);
  await browser.close();
  const body = `/**
 * The GOCARMO lockup (the moon-and-sun symbol and the name) as a coarse bitmap,
 * for the start/finish arch: the renderer has no textures, so the arch is
 * written in small quads (see banners.js). "#" is ink (the moon, the letters),
 * "o" is gold (the sun), "." is empty. Generated from the lockup's outlines
 * (client/public/brand/gocarmo-ride.svg, without its small "RIDE" tag, which
 * would not read at this size); do not edit by hand: regenerate from client/
 * with \`node tools/make-arch-mark.cjs public/brand/gocarmo-ride.svg public/js/view3d/gocarmoMark.js 32\`.
 * Under the AGPL; the GOCARMO name and symbol as a brand are reserved (AGPL
 * section 7(e)), see client/public/brand/README.md.
 */
export const ARCH_MARK = Object.freeze([
${rows.map((r) => `  "${r}",`).join('\n')}
]);
`;
  fs.writeFileSync(outPath, body);
  console.log(rows.join('\n'));
  console.log('rows', rows.length, 'cols', rows[0].length);
})().catch((e) => { console.error(e); process.exit(1); });
