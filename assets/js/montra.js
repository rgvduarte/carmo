// The showcase «O meu material» (EN «My gear»): one card per product Gonçalo uses, from the brands that sponsor him or
// supply his kit, read from data/montra.json (montra-core.js has the rules). The section and its nav entry exist only
// here, in JS, and only while at least one product is on the site: with an empty file (the published state), no file,
// a broken file, or only past or future products, the page is exactly what it is without the showcase (index.html has
// no markup of it, so the page without JS and the printed media kit never show a trace).
// It is advertising and says so: the eyebrow «Publicidade», a full-size line above the cards, the brand on every card
// and rel="sponsored" on every shop link (which opens in a new tab with the gocarmo tag, montra-core.js shopUrl).
// The page tracker (stats-site.js) counts what happens here from the DOM: .mt-card[data-brand][data-prod], .mt-shop and
// .mt-cp, and the event 'gc:montra' once the section is in place. No code ever goes into a label.
import { t, getLang } from './i18n.js';
import { lisbonDay } from './season-rules.js';
import { parseMontra, activeProducts, shopUrl, photoSrc } from './montra-core.js';
import { toast, copy } from './adspace.js';

const SIZES = '(max-width: 640px) calc(100vw - 32px), (max-width: 1080px) 46vw, 410px';
let cards = [];      // [{ brand, product, el: { … } }] once the section is built
let section = null;

const make = (tag, cls, attrs = {}) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const icon = (id, cls = '') => {
  const NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use');
  if (cls) s.setAttribute('class', cls);
  s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  u.setAttribute('href', `#${id}`); s.appendChild(u);
  return s;
};
const L = (o) => (o ? (getLang() === 'en' ? o.en || o.pt : o.pt) : '');

// index.html asks for the file in its head (window.__mtr), so the section is usually in place long before the visitor
// scrolls to «Apoiar»; the fetch here is only for a page without that head script
export async function loadMontra(hooks = {}) {
  let raw = null;
  try { raw = await (window.__mtr || fetch('data/montra.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null))); } catch (_) { raw = null; }
  const data = parseMontra(raw);
  const list = data ? activeProducts(data, lisbonDay()) : [];
  if (!list.length || section) return;
  build(list);
  renderMontra();
  if (typeof hooks.addSection === 'function') hooks.addSection(section, navItem);
  else { const c = document.getElementById('contacto'); if (c) c.before(section); }
  document.dispatchEvent(new CustomEvent('gc:montra', { detail: { n: list.length } }));
}

let navItem = null;
function build(list) {
  section = make('section', 'section light mt', { id: 'material', 'aria-labelledby': 'mt-h' });
  const wrap = make('div', 'wrap');
  const k = make('p', 'eyebrow mt-k'), h = make('h2', 'display h2 mt-h', { id: 'mt-h' }), p = make('p', 'lead mt-lead'), disc = make('p', 'mt-disc');
  const grid = make('ul', 'mt-grid', { role: 'list' });
  cards = list.map(({ brand, product, featured }) => {
    const li = make('li', `mt-card${featured ? ' is-featured' : ''}`);
    li.dataset.brand = brand.id; li.dataset.prod = product.id;
    // the photo, 4:5: WebP with a JPEG fallback (only a JPEG pair when the phone that took it could not write WebP)
    const src = photoSrc(product), fig = make('figure', 'mt-img'), pic = document.createElement('picture');
    if (src.webp600) pic.appendChild(make('source', '', { type: 'image/webp', srcset: `${src.webp600} 600w, ${src.webp1200} 1200w`, sizes: SIZES }));
    const img = make('img', '', { src: src.jpg600, width: '600', height: '750', loading: 'lazy', decoding: 'async' });
    if (src.jpg1200) { img.setAttribute('srcset', `${src.jpg600} 600w, ${src.jpg1200} 1200w`); img.setAttribute('sizes', SIZES); }
    pic.appendChild(img); fig.appendChild(pic);
    const body = make('div', 'mt-body');
    const tag = make('p', 'mt-tag'), kind = make('span', 'mt-kind'), bn = make('span', 'mt-brand');
    bn.textContent = brand.name;
    tag.append(kind, ' · ', bn);
    const name = make('h3', 'mt-name'), line = make('p', 'mt-line');
    body.append(tag, name, line);
    let code = null;
    if (product.code) {
      const box = make('div', 'mt-code'), ck = make('span', 'mt-code-k');
      const cp = make('button', 'mt-cp', { type: 'button', 'data-track-label': 'montra-code' });
      const mono = make('span', 'mono'); mono.textContent = product.code;
      const ic = make('span', 'mt-cp-i'); ic.append(icon('i-copy', 'i-cp'), icon('i-check', 'i-ok'));
      cp.append(mono, ic);
      const note = make('small', 'mt-code-n');
      box.append(ck, cp, note);
      body.appendChild(box);
      cp.addEventListener('click', async () => {
        const ok = await copy(product.code);
        toast(t(ok ? 'toast.code' : 'mt.codeIs', product.code));
        if (!ok) return;
        cp.classList.add('copied');
        clearTimeout(cp._t); cp._t = setTimeout(() => cp.classList.remove('copied'), 1500);
      });
      code = { ck, cp, note };
    }
    // the shop: a new tab, marked as sponsored, with the gocarmo tag
    const a = make('a', 'btn sm mt-shop', { href: shopUrl(product.url, { season: brand.season, id: product.id }), target: '_blank', rel: 'sponsored noopener', 'data-track-label': 'montra-shop' });
    const at = make('span'), sr = make('span', 'sr-only');
    a.append(at, sr, icon('i-arrow'));
    body.appendChild(a);
    li.append(fig, body);
    grid.appendChild(li);
    return { brand, product, el: { img, kind, name, line, code, at, sr } };
  });
  const foot = make('p', 'mt-foot'), fa = make('a');
  foot.appendChild(fa);
  wrap.append(k, h, p, disc, grid, foot);
  section.appendChild(wrap);
  section._t = { k, h, p, disc, fa };
  navItem = document.createElement('li');
  const na = make('a', '', { href: '#material' });
  navItem.appendChild(na);
  navItem._a = na;
}

// the words, in the page's language (main.js calls it on every language switch); the cards stay the same elements, so
// what the tracker observes is never replaced
export function renderMontra() {
  if (!section) return;
  const s = section._t;
  s.k.textContent = t('mt.k'); s.h.textContent = t('mt.h'); s.p.textContent = t('mt.p'); s.disc.textContent = t('mt.disc');
  s.fa.textContent = t('mt.terms'); s.fa.setAttribute('href', t('mt.termsHref'));
  navItem._a.textContent = t('nav.gear');
  for (const { brand, product, el } of cards) {
    const nm = L(product.name);
    el.img.alt = product.alt ? L(product.alt) : t('mt.alt', brand.name, nm);
    el.kind.textContent = t('mt.kind', brand.level);
    el.name.textContent = nm;
    el.line.textContent = t('mt.line', L(product.line));
    if (el.code) {
      el.code.ck.textContent = t('mt.code');
      el.code.cp.setAttribute('aria-label', t('mt.cp', product.code));
      el.code.note.textContent = L(product.codeNote);
      el.code.note.hidden = !product.codeNote;
    }
    el.at.textContent = t('mt.shop');
    el.sr.textContent = t('mt.newtab', nm, brand.name);
  }
}
