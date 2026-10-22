// Rolling numbers (number-flow, MIT) that count up the first time they scroll into view.
// Until a number is about to show, its host keeps the final value as plain text, so print, find in page
// and a failed import always see the real figure. A hidden copy is what screen readers read, never the digit spans.
import { getLang } from './i18n.js';

let ready = null;
const seen = new WeakSet();
const pending = new WeakMap();   // number-flow -> value it rolls to
const state = new WeakMap();     // host -> { value, format, prefix, suffix }
const all = new Set();
const locale = () => (getLang() === 'en' ? 'en-GB' : 'pt-PT');
// pt-PT leaves four-digit numbers ungrouped by default ("1981"); always group, as the rest of the page does
const grouped = (format) => ({ useGrouping: 'always', ...format });
const text = (value, { format = {}, prefix = '', suffix = '' }) => prefix + new Intl.NumberFormat(locale(), grouped(format)).format(value) + suffix;

export function flowReady() {
  if (!ready) ready = import('number-flow').then(() => !!customElements.get('number-flow')).catch(() => false);
  return ready;
}

const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    const nf = e.target;
    seen.add(nf);
    io.unobserve(nf);
    if (pending.has(nf)) nf.update(pending.get(nf));
  }
}, { threshold: 0.6 }) : null;

// hosts swap their plain text for a number-flow at 0 just before they reach the screen
const near = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) { near.unobserve(e.target); mount(e.target); }
}, { rootMargin: '0px 0px 20% 0px' }) : null;

function parts(host) {
  let vis = host.querySelector(':scope > .nf-v'), sr = host.querySelector(':scope > .nf-sr');
  if (!vis) {
    host.textContent = '';
    vis = document.createElement('span'); vis.className = 'nf-v'; vis.setAttribute('aria-hidden', 'true');
    sr = document.createElement('span'); sr.className = 'nf-sr sr-only';
    host.append(vis, sr);
  }
  return { vis, sr };
}

function setup(nf, { format = {}, prefix = '', suffix = '' }) {
  nf.format = grouped(format); nf.locales = locale(); nf.numberPrefix = prefix; nf.numberSuffix = suffix;
}

async function mount(host) {
  if (!(await flowReady())) return;            // plain text stays
  const st = state.get(host), vis = host.querySelector(':scope > .nf-v');
  if (!st || !vis || vis.querySelector('number-flow')) return;
  vis.textContent = '';
  const nf = document.createElement('number-flow');
  nf.transformTiming = { duration: 1100, easing: 'cubic-bezier(.22,1,.36,1)' };
  nf.spinTiming = { duration: 1100, easing: 'cubic-bezier(.22,1,.36,1)' };
  vis.appendChild(nf);
  setup(nf, st);
  nf.update(0);
  all.add(nf);
  pending.set(nf, state.get(host).value);
  if (io) io.observe(nf); else { seen.add(nf); nf.update(pending.get(nf)); }
}

// Set a number on `host`. The first time it is seen, it starts at 0 and rolls up.
export async function flowSet(host, value, opts = {}) {
  if (!host) return;
  const { vis, sr } = parts(host);
  const label = text(value, opts);
  sr.textContent = label;
  state.set(host, { value, ...opts });
  const nf = vis.querySelector('number-flow');
  if (!nf) {
    vis.textContent = label;
    if (near) near.observe(host); else mount(host);
    return;
  }
  setup(nf, opts);
  pending.set(nf, value);
  if (seen.has(nf)) nf.update(value);
}

// Printing (or saving the media kit as PDF) shows every number at its final value, without animation.
function flush() {
  for (const nf of all) {
    if (!nf.isConnected) { all.delete(nf); continue; }
    nf.animated = false;
    if (pending.has(nf)) nf.update(pending.get(nf));
  }
}
function unflush() { for (const nf of all) nf.animated = true; }
addEventListener('beforeprint', flush);
addEventListener('afterprint', unflush);
matchMedia('print').addEventListener?.('change', (e) => (e.matches ? flush() : unflush()));

// Static numbers declared in the HTML: <span data-flow="21" data-prefix="~">~21</span>
export function flowStatic() {
  document.querySelectorAll('[data-flow]').forEach((el) => {
    const v = parseFloat(el.dataset.flow);
    const dec = (el.dataset.flow.split('.')[1] || '').length;
    flowSet(el, v, { format: { minimumFractionDigits: dec, maximumFractionDigits: dec }, prefix: el.dataset.prefix || '', suffix: el.dataset.suffix || '' });
  });
}
