// Page bootstrap: language, nav, smooth scroll, scroll-driven scenes, data blocks and the sponsor studio.
import { initLang, onLang, t, pick, money, numFmt, getLang, fmtDay } from './i18n.js';
import { SITE, RESULTS, SEASON, BUDGET, SOCIAL } from './data.js';
import { weekMultiples, heatmap } from './charts.js';
import { racesBlock } from './races.js';
import { initMarks, refreshMarks } from './marks.js';
import { flowSet, flowStatic } from './flow.js';
import { initAdspace, userHasInteracted, landTarget } from './adspace.js';
import { loadGofundme, renderGofundme } from './gofundme.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduce) document.documentElement.classList.add('reduce');
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, k) => a + (b - a) * k;

initLang();

// ---------- nav ----------
const nav = $('#nav');
const menuBtn = $('.menu-btn');
// the full-screen menu takes focus while open and shuts the page behind it off from Tab and screen readers
function setMenu(open, { restore = false } = {}) {
  nav.classList.toggle('open', open);
  document.body.classList.toggle('menu-open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
  for (const el of [$('main'), $('footer'), $('#package')]) if (el) el.inert = open;
  if (open) $('#menu a')?.focus({ preventScroll: true });
  else if (restore) menuBtn.focus({ preventScroll: true });
}
menuBtn.addEventListener('click', () => setMenu(!nav.classList.contains('open'), { restore: true }));
$$('#menu a').forEach((a) => a.addEventListener('click', () => setMenu(false)));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('open')) { e.preventDefault(); setMenu(false, { restore: true }); } });
const sections = $$('main section[id]');
// the nav turns light over paper sections
const lightSections = $$('.light');
function navTone() {
  const y = nav.offsetHeight / 2;
  nav.classList.toggle('on-light', lightSections.some((s) => { const r = s.getBoundingClientRect(); return r.top <= y && r.bottom >= y; }));
}
addEventListener('scroll', navTone, { passive: true });
// the contact portrait warms up to colour once it is in view
new IntersectionObserver((en, ob) => { if (en[0].isIntersecting) { en[0].target.classList.add('in'); ob.disconnect(); } }, { threshold: 0.5 }).observe($('.contact-media'));
const linkFor = (id) => $(`#menu a[href="#${id}"]`);
const navObserver = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { $$('#menu a').forEach((a) => a.classList.remove('active')); linkFor(e.target.id)?.classList.add('active'); }
}, { rootMargin: '-45% 0px -50% 0px' });
sections.forEach((s) => navObserver.observe(s));

// ---------- every race: a row of posters, newest first ----------
// races.js builds the cards from RESULTS; index.html carries the same markup in Portuguese (scripts/stamp.mjs) for the
// page without JS, print and the first paint. Phones swipe one card at a time, wider screens page with the arrows, and
// the ticks under the row (one per race) jump to a race.
const pv = { box: $('#provas'), scroller: $('#pv-scroller'), track: $('#pv-track'), ticks: $('#pv-ticks'), filter: 'all', raf: 0, settle: null, target: null, anchor: 0, width: 0 };
const pvCards = () => [...pv.track.children].filter((c) => !c.classList.contains('is-out'));
function pvState() {
  const s = pv.scroller, cards = pvCards();
  const pad = parseFloat(getComputedStyle(pv.track).paddingLeft) || 0;
  const x = s.scrollLeft, view = s.clientWidth - 2 * pad, max = s.scrollWidth - s.clientWidth;
  const pos = cards.map((c) => c.offsetLeft - pad);
  let first = pos.findIndex((p) => p >= x - 2);
  if (first < 0) first = cards.length - 1;
  let last = first;
  while (last + 1 < cards.length && pos[last + 1] + cards[last + 1].offsetWidth <= x + view + 2) last++;
  // a page is as many cards as fit
  const cw = cards.length ? cards[0].offsetWidth : 1, gap = cards.length > 1 ? pos[1] - pos[0] - cw : 0;
  return { cards, pos, first, last, max, x, per: Math.max(1, Math.floor((view + gap + 2) / (cw + gap))) };
}
function pvUpdate() {
  if (!pv.track.children.length) return;
  // a new width (a phone turned on its side, a sidebar, zoom) keeps the same race first in view; WebKit would jump to the end
  const width = pv.scroller.clientWidth;
  if (pv.width && width !== pv.width) {
    const { pos, max } = pvState();
    if (pos.length) pv.scroller.scrollLeft = clamp(pos[Math.min(pv.anchor, pos.length - 1)], 0, max);
  }
  pv.width = width;
  const { cards, first, last, max, x } = pvState();
  if (!cards.length) return;
  pv.anchor = first;
  const p2 = (k) => String(k).padStart(2, '0');
  $('#pv-from').textContent = p2(first + 1);
  $('#pv-to').textContent = last > first ? `-${p2(last + 1)}` : '';
  $('#pv-total').textContent = p2(cards.length);
  // aria-disabled, not disabled: a button that disables itself would drop the keyboard focus
  $('#pv-prev').setAttribute('aria-disabled', String(x <= 2));
  $('#pv-next').setAttribute('aria-disabled', String(x >= max - 2));
  // the row takes the keyboard (arrow keys) only when there is something to scroll
  if (max > 2) pv.scroller.tabIndex = 0; else pv.scroller.removeAttribute('tabindex');
  // the ticks light the races in view; the roving tab stop follows the first one unless the visitor is on the ticks
  const inView = new Set(cards.slice(first, last + 1)), ticks = [...pv.ticks.children], roving = !pv.ticks.contains(document.activeElement);
  [...pv.track.children].forEach((c, i) => {
    const tk = ticks[i];
    if (!tk) return;
    tk.hidden = c.classList.contains('is-out');
    tk.classList.toggle('on', inView.has(c));
    if (c === cards[first]) tk.setAttribute('aria-current', 'true'); else tk.removeAttribute('aria-current');
    if (roving) tk.tabIndex = c === cards[first] ? 0 : -1;
  });
}
// Safari has no scrollend and can fight a smooth scrollTo while mandatory snapping (touch screens) is on: snapping
// pauses during the glide (the target is a snap point anyway) and comes back once the scroll has been still a moment
function pvGlide(left) {
  const s = pv.scroller;
  if (reduce) { s.scrollLeft = left; pvUpdate(); return; }
  if (pv.settle) s.removeEventListener('scroll', pv.settle);
  pv.settle = () => {
    clearTimeout(pvGlide.t);
    pvGlide.t = setTimeout(() => { s.classList.remove('gliding'); s.removeEventListener('scroll', pv.settle); pv.settle = null; }, 160);
  };
  s.classList.add('gliding');
  s.addEventListener('scroll', pv.settle, { passive: true });
  s.scrollTo({ left, behavior: 'smooth' });
  pv.settle();
}
// to the i-th race shown, said out loud (buttons, ticks and keys only, never while swiping)
function pvGo(i) {
  const { cards, pos, max } = pvState();
  if (!cards.length) return;
  i = clamp(i, 0, cards.length - 1);
  pv.target = i;
  pvGlide(clamp(pos[i], 0, max));
  $('#pv-status').textContent = t('pv.status', i + 1, cards.length, cards[i].querySelector('.pv-name').textContent);
}
// a second press during a glide counts from where the first one is heading
const pvFrom = (first) => (pv.settle && pv.target != null ? pv.target : first);
// pages start at a multiple of the page size, so the counter reads 01-03, 04-06, 07-09 whatever was swiped in between
function pvPage(dir) {
  const { first, per } = pvState(), from = pvFrom(first);
  pvGo(dir > 0 ? (Math.floor(from / per) + 1) * per : (Math.ceil(from / per) - 1) * per);
}
function pvApplyFilter() {
  // a re-render can drop a kind (a language switch keeps the filter, an edit of RESULTS might not)
  if (pv.filter !== 'all' && !pv.track.querySelector(`[data-kind="${pv.filter}"]`)) pv.filter = 'all';
  // a filtered row keeps the full row's heights: the other cards stay in the grid, invisible, under the first card shown
  let lead = pv.filter !== 'all';
  for (const c of pv.track.children) {
    const out = pv.filter !== 'all' && c.dataset.kind !== pv.filter;
    c.classList.toggle('is-out', out);
    c.classList.toggle('is-lead', lead && !out);
    if (!out) lead = false;
  }
  $$('#pv-filter button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === pv.filter)));
}
function renderRaces() {
  try {
    const b = racesBlock(RESULTS, { t, pick, numFmt, fmtDay, lang: getLang() });
    const keep = pv.scroller.scrollLeft;
    $('#pv-kick').innerHTML = b.kick;
    $('#pv-filter').innerHTML = b.filter.join('');
    pv.track.innerHTML = b.cards.join('');
    pv.ticks.innerHTML = b.ticks.join('');
    pvApplyFilter();
    pv.scroller.scrollLeft = keep;
    pvUpdate();
  } catch (e) {
    // the cards stay as the page has them, laid out flat like the page without JS
    pv.box.classList.add('flat');
    throw e;
  }
}
function initRaces() {
  const s = pv.scroller;
  $('#pv-prev').addEventListener('click', (e) => { if (e.currentTarget.getAttribute('aria-disabled') !== 'true') pvPage(-1); });
  $('#pv-next').addEventListener('click', (e) => { if (e.currentTarget.getAttribute('aria-disabled') !== 'true') pvPage(1); });
  $('#pv-filter').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-kind]');
    if (!b || pv.filter === b.dataset.kind) return;
    pv.filter = b.dataset.kind;
    pvApplyFilter();
    s.scrollLeft = 0;
    pvUpdate();
    $('#pv-status').textContent = t('pv.count', pvCards().length);
  });
  // a tick jumps to its race; on the ticks, the arrow keys move between them (one tab stop for the whole row)
  pv.ticks.addEventListener('click', (e) => {
    const b = e.target.closest('.pv-tick');
    if (b) pvGo(pvCards().indexOf(pv.track.children[[...pv.ticks.children].indexOf(b)]));
  });
  pv.ticks.addEventListener('keydown', (e) => {
    const list = [...pv.ticks.children].filter((b) => !b.hidden), k = list.indexOf(document.activeElement);
    const to = { ArrowRight: k + 1, ArrowLeft: k - 1, Home: 0, End: list.length - 1 }[e.key];
    if (to == null || k < 0) return;
    e.preventDefault();
    const b = list[clamp(to, 0, list.length - 1)];
    list.forEach((x) => { x.tabIndex = x === b ? 0 : -1; });
    b.focus();
    b.click();
  });
  // on the row itself, the arrow keys go a race at a time, Home and End to the ends
  s.addEventListener('keydown', (e) => {
    if (e.target !== s || e.altKey || e.ctrlKey || e.metaKey) return;
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (step == null && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const { first, cards } = pvState();
    pvGo(e.key === 'Home' ? 0 : e.key === 'End' ? cards.length - 1 : pvFrom(first) + step);
  });
  s.addEventListener('scroll', () => { if (!pv.raf) pv.raf = requestAnimationFrame(() => { pv.raf = 0; pvUpdate(); }); }, { passive: true });
  // a sideways trackpad swipe belongs to the row: Lenis would otherwise take it (any vertical jitter) and cancel it
  s.addEventListener('wheel', (e) => { if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.lenisStopPropagation = true; }, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(() => pvUpdate()).observe(s);
  else addEventListener('resize', () => pvUpdate());
}

// ---------- season ----------
function fmtWhen(r) {
  if (r.label) return pick(r.label);
  if (/^\d{4}-\d{2}$/.test(r.date)) return fmtDay(`${r.date}-01`, { day: false });
  const main = fmtDay(r.date, { year: false });
  return r.end ? `${main.split(' ')[0]} ${getLang() === 'en' ? 'to' : 'a'} ${fmtDay(r.end, { year: false })}` : main;
}
function renderSeason() {
  const host = $('#season');
  host.textContent = '';
  host.style.setProperty('--n', SEASON.length);
  for (const r of SEASON) {
    const d = document.createElement('div');
    d.className = `race rv in${r.status === 'goal' ? ' goal' : ''}`;
    if (r.status === 'goal') { const m = document.createElement('span'); m.className = 'main'; m.textContent = t('season.main'); d.appendChild(m); }
    const w = document.createElement('span'); w.className = 'when'; w.textContent = fmtWhen(r);
    const h = document.createElement('h3'); h.textContent = pick(r);
    // when the line wraps, a number stays with its unit and its thousands ('18 km', '~1 000 km', '1.ª edição') and a
    // separator ends the line it follows instead of opening the next one
    const keep = (x) => x.replace(/(\d) (?=\d{3}\b)/g, '$1\u00a0').replace(/(\d) (km|h)\b/g, '$1\u00a0$2').replace(/(\.[ªº]) /g, '$1\u00a0').replace(/ · /g, '\u00a0· ');
    const p = document.createElement('p'); p.textContent = keep(`${pick(r.where)} · ${pick(r.what)}`);
    const st = document.createElement('div'); st.className = 'st';
    const b = document.createElement('span'); b.className = `badge${r.status === 'goal' ? ' gold' : r.status === 'planned' ? ' dim' : ''}`; b.textContent = t(`st.status.${r.status}`);
    st.appendChild(b);
    d.append(w, h, p, st);
    host.appendChild(d);
  }
  // the counts are the races on the calendar; Kona is the goal they lead to
  const races = SEASON.filter((r) => r.status !== 'goal');
  const km = races.reduce((a, r) => a + r.km, 0);
  flowSet($('#sk-races'), races.length);
  flowSet($('#sk-km'), Math.round(km / 10) * 10, { prefix: '~' });
}

function greatCircleKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLon = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------- budget ----------
function renderBudget() {
  const host = $('#budget-rows');
  host.textContent = '';
  const max = Math.max(...BUDGET.map((b) => b.eur));
  for (const b of BUDGET) {
    const r = document.createElement('div'); r.className = 'row';
    const n = document.createElement('b'); n.textContent = pick(b);
    const v = document.createElement('span'); v.textContent = money(b.eur);
    const tr = document.createElement('div'); tr.className = 'track';
    const i = document.createElement('i'); i.style.width = `${(b.eur / max) * 100}%`; tr.appendChild(i);
    const s = document.createElement('small'); s.textContent = pick(b.note);
    r.append(n, v, tr, s);
    host.appendChild(r);
  }
  $('#budget-total').textContent = money(BUDGET.reduce((a, b) => a + b.eur, 0));
}

// ---------- Strava ----------
let STRAVA = null;
async function loadStrava() {
  try {
    const r = await fetch('data/strava.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const d = await r.json();
    if (!d || !d.connected || !Array.isArray(d.weeks) || !d.weeks.length) return;
    STRAVA = d;
    renderStrava();
  } catch (_) { /* stays hidden */ }
}
function renderStrava() {
  if (!STRAVA) return;
  const d = STRAVA, box = $('#strava-live');
  box.hidden = false;
  const loc = getLang() === 'en' ? 'en-GB' : 'pt-PT';
  $('#strava-updated').textContent = t('strava.upd', new Date(d.updated).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }));
  const k = d.last12;
  const kp = $('#strava-kpis'); kp.textContent = '';
  for (const [v, l] of [[numFmt(k.hours), 'strava.kpi.hours'], [numFmt(k.swim_km), 'strava.kpi.swim'], [numFmt(k.bike_km), 'strava.kpi.bike'], [numFmt(k.run_km), 'strava.kpi.run'], [numFmt(k.count), 'strava.kpi.n']]) {
    const div = document.createElement('div');
    const vv = document.createElement('div'); vv.className = 'v'; vv.textContent = v;
    const ll = document.createElement('div'); ll.className = 'l'; ll.textContent = t(l);
    div.append(vv, ll); kp.appendChild(div);
  }
  const weeks = d.weeks.map((w) => w.start);
  const wl = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(loc, { day: 'numeric', month: 'short' }).replace('.', '');
  weekMultiples($('#strava-weeks'), [
    { label: t('strava.swim'), values: d.weeks.map((w) => w.swim) },
    { label: t('strava.bike'), values: d.weeks.map((w) => w.bike) },
    { label: t('strava.run'), values: d.weeks.map((w) => w.run) },
  ], weeks, { labelWeek: wl });
  if (Array.isArray(d.days) && d.days.length) heatmap($('#strava-heat'), d.days, { title: t('strava.heat'), fmtDay: (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' }) });
  const tb = $('#table-weeks'); tb.textContent = '';
  const head = tb.insertRow(); [t('chart.week'), t('strava.swim'), t('strava.bike'), t('strava.run')].forEach((x) => { const th = document.createElement('th'); th.textContent = x; head.appendChild(th); });
  d.weeks.forEach((w) => { const tr = tb.insertRow(); tr.insertCell().textContent = wl(w.start); [w.swim, w.bike, w.run].forEach((v) => { tr.insertCell().textContent = `${v.toFixed(1)} h`; }); });
}

// ---------- reveal ----------
function initReveal() {
  const els = $$('.rv:not(.in)');
  if (reduce || !('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const sibs = [...e.target.parentElement.children].filter((c) => c.classList.contains('rv'));
      e.target.style.transitionDelay = `${Math.min(6, sibs.indexOf(e.target)) * 70}ms`;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((e) => io.observe(e));
}

// Chapter 05's title is hidden once it has slid wholly under the nav (a link to the chapter lands on the subtitle, just
// below it, and the nav is translucent). It comes back as soon as any of it shows under the nav. The observed area runs
// from the nav's bottom edge down past the end of the page, so a jump from below the screen to under the nav (a link
// followed at once) also counts.
function initTuck() {
  const h = $('#fato .adspace-head .h2');
  if (!h || !('IntersectionObserver' in window)) return;
  // (one batch can hold several entries for the title: the last one is where it is now)
  new IntersectionObserver((es) => { h.classList.toggle('tucked', !es[es.length - 1].isIntersecting); },
    { rootMargin: `-${nav.offsetHeight}px 0px 1000000px 0px` }).observe(h);
}

// ---------- 226 km meter ----------
const SEGS = [3.8, 180, 42.2];
function meter(p) {
  const km = p * 226;
  const m = $('.meter');
  let acc = 0, label = 'SWIM';
  $$('.meter .seg i').forEach((i, k) => {
    const fill = clamp((km - acc) / SEGS[k], 0, 1);
    i.style.height = `${fill * 100}%`;
    if (km >= acc) label = ['SWIM', 'BIKE', 'RUN'][k];
    acc += SEGS[k];
  });
  const kmEl = $('.meter .km');
  kmEl.firstChild.textContent = `KM ${km.toFixed(1)}`;
  kmEl.querySelector('small').textContent = label;
  kmEl.style.top = `${p * 100}%`;
  m.classList.toggle('on', window.scrollY > window.innerHeight * 0.6);
  const inside = (el) => { const r = el.getBoundingClientRect(); return r.top < innerHeight * 0.5 && r.bottom > innerHeight * 0.5; };
  m.classList.toggle('away', inside($('#prova')) || inside($('#marks-track')));
  $('.topbar i').style.width = `${p * 100}%`;
}

// ---------- race flight ----------
const FLIGHT = [
  { a: 0.00, b: 0.24, k0: 0, k1: 3.8 },
  { a: 0.24, b: 0.56, k0: 3.8, k1: 183.8 },
  { a: 0.56, b: 0.82, k0: 183.8, k1: 226 },
  { a: 0.82, b: 1.00, k0: 226, k1: 226 },
];
function flight(p) {
  const scenes = $$('.flight-scene'), caps = $$('.flight-cap > div'), bars = $$('.flight-bar i');
  const X = 0.05;
  let km = 226;
  FLIGHT.forEach((s, i) => {
    const local = clamp((p - s.a) / (s.b - s.a), 0, 1);
    if (p >= s.a && p < s.b) km = lerp(s.k0, s.k1, local);
    const fadeIn = i === 0 ? 1 : clamp((p - (s.a - X)) / X, 0, 1);
    const fadeOut = i === FLIGHT.length - 1 ? 1 : clamp(1 - (p - (s.b - X)) / X, 0, 1);
    const op = Math.min(fadeIn, fadeOut);
    const sc = scenes[i];
    sc.style.opacity = op;
    sc.style.visibility = op <= 0.001 ? 'hidden' : 'visible';
    const img = sc.querySelector('img');
    const zoom = 1.04 + local * 0.16 + (1 - fadeIn) * 0.1;
    const gray = i === 3 ? 1 - clamp((local - 0.15) / 0.55, 0, 1) : 1;
    img.style.transform = `scale(${zoom.toFixed(4)})`;
    img.style.filter = `grayscale(${gray.toFixed(3)}) contrast(1.05)`;
    const cap = caps[i];
    cap.style.opacity = op;
    cap.style.transform = `translateY(${((1 - op) * (fadeOut < 1 ? -24 : 24)).toFixed(1)}px)`;
  });
  $('#flight-km').textContent = numFmt(km, 1);
  let acc = 0;
  bars.forEach((b, k) => { b.style.width = `${clamp((km - acc) / SEGS[k], 0, 1) * 100}%`; acc += SEGS[k]; });
}

// ---------- smooth scroll + scroll-driven scenes ----------
// the suit turns to face you as the studio scrolls in: from behind, far and high, into its home pose (e: 0..1)
function scrollPose(s, e) {
  const H = s.constructor.HOME;
  return { rot: lerp(Math.PI * 1.15, H.rot, e), dist: lerp(3.2, H.dist, e), ty: H.ty, y: lerp(0.5, H.y, e) };
}
// Where a link to an element lands, and how far under the nav. A link to chapter 05 («Ver o fato e o capacete», the nav,
// #fato) lands on its subtitle, «24 espaços: 20 no fato e 4 no capacete», with the two entry cards in view below it
// (on phones and phones held sideways the cards follow the subtitle directly).
const aimAt = (el) => (el && el.id === 'fato' ? [$('#ad-sub') || el, 8] : [el, 0]);
// an element's place in the page as laid out, leaving out transforms: a block still sliding in (.rv reveals, like the
// subtitle) is aimed at where it comes to rest, not where it is drawn for a moment
const docTop = (el) => { let y = 0; for (let e = el; e; e = e.offsetParent) y += e.offsetTop; return y; };

function initMotion(getSuit) {
  const G = window.gsap, ST = window.ScrollTrigger;
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    meter(clamp(scrollY / (max || 1), 0, 1));
    nav.classList.toggle('solid', scrollY > 40);
  };
  let lenis = null;
  if (!reduce && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.11, smoothWheel: true, wheelMultiplier: 1 });
    if (G && ST) {
      lenis.on('scroll', ST.update);
      G.ticker.add((time) => lenis.raf(time * 1000));
      G.ticker.lagSmoothing(0);
    } else {
      const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    lenis.on('scroll', onScroll);
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  // in-page links glide with Lenis and clear the fixed nav
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = id === '#top' ? 0 : $(id);
    if (target === null) return;
    e.preventDefault();
    const navH = nav.offsetHeight;
    // keyboard focus follows the link, so the next Tab starts inside the section
    const el = target === 0 ? $('#top') : target;
    const [aim, gap] = target === 0 ? [0, 0] : aimAt(target);
    const land = () => { if (!el.matches('a, button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); };
    // the glide aims at where the target is when the link is tapped; once it is over the target is measured again, and
    // anything that moved the layout on the way (a picture, a font) is made up for in one last step
    const reaim = () => { if (aim === 0) return; const off = docTop(aim) - scrollY - navH - gap; if (Math.abs(off) > 2) lenis.scrollTo(scrollY + off, { immediate: true, force: true }); };
    if (lenis) lenis.scrollTo(aim === 0 ? 0 : docTop(aim) - navH - gap, { duration: 1.4, onComplete: () => { reaim(); land(); } });
    else { if (target === 0) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); else aim.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); land(); }
    history.replaceState(null, '', id === '#top' ? location.pathname : id);
  }));

  if (reduce || !G || !ST) {
    // stacked, static scenes: just show the full distance (also when the GSAP scripts failed to load)
    if (!reduce) document.documentElement.classList.add('static-flight');
    $('#flight-km').textContent = numFmt(226, 1);
    $$('.flight-bar i').forEach((b) => { b.style.width = '100%'; });
    return { lenis };
  }
  G.registerPlugin(ST);
  // hero: name rises in, photo drifts as you leave
  G.from('.hero .split-line > span', { yPercent: 105, duration: 1.3, ease: 'expo.out', stagger: 0.09, delay: 0.15 });
  G.from('.hero-tag, .hero-sub, .hero-cta, .telemetry', { opacity: 0, y: 24, duration: 1.1, ease: 'expo.out', stagger: 0.08, delay: 0.45 });
  G.to('.hero-media img', { scale: 1.14, yPercent: 6, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  G.to('.hero-copy', { yPercent: -18, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'center center', end: 'bottom top', scrub: true } });
  $$('[data-parallax]').forEach((img) => G.fromTo(img, { yPercent: -7 }, { yPercent: 7, ease: 'none', scrollTrigger: { trigger: img.closest('section, .story-media, .contact-media'), start: 'top bottom', end: 'bottom top', scrub: true } }));
  // the race, scrubbed by scroll
  ST.create({ trigger: '.flight', start: 'top top', end: 'bottom bottom', scrub: 0.6, onUpdate: (self) => flight(self.progress) });
  flight(0);
  // Lisbon -> Kona arc draws in
  const live = $('#route-live');
  if (live && live.getTotalLength) {
    const L = live.getTotalLength();
    live.style.strokeDasharray = L; live.style.strokeDashoffset = L;
    G.to(live, { strokeDashoffset: 0, ease: 'none', scrollTrigger: { trigger: '.route', start: 'top 85%', end: 'bottom 45%', scrub: true } });
  }
  // the suit turns to face you as its part of the studio scrolls in
  ST.create({
    trigger: '.studio[data-item="suit"]', start: 'top bottom', end: 'top 25%', scrub: true,
    onUpdate: (self) => {
      const s = getSuit();
      if (!s || userHasInteracted()) return;
      const k = self.progress;
      const e = 1 - Math.pow(1 - k, 3);
      s.setPose(scrollPose(s, e), { shortest: false });
      if (k > 0.35 && !s._revealed) { s._revealed = true; s.reveal(); }
      if (k >= 0.999) s.setAuto(true);
    },
  });
  return { lenis };
}

// ---------- boot ----------
function renderSocial() {
  const per = SOCIAL.likesPerPost + SOCIAL.commentsPerPost;
  flowSet($('#ig-followers'), SOCIAL.followers);
  flowSet($('#ig-inter'), Math.round(per / 10) * 10, { prefix: '~' });
  flowSet($('#ig-rate'), Math.round((per / SOCIAL.followers) * 100));
  flowSet($('#ig-best'), SOCIAL.bestPost);
}
const safe = (f) => { try { f(); } catch (e) { console.error(e); } };
function renderFooter() { $('#ft-date').textContent = fmtDay(SITE.updated); }
function renderAll() { [renderSocial, renderRaces, renderSeason, renderBudget, renderGofundme, renderStrava, renderFooter].forEach(safe); }
renderAll();
safe(initRaces);
onLang(() => { renderAll(); safe(refreshMarks); safe(flowStatic); });
let lastW = innerWidth;
addEventListener('resize', () => {
  clearTimeout(renderAll.t);
  renderAll.t = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; renderStrava(); } }, 200);
});
$('#route-km').textContent = `${numFmt(Math.round(greatCircleKm([38.7223, -9.1393], [19.6400, -155.9969]) / 10) * 10)} km`;
$('#print-kit').addEventListener('click', () => window.print());
initReveal();
initTuck();
document.documentElement.classList.add('ready');
// booted: a later deploy may use the fresh reload again, and the address loses the cache-buster
try { sessionStorage.removeItem('gc.fresh'); } catch (_) {}
if (/[?&]fresh=/.test(location.search)) history.replaceState(history.state, '', location.pathname + location.hash);
flowStatic();
loadStrava();
loadGofundme();

let suitRef = null;
const startMotion = () => {
  let lenis = null;
  try { ({ lenis } = initMotion(() => suitRef)); } catch (e) { console.error(e); }
  // scroll to an element just under the nav (gap: how far under it), or to a scroll position; resolves once there
  // (adspace waits for it before showing the part's model). An absolute target: Lenis measures an element against its
  // own scroll value, which can lag a scroll it did not make. Once there, an element is measured again and the page
  // makes up at once for anything that moved the layout on the way.
  const jump = (y) => { if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo({ top: y, behavior: 'auto' }); };
  const scrollToEl = (el, { immediate = false, gap = 0 } = {}) => new Promise((done) => {
    const num = typeof el === 'number';
    const top = num ? el : docTop(el) - nav.offsetHeight - gap;
    const end = () => { if (!num) { const off = docTop(el) - scrollY - nav.offsetHeight - gap; if (Math.abs(off) > 2) jump(scrollY + off); } done(); };
    if (lenis) { if (immediate) { jump(top); end(); } else lenis.scrollTo(top, { duration: 1.2, onComplete: end }); return; }
    scrollTo({ top, behavior: immediate || reduce ? 'auto' : 'smooth' });
    setTimeout(end, immediate || reduce ? 0 : 900);
  });
  // a deep link lands in its part (#fato/peito, #capacete/…, #fato/title), or on the chapter's subtitle and cards for #fato
  // and a mixed package; not if the visitor has scrolled in the meantime
  // (the visitor's own input counts, not the browser's jump to an element named in the address, as for #fato)
  let moved = false;
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown']) addEventListener(ev, () => { moved = true; }, { once: true, passive: true, capture: true });
  // The page above can still change height for a moment after the jump (charts, fonts, the scroll scenes taking their
  // room), and a browser does not always hold the place on its own: the link's target is held under the nav until the
  // visitor moves, or the page has kept its height for 1.5 s (10 s at most).
  const toStudio = () => {
    const t = landTarget(); if (!t || moved) return;
    const [el, gap] = aimAt(t);
    scrollToEl(el, { immediate: true, gap });
    if (!('ResizeObserver' in window)) return;
    let idle = 0;
    const stop = () => { clearTimeout(idle); hold.disconnect(); };
    const hold = new ResizeObserver(() => {
      if (moved) { stop(); return; }
      const off = docTop(el) - scrollY - nav.offsetHeight - gap;
      if (Math.abs(off) > 2) jump(scrollY + off);
      clearTimeout(idle); idle = setTimeout(stop, 1500);
    });
    hold.observe(document.body);
    setTimeout(stop, 10000);
  };
  initAdspace({
    scrollTo: scrollToEl,
    // move the page by dy at once, keeping Lenis in step (a change above the part being read must not push it)
    nudge: (dy) => { if (lenis) lenis.scrollTo(scrollY + dy, { immediate: true, force: true }); else scrollBy(0, dy); },
    onSuitReady: (s) => {
      suitRef = s;
      if (userHasInteracted()) { s._revealed = true; s.reveal(); if (s.selected) s.focus(s.selected); return; }
      // match the scroll pose before the first frame so the suit never jumps
      const st = window.ScrollTrigger && window.ScrollTrigger.getAll().find((x) => x.trigger && x.trigger.matches && x.trigger.matches('.studio[data-item="suit"]'));
      if (st && !reduce) {
        const k = st.progress, e = 1 - Math.pow(1 - k, 3);
        s.setPose(scrollPose(s, e), { shortest: false });
        Object.assign(s.state, s.goal);
        if (k > 0.35) { s._revealed = true; s.reveal(); }
        if (k >= 0.999) s.setAuto(true);
      } else { s.reveal(); s.setAuto(!reduce); }
    },
  }).then(() => requestAnimationFrame(toStudio));
  safe(() => initMarks({ lenis }));
};
// GSAP/Lenis are deferred classic scripts; modules run after them, but guard anyway
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startMotion); else startMotion();
addEventListener('load', () => window.ScrollTrigger && window.ScrollTrigger.refresh());
