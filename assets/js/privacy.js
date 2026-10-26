// Privacy page (/privacidade/). PT and EN are both in the HTML, one article each, and the page follows the site's
// language (the PT / EN buttons, ?lang=en, or the choice saved on the main page). analytics.js brings the cookie
// banner and the «Definições de cookies» buttons.
import { initLang, onLang, getLang } from './i18n.js';
import './analytics.js';

const TITLE = { pt: 'Privacidade · Gonçalo Carmo', en: 'Privacy · Gonçalo Carmo' };
function show(lang) {
  for (const a of document.querySelectorAll('[data-l]')) a.hidden = a.dataset.l !== lang;
  document.title = TITLE[lang] || TITLE.pt;
}
onLang(show);
initLang();
show(getLang());
