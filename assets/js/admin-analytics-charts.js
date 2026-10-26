// SVG chart kit for /admin/analytics/ (SPEC 5.5), no library. Every chart is a <figure class="card"> with a title, a
// one-line note, the SVG (role="img" with a summary), a «Ver tabela» twin, one shared tooltip (hover and keyboard focus,
// values first) and an empty state. Colours come from CSS classes over the tokens in admin-analytics.css only.
// Labels from the API always go in through textContent / createTextNode, never innerHTML.

const NS = 'http://www.w3.org/2000/svg';

// ---------- DOM ----------
export function H(tag, cls, text, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  if (parent) parent.append(e);
  return e;
}
export function S(tag, attrs, parent) {
  const e = document.createElementNS(NS, tag);
  if (attrs) for (const k in attrs) if (attrs[k] !== undefined && attrs[k] !== null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
  if (parent) parent.append(e);
  return e;
}
const T = (parent, x, y, text, cls, anchor) => { const t = S('text', { x, y, class: cls, 'text-anchor': anchor }, parent); t.textContent = text; return t; };

// ---------- numbers, durations, dates (pt-PT) ----------
const NF = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 });
const NF1 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 });
const CF = new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 });
const MON = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
export const fmt = {
  n: (v) => (v === null || v === undefined || Number.isNaN(v) ? '—' : Math.abs(v) >= 10000 ? CF.format(v) : NF.format(Math.round(v))),
  n1: (v) => (v === null || v === undefined ? '—' : NF1.format(v)),
  pct: (r) => {
    if (r === null || r === undefined || Number.isNaN(r)) return '—';
    const p = r * 100;
    return `${(p !== 0 && Math.abs(p) < 10 ? NF1 : NF).format(p)} %`;
  },
  dur: (s) => {
    if (s === null || s === undefined || Number.isNaN(s)) return '—';
    s = Math.round(s);
    if (s < 60) return `${s} s`;
    const m = Math.floor(s / 60), r = s % 60;
    return m >= 10 ? `${m} min` : `${m} min ${String(r).padStart(2, '0')} s`;
  },
  ms: (v) => (v === null || v === undefined ? '—' : v >= 1000 ? `${NF1.format(v / 1000)} s` : `${NF.format(v)} ms`),
  cls: (v) => (v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(v)),
  bytes: (b) => (b >= 1e9 ? `${NF1.format(b / 1e9)} GB` : b >= 1e6 ? `${NF1.format(b / 1e6)} MB` : `${NF.format(b / 1e3)} KB`),
  day: (d, year) => {
    if (!d) return '—';
    const [y, m, dd] = d.split('-').map(Number);
    return `${dd} ${MON[m - 1]}${year ? ` ${y}` : ''}`;
  },
  // «16–22 out. 2026», «28 set.–4 out. 2026», «28 dez. 2025–3 jan. 2026»
  range: (a, b, year = true) => {
    if (!a || !b) return '—';
    if (a === b) return fmt.day(a, year);
    const [ya, ma] = a.split('-').map(Number), [yb, mb] = b.split('-').map(Number);
    const da = Number(a.slice(8)), db = Number(b.slice(8));
    if (ya !== yb) return `${fmt.day(a, true)}–${fmt.day(b, true)}`;
    if (ma === mb) return `${da}–${db} ${MON[mb - 1]}${year ? ` ${yb}` : ''}`;
    return `${fmt.day(a)}–${fmt.day(b)}${year ? ` ${yb}` : ''}`;
  },
  week: (w) => { const m = /^(\d{4})-W(\d{2})$/.exec(w || ''); return m ? `semana ${Number(m[2])}` : w; },
};
export const MONTHS = MON;

// ---------- text measuring (for truncation and label fitting) ----------
let mctx = null;
export function textW(s, size = 13, weight = 400) {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  mctx.font = `${weight} ${size}px Inter, system-ui, -apple-system, "Segoe UI", sans-serif`;
  return mctx.measureText(String(s)).width;
}
export function fit(s, w, size = 13, weight = 400) {
  s = String(s);
  if (textW(s, size, weight) <= w) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (textW(`${s.slice(0, m)}…`, size, weight) <= w) lo = m; else hi = m - 1; }
  return lo ? `${s.slice(0, lo).trimEnd()}…` : '';
}

// clean ticks from 0 to at least max
export function ticks(max, n = 4, integer = true) {
  if (!(max > 0)) return [0, 1];
  let raw = max / n;
  if (integer && raw < 1) raw = 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw - 1e-12 && (!integer || Number.isInteger(s) || s >= 1));
  const top = Math.ceil(max / step - 1e-9) * step;
  const out = [];
  for (let i = 0; i * step <= top + 1e-9; i++) out.push(Math.round(i * step * 1e6) / 1e6);
  return out;
}

// colour of ink that clears a fill (inline labels inside a stacked segment)
const tokenCache = new Map();
export function resetTokens() { tokenCache.clear(); }
export function token(name) {
  if (tokenCache.has(name)) return tokenCache.get(name);
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  tokenCache.set(name, v);
  return v;
}
const CLS2VAR = { f1: '--series-1', f2: '--series-2', f3: '--series-3', f4: '--series-4', f5: '--series-5', f6: '--series-6', f7: '--series-7', fo: '--other',
  o0: '--ord-0', o1: '--ord-1', o2: '--ord-2', o3: '--ord-3', o4: '--ord-4', o5: '--ord-5', o6: '--ord-6', sg: '--st-good', sw: '--st-warn', ss: '--st-serious', sc: '--st-critical' };
export function hexRgb(h) { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return [128, 128, 128]; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function lum(rgb) { const c = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
export function inkOn(cls) { const L = lum(hexRgb(token(CLS2VAR[cls] || '--series-1'))); return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? 'dk' : 'lt'; }

// ---------- the one tooltip ----------
let tipEl = null, tipAnchor = null, tipOwner = null;
export const tip = {
  // at: a pointer position {x, y}, or the element the readout belongs to (keyboard focus): then it follows that element
  show(content, at, owner) {
    tipEl = tipEl || document.getElementById('tip');
    if (!tipEl || !content) return;
    tipAnchor = at && at.getBoundingClientRect ? at : null;
    tipOwner = owner || null;
    if (tipAnchor) at = tipAnchor.getBoundingClientRect();
    tipEl.replaceChildren();
    if (content.h) H('span', 'h', content.h, tipEl);
    for (const r of content.rows || []) {
      const row = H('div', 'r', null, tipEl);
      if (r.k) H('i', r.k, null, row);
      H('b', null, r.v, row);
      if (r.l) H('span', null, r.l, row);
    }
    tipEl.hidden = false;
    const w = tipEl.offsetWidth, h = tipEl.offsetHeight, vw = window.innerWidth, vh = window.innerHeight;
    let x, y;
    if (at && 'width' in at) { x = at.left + at.width / 2 - w / 2; y = at.top - h - 8; if (y < 8) y = at.bottom + 8; }
    else { x = at.x + 14; y = at.y - h - 12; if (x + w > vw - 8) x = at.x - w - 14; if (y < 8) y = at.y + 18; }
    x = Math.max(8, Math.min(vw - w - 8, x)); y = Math.max(8, Math.min(vh - h - 8, y));
    tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  },
  hide() { if (tipEl) tipEl.hidden = true; tipAnchor = null; tipOwner = null; },
  // keep a keyboard readout beside its mark when the page scrolls (focusing a chart scrolls it into view)
  follow() {
    if (!tipEl || tipEl.hidden) return;
    if (tipAnchor && tipOwner && document.activeElement === tipOwner) {
      const b = tipAnchor.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      let x = b.left + b.width / 2 - w / 2, y = b.top - h - 8;
      if (y < 8) y = b.bottom + 8;
      x = Math.max(8, Math.min(window.innerWidth - w - 8, x)); y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
      tipEl.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    } else tip.hide();
  },
};
addEventListener('scroll', () => tip.follow(), { passive: true, capture: true });
addEventListener('keydown', (e) => { if (e.key === 'Escape') tip.hide(); });

// marks: [{ hit, els: [], tip: () => content }]; pointer and keyboard (arrows) over the same list
export function interact(svg, marks, { onIndex } = {}) {
  if (!marks.length) return;
  let cur = -1;
  const set = (i, at) => {
    if (cur >= 0 && marks[cur]) for (const e of marks[cur].els || []) e.classList.remove('on');
    cur = i;
    if (i < 0) { tip.hide(); if (onIndex) onIndex(-1); return; }
    const m = marks[i];
    for (const e of m.els || []) e.classList.add('on');
    if (onIndex) onIndex(i);
    tip.show(m.tip(), at || m.anchor || m.hit, svg);
  };
  marks.forEach((m, i) => {
    if (!m.hit) return;
    m.hit.addEventListener('pointermove', (e) => set(i, { x: e.clientX, y: e.clientY }));
    m.hit.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') set(i, { x: e.clientX, y: e.clientY }); });
    m.hit.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && cur === i) set(-1); });
  });
  svg.setAttribute('tabindex', '0');
  svg.addEventListener('focus', () => set(cur >= 0 ? cur : 0));
  svg.addEventListener('blur', () => set(-1));
  svg.addEventListener('keydown', (e) => {
    const n = marks.length;
    const k = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (k) { e.preventDefault(); set(((cur < 0 ? 0 : cur + k) + n) % n); }
    else if (e.key === 'Home') { e.preventDefault(); set(0); }
    else if (e.key === 'End') { e.preventDefault(); set(n - 1); }
    else if (e.key === 'Escape') set(-1);
  });
}
// a touch outside any chart closes the tooltip
addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse' && !e.target.closest?.('.ga-svg')) tip.hide(); }, { passive: true });

// ---------- figure: the card every chart lives in ----------
const plots = new Map();
const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver((entries) => {
  for (const en of entries) { const f = plots.get(en.target); if (f) f(); }
}) : null;
export function redrawAll() { for (const f of plots.values()) f(true); }

export function emptyState(parent, text, retry) {
  const box = H('div', 'ga-empty', null, parent);
  H('p', null, text, box).className = '';
  if (retry) {
    const b = H('button', 'btn sm ghost', 'Tentar outra vez', box);
    b.type = 'button';
    b.addEventListener('click', retry);
  }
  return box;
}
export function legend(items, parent) {
  const ul = H('ul', 'ga-legend', null, parent);
  for (const it of items) { const li = H('li', null, null, ul); H('i', `${it.line ? 'ln ' : ''}${it.key}`, null, li); H('span', null, it.label, li); }
  return ul;
}

// o: { title, note, chip, cls, legend, empty, draw(width) → { svg, summary }, table: () => spec, foot, extra }
export function figure(o) {
  const fig = H('figure', `card ga-card ${o.cls || ''}`);
  const cap = H('figcaption', null, null, fig);
  const h3 = H('h3', null, null, cap);
  H('span', null, o.title, h3);
  if (o.chip) H('span', 'ga-chip', o.chip, h3);
  if (o.note) H('p', 'ga-note', o.note, cap);
  if (o.before) fig.append(o.before);
  if (o.empty) { emptyState(fig, o.empty, o.retry); return fig; }
  if (o.legend && o.legend.length) legend(o.legend, fig);
  const plot = H('div', 'ga-plot', null, fig);
  const twin = H('div', 'ga-twin', null, fig);
  twin.hidden = true;
  if (o.after) fig.append(o.after);
  const foot = H('div', 'ga-cardfoot', null, fig);
  let lastW = 0;
  const draw = (force) => {
    if (plot.hidden || !plot.isConnected) return;
    const w = Math.floor(plot.clientWidth);
    if (!w || (w === lastW && !force && plot.firstChild)) return;
    lastW = w;
    const r = o.draw(w);
    if (!r) return;
    r.svg.classList.add('ga-svg');
    r.svg.setAttribute('role', 'img');
    r.svg.setAttribute('aria-label', r.summary || o.title);
    plot.replaceChildren(r.svg);
  };
  if (o.table) {
    const b = H('button', 'ga-tt', 'Ver tabela', foot);
    b.type = 'button';
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      const on = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(on));
      b.textContent = on ? 'Ver gráfico' : 'Ver tabela';
      if (on) twin.replaceChildren(table(o.table()));
      twin.hidden = !on;
      plot.hidden = on;
      if (!on) draw(true);
    });
  }
  if (o.foot) H('p', 'ga-foot-note', o.foot, foot);
  plots.set(plot, draw);
  if (ro) ro.observe(plot);
  fig.redraw = () => draw(true);
  return fig;
}
// figures leave the page when a panel re-renders: forget their plots
export function forget(root) {
  for (const p of root.querySelectorAll('.ga-plot')) { plots.delete(p); if (ro) ro.unobserve(p); }
}

// ---------- table (the accessible twin, and the long tails) ----------
// spec: { caption, cols: [{ l, k, num, fmt, get, node, sort }], rows, sort: true, initial: { k, dir } }
export function table(spec) {
  const wrap = H('div', 'ga-tw');
  const t = H('table', 'ga-table', null, wrap);
  if (spec.caption) H('caption', null, spec.caption, t);
  const thead = H('thead', null, null, t), tr = H('tr', null, null, thead);
  const tbody = H('tbody', null, null, t);
  const val = (c, r) => (c.get ? c.get(r) : r[c.k]);
  let order = spec.initial || null;
  const ths = spec.cols.map((c) => {
    const th = H('th', c.num ? 'n' : null, null, tr);
    th.scope = 'col';
    if (spec.sort !== false && !c.nosort) {
      const b = H('button', null, c.l, th);
      b.type = 'button';
      b.addEventListener('click', () => {
        order = { k: c, dir: order && order.k === c && order.dir === 'descending' ? 'ascending' : 'descending' };
        paint();
      });
    } else th.textContent = c.l;
    return th;
  });
  function paint() {
    let rows = spec.rows.slice();
    if (order && order.k) {
      const c = typeof order.k === 'string' ? spec.cols.find((x) => x.k === order.k) : order.k;
      if (c) {
        const sv = (r) => (c.sort ? c.sort(r) : val(c, r));
        rows.sort((a, b) => { const x = sv(a), y = sv(b); const d = typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''), 'pt'); return order.dir === 'ascending' ? d : -d; });
        ths.forEach((th, i) => { if (spec.cols[i] === c) th.setAttribute('aria-sort', order.dir); else th.removeAttribute('aria-sort'); });
      }
    }
    tbody.replaceChildren();
    for (const r of rows) {
      const row = H('tr', r._cls || null, null, tbody);
      spec.cols.forEach((c, i) => {
        const td = H(i === 0 && !c.num ? 'th' : 'td', c.num ? 'n' : c.cls || null, null, row);
        if (i === 0 && !c.num) td.scope = 'row';
        if (c.node) { const n = c.node(r); if (n) td.append(n); }
        else { const v = val(c, r); td.textContent = c.fmt ? c.fmt(v, r) : v === null || v === undefined ? '—' : String(v); }
      });
    }
  }
  paint();
  wrap.repaint = paint;
  return wrap;
}

// ---------- marks ----------
const hbarPath = (x, y, w, h, r = 4) => {
  if (w <= 0) return '';
  r = Math.min(r, w, h / 2);
  return `M${x} ${y}h${w - r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - r)}z`;
};
const vbarPath = (x, y, w, h, r = 4) => {
  if (h <= 0) return '';
  r = Math.min(r, h, w / 2);
  return `M${x} ${y + h}v${-(h - r)}a${r} ${r} 0 0 1 ${r} ${-r}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - r}z`;
};

// horizontal bars, top N + «Outros» (one slot-1 colour: nominal categories never take a value ramp)
// rows: [{ label, v, text?, other?, cls?, tip? }]; o: { fmt, max, wide, valueW }
export function hbars(rows, o = {}) {
  const f = o.fmt || fmt.n;
  return (width) => {
    const svg = S('svg');
    const wide = width >= (o.wideAt || 520);
    const texts = rows.map((r) => r.text ?? f(r.v));
    const valueW = Math.max(...texts.map((t) => textW(t, 13, 600)), 20) + 10;
    const labelW = wide ? Math.min(Math.max(...rows.map((r) => textW(r.label, 13))) + 12, width * 0.42, o.labelMax || 240) : 0;
    const x0 = wide ? labelW : 0, barMax = Math.max(10, width - x0 - valueW);
    const rowH = wide ? 30 : 42, barH = wide ? 14 : 12;
    const max = o.max || Math.max(...rows.map((r) => r.v || 0), 1);
    const marks = [];
    rows.forEach((r, i) => {
      const y = i * rowH;
      const g = S('g', null, svg);
      let by;
      if (wide) { by = y + (rowH - barH) / 2; T(g, 0, y + rowH / 2 + 4.5, fit(r.label, labelW - 12), 'ga-lb'); }
      else { by = y + 20; T(g, 0, y + 14, fit(r.label, width - valueW - 4), 'ga-lb'); }
      const w = r.v > 0 ? Math.max(2, (r.v / max) * barMax) : 0;
      const bar = S('path', { d: hbarPath(x0, by, w, barH), class: `ga-m ${r.other ? 'fo' : r.cls || 'f1'}` }, g);
      T(g, x0 + w + 6, by + barH / 2 + 4.5, texts[i], 'ga-vl');
      const hit = S('rect', { x: 0, y, width, height: rowH, class: 'ga-hit' }, g);
      marks.push({ hit, els: [bar], anchor: bar.getTotalLength ? bar : hit, tip: () => (r.tip ? r.tip() : { h: r.label, rows: [{ v: texts[i], l: o.unit || '' }] }) });
    });
    svg.setAttribute('viewBox', `0 0 ${width} ${rows.length * rowH}`);
    svg.setAttribute('height', rows.length * rowH);
    interact(svg, marks);
    const top = rows.filter((r) => !r.other).sort((a, b) => (b.v || 0) - (a.v || 0))[0];
    return { svg, summary: top ? `${rows.length} linhas; a maior é ${top.label}, com ${top.text ?? f(top.v)}.` : 'Sem dados.' };
  };
}

// grouped horizontal bars: rows [{ label, vals: [a, b] }], series [{ label, cls }]
export function grouped(rows, series, o = {}) {
  const f = o.fmt || fmt.n;
  return (width) => {
    const svg = S('svg');
    const wide = width >= 520;
    const k = series.length, barH = 10, gap = 2;
    const groupH = k * barH + (k - 1) * gap;
    const valueW = Math.max(...rows.flatMap((r) => r.vals.map((v) => textW(f(v), 12, 600))), 20) + 10;
    const labelW = wide ? Math.min(Math.max(...rows.map((r) => textW(r.label, 13))) + 12, width * 0.4, 220) : 0;
    const x0 = wide ? labelW : 0, barMax = Math.max(10, width - x0 - valueW);
    const rowH = wide ? groupH + 16 : groupH + 30;
    const max = o.max || Math.max(1, ...rows.flatMap((r) => r.vals));
    const marks = [];
    rows.forEach((r, i) => {
      const y = i * rowH, g = S('g', null, svg);
      const by = wide ? y + (rowH - groupH) / 2 : y + 20;
      T(g, 0, wide ? y + rowH / 2 + 4.5 : y + 14, fit(r.label, wide ? labelW - 12 : width - 8), 'ga-lb');
      const els = [];
      r.vals.forEach((v, j) => {
        const w = v > 0 ? Math.max(2, (v / max) * barMax) : 0;
        const yy = by + j * (barH + gap);
        els.push(S('path', { d: hbarPath(x0, yy, w, barH, 3), class: `ga-m ${series[j].cls}` }, g));
        T(g, x0 + w + 5, yy + barH / 2 + 4, f(v), 'ga-vl ga-in');
      });
      const hit = S('rect', { x: 0, y, width, height: rowH, class: 'ga-hit' }, g);
      marks.push({ hit, els, tip: () => ({ h: r.label, rows: r.vals.map((v, j) => ({ v: f(v), l: series[j].label, k: series[j].key })) }) });
    });
    svg.setAttribute('viewBox', `0 0 ${width} ${rows.length * rowH}`);
    svg.setAttribute('height', rows.length * rowH);
    interact(svg, marks);
    return { svg, summary: `${rows.length} linhas, ${series.map((s) => s.label).join(' e ')}.` };
  };
}

// 100 % stacked horizontal bars: rows [{ label, parts: [n…] }], segs [{ label, cls }]. With o.absolute the bars share
// one scale (the biggest total) and carry the total at the tip instead of shares inside.
export function stack100(rows, segs, o = {}) {
  return (width) => {
    const svg = S('svg');
    const wide = width >= 560 && !o.narrow;
    const labelW = wide ? Math.min(Math.max(...rows.map((r) => textW(r.label, 13))) + 14, width * 0.34, 200) : 0;
    const totals = rows.map((r) => r.parts.reduce((a, b) => a + (b || 0), 0));
    const maxTot = Math.max(1, ...totals);
    const valueW = o.absolute ? Math.max(...totals.map((t) => textW(fmt.n(t), 13, 600))) + 10 : 0;
    const x0 = labelW, W = width - x0 - valueW, barH = o.absolute ? 14 : 18;
    const rowH = wide ? (o.absolute ? 30 : 34) : (o.absolute ? 40 : 44);
    const marks = [];
    rows.forEach((r, i) => {
      const y = i * rowH, g = S('g', null, svg);
      const by = wide ? y + (rowH - barH) / 2 : y + 20;
      T(g, 0, wide ? y + rowH / 2 + 4.5 : y + 14, fit(r.label, wide ? labelW - 14 : width), 'ga-lb');
      const tot = totals[i];
      if (!tot) { if (!o.absolute) { S('rect', { x: x0, y: by, width: W, height: barH, rx: 4, class: 'ga-band' }, g); T(g, x0 + 8, by + 13, 'sem dados', 'ga-tk'); } else T(g, x0, by + barH / 2 + 4.5, '0', 'ga-vl'); return; }
      const present = r.parts.map((v, j) => [v, j]).filter(([v]) => v > 0);
      const gaps = (present.length - 1) * 2;
      const span = o.absolute ? Math.max(present.length * 2, (W * tot) / maxTot) : W;
      if (o.absolute) T(g, x0 + span + 6, by + barH / 2 + 4.5, fmt.n(tot), 'ga-vl');
      let x = x0;
      present.forEach(([v, j], idx) => {
        const w = Math.max(1, ((span - gaps) * v) / tot);
        const last = idx === present.length - 1, first = idx === 0;
        const cls = segs[j].cls;
        let el;
        if (first && last) el = S('rect', { x, y: by, width: w, height: barH, rx: 4, class: `ga-m ${cls}` }, g);
        else if (last) el = S('path', { d: hbarPath(x, by, w, barH, 4), class: `ga-m ${cls}` }, g);
        else el = S('rect', { x, y: by, width: w, height: barH, class: `ga-m ${cls}` }, g);
        const p = fmt.pct(v / tot);
        if (!o.absolute && textW(p, 12, 600) + 10 <= w) T(g, x + w / 2, by + barH / 2 + 4, p, `ga-in ${inkOn(cls)}`, 'middle');
        const hit = S('rect', { x, y: by - 6, width: w + (last ? 0 : 2), height: barH + 12, class: 'ga-hit' }, g);
        marks.push({ hit, els: [el], tip: () => ({ h: r.label, rows: [{ v: `${p} · ${fmt.n(v)}`, l: segs[j].label, k: segs[j].key }] }) });
        x += w + 2;
      });
    });
    svg.setAttribute('viewBox', `0 0 ${width} ${rows.length * rowH}`);
    svg.setAttribute('height', rows.length * rowH);
    interact(svg, marks);
    return { svg, summary: `Partes de ${rows.length} ${rows.length === 1 ? 'total' : 'totais'}: ${segs.map((s) => s.label).join(', ')}.` };
  };
}

// funnel on the ordinal ramp: steps [{ label, n, prev }]
export function funnel(steps, o = {}) {
  return (width) => {
    const svg = S('svg');
    const first = steps[0] ? steps[0].n : 0;
    const max = Math.max(1, ...steps.map((s) => s.n));
    const rowH = o.compact ? 40 : 56, barH = o.compact ? 10 : 14;
    const valueW = Math.max(...steps.map((s) => textW(fmt.n(s.n), 13, 600)), 20) + 10;
    const marks = [];
    steps.forEach((s, i) => {
      const y = i * rowH, g = S('g', null, svg);
      T(g, 0, y + 14, fit(s.label, width - valueW - 4), 'ga-lb b');
      const w = s.n > 0 ? Math.max(2, (s.n / max) * (width - valueW)) : 0;
      const bar = S('path', { d: hbarPath(0, y + 20, w, barH), class: `ga-m o${Math.min(6, i)}` }, g);
      T(g, w + 6, y + 20 + barH / 2 + 4.5, fmt.n(s.n), 'ga-vl');
      const pf = first ? s.n / first : null, pp = i && steps[i - 1].n ? s.n / steps[i - 1].n : null;
      if (!o.compact) T(g, 0, y + 20 + barH + 15, i ? `${fmt.pct(pf)} do primeiro passo · ${fmt.pct(pp)} do passo anterior` : 'o primeiro passo', 'ga-tk');
      const hit = S('rect', { x: 0, y, width, height: rowH, class: 'ga-hit' }, g);
      marks.push({ hit, els: [bar], tip: () => ({ h: s.label, rows: [
        { v: fmt.n(s.n), l: 'visualizações' },
        ...(i ? [{ v: fmt.pct(pf), l: 'do primeiro passo' }, { v: fmt.pct(pp), l: 'do passo anterior' }] : []),
        ...(s.prev !== null && s.prev !== undefined ? [{ v: fmt.n(s.prev), l: 'no período anterior' }] : []),
      ] }) });
    });
    svg.setAttribute('viewBox', `0 0 ${width} ${steps.length * rowH}`);
    svg.setAttribute('height', steps.length * rowH);
    interact(svg, marks);
    const last = steps[steps.length - 1];
    return { svg, summary: `Funil de ${steps.length} passos: começa com ${fmt.n(first)} e acaba com ${fmt.n(last ? last.n : 0)}.` };
  };
}

// columns: bins [{ label, v, tip? }]; o: { median: { at (0..bins.length), label }, height, yFmt, every, cap, strong }
export function columns(bins, o = {}) {
  const f = o.fmt || fmt.n;
  return (width) => {
    const svg = S('svg');
    const H0 = o.height || 170, top = o.median ? 36 : 18, bottom = 22;
    const max = Math.max(1, ...bins.map((b) => b.v || 0));
    const tk = ticks(max, 3, o.integer !== false);
    const yMax = tk[tk.length - 1];
    const left = Math.max(...tk.map((t) => textW((o.yFmt || f)(t), 11))) + 8;
    const plotW = Math.min(width - left, o.maxW || Infinity);
    const slot = plotW / bins.length;
    const colW = o.cap ? Math.min(o.cap, slot - 2) : Math.max(1, slot - 2);
    const y = (v) => top + (H0 - top) * (1 - v / yMax);
    for (const t of tk) {
      S('line', { x1: left, x2: left + plotW, y1: Math.round(y(t)) + 0.5, y2: Math.round(y(t)) + 0.5, class: t ? 'ga-gl' : 'ga-ax' }, svg);
      T(svg, left - 6, y(t) + 4, (o.yFmt || f)(t), 'ga-tk', 'end');
    }
    const every = o.every || Math.max(1, Math.ceil((Math.max(...bins.map((b) => textW(b.label, 11))) + 10) / slot));
    const marks = [];
    let iMax = 0;
    bins.forEach((b, i) => { if ((b.v || 0) > (bins[iMax].v || 0)) iMax = i; });
    bins.forEach((b, i) => {
      const x = left + i * slot + (slot - colW) / 2;
      const h = b.v > 0 ? Math.max(1.5, H0 - y(b.v)) : 0;
      const col = S('path', { d: vbarPath(x, H0 - h, colW, h, Math.min(4, colW / 2)), class: `ga-m ${b.cls || 'f1'}` }, svg);
      if (i % every === 0 || (o.lastLabel && i === bins.length - 1)) T(svg, left + i * slot + slot / 2, H0 + 16, b.label, 'ga-tk', 'middle');
      if (o.strong !== false && i === iMax && b.v > 0) T(svg, left + i * slot + slot / 2, H0 - h - 5, f(b.v), 'ga-vl m', 'middle');
      const hit = S('rect', { x: left + i * slot, y: top, width: slot, height: H0 - top + bottom, class: 'ga-hit' }, svg);
      marks.push({ hit, els: [col], tip: () => (b.tip ? b.tip() : { h: b.tipLabel || b.label, rows: [{ v: f(b.v), l: o.unit || '' }] }) });
    });
    if (o.median && o.median.at !== null && o.median.at !== undefined) {
      const mx = Math.round(left + o.median.at * slot) + 0.5;
      S('line', { x1: mx, x2: mx, y1: 16, y2: H0, class: 'ga-hair' }, svg);
      const lbl = o.median.label;
      const lw = textW(lbl, 11);
      T(svg, Math.max(lw / 2, Math.min(width - lw / 2, mx)), 11, lbl, 'ga-tk', 'middle');
    }
    svg.setAttribute('viewBox', `0 0 ${width} ${H0 + bottom}`);
    svg.setAttribute('height', H0 + bottom);
    interact(svg, marks);
    const mb = bins[iMax];
    return { svg, summary: `${bins.length} colunas; a mais alta é ${mb ? mb.tipLabel || mb.label : ''}, com ${mb ? f(mb.v) : 0}.${o.median ? ` ${o.median.label}.` : ''}` };
  };
}

// stacked columns per day: x [day], series [{ label, cls, key, values }]
export function stackCols(x, series, o = {}) {
  return (width) => {
    const svg = S('svg');
    const H0 = o.height || 160, top = 10, bottom = 22;
    const tot = x.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
    const tk = ticks(Math.max(1, ...tot), 3);
    const yMax = tk[tk.length - 1];
    const left = Math.max(...tk.map((t) => textW(fmt.n(t), 11))) + 8;
    const plotW = width - left, slot = plotW / x.length, colW = Math.max(1, Math.min(24, slot - 2));
    const sy = (H0 - top) / yMax;
    for (const t of tk) { const yy = Math.round(H0 - t * sy) + 0.5; S('line', { x1: left, x2: width, y1: yy, y2: yy, class: t ? 'ga-gl' : 'ga-ax' }, svg); T(svg, left - 6, yy + 4, fmt.n(t), 'ga-tk', 'end'); }
    const every = Math.max(1, Math.ceil(64 / slot));
    const marks = [];
    x.forEach((d, i) => {
      const cx = left + i * slot + (slot - colW) / 2;
      let yb = H0;
      const els = [];
      const present = series.map((s, j) => [s.values[i] || 0, j]).filter(([v]) => v > 0);
      present.forEach(([v, j], idx) => {
        const h = Math.max(1, v * sy - (idx ? 2 : 0));
        const last = idx === present.length - 1;
        const yy = yb - h - (idx ? 2 : 0);
        els.push(S(last ? 'path' : 'rect', last ? { d: vbarPath(cx, yy, colW, h, Math.min(4, colW / 2)), class: `ga-m ${series[j].cls}` } : { x: cx, y: yy, width: colW, height: h, class: `ga-m ${series[j].cls}` }, svg));
        yb = yy;
      });
      if (i % every === 0) T(svg, left + i * slot + slot / 2, H0 + 16, o.xFmt ? o.xFmt(d) : fmt.day(d), 'ga-tk', 'middle');
      const hit = S('rect', { x: left + i * slot, y: top, width: slot, height: H0 - top + bottom, class: 'ga-hit' }, svg);
      marks.push({ hit, els, tip: () => ({ h: o.xFmt ? o.xFmt(d) : fmt.day(d, true), rows: series.map((s) => ({ v: fmt.n(s.values[i] || 0), l: s.label, k: s.key })) }) });
    });
    svg.setAttribute('viewBox', `0 0 ${width} ${H0 + bottom}`);
    svg.setAttribute('height', H0 + bottom);
    interact(svg, marks);
    return { svg, summary: `${x.length} dias, ${fmt.n(tot.reduce((a, b) => a + b, 0))} no total.` };
  };
}

// lines on one axis (same unit only): x [day or 'HH'], series [{ label, cls (l1…), key, values }], o: { notes, yFmt, unit, xFmt, height }
export function line(x, series, o = {}) {
  const yf = o.yFmt || fmt.n;
  return (width) => {
    const svg = S('svg');
    const H0 = o.height || (width < 520 ? 200 : 240);
    const notes = (o.notes || []).filter((n) => x.includes(n.day));
    const top = notes.length > 1 ? 40 : notes.length ? 26 : 12, bottom = 22;
    const all = series.flatMap((s) => s.values.filter((v) => v !== null && v !== undefined));
    const tk = ticks(Math.max(o.min || 1, ...all), 4, o.integer !== false);
    const yMax = tk[tk.length - 1];
    const left = Math.max(...tk.map((t) => textW(yf(t), 11))) + 8;
    // direct end labels when they fit and do not collide; the legend carries identity either way
    const lastOf = (s) => { for (let i = s.values.length - 1; i >= 0; i--) if (s.values[i] !== null && s.values[i] !== undefined) return [i, s.values[i]]; return null; };
    const endW = Math.max(...series.map((s) => textW(s.label, 12))) + 12;
    let right = 10, direct = false;
    if (series.length <= 4 && width >= 560) { right = endW; direct = true; }
    const plotW = width - left - right;
    const X = (i) => left + (x.length === 1 ? plotW / 2 : (i * plotW) / (x.length - 1));
    const Y = (v) => top + (H0 - top) * (1 - v / yMax);
    for (const t of tk) { const yy = Math.round(Y(t)) + 0.5; S('line', { x1: left, x2: left + plotW, y1: yy, y2: yy, class: t ? 'ga-gl' : 'ga-ax' }, svg); T(svg, left - 6, yy + 4, yf(t), 'ga-tk', 'end'); }
    // x labels: as many as fit, always the first and the last
    const xl = (i) => (o.xFmt ? o.xFmt(x[i]) : fmt.day(x[i]));
    const lw = Math.max(...x.map((_, i) => textW(xl(i), 11))) + 14;
    const step = Math.max(1, Math.ceil((lw * (x.length - 1)) / Math.max(1, plotW)));
    for (let i = 0; i < x.length; i += step) if (i === 0 || x.length - 1 - i >= step * 0.6) T(svg, X(i), H0 + 16, xl(i), 'ga-tk', i === 0 && x.length > 1 ? 'start' : 'middle');
    if (x.length > 1) T(svg, X(x.length - 1), H0 + 16, xl(x.length - 1), 'ga-tk', 'end');
    // notes: hairline rules with a short label
    const rows = [[], []];      // label extents per row
    for (const n of notes.slice().sort((a, b) => (a.day < b.day ? -1 : 1))) {
      const nx = Math.round(X(x.indexOf(n.day))) + 0.5;
      const text = fit(n.label, Math.min(130, plotW * 0.45), 11);
      const w = textW(text, 11);
      const end = nx + 4 + w > left + plotW;
      const a = end ? nx - 4 - w : nx + 4, b = a + w;
      const row = rows.findIndex((r) => r.every(([p, q]) => b + 8 < p || a > q + 8));
      S('line', { x1: nx, x2: nx, y1: row === 1 ? top - 22 : top - 8, y2: H0, class: 'ga-note-l' }, svg);
      if (row < 0 || !text) continue;
      rows[row].push([a, b]);
      T(svg, end ? nx - 4 : nx + 4, row === 1 ? top - 26 : top - 12, text, 'ga-tk', end ? 'end' : 'start');
    }
    // series
    series.forEach((s) => {
      let d = '', pen = false;
      s.values.forEach((v, i) => { if (v === null || v === undefined) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`; pen = true; });
      if (series.length === 1 && d) {
        const pts = s.values.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined);
        if (pts.length > 1) S('path', { d: `${d}L${X(pts[pts.length - 1][1]).toFixed(1)} ${H0}L${X(pts[0][1]).toFixed(1)} ${H0}Z`, class: `ga-area ${s.cls.replace('l', 'f')}` }, svg);
      }
      if (d) S('path', { d, class: `ga-ln ${s.cls}` }, svg);
      const last = lastOf(s);
      if (last) S('circle', { cx: X(last[0]), cy: Y(last[1]), r: 4, class: `ga-ring ${s.cls.replace('l', 'f')}` }, svg);
    });
    if (direct) {
      const ends = series.map((s) => { const l = lastOf(s); return l ? { s, y: Y(l[1]) } : null; }).filter(Boolean).sort((a, b) => a.y - b.y);
      const collide = ends.some((e, i) => i && e.y - ends[i - 1].y < 14);
      if (!collide) for (const e of ends) T(svg, left + plotW + 8, e.y + 4, e.s.label, 'ga-lb');
    }
    // crosshair snapping to the day
    const cross = S('line', { x1: 0, x2: 0, y1: top, y2: H0, class: 'ga-cross', visibility: 'hidden' }, svg);
    const dots = series.map((s) => S('circle', { r: 4, class: `ga-ring ${s.cls.replace('l', 'f')}`, visibility: 'hidden' }, svg));
    const marks = x.map((d, i) => {
      const hit = S('rect', { x: X(i) - (x.length > 1 ? plotW / (x.length - 1) / 2 : plotW / 2), y: 0, width: x.length > 1 ? plotW / (x.length - 1) : plotW, height: H0 + bottom, class: 'ga-hit' }, svg);
      return { hit, anchor: hit, tip: () => {
        const ns = notes.filter((n) => n.day === d);
        return { h: o.xFmt ? o.xFmt(d, true) : fmt.day(d, true), rows: [
          ...series.map((s) => ({ v: s.values[i] === null || s.values[i] === undefined ? '—' : yf(s.values[i]), l: s.label, k: `ln ${s.key}` })),
          ...ns.map((n) => ({ v: '│', l: `${n.kindLabel ? `${n.kindLabel}: ` : ''}${n.label}` })),
        ] };
      } };
    });
    interact(svg, marks, { onIndex: (i) => {
      if (i < 0) { cross.setAttribute('visibility', 'hidden'); dots.forEach((c) => c.setAttribute('visibility', 'hidden')); return; }
      const cx = Math.round(X(i)) + 0.5;
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      series.forEach((s, j) => { const v = s.values[i]; if (v === null || v === undefined) { dots[j].setAttribute('visibility', 'hidden'); return; } dots[j].setAttribute('cx', X(i)); dots[j].setAttribute('cy', Y(v)); dots[j].setAttribute('visibility', 'visible'); });
    } });
    svg.setAttribute('viewBox', `0 0 ${width} ${H0 + bottom}`);
    svg.setAttribute('height', H0 + bottom);
    const s0 = series[0];
    const tot = s0 ? s0.values.reduce((a, b) => a + (b || 0), 0) : 0;
    let im = 0; if (s0) s0.values.forEach((v, i) => { if ((v || 0) > (s0.values[im] || 0)) im = i; });
    return { svg, summary: s0 ? `${series.map((s) => s.label).join(', ')} por ${o.unitName || 'dia'}. ${s0.label}: ${yf(tot)} no total, máximo de ${yf(s0.values[im] || 0)} em ${xl(im)}.` : '' };
  };
}

// scatter (slot 1 only, ≥ 24 px hit areas, the top 5 labelled): points [{ x, y, label }]
export function scatter(points, o = {}) {
  return (width) => {
    const svg = S('svg');
    const H0 = o.height || 240, top = o.yLabel ? 28 : 12, bottom = 34;
    const xs = points.map((p) => p.x), ys = points.map((p) => p.y);
    const tx = ticks(Math.max(1, ...xs), 4), ty = ticks(Math.max(1, ...ys), 4, false);
    const xMax = tx[tx.length - 1], yMax = ty[ty.length - 1];
    const left = Math.max(...ty.map((t) => textW((o.yFmt || fmt.n1)(t), 11))) + 10;
    const plotW = width - left - 12;
    const X = (v) => left + (v / xMax) * plotW, Y = (v) => top + (H0 - top) * (1 - v / yMax);
    for (const t of ty) { const yy = Math.round(Y(t)) + 0.5; S('line', { x1: left, x2: left + plotW, y1: yy, y2: yy, class: t ? 'ga-gl' : 'ga-ax' }, svg); T(svg, left - 6, yy + 4, (o.yFmt || fmt.n1)(t), 'ga-tk', 'end'); }
    for (const t of tx) T(svg, X(t), H0 + 16, (o.xFmt || fmt.n)(t), 'ga-tk', 'middle');
    if (o.xLabel) T(svg, left + plotW, H0 + 31, o.xLabel, 'ga-tk', 'end');
    if (o.yLabel) T(svg, 0, 11, o.yLabel, 'ga-tk', 'start');
    const marks = [];
    const ranked = points.map((p, i) => [p.y, i]).sort((a, b) => b[0] - a[0]).slice(0, 5).map(([, i]) => i);
    points.forEach((p, i) => {
      const g = S('g', null, svg);
      const c = S('circle', { cx: X(p.x), cy: Y(p.y), r: 5, class: 'ga-m ga-ring f1' }, g);
      if (ranked.includes(i) && p.y > 0) {
        const text = fit(p.label, 120, 11), tw = textW(text, 11);
        const right = X(p.x) + 8 + tw <= width;
        T(g, right ? X(p.x) + 8 : X(p.x) - 8, Y(p.y) - 6, text, 'ga-lb ga-in', right ? 'start' : 'end');
      }
      const hit = S('circle', { cx: X(p.x), cy: Y(p.y), r: 12, class: 'ga-hit' }, g);
      marks.push({ hit, els: [c], tip: () => (p.tip ? p.tip() : { h: p.label, rows: [{ v: String(p.y), l: '' }] }) });
    });
    svg.setAttribute('viewBox', `0 0 ${width} ${H0 + bottom}`);
    svg.setAttribute('height', H0 + bottom);
    interact(svg, marks);
    return { svg, summary: `${points.length} pontos; o mais alto é ${points[ranked[0]] ? points[ranked[0]].label : '—'}.` };
  };
}

// ---------- figures: tiles, hero number, status, meter ----------
const ICON = {
  up: 'M6 2l4 6H2z', down: 'M6 10L2 4h8z',
  good: 'M7 0a7 7 0 1 1 0 14A7 7 0 0 1 7 0zm-1.2 9.6L3.4 7.2l1-1 1.4 1.4 3.8-3.8 1 1z',
  warn: 'M7 .5l6.8 12.5H.2zM6.2 5v4h1.6V5zm0 5.2v1.6h1.6v-1.6z',
  bad: 'M7 0a7 7 0 1 1 0 14A7 7 0 0 1 7 0zM4.6 3.5L3.5 4.6 5.9 7 3.5 9.4l1.1 1.1L7 8.1l2.4 2.4 1.1-1.1L8.1 7l2.4-2.4-1.1-1.1L7 5.9z',
  info: 'M7 0a7 7 0 1 1 0 14A7 7 0 0 1 7 0zM6.2 6v5h1.6V6zm0-2.8v1.6h1.6V3.2z',
};
export function icon(name, cls) {
  const svg = S('svg', { viewBox: name === 'up' || name === 'down' ? '0 0 12 12' : '0 0 14 14', 'aria-hidden': 'true', focusable: 'false', class: cls });
  S('path', { d: ICON[name], fill: 'currentColor', 'fill-rule': 'evenodd' }, svg);
  return svg;
}
// status chip: icon + label, the colour lives in the icon only
export function status(kind, label) {
  const s = H('span', `ga-st ${kind}`);
  s.append(icon(kind === 'good' ? 'good' : kind === 'warn' || kind === 'serious' ? 'warn' : kind === 'bad' ? 'bad' : 'info'));
  H('span', null, label, s);
  return s;
}

function spark(values, cls = 'sp') {
  const svg = S('svg', { class: cls, viewBox: '0 0 100 26', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
  const v = values.map((x) => (x === null || x === undefined ? null : x));
  const nums = v.filter((x) => x !== null);
  if (nums.length < 2) return svg;
  const mx = Math.max(...nums), mn = Math.min(0, ...nums), span = mx - mn || 1;
  const X = (i) => (i * 100) / (v.length - 1), Y = (x) => 3 + 20 * (1 - (x - mn) / span);
  let d = '', pen = false;
  v.forEach((x, i) => { if (x === null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${X(i).toFixed(2)} ${Y(x).toFixed(2)}`; pen = true; });
  S('path', { d, class: 'ga-ln lo', 'vector-effect': 'non-scaling-stroke' }, svg).style.strokeWidth = '1.5px';
  // the current period in the accent: the last point
  let li = v.length - 1; while (li >= 0 && v[li] === null) li--;
  if (li >= 0) S('path', { d: `M${X(li)} ${Y(v[li])}l0 0`, class: 'ga-ln l1', 'vector-effect': 'non-scaling-stroke' }, svg).style.strokeWidth = '6px';
  return svg;
}

// delta against the named previous period; kind 'n' | 'dur' (relative) or 'rate' (percentage points)
export function delta(v, prev, kind, upIsGood = true) {
  if (v === null || v === undefined || prev === null || prev === undefined) return null;
  let dir = 0, text;
  if (kind === 'rate') {
    const pp = (v - prev) * 100;
    dir = Math.abs(pp) < 0.05 ? 0 : Math.sign(pp);
    text = dir ? `${pp > 0 ? '+' : '−'}${fmt.n1(Math.abs(pp))} p.p.` : 'igual';
  } else {
    if (prev === 0) return v > 0 ? { dir: 1, text: 'novo', cls: upIsGood ? 'good' : 'bad' } : { dir: 0, text: 'igual', cls: '' };
    const r = (v - prev) / prev;
    dir = Math.abs(r) < 0.005 ? 0 : Math.sign(r);
    text = dir ? `${r > 0 ? '+' : '−'}${fmt.pct(Math.abs(r))}` : 'igual';
  }
  return { dir, text, cls: dir === 0 ? '' : (dir > 0) === upIsGood ? 'good' : 'bad' };
}

// o: { label, value (text), v, prev, kind, upIsGood, spark: [], sub, prevName, chip, note }
export function statTile(o) {
  const t = H('div', 'ga-tile');
  H('span', 'lb', o.label, t);
  const v = H('span', 'v', o.value, t);
  if (o.small) H('small', null, o.small, v);
  if (o.sub) H('span', 'sb', o.sub, t);
  const d = o.prevName !== null ? delta(o.v, o.prev, o.kind || 'n', o.upIsGood !== false) : null;
  const dl = H('span', `dl ${d ? d.cls : ''}`, null, t);
  if (d) {
    if (d.dir) dl.append(icon(d.dir > 0 ? 'up' : 'down'));
    H('span', null, d.text, dl);
    if (o.prevName) { H('span', 'vs', `vs ${o.prevName}`, dl); }
    dl.title = `${d.text} em relação a ${o.prevName || 'o período anterior'}${o.upIsGood === false ? ' (aqui, subir é mau)' : ''}`;
  } else if (o.prev === null && o.v !== null && o.prevName) H('span', 'vs', 'sem comparação', dl);
  if (o.status) { const r = H('span', 'st-row', null, t); r.append(o.status); }
  if (o.spark && o.spark.some((x) => x !== null && x !== undefined)) t.append(spark(o.spark));
  if (o.chip) H('span', 'ga-chip', o.chip, t);
  return t;
}

export function sparkline(values) { return spark(values); }

// meter: value of max, warn at a share; the track is a lighter step of the same ramp
export function meter({ label, value, max, text, sub, warnAt = 0.7 }) {
  const box = H('div', 'ga-meter');
  H('div', 'lb', label, box);
  H('div', 'v', text, box);
  const r = max ? Math.min(1, value / max) : 0;
  const svg = S('svg', { viewBox: '0 0 100 12', preserveAspectRatio: 'none', role: 'img', 'aria-label': `${label}: ${fmt.pct(r)} do limite` }, box);
  S('rect', { x: 0, y: 0, width: 100, height: 12, rx: 3, class: 'ga-track' }, svg);
  if (r > 0) S('rect', { x: 0, y: 0, width: Math.max(1, r * 100), height: 12, rx: 3, class: r >= 0.9 ? 'sc' : r >= warnAt ? 'sw' : 'f1' }, svg);
  const st = H('div', 'sb', null, box);
  if (r >= 0.9) st.append(status('bad', `No limite · ${fmt.pct(r)}`));
  else if (r >= warnAt) st.append(status('warn', `Perto do limite · ${fmt.pct(r)}`));
  else st.append(status('good', `${fmt.pct(r)} do limite`));
  if (sub) H('div', 'sb', sub, box);
  return box;
}
