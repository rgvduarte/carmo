// Own visit counter (SPEC 4): no cookie, no form value; reads only gc.optout and gc.internal.
import { SITE } from './data.js';
import { ZONES, zoneOf, zoneBox } from './stats-zones.js';

const C = SITE.stats || {}, W = window, D = document, N = navigator, H = D.documentElement, L = location;
const now = Date.now, $ = (s) => D.querySelector(s), R = Math.round;
const on = (t, f, o = { passive: true }, x = W) => x.addEventListener(t, f, o), cap = { capture: true, passive: true };
const get = (k) => { try { return localStorage.getItem(k); } catch (_) { return null; } };
const yes = (v) => v === '1' || v === 'yes', cl = (v, m) => Math.max(0, Math.min(m, v));
const NE = performance.getEntriesByType('navigation')[0], NURL = NE?.name || L.href;
const HASH = (NURL.match(/#.*/) || [L.hash])[0];
const SPOT = /^(peito|clavicula-[ed]|abdomen|cintura|lateral-[ed]|ombro-[ed]|coxa-(frente|lateral|tras)-[ed]|nuca|costas-(topo|centro)|lombar|gluteos|capacete-(topo|lateral-[ed]|traseira))$/;
const ANCH = ZONES.filter(([i, s]) => s === '#' + i).map((z) => z[0]).concat('fato'), HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const INTER = 'a[href],button,input,select,textarea,label,summary,[role=button],[role=tab],[role=switch],' +
  '[tabindex]:not([tabindex="-1"]),[data-copy],[data-copy-iban],[contenteditable],canvas,li.rc-row';
const scrub = (s, n) => String(s || '').replace(/\b(?:[a-z][a-z0-9+.-]*:\/\/|(?:blob|data):|www\.)\S+/gi, '[url]')
  .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]').replace(/\d(?:[\s.-]?\d){3,}/g, '[n]').replace(/(["'`]).*?\1/g, "'…'")
  .replace(/\s+/g, ' ').trim().slice(0, n);

// SPEC 4.5
const idOk = (e) => /^[a-z][a-z0-9-]{0,40}$/.test(e.id) && !/\d{4}/.test(e.id);
const ATTR = 'id item view act focus lang sort tab'.split(' ').map((a) => 'data-' + a).concat('role');
const STATE = /^(on|open|live|has|active|sold|rv|in|show|solid|on-light|ready|no3d|selected|pressed|sheet-open|pk-on|is-.*)$/;
function step(e) {
  let s = e.localName, v;
  const c = [...e.classList].find((x) => /^[a-z][a-z0-9-]{1,24}$/.test(x) && !STATE.test(x));
  if (c) s += '.' + c;
  for (const a of ATTR) {
    if ((v = e.getAttribute(a)) && /^[a-z0-9-]{1,30}$/.test(v) && !/\d{4}/.test(v)) return `${s}[${a}="${v}"]`;
  }
  const sib = [...e.parentElement.children].filter((x) => x.localName === e.localName);
  return sib[1] && (!c || sib.filter((x) => x.classList.contains(c))[1]) ? `${s}:nth-of-type(${sib.indexOf(e) + 1})` : s;
}
function sel(el) {
  if (idOk(el)) return '#' + el.id;
  const st = [];
  let root = 'body', far = 0;
  for (let e = el; e && e !== D.body && e !== H; e = e.parentElement) {
    if (e !== el && idOk(e)) { root = '#' + e.id; break; }
    if (st.length < 4) st.unshift(step(e)); else far = 1;
  }
  if (!st[0]) return el.localName;
  const s = root + (far ? ' ' : ' > ') + st.join(' > '), s2 = root + ' ' + st.slice(-2).join(' > ');
  return s.length <= 80 ? s : s2.length <= 80 ? s2 : root + ' ' + st.pop();
}
const lab = (el, d = el.dataset || {}) => scrub(d.trackLabel || d.i18n || el.querySelector('[data-i18n]')?.dataset.i18n || /aria-label:([\w.-]+)/.exec(d.i18nAttr)?.[1] || el.getAttribute('aria-label') ||
  (el.closest('form,dialog,[data-private],#claim') || el.matches('input,textarea,select,[contenteditable]') ? el.id : el.textContent), 40);
function landOf(h) {
  try { h = decodeURIComponent(h.slice(1)); } catch (_) { return; }
  const m = /^(fato|capacete)\/(.+)$/.exec(h), n = h.startsWith('pacote=') && h.slice(7).split(',').filter((x) => SPOT.test(x)).length;
  return m ? (m[2] === 'title' && m[1] === 'fato' ? 'title' : SPOT.test(m[2]) && 'spot:' + m[2]) : h === 'capacete' ? h
    : n ? 'pacote:' + (n > 2 ? '3+' : n) : ANCH.includes(h) && '#' + h;
}
function refOf() {
  let u;
  try { u = new URL(D.referrer); } catch (_) { return 'direto'; }
  const h = u.hostname.toLowerCase().replace(/^www\./, '');
  return u.protocol === 'android-app:' ? (/^[a-z0-9._]{1,60}$/.test(h) ? 'app:' + h : 'direto')
    : h === L.hostname.replace(/^www\./, '') ? 'interno' : HOST.test(h) && h.length <= 64 ? h : 'direto';
}

// SPEC 4.3
if (!(!C.url || !/^(exempt|consent)$/.test(C.mode) || N.globalPrivacyControl === true || yes(N.doNotTrack) || yes(W.doNotTrack) ||
  yes(N.msDoNotTrack) || get('gc.optout') === '1' || L.pathname.startsWith('/admin/') || N.webdriver === true || W.top !== W.self)) {
  if (C.mode === 'consent') on('gc:consent', function go(e) { if (e.detail?.analytics === true) { W.removeEventListener('gc:consent', go); start(); } }, false);
  else start();
}

function start() {
  const pv = crypto.randomUUID ? crypto.randomUUID()
    : ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
  const url = C.url.replace(/\/$/, ''), post = (u, s) => {
    try { if ('keepalive' in Request.prototype) fetch(u, { method: 'POST', body: s, keepalive: true, mode: 'no-cors', credentials: 'omit' }).catch(() => {}); else N.sendBeacon(u, s); } catch (_) {}
  };
  const land = landOf(HASH), ref = refOf(), bl = (N.language || '').toLowerCase().split('-')[0];
  const nav = D.prerendering || NE?.activationStart > 0 ? 'prerender' : /^(reload|back_forward)$/.test(NE?.type) ? NE.type : 'navigate';
  const b = $('script[type=importmap]')?.textContent.match(/main\.js\?v=([0-9a-f]{8})/);
  const camp = (new URL(NURL).searchParams.get('utm_campaign') || '').toLowerCase();
  let P, f = 0, seq = 0, nev = 0, buf = [], pend = [], eng = 0, scr = 0, scr1 = 0, mid, hid = 0, late = 0, pl = 0;
  let act = now(), pt, lastI, visMs = 0, visAt = 0, stubT, tickT, sT;
  const sec = {}, rz = new Set(), perf = {}, cnt = {}, nat = {}, hist = [], Q = [], EQ = [], CQ = [], ticks = [], hides = [];
  const vis = () => D.visibilityState === 'visible' && !D.prerendering;
  const push = (r) => nev < 200 && ((r.i = ++seq), ++nev, r);
  const more = () => { if (P && (buf[49] || JSON.stringify(buf).length > 12288)) send('m'); };
  const add = (r) => { if (push(r)) { buf.push(r); more(); } return r; };
  function ev(n, p, c = [1]) {   // c: [cap, counted per param]
    const k = n + (c[1] ? p[c[1]] : '');
    if ((cnt[k] = -~cnt[k]) > c[0]) return 0;
    nat[n] = now();
    return add(p && Object.keys(p)[0] ? { k: 'ev', n, p } : { k: 'ev', n });
  }

  // SPEC 4.9
  function send(t, end) {
    if (!P || f >= (end ? 13 : t === 'p' ? 14 : 12)) return 0;
    const o = { ...P, f: ++f, t, vis: t === 'h' || t === 'p' || !vis() ? 0 : 1 }, s = {}, e = t === 'p' ? [] : t === 'm' ? buf : buf.concat(pend), x = $('#claim[open]') ? 'reserva' : mid;
    if (t === 'p') o.perf = perf;
    else {
      buf = []; if (t !== 'm') pend = [];
      for (const k in sec) if (sec[k] >= 0.5) s[k] = R(sec[k]);
      Object.assign(o, eng && { eng }, scr && { scr }, scr1 && { scr1 }, x && { ex: x }, Object.keys(s)[0] && { sec: s },
        rz.size && { rz: [...rz] }, Object.keys(perf)[0] && { perf }, { e });
      while (e[0] && (e.length > 50 || JSON.stringify(o).length > 14336)) e.splice(Math.max(0, e.findIndex((r) => r.k === 'click')), 1);
      if (!e[0]) delete o.e;
    }
    post(url + '/v1/e', JSON.stringify(o));
    e.forEach((r) => (r.$ = 1));
    return 1;
  }
  const api = { ev, add, sel, scrub, spots: hist, q: Q, eq: EQ, cq: CQ, nat, flush: () => send('x'),
    perf: (o) => { Object.assign(perf, o); if (hid && !late) setTimeout(lp, (pl = 99)); },
    tick: (fn) => ticks.push(fn), hide: (fn) => hides.push(fn), st: () => ({ eng, sec, mid, land }), post: (p, o) => post(url + p, JSON.stringify(o)) };

  function stub() {
    const w = innerWidth, go = () => import('./stats-site.js').then((m) => m.init(api)).catch(() => {});
    P = api.page = { v: 1, pv, path: /^\/(privacidade\/)?$/.test(L.pathname) ? L.pathname : '/outro', lang: H.lang.startsWith('pt') ? 'pt' : 'en',
      bl: /^[a-z]{2,3}$/.test(bl) ? bl : 'xx', ref, vw: w <= 760 ? 'm' : w <= 1080 ? 't' : w <= 1479 ? 'd' : 'w',
      vh: cl(R(innerHeight / 100) * 100, 3000) || 100, nav, pc: +matchMedia('(pointer: coarse)').matches };
    if (land) P.land = land;
    if (b) P.b = b[1];
    if (get('gc.internal') === '1') P.int = 1;
    if (C.mode === 'consent' && camp && C.campaigns?.includes(camp)) P.cmp = camp;
    rz.add('top'); send('s'); after(depth);
    tickT = setInterval(tick, 1000);
    W.requestIdleCallback ? requestIdleCallback(go, { timeout: 3000 }) : setTimeout(go, 2000);
  }
  function onVis() {
    if (vis()) {
      hid = 0; act = now(); visAt ||= performance.now();
      if (!P) { clearTimeout(stubT); stubT = setTimeout(stub, Math.max(0, 1000 - visMs)); } else tickT ||= setInterval(tick, 1000);
    } else {
      if (visAt) visMs += performance.now() - visAt;
      visAt = 0; clearTimeout(stubT); clearInterval(tickT); tickT = 0;
    }
  }
  // late vitals: one beacon after our pagehide flush
  const lp = () => { if (pl && !late) late = send('p'); pl = 0; };
  function hide(e) {
    onVis();
    if (hid) return lp();
    if (e.type !== 'pagehide' && vis()) return;
    try { hides.forEach((fn) => fn()); } catch (_) {}
    hid = send('h', e.type === 'pagehide');
  }
  on('visibilitychange', (e) => (vis() ? onVis() : hide(e)));   // bubble phase: web-vitals first
  on('pagehide', hide);
  on('pageshow', (e) => e.persisted && onVis());
  D.addEventListener('prerenderingchange', onVis);
  onVis();

  // SPEC 4.6.1-3
  const onEl = new Set(), zel = new Map(), put = (id, s) => { sec[id] = Math.min(1800, (sec[id] || 0) + s); };
  const io = new IntersectionObserver((es) => es.forEach((e) => onEl[e.isIntersecting ? 'add' : 'delete'](e.target)), { threshold: [...Array(21).keys()].map((i) => i / 20) });
  for (const [id, s] of ZONES) for (const el of D.querySelectorAll(s)) { zel.set(el, id); io.observe(el); }
  function tick() {
    const t = now(), ih = innerHeight, part = [], card = innerWidth <= 760 && $('#spot-card.open'), one = $('#claim[open]') ? 'reserva' : card && card.closest('.part')?.id;
    let tot = 0, md;
    for (const id of new Set([...onEl].map((el) => zel.get(el)))) {
      const x = zoneBox(D, id), h = x ? Math.min(x.bottom, ih) - Math.max(x.top, 0) : 0;
      if (h > 0) { part.push([id, h]); tot += h; }
      if (x && x.top <= ih / 2 && x.bottom > ih / 2) md = id;
    }
    if (md && !rz.has((mid = md))) {
      rz.add(md);
      if (!api.reach && /^(fato-topo|o-fato|o-capacete|fato-termos)$/.test(md)) api.reach = [eng, t];
    }
    if (t - act <= 30000 && eng < 3600) {
      eng++;
      if (one) put(one, 1); else for (const [id, h] of part) put(id, h / tot);
    }
    ticks.forEach((fn) => fn(t));
  }
  // layout is read after the frame is drawn, never forced
  const after = (fn) => requestAnimationFrame(() => setTimeout(fn)), depth = (y = scrollY, ih = innerHeight) => { scr = Math.max(scr, cl(Math.floor((20 * (y + ih)) / H.scrollHeight) * 5, 100)); if (y > ih) scr1 = 1; };
  on('scroll', () => { act = now(); if (P && !sT) sT = setTimeout(() => after(() => { sT = 0; depth(); }), 250); });
  on('pointerdown', (e) => { act = now(); pt = e.pointerType; if (e.target.matches?.('.stage > canvas')) lastI = ['3d', act]; }, cap);
  on('keydown', (e) => { act = now(); if (/^Arrow(Left|Right)$/.test(e.key)) lastI = ['teclas', act]; }, cap);

  // SPEC 4.6.4; stats-site.js adds dead, rage, err, cta
  on('click', api.ck = (e) => {
    let t = e.target;
    if (t && t.nodeType !== 1) t = t.parentElement;
    if (!e.isTrusted || !t?.closest) return;
    const el = t.closest(INTER) || t, ia = +el.matches(INTER), T = now(), o = el.closest('a[href]');
    if (el.closest('li.rc-row')) lastI = ['tabela', T]; else if (el.closest('.chapter')) lastI = ['capitulo', T];
    const z = !(el.matches('input,textarea,select') && el.closest('#claim,#tryon')) && zoneOf(el), r = { k: 'click', sec: z, ia };
    if (!z) return;
    const lb = lab(el), x = e.clientX, y = e.clientY;
    r.sel = sel(el);
    if (lb) r.lab = lb;
    if (e.detail === 0) r.pt = 'k';
    else {
      const zb = zoneBox(D, z), inb = (q) => x >= q.left && x <= q.right && y >= q.top && y <= q.bottom;
      let rb = el, q = el.getBoundingClientRect();
      r.pt = { touch: 't', pen: 'p' }[pt] || 'm';
      r.x = cl(R((100 * x) / innerWidth), 100);
      if (zb) r.y = cl(R((y - zb.top) / 10) * 10, 20000);
      for (let k = 0, p = el; k < 4 && !inb(q) && (p = p.parentElement); k++) if (inb(p.getBoundingClientRect())) q = (rb = p).getBoundingClientRect();
      if (q.width && q.height) { r.ex = cl(R((100 * (x - q.left)) / q.width), 100); r.ey = cl(R((100 * (y - q.top)) / q.height), 100); }
      if (rb !== el) r.rb = sel(rb);
    }
    if (o && !o.closest('#claim')) {
      const h = o.hostname.toLowerCase().replace(/^www\./, ''), u = o.protocol;
      const out = u === 'mailto:' ? 'mailto' : u === 'tel:' ? 'tel' : /^(wa\.me|api\.whatsapp\.com)$/.test(h) ? 'whatsapp' : /^https?:$/.test(u) && o.host !== L.host && HOST.test(h) && h;
      if (out) { r.out = out; if (o.closest('#onsuit-list')) r.osp = 1; }
    }
    if (!push(r)) return;
    pend.push(r);
    api.oc ? api.oc([r, t, T, x, y]) : CQ.push([r, t, T, x, y]);
    setTimeout(() => { const k = pend.indexOf(r); if (k >= 0) { pend.splice(k, 1); buf.push(r); more(); } }, 1000);
    if (r.out) send('x');
  }, cap, D);

  // raw until stats-site.js checks them
  const raw = (e) => (api.er ? api.er(e, now()) : EQ.length < 20 && EQ.push([e, now()]));
  on('error', raw, cap);
  on('unhandledrejection', raw);
  on('gc:track', (e) => (api.br ? api.br(e.detail, now()) : Q.push([e.detail, now()])), false);
  // hook H1
  D.addEventListener('gc:spot', (e, d = e.detail || {}, t = now()) => {
    hist.push({ id: d.id, tour: !!d.tour, t, from: lastI && t - lastI[1] <= 300 ? lastI[0] : 'link' });
    if (hist.length > 20) hist.shift();
    if (api.sp) api.sp();
  });
}
