// Sponsor platform: rate card, spot card, package, claim flow, logo try-on and the 3D stage.
import { t, pick, money, onLang, getLang } from './i18n.js';
import { SITE } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const AREAS = ['front', 'sides', 'shoulders', 'legs', 'back'];
const STORE = 'gc.package.2027';
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let DATA = null, SPOTS = [], suit = null, SuitClass = null;
let selected = null, basket = new Set(), sortMode = 'area', onlyAvail = false, wantTitle = false;
let tourCtl = null, logoFile = null, interacted = false;

const byId = (id) => SPOTS.find((s) => s.id === id);
const tierOf = (s) => DATA.tiers.find((x) => s.price >= x.min) || DATA.tiers[DATA.tiers.length - 1];
const available = () => SPOTS.filter((s) => s.status === 'available');
const toast = (msg) => { const el = $('#toast'); el.textContent = msg; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 3200); };

export async function initAdspace({ onSuitReady } = {}) {
  try {
    const res = await fetch('data/spots.json', { cache: 'no-cache' });
    DATA = await res.json();
  } catch (e) {
    $('#rc-body').textContent = 'Não foi possível carregar a tabela. Contacta gcarmo.media@gmail.com.';
    return;
  }
  SPOTS = DATA.spots.filter((s) => ['available', 'reserved', 'sold'].includes(s.status));
  try { basket = new Set(JSON.parse(localStorage.getItem(STORE) || '[]').filter((id) => byId(id)?.status === 'available')); } catch (_) {}
  readHash();
  renderStats(); renderLegend(); renderRateCard(); renderCard(); renderPackage();
  bindUI();
  onLang(() => { renderStats(); renderLegend(); renderRateCard(); renderCard(); renderPackage(); if (suit) { suit.labels = suitLabels(); suit.money = money; suit.drawOverlay(); suit.kick(); } });
  // the 3D stage loads when the section approaches the viewport
  const stage = $('#stage');
  const io = new IntersectionObserver(async (en) => {
    if (!en[0].isIntersecting) return;
    io.disconnect();
    await mountSuit();
    onSuitReady && onSuitReady(suit);
  }, { rootMargin: '600px 0px' });
  io.observe(stage);
}

function suitLabels() { return { sold: t('lbl.sold'), reserved: t('lbl.reserved'), top: t('lbl.top') }; }

async function mountSuit() {
  const stage = $('#stage');
  try {
    const mod = await import('./suit.js');
    if (!mod.webglAvailable()) throw new Error('webgl');
    SuitClass = mod.Suit;
    suit = new mod.Suit(stage, {
      spots: SPOTS, money, labels: suitLabels(),
      onSelect: (id) => { stopTour(); select(id, { from3d: true }); },
      onHover: () => {},
    });
    suit.setBasket([...basket]);
    stage.addEventListener('suit:interact', () => { interacted = true; stopTour(); $('#btn-rotate').setAttribute('aria-pressed', 'false'); });
    stage.addEventListener('suit:frame', placeCallout);
    $('#stage-loading').remove();
    if (selected) suit.select(selected, { focus: true });
  } catch (e) {
    $('#stage-loading').textContent = '';
    const fb = document.createElement('div');
    fb.className = 'stage-fallback';
    fb.textContent = getLang() === 'en' ? 'The 3D view is not available on this device. The rate card below has every spot.' : 'A vista 3D não está disponível neste dispositivo. A tabela tem todos os espaços.';
    stage.appendChild(fb);
    $$('.stage-ui, .stage-foot', stage).forEach((n) => n.remove());
  }
}

export function getSuit() { return suit; }
export function userHasInteracted() { return interacted || !!selected; }

// ---------- stats ----------
function renderStats() {
  const av = available();
  const prices = SPOTS.map((s) => s.price);
  $('#avail-n').textContent = av.length;
  $('#avail-t').textContent = SPOTS.length;
  $('#avail-pct').textContent = `${Math.round((av.length / SPOTS.length) * 100)}%`;
  $('#avail-bar').style.width = `${(av.length / SPOTS.length) * 100}%`;
  $('#st-n').textContent = SPOTS.length;
  $('#st-from').textContent = money(Math.min(...prices));
  const top = av.slice().sort((a, b) => b.price - a.price)[0];
  $('#st-top').textContent = top ? money(top.price) : '—';
  $('#st-title').textContent = money(DATA.title.price);
  $('#tp-price').textContent = money(DATA.title.price);
  const tpBtn = $('#tp-btn');
  tpBtn.disabled = DATA.title.status !== 'available' || av.length !== SPOTS.length;
}

function renderLegend() {
  const host = $('#tiers-legend');
  host.textContent = '';
  for (const tr of DATA.tiers) {
    const inTier = SPOTS.filter((s) => tierOf(s).key === tr.key);
    if (!inTier.length) continue;
    const lo = Math.min(...inTier.map((s) => s.price)), hi = Math.max(...inTier.map((s) => s.price));
    const span = document.createElement('span');
    const i = document.createElement('i'); i.className = `t-${tr.key}`;
    span.append(i, `${pick(tr)} · ${lo === hi ? money(lo) : `${money(lo)}–${money(hi)}`} · ${inTier.length}`);
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
  li.className = `rc-row${s.id === selected ? ' sel' : ''}${s.status === 'sold' ? ' sold' : ''}`;
  li.dataset.id = s.id;
  const dot = document.createElement('i'); dot.className = `row-dot t-${tierOf(s).key}`;
  const n = document.createElement('span'); n.className = 'n'; n.textContent = String(s.n).padStart(2, '0');
  const nm = document.createElement('button'); nm.type = 'button'; nm.className = 'nm'; nm.style.cssText = 'all:unset;cursor:pointer;font:600 15px/1.2 var(--sans)';
  nm.textContent = pick(s).name;
  const small = document.createElement('small'); small.textContent = `${s.w} × ${s.h} cm`; small.style.cssText = 'display:block;font:400 12px/1.3 var(--sans);color:var(--muted);margin-top:3px';
  nm.appendChild(small);
  nm.setAttribute('aria-label', `${pick(s).name}, ${money(s.price)}, ${t(`st.${s.status}`)}`);
  nm.addEventListener('click', () => { stopTour(); select(s.id); });
  const pr = document.createElement('span'); pr.className = 'pr'; pr.textContent = money(s.price);
  const st = document.createElement('small'); st.textContent = t(`st.${s.status}`); pr.appendChild(st);
  const add = document.createElement('button'); add.type = 'button'; add.className = 'add';
  add.textContent = basket.has(s.id) ? '✓' : '+';
  add.setAttribute('aria-pressed', String(basket.has(s.id)));
  add.setAttribute('aria-label', `${t('spot.add')}: ${pick(s).name}`);
  add.disabled = s.status !== 'available';
  add.addEventListener('click', () => toggleBasket(s.id));
  li.append(dot, n, nm, pr, add);
  return li;
}

// ---------- selection + card ----------
function select(id, { from3d = false, focus = true } = {}) {
  selected = id && byId(id) ? id : null;
  if (suit && !from3d) suit.select(selected, { focus });
  renderCard();
  $$('.rc-row').forEach((r) => r.classList.toggle('sel', r.dataset.id === selected));
  $$('.chapter').forEach((c) => c.classList.toggle('on', c.dataset.focus === selected));
  const tryon = $('#tryon');
  if (tryon.classList.contains('on') && logoFile && selected) applyLogo();
  if (!selected) $('#callout').classList.remove('on');
}

function renderCard() {
  const s = selected && byId(selected);
  $('#spot-empty').hidden = !!s;
  $('#spot-detail').hidden = !s;
  if (!s) return;
  const tr = tierOf(s);
  const topId = available().slice().sort((a, b) => b.price - a.price)[0]?.id;
  $('#sd-id').textContent = `${String(s.n).padStart(2, '0')} · ${t(`z.${s.area}`).toUpperCase()}`;
  $('#sd-name').textContent = pick(s).name;
  $('#sd-price').textContent = money(s.price);
  $('#sd-tier').textContent = `${pick(tr)} · ${t('season.tier')} ${DATA.season}`;
  $('#sd-size').textContent = `${s.w} × ${s.h} cm`;
  $('#sd-status').textContent = t(`st.${s.status}`);
  $('#sd-status').className = `badge${s.status === 'available' ? '' : ' dim'}`;
  $('#sd-top').hidden = s.id !== topId;
  $('#sd-pitch').textContent = pick(s).pitch;
  const vis = $('#sd-vis'); vis.textContent = '';
  for (const k of ['bike', 'run', 'finish', 'social']) {
    const d = document.createElement('div');
    d.textContent = t(`vis.${k}`);
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
  if (!suit || !selected) { co.classList.remove('on'); return; }
  const s = byId(selected), p = suit.project(selected);
  if (!p) return;
  co.style.left = `${p.x}px`; co.style.top = `${p.y}px`;
  co.classList.toggle('on', p.visible);
  co.classList.toggle('top', s.id === available().slice().sort((a, b) => b.price - a.price)[0]?.id);
  $('#co-n').textContent = String(s.n).padStart(2, '0');
  $('#co-name').textContent = pick(s).name;
  $('#co-price').textContent = s.status === 'available' ? money(s.price) : t(`st.${s.status}`);
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
  if (suit) suit.setBasket([...basket]);
}
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
  if (!on) return;
  $('#pk-total').textContent = wantTitle ? `${t('msg.title')} · ${money(net)}` : `${t('pk.spots', list.length)} · ${money(net)}`;
  $('#pk-list').textContent = wantTitle ? '' : `${disc ? `${t('pk.disc', Math.round(disc * 100))} (${money(gross)}) · ` : ''}${list.map((s) => pick(s).name).join(', ')}`;
}

function packageLink() {
  const base = `${location.origin}${location.pathname}`;
  return wantTitle ? `${base}#fato` : `${base}#pacote=${[...basket].join(',')}`;
}

function message() {
  const { list, net, gross, disc } = totals();
  const brand = $('#cl-brand').value.trim(), name = $('#cl-name').value.trim(), extra = $('#cl-msg').value.trim();
  const lines = [t('msg.hi'), ''];
  if (wantTitle) lines.push(`${t('msg.title')}: ${money(net)}`);
  else {
    lines.push(`${t('msg.spots')}:`);
    for (const s of list) lines.push(`• ${String(s.n).padStart(2, '0')} ${pick(s).name} (${s.w}×${s.h} cm) · ${money(s.price)}`);
    lines.push(`${t('msg.total')}: ${money(net)}${disc ? ` (${money(gross)} −${Math.round(disc * 100)}%)` : ''}`);
  }
  if (brand) lines.push(`${t('msg.brand')}: ${brand}`);
  if (name) lines.push(`${t('msg.name')}: ${name}`);
  if (extra) lines.push('', extra);
  lines.push('', packageLink());
  return lines.join('\n');
}

function openClaim() {
  const { list, net } = totals();
  const label = wantTitle ? t('msg.title') : t('pk.spots', list.length);
  $('#cl-sum').innerHTML = t('cl.sum', escapeHtml(label), escapeHtml(money(net)));
  const dlg = $('#claim');
  if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
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
function startTour() {
  if (!suit) return;
  stopTour();
  tourCtl = new AbortController();
  const ids = available().slice().sort((a, b) => b.price - a.price || a.n - b.n).map((s) => s.id);
  $('#btn-tour').classList.add('on');
  suit.tour(ids, (id) => select(id, { from3d: true }), tourCtl.signal).finally(() => $('#btn-tour').classList.remove('on'));
}
function stopTour() { if (tourCtl) { tourCtl.abort(); tourCtl = null; $('#btn-tour')?.classList.remove('on'); } }

// ---------- logo try-on ----------
async function applyLogo() {
  if (!suit || !selected || !logoFile) return;
  try {
    const canvas = await SuitClass.prepareLogo(logoFile, { removeWhite: $('#logo-bg').checked, invert: $('#logo-inv').checked });
    suit.logos.clear();
    suit.setLogo(selected, canvas);
    $('#logo-dl').disabled = false; $('#logo-rm').disabled = false;
  } catch (_) { toast(t('toast.bad')); }
}

async function downloadMockup() {
  if (!suit || !selected) return;
  const s = byId(selected);
  const blob = await suit.snapshot({ title: `${pick(s).name} · ${money(s.price)}`, subtitle: t('mock.sub', String(s.n).padStart(2, '0'), `${s.w}×${s.h} cm`) });
  if (!blob) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `goncalo-carmo-fato-${s.id}-mockup.png`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ---------- deep links ----------
function readHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (h.startsWith('pacote=')) {
    const ids = h.slice(7).split(',').filter((id) => byId(id)?.status === 'available');
    if (ids.length) { basket = new Set(ids); try { localStorage.setItem(STORE, JSON.stringify(ids)); } catch (_) {} }
  } else if (h.startsWith('fato/')) {
    const id = h.slice(5);
    if (byId(id)) selected = id;
  }
}

// ---------- wiring ----------
function bindUI() {
  $$('[data-view]').forEach((b) => b.addEventListener('click', () => {
    stopTour(); interacted = true;
    $$('[data-view]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    select(null);
    suit && suit.view(b.dataset.view);
    $('#btn-rotate').setAttribute('aria-pressed', 'false');
  }));
  $('#btn-rotate').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (on) { select(null); stopTour(); }
    suit && suit.setAuto(on);
  });
  $('#btn-spots').addEventListener('click', (e) => {
    const on = e.currentTarget.getAttribute('aria-pressed') !== 'true';
    e.currentTarget.setAttribute('aria-pressed', String(on));
    if (!on) select(null);
    suit && suit.setShowSpots(on);
  });
  $('#zoom-in').addEventListener('click', () => suit && suit.zoom(1));
  $('#zoom-out').addEventListener('click', () => suit && suit.zoom(-1));
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
    const url = `${location.origin}${location.pathname}#fato/${s.id}`;
    if (navigator.share) { try { await navigator.share({ title: t('share.title'), text: `${pick(s).name} · ${money(s.price)}`, url }); return; } catch (_) { /* cancelled */ } }
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
  $('#logo-rm').addEventListener('click', () => { logoFile = null; $('#logo-file').value = ''; if (suit) { suit.logos.clear(); suit.setLogo(selected, null); } $('#logo-dl').disabled = true; $('#logo-rm').disabled = true; });
  $('#logo-dl').addEventListener('click', downloadMockup);
  $('#tp-btn').addEventListener('click', () => { wantTitle = true; renderPackage(); openClaim(); });
  $('#pk-clear').addEventListener('click', () => { wantTitle = false; basket.clear(); saveBasket(); });
  $('#pk-go').addEventListener('click', openClaim);
  $('#cl-wa').addEventListener('click', () => window.open(`https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(message())}`, '_blank', 'noopener'));
  $('#cl-mail').addEventListener('click', () => { location.href = `mailto:${SITE.email}?subject=${encodeURIComponent(t('msg.subject'))}&body=${encodeURIComponent(message())}`; });
  $('#cl-ig').addEventListener('click', async () => {
    const ok = await copy(message());
    if (ok) toast(t('toast.copied'));
    window.open(`https://ig.me/m/${SITE.instagram}`, '_blank', 'noopener');
  });
  $('#claim').addEventListener('close', () => { if (wantTitle && !basket.size) { wantTitle = false; renderPackage(); } });
  // keyboard: arrows step through spots in price order, Esc clears
  document.addEventListener('keydown', (e) => {
    if (!selected || /input|textarea|select/i.test(document.activeElement?.tagName || '') || $('#claim').open) return;
    const order = SPOTS.slice().sort((a, b) => b.price - a.price || a.n - b.n);
    const i = order.findIndex((s) => s.id === selected);
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); select(order[(i + 1) % order.length].id); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); select(order[(i - 1 + order.length) % order.length].id); }
    else if (e.key === 'Escape') { select(null); suit && suit.home(); }
  });
  window.addEventListener('hashchange', () => { readHash(); renderPackage(); if (suit) suit.setBasket([...basket]); if (selected) select(selected); });
}

export const adspaceReduce = reduce;
