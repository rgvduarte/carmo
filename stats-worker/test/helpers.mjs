// Test helpers: a Miniflare instance of the Worker (src/*.js, the SQLite Durable Object in memory) and small builders
// for beacons and admin calls. Run with `npm test` (node --test).
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
export const KEY = 'test-admin-key-0123456789';
export const SALT = 'ab'.repeat(32);
export const SITE = 'https://gocarmo.com';

export async function start(bindings = {}) {
  const files = readdirSync(`${root}src`).filter((f) => f.endsWith('.js'));
  files.sort((a, b) => (a === 'index.js' ? -1 : b === 'index.js' ? 1 : a < b ? -1 : 1));
  const env = { SITE_ORIGIN: SITE, STORE_JURISDICTION: 'eu', ROLLUP_CHUNK: '7', ADMIN_KEY: KEY, SALT_SECRET: SALT, DEV_HOOKS: '1', ...bindings };
  for (const k of Object.keys(env)) if (env[k] === null) delete env[k];
  const mf = new Miniflare(convertV4MiniflareOptions({
    name: 'gocarmo-api',
    modules: files.map((f) => ({ type: 'ESModule', path: `${root}src/${f}` })),
    modulesRoot: root,
    compatibilityDate: '2026-09-01',
    durableObjects: { STORE: { className: 'Store', useSQLite: true } },
    bindings: env,
    ratelimits: {
      RL_BEACON: { namespace_id: '4201', simple: { limit: 60, period: 60 } },
      RL_ADMIN: { namespace_id: '4202', simple: { limit: 120, period: 60 } },
    },
  }));
  await mf.ready;
  return mf;
}

export const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  pixel: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  win: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  insta: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0 (iPhone14,5; iOS 18_1; pt_PT; pt)',
  bot: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
};
export const PLACE = {
  lisboa: { country: 'PT', region: 'Lisbon', city: 'Lisbon', latitude: '38.72230', longitude: '-9.13930' },
  porto: { country: 'PT', region: 'Porto', city: 'Porto', latitude: '41.15', longitude: '-8.61' },
  leiria: { country: 'PT', region: 'Leiria', city: 'Leiria', latitude: '39.74', longitude: '-8.81' },
  madrid: { country: 'ES', region: 'Madrid', city: 'Madrid', latitude: '40.42', longitude: '-3.70' },
};

// Lisbon wall clock → ISO instant (WET/WEST)
export function lisbonISO(day, hh = 12, mm = 0) {
  const guess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hh, mm);
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' });
  const off = Number(f.format(new Date(guess))) - hh;   // 0 or 1
  return new Date(guess - ((off + 24) % 24) * 3600e3).toISOString();
}
export function lisbonToday(ms = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
export function addDays(day, n) { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

export const uuid = () => crypto.randomUUID();

// the page fields every beacon carries
export function page(over = {}) {
  return { v: 1, pv: uuid(), f: 1, t: 's', vis: 1, path: '/', lang: 'pt', bl: 'pt', ref: 'direto', vw: 'm', vh: 800, nav: 'navigate', pc: 1, b: '033e031d', ...over };
}

export async function post(mf, body, { path = '/v1/e', origin = SITE, ua = UA.iphone, ip = '10.0.0.7', cf = PLACE.lisboa, now, headers = {} } = {}) {
  const h = { 'Content-Type': 'text/plain;charset=UTF-8', ...headers };
  if (origin) h.Origin = origin;
  if (ua !== null) h['User-Agent'] = ua;
  if (ip) h['X-Dev-Ip'] = ip;
  if (cf) h['X-Dev-Cf'] = JSON.stringify(cf);
  if (now) h['X-Dev-Now'] = now;
  const r = await mf.dispatchFetch(`http://api.test${path}`, { method: 'POST', headers: h, body: typeof body === 'string' ? body : JSON.stringify(body) });
  const text = await r.text();
  return { status: r.status, text, headers: r.headers };
}

export async function api(mf, path, { key = KEY, now, origin, method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers };
  if (key) h.Authorization = `Bearer ${key}`;
  if (now) h['X-Dev-Now'] = now;
  if (origin) h.Origin = origin;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const r = await mf.dispatchFetch(`http://api.test/admin/v1/${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch (_) { json = null; }
  return { status: r.status, json, text, headers: r.headers };
}

export async function dump(mf, grep = []) {
  const q = grep.map((g) => `grep=${encodeURIComponent(g)}`).join('&');
  return (await api(mf, `dev/dump?${q}`)).json;
}

// one whole visit: a stub at 1 s, then a hide flush with the snapshots and the events
export async function visit(mf, { ua = UA.iphone, ip = '10.0.0.7', cf = PLACE.lisboa, now, page: pg = {}, snap = {}, events = [], stubEvents = [], hide = true, perf } = {}) {
  const base = page(pg);
  const a = await post(mf, { ...base, e: stubEvents.length ? stubEvents : undefined }, { ua, ip, cf, now });
  if (a.status !== 204) throw new Error(`stub ${a.status} ${a.text}`);
  if (!hide) return base.pv;
  const b = await post(mf, { ...base, f: 2, t: 'h', vis: 0, ...snap, ...(perf ? { perf } : {}), e: events.length ? events : undefined }, { ua, ip, cf, now });
  if (b.status !== 204) throw new Error(`hide ${b.status} ${b.text}`);
  return base.pv;
}

export const ev = (i, n, p = {}) => ({ i, k: 'ev', n, p });
export const click = (i, o) => ({ i, k: 'click', ...o });
export const strip = (o) => { const { generated, ...rest } = o; return rest; };
