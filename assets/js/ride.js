// GOCARMO Ride (/ride/): the page that presents the game and frames it. The game itself (client and server) is served
// whole from RIDE_ORIGIN (ride-config.js); this page only links to it or shows it in an <iframe>.
// PT and EN are both in the HTML ([data-l]), as on /cartao/ and the legal pages, and the page follows the site's
// language (the PT / EN buttons, ?lang=en, or the choice saved on the main page: gc.lang).
//
// - Before «Pedalar» is active the page asks the game server how it is: GET <RIDE_ORIGIN>/api/info, once, without
//   credentials or referrer, 4 s at most. It answers JSON (the server's http.rs, InfoResponse); of it only `players`
//   is used, the people connected now. No answer, an error, a redirect or anything that is not JSON: the button gives
//   way to «Servidor inacessível. Volta mais tarde.» and «Tentar outra vez» asks once more on each press. Nothing asks
//   again on its own.
// - A wide window with a mouse or trackpad (WIDE): «Pedalar» is a <button> that makes the game's <iframe> under the
//   poster and moves the focus into it, so the keyboard works from the first key. The frame is made only then: nothing
//   of the game loads before the visitor asks for it. The poster stays, with «A abrir o jogo…», until the frame's
//   document is in (never an empty box); if it is not in after OPEN_LIMIT, the page says so and offers the game as a
//   full page. A press more than FRESH after the last answer asks the server again first, so a server that stopped
//   meanwhile never shows as a broken frame.
// - The frame is sandboxed: the game keeps its scripts, its storage, its pop-ups and what ALLOW names, and loses one
//   thing, the power to send this window somewhere else.
// - While the game is in the stage: «Ecrã inteiro» puts the stage (not the page) in the browser's full screen, and
//   the page under it does not scroll while the pointer is over the game (a wheel that the game does not use would
//   otherwise move the page).
// - A phone, a tablet without a pointer or a smaller window: no frame. «Pedalar» is the page's plain link to the game,
//   which opens as a full page (the paddles need the whole screen). Without JavaScript the page is this too.
// - No visit counting here (neither stats.js nor analytics.js) and nothing kept in the browser but gc.lang.
import { initLang, onLang, getLang } from './i18n.js';
import { RIDE_ORIGIN } from './ride-config.js';

const GAME = `${RIDE_ORIGIN}/`, INFO = `${RIDE_ORIGIN}/api/info`;
const TIMEOUT = 4000, FRESH = 30000, OPEN_LIMIT = 12000, MOST = 99999;
// what the game may ask the browser for from inside the frame: a Bluetooth trainer, full screen, the screen kept awake
// during a ride, and copying or sharing a ride's link or summary
const ALLOW = 'bluetooth; fullscreen; screen-wake-lock; clipboard-write; web-share';
// everything the game needs on a computer but one thing: it cannot navigate this window (no allow-top-navigation of
// any kind). Only flags every browser knows: Safari reports an unknown one (allow-orientation-lock) as an error.
const SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-modals allow-downloads allow-pointer-lock';
const WIDE = matchMedia('(min-width: 1280px) and (min-height: 720px) and (pointer: fine)');
// a small stage (a phone, upright or on its side): the same two conditions as in ride.css
const NARROW = matchMedia('(max-width: 599px), (orientation: landscape) and (max-height: 540px)');
const CALM = matchMedia('(prefers-reduced-motion: reduce)');
const TEXT = {
  pt: {
    title: 'GOCARMO Ride · Gonçalo Carmo', frame: 'GOCARMO Ride, o jogo',
    checking: 'A verificar o servidor…', up: 'Servidor ligado', down: 'Servidor inacessível. Volta mais tarde.',
    opening: 'A abrir o jogo…', stuck: 'O jogo não abriu aqui.',
    riders: (n) => (n === 1 ? '1 ciclista' : `${n} ciclistas`),
  },
  en: {
    title: 'GOCARMO Ride · Gonçalo Carmo', frame: 'GOCARMO Ride, the game',
    checking: 'Checking the server…', up: 'Server running', down: 'Server unreachable. Come back later.',
    opening: 'Opening the game…', stuck: 'The game did not open here.',
    riders: (n) => (n === 1 ? '1 rider' : `${n} riders`),
  },
};
const $ = (id) => document.getElementById(id);
const root = document.documentElement;
const stage = $('rd-stage'), over = $('rd-over'), poster = $('rd-poster'), link = $('rd-link'), play = $('rd-play');
const status = $('rd-status'), retry = $('rd-retry'), out = $('rd-out'), bar = $('rd-bar');
const full = $('rd-full'), fs = $('rd-fs'), hint = $('rd-hint');

// server: 'checking' | 'up' | 'down'; players: the server's count, or null when it sent none; frame: the game's
// <iframe> once the visitor asked for it; game: null, then 'opening' (the frame is loading under the poster), 'stuck'
// (still loading after OPEN_LIMIT) or 'playing' (its document is in); asked: «Tentar outra vez» was pressed (it stays
// in place while the answer comes); inside: the game has the keyboard; hover: the pointer is over the stage
const S = { server: 'checking', players: null, at: 0, frame: null, game: null, asked: false, inside: false, hover: false };
let turn = 0;

function paint() {
  const t = TEXT[getLang()] || TEXT.pt, down = S.server === 'down', wait = S.server === 'checking';
  const playing = S.game === 'playing', stuck = S.game === 'stuck', embed = WIDE.matches;
  const canFs = playing && !!document.fullscreenEnabled && !!stage.requestFullscreen;
  stage.dataset.state = S.game || S.server;
  over.hidden = playing;
  poster.hidden = playing;
  link.hidden = down || embed || !!S.game;
  play.hidden = down || !embed || !!S.game;
  play.disabled = wait;
  if (wait) link.setAttribute('aria-disabled', 'true'); else link.removeAttribute('aria-disabled');
  retry.hidden = !!S.game || !(down || (wait && S.asked));
  if (wait) retry.setAttribute('aria-disabled', 'true'); else retry.removeAttribute('aria-disabled');
  out.hidden = !stuck;
  // under the stage: «Ecrã inteiro» while the game is there (it keeps the ride), the plain link otherwise
  fs.hidden = !canFs;
  full.hidden = canFs || stuck || !(S.game || (embed && S.server === 'up'));
  hint.hidden = !(playing && !S.inside);
  // the page under the game keeps still while the pointer is over it (in full screen there is no page to move). The
  // room its scrollbar took is kept, so nothing shifts sideways: measured, since many browsers draw it over the page
  const lock = playing && S.hover && !document.fullscreenElement;
  if (lock !== root.classList.contains('rd-lock')) {
    if (lock) root.style.setProperty('--rd-bar-w', `${Math.max(0, innerWidth - root.clientWidth)}px`);
    root.classList.toggle('rd-lock', lock);
  }
  // on a phone the poster holds the button alone (the stage is small, and the picture is of a rider): the status line
  // sits under the stage (the sentence of a server that does not answer stays in the stage, in the button's place)
  const home = NARROW.matches && !down && !S.game ? bar : over;
  if (status.parentNode !== home) { if (home === bar) bar.prepend(status); else over.insertBefore(status, out); }
  const line = S.game === 'opening' ? t.opening : stuck ? t.stuck : playing ? '' : down ? t.down : wait ? t.checking : S.players === null ? t.up : `${t.up} · ${t.riders(S.players)}`;
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
    const r = await fetch(INFO, { credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: stop.signal });
    if (!r.ok) throw new Error(String(r.status));
    const info = await r.json();
    if (!info || typeof info !== 'object' || Array.isArray(info)) throw new Error('not the info object');
    if (Number.isSafeInteger(info.players) && info.players >= 0 && info.players <= MOST) players = info.players;
    ok = true;
  } catch (_) { /* stopped, unreachable, refused, redirected or not JSON: all «inacessível» */ }
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
  f.setAttribute('sandbox', SANDBOX);
  f.setAttribute('allow', ALLOW);
  f.setAttribute('allowfullscreen', '');
  f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
  f.setAttribute('loading', 'lazy');
  // the frame's document is in (the browser says so for its own error page too: a refused frame cannot be told apart
  // from here): the poster gives way, and the keyboard goes to the game unless the visitor went to another control
  const late = setTimeout(() => { if (S.game === 'opening') { S.game = 'stuck'; paint(); } }, OPEN_LIMIT);
  f.addEventListener('load', () => {
    clearTimeout(late);
    const mine = [document.body, f, null].includes(document.activeElement);
    S.game = 'playing';
    paint();
    if (mine) f.focus({ preventScroll: true });
  }, { once: true });
  f.src = GAME;
  S.frame = f;
  S.game = 'opening';
  // under the poster and its veil until the game is in
  stage.prepend(f);
  paint();
  // the keyboard goes to the game from the first key
  f.focus({ preventScroll: true });
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
// the stage (the game's frame, not the page) in the browser's full screen; Esc leaves it. The ride goes on.
fs.addEventListener('click', () => {
  if (!S.frame || !stage.requestFullscreen) return;
  Promise.resolve(stage.requestFullscreen({ navigationUI: 'hide' })).catch(() => {});
});
document.addEventListener('fullscreenchange', () => {
  paint();
  if (S.frame && S.game === 'playing') S.frame.focus({ preventScroll: true });
});
// who has the keyboard: the window loses it to the frame (blur, with the frame as the active element) and gets it back
addEventListener('blur', () => { S.inside = !!S.frame && document.activeElement === S.frame; paint(); });
addEventListener('focus', () => { S.inside = false; paint(); });
// where the pointer is: over the stage (the frame is an element of this page, so coming onto it is seen here; what
// happens inside it is not) or over the rest of the page
document.addEventListener('pointerover', (e) => {
  const on = stage.contains(e.target);
  if (on !== S.hover) { S.hover = on; paint(); }
});
WIDE.addEventListener('change', paint);
NARROW.addEventListener('change', paint);

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
