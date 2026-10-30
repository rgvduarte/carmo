// Admin page (/admin/): reserve, sell and free the suit and helmet spots while the site is live.
// Each action is ONE commit on gh-pages, made with the GitHub Git Data API and the owner's own token (kept in this
// browser only). The page then waits until gocarmo.com serves the new data/spots.json. The rules (what each action
// writes, and when it is allowed) live in admin-core.js, which is tested against the issue-form bot.
import * as C from './admin-core.js';
import { GhError, UiError, transient, readToken, forgetToken, keepToken, gh, UNKNOWN, errText, checkToken, signInText, getToken, setToken, commitFiles, readText } from './admin-gh.js';
import { findBrand, countFor, spotsAllow, retireOver, deletesFor, applyBrand, fileText } from './admin-montra-core.js';
import { MONTRA_PATH } from './montra-core.js';
import { lisbonDay, rulesOf, isDay, noRacesLeft } from './season-rules.js';
import { SITE } from './data.js';
import './internal.js';   // this browser is the owner's: the public pages never load Google Analytics in it

const FILTER_KEY = 'gc.admin.filter';   // (the token's key and the GitHub calls: admin-gh.js)
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

let base = null;           // { head, text, data, readAt }: data/spots.json at the head of gh-pages
let sel = new Set();
let filter = 'all';
let busy = false;          // a save is running (one at a time)
let sheet = null;          // the open action: { action, ids, snap, logo, untilTouched }
let lastRun = null, hiddenAt = 0, gl = null;
let stash = null;          // the sheet as it was when the token stopped working mid-save; it comes back after signing in

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
  forgetToken(); setToken(null); base = null; sel.clear(); stopPublishing();
  forgetReqKey(); pasted = null; $('#inbox').hidden = true;
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
  // (admin-gh.js checkToken: the account can write, a classic token holds public_repo only, a fine-grained one can write)
  try { await checkToken(t); } catch (x) {
    err.textContent = signInText(x);
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
  inboxInit();
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
  renderInbox();
}

function row(v, raw, id, today, suitCount = 0) {
  const isTitle = id === C.TITLE, x = C.targetOf(v, id), st = C.statusOf(v, x, today);
  const li = el('li', `row${isTitle ? ' title' : ''}${sel.has(id) ? ' sel' : ''}`);
  li.dataset.id = id;
  const lab = el('label'), cb = el('input');
  cb.type = 'checkbox'; cb.checked = sel.has(id); cb.value = id;
  cb.addEventListener('change', () => toggle(id, cb.checked));
  lab.append(cb, el('span', 'n', isTitle ? 'FATO' : C.pad2(x.n)), el('span', 'nm', C.nameOf(raw, id)), el('span', 'pr', C.money(x.price)));
  let sub = isTitle && st.key === 'available' ? `Os ${suitCount} espaços do fato, de uma vez · CARMO FATO` : st.sub;
  if (st.key === 'reserved' && !x.byTitle && C.targetOf(raw, id).request) sub = `${sub ? `${sub} · ` : ''}pedido do site`;   // worker/requests.js
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
  // a pasted request on its own spots: its summary has the two actions (with its brand, its 48 h, its request); the bar
  // would only cover them. Another selection brings the bar back.
  const viaPaste = ids.length > 0 && !!pasted && !$('#paste').hidden && sameIds(ids, pasted.ids);
  bar.hidden = !ids.length || viaPaste;
  document.documentElement.style.setProperty('--bar-h', bar.hidden ? '0px' : `${bar.offsetHeight}px`);
  if (bar.hidden) return;
  $('#bar-n').textContent = ids[0] === C.TITLE ? 'Fato completo' : plural(ids.length, 'selecionado', 'selecionados');
  const t = C.totals(base.data, ids), note = C.totalNote(t);
  $('#bar-total').textContent = note ? `${C.money(t.net)} ${note}` : C.money(t.net);
  const now = Date.now();
  $$('[data-act]').forEach((b) => { const g = C.guard(base.data, now, ids, b.dataset.act); b.setAttribute('aria-disabled', String(g.blocked.length > 0)); });
}

// ---------- «Colar pedido ou referência» ----------
// A bare payment reference (CARMO 01 21 22, or the older KONA 01 21 22) selects those spots, as before. A pasted
// request (the site's message by WhatsApp or email, or its link) selects them too and shows what it asks for, checked
// against the prices of now, with «Reservar 48 h» and «Marcar como vendido». Every piece of the text is shown with
// textContent only.
const REF_HINT = 'É o descritivo da transferência ou do MB WAY, ou a mensagem do pedido (WhatsApp, email ou o link). Seleciona esses espaços.';
let pasted = null;   // the last parsePaste() result of a request, for its two buttons
let refLen = 0;      // the field's length before this input: a jump is a paste

function onRef() {
  const out = $('#ref-out'), box = $('#paste'), ta = $('#ref'), txt = ta.value;
  const jump = txt.length - refLen > 30;
  refLen = txt.length;
  out.classList.remove('ok'); out.textContent = '';
  box.hidden = true; box.textContent = ''; pasted = null;
  ta.classList.remove('msg');
  if (!base || !txt.trim()) { fitRef(); if (base) { out.textContent = REF_HINT; updateBar(); } return; }
  const r = C.parsePaste(txt, base.data);
  sel = new Set(r.ids);
  if (r.ids.length && filter !== 'all') { filter = 'all'; saveFilter(); render(); } else syncRows();
  if (r.kind !== 'ref') {
    ta.classList.add('msg');   // about four lines: the summary stays in view
    fitRef();
    showPaste(r);
    updateBar();
    // a pasted message on a phone: the keyboard goes, and the summary with its buttons comes up above the bar
    if (jump) { ta.blur(); requestAnimationFrame(revealPaste); setTimeout(revealPaste, 350); }
    return;
  }
  fitRef();
  if (r.ids.length) {
    out.classList.add('ok');
    const t = C.totals(base.data, r.ids);
    const names = r.ids.map((id) => shortName(base.data, id));
    const note = C.totalNote(t);
    // (a reference carries no date: the price of a request made today)
    out.append(`${r.ids[0] === C.TITLE ? '' : `${plural(r.ids.length, 'espaço', 'espaços')}: `}${names.join(', ')} · Total de hoje ${C.money(t.net)}${note ? ` ${note}` : ''}`);
  }
  const extra = [];
  if (r.unknown.length) extra.push(`Não conheço ${r.unknown.length === 1 ? 'o espaço' : 'os espaços'} ${C.joinPT(r.unknown.map(String))}.`);
  if (r.note) extra.push(r.note);
  if (!r.ids.length && !extra.length) extra.push('Não encontrei números de espaços. Ex.: CARMO 01 21 22.');
  if (extra.length) { const b = el('span', r.unknown.length || !r.ids.length ? 'bad' : null, `${r.ids.length ? ' ' : ''}${extra.join(' ')}`); out.appendChild(b); }
  refBox(r);
}

// the field grows with a pasted message (up to a point, see .msg) and shrinks back
function fitRef() {
  const ta = $('#ref');
  ta.style.height = 'auto';
  if (ta.value.includes('\n') || ta.scrollHeight > ta.clientHeight + 2) ta.style.height = `${Math.min(ta.scrollHeight + 2, Math.round(innerHeight * 0.4))}px`;
  else ta.style.height = '';
}
// the summary and its buttons above the sticky bar, without pushing the summary's first line off the top
function revealPaste() {
  const box = $('#paste'), out = $('#ref-out');
  if (box.hidden) return;
  const bar = $('#bar'), room = innerHeight - (bar.hidden ? 0 : bar.offsetHeight) - 12;
  const bottom = box.getBoundingClientRect().bottom, top = out.getBoundingClientRect().top;
  if (bottom > room) scrollBy({ top: Math.max(0, Math.min(bottom - room, top - 12)), left: 0, behavior: 'instant' });
}
// a typed reference is one line: Enter closes the keyboard, as before; a pasted message keeps its lines
function onRefKey(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && !$('#ref').value.includes('\n')) { e.preventDefault(); $('#ref').blur(); }
}
// the summary again (the Pedidos list just opened, say), the selection left as it is
function redrawRef() {
  const txt = $('#ref').value;
  if (!base || !txt.trim()) return;
  const r = C.parsePaste(txt, base.data);
  $('#paste').textContent = ''; $('#paste').hidden = true;
  if (r.kind !== 'ref') showPaste(r); else refBox(r);
  updateBar();
}

// a bare reference whose spots a request of the site holds: say so, and sell them through that request
function refBox(r) {
  const box = $('#paste'), raw = base.data, owner = r.ids.length ? heldBy(raw, r.ids) : '';
  if (!owner) return;
  const notes = el('ul', 'notes');
  notes.appendChild(el('li', null, holdText(raw, r.ids, owner)));
  if (inboxOn() && !inbox.list) notes.appendChild(el('li', null, KEY_FOR_LOGO));
  box.appendChild(notes);
  if (inboxOn()) {
    const acts = el('div', 'paste-acts'), b = el('button', 'btn gold', 'Confirmar compra');
    b.type = 'button';
    b.addEventListener('click', () => act('sold'));
    acts.appendChild(b); box.appendChild(acts);
  }
  box.hidden = false;
}

function showPaste(p) {
  const out = $('#ref-out'), box = $('#paste'), raw = base.data, now = Date.now();
  pasted = p;
  // a message: the price of its own month (its «Desconto de época (…, mês N)» line), else the full price (a message
  // with no season line is from before February); a link carries no date: today's price, as the bar and a reference
  const ids = p.ids, link = p.kind === 'link';
  const t = !ids.length ? null : link ? C.totals(raw, ids) : C.totals(raw, ids, { m: p.m ?? 0 });
  out.classList.toggle('ok', ids.length > 0);
  out.textContent = !ids.length ? (p.kind === 'link' ? 'Este link não tem espaços que eu conheça.' : 'Li o pedido, mas não encontrei os espaços.')
    : `${p.kind === 'link' ? 'Link do pedido' : 'Pedido'}: ${ids[0] === C.TITLE ? 'fato completo' : plural(ids.length, 'espaço', 'espaços')} · Total ${C.money(t.net)}`;
  const dl = el('dl', 'pv');
  const row = (k, v, cls) => { if (!v) return; const d = el('div', cls ? `pv-r ${cls}` : 'pv-r'); d.append(el('dt', null, k), el('dd', null, v)); dl.appendChild(d); };
  row('Espaços', ids.map((id) => shortName(raw, id)).join(', '));
  row('Marca', p.brand);
  row('Nome', p.name);
  row('Email', p.email);
  row('Telefone', p.phone);
  row('NIF', p.nif ? `${p.nif}${p.nifOk === true ? ' ✓' : p.nifOk === false ? ' · não confere' : ''}` : '', p.nifOk === false ? 'bad' : '');
  row('Pagamento', C.PAY_LABEL[p.pay] || '');
  row('Referência', p.ref);
  if (p.m) row('Época', C.seasonLine(p.m));
  else if (link && t) row('Época', `preço de hoje (sem data no link)${t.m > 0 ? ` · ${C.seasonLine(t.m, t.seasonBp)}` : ''}`);
  if (t) {
    const said = p.stated;
    row('Total', said === null ? `${C.money(t.net)} (o pedido não diz)` : said === t.net ? `${C.money(t.net)} ✓ confere` : `${C.money(t.net)} · o pedido diz ${C.money(said)}`, said !== null && said !== t.net ? 'bad' : '');
  }
  if (p.lang === 'en') row('Língua', 'Inglês');
  if (dl.children.length) box.appendChild(dl);

  // the request of the site behind these spots (they carry its id), or the one the message names (only when that
  // request covers these very spots: the buyer's own words could name any request, and their ids are public)
  const owner = ids.length ? heldBy(raw, ids) : '', named = namedReq(p, ids), reqId = owner || named;
  const req = inboxFind(reqId), keyMissing = !!reqId && inboxOn() && !inbox.list;

  // what stands in the way now, and what the text itself says against itself
  const notes = el('ul', 'notes');
  if (owner) notes.appendChild(el('li', null, holdText(raw, ids, owner)));
  if (!owner && p.request && !named) notes.appendChild(el('li', null, `A mensagem fala do pedido ${p.request}, que é de outros espaços: não o uso.`));
  if (keyMissing) notes.appendChild(el('li', null, KEY_FOR_LOGO));
  if (p.unknown.length) notes.appendChild(el('li', 'block', `Não conheço ${p.unknown.length === 1 ? 'o espaço' : 'os espaços'} ${C.joinPT(p.unknown)}.`));
  for (const n of p.notes) notes.appendChild(el('li', null, n));
  if (ids.length && !owner) {
    const g = C.guard(raw, now, ids, 'reserved', p.brand || undefined, C.holdUntil(now));
    for (const m of g.blocked) notes.appendChild(el('li', 'block', m));
    for (const m of g.confirms) notes.appendChild(el('li', null, m));
  }
  if (!p.brand && ids.length && !req) notes.appendChild(el('li', null, 'O pedido não diz a marca: escreve-a ao reservar ou vender.'));
  if (notes.children.length) box.appendChild(notes);

  // held by its request: the first button gives it two more days (a new reservation would cut it loose)
  const extend = !!owner && (req ? req.status === 'novo' : keyMissing);
  const acts = el('div', 'paste-acts');
  const b1 = el('button', 'btn', extend ? 'Prolongar 48 h' : 'Reservar 48 h'), b2 = el('button', 'btn gold', 'Marcar como vendido');
  b1.type = b2.type = 'button';
  b1.addEventListener('click', () => pasteAct('reserved'));
  b2.addEventListener('click', () => pasteAct('sold'));
  b1.disabled = !ids.length || (extend && keyMissing);
  b2.disabled = !ids.length;
  acts.append(b1, b2);
  box.appendChild(acts);
  box.hidden = false;
}

const KEY_FOR_LOGO = 'Este pedido é do site: escreve a chave dos pedidos (em Pedidos) para vender com o logótipo.';
// the request of the site whose hold every one of these spots carries (lapsed or not), or ''
function heldBy(raw, ids) {
  const reqs = new Set(ids.map((id) => { const x = C.targetOf(raw, id); return x && x.status === 'reserved' && x.request ? x.request : ''; }));
  return reqs.size === 1 && !reqs.has('') ? [...reqs][0] : '';
}
function holdText(raw, ids, id) {
  const x = C.targetOf(raw, ids[0]);
  return C.lapsed(x, Date.now()) ? `A reserva do pedido ${id} do site acabou a ${C.fmtDay(x.until)}: o espaço já está livre no site.` : `Já reservado pelo site até ${C.fmtDay(x.until)} (pedido ${id}).`;
}
const sameIds = (a, b) => { const x = C.sortTargets(base.data, a), y = C.sortTargets(base.data, b); return x.length === y.length && x.every((v, i) => v === y[i]); };
// the request a pasted text names on a «Pedido:» line, while it may be the one for these spots: '' once the Pedidos
// list shows it covers other spots (before the list is in, it is still asked for, and checked again once it is)
function namedReq(p, ids) {
  if (!p.request) return '';
  const r = inboxFind(p.request);
  return !r || !ids.length || sameIds(reqIds(r), ids) ? p.request : '';
}

// A sale of spots that a request of the site holds goes through that request: its logo goes to the site with the
// sale, and the request closes. True when it took over (that request's sheet, or the ask for the key first).
function saleOfRequest(ids, again, id = '') {
  const rid = id || heldBy(base.data, ids);
  if (!rid || !inboxOn()) return false;
  if (!inbox.list) { needKey(rid, again); return true; }
  const r = inboxFind(rid);
  if (!r || r.status === 'cancelado') return false;
  confirmPurchase(r);
  return true;
}

// «Reservar 48 h»: the reserve sheet with the brand and the date of now + 48 h; on spots the site holds for the
// request, «Prolongar 48 h» of that request. «Marcar como vendido»: the sell sheet with the brand; for a request of the
// site, that request's sale with its logo (after the key, if it is not in yet).
function pasteAct(action) {
  const p = pasted;
  if (!p || !base || !p.ids.length) return;
  if (busy) { toast('Espera: ainda estou a guardar.'); return; }
  const ids = C.sortTargets(base.data, p.ids.filter((id) => C.targetOf(base.data, id)));
  // (with the list just brought in by needKey, this runs again: a named request of other spots is then let go)
  const owner = heldBy(base.data, ids), reqId = owner || namedReq(p, ids);
  if (reqId && inboxOn() && !inbox.list && (action === 'sold' || owner)) { needKey(reqId, () => pasteAct(action)); return; }
  const req = inboxFind(reqId);
  if (action === 'sold' && req && req.status !== 'cancelado') { confirmPurchase(req); return; }
  if (action === 'reserved' && owner && req && req.status === 'novo') { extendReq(req); return; }
  const g = C.guard(base.data, Date.now(), ids, action);
  if (g.blocked.length) { toast(g.blocked.join(' ')); return; }
  sel = new Set(ids); syncRows();
  openSheet(action, ids);
  if (p.brand) $('#f-brand').value = p.brand;
  if (action === 'reserved') { $('#f-until').value = C.holdUntil(); sheet.untilTouched = true; }
  refreshSheet();
}

// ---------- «Pedidos»: the requests placed on the site (worker/requests.js), shown when SITE.requestsApi is set ----------
// The Worker's key (ADMIN_KEY) is asked once and kept in this tab only (sessionStorage). «Confirmar compra» runs the
// usual sale with the request's logo (this page's GitHub token commits it, as a manual sale) and then closes the
// request on the Worker; «Cancelar» and «Prolongar 48 h» are the Worker's own (it frees or extends the hold).
const REQ_KEY = 'gc.admin.pedidos';
const CHANNEL = { whatsapp: 'WhatsApp', email: 'Email', instagram: 'Instagram', site: 'Site' };
const inbox = { key: '', list: null, logos: new Map(), busy: new Set(), at: null, after: null };
const reqApi = () => String(SITE.requestsApi || '').trim().replace(/\/+$/, '');
const reqIds = (r) => (r.title ? [C.TITLE] : Array.isArray(r.items) ? r.items : []);
const inboxFind = (id) => (id && inbox.list ? inbox.list.find((r) => r.id === id) || null : null);
const inboxOn = () => !$('#inbox').hidden && $('#inbox-off').hidden;   // the Pedidos list works on this page
class ReqError extends Error { constructor(status, code, campo = '') { super(code || `pedidos ${status}`); this.status = status; this.code = code || ''; this.campo = campo || ''; } }

function readReqKey() { try { return sessionStorage.getItem(REQ_KEY) || ''; } catch (_) { return ''; } }
function keepReqKey(k) { try { sessionStorage.setItem(REQ_KEY, k); } catch (_) {} }
function dropLogos() { for (const x of inbox.logos.values()) if (x.url) URL.revokeObjectURL(x.url); inbox.logos.clear(); }
function forgetReqKey() {
  try { sessionStorage.removeItem(REQ_KEY); } catch (_) {}
  inbox.key = ''; inbox.list = null; inbox.at = null; inbox.after = null; dropLogos();
  $('#inbox-why').hidden = true;
}

// a sale of a request of the site needs its logo, and only the Pedidos list has it: ask for the key (or wait for the
// list), then carry on with what was asked (`again`)
function needKey(id, again) {
  inbox.after = again ? { fn: again, at: Date.now() } : null;
  const why = $('#inbox-why');
  why.textContent = `Estes espaços são do pedido ${id} do site: escreve a chave dos pedidos para vender com o logótipo.`;
  why.hidden = false;
  if (inbox.key) { toast('A abrir os pedidos…'); loadInbox(); return; }
  $('#inbox').scrollIntoView({ block: 'start', behavior: 'instant' });
  $('#inbox-key').focus({ preventScroll: true });
}
function runAfter() {
  const a = inbox.after;
  inbox.after = null; $('#inbox-why').hidden = true;
  if (a && base && !busy && Date.now() - a.at < 600000) a.fn();
}

// the page's CSP lets it reach the Worker only at the address stamp.mjs wrote into connect-src
function cspAllows(url) {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const m = meta && meta.content.match(/connect-src([^;]*)/);
  let origin;
  try { origin = new URL(url).origin; } catch (_) { return false; }
  return !meta || (!!m && m[1].trim().split(/\s+/).includes(origin));
}

async function reqCall(method, path, body, { blob = false } = {}) {
  let res;
  try {
    res = await fetch(`${reqApi()}${path}`, {
      method, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${inbox.key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) { throw new ReqError(0, 'rede'); }
  if (!res.ok) { let j = null; try { j = await res.json(); } catch (_) {} throw new ReqError(res.status, j && typeof j.error === 'string' ? j.error : '', j && typeof j.campo === 'string' ? j.campo : ''); }
  return blob ? res.blob() : res.json();
}
function reqErrText(e) {
  if (!(e instanceof ReqError)) return 'Algo correu mal nesta página. Recarrega-a e tenta outra vez.';
  if (e.status === 0) return 'Sem ligação aos pedidos. Verifica a rede e tenta outra vez.';
  if (e.status === 401) return 'A chave dos pedidos não está certa.';
  if (e.status === 429) return 'Demasiadas tentativas com a chave errada. Espera 10 minutos.';
  if (e.code === 'estado') return 'Este pedido já está fechado.';
  if (e.code === 'contrato') return 'Este pedido tem um patrocínio registado: apaga primeiro esse registo em Patrocínios.';
  if (e.code === 'ocupado') return 'Os espaços deste pedido já não estão reservados por ele.';
  if (e.code === 'config') return 'Os pedidos ainda não estão prontos no Cloudflare (falta um secret). Vê worker/README.md.';
  if (e.code === 'campos' && e.campo === 'paidAt') return 'Os pedidos não aceitaram a data do pagamento (de 1 jan. 2026 a amanhã).';
  if (e.code === 'campos' && e.campo === 'amount') return 'Os pedidos não aceitaram o montante (euros, sem cêntimos, até 100 000 €).';
  if (e.status === 502) return 'O GitHub falhou. Tenta outra vez daqui a pouco.';
  if (e.code === 'interno' || e.status >= 500) return `O serviço dos pedidos falhou (código ${e.status}). Atualiza a lista para ver em que ficou e tenta outra vez.`;
  if (e.status === 404) return 'Este pedido já não existe.';
  return `Os pedidos responderam com um erro (código ${e.status}).`;
}

function inboxInit() {
  const api = reqApi(), sec = $('#inbox');
  sec.hidden = !api;
  if (!api) return;
  if (!/^https:\/\//.test(api) || !cspAllows(api)) {
    const off = $('#inbox-off');
    off.hidden = false;
    off.textContent = 'O endereço dos pedidos (SITE.requestsApi) ainda não está autorizado nesta página: corre node scripts/stamp.mjs e publica.';
    $('#inbox-login').hidden = true; $('#inbox-body').hidden = true; $('#inbox-reload').hidden = true;
    return;
  }
  inbox.key = inbox.key || readReqKey();
  renderInbox();
  if (inbox.key) loadInbox();
}

async function inboxSignIn(e) {
  e.preventDefault();
  const input = $('#inbox-key'), err = $('#inbox-err'), btn = $('#inbox-go'), k = input.value.trim();
  err.textContent = '';
  if (k.length < 16) { err.textContent = 'A chave tem pelo menos 16 caracteres.'; input.focus(); return; }
  btn.disabled = true; btn.textContent = 'A abrir…';
  inbox.key = k;
  try {
    const j = await reqCall('GET', '/pedidos');
    keepReqKey(k); input.value = '';
    setInbox(j);
  } catch (x) {
    inbox.key = '';
    err.textContent = reqErrText(x);
  } finally { btn.disabled = false; btn.textContent = 'Abrir pedidos'; }
  renderInbox();
}

async function loadInbox({ quiet = false } = {}) {
  if (!inbox.key) return;
  const meta = $('#inbox-meta'), btn = $('#inbox-reload');
  btn.classList.add('busy'); btn.disabled = true;
  if (!quiet && !inbox.list) meta.textContent = 'A ler os pedidos…';
  try { setInbox(await reqCall('GET', '/pedidos')); } catch (e) {
    if (e instanceof ReqError && e.status === 401) { forgetReqKey(); renderInbox(); $('#inbox-err').textContent = 'A chave dos pedidos mudou ou não está certa. Escreve-a outra vez.'; return; }
    meta.textContent = reqErrText(e); meta.classList.add('bad');
  } finally { btn.classList.remove('busy'); btn.disabled = false; }
}
function setInbox(j) {
  inbox.list = Array.isArray(j && j.pedidos) ? j.pedidos.filter((r) => r && typeof r.id === 'string') : [];
  inbox.list.sort((a, b) => (String(a.at) < String(b.at) ? 1 : String(a.at) > String(b.at) ? -1 : 0));   // newest first
  inbox.at = new Date();
  renderInbox();
  // a pasted request may now match one of these: its summary again, the selection left as it is
  redrawRef();
  runAfter();
}

function renderInbox() {
  if ($('#inbox').hidden) return;
  const has = !!inbox.key;
  $('#inbox-login').hidden = has; $('#inbox-body').hidden = !has; $('#inbox-reload').hidden = !has;
  $('#inbox-off').hidden = true;
  $('#inbox-n').textContent = '';
  if (!has || !inbox.list) { if (has) { $('#inbox-list').textContent = ''; $('#inbox-empty').hidden = true; $('#inbox-closed').hidden = true; } return; }
  const meta = $('#inbox-meta'); meta.classList.remove('bad');
  const open = inbox.list.filter((r) => r.status === 'novo'), closed = inbox.list.filter((r) => r.status !== 'novo');
  meta.textContent = `${plural(open.length, 'aberto', 'abertos')} · atualizado às ${hhmm(inbox.at)}`;
  $('#inbox-n').textContent = open.length ? String(open.length) : '';
  const ul = $('#inbox-list'); ul.textContent = '';
  for (const r of open) ul.appendChild(reqCard(r));
  $('#inbox-empty').hidden = open.length > 0;
  const cl = $('#inbox-closed-list'); cl.textContent = '';
  for (const r of closed.slice(0, 30)) cl.appendChild(reqCard(r));
  $('#inbox-closed').hidden = !closed.length;
  $('#inbox-closed-n').textContent = String(closed.length);
}

// '23 out., 14:05' in this phone's time
function atText(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${C.fmtDay(`${d.getFullYear()}-${C.pad2(d.getMonth() + 1)}-${C.pad2(d.getDate())}`)}, ${hhmm(d)}`;
}
// the request's spots as the list has them now: sold to its brand already (a manual sale), or no longer its own
function reqStanding(r) {
  if (!base) return { soldToBrand: false, noLogo: false, lines: [] };
  const raw = base.data, v = C.effective(raw, Date.now()), today = C.todayUTC(), ids = reqIds(r), lines = [];
  let sold = ids.length > 0, noLogo = false;
  for (const id of ids) {
    const x = C.targetOf(raw, id), w = C.targetOf(v, id);
    if (!x) { lines.push(`O espaço ${id} já não existe.`); sold = false; continue; }
    if (!(x.status === 'sold' && x.brand === r.brand)) sold = false;
    if (!x.logo) noLogo = true;
    if (r.status === 'novo' && !(x.status === 'reserved' && x.request === r.id) && !(x.status === 'sold' && x.brand === r.brand)) lines.push(`${C.labelOf(raw, id)}: ${C.statusOf(v, w, today).chip}`);
  }
  return { soldToBrand: sold, noLogo: sold && noLogo, lines };
}

function reqCard(r) {
  const raw = base ? base.data : null, ids = reqIds(r), open = r.status === 'novo';
  const li = el('li', `req${open ? '' : ' done'}`);
  li.dataset.id = r.id;
  const head = el('div', 'req-head');
  const fig = el('div', 'req-logo');
  if (open) { const img = el('img'); img.alt = `Logótipo de ${r.brand || 'marca'}`; img.width = 72; img.height = 48; fig.appendChild(img); thumb(r.id, img); }
  const main = el('div', 'req-main');
  main.append(el('p', 'req-brand', r.brand || 'Sem marca'), el('p', 'req-spots', ids.map((id) => (raw && C.targetOf(raw, id) ? shortName(raw, id) : id)).join(', ')));
  head.append(fig, main, el('p', 'req-total mono', typeof r.total === 'number' ? C.money(r.total) : ''));
  li.appendChild(head);
  li.appendChild(el('p', 'req-meta', [atText(r.at), CHANNEL[r.channel], C.PAY_LABEL[r.pay], r.lang === 'en' ? 'em inglês' : '', `pedido ${r.id}`].filter(Boolean).join(' · ')));
  const season = reqSeason(r);
  if (season) li.appendChild(el('p', 'req-season', season));
  const who = [r.name ? `Nome: ${r.name}` : '', r.email ? `Email: ${r.email}` : '', r.phone ? `Telefone: ${r.phone}` : '', r.nif ? `NIF: ${r.nif}${C.nifOk(r.nif) === false ? ' (não confere)' : ''}` : ''].filter(Boolean).join(' · ');
  if (who) li.appendChild(el('p', 'req-who', who));
  if (r.message) li.appendChild(el('p', 'req-msg', r.message));
  const st = el('span', 'st'), left = C.holdLeft(r.until);
  if (r.status === 'confirmado') { st.classList.add('sold'); st.appendChild(el('span', null, 'Compra confirmada')); }
  else if (r.status === 'cancelado') { st.classList.add('expired'); st.appendChild(el('span', null, 'Cancelado')); }
  else { st.classList.add(left.lapsed ? 'expired' : 'reserved'); st.appendChild(el('span', null, left.lapsed ? `${left.text} · o espaço já está livre no site` : left.text)); }
  li.appendChild(st);
  // a paid request: its sponsor contract (Patrocínios), or a button that registers it (the same confirmar call)
  if (r.status === 'confirmado') {
    const line = el('p', 'req-contract');
    if (r.contract) { line.append('Contrato registado · '); const a = el('a', null, 'Ver em Patrocínios'); a.href = `patrocinios/#${encodeURIComponent(r.contract)}`; line.appendChild(a); }
    else { const b = el('button', 'btn sm ghost', 'Registar contrato'); b.type = 'button'; b.disabled = inbox.busy.has(r.id); b.addEventListener('click', () => registerReq(r)); line.appendChild(b); }
    li.appendChild(line);
  }
  // a closed request (confirmed or cancelled) can leave the list: a test, a mistake (never one with a contract: the Worker
  // refuses, and the page says to delete the record in Patrocínios first)
  if (r.status === 'confirmado' || r.status === 'cancelado') {
    const line = el('p', 'req-erase'), b = el('button', 'btn sm ghost', 'Eliminar');
    b.type = 'button'; b.disabled = inbox.busy.has(r.id); b.addEventListener('click', () => eraseReq(r));
    line.appendChild(b); li.appendChild(line);
  }
  const stand = reqStanding(r);
  // a request after the logo deadline: its logo goes on the kit from a race named before the payment
  if (open && raw && logoLateReq(raw, r)) stand.lines.push(noRaceReq(raw, r) ? NO_RACE(raw, r) : RACE_ASK);
  if (stand.lines.length) { const n = el('ul', 'notes'); for (const s of stand.lines) n.appendChild(el('li', null, s)); li.appendChild(n); }
  if (open) {
    const acts = el('div', 'req-acts'), busyNow = inbox.busy.has(r.id);
    const add = (cls, label, fn) => { const b = el('button', cls, label); b.type = 'button'; b.disabled = busyNow; b.addEventListener('click', fn); acts.appendChild(b); };
    // sold by hand already: put the request's logo on it (a sale again, to the same brand), or only close the request
    if (stand.noLogo) { add('btn gold', 'Pôr o logótipo do pedido', () => confirmPurchase(r)); add('btn', 'Marcar como confirmado', () => closeReq(r)); }
    else if (stand.soldToBrand) add('btn gold', 'Marcar como confirmado', () => closeReq(r));
    else { add('btn gold', 'Confirmar compra', () => confirmPurchase(r)); add('btn', 'Prolongar 48 h', () => extendReq(r)); }
    add('btn ghost', 'Cancelar', () => cancelReq(r));
    li.appendChild(acts);
  }
  return li;
}

// the logo, fetched with the key (an <img> cannot send it) and shown from a blob: URL
async function reqLogo(id) {
  const have = inbox.logos.get(id);
  if (have && have.blob) return have.blob;
  const blob = await reqCall('GET', `/pedidos/${id}/logo`, null, { blob: true });
  inbox.logos.set(id, { blob, url: URL.createObjectURL(blob) });
  return blob;
}
async function thumb(id, img) {
  try { await reqLogo(id); const x = inbox.logos.get(id); if (x && img.isConnected !== false) img.src = x.url; } catch (_) { img.replaceWith(el('span', 'req-nologo', 'sem logótipo')); }
}

function reqBusy(id, on) { if (on) inbox.busy.add(id); else inbox.busy.delete(id); renderInbox(); }
function replaceReq(p) {
  if (!inbox.list || !p || !p.id) return;
  const i = inbox.list.findIndex((r) => r.id === p.id);
  if (i >= 0) inbox.list[i] = p; else inbox.list.unshift(p);
}

async function confirmPurchase(r) {
  if (!base) return;
  if (busy) { toast('Espera: ainda estou a guardar.'); return; }
  const ids = C.sortTargets(base.data, reqIds(r).filter((id) => C.targetOf(base.data, id)));
  if (!ids.length) { toast('Os espaços deste pedido já não existem.'); return; }
  const g = C.guard(base.data, Date.now(), ids, 'sold');
  if (g.blocked.length) { toast(g.blocked.join(' ')); return; }
  reqBusy(r.id, true);
  let logo;
  try { logo = await readLogo(new File([await reqLogo(r.id)], `pedido-${r.id}.png`, { type: 'image/png' })); } catch (e) {
    reqBusy(r.id, false);
    toast(e instanceof ReqError ? reqErrText(e) : e instanceof C.RuleError ? e.message : 'Não consegui abrir o logótipo do pedido.');
    return;
  }
  reqBusy(r.id, false);
  if (busy) { URL.revokeObjectURL(logo.url); return; }
  sel = new Set(ids); syncRows();
  openSheet('sold', ids);
  $('#f-brand').value = r.brand || '';
  sheet.request = r.id;
  const note = $('#sh-req');
  note.textContent = `Pedido ${r.id} do site: ao guardar, a venda fica no site com este logótipo, o pedido fica confirmado e o patrocínio fica registado em Patrocínios. Passa o recibo de donativo${r.nif ? ` com o NIF ${r.nif}` : ''}.${!logoLateReq(base.data, r) ? '' : noRaceReq(base.data, r) ? ` ${NO_RACE(base.data, r)}` : ` ${RACE_ASK} Escreve-a depois em Patrocínios (Editar, «A partir da prova»).`}`;
  note.hidden = false;
  showPaid(r);
  showLogo(logo);
}

// a request made after the season's logo deadline (its Lisbon day, as the message and the comprovativo counted it)
const reqDay = (r) => (isDay(r.day) ? r.day : Date.parse(r.at || '') ? lisbonDay(Date.parse(r.at)) : '');
const logoLateReq = (data, r) => { const d = reqDay(r), R = rulesOf(data); return !!d && String(r.season || R.season) === R.season && d > R.logoBy; };
// a request made after the season's last triathlon (seasonRules.racesUntil): no race to agree, the logo goes on the site,
// the posts and the suit in training (what the message and the comprovativo told the buyer)
const noRaceReq = (data, r) => { const d = reqDay(r), R = rulesOf(data); return !!d && String(r.season || R.season) === R.season && noRacesLeft(R, d); };
const RACE_ASK = 'Diz a prova antes do pagamento: o logótipo entra no equipamento a partir de que prova?';
const reqSuit = (data, r) => reqIds(r).some((id) => id === C.TITLE || C.itemOf(C.targetOf(data, id) || {}) === 'suit');
const NO_RACE = (data, r) => `Sem triatlos em ${rulesOf(data).season} depois do pedido: o logótipo vai para o site${reqSuit(data, r) ? ', as publicações e o fato nos treinos' : ' e as publicações'}.`;

// ---------- the payment of a request: «Pago a» and «Montante recebido» (they go into its sponsor contract) ----------
// «Desconto de época (março): −6,25%» of a request the Worker priced (its record's m and seasonBp), '' at full price
const reqSeason = (r) => (Number.isInteger(r.m) && r.m > 0 ? C.seasonLine(r.m, r.seasonBp) : '');
const reqLines = (r) => reqIds(r).map((id) => (base && C.targetOf(base.data, id) ? C.labelOf(base.data, id) : id)).join(', ');
// the request's own total (the price of its day) at the top of the sale sheet, and the two fields under its note
function showPaid(r) {
  const sum = $('#sh-sum'), season = reqSeason(r);
  sum.textContent = '';
  sum.append(`${reqLines(r)} · Total do pedido `);
  sum.appendChild(el('b', null, typeof r.total === 'number' ? C.money(r.total) : '?'));
  if (season) sum.append(` · ${season}`);
  fillPaid('f-paid', r, lisbonDay());
  $('#sh-paid').hidden = false;
}
// the date and amount fields `<prefix>-at`, `<prefix>-amt`: today (or the given day) and the request's total
function fillPaid(prefix, r, day) {
  const at = $(`#${prefix}-at`), amt = $(`#${prefix}-amt`);
  at.value = day; at.min = C.FIRST_PAID; at.max = C.addDays(lisbonDay(), 1);
  amt.value = typeof r.total === 'number' ? String(r.total) : '';
}
function readPaid(prefix, err) {
  try { return C.normPaid($(`#${prefix}-at`).value, $(`#${prefix}-amt`).value, lisbonDay()); } catch (x) {
    err.textContent = x.message;
    $(`#${prefix}-${/montante/i.test(x.message) ? 'amt' : 'at'}`).focus();
    return null;
  }
}
// the small «Pagamento» dialog (Marcar como confirmado, Registar contrato): { paidAt, amount }, or null when closed
function askPaid(r, { title, yes, day }) {
  return new Promise((resolve) => {
    const d = $('#pay'), form = $('#pay-form'), err = $('#pay-err'), season = reqSeason(r);
    $('#pay-title').textContent = title;
    const sum = $('#pay-sum'); sum.textContent = '';
    sum.append(`${r.brand || 'Sem marca'} · ${reqLines(r)} · Total do pedido `);
    sum.appendChild(el('b', null, typeof r.total === 'number' ? C.money(r.total) : '?'));
    if (season) sum.append(` · ${season}`);
    fillPaid('pay', r, day || lisbonDay());
    err.textContent = '';
    $('#pay-go').textContent = yes;
    const done = (v) => { form.onsubmit = null; $('#pay-no').onclick = null; $('#pay-x').onclick = null; d.removeEventListener('close', onClose); if (d.open) d.close(); resolve(v); };
    const onClose = () => { if (!d.open) done(null); };
    form.onsubmit = (e) => { e.preventDefault(); err.textContent = ''; const v = readPaid('pay', err); if (v) done(v); };
    $('#pay-no').onclick = () => done(null);
    $('#pay-x').onclick = () => done(null);
    d.addEventListener('close', onClose);
    d.showModal();
    if (matchMedia('(pointer: fine)').matches) $('#pay-amt').focus(); else $('#pay-go').focus();
  });
}

// after a sale saved from «Confirmar compra» (or one that was already there): close the request on the Worker, with the
// payment's date and amount; the Worker also registers the sponsor contract (once)
async function confirmReq(id, paid = null) {
  step('req', 'on', 'A confirmar o pedido…');
  try {
    const j = await reqCall('POST', `/pedidos/${id}`, { action: 'confirmar', ...(paid || {}) });
    replaceReq(j.pedido); renderInbox();
    if (j.contrato && j.contrato.id) {
      step('req', 'done', 'Pedido confirmado ✓ · Contrato registado');
      const a = el('a', 'pr-pat', 'Ver em Patrocínios'); a.href = `patrocinios/#${encodeURIComponent(j.contrato.id)}`;
      $('#pr-req span').append(' · ', a);
    } else step('req', 'done', 'Pedido confirmado ✓ · Contrato por registar (em Pedidos, «Registar contrato»)');
  } catch (e) {
    step('req', 'fail', `Pedido por confirmar: ${reqErrText(e)} Na lista de Pedidos, carrega em «Marcar como confirmado».`);
    loadInbox({ quiet: true });
  }
}
// «Marcar como confirmado» (the spots are sold to the brand already) and «Registar contrato» (a request confirmed
// before contracts existed, or whose contract the Worker could not write): the payment first, then confirmar
async function closeReq(r) {
  const paid = await askPaid(r, { title: 'Pagamento', yes: 'Confirmar' });
  if (paid) await confirmCall(r, paid, `Pedido de ${r.brand || 'sem marca'} confirmado.`);
}
async function registerReq(r) {
  const t = Date.parse(r.closed || ''), closed = Number.isFinite(t) ? lisbonDay(t) : '';
  const paid = await askPaid(r, { title: 'Registar contrato', yes: 'Registar', day: closed && closed >= C.FIRST_PAID ? closed : '' });
  if (paid) await confirmCall(r, paid, `Pedido de ${r.brand || 'sem marca'}:`);
}
async function confirmCall(r, paid, head) {
  reqBusy(r.id, true);
  try {
    const j = await reqCall('POST', `/pedidos/${r.id}`, { action: 'confirmar', ...paid });
    replaceReq(j.pedido);
    toast(`${head} ${j.contrato ? 'Contrato registado em Patrocínios.' : 'O contrato ficou por registar: carrega outra vez em «Registar contrato».'}`);
  } catch (e) { toast(reqErrText(e)); }
  reqBusy(r.id, false);
}
async function extendReq(r) {
  reqBusy(r.id, true);
  try {
    const j = await reqCall('POST', `/pedidos/${r.id}`, { action: 'prolongar' });
    replaceReq(j.pedido);
    // fmtDay ends in a full stop ('26 out.'), which ends the sentence too
    toast(`Reserva prolongada até ${C.fmtDay(j.pedido.until)}${j.lost && j.lost.length ? ` (${plural(j.lost.length, 'espaço já não era', 'espaços já não eram')} deste pedido)` : ''}`);
    if (!busy) load({ quiet: true });
  } catch (e) { toast(reqErrText(e)); }
  reqBusy(r.id, false);
}
async function cancelReq(r) {
  const raw = base ? base.data : null, ids = reqIds(r);
  const lines = ids.map((id) => (raw && C.targetOf(raw, id) ? C.labelOf(raw, id) : id));
  if (!(await ask(`Cancelar o pedido de ${r.brand || 'sem marca'}?`, lines, 'Os espaços que ainda estão reservados por este pedido voltam a ficar livres no site. O pedido fica na lista como cancelado.', 'Cancelar pedido', 'Voltar', 'É um pedido falso: bloquear quem o fez durante 30 dias'))) return;
  const bloquear = $('#cf-opt-in').checked;
  reqBusy(r.id, true);
  try {
    const j = await reqCall('POST', `/pedidos/${r.id}`, bloquear ? { action: 'cancelar', bloquear: true } : { action: 'cancelar' });
    replaceReq(j.pedido);
    toast(`${j.freed && j.freed.length ? `Pedido cancelado. ${j.freed.length === 1 ? 'O espaço está' : 'Os espaços estão'} outra vez livre${j.freed.length === 1 ? '' : 's'}.` : 'Pedido cancelado.'}${j.blocked ? ' Bloqueado durante 30 dias.' : ''}`);
    if (!busy) load({ quiet: true });
  } catch (e) { toast(reqErrText(e)); }
  reqBusy(r.id, false);
}

// «Eliminar»: a closed request out of the Worker (its record and its logo), after a question
async function eraseReq(r) {
  if (!(await ask(`Eliminar o pedido ${r.id} de ${r.brand || 'sem marca'}?`, [], ERASE_TEXT, 'Eliminar', 'Voltar'))) return;
  reqBusy(r.id, true);
  try {
    await reqCall('POST', `/pedidos/${r.id}`, { action: 'apagar' });
    if (inbox.list) inbox.list = inbox.list.filter((x) => x.id !== r.id);
    toast(`Pedido ${r.id} eliminado.`);
  } catch (e) {
    // gone already (another tab): out of the list as well
    if (e instanceof ReqError && e.status === 404 && inbox.list) inbox.list = inbox.list.filter((x) => x.id !== r.id);
    toast(reqErrText(e));
  }
  reqBusy(r.id, false);
}
const ERASE_TEXT = 'Usa isto para testes ou enganos: um pedido pago deve ser registado. Não se pode desfazer.';

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
  // «Vendido» on spots a request of the site holds: that request's sale, with its logo
  if (action === 'sold' && saleOfRequest(ids, () => act('sold'))) return;
  if (action !== 'available') { openSheet(action, ids); return; }
  const raw = base.data, v = C.effective(raw, now), today = C.todayUTC(now);
  const lines = ids.map((id) => `${C.labelOf(raw, id)} · ${C.statusOf(v, C.targetOf(v, id), today).chip}`);
  const logos = ids.some((id) => C.targetOf(raw, id).logo);
  const text = ids[0] === C.TITLE ? 'Os espaços do fato voltam a ficar livres no site, menos os que têm reserva ou venda própria.'
    : `${ids.length > 1 ? 'Voltam a ficar livres' : 'Volta a ficar livre'} no site.${logos ? ' O logótipo sai.' : ''}`;
  if (!(await ask(`${headFor('available', raw, ids)}?`, lines, text, 'Libertar'))) return;
  run({ action, ids, f: { brand: '', url: '', until: '' }, logo: null, snap: C.snapshot(raw, ids) });
}

// spots held by a request of the site, in a sheet that is not that request's sale: what saving does to the request
function reqNotes(raw, ids, action) {
  if (!sheet || sheet.request || action === 'available') return [];
  return ids.map((id) => [id, C.targetOf(raw, id)]).filter(([, x]) => x && x.status === 'reserved' && x.request)
    .map(([id, x]) => (action === 'sold'
      ? `${C.labelOf(raw, id)}: é do pedido ${x.request} do site. Vendido assim, fica sem o logótipo do pedido${inboxOn() ? ' (em Pedidos, «Confirmar compra» leva-o)' : ''}.`
      : `${C.labelOf(raw, id)}: é do pedido ${x.request} do site; ao guardar, o pedido deixa de controlar esta reserva.`));
}

function openSheet(action, ids) {
  const raw = base.data, now = Date.now(), today = C.todayUTC(now), d = $('#sheet');
  sheet = { action, ids, snap: C.snapshot(raw, ids), logo: null, untilTouched: false, request: null };
  $('#sh-req').hidden = true; $('#sh-req').textContent = '';
  $('#sh-paid').hidden = true;
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
  for (const m of reqNotes(raw, ids, action)) warn.appendChild(el('li', null, m));
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
  const order = sheet && sheet.action === 'reserved' ? ['f-brand', 'f-url', 'f-until'] : [...(sheet && sheet.request ? ['f-paid-at', 'f-paid-amt'] : []), 'f-brand', 'f-url', 'f-logo'];
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
  // a request's sale: the payment's date and amount go to its contract
  let paid = null;
  if (action === 'sold' && sheet.request) { paid = readPaid('f-paid', err); if (!paid) return; }
  const g = C.guard(base.data, Date.now(), ids, action, f.brand, f.until || undefined);
  if (g.blocked.length) { err.textContent = g.blocked.join(' '); return; }
  const confirms = [...g.confirms, ...reqNotes(base.data, ids, action)];
  if (confirms.length && !(await ask('Confirmas?', confirms, 'Fica como escreveste. Podes mudar outra vez depois.', 'Sim, guardar'))) return;
  let logo = null;
  if (action === 'sold' && sheet && sheet.logo) {
    const L = sheet.logo;
    // last word before anything leaves: only PNG, JPG or WebP bytes go to the site, never an SVG
    if (!C.STORED.includes(L.ext) || C.sniffLogo(L.bytes) !== L.ext) { err.textContent = 'Este ficheiro não pode ir para o site. Escolhe outro.'; return; }
    logo = { ext: L.ext, b64: C.bytesToB64(L.bytes), bytes: L.bytes, sha: await C.gitBlobSha(L.bytes) };
  }
  if (!sheet) return;
  run({ action, ids, f, logo, snap: sheet.snap, request: action === 'sold' ? sheet.request : null, paid: action === 'sold' && sheet.request ? paid : null });
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

function openProgress(intent) {
  const { action, ids } = intent;
  const d = $('#sheet');
  shown = null;   // the progress view now belongs to this save
  $('#sh-title').textContent = headFor(action, base.data, ids);
  $('#sh-form').hidden = true; $('#sh-progress').hidden = false;
  step('save', 'on', 'A guardar no GitHub…'); step('req', '', intent.request ? 'Confirmar o pedido' : ''); step('pub', '', 'A publicar…'); step('live', '', 'No ar');
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
      if (intent.request) confirmReq(intent.request, intent.paid);
      return;
    }
    step('save', 'done', 'Guardado ✓');
    if (intent.request) confirmReq(intent.request, intent.paid);
    sel.clear(); $('#ref').value = ''; onRef(); render();
    shown = publish({ ids: intent.ids, data: r.data, commit: r.commit, files: r.writes, bytes: intent.logo ? intent.logo.bytes : null });
    showPublish(shown);
    if (intent.action === 'available') montraAfterFree(intent.snap, r.data);
  } catch (e) {
    busy = false;
    $('#sh-x').hidden = false; $('#pr-close').disabled = false;
    if (e instanceof GhError && e.status === 401) {
      keepSheet(intent);
      signOut('O token expirou ou foi revogado. Entra com um token novo: o que escreveste fica à espera.');
      return;
    }
    step('save', e.unknown ? 'unknown' : 'fail', e.unknown ? 'Sem resposta do GitHub' : 'Não guardei.'); step('req', '', ''); step('pub', '', ''); step('live', '', '');
    prMsg(errText(e, 'write'), e.unknown ? 'warn' : true);
    if (e.conflict) { if (e.reload) load({ quiet: true }); else render(); }
    else $('#pr-retry').hidden = false;
  }
}

// ---------- the montra after a spot is freed ----------
// The home page already hides the products of a brand whose spots are no longer sold to it (montra.js reads
// data/spots.json). This takes them out of data/montra.json too, so the count, the reports and Patrocínios agree: for
// each brand that held a freed spot and now has more products counting than the spots it still holds allow, ask, then
// one commit that retires the extra ones (montra-core rules: off the site from today).
async function montraAfterFree(snap, data) {
  const was = new Set(Object.values(snap || {}).map((v) => { try { return JSON.parse(v); } catch (_) { return null; } })
    .filter((x) => x && x.status === 'sold' && x.brand).map((x) => x.brand));
  if (!was.size || !data) return;
  let file = null;
  try { const res = await fetch(new URL(`../${MONTRA_PATH}?ts=${Date.now()}`, location.href).href, { cache: 'no-store', credentials: 'omit' }); file = res.ok ? await res.json() : null; } catch (_) { file = null; }
  if (!file || !Array.isArray(file.brands)) return;
  const day = lisbonDay();
  for (const name of was) {
    const entry = findBrand(file, { name, season: String(data.season) });
    const allow = spotsAllow(entry, data), n = countFor(entry, day);
    if (allow === null || n <= allow) continue;
    const k = n - allow;
    const yes = await ask(`Retirar ${k === 1 ? '1 produto' : `${k} produtos`} de ${entry.name} da montra?`, [],
      allow ? `Com os espaços que ainda tem, ${entry.name} pode ter ${allow === 1 ? '1 produto' : `até ${allow} produtos`} na montra e tem ${n}. Os últimos da lista saem do site.`
        : `${entry.name} já não tem espaços vendidos: os produtos dela saem do site (no ficheiro ficam para os relatórios).`, 'Retirar', 'Agora não');
    if (!yes) { toast(`A montra de ${entry.name} ficou como estava. Podes retirar os produtos em Patrocínios.`); continue; }
    try {
      const r = await commitFiles({ build: async (head) => {
        const got = await readText(MONTRA_PATH, head);
        let f;
        try { f = got ? JSON.parse(got.text) : null; } catch (_) { f = null; }
        if (!f || !Array.isArray(f.brands)) throw new UiError('data/montra.json no GitHub não tem a forma esperada. Não mexi na montra.');
        const there = findBrand(f, { id: entry.id });
        if (!there) return { nothing: true };
        const out = retireOver(there, day, allow);
        if (!out.names.length) return { nothing: true };
        return { message: `Montra: ${there.name}, ${out.names.length === 1 ? `retirado «${out.names[0]}»` : `${out.names.length} produtos retirados`} (espaço libertado, admin)`,
          files: [{ path: MONTRA_PATH, text: fileText(applyBrand(f, out.entry)) }], deletes: deletesFor(there, out.entry, f) };
      } });
      toast(r.nothing ? `A montra de ${entry.name} já estava assim.` : `Montra de ${entry.name}: ${k === 1 ? 'produto retirado' : `${k} produtos retirados`}. O site atualiza-se em 1 a 2 minutos.`);
    } catch (e) {
      toast(`Não consegui retirar os produtos de ${entry.name} da montra (${errText(e, 'write')}). Retira-os em Patrocínios.`);
    }
  }
}

// a token that stops working mid-save: what the admin typed and picked waits for the next sign-in
function keepSheet(intent) {
  const s = sheet && sheet.action === intent.action ? sheet : null;
  stash = { action: intent.action, ids: intent.ids, brand: $('#f-brand').value, url: $('#f-url').value, until: $('#f-until').value, untilTouched: !!(s && s.untilTouched), logo: s ? s.logo : null, request: intent.request || null, note: $('#sh-req').textContent,
    paid: intent.request && !$('#sh-paid').hidden ? { at: $('#f-paid-at').value, amt: $('#f-paid-amt').value, sum: [...$('#sh-sum').childNodes].map((n) => n.cloneNode(true)) } : null };
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
  if (s.request) { sheet.request = s.request; $('#sh-req').textContent = s.note; $('#sh-req').hidden = !s.note; }
  if (s.request && s.paid) {
    $('#sh-sum').replaceChildren(...s.paid.sum);
    $('#f-paid-at').value = s.paid.at; $('#f-paid-amt').value = s.paid.amt; $('#sh-paid').hidden = false;
  }
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
// opt: the label of a checkbox under the text (its state stays in #cf-opt-in for the caller)
function ask(title, items, text, yes = 'Confirmar', no = 'Cancelar', opt = '') {
  return new Promise((resolve) => {
    const d = $('#confirm');
    $('#cf-opt').hidden = !opt; $('#cf-opt-in').checked = false; $('#cf-opt-t').textContent = opt;
    $('#cf-title').textContent = title;
    const ul = $('#cf-list'); ul.textContent = '';
    for (const it of items) ul.appendChild(el('li', null, it));
    $('#cf-text').textContent = text;
    $('#cf-yes').textContent = yes;
    $('#cf-no').textContent = no;
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
  $('#ref').addEventListener('keydown', onRefKey);
  $('#inbox-login').addEventListener('submit', inboxSignIn);
  $('#inbox-reload').addEventListener('click', () => loadInbox());
  $('#inbox-forget').addEventListener('click', () => { forgetReqKey(); renderInbox(); $('#inbox-err').textContent = ''; toast('Esqueci a chave dos pedidos neste separador.'); });
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
    if (getToken() && base && !busy && hiddenAt && performance.now() - hiddenAt > 60000 && !$$('dialog').some((x) => x.open)) { load({ quiet: true }); loadInbox({ quiet: true }); }
  });
  addEventListener('resize', () => { if (sel.size) document.documentElement.style.setProperty('--bar-h', `${$('#bar').offsetHeight}px`); });
}

function boot() {
  try { const f = localStorage.getItem(FILTER_KEY); if (['all', 'available', 'reserved', 'sold'].includes(f)) filter = f; } catch (_) {}
  bind();
  const t = readToken();
  if (t && C.TOKEN_RE.test(t)) { setToken(t); enterApp({ check: true }); } else { forgetToken(); showLogin(); }
}

// frame-ancestors is ignored in a meta CSP: a framed copy of this page shows nothing
if (window.top !== window.self) document.documentElement.hidden = true;
else boot();
