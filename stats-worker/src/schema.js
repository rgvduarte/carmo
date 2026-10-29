// Every allowlist the Worker checks a beacon against (SPEC 3.3, 4.5, 4.7, 4.8, appendices B and E). The tracker
// (assets/js/stats*.js) sends nothing outside these lists; the Worker drops anything that is outside them anyway.
// Adding a zone, a spot, an event or a parameter here is a privacy change: update SPEC.md first (privacy 2.9).

export const SCHEMA_VERSION = 1;      // the tables in store.js (meta.schema)
export const TRACKER_VERSION = 1;     // the beacon's `v`

// page zones, in page order (assets/js/stats-zones.js has the same ids)
// 'material' is the showcase «O meu material» (#material), on the page only while a partner has an active product
export const ZONES = ['top', 'tese', 'historia', 'prova', 'resultados', 'dados', 'epoca', 'fato-topo', 'o-fato',
  'o-capacete', 'fato-termos', 'media', 'apoiar', 'material', 'contacto', 'footer'];
// fixed layers (do not scroll with the page)
export const FIXED = ['reserva', 'opiniao', 'pacote', 'ficha', 'nav', 'aviso'];
export const ZONE_SET = new Set(ZONES);
export const FIXED_SET = new Set(FIXED);
export const PLACE_SET = new Set([...ZONES, ...FIXED]);          // `sec` of a click, `ex`
export const SEC_KEYS = new Set([...ZONES, 'reserva']);           // keys of the dwell object `sec`
export const OFFER_ZONES = ['fato-topo', 'o-fato', 'o-capacete', 'fato-termos'];   // S0: saw the offer
export const BEFORE_OFFER = new Set(ZONES.slice(0, ZONES.indexOf('fato-topo')));    // top … epoca
export const SCRUBBED = ['prova', 'resultados'];

// section anchors a landing hash may name (`land: '#<anchor>'`), and `nav_click.to`
export const ANCHORS = ['top', 'tese', 'historia', 'prova', 'resultados', 'dados', 'epoca', 'fato', 'o-fato',
  'o-capacete', 'media', 'apoiar', 'material', 'contacto'];
export const ANCHOR_SET = new Set(ANCHORS);

// appendix B (data/spots.json). Unknown spot ids are dropped: add new ones here and deploy again.
export const SPOTS_SUIT = ['peito', 'clavicula-e', 'clavicula-d', 'abdomen', 'cintura', 'lateral-e', 'lateral-d',
  'ombro-e', 'ombro-d', 'coxa-frente-e', 'coxa-frente-d', 'coxa-lateral-e', 'coxa-lateral-d', 'coxa-tras-e',
  'coxa-tras-d', 'nuca', 'costas-topo', 'costas-centro', 'lombar', 'gluteos'];
export const SPOTS_HELMET = ['capacete-topo', 'capacete-lateral-e', 'capacete-lateral-d', 'capacete-traseira'];
export const SPOT_IDS = [...SPOTS_SUIT, ...SPOTS_HELMET];
export const SPOTS = [...SPOT_IDS, 'title'];                      // `title` = the whole suit
export const SPOT_SET = new Set(SPOTS);
const HELMET_SET = new Set(SPOTS_HELMET);
export const itemOfSpot = (id) => (HELMET_SET.has(id) ? 'helmet' : SPOT_SET.has(id) ? 'suit' : null);
export const ITEMS = ['suit', 'helmet'];

// 4.8: CTA ids (cta_view `id`, click `cta`), in the dashboard's order
export const CTAS = ['hero-sponsor', 'hero-support', 'nav-sponsor', 'entry-suit', 'entry-helmet', 'title', 'pkg-go',
  'spot-add', 'spot-try', 'gofundme', 'give-iban', 'give-mb', 'contact-email', 'media-kit', 'strava'];
export const CTA_SET = new Set(CTAS);

export const VW = ['m', 't', 'd', 'w'];
export const DEVS = ['mobile', 'tablet', 'desktop'];
export const CHANNELS = ['social', 'pesquisa', 'ia', 'mensagens', 'desporto', 'direto', 'interno', 'outros'];

// appendix E: first-party script basenames (an error from one of them keeps its scrubbed message)
export const ERROR_FILES = new Set(['main.js', 'adspace.js', 'suit.js', 'suit-body.js', 'suit-mesh.js', 'suit-worker.js',
  'helmet.js', 'i18n.js', 'marks.js', 'flow.js', 'charts.js', 'data.js', 'stats.js', 'stats-site.js', 'stats-fb.js',
  'stats-zones.js', 'analytics.js', 'privacy.js', 'montra.js', 'montra-core.js', 'gsap.min.js', 'ScrollTrigger.min.js',
  'ScrambleTextPlugin.min.js', 'lenis.min.js', 'three.module.min.js', 'index.mjs', 'web-vitals.attribution.js']);

// ---------- selector grammar (4.5) ----------
// attribute values a selector step may carry: only enums from the page itself (never free text)
const ROLES = ['alert', 'alertdialog', 'application', 'article', 'banner', 'button', 'cell', 'checkbox', 'columnheader',
  'combobox', 'complementary', 'contentinfo', 'definition', 'dialog', 'directory', 'document', 'feed', 'figure', 'form',
  'grid', 'gridcell', 'group', 'heading', 'img', 'link', 'list', 'listbox', 'listitem', 'log', 'main', 'marquee', 'math',
  'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'meter', 'navigation', 'none', 'note', 'option',
  'presentation', 'progressbar', 'radio', 'radiogroup', 'region', 'row', 'rowgroup', 'rowheader', 'scrollbar', 'search',
  'searchbox', 'separator', 'slider', 'spinbutton', 'status', 'switch', 'tab', 'table', 'tablist', 'tabpanel', 'term',
  'textbox', 'timer', 'toolbar', 'tooltip', 'tree', 'treegrid', 'treeitem'];
export const ATTR_VALUES = {
  'data-id': new Set(SPOTS),
  'data-item': new Set(ITEMS),
  'data-view': new Set(['front', 'left', 'back', 'right']),
  'data-act': new Set(['zoom-in', 'zoom-out', 'rotate', 'spots']),
  'data-focus': new Set(SPOTS),
  'data-lang': new Set(['pt', 'en']),
  'data-sort': new Set(['area', 'price']),
  'data-tab': new Set(['mb', 'tr']),
  role: new Set(ROLES),
};

// ---------- the event dictionary (4.7) ----------
// Each param is a checker: it returns the clean value, or undefined to drop the param. `cap` is per page view
// (derive.js counts at most that many); `per` makes the cap count per value of that param (cta_view: 1 per id); `need`
// lists the params without which derive.js drops the event (a showcase event without its brand and product says
// nothing); `rel(p)`, when set, must hold for the clean params or derive.js drops the event.
const int = (lo, hi) => (v) => {
  const n = typeof v === 'string' && /^-?\d{1,7}$/.test(v) ? Number(v) : v;
  return Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
};
const clampInt = (lo, hi) => (v) => {
  const n = typeof v === 'string' && /^-?\d{1,9}(\.\d+)?$/.test(v) ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : undefined;
};
const bool = (v) => (v === 1 || v === '1' || v === true ? 1 : v === 0 || v === '0' || v === false ? 0 : undefined);
const oneOf = (...xs) => { const s = new Set(xs); return (v) => (typeof v === 'string' && s.has(v) ? v : undefined); };
const inSet = (set) => (v) => (typeof v === 'string' && set.has(v) ? v : undefined);
// a number bucketed down to the largest edge ≤ it (the tracker buckets; this only repairs a raw value)
const bucket = (edges) => (v) => {
  const n = typeof v === 'string' && /^\d{1,9}(\.\d+)?$/.test(v) ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return undefined;
  let b = edges[0];
  for (const e of edges) if (n >= e) b = e;
  return b;
};
const pkgN = (v) => {
  const s = typeof v === 'number' ? String(v) : v;
  if (s === '1' || s === '2' || s === '3+' || s === 'title') return s;
  if (typeof s === 'string' && /^\d{1,2}$/.test(s) && Number(s) >= 3) return '3+';
  return undefined;
};
const item = oneOf('suit', 'helmet');
const spot = inSet(SPOT_SET);
const anchor = inSet(ANCHOR_SET);
const step12 = (v) => { const n = int(1, 2)(v); return n; };
const assetName = (v) => (typeof v === 'string' && /^[a-z0-9._-]{1,48}$/.test(v) ? v : undefined);
// a showcase brand or product id (data/montra.json, assets/js/montra-core.js ID_RE): lowercase words joined by single
// hyphens, at most 40 characters, never a run of 4 digits (public slugs from a public file, never free text)
export const slug = (v) => (typeof v === 'string' && v.length <= 40 && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(v) && !/\d{4}/.test(v) ? v : undefined);
// a showcase product belongs to the brand its id starts with («marca-gel» is of «marca»): a beacon cannot pair one
// brand with another brand's product
export const prodOfBrand = (p) => !!p && typeof p.prod === 'string' && typeof p.brand === 'string' && p.prod.startsWith(`${p.brand}-`);

export const EVENTS = {
  cta_view: { p: { id: inSet(CTA_SET) }, cap: 1, per: 'id' },
  nav_click: { p: { to: anchor }, cap: 20 },
  menu_open: { p: {}, cap: 5 },
  back_top: { p: { from: oneOf('brand', 'footer') }, cap: 5 },
  hero_cta: { p: { to: oneOf('fato', 'apoiar') }, cap: 5 },
  offer_reach: { p: { s: clampInt(0, 3600), via: oneOf('hero', 'nav', 'menu', 'outro', 'link', 'scroll') }, cap: 1 },
  entry_click: { p: { item }, cap: 10 },
  results_all: { p: { open: bool }, cap: 5 },
  strava_table: { p: { open: bool }, cap: 5 },
  marks_jump: { p: { i: int(0, 8) }, cap: 20 },
  studio_near: { p: { item }, cap: 1, per: 'item' },
  studio_seen: { p: { item }, cap: 1, per: 'item' },
  studio_show: { p: { item }, cap: 1, per: 'item' },
  studio_wait: { p: { item, s: bucket([0, 1, 2, 5, 10, 20]) }, cap: 1, per: 'item' },
  studio_rotate: { p: { item }, cap: 1, per: 'item' },
  studio_tap: { p: { item, hit: bool }, cap: 30 },
  studio_pinch: { p: { item }, cap: 3 },
  studio_zoom: { p: { item, dir: oneOf('in', 'out') }, cap: 20 },
  studio_view: { p: { item, view: oneOf('front', 'left', 'back', 'right') }, cap: 20 },
  studio_auto: { p: { item, on: bool }, cap: 10 },
  studio_spots: { p: { item, on: bool }, cap: 10 },
  chapter: { p: { item, focus: spot }, cap: 20 },
  tour_start: { p: { item }, cap: 5 },
  tour_end: { p: { item, how: oneOf('fim', 'parado'), n: clampInt(0, 20) }, cap: 5 },
  spot_select: { p: { spot, item, from: oneOf('3d', 'tabela', 'capitulo', 'teclas', 'link') }, cap: 40 },
  spot_close: { p: { how: oneOf('x', 'arrasto', 'esc') }, cap: 20 },
  rc_sort: { p: { by: oneOf('area', 'price') }, cap: 10 },
  rc_avail: { p: { on: bool }, cap: 10 },
  pkg_add: { p: { spot, n: pkgN }, cap: 30 },
  pkg_remove: { p: { spot, n: pkgN }, cap: 30 },
  pkg_bar: { p: {}, cap: 3 },
  pkg_clear: { p: {}, cap: 5 },
  title_click: { p: {}, cap: 5 },
  try_open: { p: {}, cap: 10 },
  logo_try: { p: { spot }, cap: 10 },
  logo_opt: { p: { opt: oneOf('bg', 'inv'), on: bool }, cap: 10 },
  logo_remove: { p: {}, cap: 5 },
  mockup_download: { p: { spot }, cap: 10 },
  spot_share: { p: { spot, how: oneOf('nativo', 'copia') }, cap: 10 },
  onsuit_view: { p: {}, cap: 1 },
  claim_open: { p: { via: oneOf('pkg', 'title', 'retoma'), n: pkgN, step: step12 }, cap: 5 },
  claim_step: { p: { step: step12 }, cap: 10 },
  claim_items: { p: {}, cap: 5 },
  claim_extra: { p: {}, cap: 5 },
  claim_error: { p: { field: oneOf('cl-brand', 'cl-logo'), kind: oneOf('empty') }, cap: 10 },
  claim_send: { p: { ch: oneOf('whatsapp', 'email', 'instagram', 'manual') }, cap: 10 },
  pay_tab: { p: { tab: oneOf('mb', 'tr'), auto: bool }, cap: 10 },
  pay_copy: { p: { what: oneOf('iban', 'mb', 'amt', 'ref', 'email') }, cap: 20 },
  claim_back: { p: {}, cap: 5 },
  claim_done: { p: { tab: oneOf('mb', 'tr') }, cap: 3 },
  claim_close: { p: { step: step12, how: oneOf('x', 'esc', 'feito') }, cap: 5 },
  bf_return: { p: { dlg: bool }, cap: 5 },
  give_copy: { p: { what: oneOf('iban', 'mb') }, cap: 10 },
  give_kind: { p: {}, cap: 5 },
  kit_print: { p: {}, cap: 3 },
  print: { p: { via: oneOf('botao', 'outro') }, cap: 3 },
  lang_switch: { p: { from: oneOf('pt', 'en'), to: oneOf('pt', 'en'), s: bucket([0, 10, 30, 60]) }, cap: 10 },
  toast_err: { p: { k: oneOf('bad', 'big', 'sold', 'helmet') }, cap: 10 },
  fb_show: { p: { q: oneOf('patrocinio', 'patrocinio_porque'), step: oneOf('pergunta', 'seguimento') }, cap: 1 },
  fb_close: { p: { q: oneOf('patrocinio', 'patrocinio_porque'), step: oneOf('pergunta', 'seguimento') }, cap: 1 },
  '3d_ready': { p: { item, ms: bucket([0, 500, 1000, 2000, 5000, 10000, 20000]), mesh: oneOf('worker', 'main') }, cap: 1, per: 'item' },
  '3d_fail': { p: { item, why: oneOf('nogl', 'load', 'ctx', 'unknown') }, cap: 1, per: 'item' },
  gl_lost: { p: {}, cap: 5 },
  gl_back: { p: {}, cap: 5 },
  asset_fail: { p: { what: oneOf('spots', 'logo', 'img', 'module', 'gsap', 'lenis'), name: assetName, spot }, cap: 10 },
  boot_retry: { p: {}, cap: 1 },
  boot_fail: { p: {}, cap: 1 },
  // the showcase «O meu material»: a product card at least half in view for 1 s (once per product), a tap on its shop
  // link, a copy of its discount code (the code itself is never sent)
  montra_view: { p: { brand: slug, prod: slug }, cap: 1, per: 'prod', need: ['brand', 'prod'], rel: prodOfBrand },
  montra_shop: { p: { brand: slug, prod: slug }, cap: 10, need: ['brand', 'prod'], rel: prodOfBrand },
  montra_code: { p: { brand: slug, prod: slug }, cap: 10, need: ['brand', 'prod'], rel: prodOfBrand },
};
export const MONTRA_EVENTS = ['montra_view', 'montra_shop', 'montra_code'];

// the feedback question (3.4, 4.10)
export const FEEDBACK = {
  patrocinio: new Set(['sim', 'nao']),
  patrocinio_porque: new Set(['precos', 'reservar', 'pagar', 'incluido', 'outra']),
};
export const FEEDBACK_F = { patrocinio: 100, patrocinio_porque: 101 };   // bx flush number of an answer

export const CLICK_ERRORS = new Set(['js', 'bad', 'big', 'sold', 'helmet', 'brand', 'logo']);
