// The link of a sponsor's logo (owner decision of 02.11.2026): a tap on it is the event sponsor_click { spot, via, item }
// (the public spot id or `title`, where it was tapped, the item), beside the click's own outbound record (host, osp).
// GET /admin/v1/sponsors gives the clicks per month and spot (`spots`, exact, Instagram links included) and keeps the
// host rows, with `logoOld`: the logo clicks of days with no sponsor_click (the history), so a report adds spots +
// logoOld and never counts a click twice. Days at least a year ahead of the real clock.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, api, visit, ev, click, lisbonISO, addDays } from './helpers.mjs';
import { sponsorsOf, Acc } from '../src/query.js';
import { EVENTS } from '../src/schema.js';

const Y = new Date().getUTCFullYear() + 3;
// (all within the 30 days of raw records before T: no nightly summary runs on these days)
const D1 = `${Y}-05-25`, D2 = `${Y}-05-26`, D3 = `${Y}-06-02`, T = `${Y}-06-10`;
const at = (day, hh = 12) => lisbonISO(day, hh);
const NOW = at(T, 15);
const range = (from, to) => `p=custom&from=${from}&to=${to}`;
// the tap on «Visitar Oficina Lima» in the spot's card, and on the logo in «Já no fato»: both records of one tap
const card = (i, host) => click(i, { sel: '#spot-detail > div.sd-sponsor > a.sd-visit', lab: 'sd-visit', sec: 'o-fato', x: 50, y: 700, ex: 50, ey: 50, pt: 't', ia: 1, out: host, osp: 1 });
const list = (i, host) => click(i, { sel: '#onsuit-list > li > a.os-b', lab: 'patrocinador', sec: 'fato-topo', x: 40, y: 900, ex: 50, ey: 50, pt: 't', ia: 1, out: host, osp: 1 });
let mf, n = 0;
const ip = () => { n++; return `10.${90 + (n >> 8)}.${n & 255}.3`; };
const get = async (q) => { const r = await api(mf, q, { now: NOW }); assert.equal(r.status, 200, `${q}: ${r.text}`); return r.json; };

before(async () => {
  mf = await start();
  // D1, before the new tracker: host only (oficinalima.pt twice, an Instagram link once: not the brand's own)
  await visit(mf, { ip: ip(), now: at(D1, 10), events: [list(1, 'oficinalima.pt'), list(2, 'oficinalima.pt'), list(3, 'instagram.com')] });
  // D2, the new tracker: each tap gives the click (host) and the event (spot)
  await visit(mf, { ip: ip(), now: at(D2, 10), events: [card(1, 'oficinalima.pt'), ev(2, 'sponsor_click', { spot: 'lombar', via: 'ficha', item: 'suit' }),
    list(3, 'instagram.com'), ev(4, 'sponsor_click', { spot: 'capacete-topo', via: 'lista', item: 'helmet' })] });
  // an old cached page on the same day (host only): that day is counted by spot, so this one is not added twice
  await visit(mf, { ip: ip(), now: at(D2, 11), events: [list(1, 'oficinalima.pt')] });
  // D3: the whole suit's partner, and junk: an unknown spot or no spot never counts; a bad via counts the click, without a via
  await visit(mf, { ip: ip(), now: at(D3, 10), events: [list(1, 'grande.pt'), ev(2, 'sponsor_click', { spot: 'title', via: 'lista', item: 'suit' }),
    ev(3, 'sponsor_click', { spot: 'nao-existe', via: 'lista' }), ev(4, 'sponsor_click', { via: 'ficha' }), ev(5, 'sponsor_click', { spot: 'lombar', via: 'x', item: 'suit' }),
    card(6, 'oficinalima.pt'), ev(7, 'sponsor_click', { spot: 'lombar', via: 'ficha', item: 'suit' })] });
});
after(async () => { await mf?.dispose(); });

test('the event: spot required (a spot id or title), via ficha|lista, cap 10', () => {
  const E = EVENTS.sponsor_click;
  assert.deepEqual(E.need, ['spot']);
  assert.equal(E.cap, 10);
  assert.equal(E.p.spot('lombar'), 'lombar'); assert.equal(E.p.spot('title'), 'title'); assert.equal(E.p.spot('Oficina Lima'), undefined); assert.equal(E.p.spot('oficinalima.pt'), undefined);
  assert.equal(E.p.via('ficha'), 'ficha'); assert.equal(E.p.via('lista'), 'lista'); assert.equal(E.p.via('outro'), undefined);
});

test('clicks by spot, logoOld only on days without sponsor_click, spotsFrom', async () => {
  const s = await get(`sponsors?${range(D1, addDays(T, -1))}`);
  assert.deepEqual(s.spots, [
    { month: `${Y}-05`, rows: [{ spot: 'capacete-topo', ficha: 0, lista: 1, clicks: 1 }, { spot: 'lombar', ficha: 1, lista: 0, clicks: 1 }] },
    { month: `${Y}-06`, rows: [{ spot: 'lombar', ficha: 1, lista: 0, clicks: 2 }, { spot: 'title', ficha: 0, lista: 1, clicks: 1 }] },
  ]);
  assert.deepEqual(s.spotTotals, [{ spot: 'capacete-topo', ficha: 0, lista: 1, clicks: 1 }, { spot: 'lombar', ficha: 2, lista: 0, clicks: 3 }, { spot: 'title', ficha: 0, lista: 1, clicks: 1 }]);
  assert.equal(s.spotsFrom, D2);
  // the host rows count every click as before; logoOld only D1's (D2 and D3 have sponsor_click)
  const may = s.months.find((m) => m.month === `${Y}-05`).rows;
  assert.deepEqual(may.find((r) => r.host === 'oficinalima.pt'), { host: 'oficinalima.pt', logo: 4, shop: 0, logoOld: 2 });
  assert.deepEqual(may.find((r) => r.host === 'instagram.com'), { host: 'instagram.com', logo: 2, shop: 0, logoOld: 1 });
  const jun = s.months.find((m) => m.month === `${Y}-06`).rows;
  assert.ok(jun.every((r) => r.logoOld === 0), JSON.stringify(jun));
  // nothing of the brand, the link or the visitor in the spot rows
  const text = JSON.stringify(s.spots);
  for (const x of ['oficinalima', 'Oficina Lima', 'instagram', '10.9']) assert.ok(!text.includes(x), x);
});

test('spots= filter: only those ids in the spot rows; anything else is 400 filtro', async () => {
  const s = await get(`sponsors?${range(D1, addDays(T, -1))}&spots=lombar,title`);
  assert.deepEqual(s.spotTotals.map((r) => r.spot), ['lombar', 'title']);
  assert.equal(s.spotsFrom, D2, 'spotsFrom is the page\'s, not the filter\'s');
  for (const q of ['', 'gp cars', 'lombar,nao-existe', Array.from({ length: 26 }, () => 'lombar').join(',')]) {
    const r = await api(mf, `sponsors?${range(D1, addDays(T, -1))}&spots=${encodeURIComponent(q)}`, { now: NOW });
    assert.equal(r.status, 400, q); assert.deepEqual(r.json, { error: 'filtro' }, q);
  }
});

test('a period with no sponsor_click: no spot rows, spotsFrom empty, logoOld = logo', async () => {
  const s = await get(`sponsors?${range(D1, D1)}`);
  assert.deepEqual([s.spots, s.spotTotals, s.spotsFrom], [[], [], '']);
  assert.deepEqual(s.totals, [{ host: 'instagram.com', logo: 1, shop: 0, logoOld: 1 }, { host: 'oficinalima.pt', logo: 2, shop: 0, logoOld: 2 }]);
});

test('sponsorsOf (unit): a day with any sponsor_click is counted by spot only', () => {
  const a = new Acc([`${Y}-01-30`, `${Y}-01-31`]);
  a.add(`${Y}-01-30`, 'out', 'patrocinador\to-fato\tmarca.pt', 3, 3, 0);
  a.add(`${Y}-01-31`, 'out', 'patrocinador\to-fato\tmarca.pt', 2, 2, 0);
  a.add(`${Y}-01-31`, 'out', 'patrocinador\tmaterial\tmarca.pt', 1, 1, 0);
  a.add(`${Y}-01-31`, 'ev', 'sponsor_click\titem=suit&spot=peito&via=ficha', 1, 1, 0);
  a.add(`${Y}-01-31`, 'ev', 'sponsor_click\titem=helmet&spot=capacete-topo&via=lista', 1, 1, 0);
  const s = sponsorsOf(a, '', null);
  assert.deepEqual(s.totals, [{ host: 'marca.pt', logo: 5, shop: 1, logoOld: 3 }]);
  assert.deepEqual(s.spotTotals, [{ spot: 'capacete-topo', ficha: 0, lista: 1, clicks: 1 }, { spot: 'peito', ficha: 1, lista: 0, clicks: 1 }]);
  assert.equal(s.spotsFrom, `${Y}-01-31`);
  assert.deepEqual(sponsorsOf(a, '', ['peito']).spotTotals, [{ spot: 'peito', ficha: 1, lista: 0, clicks: 1 }]);
});
