// Loaded by stats.js when idle: the event list with caps and checked params (SPEC 4.7), click marks (CTA, rage, dead,
// errors), errors, gc:track, the site's own signals, Web Vitals and the feedback widget. Reads no form value.
const W = window, D = document, H = D.documentElement, $ = (s) => D.querySelector(s), $$ = (s) => [...D.querySelectorAll(s)];
const now = Date.now, later = (fn) => setTimeout(fn, 0), on = (t, f, x = D, o = { capture: true, passive: true }) => x.addEventListener(t, f, o);
// per-pv caps (SPEC 4.7), as 'cap[:param counted per value] names…'
const CAP = {};
('1 offer_reach onsuit_view fb_show fb_close boot_retry boot_fail|1:id cta_view|1:prod montra_view|' +
  '1:item studio_near studio_seen studio_show studio_wait studio_rotate 3d_ready 3d_fail|' +
  '3 studio_pinch pkg_bar claim_done kit_print print|' +
  '5 menu_open back_top hero_cta results_all strava_table tour_start tour_end pkg_clear title_click logo_remove claim_open claim_items claim_extra claim_back claim_close bf_return give_kind gl_lost gl_back|' +
  '10 entry_click studio_auto studio_spots rc_sort rc_avail try_open logo_try logo_opt mockup_download spot_share claim_step claim_error claim_send pay_tab give_copy lang_switch toast_err asset_fail montra_shop montra_code|' +
  '20 nav_click marks_jump studio_zoom studio_view chapter spot_close pay_copy|30 studio_tap pkg_add pkg_remove|' +
  '40 spot_select').split('|').forEach((g) => {
  const [c, ...ns] = g.split(' '), [m, k] = c.split(':');
  for (const n of ns) CAP[n] = [+m, k];
});
const KEYS = 'id to from s via item open i hit dir view on focus how n spot by opt step field kind ch tab auto what dlg k q ms mesh why name brand prod'.split(' ');
// a small whole number or a short lowercase token; the Worker checks the enums
const okv = (k, v) => (typeof v === 'number' ? Number.isInteger(v) && v >= 0 && v <= 20000
  : typeof v === 'string' && /^[a-z0-9][a-z0-9._+-]{0,47}$/.test(v) && (k === 'name' || !/\d{4}/.test(v)));
// GA funnel names → ours, with the one param each keeps (SPEC 4.6.6) and its value map (a value outside it: dropped)
const GA = { select_content: ['spot_select', 'item_id', 'spot'], begin_checkout: ['claim_open'], generate_lead: ['claim_send', 'method', 'ch'],
  add_payment_info: ['pay_tab', 'payment_type', 'tab', { mbway: 'mb', transfer: 'tr', mb: 'mb', tr: 'tr' }],
  share: ['spot_share', 'method', 'how', { web_share: 'nativo', copy_link: 'copia', nativo: 'nativo', copia: 'copia' }],
  donation_intent: ['give_copy', 'method', 'what', { transfer: 'iban', mbway: 'mb', iban: 'iban', mb: 'mb' }],
  language_change: ['lang_switch', 'new_language', 'to'] };
const CTA = [['hero-sponsor', '.hero-cta .btn.gold'], ['hero-support', '.hero-cta .btn.ghost'], ['nav-sponsor', '#nav .actions .btn.gold'],
  ['entry-suit', '.entry-card[data-item="suit"] .entry-cta'], ['entry-helmet', '.entry-card[data-item="helmet"] .entry-cta'],
  ['title', '#tp-btn'], ['pkg-go', '#pk-go'], ['spot-add', '#sd-add'], ['spot-try', '#sd-try'], ['gofundme', '#gofundme'],
  ['give-iban', '#apoiar [data-copy-iban]'], ['give-mb', '#give-mb'], ['contact-email', '#contacto .cta .btn.gold'],
  ['media-kit', '#print-kit'], ['strava', '.strava-card a']];
const FIRST = /^((main|adspace|suit(-body|-mesh|-worker)?|helmet|i18n|marks|flow|charts|data|stats(-site|-fb|-zones)?|analytics|privacy|montra(-core)?|web-vitals\.attribution)\.js|(gsap|ScrollTrigger|ScrambleTextPlugin|lenis|three\.module)\.min\.js|index\.mjs)$/;
const SPOT = /^(peito|clavicula-[ed]|abdomen|cintura|lateral-[ed]|ombro-[ed]|coxa-(frente|lateral|tras)-[ed]|nuca|costas-(topo|centro)|lombar|gluteos|capacete-(topo|lateral-[ed]|traseira))$/;
const FATO = ['fato-topo', 'o-fato', 'o-capacete', 'fato-termos'];
const bucket = (v, bins) => bins.filter((b) => v >= b).pop() ?? bins[0];
const itemOf = (el) => el && el.closest('[data-item]')?.dataset.item;
const pressed = (el) => (el && el.getAttribute('aria-pressed') === 'true' ? 1 : 0);
const base = (u) => String(u || '').split(/[?#]/)[0].split('/').pop();
const inPkg = () => $$('.rc-row .add[aria-pressed="true"]').length;
const pkgN = (k = inPkg()) => (k ? (k > 2 ? '3+' : String(k)) : undefined);
const spotNow = () => (A.spots[A.spots.length - 1] || {}).id || $('.rc-row.sel')?.dataset.id;

let A, t18 = null, sent = 0, why = 'unknown';
const clicks = [], made = new Set(), done = new WeakSet();

export function ev(n, p = {}) {
  const c = CAP[n], q = {};
  if (!c) return 0;
  for (const k in p) if (KEYS.includes(k) && okv(k, p[k])) q[k] = p[k];
  return A.ev(n, q, c);
}
// the last click within 1 s gets an error mark: js, or a refusal the page showed (bad, big, sold, helmet, brand)
function mark(code, t = now()) {
  const c = clicks.filter(([r, T]) => T <= t && t - T <= 1000 && !r.$).pop();
  if (c && !(code === 'js' && c[0].e)) Object.assign(c[0], { err: 1, e: code });
}

// ---- clicks from stats.js: CTA, rage, dead (SPEC 4.6.4)
let rage = [], dw = null;
const IGN = '.meter,.topbar,#flight-km,.flight-scene,.flight-cap,#marks-track,[data-flow],#callout';
function resolve(dead) {
  const w = dw;
  if (!w) return;
  dw = null; w.mo.disconnect(); clearTimeout(w.to);
  if (dead && Math.abs(scrollY - w.y) <= 30 && D.activeElement === w.a && location.href === w.h && !String(getSelection())) w.r.dead = 1;
}
let lastA = null;
function click([r, t, T, x, y]) {
  const c = CTA.find(([, s]) => t.closest(s)), a = t.closest('a[href^="#"]');
  // the in-page link behind offer_reach's via
  if (a) lastA = [a.matches('.hero-cta .btn.gold') ? 'hero' : a.matches('#nav .actions .btn.gold') ? 'nav' : a.matches('#menu a[href="#fato"]') ? 'menu' : 'outro', T];
  clicks.push([r, T]);
  if (clicks.length > 5) clicks.shift();
  if (c) r.cta = c[0];
  if (r.pt === 'k') return;
  if (!t.closest('[data-act^="zoom"],.stage > canvas')) {
    rage = rage.concat([[T, x, y]]).slice(-3);
    if (rage[2] && rage.every((p) => T - p[0] <= 1000 && Math.hypot(p[1] - x, p[2] - y) <= 30)) { r.rage = 1; rage = []; }
  }
  if (r.ia || now() - T > 100) return;   // only a live click can be watched
  resolve(0);
  const mo = new MutationObserver((ms) => {
    if (ms.some((m) => { const n = m.target.nodeType === 1 ? m.target : m.target.parentElement; return n && !n.closest(IGN) && !(m.attributeName === 'class' && n.closest('#nav')); })) resolve(0);
  });
  mo.observe(D.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'hidden', 'open', 'aria-expanded', 'aria-pressed', 'aria-selected', 'aria-checked'] });
  dw = { r, mo, y: scrollY, a: D.activeElement, h: location.href, to: setTimeout(() => resolve(1), Math.max(0, 990 - (now() - T))) };
}

// ---- errors (SPEC 4.6.5)
const errs = new Map(), mods = new Set();
function error(e, t) {
  const g = e.target, rej = e.type === 'unhandledrejection';
  if (g && /^(IMG|SCRIPT)$/.test(g.tagName)) {
    const nm = base(g.currentSrc || g.src).toLowerCase();
    if (g.tagName === 'SCRIPT') { if (mods.has(nm)) return; mods.add(nm); }
    return ev('asset_fail', { what: g.tagName === 'IMG' ? 'img' : 'module', name: /^[a-z0-9._-]{1,48}$/.test(nm) ? nm : undefined });
  }
  if (!rej && g !== W) return;
  mark('js', t);
  // a rejection has no file: its reason's stack names one (the first http(s) frame)
  const st = rej && e.reason && typeof e.reason.stack === 'string' ? e.reason.stack : '';
  const u = (rej ? (st.match(/https?:\/\/[^\s)]+?(?=:\d+:\d+)/) || [''])[0] : String(e.filename || '')).split(/[?#]/)[0];
  const m = rej ? (e.reason && e.reason.message) || e.reason : e.message;
  const nm = rej ? 'rejection' : e.error && e.error.name;
  const r = { k: 'err', t: /^[A-Za-z]{1,30}$/.test(nm || '') ? nm : 'Error', l: Math.min(1e6, e.lineno | 0), c: Math.min(1e6, e.colno | 0), n: 1 };
  if (!/^(chrome|moz|safari-web|safari)-extension:/.test(u)) {
    r.f = m === 'Script error.' ? 'opaque' : u.startsWith(location.origin + '/') && FIRST.test(base(u)) ? base(u)
      : !u || u === location.origin + location.pathname ? 'inline' : 'ext';
    // the message only from one of our own files: inline code, a bare rejection or another script's may carry what a
    // visitor typed (privacy 2.3)
    r.m = FIRST.test(r.f) ? A.scrub(m, 100) : '';
  }
  const sig = [r.t, r.m, r.f, r.l, r.c].join('|'), old = errs.get(sig);
  if (old && !old.$) old.n = Math.min(99, old.n + 1);
  else if (errs.size < 10 || old) { errs.set(sig, r); A.add(r); }
}

// ---- gc:track: our hooks keep their names; a GA name is mapped, and dropped when we recorded it ourselves in the last 1.5 s
function bridge(d, t) {
  const n = d && d.name, g = GA[n];
  let p = (d && d.params) || {};
  if (!n || n === 'click' || n === 'section_view') return;
  if (n === '3d_fail') why = p.why;
  if (!g) return ev(n, n === '3d_ready' && typeof p.ms === 'number' ? { ...p, ms: bucket(p.ms, [0, 500, 1000, 2000, 5000, 10000, 20000]) } : p);
  const v = g[3] ? g[3][p[g[1]]] : p[g[1]];
  if (t - (A.nat[g[0]] || -1e9) < 1500 || (g[3] && !v)) return;
  ev(g[0], g[1] ? { [g[2]]: v } : {});
}

// ---- spot picks (kept by core with their origin), closing the card
let closeBy = null;
function spots() {
  for (const s of A.spots) {
    if (done.has(s)) continue;
    done.add(s);
    if (s.id && !s.tour && SPOT.test(s.id)) ev('spot_select', { spot: s.id, item: /^capacete-/.test(s.id) ? 'helmet' : 'suit', from: s.from });
    if (!s.id && closeBy && s.t - closeBy[1] <= 400) { ev('spot_close', { how: closeBy[0] }); closeBy = null; }
  }
}

// ---- the showcase's events: the card's two ids, or nothing when a card lacks one (the Worker would drop it anyway)
function montra(n, el) {
  const c = el.closest('.mt-card'), brand = c && c.dataset.brand, prod = c && c.dataset.prod;
  if (brand && prod) ev(n, { brand, prod });
}

// ---- at least r visible for 1 s (or, with a margin, near the screen)
function seen(els, r, fn, margin) {
  const tm = new WeakMap();
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    clearTimeout(tm.get(e.target));
    if (e.isIntersecting && (margin || e.intersectionRatio >= r)) margin ? fn(e.target) : tm.set(e.target, setTimeout(() => fn(e.target), 1000));
  }), { threshold: margin ? 0 : [0, r], rootMargin: margin || '0px' });
  els.forEach((el) => el && io.observe(el));
}

// ---- the booking dialog
let openBy = null, clStep = 0, clOpen = false, clHow = null;
const tabNow = () => $('#pay-tabs [aria-selected="true"]')?.dataset.tab || 'tr';
function claimSeen() {
  const d = $('#claim'), step = d && (+d.dataset.step || 1);
  if (!d || !d.open) return;
  if (!clOpen) {
    const via = openBy && now() - openBy[1] < 1500 ? openBy[0] : 'retoma';
    ev('claim_open', { via, n: via === 'title' || (via === 'retoma' && !inPkg()) ? 'title' : pkgN(), step });
    clOpen = true; openBy = null;
  } else if (step !== clStep) ev('claim_step', { step });
  if (step === 2 && clStep !== 2) ev('pay_tab', { tab: tabNow(), auto: 1 });
  clStep = step;
}

export function init(api) {
  A = api;
  import('./i18n.js').then((m) => { t18 = m.t; }).catch(() => {});
  // queued gc:track: our hooks' names now, GA's after the late-start checks (so a GA copy is dropped as a repeat)
  const q = A.q.splice(0), isGA = (d) => !!GA[d && d.name];
  A.br = bridge; q.forEach(([d, t]) => isGA(d) || bridge(d, t));
  A.oc = click; A.cq.splice(0).forEach(click);
  A.er = error; A.eq.splice(0).forEach(([e, t]) => error(e, t));
  // a module that failed before stats.js started (it loads async): index.html's watchdog kept its address
  for (const src of W.__gcBad || []) error({ type: 'error', target: { tagName: 'SCRIPT', src } }, now());
  A.sp = spots; spots();

  // ---- offer_reach (core notes the moment), the widget, the studio's wait
  let offered = 0, fbOut = 0, fbGo = 0;
  const offer = () => {
    if (offered || !A.reach) return;
    offered = 1;
    const [s, t] = A.reach, { land } = A.st();
    ev('offer_reach', { s, via: lastA && lastA[1] <= t && t - lastA[1] <= 4000 ? lastA[0] : land && !/^#(?!fato|o-)/.test(land) ? 'link' : 'scroll' });
  };
  // SPEC 4.10: 15 engaged s in the offer, then the middle line out of it on two ticks in a row
  const fb = () => {
    const s = A.st();
    if (fbGo || FATO.reduce((a, z) => a + (s.sec[z] || 0), 0) < 15) return;
    fbOut = s.mid && !FATO.includes(s.mid) ? fbOut + 1 : 0;
    if (fbOut < 2 || sent || $('#claim[open]') || (innerWidth <= 760 && $('#spot-card.open')) || $('.menu-btn[aria-expanded="true"]')) return;
    fbGo = 1;
    import('./stats-fb.js').then((m) => m.show({ ev, post: A.post, page: A.page, st: A.st })).catch(() => {});
  };
  const stages = $$('.stage[data-item]'), vis30 = new Map(), waits = {};
  const io30 = new IntersectionObserver((es) => es.forEach((e) => vis30.set(e.target, e.intersectionRatio >= 0.3)), { threshold: [0, 0.3] });
  stages.forEach((st) => io30.observe(st));
  // seconds the loading label was seen; sent when it goes, or at the hide flush
  const wait = (end) => {
    for (const st of stages) {
      const it = st.dataset.item, w = (waits[it] ||= { s: 0 }), up = $(it === 'suit' ? '#stage-loading' : '#item-loading');
      if (w.done) continue;
      if (up && vis30.get(st)) w.s++;
      if ((!up || end) && w.s) ev('studio_wait', { item: it, s: bucket(w.s, [0, 1, 2, 5, 10, 20]) });
      if (!up || (end && w.s)) w.done = 1;
    }
  };
  A.tick(() => { offer(); fb(); wait(); });
  A.hide(() => { offer(); wait(true); });
  offer();

  // ---- page health and Web Vitals (SPEC 4.6.7-8)
  const NE = performance.getEntriesByType('navigation')[0] || {};
  if (/[?&]fresh=/.test(NE.name || '')) ev('boot_retry');
  const loaded = () => {
    setTimeout(() => {
      if (H.classList.contains('no-js') || !H.classList.contains('ready')) ev('boot_fail');
      if (!W.gsap || !W.ScrollTrigger) ev('asset_fail', { what: 'gsap' });
      if (!W.Lenis) ev('asset_fail', { what: 'lenis' });
    }, Math.max(0, 2000 - (performance.now() - (NE.loadEventEnd || performance.now()))));
    // targets: only our own selectors
    const go = () => import('../vendor/web-vitals@6.2.3/dist/web-vitals.attribution.js').then((m) => {
      const o = { generateTarget: (n) => { const el = n && (n.nodeType === 1 ? n : n.parentElement), s = el ? A.sel(el) : undefined; made.add(s); return s; } };
      const vit = (x) => {
        const n = x.name.toLowerCase(), a = x.attribution || {}, tg = { lcp: a.target, inp: a.interactionTarget, cls: a.largestShiftTarget }[n], q = n === 'inp' ? 10 : 50, p = {};
        p[n] = n === 'cls' ? Math.min(5, Math.round(x.value * 100) / 100) : Math.min(30000, Math.max(0, Math.round(x.value / q) * q));
        if (tg && made.has(tg)) p[n + 'T'] = tg;
        if (n === 'inp' && /^(pointer|keyboard)$/.test(a.interactionType)) p.inpK = a.interactionType;
        A.perf(p);
      };
      for (const k of ['onLCP', 'onINP', 'onCLS', 'onFCP', 'onTTFB']) m[k](vit, o);
    }).catch(() => {});
    W.requestIdleCallback ? requestIdleCallback(go, { timeout: 3000 }) : setTimeout(go, 2000);
  };
  if (D.readyState === 'complete') loaded(); else on('load', loaded, W);
  on('pageshow', (e) => e.persisted && ev('bf_return', { dlg: $('#claim[open]')?.dataset.step === '2' ? 1 : 0 }), W);

  // ---- controls (capture phase: the state before the page's handler)
  let printAt = 0, tour = {};
  const C = [
    ['#menu a', (el) => ev('nav_click', { to: el.hash.slice(1) })],
    ['.menu-btn', (el) => later(() => el.getAttribute('aria-expanded') === 'true' && ev('menu_open'))],
    ['.brand', () => ev('back_top', { from: 'brand' })],
    ['footer a[href="#top"]', () => ev('back_top', { from: 'footer' })],
    ['.hero-cta a', (el) => ev('hero_cta', { to: el.hash.slice(1) })],
    ['.entry-card[data-item] .entry-cta', (el) => ev('entry_click', { item: itemOf(el) })],
    ['#mk-list button', (el) => ev('marks_jump', { i: $$('#mk-list button').indexOf(el) })],
    ['[data-act^="zoom"]', (el) => ev('studio_zoom', { item: itemOf(el), dir: el.dataset.act === 'zoom-in' ? 'in' : 'out' })],
    ['[data-view]', (el) => ev('studio_view', { item: itemOf(el), view: el.dataset.view })],
    ['[data-act="rotate"]', (el) => later(() => ev('studio_auto', { item: itemOf(el), on: pressed(el) }))],
    ['[data-act="spots"]', (el) => later(() => ev('studio_spots', { item: itemOf(el), on: pressed(el) }))],
    ['.chapter[data-focus]', (el) => ev('chapter', { item: itemOf(el), focus: el.dataset.focus })],
    ['.chapter[data-tour]', (el) => { if (!el.classList.contains('on')) { tour[itemOf(el)] = now(); ev('tour_start', { item: itemOf(el) }); } }],
    ['#sheet-x', () => { closeBy = ['x', now()]; }],
    ['[data-sort]', (el) => ev('rc_sort', { by: el.dataset.sort })],
    ['#only-avail', (el) => later(() => ev('rc_avail', { on: el.getAttribute('aria-checked') === 'true' ? 1 : 0 }))],
    ['.rc-row .add, #sd-add', (el) => {
      const id = el.id === 'sd-add' ? spotNow() : el.closest('.rc-row').dataset.id, row = () => $(`.rc-row[data-id="${id}"] .add`), was = pressed(row()), n = pkgN();
      later(() => { const is = pressed(row()); if (is !== was) ev(is ? 'pkg_add' : 'pkg_remove', { spot: id, n: is ? pkgN() : n }); });
    }],
    ['#pk-clear', () => ev('pkg_clear')],
    ['#pk-go', () => { openBy = ['pkg', now()]; }],
    ['#tp-btn', () => { openBy = ['title', now()]; ev('title_click'); }],
    ['#sd-try', () => later(() => $('#tryon.on') && ev('try_open'))],
    ['#logo-rm', () => ev('logo_remove')],
    ['#logo-dl', () => ev('mockup_download', { spot: spotNow() })],
    ['#sd-share', () => ev('spot_share', { spot: spotNow(), how: navigator.share ? 'nativo' : 'copia' })],
    ['#cl-more', () => ev('claim_items')],
    ['#cl-add', () => ev('claim_extra')],
    ['#cl-wa, #cl-mail, #cl-ig, #cl-sent', (el, e) => later(() => {
      if (el.id !== 'cl-sent' && $('#cl-brand[aria-invalid="true"]')) { ev('claim_error', { field: 'cl-brand', kind: 'empty' }); mark('brand'); return; }
      // with the booking Worker on, a logo is needed before the request can go
      if (el.id !== 'cl-sent' && $('#cl-logo[aria-invalid="true"]')) { ev('claim_error', { field: 'cl-logo', kind: 'empty' }); mark('logo'); return; }
      // held back while the request goes to the booking Worker first: counted at its 'gc:lead' below
      if (e.defaultPrevented) return;
      sent = 1;
      ev('claim_send', { ch: { 'cl-wa': 'whatsapp', 'cl-mail': 'email', 'cl-ig': 'instagram', 'cl-sent': 'manual' }[el.id] });
      A.flush();
    })],
    ['#pay-tabs [role="tab"]', (el) => ev('pay_tab', { tab: el.dataset.tab, auto: 0 })],
    ['#pay-mb-cp, #pay-amt-cp, #pay-ref-cp, #cl-mailfb-cp, #cl-s2 [data-copy-iban]', (el) =>
      ev('pay_copy', { what: { 'pay-mb-cp': 'mb', 'pay-amt-cp': 'amt', 'pay-ref-cp': 'ref', 'cl-mailfb-cp': 'email' }[el.id] || 'iban' })],
    ['#cl-back', () => ev('claim_back')],
    ['#claim .close', () => { clHow = 'x'; }],
    ['#apoiar [data-copy-iban]', () => ev('give_copy', { what: 'iban' })],
    ['#give-mb', () => ev('give_copy', { what: 'mb' })],
    ['.support .cta .btn.ghost', () => ev('give_kind')],
    ['#print-kit', () => { printAt = now(); ev('kit_print'); }],
    // the showcase: the card's brand and product ids (public slugs from data/montra.json), never the code or the link;
    // stats.js sends the shop tap's beacon once this dispatch is over, with this event in it
    ['.mt-shop', (el) => montra('montra_shop', el)],
    ['.mt-cp', (el) => montra('montra_code', el)],
    ['[data-lang]', (el) => {
      const from = H.lang.startsWith('pt') ? 'pt' : 'en', to = el.dataset.lang;
      if (to !== from) ev('lang_switch', { from, to, s: bucket(A.st().eng, [0, 10, 30, 60]) });
    }],
  ];
  on('click', (e) => {
    const t = e.target.closest ? e.target : e.target.parentElement;
    if (t) for (const [s, fn] of C) { const el = t.closest(s); if (el) fn(el, e); }
  });
  on('keydown', (e) => { if (e.key === 'Escape') closeBy = ['esc', now()]; });
  let printing = 0;
  on('toggle', (e) => {
    const d = e.target;
    if (now() - printing < 1500) return;   // main.js unfolds the results for print
    if (d.matches?.('details.all-results')) ev('results_all', { open: d.open ? 1 : 0 });
    if (d.matches?.('details.table-toggle')) ev('strava_table', { open: d.open ? 1 : 0 });
  });
  on('change', (e) => {
    const el = e.target;
    if (el.id === 'logo-file') ev('logo_try', { spot: spotNow() });
    if (el.id === 'logo-bg' || el.id === 'logo-inv') ev('logo_opt', { opt: el.id.slice(5), on: el.checked ? 1 : 0 });
  });
  on('beforeprint', () => { printing = now(); ev('print', { via: now() - printAt <= 2000 ? 'botao' : 'outro' }); }, W);
  on('afterprint', () => { printing = now(); }, W);
  // the phone sheet's drag, read as adspace.js reads it
  const card = $('#spot-card');
  let y0 = null, dy = 0;
  if (card) {
    on('pointerdown', (e) => { y0 = e.target.closest?.('.sheet-grip') ? e.clientY : null; dy = 0; }, card);   // only the grip drags it
    on('pointermove', (e) => { if (y0 !== null) dy = e.clientY - y0; }, card);
    const end = () => { if (y0 !== null && dy > 90) closeBy = ['arrasto', now()]; y0 = null; };
    on('pointerup', end, card); on('pointercancel', end, card);
  }

  // ---- iOS fires no click on an element that is not a link, button or the like: a short tap that no click follows
  // within 350 ms is recorded as the click it would have been (dead and rage taps are mostly on such elements)
  let tp = null;
  on('pointerdown', (e) => { tp = e.isPrimary && e.pointerType === 'touch' ? [e.clientX, e.clientY, now()] : null; });
  on('pointerup', (e) => {
    const p = tp, x = e.clientX, y = e.clientY, t = e.target;
    tp = null;
    if (!p || Math.hypot(x - p[0], y - p[1]) > 10 || now() - p[2] > 800) return;
    let clicked = 0;
    const f = () => { clicked = 1; };
    D.addEventListener('click', f, { capture: true, passive: true, once: true });
    setTimeout(() => { D.removeEventListener('click', f, true); if (!clicked) A.ck({ target: t, isTrusted: true, detail: 1, clientX: x, clientY: y }); }, 350);
  });

  // ---- the showcase: a product card at least half in view for 1 s, while the page is visible, once per product.
  // The section comes later than this (montra.js, when data/montra.json has an active product): its cards are watched
  // on 'gc:montra', and again if the section is drawn anew
  const cards = new WeakSet();
  const watchCards = () => {
    const fresh = $$('#material .mt-card').filter((el) => !cards.has(el));
    fresh.forEach((el) => cards.add(el));
    if (fresh.length) seen(fresh, 0.5, (el) => { if (D.visibilityState === 'visible' && el.isConnected) montra('montra_view', el); });
  };
  watchCards();
  on('gc:montra', watchCards);

  // ---- the studio
  seen(stages, 0, (el) => ev('studio_near', { item: el.dataset.item }), '600px 0px');
  seen(stages, 0.3, (el) => ev('studio_seen', { item: el.dataset.item }));
  seen([$('#onsuit')], 0.5, () => ev('onsuit_view'));
  for (const [id, s] of CTA) seen($$(s), 0.5, () => ev('cta_view', { id }));
  const ptr = new Map();
  let act = 0;
  on('pointerdown', (e) => {
    act = now();
    if (!e.target.matches?.('.stage > canvas')) return;
    const it = itemOf(e.target);
    if (ptr.size) ev('studio_pinch', { item: it });
    ptr.set(e.pointerId, [e.clientX, e.clientY, now(), it]);
  });
  const up = (e) => {
    const p = ptr.get(e.pointerId), tu = now();
    if (!p || !ptr.delete(e.pointerId) || e.type !== 'pointerup') return;
    if (Math.abs(e.clientX - p[0]) > 6) ev('studio_rotate', { item: p[3] });
    else if (Math.hypot(e.clientX - p[0], e.clientY - p[1]) <= 6) setTimeout(() => ev('studio_tap', { item: p[3], hit: A.spots.some((s) => s.id && s.t >= p[2] && s.t <= tu + 300) ? 1 : 0 }), 300);
  };
  on('pointerup', up); on('pointercancel', up);
  on('keydown', () => { act = now(); });
  const was = {}, tourOn = {};
  const studio = () => {
    for (const el of stages) {
      const it = el.dataset.item, s = (was[it] ||= {}), live = el.classList.contains('live'), no3d = el.classList.contains('no3d'), lost = !!el.querySelector('#gl-lost');
      if (live && !s.live) ev('studio_show', { item: it });
      if (no3d && !s.no3d) ev('3d_fail', { item: it, why });   // no3d() stills both stages: the hook's reason, if one came
      if (s.lost !== undefined && lost !== s.lost) ev(lost ? 'gl_lost' : 'gl_back');
      Object.assign(s, { live, no3d, lost });
    }
    for (const b of $$('.chapter[data-tour]')) {
      const it = itemOf(b), is = b.classList.contains('on');
      if (tourOn[it] && !is) ev('tour_end', { item: it, how: now() - act <= 300 ? 'parado' : 'fim', n: Math.min(20, A.spots.filter((s) => s.tour && s.id && s.t >= (tour[it] || 0)).length) });
      tourOn[it] = is;
    }
  };
  new MutationObserver(studio).observe($('#fato') || D.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

  const pk = $('#package');
  let pkOn = false;
  const pkSeen = () => { const is = !!pk && pk.classList.contains('on'); if (is && !pkOn) ev('pkg_bar'); pkOn = is; };
  if (pk) new MutationObserver(pkSeen).observe(pk, { attributes: true, attributeFilter: ['class'] });
  const dlg = $('#claim');
  if (dlg) {
    new MutationObserver(claimSeen).observe(dlg, { attributes: true, attributeFilter: ['open', 'data-step'] });
    // (only the dialog's own: the «Feito» reminder inside it, #cl-nag, is a dialog too, and its Esc or close is not the
    // booking's; its two buttons count as clicks in 'reserva', and «Fechar sem guardar» closes as «Feito»)
    on('cancel', (e) => { if (e.target === dlg) clHow = 'esc'; }, dlg);
    on('close', (e) => { if (e.target !== dlg) return; ev('claim_close', { step: +dlg.dataset.step || 1, how: clHow || undefined }); clOpen = false; clHow = null; clStep = 0; }, dlg);
    // «Feito» ended the request (adspace.js 'gc:done'): not a press of «Feito» that only brought up the comprovativo
    // reminder, which Esc or × may follow
    on('gc:done', () => { clHow = 'feito'; ev('claim_done', { tab: tabNow() }); });
    // the booking Worker held the request (adspace.js): that is the send, whatever happens to its message after
    on('gc:lead', (e) => { const ch = e.detail && e.detail.method; if (!/^(whatsapp|email|instagram)$/.test(ch)) return; sent = 1; ev('claim_send', { ch }); A.flush(); });
  }
  const toast = $('#toast');
  if (toast) new MutationObserver(() => {
    const txt = toast.textContent, k = t18 && !toast.closest('#claim') && ['bad', 'big', 'sold', 'helmet'].find((x) => txt === t18('toast.' + x));
    if (k) { ev('toast_err', { k }); mark(k); }
  }).observe(toast, { childList: true, characterData: true, subtree: true });

  // SPEC 4.6.10
  claimSeen(); pkSeen(); studio();
  q.forEach(([d, t]) => isGA(d) && bridge(d, t));
}
