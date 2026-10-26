// Sponsor platform: rate cards, spot card, package, claim flow, logo try-on and the 3D stages.
// Chapter 05 has two parts, the suit (#o-fato) and the helmet (#o-capacete), each with its own stage, view buttons and rate
// card. One renderer serves both: its canvas moves into the stage of the part on screen and that part's model becomes
// active. The helmet (helmet.js) is built the first time its part comes near the screen.
import { t, pick, money, numFmt, onLang, getLang, fmtDay } from './i18n.js';
import { SITE } from './data.js';
import { flowSet } from './flow.js';
import { D, GLFail, fail, mark, note, setNo3d, glSupport, msgKey, fixable, release, startProfile, rememberLite, rememberHp, hp, setUp, LITE, isIOS, inApp, appName } from './gl3d.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const AREAS = ['front', 'sides', 'shoulders', 'legs', 'back'];
const ITEMS = ['suit', 'helmet'];
const STORE = 'gc.package.2027';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => matchMedia('(max-width: 760px)').matches;
// a short window wide enough for two columns (a phone held sideways): the stage beside the panel, as on a computer
const sideBySide = () => matchMedia('(max-height: 500px) and (min-width: 600px)').matches;
// an upright phone: each part's stage sits over its rate card
const stacked = () => mobile() && !sideBySide();
// a phone or tablet: links to WhatsApp stay in the tab (the app takes over), and mailto: always finds a mail app
const touch = () => matchMedia('(pointer: coarse)').matches;

let DATA = null, SPOTS = [], suit = null, helmet = null, kit = null, SuitClass = null, helmetBuild = null;
// item: the model on stage now. want: the model asked for last (set at once, before any await).
// onScreen: the part crossing the middle of the screen. landing: the part a deep link or a pick is scrolling to.
let item = 'suit', want = 'suit', onScreen = null, landing = null, hashLand = null, nearHelmet = false, booted = false, scrollToEl = null, nudgeBy = null;
let selected = null, basket = new Set(), sortMode = 'area', onlyAvail = false, wantTitle = false;
let tourCtl = null, tourIt = null, logoFile = null, interacted = false;
// the 3D view's GL state (gl3d.js): the profile in use, the renderer watched, a suit still being built, a pending loss,
// the rebuilds used in this page view; lastFail and helmetFail are the reasons kept for «Tentar outra vez»
let profile = null, current = null, pending = null, glBack = null, rebuilds = 0, rebuildTimer = 0, lostAt = 0, visSince = performance.now();
let lastFail = null, helmetFail = null, onReady = null;

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
const navH = () => $('#nav')?.offsetHeight || 64;
// how many pixels of an element are on screen, under the nav (0 when it is wholly off screen)
const shownPx = (el) => { if (!el) return 0; const r = el.getBoundingClientRect(); return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, navH())); };
const tierOf = (s) => DATA.tiers.find((x) => s.price >= x.min) || DATA.tiers[DATA.tiers.length - 1];
const available = () => SPOTS.filter((s) => s.status === 'available');
const pad2 = (n) => String(n).padStart(2, '0');
// spot size in the page's language: '26 × 8 cm', '5,5 × 3,5 cm' (PT) or '5.5 × 3.5 cm' (EN)
const cmOf = (x) => (Number.isInteger(x) ? String(x) : numFmt(x, 1));
const sizeOf = (s, sep = ' × ') => `${cmOf(s.w)}${sep}${cmOf(s.h)} cm`;
// a reservation lapses on its own once its `until` day is over, so a stale hold never blocks a sale
const lapsed = (x) => x.status === 'reserved' && x.until && Date.parse(`${x.until}T23:59:59Z`) < Date.now();
const ibanPretty = (s) => s.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
// one brand however it is typed (case and spaces), as the Worker compares them
const sameBrand = (a, b) => String(a || '').toLowerCase().replace(/\s+/g, ' ').trim() === String(b || '').toLowerCase().replace(/\s+/g, ' ').trim();
// while the booking dialog is open the toast sits just under its sticky header, clear of «Feito» and «Voltar» below
const toast = (msg) => { const el = $('#toast'); const dlg = $('#claim'); const host = dlg && dlg.open ? $('.dlg-head', dlg) : document.body; if (el.parentElement !== host) host.appendChild(el); el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3200); };

export async function initAdspace({ onSuitReady, scrollTo = null, nudge = null } = {}) {
  scrollToEl = scrollTo; nudgeBy = nudge || ((dy) => scrollBy(0, dy));
  onReady = onSuitReady || null;
  wire3d();
  try {
    const res = await fetch('data/spots.json', { cache: 'no-cache' });
    DATA = await res.json();
  } catch (e) {
    $('#rc-body').textContent = 'Não consegui carregar a tabela. Escreve-me para allez@gocarmo.com.';
    // no spots, no 3D: both stages keep their pictures, and «Tentar outra vez» loads the page again
    lastFail = fail('data', 'spots.json', e); setNo3d(lastFail);
    for (const it of ITEMS) stageStill(it, msgKey(lastFail), 'data');
    return;
  }
  overlayOwn(DATA);
  normalize(DATA);
  SPOTS = DATA.spots.filter((s) => ['available', 'reserved', 'sold'].includes(s.status));
  // the draft first: its brand tells a hold of this tab's unanswered request (see pruneBasket)
  restoreDraft();
  // a spot this tab's own request holds stays in the package (its payment is still to come)
  try {
    const ids = JSON.parse(localStorage.getItem(STORE) || '[]'), mine = maybeOwnFor([...ids].sort().join(','));
    basket = new Set(ids.filter((id) => { const s = byId(id); return !!s && (s.status === 'available' || ownHold(s) || mine(s)); }));
  } catch (_) {}
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
  const io = new IntersectionObserver((en) => {
    if (!en.some((e) => e.isIntersecting)) return;
    io.disconnect();
    mark('io');
    mountSuit();   // calls onSuitReady once the suit is up (again after «Tentar outra vez»)
  }, { rootMargin: '600px 0px' });
  [$('.entry'), ...ITEMS.map(stageOf)].forEach((el) => el && io.observe(el));
  // the helmet is built once its part comes near, so it is usually ready by the time it is on screen
  const near = new IntersectionObserver((en) => {
    if (!en[0].isIntersecting) return;
    near.disconnect(); nearHelmet = true;
    if (suit) ensureHelmet();
  }, { rootMargin: '400px 0px' });
  near.observe(stageOf('helmet'));
  // The part on screen is the one crossing the middle of the viewport; the stage follows it. Read from the layout on every
  // scroll (an IntersectionObserver reports a frame late and can skip a state when the page jumps twice in one frame).
  // A tour belongs to its part: it stops as soon as that part is no longer the one in the middle of the screen.
  // A model brought up by a control of the other part (whose stage was on screen then) keeps the stage until its own
  // stage has left the screen, then the stage goes back to the part being read.
  const check = () => {
    const it = midPart();
    if (tourCtl && it !== tourIt) stopTour();
    if (!it) return;
    if (it !== onScreen) { onScreen = it; partShown(it); }
    else if (!landing && it !== want && !shownPx(stageOf(want))) follow(it);
  };
  addEventListener('scroll', check, { passive: true });
  addEventListener('resize', check);
  check();
  booted = true;
}

// data/spots.json as the page shows it: a lapsed hold is free again, and the whole suit, held or sold, closes every
// suit spot (held: until the same day; sold: under the title partner's name, with its logo on the chest)
function normalize(D) {
  for (const x of [...D.spots, D.title]) if (lapsed(x)) x.status = 'available';
  if (D.title.status === 'reserved') for (const s of D.spots) if (itemOf(s) === 'suit' && s.status === 'available') Object.assign(s, { status: 'reserved', until: D.title.until });
  if (D.title.status === 'sold') {
    for (const s of D.spots) if (itemOf(s) === 'suit' && s.status !== 'sold') Object.assign(s, { status: 'sold', brand: D.title.brand, url: D.title.url });
    const top = D.spots.find((s) => s.top);
    if (top && D.title.logo && !top.logo) Object.assign(top, { logo: D.title.logo, logoMono: D.title.logoMono });
  }
}

// The file again, past every cache (a query GitHub Pages' CDN has never seen, and no-store for the browser): the
// booking dialog reads it each time it opens and after a «taken» answer, so a spot another brand has just held never
// shows free for long. Only who holds what comes in (status, brand, dates, logos), never prices or places.
const LIVE_KEYS = ['status', 'until', 'brand', 'url', 'logo', 'logoMono', 'request'];
let readAt = Date.now();
async function refreshSpots() {
  let fresh;
  readAt = Date.now();
  try {
    const res = await fetch(`data/spots.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return;
    fresh = await res.json();
  } catch (_) { return; }
  if (!DATA || !fresh || !Array.isArray(fresh.spots) || !fresh.title || typeof fresh.title !== 'object') return;
  const soldBefore = new Set(SPOTS.filter((s) => s.status === 'sold' && s.logo).map((s) => `${s.id} ${s.logo}`));
  const take = (to, from) => { for (const k of LIVE_KEYS) { if (from[k] === undefined) delete to[k]; else to[k] = from[k]; } };
  take(DATA.title, fresh.title);
  for (const s of DATA.spots) { const f = fresh.spots.find((x) => x && x.id === s.id); if (f) take(s, f); }
  // what the Worker answered was taken («ocupado») stays taken over a file GitHub Pages has not republished yet
  for (const [id, at] of takenAt) {
    if (Date.now() - at > OWN_FRESH) { takenAt.delete(id); continue; }
    const x = DATA.spots.find((s) => s.id === id);
    if (x && (x.status || 'available') === 'available') x.status = 'reserved';
  }
  overlayOwn(DATA);
  normalize(DATA);
  const lost = pruneBasket();
  refreshViews();
  if (SuitClass && SPOTS.some((s) => s.status === 'sold' && s.logo && !soldBefore.has(`${s.id} ${s.logo}`))) for (const m of models()) printSponsors(m);
  if ($('#claim').open) { goneNote(lost); renderClaim(); }
  else if (lost.gone.length) toast(t('rq.ocupado', joinList(lost.gone.map(qName)), lost.gone.length));
  else if (lost.mine.length || lost.titleMine) toast(boughtText(lost));
}
// everything on the page that shows who holds what
function refreshViews() {
  renderStats(); renderRateCard(); renderCard(); renderOnSuit(); renderPackage();
  for (const m of models()) { m.drawOverlay(); m.kick(); }
  placeCallout();
}
// spots of the package taken since it was put together (not by this tab's own request) leave it, and so does the whole
// suit once it is no longer free. Two cases are not «another brand»: a hold of this brand while this package's request
// is still unanswered (the page stopped waiting, the Worker may well have held it: it stays), and a spot this tab's
// request held that Gonçalo has since sold to the same brand (it leaves the package as bought: mine, titleMine)
function pruneBasket() {
  const maybeOwn = maybeOwnFor(pkKey());
  const bought = (s) => s.status === 'sold' && Object.values(reqs()).some((r) => r && (r.ids || []).includes(s.id) && sameBrand(r.brand, s.brand));
  const out = [...basket].map(byId).filter((s) => s && s.status !== 'available' && !ownHold(s) && !maybeOwn(s));
  const mine = out.filter(bought), gone = out.filter((s) => !bought(s));
  for (const s of out) basket.delete(s.id);
  let title = false, titleMine = false;
  if (wantTitle && !heldReq('title') && !maybeOwn(DATA.title) && !(DATA.title.status === 'available' && titleOpen())) {
    wantTitle = false;
    const r = reqs().title;
    if (DATA.title.status === 'sold' && r && r.title && sameBrand(r.brand, DATA.title.brand)) titleMine = true; else title = true;
  }
  if (out.length) saveBasket();
  else if (title || titleMine) renderPackage();
  return { gone, title, mine, titleMine };
}

// the stages' own events, once: interaction, frames (and their errors), «Tentar outra vez»; and the ?debug3d state
function wire3d() {
  for (const st of $$('.stage')) {
    st.addEventListener('suit:interact', () => { interacted = true; stopTour(); act(st.dataset.item, 'rotate')?.setAttribute('aria-pressed', 'false'); });
    st.addEventListener('suit:frame', () => { frameErrs = 0; if (kit) { kit._drawn = true; mark(st.dataset.item === 'helmet' ? 'helmet-first-frame' : 'first-frame'); } placeCallout(); });
    st.addEventListener('suit:error', (e) => onFrameError(e.detail));
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-act="retry3d"]')) retry3d(); else { const a = e.target.closest('[data-act="open-safari"]'); if (a) openSafari(a); } });
  // the still's line and buttons, also when the page stopped before the rate card (spots.json did not load)
  onLang(() => { for (const el of $$('.stage-fallback [data-i18n], #stage-loading [data-i18n]')) el.textContent = t(el.dataset.i18n, ...(el.dataset.i18nArgs ? JSON.parse(el.dataset.i18nArgs) : [])); });
  D.state = () => ({
    item, want, profile: profile && profile.name, rebuilds, ctx: current ? (isLost(current) ? 'LOST' : 'ok') : 'none',
    lostMs: glBack ? Math.round(performance.now() - lostAt) : 0, pr: current ? current.getPixelRatio() : null,
    buffer: current ? `${current.domElement.width}x${current.domElement.height}` : null, atlas: suit ? suit.base.width : null,
    mesh: suit ? `${suit.meshWhere} ${suit.buildMs}ms` : null,
    gpu: current ? { programs: (current.info.programs || []).length, textures: current.info.memory.textures, geometries: current.info.memory.geometries } : null,
    helmet: helmet ? (helmet.profile || {}).name : helmetFail ? `failed ${helmetFail.code}` : helmetBuild ? 'building' : 'none',
    no3d: document.documentElement.dataset.no3d || null,
  });
}
function kitLabels() { return { sold: t('lbl.sold'), reserved: t('lbl.reserved'), top: t('lbl.top') }; }
const onModelSelect = (id) => { stopTour(); select(id, { from3d: true }); };
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const isLost = (r) => { try { return r.getContext().isContextLost(); } catch (_) { return true; } };
// the page in the background: iOS takes its GPU away there, so a failure then says nothing about the device
let hiddenAt = -1;
const untilVisible = () => new Promise((res) => { if (!document.hidden) { res(); return; } const f = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', f); res(); } }; document.addEventListener('visibilitychange', f); });
// every model drawn with the current renderer, the suit even while it is still being built
const glModels = () => [...new Set([suit || pending, helmet].filter(Boolean))];

// The studio's own modules are fetched first, with retries, and the import then reads them from the HTTP cache: a
// browser keeps a module that failed to load failed until the page reloads, so one request dropped on mobile data
// would otherwise cost the 3D for the whole visit.
const own = (p) => (import.meta.resolve ? import.meta.resolve(p) : new URL(p, import.meta.url).href);
const SUIT_DEPS = ['./suit-body.js', './room.js', '../vendor/three@0.170.0/build/three.module.min.js'];
async function fetchRetry(url, tries = 3) {
  for (let i = 1; ; i++) {
    try { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); await r.arrayBuffer(); return; } catch (e) { if (i >= tries) throw e; await sleep(700 * i); }
  }
}
// An import that fails although every file came in is a module that does not parse or run here ('module'), not the network.
async function importStudio(path, deps = []) {
  let fetched = true;
  try { await Promise.all([path, ...deps].map((p) => fetchRetry(own(p)))); } catch (e) { fetched = false; note('prefetch-failed', { msg: String(e.message || e).slice(0, 120) }); }
  try { return await import(path); } catch (e) { throw new GLFail(fetched ? 'module' : 'import', path, e); }
}

// Build the suit with profile p (gl3d.js). If that throws, once more in lite, then the still picture with the reason.
async function mountSuit(p = startProfile(), again = false) {
  profile = p; D.profile = p.name; mark(`mount-${p.name}`);
  let s = null, mod = null;
  const t0 = performance.now();
  try {
    const why = glSupport();
    if (why) throw new GLFail(why, 'probe');
    mod = await importStudio('./suit.js', SUIT_DEPS);
    mark('suit-import');
    SuitClass = mod.Suit; mod.Kit.useProfile(p); mod.Kit.made = null;
    // the helmet part is the one on screen (or a helmet deep link): the suit is built idle, so it never flashes up first
    const idle = want === 'helmet';
    try { s = new mod.Suit(stageOf('suit'), { spots: ofItem('suit'), money, labels: kitLabels(), onSelect: onModelSelect, onHover: () => {}, active: !idle }); } catch (e) { throw e instanceof GLFail ? e : new GLFail('build', 'suit-ctor', e); }
    // watched from now on: a context lost while the body is meshed is seen, and restored or rebuilt
    pending = s; guard(s.renderer); mark('renderer'); setUp(true);
    // the body is meshed in a worker: the stage keeps its loading label until the suit is ready
    try { await s.ready; } catch (e) { throw new GLFail('mesh', 'suit-ready', e); }
    if (pending !== s) return;   // torn down meanwhile
    mark('ready');
    const first = want === 'helmet';   // read again: the visitor may have scrolled to the other part meanwhile
    if (idle && !first) s.setActive(true);
    suit = kit = s; pending = null;
    item = 'suit';
    suit.setBasket([...basket]);
    // the booking dialog can be up before the stage is (a reload that brings the payment back): hold still behind it
    if ($('#claim').open) suit.hold(true);
    printSponsors(suit);
    if (buyerLogo) previewOnModels();
    $('#stage-loading')?.remove();
    if (p === LITE) rememberLite(true); else if (p.name.endsWith('-hp')) rememberHp(true);
    note('mounted', { profile: p.name, mesh: s.meshWhere, ms: s.buildMs });
    if (!first) liveIn('suit');
    else {
      try { await showItem('helmet'); } catch (e) { fail('build', 'show-helmet', e); }
      // the helmet could not be built, or the suit part came back on screen while it was: the suit takes the stage
      if (item !== 'helmet' && kit) { suit.setActive(true); liveIn('suit'); }
    }
    showLost();
    if (kit && selected && itemOf(byId(selected)) === item) kit.select(selected, { focus: true });
    if (onReady && suit) { try { onReady(suit); } catch (e) { console.error(e); } }
    if (nearHelmet && suit) ensureHelmet();
  } catch (e0) {
    const r0 = s ? s.renderer : mod && mod.Kit.made, lost = !!r0 && isLost(r0);
    let code = e0 instanceof GLFail ? e0.code : 'build';
    if (lost && ['build', 'mesh', 'canvas2d'].includes(code)) code = 'lost-build';
    const rec = fail(code, (e0 && e0.where) || 'mount', (e0 && e0.cause) || e0);
    if (pending === s) pending = null;
    if (s && suit === s) suit = kit = null;
    if (s) { previewed.delete(s); try { s.setActive(false); s.destroy(); } catch (_) {} }
    if (r0) { if (r0 === current) current = null; if (lost) comeBack(r0); release(r0); }
    if (!glModels().length) { settle(); setUp(false); }
    const retryable = !['nowebgl', 'nowebgl2', 'import', 'module'].includes(code);
    // it failed while the page was in the background: the same again once it is back in view
    if (retryable && !again && (document.hidden || hiddenAt > t0)) {
      note('retry-visible', { after: code });
      await untilVisible(); await sleep(500);
      return mountSuit(p, true);
    }
    // a GPU process that hangs on context creation (WebKit bug 303827, ~15 s on iOS 26.1): one stall is enough, not three
    const lastCtx = D.ctx[D.ctx.length - 1];
    if ((code === 'ctx-dead' || code === 'ctx-create') && lastCtx && lastCtx.ms > 3000) { note('ctx-slow', { ms: lastCtx.ms }); $('#stage-loading')?.remove(); no3d(rec); return; }
    // no context, or one born lost: the same look on the other GPU display first
    if ((code === 'ctx-dead' || code === 'ctx-create') && p !== LITE && p.power !== 'high-performance') {
      note('retry-hp', { after: code });
      return mountSuit(hp(p), again);
    }
    // lite: smaller atlases, simpler materials, another GPU path. Not when WebGL 2 is missing or a module did not load.
    if (p !== LITE && retryable) {
      if (code === 'ctx-dead' || code === 'lost-build') await sleep(1000);   // give the GPU process a moment first
      note('retry-lite', { after: code });
      return mountSuit(LITE);
    }
    $('#stage-loading')?.remove();
    no3d(rec);
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
  showLost();
}
function freeze(m) {
  const st = m && m.canvas.parentElement;
  if (!st || !st.classList.contains('stage') || !m._drawn) return;
  // a lost context has nothing to copy: the stage it leaves keeps the picture of its model instead of a blank frame
  if (glBack || m.lost()) { st.classList.remove('frozen'); return; }
  let fz = $(':scope > .stage-freeze', st);
  if (!fz) { fz = document.createElement('canvas'); fz.className = 'stage-freeze'; fz.setAttribute('aria-hidden', 'true'); st.prepend(fz); }
  try {
    // the drawing buffer is not preserved: draw the frame again and copy it in this same task
    m.renderer.render(m.scene, m.camera);
    fz.width = m.canvas.width; fz.height = m.canvas.height;
    fz.getContext('2d').drawImage(m.canvas, 0, 0);
    st.classList.add('frozen');
  } catch (_) { st.classList.remove('frozen'); }
}

// Phones drop the GL context of a tab under memory pressure, often while it sits in the background (the booking
// flow itself sends people out to WhatsApp or Mail), and iOS does not always give it back. three.js keeps the scenes
// and rebuilds its GL state when the context comes back, so the stage waits under a label. If it has not come back
// after 1.5 s of the page being in view (time in the background does not count), a fresh canvas and context take
// over and both models move onto it, with their selection, basket, part and camera as they were. Twice per page view
// at most (the second time lighter); after that the rate card carries the sale, with «Tentar outra vez».
const REBUILD_AFTER = 1500, MAX_REBUILDS = 2;
function guard(r) {
  current = r;
  const c = r.domElement;
  c.addEventListener('webglcontextlost', () => { if (r === current) onLost('event'); });
  c.addEventListener('webglcontextrestored', () => { if (r === current) onRestored(); });
  if (isLost(r)) onLost('attach');
}
function onLost(how) {
  if (glBack) return;
  lostAt = performance.now(); note('lost', { how, rebuilds });
  let done = null;
  glBack = new Promise((res) => { done = res; }); glBack.done = done;   // ensureHelmet waits on it
  glBack.label = setTimeout(showLost, 400);   // a loss given back at once stays invisible
  arm();
}
// the label sits in the stage on screen, and moves with the canvas; that stage shows its model's picture under the
// label instead of a blank canvas (style.css, .stage.gl-lost)
function showLost() {
  if (!glBack || $('#stage-loading')) return;   // the loading label already says it is on its way
  let lbl = $('#gl-lost');
  if (!lbl) {
    lbl = document.createElement('div'); lbl.className = 'loading'; lbl.id = 'gl-lost';
    const sp = document.createElement('span'); sp.textContent = t('stage.lost'); lbl.appendChild(sp);
  }
  const st = stageOf(item);
  if (lbl.parentElement !== st) st.appendChild(lbl);
  for (const x of ITEMS) markLost(stageOf(x), stageOf(x) === st);
}
const markLost = (st, on) => st.classList.toggle('gl-lost', on);
// counts visible time only: a page in the background is never rebuilt (or given up on), and a timer that fires far
// too late has slept through a suspension (a locked screen, an app switch with no visibilitychange): it starts again
function arm() {
  clearTimeout(rebuildTimer);
  if (!glBack || document.hidden) return;
  const need = REBUILD_AFTER * (rebuilds + 1), left = Math.max(0, need - (performance.now() - Math.max(visSince, lostAt))), due = performance.now() + left;
  rebuildTimer = setTimeout(() => {
    if (!glBack) return;
    if (performance.now() - due > 1000) visSince = performance.now();
    if (document.hidden || performance.now() - Math.max(visSince, lostAt) < need - 20) { arm(); return; }
    rebuild('lost');
  }, left);
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) visSince = performance.now(); else hiddenAt = performance.now(); note('vis'); arm(); });
addEventListener('pageshow', (e) => { visSince = performance.now(); note('pageshow', { persisted: e.persisted }); arm(); for (const m of models()) m.kick(); });
addEventListener('pagehide', (e) => note('pagehide', { persisted: e.persisted }));
function onRestored() {
  clearTimeout(rebuildTimer);
  note('restored', { afterMs: Math.round(performance.now() - lostAt) });
  for (const m of glModels()) { try { m.restoreGL(); } catch (e) { fail('build', 'restore', e); rebuild('lost'); return; } }
  settle();
  readyAgain();
}
// a fresh canvas and context for every model, in one task
function rebuild(why) {
  clearTimeout(rebuildTimer);
  const ms = glModels();
  if (!ms.length || !SuitClass) return;
  // never on a page in the background (iOS hands out no GPU there): the watch takes over once it is back in view
  if (document.hidden) { if (!glBack) onLost(why); return; }
  if (rebuilds >= MAX_REBUILDS) { no3d(fail(why, 'context', `${why === 'lost' ? 'not restored' : 'frames failing'} after ${rebuilds} rebuilds`)); return; }
  rebuilds++;
  // the second one: no MSAA, a lower pixel ratio and the other GPU path (iOS keys a dead display by power preference)
  const p = rebuilds === MAX_REBUILDS ? { ...profile, pr: Math.min(profile.pr, 1.5), antialias: false, power: 'high-performance' } : profile;
  let r;
  try { r = SuitClass.makeRenderer(p); } catch (e) { fail(e.code || 'ctx-create', 'rebuild', e.cause || e); arm(); return; }
  const old = current;
  // whatever a model throws here (the new context lost while the room renders), the old context is released and the
  // new one watched: guard() sees it lost and arms the next rebuild, or its restore brings it back
  for (const m of ms) { try { m.rebind(r); } catch (e) { fail('build', 'rebind', e); } }
  if (old) release(old);
  note('rebuilt', { n: rebuilds, pr: p.pr, aa: p.antialias, power: p.power });
  settle();
  guard(r);
  if (kit) { liveIn(item); kit.kick(); }
  readyAgain();
}
function settle() { $('#gl-lost')?.remove(); $$('.stage.gl-lost').forEach((st) => markLost(st, false)); clearTimeout(rebuildTimer); const g = glBack; glBack = null; if (g) { clearTimeout(g.label); g.done(); } }
// the helmet's programs on the context that is back (or new), before it next takes the stage
function readyAgain() {
  const h = helmet;
  if (h && !h.active && helmetBuild) helmetBuild.then((ok) => { if (ok && h === helmet && !glBack) h.ready().catch(() => {}); });
}
// a frame threw: on a lost context that is the loss (its event is a task away); on a live one, try again, and after
// three in a row move to a fresh context
let frameErrs = 0;
function onFrameError(e) {
  if (current && isLost(current)) { onLost('frame'); return; }
  frameErrs++;
  fail('frame', 'loop', e);
  if (frameErrs >= 3) { frameErrs = 0; rebuild('frame'); return; }
  setTimeout(() => { if (kit) kit.kick(); }, 250);
}

// The rate card carries the sale on its own: no WebGL 2 here, or nothing above worked. The reason is kept
// (html[data-no3d], the console, ?debug3d) and the still says it in a line, with «Tentar outra vez».
function no3d(r) {
  lastFail = r || { code: 'build', where: 'unknown', msg: '' };
  setNo3d(lastFail); note('no3d', { code: lastFail.code });
  if (current && isLost(current)) comeBack(current);
  teardown();
  stopTour();
  $('#callout').classList.remove('on');
  // the same reason a second time after «Tentar outra vez»: the line says what to do, a button that cannot help goes
  const key = msgKey(lastFail), again = retrying && retryCode === lastFail.code && key !== 'suit.no3dErr';
  for (const it of ITEMS) stageStill(it, key, lastFail.code, fixable(lastFail) && !again);
  ['#sd-try', '#tryon'].forEach((q) => { const n = $(q); if (n && !n.hidden) { n.hidden = true; n.dataset.no3d = '1'; } });
  // after a tap, the focus goes back to the still that answered it (the button it was on is gone)
  if (retrying && !retryAuto) { const fb = $('.stage-fallback', stageOf(retryIn)); if (fb) { fb.tabIndex = -1; ($('[data-act="retry3d"]', fb) || fb).focus({ preventScroll: true }); } }
}
// A context given up on that the browser gives back later: its GPU works again, so the 3D comes back by itself
// (once per page view, so a GPU that keeps dropping contexts does not loop)
let cameBack = 0;
function comeBack(r) {
  r.domElement.addEventListener('webglcontextrestored', () => {
    if (cameBack || suit || pending || retrying || !lastFail || document.hidden) return;
    cameBack++; note('restored-after-still', { code: lastFail.code });
    retry3d({ auto: true });
  }, { once: true });
}
// every model and the context go, their memory with them
function teardown() {
  for (const m of glModels()) { try { m.setActive(false); m.destroy(); } catch (_) {} }
  if (current) { release(current); current = null; }
  suit = helmet = kit = pending = null; helmetBuild = null; setUp(false);
  previewed.clear();
  settle();
}
// a stage without 3D: the picture of its model stays, with a line that says why, «Tentar outra vez» and the reason
// code (small, for a screenshot); its 3D controls are hidden until the 3D comes back. In an in-app browser on an iPhone
// the line names the app and a second button opens the page in Safari.
function stageStill(it, key, code = '', retry = true) {
  const stage = stageOf(it);
  $$(':scope > canvas, .loading', stage).forEach((n) => { if (n.classList.contains('stage-freeze')) n.width = n.height = 0; n.remove(); });
  stage.classList.remove('live', 'frozen', 'gl-lost');
  if (!$('.stage-fallback', stage)) {
    const fb = document.createElement('div');
    fb.className = 'stage-fallback'; fb.setAttribute('role', 'status');
    const args = key === 'suit.no3dApp' ? [appName(), isIOS() ? 'Safari' : 'Chrome'] : [];
    const sp = document.createElement('span'); sp.dataset.i18n = key; if (args.length) sp.dataset.i18nArgs = JSON.stringify(args); fb.appendChild(sp);
    const acts = document.createElement('div'); acts.className = 'acts';
    if (retry) { const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.dataset.act = 'retry3d'; b.dataset.i18n = 'suit.retry'; b.textContent = t('suit.retry'); acts.appendChild(b); }
    if (inApp() && isIOS()) {
      // iOS 17 and later open an x-safari-https:// link in Safari; openSafari() also copies the address, in case not
      const a = document.createElement('a'); a.className = 'chip'; a.dataset.act = 'open-safari'; a.dataset.i18n = 'suit.openSafari'; a.textContent = t('suit.openSafari');
      a.href = `x-safari-${pageUrl(it)}`; acts.appendChild(a);
    }
    if (acts.childElementCount) fb.appendChild(acts);
    if (code) { const c = document.createElement('small'); c.className = 'code'; c.textContent = code; fb.appendChild(c); }
    stage.appendChild(fb);
    sp.textContent = t(key, ...args);   // set once the live region is in the page, so it is read out
  }
  stage.classList.add('no3d');
  // a still picture does not need to stay on screen while the rate card scrolls
  const studio = stage.closest('.studio'); studio.classList.add('no3d'); studio.classList.remove('compact');
  $$('.stage-ui, .stage-foot', stage).forEach((n) => { n.hidden = true; });
  const ch = $(`.chapters[data-item="${it}"]`); if (ch) ch.hidden = true;
}
function unStill(it) {
  const stage = stageOf(it);
  $('.stage-fallback', stage)?.remove();
  stage.classList.remove('no3d'); stage.closest('.studio').classList.remove('no3d');
  $$('.stage-ui, .stage-foot', stage).forEach((n) => { n.hidden = false; });
  const ch = $(`.chapters[data-item="${it}"]`); if (ch) ch.hidden = false;
}
function loadingIn(it, id, key) {
  if (document.getElementById(id)) return;
  const lbl = document.createElement('div'); lbl.className = 'loading'; lbl.id = id;
  const sp = document.createElement('span'); sp.dataset.i18n = key; sp.textContent = t(key); lbl.appendChild(sp);
  stageOf(it).appendChild(lbl);
}
// «Tentar outra vez»: the whole studio again (rebuild counters reset), or only the helmet if the suit is up. A module
// that did not load stays failed in this page, so that case reloads it (main.js drops the ?fresh= again).
// After a dead GPU display it starts on the other one (high-performance) first.
let retrying = false, retryAuto = false, retryCode = null, retryIn = 'suit';
// this page, without the cache-buster, landing on the part `it` (both are deep links: hashLand)
function pageUrl(it) { const u = new URL(location.href); u.searchParams.delete('fresh'); u.hash = it === 'helmet' ? 'o-capacete' : 'o-fato'; return u.href; }
async function retry3d({ auto = false } = {}) {
  if (retrying) return;
  const f = suit ? helmetFail : lastFail;
  retryIn = midPart() || item;
  if (f && (f.code === 'import' || f.code === 'module' || f.code === 'data')) { const u = new URL(pageUrl(retryIn)); u.searchParams.set('fresh', Date.now()); location.replace(u.href); return; }
  retrying = true; retryAuto = auto; retryCode = f && f.code;
  note('retry', { code: f && f.code, auto });
  // the button about to go had the focus: the stage keeps it, so it does not fall back to the top of the page
  if (!auto) { const st = stageOf(retryIn); st.tabIndex = -1; st.focus({ preventScroll: true }); }
  try {
    if (suit) {
      unStill('helmet'); loadingIn('helmet', 'item-loading', 'helmet.loading');
      helmetBuild = null; helmetFail = null;
      if ((await ensureHelmet()) && midPart() === 'helmet') showItem('helmet');
      return;
    }
    for (const it of ITEMS) unStill(it);
    loadingIn('suit', 'stage-loading', 'suit.loading');
    if (nearHelmet) loadingIn('helmet', 'item-loading', 'helmet.loading');
    lastFail = null; helmetFail = null; setNo3d(null); rebuilds = 0; frameErrs = 0;
    $$('#sd-try, #tryon').forEach((n) => { if (n.dataset.no3d) { n.hidden = false; delete n.dataset.no3d; } });
    want = midPart() || want;
    const p = startProfile();
    await mountSuit(f && (f.code === 'ctx-dead' || f.code === 'ctx-create') ? hp(p) : p);
  } finally { retrying = false; retryAuto = false; }
}
// «Abrir no Safari» in an in-app browser: the link does it on iOS 17 and later; the address is copied as well, and if
// the page is still in front a moment later, a toast says how to open it by hand
function openSafari(a) {
  const url = a.href.replace(/^x-safari-/, '');
  let copied = false;
  try { navigator.clipboard.writeText(url).then(() => { copied = true; }, () => {}); } catch (_) {}
  setTimeout(() => { if (!document.hidden) toast(copied ? t('toast.safari') : t('toast.safariNo', location.host)); }, 1500);
}
// the helmet's atlases did not fit next to the full suit's (a browser short of canvas memory): the studio again, in lite
async function studioLite() {
  note('studio-lite');
  teardown();
  for (const it of ITEMS) stageOf(it).classList.remove('live', 'frozen');
  loadingIn('suit', 'stage-loading', 'suit.loading');
  if (nearHelmet) loadingIn('helmet', 'item-loading', 'helmet.loading');
  want = midPart() || want;
  await mountSuit(LITE);
}

// The helmet, built once on first view, on the suit's renderer (one canvas, one GL context).
// The label «A carregar o capacete» sits in the helmet's stage from the start and goes once the build is over.
// A build that fails with the context lost is built again once it is back; one that fails otherwise, once more in
// lite; then the helmet's part keeps its picture (and «Tentar outra vez»), and the suit is not touched.
function ensureHelmet() {
  helmetBuild ||= buildHelmet(suit);
  return helmetBuild;
}
async function buildHelmet(host) {
  let lite = host.profile === LITE, h = null;
  try {
    mark('helmet-import');
    const { Helmet } = await importStudio('./helmet.js');
    // the build is synchronous: let the label paint first
    await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
    for (let attempt = 1; ; attempt++) {
      while (glBack) await glBack;   // a lost context cannot compile or upload: wait for it to come back (or be rebuilt)
      if (suit !== host) return false;
      try {
        h = helmet = new Helmet(stageOf('helmet'), { spots: ofItem('helmet'), money, labels: kitLabels(), onSelect: onModelSelect, onHover: () => {}, renderer: host.renderer, active: false, profile: lite ? LITE : host.profile });
        h.setBasket([...basket]);
        if ($('#claim').open) h.hold(true);
        await h.prepare();   // the constant part of the bake, in short tasks, before any logo is printed
        if (suit !== host || helmet !== h) return false;
        await printSponsors(h);
        if (buyerLogo) previewOnModels();
        while (glBack) await glBack;
        if (suit !== host || helmet !== h) return false;
        await h.ready();
        mark('helmet-ready');
        return true;
      } catch (e) {
        const lost = isLost(host.renderer), code = lost ? 'lost-build' : (e && e.code) || 'build';
        helmetFail = fail(code, (e && e.where) || 'helmet', (e && e.cause) || e);
        if (helmet === h) helmet = null;
        if (h) { previewed.delete(h); try { h.destroy(); } catch (_) {} h = null; }
        if (suit !== host) return false;
        if (attempt >= 3) throw e;
        if (lost) { if (!glBack && host.renderer === current) onLost('helmet'); continue; }
        if (document.hidden) await untilVisible();   // not judged on a page in the background
        if (!lite) { lite = true; note('helmet-lite', { after: code }); continue; }
        if (code === 'canvas2d' && host.profile !== LITE) { setTimeout(studioLite, 0); return false; }
        throw e;
      }
    }
  } catch (e) {
    if (suit !== host) return false;
    if (!helmetFail) helmetFail = fail((e && e.code) || 'build', (e && e.where) || 'helmet', (e && e.cause) || e);
    helmet = null;
    // the helmet's part keeps its picture and its rate card; only its 3D controls go
    toast(t('toast.helmet')); stageStill('helmet', 'toast.helmet', helmetFail.code);
    return false;
  } finally { if (suit === host) $('#item-loading')?.remove(); }
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
  if (!next) return;
  try { swapTo(it, next); } catch (e) { fail('build', 'switch', e); }
}
function swapTo(it, next) {
  freeze(kit);
  kit.setActive(false);
  kit = next; item = it;
  const co = $('#callout'); co.classList.remove('on'); stageOf(it).appendChild(co);
  // each stage has its own switches (spots, rotate)
  const spotsOn = pressed(act(it, 'spots'));
  kit.setShowSpots(spotsOn);
  kit.setAuto(pressed(act(it, 'rotate')));
  kit.setActive(true);
  liveIn(it);   // a lost context's label and its gl-lost mark go with the canvas (showLost)
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
  if (landing) return;
  follow(it);
}
// the stage goes to part `it` (a phone's spot sheet belongs to the part it was opened in, so a sheet of the other part closes)
function follow(it) {
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
    // the part the page came to rest on takes the stage, whatever was asked for on the way
    const now = midPart();
    if (now) onScreen = now;
    if (now && now !== want) follow(now);
  };
  Promise.resolve(scrollToEl(el, { immediate })).then(done, done);
  setTimeout(done, 2500);   // never stay locked if the scroller does not report back
}
// scroll just enough to bring a part's stage back: from above the screen, down to its place under the nav (a sticky
// stage pushed up at the end of its part comes back with it); a stage still below the screen lands on its part
function bringStage(it) {
  const st = stageOf(it);
  if (!st || !scrollToEl) return;
  const r = st.getBoundingClientRect();
  if (r.top >= innerHeight) { land(it); return; }
  scrollToEl(Math.max(0, scrollY + r.top - navH() - 12));
}
// The spot card changing in a slot above the screen (the visitor is further down, reading a rate card) must not move what
// is on screen. Browsers differ: Chromium holds the content on screen in place by itself (scroll anchoring), Safari does
// not, and the picked row would slide down by the card's height. So the page does it, the same in every browser: while
// the card changes the browser's own anchoring is off, and the page then moves by what the anchor moved. (Not while the
// page is about to land somewhere else anyway, and not on an upright phone, where the card is a sheet over the page.)
function steady(fn, on = true, slots = []) {
  const a = on && !landing && !mobile() ? anchorBelow(slots) : null;
  if (!a) { fn(); return; }
  const root = document.documentElement, was = root.style.overflowAnchor;
  root.style.overflowAnchor = 'none';
  const y0 = a.getBoundingClientRect().top;
  fn();
  const dy = a.getBoundingClientRect().top - y0;
  if (Math.abs(dy) > 0.5) nudgeBy(dy);
  requestAnimationFrame(() => requestAnimationFrame(() => { root.style.overflowAnchor = was; }));
}
// The anchor: what comes after the lowest changing slot that is above the screen, and still reaches the screen: under the
// suit's slot its rate card, or the helmet's part once that rate card has gone by too; under the helmet's slot its rate
// card. A slot that changes on screen needs none: the card grows where the visitor is looking.
function anchorBelow(slots) {
  const top = navH();
  const above = slots.filter((sl) => sl && sl.getBoundingClientRect().bottom <= top);
  if (!above.length) return null;
  const after = above.some((sl) => sl.dataset.item === 'helmet') ? [$('.ratecard[data-item="helmet"]')] : [$('.ratecard[data-item="suit"]'), partOf('helmet')];
  return after.find((el) => el && el.getBoundingClientRect().bottom > top) || null;
}

// Sold spots wear the sponsor's real logo on the 3D model (spots.json → "logo").
// A dark logo on the black shorts is knocked out to white unless "logoMono" says otherwise.
async function printSponsors(m) {
  const sold = m.spots.filter((s) => s.status === 'sold' && s.logo);
  if (!sold.length) return;
  await Promise.all(sold.map(async (s) => {
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), 8000);   // a hung request skips that logo
    try {
      const blob = await (await fetch(s.logo, { signal: ac.signal })).blob();
      let c = await SuitClass.prepareLogo(blob, { removeWhite: true, mono: s.logoMono || null });
      if (!s.logoMono && m.rects.get(s.id)?.light === false && inkOf(c) < 110) c = await SuitClass.prepareLogo(blob, { removeWhite: true, mono: '#f6f7f9' });
      s._logo = c;
    } catch (_) {} finally { clearTimeout(timer); }
  }));
  // a logo that cannot be printed leaves the model without it, never without the model
  try { m.drawBase(); m.drawOverlay(); m.kick(); } catch (e) { fail('build', 'logos', e); }
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
  // inside its own part a helmet row drops the «Capacete, …» its full name carries (spots.json → pt/en.short);
  // «à frente» and «por fora» stay together, so a name that wraps never leaves one short word on a line of its own
  nm.textContent = (pick(s).short || pick(s).name).replace(/ (à|por) (\S+)$/, ' $1\u00a0$2');
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
// A spot on the other model switches the stage first (showItem selects it once that model is up).
// Where the page goes: a pick made in its own part (a row, a chapter, the model) never moves the page while some of
// that part's stage is on screen; with the stage wholly off screen the page moves just enough to bring it back. A spot
// whose whole part is off screen (a control of the other part reached with the keyboard) lands on its part. A tour
// step and a hash change never scroll from here (a hash change lands on its own).
function select(id, { from3d = false, focus = true, scroll = true } = {}) {
  selected = id && byId(id) ? id : null;
  const it = selected ? itemOf(byId(selected)) : want, switching = it !== item;
  // the model on stage lets go of its spot at once: the card already shows the new one, and if the other model
  // cannot be built (helmet.js failed to load) the stage stays neutral instead of highlighting the old spot
  if (switching) { if (kit) kit.select(null); showItem(it); }
  else { want = it; if (kit && !from3d) kit.select(selected, { focus }); }
  const move = !selected || !booted || !scroll ? null : !shownPx(partOf(it)) ? 'land' : !shownPx(stageOf(it)) ? 'stage' : null;
  renderCard({ steadyView: !move });
  if (move === 'land') land(it);
  else if (move === 'stage') bringStage(it);
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
  // for analytics.js (select_content): which spot is on the card now, and whether the tour put it there
  document.dispatchEvent(new CustomEvent('gc:spot', { detail: { id: selected, item: selected ? itemOf(byId(selected)) : null, tour: !!tourCtl } }));
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
    if (s) fillCard(s);
  }, steadyView, [card.closest('.spot-slot'), host]);
}
function fillCard(s) {
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
  // for analytics.js (add_to_cart / remove_from_cart)
  document.dispatchEvent(new CustomEvent('gc:basket', { detail: { id, added: basket.has(id) } }));
}
function saveBasket() {
  try { localStorage.setItem(STORE, JSON.stringify([...basket])); } catch (_) {}
  renderPackage(); renderRateCard(); renderCard();
  for (const m of models()) m.setBasket([...basket]);
  if (buyerLogo || previewed.size) previewOnModels();
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

// one text for WhatsApp, email and Instagram: the spots with their sizes, the total, who is asking, the CARMO code.
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
  // the way the buyer picked in step 1, so Gonçalo knows where to look for the money
  lines.push(t(payNow() === 'mb' ? 'msg.payMb' : 'msg.payTr'));
  // held by the Worker: its number (the admin page finds the request by the «Pedido:» line) and the 48 hours (the whole
  // suit: until the written agreement); not held (the Worker failed), a line that says so; not held because the buyer
  // has another request open, that request's number («Pedido aberto:», which the admin page does not take for this
  // package's own)
  const r = heldReq();
  if (r) lines.push(`${t('msg.req')}: ${r.id}`, t('msg.hold', longDay(r.until), kOf()));
  else if (API && rqMode === 'msg') lines.push(openReq ? `${t('msg.open')}: ${openReq}` : t('msg.nohold'));
  // the terms the request accepts, with their date: the proof of which version the brand took (/condicoes/)
  lines.push(t('msg.terms'));
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
const igUrl = () => `https://ig.me/m/${SITE.instagram}`;

// A sent request is noted for this tab only (sessionStorage, gone when the tab closes): if the phone reloads the page
// while the buyer is in WhatsApp, Mail or the bank app, the payment opens again by itself, on the way to pay the message
// named (SENT_PAY) or the tab picked since (PAY_TAB); a reopen from the bar comes back on them too. «Feito» and «Limpar»
// forget it.
const SENT = 'gc.claim.sent', SENT_PAY = 'gc.claim.pay', PAY_TAB = 'gc.claim.tab', WA_NAV = 'gc.claim.wa';
const NOTES = [SENT, SENT_PAY, PAY_TAB, WA_NAV];
const pkKey = () => (wantTitle ? 'title' : [...basket].sort().join(','));
const noteSent = () => { try { NOTES.forEach((k) => sessionStorage.removeItem(k)); sessionStorage.setItem(SENT, pkKey()); sessionStorage.setItem(SENT_PAY, sentPay); } catch (_) {} };
const forgetSent = () => { try { NOTES.forEach((k) => sessionStorage.removeItem(k)); } catch (_) {} };
function resumeClaim() {
  let sent = null, pay = null, tab = null, waNav = false;
  try { [sent, pay, tab] = [SENT, SENT_PAY, PAY_TAB].map((k) => sessionStorage.getItem(k)); waNav = !!sessionStorage.getItem(WA_NAV); sessionStorage.removeItem(WA_NAV); } catch (_) {}
  if (!sent) return;
  // the whole suit has no basket to come back from, so the note brings the title request back while it is still open
  const was = wantTitle;
  if (sent === 'title' && ((DATA.title.status === 'available' && titleOpen()) || heldReq('title'))) wantTitle = true;
  // a spot sold or dropped since then changes the key, and the old payment details would be wrong: nothing opens
  if (sent !== pkKey() || !(wantTitle || basket.size)) { wantTitle = was; return; }
  renderPackage();
  // waNav: the page itself went to wa.me and came back reloaded, so the WhatsApp app never took the link
  openClaim({ step: 2, pay, tab, waNav });
}

// ---------- booking dialog ----------
// Two steps, one screen each: 1 «Reservar» (what, the brand, how to pay, send the request) and 2 «Pagar» (MB WAY or
// transfer). Every send action opens the app and moves the dialog on to step 2, so the payment waits there when the buyer
// is back. payPick: the way to pay, picked in step 1 and followed by the tabs in step 2 (one value for both). sentPay: the
// way the request that went out named, so a switch after sending can ask the buyer to say so in the conversation.
// waFail: 'no' when WhatsApp did not take over on a phone, 'maybe' on a computer (WhatsApp Web may well have worked).
// igBox: the Instagram box in step 2, 'open' once the message is copied (the link to the conversation), 'copy' when the
// browser refused the clipboard (the message to copy by hand, then the link)
let clStep = 1, payPick = 'mb', sentPay = '', sentBy = '', waFail = '', igBox = '', igText = '';
// MB WAY takes at most SITE.mbwayMax per transfer (2 000 EUR, exactly 2 000 included); above it, transfer only
const mbwayOk = (net) => !!SITE.mbway && net <= (SITE.mbwayMax || Infinity);
const payNow = () => (payPick === 'mb' && mbwayOk(totals().net) ? 'mb' : 'tr');
const isPay = (v) => v === 'mb' || v === 'tr';

function openClaim({ step = 1, pay = null, tab = null, waNav = false } = {}) {
  const dlg = $('#claim');
  // MB WAY first whenever it can take the amount (the quicker way on a phone); nothing is remembered between opens,
  // except once a request went out for this same package (a reload, or the bar's «Reservar» again): the dialog comes back
  // on the way the message named, or on the tab the buyer switched to after sending, so «Já enviei o pedido» still knows
  if (!isPay(pay)) try { if (sessionStorage.getItem(SENT) === pkKey()) [pay, tab] = [SENT_PAY, PAY_TAB].map((k) => sessionStorage.getItem(k)); } catch (_) {}
  payPick = isPay(tab) ? tab : isPay(pay) ? pay : mbwayOk(totals().net) ? 'mb' : 'tr';
  sentPay = isPay(pay) ? pay : '';
  sentBy = waNav ? 'wa' : ''; waFail = waNav ? 'no' : ''; igBox = ''; igText = '';
  stopWa();
  // each opening tries the Worker again; a held package says whether its message went out
  const held = heldReq();
  if (!rqBusy) { rqMode = API ? 'api' : 'msg'; openReq = ''; setNote(null); }
  msgOut = held ? !!held.out : true;
  $('#cl-logo-f').hidden = !API;
  logoErr('');
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
  // what other brands have held since the page loaded
  if (API && !held) refreshSpots();
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
  if (!$('#cl-brand-err').hidden) $('#cl-brand-err').textContent = t(brandErrKey);
  // the request: a package already held from this tab says so; the logo field, its error, what is missing, the note
  const r = heldReq(), k = kOf();
  const h1 = $('#cl-held1');
  h1.hidden = !r;
  // whether its message went out: «enviam outra vez», or «falta enviares-me a mensagem»
  if (r) h1.textContent = t('cl.held1', longDay(r.until), r.id, msgOut);
  // «Já enviei o pedido» goes straight to the payment: with the Worker, only once the package is held (or the dialog is
  // back to sending the message only), never around the hold and the logo
  $('#cl-sent').closest('.cl-foot').hidden = !!API && rqMode === 'api' && !r;
  if (logoErrKey) $('#cl-logo-err').textContent = t(logoErrKey);
  renderLogo(); renderNeed(); renderNote();
  // «Pagar por» MB WAY | Transferência: MB WAY off above its limit, with the reason on one line under it (and no choice
  // at all when there is no MB WAY number)
  const ok = mbwayOk(net), pay = payNow(), max = t('cl.mbmax', money(SITE.mbwayMax || 0)), grp = $('#cl-pay'), why = $('#cl-pay-cap');
  grp.hidden = !SITE.mbway;
  $('#cl-pay-mb').disabled = !ok;
  $('#cl-pay-mb').checked = pay === 'mb';
  $('#cl-pay-tr').checked = pay === 'tr';
  why.hidden = ok; why.textContent = max;
  if (ok) grp.removeAttribute('aria-describedby'); else grp.setAttribute('aria-describedby', 'cl-pay-cap');
  mailCutHint();
  // step 2: held, until when, the request's number and the 48 hours; then, if the app did not open by itself, one tap
  // to send its message
  $('#cl-held').hidden = !r;
  if (r) { $('#cl-held-h').textContent = t('cl.heldH', longDay(r.until, true)); $('#cl-held-id').textContent = r.id; $('#cl-held-p').textContent = t('cl.heldP', k); }
  const go = $('#cl-go'), goBy = r && r.channel === 'email' ? 'mail' : 'wa';
  $('#cl-gobox').hidden = !r || msgOut || r.channel === 'instagram';
  if (go.dataset.by !== goBy) { go.dataset.by = goBy; go.href = goBy === 'mail' ? `mailto:${SITE.email}` : `https://wa.me/${SITE.whatsapp}`; }
  $('#cl-go-ic').setAttribute('href', goBy === 'mail' ? '#i-mail' : '#i-wa');
  $('#cl-go-t').textContent = t(goBy === 'mail' ? 'cl.goMail' : 'cl.goWa');
  // the note under the payment: held (the purchase is confirmed once the money lands, a donation receipt), not held
  // because the Worker failed, or, without the Worker (and for a package sent beside an open request), as before
  const down = !r && !!API && rqMode === 'msg' && !openReq;
  $('#pay-note').hidden = !!r || down;
  $('#pay-note2').hidden = !r && !down;
  $('#pay-note2').textContent = r ? t('cl.payHeld', k) : down ? t('cl.payDown', k) : '';
  // the same amount (the one the Worker held it for) and CARMO code under either tab
  const amt = r && r.total > 0 ? r.total : net;
  $('#pay-amt').textContent = money(amt);
  $('#pay-amt-cp').dataset.copy = String(amt);
  $('#pay-ref').textContent = payRef();
  $('#pay-ref-cp').dataset.copy = payRef();
  // a computer with no mail app does nothing on a mailto: link, so there step 2 offers the address to copy after the
  // email action; a phone always has Mail, and the line would only push «Feito» off the screen
  $('#cl-mailfb').hidden = sentBy !== 'mail' || touch();
  // WhatsApp did not take over: email and Instagram, the same two actions as in step 1, at the top of the payment.
  // A computer back on this tab cannot tell whether WhatsApp Web worked: there it is one quiet row, «Sem WhatsApp?»
  const wafb = $('#cl-wafb'), maybe = waFail === 'maybe';
  wafb.hidden = !(sentBy === 'wa' && waFail);
  wafb.classList.toggle('lite', maybe);
  $('#cl-wafb-q').hidden = maybe; $('#cl-wafb-q2').hidden = !maybe;
  // Instagram: the message is copied (the line says to paste it, then the link to the conversation), or the clipboard was
  // refused (the message to copy by hand, then the same link)
  const ig = sentBy === 'ig' ? igBox : '';
  $('#cl-igfb').hidden = !ig;
  $('#cl-igfb-copy').hidden = ig !== 'copy';
  $('#cl-igfb-txt').hidden = ig !== 'copy';
  $('#cl-igfb-open').hidden = ig !== 'open';
  if (ig === 'copy' && $('#cl-igfb-txt').value !== igText) $('#cl-igfb-txt').value = igText;
  const cap = $('#pay-cap');
  $('#pay-tabs').hidden = !SITE.mbway;
  $('#pt-mb').disabled = !ok;
  cap.hidden = ok || !SITE.mbway;
  cap.textContent = max;
  setTab(pay);
}

// MB WAY | Transferência: one panel whose rows follow the tab (the MB WAY number or IBAN, then amount and code). The tab is
// the step 1 choice, so a switch here is a switch of payPick; after a request went out naming the other way, one line
// under the tabs asks the buyer to say so in the conversation.
function setTab(tab, { focus = false, user = false } = {}) {
  payPick = tab;
  const chg = $('#pay-chg'), line = sentPay && tab !== sentPay ? t('pay.chg') : '';
  // the line shows up under the tabs; a screen reader hears it when the buyer's own switch brings it
  if (user && line && chg.hidden) say(line);
  chg.hidden = !line; chg.textContent = line;
  // a reload after the request went out comes back on this tab
  if (sentPay) try { sessionStorage.setItem(PAY_TAB, tab); } catch (_) {}
  for (const b of $$('#pay-tabs [role="tab"]')) {
    const on = b.dataset.tab === tab;
    b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
  }
  const panel = $('#pay-panel'), mb = tab === 'mb';
  panel.setAttribute('aria-labelledby', mb ? 'pt-mb' : 'pt-tr');
  $$('[data-for]', panel).forEach((el) => { el.hidden = el.dataset.for !== tab; });
  // the CARMO code is the transfer's «descritivo» and MB WAY's «descrição»
  $('#pay-ref-k').textContent = t(mb ? 'pay.desc' : 'pay.ref');
  const cp = $('#pay-ref-cp');
  cp.dataset.toast = mb ? 'toast.desc' : 'toast.ref';
  cp.setAttribute('aria-label', t(mb ? 'a.cpdesc' : 'a.cpref'));
}

// a request goes out (by: 'wa', 'mail', 'ig', or '' for «Já enviei o pedido»): noted for a reload, with the way to pay
// its message named. «Já enviei» sends nothing: after a request that went out here, the way stays the one it named
function sent(by) {
  sentBy = by; if (by || !sentPay) sentPay = payNow(); waFail = ''; igBox = '';
  if (by) { msgOut = true; markOut(); }
  if (by !== 'wa') { stopWa(); waTap = null; }
  noteSent();
}

// Did WhatsApp take over? After a tap on its link the page either loses the screen (the app, or WhatsApp Web in a new
// tab: it goes hidden or loses focus) or, on a phone without the app, loads the wa.me page in this same tab. Step 2 then
// asks «O WhatsApp não abriu?» with email and Instagram when, on a phone, nothing at all happened within 2.5 s or the
// phone comes back from the wa.me page (bfcache, or a reload: WA_NAV). A computer gets the same two actions behind
// «Sem WhatsApp?», back on this tab or 2.5 s on: WhatsApp Web opens in a new tab there (maybe in the background), so
// whether it worked is never known. A phone back from the app sees nothing new, and the line goes again when the app
// only took over after those 2.5 s (a slow phone). Nothing here ever says a message went out.
// waTap: the last tap on the WhatsApp link, and the kind of device then (read at the tap: while the page unloads,
// matchMedia no longer answers, Chrome says «not coarse»)
let waWatch = null, waTap = null;
const WA_WAIT = 2500, WA_LATE = 8000;
function watchWa() {
  stopWa();
  waTap = { at: Date.now(), touch: touch() };
  const w = waWatch = { at: waTap.at, left: false, touch: waTap.touch };
  w.t = setTimeout(() => { if (waWatch === w && !w.left && document.visibilityState === 'visible') waNoApp({ keep: true, maybe: !w.touch }); }, WA_WAIT);
}
function stopWa() { if (waWatch) clearTimeout(waWatch.t); waWatch = null; }
function waSeen(visible) {
  const w = waWatch;
  if (!w) return;
  if (!visible) {
    // gone after the line showed: the app, late, or (much later) any other app the buyer opened, which says nothing
    if (waFail && Date.now() - w.at > WA_LATE) stopWa(); else w.left = true;
    return;
  }
  if (!w.left) return;
  stopWa();
  if (!w.touch) waNoApp({ maybe: true });
  else if (waFail) { waFail = ''; renderClaim(); }
}
// the page itself is leaving soon after the tap: on a phone, that is the wa.me page loading here instead of the app
function waGone() {
  const w = waTap;
  if (!w || !w.touch || sentBy !== 'wa' || Date.now() - w.at > 10000) return;
  stopWa();
  try { sessionStorage.setItem(WA_NAV, '1'); } catch (_) {}
}
function waBack(e) {
  if (!e.persisted) return;
  let nav = false;
  try { nav = !!sessionStorage.getItem(WA_NAV); sessionStorage.removeItem(WA_NAV); } catch (_) {}
  if (nav) waNoApp();
}
// keep: the 2.5 s timer goes on watching, in case the app takes over late. maybe: a computer, which cannot tell
function waNoApp({ keep = false, maybe = false } = {}) {
  if (!keep) stopWa();
  if (sentBy !== 'wa' || !$('#claim').open) { stopWa(); return; }
  const was = waFail;
  waFail = maybe ? 'maybe' : 'no';
  renderClaim();
  if (clStep === 2 && !was) say(shownText($('#cl-wafb-t')));
}
// the words of a line without its hidden parts (the line's two openings, one hidden)
const shownText = (el) => [...el.childNodes].filter((n) => !n.hidden).map((n) => n.textContent).join('').replace(/\s+/g, ' ').trim();
// a polite word for a screen reader when something shows up on its own (the WhatsApp line above)
function say(text) { const el = $('#cl-live'); el.textContent = ''; setTimeout(() => { el.textContent = text; }, 60); }

// the brand is the one thing a request cannot go without
let brandErrKey = 'cl.err';
function brandErr(on, key = 'cl.err') {
  const er = $('#cl-brand-err');
  brandErrKey = key;
  er.hidden = !on; er.textContent = on ? t(key) : '';
  $('#cl-brand').setAttribute('aria-invalid', String(on));
}
// the brand, and with the Worker the logo (not for a package already held: its logo went with the request)
function brandOk() {
  const el = $('#cl-brand'), ok = !!el.value.trim(), noLogo = !!API && !buyerLogo && !heldReq();
  // the email and Instagram actions also sit in step 2 (when WhatsApp did not open): the fields are back in step 1
  if ((!ok || noLogo) && clStep !== 1) goStep(1, { focus: false });
  brandErr(!ok);
  logoErr(noLogo ? 'cl.logoErr' : '');
  if (!ok) el.focus(); else if (noLogo) $('#cl-logo').focus();
  return ok && !noLogo;
}

// The transfer description: the spot numbers, so a payment can be matched to its spots at a glance.
// Helmet spots are numbered after the suit (21-24), so one reference covers both: CARMO 01 21 22. (The code used to
// be KONA: the admin page still reads both.)
function payRef() {
  if (wantTitle) return 'CARMO FATO';
  return `CARMO ${totals().list.map((s) => s.n).sort((a, b) => a - b).map(pad2).join(' ')}`.trim();
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
  appTarget($('#cl-wa'));
  $$('#claim [data-send="mail"]').forEach((a) => { a.href = `mailto:${SITE.email}`; });
  $('#cl-igfb-go').href = igUrl();
  appTarget($('#cl-igfb-go'));
}
// WhatsApp (and the «Abrir o Instagram» link) on a phone open in this same tab, so the universal link hands over to the
// app and the page stays underneath on step 2 (a new tab would be what the buyer finds when switching back); on a
// computer, WhatsApp Web or Instagram in a new tab
function appTarget(a) {
  if (touch()) a.removeAttribute('target'); else a.target = '_blank';
  a.rel = 'noopener';
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {
    // the stand-in goes inside the open dialog: a modal dialog makes the rest of the page inert, where nothing selects.
    // Focus comes back to where it was (a copy button, for a keyboard)
    const dlg = $('#claim'), was = document.activeElement;
    const ta = document.createElement('textarea'); ta.value = text; ta.readOnly = true; ta.style.position = 'fixed'; ta.style.opacity = '0';
    (dlg.open ? dlg : document.body).appendChild(ta); ta.focus({ preventScroll: true }); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); was?.focus?.({ preventScroll: true }); return ok;
  }
}
// the GoFundMe «Partilhar» copies its link and confirms with the same toast
export { toast, copy };

// ---------- the request to the booking Worker (SITE.requestsApi, worker/requests.js) ----------
// With the Worker set, a send action first sends the request (the spots, the brand, the logo as a PNG): the Worker holds
// the spots for 48 hours in data/spots.json and answers with the request's number and last day. The page shows them
// held at once, step 2 says until when and that the proof of payment closes it, and the app picked opens with a
// message that carries «Pedido: <id>». A Worker that cannot be reached (or a 5xx) leaves the dialog as it was before
// the Worker: the same buttons send the message only, and the dialog says the spot is not held yet. Nothing the buyer
// wrote or picked is lost on the way (the draft is kept for this tab, logo included).
// One request per package: its number and last day are kept for this tab (sessionStorage, by package), so a reload,
// a second tap or «Voltar» never sends it again.
const API = String(SITE.requestsApi || '').trim().replace(/\/+$/, '');
const REQS = 'gc.claim.req', PENDING = 'gc.claim.pending', DRAFT = 'gc.claim.draft';
// REQ_TIMEOUT counts from the tap, so it covers the upload of up to 600 KB on a slow phone line and the Worker's commit
const REQ_TIMEOUT = 25000, MAX_ITEMS = 6, OWN_FRESH = 15 * 60e3, DRAFT_KEEP = 6 * 3600e3;
const ID_RE = /^[0-9A-Z]{10}$/, DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const CHANNEL = { wa: 'whatsapp', mail: 'email', ig: 'instagram' };
// rqMode: 'api' sends the request first; 'msg' sends the message only (no Worker, or the Worker failed). rqBusy: a
// request on its way. msgOut: the held request's message has gone out (else step 2 offers to send it). openReq: the
// buyer's other open request («aberto»), named in the message of this package, which goes as a message only.
let rqMode = API ? 'api' : 'msg', rqBusy = false, msgOut = true, clNote = null, logoErrKey = '', openReq = '';
// spot id -> when the Worker said it is taken («ocupado»): it stays taken over the file for OWN_FRESH (refreshSpots)
const takenAt = new Map();

function reqs() { try { const v = JSON.parse(sessionStorage.getItem(REQS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } }
const reqLive = (r) => !!r && ID_RE.test(r.id) && DAY_RE.test(r.until) && Date.parse(`${r.until}T23:59:59Z`) >= Date.now();
const ownIds = () => new Set(Object.values(reqs()).filter(reqLive).map((r) => r.id));
// a spot held by a request of this tab (the Worker writes its number on the spot)
const ownHold = (x) => !!x && x.status === 'reserved' && !!x.request && ownIds().has(x.request);
// the request this package went out as, while its hold stands
function heldReq(key = pkKey()) {
  const r = key ? reqs()[key] : null;
  if (!reqLive(r) || !DATA) return null;
  const xs = r.title ? [DATA.title] : (r.ids || []).map(byId);
  return xs.length && xs.every((x) => x && x.status === 'reserved' && x.request === r.id) ? r : null;
}
function keepReq(key, r) {
  try {
    const all = reqs();
    for (const k of Object.keys(all)) if (!reqLive(all[k])) delete all[k];
    all[key] = r;
    sessionStorage.setItem(REQS, JSON.stringify(all));
  } catch (_) {}
}
// the held request's message went out (a reload then does not offer to send it again)
function markOut() { try { const all = reqs(), r = all[pkKey()]; if (r && !r.out) { r.out = true; sessionStorage.setItem(REQS, JSON.stringify(all)); } } catch (_) {} }
function pendingFor(key) { try { const p = JSON.parse(sessionStorage.getItem(PENDING) || 'null'); return !!p && p.key === key && Date.now() - p.at < 10 * 60e3; } catch (_) { return false; } }
// while the package `key` has a request with no answer read (the page stopped waiting): a hold of the brand typed here
// may be that request's own
function maybeOwnFor(key) {
  const waiting = pendingFor(key), brand = $('#cl-brand').value;
  return (x) => waiting && !!x && x.status === 'reserved' && !!x.request && sameBrand(x.brand, brand);
}

// This tab's own holds over the file: GitHub Pages shows a new hold a minute or two after the Worker's commit, and a
// reload in between would show those spots free (and take them out of the package). After 15 minutes the file wins.
function overlayOwn(D) {
  const now = Date.now();
  for (const r of Object.values(reqs())) {
    if (!reqLive(r) || !(now - Date.parse(r.at) < OWN_FRESH)) continue;
    const xs = r.title ? [D.title] : (r.ids || []).map((id) => D.spots.find((s) => s.id === id)).filter(Boolean);
    for (const x of xs) if ((x.status || 'available') === 'available' || lapsed(x)) Object.assign(x, { status: 'reserved', until: r.until, brand: r.brand, request: r.id });
  }
}
// the Worker held them: the page shows them so at once, as everyone will see them once GitHub Pages has the commit
function markHeld(r) {
  const at = { status: 'reserved', until: r.until, brand: r.brand, request: r.id };
  if (r.title) Object.assign(DATA.title, at);
  else for (const id of r.ids) { const s = DATA.spots.find((x) => x.id === id); if (s) Object.assign(s, at); }
  normalize(DATA);
  refreshViews();
}

// '25 de outubro' / '25 October' (with the weekday: 'sábado, 25 de outubro'): the hold lasts to the end of that day
function longDay(iso, weekday = false) {
  try { return new Intl.DateTimeFormat(getLang() === 'en' ? 'en-GB' : 'pt-PT', { day: 'numeric', month: 'long', ...(weekday ? { weekday: 'long' } : {}), timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`)); } catch (_) { return fmtDay(iso); }
}
const joinList = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${getLang() === 'en' ? 'and' : 'e'} ${xs[xs.length - 1]}`);
// a spot named in a sentence: «22 Capacete, lado esquerdo» (“…” in English), so a name with a comma reads as one
const qName = (s) => (getLang() === 'en' ? `“${pad2(s.n)} ${pick(s).name}”` : `«${pad2(s.n)} ${pick(s).name}»`);
// a purchase of this tab's own request, confirmed by Gonçalo since: what the buyer is told
const boughtText = ({ mine = [], titleMine = false }) => (titleMine ? t('rq.compraT') : t('rq.compra', joinList(mine.map(qName)), mine.length));
// what the package is, for the plurals: 'title', or the number of spots
const kOf = () => (wantTitle ? 'title' : totals().list.length);

// ---------- the logo ----------
// PNG, JPG, WebP or SVG (the kind is read from the bytes, as the admin page does: admin-core.js), drawn onto a
// transparent canvas and sent as one PNG: an SVG at 1200 px on its long side, a bigger picture brought down to 1200 px
// (a small one stays as it is), nothing flattened. Over 400 KB, the Worker's limit, it is drawn smaller until it fits.
const LOGO_IN = 20 * 1024 * 1024, LOGO_MAX = 400 * 1024, LOGO_SIDE = 1200;
let buyerLogo = null, logoSeq = 0;   // { blob, url, dataUrl, w, h, name, size }
const blobUrl = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result)); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
async function makeLogo(file) {
  if (file.size > LOGO_IN) throw new Error('big');
  const C = await import('./admin-core.js');
  const bytes = new Uint8Array(await file.arrayBuffer()), kind = C.sniffLogo(bytes);
  if (!kind) throw new Error('type');
  let size = null;
  if (kind === 'svg') try { size = C.svgSize(new DOMParser().parseFromString(new TextDecoder('utf-8').decode(bytes), 'image/svg+xml')); } catch (_) {}
  const src = URL.createObjectURL(new Blob([bytes], { type: C.MIME[kind] }));
  try {
    const img = new Image();
    img.src = src;
    try { await img.decode(); } catch (_) { throw new Error('bad'); }
    const w0 = size ? size.w : img.naturalWidth, h0 = size ? size.h : img.naturalHeight;
    if (!(w0 > 0 && h0 > 0)) throw new Error('bad');
    // a picture under 64 px on its long side (a favicon, an avatar) is too small to print: said so, not «could not open»
    if (kind !== 'svg' && Math.max(w0, h0) < 64) throw new Error('small');
    let side = kind === 'svg' ? LOGO_SIDE : Math.min(LOGO_SIDE, Math.max(w0, h0));
    for (let i = 0; i < 8 && side >= 64; i++) {
      const { w, h } = C.rasterSize({ w: w0, h: h0 }, side);
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      c.getContext('2d').drawImage(img, 0, 0, w, h);
      const blob = await new Promise((ok, no) => { try { c.toBlob((b) => (b ? ok(b) : no(new Error('bad'))), 'image/png'); } catch (e) { no(e); } });
      if (blob.size <= LOGO_MAX) return { blob, w, h, size: blob.size, name: String(file.name || 'logo').slice(0, 80), dataUrl: await blobUrl(blob) };
      // a PNG's size goes with its area: one step straight to about the right side, a little under
      side = Math.floor(side * Math.max(0.25, Math.min(0.9, Math.sqrt(LOGO_MAX / blob.size) * 0.92)));
    }
    throw new Error('bad');
  } catch (e) { throw new Error(['big', 'type', 'small'].includes(e.message) ? e.message : 'bad'); }
  finally { URL.revokeObjectURL(src); }
}
async function takeLogo(file) {
  if (!file) return;
  const seq = ++logoSeq, drop = $('#cl-drop');
  logoErr(''); drop.classList.add('busy'); say(t('cl.logoBusy'));
  try {
    const L = await makeLogo(file);
    if (seq !== logoSeq) return;
    setLogo(L);
    say(t('cl.logoOk', L.name));
  } catch (e) {
    if (seq !== logoSeq) return;
    const key = { type: 'cl.logoType', big: 'cl.logoBig', small: 'cl.logoSmall' }[e.message] || 'cl.logoBad';
    logoErr(key);
    say(t(key));
  } finally {
    if (seq === logoSeq) drop.classList.remove('busy');
    $('#cl-logo').value = '';
  }
}
function setLogo(L, { save = true } = {}) {
  if (buyerLogo && buyerLogo.url) URL.revokeObjectURL(buyerLogo.url);
  buyerLogo = L ? { ...L, url: URL.createObjectURL(L.blob), canvas: null } : null;
  if (save) saveDraft();
  renderLogo(); renderNeed();
  previewOnModels();
}
function renderLogo() {
  const L = buyerLogo, drop = $('#cl-drop'), img = $('#cl-logo-img');
  drop.classList.toggle('has', !!L);
  img.hidden = !L;
  if (L) { if (img.getAttribute('src') !== L.url) img.src = L.url; } else img.removeAttribute('src');
  $$('.cl-drop-e', drop).forEach((n) => { n.hidden = !!L; });
  for (const q of ['#cl-logo-name', '#cl-logo-meta', '#cl-logo-ch']) $(q).hidden = !L;
  // '1200 × 467' and '42 KB' never break inside (no-break spaces): a narrow line wraps at the «·»
  if (L) { $('#cl-logo-name').textContent = L.name; $('#cl-logo-meta').textContent = `PNG ${L.w}\u00a0×\u00a0${L.h} · ${Math.max(1, Math.round(L.size / 1024))}\u00a0KB`; }
}
// key: an i18n key (kept, so a change of language says it again in the other), or '' to clear
function logoErr(key, { focus = false } = {}) {
  logoErrKey = key;
  const er = $('#cl-logo-err'), input = $('#cl-logo');
  er.hidden = !key; er.textContent = key ? t(key) : '';
  input.setAttribute('aria-invalid', String(!!key));
  if (key && focus) input.focus();
}
// The logo on the package's spots in the 3D view, with the try-on's own helpers (prepareLogo, the models' logos):
// it shows there once the dialog closes (the stage holds still behind it). The whole suit's goes on the chest.
const previewed = new Map();   // model -> the spot ids it shows the buyer's logo on
async function previewOnModels() {
  if (!SuitClass) return;
  const L = buyerLogo, ids = wantTitle ? [SPOTS.find((s) => s.top)?.id].filter(Boolean) : [...basket];
  let canvas = null;
  if (L && ids.length) try { canvas = L.canvas ||= await SuitClass.prepareLogo(L.blob, { removeWhite: true }); } catch (_) {}
  if (L !== buyerLogo) return;
  for (const m of models()) {
    const had = previewed.get(m) || new Set(), now = new Set();
    for (const id of had) m.logos.delete(id);
    if (canvas) for (const id of ids) if (m.rects.has(id)) { m.logos.set(id, canvas); now.add(id); }
    previewed.set(m, now);
    if (had.size || now.size) { m.drawBase(); m.drawOverlay(); m.kick(); }
  }
}

// ---------- the draft: what the buyer wrote and the logo, for this tab ----------
// Kept only as long as it is needed: «Feito» clears it (forgetDraft), and a draft older than DRAFT_KEEP is not brought
// back (a phone keeps a tab, and its sessionStorage, for weeks)
let draftT = 0;
function saveDraft() {
  clearTimeout(draftT);
  draftT = setTimeout(() => {
    const d = { at: Date.now(), brand: $('#cl-brand').value, name: $('#cl-name').value, nif: $('#cl-nif').value, msg: $('#cl-msg').value };
    const L = buyerLogo;
    try { sessionStorage.setItem(DRAFT, JSON.stringify(L ? { ...d, logo: { dataUrl: L.dataUrl, w: L.w, h: L.h, name: L.name, size: L.size } } : d)); } catch (_) {
      try { sessionStorage.setItem(DRAFT, JSON.stringify(d)); } catch (__) {}   // full: the words at least
    }
  }, 250);
}
async function restoreDraft() {
  let d = null;
  try { d = JSON.parse(sessionStorage.getItem(DRAFT) || 'null'); } catch (_) {}
  if (!d || typeof d !== 'object') return;
  if (!(Date.now() - Number(d.at) < DRAFT_KEEP)) { try { sessionStorage.removeItem(DRAFT); } catch (_) {} return; }
  for (const [k, q] of [['brand', '#cl-brand'], ['name', '#cl-name'], ['nif', '#cl-nif'], ['msg', '#cl-msg']]) if (typeof d[k] === 'string' && d[k] && !$(q).value) $(q).value = d[k];
  if ($('#cl-nif').value.trim() || $('#cl-msg').value.trim()) { $('#cl-extra').hidden = false; $('#cl-add').hidden = true; $('#cl-add').setAttribute('aria-expanded', 'true'); }
  const L = d.logo;
  if (L && typeof L.dataUrl === 'string' && L.dataUrl.startsWith('data:image/png;base64,') && !buyerLogo) {
    try { const blob = await (await fetch(L.dataUrl)).blob(); if (!buyerLogo) setLogo({ blob, dataUrl: L.dataUrl, w: Number(L.w) || 0, h: Number(L.h) || 0, size: blob.size, name: String(L.name || 'logo') }, { save: false }); } catch (_) {}
  }
  if ($('#claim').open) renderClaim();
}
// the request is over: the name, the NIF, the message and the logo go, from the fields and from the tab (the brand stays
// in its field for another package, but is no longer stored)
function forgetDraft() {
  clearTimeout(draftT);   // a save still on its way would write it back
  try { sessionStorage.removeItem(DRAFT); } catch (_) {}
  for (const q of ['#cl-name', '#cl-nif', '#cl-msg']) $(q).value = '';
  setLogo(null, { save: false });
}

// ---------- notes: what went wrong and what to do ----------
// main / sub: functions, so a change of language says them again in the other
function setNote(main = null, sub = null) {
  clNote = main ? { main, sub } : null;
  renderNote();
  // on a phone the note sits above the buttons the buyer just tapped: bring all of it on screen
  if (clNote && $('#claim').open) requestAnimationFrame(() => $('#cl-note').scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }));
}
function renderNote() {
  const el = $('#cl-note'), txt = clNote ? [clNote.main(), clNote.sub ? clNote.sub() : ''] : null;
  const key = txt ? txt.join('\n') : '';
  el.hidden = !txt;
  if (el.dataset.txt === key) return;   // the same words again: not announced twice
  el.dataset.txt = key; el.textContent = '';
  if (!txt) return;
  txt.filter(Boolean).forEach((s, i) => { const p = document.createElement('p'); if (i) p.className = 'sub'; p.textContent = s; el.appendChild(p); });
}
// the reason «Enviar» waits, under the buttons (and the buttons say so to a screen reader)
function renderNeed() {
  const need = $('#cl-need'), acts = [$('#cl-wa'), $('#cl-mail'), $('#cl-ig')];
  let text = '';
  if (rqBusy) { text = t('cl.busy'); $$('#cl-s1 .cl-busy-t').forEach((x) => { x.textContent = text; }); }
  else if (API) {
    const b = !$('#cl-brand').value.trim(), l = !buyerLogo && !heldReq();
    text = b && l ? t('cl.needBL') : b ? t('cl.needB') : l ? t('cl.needL') : '';
  }
  need.hidden = !text; need.textContent = text;
  // they look on hold but still answer a tap, with the field to fill and why (a disabled button would say nothing)
  for (const a of acts) {
    a.classList.toggle('wait', !!text);
    if (text) a.setAttribute('aria-describedby', 'cl-need'); else a.removeAttribute('aria-describedby');
  }
}
// the spots that left the package since it was put together, said in the dialog (false: nothing to say)
function goneNote({ gone, title, mine = [], titleMine = false }) {
  if (title) { setNote(() => t('rq.ocupadoT')); return true; }
  if (gone.length) { setNote(() => t('rq.ocupado', joinList(gone.map(qName)), gone.length), () => t(basket.size ? 'rq.again' : 'rq.pick')); return true; }
  if (mine.length || titleMine) { setNote(() => boughtText({ mine, titleMine })); return true; }
  return false;
}
// the Worker cannot hold it now: the buttons send the message only, and the note says the spot is not held yet
function toMsg(main) {
  rqMode = 'msg';
  setNote(main, () => t('cl.payDown', kOf()));
  renderClaim();
}
function fieldErr(q, key) {
  const el = $(q);
  el.setAttribute('aria-invalid', 'true');
  setNote(() => t(key));
  el.focus();
}
function openExtra() { const add = $('#cl-add'); $('#cl-extra').hidden = false; add.hidden = true; add.setAttribute('aria-expanded', 'true'); }

// ---------- sending the request ----------
// the tap still counts: a browser lets a page open an app or a tab only right after one (about 5 s in Chrome, less
// in Safari). Without it the app is opened by the buyer's own tap on step 2's button.
const tapLive = () => { try { return !!(navigator.userActivation && navigator.userActivation.isActive); } catch (_) { return false; } };
const needsPost = () => !!API && rqMode === 'api' && !heldReq();
// The tapped button says «A reservar…» in place of its label while the request is on its way (the line under the
// buttons can be below the screen on a phone, and with Reduce Motion nothing else moves): the label is hidden and a
// second one shown (the label itself carries data-i18n, which a change of language must still find intact)
function busy(by, on) {
  rqBusy = on;
  const btn = $({ wa: '#cl-wa', mail: '#cl-mail', ig: '#cl-ig' }[by]);
  if (on) {
    btn.setAttribute('aria-busy', 'true');
    const lab = $(':scope > span', btn), b = document.createElement('span');
    b.className = 'cl-busy-t'; b.textContent = t('cl.busy');
    lab.hidden = true; btn.appendChild(b);
    if (btn.hasAttribute('aria-label')) { btn.dataset.label = btn.getAttribute('aria-label'); btn.setAttribute('aria-label', t('cl.busy')); }
  } else for (const n of $$('#cl-s1 [aria-busy]')) {
    n.removeAttribute('aria-busy');
    $$(':scope > .cl-busy-t', n).forEach((x) => x.remove());
    $$(':scope > span[hidden]', n).forEach((x) => { x.hidden = false; });
    if (n.dataset.label) { n.setAttribute('aria-label', n.dataset.label); delete n.dataset.label; }
  }
  renderNeed();
  if (on) say(t('cl.busy'));
}
// one POST, at most REQ_TIMEOUT: { status, json }, or { status: 0, net | timeout }
async function postReq(body) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), REQ_TIMEOUT);
  try {
    const res = await fetch(`${API}/pedido`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
    let json = null;
    try { json = await res.json(); } catch (_) {}
    return { status: res.status, json };
  } catch (_) {
    return ctl.signal.aborted ? { status: 0, timeout: true } : { status: 0, net: true };
  } finally { clearTimeout(timer); }
}
async function book(by) {
  const key = pkKey(), { list, net } = totals();
  if (!key) { setNote(() => t('rq.pick')); return; }
  if (!wantTitle && list.length > MAX_ITEMS) { toMsg(() => t('rq.muitos', MAX_ITEMS)); return; }
  setNote(null);
  const body = {
    ...(wantTitle ? { title: true } : { items: list.map((s) => s.id) }),
    brand: $('#cl-brand').value.trim(), name: $('#cl-name').value.trim(), nif: $('#cl-nif').value.trim(), message: $('#cl-msg').value.trim(),
    pay: payNow(), lang: getLang(), channel: CHANNEL[by], logo: buyerLogo.dataUrl, website: '',
  };
  // on its way until its answer is read: a reload meanwhile, or no answer at all, keeps its spots in the package
  // (pruneBasket) while their hold may be this request's own
  try { sessionStorage.setItem(PENDING, JSON.stringify({ key, at: Date.now() })); } catch (_) {}
  busy(by, true);
  let res = await postReq(body);
  // no answer (a network error, or none in REQ_TIMEOUT: a slow upload or a slow commit): once more, a moment later. The
  // Worker never holds twice for one address: a first try that got through answers «aberto» with its number (below)
  if (res.net || res.timeout) { await new Promise((ok) => setTimeout(ok, res.timeout ? 3000 : 800)); res = await postReq(body); }
  busy(by, false);
  // still no answer: the request may have been held, so it stays «on its way» for the next tap (and for a reload)
  if (!res.timeout) try { sessionStorage.removeItem(PENDING); } catch (_) {}
  const j = res.json && typeof res.json === 'object' ? res.json : {};
  const r = { ids: body.items || [], title: !!body.title, brand: body.brand, pay: body.pay, channel: body.channel, at: new Date().toISOString(), out: false };
  if (res.status === 201 && ID_RE.test(j.id) && DAY_RE.test(j.until)) return held(by, key, { ...r, id: j.id, until: j.until, total: typeof j.total === 'number' && j.total > 0 ? j.total : net });
  // «aberto» with this brand's open request is this package's own hold only when it holds exactly this package (a lost
  // answer, a reload while it was on its way, the buyer's other tab): the same address and brand may have another
  // request open, for other spots, and that one goes to failed()
  const same = body.title ? j.title === true : Array.isArray(j.items) && j.items.length === body.items.length && body.items.every((id) => j.items.includes(id));
  if (res.status === 429 && j.error === 'aberto' && ID_RE.test(j.id || '') && DAY_RE.test(j.until || '') && same) return held(by, key, { ...r, id: j.id, until: j.until, total: net });
  failed(res, j, by, r);
}
function held(by, key, r) {
  keepReq(key, r);
  markHeld(r);
  setNote(null);
  sentPay = r.pay; sentBy = ''; waFail = ''; igBox = ''; msgOut = false;
  noteSent();
  // for analytics.js (generate_lead): the request reached Gonçalo, held, at the amount the Worker held it for
  document.dispatchEvent(new CustomEvent('gc:lead', { detail: { method: CHANNEL[by], value: r.total } }));
  // closed meanwhile (× while it was on its way): the page shows the hold, and the bar's «Reservar» says it is held
  if (!$('#claim').open || key !== pkKey()) { toast(t('cl.heldH', longDay(r.until))); return; }
  goStep(2);
  say(`${t('cl.heldH', longDay(r.until, true))}. ${t('cl.heldP', kOf())}`);
  if (by === 'ig') { igSend(message()); return; }
  if (tapLive()) { const a = $('#cl-go'); a.dataset.by = by; a.click(); }
}
// what each answer of the Worker means for the buyer (worker/README.md lists them). r: the request as book() would keep
// it, for an «aberto» that turns out to be this package's own
function failed(res, j, by, r) {
  // no answer in time, twice: it may well be held (a slow commit). Never «not held»: the buttons still send the request,
  // and the Worker answers the next one with this request's number and spots («aberto», taken in book)
  if (res.timeout) { setNote(() => t('rq.lento'), () => t('rq.lentoSub')); return; }
  const code = typeof j.error === 'string' ? j.error : '';
  if (!res.status || res.status >= 500 || !code) { toMsg(() => t('rq.net')); return; }
  switch (code) {
    case 'ocupado': taken(Array.isArray(j.ids) ? j.ids : []); return;
    case 'espacos': setNote(() => t('rq.espacos')); refreshSpots(); return;
    case 'aberto': {
      if (!(ID_RE.test(j.id || '') && DAY_RE.test(j.until || ''))) { toMsg(() => t('rq.abertoX')); return; }
      // this package already shows held by that request (the buyer's other tab sent it, and Pages has the commit)
      const xs = wantTitle ? [DATA.title] : totals().list;
      if (xs.length && xs.every((x) => x.status === 'reserved' && x.request === j.id)) { held(by, pkKey(), { ...r, id: j.id, until: j.until, total: totals().net }); return; }
      // another request of this buyer, for other spots: this package goes as a message only, and the message names it
      rqMode = 'msg'; openReq = j.id;
      setNote(() => t('rq.aberto', j.id, longDay(j.until)), () => t('rq.abertoSub'));
      renderClaim();
      return;
    }
    case 'limite': toMsg(() => t('rq.limite')); return;
    case 'limite-site': toMsg(() => t('rq.limiteSite')); return;
    case 'muitos': toMsg(() => t('rq.muitos', Number(j.max) || MAX_ITEMS)); return;
    case 'marca': brandErr(true, 'rq.marca'); $('#cl-brand').focus(); return;
    case 'nome': fieldErr('#cl-name', 'rq.nome'); return;
    case 'nif': openExtra(); fieldErr('#cl-nif', 'rq.nif'); return;
    case 'mensagem': openExtra(); fieldErr('#cl-msg', 'rq.mensagem'); return;
    case 'pagamento': setNote(() => t('rq.pagamento')); $('#cl-pay input:not(:disabled)')?.focus(); return;
    case 'logo': logoErr('rq.logo', { focus: true }); return;
    case 'logo-grande': case 'tamanho': logoErr('rq.logoGrande', { focus: true }); return;
    case 'turnstile': setNote(() => t('rq.turnstile')); return;
    // origem, json, lingua, canal, recusado: nothing the buyer can change here
    default: toMsg(() => t('rq.geral'));
  }
}
// «ocupado»: the Worker knows before GitHub Pages does. Those spots are taken whatever the page still shows (and stay so
// over a file Pages has not republished yet: takenAt); they leave the package and the file is read again. A spot held by
// this tab's own request (sent from another connection, so not «aberto») stays, and the note says to take it out.
function taken(ids) {
  const own = ids.map(byId).filter(ownHold);
  // ('fato' says the whole suit cannot be had, not that it is held: one of its spots may be the reason)
  for (const id of ids) if (id !== 'fato' && !own.some((s) => s.id === id)) takenAt.set(id, Date.now());
  if (own.length) {
    setNote(() => t('rq.mine', joinList(own.map(qName)), own.length, own[0].request), () => t('rq.mineSub', own.length));
    renderClaim();
    return;
  }
  if (ids.includes('fato') || wantTitle) { wantTitle = false; renderPackage(); setNote(() => t('rq.ocupadoT')); renderClaim(); refreshSpots(); return; }
  for (const id of ids) { const s = byId(id); if (s && s.status === 'available') { s.status = 'reserved'; delete s.until; } }
  const lost = pruneBasket();
  refreshViews();
  // a 409 never ends in silence
  if (!goneNote(lost)) setNote(() => t('rq.geral'));
  renderClaim();
  refreshSpots();
}
// Instagram after the hold: the message to the clipboard if the browser still lets the page write it, else selected
// in the box to copy by hand; «Abrir o Instagram» under it either way
async function igSend(text) {
  sent('ig');
  if (await copy(text)) { igBox = 'open'; renderClaim(); say(shownText($('#cl-igfb-open'))); return; }
  igBox = 'copy'; igText = text; renderClaim();
  const ta = $('#cl-igfb-txt'); ta.focus({ preventScroll: true }); ta.select();
}

// ---------- tour ----------
// each part has its own tour: it visits that part's free spots only, so the camera never leaves its model
const tourBtn = (it) => $(`.chapters[data-item="${it}"] [data-tour]`);
// (a step never scrolls the page: the scroll check stops the tour once the visitor leaves its part)
function startTour(it) {
  withModel(it, (k) => {
    stopTour();
    const ctl = tourCtl = new AbortController(); tourIt = it;
    const ids = available().filter((s) => itemOf(s) === it).sort((a, b) => b.price - a.price || a.n - b.n).map((s) => s.id);
    const b = tourBtn(it); b?.classList.add('on');
    k.tour(ids, (id) => select(id, { from3d: true, scroll: false }), ctl.signal).finally(() => b?.classList.remove('on'));
  });
}
function stopTour() { if (tourCtl) { tourCtl.abort(); tourCtl = null; tourIt = null; $$('[data-tour]').forEach((b) => b.classList.remove('on')); } }
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
  $('#sheet-x').addEventListener('click', () => { stopTour(); select(null); if (kit) kit.home(); });
  let y0 = null, dy = 0;
  // the drag starts only on the grip strip (touch-action: none): anywhere else iOS scrolls and cancels the pointer
  sheet.addEventListener('pointerdown', (e) => { if (!mobile() || !e.target.closest('.sheet-grip')) return; y0 = e.clientY; dy = 0; sheet.classList.add('dragging'); });
  sheet.addEventListener('pointermove', (e) => { if (y0 === null) return; dy = Math.max(0, e.clientY - y0); sheet.style.setProperty('--drag', `${dy}px`); });
  const end = () => { if (y0 === null) return; sheet.classList.remove('dragging'); y0 = null; if (dy > 90) { stopTour(); select(null); if (kit) kit.home(); } else sheet.style.removeProperty('--drag'); };
  sheet.addEventListener('pointerup', end); sheet.addEventListener('pointercancel', end);
  // On an upright phone a part's stage shrinks while its rate card is being read. The shrink never moves the page: the
  // stage's sticky box keeps its height in the layout and only the stage drawn inside it gets shorter (style.css), so
  // the rate card does not slide in and out of the band, and a glide to a part lands where it aimed. And only once the
  // stage is held under the nav: a link that lands on a part (the helmet's short card already reaches the band there)
  // shows the whole stage and its shortcut buttons.
  for (const it of ITEMS) {
    const studio = $(`.studio[data-item="${it}"]`);
    let inBand = false;
    const apply = () => studio.classList.toggle('compact', inBand && stacked() && !studio.classList.contains('no3d') && studio.getBoundingClientRect().top < navH() - 8);
    new IntersectionObserver((en) => { inBand = en[0].isIntersecting; apply(); }, { rootMargin: '-55% 0px -10% 0px' }).observe($(`.ratecard[data-item="${it}"]`));
    addEventListener('resize', apply);
    addEventListener('scroll', () => { if (inBand) apply(); }, { passive: true });
  }
  addEventListener('resize', () => { if (!mobile()) closeSheet(); });
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
    // gc:share tells analytics.js the share happened (a dismissed share sheet or a failed copy is not a share)
    if (navigator.share) { try { await navigator.share({ title: t(onHelmet ? 'share.titleH' : 'share.title'), text: `${pick(s).name} · ${money(s.price)}`, url }); document.dispatchEvent(new CustomEvent('gc:share', { detail: { method: 'web_share' } })); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    if (await copy(url)) { toast(t('toast.link')); document.dispatchEvent(new CustomEvent('gc:share', { detail: { method: 'copy_link' } })); }
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
  // WhatsApp is a real link, filled in at the tap (same tab on a phone, a new tab on a computer: see appTarget). If the app
  // does not take over, step 2 offers email and Instagram at the top (see watchWa).
  // With the Worker, the first tap sends the request (book): the app opens once the spots are held. A request on its way
  // takes no second tap.
  $('#cl-wa').addEventListener('click', (e) => {
    if (rqBusy || !brandOk()) { e.preventDefault(); return; }
    if (needsPost()) { e.preventDefault(); book('wa'); return; }
    const a = e.currentTarget;
    a.href = waUrl();
    appTarget(a);
    sent('wa'); watchWa(); goStep(2);
  });
  $('#cl-igfb-go').addEventListener('click', (e) => appTarget(e.currentTarget));
  // email: a real mailto: link, filled in at the tap: the browser hands it to the default mail app once the click is
  // done, then the dialog moves on (a step later, so the link is still on screen when the browser follows it).
  // Instagram: the message goes to the clipboard, and step 2 says so and how to use it before the buyer leaves. Both live
  // in step 1 and, after a WhatsApp link that did not open, at the top of step 2.
  $$('#claim [data-send="mail"]').forEach((a) => a.addEventListener('click', (e) => {
    if (rqBusy || !brandOk()) { e.preventDefault(); return; }
    if (needsPost()) { e.preventDefault(); book('mail'); return; }
    e.currentTarget.href = mailUrl();
    sent('mail'); setTimeout(() => goStep(2), 0);
  }));
  $$('#claim [data-send="ig"]').forEach((b) => b.addEventListener('click', async (e) => {
    // (refused, or held back for the Worker: like the two links, the tap is marked, so analytics.js does not count it
    // as sent)
    if (rqBusy || !brandOk()) { e.preventDefault(); return; }
    if (needsPost()) { e.preventDefault(); book('ig'); return; }
    const text = message();
    sent('ig');
    // the clipboard call starts inside the tap (Safari asks for that). Copied: step 2 starts with «Mensagem copiada. Cola-a
    // na conversa do Instagram:» over «Abrir o Instagram», a real link the buyer taps (this same tab on a phone, so iOS
    // hands ig.me to the app; a new tab on a computer; never a popup to block). Opening it now would take the buyer away
    // before the line could say to paste
    if (await copy(text)) {
      igBox = 'open';
      goStep(2);
      say(shownText($('#cl-igfb-open')));
      return;
    }
    // no clipboard: the message waits selected in the same box, over the same link
    igBox = 'copy'; igText = text;
    goStep(2, { focus: false });
    const ta = $('#cl-igfb-txt');
    ta.focus({ preventScroll: true }); ta.select();
  }));
  $$('#cl-pay input').forEach((r) => r.addEventListener('change', () => { if (r.checked) { payPick = r.value; renderClaim(); } }));
  // step 2, after a hold whose app did not open by itself: the request's message, by the way it was asked for
  $('#cl-go').addEventListener('click', (e) => {
    const a = e.currentTarget;
    if (a.dataset.by === 'mail') { a.href = mailUrl(); a.removeAttribute('target'); sent('mail'); }
    else { a.href = waUrl(); appTarget(a); sent('wa'); watchWa(); }
    // a step later, so the link is still on screen when the browser follows it
    setTimeout(renderClaim, 0);
  });
  // the logo: picked (a tap on the box), or dropped anywhere on the dialog
  $('#cl-logo').addEventListener('change', (e) => { const f = e.target.files && e.target.files[0]; if (f) takeLogo(f); });
  const drop = $('#cl-drop'), files = (e) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  for (const ev of ['dragenter', 'dragover']) $('#claim').addEventListener(ev, (e) => {
    if (!files(e) || $('#cl-logo-f').hidden || clStep !== 1) return;
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; drop.classList.add('drag');
  });
  $('#claim').addEventListener('dragleave', (e) => { if (!e.relatedTarget || !$('#claim').contains(e.relatedTarget)) drop.classList.remove('drag'); });
  $('#claim').addEventListener('drop', (e) => {
    drop.classList.remove('drag');
    if (!files(e)) return;
    // never the browser's own drop (it would open the picture in place of the page)
    e.preventDefault();
    if (!$('#cl-logo-f').hidden && clStep === 1) takeLogo(e.dataTransfer.files[0]);
  });
  // the draft follows what is typed; a field a request refused clears its mark as it changes
  for (const q of ['#cl-brand', '#cl-name', '#cl-nif', '#cl-msg']) $(q).addEventListener('input', (e) => {
    saveDraft();
    if (q !== '#cl-brand' && e.target.getAttribute('aria-invalid') === 'true') { e.target.removeAttribute('aria-invalid'); setNote(null); }
  });
  document.addEventListener('visibilitychange', () => waSeen(document.visibilityState === 'visible'));
  // back on the page after a while (another tab, the phone asleep): what other brands held meanwhile
  document.addEventListener('visibilitychange', () => { if (API && document.visibilityState === 'visible' && Date.now() - readAt > 120000 && !$('#claim').open) refreshSpots(); });
  addEventListener('blur', () => waSeen(false));
  addEventListener('focus', () => waSeen(document.visibilityState === 'visible'));
  addEventListener('pagehide', waGone);
  addEventListener('pageshow', waBack);
  $('#cl-brand').addEventListener('input', (e) => { if (e.target.value.trim()) brandErr(false); renderNeed(); });
  $('#cl-msg').addEventListener('input', mailCutHint);
  $('#cl-add').addEventListener('click', (e) => { e.currentTarget.setAttribute('aria-expanded', 'true'); $('#cl-extra').hidden = false; e.currentTarget.hidden = true; $('#cl-nif').focus(); });
  $('#cl-more').addEventListener('click', () => { const items = $('#cl-items'); items.hidden = !items.hidden; renderClaim(); });
  // (hidden while a request still has to hold the package: renderClaim)
  $('#cl-sent').addEventListener('click', () => { if (API && rqMode === 'api' && !heldReq()) return; sent(''); goStep(2); });
  $('#cl-back').addEventListener('click', () => goStep(1));
  // «Feito» ends the request: the package empties and its bar slides away under the thank-you toast (× and Esc keep it),
  // and the draft goes (name, NIF, message, logo). The bar's «Reservar» goes with it, so focus moves on to the rate card
  // heading. A held package whose message never went out says that it still has to.
  $('#cl-done').addEventListener('click', () => {
    const r = heldReq();
    forgetSent();
    forgetDraft();
    wantTitle = false; basket.clear(); saveBasket();
    $('#claim').close();
    if (document.activeElement?.closest('#package')) { const h = $(`.ratecard[data-item="${midPart() || 'suit'}"] h4`); h.tabIndex = -1; h.focus({ preventScroll: true }); }
    toast(r ? (msgOut ? t('toast.held', longDay(r.until), r.title ? 'title' : 0) : t('toast.heldNoMsg', longDay(r.until), r.id)) : t('toast.thanks'));
  });
  $$('#pay-tabs [role="tab"]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab, { user: true })));
  // arrow keys move along the tabs (the MB WAY tab is skipped while it is off)
  $('#pay-tabs').addEventListener('keydown', (e) => {
    const tabs = $$('#pay-tabs [role="tab"]').filter((b) => !b.disabled), i = tabs.indexOf(document.activeElement);
    const j = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
    if (i < 0 || j === undefined) return;
    e.preventDefault();
    setTab(tabs[(j + tabs.length) % tabs.length].dataset.tab, { focus: true, user: true });
  });
  fillPayee();
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b || !b.dataset.copy) return;
    if (!(await copy(b.dataset.copy))) return;
    toast(t(b.dataset.toast || 'toast.copy'));
    b.classList.add('ok'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('ok'), 1600);
  });
  // × and Esc: a held whole suit keeps its bar, so «Reservar» there brings back its number and payment (as a held
  // package of spots does); «Feito» and «Limpar» let go of it themselves
  $('#claim').addEventListener('close', () => { stopWa(); waTap = null; if (!heldReq('title')) wantTitle = false; renderPackage(); if (previewed.size) previewOnModels(); for (const m of models()) m.hold(false); });
  $('#claim .close').addEventListener('click', () => $('#claim').close());
  $('#claim-form').addEventListener('submit', (e) => e.preventDefault());
  // Enter (the keyboard's «next» / «done») moves on to the next field, and leaves the last one (the «Pagar por» radios
  // are not fields to type in: Enter there does nothing)
  $('#claim-form').addEventListener('keydown', (e) => {
    // (Enter on the logo box opens the picker, as it should)
    if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.type === 'file') return;
    e.preventDefault();
    if (e.target.type === 'radio') return;
    const fields = $$('#cl-s1 input:not([type="radio"]):not([type="file"]), #cl-s1 textarea').filter((x) => x.offsetParent), next = fields[fields.indexOf(e.target) + 1];
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
    if (selected || selected !== was || want !== item) select(selected, { scroll: false });
    if (hashLand && hashLand !== midPart()) land(hashLand);
  });
}

export const adspaceReduce = reduce;
