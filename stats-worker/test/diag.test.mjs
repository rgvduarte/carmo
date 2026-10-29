// «Diagnóstico» (the «Dados» tab) and the «today so far» line: the Lisbon-day counters (l.req, l.ok, l.rej.*,
// l.drop.*) and GET /admin/v1/diag. Every day here is at least a year ahead of the real clock: the nightly alarm runs
// on the real clock, so it never rolls up, prunes or archives these days while a test reads them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, post, api, page, visit, dump, UA, PLACE, SITE, lisbonISO, addDays } from './helpers.mjs';
import { clock, utcDay } from '../src/time.js';

const Y = new Date().getUTCFullYear() + 2;
const T = `${Y}-11-20`;                   // «today» of the main instance (winter time)
const at = (day, hh = 12, mm = 0) => lisbonISO(day, hh, mm);
const NOW = at(T, 14, 32);
const range = (from, to) => `p=custom&from=${from}&to=${to}`;
let ipN = 0;
const ip = () => { ipN++; return `10.${100 + (ipN >> 8)}.${ipN & 255}.1`; };     // a new /24 each time (the 30 a minute limit)
const diag = async (m, q = '', now = NOW) => {
  const r = await api(m, `diag${q ? `?${q}` : ''}`, { now });
  assert.equal(r.status, 200, r.text);
  return r.json;
};
const dayOf = (d, day) => d.days.find((x) => x.day === day);

let mf;
after(async () => { await mf?.dispose(); });

test('the Lisbon day, not the UTC day, in summer and in winter time', async () => {
  // pure: the instants a minute either side of Lisbon midnight
  const S = `${Y}-07-15`, W = `${Y}-01-15`;
  for (const [day, utcOff] of [[S, 1], [W, 0]]) {
    const before0 = Date.parse(at(day, 23, 50)), after0 = Date.parse(at(addDays(day, 1), 0, 10));
    assert.equal(clock(before0).day, day);
    assert.equal(clock(after0).day, addDays(day, 1));
    // summer: 00:10 in Lisbon is still the previous UTC day; winter: both clocks agree
    assert.equal(utcDay(after0), utcOff ? day : addDays(day, 1));
  }
  const m = await start();
  try {
    const sysReq = async () => { const q = (await api(m, 'system?p=7d')).json.quota; return q.req[q.req.length - 1]; };
    const r0 = await sysReq();
    for (const day of [W, S]) {
      assert.equal((await post(m, page(), { ip: ip(), now: at(day, 23, 50) })).status, 204);
      assert.equal((await post(m, page(), { ip: ip(), now: at(addDays(day, 1), 0, 10) })).status, 204);
      const d = await diag(m, 'p=7d', at(addDays(day, 1), 12));
      for (const x of [day, addDays(day, 1)]) {
        const one = dayOf(d, x);
        assert.equal(one.counted, true, x);
        assert.equal(one.req, 1, x); assert.equal(one.ok, 1, x);
        assert.deepEqual(one.visits, { ext: 1, int: 0 }, x);
      }
    }
    // the UTC counters of the quota panel stay on the real UTC day (Cloudflare's quota day): 4 beacons, 2 diag, 1 system
    assert.equal((await sysReq()) - r0, 4 + 2 + 1);
  } finally { await m.dispose(); }
});

// the main instance: counters from T - 5, refusals and stores on T - 4, visits on T - 2 (rolled up, then a late
// write), today
const pvLate = page({ ref: 'google.com' });
before(async () => {
  mf = await start();
  assert.equal((await post(mf, page(), { ip: ip(), now: at(addDays(T, -5), 9) })).status, 204);
  const D4 = at(addDays(T, -4), 10);
  // refusals: origem, tamanho, json, versao, esquema, robo
  assert.equal((await post(mf, page(), { origin: 'https://evil.example', now: D4 })).status, 403);
  assert.equal((await post(mf, JSON.stringify({ ...page(), pad: 'x'.repeat(17 * 1024) }), { ip: ip(), now: D4 })).status, 413);
  assert.equal((await post(mf, '{"v":1,', { ip: ip(), now: D4 })).status, 400);
  assert.equal((await post(mf, page({ v: 2 }), { ip: ip(), now: D4 })).status, 400);
  assert.equal((await post(mf, page({ vw: 'x' }), { ip: ip(), now: D4 })).status, 400);
  assert.equal((await post(mf, page(), { ua: UA.bot, ip: ip(), now: D4 })).status, 204);
  // GPC and DNT: nothing at all
  for (const h of [{ 'Sec-GPC': '1' }, { DNT: '1' }]) {
    assert.equal((await post(mf, page(), { headers: h, ip: ip(), now: D4 })).status, 204);
    assert.equal((await post(mf, page(), { headers: h, origin: 'https://evil.example', now: D4 })).status, 403);
  }
  // stored: a new page view, an update of it, a feedback answer
  const pg = page();
  const a = ip();
  assert.equal((await post(mf, pg, { ip: a, now: D4 })).status, 204);
  assert.equal((await post(mf, { ...pg, f: 2, t: 'h', vis: 0, eng: 30 }, { ip: a, now: D4 })).status, 204);
  assert.equal((await post(mf, { v: 1, q: 'patrocinio', a: 'sim', lang: 'pt' }, { path: '/v1/f', ip: ip(), now: D4 })).status, 204);
  // T - 2: two outside visits, one of mine, a reload and a page opened from another page of the site (not visits)
  const D2 = addDays(T, -2);
  await visit(mf, { ip: ip(), now: at(D2, 10), page: pvLate });
  await visit(mf, { ip: ip(), ua: UA.win, now: at(D2, 11), page: { vw: 'd', pc: 0 } });
  await visit(mf, { ip: ip(), now: at(D2, 12), page: { int: 1 } });
  await visit(mf, { ip: ip(), now: at(D2, 13), page: { nav: 'reload' } });
  await visit(mf, { ip: ip(), now: at(D2, 14), page: { ref: 'interno' } });
  // today: two outside, one of mine
  await visit(mf, { ip: ip(), now: at(T, 9) });
  await visit(mf, { ip: ip(), now: at(T, 10), hide: false });
  await visit(mf, { ip: ip(), now: at(T, 11), page: { int: 1 } });
});

test('days before the counters: «sem contagem» as null, never 0; a quiet counted day is 0', async () => {
  const d = await diag(mf, 'p=7d');
  assert.equal(d.today, T);
  assert.equal(d.since, addDays(T, -5));
  assert.equal(d.days.length, 14);
  assert.deepEqual(d.days.map((x) => x.day), Array.from({ length: 14 }, (_, i) => addDays(T, i - 13)));
  for (const x of d.days.filter((y) => y.day < d.since)) {
    assert.equal(x.counted, false, x.day);
    for (const k of ['req', 'ok', 'rej', 'drop']) assert.equal(x[k], null, `${x.day} ${k}`);
    assert.deepEqual(x.pv, { ext: 0, int: 0 });
  }
  const quiet = dayOf(d, addDays(T, -3));
  assert.equal(quiet.counted, true);
  assert.equal(quiet.req, 0); assert.equal(quiet.ok, 0);
  assert.deepEqual(quiet.drop, { teto: 0, cheio: 0 });
  assert.equal(dayOf(d, addDays(T, -5)).req, 1);
});

test('received, stored and refused by reason, on the day of the beacon', async () => {
  const x = dayOf(await diag(mf, 'p=7d'), addDays(T, -4));
  // 6 refused + 1 robot + page view + its update + feedback; GPC / DNT are not there
  assert.equal(x.req, 9);
  assert.equal(x.ok, 3, 'a new page view, an update of it, a feedback answer');
  assert.deepEqual(x.rej, { origem: 1, tamanho: 1, json: 1, versao: 1, esquema: 1, limite: 0, robo: 1, cheio: 0 });
  assert.deepEqual(x.drop, { teto: 0, cheio: 0 });
  assert.deepEqual(x.pv, { ext: 1, int: 0 });
});

test('visits per day, outside and mine, and the rollup state through a rollup and a late write', async () => {
  const D2 = addDays(T, -2);
  let d = await diag(mf, 'p=7d');
  let x = dayOf(d, D2);
  assert.deepEqual(x.pv, { ext: 4, int: 1 });
  assert.deepEqual(x.visits, { ext: 2, int: 1 }, 'a reload and a page opened from the site are not visits');
  assert.equal(x.state, 'por-fazer');
  assert.equal(dayOf(d, addDays(T, -3)).state, 'feito', 'nothing recorded: nothing to roll up');
  assert.equal(dayOf(d, T).state, 'hoje');
  assert.equal((await api(mf, 'dev/rollup', { method: 'POST', body: { day: D2 }, now: at(addDays(D2, 1), 0, 25) })).status, 200);
  assert.equal(dayOf(await diag(mf, 'p=7d'), D2).state, 'feito');
  // the tab of T - 2 sends again after midnight: the day is marked late, rolled again tonight
  assert.equal((await post(mf, { ...pvLate, f: 3, t: 'h', vis: 0, eng: 90 }, { ip: ip(), now: at(addDays(D2, 1), 0, 40) })).status, 204);
  d = await diag(mf, 'p=7d');
  assert.equal(dayOf(d, D2).state, 'refazer');
  assert.equal(dayOf(d, addDays(D2, 1)).ok, 1, 'counted on the day it arrived');
  assert.deepEqual(dayOf(d, D2).visits, { ext: 2, int: 1 }, 'an update is not a new visit');
  assert.equal((await api(mf, 'dev/rollup', { method: 'POST', body: { day: D2 }, now: at(T, 0, 25) })).status, 200);
  assert.equal(dayOf(await diag(mf, 'p=7d'), D2).state, 'feito');
});

test('today so far, split, the same numbers as «Agora no site»', async () => {
  const d = await diag(mf, 'p=7d');
  assert.equal(d.at, '14:32');
  assert.equal(d.rollupAt, '00:20');
  assert.deepEqual(d.now.visits, { ext: 2, int: 1 });
  assert.deepEqual(d.now.pv, { ext: 2, int: 1 });
  const n0 = (await api(mf, 'now?int=0', { now: NOW })).json.today, n1 = (await api(mf, 'now?int=1', { now: NOW })).json.today;
  assert.equal(d.now.visits.ext, n0.visits);
  assert.equal(d.now.visits.ext + d.now.visits.int, n1.visits);
  assert.equal(d.now.pv.ext + d.now.pv.int, n1.pv);
  assert.equal(d.now.uv.ext, n0.uv);
  assert.deepEqual(dayOf(d, T).visits, d.now.visits);
  // the device filter of the panels: no desktop today
  assert.deepEqual((await diag(mf, 'p=7d&dev=desktop')).now.visits, { ext: 0, int: 0 });
});

test('the period: whole past days, hidden internal visits equal overview with int=0 and int=1', async () => {
  const qs = [range(addDays(T, -6), addDays(T, -1)), 'p=7d', 'p=30d', range(addDays(T, -3), addDays(T, -2)),
    `${range(addDays(T, -6), addDays(T, -1))}&dev=mobile`, `${range(addDays(T, -6), addDays(T, -1))}&dev=desktop`];
  for (const q of qs) {
    const p = (await diag(mf, q)).period;
    const o0 = (await api(mf, `overview?${q}&int=0`, { now: NOW })).json, o1 = (await api(mf, `overview?${q}&int=1`, { now: NOW })).json;
    assert.equal(p.from, o0.range.from, q); assert.equal(p.to, o0.range.to, q);
    assert.equal(p.visits.ext, o0.kpi.visits.v, q);
    assert.equal(p.visits.ext + p.visits.int, o1.kpi.visits.v, q);
    assert.equal(p.pv.ext, o0.kpi.pv.v, q);
    assert.equal(p.pv.ext + p.pv.int, o1.kpi.pv.v, q);
  }
  const p = (await diag(mf, range(addDays(T, -6), addDays(T, -1)))).period;
  assert.deepEqual(p.visits, { ext: 4, int: 1 }, 'T - 5, T - 4 and two on T - 2; mine on T - 2');
  // the asked int does not change the split
  assert.deepEqual((await diag(mf, `${range(addDays(T, -6), addDays(T, -1))}&int=1`)).period, p);
  // a period up to today stops at yesterday; «24 h» and today alone have no period block
  const up = (await diag(mf, range(addDays(T, -6), T))).period;
  assert.equal(up.to, addDays(T, -1));
  assert.deepEqual(up.visits, p.visits);
  assert.equal((await diag(mf, 'p=24h')).period, null);
  assert.equal((await diag(mf, range(T, T))).period, null);
});

test('drops: the per-address cap (teto), the day\'s row budget (cheio), and the burst limit', async () => {
  const m = await start({ ADDR_PVS: '2' });
  try {
    const day = addDays(T, -1), now = at(day, 10);
    // one /24, 31 beacons in a minute: 30 pass the limit, 2 are stored, 28 dropped by the cap, 1 refused
    for (let i = 0; i < 31; i++) await post(m, page(), { ip: `10.77.77.${i + 1}`, now });
    const x = dayOf(await diag(m, 'p=7d'), day);
    assert.equal(x.req, 31);
    assert.equal(x.ok, 2);
    assert.deepEqual(x.drop, { teto: 28, cheio: 0 });
    assert.equal(x.rej.limite, 1);
  } finally { await m.dispose(); }
  const m2 = await start({ DAY_ROWS: '12' });
  try {
    const day = addDays(T, -1), now = at(day, 10);
    for (let i = 0; i < 12; i++) await post(m2, page(), { ip: `10.88.${i}.1`, now });
    const x = dayOf(await diag(m2, 'p=7d'), day);
    assert.equal(x.req, 12);
    assert.ok(x.drop.cheio >= 1, JSON.stringify(x));
    assert.ok(x.rej.cheio >= 1, 'then the Worker stops calling the store (refused as «cheio»)');
    assert.equal(x.ok + x.drop.cheio + x.rej.cheio, 12);
    assert.equal((await dump(m2)).tables.pv, x.ok);
  } finally { await m2.dispose(); }
});

test('shape: day totals only, nothing by place, source, device or hour', async () => {
  const d = await diag(mf, 'p=7d');
  assert.deepEqual(Object.keys(d).sort(), ['at', 'days', 'dev', 'now', 'ok', 'period', 'rollupAt', 'since', 'today', 'v']);
  for (const x of d.days) {
    assert.deepEqual(Object.keys(x).sort(), ['counted', 'day', 'drop', 'ok', 'pv', 'rej', 'req', 'state', 'visits']);
    assert.ok(['hoje', 'feito', 'refazer', 'por-fazer'].includes(x.state));
    if (x.rej) assert.deepEqual(Object.keys(x.rej), ['origem', 'tamanho', 'json', 'versao', 'esquema', 'limite', 'robo', 'cheio']);
  }
  assert.deepEqual(Object.keys(d.now).sort(), ['pv', 'uv', 'visits']);
  assert.deepEqual(Object.keys(d.period).sort(), ['from', 'pv', 'to', 'visits']);
  const text = JSON.stringify(d);
  for (const w of ['Lisbon', 'PT', 'google', 'mobile', 'iPhone', '10.']) assert.ok(!text.includes(w), w);
});

test('HTTP: GET only, the usual filters, a key, today allowed', async () => {
  assert.equal((await api(mf, 'diag', { method: 'POST', body: {} })).status, 405);
  assert.equal((await api(mf, 'diag?p=1y')).status, 400);
  assert.equal((await api(mf, 'diag?dev=phone')).status, 400);
  assert.equal((await api(mf, 'diag', { key: 'wrong-key-0123456789' })).status, 401);
  const r = await api(mf, 'diag?p=24h', { origin: SITE });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('access-control-allow-origin'), SITE);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  // nothing new is stored by reading
  const t0 = (await dump(mf)).tables;
  await diag(mf, 'p=90d');
  const t1 = (await dump(mf)).tables;
  for (const k of ['pv', 'bx', 'agg', 'ans', 'notes']) assert.equal(t1[k], t0[k], k);
  void PLACE;
});
