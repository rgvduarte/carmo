// The showcase «O meu material» (data/montra.json): the rules, in one place for the home page (montra.js), the admin
// editor (Patrocínios) and scripts/stamp.mjs. It imports nothing, touches no DOM and never reads the clock (every
// function takes the Lisbon day), so stamp.mjs can load it through a data: URL.
//
// The file: { "v": 1, "brands": [ { id, name, season, level, spots | agreement, max, products: [ { id, name {pt,en},
// line {pt,en}, alt? {pt,en}, photo { base, webp }, url, code?, codeNote? {pt,en}, featured?, from, until? } ] } ] }.
// The published state with no partner is { "v": 1, "brands": [] }: the home page then shows nothing of the showcase.
//
// - level: 'title' (the whole suit), 'principal', 'oficial' (from the brand's spots, season-rules.js levelOf), or
//   'fornecedor-oficial', a brand that sponsors with product under a written agreement (the tier key 'fornecedor' in
//   data/spots.json is the Apoio level, which has no showcase). Products allowed: LIMIT, or the agreement's number.
// - A product is on the site on Lisbon day d when from <= d <= end, end = until or 31 December of the brand's season,
//   whichever comes first. It counts for the limit while end >= d (on the site or still to come).
// - Ids are lower-case slugs with no run of four digits (the page tracker drops such tokens: «gel-2027» would never be
//   counted). The product id is the utm_content of its shop link and the `prod` of its click events.
// - The page adds the tag to every shop link: utm_source=gocarmo, utm_medium=montra, utm_campaign=<season>,
//   utm_content=<product id> (any utm_* already in the link is removed; the other parameters and the fragment stay).
// - A product id starts with its brand's id and a hyphen («marca-gel»): the stats Worker drops a click whose product is
//   not of the brand it names, and the admin panel counts only the pairs this file has.
// - The Title partner has at most one product «em destaque»: the page shows it first, as the wide card.
// - On the page, a brand of a level from spots shows only while data/spots.json of its season has those spots sold to it
//   (activeProducts with `spots`): freeing a spot in /admin/ takes its products off at once.
// Guards against example brands live in checkMontra(strict) and the editor, not in the page: the owner's local preview
// renders a fixture with the real code.

export const MONTRA_PATH = 'data/montra.json';
export const IMG_DIR = 'assets/img/montra';
export const LIMIT = Object.freeze({ oficial: 1, principal: 3, title: 6 });
export const LEVELS = Object.freeze(['title', 'principal', 'oficial', 'fornecedor-oficial']);   // the section's order
export const SUPPLIER = 'fornecedor-oficial';
export const MAX_SUPPLIER = 6;
export const ID_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const CODE_RE = /^[A-Z0-9][A-Z0-9-]{2,19}$/;
// names of example, sample or test brands and products (also «Marca X», «Brand B», a lone letter after the word). The
// word edges are Unicode-aware: «a marca dá» or «Marca Ávila» is not «marca d» / «marca á».
export const PLACEHOLDER = /(?<![\p{L}\p{N}])(exemplo|exemplar|example|sample|amostra|placeholder|teste?s?|demo|dummy|fake|fict[ií]ci[ao]|gen[eé]ric[oa]|generic|lorem|ipsum|acme|marca \p{L}|brand \p{L})(?![\p{L}\p{N}])/iu;
export const BASE_RE = /^assets\/img\/montra\/[a-z0-9-]{1,60}$/;
// hosts that are never a real shop
export const FAKE_HOST = /(^|\.)(localhost|example\.(com|org|net|pt)|test|example|invalid|local)$/i;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// the same fold as admin-contracts.js: brand names are matched without accents and case
export const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
export const idOk = (s, max = 40) => typeof s === 'string' && s.length <= max && ID_RE.test(s) && !/\d{4}/.test(s);
const isDay = (s) => {
  const m = DAY_RE.exec(String(s ?? ''));
  if (!m) return false;
  const t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return t.getUTCFullYear() === +m[1] && t.getUTCMonth() === +m[2] - 1 && t.getUTCDate() === +m[3];
};
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const okLen = (v, max) => typeof v === 'string' && v.trim().length >= 1 && v.trim().length <= max;
const seasonEnd = (season) => `${season}-12-31`;

// ---------- reading the file (the page): what is malformed is dropped; never throws ----------
function pair(o, max, fallback = null) {
  if (!isObj(o)) return fallback;
  const pt = str(o.pt), en = str(o.en);
  if (!pt || pt.length > max || en.length > max) return fallback;
  return { pt, en: en || pt };
}
function product(p, season) {
  if (!isObj(p) || !idOk(p.id)) return null;
  const name = pair(p.name, 60), line = pair(p.line, 140);
  if (!name || !line) return null;
  const photo = isObj(p.photo) && BASE_RE.test(str(p.photo.base)) ? { base: str(p.photo.base), webp: p.photo.webp !== false } : null;
  if (!photo) return null;
  if (!shopUrl(p.url, { season, id: p.id })) return null;
  if (!isDay(p.from) || (p.until !== undefined && p.until !== null && p.until !== '' && !isDay(p.until))) return null;
  const code = typeof p.code === 'string' && CODE_RE.test(p.code.trim()) ? p.code.trim() : '';
  const out = { id: p.id, name, line, alt: pair(p.alt, 140), photo, url: str(p.url), code, codeNote: code ? pair(p.codeNote, 60) : null,
    featured: p.featured === true, from: p.from };
  if (isDay(p.until)) out.until = p.until;
  return out;
}
export function parseMontra(json) {
  try {
    const d = typeof json === 'string' ? JSON.parse(json) : json;
    if (!isObj(d) || d.v !== 1 || !Array.isArray(d.brands)) return null;
    const brands = [], bIds = new Set(), pIds = new Set();
    for (const b of d.brands) {
      if (!isObj(b) || !idOk(b.id, 30) || bIds.has(b.id) || !okLen(b.name, 60) || !/^\d{4}$/.test(String(b.season ?? '')) || !LEVELS.includes(b.level)) continue;
      const season = String(b.season), products = [];
      for (const p of Array.isArray(b.products) ? b.products : []) {
        const x = product(p, season);
        if (x && !pIds.has(x.id)) { pIds.add(x.id); products.push(x); }
      }
      bIds.add(b.id);
      const out = { id: b.id, name: str(b.name), season, level: b.level, max: Number.isInteger(b.max) ? b.max : null, products };
      if (Array.isArray(b.spots)) out.spots = b.spots.filter((s) => typeof s === 'string');
      if (isDay(b.agreement)) out.agreement = b.agreement;
      brands.push(out);
    }
    return { v: 1, brands };
  } catch (_) { return null; }
}

// ---------- the windows ----------
// the last day a product is on the site: its until, or 31 December of the brand's season, whichever comes first
export function productEnd(brand, p) {
  const end = seasonEnd(brand.season);
  return isDay(p.until) && p.until < end ? p.until : end;
}
// the spots data/spots.json shows sold to this brand, of its own spots (['fato'] when the whole suit is); [] when the
// file is about another season or the brand is an official supplier (no spots)
export function spotsHeld(brand, spots) {
  if (!brand || brand.level === SUPPLIER || !Array.isArray(brand.spots) || !isObj(spots) || String(spots.season) !== String(brand.season)) return [];
  const me = fold(brand.name).trim().replace(/\s+/g, ' ');
  const mine = (x) => !!x && x.status === 'sold' && fold(x.brand).trim().replace(/\s+/g, ' ') === me;
  if (brand.spots.includes('fato')) return mine(spots.title) ? ['fato'] : [];
  const list = Array.isArray(spots.spots) ? spots.spots : [];
  return brand.spots.filter((id) => mine(list.find((x) => x && x.id === id)));
}
export const isActive = (brand, p, day) => isDay(p.from) && p.from <= day && day <= productEnd(brand, p);
// counts for the limit: on the site now or still to come
export const counts = (brand, p, day) => productEnd(brand, p) >= day;
// the number of products a brand may have on the site: its level's, or the agreement's for an official supplier (and the
// file's max when lower)
export function limitOf(brand) {
  const cap = brand.level === SUPPLIER ? MAX_SUPPLIER : LIMIT[brand.level] ?? 0;
  const m = Number.isInteger(brand.max) ? brand.max : brand.level === SUPPLIER ? 0 : cap;
  return Math.max(0, Math.min(m, cap));
}
// what the section shows on Lisbon day `day`: [{ brand, product, featured }], the whole suit's brand first, then
// Principal, Oficial and the official suppliers; inside a level, the file's order of brands and of products; at most
// limitOf(brand) per brand. Only the first featured product of the whole suit's brand is featured, and it goes first.
// opts.spots (the page's data/spots.json): a brand of a level from spots, of the season that file is about, shows only
// the spots it still holds there allow (none held: nothing; fewer: the lower level's limit, with opts.levelOf); null
// (the file could not be read): no brand of a level from spots shows. Left out: no such check (the tests, the editor).
export function activeProducts(data, day, opts = {}) {
  const out = [];
  if (!data || !Array.isArray(data.brands) || !isDay(day)) return out;
  const brands = data.brands.map((b, i) => [b, i]).filter(([b]) => LEVELS.includes(b.level))
    .sort((a, b) => LEVELS.indexOf(a[0].level) - LEVELS.indexOf(b[0].level) || a[1] - b[1]).map(([b]) => b);
  const check = 'spots' in opts, spots = opts.spots;
  for (const brand of brands) {
    let cap = limitOf(brand);
    if (check && brand.level !== SUPPLIER) {
      if (!isObj(spots)) continue;
      if (String(spots.season) === String(brand.season)) {
        const held = spotsHeld(brand, spots);
        if (!held.length) continue;
        if (typeof opts.levelOf === 'function' && held.length < (brand.spots || []).length) {
          let lv = '';
          try { lv = opts.levelOf(spots, held); } catch (_) { lv = ''; }
          cap = Math.min(cap, LIMIT[lv] ?? 0);
        }
      }
    }
    const mine = [];
    for (const product of brand.products || []) {
      if (mine.length >= cap) break;
      if (isActive(brand, product, day)) mine.push(product);
    }
    const f = brand.level === 'title' ? mine.findIndex((p) => p.featured === true) : -1;
    if (f > 0) mine.unshift(mine.splice(f, 1)[0]);
    mine.forEach((product, i) => out.push({ brand, product, featured: f >= 0 && i === 0 }));
  }
  return out;
}

// ---------- the shop link with the gocarmo tag ----------
// https only, never a link back to gocarmo.com, no user:password; every utm_* already there goes, the other parameters
// and the fragment stay as written. '' when refused.
export function shopUrl(url, { season, id } = {}) {
  let u;
  try { u = new URL(String(url ?? '').trim()); } catch (_) { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) return '';
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (host === 'gocarmo.com' || host.endsWith('.gocarmo.com')) return '';
  // a shop is a domain name: never an IP address, a single label (an intranet name) or a name without a real TLD
  if (/^\d+(\.\d+){3}$/.test(host) || host.startsWith('[') || !/\.([a-z]{2,}|xn--[a-z0-9-]+)$/.test(host)) return '';
  if (!/^\d{4}$/.test(String(season ?? '')) || !idOk(id)) return '';
  const keep = u.search.replace(/^\?/, '').split('&').filter((kv) => {
    if (!kv) return false;
    let k = kv.split('=')[0];
    try { k = decodeURIComponent(k.replace(/\+/g, ' ')); } catch (_) { /* keep the raw key */ }
    return !/^utm_/i.test(k);
  });
  keep.push('utm_source=gocarmo', 'utm_medium=montra', `utm_campaign=${season}`, `utm_content=${id}`);
  return `${u.origin}${u.pathname}?${keep.join('&')}${u.hash}`;
}

// ---------- the photo files ----------
// <base>-600.webp and -1200.webp (when webp), <base>-600.jpg always, <base>-1200.jpg only when there is no WebP (a phone
// whose browser cannot write WebP); all 4:5 (600×750, 1200×1500)
export function photoSrc(p) {
  const base = p && p.photo && p.photo.base;
  if (!BASE_RE.test(String(base || ''))) return null;
  const webp = p.photo.webp !== false;
  return { webp600: webp ? `${base}-600.webp` : '', webp1200: webp ? `${base}-1200.webp` : '', jpg600: `${base}-600.jpg`, jpg1200: webp ? '' : `${base}-1200.jpg` };
}
export function photoFiles(p) {
  const s = photoSrc(p);
  return s ? [s.webp600, s.webp1200, s.jpg600, s.jpg1200].filter(Boolean) : [];
}

// ---------- checking the file before it is published (stamp.mjs, the editor, the tests) ----------
// [] when the file is fine. strict (the default): no example or placeholder brand, product or shop, and a brand of a
// level from spots must hold those spots, sold to it, in data/spots.json of its season, at that level. levelOf:
// season-rules.js levelOf (spots data, ids) -> level.
const BRAND_KEYS = ['id', 'name', 'season', 'level', 'spots', 'agreement', 'max', 'products'];
const PRODUCT_KEYS = ['id', 'name', 'line', 'alt', 'photo', 'url', 'code', 'codeNote', 'featured', 'from', 'until'];
export function checkMontra(data, { spots = null, day = '', levelOf = null, strict = true } = {}) {
  const out = [], bad = (m) => out.push(m);
  if (!isObj(data)) return ['data/montra.json: não é um objeto JSON'];
  if (data.v !== 1) bad('data/montra.json: "v" tem de ser 1');
  for (const k of Object.keys(data)) if (k !== 'v' && k !== 'brands') bad(`data/montra.json: chave desconhecida «${k}»`);
  if (!Array.isArray(data.brands)) { bad('data/montra.json: "brands" tem de ser uma lista'); return out; }
  const bIds = new Set(), pIds = new Set();
  const textPair = (o, max, what, need = true) => {
    if (o === undefined || o === null) { if (need) bad(`${what}: em falta (pt e en)`); return; }
    if (!isObj(o)) { bad(`${what}: tem de ter pt e en`); return; }
    for (const k of Object.keys(o)) if (k !== 'pt' && k !== 'en') bad(`${what}: chave desconhecida «${k}»`);
    for (const l of ['pt', 'en']) if (!okLen(o[l], max)) bad(`${what}.${l}: tem de ter de 1 a ${max} caracteres`);
  };
  data.brands.forEach((b, bi) => {
    const where = `marca ${bi + 1}${isObj(b) && b.name ? ` («${b.name}»)` : ''}`;
    if (!isObj(b)) { bad(`${where}: não é um objeto`); return; }
    for (const k of Object.keys(b)) if (!BRAND_KEYS.includes(k)) bad(`${where}: chave desconhecida «${k}»`);
    if (!idOk(b.id, 30)) bad(`${where}: id «${b.id ?? ''}» inválido (letras minúsculas, números e hífenes, até 30, sem 4 algarismos seguidos)`);
    else if (bIds.has(b.id)) bad(`${where}: id «${b.id}» repetido`);
    else bIds.add(b.id);
    if (!okLen(b.name, 60)) bad(`${where}: nome da marca com 1 a 60 caracteres`);
    const season = String(b.season ?? '');
    if (!/^\d{4}$/.test(season)) bad(`${where}: season tem de ser um ano («2027»)`);
    if (!LEVELS.includes(b.level)) { bad(`${where}: level tem de ser ${LEVELS.join(', ')}`); return; }
    const supplier = b.level === SUPPLIER;
    if (supplier) {
      if (!isDay(b.agreement)) bad(`${where}: fornecedor oficial sem o dia do acordo escrito (agreement)`);
      if (!Number.isInteger(b.max) || b.max < 1 || b.max > MAX_SUPPLIER) bad(`${where}: max tem de ser o número de produtos do acordo, de 1 a ${MAX_SUPPLIER}`);
      if (b.spots !== undefined) bad(`${where}: um fornecedor oficial não tem spots`);
    } else {
      if (!Number.isInteger(b.max) || b.max < 1 || b.max > LIMIT[b.level]) bad(`${where}: max tem de ser de 1 a ${LIMIT[b.level]} no nível ${b.level}`);
      if (!Array.isArray(b.spots) || !b.spots.length || b.spots.some((s) => typeof s !== 'string')) bad(`${where}: spots tem de ter os espaços da marca`);
      else if (b.level === 'title' && !(b.spots.length === 1 && b.spots[0] === 'fato')) bad(`${where}: no nível title, spots é ["fato"]`);
      else if (b.level !== 'title' && b.spots.includes('fato')) bad(`${where}: "fato" só no nível title`);
      if (b.agreement !== undefined) bad(`${where}: agreement só para fornecedor oficial`);
    }
    if (strict && (PLACEHOLDER.test(String(b.name || '')) || PLACEHOLDER.test(String(b.id || '').replace(/-/g, ' ')))) bad(`${where}: parece uma marca de exemplo; só entram marcas com acordo`);
    // the spots: sold to this brand in data/spots.json, at this level, while any of its products counts (on the site or
    // to come; a brand whose products are all over may keep spots it no longer holds, for the reports). A brand of
    // another season has no agreement the file can show: it may stay only while none of its products counts.
    const counting = Array.isArray(b.products) && b.products.some((p) => isObj(p) && isDay(p.from) && (!isDay(day) || counts({ season }, p, day)));
    if (strict && !supplier && spots && String(spots.season) !== season && counting) {
      bad(`${where}: a época ${season} não é a de data/spots.json (${spots.season}); só entram espaços vendidos nesta época`);
    }
    if (strict && !supplier && spots && Array.isArray(b.spots) && String(spots.season) === season && counting) {
      const me = fold(b.name);
      for (const id of b.spots) {
        if (id === 'fato') {
          const tt = spots.title || {};
          if (!(tt.status === 'sold' && fold(tt.brand) === me)) bad(`${where}: o fato completo não está vendido a esta marca em data/spots.json`);
          continue;
        }
        const s = Array.isArray(spots.spots) ? spots.spots.find((x) => x && x.id === id) : null;
        if (!s) bad(`${where}: o espaço «${id}» não existe em data/spots.json`);
        else if (!(s.status === 'sold' && fold(s.brand) === me)) bad(`${where}: o espaço «${id}» não está vendido a esta marca em data/spots.json`);
      }
      if (typeof levelOf === 'function') {
        let lv = '';
        try { lv = levelOf(spots, b.spots); } catch (_) { lv = ''; }
        if (lv !== b.level) bad(`${where}: os espaços dão o nível «${lv || '?'}», não «${b.level}»`);
      }
    }
    if (!Array.isArray(b.products)) { bad(`${where}: products tem de ser uma lista`); return; }
    let live = 0, feat = 0;
    b.products.forEach((p, pi) => {
      const pw = `${where}, produto ${pi + 1}${isObj(p) && isObj(p.name) && p.name.pt ? ` («${p.name.pt}»)` : ''}`;
      if (!isObj(p)) { bad(`${pw}: não é um objeto`); return; }
      for (const k of Object.keys(p)) if (!PRODUCT_KEYS.includes(k)) bad(`${pw}: chave desconhecida «${k}»`);
      if (!idOk(p.id)) bad(`${pw}: id «${p.id ?? ''}» inválido (letras minúsculas, números e hífenes, até 40, sem 4 algarismos seguidos)`);
      else if (pIds.has(p.id)) bad(`${pw}: id «${p.id}» repetido no ficheiro`);
      else pIds.add(p.id);
      if (idOk(p.id) && idOk(b.id, 30) && !p.id.startsWith(`${b.id}-`)) bad(`${pw}: o id «${p.id}» tem de começar por «${b.id}-» (o id da marca)`);
      textPair(p.name, 60, `${pw}: name`);
      textPair(p.line, 140, `${pw}: line`);
      textPair(p.alt, 140, `${pw}: alt`, false);
      if (!isObj(p.photo) || !BASE_RE.test(String(p.photo.base || '')) || typeof p.photo.webp !== 'boolean'
        || Object.keys(p.photo).some((k) => k !== 'base' && k !== 'webp')) bad(`${pw}: photo tem de ser { base: "${IMG_DIR}/…", webp: true|false }`);
      const raw = String(p.url ?? '');
      if (!shopUrl(raw, { season: /^\d{4}$/.test(season) ? season : '2027', id: idOk(p.id) ? p.id : 'x' })) bad(`${pw}: o link da loja tem de ser https e não pode ser do gocarmo.com`);
      else {
        if (/[?&]utm_/i.test(raw)) bad(`${pw}: o link da loja vai sem utm_ (o site junta a etiqueta gocarmo)`);
        if (strict) {
          let host = '';
          try { host = new URL(raw).hostname; } catch (_) { host = ''; }
          if (FAKE_HOST.test(host) || PLACEHOLDER.test(host.replace(/[.-]/g, ' '))) bad(`${pw}: o link da loja parece de exemplo («${host}»)`);
        }
      }
      if (p.code !== undefined) {
        if (typeof p.code !== 'string' || !CODE_RE.test(p.code)) bad(`${pw}: código de desconto em maiúsculas, números e hífenes (3 a 20)`);
        if (p.codeNote === undefined) bad(`${pw}: um código precisa da nota (codeNote pt e en, por exemplo «10% na primeira compra»)`);
      }
      if (p.codeNote !== undefined) {
        if (p.code === undefined) bad(`${pw}: codeNote sem código`);
        textPair(p.codeNote, 60, `${pw}: codeNote`);
      }
      if (p.featured !== undefined && typeof p.featured !== 'boolean') bad(`${pw}: featured é true ou false`);
      if (p.featured === true && b.level !== 'title') bad(`${pw}: em destaque só no nível title (o fato completo)`);
      if (!isDay(p.from)) bad(`${pw}: from tem de ser uma data AAAA-MM-DD`);
      else if (/^\d{4}$/.test(season) && (p.from > seasonEnd(season) || p.from < `${+season - 1}-01-01`)) bad(`${pw}: from fora da época ${season}`);
      if (p.until !== undefined) {
        if (!isDay(p.until)) bad(`${pw}: until tem de ser uma data AAAA-MM-DD`);
        else {
          if (isDay(p.from) && p.until < p.from) bad(`${pw}: until antes de from`);
          if (/^\d{4}$/.test(season) && p.until > seasonEnd(season)) bad(`${pw}: until depois do fim da época (${seasonEnd(season)})`);
        }
      }
      if (strict) {
        const names = [p.id, isObj(p.name) ? p.name.pt : '', isObj(p.name) ? p.name.en : '', isObj(p.codeNote) ? p.codeNote.pt : '', isObj(p.codeNote) ? p.codeNote.en : '']
          .map((x) => String(x || '').replace(/-/g, ' '));
        if (names.some((x) => PLACEHOLDER.test(x))) bad(`${pw}: parece um produto de exemplo`);
      }
      const on = /^\d{4}$/.test(season) && isDay(p.from) && (!isDay(day) || counts({ season }, p, day));
      if (on && isDay(day)) live++;
      if (on && p.featured === true) feat++;
    });
    const cap = limitOf({ level: b.level, max: Number.isInteger(b.max) ? b.max : (supplier ? 0 : LIMIT[b.level]) });
    if (live > cap) bad(`${where}: ${live} produtos na montra, o limite é ${cap}`);
    if (feat > 1) bad(`${where}: ${feat} produtos em destaque; só um produto em destaque por marca`);
  });
  return out;
}
