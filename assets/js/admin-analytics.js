// /admin/analytics/ (SPEC 5): login, state (filters and tab in location.hash), tab life cycle, polling of «Agora no
// site», the internal switch. The admin key lives in sessionStorage only (this tab), and is sent to the analytics Worker
// only. On a successful login this browser is marked internal (localStorage gc.internal = '1', SPEC D3), so the owner's
// own visits to gocarmo.com stay out of the numbers.
import { SITE } from './data.js';
import { createApi, MSG } from './admin-analytics-api.js';
import { H, fmt, redrawAll, resetTokens, forget, emptyState, tip } from './admin-analytics-charts.js';
import { TABS, renderNow } from './admin-analytics-panels.js';
import { createHeat } from './admin-analytics-heat.js';
import { setSpots, selName, setMontra } from './admin-analytics-labels.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const KEY = 'gc.stats.key', THEME = 'gc.stats.theme', INTERNAL = 'gc.internal';
const store = (s) => ({
  get: (k) => { try { return s().getItem(k); } catch (_) { return null; } },
  set: (k, v) => { try { s().setItem(k, v); return true; } catch (_) { return false; } },
  del: (k) => { try { s().removeItem(k); } catch (_) {} },
});
const ss = store(() => sessionStorage), ls = store(() => localStorage);

// ---------- theme (automático → claro → escuro), on the admin's own device ----------
const THEMES = ['auto', 'light', 'dark'], THEME_LABEL = { auto: 'automático', light: 'claro', dark: 'escuro' };
function applyTheme(t) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t !== 'light' && !matchMedia('(prefers-color-scheme: light)').matches);
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#0b0b0c' : '#f2f1ec';
  const b = $('#theme');
  if (b) { b.setAttribute('aria-label', `Tema: ${THEME_LABEL[t]}`); b.title = `Tema: ${THEME_LABEL[t]}`; }
  resetTokens();
}
let theme = ls.get(THEME) || 'auto';
if (!THEMES.includes(theme)) theme = 'auto';
applyTheme(theme);

// ---------- state in the hash ----------
const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
const TAB_IDS = ['resumo', 'publico', 'pagina', 'calor', 'estudio', 'reservas', 'contactos', 'montra', 'qualidade', 'opiniao', 'dados'];
function readHash() {
  const q = new URLSearchParams(location.hash.slice(1));
  return {
    t: TAB_IDS.includes(q.get('t')) ? q.get('t') : 'resumo',
    p: ['24h', '7d', '30d', '90d', 'custom'].includes(q.get('p')) ? q.get('p') : null,
    from: q.get('from') || '', to: q.get('to') || '',
    dev: ['all', 'mobile', 'tablet', 'desktop'].includes(q.get('dev')) ? q.get('dev') : 'all',
    int: q.get('int') === '1' ? 1 : 0,
    cmp: q.get('cmp') === '0' ? 0 : 1,
    hm: { vw: ['m', 't', 'd', 'w', 'all'].includes(q.get('hw')) ? q.get('hw') : '', layer: ['clicks', 'dead', 'rage', 'err', 'scroll', 'attention'].includes(q.get('hl')) ? q.get('hl') : 'clicks', under: q.get('hu') !== '0' },
    api: local ? q.get('api') || '' : '',
  };
}
const state = readHash();
function saveHash() {
  const q = new URLSearchParams();
  q.set('t', state.t); q.set('p', state.p || '7d');
  if (state.p === 'custom') { q.set('from', state.from); q.set('to', state.to); }
  q.set('dev', state.dev); q.set('int', String(state.int)); q.set('cmp', String(state.cmp));
  if (state.t === 'calor' || state.hm.vw) { if (state.hm.vw) q.set('hw', state.hm.vw); q.set('hl', state.hm.layer); if (!state.hm.under) q.set('hu', '0'); }
  if (state.api) q.set('api', state.api);
  history.replaceState(null, '', `#${q.toString()}`);
}
const params = () => ({ p: state.p || '7d', ...(state.p === 'custom' ? { from: state.from, to: state.to } : {}), dev: state.dev, int: state.int, cmp: state.cmp });
const paramsKey = () => JSON.stringify(params());
// privacy 2.7: a period with today in it («24 h», or a custom one up to today) only on «Resumo» (totals) and «Dados»
const TODAY_OK = new Set(['resumo', 'dados']);
const withToday = () => state.p === '24h' || (state.p === 'custom' && !!ctx.today && state.to >= ctx.today);

// ---------- session ----------
const base = (local && state.api) || (SITE.stats && SITE.stats.url) || '';
let api = null, ping = null;
const loaded = {};
const isInternal = () => ls.get(INTERNAL) === '1';
function setInternal(on) { if (on) ls.set(INTERNAL, '1'); else ls.del(INTERNAL); paintDevice(); if (ctx.onInternal) ctx.onInternal(); }

function showLogin(msg) {
  stopPolling();
  $('#app').hidden = true;
  $('#login').hidden = false;
  const off = !base;
  $('#login-off').hidden = !off;
  $('#login-form').hidden = off;
  $('#login-note').hidden = off;
  $('#login-err').textContent = msg || '';
  if (!off) setTimeout(() => $('#key').focus(), 50);
}
function logout(msg) {
  ss.del(KEY);
  api = null;
  for (const k of Object.keys(loaded)) delete loaded[k];
  for (const p of $$('.ga-panel')) { forget(p); p.replaceChildren(); }
  heat = null;
  showLogin(msg);
}
function makeApi(key) {
  return createApi({ base, key: () => key, onLost: () => { if (api) logout(MSG.lost); } });
}
async function tryLogin(key, fromForm) {
  const btn = $('#login-go');
  btn.disabled = true;
  $('#login-err').textContent = '';
  const a = makeApi(key);
  try {
    // a wrong key must not trigger the «session ended» path
    const res = await fetch(`${base.replace(/\/+$/, '')}/admin/v1/ping`, { headers: { Authorization: `Bearer ${key}` }, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    if (res.status === 401) { ss.del(KEY); showLogin(fromForm ? MSG.key : MSG.lost); return; }
    if (!res.ok) throw new Error('http');
    ping = await res.json();
    ss.set(KEY, key);
    ls.set(INTERNAL, '1');        // D3: the owner's browser does not count
    api = a;
    startApp();
  } catch (_) {
    showLogin(MSG.net);
  } finally { btn.disabled = false; }
}

// ---------- the app ----------
let heat = null;
const ctx = {
  state, get api() { return api; }, params, spots: null, prevName: '', today: '', polling: false, nowBox: null,
  isInternal, setInternal,
  toast, invalidate: () => { if (api) api.clear(); for (const k of Object.keys(loaded)) delete loaded[k]; },
  retryNow: () => pollNow(true), resumePolling: () => { lastInput = Date.now(); startPolling(); },
  pageText: (k) => pageText(k),
  selName: (sel) => selName(sel, pageDoc, pageText),
  withToday: () => withToday(),
  // a whole custom period (the «Montra» month buttons)
  setPeriod: (from, to) => {
    state.p = 'custom'; state.from = from; state.to = to;
    for (const r of $$('#period input')) r.checked = r.value === 'custom';
    $('#custom').hidden = false;
    $('#c-from').value = from; $('#c-to').value = to;
    $('#c-err').textContent = '';
    refilter();
  },
};

function startApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  ctx.today = ping && ping.today ? ping.today : '';
  if (!state.p) state.p = ping && ping.complete < 2 ? '24h' : '7d';
  for (const r of $$('#period input')) r.checked = r.value === state.p;
  $('#f-dev').value = state.dev;
  $('#f-int').checked = !!state.int;
  $('#f-cmp').checked = !!state.cmp;
  $('#custom').hidden = state.p !== 'custom';
  if (ctx.today) { $('#c-from').max = ctx.today; $('#c-to').max = ctx.today; }
  if (state.p === 'custom') { $('#c-from').value = state.from; $('#c-to').value = state.to; }
  paintDevice();
  loadPage();
  selectTab(state.t, false);
}

function selectTab(name, focus) {
  state.t = name;
  saveHash();
  for (const b of $$('#tabs [role="tab"]')) {
    const on = b.dataset.tab === name;
    b.setAttribute('aria-selected', String(on));
    b.tabIndex = on ? 0 : -1;
    if (on && focus) b.focus();
    if (on) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  for (const p of $$('.ga-panel')) p.hidden = p.id !== `p-${name}`;
  paintPeriod();
  tip.hide();
  if (name === 'resumo') startPolling(); else stopPolling();
  loadTab(name);
}

async function spots() {
  if (ctx.spots) return ctx.spots;
  try {
    const j = await (await fetch('../../data/spots.json', { cache: 'no-cache' })).json();
    const m = {};
    for (const s of j.spots || []) m[s.id] = { name: (s.pt && s.pt.name) || s.id, price: s.price, status: s.status };
    if (j.title) m.title = { name: 'Fato completo', price: j.title.price, status: j.title.status };
    ctx.spots = m;
  } catch (_) { ctx.spots = {}; }
  setSpots(ctx.spots);
  return ctx.spots;
}

// the showcase's brand and product names (data/montra.json, same origin): read again with each «Montra» load, since the
// Patrocínios page may have changed it; the count of products, or null when it could not be read
async function montraNames() {
  try {
    const r = await fetch('../../data/montra.json', { cache: 'no-cache' });
    return setMontra(r.ok ? await r.json() : null);
  } catch (_) { setMontra(null); return null; }
}

function rangeText(env) {
  if (!env || !env.range) return '';
  const r = env.range;
  const bits = [];
  if (r.unit === 'hour') {
    const at = new Intl.DateTimeFormat('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(env.generated || Date.now()));
    bits.push(`Últimas 24 h, até às ${at}`);
  } else bits.push(`${fmt.range(r.from, r.to)}${r.partial ? ' (hoje ainda a contar)' : ''}`);
  if (env.prev) bits.push(`comparado com ${r.unit === 'hour' ? 'as 24 h antes' : fmt.range(env.prev.from, env.prev.to, env.prev.to.slice(0, 4) !== r.to.slice(0, 4))}`);
  else if (env.prevCut) bits.push('sem comparação: o contador ainda não tinha dados de todo o período anterior');
  if (state.dev !== 'all') bits.push({ mobile: 'só telemóveis', tablet: 'só tablets', desktop: 'só computadores' }[state.dev]);
  if (state.int) bits.push('com as visitas internas');
  return bits.join(' · ');
}
function prevNameOf(env) {
  if (!env || !env.prev) return null;
  return env.range.unit === 'hour' ? 'as 24 h antes' : fmt.range(env.prev.from, env.prev.to, false);
}

// «24 h» is greyed out on the tabs that take whole days only
function paintPeriod() {
  const r = $('#period input[value="24h"]');
  if (!r) return;
  const ok = TODAY_OK.has(state.t);
  r.disabled = !ok;
  r.closest('label').title = ok ? '' : 'Só no Resumo: aqui contam dias completos';
}
function todayPanel(panel) {
  forget(panel);
  panel.replaceChildren();
  const box = emptyState(panel, 'Este separador só mostra dias completos: com o dia de hoje no período, duas leituras com minutos de diferença ligavam uma visita ao sítio de onde veio ou ao que fez. O «Resumo» mostra os totais de hoje.');
  const b = H('button', 'btn sm gold', 'Ver os últimos 7 dias', box);
  b.type = 'button';
  b.addEventListener('click', () => {
    state.p = '7d';
    for (const r of $$('#period input')) r.checked = r.value === '7d';
    $('#custom').hidden = true;
    refilter();
  });
}

async function loadTab(name, force) {
  if (!api) return;
  const panel = $(`#p-${name}`);
  if (!TODAY_OK.has(name) && withToday()) {
    $('#range').textContent = state.p === '24h' ? 'Últimas 24 h' : fmt.range(state.from, state.to);
    if (name === 'calor' && heat) { heat.close(); heat = null; }
    todayPanel(panel);
    delete loaded[name];
    return;
  }
  if (name === 'calor') {
    if (!heat) heat = createHeat({ api, params, hm: state.hm, save: saveHash, pageText: (k) => pageText(k), onError: () => {},
      audience: async () => (await api.get('audience', params())).vw });
    try { await heat.open(panel); } catch (_) {}
    return;
  }
  const tab = TABS[name];
  const key = paramsKey();
  if (!force && loaded[name] === key) return;
  panel.classList.add('busy');
  panel.setAttribute('aria-busy', 'true');
  if (!panel.firstChild) H('p', 'ga-fine', 'A carregar…', panel);
  try {
    const d = {};
    const jobs = tab.endpoints.map(async (ep) => { d[ep] = await api.get(ep, params(), { fresh: force }); });
    if (tab.live) jobs.push(api.get('now', { int: state.int }, { fresh: true }).then((v) => { d.now = v; }, () => { d.now = null; }));
    if (tab.spots) jobs.push(spots());
    if (tab.montra) jobs.push(montraNames().then((n) => { d.names = n; }));
    await Promise.all(jobs);
    if (key !== paramsKey() || !api) return;
    const env = d[tab.endpoints[0]];
    ctx.prevName = prevNameOf(env);
    $('#range').textContent = rangeText(env);
    forget(panel);
    panel.replaceChildren();
    tab.render(panel, d, ctx);
    loaded[name] = key;
  } catch (e) {
    if (e.code === 'chave' || !api) return;
    forget(panel);
    panel.replaceChildren();
    emptyState(panel, `${MSG.panel} ${e.text || ''}`.trim(), () => loadTab(name, true));
  } finally {
    panel.classList.remove('busy');
    panel.removeAttribute('aria-busy');
  }
}

function refilter() {
  saveHash();
  if (api) api.clear();
  for (const k of Object.keys(loaded)) delete loaded[k];
  if (state.t === 'calor') loadTab('calor');
  else { if (heat) heat.refresh(); loadTab(state.t); }
}

// ---------- «Agora no site»: every 30 s while the tab is open and visible; stops after 30 min without input ----------
let pollTimer = 0, lastInput = Date.now();
const IDLE = 30 * 60 * 1000;
for (const t of ['pointerdown', 'keydown', 'scroll', 'wheel']) addEventListener(t, () => { lastInput = Date.now(); }, { passive: true, capture: true });
function startPolling() {
  clearInterval(pollTimer);
  if (!api || state.t !== 'resumo') return;
  ctx.polling = true;
  pollTimer = setInterval(() => pollNow(false), 30000);
}
function stopPolling() { clearInterval(pollTimer); pollTimer = 0; }
async function pollNow(force) {
  if (!api || state.t !== 'resumo' || (!force && document.visibilityState !== 'visible')) return;
  if (!force && Date.now() - lastInput > IDLE) {
    stopPolling();
    ctx.polling = false;
    if (ctx.nowBox && ctx.nowBox.isConnected && ctx.lastNow) renderNow(ctx.nowBox, ctx.lastNow, ctx);
    return;
  }
  try {
    const now = await api.get('now', { int: state.int }, { fresh: true });
    ctx.lastNow = now;
    ctx.polling = !!pollTimer;
    if (ctx.nowBox && ctx.nowBox.isConnected) renderNow(ctx.nowBox, now, ctx);
  } catch (_) {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.t === 'resumo' && pollTimer) pollNow(false); });

// ---------- the page's own Portuguese texts, for click labels that are i18n keys (SPEC 5.7) ----------
let pageDoc = null;
async function loadPage() {
  try {
    // only the texts are needed: drop scripts, styles and style="" first, or this page's CSP reports each one
    const html = (await (await fetch('../../', { cache: 'no-cache' })).text())
      .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/\sstyle\s*=\s*("[^"]*"|'[^']*')/gi, '');
    pageDoc = new DOMParser().parseFromString(html, 'text/html');
    if (heat && state.t === 'calor') heat.repaint();
  } catch (_) {}
}
function pageText(k) {
  if (!pageDoc) return '';
  let n = null;
  try { n = pageDoc.querySelector(`[data-i18n="${CSS.escape(k)}"]`); } catch (_) {}
  if (n) return n.textContent.replace(/\s+/g, ' ').trim().slice(0, 60);
  // keys that name an attribute (data-i18n-attr="aria-label:a.close"): that attribute's Portuguese text
  try {
    for (const el of pageDoc.querySelectorAll('[data-i18n-attr]')) {
      for (const pair of el.getAttribute('data-i18n-attr').split(/[;,]\s*/)) {
        const [attr, key] = pair.split(':');
        if (key === k && el.getAttribute(attr)) return el.getAttribute(attr).trim().slice(0, 60);
      }
    }
  } catch (_) {}
  return '';
}

// ---------- device chip ----------
function paintDevice() {
  const on = isInternal();
  $('#device').classList.toggle('int', on);
  $('#dev-state').textContent = on ? 'Este aparelho não conta (interno)' : 'Este aparelho conta como visitante';
  $('#dev-toggle').textContent = on ? 'Voltar a contar este aparelho' : 'Marcar este aparelho como interno';
}

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

// ---------- wiring ----------
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const k = $('#key').value.trim();
  if (!k) { $('#login-err').textContent = 'Escreve a chave.'; return; }
  tryLogin(k, true);
});
$('#logout').addEventListener('click', () => logout(''));
$('#theme').addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  if (theme === 'auto') ls.del(THEME); else ls.set(THEME, theme);
  applyTheme(theme);
  redrawAll();
  if (heat) heat.repaint();
  toast(`Tema ${THEME_LABEL[theme]}.`);
});
matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => { if (theme === 'auto') { applyTheme('auto'); redrawAll(); } });
$('#dev-toggle').addEventListener('click', () => setInternal(!isInternal()));

const tabs = $('#tabs');
tabs.addEventListener('click', (e) => { const b = e.target.closest('[role="tab"]'); if (b) selectTab(b.dataset.tab, false); });
tabs.addEventListener('keydown', (e) => {
  const list = $$('[role="tab"]', tabs);
  const i = list.indexOf(document.activeElement);
  if (i < 0) return;
  let j = null;
  if (e.key === 'ArrowRight') j = (i + 1) % list.length;
  else if (e.key === 'ArrowLeft') j = (i - 1 + list.length) % list.length;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = list.length - 1;
  if (j === null) return;
  e.preventDefault();
  selectTab(list[j].dataset.tab, true);
});

for (const r of $$('#period input')) {
  r.addEventListener('change', () => {
    if (r.value === 'custom') {
      $('#custom').hidden = false;
      const to = ctx.today || new Date().toISOString().slice(0, 10);
      if (!$('#c-to').value) $('#c-to').value = to;
      if (!$('#c-from').value) { const d = new Date(`${to}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 13); $('#c-from').value = d.toISOString().slice(0, 10); }
      $('#c-from').focus();
      return;
    }
    $('#custom').hidden = true;
    state.p = r.value;
    refilter();
  });
}
$('#custom').addEventListener('submit', (e) => {
  e.preventDefault();
  const from = $('#c-from').value, to = $('#c-to').value;
  const err = $('#c-err');
  err.textContent = '';
  const today = ctx.today || '9999-12-31';
  const min = (() => { const d = new Date(`${today}T00:00:00Z`); d.setUTCDate(d.getUTCDate() - 761); return d.toISOString().slice(0, 10); })();
  if (!from || !to || from > to || to > today || from < min) { err.textContent = MSG.period; return; }
  state.p = 'custom'; state.from = from; state.to = to;
  refilter();
});
$('#f-dev').addEventListener('change', (e) => { state.dev = e.target.value; refilter(); });
$('#f-int').addEventListener('change', (e) => { state.int = e.target.checked ? 1 : 0; refilter(); });
$('#f-cmp').addEventListener('change', (e) => { state.cmp = e.target.checked ? 1 : 0; refilter(); });
addEventListener('online', () => { $('#offline').hidden = true; });
addEventListener('offline', () => { $('#offline').hidden = false; });
// fonts change text widths: draw again once they are in
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => redrawAll());

// ---------- start ----------
if (!base) showLogin('');
else {
  const k = ss.get(KEY);
  if (k) tryLogin(k, false); else showLogin('');
}
