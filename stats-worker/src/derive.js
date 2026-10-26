// One page view (a `pv` row plus its event batches) into aggregate rows (SPEC 2.7, 2.9). The nightly rollup and the
// live path for today both run this, so a day reads the same before and after it is rolled up.
//
// derive(pv, batches, add): `add(m, k, n, u, s)` sums into the caller's accumulator for this pv's day / dev / int.

import {
  ZONES, OFFER_ZONES, BEFORE_OFFER, EVENTS, VW, ITEMS, itemOfSpot, SCHEMA_VERSION,
} from './schema.js';
import { outType, refKey } from './ua.js';
import { weekday } from './time.js';

export const DIMS = ['path', 'chan', 'ref', 'app', 'land', 'cc', 'reg', 'city', 'vw', 'os', 'br', 'lang', 'bl', 'pc', 'cmp', 'hr', 'wd'];
export const QDIMS = ['chan', 'app', 'vw', 'lang', 'os', 'br'];
export const VITALS = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'];
export const THRESH = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], fcp: [1800, 3000], ttfb: [800, 1800] };

// every metric key `agg.m` can hold (the rollup deletes a day per key; the archive copies per key)
export const M_KEYS = [
  'c', ...DIMS.map((d) => `d.${d}`), ...QDIMS.map((d) => `q.${d}`),
  'h.eng', 'h.scr', 'h.arr', 'h.sw', ...ITEMS.map((i) => `h.wait.${i}`), ...ITEMS.map((i) => `h.ms3d.${i}`),
  ...VITALS.map((v) => `h.${v}`), ...VITALS.map((v) => `vit.${v}`), 'vt.lcp', 'vt.inp', 'vt.cls',
  'z', 'zl', ...['zv', 'sv', 'vph', 'ck', 'ckf', 'cc', 'cz', 'tap'].flatMap((p) => VW.map((w) => `${p}.${w}`)),
  'out', 'ctav', 'ev', 'spot', 'f', 'fb', 'fbs', 'err', 'err.br', 'err.b', 'geo', 'vv', 'nf.br',
];
// not kept in the monthly archive: places below the country's regions, free-form hosts, selectors, messages
export const ARCHIVE_SKIP = (m) => m === 'd.city' || m === 'geo' || m === 'd.ref' || m === 'out' || m === 'vv'
  || /^(ck|ckf|cc|cz|vt)\./.test(m) || m === 'err' || m === 'err.br' || m === 'err.b';

// ---------- bins ----------
export const binEng = (e) => (e < 600 ? Math.floor(e / 5) * 5 : Math.min(3540, 600 + Math.floor((e - 600) / 60) * 60));
const binStep = (v, step, max) => (v >= max ? `${max}+` : String(Math.floor(v / step) * step));
export const binCls = (v) => (v >= 1 ? '1+' : (Math.floor(v * 100 + 1e-6) / 100).toFixed(2));
export const VBIN = {
  lcp: (v) => binStep(v, 100, 10000), fcp: (v) => binStep(v, 100, 10000), inp: (v) => binStep(v, 25, 2000),
  ttfb: (v) => binStep(v, 50, 5000), cls: binCls,
};
export const EDGES = {
  arr: [0, 15, 30, 60, 120, 300, 600], wait: [0, 1, 2, 5, 10, 20], ms3d: [0, 500, 1000, 2000, 5000, 10000, 20000],
  sw: [0, 10, 30, 60],
};
export const edgeOf = (edges, v) => { let b = edges[0]; for (const e of edges) if (v >= e) b = e; return b; };
export const rating = (vital, v) => { const [g, p] = THRESH[vital]; return v <= g ? 'good' : v <= p ? 'ni' : 'poor'; };
export const canon = (p) => Object.keys(p || {}).sort().map((k) => `${k}=${p[k]}`).join('&');

// studio gestures (st.<item>.g.<gesture>) by event name
const GESTURE = { studio_rotate: 'rotate', studio_tap: 'tap', studio_pinch: 'pinch', studio_zoom: 'zoom', studio_view: 'view',
  studio_auto: 'auto', studio_spots: 'spots', chapter: 'chapter', tour_start: 'tour' };
// meaningful actions (2.7): a studio gesture, the listed events, an outbound click, a feedback answer
const MEANINGFUL = new Set([...Object.keys(GESTURE), 'spot_select', 'pkg_add', 'claim_open', 'give_copy', 'lang_switch', 'kit_print']);

const parse = (s, dflt) => { if (s === null || s === undefined || s === '') return dflt; try { return JSON.parse(s); } catch (_) { return dflt; } };

// the events of one pv, deduplicated by `i`, in order, capped per name (4.7); feedback answers apart
export function eventsOf(batches) {
  const byI = new Map(), fb = new Map();
  for (const r of batches) {
    const list = parse(r.e, []);
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      if (!e || typeof e !== 'object') continue;
      if (r.f >= 100 || e.k === 'fb') { if (e.k === 'fb' && typeof e.q === 'string' && !fb.has(e.q)) fb.set(e.q, e); continue; }
      if (Number.isInteger(e.i) && !byI.has(e.i)) byI.set(e.i, e);
    }
  }
  const all = [...byI.values()].sort((a, b) => a.i - b.i);
  const caps = new Map(), out = [];
  let errs = 0;
  for (const e of all) {
    if (e.k === 'ev') {
      const def = EVENTS[e.n];
      if (!def) continue;
      const key = def.per ? `${e.n}|${(e.p || {})[def.per] ?? ''}` : e.n;
      const c = caps.get(key) || 0;
      if (c >= def.cap) continue;
      caps.set(key, c + 1);
      if (!e.p) e.p = {};
    } else if (e.k === 'err') {
      if (++errs > 10) continue;
    } else if (e.k !== 'click') continue;
    out.push(e);
  }
  return { events: out, fb: [...fb.values()] };
}

export function derive(pv, batches, add) {
  const { events, fb } = eventsOf(batches);
  const once = new Set();                       // pv-unique keys: `u` counts a pv once per key
  const uniq = (m, k) => { const key = `${m}\u0001${k}`; if (once.has(key)) return 0; once.add(key); return 1; };
  const flag = (k) => { if (!once.has(`f\u0001${k}`)) { once.add(`f\u0001${k}`); add('f', k, 1, 0, 0); } };
  const cnt = (k, v = 1) => { if (v) add('c', k, v, 0, 0); };

  const sec = parse(pv.sec, {}) || {};
  const rz = new Set(parse(pv.rz, []) || []);
  const eng = Number.isFinite(pv.eng) ? pv.eng : null;
  const vw = pv.vw;
  const uv1 = pv.uv1 ? 1 : 0;
  const visit = (pv.nav === 'navigate' || pv.nav === 'prerender') && pv.ref !== 'interno' ? 1 : 0;
  const evs = events.filter((e) => e.k === 'ev');
  const clicks = events.filter((e) => e.k === 'click');
  const errs = events.filter((e) => e.k === 'err');
  const named = (n, pred) => evs.filter((e) => e.n === n && (!pred || pred(e.p)));
  const has = (n, pred) => evs.some((e) => e.n === n && (!pred || pred(e.p)));

  // ---------- definitions ----------
  const meaningful = evs.some((e) => MEANINGFUL.has(e.n)) || clicks.some((c) => c.out) || fb.length > 0;
  const engaged = (eng !== null && eng >= 10) || meaningful;
  const topOnly = [...rz].every((z) => z === 'top');
  const quick = (eng ?? 0) < 8 && !meaningful && topOnly;
  const S = [
    OFFER_ZONES.some((z) => rz.has(z)),
    has('spot_select') || has('title_click'),
    has('pkg_add') || has('title_click'),
    has('claim_open'),
    has('claim_send'),
    has('pay_copy'),
    has('claim_done'),
  ];
  const before = !S[0] && !!pv.ex && BEFORE_OFFER.has(pv.ex);

  // ---------- counters ----------
  cnt('pv'); cnt('uv', uv1); cnt('visits', visit); cnt('fin', pv.fin ? 1 : 0);
  cnt('engaged', engaged ? 1 : 0); cnt('quick', quick ? 1 : 0); cnt('toponly', topOnly ? 1 : 0);
  cnt('s0', S[0] ? 1 : 0); cnt('beforefato', before ? 1 : 0);
  if (pv.fin || eng !== null) { cnt('eng_n'); cnt('eng_sum', eng ?? 0); }
  cnt('dead_pv', clicks.some((c) => c.dead) ? 1 : 0);
  cnt('rage_pv', clicks.some((c) => c.rage) ? 1 : 0);
  cnt('err_pv', errs.length ? 1 : 0);
  cnt('inapp_pv', pv.app ? 1 : 0);
  cnt('coarse_pv', pv.pc ? 1 : 0);
  cnt('scrolled1', pv.s1 ? 1 : 0);
  cnt('mt_pv', vw === 'm' || vw === 't' ? 1 : 0);
  cnt('menu_pv', has('menu_open') ? 1 : 0);
  cnt('lang_sw_pv', has('lang_switch') ? 1 : 0);
  cnt('reload_pv', pv.nav === 'reload' ? 1 : 0);
  cnt('bf_pv', pv.nav === 'back_forward' || has('bf_return') ? 1 : 0);
  cnt('boot_retry', has('boot_retry') ? 1 : 0);
  cnt('boot_fail', has('boot_fail') ? 1 : 0);
  cnt('fb_show_pv', has('fb_show') ? 1 : 0);
  cnt('fb_ans_pv', fb.length ? 1 : 0);
  cnt('out_pv', clicks.some((c) => c.out) ? 1 : 0);

  // ---------- dimensions ----------
  const cc = pv.cc || 'XX';
  const dims = {
    path: pv.path, chan: pv.chan, ref: refKey(pv.ref, pv.app), app: pv.app || null, land: pv.land || null, cc,
    reg: pv.reg ? `${cc}\t${pv.reg}` : null, city: pv.city ? `${cc}\t${pv.reg || ''}\t${pv.city}` : null,
    vw, os: pv.os || 'Outro', br: pv.br || 'Outro', lang: pv.lang, bl: pv.bl || 'xx', pc: String(pv.pc ? 1 : 0),
    cmp: pv.cmp || null, hr: String(pv.hr), wd: String(weekday(pv.day)),
  };
  for (const d of DIMS) if (dims[d] !== null && dims[d] !== undefined && dims[d] !== '') add(`d.${d}`, dims[d], 1, uv1, visit);
  if (engaged || quick || S[0]) for (const d of QDIMS) if (dims[d]) add(`q.${d}`, dims[d], engaged ? 1 : 0, quick ? 1 : 0, S[0] ? 1 : 0);
  if (pv.cc) {
    const ll = (v) => (Number.isFinite(v) ? v.toFixed(1) : '');
    add('geo', `${cc}\t${pv.reg || ''}\t${pv.city || ''}\t${ll(pv.lat)}\t${ll(pv.lon)}`, 1, uv1, visit);
  }
  add('vv', `${pv.tv ?? SCHEMA_VERSION}\t${pv.b || ''}`, 1, 0, 0);
  if (!pv.fin) add('nf.br', dims.br, 1, 0, 0);

  // ---------- reading the page ----------
  if (pv.fin || eng !== null) add('h.eng', String(binEng(eng ?? 0)), 1, 0, eng ?? 0);
  // the tracker leaves `scr` out while it is 0 (the first screen is under 5 % of the page): such a page view stayed at 0 %
  const scr = Number.isFinite(pv.scr) ? pv.scr : 0;
  add('h.scr', String(scr), 1, 0, 0); add(`sv.${vw}`, String(scr), 1, 0, 0);
  if (Number.isFinite(pv.vh)) add(`vph.${vw}`, String(pv.vh), 1, 0, 0);
  for (const z of new Set([...rz, ...Object.keys(sec)])) {
    const r = rz.has(z) ? 1 : 0, s = Number(sec[z]) || 0;
    if (!r && !s) continue;
    add('z', z, r, 0, s);
    add(`zv.${vw}`, z, r, 0, s);
  }
  if (pv.ex) add('z', pv.ex, 0, 1, 0);

  // ---------- route to the offer ----------
  const reach = named('offer_reach')[0];
  if (reach) {
    flag(`route.${reach.p.via || 'scroll'}`);
    if (Number.isFinite(reach.p.s)) add('h.arr', String(edgeOf(EDGES.arr, reach.p.s)), 1, 0, reach.p.s);
  } else if (S[0]) flag('route.scroll');

  // ---------- clicks ----------
  for (const c of clicks) {
    const ia = c.ia ? 1 : 0;
    const ck = `${c.sec}\t${c.sel}\t${c.lab || ''}\t${ia}`;
    add(`ck.${vw}`, ck, 1, uniq(`ck.${vw}`, ck), 0);
    const flags = [];
    if (c.dead) flags.push('dead');
    if (c.rage) flags.push('rage');
    if (c.err) flags.push(`err:${c.e || 'js'}`);
    for (const fl of flags) { const k = `${c.sel}\t${fl}`; add(`ckf.${vw}`, k, 1, uniq(`ckf.${vw}`, k), 0); }
    const box = c.rb || c.sel;
    if (Number.isFinite(c.ex) && Number.isFinite(c.ey)) {
      add(`cc.${vw}`, `${box}\t${Math.min(19, Math.floor(c.ex / 5))}\t${Math.min(19, Math.floor(c.ey / 5))}`, 1, c.dead ? 1 : 0, c.rage ? 1 : 0);
    }
    if (Number.isFinite(c.x) && Number.isFinite(c.y)) {
      add(`cz.${vw}`, `${box}\t${c.sec}\t${Math.min(98, Math.floor(c.x / 2) * 2)}\t${Math.floor(c.y / 20) * 20}`, 1, c.dead ? 1 : 0, c.rage ? 1 : 0);
    }
    if (c.out) {
      const type = outType(c.out, c.osp);
      const k = `${type}\t${c.sec}\t${type === 'patrocinador' || type === 'outro' ? c.out : ''}`;
      add('out', k, 1, uniq('out', k), 0);
      if (type === 'gofundme') flag('give.gfm');
    }
    if (c.cta) {
      if (uniq('ctav.u', c.cta)) add('ctav', c.cta, 0, 1, 0);
      if (c.cta === 'pkg-go') flag('pkg.go.click');
      if (c.cta === 'gofundme') flag('give.gfm');
    }
  }
  // exit through a link: the last outbound click or claim_send, with no later click (the click that fired a
  // claim_send may come right after it)
  if (pv.ex) {
    let lastLink = -1;
    for (const c of clicks) if (c.out) lastLink = Math.max(lastLink, c.i);
    for (const e of evs) if (e.n === 'claim_send') lastLink = Math.max(lastLink, e.i);
    if (lastLink >= 0 && !clicks.some((c) => c.i > lastLink + 1)) add('zl', pv.ex, 1, 0, 0);
  }

  // ---------- events ----------
  for (const e of evs) {
    const k = `${e.n}\t${canon(e.p)}`;
    add('ev', k, 1, uniq('ev', k), 0);
  }
  const spotAct = { spot_select: 'open', pkg_add: 'add', logo_try: 'try', spot_share: 'share', mockup_download: 'dl' };
  for (const e of evs) {
    const a = spotAct[e.n];
    if (a && e.p.spot) { const k = `${e.p.spot}\t${a}`; add('spot', k, 1, uniq('spot', k), 0); }
    if (e.n === 'cta_view' && e.p.id && uniq('ctav.n', e.p.id)) add('ctav', e.p.id, 1, 0, 0);
    if (e.n === 'studio_tap') add(`tap.${vw}`, `hit=${e.p.hit ? 1 : 0}`, 1, 0, 0);
  }
  // funnel and end state
  S.forEach((on, i) => { if (on) flag(`S${i}`); });
  if (S[3]) {
    const closes = named('claim_close');
    let end;
    if (S[6]) end = 'feito';
    else if (S[5]) end = 'copiou_saiu';
    else if (S[4] && closes.some((e) => e.p.step === 2)) end = 'fechou_passo2';
    else if (S[4] && !closes.length) end = 'saiu_passo2';
    else if (!S[4] && closes.some((e) => e.p.step === 1)) end = 'fechou_passo1';
    else end = 'aberta_saiu';
    flag(`end.${end}`);
  }
  // studio, per item
  for (const it of ITEMS) {
    const of = (n) => has(n, (p) => p.item === it);
    const ready = of('3d_ready') || of('studio_show');
    if (of('studio_near')) flag(`st.${it}.approached`);
    if (of('studio_seen')) flag(`st.${it}.seen`);
    if (ready) flag(`st.${it}.ready`);
    if (of('3d_fail')) flag(`st.${it}.fail`);
    let touched = false;
    for (const [n, g] of Object.entries(GESTURE)) if (of(n)) { touched = true; flag(`st.${it}.g.${g}`); }
    if (touched) { flag(`st.${it}.touched`); flag(`st.users.${it}`); }
    if (has('spot_select', (p) => itemOfSpot(p.spot) === it)) flag(`st.${it}.spot`);
    if (has('pkg_add', (p) => itemOfSpot(p.spot) === it)) flag(`st.${it}.add`);
    const wait = named('studio_wait', (p) => p.item === it)[0];
    if (wait) {
      if (!ready) flag(`st.${it}.leftwait`);
      if (Number.isFinite(wait.p.s)) add(`h.wait.${it}`, String(edgeOf(EDGES.wait, wait.p.s)), 1, 0, 0);
    }
    const r3 = named('3d_ready', (p) => p.item === it)[0];
    if (r3 && Number.isFinite(r3.p.ms)) add(`h.ms3d.${it}`, String(edgeOf(EDGES.ms3d, r3.p.ms)), 1, 0, 0);
  }
  // tour
  if (has('tour_start')) flag('tour.start');
  if (has('tour_end', (p) => p.how === 'fim')) flag('tour.fim');
  if (has('tour_end', (p) => p.how === 'parado')) flag('tour.parado');
  const tourEnd = named('tour_end')[0];
  if (tourEnd && evs.some((e) => e.n === 'spot_select' && e.i > tourEnd.i)) flag('tour.choice');
  // logo try-on
  if (has('try_open')) flag('try.open');
  const firstTry = named('logo_try')[0];
  if (firstTry) {
    flag('try.upload');
    if (evs.some((e) => (e.n === 'pkg_add' || e.n === 'claim_open') && e.i > firstTry.i)) flag('try.then');
  }
  if (has('logo_opt')) flag('try.opt');
  if (has('mockup_download')) flag('try.dl');
  if (has('logo_remove')) flag('try.rm');
  // the whole suit, the package bar
  if (has('cta_view', (p) => p.id === 'title')) flag('title.seen');
  if (has('title_click')) flag('title.click');
  const titleOpen = has('claim_open', (p) => p.via === 'title');
  if (titleOpen) flag('title.open');
  if (titleOpen && S[4]) flag('title.sent');
  if (has('cta_view', (p) => p.id === 'pkg-go')) flag('pkg.go.seen');
  if (pv.land && /^(spot:|pacote:|title$)/.test(pv.land)) flag('share.land');
  // support and contact
  if (has('give_copy', (p) => p.what === 'iban')) flag('give.iban');
  if (has('give_copy', (p) => p.what === 'mb')) flag('give.mb');
  if (has('give_kind')) flag('give.kind');
  if (has('kit_print')) flag('kit.btn');
  if (has('print')) flag('kit.print');
  // returns from another app, booking errors, the menu
  if (has('bf_return')) flag('ret.bf');
  if (has('bf_return', (p) => p.dlg === 1)) flag('ret.bf_dlg');
  if (has('claim_open', (p) => p.via === 'retoma')) flag('ret.resume');
  if (has('claim_error')) flag('claim.err');
  if (has('menu_open')) flag('menu.open');
  // language switch timing (the first switch)
  const sw = named('lang_switch')[0];
  if (sw && Number.isFinite(sw.p.s)) add('h.sw', String(edgeOf(EDGES.sw, sw.p.s)), 1, 0, 0);

  // ---------- errors ----------
  for (const e of errs) {
    const sig = `${e.t}\t${e.m || ''}\t${e.f}:${e.l ?? 0}:${e.c ?? 0}`;
    add('err', sig, Number.isInteger(e.n) && e.n > 0 ? e.n : 1, uniq('err', sig), 0);
    if (uniq('err.br', sig)) add('err.br', `${sig}\t${dims.br}`, 1, 0, 0);
    if (uniq('err.b', sig)) add('err.b', `${sig}\t${pv.b || ''}`, 1, 0, 0);
  }

  // ---------- feedback answers ----------
  for (const a of fb) add('fb', `${a.q}\t${a.a}\t${pv.lang}\t${vw}\t${a.ex || ''}`, 1, 0, 0);

  // ---------- vitals ----------
  for (const v of VITALS) {
    const val = pv[v];
    if (!Number.isFinite(val)) continue;
    add(`h.${v}`, VBIN[v](val), 1, 0, val);
    add(`vit.${v}`, rating(v, val), 1, 0, 0);
    if (v === 'lcp' || v === 'inp' || v === 'cls') {
      const t = v === 'lcp' ? pv.lcpT : v === 'inp' ? pv.inpT : pv.clsT;
      if (t) add(`vt.${v}`, `${t}\t${v === 'inp' ? pv.inpK || '' : ''}`, 1, 0, val);
    }
  }
}
