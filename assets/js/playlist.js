// "Ouve o que eu ouço": Gonçalo's Spotify playlist behind a local cover card. Nothing loads from Spotify until
// the visitor asks for the player; it can then dock at the bottom of the screen while the page scrolls.
import { t, pick, onLang, getLang } from './i18n.js';
import { SITE, PLAYLIST } from './data.js';

const $ = (s, r = document) => r.querySelector(s);
// ?playlist= previews only on this computer or the home network (a phone testing the local server), never on a
// public host: gocarmo.com, gocarmo.com. (trailing dot), www, or any mirror
const PREVIEW = /^(localhost|127(\.\d{1,3}){3}|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})$/.test(location.hostname);
const HEIGHTS = { warm: 34, build: 60, peak: 100, cool: 40 };
// the screens where the dock and the package bar together would bury the studio's rate card
const SMALL = matchMedia('(max-width: 760px), (max-height: 480px)');
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let ref = null, state = 'face', frame = null, inStudio = false;

// open.spotify.com links (with or without /intl-xx/ and ?si=...) and spotify: URIs, playlists and tracks only
function spotifyRef(url) {
  const m = String(url || '').trim().match(/^(?:https:\/\/open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(?:embed\/)?|spotify:)(playlist|track)[/:]([A-Za-z0-9]{22})(?:[/?#]|$)/i);
  return m ? { type: m[1].toLowerCase(), id: m[2] } : null;
}
// ?playlist=<link> previews the block before the real link exists; never on a public host, so nobody can
// pass a stranger's playlist off as Gonçalo's with a crafted link
function source() {
  const q = new URLSearchParams(location.search).get('playlist');
  return q !== null && PREVIEW ? q : SITE.playlist;
}

const say = (k) => { const s = $('#pl-status'); s.textContent = ''; requestAnimationFrame(() => { s.textContent = t(k); }); };

function render() {
  const n = PLAYLIST.phases.reduce((a, p) => a + p.n, 0);
  $('#pl-count').textContent = t('pl.count', n);
  const list = typeof Intl.ListFormat === 'function'
    ? new Intl.ListFormat(getLang() === 'en' ? 'en-GB' : 'pt-PT', { type: 'conjunction' }).format(PLAYLIST.artists)
    : PLAYLIST.artists.join(', ');
  $('#pl-artists').textContent = t('pl.with', list);
  // the running order drawn like a session profile, one bar per track, a wider gap where each phase starts
  const bars = $('#pl-bars'); bars.textContent = '';
  const ul = $('#pl-phases'); ul.textContent = '';
  for (const [j, p] of PLAYLIST.phases.entries()) {
    for (let i = 0; i < p.n; i++) { const b = document.createElement('i'); b.className = i === 0 && j > 0 ? `${p.k} cut` : p.k; b.style.height = `${HEIGHTS[p.k] ?? 60}%`; bars.appendChild(b); }
    // the digit is for the eye; a screen reader hears "6 músicas", since the bars it counts are hidden from it
    const li = document.createElement('li'); li.className = p.k;
    const b = document.createElement('b'), d = document.createElement('span'), u = document.createElement('span');
    d.setAttribute('aria-hidden', 'true'); d.textContent = String(p.n);
    u.className = 'sr-only'; u.textContent = t('pl.count', p.n);
    b.append(d, u); li.append(pick(p), b); ul.appendChild(li);
  }
  const key = document.createElement('li'); key.className = 'key'; key.setAttribute('aria-hidden', 'true'); key.textContent = t('pl.key');
  ul.appendChild(key);
  const show = $('#pk-pl'); if (show) { show.setAttribute('aria-label', t('pl.show')); show.title = t('pl.show'); }
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

// the dock steps back in front of the rate card only when the visitor asks for it (the ♪ button on the package bar)
function keep(on) {
  document.body.classList.toggle('pl-keep', on);
  $('#pk-pl')?.setAttribute('aria-pressed', String(on));
}

// face: the local cover card · inline: the player in its place · docked: the same iframe, fixed at the bottom.
// The iframe never moves in the DOM (moving it would reload it and cut the music); only its box changes.
function setState(next) {
  state = next;
  const box = $('#pl'), fr = $('#pl-frame');
  box.classList.toggle('inline', next === 'inline');
  box.classList.toggle('docked', next === 'docked');
  // on <html>, so the root scroller can keep focused controls clear of the dock (scroll-padding-bottom)
  document.documentElement.classList.toggle('dock-on', next === 'docked');
  if (next !== 'docked') keep(false);
  $('#pl-play').hidden = next !== 'face';
  $('#pl-dock').hidden = next !== 'inline';
  $('#pl-undock').hidden = next !== 'docked';
  $('#pl-note').hidden = next !== 'docked';
  $('#pl-x').hidden = next !== 'docked';
  $('#pl-privacy').hidden = next !== 'face';
  if (next === 'docked') { fr.setAttribute('role', 'region'); fr.setAttribute('aria-label', t('pl.region')); } else { fr.removeAttribute('role'); fr.removeAttribute('aria-label'); }
}

// Closing stops the music: the iframe goes, the cover card comes back. Focus that was inside the dock goes back to
// «Ouvir aqui», in view, when the visitor closed it from the keyboard; after a tap or a click it is simply let go,
// so the next Space scrolls the page instead of reloading Spotify off screen. Focus anywhere else stays put.
function close(e) {
  const inside = $('#pl-frame').contains(document.activeElement);
  const keyboard = !e || e.detail === 0;
  if (inside) document.activeElement.blur();
  frame?.remove(); frame = null; setState('face');
  if (inside && keyboard) $('#pl-play').focus();
  say('pl.s.close');
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
  // the package bar gets a ♪ button that brings the tucked dock back (shown only on small screens, in the studio)
  const pk = $('#package');
  if (pk) {
    const show = document.createElement('button');
    show.type = 'button'; show.className = 'btn ghost sm pk-pl'; show.id = 'pk-pl'; show.setAttribute('aria-pressed', 'false');
    show.innerHTML = '<svg aria-hidden="true" focusable="false"><use href="#i-note"/></svg>';
    show.addEventListener('click', () => keep(!document.body.classList.contains('pl-keep')));
    pk.insertBefore(show, $('#pk-clear', pk));
  }
  render();
  onLang(render);
  $('#pl-play').addEventListener('click', () => { load(); setState('inline'); frame.focus({ preventScroll: true }); });
  // the note that appears pushes the buttons down: bring them clear of the dock that just slid in
  $('#pl-dock').addEventListener('click', () => {
    setState('docked');
    $('#pl-undock').focus({ preventScroll: true });
    $('.pl-acts').scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
    say('pl.s.dock');
  });
  $('#pl-undock').addEventListener('click', () => { setState('inline'); $('#pl-dock').focus({ preventScroll: true }); say('pl.s.undock'); });
  $('#pl-x').addEventListener('click', close);
  // Esc closes the docked player from anywhere, unless something else on the page is using Esc right now
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || state !== 'docked' || e.defaultPrevented) return;
    const a = document.activeElement;
    if ($('dialog[open]') || $('.spot-card.open') || $('.nav.open') || /input|textarea|select/i.test(a?.tagName || '')) return;
    // in the studio Esc clears the selected spot
    if (a?.closest('.studio') || (inStudio && (!a || a === document.body) && !$('#spot-detail')?.hidden)) return;
    close();
  });
  // small screens, with a package open in the studio: the dock slides away so the rate card stays usable, and the
  // music plays on; it comes back as soon as the visitor leaves the studio
  const studio = $('.studio');
  if (studio && 'IntersectionObserver' in window) {
    new IntersectionObserver((en) => {
      inStudio = en[0].isIntersecting;
      document.body.classList.toggle('pl-studio', inStudio);
      if (!inStudio) { keep(false); return; }
      // focus on the dock's own controls would vanish with it: hand it to the ♪ button
      if (state === 'docked' && SMALL.matches && document.body.classList.contains('pk-on') && $('#pl-frame').contains(document.activeElement)) $('#pk-pl')?.focus({ preventScroll: true });
    }, { rootMargin: '-40% 0px -40% 0px' }).observe(studio);
  }
  // the docked player stacks above the package bar of the suit studio, whatever its height
  if (pk && 'ResizeObserver' in window) new ResizeObserver(() => document.documentElement.style.setProperty('--pk-h', `${pk.offsetHeight}px`)).observe(pk);
}
