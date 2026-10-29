// The montra editor of «Patrocínios» (/admin/patrocinios/), phone first: each contract card says «Montra: N de M
// produtos», and its sheet adds, edits, reorders, retires and deletes the brand's products in data/montra.json (the
// home page's «O meu material»). A save is ONE commit on gh-pages through the GitHub API, with the owner's token, as
// /admin/ commits data/spots.json and the logos (admin-gh.js): data/montra.json with this brand's entry replaced (every
// other brand as it is at the head), the new photo files (admin-photo.js) and the old ones it no longer names. Then the
// page waits until the site serves the file and shows «No ar» with the links. The rules: admin-montra-core.js and
// montra-core.js. Every piece of data is shown with textContent only.
import * as K from './admin-montra-core.js';
import { MONTRA_PATH, IMG_DIR, CODE_RE, PLACEHOLDER, FAKE_HOST, LIMIT, SUPPLIER, MAX_SUPPLIER, shopUrl, photoSrc, productEnd, counts, spotsHeld } from './montra-core.js';
import { lisbonDay, addDays, levelOf } from './season-rules.js';
import * as G from './admin-gh.js';
import { productPhoto, photoSummary, PhotoError } from './admin-photo.js';

const SITE = 'https://gocarmo.com';
const POLL_EVERY = 10000, POLL_FOR = 300000;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const today = () => lisbonDay();
const clone = (x) => JSON.parse(JSON.stringify(x));
const root = () => new URL('../../', location.href);   // the page lives at /admin/patrocinios/

// hooks: { contracts(), data(), toast(msg), toastOff(), ask(title, text, yes), rerender() }
let H = null;
// the live file (same origin; no token needed to show the counts) and the sheet
const S = { file: null, fileAt: 0, open: null, busy: false, poll: 0 };

export function initMontra(hooks) {
  H = hooks;
  bind();
  loadFile();
}

// ---------- the file as the site serves it ----------
async function fetchFile() {
  const res = await fetch(new URL(`${MONTRA_PATH}?ts=${Date.now()}`, root()).href, { cache: 'no-store', credentials: 'omit' });
  if (res.status === 404) return { v: 1, brands: [] };
  if (!res.ok) throw new Error(`montra ${res.status}`);
  return res.json();
}
export async function loadFile() {
  try { const f = await fetchFile(); S.file = f && Array.isArray(f.brands) ? f : { v: 1, brands: [] }; S.fileAt = Date.now(); if (H) H.rerender(); } catch (_) { /* the card says it could not read it */ }
}

// ---------- the card's line ----------
// one element under the renewal row of a contract card (null for a record without a brand)
export function montraLine(c, day = today()) {
  if (!c || !c.brand) return null;
  const box = el('div', 'ct-mt');
  if (!S.file) { box.appendChild(el('span', 'ct-mt-t', 'Montra: a ler…')); return box; }
  const ln = K.cardLine({ contracts: H.contracts(), spotsData: H.data(), file: S.file, season: String(c.season), name: c.brand, day });
  box.appendChild(el('span', `ct-mt-t${ln.over ? ' bad' : ln.n > 0 ? ' on' : ''}`, ln.text));
  if (ln.level === 'title') box.appendChild(el('span', 'ct-mt-k', 'em destaque'));
  const b = el('button', ln.can === 'supplier' && !ln.entry ? 'link ct-mt-b' : 'btn sm ghost ct-mt-b', ln.can === 'supplier' && !ln.entry && ln.level === 'fornecedor' ? 'Fornecedor oficial?' : 'Montra');
  b.type = 'button';
  b.dataset.montra = c.id;
  b.addEventListener('click', () => openMontra(c));
  box.appendChild(b);
  return box;
}

// how many of a brand's products count past what its contracts and spots allow now (0 while the file is not read)
export function montraOver(c, day = today()) {
  if (!S.file || !c || !c.brand) return 0;
  return K.cardLine({ contracts: H.contracts(), spotsData: H.data(), file: S.file, season: String(c.season), name: c.brand, day }).over;
}

// ---------- the sheet ----------
// O: { c, season, name, entry0 (the entry as read, or null), draft, changes, photos: Map(id -> { files, webp, base8, url }),
//      form: { id } | null }
// limit: the level's number, or fewer when data/spots.json no longer has all the brand's spots sold to it
function ctx() {
  const O = S.open, contracts = H.contracts(), data = H.data();
  const level = K.levelFor(contracts, data, O.season, O.name);
  const supplier = O.draft && O.draft.level === SUPPLIER;
  let limit = supplier ? K.limitOf(contracts, data, O.draft) : LIMIT[level] ?? 0;
  if (!supplier) {
    const bySpots = K.spotsAllow(O.draft || { name: O.name, season: O.season, level, spots: K.spotsFor(contracts, O.season, O.name) }, data);
    if (bySpots !== null) limit = Math.min(limit, bySpots);
  }
  return { level, supplier, limit, contracts, data };
}
export function openMontra(c) {
  if (!S.file) { H.toast('A montra ainda não foi lida. Atualiza a página.'); return; }
  const season = String(c.season), name = c.brand;
  const entry0 = K.findBrand(S.file, { name, season });
  S.open = { c, season, name, entry0: entry0 ? clone(entry0) : null, draft: entry0 ? clone(entry0) : null, changes: [], photos: new Map(), form: null, done: null };
  $('#mt-title').textContent = `Montra · ${name}`;
  showMain();
  $('#mt-err').textContent = '';
  $('#mt-pub').hidden = true; $('#mt-tok-form').hidden = true;
  const d = $('#mt-sheet');
  if (!d.open) d.showModal();
  d.scrollTop = 0;
}
function draftOrNew() {
  const O = S.open;
  if (!O.draft) O.draft = K.newEntry({ contracts: H.contracts(), spotsData: H.data(), file: S.file, season: O.season, name: O.name });
  return O.draft;
}
const dirty = () => !!S.open && K.entryKey(S.open.draft) !== K.entryKey(S.open.entry0) && !(S.open.entry0 === null && S.open.draft && !S.open.draft.products.length && S.open.draft.level !== SUPPLIER);

function showMain() {
  $('#mt-form').hidden = true; $('#mt-main').hidden = false;
  if (S.open) S.open.form = null;
  renderMain();
}
function renderMain() {
  const O = S.open;
  if (!O) return;
  const day = today(), { level, supplier, limit } = ctx(), e = O.draft;
  const lvName = supplier ? 'Fornecedor oficial' : K.LEVEL_PT[level] || 'Sem espaços';
  const n = K.countFor(e, day);
  $('#mt-sub').textContent = `${lvName} · ${limit ? `até ${limit} ${limit === 1 ? 'produto' : 'produtos'}${level === 'title' && !supplier ? ', em destaque' : ''}` : 'sem montra'} · época ${O.season} · ${n} de ${limit}`;
  const ul = $('#mt-list'); ul.textContent = '';
  const ps = e ? e.products : [];
  ps.forEach((p, i) => ul.appendChild(row(e, p, i, ps.length, day)));
  $('#mt-empty').hidden = ps.length > 0;
  // add: at the limit, or a level without the montra
  const add = $('#mt-add'), why = $('#mt-add-why'), over = $('#mt-over');
  let reason = '';
  if (n > limit) reason = `${limit ? `Esta marca pode ter ${limit === 1 ? '1 produto' : `até ${limit} produtos`}` : 'Esta marca já não tem montra'} (os espaços ou o contrato mudaram) e tem ${n}. Retira ${n - limit === 1 ? 'o que está a mais' : `os ${n - limit} a mais`}.`;
  else if (!limit) reason = level === 'fornecedor' ? 'O nível Apoio não inclui a montra. Se a marca patrocina com produto e tem acordo escrito, marca-a como fornecedor oficial.'
    : level ? 'Os espaços desta marca já não lhe estão vendidos em data/spots.json: a montra não se aplica.' : 'Este patrocínio não tem espaços: a montra só entra como fornecedor oficial, com acordo escrito.';
  else if (n >= limit) reason = supplier ? `O acordo inclui ${limit} ${limit === 1 ? 'produto' : 'produtos'}. Retira um para pôr outro.` : `O nível ${K.LEVEL_PT[level]} inclui ${limit === 1 ? '1 produto' : `até ${limit} produtos`}. Retira um para pôr outro.`;
  add.disabled = !!reason || S.busy; why.hidden = !reason; why.textContent = reason;
  why.classList.toggle('bad', n > limit);
  over.hidden = !(n > limit); over.disabled = S.busy;
  over.textContent = n - limit === 1 ? 'Retirar o produto a mais' : `Retirar os ${n - limit} produtos a mais`;
  // the supplier block: Apoio, no spots, or already a supplier; never at the whole suit's level
  const sup = $('#mt-sup');
  sup.hidden = !(supplier || ((LIMIT[level] ?? 0) === 0 && level !== 'title'));
  $('#mt-sup-on').checked = supplier;
  $('#mt-sup-box').hidden = !supplier;
  if (supplier) { $('#mt-agree').value = e.agreement || ''; $('#mt-max').value = String(e.max || 1); }
  $('#mt-sup-on').disabled = S.busy;
  const save = $('#mt-save');
  save.disabled = S.busy || !dirty();
  save.textContent = O.changes.length > 1 ? `Publicar na montra (${O.changes.length})` : 'Publicar na montra';
}
function row(e, p, i, len, day) {
  const li = el('li', 'mt-row'), st = K.productState(e, p, day);
  li.dataset.prod = p.id;
  const th = el('div', 'mt-th');
  const ph = S.open.photos.get(p.id), src = ph ? ph.url : photoSrc(p)?.jpg600;
  if (src) { const img = el('img'); img.alt = ''; img.loading = 'lazy'; img.src = ph ? src : new URL(src, root()).href; th.appendChild(img); }
  li.appendChild(th);
  const body = el('div', 'mt-rb');
  body.appendChild(el('p', 'mt-rn', p.name.pt));
  const meta = el('p', 'mt-rm');
  meta.appendChild(el('span', `st ${st.key === 'on' ? 'sold' : st.key === 'soon' ? 'reserved' : 'expired'}`, st.text));
  if (p.featured) meta.append(' ', el('span', 'mt-star', 'destaque'));
  if (p.code) meta.append(' ', el('span', 'mono mt-code-k', p.code));
  body.appendChild(meta);
  li.appendChild(body);
  const acts = el('div', 'mt-ra');
  const btn = (label, cls, fn, aria, dis = false) => { const b = el('button', cls, label); b.type = 'button'; if (aria) b.setAttribute('aria-label', aria); b.disabled = dis || S.busy; b.addEventListener('click', fn); acts.appendChild(b); return b; };
  btn('↑', 'btn sm ghost mt-up', () => move(i, -1), `Subir ${p.name.pt}`, i === 0);
  btn('↓', 'btn sm ghost mt-down', () => move(i, 1), `Descer ${p.name.pt}`, i === len - 1);
  btn('Editar', 'btn sm ghost mt-edit', () => openForm(p.id));
  if (K.canDelete(p, day)) btn('Apagar', 'btn sm ghost mt-del', () => del(p.id));
  else if (st.key === 'on') btn('Retirar', 'btn sm ghost mt-ret', () => retire(p.id));
  li.appendChild(acts);
  return li;
}
function change(op, name) { S.open.changes.push({ op, name }); renderMain(); }
// the products past the limit, from the last in the list: off the site at once (montra-core: one not yet shown leaves the
// file). Then «Publicar na montra».
async function retireExtra(ask = true) {
  const O = S.open;
  if (!O || !O.draft) return;
  const day = today(), { limit } = ctx(), n = K.countFor(O.draft, day);
  if (n <= limit) return;
  const r = K.retireOver(O.draft, day, limit);
  if (ask && !(await H.ask(`Retirar ${r.names.length === 1 ? `«${r.names[0]}»` : `${r.names.length} produtos`}?`, `${r.names.join(', ')}: ${r.names.length === 1 ? 'sai' : 'saem'} do site ao publicar e deixa${r.names.length === 1 ? '' : 'm'} de contar para o limite.`, 'Retirar'))) return;
  O.draft = r.entry;
  for (const nm of r.names) O.changes.push({ op: 'retire', name: nm });
  renderMain();
  H.toast(`${r.names.length === 1 ? `«${r.names[0]}» retirado` : `${r.names.length} produtos retirados`} na lista. Falta publicar.`);
}
// from the card of a sponsorship that ended (a record deleted, a spot freed): the sheet with the extra products already
// retired in the list, for one «Publicar na montra»
export async function retireFor(c) {
  if (!S.file) await loadFile();
  if (!S.file) { H.toast('Não consegui ler a montra. Atualiza a página e retira os produtos em «Montra».'); return false; }
  openMontra(c);
  if (!S.open || !S.open.draft) return false;
  await retireExtra(false);
  return true;
}
function move(i, d) {
  const ps = S.open.draft.products, j = i + d;
  if (j < 0 || j >= ps.length) return;
  [ps[i], ps[j]] = [ps[j], ps[i]];
  change('order', '');
  const b = $(`#mt-list li[data-prod="${CSS.escape(ps[j].id)}"] ${d < 0 ? '.mt-up' : '.mt-down'}`);
  if (b && !b.disabled) b.focus(); else { const o = $(`#mt-list li[data-prod="${CSS.escape(ps[j].id)}"] .mt-edit`); if (o) o.focus(); }
}
async function retire(id) {
  const p = S.open.draft.products.find((x) => x.id === id);
  if (!p) return;
  const y = addDays(today(), -1);
  if (!(await H.ask(`Retirar «${p.name.pt}»?`, `Sai do site ao guardar e deixa de contar para o limite. Fica no ficheiro (até ${K.ptDay(y)}) para os relatórios dos cliques.`, 'Retirar'))) return;
  p.until = y < p.from ? p.from : y;
  change('retire', p.name.pt);
}
async function del(id) {
  const ps = S.open.draft.products, i = ps.findIndex((x) => x.id === id);
  if (i < 0) return;
  if (!(await H.ask(`Apagar «${ps[i].name.pt}»?`, 'Ainda não apareceu no site: sai do ficheiro, e a fotografia também.', 'Apagar'))) return;
  const [p] = ps.splice(i, 1);
  const ph = S.open.photos.get(p.id);
  if (ph) { URL.revokeObjectURL(ph.url); S.open.photos.delete(p.id); }
  change('delete', p.name.pt);
}
function onSupplier() {
  const O = S.open, on = $('#mt-sup-on').checked;
  const e = draftOrNew();
  if (on) {
    e.level = SUPPLIER; delete e.spots;
    e.agreement = $('#mt-agree').value || O.c.paidAt || today();
    e.max = Number($('#mt-max').value) || 1;
  } else {
    const lv = K.levelFor(H.contracts(), H.data(), O.season, O.name);
    if (!(LIMIT[lv] > 0)) {
      // a level without the montra: a new entry is simply dropped; a supplier with products stays one (its products are
      // retired, not unmade)
      if (!O.entry0) { O.draft = null; O.changes = []; renderMain(); return; }
      $('#mt-sup-on').checked = true;
      H.toast('Esta marca só tem montra como fornecedor oficial. Para a tirar do site, retira os produtos.');
      return;
    }
    delete e.agreement;
    e.level = lv; e.spots = K.spotsFor(H.contracts(), O.season, O.name); e.max = LIMIT[lv] ?? 0;
  }
  change('supplier', '');
}
function onSupplierFields() {
  const e = S.open && S.open.draft;
  if (!e || e.level !== SUPPLIER) return;
  e.agreement = $('#mt-agree').value;
  e.max = Math.max(1, Math.min(MAX_SUPPLIER, Number($('#mt-max').value) || 1));
  if (!S.open.changes.some((x) => x.op === 'supplier')) S.open.changes.push({ op: 'supplier', name: '' });
  renderMain();
}

// ---------- the product form ----------
function defaultFrom() {
  const O = S.open, e = O.draft, start = (e && e.level === SUPPLIER && e.agreement) || O.c.paidAt || today();
  return start > today() ? start : today();
}
function openForm(id = null) {
  const O = S.open, e = draftOrNew(), p = id ? e.products.find((x) => x.id === id) : null;
  O.form = { id: p ? p.id : null, photo: null };
  $('#mt-main').hidden = true; $('#mt-form').hidden = false;
  $('#mt-title').textContent = p ? `Editar · ${p.name.pt}` : `Novo produto · ${O.name}`;
  const v = (sel, x) => { $(sel).value = x || ''; };
  v('#mt-name', p?.name.pt); v('#mt-name-en', p && p.name.en !== p.name.pt ? p.name.en : '');
  v('#mt-line', p?.line.pt); v('#mt-line-en', p?.line.en);
  v('#mt-url', p?.url); v('#mt-code', p?.code);
  v('#mt-note', p?.codeNote?.pt); v('#mt-note-en', p?.codeNote?.en);
  v('#mt-alt', p?.alt?.pt); v('#mt-alt-en', p?.alt?.en);
  v('#mt-from', p ? p.from : defaultFrom());
  v('#mt-until', p?.until);
  const end = `${O.season}-12-31`;
  $('#mt-from').min = `${Number(O.season) - 1}-01-01`; $('#mt-from').max = end; $('#mt-until').max = end;
  $('#mt-until-hint').textContent = `Sem fim, fica até ao fim da época, ${K.ptDay(end)} ${O.season}.`;
  const title = ctx().level === 'title' && e.level !== SUPPLIER;
  $('#mt-feat-box').hidden = !title;
  // one featured product per brand: a new one is featured only when no other product of the brand on the site is
  const day = today();
  $('#mt-feat').checked = p ? p.featured === true : !e.products.some((x) => x.featured === true && counts(e, x, day));
  $$('input[name="mt-fit"]').forEach((i) => { i.checked = i.value === 'contain'; });
  $('#mt-file').value = '';
  const ph = p && O.photos.get(p.id), src = ph ? ph.url : p ? new URL(photoSrc(p).jpg600, root()).href : '';
  $('#mt-prev').hidden = !src; if (src) $('#mt-prev').src = src; else $('#mt-prev').removeAttribute('src');
  $('#mt-drop-t').textContent = src ? 'Trocar fotografia' : 'Escolher fotografia';
  $('#mt-ph-sum').textContent = ph ? photoSummary(ph) : 'Uma fotografia do produto que a marca te deu (com direito de uso) ou que tiraste. Fica em 4:5, sem metadados.';
  $('#mt-f-err').textContent = '';
  formHints();
  $('#mt-sheet').scrollTop = 0;
  if (matchMedia('(pointer: fine)').matches) $('#mt-name').focus();
}
function formHints() {
  const O = S.open;
  if (!O || !O.form) return;
  for (const id of ['mt-line', 'mt-line-en']) $(`#${id}-n`).textContent = `${$(`#${id}`).value.trim().length}/140`;
  const code = $('#mt-code').value.trim().toUpperCase();
  $('#mt-note-box').hidden = !code;
  // (a new product: the id its name will give, as the site will tag it)
  const raw = $('#mt-url').value.trim(), name = $('#mt-name').value.trim();
  const pid = O.form.id || (name && O.draft ? K.productId(O.draft.id, name, [...K.allProductIds(S.file), ...O.draft.products.map((x) => x.id)]) : '') || 'produto';
  const tagged = raw ? shopUrl(raw, { season: O.season, id: pid }) : '';
  $('#mt-url-tag').textContent = !raw ? 'A loja da marca, em https. O site junta a etiqueta gocarmo ao link.' : tagged ? `No site: ${tagged}` : 'O link tem de começar por https:// e não pode ser do gocarmo.com.';
  $('#mt-url-tag').classList.toggle('bad', !!raw && !tagged);
}
let photoRun = 0;
async function onPhoto() {
  const O = S.open, f = ($('#mt-file').files && $('#mt-file').files[0]) || (O && O.form && O.form.file);
  if (!O || !O.form || !f) return;
  const fit = $$('input[name="mt-fit"]').find((i) => i.checked)?.value || 'contain';
  O.form.file = f;
  const run = ++photoRun, sum = $('#mt-ph-sum');
  sum.textContent = 'A preparar a fotografia…'; sum.classList.remove('bad');
  $('#mt-ok').disabled = true;
  try {
    const ph = await productPhoto(f, { fit });
    if (run !== photoRun || !S.open || !S.open.form) return;
    const jpg = ph.files.find((x) => x.suffix === '-600.jpg');
    if (O.form.photo && O.form.photo.url) URL.revokeObjectURL(O.form.photo.url);
    ph.url = URL.createObjectURL(new Blob([jpg.bytes], { type: 'image/jpeg' }));
    O.form.photo = ph;
    $('#mt-prev').src = ph.url; $('#mt-prev').hidden = false;
    $('#mt-drop-t').textContent = 'Trocar fotografia';
    sum.textContent = photoSummary(ph);
  } catch (e) {
    if (run !== photoRun) return;
    sum.textContent = e instanceof PhotoError ? e.message : 'Não consegui preparar esta fotografia. Tenta outra.';
    sum.classList.add('bad');
  } finally { if (run === photoRun) $('#mt-ok').disabled = false; }
}
// «Mostrar inteira» / «Encher»: the same photo made again
function onFit() { if (S.open && S.open.form && S.open.form.file) onPhoto(); }

function formProduct() {
  const O = S.open, e = O.draft, f = O.form, err = (msg, focus) => { throw Object.assign(new Error(msg), { focus }); };
  const t = (sel) => $(sel).value.trim().replace(/\s+/g, ' ');
  const name = t('#mt-name'), nameEn = t('#mt-name-en') || name;
  if (!name) err('Escreve o nome do produto.', '#mt-name');
  if (PLACEHOLDER.test(`${name} ${nameEn}`)) err('Este nome parece de exemplo. Só entram produtos de marcas com acordo.', '#mt-name');
  const old = f.id ? e.products.find((x) => x.id === f.id) : null;
  if (!old && !f.photo) err('Escolhe a fotografia do produto.', '#mt-file');
  const line = t('#mt-line'), lineEn = t('#mt-line-en');
  if (!line) err('Escreve como usas o produto (uma linha).', '#mt-line');
  if (!lineEn) err('Escreve a linha em inglês.', '#mt-line-en');
  const url = $('#mt-url').value.trim();
  if (!url) err('Cola o link da loja da marca.', '#mt-url');
  // a pasted link loses its utm_*: the site adds the gocarmo tag
  const id = f.id || K.productId(e.id, name, [...K.allProductIds(S.file), ...e.products.map((x) => x.id)]);
  if (!id) err('Não consegui fazer um id para este nome. Muda o nome.', '#mt-name');
  const clean = (() => { try { const u = new URL(url); const keep = [...u.searchParams.keys()].filter((k) => /^utm_/i.test(k)); for (const k of keep) u.searchParams.delete(k); return u.href; } catch (_) { return url; } })();
  if (!shopUrl(clean, { season: O.season, id })) err('O link tem de começar por https:// e não pode ser do gocarmo.com.', '#mt-url');
  let host = ''; try { host = new URL(clean).hostname; } catch (_) { host = ''; }
  if (FAKE_HOST.test(host) || PLACEHOLDER.test(host.replace(/[.-]/g, ' '))) err(`O link parece de exemplo («${host}»). Usa a loja da marca.`, '#mt-url');
  const code = t('#mt-code').toUpperCase();
  if (code && !CODE_RE.test(code)) err('O código leva letras maiúsculas, algarismos e hífenes (3 a 20).', '#mt-code');
  const note = t('#mt-note'), noteEn = t('#mt-note-en');
  if (code && !note) err('Escreve a nota do código (por exemplo «10% na primeira compra»).', '#mt-note');
  if (code && !noteEn) err('Escreve a nota do código em inglês.', '#mt-note-en');
  if (code && PLACEHOLDER.test(`${note} ${noteEn}`)) err('A nota do código parece de exemplo. Escreve a da marca.', '#mt-note');
  const from = $('#mt-from').value, until = $('#mt-until').value, end = `${O.season}-12-31`;
  if (!from) err('Escolhe o dia de início.', '#mt-from');
  if (from > end || from < `${Number(O.season) - 1}-01-01`) err(`O início tem de ser na época ${O.season} (até ${K.ptDay(end)}).`, '#mt-from');
  if (until && until < from) err('O fim não pode ser antes do início.', '#mt-until');
  if (until && until > end) err(`O fim é no máximo o fim da época, ${K.ptDay(end)} ${O.season}.`, '#mt-until');
  const alt = t('#mt-alt'), altEn = t('#mt-alt-en');
  const p = { id, name: { pt: name, en: nameEn }, line: { pt: line, en: lineEn } };
  if (alt || altEn) p.alt = { pt: alt || `${O.name} ${name}`, en: altEn || alt || `${O.name} ${nameEn}` };
  p.photo = f.photo ? { base: `${IMG_DIR}/${id}-${f.photo.base8}`, webp: f.photo.webp } : clone(old.photo);
  p.url = clean;
  if (code) { p.code = code; p.codeNote = { pt: note, en: noteEn }; }
  if (!$('#mt-feat-box').hidden && $('#mt-feat').checked) p.featured = true;
  p.from = from;
  if (until) p.until = until;
  return { p, old };
}
function submitForm(ev) {
  ev.preventDefault();
  const O = S.open;
  if (!O || !O.form) return;
  const errBox = $('#mt-f-err');
  errBox.textContent = '';
  let r;
  try { r = formProduct(); } catch (x) { errBox.textContent = x.message; const n = x.focus && $(x.focus); if (n) n.focus(); return; }
  const e = O.draft, { p, old } = r, day = today(), { limit } = ctx();
  const next = { ...e, products: old ? e.products.map((x) => (x.id === old.id ? p : x)) : [...e.products, p] };
  if (K.countFor(next, day) > limit) { errBox.textContent = limit ? `${e.level === SUPPLIER ? `O acordo inclui ${limit}` : `O nível ${K.LEVEL_PT[ctx().level]} inclui ${limit === 1 ? '1' : `até ${limit}`}`} ${limit === 1 ? 'produto' : 'produtos'}. Retira um para pôr outro.` : 'Esta marca não tem montra.'; return; }
  e.products = next.products;
  // one featured product: this one takes it from the others
  let took = false;
  if (p.featured) for (const x of e.products) if (x !== p && x.featured) { delete x.featured; took = true; }
  if (O.form.photo) {
    const prev = O.photos.get(p.id);
    if (prev && prev.url !== O.form.photo.url) URL.revokeObjectURL(prev.url);
    O.photos.set(p.id, O.form.photo);
  }
  change(old ? 'edit' : 'add', p.name.pt);
  $('#mt-title').textContent = `Montra · ${O.name}`;
  showMain();
  H.toast(`${old ? `«${p.name.pt}» mudado na lista` : `«${p.name.pt}» na lista`}${took ? `, e passa a ser o destaque` : ''}. Falta publicar.`);
}

// ---------- save: one commit ----------
function step(id, state, text) {
  const li = $(`#mt-pr-${id}`);
  li.className = state || '';
  if (text != null) $('span', li).textContent = text;
  li.hidden = text === '';
}
function prMsg(text, kind = '') { const m = $('#mt-pr-msg'); m.textContent = text; m.classList.toggle('bad', kind === 'bad'); m.classList.toggle('warn', kind === 'warn'); }
async function save() {
  const O = S.open;
  if (!O || S.busy || !dirty()) return;
  $('#mt-err').textContent = '';
  if (H.toastOff) H.toastOff();   // «… Falta publicar.» would sit over the progress
  // the token: the one kept from /admin/ (same key), or asked here once
  if (!G.getToken()) { const t = G.readToken(); if (t && G.TOKEN_RE.test(t)) G.setToken(t); }
  if (!G.getToken()) { $('#mt-tok-form').hidden = false; $('#mt-tok-err').textContent = ''; $('#mt-tok').focus(); return; }
  const final = clone(O.draft), day = today(), { limit, data, level } = ctx();
  // a brand of a level from spots: its level, spots and limit as its contracts give them now (a spot added since), and,
  // when data/spots.json no longer has all of them sold to it, the spots it still holds there and their level
  if (final.level !== SUPPLIER && (LIMIT[level] ?? 0) > 0) {
    final.level = level; final.spots = K.spotsFor(H.contracts(), O.season, O.name); final.max = LIMIT[level];
    if (data && String(data.season) === String(final.season)) {
      const held = spotsHeld(final, data);
      let lv = '';
      try { lv = held.length ? levelOf(data, held) : ''; } catch (_) { lv = ''; }
      if (held.length && held.length < final.spots.length && (LIMIT[lv] ?? 0) > 0) { final.level = lv; final.spots = held; final.max = LIMIT[lv]; }
    }
  }
  const problems = K.editorProblems(final, { limit, day, file: S.file, spotsData: data });
  if (problems.length) { $('#mt-err').textContent = problems.join(' '); return; }
  S.busy = true; renderMain();
  $('#mt-pub').hidden = false; $('#mt-tok-form').hidden = true;
  step('save', 'on', 'A guardar no GitHub…'); step('pub', '', 'A publicar…'); step('live', '', 'No ar');
  prMsg(''); $('#mt-pr-links').textContent = '';
  const photos = new Map(O.photos);
  const entry0 = O.entry0, message = K.commitMessage(O.name, O.changes);
  O.intent = O.intent && O.intent.key === K.entryKey(final) ? O.intent : { key: K.entryKey(final) };
  const intent = O.intent;
  intent.build = async (head) => {
    const got = await G.readText(MONTRA_PATH, head);
    let file = { v: 1, brands: [] };
    if (got) { try { file = JSON.parse(got.text); } catch (_) { throw new G.UiError('data/montra.json no GitHub não é JSON válido. Não mexi em nada.'); } }
    if (!file || !Array.isArray(file.brands)) throw new G.UiError('data/montra.json no GitHub não tem a forma esperada. Não mexi em nada.');
    const there = K.findBrand(file, { id: final.id });
    if (K.entryKey(there) !== K.entryKey(entry0)) throw new G.UiError('A montra desta marca mudou entretanto. Recarreguei: revê e guarda outra vez.', { conflict: true });
    let spots = data;
    const sp = await G.readText('data/spots.json', head);
    if (sp) { try { spots = JSON.parse(sp.text); } catch (_) { spots = data; } }
    const lim = final.level === SUPPLIER ? K.limitOf([], null, final) : K.limitOf(H.contracts(), spots, null, { season: final.season, name: final.name });
    const bad = K.editorProblems(final, { limit: lim, day, file, spotsData: spots });
    if (bad.length) throw new G.UiError(bad.join(' '));
    const next = K.applyBrand(file, final), text = K.fileText(next);
    const files = [{ path: MONTRA_PATH, text }];
    const known = new Set((entry0?.products || []).map((p) => p.photo.base));
    for (const p of final.products) {
      const ph = photos.get(p.id);
      if (!ph || known.has(p.photo.base)) continue;
      for (const f of ph.files) files.push({ path: `${p.photo.base}${f.suffix}`, bytes: f.bytes });
    }
    const deletes = K.deletesFor(there, final, file);
    if (got && got.text === text && files.length === 1 && !deletes.length) return { nothing: true };
    return { message, files, deletes };
  };
  intent.landed = async (head) => { const got = await G.readText(MONTRA_PATH, head); return !!got && K.liveHas(JSON.parse(got.text), final); };
  try {
    const r = await G.commitFiles(intent);
    S.busy = false; O.intent = null;
    if (r.nothing) { step('save', 'done', 'Nada mudou.'); step('pub', '', ''); step('live', '', ''); prMsg('A montra já estava assim; não mudei nada.'); afterSave(final, null); return; }
    step('save', 'done', 'Guardado ✓');
    afterSave(final, r.commit);
    publish(final, r.commit);
  } catch (e) {
    S.busy = false;
    if (e instanceof G.GhError && e.status === 401) { G.forgetToken(); G.setToken(null); $('#mt-pub').hidden = true; $('#mt-tok-form').hidden = false; $('#mt-tok-err').textContent = 'O token expirou ou foi revogado. Cola um novo: o que mudaste fica à espera.'; renderMain(); return; }
    step('save', e.unknown ? 'unknown' : 'fail', e.unknown ? 'Sem resposta do GitHub' : 'Não guardei.'); step('pub', '', ''); step('live', '', '');
    prMsg(G.errText(e, 'write'), e.unknown ? 'warn' : 'bad');
    if (e.conflict) { O.intent = null; await reloadOpen(); }
    renderMain();
    $('#mt-save').textContent = 'Tentar outra vez';
  }
}
// after a conflict: the file again, the sheet on the brand's entry as it is now (the photos picked stay for the form)
async function reloadOpen() {
  await loadFile();
  const O = S.open;
  if (!O) return;
  const e = K.findBrand(S.file, { name: O.name, season: O.season });
  O.entry0 = e ? clone(e) : null; O.draft = e ? clone(e) : null; O.changes = [];
}
function afterSave(final, commit) {
  const O = S.open;
  S.file = K.applyBrand(S.file, final);
  if (O) { O.entry0 = clone(final); O.draft = clone(final); O.changes = []; O.done = { final, commit }; }
  renderMain();
  H.rerender();
}

// ---------- publish check: the site serves the file (and the new photos) ----------
function publish(final, commit) {
  clearTimeout(S.poll);
  const t0 = Date.now(), photo = final.products.map((p) => S.open && S.open.photos.get(p.id) ? photoSrc(p).jpg600 : '').find(Boolean) || '';
  step('pub', 'on', 'A publicar… o site atualiza-se em 1 a 2 minutos.');
  links(final, commit, false);
  const look = async () => {
    let live = false;
    try {
      const f = await fetchFile();
      live = K.liveHas(f, final);
      if (live && photo) live = (await fetch(new URL(`${photo}?ts=${Date.now()}`, root()).href, { method: 'HEAD', cache: 'no-store', credentials: 'omit' })).ok;
      if (live) { S.file = f; H.rerender(); }
    } catch (_) { live = false; }
    if (live) { step('pub', 'done', 'Publicado ✓'); step('live', 'done', 'No ar ✓'); prMsg('A montra no site já tem esta versão.'); links(final, commit, true); return; }
    if (Date.now() - t0 > POLL_FOR) { step('pub', 'wait', 'Ainda a publicar'); prMsg('O site ainda não mostra a alteração. O GitHub Pages às vezes demora: abre o site daqui a uns minutos.', 'warn'); links(final, commit, true); return; }
    S.poll = setTimeout(look, POLL_EVERY);
  };
  S.poll = setTimeout(look, 1500);
}
function links(final, commit, live) {
  const ul = $('#mt-pr-links'); ul.textContent = '';
  const add = (href, label, hint) => { const li = el('li'), a = el('a', null, label); a.href = href; a.target = '_blank'; a.rel = 'noopener'; a.appendChild(el('span', null, hint)); li.appendChild(a); ul.appendChild(li); };
  add(`${SITE}/#material`, 'Ver no site', '↗');
  if (commit && /^https:\/\/github\.com\//.test(commit.html_url || '')) add(commit.html_url, 'Ver a alteração no GitHub', `${commit.sha.slice(0, 7)} ↗`);
  if (!live) return;
  const day = today();
  for (const p of final.products) {
    if (productEnd(final, p) < day || p.from > day) continue;
    const href = shopUrl(p.url, { season: final.season, id: p.id });
    if (href) { const li = el('li'), a = el('a', 'rel-sp', `Loja: ${p.name.pt}`); a.href = href; a.target = '_blank'; a.rel = 'sponsored noopener'; a.appendChild(el('span', null, '↗')); li.appendChild(a); ul.appendChild(li); }
  }
}

// ---------- the token, asked here only when a save needs it ----------
async function tokenSubmit(ev) {
  ev.preventDefault();
  const input = $('#mt-tok'), err = $('#mt-tok-err'), btn = $('#mt-tok-go'), t = input.value.trim();
  err.textContent = '';
  btn.disabled = true; btn.textContent = 'A verificar…';
  try { await G.checkToken(t); } catch (x) {
    err.textContent = x instanceof G.UiError && x.format ? x.message : G.signInText(x);
    btn.disabled = false; btn.textContent = 'Entrar e guardar';
    input.focus();
    return;
  }
  G.keepToken(t, $('#mt-remember').checked);
  input.value = '';
  btn.disabled = false; btn.textContent = 'Entrar e guardar';
  $('#mt-tok-form').hidden = true;
  save();
}

// ---------- closing ----------
async function close() {
  const d = $('#mt-sheet');
  if (S.busy) { H.toast('Espera: ainda estou a guardar.'); return; }
  if (S.open && S.open.form) { showMain(); $('#mt-title').textContent = `Montra · ${S.open.name}`; return; }
  if (dirty() && !(await H.ask('Sair sem guardar?', 'As alterações desta montra ainda não estão no site. Se saíres, perdem-se.', 'Sair sem guardar'))) return;
  if (d.open) d.close();
}
function cleanup() {
  clearTimeout(S.poll);
  if (S.open) for (const ph of S.open.photos.values()) if (ph.url) URL.revokeObjectURL(ph.url);
  if (S.open && S.open.form && S.open.form.photo && S.open.form.photo.url) URL.revokeObjectURL(S.open.form.photo.url);
  S.open = null;
}

function bind() {
  $('#mt-x').addEventListener('click', close);
  $('#mt-close').addEventListener('click', close);
  $('#mt-sheet').addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  $('#mt-sheet').addEventListener('close', cleanup);
  $('#mt-add').addEventListener('click', () => openForm(null));
  $('#mt-back').addEventListener('click', () => { showMain(); $('#mt-title').textContent = `Montra · ${S.open.name}`; });
  $('#mt-form').addEventListener('submit', submitForm);
  $('#mt-file').addEventListener('change', onPhoto);
  $$('input[name="mt-fit"]').forEach((i) => i.addEventListener('change', onFit));
  for (const id of ['#mt-name', '#mt-line', '#mt-line-en', '#mt-url', '#mt-code']) $(id).addEventListener('input', () => { $('#mt-f-err').textContent = ''; formHints(); });
  $('#mt-code').addEventListener('change', () => { $('#mt-code').value = $('#mt-code').value.trim().toUpperCase(); formHints(); });
  $('#mt-sup-on').addEventListener('change', onSupplier);
  $('#mt-agree').addEventListener('change', onSupplierFields);
  $('#mt-max').addEventListener('change', onSupplierFields);
  $('#mt-save').addEventListener('click', save);
  $('#mt-over').addEventListener('click', () => retireExtra(true));
  $('#mt-tok-form').addEventListener('submit', tokenSubmit);
  // Enter on a field of the form moves on (only the button saves)
  $('#mt-form').addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key !== 'Enter' || e.isComposing || !(t instanceof HTMLInputElement) || ['checkbox', 'radio', 'button', 'submit', 'file'].includes(t.type)) return;
    e.preventDefault();
    const order = $$('#mt-form input:not([type="checkbox"]):not([type="radio"]):not([type="file"]), #mt-form textarea').filter((n) => !n.closest('[hidden]') && !(n.closest('details') && !n.closest('details').open));
    const next = order[order.indexOf(t) + 1];
    if (next) next.focus(); else t.blur();
  });
}
