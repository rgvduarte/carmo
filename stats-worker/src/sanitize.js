// The beacon and feedback sanitizer (SPEC 3.3, 3.4). An allowlist: unknown keys are dropped, strings are scrubbed and
// cut, numbers are clamped and rounded, enums are checked. A wrong optional field is dropped; a wrong required field
// rejects the whole beacon ({ error: 'esquema' }). Nothing here ever echoes request data back.

import {
  PLACE_SET, SEC_KEYS, ZONE_SET, FIXED_SET, ANCHOR_SET, SPOT_SET, CTA_SET, EVENTS, ERROR_FILES, ATTR_VALUES,
  FEEDBACK, CLICK_ERRORS,
} from './schema.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const APP_REF = /^app:[a-z0-9._]{1,60}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

// ---------- text ----------
// control, format and bidi characters (written as code points: no invisible characters in this file)
const CP = (c) => '\\' + 'u' + c.toString(16).padStart(4, '0');
const CONTROL = new RegExp(`[${[[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200f],
  [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff]].map(([a, b]) => `${CP(a)}-${CP(b)}`).join('')}]`, 'g');
const EMAIL = /[^\s@<>()[\]'"`,;:]+@[^\s@<>()[\]'"`,;:]+\.[^\s@<>()[\]'"`,;:]+/g;
const HAS_EMAIL = new RegExp(EMAIL.source);
const URL_RE = /\b(?:[a-z][a-z0-9+.-]{1,20}:\/\/|www\.)[^\s'"<>`]+|\b(?:data|blob|javascript|mailto|tel|file):[^\s'"<>`]+/gi;
// an address without a scheme (host.tld/path) and anything with a query string (?a=b, &a=b)
const BARE_URL = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?\/\S*/gi;
const QUERY = /\S*[?&][^\s=&]+=\S*/g;
const DIGITS = /\d(?:[\s.\-]?\d){3,}/g;
const urls = (s) => s.replace(URL_RE, '[url]').replace(BARE_URL, '[url]').replace(QUERY, '[url]');
const cut = (s, max) => { const a = Array.from(s); return a.length > max ? a.slice(0, max).join('') : s; };
const tidy = (s) => s.normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();

// a click label: an email anywhere drops the whole label; URLs (with or without a scheme), query strings and digit runs
// are masked
export function scrubLabel(v, max = 40) {
  if (typeof v !== 'string') return undefined;
  let s = tidy(v);
  if (HAS_EMAIL.test(s)) return undefined;
  s = tidy(urls(s).replace(DIGITS, '[n]'));
  s = cut(s, max);
  return s ? s : undefined;
}
// an error message or a note label: emails and URLs (with or without a scheme, and query strings) become placeholders,
// digit runs [n]
export function scrubText(v, max) {
  if (typeof v !== 'string') return undefined;
  const s = tidy(urls(tidy(v).replace(EMAIL, '[email]')).replace(DIGITS, '[n]'));
  return cut(s, max);
}

// ---------- selectors (4.5) ----------
const ID_OK = /^[a-z][a-z0-9-]{0,40}$/;
const noRun = (s) => !/\d{4}/.test(s);
const TAG = /^[a-z][a-z0-9-]{0,30}$/;
const CLASS = /^[a-z][a-z0-9-]{1,24}$/;
// one compound: #id, or tag[.class][[attr="value"] | :nth-of-type(n)] (an attribute, or the position, never both)
const STEP = /^(?:#([a-z][a-z0-9-]{0,40})|([a-z][a-z0-9-]{0,30})(?:\.([a-z][a-z0-9-]{1,24}))?(?:\[([a-z-]{1,12})="([a-z0-9-]{1,30})"\]|:nth-of-type\((\d{1,3})\))?)$/;
export function checkSelector(v) {
  if (typeof v !== 'string' || !v || v.length > 80 || v !== v.trim()) return undefined;
  const parts = v.split(/( > | )/);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i % 2 === 1) { if (p !== ' > ' && p !== ' ') return undefined; continue; }
    const m = p.match(STEP);
    if (!m) return undefined;
    const [, id, tag, cls, attr, val, nth] = m;
    if (id !== undefined) { if (!ID_OK.test(id) || !noRun(id)) return undefined; continue; }
    if (!TAG.test(tag) || (cls && (!CLASS.test(cls) || !noRun(cls)))) return undefined;
    if (attr !== undefined) {
      const allowed = ATTR_VALUES[attr];
      if (!allowed || !allowed.has(val)) return undefined;
    }
    if (nth !== undefined && (Number(nth) < 1 || Number(nth) > 999)) return undefined;
  }
  return v;
}
const lastStep = (sel) => sel.slice(Math.max(sel.lastIndexOf(' '), -1) + 1);
// the form fields of the booking window and the logo try-on (index.html): never a click record
const FIELD_IDS = new Set(['cl-brand', 'cl-name', 'cl-nif', 'cl-msg', 'logo-file', 'logo-bg', 'logo-inv']);
function isField(sel, sec) {
  const last = lastStep(sel);
  if (last.startsWith('#')) return FIELD_IDS.has(last.slice(1));
  const tag = last.match(/^[a-z][a-z0-9-]*/)[0];
  return (tag === 'input' || tag === 'textarea' || tag === 'select') && (sec === 'reserva' || /#(claim|tryon)\b/.test(sel));
}

// ---------- numbers ----------
const clampRound = (v, lo, hi, step = 1) => {
  const n = num(v);
  if (n === undefined) return undefined;
  return Math.min(hi, Math.max(lo, Math.round(n / step) * step));
};
const intIn = (v, lo, hi) => (Number.isInteger(v) && v >= lo && v <= hi ? v : undefined);
const flag1 = (v) => (v === 1 || v === true ? 1 : undefined);
const bit = (v) => (v === 1 || v === true ? 1 : v === 0 || v === false ? 0 : undefined);

// ---------- landing hash ----------
function landOf(v) {
  if (typeof v !== 'string' || v.length > 48) return undefined;
  if (v.startsWith('#')) return ANCHOR_SET.has(v.slice(1)) ? v : undefined;
  if (v.startsWith('spot:')) { const id = v.slice(5); return SPOT_SET.has(id) && id !== 'title' ? v : undefined; }
  if (v === 'capacete' || v === 'title' || v === 'pacote:1' || v === 'pacote:2' || v === 'pacote:3+') return v;
  return undefined;
}
function refOf(v) {
  if (typeof v !== 'string') return undefined;
  if (v === 'direto' || v === 'interno') return v;
  if (APP_REF.test(v)) return v;
  return v.length <= 64 && HOST.test(v) ? v : undefined;
}

// ---------- events ----------
function clickOf(e) {
  const sel = checkSelector(e.sel);
  const sec = typeof e.sec === 'string' && PLACE_SET.has(e.sec) ? e.sec : undefined;
  if (!sel || !sec) return null;                                   // no valid target or place: the click is dropped
  // no form analytics: a click on a field of the booking window or the logo try-on is never kept
  if (isField(sel, sec)) return null;
  let rb;
  if (e.rb !== undefined) { rb = checkSelector(e.rb); if (!rb) return null; }
  const c = { k: 'click', sel, sec };
  const lab = scrubLabel(e.lab);
  if (lab) c.lab = lab;
  const x = clampRound(e.x, 0, 100); if (x !== undefined) c.x = x;
  const y = clampRound(e.y, 0, 20000, 10); if (y !== undefined) c.y = y;
  const ex = clampRound(e.ex, 0, 100), ey = clampRound(e.ey, 0, 100);
  if (ex !== undefined && ey !== undefined) { c.ex = ex; c.ey = ey; if (rb) c.rb = rb; }
  if (['m', 't', 'p', 'k'].includes(e.pt)) c.pt = e.pt;
  const ia = bit(e.ia); if (ia !== undefined) c.ia = ia;
  if (flag1(e.dead)) c.dead = 1;
  if (flag1(e.rage)) c.rage = 1;
  if (flag1(e.err)) { c.err = 1; c.e = CLICK_ERRORS.has(e.e) ? e.e : 'js'; }
  if (typeof e.out === 'string') {
    if (e.out === 'mailto' || e.out === 'tel' || e.out === 'whatsapp') c.out = e.out;
    else if (e.out.length <= 64 && HOST.test(e.out)) c.out = e.out.replace(/^www\./, '');
  }
  if (flag1(e.osp)) c.osp = 1;
  if (typeof e.cta === 'string' && CTA_SET.has(e.cta)) c.cta = e.cta;
  return c;
}
function evOf(e) {
  const def = typeof e.n === 'string' ? EVENTS[e.n] : undefined;
  if (!def || !Object.prototype.hasOwnProperty.call(EVENTS, e.n)) return null;
  const p = {};
  if (isObj(e.p)) {
    for (const [k, check] of Object.entries(def.p)) {
      if (!Object.prototype.hasOwnProperty.call(e.p, k)) continue;
      const v = check(e.p[k]);
      if (v !== undefined) p[k] = v;
    }
  }
  return { k: 'ev', n: e.n, p };
}
const ERR_T = /^[A-Za-z]{1,30}$/;
function errOf(e) {
  const t = e.t === 'rejection' || (typeof e.t === 'string' && ERR_T.test(e.t)) ? e.t : undefined;
  if (!t) return null;
  let f = 'ext';
  if (e.f === 'inline' || e.f === 'opaque' || e.f === 'ext') f = e.f;
  else if (typeof e.f === 'string' && ERROR_FILES.has(e.f)) f = e.f;
  // a message only from one of our own files: inline code, rejections and anything else may carry what a visitor typed
  const m = ERROR_FILES.has(f) ? (scrubText(e.m, 100) || '') : '';
  const r = { k: 'err', t, m, f, l: intIn(e.l, 0, 1e6) ?? 0, c: intIn(e.c, 0, 1e6) ?? 0, n: intIn(e.n, 1, 99) ?? 1 };
  return r;
}
function eventsOf(list) {
  if (!Array.isArray(list)) return [];
  const out = [], seen = new Set();
  for (const e of list.slice(0, 50)) {
    if (!isObj(e)) continue;
    const i = intIn(e.i, 1, 250);
    if (i === undefined || seen.has(i)) continue;
    const r = e.k === 'click' ? clickOf(e) : e.k === 'ev' ? evOf(e) : e.k === 'err' ? errOf(e) : null;
    if (!r) continue;
    seen.add(i);
    out.push({ i, ...r });
  }
  return out;
}

// ---------- the beacon ----------
// Returns { page, snap, events, t, f, vis, pv } or { error }.
export function sanitizeBeacon(b) {
  if (!isObj(b)) return { error: 'json' };
  if (b.v !== 1) return { error: 'versao' };
  const pv = typeof b.pv === 'string' && UUID.test(b.pv) ? b.pv : null;
  const f = intIn(b.f, 1, 16);
  const t = ['s', 'h', 'x', 'm', 'p'].includes(b.t) ? b.t : null;
  const vis = bit(b.vis);
  const path = ['/', '/privacidade/', '/outro'].includes(b.path) ? b.path : null;
  const lang = b.lang === 'pt' || b.lang === 'en' ? b.lang : null;
  const bl = typeof b.bl === 'string' && /^[a-z]{2,3}$/.test(b.bl) ? b.bl : 'xx';
  const ref = refOf(b.ref);
  const vw = ['m', 't', 'd', 'w'].includes(b.vw) ? b.vw : null;
  const vh = clampRound(b.vh, 100, 3000, 100);
  const nav = ['navigate', 'reload', 'back_forward', 'prerender'].includes(b.nav) ? b.nav : null;
  const pc = bit(b.pc);
  if (!pv || f === undefined || !t || vis === undefined || !path || !lang || !ref || !vw || vh === undefined || !nav || pc === undefined) return { error: 'esquema' };
  const page = { path, lang, bl, ref, vw, vh, nav, pc, tv: 1 };
  const land = landOf(b.land); if (land) page.land = land;
  if (typeof b.b === 'string' && /^[0-9a-f]{8}$/.test(b.b)) page.b = b.b;
  if (typeof b.cmp === 'string' && /^[a-z0-9-]{1,32}$/.test(b.cmp) && !/\d{4}/.test(b.cmp)) page.cmp = b.cmp;
  const snap = {};
  const eng = clampRound(b.eng, 0, 3600); if (eng !== undefined) snap.eng = eng;
  const scr = clampRound(b.scr, 0, 100, 5); if (scr !== undefined) snap.scr = scr;
  if (flag1(b.scr1)) snap.s1 = 1;
  if (typeof b.ex === 'string' && PLACE_SET.has(b.ex)) snap.ex = b.ex;
  if (isObj(b.sec)) {
    const sec = {};
    let n = 0;
    for (const [k, v] of Object.entries(b.sec)) {
      if (n >= 16) break;
      if (!SEC_KEYS.has(k)) continue;
      const s = clampRound(v, 0, 1800);
      if (s === undefined || s < 1) continue;
      sec[k] = s; n++;
    }
    if (n) snap.sec = sec;
  }
  if (Array.isArray(b.rz)) {
    const rz = [...new Set(b.rz.filter((z) => typeof z === 'string' && ZONE_SET.has(z)))].slice(0, 15);
    if (rz.length) snap.rz = rz;
  }
  if (isObj(b.perf)) {
    const p = {}, q = b.perf;
    for (const k of ['lcp', 'fcp', 'ttfb']) { const v = clampRound(q[k], 0, 30000, 50); if (v !== undefined) p[k] = v; }
    const inp = clampRound(q.inp, 0, 30000, 10); if (inp !== undefined) p.inp = inp;
    const cls = num(q.cls); if (cls !== undefined) p.cls = Math.round(Math.min(5, Math.max(0, cls)) * 100) / 100;
    for (const k of ['lcpT', 'inpT', 'clsT']) { const s = checkSelector(q[k]); if (s) p[k] = s; }
    if (q.inpK === 'pointer' || q.inpK === 'keyboard') p.inpK = q.inpK;
    if (Object.keys(p).length) snap.perf = p;
  }
  const events = eventsOf(b.e);
  return { pv, f, t, vis, page, snap, events, int: b.int === 1 ? 1 : 0 };
}

// ---------- the feedback answer (3.4) ----------
export function sanitizeFeedback(b) {
  if (!isObj(b)) return { error: 'json' };
  if (b.v !== 1) return { error: 'versao' };
  const q = typeof b.q === 'string' && Object.prototype.hasOwnProperty.call(FEEDBACK, b.q) ? b.q : null;
  const a = q && typeof b.a === 'string' && FEEDBACK[q].has(b.a) ? b.a : null;
  const lang = b.lang === 'pt' || b.lang === 'en' ? b.lang : null;
  if (!q || !a || !lang) return { error: 'esquema' };
  const r = { q, a, lang, int: b.int === 1 ? 1 : 0 };
  if (typeof b.pv === 'string' && UUID.test(b.pv)) r.pv = b.pv;
  if (['m', 't', 'd', 'w'].includes(b.vw)) r.vw = b.vw;
  if (typeof b.ex === 'string' && PLACE_SET.has(b.ex)) r.ex = b.ex;
  return r;
}

export { FIXED_SET };
