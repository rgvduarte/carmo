// The sponsorship terms (/condicoes/) as data, for the annex of the PDFs (the booking comprovativo, receipt.js, and the
// sponsorship confirmation, admin-confirm-pdf.js; both lay it out with assets/js/pdf-annex.js). Called by
// scripts/stamp.mjs, which writes and checks:
//
// - assets/js/terms-text.js (GENERATED, never edited by hand): TERMS_DATE (seasonRules.termsDate), TERMS_URL and TERMS,
//   the text of the two <article>s of condicoes/index.html (PT and EN) as structured blocks: the summary, headings,
//   paragraphs, lists and the season discount table, with bold runs, links and in-page references. Loaded only when a
//   PDF is made (receipt.js imports it; receipt.js itself loads on the first «Guardar comprovativo» press).
// - data/terms/<date>.json: the text of an older version, frozen here the moment seasonRules.termsDate moves on and
//   never rewritten. A confirmation follows the version of its request (the contract's «terms» date), not today's.
//
// It stops stamp when: the page holds markup the annex cannot lay out (a new tag is a conscious change: teach this file
// and pdf-annex.js); a word of the page is missing from the blocks; the page's «Atualizada a» / «Updated» is not
// seasonRules.termsDate; the text changed after the version's own day without a new date (each sponsorship follows the
// version of its request day, so one date never names two texts once that day is over); the module on disk has a date
// after termsDate; an archive file is malformed, is not older than termsDate, or would be overwritten with another text.
//
//   termsText({ check, rules, today }) -> { problems: [], stale: [] }   (stamp.mjs)
//   parseTerms(html) -> { pt, en }; plainArticle(html, lang); plainBlocks(doc); moduleSource(doc, date)   (tests)
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';

export const MODULE = 'assets/js/terms-text.js';
export const PAGE = 'condicoes/index.html';
export const ARCHIVE = 'data/terms';
const SITE = 'https://gocarmo.com/condicoes/';
export const TERMS_URL = { pt: SITE, en: `${SITE}?lang=en` };

// ---------- the page's markup ----------
const ENT = { nbsp: '\u00a0', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const dec = (s, where) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);?/gi, (m, e) => {
  if (!m.endsWith(';')) throw new Error(`${where}: «${m}» without its «;»`);
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
  if (!(e in ENT)) throw new Error(`${where}: the entity ${m} is not known to scripts/terms-text.mjs`);
  return ENT[e];
});
// what the annex lays out; any other tag stops stamp
const BLOCK = new Set(['p', 'h1', 'h2', 'section', 'ul', 'li', 'table', 'thead', 'tbody', 'tr', 'th', 'td']), INLINE = new Set(['strong', 'a']);
function tree(html, where) {
  const root = { tag: '#root', a: {}, kids: [] }, stack = [root];
  for (const m of html.replace(/<!--[\s\S]*?-->/g, '').matchAll(/<(\/?)([a-z][a-z0-9]*)((?:\s+[^>]*)?)>|([^<]+)|(<)/gi)) {
    if (m[5]) throw new Error(`${where}: a stray «<»`);
    if (m[4] !== undefined) { stack.at(-1).kids.push(dec(m[4], where)); continue; }
    const [, close, tag, attrs] = m, t = tag.toLowerCase();
    if (!BLOCK.has(t) && !INLINE.has(t)) throw new Error(`${where}: <${t}> is not laid out by the PDF annex: teach scripts/terms-text.mjs and assets/js/pdf-annex.js`);
    if (close) {
      const top = stack.pop();
      if (top.tag !== t) throw new Error(`${where}: </${t}> closes <${top.tag}>`);
      continue;
    }
    if (/\/\s*$/.test(attrs)) throw new Error(`${where}: <${t}/> (a self-closing tag)`);
    const a = Object.fromEntries([...attrs.matchAll(/([a-z-]+)="([^"]*)"/gi)].map((x) => [x[1].toLowerCase(), dec(x[2], where)]));
    const el = { tag: t, a, kids: [] };
    stack.at(-1).kids.push(el); stack.push(el);
  }
  if (stack.length !== 1) throw new Error(`${where}: <${stack.at(-1).tag}> is never closed`);
  return root;
}
export function articleHtml(html, lang) {
  const a = html.match(new RegExp(`<article\\b[^>]*data-l="${lang}"[^>]*>([\\s\\S]*?)</article>`));
  if (!a) throw new Error(`${PAGE}: no <article data-l="${lang}">`);
  return a[1];
}
const ws = (s) => s.replace(/[ \t\r\n]+/g, ' ');
const text = (el) => (typeof el === 'string' ? el : el.kids.map(text).join(''));
const flat = (el) => ws(text(el)).trim();
// the element children of el (text between them must be blank)
function kidsEl(el, where) {
  return el.kids.filter((k) => typeof k !== 'string' || k.trim()).map((k) => {
    if (typeof k === 'string') throw new Error(`${where}: text «${k.trim().slice(0, 40)}» directly in <${el.tag}>`);
    return k;
  });
}
// inline content -> runs: 'text' | { b: 'text' } | { a: 'text', href } | { x: 'text', to: 'id' }
function runs(el, lang, where) {
  const out = [];
  const push = (r) => { if (typeof r === 'string' && typeof out.at(-1) === 'string') out[out.length - 1] += r; else out.push(r); };
  for (const k of el.kids) {
    if (typeof k === 'string') { push(ws(k)); continue; }
    if (!INLINE.has(k.tag)) throw new Error(`${where}: <${k.tag}> inside <${el.tag}> is not laid out by the PDF annex: teach scripts/terms-text.mjs`);
    if (k.kids.some((x) => typeof x !== 'string')) throw new Error(`${where}: <${k.tag}> with markup inside it`);
    const t = ws(text(k));
    if (k.tag === 'strong') { push({ b: t }); continue; }
    const h = k.a.href || '';
    if (!h) throw new Error(`${where}: <a> without href`);
    if (h.startsWith('#')) { push({ x: t, to: h.slice(1) }); continue; }
    const u = new URL(h, SITE);
    if (!/^(https|mailto):$/.test(u.protocol)) throw new Error(`${where}: the link ${h} is not https: or mailto:`);
    // a page of this site from the English text opens in English
    if (lang === 'en' && u.hostname === 'gocarmo.com' && !u.search) u.search = '?lang=en';
    push({ a: t, href: u.href });
  }
  // the ends trimmed, the blanks around a run kept inside the text runs
  if (typeof out[0] === 'string') out[0] = out[0].replace(/^ +/, '');
  if (typeof out.at(-1) === 'string') out[out.length - 1] = out.at(-1).replace(/ +$/, '');
  return out.filter((r) => r !== '');
}
function table(el, where) {
  const head = [], rows = [];
  for (const sec of kidsEl(el, where)) {
    if (sec.tag !== 'thead' && sec.tag !== 'tbody') throw new Error(`${where}: <${sec.tag}> in <table>`);
    for (const tr of kidsEl(sec, where)) {
      if (tr.tag !== 'tr') throw new Error(`${where}: <${tr.tag}> in <${sec.tag}>`);
      const cells = kidsEl(tr, where).map((c) => {
        if (c.tag !== 'td' && c.tag !== 'th') throw new Error(`${where}: <${c.tag}> in <tr>`);
        if (c.kids.some((x) => typeof x !== 'string')) throw new Error(`${where}: markup inside a table cell`);
        return flat(c);
      });
      (sec.tag === 'thead' ? head : rows).push(cells);
    }
  }
  if (head.length !== 1 || !rows.length || rows.some((r) => r.length !== head[0].length)) throw new Error(`${where}: the table needs one header row and rows of the same width`);
  return { head: head[0], rows };
}
function li(el, lang, where) {
  if (el.tag !== 'li') throw new Error(`${where}: <${el.tag}> in a list`);
  const tbl = el.kids.filter((k) => typeof k !== 'string' && k.tag === 'table');
  if (!tbl.length) return runs(el, lang, where);
  if (tbl.length > 1 || el.kids.indexOf(tbl[0]) < el.kids.findLastIndex((k) => typeof k !== 'string' || k.trim())) throw new Error(`${where}: a table can only end a list item`);
  return { r: runs({ tag: 'li', kids: el.kids.filter((k) => k !== tbl[0]) }, lang, where), table: table(tbl[0], where) };
}
function article(html, lang) {
  const where = `${PAGE} (${lang})`, out = { title: '', h1: '', lead: '', updated: '', blocks: [] };
  for (const el of kidsEl(tree(articleHtml(html, lang), where), where)) {
    const cls = el.a.class || '';
    if (el.tag === 'p' && /\beyebrow\b/.test(cls)) out.title = flat(el);
    else if (el.tag === 'h1') out.h1 = flat(el);
    else if (el.tag === 'p' && /\blead\b/.test(cls)) out.lead = flat(el);
    else if (el.tag === 'p' && /\blegal-date\b/.test(cls)) out.updated = flat(el);
    else if (el.tag === 'section') {
      const [h, ul, ...rest] = kidsEl(el, where);
      if (!h || h.tag !== 'h2' || !ul || ul.tag !== 'ul' || rest.length) throw new Error(`${where}: the summary <section> must hold one <h2> and one <ul>`);
      out.blocks.push({ k: 'sum', h: flat(h), items: kidsEl(ul, where).map((x) => li(x, lang, where)) });
    } else if (el.tag === 'h2') out.blocks.push({ k: 'h2', ...(el.a.id ? { id: el.a.id } : {}), t: flat(el) });
    else if (el.tag === 'p') out.blocks.push({ k: 'p', r: runs(el, lang, where) });
    else if (el.tag === 'ul') out.blocks.push({ k: 'ul', items: kidsEl(el, where).map((x) => li(x, lang, where)) });
    else throw new Error(`${where}: <${el.tag}> at the top of the article is not laid out by the PDF annex: teach scripts/terms-text.mjs`);
  }
  for (const k of ['title', 'h1', 'lead', 'updated']) if (!out[k]) throw new Error(`${where}: no ${k === 'title' ? 'p.eyebrow' : k === 'lead' ? 'p.lead' : k === 'updated' ? 'p.legal-date' : 'h1'}`);
  return out;
}
export function parseTerms(html) { return { pt: article(html, 'pt'), en: article(html, 'en') }; }

// ---------- nothing of the page left out: its words = the blocks' words (every blank removed) ----------
const squash = (s) => s.replace(/[\s\u00a0\u2060]+/g, '');
export const plainArticle = (html, lang) => squash(dec(articleHtml(html, lang).replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '), PAGE));
const rtxt = (r) => r.map((x) => (typeof x === 'string' ? x : x.b ?? x.a ?? x.x)).join('');
const itxt = (i) => (Array.isArray(i) ? [rtxt(i)] : [rtxt(i.r), ...i.table.head, ...i.table.rows.flat()]);
export const plainBlocks = (d) => squash([d.title, d.h1, d.lead, d.updated, ...d.blocks.flatMap((b) => (b.k === 'h2' ? [b.t] : b.k === 'p' ? [rtxt(b.r)] : [...(b.h ? [b.h] : []), ...b.items.flatMap(itxt)]))].join(''));
function complete(html, doc) {
  const out = [];
  for (const l of ['pt', 'en']) {
    const x = plainArticle(html, l), y = plainBlocks(doc[l]);
    if (x === y) continue;
    let i = 0;
    while (x[i] === y[i]) i++;
    out.push(`${PAGE} (${l}): the annex text leaves out or changes part of the page, at «${x.slice(Math.max(0, i - 40), i + 40)}» (blocks: «${y.slice(Math.max(0, i - 40), i + 40)}»)`);
  }
  return out;
}

// ---------- the module and the archive, as text (deterministic: fixed key order, one block per line) ----------
const js = (v) => JSON.stringify(v).replace(/[\u00a0\u2060\u2028\u2029]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);
const blockOrder = (b) => (b.k === 'h2' ? { k: b.k, ...(b.id ? { id: b.id } : {}), t: b.t } : b.k === 'p' ? { k: b.k, r: b.r } : { k: b.k, ...(b.h ? { h: b.h } : {}), items: b.items });
function docText(doc, indent) {
  const i1 = ' '.repeat(indent), i2 = `${i1}  `, i3 = `${i2}  `;
  return ['pt', 'en'].map((l) => {
    const d = doc[l];
    return `${i1}${js(l)}: {\n${['title', 'h1', 'lead', 'updated'].map((k) => `${i2}${js(k)}: ${js(d[k])},`).join('\n')}\n${i2}"blocks": [\n${d.blocks.map((b) => `${i3}${js(blockOrder(b))}`).join(',\n')}\n${i2}]\n${i1}}`;
  }).join(',\n');
}
export function moduleSource(doc, date) {
  return `// GENERATED by node scripts/stamp.mjs (scripts/terms-text.mjs) from ${PAGE}, its two <article>s. Do not edit: change
// the page and run node scripts/stamp.mjs. The PDFs' annex (pdf-annex.js) lays it out; loaded only when a PDF is made.
// Blocks: { k: 'sum', h, items } | { k: 'h2', id?, t } | { k: 'p', r } | { k: 'ul', items }; an item is runs, or
// { r: runs, table: { head, rows } }; runs: 'text' | { b } (bold) | { a, href } (a link) | { x, to } (a section of the page).
export const TERMS_DATE = ${js(date)};
export const TERMS_URL = ${js(TERMS_URL)};
export const TERMS = {
${docText(doc, 2)}
};
`;
}
export const archiveSource = (date, doc) => `{\n  "date": ${js(date)},\n${docText(doc, 2)}\n}\n`;

// ---------- the dates ----------
const PT_M = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const EN_M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const ymd = (d) => String(d).split('-').map(Number);
const ptLong = (d) => { const [y, m, n] = ymd(d); return `${n} de ${PT_M[m - 1]} de ${y}`; };
const enLong = (d) => { const [y, m, n] = ymd(d); return `${n} ${EN_M[m - 1]} ${y}`; };
const dot = (d) => String(d).split('-').reverse().join('.');
const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const docShape = (d) => d && ['pt', 'en'].every((l) => d[l] && typeof d[l].updated === 'string' && Array.isArray(d[l].blocks) && d[l].blocks.length > 0);
const loadSource = (src) => import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);

export async function termsText({ check = false, rules, today }) {
  const problems = [], stale = [], date = rules && rules.termsDate;
  if (!isDay(date)) return { problems: [`seasonRules.termsDate is not a day (${date})`], stale };
  const html = readFileSync(PAGE, 'utf8');
  let doc;
  try { doc = parseTerms(html); } catch (e) { return { problems: [e.message], stale }; }
  problems.push(...complete(html, doc));
  // the version date: the page's «Atualizada a» / «Updated» (both articles) is seasonRules.termsDate
  for (const [l, want] of [['pt', `Atualizada a ${ptLong(date)}`], ['en', `Updated ${enLong(date)}`]]) {
    if (doc[l].updated !== want) problems.push(`${PAGE} (${l}): its date is «${doc[l].updated}», want «${want}» (seasonRules.termsDate)`);
  }
  if (problems.length) return { problems, stale };
  const src = moduleSource(doc, date), had = existsSync(MODULE) ? readFileSync(MODULE, 'utf8') : null;
  let old = null;
  if (had !== null) { try { old = await loadSource(had); } catch (_) { old = null; } }
  if (old && isDay(old.TERMS_DATE) && old.TERMS) {
    if (old.TERMS_DATE === date) {
      // the same version: its text may change only on its own day
      if (!same(old.TERMS, doc) && today !== date) {
        problems.push(`The terms text changed but its date is still ${dot(date)}: put today's date in seasonRules.termsDate (data/spots.json), in «Atualizada a» / «Updated» (${PAGE}, PT and EN) and in cl.terms (index.html and, in English, assets/js/i18n.js); README «Condições do patrocínio nos pedidos e nos PDF»`);
      }
    } else if (old.TERMS_DATE < date) {
      // the version moved on: the text of the old one is kept for the sponsorships made under it
      const f = `${ARCHIVE}/${old.TERMS_DATE}.json`;
      if (existsSync(f)) {
        let kept = null;
        try { kept = JSON.parse(readFileSync(f, 'utf8')); } catch (_) {}
        if (!kept || !same({ pt: kept.pt, en: kept.en }, { pt: old.TERMS.pt, en: old.TERMS.en })) problems.push(`${f} already holds another text for ${dot(old.TERMS_DATE)}: an archived version is never rewritten`);
      } else {
        stale.push(f);
        if (!check) { mkdirSync(ARCHIVE, { recursive: true }); writeFileSync(f, archiveSource(old.TERMS_DATE, old.TERMS)); }
      }
    } else problems.push(`${MODULE} is version ${dot(old.TERMS_DATE)}, after seasonRules.termsDate ${dot(date)}: a version date never goes back`);
  }
  // the archive: one file per older version, named by its date, of the module's shape
  if (existsSync(ARCHIVE)) {
    for (const name of readdirSync(ARCHIVE).sort()) {
      const f = `${ARCHIVE}/${name}`, d = name.replace(/\.json$/, '');
      if (!name.endsWith('.json') || !isDay(d)) { problems.push(`${f}: only <YYYY-MM-DD>.json files go in ${ARCHIVE}/`); continue; }
      let a = null;
      try { a = JSON.parse(readFileSync(f, 'utf8')); } catch (e) { problems.push(`${f}: not JSON (${e.message})`); continue; }
      if (!a || a.date !== d) problems.push(`${f}: its "date" is not ${d}`);
      if (!docShape(a)) problems.push(`${f}: not the shape of TERMS ({ pt, en } with blocks)`);
      if (d >= date) problems.push(`${f}: an archived version must be older than seasonRules.termsDate ${dot(date)} (the version in force is ${MODULE})`);
    }
  }
  if (problems.length) return { problems, stale };
  if (had !== src) {
    stale.push(MODULE);
    if (!check) {
      writeFileSync(MODULE, src);
      // stamp listed the modules before this file existed: its import maps would miss it
      if (had === null) problems.push(`${MODULE} written now: run node scripts/stamp.mjs again`);
    }
  }
  return { problems, stale };
}
