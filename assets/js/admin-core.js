// Spot rules for the admin page (admin/index.html). Pure: no DOM, no fetch, no storage, so Node can test it
// against scripts/spot-update.mjs, the issue-form bot. applyAction() runs the bot's apply block statement by
// statement, so data/spots.json comes out byte for byte as the bot would write it and the public site
// (adspace.js) renders it unchanged. The price of a package is season-rules.js quote(), the one the site and the
// booking Worker use (the mid-season discount, then the bundle discount, then one rounding).
import { quote, seasonBp, pctText } from './season-rules.js';

export const REPO = 'rgvduarte/carmo';
export const BRANCH = 'gh-pages';
export const SPOTS_PATH = 'data/spots.json';
export const BRANDS = 'assets/img/brands';
export const MAX_LOGO = 3 * 1024 * 1024;   // the bot's MAX_LOGO: exactly 3 MB passes
export const TITLE = 'fato';               // the title package (whole suit), as the bot names it
export const SITE = 'https://gocarmo.com';

export const MSG = {
  needBrandSold: 'Para marcar como vendido, escreve o nome da marca.',
  needBrandReserve: 'Para reservar, escreve o nome da marca.',
  badUrl: 'O link não é válido (ex.: https://marca.pt ou @marca).',
  badDate: 'Data inválida (usa o calendário).',
  pastDate: 'Essa data já passou.',
  logoType: 'O logótipo tem de ser PNG, JPG, WebP ou SVG.',
  logoBig: 'O logótipo tem mais de 3 MB.',
  svgActive: 'Este SVG tem código ativo. Exporta-o em PNG.',
  svgBad: 'Este SVG não abre como imagem. Exporta-o em PNG.',
  svgRaster: 'Não consegui converter este SVG em PNG. Exporta-o em PNG.',
};

export class RuleError extends Error {}

export const pad2 = (n) => String(n).padStart(2, '0');
export const itemOf = (s) => s.item || 'suit';   // a spot without "item" is on the suit
export const todayUTC = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
// adspace.js lapsed(): a reservation lapses on its own once its `until` day is over (UTC)
export const lapsed = (x, now = Date.now()) => x.status === 'reserved' && !!x.until && Date.parse(`${x.until}T23:59:59Z`) < now;

// i18n.js fmtDay(iso, { year: false }) and money(), in PT: '26 out.', '3 000 €'
const PT_MON = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
export const fmtDay = (iso) => { const [, m, d] = String(iso).split('-').map(Number); return `${d} ${PT_MON[m - 1] || ''}`.trim(); };
const EUR = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
export const money = (n) => EUR.format(n);

export const targetOf = (data, id) => (id === TITLE ? data.title : data.spots.find((s) => s.id === id));
export const nameOf = (data, id) => (id === TITLE ? 'Fato completo' : targetOf(data, id)?.pt?.name || id);
export const labelOf = (data, id) => (id === TITLE ? 'Fato completo' : `${pad2(targetOf(data, id).n)} · ${nameOf(data, id)}`);
// spots in ascending n, the title last (the order the bot would be run in, one issue per spot)
export function sortTargets(data, ids) {
  const n = (id) => (id === TITLE ? Infinity : targetOf(data, id)?.n ?? Infinity);
  return [...new Set(ids)].sort((a, b) => n(a) - n(b));
}
// the public link of a spot: #fato/<id> on the suit, #capacete/<id> on the helmet, #fato for the title
export const liveLink = (data, id) => (id === TITLE ? `${SITE}/#fato` : `${SITE}/#${itemOf(targetOf(data, id)) === 'helmet' ? 'capacete' : 'fato'}/${id}`);

// ---------- inputs, normalised exactly like the bot ----------
export const normBrand = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);

export function normUrl(s) {
  let url = String(s ?? '').trim();
  if (url.startsWith('@')) {
    const handle = url.slice(1).replace(/[^\w.]/g, '');
    if (!handle) throw new RuleError(MSG.badUrl);   // stricter than the bot: a bare "@" is no link
    url = `https://www.instagram.com/${handle}/`;
  } else if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (url) { try { url = new URL(url).href; } catch (_) { throw new RuleError(MSG.badUrl); } }
  return url;
}

export function normUntil(s, today) {
  let u = String(s ?? '').trim();
  if (!u) u = addDays(today, 3);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(u) || Number.isNaN(Date.parse(u)) || new Date(u).toISOString().slice(0, 10) !== u) throw new RuleError(MSG.badDate);
  if (u < today) throw new RuleError(MSG.pastDate);
  return u;
}

// action: 'reserved' | 'sold' | 'available'. Both holds need a brand here (the bot asks for one only on a sale).
export function normalize(action, { brand = '', url = '', until = '' } = {}, today) {
  if (action === 'available') return { brand: '', url: '', until: '' };
  const b = normBrand(brand);
  if (!b) throw new RuleError(action === 'sold' ? MSG.needBrandSold : MSG.needBrandReserve);
  return { brand: b, url: normUrl(url), until: action === 'reserved' ? normUntil(until, today) : '' };
}

// ---------- the write (scripts/spot-update.mjs, "apply") ----------
// raw: the parsed file, never the effective view. brandFiles: the names under assets/img/brands at the base
// commit. logoExt: the new logo's extension, for a sale with a file. Returns the new data, its text and the
// files to write (all with the one logo blob) and delete.
export function applyAction(raw, ids, action, f, { today, brandFiles = [], logoExt = null } = {}) {
  if (!['reserved', 'sold', 'available'].includes(action)) throw new RuleError('Estado inválido.');
  if (logoExt && !STORED.includes(logoExt)) throw new RuleError('Um SVG não vai para o site tal como está: a página converte-o primeiro em PNG.');
  const data = structuredClone(raw);
  const writes = [], deletes = new Set();
  const filesOf = (id) => brandFiles.filter((name) => name.startsWith(`${id}.`)).map((name) => `${BRANDS}/${name}`);
  for (const id of sortTargets(data, ids)) {
    const target = targetOf(data, id);
    if (!target) throw new RuleError(`O espaço "${id}" não existe em data/spots.json.`);
    const prevBrand = target.brand;
    for (const k of ['brand', 'url', 'until', 'request']) delete target[k];   // request: a hold placed by the site
    target.status = action;
    // a logo belongs to the brand that bought the spot: it goes when the spot is freed, held or changes hands
    if (action !== 'sold' || f.brand !== prevBrand) { delete target.logo; delete target.logoMono; filesOf(id).forEach((p) => deletes.add(p)); }
    if (f.brand && action !== 'available') target.brand = f.brand;
    if (f.url && action !== 'available') target.url = f.url;
    if (action === 'reserved') target.until = f.until;
    if (action === 'sold' && logoExt) {
      filesOf(id).forEach((p) => deletes.add(p));
      const path = `${BRANDS}/${id}.${logoExt}`;
      writes.push(path);
      target.logo = path;
    }
  }
  data.updated = today;
  for (const p of writes) deletes.delete(p);   // replacing peito.png with peito.png is one tree entry
  return { data, text: `${JSON.stringify(data, null, 2)}\n`, writes, deletes: [...deletes] };
}

// ---------- what the site shows (adspace.js initAdspace, lines 43-51), plus flags for the list ----------
// own: the spot's own status after a lapse, before the title overlay. expired: the lapsed hold.
// byTitle: the status comes from the title package.
export function effective(raw, now = Date.now()) {
  const v = structuredClone(raw);
  for (const x of [...v.spots, v.title]) {
    if (lapsed(x, now)) { x.expired = { brand: x.brand, until: x.until }; x.status = 'available'; }
    x.own = x.status;
  }
  const T = v.title;
  if (T.status === 'reserved') for (const s of v.spots) if (itemOf(s) === 'suit' && s.status === 'available') Object.assign(s, { status: 'reserved', until: T.until, byTitle: true });
  if (T.status === 'sold') {
    for (const s of v.spots) if (itemOf(s) === 'suit' && s.status !== 'sold') Object.assign(s, { status: 'sold', brand: T.brand, url: T.url, byTitle: true });
    const top = v.spots.find((s) => s.top);
    if (top && T.logo && !top.logo) Object.assign(top, { logo: T.logo, logoMono: T.logoMono, titleLogo: true });
  }
  return v;
}

// the chip on a row, and its second line
export function statusOf(v, x, today) {
  const T = v.title;
  if (x.byTitle) return x.status === 'sold'
    ? { key: 'sold', chip: `Vendido · ${T.brand || 'fato completo'} (fato completo)` }
    : { key: 'reserved', chip: `Reservado até ${fmtDay(T.until)} (fato completo)`, sub: T.brand };
  if (x.status === 'sold') return { key: 'sold', chip: x.brand ? `Vendido · ${x.brand}` : 'Vendido', sub: [x.logo ? 'com logótipo' : 'sem logótipo', hostOf(x.url)].filter(Boolean).join(' · ') };
  if (x.status === 'reserved') {
    const d = daysBetween(today, x.until);
    const chip = d <= 0 ? 'Reservado até hoje · último dia' : `Reservado até ${fmtDay(x.until)} · ${d === 1 ? 'falta 1 dia' : `faltam ${d} dias`}`;
    return { key: 'reserved', chip, sub: x.brand };
  }
  if (x.expired) return { key: 'expired', chip: 'Reserva expirada', sub: `era ${x.expired.brand || 'sem marca'} até ${fmtDay(x.expired.until)}` };
  return { key: 'available', chip: 'Livre' };
}
const hostOf = (u) => { try { return u ? new URL(u).host.replace(/^www\./, '') : ''; } catch (_) { return ''; } };

// ---------- guards (on the effective view) ----------
// blocked: the action cannot go ahead. confirms: it can, after a yes. brand: the normalised brand, or
// undefined before the sheet is filled in (then only the checks that do not depend on it run). until: the
// reservation's new last day, when known.
export function guard(raw, now, ids, action, brand, until) {
  const v = effective(raw, now), T = v.title, blocked = [], confirms = [];
  const known = brand !== undefined;
  const titleHeld = T.status === 'reserved' || T.status === 'sold';
  for (const id of sortTargets(raw, ids)) {
    const x = targetOf(v, id), r = targetOf(raw, id);
    if (!x || !r) { blocked.push(`O espaço ${id} já não existe.`); continue; }
    const lbl = labelOf(raw, id), who = r.brand || 'sem marca';   // the stored brand: the title overlay rewrites the view's
    if (action === 'available') {
      if (x.byTitle && r.status === 'available') blocked.push(`${lbl} está no fato completo: liberta o fato completo.`);
      else if (r.status === 'available') blocked.push(`${lbl} já está livre.`);
      continue;
    }
    // while the whole suit is held, no suit spot is sold or held on its own (the helmet is not part of it)
    if (id !== TITLE && itemOf(r) === 'suit' && titleHeld) {
      blocked.push(T.status === 'sold'
        ? `O fato completo está vendido a ${T.brand || 'sem marca'}: liberta primeiro o fato completo.`
        : `O fato completo está reservado até ${fmtDay(T.until)}: liberta primeiro o fato completo.`);
      continue;
    }
    if (id === TITLE) {
      // the whole suit: every suit spot free (a lapsed hold counts as free) or held by the very same brand
      const held = v.spots.filter((s) => itemOf(s) === 'suit' && s.own !== 'available').map((s) => targetOf(raw, s.id));
      const others = known ? held.filter((s) => s.brand !== brand) : (new Set(held.map((s) => s.brand)).size > 1 ? held : []);
      if (others.length) { blocked.push(`Liberta primeiro: ${others.map((s) => `${labelOf(raw, s.id)} (${s.brand || 'sem marca'})`).join(', ')}.`); continue; }
    }
    if (action === 'reserved' && x.own === 'sold') { blocked.push(`${lbl} já está vendido a ${who}. Liberta-o primeiro.`); continue; }
    if (!known) continue;
    if (x.own === 'reserved' && r.brand !== brand) confirms.push(action === 'reserved'
      ? `${lbl}: substitui a reserva de ${who} (até ${fmtDay(r.until)}).`
      : `${lbl}: estava reservado para ${who} (até ${fmtDay(r.until)}). Passa a ${brand}.`);
    // the same brand asking for one more spot must not cut its longer hold short without a word
    if (action === 'reserved' && x.own === 'reserved' && r.brand === brand && until && r.until && until < r.until)
      confirms.push(`${lbl}: a reserva de ${who} acabava a ${fmtDay(r.until)}; passa a acabar a ${fmtDay(until)}`);
    if (x.own === 'sold' && r.brand !== brand) confirms.push(`${lbl}: vendido a ${who}. Fica de ${brand}${r.logo ? ` e o logótipo de ${who} sai do site` : ''}.`);
  }
  return { blocked: [...new Set(blocked)], confirms };
}

// the reservations the targets hold now (a lapsed one is gone), for the sheet and the default date
export function holds(raw, now, ids) {
  const v = effective(raw, now);
  return sortTargets(raw, ids).map((id) => ({ id, x: targetOf(v, id), r: targetOf(raw, id) }))
    .filter(({ x, r }) => x && r && x.own === 'reserved' && r.until).map(({ id, r }) => ({ id, brand: r.brand || '', until: r.until }));
}
// today + 3, or later when the same brand already holds a selected spot for longer
export function defaultUntil(raw, now, ids, brand) {
  const d = addDays(todayUTC(now), 3);
  const held = brand ? holds(raw, now, ids).filter((h) => h.brand === brand).map((h) => h.until).sort().pop() : '';
  return held && held > d ? held : d;
}

// what the admin saw of each target when the sheet opened; a save stops if any of it changed meanwhile
export function snapshot(raw, ids) {
  const pick = (t) => (t ? { status: t.status, brand: t.brand, url: t.url, until: t.until, logo: t.logo, logoMono: t.logoMono } : null);
  return Object.fromEntries(ids.map((id) => [id, JSON.stringify(pick(targetOf(raw, id)))]));
}
export function changedSince(snap, raw) {
  const fresh = snapshot(raw, Object.keys(snap));
  return Object.keys(snap).filter((id) => fresh[id] !== snap[id]);
}

// ---------- payment reference: 'CARMO 01 21 22', 'carmo 1,21', 'CARMO-01-21', 'CARMO FATO' ----------
// The site writes CARMO; it used to write KONA, and references already sent that way keep matching: either word starts
// the run. Only the run of codes right after it counts. A pasted bank line may carry a date before it and
// an amount after the codes ('TRF CARMO 21 22 600,00 EUR', 'KONA 21 · 20,00 €', 'CARMO 03 1 080,00'): the run stops at
// the first word that is not a code, at an amount and at any number of three or more digits. The payee's own name comes
// before the code in many bank lines ('GONCALO CARMO CARMO 01'): a CARMO with no code after it is passed over for the
// next one.
const REF_PREFIX = /CARMO|KONA/g;
const REF_SEP = /[\s;·|+&#-]+/;
const REF_LIST = /^\d{1,2}(?:[.,]\d{1,2})*$/;   // '01', '1,21', '01.21'
// '20,00', '600.00' and '1,00' are amounts; '1,21' is spots 1 and 21 (no price has cents)
const isAmount = (t) => { const m = t.match(/^(\d+)[.,](\d{2})$/); return !!m && (m[1].length >= 3 || m[2] === '00'); };
// the codes of a run of text (after a prefix, or a whole text without one)
function refRun(s) {
  const parts = s.split(REF_SEP).map((t) => t.replace(/^[.,]+|[.,]+$/g, '')).filter(Boolean);
  const toks = [];
  for (let i = 0; i < parts.length; i++) {
    const t = parts[i];
    if (t === 'FATO' || t === 'APOIO') { toks.push(t); continue; }
    if (t === 'E') continue;   // 'CARMO 21 E 22'
    if (isAmount(t) || !REF_LIST.test(t)) break;
    if (/^\d$/.test(t) && /^\d{3}(?:[.,]\d{2})?$/.test(parts[i + 1] || '')) break;   // '1 080,00': an amount's first digit
    toks.push(...t.split(/[.,]/));
  }
  return toks;
}
// { prefix: 'CARMO' | 'KONA' | '', toks }: the first CARMO or KONA with codes after it (no prefix at all: the whole text)
function refOfText(text) {
  const up = String(text || '').toUpperCase(), hits = [...up.matchAll(REF_PREFIX)];
  if (!hits.length) return { prefix: '', toks: refRun(up) };
  for (const m of hits) {
    const toks = refRun(up.slice(m.index + m[0].length));
    if (toks.length) return { prefix: m[0], toks };
  }
  return { prefix: hits[0][0], toks: [] };
}
export const refTokens = (text) => refOfText(text).toks;
export function parseRef(text, data) {
  const { prefix, toks } = refOfText(text);
  const out = { ids: [], unknown: [], note: '' };
  if (toks.includes('APOIO') && !toks.some((x) => x !== 'APOIO')) { out.note = `${prefix || 'CARMO'} APOIO é um donativo, não um espaço.`; return out; }
  const nums = [...new Set(toks.filter((x) => /^\d+$/.test(x)).map(Number))];
  if (toks.includes('FATO')) {
    out.ids = [TITLE];
    const rest = nums.map((n) => data.spots.find((x) => x.n === n)).filter(Boolean);
    if (rest.length) out.note = rest.every((x) => itemOf(x) === 'helmet') ? 'O fato completo vai sozinho; o capacete trata-se à parte.' : 'O fato completo vai sozinho; os outros espaços tratam-se à parte.';
    return out;
  }
  for (const n of nums) {
    const sp = data.spots.find((x) => x.n === n);
    if (sp) out.ids.push(sp.id); else out.unknown.push(n);
  }
  return out;
}

// the expected payment: season-rules.js quote(), as the site (adspace.js totals()) and the Worker work it out. opts.day:
// the Lisbon day of the request (default today: the price of a request made now); opts.m: the season month a pasted
// message states (wins over the day). disc: the bundle discount as a fraction (0.1), discPct the same in percent;
// m, midSeason, seasonBp: the mid-season discount (m = 0: none); steps: { season, bundle }, the euros each one takes off.
export function totals(data, ids, { day, m } = {}) {
  const q = quote(data, ids.includes(TITLE) ? [TITLE] : ids, { day, m });
  return { gross: q.gross, net: q.net, disc: q.discPct / 100, discPct: q.discPct, m: q.m, midSeason: q.midSeason, seasonBp: q.seasonBp, steps: q.steps, day: q.day };
}
// «Desconto de época (março): −6,25%» for a season month m (and its basis points, when known)
export const SEASON_MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const seasonLine = (m, bp) => (m > 0 ? `Desconto de época (${SEASON_MONTHS[m - 1]}): −${pctText(bp || seasonBp(m))}%` : '');
// the bracket after a total: «(1 100 € −6,25% −10%)», '' when nothing is off
export function totalNote(t) {
  const parts = [t.seasonBp ? `−${pctText(t.seasonBp)}%` : '', t.discPct ? `−${t.discPct}%` : ''].filter(Boolean);
  return parts.length ? `(${money(t.gross)} ${parts.join(' ')})` : '';
}

// ---------- a pasted request: the site's message (WhatsApp, email, Instagram) or its gocarmo.com link ----------
// adspace.js message() writes, in PT or EN (i18n.js msg.*):
//   Olá Gonçalo, gostava de patrocinar o teu capacete na época 2027.
//
//   Espaços:                                     or   Fato completo (Title partner): 3 000 €
//   • 21 Topo do capacete (6×13 cm) · 400 €           (the email may leave the sizes out)
//   Total: 540 € (600 € −10%)
//   Marca: … / Nome: … / Email: … / Telefone: … / NIF: …     (Email and Telefone since 31.10.2026; EN Phone)
//   Referência: CARMO 21 22                          (KONA 21 22 in an older request)
//   Pagamento: transferência ou MB WAY                («MB WAY», «transferência bancária»; EN «Payment: …»)
//
//   the buyer's own message, then the link: https://gocarmo.com/#pacote=capacete-topo,… or …/#fato/title
// The link names the spots by id, so it wins over the list (unless it was cut short); the list is read by name, then by
// number; the CARMO line comes last. A text with none of this is a bare payment reference: parseRef, as before.
// parsePaste() returns { kind: 'ref' | 'link' | 'request', ids, from, unknown, notes, brand, name, email, phone, nif, nifOk,
// pay, ref, stated, lang, request } (email and phone '' in a message from before they were asked for); for kind 'ref',
// parseRef's { ids, unknown, note }.
const LINE = {
  brand: /^(?:marca|brand)\s*:\s*(.*)$/i,
  name: /^(?:nome|name)\s*:\s*(.*)$/i,
  email: /^e-?mail\s*:\s*(.*)$/i,
  phone: /^(?:telefone|telem[oó]vel|phone|tel\.?)\s*:\s*(.*)$/i,
  nif: /^(?:nif|nipc|vat(?:\s*(?:number|no\.?))?)\s*:\s*(.*)$/i,
  ref: /^(?:refer[eê]ncia|reference)\s*:\s*(.*)$/i,
  pay: /^(?:pagamento|payment)\s*:\s*(.*)$/i,
  total: /^total\s*:\s*(.*)$/i,
  title: /^(?:fato completo|whole suit)\b[^:]*:\s*(.*)$/i,
  request: /^(?:pedido|request)\s*:\s*([0-9a-z]{10})\s*$/i,   // the Worker's id (worker/requests.js), once the site sends it
  // the mid-season discount (i18n.js msg.season): «Desconto de época (março, mês 3): −6,25%», «Mid-season discount
  // (March, month 3): −6.25%». The month NUMBER is what the price is worked out with; the month's name and the percent
  // are for the reader, and are only checked against it. No such line: m = 0 (a request up to 31 January).
  season: /^(?:desconto de [eé]poca|mid-season discount)\s*\([^)]*?\b(?:m[eê]s|month)\s+(\d{1,2})\s*\)\s*:\s*[−-]\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*%\s*$/iu,
  hi: /^(?:ol[aá]|hi|hello)\s+gon[cç]alo\b/i,
  spots: /^(?:espa[cç]os|spots)\s*:\s*$/i,
  bullet: /^[•·*\-–]\s*(\d{1,2})\s+(.+)$/,
};
const PT_KEYS = /^(?:ola|espacos|marca|nome|telefone|telemovel|referencia|pagamento|fato|desconto)\b/;   // on fold()ed text
// month names in a season line, folded: [['janeiro', 'january'], …]
const MONTH_WORDS = [['janeiro', 'january'], ['fevereiro', 'february'], ['marco', 'march'], ['abril', 'april'], ['maio', 'may'], ['junho', 'june'], ['julho', 'july'], ['agosto', 'august'], ['setembro', 'september'], ['outubro', 'october'], ['novembro', 'november'], ['dezembro', 'december']];
// a copied WhatsApp chat starts each message with '[14:05, 23/10/2026] Nome: ' (or '23/10/26, 14:05 - Nome: ' in an
// exported one); a reply by email quotes with '> '
const QUOTE = /^(?:\s*>)+\s?/, WA_COPY = /^\[[^\]\n]{4,40}\]\s*[^:\n]{1,60}:\s+/, WA_EXPORT = /^\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?\s?m\.?)?\s+-\s+[^:\n]{1,60}:\s+/i;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// '1 080 €', '€1,080', '600,00 €', '1.080,00 €' -> the first whole amount in euros, or null
export function parseMoney(s) {
  const m = String(s || '').match(/\d{1,3}(?:[\s.,]\d{3})+(?!\d)|\d+/);
  return m ? Number(m[0].replace(/\D/g, '')) : null;
}
// a Portuguese NIF (nine digits, the last one a check digit): true or false; null for anything else (a foreign VAT
// number is only shown)
export function nifOk(nif) {
  const d = String(nif || '').replace(/^PT/i, '').replace(/[\s.-]/g, '');
  if (!/^\d{9}$/.test(d)) return null;
  const sum = [...d.slice(0, 8)].reduce((a, c, i) => a + Number(c) * (9 - i), 0);
  const check = 11 - (sum % 11);
  return (check >= 10 ? 0 : check) === Number(d[8]);
}
// how the buyer will pay: 'mb' (MB WAY), 'tr' (bank transfer), 'either' (the site offered both), '' (not said)
export function payOf(text) {
  const t = fold(text), mb = /\bmb ?way\b/.test(t), tr = /transfer|bank|banc/.test(t);
  return mb && tr ? 'either' : mb ? 'mb' : tr ? 'tr' : '';
}
export const PAY_LABEL = { mb: 'MB WAY', tr: 'Transferência', either: 'Transferência ou MB WAY' };
// the payment reference the site shows for these targets (adspace.js payRef)
export const refOf = (data, ids) => (ids[0] === TITLE ? 'CARMO FATO' : `CARMO ${sortTargets(data, ids).map((id) => pad2(targetOf(data, id).n)).join(' ')}`);

// one line of the list: by its name first (the numbers could have moved), else by its number
function spotOfLine(data, n, label) {
  const want = fold(label);
  const names = (s) => [s.pt?.name, s.en?.name, s.pt?.short, s.en?.short].filter(Boolean).map(fold);
  const byName = want ? data.spots.find((s) => names(s).includes(want)) : null;
  if (byName) return { spot: byName, note: byName.n !== n ? `O pedido diz «${pad2(n)} ${label}»: esse espaço agora é o ${pad2(byName.n)}.` : '' };
  const byN = data.spots.find((s) => s.n === n);
  return { spot: byN || null, note: byN && want ? `O pedido diz «${pad2(n)} ${label}»; o ${pad2(n)} agora é ${byN.pt.name}.` : '' };
}

export function parsePaste(text, data) {
  const src = String(text || '');
  const lines = src.split(/\r?\n/).map((l) => l.replace(QUOTE, '').replace(WA_COPY, '').replace(WA_EXPORT, '').trim());
  const out = { kind: 'request', ids: [], from: '', unknown: [], notes: [], brand: '', name: '', email: '', phone: '', nif: '', nifOk: null, pay: '', ref: '', stated: null, lang: '', request: '' };
  const linkTitle = /#fato\/title(?![\w-])/i.test(src);
  const pk = src.match(/#pacote=([A-Za-z0-9%,_-]+)/i);
  const one = pk || linkTitle ? null : src.match(/gocarmo\.com\/?#(?:fato|capacete)\/([a-z0-9-]+)/i);
  let linkIds = null;
  if (pk || one) {
    let raw = pk ? pk[1] : one[1];
    try { raw = decodeURIComponent(raw); } catch (_) {}
    linkIds = [...new Set(raw.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean))];
  }
  const listed = [], seen = new Set();
  let titleLine = null, looks = false, inList = false;
  const lang = (l) => { if (!out.lang) out.lang = PT_KEYS.test(fold(l)) ? 'pt' : 'en'; };
  // the site's list always comes under «Espaços:»; without that line (a part of the text), any line with its bullet
  const header = lines.some((l) => LINE.spots.test(l));
  for (const l of lines) {
    if (!l) continue;
    let m;
    if (LINE.hi.test(l) || LINE.spots.test(l)) { looks = true; inList = LINE.spots.test(l); lang(l); continue; }
    // a spot: under «Espaços:» (the buyer's own '- 2 dias' or '• …' further down is not one)
    if ((m = l.match(LINE.bullet)) && (inList || (!header && l.startsWith('•')))) {
      looks = true;
      const rest = m[2], cut = rest.lastIndexOf(' · ');
      const label = (cut >= 0 ? rest.slice(0, cut) : rest).replace(/\s*\([^)]*\)\s*$/, '').trim();
      listed.push({ n: Number(m[1]), label, price: cut >= 0 ? parseMoney(rest.slice(cut + 3)) : null });
      continue;
    }
    inList = false;
    if (!out.request && (m = l.match(LINE.request))) { out.request = m[1].toUpperCase(); looks = true; continue; }
    if (!seen.has('season') && (m = l.match(LINE.season))) {
      seen.add('season'); looks = true;
      const n = Number(m[1]), said = m[2].replace('.', ',');
      if (n < 2 || n > 11) { out.notes.push(`Mês do desconto de época inválido (mês ${n}): conto o preço sem esse desconto.`); continue; }
      out.m = n;
      const want = pctText(seasonBp(n));
      if (said !== want) out.notes.push(`A percentagem não bate com o mês ${n} (o pedido diz −${said}%; o mês ${n} dá −${want}%).`);
      // the month's name, when the line has one, against its number
      const named = MONTH_WORDS.findIndex((w) => w.some((x) => fold(l.slice(0, l.indexOf(')'))).split(' ').includes(x)));
      if (named >= 0 && named + 1 !== n) out.notes.push(`O mês escrito no desconto de época não bate com o mês ${n}.`);
      continue;
    }
    for (const k of ['brand', 'name', 'email', 'phone', 'nif', 'ref', 'pay', 'total', 'title']) {
      if (seen.has(k) || !(m = l.match(LINE[k]))) continue;
      seen.add(k); looks = true;
      const v = m[1].trim();
      if (k === 'brand') out.brand = normBrand(v);
      else if (k === 'name') out.name = v.slice(0, 80);
      // (a mail app may have turned it into a link: «nome@marca.pt <mailto:nome@marca.pt>»)
      else if (k === 'email') out.email = ((v.match(/[^\s<>()"':]+@[^\s<>()"']+/) || [v])[0]).slice(0, 120);
      else if (k === 'phone') out.phone = v.slice(0, 30);
      else if (k === 'nif') out.nif = v.slice(0, 20);
      else if (k === 'ref') out.ref = v.slice(0, 40);
      else if (k === 'pay') out.pay = payOf(v);
      else if (k === 'total') out.stated = parseMoney(v);
      else titleLine = parseMoney(v);
      if (k !== 'nif' && k !== 'total' && k !== 'email') lang(l);
      break;
    }
  }
  if (!looks && !linkIds && !linkTitle) return { ...parseRef(src, data), kind: 'ref' };
  if (!looks) out.kind = 'link';
  out.nifOk = out.nif ? nifOk(out.nif) : null;

  // the spots: the link, else the whole suit, else the list, else the CARMO line
  const fromList = [], listNotes = [], listUnknown = [];
  for (const it of listed) {
    const { spot, note } = spotOfLine(data, it.n, it.label);
    if (!spot) { listUnknown.push(`${pad2(it.n)} ${it.label}`.trim()); continue; }
    if (fromList.includes(spot.id)) continue;
    fromList.push(spot.id);
    if (note) listNotes.push(note);
    if (it.price != null && it.price !== spot.price) listNotes.push(`${labelOf(data, spot.id)}: o pedido diz ${money(it.price)}, agora custa ${money(spot.price)}.`);
  }
  const refIds = out.ref ? parseRef(out.ref, data).ids : [];
  const same = (a, b) => { const x = sortTargets(data, a), y = sortTargets(data, b); return x.length === y.length && x.every((v, i) => v === y[i]); };
  const useList = () => { out.ids = sortTargets(data, fromList); out.from = 'list'; out.unknown.push(...listUnknown); out.notes.push(...listNotes); };
  if (linkTitle) { out.ids = [TITLE]; out.from = 'link'; }
  else if (linkIds) {
    const known = linkIds.filter((id) => data.spots.some((s) => s.id === id));
    // a long link wrapped by the mail app loses its end (a trailing comma, or half an id): the list names every spot
    const cut = /,$/.test(pk ? pk[1] : '') || !known.includes(linkIds[linkIds.length - 1]);
    if (cut && fromList.length && known.length < fromList.length && known.every((id) => fromList.includes(id))) {
      useList();
      out.notes.push('O link do pedido vem cortado: fico com a lista de espaços.');
    } else {
      out.ids = sortTargets(data, known); out.from = 'link';
      out.unknown.push(...linkIds.filter((id) => !known.includes(id)));
      out.notes.push(...listNotes);
      if (fromList.length && !same(fromList, known)) out.notes.push('A lista de espaços e o link do pedido não batem certo: fico com o link.');
    }
  }
  else if (titleLine !== null) { out.ids = [TITLE]; out.from = 'title'; }
  else if (fromList.length || listUnknown.length) useList();
  if (!out.ids.length && refIds.length) { out.ids = sortTargets(data, refIds); out.from = 'ref'; }
  if (out.ids[0] === TITLE && out.stated === null) out.stated = titleLine;

  // what the pieces say against each other and against the prices of now
  if (out.ids.length && refIds.length && !same(refIds, out.ids)) out.notes.push(`A referência ${out.ref} não bate com estes espaços (seria ${refOf(data, out.ids)}).`);
  if (out.ids.length && out.stated !== null) {
    const t = totals(data, out.ids, { m: out.m ?? 0 });
    if (t.net !== out.stated) out.notes.push(`O pedido diz ${money(out.stated)}; com os preços de agora${t.m ? ` e o desconto de época de ${SEASON_MONTHS[t.m - 1]}` : ''} são ${money(t.net)}.`);
  }
  if (out.nifOk === false) out.notes.push(`O NIF ${out.nif} não bate certo (o último algarismo não confere). Confirma com a marca antes do recibo.`);
  return out;
}

// ---------- the payment of a request, when it is confirmed (POST /pedidos/<id> confirmar { paidAt, amount }) ----------
// paidAt: a real day from 1 January 2026 to tomorrow (Lisbon, the Worker's own limits); amount: whole euros, 0 to 100 000
// ('1 100', '563 €' are fine; cents are not). today: the Lisbon day. Returns { paidAt, amount } or throws a RuleError.
export const FIRST_PAID = '2026-01-01';
export const MAX_AMOUNT = 100000;
export function normPaid(paidAt, amount, today) {
  const d = String(paidAt ?? '').trim();
  if (!d) throw new RuleError('Escreve a data do pagamento.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(d)) || new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) !== d) throw new RuleError(MSG.badDate);
  if (d < FIRST_PAID) throw new RuleError('A data do pagamento é anterior a 2026.');
  if (d > addDays(today, 1)) throw new RuleError('A data do pagamento ainda não chegou.');
  const a = String(amount ?? '').replace(/[\s\u00a0\u202f€]/g, '');
  if (!a) throw new RuleError('Escreve o montante recebido, em euros.');
  if (!/^\d+$/.test(a)) throw new RuleError('O montante é em euros, sem cêntimos (por exemplo 563).');
  const n = Number(a);
  if (n > MAX_AMOUNT) throw new RuleError(`O montante passa de ${money(MAX_AMOUNT)}.`);
  return { paidAt: d, amount: n };
}

// ---------- holds placed by the site (worker/requests.js) ----------
export const HOLD_HOURS = 48;
// the last day of a hold placed now: the UTC date 48 hours from now; the site frees it once that day is over
export const holdUntil = (now = Date.now()) => new Date(now + HOLD_HOURS * 3600e3).toISOString().slice(0, 10);
// the moment a hold lapses (lapsed(): after 23:59:59 UTC of its last day)
export const holdEnd = (until) => Date.parse(`${until}T23:59:59Z`);
// 'Reservado até 25 out. · faltam 58 h', or 'Expirou a 25 out.'
export function holdLeft(until, now = Date.now()) {
  const end = until ? holdEnd(until) : NaN;
  if (Number.isNaN(end)) return { lapsed: false, hours: null, text: '' };
  if (end < now) return { lapsed: true, hours: 0, text: `Expirou a ${fmtDay(until)}` };
  const h = Math.floor((end - now) / 3600e3);
  const left = h < 1 ? 'falta menos de 1 h' : h === 1 ? 'falta 1 h' : h < 72 ? `faltam ${h} h` : `faltam ${Math.floor(h / 24)} dias`;
  return { lapsed: false, hours: h, text: `Reservado até ${fmtDay(until)} · ${left}` };
}

// ---------- commit message: 'Espaços 01 e 21 vendidos a Marca X (admin)' ----------
export const joinPT = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
export function commitMessage(data, ids, action, f) {
  const sorted = sortTargets(data, ids), many = sorted.length > 1;
  const label = sorted[0] === TITLE ? 'Fato completo' : `${many ? 'Espaços' : 'Espaço'} ${joinPT(sorted.map((id) => pad2(targetOf(data, id).n)))}`;
  const s = many ? 's' : '';
  if (action === 'sold') return `${label} vendido${s} a ${f.brand} (admin)`;
  if (action === 'reserved') return `${label} reservado${s} para ${f.brand} até ${f.until} (admin)`;
  return `${label} libertado${s} (admin)`;
}

// ---------- logo files ----------
// the type comes from the bytes, not from the name or the browser's guess
export function sniffLogo(bytes) {
  const b = bytes;
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'webp';
  const head = new TextDecoder('utf-8').decode(b.subarray(0, 4096)).replace(/^﻿/, '');
  const rest = head.replace(/^\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>\s*)?(<!--[\s\S]*?-->\s*)*/i, '');
  if (/^<svg[\s>]/.test(rest)) return 'svg';
  return null;
}
export const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };
// What may go to assets/img/brands. A logo is served from gocarmo.com, the origin that keeps the admin token, and an
// SVG opened on its own is a document there that runs its scripts. So the page draws an SVG onto a canvas and
// uploads that PNG: the brand's SVG bytes never reach the site. The checks below only explain early why a file
// will not do; they are not what keeps the site safe.
export const STORED = ['png', 'jpg', 'webp'];

// a quick look at the text (the page also checks the parsed file, svgProblem)
export function svgSafe(text) {
  if (/<script|<foreignObject|<iframe|<embed|<object|<!ENTITY|\son[a-z]+\s*=|javascript:/i.test(text)) return false;
  for (const m of text.matchAll(/(?:^|[\s"'])(?:xlink:)?href\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const ref = m[2].trim();
    if (!ref.startsWith('#') && !/^data:image\//i.test(ref)) return false;
  }
  for (const m of text.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)) {
    const ref = m[2].trim();
    if (!ref.startsWith('#') && !/^data:image\//i.test(ref)) return false;
  }
  if (/@import/i.test(text)) return false;
  return true;
}

// checks a picked file's bytes; returns { ext, mime } or throws a RuleError with the message to show
export function checkLogo(bytes) {
  if (bytes.length > MAX_LOGO) throw new RuleError(MSG.logoBig);
  const ext = sniffLogo(bytes);
  if (!ext) throw new RuleError(MSG.logoType);
  if (ext === 'svg' && !svgSafe(new TextDecoder('utf-8').decode(bytes))) throw new RuleError(MSG.svgActive);
  return { ext, mime: MIME[ext] };
}
export const logoPath = (id, ext) => `${BRANDS}/${id}.${ext}`;

// Only UTF-8: another declared encoding can hide markup from a UTF-8 reader (ISO-2022-JP: '<scr\x1b(Bipt>').
export function svgEncodingProblem(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { return MSG.svgBad; }
  const decl = text.replace(/^\uFEFF/, '').match(/^\s*<\?xml\b[^>]*?\bencoding\s*=\s*["']([^"']*)["']/i);
  if (decl && !/^utf-?8$/i.test(decl[1].trim())) return MSG.svgActive;
  if (/\x1b/.test(text)) return MSG.svgActive;
  return null;
}

// The parsed file (DOMParser, 'image/svg+xml'): entities and prefixes are resolved by then, so <s:script>, <h:iframe>
// and l:href="&#106;avascript:" are seen for what they are. Returns the message to show, or null.
const SVG_NS = 'http://www.w3.org/2000/svg';
const ACTIVE = new Set(['script', 'foreignobject', 'iframe', 'embed', 'object', 'handler', 'listener', 'audio', 'video']);
const ANIM = new Set(['animate', 'set', 'animatetransform', 'animatemotion', 'discard']);
const okRef = (v) => v.startsWith('#') || /^data:image\/(png|jpeg|webp|gif)[;,]/i.test(v);
const badUrl = (t) => [...String(t).matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)].some((m) => !okRef(m[2].trim()));
export function svgProblem(doc) {
  const root = doc && doc.documentElement;
  if (!root || doc.getElementsByTagName('parsererror').length || root.namespaceURI !== SVG_NS || root.localName !== 'svg') return MSG.svgBad;
  if ([...doc.childNodes].some((c) => c.nodeType === 7)) return MSG.svgActive;   // <?xml-stylesheet href=…?>
  for (const n of [root, ...root.getElementsByTagName('*')]) {
    if (n.namespaceURI !== SVG_NS) return MSG.svgActive;   // XHTML, MathML or any other markup inside
    const tag = n.localName.toLowerCase();
    if (ACTIVE.has(tag)) return MSG.svgActive;
    if (ANIM.has(tag)) {
      const target = (n.getAttribute('attributeName') || '').replace(/^.*:/, '').toLowerCase();
      if (target === 'href' || target.startsWith('on') || tag === 'discard') return MSG.svgActive;
    }
    for (const a of n.attributes) {
      const name = a.localName.toLowerCase(), val = a.value.trim();
      if (name.startsWith('on')) return MSG.svgActive;
      if (name === 'href' && !okRef(val)) return MSG.svgActive;   // any namespace: href, xlink:href, l:href
      if (/^\s*(java|vb)script:/i.test(val) || badUrl(val)) return MSG.svgActive;
    }
    if (tag === 'style' && (/@import/i.test(n.textContent) || badUrl(n.textContent))) return MSG.svgActive;
  }
  return null;
}

// the size to draw an SVG at: its width/height, else its viewBox (null if it gives neither)
export function svgSize(doc) {
  const r = doc.documentElement;
  const num = (v) => { const m = String(v || '').trim().match(/^(\d*\.?\d+)(px)?$/); return m ? parseFloat(m[1]) : 0; };
  let w = num(r.getAttribute('width')), h = num(r.getAttribute('height'));
  const vb = String(r.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const hasVb = vb.length === 4 && vb[2] > 0 && vb[3] > 0;
  if ((!w || !h) && hasVb) {
    if (w) h = (w * vb[3]) / vb[2];
    else if (h) w = (h * vb[2]) / vb[3];
    else { w = vb[2]; h = vb[3]; }
  }
  return w > 0 && h > 0 ? { w, h } : null;
}
// canvas size for an SVG of this size: the longest side `side` px
export function rasterSize(size, side = 1200) {
  const k = side / Math.max(size.w, size.h);
  return { w: Math.max(1, Math.round(size.w * k)), h: Math.max(1, Math.round(size.h * k)) };
}

// git's own id for a file's bytes (sha1 of "blob <length>\0" + bytes): tells whether a logo is already there
export async function gitBlobSha(bytes) {
  const head = new TextEncoder().encode(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head); all.set(bytes, head.length);
  const d = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-1', all));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- helpers for the GitHub contents API ----------
export function decodeB64Utf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
export function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const TOKEN_RE = /^(github_pat_|ghp_)[A-Za-z0-9_]{30,}$/;
