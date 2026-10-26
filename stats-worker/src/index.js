// gocarmo-api: own, cookieless visit counting for gocarmo.com (stats-worker/README.md). A Cloudflare Worker with one
// SQLite Durable Object (store.js). No dependencies.
//
//   POST /v1/e                   a page's batched beacon (text/plain JSON, SPEC 3.2, 3.3) → 204
//   POST /v1/f                   a feedback answer (3.4) → 204
//   GET  /health                 which pieces are set up, true / false only (3.5)
//   GET  /admin/v1/<endpoint>    (Bearer ADMIN_KEY) aggregates for /admin/analytics/ (3.6)
//   POST /admin/v1/notes, DELETE /admin/v1/notes/<id>, GET /admin/v1/export.csv
//
// Privacy (privacy.md 2.5): the IP address and the User-Agent are read in memory only. The IP is cut to its /24 (IPv6:
// /48) and goes, with the UA, into a hash with a salt that changes every Lisbon day and is then deleted. Nothing is
// logged: no console output except an error code, and observability is off in wrangler.toml. Errors never carry
// request data.

import { Store } from './store.js';
import { sanitizeBeacon, sanitizeFeedback } from './sanitize.js';
import { isBot, parseUA, channelOf, truncIp } from './ua.js';
import { clock, period } from './time.js';
import { CSV_TABLES } from './csv.js';
import { ENDPOINT_NAMES } from './query.js';

export { Store };

const VERSION = '1.0.0';
const MAX_BEACON = 16384;
const MAX_FEEDBACK = 1024;
const MAX_NOTE = 2048;
const RL_WINDOW = 60e3, RL_MAX = 30, RL_KEYS = 5000;

// ---------- isolate counters (3.1): they ride on the next call to the store ----------
const tally = new Map();
const bump = (k) => tally.set(k, (tally.get(k) || 0) + 1);
const takeTally = () => { const o = Object.fromEntries(tally); tally.clear(); return o; };
// in-memory sliding window per address key
const windows = new Map();

const enc = new TextEncoder();
const devOn = (env) => env.DEV_HOOKS === '1';
const saltOk = (env) => typeof env.SALT_SECRET === 'string' && env.SALT_SECRET.length >= 32;
const keyOk = (env) => typeof env.ADMIN_KEY === 'string' && env.ADMIN_KEY.length >= 16;

export default {
  async fetch(request, env) {
    try { return await route(request, env); } catch (_) {
      console.error('interno');
      return reply(request, env, { error: 'interno' }, 500);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname, method = request.method;
  const quiet = request.headers.get('Sec-GPC') === '1' || request.headers.get('DNT') === '1';   // counted nowhere
  if (!quiet) bump('req');
  if (method === 'OPTIONS') return preflight(request, env);
  if (path === '/v1/e') return beacon(request, env, quiet, MAX_BEACON, 'e');
  if (path === '/v1/f') return beacon(request, env, quiet, MAX_FEEDBACK, 'f');
  if (path === '/health') return method === 'GET' ? health(request, env) : reply(request, env, { error: 'metodo' }, 405);
  if (path.startsWith('/admin/v1/')) return admin(request, env, url);
  return reply(request, env, { error: 'nada' }, 404);
}

// ---------- responses ----------
function originOf(request, env) {
  const o = request.headers.get('Origin');
  if (!o) return '';
  if (o === (env.SITE_ORIGIN || 'https://gocarmo.com')) return o;
  return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(o) ? o : '';
}
const isLocal = (o) => /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(o);
const BASE = {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", Vary: 'Origin',
};
function cors(request, env) {
  const o = originOf(request, env);
  if (!o) return {};
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600',
    'Access-Control-Expose-Headers': 'Content-Disposition' };
}
function reply(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...BASE, ...cors(request, env) } });
}
const empty = (request, env, status = 204) => new Response(null, { status, headers: { ...BASE, ...cors(request, env) } });
const preflight = (request, env) => empty(request, env, originOf(request, env) ? 204 : 403);

// ---------- the store ----------
// D2: in the EU jurisdiction when STORE_JURISDICTION is "eu". Local workerd has no jurisdictions: only under DEV_HOOKS
// does it fall back to the plain id (in production a refusal must show as store:false on /health, never move data).
function store(env) {
  const ns = env.STORE;
  let id;
  if (env.STORE_JURISDICTION === 'eu') {
    try { id = ns.jurisdiction('eu').idFromName('global'); } catch (e) { if (!devOn(env)) throw e; }
  }
  if (!id) id = ns.idFromName('global');
  try { return ns.get(id, { locationHint: 'weur' }); } catch (_) { return ns.get(id); }
}

// ---------- small tools ----------
let hmacKey = null, hmacFor = null;
async function rlKey(env, ipT) {
  if (hmacFor !== env.SALT_SECRET) {
    hmacKey = await crypto.subtle.importKey('raw', enc.encode(env.SALT_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    hmacFor = env.SALT_SECRET;
  }
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, enc.encode(ipT)));
  return Array.from(sig.subarray(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
}
function overWindow(key, now) {
  const list = (windows.get(key) || []).filter((t) => t > now - RL_WINDOW);
  windows.delete(key);
  const over = list.length >= RL_MAX;
  if (!over) list.push(now);
  windows.set(key, list);
  while (windows.size > RL_KEYS) windows.delete(windows.keys().next().value);
  return over;
}
async function limiterOk(limiter, key) {
  if (!limiter || typeof limiter.limit !== 'function') return true;
  try { const r = await limiter.limit({ key }); return !r || r.success !== false; } catch (_) { return true; }
}
// the body, or null once it passes `max` bytes (the length header may be missing or wrong: count while reading)
async function readCapped(request, max) {
  if (Number(request.headers.get('Content-Length')) > max) return null;
  if (!request.body) return new Uint8Array(0);
  const reader = request.body.getReader(), parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.byteLength;
    if (n > max) { try { await reader.cancel(); } catch (_) {} return null; }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out;
}
function parseJson(buf) {
  try { return { v: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf)) }; } catch (_) { return { error: 'json' }; }
}
// the clock, the address and the place; under DEV_HOOKS the sim may set them with X-Dev-* headers
function nowOf(request, env) {
  if (devOn(env)) { const t = Date.parse(request.headers.get('X-Dev-Now') || ''); if (Number.isFinite(t)) return t; }
  return Date.now();
}
function ipOf(request, env) {
  if (devOn(env) && request.headers.get('X-Dev-Ip')) return request.headers.get('X-Dev-Ip');
  return request.headers.get('CF-Connecting-IP') || '';
}
const placeText = (v) => (typeof v === 'string' ? v.normalize('NFC').replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, 60) || null : null);
function placeOf(request, env) {
  let cf = request.cf || {};
  if (devOn(env) && request.headers.get('X-Dev-Cf')) { try { const o = JSON.parse(request.headers.get('X-Dev-Cf')); if (o && typeof o === 'object') cf = o; } catch (_) {} }
  const cc = typeof cf.country === 'string' && /^[A-Z][A-Z0-9]$/.test(cf.country) ? cf.country : null;
  const ll = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) && Math.abs(n) <= 180 ? Math.round(n * 10) / 10 : null; };
  return { cc, reg: placeText(cf.region) || placeText(cf.regionCode), city: placeText(cf.city), lat: ll(cf.latitude), lon: ll(cf.longitude) };
}

// ---------- POST /v1/e and /v1/f (3.2, 3.4) ----------
async function beacon(request, env, quiet, max, kind) {
  const count = (k) => { if (!quiet) bump(k); };
  if (request.method !== 'POST') return reply(request, env, { error: 'metodo' }, 405);
  const origin = originOf(request, env);
  if (!origin) { count('rej.origem'); return reply(request, env, { error: 'origem' }, 403); }
  if (Number(request.headers.get('Content-Length')) > max) { count('rej.tamanho'); return reply(request, env, { error: 'tamanho' }, 413); }
  if (quiet || !saltOk(env)) return empty(request, env);       // GPC / DNT: nothing stored, nothing counted
  const ua = request.headers.get('User-Agent') || '';
  if (isBot(ua)) { count('rej.robo'); return empty(request, env); }
  const ipT = truncIp(ipOf(request, env));
  const key = await rlKey(env, ipT);
  const now = nowOf(request, env);
  // the limit runs on the real clock, even when a dev clock moves the data
  if (overWindow(key, Date.now()) || !(await limiterOk(env.RL_BEACON, key))) { count('rej.limite'); return reply(request, env, { error: 'limite' }, 429); }
  const buf = await readCapped(request, max);
  if (!buf) { count('rej.tamanho'); return reply(request, env, { error: 'tamanho' }, 413); }
  const parsed = parseJson(buf);
  if (parsed.error) { count('rej.json'); return reply(request, env, { error: 'json' }, 400); }
  const clean = kind === 'e' ? sanitizeBeacon(parsed.v) : sanitizeFeedback(parsed.v);
  if (clean.error) {
    const code = clean.error === 'json' ? 'json' : clean.error;
    count(`rej.${code}`);
    return reply(request, env, { error: code }, 400);
  }
  const c = clock(now);
  // D22: a page served from localhost that reaches this Worker is the owner testing; with DEV_HOOKS (the local
  // Worker of the simulator) the page's own flag decides
  const int = clean.int === 1 || (isLocal(origin) && !devOn(env)) ? 1 : 0;
  if (kind === 'f') {
    const { dev } = parseUA(ua, 0);
    await store(env).feedback({ day: c.day, yday: c.yday, now, ...clean, int, dev, rej: takeTally() });
    return empty(request, env);
  }
  const u = parseUA(ua, clean.page.pc);
  const place = placeOf(request, env);
  await store(env).ingest({
    day: c.day, yday: c.yday, hr: c.hr, now, pv: clean.pv, f: clean.f, t: clean.t, vis: clean.vis,
    page: clean.page, snap: clean.snap, events: clean.events,
    meta: { dev: u.dev, os: u.os, br: u.br, app: u.app, chan: channelOf(clean.page.ref, u.app), ...place, int },
    ipT, ua, rej: takeTally(),
  });
  return empty(request, env);
}

// ---------- GET /health (3.5) ----------
async function health(request, env) {
  let ok = false;
  try { const r = await store(env).ping(); ok = !!(r && r.ok); } catch (_) { ok = false; }
  return reply(request, env, {
    ok: true, v: VERSION, schema: 1, store: ok, eu: env.STORE_JURISDICTION === 'eu', salt: saltOk(env), admin: keyOk(env),
    limits: !!env.RL_BEACON && !!env.RL_ADMIN, dev: devOn(env),
  });
}

// ---------- the admin API (3.6) ----------
// constant time whatever the guess: both sides hashed to 32 bytes, then every byte compared (worker/requests.js)
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s))))));
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
const ADMIN_GET = new Set(ENDPOINT_NAMES);

async function admin(request, env, url) {
  if (request.headers.get('Origin') && !originOf(request, env)) return reply(request, env, { error: 'origem' }, 403);
  // bursts (Cloudflare's binding); the local sim reads in bursts, so dev skips it
  if (!devOn(env) && !(await limiterOk(env.RL_ADMIN, 'admin'))) return reply(request, env, { error: 'limite' }, 429);
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!keyOk(env) || !m || !(await sameSecret(m[1], env.ADMIN_KEY))) return reply(request, env, { error: 'chave' }, 401);

  const path = url.pathname.slice('/admin/v1/'.length).replace(/\/+$/, '');
  const method = request.method;
  const now = nowOf(request, env);
  const c = clock(now);
  const q = Object.fromEntries(url.searchParams);
  const filters = filtersOf(q);
  if (filters.error) return reply(request, env, { error: filters.error }, 400);
  if (!devOn(env)) delete filters.src;
  const P = { clock: c, ...filters };
  // the isolate's counts ride on the call to the store (taken only when the call is made)
  const S = store(env);
  const call = (method, ...args) => { args[args.length - 1].rej = takeTally(); return S[method](...args); };

  if (path === 'ping') return method === 'GET' ? reply(request, env, await call('adminPing', P)) : reply(request, env, { error: 'metodo' }, 405);
  if (path === 'now') return method === 'GET' ? reply(request, env, await call('now', P)) : reply(request, env, { error: 'metodo' }, 405);
  if (path === 'notes') {
    if (method === 'GET') return reply(request, env, await call('notes', 'list', {}));
    if (method !== 'POST') return reply(request, env, { error: 'metodo' }, 405);
    const buf = await readCapped(request, MAX_NOTE);
    if (!buf) return reply(request, env, { error: 'tamanho' }, 413);
    const b = parseJson(buf);
    if (b.error || !b.v || typeof b.v !== 'object') return reply(request, env, { error: 'json' }, 400);
    const r = await call('notes', 'add', { clock: c, day: b.v.day, label: b.v.label, kind: b.v.kind });
    return r.error ? reply(request, env, r, r.error === 'limite' ? 429 : 400) : reply(request, env, r);
  }
  const note = path.match(/^notes\/(\d{1,9})$/);
  if (note) {
    if (method !== 'DELETE') return reply(request, env, { error: 'metodo' }, 405);
    const r = await call('notes', 'del', { id: Number(note[1]) });
    return r.error ? reply(request, env, r, 404) : reply(request, env, r);
  }
  if (path === 'export.csv') {
    if (method !== 'GET') return reply(request, env, { error: 'metodo' }, 405);
    if (!CSV_TABLES.includes(q.t)) return reply(request, env, { error: 'filtro' }, 400);
    const pq = P.p === '24h' ? { ...P, p: 'custom', from: c.yday, to: c.day } : P;   // nothing smaller than a day
    const r = await call('query', 'export', { ...pq, t: q.t });
    if (r.error) return reply(request, env, r, 400);
    return new Response(r.csv, { status: 200, headers: { 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${r.filename}"`, ...BASE, ...cors(request, env) } });
  }
  if (path.startsWith('dev/')) {
    if (!devOn(env)) return reply(request, env, { error: 'nada' }, 404);
    const op = path.slice(4);
    if (op === 'dump' && method === 'GET') return reply(request, env, await call('dev', 'dump', { grep: url.searchParams.getAll('grep') }));
    if (method !== 'POST') return reply(request, env, { error: 'metodo' }, 405);
    let body = {};
    const buf = await readCapped(request, MAX_NOTE);
    if (buf && buf.length) { const b = parseJson(buf); if (b.error) return reply(request, env, { error: 'json' }, 400); body = b.v || {}; }
    const r = await call('dev', op, { ...body });
    return reply(request, env, r, r.error ? 404 : 200);
  }
  if (ADMIN_GET.has(path)) {
    if (method !== 'GET') return reply(request, env, { error: 'metodo' }, 405);
    if (period(P, c).error) return reply(request, env, { error: 'periodo' }, 400);
    const r = await call('query', path, P);
    if (r.error) return reply(request, env, r, r.error === 'nada' ? 404 : 400);
    return reply(request, env, r);
  }
  return reply(request, env, { error: 'nada' }, 404);
}

// common query parameters → { p, from, to, dev, int, cmp, vw, src } or { error }
function filtersOf(q) {
  const p = q.p || '7d';
  if (!['24h', '7d', '30d', '90d', 'custom'].includes(p)) return { error: 'periodo' };
  const dev = q.dev || 'all';
  if (!['all', 'mobile', 'tablet', 'desktop'].includes(dev)) return { error: 'filtro' };
  const int = q.int === undefined ? '0' : q.int, cmp = q.cmp === undefined ? '1' : q.cmp;
  if (!['0', '1'].includes(int) || !['0', '1'].includes(cmp)) return { error: 'filtro' };
  const vw = q.vw || 'all';
  if (!['m', 't', 'd', 'w', 'all'].includes(vw)) return { error: 'filtro' };
  const src = q.src === 'raw' || q.src === 'agg' ? q.src : undefined;
  if (q.src !== undefined && !src) return { error: 'filtro' };
  const out = { p, dev, int: Number(int), cmp: Number(cmp), vw };
  if (p === 'custom') { out.from = q.from; out.to = q.to; }
  if (src) out.src = src;
  return out;
}
