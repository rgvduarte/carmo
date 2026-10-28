// Booking requests and sponsor contracts for gocarmo.com: a Cloudflare Worker (module syntax). Its one import,
// ../assets/js/season-rules.js (the season's dates and THE price, shared with the site and the admin), is bundled by
// wrangler at deploy time. Deployed to its workers.dev address by .github/workflows/deploy-pedidos.yml; the secrets
// and how to switch it on are in worker/README.md.
//
//   POST /pedido              the site's booking dialog. Holds the spots for 48 h in data/spots.json on gh-pages (one
//                             commit, GitHub contents API, SPOTS_GITHUB_TOKEN) and keeps the request and its logo in KV
//                             for 180 days. JSON in, 201 { id, until, total, m, seasonBp, day } out. The total is
//                             quote(data, ids, { day }).net of season-rules.js, day = the Lisbon date of the request,
//                             so it is the site's total to the euro. From the day after seasonRules.requestsUntil:
//                             409 { error: 'epoca', season, until }.
//   GET  /pedidos             (admin) the requests kept, newest first, without the logos
//   GET  /pedidos/<id>/logo   (admin) the request's logo, a PNG
//   POST /pedidos/<id>        (admin) { action: 'confirmar' | 'cancelar' | 'prolongar', bloquear?: true (with cancelar),
//                             paidAt?: 'YYYY-MM-DD', amount?: euros (with confirmar) }. confirmar also creates the
//                             sponsor contract c:<id> once (the same call again creates it if KV failed the first time)
//   GET  /contratos           (admin) the sponsor contracts, newest payment first
//   POST /contratos           (admin) a contract entered by hand (a deal by email, WhatsApp, in kind)
//   POST /contratos/<id>      (admin) { action: 'editar' | 'renovacao' | 'apagar', ... }
//   GET  /estado              which pieces are set up (true / false only), for the deploy check
//
// Admin calls carry "Authorization: Bearer <ADMIN_KEY>". A request holds a name and a NIF, so: it expires from KV after
// 180 days, only an admin call returns it, the address it came from is kept only as a keyed hash (of its /64 for IPv6),
// nothing is ever logged, and an error is { error: '<code>' } with nothing of the request in it. A contract record
// (KV c:<id>) holds the brand, the spots, the amount paid, the contact and the NIF if given, never an address hash or a
// logo; it expires at contractExpiry(season): the end of 31 December of the year after its season.
//
// Against one person holding everything: at most MAX_ITEMS spots in a request (the whole suit is `title: true`), at
// most MAX_HELD spots held at once by the site's unpaid requests (counted in data/spots.json inside the sha-checked
// write, so parallel requests cannot pass it; the whole suit fills it alone), one open request per address (two with
// Turnstile), three a day, and a 7-day pause for an address whose request was cancelled or lapsed unpaid. The admin can
// block an address for 30 days (cancelar with bloquear). Bursts are counted by Cloudflare's rate-limiting bindings
// (wrangler.toml), which cost no KV writes; a request rejected by the cheap checks writes nothing to KV.
//
// The file is written as the admin page (assets/js/admin-core.js, applyAction) and the issue-form bot
// (scripts/spot-update.mjs) write it: JSON.stringify(data, null, 2) and a newline, the same keys in the same order,
// plus "request": <id> on each held spot. Any later admin action on that spot drops the "request" key. Keys the Worker
// does not know ("seasonRules" among them) keep their place and value.

import { TITLE, quote, rulesOf, defaultRules, lisbonDay, addDays, salesOpen, seasonMonth, levelOf, contractExpiry } from '../assets/js/season-rules.js';

// The first Lisbon date builds an Intl time-zone formatter, about 13 ms of CPU once per isolate, and the first price
// compiles the rules: both done here, in the global scope (the isolate's start-up, which has its own limit), so no
// request spends them out of the 10 ms of Workers Free.
quote({ season: '2027', spots: [{ id: 'a', n: 1, price: 10 }, { id: 'b', n: 2, price: 10 }, { id: 'c', n: 3, price: 10 }], title: { price: 30 }, bundle: { min: 3, discount: 0.1 }, tiers: [{ key: 'x', min: 0 }] }, ['a', 'b', 'c'], { day: lisbonDay(0) });

const DAY_S = 86400;
const KEEP_S = 180 * DAY_S;              // a request and its logo live 180 days in KV
const HOLD_H = 48;
const MAX_BODY = 600 * 1024;             // the whole POST (a 400 KB logo is 534 KB of base64)
const MAX_LOGO = 400 * 1024;             // the logo, decoded: small enough for the 10 ms of CPU of Workers Free
const MAX_SIDE = 4096;                   // px, either side of the logo
const CAPS = { brand: 60, name: 80, nif: 20, message: 2000 };   // characters, after trimming
const MAX_ITEMS = 6;                     // spots in one request; more only as the whole suit (title: true)
const MAX_HELD = 8;                      // spots held at once by the site's unpaid requests (MAX_HELD in wrangler.toml)
const PER_IP_DAY = 3;                    // requests placed per address per UTC day
const COOL_S = 7 * DAY_S;                // an address whose request was cancelled or lapsed unpaid waits this long
const BLOCK_S = 30 * DAY_S;              // «bloquear»: that address places no request for 30 days
const RECENT = 5;                        // requests remembered per address (o:<hash>), for the open / pause checks
const RETRIES = 3;                       // a write that lost the race to another commit is tried again 3 times
const PAYS = ['mb', 'tr'];
const CHANNELS = ['whatsapp', 'email', 'instagram', 'site'];
const ACTIONS = ['confirmar', 'cancelar', 'prolongar'];
// contracts (KV c:<id>)
const MAX_CONTRACTS = 900;               // records kept at once: GET /contratos reads each one, and a Worker call may
                                         // make at most 1 000 KV operations
const CONTRACT_BODY = 8192;              // bytes, a contract call's JSON
const CONTRACT_ACTIONS = ['editar', 'renovacao', 'apagar'];
const PAY_KINDS = ['mb', 'tr', 'produto', 'outro'];
const CONTACT_CHANNELS = ['whatsapp', 'email', 'instagram', 'site', 'telefone', 'pessoal', 'outro', ''];
const RENEWAL_STEPS = ['', 'proposta', 'renova', 'nao-renova'];
const FIRST_PAID = '2026-01-01';         // the earliest payment date a contract may carry
const MAX_AMOUNT = 100000;               // euros
const HISTORY = 50;                      // history entries kept on a contract
const SPOTS_PATH = 'data/spots.json';
const ID_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const ID_RE = /^[0-9A-Z]{10}$/;
const UA = 'gocarmo-pedidos';
const PNG_PREFIX = 'data:image/png;base64,';

const cfg = (env) => ({
  site: env.SITE_ORIGIN || 'https://gocarmo.com',
  repo: env.REPO || 'rgvduarte/carmo',
  branch: env.BRANCH || 'gh-pages',
  maxHeld: Number(env.MAX_HELD) > 0 ? Math.floor(Number(env.MAX_HELD)) : MAX_HELD,
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
    return reply(request, env, { ok: true, kv: !!env.PEDIDOS, github: !!env.SPOTS_GITHUB_TOKEN, admin: keyOk(env), turnstile: !!env.TURNSTILE_SECRET, limites: !!env.RL_PEDIDO && !!env.RL_ADMIN, contratos: !!env.PEDIDOS });
  }
  if (path === '/pedido') return method === 'POST' ? create(request, env) : reply(request, env, { error: 'metodo' }, 405);
  const m = path.match(/^\/pedidos(?:\/([^/]+)(\/logo)?)?$/), c = path.match(/^\/contratos(?:\/([^/]+))?$/);
  if (!m && !c) return reply(request, env, { error: 'nada' }, 404);
  // the admin's calls, /pedidos and /contratos alike: the site's Origin (or none, as curl), the burst limit, the key
  if (request.headers.get('Origin') && !originOf(request, env)) return reply(request, env, { error: 'origem' }, 403);
  const denied = await admin(request, env);
  if (denied) return denied;
  if (c) {
    if (c[1] && !ID_RE.test(c[1])) return reply(request, env, { error: 'nada' }, 404);
    if (!c[1] && method === 'GET') return listContracts(request, env);
    if (!c[1] && method === 'POST') return createContract(request, env);
    if (c[1] && method === 'POST') return actContract(request, env, c[1]);
    return reply(request, env, { error: 'metodo' }, 405);
  }
  if (m[1] && !ID_RE.test(m[1])) return reply(request, env, { error: 'nada' }, 404);
  if (!m[1] && method === 'GET') return list(request, env);
  if (m[1] && m[2] && method === 'GET') return logo(request, env, m[1]);
  if (m[1] && !m[2] && method === 'POST') return act(request, env, m[1]);
  return reply(request, env, { error: 'metodo' }, 405);
}

// ---------- responses ----------
// https://gocarmo.com only. DEV_ORIGIN (one origin, or several split by commas) adds a local copy of the site for
// tests: it is set in worker/.dev.vars, which only `wrangler dev` reads, never in wrangler.toml, so the deployed
// Worker answers gocarmo.com and nothing else.
function originOf(request, env) {
  const o = request.headers.get('Origin');
  if (!o) return '';
  if (o === cfg(env).site) return o;
  return String(env.DEV_ORIGIN || '').split(',').map((x) => x.trim()).filter(Boolean).includes(o) ? o : '';
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
// a real calendar day 'YYYY-MM-DD'
function isDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}
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
// The address a request comes from, as the limits see it: an IPv4 address whole, an IPv6 address by its /64 (one
// client is given a whole /64, so the full address would let it change at will). Kept only as a keyed hash.
function bucketOf(ip) {
  const a = String(ip || '').trim().toLowerCase().split('%')[0];
  if (!a) return 'sem-ip';
  const v4 = a.match(/^(?:(?:0{0,4}:){0,5}ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/);   // also ::ffff:1.2.3.4
  if (v4) return v4[1];
  if (!a.includes(':')) return a;
  const [head, tail] = a.split('::');
  const h = head ? head.split(':') : [], t = tail === undefined ? null : tail ? tail.split(':') : [];
  const all = t === null ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return `${all.slice(0, 4).map((x) => (/^[0-9a-f]{1,4}$/.test(x) ? parseInt(x, 16).toString(16) : '0')).join(':')}::/64`;
}
const ipHash = (env, request) => hmacHex(env.ADMIN_KEY, bucketOf(request.headers.get('CF-Connecting-IP')));
async function count(env, key) { return Number(await env.PEDIDOS.get(key)) || 0; }
// Cloudflare's rate-limiting binding (wrangler.toml [[ratelimits]]): no KV writes. Without the binding (tests, an
// older deploy), no burst limit: the KV limits below still hold.
async function burstOk(limiter, key) {
  if (!limiter || typeof limiter.limit !== 'function') return true;
  try { const r = await limiter.limit({ key }); return !r || r.success !== false; } catch (_) { return true; }
}
function newId(now) {
  const rnd = crypto.getRandomValues(new Uint8Array(4));
  return Math.floor(now / 1000).toString(36).toUpperCase().padStart(6, '0').slice(-6) + Array.from(rnd, (b) => ID_CHARS[b % ID_CHARS.length]).join('');
}
// text from the site: a string (or nothing), no control characters, spaces collapsed (the message keeps its line
// breaks); null when it is not text or is longer than `max` characters. The invisible format characters (zero-width
// spaces and joiners, the direction marks, the word joiner and the byte-order mark) go without a trace: «Build\u200bity»
// is stored as «Buildity», the brand the admin finds and compares, and the PDFs can write
const INVISIBLE = /[\u061c\u200b-\u200f\u2060-\u2064\ufeff]/g;
function text(v, max, lines = false) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') return null;
  let s = v.normalize('NFC').replace(INVISIBLE, '').replace(lines ? /\r\n?/g : /[\r\n]+/g, lines ? '\n' : ' ');
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

// the logo: a data:image/png;base64 URL of a real PNG (signature, IHDR first, IEND last), at most MAX_LOGO decoded.
// No regex over the whole string and atob judges the base64: a big logo costs little CPU.
function pngOf(url) {
  if (typeof url !== 'string' || !url.startsWith(PNG_PREFIX)) return { error: 'logo' };
  const b64 = url.slice(PNG_PREFIX.length);
  if (b64.length > Math.ceil(MAX_LOGO / 3) * 4) return { error: 'logo-grande' };
  let b;
  try {
    if (typeof Uint8Array.fromBase64 === 'function') b = Uint8Array.fromBase64(b64);
    else {
      const bin = atob(b64);
      b = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    }
  } catch (_) { return { error: 'logo' }; }
  if (b.length > MAX_LOGO) return { error: 'logo-grande' };
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
const holdEnd = (until) => Date.parse(`${until}T23:59:59Z`);
// the spots held now by the site's requests that nobody has paid for yet (an admin action drops "request"); a held
// whole suit counts as the whole cap
function siteHeld(data, now, cap) {
  const open = (x) => x && x.status === 'reserved' && !!x.request && !lapsed(x, now);
  if (open(data.title)) return cap;
  return data.spots.filter(open).length;
}
// what a request adds to that count
const unitsOf = (ids, cap) => (ids.includes(TITLE) ? cap : ids.length);
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
// The price to pay is season-rules.js quote(data, ids, { day }).net, the site's own function: the season discount
// («desconto de época», m/48 of the price, m = the month of the request in Lisbon, 0 up to fullPriceUntil), then the
// bundle discount, then one rounding to whole euros, half up. What a request or a contract keeps of it:
const priceOf = (q) => ({ day: q.day, gross: q.gross, m: q.m, seasonBp: q.seasonBp, discPct: q.discPct, total: q.net });
// the targets as they are priced and named now, kept with a request (and its contract) so a confirmation months later
// depends on neither renamed spots nor a new price table
function snapshotOf(data, ids) {
  return ids.map((id) => {
    if (id === TITLE) return { id: TITLE, n: 0, name: 'Fato completo', item: 'suit', price: Number(data.title.price) || 0 };
    const s = targetOf(data, id);
    return s ? { id: s.id, n: s.n, name: (s.pt && s.pt.name) || s.id, item: itemOf(s), price: Number(s.price) || 0 } : null;
  }).filter(Boolean);
}
// data with the prices of a snapshot: a contract's price is computed on what was asked, not on today's table
function pricedAs(data, spots) {
  const at = new Map(spots.map((x) => [x.id, x.price]));
  return { ...data, title: at.has(TITLE) ? { ...data.title, price: at.get(TITLE) } : data.title, spots: data.spots.map((s) => (at.has(s.id) ? { ...s, price: at.get(s.id) } : s)) };
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
const sameBrand = (a, b) => String(a || '').toLowerCase().replace(/\s+/g, ' ').trim() === String(b || '').toLowerCase().replace(/\s+/g, ' ').trim();
const pub = (r) => { if (!r) return r; const { ip, ...rest } = r; return rest; };   // the address hash never leaves
async function readList(env, key) {
  try { const v = await env.PEDIDOS.get(key, { type: 'json' }); return Array.isArray(v) ? v.filter((x) => typeof x === 'string' && ID_RE.test(x)) : []; } catch (_) { return []; }
}

async function create(request, env) {
  if (!originOf(request, env)) return fail(request, env, 'origem', 403);
  if (!env.PEDIDOS || !env.SPOTS_GITHUB_TOKEN || !keyOk(env)) return fail(request, env, 'config', 503);
  // day: the UTC date (the per-address day count and the file's "updated", as before); lday: the Lisbon date of the
  // request, the one its price and the season's dates go by
  const now = Date.now(), day = todayUTC(now), lday = lisbonDay(now), ip = await ipHash(env, request), C = cfg(env);
  if (!(await burstOk(env.RL_PEDIDO, ip))) return fail(request, env, 'limite', 429);

  // the cheap checks first: a request that fails them writes nothing to KV
  if (!/^application\/json\s*(;|$)/i.test(request.headers.get('Content-Type') || '')) return fail(request, env, 'json', 415);
  const { v: p, error } = await readJson(request, MAX_BODY);
  if (error) return fail(request, env, error, error === 'tamanho' ? 413 : 400);

  // a field no person sees: a bot fills it
  if (p.website !== undefined && p.website !== '') return fail(request, env, 'recusado');

  // what is asked for: some spots (ids of data.spots, never the whole suit's 'fato'), or the whole suit
  const title = p.title === true;
  if (p.title !== undefined && typeof p.title !== 'boolean') return fail(request, env, 'espacos');
  const items = p.items === undefined ? [] : p.items;
  if (!Array.isArray(items) || items.length > 40 || !items.every((x) => typeof x === 'string' && x !== TITLE && /^[a-z0-9-]{1,40}$/.test(x))) return fail(request, env, 'espacos');
  if (title === items.length > 0 || new Set(items).size !== items.length) return fail(request, env, 'espacos');
  if (items.length > MAX_ITEMS) return fail(request, env, 'muitos', 400, { max: MAX_ITEMS });

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

  // the address: blocked by the admin, one open request (two with Turnstile), a pause after a cancelled or lapsed one,
  // three a day. Reads only.
  if (await env.PEDIDOS.get(`x:${ip}`)) return fail(request, env, 'limite', 429);
  const openKey = `o:${ip}`, recentIds = await readList(env, openKey);
  const recent = (await Promise.all(recentIds.map((rid) => env.PEDIDOS.get(`p:${rid}`, { type: 'json' }).catch(() => null)))).filter(Boolean);
  const open = recent.filter((r) => r.status === 'novo' && r.until && holdEnd(r.until) >= now);
  if (open.length >= (env.TURNSTILE_SECRET ? 2 : 1)) {
    // the same buyer again (a lost answer): its request (this very package's first, with Turnstile's two), with what it
    // holds, so the site takes it for its own only when it is the same package (that address and brand may have another
    // request open, for other spots)
    const theirs = open.filter((r) => sameBrand(r.brand, brand));
    const samePkg = (r) => (title ? r.title === true : !r.title && Array.isArray(r.items) && r.items.length === items.length && items.every((x) => r.items.includes(x)));
    const own = theirs.find(samePkg) || theirs[0];
    // with its price, so the site shows that request's total (a request kept from before the seasons: m = 0)
    return fail(request, env, 'aberto', 429, own ? { id: own.id, until: own.until, ...(own.title ? { title: true } : { items: own.items || [] }), ...priceSeen(own) } : {});
  }
  const paused = recent.some((r) => (r.status === 'cancelado' && now - Date.parse(r.closed || r.updated || r.at) < COOL_S * 1000)
    || (r.status === 'novo' && r.until && holdEnd(r.until) < now && now - holdEnd(r.until) < COOL_S * 1000));
  if (paused) return fail(request, env, 'limite', 429);
  const ipDay = `d:${ip}:${day}`, dayCount = await count(env, ipDay);
  if (dayCount >= PER_IP_DAY) return fail(request, env, 'limite', 429);

  // the public file first: a closed season, an unknown or taken spot, or a site already full of unpaid holds, ends here
  const ids0 = title ? [TITLE] : items, live = await liveSpots(env);
  if (live) {
    const rules = rulesOf(live);
    if (!salesOpen(rules, lday)) return fail(request, env, 'epoca', 409, { season: rules.season, until: rules.requestsUntil });
    if (!title && ids0.some((id) => !live.spots.some((s) => s.id === id))) return fail(request, env, 'espacos');
    const taken = takenOf(live, ids0, now);
    if (taken.length) return fail(request, env, 'ocupado', 409, { ids: sortTargets(live, taken) });
    if (siteHeld(live, now, C.maxHeld) + unitsOf(ids0, C.maxHeld) > C.maxHeld) return fail(request, env, 'limite-site', 429);
  }

  // Claim before the commit: the record, the logo and the address's counters go to KV first, so a parallel request from
  // the same address sees this one as open. Any of these failing (KV out of writes) ends here, with nothing held.
  const id = newId(now), until = holdUntil(now), at = new Date(now).toISOString();
  const expiration = Math.floor(now / 1000) + KEEP_S;
  // the price of the public file for now; the write below sets it from the committed file
  const q0 = live ? quote(live, ids0, { day: lday }) : null;
  const record = {
    id, at, until, ...(title ? { title: true } : { items: [...items] }), brand, name, nif, message, pay: p.pay, lang: p.lang === 'en' ? 'en' : 'pt',
    channel: p.channel || '', total: q0 ? q0.net : 0,
    season: q0 ? q0.season : '', day: lday, m: q0 ? q0.m : 0, seasonBp: q0 ? q0.seasonBp : 0, gross: q0 ? q0.gross : 0, discPct: q0 ? q0.discPct : 0,
    terms: live ? rulesOf(live).termsDate : '', prices: live ? snapshotOf(live, ids0) : [],
    status: 'novo', logo: { w: png.w, h: png.h, bytes: png.bytes.length }, commit: '', updated: at, ip,
    history: [{ at, action: 'pedido' }],
  };
  const undo = async () => {
    for (const k of [`p:${id}`, `l:${id}`]) { try { await env.PEDIDOS.delete(k); } catch (_) {} }
    try {
      const cur = await readList(env, openKey);
      if (cur.includes(id)) {
        const rest = cur.filter((x) => x !== id);
        if (rest.length) await env.PEDIDOS.put(openKey, JSON.stringify(rest), { expirationTtl: BLOCK_S }); else await env.PEDIDOS.delete(openKey);
      }
    } catch (_) {}
    try {
      const n = await count(env, ipDay);
      if (n > 1) await env.PEDIDOS.put(ipDay, String(n - 1), { expirationTtl: 2 * DAY_S }); else await env.PEDIDOS.delete(ipDay);
    } catch (_) {}
  };
  try {
    await env.PEDIDOS.put(openKey, JSON.stringify([id, ...recentIds.filter((x) => x !== id)].slice(0, RECENT)), { expirationTtl: BLOCK_S });
    await env.PEDIDOS.put(ipDay, String(dayCount + 1), { expirationTtl: 2 * DAY_S });
    await env.PEDIDOS.put(`l:${id}`, png.bytes, { expiration, metadata: { type: 'image/png' } });
    await env.PEDIDOS.put(`p:${id}`, JSON.stringify(record), { expiration });
  } catch (_) {
    await undo();
    return fail(request, env, 'interno', 503);
  }

  // the write: data/spots.json at the head of gh-pages, every rule checked again on what is there now
  const res = await edit(env, (data) => {
    const rules = rulesOf(data);
    if (!salesOpen(rules, lday)) return { stop: { error: 'epoca', season: rules.season, until: rules.requestsUntil } };
    if (!title && items.some((sid) => !data.spots.some((s) => s.id === sid))) return { stop: { error: 'espacos' } };
    const ids = sortTargets(data, title ? [TITLE] : items), taken = takenOf(data, ids, now);
    if (taken.length) return { stop: { taken: sortTargets(data, taken) } };
    if (siteHeld(data, now, C.maxHeld) + unitsOf(ids, C.maxHeld) > C.maxHeld) return { stop: { error: 'limite-site' } };
    const [label, s] = labelOf(data, ids), q = quote(data, ids, { day: lday });
    return {
      data: held(data, ids, { brand, until, id, today: day }), message: `${label} reservado${s} para ${brand} até ${until} (pedido ${id})`, ids,
      price: { total: q.net, season: q.season, m: q.m, seasonBp: q.seasonBp, gross: q.gross, discPct: q.discPct, terms: rules.termsDate, prices: snapshotOf(data, ids), level: levelOf(data, ids) },
    };
  });
  if (!res.ok) {
    await undo();
    if (res.error === 'epoca') return fail(request, env, 'epoca', 409, { season: res.season, until: res.until });
    if (res.taken) return fail(request, env, 'ocupado', 409, { ids: res.taken });
    if (res.error === 'espacos') return fail(request, env, 'espacos');
    if (res.error === 'limite-site') return fail(request, env, 'limite-site', 429);
    return fail(request, env, res.error === 'conflito' ? 'conflito' : 'github', 502);
  }
  // the spots are held: whatever KV says now, the answer is 201 (the record is there already, with the price of the
  // public file; this only brings in the price of the committed file and the commit of the write)
  Object.assign(record, title ? {} : { items: res.ids }, res.price, { commit: res.commit });
  try { await env.PEDIDOS.put(`p:${id}`, JSON.stringify(record), { expiration }); } catch (_) {}
  return reply(request, env, { id, until, total: record.total, m: record.m, seasonBp: record.seasonBp, day: lday }, 201);
}
// the price of a kept request, as the site shows it: { total, m, seasonBp, day } (one from before the seasons: m = 0)
const priceSeen = (r) => ({ total: Number(r.total) || 0, m: Number.isInteger(r.m) ? r.m : 0, seasonBp: Number.isInteger(r.seasonBp) ? r.seasonBp : 0, day: r.day || lisbonDay(Date.parse(r.at) || Date.now()) });

// ---------- the admin's calls ----------
// The burst of calls per address goes to the rate-limiting binding before the key is compared: no KV writes, so a
// flood of wrong keys cannot spend the account's KV writes.
async function admin(request, env) {
  if (!env.PEDIDOS || !keyOk(env)) return fail(request, env, 'config', 503);
  if (!(await burstOk(env.RL_ADMIN, await ipHash(env, request)))) return fail(request, env, 'limite', 429);
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(\S+)\s*$/);
  if (m && await sameSecret(m[1], env.ADMIN_KEY)) return null;
  return fail(request, env, 'chave', 401);
}

const idsOf = (r) => (r.title ? [TITLE] : r.items || []);
async function save(env, r) {
  const expiration = Math.max(Math.floor(Date.parse(r.at) / 1000) + KEEP_S, Math.floor(Date.now() / 1000) + 120);
  await env.PEDIDOS.put(`p:${r.id}`, JSON.stringify(r), { expiration });
}
// after a commit: the record follows if KV lets it; if not, the same action again later finds the file already done
// and only saves the record (cancelar and prolongar are both safe to repeat)
async function saveAfter(env, r) { try { await save(env, r); return true; } catch (_) { return false; } }

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
  return reply(request, env, { pedidos: got.filter(Boolean).map(pub), agora: new Date().toISOString() });
}

async function logo(request, env, id) {
  const bytes = await env.PEDIDOS.get(`l:${id}`, { type: 'arrayBuffer' });
  if (!bytes) return fail(request, env, 'nada', 404);
  return new Response(bytes, { headers: { 'Content-Type': 'image/png', 'Content-Disposition': `inline; filename="pedido-${id}.png"`, ...BASE, ...cors(request, env) } });
}

// «bloquear»: the address of that request places no request for 30 days (only its keyed hash is known)
async function block(env, r) {
  if (!r.ip) return false;
  try { await env.PEDIDOS.put(`x:${r.ip}`, '1', { expirationTtl: BLOCK_S }); return true; } catch (_) { return false; }
}

async function act(request, env, id) {
  const { v: b, error } = await readJson(request, 2048);
  if (error) return fail(request, env, error, error === 'tamanho' ? 413 : 400);
  if (!ACTIONS.includes(b.action)) return fail(request, env, 'acao');
  if (b.bloquear !== undefined && (typeof b.bloquear !== 'boolean' || b.action !== 'cancelar')) return fail(request, env, 'acao');
  if ((b.paidAt !== undefined || b.amount !== undefined) && b.action !== 'confirmar') return fail(request, env, 'acao');
  const now = Date.now(), at = new Date(now).toISOString(), today = todayUTC(now), lday = lisbonDay(now);
  if (b.paidAt !== undefined && !paidOk(b.paidAt, lday)) return fail(request, env, 'campos', 400, { campo: 'paidAt' });
  if (b.amount !== undefined && !amountOk(b.amount)) return fail(request, env, 'campos', 400, { campo: 'amount' });
  const r = await env.PEDIDOS.get(`p:${id}`, { type: 'json' });
  if (!r) return fail(request, env, 'nada', 404);
  const ids = idsOf(r);
  const step = (extra = {}) => { r.history = [...(r.history || []), { at, action: b.action, ...extra }].slice(-20); r.updated = at; };

  if (b.action === 'confirmar') return confirm(request, env, r, { paidAt: b.paidAt === undefined ? lday : b.paidAt, amount: b.amount === undefined ? Number(r.total) || 0 : b.amount, now, step });
  if (b.action === 'cancelar' && r.status === 'cancelado') {
    const blocked = b.bloquear === true ? await block(env, r) : false;
    if (blocked && !r.blocked) { r.blocked = true; step({ bloquear: true }); await saveAfter(env, r); }
    return reply(request, env, { pedido: pub(r), freed: [], blocked });
  }
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
    const blocked = b.bloquear === true ? await block(env, r) : false;
    r.status = 'cancelado'; r.closed = at;
    if (blocked) r.blocked = true;
    step({ ...(res.commit ? { commit: res.commit } : {}), ...(blocked ? { bloquear: true } : {}) });
    await saveAfter(env, r);
    return reply(request, env, { pedido: pub(r), freed: res.own, blocked });
  }

  // prolongar: two more days on what this request still holds, counted from its last day (or from today, once lapsed).
  // Spots already at that date are not written again (a repeat after a record that did not save).
  const until = addDays(r.until && r.until > today ? r.until : today, 2);
  const res = await edit(env, (data) => {
    const own = sortTargets(data, mine(data, ids, id)), lost = ids.filter((x) => !own.includes(x));
    if (!own.length) return { stop: { lost } };
    if (own.every((sid) => targetOf(data, sid).until === until)) return { stop: { ok: true, own, lost, commit: '' } };
    const [label] = labelOf(data, own);
    return { data: extended(data, own, until, today), message: `${label}: reserva prolongada até ${until} (pedido ${id})`, own, lost };
  });
  if (res.error) return fail(request, env, 'github', 502);
  if (!res.ok) return fail(request, env, 'ocupado', 409, { ids: res.lost });
  r.until = until;
  step({ until, ...(res.commit ? { commit: res.commit } : {}) });
  await saveAfter(env, r);
  return reply(request, env, { pedido: pub(r), extended: res.own, lost: res.lost });
}

// ---------- confirmar: the request closes, the sponsor contract begins ----------
// The admin page has already sold the spots with its own token (logo included); this closes the request (a paid request
// needs no address any more) and creates its contract c:<id> once. Allowed on a request confirmed before contracts
// existed: that is how one gets its record. The contract goes to KV before the request, so the request's "contract"
// always names a record that exists: two writes. If the contract cannot be written, the request still closes and the
// answer says contrato: null, erro: 'contrato'; the same call again creates it.
async function confirm(request, env, r, { paidAt, amount, now, step }) {
  const at = new Date(now).toISOString(), id = r.id;
  const closing = r.status !== 'confirmado' || !!r.ip;
  if (closing) { r.status = 'confirmado'; r.closed = r.closed || at; delete r.ip; step({ paidAt, amount }); }
  let contrato = null, criado = false;
  try {
    contrato = await env.PEDIDOS.get(`c:${id}`, { type: 'json' });
    if (!contrato) {
      const c = contractOfRequest(r, await spotsData(env), { paidAt, amount, at });
      if (c) { await putContract(env, c, now); contrato = c; criado = true; }
    }
  } catch (_) { contrato = null; criado = false; }
  const linked = !!contrato && r.contract !== id;
  if (linked) { r.contract = id; r.updated = at; }
  if (closing || linked) await save(env, r);
  return reply(request, env, { pedido: pub(r), contrato, criado, ...(contrato ? {} : { erro: 'contrato' }) });
}

// ---------- contracts (KV c:<id>) ----------
// A payment date: a real day from FIRST_PAID to tomorrow (Lisbon), so a payment entered just after midnight elsewhere fits
const paidOk = (d, lday) => isDate(d) && d >= FIRST_PAID && d <= addDays(lday, 1);
const amountOk = (n) => Number.isInteger(n) && n >= 0 && n <= MAX_AMOUNT;
// the rules of a contract's season: the file's when it is the file's season, else that season's defaults
const rulesFor = (data, season) => (data && rulesOf(data).season === String(season) ? rulesOf(data) : defaultRules(season));
// what the price table asked for these targets on `day`, with the prices of the snapshot `spots`: the season month m
// comes from the contract's season (its rules, or that season's defaults), so a 2028 deal entered in 2027 pays m = 0.
// m0 forces it (a request from before the seasons: 0).
function contractQuote(data, season, ids, spots, day, m0) {
  const m = Number.isInteger(m0) ? m0 : seasonMonth(rulesFor(data, season), day);
  return quote(pricedAs(data, spots), ids, { day, m });
}
const targetsOfContract = (c) => (c.title ? [TITLE] : (c.spots || []).map((x) => x.id).filter((x) => x !== TITLE));
// data/spots.json for a contract: the public file, else the GitHub copy
async function spotsData(env) {
  const live = await liveSpots(env);
  if (live) return live;
  const cur = env.SPOTS_GITHUB_TOKEN ? await readFile(env) : null;
  return cur ? cur.data : null;
}
async function putContract(env, c, now) {
  // the end of 31 December of the year after the season; never less than two minutes ahead (KV refuses a past time)
  const expiration = Math.max(contractExpiry(c.season), Math.floor(now / 1000) + 120);
  await env.PEDIDOS.put(`c:${c.id}`, JSON.stringify(c), { expiration });
}
function contractShape({ id, kind, request, season, rules, brand, url = '', title, spots, label = '', level, price, amount, paidAt, pay, inKind = '', contact = {}, nif = '', lang = 'pt', logo = {}, notes = '', terms, at, from }) {
  return {
    v: 1, id, kind, request, season,
    period: { start: rules.start, end: rules.end },
    dates: { logoBy: rules.logoBy, proposalsFrom: rules.proposalsFrom, renewBy: rules.renewBy, openFrom: rules.openFrom },
    brand, url, title, spots, label, level, price, amount, paidAt, pay, inKind,
    contact: { name: contact.name || '', channel: contact.channel || '', email: contact.email || '', phone: contact.phone || '', handle: contact.handle || '' },
    nif, lang, logo: { vector: logo.vector === true, fromRace: logo.fromRace || '' },
    renewal: { state: '', at: '' }, notes, terms, created: at, updated: at,
    history: [{ at, action: 'criado', from }],
  };
}
// the contract of a site request: its price snapshot (a request from before contracts: the file's spots now)
function contractOfRequest(r, data, { paidAt, amount, at }) {
  const ids = idsOf(r), season = String(r.season || (data ? rulesOf(data).season : ''));
  if (!/^\d{4}$/.test(season)) return null;
  const spots = Array.isArray(r.prices) && r.prices.length ? r.prices : data ? snapshotOf(data, ids) : [];
  if (!spots.length) return null;
  let price;
  if (Number.isInteger(r.m)) price = { day: r.day, gross: r.gross, m: r.m, seasonBp: Number(r.seasonBp) || 0, discPct: r.discPct, total: Number(r.total) || 0 };
  // a request from before this change (all made in 2026): no season discount, m = 0, its own total
  else if (data) price = { ...priceOf(contractQuote(data, season, ids, spots, lisbonDay(Date.parse(r.at) || Date.now()), 0)), ...(r.total ? { total: Number(r.total) } : {}) };
  else return null;
  const level = r.level || (data ? levelOf(pricedAs(data, spots), ids) : '');
  return contractShape({
    id: r.id, kind: 'site', request: r.id, season, rules: rulesFor(data, season), brand: r.brand, title: r.title === true, spots, level, price,
    amount, paidAt, pay: r.pay, contact: { name: r.name || '', channel: r.channel || '' }, nif: r.nif || '', lang: r.lang === 'en' ? 'en' : 'pt',
    terms: r.terms || '', at, from: 'pedido',
  });
}

// The fields of a contract call, checked and cleaned: { set } with the values given, or { campo } naming the first bad
// one. create: brand, season, amount, paidAt and pay are required.
function contractInput(p, data, lday, create) {
  const set = {}, has = (k) => p[k] !== undefined, bad = (campo) => ({ campo });
  if (create || has('season')) {
    // '2027' (or 2027): the file's season or the next one
    const y = typeof p.season === 'string' || Number.isInteger(p.season) ? String(p.season) : '', live = rulesOf(data).season;
    if (!/^\d{4}$/.test(y) || (y !== live && y !== String(Number(live) + 1))) return bad('season');
    set.season = y;
  }
  if (create || has('brand')) { const v = text(p.brand, CAPS.brand); if (!v) return bad('brand'); set.brand = v; }
  if (has('label')) { const v = text(p.label, 80); if (v === null) return bad('label'); set.label = v; }
  if (has('title')) { if (typeof p.title !== 'boolean') return bad('title'); set.title = p.title; }
  if (has('items')) {
    const xs = p.items;
    if (!Array.isArray(xs) || xs.length > 24 || new Set(xs).size !== xs.length || !xs.every((x) => typeof x === 'string' && x !== TITLE && data.spots.some((s) => s.id === x))) return bad('items');
    set.items = sortTargets(data, xs);
  }
  if (create || has('amount')) { if (!amountOk(p.amount)) return bad('amount'); set.amount = p.amount; }
  if (create || has('paidAt')) { if (!paidOk(p.paidAt, lday)) return bad('paidAt'); set.paidAt = p.paidAt; }
  if (create || has('pay')) { if (!PAY_KINDS.includes(p.pay)) return bad('pay'); set.pay = p.pay; }
  if (has('inKind')) { const v = text(p.inKind, 200); if (v === null) return bad('inKind'); set.inKind = v; }
  if (has('url')) {
    const v = text(p.url, 200);
    if (v === null) return bad('url');
    if (v) { let u = null; try { u = new URL(v); } catch (_) {} if (!u || u.protocol !== 'https:' || !/^https:\/\//i.test(v)) return bad('url'); }
    set.url = v;
  }
  if (has('contact')) {
    const c = p.contact;
    if (!c || typeof c !== 'object' || Array.isArray(c)) return bad('contact');
    const out = {};
    if (c.name !== undefined) { const v = text(c.name, CAPS.name); if (v === null) return bad('contact.name'); out.name = v; }
    if (c.channel !== undefined) { if (!CONTACT_CHANNELS.includes(c.channel)) return bad('contact.channel'); out.channel = c.channel; }
    if (c.email !== undefined) { const v = text(c.email, 120); if (v === null || (v && !/^[^\s@]+@[^\s@]+$/.test(v))) return bad('contact.email'); out.email = v; }
    if (c.phone !== undefined) { const v = text(c.phone, 30); if (v === null || !/^[0-9 +()-]*$/.test(v)) return bad('contact.phone'); out.phone = v; }
    if (c.handle !== undefined) { const v = text(c.handle, 60); if (v === null) return bad('contact.handle'); out.handle = v; }
    set.contact = out;
  }
  if (has('nif')) { const v = text(p.nif, CAPS.nif); if (v === null || (v && !/^[A-Za-z0-9 .\-/]+$/.test(v))) return bad('nif'); set.nif = v; }
  if (has('lang')) { if (p.lang !== 'pt' && p.lang !== 'en') return bad('lang'); set.lang = p.lang; }
  if (has('notes')) { const v = text(p.notes, CAPS.message, true); if (v === null) return bad('notes'); set.notes = v; }
  if (has('logo')) {
    const l = p.logo, out = {};
    if (!l || typeof l !== 'object' || Array.isArray(l)) return bad('logo');
    if (l.vector !== undefined) { if (typeof l.vector !== 'boolean') return bad('logo.vector'); out.vector = l.vector; }
    if (l.fromRace !== undefined) { const v = text(l.fromRace, 80); if (v === null) return bad('logo.fromRace'); out.fromRace = v; }
    set.logo = out;
  }
  if (has('request')) { if (p.request !== '' && (typeof p.request !== 'string' || !ID_RE.test(p.request))) return bad('request'); set.request = p.request; }
  return { set };
}
// the targets after a change: the whole suit, some spots, or the ones there were; null when title and items disagree
function targetsAfter(set, cur) {
  if (set.title === true) return set.items && set.items.length ? null : [TITLE];
  if (set.items !== undefined) return set.items;
  if (set.title === false) return cur.filter((x) => x !== TITLE);
  return cur;
}
const spotsFor = (data, ids, old = []) => ids.map((x) => old.find((o) => o.id === x) || snapshotOf(data, [x])[0]).filter(Boolean);

async function readContract(env, id) {
  try { return await env.PEDIDOS.get(`c:${id}`, { type: 'json' }); } catch (_) { return null; }
}
async function contractKeys(env) {
  const keys = [];
  let cursor;
  do {
    const page = await env.PEDIDOS.list({ prefix: 'c:', cursor, limit: 1000 });
    keys.push(...page.keys.map((k) => k.name));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor && keys.length <= MAX_CONTRACTS);
  return keys;
}

async function listContracts(request, env) {
  const keys = (await contractKeys(env)).slice(0, MAX_CONTRACTS);
  const got = await Promise.all(keys.map((k) => env.PEDIDOS.get(k, { type: 'json' }).catch(() => null)));
  const by = (a, b) => (String(b.paidAt || '').localeCompare(String(a.paidAt || '')) || String(b.created || '').localeCompare(String(a.created || '')) || String(b.id).localeCompare(String(a.id)));
  const now = Date.now();
  return reply(request, env, { contratos: got.filter((c) => c && typeof c === 'object').sort(by), agora: new Date(now).toISOString(), hoje: lisbonDay(now) });
}

async function createContract(request, env) {
  const { v: p, error } = await readJson(request, CONTRACT_BODY);
  if (error) return fail(request, env, error, error === 'tamanho' ? 413 : 400);
  const data = await spotsData(env);
  if (!data) return fail(request, env, 'github', 502);
  const now = Date.now(), at = new Date(now).toISOString(), lday = lisbonDay(now);
  const inp = contractInput(p, data, lday, true);
  if (inp.campo) return fail(request, env, 'campos', 400, { campo: inp.campo });
  const s = inp.set, ids = targetsAfter(s, []);
  if (!ids || (!ids.length && !s.label)) return fail(request, env, 'campos', 400, { campo: 'items' });
  if (s.request && await readContract(env, s.request)) return fail(request, env, 'existe', 409, { id: s.request });
  if ((await contractKeys(env)).length >= MAX_CONTRACTS) return fail(request, env, 'muitos', 409, { max: MAX_CONTRACTS });
  const spots = spotsFor(data, ids);
  const c = contractShape({
    id: newId(now), kind: 'manual', request: s.request || '', season: s.season, rules: rulesFor(data, s.season), brand: s.brand, url: s.url,
    title: ids[0] === TITLE, spots, label: s.label, level: ids.length ? levelOf(pricedAs(data, spots), ids) : '',
    price: ids.length ? priceOf(contractQuote(data, s.season, ids, spots, s.paidAt)) : null, amount: s.amount, paidAt: s.paidAt, pay: s.pay,
    inKind: s.inKind, contact: s.contact, nif: s.nif, lang: s.lang, logo: s.logo, notes: s.notes, terms: rulesOf(data).termsDate, at, from: 'manual',
  });
  try { await putContract(env, c, now); } catch (_) { return fail(request, env, 'interno', 503); }
  return reply(request, env, { contrato: c }, 201);
}

async function actContract(request, env, id) {
  const { v: b, error } = await readJson(request, CONTRACT_BODY);
  if (error) return fail(request, env, error, error === 'tamanho' ? 413 : 400);
  if (!CONTRACT_ACTIONS.includes(b.action)) return fail(request, env, 'acao');
  const c = await readContract(env, id);
  if (!c) return fail(request, env, 'nada', 404);
  const now = Date.now(), at = new Date(now).toISOString(), lday = lisbonDay(now);
  const done = async (entry) => {
    c.history = [...(c.history || []), { at, ...entry }].slice(-HISTORY);
    c.updated = at;
    try { await putContract(env, c, now); } catch (_) { return fail(request, env, 'interno', 503); }   // KV out of writes: nothing changed
    return reply(request, env, { contrato: c });
  };

  if (b.action === 'apagar') {
    try { await env.PEDIDOS.delete(`c:${id}`); } catch (_) { return fail(request, env, 'interno', 503); }
    return reply(request, env, { apagado: id });
  }
  if (b.action === 'renovacao') {
    if (!RENEWAL_STEPS.includes(b.state)) return fail(request, env, 'campos', 400, { campo: 'state' });
    if (b.at !== undefined && !paidOk(b.at, lday)) return fail(request, env, 'campos', 400, { campo: 'at' });
    c.renewal = { state: b.state, at: b.at || lday };
    return done({ action: 'renovacao', state: b.state });
  }

  // editar: the fields given in `set`, checked as on creation
  const set0 = b.set;
  if (!set0 || typeof set0 !== 'object' || Array.isArray(set0)) return fail(request, env, 'campos', 400, { campo: 'set' });
  const data = await spotsData(env);
  if (!data) return fail(request, env, 'github', 502);
  const inp = contractInput(set0, data, lday, false);
  if (inp.campo) return fail(request, env, 'campos', 400, { campo: inp.campo });
  const s = inp.set;
  // the season moves only on a record nobody has worked on yet (its history holds only its creation)
  if (s.season !== undefined && s.season !== c.season && (c.history || []).some((h) => h.action !== 'criado')) return fail(request, env, 'campos', 400, { campo: 'season' });
  if (s.request !== undefined && s.request !== c.request) {
    if (c.kind !== 'manual') return fail(request, env, 'campos', 400, { campo: 'request' });
    if (s.request && await readContract(env, s.request)) return fail(request, env, 'existe', 409, { id: s.request });
  }
  const before = JSON.stringify(c), was = targetsOfContract(c);
  const ids = targetsAfter(s, was);
  if (!ids) return fail(request, env, 'campos', 400, { campo: 'items' });
  const label = s.label !== undefined ? s.label : c.label || '';
  if (!ids.length && !label) return fail(request, env, 'campos', 400, { campo: 'items' });
  const changed = [];
  const put = (k, v) => { if (JSON.stringify(c[k]) !== JSON.stringify(v)) { c[k] = v; changed.push(k); } };
  for (const k of ['brand', 'label', 'amount', 'paidAt', 'pay', 'inKind', 'url', 'nif', 'lang', 'notes', 'request']) if (s[k] !== undefined) put(k, s[k]);
  if (s.contact) put('contact', { ...c.contact, ...s.contact });
  if (s.logo) put('logo', { ...c.logo, ...s.logo });
  if (s.season !== undefined && s.season !== c.season) {
    const rules = rulesFor(data, s.season);
    c.season = s.season;
    c.period = { start: rules.start, end: rules.end };
    c.dates = { logoBy: rules.logoBy, proposalsFrom: rules.proposalsFrom, renewBy: rules.renewBy, openFrom: rules.openFrom };
    changed.push('season');
  }
  const moved = ids.join() !== was.join();
  if (moved) {
    c.title = ids[0] === TITLE;
    c.spots = spotsFor(data, ids, c.spots || []);
    c.level = ids.length ? levelOf(pricedAs(data, c.spots), ids) : '';
    changed.push(set0.items !== undefined ? 'items' : 'title');
  }
  // the price the table asked: on the payment day for a deal by hand; a site request keeps its request day's price, and
  // when its spots change, the new spots are priced on that request day, with its own season month (rule 4': the price
  // of the request day; a request from before the seasons kept m = 0)
  if (moved || changed.includes('season') || (c.kind === 'manual' && changed.includes('paidAt'))) {
    const site = c.kind === 'site' && c.price && isDate(c.price.day) && !changed.includes('season');
    const pday = site ? c.price.day : c.paidAt, m0 = site && Number.isInteger(c.price.m) ? c.price.m : undefined;
    c.price = ids.length ? priceOf(contractQuote(data, c.season, ids, c.spots, pday, m0)) : null;
  }
  if (!changed.length && JSON.stringify(c) === before) return reply(request, env, { contrato: c });
  const values = {};
  for (const k of ['amount', 'paidAt', 'pay', 'season']) if (changed.includes(k)) values[k] = c[k];
  return done({ action: 'editar', fields: changed, ...values });
}
