// Sponsor platform: rate card, spot card, package, claim flow, logo try-on and the 3D stage.
// The stage holds two models on one renderer: the suit, and the helmet (helmet.js, built the first time it is shown).
import { t, pick, money, numFmt, onLang, getLang, fmtDay } from './i18n.js';
import { SITE } from './data.js';
import { flowSet } from './flow.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const AREAS = ['front', 'sides', 'shoulders', 'legs', 'back', 'helmet'];
const STORE = 'gc.package.2027';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = () => matchMedia('(max-width: 760px)').matches;

let DATA = null, SPOTS = [], suit = null, helmet = null, kit = null, SuitClass = null, helmetBuild = null;
// item: the model on the stage now. want: the model asked for last (set at once, before any await).
let item = 'suit', want = 'suit';
let selected = null, basket = new Set(), sortMode = 'area', onlyAvail = false, wantTitle = false;
let tourCtl = null, logoFile = null, interacted = false;

const byId = (id) => SPOTS.find((s) => s.id === id);
const itemOf = (s) => s.item || 'suit';   // a spot without "item" is on the suit
const ofItem = (it) => SPOTS.filter((s) => itemOf(s) === it);
const models = () => [suit, helmet].filter(Boolean);
const tierOf = (s) => DATA.tiers.find((x) => s.price >= x.min) || DATA.tiers[DATA.tiers.length - 1];
const available = () => SPOTS.filter((s) => s.status === 'available');
const pad2 = (n) => String(n).padStart(2, '0');
// spot size in the page's language: '26 × 8 cm', '5,5 × 3,5 cm' (PT) or '5.5 × 3.5 cm' (EN)
const cmOf = (x) => (Number.isInteger(x) ? String(x) : numFmt(x, 1));
const sizeOf = (s, sep = ' × ') => `${cmOf(s.w)}${sep}${cmOf(s.h)} cm`;
// a reservation lapses on its own once its `until` day is over, so a stale hold never blocks a sale
const lapsed = (x) => x.status === 'reserved' && x.until && Date.parse(`${x.until}T23:59:59Z`) < Date.now();
const ibanPretty = (s) => s.replace(/\s+/g, '').replace(/(.{4})/g, '$1 ').trim();
const toast = (msg) => { const el = $('#toast'); const dlg = $('#claim'); const host = dlg && dlg.open ? dlg : document.body; if (el.parentElement !== host) host.appendChild(el); el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3200); };

export async function initAdspace({ onSuitReady } = {}) {
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
  if (selected) select(selected); else syncItemTabs();
  onLang(() => {
    renderStats(); renderLegend(); renderRateCard(); renderCard(); renderPackage(); renderOnSuit();
    for (const m of models()) { m.labels = kitLabels(); m.money = money; m.drawOverlay(); m.kick(); }
    const ld = $('#item-loading span'); if (ld) ld.textContent = t('helmet.loading');
    const gl = $('#gl-lost span'); if (gl) gl.textContent = t('stage.lost');
  });
  // the 3D stage loads when the section approaches the viewport
  const stage = $('#stage');
  const io = new IntersectionObserver(async (en) => {
    if (!en[0].isIntersecting) return;
    io.disconnect();
    await mountSuit();
    if (suit && onSuitReady) onSuitReady(suit);
  }, { rootMargin: '600px 0px' });
  io.observe(stage);
}

function kitLabels() { return { sold: t('lbl.sold'), reserved: t('lbl.reserved'), top: t('lbl.top') }; }
const onModelSelect = (id) => { stopTour(); select(id, { from3d: true }); };

async function mountSuit() {
  const stage = $('#stage');
  try {
    const mod = await import('./suit.js');
    if (!mod.webglAvailable()) throw new Error('webgl');
    SuitClass = mod.Suit;
    // a helmet deep link: the suit is built idle, so it never flashes up before the helmet
    const first = want === 'helmet';
    suit = kit = new mod.Suit(stage, { spots: ofItem('suit'), money, labels: kitLabels(), onSelect: onModelSelect, onHover: () => {}, active: !first });
    item = 'suit';
    suit.setBasket([...basket]);
    printSponsors(suit);
    stage.addEventListener('suit:interact', () => { interacted = true; stopTour(); $('#btn-rotate').setAttribute('aria-pressed', 'false'); });
    stage.addEventListener('suit:frame', placeCallout);
    watchContext(suit.canvas);
    if (first) {
      const ld = $('#stage-loading'); delete ld.dataset.i18n; ld.textContent = t('helmet.loading');
      await showItem('helmet');
      if (item !== 'helmet') { suit.setActive(true); syncItemTabs(); }   // the helmet could not be built
    }
    $('#stage-loading')?.remove();
    if (selected && itemOf(byId(selected)) === item) kit.select(selected, { focus: true });
  } catch (e) {
    $('#stage-loading')?.remove();
    no3d();
  }
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
    $('#stage').appendChild(lbl);
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
  const stage = $('#stage');
  for (const m of models()) m.setActive(false);
  suit = helmet = kit = null;
  if (glBack) glBack.done();
  stopTour();
  $('#callout').classList.remove('on');
  $$('canvas, .loading', stage).forEach((n) => n.remove());
  if (!$('.stage-fallback', stage)) {
    const fb = document.createElement('div');
    fb.className = 'stage-fallback';
    fb.dataset.i18n = 'suit.no3d';
    fb.textContent = t('suit.no3d');
    stage.appendChild(fb);
  }
  stage.classList.add('no3d');
  $$('.stage-ui, .stage-foot', stage).forEach((n) => n.remove());
  ['#sd-try', '#tryon', '#btn-tour', '#chapters'].forEach((q) => { const n = $(q); if (n) n.hidden = true; });
}

// The helmet, built once on first view, on the suit's renderer (one canvas, one GL context).
function ensureHelmet() {
  helmetBuild ||= (async () => {
    const stage = $('#stage');
    const lbl = document.createElement('div'); lbl.className = 'loading'; lbl.id = 'item-loading';
    const sp = document.createElement('span'); sp.textContent = t('helmet.loading'); lbl.appendChild(sp);
    if (!$('#stage-loading')) stage.appendChild(lbl);
    try {
      const { Helmet } = await import('./helmet.js');
      // the build is synchronous: let the label paint first
      await new Promise((res) => requestAnimationFrame(() => setTimeout(res, 0)));
      if (glBack) await glBack;   // a lost context cannot compile or upload: wait for it to come back
      if (!suit) return false;
      helmet = new Helmet(stage, { spots: ofItem('helmet'), money, labels: kitLabels(), onSelect: onModelSelect, onHover: () => {}, renderer: suit.renderer, active: false });
      helmet.setBasket([...basket]);
      await helmet.prepare();   // the constant part of the bake, in short tasks, before any logo is printed
      await printSponsors(helmet);
      await helmet.ready();
      return true;
    } catch (e) {
      console.error(e);
      helmet = null;
      if (suit) {
        toast(t('toast.helmet'));
        const b = $('[data-item="helmet"]');
        if (b) { if (document.activeElement === b) $('[data-item="suit"]')?.focus(); b.disabled = true; }
      }
      return false;
    } finally { lbl.remove(); }
  })();
  return helmetBuild;
}

function syncItemTabs() {
  $$('[data-item]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.item === want)));
  const ld = $('#item-loading'); if (ld) ld.hidden = want !== 'helmet';   // back on the suit while the helmet builds
}

// Put the suit or the helmet on the stage. Several calls can overlap (taps while the helmet builds):
// only the last one asked for (`want`) switches, and it selects whatever is selected by then.
async function showItem(it) {
  want = it; syncItemTabs();
  if (!kit) return;                        // no stage yet: mountSuit reads `want`
  if (it === item) return;
  stopTour();                              // a tour on the old model would select its spots and undo `want`
  if (it === 'helmet' && !(await ensureHelmet())) { if (want === 'helmet') { want = item; syncItemTabs(); } return; }
  if (want !== it || item === it || !kit) return;
  stopTour();                              // and one started while the helmet was building
  const next = it === 'helmet' ? helmet : suit;
  kit.setActive(false);
  kit = next; item = it;
  // the stage switches (spots, rotate) carry over to the model coming up
  const spotsOn = $('#btn-spots').getAttribute('aria-pressed') === 'true';
  kit.setShowSpots(spotsOn);
  kit.setAuto($('#btn-rotate').getAttribute('aria-pressed') === 'true');
  kit.setActive(true);
  if (!kit._revealed) { kit._revealed = true; kit.reveal(); }
  $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', 'false'));
  $('#callout').classList.remove('on');
  const s = selected && byId(selected);
  $('#spot-status').textContent = s && itemOf(s) === item ? `${t(`z.${it}`)} · ${pick(s).name} · ${money(s.price)}` : t(`z.${it}`);
  if (s && itemOf(s) === item) {
    if (!spotsOn) { $('#btn-spots').setAttribute('aria-pressed', 'true'); kit.setShowSpots(true); }
    kit.select(selected, { focus: true });
    if ($('#tryon').classList.contains('on') && logoFile) applyLogo();
  } else kit.select(null);
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
export function deepLinked() { return /^#(fato|capacete|pacote=)/.test(location.hash) || !!selected || wantTitle; }
export function userHasInteracted() { return interacted || !!selected; }

// ---------- stats ----------
// The counts cover every spot, suit and helmet; the title package is the suit's 20 alone.
function renderStats() {
  const av = available();
  const prices = SPOTS.map((s) => s.price);
  flowSet($('#avail-n'), av.length);
  flowSet($('#hero-spots'), av.length);
  $('#avail-t').textContent = SPOTS.length;
  $('#avail-pct').textContent = `${Math.round((av.length / SPOTS.length) * 100)}%`;
  $('#avail-bar').style.width = `${(av.length / SPOTS.length) * 100}%`;
  const eur = { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 };
  flowSet($('#st-n'), SPOTS.length);
  flowSet($('#st-from'), Math.min(...prices), { format: eur });
  const top = av.slice().sort((a, b) => b.price - a.price)[0];
  if (top) flowSet($('#st-top'), top.price, { format: eur }); else $('#st-top').textContent = t(SPOTS.some((s) => s.status === 'reserved') ? 'st.reserved' : 'st.sold');
  flowSet($('#st-title'), DATA.title.price, { format: eur });
  $('#tp-price').textContent = money(DATA.title.price);
  const tpBtn = $('#tp-btn');
  tpBtn.disabled = DATA.title.status !== 'available' || !titleOpen();
  if (DATA.title.status !== 'available') tpBtn.textContent = statusText(DATA.title);
}
// the whole suit can be asked for only while every suit spot is free (helmet sales do not matter)
const titleOpen = () => ofItem('suit').every((s) => s.status === 'available');

function renderLegend() {
  const host = $('#tiers-legend');
  host.textContent = '';
  for (const tr of DATA.tiers) {
    const inTier = SPOTS.filter((s) => tierOf(s).key === tr.key);
    if (!inTier.length) continue;
    const lo = Math.min(...inTier.map((s) => s.price)), hi = Math.max(...inTier.map((s) => s.price));
    const span = document.createElement('span');
    const i = document.createElement('i'); i.className = `t-${tr.key}`;
    span.append(i, `${pick(tr)} · ${lo === hi ? money(lo) : `${money(lo)} ${getLang() === 'en' ? 'to' : 'a'} ${money(hi)}`} · ${inTier.length}`);
    host.appendChild(span);
  }
}

// ---------- rate card ----------
function renderRateCard() {
  const host = $('#rc-body');
  host.textContent = '';
  const list = SPOTS.filter((s) => !onlyAvail || s.status === 'available');
  const groups = [];
  if (sortMode === 'area') {
    for (const a of AREAS) { const items = list.filter((s) => s.area === a).sort((x, y) => x.n - y.n); if (items.length) groups.push({ title: t(`z.${a}`), items }); }
  } else {
    for (const tr of DATA.tiers) { const items = list.filter((s) => tierOf(s).key === tr.key).sort((x, y) => y.price - x.price || x.n - y.n); if (items.length) groups.push({ title: pick(tr), items }); }
  }
  for (const g of groups) {
    const box = document.createElement('div'); box.className = 'rc-group';
    const h = document.createElement('h4');
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
  nm.textContent = pick(s).name;
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
function select(id, { from3d = false, focus = true } = {}) {
  selected = id && byId(id) ? id : null;
  const it = selected ? itemOf(byId(selected)) : want, switching = it !== item;
  // the model on stage lets go of its spot at once: the card already shows the new one, and if the other model
  // cannot be built (helmet.js failed to load) the stage stays neutral instead of highlighting the old spot
  if (switching) { if (kit) kit.select(null); showItem(it); }
  else { if (want !== it) { want = it; syncItemTabs(); } if (kit && !from3d) kit.select(selected, { focus }); }
  renderCard();
  $$('.rc-row').forEach((r) => r.classList.toggle('sel', r.dataset.id === selected));
  $$('.chapter[data-focus]').forEach((c) => c.classList.toggle('on', c.dataset.focus === selected));
  if (selected && kit && $('#btn-spots').getAttribute('aria-pressed') !== 'true') { $('#btn-spots').setAttribute('aria-pressed', 'true'); if (!switching) kit.setShowSpots(true); }
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

function renderCard() {
  const s = selected && byId(selected);
  $('#spot-empty').hidden = !!s;
  $('#spot-detail').hidden = !s;
  if (!s) return;
  const tr = tierOf(s);
  const topId = SPOTS.find((x) => x.top)?.id;
  $('#sd-id').textContent = `${String(s.n).padStart(2, '0')} · ${t(`z.${s.area}`).toUpperCase()}`;
  $('#sd-name').textContent = pick(s).name;
  $('#sd-price').textContent = money(s.price);
  $('#sd-tier').textContent = `${pick(tr)} · ${getLang() === 'en' ? `${DATA.season} season` : `época ${DATA.season}`}`;
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
  $('#pk-total').textContent = wantTitle ? `${t('msg.title')} · ${money(net)}` : `${t('pk.spots', list.length)} · ${money(net)}`;
  $('#pk-list').textContent = wantTitle ? '' : `${disc ? `${t('pk.disc', Math.round(disc * 100))} (${money(gross)}) · ` : ''}${list.map((s) => pick(s).name).join(', ')}`;
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

function message() {
  const { list, net, gross, disc } = totals();
  const brand = $('#cl-brand').value.trim(), name = $('#cl-name').value.trim(), nif = $('#cl-nif').value.trim(), extra = $('#cl-msg').value.trim();
  const lines = [t(`msg.hi${kindKey()}`), ''];
  if (wantTitle) lines.push(`${t('msg.title')}: ${money(net)}`);
  else {
    lines.push(`${t('msg.spots')}:`);
    for (const s of list) lines.push(`• ${String(s.n).padStart(2, '0')} ${pick(s).name} (${sizeOf(s, '×')}) · ${money(s.price)}`);
    lines.push(`${t('msg.total')}: ${money(net)}${disc ? ` (${money(gross)} −${Math.round(disc * 100)}%)` : ''}`);
  }
  if (brand) lines.push(`${t('msg.brand')}: ${brand}`);
  if (name) lines.push(`${t('msg.name')}: ${name}`);
  if (nif) lines.push(`${t('msg.nif')}: ${nif}`);
  lines.push(`${t('msg.ref')}: ${payRef()}`);
  if (extra) lines.push('', extra);
  lines.push('', packageLink());
  return lines.join('\n');
}

function openClaim() {
  const { list, net } = totals();
  const label = wantTitle ? t('msg.title') : t('pk.spots', list.length);
  const lines = wantTitle ? [] : list.map((s) => `<li>${String(s.n).padStart(2, '0')} · ${escapeHtml(pick(s).name)} · ${sizeOf(s, '×')}<b>${escapeHtml(money(s.price))}</b></li>`);
  const { gross, disc } = totals();
  $('#cl-sum').innerHTML = `${lines.length ? `<ul class="cl-list">${lines.join('')}</ul>` : ''}${disc ? `<p class="cl-disc">${escapeHtml(t('pk.disc', Math.round(disc * 100)))} · ${escapeHtml(money(gross))}</p>` : ''}<p>${t('cl.sum', escapeHtml(label), escapeHtml(money(net)))}</p>`;
  $('#pay-amt').textContent = money(net);
  $('#pay-amt-cp').dataset.copy = String(net).replace('.', ',');
  $('#pay-ref').textContent = payRef();
  $('#pay-ref-cp').dataset.copy = payRef();
  const dlg = $('#claim');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
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
  const mb = $('#pay-mbway');
  if (mb) { mb.hidden = !SITE.mbway; if (SITE.mbway) { $('#pay-mb').textContent = SITE.mbway.replace(/(\d{3})(?=\d)/g, '$1 '); $('#pay-mb-cp').dataset.copy = SITE.mbway; } }
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (_) {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
}

// ---------- tour ----------
// the tour stays on the model on stage, so the camera never jumps between the suit and the helmet
function startTour() {
  if (!kit) return;
  stopTour();
  tourCtl = new AbortController();
  const ids = available().filter((s) => itemOf(s) === item).sort((a, b) => b.price - a.price || a.n - b.n).map((s) => s.id);
  $('#btn-tour').classList.add('on');
  kit.tour(ids, (id) => select(id, { from3d: true }), tourCtl.signal).finally(() => $('#btn-tour').classList.remove('on'));
}
function stopTour() { if (tourCtl) { tourCtl.abort(); tourCtl = null; $('#btn-tour')?.classList.remove('on'); } }

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
function readHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('pacote=')) {
    const ids = h.slice(7).split(',').filter((id) => byId(id)?.status === 'available');
    if (ids.length) { basket = new Set(ids); try { localStorage.setItem(STORE, JSON.stringify(ids)); } catch (_) {} }
    history.replaceState(null, '', `${location.pathname}${location.search}#fato`);
  } else if (h === 'fato/title') {
    wantTitle = DATA.title.status === 'available' && titleOpen();
  } else if (/^capacete(\/|$)/.test(h)) {
    const id = h.slice(9);
    if (byId(id)) selected = id; else { selected = null; want = 'helmet'; }
  } else if (/^fato\/./.test(h)) {
    const id = h.slice(h.indexOf('/') + 1);
    if (byId(id)) selected = id;
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
  // on phones the stage shrinks while the rate card is being read
  const studio = $('.studio');
  new IntersectionObserver((en) => { studio.classList.toggle('compact', mobile() && en[0].isIntersecting); }, { rootMargin: '-55% 0px -10% 0px' }).observe($('#ratecard'));
  addEventListener('resize', () => { if (!mobile()) { sheet.classList.remove('open'); document.body.classList.remove('sheet-open'); studio.classList.remove('compact'); } });
}

function bindUI() {
  bindSheet();
  // Fato | Capacete: bound here (not when the stage mounts), so an early tap still sets `want`
  $$('[data-item]').forEach((b) => b.addEventListener('click', () => {
    const it = b.dataset.item;
    if (it === want && it === item) return;
    stopTour(); interacted = true;
    want = it;   // so select(null) below stays on the model asked for
    select(null);
    showItem(it).then(() => { if (item === it && want === it) { kit.home(); kit.setAuto($('#btn-rotate').getAttribute('aria-pressed') === 'true'); } });
  }));
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
    stopTour(); interacted = true;
    $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    select(null);
    kit && kit.view(b.dataset.view);
    $('#btn-rotate').setAttribute('aria-pressed', 'false');
  }));
  $('#btn-rotate').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (on) { select(null); stopTour(); }
    kit && kit.setAuto(on);
  });
  $('#btn-spots').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (!on) select(null);
    kit && kit.setShowSpots(on);
  });
  $('#zoom-in').addEventListener('click', () => kit && kit.zoom(1));
  $('#zoom-out').addEventListener('click', () => kit && kit.zoom(-1));
  $$('.chapter[data-focus]').forEach((c) => c.addEventListener('click', () => { stopTour(); interacted = true; select(c.dataset.focus); }));
  $('#btn-tour').addEventListener('click', () => { interacted = true; tourCtl ? stopTour() : startTour(); });
  $$('[data-sort]').forEach((b) => b.addEventListener('click', () => {
    sortMode = b.dataset.sort;
    $$('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    renderRateCard();
  }));
  $('#only-avail').addEventListener('change', (e) => { onlyAvail = e.target.checked; renderRateCard(); });
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
  $('#pk-clear').addEventListener('click', () => { wantTitle = false; basket.clear(); saveBasket(); });
  $('#pk-go').addEventListener('click', openClaim);
  $('#cl-wa').addEventListener('click', () => window.open(`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message())}`, '_blank', 'noopener'));
  $('#cl-mail').addEventListener('click', () => { location.href = `mailto:${SITE.email}?subject=${encodeURIComponent(t(`msg.subject${kindKey()}`))}&body=${encodeURIComponent(message())}`; });
  $('#cl-ig').addEventListener('click', async () => {
    const ok = await copy(message());
    if (ok) toast(t('toast.copied'));
    window.open(`https://ig.me/m/${SITE.instagram}`, '_blank', 'noopener');
  });
  fillPayee();
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy]');
    if (!b || !b.dataset.copy) return;
    if (!(await copy(b.dataset.copy))) return;
    toast(t(b.dataset.toast || 'toast.copy'));
    b.classList.add('ok'); clearTimeout(b._t); b._t = setTimeout(() => b.classList.remove('ok'), 1600);
  });
  $('#claim').addEventListener('close', () => { wantTitle = false; renderPackage(); });
  $('#claim .close').addEventListener('click', () => $('#claim').close());
  $('#claim-form').addEventListener('submit', (e) => e.preventDefault());
  // keyboard: arrows step through the selected spot's model in price order, Esc clears
  let studioInView = false;
  // in view = crossing the middle of the screen (a share of the studio's own height breaks as the rate card grows)
  new IntersectionObserver((en) => { studioInView = en[0].isIntersecting; }, { rootMargin: '-35% 0px -35% 0px' }).observe($('.studio'));
  document.addEventListener('keydown', (e) => {
    if (!selected || !studioInView || /input|textarea|select/i.test(document.activeElement?.tagName || '') || $('#claim').open) return;
    if (document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('.studio')) return;
    // the selected spot's model, not `item`: while the helmet builds, the suit is still on stage
    const order = ofItem(itemOf(byId(selected))).sort((a, b) => b.price - a.price || a.n - b.n);
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
  });
}

export const adspaceReduce = reduce;
