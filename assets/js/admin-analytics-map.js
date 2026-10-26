// «Onde estão» (SPEC 5.8): a self-hosted SVG map, Portugal (mainland with the Azores and Madeira insets) or the world,
// with a dot per city the API returns (only cities with 3 or more visitor-days), and the country › region › city table
// beside it. Paths and dots go through the same projection (the parameters live in geo-pt.json / geo-world.json).
import { H, S, fmt, figure, interact, table, emptyState } from './admin-analytics-charts.js';
import * as L from './admin-analytics-labels.js';

const geoCache = new Map();
function loadGeo(kind) {
  if (!geoCache.has(kind)) {
    geoCache.set(kind, fetch(kind === 'pt' ? 'geo-pt.json' : 'geo-world.json', { cache: 'force-cache' })
      .then((r) => { if (!r.ok) throw new Error('geo'); return r.json(); })
      .catch((e) => { geoCache.delete(kind); throw e; }));
  }
  return geoCache.get(kind);
}

// lon/lat → viewBox coordinates, or null when the point is outside every frame
export function project(g, lon, lat) {
  if (g.frames) {
    for (const f of g.frames) {
      const [x0, y0, x1, y1] = f.bbox;
      if (lon >= x0 - 0.35 && lon <= x1 + 0.35 && lat >= y0 - 0.35 && lat <= y1 + 0.35) return [f.ox + (lon - f.lon0) * f.kx, f.oy + (f.lat1 - lat) * f.ky];
    }
    return null;
  }
  return [(lon + 180) * g.k, (g.lat1 - lat) * g.k];
}

export function drawMap(cardEl, geo, ctx) {
  const box = H('div', null, null, cardEl);
  if (!geo || !geo.cc || !geo.cc.rows.length) { emptyState(box, 'Ainda sem dados neste período.'); return; }
  const ctl = H('div', 'ga-inline', null, box);
  const seg = H('fieldset', 'ga-seg', null, ctl);
  H('legend', 'sr-only', 'Mapa', seg);
  const gridEl = H('div', 'ga-mapgrid', null, box);
  const mapBox = H('div', 'ga-map', null, gridEl);
  const side = H('div', null, null, gridEl);
  side.append(placesTable(geo));
  H('p', 'ga-map-note', 'A localização vem do endereço de internet e é aproximada (cerca de 10 km). Nos telemóveis aparece muitas vezes a cidade do operador, como Lisboa ou Porto.', box);
  const ptCount = geo.cc.rows.find((r) => r.k === 'PT');
  let kind = ptCount && ptCount.n >= geo.cc.total / 2 ? 'pt' : 'world';
  const show = async (k) => {
    kind = k;
    mapBox.classList.toggle('world', k === 'world');
    mapBox.replaceChildren(H('p', 'ga-fine', 'A desenhar o mapa…'));
    let g;
    try { g = await loadGeo(k); } catch (_) { mapBox.replaceChildren(); emptyState(mapBox, 'Não consegui carregar o mapa. A tabela ao lado tem os mesmos números.'); return; }
    if (kind !== k) return;
    mapBox.replaceChildren(mapFigure(g, geo, k));
  };
  for (const [k, label] of [['pt', 'Portugal'], ['world', 'Mundo']]) {
    const lab = H('label', null, null, seg);
    const r = H('input', null, null, lab); r.type = 'radio'; r.name = 'map-kind'; r.value = k; r.checked = k === kind;
    H('span', null, label, lab);
    r.addEventListener('change', () => show(k));
  }
  show(kind);
}

function mapFigure(g, geo, kind) {
  const cities = geo.cities.filter((c) => c.lat !== null && c.lon !== null);
  const pts = cities.map((c) => ({ c, p: project(g, c.lon, c.lat) }));
  const inMap = pts.filter((x) => x.p), outside = pts.length - inMap.length;
  const maxU = Math.max(1, ...cities.map((c) => c.u));
  const name = (c) => `${L.place(c.city)}${c.reg && L.place(c.reg) !== L.place(c.city) ? `, ${L.place(c.reg)}` : ''} · ${L.country(c.cc)}`;
  return figure({
    title: kind === 'pt' ? 'Portugal' : 'Mundo', cls: 'ga-sub',
    note: kind === 'pt' && outside ? `${outside} ${outside === 1 ? 'cidade fica' : 'cidades ficam'} fora de Portugal: vê «Mundo».` : cities.length ? 'Cada ponto é uma cidade; o tamanho segue os visitantes-dia.' : 'Nenhuma cidade com 3 ou mais visitantes-dia neste período: só os países, na tabela.',
    draw: (width) => {
      const svg = S('svg', { viewBox: `0 ${kind === 'world' ? 0 : 0} ${g.w} ${g.h}` });
      const u = g.w / width;     // viewBox units per CSS px
      if (g.frames) {
        const main = g.frames.find((f) => !f.inset);
        const clip = S('clipPath', { id: 'ga-clip-pt' }, S('defs', null, svg));
        S('rect', { x: main.x - 2, y: main.y, width: g.w - main.x + 2, height: main.h }, clip);
        if (main.context) S('path', { d: main.context, class: 'ga-land ctx', 'clip-path': 'url(#ga-clip-pt)' }, svg);
        for (const f of g.frames) {
          if (f.inset) {
            S('rect', { x: f.x, y: f.y, width: f.w, height: f.h, rx: 6, class: 'ga-frame' }, svg);
            const t = S('text', { x: f.x + 8, y: f.y + 15, class: 'ga-frame-l' }, svg);
            t.textContent = f.label;
            t.style.fontSize = `${11 * u}px`;
          }
          S('path', { d: f.d, class: 'ga-land' }, svg);
        }
      } else S('path', { d: g.d, class: 'ga-land' }, svg);
      const marks = [];
      // biggest first, so small dots stay on top and reachable
      for (const { c, p } of inMap.slice().sort((a, b) => b.c.u - a.c.u)) {
        const r = (4 + 14 * Math.sqrt(c.u / maxU)) * u;
        const grp = S('g', { class: 'ga-dotg' }, svg);
        const t = S('title', null, grp);
        t.textContent = `${name(c)}: ${fmt.n(c.u)} visitantes-dia, ${fmt.n(c.n)} visualizações`;
        const dot = S('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: r.toFixed(2), class: 'ga-dot' }, grp);
        const hit = S('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: Math.max(r, 12 * u).toFixed(2), class: 'ga-hit' }, grp);
        marks.push({ hit, els: [grp], anchor: dot, tip: () => ({ h: name(c), rows: [{ v: fmt.n(c.u), l: 'visitantes-dia' }, { v: fmt.n(c.n), l: 'visualizações' }] }) });
      }
      svg.setAttribute('height', Math.round((g.h / g.w) * width));
      interact(svg, marks);
      const top = cities.slice().sort((a, b) => b.u - a.u)[0];
      return { svg, summary: `Mapa de ${kind === 'pt' ? 'Portugal' : 'todo o mundo'} com ${inMap.length} cidades${top ? `; a maior é ${name(top)}, com ${fmt.n(top.u)} visitantes-dia` : ''}.` };
    },
    table: () => ({ caption: 'Cidades no mapa', cols: [{ l: 'Cidade', get: name }, { l: 'Visitantes-dia', k: 'u', num: true, fmt: fmt.n }, { l: 'Visualizações', k: 'n', num: true, fmt: fmt.n }], rows: cities, initial: { k: 'u', dir: 'descending' } }),
  });
}

// country › region › city, expandable; «Outras localidades» per country (k-folded by the Worker)
function placesTable(geo) {
  const total = geo.cc.total || 1;
  const wrap = H('div', 'ga-tw');
  const t = H('table', 'ga-table', null, wrap);
  H('caption', null, 'País, região e cidade', t);
  const hr = H('tr', null, null, H('thead', null, null, t));
  for (const [l, n] of [['Onde', false], ['Visualizações', true], ['Visitantes-dia', true], ['Parte', true]]) { const th = H('th', n ? 'n' : null, l, hr); th.scope = 'col'; }
  const tb = H('tbody', null, null, t);
  const row = (lvl, label, n, u, opts = {}) => {
    const tr = H('tr', `lvl${lvl}`, null, tb);
    const th = H('th', null, null, tr);
    th.scope = 'row';
    let btn = null;
    if (opts.expand) { btn = H('button', 'ga-xp', label, th); btn.type = 'button'; btn.setAttribute('aria-expanded', 'false'); }
    else { H('span', null, label, th); }
    if (opts.sub) H('span', 'sub', opts.sub, th);
    H('td', 'n', fmt.n(n), tr); H('td', 'n', fmt.n(u), tr); H('td', 'n', fmt.pct(n / total), tr);
    return { tr, btn };
  };
  const toggle = (btn, kids) => {
    const set = (on) => { btn.setAttribute('aria-expanded', String(on)); for (const k of kids) { k.tr.hidden = !on; if (!on && k.btn && k.btn.getAttribute('aria-expanded') === 'true') k.collapse(); } };
    btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
    return set;
  };
  geo.cc.rows.forEach((c, ci) => {
    const regs = new Map();
    for (const r of geo.regions.filter((x) => x.cc === c.k)) regs.set(r.reg, { reg: r.reg, n: r.n, u: r.u, rest: { n: r.n, u: r.u }, cities: [] });
    for (const x of geo.cities.filter((y) => y.cc === c.k)) {
      const k = x.reg || '';
      if (!regs.has(k)) regs.set(k, { reg: k, n: 0, u: 0, rest: null, cities: [] });
      const r = regs.get(k); r.cities.push(x); r.n += x.n; r.u += x.u;
    }
    const other = geo.otherPlaces.find((o) => o.cc === c.k);
    const hasKids = regs.size || (other && other.n);
    const top = row(0, L.country(c.k), c.n, c.u, { expand: hasKids });
    const kids = [];
    for (const r of [...regs.values()].sort((a, b) => b.u - a.u || b.n - a.n)) {
      const cityKids = [];
      const rr = row(1, r.reg ? L.place(r.reg) : 'Sem região', r.n, r.u, { expand: r.cities.length > 0 });
      for (const x of r.cities.sort((a, b) => b.u - a.u)) cityKids.push(row(2, L.place(x.city), x.n, x.u));
      if (r.cities.length && r.rest && r.rest.n) cityKids.push(row(2, `Resto de ${L.place(r.reg)}`, r.rest.n, r.rest.u));
      for (const k of cityKids) k.tr.hidden = true;
      if (rr.btn) { const set = toggle(rr.btn, cityKids); rr.collapse = () => set(false); }
      kids.push(rr, ...cityKids.map((k) => ({ ...k, nested: true })));
    }
    if (other && other.n) kids.push(row(1, 'Outras localidades', other.n, other.u, { sub: 'regiões e cidades com menos de 3 visitantes-dia' }));
    const direct = kids.filter((k) => !k.nested);
    for (const k of kids) k.tr.hidden = true;
    if (top.btn) { const set = toggle(top.btn, direct); if (ci === 0) set(true); }
  });
  return wrap;
}

export { table };
