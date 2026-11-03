// The back of style 1 with real names (/admin/merch/, «Nomes do mural»): the print file redrawn in this browser, on a
// canvas the 3D view takes as its texture. The same layout as the site's wall (apoiantes.js layout(), «tipografia»)
// with the print differences of the phase 1 tools (tools/emblem.py): Inter 650 only (the serigrafia file), every name
// cream, the symbol's outline 1.3 mm, the caption «QUEM APOIA · ÉPOCA 2027» under it, and the same mm box as the print
// file, so the 3D places it exactly where it places the file with fictional names.
// The names never reach the DOM: they are drawn on the canvas, and only their count and letter size are reported.
import { SYM, UNIT, capMm } from './admin-merch-core.js';

// the symbol (#i-gc in index.html, apoiantes.js): the moon, and the sun as three rays and a disc
const MOON = 'M30.71 7.01L30.73 7.55C28.26 8.47 25.98 9.89 24.06 11.7C22.23 13.43 20.73 15.51 19.67 17.79C16.11 25.44 17.61 34.69 23.33 40.88C24.67 42.33 26.22 43.59 27.92 44.59C29.8 45.7 31.85 46.5 33.98 46.96C36.37 47.47 38.85 47.54 41.27 47.17C44.28 46.72 47.17 45.61 49.71 43.94C52.53 42.09 54.9 39.55 56.54 36.59L57.17 36.67C56.72 40.56 55.43 44.35 53.37 47.68C51.72 50.35 49.58 52.71 47.09 54.62C45.06 56.18 42.81 57.42 40.41 58.32C38.16 59.16 35.79 59.7 33.39 59.9C23.83 60.72 14.26 56.34 8.74 48.48C7.13 46.19 5.89 43.63 5.1 40.95C4.19 37.85 3.88 34.59 4.19 31.38C4.52 27.88 5.58 24.46 7.25 21.38C9.32 17.56 12.32 14.27 15.9 11.82C20.25 8.85 25.44 7.12 30.71 7.01Z';
const SUN = 'M43.81 10.69C41.55 9.72 39.1 9.2 36.64 9.18C36.66 9.07 36.67 8.93 36.72 8.84C36.78 8.71 36.89 8.6 36.98 8.49C37.23 8.15 37.49 7.81 37.75 7.47C38.62 6.31 39.49 5.16 40.36 4L42.51 4.46C42.84 5.87 43.17 7.28 43.49 8.69C43.59 9.11 43.69 9.52 43.78 9.94C43.81 10.07 43.87 10.22 43.88 10.36C43.88 10.46 43.83 10.59 43.81 10.69ZM52.05 17.63C50.55 15.37 48.58 13.44 46.29 12C46.37 11.91 46.48 11.75 46.58 11.69C46.69 11.62 47.09 11.48 47.24 11.42C47.67 11.25 48.11 11.07 48.55 10.89C50.12 10.26 51.7 9.62 53.27 8.98L54.85 10.51C54.27 12.1 53.69 13.7 53.11 15.29C52.95 15.74 52.78 16.18 52.62 16.62C52.57 16.77 52.45 17.18 52.38 17.29C52.32 17.39 52.14 17.54 52.05 17.63ZM55.24 26.95C55.07 24.62 54.48 22.32 53.5 20.21C53.6 20.18 53.73 20.12 53.84 20.12C53.96 20.12 54.22 20.19 54.35 20.22C54.73 20.29 55.11 20.36 55.48 20.44C56.79 20.69 58.09 20.94 59.4 21.19L59.93 23.32C58.88 24.17 57.83 25.02 56.78 25.86C56.47 26.11 56.15 26.37 55.84 26.62C55.74 26.7 55.64 26.82 55.53 26.88C55.45 26.92 55.33 26.93 55.24 26.95ZM50.15 27.99C50.19 29.82 49.86 31.66 49.16 33.36C48.58 34.79 47.74 36.12 46.69 37.26C45.83 38.2 44.83 39.01 43.73 39.66C37.83 43.2 29.76 41.91 25.41 36.52C24.55 35.46 23.86 34.26 23.37 32.98C22.79 31.43 22.5 29.79 22.53 28.14C22.63 21.82 27.22 16.17 33.34 14.69C34.59 14.38 35.88 14.26 37.16 14.32C38.61 14.4 40.03 14.71 41.37 15.24C42.91 15.85 44.34 16.74 45.56 17.86C46.93 19.12 48.04 20.64 48.82 22.32C49.65 24.1 50.11 26.04 50.15 27.99Z';
const SUBS = SUN.split(/(?=M)/), RAYS = SUBS.slice(0, 3).join(''), DISC = SUBS[3];

const CREME = '#F2F1EC', OURO = '#E6B450';
// Inter 650, as on the wall and in tools/emblem.py; F_MIN as the print tools (they go smaller than the screen)
const FT = { family: 'Inter', weight: '650', track: 0.02, lead: 0.16, gap: 0.62, sample: 'ÁÉÍÓÚÂÊÔÃÕÇMQ' };
const F_MAX = 2.7, F_MIN = 0.15;
// the page in mm: the print file's ink box (costas-serigrafia-60-nomes-30cm: 301.3 × 321.857 mm)
const PAD = SYM.line / 2, PAGE_W = SYM.mm + SYM.line, PAGE_H = 321.857;
const CAPTION = { text: 'QUEM APOIA · ÉPOCA 2027', cap: SYM.mm * 0.0145, track: 0.22, gap: SYM.mm * 0.05, family: 'JetBrains Mono', weight: '600', capEm: 0.73 };

let MET = null, mctx = null;
function measureCtx() {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  mctx.font = `normal ${FT.weight} 100px "${FT.family}"`;
  if (!MET) { const m = mctx.measureText(FT.sample); MET = { asc: m.actualBoundingBoxAscent / 100, desc: m.actualBoundingBoxDescent / 100 }; }
  return mctx;
}
const shown = (s) => s.toLocaleUpperCase('pt-PT');
const widthAt1 = (s) => { const x = shown(s); return mctx.measureText(x).width / 100 + FT.track * [...x].length; };

// ---------- masks: the moon and the sun disc as column prefix sums (apoiantes.js) ----------
const KM = 10, R = 64 * KM, RW = R + 1;
let MASK = null;
function buildMasks() {
  const c = document.createElement('canvas'); c.width = c.height = R;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.setTransform(KM, 0, 0, KM, 0, 0);
  g.fillStyle = '#ff0000'; g.fill(new Path2D(MOON));
  g.fillStyle = '#00ff00'; g.fill(new Path2D(DISC));
  const d = g.getImageData(0, 0, R, R).data, pm = new Uint16Array(R * RW), pd = new Uint16Array(R * RW);
  for (let y = 0; y < R; y++) {
    const row = y * R * 4;
    for (let x = 0; x < R; x++) { const o = row + x * 4, b = x * RW + y; pm[b + 1] = pm[b] + (d[o] < 128 ? 1 : 0); pd[b + 1] = pd[b] + (d[o + 1] < 128 ? 1 : 0); }
  }
  c.width = c.height = 1;
  return { pm, pd };
}
function spansOf(pre, ya, yb, m, k, out) {
  let y0 = Math.floor((ya - m) * KM), y1 = Math.ceil((yb + m) * KM);
  if (y0 < 0) y0 = 0; if (y1 > R) y1 = R; if (y1 <= y0) return;
  const e = m * KM; let s = -1;
  for (let x = 0; x <= R; x++) {
    const ok = x < R && pre[x * RW + y1] === pre[x * RW + y0];
    if (ok && s < 0) s = x;
    else if (!ok && s >= 0) { const x0 = (s + e) / KM, x1 = (x - e) / KM; if (x1 > x0) out.push({ x0, x1, k }); s = -1; }
  }
}
const marginOf = (f) => Math.max(0.45, 0.32 * f);
function makeRows(f, minW) {
  const a = MET.asc * f, d = MET.desc * f, pitch = (MET.asc + MET.desc + FT.lead) * f, m = marginOf(f);
  const top = 4 + a, bot = 60.75 - d - m, k = Math.floor((bot - top) / pitch), off = (bot - top - k * pitch) / 2, rows = [];
  for (let i = 0; i <= k; i++) {
    const y = top + off + i * pitch, sp = [];
    spansOf(MASK.pm, y - a, y + d, m, 0, sp); spansOf(MASK.pd, y - a, y + d, m, 1, sp);
    const ok = sp.filter((s) => s.x1 - s.x0 >= minW).sort((p, q) => p.x0 - q.x0);
    if (ok.length) rows.push({ y, spans: ok });
  }
  return rows;
}
function pack(f, wl, rho, withPos) {
  const minW = Math.min(...wl) * f, rows = makeRows(f, minW), gap = FT.gap * f, n = wl.length, items = [];
  let i = 0, seen = 0, used0 = 0;
  for (let r = 0; r < rows.length && i < n; r++) {
    for (const sp of rows[r].spans) {
      if (i >= n) break;
      const W = sp.x1 - sp.x0; seen += W;
      let used = 0, k = 0, j = i;
      while (j < n) {
        const need = (k ? gap : 0) + wl[j] * f;
        if (used + need > W + 1e-9) break;
        if (rho < 1 && used0 + used + need / 2 > rho * seen) break;
        used += need; k++; j++;
      }
      if (!k) continue;
      if (withPos) { let x = sp.x0 + (W - used) / 2; for (let q = i; q < j; q++) { items.push({ q, x, y: rows[r].y, k: sp.k }); x += wl[q] * f + gap; } }
      used0 += used + gap; i = j;
    }
  }
  const cap = rows.reduce((s, r) => s + r.spans.reduce((t, sp) => t + sp.x1 - sp.x0, 0), 0);
  return { placed: i, items, cap };
}
function fitFont(wl) {
  let hi = F_MAX;
  if (pack(hi, wl, 1).placed >= wl.length) return hi;
  let lo = F_MIN;
  for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (pack(mid, wl, 1).placed >= wl.length) lo = mid; else hi = mid; }
  return lo;
}
// names A to Z (pt) laid out in the symbol: { f, items: [{ q, x, y, k }], placed } in symbol units (y is the baseline)
function layout(names) {
  const wl = names.map(widthAt1), f = fitFont(wl);
  const need = wl.reduce((s, w) => s + w * f + FT.gap * f, 0), cap = pack(f, wl, 1).cap;
  let rho = Math.min(1, need / cap * 1.02), res = pack(f, wl, rho, true);
  while (res.placed < wl.length && rho < 1) { rho = Math.min(1, rho * 1.04); res = pack(f, wl, rho, true); }
  return { f, items: res.items, placed: res.placed };
}

// text with tracking (in px), one glyph at a time where the canvas has no letterSpacing
function tracked(g, text, x, y, size, track) {
  if ('letterSpacing' in g) { g.letterSpacing = `${track * size}px`; g.fillText(text, x, y); g.letterSpacing = '0px'; return; }
  for (const ch of text) { g.fillText(ch, x, y); x += g.measureText(ch).width + track * size; }
}
const trackedWidth = (g, text, size, track) => [...text].reduce((w, ch) => w + g.measureText(ch).width, 0) + track * size * ([...text].length - 1);

let fontsP = null;
const fontsReady = () => fontsP = fontsP || Promise.all([
  document.fonts.load(`${FT.weight} 100px "${FT.family}"`, FT.sample), document.fonts.load(`${CAPTION.weight} 100px "${CAPTION.family}"`, 'QUEM APOIA · ÉPOCA 2027'),
]).catch(() => {});
const coll = new Intl.Collator('pt-PT', { sensitivity: 'base' });

// The back print with these names, on a canvas `px` tall. Returns { canvas, w, h (mm), n, placed, f, cap (mm) }.
export async function namesBack(list, { px = 2048 } = {}) {
  await fontsReady();
  measureCtx();
  if (!MASK) MASK = buildMasks();
  const names = [...list].sort((a, b) => coll.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0));
  const lay = names.length ? layout(names) : { f: 0, items: [], placed: 0 };
  const s = px / PAGE_H, W = Math.round(PAGE_W * s), H = px;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // symbol units to canvas px
  const u = UNIT * s, ox = (PAD - SYM.x0 * UNIT) * s, oy = (PAD - SYM.y0 * UNIT) * s;
  // the names, cream
  const size = lay.f * u;
  g.fillStyle = CREME; g.textBaseline = 'alphabetic';
  g.font = `normal ${FT.weight} ${size}px "${FT.family}"`;
  for (const it of lay.items) tracked(g, shown(names[it.q]), ox + it.x * u, oy + it.y * u, size, FT.track);
  // the outline: the moon cream, the sun disc and the rays gold
  g.save();
  g.setTransform(u, 0, 0, u, ox, oy);
  g.lineWidth = SYM.line / UNIT; g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = CREME; g.stroke(new Path2D(MOON));
  g.strokeStyle = OURO; g.stroke(new Path2D(DISC)); g.stroke(new Path2D(RAYS));
  g.restore();
  // the caption, centred under the symbol
  const cs = CAPTION.cap / CAPTION.capEm * s, base = (PAD + SYM.h * UNIT + CAPTION.gap + CAPTION.cap) * s;
  g.font = `normal ${CAPTION.weight} ${cs}px "${CAPTION.family}"`;
  const cw = trackedWidth(g, CAPTION.text, cs, CAPTION.track);
  tracked(g, CAPTION.text, (PAD + SYM.mm / 2) * s - cw / 2, base, cs, CAPTION.track);
  return { canvas: c, w: PAGE_W, h: PAGE_H, n: names.length, placed: lay.placed, f: lay.f, cap: lay.f ? capMm(lay.f) : 0 };
}
