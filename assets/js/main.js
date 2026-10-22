// Page bootstrap: language, nav, smooth scroll, scroll-driven scenes, data blocks and the sponsor studio.
import { initLang, onLang, t, pick, money, numFmt, getLang } from './i18n.js';
import { SITE, RESULTS, SEASON, BUDGET, IRONMAN_SPLITS, SOCIAL } from './data.js';
import { lineChart, topStrip, weekMultiples, heatmap, splitBar } from './charts.js';
import { initAdspace, userHasInteracted } from './adspace.js';

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
menuBtn.addEventListener('click', () => {
  const open = !nav.classList.contains('open');
  nav.classList.toggle('open', open);
  menuBtn.setAttribute('aria-expanded', String(open));
});
$$('#menu a').forEach((a) => a.addEventListener('click', () => { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }));
const sections = $$('main section[id]');
const linkFor = (id) => $(`#menu a[href="#${id}"]`);
const navObserver = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { $$('#menu a').forEach((a) => a.classList.remove('active')); linkFor(e.target.id)?.classList.add('active'); }
}, { rootMargin: '-45% 0px -50% 0px' });
sections.forEach((s) => navObserver.observe(s));

// ---------- countdown ----------
function countdown() {
  const days = Math.max(0, Math.ceil((new Date(SITE.kona) - new Date()) / 86400000));
  $('#countdown').textContent = numFmt(days);
}

// ---------- results ----------
function renderResults() {
  const host = $('#sheet');
  host.textContent = '';
  for (const r of RESULTS) {
    const row = document.createElement('div');
    row.className = 'sheet-row rv in';
    const yr = document.createElement('span'); yr.className = 'yr'; yr.textContent = String(r.year);
    const h = document.createElement('h3'); h.textContent = pick(r);
    const sm = document.createElement('small'); sm.textContent = r.place; h.appendChild(sm);
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
  // middle-distance progression, oldest first
  const md = RESULTS.filter((r) => r.md).slice().reverse();
  const pts = md.map((r) => ({ y: r.min, full: r.time, label: `${pick(r)} ${r.year}`, short: `${r.place.split(',')[0]} ’${String(r.year).slice(2)}` }));
  const hm = (min) => `${Math.floor(min / 60)}:${String(Math.floor(min % 60)).padStart(2, '0')}`;
  lineChart($('#chart-md'), pts, { yFmt: hm, tipFmt: (p) => p.full, ticks: [260, 265, 270, 275], label: (p) => p.label });
  const tb = $('#table-md'); tb.textContent = '';
  const head = tb.insertRow(); [t('chart.race'), t('chart.time')].forEach((x) => { const th = document.createElement('th'); th.textContent = x; head.appendChild(th); });
  md.forEach((r) => { const tr = tb.insertRow(); tr.insertCell().textContent = `${pick(r)} ${r.year}`; tr.insertCell().textContent = r.time; });
  splitBar($('#chart-im'), IRONMAN_SPLITS.map((x) => ({ key: x.k, label: pick(x), s: x.s })));
  // overall place as a share of the field
  const ranked = RESULTS.filter((r) => r.rank && r.field).map((r) => ({ label: pick(r), year: r.year, pct: (r.rank / r.field) * 100, sub: getLang() === 'en' ? `${ord(r.rank)} of ${numFmt(r.field)}` : `${r.rank}.º de ${numFmt(r.field)}` }))
    .sort((a, b) => a.pct - b.pct);
  topStrip($('#chart-top'), ranked, { fmt: (v) => `${numFmt(v, 1)}%`, top: t('chart.top') });
  const tt = $('#table-top'); tt.textContent = '';
  const h2 = tt.insertRow(); [t('chart.race'), t('chart.place'), 'Top %'].forEach((x) => { const th = document.createElement('th'); th.textContent = x; h2.appendChild(th); });
  ranked.forEach((r) => { const tr = tt.insertRow(); tr.insertCell().textContent = `${r.label} ${r.year}`; tr.insertCell().textContent = r.sub; tr.insertCell().textContent = `${numFmt(r.pct, 1)}%`; });
}
const ord = (n) => `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th'}`;

// ---------- season ----------
function fmtWhen(r) {
  const loc = getLang() === 'en' ? 'en-GB' : 'pt-PT';
  if (/^\d{4}-\d{2}$/.test(r.date)) return new Date(`${r.date}-15`).toLocaleDateString(loc, { month: 'short', year: 'numeric' }).replace('.', '');
  const d = new Date(`${r.date}T12:00:00`);
  const main = d.toLocaleDateString(loc, { day: 'numeric', month: 'short' }).replace('.', '');
  if (!r.end) return main;
  return `${main}–${new Date(`${r.end}T12:00:00`).getDate()}`;
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
    const p = document.createElement('p'); p.textContent = `${pick(r.where)} · ${pick(r.what)}`;
    const st = document.createElement('div'); st.className = 'st';
    const b = document.createElement('span'); b.className = `badge${r.status === 'goal' ? ' gold' : r.status === 'planned' ? ' dim' : ''}`; b.textContent = t(`st.status.${r.status}`);
    st.appendChild(b);
    d.append(w, h, p, st);
    host.appendChild(d);
  }
  const km = SEASON.reduce((a, r) => a + r.km, 0);
  $$('.season-kpis b')[0].textContent = SEASON.length;
  $$('.season-kpis b')[2].textContent = `~${numFmt(Math.round(km / 10) * 10)}`;
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
  const label = a.querySelector('span');
  if (SITE.gofundme) { a.href = SITE.gofundme; return; }   // label comes from i18n
  a.href = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(getLang() === 'en' ? 'Hi Gonçalo! I would like to support your road to Kona.' : 'Olá Gonçalo! Quero apoiar a tua viagem até Kona.')}`;
  label.textContent = t('gfm.soon');
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
  const fl = $('#prova').getBoundingClientRect();
  m.classList.toggle('away', fl.top < innerHeight * 0.5 && fl.bottom > innerHeight * 0.5);
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
    if (lenis) lenis.scrollTo(target, { offset: target === 0 ? 0 : -navH, duration: 1.4 });
    else if (target === 0) scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    else target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth' });
    history.replaceState(null, '', id === '#top' ? location.pathname : id);
  }));

  if (reduce || !G || !ST) { flight(1); return { lenis }; }
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
  // the suit turns to face you as the studio scrolls in
  ST.create({
    trigger: '.studio', start: 'top bottom', end: 'top 25%', scrub: true,
    onUpdate: (self) => {
      const s = getSuit();
      if (!s || userHasInteracted()) return;
      const k = self.progress;
      const e = 1 - Math.pow(1 - k, 3);
      s.setPose({ rot: lerp(Math.PI * 1.15, -0.314, e), dist: lerp(3.2, 2.2, e), ty: 0.19, y: lerp(0.5, 0.23, e) }, { shortest: false });
      if (k > 0.35 && !s._revealed) { s._revealed = true; s.reveal(); }
      if (k >= 0.999) s.setAuto(true);
    },
  });
  return { lenis };
}

// ---------- boot ----------
function renderSocial() {
  const per = SOCIAL.likesPerPost + SOCIAL.commentsPerPost;
  $('#ig-followers').textContent = numFmt(SOCIAL.followers);
  $('#ig-inter').textContent = `~${numFmt(Math.round(per / 10) * 10)}`;
  $('#ig-rate').firstChild.textContent = numFmt(Math.round((per / SOCIAL.followers) * 100));
  $('#ig-best').firstChild.textContent = numFmt(SOCIAL.bestPost);
}
function renderAll() { renderSocial(); renderResults(); renderSeason(); renderBudget(); renderGofundme(); renderStrava(); countdown(); }
renderAll();
onLang(() => renderAll());
let lastW = innerWidth;
addEventListener('resize', () => {
  clearTimeout(renderAll.t);
  renderAll.t = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; renderResults(); renderStrava(); } }, 200);
});
$('#route-km').textContent = `${numFmt(Math.round(greatCircleKm([38.7223, -9.1393], [19.6400, -155.9969]) / 10) * 10)} km`;
$('#ft-date').textContent = new Date(`${SITE.updated}T12:00:00`).toLocaleDateString(getLang() === 'en' ? 'en-GB' : 'pt-PT', { day: 'numeric', month: 'short', year: 'numeric' });
$('#print-kit').addEventListener('click', () => window.print());
initReveal();
loadStrava();

let suitRef = null;
const startMotion = () => {
  const { lenis } = initMotion(() => suitRef);
  initAdspace({
    onSuitReady: (s) => {
      suitRef = s;
      // match the scroll pose before the first frame so the suit never jumps
      const st = window.ScrollTrigger && window.ScrollTrigger.getAll().find((x) => x.trigger && x.trigger.classList && x.trigger.classList.contains('studio'));
      if (st && !reduce) {
        const k = st.progress, e = 1 - Math.pow(1 - k, 3);
        s.setPose({ rot: lerp(Math.PI * 1.15, -0.314, e), dist: lerp(3.2, 2.2, e), ty: 0.19, y: lerp(0.5, 0.23, e) }, { shortest: false });
        Object.assign(s.state, s.goal);
        if (k > 0.35) { s._revealed = true; s.reveal(); }
        if (k >= 0.999) s.setAuto(true);
      } else { s.reveal(); s.setAuto(!reduce); }
      if (location.hash.startsWith('#fato/') && lenis) lenis.scrollTo('#fato', { offset: -nav.offsetHeight, immediate: true });
    },
  });
};
// GSAP/Lenis are deferred classic scripts; modules run after them, but guard anyway
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startMotion); else startMotion();
addEventListener('load', () => window.ScrollTrigger && window.ScrollTrigger.refresh());
