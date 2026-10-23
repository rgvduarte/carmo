// Sponsor platform: rate cards, spot card, package, claim flow, logo try-on and the 3D stages.
// Chapter 05 has two parts, the suit (#o-fato) and the helmet (#o-capacete), each with its own stage, view buttons and rate
// card. One renderer serves both: its canvas moves into the stage of the part on screen and that part's model becomes
// active. The helmet (helmet.js) is built the first time its part comes near the screen.
import { t, pick, money, numFmt, onLang, getLang, fmtDay } from './i18n.js';
import { SITE } from './data.js';
import { flowSet } from './flow.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const AREAS = ['front', 'sides', 'shoulders', 'legs', 'back'];
const ITEMS = ['suit', 'helmet'];
const STORE = 'gc.package.2027';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => matchMedia('(max-width: 760px)').matches;
// a phone or tablet: links to WhatsApp stay in the tab (the app takes over), and mailto: always finds a mail app
const touch = () => matchMedia('(pointer: coarse)').matches;

let DATA = null, SPOTS = [], suit = null, helmet = null, kit = null, SuitClass = null, helmetBuild = null;
// item: the model on stage now. want: the model asked for last (set at once, before any await).
// onScreen: the part crossing the middle of the screen. landing: the part a deep link or a pick is scrolling to.
let item = 'suit', want = 'suit', onScreen = null, landing = null, hashLand = null, nearHelmet = false, booted = false, scrollToEl = null, nudgeBy = null;
let selected = null, basket = new Set(), sortMode = 'area', onlyAvail = false, wantTitle = false;
let tourCtl = null, logoFile = null, interacted = false;

const byId = (id) => SPOTS.find((s) => s.id === id);
const itemOf = (s) => s.item || 'suit';   // a spot without "item" is on the suit
const ofItem = (it) => SPOTS.filter((s) => itemOf(s) === it);
const models = () => [suit, helmet].filter(Boolean);
const modelOf = (it) => (it === 'helmet' ? helmet : suit);
const partOf = (it) => $(`.part[data-item="${it}"]`);
const stageOf = (it) => $(`.stage[data-item="${it}"]`);
const act = (it, a) => $(`[data-act="${a}"]`, stageOf(it));
const pressed = (b) => !!b && b.getAttribute('aria-pressed') === 'true';
// the part crossing the middle of the viewport right now
const midPart = () => ITEMS.find((it) => { const r = partOf(it)?.getBoundingClientRect(); return r && r.top <= innerHeight / 2 && r.bottom >= innerHeight / 2; }) || null;
const tierOf = (s) => DATA.tiers.find((x) => s.price >= x.min) || DATA.tiers[DATA.tiers.length - 1];
const available = () => SPOTS.filter((s) => s.status === 'available');
const pad2 = (n) => String(n).padStart(2, '0');
// spot size in the page's language: '26 × 8 cm', '5,5 × 3,5 cm' (PT) or '5.5 × 3.5 cm' (EN)
const cmOf = (x) => (Number.isInteger(x) ? String(x) : numFmt(x, 1));
const sizeOf = (s, sep = ' × ') => `${cmOf(s.w)}${sep}${cmOf(s.h)} cm`;
// a reservation lapses on its own once its `until` day is over, so a stale hold never blocks a sale
const lapsed = (x) => x.status === 'reserved' && x.until && Date.parse(`${x.until}T23:59:59Z`) < Date.now();
const ibanPretty = (s) => s.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
// while the booking dialog is open the toast sits just under its sticky header, clear of «Feito» and «Voltar» below
const toast = (msg) => { const el = $('#toast'); const dlg = $('#claim'); const host = dlg && dlg.open ? $('.dlg-head', dlg) : document.body; if (el.parentElement !== host) host.appendChild(el); el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3200); };

export async function initAdspace({ onSuitReady, scrollTo = null, nudge = null } = {}) {
  scrollToEl = scrollTo; nudgeBy = nudge || ((dy) => scrollBy(0, dy));
  try {
    const res = await fetch('data/spots.json', { cache: 'no-cache' });
    DATA = await res.json();
  } catch (e) {
    $('#rc-body').textContent = 'Não consegui carregar a tabela. Escreve-me para allez@gocarmo.com.';
    return;
  }
  for (const x of [...DATA.spots, DATA.title]) if (lapsed(x)) x.status = 'available';
  // the title package is the whole suit: a title partner on hold holds every free suit spot until the same day
  if (DATA.title.status === 'reserved') for (const s of DATA.spots) if (itemOf(s) === 'suit' && s.status === 'available') Object.assign(s, { status: 'reserved', until: DATA.title.until });
  // a title partner takes the whole suit: every suit spot closes under its name, its logo goes on the chest
  if (DATA.title.status === 'sold') {
    for (const s of DATA.spots) if (itemOf(s) === 'suit' && s.status !== 'sold') Object.assign(s, { status: 'sold', brand: DATA.title.brand, url: DATA.title.url });
    const top = DATA.spots.find((s) => s.top);
    if (top && DATA.title.logo && !top.logo) Object.assign(top, { logo: DATA.title.logo, logoMono: DATA.title.logoMono });
  }
  SPOTS = DATA.spots.filter((s) => ['available', 'reserved', 'sold'].includes(s.status));
  try { basket = new Set(JSON.parse(localStorage.getItem(STORE) || '[]').filter((id) => byId(id)?.status === 'available')); } catch (_) {}
  readHash();
  renderStats(); renderLegend(); renderRateCard(); renderCard(); renderPackage(); renderOnSuit();
  bindUI();
  if (selected) select(selected);
  resumeClaim();
  onLang(() => {
    renderStats(); renderLegend(); renderRateCard(); renderCard(); renderPackage(); renderOnSuit();
    if ($('#claim').open) renderClaim();
    for (const m of models()) { m.labels = kitLabels(); m.money = money; m.drawOverlay(); m.kick(); }
    const ld = $('#item-loading span'); if (ld) ld.textContent = t('helmet.loading');
    const gl = $('#gl-lost span'); if (gl) gl.textContent = t('stage.lost');
  });
  // the 3D view loads when the entry cards or either stage approach the viewport (so it is ready by the time the suit
  // part is reached, and a helmet deep link, which lands far below the suit, still gets it)
  const io = new IntersectionObserver(async (en) => {
    if (!en.some((e) => e.isIntersecting)) return;
    io.disconnect();
    await mountSuit();
    if (suit && onSuitReady) onSuitReady(suit);
  }, { rootMargin: '600px 0px' });
  [$('.entry'), ...ITEMS.map(stageOf)].forEach((el) => el && io.observe(el));
  // the helmet is built once its part comes near, so it is usually ready by the time it is on screen
  const near = new IntersectionObserver((en) => {
    if (!en[0].isIntersecting) return;
    near.disconnect(); nearHelmet = true;
    if (suit) ensureHelmet();
  }, { rootMargin: '400px 0px' });
  near.observe(stageOf('helmet'));
  // the part on screen is the one crossing the middle of the viewport; the stage follows it. Read from the layout on every
  // scroll (an IntersectionObserver reports a frame late and can skip a state when the page jumps twice in one frame)
  const check = () => { const it = midPart(); if (it) partShown(it); };
  addEventListener('scroll', check, { passive: true });
  addEventListener('resize', check);
  check();
  booted = true;
}

function kitLabels() { return { sold: t('lbl.sold'), reserved: t('lbl.reserved'), top: t('lbl.top') }; }
const onModelSelect = (id) => { stopTour(); select(id, { from3d: true }); };

async function mountSuit() {
  try {
    const mod = await import('./suit.js');
    if (!mod.webglAvailable()) throw new Error('webgl');
    SuitClass = mod.Suit;
    // the helmet part is the one on screen (or a helmet deep link): the suit is built idle, so it never flashes up first
    const idle = want === 'helmet';
    const s = new mod.Suit(stageOf('suit'), { spots: ofItem('suit'), money, labels: kitLabels(), onSelect: onModelSelect, onHover: () => {}, active: !idle });
    // the body is meshed in a worker: the stage keeps its loading label until the suit is ready
    await s.ready;
    const first = want === 'helmet';   // read again: the visitor may have scrolled to the other part meanwhile
    if (idle && !first) s.setActive(true);
    suit = kit = s;
    item = 'suit';
    suit.setBasket([...basket]);
    // the booking dialog can be up before the stage is (a reload that brings the payment back): hold still behind it
    if ($('#claim').open) suit.hold(true);
    printSponsors(suit);
    for (const st of $$('.stage')) {
      st.addEventListener('suit:interact', () => { interacted = true; stopTour(); act(st.dataset.item, 'rotate')?.setAttribute('aria-pressed', 'false'); });
      st.addEventListener('suit:frame', () => { if (kit) kit._drawn = true; placeCallout(); });
    }
    watchContext(suit.canvas);
    $('#stage-loading')?.remove();
    if (!first) liveIn('suit');
    else {
      await showItem('helmet');
      // the helmet could not be built, or the suit part came back on screen while it was: the suit takes the stage
      if (item !== 'helmet' && kit) { suit.setActive(true); liveIn('suit'); }
    }
    if (kit && selected && itemOf(byId(selected)) === item) kit.select(selected, { focus: true });
    if (nearHelmet && suit) ensureHelmet();
  } catch (e) {
    $('#stage-loading')?.remove();
    no3d();
  }
}

// The canvas is in the stage of `it`; the other stage keeps the last frame its model drew (a still, not a blank box),
// or the static picture of its model if that model never drew.
function liveIn(it) {
  for (const x of ITEMS) {
    const st = stageOf(x);
    st.classList.toggle('live', x === it);
    if (x === it) st.classList.remove('frozen');
  }
}
function freeze(m) {
  const st = m && m.canvas.parentElement;
  if (!st || !st.classList.contains('stage') || !m._drawn) return;
  let fz = $(':scope > .stage-freeze', st);
  if (!fz) { fz = document.createElement('canvas'); fz.className = 'stage-freeze'; fz.setAttribute('aria-hidden', 'true'); st.prepend(fz); }
  try {
    fz.width = m.canvas.width; fz.height = m.canvas.height;
    fz.getContext('2d').drawImage(m.canvas, 0, 0);
    st.classList.add('frozen');
  } catch (_) { st.classList.remove('frozen'); }
}

// Phones drop the GL context of a tab under memory pressure, often while it sits in the background (the booking
// flow itself sends people out to WhatsApp or Mail). three.js keeps the scenes and rebuilds its GL state when the
// context comes back, so the stage only waits under a label. If the context is still gone a few seconds after the
// page is back in view, the rate card carries the sale on its own.
let glBack = null;   // pending while the context is lost: resolves on restore or on the fallback
function watchContext(canvas) {
  let timer = 0, done = null;
  const arm = () => { clearTimeout(timer); if (glBack && !document.hidden) timer = setTimeout(no3d, 6000); };
  canvas.addEventListener('webglcontextlost', () => {
    if (glBack) return;
    glBack = new Promise((res) => { done = res; }); glBack.done = () => { clearTimeout(timer); glBack = null; done(); };
    const lbl = document.createElement('div'); lbl.className = 'loading'; lbl.id = 'gl-lost';
    const sp = document.createElement('span'); sp.textContent = t('stage.lost'); lbl.appendChild(sp);
    (canvas.parentElement || stageOf('suit')).appendChild(lbl);
    arm();
  });
  document.addEventListener('visibilitychange', arm);
  canvas.addEventListener('webglcontextrestored', () => {
    if (!glBack || !suit) return;
    $('#gl-lost')?.remove();
    glBack.done();
    for (const m of models()) m.restoreGL();
  });
}

// no WebGL (or the context did not come back): the rate card carries the sale on its own
function no3d() {
  for (const m of models()) m.setActive(false);
  suit = helmet = kit = null;
  if (glBack) glBack.done();
  stopTour();
  $('#callout').classList.remove('on');
  for (const it of ITEMS) stageStill(it, 'suit.no3d');
  ['#sd-try', '#tryon'].forEach((q) => { const n = $(q); if (n) n.hidden = true; });
}
// a stage without 3D: the picture of its model stays, with a line that says why, and its 3D controls go
function stageStill(it, key) {
  const stage = stageOf(it);
  $$(':scope > canvas, .loading', stage).forEach((n) => n.remove());
  stage.classList.remove('live', 'frozen');
  if (!$('.stage-fallback', stage)) {
    const fb = document.createElement('div');
    fb.className = 'stage-fallback';
    const sp = document.createElement('span'); sp.dataset.i18n = key; sp.textContent = t(key); fb.appendChild(sp);
    stage.appendChild(fb);
  }
  stage.classList.add('no3d');
  // a still picture does not need to stay on screen while the rate card scrolls
  const studio = stage.closest('.studio'); studio.classList.add('no3d'); studio.classList.remove('compact');
  $$('.stage-ui, .stage-foot', stage).forEach((n) => n.remove());
  const ch = $(`.chapters[data-item="${it}"]`); if (ch) ch.hidden = true;
}

// The helmet, built once on first view, on the suit's renderer (one canvas, one GL context).
// The label «A carregar o capacete» sits in the helmet's stage from the start and goes once the build is over.
function ensureHelmet() {
  helmetBuild ||= (async () => {
    try {
      const { Helmet } = await import('./helmet.js');
      // the build is synchronous: let the label paint first
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
      if (glBack) await glBack;   // a lost context cannot compile or upload: wait for it to come back
      if (!suit) return false;
      helmet = new Helmet(stageOf('helmet'), { spots: ofItem('helmet'), money, labels: kitLabels(), onSelect: onModelSelect, onHover: () => {}, renderer: suit.renderer, active: false });
      helmet.setBasket([...basket]);
      if ($('#claim').open) helmet.hold(true);
      await helmet.prepare();   // the constant part of the bake, in short tasks, before any logo is printed
      await printSponsors(helmet);
      await helmet.ready();
      return true;
    } catch (e) {
      console.error(e);
      helmet = null;
      // the helmet's part keeps its picture and its rate card; only its 3D controls go
      if (suit) { toast(t('toast.helmet')); stageStill('helmet', 'toast.helmet'); }
      return false;
    } finally { $('#item-loading')?.remove(); }
  })();
  return helmetBuild;
}

// Put the suit or the helmet on stage: its model becomes active and the shared canvas moves into its part's stage.
// Several calls can overlap (scrolling back and forth while the helmet builds): only the last one asked for (`want`)
// switches, and it selects whatever is selected by then.
async function showItem(it) {
  want = it;
  if (!kit) return;                        // no stage yet: mountSuit reads `want`
  if (it === item) return;
  stopTour();                              // a tour on the old model would select its spots and undo `want`
  if (it === 'helmet' && !(await ensureHelmet())) { if (want === 'helmet') want = item; return; }
  if (want !== it || item === it || !kit) return;
  stopTour();                              // and one started while the helmet was building
  const next = modelOf(it);
  freeze(kit);
  kit.setActive(false);
  kit = next; item = it;
  const co = $('#callout'); co.classList.remove('on'); stageOf(it).appendChild(co);
  // each stage has its own switches (spots, rotate)
  const spotsOn = pressed(act(it, 'spots'));
  kit.setShowSpots(spotsOn);
  kit.setAuto(pressed(act(it, 'rotate')));
  kit.setActive(true);
  liveIn(it);
  if (!kit._revealed) { kit._revealed = true; kit.reveal(); }
  const s = selected && byId(selected);
  if (s && itemOf(s) === item) {
    if (!spotsOn) { act(it, 'spots')?.setAttribute('aria-pressed', 'true'); kit.setShowSpots(true); }
    kit.select(selected, { focus: true });
    if ($('#tryon').classList.contains('on') && logoFile) applyLogo();
  } else kit.select(null);
}

// The part crossing the middle of the screen changed: its model takes the stage. While a deep link or a pick in the
// other part scrolls there, the parts it passes on the way are not shown.
function partShown(it) {
  if (it === onScreen) return;
  onScreen = it;
  if (landing) return;
  // a phone's spot sheet belongs to the part it was opened in
  const s = selected && byId(selected);
  if (s && itemOf(s) !== it && $('#spot-card').classList.contains('open')) closeSheet();
  showItem(it);
}
// scroll a part into view (main.js passes the page's scroller, Lenis or native) and show its model once there
function land(it, { immediate = false } = {}) {
  const el = partOf(it);
  if (!el || !scrollToEl || landing === it) return;
  landing = it;
  const done = () => {
    if (landing !== it) return;
    landing = null;
    const now = midPart();
    if (now) onScreen = now;
    if (now && now !== want && !(selected && itemOf(byId(selected)) === want)) showItem(now);
  };
  Promise.resolve(scrollToEl(el, { immediate })).then(done, done);
  setTimeout(done, 2500);   // never stay locked if the scroller does not report back
}
// a change in the suit's part while the helmet's part is being read would push the page: keep the helmet part in place
// (not while the page is about to land somewhere else anyway)
function steady(fn, on = true) {
  const a = on && !landing && !mobile() && midPart() === 'helmet' ? partOf('helmet') : null;
  const y0 = a ? a.getBoundingClientRect().top : 0;
  fn();
  if (!a) return;
  const dy = a.getBoundingClientRect().top - y0;
  if (Math.abs(dy) > 0.5) nudgeBy(dy);
}

// Sold spots wear the sponsor's real logo on the 3D model (spots.json → "logo").
// A dark logo on the black shorts is knocked out to white unless "logoMono" says otherwise.
async function printSponsors(m) {
  const sold = m.spots.filter((s) => s.status === 'sold' && s.logo);
  if (!sold.length) return;
  await Promise.all(sold.map(async (s) => {
    try {
      const blob = await (await fetch(s.logo)).blob();
      let c = await SuitClass.prepareLogo(blob, { removeWhite: true, mono: s.logoMono || null });
      if (!s.logoMono && m.rects.get(s.id)?.light === false && inkOf(c) < 110) c = await SuitClass.prepareLogo(blob, { removeWhite: true, mono: '#f6f7f9' });
      s._logo = c;
    } catch (_) {}
  }));
  m.drawBase(); m.drawOverlay(); m.kick();
}
function inkOf(c) {
  const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let sum = 0, wt = 0;
  for (let i = 0; i < p.length; i += 16) { const a = p[i + 3] / 255; sum += a * (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]); wt += a; }
  return wt ? sum / wt : 255;
}

// "Já no fato" (or "no capacete", or both): the brands that have closed a spot, with a link to each.
// A brand that is only on the helmet, or on both, says so.
function renderOnSuit() {
  const host = $('#onsuit');
  if (!host) return;
  const list = $('#onsuit-list'); list.textContent = '';
  const brands = new Map();
  if (DATA.title.status === 'sold' && DATA.title.brand) brands.set(DATA.title.brand, { brand: DATA.title.brand, url: DATA.title.url, title: true, items: new Set(['suit']) });
  for (const s of SPOTS.slice().sort((a, b) => b.price - a.price)) {
    if (s.status !== 'sold' || !s.brand) continue;
    if (!brands.has(s.brand)) brands.set(s.brand, { brand: s.brand, url: s.url, items: new Set() });
    brands.get(s.brand).items.add(itemOf(s));
  }
  const items = new Set();
  for (const b of brands.values()) {
    b.items.forEach((x) => items.add(x));
    const li = document.createElement('li');
    const el = document.createElement(b.url ? 'a' : 'span');
    if (b.url) { el.href = b.url; el.target = '_blank'; el.rel = 'noopener'; }
    el.textContent = b.brand;
    const tags = [];
    if (b.title) tags.push('Title partner');
    if (b.items.has('helmet')) tags.push(t(b.items.has('suit') ? 'on.both' : 'on.helmet'));
    for (const tag of tags) { const k = document.createElement('small'); k.textContent = tag; el.appendChild(k); }
    li.appendChild(el); list.appendChild(li);
  }
  $('#onsuit .k').textContent = t(items.has('helmet') ? (items.has('suit') ? 'on.kB' : 'on.kH') : 'on.k');
  host.hidden = !brands.size;
}

const statusText = (s) => {
  if (s.status === 'sold' && s.brand) return `${t('st.sold')} · ${s.brand}`;
  if (s.status === 'reserved' && s.until) return t('st.until', fmtDay(s.until, { year: false }));
  return t(`st.${s.status}`);
};

export function getSuit() { return suit; }
export function getHelmet() { return helmet; }
export function getKit() { return kit; }
// where a deep link lands: the part of its spot (or of its package), the chapter for a mixed package, or nowhere
export function landTarget() {
  if (hashLand) return partOf(hashLand);
  return /^#fato$/.test(location.hash) ? $('#fato') : null;
}
export function userHasInteracted() { return interacted || !!selected; }

// ---------- stats ----------
// The chapter's counts cover every spot, suit and helmet; each entry card and part counts its own; the title package
// is the suit's 20 alone.
function renderStats() {
  const av = available();
  flowSet($('#avail-n'), av.length);
  flowSet($('#hero-spots'), av.length);
  $('#avail-t').textContent = SPOTS.length;
  $('#avail-pct').textContent = `${Math.round((av.length / SPOTS.length) * 100)}%`;
  $('#avail-bar').style.width = `${(av.length / SPOTS.length) * 100}%`;
  $('#ad-sub').textContent = t('ad.sub', SPOTS.length, ofItem('suit').length, ofItem('helmet').length);
  $('#only-n').textContent = t('rc.free', av.filter((s) => itemOf(s) === 'suit').length);
  for (const it of ITEMS) {
    const all = ofItem(it), free = all.filter((s) => s.status === 'available');
    if (!all.length) continue;
    // «20 espaços · desde 60 €»; once some are taken, «18 de 20 livres» and the cheapest one still free
    $(`#en-${it}-n`).textContent = !free.length ? t('en.none') : free.length === all.length ? t('pk.spots', all.length) : t('en.left', free.length, all.length);
    const from = $(`#en-${it}-from`);
    from.hidden = !free.length;
    if (free.length) from.textContent = t('en.from', money(Math.min(...free.map((s) => s.price))));
    const prices = all.map((s) => s.price);
    $(`#pt-p${it === 'suit' ? 1 : 2}`).textContent = t(`part.${it}`, all.length, money(Math.min(...prices)), money(Math.max(...prices)));
  }
  $('#tp-price').textContent = money(DATA.title.price);
  const tpBtn = $('#tp-btn');
  tpBtn.disabled = DATA.title.status !== 'available' || !titleOpen();
  if (DATA.title.status !== 'available') tpBtn.textContent = statusText(DATA.title);
}
// the whole suit can be asked for only while every suit spot is free (helmet sales do not matter)
const titleOpen = () => ofItem('suit').every((s) => s.status === 'available');

// The tiers as a small table per part, one row each: [dot] Principal · 400–600 € · 3 espaços, with the columns lined up
function renderLegend() {
  // '400–600 €' (PT) or '€400–600' (EN): the currency once, on the side the language writes it
  const range = (lo, hi) => (lo === hi ? money(lo) : getLang() === 'en' ? `${money(lo)}–${numFmt(hi)}` : `${numFmt(lo)}–${money(hi)}`);
  for (const it of ITEMS) {
    const body = $(`.ratecard[data-item="${it}"] .tiers-legend tbody`);
    if (!body) continue;
    body.textContent = '';
    for (const tr of DATA.tiers) {
      const inTier = ofItem(it).filter((s) => tierOf(s).key === tr.key);
      if (!inTier.length) continue;
      const lo = Math.min(...inTier.map((s) => s.price)), hi = Math.max(...inTier.map((s) => s.price));
      const row = document.createElement('tr');
      const cell = (cls, txt) => { const td = document.createElement('td'); td.className = cls; td.textContent = txt; row.appendChild(td); return td; };
      const nm = cell('tl-name', pick(tr));
      const dot = document.createElement('i'); dot.className = `t-${tr.key}`; dot.setAttribute('aria-hidden', 'true'); nm.prepend(dot);
      cell('tl-range', range(lo, hi));
      cell('tl-n', t('pk.spots', inTier.length));
      body.appendChild(row);
    }
  }
}

// ---------- rate card ----------
// The suit's card groups its 20 spots by area or by price tier (and can hide the taken ones); the helmet's lists its 4.
function renderRateCard() {
  const hb = $('#rc-body-h');
  hb.textContent = '';
  const hl = document.createElement('ul'); hl.className = 'rc-list';
  for (const s of ofItem('helmet').sort((a, b) => a.n - b.n)) hl.appendChild(row(s));
  hb.appendChild(hl);
  const host = $('#rc-body');
  host.textContent = '';
  const list = ofItem('suit').filter((s) => !onlyAvail || s.status === 'available');
  const groups = [];
  if (sortMode === 'area') {
    for (const a of AREAS) { const items = list.filter((s) => s.area === a).sort((x, y) => x.n - y.n); if (items.length) groups.push({ title: t(`z.${a}`), items }); }
  } else {
    for (const tr of DATA.tiers) { const items = list.filter((s) => tierOf(s).key === tr.key).sort((x, y) => y.price - x.price || x.n - y.n); if (items.length) groups.push({ title: pick(tr), items }); }
  }
  for (const g of groups) {
    const box = document.createElement('div'); box.className = 'rc-group';
    const h = document.createElement('h5');
    const sum = g.items.filter((s) => s.status === 'available').reduce((a, s) => a + s.price, 0);
    const l = document.createElement('span'); l.textContent = g.title;
    const r = document.createElement('span'); r.textContent = `${g.items.length} · ${money(sum)}`;
    h.append(l, r); box.appendChild(h);
    const ul = document.createElement('ul'); ul.className = 'rc-list';
    for (const s of g.items) ul.appendChild(row(s));
    box.appendChild(ul); host.appendChild(box);
  }
}

function row(s) {
  const li = document.createElement('li');
  li.className = `rc-row${s.id === selected ? ' sel' : ''}${s.status === 'sold' ? ' sold' : ''}${s.status !== 'available' ? ' has-st' : ''}`;
  li.dataset.id = s.id;
  const dot = document.createElement('i'); dot.className = `row-dot t-${tierOf(s).key}`;
  const n = document.createElement('span'); n.className = 'n'; n.textContent = String(s.n).padStart(2, '0');
  const nm = document.createElement('button'); nm.type = 'button'; nm.className = 'nm';
  // inside its own part a helmet row drops the «Capacete, …» its full name carries (spots.json → pt/en.short)
  nm.textContent = pick(s).short || pick(s).name;
  const small = document.createElement('small'); small.textContent = sizeOf(s);
  nm.appendChild(small);
  nm.setAttribute('aria-label', `${pick(s).name}, ${money(s.price)}, ${statusText(s)}`);
  nm.addEventListener('click', () => { stopTour(); select(s.id); });
  const pr = document.createElement('span'); pr.className = 'pr'; pr.textContent = money(s.price);
  // the status is its own grid item, a second line under the name and the price, so a long brand never squeezes the
  // name column
  const st = s.status !== 'available' ? document.createElement('small') : null;
  if (st) { st.className = 'st'; st.textContent = statusText(s); }
  const add = document.createElement('button'); add.type = 'button'; add.className = 'add';
  add.textContent = basket.has(s.id) ? '✓' : '+';
  add.setAttribute('aria-pressed', String(basket.has(s.id)));
  add.setAttribute('aria-label', `${t('spot.add')}: ${pick(s).name}`);
  add.disabled = s.status !== 'available';
  add.addEventListener('click', () => toggleBasket(s.id));
  li.append(dot, n, nm, pr, add);
  li.addEventListener('click', (e) => { if (e.target.closest('.add, .nm')) return; stopTour(); select(s.id); });
  if (st) li.appendChild(st);
  return li;
}

// ---------- selection + card ----------
// A spot on the other model switches the stage first (showItem selects it once that model is up), and when its part is
// not the one on screen (a deep link, a hash change) the page scrolls there.
function select(id, { from3d = false, focus = true } = {}) {
  selected = id && byId(id) ? id : null;
  const it = selected ? itemOf(byId(selected)) : want, switching = it !== item;
  // the model on stage lets go of its spot at once: the card already shows the new one, and if the other model
  // cannot be built (helmet.js failed to load) the stage stays neutral instead of highlighting the old spot
  if (switching) { if (kit) kit.select(null); showItem(it); }
  else { want = it; if (kit && !from3d) kit.select(selected, { focus }); }
  const away = !!selected && booted && it !== midPart();
  renderCard({ steadyView: !away });
  if (away) land(it);
  $$('.rc-row').forEach((r) => r.classList.toggle('sel', r.dataset.id === selected));
  $$('.chapter[data-focus]').forEach((c) => c.classList.toggle('on', c.dataset.focus === selected));
  const sp = act(it, 'spots');
  if (selected && sp && !pressed(sp)) { sp.setAttribute('aria-pressed', 'true'); if (!switching && kit) kit.setShowSpots(true); }
  $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  const tryon = $('#tryon');
  if (tryon.classList.contains('on') && logoFile && selected && !switching) applyLogo();   // showItem re-applies it after a switch
  if (!selected) $('#callout').classList.remove('on');
  const sheet = $('#spot-card');
  const open = !!selected && mobile();
  sheet.classList.toggle('open', open);
  sheet.style.removeProperty('--drag');
  document.body.classList.toggle('sheet-open', open);
  if (open) { sheet.scrollTop = 0; if (from3d && navigator.vibrate) navigator.vibrate(8); }
}

// One spot card, in the panel of its spot's part; each part shows its own prompt while none of its spots is picked.
// (On phones the card is a bottom sheet, so where it sits in the page does not matter.)
function renderCard({ steadyView = true } = {}) {
  const s = selected && byId(selected), card = $('#spot-card');
  const host = s ? $(`.spot-slot[data-item="${itemOf(s)}"]`) : null;
  steady(() => {
    if (host && card.parentElement !== host) host.appendChild(card);
    $$('.spot-slot').forEach((sl) => sl.classList.toggle('held', sl === host));
    card.classList.toggle('has', !!s);
  }, steadyView);
  if (!s) return;
  const tr = tierOf(s);
  const topId = SPOTS.find((x) => x.top)?.id;
  $('#sd-id').textContent = `${String(s.n).padStart(2, '0')} · ${t(`z.${s.area}`).toUpperCase()}`;
  $('#sd-name').textContent = pick(s).name;
  $('#sd-price').textContent = money(s.price);
  // «Principal · época 2027»: on a phone two lines of their own, never a break inside «época 2027»
  const tier = $('#sd-tier'); tier.textContent = '';
  for (const [cls, txt] of [['t1', pick(tr)], ['t2', getLang() === 'en' ? `${DATA.season} season` : `época ${DATA.season}`]]) { const sp = document.createElement('span'); sp.className = cls; sp.textContent = txt; tier.appendChild(sp); }
  $('#sd-size').textContent = sizeOf(s);
  $('#sd-status').textContent = statusText(s);
  $('#sd-status').className = `badge${s.status === 'available' ? '' : ' dim'}`;
  $('#sd-top').hidden = s.id !== topId;
  $('#sd-pitch').textContent = pick(s).pitch;
  $('#spot-status').textContent = `${pick(s).name} · ${money(s.price)}`;
  const vis = $('#sd-vis'); vis.textContent = '';
  for (const k of ['bike', 'run', 'finish', 'social']) {
    const d = document.createElement('div');
    d.textContent = t(`vis.${k}`);
    d.setAttribute('role', 'img');
    d.setAttribute('aria-label', `${t(`vis.${k}`)}: ${s.vis[k]}/3`);
    const bars = document.createElement('div'); bars.className = 'bars';
    for (let i = 0; i < 3; i++) { const b = document.createElement('i'); if (i < s.vis[k]) b.className = 'on'; bars.appendChild(b); }
    d.appendChild(bars); vis.appendChild(d);
  }
  const add = $('#sd-add');
  add.textContent = basket.has(s.id) ? t('spot.added') : t('spot.add');
  add.disabled = s.status !== 'available';
  $('#sd-try').disabled = s.status === 'sold';
}

function placeCallout() {
  const co = $('#callout');
  if (!kit || !selected) { co.classList.remove('on'); return; }
  // null while the selected spot is on the model that is still coming up
  const s = byId(selected), p = kit.project(selected);
  if (!p) { co.classList.remove('on'); return; }
  co.style.left = `${p.x}px`; co.style.top = `${p.y}px`;
  co.classList.toggle('on', p.visible && !(logoFile && $('#tryon').classList.contains('on')));
  co.classList.toggle('top', !!s.top);
  $('#co-n').textContent = String(s.n).padStart(2, '0');
  $('#co-name').textContent = pick(s).name;
  $('#co-price').textContent = s.status === 'available' ? money(s.price) : statusText(s);
}

// ---------- package ----------
function toggleBasket(id) {
  const s = byId(id);
  if (!s || s.status !== 'available') { toast(t('toast.sold')); return; }
  // a different package is a new request: a note of the one sent before no longer applies
  forgetSent();
  wantTitle = false;
  if (basket.has(id)) basket.delete(id); else basket.add(id);
  saveBasket();
}
function saveBasket() {
  try { localStorage.setItem(STORE, JSON.stringify([...basket])); } catch (_) {}
  renderPackage(); renderRateCard(); renderCard();
  for (const m of models()) m.setBasket([...basket]);
}
// the bundle discount counts suit and helmet spots together
function totals() {
  if (wantTitle) return { list: [], gross: DATA.title.price, net: DATA.title.price, disc: 0 };
  const list = [...basket].map(byId).filter(Boolean);
  const gross = list.reduce((a, s) => a + s.price, 0);
  const disc = list.length >= DATA.bundle.min ? DATA.bundle.discount : 0;
  return { list, gross, net: Math.round(gross * (1 - disc)), disc };
}
function renderPackage() {
  const pk = $('#package');
  const { list, gross, net, disc } = totals();
  const on = wantTitle || list.length > 0;
  pk.classList.toggle('on', on);
  document.body.classList.toggle('pk-on', on);
  if (!on) return;
  // the total stands alone on top; the count, the bundle discount and the names share the line below, where only the
  // names give way on a narrow screen (on phones that line runs the full width of the bar, under the buttons)
  $('#pk-total').textContent = money(net);
  const line = $('#pk-list'); line.textContent = '';
  const part = (cls, txt) => { const el = document.createElement('span'); el.className = cls; el.textContent = txt; line.appendChild(el); };
  part('pk-k', wantTitle ? t('msg.title') : t('pk.spots', list.length));
  // flex items drop a leading space, so the separator leads with a no-break one
  if (disc) part('pk-d', `\u00a0· ${t('pk.disc', Math.round(disc * 100))} (${money(gross)})`);
  if (!wantTitle) part('pk-names', `\u00a0· ${list.map((s) => pick(s).name).join(', ')}`);
  line.classList.toggle('has-d', !!disc);
}

function packageLink() {
  const base = `${location.origin}${location.pathname}`;
  return wantTitle ? `${base}#fato/title` : `${base}#pacote=${[...basket].join(',')}`;
}

// what the request is for: '' the suit, 'H' the helmet only, 'B' both (picks msg.hi / msg.hiH / msg.hiB, same for the subject)
function kindKey() {
  if (wantTitle) return '';
  const kinds = new Set(totals().list.map(itemOf));
  return kinds.has('helmet') ? (kinds.has('suit') ? 'B' : 'H') : '';
}

// one text for WhatsApp, email and Instagram: the spots with their sizes, the total, who is asking, the KONA code.
// sizes / extra: only the email ever drops the sizes or passes a shortened message of the buyer's own (see mailFit)
function message({ sizes = true, extra = null } = {}) {
  const { list, net, gross, disc } = totals();
  const brand = $('#cl-brand').value.trim(), name = $('#cl-name').value.trim(), nif = $('#cl-nif').value.trim();
  extra ??= $('#cl-msg').value.trim();
  const lines = [t(`msg.hi${kindKey()}`), ''];
  if (wantTitle) lines.push(`${t('msg.title')}: ${money(net)}`);
  else {
    lines.push(`${t('msg.spots')}:`);
    for (const s of list) lines.push(`• ${String(s.n).padStart(2, '0')} ${pick(s).name}${sizes ? ` (${sizeOf(s, '×')})` : ''} · ${money(s.price)}`);
    lines.push(`${t('msg.total')}: ${money(net)}${disc ? ` (${money(gross)} −${Math.round(disc * 100)}%)` : ''}`);
  }
  if (brand) lines.push(`${t('msg.brand')}: ${brand}`);
  if (name) lines.push(`${t('msg.name')}: ${name}`);
  if (nif) lines.push(`${t('msg.nif')}: ${nif}`);
  lines.push(`${t('msg.ref')}: ${payRef()}`);
  lines.push(t(mbwayOk(net) ? 'msg.pay' : 'msg.payTr'));
  if (extra) lines.push('', extra);
  lines.push('', packageLink());
  return lines.join('\n');
}

// The email goes through the device's own mail app: a plain mailto: link, never a webmail compose URL. Some mail apps
// (Outlook on Windows above all) drop a mailto: link longer than about 2 000 characters, and accents, spaces and line
// breaks take 3 to 6 characters each once encoded, so the cap is on the encoded link, not on the text. Over it, the
// spot sizes go first; then the buyer's own message is shortened, says so in the email, and a line under the message
// field tells the buyer before they send (WhatsApp and Instagram always carry the whole text).
const MAIL_MAX = 2000;
function mailFit() {
  const url = (o) => `mailto:${SITE.email}?subject=${encodeURIComponent(t(`msg.subject${kindKey()}`))}&body=${encodeURIComponent(message(o))}`;
  const own = $('#cl-msg').value.trim();
  let u = url();
  if (u.length <= MAIL_MAX) return { url: u, cut: false };
  u = url({ sizes: false });
  if (u.length <= MAIL_MAX || !own) return { url: u, cut: false };
  // the longest start of the message that fits, cut on whole characters (an emoji is never split)
  const chars = Array.from(own);
  const short = (k) => (k ? `${chars.slice(0, k).join('').trimEnd()}…\n${t('msg.cut')}` : t('msg.cut'));
  let lo = 0, hi = chars.length - 1;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (url({ sizes: false, extra: short(mid) }).length <= MAIL_MAX) lo = mid; else hi = mid - 1; }
  // end on a whole word when there is one close by
  const sp = chars.slice(0, lo + 1).findLastIndex((c) => /\s/.test(c));
  if (sp > 0 && lo - sp < 40) lo = sp;
  return { url: url({ sizes: false, extra: short(lo) }), cut: true };
}
const mailUrl = () => mailFit().url;
// shown under the message field only while the email would have to shorten it
function mailCutHint() {
  const hint = $('#cl-mailcut'), on = !!$('#cl-msg').value.trim() && mailFit().cut;
  hint.hidden = !on;
  if (on) $('#cl-msg').setAttribute('aria-describedby', 'cl-mailcut'); else $('#cl-msg').removeAttribute('aria-describedby');
}
const waUrl = () => `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message())}`;

// A sent request is noted for this tab only (sessionStorage, gone when the tab closes): if the phone reloads the page
// while the buyer is in WhatsApp or Mail, the payment opens again by itself. «Feito» and «Limpar» forget it.
const SENT = 'gc.claim.sent';
const pkKey = () => (wantTitle ? 'title' : [...basket].sort().join(','));
const noteSent = () => { try { sessionStorage.setItem(SENT, pkKey()); } catch (_) {} };
const forgetSent = () => { try { sessionStorage.removeItem(SENT); } catch (_) {} };
function resumeClaim() {
  let sent = null;
  try { sent = sessionStorage.getItem(SENT); } catch (_) {}
  if (!sent) return;
  // the whole suit has no basket to come back from, so the note brings the title request back while it is still open
  const was = wantTitle;
  if (sent === 'title' && DATA.title.status === 'available' && titleOpen()) wantTitle = true;
  // a spot sold or dropped since then changes the key, and the old payment details would be wrong: nothing opens
  if (sent !== pkKey() || !(wantTitle || basket.size)) { wantTitle = was; return; }
  renderPackage();
  openClaim({ step: 2 });
}

// ---------- booking dialog ----------
// Two steps, one screen each: 1 «Reservar» (what, the brand, send the request) and 2 «Pagar» (transfer or MB WAY).
// Every send action opens the app and moves the dialog on to step 2, so the payment waits there when the buyer is back.
let clStep = 1, payTab = 'tr', sentBy = '';
// MB WAY takes at most SITE.mbwayMax per transfer (2 000 EUR, exactly 2 000 included); above it, transfer only
const mbwayOk = (net) => !!SITE.mbway && net <= (SITE.mbwayMax || Infinity);

function openClaim({ step = 1 } = {}) {
  const dlg = $('#claim');
  // MB WAY first whenever it can take the amount (the quicker way on a phone); nothing is remembered between opens
  payTab = mbwayOk(totals().net) ? 'mb' : 'tr';
  sentBy = '';
  $('#cl-items').hidden = true;
  if (!$('#cl-nif').value.trim() && !$('#cl-msg').value.trim()) {
    const add = $('#cl-add');
    $('#cl-extra').hidden = true; add.hidden = false; add.setAttribute('aria-expanded', 'false');
  }
  brandErr(false);
  goStep(step, { focus: false });
  for (const m of models()) m.hold(true);
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  $('#claim .close').focus({ preventScroll: true });
}

function goStep(n, { focus = true } = {}) {
  clStep = n;
  $('#cl-s1').hidden = n !== 1;
  $('#cl-s2').hidden = n !== 2;
  renderClaim();
  $('#claim .dlg-body').scrollTop = 0;
  // the heading takes focus, so a screen reader hears «Pagar» / «Reservar» and Tab starts from the top of the step
  if (focus) { const h = $('#cl-h'); h.tabIndex = -1; h.focus({ preventScroll: true }); }
}

function renderClaim() {
  const { list, gross, net, disc } = totals();
  $('#claim').dataset.step = clStep;
  $('#cl-h').textContent = t(clStep === 1 ? 'cl.h1' : 'cl.h2');
  $('#cl-step').textContent = t('cl.step', clStep);
  // step 1: one line («Peito · 600 €», «3 espaços · 1 080 €»); a package lists its spots and the saving behind «ver»
  $('#cl-what').textContent = wantTitle ? t('cl.title') : list.length === 1 ? pick(list[0]).name : t('pk.spots', list.length);
  $('#cl-tot').textContent = money(net);
  const items = $('#cl-items'), more = $('#cl-more');
  more.hidden = wantTitle || list.length < 2;
  if (more.hidden) items.hidden = true;
  more.textContent = t(items.hidden ? 'cl.more' : 'cl.less');
  more.setAttribute('aria-expanded', String(!items.hidden));
  items.textContent = '';
  const li = (k, v, cls = '') => { const el = document.createElement('li'); if (cls) el.className = cls; const a = document.createElement('span'), b = document.createElement('span'); a.textContent = k; b.textContent = v; el.append(a, b); items.appendChild(el); };
  if (!wantTitle) for (const s of list) li(`${pad2(s.n)} ${pick(s).name}`, money(s.price));
  if (disc) li(t('cl.save', Math.round(disc * 100)), `−${money(gross - net)}`, 'save');
  if (!$('#cl-brand-err').hidden) $('#cl-brand-err').textContent = t('cl.err');
  mailCutHint();
  // step 2: the same amount and KONA code under either tab
  $('#pay-amt').textContent = money(net);
  $('#pay-amt-cp').dataset.copy = String(net);
  $('#pay-ref').textContent = payRef();
  $('#pay-ref-cp').dataset.copy = payRef();
  // a computer with no mail app does nothing on a mailto: link, so there step 2 offers the address to copy after the
  // email action; a phone always has Mail, and the line would only push «Feito» off the screen
  $('#cl-mailfb').hidden = sentBy !== 'mail' || touch();
  const ok = mbwayOk(net), cap = $('#pay-cap');
  $('#pay-tabs').hidden = !SITE.mbway;
  $('#pt-mb').disabled = !ok;
  cap.hidden = ok || !SITE.mbway;
  cap.textContent = t('cl.mbmax', money(SITE.mbwayMax || 0));
  setTab(ok ? payTab : 'tr');
}

// Transferência | MB WAY: one panel whose rows follow the tab (IBAN or the MB WAY number, then amount and code)
function setTab(tab, { focus = false } = {}) {
  payTab = tab;
  for (const b of $$('#pay-tabs [role="tab"]')) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  }
  const panel = $('#pay-panel'), mb = tab === 'mb';
  panel.setAttribute('aria-labelledby', mb ? 'pt-mb' : 'pt-tr');
  $$('[data-for]', panel).forEach((el) => { el.hidden = el.dataset.for !== tab; });
  // the KONA code is the transfer's «descritivo» and MB WAY's «descrição»
  $('#pay-ref-k').textContent = t(mb ? 'pay.desc' : 'pay.ref');
  const cp = $('#pay-ref-cp');
  cp.dataset.toast = mb ? 'toast.desc' : 'toast.ref';
  cp.setAttribute('aria-label', t(mb ? 'a.cpdesc' : 'a.cpref'));
}

// the brand is the one thing a request cannot go without
function brandErr(on) {
  const er = $('#cl-brand-err');
  er.hidden = !on; er.textContent = on ? t('cl.err') : '';
  $('#cl-brand').setAttribute('aria-invalid', String(on));
}
function brandOk() {
  const el = $('#cl-brand'), ok = !!el.value.trim();
  brandErr(!ok);
  if (!ok) el.focus();
  return ok;
}

// The transfer description: the spot numbers, so a payment can be matched to its spots at a glance.
// Helmet spots are numbered after the suit (21-24), so one reference covers both: KONA 01 21 22.
function payRef() {
  if (wantTitle) return 'KONA FATO';
  return `KONA ${totals().list.map((s) => s.n).sort((a, b) => a - b).map(pad2).join(' ')}`.trim();
}
function fillPayee() {
  const iban = ibanPretty(SITE.iban || '');
  $$('[data-iban]').forEach((el) => { el.textContent = iban; });
  $$('[data-payee]').forEach((el) => { el.textContent = SITE.payee; });
  $$('[data-copy-iban]').forEach((el) => { el.dataset.copy = (SITE.iban || '').replace(/\s+/g, ''); });
  // 916 395 103 on screen, the 9 digits on the clipboard
  const mb = String(SITE.mbway || '').replace(/\D/g, '');
  $('#pay-mb').textContent = mb.replace(/(\d{3})(?=\d)/g, '$1 ');
  $('#pay-mb-cp').dataset.copy = mb;
  // the same number for a donation in Apoiar (`mbway: ''` hides it there too)
  $('#give-mb-n').textContent = mb.replace(/(\d{3})(?=\d)/g, '$1 ');
  $('#give-mb').dataset.copy = mb;
  $('#give-mb').hidden = !mb; $('#give-or').hidden = !mb;
  $('#cl-mailfb-a').textContent = SITE.email;
  $('#cl-mailfb-cp').dataset.copy = SITE.email;
  $('#cl-wa').href = `https://wa.me/${SITE.whatsapp}`;
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
}

// ---------- tour ----------
// each part has its own tour: it visits that part's free spots only, so the camera never leaves its model
const tourBtn = (it) => $(`.chapters[data-item="${it}"] [data-tour]`);
function startTour(it) {
  withModel(it, (k) => {
    stopTour();
    const ctl = tourCtl = new AbortController();
    const ids = available().filter((s) => itemOf(s) === it).sort((a, b) => b.price - a.price || a.n - b.n).map((s) => s.id);
    const b = tourBtn(it); b?.classList.add('on');
    k.tour(ids, (id) => select(id, { from3d: true }), ctl.signal).finally(() => b?.classList.remove('on'));
  });
}
function stopTour() { if (tourCtl) { tourCtl.abort(); tourCtl = null; $$('[data-tour]').forEach((b) => b.classList.remove('on')); } }
// run fn on the model of part `it`, bringing it on stage first if needed (a tap in a part whose model is not up yet)
function withModel(it, fn) {
  if (kit && item === it) { fn(kit); return; }
  showItem(it).then(() => { if (kit && item === it) fn(kit); });
}

// ---------- logo try-on ----------
async function applyLogo() {
  if (!kit || !selected || !logoFile || itemOf(byId(selected)) !== item) return;
  try {
    const light = kit.rects.get(selected)?.light;
    const canvas = await SuitClass.prepareLogo(logoFile, { removeWhite: $('#logo-bg').checked, mono: $('#logo-inv').checked ? (light ? '#141414' : '#f6f7f9') : null });
    // one try-on at a time: a logo left on the other model goes
    for (const m of models()) if (m !== kit && m.logos.size) { m.logos.clear(); m.drawBase(); m.drawOverlay(); }
    kit.logos.clear();
    kit.setLogo(selected, canvas);
    $('#logo-dl').disabled = false; $('#logo-rm').disabled = false;
  } catch (_) { toast(t('toast.bad')); }
}

async function downloadMockup() {
  if (!kit || !selected) return;
  const s = byId(selected);
  if (itemOf(s) !== item) return;
  const blob = await kit.snapshot({ title: `${pick(s).name} · ${money(s.price)}`, subtitle: t('mock.sub', String(s.n).padStart(2, '0'), sizeOf(s, '×')) });
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // helmet ids already start with "capacete-"
  a.download = `goncalo-carmo-${itemOf(s) === 'helmet' ? '' : 'fato-'}${s.id}-mockup.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- deep links ----------
// #fato/<id> and #capacete/<id> select any spot (select() brings up its model); #capacete opens the helmet, and so
// does a #capacete/ link whose id is empty or unknown (a typo, or a spot renamed since the link was shared).
// Only those helmet links write `want`: the model on stage is always switched by showItem().
// hashLand: the part the link lands in (a package on one model lands in that model's part, a mixed one on the chapter).
function readHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  hashLand = null;
  if (h.startsWith('pacote=')) {
    const ids = h.slice(7).split(',').filter((id) => byId(id)?.status === 'available');
    if (ids.length) { basket = new Set(ids); try { localStorage.setItem(STORE, JSON.stringify(ids)); } catch (_) {} }
    const kinds = new Set(ids.map((id) => itemOf(byId(id))));
    if (kinds.size === 1) hashLand = [...kinds][0];
    history.replaceState(null, '', `${location.pathname}${location.search}#fato`);
  } else if (h === 'fato/title') {
    wantTitle = DATA.title.status === 'available' && titleOpen();
    hashLand = 'suit';
  } else if (/^capacete(\/|$)/.test(h)) {
    const id = h.slice(9);
    if (byId(id)) selected = id; else { selected = null; want = 'helmet'; }
    hashLand = selected ? itemOf(byId(selected)) : 'helmet';
  } else if (/^fato\/./.test(h)) {
    const id = h.slice(h.indexOf('/') + 1);
    if (byId(id)) { selected = id; hashLand = itemOf(byId(id)); } else hashLand = 'suit';
  } else if (h === 'o-fato' || h === 'o-capacete') {
    hashLand = h === 'o-fato' ? 'suit' : 'helmet';
  }
}

// ---------- wiring ----------
function bindSheet() {
  const sheet = $('#spot-card');
  $('#sheet-x').addEventListener('click', () => { select(null); if (kit) kit.home(); });
  let y0 = null, dy = 0;
  sheet.addEventListener('pointerdown', (e) => { if (!mobile() || sheet.scrollTop > 0 || e.target.closest('button, input, label, a')) return; y0 = e.clientY; dy = 0; sheet.classList.add('dragging'); });
  sheet.addEventListener('pointermove', (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sheet.style.setProperty('--drag', `${dy}px`); });
  const end = () => { if (y0 === null) return; sheet.classList.remove('dragging'); y0 = null; if (dy > 90) { select(null); if (kit) kit.home(); } else sheet.style.removeProperty('--drag'); };
  sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
  // on phones the suit's stage shrinks while its long rate card is being read (the helmet's four rows need no room:
  // shrinking its stage would only move its short card in and out of the band, over and over)
  const studio = $('.studio[data-item="suit"]');
  new IntersectionObserver((en) => { studio.classList.toggle('compact', mobile() && en[0].isIntersecting && !studio.classList.contains('no3d')); }, { rootMargin: '-55% 0px -10% 0px' }).observe($('.ratecard[data-item="suit"]'));
  addEventListener('resize', () => { if (!mobile()) { closeSheet(); $$('.studio').forEach((x) => x.classList.remove('compact')); } });
}
function closeSheet() { $('#spot-card').classList.remove('open'); document.body.classList.remove('sheet-open'); }

function bindUI() {
  bindSheet();
  // each stage's controls drive the model of their own part (bound here, before the stage mounts, so an early tap counts)
  const partIt = (el) => el.closest('[data-item]').dataset.item;
  const pickedHere = (it) => selected && itemOf(byId(selected)) === it;
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
    const it = partIt(b);
    stopTour(); interacted = true;
    if (pickedHere(it)) select(null);
    $$('[data-view]', stageOf(it)).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    act(it, 'rotate')?.setAttribute('aria-pressed', 'false');
    withModel(it, (k) => k.view(b.dataset.view));
  }));
  $$('[data-act="rotate"]').forEach((b) => b.addEventListener('click', () => {
    const it = partIt(b), on = !pressed(b);
    b.setAttribute('aria-pressed', String(on));
    if (on) { stopTour(); if (pickedHere(it)) select(null); }
    withModel(it, (k) => k.setAuto(on));
  }));
  $$('[data-act="spots"]').forEach((b) => b.addEventListener('click', () => {
    const it = partIt(b), on = !pressed(b);
    b.setAttribute('aria-pressed', String(on));
    if (!on && pickedHere(it)) select(null);
    withModel(it, (k) => k.setShowSpots(on));
  }));
  $$('[data-act="zoom-in"]').forEach((b) => b.addEventListener('click', () => withModel(partIt(b), (k) => k.zoom(1))));
  $$('[data-act="zoom-out"]').forEach((b) => b.addEventListener('click', () => withModel(partIt(b), (k) => k.zoom(-1))));
  $$('.chapter[data-focus]').forEach((c) => c.addEventListener('click', () => { stopTour(); interacted = true; select(c.dataset.focus); }));
  $$('[data-tour]').forEach((b) => b.addEventListener('click', () => { interacted = true; const on = b.classList.contains('on'); stopTour(); if (!on) startTour(partIt(b)); }));
  $$('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    sortMode = b.dataset.sort;
    $$('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderRateCard();
  }));
  // a real switch: the whole row is the button, Space and Enter toggle it
  $('#only-avail').addEventListener('click', (e) => { onlyAvail = !onlyAvail; e.currentTarget.setAttribute('aria-checked', String(onlyAvail)); renderRateCard(); });
  $('#sd-add').addEventListener('click', () => selected && toggleBasket(selected));
  $('#sd-try').addEventListener('click', () => { $('#tryon').classList.toggle('on'); });
  $('#sd-share').addEventListener('click', async () => {
    const s = byId(selected); if (!s) return;
    const onHelmet = itemOf(s) === 'helmet';
    const url = `${location.origin}${location.pathname}#${onHelmet ? 'capacete' : 'fato'}/${s.id}`;
    if (navigator.share) { try { await navigator.share({ title: t(onHelmet ? 'share.titleH' : 'share.title'), text: `${pick(s).name} · ${money(s.price)}`, url }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    if (await copy(url)) toast(t('toast.link'));
  });
  $('#logo-file').addEventListener('change', (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast(t('toast.big')); e.target.value = ''; return; }
    logoFile = f; applyLogo();
  });
  $('#logo-bg').addEventListener('change', applyLogo);
  $('#logo-inv').addEventListener('change', applyLogo);
  $('#logo-rm').addEventListener('click', () => {
    logoFile = null; $('#logo-file').value = '';
    for (const m of models()) if (m.logos.size) { m.logos.clear(); m.drawBase(); m.drawOverlay(); m.kick(); }
    $('#logo-dl').disabled = true; $('#logo-rm').disabled = true;
  });
  $('#logo-dl').addEventListener('click', downloadMockup);
  $('#tp-btn').addEventListener('click', () => { wantTitle = true; renderPackage(); openClaim(); });
  $('#pk-clear').addEventListener('click', () => { forgetSent(); wantTitle = false; basket.clear(); saveBasket(); });
  $('#pk-go').addEventListener('click', () => openClaim());
  // each send action opens the app as before and moves the dialog on to the payment.
  // WhatsApp is a real link, filled in at the tap. On a phone it opens in this same tab: the app takes over and the page
  // stays underneath on step 2 (a new tab would be what the buyer finds when switching back). On a computer it opens
  // WhatsApp Web in a new tab.
  $('#cl-wa').addEventListener('click', (e) => {
    if (!brandOk()) { e.preventDefault(); return; }
    const a = e.currentTarget;
    a.href = waUrl();
    if (touch()) a.removeAttribute('target'); else a.target = '_blank';
    noteSent(); sentBy = 'wa'; goStep(2);
  });
  // a real mailto: link, filled in at the tap: the browser hands it to the default mail app once the click is done,
  // then the dialog moves on (a step later, so the link is still on screen when the browser follows it)
  $('#cl-mail').addEventListener('click', (e) => {
    if (!brandOk()) { e.preventDefault(); return; }
    e.currentTarget.href = mailUrl();
    noteSent(); sentBy = 'mail'; setTimeout(() => goStep(2), 0);
  });
  $('#cl-ig').addEventListener('click', async () => {
    if (!brandOk()) return;
    noteSent(); sentBy = 'ig';
    const ok = await copy(message());
    if (ok) toast(t('toast.copied'));
    window.open(`https://ig.me/m/${SITE.instagram}`, '_blank', 'noopener');
    goStep(2);
  });
  $('#cl-brand').addEventListener('input', (e) => { if (e.target.value.trim()) brandErr(false); });
  $('#cl-msg').addEventListener('input', mailCutHint);
  $('#cl-add').addEventListener('click', (e) => { e.currentTarget.setAttribute('aria-expanded', 'true'); $('#cl-extra').hidden = false; e.currentTarget.hidden = true; $('#cl-nif').focus(); });
  $('#cl-more').addEventListener('click', () => { const items = $('#cl-items'); items.hidden = !items.hidden; renderClaim(); });
  $('#cl-sent').addEventListener('click', () => { noteSent(); goStep(2); });
  $('#cl-back').addEventListener('click', () => goStep(1));
  // «Feito» ends the request: the package empties and its bar slides away under the thank-you toast (× and Esc keep it).
  // The bar's «Reservar» goes with it, so focus moves on to the rate card heading.
  $('#cl-done').addEventListener('click', () => {
    forgetSent();
    wantTitle = false; basket.clear(); saveBasket();
    $('#claim').close();
    if (document.activeElement?.closest('#package')) { const h = $(`.ratecard[data-item="${midPart() || 'suit'}"] h4`); h.tabIndex = -1; h.focus({ preventScroll: true }); }
    toast(t('toast.thanks'));
  });
  $$('#pay-tabs [role="tab"]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  // arrow keys move along the tabs (the MB WAY tab is skipped while it is off)
  $('#pay-tabs').addEventListener('keydown', (e) => {
    const tabs = $$('#pay-tabs [role="tab"]').filter((b) => !b.disabled), i = tabs.indexOf(document.activeElement);
    const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (i < 0 || j === undefined) return;
    e.preventDefault();
    setTab(tabs[(j + tabs.length) % tabs.length].dataset.tab, { focus: true });
  });
  fillPayee();
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b || !b.dataset.copy) return;
    if (!(await copy(b.dataset.copy))) return;
    toast(t(b.dataset.toast || 'toast.copy'));
    b.classList.add('ok'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('ok'), 1600);
  });
  $('#claim').addEventListener('close', () => { wantTitle = false; renderPackage(); for (const m of models()) m.hold(false); });
  $('#claim .close').addEventListener('click', () => $('#claim').close());
  $('#claim-form').addEventListener('submit', (e) => e.preventDefault());
  // Enter (the keyboard's «next» / «done») moves on to the next field, and leaves the last one
  $('#claim-form').addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
    e.preventDefault();
    const fields = $$('#cl-s1 input, #cl-s1 textarea').filter((x) => x.offsetParent), next = fields[fields.indexOf(e.target) + 1];
    if (next) next.focus(); else e.target.blur();
  });
  // keyboard: arrows step through the spots of the part on screen in price order, Esc clears
  document.addEventListener('keydown', (e) => {
    if (!selected || /input|textarea|select/i.test(document.activeElement?.tagName || '') || $('#claim').open) return;
    if (document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('.part')) return;
    // the selected spot's part, and only while it is the one on screen (not `item`: while the helmet builds, the suit
    // is still on stage)
    const it = itemOf(byId(selected));
    if (it !== midPart()) return;
    const order = ofItem(it).sort((a, b) => b.price - a.price || a.n - b.n);
    const i = order.findIndex((s) => s.id === selected);
    if (e.key === 'ArrowRight') { e.preventDefault(); select(order[(i + 1) % order.length].id); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); select(order[(i - 1 + order.length) % order.length].id); }
    else if (e.key === 'Escape') { select(null); kit && kit.home(); }
  });
  window.addEventListener('hashchange', () => {
    const was = selected;
    readHash(); renderPackage();
    for (const m of models()) m.setBasket([...basket]);
    if (selected || selected !== was || want !== item) select(selected);
    if (hashLand && hashLand !== midPart()) land(hashLand);
  });
}

export const adspaceReduce = reduce;
