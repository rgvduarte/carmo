// «Mapas de calor» (SPEC 5.7): the live home page in a same-origin iframe at the visitor's width, with an overlay drawn
// inside the iframe's own document so it scrolls with the content. Positions are recomputed here from each click's
// selector and its place inside the element (5 % cells), so the map follows the page as it is today. The density is
// built on a coarse grid (one cell per 4 CSS px) and painted into one small canvas per page zone, which the browser
// scales up: no giant canvas (Safari caps canvas area), and no seams between zones.
// The framed page never counts as a visit: stats.js stops when window.top !== window.self (SPEC 4.3), and the URL
// carries ?heatmap=1 for any other script on the page (the GA module) to stay quiet too.
import { ZONES, FIXED, SCRUBBED, zoneOf, zoneBox } from './stats-zones.js';
import { H, fmt, table, emptyState, token, hexRgb } from './admin-analytics-charts.js';
import * as L from './admin-analytics-labels.js';

const BUCKETS = { m: [390, 844, 'Telemóvel', '390'], t: [834, 1112, 'Tablet', '834'], d: [1280, 800, 'Computador', '1280'], w: [1600, 900, 'Ecrã largo', '1600'] };
const LAYERS = [['clicks', 'Todos os cliques'], ['dead', 'Sem resposta'], ['rage', 'Repetidos'], ['err', 'Com erro'], ['scroll', 'Até onde descem'], ['attention', 'Onde passam tempo']];
const G = 4;            // CSS px per density cell
const R = 18;           // blob radius, CSS px
const KEY_RE = /^[a-z0-9]+(\.[a-z0-9-]+)+$/;
const FIXED_IDS = new Set(FIXED.map(([id]) => id));
const ZONE_IDS = ZONES.map(([id]) => id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function createHeat(ctx) {
  // ctx: { api, params(), hm (state), save(), pageText(key), audience() → Promise<Ranked vw>, onError(e) }
  let panel = null, frame = null, frameReady = null, data = null, dataKey = '', ro = null, roFrame = null, painting = 0, selected = null;
  const hm = ctx.hm;
  const el = {};

  function build(p) {
    panel = p;
    p.replaceChildren();
    H('p', 'ga-fine', 'A página verdadeira, à largura de quem a visitou, com os cliques, a descida e o tempo por cima. Só aparece com 5 ou mais visualizações nessa largura. Podes mexer na página como no telemóvel.', p).classList.add('hm-intro');
    const ctl = H('div', 'hm-controls', null, p);
    const row = (label) => { const r = H('div', 'hm-row', null, ctl); H('span', 'lbl', label, r); return r; };
    const seg = (parent, name, items, cur, onChange) => {
      const fs = H('fieldset', 'ga-seg', null, parent);
      H('legend', 'sr-only', name, fs);
      const spans = {};
      for (const [k, label, small] of items) {
        const lab = H('label', null, null, fs);
        const r = H('input', null, null, lab); r.type = 'radio'; r.name = `hm-${name}`; r.value = k; r.checked = k === cur;
        const s = H('span', null, label, lab);
        if (small !== undefined) spans[k] = H('small', null, small, s);
        r.addEventListener('change', () => onChange(k));
      }
      return { fs, spans };
    };
    el.width = seg(row('Largura'), 'largura', [...Object.entries(BUCKETS).map(([k, b]) => [k, `${b[2]} · ${b[3]}`, '']), ['all', 'Todas as larguras']], hm.vw, (k) => { hm.vw = k; ctx.save(); load(); });
    el.layer = seg(row('Camada'), 'camada', LAYERS, hm.layer, (k) => { hm.layer = k; ctx.save(); paint(); tables(); });
    const r3 = H('div', 'hm-row', null, ctl);
    const tog = H('label', 'ga-tog', null, r3);
    const cb = H('input', null, null, tog); cb.type = 'checkbox'; cb.checked = hm.under !== false;
    H('span', null, 'Mostrar a página por baixo', tog);
    cb.addEventListener('change', () => { hm.under = cb.checked; ctx.save(); paint(); });
    el.wrap = H('div', 'hm-wrap', null, p);
    el.stage = H('div', 'hm-stage', null, el.wrap);
    el.box = H('div', 'hm-box', null, el.stage);
    const bar = H('div', 'hm-bar', null, el.stage);
    el.status = H('p', 'hm-status', 'A carregar…', bar);
    el.status.setAttribute('aria-live', 'polite');
    el.legend = H('div', 'ga-scale', null, bar);
    el.msg = H('div', 'hm-msg', null, p);
    el.wrap.before(el.msg);
    el.tables = H('div', 'hm-tables', null, el.wrap);
    ro = new ResizeObserver(() => fitFrame());
    ro.observe(p);
  }

  // ---------- the frame ----------
  function fitFrame() {
    if (!frame || !panel || hm.vw === 'all') return;
    const [bw, bh] = BUCKETS[hm.vw];
    const avail = panel.clientWidth;
    if (!avail) return;
    const split = avail >= 1000 && bw <= 834;
    el.wrap.classList.toggle('split', split);
    // below the sticky tabs and filters, so the whole frame fits on the screen
    const bar = document.getElementById('bar');
    const under = bar && window.innerWidth > 760 ? Math.round(bar.getBoundingClientRect().height + 61) : 0;
    el.wrap.style.setProperty('--hm-top', `${under + 12}px`);
    const maxW = split ? Math.min(avail * 0.5, bw) : avail;
    const maxH = Math.max(420, window.innerHeight - (window.innerWidth <= 760 ? 150 : under + 70));
    const s = Math.min(1, maxW / bw, maxH / bh);
    frame.style.width = `${bw}px`;
    frame.style.height = `${bh}px`;
    frame.style.transform = `scale(${s})`;
    el.box.style.width = `${Math.floor(bw * s)}px`;
    el.box.style.height = `${Math.floor(bh * s)}px`;
    el.wrap.style.setProperty('--hm-w', `${Math.max(340, Math.floor(bw * s))}px`);
  }
  function ensureFrame() {
    if (frame) return frameReady;
    frame = document.createElement('iframe');
    frame.id = 'hm-frame';
    frame.title = 'A página inicial, para desenhar o mapa';
    frame.setAttribute('scrolling', 'yes');
    fitFrame();
    frameReady = new Promise((resolve) => {
      frame.addEventListener('load', async () => {
        const w = frame.contentWindow, d = frame.contentDocument;
        try { await Promise.race([d.fonts ? d.fonts.ready : null, sleep(4000)]); } catch (_) {}
        await sleep(1500);
        await new Promise((r) => w.requestAnimationFrame(() => w.requestAnimationFrame(r)));
        // redraw after the page's own late layout (the Strava card, images, fonts)
        let t = 0;
        roFrame = new w.ResizeObserver(() => { clearTimeout(t); t = setTimeout(() => paint(), 300); });
        roFrame.observe(d.body);
        let st = 0;
        w.addEventListener('scroll', () => { clearTimeout(st); st = setTimeout(() => { if (needsScrollPaint) paint(); }, 250); }, { passive: true });
        resolve(true);
      }, { once: true });
    });
    frame.src = '../../?heatmap=1';
    el.box.append(frame);
    return frameReady;
  }
  let needsScrollPaint = false;

  // ---------- data ----------
  async function load() {
    if (!panel) return;
    const isAll = hm.vw === 'all';
    el.stage.hidden = isAll;
    if (!isAll) { await ensureFrameSize(); }
    const params = { ...ctx.params(), vw: hm.vw };
    const key = JSON.stringify(params);
    panel.classList.add('busy');
    el.status.textContent = 'A carregar os cliques…';
    try {
      const d = await ctx.api.get('heatmap', params);
      if (key !== JSON.stringify({ ...ctx.params(), vw: hm.vw })) return;
      data = d; dataKey = key;
      el.msg.replaceChildren();
      if (!d.enough) {
        el.stage.hidden = true;
        emptyState(el.msg, `Ainda há poucos dados para este mapa: são precisas 5 visualizações nesta largura e há ${fmt.n(d.pvBucket)}.`);
        el.tables.replaceChildren();
        return;
      }
      el.stage.hidden = isAll;
      if (isAll) H('p', 'ga-fine', 'Todas as larguras juntas: só as tabelas. Escolhe uma largura para ver o mapa por cima da página.', el.msg);
      tables();
      if (!isAll) { el.status.textContent = 'A preparar a página…'; await ensureFrame(); paint(); }
    } catch (e) {
      el.msg.replaceChildren();
      el.stage.hidden = true;
      emptyState(el.msg, e.text || 'Não consegui carregar este painel.', () => load());
      ctx.onError(e);
    } finally { panel.classList.remove('busy'); }
  }
  async function ensureFrameSize() {
    if (!frame) return;
    fitFrame();
  }
  async function counts() {
    try {
      const vw = await ctx.audience();
      const by = new Map((vw && vw.rows ? vw.rows : []).map((r) => [r.k, r.n]));
      for (const k of Object.keys(BUCKETS)) if (el.width.spans[k]) el.width.spans[k].textContent = fmt.n(by.get(k) || 0);
      return by;
    } catch (_) { return new Map(); }
  }

  // ---------- drawing ----------
  function lut() {
    const stops = ['--seq-650', '--seq-600', '--seq-550', '--seq-500', '--seq-450', '--seq-400', '--seq-350', '--seq-300', '--seq-250', '--seq-200', '--seq-150', '--seq-100'].map((v) => hexRgb(token(v)));
    const out = new Uint8ClampedArray(256 * 4);
    for (let i = 0; i < 256; i++) {
      const t = (i / 255) * (stops.length - 1), a = Math.floor(t), b = Math.min(stops.length - 1, a + 1), f = t - a;
      for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(stops[a][c] + (stops[b][c] - stops[a][c]) * f);
      out[i * 4 + 3] = Math.round(255 * 0.9 * (i / 255));
    }
    return out;
  }
  const rgbOf = (L4, i) => `rgb(${L4[i * 4]}, ${L4[i * 4 + 1]}, ${L4[i * 4 + 2]})`;
  const ALIAS = { '#stage > canvas': '#stage', '#stage-h > canvas': '#stage-h' };
  function query(doc, sel) {
    try {
      const n = doc.querySelector(sel);
      if (n || !ALIAS[sel]) return n;
      return doc.querySelector(ALIAS[sel]);
    } catch (_) { return null; }
  }
  // where an element is drawn: 'doc' (in the page), 'nav' (the fixed top menu), or null (hidden / another fixed layer)
  function placeOf(node, win) {
    if (!node) return null;
    if (node.closest('dialog:not([open])')) return null;
    const z = zoneOf(node);
    if (z && FIXED_IDS.has(z) && z !== 'nav') return null;
    const r = node.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const cs = win.getComputedStyle(node);
    if (cs.visibility === 'hidden' || cs.display === 'none') return null;
    if (node.checkVisibility && !node.checkVisibility({ visibilityProperty: true })) return null;
    return z === 'nav' ? 'nav' : 'doc';
  }

  function paint() {
    if (!frame || !data || !data.enough || hm.vw === 'all') return;
    const doc = frame.contentDocument, win = frame.contentWindow;
    if (!doc || !doc.body) return;
    const run = ++painting;
    let root = doc.getElementById('gc-hm');
    if (!doc.getElementById('gc-hm-css')) {
      const st = doc.createElement('style');
      st.id = 'gc-hm-css';
      st.textContent = `#gc-hm{position:absolute;left:0;top:0;pointer-events:none;z-index:2147483646}
#gc-hm *{pointer-events:none;box-sizing:border-box}
#gc-hm .s{position:absolute;left:0;top:0;width:100%;height:100%}
#gc-hm canvas{position:absolute;left:0;image-rendering:auto}
#gc-hm .fx{position:fixed}
#gc-hm .zl{position:absolute;left:8px;padding:3px 8px;border-radius:999px;background:rgba(11,11,12,.78);color:#f2f1ec;font:500 11px/1.2 Inter,system-ui,sans-serif;letter-spacing:.01em;white-space:nowrap}
#gc-hm .ch{position:absolute;left:10px;padding:6px 10px;border-radius:10px;background:rgba(11,11,12,.86);color:#f2f1ec;font:600 13px/1.25 Inter,system-ui,sans-serif;max-width:calc(100% - 20px)}
#gc-hm .ch small{display:block;font-weight:500;font-size:12px;color:#c9c7bd}
#gc-hm .tint{position:absolute;left:0;width:100%;opacity:.4}
#gc-hm .band{position:absolute;left:0;width:24px}
#gc-hm .hl{position:absolute;left:0;width:100%;height:0;border-top:1px solid rgba(242,241,236,.85)}
#gc-hm .hl.fold{border-top-style:dashed;border-top-color:#e6b450}
#gc-hm .hl span{position:absolute;right:8px;top:-22px;padding:3px 8px;border-radius:999px;background:rgba(11,11,12,.86);color:#f2f1ec;font:600 12px/1.2 Inter,system-ui,sans-serif;white-space:nowrap}
#gc-hm .hl.fold span{color:#e6b450}
#gc-hm .ol{position:absolute;border:2px solid #e6b450;border-radius:6px;box-shadow:0 0 0 3px rgba(11,11,12,.6)}
#gc-hm .cell{position:absolute;background:#fce9c6}`;
      doc.head.append(st);
    }
    if (!root) { root = doc.createElement('div'); root.id = 'gc-hm'; root.setAttribute('aria-hidden', 'true'); doc.documentElement.append(root); }
    root.replaceChildren();
    root.style.height = '0px';
    const sx = win.scrollX, sy = win.scrollY;
    const docW = doc.documentElement.clientWidth;
    const docH = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
    root.style.width = `${docW}px`;
    root.style.height = `${docH}px`;
    const scrim = doc.createElement('div');
    scrim.className = 's';
    scrim.style.background = hm.under === false ? '#0b0b0c' : 'rgba(11,11,12,.62)';
    root.append(scrim);
    const zones = new Map();
    for (const id of ZONE_IDS) {
      const b = zoneBox(doc, id);
      if (b) zones.set(id, { id, top: b.top + sy, bottom: b.bottom + sy, left: b.left + sx, right: b.right + sx, height: b.height });
    }
    const navEl = doc.querySelector('#nav');
    const navBox = navEl ? navEl.getBoundingClientRect() : null;
    const LUT = lut();
    const layer = hm.layer;
    const st = { drawn: 0, hidden: 0, vh: data.vh || BUCKETS[hm.vw][1] };
    const resolved = new Map();         // sel → { node, place }
    const resolve = (sel) => {
      if (resolved.has(sel)) return resolved.get(sel);
      const node = query(doc, sel);
      const v = { node, place: placeOf(node, win) };
      resolved.set(sel, v);
      return v;
    };
    needsScrollPaint = false;
    if (layer === 'scroll') drawScroll(doc, root, docW, docH, LUT, st);
    else if (layer === 'attention') drawAttention(doc, root, zones, LUT, st);
    else {
      const pts = [], navPts = [];
      const wi = layer === 'dead' ? 3 : layer === 'rage' ? 4 : 2;
      if (layer === 'err') {
        for (const e of data.elements) {
          if (!e.err) continue;
          const r = resolve(e.sel);
          if (!r.place) { st.hidden += e.err; continue; }
          const b = r.node.getBoundingClientRect();
          (r.place === 'nav' ? navPts : pts).push([b.left + b.width / 2 + (r.place === 'nav' ? 0 : sx), b.top + b.height / 2 + (r.place === 'nav' ? 0 : sy), e.err]);
          st.drawn += e.err;
        }
      } else {
        const done = new Set();
        for (const c of data.cells) {
          const r = resolve(c.b);
          if (!r.place) continue;
          done.add(c.b);
          const b = r.node.getBoundingClientRect();
          if (SCRUBBED.includes(zoneOf(r.node))) needsScrollPaint = true;
          for (const cell of c.c) {
            const w = cell[wi];
            if (!w) continue;
            // the data knows a click to its 5 % cell: on a big element (the 3D model, a photo) a cell is wider than
            // a blob, so the blob grows to the cell and neighbouring cells blend instead of showing a grid
            const cw = b.width / 20, ch = b.height / 20;
            const rr = Math.max(R, 0.8 * Math.max(cw, ch));
            const x = b.left + (cell[0] + 0.5) * cw, y = b.top + (cell[1] + 0.5) * ch;
            if (r.place === 'nav') navPts.push([x, y, w, rr]); else pts.push([x + sx, y + sy, w, rr]);
            st.drawn += w;
          }
        }
        // boxes that do not resolve at this width: their zone-relative position, never in the scrubbed zones (D23)
        for (const zc of data.zcells) {
          if (done.has(zc.b)) continue;
          for (const cell of zc.c) {
            const w = cell[wi];
            if (!w) continue;
            const zn = zones.get(zc.z);
            if (zc.z === 'nav' && navBox) { navPts.push([((cell[0] + 1) / 100) * docW, navBox.top + cell[1] + 10, w]); st.drawn += w; continue; }
            if (!zn || SCRUBBED.includes(zc.z) || FIXED_IDS.has(zc.z)) { st.hidden += w; continue; }
            pts.push([((cell[0] + 1) / 100) * docW, zn.top + cell[1] + 10, w]);
            st.drawn += w;
          }
        }
      }
      drawDensity(doc, root, pts, navPts, navBox, zones, docW, docH, LUT, st);
      for (const z of zones.values()) {
        const t = doc.createElement('span');
        t.className = 'zl';
        t.style.top = `${z.top + 8}px`;
        t.textContent = L.zone(z.id);
        root.append(t);
      }
    }
    if (selected) outline(doc, root, selected, sx, sy);
    if (run !== painting) return;
    status(st);
    // the table tags say where each element's clicks go on this page at this width, whatever the layer shown
    const where = new Map();
    const zoneOk = new Set(data.zcells.filter((z) => zones.has(z.z) && !SCRUBBED.includes(z.z) && !FIXED_IDS.has(z.z)).map((z) => z.b));
    for (const e of data.elements) {
      if (where.has(e.sel)) continue;
      const r = resolve(e.sel);
      where.set(e.sel, r.place ? 'el' : (zoneOk.has(e.sel) || (e.sec === 'nav' && navBox)) ? 'zone' : '');
    }
    markHidden(where);
  }

  function field(points, w, h) {
    const gw = Math.max(1, Math.ceil(w / G)), gh = Math.max(1, Math.ceil(h / G));
    const f = new Float32Array(gw * gh);
    const kernels = new Map();     // blob radius (CSS px, a multiple of G) → [dx, dy, weight]
    const kernel = (r) => {
      const rk = Math.max(R, Math.round(r / G) * G);
      if (kernels.has(rk)) return kernels.get(rk);
      const kr = Math.ceil(rk / G), ker = [];
      for (let dy = -kr; dy <= kr; dy++) for (let dx = -kr; dx <= kr; dx++) { const d = Math.hypot(dx, dy) * G; if (d < rk) ker.push([dx, dy, (1 - (d / rk) ** 2) ** 2]); }
      kernels.set(rk, ker);
      return ker;
    };
    for (const [x, y, wt, r] of points) {
      const gx = Math.round(x / G), gy = Math.round(y / G);
      for (const [dx, dy, k] of kernel(r || R)) {
        const X = gx + dx, Y = gy + dy;
        if (X < 0 || Y < 0 || X >= gw || Y >= gh) continue;
        f[Y * gw + X] += wt * k;
      }
    }
    return { f, gw, gh };
  }
  // each click adds an alpha blob (0.18 at its centre, SPEC 5.7) and blobs pile up: 1 − (1 − a)^v, v = clicks there
  function blit(doc, parent, F, a, LUT, y0, y1, css) {
    const la = Math.log(1 - a);
    const r0 = Math.max(0, Math.floor(y0 / G)), r1 = Math.min(F.gh, Math.ceil(y1 / G));
    if (r1 <= r0) return;
    const cv = doc.createElement('canvas');
    cv.width = F.gw; cv.height = r1 - r0;
    const c2 = cv.getContext('2d');
    const img = c2.createImageData(F.gw, r1 - r0);
    let anyPx = false;
    for (let y = r0; y < r1; y++) {
      for (let x = 0; x < F.gw; x++) {
        const v = F.f[y * F.gw + x];
        if (v <= 0) continue;
        const i = Math.min(255, Math.round(255 * (1 - Math.exp(la * v))));
        if (i < 3) continue;
        const o = ((y - r0) * F.gw + x) * 4;
        img.data[o] = LUT[i * 4]; img.data[o + 1] = LUT[i * 4 + 1]; img.data[o + 2] = LUT[i * 4 + 2]; img.data[o + 3] = LUT[i * 4 + 3];
        anyPx = true;
      }
    }
    if (!anyPx) return;
    c2.putImageData(img, 0, 0);
    Object.assign(cv.style, css || {}, { top: `${r0 * G}px`, width: `${F.gw * G}px`, height: `${(r1 - r0) * G}px` });
    parent.append(cv);
  }
  function drawDensity(doc, root, pts, navPts, navBox, zones, docW, docH, LUT, st) {
    const F = field(pts, docW, docH);
    const N = navBox && navPts.length ? field(navPts.map(([x, y, w]) => [x - navBox.left, y - navBox.top, w]), navBox.width, navBox.height) : null;
    let max = 0;
    for (const v of F.f) if (v > max) max = v;
    if (N) for (const v of N.f) if (v > max) max = v;
    st.max = max;
    if (!max) return;
    // the alpha per click adapts to the amount of data: the busiest tenth of the page reaches 80 %. With a few clicks
    // one click alone shows clearly; with thousands, busy places do not all saturate (0.18 is what p90 ≈ 8 gives)
    const nz = []; for (const v of F.f) if (v > 0.05) nz.push(v);
    if (N) for (const v of N.f) if (v > 0.05) nz.push(v);
    nz.sort((p, q) => p - q);
    const p90 = nz.length ? nz[Math.floor(nz.length * 0.9)] : 1;
    const a = 1 - Math.pow(0.2, 1 / Math.max(1, p90));
    st.alpha = a;
    // one canvas per zone, plus the gaps between zones, so the whole page is covered without seams
    const cuts = [...zones.values()].sort((a, b) => a.top - b.top);
    let y = 0;
    for (const z of cuts) {
      const t = Math.max(y, z.top), b = Math.max(t, z.bottom);
      if (t > y) blit(doc, root, F, a, LUT, y, t);
      if (b > t) blit(doc, root, F, a, LUT, t, b);
      y = Math.max(y, b);
    }
    if (y < docH) blit(doc, root, F, a, LUT, y, docH);
    if (N) {
      const holder = doc.createElement('div');
      holder.className = 'fx';
      Object.assign(holder.style, { left: `${navBox.left}px`, top: `${navBox.top}px`, width: `${navBox.width}px`, height: `${navBox.height}px`, overflow: 'hidden' });
      blit(doc, holder, N, a, LUT, 0, navBox.height);
      root.append(holder);
    }
  }
  function drawScroll(doc, root, docW, docH, LUT, st) {
    const n = data.scroll || [];
    const tot = n.reduce((a, b) => a + b, 0);
    if (!tot) return;
    const reach = (d) => { let s = 0; for (let j = d / 5; j < n.length; j++) s += n[j]; return s / tot; };
    for (let i = 0; i < 20; i++) {
      const r = reach(i * 5);
      const seg = doc.createElement('div');
      seg.className = 'band';
      Object.assign(seg.style, { top: `${(i * docH) / 20}px`, height: `${docH / 20 + 1}px`, background: rgbOf(LUT, Math.round(r * 255)) });
      root.append(seg);
    }
    for (const T of [0.75, 0.5, 0.25]) {
      let d = null;
      for (let k = 0; k <= 100; k += 5) if (reach(k) < T) { d = k; break; }
      if (d === null) continue;
      const hl = doc.createElement('div');
      hl.className = 'hl';
      hl.style.top = `${(d / 100) * docH}px`;
      const s = doc.createElement('span');
      s.textContent = `${Math.round(T * 100)} % chegam aqui`;
      hl.append(s);
      root.append(hl);
    }
    const fold = doc.createElement('div');
    fold.className = 'hl fold';
    fold.style.top = `${st.vh}px`;
    const fs = doc.createElement('span');
    fs.textContent = 'Fim do primeiro ecrã';
    fold.append(fs);
    root.append(fold);
    st.scroll = true;
  }
  function drawAttention(doc, root, zones, LUT, st) {
    const att = data.attention || [];
    const max = Math.max(0.0001, ...att.map((a) => a.share));
    for (const a of att) {
      const z = zones.get(a.z);
      if (!z) continue;
      const t = doc.createElement('div');
      t.className = 'tint';
      Object.assign(t.style, { top: `${z.top}px`, height: `${z.height}px`, background: rgbOf(LUT, Math.round((a.share / max) * 255)) });
      root.append(t);
      const screens = z.height / st.vh;
      const per = a.reached && screens ? a.sec / a.reached / screens : null;
      const ch = doc.createElement('div');
      ch.className = 'ch';
      ch.style.top = `${z.top + 10}px`;
      ch.textContent = `${L.zone(a.z)} · ${fmt.pct(a.share)} do tempo`;
      const sm = doc.createElement('small');
      sm.textContent = per !== null ? `${fmt.dur(per)} por ecrã · ${fmt.n(a.reached)} chegaram` : 'ninguém chegou aqui';
      ch.append(sm);
      root.append(ch);
    }
    st.att = true;
  }
  function outline(doc, root, sel, sx, sy) {
    const node = query(doc, sel);
    if (!node || !placeOf(node, frame.contentWindow)) return;
    const b = node.getBoundingClientRect();
    const fixed = zoneOf(node) === 'nav';
    const ox = fixed ? 0 : sx, oy = fixed ? 0 : sy;
    const o = doc.createElement('div');
    o.className = `ol${fixed ? ' fx' : ''}`;
    Object.assign(o.style, { left: `${b.left + ox - 3}px`, top: `${b.top + oy - 3}px`, width: `${b.width + 6}px`, height: `${b.height + 6}px` });
    root.append(o);
    const c = (data.cells || []).find((x) => x.b === sel);
    if (!c) return;
    const mx = Math.max(1, ...c.c.map((x) => x[2]));
    for (const [cx, cy, n] of c.c) {
      const d = doc.createElement('div');
      d.className = `cell${fixed ? ' fx' : ''}`;
      Object.assign(d.style, { left: `${b.left + ox + (cx * b.width) / 20}px`, top: `${b.top + oy + (cy * b.height) / 20}px`, width: `${b.width / 20}px`, height: `${b.height / 20}px`, opacity: String(0.25 + 0.7 * (n / mx)) });
      root.append(d);
    }
  }

  function status(st) {
    const pv = data.pvBucket;
    const b = BUCKETS[hm.vw];
    const parts = [`${fmt.n(pv)} visualizações a ${b[3]} px`];
    let leg = null;
    if (hm.layer === 'scroll') { parts.push('a faixa à esquerda mostra quantos chegam a cada altura'); leg = ['chegam aqui: 0 %', '100 %']; }
    else if (hm.layer === 'attention') { parts.push('cada secção pintada pela parte do tempo que lá passaram'); leg = ['menos tempo', 'mais tempo']; }
    else {
      parts.push(`${fmt.n(st.drawn)} ${hm.layer === 'clicks' ? 'cliques' : 'cliques marcados'} no mapa`);
      if (st.hidden) parts.push(`${fmt.n(st.hidden)} noutros sítios (camadas fixas, partes animadas ou não visíveis nesta largura: estão na tabela)`);
      const what = hm.layer === 'clicks' ? 'cliques' : 'cliques marcados';
      leg = [`menos ${what}`, st.max ? `mais (até ${fmt.n(Math.max(1, Math.round(st.max)))} no mesmo sítio)` : 'mais'];
    }
    el.status.replaceChildren();
    H('b', null, parts[0], el.status);
    el.status.append(document.createTextNode(` · ${parts.slice(1).join(' · ')}.`));
    el.legend.replaceChildren();
    if (leg) {
      const L4 = lut();
      H('span', null, leg[0], el.legend);
      const bar = H('span', 'ga-ramp', null, el.legend);
      const stops = [0, 64, 128, 192, 255].map((i) => `${rgbOf(L4, i)} ${Math.round((i / 255) * 100)}%`);
      bar.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
      H('span', null, leg[1], el.legend);
    }
  }

  // ---------- tables ----------
  const KNOWN = { '#stage > canvas': 'O fato em 3D (toques no modelo)', '#stage-h > canvas': 'O capacete em 3D (toques no modelo)', '#hero-spots': 'Número de espaços livres (início)' };
  const labelOf = (e) => {
    if (KNOWN[e.sel]) return KNOWN[e.sel];
    const lab = e.lab || '';
    if (KEY_RE.test(lab)) return ctx.pageText(lab) || lab;
    if (lab) return lab;
    // no text of its own (a photo, a title made of letters, a block): say what it is, and which one
    const tail = (e.sel || '').split(/\s*>\s*|\s+/).pop() || '';
    const tag = (tail.match(/^[a-z0-9]+/) || [''])[0];
    const nth = (tail.match(/:nth-of-type\((\d+)\)/) || [])[1];
    const KIND = { img: 'Imagem', picture: 'Imagem', figure: 'Fotografia', video: 'Vídeo', canvas: 'Desenho', svg: 'Gráfico', g: 'Gráfico', h1: 'Título', h2: 'Título', h3: 'Título', p: 'Texto', li: 'Linha de uma lista', dl: 'Números', dt: 'Números', dd: 'Números', a: 'Ligação', button: 'Botão' };
    const kind = KIND[tag] || (tag ? 'Bloco' : '');
    return kind ? `${kind}${nth ? ` n.º ${nth}` : ''}` : e.sel || '—';
  };
  // a table row says when its clicks are not on the map at this width, or only by their place in the section
  let drawnMap = new Map();
  const tagText = (e) => {
    const how = drawnMap.get(e.sel);
    if (how === 'el') return '';
    if (FIXED_IDS.has(e.sec) && e.sec !== 'nav') return 'camada fixa: só na tabela';
    if (how === 'zone') return 'no mapa pela posição na secção';
    return SCRUBBED.includes(e.sec) ? 'parte animada: só na tabela' : 'não está à vista nesta largura';
  };
  function markHidden(where) {
    drawnMap = where;
    for (const tag of el.tables.querySelectorAll('[data-sel]')) { const t = tagText({ sel: tag.dataset.sel, sec: tag.dataset.sec }); tag.textContent = t; tag.hidden = !t; }
  }
  function selectEl(sel) {
    selected = selected === sel ? null : sel;
    for (const tr of el.tables.querySelectorAll('tr[data-row]')) tr.classList.toggle('sel', tr.dataset.row === selected);
    if (selected && frame && hm.vw !== 'all') {
      const node = query(frame.contentDocument, selected);
      if (node && placeOf(node, frame.contentWindow) === 'doc') node.scrollIntoView({ block: 'center' });
      setTimeout(paint, 450);
    } else paint();
  }
  function elementCell(e) {
    const f = document.createDocumentFragment();
    const b = H('button', 'ga-rowbtn', labelOf(e), f);
    b.type = 'button';
    b.title = e.sel;
    b.addEventListener('click', () => selectEl(e.sel));
    H('span', 'sub', `${L.zone(e.sec)}${e.ia ? '' : ' · não é um botão nem uma ligação'}`, f);
    const t = hm.vw === 'all' ? '' : tagText(e);
    const tag = H('span', 'hm-tag', t, f);
    tag.dataset.sel = e.sel;
    tag.dataset.sec = e.sec || '';
    tag.hidden = !t;
    return f;
  }
  function tables() {
    el.tables.replaceChildren();
    if (!data || !data.enough) return;
    const els = data.elements || [];
    const pv = data.pvBucket || 1;
    const bySel = new Map(els.map((e) => [e.sel, e]));
    const tcard = (title, note, cls) => { const c = H('section', `card ga-card ${cls || ''}`, null, el.tables); const h = H('header', null, null, c); H('h3', null, title, h); if (note) H('p', 'ga-note', note, h); return c; };
    const c1 = tcard('Elementos mais carregados', 'Carrega num elemento para o ver na página, com os cliques nas partes dele.', 'wide');
    if (els.length) {
      const LIMIT = 25;
      const holder = H('div', null, null, c1);
      const paintT = (all) => {
        const rows = all ? els : els.slice(0, LIMIT);
        const t = table({ cols: [
          { l: 'Elemento', k: 'lab', cls: 'wrap', node: elementCell, sort: (e) => labelOf(e) },
          { l: 'Cliques', k: 'n', num: true, fmt: fmt.n }, { l: '% das visualizações', get: (e) => e.u / pv, num: true, fmt: fmt.pct },
          { l: 'Sem resposta', k: 'dead', num: true, fmt: fmt.n }, { l: 'Repetidos', k: 'rage', num: true, fmt: fmt.n }], rows: rows.map((e) => ({ ...e, _cls: e.sel === selected ? 'sel' : '' })) });
        [...t.querySelectorAll('tbody tr')].forEach((tr, i) => { tr.dataset.row = rows[i].sel; });
        holder.replaceChildren(t);
        if (!all && els.length > LIMIT) { const m = H('button', 'btn sm ghost ga-more', `Ver todos (${els.length})`, holder); m.type = 'button'; m.addEventListener('click', () => paintT(true)); }
      };
      paintT(false);
    } else emptyState(c1, 'Ainda sem cliques nesta largura.');
    const flagged = data.flagged || { dead: [], rage: [], err: [] };
    const flagT = (title, note, rows, extra = []) => {
      const c = tcard(title, note);
      if (!rows.length) { emptyState(c, 'Nenhum neste período.'); return; }
      c.append(table({ initial: { k: 'n', dir: 'descending' }, cols: [
        { l: 'Elemento', cls: 'wrap', node: (r) => elementCell(bySel.get(r.k) || { sel: r.k, lab: '', sec: '' }), sort: (r) => labelOf(bySel.get(r.k) || { sel: r.k }) },
        ...extra, { l: 'Cliques', k: 'n', num: true, fmt: fmt.n }, { l: 'Visualizações', k: 'u', num: true, fmt: fmt.n }], rows }));
    };
    flagT('Cliques sem resposta', 'Cliques em algo que não é botão nem ligação e onde nada aconteceu em 1 segundo: as pessoas acharam que dava.', flagged.dead);
    flagT('Cliques repetidos', '3 cliques seguidos no mesmo sítio em menos de 1 segundo: sinal de frustração.', flagged.rage);
    flagT('Cliques com erro', 'Cliques logo seguidos de um erro, ou de um aviso de erro na página.', flagged.err, [{ l: 'Erro', get: (r) => L.CLICKERR[r.code] || r.code }]);
    const fx = data.fixed || [];
    const c5 = tcard('Camadas fixas', 'Menu do topo, barra do pacote, ficha do espaço no telemóvel, janela de reserva e pergunta rápida. Por cima da página só se desenha o menu do topo.');
    if (fx.length) c5.append(table({ initial: { k: 'n', dir: 'descending' }, cols: [{ l: 'Camada', get: (r) => L.zone(r.layer) }, { l: 'Elemento', cls: 'wrap', get: (r) => labelOf(r) }, { l: 'Cliques', k: 'n', num: true, fmt: fmt.n }, { l: 'Sem resposta', k: 'dead', num: true, fmt: fmt.n }, { l: 'Repetidos', k: 'rage', num: true, fmt: fmt.n }], rows: fx }));
    else emptyState(c5, 'Nenhum clique nas camadas fixas.');
  }

  return {
    async open(p) {
      if (!panel) build(p);
      const by = await counts();
      // the default width is the one with the most page views in the period (SPEC 5.7)
      if (!hm.vw) {
        let best = 'm', bn = -1;
        for (const k of Object.keys(BUCKETS)) { const n = by.get(k) || 0; if (n > bn) { bn = n; best = k; } }
        hm.vw = best;
        ctx.save();
      }
      for (const r of el.width.fs.querySelectorAll('input')) r.checked = r.value === hm.vw;
      fitFrame();
      const key = JSON.stringify({ ...ctx.params(), vw: hm.vw });
      if (key !== dataKey) await load();
      else paint();
    },
    refresh() { dataKey = ''; if (panel && !panel.hidden) { counts(); load(); } },
    repaint() { if (panel && !panel.hidden && data) { tables(); paint(); } },
  };
}
