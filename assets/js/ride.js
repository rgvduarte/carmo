// GOCARMO Ride on the home page (index.html, the section #ride after the hero): the line «N ciclistas a pedalar agora»
// on the poster. Every way into the game is a plain link to RIDE_ORIGIN (ride-config.js; node scripts/stamp.mjs writes
// it into every <a data-ride>): the game opens as a full page on its own host, never in a frame of this site. /ride/ is
// only a forwarder now, with no script.
//
// - When a fifth of the section is first on the screen (not before: a visitor who never scrolls there asks nothing of
//   the game's host), the page asks the game server once how many people are riding: GET <RIDE_ORIGIN>/api/info, without
//   credentials or referrer, no redirect followed, 4 s at most. It answers JSON (the server's http.rs, InfoResponse); of
//   it only `players` is used. Nothing asks again on its own.
// - The line shows only with an answer and at least one rider. No answer, an error, a redirect, anything that is not
//   JSON, no count or 0: the line stays hidden, and the section is the same without it (the button is a plain link).
// - The line is textContent only; it follows the site's language (onLang). Loaded on its own (data-optional): if it
//   fails, nothing else on the page does.
import { onLang, getLang, numFmt } from './i18n.js';
import { RIDE_ORIGIN } from './ride-config.js';

const INFO = `${RIDE_ORIGIN}/api/info`;
const TIMEOUT = 4000, MOST = 99999;
const TEXT = {
  pt: (n) => (n === 1 ? '1 ciclista a pedalar agora' : `${numFmt(n)} ciclistas a pedalar agora`),
  en: (n) => (n === 1 ? '1 cyclist riding now' : `${numFmt(n)} cyclists riding now`),
};
const box = document.getElementById('ride-live'), line = document.getElementById('ride-live-t');
let players = 0;

function paint() {
  if (!box || !line) return;
  const say = players > 0 ? (TEXT[getLang()] || TEXT.pt)(players) : '';
  if (line.textContent !== say) line.textContent = say;
  box.hidden = !say;
}

// one question to the game server; players stays 0 unless it answers with a count
async function ask() {
  const stop = new AbortController(), timer = setTimeout(() => stop.abort(), TIMEOUT);
  try {
    const r = await fetch(INFO, { mode: 'cors', credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', signal: stop.signal });
    if (!r.ok) throw new Error(String(r.status));
    const info = await r.json();
    if (info && typeof info === 'object' && !Array.isArray(info) && Number.isSafeInteger(info.players) && info.players >= 0 && info.players <= MOST) players = info.players;
  } catch (_) { /* stopped, unreachable, refused, redirected or not JSON: no line */ }
  clearTimeout(timer);
  paint();
}

const section = document.getElementById('ride');
if (box && line && section) {
  onLang(paint);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      ask();
    }, { threshold: 0.2 });
    io.observe(section);
  } else ask();
}
