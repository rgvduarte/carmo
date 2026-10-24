// /admin/strava/: connects Gonçalo's Strava account to the daily sync (.github/workflows/strava-sync.yml) from a phone,
// with no terminal. The OAuth code exchange runs here in the browser (Strava's token endpoint and API answer CORS), and
// the three values the workflow needs are shown for copying into the repository's Actions secrets.
// Nothing leaves this page except to www.strava.com (the CSP allows nothing else). Only the client id (not a secret: it
// is in the authorize URL) sits in sessionStorage (this tab only), with a one-time state value for the trip to Strava
// and back; the id stays until «Limpar» or «Acabei», so a reload can start again at step 2. The client secret and the
// tokens live in memory only. «Limpar» wipes all of it.
import './internal.js';   // this browser is the owner's: the public pages never load Google Analytics in it

const STRAVA = 'https://www.strava.com';
const REDIRECT = 'https://gocarmo.com/admin/strava/';
const SCOPE = 'read,activity:read_all';
const GONCALO = 50182673;              // strava.com/athletes/50182673
const KEY = 'gc.strava';
const TIMEOUT = 20000;

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

// in memory only
const mem = { id: '', code: '', secret: '', refresh: '', athlete: null, copied: false };
let busy = false;

// ---------- the trip to Strava and back (sessionStorage, this tab only) ----------
function readTrip() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (_) { return null; } }
function saveTrip(v) { try { sessionStorage.setItem(KEY, JSON.stringify(v)); return true; } catch (_) { return false; } }
function dropTrip() { try { sessionStorage.removeItem(KEY); } catch (_) {} }
function nonce() { const b = new Uint8Array(16); crypto.getRandomValues(b); return [...b].map((x) => x.toString(16).padStart(2, '0')).join(''); }

// ---------- steps: done above, one open, locked below ----------
function show(n, { focus = true } = {}) {
  for (let i = 1; i <= 5; i++) {
    const s = $(`#s${i}`), state = i < n ? 'done' : i === n ? 'open' : 'locked';
    s.dataset.state = state;
    $('.sv-st', s).textContent = state === 'done' ? ', feito' : state === 'locked' ? ', por fazer' : '';
  }
  // only a step that has not reached Strava yet can be changed; later on, «Limpar» starts over
  $('#s1-edit').hidden = n !== 2;
  $('#s1-sum').textContent = mem.id;
  if (!focus) return;
  const h = $(`#s${n}-h`);
  h.focus({ preventScroll: true });
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  $(`#s${n}`).scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' });
}

// a note in a step: kind '' (warning) or 'block' (error); actions sit in the step itself
function note(id, text, kind = 'block') {
  const ul = $(id); ul.textContent = '';
  if (!text) return;
  const li = el('li', kind || null, text); ul.append(li);
}
const clearNotes = () => $$('.sv .notes:not(#who-warn)').forEach((u) => { u.textContent = ''; });

// ---------- 1. the app ----------
function submitId(e) {
  e.preventDefault();
  const v = $('#cid').value.replace(/\s+/g, '');
  if (!v) return note('#n1', 'Cola aqui o Client ID da aplicação.');
  if (!/^\d{1,12}$/.test(v)) return note('#n1', 'O Client ID é só números, por exemplo 123456. Confirma que copiaste a linha certa.');
  note('#n1', '');
  mem.id = v;
  // an id changed with «Mudar» after a reload replaces the kept one (before the first trip nothing is stored)
  if (readTrip()) saveTrip({ id: v });
  show(2);
}

// ---------- 2. authorize ----------
function authorize() {
  if (!mem.id) return show(1);
  const state = nonce();
  if (!saveTrip({ id: mem.id, state })) return note('#n2', 'Este browser não deixou guardar o pedido. Sai da navegação privada e tenta outra vez.');
  const q = new URLSearchParams({ client_id: mem.id, response_type: 'code', redirect_uri: REDIRECT, approval_prompt: 'force', scope: SCOPE, state });
  location.assign(`${STRAVA}/oauth/authorize?${q}`);
}

// Strava sends the browser back to /admin/strava/?state=…&code=…&scope=… (or ?error=access_denied).
function readReturn() {
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error') && !q.has('state')) return false;
  // the code never stays in the address bar, the history or a bookmark
  history.replaceState(null, '', location.pathname);
  const got = { code: q.get('code') || '', state: q.get('state') || '', scope: q.get('scope') || '', error: q.get('error') || '' };
  const trip = readTrip();
  // the state is single use: keep only the client id, for a retry after a reload
  if (trip && trip.id) saveTrip({ id: trip.id }); else dropTrip();
  mem.id = (trip && trip.id) || '';
  $('#cid').value = mem.id;

  if (!trip || !trip.state || got.state !== trip.state) {
    const msg = 'Não deu para confirmar que este regresso do Strava vem deste pedido (pode ter aberto noutro separador). Por segurança, autoriza outra vez.';
    if (!mem.id) { show(1); note('#n1', `${msg} Começa por colar o Client ID.`); } else { show(2); note('#n2', msg); }
    return true;
  }
  if (got.error) {
    show(2);
    note('#n2', got.error === 'access_denied'
      ? 'Não ficou autorizado. No Strava, carrega em «Authorize», não em «Cancel».'
      : 'O Strava não autorizou. Tenta outra vez.');
    return true;
  }
  if (!got.code) { show(2); note('#n2', 'O Strava voltou sem código. Tenta outra vez.'); return true; }
  if (!got.scope.split(/[\s,]+/).includes('activity:read_all')) {
    show(2);
    note('#n2', 'Falta a autorização para as atividades privadas, e sem ela o site não conta todos os treinos. No Strava, deixa marcada «View data about your private activities» e autoriza outra vez.', '');
    $('#go-auth').textContent = 'Autorizar outra vez';
    return true;
  }
  mem.code = got.code;
  show(3);
  return true;
}

// ---------- 3. code -> tokens -> who ----------
class Fail extends Error { constructor(kind, status = 0) { super(kind); this.kind = kind; this.status = status; } }

async function call(url, init) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), TIMEOUT);
  try { return await fetch(url, { ...init, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal: ctl.signal }); }
  catch (_) { throw new Fail('network'); }
  finally { clearTimeout(t); }
}

function kindOf(status, body) {
  const errs = body && Array.isArray(body.errors) ? body.errors.filter(Boolean) : [];
  const field = (f) => errs.some((e) => e.field === f), res = (r) => errs.some((e) => e.resource === r);
  if (field('code') || res('AuthorizationCode') || res('RequestToken')) return 'code';
  if (field('client_secret') || field('client_id') || res('Application')) return 'secret';
  if (status === 429) return 'busy';
  if (status >= 500) return 'down';
  return 'other';
}

async function exchange(secret) {
  // a form body is a simple request: no preflight
  const r = await call(`${STRAVA}/oauth/token`, {
    method: 'POST',
    body: new URLSearchParams({ client_id: mem.id, client_secret: secret, code: mem.code, grant_type: 'authorization_code' }),
  });
  let body = null;
  try { body = await r.json(); } catch (_) {}
  if (r.ok && body && body.refresh_token && body.access_token) return body;
  throw new Fail(r.ok ? 'other' : kindOf(r.status, body), r.status);
}

async function whoIs(access) {
  const r = await call(`${STRAVA}/api/v3/athlete`, { headers: { Authorization: `Bearer ${access}` } });
  if (!r.ok) throw new Fail('athlete', r.status);
  return r.json();
}

const EXPLAIN = {
  secret: 'O Strava não aceitou o Client Secret. Copia outra vez a linha «Client Secret» da aplicação (carrega em «Show»), não o Access Token nem o Refresh Token.',
  code: 'O código do Strava expirou ou já foi usado. Autoriza outra vez no passo 2, é rápido.',
  network: 'Sem resposta do Strava. Confirma a rede e carrega outra vez em «Ligar».',
  busy: 'O Strava pediu uma pausa. Espera 15 minutos e tenta outra vez.',
  down: 'O Strava está com problemas neste momento. Tenta daqui a uns minutos.',
};

async function submitSecret(e) {
  e.preventDefault();
  if (busy) return;
  const sec = $('#csec').value.replace(/\s+/g, '');
  $('#a3').hidden = true;
  if (!sec) return note('#n3', 'Cola aqui o Client Secret.');
  if (/^\d{1,12}$/.test(sec)) return note('#n3', 'Isso parece o Client ID. Aqui vai o Client Secret: no Strava, carrega em «Show» ao lado dele e copia.');
  // only something shaped like a Strava secret leaves the page: never a GitHub token a browser filled or pasted here
  if (/^(gh[a-z]_|github_pat_)/i.test(sec)) { $('#csec').value = ''; return note('#n3', 'Isso é um token do GitHub, não o Client Secret. Aqui vai o Client Secret da aplicação no Strava.'); }
  if (!/^[0-9a-f]{40}$/i.test(sec)) return note('#n3', 'Isso não parece o Client Secret (são 40 letras e números, de 0-9 e a-f). No Strava, carrega em «Show» ao lado de Client Secret e copia a linha toda.');
  if (!mem.code) { note('#n3', EXPLAIN.code); $('#a3').hidden = false; return; }
  note('#n3', '');
  setBusy(true);
  try {
    const tok = await exchange(sec);
    mem.secret = sec;
    mem.refresh = tok.refresh_token;
    mem.code = '';                     // used: Strava takes each code once
    $('#csec').value = '';
    // sessionStorage keeps only { id } from here on: after a reload, step 2 starts again without step 1
    let who = null;
    try { who = await whoIs(tok.access_token); } catch (_) { who = tok.athlete || null; }
    mem.athlete = who;
    connected();
  } catch (f) {
    const kind = f instanceof Fail ? f.kind : 'network';
    const text = EXPLAIN[kind] || `O Strava recusou o pedido (erro ${f.status || '?'}). Autoriza outra vez no passo 2.`;
    note('#n3', text);
    // a code that has failed for any reason other than the secret or the network is not worth retrying
    if (kind === 'code' || kind === 'other') { mem.code = ''; $('#a3').hidden = false; }
    if (kind === 'secret') $('#csec').select();
  } finally {
    setBusy(false);
  }
}

function setBusy(on) {
  busy = on;
  const b = $('#go-tok');
  b.disabled = on;
  b.textContent = on ? '' : 'Ligar';
  if (on) { b.append(el('span', 'spin'), ' A ligar ao Strava…'); }
}

const plain = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

function face(img, ini, url, name) {
  ini.textContent = initials(name);
  const fallback = () => { img.hidden = true; img.removeAttribute('src'); ini.hidden = false; };
  if (/^https:\/\//.test(url || '')) {
    img.hidden = false; ini.hidden = true;
    img.onerror = fallback;
    img.src = url;
  } else fallback();
}

function connected() {
  const a = mem.athlete;
  const name = a ? [a.firstname, a.lastname].filter(Boolean).join(' ').trim() : '';
  const shown = name || 'uma conta sem nome';
  $('#who-name').textContent = shown;
  $('#s3-sum').textContent = shown;
  const pic = a && (a.profile || a.profile_medium);
  face($('#who-pic'), $('#who-ini'), pic, name);
  face($('#s3-pic'), $('#s3-ini'), a && (a.profile_medium || a.profile), name);

  const n = plain(name);
  const known = !!a && (a.id != null ? Number(a.id) === GONCALO : n.includes('goncalo') && n.includes('carmo'));
  $('#who-warn').hidden = known;
  $('#other3').hidden = known;
  $('#who-warn-t').textContent = !a
    ? 'Não deu para ler o nome desta conta.'
    : `Esta conta não é a do Gonçalo Carmo (strava.com/athletes/${GONCALO}).`;
  $('#f3').hidden = true;
  $('#d3').hidden = false;
  fillSecrets();
  // the form that had focus is gone: focus goes back to the step, the answer comes into view
  $('#s3-h').focus({ preventScroll: true });
  $('#d3').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
}

// ---------- 4. secrets ----------
const MASK = '••••••••••••';
function valueOf(k) { return k === 'id' ? mem.id : k === 'secret' ? mem.secret : mem.refresh; }
function fillSecrets() {
  for (const li of $$('.sv-sec')) {
    const v = valueOf(li.dataset.k), btn = $('[data-show]', li), open = btn.getAttribute('aria-pressed') === 'true';
    $('.sv-sec-v', li).textContent = !v ? '' : open ? v : MASK + v.slice(-4);
    btn.textContent = open ? 'Esconder' : 'Mostrar';
  }
}

// ---------- copy ----------
let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200);
}
function oldCopy(text) {
  const t = el('textarea', 'sr-only');
  t.value = text; t.setAttribute('readonly', ''); t.setAttribute('aria-hidden', 'true');
  document.body.append(t); t.select(); t.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) {}
  t.remove();
  return ok;
}
async function copy(text, btn) {
  if (!text) return;
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) { ok = oldCopy(text); }
  if (ok) mem.copied = true;
  if (!ok) { toast('Não deu para copiar. Carrega em «Mostrar» e copia à mão.'); return; }
  const was = btn.dataset.label || btn.textContent;
  btn.dataset.label = was;
  btn.textContent = 'Copiado ✓'; btn.classList.add('ok');
  clearTimeout(btn._t); btn._t = setTimeout(() => { btn.textContent = was; btn.classList.remove('ok'); }, 1600);
  toast('Copiado');
}

// ---------- Limpar ----------
function wipe({ ask = true } = {}) {
  if (ask && mem.refresh && !confirm('Apagar os valores desta página? Se ainda não estão os três no GitHub, tens de ligar outra vez.')) return;
  dropTrip();
  Object.assign(mem, { id: '', code: '', secret: '', refresh: '', athlete: null });
  if (mem.copied && navigator.clipboard) navigator.clipboard.writeText('').catch(() => {});
  mem.copied = false;
  $('#cid').value = ''; $('#csec').value = '';
  clearNotes();
  $('#go-auth').textContent = 'Autorizar no Strava';
  $('#a3').hidden = true; $('#f3').hidden = false; $('#d3').hidden = true;
  for (const img of [$('#who-pic'), $('#s3-pic')]) { img.hidden = true; img.removeAttribute('src'); }
  $('#who-ini').hidden = true; $('#s3-ini').hidden = true;
  $$('[data-show]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
  fillSecrets();
  history.replaceState(null, '', location.pathname);
  show(1);
  toast('Tudo limpo. Nada ficou guardado.');
}

// ---------- wiring ----------
function init() {
  $('#f1').addEventListener('submit', submitId);
  $('#s1-edit').addEventListener('click', () => { $('#cid').value = mem.id; show(1); $('#cid').focus(); });
  $('#go-auth').addEventListener('click', authorize);
  $('#f3').addEventListener('submit', submitSecret);
  $('#again3').addEventListener('click', () => { clearNotes(); $('#a3').hidden = true; show(2); });
  $('#other3').addEventListener('click', () => { clearNotes(); show(2); });
  $('#go-4').addEventListener('click', () => show(4));
  $('#go-5').addEventListener('click', () => show(5));
  $('#clear').addEventListener('click', () => wipe());
  $('#done').addEventListener('click', () => wipe({ ask: false }));

  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.hasAttribute('data-copy')) copy(b.dataset.copy, b);
    else if (b.hasAttribute('data-copy-v')) copy(valueOf(b.closest('.sv-sec').dataset.k), b);
    else if (b.hasAttribute('data-show')) { b.setAttribute('aria-pressed', String(b.getAttribute('aria-pressed') !== 'true')); fillSecrets(); }
  });

  const net = () => { $('#offline').hidden = navigator.onLine !== false; };
  addEventListener('online', net); addEventListener('offline', net); net();

  if (readReturn()) return;
  // back from Strava without an answer (the back button: the state is still there), or a reload after the return
  // (the state is used up, and the code, secret and tokens were in memory only): pick up at step 2
  const trip = readTrip();
  if (trip && /^\d{1,12}$/.test(trip.id || '')) {
    mem.id = trip.id; $('#cid').value = mem.id;
    show(2, { focus: false });
    if (!trip.state) note('#n2', 'A página recarregou e o que veio do Strava perdeu-se. O Client ID ficou: autoriza outra vez para continuar.', '');
  } else show(1, { focus: false });
}

init();
