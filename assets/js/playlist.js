// "Ouve o que eu ouço": Gonçalo's Spotify playlist behind a local cover card. Nothing loads from Spotify until
// the visitor asks for the player; it can then dock at the bottom of the screen while the page scrolls.
import { t, pick, onLang, getLang } from './i18n.js';
import { SITE, PLAYLIST } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
const LIVE = /(^|\.)gocarmo\.com$/.test(location.hostname);
const HEIGHTS = { warm: 34, build: 60, peak: 100, cool: 40 };

let ref = null, state = 'face', frame = null;

// open.spotify.com links (with or without /intl-xx/ and ?si=...) and spotify: URIs
function spotifyRef(url) {
  const m = String(url || '').trim().match(/^(?:https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?|spotify:)(playlist|album|track)[/:]([A-Za-z0-9]{22})(?:[/?#]|$)/i);
  return m ? { type: m[1].toLowerCase(), id: m[2] } : null;
}
// ?playlist=<link> previews the block before the real link exists; never on the live domain, so nobody can
// pass a stranger's playlist off as Gonçalo's with a crafted link
function source() {
  const q = new URLSearchParams(location.search).get('playlist');
  return q !== null && !LIVE ? q : SITE.playlist;
}

const say = (k) => { const s = $('#pl-status'); s.textContent = ''; requestAnimationFrame(() => { s.textContent = t(k); }); };

function render() {
  const n = PLAYLIST.phases.reduce((a, p) => a + p.n, 0);
  $('#pl-count').textContent = t('pl.count', n);
  const list = typeof Intl.ListFormat === 'function'
    ? new Intl.ListFormat(getLang() === 'en' ? 'en-GB' : 'pt-PT', { type: 'conjunction' }).format(PLAYLIST.artists)
    : PLAYLIST.artists.join(', ');
  $('#pl-artists').textContent = t('pl.with', list);
  // the running order drawn like a session profile, one bar per track
  const bars = $('#pl-bars'); bars.textContent = '';
  bars.style.setProperty('--n', n);
  const ul = $('#pl-phases'); ul.textContent = '';
  for (const p of PLAYLIST.phases) {
    for (let i = 0; i < p.n; i++) { const b = document.createElement('i'); b.className = p.k; b.style.height = `${HEIGHTS[p.k] ?? 60}%`; bars.appendChild(b); }
    const li = document.createElement('li'); li.className = p.k;
    const b = document.createElement('b'); b.textContent = String(p.n);
    li.append(pick(p), b); ul.appendChild(li);
  }
  if (frame) frame.title = t('pl.frame', PLAYLIST.name);
  if (state === 'docked') $('#pl-frame').setAttribute('aria-label', t('pl.region'));
}

function load() {
  if (frame) return;
  frame = document.createElement('iframe');
  frame.src = `https://open.spotify.com/embed/${ref.type}/${ref.id}?utm_source=generator&theme=0`;
  frame.title = t('pl.frame', PLAYLIST.name);
  // Spotify's own embed permissions, so its play button works everywhere; nothing plays until it is pressed
  frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
  // focus given before the player loads does not reach its document, so Tab would skip it: hand it over once loaded
  frame.addEventListener('load', (e) => { if (document.activeElement === e.target) e.target.contentWindow?.focus(); }, { once: true });
  $('#pl-frame').prepend(frame);
}

// face: the local cover card · inline: the player in its place · docked: the same iframe, fixed at the bottom.
// The iframe never moves in the DOM (moving it would reload it and cut the music); only its box changes.
function setState(next) {
  state = next;
  const box = $('#pl'), fr = $('#pl-frame');
  box.classList.toggle('inline', next === 'inline');
  box.classList.toggle('docked', next === 'docked');
  document.body.classList.toggle('dock-on', next === 'docked');
  $('#pl-play').hidden = next !== 'face';
  $('#pl-dock').hidden = next !== 'inline';
  $('#pl-undock').hidden = next !== 'docked';
  $('#pl-note').hidden = next !== 'docked';
  $('#pl-x').hidden = next !== 'docked';
  $('#pl-privacy').hidden = next !== 'face';
  if (next === 'docked') { fr.setAttribute('role', 'region'); fr.setAttribute('aria-label', t('pl.region')); } else { fr.removeAttribute('role'); fr.removeAttribute('aria-label'); }
}

export function initPlaylist() {
  const block = $('#ouvir');
  if (!block) return;
  const src = source();
  ref = spotifyRef(src);
  if (!ref) {
    block.hidden = true;
    if (src) console.warn('SITE.playlist: paste the open.spotify.com/playlist/... link from Share > Copy link to playlist.');
    return;
  }
  block.hidden = false;
  $('#pl-open').href = `https://open.spotify.com/${ref.type}/${ref.id}`;
  render();
  onLang(render);
  $('#pl-play').addEventListener('click', () => { load(); setState('inline'); frame.focus({ preventScroll: true }); });
  $('#pl-dock').addEventListener('click', () => { setState('docked'); $('#pl-undock').focus({ preventScroll: true }); say('pl.s.dock'); });
  $('#pl-undock').addEventListener('click', () => { setState('inline'); $('#pl-dock').focus({ preventScroll: true }); say('pl.s.undock'); });
  // closing stops the music: the iframe goes, the cover card comes back
  $('#pl-x').addEventListener('click', () => { frame?.remove(); frame = null; setState('face'); $('#pl-play').focus({ preventScroll: true }); say('pl.s.close'); });
  // the docked player stacks above the package bar of the suit studio, whatever its height
  const pk = $('#package');
  if (pk && 'ResizeObserver' in window) new ResizeObserver(() => document.documentElement.style.setProperty('--pk-h', `${pk.offsetHeight}px`)).observe(pk);
}
