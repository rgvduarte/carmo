// Marks: one race at a time. Scroll scrubs through the results; digits roll (number-flow),
// the race name decodes like a departures board (GSAP ScrambleText) and a 100-cell strip
// shows how much of the field finished behind.
import { t, pick, numFmt, getLang, fmtDay } from './i18n.js';
import { RESULTS } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const SPLIT_LABEL = { swim: { pt: 'Natação', en: 'Swim' }, t1: { pt: 'T1', en: 'T1' }, bike: { pt: 'Ciclismo', en: 'Bike' }, t2: { pt: 'T2', en: 'T2' }, run: { pt: 'Corrida', en: 'Run' } };

let MARKS = [], flows = null, current = -1, built = false, jump = () => {};

const parseTime = (s) => { const p = s.split(':').map(Number); return p.length === 3 ? { h: p[0], m: p[1], s: p[2] } : { h: 0, m: p[0], s: p[1] }; };
const ord = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th'}`;
const fmtDate = (iso) => fmtDay(iso);

async function makeFlows(host) {
  host.textContent = '';
  let ok = false;
  try { await import('number-flow'); ok = !!customElements.get('number-flow'); } catch (_) { ok = false; }
  const part = (cls, opts) => {
    const el = document.createElement(ok ? 'number-flow' : 'span');
    el.className = cls;
    if (ok) {
      el.format = opts.format;
      el.locales = 'pt-PT';
      if (opts.digits) el.digits = opts.digits;
      el.transformTiming = { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)' };
      el.spinTiming = { duration: 900, easing: 'cubic-bezier(.22,1,.36,1)' };
      el.trend = 0;
    }
    return el;
  };
  const sep = (cls) => { const s = document.createElement('span'); s.className = cls; s.textContent = ':'; return s; };
  // the rolling digits are decoration; screen readers, print and find in page get one plain copy
  const srTime = document.createElement('span'); srTime.className = 'sr-only';
  const hh = part('hh', { format: { useGrouping: false } });
  const mm = part('mm', { format: { minimumIntegerDigits: 2 }, digits: { 1: { max: 5 } } });
  const ss = part('ss', { format: { minimumIntegerDigits: 2 }, digits: { 1: { max: 5 } } });
  const vis = document.createElement('span'); vis.className = 'mk-digits'; vis.setAttribute('aria-hidden', 'true');
  vis.append(hh, sep('sep sep-h'), mm, sep('sep'), ss);
  host.append(vis, srTime);
  const pct = part('', { format: { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: 'always' } });
  if (ok) pct.numberSuffix = '%';
  pct.setAttribute('aria-hidden', 'true');
  const srPct = document.createElement('span'); srPct.className = 'sr-only';
  $('#mk-pct').textContent = '';
  $('#mk-pct').append(pct, srPct);
  const set = (el, v, pad) => { if (ok) el.update(v); else el.textContent = pad ? String(v).padStart(2, '0') : String(v); };
  return {
    time(tm, label) { set(hh, tm.h); set(mm, tm.m, true); set(ss, tm.s, true); host.classList.toggle('no-h', tm.h === 0); srTime.textContent = label; },
    pct(v) { if (ok) { pct.locales = getLang() === 'en' ? 'en-GB' : 'pt-PT'; pct.update(v); } else pct.textContent = `${numFmt(v, 1)}%`; srPct.textContent = `${numFmt(v, 1)}%`; },
  };
}

function scramble(el, text) {
  const G = window.gsap;
  if (!reduce && G && window.ScrambleTextPlugin) {
    G.killTweensOf(el);
    G.to(el, { duration: 0.9, scrambleText: { text, chars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', speed: 0.5, revealDelay: 0.15 }, ease: 'none' });
  } else el.textContent = text;
}

function cells(pctAhead) {
  const host = $('#mk-cells');
  if (!host.children.length) for (let i = 0; i < 100; i++) { const c = document.createElement('i'); c.style.transitionDelay = `${i * 4}ms`; host.appendChild(c); }
  const me = Math.min(99, Math.floor(pctAhead));      // share of the field ahead of him, in whole cells
  [...host.children].forEach((c, i) => { c.className = i < me ? 'ahead' : i === me ? 'me' : ''; });
}

function show(i, { force = false } = {}) {
  if (!MARKS.length) return;
  i = Math.max(0, Math.min(MARKS.length - 1, i));
  if (i === current && !force) return;
  current = i;
  const r = MARKS[i];
  const behind = ((r.field - r.rank) / r.field) * 100;
  $('#mk-idx').textContent = String(i + 1).padStart(2, '0');
  $('#mk-date').textContent = fmtDate(r.date);
  flows && flows.time(parseTime(r.time), r.time);
  flows && flows.pct(Math.floor(behind * 10) / 10);
  scramble($('#mk-race'), pick(r).toUpperCase());
  $('#mk-sub').textContent = `${getLang() === 'en' ? r.dist.replace(/(\d),(\d)/g, '$1.$2') : r.dist} · ${pick(r.place)}`;
  $('#mk-rank').textContent = getLang() === 'en' ? `${ord(r.rank)} of ${numFmt(r.field)}` : `${r.rank}.º de ${numFmt(r.field)}`;
  $('#mk-note').textContent = pick(r.note);
  cells((r.rank / r.field) * 100);
  const chips = $('#mk-chips'); chips.textContent = '';
  if (r.splits) for (const [k, v] of Object.entries(r.splits)) { const s = document.createElement('span'); s.textContent = pick(SPLIT_LABEL[k]); const b = document.createElement('b'); b.textContent = v; s.appendChild(b); chips.appendChild(s); }
  document.querySelectorAll('#mk-list button').forEach((b, k) => { if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  document.querySelectorAll('#mk-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
}

function renderList(scrollToStep) {
  const ol = $('#mk-list'); ol.textContent = '';
  const dots = $('#mk-dots'); dots.textContent = '';
  MARKS.forEach((r, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button'); b.type = 'button';
    const y = document.createElement('span'); y.className = 'y'; y.textContent = String(r.year);
    const n = document.createElement('span'); n.className = 'n'; n.textContent = pick(r);
    const tm = document.createElement('span'); tm.className = 't'; tm.textContent = r.time;
    b.append(y, n, tm);
    b.addEventListener('click', () => scrollToStep(i));
    li.appendChild(b); ol.appendChild(li);
    dots.appendChild(document.createElement('i'));
  });
}

export async function initMarks({ lenis } = {}) {
  MARKS = RESULTS.filter((r) => r.rank && r.field && r.date).slice().sort((a, b) => a.date.localeCompare(b.date));
  const section = $('.marks'), track = $('#marks-track');
  if (!section || !MARKS.length) return;
  track.style.setProperty('--steps', MARKS.length);
  $('#mk-total').textContent = String(MARKS.length).padStart(2, '0');
  const ST = window.ScrollTrigger;
  const scrubbed = !reduce && ST;
  // the short static layout before the await: a deep link that already scrolled below would otherwise be left far
  // down the page when the track collapses (Safari has no scroll anchoring)
  if (!scrubbed) section.classList.add('static');
  flows = await makeFlows($('#mk-time'));
  const stepTop = (i) => track.getBoundingClientRect().top + scrollY + ((track.offsetHeight - innerHeight) * (i + 0.5)) / MARKS.length;
  const scrollToStep = (i) => {
    if (!scrubbed) { show(i); return; }
    const y = stepTop(i);
    if (lenis) lenis.scrollTo(y, { duration: 1.2 }); else scrollTo({ top: y, behavior: 'smooth' });
  };
  jump = scrollToStep;
  renderList(jump);
  if (!scrubbed) { section.classList.add('static'); show(MARKS.length - 1, { force: true }); built = true; return; }
  show(0, { force: true });
  ST.create({ trigger: track, start: 'top top', end: 'bottom bottom', onUpdate: (self) => show(Math.min(MARKS.length - 1, Math.floor(self.progress * MARKS.length))) });
  built = true;
}

export function refreshMarks() { if (built) { renderList(jump); show(current, { force: true }); } }
