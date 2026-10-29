// The showcase «O meu material» (#material): the three events and their slugs, the zone and the anchor, derive
// (keys, caps, meaningful), the `montra` endpoint by month and the `montra` CSV table (SPEC 3.6, 4.7).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, api, dump, visit, ev, click, PLACE, lisbonISO, lisbonToday, addDays } from './helpers.mjs';
import { EVENTS, ZONES, ANCHORS, ERROR_FILES, slug, prodOfBrand } from '../src/schema.js';
import { eventsOf } from '../src/derive.js';
import { montraOf } from '../src/query.js';

let mf;
const TODAY = lisbonToday();
const D1 = addDays(TODAY, -2);                     // this month or the last one
const D0 = addDays(TODAY, -40);                    // always another calendar month than D1
const at = (day, hh, mm = 0) => lisbonISO(day, hh, mm);
const NOW = at(TODAY, 15);
const get = async (q) => { const r = await api(mf, q, { now: NOW }); assert.equal(r.status, 200, `${q}: ${r.text}`); return r.json; };
const range = (from, to) => `p=custom&from=${from}&to=${to}`;
const G = { brand: 'marca-a', prod: 'marca-a-gel' };
const B = { brand: 'marca-a', prod: 'marca-a-garrafa' };
const C = { brand: 'marca-b', prod: 'marca-b-meias' };
const shopClick = (i) => click(i, { sel: '#material > div.wrap > ul.mt-grid > li.mt-card > div.mt-body > a.mt-shop', lab: 'montra-shop', sec: 'material',
  x: 50, y: 9000, ex: 50, ey: 50, pt: 't', ia: 1, out: 'loja.marca-a.pt', osp: 1 });

before(async () => {
  mf = await start();
  const lis = PLACE.lisboa;
  // D0: one page view sees two cards and taps the gel's shop link twice
  await visit(mf, { ip: '10.7.0.1', cf: lis, now: at(D0, 10),
    snap: { eng: 5, rz: ['top', 'apoiar', 'material'], sec: { top: 3, material: 12 } },
    events: [ev(1, 'montra_view', G), ev(2, 'montra_view', B), ev(3, 'montra_view', G), ev(4, 'montra_shop', G), shopClick(5), ev(6, 'montra_shop', G), shopClick(7)] });
  // D0 is older than the raw window: the nightly rollup keeps its totals (read from `agg`); D1 is read from the raw rows
  const r = await api(mf, 'dev/rollup', { method: 'POST', body: { day: D0 }, now: at(addDays(D0, 1), 4) });
  assert.equal(r.status, 200, r.text);
  // D1: three page views
  await visit(mf, { ip: '10.7.1.1', cf: lis, now: at(D1, 10), page: { land: '#material' },
    snap: { eng: 4, rz: ['top', 'material'], sec: { material: 20 }, ex: 'material' },
    events: [ev(1, 'montra_view', G), ev(2, 'montra_code', G), ev(3, 'montra_view', C), ev(4, 'montra_shop', C), shopClick(5)] });
  await visit(mf, { ip: '10.7.1.2', cf: lis, now: at(D1, 11),
    snap: { eng: 30, rz: ['top', 'material', 'contacto'], sec: { material: 8 } },
    events: [ev(1, 'montra_view', G), ev(2, 'montra_view', C), ev(3, 'montra_code', C), ev(4, 'montra_code', C)] });
  // dropped: an uppercase id, a 4-digit run, 41 characters, no product, a code instead of an id
  await visit(mf, { ip: '10.7.1.3', cf: lis, now: at(D1, 12),
    snap: { eng: 3, rz: ['top'] },
    events: [ev(1, 'montra_shop', { brand: 'Marca-A', prod: 'marca-a-gel' }), ev(2, 'montra_shop', { brand: 'marca-a', prod: 'gel-2027' }),
      ev(3, 'montra_shop', { brand: 'marca-a', prod: `a${'b'.repeat(40)}` }), ev(4, 'montra_shop', { brand: 'marca-a' }),
      ev(5, 'montra_code', { brand: 'marca-a', prod: 'CARMO10' }), ev(6, 'montra_view', { prod: 'marca-a-gel' }),
      // a forged pair: one brand with another brand's product, and a product of no brand prefix
      ev(7, 'montra_shop', { brand: 'marca-a', prod: 'marca-b-meias' }), ev(8, 'montra_view', { brand: 'marca-a', prod: 'inventado' })] });
});
after(async () => { await mf?.dispose(); });

test('schema: the zone, the anchor, the slugs and the three events', () => {
  assert.equal(ZONES[ZONES.indexOf('apoiar') + 1], 'material', 'between Apoiar and Contacto');
  assert.equal(ZONES[ZONES.indexOf('material') + 1], 'contacto');
  assert.ok(ANCHORS.includes('material'));
  assert.ok(ERROR_FILES.has('montra.js') && ERROR_FILES.has('montra-core.js'), 'an error in the showcase code keeps its file name');
  for (const v of ['marca-a', 'marca-a-gel', 'a', 'gel-750', 'x1-2-3']) assert.equal(slug(v), v, v);
  for (const v of ['Marca', 'gel-2027', 'a1234', `a${'b'.repeat(40)}`, '-a', 'a-', 'a--b', '1a', 'a_b', 'a b', 'CARMO10', '', 7, null, undefined, ['a']]) {
    assert.equal(slug(v), undefined, String(v));
  }
  assert.equal(slug('a'.repeat(40)), 'a'.repeat(40));
  for (const n of ['montra_view', 'montra_shop', 'montra_code']) {
    assert.deepEqual(Object.keys(EVENTS[n].p), ['brand', 'prod'], n);
    assert.deepEqual(EVENTS[n].need, ['brand', 'prod'], n);
  }
  assert.deepEqual([EVENTS.montra_view.cap, EVENTS.montra_view.per, EVENTS.montra_shop.cap, EVENTS.montra_code.cap], [1, 'prod', 10, 10]);
  for (const n of ['montra_view', 'montra_shop', 'montra_code']) assert.equal(EVENTS[n].rel, prodOfBrand, n);
  assert.equal(prodOfBrand({ brand: 'marca-a', prod: 'marca-a-gel' }), true);
  for (const p of [{ brand: 'marca-a', prod: 'marca-b-meias' }, { brand: 'marca-a', prod: 'marca-a' }, { brand: 'marca', prod: 'marcas-gel' }, { brand: 'marca-a' }, {}]) {
    assert.equal(prodOfBrand(p), false, JSON.stringify(p));
  }
});

test('derive: one view per product and page view, events without both ids dropped', () => {
  const batch = (e) => [{ f: 2, e: JSON.stringify(e) }];
  const { events } = eventsOf(batch([ev(1, 'montra_view', G), ev(2, 'montra_view', G), ev(3, 'montra_view', B),
    ev(4, 'montra_view', { brand: 'marca-a' }), ev(5, 'montra_shop', { prod: 'marca-a-gel' }), ev(6, 'montra_code', {}),
    ev(7, 'montra_view', { brand: 'marca-b', prod: 'marca-a-gel' }), ev(8, 'montra_code', { brand: 'marca-a', prod: 'marca-b-meias' }),
    ...Array.from({ length: 12 }, (_, i) => ev(10 + i, 'montra_shop', G))]));
  assert.deepEqual(events.filter((e) => e.n === 'montra_view').map((e) => e.p.prod), ['marca-a-gel', 'marca-a-garrafa']);
  assert.equal(events.filter((e) => e.n === 'montra_shop').length, 10, 'at most 10 shop taps per page view');
  assert.equal(events.filter((e) => e.n === 'montra_code').length, 0);
});

test('stored as `ev`, the zone `material`, the landing hash and the sponsor link out', async () => {
  const d = await dump(mf, ['montra_', 'material']);
  const text = JSON.stringify(d);
  assert.doesNotMatch(text, /Marca-A|gel-2027|CARMO10|bbbbbbbbbb|inventado/, 'refused ids never stored');
  assert.doesNotMatch(text, /brand=marca-a&prod=marca-b/, 'a product of another brand is never stored with it');
  const c = await get(`contacts?${range(D1, D1)}`);
  const out = JSON.stringify(c);
  assert.match(out, /loja\.marca-a\.pt/, 'a shop tap is a sponsor link out, with its host');
  const content = await get(`content?${range(D0, D1)}`);
  const z = JSON.stringify(content);
  assert.match(z, /"material"/, 'the zone is in the content tab');
  const aud = await get(`audience?${range(D1, D1)}`);
  assert.match(JSON.stringify(aud), /#material/, 'landing on #material is kept');
});

test('a shop tap or a code copy makes the page view meaningful (engaged)', async () => {
  // D1: three page views with eng under 10, two of them with a montra_shop or montra_code; one plain (dropped events)
  const o = await get(`overview?${range(D1, D1)}`);
  // 10.7.1.1 (shop + code, eng 4) and 10.7.1.2 (eng 30) are engaged; 10.7.1.3 has only dropped events, eng 3
  assert.equal(o.pv, 3);
  assert.equal(Math.round(o.kpi.engaged.v * 3), 2);
});

test('GET montra: per month and product, views as page views, totals, the reach of the section', async () => {
  const m = await get(`montra?${range(D0, D1)}`);
  assert.equal(m.pv, 4);
  assert.deepEqual(m.ignored, ['dev']);
  const mo0 = D0.slice(0, 7), mo1 = D1.slice(0, 7);
  assert.deepEqual(m.months.map((x) => x.month), [mo0, mo1]);
  assert.deepEqual(m.months[0].rows, [
    { brand: 'marca-a', prod: 'marca-a-garrafa', view: 1, shop: 0, code: 0 },
    { brand: 'marca-a', prod: 'marca-a-gel', view: 1, shop: 2, code: 0 },
  ]);
  assert.deepEqual(m.months[1].rows, [
    { brand: 'marca-a', prod: 'marca-a-gel', view: 2, shop: 0, code: 1 },
    { brand: 'marca-b', prod: 'marca-b-meias', view: 2, shop: 1, code: 2 },
  ]);
  assert.deepEqual(m.totals, [
    { brand: 'marca-a', prod: 'marca-a-garrafa', view: 1, shop: 0, code: 0 },
    { brand: 'marca-a', prod: 'marca-a-gel', view: 3, shop: 2, code: 1 },
    { brand: 'marca-b', prod: 'marca-b-meias', view: 2, shop: 1, code: 2 },
  ]);
  assert.equal(m.zone.reach, 3, 'three page views reached #material');
  assert.equal(m.zone.secs, 40);
  // a device filter does not split the showcase
  const dm = await get(`montra?${range(D0, D1)}&dev=desktop`);
  assert.deepEqual(dm.totals, m.totals);
  // one month only
  const one = await get(`montra?${range(D1, D1)}`);
  assert.deepEqual(one.months.map((x) => x.month), [mo1]);
  // whole days only
  for (const q of ['montra?p=24h', `montra?${range(D1, TODAY)}`]) {
    const r = await api(mf, q, { now: NOW });
    assert.equal(r.status, 400, q); assert.deepEqual(r.json, { error: 'periodo' });
  }
  // nothing in a period without the showcase
  const none = await get(`montra?${range(addDays(D0, -3), addDays(D0, -1))}`);
  assert.deepEqual([none.months, none.totals, none.zone.reach], [[], [], 0]);
});

test('CSV montra: header, a row per month and product, the brand totals', async () => {
  const r = await api(mf, `export.csv?t=montra&${range(D0, D1)}`, { now: NOW });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get('content-disposition'), `attachment; filename="gocarmo-montra-${D0}-${D1}.csv"`);
  const lines = r.text.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines[0], 'mês;marca;produto;cartões vistos;cliques na loja;códigos copiados');
  const mo0 = D0.slice(0, 7), mo1 = D1.slice(0, 7);
  assert.deepEqual(lines.slice(1), [
    `${mo0};marca-a;marca-a-garrafa;1;0;0`,
    `${mo0};marca-a;marca-a-gel;1;2;0`,
    `${mo0};marca-a;total da marca;2;2;0`,
    `${mo1};marca-a;marca-a-gel;2;0;1`,
    `${mo1};marca-b;marca-b-meias;2;1;2`,
    `${mo1};marca-a;total da marca;2;0;1`,
    `${mo1};marca-b;total da marca;2;1;2`,
    `${D0} a ${D1};marca-a;total do período;4;2;1`,
    `${D0} a ${D1};marca-b;total do período;2;1;2`,
  ]);
  const h = await api(mf, `export.csv?t=montra&${range(D1, TODAY)}`, { now: NOW });
  assert.equal(h.status, 400); assert.deepEqual(h.json, { error: 'periodo' });
});

test('CSV montra for one brand (b=): only its rows, its name in the file, nothing of another brand', async () => {
  const r = await api(mf, `export.csv?t=montra&b=marca-b&${range(D0, D1)}`, { now: NOW });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.get('content-disposition'), `attachment; filename="gocarmo-montra-marca-b-${D0}-${D1}.csv"`);
  const lines = r.text.replace(/^﻿/, '').trim().split('\r\n');
  const mo1 = D1.slice(0, 7);
  assert.deepEqual(lines, [
    'mês;marca;produto;cartões vistos;cliques na loja;códigos copiados',
    `${mo1};marca-b;marca-b-meias;2;1;2`,
    `${mo1};marca-b;total da marca;2;1;2`,
    `${D0} a ${D1};marca-b;total do período;2;1;2`,
  ]);
  assert.doesNotMatch(r.text, /marca-a/, 'no other brand id in the file');
  const a = await api(mf, `export.csv?t=montra&b=marca-a&${range(D0, D1)}`, { now: NOW });
  assert.equal(a.status, 200, a.text);
  assert.doesNotMatch(a.text, /marca-b/);
  assert.match(a.text, /marca-a-gel;1;2;0/);
  // a brand with no rows: the header only
  const z = await api(mf, `export.csv?t=montra&b=marca-z&${range(D0, D1)}`, { now: NOW });
  assert.equal(z.status, 200, z.text);
  assert.deepEqual(z.text.replace(/^﻿/, '').trim().split('\r\n'), ['mês;marca;produto;cartões vistos;cliques na loja;códigos copiados']);
  // b must be a brand slug, and only with t=montra
  for (const q of ['t=montra&b=Marca-B', 't=montra&b=marca%20b', 't=montra&b=', 't=dias&b=marca-a']) {
    const x = await api(mf, `export.csv?${q}&${range(D0, D1)}`, { now: NOW });
    assert.equal(x.status, 400, q); assert.deepEqual(x.json, { error: 'filtro' }, q);
  }
});

test('montraOf: ids from the key, view = page views, shop and code = taps', () => {
  const rows = new Map([
    ['montra_view\tbrand=x&prod=x-a', [5, 3, 0]],
    ['montra_shop\tbrand=x&prod=x-a', [4, 2, 0]],
    ['montra_code\tbrand=x&prod=x-b', [1, 1, 0]],
    ['montra_shop\tbrand=x', [9, 9, 0]],
    ['spot_select\tspot=peito', [9, 9, 0]],
  ]);
  const acc = { slots: ['2027-03-31', '2027-04-01'], slotRows: (s, m) => (m === 'ev' ? rows : new Map()), get: () => [2, 0, 30], c: () => 4 };
  const m = montraOf(acc);
  assert.deepEqual(m.months.map((x) => x.month), ['2027-03', '2027-04']);
  assert.deepEqual(m.months[0].rows, [{ brand: 'x', prod: 'x-a', view: 3, shop: 4, code: 0 }, { brand: 'x', prod: 'x-b', view: 0, shop: 0, code: 1 }]);
  assert.deepEqual(m.totals, [{ brand: 'x', prod: 'x-a', view: 6, shop: 8, code: 0 }, { brand: 'x', prod: 'x-b', view: 0, shop: 0, code: 2 }]);
  assert.deepEqual(m.zone, { reach: 2, secs: 30, r: 0.5 });
});

test('a page view that reaches every zone, the showcase included, keeps all of them (needs sanitize.js: no fixed 15/16)', async () => {
  const m2 = await start();
  try {
    const sec = Object.fromEntries([...ZONES, 'reserva'].map((z) => [z, 2]));
    await visit(m2, { ip: '10.7.9.1', now: at(D1, 10), snap: { eng: 60, rz: ZONES.slice(), sec } });
    const c = await api(m2, `content?${range(D1, D1)}`, { now: NOW });
    assert.equal(c.status, 200, c.text);
    for (const z of ZONES) {
      const row = c.json.zones.find((x) => x.z === z);
      assert.deepEqual([z, row && row.reached, row && row.sec], [z, 1, 2], `zone ${z} reached and timed`);
    }
  } finally { await m2.dispose(); }
});
