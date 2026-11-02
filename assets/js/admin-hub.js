// The admin hub (/admin/, owner's request of 02.11.2026): «Avisos» on top (each row goes to the exact place), the
// season's numbers, one big link per admin page with a live line, and the drop zone for the supporters' list.
// It only reads: the site's own data files, the booking Worker (with the Pedidos key, if this tab has it) and the
// statistics Worker (with the statistics key, if this tab has it). The one write is «Juntar ao mural» (the Worker's
// POST /apoiantes/admin). Every source may be missing: its tiles show «—» and the rest of the page works.
import './internal.js';   // this browser is the owner's: the public pages never load Google Analytics in it
import { SITE } from './data.js';
import { lisbonDay } from './season-rules.js';
import { money } from './admin-core.js';
import * as H from './admin-hub-core.js';
import * as W from './admin-worker.js';
import { createApi } from './admin-analytics-api.js';
import { readFileRows, namesOf, READ_ERR_PT } from './apoiantes-import.js';

const $ = (s, r = document) => r.querySelector(s);
const STATS_KEY = 'gc.stats.key';   // the statistics page's key (admin-analytics.js), this tab only
const statsKey = () => { try { return sessionStorage.getItem(STATS_KEY) || ''; } catch (_) { return ''; } };
const hhmm = (d) => d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Lisbon' });
// grouped from 1 000 (pt-PT leaves a four-digit number ungrouped), as the site writes its figures
const num = (n) => new Intl.NumberFormat('pt-PT', { useGrouping: 'always' }).format(n);
const S = { spots: null, gfm: null, strava: null, pedidos: null, contratos: null, apo: null, worker: 'nokey', workerErr: '', stats: null, statsState: 'nokey', at: null, busy: false };

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function set(id, text) { const e = document.getElementById(id); if (e) e.textContent = text; }

async function own(path) {
  try {
    const r = await fetch(new URL(`${path}?ts=${Date.now()}`, location.href).href, { cache: 'no-store', credentials: 'omit' });
    return r.ok ? await r.json() : null;
  } catch (_) { return null; }
}

// ---------- the sources ----------
async function loadWorker() {
  S.workerErr = '';
  if (!W.api()) { S.worker = 'off'; return; }
  if (!W.readKey()) { S.worker = 'nokey'; S.pedidos = S.contratos = S.apo = null; return; }
  const [p, c, a] = await Promise.allSettled([W.call('GET', '/pedidos'), W.call('GET', '/contratos'), W.call('GET', '/apoiantes/admin')]);
  const bad = [p, c, a].find((x) => x.status === 'rejected');
  if (bad && bad.reason instanceof W.WorkerError && bad.reason.status === 401) {
    W.dropKey(); S.worker = 'nokey'; S.pedidos = S.contratos = S.apo = null;
    $('#key-err').textContent = 'A chave dos pedidos mudou ou não está certa. Escreve-a outra vez.';
    return;
  }
  S.worker = 'on';
  S.pedidos = p.status === 'fulfilled' && Array.isArray(p.value?.pedidos) ? p.value.pedidos : null;
  S.contratos = c.status === 'fulfilled' && Array.isArray(c.value?.contratos) ? c.value.contratos : null;
  S.apo = a.status === 'fulfilled' && a.value && Array.isArray(a.value.names) ? a.value : null;
  if (bad) S.workerErr = W.errText(bad.reason);
}
async function loadStats() {
  const base = SITE.stats && SITE.stats.url, key = statsKey();
  if (!base) { S.statsState = 'off'; S.stats = null; return; }
  if (!key) { S.statsState = 'nokey'; S.stats = null; return; }
  const api = createApi({ base, key: () => key });
  const [o, s] = await Promise.allSettled([api.get('overview', { p: '7d' }), api.get('sponsors', { p: '7d' })]);
  if ([o, s].some((x) => x.status === 'rejected' && x.reason && x.reason.code === 'chave')) { S.statsState = 'lost'; S.stats = null; return; }
  const visits = o.status === 'fulfilled' ? o.value?.kpi?.visits?.v : null;
  const rows = s.status === 'fulfilled' && Array.isArray(s.value?.totals) ? s.value.totals : null;
  S.stats = { visits: Number.isFinite(visits) ? visits : null, clicks: rows ? rows.reduce((t, r) => t + (Number(r.logo) || 0), 0) : null };
  S.statsState = 'on';
}
async function load() {
  if (S.busy) return;
  S.busy = true;
  const btn = $('#reload'); btn.classList.add('busy'); btn.disabled = true;
  $('#meta').textContent = 'A ler…';
  try {
    const pub = Promise.all(['../data/spots.json', '../data/gofundme.json', '../data/strava.json'].map(own)).then(([a, b, c]) => { S.spots = a; S.gfm = b; S.strava = c; render(); });
    await Promise.all([pub, loadWorker(), loadStats()]);
    S.at = new Date();
    render();
  } finally { S.busy = false; btn.classList.remove('busy'); btn.disabled = false; }
}

// ---------- render ----------
function tile(id, value, sub) {
  set(`t-${id}`, value);
  const s = document.getElementById(`t-${id}-s`);
  s.textContent = '';
  if (sub && typeof sub === 'object') { const a = el('a', '', sub.text); a.href = sub.href; s.appendChild(a); } else s.textContent = sub || '';
}
function render() {
  const now = Date.now(), day = lisbonDay(now);
  // the numbers
  const st = H.spotStats(S.spots, now);
  const split = (k) => (st ? `Fato ${st.suit[k]} · capacete ${st.helmet[k]}` : '');
  tile('sold', st ? String(st.all.sold) : '—', st ? split('sold') : 'Não consegui ler os espaços');
  tile('res', st ? String(st.all.reserved) : '—', split('reserved'));
  tile('free', st ? String(st.all.free) : '—', split('free'));
  const cs = H.contractStats(S.contratos, S.spots);
  tile('rev', st ? money(st.revenue) : '—', cs ? `Recebido: ${money(cs.received)} (${H.plural(cs.n, 'contrato', 'contratos')})` : 'Pela tabela de preços');
  const statsHint = S.statsState === 'off' ? 'A medição não está ligada' : S.statsState === 'lost' ? { text: 'A chave mudou: entra em Estatísticas', href: 'analytics/' } : { text: 'Entra em Estatísticas para ver', href: 'analytics/' };
  const sv = S.stats;
  tile('vis', sv && sv.visits !== null ? num(sv.visits) : '—', sv ? 'Sem o dia de hoje' : statsHint);
  tile('clk', sv && sv.clicks !== null ? num(sv.clicks) : '—', sv ? 'Toques nos links das marcas' : statsHint);
  const g = H.gofundmeTile(S.gfm);
  tile('gfm', g.value, g.sub);
  const ac = H.supporterCounts(S.apo);
  tile('apo', ac ? String(ac.published) : '—', ac ? (ac.waiting ? `${ac.waiting} à espera` : ac.published ? 'Todos publicados' : 'Ainda nenhum: o bloco não aparece no site') : S.worker === 'off' ? 'Os pedidos não estão ligados' : 'Precisa da chave dos pedidos');

  // the cards' live lines
  if (st) set('c-espacos', `${H.plural(st.all.sold, 'vendido', 'vendidos')} · ${H.plural(st.all.reserved, 'reservado', 'reservados')} · ${H.plural(st.all.free, 'livre', 'livres')}`);
  set('c-patrocinios', cs ? `${H.plural(cs.n, 'contrato', 'contratos')} da época ${cs.season || ''} · ${money(cs.received)} recebidos`.replace(' da época  ·', ' ·') : 'Contratos, renovações e montra');
  set('c-analytics', sv && sv.visits !== null ? `${num(sv.visits)} ${sv.visits === 1 ? 'visita' : 'visitas'} nos últimos 7 dias` : 'Visitas, mapas de calor e relatórios');
  set('c-apoiantes', ac ? `${ac.published} no mural${ac.waiting ? ` · ${ac.waiting} à espera` : ''}` : 'Os nomes do símbolo «Quem apoia»');
  set('c-strava', H.stravaLine(S.strava, now));

  // the alerts
  const list = H.alerts({ now, day, spots: S.spots, pedidos: S.pedidos, contratos: S.contratos, apoiantes: S.apo, strava: S.strava });
  const ul = $('#alerts'); ul.textContent = '';
  for (const a of list) {
    const li = el('li'), link = el('a', `alert ${a.kind}`);
    link.href = a.href;
    link.append(el('span', 'a-dot'), el('span', 'a-t', a.text));
    if (a.sub) link.appendChild(el('span', 'a-s', a.sub));
    li.appendChild(link); ul.appendChild(li);
  }
  set('av-n', list.length ? String(list.length) : '');
  $('#alerts-empty').hidden = !!list.length || !S.at;
  const part = [];
  if (S.worker === 'nokey') part.push('Sem a chave dos pedidos não vejo pedidos, contratos nem apoiantes.');
  if (S.worker === 'off') part.push('Os pedidos não estão ligados neste site.');
  if (S.workerErr) part.push(S.workerErr);
  if (!S.spots && S.at) part.push('Não consegui ler os espaços do site.');
  $('#alerts-part').hidden = !part.length; set('alerts-part', part.join(' '));
  $('#key-form').hidden = S.worker !== 'nokey';
  $('#forget-row').hidden = S.worker !== 'on';
  if (S.at) $('#meta').textContent = `Atualizado às ${hhmm(S.at)}`;
  drawDrop();
}

// ---------- the key ----------
async function submitKey(ev) {
  ev.preventDefault();
  const k = $('#key').value.trim(), go = $('#key-go');
  $('#key-err').textContent = '';
  if (k.length < 16) { $('#key-err').textContent = 'A chave tem pelo menos 16 caracteres.'; return; }
  go.disabled = true; go.textContent = 'A abrir…';
  try {
    await W.call('GET', '/pedidos', null, k);
    W.keepKey(k); $('#key').value = '';
    await loadWorker(); render();
  } catch (e) { $('#key-err').textContent = W.errText(e); } finally { go.disabled = false; go.textContent = 'Abrir'; }
}

// ---------- the supporters' list ----------
const D = { name: '', rows: null, res: null, sending: false };
const one = (n, a, b) => `${n} ${n === 1 ? a : b}`;
function drawDrop() {
  const out = $('#drop-out');
  if (!D.rows) { out.hidden = true; return; }
  const existing = S.apo ? S.apo.names : [];
  const r = D.res = namesOf(D.rows, existing);
  out.hidden = false;
  set('drop-file', D.name);
  const parts = [one(r.add.length, 'nome novo', 'nomes novos'), one(r.anon, 'anónimo fora', 'anónimos fora'), one(r.repeated, 'repetido', 'repetidos')];
  if (r.invalid) parts.push(one(r.invalid, 'linha sem nome válido', 'linhas sem nome válido'));
  set('drop-sum', parts.join(', '));
  const ul = $('#drop-names'); ul.textContent = '';
  for (const n of r.add.slice(0, 60)) ul.appendChild(el('li', '', n));
  const more = $('#drop-more');
  const notes = [];
  if (r.add.length > 60) notes.push(`E mais ${r.add.length - 60}.`);
  if (!S.apo) notes.push(S.worker === 'nokey' ? 'Escreve a chave dos pedidos (em cima) para comparar com o mural e juntar.' : 'Não consegui ler o mural: os repetidos só contam os deste ficheiro.');
  if (!r.rows) notes.push('Não encontrei nomes neste ficheiro.');
  more.hidden = !notes.length; more.textContent = notes.join(' ');
  $('#drop-go').disabled = !r.add.length || !S.apo || D.sending;
}
function resetDrop() {
  D.rows = D.res = null; D.name = '';
  $('#drop-in').value = ''; $('#drop-err').textContent = '';
  $('#drop-confirm').hidden = true; $('#drop-acts').hidden = false;
  drawDrop();
}
async function takeFile(file) {
  if (!file) return;
  resetDrop(); $('#drop-ok').hidden = true;
  try { D.rows = await readFileRows(file); D.name = file.name; } catch (e) {
    $('#drop-err').textContent = READ_ERR_PT[e && e.message] || 'Não consegui ler este ficheiro.';
    return;
  }
  drawDrop();
}
function askJoin() {
  const n = D.res ? D.res.add.length : 0;
  if (!n) return;
  set('drop-q', `Juntar ${one(n, 'nome', 'nomes')} ao mural? ${n === 1 ? 'Fica' : 'Ficam'} no site em até 5 minutos, como «Nome I.». Para tirar um nome, usa Apoiantes.`);
  $('#drop-acts').hidden = true; $('#drop-confirm').hidden = false; $('#drop-yes').focus();
}
async function join() {
  if (!D.res || D.sending) return;
  D.sending = true;
  const yes = $('#drop-yes'); yes.disabled = true; yes.textContent = 'A juntar…';
  try {
    const j = await W.call('POST', '/apoiantes/admin', { action: 'importar', names: D.res.add, publicar: true });
    S.apo = j;
    const okText = `${one(j.added || 0, 'nome junto', 'nomes juntos')} ao mural.${j.repetidos ? ` ${one(j.repetidos, 'já lá estava', 'já lá estavam')}.` : ''}`;
    resetDrop();
    const ok = $('#drop-ok'); ok.hidden = false; ok.textContent = '';
    const a = el('a', '', 'Ver em Apoiantes'); a.href = 'apoiantes/';
    ok.append(`${okText} `, a);
    render();
  } catch (e) {
    $('#drop-err').textContent = W.errText(e);
    if (e instanceof W.WorkerError && e.status === 401) { W.dropKey(); S.worker = 'nokey'; S.apo = null; render(); }
  } finally { D.sending = false; yes.disabled = false; yes.textContent = 'Confirmar'; }
}

function bind() {
  $('#reload').addEventListener('click', () => load());
  $('#key-form').addEventListener('submit', submitKey);
  $('#forget').addEventListener('click', () => { W.dropKey(); S.worker = 'nokey'; S.pedidos = S.contratos = S.apo = null; render(); $('#key').focus(); });
  const drop = $('#drop'), input = $('#drop-in');
  input.addEventListener('change', () => takeFile(input.files && input.files[0]));
  for (const t of ['dragenter', 'dragover']) drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); });
  for (const t of ['dragleave', 'dragend']) drop.addEventListener(t, () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); takeFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]); });
  // a file dropped beside the zone must not open in the tab (and leave the hub)
  addEventListener('dragover', (e) => e.preventDefault());
  addEventListener('drop', (e) => e.preventDefault());
  $('#drop-cancel').addEventListener('click', () => { resetDrop(); input.focus(); });
  $('#drop-go').addEventListener('click', askJoin);
  $('#drop-back').addEventListener('click', () => { $('#drop-confirm').hidden = true; $('#drop-acts').hidden = false; $('#drop-go').focus(); });
  $('#drop-yes').addEventListener('click', join);
  const off = () => { $('#offline').hidden = navigator.onLine; };
  addEventListener('online', () => { off(); load(); }); addEventListener('offline', off); off();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && S.at && Date.now() - S.at > 60000) load(); });
}

// frame-ancestors is ignored in a meta CSP: a framed copy of this page shows nothing
if (window.top !== window.self) document.documentElement.hidden = true;
else { bind(); render(); load(); }
