// GET /admin/v1/sponsors: the clicks on a sponsor's logo or link (the sponsor list on the suit) and on its shop links
// in the showcase, by calendar month and host, and the page views where the sponsor list came into view; for the
// brand reports of /admin/analytics/ («Relatório PDF»). Days at least a year ahead of the real clock (the nightly
// alarm runs on the real clock and never touches them).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, api, visit, ev, click, UA, lisbonISO, addDays } from './helpers.mjs';
import { sponsorsOf, Acc } from '../src/query.js';

const Y = new Date().getUTCFullYear() + 2;
const M1 = `${Y}-03-31`, M2 = `${Y}-04-01`, T = `${Y}-04-10`;
const at = (day, hh = 12) => lisbonISO(day, hh);
const NOW = at(T, 15);
const range = (from, to) => `p=custom&from=${from}&to=${to}`;
const logo = (i, host) => click(i, { sel: '#onsuit-list > li > a', lab: 'Marca', sec: 'o-fato', x: 40, y: 900, ex: 50, ey: 50, pt: 't', ia: 1, out: host, osp: 1 });
const shop = (i, host) => click(i, { sel: '#material > div.wrap > ul.mt-grid > li.mt-card > div.mt-body > a.mt-shop', lab: 'montra-shop', sec: 'material',
  x: 50, y: 9000, ex: 50, ey: 50, pt: 't', ia: 1, out: host, osp: 1 });
const other = (i, host) => click(i, { sel: 'footer > a', lab: 'Site', sec: 'footer', x: 50, y: 9900, ex: 50, ey: 50, pt: 't', ia: 1, out: host });
let mf, n = 0;
const ip = () => { n++; return `10.${60 + (n >> 8)}.${n & 255}.1`; };
const get = async (q) => { const r = await api(mf, q, { now: NOW }); assert.equal(r.status, 200, `${q}: ${r.text}`); return r.json; };

before(async () => {
  mf = await start();
  // M1 (March): two logo clicks on marca.pt, one on loja.marca.pt (a subdomain), one shop click; the list seen
  await visit(mf, { ip: ip(), now: at(M1, 10), snap: { rz: ['top', 'o-fato', 'material'] },
    events: [ev(1, 'onsuit_view'), logo(2, 'marca.pt'), logo(3, 'marca.pt'), logo(4, 'loja.marca.pt'), shop(5, 'marca.pt')] });
  // a «www.» link is stored without it (the tracker and the Worker both strip it)
  await visit(mf, { ip: ip(), now: at(M1, 11), events: [ev(1, 'onsuit_view'), logo(2, 'www.outra.pt')] });
  // not a sponsor link (no osp): never counted here
  await visit(mf, { ip: ip(), now: at(M1, 12), events: [other(1, 'marca.pt')] });
  // M2 (April): one shop click, one logo click; and one of mine (internal)
  await visit(mf, { ip: ip(), ua: UA.win, now: at(M2, 10), page: { vw: 'd', pc: 0 }, events: [ev(1, 'onsuit_view'), shop(2, 'marca.pt'), logo(3, 'marca.pt')] });
  await visit(mf, { ip: ip(), now: at(M2, 11), page: { int: 1 }, events: [ev(1, 'onsuit_view'), logo(2, 'marca.pt')] });
  // today: never in an answer
  await visit(mf, { ip: ip(), now: at(T, 9), events: [logo(1, 'marca.pt')] });
});
after(async () => { await mf?.dispose(); });

test('logo and shop by section, months across a month boundary, the list views', async () => {
  const s = await get(`sponsors?${range(M1, addDays(T, -1))}`);
  assert.equal(s.ok, true);
  assert.deepEqual(s.ignored, ['dev']);
  assert.deepEqual(s.months, [
    { month: `${Y}-03`, rows: [{ host: 'loja.marca.pt', logo: 1, shop: 0 }, { host: 'marca.pt', logo: 2, shop: 1 }, { host: 'outra.pt', logo: 1, shop: 0 }] },
    { month: `${Y}-04`, rows: [{ host: 'marca.pt', logo: 1, shop: 1 }] },
  ]);
  assert.deepEqual(s.totals, [{ host: 'loja.marca.pt', logo: 1, shop: 0 }, { host: 'marca.pt', logo: 3, shop: 2 }, { host: 'outra.pt', logo: 1, shop: 0 }]);
  assert.deepEqual(s.list, [{ month: `${Y}-03`, views: 2 }, { month: `${Y}-04`, views: 1 }]);
  // the same numbers as «Contactos» (one total per host for the period)
  const c = await get(`contacts?${range(M1, addDays(T, -1))}`);
  for (const t of s.totals) assert.equal(c.sponsors.find((x) => x.host === t.host).clicks, t.logo + t.shop, t.host);
});

test('host: the host and its subdomains, «www.» dropped, nothing else', async () => {
  const s = await get(`sponsors?${range(M1, addDays(T, -1))}&host=www.marca.pt`);
  assert.equal(s.host, 'marca.pt');
  assert.deepEqual(s.totals, [{ host: 'loja.marca.pt', logo: 1, shop: 0 }, { host: 'marca.pt', logo: 3, shop: 2 }]);
  assert.deepEqual(s.months.map((m) => m.rows.map((r) => r.host)), [['loja.marca.pt', 'marca.pt'], ['marca.pt']]);
  // the list views are the page's, not the brand's: the same with a host
  assert.deepEqual(s.list, [{ month: `${Y}-03`, views: 2 }, { month: `${Y}-04`, views: 1 }]);
  const none = await get(`sponsors?${range(M1, addDays(T, -1))}&host=arca.pt`);
  assert.deepEqual(none.totals, [], 'a suffix that is not a subdomain does not match');
  for (const h of ['', 'a b', 'x'.repeat(65), 'marca.pt/x', 'ma_rca.pt', '...']) {
    const r = await api(mf, `sponsors?${range(M1, addDays(T, -1))}&host=${encodeURIComponent(h)}`, { now: NOW });
    assert.equal(r.status, 400, h); assert.deepEqual(r.json, { error: 'filtro' }, h);
  }
});

test('int honoured, dev ignored, today refused, an empty period', async () => {
  const q = range(M2, M2);
  assert.deepEqual((await get(`sponsors?${q}`)).totals, [{ host: 'marca.pt', logo: 1, shop: 1 }]);
  assert.deepEqual((await get(`sponsors?${q}&int=1`)).totals, [{ host: 'marca.pt', logo: 2, shop: 1 }]);
  assert.deepEqual((await get(`sponsors?${q}&int=1`)).list, [{ month: `${Y}-04`, views: 2 }]);
  const all = await get(`sponsors?${q}`), mob = await get(`sponsors?${q}&dev=mobile`);
  assert.deepEqual(mob.months, all.months, 'the desktop visit stays with dev=mobile');
  for (const p of [range(M2, T), 'p=24h']) {
    const r = await api(mf, `sponsors?${p}`, { now: NOW });
    assert.equal(r.status, 400, p); assert.deepEqual(r.json, { error: 'periodo' });
  }
  const e = await get(`sponsors?${range(addDays(T, -5), addDays(T, -1))}`);
  assert.deepEqual([e.months, e.totals, e.list], [[], [], []]);
  assert.equal((await api(mf, 'sponsors', { now: NOW, method: 'POST', body: {} })).status, 405);
});

test('sponsorsOf: keys of `out`, only patrocinador, onsuit_view by page view', () => {
  const a = new Acc([`${Y}-01-31`, `${Y}-02-01`]);
  a.add(`${Y}-01-31`, 'out', 'patrocinador\to-fato\tmarca.pt', 3, 2, 0);
  a.add(`${Y}-01-31`, 'out', 'patrocinador\tmaterial\tmarca.pt', 1, 1, 0);
  a.add(`${Y}-01-31`, 'out', 'outro\tfooter\tmarca.pt', 5, 5, 0);
  a.add(`${Y}-01-31`, 'out', 'instagram\to-fato\t', 4, 4, 0);
  a.add(`${Y}-02-01`, 'out', 'patrocinador\tmaterial\tb.marca.pt', 2, 1, 0);
  a.add(`${Y}-02-01`, 'ev', 'onsuit_view', 9, 7, 0);
  const s = sponsorsOf(a, 'marca.pt');
  assert.deepEqual(s.months, [{ month: `${Y}-01`, rows: [{ host: 'marca.pt', logo: 3, shop: 1 }] }, { month: `${Y}-02`, rows: [{ host: 'b.marca.pt', logo: 0, shop: 2 }] }]);
  assert.deepEqual(s.list, [{ month: `${Y}-02`, views: 7 }]);
  assert.deepEqual(sponsorsOf(new Acc([`${Y}-01-31`])).months, []);
});
