// /admin/merch/: the GOCARMO t-shirts in 3D, to test the three styles the owner chose (03.11.2026) and the «técnica».
// - Style, version, view (frente / costas / 3/4, drag, pinch or wheel), «Rodar» (on at first unless the browser asks for
//   reduced motion), the tee's colour, and for style 1 the names on the back: the fictional ones of the print kit, or
//   the wall's published names (the booking Worker's public GET /apoiantes/nomes), laid out again here.
// - The «Ficha» of each style (sizes, method, colours, screens) with its print files, and the quote brief.
// - «Descarregar imagem»: the view as a PNG. Never with the wall's names: a name leaves the site only with that person's
//   yes, and the page does not let a picture of them out.
// - No WebGL 2 (or no context): the flat mockups instead. three.js and the model load only after the page has drawn.
// No key and no write: everything here is the site's own files and one public route.
import './internal.js';   // this browser is the owner's: the public pages never load Google Analytics in it
import { SITE } from './data.js';
import * as C from './admin-merch-core.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const TIMEOUT = 8000;
const API = () => String(SITE.requestsApi || '').replace(/\/+$/, '');
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
const kb = (n) => (n >= 1000 ? `${(n / 1024).toFixed(1).replace('.', ',')} MB` : `${n} KB`);
const one = (n, a, b) => `${n} ${n === 1 ? a : b}`;

const S = {
  look: 's1', view: 'frente', color: C.GARMENTS[0].id, src: 'ficticios',
  mural: null, muralBack: null,   // the wall's names (fetched once, never kept beyond this page) and the back drawn from them
  mode: 'wait',                   // 'wait' | '3d' | 'flat'
  viewer: null, busy: 0, why: '', onStage: '', backs: 0,
};

// ---------- the controls ----------
function lookOf(style) { return style === 's1' ? (S.look === 's1loja' ? 's1loja' : 's1') : style; }
function drawPick() {
  const L = C.LOOKS[S.look];
  for (const b of $$('#styles .chip')) b.setAttribute('aria-pressed', String(b.dataset.style === L.style));
  $('#variant').hidden = L.style !== 's1';
  for (const b of $$('#variant .chip')) b.setAttribute('aria-pressed', String(b.dataset.look === S.look));
  $('#names-sec').hidden = !L.names;
  $('#look-t').textContent = L.title;
  $('#look-s').textContent = lookSub();
  for (const b of $$('#views .chip')) b.setAttribute('aria-pressed', String(b.dataset.view === S.view));
  $('#views [data-view="34"]').hidden = S.mode === 'flat';
  // the técnica's colour is its print: a white polyester tee printed black
  const tech = !!L.tech;
  for (const b of $$('#colors .chip')) { b.disabled = tech; b.setAttribute('aria-pressed', String(!tech && b.dataset.color === S.color)); }
  $('#cor-hint').textContent = tech ? 'A técnica é uma t-shirt de poliéster branco sublimada a preto: a cor é a impressão.' : 'Preto é o desenho. As outras cores são um teste: os ficheiros são para peça escura.';
  drawExport();
  stageLabel();
}
function lookSub() {
  const L = C.LOOKS[S.look];
  if (L.names && S.src === 'mural' && S.mural) return `${one(S.mural.length, 'nome do mural', 'nomes do mural')} · serigrafia`;
  return L.sub;
}
function stageLabel() {
  const L = C.LOOKS[S.look], v = { frente: 'frente', costas: 'costas', 34: 'três quartos' }[S.view] || '';
  $('#stage').setAttribute('aria-label', `${L.title}${v ? `, ${v}` : ''}. ${lookSub()}.${S.mode === '3d' ? ' Setas para rodar, mais e menos para aproximar.' : ''}`);
}
function drawExport() {
  const L = C.LOOKS[S.look], b = $('#export'), h = $('#export-hint');
  const real = L.names && S.src === 'mural' && S.mural && S.mural.length;
  b.hidden = S.mode === 'wait';
  b.setAttribute('aria-disabled', String(!!real));
  h.textContent = real ? 'Com os nomes do mural, a imagem não se descarrega: um nome só sai do site com o sim dessa pessoa. Volta aos nomes fictícios.'
    : S.mode === 'flat' ? 'A maquete plana da vista de agora (sem 3D neste browser).' : 'Um PNG da vista de agora, para mandar a patrocinadores ou para a futura loja.';
}
function buildColors() {
  const box = $('#colors');
  for (const g of C.GARMENTS) {
    const b = el('button', 'chip mx-col'); b.type = 'button'; b.dataset.color = g.id;
    const dot = el('span', 'mx-dot'); dot.dataset.c = g.id;
    b.append(dot, g.name); box.appendChild(b);
  }
}

// ---------- the Ficha ----------
function drawFicha() {
  const L = C.LOOKS[S.look], F = C.FICHAS[L.style];
  $('#ficha-t').textContent = F.title;
  const dl = $('#ficha-rows'); dl.textContent = '';
  for (const [k, v] of F.rows) { const d = el('div', 'mx-row'); d.append(el('dt', '', k), el('dd', '', v)); dl.appendChild(d); }
  const ink = $('#ficha-ink'); ink.textContent = '';
  if (L.style !== 'tec') for (const c of C.INK) {
    const li = el('li', 'mx-inkr'), sw = el('span', 'mx-sw'); sw.dataset.c = c.id;
    const t = el('span', 'mx-inkt'); t.append(el('b', '', `${c.name} `), el('code', '', c.hex), ` · ${c.text}`);
    li.append(sw, t); ink.appendChild(li);
  }
  ink.hidden = !ink.children.length;
  const notes = $('#ficha-notes'); notes.textContent = '';
  for (const n of F.notes) notes.appendChild(el('li', '', n));
  const ul = $('#ficha-files'); ul.textContent = '';
  for (const f of F.files) {
    const li = el('li', 'mx-file');
    const t = el('div', 'mx-fl'); t.append(el('span', 'mx-fn', f.label), el('span', 'mx-fm mono', `${f.size} · ${f.mm}`));
    const acts = el('div', 'mx-fa');
    acts.appendChild(fileLink(`${f.path}.pdf`, 'PDF', f.pdf, `${f.label}, ${f.size}, PDF`));
    if (f.png) acts.appendChild(fileLink(`${f.path}.png`, 'PNG', f.png, `${f.label}, ${f.size}, PNG de 300 dpi`));
    li.append(t, acts); ul.appendChild(li);
  }
}
function fileLink(href, kind, size, label) {
  const a = el('a', 'mx-get'); a.href = href; a.setAttribute('download', '');
  a.setAttribute('aria-label', `${label}, ${kb(size)}`);
  a.append(el('b', '', kind), el('span', 'mono', kb(size)));
  return a;
}
function drawCommon() {
  const ul = $('#common');
  for (const c of C.COMMON) {
    const li = el('li', 'mx-file');
    const t = el('div', 'mx-fl'); t.append(el('span', 'mx-fn', c.label), el('span', 'mx-fd', c.sub));
    const acts = el('div', 'mx-fa'); acts.appendChild(fileLink(c.href, 'PDF', c.kb, c.label));
    li.append(t, acts); ul.appendChild(li);
  }
}

// ---------- the names of style 1 ----------
async function getNames() {
  if (!API()) return { err: 'Os pedidos não estão ligados neste site: ficam os nomes fictícios.' };
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
  try {
    const r = await fetch(`${API()}/apoiantes/nomes`, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store', signal: ctl.signal });
    if (!r.ok) return { err: `O mural não respondeu (${r.status}): ficam os nomes fictícios.` };
    const list = C.namesOf(await r.json());
    return list ? { list } : { err: 'O mural respondeu com algo que não percebi: ficam os nomes fictícios.' };
  } catch (_) { return { err: 'Não consegui ler o mural (sem rede?): ficam os nomes fictícios.' }; } finally { clearTimeout(timer); }
}
function setSrc(v) { S.src = v; for (const i of $$('input[name="src"]')) i.checked = i.value === v; }
async function chooseSrc(v) {
  const st = $('#names-state');
  if (v === 'ficticios') { setSrc('ficticios'); st.textContent = 'Os 60 nomes fictícios do ficheiro de serigrafia, maiúscula de 4,8 mm.'; st.dataset.k = ''; await show(); return; }
  setSrc('mural'); st.dataset.k = '';
  if (!S.mural) {
    st.textContent = 'A ler os nomes publicados no mural…';
    const r = await getNames();
    if (S.src !== 'mural') return;
    if (r.err) { setSrc('ficticios'); st.textContent = r.err; st.dataset.k = 'warn'; await show(); return; }
    if (!r.list.length) { setSrc('ficticios'); st.textContent = 'O mural ainda não tem nomes publicados: ficam os nomes fictícios.'; st.dataset.k = 'warn'; await show(); return; }
    S.mural = r.list;
  }
  if (S.muralBack) { await show(); verdict(S.muralBack); return; }
  st.textContent = `A pôr ${one(S.mural.length, 'nome', 'nomes')} no símbolo…`;
  const N = await import('./admin-merch-names.js');
  const back = await N.namesBack(S.mural);
  if (S.src !== 'mural') return;
  back.id = ++S.backs; S.muralBack = back;
  verdict(back);
  await show();
}
function verdict(back) {
  const st = $('#names-state'), v = C.capVerdict(back.cap);
  st.textContent = `${one(back.n, 'nome publicado', 'nomes publicados')} no mural, de A a Z.${back.placed < back.n ? ` Só cabem ${back.placed}.` : ''} ${v.text}`;
  st.dataset.k = v.ok === 'all' || v.ok === 'serigrafia' ? 'ok' : 'warn';
}

// ---------- the stage: 3D, or the flat mockups ----------
function texOf(name) { const t = C.TEX[name]; return { src: `tex/${name}.webp`, w: t.w, h: t.h, top: t.top || 0 }; }
function currentLook() {
  const L = C.LOOKS[S.look];
  let back = texOf(L.back);
  if (L.names && S.src === 'mural' && S.muralBack) back = { src: S.muralBack.canvas, w: S.muralBack.w, h: S.muralBack.h, top: 0 };
  return { back, front: texOf(L.front), tech: !!L.tech };
}
async function show() {
  drawPick(); drawFicha();
  try { history.replaceState(null, '', `#${S.look}`); } catch (_) {}
  if (S.mode === 'flat') { drawFlat(); return; }
  if (S.mode !== '3d' || !S.viewer) return;
  const look = currentLook(), key = `${S.look}|${typeof look.back.src === 'string' ? look.back.src : `names-${S.muralBack.id}`}`;
  if (key === S.onStage) return;
  const my = ++S.busy;
  $('#load').hidden = false; $('#load').textContent = 'A carregar…';
  try {
    const ok = await S.viewer.setLook(look);
    if (ok && my === S.busy) { $('#load').hidden = true; S.onStage = key; }
  } catch (e) {
    if (my === S.busy) toFlat('Não consegui carregar as imagens da t-shirt.');
  }
}
function drawFlat() {
  const L = C.LOOKS[S.look], v = S.view === 'costas' ? 'costas' : 'frente';
  const img = $('#flat');
  const mural = L.names && S.src === 'mural' && S.muralBack && v === 'costas';
  $('#stage').classList.toggle('mx-print', !!mural);
  if (mural) {
    // no mockup with these names: the print itself, drawn here, on a dark tee-coloured field
    img.hidden = true;
    let c = $('#stage canvas.mx-pc');
    if (!c) { c = S.muralBack.canvas; c.className = 'mx-pc'; c.setAttribute('aria-hidden', 'true'); $('#stage').appendChild(c); }
    else if (c !== S.muralBack.canvas) { S.muralBack.canvas.className = 'mx-pc'; c.replaceWith(S.muralBack.canvas); }
  } else {
    const c = $('#stage canvas.mx-pc'); if (c) c.remove();
    img.hidden = false; img.src = `flat/${L.flat[v]}.webp`;
    img.alt = `Maquete plana: ${L.title}, ${v}.`;
  }
  $('#load').hidden = true;
}
function toFlat(why) {
  if (S.viewer) { try { S.viewer.dispose(); } catch (_) {} S.viewer = null; }
  S.mode = 'flat'; S.why = why || '';
  if (S.view !== 'costas') S.view = 'frente';
  document.documentElement.dataset.merch = 'flat';
  $('#spin').hidden = true; $('#how').textContent = `${why ? `${why} ` : ''}Ficam as maquetes planas.`;
  $('#lost').hidden = true;
  drawPick(); drawFlat();
}
async function start3d() {
  if (typeof WebGL2RenderingContext === 'undefined' || typeof WebGLRenderingContext === 'undefined') { toFlat('Este browser não mostra 3D (sem WebGL 2).'); return; }
  $('#load').hidden = false; $('#load').textContent = 'A carregar a t-shirt em 3D…';
  let M;
  try { M = await import('./admin-merch-3d.js'); } catch (_) { toFlat('Não consegui carregar o 3D.'); return; }
  try {
    S.viewer = await M.createViewer($('#stage'), { model: 'model/shirt_baked.glb', onLost: lost });
  } catch (e) {
    S.viewer = null;
    toFlat(e && e.code ? 'Este aparelho não deu ao browser um contexto 3D.' : 'Não consegui carregar o modelo da t-shirt.');
    return;
  }
  S.mode = '3d'; S.onStage = '';
  document.documentElement.dataset.merch = '3d';
  S.viewer.setColor(C.GARMENTS.find((g) => g.id === S.color).hex);
  S.viewer.setView(S.view === '34' ? '34' : S.view);
  S.viewer.setSpin(S.spin);
  $('#spin').hidden = false; drawSpin();
  await show();
}
function lost() {
  S.viewer = null; S.mode = 'wait';
  $('#lost').hidden = false; $('#load').hidden = true;
  drawExport();
}

// ---------- views, spin, export ----------
function setView(v) {
  S.view = v;
  if (S.mode === '3d' && S.viewer) { S.viewer.setView(v); S.spin = false; drawSpin(); }
  drawPick();
  if (S.mode === 'flat') drawFlat();
}
function drawSpin() { $('#spin').setAttribute('aria-pressed', String(!!S.spin)); }
async function exportPng() {
  const L = C.LOOKS[S.look];
  if ($('#export').getAttribute('aria-disabled') === 'true') { toast('Com os nomes do mural, a imagem não se descarrega.'); return; }
  const v = S.mode === 'flat' ? (S.view === 'costas' ? 'costas' : 'frente') : viewName();
  const name = `gocarmo-tshirt-${slug(L.title)}-${v}.png`;
  if (S.mode === 'flat') { const a = el('a'); a.href = `flat/${L.flat[v]}.webp`; a.download = name.replace(/\.png$/, '.webp'); document.body.appendChild(a); a.click(); a.remove(); return; }
  if (!S.viewer) return;
  const W = 1440, H = 1800;
  const shot = S.viewer.snapshot(W, H - 180);
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const g = out.getContext('2d');
  const bg = g.createRadialGradient(W / 2, H * 0.38, 0, W / 2, H * 0.38, H * 0.75);
  bg.addColorStop(0, '#f1efea'); bg.addColorStop(0.55, '#e6e3dc'); bg.addColorStop(1, '#d8d5cd');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.drawImage(shot, 0, 0);
  shot.width = shot.height = 1;
  try { await document.fonts.load('400 60px "Anton"'); await document.fonts.load('600 20px "JetBrains Mono"'); } catch (_) {}
  g.fillStyle = '#0b0b0c'; g.textBaseline = 'alphabetic';
  g.save(); g.translate(64, H - 92); g.transform(1, 0, -0.18, 1, 0, 0);
  g.font = '400 58px "Anton", Impact, sans-serif'; g.fillText(L.title.toLocaleUpperCase('pt-PT'), 0, 0);
  g.restore();
  g.font = '600 20px "JetBrains Mono", monospace'; g.fillStyle = '#2b2b2e';
  const sub = `${{ frente: 'Frente', costas: 'Costas', 'tres-quartos': 'Três quartos, frente', 'tres-quartos-costas': 'Três quartos, costas' }[v]} · ${L.tech ? 't-shirt técnica, sublimação' : `t-shirt ${C.GARMENTS.find((x) => x.id === S.color).adj}`} · ${L.sub}`;
  g.fillText(sub.toLocaleUpperCase('pt-PT'), 64, H - 52);
  g.textAlign = 'right'; g.fillStyle = '#6d5418'; g.fillText('MAQUETE 3D · GOCARMO.COM', W - 64, H - 52);
  const blob = await new Promise((ok) => out.toBlob(ok, 'image/png'));
  out.width = out.height = 1;
  if (!blob) { toast('Não consegui fazer a imagem.'); return; }
  const url = URL.createObjectURL(blob), a = el('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  window.__merchLast = { name, bytes: blob.size, w: W, h: H };
  toast('Imagem descarregada.');
}
function viewName() {
  const y = S.viewer ? S.viewer.state().yaw : 0, a = ((y % 360) + 360) % 360;
  if (a < 8 || a > 352) return 'frente';
  if (Math.abs(a - 180) < 8) return 'costas';
  return a < 90 || a > 270 ? 'tres-quartos' : 'tres-quartos-costas';
}
const slug = (s) => s.normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 3200); }

// ---------- wiring ----------
function bind() {
  for (const b of $$('#styles .chip')) b.addEventListener('click', () => { S.look = lookOf(b.dataset.style); show(); });
  for (const b of $$('#variant .chip')) b.addEventListener('click', () => { S.look = b.dataset.look; show(); });
  for (const b of $$('#views .chip')) b.addEventListener('click', () => setView(b.dataset.view));
  $('#spin').addEventListener('click', () => { S.spin = !S.spin; if (S.viewer) S.viewer.setSpin(S.spin); if (S.spin) { S.view = ''; drawPick(); } drawSpin(); });
  $('#colors').addEventListener('click', (e) => {
    const b = e.target.closest('.chip'); if (!b || b.disabled) return;
    S.color = b.dataset.color; if (S.viewer) S.viewer.setColor(C.GARMENTS.find((g) => g.id === S.color).hex);
    drawPick();
  });
  for (const i of $$('input[name="src"]')) i.addEventListener('change', () => { if (i.checked) chooseSrc(i.value); });
  $('#export').addEventListener('click', exportPng);
  $('#retry').addEventListener('click', () => { $('#lost').hidden = true; start3d(); });
  // the keyboard on the stage: arrows rotate, + and - zoom
  $('#stage').addEventListener('keydown', (e) => {
    if (!S.viewer) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); keyTurn(e.key === 'ArrowLeft' ? -20 : 20); }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); S.viewer.setZoom(S.viewer.state().zoom + 0.2); }
    else if (e.key === '-') { e.preventDefault(); S.viewer.setZoom(S.viewer.state().zoom - 0.2); }
  });
  // leave: give the GPU everything back; back from the bfcache: build it again
  addEventListener('pagehide', () => { if (S.viewer) { S.viewer.dispose(); S.viewer = null; S.mode = 'wait'; } });
  addEventListener('pageshow', (e) => { if (e.persisted && S.mode === 'wait' && !S.viewer) start3d(); });
}
function keyTurn(deg) { S.spin = false; S.viewer.setSpin(false); drawSpin(); S.viewer.turn(deg); S.view = ''; drawPick(); }

function init() {
  const h = location.hash.slice(1);
  if (C.LOOKS[h]) S.look = h;
  S.spin = !reduce();
  S.view = S.spin ? '' : 'frente';
  buildColors(); drawCommon(); bind();
  chooseSrc('ficticios');
  drawPick(); drawFicha();
  // three.js and the model after the first paint
  const go = () => start3d();
  if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 400 }); else setTimeout(go, 60);
}

// test hook: the state, never a name
window.__merch = { state: () => ({ look: S.look, view: S.view, color: S.color, src: S.src, mode: S.mode, spin: !!S.spin, mural: S.mural ? S.mural.length : null, viewer: S.viewer ? S.viewer.state() : null }), probe: () => (S.viewer ? S.viewer.probe() : null) };

// frame-ancestors is ignored in a meta CSP: a framed copy of this page shows nothing
if (window.top !== window.self) document.documentElement.hidden = true;
else init();
