// Lisbon days and hours (the dashboard's only clock: SPEC 2.3), UTC days (Cloudflare's quotas reset at 00:00 UTC),
// and the admin periods (SPEC 3.6, D13, D14).

export const TZ = 'Europe/Lisbon';
export const RAW_DAYS = 30;          // pv / bx kept: day >= today - 30
export const DAILY_DAYS = 762;       // agg kept: day >= today - 762 (25 months)
export const CUSTOM_BACK = 761;      // custom periods: from >= today - 761, to - from <= 761
export const SYS_DAYS = 90;

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
// { day: 'YYYY-MM-DD', hr: 0-23, min: 0-59 } on the Lisbon wall clock at `ms`
export function lisbon(ms) {
  const p = {};
  for (const x of fmt.formatToParts(new Date(ms))) p[x.type] = x.value;
  return { day: `${p.year}-${p.month}-${p.day}`, hr: Number(p.hour) % 24, min: Number(p.minute) };
}
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export function validDay(s) {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
export function addDays(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);  // b - a
export function daysBetween(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
// 1 = Monday … 7 = Sunday
export const weekday = (day) => { const w = new Date(`${day}T00:00:00Z`).getUTCDay(); return w === 0 ? 7 : w; };
// ISO week 'YYYY-Www'
export function isoWeek(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - wd);
  const y = d.getUTCFullYear();
  const w = Math.ceil(((d - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}
export const lastDayOfMonth = (month) => addDays(`${addMonth(month, 1)}-01`, -1);   // month 'YYYY-MM'
export function addMonth(month, n) {
  const [y, m] = month.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return t.toISOString().slice(0, 7);
}

// the next time the Lisbon wall clock shows hh:mm (after `ms`), as epoch ms. 00:20 is never inside a DST change in
// Lisbon (they happen at 01:00 UTC), so one offset correction is exact.
export function nextLisbon(ms, hh, mm) {
  const today = lisbon(ms).day;
  for (const day of [today, addDays(today, 1), addDays(today, 2)]) {
    const [y, m, d] = day.split('-').map(Number);
    const guess = Date.UTC(y, m - 1, d, hh, mm);
    const w = lisbon(guess);
    const wall = Date.UTC(Number(w.day.slice(0, 4)), Number(w.day.slice(5, 7)) - 1, Number(w.day.slice(8, 10)), w.hr, w.min);
    const t = guess - (wall - guess);
    if (t > ms + 1000) return t;
  }
  return ms + 864e5;
}

// The clock every call to the store carries: { now, day, hr, yday }
export function clock(ms) {
  const { day, hr, min } = lisbon(ms);
  return { now: ms, day, hr, min, yday: addDays(day, -1) };
}

// ---------- admin periods (3.6) ----------
// Returns { range, prev, win, pwin } or { error: 'periodo' }. `win` / `pwin` describe what to read:
//   { from, to } (days), and for 24h also { hours: [[day, hrFrom, hrTo], …] }.
export function period(q, c) {
  const p = q.p || '7d';
  const today = c.day;
  const cmp = !(q.cmp === 0 || q.cmp === '0');
  if (p === '24h') {
    // Lisbon hours from (yesterday, hr+1) up to now; the previous period is the 24 h before
    const hoursOf = (d0) => (c.hr === 23 ? [[addDays(d0, 1), 0, 23]] : [[d0, c.hr + 1, 23], [addDays(d0, 1), 0, c.hr]]);
    const cur = hoursOf(c.yday), prv = hoursOf(addDays(c.yday, -1));
    const from = cur[0][0];
    return {
      range: { p, from, to: today, days: 1, partial: true, unit: 'hour', tz: TZ },
      prev: cmp ? { from: prv[0][0], to: prv[prv.length - 1][0] } : null,
      win: { from, to: today, hours: cur },
      pwin: cmp ? { from: prv[0][0], to: prv[prv.length - 1][0], hours: prv } : null,
    };
  }
  let from, to;
  if (p === '7d' || p === '30d' || p === '90d') {
    const n = Number(p.slice(0, -1));
    from = addDays(today, -n); to = addDays(today, -1);
  } else if (p === 'custom') {
    from = q.from; to = q.to;
    if (!validDay(from) || !validDay(to) || from > to || to > today || from < addDays(today, -CUSTOM_BACK) || dayDiff(from, to) > CUSTOM_BACK) return { error: 'periodo' };
  } else return { error: 'periodo' };
  const days = dayDiff(from, to) + 1;
  const pto = addDays(from, -1), pfrom = addDays(from, -days);
  return {
    range: { p, from, to, days, partial: to === today, unit: 'day', tz: TZ },
    prev: cmp ? { from: pfrom, to: pto } : null,
    win: { from, to },
    pwin: cmp ? { from: pfrom, to: pto } : null,
  };
}
