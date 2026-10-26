// The legal pages (/privacidade/, /condicoes/). PT and EN are both in the HTML, one article each, and the page follows
// the site's language (the PT / EN buttons, ?lang=en, or the choice saved on the main page). Each article carries its
// tab title in data-title. analytics.js brings the cookie banner and the «Definições de cookies» buttons.
// The visit counting part ([data-stats-ui], on /privacidade/) shows only while the site's own statistics are on
// (SITE.stats in data.js, stats.js), with its «Não contar as minhas visitas» switch: localStorage gc.optout = '1' in
// this browser, which stats.js reads before it sends anything.
import { initLang, onLang, getLang } from './i18n.js';
import { SITE } from './data.js';
import './analytics.js';

const TITLE = { pt: 'Privacidade · Gonçalo Carmo', en: 'Privacy · Gonçalo Carmo' };
function show(lang) {
  for (const a of document.querySelectorAll('[data-l]')) a.hidden = a.dataset.l !== lang;
  document.title = document.querySelector(`article[data-l="${lang}"]`)?.dataset.title || TITLE[lang] || TITLE.pt;
}
onLang(show);
initLang();
show(getLang());

const ST = SITE.stats || {};
if (ST.url && /^(exempt|consent)$/.test(ST.mode)) {
  for (const el of document.querySelectorAll('[data-stats-ui]')) el.hidden = false;
  const OPT = 'gc.optout';
  const signal = () => navigator.globalPrivacyControl === true || [navigator.doNotTrack, window.doNotTrack, navigator.msDoNotTrack].some((v) => v === '1' || v === 'yes');
  const out = () => { try { return localStorage.getItem(OPT) === '1'; } catch (_) { return false; } };
  const paint = () => {
    const off = out();
    for (const b of document.querySelectorAll('[data-optout]')) b.textContent = off ? b.dataset.on : b.dataset.off;
    for (const n of document.querySelectorAll('[data-optout-note]')) n.hidden = !off;
    for (const n of document.querySelectorAll('[data-optout-signal]')) n.hidden = !signal();
  };
  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !e.target.closest('[data-optout]')) return;
    try { if (out()) localStorage.removeItem(OPT); else localStorage.setItem(OPT, '1'); } catch (_) {}
    paint();
  });
  paint();
}
