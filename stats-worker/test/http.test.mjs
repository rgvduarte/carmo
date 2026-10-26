// Every refusal path and status, CORS and OPTIONS, the response headers, /health, admin auth (SPEC 3).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { start, post, api, page, dump, UA, SITE, KEY, lisbonToday } from './helpers.mjs';

let mf, prod;
before(async () => {
  mf = await start();
  // a "production" instance: no dev hooks, no jurisdiction (local workerd has none)
  prod = await start({ DEV_HOOKS: null, STORE_JURISDICTION: '' });
});
after(async () => { await mf.dispose(); await prod.dispose(); });

const raw = (m, path, init) => m.dispatchFetch(`http://api.test${path}`, init);
const rej = async (m) => (await api(m, 'system?p=7d')).json.rejected.s;
const sumLast = (s, k) => s[k][s[k].length - 1];

function commonHeaders(r) {
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(r.headers.get('content-security-policy'), "default-src 'none'; frame-ancestors 'none'");
  assert.match(r.headers.get('vary') || '', /Origin/);
  for (const h of ['set-cookie', 'etag', 'last-modified']) assert.equal(r.headers.get(h), null, h);
}

test('/health says which pieces are set up, true or false only', async () => {
  const r = await raw(mf, '/health', {});
  commonHeaders(r);
  assert.deepEqual(await r.json(), { ok: true, v: '1.0.0', schema: 1, store: true, eu: true, salt: true, admin: true, limits: true, dev: true });
  const p = await (await raw(prod, '/health', {})).json();
  assert.equal(p.dev, false); assert.equal(p.eu, false); assert.equal(p.store, true);
  // without the secrets
  const bare = await start({ SALT_SECRET: 'short', ADMIN_KEY: 'short', DEV_HOOKS: null, STORE_JURISDICTION: 'eu' });
  const b = await (await raw(bare, '/health', {})).json();
  assert.equal(b.salt, false); assert.equal(b.admin, false);
  assert.equal(b.store, false, 'jurisdiction refused (as local workerd does) shows as store:false, data never moves');
  // a beacon without SALT_SECRET is answered 204 and nothing is stored
  const s = await post(bare, page());
  assert.equal(s.status, 204);
  await bare.dispose();
});

test('unknown paths and wrong methods', async () => {
  for (const p of ['/', '/collect', '/v1', '/admin', '/admin/v2/overview']) {
    const r = await raw(mf, p, {});
    assert.equal(r.status, 404, p);
    assert.deepEqual(await r.json(), { error: 'nada' });
  }
  const g = await raw(mf, '/v1/e', { headers: { Origin: SITE } });
  assert.equal(g.status, 405);
  assert.deepEqual(await g.json(), { error: 'metodo' });
  assert.equal((await raw(mf, '/health', { method: 'POST' })).status, 405);
});

test('OPTIONS: 204 with CORS for the site, 403 for anyone else', async () => {
  const ok = await raw(mf, '/v1/e', { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(ok.status, 204);
  commonHeaders(ok);
  assert.equal(ok.headers.get('access-control-allow-origin'), SITE);
  assert.equal(ok.headers.get('access-control-allow-methods'), 'GET, POST, DELETE, OPTIONS');
  assert.equal(ok.headers.get('access-control-allow-headers'), 'Content-Type, Authorization');
  assert.equal(ok.headers.get('access-control-max-age'), '600');
  const adm = await raw(mf, '/admin/v1/overview', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8080' } });
  assert.equal(adm.status, 204);
  assert.equal(adm.headers.get('access-control-allow-origin'), 'http://localhost:8080');
  const bad = await raw(mf, '/admin/v1/overview', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } });
  assert.equal(bad.status, 403);
  assert.equal(bad.headers.get('access-control-allow-origin'), null);
  const sub = await raw(mf, '/v1/e', { method: 'OPTIONS', headers: { Origin: 'https://gocarmo.com.evil.example' } });
  assert.equal(sub.status, 403);
});

test('beacon refusals, in order, each counted once (and GPC/DNT counted nowhere)', async () => {
  const before0 = await rej(mf);
  const r1 = await post(mf, page(), { origin: 'https://evil.example' });
  assert.equal(r1.status, 403); assert.deepEqual(JSON.parse(r1.text), { error: 'origem' });
  const r2 = await post(mf, page(), { origin: null });
  assert.equal(r2.status, 403);
  const big = JSON.stringify({ ...page(), pad: 'x'.repeat(17 * 1024) });
  const r3 = await post(mf, big, { ip: '10.0.3.7' });
  assert.equal(r3.status, 413); assert.deepEqual(JSON.parse(r3.text), { error: 'tamanho' });
  // a body that lies about its length (streamed, no Content-Length) is cut while reading
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < 20; i++) c.enqueue(new TextEncoder().encode('x'.repeat(1024))); c.close(); } });
  const r3b = await mf.dispatchFetch('http://api.test/v1/e', { method: 'POST', body: stream, duplex: 'half', headers: { Origin: SITE, 'User-Agent': UA.iphone, 'X-Dev-Ip': '10.0.3.8' } });
  assert.equal(r3b.status, 413);
  const r4 = await post(mf, '{"v":1,', { ip: '10.0.4.7' });
  assert.equal(r4.status, 400); assert.deepEqual(JSON.parse(r4.text), { error: 'json' });
  const bad8 = new Uint8Array([0x7b, 0x22, 0xff, 0xfe, 0x22, 0x7d]);
  const r4b = await mf.dispatchFetch('http://api.test/v1/e', { method: 'POST', body: bad8, headers: { Origin: SITE, 'User-Agent': UA.iphone, 'X-Dev-Ip': '10.0.4.8' } });
  assert.equal(r4b.status, 400);
  const r5 = await post(mf, page({ v: 2 }), { ip: '10.0.5.7' });
  assert.equal(r5.status, 400); assert.deepEqual(JSON.parse(r5.text), { error: 'versao' });
  const noPv = page(); delete noPv.pv;
  const r6 = await post(mf, noPv, { ip: '10.0.6.7' });
  assert.equal(r6.status, 400); assert.deepEqual(JSON.parse(r6.text), { error: 'esquema' });
  for (const bad of [{ vw: 'x' }, { path: '/admin/' }, { lang: 'fr' }, { ref: 'Not A Host' }, { f: 0 }, { t: 'z' }, { nav: 'other' }, { vh: 'tall' }, { pv: 'abc' }]) {
    const r = await post(mf, page(bad), { ip: '10.0.6.8' });
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  // bots: 204, nothing stored
  for (const ua of [UA.bot, '', 'x'.repeat(513), 'curl/8.0', 'Mozilla/5.0 HeadlessChrome/141', 'facebookexternalhit/1.1']) {
    const r = await post(mf, page(), { ua, ip: '10.0.7.7' });
    assert.equal(r.status, 204);
  }
  // GPC and DNT: 204, nothing stored, nothing counted
  for (const h of [{ 'Sec-GPC': '1' }, { DNT: '1' }]) {
    const r = await post(mf, page(), { headers: h, ip: '10.0.8.7' });
    assert.equal(r.status, 204);
    const o = await post(mf, page(), { headers: h, origin: 'https://evil.example', ip: '10.0.8.7' });
    assert.equal(o.status, 403);
  }
  const after0 = await rej(mf);
  const d = (k) => sumLast(after0, k) - sumLast(before0, k);
  assert.equal(d('origem'), 2);
  assert.equal(d('tamanho'), 2);
  assert.equal(d('json'), 2);
  assert.equal(d('versao'), 1);
  assert.equal(d('esquema'), 10);
  assert.equal(d('robo'), 6);
  assert.equal(d('limite'), 0);
  const t = await dump(mf);
  assert.equal(t.tables.pv, 0, 'nothing refused is stored');
});

test('rate limit: 30 beacons a minute per address, then 429', async () => {
  const codes = [];
  for (let i = 0; i < 40; i++) codes.push((await post(mf, page(), { ip: '10.20.30.40' })).status);
  assert.equal(codes.filter((c) => c === 204).length, 30);
  assert.equal(codes.filter((c) => c === 429).length, 10);
  // the same /24 is the same address for the limit; another /24 is not
  assert.equal((await post(mf, page(), { ip: '10.20.30.99' })).status, 429);
  assert.equal((await post(mf, page(), { ip: '10.20.31.40' })).status, 204);
  const s = await rej(mf);
  assert.ok(sumLast(s, 'limite') >= 11);
});

test('GPC requests are not even counted as requests', async () => {
  const q0 = (await api(mf, 'system?p=7d')).json.quota;
  for (let i = 0; i < 3; i++) await post(mf, page(), { headers: { 'Sec-GPC': '1' }, ip: '10.0.9.7' });
  const q1 = (await api(mf, 'system?p=7d')).json.quota;
  // only the second system call itself was counted
  assert.equal(q1.req[q1.req.length - 1] - q0.req[q0.req.length - 1], 1);
});

test('a refusal is counted even when the next call to the Worker never reaches the store', async () => {
  const s0 = await rej(mf);
  await post(mf, page(), { origin: 'https://evil.example' });
  assert.equal((await api(mf, 'nothing-here')).status, 404);
  assert.equal((await api(mf, 'export.csv?t=nope')).status, 400);
  const s1 = await rej(mf);
  assert.equal(sumLast(s1, 'origem') - sumLast(s0, 'origem'), 1);
});

test('feedback: 1 KB limit, enums, 204', async () => {
  const fb = { v: 1, q: 'patrocinio', a: 'sim', lang: 'pt' };
  assert.equal((await post(mf, fb, { path: '/v1/f', ip: '10.1.0.7' })).status, 204);
  assert.equal((await post(mf, { ...fb, a: 'talvez' }, { path: '/v1/f', ip: '10.1.0.7' })).status, 400);
  assert.equal((await post(mf, { ...fb, q: 'outra' }, { path: '/v1/f', ip: '10.1.0.7' })).status, 400);
  assert.equal((await post(mf, { ...fb, v: 3 }, { path: '/v1/f', ip: '10.1.0.7' })).status, 400);
  assert.equal((await post(mf, { ...fb, pad: 'x'.repeat(1100) }, { path: '/v1/f', ip: '10.1.0.7' })).status, 413);
  assert.equal((await post(mf, fb, { path: '/v1/f', origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(mf, fb, { path: '/v1/f', headers: { DNT: '1' } })).status, 204);
  const t = lisbonToday();
  const f = (await api(mf, `feedback?p=custom&from=${t}&to=${t}`)).json;
  assert.equal(f.standalone, 1);
  assert.equal(f.sim, 1);
});

test('admin auth: origin, key, constant-time compare, 401 chave', async () => {
  const none = await api(mf, 'overview', { key: null });
  assert.equal(none.status, 401); assert.deepEqual(none.json, { error: 'chave' });
  const wrong = await api(mf, 'overview', { key: `${KEY}x` });
  assert.equal(wrong.status, 401);
  const short = await api(mf, 'overview', { key: KEY.slice(0, -1) });
  assert.equal(short.status, 401);
  const basic = await mf.dispatchFetch('http://api.test/admin/v1/ping', { headers: { Authorization: `Basic ${KEY}` } });
  assert.equal(basic.status, 401);
  const evil = await api(mf, 'overview', { origin: 'https://evil.example' });
  assert.equal(evil.status, 403); assert.deepEqual(evil.json, { error: 'origem' });
  const ok = await api(mf, 'ping', { origin: SITE });
  assert.equal(ok.status, 200);
  commonHeaders({ headers: ok.headers });
  assert.equal(ok.headers.get('access-control-allow-origin'), SITE);
  assert.equal(ok.json.retention.raw, 30);
  // an ADMIN_KEY shorter than 16 characters never opens anything
  const weak = await start({ ADMIN_KEY: 'x'.repeat(15) });
  assert.equal((await api(weak, 'ping', { key: 'x'.repeat(15) })).status, 401);
  await weak.dispose();
});

test('admin parameters: 400 periodo / filtro, 404, 405', async () => {
  const t = lisbonToday();
  for (const q of ['p=1y', 'p=custom', `p=custom&from=${t}&to=2099-01-01`, 'p=custom&from=2026-02-30&to=2026-03-01', `p=custom&from=${t}&to=2020-01-01`, 'p=custom&from=2000-01-01&to=2000-01-02']) {
    const r = await api(mf, `overview?${q}`);
    assert.equal(r.status, 400, q); assert.deepEqual(r.json, { error: 'periodo' });
  }
  for (const q of ['dev=phone', 'int=2', 'cmp=yes', 'vw=x', 'src=both']) {
    const r = await api(mf, `overview?${q}`);
    assert.equal(r.status, 400, q); assert.deepEqual(r.json, { error: 'filtro' });
  }
  assert.equal((await api(mf, 'nothing')).status, 404);
  assert.equal((await api(mf, 'overview', { method: 'POST', body: {} })).status, 405);
  assert.equal((await api(mf, 'export.csv?t=tudo')).status, 400);
  for (const e of ['ping', 'now', 'overview', 'audience', 'content', 'heatmap', 'studio', 'booking', 'contacts', 'quality', 'feedback', 'system']) {
    for (const p of ['24h', '7d', '30d', '90d']) {
      const r = await api(mf, `${e}?p=${p}`);
      assert.equal(r.status, 200, `${e} ${p}`);
      assert.equal(r.json.ok, true);
    }
  }
});

test('without DEV_HOOKS: no dev routes, no X-Dev-* headers, localhost pages count as internal', async () => {
  assert.equal((await api(prod, 'dev/reset', { method: 'POST', body: {} })).status, 404);
  assert.equal((await api(prod, 'dev/dump')).status, 404);
  const t = lisbonToday();
  // X-Dev-Now is ignored: the beacon lands today, not in 2020
  assert.equal((await post(prod, page(), { origin: 'http://localhost:8080', now: '2020-01-01T12:00:00Z' })).status, 204);
  const o0 = (await api(prod, `overview?p=custom&from=${t}&to=${t}`)).json;
  const o1 = (await api(prod, `overview?p=custom&from=${t}&to=${t}&int=1`)).json;
  assert.equal(o0.kpi.pv.v, 0, 'a localhost page is internal');
  assert.equal(o1.kpi.pv.v, 1);
  // src is a dev-only switch: ignored here
  assert.equal((await api(prod, `overview?p=7d&src=raw`)).status, 200);
});
