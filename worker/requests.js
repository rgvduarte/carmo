// Booking requests from gocarmo.com: a Cloudflare Worker (module syntax, no dependencies). Deployed to its workers.dev
// address by .github/workflows/deploy-pedidos.yml; the secrets and how to switch it on are in worker/README.md.
//
//   POST /pedido              the site's booking dialog. Holds the spots for 48 h in data/spots.json on gh-pages (one
//                             commit, GitHub contents API, SPOTS_GITHUB_TOKEN) and keeps the request and its logo in KV
//                             for 180 days. JSON in, 201 { id, until, total } out.
//   GET  /pedidos             (admin) the requests kept, newest first, without the logos
//   GET  /pedidos/<id>/logo   (admin) the request's logo, a PNG
//   POST /pedidos/<id>        (admin) { action: 'confirmar' | 'cancelar' | 'prolongar' }
//   GET  /estado              which pieces are set up (true / false only), for the deploy check
//
// Admin calls carry "Authorization: Bearer <ADMIN_KEY>". A request holds a name and a NIF, so: it expires from KV after
// 180 days, only an admin call returns it, the IP is kept only as a keyed hash inside counters that expire, nothing is
// ever logged, and an error is { error: '<code>' } with nothing of the request in it.
//
// The file is written as the admin page (assets/js/admin-core.js, applyAction) and the issue-form bot
// (scripts/spot-update.mjs) write it: JSON.stringify(data, null, 2) and a newline, the same keys in the same order,
// plus "request": <id> on each held spot. Any later admin action on that spot drops the "request" key.

const DAY_S = 86400;
const KEEP_S = 180 * DAY_S;              // a request and its logo live 180 days in KV
const HOLD_H = 48;
const MAX_BODY = 1536 * 1024;            // the whole POST: 1.5 MB
const MAX_LOGO = 1024 * 1024;            // the logo, decoded: 1 MB
const MAX_SIDE = 4096;                   // px, either side of the logo
const CAPS = { brand: 60, name: 80, nif: 20, message: 2000 };   // characters, after trimming
const PER_IP_DAY = 3;                    // requests placed per IP per UTC day
const BURST = 20, WINDOW_S = 600;        // POST /pedido per IP per 10 minutes, valid or not
const AUTH_FAILS = 20;                   // wrong admin keys per IP per 10 minutes
const HOLDS_DAY = 12;                    // holds per UTC day for the whole site (MAX_HOLDS_DAY overrides it)
const RETRIES = 3;                       // a write that lost the race to another commit is tried again 3 times
const PAYS = ['mb', 'tr'];
const CHANNELS = ['whatsapp', 'email', 'instagram', 'site'];
const ACTIONS = ['confirmar', 'cancelar', 'prolongar'];
const TITLE = 'fato';                    // the whole suit, as data/spots.json "title" (the admin and the bot call it so)
const SPOTS_PATH = 'data/spots.json';
const ID_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ID_RE = /^[0-9A-Z]{10}$/;
const UA = 'gocarmo-pedidos';

const cfg = (env) => ({
  site: env.SITE_ORIGIN || 'https://gocarmo.com',
  repo: env.REPO || 'rgvduarte/carmo',
  branch: env.BRANCH || 'gh-pages',
  holdsDay: Number(env.MAX_HOLDS_DAY) || HOLDS_DAY,
});
const keyOk = (env) => typeof env.ADMIN_KEY === 'string' && env.ADMIN_KEY.length >= 16;

export default {
  async fetch(request, env) {
    try { return await route(request, env); } catch (_) {
      return reply(request, env, { error: 'interno' }, 500);   // never the error itself: it could carry a request's data
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url), path = url.pathname.replace(/\/+$/, '') || '/', method = request.method;
  if (method === 'OPTIONS') return preflight(request, env);
  if (path === '/' || path === '/estado') {
    if (method !== 'GET') return reply(request, env, { error: 'metodo' }, 405);
    return reply(request, env, { ok: true, kv: !!env.PEDIDOS, github: !!env.SPOTS_GITHUB_TOKEN, admin: keyOk(env), turnstile: !!env.TURNSTILE_SECRET });
  }
  if (path === '/pedido') return method === 'POST' ? create(request, env) : reply(request, env, { error: 'metodo' }, 405);
  const m = path.match(/^\/pedidos(?:\/([^/]+)(\/logo)?)?$/);
  if (!m) return reply(request, env, { error: 'nada' }, 404);
  if (request.headers.get('Origin') && !originOf(request, env)) return reply(request, env, { error: 'origem' }, 403);
  const denied = await admin(request, env);
  if (denied) return denied;
  if (m[1] && !ID_RE.test(m[1])) return reply(request, env, { error: 'nada' }, 404);
  if (!m[1] && method === 'GET') return list(request, env);
  if (m[1] && m[2] && method === 'GET') return logo(request, env, m[1]);
  if (m[1] && !m[2] && method === 'POST') return act(request, env, m[1]);
  return reply(request, env, { error: 'metodo' }, 405);
}

// ---------- responses ----------
// https://gocarmo.com, and http://localhost / 127.0.0.1 on any port for local tests
function originOf(request, env) {
  const o = request.headers.get('Origin');
  if (!o) return '';
  if (o === cfg(env).site) return o;
  return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d{1,5})?$/.test(o) ? o : '';
}
function cors(request, env) {
  const o = originOf(request, env);
  if (!o) return { Vary: 'Origin' };
  return { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600', Vary: 'Origin' };
}
const BASE = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" };
function reply(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...BASE, ...cors(request, env) } });
}
function preflight(request, env) {
  return new Response(null, { status: originOf(request, env) ? 204 : 403, headers: { ...BASE, ...cors(request, env) } });
}
const fail = (request, env, error, status = 400, extra = {}) => reply(request, env, { error, ...extra }, status);

// ---------- small tools ----------
const enc = new TextEncoder();
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));
const pad2 = (n) => String(n).padStart(2, '0');
const todayUTC = (now) => new Date(now).toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// the last day of a hold placed now: the UTC date 48 hours from now. The site frees it once that day is over.
const holdUntil = (now) => new Date(now + HOLD_H * 3600e3).toISOString().slice(0, 10);
const joinPT = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);

async function hmacHex(key, text) {
  const k = await crypto.subtle.importKey('raw', enc.encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(text)));
  return Array.from(sig.subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}
// constant time whatever the guess: both sides hashed to 32 bytes, then every byte compared
async function sameSecret(a, b) {
  const [x, y] = await Promise.all([a, b].map(async (s) => new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(String(s))))));
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
// the IP only as a keyed hash, and only in counters that expire
const ipHash = (env, request) => hmacHex(env.ADMIN_KEY, request.headers.get('CF-Connecting-IP') || 'sem-ip');
async function count(env, key) { return Number(await env.PEDIDOS.get(key)) || 0; }
async function bump(env, key, ttl) {
  try { await env.PEDIDOS.put(key, String((await count(env, key)) + 1), { expirationTtl: Math.max(60, ttl) }); } catch (_) {}   // a counter never fails a request
}
function newId(now) {
  const rnd = crypto.getRandomValues(new Uint8Array(4));
  return Math.floor(now / 1000).toString(36).toUpperCase().padStart(6, '0').slice(-6) + Array.from(rnd, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}
// text from the site: a string (or nothing), no control characters, spaces collapsed (the message keeps its line
// breaks); null when it is not text or is longer than `max` characters
function text(v, max, lines = false) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return null;
  let s = v.normalize('NFC').replace(lines ? /\r\n?/g : /[\r\n]+/g, lines ? '\n' : ' ');
  s = s.replace(lines ? /[\u0000-\u0009\u000b-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g : /[\u0000-\u001f\u007f\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, ' ');
  s = lines ? s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  return Array.from(s).length > max ? null : s;
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
async function readJson(request, max) {
  const buf = await readCapped(request, max);
  if (!buf) return { error: 'tamanho' };
  try {
    const v = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buf));
    return v && typeof v === 'object' && !Array.isArray(v) ? { v } : { error: 'json' };
  } catch (_) { return { error: 'json' }; }
}

// the logo: a data:image/png;base64 URL of a real PNG (signature, IHDR first, IEND last), at most 1 MB decoded
function pngOf(url) {
  const m = typeof url === 'string' && url.match(/^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!m) return { error: 'logo' };
  if (m[1].length > Math.ceil(MAX_LOGO / 3) * 4) return { error: 'logo-grande' };
  let bin;
  try { bin = atob(m[1]); } catch (_) { return { error: 'logo' }; }
  if (bin.length > MAX_LOGO) return { error: 'logo-grande' };
  const b = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const tag = (o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  if (b.length < 57 || !sig.every((x, i) => b[i] === x) || tag(12) !== 'IHDR' || tag(b.length - 8) !== 'IEND') return { error: 'logo' };
  const u32 = (o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
  const w = u32(16), h = u32(20);
  if (!w || !h || w > MAX_SIDE || h > MAX_SIDE) return { error: 'logo' };
  return { bytes: b, w, h };
}

// ---------- the spot rules (assets/js/admin-core.js: lapsed, effective, totals, sortTargets, commitMessage) ----------
const itemOf = (s) => s.item || 'suit';
const targetOf = (data, id) => (id === TITLE ? data.title : data.spots.find((s) => s.id === id));
const validData = (d) => !!d && Array.isArray(d.spots) && !!d.title && typeof d.title === 'object';
// a hold lapses on its own once its `until` day is over (UTC), as adspace.js shows it
const lapsed = (x, now) => x.status === 'reserved' && !!x.until && Date.parse(`${x.until}T23:59:59Z`) < now;
const stateOf = (x, now) => (lapsed(x, now) ? 'available' : x.status || 'available');
function sortTargets(data, ids) {
  const n = (id) => (id === TITLE ? Infinity : targetOf(data, id)?.n ?? Infinity);
  return [...new Set(ids)].sort((a, b) => n(a) - n(b));
}
// the targets that cannot be held now: reserved (a lapsed hold counts as free), sold or under the whole suit; the
// whole suit needs every suit spot free (the helmet is not part of it)
function takenOf(data, ids, now) {
  const T = stateOf(data.title, now), taken = [];
  for (const id of ids) {
    const x = targetOf(data, id);
    if (!x) { taken.push(id); continue; }
    if (id === TITLE) { if (T !== 'available' || data.spots.some((s) => itemOf(s) === 'suit' && stateOf(s, now) !== 'available')) taken.push(id); continue; }
    if (stateOf(x, now) !== 'available' || (itemOf(x) === 'suit' && T !== 'available')) taken.push(id);
  }
  return taken;
}
// the price to pay: the whole suit's price, or the spots with the bundle discount from bundle.min spots (adspace.js)
function totalOf(data, ids) {
  if (ids.includes(TITLE)) return data.title.price;
  const list = ids.map((id) => targetOf(data, id)).filter(Boolean);
  const gross = list.reduce((a, s) => a + s.price, 0);
  const disc = data.bundle && list.length >= data.bundle.min ? data.bundle.discount : 0;
  return Math.round(gross * (1 - disc));
}
const fileText = (data) => `${JSON.stringify(data, null, 2)}\n`;
// 'Espaços 01 e 21' / 'Espaço 21' / 'Fato completo', and the plural ending
function labelOf(data, ids) {
  if (ids[0] === TITLE) return ['Fato completo', ''];
  return [`${ids.length > 1 ? 'Espaços' : 'Espaço'} ${joinPT(ids.map((id) => pad2(targetOf(data, id).n)))}`, ids.length > 1 ? 's' : ''];
}
// the admin's applyAction(…, 'reserved', …) statement by statement, then the request's id
function held(raw, ids, { brand, until, id, today }) {
  const data = structuredClone(raw);
  for (const sid of ids) {
    const t = targetOf(data, sid);
    for (const k of ['brand', 'url', 'until', 'request']) delete t[k];
    t.status = 'reserved';
    delete t.logo; delete t.logoMono;
    t.brand = brand;
    t.until = until;
    t.request = id;
  }
  data.updated = today;
  return data;
}
// the spots this request still holds (the admin may have sold, freed or re-held them since)
const mine = (data, ids, id) => ids.filter((sid) => { const t = targetOf(data, sid); return t && t.status === 'reserved' && t.request === id; });
// the admin's applyAction(…, 'available', …) on those spots
function freed(raw, ids, today) {
  const data = structuredClone(raw);
  for (const sid of ids) {
    const t = targetOf(data, sid);
    for (const k of ['brand', 'url', 'until', 'request']) delete t[k];
    t.status = 'available';
    delete t.logo; delete t.logoMono;
  }
  data.updated = today;
  return data;
}
function extended(raw, ids, until, today) {
  const data = structuredClone(raw);
  for (const sid of ids) targetOf(data, sid).until = until;
  data.updated = today;
  return data;
}

// ---------- GitHub ----------
async function gh(env, method, path, body) {
  let res;
  try {
    res = await fetch(`${env.GITHUB_API || 'https://api.github.com'}/repos/${cfg(env).repo}${path}`, {
      method,
      headers: { Authorization: `Bearer ${env.SPOTS_GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': UA, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) { return { status: 0, json: null }; }
  let json = null;
  try { json = await res.json(); } catch (_) {}
  return { status: res.status, json };
}
function b64ToText(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
function textToB64(s) {
  const bytes = enc.encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
// data/spots.json at the head of gh-pages, with its blob sha (the write names it)
async function readFile(env) {
  const r = await gh(env, 'GET', `/contents/${SPOTS_PATH}?ref=${encodeURIComponent(cfg(env).branch)}`);
  if (r.status !== 200 || !r.json || typeof r.json.content !== 'string' || typeof r.json.sha !== 'string') return null;
  try { const data = JSON.parse(b64ToText(r.json.content)); return validData(data) ? { data, sha: r.json.sha } : null; } catch (_) { return null; }
}
// Reads the file, lets `decide` change it, writes it in one commit. Another commit in between (409, or 422 for a sha
// that moved on) means: read again, decide again (availability included), write again, up to RETRIES more times.
// decide(data) returns { data, message, ...extra } to write, or { stop } to end with that result and write nothing.
async function edit(env, decide) {
  for (let attempt = 0; ; attempt++) {
    const cur = await readFile(env);
    if (!cur) return { error: 'github' };
    const d = decide(cur.data);
    if (d.stop) return d.stop;
    const put = await gh(env, 'PUT', `/contents/${SPOTS_PATH}`, { message: d.message, content: textToB64(fileText(d.data)), sha: cur.sha, branch: cfg(env).branch });
    if (put.status === 200 || put.status === 201) return { ...d, ok: true, commit: (put.json && put.json.commit && put.json.commit.sha) || '' };
    if ((put.status !== 409 && put.status !== 422) || attempt >= RETRIES) return { error: put.status === 409 || put.status === 422 ? 'conflito' : 'github' };
    await sleep(120 * (attempt + 1) + Math.floor(Math.random() * 80));
  }
}

// the public file, for a first check before anything is written (cached a little: the write reads GitHub again)
const liveMemo = new WeakMap();
async function liveSpots(env) {
  const memo = liveMemo.get(env);
  if (memo && Date.now() - memo.at < 30000) return memo.data;
  try {
    const res = await fetch(`${cfg(env).site}/data/spots.json`, { headers: { 'User-Agent': UA }, cf: { cacheTtl: 30, cacheEverything: true } });
    const data = res.ok ? await res.json() : null;
    if (!validData(data)) return null;
    liveMemo.set(env, { at: Date.now(), data });
    return data;
  } catch (_) { return null; }
}

async function turnstileOk(env, token, request) {
  try {
    const body = new FormData();
    body.append('secret', env.TURNSTILE_SECRET);
    body.append('response', token);
    const ip = request.headers.get('CF-Connecting-IP');
    if (ip) body.append('remoteip', ip);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const j = await res.json();
    return !!j && j.success === true;
  } catch (_) { return false; }
}

// ---------- POST /pedido ----------
async function create(request, env) {
  if (!originOf(request, env)) return fail(request, env, 'origem', 403);
  if (!env.PEDIDOS || !env.SPOTS_GITHUB_TOKEN || !keyOk(env)) return fail(request, env, 'config', 503);
  const now = Date.now(), day = todayUTC(now), ip = await ipHash(env, request);
  const burst = `b:${ip}:${Math.floor(now / 1000 / WINDOW_S)}`;
  if (await count(env, burst) >= BURST) return fail(request, env, 'limite', 429);
  await bump(env, burst, WINDOW_S * 2);
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('Content-Type') || '')) return fail(request, env, 'json', 415);
  const { v: p, error } = await readJson(request, MAX_BODY);
  if (error) return fail(request, env, error, error === 'tamanho' ? 413 : 400);

  // a field no person sees: a bot fills it
  if (p.website !== undefined && p.website !== '') return fail(request, env, 'recusado');

  // what is asked for: some spots, or the whole suit
  const title = p.title === true;
  if (p.title !== undefined && typeof p.title !== 'boolean') return fail(request, env, 'espacos');
  const items = p.items === undefined ? [] : p.items;
  if (!Array.isArray(items) || items.length > 40 || !items.every((x) => typeof x === 'string' && /^[a-z0-9-]{1,40}$/.test(x))) return fail(request, env, 'espacos');
  if (title === items.length > 0 || new Set(items).size !== items.length) return fail(request, env, 'espacos');

  const brand = text(p.brand, CAPS.brand), name = text(p.name, CAPS.name), nif = text(p.nif, CAPS.nif), message = text(p.message, CAPS.message, true);
  if (!brand) return fail(request, env, 'marca');
  if (name === null) return fail(request, env, 'nome');
  if (nif === null || (nif && !/^[A-Za-z0-9 .\-/]+$/.test(nif))) return fail(request, env, 'nif');
  if (message === null) return fail(request, env, 'mensagem');
  if (!PAYS.includes(p.pay)) return fail(request, env, 'pagamento');
  if (p.lang !== undefined && p.lang !== 'pt' && p.lang !== 'en') return fail(request, env, 'lingua');
  if (p.channel !== undefined && p.channel !== '' && !CHANNELS.includes(p.channel)) return fail(request, env, 'canal');
  const png = pngOf(p.logo);
  if (png.error) return fail(request, env, png.error, png.error === 'logo-grande' ? 413 : 400);
  // after the fields, so a typo does not spend the buyer's one-time token
  if (env.TURNSTILE_SECRET) {
    const t = p.turnstile;
    if (typeof t !== 'string' || !t || t.length > 2048 || !(await turnstileOk(env, t, request))) return fail(request, env, 'turnstile', 403);
  }

  // one open request per IP (an open one is new and still held), three a day, a few a day for the whole site
  const openKey = `o:${ip}`, openId = await env.PEDIDOS.get(openKey);
  if (openId) {
    const prev = await env.PEDIDOS.get(`p:${openId}`, { type: 'json' });
    if (prev && prev.status === 'novo' && prev.until && Date.parse(`${prev.until}T23:59:59Z`) >= now) return fail(request, env, 'aberto', 429, { id: prev.id, until: prev.until });
  }
  const ipDay = `d:${ip}:${day}`, siteDay = `h:${day}`;
  if (await count(env, ipDay) >= PER_IP_DAY) return fail(request, env, 'limite', 429);
  if (await count(env, siteDay) >= cfg(env).holdsDay) return fail(request, env, 'limite-dia', 429);

  // the public file first: an unknown or taken spot ends here, before any write
  const live = await liveSpots(env);
  if (live) {
    const ids = title ? [TITLE] : items;
    if (!title && ids.some((id) => !targetOf(live, id))) return fail(request, env, 'espacos');
    const taken = takenOf(live, ids, now);
    if (taken.length) return fail(request, env, 'ocupado', 409, { ids: sortTargets(live, taken) });
  }

  // the request is kept first, so every request id that reaches data/spots.json has its record
  const id = newId(now), until = holdUntil(now), at = new Date(now).toISOString();
  const expiration = Math.floor(now / 1000) + KEEP_S;
  const record = {
    id, at, until, ...(title ? { title: true } : { items: [...items] }), brand, name, nif, message, pay: p.pay, lang: p.lang === 'en' ? 'en' : 'pt',
    channel: p.channel || '', total: 0, status: 'novo', logo: { w: png.w, h: png.h, bytes: png.bytes.length }, commit: '', updated: at,
    history: [{ at, action: 'pedido' }],
  };
  await env.PEDIDOS.put(`l:${id}`, png.bytes, { expiration, metadata: { type: 'image/png' } });
  await env.PEDIDOS.put(`p:${id}`, JSON.stringify(record), { expiration });
  const drop = async () => { try { await env.PEDIDOS.delete(`p:${id}`); await env.PEDIDOS.delete(`l:${id}`); } catch (_) {} };

  const res = await edit(env, (data) => {
    if (!title && items.some((sid) => !targetOf(data, sid))) return { stop: { error: 'espacos' } };
    const ids = sortTargets(data, title ? [TITLE] : items), taken = takenOf(data, ids, now);
    if (taken.length) return { stop: { taken: sortTargets(data, taken) } };
    const [label, s] = labelOf(data, ids);
    return { data: held(data, ids, { brand, until, id, today: day }), message: `${label} reservado${s} para ${brand} até ${until} (pedido ${id})`, ids, total: totalOf(data, ids) };
  });
  if (!res.ok) {
    await drop();
    if (res.taken) return fail(request, env, 'ocupado', 409, { ids: res.taken });
    if (res.error === 'espacos') return fail(request, env, 'espacos');
    return fail(request, env, res.error === 'conflito' ? 'conflito' : 'github', 502);
  }
  Object.assign(record, title ? {} : { items: res.ids }, { total: res.total, commit: res.commit });
  await env.PEDIDOS.put(`p:${id}`, JSON.stringify(record), { expiration });
  try { await env.PEDIDOS.put(openKey, id, { expirationTtl: 4 * DAY_S }); } catch (_) {}
  await bump(env, ipDay, 2 * DAY_S);
  await bump(env, siteDay, 2 * DAY_S);
  return reply(request, env, { id, until, total: res.total }, 201);
}

// ---------- the admin's calls ----------
async function admin(request, env) {
  if (!env.PEDIDOS || !keyOk(env)) return fail(request, env, 'config', 503);
  const fails = `f:${await ipHash(env, request)}:${Math.floor(Date.now() / 1000 / WINDOW_S)}`;
  if (await count(env, fails) >= AUTH_FAILS) return fail(request, env, 'limite', 429);
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)\s*$/);
  if (m && await sameSecret(m[1], env.ADMIN_KEY)) return null;
  await bump(env, fails, WINDOW_S * 2);
  return fail(request, env, 'chave', 401);
}

const idsOf = (r) => (r.title ? [TITLE] : r.items || []);
async function save(env, r) {
  const expiration = Math.max(Math.floor(Date.parse(r.at) / 1000) + KEEP_S, Math.floor(Date.now() / 1000) + 120);
  await env.PEDIDOS.put(`p:${r.id}`, JSON.stringify(r), { expiration });
}

async function list(request, env) {
  const keys = [];
  let cursor;
  do {
    const page = await env.PEDIDOS.list({ prefix: 'p:', cursor, limit: 1000 });
    keys.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && keys.length < 5000);
  keys.sort().reverse();   // an id starts with its time, so newest first
  const got = await Promise.all(keys.slice(0, 200).map((k) => env.PEDIDOS.get(k, { type: 'json' })));
  return reply(request, env, { pedidos: got.filter(Boolean), agora: new Date().toISOString() });
}

async function logo(request, env, id) {
  const bytes = await env.PEDIDOS.get(`l:${id}`, { type: 'arrayBuffer' });
  if (!bytes) return fail(request, env, 'nada', 404);
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="pedido-${id}.png"`, ...BASE, ...cors(request, env) } });
}

async function act(request, env, id) {
  const { v: b, error } = await readJson(request, 2048);
  if (error) return fail(request, env, error, error === 'tamanho' ? 413 : 400);
  if (!ACTIONS.includes(b.action)) return fail(request, env, 'acao');
  const r = await env.PEDIDOS.get(`p:${id}`, { type: 'json' });
  if (!r) return fail(request, env, 'nada', 404);
  const now = Date.now(), at = new Date(now).toISOString(), today = todayUTC(now), ids = idsOf(r);
  const step = (extra = {}) => { r.history = [...(r.history || []), { at, action: b.action, ...extra }].slice(-20); r.updated = at; };

  if (b.action === 'confirmar') {
    // the admin page has already sold the spots with its own token (logo included); this only closes the request
    if (r.status !== 'confirmado') { r.status = 'confirmado'; step(); await save(env, r); }
    return reply(request, env, { pedido: r });
  }
  if (b.action === 'cancelar' && r.status === 'cancelado') return reply(request, env, { pedido: r, freed: [] });
  if (r.status !== 'novo') return fail(request, env, 'estado', 409);

  if (b.action === 'cancelar') {
    // frees only what this request still holds
    const res = await edit(env, (data) => {
      const own = sortTargets(data, mine(data, ids, id));
      if (!own.length) return { stop: { ok: true, own: [], commit: '' } };
      const [label, s] = labelOf(data, own);
      return { data: freed(data, own, today), message: `${label} libertado${s} (pedido ${id} cancelado)`, own };
    });
    if (!res.ok) return fail(request, env, 'github', 502);
    r.status = 'cancelado';
    step(res.commit ? { commit: res.commit } : {});
    await save(env, r);
    return reply(request, env, { pedido: r, freed: res.own });
  }

  // prolongar: two more days on what this request still holds, counted from its last day (or from today, once lapsed)
  const until = addDays(r.until && r.until > today ? r.until : today, 2);
  const res = await edit(env, (data) => {
    const own = sortTargets(data, mine(data, ids, id)), lost = ids.filter((x) => !own.includes(x));
    if (!own.length) return { stop: { lost } };
    const [label] = labelOf(data, own);
    return { data: extended(data, own, until, today), message: `${label}: reserva prolongada até ${until} (pedido ${id})`, own, lost };
  });
  if (res.error) return fail(request, env, 'github', 502);
  if (!res.ok) return fail(request, env, 'ocupado', 409, { ids: res.lost });
  r.until = until;
  step({ until, commit: res.commit });
  await save(env, r);
  return reply(request, env, { pedido: r, extended: res.own, lost: res.lost });
}
