// Run from the repo root before publishing: node scripts/stamp.mjs
// (node scripts/stamp.mjs --check changes nothing and fails when a page is out of date.)
//
// 1. Writes the «Todas as provas» cards into index.html from RESULTS (assets/js/data.js), in Portuguese, with the same
//    renderer as the live page (assets/js/races.js): the page without JS and the printed media kit show every race,
//    and the JS render on load moves nothing. It stops if a race lacks something the cards need.
// 2. Gives every own module and stylesheet a content hash in its URL, so a browser never runs files from two deploys
//    together (GitHub Pages lets browsers keep files for 10 minutes). The import map in each page sends
//    './assets/js/x.js' to './assets/js/x.js?v=<hash>', which covers static imports, import() and import.meta.resolve().
//    The mesh worker has no import map: its imports (suit-worker.js -> suit-mesh.js -> suit-body.js) carry the hash.
// 3. A page with a Content-Security-Policy runs an inline script (the import map) only if script-src lists its sha256,
//    so every rewrite also recomputes those hashes from the inline scripts the page now holds; the admin pages'
//    connect-src also get the booking Worker's origin (SITE.requestsApi) and the statistics Worker's (SITE.stats.url).
// 4. Checks the season's rules (data/spots.json "seasonRules", assets/js/season-rules.js checkRules) and that the dates
//    the sponsorship terms print agree with them: the «Atualizada a» date of /condicoes/ (PT and EN), of the booking
//    dialog (index.html) and of the message (i18n.js) is seasonRules.termsDate; each article of /condicoes/ names every
//    date of the season; and its mid-season discount table (table.season-disc) has, for each month, the percent and the
//    prices season-rules.js gives; the home page's season copy (ru.p2 «De janeiro a dezembro de 2027», the step «É teu»
//    with the logo deadline, of.a4 with the renewal deadline, PT in index.html and EN in i18n.js) has this season's
//    dates, and no level card but «Todos os espaços» promises the renewal preference (every level has it); the cards of
//    the levels that keep their price on renewal (season-rules.js PRICE_LOCK: Principal of.c3, the whole suit of.d4)
//    name «o preço da tabela de <season> em <next>, se renovares até <renewBy>» (the table, not what a mid-season sponsor
//    paid), and no other card does. The end of the triathlon calendar («O calendário de triatlos de 2027 acaba em
//    setembro», and «a partir de» the day after racesUntil) and the renewal's payment day (renewPayBy) are in both
//    articles of /condicoes/. A mismatch stops it
//    (also with --check): the terms cannot drift from the code, and a new season is not published before its terms
//    carry its dates.
// 5. The montra «O meu material» (data/montra.json, assets/js/montra-core.js checkMontra): the file passes every check
//    (shape, ids, product ids that start with their brand's, https links to a domain without utm_, no example or
//    placeholder brand, product, note or shop, the limits of each level, one featured product and only for the whole
//    suit, the spots of a brand of this season sold to it at its level, and no brand of a level from spots of another
//    season with a product still to show); every photo file
//    it names is on disk; /condicoes/ prints the products of each level as LIMIT says (both articles, and the sentence of
//    its #montra / #showcase section); and index.html holds no montra markup (the section exists only when montra.js
//    builds it from an active product). The Patrocínios page may reach api.github.com and gocarmo.com (its montra editor
//    commits through the GitHub API and then waits for the site).
// 6. The documents page (/admin/documentos/, the cofre) gets the same import map, hashes and CSP, and its connect-src
//    reaches api.github.com (the head of the orphan branch «docs», and the vault's commits) and raw.githubusercontent.com
//    (the encrypted files, read at that commit). stampCofrePages() does it, after the main loop.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const check = process.argv.includes('--check');
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);
const modules = readdirSync('assets/js').filter((f) => f.endsWith('.js')).sort();
// the site's modules are browser ES modules in a folder without package.json; these three import nothing, so they load
// as they are, whatever Node makes of a plain .js file
const load = (path) => import(`data:text/javascript;base64,${readFileSync(path).toString('base64')}`);
const [i18n, { RESULTS }, { racesBlock, checkResults }] = await Promise.all(['assets/js/i18n.js', 'assets/js/data.js', 'assets/js/races.js'].map(load));

const bad = checkResults(RESULTS);
if (bad.length) {
  console.error(`RESULTS (assets/js/data.js) is missing what the race cards need:\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
const races = racesBlock(RESULTS, { t: i18n.t, pick: i18n.pick, numFmt: i18n.numFmt, fmtDay: i18n.fmtDay, lang: 'pt' });

// ---------- the season's rules and the dates of the terms ----------
const SR = await load('assets/js/season-rules.js');
const SPOTS = JSON.parse(readFileSync('data/spots.json', 'utf8'));
const ruleProblems = SR.checkRules(SPOTS);
if (ruleProblems.length) {
  console.error(`data/spots.json "seasonRules" (assets/js/season-rules.js checkRules):\n  ${ruleProblems.join('\n  ')}`);
  process.exit(1);
}
const termProblems = checkTerms(SR.rulesOf(SPOTS));
if (termProblems.length) {
  console.error(`The printed terms do not agree with data/spots.json "seasonRules":\n  ${termProblems.join('\n  ')}`);
  process.exit(1);
}
// ---------- the montra «O meu material» ----------
const MT = await load('assets/js/montra-core.js');
const montraProblems = checkMontraFile();
if (montraProblems.length) {
  console.error(`The montra (data/montra.json, /condicoes/, index.html) is not ready to publish:\n  ${montraProblems.join('\n  ')}`);
  process.exit(1);
}
function checkMontraFile() {
  const out = [];
  let file;
  try { file = JSON.parse(readFileSync(MT.MONTRA_PATH, 'utf8')); } catch (e) { return [`${MT.MONTRA_PATH}: ${e.code === 'ENOENT' ? 'missing (the empty state is { "v": 1, "brands": [] })' : `not JSON (${e.message})`}`]; }
  out.push(...MT.checkMontra(file, { spots: SPOTS, day: SR.lisbonDay(), levelOf: SR.levelOf, strict: true }).map((p) => `${MT.MONTRA_PATH}: ${p}`));
  for (const b of Array.isArray(file.brands) ? file.brands : []) {
    for (const p of b && Array.isArray(b.products) ? b.products : []) {
      for (const f of MT.photoFiles(p)) if (!existsSync(f)) out.push(`${MT.MONTRA_PATH}: «${b.name}», «${p?.name?.pt ?? p?.id}»: the photo file ${f} is not in the repo`);
    }
  }
  // the products of each level in /condicoes/, both articles, as LIMIT says
  const C = readFileSync('condicoes/index.html', 'utf8');
  const plain = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/g, '&').replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\s+/g, ' ');
  const L = MT.LIMIT;
  const words = {
    pt: { id: 'montra', levels: [['Oficial', `${L.oficial} produto na montra`], ['Principal', `até ${L.principal} produtos na montra`], ['Fato completo', `até ${L.title} produtos na montra`]],
      sentence: `${L.oficial} produto no Oficial, até ${L.principal} no Principal, até ${L.title} e em destaque no Titular` },
    en: { id: 'showcase', levels: [['Official', `${L.oficial} product in the site showcase`], ['Principal', `up to ${L.principal} products in the site showcase`], ['Whole suit', `up to ${L.title} products in the site showcase`]],
      sentence: `${L.oficial} product at Official, up to ${L.principal} at Principal, up to ${L.title} and featured at Title` },
  };
  for (const [l, w] of Object.entries(words)) {
    const a = C.match(new RegExp(`<article\\b[^>]*data-l="${l}"[^>]*>([\\s\\S]*?)</article>`));
    if (!a) { out.push(`condicoes/index.html: no <article data-l="${l}">`); continue; }
    for (const [name, want] of w.levels) {
      const m = a[1].match(new RegExp(`<(p|li)\\b[^>]*>\\s*<strong>${name}</strong>([\\s\\S]*?)</\\1>`));
      if (!m) { out.push(`condicoes/index.html (${l}): no paragraph that starts with <strong>${name}</strong> (the level's items)`); continue; }
      if (!plain(m[2]).includes(want)) out.push(`condicoes/index.html (${l}): the ${name} paragraph has to say «${want}» (montra-core.js LIMIT)`);
    }
    if (!new RegExp(`\\bid="${w.id}"`).test(a[1])) out.push(`condicoes/index.html (${l}): no id="${w.id}" (the montra section the home page links to)`);
    if (!plain(a[1]).includes(w.sentence)) out.push(`condicoes/index.html (${l}): the montra section has to say «${w.sentence}» (montra-core.js LIMIT)`);
  }
  // the section is built only by montra.js: no static trace in the home page
  const IX = readFileSync('index.html', 'utf8');
  if (/\bid="material"/.test(IX)) out.push('index.html: id="material" (the montra section exists only when montra.js builds it)');
  if (/class="[^"]*\bmt-[a-z]/.test(IX)) out.push('index.html: an mt-… class (the montra markup is built only by montra.js)');
  if (/O meu material|My gear/.test(plain(IX))) out.push('index.html: «O meu material» / «My gear» in the static page (the montra is built only by montra.js)');
  return out;
}
function checkTerms(R) {
  const PT_M = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const EN_M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const ymd = (d) => d.split('-').map(Number);
  const pt = (d) => { const [y, m, n] = ymd(d); return `${n} de ${PT_M[m - 1]} de ${y}`; };
  const en = (d) => { const [y, m, n] = ymd(d); return `${n} ${EN_M[m - 1]} ${y}`; };
  // the period is written «de 1 de janeiro a 31 de dezembro de 2027» / «1 January to 31 December 2027»
  const ptRange = () => { const [, m, n] = ymd(R.start); return `${n} de ${PT_M[m - 1]} a ${pt(R.end)}`; };
  const enRange = () => { const [, m, n] = ymd(R.start); return `${n} ${EN_M[m - 1]} to ${en(R.end)}`; };
  const plain = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/g, '&')
    .replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\s+/g, ' ');
  const out = [], need = (ok, msg) => { if (!ok) out.push(msg); };
  const KEYS = ['start', 'end', 'logoBy', 'fullPriceUntil', 'racesUntil', 'requestsUntil', 'proposalsFrom', 'renewBy', 'openFrom', 'renewPayBy'];
  const C = readFileSync('condicoes/index.html', 'utf8');
  const first = SR.monthIndex(R.fullPriceUntil) - SR.monthIndex(R.start) + 2, last = SR.monthIndex(R.requestsUntil) - SR.monthIndex(R.start) + 1;
  // the price of a spot of `price` euros in season month m, as quote() works it out
  const priceIn = (price, m) => SR.quote({ season: R.season, seasonRules: SPOTS.seasonRules, bundle: { min: 99, discount: 0 }, spots: [{ id: 'x', n: 1, price }], title: { price: 0 } }, ['x'], { m }).net;
  for (const [l, long, range, Ms, upd, dec, eur] of [['pt', pt, ptRange, PT_M, (d) => `Atualizada a ${pt(d)}`, ',', (n) => `${n} €`], ['en', en, enRange, EN_M, (d) => `Updated ${en(d)}`, '.', (n) => `€${n}`]]) {
    const a = C.match(new RegExp(`<article\\b[^>]*data-l="${l}"[^>]*>([\\s\\S]*?)</article>`));
    if (!a) { out.push(`condicoes/index.html: no <article data-l="${l}">`); continue; }
    const html = a[1], text = plain(html);
    need(text.includes(upd(R.termsDate)), `condicoes/index.html (${l}): «${upd(R.termsDate)}» (seasonRules.termsDate)`);
    for (const k of KEYS) {
      // racesUntil is a boundary, not a race day: the page names the month the calendar ends and the day after it
      if (k === 'racesUntil') {
        const [y, m] = ymd(R.racesUntil), after = long(SR.addDays(R.racesUntil, 1));
        const ends = l === 'pt' ? `O calendário de triatlos de ${y} acaba em ${PT_M[m - 1]}` : `The ${y} triathlon calendar ends in ${EN_M[m - 1]}`;
        need(text.includes(ends), `condicoes/index.html (${l}): no «${ends}» (seasonRules.racesUntil)`);
        need(text.includes(`${l === 'pt' ? 'a partir de' : 'from'} ${after}`), `condicoes/index.html (${l}): no «${l === 'pt' ? 'a partir de' : 'from'} ${after}» (the day after seasonRules.racesUntil)`);
        continue;
      }
      const ok = text.includes(long(R[k])) || (k === 'start' && text.includes(range()));
      need(ok, `condicoes/index.html (${l}): no «${k === 'start' ? range() : long(R[k])}» (seasonRules.${k})`);
    }
    const t = html.match(/<table\b[^>]*class="[^"]*\bseason-disc\b[^"]*"[^>]*>([\s\S]*?)<\/table>/);
    if (!t) { out.push(`condicoes/index.html (${l}): no <table class="season-disc"> (the mid-season discount by month)`); continue; }
    const rows = [...t[1].matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map((r) => [...r[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => plain(c[1]).trim()));
    const byMonth = new Map();
    for (const r of rows) { const i = Ms.findIndex((x) => x.toLowerCase() === String(r[0] || '').toLowerCase()); if (i >= 0) byMonth.set(i + 1, r); }
    for (let m = first; m <= last; m++) {
      const r = byMonth.get(m), want = [Ms[m - 1], `${SR.pctText(SR.seasonBp(m), dec)}%`, eur(priceIn(100, m)), eur(priceIn(600, m))];
      if (!r) { out.push(`condicoes/index.html (${l}): table.season-disc has no row for ${Ms[m - 1]} (want ${want.join(' | ')})`); continue; }
      need(r.slice(1, 4).join(' | ') === want.slice(1).join(' | '), `condicoes/index.html (${l}): table.season-disc, ${Ms[m - 1]}: «${r.slice(1, 4).join(' | ')}», want «${want.slice(1).join(' | ')}»`);
    }
    for (const m of byMonth.keys()) need(m >= first && m <= last, `condicoes/index.html (${l}): table.season-disc has a row for ${Ms[m - 1]}, a month with no mid-season discount or no sales`);
  }
  const IX = readFileSync('index.html', 'utf8'), ix = plain(IX);
  need(ix.includes(`(versão de ${R.termsDate.split('-').reverse().join('.')})`), `index.html: «(versão de ${R.termsDate.split('-').reverse().join('.')})» (cl.terms, seasonRules.termsDate)`);
  const js = readFileSync('assets/js/i18n.js', 'utf8').replace(/\s+/g, ' ');
  need(i18n.t('msg.terms', R.termsDate) === `Condições do patrocínio (versão de ${R.termsDate.split('-').reverse().join('.')}): https://gocarmo.com/condicoes/`, `assets/js/i18n.js: msg.terms(termsDate) is «${i18n.t('msg.terms', R.termsDate)}» (the request message's terms line)`);
  need(js.includes(`(version of ${en(R.termsDate)})`), `assets/js/i18n.js: «(version of ${en(R.termsDate)})» (cl.terms, seasonRules.termsDate)`);
  // the home page's season copy: the period (ru.p2), the logo deadline of the page without JS (#sp-p4; adspace.js
  // writes it from the rules), the renewal preference of every level (of.a4)
  const next = String(Number(R.season) + 1), dm = (d, M, l) => { const [, m, n] = ymd(d); return l === 'pt' ? `${n} de ${M[m - 1]}` : `${n} ${M[m - 1]}`; };
  need(ix.includes(`De janeiro a dezembro de ${R.season}`), `index.html: «De janeiro a dezembro de ${R.season}» (ru.p2, the season)`);
  need(js.includes(`January to December ${R.season}`), `assets/js/i18n.js: «January to December ${R.season}» (ru.p2, the season)`);
  need(ix.includes(`se o logótipo chegar até ${dm(R.logoBy, PT_M, 'pt')}`), `index.html: «se o logótipo chegar até ${dm(R.logoBy, PT_M, 'pt')}» (#sp-p4, seasonRules.logoBy)`);
  need(ix.includes(`em ${next}, se disseres que sim até ${pt(R.renewBy)}`), `index.html: «em ${next}, se disseres que sim até ${pt(R.renewBy)}» (of.a4, seasonRules.renewBy)`);
  need(js.includes(`in ${next}, if you say yes by ${en(R.renewBy)}`), `assets/js/i18n.js: «in ${next}, if you say yes by ${en(R.renewBy)}» (of.a4, seasonRules.renewBy)`);
  const offer = IX.match(/<div class="offer">([\s\S]*?)\n\s*<\/div>\n/);
  if (!offer) out.push('index.html: no <div class="offer"> (the level cards)');
  else {
    const cards = offer[1].split(/<div class="card\b/).slice(1);
    need(cards.length >= 2 && /renova|preferência/i.test(plain(cards[0])), 'index.html: the «Todos os espaços» card has to name the renewal preference (of.a4)');
    // the price kept on renewal (owner decisions E1 and E1' of 29.10.2026): the cards of the PRICE_LOCK levels name it, in
    // these words; no other level card does, and none of them names the preference, which every level has
    const LOCK_CARD = { principal: ['of.c', 2], title: ['of.d', 3] };
    const lockPt = `preço da tabela de ${R.season} em ${next}, se renovares até ${pt(R.renewBy)}`, lockEn = `${R.season} rate card price in ${next}, if you renew by ${en(R.renewBy)}`;
    const locked = new Set(SR.PRICE_LOCK.map((lv) => LOCK_CARD[lv] && LOCK_CARD[lv][1]).filter((x) => x !== undefined));
    cards.slice(1).forEach((c, j) => {
      const i = j + 1, text = plain(c);
      need(!/preferência/i.test(text), `index.html: level card ${i + 1} names the renewal preference, which every level has (put it only in «Todos os espaços»)`);
      if (locked.has(i)) need(text.includes(lockPt), `index.html: level card ${i + 1} has to say «O ${lockPt}» (season-rules.js PRICE_LOCK, seasonRules.renewBy)`);
      else need(!/renova|mesmo preço|preço da tabela/i.test(text), `index.html: level card ${i + 1} names a renewal or a price kept, which only the PRICE_LOCK levels have`);
    });
    const enOf = [...js.matchAll(/"(of\.[bcd]\d)":\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]);
    const lockKeys = new Set(SR.PRICE_LOCK.map((lv) => LOCK_CARD[lv] && LOCK_CARD[lv][0]).filter(Boolean));
    for (const pre of lockKeys) need(enOf.some(([k, v]) => k.startsWith(pre) && v.includes(lockEn)), `assets/js/i18n.js: no ${pre}N says «${lockEn}» (season-rules.js PRICE_LOCK, seasonRules.renewBy)`);
    const enBad = enOf.filter(([k, v]) => /first option/i.test(v) || (/renew|same price|rate card price/i.test(v) && !(lockKeys.has(k.slice(0, 4)) && v.includes(lockEn)))).map(([k]) => k);
    need(!enBad.length, `assets/js/i18n.js: ${enBad.join(', ')} names the renewal preference or a price kept, which only «Todos os espaços» (of.a4) and the PRICE_LOCK levels have`);
  }
  return out;
}

// <!-- bake:name -->…<!-- /bake:name -->: an inline part on one line, a list one item per line at the marker's indent
function bake(s) {
  const seen = new Set();
  s = s.replace(/<!-- bake:(\w+) -->[\s\S]*?<!-- \/bake:\1 -->/g, (m, name, at, all) => {
    if (!(name in races)) throw new Error(`index.html: no content for <!-- bake:${name} -->`);
    seen.add(name);
    const part = races[name];
    if (!Array.isArray(part)) return `<!-- bake:${name} -->${part}<!-- /bake:${name} -->`;
    const indent = all.slice(all.lastIndexOf('\n', at) + 1, at);
    return [`<!-- bake:${name} -->`, ...part, `<!-- /bake:${name} -->`].join(`\n${indent}`);
  });
  const missing = Object.keys(races).filter((k) => !seen.has(k));
  if (missing.length) throw new Error(`index.html: no <!-- bake:… --> block for ${missing.join(', ')}`);
  return s;
}

// A worker has no import map, so the mesh worker's static imports carry the content hash themselves: a phone never
// pairs a worker with a suit-mesh.js (or a suit-body.js) cached from the deploy before. Deepest first, so a change to
// suit-body.js changes the URLs of all three. On the main thread './suit-body.js?v=<hash>' is exactly where the import
// map sends './suit-body.js', so it stays one module.
// With --check a pin out of date is reported, not written.
const stale = [];
function pin(file, dep) {
  const p = `assets/js/${file}`, s = readFileSync(p, 'utf8');
  const out = s.replace(new RegExp(`(from\\s+'\\./${dep.replace(/\./g, '\\.')})(?:\\?v=[0-9a-f]+)?(')`, 'g'), `$1?v=${hash(`assets/js/${dep}`)}$2`);
  if (!out.includes(`./${dep}?v=`)) throw new Error(`${file} no longer imports ./${dep}: update stamp.mjs`);
  if (out === s) return;
  stale.push(p);
  if (!check) writeFileSync(p, out);
}
pin('suit-mesh.js', 'suit-body.js');
pin('suit-worker.js', 'suit-mesh.js');
// the sponsorship terms as data for the PDFs' annex (scripts/terms-text.mjs): the page, assets/js/terms-text.js and
// seasonRules.termsDate agree, nothing of the page is left out, a changed text has a new date, old versions are kept
const terms = await (await import('./terms-text.mjs')).termsText({ check, rules: SR.rulesOf(SPOTS), today: process.env.STAMP_TODAY || SR.lisbonDay() });
if (terms.problems.length) { console.error(`The sponsorship terms (condicoes/index.html, assets/js/terms-text.js, data/terms/):\n  ${terms.problems.join('\n  ')}`); process.exit(1); }
stale.push(...terms.stale);

// script types the browser runs (and CSP checks); a data block such as application/ld+json never runs
const RUNS = /^(|module|importmap|text\/javascript|application\/javascript)$/i;

function cspHashes(s) {
  const meta = /(<meta http-equiv="Content-Security-Policy" content=")([^"]*)(")/i;
  if (!meta.test(s)) return s;
  const hashes = [];
  for (const [, attrs, body] of s.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = (attrs.match(/\btype\s*=\s*"([^"]*)"/i) || [, ''])[1].trim();
    if (!RUNS.test(type)) continue;
    hashes.push(`'sha256-${createHash('sha256').update(body).digest('base64')}'`);
  }
  return s.replace(meta, (m, a, policy, z) => {
    const dirs = policy.split(';').map((d) => d.trim()).filter(Boolean);
    const at = dirs.findIndex((d) => /^script-src(\s|$)/i.test(d));
    if (at < 0) {
      if (hashes.length) throw new Error('page has inline scripts and a CSP without script-src: add one');
      return m;
    }
    const kept = dirs[at].split(/\s+/).filter((t) => !/^'sha(256|384|512)-/i.test(t));
    dirs[at] = [...kept, ...new Set(hashes)].join(' ');
    return `${a}${dirs.join('; ')}${z}`;
  });
}

function stamp(s, base) {
  s = s.replace(/<script type="importmap">([\s\S]*?)<\/script>/, (m, body) => {
    const imports = JSON.parse(body).imports;
    for (const k of Object.keys(imports)) if (k.startsWith(`${base}assets/js/`)) delete imports[k];
    for (const f of modules) imports[`${base}assets/js/${f}`] = `${base}assets/js/${f}?v=${hash(`assets/js/${f}`)}`;
    const lines = Object.entries(imports).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    return `<script type="importmap">\n{ "imports": {\n${lines.join(',\n')}\n} }\n</script>`;
  });
  // the entry module and the stylesheets are loaded by the page itself, outside the import map
  const own = (url) => url.replace(base, '');
  s = s.replace(/(<script type="module" src=")([^"?]+)(?:\?v=[0-9a-f]+)?(")/g, (m, a, src, z) => `${a}${src}?v=${hash(own(src))}${z}`);
  s = s.replace(/(<link rel="stylesheet" href=")((?:\.\.\/)*assets\/css\/[^"?]+)(?:\?v=[0-9a-f]+)?(")/g, (m, a, href, z) => `${a}${href}?v=${hash(own(href))}${z}`);
  return cspHashes(s);
}

// The admin pages reach the Workers only if their CSP lets them. Each address set in assets/js/data.js goes into
// connect-src, after the fixed ones, and leaves it when the setting is emptied:
// - SITE.requestsApi, the booking-request Worker (worker/README.md): /admin/;
// - SITE.stats.url, the statistics Worker (stats-worker/README.md): /admin/ and /admin/analytics/.
const DATA = readFileSync('assets/js/data.js', 'utf8');
function origin(name, re) {
  const m = DATA.match(re);
  if (!m) throw new Error(`assets/js/data.js: no ${name} line (keep it on one line${name === 'SITE.stats' ? ', url first' : ''})`);
  const v = m[1].trim();
  if (!v) return '';
  const u = new URL(v);
  if (u.protocol !== 'https:') throw new Error(`${name} has to be an https:// address (${v})`);
  return u.origin;
}
const worker = origin('SITE.requestsApi', /^\s*requestsApi:\s*'([^']*)'/m);
const stats = origin('SITE.stats', /^\s*stats:\s*\{\s*url:\s*'([^']*)'/m);
const CONNECT = {
  'admin/index.html': ["'self'", 'https://api.github.com', 'https://gocarmo.com', worker, stats],
  'admin/analytics/index.html': ["'self'", stats],
  // - SITE.requestsApi also: /admin/patrocinios/ (the sponsor contracts are kept by the same Worker); its montra editor
  //   commits through the GitHub API and then waits for gocarmo.com, as /admin/ does
  'admin/patrocinios/index.html': ["'self'", 'https://api.github.com', 'https://gocarmo.com', worker],
};
CONNECT['admin/documentos/index.html'] = ["'self'", 'https://api.github.com', 'https://raw.githubusercontent.com'];
const connect = (s, list) => s.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?connect-src )[^;"]*/, (m, head) => `${head}${list.filter(Boolean).join(' ')}`);

for (const [page, base, withRaces] of [['index.html', './', true], ['admin/index.html', '../', false], ['admin/strava/index.html', '../../', false], ['admin/analytics/index.html', '../../', false], ['admin/patrocinios/index.html', '../../', false], ['privacidade/index.html', '../', false], ['condicoes/index.html', '../', false], ['cartao/index.html', '../', false]]) {
  const was = readFileSync(page, 'utf8');
  let now = stamp(withRaces ? bake(was) : was, base);
  if (CONNECT[page]) {
    if (!/connect-src /.test(now)) throw new Error(`${page}: its Content-Security-Policy has no connect-src`);
    now = connect(now, CONNECT[page]);
  }
  if (now === was) continue;
  stale.push(page);
  if (!check) writeFileSync(page, now);
}
stampCofrePages();
// the cofre (/admin/documentos/): the same stamp and connect-src as the pages of the main loop
function stampCofrePages() {
  for (const [page, base] of [['admin/documentos/index.html', '../../']]) {
    const was = readFileSync(page, 'utf8');
    let now = stamp(was, base);
    if (!/connect-src /.test(now)) throw new Error(`${page}: its Content-Security-Policy has no connect-src`);
    now = connect(now, CONNECT[page]);
    if (now === was) continue;
    stale.push(page);
    if (!check) writeFileSync(page, now);
  }
}
if (check) {
  if (stale.length) { console.error(`out of date: ${stale.join(', ')}. Run node scripts/stamp.mjs`); process.exit(1); }
  console.log(`up to date: ${RESULTS.length} races, ${modules.length} modules`);
} else {
  const reach = [worker && `the admin and Patrocínios pages may reach ${worker}`, stats ? `the admin pages may reach ${stats}` : 'the statistics reach no Worker yet (SITE.stats.url is empty)'].filter(Boolean);
  console.log(`stamped ${modules.length} modules, baked ${races.cards.length} race cards${stale.length ? ` (${stale.join(', ')} updated)` : ''}; ${reach.join('; ')}`);
}
