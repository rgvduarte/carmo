// «Quem apoia» (the supporters' wall): the rules shared by the booking Worker (worker/requests.js, bundled by wrangler
// as season-rules.js is), the admin pages (/admin/ and /admin/apoiantes/) and the site (assets/js/apoiantes.js).
// Pure: no DOM, no fetch, no clock, no storage, so Node tests import it as it is.
//
// Owner decisions of 02.11.2026: the names live in the Worker's KV, never in git; every non-anonymous name of the
// GoFundMe list goes in, as «Nome I.» (first name and the initial of the last surname), never an amount, a date or a
// ranking; anonymous donors are always left out; the public block exists from the first published name.

export const SEASON = '2027';      // the season the campaign is for: KV key apo:<SEASON>, gone at contractExpiry(SEASON)
export const MAX = 2000;           // names kept at once (the 3 000 € goal at the 5 € minimum is at most 600 donations)
export const NAME_MIN = 2;         // characters, after normName
export const NAME_MAX = 40;
export const MIN_SHOWN = 1;        // the public block appears from this many published names (owner: from the first)
export const FEW = 12;             // at or below this, the site shows a plain list (no search, no zoom)
export const ID_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ID_RE = /^[2-9A-HJKMNP-Z]{6}$/;
export const STATES = ['espera', 'publicado'];

// NFC, no control or invisible characters, the spaces joined. Names only ever reach the page through textContent,
// so this is about tidiness and dedupe, not about escaping.
export function normName(s) {
  return String(s ?? '').normalize('NFC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '')
    .replace(/[\s\u00a0\u202f]+/g, ' ').trim();
}

// '' when the name can go on the wall, else why not: 'vazio', 'curto', 'longo', 'caracteres' (digits, @, links, <>…:
// a person's name has letters, spaces, an apostrophe, a hyphen or a full stop only), 'letras' (fewer than two letters).
// A short form («Ana M.») is allowed, never forced: a manual add may carry a whole name the person asked for.
const NAME_OK = /^[\p{L}\p{M}][\p{L}\p{M} .'’-]*$/u;
export function nameProblem(raw) {
  const s = normName(raw);
  if (!s) return 'vazio';
  if ([...s].length < NAME_MIN) return 'curto';
  if ([...s].length > NAME_MAX) return 'longo';
  if (!NAME_OK.test(s)) return 'caracteres';
  if ((s.match(/\p{L}/gu) || []).length < 2) return 'letras';
  return '';
}
export const PROBLEM_PT = {
  vazio: 'Escreve um nome.', curto: 'O nome é curto demais.', longo: `O nome tem mais de ${NAME_MAX} caracteres.`,
  caracteres: 'Só letras, espaços, apóstrofo, hífen e ponto (sem algarismos, @ ou links).', letras: 'O nome precisa de letras.',
};

// the key two spellings of one name share: no accents, no case, no punctuation
export function foldKey(s) {
  return normName(s).normalize('NFD').replace(/\p{M}+/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// «ana» / «ANA» -> «Ana», «jean-pierre» -> «Jean-Pierre», «d'almeida» -> «D'Almeida»; a word written in mixed case
// («McDonald») is kept as it is
function cap(word) {
  if (word !== word.toLowerCase() && word !== word.toUpperCase()) return word;
  return word.toLowerCase().replace(/(^|[-'’])(\p{L})/gu, (m, sep, c) => sep + c.toLocaleUpperCase('pt-PT'));
}
// particles that are not the surname a person goes by («Ana da Silva» -> «Ana S.», «Rui dos Santos e Costa» -> «Rui C.»)
const PARTICLES = new Set(['da', 'das', 'de', 'do', 'dos', 'e', 'del', 'della', 'di', 'du', 'van', 'von', 'der', 'den', 'la', 'le', 'y']);
const words = (s) => normName(s).split(' ').filter(Boolean);
const initialOf = (w) => { const c = (w.match(/\p{L}/u) || [''])[0]; return c ? `${c.toLocaleUpperCase('pt-PT')}.` : ''; };

// «Nome I.»: the first word of the first name and the initial of the last surname. A one-word name stays one word.
// An entry already short («Ana M.») keeps its form.
export function shortName(first, last = '') {
  const f = words(first), l = words(last);
  if (!f.length && !l.length) return '';
  let given, rest;
  if (l.length) { given = f.length ? f[0] : l[0]; rest = f.length ? l : l.slice(1); }
  else { given = f[0]; rest = f.slice(1); }
  const sur = rest.filter((w) => !PARTICLES.has(w.toLowerCase()));
  const lastW = sur.length ? sur[sur.length - 1] : '';
  const g = cap(given);
  return lastW ? `${g} ${initialOf(lastW)}`.trim() : g;
}

// GoFundMe and the sheets people keep write an anonymous donation as one of these
const ANON = new Set(['anonimo', 'anonima', 'anonymous', 'anon', 'anonymous donor', 'doador anonimo', 'doadora anonima', 'doacao anonima', 'donativo anonimo', 'sem nome', 'n a', 'na']);
export const isAnonName = (s) => ANON.has(foldKey(s));
// the value of an «anonymous» column that means yes
export const truthy = (v) => /^(1|x|y|s|sim|yes|true|verdadeiro|anonimo|anonima|anonymous|✓|✔)$/.test(foldKey(v).replace(/ /g, '') || String(v ?? '').trim());

const coll = new Intl.Collator('pt-PT', { sensitivity: 'base' });
export const compareNames = (a, b) => coll.compare(a, b);
export function sortNames(list) {
  return [...list].sort((p, q) => coll.compare(p.name, q.name) || (p.id < q.id ? -1 : p.id > q.id ? 1 : 0));
}

// The Worker's private document (KV apo:<season>) -> what the public GET /apoiantes/nomes returns: only published
// names, only { id, name }, A to Z. No state, no count field, no date.
export function publicView(doc) {
  const names = (doc && Array.isArray(doc.names) ? doc.names : [])
    .filter((x) => x && x.state === 'publicado' && typeof x.name === 'string' && typeof x.id === 'string' && !nameProblem(x.name))
    .map((x) => ({ id: x.id, name: normName(x.name) }));
  return { v: 1, names: sortNames(names) };
}
export const isOn = (doc) => publicView(doc).names.length >= MIN_SHOWN;

// the shape of a stored document; problems as text (the Worker repairs nothing, it refuses to write a bad one)
export function checkDoc(doc) {
  const out = [];
  if (!doc || typeof doc !== 'object') return ['not an object'];
  if (doc.v !== 1) out.push('v is not 1');
  if (!Array.isArray(doc.names)) return [...out, 'names is not a list'];
  if (doc.names.length > MAX) out.push(`more than ${MAX} names`);
  const ids = new Set(), keys = new Set();
  doc.names.forEach((x, i) => {
    if (!x || typeof x !== 'object') { out.push(`names[${i}] is not an object`); return; }
    if (!ID_RE.test(x.id || '')) out.push(`names[${i}].id`);
    else if (ids.has(x.id)) out.push(`names[${i}].id repeated`);
    ids.add(x.id);
    if (nameProblem(x.name)) out.push(`names[${i}].name: ${nameProblem(x.name)}`);
    if (!STATES.includes(x.state)) out.push(`names[${i}].state`);
    const k = foldKey(x.name);
    if (keys.has(k)) out.push(`names[${i}].name repeated`);
    keys.add(k);
    const extra = Object.keys(x).filter((k2) => !['id', 'name', 'state'].includes(k2));
    if (extra.length) out.push(`names[${i}] has ${extra.join(', ')}`);
  });
  return out;
}
