// Google Analytics 4 on the public pages, switched on by one setting: SITE.ga in data.js. While it is empty this module
// does nothing at all: no banner, no cookie, no request to Google.
//
// Consent comes first (ePrivacy, GDPR, Lei 41/2004). Google's script loads only after «Aceitar», in Consent Mode v2
// basic mode: ad storage, ad user data and ad personalisation are always denied, and analytics storage is granted by
// that click alone. The choice lasts six months in this browser, and the _ga cookies expire with it. «Recusar», a
// Global Privacy Control or Do Not Track signal (also one switched on after «Aceitar»), a browser that has opened
// /admin/ (internal.js) and a frame (the heatmaps of /admin/analytics/) all keep Google out. «Definições de cookies»
// (footer) reopens the banner; withdrawing deletes the _ga cookies and stops sending at once.
//
// What is sent (no personal data: never a form field, an email, a phone number, a NIF or a brand name, never a link's
// URL, since the WhatsApp and email links carry the booking message; of the landing address's query only utm_*):
//   page_view         GA itself, when the tag loads (and again on a yes after a withdrawal)
//   section_view      a main section holds the middle of the screen for a second   section_id
//   select_content    a suit or helmet spot is opened (adspace.js sends 'gc:spot')  content_type, content_id, item_id
//   add_to_cart       a spot goes into the package ('gc:basket')                    currency, value, items
//   remove_from_cart  a spot comes out of it                                        currency, value, items
//   begin_checkout    the booking dialog opens on step 1                            currency, value, items
//   add_payment_info  a way to pay is picked, or one of its rows copied             + payment_type (mbway | transfer)
//   generate_lead     the request goes out: held by the booking Worker ('gc:lead'),  currency, value, method
//                     or sent by WhatsApp, email or Instagram (once)
//   outbound_click    a link out (not the booking ones)                             link_type, link_domain, link_location
//   share             a spot's link shared or copied ('gc:share', once it worked)   method, content_type, item_id
//   language_change   the PT / EN switch                                            new_language
//   donation_intent   «Apoiar»: IBAN or MB WAY copied, or the GoFundMe button       method
// and the user property site_language (pt | en), set when the tag loads and again on each switch.
// track(name, params) is a no-op unless SITE.ga is set and the visitor said yes.
import { SITE } from './data.js';
import { t, onLang, getLang } from './i18n.js';

const ID = String(SITE.ga || '').trim().toUpperCase();
const VALID = /^G-[A-Z0-9]{4,16}$/.test(ID);
if (ID && !VALID) console.warn(`SITE.ga "${SITE.ga}" is not a GA4 Measurement ID (G-XXXXXXXXXX): analytics stays off.`);

// the address the visit landed on, utm_* included: the tag loads later (at «Aceitar»), when the page may have
// rewritten it (the «Voltar ao topo» link drops the query), and campaigns are read from the first hit.
// Only the utm_* parameters go to Google: Instagram, Meta and mail tools add click and subscriber ids of their own
// (fbclid, igshid, mc_eid…), and those identify a person or a click.
const RAW = location.href;
const LANDING = (() => { const u = new URL(RAW); for (const k of [...u.searchParams.keys()]) if (!/^utm_(source|medium|campaign|term|content|id)$/.test(k)) u.searchParams.delete(k); return u.href; })();
const KEY = 'gc.consent';             // {"v":"granted"|"denied","at":<ms>,"sig":<GPC/DNT on at the time>}
const OWNER = 'gc.internal';           // written by internal.js on /admin/ and /admin/strava/
const TOKEN = 'gc.admin.token';        // where admin.js keeps the GitHub token
const KEEP = 183 * 864e5;              // the choice holds six months, then the banner asks again (the _ga cookies too)
const SECTIONS = ['historia', 'resultados', 'dados', 'epoca', 'o-fato', 'o-capacete', 'media', 'apoiar', 'contacto'];
const SEND = { 'cl-wa': 'whatsapp', 'cl-mail': 'email', 'cl-ig': 'instagram' };
const LINKS = [
  ['whatsapp', /(^|\.)(wa\.me|whatsapp\.com)$/], ['instagram', /(^|\.)(instagram\.com|ig\.me)$/],
  ['strava', /(^|\.)strava\.com$/], ['gofundme', /(^|\.)(gofundme\.com|gofund\.me)$/],
  ['spotify', /(^|\.)(spotify\.com|spotify\.link)$/], ['tiktok', /(^|\.)tiktok\.com$/],
];

const storage = (k) => { try { return window[k]; } catch (_) { return null; } };
const read = (k, s = storage('localStorage')) => { try { return s ? s.getItem(k) : null; } catch (_) { return null; } };

let since = 0;   // when the choice in force was made: the _ga cookies expire when it does
function readChoice() {
  try {
    const c = JSON.parse(read(KEY) || 'null');
    const age = c ? Date.now() - c.at : NaN;
    if (c && (c.v === 'granted' || c.v === 'denied') && age >= 0 && age < KEEP) {
      if (c.v === 'granted' && signal() && !c.sig) return null;   // GPC/DNT switched on after «Aceitar» withdraws it
      since = c.at;
      return c.v;
    }
  } catch (_) {}
  return null;
}
// if storage fails the choice holds for this page only, and the banner asks again next visit
function saveChoice(v) { since = Date.now(); try { localStorage.setItem(KEY, JSON.stringify({ v, at: since, sig: signal() })); } catch (_) {} }

// the owner's own browser (it opened the admin, or holds its token): never counted, and Google's script never runs
// where the GitHub token can be kept
const owner = () => read(OWNER) === '1' || !!read(TOKEN) || !!read(TOKEN, storage('sessionStorage'));
// a browser that asks sites not to track it counts as «Recusar» until the visitor chooses otherwise in the banner
const signal = () => navigator.globalPrivacyControl === true || [navigator.doNotTrack, window.doNotTrack, navigator.msDoNotTrack].some((v) => v === '1' || v === 'yes');
const later = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 300));

let choice = VALID ? readChoice() : null;
let loaded = false, paused = false;   // the tag is set up / it was, then the visitor withdrew
const live = () => VALID && loaded && choice === 'granted' && !owner();

export function track(name, params = {}) {
  if (!live()) return;
  window.gtag('event', name, params);
}

// ---------- the tag ----------
// The commands are queued at once, so an event from the first moments of the visit is kept; with idle, only Google's
// script waits for a quiet moment (a returning visitor, so it never competes with the page's own start).
function load({ idle = false } = {}) {
  if (owner()) return;
  window[`ga-disable-${ID}`] = false;
  if (loaded) {
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    // a yes after a withdrawal: the _ga cookies are gone, so this is a new visitor and the visit needs its page_view
    if (paused) { paused = false; window.gtag('event', 'page_view'); }
    return;
  }
  loaded = true;
  window.dataLayer = window.dataLayer || [];
  // gtag.js reads Arguments objects, not arrays
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  const g = window.gtag;
  g('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'denied' });
  g('consent', 'update', { analytics_storage: 'granted' });
  g('set', 'ads_data_redaction', true);
  // the language the site is shown in (the browser's own is GA's ul): PT and EN visitors can be told apart
  g('set', 'user_properties', { site_language: getLang() });
  onLang(() => window.gtag('set', 'user_properties', { site_language: getLang() }));
  g('js', new Date());
  g('config', ID, {
    page_location: LANDING,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    // GA renews the cookies on every hit: they end when the choice does, never later
    cookie_expires: Math.max(60, Math.round((since + KEEP - Date.now()) / 1000)),
    cookie_flags: location.protocol === 'https:' ? 'SameSite=Lax;Secure' : 'SameSite=Lax',
    // gocarmo.com/?ga_debug=1 shows this visit in GA's DebugView
    ...(/[?&]ga_debug=1(&|#|$)/.test(RAW) ? { debug_mode: true } : {}),
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ID)}`;
  if (idle) later(() => document.head.appendChild(s)); else document.head.appendChild(s);
  wire();
}

function stop() {
  if (loaded) { paused = true; window[`ga-disable-${ID}`] = true; window.gtag('consent', 'update', { analytics_storage: 'denied' }); }
  clearCookies();
  // a hit already on its way can still write a cookie: sweep once more
  setTimeout(clearCookies, 1500);
}

// _ga, _ga_<stream> (and the older _gid/_gat), on this host and on every parent domain GA may have used
function clearCookies() {
  const names = document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => /^_(ga|gid|gat|gcl)(_|$)/.test(n));
  if (!names.length) return;
  const parts = location.hostname.split('.'), domains = [null];
  for (let i = 0; i < parts.length - 1; i++) domains.push(parts.slice(i).join('.'));
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  for (const n of names) for (const d of domains) document.cookie = `${n}=; Max-Age=0; Path=/${d ? `; Domain=${d}` : ''}; SameSite=Lax${secure}`;
}

// ---------- the banner ----------
// Over the page, never pushing it (a bar on a computer, a bottom sheet on a phone). «Recusar» and «Aceitar» look the
// same. Esc, or leaving it be, is not a choice: nothing loads and the banner comes back next visit.
let panel = null, opener = null;
function build() {
  panel = document.createElement('aside');
  panel.className = 'consent';
  panel.id = 'consent';
  panel.tabIndex = -1;
  panel.setAttribute('aria-labelledby', 'consent-h');
  // the label is a plain paragraph: a heading here would come before the page's own h1
  panel.innerHTML = '<div class="consent-in"><div class="consent-txt"><p class="consent-h" id="consent-h"></p>'
    + '<p class="consent-p"><span></span> <a></a></p><p class="consent-note" hidden></p></div>'
    + '<div class="consent-acts"><button type="button" class="btn" data-choice="denied"></button>'
    + '<button type="button" class="btn" data-choice="granted"></button></div></div>';
  panel.querySelector('a').href = new URL('../../privacidade/', import.meta.url).href;
  panel.addEventListener('click', (e) => { const b = e.target.closest('[data-choice]'); if (b) choose(b.dataset.choice); });
  panel.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); hide(); } });
  // opened from «Definições de cookies»: tabbing out goes back to that button, not to the top nav
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !opener || !opener.isConnected) return;
    const f = [...panel.querySelectorAll('a[href], button')];
    const out = e.shiftKey ? (document.activeElement === f[0] || document.activeElement === panel) : document.activeElement === f[f.length - 1];
    if (out) { e.preventDefault(); opener.focus(); }
  });
  // first in the tab order, right after «Saltar para o conteúdo»
  const skip = document.querySelector('.skip');
  if (skip) skip.after(panel); else document.body.prepend(panel);
  onLang(render);
  addEventListener('resize', fit);
}
function render() {
  if (!panel) return;
  panel.querySelector('.consent-h').textContent = t('cs.h');
  // the site's own cookieless counting (stats.js) runs without this banner: it says so, so «Recusar» misleads no one
  const own = SITE.stats && SITE.stats.url && SITE.stats.mode === 'exempt';
  panel.querySelector('.consent-p span').textContent = own ? `${t('cs.own')} ${t('cs.p')}` : t('cs.p');
  panel.querySelector('.consent-p a').textContent = t('cs.more');
  const why = owner() ? 'cs.owner' : signal() && choice !== 'granted' ? 'cs.signal' : '';
  const note = panel.querySelector('.consent-note');
  note.hidden = !why;
  note.textContent = why ? t(why) : '';
  for (const b of panel.querySelectorAll('[data-choice]')) {
    b.textContent = t(b.dataset.choice === 'granted' ? 'cs.yes' : 'cs.no');
    // a visitor who comes back to change it sees which one is on; before any choice they are plain buttons
    if (choice) b.setAttribute('aria-pressed', String(b.dataset.choice === choice)); else b.removeAttribute('aria-pressed');
  }
}
// the footer leaves room for the banner, so its last links are never stuck underneath
function fit() { if (panel?.classList.contains('on')) document.documentElement.style.setProperty('--consent-h', `${panel.offsetHeight}px`); }
function show({ focus = false } = {}) {
  if (!panel) build();
  render();
  panel.classList.add('on');
  document.documentElement.classList.add('consent-on');
  fit();
  if (focus) panel.focus({ preventScroll: true });
}
function hide() {
  if (!panel) return;
  const inside = panel.contains(document.activeElement);
  panel.classList.remove('on');
  // the footer keeps the banner's room until it is off screen: dropping it at the bottom of the page would pull the
  // page down under the visitor
  const ft = document.querySelector('footer');
  const unpad = () => { if (!panel.classList.contains('on')) document.documentElement.classList.remove('consent-on'); };
  if (ft && ft.getBoundingClientRect().top < innerHeight) {
    const f = () => { if (ft.getBoundingClientRect().top >= innerHeight) { removeEventListener('scroll', f); unpad(); } };
    addEventListener('scroll', f, { passive: true });
  } else unpad();
  if (inside) { if (opener && opener.isConnected) opener.focus({ preventScroll: true }); else document.activeElement.blur(); }
  opener = null;
}
function choose(v) {
  choice = v;
  saveChoice(v);
  hide();
  if (v === 'granted') load(); else stop();
}

// ---------- events ----------
let shown = null, picked = null;   // the spot on the card now / the last one the visitor opened (not the tour)
function onSpot(e) {
  const { id = null, item = null, tour = false } = e.detail || {};
  shown = id ? { id, item } : null;
  // nothing sent is nothing picked: a spot opened before «Aceitar» still counts when it is opened again after
  if (tour || id === picked || !live()) return;
  picked = id;
  if (id) track('select_content', { content_type: `${item}_spot`, content_id: id, item_id: id });
}

let SPOTS = null;
// the total as the dialog shows it (after the bundle discount) and its spots, read from the CARMO code («CARMO 01 21»)
function order() {
  const value = Number(document.getElementById('pay-amt-cp')?.dataset.copy) || 0;
  const ref = document.getElementById('pay-ref-cp')?.dataset.copy || '';
  let items;
  if (/FATO$/.test(ref)) items = [{ item_id: 'title', item_name: 'Fato completo', item_category: 'suit', price: SPOTS?.title?.price ?? value, quantity: 1 }];
  else {
    items = (ref.match(/\d+/g) || []).map(Number).map((n) => {
      const s = SPOTS?.spots?.find((x) => x.n === n);
      return s ? { item_id: s.id, item_name: s.pt?.name || s.id, item_category: s.item || 'suit', price: s.price, quantity: 1 } : { item_id: `spot-${n}`, quantity: 1 };
    });
  }
  return { currency: 'EUR', value, items };
}

let paidBy = new Set(), sentBy = new Set();
// one request, one lead: a second way to send it, or its message after the Worker held it, is the same lead
function lead(method, value = null) {
  if (sentBy.size) return;
  sentBy.add(method);
  const o = order();
  track('generate_lead', { currency: o.currency, value: value ?? o.value, method });
}
function paid() {
  const tabs = document.getElementById('pay-tabs');
  const tab = tabs && !tabs.hidden ? tabs.querySelector('[aria-selected="true"]')?.dataset.tab : 'tr';
  const type = tab === 'mb' ? 'mbway' : 'transfer';
  if (paidBy.has(type)) return;
  paidBy.add(type);
  track('add_payment_info', { ...order(), payment_type: type });
}

function linkKind(a) {
  const href = a.getAttribute('href') || '';
  if (/^mailto:/i.test(href)) return { type: 'email', domain: 'mailto' };
  if (/^tel:/i.test(href)) return { type: 'phone', domain: 'tel' };
  let u;
  try { u = new URL(a.href); } catch (_) { return null; }
  if (!/^https?:$/.test(u.protocol) || u.hostname === location.hostname) return null;
  const host = u.hostname.replace(/^www\./, '');
  return { type: (LINKS.find(([, re]) => re.test(host)) || ['other'])[0], domain: host };
}
const where = (el) => (el.closest('footer') ? 'footer' : el.closest('#nav') ? 'nav' : el.closest('section[id]')?.id || 'page');

// Listeners run after the page's own (document, bubbling), so a send the page refused (no brand yet) is not a lead.
function onClick(e) {
  const el = e.target instanceof Element ? e.target : null;
  if (!el) return;
  // #cl-go: step 2's «Enviar por WhatsApp / email» after the booking Worker held the spots (adspace.js clicks it itself
  // when the browser still lets it open the app)
  const send = el.closest('#cl-wa, #cl-mail, #cl-ig, #cl-go');
  if (send) {
    // refused (no brand, or no logo with the Worker on), or held back while the request goes to the Worker first: not
    // sent (a hold is counted by adspace.js's 'gc:lead')
    if (e.defaultPrevented || document.getElementById('cl-brand')?.getAttribute('aria-invalid') === 'true') return;
    // Google's own outbound-click listener (Enhanced measurement) runs after this one and reads the link: it gets the
    // bare wa.me address, and the message is back in the link before the browser follows it
    if (/^https:\/\/wa\.me\//.test(send.href || '')) { const full = send.href; send.href = `https://wa.me/${SITE.whatsapp}`; addEventListener('click', () => { send.href = full; }, { once: true }); }
    // a package this tab's request already holds (#cl-held1): its hold was the lead ('gc:lead'), so its message is not
    // one, after a reload or a reopen too, whether it goes by the step 1 buttons or by step 2's #cl-go
    if (document.getElementById('cl-held1')?.hidden === false) return;
    lead(send.id === 'cl-go' ? (send.dataset.by === 'mail' ? 'email' : 'whatsapp') : SEND[send.id]);
    return;
  }
  if (el.closest('#pay-tabs [role="tab"], #pay-panel .cp')) { paid(); return; }
  const give = el.closest('#apoiar [data-copy]');
  if (give) { track('donation_intent', { method: give.id === 'give-mb' ? 'mbway' : 'transfer' }); return; }
  const a = el.closest('a[href]');
  if (!a || a.closest('#claim')) return;
  const k = linkKind(a);
  if (!k) return;
  // not 'click': that is Enhanced measurement's own event, and the two would be counted twice and mixed
  track('outbound_click', { link_type: k.type, link_domain: k.domain, link_location: where(a) });
  // with no campaign yet the GoFundMe button is a WhatsApp message to Gonçalo
  if (a.id === 'gofundme') track('donation_intent', { method: k.type });
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  document.addEventListener('click', onClick);
  // capture: before the switch runs, while the old language is still on
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-lang]');
    if (b && b.dataset.lang !== getLang()) track('language_change', { new_language: b.dataset.lang });
  }, true);
  document.addEventListener('keydown', (e) => { if (/^(Arrow|Home$|End$)/.test(e.key) && e.target instanceof Element && e.target.closest('#pay-tabs')) paid(); });
  if ('IntersectionObserver' in window) {
    // a section counts once it has held the middle of the screen for a second: a nav link that glides past it does not
    const due = new Map();
    const io = new IntersectionObserver((entries) => {
      for (const x of entries) {
        const el = x.target;
        if (!x.isIntersecting) { clearTimeout(due.get(el)); due.delete(el); continue; }
        if (due.has(el)) continue;
        due.set(el, setTimeout(() => { due.delete(el); if (!live()) return; io.unobserve(el); track('section_view', { section_id: el.id }); }, 1000));
      }
    }, { rootMargin: '-45% 0px -45% 0px' });
    for (const id of SECTIONS) { const el = document.getElementById(id); if (el) io.observe(el); }
  }
  const dlg = document.getElementById('claim');
  if (dlg) {
    let open = dlg.open;
    new MutationObserver(() => {
      if (dlg.open === open) return;
      open = dlg.open;
      if (!open) return;
      paidBy = new Set(); sentBy = new Set();
      // a reload that brings the payment back opens on step 2: that checkout began before
      if (dlg.dataset.step === '1') track('begin_checkout', order());
    }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
    fetch(new URL('../../data/spots.json', import.meta.url)).then((r) => (r.ok ? r.json() : null)).then((d) => { SPOTS = d; }).catch(() => {});
  }
}

function init() {
  for (const el of document.querySelectorAll('[data-consent-ui]')) el.hidden = false;
  document.addEventListener('click', (e) => {
    const b = e.target instanceof Element && e.target.closest('[data-consent-open]');
    if (!b) return;
    e.preventDefault();
    opener = b;
    show({ focus: true });
  });
  document.addEventListener('gc:spot', onSpot);
  // the booking Worker held the request's spots: the request reached Gonçalo, whatever happens to its message
  document.addEventListener('gc:lead', (e) => lead(e.detail.method, e.detail.value));
  // adspace.js says when a share really happened (the share sheet completed, or the link was copied)
  document.addEventListener('gc:share', (e) => { if (shown) track('share', { method: e.detail.method, content_type: `${shown.item}_spot`, item_id: shown.id }); });
  // and when a spot goes into the package or comes out
  document.addEventListener('gc:basket', (e) => {
    const s = SPOTS?.spots?.find((x) => x.id === e.detail.id);
    if (s) track(e.detail.added ? 'add_to_cart' : 'remove_from_cart', { currency: 'EUR', value: s.price, items: [{ item_id: s.id, item_name: s.pt?.name || s.id, item_category: s.item || 'suit', price: s.price, quantity: 1 }] });
  });
  if (choice === 'granted' && !owner()) { load({ idle: true }); return; }
  // no valid yes: no GA cookie stays behind (a choice that expired, a «Recusar», the owner's browser)
  clearCookies();
  if (!choice && !signal() && !owner()) later(() => { if (!choice) show(); });
}

// inside a frame (the heatmaps of /admin/analytics/ draw over the page in one): no banner and no Google at all
const framed = (() => { try { return window.top !== window.self; } catch (_) { return true; } })();
// switched off (SITE.ga emptied): GA cookies left from before go too
if (!framed) { if (VALID) init(); else clearCookies(); }
