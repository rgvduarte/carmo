// What may never reach storage (privacy 2.5, SPEC 3.3): unknown keys, emails and phone numbers, the IP, the UA; and
// how visitors are counted (a daily salt, two page views of one visitor, a Lisbon midnight).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, post, api, page, dump, visit, ev, click, UA, PLACE, lisbonISO, lisbonToday, addDays } from './helpers.mjs';

let mf;
before(async () => { mf = await start(); });
after(async () => { await mf.dispose(); });

const IP = '10.123.45.67';
const DAY = addDays(lisbonToday(), -3);
const at = (hh, mm = 0, day = DAY) => lisbonISO(day, hh, mm);
const ov = async (from, to = from, now = at(15)) => (await api(mf, `overview?p=custom&from=${from}&to=${to}`, { now })).json;

test('the allowlist: unknown keys, names and params are dropped; emails and phones never reach storage', async () => {
  const pv = await visit(mf, {
    ip: '10.50.1.7', now: at(10),
    page: { email: 'joao@mail.pt', nif: '123456789', name: 'Joao Silva' },
    snap: { eng: 40, scr: 50, rz: ['top', 'tese', 'quarto-secreto'], sec: { top: 10, tese: 20, 'quarto-secreto': 9 }, ex: 'tese', extra: { phone: '912345678' } },
    events: [
      // a label with an email: the label goes, the click stays
      click(1, { sel: '#hero-spots', lab: 'joao@mail.pt 912345678', sec: 'top', x: 10, y: 20, ex: 5, ey: 5, pt: 't', ia: 0 }),
      // a selector with a phone number in an attribute: the whole click goes
      click(2, { sel: '#a[data-id="912345678"]', lab: 'x', sec: 'top', x: 10, y: 20 }),
      click(3, { sel: '#tel-912345678', lab: 'y', sec: 'top' }),
      // a field of the booking window: never a click record
      click(4, { sel: '#cl-name', lab: 'cl-name', sec: 'reserva' }),
      click(5, { sel: '#claim > form > input:nth-of-type(2)', sec: 'reserva' }),
      // a label with a phone: masked
      click(6, { sel: '#contacto', lab: 'Liga 912 345 678 já', sec: 'contacto', out: 'tel', value: 'secret-value' }),
      ev(7, 'spot_select', { spot: 'peito', from: 'tabela', item: 'suit', brand: 'MarcaSecreta' }),
      ev(8, 'claim_send', { ch: 'whatsapp', nif: '123456789', message: 'ola' }),
      ev(9, 'made_up_event', { x: 1 }),
      { i: 10, k: 'err', t: 'TypeError', m: 'boom for maria@example.com at https://gocarmo.com/x?id=55 call 912345678', f: 'main.js', l: 3, c: 4, stack: 'secret stack' },
      { i: 11, k: 'err', t: 'Error', m: 'from an extension joao@mail.pt', f: 'chrome-extension.js', l: 1, c: 1 },
      { i: 12, k: 'secret', v: 'joao@mail.pt' },
    ],
  });
  assert.ok(pv);
  const needles = ['joao@mail.pt', '912345678', '912 345 678', '123456789', 'Joao Silva', 'MarcaSecreta', 'maria@example.com',
    'secret-value', 'secret stack', 'quarto-secreto', 'made_up_event', 'gocarmo.com/x', 'ola'];
  const d = await dump(mf, needles);
  for (const n of needles) assert.deepEqual(d.grep[n], [], n);
  // what is kept is the clean version
  const t = DAY;
  const q = (await api(mf, `quality?p=custom&from=${t}&to=${t}`, { now: at(15) })).json;
  assert.equal(q.errors.length, 2);
  const e = q.errors.find((x) => x.f === 'main.js');
  assert.equal(e.m, 'boom for [email] at [url] call [n]');
  assert.equal(q.errors.find((x) => x.f === 'ext').m, '', 'a message from a file that is not ours is never kept');
  const h = (await api(mf, `heatmap?p=custom&from=${t}&to=${t}&vw=all`, { now: at(15) })).json;
  assert.equal(h.pvBucket, 1);
  const c = (await api(mf, `contacts?p=custom&from=${t}&to=${t}`, { now: at(15) })).json;
  assert.deepEqual(c.out.rows.map((r) => r.k), ['tel']);
});

test('no IP address and no User-Agent anywhere at rest', async () => {
  const ua = `${UA.pixel} UniqueMarker/77`;
  for (let i = 0; i < 3; i++) await visit(mf, { ip: IP, ua, now: at(11, i), events: [ev(1, 'menu_open')] });
  await post(mf, { v: 1, q: 'patrocinio', a: 'nao', lang: 'pt' }, { path: '/v1/f', ip: IP, ua, now: at(11, 5) });
  // the rollup writes aggregates: they must not hold them either
  await api(mf, 'dev/rollup', { method: 'POST', body: { day: DAY }, now: at(15) });
  const needles = [IP, '10.123.45.', '10.123.45.0', ua, 'UniqueMarker', 'Pixel 7', 'Mozilla', 'AppleWebKit', '141.0.0.0'];
  const d = await dump(mf, needles);
  for (const n of needles) assert.deepEqual(d.grep[n], [], n);
  assert.ok(d.tables.pv >= 3 && d.tables.agg > 0);
});

test('a visitor-day: two page views of one visitor count once; across a Lisbon midnight they count twice', async () => {
  // later days than the other tests: the salt only ever rotates forwards
  const day = addDays(DAY, 1), next = addDays(DAY, 2), q = at(15, 0, next);
  const ip = '10.77.1.9', ua = UA.win;
  await visit(mf, { ip, ua, now: at(23, 50, day), page: { vw: 'd', pc: 0 } });
  await visit(mf, { ip, ua, now: at(23, 58, day), page: { vw: 'd', pc: 0, nav: 'reload' } });
  // same address /24, same browser: the same visitor (the IP is cut to its /24 before hashing)
  await visit(mf, { ip: '10.77.1.200', ua, now: at(23, 59, day), page: { vw: 'd', pc: 0, ref: 'interno' } });
  // a different browser on the same network is another visitor
  await visit(mf, { ip, ua: UA.mac, now: at(23, 59, day), page: { vw: 'd', pc: 0 } });
  // after midnight in Lisbon (00:01, while UTC is still on the previous day in winter or 23:01 in summer)
  await visit(mf, { ip, ua, now: at(0, 1, next), page: { vw: 'd', pc: 0 } });
  const a = await ov(day, day, q), b = await ov(next, next, q), both = await ov(day, next, q);
  assert.equal(a.kpi.pv.v, 4);
  assert.equal(a.kpi.uv.v, 2);
  assert.equal(a.kpi.visits.v, 2, 'a reload and an internal link are page views, not visits');
  assert.equal(b.kpi.uv.v, 1);
  assert.equal(both.kpi.uv.v, 3, 'visitor-days add up across days');
  // the salt of the day before is gone, and the day's set of hashes was emptied
  const d = await dump(mf);
  assert.equal(d.tables.salt, 1);
  assert.equal(d.tables.seen, 1);
});

test('stored per page view: day and hour only, place rounded to about 10 km, coarse UA', async () => {
  const day = addDays(DAY, -5);
  await visit(mf, { ip: '10.88.1.1', ua: UA.insta, cf: { country: 'PT', region: 'Lisbon', city: 'Lisbon', latitude: '38.72236', longitude: '-9.13936', postalCode: '1000-001', asOrganization: 'Empresa SA' }, now: at(14, 37, day) });
  const d = await dump(mf, ['1000-001', 'Empresa', '38.722', '-9.139', ':37']);
  for (const k of Object.keys(d.grep)) assert.deepEqual(d.grep[k], [], k);
  const au = (await api(mf, `audience?p=custom&from=${day}&to=${day}`, { now: at(15) })).json;
  assert.deepEqual(au.br.rows.map((r) => r.k), ['Instagram 300']);
  assert.deepEqual(au.os.rows.map((r) => r.k), ['iOS 18']);
  assert.deepEqual(au.app.rows.map((r) => r.k), ['instagram']);
  assert.deepEqual(au.ref.rows.map((r) => r.k), ['instagram (app)']);
  assert.deepEqual(au.chan.rows.map((r) => r.k), ['social']);
  assert.equal(au.hours[14], 1);
});
