// Small hand-built SVG charts: thin marks, hairline grid, one accent, hover + focus tooltips.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  if (parent) parent.appendChild(n);
  return n;
};
const txt = (parent, x, y, s, cls, anchor = 'start') => { const t = el('text', { x, y, class: cls, 'text-anchor': anchor }, parent); t.textContent = s; return t; };


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
