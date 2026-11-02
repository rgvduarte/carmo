// /admin/apoiantes/: the names of the supporters' wall («Quem apoia»), kept in the booking Worker's KV (GET/POST
// /apoiantes/admin, worker/requests.js). Add one name (waiting, or published at once), publish the waiting ones
// together, take one off (deleted at once). The list of the GoFundMe goes in from the hub's drop zone (/admin/).
// Names only ever reach the page through textContent.
import './internal.js';   // this browser is the owner's: the public pages never load Google Analytics in it
import * as W from './admin-worker.js';
import { nameProblem, PROBLEM_PT, normName, shortName, foldKey, FEW, compareNames } from './apoiantes-core.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const hhmm = (d) => d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
const one = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const longDay = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return `${d} de ${['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][m - 1]} de ${y}`; };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const S = { doc: null, at: null, filter: 'all', q: '', confirm: '', busy: false };

function showKey(msg) {
  $('#key-form').hidden = false; $('#app').hidden = true; $('#reload').hidden = true;
  if (msg) $('#key-err').textContent = msg;
}
async function load() {
  if (!W.readKey()) { showKey(); return; }
  const btn = $('#reload'); btn.classList.add('busy'); btn.disabled = true;
  try {
    S.doc = await W.call('GET', '/apoiantes/admin'); S.at = new Date();
    $('#key-form').hidden = true; $('#app').hidden = false; $('#reload').hidden = false; $('#list-err').textContent = '';
    render();
  } catch (e) {
    if (e instanceof W.WorkerError && e.status === 401) { W.dropKey(); showKey('A chave dos pedidos mudou ou não está certa. Escreve-a outra vez.'); return; }
    if (S.doc) $('#list-err').textContent = W.errText(e); else showKey(W.errText(e));
  } finally { btn.classList.remove('busy'); btn.disabled = false; }
}

function render() {
  const d = S.doc, names = d.names, pub = names.filter((x) => x.state === 'publicado').length, wait = names.length - pub;
  $('#meta').textContent = `Atualizado às ${hhmm(S.at)}`;
  const st = $('#state'); st.textContent = '';
  st.append('No site: ', el('b', '', String(pub)), ` · à espera: `, el('b', '', String(wait)), '. ');
  st.append(pub ? 'O bloco «Quem apoia» está no site.' : 'Sem nomes publicados, o site não mostra nada.');
  if (d.expira) $('#keep-line').textContent = `Os nomes ficam no serviço dos pedidos (Cloudflare), nunca no GitHub, e apagam-se sozinhos a ${longDay(d.expira)}. Quem pedir para sair, sai no próprio dia (a página de privacidade promete no máximo 7 dias).`;
  $('#pub-box').hidden = !wait;
  $('#pub-text').textContent = `${one(wait, 'nome à espera', 'nomes à espera')}. Publicar põe-${wait === 1 ? 'no' : 'nos'} no site em até 5 minutos.`;
  $('#pub-go').textContent = wait === 1 ? 'Publicar 1 nome' : `Publicar ${wait} nomes`;
  $('#list-n').textContent = String(names.length);
  $('#find-box').hidden = names.length <= FEW;
  for (const b of $$('.ap-bar .chip')) b.setAttribute('aria-pressed', String(b.dataset.f === S.filter));
  const q = foldKey(S.q);
  const shown = names.filter((x) => (S.filter === 'all' || x.state === S.filter) && (!q || foldKey(x.name).split(' ').some((w) => w.startsWith(q)) || foldKey(x.name).startsWith(q)))
    .sort((a, b) => compareNames(a.name, b.name));
  const ul = $('#list'); ul.textContent = '';
  for (const x of shown) ul.appendChild(row(x));
  const empty = $('#list-empty');
  empty.hidden = !!shown.length;
  empty.textContent = !names.length ? 'Ainda não há nomes. Larga a lista do GoFundMe no Painel, ou adiciona um nome aqui.' : 'Nenhum nome neste filtro.';
}
function row(x) {
  const li = el('li', 'ap-row');
  if (S.confirm === x.id) {
    li.classList.add('ap-confirm');
    li.appendChild(el('p', '', `Retirar «${x.name}» do mural? Sai já da lista; no site, em até 5 minutos.`));
    const acts = el('div', 'drop-acts'), no = el('button', 'btn ghost sm', 'Cancelar'), yes = el('button', 'btn gold sm', 'Retirar');
    no.type = yes.type = 'button';
    no.addEventListener('click', () => { S.confirm = ''; render(); focusRow(x.id); });
    yes.addEventListener('click', () => retire(x, yes));
    acts.append(no, yes); li.appendChild(acts);
    queueMicrotask(() => yes.focus());
    return li;
  }
  li.dataset.id = x.id;
  li.append(el('span', 'ap-name', x.name), el('span', `ap-tag${x.state === 'espera' ? ' wait' : ''}`, x.state === 'espera' ? 'À espera' : 'No site'));
  const b = el('button', 'btn ghost sm', 'Retirar');
  b.type = 'button';
  b.setAttribute('aria-label', `Retirar ${x.name}`);
  b.addEventListener('click', () => { S.confirm = x.id; render(); });
  li.appendChild(b);
  return li;
}
function focusRow(id) { const b = $(`.ap-row[data-id="${id}"] .btn`); if (b) b.focus(); }
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }

async function retire(x, btn) {
  btn.disabled = true; btn.textContent = 'A retirar…';
  try {
    S.doc = await W.call('POST', '/apoiantes/admin', { action: 'retirar', id: x.id }); S.at = new Date();
    S.confirm = ''; render(); toast(`«${x.name}» saiu do mural.`);
    $('#list-h').focus?.();
  } catch (e) {
    if (e instanceof W.WorkerError && e.status === 404) { S.confirm = ''; await load(); toast('Esse nome já não estava no mural.'); return; }
    btn.disabled = false; btn.textContent = 'Retirar'; $('#list-err').textContent = W.errText(e);
  }
}

// a whole name typed in: suggest the short form (never forced: the person may have asked for it)
function warnAdd() {
  const v = normName($('#add-name').value), ul = $('#add-warn');
  ul.textContent = '';
  const words = v.split(' ').filter(Boolean);
  const short = shortName(v);
  const dup = S.doc && v && S.doc.names.find((x) => foldKey(x.name) === foldKey(v));
  if (dup) ul.appendChild(el('li', '', `Já existe «${dup.name}» no mural.`));
  else if (!nameProblem(v) && words.length >= 2 && !/^\p{L}\.$/u.test(words[words.length - 1]) && short && short !== v) {
    const li = el('li', '', `Parece um nome completo. A pessoa pediu-o assim? Em «Nome I.» fica «${short}». `);
    const use = el('button', 'link', `Usar «${short}»`); use.type = 'button';
    use.addEventListener('click', () => { $('#add-name').value = short; warnAdd(); $('#add-name').focus(); });
    li.appendChild(use); ul.appendChild(li);
  }
  ul.hidden = !ul.children.length;
}
async function add(ev) {
  ev.preventDefault();
  if (S.busy) return;
  const v = normName($('#add-name').value), err = $('#add-err'), ok = $('#add-ok');
  err.textContent = ''; ok.hidden = true;
  const why = nameProblem(v);
  if (why) { err.textContent = PROBLEM_PT[why]; $('#add-name').focus(); return; }
  const now = $('#add-now').checked, go = $('#add-go');
  S.busy = true; go.disabled = true; go.textContent = 'A adicionar…';
  try {
    S.doc = await W.call('POST', '/apoiantes/admin', { action: 'adicionar', name: v, publicar: now }); S.at = new Date();
    $('#add-name').value = ''; warnAdd(); render();
    ok.hidden = false; ok.textContent = now ? `«${v}» está no mural (no site em até 5 minutos).` : `«${v}» ficou à espera. Publica quando juntares os da semana.`;
  } catch (e) {
    if (e instanceof W.WorkerError && e.code === 'existe') err.textContent = 'Esse nome já está no mural.';
    else if (e instanceof W.WorkerError && e.code === 'nome') err.textContent = PROBLEM_PT[e.extra.motivo] || 'O serviço dos pedidos recusou este nome.';
    else err.textContent = W.errText(e);
  } finally { S.busy = false; go.disabled = false; go.textContent = 'Adicionar'; }
}
async function publish() {
  const go = $('#pub-go'), err = $('#pub-err');
  err.textContent = ''; go.disabled = true;
  try {
    const j = await W.call('POST', '/apoiantes/admin', { action: 'publicar' }); S.doc = j; S.at = new Date();
    render(); toast(`${one(j.published || 0, 'nome publicado', 'nomes publicados')}. No site em até 5 minutos.`);
  } catch (e) { err.textContent = W.errText(e); } finally { go.disabled = false; }
}
async function submitKey(ev) {
  ev.preventDefault();
  const k = $('#key').value.trim(), go = $('#key-go');
  $('#key-err').textContent = '';
  if (k.length < 16) { $('#key-err').textContent = 'A chave tem pelo menos 16 caracteres.'; return; }
  go.disabled = true; go.textContent = 'A abrir…';
  try { await W.call('GET', '/apoiantes/admin', null, k); W.keepKey(k); $('#key').value = ''; await load(); } catch (e) { $('#key-err').textContent = W.errText(e); } finally { go.disabled = false; go.textContent = 'Abrir'; }
}

function bind() {
  $('#key-form').addEventListener('submit', submitKey);
  $('#add-form').addEventListener('submit', add);
  $('#add-name').addEventListener('input', warnAdd);
  $('#pub-go').addEventListener('click', publish);
  $('#reload').addEventListener('click', load);
  for (const b of $$('.ap-bar .chip')) b.addEventListener('click', () => { S.filter = b.dataset.f; render(); });
  $('#find').addEventListener('input', () => { S.q = $('#find').value; render(); });
  $('#forget').addEventListener('click', () => { W.dropKey(); S.doc = null; showKey(); $('#key').focus(); });
  const off = () => { $('#offline').hidden = navigator.onLine; };
  addEventListener('online', off); addEventListener('offline', off); off();
}
if (window.top !== window.self) document.documentElement.hidden = true;
else { bind(); load(); }
