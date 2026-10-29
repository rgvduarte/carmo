// The montra editor of «Patrocínios» (/admin/patrocinios/), the rules without the page: which brand a contract card is,
// how many products it may have, the brand entry of data/montra.json it writes, the files a save adds and removes, and
// the commit message. Pure: no DOM, no fetch, no storage and no clock (every function takes the Lisbon day), so Node
// tests it. The file's own rules (shape, windows, limits, checks before publishing) are montra-core.js; the levels of the
// spots are season-rules.js levelOf.
import { LIMIT, LEVELS, SUPPLIER, MAX_SUPPLIER, IMG_DIR, PLACEHOLDER, idOk, fold, counts, isActive, productEnd, photoFiles, checkMontra, spotsHeld } from './montra-core.js';
import { TITLE, levelOf, addDays } from './season-rules.js';

export { LIMIT, SUPPLIER, MAX_SUPPLIER, IMG_DIR };
// a level's rank (the highest wins when a brand has several contracts): the whole suit, Principal, Oficial, Apoio
const RANK = { title: 4, principal: 3, oficial: 2, fornecedor: 1 };
export const LEVEL_PT = { title: 'Title partner', principal: 'Principal', oficial: 'Oficial', fornecedor: 'Apoio', [SUPPLIER]: 'Fornecedor oficial' };
const norm = (s) => fold(s).trim().replace(/\s+/g, ' ');
export const sameBrand = (a, b) => norm(a) === norm(b) && norm(a) !== '';
const isTitleC = (c) => !!c && (c.title === true || (Array.isArray(c.spots) && c.spots.some((s) => s && s.id === TITLE)));
const idsOfC = (c) => (isTitleC(c) ? [TITLE] : (Array.isArray(c?.spots) ? c.spots.map((s) => s && s.id).filter(Boolean) : []));

// ---------- the brand of a contract card ----------
// the contracts of `season` whose brand is `name` (accents, case and spaces do not count)
export function brandOf(contracts, season, name) {
  return (Array.isArray(contracts) ? contracts : []).filter((c) => c && String(c.season) === String(season) && sameBrand(c.brand, name));
}
// the level the spots give a brand in a season: the highest of its contracts (levelOf of each contract's spots when the
// spots file knows them, else the level stored with the contract); '' when none has spots
export function levelFor(contracts, spotsData, season, name) {
  let best = '';
  for (const c of brandOf(contracts, season, name)) {
    const ids = idsOfC(c);
    if (!ids.length) continue;
    const known = ids.every((id) => id === TITLE || (Array.isArray(spotsData?.spots) && spotsData.spots.some((s) => s.id === id)));
    let lv = '';
    try { lv = known ? levelOf(spotsData, ids) : ''; } catch (_) { lv = ''; }
    lv = lv || c.level || '';
    if ((RANK[lv] || 0) > (RANK[best] || 0)) best = lv;
  }
  return best;
}
// every spot id of a brand's contracts in a season (['fato'] for the whole suit)
export function spotsFor(contracts, season, name) {
  const cs = brandOf(contracts, season, name);
  if (cs.some(isTitleC)) return [TITLE];
  return [...new Set(cs.flatMap(idsOfC))];
}
// how many products a brand may have: an official supplier, its agreement's number; otherwise its level's (Apoio and a
// contract without spots: 0). montraBrand: the brand's entry in data/montra.json (or null)
export function limitOf(contracts, spotsData, montraBrand, { season, name } = {}) {
  if (montraBrand && montraBrand.level === SUPPLIER) return Number.isInteger(montraBrand.max) ? Math.max(0, Math.min(MAX_SUPPLIER, montraBrand.max)) : 0;
  const lv = levelFor(contracts, spotsData, season ?? montraBrand?.season, name ?? montraBrand?.name);
  return LIMIT[lv] ?? 0;
}
// the products that count for the limit on Lisbon day `day` (on the site, or still to come)
export function countFor(entry, day) {
  if (!entry || !Array.isArray(entry.products)) return 0;
  return entry.products.filter((p) => p && counts(entry, p, day)).length;
}
// the entry of a brand in a montra file (by id, else by name and season)
export function findBrand(file, { id = '', name = '', season = '' } = {}) {
  const bs = Array.isArray(file?.brands) ? file.brands : [];
  return bs.find((b) => b && id && b.id === id) || bs.find((b) => b && sameBrand(b.name, name) && String(b.season) === String(season)) || null;
}
// the products a brand of a level from spots may still have, from data/spots.json: what the spots it still holds there
// give (none held: 0); null when that file is about another season (it cannot tell)
export function spotsAllow(entry, spotsData) {
  if (!entry || entry.level === SUPPLIER || !spotsData || String(spotsData.season) !== String(entry.season)) return null;
  const held = spotsHeld(entry, spotsData);
  if (!held.length) return 0;
  let lv = '';
  try { lv = levelOf(spotsData, held); } catch (_) { lv = ''; }
  return LIMIT[lv] ?? 0;
}
// the card's line: { n, max, over, text, can: 'products' | 'supplier', entry, level }. over > 0: the brand has more
// products counting than its contracts and its spots allow now (a spot freed in /admin/, a contract deleted, a lower
// level): the line says how many to retire, and the sheet offers it.
export function cardLine({ contracts, spotsData, file, season, name, day }) {
  const entry = findBrand(file, { name, season }), lv = levelFor(contracts, spotsData, season, name);
  const n = countFor(entry, day);
  const out = (max, level, can, text) => {
    const over = Math.max(0, n - max);
    return { n, max, over, level, entry, can, text: over ? `Montra: ${n} de ${max}, retira ${over}` : text };
  };
  if (entry && entry.level === SUPPLIER) {
    const max = limitOf(contracts, spotsData, entry);
    return out(max, SUPPLIER, 'products', `Montra: ${n} de ${max} ${max === 1 ? 'produto' : 'produtos'} · fornecedor oficial`);
  }
  let max = LIMIT[lv] ?? 0;
  const bySpots = spotsAllow(entry, spotsData);
  if (bySpots !== null) max = Math.min(max, bySpots);
  if (max > 0) return out(max, lv, 'products', `Montra: ${n} de ${max} ${max === 1 ? 'produto' : 'produtos'}`);
  if (lv === 'fornecedor') return out(0, lv, 'supplier', 'Montra: não incluída no nível Apoio');
  return out(0, lv, 'supplier', 'Montra: só como fornecedor oficial');
}
// the entry with its products past the first `keep` that count retired on Lisbon day `day`: one whose first day is today
// or later leaves the file (its photo with it, deletesFor), one already on the site ends yesterday, so it is off the
// site and out of the count at once. -> { entry, names: [the products retired, PT] }
export function retireOver(entry, day, keep = 0) {
  if (!entry || !Array.isArray(entry.products)) return { entry, names: [] };
  const y = addDays(day, -1), names = [], products = [];
  let n = 0;
  for (const p of entry.products) {
    if (!p || !counts(entry, p, day) || n++ < keep) { products.push(p); continue; }
    names.push(p.name && p.name.pt ? p.name.pt : p.id);
    if (p.from >= day) continue;
    products.push({ ...p, until: y });
  }
  return { entry: { ...entry, products }, names };
}

// ---------- ids ----------
// a slug: lower case, no accents, hyphens; runs of 4 digits dropped (the page tracker drops such tokens)
export function slugify(s, max = 40) {
  const out = fold(s).replace(/[^a-z0-9]+/g, '-').split('-').filter((w) => w && !/\d{4}/.test(w)).join('-').replace(/^[0-9-]+/, '');
  return out.slice(0, max).replace(/-+$/, '');
}
function unique(base, taken, max) {
  const used = new Set(taken || []);
  if (idOk(base, max) && !used.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const tail = `-${i}`, id = `${base.slice(0, max - tail.length).replace(/-+$/, '')}${tail}`;
    if (idOk(id, max) && !used.has(id)) return id;
  }
  return '';
}
export function brandId(name, taken = []) { return unique(slugify(name, 30) || 'marca', taken, 30); }
// the product id: <brand id>-<product name>, unique in the whole file (taken: every product id of the file)
export function productId(brandIdStr, name, taken = []) {
  const tail = slugify(name, 40) || 'produto';
  const base = slugify(`${brandIdStr}-${tail}`, 40) || `${brandIdStr}`.slice(0, 40);
  return unique(base, taken, 40);
}
export const allProductIds = (file) => (Array.isArray(file?.brands) ? file.brands.flatMap((b) => (Array.isArray(b?.products) ? b.products.map((p) => p && p.id).filter(Boolean) : [])) : []);

// ---------- the brand entry and the file ----------
// a new entry for a contract card's brand: level and spots from its contracts, or an official supplier
export function newEntry({ contracts, spotsData, file, season, name, supplier = null }) {
  const id = brandId(name, (file?.brands || []).map((b) => b && b.id));
  if (supplier) return { id, name: String(name).trim(), season: String(season), level: SUPPLIER, agreement: supplier.agreement, max: supplier.max, products: [] };
  const level = levelFor(contracts, spotsData, season, name);
  return { id, name: String(name).trim(), season: String(season), level, spots: spotsFor(contracts, season, name), max: LIMIT[level] ?? 0, products: [] };
}
// the file with this brand's entry put in place of the one with its id (or added at the end); every other brand as it was.
// entry null with `id`: the brand leaves the file.
export function applyBrand(file, entry, id = entry && entry.id) {
  const brands = Array.isArray(file?.brands) ? file.brands.slice() : [];
  const at = brands.findIndex((b) => b && b.id === id);
  if (!entry) { if (at >= 0) brands.splice(at, 1); }
  else if (at >= 0) brands[at] = entry; else brands.push(entry);
  return { v: 1, brands };
}
// the file as written to the repo: two-space JSON and a final newline (the published empty state is the site builder's
// one line { "v": 1, "brands": [] }, written the same way when the last brand leaves)
export const fileText = (file) => (file && Array.isArray(file.brands) && file.brands.length ? `${JSON.stringify({ v: 1, brands: file.brands }, null, 2)}\n` : '{ "v": 1, "brands": [] }\n');
// the files of a photo (montra-core photoSrc): <base>-600.webp, -1200.webp, -600.jpg, or -600.jpg and -1200.jpg
export const photoPaths = (base, webp) => photoFiles({ photo: { base, webp: webp !== false } });
// the photo files the old entry had and the new one does not (a product deleted, or a photo replaced); paths still named
// by another brand of the file are kept
export function deletesFor(oldEntry, newEntry, file = null) {
  const of = (e) => new Set((e && Array.isArray(e.products) ? e.products : []).flatMap((p) => photoFiles(p)));
  const before = of(oldEntry), after = of(newEntry);
  const others = new Set((Array.isArray(file?.brands) ? file.brands : []).filter((b) => b && b.id !== (oldEntry?.id ?? newEntry?.id)).flatMap((b) => [...of(b)]));
  return [...before].filter((p) => !after.has(p) && !others.has(p));
}
// a stable text of an entry, to see whether it changed (key order as written)
export const entryKey = (e) => JSON.stringify(e ?? null);

// ---------- what the editor refuses before a save ----------
// the editor's own rules on top of checkMontra(): no example brand or shop, the brand's limit on Lisbon day `day`.
// limit: the number of products allowed (limitOf). -> [PT problems]
export function editorProblems(entry, { limit, day, file = null, spotsData = null }) {
  const out = [];
  if (!entry) return out;
  if (PLACEHOLDER.test(String(entry.name || ''))) out.push('Este nome parece de exemplo. Só entram marcas com acordo.');
  const live = countFor(entry, day);
  if (live > limit) out.push(entry.level === SUPPLIER ? `O acordo inclui ${limit} ${limit === 1 ? 'produto' : 'produtos'}. Retira um para pôr outro.`
    : `O nível ${LEVEL_PT[entry.level] || entry.level} inclui ${limit === 1 ? '1 produto' : `até ${limit} produtos`}. Retira um para pôr outro.`);
  // this brand alone (another brand's problem is not this save's), then its ids against the rest of the file
  for (const p of checkMontra({ v: 1, brands: [entry] }, { spots: spotsData, day, levelOf, strict: true })) out.push(p.replace(/^marca 1/, 'Marca'));
  const others = (Array.isArray(file?.brands) ? file.brands : []).filter((b) => b && b.id !== entry.id);
  const theirs = new Set(allProductIds({ brands: others }));
  for (const p of entry.products || []) if (p && theirs.has(p.id)) out.push(`O id «${p.id}» já é de um produto de outra marca.`);
  return [...new Set(out)];
}
// the state chip of a product on Lisbon day `day`: { key, text }
const PT_MON = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
export const ptDay = (day) => { const [, m, d] = String(day).split('-').map(Number); return `${d} ${PT_MON[m - 1] || ''}`.trim(); };
export function productState(entry, p, day) {
  const end = productEnd(entry, p);
  if (isActive(entry, p, day)) return { key: 'on', text: 'No ar' };
  if (p.from > day) return { key: 'soon', text: `A partir de ${ptDay(p.from)}` };
  if (p.until && p.until < `${entry.season}-12-31`) return { key: 'off', text: `Retirado a ${ptDay(p.until)}` };
  return { key: 'off', text: `Acabou a ${ptDay(end)}` };
}
// a product can be deleted (and its photo files with it) only while it was never on the site
export const canDelete = (p, day) => !!p && p.from > day;

// ---------- the commit message ----------
// changes: [{ op: 'add' | 'edit' | 'retire' | 'delete' | 'order' | 'supplier', name }]
export function commitMessage(brandName, changes) {
  const xs = Array.isArray(changes) ? changes : [];
  const names = [...new Set(xs.filter((c) => c.name).map((c) => c.name))];
  if (xs.length === 1 && xs[0].op === 'retire') return `Montra: ${brandName}, retirado «${xs[0].name}» (admin)`;
  if (xs.length === 1 && xs[0].op === 'delete') return `Montra: ${brandName}, apagado «${xs[0].name}» (admin)`;
  if (xs.length === 1 && xs[0].op === 'supplier') return `Montra: ${brandName}, fornecedor oficial (admin)`;
  if (xs.length && xs.every((c) => c.op === 'order')) return `Montra: ${brandName}, ordem dos produtos (admin)`;
  if (names.length === 1) return `Montra: ${brandName}, produto «${names[0]}» (admin)`;
  if (names.length > 1) return `Montra: ${brandName}, ${names.length} produtos (admin)`;
  return `Montra: ${brandName} (admin)`;
}

// ---------- the live check ----------
// the brand's entry as the site serves it equals what was saved
export const liveHas = (liveFile, entry) => entryKey(findBrand(liveFile, { id: entry.id })) === entryKey(entry);
export const LEVEL_ORDER = LEVELS;
