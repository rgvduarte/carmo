// The admin hub (/admin/): what its numbers and «Avisos» say, from the data the other pages already read. Pure: no
// DOM, no fetch, no storage and no clock (every function takes `now` or the Lisbon day), so Node tests it with
// fixtures. Each source may be missing (null: not read, no key in this tab, the Worker down): a tile then shows «—»
// and its alerts are simply not there; nothing here throws on a missing source.
import { effective, itemOf, TITLE, pad2, money } from './admin-core.js';
import { dueNow } from './admin-contracts.js';
import { rulesOf, daysBetween } from './season-rules.js';

export const HOLD_SOON_H = 48;       // a reservation ending within this many hours is an alert
export const STRAVA_OLD_DAYS = 2;    // the Strava data are stale after this many days

// spots: { suit, helmet, all: { sold, reserved, free, total } }, revenue: the table price of what is sold (the whole
// suit counts once, at its own price), soldBrands: the brands on the site
export function spotStats(raw, now) {
  const out = { suit: { sold: 0, reserved: 0, free: 0, total: 0 }, helmet: { sold: 0, reserved: 0, free: 0, total: 0 }, all: { sold: 0, reserved: 0, free: 0, total: 0 }, revenue: 0, brands: [] };
  if (!raw || !Array.isArray(raw.spots) || !raw.title) return null;
  const v = effective(raw, now), brands = new Set();
  for (const x of v.spots) {
    const k = x.status === 'sold' ? 'sold' : x.status === 'reserved' ? 'reserved' : 'free';
    for (const g of [out[itemOf(x)], out.all]) { g[k]++; g.total++; }
    if (x.own === 'sold' && !x.byTitle) out.revenue += Number(x.price) || 0;
    if (x.status === 'sold' && x.brand) brands.add(x.brand);
  }
  if (v.title.own === 'sold') out.revenue += Number(v.title.price) || 0;
  out.brands = [...brands].sort((a, b) => a.localeCompare(b, 'pt'));
  return out;
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const when = (h) => (h < 24 ? 'hoje' : h < 48 ? 'amanhã' : `em ${Math.ceil(h / 24)} dias`);
const joinPT = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

// The reservations whose last day ends within HOLD_SOON_H hours (the hold lapses at the end of its `until` day, UTC,
// as the site and the Espaços page read it), one row per brand and day
export function holdsEnding(raw, now) {
  if (!raw || !Array.isArray(raw.spots) || !raw.title) return [];
  const v = effective(raw, now), groups = new Map();
  const add = (x, label) => {
    const left = (Date.parse(`${x.until}T23:59:59Z`) - now) / 3600e3;
    if (!(left >= 0 && left < HOLD_SOON_H)) return;
    const k = `${x.brand || ''}\t${x.until}`;
    if (!groups.has(k)) groups.set(k, { brand: x.brand || 'sem marca', until: x.until, hours: left, labels: [], request: x.request || '' });
    groups.get(k).labels.push(label);
  };
  if (v.title.own === 'reserved' && v.title.until) add(v.title, 'fato completo');
  for (const x of v.spots) if (x.own === 'reserved' && !x.byTitle && x.until) add(x, pad2(x.n));
  return [...groups.values()].sort((a, b) => a.hours - b.hours);
}

// The «Avisos» rows: [{ key, kind: 'warn' | 'info', text, sub?, href }], warnings first. href is relative to /admin/.
// src: { now, day (Lisbon), spots (data/spots.json), pedidos (GET /pedidos .pedidos), contratos (GET /contratos
// .contratos), apoiantes (GET /apoiantes/admin), strava (data/strava.json) }
export function alerts(src) {
  const { now, day } = src, out = [];
  const pedidos = Array.isArray(src.pedidos) ? src.pedidos : null;
  if (pedidos) {
    const open = pedidos.filter((r) => r && r.status === 'novo');
    if (open.length) {
      const brands = [...new Set(open.map((r) => r.brand || 'sem marca'))];
      out.push({ key: 'pedidos', kind: 'warn', text: `${plural(open.length, 'pedido', 'pedidos')} à espera de pagamento`, sub: joinPT(brands.slice(0, 3)) + (brands.length > 3 ? ` e mais ${brands.length - 3}` : ''), href: 'espacos/#pedidos' });
    }
  }
  for (const h of holdsEnding(src.spots, now)) {
    out.push({ key: `reserva:${h.brand}:${h.until}`, kind: 'warn', text: `Reserva acaba ${when(h.hours)}: ${h.brand}`, sub: h.labels.length === 1 && h.labels[0] === 'fato completo' ? 'Fato completo' : `${h.labels.length === 1 ? 'Espaço' : 'Espaços'} ${joinPT(h.labels)}${h.request ? ` · pedido ${h.request}` : ''}`, href: h.request ? 'espacos/#pedidos' : 'espacos/#reservados' });
  }
  if (Array.isArray(src.contratos) && src.spots && Array.isArray(src.spots.spots)) {
    let due = [];
    try { due = dueNow(src.contratos, pedidos, src.spots, rulesOf(src.spots), day); } catch (_) { due = []; }
    // a paid request with no record is a payment still to write down: its own row
    for (const d of due.filter((x) => x.key.startsWith('registar:'))) out.push({ key: d.key, kind: 'warn', text: 'Pagamento por registar', sub: d.text, href: 'patrocinios/' });
    const rest = due.filter((x) => !x.key.startsWith('registar:'));
    const warn = rest.filter((x) => x.kind === 'warn'), info = rest.filter((x) => x.kind !== 'warn');
    for (const d of warn.slice(0, 4)) out.push({ key: d.key, kind: 'warn', text: d.text, href: 'patrocinios/' });
    if (warn.length > 4) out.push({ key: 'patrocinios-mais', kind: 'warn', text: `Mais ${plural(warn.length - 4, 'assunto', 'assuntos')} em Patrocínios`, href: 'patrocinios/' });
    const fim = info.find((x) => x.key === 'fim');
    if (fim) out.push({ key: 'fim', kind: 'info', text: fim.text, href: 'patrocinios/' });
    const other = info.filter((x) => x.key !== 'fim');
    if (other.length) out.push({ key: 'patrocinios-notas', kind: 'info', text: `${plural(other.length, 'nota', 'notas')} em Patrocínios`, sub: other[0].text, href: 'patrocinios/' });
  }
  const apo = src.apoiantes && Array.isArray(src.apoiantes.names) ? src.apoiantes.names : null;
  if (apo) {
    const waiting = apo.filter((x) => x && x.state === 'espera').length;
    if (waiting) out.push({ key: 'apoiantes', kind: 'info', text: `${plural(waiting, 'apoiante', 'apoiantes')} à espera de publicar`, sub: 'Só aparecem no site depois de «Publicar».', href: 'apoiantes/' });
  }
  const st = src.strava;
  if (st && st.connected === true) {
    const at = Date.parse(st.updated || '');
    const days = Number.isFinite(at) ? Math.floor((now - at) / 864e5) : Infinity;
    if (days > STRAVA_OLD_DAYS) out.push({ key: 'strava', kind: 'warn', text: Number.isFinite(days) ? `Dados do Strava com ${days} dias` : 'Dados do Strava sem data', sub: 'A sincronização diária parou. Vê a action «Strava sync» no GitHub.', href: 'strava/' });
  }
  return [...out.filter((x) => x.kind === 'warn'), ...out.filter((x) => x.kind !== 'warn')];
}

// the GoFundMe tile from data/gofundme.json: { value, sub } (value '—' while the campaign has no figure yet)
export function gofundmeTile(g) {
  if (!g || typeof g !== 'object' || !g.url) return { value: '—', sub: 'Sem campanha ligada' };
  const raised = Number(g.raised), goal = Number(g.goal);
  if (g.raised === null || g.raised === undefined || !Number.isFinite(raised)) return { value: '—', sub: `Meta ${money(goal || 0)} · sem números ainda` };
  const n = Number(g.supporters);
  return { value: money(raised), sub: [`de ${money(goal || 0)}`, Number.isFinite(n) && g.supporters !== null ? plural(n, 'apoio', 'apoios') : ''].filter(Boolean).join(' · ') };
}

// the Strava card's line from data/strava.json
export function stravaLine(st, now) {
  if (!st || st.connected !== true) return 'Por ligar: os treinos aparecem no site depois de ligado';
  const at = Date.parse(st.updated || '');
  if (!Number.isFinite(at)) return 'Ligado, sem data da última sincronização';
  const d = Math.floor((now - at) / 864e5);
  return d <= 0 ? 'Sincronizado hoje' : d === 1 ? 'Sincronizado ontem' : `Última sincronização há ${d} dias`;
}

// the supporters on the wall and waiting (GET /apoiantes/admin)
export function supporterCounts(doc) {
  if (!doc || !Array.isArray(doc.names)) return null;
  const pub = doc.names.filter((x) => x && x.state === 'publicado').length;
  return { published: pub, waiting: doc.names.length - pub, total: doc.names.length };
}

// the contracts of the season in force: how many, and what they brought in (GET /contratos)
export function contractStats(list, spots) {
  if (!Array.isArray(list)) return null;
  const season = spots && spots.seasonRules ? rulesOf(spots).season : null;
  const xs = list.filter((c) => c && (!season || String(c.season) === String(season)));
  return { n: xs.length, received: xs.reduce((a, c) => a + (Number(c.amount) || 0), 0), season };
}

export { plural, TITLE, daysBetween };
