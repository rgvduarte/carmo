// Small hand-built SVG charts: thin marks, hairline grid, one accent, hover + focus tooltips.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const txt = (parent, x, y, s, cls, anchor = 'start') => { const t = el('text', { x, y, class: cls, 'text-anchor': anchor }, parent); t.textContent = s; return t; };

export const fmtHM = (min) => `${Math.floor(min / 60)}:${String(Math.round(min % 60)).padStart(2, '0')}`;

// draw at the container's real width so 1 svg unit = 1 css px and text never scales
const widthOf = (host) => Math.max(280, Math.round(host.clientWidth || 640));

function tooltip(host) {
  let tip = host.querySelector('.tip');
  if (!tip) { tip = document.createElement('div'); tip.className = 'tip'; host.appendChild(tip); }
  return {
    show(x, y, value, label) {
      tip.textContent = '';
      const b = document.createElement('b'); b.textContent = value;
      const s = document.createElement('span'); s.textContent = label;
      tip.append(b, s);
      tip.style.left = `${x}px`; tip.style.top = `${y}px`;
      tip.classList.add('on');
    },
    hide() { tip.classList.remove('on'); },
  };
}

// toSvg maps a pointer/focus position in svg units to host pixels
function toHost(svg, x, y) {
  const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
  return [x * (r.width / vb.width), y * (r.height / vb.height)];
}

// Line chart for a handful of points (single series, endpoint emphasised).
export function lineChart(host, points, { yFmt = (v) => v, tipFmt, label = (p) => p.label, ticks, height = 260 } = {}) {
  host.querySelectorAll('svg').forEach((s) => s.remove());
  const W = widthOf(host), H = height, m = { t: 26, r: 64, b: 46, l: 52 };
  const ys = points.map((p) => p.y);
  const lo = ticks ? ticks[0] : Math.min(...ys), hi = ticks ? ticks[ticks.length - 1] : Math.max(...ys);
  const X = (i) => m.l + (i / Math.max(1, points.length - 1)) * (W - m.l - m.r);
  const Y = (v) => m.t + ((hi - v) / (hi - lo || 1)) * (H - m.t - m.b);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'presentation' }, host);
  const grid = el('g', { class: 'grid' }, svg), axis = el('g', { class: 'axis' }, svg);
  for (const tv of ticks || [lo, hi]) {
    el('line', { x1: m.l, x2: W - m.r + 20, y1: Y(tv), y2: Y(tv) }, grid);
    txt(axis, m.l - 12, Y(tv) + 4, yFmt(tv), '', 'end');
  }
  points.forEach((p, i) => { txt(axis, X(i), H - 18, p.short || p.label, '', i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'); });
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');
  const area = `${d} L${X(points.length - 1)},${H - m.b} L${X(0)},${H - m.b} Z`;
  el('path', { d: area, fill: 'currentColor', opacity: 0.06 }, svg);
  const path = el('path', { d, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', class: 'line' }, svg);
  const tip = tooltip(host);
  points.forEach((p, i) => {
    const last = i === points.length - 1;
    const g = el('g', { tabindex: 0, role: 'img', 'aria-label': `${label(p)}: ${tipFmt ? tipFmt(p) : yFmt(p.y)}` }, svg);
    el('circle', { cx: X(i), cy: Y(p.y), r: 14, fill: 'transparent' }, g);
    el('circle', { cx: X(i), cy: Y(p.y), r: last ? 6 : 4.5, fill: last ? 'var(--gold)' : 'currentColor', stroke: 'var(--bg-2)', 'stroke-width': 2 }, g);
    const show = () => { const [hx, hy] = toHost(svg, X(i), Y(p.y)); tip.show(hx, hy, tipFmt ? tipFmt(p) : yFmt(p.y), label(p)); };
    g.addEventListener('pointerenter', show); g.addEventListener('focus', show);
    g.addEventListener('pointerleave', tip.hide); g.addEventListener('blur', tip.hide);
  });
  const lp = points[points.length - 1];
  txt(svg, X(points.length - 1) + 12, Y(lp.y) + 5, yFmt(lp.y), 'lbl');
  txt(svg, X(0) - 0, Y(points[0].y) - 14, yFmt(points[0].y), 'lbl-muted');
  // draw-in on reveal
  const len = path.getTotalLength ? path.getTotalLength() : 0;
  if (len && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    new IntersectionObserver((en, ob) => { if (en[0].isIntersecting) { path.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.22,1,.36,1)'; path.style.strokeDashoffset = 0; ob.disconnect(); } }, { threshold: 0.4 }).observe(host);
  }
  return svg;
}

// Lollipop rows on one shared axis: overall place as a share of the field (lower is better).
export function topStrip(host, rows, { fmt = (v) => `${v}%`, top = 'top', max } = {}) {
  host.querySelectorAll('svg').forEach((s) => s.remove());
  const W = widthOf(host), rowH = 40, m = { t: 26, r: 70, b: 8 };
  const lw = Math.min(210, Math.round(W * 0.42));
  const H = m.t + rows.length * rowH + m.b;
  const hi = max || Math.ceil(Math.max(...rows.map((r) => r.pct)));
  const X = (v) => lw + (v / hi) * (W - lw - m.r);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'presentation' }, host);
  const grid = el('g', { class: 'grid' }, svg), axis = el('g', { class: 'axis' }, svg);
  for (let v = 0; v <= hi; v += hi > 6 ? 2 : 1) {
    el('line', { x1: X(v), x2: X(v), y1: m.t - 6, y2: H - m.b }, grid);
    txt(axis, X(v), m.t - 12, `${v}%`, '', 'middle');
  }
  const tip = tooltip(host);
  rows.forEach((r, i) => {
    const y = m.t + i * rowH + rowH / 2;
    txt(svg, 0, y - 2, r.label, 'lbl');
    txt(svg, 0, y + 14, `${r.year} · ${r.sub}`, 'lbl-muted');
    const g = el('g', { tabindex: 0, role: 'img', 'aria-label': `${r.label}: ${top} ${fmt(r.pct)}` }, svg);
    el('rect', { x: lw, y: y - rowH / 2, width: W - lw, height: rowH, fill: 'transparent' }, g);
    el('line', { x1: X(0), x2: X(r.pct), y1: y, y2: y, stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.5 }, g);
    el('circle', { cx: X(r.pct), cy: y, r: 5, fill: i === 0 ? 'var(--gold)' : 'currentColor', stroke: 'var(--bg-2)', 'stroke-width': 2 }, g);
    txt(svg, X(r.pct) + 12, y + 4, `${top} ${fmt(r.pct)}`, 'lbl-muted');
    const show = () => { const [hx, hy] = toHost(svg, X(r.pct), y); tip.show(hx, hy, `${top} ${fmt(r.pct)}`, `${r.label} · ${r.sub}`); };
    g.addEventListener('pointerenter', show); g.addEventListener('focus', show);
    g.addEventListener('pointerleave', tip.hide); g.addEventListener('blur', tip.hide);
  });
}

// Small multiples: one row of weekly columns per sport, shared y scale.
export function weekMultiples(host, rows, weeks, { unit = 'h', labelWeek = (w) => w } = {}) {
  host.textContent = '';
  const max = Math.max(0.5, ...rows.flatMap((r) => r.values));
  const W = widthOf(host), H = 92, m = { t: 22, r: 6, b: 18, l: 6 };
  const n = weeks.length, band = (W - m.l - m.r) / n, bw = Math.min(16, band - 2);
  const Y = (v) => (v / max) * (H - m.t - m.b);
  for (const row of rows) {
    const wrap = document.createElement('div');
    wrap.className = 'chart';
    wrap.style.marginTop = '0';
    host.appendChild(wrap);
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'presentation' }, wrap);
    const total = row.values.reduce((a, b) => a + b, 0);
    txt(svg, m.l, 14, row.label, 'lbl');
    txt(svg, W - m.r, 14, `${total.toFixed(0)} ${unit}`, 'lbl-muted', 'end');
    el('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, stroke: 'var(--line)' }, svg);
    const tip = tooltip(wrap);
    row.values.forEach((v, i) => {
      const x = m.l + i * band + (band - bw) / 2, h = Math.max(v > 0 ? 2 : 0, Y(v)), y = H - m.b - h;
      const g = el('g', { tabindex: -1 }, svg);
      el('rect', { x: m.l + i * band, y: m.t, width: band, height: H - m.t - m.b, fill: 'transparent' }, g);
      const last = i === n - 1;
      if (h > 0) el('path', { d: barPath(x, y, bw, h, Math.min(4, bw / 2)), fill: last ? 'var(--gold)' : 'currentColor', opacity: last ? 1 : 0.85 }, g);
      g.addEventListener('pointerenter', () => { const [hx, hy] = toHost(svg, x + bw / 2, y); tip.show(hx, hy, `${v.toFixed(1)} ${unit}`, `${row.label} · ${labelWeek(weeks[i])}`); });
      g.addEventListener('pointerleave', tip.hide);
    });
    if (rows.indexOf(row) === rows.length - 1) {
      const axis = el('g', { class: 'axis' }, svg);
      [0, Math.floor(n / 2), n - 1].forEach((i) => txt(axis, m.l + i * band + band / 2, H - 2, labelWeek(weeks[i]), '', i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'));
    }
  }
}

function barPath(x, y, w, h, r) {
  r = Math.min(r, h);
  return `M${x},${y + h} L${x},${y + r} Q${x},${y} ${x + r},${y} L${x + w - r},${y} Q${x + w},${y} ${x + w},${y + r} L${x + w},${y + h} Z`;
}

// Calendar heatmap: 52 weeks x 7 days of training hours, one-hue ramp.
export function heatmap(host, days, { title = '', fmtDay = (d) => d } = {}) {
  host.textContent = '';
  const cell = 11, gap = 2, weeks = Math.ceil(days.length / 7);
  const W = weeks * (cell + gap) + 2, H = 7 * (cell + gap) + 30;
  const max = Math.max(1, ...days.map((d) => d.h));
  const steps = [0, 0.25, 0.5, 0.75, 1];
  const level = (h) => (h <= 0 ? 0 : 1 + Math.min(3, Math.floor((h / max) * 4)));
  const wrap = document.createElement('div');
  wrap.className = 'chart';
  host.appendChild(wrap);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'presentation', style: `min-width:${W}px` }, wrap);
  txt(svg, 0, 10, title, 'lbl-muted');
  const tip = tooltip(wrap);
  days.forEach((d, i) => {
    const wk = Math.floor(i / 7), dy = i % 7, lv = level(d.h);
    const x = wk * (cell + gap), y = 18 + dy * (cell + gap);
    const r = el('rect', { x, y, width: cell, height: cell, rx: 2, fill: lv ? 'currentColor' : 'var(--line)', opacity: lv ? 0.2 + steps[lv] * 0.8 : 1 }, svg);
    r.addEventListener('pointerenter', () => { const [hx, hy] = toHost(svg, x + cell / 2, y); tip.show(hx, hy, `${d.h.toFixed(1)} h`, fmtDay(d.d)); });
    r.addEventListener('pointerleave', tip.hide);
  });
}

// A race as one proportional bar: segments by time, 2px gaps, direct labels where they fit.
export function splitBar(host, segs) {
  host.querySelectorAll('svg').forEach((s) => s.remove());
  const W = widthOf(host), H = 92, y = 30, h = 14, gap = 2;
  const total = segs.reduce((a, s) => a + s.s, 0);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, role: 'presentation' }, host);
  const tip = tooltip(host);
  const usable = W - gap * (segs.length - 1);
  const fmt = (sec) => { const hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60; return hh ? `${hh}:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${mm}:${String(ss).padStart(2, '0')}`; };
  let x = 0;
  segs.forEach((s, i) => {
    const w = Math.max(2, (s.s / total) * usable);
    const transition = s.key.startsWith('t');
    const g = el('g', { tabindex: 0, role: 'img', 'aria-label': `${s.label}: ${fmt(s.s)}` }, svg);
    el('rect', { x, y: y - 10, width: Math.max(w, 12), height: h + 20, fill: 'transparent' }, g);
    el('rect', { x, y, width: w, height: h, rx: i === 0 || i === segs.length - 1 ? 4 : 1, fill: s.key === 'bike' ? 'var(--gold)' : 'currentColor', opacity: transition ? 0.35 : s.key === 'bike' ? 1 : 0.85 }, g);
    if (!transition && w > 70) {
      txt(svg, x, y - 10, s.label, 'lbl-muted');
      txt(svg, x, y + h + 24, fmt(s.s), 'lbl');
      txt(svg, x + w, y + h + 24, `${Math.round((s.s / total) * 100)}%`, 'lbl-muted', 'end');
    }
    const cx = x + w / 2;
    const show = () => { const [hx, hy] = toHost(svg, cx, y); tip.show(hx, hy, fmt(s.s), `${s.label} · ${Math.round((s.s / total) * 1000) / 10}%`); };
    g.addEventListener('pointerenter', show); g.addEventListener('focus', show);
    g.addEventListener('pointerleave', tip.hide); g.addEventListener('blur', tip.hide);
    x += w + gap;
  });
}
