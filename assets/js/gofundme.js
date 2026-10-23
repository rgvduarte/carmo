// GoFundMe in «Apoiar». data/gofundme.json is the one place for the campaign: its link and its numbers.
// - no link (or no file): the button stays a quiet WhatsApp button with a note, as before the campaign;
// - a link: the button turns gold and opens the campaign, and the campaign card shows with «Partilhar»;
// - a link and `raised`: the card also shows the amount, the bar to the goal, the supporters and the date.
// GoFundMe has no public data feed and its terms forbid scraping, so the numbers are copied by hand (README → GoFundMe).
import { t, pick, getLang, numFmt, fmtDay } from './i18n.js';
import { SITE } from './data.js';
import { flowSet } from './flow.js';
import { toast, copy } from './adspace.js';

const $ = (s) => document.querySelector(s);
// only a campaign on GoFundMe's own domains becomes the button's link
const HOST = /^(www\.)?(gofundme\.com|gofund\.me)$/;
const okUrl = (u) => { try { const x = new URL(u); return x.protocol === 'https:' && HOST.test(x.hostname) ? x.href : ''; } catch (_) { return ''; } };
const num = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
let GFM;   // undefined while the file is being read; null when there is no campaign link

// index.html preloads the file, so it is usually here before the page boots and the card never pushes «Apoiar» down
export async function loadGofundme() {
  let d = null;
  try { const r = await fetch('data/gofundme.json', { cache: 'no-cache' }); if (r.ok) d = await r.json(); } catch (_) { /* no campaign */ }
  const url = d ? okUrl(d.url) : '';
  if (d && d.url && !url) console.warn('data/gofundme.json: the url must be an https link on gofundme.com or gofund.me');
  GFM = url ? {
    url,
    title: d.title || '',
    goal: num(d.goal) || null,
    raised: num(d.raised),
    supporters: num(d.supporters),
    currency: /^[A-Z]{3}$/.test(d.currency || '') ? d.currency : 'EUR',
    updated: /^\d{4}-\d{2}-\d{2}/.test(d.updated || '') ? d.updated.slice(0, 10) : '',
  } : null;
  renderGofundme();
}

// a figure with a bold value: «angariados de <b>15 700 €</b>», «<b>41</b> apoiantes»
function bit(before, value, after) {
  const s = document.createElement('span'); s.className = 'nw';
  const b = document.createElement('b'); b.textContent = value;
  s.append(before, b, after);
  return s;
}

export function renderGofundme() {
  if (GFM === undefined) return;   // still reading the file: the page keeps its HTML button
  const a = $('#gofundme'), label = a.querySelector('span'), icon = a.querySelector('use');
  const note = $('#gofundme-note'), card = $('#gfm');
  if (!GFM) {
    // no campaign yet: a quiet WhatsApp button instead of a "coming soon" in gold
    a.href = `https://wa.me/${SITE.whatsapp}?text=${encodeURIComponent(getLang() === 'en' ? 'Hi Gonçalo, I would like to support your road to Kona.' : 'Olá Gonçalo, quero apoiar a tua preparação para Kona.')}`;
    a.className = 'btn';
    icon.setAttribute('href', '#i-wa');
    label.textContent = t('gfm.help');
    if (note) { note.hidden = false; note.textContent = t('gfm.soon'); }
    card.hidden = true;
    return;
  }
  a.href = GFM.url; a.className = 'btn gold'; icon.setAttribute('href', '#i-heart');
  if (note) note.hidden = true;
  card.hidden = false;
  const title = pick(GFM.title);
  $('#gfm-t').textContent = title;
  $('#gfm-t').hidden = !title;

  const { raised, goal, supporters } = GFM, meter = $('#gfm-meter');
  meter.hidden = raised === null;
  if (raised === null) return;
  const loc = getLang() === 'en' ? 'en-GB' : 'pt-PT';
  const cur = { style: 'currency', currency: GFM.currency, minimumFractionDigits: 0, maximumFractionDigits: 0 };
  const money = (n) => new Intl.NumberFormat(loc, { ...cur, useGrouping: 'always' }).format(n);
  flowSet($('#gfm-raised'), raised, { format: cur });

  const bar = $('#gfm-bar'), pctEl = $('#gfm-pct');
  bar.hidden = pctEl.hidden = !goal;
  if (goal) {
    const p = raised / goal;
    // «21%», written as the rest of the page writes it; never «100%» before the goal, never «0%» once something came in
    const pct = p > 0 && p < 0.01 ? '<1%' : `${numFmt(Math.floor(p * 100))}%`;
    pctEl.textContent = pct;
    bar.firstElementChild.style.setProperty('--w', raised > 0 ? `max(6px, ${Math.min(1, p) * 100}%)` : '0%');
    bar.setAttribute('aria-valuemax', String(goal));
    bar.setAttribute('aria-valuenow', String(Math.min(raised, goal)));
    bar.setAttribute('aria-valuetext', t('gfm.vt', money(raised), money(goal), pct));
  }
  const sub = $('#gfm-sub');
  sub.textContent = '';
  sub.append(goal ? bit(`${t('gfm.of')} `, money(goal), '') : t('gfm.raised'));
  if (supporters !== null) sub.append(' · ', bit('', numFmt(supporters), ` ${t('gfm.n', supporters)}`));
  const upd = $('#gfm-upd');
  upd.textContent = GFM.updated ? t('gfm.upd', fmtDay(GFM.updated)) : '';
  upd.hidden = !GFM.updated;
}

// «Partilhar»: the phone's share sheet, or the link copied where there is none
$('#gfm-share')?.addEventListener('click', async () => {
  if (!GFM) return;
  const data = { title: pick(GFM.title) || 'Gonçalo Carmo · Road to Kona', text: t('gfm.stext'), url: GFM.url };
  if (navigator.share) { try { await navigator.share(data); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
  toast((await copy(GFM.url)) ? t('toast.link') : GFM.url);
});
