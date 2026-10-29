// /admin/documentos/: the cofre. Every document we make for Gonçalo, encrypted on the orphan branch «docs», decrypted
// here, on the phone, chunk by chunk. The key pair is made in this browser (vault-crypto.js); its private key is kept in
// vault.json sealed with the owner's passphrase, and, with «Lembrar neste aparelho», as a non-extractable CryptoKey in
// IndexedDB. The computer (scripts/docs-publish.mjs) only ever has the public key. README, «Documentos».
import './internal.js';   // this browser is the owner's: the public pages never load Google Analytics in it
import { V, VaultError, checkVault, fingerprint, newVault, unlockVault, rewrapVault, importPublic, unwrapKey, decryptChunk, openManifest, chunkCount, keyMatches, weakPass, suggestPass } from './vault-crypto.js';
import { WORDS } from './vault-words.js';
import * as store from './admin-documentos-store.js';
import { getToken, setToken, readToken, keepToken, forgetToken, checkToken, errText, signInText, UiError, GhError } from './admin-gh.js';

const $ = (s, el = document) => el.querySelector(s);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v; else if (k === 'text') el.textContent = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c);
  return el;
};

// ---------- texts ----------
const T = {
  noCrypto: 'Este browser não consegue abrir o cofre. Usa o Safari ou o Chrome atualizados.',
  badPass: 'A frase-passe não abre o cofre. Confirma maiúsculas e espaços.',
  short: `A frase-passe tem de ter pelo menos ${V.PASS_MIN} caracteres.`,
  // weakPass() codes: the vault.json is public, so a passphrase that is tried first must not get in
  weak: {
    repetida: 'A frase-passe repete quase sempre os mesmos caracteres. Usa palavras diferentes, ou «Sugerir uma frase-passe».',
    'do-site': 'A frase-passe é quase só palavras do site (gocarmo, Gonçalo, Kona, cofre…), números e sinais: é das primeiras a ser tentada. Usa outras palavras, ou «Sugerir uma frase-passe».',
    'poucas-palavras': 'Com menos de 24 caracteres, usa pelo menos três palavras diferentes, ou «Sugerir uma frase-passe».',
  },
  differ: 'As duas frases-passe não são iguais.',
  broken: 'Este ficheiro chegou estragado ou foi mudado no GitHub. Tenta outra vez; se repetir, publica de novo no computador.',
  moved: 'O cofre mudou entretanto. A lista está atualizada: tenta outra vez.',
  newer: 'Este cofre foi publicado por uma versão mais nova do publicador. Recarrega a página; se continuar, atualiza o site.',
  stale: 'A lista pode ter até 5 minutos de atraso.',
  privateWin: 'Numa janela privada não dá para lembrar.',
  remembered: 'A chave fica lembrada neste aparelho.',
  oldKey: (fp) => `Este cofre é novo e os documentos ainda estão fechados com a chave antiga. Publica outra vez no computador com --accept-vault "${fp}".`,
  badVault: (why) => `O vault.json não é válido (${why}). Não o uses.`,
};
const cmdOf = (fp) => `node scripts/docs-publish.mjs --accept-vault "${fp}"`;

// ---------- formats ----------
const PT_MON = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const fmtDay = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || '')); return m ? `${Number(m[3])} ${PT_MON[Number(m[2]) - 1]} ${m[1]}` : ''; };
function fmtWhen(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map((x) => [x.type, x.value]));
  return `${fmtDay(`${p.year}-${p.month}-${p.day}`)}, ${p.hour}:${p.minute}`;
}
const num1 = (x) => (x >= 100 ? String(Math.round(x)) : x.toFixed(1).replace('.', ',').replace(/,0$/, ''));
function fmtSize(n) {
  if (!Number.isFinite(n) || n < 0) return '';
  if (n < 1000) return `${n} B`;
  if (n < 1e6) return `${Math.max(1, Math.round(n / 1e3))} kB`;
  if (n < 1e9) return `${num1(n / 1e6)} MB`;
  return `${num1(n / 1e9)} GB`;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const safeName = (s) => String(s || 'documento').replace(/[\u0000-\u001f\u007f/\\:*?"<>|]+/g, '-').replace(/^\.+/, '').slice(0, 120) || 'documento';

// ---------- small UI helpers ----------
let toastT = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200);
}
function busy(btn, on, label) {
  if (on) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.replaceChildren(h('span', { class: 'spin', 'aria-hidden': 'true' }), label || btn.dataset.label);
  } else {
    btn.disabled = false;
    if (btn.dataset.label) btn.textContent = btn.dataset.label;
  }
}
const SCREENS = ['create', 'created', 'unlock', 'open'];
function show(which) {
  hideAll();
  for (const id of SCREENS) $(`#${id}`).hidden = id !== which;
  $('#status').hidden = true;
  $('#problem').hidden = true;
  $('#gh-line').hidden = !getToken();
}
function status(text) {
  for (const id of SCREENS) $(`#${id}`).hidden = true;
  $('#problem').hidden = true;
  $('#status-t').textContent = text;
  $('#status').hidden = false;
}
function problem(text, { newVault: offerNew = false } = {}) {
  for (const id of SCREENS) $(`#${id}`).hidden = true;
  $('#status').hidden = true;
  $('#problem-t').textContent = text;
  $('#problem-new').hidden = !offerNew;
  $('#problem').hidden = false;
}
function openNote(text, kind = '') {
  const ul = $('#open-notes');
  ul.append(h('li', { class: kind || false, text }));
  ul.hidden = false;
}
const clearNotes = () => { $('#open-notes').replaceChildren(); $('#open-notes').hidden = true; };
function closeDialogs() { for (const d of document.querySelectorAll('dialog[open]')) d.close(); }
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch (_) { toast('Não deu para copiar. Seleciona o texto e copia à mão.'); }
}
const passOf = (input) => input.value.normalize('NFC');
// '' when the new passphrase is good enough, else the sentence that says why not
const passProblem = (p) => { const why = weakPass(p); return why ? (why === 'curta' ? T.short : T.weak[why]) : ''; };

// «Mostrar» next to every passphrase field (typed twice on a phone keyboard: a typo must be seen), and «Sugerir uma
// frase-passe»: five words drawn here from vault-words.js
function addShow(input) {
  const wrap = h('div', { class: 'dc-pw' });
  input.replaceWith(wrap);
  wrap.append(input);
  const b = h('button', { class: 'btn sm ghost dc-show', type: 'button', 'aria-pressed': 'false', 'aria-controls': input.id }, 'Mostrar');
  b.addEventListener('click', () => { reveal(input, input.type === 'password'); input.focus(); });
  wrap.append(b);
}
function reveal(input, on) {
  input.type = on ? 'text' : 'password';
  const b = input.parentElement && input.parentElement.querySelector('.dc-show');
  if (b) b.setAttribute('aria-pressed', String(on));
}
const hideAll = () => { for (const i of document.querySelectorAll('.dc-pw input')) reveal(i, false); };
for (const d of document.querySelectorAll('dialog')) d.addEventListener('close', hideAll);
for (const i of document.querySelectorAll('input[type="password"]')) addShow(i);
for (const b of document.querySelectorAll('[data-suggest]')) {
  b.addEventListener('click', () => {
    const input = $(`#${b.dataset.suggest}`), again = $(`#${b.dataset.again}`);
    input.value = suggestPass(WORDS);
    input.dispatchEvent(new Event('input'));
    reveal(input, true);
    again.value = '';
    again.focus();
    toast('Escreve-a outra vez no campo de baixo e guarda-a já nas Palavras-passe do aparelho.');
  });
}

// ---------- state ----------
const S = {
  branch: null,          // store.loadBranch() result
  vault: null, vaultText: null, pub: null, fp: '',
  priv: null,            // the non-extractable private key, while open
  remembered: false,     // a key for this kid in IndexedDB
  idb: true,
  manifest: null,
  shareFiles: false,     // this phone can hand a file to the share sheet (Guardar em Ficheiros on iOS)
};

// ---------- the GitHub token (only to write: create, change the passphrase, a new key pair) ----------
let tokenWait = null;
function ensureToken() {
  if (getToken()) return Promise.resolve(true);
  const d = $('#d-token');
  $('#t-err').textContent = ''; $('#t-tok').value = '';
  d.showModal();
  setTimeout(() => $('#t-tok').focus(), 50);
  return new Promise((ok) => { tokenWait = ok; d.addEventListener('close', () => { if (tokenWait) { tokenWait(false); tokenWait = null; } }, { once: true }); });
}
$('#token-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const t = $('#t-tok').value.trim(), btn = $('#t-go');
  $('#t-err').textContent = '';
  busy(btn, true, 'A confirmar…');
  try {
    await checkToken(t);
    keepToken(t, $('#t-remember').checked);
    const ok = tokenWait; tokenWait = null;
    $('#d-token').close();
    $('#gh-line').hidden = false;
    if (ok) ok(true);
  } catch (x) { $('#t-err').textContent = signInText(x); } finally { busy(btn, false); }
});
$('#gh-out').addEventListener('click', () => { forgetToken(); setToken(null); $('#gh-line').hidden = true; toast('Saíste do GitHub neste browser. O cofre continua como estava.'); });

// ---------- loading ----------
async function boot({ keepOpen = false } = {}) {
  if (!globalThis.crypto || !crypto.subtle || !window.isSecureContext) { problem(T.noCrypto); return; }
  if (!keepOpen) { S.priv = null; S.manifest = null; }
  status('A abrir o cofre…');
  let b;
  try { b = await store.loadBranch(); } catch (e) { problem(errText(e)); return; }
  S.branch = b;
  if (b.vaultText == null) {
    S.vault = null; S.vaultText = null; S.priv = null;
    if (b.fallback) { problem(errText(new GhError(403, '', b.rate))); return; }
    show('create');
    return;
  }
  const why = b.vault === undefined ? ['não é JSON'] : checkVault(b.vault);
  if (why.length) { S.vault = null; S.vaultText = b.vaultText; problem(T.badVault(why.join('; ')), { newVault: true }); return; }
  const kidChanged = S.vault && S.vault.kid !== b.vault.kid;
  S.vault = b.vault; S.vaultText = b.vaultText;
  // a key remembered for an older vault still opens what was published with it (and those copies stay public): out
  try { await store.forgetOtherKeys(S.vault.kid); } catch (_) {}
  S.pub = await importPublic(S.vault);
  S.fp = await fingerprint(S.vault.pub);
  if (kidChanged) S.priv = null;
  if (S.priv) { await openList(); return; }
  S.remembered = false;
  let kept = null;
  try { kept = await store.recallKey(S.vault.kid); } catch (_) {}
  if (kept) {
    if (await keyMatches(kept.key, S.vault)) { S.priv = kept.key; S.remembered = true; await openList(); return; }
    try { await store.forgetKey(S.vault.kid); } catch (_) {}
  }
  showUnlock();
}
function showUnlock() {
  $('#u-err').textContent = ''; $('#u-pass').value = '';
  $('#u-kept').hidden = !S.remembered;
  show('unlock');
}

// ---------- 1. create ----------
const spaceHint = (a, b) => () => { const v = a.value; $(b).hidden = !(v && v !== v.trim()); };
$('#c-pass').addEventListener('input', spaceHint($('#c-pass'), '#c-space'));
$('#create').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#c-err'), btn = $('#c-go');
  err.textContent = '';
  const p = passOf($('#c-pass')), p2 = passOf($('#c-pass2'));
  const weak = passProblem(p);
  if (weak) { err.textContent = weak; $('#c-pass').focus(); return; }
  if (p !== p2) { err.textContent = T.differ; $('#c-pass2').focus(); return; }
  if (!(await ensureToken())) { err.textContent = 'Sem o token do GitHub não consigo guardar o cofre.'; return; }
  await createVault({ pass: p, remember: $('#c-remember').checked, expect: null, btn, err, message: 'Cofre: criado' });
});
// newVault -> commit -> «Cofre pronto» with the fingerprint (also the lost-passphrase path, on top of the old vault)
async function createVault({ pass, remember, expect, btn, err, message }) {
  busy(btn, true, 'A preparar a chave…');
  try {
    const made = S.pending && S.pending.pass === pass ? S.pending.made : await newVault(pass);
    S.pending = { pass, made };
    btn.lastChild.textContent = 'A guardar no GitHub…';
    await store.commitVault(made.vault, { expect, message });
    S.pending = null;
    const oldKid = S.vault && S.vault.kid;
    S.vault = made.vault; S.vaultText = store.vaultText(made.vault);
    S.pub = await importPublic(S.vault); S.fp = made.fingerprint; S.priv = made.privateKey;
    S.manifest = null;
    if (oldKid && oldKid !== S.vault.kid) { try { await store.forgetKey(oldKid); } catch (_) {} }
    S.remembered = false;
    if (remember) await remember_(S.priv);
    closeDialogs();
    $('#created-fp').textContent = S.fp;
    $('#created-cmd').replaceChildren('node scripts/docs-publish.mjs ', h('span', { class: 'dc-nb', text: '--accept-vault' }), ` "${S.fp}"`);
    show('created');
    $('#created-h').focus();
    // the branch as it is now, for the list after «Continuar»
    try { S.branch = await store.loadBranch(); } catch (_) {}
    return true;
  } catch (x) {
    if (x instanceof VaultError && x.code === 'curta') err.textContent = T.short;
    else if (x instanceof UiError && x.reload) { S.pending = null; closeDialogs(); await boot(); toast(x.message); err.textContent = x.message; }
    else err.textContent = errText(x, 'write').replace('O site não mudou.', 'O cofre não mudou.');
    return false;
  } finally { busy(btn, false); }
}
$('#created-copy').addEventListener('click', () => copy(cmdOf(S.fp)));
$('#created-go').addEventListener('click', () => openList());

// ---------- remember / forget ----------
async function remember_(key) {
  try { await store.rememberKey(S.vault.kid, key); S.remembered = true; return true; } catch (_) { S.idb = false; toast(T.privateWin); return false; }
}
$('#forget').addEventListener('click', () => $('#d-forget').showModal());
$('#forget-go').addEventListener('click', async () => {
  // every key this browser remembers, also one of an older vault
  try { await store.forgetAllKeys(); } catch (_) {}
  S.remembered = false;
  $('#d-forget').close();
  $('#forget').hidden = true;
  toast('Esquecida neste aparelho. Da próxima vez, o cofre pede a frase-passe.');
});

// ---------- 2. unlock ----------
$('#unlock').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#u-err'), btn = $('#u-go');
  err.textContent = '';
  const p = $('#u-pass').value;
  if (!p) { err.textContent = 'Escreve a frase-passe.'; return; }
  busy(btn, true, 'A abrir o cofre…');
  try {
    const key = await unlockVault(S.vault, p);
    $('#u-pass').value = '';
    S.priv = key;
    if ($('#u-remember').checked) await remember_(key);
    await openList();
  } catch (x) {
    err.textContent = x instanceof VaultError ? (x.code === 'frase' ? T.badPass : x.code === 'estragado' ? 'O cofre está estragado: a chave guardada não é a deste cofre. Cria um cofre novo.' : T.badVault(x.message)) : errText(x);
  } finally { busy(btn, false); }
});
$('#u-kept').addEventListener('click', () => boot());
$('#lock').addEventListener('click', () => { S.priv = null; S.manifest = null; $('#cats').replaceChildren(); showUnlock(); toast('Cofre bloqueado.'); });

// ---------- 3 and 4. the list ----------
async function openList() {
  clearNotes();
  $('#cats').replaceChildren(); $('#empty').hidden = true; $('#found-none').hidden = true; $('#find-f').hidden = true;
  $('#forget').hidden = !S.remembered;
  const b = S.branch || {};
  if (b.fallback) openNote(T.stale);
  const env = b.envelope;
  S.manifest = null;
  if (!env) { $('#pub-line').textContent = 'Ainda sem documentos'; $('#empty').hidden = false; show('open'); return; }
  if (env.broken) { $('#pub-line').textContent = ''; openNote(T.broken, 'block'); show('open'); return; }
  if (env.kid !== S.vault.kid) { $('#pub-line').textContent = 'Ainda sem documentos neste cofre'; openNote(T.oldKey(S.fp)); show('open'); return; }
  status('A abrir a lista…');
  try { S.manifest = await openManifest(S.priv, S.pub, env); } catch (x) {
    show('open');
    $('#pub-line').textContent = '';
    openNote(x instanceof VaultError && x.code === 'versao' ? T.newer : T.broken, 'block');
    return;
  }
  render();
  show('open');
}

function groups(m) {
  const cats = (Array.isArray(m.categories) ? m.categories : []).filter((c) => c && c.id);
  const docs = (Array.isArray(m.docs) ? m.docs : []).filter((d) => d && Array.isArray(d.versions) && d.versions.length);
  const out = cats.map((c) => ({ id: c.id, title: c.title || c.id, docs: docs.filter((d) => d.category === c.id) }));
  const known = new Set(cats.map((c) => c.id));
  out.push({ id: '', title: 'Outros', docs: docs.filter((d) => !known.has(d.category)) });
  return out.filter((g) => g.docs.length);
}
function render() {
  const m = S.manifest, all = groups(m), count = all.reduce((a, g) => a + g.docs.length, 0);
  $('#pub-line').textContent = [m.published && `Publicado a ${fmtWhen(m.published)}`, plural(count, 'documento', 'documentos')].filter(Boolean).join(' · ');
  if (!count) { $('#empty').hidden = false; return; }
  $('#find-f').hidden = count <= 8;
  const q = fold($('#find').value.trim());
  const match = (d) => !q || fold([d.title, d.note, ...d.versions.flatMap((v) => [v.label, v.name, ...(v.changes || [])])].join(' ')).includes(q);
  const cats = $('#cats');
  cats.replaceChildren();
  let shown = 0;
  for (const g of all) {
    const docs = g.docs.filter(match);
    if (!docs.length) continue;
    shown += docs.length;
    const hid = `cat-${g.id || 'outros'}`;
    cats.append(h('section', { class: 'dc-cat', 'aria-labelledby': hid },
      h('h2', { class: 'dc-cat-h', id: hid }, g.title, h('span', { class: 'c', text: String(docs.length) })),
      h('div', { class: 'dc-grid' }, docs.map(docCard))));
  }
  $('#found-none').hidden = shown > 0;
}
$('#find').addEventListener('input', () => { if (S.manifest) render(); });

function docCard(d) {
  const [latest, ...older] = d.versions;
  return h('article', { class: 'card dc-doc', 'data-doc': d.id },
    h('h3', { class: 'dc-title', text: d.title || d.id }),
    d.note ? h('p', { class: 'dc-note', text: d.note }) : null,
    verBlock(d, latest, true),
    older.length ? h('details', { class: 'dc-old' }, h('summary', {}, `Versões anteriores (${older.length})`), older.map((v) => verBlock(d, v, false))) : null);
}
function verBlock(d, v, isLatest) {
  const box = h('div', { class: `dc-ver${isLatest ? ' dc-latest' : ''}`, 'data-vid': v.vid || v.fid });
  box.append(
    h('p', { class: 'dc-ver-h' }, isLatest ? h('span', { class: 'dc-badge', text: 'mais recente' }) : null, h('b', { text: v.label || '' }), v.date ? h('span', { class: 'dc-date', text: `· ${fmtDay(v.date)}` }) : null),
    h('p', { class: 'dc-size' }, h('span', { text: fmtSize(v.size) }), v.name ? h('span', { class: 'dc-name', text: v.name }) : null),
    Array.isArray(v.changes) && v.changes.length ? h('ul', { class: 'dc-changes' }, v.changes.map((c) => h('li', { text: c }))) : null,
  );
  const dl = h('div', { class: 'dc-dl' });
  box.append(dl);
  idle(dl, d, v);
  return box;
}

// ---------- 5. download ----------
// One file at a time (a phone keeps one in memory), and a download that stops half way (no network, the tab put in the
// background, «Cancelar») keeps the parts it has: «Continuar (parte 9 de 10)» goes on from there. «Fechar» drops them.
const held = new Map();     // fid -> { parts, next }
let running = null;         // the fid being downloaded
const BIG = 16e6;           // from this size, «Mantém esta página aberta até acabar.»
function idle(dl, d, v, msg = '') {
  dl.dataset.idle = '1';
  dl._idle = () => idle(dl, d, v, msg);
  const had = held.get(v.fid);
  const go = h('button', { class: 'btn sm dc-get', type: 'button', onclick: () => download(dl, d, v) }, had ? `Continuar (parte ${had.next + 1} de ${v.n})` : 'Descarregar');
  dl.replaceChildren(go);
  if (had) dl.append(h('button', { class: 'btn sm ghost', type: 'button', onclick: () => { held.delete(v.fid); msg = ''; idle(dl, d, v); } }, 'Fechar'));
  if (msg) dl.append(h('p', { class: 'err dc-dl-err', role: 'alert', text: msg }));
  if (running && running !== v.fid) {
    go.disabled = true;
    dl.append(h('p', { class: 'hint dc-wait', text: 'Espera que acabe o outro ficheiro.' }));
  }
}
// the other «Descarregar» buttons follow `running`
const others = () => { for (const el of document.querySelectorAll('.dc-dl[data-idle]')) if (el._idle) el._idle(); };
const verOk = (v) => /^[0-9a-f]{32}$/.test(String(v.fid)) && Number.isInteger(v.size) && v.size >= 0 && v.n === chunkCount(v.size) && (v.chunk === undefined || v.chunk === V.CHUNK) && typeof v.key === 'string';
async function download(dl, d, v) {
  if (running) return;
  if (!verOk(v)) { idle(dl, d, v, v.chunk && v.chunk !== V.CHUNK ? T.newer : T.broken); return; }
  const had = held.get(v.fid);
  held.delete(v.fid);
  const parts = had ? had.parts : [];
  delete dl.dataset.idle;
  running = v.fid;
  others();
  const ac = new AbortController();
  const text = h('p', { class: 'dc-prog-t', text: `A descarregar: parte ${parts.length + 1} de ${v.n}` });
  const bar = h('progress', { max: String(v.n), value: String(parts.length), 'aria-label': 'Progresso' });
  const stay = v.size > BIG ? h('p', { class: 'hint dc-stay', text: 'Mantém esta página aberta até acabar.' }) : null;
  const cancel = h('button', { class: 'btn sm ghost', type: 'button', onclick: () => ac.abort() }, 'Cancelar');
  dl.replaceChildren(h('div', { class: 'dc-prog' }, text, bar, stay), cancel);
  const ref = S.branch.ref;
  const keep = () => { if (parts.length) held.set(v.fid, { parts, next: parts.length }); };
  try {
    const key = await unwrapKey(S.priv, S.pub, v.key, `file:${v.fid}`);
    for (let i = parts.length; i < v.n; i++) {
      text.textContent = `A descarregar: parte ${i + 1} de ${v.n}`;
      const ct = await store.readRaw(ref, `f/${v.fid}/${i}.bin`, { signal: ac.signal });
      // each part becomes a Blob at once: the browser may keep it outside the page's memory
      parts.push(new Blob([await decryptChunk(key, ct, { fid: v.fid, i, n: v.n, size: v.size })]));
      bar.value = i + 1;
    }
    running = null;
    ready(dl, d, v, parts);
  } catch (x) {
    running = null;
    if (x && x.name === 'AbortError') { keep(); idle(dl, d, v); return; }
    if (x instanceof store.Missing) { await boot({ keepOpen: true }); toast(T.moved); if (S.manifest) openNote(T.moved); return; }
    if (x instanceof VaultError) { idle(dl, d, v, x.code === 'versao' ? T.newer : T.broken); return; }
    keep();
    idle(dl, d, v, errText(x));
  } finally { running = null; others(); }
}
// a share sheet needs a fresh tap: the file is ready, the next tap saves it
function ready(dl, d, v, parts) {
  const file = new File(parts, safeName(v.name), { type: v.type || 'application/octet-stream' });
  const label = S.shareFiles ? 'Guardar ou partilhar' : 'Guardar';
  const done = h('p', { class: 'dc-saved', role: 'status', text: `Pronto (${fmtSize(v.size)}): carrega em «${label}».` });
  const save = h('button', { class: 'btn sm gold', type: 'button', onclick: async () => {
    const r = await saveFile(file);
    if (r === 'shared') done.textContent = 'Feito.';
    else if (r === 'link') done.textContent = 'Descarregado: vê nas Transferências.';
  } }, label);
  dl.replaceChildren(save, h('button', { class: 'btn sm ghost', type: 'button', onclick: () => idle(dl, d, v) }, 'Fechar'), done);
  save.focus();
}
// Through a blob: URL of this page only a type no browser runs scripts in keeps its type; anything else (an .html of an
// older publisher, an svg) goes as application/octet-stream, so a webview that ignores «download» cannot open it here,
// where the GitHub token and the remembered key are. The share sheet gets the real type (no URL is made).
const SAFE_TYPES = new Set(['application/pdf', 'application/zip', 'application/json', 'text/plain', 'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'video/mp4', 'video/quicktime', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
const linkType = (type) => (SAFE_TYPES.has(String(type || '').toLowerCase()) ? String(type).toLowerCase() : 'application/octet-stream');
// -> 'shared' | 'link' | 'cancel'
async function saveFile(file) {
  if (S.shareFiles && navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared'; } catch (e) {
      if (e && e.name === 'AbortError') return 'cancel';   // the sheet was closed: not an error
    }
  }
  const safe = linkType(file.type) === file.type ? file : new File([file], file.name, { type: 'application/octet-stream' });
  const url = URL.createObjectURL(safe);
  const a = h('a', { href: url, download: safe.name, hidden: true });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'link';
}

// ---------- Mais ----------
$('#more').addEventListener('click', () => $('#d-more').showModal());
$('#m-fp').addEventListener('click', () => {
  $('#d-more').close();
  $('#fp-v').textContent = S.fp;
  const row = (k, v) => h('div', { class: 'pv-r' }, h('dt', { text: k }), h('dd', { text: v }));
  $('#fp-dl').replaceChildren(row('Cofre', S.vault.kid), row('Criado', fmtWhen(S.vault.created)), row('Frase-passe', S.vault.updated === S.vault.created ? 'a do início' : `mudada a ${fmtWhen(S.vault.updated)}`), row('Iterações', S.vault.kdf.iterations.toLocaleString('pt-PT')));
  $('#d-fp').showModal();
});
$('#fp-copy').addEventListener('click', () => copy(S.fp));
$('#m-index').addEventListener('click', async () => {
  $('#d-more').close();
  if (!S.manifest) { toast('Ainda não há índice: nada foi publicado com este cofre.'); return; }
  const day = new Date().toISOString().slice(0, 10);
  const file = new File([`${JSON.stringify({ ...S.manifest, export: 'gocarmo-cofre-indice' }, null, 2)}\n`], `gocarmo-cofre-indice-${day}.json`, { type: 'application/json' });
  if ((await saveFile(file)) !== 'cancel') toast('Depois de o usar no computador, apaga o índice: tem os títulos em claro.');
});
$('#m-reload').addEventListener('click', async () => { $('#d-more').close(); await boot({ keepOpen: true }); });
$('#m-pass').addEventListener('click', () => {
  $('#d-more').close();
  for (const id of ['#p-old', '#p-new', '#p-new2']) $(id).value = '';
  $('#p-err').textContent = '';
  $('#d-pass').showModal();
});
$('#pass-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#p-err'), btn = $('#p-go');
  err.textContent = '';
  const old = $('#p-old').value, p = passOf($('#p-new')), p2 = passOf($('#p-new2'));
  if (!old) { err.textContent = 'Escreve a frase-passe atual.'; return; }
  const weak = passProblem(p);
  if (weak) { err.textContent = weak; return; }
  if (p !== p2) { err.textContent = T.differ; return; }
  if (!(await ensureToken())) { err.textContent = 'Sem o token do GitHub não consigo guardar a frase-passe nova.'; return; }
  busy(btn, true, 'A mudar…');
  try {
    const re = S.pendingRewrap && S.pendingRewrap.old === old && S.pendingRewrap.p === p ? S.pendingRewrap.vault : await rewrapVault(S.vault, old, p);
    S.pendingRewrap = { old, p, vault: re };
    await store.commitVault(re, { expect: S.vaultText, message: 'Cofre: frase-passe mudada' });
    S.pendingRewrap = null;
    S.vault = re; S.vaultText = store.vaultText(re);
    try { S.branch = await store.loadBranch(); } catch (_) {}
    $('#d-pass').close();
    toast('Frase-passe mudada. A chave lembrada neste aparelho continua a servir.');
  } catch (x) {
    if (x instanceof VaultError) err.textContent = x.code === 'frase' ? 'A frase-passe atual não abre o cofre. Confirma maiúsculas e espaços.' : x.code === 'curta' ? T.short : T.badVault(x.message);
    else if (x instanceof UiError && x.reload) { S.pendingRewrap = null; $('#d-pass').close(); await boot({ keepOpen: true }); toast(x.message); }
    else err.textContent = errText(x, 'write').replace('O site não mudou.', 'A frase-passe não mudou.');
  } finally { busy(btn, false); }
});

// ---------- 7. a new key pair (the passphrase was lost, or someone may know it) ----------
function openNew() {
  $('#d-more').close();
  for (const id of ['#n-pass', '#n-pass2', '#n-word']) $(id).value = '';
  $('#n-err').textContent = '';
  $('#n-remember').disabled = !S.idb;
  $('#d-new').showModal();
}
$('#m-new').addEventListener('click', openNew);
$('#problem-new').addEventListener('click', openNew);
$('#new-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const err = $('#n-err');
  err.textContent = '';
  const p = passOf($('#n-pass')), p2 = passOf($('#n-pass2'));
  if ($('#n-word').value.trim().toUpperCase() !== 'CRIAR') { err.textContent = 'Escreve CRIAR para confirmar.'; return; }
  const weak = passProblem(p);
  if (weak) { err.textContent = weak; return; }
  if (p !== p2) { err.textContent = T.differ; return; }
  if (!(await ensureToken())) { err.textContent = 'Sem o token do GitHub não consigo guardar o cofre novo.'; return; }
  await createVault({ pass: p, remember: $('#n-remember').checked, expect: S.vaultText, btn: $('#n-go'), err, message: 'Cofre: chave nova' });
});

// ---------- dialogs, network, start ----------
for (const b of document.querySelectorAll('[data-close]')) b.addEventListener('click', () => b.closest('dialog').close());
$('#retry').addEventListener('click', () => boot());
const net = () => { $('#offline').hidden = navigator.onLine !== false; };
addEventListener('online', net); addEventListener('offline', net); net();

async function start() {
  setToken(readToken());
  try {
    const probe = new File(['x'], 'x.txt', { type: 'text/plain' });
    S.shareFiles = !!(navigator.canShare && matchMedia('(pointer: coarse)').matches && navigator.canShare({ files: [probe] }));
  } catch (_) { S.shareFiles = false; }
  S.idb = await store.idbUsable();
  if (!S.idb) for (const id of ['#u-remember', '#c-remember']) { $(id).disabled = true; $(`${id}-hint`).textContent = T.privateWin; }
  await boot();
}
start();
