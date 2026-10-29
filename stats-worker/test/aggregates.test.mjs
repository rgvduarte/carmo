// The numbers: derivation, k-folding, the heatmap rule, 24 h, rollup = live, late data, the alarm, CSV, notes,
// the monthly archive and pruning (SPEC 2.6–2.9, 3.6).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, post, api, dump, visit, page, ev, click, strip, UA, PLACE, KEY, lisbonISO, lisbonToday, addDays } from './helpers.mjs';
import { ZONES } from '../src/schema.js';

let mf;
const TODAY = lisbonToday();
const D = addDays(TODAY, -2);
const at = (day, hh, mm = 0) => lisbonISO(day, hh, mm);
const NOW = at(TODAY, 15);                        // the admin's clock in these tests
const get = async (q, now = NOW) => { const r = await api(mf, q, { now }); assert.equal(r.status, 200, `${q}: ${r.text}`); return r.json; };
const range = (day = D) => `p=custom&from=${day}&to=${day}`;
const FARO = { country: 'PT', region: 'Faro' };
const WIDE = { vw: 'w', vh: 900, pc: 0 };
const DESK = { vw: 'd', vh: 800, pc: 0 };
const TAB = { vw: 't', vh: 1100, pc: 1 };
let pvA;

const funnelA = [
  ev(1, 'cta_view', { id: 'hero-sponsor' }),
  click(2, { sel: '#top > div.hero-cta > a.btn:nth-of-type(1)', lab: 'hero.cta1', sec: 'top', x: 30, y: 400, ex: 50, ey: 50, pt: 't', ia: 1, cta: 'hero-sponsor' }),
  ev(3, 'hero_cta', { to: 'fato' }),
  ev(4, 'offer_reach', { s: 31, via: 'hero' }),
  ev(5, 'studio_near', { item: 'suit' }), ev(6, 'studio_seen', { item: 'suit' }),
  ev(7, '3d_ready', { item: 'suit', ms: 1800, mesh: 'worker' }),
  ev(8, 'studio_rotate', { item: 'suit' }), ev(9, 'studio_tap', { item: 'suit', hit: 1 }), ev(10, 'studio_tap', { item: 'suit', hit: 0 }),
  ev(11, 'tour_start', { item: 'suit' }), ev(12, 'tour_end', { item: 'suit', how: 'fim', n: 5 }),
  click(13, { sel: '#rc-body > li.rc-row[data-id="peito"] > button.nm', lab: 'Peito', sec: 'o-fato', x: 62, y: 1830, ex: 40, ey: 55, pt: 't', ia: 1 }),
  ev(14, 'spot_select', { spot: 'peito', from: 'tabela', item: 'suit' }),
  ev(15, 'pkg_add', { spot: 'peito', n: '1' }),
  click(16, { sel: '#pk-go', lab: 'pk.go', sec: 'pacote', x: 80, y: 20, ex: 50, ey: 50, pt: 't', ia: 1, cta: 'pkg-go' }),
  ev(17, 'claim_open', { via: 'pkg', n: '1', step: 1 }),
  click(18, { sel: '#cl-wa', lab: 'cl.wa', sec: 'reserva', x: 50, y: 300, ex: 50, ey: 50, pt: 't', ia: 1 }),
  ev(19, 'claim_send', { ch: 'whatsapp' }),
  ev(20, 'pay_tab', { tab: 'tr', auto: 0 }), ev(21, 'pay_copy', { what: 'iban' }), ev(22, 'claim_done', { tab: 'tr' }),
  ev(23, 'claim_close', { step: 2, how: 'feito' }),
];

before(async () => {
  mf = await start();
  const lis = PLACE.lisboa;
  // A: the whole funnel, from Google, on an iPhone in Lisbon
  pvA = await visit(mf, { ip: '10.2.1.1', cf: lis, now: at(D, 10), page: { ref: 'google.com' },
    snap: { eng: 200, scr: 80, scr1: 1, rz: ['top', 'tese', 'fato-topo', 'o-fato'], sec: { top: 20, tese: 30, 'fato-topo': 40, 'o-fato': 90, reserva: 20 }, ex: 'o-fato' },
    perf: { lcp: 2600, inp: 120, cls: 0.02, fcp: 1500, ttfb: 400, lcpT: '#top img', inpT: '#stage > canvas', inpK: 'pointer' },
    events: funnelA });
  await post(mf, { v: 1, q: 'patrocinio', a: 'sim', lang: 'pt', pv: pvA, vw: 'm', ex: 'o-fato' }, { path: '/v1/f', ip: '10.2.1.1', now: at(D, 10, 5) });
  // B: opens the booking window, closes it at step 1; rage on the hero spots; answers «Não» / «Os preços»
  const pvB = await visit(mf, { ip: '10.2.12.1', cf: lis, now: at(D, 11), page: { ref: 'blog.example.net' },
    snap: { eng: 40, scr: 40, rz: ['top', 'fato-topo'], sec: { top: 20, 'fato-topo': 20 }, ex: 'fato-topo' },
    events: [
      click(1, { sel: '#hero-spots', lab: 'Espaços', sec: 'top', x: 50, y: 600, ex: 50, ey: 50, pt: 't', ia: 0 }),
      click(2, { sel: '#hero-spots', lab: 'Espaços', sec: 'top', x: 50, y: 600, ex: 50, ey: 50, pt: 't', ia: 0 }),
      click(3, { sel: '#hero-spots', lab: 'Espaços', sec: 'top', x: 50, y: 600, ex: 50, ey: 50, pt: 't', ia: 0, rage: 1, dead: 1 }),
      ev(4, 'studio_seen', { item: 'helmet' }), ev(5, 'studio_wait', { item: 'helmet', s: 5 }), ev(6, '3d_fail', { item: 'helmet', why: 'load' }),
      ev(7, 'pkg_add', { spot: 'nuca', n: '2' }), ev(8, 'claim_open', { via: 'pkg', n: '2', step: 1 }), ev(9, 'claim_close', { step: 1, how: 'x' }),
      { i: 10, k: 'err', t: 'TypeError', m: 'x is undefined', f: 'main.js', l: 10, c: 5 },
    ] });
  await post(mf, { v: 1, q: 'patrocinio', a: 'nao', lang: 'pt', pv: pvB, vw: 'm', ex: 'fato-topo' }, { path: '/v1/f', ip: '10.2.12.1', now: at(D, 11, 5) });
  await post(mf, { v: 1, q: 'patrocinio_porque', a: 'precos', lang: 'pt', pv: pvB, vw: 'm', ex: 'fato-topo' }, { path: '/v1/f', ip: '10.2.12.1', now: at(D, 11, 6) });
  await post(mf, { v: 1, q: 'patrocinio', a: 'nao', lang: 'pt', pv: pvB, vw: 'm' }, { path: '/v1/f', ip: '10.2.12.1', now: at(D, 11, 7) });   // a repeat is ignored
  await post(mf, { v: 1, q: 'patrocinio', a: 'sim', lang: 'en' }, { path: '/v1/f', ip: '10.2.199.1', now: at(D, 11, 8) });               // standalone
  // C: sends by email, closes at step 2; an Instagram link in the contacts
  await visit(mf, { ip: '10.2.13.1', ua: UA.pixel, cf: lis, now: at(D, 12), page: { ref: 'blog.example.net' },
    snap: { eng: 30, rz: ['top', 'fato-termos', 'contacto'], ex: 'contacto' },
    events: [ev(1, 'claim_open', { via: 'pkg', n: '1', step: 1 }), ev(2, 'claim_send', { ch: 'email' }), ev(3, 'claim_close', { step: 2, how: 'x' }),
      click(4, { sel: '#contacto > ul.contact-list > li:nth-of-type(2) > a', lab: 'Instagram', sec: 'contacto', x: 20, y: 300, ex: 10, ey: 50, pt: 't', ia: 1, out: 'instagram.com' })] });
  // D: sends on Instagram and leaves; a sponsor's link on the suit
  await visit(mf, { ip: '10.2.14.1', ua: UA.pixel, cf: lis, now: at(D, 13), page: { ref: 'blog.example.net' },
    snap: { eng: 25, rz: ['top', 'o-fato'], ex: 'o-fato' },
    events: [ev(1, 'claim_open', { via: 'pkg', n: '1', step: 1 }), ev(2, 'claim_send', { ch: 'instagram' }),
      click(3, { sel: '#onsuit-list > li > a', lab: 'Marca', sec: 'o-fato', x: 40, y: 900, ex: 50, ey: 50, pt: 't', ia: 1, out: 'marca.pt', osp: 1 })] });
  // E, F: tablets in Porto
  await visit(mf, { ip: '10.2.21.1', ua: UA.ipad, cf: PLACE.porto, now: at(D, 14), page: TAB,
    snap: { eng: 50, rz: ['top', 'fato-termos'], ex: 'fato-termos' },
    events: [ev(1, 'claim_open', { via: 'title', n: 'title', step: 1 }), ev(2, 'claim_send', { ch: 'whatsapp' }), ev(3, 'pay_copy', { what: 'mb' })] });
  await visit(mf, { ip: '10.2.22.1', ua: UA.ipad, cf: PLACE.porto, now: at(D, 14, 30), page: { ...TAB, ref: 'example.org' },
    snap: { eng: 12, rz: ['top', 'fato-termos'], ex: 'fato-termos' }, events: [ev(1, 'claim_open', { via: 'pkg', n: '3+', step: 1 })] });
  // G, H: quick exits on wide screens (Leiria, Madrid)
  await visit(mf, { ip: '10.2.3.1', ua: UA.win, cf: PLACE.leiria, now: at(D, 15), page: WIDE, snap: { eng: 3, rz: ['top'], ex: 'top' } });
  await visit(mf, { ip: '10.2.4.1', ua: UA.win, cf: PLACE.madrid, now: at(D, 16), page: WIDE, snap: { eng: 5, rz: ['top'], ex: 'top' } });
  // I, J, K: Faro (no city from Cloudflare)
  await visit(mf, { ip: '10.2.51.1', ua: UA.win, cf: FARO, now: at(D, 17), page: WIDE, snap: { eng: 60, scr: 45, rz: ['top', 'tese', 'historia', 'prova', 'resultados'], ex: 'resultados' } });
  await visit(mf, { ip: '10.2.52.1', ua: UA.win, cf: FARO, now: at(D, 18), page: WIDE, snap: { eng: 9, rz: ['top', 'tese'], ex: 'tese' } });
  await visit(mf, { ip: '10.2.53.1', ua: UA.win, cf: FARO, now: at(D, 19), page: DESK, snap: { eng: 20, rz: ['top', 'media'], ex: 'media' },
    events: [click(1, { sel: '#media > div.media-grid > figure:nth-of-type(1)', lab: 'Foto', sec: 'media', x: 30, y: 200, ex: 40, ey: 40, pt: 'm', ia: 0, dead: 1 }),
      { i: 2, k: 'err', t: 'TypeError', m: 'x is undefined', f: 'main.js', l: 10, c: 5 }] });
  // L: A's visitor reloads (a page view, not a visit, not a new visitor)
  await visit(mf, { ip: '10.2.1.1', cf: lis, now: at(D, 20), page: { nav: 'reload' }, snap: { eng: 2, rz: ['top'], ex: 'top' } });
  // M: the owner (internal)
  await visit(mf, { ip: '10.2.9.9', cf: lis, now: at(D, 21), page: { int: 1 }, snap: { eng: 100, rz: ['top', 'tese'], ex: 'tese' } });
});
after(async () => { await mf.dispose(); });

test('derived totals, funnel and end states', async () => {
  const o = await get(`overview?${range()}`);
  assert.equal(o.pv, 12);
  assert.equal(o.kpi.pv.v, 12);
  assert.equal(o.kpi.visits.v, 11);
  assert.equal(o.kpi.uv.v, 11);
  assert.equal(o.kpi.quick.v, 0.25);
  assert.deepEqual(o.funnel.map((s) => s.n), [6, 1, 2, 6, 4, 2, 1]);
  assert.equal(o.kpi.yes.v, r4(2 / 3), 'A and the standalone answer say yes, B says no');
  const withInt = await get(`overview?${range()}&int=1`);
  assert.equal(withInt.kpi.pv.v, 13);
  const b = await get(`booking?${range()}&dev=mobile`);
  assert.deepEqual(b.ignored, ['dev']);
  assert.deepEqual(Object.fromEntries(b.ends.map((e) => [e.k, e.n])), { feito: 1, copiou_saiu: 1, fechou_passo2: 1, saiu_passo2: 1, fechou_passo1: 1, aberta_saiu: 1 });
  assert.deepEqual(b.channels.rows.map((r) => [r.k, r.n]), [['whatsapp', 2], ['email', 1], ['instagram', 1]]);
  assert.deepEqual(b.packages.sizes, [{ k: '1', n: 3 }, { k: '2', n: 1 }, { k: '3+', n: 1 }, { k: 'title', n: 1 }]);
  assert.equal(b.title.opened, 1);
  assert.equal(b.title.sent, 1);
  const c = await get(`content?${range()}`);
  const z = Object.fromEntries(c.zones.map((x) => [x.z, x]));
  assert.equal(z.top.reached, 12);
  assert.equal(z['fato-termos'].reached, 3);
  assert.equal(z.contacto.exits, 1);
  assert.equal(z.contacto.exitsLink, 1, 'C left through the Instagram link');
  assert.equal(z['o-fato'].exitsLink, 2, 'A left after sending on WhatsApp, D through the sponsor link (their last actions)');
  assert.equal(c.reserva.sec, 20);
  assert.deepEqual(c.routes.find((r) => r.k === 'hero'), { k: 'hero', n: 1 });
  const ctas = Object.fromEntries(c.ctas.map((x) => [x.id, x]));
  assert.deepEqual([ctas['hero-sponsor'].seen, ctas['hero-sponsor'].clicked], [1, 1]);
  assert.deepEqual([ctas['pkg-go'].seen, ctas['pkg-go'].clicked], [0, 1]);
  const k = await get(`contacts?${range()}`);
  assert.deepEqual(k.out.rows.map((r) => r.k).sort(), ['instagram', 'patrocinador']);
  assert.deepEqual(k.sponsors, [{ host: 'marca.pt', views: 0, clicks: 1 }]);
  const q = await get(`quality?${range()}`);
  assert.equal(q.errors.length, 1);
  assert.deepEqual([q.errors[0].t, q.errors[0].m, q.errors[0].f, q.errors[0].l, q.errors[0].c, q.errors[0].n, q.errors[0].u], ['TypeError', 'x is undefined', 'main.js', 10, 5, 2, 2]);
  assert.equal(q.errors[0].first, D);
  assert.equal(q.vitals.lcp.n, 1); assert.equal(q.vitals.lcp.ni, 1);
  assert.equal(q.threeD.failRate.helmet, 1);
  const f = await get(`feedback?${range()}`);
  assert.deepEqual([f.sim, f.nao, f.standalone, f.answered], [2, 1, 1, 3]);
  assert.deepEqual(f.reasons.rows.map((r) => [r.k, r.n]), [['precos', 1]]);
  const s = await get(`studio?${range()}`);
  assert.equal(s.items.suit.ready, 1);
  assert.equal(s.items.helmet.leftBeforeReady, 1);
  assert.deepEqual(s.tour, { started: 1, fim: 1, parado: 0, choice: 1 });
  assert.deepEqual([s.taps.taps, s.taps.missed], [2, 1]);
});
const r4 = (v) => Math.round(v * 1e4) / 1e4;

test('k-folding: places below 3 visitor-days and small referrer hosts are folded', async () => {
  const a = await get(`audience?${range()}&dev=desktop`);
  // geography ignores the device filter (D9)
  assert.deepEqual(a.geo.ignored, ['dev']);
  assert.deepEqual(a.geo.cities.map((c) => [c.cc, c.city, c.u, c.lat, c.lon]), [['PT', 'Lisbon', 4, 38.7, -9.1]]);
  assert.deepEqual(a.geo.regions.map((r) => [r.cc, r.reg, r.u]), [['PT', 'Faro', 3]]);
  assert.deepEqual(a.geo.otherPlaces.map((r) => [r.cc, r.u]).sort(), [['ES', 1], ['PT', 3]]);
  assert.deepEqual(a.geo.cc.rows.map((r) => [r.k, r.u]), [['PT', 10], ['ES', 1]]);
  const all = await get(`audience?${range()}`);
  assert.deepEqual(all.ref.rows.map((r) => [r.k, r.u, r.g]), [['blog.example.net', 3, 'outros'], ['google.com', 1, 'pesquisa']]);
  assert.deepEqual([all.ref.other.k, all.ref.other.u], ['outros sites', 1]);
  assert.deepEqual(all.dev.rows.map((r) => [r.k, r.n, r.u]), [['desktop', 5, 5], ['mobile', 5, 4], ['tablet', 2, 2]]);
  assert.deepEqual(a.dev.rows.map((r) => r.k), ['desktop']);
  assert.deepEqual(all.os.rows.map((r) => r.k).sort(), ['Android 14', 'Windows', 'iOS 17', 'iOS 18']);
});

test('heatmap: nothing below 5 page views in the bucket', async () => {
  const w = await get(`heatmap?${range()}&vw=w`);
  assert.equal(w.pvBucket, 4);
  assert.equal(w.enough, false);
  for (const k of ['elements', 'cells', 'zcells', 'scroll', 'attention', 'fixed']) assert.deepEqual(w[k], [], k);
  assert.deepEqual(w.flagged, { dead: [], rage: [], err: [] });
  assert.equal(w.vh, null);
  const m = await get(`heatmap?${range()}&vw=m`);
  assert.equal(m.pvBucket, 5);
  assert.equal(m.enough, true);
  assert.equal(m.vh, 800);
  const hs = m.elements.find((e) => e.sel === '#hero-spots');
  assert.deepEqual([hs.n, hs.u, hs.dead, hs.rage, hs.ia, hs.sec], [3, 1, 1, 1, 0, 'top']);
  assert.deepEqual(m.flagged.rage.map((r) => [r.k, r.n]), [['#hero-spots', 1]]);
  assert.ok(m.fixed.some((f) => f.layer === 'pacote' && f.sel === '#pk-go'));
  const cell = m.cells.find((c) => c.b === '#hero-spots');
  assert.deepEqual(cell.c, [[10, 10, 3, 1, 1]]);
  const zc = m.zcells.find((c) => c.b === '#hero-spots');
  assert.deepEqual([zc.z, zc.c], ['top', [[50, 600, 3, 1, 1]]]);
  assert.equal(m.scroll.length, 21);
  assert.equal(m.attention.length, ZONES.length, 'one row per page zone, the showcase included');
  const all = await get(`heatmap?${range()}&vw=all`);
  assert.equal(all.enough, true);
  assert.deepEqual(all.cells, []);
  assert.deepEqual(all.zcells, []);
  assert.ok(all.elements.some((e) => e.sel === '#media > div.media-grid > figure:nth-of-type(1)' && e.dead === 1));
});

test('24 h: Lisbon hours from yesterday (hour + 1) to now, totals and an hour histogram only', async () => {
  const E = addDays(TODAY, -12), Y = addDays(E, -1);
  for (const [day, hh] of [[addDays(Y, -1), 10], [Y, 14], [Y, 15], [E, 9], [E, 14]]) {
    await visit(mf, { ip: `10.3.${hh}.1`, now: at(day, hh, 10), page: { ref: 'l.instagram.com' }, snap: { eng: 20, rz: ['top'] }, events: funnelA });
  }
  const now = at(E, 14, 30);
  const o = await get('overview?p=24h', now);
  assert.equal(o.range.unit, 'hour');
  assert.equal(o.range.from, Y);
  assert.equal(o.kpi.pv.v, 3);
  assert.equal(o.kpi.pv.prev, 1);
  assert.equal(o.series.x.length, 24);
  assert.equal(o.series.x[0], '15');
  assert.equal(o.series.x[23], '14');
  assert.equal(o.series.s.pv.reduce((a, b) => a + b, 0), 3);
  assert.equal(o.kpi.pv.spark.length, 30);
  // two reads minutes apart must not tie an arrival to its source, its country or a step of the funnel (privacy 2.7)
  assert.equal(o.live, true);
  assert.deepEqual([o.chan.rows, o.cc.rows, o.funnel, o.reach], [[], [], [], []]);
  assert.deepEqual([o.kpi.sends.v, o.kpi.offer.v, o.kpi.sends.spark], [null, null, []]);
  assert.equal(o.d8.find((x) => x.id === 'brand').v, null);
  // the same for a custom period that ends today; a period of whole days keeps them
  const c = await get(`overview?p=custom&from=${Y}&to=${E}`, now);
  assert.deepEqual([c.live, c.chan.rows, c.funnel], [true, [], []]);
  const w = await get(`overview?p=custom&from=${Y}&to=${Y}`, now);
  assert.equal(w.live, false);
  assert.ok(w.chan.rows.length && w.funnel.length);
  // the other tabs take whole days only
  for (const q of ['booking?p=24h', 'audience?p=24h', `contacts?p=custom&from=${Y}&to=${E}`, `heatmap?p=custom&from=${E}&to=${E}&vw=m`]) {
    const r = await api(mf, q, { now });
    assert.equal(r.status, 400, q); assert.deepEqual(r.json, { error: 'periodo' });
  }
});

test('no comparison with days before the counter started', async () => {
  // a fresh store: the first data is on F, so a period whose previous window starts before F has none
  const m2 = await start();
  const F = addDays(TODAY, -9);
  for (let i = 0; i < 9; i++) await visit(m2, { ip: `10.4.${i}.1`, now: at(addDays(F, i), 12) });
  const now = at(TODAY, 15);
  const a = (await api(m2, `overview?p=custom&from=${addDays(F, 2)}&to=${addDays(F, 4)}`, { now })).json;
  assert.equal(a.prev, null);
  assert.equal(a.prevCut, true);
  assert.equal(a.kpi.pv.prev, null);
  const b = (await api(m2, `overview?p=custom&from=${addDays(F, 3)}&to=${addDays(F, 5)}`, { now })).json;
  assert.deepEqual(b.prev, { from: F, to: addDays(F, 2) });
  assert.equal(b.prevCut, false);
  assert.equal(b.kpi.pv.prev, 3);
  assert.equal((await api(m2, 'overview?p=7d', { now })).json.prevCut, true);
  await m2.dispose();
});

test('a tab looked at again days later updates its page view instead of counting a new one', async () => {
  const m2 = await start();
  const A = addDays(TODAY, -6), B = addDays(TODAY, -4);
  const pg = page({ vw: 'd', pc: 0 });
  assert.equal((await post(m2, pg, { now: at(A, 10) })).status, 204);
  assert.equal((await post(m2, { ...pg, f: 2, t: 'h', vis: 0, eng: 300 }, { now: at(A, 10, 5) })).status, 204);
  await api(m2, 'dev/rollup', { method: 'POST', body: { day: A }, now: at(A, 23) });
  assert.equal((await post(m2, { ...pg, f: 3, t: 'h', vis: 0, eng: 330 }, { now: at(B, 9) })).status, 204);
  const o = (await api(m2, `overview?p=custom&from=${A}&to=${B}`, { now: at(TODAY, 12) })).json;
  assert.deepEqual([o.kpi.pv.v, o.kpi.visits.v, o.kpi.uv.v], [1, 1, 1]);
  assert.equal(o.kpi.engMean.v, 330);
  assert.equal(o.series.s.pv[0], 1);
  const d = await dump(m2);
  assert.ok(d.flags[`late:${A}`], 'the rolled-up day is rolled again tonight');
  await m2.dispose();
});

test('answers for whole past days are kept until the next rollup, a late write or a note', async () => {
  const m2 = await start();
  const A = addDays(TODAY, -3);
  for (let i = 0; i < 3; i++) await visit(m2, { ip: `10.6.${i}.1`, now: at(A, 10 + i) });
  // the nightly run: every day of the raw window rolled up (or marked empty)
  for (let i = 0; i < 40; i++) {
    await api(m2, 'dev/alarm', { method: 'POST', body: {} });
    const d = await dump(m2);
    if (!d.flags.cursor && d.flags[`rolled:${A}`]) break;
  }
  const q = `audience?p=custom&from=${A}&to=${A}`;
  const a = (await api(m2, q, { now: at(TODAY, 12) })).json;
  assert.equal(a.pv, 3);
  assert.equal((await dump(m2)).tables.ans, 1);
  // another hour of the same day: the same answer, from `ans`
  const b = (await api(m2, q, { now: at(TODAY, 13) })).json;
  assert.equal(b.generated, a.generated);
  // a late write to that day drops it
  const pg = page();
  await post(m2, pg, { now: at(A, 23, 50) });
  await post(m2, { ...pg, f: 2, t: 'h', vis: 0 }, { now: at(addDays(A, 1), 0, 5) });
  assert.equal((await dump(m2)).tables.ans, 0);
  const c = (await api(m2, q, { now: at(TODAY, 14) })).json;
  assert.equal(c.pv, 4);
  assert.equal((await dump(m2)).tables.ans, 0, 'a late day is never kept');
  // the quota panel counts rows read as well
  const s = (await api(m2, 'system?p=7d', { now: at(TODAY, 14) })).json;
  assert.ok(s.quota.rr[s.quota.rr.length - 1] > 0);
  assert.equal(s.quota.limits.rr, 5000000);
  await m2.dispose();
});

test('rollup equals live, on every endpoint and filter', async () => {
  const qs = [];
  for (const e of ['overview', 'audience', 'content', 'studio', 'booking', 'contacts', 'quality', 'feedback']) {
    for (const f of ['', '&dev=mobile', '&dev=desktop&int=1', '&cmp=0']) qs.push(`${e}?${range()}${f}`);
  }
  for (const vw of ['m', 't', 'd', 'w', 'all']) qs.push(`heatmap?${range()}&vw=${vw}`, `heatmap?${range()}&vw=${vw}&int=1`);
  qs.push(`overview?p=custom&from=${addDays(D, -3)}&to=${D}`, 'overview?p=7d', 'audience?p=30d');
  const live = [];
  for (const q of qs) live.push(strip(await get(`${q}&src=raw`)));
  const r = await api(mf, 'dev/rollup', { method: 'POST', body: { day: D }, now: NOW });
  assert.equal(r.status, 200);
  assert.ok(r.json.chunks >= 2, 'the test chunk size (7) needs several chunks');
  const d1 = await dump(mf);
  assert.equal(d1.flags[`rolled:${D}`], '1');
  for (let i = 0; i < qs.length; i++) assert.deepEqual(strip(await get(`${qs[i]}&src=agg`)), live[i], qs[i]);
  // idempotent: a second run gives the same rows (counted for D only: the alarm may roll up other days meanwhile)
  const aggOfD = async () => (await api(mf, `dev/dump?day=${D}`)).json.aggDay;
  const before = await aggOfD();
  assert.ok(before > 0);
  await api(mf, 'dev/rollup', { method: 'POST', body: { day: D }, now: NOW });
  assert.equal(await aggOfD(), before);
  for (let i = 0; i < 4; i++) assert.deepEqual(strip(await get(`${qs[i]}&src=agg`)), live[i], qs[i]);
});

test('a late flush after the rollup marks the day, is read live, and is rolled again', async () => {
  await api(mf, 'dev/rollup', { method: 'POST', body: { day: D }, now: NOW });
  const next = addDays(D, 1);
  const r = await post(mf, { v: 1, pv: pvA, f: 3, t: 'h', vis: 0, path: '/', lang: 'pt', bl: 'pt', ref: 'google.com', vw: 'm', vh: 800, nav: 'navigate', pc: 1, eng: 260,
    e: [ev(30, 'give_copy', { what: 'iban' })] }, { ip: '10.2.1.1', now: at(next, 0, 10) });
  assert.equal(r.status, 204);
  assert.ok((await dump(mf)).flags[`late:${D}`]);
  const c = await get(`contacts?${range()}`);
  assert.equal(c.give.iban, 1, 'read live while the day is late');
  await api(mf, 'dev/rollup', { method: 'POST', body: { day: D }, now: NOW });
  assert.equal((await dump(mf)).flags[`late:${D}`], undefined);
  assert.equal((await get(`contacts?${range()}&src=agg`)).give.iban, 1);
  assert.equal((await get(`overview?${range()}`)).kpi.engMean.v, (await get(`overview?${range()}&src=raw`)).kpi.engMean.v);
});

test('the alarm rolls up yesterday in chunks, then archives and prunes', async () => {
  const Y = addDays(TODAY, -1);
  for (let i = 0; i < 9; i++) await visit(mf, { ip: `10.4.${i}.1`, ua: i % 2 ? UA.win : UA.iphone, page: i % 2 ? DESK : {}, now: at(Y, 9 + i), snap: { eng: 10 + i, rz: ['top', 'tese'] }, events: [ev(1, 'menu_open')] });
  const live = strip(await get(`overview?${range(Y)}&src=raw`));
  let runs = 0;
  for (; runs < 40; runs++) {
    await api(mf, 'dev/alarm', { method: 'POST', body: {} });
    const s = await get('system?p=7d');
    if (!s.rollup.pending.length) break;
  }
  assert.ok(runs >= 1 && runs < 40, `alarm runs: ${runs}`);
  const d = await dump(mf);
  assert.equal(d.flags[`rolled:${Y}`], '1');
  assert.equal(d.flags.cursor, undefined);
  assert.deepEqual(strip(await get(`overview?${range(Y)}&src=agg`)), live);
  assert.ok(Number(d.flags.dbsize) > 0);
  assert.ok(d.tables.sys > 0, 'the alarm wrote the waiting counts');
  assert.equal(d.flags.lastrun, TODAY);
});

test('CSV: BOM, «;», decimal comma, pt-PT header, file name, folded rows', async () => {
  const r = await api(mf, `export.csv?t=dias&${range()}`, { now: NOW });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
  assert.equal(r.headers.get('content-disposition'), `attachment; filename="gocarmo-dias-${D}-${D}.csv"`);
  const bytes = new Uint8Array(await (await mf.dispatchFetch(`http://api.test/admin/v1/export.csv?t=dias&${range()}`, { headers: { Authorization: `Bearer ${KEY}`, 'X-Dev-Now': NOW } })).arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], 'a UTF-8 BOM for Excel');
  const lines = r.text.trim().split('\r\n');
  assert.equal(lines[0], 'dia;visualizações;visitas;visitantes;com envolvimento;saídas rápidas;chegaram ao patrocínio;pedidos enviados');
  assert.equal(lines[1].split(';')[0], D);
  assert.equal(lines[1].split(';')[1], '12');
  const z = await api(mf, `export.csv?t=zonas&${range()}`, { now: NOW });
  assert.match(z.text, /;0,\d+;/);
  const s = await api(mf, `export.csv?t=sites&${range()}`, { now: NOW });
  assert.match(s.text, /outros sites;outros;1;1;1/);
  assert.doesNotMatch(s.text, /example\.org/);
  const l = await api(mf, `export.csv?t=localidades&${range()}`, { now: NOW });
  assert.doesNotMatch(l.text, /Leiria|Porto|Madrid/);
  for (const t of ['paginas', 'origens', 'paises', 'aparelhos', 'sistemas', 'navegadores', 'linguas', 'cliques', 'botoes', 'eventos', 'funil', 'erros', 'opiniao', 'meses']) {
    const x = await api(mf, `export.csv?t=${t}&${range()}`, { now: NOW });
    assert.equal(x.status, 200, t);
    assert.match(x.headers.get('content-disposition'), new RegExp(`gocarmo-${t}-`), t);
  }
  // whole days only: «24 h» and a period up to today are refused
  for (const q of ['t=dias&p=24h', `t=paises&p=custom&from=${D}&to=${TODAY}`]) {
    const h = await api(mf, `export.csv?${q}`, { now: NOW });
    assert.equal(h.status, 400, q); assert.deepEqual(h.json, { error: 'periodo' });
  }
});

test('notes: add (scrubbed), list, delete, refuse bad ones', async () => {
  const a = await api(mf, 'notes', { method: 'POST', body: { day: D, label: 'Post no Instagram de joao@mail.pt com um nome muito comprido demais', kind: 'post' }, now: NOW });
  assert.equal(a.status, 200);
  assert.ok(a.json.note.label.startsWith('Post no Instagram de [email] com um'));
  assert.equal(Array.from(a.json.note.label).length, 40);
  const o = await get(`overview?${range()}`);
  assert.deepEqual(o.notes.map((n) => n.id), [a.json.note.id]);
  for (const body of [{ day: D, label: '', kind: 'post' }, { day: D, label: 'x', kind: 'tv' }, { day: addDays(TODAY, 1), label: 'x', kind: 'site' }, { day: 'ontem', label: 'x', kind: 'site' }]) {
    assert.equal((await api(mf, 'notes', { method: 'POST', body, now: NOW })).status, 400, JSON.stringify(body));
  }
  assert.equal((await api(mf, `notes/${a.json.note.id}`, { method: 'DELETE', now: NOW })).status, 200);
  assert.equal((await api(mf, `notes/${a.json.note.id}`, { method: 'DELETE', now: NOW })).status, 404);
  assert.deepEqual((await get(`overview?${range()}`)).notes, []);
});

test('monthly archive keeps no places below the region; pruning keeps 30 days of raw rows', async () => {
  const ns = await mf.getDurableObjectNamespace('STORE');
  const stub = ns.get(ns.idFromName('global'));
  const month = D.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);    // the 1st of the next month
  const last = addDays(first, -1);
  await stub.setMeta(`rolled:${last}`, '1');
  await stub.archive({ day: first, yday: last });
  const csv = await api(mf, `export.csv?t=meses&${range()}`, { now: NOW });
  const row = csv.text.trim().split('\r\n').find((l) => l.startsWith(month));
  assert.ok(row, csv.text);
  assert.ok(Number(row.split(';')[1]) >= 12);
  // the archive keeps countries and regions, never cities, map points, referrer hosts, selectors or messages
  const d = await dump(mf, ['38.7', '-9.1', 'blog.example.net', '#hero-spots', 'x is undefined', 'marca.pt']);
  const inAggm = (needle) => d.grep[needle].filter((c) => c.startsWith('aggm.'));
  for (const n of Object.keys(d.grep)) assert.deepEqual(inAggm(n), [], n);
  const before = d.tables.pv;
  await stub.prune({ day: addDays(D, 31), yday: addDays(D, 30) });
  const after0 = await dump(mf);
  assert.ok(after0.tables.pv < before);
  // the day is still there, from its aggregates
  const o = await get(`overview?${range()}`, at(addDays(D, 31), 12));
  assert.equal(o.kpi.pv.v, 12);
});
