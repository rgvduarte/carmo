// The admin read API over accumulators (SPEC 2.8, 3.6). Builders never touch SQL: the store reads what `plan()` asks
// for into one `Acc` per window, then `build()` shapes the answer. k-folding runs here, after the device filter and
// after summing the range.

import {
  ZONES, FIXED, FIXED_SET, VW, ITEMS, CTAS, SPOTS, SCRUBBED,
} from './schema.js';
import { channelOf, alwaysShown } from './ua.js';
import { THRESH, EDGES, VITALS } from './derive.js';
import { addDays, daysBetween, isoWeek } from './time.js';

const K = 3;              // privacy 2.7: places and referrer hosts below 3 visitor-days are folded
const HEAT_MIN = 5;       // privacy 2.4: no heatmap layer below 5 page views
const Z3 = [0, 0, 0];
const EMPTY = new Map();

export const r4 = (v) => Math.round(v * 1e4) / 1e4;
export const r1 = (v) => Math.round(v * 10) / 10;
export const rate = (a, b) => (b ? r4(a / b) : null);
const int = (v) => Math.round(v || 0);
// a total order for ties, so the same data always gives the same list (live and rolled up alike)
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- the accumulator ----------
// slots: days ('YYYY-MM-DD') or hours ('YYYY-MM-DD HH'), in order. Each slot holds m → k → [n, u, s].
export class Acc {
  constructor(slots) { this.slots = slots; this.data = new Map(); this.memo = new Map(); }
  add(slot, m, k, n, u, s) {
    let sm = this.data.get(slot);
    if (!sm) this.data.set(slot, (sm = new Map()));
    let km = sm.get(m);
    if (!km) sm.set(m, (km = new Map()));
    const a = km.get(k);
    if (a) { a[0] += n; a[1] += u; a[2] += s; } else km.set(k, [n, u, s]);
  }
  rows(m) {
    let t = this.memo.get(m);
    if (t) return t;
    t = new Map();
    for (const sm of this.data.values()) {
      const km = sm.get(m);
      if (!km) continue;
      for (const [k, a] of km) { const b = t.get(k); if (b) { b[0] += a[0]; b[1] += a[1]; b[2] += a[2]; } else t.set(k, [a[0], a[1], a[2]]); }
    }
    this.memo.set(m, t);
    return t;
  }
  get(m, k) { return this.rows(m).get(k) || Z3; }
  n(m, k) { return this.get(m, k)[0]; }
  c(k) { return this.get('c', k)[0]; }
  f(k) { return this.get('f', k)[0]; }
  slotRows(slot, m) { const sm = this.data.get(slot); return (sm && sm.get(m)) || EMPTY; }
  slotN(slot, m, k, i = 0) { const a = this.slotRows(slot, m).get(k); return a ? a[i] : 0; }
  // the Acc of one slot, for per-day figures (sparks, daily series)
  slot(slot) { const a = new Acc([slot]); const sm = this.data.get(slot); if (sm) a.data.set(slot, sm); return a; }
  sum(m, pred, i = 0) { let t = 0; for (const [k, a] of this.rows(m)) if (pred(k)) t += a[i]; return t; }
}

// ---------- shared shapes ----------
// Ranked: rows by n desc, the tail (beyond `top`) and anything folded in `other`
function ranked(map, { top = Infinity, fold = null, keep = null, extra = null, otherK = 'outros', skip = null } = {}) {
  let rows = [];
  let other = null, total = 0;
  const addOther = (r) => { other = other || { k: otherK, n: 0, u: 0, x: 0 }; other.n += r.n; other.u += r.u; other.x += r.x; };
  for (const [k, a] of map) {
    if (skip && skip(k)) continue;
    if (!a[0] && !a[1]) continue;
    const r = { k, n: int(a[0]), u: int(a[1]), x: int(a[2]) };
    total += r.n;
    if (fold && fold(r) && !(keep && keep(k))) { addOther(r); continue; }
    rows.push(r);
  }
  rows.sort((a, b) => b.n - a.n || b.u - a.u || cmp(a.k, b.k));
  if (rows.length > top) { for (const r of rows.slice(top)) addOther(r); rows = rows.slice(0, top); }
  if (extra) for (const r of rows) extra(r);
  if (other && extra) extra(other);
  return { rows, other, total };
}
// a ranked list summed by a function of the key (several keys → one row)
function regroup(map, keyOf, i = 0) {
  const out = new Map();
  for (const [k, a] of map) {
    const g = keyOf(k);
    if (g === null || g === undefined) continue;
    const b = out.get(g) || [0, 0, 0];
    b[0] += a[0]; b[1] += a[1]; b[2] += a[2];
    out.set(g, b);
  }
  return out;
}
const splitK = (k) => k.split('\t');
// `ev` rows → [{ name, p: {k: v}, n, u }]
function evRows(acc, name) {
  const out = [];
  for (const [k, a] of acc.rows('ev')) {
    const [n, ps] = splitK(k);
    if (n !== name) continue;
    const p = {};
    if (ps) for (const kv of ps.split('&')) { const i = kv.indexOf('='); p[kv.slice(0, i)] = kv.slice(i + 1); }
    out.push({ p, n: a[0], u: a[1] });
  }
  return out;
}
const evBy = (acc, name, param, i = 'u') => {
  const m = new Map();
  for (const r of evRows(acc, name)) { const v = r.p[param]; if (v === undefined) continue; m.set(v, (m.get(v) || 0) + r[i]); }
  return m;
};

// ---------- histograms ----------
// bins from rows keyed by bin start ('X' or 'X+' for the open last bin); width(lo) gives the bin width
function binsOf(map, width) {
  const out = [];
  for (const [k, a] of map) {
    const open = k.endsWith('+');
    const lo = Number(open ? k.slice(0, -1) : k);
    if (!Number.isFinite(lo) || !a[0]) continue;
    out.push({ lo, hi: open ? lo : lo + width(lo), n: a[0], s: a[2] });
  }
  return out.sort((a, b) => a.lo - b.lo);
}
function quantile(bins, q) {
  const N = bins.reduce((t, b) => t + b.n, 0);
  if (!N) return null;
  const target = q * N;
  let cum = 0;
  for (const b of bins) {
    if (cum + b.n >= target) return b.lo + ((target - cum) / b.n) * (b.hi - b.lo);
    cum += b.n;
  }
  return bins[bins.length - 1].hi;
}
function meanOf(bins) { const N = bins.reduce((t, b) => t + b.n, 0); return N ? bins.reduce((t, b) => t + b.s, 0) / N : null; }
const nextEdge = (edges) => (lo) => { const i = edges.indexOf(lo); return i >= 0 && i < edges.length - 1 ? edges[i + 1] - lo : 0; };
const WIDTH = {
  eng: (lo) => (lo < 600 ? 5 : 60), lcp: () => 100, fcp: () => 100, inp: () => 25, ttfb: () => 50, cls: () => 0.01,
};
// Hist over coarse `edges` (n[i] = values in [edges[i], edges[i+1]), the last one open) from fine bins
function hist(bins, edges, { mean = true, round = r1 } = {}) {
  const n = edges.map(() => 0);
  for (const b of bins) {
    let i = 0;
    for (let j = 0; j < edges.length; j++) if (b.lo >= edges[j]) i = j;
    n[i] += b.n;
  }
  const q = (x) => { const v = quantile(bins, x); return v === null ? null : round(v); };
  const m = mean ? meanOf(bins) : null;
  return { edges, n: n.map(int), median: q(0.5), mean: m === null ? null : round(m), p75: q(0.75), p90: q(0.9) };
}
const edgeHist = (acc, m, edges) => hist(binsOf(acc.rows(m), nextEdge(edges)), edges, { mean: false });
const engBins = (acc) => binsOf(acc.rows('h.eng'), WIDTH.eng);

// ---------- KPIs ----------
// value(acc, ctx) → number|null; a Kpi has the current value, the previous one and 30 daily values
function kpi(w, value, which = 'cur') {
  const cur = w[which], prev = w[which === 'curAll' ? 'prevAll' : 'prev'], spark = w[which === 'curAll' ? 'sparkAll' : 'spark'];
  return {
    v: value(cur, w.ctx.range.days),
    prev: prev ? value(prev, w.ctx.range.days) : null,
    spark: spark ? spark.slots.map((d) => value(spark.slot(d), 1)) : [],
  };
}
const yesOf = (acc) => {
  let sim = 0, nao = 0;
  for (const [k, a] of acc.rows('fb')) { const [q, ans] = splitK(k); if (q === 'patrocinio') { if (ans === 'sim') sim += a[0]; else if (ans === 'nao') nao += a[0]; } }
  for (const [k, a] of acc.rows('fbs')) { const [q, ans] = splitK(k); if (q === 'patrocinio') { if (ans === 'sim') sim += a[0]; else if (ans === 'nao') nao += a[0]; } }
  return { sim, nao };
};

// ---------- what each endpoint reads ----------
const D = (...xs) => xs;
const vwKeys = (p) => VW.map((w) => `${p}.${w}`);
const ENDPOINTS = {
  overview: {
    cur: D('c', 'd.chan', 'd.cc', 'z', 'f', 'fb', 'fbs', 'ctav', 'h.eng', ...vwKeys('tap')),
    curAll: D('f'),
    prev: D('c', 'f', 'fb', 'fbs', 'ctav', 'h.eng', ...vwKeys('tap')),
    prevAll: D('f'),
    spark: D('c', 'fb', 'fbs', 'h.eng'),
    sparkAll: D('f'),
  },
  audience: {
    cur: D('c', 'd.chan', 'q.chan', 'd.ref', 'd.app', 'd.land', 'd.cmp', 'd.vw', 'd.os', 'd.br', 'd.pc', 'd.lang', 'q.lang', 'd.bl', 'd.hr', 'd.wd', 'ev', 'h.sw'),
    split: D('c'),
    curAll: D('d.cc', 'd.reg', 'd.city', 'geo'),
    prev: D('c'),
    spark: D('c'),
  },
  content: { cur: D('c', 'z', 'zl', 'f', 'h.arr', 'h.scr', 'h.eng', 'ctav', 'ev') },
  studio: { cur: D('f', 'ev', 'spot', ...ITEMS.map((i) => `h.wait.${i}`), ...vwKeys('tap')) },
  booking: { curAll: D('f', 'ev', 'spot'), prevAll: D('f') },
  contacts: { cur: D('c', 'out', 'f', 'ev') },
  quality: {
    cur: D('c', 'f', 'ev', 'err', 'err.br', 'err.b', 'nf.br', ...VITALS.map((v) => `h.${v}`), ...VITALS.map((v) => `vit.${v}`),
      'vt.lcp', 'vt.inp', 'vt.cls', ...ITEMS.map((i) => `h.ms3d.${i}`)),
    split: D('vit.lcp', 'vit.inp', 'vit.cls'),
  },
  feedback: { cur: D('c', 'fb', 'fbs') },
  system: { cur: D('vv') },
};
export const ENDPOINT_NAMES = [...Object.keys(ENDPOINTS), 'heatmap'];

// plan(endpoint, P) → windows to read. P = { period: {range, prev, win, pwin}, dev, int, vw, today }
export function plan(endpoint, P) {
  const { win, pwin, range } = P.period;
  const w = [];
  const spec = endpoint === 'heatmap' ? heatSpec(P.vw) : ENDPOINTS[endpoint];
  if (!spec) return null;
  const sparkWin = { from: addDays(range.to, -29), to: range.to };
  const add = (name, base, ms, dev) => { if (ms && base) w.push({ name, ...base, dev, ms: [...new Set(ms)], split: new Set(spec.split || []) }); };
  // the page-view count of the answer (Env.pv) needs `c` in the main window
  add('cur', win, spec.cur && ['c', ...spec.cur], P.dev);
  add('curAll', win, spec.curAll && (spec.cur ? spec.curAll : ['c', ...spec.curAll]), 'all');
  add('prev', pwin, spec.prev, P.dev);
  add('prevAll', pwin, spec.prevAll, 'all');
  add('spark', sparkWin, spec.spark, P.dev);
  add('sparkAll', sparkWin, spec.sparkAll, 'all');
  return w;
}
function heatSpec(vw) {
  if (vw === 'all') return { cur: D('c', 'h.scr', 'z', ...vwKeys('ck'), ...vwKeys('ckf'), ...vwKeys('vph')) };
  return { cur: D('d.vw', `ck.${vw}`, `ckf.${vw}`, `cc.${vw}`, `cz.${vw}`, `sv.${vw}`, `zv.${vw}`, `vph.${vw}`) };
}

// ---------- builders ----------
// w = { cur, curAll, prev, prevAll, spark, sparkAll, ctx }, ctx = { range, prev, filters, notes, today, … }
export function build(endpoint, w) {
  const fn = BUILD[endpoint];
  return fn(w);
}

const seriesX = (acc, range) => (range.unit === 'hour' ? acc.slots.map((s) => s.slice(11, 13)) : acc.slots.slice());
const funnelOf = (cur, prev) => ['S0', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6'].map((step) => ({ step, n: int(cur.f(step)), prev: prev ? int(prev.f(step)) : null }));
const noteIn = (notes, range) => notes.filter((n) => n.day >= range.from && n.day <= range.to);
const pvOf = (acc) => acc.c('pv');

const BUILD = {
  overview(w) {
    const { cur, curAll, ctx } = w;
    const engMed = (a) => { const v = quantile(engBins(a), 0.5); return v === null ? null : r1(v); };
    const k = {
      pv: kpi(w, (a) => int(a.c('pv'))),
      visits: kpi(w, (a) => int(a.c('visits'))),
      uv: kpi(w, (a) => int(a.c('uv'))),
      uvAvg: kpi(w, (a, days) => (days ? r1(a.c('uv') / days) : null)),
      engMedian: kpi(w, engMed),
      engMean: kpi(w, (a) => (a.c('eng_n') ? r1(a.c('eng_sum') / a.c('eng_n')) : null)),
      engaged: kpi(w, (a) => rate(a.c('engaged'), a.c('pv'))),
      quick: kpi(w, (a) => rate(a.c('quick'), a.c('pv'))),
      offer: kpi(w, (a) => rate(a.c('s0'), a.c('pv'))),
      sends: kpi(w, (a) => int(a.f('S4')), 'curAll'),
      errPv: kpi(w, (a) => rate(a.c('err_pv'), a.c('pv'))),
      yes: kpi(w, (a) => { const { sim, nao } = yesOf(a); return rate(sim, sim + nao); }),
    };
    const series = { x: seriesX(cur, ctx.range), unit: ctx.range.unit, s: {} };
    for (const [name, key] of [['pv', 'pv'], ['visits', 'visits'], ['uv', 'uv']]) series.s[name] = cur.slots.map((s) => int(cur.slotN(s, 'c', key)));
    const pv = pvOf(cur);
    const d8 = d8Of(cur, w.prev, curAll, w.prevAll);
    // D13, privacy 2.7: a period with today in it («24 h», or a custom one up to today) changes between two reads, so
    // it gets totals and the series only: no source, no country, no section, nothing of the funnel
    const live = ctx.range.unit === 'hour' || ctx.range.to >= ctx.today;
    if (live) {
      for (const id of ['sends', 'offer']) k[id] = { v: null, prev: null, spark: [] };
      for (const x of d8) if (x.id === 'brand') Object.assign(x, { v: null, prev: null, base: 0 });
    }
    const none = { rows: [], other: null, total: 0 };
    return {
      kpi: k, series, notes: noteIn(ctx.notes, ctx.range),
      chan: live ? none : ranked(cur.rows('d.chan'), { top: 5 }),
      cc: live ? none : ranked(cur.rows('d.cc'), { top: 5 }),
      reach: live ? [] : ZONES.map((z) => ({ z, r: rate(cur.n('z', z), pv) ?? 0 })),
      funnel: live ? [] : funnelOf(curAll, w.prevAll),
      d8, live,
      allDevices: ['funnel', 'kpi.sends', 'd8.brand'],
    };
  },

  audience(w) {
    const { cur, curAll, ctx } = w;
    const pv = pvOf(cur);
    const q = cur.rows('q.chan');
    const chan = ranked(cur.rows('d.chan'), {
      extra: (r) => { const a = q.get(r.k) || Z3; r.r = rate(a[0], r.n); r.q = rate(a[1], r.n); r.f = rate(a[2], r.n); },
    });
    const ref = ranked(cur.rows('d.ref'), {
      skip: (k) => k === 'direto' || k === 'interno',
      fold: (r) => r.u < K, keep: alwaysShown, otherK: 'outros sites',
      extra: (r) => { r.g = r.k === 'outros sites' ? 'outros' : / \(app\)$/.test(r.k) ? 'social' : channelOf(r.k, null); },
    });
    const ql = cur.rows('q.lang');
    const devRows = new Map();
    for (const d of ['mobile', 'tablet', 'desktop']) {
      const a = [cur.n(`c@${d}`, 'pv'), cur.n(`c@${d}`, 'uv'), cur.n(`c@${d}`, 'visits')];
      if (a[0]) devRows.set(d, a);
    }
    const pcRows = cur.rows('d.pc');
    const swBy = evBy(cur, 'lang_switch', 'from');
    const cmpRows = cur.rows('d.cmp');
    return {
      geo: geoOf(curAll),
      chan, ref,
      app: ranked(cur.rows('d.app')),
      inApp: kpi(w, (a) => rate(a.c('inapp_pv'), a.c('pv'))),
      land: ranked(cur.rows('d.land')),
      cmp: cmpRows.size ? ranked(cmpRows) : null,
      dev: ranked(devRows),
      vw: ranked(cur.rows('d.vw')),
      os: ranked(cur.rows('d.os'), { top: 8 }),
      br: ranked(cur.rows('d.br'), { top: 8 }),
      pc: { coarse: int((pcRows.get('1') || Z3)[0]), fine: int((pcRows.get('0') || Z3)[0]) },
      lang: ranked(cur.rows('d.lang'), { extra: (r) => { r.r = rate((ql.get(r.k) || Z3)[0], r.n); } }),
      bl: ranked(cur.rows('d.bl'), { top: 10 }),
      sw: {
        pv: int(cur.c('lang_sw_pv')), rate: rate(cur.c('lang_sw_pv'), pv) ?? 0,
        byLand: ['pt', 'en'].map((k) => ({ k, n: int(cur.n('d.lang', k)), sw: int(swBy.get(k) || 0) })),
        timing: edgeHist(cur, 'h.sw', EDGES.sw),
      },
      hours: Array.from({ length: 24 }, (_, h) => int(cur.n('d.hr', String(h)))),
      weekdays: Array.from({ length: 7 }, (_, i) => int(cur.n('d.wd', String(i + 1)))),
      allDevices: ['geo'],
    };
  },

  content(w) {
    const { cur } = w;
    const pv = pvOf(cur);
    let total = cur.get('z', 'reserva')[2];
    for (const z of ZONES) total += cur.get('z', z)[2];
    const zones = ZONES.map((z) => {
      const [reached, exits, sec] = cur.get('z', z);
      return { z, reached: int(reached), r: rate(reached, pv) ?? 0, sec: int(sec), share: rate(sec, total) ?? 0,
        perPv: reached ? r1(sec / reached) : null, exits: int(exits), exitsLink: int(cur.n('zl', z)) };
    });
    const rs = cur.get('z', 'reserva')[2];
    const nav = new Map();
    for (const r of evRows(cur, 'nav_click')) { if (!r.p.to) continue; const a = nav.get(r.p.to) || [0, 0, 0]; a[0] += r.n; a[1] += r.u; nav.set(r.p.to, a); }
    const scrollN = Array.from({ length: 21 }, (_, i) => int(cur.n('h.scr', String(i * 5))));
    return {
      zones,
      reserva: { sec: int(rs), share: rate(rs, total) ?? 0 },
      offer: { reach: rate(cur.c('s0'), pv) ?? 0, before: rate(cur.c('beforefato'), pv) ?? 0 },
      routes: ['scroll', 'hero', 'nav', 'menu', 'link', 'outro'].map((k) => ({ k, n: int(cur.f(`route.${k}`)) })),
      arrival: edgeHist(cur, 'h.arr', EDGES.arr),
      scroll: { n: scrollN, beyondFirst: rate(cur.c('scrolled1'), pv) ?? 0 },
      eng: hist(engBins(cur), [0, 5, 15, 30, 60, 120, 300, 600]),
      ctas: CTAS.map((id) => { const [seen, clicked] = cur.get('ctav', id); return { id, seen: int(seen), clicked: int(clicked), ctr: rate(clicked, seen) }; }),
      menu: {
        opened: int(cur.f('menu.open')), base: int(cur.c('mt_pv')), targets: ranked(nav),
        backTop: int(evRows(cur, 'back_top').reduce((t, r) => t + r.n, 0)),
      },
    };
  },

  heatmap(w) {
    const { cur, ctx } = w;
    const vw = ctx.vw;
    const all = vw === 'all';
    const pvBucket = int(all ? cur.c('pv') : cur.n('d.vw', vw));
    const enough = pvBucket >= HEAT_MIN;
    const out = { vw, pvBucket, enough, vh: null, elements: [], flagged: { dead: [], rage: [], err: [] }, cells: [], zcells: [], scroll: [], attention: [], fixed: [] };
    if (!enough) return out;
    const vws = all ? VW : [vw];
    const merge = (p) => { const m = new Map(); for (const v of vws) for (const [k, a] of cur.rows(`${p}.${v}`)) { const b = m.get(k) || [0, 0, 0]; b[0] += a[0]; b[1] += a[1]; b[2] += a[2]; m.set(k, b); } return m; };
    // median viewport height
    const vph = [...merge('vph')].map(([k, a]) => [Number(k), a[0]]).filter(([v]) => Number.isFinite(v)).sort((a, b) => a[0] - b[0]);
    const N = vph.reduce((t, x) => t + x[1], 0);
    if (N) { let c = 0; for (const [v, n] of vph) { c += n; if (c >= N / 2) { out.vh = v; break; } } }
    // elements, with the flags of their selector
    const flags = new Map();       // sel → {dead, rage, err, codes: Map}
    const flagged = { dead: new Map(), rage: new Map(), err: new Map() };
    for (const [k, a] of merge('ckf')) {
      const [sel, fl] = splitK(k);
      const f = flags.get(sel) || { dead: 0, rage: 0, err: 0 };
      if (fl === 'dead') { f.dead += a[0]; flagged.dead.set(sel, [a[0], a[1], 0]); }
      else if (fl === 'rage') { f.rage += a[0]; flagged.rage.set(sel, [a[0], a[1], 0]); }
      else if (fl.startsWith('err:')) { f.err += a[0]; flagged.err.set(`${sel}\t${fl.slice(4)}`, [a[0], a[1], 0]); }
      flags.set(sel, f);
    }
    const els = [];
    for (const [k, a] of merge('ck')) {
      const [sec, sel, lab, ia] = splitK(k);
      els.push({ sel, lab, sec, ia: ia === '1' ? 1 : 0, n: int(a[0]), u: int(a[1]), dead: 0, rage: 0, err: 0 });
    }
    els.sort((a, b) => b.n - a.n || b.u - a.u || cmp(a.sel, b.sel) || cmp(a.sec, b.sec) || cmp(a.lab, b.lab) || a.ia - b.ia);
    const given = new Set();
    for (const e of els) { if (given.has(e.sel)) continue; const f = flags.get(e.sel); if (f) { e.dead = int(f.dead); e.rage = int(f.rage); e.err = int(f.err); } given.add(e.sel); }
    out.elements = els.slice(0, 200);
    out.fixed = els.filter((e) => FIXED_SET.has(e.sec)).map((e) => ({ layer: e.sec, sel: e.sel, lab: e.lab, n: e.n, dead: e.dead, rage: e.rage }));
    const rowsOf = (m) => [...m].map(([k, a]) => ({ k, n: int(a[0]), u: int(a[1]) })).sort((a, b) => b.n - a.n || cmp(a.k, b.k)).slice(0, 50);
    out.flagged = {
      dead: rowsOf(flagged.dead), rage: rowsOf(flagged.rage),
      err: [...flagged.err].map(([k, a]) => { const [sel, code] = splitK(k); return { k: sel, code, n: int(a[0]), u: int(a[1]) }; }).sort((a, b) => b.n - a.n || cmp(a.k, b.k) || cmp(a.code, b.code)).slice(0, 50),
    };
    if (all) {
      out.scroll = Array.from({ length: 21 }, (_, i) => int(cur.n('h.scr', String(i * 5))));
      out.attention = attentionOf(cur, 'z');
      return out;
    }
    // density cells: the 400 boxes with the most clicks
    const boxes = new Map();
    for (const [k, a] of cur.rows(`cc.${vw}`)) { const [b, cx, cy] = splitK(k); const list = boxes.get(b) || { n: 0, c: [] }; list.n += a[0]; list.c.push([Number(cx), Number(cy), int(a[0]), int(a[1]), int(a[2])]); boxes.set(b, list); }
    const zb = new Map();
    for (const [k, a] of cur.rows(`cz.${vw}`)) {
      const [b, z, x2, y20] = splitK(k);
      const key = `${b}\t${z}`;
      const list = zb.get(key) || { b, z, n: 0, c: [] };
      list.n += a[0]; list.c.push([Number(x2), Number(y20), int(a[0]), int(a[1]), int(a[2])]);
      zb.set(key, list);
      if (!boxes.has(b)) boxes.set(b, { n: 0, c: [], zOnly: true });
      boxes.get(b).zn = (boxes.get(b).zn || 0) + a[0];
    }
    const top = [...boxes].sort((a, b) => (b[1].n || b[1].zn || 0) - (a[1].n || a[1].zn || 0) || cmp(a[0], b[0])).slice(0, 400);
    const keep = new Set(top.map(([b]) => b));
    out.cells = top.filter(([, v]) => v.c.length).map(([b, v]) => ({ b, c: v.c.sort((x, y) => x[1] - y[1] || x[0] - y[0]) }));
    out.zcells = [...zb.values()].filter((v) => keep.has(v.b)).sort((x, y) => cmp(x.b, y.b) || cmp(x.z, y.z)).map((v) => ({ b: v.b, z: v.z, c: v.c.sort((x, y) => x[1] - y[1] || x[0] - y[0]) }));
    out.scroll = Array.from({ length: 21 }, (_, i) => int(cur.n(`sv.${vw}`, String(i * 5))));
    out.attention = attentionOf(cur, `zv.${vw}`);
    out.scrubbed = SCRUBBED;
    return out;
  },

  studio(w) {
    const { cur } = w;
    const items = {};
    for (const it of ITEMS) {
      const f = (s) => int(cur.f(`st.${it}.${s}`));
      items[it] = {
        approached: f('approached'), seen: f('seen'), ready: f('ready'), fail: f('fail'), touched: f('touched'),
        spot: f('spot'), add: f('add'), wait: edgeHist(cur, `h.wait.${it}`, EDGES.wait), leftBeforeReady: f('leftwait'),
      };
    }
    const gestures = ['rotate', 'tap', 'pinch', 'zoom', 'view', 'auto', 'spots', 'chapter', 'tour'].map((k) => ({
      k, suit: int(cur.f(`st.suit.g.${k}`)), helmet: int(cur.f(`st.helmet.g.${k}`)) }));
    let taps = 0, missed = 0;
    const byVw = VW.map((vw) => { const t = cur.n(`tap.${vw}`, 'hit=0') + cur.n(`tap.${vw}`, 'hit=1'); const m = cur.n(`tap.${vw}`, 'hit=0'); taps += t; missed += m; return { vw, taps: int(t), missed: int(m) }; });
    const from = evBy(cur, 'spot_select', 'from', 'n');
    const spot = (id, a) => int(cur.get('spot', `${id}\t${a}`)[1]);
    return {
      items, gestures, taps: { taps: int(taps), missed: int(missed), byVw },
      tour: { started: int(cur.f('tour.start')), fim: int(cur.f('tour.fim')), parado: int(cur.f('tour.parado')), choice: int(cur.f('tour.choice')) },
      from: ['3d', 'tabela', 'capitulo', 'teclas', 'link'].map((k) => ({ k, n: int(from.get(k) || 0) })),
      spots: SPOTS.map((id) => ({ id, opens: spot(id, 'open'), adds: spot(id, 'add'), tries: spot(id, 'try'), shares: spot(id, 'share'), downloads: spot(id, 'dl') })),
    };
  },

  booking(w) {
    const { curAll: cur, prevAll, ctx } = w;
    const f = (k) => int(cur.f(k));
    const by = (name, param, keys) => { const m = evBy(cur, name, param); return keys.map((k) => ({ k, n: int(m.get(k) || 0) })); };
    const ch = new Map();
    for (const r of evRows(cur, 'claim_send')) { if (!r.p.ch) continue; const a = ch.get(r.p.ch) || [0, 0, 0]; a[0] += r.n; a[1] += r.u; ch.set(r.p.ch, a); }
    const shares = new Map();
    for (const id of SPOTS) { const a = cur.get('spot', `${id}\tshare`); if (a[0]) shares.set(id, [a[0], a[1], 0]); }
    const hourly = ctx.range.unit === 'hour';
    return {
      funnel: funnelOf(cur, prevAll),
      ends: ['feito', 'copiou_saiu', 'fechou_passo2', 'saiu_passo2', 'fechou_passo1', 'aberta_saiu'].map((k) => ({ k, n: f(`end.${k}`) })),
      channels: ranked(ch),
      pay: {
        tabs: by('pay_tab', 'tab', ['mb', 'tr']), done: by('claim_done', 'tab', ['mb', 'tr']),
        copies: by('pay_copy', 'what', ['iban', 'mb', 'amt', 'ref', 'email']),
      },
      brand: { opens: f('S3'), errors: f('claim.err') },
      returns: { bf: f('ret.bf'), bfDialog: f('ret.bf_dlg'), resume: f('ret.resume') },
      packages: { sizes: by('claim_open', 'n', ['1', '2', '3+', 'title']), goSeen: f('pkg.go.seen'), goClicked: f('pkg.go.click') },
      title: { seen: f('title.seen'), clicked: f('title.click'), opened: f('title.open'), sent: f('title.sent') },
      tryon: { open: f('try.open'), upload: f('try.upload'), opt: f('try.opt'), download: f('try.dl'), remove: f('try.rm'), then: f('try.then') },
      share: { shares: int(evRows(cur, 'spot_share').reduce((t, r) => t + r.u, 0)), landings: f('share.land'), spots: ranked(shares) },
      // never hour × the funnel (D13, privacy 2.7)
      daily: hourly ? { x: [], s: { open: [], send: [] }, unit: 'hour' }
        : { x: cur.slots.slice(), unit: 'day', s: { open: cur.slots.map((s) => int(cur.slotN(s, 'f', 'S3'))), send: cur.slots.map((s) => int(cur.slotN(s, 'f', 'S4'))) } },
      ignored: ['dev'],
    };
  },

  contacts(w) {
    const { cur, ctx } = w;
    const types = new Map(), zones = new Map(), sponsors = new Map();
    for (const [k, a] of cur.rows('out')) {
      const [type, z, host] = splitK(k);
      const t = types.get(type) || [0, 0, 0]; t[0] += a[0]; t[1] += a[1]; types.set(type, t);
      const zk = `${type}\t${z}`; zones.set(zk, (zones.get(zk) || 0) + a[0]);
      if (type === 'patrocinador' && host) sponsors.set(host, (sponsors.get(host) || 0) + a[0]);
    }
    const views = int(evRows(cur, 'onsuit_view').reduce((t, r) => t + r.u, 0));
    const hourly = ctx.range.unit === 'hour';
    return {
      out: ranked(types),
      byZone: [...zones].map(([k, n]) => { const [type, z] = splitK(k); return { type, z, n: int(n) }; }).sort((a, b) => b.n - a.n || cmp(a.type, b.type) || cmp(a.z, b.z)),
      give: { iban: int(cur.f('give.iban')), mb: int(cur.f('give.mb')), gofundme: int(cur.f('give.gfm')), kind: int(cur.f('give.kind')) },
      kit: { button: int(cur.f('kit.btn')), print: int(cur.f('kit.print')) },
      sponsors: [...sponsors].map(([host, clicks]) => ({ host, views, clicks: int(clicks) })).sort((a, b) => b.clicks - a.clicks || cmp(a.host, b.host)),
      daily: hourly ? { x: [], s: { out: [] }, unit: 'hour' } : { x: cur.slots.slice(), unit: 'day', s: { out: cur.slots.map((s) => int(cur.slotN(s, 'c', 'out_pv'))) } },
    };
  },

  quality(w) {
    const { cur, ctx } = w;
    const vitals = {};
    for (const v of VITALS) {
      const bins = binsOf(cur.rows(`h.${v}`), WIDTH[v]);
      const p75 = quantile(bins, 0.75);
      const n = bins.reduce((t, b) => t + b.n, 0);
      vitals[v] = { p75: p75 === null ? null : v === 'cls' ? Math.round(p75 * 1000) / 1000 : Math.round(p75), n: int(n),
        good: int(cur.n(`vit.${v}`, 'good')), ni: int(cur.n(`vit.${v}`, 'ni')), poor: int(cur.n(`vit.${v}`, 'poor')) };
    }
    const byDev = ['mobile', 'tablet', 'desktop'].map((dev) => {
      const t = (v) => ['good', 'ni', 'poor'].map((r) => int(cur.n(`vit.${v}@${dev}`, r)));
      return { dev, lcp: t('lcp'), inp: t('inp'), cls: t('cls') };
    }).filter((r) => [...r.lcp, ...r.inp, ...r.cls].some((x) => x));
    const tgt = (v) => [...cur.rows(`vt.${v}`)].map(([k, a]) => { const [sel, kind] = splitK(k); return { sel, kind, n: int(a[0]), p75: null, mean: a[0] ? (v === 'cls' ? Math.round((a[2] / a[0]) * 1000) / 1000 : Math.round(a[2] / a[0])) : null }; })
      .sort((a, b) => b.n - a.n || cmp(a.sel, b.sel) || cmp(a.kind, b.kind)).slice(0, 20);
    const ready = ITEMS.map((item) => {
      const h = edgeHist(cur, `h.ms3d.${item}`, EDGES.ms3d);
      const rs = evRows(cur, '3d_ready').filter((r) => r.p.item === item);
      const all = rs.reduce((t, r) => t + r.u, 0), main = rs.filter((r) => r.p.mesh === 'main').reduce((t, r) => t + r.u, 0);
      return { item, p50: h.median === null ? null : Math.round(h.median), p90: h.p90 === null ? null : Math.round(h.p90), main: rate(main, all) ?? 0 };
    });
    const fail = evRows(cur, '3d_fail').map((r) => ({ item: r.p.item || '', why: r.p.why || 'unknown', n: int(r.u) })).sort((a, b) => b.n - a.n || cmp(a.item, b.item) || cmp(a.why, b.why));
    const failRate = {};
    for (const it of ITEMS) { const fl = cur.f(`st.${it}.fail`), rd = cur.f(`st.${it}.ready`); failRate[it] = rate(fl, fl + rd); }
    const assets = evRows(cur, 'asset_fail').map((r) => ({ what: r.p.what || '', name: r.p.name || r.p.spot || '', n: int(r.n), u: int(r.u) })).sort((a, b) => b.u - a.u || b.n - a.n || cmp(a.what, b.what) || cmp(a.name, b.name));
    // errors, top 50 by pages
    const errs = [];
    for (const [k, a] of cur.rows('err')) {
      const [t, m, loc] = splitK(k);
      const [f, l, c] = loc.split(':');
      errs.push({ sig: k, t, m, f, l: Number(l) || 0, c: Number(c) || 0, n: int(a[0]), u: int(a[1]) });
    }
    errs.sort((a, b) => b.u - a.u || b.n - a.n || cmp(a.sig, b.sig));
    const errors = errs.slice(0, 50).map((e) => {
      const br = [], builds = [];
      for (const [k, a] of cur.rows('err.br')) if (k.startsWith(`${e.sig}\t`)) br.push({ k: k.slice(e.sig.length + 1), n: int(a[0]) });
      for (const [k] of cur.rows('err.b')) if (k.startsWith(`${e.sig}\t`)) { const b = k.slice(e.sig.length + 1); if (b) builds.push(b); }
      const days = cur.slots.filter((s) => cur.slotRows(s, 'err').has(e.sig)).map((s) => s.slice(0, 10));
      return { t: e.t, m: e.m, f: e.f, l: e.l, c: e.c, n: e.n, u: e.u, br: br.sort((a, b) => b.n - a.n || cmp(a.k, b.k)).slice(0, 3), first: days[0] || null, last: days[days.length - 1] || null, builds: [...new Set(builds)].sort() };
    });
    const pv = pvOf(cur);
    const hourly = ctx.range.unit === 'hour';
    const daily = (fn) => cur.slots.map((s) => fn(cur.slot(s)));
    const p75Of = (a, v) => { const bins = binsOf(a.rows(`h.${v}`), WIDTH[v]); const n = bins.reduce((t, b) => t + b.n, 0); if (n < 5) return null; const q = quantile(bins, 0.75); return v === 'cls' ? Math.round(q * 1000) / 1000 : Math.round(q); };
    return {
      vitals, byDev, targets: { inp: tgt('inp'), lcp: tgt('lcp').map(({ kind, ...r }) => r), cls: tgt('cls').map(({ kind, p75, mean, ...r }) => r) },
      threeD: { ready, fail, failRate, glLost: int(evRows(cur, 'gl_lost').reduce((t, r) => t + r.u, 0)) },
      assets, boot: { retry: int(cur.c('boot_retry')), fail: int(cur.c('boot_fail')) }, reloads: rate(cur.c('reload_pv'), pv) ?? 0,
      errors,
      errRate: hourly ? { x: [], s: { rate: [] }, unit: 'hour' } : { x: cur.slots.slice(), unit: 'day', s: { rate: daily((a) => rate(a.c('err_pv'), a.c('pv'))) } },
      nofin: { rate: rate(pv - cur.c('fin'), pv) ?? 0, br: ranked(cur.rows('nf.br'), { top: 8 }) },
      vitalsDaily: hourly ? { x: [], s: { lcp: [], inp: [], cls: [] }, unit: 'hour' }
        : { x: cur.slots.slice(), unit: 'day', s: { lcp: daily((a) => p75Of(a, 'lcp')), inp: daily((a) => p75Of(a, 'inp')), cls: daily((a) => p75Of(a, 'cls')) } },
    };
  },

  feedback(w) {
    const { cur } = w;
    const { sim, nao } = yesOf(cur);
    const reasons = new Map(), lang = new Map(), vw = new Map(), zone = new Map();
    const bump = (map, k, ans, n) => { if (ans !== 'sim' && ans !== 'nao') return; const a = map.get(k) || { k, sim: 0, nao: 0 }; a[ans] += n; map.set(k, a); };
    let standalone = 0, standaloneYesNo = 0;
    for (const [k, a] of cur.rows('fb')) {
      const [q, ans, lg, w2, z] = splitK(k);
      if (q === 'patrocinio_porque') { const r = reasons.get(ans) || [0, 0, 0]; r[0] += a[0]; reasons.set(ans, r); continue; }
      if (q !== 'patrocinio') continue;
      bump(lang, lg, ans, a[0]); bump(vw, w2, ans, a[0]); bump(zone, z || '', ans, a[0]);
    }
    for (const [k, a] of cur.rows('fbs')) {
      const [q, ans, lg] = splitK(k);
      standalone += a[0];
      if (q === 'patrocinio_porque') { const r = reasons.get(ans) || [0, 0, 0]; r[0] += a[0]; reasons.set(ans, r); continue; }
      if (q === 'patrocinio') { standaloneYesNo += a[0]; bump(lang, lg, ans, a[0]); }
    }
    const weeks = new Map();
    for (const s of cur.slots) {
      const one = yesOf(cur.slot(s));
      if (!one.sim && !one.nao) continue;
      const wk = isoWeek(s.slice(0, 10));
      const a = weeks.get(wk) || { week: wk, sim: 0, nao: 0 };
      a.sim += one.sim; a.nao += one.nao; weeks.set(wk, a);
    }
    const list = (m) => [...m.values()].map((r) => ({ k: r.k, sim: int(r.sim), nao: int(r.nao) })).sort((a, b) => (b.sim + b.nao) - (a.sim + a.nao) || cmp(a.k, b.k));
    return {
      shown: int(cur.c('fb_show_pv')), answered: int(cur.c('fb_ans_pv') + standaloneYesNo), sim: int(sim), nao: int(nao),
      reasons: ranked(reasons),
      weekly: [...weeks.values()].map((r) => ({ week: r.week, sim: int(r.sim), nao: int(r.nao) })).sort((a, b) => (a.week < b.week ? -1 : 1)),
      by: { lang: list(lang), vw: list(vw), zone: list(zone).filter((r) => r.k) },
      standalone: int(standalone),
    };
  },

  system(w) {
    const { cur, ctx } = w;
    const tv = new Map(), b = new Map();
    for (const [k, a] of cur.rows('vv')) {
      const [t, bb] = splitK(k);
      const x = tv.get(t) || [0, 0, 0]; x[0] += a[0]; tv.set(t, x);
      if (bb) { const y = b.get(bb) || [0, 0, 0]; y[0] += a[0]; b.set(bb, y); }
    }
    return { ...ctx.system, versions: { tv: ranked(tv), b: ranked(b, { top: 10 }) }, notes: ctx.notes };
  },
};

function attentionOf(acc, m) {
  let total = 0;
  for (const z of ZONES) total += acc.get(m, z)[2];
  return ZONES.map((z) => { const [reached, , sec] = acc.get(m, z); return { z, reached: int(reached), sec: int(sec), share: rate(sec, total) ?? 0 }; });
}

// D8 «Percebe-se?»
function d8Of(cur, prev, curAll, prevAll) {
  const one = (a, aAll) => {
    if (!a) return null;
    const { sim, nao } = yesOf(a);
    let taps = 0, missed = 0;
    for (const vw of VW) { missed += a.n(`tap.${vw}`, 'hit=0'); taps += a.n(`tap.${vw}`, 'hit=0') + a.n(`tap.${vw}`, 'hit=1'); }
    const users = a.f('st.users.suit') + a.f('st.users.helmet');
    const pinch = a.f('st.suit.g.pinch') + a.f('st.helmet.g.pinch');
    const seen = a.f('st.suit.seen') + a.f('st.helmet.seen');
    const touched = a.f('st.suit.touched') + a.f('st.helmet.touched');
    const pv = a.c('pv');
    const s3 = aAll ? aAll.f('S3') : 0, err = aAll ? aAll.f('claim.err') : 0;
    return {
      yes: [sim, sim + nao], missed: [missed, taps], pinch: [pinch, users], untouched: [Math.max(0, seen - touched), seen],
      dead: [a.c('dead_pv'), pv], rage: [a.c('rage_pv'), pv], brand: [err, s3],
    };
  };
  const c = one(cur, curAll), p = one(prev, prevAll);
  const out = ['yes', 'missed', 'pinch', 'untouched', 'dead', 'rage', 'brand'].map((id) => ({
    id, v: rate(c[id][0], c[id][1]), prev: p ? rate(p[id][0], p[id][1]) : null, base: int(c[id][1]) }));
  // the lowest CTR among the 5 most seen CTAs
  const ctas = [...cur.rows('ctav')].filter(([, a]) => a[0] > 0).sort((x, y) => y[1][0] - x[1][0] || (x[0] < y[0] ? -1 : 1)).slice(0, 5);
  let low = null;
  for (const [id, a] of ctas) { const r = a[1] / a[0]; if (!low || r < low.r) low = { id, r, base: a[0] }; }
  const pc = low && prev ? prev.get('ctav', low.id) : null;
  out.push({ id: 'cta', v: low ? r4(low.r) : null, prev: pc && pc[0] ? r4(pc[1] / pc[0]) : null, base: low ? int(low.base) : 0, ...(low ? { extra: low.id } : {}) });
  return out;
}

// «Onde estão»: countries always; a city below K visitor-days goes into its region; a region (what is left of it once
// its shown cities are taken out) below K goes into the country's «Outras localidades» (privacy 2.7)
export function geoOf(acc) {
  const ccRows = acc.rows('d.cc'), regRows = acc.rows('d.reg'), cityRows = acc.rows('d.city');
  const geo = acc.rows('geo');
  const point = new Map();     // cc\treg\tcity → [lat, lon] with the most page views
  for (const [k, a] of geo) {
    const [cc, reg, city, lat, lon] = splitK(k);
    if (!city || lat === '' || lon === '') continue;
    const key = `${cc}\t${reg}\t${city}`;
    const p = point.get(key);
    if (!p || a[0] > p.n) point.set(key, { n: a[0], lat: Number(lat), lon: Number(lon) });
  }
  const cities = [], region = new Map(), other = new Map();
  const addTo = (map, k, n, u) => { const a = map.get(k) || [0, 0]; a[0] += n; a[1] += u; map.set(k, a); };
  for (const [k, a] of regRows) addTo(region, k, a[0], a[1]);
  for (const [k, a] of cityRows) {
    const [cc, reg, city] = splitK(k);
    if (a[1] >= K) {
      const p = point.get(k);
      cities.push({ cc, reg, city, n: int(a[0]), u: int(a[1]), lat: p ? p.lat : null, lon: p ? p.lon : null });
      if (reg) addTo(region, `${cc}\t${reg}`, -a[0], -a[1]);
      else addTo(other, cc, -a[0], -a[1]);      // shown city without a region: not part of «Outras localidades»
    }
  }
  // what a country has beyond its regions (no region known) is part of «Outras localidades»
  const regByCc = new Map();
  for (const [k, a] of regRows) { const cc = splitK(k)[0]; addTo(regByCc, cc, a[0], a[1]); }
  for (const [cc, a] of ccRows) { const r = regByCc.get(cc) || [0, 0]; addTo(other, cc, a[0] - r[0], a[1] - r[1]); }
  const regions = [];
  for (const [k, a] of region) {
    const [cc, reg] = splitK(k);
    if (a[0] <= 0 && a[1] <= 0) continue;
    if (a[1] >= K) regions.push({ cc, reg, n: int(a[0]), u: int(a[1]) });
    else addTo(other, cc, a[0], a[1]);
  }
  const otherPlaces = [...other].filter(([, a]) => a[0] > 0 || a[1] > 0).map(([cc, a]) => ({ cc, n: int(a[0]), u: int(a[1]) }));
  cities.sort((a, b) => b.u - a.u || b.n - a.n || cmp(a.cc, b.cc) || cmp(a.reg, b.reg) || cmp(a.city, b.city));
  regions.sort((a, b) => b.u - a.u || b.n - a.n || cmp(a.cc, b.cc) || cmp(a.reg, b.reg));
  otherPlaces.sort((a, b) => b.u - a.u || b.n - a.n || cmp(a.cc, b.cc));
  return { ignored: ['dev'], cc: ranked(ccRows), regions, cities, otherPlaces };
}

export { ranked, evRows, quantile, binsOf, WIDTH, hist, engBins, yesOf, attentionOf, splitK, daysBetween, K, HEAT_MIN, FIXED, THRESH };
