// The one Durable Object (SQLite) that holds everything (SPEC 2). Raw page views and event batches for 30 days, daily
// aggregates for 25 months, a monthly archive without places below the region, the day's salt and the day's set of
// visitor hashes, and the admin answers for whole past days until the next rollup. The Worker (index.js) has already
// checked and cleaned every message it passes in.

import { DurableObject } from 'cloudflare:workers';
import { derive, M_KEYS, ARCHIVE_SKIP } from './derive.js';
import { Acc, plan, build } from './query.js';
import { exportTable } from './csv.js';
import { scrubText } from './sanitize.js';
import { SCHEMA_VERSION } from './schema.js';
import {
  clock, period, addDays, daysBetween, nextLisbon, utcDay, addMonth, lastDayOfMonth, dayDiff, validDay,
  RAW_DAYS, DAILY_DAYS, CUSTOM_BACK, SYS_DAYS,
} from './time.js';

const DDL = [
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS salt (day TEXT PRIMARY KEY, s BLOB NOT NULL) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS seen (h BLOB PRIMARY KEY) WITHOUT ROWID',
  `CREATE TABLE IF NOT EXISTS pv (
    day TEXT NOT NULL, id TEXT NOT NULL, hr INTEGER NOT NULL,
    path TEXT NOT NULL, lang TEXT, bl TEXT, ref TEXT, chan TEXT NOT NULL, land TEXT, nav TEXT, cmp TEXT,
    vw TEXT NOT NULL, vh INTEGER, pc INTEGER NOT NULL DEFAULT 0,
    dev TEXT NOT NULL, os TEXT, br TEXT, app TEXT,
    cc TEXT, reg TEXT, city TEXT, lat REAL, lon REAL,
    int INTEGER NOT NULL DEFAULT 0, uv1 INTEGER NOT NULL DEFAULT 0, b TEXT, tv INTEGER,
    nf INTEGER NOT NULL DEFAULT 0, lastf INTEGER NOT NULL DEFAULT 0, fin INTEGER NOT NULL DEFAULT 0, ne INTEGER NOT NULL DEFAULT 0,
    eng INTEGER, scr INTEGER, s1 INTEGER NOT NULL DEFAULT 0, ex TEXT, sec TEXT, rz TEXT,
    lcp INTEGER, inp INTEGER, cls REAL, fcp INTEGER, ttfb INTEGER, lcpT TEXT, inpT TEXT, inpK TEXT, clsT TEXT,
    PRIMARY KEY (day, id)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS bx (day TEXT NOT NULL, id TEXT NOT NULL, f INTEGER NOT NULL, e TEXT NOT NULL,
    PRIMARY KEY (day, id, f)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS agg (m TEXT NOT NULL, day TEXT NOT NULL, dev TEXT NOT NULL, int INTEGER NOT NULL, k TEXT NOT NULL,
    n REAL NOT NULL DEFAULT 0, u REAL NOT NULL DEFAULT 0, s REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (m, day, dev, int, k)) WITHOUT ROWID`,
  `CREATE TABLE IF NOT EXISTS aggm (m TEXT NOT NULL, month TEXT NOT NULL, dev TEXT NOT NULL, int INTEGER NOT NULL, k TEXT NOT NULL,
    n REAL NOT NULL DEFAULT 0, u REAL NOT NULL DEFAULT 0, s REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (m, month, dev, int, k)) WITHOUT ROWID`,
  'CREATE TABLE IF NOT EXISTS sys (day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL, PRIMARY KEY (day, k)) WITHOUT ROWID',
  'CREATE TABLE IF NOT EXISTS notes (id INTEGER PRIMARY KEY, day TEXT NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL)',
  // admin answers for whole past days read from rolled-up days only: they change only at a rollup, a late write or a
  // note, which all empty this table (a 90-day tab reads 25 000 to 40 000 rows; the free plan reads 5 million a day)
  'CREATE TABLE IF NOT EXISTS ans (k TEXT PRIMARY KEY, v TEXT NOT NULL) WITHOUT ROWID',
];
const TABLES = ['meta', 'salt', 'seen', 'pv', 'bx', 'agg', 'aggm', 'sys', 'notes', 'ans'];
const PV_COLS = ['day', 'id', 'hr', 'path', 'lang', 'bl', 'ref', 'chan', 'land', 'nav', 'cmp', 'vw', 'vh', 'pc', 'dev', 'os', 'br',
  'app', 'cc', 'reg', 'city', 'lat', 'lon', 'int', 'uv1', 'b', 'tv', 'nf', 'lastf', 'fin', 'ne', 'eng', 'scr', 's1', 'ex',
  'sec', 'rz', 'lcp', 'inp', 'cls', 'fcp', 'ttfb', 'lcpT', 'inpT', 'inpK', 'clsT'];
const PERF = ['lcp', 'inp', 'cls', 'fcp', 'ttfb', 'lcpT', 'inpT', 'inpK', 'clsT'];
const ROLL_KEYS = M_KEYS.filter((m) => m !== 'fbs');          // fbs is written at ingest, never by the rollup
const NOTE_KINDS = new Set(['post', 'prova', 'imprensa', 'site']);
const MAX_PV_EVENTS = 250;
const MAX_FLUSH = 8192;          // characters of events stored from one request
const ROW_BUDGET = 80000;        // rows written in a UTC day (the free plan stops at 100 000): then no new page views
const PER_ADDR = 300;            // new page views a day from one address (/24), held in memory only
const LIVE_MS = 30 * 60e3;
const enc = new TextEncoder();
const qs = (n) => Array(n).fill('?').join(', ');
const nul = (v) => (v === undefined ? null : v);
const SEP = '\u0001';
const REJ_CODES = ['origem', 'tamanho', 'json', 'versao', 'esquema', 'limite', 'robo', 'cheio'];

export class Store extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.reset();
    ctx.blockConcurrencyWhile(async () => { this.migrate(); });
  }

  reset() {
    this.salt = null;                      // { day, s } of the current Lisbon day
    this.live = new Map();                 // pv → { t, int } while visible (memory only, D21)
    this.cnt = new Map();                  // UTC day → k → n, not yet in `sys`
    this.sysRows = null;                   // { day, n }: the UTC day's rows written, as already in `sys`
    this.perAddr = new Map();              // keyed /24 → new page views on this Lisbon day (memory only)
    this.perAddrDay = null;
    this.lastPersist = Date.now();
    this.cache = new Map();                // admin answers
    this.rawCache = new Map();             // derived raw days
    this.alarmAt = null;                   // the alarm set in storage (null: not read yet)
    this.gen = 0;                          // bumped by every write of visitor data
    this.touched = new Map();              // day → gen of its last write (a cached answer older than that is stale)
    this.flags = new Map();                // meta rows (rolled:<day>, late:<day>, cursor, archived:<month>, …)
    this.diagDays = new Map();             // Lisbon day → { v, gen }: pv and visits split by int (the diagnostic card)
  }

  migrate() {
    for (const q of DDL) this.sql.exec(q);
    const v = this.sql.exec("SELECT v FROM meta WHERE k = 'schema'").toArray()[0];
    if (!v) this.sql.exec("INSERT INTO meta (k, v) VALUES ('schema', ?)", String(SCHEMA_VERSION));
    this.flags = new Map(this.sql.exec('SELECT k, v FROM meta').toArray().map((r) => [r.k, r.v]));
  }

  // ---------- small SQL helpers (every row written and read is counted for the quota panel) ----------
  w(q, ...a) { const c = this.sql.exec(q, ...a); c.toArray(); this.count('rows', c.rowsWritten); this.count('rr', c.rowsRead); return c.rowsWritten; }
  all(q, ...a) { const c = this.sql.exec(q, ...a), r = c.toArray(); this.count('rr', c.rowsRead); return r; }
  one(q, ...a) { return this.all(q, ...a)[0]; }
  setMeta(k, v) { this.w('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v', k, v); this.flags.set(k, v); }
  delMeta(k) { if (!this.flags.has(k)) return; this.w('DELETE FROM meta WHERE k = ?', k); this.flags.delete(k); }
  isRolled(day) { return this.flags.get(`rolled:${day}`) === '1'; }
  aggValid(day) { return this.isRolled(day) && !this.flags.has(`late:${day}`); }
  cursor() { const c = this.flags.get('cursor'); if (!c) return null; try { return JSON.parse(c); } catch (_) { return null; } }

  // ---------- quota counters (sys) ----------
  // in memory until persist(): UTC day → k → n (the free quotas reset at 00:00 UTC)
  count(k, n = 1) {
    if (!n) return;
    const day = utcDay(Date.now());
    let m = this.cnt.get(day);
    if (!m) this.cnt.set(day, (m = new Map()));
    m.set(k, (m.get(k) || 0) + n);
  }
  // the Lisbon-day counters of the diagnostic card (l.req, l.ok, l.rej.<code>, l.drop.<why>): same table, written with
  // the others, but on the Lisbon day of the beacon (the day the dashboard uses)
  countOn(day, k, n = 1) {
    if (!n) return;
    // the first Lisbon day with counters: the card shows «sem contagem» (never 0) before it
    if (k === 'l.req') { const s = this.flags.get('lsince'); if (!s || day < s) this.setMeta('lsince', day); }
    let m = this.cnt.get(day);
    if (!m) this.cnt.set(day, (m = new Map()));
    m.set(k, (m.get(k) || 0) + n);
  }
  pendingCounts() { for (const m of this.cnt.values()) if (m.size) return true; return false; }
  // one DO request; the Worker's isolate counts (req, rej.*, and d:<day>:<k> for the Lisbon days) ride along
  enter(rej) {
    this.count('dor');
    if (!rej || typeof rej !== 'object') return;
    for (const [k, n] of Object.entries(rej)) {
      if (!Number.isInteger(n) || n <= 0) continue;
      if (/^(req|rej\.[a-z]+)$/.test(k)) { this.count(k, n); continue; }
      const d = k.match(/^d:(\d{4}-\d{2}-\d{2}):(req|ok|rej\.[a-z]+|drop\.[a-z]+)$/);
      if (d && this.dayNear(d[1])) this.countOn(d[1], `l.${d[2]}`, n);
    }
  }
  // a Lisbon day the isolate may count on: today - 2 … today + 1 of this object's clock (the dev clock of the tests and
  // the simulator moves days anywhere, so under DEV_HOOKS any valid day)
  dayNear(day) {
    if (!validDay(day)) return false;
    if (this.env.DEV_HOOKS === '1') return true;
    const today = clock(Date.now()).day;
    return day >= addDays(today, -2) && day <= addDays(today, 1);
  }
  // at most once a minute (and by the alarm, so an idle object that is evicted loses nothing)
  persist(force) {
    if (!this.pendingCounts()) return;
    if (!force && Date.now() - this.lastPersist < 60e3) return;
    const list = [];
    let upserts = 0;
    for (const [, m] of this.cnt) upserts += m.size;
    const today = utcDay(Date.now());
    const tm = this.cnt.get(today) || new Map();
    if (!tm.has('rows')) upserts += 1;
    this.cnt.set(today, tm);
    // each upsert below writes one row: counted in the same write
    tm.set('rows', (tm.get('rows') || 0) + upserts);
    for (const [day, m] of this.cnt) for (const [k, n] of m) list.push([day, k, n]);
    for (const [day, k, n] of list) if (k === 'rows' && this.sysRows && this.sysRows.day === day) this.sysRows.n += n;
    this.cnt = new Map();
    this.lastPersist = Date.now();
    this.ctx.storage.transactionSync(() => {
      for (const [day, k, n] of list) this.sql.exec('INSERT INTO sys (day, k, n) VALUES (?, ?, ?) ON CONFLICT (day, k) DO UPDATE SET n = n + excluded.n', day, k, n).toArray();
    });
  }

  // the two write limits; the simulator and the tests may lower them (DEV_HOOKS only)
  limit(name, dflt) { const n = Number(this.env.DEV_HOOKS === '1' && this.env[name]); return Number.isInteger(n) && n > 0 ? n : dflt; }
  // rows written so far on this UTC day (the free quota's day)
  rowsToday() {
    const day = utcDay(Date.now());
    if (!this.sysRows || this.sysRows.day !== day) {
      const r = this.sql.exec("SELECT n FROM sys WHERE day = ? AND k = 'rows'", day).toArray()[0];
      this.sysRows = { day, n: r ? r.n : 0 };
    }
    const m = this.cnt.get(day);
    return this.sysRows.n + ((m && m.get('rows')) || 0);
  }

  // ---------- the daily salt (2.4) ----------
  daySalt(day) {
    if (this.salt && this.salt.day === day) return this.salt.s;
    const asked = day;
    let s = null;
    this.ctx.storage.transactionSync(() => {
      const rows = this.all('SELECT day, s FROM salt');
      const cur = rows.find((r) => r.day === day);
      if (cur) { s = cur.s; return; }
      // never back to an earlier day (a dev clock may run ahead of the alarm's)
      const newer = rows.find((r) => r.day > day);
      if (newer) { s = newer.s; day = newer.day; return; }
      this.w('DELETE FROM salt WHERE day <> ?', day);
      this.w('DELETE FROM seen');
      s = crypto.getRandomValues(new Uint8Array(32)).buffer;
      this.w('INSERT INTO salt (day, s) VALUES (?, ?)', day, s);
    });
    this.salt = { day: asked, s };
    return s;
  }
  // the address (IPv6: its /64) and the UA of this request, never stored: only this hash, in `seen`, until the day ends
  async visitorHash(salt, msg) {
    const parts = [new Uint8Array(salt), enc.encode(String(this.env.SALT_SECRET || '')), enc.encode('gocarmo.com'), enc.encode(String(msg.ipH || '')),
      enc.encode('\n'), enc.encode(msg.ua), enc.encode('\n'), enc.encode(msg.day)];
    const all = new Uint8Array(parts.reduce((t, p) => t + p.length, 0));
    let o = 0;
    for (const p of parts) { all.set(p, o); o += p.length; }
    const d = await crypto.subtle.digest('SHA-256', all);
    return d.slice(0, 16);
  }

  // ---------- ingest (2.5) ----------
  // → { full } when the day's write budget is spent (the Worker then stops calling for the rest of the UTC day)
  async ingest(msg) {
    this.enter(msg.rej);
    if (!msg.pv) { this.persist(false); await this.armAlarm(); return {}; }       // a counts-only call
    const h = await this.visitorHash(this.daySalt(msg.day), msg);
    let r = {};
    this.ctx.storage.transactionSync(() => { r = this.ingestTx(msg, h); });
    if (r.day) { this.touch(r.day); this.touch(msg.day); this.touch(msg.yday); }
    // the diagnostic card: kept, or dropped by the per-address cap or the day's row budget
    if (r.day) this.countOn(msg.day, 'l.ok');
    else if (r.capped) this.countOn(msg.day, 'l.drop.teto');
    else if (r.full) this.countOn(msg.day, 'l.drop.cheio');
    // in memory only: who is on the page now
    this.live.delete(msg.pv);
    if (msg.vis && r.day) this.live.set(msg.pv, { t: msg.now, int: msg.meta.int });
    while (this.live.size > 5000) this.live.delete(this.live.keys().next().value);
    this.persist(false);
    await this.armAlarm();
    return { full: !!r.full };
  }

  ingestTx(msg, h) {
    const { day, yday, pv: id, snap } = msg;
    const COLS = 'day, nf, lastf, fin, ne, eng, scr, s1, ex, sec, rz';
    let row = this.one(`SELECT ${COLS} FROM pv WHERE day IN (?, ?) AND id = ?`, day, yday, id);
    // a tab looked at again days later sends the same page view: find it further back rather than count it twice
    if (!row && msg.f > 1) {
      const back = Array.from({ length: RAW_DAYS - 1 }, (_, i) => addDays(day, -2 - i));
      row = this.one(`SELECT ${COLS} FROM pv WHERE day IN (${qs(back.length)}) AND id = ?`, ...back, id);
    }
    if (!row) {
      // a new page view: within the day's write budget, and at most PER_ADDR a day from one address
      if (this.rowsToday() >= this.limit('DAY_ROWS', ROW_BUDGET)) return { full: true };
      if (this.perAddrDay !== day) { this.perAddr.clear(); this.perAddrDay = day; }
      if (msg.ak) {
        const n = this.perAddr.get(msg.ak) || 0;
        if (n >= this.limit('ADDR_PVS', PER_ADDR)) return { capped: true };
        this.perAddr.delete(msg.ak);
        this.perAddr.set(msg.ak, n + 1);
        while (this.perAddr.size > 20000) this.perAddr.delete(this.perAddr.keys().next().value);
      }
    }
    const rowDay = row ? row.day : day;
    let added = 0;
    if (msg.events.length && (!row || row.ne < MAX_PV_EVENTS)) {
      let list = msg.events.slice(0, MAX_PV_EVENTS - (row ? row.ne : 0)), json = JSON.stringify(list);
      while (list.length && json.length > MAX_FLUSH) { list = list.slice(0, -1); json = JSON.stringify(list); }
      if (list.length && this.w('INSERT OR IGNORE INTO bx (day, id, f, e) VALUES (?, ?, ?, ?)', rowDay, id, msg.f, json)) added = list.length;
    }
    const perf = snap.perf || {};
    const fin = msg.t === 'h' ? 1 : 0;
    if (!row) {
      const uv1 = this.w('INSERT OR IGNORE INTO seen (h) VALUES (?)', h) === 1 ? 1 : 0;
      const p = msg.page, m = msg.meta;
      const v = {
        day, id, hr: msg.hr, path: p.path, lang: p.lang, bl: p.bl, ref: p.ref, chan: m.chan, land: p.land, nav: p.nav, cmp: p.cmp,
        vw: p.vw, vh: p.vh, pc: p.pc, dev: m.dev, os: m.os, br: m.br, app: m.app, cc: m.cc, reg: m.reg, city: m.city,
        lat: m.lat, lon: m.lon, int: m.int, uv1, b: p.b, tv: p.tv, nf: 1, lastf: msg.f, fin, ne: added,
        eng: snap.eng, scr: snap.scr, s1: snap.s1 ? 1 : 0, ex: snap.ex,
        sec: snap.sec ? JSON.stringify(snap.sec) : null, rz: snap.rz ? JSON.stringify(snap.rz) : null,
        ...Object.fromEntries(PERF.map((k) => [k, perf[k]])),
      };
      this.w(`INSERT INTO pv (${PV_COLS.join(', ')}) VALUES (${qs(PV_COLS.length)})`, ...PV_COLS.map((k) => nul(v[k])));
    } else {
      const sec = mergeSec(row.sec, snap.sec), rz = mergeRz(row.rz, snap.rz);
      const max = (a, b) => (b === undefined || b === null ? a : a === null || a === undefined ? b : Math.max(a, b));
      const ex = msg.f > row.lastf && snap.ex ? snap.ex : row.ex;
      this.w(`UPDATE pv SET eng = ?, scr = ?, s1 = ?, ex = ?, sec = ?, rz = ?, ${PERF.map((k) => `${k} = COALESCE(?, ${k})`).join(', ')},
        nf = nf + 1, lastf = max(lastf, ?), fin = max(fin, ?), ne = ne + ? WHERE day = ? AND id = ?`,
      nul(max(row.eng, snap.eng)), nul(max(row.scr, snap.scr)), row.s1 || snap.s1 ? 1 : 0, nul(ex), sec, rz,
      ...PERF.map((k) => nul(perf[k])), msg.f, fin, added, rowDay, id);
    }
    // a day already rolled up (or being rolled up) got new data: roll it again tonight
    const cur = this.cursor();
    if (this.isRolled(rowDay) || (cur && cur.day === rowDay)) this.markLate(rowDay);
    return { isNew: !row, day: rowDay };
  }
  markLate(day) {
    const fresh = !this.flags.has(`late:${day}`);
    this.setMeta(`late:${day}`, String(Date.now()));
    if (fresh) this.dropAnswers();
  }
  dropAnswers() { this.w('DELETE FROM ans'); this.cache.clear(); }

  // ---------- feedback (3.4) ----------
  async feedback(msg) {
    this.enter(msg.rej);
    this.ctx.storage.transactionSync(() => {
      const row = msg.pv ? this.one('SELECT day FROM pv WHERE day IN (?, ?) AND id = ?', msg.day, msg.yday, msg.pv) : null;
      if (row) {
        const e = [{ i: 0, k: 'fb', q: msg.q, a: msg.a, ...(msg.ex ? { ex: msg.ex } : {}) }];
        this.w('INSERT OR IGNORE INTO bx (day, id, f, e) VALUES (?, ?, ?, ?)', row.day, msg.pv, msg.q === 'patrocinio' ? 100 : 101, JSON.stringify(e));
        const cur = this.cursor();
        if (this.isRolled(row.day) || (cur && cur.day === row.day)) this.markLate(row.day);
      } else {
        this.w(`INSERT INTO agg (m, day, dev, int, k, n, u, s) VALUES ('fbs', ?, ?, ?, ?, 1, 0, 0)
          ON CONFLICT (m, day, dev, int, k) DO UPDATE SET n = n + 1`, msg.day, msg.dev, msg.int, `${msg.q}\t${msg.a}\t${msg.lang}`);
      }
    });
    this.touch(msg.day); this.touch(msg.yday);
    this.countOn(msg.day, 'l.ok');
    this.persist(false);
    await this.armAlarm();
    return true;
  }

  // ---------- alarm: rotate, roll up, archive, prune (2.6) ----------
  // One alarm: the nightly run at 00:20 Lisbon, or sooner while counts wait in memory (written within a minute, so
  // an idle object that is evicted loses none). setAlarm is one row written.
  async armAlarm() {
    const now = Date.now();
    if (this.alarmAt === null) this.alarmAt = (await this.ctx.storage.getAlarm()) || 0;
    const set = this.alarmAt > now ? this.alarmAt : 0;
    let want = set || nextLisbon(now, 0, 20);
    // an idle object is dropped from memory (after about 70 s on Cloudflare, about 10 s in local workerd): the
    // waiting counts are written well before that
    if (this.pendingCounts()) want = Math.min(want, now + (this.env.DEV_HOOKS === '1' ? 3e3 : 30e3));
    if (set && set <= want) return;
    this.count('rows');
    await this.ctx.storage.setAlarm(want);
    this.alarmAt = want;
  }

  // the nightly work (rotate, roll up in chunks, archive, prune) runs once a day from 00:20 Lisbon; any alarm
  // writes the waiting counts
  async alarm(force = false) {
    this.alarmAt = 0;
    this.enter();
    const now = Date.now(), c = clock(now);
    this.daySalt(c.day);
    let more = false;
    const due = force || !!this.cursor() || ((c.hr > 0 || c.min >= 20) && this.flags.get('lastrun') !== c.day);
    if (due) {
      try { more = this.rollupStep(c); } catch (_) {
        console.error('rollup');
        more = false;
        this.flags = new Map(this.all('SELECT k, v FROM meta').map((r) => [r.k, r.v]));   // the transaction rolled back
      }
      if (!more) {
        try { this.archive(c); } catch (_) { console.error('archive'); }
        try { this.prune(c); } catch (_) { console.error('prune'); }
      }
    }
    const next = more ? now + 50 : nextLisbon(now, 0, 20);
    this.count('rows');
    this.persist(true);
    await this.ctx.storage.setAlarm(next);
    this.alarmAt = next;
  }

  touch(day) {
    this.touched.set(day, ++this.gen);
    if (this.touched.size > 8) for (const d of [...this.touched.keys()].sort().slice(0, -4)) this.touched.delete(d);
  }
  // a cached answer (or derived day) made at generation `gen` still holds for the days lo..hi
  fresh(gen, lo, hi) { for (const [d, g] of this.touched) if (d >= lo && d <= hi && g > gen) return false; return true; }

  chunkSize() { const n = Number(this.env.ROLLUP_CHUNK); return Number.isInteger(n) && n >= 5 && n <= 1000 ? n : 40; }

  // days waiting for a rollup, oldest first: within the raw window, before today, not rolled or marked late
  pendingDays(c) {
    const out = [];
    for (const d of daysBetween(addDays(c.day, -RAW_DAYS), c.yday)) {
      if (this.flags.has(`late:${d}`)) { out.push(d); continue; }
      if (this.isRolled(d)) continue;
      if (this.one('SELECT 1 AS x FROM pv WHERE day = ? LIMIT 1', d)) out.push(d);
      else this.setMeta(`rolled:${d}`, '1');        // nothing was recorded that day
    }
    return out;
  }

  rollupStep(c) {
    let cur = this.cursor();
    if (!cur) {
      const pending = this.pendingDays(c);
      if (!pending.length) return false;
      cur = { day: pending[0], after: '', chunk: 0, t0: Date.now() };
    }
    const done = this.rollChunk(cur, this.chunkSize(), true);
    return !done || this.pendingDays(c).length > 0;
  }

  // one chunk of a day's rollup; returns true when the day is finished
  rollChunk(cur, size, keepCursor) {
    const { day } = cur;
    const pvs = this.all('SELECT * FROM pv WHERE day = ? AND id > ? ORDER BY id LIMIT ?', day, cur.after, size);
    const acc = new Map();
    if (pvs.length) {
      const bx = this.all('SELECT id, f, e FROM bx WHERE day = ? AND id BETWEEN ? AND ? ORDER BY id, f', day, pvs[0].id, pvs[pvs.length - 1].id);
      const by = new Map();
      for (const r of bx) { const l = by.get(r.id); if (l) l.push(r); else by.set(r.id, [r]); }
      for (const pv of pvs) {
        const pre = `${pv.dev}${SEP}${pv.int ? 1 : 0}${SEP}`;
        derive(pv, by.get(pv.id) || [], (m, k, n, u, s) => {
          const key = `${m}${SEP}${pre}${k}`;
          const a = acc.get(key);
          if (a) { a[0] += n; a[1] += u; a[2] += s; } else acc.set(key, [n, u, s]);
        });
      }
    }
    const done = pvs.length < size;
    this.ctx.storage.transactionSync(() => {
      if (!cur.chunk) this.w(`DELETE FROM agg WHERE m IN (${qs(ROLL_KEYS.length)}) AND day = ?`, ...ROLL_KEYS, day);
      for (const [key, a] of acc) {
        const [m, dev, int, ...rest] = key.split(SEP);
        this.w(`INSERT INTO agg (m, day, dev, int, k, n, u, s) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (m, day, dev, int, k) DO UPDATE SET n = n + excluded.n, u = u + excluded.u, s = s + excluded.s`,
        m, day, dev, Number(int), rest.join(SEP), a[0], a[1], a[2]);
      }
      if (done) {
        this.setMeta(`rolled:${day}`, '1');
        const late = Number(this.flags.get(`late:${day}`));
        if (!(late >= cur.t0)) this.delMeta(`late:${day}`);   // a late write during this rollup: roll again
        if (keepCursor) this.delMeta('cursor');
        this.delMeta(`archived:${day.slice(0, 7)}`);
        this.setMeta('lastroll', day);
        this.w('DELETE FROM ans');
      } else if (keepCursor) {
        this.setMeta('cursor', JSON.stringify({ day, after: pvs[pvs.length - 1].id, chunk: cur.chunk + 1, t0: cur.t0 }));
      }
    });
    if (done) { this.cache.clear(); this.rawCache.clear(); }
    cur.after = pvs.length ? pvs[pvs.length - 1].id : cur.after;
    cur.chunk += 1;
    return done;
  }

  // monthly archive (D20): the previous month, once its last day is rolled up
  archive(c) {
    const month = addMonth(c.day.slice(0, 7), -1), last = lastDayOfMonth(month);
    if (this.flags.has(`archived:${month}`)) return;
    if (!this.isRolled(last) && last >= addDays(c.day, -RAW_DAYS)) return;
    const keys = M_KEYS.filter((m) => !ARCHIVE_SKIP(m));
    this.ctx.storage.transactionSync(() => {
      this.w(`DELETE FROM aggm WHERE m IN (${qs(keys.length)}) AND month = ?`, ...keys, month);
      for (const m of keys) {
        this.w(`INSERT INTO aggm (m, month, dev, int, k, n, u, s)
          SELECT m, ?, dev, int, k, sum(n), sum(u), sum(s) FROM agg WHERE m = ? AND day BETWEEN ? AND ? GROUP BY dev, int, k`,
        month, m, `${month}-01`, last);
      }
      this.setMeta(`archived:${month}`, '1');
    });
  }

  prune(c) {
    const rawCut = addDays(c.day, -RAW_DAYS), aggCut = addDays(c.day, -DAILY_DAYS), sysCut = addDays(utcDay(Date.now()), -SYS_DAYS);
    this.ctx.storage.transactionSync(() => {
      this.w('DELETE FROM pv WHERE day < ?', rawCut);
      this.w('DELETE FROM bx WHERE day < ?', rawCut);
      this.w(`DELETE FROM agg WHERE m IN (${qs(M_KEYS.length)}) AND day < ?`, ...M_KEYS, aggCut);
      this.w('DELETE FROM sys WHERE day < ?', sysCut);
      this.w('DELETE FROM ans');
      for (const p of ['rolled:', 'late:']) {
        for (const r of this.all('SELECT k FROM meta WHERE k >= ? AND k < ?', p, `${p}${rawCut}`)) this.delMeta(r.k);
      }
      this.setMeta('dbsize', String(this.sql.databaseSize));
      this.setMeta('lastrun', c.day);
    });
  }

  // ---------- admin reads (2.8) ----------
  async ping() { this.enter(); await this.armAlarm(); return { ok: true, schema: SCHEMA_VERSION }; }

  // the first day with data, raw or rolled up (both are key prefixes: two index reads)
  firstDay() {
    const a = this.one('SELECT min(day) AS d FROM pv');
    const b = this.one("SELECT min(day) AS d FROM agg WHERE m = 'c'");
    return [a && a.d, b && b.d].filter(Boolean).sort()[0] || null;
  }

  async adminPing(P) {
    this.enter(P.rej);
    await this.armAlarm();
    const today = P.clock.day;
    const oldest = this.firstDay();
    return { ok: true, v: 1, today, oldest, complete: oldest && oldest < today ? dayDiff(oldest, today) : 0, retention: { raw: RAW_DAYS, daily: DAILY_DAYS } };
  }

  // «Agora no site» (D21): who has the page open, and today's totals. Nothing by minute, place or source: polled every
  // 30 s, any of those would tie one arrival to where it came from (privacy 2.7)
  async now(P) {
    this.enter(P.rej);
    await this.armAlarm();
    const t = P.clock.now, cut = t - LIVE_MS;
    let n = 0;
    for (const [id, v] of this.live) {
      if (v.t < cut) { this.live.delete(id); continue; }
      if (!P.int && v.int) continue;
      n++;
    }
    const r = this.one(`SELECT count(*) AS n, sum(uv1) AS u,
      sum(CASE WHEN nav IN ('navigate', 'prerender') AND ref <> 'interno' THEN 1 ELSE 0 END) AS x
      FROM pv WHERE day = ? AND int <= ?`, P.clock.day, P.int ? 1 : 0) || {};
    const hh = String(P.clock.hr).padStart(2, '0'), mm = String(P.clock.min).padStart(2, '0');
    return { ok: true, v: 1, at: `${hh}:${mm}`, now: n, today: { pv: r.n || 0, uv: r.u || 0, visits: r.x || 0 } };
  }

  // «Diagnóstico» (the «Dados» tab) and the line under the period views: GET /admin/v1/diag. Day totals only (no place,
  // source, device split, hour or event); never kept in `ans`. `days`: the last 14 Lisbon days with the counters of the
  // beacons (null, never 0, before the first day they were kept) and the page views and visits of the raw table split
  // external / internal; `now`: today so far; `period`: the whole past days of the asked period, split by `int`, from
  // the same sources the panels read (so `period.visits.ext` is overview's `kpi.visits.v` with int=0).
  async diag(P) {
    this.enter(P.rej);
    await this.armAlarm();
    const c = P.clock, today = c.day;
    const days = daysBetween(addDays(today, -13), today);
    const val = new Map();
    for (const r of this.all("SELECT day, k, n FROM sys WHERE day >= ? AND day <= ? AND k >= 'l.' AND k < 'l/'", days[0], today)) val.set(`${r.day}|${r.k}`, r.n);
    for (const [day, m] of this.cnt) for (const [k, n] of m) if (k.startsWith('l.')) val.set(`${day}|${k}`, (val.get(`${day}|${k}`) || 0) + n);
    const got = (d, k) => val.get(`${d}|l.${k}`) || 0;
    const since = this.flags.get('lsince') || null;
    const counts = this.diagCounts(days, today);
    const state = (d, v) => {
      if (d === today) return 'hoje';
      if (this.flags.has(`late:${d}`)) return 'refazer';
      if (this.isRolled(d)) return 'feito';
      return v.pv[0] + v.pv[1] > 0 ? 'por-fazer' : 'feito';       // nothing recorded: nothing to roll up
    };
    const split = (a) => ({ ext: a[0], int: a[1] });
    const out = days.map((d) => {
      const v = counts.get(d), counted = !!since && d >= since;
      return {
        day: d, counted,
        req: counted ? got(d, 'req') : null,
        ok: counted ? got(d, 'ok') : null,
        rej: counted ? Object.fromEntries(REJ_CODES.map((k) => [k, got(d, `rej.${k}`)])) : null,
        drop: counted ? { teto: got(d, 'drop.teto'), cheio: got(d, 'drop.cheio') } : null,
        pv: split(v.pv), visits: split(v.visits), state: state(d, v),
      };
    });
    // today so far, with the device filter of the panels
    let t = counts.get(today);
    if (P.dev !== 'all') t = this.diagCounts([today], today, P.dev).get(today);
    const hh = String(c.hr).padStart(2, '0'), mm = String(c.min).padStart(2, '0');
    return {
      ok: true, v: 1, today, at: `${hh}:${mm}`, rollupAt: '00:20', since, dev: P.dev, days: out,
      now: { pv: split(t.pv), visits: split(t.visits), uv: { ext: t.uv } },
      period: this.diagPeriod(P),
    };
  }

  // page views, visits (derive.js's rule) and first visitors of the day (external), by Lisbon day, from the raw table;
  // past days kept in memory until a write touches them
  diagCounts(days, today, dev = 'all') {
    const out = new Map(), missing = [];
    const now = Date.now();
    for (const d of days) {
      const hit = dev === 'all' ? this.diagDays.get(d) : null;
      if (d !== today && hit && hit.exp > now && this.fresh(hit.gen, d, d)) out.set(d, hit.v); else missing.push(d);
    }
    if (!missing.length) return out;
    const gen = this.gen;
    for (const d of missing) out.set(d, { pv: [0, 0], visits: [0, 0], uv: 0 });
    const rows = this.all(`SELECT day, int, count(*) AS n, sum(uv1) AS u,
      sum(CASE WHEN nav IN ('navigate', 'prerender') AND ref <> 'interno' THEN 1 ELSE 0 END) AS x
      FROM pv WHERE day IN (${qs(missing.length)}) AND (? = 'all' OR dev = ?) GROUP BY day, int`, ...missing, dev, dev);
    for (const r of rows) {
      const v = out.get(r.day), i = r.int ? 1 : 0;
      v.pv[i] += r.n || 0; v.visits[i] += r.x || 0;
      if (!i) v.uv += r.u || 0;
    }
    if (dev === 'all') {
      for (const d of missing) if (d !== today) { this.diagDays.delete(d); this.diagDays.set(d, { v: out.get(d), gen, exp: now + 300e3 }); }
      while (this.diagDays.size > 20) this.diagDays.delete(this.diagDays.keys().next().value);
    }
    return out;
  }

  // the period's whole past days (its end capped at yesterday) split by `int`; null for «24 h» (today is in its numbers)
  diagPeriod(P) {
    if (P.p === '24h') return null;
    const per = period(P, P.clock);
    if (per.error) return null;
    const from = per.range.from, to = per.range.to < P.clock.day ? per.range.to : P.clock.yday;
    if (from > to) return null;
    const key = `diag|${JSON.stringify({ from, to, dev: P.dev, src: P.src || '', day: P.clock.day })}`;
    const hit = this.cache.get(key);
    if (hit && hit.exp > Date.now() && this.fresh(hit.gen, from, to)) return hit.v;
    const gen = this.gen;
    const win = [{ name: 'cur', from, to, dev: P.dev, ms: ['c'], split: new Set() }];
    const a = this.collect(win, { ...P, int: 0 }).cur, b = this.collect(win, { ...P, int: 1 }).cur;
    const n = (acc, k) => Math.round(acc.c(k));
    const v = {
      from, to,
      pv: { ext: n(a, 'pv'), int: Math.max(0, n(b, 'pv') - n(a, 'pv')) },
      visits: { ext: n(a, 'visits'), int: Math.max(0, n(b, 'visits') - n(a, 'visits')) },
    };
    // whole past days change only at a rollup (which empties this cache) or a late write (which touches the day)
    this.cache.delete(key);
    this.cache.set(key, { v, exp: Date.now() + 3600e3, gen, lo: from, hi: to });
    while (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    return v;
  }

  async query(endpoint, P) {
    this.enter(P.rej);
    await this.armAlarm();
    const key = `${endpoint}|${JSON.stringify({ ...P, rej: undefined, clock: { day: P.clock.day, hr: P.clock.hr } })}`;
    const hit = this.cache.get(key);
    if (hit && hit.exp > Date.now() && this.fresh(hit.gen, hit.lo, hit.hi)) return hit.v;
    const gen = this.gen;
    // whole past days, all rolled up: the answer kept in `ans` (one row read) until the next rollup, late write or note
    const akey = endpoint !== 'export' && endpoint !== 'system' ? `${endpoint}|${JSON.stringify({ ...P, rej: undefined, clock: { day: P.clock.day } })}` : null;
    let v = null;
    if (akey) {
      const r = this.one('SELECT v FROM ans WHERE k = ?', akey);
      if (r) { try { v = JSON.parse(r.v); } catch (_) { v = null; } }
    }
    if (!v) {
      v = this.compute(endpoint, P);
      if (akey && v && !v.error && this.settled(v, P)) this.w('INSERT OR REPLACE INTO ans (k, v) VALUES (?, ?)', akey, JSON.stringify(v));
    }
    // the quota panel is always current (3.1), an export always fresh
    if (v && !v.error && endpoint !== 'export' && endpoint !== 'system') {
      const ttl = v.range && v.range.to >= P.clock.day ? 60e3 : 300e3;
      const lo = [v.range.from, v.prev && v.prev.from, addDays(v.range.to, -29)].filter(Boolean).sort()[0];
      this.cache.delete(key);
      this.cache.set(key, { v, exp: Date.now() + ttl, gen, lo, hi: v.range.to });
      while (this.cache.size > 200) this.cache.delete(this.cache.keys().next().value);
    }
    return v;
  }

  // an answer that holds until the next rollup: whole past days, each one either rolled up (and not late) or older
  // than the raw window
  settled(v, P) {
    const r = v.range;
    if (!r || r.unit !== 'day' || r.to >= P.clock.day || P.src === 'raw') return false;
    const rawFrom = addDays(P.clock.day, -RAW_DAYS);
    const lo = [r.from, v.prev && v.prev.from, addDays(r.to, -29)].filter(Boolean).sort()[0];
    for (const d of daysBetween(lo > rawFrom ? lo : rawFrom, r.to)) if (!this.aggValid(d)) return false;
    return true;
  }

  compute(endpoint, P) {
    if (endpoint === 'export') return this.exportCsv(P);
    const per = period(P, P.clock);
    if (per.error) return { error: 'periodo' };
    // no comparison with a period the counter was not running for (its first days would read as growth)
    let prevCut = false;
    if (per.prev) {
      const first = this.firstDay();
      if (!first || per.prev.from < first) { per.prev = null; per.pwin = null; prevCut = true; }
    }
    const windows = plan(endpoint, { period: per, dev: P.dev, int: P.int, vw: P.vw });
    if (!windows) return { error: 'nada' };
    const accs = this.collect(windows, P);
    const ctx = { range: per.range, prev: per.prev, filters: { dev: P.dev, int: P.int, cmp: P.cmp }, vw: P.vw, today: P.clock.day, notes: [], host: P.host };
    if (endpoint === 'overview' || endpoint === 'system') ctx.notes = this.noteList();
    if (endpoint === 'system') ctx.system = this.systemInfo(P);
    const body = build(endpoint, { ...accs, ctx });
    const base = accs.cur || accs.curAll;
    return {
      ok: true, v: 1, range: per.range, prev: per.prev, prevCut, filters: ctx.filters, ignored: endpoint === 'booking' ? ['dev'] : [],
      pv: Math.round(base ? base.c('pv') : 0), generated: new Date(P.clock.now).toISOString(), ...body,
    };
  }

  // Read the windows of a plan into one Acc each. Rolled-up days come from `agg` (only the metric keys asked for),
  // the others from raw rows through derive(). `fbs` always comes from `agg`.
  collect(windows, P) {
    const today = P.clock.day, rawFrom = addDays(today, -RAW_DAYS);
    const intMax = P.int ? 1 : 0;
    const isAggDay = (d) => d < rawFrom || (P.src !== 'raw' && this.aggValid(d));
    const need = new Set();
    for (const w of windows) {
      if (w.hours) { for (const [d] of w.hours) if (d >= rawFrom && d <= today) need.add(d); continue; }
      const from = w.from > rawFrom ? w.from : rawFrom, to = w.to < today ? w.to : today;
      if (from <= to) for (const d of daysBetween(from, to)) if (!isAggDay(d)) need.add(d);
    }
    const raw = this.rawDays([...need], today);
    const out = {};
    for (const w of windows) {
      const slots = w.hours
        ? w.hours.flatMap(([d, h0, h1]) => Array.from({ length: h1 - h0 + 1 }, (_, i) => `${d} ${String(h0 + i).padStart(2, '0')}`))
        : daysBetween(w.from, w.to);
      const acc = new Acc(slots);
      const ms = new Set(w.ms);
      const add = (slot, m, dev, k, n, u, s) => {
        acc.add(slot, m, k, n, u, s);
        if (w.split.has(m)) acc.add(slot, `${m}@${dev}`, k, n, u, s);
      };
      // aggregates
      const aggMs = w.hours ? w.ms.filter((m) => m === 'fbs') : w.ms;
      if (aggMs.length) {
        const rows = this.all(`SELECT m, day, dev, int, k, n, u, s FROM agg WHERE m IN (${qs(aggMs.length)}) AND day BETWEEN ? AND ?
          AND (? = 'all' OR dev = ?) AND int <= ?`, ...aggMs, w.from, w.to, w.dev, w.dev, intMax);
        const lastSlot = new Map();
        if (w.hours) for (const s of slots) lastSlot.set(s.slice(0, 10), s);
        for (const r of rows) {
          if (r.m !== 'fbs' && !isAggDay(r.day)) continue;
          const slot = w.hours ? lastSlot.get(r.day) : r.day;
          if (slot) add(slot, r.m, r.dev, r.k, r.n, r.u, r.s);
        }
      }
      // raw days, derived
      for (const slot of slots) {
        const day = slot.slice(0, 10), hr = w.hours ? Number(slot.slice(11, 13)) : null;
        const dm = raw.get(day);
        if (!dm || (!w.hours && isAggDay(day))) continue;
        for (const [gk, mm] of dm) {
          const [ghr, dev, gint] = gk.split('|');
          if (hr !== null && Number(ghr) !== hr) continue;
          if (w.dev !== 'all' && dev !== w.dev) continue;
          if (gint === '1' && !intMax) continue;
          for (const m of ms) {
            const km = mm.get(m);
            if (km) for (const [k, a] of km) add(slot, m, dev, k, a[0], a[1], a[2]);
          }
        }
      }
      out[w.name] = acc;
    }
    return out;
  }

  // raw days derived into groups `${hr}|${dev}|${int}` → m → k → [n, u, s]; cached a little while
  rawDays(days, today) {
    const out = new Map(), missing = [];
    const now = Date.now();
    for (const d of days) {
      const c = this.rawCache.get(d);
      if (c && c.exp > now && this.fresh(c.gen, d, d)) out.set(d, c.v); else missing.push(d);
    }
    if (!missing.length) return out;
    const gen = this.gen;
    const pvs = this.all(`SELECT * FROM pv WHERE day IN (${qs(missing.length)})`, ...missing);
    const bx = this.all(`SELECT day, id, f, e FROM bx WHERE day IN (${qs(missing.length)})`, ...missing);
    const by = new Map();
    for (const r of bx) { const k = `${r.day}|${r.id}`; const l = by.get(k); if (l) l.push(r); else by.set(k, [r]); }
    for (const d of missing) out.set(d, new Map());
    for (const pv of pvs) {
      const dm = out.get(pv.day);
      const gk = `${pv.hr}|${pv.dev}|${pv.int ? 1 : 0}`;
      let g = dm.get(gk);
      if (!g) dm.set(gk, (g = new Map()));
      derive(pv, by.get(`${pv.day}|${pv.id}`) || [], (m, k, n, u, s) => {
        let km = g.get(m);
        if (!km) g.set(m, (km = new Map()));
        const a = km.get(k);
        if (a) { a[0] += n; a[1] += u; a[2] += s; } else km.set(k, [n, u, s]);
      });
    }
    for (const d of missing) this.rawCache.set(d, { v: out.get(d), gen, exp: now + (d === today ? 60e3 : 300e3) });
    while (this.rawCache.size > 40) this.rawCache.delete(this.rawCache.keys().next().value);
    return out;
  }

  systemInfo(P) {
    const x = daysBetween(addDays(utcDay(P.clock.now), -29), utcDay(P.clock.now));
    const rows = this.all('SELECT day, k, n FROM sys WHERE day >= ?', x[0]);
    const val = new Map(rows.map((r) => [`${r.day}|${r.k}`, r.n]));
    for (const [day, m] of this.cnt) for (const [k, n] of m) val.set(`${day}|${k}`, (val.get(`${day}|${k}`) || 0) + n);
    const s = (k) => x.map((d) => val.get(`${d}|${k}`) || 0);
    const codes = ['origem', 'tamanho', 'json', 'versao', 'esquema', 'limite', 'robo', 'cheio'];
    const c = clock(P.clock.now);
    // days still to roll up: marked late, or not rolled since the first raw page view
    const first = (this.one('SELECT min(day) AS d FROM pv') || {}).d;
    const pending = [];
    for (const d of daysBetween(addDays(c.day, -RAW_DAYS), c.yday)) {
      if (this.flags.has(`late:${d}`) || (first && d >= first && !this.isRolled(d))) pending.push(d);
    }
    return {
      quota: { x, req: s('req'), dor: s('dor'), rows: s('rows'), rr: s('rr'), dbBytes: this.sql.databaseSize,
        limits: { req: 100000, dor: 100000, rows: 100000, rr: 5000000, db: 1000000000 } },
      rejected: { x, unit: 'day', s: Object.fromEntries(codes.map((k) => [k, s(`rej.${k}`)])) },
      rollup: { last: this.flags.get('lastroll') || null, pending },
    };
  }

  // ---------- notes ----------
  noteList() { return this.all('SELECT id, day, label, kind FROM notes ORDER BY day, id'); }
  async notes(op, args) {
    this.enter(args && args.rej);
    await this.armAlarm();
    if (op === 'list') return { ok: true, notes: this.noteList() };
    if (op === 'add') {
      const today = args.clock.day;
      const label = scrubText(args.label, 40);
      if (!validDay(args.day) || args.day > today || args.day < addDays(today, -CUSTOM_BACK) || !label || !NOTE_KINDS.has(args.kind)) return { error: 'esquema' };
      if (this.one('SELECT count(*) AS n FROM notes').n >= 500) return { error: 'limite' };
      this.w('INSERT INTO notes (day, label, kind) VALUES (?, ?, ?)', args.day, label, args.kind);
      const note = this.one('SELECT id, day, label, kind FROM notes WHERE id = last_insert_rowid()');
      this.dropAnswers();
      return { ok: true, note };
    }
    if (op === 'del') {
      const n = this.w('DELETE FROM notes WHERE id = ?', args.id);
      this.dropAnswers();
      return n ? { ok: true } : { error: 'nada' };
    }
    return { error: 'nada' };
  }

  // ---------- CSV (3.6) ----------
  exportCsv(P) {
    return exportTable(P, {
      compute: (endpoint, over) => this.compute(endpoint, { ...P, ...over }),
      collect: (windows) => this.collect(windows, P),
      months: () => this.all(`SELECT month, k, sum(n) AS n FROM aggm WHERE m = 'c' AND (? = 'all' OR dev = ?) AND int <= ? GROUP BY month, k ORDER BY month`, P.dev, P.dev, P.int ? 1 : 0),
      monthsF: () => this.all(`SELECT month, k, sum(n) AS n FROM aggm WHERE m = 'f' AND k = 'S4' AND int <= ? GROUP BY month, k ORDER BY month`, P.int ? 1 : 0),
    });
  }

  // ---------- dev hooks (DEV_HOOKS only) ----------
  async dev(op, args) {
    if (this.env.DEV_HOOKS !== '1') return { error: 'nada' };
    this.enter(args && args.rej);
    if (op === 'reset') {
      await this.ctx.storage.deleteAll();
      this.reset();
      this.migrate();
      return { ok: true };
    }
    if (op === 'rollup') {
      const day = args.day;
      if (!validDay(day)) return { error: 'esquema' };
      const c = this.cursor();
      if (c && c.day === day) this.delMeta('cursor');
      const cur = { day, after: '', chunk: 0, t0: Date.now() };
      let chunks = 0;
      while (!this.rollChunk(cur, this.chunkSize(), false)) chunks++;
      return { ok: true, day, chunks: chunks + 1 };
    }
    if (op === 'alarm') { await this.alarm(true); return { ok: true }; }
    if (op === 'dump') {
      const tables = {};
      for (const t of TABLES) tables[t] = this.one(`SELECT count(*) AS n FROM ${t}`).n;
      const grep = {};
      for (const needle of (args.grep || []).slice(0, 40)) {
        if (typeof needle !== 'string' || !needle) continue;
        const hits = [];
        for (const t of TABLES) {
          for (const col of this.all(`SELECT name FROM pragma_table_info('${t}')`).map((r) => r.name)) {
            const r = this.one(`SELECT count(*) AS n FROM ${t} WHERE instr(CAST("${col}" AS TEXT), ?) > 0 OR instr(hex("${col}"), hex(?)) > 0`, needle, needle);
            if (r.n) hits.push(`${t}.${col}`);
          }
        }
        grep[needle] = hits;
      }
      // the rows of one day in `agg` (a test of the rollup may run while the alarm rolls up other days)
      const aggDay = validDay(args.day) ? this.one('SELECT count(*) AS n FROM agg WHERE day = ?', args.day).n : undefined;
      return { ok: true, tables, grep, flags: Object.fromEntries(this.flags), ...(aggDay !== undefined ? { aggDay } : {}) };
    }
    return { error: 'nada' };
  }
}

function mergeSec(a, b) {
  let s = {};
  try { s = a ? JSON.parse(a) : {}; } catch (_) { s = {}; }
  if (b) for (const [k, v] of Object.entries(b)) s[k] = Math.max(s[k] || 0, v);
  return Object.keys(s).length ? JSON.stringify(s) : null;
}
function mergeRz(a, b) {
  let s = [];
  try { s = a ? JSON.parse(a) : []; } catch (_) { s = []; }
  const all = [...new Set([...(Array.isArray(s) ? s : []), ...(b || [])])];
  return all.length ? JSON.stringify(all) : null;
}
