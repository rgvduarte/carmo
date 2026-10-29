// The «Relatório PDF» of /admin/analytics/ without the page: the periods the dialog offers, the brands it can report on,
// and the report itself (a model of pages and blocks, every sentence already written in the chosen language) from the
// answers of the analytics Worker. Pure: no DOM, no fetch, no storage and no clock (every function takes the Lisbon
// day), so Node tests it. admin-report-pdf.js lays the model out; it never works out a number.
//
// What goes in, endpoint by endpoint (DESIGN §2.2): ping (today, oldest), overview (visits, page views, visitors per
// day, active time, the series), audience (channels, referrers, countries, cities, devices), content (active time,
// scroll depth, the sponsorship chapter), studio (3D suit and helmet, the tour), sponsors (a brand's logo clicks per
// month and the sponsor list's views) and montra (a brand's showcase per month and product). Never in it: the booking
// funnel, anything with today, the sum of visitors over days, a number of people.
import { sameBrand } from './admin-montra-core.js';
import { T, fmt, fill, country, channel, device, refName, CHANNEL_ORDER } from './admin-report-text.js';

// ---------- days ----------
export const addDays = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
export const dayDiff = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5);
export const validDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)) && new Date(`${d}T12:00:00Z`).toISOString().slice(0, 10) === d;
const monthStart = (d) => `${d.slice(0, 7)}-01`;
const monthEnd = (d) => addDays(monthStart(addDays(monthStart(d), 32)), -1);
export function isoWeek(d) {
  const t = new Date(`${d}T12:00:00Z`); const wd = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - wd + 3);
  const y = t.getUTCFullYear(); const f = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((t - f) / 864e5 - 3 + ((f.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
export const monthsIn = (from, to) => { const out = []; for (let m = from.slice(0, 7); m <= to.slice(0, 7); m = addDays(`${m}-01`, 32).slice(0, 7)) out.push(m); return out; };
export const CUSTOM_BACK = 761;   // the Worker's limit for a custom period (stats-worker/src/time.js)

// ---------- periods (DESIGN §2.1) ----------
// Every period ends yesterday at the latest: a report never holds a partial day.
// rules: data/spots.json { season, seasonRules: { start, end } }. Returns { month, last, season, custom }, each
// { from, to, off: '' | reason }; custom has { min, max } for the date fields.
export function periods(today, rules = {}) {
  const yday = addDays(today, -1);
  const out = {};
  out.month = today.slice(8) === '01'
    ? { from: '', to: '', off: 'month' }
    : { from: monthStart(today), to: yday, off: '' };
  const lm = addDays(monthStart(today), -1);
  out.last = { from: monthStart(lm), to: lm, off: '' };
  const sr = rules.seasonRules || {};
  if (!validDay(sr.start) || !validDay(sr.end)) out.season = { from: '', to: '', off: 'none' };
  else if (yday < sr.start) out.season = { from: '', to: '', off: 'before', start: sr.start };
  else out.season = { from: sr.start, to: yday < sr.end ? yday : sr.end, off: '' };
  out.custom = { min: addDays(today, -CUSTOM_BACK), max: yday };
  return out;
}
// a custom period the Worker accepts (whole days, ending yesterday at the latest)
export function customOk(from, to, today) {
  const yday = addDays(today, -1);
  return validDay(from) && validDay(to) && from <= to && to <= yday && from >= addDays(today, -CUSTOM_BACK) && dayDiff(from, to) <= CUSTOM_BACK;
}

// ---------- the trend: buckets by day (≤ 62 days), ISO week (≤ 183) or month ----------
export const unitFor = (days) => (days <= 62 ? 'day' : days <= 183 ? 'week' : 'month');
// x: days of the series; ys: { visits: [...] } → [{ key, from, to, days, v }]
export function bucket(x, values, unit) {
  const out = [];
  let cur = null;
  x.forEach((d, i) => {
    const key = unit === 'day' ? d : unit === 'week' ? isoWeek(d) : d.slice(0, 7);
    if (!cur || cur.key !== key) { cur = { key, from: d, to: d, days: 0, v: 0 }; out.push(cur); }
    cur.to = d; cur.days++; cur.v += Number(values[i]) || 0;
  });
  return out;
}
// the comparison with the previous period is printed only when it is short enough to mean something (≤ 92 days) and
// the counter had data for the whole previous period (the Worker drops `prev` itself when it did not)
export function comparable(range, prev, oldest) {
  if (!range || !prev || !prev.from || !oldest) return false;
  return range.days <= 92 && oldest <= prev.from;
}

// ---------- brands (DESIGN §2.4) ----------
// Networks whose links are shared by many brands: a click there cannot be told apart by brand.
const SHARED = { 'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'tiktok.com': 'TikTok', 'linkedin.com': 'LinkedIn', 'x.com': 'X', 'twitter.com': 'X', 'youtube.com': 'YouTube', 'linktr.ee': 'Linktree' };
export const bareHost = (h) => String(h || '').toLowerCase().replace(/^www\./, '').replace(/\.$/, '');
// the host a sold spot's link sends clicks to, or { shared: 'Instagram' } for a network link (@handle included)
export function linkHost(url) {
  const s = String(url || '').trim();
  if (!s) return null;
  if (s.startsWith('@')) return { shared: 'Instagram' };
  let h = '';
  try { h = bareHost(new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`).hostname); } catch (_) { return null; }
  if (!h) return null;
  for (const [base, net] of Object.entries(SHARED)) if (h === base || h.endsWith(`.${base}`)) return { shared: net };
  return { host: h };
}
// does a clicked host (as the tracker records it, without www.) belong to one of a brand's hosts? subdomains count
export const hostMatches = (clicked, hosts) => { const c = bareHost(clicked); return !!c && (hosts || []).some((h) => c === h || c.endsWith(`.${h}`)); };

// brandsFor(spotsJson, montraJson, season?) -> [{ key, name, montraIds, hosts, shared, spots: [{id, item, pt, en}], title }]
// every brand with sold spots of the season in data/spots.json (and the whole suit), plus every brand of
// data/montra.json; sorted by name. season: the season of the report (default: the spots file's own).
export function brandsFor(spotsJson, montraJson, season) {
  const sp = spotsJson && typeof spotsJson === 'object' ? spotsJson : {};
  const ssn = String(season ?? sp.season ?? '');
  const list = [];
  const find = (name) => list.find((b) => sameBrand(b.name, name));
  const add = (name) => { let b = find(name); if (!b) { b = { name: String(name).trim(), montraIds: [], hosts: [], shared: '', spots: [], title: false }; list.push(b); } return b; };
  const link = (b, url) => {
    const r = linkHost(url);
    if (!r) return;
    if (r.host && !b.hosts.includes(r.host)) b.hosts.push(r.host);
    if (r.shared && !b.shared) b.shared = r.shared;
  };
  if (String(sp.season ?? '') === ssn) {
    const T0 = sp.title;
    if (T0 && T0.status === 'sold' && T0.brand) { const b = add(T0.brand); b.title = true; link(b, T0.url); }
    for (const s of Array.isArray(sp.spots) ? sp.spots : []) {
      if (!s || s.status !== 'sold' || !s.brand) continue;
      const b = add(s.brand);
      if (!b.spots.some((x) => x.id === s.id)) b.spots.push({ id: s.id, item: s.item === 'helmet' ? 'helmet' : 'suit', pt: (s.pt && s.pt.name) || s.id, en: (s.en && s.en.name) || s.id });
      link(b, s.url || s.link);
    }
  }
  for (const m of montraJson && Array.isArray(montraJson.brands) ? montraJson.brands : []) {
    if (!m || !m.name || !m.id) continue;
    const b = add(m.name);
    if (!b.montraIds.includes(m.id)) b.montraIds.push(m.id);
  }
  // a brand whose only links are a shared network has no host of its own; one with a host of its own is counted
  for (const b of list) { if (b.hosts.length) b.shared = ''; b.key = b.name.toLowerCase(); }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'pt'));
}
// the products of the montra file by id, with their names in both languages
function productNames(montraJson) {
  const m = new Map();
  for (const b of montraJson && Array.isArray(montraJson.brands) ? montraJson.brands : []) {
    for (const p of b && Array.isArray(b.products) ? b.products : []) {
      if (!p || !p.id) continue;
      const n = p.name || {};
      m.set(p.id, { pt: (typeof n === 'string' ? n : n.pt) || p.id, en: (typeof n === 'string' ? n : n.en || n.pt) || p.id });
    }
  }
  return m;
}

export function fileName(lang, from, to, brand) {
  const slug = brand ? String(brand.name).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) : '';
  return `${T[lang === 'en' ? 'en' : 'pt'].file}-${from}_${to}${slug ? `-${slug}` : ''}.pdf`;
}

// ---------- the model ----------
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const share = (a, b) => (b > 0 ? a / b : 0);

// buildModel({ lang, from, to, today, oldest, now, brand, data: { overview, audience, content, studio, sponsors, montra },
//   spotsJson, montraJson }) -> { lang, file, title, subject, author, foot, pages: [[block]] }
// brand: an entry of brandsFor() or null. data.sponsors: the answer, or null when the endpoint is not there yet (the
// logo block is then left out). Every string in the model is final text in the chosen language.
export function buildModel(o) {
  const lang = o.lang === 'en' ? 'en' : 'pt';
  const t = T[lang], f = fmt(lang);
  const { from, to } = o;
  const days = dayDiff(from, to) + 1;
  const d = o.data || {};
  const ov = d.overview || {}, au = d.audience || {}, ct = d.content || {}, st = d.studio || {};
  const k = ov.kpi || {};
  const brand = o.brand || null;
  const period = f.range(from, to);
  const pages = [];

  // ----- 1. cover and summary -----
  const title = brand ? fill(t.docBrand, { brand: brand.name }) : t.docSite;
  const p1 = [];
  const notes = [fill(t.made, { day: f.day(o.today || addDays(to, 1)) })];
  if (o.oldest && from < o.oldest) notes.push(fill(t.starts, { day: f.day(o.oldest) }));
  p1.push({ t: 'cover', kicker: t.kicker, h: title, sub: period, notes });

  const cmp = comparable(ov.range || { days }, ov.prev, o.oldest);
  const prevLabel = (() => {
    if (!cmp) return null;
    const pv = ov.prev;
    if (from === monthStart(from) && to === monthEnd(from) && pv.from === monthStart(pv.from) && pv.to === monthEnd(pv.from)) return { month: f.monthName(pv.from.slice(0, 7)) };
    return { n: dayDiff(pv.from, pv.to) + 1 };
  })();
  const delta = (kk) => {
    if (!cmp || !kk) return '';
    const v = kk.v, p = kk.prev;
    if (v === null || v === undefined || !p) return '';
    const r = (num(v) - num(p)) / num(p);
    const ds = f.signed(r);
    if (prevLabel.month) return fill(t.vsMonth, { d: ds, month: prevLabel.month });
    return prevLabel.n === 1 ? fill(t.vsDay, { d: ds }) : fill(t.vsDays, { d: ds, n: prevLabel.n });
  };
  const visits = num(k.visits && k.visits.v);
  p1.push({ t: 'tiles', items: [
    { k: t.tiles.visits[0], v: f.int(visits), sub: t.tiles.visits[1], delta: delta(k.visits) },
    { k: t.tiles.pv[0], v: f.int(k.pv && k.pv.v), sub: t.tiles.pv[1], delta: delta(k.pv) },
    { k: t.tiles.uvAvg[0], v: f.dec1(k.uvAvg && k.uvAvg.v), sub: t.tiles.uvAvg[1], delta: delta(k.uvAvg) },
    { k: t.tiles.eng[0], v: k.engMedian && k.engMedian.v !== null && k.engMedian.v !== undefined ? f.dur(k.engMedian.v) : t.noData, sub: t.tiles.eng[1], delta: delta(k.engMedian) },
  ] });

  // the trend
  const sx = (ov.series && Array.isArray(ov.series.x)) ? ov.series.x : [];
  const sv = (ov.series && ov.series.s && Array.isArray(ov.series.s.visits)) ? ov.series.s.visits : [];
  const unit = unitFor(days);
  const bk = bucket(sx, sv, unit);
  const crossYear = from.slice(0, 4) !== to.slice(0, 4);
  const label = (b, i) => (unit === 'day' ? f.dayShort(b.from) : unit === 'week' ? f.dayShort(b.from)
    : f.mon3(b.key, crossYear && (i === 0 || b.key.endsWith('-01'))));
  if (visits > 0 && bk.length) {
    const top = bk.reduce((a, b) => (b.v > a.v ? b : a), bk[0]);
    const at = unit === 'month' ? f.month(top.key) : f.day(top.from);
    const summary = [fill(t.trendAvg, { v: f.dec1(Math.round((visits / days) * 10) / 10) }), fill(t.trendTop[unit], { at, v: f.int(top.v) })];
    if (unit === 'week') summary.push(t.trendWeek);
    p1.push({ t: bk.length >= 3 ? 'line' : 'cols', title: t.trend[unit], points: bk.map((b, i) => ({ label: label(b, i), v: b.v, text: f.int(b.v) })), top: bk.indexOf(top), summary });
  } else p1.push({ t: 'p', text: t.noVisits });
  pages.push(p1);

  // ----- 2. where the visits come from -----
  const p2 = [{ t: 'h', text: t.p2 }];
  const chanRows = ((au.chan && au.chan.rows) || []).filter((r) => r.k !== 'interno');
  const chanSum = chanRows.reduce((s, r) => s + num(r.x), 0);
  const chanMap = new Map();
  for (const r of chanRows) { const key = CHANNEL_ORDER.includes(r.k) ? r.k : 'outros'; chanMap.set(key, (chanMap.get(key) || 0) + num(r.x)); }
  const chan = [...chanMap].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1] || CHANNEL_ORDER.indexOf(a[0]) - CHANNEL_ORDER.indexOf(b[0]))
    .map(([key, v]) => ({ label: channel(key, lang), v, text: `${f.pct(share(v, chanSum))}  ·  ${f.int(v)}` }));
  p2.push(chan.length ? { t: 'bars', title: t.chan, rows: chan, note: chanMap.has('direto') ? t.chanNote : '' } : { t: 'sec', title: t.chan, text: t.nothing });

  // referrers: top 6 by page views, everything else in «Outros sites», last; the same name merged (Instagram's hosts)
  const refRows = (au.ref && au.ref.rows) || [];
  const merged = new Map();
  for (const r of refRows) { const n = refName(r.k, lang); merged.set(n, (merged.get(n) || 0) + num(r.n)); }
  const otherName = refName('outros sites', lang);
  let otherRef = merged.get(otherName) || 0;
  merged.delete(otherName);
  if (au.ref && au.ref.other) otherRef += num(au.ref.other.n);
  const refList = [...merged].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (const [, v] of refList.slice(6)) otherRef += v;
  const sites = refList.slice(0, 6).map(([n, v]) => [n, f.int(v)]);
  if (otherRef > 0) sites.push([otherName, f.int(otherRef)]);
  const sitesBlock = sites.length ? { t: 'table', title: t.sites, head: t.sitesCol, rows: sites, align: ['l', 'r'] } : { t: 'sec', title: t.sites, text: t.nothing };

  // countries: top 8 by visits, the rest as «Outros países»
  const ccRows = ((au.geo && au.geo.cc && au.geo.cc.rows) || []).slice().sort((a, b) => num(b.x) - num(a.x) || String(a.k).localeCompare(String(b.k)));
  const ccSum = ccRows.reduce((s, r) => s + num(r.x), 0) + num(au.geo && au.geo.cc && au.geo.cc.other && au.geo.cc.other.x);
  const ccTop = ccRows.slice(0, 8).filter((r) => num(r.x) > 0);
  const ccRest = ccSum - ccTop.reduce((s, r) => s + num(r.x), 0);
  const ccBars = ccTop.map((r) => ({ label: country(r.k, lang), v: num(r.x), text: `${f.pct(share(num(r.x), ccSum))}  ·  ${f.int(r.x)}` }));
  if (ccRest > 0) ccBars.push({ label: t.otherCountries, v: ccRest, text: `${f.pct(share(ccRest, ccSum))}  ·  ${f.int(ccRest)}`, other: true });
  const ccBlock = ccBars.length ? { t: 'bars', title: t.countries, rows: ccBars, narrow: true } : { t: 'sec', title: t.countries, text: t.nothing };
  p2.push({ t: 'two', left: ccBlock, right: sitesBlock });

  // cities: only the ones the Worker shows (≥ 3 visitor-days), top 10 by page views; the rest as «Outras localidades»
  const cities = ((au.geo && au.geo.cities) || []).slice().sort((a, b) => num(b.n) - num(a.n) || String(a.city).localeCompare(String(b.city)));
  const multiCc = new Set(cities.slice(0, 10).map((c) => c.cc)).size > 1;
  const cityRows = cities.slice(0, 10).map((c) => [multiCc ? `${c.city} (${country(c.cc, lang)})` : c.city, f.int(c.n)]);
  let otherPl = ((au.geo && au.geo.otherPlaces) || []).reduce((s, r) => s + num(r.n), 0);
  for (const c of cities.slice(10)) otherPl += num(c.n);
  if (otherPl > 0) cityRows.push([t.otherPlaces, f.int(otherPl)]);
  const cityBlock = cityRows.length ? { t: 'table', title: t.cities, head: t.citiesCol, rows: cityRows, align: ['l', 'r'], note: t.citiesNote } : { t: 'sec', title: t.cities, text: t.nothing };

  const devRows = ((au.dev && au.dev.rows) || []).filter((r) => num(r.x) > 0);
  const devSum = devRows.reduce((s, r) => s + num(r.x), 0);
  const order = ['mobile', 'desktop', 'tablet'];
  const devParts = devRows.slice().sort((a, b) => order.indexOf(a.k) - order.indexOf(b.k))
    .map((r) => ({ label: device(r.k, lang), share: share(num(r.x), devSum), text: `${f.pct(share(num(r.x), devSum))}  ·  ${f.int(r.x)}` }));
  const devBlock = devParts.length ? { t: 'stack', title: t.devices, parts: devParts } : { t: 'sec', title: t.devices, text: t.nothing };
  p2.push({ t: 'two', left: cityBlock, right: devBlock });
  pages.push(p2);

  // ----- 3. what visits do on the site -----
  const p3 = [{ t: 'h', text: t.p3 }];
  const eng = ct.eng || {};
  const engN = Array.isArray(eng.n) ? eng.n.map(num) : [];
  const engSum = engN.reduce((s, v) => s + v, 0);
  const med = k.engMedian && k.engMedian.v !== null && k.engMedian.v !== undefined ? k.engMedian.v : eng.median;
  if (engSum > 0) {
    p3.push({ t: 'cols', title: t.eng, lead: fill(t.engLine, { v: f.dur(med) }),
      points: engN.map((v, i) => ({ label: t.engBins[i] || '', v, text: f.pct(share(v, engSum)) })) });
  } else p3.push({ t: 'sec', title: t.eng, text: t.nothing });

  const sc = (ct.scroll && Array.isArray(ct.scroll.n)) ? ct.scroll.n.map(num) : [];
  const scSum = sc.reduce((s, v) => s + v, 0);
  if (scSum > 0) {
    const from5 = (i) => sc.slice(i).reduce((s, v) => s + v, 0) / scSum;
    const rows = [5, 10, 15, 18].map((i, j) => ({ label: t.scrollRows[j], v: from5(i), text: fill(t.scrollText, { p: f.pct(from5(i)) }) }));
    p3.push({ t: 'bars', title: t.scroll, rows, max: 1 });
  } else p3.push({ t: 'sec', title: t.scroll, text: t.nothing });

  const reach = ct.offer && ct.offer.reach !== undefined ? num(ct.offer.reach) : null;
  if (reach !== null && num(ct.pv || ov.pv || (k.pv && k.pv.v)) > 0) p3.push({ t: 'sec', title: t.offer, text: fill(t.offerLine, { p: f.pct(reach) }), big: f.pct(reach) });

  const items = st.items || {};
  const sRows = [];
  for (const it of ['suit', 'helmet']) {
    const x = items[it];
    if (!x) continue;
    const ready = num(x.ready), touched = num(x.touched);
    sRows.push([t.studioRows[it], fill(t.studioCell, { v: f.int(ready) }), fill(t.studioTouch, { v: f.int(touched), p: f.pct(share(touched, ready)) })]);
  }
  const tour = num(st.tour && st.tour.started);
  if (sRows.length) p3.push({ t: 'table', title: t.studio, head: t.studioCols, rows: sRows, align: ['l', 'r', 'r'], note: tour === 1 ? t.tour1 : fill(t.tour, { v: f.int(tour) }) });
  pages.push(p3);

  // ----- 4. the brand -----
  if (brand) {
    const p4 = [{ t: 'h', text: t.p4, sub: brand.name }];
    const pick = (s) => (lang === 'en' ? s.en : s.pt);
    const facts = [];
    if (brand.title) facts.push(t.wholeSuit);
    const suit = brand.spots.filter((s) => s.item !== 'helmet').map(pick), helmet = brand.spots.filter((s) => s.item === 'helmet').map(pick);
    if (!brand.title && suit.length) facts.push(fill(t.onSuit, { list: suit.join(', ') }));
    if (helmet.length) facts.push(fill(t.onHelmet, { list: helmet.join(', ') }));
    if (facts.length) p4.push({ t: 'facts', rows: facts });

    const months = monthsIn(from, to);
    const mlabel = (m, i) => f.mon3(m, crossYear && (i === 0 || m.endsWith('-01')));
    if (brand.hosts.length && d.sponsors) {
      const sp = d.sponsors;
      const byMonth = new Map(months.map((m) => [m, 0]));
      for (const mo of sp.months || []) for (const r of mo.rows || []) if (hostMatches(r.host, brand.hosts) && byMonth.has(mo.month)) byMonth.set(mo.month, byMonth.get(mo.month) + num(r.logo));
      const views = new Map((sp.list || []).map((x) => [x.month, num(x.views)]));
      const total = [...byMonth.values()].reduce((s, v) => s + v, 0);
      const vTotal = months.reduce((s, m) => s + (views.get(m) || 0), 0);
      const rows = months.map((m) => [f.month(m), f.int(byMonth.get(m)), f.int(views.get(m) || 0)]);
      if (months.length > 1) rows.push([t.total, f.int(total), f.int(vTotal)]);
      // a chart only when there is more than one month to compare; the table always
      if (months.length > 1) {
        p4.push({ t: 'cols', title: t.logo, lead: fill(t.logoNote, { hosts: brand.hosts.join(', ') }),
          points: months.map((m, i) => ({ label: mlabel(m, i), v: byMonth.get(m), text: f.int(byMonth.get(m)) })), gold: true });
      }
      p4.push({ t: 'table', ...(months.length > 1 ? {} : { title: t.logo, lead: fill(t.logoNote, { hosts: brand.hosts.join(', ') }) }), head: t.logoCols, rows, align: ['l', 'r', 'r'], totalRow: months.length > 1,
        note: total === 1 ? fill(t.logoTotal1, { views: f.int(vTotal) }) : fill(t.logoTotal, { v: f.int(total), views: f.int(vTotal) }) });
    } else if (!brand.hosts.length && brand.shared) {
      p4.push({ t: 'sec', title: t.logo, text: fill(t.logoShared, { net: brand.shared }) });
    }

    if (!brand.montraIds.length) p4.push({ t: 'sec', title: t.montra, text: t.montraNone });
    else {
      const mt = d.montra || {};
      const ids = new Set(brand.montraIds);
      const byM = new Map(months.map((m) => [m, [0, 0, 0]]));
      for (const mo of mt.months || []) for (const r of mo.rows || []) {
        if (!ids.has(r.brand) || !byM.has(mo.month)) continue;
        const a = byM.get(mo.month); a[0] += num(r.view); a[1] += num(r.shop); a[2] += num(r.code);
      }
      const names = productNames(o.montraJson);
      const byP = new Map();
      for (const r of mt.totals || []) {
        if (!ids.has(r.brand)) continue;
        const a = byP.get(r.prod) || [0, 0, 0]; a[0] += num(r.view); a[1] += num(r.shop); a[2] += num(r.code); byP.set(r.prod, a);
      }
      const tot = [...byM.values()].reduce((s, a) => [s[0] + a[0], s[1] + a[1], s[2] + a[2]], [0, 0, 0]);
      if (!tot[0] && !tot[1] && !tot[2]) p4.push({ t: 'sec', title: t.montra, text: t.montraEmpty });
      else {
        if (months.length > 1) {
          p4.push({ t: 'grouped', title: t.montra, lead: t.montraNote, legend: t.montraLegend,
            groups: months.map((m, i) => ({ label: mlabel(m, i), vals: byM.get(m) })) });
        }
        const rows = months.map((m) => [f.month(m), ...byM.get(m).map(f.int)]);
        if (months.length > 1) rows.push([t.total, ...tot.map(f.int)]);
        p4.push({ t: 'table', ...(months.length > 1 ? {} : { title: t.montra, lead: t.montraNote }), head: t.montraCols, rows, align: ['l', 'r', 'r', 'r'], totalRow: months.length > 1 });
        // a product no longer in data/montra.json: its id without the brand, said to be gone
        const pname = (id) => {
          const n = names.get(id);
          if (n) return lang === 'en' ? n.en : n.pt;
          const short = brand.montraIds.reduce((s, b) => (s.startsWith(`${b}-`) ? s.slice(b.length + 1) : s), String(id)).replace(/-/g, ' ');
          return fill(t.retired, { name: short });
        };
        const prows = [...byP].sort((a, b) => b[1][0] - a[1][0] || String(a[0]).localeCompare(String(b[0]))).map(([id, a]) => [pname(id), ...a.map(f.int)]);
        if (prows.length) p4.push({ t: 'table', title: t.montraProd, head: t.montraProdCols, rows: prows, align: ['l', 'r', 'r', 'r'] });
      }
    }
    pages.push(p4);
  }

  // ----- the method, at the end -----
  pages[pages.length - 1].push({ t: 'box', title: t.methodsH, text: t.methods });

  return {
    lang, title, period,
    file: fileName(lang, from, to, brand),
    docTitle: `GOCARMO · ${title} · ${period}`,
    subject: fill(t.subject, { period }),
    author: t.head.name,
    head: t.head,
    foot: t.foot,
    pages,
    visits,
  };
}

// every string a model holds (for the words lint), the page footers included
export function modelStrings(m) {
  const out = [m.title, m.period, m.docTitle, m.subject, fill(m.foot, { period: m.period, i: 1, n: 4 })];
  const walk = (v) => {
    if (v === null || v === undefined) return;
    if (typeof v === 'string') { out.push(v); return; }
    if (Array.isArray(v)) { v.forEach(walk); return; }
    if (typeof v === 'object') for (const [key, x] of Object.entries(v)) if (key !== 't' && key !== 'align') walk(x);
  };
  walk(m.pages);
  return out.filter((s) => s !== '');
}
