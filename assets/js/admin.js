// Admin page (/admin/): reserve, sell and free the suit and helmet spots while the site is live.
// Each action is ONE commit on gh-pages, made with the GitHub Git Data API and the owner's own token (kept in this
// browser only). The page then waits until gocarmo.com serves the new data/spots.json. The rules (what each action
// writes, and when it is allowed) live in admin-core.js, which is tested against the issue-form bot.
import * as C from './admin-core.js';
import './internal.js';   // this browser is the owner's: the public pages never load Google Analytics in it

const API = `https://api.github.com/repos/${C.REPO}`;
const KEY = 'gc.admin.token', FILTER_KEY = 'gc.admin.filter';
const SITE_ROOT = new URL('../', location.href);   // the page lives at /admin/; logo paths start at the site root
const POLL_EVERY = 5000, POLL_FOR = 180000;
const RASTER_SIDES = [1200, 800, 500];              // an SVG logo becomes a PNG this wide (longest side), if it fits 3 MB
const LIVE_FIELDS = ['status', 'brand', 'url', 'until', 'logo'];

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const hhmm = (d) => `${C.pad2(d.getHours())}:${C.pad2(d.getMinutes())}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const kb = (n) => (n < 1048576 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1048576).toFixed(1).replace('.', ',')} MB`);

let token = null;          // in memory; storage only holds it between visits
let base = null;           // { head, text, data, readAt }: data/spots.json at the head of gh-pages
let sel = new Set();
let filter = 'all';
let busy = false;          // a save is running (one at a time)
let sheet = null;          // the open action: { action, ids, snap, logo, untilTouched }
let lastRun = null, hiddenAt = 0, gl = null;
let stash = null;          // the sheet as it was when the token stopped working mid-save; it comes back after signing in

class GhError extends Error { constructor(status, msg, rate = null) { super(msg || `GitHub ${status}`); this.status = status; this.rate = rate; } }
class UiError extends Error { constructor(msg, opts = {}) { super(msg); Object.assign(this, opts); } }
const transient = (e) => e instanceof GhError && (e.status === 0 || e.status >= 500);

// ---------- token storage ("Lembrar neste telemóvel" = localStorage, otherwise this tab only) ----------
const stores = () => ['sessionStorage', 'localStorage'].map((k) => { try { return window[k]; } catch (_) { return null; } }).filter(Boolean);
function readToken() { for (const s of stores()) { try { const v = s.getItem(KEY); if (v) return v; } catch (_) {} } return null; }
function forgetToken() { for (const s of stores()) { try { s.removeItem(KEY); } catch (_) {} } }
function keepToken(t, remember) { forgetToken(); try { (remember ? localStorage : sessionStorage).setItem(KEY, t); } catch (_) {} }

// ---------- GitHub ----------
// One wrapper holds the header. Errors carry the status and GitHub's own message only, never the token.
async function ghRes(method, path, body) {
  let res;
  try {
    res = await fetch(path.startsWith('https://') ? path : `${API}${path}`, {
      method, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) { throw new GhError(0, 'network'); }
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok) {
    const h = (k) => res.headers.get(k);
    // primary limit: remaining 0 until x-ratelimit-reset; secondary limit (403 or 429): retry-after seconds
    const spent = h('x-ratelimit-remaining') === '0', retry = Number(h('retry-after')) || 0;
    const limited = res.status === 429 || (res.status === 403 && (spent || retry > 0));
    throw new GhError(res.status, json && typeof json.message === 'string' ? json.message : '', limited ? { reset: spent ? Number(h('x-ratelimit-reset')) || 0 : 0, retry } : null);
  }
  return { json, headers: res.headers };
}
const gh = async (method, path, body) => (await ghRes(method, path, body)).json;

const UNKNOWN = 'Não sei se ficou guardado: a ligação falhou logo depois de o pedido seguir. Quando a rede voltar, carrega em «Tentar outra vez»: primeiro vejo no GitHub, e não guardo duas vezes.';

function errText(e, kind = 'read') {
  if (e instanceof UiError || e instanceof C.RuleError) return e.message;
  if (!(e instanceof GhError)) return 'Algo correu mal nesta página. Recarrega-a e tenta outra vez.';
  const tail = kind === 'write' ? ' O site não mudou.' : '';
  if (e.status === 0) return kind === 'write' ? 'Sem ligação. O site não mudou.' : 'Sem ligação ao GitHub. Verifica a rede e tenta outra vez.';
  if (e.rate) return `Demasiados pedidos ao GitHub. Tenta depois das ${hhmm(e.rate.retry || !e.rate.reset ? new Date(Date.now() + (e.rate.retry || 60) * 1000) : new Date(e.rate.reset * 1000))}.`;
  if (e.status === 401) return 'O token expirou ou foi revogado. Cria um novo.';
  if (kind === 'write' && (e.status === 403 || e.status === 404)) return 'O token não tem permissão de escrita (Contents: Read and write).';
  if (e.status === 404) return 'O token não chega ao repositório rgvduarte/carmo.';
  if (e.status === 403) return 'O GitHub recusou o pedido. Confirma as permissões do token.';
  if (e.status === 409 || e.status >= 500) return `O GitHub falhou (código ${e.status}).${tail || ' Tenta outra vez daqui a pouco.'}`;
  return `O GitHub não aceitou o pedido (código ${e.status}).${tail}`;   // its own words are English: not shown
}

async function readSpots(ref) {
  const c = await gh('GET', `/contents/${C.SPOTS_PATH}?ref=${encodeURIComponent(ref)}`);
  let text, data;
  try { text = C.decodeB64Utf8(c.content); data = JSON.parse(text); } catch (_) { data = null; }
  if (!data || !Array.isArray(data.spots) || !data.title) throw new UiError('data/spots.json no GitHub não é JSON válido. Não mexi em nada.');
  return { text, data };
}

// the logo files at a commit: [{ name, sha }] (sha is git's id of the bytes)
async function listBrands(ref) {
  try {
    const xs = await gh('GET', `/contents/${C.BRANDS}?ref=${encodeURIComponent(ref)}`);
    return Array.isArray(xs) ? xs.filter((x) => x.type === 'file').map((x) => ({ name: x.name, sha: x.sha })) : [];
  } catch (e) { if (e instanceof GhError && e.status === 404) return []; throw e; }   // no folder yet
}

// ---------- sign-in ----------
function showLogin(msg = '') {
  closeDialogs();
  $('#app').hidden = true; $('#login').hidden = false;
  $('#login-err').textContent = msg;
  document.title = 'GOCARMO · Admin';
}

function signOut(msg = '') {
  forgetToken(); token = null; base = null; sel.clear(); stopPublishing();
  $('#tok').value = ''; $('#who').textContent = '';
  updateBar();
  showLogin(msg);
}

async function signIn(e) {
  e.preventDefault();
  const input = $('#tok'), err = $('#login-err'), btn = $('#login-go'), t = input.value.trim();
  err.textContent = '';
  if (!C.TOKEN_RE.test(t)) { err.textContent = 'Isto não parece um token do GitHub (começa por github_pat_).'; input.focus(); return; }
  btn.disabled = true; btn.textContent = 'A verificar…';
  token = t;
  try {
    const { json: repo, headers } = await ghRes('GET', '');
    if (repo && repo.permissions && repo.permissions.push !== true) throw new UiError('A tua conta não pode escrever neste repositório. Pede ao dono acesso de escrita.');
    // A classic token reaches every repository the account can write to: take one that can do no more than this page
    // needs (public_repo), so a lost token does less harm.
    if (t.startsWith('ghp_') && headers.get('x-oauth-scopes') !== null) {
      const extra = headers.get('x-oauth-scopes').split(',').map((x) => x.trim()).filter((x) => x && x !== 'public_repo');
      if (extra.length) throw new UiError(`Este token clássico pode mais do que esta página precisa (${extra.join(', ')}). Apaga-o no GitHub e cria outro só com public_repo e 7 dias de validade.`);
    }
    // A fine-grained token shows what it may do only when it writes: the empty blob already exists in the repo
    // (.nojekyll), so asking for it again changes nothing.
    try { await gh('POST', '/git/blobs', { content: '', encoding: 'utf-8' }); } catch (x) {
      if (x instanceof GhError && (x.status === 403 || x.status === 404) && !x.rate) throw new UiError('O token só pode ler. Em «Permissions», o Contents tem de estar em «Read and write».');
      throw x;
    }
  } catch (x) {
    token = null;
    err.textContent = x instanceof GhError && x.status === 401 ? 'O GitHub não aceitou este token: está mal copiado, expirou ou foi revogado.'
      : x instanceof GhError && x.status === 404 ? 'Este token não chega a rgvduarte/carmo. Na criação, em «Repository access», escolhe esse repositório.'
      : errText(x);
    btn.disabled = false; btn.textContent = 'Entrar';
    return;
  }
  keepToken(t, $('#remember').checked);
  input.value = '';
  btn.disabled = false; btn.textContent = 'Entrar';
  enterApp();
}

async function enterApp({ check = false } = {}) {
  $('#login').hidden = true; $('#app').hidden = false;
  document.title = 'Espaços · GOCARMO Admin';
  if (check) {   // a token kept from an earlier visit: checked quietly, then the list
    try {
      const repo = await gh('GET', '');
      if (repo && repo.permissions && repo.permissions.push !== true) return signOut('A tua conta não pode escrever neste repositório.');
    } catch (e) {
      if (e instanceof GhError && (e.status === 401 || e.status === 404)) return signOut(e.status === 401 ? 'O token expirou ou foi revogado. Cria um novo.' : 'Este token já não chega a rgvduarte/carmo. Cria um novo.');
    }
  }
  gh('GET', 'https://api.github.com/user').then((u) => { if (u && u.login) $('#who').textContent = `@${u.login}`; }).catch(() => {});
  await load();
  restoreStash();
}

async function askSignOut() {
  if (busy) { toast('Espera: ainda estou a guardar.'); return; }
  if (await ask('Sair?', [], 'Vais precisar do token outra vez para entrar. Se não o guardaste, tens de criar um novo no GitHub.', 'Sair')) signOut();
}

// ---------- the list ----------
async function load({ quiet = false } = {}) {
  const btn = $('#reload'), meta = $('#meta');
  btn.classList.add('busy'); btn.disabled = true;
  if (!quiet) { meta.textContent = 'A ler do GitHub…'; meta.classList.remove('bad'); }
  try {
    const head = (await gh('GET', `/git/ref/heads/${C.BRANCH}`)).object.sha;
    base = { head, ...(await readSpots(head)), readAt: new Date() };
    sel = new Set([...sel].filter((id) => C.targetOf(base.data, id)));
    render();
  } catch (e) {
    if (e instanceof GhError && e.status === 401) return signOut('O token expirou ou foi revogado. Cria um novo.');
    meta.textContent = errText(e); meta.classList.add('bad');
  } finally { btn.classList.remove('busy'); btn.disabled = false; }
}

const viewKey = (x) => (x.status === 'reserved' || x.status === 'sold' ? x.status : 'available');   // a lapsed hold is free

function render() {
  if (!base) return;
  const now = Date.now(), today = C.todayUTC(now), raw = base.data, v = C.effective(raw, now);
  const meta = $('#meta');
  meta.classList.remove('bad');
  meta.textContent = `Atualizado às ${hhmm(base.readAt)}`;
  const counts = { all: v.spots.length, available: 0, reserved: 0, sold: 0 };
  for (const s of v.spots) counts[viewKey(s)]++;
  $$('[data-count]').forEach((n) => { n.textContent = String(counts[n.dataset.count]); });
  const sum = $('#summary'); sum.textContent = '';
  [plural(counts.available, 'livre', 'livres'), plural(counts.reserved, 'reservado', 'reservados'), plural(counts.sold, 'vendido', 'vendidos')]
    .forEach((s, i) => { if (i) sum.append(' · '); sum.appendChild(el('span', null, s)); });
  $$('input[name="filter"]').forEach((r) => { r.checked = r.value === filter; });

  const host = $('#groups'); host.textContent = '';
  const pass = (x) => filter === 'all' || viewKey(x) === filter;
  let rows = 0;
  for (const [it, name] of [['suit', 'Fato'], ['helmet', 'Capacete']]) {
    const spots = v.spots.filter((s) => C.itemOf(s) === it).sort((a, b) => a.n - b.n);
    if (!spots.length) continue;
    const ul = el('ul', 'rows');
    if (it === 'suit' && pass(v.title)) ul.appendChild(row(v, raw, C.TITLE, today, spots.length));
    for (const s of spots) if (pass(s)) ul.appendChild(row(v, raw, s.id, today));
    if (!ul.children.length) continue;
    rows += ul.children.length;
    const sec = el('section', 'group'), h = el('h2', null, name);
    sec.dataset.item = it;
    h.appendChild(el('span', 'c', String(spots.length)));
    sec.append(h, ul); host.appendChild(sec);
  }
  $('#empty').hidden = rows > 0;
  renderPub();
  updateBar();
}

function row(v, raw, id, today, suitCount = 0) {
  const isTitle = id === C.TITLE, x = C.targetOf(v, id), st = C.statusOf(v, x, today);
  const li = el('li', `row${isTitle ? ' title' : ''}${sel.has(id) ? ' sel' : ''}`);
  li.dataset.id = id;
  const lab = el('label'), cb = el('input');
  cb.type = 'checkbox'; cb.checked = sel.has(id); cb.value = id;
  cb.addEventListener('change', () => toggle(id, cb.checked));
  lab.append(cb, el('span', 'n', isTitle ? 'FATO' : C.pad2(x.n)), el('span', 'nm', C.nameOf(raw, id)), el('span', 'pr', C.money(x.price)));
  const sub = isTitle && st.key === 'available' ? `Os ${suitCount} espaços do fato, de uma vez · KONA FATO` : st.sub;
  if (sub) lab.appendChild(el('span', 'sub', sub));
  const chip = el('span', `st ${st.key}`); chip.appendChild(el('span', null, st.chip));
  lab.appendChild(chip);
  li.appendChild(lab);
  return li;
}

// the title package goes alone; ticking a spot lets go of it
function toggle(id, on) {
  if (on) {
    if (id === C.TITLE) { if (sel.size && !sel.has(C.TITLE)) toast('O fato completo vai sozinho.'); sel = new Set([C.TITLE]); }
    else { sel.delete(C.TITLE); sel.add(id); }
  } else sel.delete(id);
  syncRows();
}
function syncRows() {
  $$('.row').forEach((li) => { const on = sel.has(li.dataset.id); li.classList.toggle('sel', on); const cb = $('input', li); if (cb) cb.checked = on; });
  updateBar();
}

function updateBar() {
  const bar = $('#bar'), ids = base ? C.sortTargets(base.data, [...sel]) : [];
  bar.hidden = !ids.length;
  document.documentElement.style.setProperty('--bar-h', ids.length ? `${bar.offsetHeight}px` : '0px');
  if (!ids.length) return;
  $('#bar-n').textContent = ids[0] === C.TITLE ? 'Fato completo' : plural(ids.length, 'selecionado', 'selecionados');
  const t = C.totals(base.data, ids);
  $('#bar-total').textContent = t.disc ? `${C.money(t.net)} (${C.money(t.gross)} −${Math.round(t.disc * 100)}%)` : C.money(t.net);
  const now = Date.now();
  $$('[data-act]').forEach((b) => { const g = C.guard(base.data, now, ids, b.dataset.act); b.setAttribute('aria-disabled', String(g.blocked.length > 0)); });
}

// ---------- payment reference ----------
function onRef() {
  const out = $('#ref-out'), txt = $('#ref').value;
  out.classList.remove('ok'); out.textContent = '';
  if (!base) return;
  if (!txt.trim()) { out.textContent = 'É o descritivo da transferência ou do MB WAY. Seleciona esses espaços.'; return; }
  const r = C.parseRef(txt, base.data);
  sel = new Set(r.ids);
  if (r.ids.length && filter !== 'all') { filter = 'all'; saveFilter(); render(); } else syncRows();
  if (r.ids.length) {
    out.classList.add('ok');
    const t = C.totals(base.data, r.ids);
    const names = r.ids.map((id) => shortName(base.data, id));
    out.append(`${r.ids[0] === C.TITLE ? '' : `${plural(r.ids.length, 'espaço', 'espaços')}: `}${names.join(', ')} · Total esperado ${C.money(t.net)}${t.disc ? ` (${C.money(t.gross)} −${Math.round(t.disc * 100)}%)` : ''}`);
  }
  const extra = [];
  if (r.unknown.length) extra.push(`Não conheço ${r.unknown.length === 1 ? 'o espaço' : 'os espaços'} ${C.joinPT(r.unknown.map(String))}.`);
  if (r.note) extra.push(r.note);
  if (!r.ids.length && !extra.length) extra.push('Não encontrei números de espaços. Ex.: KONA 01 21 22.');
  if (extra.length) { const b = el('span', r.unknown.length || !r.ids.length ? 'bad' : null, `${r.ids.length ? ' ' : ''}${extra.join(' ')}`); out.appendChild(b); }
}

function saveFilter() { try { localStorage.setItem(FILTER_KEY, filter); } catch (_) {} }

// ---------- names ----------
const shortName = (data, id) => (id === C.TITLE ? 'Fato completo' : `${C.pad2(C.targetOf(data, id).n)} ${C.nameOf(data, id)}`);
// sheet and dialog titles: numbers only (the line under the title names the spots): 'Vender 12, 13 e 22'
function headFor(action, data, ids) {
  const verb = { reserved: 'Reservar', sold: 'Vender', available: 'Libertar' }[action];
  if (ids[0] === C.TITLE) return `${verb} o fato completo`;
  if (ids.length > 6) return `${verb} ${ids.length} espaços`;
  return `${verb} ${C.joinPT(ids.map((id) => C.pad2(C.targetOf(data, id).n)))}`;
}
// toasts and the status line: '01 Peito e 21 Topo do capacete'
function namesFor(data, ids) {
  if (ids.length > 3) return `espaços ${C.joinPT(ids.map((id) => (id === C.TITLE ? 'fato completo' : C.pad2(C.targetOf(data, id).n))))}`;
  return C.joinPT(ids.map((id) => shortName(data, id)));
}

// ---------- actions ----------
async function act(action) {
  if (!base) return;
  if (busy) { toast('Espera: ainda estou a guardar.'); return; }
  const ids = C.sortTargets(base.data, [...sel]);
  if (!ids.length) return;
  const now = Date.now(), g = C.guard(base.data, now, ids, action);
  if (g.blocked.length) { toast(g.blocked.join(' ')); return; }
  if (action !== 'available') { openSheet(action, ids); return; }
  const raw = base.data, v = C.effective(raw, now), today = C.todayUTC(now);
  const lines = ids.map((id) => `${C.labelOf(raw, id)} · ${C.statusOf(v, C.targetOf(v, id), today).chip}`);
  const logos = ids.some((id) => C.targetOf(raw, id).logo);
  const text = ids[0] === C.TITLE ? 'Os espaços do fato voltam a ficar livres no site, menos os que têm reserva ou venda própria.'
    : `${ids.length > 1 ? 'Voltam a ficar livres' : 'Volta a ficar livre'} no site.${logos ? ' O logótipo sai.' : ''}`;
  if (!(await ask(`${headFor('available', raw, ids)}?`, lines, text, 'Libertar'))) return;
  run({ action, ids, f: { brand: '', url: '', until: '' }, logo: null, snap: C.snapshot(raw, ids) });
}

function openSheet(action, ids) {
  const raw = base.data, now = Date.now(), today = C.todayUTC(now), d = $('#sheet');
  sheet = { action, ids, snap: C.snapshot(raw, ids), logo: null, untilTouched: false };
  $('#sh-title').textContent = headFor(action, raw, ids);
  const t = C.totals(raw, ids), sum = $('#sh-sum'); sum.textContent = '';
  sum.append(ids.map((id) => C.labelOf(raw, id)).join(', '), ' · Total esperado ');
  sum.appendChild(el('b', null, C.money(t.net)));
  // one brand holds every target: start from its exact stored name and link (reserve -> sell keeps both)
  const held = ids.map((id) => C.targetOf(raw, id)).filter((x) => x.status !== 'available' && x.brand);
  const one = held.length === ids.length && new Set(held.map((x) => x.brand)).size === 1;
  $('#f-brand').value = one ? held[0].brand : '';
  $('#f-url').value = one ? (held.find((x) => x.url)?.url || '') : '';
  const until = $('#f-until'); until.min = today; until.value = C.defaultUntil(raw, now, ids, C.normBrand($('#f-brand').value));
  const dl = $('#brands'); dl.textContent = '';
  for (const b of new Set([...raw.spots, raw.title].map((x) => x.brand).filter(Boolean))) { const o = el('option'); o.value = b; dl.appendChild(o); }
  $$('[data-only]', d).forEach((n) => { n.hidden = n.dataset.only !== action; });
  clearLogo();
  $('#sh-err').textContent = '';
  $('#sh-go').textContent = action === 'sold' ? 'Guardar venda' : 'Guardar reserva';
  $('#sh-form').hidden = false; $('#sh-progress').hidden = true; $('#sh-x').hidden = false;
  refreshSheet();
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  if (!$('#f-brand').value && matchMedia('(pointer: fine)').matches) $('#f-brand').focus();
}

function refreshSheet() {
  if (!sheet || !base) return;
  const { action, ids } = sheet, raw = base.data, now = Date.now(), brand = C.normBrand($('#f-brand').value);
  let until;
  if (action === 'reserved') {
    // the date follows the brand until the admin picks one: never shorter than that brand's current hold
    if (!sheet.untilTouched) $('#f-until').value = C.defaultUntil(raw, now, ids, brand);
    const hl = $('#sh-holds'); hl.textContent = '';
    for (const h of C.holds(raw, now, ids)) hl.appendChild(el('li', null, `${C.labelOf(raw, h.id)}: reservado para ${h.brand || 'sem marca'} até ${C.fmtDay(h.until)}`));
    hl.hidden = !hl.children.length;
    try { until = C.normUntil($('#f-until').value, C.todayUTC(now)); } catch (_) { until = undefined; }
  }
  const warn = $('#sh-warn'); warn.textContent = '';
  if (brand) {
    const g = C.guard(raw, now, ids, action, brand, until);
    for (const m of g.blocked) warn.appendChild(el('li', 'block', m));
    for (const m of g.confirms) warn.appendChild(el('li', null, m));
  }
  if (action !== 'sold') return;
  const keeps = sheet.logo ? [] : ids.map((id) => C.targetOf(raw, id)).filter((x) => x.logo && x.brand === brand);
  const cur = $('#cur-logo');
  cur.hidden = !keeps.length;
  if (keeps.length) { const img = $('#cur-img'), src = new URL(keeps[0].logo, SITE_ROOT).href; img.hidden = false; img.onerror = () => { img.hidden = true; }; if (img.getAttribute('src') !== src) img.src = src; }
  const note = $('#logo-note');
  if (sheet.logo && sheet.logo.size > 1048576) note.textContent = 'Logótipo grande: o site demora mais a abri-lo. Se puderes, usa um PNG mais pequeno.';
  else if (sheet.logo && ids[0] === C.TITLE) note.textContent = 'No 3D, o logótipo do fato completo vai para o peito (se o peito não tiver logótipo próprio).';
  else if (!sheet.logo && !keeps.length) note.textContent = 'Sem logótipo, o espaço fica Vendido com o nome da marca na lista de marcas do site.';
  else note.textContent = '';
}

function clearLogo() {
  if (sheet && sheet.logo) URL.revokeObjectURL(sheet.logo.url);
  if (sheet) sheet.logo = null;
  $('#f-logo').value = '';
  $('#tiles').hidden = true; $('#logo-info').hidden = true; $('#see3d').hidden = true;
  $('#tile-w').removeAttribute('src'); $('#tile-b').removeAttribute('src');
}

async function pickLogo() {
  const input = $('#f-logo'), file = input.files && input.files[0], err = $('#sh-err');
  err.textContent = '';
  clearLogo();
  if (!file || !sheet) { refreshSheet(); return; }
  const mine = sheet;
  if (file.size > C.MAX_LOGO) { err.textContent = C.MSG.logoBig; refreshSheet(); return; }
  let logo;
  try { logo = await readLogo(file); } catch (e) {
    if (sheet === mine) { err.textContent = e instanceof C.RuleError ? e.message : 'Não consegui abrir esse ficheiro.'; refreshSheet(); }
    return;
  }
  if (sheet !== mine) { URL.revokeObjectURL(logo.url); return; }
  showLogo(logo);
}

// The picked file as it will be stored. PNG, JPG and WebP go as they are. An SVG is drawn onto a canvas and goes as
// that PNG: the brand's SVG bytes never reach gocarmo.com, where an SVG opened on its own could run script next to
// the admin token. The checks on the SVG only say early why a file will not do.
async function readLogo(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = C.checkLogo(bytes);
  let doc = null;
  if (kind.ext === 'svg') {
    const bad = C.svgEncodingProblem(bytes);
    if (bad) throw new C.RuleError(bad);
    doc = new DOMParser().parseFromString(new TextDecoder('utf-8').decode(bytes), 'image/svg+xml');
    const p = C.svgProblem(doc);
    if (p) throw new C.RuleError(p);
  }
  const blob = new Blob([bytes], { type: kind.mime }), url = URL.createObjectURL(blob);
  const img = new Image();
  try { img.src = url; await img.decode(); } catch (_) { URL.revokeObjectURL(url); throw new C.RuleError(kind.ext === 'svg' ? C.MSG.svgBad : 'Não consegui abrir esse ficheiro.'); }
  if (kind.ext !== 'svg') return { bytes, ext: kind.ext, mime: kind.mime, blob, url, name: file.name, size: bytes.length, info: `${file.name} · ${kb(bytes.length)} · ${kind.ext.toUpperCase()}` };
  try {
    const r = await rasterSvg(doc, img);
    const png = new Uint8Array(await r.blob.arrayBuffer());
    if (C.sniffLogo(png) !== 'png') throw new Error('not a png');
    return { bytes: png, ext: 'png', mime: 'image/png', blob: r.blob, url: URL.createObjectURL(r.blob), name: file.name, size: png.length, info: `${file.name} · ${kb(bytes.length)} · SVG, guardado como PNG ${r.w} × ${r.h}` };
  } catch (e) { throw e instanceof C.RuleError ? e : new C.RuleError(C.MSG.svgRaster); }
  finally { URL.revokeObjectURL(url); }
}

async function rasterSvg(doc, img) {
  const size = C.svgSize(doc) || { w: img.naturalWidth || 300, h: img.naturalHeight || 150 };
  for (const side of RASTER_SIDES) {
    const { w, h } = C.rasterSize(size, side);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);   // transparent canvas: the alpha stays
    const blob = await new Promise((ok, no) => { try { c.toBlob((b) => (b ? ok(b) : no(new Error('toBlob'))), 'image/png'); } catch (e) { no(e); } });
    if (blob.size <= C.MAX_LOGO) return { blob, w, h };
  }
  throw new C.RuleError(C.MSG.logoBig);
}

function showLogo(logo) {
  sheet.logo = logo;
  $('#tile-w').src = logo.url; $('#tile-b').src = logo.url;
  $('#tiles').hidden = false;
  const info = $('#logo-info'); info.hidden = false; info.textContent = logo.info;
  $('#see3d').hidden = !webgl();
  refreshSheet();
}

// Only the Guardar button saves. Enter (the keyboard's «seguinte» key) moves to the next field, and closes the
// keyboard on the last one.
function onSheetKey(e) {
  const t = e.target;
  if (e.key !== 'Enter' || e.isComposing || !(t instanceof HTMLInputElement) || ['file', 'checkbox', 'radio', 'button', 'submit'].includes(t.type)) return;
  e.preventDefault();
  const order = sheet && sheet.action === 'reserved' ? ['f-brand', 'f-url', 'f-until'] : ['f-brand', 'f-url', 'f-logo'];
  const i = order.indexOf(t.id), next = i >= 0 && i < order.length - 1 ? document.getElementById(order[i + 1]) : null;
  if (next && !next.closest('[hidden]')) next.focus(); else t.blur();
}

async function submitSheet(e) {
  e.preventDefault();
  if (!sheet || busy) return;
  const { action, ids } = sheet, err = $('#sh-err');
  err.textContent = '';
  let f;
  try { f = C.normalize(action, { brand: $('#f-brand').value, url: $('#f-url').value, until: $('#f-until').value }, C.todayUTC()); } catch (x) {
    err.textContent = x.message;
    const m = x.message;
    ($(/link/i.test(m) ? '#f-url' : /data/i.test(m) ? '#f-until' : '#f-brand')).focus();
    return;
  }
  const g = C.guard(base.data, Date.now(), ids, action, f.brand, f.until || undefined);
  if (g.blocked.length) { err.textContent = g.blocked.join(' '); return; }
  if (g.confirms.length && !(await ask('Confirmas?', g.confirms, 'Fica como escreveste. Podes mudar outra vez depois.', 'Sim, guardar'))) return;
  let logo = null;
  if (action === 'sold' && sheet && sheet.logo) {
    const L = sheet.logo;
    // last word before anything leaves: only PNG, JPG or WebP bytes go to the site, never an SVG
    if (!C.STORED.includes(L.ext) || C.sniffLogo(L.bytes) !== L.ext) { err.textContent = 'Este ficheiro não pode ir para o site. Escolhe outro.'; return; }
    logo = { ext: L.ext, b64: C.bytesToB64(L.bytes), bytes: L.bytes, sha: await C.gitBlobSha(L.bytes) };
  }
  if (!sheet) return;
  run({ action, ids, f, logo, snap: sheet.snap });
}

// ---------- save: one commit on gh-pages ----------
// The snapshot is what the admin saw when the sheet opened. If any target changed since (someone else saved), nothing
// is committed. A moved ref at the last step (422) re-runs the whole sequence once on the new head. A ref update whose
// answer was lost is remembered (intent.pending): every later try first looks whether it is on gh-pages already.
async function save(intent) {
  const { action, ids, f, logo, snap } = intent;
  let logoSha = null;
  for (let attempt = 1; ; attempt++) {
    let head;
    try {
      head = (await gh('GET', `/git/ref/heads/${C.BRANCH}`)).object.sha;
      if (head !== base.head) { base = { head, ...(await readSpots(head)), readAt: new Date() }; render(); }
    } catch (e) { if (intent.pending && transient(e)) throw new UiError(UNKNOWN, { unknown: true }); throw e; }
    const raw = base.data, now = Date.now();
    const p = intent.pending;
    if (p) {
      // there as the head, or under a later commit of someone else (the spots hold what this save wrote)
      const landed = head === p.sha || (C.changedSince(snap, raw).length > 0 && C.changedSince(p.after, raw).length === 0);
      intent.pending = null;
      if (landed) return { commit: p.commit, data: raw, message: p.message, writes: p.writes };
    }
    const changed = C.changedSince(snap, raw);
    if (changed.length) throw new UiError(conflictText(raw, changed, now), { conflict: true });
    const g = C.guard(raw, now, ids, action, action === 'available' ? undefined : f.brand, action === 'reserved' ? f.until : undefined);
    if (g.blocked.length) throw new UiError(`${g.blocked.join(' ')} Revê e tenta outra vez.`, { conflict: true });
    const commit = await gh('GET', `/git/commits/${head}`);
    const brands = await listBrands(head);
    const today = C.todayUTC(now);
    const res = C.applyAction(raw, ids, action, f, { today, brandFiles: brands.map((b) => b.name), logoExt: logo ? logo.ext : null });
    // the very same file already at that path needs no new entry
    const there = new Map(brands.map((b) => [`${C.BRANDS}/${b.name}`, b.sha]));
    const writes = res.writes.filter((path) => there.get(path) !== logo.sha);
    if (res.text === base.text && !writes.length && !res.deletes.length) return { nothing: true };
    if (writes.length && !logoSha) logoSha = (await gh('POST', '/git/blobs', { content: logo.b64, encoding: 'base64' })).sha;
    const jsonSha = (await gh('POST', '/git/blobs', { content: res.text, encoding: 'utf-8' })).sha;
    const tree = await gh('POST', '/git/trees', {
      base_tree: commit.tree.sha,
      tree: [
        { path: C.SPOTS_PATH, mode: '100644', type: 'blob', sha: jsonSha },
        ...writes.map((path) => ({ path, mode: '100644', type: 'blob', sha: logoSha })),
        ...res.deletes.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
      ],
    });
    const message = C.commitMessage(raw, ids, action, f);
    const made = await gh('POST', '/git/commits', { message, tree: tree.sha, parents: [head] });
    try {
      await gh('PATCH', `/git/refs/heads/${C.BRANCH}`, { sha: made.sha, force: false });
    } catch (e) {
      if (!(e instanceof GhError)) throw e;
      if (e.status === 422) {   // someone else saved in between
        if (attempt === 1) continue;
        throw new UiError('Alguém guardou ao mesmo tempo duas vezes seguidas. Recarreguei a lista: confirma e tenta outra vez.', { conflict: true, reload: true });
      }
      if (!transient(e)) throw e;
      // no answer: the ref may have moved. Keep this commit in mind so that no later try saves the action twice.
      intent.pending = { sha: made.sha, after: C.snapshot(res.data, ids), commit: made, message, writes };
      let now2 = null;
      try { now2 = (await gh('GET', `/git/ref/heads/${C.BRANCH}`)).object.sha; } catch (_) {}
      if (now2 !== made.sha) {
        if (attempt === 1) continue;   // the next round looks again, and saves it only if it is not there
        throw now2 === null ? new UiError(UNKNOWN, { unknown: true }) : e;
      }
      intent.pending = null;
    }
    const data = JSON.parse(res.text);
    base = { head: made.sha, text: res.text, data, readAt: new Date() };
    return { commit: made, data, message, writes };
  }
}

function conflictText(raw, changed, now) {
  const v = C.effective(raw, now), today = C.todayUTC(now);
  const now1 = (id) => { const x = C.targetOf(v, id); return x ? C.statusOf(v, x, today).chip : 'já não existe'; };
  const num = (id) => (id === C.TITLE ? 'fato completo' : C.pad2(C.targetOf(raw, id)?.n ?? id));
  if (changed.length === 1) return `${changed[0] === C.TITLE ? 'O fato completo mudou' : `O espaço ${num(changed[0])} mudou`} entretanto (agora: ${now1(changed[0])}). Revê e tenta outra vez.`;
  return `Os espaços ${C.joinPT(changed.map(num))} mudaram entretanto (${changed.map((id) => `${num(id)} agora: ${now1(id)}`).join('; ')}). Revê e tenta outra vez.`;
}

// ---------- progress, in the sheet ----------
function step(id, state, text) {
  const li = $(`#pr-${id}`);
  li.className = state || '';
  if (text != null) $('span', li).textContent = text;
  li.hidden = text === '';   // a step that will not happen (after a failure, or nothing to save)
}
function prMsg(text, bad = false) { const m = $('#pr-msg'); m.textContent = text; m.classList.toggle('bad', bad === true); m.classList.toggle('warn', bad === 'warn'); }

function openProgress({ action, ids }) {
  const d = $('#sheet');
  shown = null;   // the progress view now belongs to this save
  $('#sh-title').textContent = headFor(action, base.data, ids);
  $('#sh-form').hidden = true; $('#sh-progress').hidden = false;
  step('save', 'on', 'A guardar no GitHub…'); step('pub', '', 'A publicar…'); step('live', '', 'No ar');
  prMsg(''); $('#pr-links').textContent = '';
  $('#pr-retry').hidden = true; $('#pr-check').hidden = true;
  $('#sh-x').hidden = true; $('#pr-close').disabled = true;
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}

async function run(intent) {
  if (busy) return;
  busy = true; lastRun = intent;
  openProgress(intent);
  try {
    const r = await save(intent);
    busy = false;
    $('#sh-x').hidden = false; $('#pr-close').disabled = false;
    if (r.nothing) {
      step('save', 'done', 'Nada mudou.'); step('pub', '', ''); step('live', '', '');
      prMsg('Os dados já estavam assim; não mudei nada.');
      return;
    }
    step('save', 'done', 'Guardado ✓');
    sel.clear(); $('#ref').value = ''; onRef(); render();
    shown = publish({ ids: intent.ids, data: r.data, commit: r.commit, files: r.writes, bytes: intent.logo ? intent.logo.bytes : null });
    showPublish(shown);
  } catch (e) {
    busy = false;
    $('#sh-x').hidden = false; $('#pr-close').disabled = false;
    if (e instanceof GhError && e.status === 401) {
      keepSheet(intent);
      signOut('O token expirou ou foi revogado. Entra com um token novo: o que escreveste fica à espera.');
      return;
    }
    step('save', e.unknown ? 'unknown' : 'fail', e.unknown ? 'Sem resposta do GitHub' : 'Não guardei.'); step('pub', '', ''); step('live', '', '');
    prMsg(errText(e, 'write'), e.unknown ? 'warn' : true);
    if (e.conflict) { if (e.reload) load({ quiet: true }); else render(); }
    else $('#pr-retry').hidden = false;
  }
}

// a token that stops working mid-save: what the admin typed and picked waits for the next sign-in
function keepSheet(intent) {
  const s = sheet && sheet.action === intent.action ? sheet : null;
  stash = { action: intent.action, ids: intent.ids, brand: $('#f-brand').value, url: $('#f-url').value, until: $('#f-until').value, untilTouched: !!(s && s.untilTouched), logo: s ? s.logo : null };
  if (s) s.logo = null;   // its preview stays alive for the sheet that comes back
}
function restoreStash() {
  if (!stash || !base) return;   // a list that did not load keeps it for the next sign-in
  const s = stash;
  stash = null;
  const ids = s.ids.filter((id) => C.targetOf(base.data, id));
  if (!ids.length) return;
  sel = new Set(ids); syncRows();
  if (s.action === 'available') { toast('Entraste outra vez. A seleção ficou: carrega em Libertar.'); return; }
  openSheet(s.action, ids);
  $('#f-brand').value = s.brand; $('#f-url').value = s.url;
  if (s.action === 'reserved' && s.untilTouched) { $('#f-until').value = s.until; sheet.untilTouched = true; }
  if (s.logo) showLogo(s.logo); else refreshSheet();
  toast('Entraste outra vez. O que escreveste ficou: revê e carrega em Guardar.');
}

function links(ids, data, commit, { site = true, actions = false } = {}) {
  const ul = $('#pr-links'); ul.textContent = '';
  const add = (href, label, hint) => { const li = el('li'), a = el('a', null, label); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.appendChild(el('span', null, hint)); li.appendChild(a); ul.appendChild(li); };
  if (site) {
    for (const id of ids.slice(0, 4)) add(C.liveLink(data, id), `Ver no site: ${id === C.TITLE ? 'fato completo' : shortName(data, id)}`, '↗');
    if (ids.length > 4) ul.appendChild(el('li', 'more', `e mais ${ids.length - 4}`));
  }
  if (commit && /^https:\/\/github\.com\//.test(commit.html_url || '')) add(commit.html_url, 'Ver alteração no GitHub', `${commit.sha.slice(0, 7)} ↗`);
  if (actions) add(`https://github.com/${C.REPO}/actions`, 'Ver publicação no GitHub', '↗');
}

// ---------- publish check: every save still on its way to gocarmo.com ----------
// GitHub Pages deploys the latest commit, which holds the earlier ones, so one look at the live file can confirm
// several saves at once. Each save keeps its own clock; after POLL_FOR it waits for "Verificar outra vez". Phones
// throttle timers in the background, so coming back to the tab looks at once.
const queue = [];          // { ids, data, commit, files, bytes, t0, late }
let shown = null;          // the queued save the progress view shows
let lastLive = null;       // { at, ids, data }: the last saves seen live, for the line under the list header
let pollTimer = 0, polling = false, clockTimer = 0;

function publish(item) {
  for (const q of queue) {   // a later save of the same spot answers for it
    q.ids = q.ids.filter((id) => !item.ids.includes(id));
    q.files = q.files.filter((path) => !item.ids.some((id) => path.startsWith(`${C.BRANDS}/${id}.`)));
  }
  for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].ids.length) queue.splice(i, 1);
  Object.assign(item, { t0: performance.now(), late: false });
  queue.push(item);
  renderPub(); armClock(); pollIn(POLL_EVERY);
  return item;
}

function pollIn(ms) {
  clearTimeout(pollTimer); pollTimer = 0;
  if (queue.some((q) => !q.late)) pollTimer = setTimeout(checkLive, ms);
}

async function checkLive() {
  if (polling) return;
  polling = true;
  const done = [];
  try {
    const live = await fetchLive(), got = new Map();
    if (live) for (const q of queue) if (!q.late && await isLive(q, live, got)) done.push(q);
  } finally { polling = false; }
  for (const q of done) { const i = queue.indexOf(q); if (i >= 0) queue.splice(i, 1); }
  const now = performance.now();
  for (const q of queue) if (!q.late && now - q.t0 >= POLL_FOR) { q.late = true; showPublish(q); }
  if (done.length) announce(done);
  renderPub(); armClock(); pollIn(POLL_EVERY);
}

async function fetchLive() {
  try {
    const res = await fetch(`${C.SITE}/data/spots.json?t=${Date.now()}`, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return null;
    const live = await res.json();
    return live && Array.isArray(live.spots) ? live : null;
  } catch (_) { return null; }
}
async function fetchBytes(url) {
  try { const res = await fetch(url, { cache: 'no-store', credentials: 'omit' }); return res.ok ? new Uint8Array(await res.arrayBuffer()) : null; } catch (_) { return null; }
}
const sameBytes = (a, b) => !!a && !!b && a.length === b.length && a.every((x, i) => x === b[i]);

// live when the file carries this save's fields, and each logo it wrote is served with the new bytes (a new file
// under the old name changes nothing in the JSON)
async function isLive(q, live, got) {
  if (!live.updated || live.updated < q.data.updated) return false;
  const fields = q.ids.every((id) => {
    const a = C.targetOf(live, id), b = C.targetOf(q.data, id);
    return !!a && !!b && LIVE_FIELDS.every((k) => (a[k] ?? null) === (b[k] ?? null));
  });
  if (!fields) return false;
  for (const path of q.files) {
    if (!got.has(path)) got.set(path, await fetchBytes(`${C.SITE}/${path}?t=${Date.now()}`));
    if (!sameBytes(got.get(path), q.bytes)) return false;
  }
  return true;
}

function announce(done) {
  const data = done[done.length - 1].data;
  const ids = C.sortTargets(data, [...new Set(done.flatMap((q) => q.ids))]);
  lastLive = { at: new Date(), ids, data };
  const viewing = !!shown && done.includes(shown) && $('#sheet').open && !$('#sh-progress').hidden;
  if (shown && done.includes(shown)) showPublish(shown, true);
  if (!viewing || done.length > 1) toast(`No ar ✓ · ${namesFor(data, ids)}`);
}

function showPublish(q, live = false) {
  if (!q || q !== shown) return;
  if (live) {
    step('pub', 'done', 'Publicado'); step('live', 'done', 'No ar ✓');
    prMsg(''); links(q.ids, q.data, q.commit); $('#pr-check').hidden = true;
  } else if (q.late) {
    step('pub', 'wait', 'Ainda a publicar');
    prMsg('Guardado, mas ainda não está no ar. O GitHub costuma demorar 1 a 2 minutos.');
    links([], q.data, q.commit, { site: false, actions: true });
    $('#pr-check').hidden = false;
  } else {
    clockStep(q);
    prMsg('O site atualiza-se sozinho. Podes fechar: eu aviso quando estiver no ar.');
    links([], q.data, q.commit, { site: false });
    $('#pr-check').hidden = true;
  }
}
function clockStep(q) { const s = Math.floor((performance.now() - q.t0) / 1000); step('pub', 'on', `A publicar… ${Math.floor(s / 60)}:${C.pad2(s % 60)}`); }
function armClock() {
  const need = queue.some((q) => !q.late);
  if (need && !clockTimer) clockTimer = setInterval(() => { if (shown && queue.includes(shown) && !shown.late) clockStep(shown); }, 1000);
  if (!need && clockTimer) { clearInterval(clockTimer); clockTimer = 0; }
}
function recheck() {
  const now = performance.now();
  for (const q of queue) if (q.late) Object.assign(q, { late: false, t0: now });
  if (shown && queue.includes(shown)) showPublish(shown);
  renderPub(); armClock(); pollIn(0);
}
function stopPublishing() {
  queue.length = 0; shown = null; lastLive = null;
  clearTimeout(pollTimer); pollTimer = 0; armClock(); renderPub();
}

// the line under the list header: what is on its way, what is late, and what went live last (with its links)
function renderPub() {
  const box = $('#pub');
  box.textContent = '';
  const going = queue.filter((q) => !q.late), late = queue.filter((q) => q.late);
  const idsOf = (qs) => C.sortTargets(qs[qs.length - 1].data, [...new Set(qs.flatMap((q) => q.ids))]);
  if (going.length) { const p = el('p', 'pub-l going'); p.append(el('i', 'dot'), `A publicar: ${namesFor(going[going.length - 1].data, idsOf(going))}`); box.appendChild(p); }
  if (late.length) {
    const p = el('p', 'pub-l late', `Guardado, ainda não está no ar: ${namesFor(late[late.length - 1].data, idsOf(late))}.`);
    const b = el('button', 'link', 'Verificar outra vez'); b.type = 'button'; b.addEventListener('click', recheck);
    p.append(' ', b); box.appendChild(p);
  }
  if (lastLive) {
    const p = el('p', 'pub-l live', `No ar ✓ às ${hhmm(lastLive.at)}:`);
    for (const id of lastLive.ids.slice(0, 4)) { const a = el('a', null, `${id === C.TITLE ? 'Fato completo' : shortName(lastLive.data, id)} ↗`); a.href = C.liveLink(lastLive.data, id); a.target = '_blank'; a.rel = 'noopener'; p.append(' ', a); }
    if (lastLive.ids.length > 4) p.append(` e mais ${lastLive.ids.length - 4}`);
    box.appendChild(p);
  }
  box.hidden = !box.children.length;
}

// ---------- dialogs ----------
function ask(title, items, text, yes = 'Confirmar') {
  return new Promise((resolve) => {
    const d = $('#confirm');
    $('#cf-title').textContent = title;
    const ul = $('#cf-list'); ul.textContent = '';
    for (const it of items) ul.appendChild(el('li', null, it));
    $('#cf-text').textContent = text;
    $('#cf-yes').textContent = yes;
    const done = (v) => { d.removeEventListener('close', onClose); $('#cf-yes').onclick = null; $('#cf-no').onclick = null; if (d.open) d.close(); resolve(v); };
    const onClose = () => { if (!d.open) done(false); };
    $('#cf-yes').onclick = () => done(true);
    $('#cf-no').onclick = () => done(false);
    d.addEventListener('close', onClose);
    d.showModal();
    $('#cf-no').focus();
  });
}

function closeDialogs() { for (const d of $$('dialog')) if (d.open) d.close(); }

function toast(msg) {
  const t = $('#toast'), open = [...$$('dialog')].reverse().find((d) => d.open);
  const host = open || document.body;
  if (t.parentElement !== host) host.appendChild(t);
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3800);
}

// ---------- 3D preview (three.js loads only from here) ----------
function webgl() {
  if (gl === null) { try { const c = document.createElement('canvas'); gl = !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (_) { gl = false; } }
  return gl;
}
let v3d = null;
async function open3d() {
  if (!sheet || !sheet.logo || !base) return;
  const d = $('#v3d'), msg = $('#v3d-msg'), tabs = $('#v3d-tabs'), loading = $('#v3d-loading');
  msg.textContent = 'Arrasta para rodar. É o mesmo desenho que o site faz.';
  tabs.hidden = true; loading.hidden = false; loading.textContent = 'A abrir o modelo 3D…';
  d.showModal();
  const raw = base.data, ids = sheet.ids, now = Date.now();
  try {
    // the file after this sale, as the site will show it; the new logo goes where the site will print it
    const after = C.applyAction(raw, ids, 'sold', { brand: C.normBrand($('#f-brand').value) || 'Marca', url: '', until: '' }, { today: C.todayUTC(now), logoExt: sheet.logo.ext }).data;
    const view = C.effective(after, now);
    const top = view.spots.find((s) => s.top);
    const cands = ids[0] === C.TITLE ? (top && !C.targetOf(raw, top.id).logo ? [top.id] : []) : ids;
    const mod = await import('./admin-3d.js');
    v3d = await mod.preview($('#v3d-stage'), { spots: view.spots, cands, blob: sheet.logo.blob, root: SITE_ROOT.href });
    loading.hidden = true;
    tabs.hidden = v3d.items.size < 2;
    $$('[data-item]', tabs).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.item === v3d.first)));
  } catch (e) {
    console.error(e);
    loading.hidden = false;
    loading.textContent = 'A pré-visualização 3D não abriu neste aparelho. Os quadrados acima mostram o ficheiro.';
    msg.textContent = '';
  }
}
function close3d() { if (v3d) v3d.close(); const d = $('#v3d'); if (d.open) d.close(); }

// ---------- wiring ----------
function bind() {
  $('#login-form').addEventListener('submit', signIn);
  $('#logout').addEventListener('click', askSignOut);
  $('#reload').addEventListener('click', () => { if (!busy) load(); });
  $('#ref').addEventListener('input', onRef);
  $$('input[name="filter"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) { filter = r.value; saveFilter(); render(); } }));
  $('#bar-clear').addEventListener('click', () => { sel.clear(); syncRows(); });
  $$('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));

  const d = $('#sheet');
  $('#sh-form').addEventListener('submit', submitSheet);
  $('#sh-form').addEventListener('keydown', onSheetKey);
  for (const id of ['#f-brand', '#f-url']) $(id).addEventListener('input', () => { $('#sh-err').textContent = ''; refreshSheet(); });
  $('#f-until').addEventListener('input', () => { if (sheet) sheet.untilTouched = true; $('#sh-err').textContent = ''; refreshSheet(); });
  $('#f-logo').addEventListener('change', pickLogo);
  $('#see3d').addEventListener('click', open3d);
  const closeSheet = () => { if (!busy && d.open) d.close(); };
  $('#sh-x').addEventListener('click', closeSheet);
  $('#sh-cancel').addEventListener('click', closeSheet);
  $('#pr-close').addEventListener('click', closeSheet);
  $('#pr-retry').addEventListener('click', () => { if (lastRun) run(lastRun); });
  $('#pr-check').addEventListener('click', () => { $('#pr-check').hidden = true; recheck(); });
  d.addEventListener('cancel', (e) => { if (busy) e.preventDefault(); });
  // 'close' arrives after the fact: a sheet opened again meanwhile keeps its state
  d.addEventListener('close', () => { if (d.open) return; clearLogo(); sheet = null; });

  $('#v3d-x').addEventListener('click', close3d);
  $('#v3d-close').addEventListener('click', close3d);
  $('#v3d').addEventListener('close', () => { if (v3d && !$('#v3d').open) v3d.close(); });
  $$('#v3d-tabs [data-item]').forEach((b) => b.addEventListener('click', async () => {
    if (!v3d) return;
    $$('#v3d-tabs [data-item]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    const loading = $('#v3d-loading'), first = b.dataset.item === 'helmet' && !v3d.helmetReady();
    if (first) { loading.textContent = 'A preparar o capacete…'; loading.hidden = false; }   // built once, on first view
    try { await v3d.show(b.dataset.item); } catch (e) { console.error(e); toast('O capacete 3D não abriu neste aparelho.'); }
    finally { if (first) loading.hidden = true; }
  }));

  const net = () => { $('#offline').hidden = navigator.onLine !== false; };
  addEventListener('online', net); addEventListener('offline', net); net();
  // back after a while: the list may be stale (someone else saved, or the issue form ran); a save on its way to the
  // site is checked at once
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = performance.now(); return; }
    if (queue.some((q) => !q.late)) pollIn(0);
    if (token && base && !busy && hiddenAt && performance.now() - hiddenAt > 60000 && !$$('dialog').some((x) => x.open)) load({ quiet: true });
  });
  addEventListener('resize', () => { if (sel.size) document.documentElement.style.setProperty('--bar-h', `${$('#bar').offsetHeight}px`); });
}

function boot() {
  try { const f = localStorage.getItem(FILTER_KEY); if (['all', 'available', 'reserved', 'sold'].includes(f)) filter = f; } catch (_) {}
  bind();
  const t = readToken();
  if (t && C.TOKEN_RE.test(t)) { token = t; enterApp({ check: true }); } else { forgetToken(); showLogin(); }
}

// frame-ancestors is ignored in a meta CSP: a framed copy of this page shows nothing
if (window.top !== window.self) document.documentElement.hidden = true;
else boot();
