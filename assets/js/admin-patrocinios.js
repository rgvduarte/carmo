// «Patrocínios» (/admin/patrocinios/): the sponsor contracts of each season, phone first. One card per contract with
// its spots, the amount and the day it was paid, the period, the days left and the renewal state with its one-tap
// steps; what is due now; the season's calendar (and an .ics file of it); a CSV export; and the «Confirmação de
// patrocínio» PDF that Gonçalo sends to the sponsor. The records live in the booking Worker's KV (worker/requests.js:
// GET /contratos, POST /contratos, POST /contratos/<id>, and POST /pedidos/<id> confirmar), read and written with the
// Pedidos key (ADMIN_KEY), kept in this tab only (the same sessionStorage entry as the Pedidos list of /admin/). The
// public data/spots.json (same origin) gives the spots' names, the prices and the season's dates. Every piece of a
// record is shown with textContent only.
import * as A from './admin-contracts.js';
import { normPaid, normUrl, nifOk, FIRST_PAID, RuleError } from './admin-core.js';
import { TITLE, rulesOf, defaultRules, quote, seasonMonth, lisbonDay, addDays, pctText } from './season-rules.js';
import { SITE } from './data.js';
import './internal.js';   // this browser is the owner's: the public pages never load Google Analytics in it

const REQ_KEY = 'gc.admin.pedidos', PREF_KEY = 'gc.admin.patrocinios';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
const today = () => lisbonDay();

const S = { key: '', contracts: null, requests: null, data: null, at: null, busy: new Set(), pref: { state: 'todos', season: '', q: '' }, sheet: null, pdf: '', hashDone: false, hl: '' };
const reqApi = () => String(SITE.requestsApi || '').trim().replace(/\/+$/, '');
class ApiError extends Error { constructor(status, code, campo = '') { super(code || `api ${status}`); this.status = status; this.code = code || ''; this.campo = campo || ''; } }

// ---------- storage (this tab: the key; this browser: the filters, a convenience only) ----------
function readKey() { try { return sessionStorage.getItem(REQ_KEY) || ''; } catch (_) { return ''; } }
function keepKey(k) { try { sessionStorage.setItem(REQ_KEY, k); } catch (_) {} }
function dropKey() { try { sessionStorage.removeItem(REQ_KEY); } catch (_) {} }
function readPref() { try { const p = JSON.parse(localStorage.getItem(PREF_KEY) || 'null'); if (p && typeof p === 'object') { if (A.FILTERS.some(([k]) => k === p.state)) S.pref.state = p.state; if (/^(\d{4}|todas)$/.test(p.season || '')) S.pref.season = p.season; } } catch (_) {} }
function savePref() { try { localStorage.setItem(PREF_KEY, JSON.stringify({ state: S.pref.state, season: S.pref.season })); } catch (_) {} }

// ---------- the Worker ----------
// the page's CSP lets it reach the Worker only at the address stamp.mjs wrote into connect-src
function cspAllows(url) {
  const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
  const m = meta && meta.content.match(/connect-src([^;]*)/);
  let origin;
  try { origin = new URL(url).origin; } catch (_) { return false; }
  return !meta || (!!m && m[1].trim().split(/\s+/).includes(origin));
}
async function call(method, path, body) {
  let res;
  try {
    res = await fetch(`${reqApi()}${path}`, {
      method, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${S.key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) { throw new ApiError(0, 'rede'); }
  let j = null;
  try { j = await res.json(); } catch (_) {}
  if (!res.ok) throw new ApiError(res.status, j && typeof j.error === 'string' ? j.error : '', j && typeof j.campo === 'string' ? j.campo : '');
  return j || {};
}
const FIELD_TEXT = {
  brand: 'Escreve o nome da marca (até 60 letras).', items: 'Escolhe os espaços, o fato completo, ou escreve uma descrição em «Outro».', season: 'A época tem de ser a desta tabela ou a seguinte (e só muda num registo ainda sem alterações).',
  amount: 'O montante é em euros, sem cêntimos, até 100 000 €.', paidAt: 'A data do pagamento tem de ser de 1 jan. 2026 a amanhã.', pay: 'Escolhe a forma de pagamento.', inKind: 'A descrição do pagamento em produto vai até 200 letras.',
  url: 'O link da marca tem de começar por https://.', 'contact.email': 'O email não é válido.', 'contact.phone': 'O telefone só leva algarismos, espaços, +, ( ) e -.', 'contact.name': 'O nome vai até 80 letras.',
  'contact.handle': 'A conta vai até 60 letras.', nif: 'O NIF só leva letras, algarismos, espaços, pontos, / e -.', notes: 'As notas vão até 2 000 letras.', label: 'A descrição vai até 80 letras.', state: 'Estado da renovação inválido.',
  'logo.fromRace': 'O nome da prova vai até 80 letras.',
};
function errText(e) {
  if (!(e instanceof ApiError)) return 'Algo correu mal nesta página. Recarrega-a e tenta outra vez.';
  if (e.status === 0) return 'Sem ligação aos pedidos. Verifica a rede e tenta outra vez.';
  if (e.status === 401) return 'A chave dos pedidos não está certa.';
  if (e.status === 429) return 'Demasiadas tentativas. Espera 10 minutos.';
  if (e.code === 'campos') return FIELD_TEXT[e.campo] || 'Um dos campos não foi aceite.';
  if (e.code === 'existe') return 'Esse pedido já tem um contrato registado.';
  if (e.code === 'muitos') return 'Há registos a mais guardados (900). Exporta o CSV e apaga os das épocas que acabaram.';
  if (e.code === 'nada' || e.status === 404) return 'Este registo já não existe. Atualiza a lista.';
  if (e.code === 'tamanho') return 'O registo é grande demais (as notas são longas?).';
  if (e.code === 'config') return 'Os pedidos ainda não estão prontos no Cloudflare (falta um secret). Vê worker/README.md.';
  if (e.code === 'epoca') return 'A época deste registo não é aceite.';
  if (e.status === 502) return 'O GitHub falhou ao ler os espaços. Tenta outra vez daqui a pouco.';
  if (e.status >= 500) return `O serviço dos pedidos falhou (código ${e.status}). Nada mudou; tenta outra vez.`;
  return `O serviço dos pedidos respondeu com um erro (código ${e.status}).`;
}

// ---------- start ----------
function boot() {
  readPref();
  bind();
  const api = reqApi();
  if (!api) return off('Os patrocínios ainda não estão ligados: falta o endereço do serviço dos pedidos (SITE.requestsApi em assets/js/data.js). Vê worker/README.md.');
  if (!/^https:\/\//.test(api) || !cspAllows(api)) return off('O endereço dos pedidos (SITE.requestsApi) ainda não está autorizado nesta página: corre node scripts/stamp.mjs e publica.');
  S.key = readKey();
  loadSpots();
  if (S.key) load(); else showKey();
}
function off(text) { $('#off').hidden = false; $('#off-t').textContent = text; $('#key-form').hidden = true; $('#body').hidden = true; }

function showKey(why = '') {
  $('#body').hidden = true; $('#bar').hidden = true; $('#reload').hidden = true; setBar();
  $('#key-form').hidden = false;
  $('#key-why').hidden = !why; $('#key-why').textContent = why;
}
async function signIn(e) {
  e.preventDefault();
  const input = $('#key'), err = $('#key-err'), btn = $('#key-go'), k = input.value.trim();
  err.textContent = '';
  if (k.length < 16) { err.textContent = 'A chave tem pelo menos 16 caracteres.'; input.focus(); return; }
  btn.disabled = true; btn.textContent = 'A abrir…';
  S.key = k;
  try {
    const j = await call('GET', '/contratos');
    keepKey(k); input.value = '';
    await take(j);
  } catch (x) {
    S.key = '';
    err.textContent = errText(x);
  } finally { btn.disabled = false; btn.textContent = 'Abrir patrocínios'; }
}
function forget() {
  dropKey(); S.key = ''; S.contracts = null; S.requests = null;
  showKey(); $('#key-err').textContent = '';
  toast('Esqueci a chave dos pedidos neste separador.');
}

// data/spots.json from this site: the names, the prices and the season's dates
async function loadSpots() {
  try {
    const res = await fetch(new URL('../../data/spots.json', location.href).href, { cache: 'no-store', credentials: 'omit' });
    const d = res.ok ? await res.json() : null;
    if (d && Array.isArray(d.spots)) { S.data = d; if (S.contracts) render(); }
  } catch (_) {}
}

async function load({ quiet = false } = {}) {
  if (!S.key) return;
  const btn = $('#reload'), meta = $('#meta');
  btn.classList.add('busy'); btn.disabled = true;
  if (!quiet && !S.contracts) { $('#body').hidden = false; $('#key-form').hidden = true; meta.textContent = 'A ler os patrocínios…'; meta.classList.remove('bad'); }
  try { await take(await call('GET', '/contratos')); } catch (e) {
    if (e instanceof ApiError && e.status === 401) { dropKey(); S.key = ''; S.contracts = null; showKey('A chave dos pedidos mudou ou não está certa. Escreve-a outra vez.'); return; }
    if (!S.contracts) { $('#body').hidden = false; $('#key-form').hidden = true; }
    meta.textContent = errText(e); meta.classList.add('bad');
  } finally { btn.classList.remove('busy'); btn.disabled = false; }
}
// the list answered: show it; the requests (for «Pedido confirmado sem registo») come after, and may fail on their own
async function take(j) {
  S.contracts = Array.isArray(j && j.contratos) ? j.contratos.filter((c) => c && typeof c === 'object' && typeof c.id === 'string') : [];
  S.at = new Date();
  $('#key-form').hidden = true; $('#body').hidden = false; $('#reload').hidden = false; $('#bar').hidden = false; setBar();
  render();
  try { const r = await call('GET', '/pedidos'); S.requests = Array.isArray(r.pedidos) ? r.pedidos : null; } catch (_) { S.requests = null; }
  render();
}
function setBar() { document.documentElement.style.setProperty('--bar-h', $('#bar').hidden ? '0px' : `${$('#bar').offsetHeight}px`); }

// ---------- render ----------
const rules = () => (S.data ? rulesOf(S.data) : defaultRules((S.contracts || [])[0]?.season || '2027'));
const findC = (id) => (S.contracts || []).find((c) => c.id === id) || null;
function seasons() {
  const r = rules(), set = new Set([r.season, String(Number(r.season) + 1), ...(S.contracts || []).map((c) => String(c.season))]);
  return [...set].filter((x) => /^\d{4}$/.test(x)).sort();
}
function render() {
  if (!S.contracts) return;
  const day = today(), r = rules();
  if (!S.pref.season || (S.pref.season !== 'todas' && !seasons().includes(S.pref.season))) S.pref.season = r.season;
  const meta = $('#meta'); meta.classList.remove('bad');
  meta.textContent = `Atualizado às ${hhmm(S.at)} · hoje ${A.ptDay(day, true)}`;
  renderNow(day, r);
  renderCal(day, r);
  renderFilters(day);
  renderList(day);
  if (!S.hashDone) { S.hashDone = true; goHash(); }
}

function renderNow(day, r) {
  const ul = $('#now'); ul.textContent = '';
  const items = A.dueNow(S.contracts, S.requests, S.data, r, day);
  for (const it of items) {
    const li = el('li', `now-i ${it.kind}`);
    li.appendChild(el('p', 'now-t', it.text));
    if (it.acts.length) {
      const acts = el('div', 'now-acts');
      for (const a of it.acts) {
        if (a.op === 'espacos') { const l = el('a', 'btn sm ghost', a.label); l.href = '../'; acts.appendChild(l); continue; }
        const b = el('button', `btn sm ${a.state === 'nao-renova' ? 'ghost' : ''}`.trim(), a.label);
        b.type = 'button';
        b.disabled = S.busy.has(it.id);
        b.addEventListener('click', () => nowAct(it, a));
        acts.appendChild(b);
      }
      li.appendChild(acts);
    }
    ul.appendChild(li);
  }
  $('#now-empty').hidden = items.length > 0;
}
function nowAct(it, a) {
  if (a.op === 'logo') return patch(it.id, { action: 'editar', set: { logo: { vector: true } } }, 'Logótipo em vetor recebido.');
  if (a.op === 'renovacao') return renew(it.id, a.state);
  if (a.op === 'registar') return register(it.request);
}

function renderCal(day, r) {
  $('#cal-h').textContent = `Calendário ${r.season}`;
  const ol = $('#cal'); ol.textContent = '';
  for (const k of A.calendar(r, day)) {
    const li = el('li', `cal-i ${k.state}`);
    li.append(el('span', 'cal-d mono', k.date), el('span', 'cal-l', k.label), el('span', 'cal-w', k.when), el('p', 'cal-n', k.note));
    ol.appendChild(li);
  }
}

function renderFilters(day) {
  const fs = $('#filters');
  const counts = A.filterCounts(S.contracts, { season: S.pref.season, q: S.pref.q }, day);
  if (!fs.querySelector('input')) {
    for (const [k, label] of A.FILTERS) {
      const lab = el('label', 'chip'), inp = el('input');
      inp.type = 'radio'; inp.name = 'state'; inp.value = k;
      inp.addEventListener('change', () => { if (inp.checked) { S.pref.state = k; savePref(); render(); } });
      lab.append(inp, label, ' ', el('span', 'c'));
      lab.querySelector('.c').dataset.count = k;
      fs.appendChild(lab);
    }
  }
  $$('input[name="state"]', fs).forEach((i) => { i.checked = i.value === S.pref.state; });
  $$('[data-count]', fs).forEach((n) => { n.textContent = String(counts[n.dataset.count] || 0); });
  const sel = $('#season'), want = [...seasons(), 'todas'];
  if ([...sel.options].map((o) => o.value).join() !== want.join()) {
    sel.textContent = '';
    for (const v of want) { const o = el('option', null, v === 'todas' ? 'Todas' : v); o.value = v; sel.appendChild(o); }
  }
  sel.value = S.pref.season;
  const sum = $('#summary'); sum.textContent = '';
  const s = A.summary(A.filterContracts(S.contracts, { season: S.pref.season }, day), day);
  s.text.split(' · ').forEach((p, i) => { if (i) sum.append(' · '); sum.appendChild(el('span', null, p)); });
}

const CHIP = { ativo: 'available', 'a-propor': 'reserved', proposta: 'reserved', renova: 'sold', 'nao-renova': 'expired', terminado: 'expired' };
function renderList(day) {
  const ul = $('#list'); ul.textContent = '';
  const list = A.filterContracts(S.contracts, S.pref, day);
  for (const c of list) ul.appendChild(card(c, day));
  const empty = $('#empty');
  empty.hidden = list.length > 0;
  empty.textContent = !S.contracts.length ? 'Ainda não há patrocínios registados. Confirma um pedido em Espaços ou cria um à mão.' : 'Nenhum patrocínio neste filtro.';
}

function card(c, day) {
  const li = el('li', 'ct'), r = A.rulesOfContract(c), busy = S.busy.has(c.id);
  li.id = `c-${c.id}`; li.dataset.id = c.id;
  if (busy) li.classList.add('busy');
  if (S.hl === c.id) li.classList.add('hl');
  const head = el('div', 'ct-head');
  head.appendChild(el('p', 'ct-brand', c.brand || 'Sem marca'));
  const lv = A.levelName(c.level, 'pt', S.data);
  if (lv) head.appendChild(el('span', `lv lv-${c.level}`, lv));
  li.appendChild(head);
  const spots = A.spotsText(c);
  li.appendChild(el('p', 'ct-spots', [spots, c.label && spots !== c.label ? c.label : ''].filter(Boolean).join(' · ')));

  const pay = el('p', 'ct-pay');
  pay.appendChild(el('b', null, A.money(c.amount)));
  pay.append(` · pago a ${c.paidAt ? A.ptDay(c.paidAt, true) : '?'}`);
  const how = c.pay === 'produto' ? `em produto${c.inKind ? `: ${c.inKind}` : ''}` : A.PAY[c.pay] || '';
  if (how) pay.append(` · ${how}`);
  li.appendChild(pay);
  const season = A.seasonText(c.price);
  if (season) li.appendChild(el('p', 'ct-season', season));
  if (c.price && Number.isFinite(Number(c.price.total)) && Number(c.price.total) !== Number(c.amount)) li.appendChild(el('p', 'ct-table', `A tabela pedia ${A.money(c.price.total)}`));

  const left = A.daysLeft(c, day);
  li.appendChild(el('p', 'ct-period', `${A.ptDay(r.start).replace('.', '')} a ${A.ptDay(r.end).replace('.', '')} ${r.end.slice(0, 4)} · ${left.text}`));

  const ren = el('div', 'ct-ren'), v = A.renewalOf(c, day), chip = el('span', `st ${CHIP[v.state] || ''}`);
  chip.appendChild(el('span', null, v.label));
  ren.appendChild(chip);
  for (const a of A.renewalActs(c, day)) {
    const b = el('button', `btn sm${a.label === 'Desfazer' || a.state === 'nao-renova' ? ' ghost' : ''}`, a.label);
    b.type = 'button'; b.disabled = busy; b.dataset.renew = a.state;
    b.addEventListener('click', () => renew(c.id, a.state));
    ren.appendChild(b);
  }
  li.appendChild(ren);

  const logo = el('label', 'check ct-logo'), cb = el('input');
  cb.type = 'checkbox'; cb.checked = c.logo?.vector === true; cb.disabled = busy;
  cb.addEventListener('change', () => patch(c.id, { action: 'editar', set: { logo: { vector: cb.checked } } }, cb.checked ? 'Logótipo em vetor recebido.' : 'Logótipo em vetor em falta.'));
  logo.append(cb, el('span', null, `Logótipo em vetor: ${c.logo?.vector ? 'recebido' : 'em falta'}${c.logo?.fromRace ? ` · a partir de ${c.logo.fromRace}` : ''}`));
  li.appendChild(logo);

  const who = [c.contact?.name, A.CHANNEL[c.contact?.channel || ''], c.contact?.email, c.contact?.phone, c.contact?.handle].filter(Boolean).join(' · ');
  if (who) li.appendChild(el('p', 'ct-who', who));
  if (c.notes) {
    const n = el('p', 'ct-notes', c.notes);
    li.appendChild(n);
    if (c.notes.split('\n').length > 2 || c.notes.length > 140) {
      n.classList.add('clip');
      const more = el('button', 'link ct-more', 'ver mais'); more.type = 'button';
      more.addEventListener('click', () => { const open = n.classList.toggle('clip'); more.textContent = open ? 'ver mais' : 'ver menos'; });
      li.appendChild(more);
    }
  }
  li.appendChild(el('p', 'ct-id mono', `${c.kind === 'manual' ? 'à mão' : 'pedido do site'} · ${c.id}`));
  const acts = el('div', 'ct-acts');
  const add = (cls, label, fn) => { const b = el('button', cls, label); b.type = 'button'; b.disabled = busy; b.addEventListener('click', fn); acts.appendChild(b); };
  add('btn sm', 'Editar', () => openSheet(c));
  add('btn sm gold', 'Confirmação (PDF)', () => openPdf(c));
  add('btn sm ghost', 'Apagar', () => remove(c));
  li.appendChild(acts);
  return li;
}

// patrocinios/#<id> (from Pedidos): that card, in view and marked
function goHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id || !findC(id)) return;
  const c = findC(id);
  if (!A.filterContracts([c], S.pref, today()).length) { S.pref = { ...S.pref, state: 'todos', season: String(c.season), q: '' }; $('#q').value = ''; render(); }
  mark(id);
}
// one card marked (it survives the list being drawn again) and brought into view
function mark(id) {
  S.hl = id;
  $$('.ct.hl').forEach((n) => { if (n.dataset.id !== id) n.classList.remove('hl'); });
  const n = document.getElementById(`c-${id}`);
  if (n) { n.classList.add('hl'); n.scrollIntoView({ block: 'center', behavior: 'instant' }); }
}

// ---------- the calls ----------
function setBusy(id, on) { if (on) S.busy.add(id); else S.busy.delete(id); render(); }
function put(c) {
  if (!c || !c.id) return;
  const i = S.contracts.findIndex((x) => x.id === c.id);
  if (i >= 0) S.contracts[i] = c; else S.contracts.unshift(c);
}
async function patch(id, body, done) {
  if (S.busy.has(id)) return;
  setBusy(id, true);
  try { const j = await call('POST', `/contratos/${encodeURIComponent(id)}`, body); put(j.contrato); toast(done); } catch (e) { authLost(e) || toast(errText(e)); }
  setBusy(id, false);
}
const RENEW_DONE = { proposta: 'Proposta enviada.', renova: 'Renova.', 'nao-renova': 'Não renova.', '': 'Renovação por propor.' };
async function renew(id, state) {
  const c = findC(id);
  const was = c?.renewal?.state || '';
  await patch(id, { action: 'renovacao', state }, `${c ? `${c.brand}: ` : ''}${state === 'proposta' && (was === 'renova' || was === 'nao-renova') ? 'desfeito, volta a proposta enviada.' : RENEW_DONE[state]}`);
}
async function remove(c) {
  if (!(await ask(`Apagar o registo de ${c.brand}?`, `${A.spotsText(c) || c.label || ''} · ${A.money(c.amount)}. Só para um registo feito por engano: sai da lista e do serviço dos pedidos, e não volta.${c.request ? ' O pedido do site fica confirmado.' : ''}`, 'Apagar'))) return;
  setBusy(c.id, true);
  try { await call('POST', `/contratos/${encodeURIComponent(c.id)}`, { action: 'apagar' }); S.contracts = S.contracts.filter((x) => x.id !== c.id); toast(`Registo de ${c.brand} apagado.`); } catch (e) { authLost(e) || toast(errText(e)); }
  setBusy(c.id, false);
}
// a request confirmed (paid) with no record: confirmar again, with the payment's date and amount
async function register(r) {
  if (!r) return;
  const paid = await askPaid(r);
  if (!paid) return;
  setBusy(r.id, true);
  try {
    const j = await call('POST', `/pedidos/${encodeURIComponent(r.id)}`, { action: 'confirmar', ...paid });
    if (j.contrato) { put(j.contrato); toast(`Contrato de ${r.brand || 'sem marca'} registado.`); } else toast('O contrato ficou por registar. Tenta outra vez daqui a pouco.');
    if (j.pedido && Array.isArray(S.requests)) S.requests = S.requests.map((x) => (x.id === j.pedido.id ? j.pedido : x));
  } catch (e) { authLost(e) || toast(errText(e)); }
  setBusy(r.id, false);
}
function authLost(e) {
  if (!(e instanceof ApiError) || e.status !== 401) return false;
  closeDialogs(); dropKey(); S.key = ''; S.contracts = null;
  showKey('A chave dos pedidos mudou ou não está certa. Escreve-a outra vez.');
  return true;
}

// ---------- new / edit ----------
function spotChips() {
  const box = $('#c-spots'); box.textContent = '';
  const add = (id, text, price) => {
    const lab = el('label', 'chip sm'), inp = el('input');
    inp.type = 'checkbox'; inp.value = id;
    inp.addEventListener('change', () => onSpot(inp));
    lab.append(inp, text);
    if (price != null) lab.appendChild(el('span', 'c', A.money(price)));
    box.appendChild(lab);
  };
  if (S.data) {
    add(TITLE, 'Fato completo', S.data.title?.price);
    for (const s of [...S.data.spots].sort((a, b) => a.n - b.n)) add(s.id, `${pad2(s.n)} ${s.pt?.name || s.id}`, s.price);
  }
  add('_outro', 'Outro', null);
}
const pickedIds = () => $$('#c-spots input:checked').map((i) => i.value).filter((v) => v !== '_outro');
function onSpot(inp) {
  if (inp.checked && inp.value === TITLE) $$('#c-spots input').forEach((i) => { if (i !== inp && i.value !== '_outro') i.checked = false; });
  else if (inp.checked && inp.value !== '_outro') { const t = $(`#c-spots input[value="${TITLE}"]`); if (t) t.checked = false; }
  $('#c-label-box').hidden = !$('#c-spots input[value="_outro"]').checked;
  sheetHints();
}
function seasonOptions(cur) {
  const sel = $('#c-season'), r = rules(), want = [...new Set([r.season, String(Number(r.season) + 1), ...(cur ? [String(cur)] : [])])].sort();
  sel.textContent = '';
  for (const v of want) { const o = el('option', null, v); o.value = v; sel.appendChild(o); }
}
function openSheet(c = null) {
  const d = $('#sheet');
  S.sheet = { id: c ? c.id : null };
  $('#sh-title').textContent = c ? `Editar ${c.brand}` : 'Novo patrocínio';
  $('#sh-kind').hidden = !c || c.kind !== 'site';
  $('#sh-kind').textContent = c && c.kind === 'site' ? `Registo do pedido ${c.request || c.id} do site. O preço da tabela é o do dia do pedido.` : '';
  spotChips();
  seasonOptions(c?.season);
  const ids = c ? A.idsOf(c) : [];
  $$('#c-spots input').forEach((i) => { i.checked = i.value === '_outro' ? !!c?.label : ids.includes(i.value); });
  $('#c-label').value = c?.label || '';
  $('#c-label-box').hidden = !c?.label;
  $('#c-brand').value = c?.brand || '';
  $('#c-season').value = String(c?.season || rules().season);
  $('#c-paid').value = c?.paidAt || today();
  $('#c-paid').min = FIRST_PAID; $('#c-paid').max = addDays(today(), 1);
  $('#c-amount').value = c ? String(c.amount ?? '') : '';
  $('#c-pay').value = c?.pay || 'tr';
  $('#c-inkind').value = c?.inKind || '';
  $('#c-url').value = c?.url || '';
  $('#c-cname').value = c?.contact?.name || '';
  $('#c-channel').value = c?.contact?.channel || '';
  $('#c-email').value = c?.contact?.email || '';
  $('#c-phone').value = c?.contact?.phone || '';
  $('#c-handle').value = c?.contact?.handle || '';
  $('#c-nif').value = c?.nif || '';
  $$('input[name="c-lang"]').forEach((i) => { i.checked = i.value === (c?.lang === 'en' ? 'en' : 'pt'); });
  $('#c-vector').checked = c?.logo?.vector === true;
  $('#c-race').value = c?.logo?.fromRace || '';
  $('#c-notes').value = c?.notes || '';
  $('#sh-err').textContent = '';
  $('#sh-go').disabled = false; $('#sh-go').textContent = c ? 'Guardar' : 'Registar';
  sheetHints();
  if (!d.open) d.showModal();
  d.scrollTop = 0;
  if (!c && matchMedia('(pointer: fine)').matches) $('#c-brand').focus();
}
// what the price table asked for these spots on the payment day (a site request's record keeps the request day's)
function tableQuote() {
  const ids = pickedIds();
  if (!S.data || !ids.length) return null;
  const paid = $('#c-paid').value, season = $('#c-season').value, r = rules();
  const c = S.sheet && S.sheet.id ? findC(S.sheet.id) : null;
  if (c && c.kind === 'site' && c.price && [...A.idsOf(c)].sort().join() === [...ids].sort().join()) return { net: c.price.total, m: c.price.m, seasonBp: c.price.seasonBp, discPct: c.price.discPct, gross: c.price.gross };
  const day = /^\d{4}-\d{2}-\d{2}$/.test(paid) ? paid : today();
  const m = seasonMonth(season === r.season ? r : defaultRules(season), day);
  return quote(S.data, ids, { day, m });
}
function sheetHints() {
  const q = tableQuote(), hint = $('#c-table'), use = $('#c-use');
  if (q) {
    const parts = [q.m > 0 ? `desconto de época de ${A.monthName(q.m)}, −${pctText(q.seasonBp)}%` : '', q.discPct ? `desconto de pacote, −${q.discPct}%` : ''].filter(Boolean);
    hint.textContent = `Tabela: ${A.money(q.net)}${parts.length ? ` (${parts.join('; ')})` : ''}`;
    use.hidden = String(q.net) === $('#c-amount').value.trim();
  } else { hint.textContent = pickedIds().length ? '' : 'Escolhe os espaços para ver o preço da tabela.'; use.hidden = true; }
  const pay = $('#c-pay').value;
  $('#c-inkind-box').hidden = pay !== 'produto' && pay !== 'outro';
  const r = rules(), season = $('#c-season').value, logoBy = (season === r.season ? r : defaultRules(season)).logoBy, paid = $('#c-paid').value;
  $('#c-race-box').hidden = !(paid && paid > logoBy) && !$('#c-race').value;
  $('#c-race-hint').textContent = `Pago depois de ${A.ptDay(logoBy, true)}: o logótipo vai para o fato e o capacete a partir desta prova.`;
  const nif = $('#c-nif').value.trim(), ok = nif ? nifOk(nif) : null;
  $('#c-nif-hint').textContent = ok === false ? 'Este NIF não bate certo (o último algarismo não confere). Confirma com a marca.' : '';
  $('#c-nif-hint').classList.toggle('bad', ok === false);
}

// the body of a create (all fields) or an edit ({ set }: the same fields)
function sheetBody() {
  const err = (msg, focus) => { throw Object.assign(new RuleError(msg), { focus }); };
  const brand = $('#c-brand').value.trim().replace(/\s+/g, ' ');
  if (!brand) err('Escreve o nome da marca.', '#c-brand');
  const ids = pickedIds(), outro = $('#c-spots input[value="_outro"]').checked, label = outro ? $('#c-label').value.trim() : '';
  if (!ids.length && !label) err(outro ? 'Escreve a descrição do patrocínio em «Outro».' : 'Escolhe os espaços, o fato completo, ou «Outro» com uma descrição.', outro ? '#c-label' : '#c-spots input');
  let paid;
  try { paid = normPaid($('#c-paid').value, $('#c-amount').value, today()); } catch (x) { err(x.message, /montante/i.test(x.message) ? '#c-amount' : '#c-paid'); }
  let url = '';
  try { url = normUrl($('#c-url').value); } catch (x) { err(x.message, '#c-url'); }
  if (url && !/^https:\/\//.test(url)) err('O link da marca tem de começar por https://.', '#c-url');
  const email = $('#c-email').value.trim(), phone = $('#c-phone').value.trim(), nif = $('#c-nif').value.trim();
  if (email && !/^[^\s@]+@[^\s@]+$/.test(email)) err('O email não é válido.', '#c-email');
  if (phone && !/^[0-9 +()-]*$/.test(phone)) err('O telefone só leva algarismos, espaços, +, ( ) e -.', '#c-phone');
  if (nif && !/^[A-Za-z0-9 .\-/]+$/.test(nif)) err('O NIF só leva letras, algarismos, espaços, pontos, / e -.', '#c-nif');
  const pay = $('#c-pay').value;
  const lang = $$('input[name="c-lang"]').find((i) => i.checked)?.value === 'en' ? 'en' : 'pt';
  const handle = $('#c-handle').value.trim();
  return {
    brand, season: $('#c-season').value, ...(ids[0] === TITLE ? { title: true } : { title: false, items: ids }), label,
    amount: paid.amount, paidAt: paid.paidAt, pay, inKind: pay === 'produto' || pay === 'outro' ? $('#c-inkind').value.trim() : '', url,
    contact: { name: $('#c-cname').value.trim(), channel: $('#c-channel').value, email, phone, handle },
    nif, lang, notes: $('#c-notes').value.trim(), logo: { vector: $('#c-vector').checked, fromRace: $('#c-race').value.trim() },
  };
}
async function submitSheet(e) {
  e.preventDefault();
  if (!S.sheet) return;
  const errBox = $('#sh-err'), btn = $('#sh-go');
  errBox.textContent = '';
  let b;
  try { b = sheetBody(); } catch (x) { errBox.textContent = x.message; const f = x.focus && $(x.focus); if (f) f.focus(); return; }
  const id = S.sheet.id, c = id ? findC(id) : null;
  if (c && c.kind === 'site') delete b.season;   // a site request's season is the request's
  if (c && String(c.season) === b.season) delete b.season;
  btn.disabled = true; btn.textContent = 'A guardar…';
  try {
    const j = id ? await call('POST', `/contratos/${encodeURIComponent(id)}`, { action: 'editar', set: b }) : await call('POST', '/contratos', b);
    put(j.contrato);
    closeDialogs();
    render();
    toast(id ? `${b.brand}: guardado.` : `Patrocínio de ${b.brand} registado.`);
    mark(j.contrato.id);
  } catch (x) {
    if (authLost(x)) return;
    errBox.textContent = errText(x);
    const map = { brand: '#c-brand', amount: '#c-amount', paidAt: '#c-paid', url: '#c-url', 'contact.email': '#c-email', 'contact.phone': '#c-phone', nif: '#c-nif', notes: '#c-notes', label: '#c-label', season: '#c-season' };
    const f = x instanceof ApiError && map[x.campo] && $(map[x.campo]);
    if (f) f.focus();
  } finally { btn.disabled = false; btn.textContent = id ? 'Guardar' : 'Registar'; }
}

// ---------- files: the confirmation PDF, the CSV, the .ics ----------
const touch = () => matchMedia('(pointer: coarse)').matches;
const ios = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const canShare = (file) => { try { return typeof navigator.share === 'function' && !!navigator.canShare && navigator.canShare({ files: [file] }); } catch (_) { return false; } };
// on a phone, the share sheet (Ficheiros, WhatsApp, email); elsewhere (or when it is not there), a download
async function deliver(file) {
  if (touch() && canShare(file)) {
    try { await navigator.share({ files: [file], title: file.name }); return true; } catch (e) { if (e && (e.name === 'AbortError' || e.name === 'InvalidStateError')) return false; }
  }
  return download(file);
}
function download(file) {
  const url = URL.createObjectURL(file), a = document.createElement('a');
  a.href = url; a.download = file.name; a.hidden = true;
  const host = [...$$('dialog')].find((d) => d.open) || document.body;
  host.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
function openPdf(c) {
  const d = $('#pdf');
  S.pdf = c.id;
  $('#pdf-sum').textContent = `${c.brand} · ${A.spotsText(c)} · ${A.money(c.amount)}`;
  $$('input[name="pdf-lang"]').forEach((i) => { i.checked = i.value === (c.lang === 'en' ? 'en' : 'pt'); });
  $('#pdf-err').textContent = '';
  d.showModal();
  $('#pdf-go').focus();
}
let pdfLock = false;
async function savePdf() {
  const c = findC(S.pdf);
  if (!c || pdfLock) return;
  pdfLock = true;
  const lang = $$('input[name="pdf-lang"]').find((i) => i.checked)?.value === 'en' ? 'en' : 'pt';
  try {
    const m = A.confirmationModel(c, lang, { data: S.data, site: { name: SITE.name, email: SITE.email, whatsapp: SITE.whatsapp } });
    const { confirmationPdf } = await import('./admin-confirm-pdf.js');
    const file = new File([confirmationPdf(m)], m.file, { type: 'application/pdf' });
    if (await deliver(file)) { $('#pdf').close(); toast(`Confirmação de ${c.brand} pronta: envia-a à marca.`); }
  } catch (e) { console.error(e); $('#pdf-err').textContent = 'Não consegui fazer o PDF neste aparelho.'; }
  finally { setTimeout(() => { pdfLock = false; }, 800); }
}
async function saveCsv() {
  if (!S.contracts) return;
  const day = today(), season = S.pref.season || 'todas';
  const list = A.filterContracts(S.contracts, { season }, day);
  const file = new File([A.toCsv(list, day, S.data)], A.csvName(season, day), { type: 'text/csv;charset=utf-8' });
  if (await deliver(file)) toast(`CSV com ${list.length} ${list.length === 1 ? 'registo' : 'registos'}.`);
}
function saveIcs() {
  if (!S.contracts) return;
  const r = rules();
  const file = new File([A.toIcs(S.contracts, r, Date.now())], A.icsName(r.season), { type: 'text/calendar;charset=utf-8' });
  // iPhone: Safari opens a calendar file itself and offers «Adicionar todos»
  if (ios()) { const url = URL.createObjectURL(file); location.assign(url); setTimeout(() => URL.revokeObjectURL(url), 60000); return; }
  download(file);
  toast('Calendário descarregado: abre-o para juntar as datas.');
}

// ---------- dialogs ----------
function ask(title, text, yes = 'Confirmar') {
  return new Promise((resolve) => {
    const d = $('#confirm');
    $('#cf-title').textContent = title; $('#cf-text').textContent = text; $('#cf-yes').textContent = yes;
    const done = (v) => { d.removeEventListener('close', onClose); $('#cf-yes').onclick = null; $('#cf-no').onclick = null; if (d.open) d.close(); resolve(v); };
    const onClose = () => { if (!d.open) done(false); };
    $('#cf-yes').onclick = () => done(true);
    $('#cf-no').onclick = () => done(false);
    d.addEventListener('close', onClose);
    d.showModal();
    $('#cf-no').focus();
  });
}
function askPaid(r) {
  return new Promise((resolve) => {
    const d = $('#pay'), form = $('#pay-form'), err = $('#pay-err');
    const sum = $('#pay-sum'); sum.textContent = '';
    sum.append(`${r.brand || 'Sem marca'} · pedido ${r.id} · Total do pedido `);
    sum.appendChild(el('b', null, typeof r.total === 'number' ? A.money(r.total) : '?'));
    if (Number.isInteger(r.m) && r.m > 0) sum.append(` · ${A.seasonText({ m: r.m, seasonBp: r.seasonBp })}`);
    const ct = Date.parse(r.closed || ''), closed = Number.isFinite(ct) ? lisbonDay(ct) : '';
    $('#pay-at').value = closed && closed >= FIRST_PAID ? closed : today(); $('#pay-at').min = FIRST_PAID; $('#pay-at').max = addDays(today(), 1);
    $('#pay-amt').value = typeof r.total === 'number' ? String(r.total) : '';
    err.textContent = '';
    const done = (v) => { form.onsubmit = null; $('#pay-no').onclick = null; $('#pay-x').onclick = null; d.removeEventListener('close', onClose); if (d.open) d.close(); resolve(v); };
    const onClose = () => { if (!d.open) done(null); };
    form.onsubmit = (e) => {
      e.preventDefault(); err.textContent = '';
      try { done(normPaid($('#pay-at').value, $('#pay-amt').value, today())); } catch (x) { err.textContent = x.message; }
    };
    $('#pay-no').onclick = () => done(null);
    $('#pay-x').onclick = () => done(null);
    d.addEventListener('close', onClose);
    d.showModal();
    $('#pay-go').focus();
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

// ---------- wiring ----------
function bind() {
  $('#key-form').addEventListener('submit', signIn);
  $('#reload').addEventListener('click', () => { load(); loadSpots(); });
  $('#forget').addEventListener('click', forget);
  $('#season').addEventListener('change', () => { S.pref.season = $('#season').value; savePref(); render(); });
  $('#q').addEventListener('input', () => { S.pref.q = $('#q').value; render(); });
  $('#new').addEventListener('click', () => openSheet(null));
  $('#csv').addEventListener('click', saveCsv);
  $('#ics').addEventListener('click', saveIcs);
  $('#sh-form').addEventListener('submit', submitSheet);
  for (const id of ['#c-paid', '#c-season', '#c-pay', '#c-amount', '#c-nif', '#c-race']) $(id).addEventListener('input', () => { $('#sh-err').textContent = ''; sheetHints(); });
  $('#c-use').addEventListener('click', () => { const q = tableQuote(); if (q) { $('#c-amount').value = String(q.net); sheetHints(); } });
  const closeSheet = () => { const d = $('#sheet'); if (d.open) d.close(); };
  $('#sh-x').addEventListener('click', closeSheet);
  $('#sh-cancel').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('close', () => { S.sheet = null; });
  $('#pdf-go').addEventListener('click', savePdf);
  $('#pdf-no').addEventListener('click', () => $('#pdf').close());
  $('#pdf-x').addEventListener('click', () => $('#pdf').close());
  // Enter on a field of the sheet moves on (only the button saves)
  $('#sh-form').addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key !== 'Enter' || e.isComposing || !(t instanceof HTMLInputElement) || ['checkbox', 'radio', 'button', 'submit'].includes(t.type)) return;
    e.preventDefault();
    const order = $$('#sh-form input:not([type="checkbox"]):not([type="radio"]):not([hidden]), #sh-form select, #sh-form textarea').filter((n) => !n.closest('[hidden]'));
    const next = order[order.indexOf(t) + 1];
    if (next) next.focus(); else t.blur();
  });
  const net = () => { $('#offline').hidden = navigator.onLine !== false; };
  addEventListener('online', net); addEventListener('offline', net); net();
  addEventListener('hashchange', goHash);
  addEventListener('resize', setBar);
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = performance.now(); return; }
    if (S.key && S.contracts && hiddenAt && performance.now() - hiddenAt > 60000 && !$$('dialog').some((x) => x.open)) load({ quiet: true });
  });
}

// frame-ancestors is ignored in a meta CSP: a framed copy of this page shows nothing
if (window.top !== window.self) document.documentElement.hidden = true;
else boot();
