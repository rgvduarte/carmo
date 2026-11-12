// GOCARMO Ride (/ride/): the page that presents the game and frames it. The game itself (client and server) is served
// whole from RIDE_ORIGIN (ride-config.js); this page only links to it or shows it in an <iframe>.
// PT and EN are both in the HTML ([data-l]), as on /cartao/ and the legal pages, and the page follows the site's
// language (the PT / EN buttons, ?lang=en, or the choice saved on the main page: gc.lang).
//
// - Before «Pedalar» is active the page asks the game server how it is: GET <RIDE_ORIGIN>/api/info, once, without
//   credentials, 4 s at most. It answers JSON (the server's http.rs, InfoResponse); of it only `players` is used, the
//   people connected now. No answer, an error or anything that is not JSON: the button gives way to «O servidor está
//   parado. Volta mais tarde.» and «Tentar outra vez» asks once more on each press. Nothing asks again on its own.
// - A wide window with a mouse or trackpad (WIDE): «Pedalar» is a <button> that puts the game's <iframe> in the place
//   of the poster and moves the focus into it, so the keyboard works from the first key. The frame is made only then:
//   nothing of the game loads before the visitor asks for it. A press more than FRESH after the last answer asks the
//   server again first, so a server that stopped meanwhile never shows as a broken frame.
// - A phone, a tablet without a pointer or a narrow window: no frame. «Pedalar» is the page's plain link to the game,
//   which opens as a full page (the paddles need the whole screen). Without JavaScript the page is this too.
// - No visit counting here (neither stats.js nor analytics.js) and nothing kept in the browser but gc.lang.
import { initLang, onLang, getLang } from './i18n.js';
import { RIDE_ORIGIN } from './ride-config.js';

const GAME = `${RIDE_ORIGIN}/`, INFO = `${RIDE_ORIGIN}/api/info`;
const TIMEOUT = 4000, FRESH = 30000;
// what the game may ask the browser for from inside the frame: a Bluetooth trainer, full screen, the screen kept awake
// during a ride, and copying or sharing a ride's link or summary
const ALLOW = 'bluetooth; fullscreen; screen-wake-lock; clipboard-write; web-share';
const WIDE = matchMedia('(min-width: 960px) and (min-height: 540px) and (pointer: fine)');
const CALM = matchMedia('(prefers-reduced-motion: reduce)');
const TEXT = {
  pt: {
    title: 'GOCARMO Ride · Gonçalo Carmo', frame: 'GOCARMO Ride, o jogo',
    checking: 'A verificar o servidor…', up: 'Servidor ligado', down: 'O servidor está parado. Volta mais tarde.',
    riders: (n) => (n === 1 ? '1 ciclista' : `${n} ciclistas`),
  },
  en: {
    title: 'GOCARMO Ride · Gonçalo Carmo', frame: 'GOCARMO Ride, the game',
    checking: 'Checking the server…', up: 'Server running', down: 'The server is down. Come back later.',
    riders: (n) => (n === 1 ? '1 rider' : `${n} riders`),
  },
};
const $ = (id) => document.getElementById(id);
const stage = $('rd-stage'), over = $('rd-over'), poster = $('rd-poster'), link = $('rd-link'), play = $('rd-play');
const status = $('rd-status'), retry = $('rd-retry'), full = $('rd-full'), hint = $('rd-hint');

// server: 'checking' | 'up' | 'down'; players: the server's count, or null when it sent none; frame: the game's
// <iframe> once the visitor asked for it; asked: «Tentar outra vez» was pressed (it stays in place while the answer comes)
const S = { server: 'checking', players: null, at: 0, frame: null, asked: false };
let turn = 0;

function paint() {
  const t = TEXT[getLang()] || TEXT.pt, playing = !!S.frame, down = S.server === 'down', wait = S.server === 'checking';
  const embed = WIDE.matches;
  stage.dataset.state = playing ? 'playing' : S.server;
  over.hidden = playing;
  poster.hidden = playing;
  link.hidden = down || embed;
  play.hidden = down || !embed;
  play.disabled = wait;
  if (wait) link.setAttribute('aria-disabled', 'true'); else link.removeAttribute('aria-disabled');
  retry.hidden = !(down || (wait && S.asked));
  if (wait) retry.setAttribute('aria-disabled', 'true'); else retry.removeAttribute('aria-disabled');
  full.hidden = !(playing || (embed && S.server === 'up'));
  hint.hidden = !playing;
  const line = down ? t.down : wait ? t.checking : S.players === null ? t.up : `${t.up} · ${t.riders(S.players)}`;
  if (status.textContent !== line) status.textContent = line;
  if (S.frame) S.frame.title = t.frame;
  document.title = t.title;
}

// one question to the game server; true when it answered
async function check() {
  const mine = ++turn, stop = new AbortController(), timer = setTimeout(() => stop.abort(), TIMEOUT);
  S.server = 'checking';
  paint();
  let players = null, ok = false;
  try {
    const r = await fetch(INFO, { credentials: 'omit', cache: 'no-store', signal: stop.signal });
    if (!r.ok) throw new Error(String(r.status));
    const info = await r.json();
    if (!info || typeof info !== 'object' || Array.isArray(info)) throw new Error('not the info object');
    if (Number.isInteger(info.players) && info.players >= 0) players = info.players;
    ok = true;
  } catch (_) { /* stopped, unreachable, refused or not JSON: all «parado» */ }
  clearTimeout(timer);
  if (mine !== turn) return false;
  S.server = ok ? 'up' : 'down';
  S.players = players;
  S.at = Date.now();
  paint();
  return ok;
}

function start() {
  if (S.frame) return;
  const f = document.createElement('iframe');
  f.className = 'rd-frame';
  f.title = (TEXT[getLang()] || TEXT.pt).frame;
  // before src: the browser reads these when the frame starts to load
  f.setAttribute('allow', ALLOW);
  f.setAttribute('allowfullscreen', '');
  f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  f.setAttribute('loading', 'lazy');
  f.src = GAME;
  S.frame = f;
  stage.append(f);
  paint();
  // the keyboard goes to the game from the first key, and again once the game's page is in (unless the visitor has
  // gone to another control meanwhile)
  f.focus({ preventScroll: true });
  f.addEventListener('load', () => { if ([document.body, f, null].includes(document.activeElement)) f.focus({ preventScroll: true }); }, { once: true });
  stage.scrollIntoView({ block: 'start', behavior: CALM.matches ? 'auto' : 'smooth' });
}

play.addEventListener('click', async () => {
  if (S.server !== 'up' || S.frame) return;
  // the answer is old: ask again first, and if the server has stopped the focus goes to «Tentar outra vez»
  if (Date.now() - S.at > FRESH && !(await check())) { retry.focus(); return; }
  start();
});
// the plain link waits for the first answer too; once the server has answered it is a link like any other
link.addEventListener('click', (e) => { if (link.hasAttribute('aria-disabled')) e.preventDefault(); });
retry.addEventListener('click', async () => {
  if (S.server !== 'down') return;
  S.asked = true;
  const ok = await check();
  S.asked = false;
  paint();
  // the button that was pressed is gone: the focus goes to what took its place
  if (ok && [document.body, retry, null].includes(document.activeElement)) (WIDE.matches ? play : link).focus();
});
WIDE.addEventListener('change', paint);

function show(lang) {
  for (const el of document.querySelectorAll('[data-l]')) el.hidden = el.dataset.l !== lang;
  for (const el of document.querySelectorAll('[data-en-alt]')) {
    if (!('ptAlt' in el.dataset)) el.dataset.ptAlt = el.alt;
    el.alt = lang === 'en' ? el.dataset.enAlt : el.dataset.ptAlt;
  }
  paint();
}
onLang(show);
initLang();
show(getLang());
check();
