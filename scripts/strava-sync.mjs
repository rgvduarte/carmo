#!/usr/bin/env node
// Builds data/strava.json from the athlete's Strava history.
//
// Two sources, same output:
//   1. Strava API (used by the daily GitHub Action):
//        STRAVA_CLIENT_ID=… STRAVA_CLIENT_SECRET=… STRAVA_REFRESH_TOKEN=… node scripts/strava-sync.mjs
//   2. A Strava bulk export (Settings → My Account → Download your data → activities.csv):
//        node scripts/strava-sync.mjs --csv path/to/activities.csv
//
// Only aggregates are published (weekly hours, daily hours, 12-month totals) — no GPS, no routes.
import { readFile, writeFile } from 'node:fs/promises';

const OUT = new URL('../data/strava.json', import.meta.url);
const DAY = 86400000;

const kind = (type = '') => {
  const t = type.toLowerCase();
  if (t.includes('swim')) return 'swim';
  if (t.includes('ride') || t.includes('bike') || t.includes('cycl') || t.includes('velomobile') || t.includes('handcycle')) return 'bike';
  if (t.includes('run') || t.includes('trail')) return 'run';
  return 'other';
};

async function fromApi() {
  const { STRAVA_CLIENT_ID: id, STRAVA_CLIENT_SECRET: secret, STRAVA_REFRESH_TOKEN: refresh } = process.env;
  if (!id || !secret || !refresh) throw new Error('Missing STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET / STRAVA_REFRESH_TOKEN');
  const tok = await fetch('https://www.strava.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: id, client_secret: secret, grant_type: 'refresh_token', refresh_token: refresh }),
  }).then((r) => { if (!r.ok) throw new Error(`token ${r.status}`); return r.json(); });
  const headers = { Authorization: `Bearer ${tok.access_token}` };
  const athlete = await fetch('https://www.strava.com/api/v3/athlete', { headers }).then((r) => r.json());
  const acts = [];
  for (let page = 1; page < 60; page++) {
    const r = await fetch(`https://www.strava.com/api/v3/athlete/activities?per_page=200&page=${page}`, { headers });
    if (!r.ok) throw new Error(`activities ${r.status}`);
    const batch = await r.json();
    if (!batch.length) break;
    for (const a of batch) acts.push({ date: a.start_date_local, type: a.sport_type || a.type, dist: a.distance || 0, time: a.moving_time || 0, elev: a.total_elevation_gain || 0 });
    if (batch.length < 200) break;
  }
  return { athlete: { id: athlete.id, name: [athlete.firstname, athlete.lastname].filter(Boolean).join(' ') }, acts };
}

// minimal CSV parser that copes with quoted fields and commas inside quotes
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function fromCsv(path) {
  const rows = parseCsv(await readFile(path, 'utf8'));
  const head = rows.shift().map((h) => h.trim());
  const col = (...names) => names.map((n) => head.indexOf(n)).find((i) => i >= 0);
  const iDate = col('Activity Date'), iType = col('Activity Type'), iDist = col('Distance'), iMove = col('Moving Time'), iElap = col('Elapsed Time'), iElev = col('Elevation Gain');
  // the export has two "Distance" columns: the first in km, a later one in metres
  const iDistM = head.lastIndexOf('Distance');
  const acts = [];
  for (const r of rows) {
    if (!r[iDate]) continue;
    const date = new Date(r[iDate]);
    if (Number.isNaN(+date)) continue;
    const type = r[iType] || '';
    let dist = parseFloat(r[iDistM]);
    if (!Number.isFinite(dist) || iDistM === iDist) dist = parseFloat(r[iDist]) * (kind(type) === 'swim' ? 1 : 1000);
    const time = parseFloat(r[iMove]) || parseFloat(r[iElap]) || 0;
    acts.push({ date: date.toISOString(), type, dist: dist || 0, time, elev: parseFloat(r[iElev]) || 0 });
  }
  return { athlete: { id: 50182673, name: 'Gonçalo Carmo' }, acts };
}

const iso = (d) => d.toISOString().slice(0, 10);
function monday(d) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); const k = (x.getUTCDay() + 6) % 7; return new Date(+x - k * DAY); }

function aggregate({ athlete, acts }) {
  const now = new Date();
  const since = new Date(+now - 365 * DAY);
  const last = acts.filter((a) => new Date(a.date) >= since);
  const sum = (arr, f) => arr.reduce((s, a) => s + f(a), 0);
  const km = (k) => Math.round(sum(last.filter((a) => kind(a.type) === k), (a) => a.dist) / 1000);
  const last12 = {
    hours: Math.round(sum(last, (a) => a.time) / 3600),
    count: last.length,
    swim_km: km('swim'), bike_km: km('bike'), run_km: km('run'),
    elev_m: Math.round(sum(last, (a) => a.elev)),
  };
  // 26 weekly buckets ending this week, hours per discipline
  const w0 = monday(now);
  const weeks = [];
  for (let i = 25; i >= 0; i--) weeks.push({ start: iso(new Date(+w0 - i * 7 * DAY)), swim: 0, bike: 0, run: 0, other: 0 });
  const wIndex = new Map(weeks.map((w, i) => [w.start, i]));
  for (const a of acts) {
    const i = wIndex.get(iso(monday(new Date(a.date))));
    if (i !== undefined) weeks[i][kind(a.type)] += a.time / 3600;
  }
  for (const w of weeks) for (const k of ['swim', 'bike', 'run', 'other']) w[k] = Math.round(w[k] * 10) / 10;
  // 52 weeks x 7 days, starting on a Monday
  const start = new Date(+w0 - 51 * 7 * DAY);
  const days = [];
  const dIndex = new Map();
  for (let i = 0; i < 52 * 7; i++) { const d = iso(new Date(+start + i * DAY)); dIndex.set(d, days.length); days.push({ d, h: 0 }); }
  for (const a of acts) { const i = dIndex.get(a.date.slice(0, 10)); if (i !== undefined) days[i].h += a.time / 3600; }
  for (const d of days) d.h = Math.round(d.h * 10) / 10;
  const all = {
    count: acts.length,
    hours: Math.round(sum(acts, (a) => a.time) / 3600),
    first: acts.length ? iso(new Date(Math.min(...acts.map((a) => +new Date(a.date))))) : null,
  };
  return { connected: true, updated: now.toISOString(), athlete, last12, weeks, days, all };
}

const csvArg = process.argv.indexOf('--csv');
const src = csvArg > 0 ? await fromCsv(process.argv[csvArg + 1]) : await fromApi();
const out = aggregate(src);
await writeFile(OUT, JSON.stringify(out) + '\n');
console.log(`strava.json: ${out.last12.count} activities in 12 months, ${out.last12.hours} h, ${out.all.count} total`);
