// The one-question widget (SPEC 4.10), loaded by stats-site.js only when it is about to show. Anonymous: an answer goes
// out with the page view's own fields and nothing else; this browser keeps only the month it answered (gc.fb).
const D = document, $ = (s, r = D) => r.querySelector(s);
const COPY = {
  pt: { q: 'Percebeste como funciona o patrocínio?', yes: 'Sim', no: 'Não', x: 'Fechar', q2: 'O que não ficou claro?', note: 'Anónimo. Não guardamos quem respondeu.',
    thanks: 'Obrigado!', label: 'Pergunta rápida', chips: ['Os preços', 'Como reservar', 'Como pagar', 'O que está incluído', 'Outra coisa'] },
  en: { q: 'Did you get how the sponsorship works?', yes: 'Yes', no: 'No', x: 'Close', q2: 'What was unclear?', note: "Anonymous. We don't keep who answered.",
    thanks: 'Thanks!', label: 'Quick question', chips: ['Prices', 'How to book', 'How to pay', "What's included", 'Something else'] },
};
const WHY = ['precos', 'reservar', 'pagar', 'incluido', 'outra'];
const CSS = `#gc-fb{position:fixed;z-index:46;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));width:min(360px,calc(100% - 32px));
background:var(--bg-2);color:var(--ink);border:1px solid var(--line-2);border-radius:var(--r);padding:14px 14px 12px 18px;
box-shadow:0 18px 50px rgba(0,0,0,.45);font:500 15px/1.35 var(--sans,Inter,system-ui,sans-serif);opacity:0;transform:translateY(10px);
transition:opacity .25s,transform .25s}#gc-fb.on{opacity:1;transform:none}#gc-fb p{margin:6px 40px 12px 0}
#gc-fb .a{display:flex;flex-wrap:wrap;gap:8px}#gc-fb button{min-height:44px;min-width:44px;padding:0 16px;border-radius:999px;cursor:pointer;
border:1px solid var(--line-2);background:transparent;color:inherit;font:inherit}#gc-fb .a button:hover{border-color:var(--gold)}
#gc-fb .x{position:absolute;top:4px;right:4px;border:0;padding:0;font-size:24px;line-height:1}#gc-fb small{display:block;margin-top:10px;
color:var(--muted);font-size:12px}body.pk-on #gc-fb{bottom:calc(var(--gc-pk,96px) + env(safe-area-inset-bottom))}
@media (max-width:1080px){#gc-fb{left:8px;right:8px;width:auto;bottom:calc(8px + env(safe-area-inset-bottom))}}
@media (prefers-reduced-motion:reduce){#gc-fb{transition:none}}`;
let shown = 0, memo = '';

const month = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
function asked() {
  let v = memo;
  try { v = localStorage.getItem('gc.fb') || memo; } catch (_) {}
  const m = /^(\d{4})-(\d{2})$/.exec(v || ''), d = new Date();
  return !!m && (d.getFullYear() - m[1]) * 12 + d.getMonth() + 1 - m[2] < 6;
}
const remember = () => { memo = month(); try { localStorage.setItem('gc.fb', memo); } catch (_) {} };

export function show(api, tries = 0) {
  if (shown || asked() || D.getElementById('gc-fb')) return;
  const c = COPY[D.documentElement.lang.startsWith('pt') ? 'pt' : 'en'], P = api.page;
  let q = 'patrocinio', step = 'pergunta', gone = 0;
  if (!$('#gc-fb-css')) { const st = D.createElement('style'); st.id = 'gc-fb-css'; st.textContent = CSS; D.head.appendChild(st); }
  const box = D.createElement('aside');
  box.id = 'gc-fb'; box.setAttribute('role', 'region'); box.setAttribute('aria-label', c.label);
  const btn = (txt, cls, key) => { const b = D.createElement('button'); b.type = 'button'; b.textContent = txt; if (cls) b.className = cls; if (key) b.dataset.trackLabel = key; return b; };
  const x = btn('×', 'x', 'fb.x'); x.setAttribute('aria-label', c.x);
  const p = D.createElement('p'), a = D.createElement('div'), note = D.createElement('small');
  p.setAttribute('aria-live', 'polite'); a.className = 'a'; note.textContent = c.note;
  box.append(x, p, a, note);
  const pk = $('#package');
  if (pk) D.body.style.setProperty('--gc-pk', `${Math.round(pk.getBoundingClientRect().height) + 26}px`);
  const close = (how) => {
    if (gone) return;
    gone = 1; D.removeEventListener('keydown', esc);
    if (how) { api.ev('fb_close', { q, step }); remember(); }
    box.classList.remove('on'); setTimeout(() => box.remove(), 300);
  };
  const esc = (e) => { if (e.key === 'Escape' && !$('#claim[open]') && (box.contains(D.activeElement) || !$('.menu-btn[aria-expanded="true"]'))) close('esc'); };
  const answer = (ans) => {
    // the answer is its own record (/v1/f); the fb_* events go out with the next flush
    api.post('/v1/f', Object.assign({ v: 1, q, a: ans, lang: P.lang, pv: P.pv, vw: P.vw }, api.st().mid && { ex: api.st().mid }, P.int && { int: 1 }));
    remember();
    if (q === 'patrocinio' && ans === 'nao') return ask('patrocinio_porque', c.q2, c.chips.map((t, i) => [t, WHY[i]]));
    a.textContent = ''; note.remove(); p.textContent = c.thanks; x.remove();
    setTimeout(() => close(), 2000);
  };
  const ask = (qq, text, opts) => {
    q = qq; step = qq === 'patrocinio' ? 'pergunta' : 'seguimento';
    p.textContent = text; a.textContent = '';
    for (const [t, v] of opts) { const b = btn(t, '', `fb.${v}`); b.addEventListener('click', () => answer(v)); a.appendChild(b); }
  };
  ask(q, c.q, [[c.yes, 'sim'], [c.no, 'nao']]);
  x.addEventListener('click', () => close('x'));
  box.style.visibility = 'hidden';
  D.body.appendChild(box);
  // never over a 3D stage: wait until none is under the widget
  const b = box.getBoundingClientRect();
  if ([...D.querySelectorAll('.stage')].some((s) => { const r = s.getBoundingClientRect(); return r.width && r.bottom > b.top && r.top < b.bottom && r.right > b.left && r.left < b.right; })) {
    box.remove();
    if (tries < 30) setTimeout(() => show(api, tries + 1), 1000);
    return;
  }
  shown = 1;
  box.style.visibility = '';
  requestAnimationFrame(() => box.classList.add('on'));
  D.addEventListener('keydown', esc);
  api.ev('fb_show', { q, step });
}
