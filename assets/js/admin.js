// Admin page (/admin/): reserve, sell and free the suit and helmet spots while the site is live.
// Each action is ONE commit on gh-pages, made with the GitHub Git Data API and the owner's own token (kept in this
// browser only). The page then waits until gocarmo.com serves the new data/spots.json. The rules (what each action
// writes, and when it is allowed) live in admin-core.js, which is tested against the issue-form bot.
import * as C from './admin-core.js';

const API = `https://api.github.com/repos/${C.REPO}`;
const KEY = 'gc.admin.token', FILTER_KEY = 'gc.admin.filter';
const SITE_ROOT = new URL('../', location.href);   // the page lives at /admin/; logo paths start at the site root
const POLL_EVERY = 5000, POLL_FOR = 180000;

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
let sheet = null;          // the open action: { action, ids, snap, logo }
let lastRun = null, lastPublish = null, poll = null, hiddenAt = 0, gl = null;

class GhError extends Error { constructor(status, msg, rate = null) { super(msg || `GitHub ${status}`); this.status = status; this.rate = rate; } }
class UiError extends Error { constructor(msg, opts = {}) { super(msg); Object.assign(this, opts); } }

// ---------- token storage ("Lembrar neste telemóvel" = localStorage, otherwise this tab only) ----------
const stores = () => ['sessionStorage', 'localStorage'].map((k) => { try { return window[k]; } catch (_) { return null; } }).filter(Boolean);
function readToken() { for (const s of stores()) { try { const v = s.getItem(KEY); if (v) return v; } catch (_) {} } return null; }
function forgetToken() { for (const s of stores()) { try { s.removeItem(KEY); } catch (_) {} } }
function keepToken(t, remember) { forgetToken(); try { (remember ? localStorage : sessionStorage).setItem(KEY, t); } catch (_) {} }

// ---------- GitHub ----------
// One wrapper holds the header. Errors carry the status and GitHub's own message only, never the token.
async function gh(method, path, body) {
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
  return json;
}

function errText(e, kind = 'read') {
  if (e instanceof UiError || e instanceof C.RuleError) return e.message;
  if (!(e instanceof GhError)) return 'Algo correu mal nesta página. Recarrega-a e tenta outra vez.';
  const tail = kind === 'write' ? ' O site não mudou.' : '';
  if (e.status === 0) return kind === 'write' ? 'Sem ligação. O site não mudou.' : 'Sem ligação ao GitHub. Verifica a rede e tenta outra vez.';
  if (e.rate) return `Demasiados pedidos ao GitHub. Tenta depois das ${hhmm(e.rate.retry || !e.rate.reset ? new Date(Date.now() + (e.rate.retry || 60) * 1000) : new Date(e.rate.reset * 1000))}.`;
  if (e.status === 401) return 'O token expirou ou foi revogado. Cria um novo.';
  if (kind === 'write' && (e.status === 403 || e.status === 404)) return 'O token não tem permissão de escrita (Contents: Read and write).';
  if (e.status === 404) return 'O token não chega ao repositório rgvduarte/carmo.';
  if (e.status === 403) return 'O GitHub recusou o pedido (403). Confirma as permissões do token.';
  if (e.status === 409 || e.status >= 500) return `O GitHub falhou (código ${e.status}).${tail || ' Tenta outra vez daqui a pouco.'}`;
  return `O GitHub respondeu ${e.status}${e.message ? ` (${e.message})` : ''}.${tail}`;
}

async function readSpots(ref) {
  const c = await gh('GET', `/contents/${C.SPOTS_PATH}?ref=${encodeURIComponent(ref)}`);
  let text, data;
  try { text = C.decodeB64Utf8(c.content); data = JSON.parse(text); } catch (_) { data = null; }
  if (!data || !Array.isArray(data.spots) || !data.title) throw new UiError('data/spots.json no GitHub não é JSON válido. Não mexi em nada.');
  return { text, data };
}

async function listBrands(ref) {
  try {
    const xs = await gh('GET', `/contents/${C.BRANDS}?ref=${encodeURIComponent(ref)}`);
    return Array.isArray(xs) ? xs.filter((x) => x.type === 'file').map((x) => x.name) : [];
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
  forgetToken(); token = null; base = null; sel.clear(); stopPoll();
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
    const repo = await gh('GET', '');
    if (repo && repo.permissions && repo.permissions.push !== true) throw new UiError('A tua conta não pode escrever neste repositório. Pede ao dono acesso de escrita.');
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

// a token kept from an earlier visit: checked quietly, then the list
async function resume(t) {
  token = t;
  enterApp({ check: true });
}

async function enterApp({ check = false } = {}) {
  $('#login').hidden = true; $('#app').hidden = false;
  document.title = 'Espaços · GOCARMO Admin';
  if (check) {
    try {
      const repo = await gh('GET', '');
      if (repo && repo.permissions && repo.permissions.push !== true) return signOut('A tua conta não pode escrever neste repositório.');
    } catch (e) {
      if (e instanceof GhError && (e.status === 401 || e.status === 404)) return signOut(e.status === 401 ? 'O token expirou ou foi revogado. Cria um novo.' : 'Este token já não chega a rgvduarte/carmo. Cria um novo.');
    }
  }
  gh('GET', 'https://api.github.com/user').then((u) => { if (u && u.login) $('#who').textContent = `@${u.login}`; }).catch(() => {});
  await load();
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
  meta.textContent = `Lido às ${hhmm(base.readAt)} · commit ${base.head.slice(0, 7)}`;
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
    const names = r.ids.map((id) => (id === C.TITLE ? 'Fato completo' : `${C.pad2(C.targetOf(base.data, id).n)} ${C.nameOf(base.data, id)}`));
    out.append(`${r.ids[0] === C.TITLE ? '' : `${plural(r.ids.length, 'espaço', 'espaços')}: `}${names.join(', ')} · Total esperado ${C.money(t.net)}${t.disc ? ` (${C.money(t.gross)} −${Math.round(t.disc * 100)}%)` : ''}`);
  }
  const extra = [];
  if (r.unknown.length) extra.push(`Não conheço ${r.unknown.length === 1 ? 'o espaço' : 'os espaços'} ${C.joinPT(r.unknown.map(String))}.`);
  if (r.note) extra.push(r.note);
  if (!r.ids.length && !extra.length) extra.push('Não encontrei números de espaços. Ex.: KONA 01 21 22.');
  if (extra.length) { const b = el('span', r.unknown.length || !r.ids.length ? 'bad' : null, `${r.ids.length ? ' ' : ''}${extra.join(' ')}`); out.appendChild(b); }
}

function saveFilter() { try { localStorage.setItem(FILTER_KEY, filter); } catch (_) {} }

// ---------- actions ----------
const VERB = { reserved: 'Reservar', sold: 'Marcar como vendido', available: 'Libertar' };
function whatFor(raw, ids) {
  if (ids[0] === C.TITLE) return 'o fato completo';
  if (ids.length > 3) return `${ids.length} espaços`;
  return C.joinPT(ids.map((id) => `${C.pad2(C.targetOf(raw, id).n)} ${C.nameOf(raw, id)}`));
}

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
  if (!(await ask(`Libertar ${whatFor(raw, ids)}?`, lines, text, 'Libertar'))) return;
  run({ action, ids, f: { brand: '', url: '', until: '' }, logo: null, snap: C.snapshot(raw, ids) });
}

function openSheet(action, ids) {
  const raw = base.data, today = C.todayUTC(), d = $('#sheet');
  sheet = { action, ids, snap: C.snapshot(raw, ids), logo: null };
  $('#sh-title').textContent = `${VERB[action]} ${whatFor(raw, ids)}`;
  const t = C.totals(raw, ids), sum = $('#sh-sum'); sum.textContent = '';
  sum.append(ids.map((id) => C.labelOf(raw, id)).join(', '), ' · Total esperado ');
  sum.appendChild(el('b', null, C.money(t.net)));
  // one brand holds every target: start from its exact stored name and link (reserve -> sell keeps both)
  const held = ids.map((id) => C.targetOf(raw, id)).filter((x) => x.status !== 'available' && x.brand);
  const one = held.length === ids.length && new Set(held.map((x) => x.brand)).size === 1;
  $('#f-brand').value = one ? held[0].brand : '';
  $('#f-url').value = one ? (held.find((x) => x.url)?.url || '') : '';
  const until = $('#f-until'); until.min = today; until.value = C.addDays(today, 3);
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
  const { action, ids } = sheet, raw = base.data, brand = C.normBrand($('#f-brand').value);
  const warn = $('#sh-warn'); warn.textContent = '';
  if (brand) {
    const g = C.guard(raw, Date.now(), ids, action, brand);
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
  const keep = file;
  clearLogo();
  if (!keep || !sheet) { refreshSheet(); return; }
  const fail = (m) => { err.textContent = m; refreshSheet(); };
  if (keep.size > C.MAX_LOGO) return fail(C.MSG.logoBig);
  let bytes, kind;
  try { bytes = new Uint8Array(await keep.arrayBuffer()); kind = C.checkLogo(bytes); } catch (e) { return fail(e instanceof C.RuleError ? e.message : 'Não consegui abrir esse ficheiro.'); }
  const blob = new Blob([bytes], { type: kind.mime }), url = URL.createObjectURL(blob);
  try { const img = new Image(); img.src = url; await img.decode(); } catch (_) { URL.revokeObjectURL(url); return fail('Não consegui abrir esse ficheiro.'); }
  if (!sheet) { URL.revokeObjectURL(url); return; }
  sheet.logo = { bytes, ext: kind.ext, mime: kind.mime, blob, url, name: keep.name, size: bytes.length };
  $('#tile-w').src = url; $('#tile-b').src = url;
  $('#tiles').hidden = false;
  const info = $('#logo-info'); info.hidden = false; info.textContent = `${keep.name} · ${kb(bytes.length)} · ${kind.ext.toUpperCase()}`;
  $('#see3d').hidden = !webgl();
  refreshSheet();
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
  const g = C.guard(base.data, Date.now(), ids, action, f.brand);
  if (g.blocked.length) { err.textContent = g.blocked.join(' '); return; }
  if (g.confirms.length && !(await ask('Confirmas?', g.confirms, 'Fica como escreveste. Podes mudar outra vez depois.', 'Sim, guardar'))) return;
  const logo = action === 'sold' && sheet.logo ? { ext: sheet.logo.ext, b64: C.bytesToB64(sheet.logo.bytes) } : null;
  run({ action, ids, f, logo, snap: sheet.snap });
}

// ---------- save: one commit on gh-pages ----------
// The snapshot is what the admin saw when the sheet opened. If any target changed since (someone else saved), nothing
// is committed. A moved ref at the last step (422) re-runs the whole sequence once on the new head.
async function save({ action, ids, f, logo, snap }) {
  let logoSha = null;
  for (let attempt = 1; ; attempt++) {
    const head = (await gh('GET', `/git/ref/heads/${C.BRANCH}`)).object.sha;
    if (head !== base.head) { base = { head, ...(await readSpots(head)), readAt: new Date() }; render(); }
    const raw = base.data, now = Date.now();
    const changed = C.changedSince(snap, raw);
    if (changed.length) throw new UiError(conflictText(raw, changed, now), { conflict: true });
    const g = C.guard(raw, now, ids, action, action === 'available' ? undefined : f.brand);
    if (g.blocked.length) throw new UiError(`${g.blocked.join(' ')} Revê e tenta outra vez.`, { conflict: true });
    const commit = await gh('GET', `/git/commits/${head}`);
    const brandFiles = await listBrands(head);
    const today = C.todayUTC(now);
    const res = C.applyAction(raw, ids, action, f, { today, brandFiles, logoExt: logo ? logo.ext : null });
    if (res.text === base.text && !res.writes.length && !res.deletes.length) return { nothing: true };
    if (logo && !logoSha) logoSha = (await gh('POST', '/git/blobs', { content: logo.b64, encoding: 'base64' })).sha;
    const jsonSha = (await gh('POST', '/git/blobs', { content: res.text, encoding: 'utf-8' })).sha;
    const tree = await gh('POST', '/git/trees', {
      base_tree: commit.tree.sha,
      tree: [
        { path: C.SPOTS_PATH, mode: '100644', type: 'blob', sha: jsonSha },
        ...res.writes.map((path) => ({ path, mode: '100644', type: 'blob', sha: logoSha })),
        ...res.deletes.map((path) => ({ path, mode: '100644', type: 'blob', sha: null })),
      ],
    });
    const message = C.commitMessage(raw, ids, action, f);
    const made = await gh('POST', '/git/commits', { message, tree: tree.sha, parents: [head] });
    try {
      await gh('PATCH', `/git/refs/heads/${C.BRANCH}`, { sha: made.sha, force: false });
    } catch (e) {
      if (!(e instanceof GhError)) throw e;
      let landed = false;
      if (e.status === 0 || e.status >= 500) { try { landed = (await gh('GET', `/git/ref/heads/${C.BRANCH}`)).object.sha === made.sha; } catch (_) {} }
      if (!landed) {
        const moved = e.status === 422 || e.status === 0 || e.status >= 500;
        if (moved && attempt === 1) continue;
        if (e.status === 422) throw new UiError('Alguém guardou ao mesmo tempo duas vezes seguidas. Recarreguei a lista: confirma e tenta outra vez.', { conflict: true, reload: true });
        throw e;
      }
    }
    const data = JSON.parse(res.text);
    base = { head: made.sha, text: res.text, data, readAt: new Date() };
    return { commit: made, data, message };
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
function prMsg(text, bad = false) { const m = $('#pr-msg'); m.textContent = text; m.classList.toggle('bad', bad); }

function openProgress({ action, ids }) {
  const d = $('#sheet');
  $('#sh-title').textContent = `${VERB[action]} ${whatFor(base.data, ids)}`;
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
  busy = true; lastRun = intent; stopPoll();
  openProgress(intent);
  try {
    const r = await save(intent);
    busy = false;
    $('#sh-x').hidden = false; $('#pr-close').disabled = false;
    if (r.nothing) {
      step('save', 'done', 'Nada mudou.'); step('pub', '', ''); step('live', '', '');
      prMsg('Os dados já estavam assim, por isso não fiz nenhum commit.');
      return;
    }
    step('save', 'done', `Guardado ✓ (commit ${r.commit.sha.slice(0, 7)})`);
    sel.clear(); $('#ref').value = ''; onRef(); render();
    publish(intent, r);
  } catch (e) {
    busy = false;
    $('#sh-x').hidden = false; $('#pr-close').disabled = false;
    if (e instanceof GhError && e.status === 401) { signOut('O token expirou ou foi revogado. Cria um novo.'); return; }
    step('save', 'fail', 'Não guardei.'); step('pub', '', ''); step('live', '', '');
    prMsg(errText(e, 'write'), true);
    if (e.conflict) { if (e.reload) load({ quiet: true }); else render(); }
    else $('#pr-retry').hidden = false;
  }
}

function links(ids, data, commit, { site = true, actions = false } = {}) {
  const ul = $('#pr-links'); ul.textContent = '';
  const add = (href, label, hint) => { const li = el('li'), a = el('a', null, label); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.appendChild(el('span', null, hint)); li.appendChild(a); ul.appendChild(li); };
  if (site) {
    for (const id of ids.slice(0, 4)) add(C.liveLink(data, id), `Ver no site: ${id === C.TITLE ? 'fato completo' : `${C.pad2(C.targetOf(data, id).n)} ${C.nameOf(data, id)}`}`, '↗');
    if (ids.length > 4) ul.appendChild(el('li', 'more', `e mais ${ids.length - 4}`));
  }
  if (commit && /^https:\/\/github\.com\//.test(commit.html_url || '')) add(commit.html_url, 'Ver commit', `${commit.sha.slice(0, 7)} ↗`);
  if (actions) add(`https://github.com/${C.REPO}/actions`, 'Ver publicação no GitHub', '↗');
}

// Poll the live file until it carries the change (GitHub Pages takes about a minute). Phones throttle timers in the
// background, so coming back to the tab checks at once.
function publish(intent, r) {
  stopPoll();
  lastPublish = { intent, r };
  const t0 = performance.now();
  let timer = 0, inflight = false, done = false;
  const clock = () => { const s = Math.floor((performance.now() - t0) / 1000); step('pub', 'on', `A publicar… ${Math.floor(s / 60)}:${C.pad2(s % 60)}`); };
  clock();
  const tick = setInterval(clock, 1000);
  links([], r.data, r.commit, { site: false });
  prMsg('O site atualiza-se sozinho. Podes fechar: eu aviso quando estiver no ar.');
  const finish = (ok) => {
    stop();
    if (ok) {
      step('pub', 'done', 'Publicado'); step('live', 'done', 'No ar ✓');
      prMsg(''); links(intent.ids, r.data, r.commit);
      if (!$('#sheet').open) toast(`No ar ✓ · ${whatFor(r.data, intent.ids)}`);
    } else {
      step('pub', 'wait', 'Ainda a publicar');
      prMsg('Guardado, mas ainda não está no ar. O GitHub costuma demorar 1 a 2 minutos.');
      links([], r.data, r.commit, { site: false, actions: true });
      $('#pr-check').hidden = false;
    }
  };
  const check = async () => {
    if (done || inflight) return;
    inflight = true;
    const ok = await liveMatches(intent.ids, r.data);
    inflight = false;
    if (done) return;
    if (ok) finish(true);
    else if (performance.now() - t0 >= POLL_FOR) finish(false);
    else timer = setTimeout(check, POLL_EVERY);
  };
  const onVis = () => { if (!document.hidden && !done) { clearTimeout(timer); check(); } };
  function stop() { done = true; clearTimeout(timer); clearInterval(tick); document.removeEventListener('visibilitychange', onVis); if (poll && poll.stop === stop) poll = null; }
  document.addEventListener('visibilitychange', onVis);
  poll = { stop };
  timer = setTimeout(check, POLL_EVERY);
}
function stopPoll() { if (poll) poll.stop(); }

async function liveMatches(ids, next) {
  try {
    const res = await fetch(`${C.SITE}/data/spots.json?t=${Date.now()}`, { cache: 'no-store', credentials: 'omit' });
    if (!res.ok) return false;
    const live = await res.json();
    if (!live || live.updated !== next.updated || !Array.isArray(live.spots)) return false;
    return ids.every((id) => {
      const a = C.targetOf(live, id), b = C.targetOf(next, id);
      return !!a && !!b && ['status', 'brand', 'url', 'until', 'logo'].every((k) => (a[k] ?? null) === (b[k] ?? null));
    });
  } catch (_) { return false; }
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
  tabs.hidden = true; loading.hidden = false;
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
  $('#logout').addEventListener('click', () => signOut());
  $('#reload').addEventListener('click', () => { if (!busy) load(); });
  $('#ref').addEventListener('input', onRef);
  $$('input[name="filter"]').forEach((r) => r.addEventListener('change', () => { if (r.checked) { filter = r.value; saveFilter(); render(); } }));
  $('#bar-clear').addEventListener('click', () => { sel.clear(); syncRows(); });
  $$('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act)));

  const d = $('#sheet');
  $('#sh-form').addEventListener('submit', submitSheet);
  for (const id of ['#f-brand', '#f-url', '#f-until']) $(id).addEventListener('input', () => { $('#sh-err').textContent = ''; refreshSheet(); });
  $('#f-logo').addEventListener('change', pickLogo);
  $('#see3d').addEventListener('click', open3d);
  const closeSheet = () => { if (!busy && d.open) d.close(); };
  $('#sh-x').addEventListener('click', closeSheet);
  $('#sh-cancel').addEventListener('click', closeSheet);
  $('#pr-close').addEventListener('click', closeSheet);
  $('#pr-retry').addEventListener('click', () => { if (lastRun) run(lastRun); });
  $('#pr-check').addEventListener('click', () => { if (lastPublish) { $('#pr-check').hidden = true; publish(lastPublish.intent, lastPublish.r); } });
  d.addEventListener('cancel', (e) => { if (busy) e.preventDefault(); });
  // 'close' arrives after the fact: a sheet opened again meanwhile keeps its state
  d.addEventListener('close', () => { if (d.open) return; clearLogo(); sheet = null; });

  $('#v3d-x').addEventListener('click', close3d);
  $('#v3d-close').addEventListener('click', close3d);
  $('#v3d').addEventListener('close', () => { if (v3d && !$('#v3d').open) v3d.close(); });
  $$('#v3d-tabs [data-item]').forEach((b) => b.addEventListener('click', async () => {
    if (!v3d) return;
    $$('#v3d-tabs [data-item]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    try { await v3d.show(b.dataset.item); } catch (e) { console.error(e); toast('O capacete 3D não abriu neste aparelho.'); }
  }));

  const net = () => { $('#offline').hidden = navigator.onLine !== false; };
  addEventListener('online', net); addEventListener('offline', net); net();
  // back after a while: the list may be stale (someone else saved, or the issue form ran)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = performance.now(); return; }
    if (token && base && !busy && hiddenAt && performance.now() - hiddenAt > 60000 && !$$('dialog').some((x) => x.open)) load({ quiet: true });
  });
  addEventListener('resize', () => { if (sel.size) document.documentElement.style.setProperty('--bar-h', `${$('#bar').offsetHeight}px`); });
}

function boot() {
  try { const f = localStorage.getItem(FILTER_KEY); if (['all', 'available', 'reserved', 'sold'].includes(f)) filter = f; } catch (_) {}
  bind();
  const t = readToken();
  if (t && C.TOKEN_RE.test(t)) resume(t); else { forgetToken(); showLogin(); }
}

// frame-ancestors is ignored in a meta CSP: a framed copy of this page shows nothing
if (window.top !== window.self) document.documentElement.hidden = true;
else boot();
