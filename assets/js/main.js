// Page bootstrap: language, nav, smooth scroll, scroll-driven scenes, data blocks and the sponsor studio.
import { initLang, onLang, t, pick, money, numFmt, getLang, fmtDay } from './i18n.js';
import { SITE, RESULTS, SEASON, BUDGET, IRONMAN_SPLITS, SOCIAL } from './data.js';
import { weekMultiples, heatmap, splitBar } from './charts.js';
import { initMarks, refreshMarks } from './marks.js';
import { flowSet, flowStatic } from './flow.js';
import { initAdspace, userHasInteracted, landTarget } from './adspace.js';

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

// ---------- results ----------
function renderResults() {
  const host = $('#sheet');
  host.textContent = '';
  for (const r of RESULTS.slice().sort((a, b) => b.date.localeCompare(a.date))) {
    const row = document.createElement('div');
    row.className = 'sheet-row rv in';
    const yr = document.createElement('span'); yr.className = 'yr'; yr.textContent = String(r.year);
    const h = document.createElement('h3'); h.textContent = pick(r);
    const sm = document.createElement('small'); sm.textContent = pick(r.place); h.appendChild(sm);
    const dist = document.createElement('span'); dist.className = 'dist'; dist.textContent = getLang() === 'en' ? r.dist.replace(/(\d),(\d)/g, '$1.$2') : r.dist;
    const time = document.createElement('span'); time.className = 'time'; time.textContent = r.time;
    const pos = document.createElement('div'); pos.className = 'pos';
    for (const b of r.badges) { const s = document.createElement('span'); s.className = `badge${b.gold ? ' gold' : ''}${b.dim ? ' dim' : ''}`; s.textContent = pick(b); pos.appendChild(s); }
    row.append(yr, h, dist, time, pos);
    if (r.splits) {
      const sp = document.createElement('div'); sp.className = 'splits';
      for (const [k, v] of Object.entries(r.splits)) { const s = document.createElement('span'); s.textContent = k.toUpperCase(); const b = document.createElement('b'); b.textContent = v; s.appendChild(b); sp.appendChild(s); }
      row.appendChild(sp);
    }
    host.appendChild(row);
  }
  splitBar($('#chart-im'), IRONMAN_SPLITS.map((x) => ({ key: x.k, label: pick(x), s: x.s })));
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

function renderGofundme() {
  const a = $('#gofundme');
  const label = a.querySelector('span'), icon = a.querySelector('use');
  const note = $('#gofundme-note');
  if (SITE.gofundme) { a.href = SITE.gofundme; a.className = 'btn gold'; icon.setAttribute('href', '#i-heart'); if (note) note.hidden = true; return; }
  // no campaign yet: a quiet WhatsApp button instead of a "coming soon" in gold
  a.href = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(getLang() === 'en' ? 'Hi Gonçalo, I would like to support your 2027 season.' : 'Olá Gonçalo, quero apoiar a tua época 2027.')}`;
  a.className = 'btn';
  icon.setAttribute('href', '#i-wa');
  label.textContent = t('gfm.help');
  if (note) { note.hidden = false; note.textContent = t('gfm.soon'); }
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
    const land = () => { if (!el.matches('a, button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true }); };
    if (lenis) lenis.scrollTo(target, { offset: target === 0 ? 0 : -navH, duration: 1.4, onComplete: land });
    else { if (target === 0) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' }); land(); }
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
function renderAll() { [renderSocial, renderResults, renderSeason, renderBudget, renderGofundme, renderStrava, renderFooter].forEach(safe); }
renderAll();
onLang(() => { renderAll(); safe(refreshMarks); safe(flowStatic); });
let lastW = innerWidth;
addEventListener('resize', () => {
  clearTimeout(renderAll.t);
  renderAll.t = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; renderResults(); renderStrava(); } }, 200);
});
$('#route-km').textContent = `${numFmt(Math.round(greatCircleKm([38.7223, -9.1393], [19.6400, -155.9969]) / 10) * 10)} km`;
$('#print-kit').addEventListener('click', () => window.print());
// the printed media kit carries the full results list, even when it is folded on screen
const folded = () => $$('details.all-results');
addEventListener('beforeprint', () => folded().forEach((d) => { d.dataset.wasOpen = String(d.open); d.open = true; }));
addEventListener('afterprint', () => folded().forEach((d) => { if (d.dataset.wasOpen === 'false') d.open = false; }));
initReveal();
document.documentElement.classList.add('ready');
// booted: a later deploy may use the fresh reload again, and the address loses the cache-buster
try { sessionStorage.removeItem('gc.fresh'); } catch (_) {}
if (/[?&]fresh=/.test(location.search)) history.replaceState(history.state, '', location.pathname + location.hash);
flowStatic();
loadStrava();

let suitRef = null;
const startMotion = () => {
  let lenis = null;
  try { ({ lenis } = initMotion(() => suitRef)); } catch (e) { console.error(e); }
  // scroll to an element just under the nav; resolves once there (adspace waits for it before showing the part's model)
  // (an absolute target: Lenis measures an element against its own scroll value, which can lag a scroll it did not make)
  const scrollToEl = (el, { immediate = false } = {}) => new Promise((done) => {
    const top = el.getBoundingClientRect().top + scrollY - nav.offsetHeight;
    if (lenis) { lenis.scrollTo(top, { immediate, duration: 1.2, onComplete: done }); if (immediate) done(); return; }
    scrollTo({ top, behavior: immediate || reduce ? 'auto' : 'smooth' });
    setTimeout(done, immediate || reduce ? 0 : 900);
  });
  // a deep link lands in its part (#fato/peito, #capacete/…, #fato/title), or on the chapter for #fato and a mixed package;
  // not if the visitor has scrolled in the meantime
  const y0 = scrollY;
  const toStudio = () => { const el = landTarget(); if (el && Math.abs(scrollY - y0) < 2) scrollToEl(el, { immediate: true }); };
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
