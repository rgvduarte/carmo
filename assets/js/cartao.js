// The contact card (/cartao/). PT and EN are both in the HTML ([data-l]), as on the legal pages, and the page follows
// the site's language (the PT / EN buttons, ?lang=en, or the choice saved on the main page: gc.lang).
// «Adicionar à Apple Wallet» shows only on an Apple device (Wallet opens a .pkpass there and nowhere else) and only
// once the Action «Wallet pass» has published the pass: it writes cartao/wallet.json with the file's name, and a HEAD
// request then confirms the file is there. Before that, wallet.json says { "pkpass": "" } and nothing is asked for.
// No visit counting here (neither stats.js nor analytics.js): nothing about the visit is sent or stored.
import { initLang, onLang, getLang } from './i18n.js';

const TITLE = { pt: 'Gonçalo Carmo · Cartão de contacto', en: 'Gonçalo Carmo · Contact card' };
const LINK = 'https://gocarmo.com/cartao/';
const $ = (s) => document.querySelector(s);

function show(lang) {
  for (const el of document.querySelectorAll('[data-l]')) el.hidden = el.dataset.l !== lang;
  for (const el of document.querySelectorAll('[data-en-alt]')) {
    if (!('ptAlt' in el.dataset)) el.dataset.ptAlt = el.alt;
    el.alt = lang === 'en' ? el.dataset.enAlt : el.dataset.ptAlt;
  }
  document.title = TITLE[lang] || TITLE.pt;
}
onLang(show);
initLang();
show(getLang());

const wallet = $('#vc-wallet');
const apple = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent);
if (wallet && apple) {
  fetch('wallet.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const file = d && typeof d.pkpass === 'string' && /^[\w.-]+\.pkpass$/.test(d.pkpass) ? d.pkpass : '';
      if (!file) return;
      return fetch(file, { method: 'HEAD', cache: 'no-cache' }).then((r) => {
        if (!r.ok) return;
        wallet.href = file;
        wallet.hidden = false;
      });
    })
    .catch(() => {});
}

// «Partilhar o link»: the phone's share sheet, or the link copied where there is none
const share = $('#vc-share'), toast = $('#toast');
let toastT;
function say(msg) {
  toast.textContent = msg;
  toast.classList.add('on');
  clearTimeout(toastT);
  toastT = setTimeout(() => toast.classList.remove('on'), 2600);
}
if (share && (navigator.share || navigator.clipboard?.writeText)) {
  share.hidden = false;
  share.addEventListener('click', async () => {
    const en = getLang() === 'en';
    if (navigator.share) {
      try { await navigator.share({ title: TITLE[en ? 'en' : 'pt'], url: LINK }); } catch (_) { /* closed */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(LINK);
      say(en ? 'Link copied' : 'Link copiado');
    } catch (_) {
      say(LINK);
    }
  });
}
