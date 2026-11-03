// The season's dates and THE price of a request, in one place for the site (adspace.js), the comprovativo, the admin
// pages and the booking Worker (worker/requests.js imports this file; wrangler bundles it). scripts/stamp.mjs loads it
// through a data: URL, so it imports nothing, touches no DOM and reads the clock only in lisbonDay()'s default.
//
// The rules live in data/spots.json → "seasonRules" (next to "season"), every value 'YYYY-MM-DD', Lisbon dates:
//   start, end        the contract period: the season is the calendar year (season-01-01 to season-12-31)
//   logoBy            last day for the vector logo to make the printed suit and helmet for the first triathlon
//   fullPriceUntil    requests on or before it pay the rate card price (m = 0); the last day of a month
//   racesUntil        the last triathlon of the season's calendar is on or before it; from the next day until sales close
//                     a request is told there are no more triathlons with the suit this season (noRacesLeft)
//   requestsUntil     last day the site and the Worker take a request for this season (its month is the largest m)
//   proposalsFrom     the next season's proposal goes to each sponsor from this day
//   renewBy           last day for a sponsor to say yes and keep the spot
//   openFrom          spots not renewed are open to everyone
//   renewPayBy        last day to pay the next season's renewal (the next season's logo deadline); unpaid, the spot is free
//   termsDate         the date of the sponsorship terms (/condicoes/) in force
//
// The race partner («parceiro de prova», owner decision of 02.11.2026; data/spots.json "racePartner"): the whole suit,
// and the helmet if added, at one race of the season, priced per race (no mid-season or bundle discount), requested at
// least RACE_LEAD_DAYS before it, one a season. Its rules are here too (raceOpen, raceRow, quote(data, ['prova'], …)).
//
// Also here: the brand's link (brandLink, sponsorHref), the one rule of the booking form, the booking Worker, the admin
// page and the site's logo links (the issue-form bot, scripts/spot-update.mjs, keeps a copy of it).
// A missing or broken block never breaks a price: rulesOf() falls back to the defaults of the season.
//
// The price (the mid-season discount, «desconto de época»): from the day after fullPriceUntil, the price drops by one
// quarter of the share of the season already gone, the month of the request (Lisbon) counted as gone. m = the request's
// month number (February 2 … October 10), discount = m/48 of the price. It never reaches 25% (m = 12): sales close in
// October at the latest (requestsUntil), so the largest is 10/48 = 20,83%. SEASON_DIV (12 months × 4) is a term of the
// contract printed in /condicoes/ with its table, so it lives here, not in the config.
// Order: the season discount, then the bundle discount (3+ spots, never the whole suit), then ONE rounding of the total
// to whole euros, half up, all in integers: net = roundHalfUp(gross × (48 − m) × (100 − discPct), 48 × 100).

export const TITLE = 'fato';
export const TZ = 'Europe/Lisbon';
export const SEASON_DIV = 48;
const TERMS_DEFAULT = '2026-11-02';
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const KEYS = ['start', 'end', 'logoBy', 'fullPriceUntil', 'racesUntil', 'requestsUntil', 'proposalsFrom', 'renewBy', 'openFrom', 'renewPayBy', 'termsDate'];

// ---------- days ('YYYY-MM-DD', compared as strings; arithmetic in UTC, no time zone) ----------
let fmt = null;
// the Lisbon calendar day of an instant (ms since the epoch)
export function lisbonDay(ms = Date.now()) {
  const d = new Date(ms);
  try {
    fmt ||= new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
    const p = {};
    for (const x of fmt.formatToParts(d)) p[x.type] = x.value;
    if (p.year && p.month && p.day) return `${p.year}-${p.month}-${p.day}`;
  } catch (_) { /* no Intl time zones: Lisbon is UTC+0 or UTC+1 */ }
  return new Date(ms + 3600e3 * (lisbonSummer(d) ? 1 : 0)).toISOString().slice(0, 10);
}
// (fallback only) EU summer time: from 01:00 UTC on the last Sunday of March to 01:00 UTC on the last Sunday of October
function lisbonSummer(d) {
  const y = d.getUTCFullYear(), last = (m) => { const x = new Date(Date.UTC(y, m + 1, 0, 1)); x.setUTCDate(x.getUTCDate() - x.getUTCDay()); return x.getTime(); };
  return d.getTime() >= last(2) && d.getTime() < last(9);
}
export function isDay(s) {
  const m = DAY_RE.exec(String(s ?? ''));
  if (!m) return false;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3];
}
const ms = (day) => Date.parse(`${day}T00:00:00Z`);
export function addDays(day, n) { return new Date(ms(day) + Math.round(n) * 864e5).toISOString().slice(0, 10); }
// b − a in whole days
export function daysBetween(a, b) { return Math.round((ms(b) - ms(a)) / 864e5); }
export const monthIndex = (day) => Number(String(day).slice(0, 4)) * 12 + (Number(String(day).slice(5, 7)) - 1);
const lastOfMonth = (day) => new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7), 0)).toISOString().slice(0, 10);

// ---------- the rules ----------
const seasonOf = (data) => (/^\d{4}$/.test(String(data?.season ?? '')) ? String(data.season) : '');
export function defaultRules(season) {
  const y = /^\d{4}$/.test(String(season ?? '')) ? String(season) : '2027';
  return { season: y, start: `${y}-01-01`, end: `${y}-12-31`, logoBy: `${y}-01-15`, fullPriceUntil: `${y}-01-31`, racesUntil: `${y}-09-30`,
    requestsUntil: `${y}-10-31`, proposalsFrom: `${y}-09-01`, renewBy: `${y}-10-31`, openFrom: `${y}-11-01`, renewPayBy: `${+y + 1}-01-15`,
    termsDate: TERMS_DEFAULT };
}
// what is wrong with data.season + data.seasonRules ([] when nothing): stamp.mjs refuses to publish with any of it
export function checkRules(data) {
  const out = [], y = seasonOf(data), r = data && data.seasonRules;
  if (!y) out.push('season: falta o ano (por exemplo "2027")');
  if (!r || typeof r !== 'object' || Array.isArray(r)) { out.push('seasonRules: em falta'); return out; }
  for (const k of KEYS) if (!isDay(r[k])) out.push(`seasonRules.${k}: «${r[k] ?? ''}» não é uma data AAAA-MM-DD`);
  for (const k of Object.keys(r)) if (!KEYS.includes(k)) out.push(`seasonRules.${k}: chave desconhecida`);
  if (out.length) return out;
  const le = (a, b) => r[a] <= r[b], need = (ok, msg) => { if (!ok) out.push(`seasonRules: ${msg}`); };
  if (y) {
    need(r.start === `${y}-01-01`, `start tem de ser ${y}-01-01 (a época é o ano civil)`);
    need(r.end === `${y}-12-31`, `end tem de ser ${y}-12-31 (a época é o ano civil)`);
  }
  need(le('start', 'logoBy') && le('logoBy', 'end'), 'logoBy tem de ficar entre start e end');
  need(le('start', 'fullPriceUntil') && r.fullPriceUntil < r.end, 'fullPriceUntil tem de ficar entre start e end');
  need(r.fullPriceUntil === lastOfMonth(r.fullPriceUntil), 'fullPriceUntil tem de ser o último dia de um mês');
  need(le('fullPriceUntil', 'requestsUntil') && r.requestsUntil < r.end, 'requestsUntil tem de ficar entre fullPriceUntil e end');
  // the largest season month is the one of requestsUntil: 11 at most, so the discount stays below 25% (m = 12)
  need(monthIndex(r.requestsUntil) - monthIndex(r.start) + 1 <= 11, 'requestsUntil tem de ser em novembro ou antes (o desconto de época fica abaixo de 25%)');
  need(le('start', 'proposalsFrom') && r.proposalsFrom < r.renewBy && r.renewBy < r.openFrom && le('openFrom', 'end'), 'tem de ser start <= proposalsFrom < renewBy < openFrom <= end');
  // the last triathlon of the calendar, inside the season (the notice runs from the day after it while sales are open). It
  // may fall after requestsUntil: closing the sales early by moving requestsUntil alone must not make the block invalid,
  // or rulesOf would fall back to the defaults and open the sales again
  need(le('start', 'racesUntil') && le('racesUntil', 'end'), 'racesUntil tem de ficar entre start e end (o dia do último triatlo do calendário, ou antes)');
  // the renewal is paid at the start of the next season, after the answer (by 31 March at the latest)
  if (y) need(r.renewBy < r.renewPayBy && r.end < r.renewPayBy && r.renewPayBy <= `${+y + 1}-03-31`,
    'renewPayBy tem de ser no início da época seguinte, depois de renewBy e de end (até 31 de março)');
  need(le('termsDate', 'end'), 'termsDate não pode ser depois de end');
  return out;
}
// the rules in force for data (never throws): the file's block when it is valid, else the season's defaults
export function rulesOf(data) {
  const y = seasonOf(data);
  let ok = false;
  try { ok = !!y && checkRules(data).length === 0; } catch (_) { ok = false; }
  if (!ok) return defaultRules(y);
  const r = data.seasonRules, out = { season: y };
  for (const k of KEYS) out[k] = r[k];
  return out;
}

// ---------- the price ----------
// num / den rounded half up (num >= 0, den > 0), in integers
export const roundHalfUp = (num, den) => Math.floor((2 * num + den) / (2 * den));
// m, the season month of a request on Lisbon day `day` (its month counted as gone): 0 up to fullPriceUntil (all of the
// year before and January), else the month number from the season's start (February 2 … October 10); a day after
// requestsUntil is clamped to its month (never priced: salesOpen is false), so m stays below 12
export function seasonMonth(rules, day) {
  if (!isDay(day) || day <= rules.fullPriceUntil) return 0;
  return Math.min(monthIndex(day), monthIndex(rules.requestsUntil)) - monthIndex(rules.start) + 1;
}
// the season discount of month m in basis points (625 = 6,25%), for display only: the amount always comes from quote()
export const seasonBp = (m) => (Number.isInteger(m) && m > 0 ? roundHalfUp(m * 10000, SEASON_DIV) : 0);
// basis points as a percent with up to two decimals, trailing zeros dropped: 625 -> '6,25', 1250 -> '12,5', 1000 -> '10'
export function pctText(bp, dec = ',') {
  const v = Math.max(0, Math.round(Number(bp) || 0)), i = Math.floor(v / 100), f = String(v % 100).padStart(2, '0').replace(/0+$/, '');
  return f ? `${i}${dec}${f}` : String(i);
}
export const salesOpen = (rules, day) => day <= rules.requestsUntil;
export const logoOpen = (rules, day) => day <= rules.logoBy;
// the season's last triathlon is behind: from the day after racesUntil to the end of the season (sales stay open up to
// requestsUntil, and the request, the message and the comprovativo say what the spot is still worth)
export const noRacesLeft = (rules, day) => isDay(day) && day > rules.racesUntil && day <= rules.end;
// whole months for a refund (/condicoes/, «Duração, prazos e renovação»): left = the months after the month of stopDay up
// to December; of = the months from the request's month to December, both included (12 for a request up to
// fullPriceUntil). The refund is amount paid × left / of, to the cent.
export function refundMonths(rules, requestDay, stopDay) {
  const endI = monthIndex(rules.end);
  const of = requestDay <= rules.fullPriceUntil ? 12 : Math.max(1, Math.min(12, endI - monthIndex(requestDay) + 1));
  const left = Math.max(0, Math.min(of, endI - monthIndex(stopDay)));
  return { left, of };
}

const spotOf = (data, id) => (Array.isArray(data?.spots) ? data.spots.find((s) => s && s.id === id) : null) || null;
// THE price of a request. ids: spot ids, or ['fato'] for the whole suit. day: the Lisbon day of the request (default
// today); m: the season month a message states (an integer 0..11, wins over day).
// ids ['prova'] (PROVA): the race partner, with { race, helmet }: one price per race, never discounted (m = 0, no bundle);
// a race on proposal (or unknown) has no price: gross 0, proposal: true (never booked on it).
export function quote(data, ids, { day, m, race, helmet } = {}) {
  const rules = rulesOf(data), d = isDay(day) ? day : lisbonDay();
  const xs = Array.isArray(ids) ? ids : [];
  if (xs.includes(PROVA)) return raceQuote(data, rules, d, race, helmet);
  const title = xs.includes(TITLE);
  const items = title ? [{ id: TITLE, n: 0, price: Number(data?.title?.price) || 0 }]
    : xs.map((id) => spotOf(data, id)).filter(Boolean).map((s) => ({ id: s.id, n: s.n, price: Number(s.price) || 0 }));
  const gross = items.reduce((a, x) => a + x.price, 0);
  const mm = Number.isInteger(m) && m >= 0 && m <= 11 ? m : seasonMonth(rules, d);
  const b = data && data.bundle;
  const discPct = !title && b && items.length >= b.min ? Math.round(Number(b.discount) * 100) || 0 : 0;
  const full = roundHalfUp(gross * (100 - discPct), 100);
  const afterSeason = roundHalfUp(gross * (SEASON_DIV - mm), SEASON_DIV);
  const net = roundHalfUp(gross * (SEASON_DIV - mm) * (100 - discPct), SEASON_DIV * 100);
  return { season: rules.season, day: d, title, items, gross, m: mm, midSeason: mm > 0, seasonBp: seasonBp(mm), discPct, full, afterSeason, net,
    steps: { season: gross - afterSeason, bundle: afterSeason - net } };
}
// the tier key of a set of targets: 'title' for the whole suit, else the tier of the most expensive item
export function levelOf(data, ids) {
  const xs = Array.isArray(ids) ? ids : [];
  if (xs.includes(TITLE)) return 'title';
  if (xs.includes(PROVA)) return PROVA;
  const tiers = Array.isArray(data?.tiers) ? data.tiers : [];
  if (!tiers.length) return '';
  const top = Math.max(0, ...xs.map((id) => Number(spotOf(data, id)?.price) || 0));
  return (tiers.find((t) => top >= t.min) || tiers[tiers.length - 1]).key;
}

// The renewal: every level renews at the next season's rate card (owner decision of 29.10.2026, evening; terms of
// 30.10.2026). No level keeps its price.

// ---------- contracts ----------
// the renewal step as shown on Lisbon day `day`, from the step stored by hand ('', 'proposta', 'renova', 'nao-renova').
// From openFrom, a sponsor with no answer does not renew: 'sem-resposta' after a proposal, 'sem-proposta' when none was
// marked as sent (the spot opens to everyone all the same, as /condicoes/ says)
export function renewalView(contract, day) {
  const c = contract || {}, d0 = defaultRules(c.season);
  const end = c.period?.end || d0.end, openFrom = c.dates?.openFrom || d0.openFrom, proposalsFrom = c.dates?.proposalsFrom || d0.proposalsFrom;
  const st = c.renewal?.state || '';
  // a race partner's contract is for that race only: it never renews (/condicoes/, «O parceiro de prova»)
  if (c.race) return { state: day > end ? 'terminado' : PROVA, outcome: '' };
  if (day > end) return { state: 'terminado', outcome: st === 'renova' || st === 'nao-renova' ? st : st === 'proposta' ? 'sem-resposta' : 'sem-proposta' };
  if (st === 'renova' || st === 'nao-renova') return { state: st, outcome: st };
  if (st === 'proposta' && day >= openFrom) return { state: 'nao-renova', outcome: 'sem-resposta' };
  if (st === 'proposta') return { state: 'proposta', outcome: '' };
  if (!st && day >= openFrom) return { state: 'nao-renova', outcome: 'sem-proposta' };
  if (day >= proposalsFrom) return { state: 'a-propor', outcome: '' };
  return { state: 'ativo', outcome: '' };
}
// the season's key dates, in order (calendar, .ics, what is due now)
export function keyDates(rules) {
  return [{ key: 'inicio', day: rules.start }, { key: 'logos', day: rules.logoBy }, { key: 'propostas', day: rules.proposalsFrom },
    { key: 'provas', day: rules.racesUntil }, { key: 'renovacao', day: rules.renewBy }, { key: 'abertos', day: rules.openFrom },
    { key: 'fim', day: rules.end }, { key: 'pagamento', day: rules.renewPayBy }];
}
// KV expiration (seconds) of a contract record of `season`: the end of 31 December of the following year, Lisbon time
// (UTC+0 in December)
export function contractExpiry(season) { return Date.UTC(Number(season) + 1, 11, 31, 23, 59, 59) / 1000; }

// ---------- the race partner («parceiro de prova», data/spots.json "racePartner") ----------
// The offer (edited by hand, like title.price): price, helmetPrice and races [{ id, date ('YYYY-MM-DD', or 'YYYY-MM' while
// the day is not known), pt, en, proposal? (on request, costs on top: outside Portugal and Spain), ask? (priced, but
// requested by message until the race is cleared) }]. The state (written by the Worker and the admin only, in this key
// order): status; reserved: race, helmet, until, request? (a site hold), never a brand (the file is public, and the first
// offer to the season's title partner and Principal brands is made without naming the requester); sold: race, helmet,
// brand, url?, since, logo?, logoMono?. One status for the whole season: one race partner a season. Without the block
// there is no product.
export const PROVA = 'prova';
export const PROVA_HELMET = 'prova-capacete';
// printed conditions (/condicoes/ «6 semanas» and «5 semanas»; scripts/stamp.mjs compares them), like SEASON_DIV
export const RACE_LEAD_DAYS = 42;   // a race is requested until race day − 42 (Lisbon): the time to make the suit
export const RACE_LOGO_DAYS = 35;   // the vector logo is due by race day − 35
export const RACE_ID = /^[a-z0-9-]{1,20}$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;
const RP_STATE_KEYS = ['race', 'helmet', 'brand', 'url', 'since', 'until', 'request', 'logo', 'logoMono'];
const RP_OFFER_KEYS = ['price', 'helmetPrice', 'races', 'status'];
const blockOf = (data) => (data && data.racePartner && typeof data.racePartner === 'object' && !Array.isArray(data.racePartner) ? data.racePartner : null);
export const racesOf = (data) => { const rp = blockOf(data); return rp && Array.isArray(rp.races) ? rp.races.filter((r) => r && typeof r === 'object') : []; };
export const raceOf = (data, id) => racesOf(data).find((r) => r.id === id) || null;
// a month-only date ('2027-09'): the day is not known yet
export const raceMonthOnly = (race) => MONTH_RE.test(String(race?.date ?? ''));
// the race day, or day 1 of its month while only the month is known (the 6 weeks count from it)
export function raceDay(race) {
  const d = String(race?.date ?? ''), m = MONTH_RE.exec(d);
  if (isDay(d)) return d;
  return m && +m[2] >= 1 && +m[2] <= 12 ? `${d}-01` : '';
}
// the last day the race can fall on: the day, or the last day of its month
export function raceEnd(race) {
  const d = raceDay(race);
  return !d ? '' : raceMonthOnly(race) ? lastOfMonth(d) : d;
}
export const raceBookBy = (race) => { const d = raceDay(race); return d ? addDays(d, -RACE_LEAD_DAYS) : ''; };
export const raceLogoBy = (race) => { const d = raceDay(race); return d ? addDays(d, -RACE_LOGO_DAYS) : ''; };
// may this race be requested on Lisbon day `day`? Never looks at the state (taken or not: raceState).
//   { ok: true, race } | { error: 'prova' } (no block, unknown race) | { error: 'prova-contacto', race } (on proposal, or by
//   message only) | { error: 'epoca' } (the season's sales are closed) | { error: 'prova-prazo', race, bookBy } (past its
//   last request day)
export function raceOpen(data, id, day) {
  const rp = blockOf(data), race = raceOf(data, id);
  if (!rp || !race || !raceDay(race)) return { error: 'prova' };
  if (race.proposal || race.ask) return { error: 'prova-contacto', race };
  if (!salesOpen(rulesOf(data), day)) return { error: 'epoca' };
  const bookBy = raceBookBy(race);
  if (day > bookBy) return { error: 'prova-prazo', race, bookBy };
  return { ok: true, race };
}
// a hold lapses on its own once its `until` day is over (UTC), as for a spot. now: ms (default the clock)
// (no `now`: the start of today in Lisbon; lisbonDay() stays this file's one clock read)
const rpLapsed = (rp, now) => rp.status === 'reserved' && !!rp.until && Date.parse(`${rp.until}T23:59:59Z`) < (Number.isFinite(now) ? now : Date.parse(`${lisbonDay()}T00:00:00Z`));
// 'available' | 'reserved' | 'sold' ('' without the block); a lapsed hold counts as available
export function raceState(data, now) {
  const rp = blockOf(data);
  if (!rp) return '';
  const st = rp.status === 'reserved' || rp.status === 'sold' ? rp.status : 'available';
  return st === 'reserved' && rpLapsed(rp, now) ? 'available' : st;
}
// the row of a race in the picker (the site) and the admin, on Lisbon day `day`, in this order:
//   'past' (after the race) › 'held' / 'sold' (this race) › 'closed' (after its last request day, or sales closed) ›
//   'one' (another race is held or sold) › 'quote' (on proposal) › 'ask' (by message) › 'open'; '' for an unknown race
export function raceRow(data, id, day, now) {
  const rp = blockOf(data), race = raceOf(data, id);
  if (!rp || !race || !raceDay(race)) return '';
  if (day > raceEnd(race)) return 'past';
  const st = raceState(data, now);
  if (st !== 'available' && rp.race === id) return st === 'sold' ? 'sold' : 'held';
  if (day > raceBookBy(race) || !salesOpen(rulesOf(data), day)) return 'closed';
  if (st !== 'available') return 'one';
  if (race.proposal) return 'quote';
  if (race.ask) return 'ask';
  return 'open';
}
// the first offer (/condicoes/): a race partner who is not the title partner nor a Principal brand waits for them (5
// working days) when the season has a title partner (sold) or a sold spot priced at the Principal level or more
export function firstOfferDue(data) {
  if (data?.title?.status === 'sold') return true;
  const tiers = Array.isArray(data?.tiers) ? data.tiers : [];
  const top = tiers.find((t) => t && t.key === 'principal') || tiers[0];
  if (!top || !Number.isFinite(Number(top.min))) return false;
  return (Array.isArray(data?.spots) ? data.spots : []).some((s) => s && s.status === 'sold' && Number(s.price) >= Number(top.min));
}
function raceQuote(data, rules, d, raceId, helmet) {
  const rp = blockOf(data), race = raceOf(data, raceId), proposal = !rp || !race || !!race.proposal;
  const items = proposal ? [] : [{ id: PROVA, n: 0, price: Number(rp.price) || 0 }, ...(helmet === true ? [{ id: PROVA_HELMET, n: 0, price: Number(rp.helmetPrice) || 0 }] : [])];
  const gross = items.reduce((a, x) => a + x.price, 0);
  return { season: rules.season, day: d, title: false, prova: true, race: race ? race.id : '', helmet: helmet === true && !proposal, proposal, items, gross, m: 0, midSeason: false, seasonBp: 0,
    discPct: 0, full: gross, afterSeason: gross, net: gross, steps: { season: 0, bundle: 0 } };
}
// the price snapshot a request (and its contract) keeps: the suit at that race, and the helmet when added
export function raceSnapshot(data, id, helmet) {
  const rp = blockOf(data);
  if (!rp || !raceOf(data, id)) return [];
  return [{ id: PROVA, n: 0, name: 'Fato completo numa prova', item: 'suit', price: Number(rp.price) || 0 },
    ...(helmet === true ? [{ id: PROVA_HELMET, n: 0, name: 'Capacete completo na prova', item: 'helmet', price: Number(rp.helmetPrice) || 0 }] : [])];
}
// what is wrong with data.racePartner ([] when nothing, or when there is no block): scripts/stamp.mjs refuses it
export function checkRacePartner(data) {
  const rp = data ? data.racePartner : undefined;
  if (rp === undefined) return [];
  const out = [], bad = (m) => out.push(`racePartner: ${m}`);
  if (!blockOf(data)) return ['racePartner: tem de ser um objeto'];
  const rules = rulesOf(data);
  for (const k of Object.keys(rp)) if (!RP_OFFER_KEYS.includes(k) && !RP_STATE_KEYS.includes(k)) bad(`chave desconhecida «${k}»`);
  for (const k of ['price', 'helmetPrice']) if (!Number.isInteger(rp[k]) || rp[k] <= 0) bad(`${k} tem de ser um número inteiro de euros, maior do que 0`);
  const races = Array.isArray(rp.races) ? rp.races : null;
  if (!races || !races.length) bad('races tem de ser uma lista com pelo menos uma prova');
  const ids = new Set();
  for (const [i, r] of (races || []).entries()) {
    const at = `races[${i}]`;
    if (!r || typeof r !== 'object' || Array.isArray(r)) { bad(`${at} não é um objeto`); continue; }
    for (const k of Object.keys(r)) if (!['id', 'date', 'pt', 'en', 'proposal', 'ask'].includes(k)) bad(`${at}: chave desconhecida «${k}»`);
    if (typeof r.id !== 'string' || !RACE_ID.test(r.id)) bad(`${at}: id «${r.id ?? ''}» (letras minúsculas, algarismos e hífens, até 20)`);
    else if (ids.has(r.id)) bad(`${at}: id «${r.id}» repetido`);
    else ids.add(r.id);
    if (!raceDay(r)) bad(`${at} (${r.id}): date «${r.date ?? ''}» não é AAAA-MM-DD nem AAAA-MM`);
    else if (raceDay(r) < rules.start || raceEnd(r) > rules.end) bad(`${at} (${r.id}): a data ${r.date} fica fora da época ${rules.season}`);
    for (const l of ['pt', 'en']) if (typeof r[l] !== 'string' || !r[l].trim()) bad(`${at} (${r.id}): falta o nome ${l}`);
    for (const k of ['proposal', 'ask']) if (r[k] !== undefined && r[k] !== true) bad(`${at} (${r.id}): ${k} só pode ser true (ou não estar)`);
    if (r.proposal && r.ask) bad(`${at} (${r.id}): proposal e ask não vão juntos`);
  }
  const st = rp.status, has = (k) => rp[k] !== undefined;
  if (!['available', 'reserved', 'sold'].includes(st)) { bad(`status «${st ?? ''}» (available, reserved ou sold)`); return out; }
  const allowed = st === 'available' ? [] : st === 'reserved' ? ['race', 'helmet', 'until', 'request'] : ['race', 'helmet', 'brand', 'url', 'since', 'logo', 'logoMono'];
  for (const k of RP_STATE_KEYS) if (has(k) && !allowed.includes(k)) bad(k === 'brand' && st === 'reserved' ? 'uma reserva não leva a marca (o ficheiro é público; a marca aparece com a venda)' : `${k} não vai com status ${st}`);
  if (st === 'available') return out;
  if (!ids.has(rp.race)) bad(`race «${rp.race ?? ''}» não é uma das provas`);
  if (typeof rp.helmet !== 'boolean') bad('helmet tem de ser true ou false');
  if (st === 'reserved') {
    if (!isDay(rp.until)) bad(`until «${rp.until ?? ''}» não é uma data`);
    if (has('request') && !/^[0-9A-Z]{10}$/.test(String(rp.request))) bad(`request «${rp.request}» não é um pedido`);
  } else {
    if (typeof rp.brand !== 'string' || !rp.brand.trim()) bad('uma venda leva a marca');
    if (has('url') && typeof rp.url !== 'string') bad('url tem de ser texto');
    if (has('since') && !isDay(rp.since)) bad(`since «${rp.since}» não é uma data`);
    if (has('logo') && !/^assets\/img\/brands\/prova\.(png|jpg|webp)$/.test(String(rp.logo))) bad(`logo «${rp.logo}» (assets/img/brands/prova.png, .jpg ou .webp)`);
  }
  return out;
}

// ---------- the brand's link (owner decision of 02.11.2026: the sponsor's logo links to the sponsor's page) ----------
// The link a brand gives with its request (the booking form, worker/requests.js) and the one the admin writes on a sold
// spot (data/spots.json "url"): https only, or an Instagram handle. One rule for every writer and for the site, which
// checks the file again before it renders a link (defence in depth).
export const LINK_MAX = 200;
// social networks, messaging and link pages: no gocarmo tag on a link to them (their subdomains too: www., m.,
// pt.linkedin.com), the short names of each network included (instagr.am, fb.com, twitter.com, youtu.be, lnkd.in…)
export const LINK_NETWORKS = ['instagram.com', 'instagr.am', 'facebook.com', 'fb.com', 'fb.me', 'm.me', 'tiktok.com', 'linkedin.com', 'lnkd.in',
  'wa.me', 'whatsapp.com', 'x.com', 'twitter.com', 'youtube.com', 'youtu.be', 'threads.net', 'threads.com', 'linktr.ee'];
// link shorteners and redirect pages: the page they lead to can change after the owner checks the link (the admin pages
// say so; the site adds no gocarmo tag to them either)
export const LINK_REDIRECTORS = ['bit.ly', 'bitly.com', 't.co', 'tinyurl.com', 'goo.gl', 'ow.ly', 'buff.ly', 'is.gd', 'cutt.ly', 'rebrand.ly',
  'tiny.cc', 'shorturl.at', 's.id', 'lnkd.in', 'l.instagram.com', 'l.facebook.com', 'lm.facebook.com', 'l.messenger.com'];
const LINK_HIDDEN = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/;
// an Instagram name: letters, digits, «.» and «_», at least one letter or digit, no «.» first, last or twice in a row
const LINK_HANDLE = /^(?!\.)(?!.*\.\.)(?!.*\.$)(?=.*[A-Za-z0-9])[A-Za-z0-9._]{1,30}$/;
// names for a local network, a test or a hidden service, never a page of the open web (router.local, nas.home.arpa…)
const LINK_PRIVATE = /\.(?:localhost|local|internal|lan|home|corp|test|example|invalid|onion|alt|arpa)$/;
// brandLink(raw) -> { url: '' } (nothing typed) | { url: 'https://…' } (normalised) | { error } with error one of
// 'esquema' (http:, javascript:, data:, mailto:, …), 'espacos' (a space or an invisible character inside), 'longo' (over
// LINK_MAX characters, typed or once normalised), 'invalido' (not a page of the open web: no real domain, an address,
// a port, a user name, gocarmo.com itself, a bad @handle).
//   '@marca'      -> https://www.instagram.com/marca/
//   'https://…'   -> as it is (any case)
//   'padaria.pt'  -> https://padaria.pt/ (a bare domain, with or without a path)
export function brandLink(raw) {
  const s = String(raw ?? '').normalize('NFC').trim();
  if (!s) return { url: '' };
  if (Array.from(s).length > LINK_MAX) return { error: 'longo' };
  if (/\s/.test(s) || LINK_HIDDEN.test(s)) return { error: 'espacos' };
  let href;
  if (s.startsWith('@')) {
    if (!LINK_HANDLE.test(s.slice(1))) return { error: 'invalido' };
    href = `https://www.instagram.com/${s.slice(1)}/`;
  } else if (/^https:\/\//i.test(s)) href = s;
  else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s)) return { error: 'esquema' };   // (padaria.pt:8080 is a port, not a scheme)
  else href = `https://${s}`;
  let u;
  try { u = new URL(href); } catch (_) { return { error: 'invalido' }; }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !host || host.startsWith('[') || /^[\d.]+$/.test(host)
    || host === 'gocarmo.com' || host.endsWith('.gocarmo.com') || !/\.(?:[a-z]{2,}|xn--[a-z0-9-]+)$/.test(host) || LINK_PRIVATE.test(host)) return { error: 'invalido' };
  if (u.href.length > LINK_MAX) return { error: 'longo' };
  return { url: u.href };
}
// the bare host of a link, without «www.» ('' when it is not one)
export function linkHost(url) {
  try { return new URL(String(url || '')).hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, ''); } catch (_) { return ''; }
}
// a link to a network (instagram.com, …) rather than to the brand's own website
export const isNetwork = (url) => { const h = linkHost(url); return !!h && LINK_NETWORKS.some((n) => h === n || h.endsWith(`.${n}`)); };
// a link through a shortener or a redirect page (bit.ly, l.instagram.com, google.com/url?q=…, youtube.com/redirect?q=…):
// where it leads can change after the owner approves it
export function isRedirector(url) {
  let u;
  try { u = new URL(String(url || '')); } catch (_) { return false; }
  const h = linkHost(url);
  if (!h) return false;
  if (LINK_REDIRECTORS.some((r) => h === r || h.endsWith(`.${r}`))) return true;
  if (/^(?:[a-z0-9-]+\.)?google(?:\.[a-z]{2,3}){1,2}$/.test(h) && u.pathname === '/url') return true;
  return (h === 'youtube.com' || h.endsWith('.youtube.com')) && u.pathname === '/redirect';
}
// a link as a person reads it: 'padaria.pt/loja', 'instagram.com/marca' (no https://, no www., no last slash)
export function linkShown(url) {
  let u;
  try { u = new URL(String(url || '')); } catch (_) { return ''; }
  const path = `${u.pathname}${u.search}`.replace(/\/$/, '');
  return `${linkHost(url)}${path === '/' ? '' : path}`;
}
// The href the site renders for a sponsor's url (data/spots.json), '' for anything that is not a valid https link
// (never rendered). A link to the brand's own website (not a network, not a shortener) gets the gocarmo tag (utm_source=gocarmo.com, utm_medium=patrocinio,
// utm_campaign=epoca-<season>) unless it carries utm_ parameters already; a network or shortener link goes as it is. The tag is joined
// as text, so the brand's own query is kept byte for byte, and the fragment stays last.
export function sponsorHref(url, season) {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url.trim())) return '';
  const L = brandLink(url);
  if (!L.url) return '';
  if (isNetwork(L.url) || isRedirector(L.url)) return L.url;
  const u = new URL(L.url);
  if ([...u.searchParams.keys()].some((k) => /^utm_/i.test(k))) return L.url;
  const y = /^\d{4}$/.test(String(season ?? '')) ? `-${season}` : '';
  const tag = `utm_source=gocarmo.com&utm_medium=patrocinio&utm_campaign=epoca${y}`;
  const i = L.url.indexOf('#'), base = i < 0 ? L.url : L.url.slice(0, i), frag = i < 0 ? '' : L.url.slice(i);
  const join = !base.includes('?') ? '?' : /[?&]$/.test(base) ? '' : '&';
  return `${base}${join}${tag}${frag}`;
}
