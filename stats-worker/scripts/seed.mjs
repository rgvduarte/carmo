// Fills a local `wrangler dev` (DEV_HOOKS=1 in .dev.vars) with realistic made-up visits, for work on the dashboard.
// Nothing here is real: invented addresses (10.x.y.7), places and browsers. Each past day is rolled up at the end, so
// both the live path and the aggregates have data.
//
//   npm run seed -- [--api http://127.0.0.1:8787] [--days 14] [--per-day 40] [--reset]
//
// Needs ADMIN_KEY from .dev.vars (read here) for the reset and the rollups.
import { readFileSync } from 'node:fs';

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const API = (arg('api', 'http://127.0.0.1:8787')).replace(/\/$/, '');
const DAYS = Number(arg('days', '14'));
const PER_DAY = Number(arg('per-day', '40'));
const RESET = process.argv.includes('--reset');
const ORIGIN = 'https://gocarmo.com';
let KEY = process.env.ADMIN_KEY || '';
try { KEY = KEY || readFileSync(new URL('../.dev.vars', import.meta.url), 'utf8').match(/^ADMIN_KEY=(.*)$/m)[1].trim(); } catch (_) {}
if (!KEY) { console.error('Falta ADMIN_KEY (em .dev.vars ou no ambiente).'); process.exit(1); }

// a seeded random, so two runs give the same data
let seed = 20261023;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (xs) => xs[Math.floor(rnd() * xs.length)];
const weighted = (xs) => { const t = xs.reduce((a, x) => a + x[1], 0); let r = rnd() * t; for (const [v, w] of xs) { if ((r -= w) <= 0) return v; } return xs[0][0]; };
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.floor(rnd() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); });

const DEVICES = [
  [{ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1', vw: 'm', vh: 800, pc: 1 }, 30],
  [{ ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36', vw: 'm', vh: 900, pc: 1 }, 18],
  [{ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0', vw: 'm', vh: 700, pc: 1 }, 14],
  [{ ua: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', vw: 't', vh: 1100, pc: 1 }, 6],
  [{ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36', vw: 'd', vh: 800, pc: 0 }, 18],
  [{ ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15', vw: 'w', vh: 900, pc: 0 }, 10],
  [{ ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0', vw: 'd', vh: 800, pc: 0 }, 4],
];
const PLACES = [
  [{ country: 'PT', region: 'Lisbon', city: 'Lisbon', latitude: '38.72', longitude: '-9.14' }, 40],
  [{ country: 'PT', region: 'Porto', city: 'Porto', latitude: '41.15', longitude: '-8.61' }, 18],
  [{ country: 'PT', region: 'Braga', city: 'Braga', latitude: '41.55', longitude: '-8.42' }, 6],
  [{ country: 'PT', region: 'Faro', city: 'Faro', latitude: '37.02', longitude: '-7.93' }, 5],
  [{ country: 'PT', region: 'Coimbra', city: 'Coimbra', latitude: '40.21', longitude: '-8.43' }, 4],
  [{ country: 'PT', region: 'Madeira', city: 'Funchal', latitude: '32.65', longitude: '-16.91' }, 3],
  [{ country: 'PT', region: 'Leiria', city: 'Leiria', latitude: '39.74', longitude: '-8.81' }, 2],
  [{ country: 'ES', region: 'Madrid', city: 'Madrid', latitude: '40.42', longitude: '-3.70' }, 4],
  [{ country: 'GB', region: 'England', city: 'London', latitude: '51.51', longitude: '-0.13' }, 3],
  [{ country: 'BR', region: 'Sao Paulo', city: 'Sao Paulo', latitude: '-23.55', longitude: '-46.63' }, 2],
  [{ country: 'US', region: 'Hawaii', city: 'Kailua-Kona', latitude: '19.64', longitude: '-155.99' }, 1],
];
const REFS = [['direto', 30], ['l.instagram.com', 22], ['google.com', 14], ['strava.com', 6], ['facebook.com', 4], ['app:com.whatsapp', 5], ['chatgpt.com', 2], ['blog.example.net', 2], ['linkedin.com', 2]];
const ZONES = ['top', 'tese', 'historia', 'prova', 'resultados', 'dados', 'epoca', 'fato-topo', 'o-fato', 'o-capacete', 'fato-termos', 'media', 'apoiar', 'contacto', 'footer'];
const SPOTS = ['peito', 'nuca', 'abdomen', 'ombro-e', 'coxa-frente-d', 'costas-topo', 'capacete-topo', 'capacete-lateral-e'];
const itemOf = (s) => (s.startsWith('capacete') ? 'helmet' : 'suit');

function lisbonISO(day, hh, mm) {
  const guess = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hh, mm);
  const off = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', hour: '2-digit', hourCycle: 'h23' }).format(new Date(guess))) - hh;
  return new Date(guess - ((off + 24) % 24) * 3600e3).toISOString();
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (d, n) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

async function send(path, body, h) {
  const r = await fetch(`${API}${path}`, { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'text/plain;charset=UTF-8', ...h }, body: JSON.stringify(body) });
  if (r.status !== 204) throw new Error(`${path} ${r.status} ${await r.text()}`);
}
const admin = (path, body) => fetch(`${API}/admin/v1/${path}`, { method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });

// one visit: what this kind of visitor typically does
async function visitOne(day, n) {
  const dev = weighted(DEVICES), place = weighted(PLACES);
  const ref = dev.ua.includes('Instagram') ? 'direto' : weighted(REFS);
  const hh = weighted([[8, 2], [9, 3], [10, 3], [11, 3], [12, 4], [13, 5], [14, 3], [15, 3], [16, 3], [17, 3], [18, 4], [19, 5], [20, 6], [21, 6], [22, 5], [23, 3], [0, 1], [7, 1]]);
  const now = lisbonISO(day, hh, Math.floor(rnd() * 60));
  const kind = weighted([['bounce', 25], ['reader', 30], ['studio', 22], ['sponsor', 10], ['contact', 8], ['support', 5]]);
  const h = { 'User-Agent': dev.ua, 'X-Dev-Ip': `10.${(n >> 8) & 255}.${n & 255}.7`, 'X-Dev-Cf': JSON.stringify(place), 'X-Dev-Now': now };
  const lang = rnd() < 0.85 ? 'pt' : 'en';
  const base = { v: 1, pv: uuid(), path: '/', lang, bl: lang === 'pt' ? 'pt' : pick(['en', 'es', 'fr', 'de']), ref, vw: dev.vw, vh: dev.vh, nav: rnd() < 0.06 ? 'reload' : 'navigate', pc: dev.pc, b: '033e031d' };
  if (rnd() < 0.08) base.land = pick(['#fato', '#capacete', 'spot:peito', 'spot:nuca', '#apoiar']);
  const e = [];
  let i = 0;
  const ev = (nm, p = {}) => e.push({ i: ++i, k: 'ev', n: nm, p });
  const click = (o) => e.push({ i: ++i, k: 'click', pt: dev.pc ? 't' : 'm', ia: 1, x: Math.floor(rnd() * 90) + 5, y: Math.floor(rnd() * 60) * 10, ex: Math.floor(rnd() * 100), ey: Math.floor(rnd() * 100), ...o });
  const depth = { bounce: 1, reader: 3 + Math.floor(rnd() * 5), studio: 9 + Math.floor(rnd() * 2), sponsor: 11, contact: 14, support: 13 }[kind];
  const rz = ZONES.slice(0, depth);
  const eng = { bounce: Math.floor(rnd() * 7), reader: 20 + Math.floor(rnd() * 120), studio: 60 + Math.floor(rnd() * 240), sponsor: 120 + Math.floor(rnd() * 400), contact: 40 + Math.floor(rnd() * 120), support: 50 + Math.floor(rnd() * 100) }[kind];
  const sec = {};
  rz.forEach((z) => { sec[z] = Math.max(1, Math.round(eng / rz.length * (0.5 + rnd()))); });
  ev('cta_view', { id: 'hero-sponsor' });
  if (rnd() < 0.3) { click({ sel: '#hero-spots', lab: 'hero.spots', sec: 'top', ia: 0, ...(rnd() < 0.4 ? { dead: 1 } : {}) }); }
  if (kind === 'studio' || kind === 'sponsor') {
    if (rnd() < 0.5) { click({ sel: '#top > div.hero-cta > a.btn:nth-of-type(1)', lab: 'hero.cta1', sec: 'top', cta: 'hero-sponsor' }); ev('hero_cta', { to: 'fato' }); ev('offer_reach', { s: 8 + Math.floor(rnd() * 20), via: 'hero' }); }
    else ev('offer_reach', { s: 30 + Math.floor(rnd() * 200), via: 'scroll' });
    const item = rnd() < 0.75 ? 'suit' : 'helmet';
    ev('studio_near', { item }); ev('studio_seen', { item });
    if (rnd() < 0.92) ev('3d_ready', { item, ms: pick([500, 1000, 2000, 5000]), mesh: rnd() < 0.8 ? 'worker' : 'main' }); else ev('3d_fail', { item, why: pick(['nogl', 'load']) });
    if (rnd() < 0.6) { click({ sel: '#stage > canvas', lab: 'canvas', sec: 'o-fato' }); ev('studio_rotate', { item }); }
    if (rnd() < 0.5) ev('studio_tap', { item, hit: rnd() < 0.7 ? 1 : 0 });
    const spot = pick(SPOTS);
    click({ sel: `#rc-body > li.rc-row[data-id="${spot}"] > button.nm`, lab: spot, sec: itemOf(spot) === 'suit' ? 'o-fato' : 'o-capacete' });
    ev('spot_select', { spot, item: itemOf(spot), from: pick(['3d', 'tabela', 'tabela', 'capitulo']) });
    if (kind === 'sponsor') {
      click({ sel: `#rc-body > li.rc-row[data-id="${spot}"] > button.add`, lab: 'rc.add', sec: 'o-fato' });
      ev('pkg_add', { spot, n: '1' }); ev('pkg_bar');
      click({ sel: '#pk-go', lab: 'pk.go', sec: 'pacote', cta: 'pkg-go' });
      ev('claim_open', { via: 'pkg', n: '1', step: 1 });
      if (rnd() < 0.15) ev('claim_error', { field: 'cl-brand', kind: 'empty' });
      if (rnd() < 0.6) {
        const ch = pick(['whatsapp', 'whatsapp', 'email', 'instagram']);
        click({ sel: `#cl-${ch === 'whatsapp' ? 'wa' : ch === 'email' ? 'mail' : 'ig'}`, lab: `cl.${ch}`, sec: 'reserva' });
        ev('claim_send', { ch }); ev('pay_tab', { tab: 'mb', auto: 1 });
        if (rnd() < 0.5) { ev('pay_copy', { what: pick(['iban', 'mb', 'amt']) }); if (rnd() < 0.5) ev('claim_done', { tab: 'mb' }); }
      } else ev('claim_close', { step: 1, how: 'x' });
    }
  }
  if (kind === 'contact') click({ sel: '#contacto > ul.contact-list > li:nth-of-type(1) > a', lab: 'Instagram', sec: 'contacto', out: 'instagram.com' });
  if (kind === 'support') { click({ sel: '#gofundme', lab: 'sup.b1', sec: 'apoiar', out: 'gofundme.com', cta: 'gofundme' }); if (rnd() < 0.4) ev('give_copy', { what: 'iban' }); }
  if (rnd() < 0.05) e.push({ i: ++i, k: 'err', t: 'TypeError', m: "Cannot read properties of null (reading 'x')", f: 'adspace.js', l: 812, c: 17 });
  if (lang === 'pt' && rnd() < 0.04) ev('lang_switch', { from: 'pt', to: 'en', s: 10 });
  const perf = { lcp: 1200 + Math.floor(rnd() * 3000 / 50) * 50, inp: Math.floor(rnd() * 40) * 10 + 40, cls: Math.round(rnd() * 15) / 100, fcp: 900 + Math.floor(rnd() * 30) * 50, ttfb: 150 + Math.floor(rnd() * 12) * 50, lcpT: '#top img', inpT: '#stage > canvas', inpK: 'pointer' };
  await send('/v1/e', { ...base, f: 1, t: 's', vis: 1, e: e.slice(0, 1) }, h);
  await send('/v1/e', { ...base, f: 2, t: 'h', vis: 0, eng, scr: Math.min(100, Math.round(depth / 15 * 20) * 5), ...(depth > 1 ? { scr1: 1 } : {}), ex: rz[rz.length - 1], rz, sec, perf, e: e.slice(1) }, h);
  if ((kind === 'studio' || kind === 'sponsor') && rnd() < 0.25) {
    await send('/v1/f', { v: 1, q: 'patrocinio', a: rnd() < 0.7 ? 'sim' : 'nao', lang, pv: base.pv, vw: dev.vw, ex: 'o-fato' }, h);
  }
}

if (RESET) { const r = await admin('dev/reset'); if (r.status !== 200) { console.error(`reset: ${r.status}`); process.exit(1); } }
let n = 1;
for (let d = DAYS; d >= 0; d--) {
  const day = addDays(today, -d);
  const count = Math.round(PER_DAY * (0.6 + rnd() * 0.8) * (d === 0 ? 0.5 : 1));
  for (let k = 0; k < count; k++) await visitOne(day, n++);
  if (d > 0) { const r = await admin('dev/rollup', { day }); if (r.status !== 200) console.error(`rollup ${day}: ${r.status}`); }
  console.log(`${day}: ${count} visitas`);
}
console.log(`Pronto: ${n - 1} visitas em ${DAYS + 1} dias, em ${API}.`);
