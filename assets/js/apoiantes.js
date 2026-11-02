// «Quem apoia» (the supporters' wall) in «Apoiar»: the outline of the GC symbol (moon, gold sun disc, three rays), and
// after a tap on «Vê quem apoiou», the supporters' names filling it, A to Z (the approved «tipografia» mockup,
// $S/apoiantes/mockup/). Owner decisions of 02.11.2026: the names live in the booking Worker's KV, never in git; the
// block exists from the first published name; with none, nothing at all is on the page.
//
// - No markup in index.html: this module builds the block only when GET /apoiantes says { on: true }, asked once when
//   «Apoiar» comes within 600 px (or at once for a #apoiantes address). Off, an error, a timeout or bad JSON: nothing.
// - The names are fetched only after the tap (GET /apoiantes/nomes), never before; they reach the page only through
//   textContent, never an attribute (no id, data-*, aria-label or title holds a name).
// - The block carries data-private: stats.js labels a click in it by the control's data-track-label or the element's
//   id, never by its text, so no name ever goes into a beacon.
// - Reduced motion: no fade. Forced colours and print: style.css (.crew*).
import { t, numFmt } from './i18n.js';
import { SITE } from './data.js';
import { FEW, MIN_SHOWN, normName, nameProblem } from './apoiantes-core.js';

const NS = 'http://www.w3.org/2000/svg';
const API = () => String(SITE.requestsApi || '').replace(/\/+$/, '');
const TIMEOUT = 8000;
const $ = (s, r = document) => r.querySelector(s);

// ------------------------------------------------------------------ the symbol (#i-gc in index.html)
const MOON = 'M30.71 7.01L30.73 7.55C28.26 8.47 25.98 9.89 24.06 11.7C22.23 13.43 20.73 15.51 19.67 17.79C16.11 25.44 17.61 34.69 23.33 40.88C24.67 42.33 26.22 43.59 27.92 44.59C29.8 45.7 31.85 46.5 33.98 46.96C36.37 47.47 38.85 47.54 41.27 47.17C44.28 46.72 47.17 45.61 49.71 43.94C52.53 42.09 54.9 39.55 56.54 36.59L57.17 36.67C56.72 40.56 55.43 44.35 53.37 47.68C51.72 50.35 49.58 52.71 47.09 54.62C45.06 56.18 42.81 57.42 40.41 58.32C38.16 59.16 35.79 59.7 33.39 59.9C23.83 60.72 14.26 56.34 8.74 48.48C7.13 46.19 5.89 43.63 5.1 40.95C4.19 37.85 3.88 34.59 4.19 31.38C4.52 27.88 5.58 24.46 7.25 21.38C9.32 17.56 12.32 14.27 15.9 11.82C20.25 8.85 25.44 7.12 30.71 7.01Z';
const SUN = 'M43.81 10.69C41.55 9.72 39.1 9.2 36.64 9.18C36.66 9.07 36.67 8.93 36.72 8.84C36.78 8.71 36.89 8.6 36.98 8.49C37.23 8.15 37.49 7.81 37.75 7.47C38.62 6.31 39.49 5.16 40.36 4L42.51 4.46C42.84 5.87 43.17 7.28 43.49 8.69C43.59 9.11 43.69 9.52 43.78 9.94C43.81 10.07 43.87 10.22 43.88 10.36C43.88 10.46 43.83 10.59 43.81 10.69ZM52.05 17.63C50.55 15.37 48.58 13.44 46.29 12C46.37 11.91 46.48 11.75 46.58 11.69C46.69 11.62 47.09 11.48 47.24 11.42C47.67 11.25 48.11 11.07 48.55 10.89C50.12 10.26 51.7 9.62 53.27 8.98L54.85 10.51C54.27 12.1 53.69 13.7 53.11 15.29C52.95 15.74 52.78 16.18 52.62 16.62C52.57 16.77 52.45 17.18 52.38 17.29C52.32 17.39 52.14 17.54 52.05 17.63ZM55.24 26.95C55.07 24.62 54.48 22.32 53.5 20.21C53.6 20.18 53.73 20.12 53.84 20.12C53.96 20.12 54.22 20.19 54.35 20.22C54.73 20.29 55.11 20.36 55.48 20.44C56.79 20.69 58.09 20.94 59.4 21.19L59.93 23.32C58.88 24.17 57.83 25.02 56.78 25.86C56.47 26.11 56.15 26.37 55.84 26.62C55.74 26.7 55.64 26.82 55.53 26.88C55.45 26.92 55.33 26.93 55.24 26.95ZM50.15 27.99C50.19 29.82 49.86 31.66 49.16 33.36C48.58 34.79 47.74 36.12 46.69 37.26C45.83 38.2 44.83 39.01 43.73 39.66C37.83 43.2 29.76 41.91 25.41 36.52C24.55 35.46 23.86 34.26 23.37 32.98C22.79 31.43 22.5 29.79 22.53 28.14C22.63 21.82 27.22 16.17 33.34 14.69C34.59 14.38 35.88 14.26 37.16 14.32C38.61 14.4 40.03 14.71 41.37 15.24C42.91 15.85 44.34 16.74 45.56 17.86C46.93 19.12 48.04 20.64 48.82 22.32C49.65 24.1 50.11 26.04 50.15 27.99Z';
const SUBS = SUN.split(/(?=M)/), RAYS = SUBS.slice(0, 3).join(''), DISC = SUBS[3];
const U = 10;   // the names' SVG is 640 units across: 10 per unit of the 64-unit symbol

// ------------------------------------------------------------------ type
const FONTS = {
  anton: { style: 'italic', weight: '400', family: 'Anton', track: 0.03, lead: 0.12, gap: 0.62, sample: 'ÁÉÍÓÚÂÊÔÃÕÇMQ' },
  inter: { style: 'normal', weight: '650', family: 'Inter', track: 0.02, lead: 0.16, gap: 0.62, sample: 'ÁÉÍÓÚÂÊÔÃÕÇMQ' },
};
let FT = FONTS.anton, SKEW = 0.25;
const F_MAX = 2.7, F_MIN = 0.25;          // symbol units (64 across): 2.7 ≈ 15 px on a phone, 26 px on a 620 px figure
const F_ANTON_MIN = 1.25;                 // below ≈ 7 px on a phone Anton italic caps blotch: Inter 650 caps
let MET = null, mctx = null;
function setFace(k) {
  FT = FONTS[k]; SKEW = FT.style === 'italic' ? 0.25 : 0;
  mctx = mctx || document.createElement('canvas').getContext('2d');
  mctx.font = `${FT.style} ${FT.weight} 100px "${FT.family}"`;
  const m = mctx.measureText(FT.sample);
  MET = { asc: m.actualBoundingBoxAscent / 100, desc: m.actualBoundingBoxDescent / 100 };
}
const shown = (s) => s.toLocaleUpperCase('pt-PT');
const widthAt1 = (s) => { const x = shown(s); return mctx.measureText(x).width / 100 + FT.track * [...x].length + SKEW * MET.asc; };

// ------------------------------------------------------------------ masks: the moon and the sun disc, as prefix sums
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
// rows top to bottom, the row grid centred in the symbol's height
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
// A to Z into rows top to bottom, spans left to right, centred, equal gaps. rho < 1 spreads a few names over the
// whole shape (never piled at the bottom like a thermometer).
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
      if (withPos) { let x = sp.x0 + (W - used) / 2; for (let q = i; q < j; q++) { items.push({ q, x, y: rows[r].y, k: sp.k, w: wl[q] * f }); x += wl[q] * f + gap; } }
      used0 += used + gap; i = j;
    }
  }
  const cap = rows.reduce((s, r) => s + r.spans.reduce((t2, sp) => t2 + sp.x1 - sp.x0, 0), 0);
  return { placed: i, items, rows: rows.length, cap };
}
function fitFont(wl) {
  let hi = F_MAX;
  if (pack(hi, wl, 1).placed >= wl.length) return hi;
  let lo = F_MIN;
  for (let it = 0; it < 13; it++) { const mid = (lo + hi) / 2; if (pack(mid, wl, 1).placed >= wl.length) lo = mid; else hi = mid; }
  return lo;
}
export function layout(list) {
  setFace('anton');
  let wl = list.map((x) => widthAt1(x.name)), f = fitFont(wl);
  if (f < F_ANTON_MIN) { setFace('inter'); wl = list.map((x) => widthAt1(x.name)); f = fitFont(wl); }
  const need = wl.reduce((s, w) => s + w * f + FT.gap * f, 0), cap = pack(f, wl, 1).cap;
  let rho = Math.min(1, need / cap * 1.02), res = pack(f, wl, rho, true);
  while (res.placed < wl.length && rho < 1) { rho = Math.min(1, rho * 1.04); res = pack(f, wl, rho, true); }
  return { f, rho, items: res.items };
}

// ------------------------------------------------------------------ state
const W = { on: false, block: null, link: null, probe: null, names: [], items: [], byName: [], f: 0, fold: [], lis: [], revealed: false, loading: false, opts: {} };
const st = { hover: null, pin: null, cur: null, matches: [], z: 1, q: '' };
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const coarse = () => matchMedia('(pointer: coarse)').matches;
const coll = new Intl.Collator('pt-PT', { sensitivity: 'base' });
const foldStr = (s) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const fmt = (n) => numFmt(n);
const nNames = (n) => t('ap.nn', n, fmt(n));

let fontsP = null;
const fontsReady = () => fontsP = fontsP || Promise.all([
  document.fonts.load('italic 400 16px "Anton"', 'ÁÉMQ'), document.fonts.load('650 16px "Inter"', 'ÁÉMQ'),
]).catch(() => {});
let maskP = null;
const masksReady = () => maskP = maskP || new Promise((ok) => {
  const go = () => { try { MASK = buildMasks(); } catch (_) { MASK = null; } ok(); };
  ('requestIdleCallback' in window) ? requestIdleCallback(go, { timeout: 600 }) : setTimeout(go, 50);
});

async function getJson(path) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(`${API()}${path}`, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (_) { return null; } finally { clearTimeout(timer); }
}

// ------------------------------------------------------------------ building the block
function el(tag, cls, attrs = {}) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function svgEl(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }
const R_ = {};   // the block's parts
function build() {
  const b = el('div', 'wrap crew', { id: 'apoiantes', 'data-private': '', 'data-nosnippet': '' });
  const copy = el('div', 'crew-copy');
  R_.h = el('h3', 'display crew-h'); R_.p = el('p', 'crew-line');
  copy.append(R_.h, R_.p);
  const fig = el('figure', 'crew-fig');
  R_.art = el('div', 'crew-art closed');
  R_.inner = el('div', 'crew-in');
  R_.nsvg = svgEl('svg', { class: 'crew-svg crew-nsvg', viewBox: '0 0 640 640', 'aria-hidden': 'true', focusable: 'false' });
  R_.gNames = svgEl('g'); R_.nsvg.appendChild(R_.gNames);
  R_.svg = svgEl('svg', { class: 'crew-svg crew-tsvg', viewBox: '0 0 640 640', role: 'img', 'aria-labelledby': 'crew-art-l', focusable: 'false' });
  R_.title = svgEl('title', { id: 'crew-art-l' });
  const ol = svgEl('g', { transform: 'scale(10)', 'aria-hidden': 'true' });
  ol.append(svgEl('path', { class: 'ol m', d: MOON }), svgEl('path', { class: 'ol s', d: RAYS }), svgEl('path', { class: 'ol s', d: DISC }));
  R_.top = svgEl('g', { 'aria-hidden': 'true' }); R_.mt = svgEl('g'); R_.ht = svgEl('g'); R_.top.append(R_.mt, R_.ht);
  R_.svg.append(R_.title, ol, R_.top);
  R_.tip = el('div', 'crew-tip', { 'aria-hidden': 'true' }); R_.tip.hidden = true;
  R_.inner.append(R_.nsvg, R_.svg, R_.tip);
  R_.open = el('button', 'crew-open', { type: 'button', 'aria-controls': 'crew-panel', 'aria-expanded': 'false', 'data-track-label': 'apoiantes-abrir' });
  R_.openT = el('span'); R_.open.appendChild(R_.openT);
  R_.art.append(R_.inner, R_.open);
  R_.act = el('div', 'crew-act');
  R_.err = el('p', 'crew-err', { role: 'alert' }); R_.err.hidden = true;
  fig.append(R_.art, R_.act, R_.err);
  R_.panel = el('div', 'crew-panel', { id: 'crew-panel' }); R_.panel.hidden = true;
  R_.lh = el('h4', 'crew-lh', { id: 'crew-lh', tabindex: '-1' });
  R_.find = el('div', 'crew-find');
  R_.qLabel = el('label', '', { for: 'crew-q' });
  R_.q = el('input', '', { type: 'search', id: 'crew-q', autocomplete: 'off', autocapitalize: 'words', spellcheck: 'false', enterkeyhint: 'search', 'data-track-label': 'apoiantes-procurar' });
  R_.status = el('p', 'crew-status', { role: 'status', 'aria-live': 'polite' });
  R_.hits = el('ul', 'crew-hits');
  R_.find.append(R_.qLabel, R_.q, R_.status, R_.hits);
  R_.box = el('div', 'crew-box', { role: 'region', 'aria-labelledby': 'crew-lh' });
  R_.ul = el('ul', 'crew-ul'); R_.box.appendChild(R_.ul);
  R_.panel.append(R_.lh, R_.find, R_.box);
  const foot = el('div', 'crew-foot');
  R_.anon = el('p', 'anon'); R_.rm = el('p'); R_.privP = el('p');
  R_.priv = el('a', '', { 'data-track-label': 'apoiantes-privacidade' }); R_.privP.appendChild(R_.priv);
  foot.append(R_.anon, R_.rm, R_.privP);
  b.append(copy, fig, R_.panel, foot);
  bindWall();
  return b;
}
// the copy of the block, again on a language switch
function texts() {
  R_.h.textContent = t('ap.h'); R_.p.textContent = t('ap.p');
  if (!W.revealed) R_.openT.textContent = W.loading ? t('ap.loading') : t('ap.open');
  R_.qLabel.textContent = t('ap.find'); R_.q.placeholder = t('ap.ph');
  R_.anon.textContent = t('ap.anon');
  const [a, b2] = t('ap.rm');
  const mail = el('a', '', { href: `mailto:${SITE.email}`, 'data-track-label': 'apoiantes-email' }); mail.textContent = SITE.email;
  R_.rm.textContent = ''; R_.rm.append(a, mail, b2);
  R_.priv.textContent = t('ap.priv'); R_.priv.setAttribute('href', t('ap.privh'));
  R_.title.textContent = W.revealed ? t('ap.art', nNames(W.names.length)) : t('ap.art0');
  if (W.revealed) {
    const few = W.names.length <= FEW;
    R_.lh.textContent = few ? t('ap.lhf') : t('ap.lh', nNames(W.names.length));
    const hint = $('.crew-hint', R_.act); if (hint) hint.textContent = t('ap.hint');
    const zg = $('.crew-zoom', R_.act);
    if (zg) { zg.setAttribute('aria-label', t('ap.zg')); $('.zo', zg).setAttribute('aria-label', t('ap.zout')); $('.zi', zg).setAttribute('aria-label', t('ap.zin')); }
    if (st.q) search(st.q);
  }
  if (W.link) $('span', W.link).textContent = t('ap.who');
}
// the entry link in the GoFundMe card, under its title (or under the buttons when there is no campaign card)
function placeLink() {
  if (!W.link) {
    W.link = el('a', 'gfm-who', { href: '#apoiantes', 'data-track-label': 'apoiantes-ver' });
    const s = svgEl('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' });
    s.append(svgEl('path', { class: 'm', d: MOON }), svgEl('path', { class: 's', d: SUN }));
    W.link.append(s, el('span'));
    W.link.addEventListener('click', (e) => {
      e.preventDefault();
      const go = W.opts.scrollToEl ? W.opts.scrollToEl(W.block) : Promise.resolve(W.block.scrollIntoView({ behavior: reduce() ? 'auto' : 'smooth' }));
      Promise.resolve(go).then(() => (W.revealed ? R_.lh : R_.open).focus({ preventScroll: true }));
    });
  }
  const card = $('#gfm'), title = $('#gfm-t'), cta = $('#apoiar .cta');
  if (card && !card.hidden && title) { if (W.link.previousElementSibling !== title) title.after(W.link); W.link.classList.remove('alone'); }
  else if (cta) { if (W.link.previousElementSibling !== cta) cta.after(W.link); W.link.classList.add('alone'); }
}
// in after «.wrap.support»; a reader already below it stays on what they are reading
function insert() {
  const sec = $('#apoiar'), support = sec && $('.wrap.support', sec);
  if (!support || W.block) return;
  W.block = build();
  texts();
  const below = support.getBoundingClientRect().bottom < 0, h0 = document.documentElement.scrollHeight;
  support.after(W.block);
  placeLink(); texts();
  if (below) { const dy = document.documentElement.scrollHeight - h0; if (W.opts.nudge) W.opts.nudge(dy); else scrollBy(0, dy); }
  // the masks and the fonts are made ready while idle, before any tap
  fontsReady(); masksReady();
  if (location.hash === '#apoiantes' && W.opts.holdAt) W.opts.holdAt(W.block);
  document.dispatchEvent(new CustomEvent('gc:crew', { detail: { on: true } }));
}

// ------------------------------------------------------------------ the tap: names in
async function reveal() {
  if (W.revealed || W.loading) return;
  W.loading = true; R_.open.disabled = true; R_.openT.textContent = t('ap.loading'); R_.err.hidden = true;
  const [data] = await Promise.all([getJson('/apoiantes/nomes'), fontsReady(), masksReady()]);
  W.loading = false;
  const list = data && Array.isArray(data.names) ? data.names : null;
  if (!list || !MASK) { R_.open.disabled = false; R_.openT.textContent = t('ap.open'); failed(); return; }
  fill(list);
}
function failed() {
  R_.err.hidden = false; R_.err.textContent = '';
  const retry = el('button', 'crew-retry', { type: 'button', 'data-track-label': 'apoiantes-tentar' }); retry.textContent = t('ap.retry');
  retry.addEventListener('click', () => { R_.err.hidden = true; reveal(); });
  R_.err.append(`${t('ap.err')} `, retry);
}
function fill(list) {
  W.names = list.filter((x) => x && typeof x.name === 'string' && typeof x.id === 'string' && !nameProblem(x.name))
    .map((x) => ({ id: x.id, name: normName(x.name) }))
    .sort((p, q) => coll.compare(p.name, q.name) || (p.id < q.id ? -1 : 1));
  const n = W.names.length, few = n <= FEW;
  // the panel and its controls first, straight after the tap (no late layout shift), then the art
  W.revealed = true; W.block.classList.add('open'); W.block.classList.toggle('few', few);
  R_.open.remove(); R_.art.classList.remove('closed'); R_.art.classList.add('ready');
  R_.find.hidden = few;
  R_.panel.hidden = false;
  if (!n) { R_.lh.textContent = t('ap.lhf'); R_.title.textContent = t('ap.art0'); R_.lh.focus({ preventScroll: true }); return; }

  const lay = layout(W.names); W.f = lay.f;
  for (const g of [R_.gNames, R_.top]) {
    // SVG presentation attributes: no style attribute anywhere
    g.setAttribute('font-family', `"${FT.family}"`); g.setAttribute('font-size', (W.f * U).toFixed(2));
    g.setAttribute('font-style', FT.style); g.setAttribute('font-weight', FT.weight); g.setAttribute('letter-spacing', (FT.track * W.f * U).toFixed(2));
  }
  const frag = document.createDocumentFragment();
  W.items = lay.items.map((it) => {
    const e = svgEl('text', { x: (it.x * U).toFixed(1), y: (it.y * U).toFixed(1), class: `n k${it.k}` });
    e.textContent = shown(W.names[it.q].name);
    frag.appendChild(e);
    return { i: it.q, el: e, x: it.x, w: it.w, y: it.y, k: it.k };
  });
  W.byName = new Array(n); W.items.forEach((it) => { W.byName[it.i] = it; });
  if (!reduce()) { R_.nsvg.classList.add('fade'); R_.nsvg.addEventListener('animationend', () => R_.nsvg.classList.remove('fade'), { once: true }); }
  R_.gNames.appendChild(frag);

  W.fold = W.names.map((x) => foldStr(x.name).split(' '));
  const lf = document.createDocumentFragment(); let last = '';
  W.lis = W.names.map((x) => {
    const L0 = foldStr(x.name).charAt(0).toUpperCase();
    if (!few && L0 !== last) { last = L0; const d = el('li', 'l', { 'aria-hidden': 'true' }); d.textContent = L0; lf.appendChild(d); }
    const li = el('li'); li.textContent = x.name; lf.appendChild(li); return li;
  });
  R_.ul.appendChild(lf);
  if (!few) R_.box.tabIndex = 0;
  if (W.f * R_.art.clientWidth / 64 < 13) zoomControls();
  texts();
  R_.lh.focus({ preventScroll: true });
}
function zoomControls() {
  const hint = el('p', 'crew-hint');
  const zoom = el('div', 'crew-zoom', { role: 'group' });
  const mk = (cls, d, track) => {
    const b = el('button', cls, { type: 'button', 'data-track-label': track });
    const s = svgEl('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' });
    s.appendChild(svgEl('path', { d, stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', fill: 'none' }));
    b.appendChild(s); return b;
  };
  const out = el('output', 'zl', { 'aria-hidden': 'true' }); out.textContent = '1×';
  const zo = mk('zo', 'M5 12h14', 'apoiantes-afastar'), zi = mk('zi', 'M5 12h14M12 5v14', 'apoiantes-aproximar');
  zoom.append(zo, out, zi); R_.act.append(hint, zoom);
  zo.addEventListener('click', () => setZoom(st.z / 2)); zi.addEventListener('click', () => setZoom(st.z * 2));
  setZoom(1);
}

// ------------------------------------------------------------------ reading a name: gold ring and a readable label
let showing = null;
function ring(p, cls) {
  const f = W.f, pad = 0.22 * f, y0 = p.y - MET.asc * f - pad, y1 = p.y + MET.desc * f + pad;
  return svgEl('rect', { class: `ring${cls ? ` ${cls}` : ''}`, x: ((p.x - pad) * U).toFixed(1), y: (y0 * U).toFixed(1), width: ((p.w + 2 * pad) * U).toFixed(1), height: ((y1 - y0) * U).toFixed(1), rx: ((y1 - y0) * U / 2).toFixed(1) });
}
function paint() {
  const p = st.hover || st.pin;
  if (p === showing) return;
  R_.ht.textContent = ''; showing = p;
  if (p) { R_.ht.appendChild(p.el.cloneNode(true)); R_.ht.appendChild(ring(p, 'cur')); R_.tip.textContent = W.names[p.i].name; R_.tip.hidden = false; placeTip(); } else R_.tip.hidden = true;
}
function placeTip() {
  const p = showing; if (!p) return;
  const f = W.f, s = R_.inner.clientWidth / 64, cx = (p.x + p.w / 2) * s, top = (p.y - MET.asc * f - 0.3 * f) * s, bot = (p.y + MET.desc * f + 0.3 * f) * s;
  const tw = R_.tip.offsetWidth, th = R_.tip.offsetHeight, vx0 = R_.art.scrollLeft, vx1 = vx0 + R_.art.clientWidth;
  const left = Math.max(vx0 + tw / 2 + 4, Math.min(vx1 - tw / 2 - 4, cx)), below = top - th - 12 < R_.art.scrollTop;
  R_.tip.classList.toggle('below', below);
  R_.tip.style.setProperty('left', `${left}px`); R_.tip.style.setProperty('top', `${below ? bot : top}px`);
}
function nearest(ev, radiusPx) {
  const r = R_.svg.getBoundingClientRect(), s = r.width / 64, ux = (ev.clientX - r.left) / s, uy = (ev.clientY - r.top) / s, rad = radiusPx / s, f = W.f;
  let best = null, bd = Infinity;
  for (const it of W.items) {
    const y0 = it.y - MET.asc * f, y1 = it.y + MET.desc * f;
    const dx = ux < it.x ? it.x - ux : ux > it.x + it.w ? ux - it.x - it.w : 0, dy = uy < y0 ? y0 - uy : uy > y1 ? uy - y1 : 0, d = Math.hypot(dx, dy);
    if (d < bd) { bd = d; best = it; }
  }
  return bd <= rad ? best : null;
}
const zMax = () => (coarse() ? 2 : 4);
function setZoom(z, focusOn) {
  z = Math.max(1, Math.min(zMax(), z));
  const old = st.z, vw = R_.art.clientWidth, f = W.f;
  let cx, cy;
  if (focusOn) { cx = (focusOn.x + focusOn.w / 2) / 64; cy = (focusOn.y - MET.asc * f / 2) / 64; } else { cx = (R_.art.scrollLeft + vw / 2) / (vw * old); cy = (R_.art.scrollTop + vw / 2) / (vw * old); }
  st.z = z; R_.inner.style.setProperty('--z', z); R_.art.classList.toggle('z', z > 1);
  if (z > 1) { R_.art.tabIndex = 0; R_.art.setAttribute('role', 'group'); R_.art.setAttribute('aria-label', `${t('ap.zin')} ${z}×`); } else { R_.art.removeAttribute('tabindex'); R_.art.removeAttribute('role'); R_.art.removeAttribute('aria-label'); }
  const w = R_.art.clientWidth; R_.art.scrollLeft = Math.max(0, cx * w * z - w / 2); R_.art.scrollTop = Math.max(0, cy * w * z - w / 2);
  const zo = $('.zo', R_.act), zi = $('.zi', R_.act);
  if (zo) { zo.disabled = z <= 1; zi.disabled = z >= zMax(); $('.zl', R_.act).textContent = `${z}×`; }
  placeTip();
}
function markCurrent(p) {
  if (st.cur && W.lis[st.cur.i]) W.lis[st.cur.i].classList.remove('cur');
  st.cur = p;
  if (p && W.lis[p.i]) { const li = W.lis[p.i]; li.classList.add('cur'); const top = li.offsetTop, bh = R_.box.clientHeight; if (R_.box.scrollHeight > bh && (top < R_.box.scrollTop || top > R_.box.scrollTop + bh - 30)) R_.box.scrollTop = Math.max(0, top - bh / 3); }
  for (const b of R_.hits.querySelectorAll('button')) b.setAttribute('aria-pressed', String(!!p && b._i === p.i));
}
function search(raw) {
  st.q = raw;
  const toks = foldStr(raw).split(' ').filter(Boolean);
  for (const i of st.matches) if (W.lis[i]) W.lis[i].classList.remove('m');
  st.matches = []; R_.hits.textContent = ''; R_.mt.textContent = '';
  if (!toks.length) { R_.art.classList.remove('dim'); R_.status.textContent = ''; st.pin = null; paint(); markCurrent(null); return; }
  for (let i = 0; i < W.fold.length; i++) if (toks.every((tk) => W.fold[i].some((w) => w.startsWith(tk)))) st.matches.push(i);
  const m = st.matches;
  for (const i of m) if (W.lis[i]) W.lis[i].classList.add('m');
  const few = m.length > 0 && m.length <= 150;
  if (few) { const mf = document.createDocumentFragment(); for (const i of m) if (W.byName[i]) { mf.appendChild(W.byName[i].el.cloneNode(true)); if (m.length <= 40) mf.appendChild(ring(W.byName[i])); } R_.mt.appendChild(mf); }
  R_.art.classList.toggle('dim', few);
  R_.status.textContent = m.length === 0 ? t('ap.f0', raw.trim().slice(0, 40)) : t('ap.fn', m.length, fmt(m.length));
  const hf = document.createDocumentFragment();
  m.slice(0, 5).forEach((i) => {
    const li = el('li'), b = el('button', '', { type: 'button', 'data-track-label': 'apoiantes-resultado' });
    b.textContent = W.names[i].name; b._i = i;
    b.addEventListener('click', () => choose(i)); li.appendChild(b); hf.appendChild(li);
  });
  if (m.length > 5) { const li = el('li', 'more'); li.textContent = t('ap.more', fmt(m.length - 5)); hf.appendChild(li); }
  R_.hits.appendChild(hf);
  st.pin = m.length ? W.byName[m[0]] : null; st.hover = null; paint(); markCurrent(st.pin);
}
function choose(i) {
  const p = W.byName[i]; if (!p) return;
  st.pin = p; st.hover = null;
  const px = W.f * R_.art.clientWidth / 64;
  if (px < 13 && $('.zo', R_.act)) setZoom(Math.min(zMax(), px * 2 >= 13 ? 2 : 4), p);
  paint(); markCurrent(p);
}
function bindWall() {
  R_.open.addEventListener('click', reveal);
  let raf = 0, lastEv = null, down = null;
  R_.art.addEventListener('pointermove', (e) => {
    if (!W.revealed || e.pointerType !== 'mouse') return; lastEv = e;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; const p = nearest(lastEv, 6); if (p !== st.hover) { st.hover = p; paint(); } });
  });
  R_.art.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && st.hover) { st.hover = null; paint(); } });
  R_.art.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, sl: R_.art.scrollLeft, st: R_.art.scrollTop }; });
  R_.art.addEventListener('pointerup', (e) => {
    if (!W.revealed || !down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 8 || R_.art.scrollLeft !== down.sl || R_.art.scrollTop !== down.st; down = null;
    if (moved) return;
    const p = nearest(e, e.pointerType === 'mouse' ? 6 : 18);
    st.pin = p && p === st.pin ? null : p; st.hover = null; paint(); markCurrent(st.pin);
  });
  document.addEventListener('pointerdown', (e) => { if (st.pin && W.block && !W.block.contains(e.target)) { st.pin = null; paint(); markCurrent(null); } });
  R_.art.addEventListener('scroll', () => placeTip(), { passive: true });
  let qRaf = 0;
  R_.q.addEventListener('input', () => { if (!qRaf) qRaf = requestAnimationFrame(() => { qRaf = 0; search(R_.q.value); }); });
  R_.q.addEventListener('keydown', (e) => { if (e.key === 'Enter' && st.matches.length) { e.preventDefault(); choose(st.matches[0]); } if (e.key === 'Escape') { R_.q.value = ''; search(''); } });
  R_.ul.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return; const li = e.target.closest('li'); if (!li || li.classList.contains('l')) return;
    const i = W.lis.indexOf(li); if (i >= 0 && W.byName[i] !== st.hover) { st.hover = W.byName[i]; paint(); }
  });
  R_.ul.addEventListener('pointerleave', () => { if (st.hover) { st.hover = null; paint(); } });
  addEventListener('resize', () => placeTip());
}

// ------------------------------------------------------------------ the probe
async function probe() {
  if (W.probe) return W.probe;
  W.probe = (async () => {
    if (!API()) return;
    const j = await getJson('/apoiantes');
    if (!j || j.on !== true) return;
    W.on = true;
    insert();
  })();
  return W.probe;
}
// opts: { scrollToEl, holdAt, nudge } from main.js (Lenis-aware scrolling); all optional
export function initApoiantes(opts = {}) {
  W.opts = opts;
  if (MIN_SHOWN < 1) return;
  const sec = document.getElementById('apoiar');
  if (!sec || !API()) return;
  if (location.hash === '#apoiantes' || !('IntersectionObserver' in window)) { probe(); return; }
  const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); probe(); } }, { rootMargin: '600px 0px' });
  io.observe(sec);
}
export function renderApoiantes() { if (W.block) { placeLink(); texts(); } }
// tests and the mockup checks: the state, never a name
export const __crew = { state: () => ({ on: W.on, built: !!W.block, revealed: W.revealed, n: W.names.length, f: W.f, z: st.z, matches: st.matches.length, face: FT.family }), reveal, search, setZoom };
