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
//    dates, and no level card but «Todos os espaços» promises the renewal preference (every level has it); no level card
//    names a renewal price, and neither article of /condicoes/ keeps a price on renewal: every level renews at the next
//    season's rate card. The end of the triathlon calendar («O calendário de triatlos de 2027 acaba em
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
//    reaches api.github.com (the head of the orphan branch «docs», the vault's commits, and with a token every file:
//    the only way into a private repository) and raw.githubusercontent.com (the encrypted files, read at that commit,
//    without a token: a public repository only). stampCofrePages() does it, after the main loop.
// 7. The admin hub (/admin/, since 02.11.2026; the Espaços page moved to /admin/espacos/) and the supporters' page
//    (/admin/apoiantes/) are stamped like the other admin pages; the hub's connect-src reaches 'self' and both Workers,
//    /admin/apoiantes/ the booking Worker only. index.html holds no markup of the supporters' wall (apoiantes.js builds
//    it only when the Worker has a published name), apoiantes-core.js keeps the owner's rules, and every admin page has
//    its «← Painel» link.
// 8. The race partner (data/spots.json "racePartner", since 03.11.2026): the block passes season-rules.js
//    checkRacePartner and its url the brand-link check; every race is a SEASON triathlon of assets/js/data.js with the
//    same id, date and names, every SEASON triathlon of the season (100 km or more, a Triatlo/Triathlon/IRONMAN name) is
//    in it, and racesUntil is on or after the last race; the section «O parceiro de prova» of /condicoes/ (#parceiro,
//    #race-partner) names the price, the helmet's price, the 6 weeks (RACE_LEAD_DAYS) and the 5 weeks (RACE_LOGO_DAYS),
//    CARMO PROVA, every race that can be booked, day 1 of a race that has only its month, and every race on proposal
//    next to «sob proposta» / «on request»; the home page's card shows the price and the helmet's and links to #parceiro.
// 9. GOCARMO Ride (since 12.11.2026; the game as a full page since 16.11.2026): the game is served whole from its own
//    host, named in one place, assets/js/ride-config.js (RIDE_ORIGIN, an https:// origin, a plain host name). Every way
//    into it is a plain link to that host: from that line come the href of every <a data-ride> (the home page's hero
//    button, its section #ride and the public pages' footers) and the refresh meta of /ride/. /ride/ is a forwarder for
//    the links already shared: no script, no frame, a policy checked word for word (only its own stylesheets, fonts and
//    pictures) with its meta before every stylesheet, the refresh meta to the game, its og:image, and the credits
//    (OpenRadlr, the GNU AGPL, «not the official OpenRadlr», © The OpenRadlr contributors and both repositories, in PT
//    and EN). The home page's section has its poster, a link to the game and loads ride.js, which asks the game for
//    its riders (GET /api/info): ride.js names no host of its own, makes no frame, has no HTML sink, reads nothing from
//    the address, and calls without credentials, referrer or redirect. The privacy page (/privacidade/, both languages)
//    says what is sent to the game's host.
//    While RIDE_HIDDEN is true (until the launch) /ride/ is noindex, nofollow, no other page, module, stylesheet or
//    data file links to it or to the game's host and no sitemap names it; once it is false the page may not keep its
//    noindex, and the privacy page may not keep its note about the game server's hosting (RIDE-HOST-TODO). A mismatch
//    stops it (also with --check).
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
// the sponsors' links (data/spots.json "url", the link of a sold spot's logo): every one a valid brand link, as the admin
// page, the issue bot and the booking Worker write it (season-rules.js brandLink, already normalised). The site renders
// only a valid one anyway (sponsorHref); a link left on a spot that is not sold is only reported (the site ignores it).
const linkProblems = [];
for (const x of [...(Array.isArray(SPOTS.spots) ? SPOTS.spots : []), SPOTS.title, SPOTS.racePartner]) {
  if (!x || x.url === undefined) continue;
  const name = x === SPOTS.title ? 'title' : x === SPOTS.racePartner ? 'racePartner' : `spot ${x.id}`, r = SR.brandLink(x.url);
  if (typeof x.url !== 'string' || r.error || r.url !== x.url) linkProblems.push(`data/spots.json ${name}: url «${String(x.url).slice(0, 80)}» is not a valid brand link (https://, a real domain, at most ${SR.LINK_MAX} characters, normalised: «${r.url || r.error}»)`);
  else if (x.status !== 'sold') console.warn(`data/spots.json ${name}: a url on a spot that is not sold (${x.status}): the site shows no link until it is sold`);
}
if (linkProblems.length) {
  console.error(`The sponsors' links:\n  ${linkProblems.join('\n  ')}`);
  process.exit(1);
}
const raceProblems = await checkRace(SR.rulesOf(SPOTS));
if (raceProblems.length) {
  console.error(`The race partner (data/spots.json "racePartner", assets/js/data.js SEASON, /condicoes/, index.html):\n  ${raceProblems.join('\n  ')}`);
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
// ---------- «Quem apoia» (the supporters' wall) and the admin hub ----------
const AP = await load('assets/js/apoiantes-core.js');
const apProblems = checkApoiantes();
if (apProblems.length) {
  console.error(`The supporters' wall and the admin hub:\n  ${apProblems.join('\n  ')}`);
  process.exit(1);
}
// The wall is built only by apoiantes.js, from the Worker, and only when a name is published: index.html holds no trace
// of it (with no name, the public site shows nothing at all). Its rules module answers as the owner decided (from the
// first name; anonymous rows out; «Nome I.»). Every admin page links back to the hub.
function checkApoiantes() {
  const out = [];
  const IX = readFileSync('index.html', 'utf8');
  const plain = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  if (/\bid="apoiantes"/.test(IX)) out.push('index.html: id="apoiantes" (the wall exists only when apoiantes.js builds it)');
  if (/class="[^"]*\b(crew|gfm-who)\b/.test(IX)) out.push('index.html: a crew… / gfm-who class (the wall markup is built only by apoiantes.js)');
  if (/Quem apoia|Vê quem apoiou|Who's backing me/.test(plain(IX))) out.push('index.html: the wall\'s copy in the static page (it is built only by apoiantes.js)');
  if (AP.MIN_SHOWN !== 1) out.push(`assets/js/apoiantes-core.js: MIN_SHOWN is ${AP.MIN_SHOWN} (owner, 02.11.2026: the block shows from the first published name)`);
  const v = AP.publicView({ v: 1, names: [{ id: 'ABCDEF', name: 'Zé B.', state: 'publicado' }, { id: 'GHJKMN', name: 'Ana S.', state: 'espera' }] });
  if (JSON.stringify(v) !== '{"v":1,"names":[{"id":"ABCDEF","name":"Zé B."}]}') out.push('assets/js/apoiantes-core.js: publicView must return only the published names, as { id, name }');
  if (AP.shortName('ana maria', 'da silva') !== 'Ana S.' || !AP.isAnonName('Anónimo')) out.push('assets/js/apoiantes-core.js: shortName / isAnonName no longer give «Nome I.» or spot an anonymous row');
  for (const page of ['admin/espacos/index.html', 'admin/apoiantes/index.html', 'admin/patrocinios/index.html', 'admin/analytics/index.html', 'admin/documentos/index.html', 'admin/strava/index.html']) {
    if (!/<a class="back" href="\.\.\/">← Painel<\/a>/.test(readFileSync(page, 'utf8'))) out.push(`${page}: no «← Painel» link back to the hub (<a class="back" href="../">)`);
  }
  return out;
}
// the race partner: the block, its races against the calendar, and what the terms and the home page print about it
async function checkRace(R) {
  const out = [...SR.checkRacePartner(SPOTS)];
  const rp = SPOTS.racePartner;
  if (!rp || out.length) return out;
  const { SEASON } = await load('assets/js/data.js');
  const races = SR.racesOf(SPOTS);
  for (const r of races) {
    const s = SEASON.find((x) => x.id === r.id);
    if (!s) { out.push(`racePartner: race «${r.id}» is not in SEASON (assets/js/data.js: give the triathlon id: '${r.id}')`); continue; }
    for (const k of ['date', 'pt', 'en']) if (s[k] !== r[k]) out.push(`racePartner: race «${r.id}» ${k} «${r[k]}», SEASON says «${s[k]}» (change both)`);
  }
  const inSeason = (d) => typeof d === 'string' && d.slice(0, 4) === String(R.season);
  for (const s of SEASON) {
    if (s.status === 'goal' || !inSeason(s.date) || !(s.km >= 100) || !/Triatlo|Triathlon|IRONMAN/.test(`${s.pt} ${s.en}`)) continue;
    if (!races.some((r) => r.id && r.id === s.id)) out.push(`racePartner: the SEASON triathlon «${s.pt}» (${s.date}) is not one of the races (give it an id in SEASON and add it, or mark it proposal / ask)`);
  }
  const last = races.map((r) => SR.raceDay(r)).filter(Boolean).sort().pop();
  if (last && R.racesUntil < last) out.push(`seasonRules.racesUntil ${R.racesUntil} is before the last race partner race (${last})`);
  const plain = (html) => html.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|&#xa0;/gi, ' ').replace(/&amp;/g, '&')
    .replace(/[\u00a0\u202f\u2009]/g, ' ').replace(/\s+/g, ' ');
  const PT_M = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const EN_M = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const group = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const money = { pt: (n) => `${group(n)} €`, en: (n) => `€${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}` };
  const C = readFileSync('condicoes/index.html', 'utf8');
  for (const [l, id, weeks, prop, day1] of [['pt', 'parceiro', (n) => `${n} semanas`, 'sob proposta', (y, m) => `1 de ${PT_M[m - 1]} de ${y}`],
    ['en', 'race-partner', (n) => `${n} weeks`, 'on request', (y, m) => `1 ${EN_M[m - 1]} ${y}`]]) {
    const a = C.match(new RegExp(`<article\\b[^>]*data-l="${l}"[^>]*>([\\s\\S]*?)</article>`));
    const sec = a && a[1].match(new RegExp(`<h2 id="${id}">([\\s\\S]*?)(?=<h2\\b|$)`));
    if (!sec) { out.push(`condicoes/index.html (${l}): no section <h2 id="${id}"> (the race partner; the site's card links to it)`); continue; }
    const text = plain(sec[1]), need = (w, why) => { if (!text.includes(w)) out.push(`condicoes/index.html (${l}) #${id}: no «${w}» (${why})`); };
    need(money[l](rp.price), 'racePartner.price');
    need(money[l](rp.helmetPrice), 'racePartner.helmetPrice');
    need(weeks(SR.RACE_LEAD_DAYS / 7), 'RACE_LEAD_DAYS');
    need(weeks(SR.RACE_LOGO_DAYS / 7), 'RACE_LOGO_DAYS');
    need('CARMO PROVA', 'the payment reference');
    for (const r of races) {
      if (r.ask) continue;
      need(r[l], `race ${r.id}`);
      if (r.proposal) {
        const i = text.indexOf(r[l]);
        if (i >= 0 && !text.slice(i, i + r[l].length + 30).includes(prop)) out.push(`condicoes/index.html (${l}) #${id}: «${r[l]}» is on proposal: say «${prop}» right after its name`);
      }
      if (SR.raceMonthOnly(r)) { const [y, m] = r.date.split('-').map(Number); need(day1(y, m), `${r.id} has only its month: the 6 weeks count from day 1`); }
    }
  }
  const IX = readFileSync('index.html', 'utf8');
  const grab = (re) => (IX.match(re) || [])[1];
  if (plain(grab(/id="rp-price">([^<]*)</) || '').trim() !== money.pt(rp.price)) out.push(`index.html #rp-price: «${grab(/id="rp-price">([^<]*)</)}», want «${money.pt(rp.price)}» (racePartner.price)`);
  if (plain(grab(/id="rp-helm-p"[^>]*>([^<]*)</) || '').trim() !== `+${money.pt(rp.helmetPrice)}`) out.push(`index.html #rp-helm-p: «${grab(/id="rp-helm-p"[^>]*>([^<]*)</)}», want «+${money.pt(rp.helmetPrice)}» (racePartner.helmetPrice)`);
  if (grab(/id="rp-terms" href="([^"]*)"/) !== 'condicoes/#parceiro') out.push('index.html #rp-terms: has to link to condicoes/#parceiro');
  if (i18n.t('rp.termsHref') !== 'condicoes/#parceiro') out.push(`assets/js/i18n.js rp.termsHref (PT): «${i18n.t('rp.termsHref')}», want «condicoes/#parceiro»`);
  return out;
}

// ---------- the merch page (/admin/merch/, since 03.11.2026) ----------
// Every file it links or loads is on disk (admin-merch-core.js merchFiles(): the model and its licence, the textures, the
// flat mockups, the print files, the quote brief), it is noindex like every admin page, it has its «← Painel» link, and
// the hub has its card.
const MX = await load('assets/js/admin-merch-core.js');
const mxProblems = [];
{
  const page = readFileSync('admin/merch/index.html', 'utf8');
  for (const f of MX.merchFiles()) if (!existsSync(`${MX.BASE}${f}`)) mxProblems.push(`${MX.BASE}${f}: missing (admin-merch-core.js names it)`);
  if (!/<meta name="robots" content="noindex,nofollow">/.test(page)) mxProblems.push('admin/merch/index.html: no <meta name="robots" content="noindex,nofollow">');
  if (!/<a class="back" href="\.\.\/">← Painel<\/a>/.test(page)) mxProblems.push('admin/merch/index.html: no «← Painel» link back to the hub (<a class="back" href="../">)');
  if (!/<a class="hcard" href="merch\/">/.test(readFileSync('admin/index.html', 'utf8'))) mxProblems.push('admin/index.html: no card for the merch page (<a class="hcard" href="merch/">)');
}
if (mxProblems.length) {
  console.error(`The merch page:\n  ${mxProblems.join('\n  ')}`);
  process.exit(1);
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
    // the renewal (owner decision of 29.10.2026, evening; terms of 30.10.2026): every level renews at the next season's
    // rate card, so no level card names the renewal or a price kept (only «Todos os espaços», of.a4, names the renewal)
    cards.slice(1).forEach((c, j) => {
      const text = plain(c);
      need(!/preferência|renova|mesmo preço|preço da tabela/i.test(text), `index.html: level card ${j + 2} names the renewal or a price kept (only «Todos os espaços», of.a4, names the renewal; no level keeps its price)`);
    });
    const enOf = [...js.matchAll(/"(of\.[bcd]\d)":\s*"([^"]*)"/g)].map((m) => [m[1], m[2]]);
    const enBad = enOf.filter(([, v]) => /first option|renew|same price|rate card price/i.test(v)).map(([k]) => k);
    need(!enBad.length, `assets/js/i18n.js: ${enBad.join(', ')} names the renewal or a price kept (only «Todos os espaços», of.a4, names the renewal; no level keeps its price)`);
  }
  // and the terms keep no price on renewal: they name no table of this season (the lock of the terms of 29.10.2026, «ao
  // preço da tabela de 2027», must not come back; this season's table is «a tabela», with no year)
  for (const [l, re] of [['pt', new RegExp(`tabela de ${R.season}|ao preço de ${R.season}`, 'i')], ['en', new RegExp(`${R.season} rate card|at the ${R.season} price`, 'i')]]) {
    const a = C.match(new RegExp(`<article\\b[^>]*data-l="${l}"[^>]*>([\\s\\S]*?)</article>`));
    need(!a || !re.test(plain(a[1])), `condicoes/index.html (${l}): keeps the ${R.season} price on renewal; every level renews at the ${next} rate card`);
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
// - SITE.requestsApi, the booking-request Worker (worker/README.md): /admin/ (the hub), /admin/espacos/;
// - SITE.stats.url, the statistics Worker (stats-worker/README.md): /admin/, /admin/espacos/ and /admin/analytics/.
// The hub (/admin/) reads the site's own data files ('self'), the Pedidos Worker (requests, contracts, supporters) and
// the statistics Worker (visits and logo clicks of the last 7 days); it never writes to GitHub, so no api.github.com.
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
  'admin/index.html': ["'self'", worker, stats],
  'admin/espacos/index.html': ["'self'", 'https://api.github.com', 'https://gocarmo.com', worker, stats],
  // the supporters page talks to the Pedidos Worker only (the names live in its KV, never in git)
  'admin/apoiantes/index.html': ["'self'", worker],
  'admin/analytics/index.html': ["'self'", stats],
  // - SITE.requestsApi also: /admin/patrocinios/ (the sponsor contracts are kept by the same Worker); its montra editor
  //   commits through the GitHub API and then waits for gocarmo.com, as /admin/ does
  'admin/patrocinios/index.html': ["'self'", 'https://api.github.com', 'https://gocarmo.com', worker],
};
CONNECT['admin/documentos/index.html'] = ["'self'", 'https://api.github.com', 'https://raw.githubusercontent.com'];
// the merch page: its own files ('self'), blob: (GLTFLoader reads the model's embedded textures through a blob: URL, with
// fetch in Chrome) and the booking Worker for the wall's published names (GET /apoiantes/nomes, a public route)
CONNECT['admin/merch/index.html'] = ["'self'", 'blob:', worker];
const connect = (s, list) => s.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?connect-src )[^;"]*/, (m, head) => `${head}${list.filter(Boolean).join(' ')}`);

// ---------- GOCARMO Ride (/ride/) ----------
// Hidden until the launch: set to false on the day the page is linked from the site (and then take the robots meta out
// of ride/index.html). While true, the checks below keep the page out of the index, the sitemap and every other page.
const RIDE_HIDDEN = false;
const RIDE_PAGE = 'ride/index.html';
// the game's host: one line of assets/js/ride-config.js
function rideOrigin() {
  const m = readFileSync('assets/js/ride-config.js', 'utf8').match(/^export const RIDE_ORIGIN = '([^']*)';/m);
  if (!m) throw new Error("assets/js/ride-config.js: no «export const RIDE_ORIGIN = '…';» line (keep it on one line)");
  let u;
  try { u = new URL(m[1]); } catch (_) { throw new Error(`assets/js/ride-config.js: RIDE_ORIGIN is not an address (${m[1]})`); }
  if (u.protocol !== 'https:' || u.origin !== m[1]) throw new Error(`assets/js/ride-config.js: RIDE_ORIGIN has to be an https:// origin, with no path and no slash at the end (${m[1]})`);
  // one host, by name: «https://*.gocarmo.com» is an origin to new URL() and a wildcard in a Content-Security-Policy
  if (!/^https:\/\/(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?$/.test(m[1])) throw new Error(`assets/js/ride-config.js: RIDE_ORIGIN has to be a plain host name, no wildcard (${m[1]})`);
  return u.origin;
}
const RIDE = rideOrigin();
// every <a data-ride> of a page links to the game itself (its href is written from RIDE_ORIGIN); returns the page and
// how many there are
function rideLinks(s, page, ride) {
  let n = 0;
  const now = s.replace(/<a\b[^>]*\bdata-ride\b[^>]*>/g, (tag) => {
    if (!/\bhref="[^"]*"/.test(tag)) throw new Error(`${page}: an <a data-ride> without href`);
    n++;
    return tag.replace(/\bhref="[^"]*"/, `href="${ride}/"`);
  });
  return [now, n];
}
// the forwarder as it has to be: its stylesheets' hashes, the host in its links and in its refresh meta
function stampRide(was, ride) {
  const [now, links] = rideLinks(stamp(was, '../'), RIDE_PAGE, ride);
  if (!links) throw new Error(`${RIDE_PAGE}: no <a data-ride> (the button to the game, for a browser that does not follow the refresh)`);
  const re = /(<meta http-equiv="refresh" content=")[^"]*(")/;
  if (!re.test(now)) throw new Error(`${RIDE_PAGE}: no <meta http-equiv="refresh" content="0; url=…"> (the page forwards to the game)`);
  return now.replace(re, (m, a, z) => `${a}0; url=${ride}/${z}`);
}
function checkRide(page, ride) {
  const out = [];
  const html = page.replace(/<!--[\s\S]*?-->/g, ' ');
  const plain = (h) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  // the policy, word for word: nothing but the page's own stylesheets, fonts and pictures; no script at all, no call
  // and no frame (the refresh meta is a navigation, which no directive of a policy in a <meta> governs)
  const policy = (html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)"/) || [, ''])[1];
  const want = "default-src 'none'; style-src 'self'; font-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
  if (policy !== want) out.push(`${RIDE_PAGE}: its Content-Security-Policy is «${policy}», want «${want}»`);
  // a policy in a <meta> only governs what comes after it
  const first = html.search(/<(script|link)\b/), meta = html.search(/<meta http-equiv="Content-Security-Policy"/);
  if (meta < 0 || (first >= 0 && meta > first)) out.push(`${RIDE_PAGE}: the Content-Security-Policy meta has to come before every script and stylesheet`);
  if (/<i?frame\b/i.test(html)) out.push(`${RIDE_PAGE}: a frame in the HTML (the game opens as a full page on its own host)`);
  if (/<script\b/i.test(html)) out.push(`${RIDE_PAGE}: a script (the forwarder has none: the refresh meta and the button do the work)`);
  if (/\sstyle="/i.test(html) || /<style\b/i.test(html)) out.push(`${RIDE_PAGE}: an inline style (the policy refuses it)`);
  const refresh = html.match(/<meta http-equiv="refresh"[^>]*>/gi) || [];
  if (refresh.length !== 1 || refresh[0] !== `<meta http-equiv="refresh" content="0; url=${ride}/">`) out.push(`${RIDE_PAGE}: one <meta http-equiv="refresh" content="0; url=${ride}/">, no other`);
  // a link shared before keeps its picture
  const og = (html.match(/<meta property="og:image" content="([^"]*)"/) || [])[1];
  if (og !== 'https://gocarmo.com/ride/og.jpg' || !existsSync('ride/og.jpg')) out.push(`${RIDE_PAGE}: <meta property="og:image" content="https://gocarmo.com/ride/og.jpg"> and the file ride/og.jpg (the picture of a shared link)`);
  // the home page's module: the host lives in one place, ride-config.js, and the call is a plain one
  // (without its comment lines; a «//» inside a line is left alone, since an address has one)
  const js = readFileSync('assets/js/ride.js', 'utf8').replace(/^\s*\/\/.*$/gm, '');
  if (!/import \{ RIDE_ORIGIN \} from '\.\/ride-config\.js';/.test(js)) out.push("assets/js/ride.js: has to import { RIDE_ORIGIN } from './ride-config.js'");
  if (/https?:\/\//.test(js)) out.push('assets/js/ride.js: names an address of its own (the game\'s host is in assets/js/ride-config.js only)');
  if (/\biframe\b|\bframe\b|sandbox/i.test(js)) out.push('assets/js/ride.js: makes a frame (the game opens as a full page on its own host, never inside the site)');
  if (/\b(innerHTML|outerHTML|insertAdjacentHTML|srcdoc|document\.write|eval|location|URLSearchParams|postMessage)\b/.test(js)) out.push('assets/js/ride.js: no HTML sink, no eval and nothing read from the address (the line is textContent)');
  for (const need of ["credentials: 'omit'", "redirect: 'error'", "referrerPolicy: 'no-referrer'"]) if (!js.includes(need)) out.push(`assets/js/ride.js: the call to the game has to say ${need}`);
  // live: the home page has the section, its link to the game and its module, and the hero button goes to the game
  const IX = RIDE_HIDDEN ? '' : readFileSync('index.html', 'utf8').replace(/<!--[\s\S]*?-->/g, ' ');
  const sec = (IX.match(/<section class="ride-home" id="ride"[\s\S]*?<\/section>/) || [''])[0];
  if (RIDE_HIDDEN) { /* hidden: the checks at the end keep every way in out */ } else if (!sec) out.push('index.html: no <section class="ride-home" id="ride"> (the game on the home page)');
  else {
    if (!/<a\b[^>]*\bdata-ride\b/.test(sec)) out.push('index.html #ride: no <a data-ride> (the button to the game)');
    if (!/\bid="ride-live"[^>]*\bhidden\b/.test(sec)) out.push('index.html #ride: the live line (id="ride-live") has to start hidden (ride.js shows it only with an answer)');
    if (!/src="ride\/poster-800\.jpg"/.test(sec)) out.push('index.html #ride: the poster (ride/poster-800.jpg)');
  }
  if (!RIDE_HIDDEN && !/<script type="module" src="assets\/js\/ride\.js\?v=[0-9a-f]+" data-optional><\/script>/.test(IX)) out.push('index.html: no <script type="module" src="assets/js/ride.js" data-optional> (the live line; optional: its failure breaks nothing)');
  if (!RIDE_HIDDEN && !/<a\b[^>]*\bdata-ride\b[^>]*data-i18n="hero\.cta3"/.test(IX)) out.push('index.html: the hero button «Pedalar no GOCARMO Ride» (hero.cta3) has to be an <a data-ride>');
  // the credits, in both languages: a modified version of OpenRadlr, under the GNU AGPL, with both repositories
  const credits = (html.match(/<div class="rd-credits"[^>]*>([\s\S]*?)<\/div>/) || [, ''])[1];
  for (const [l, words] of [['pt', ['Baseado em OpenRadlr', 'versão modificada do OpenRadlr', '© The OpenRadlr contributors', 'GNU AGPL, versão 3 ou posterior', 'Não é o OpenRadlr oficial', 'Código-fonte', 'Projeto original']],
    ['en', ['Based on OpenRadlr', 'modified version of OpenRadlr', '© The OpenRadlr contributors', 'GNU AGPL, version 3 or later', 'not the official OpenRadlr', 'Source code', 'Original project']]]) {
    const text = plain([...credits.matchAll(new RegExp(`<span data-l="${l}"[^>]*>([\\s\\S]*?)</span>`, 'g'))].map((m) => m[1]).join(' '));
    for (const w of words) if (!text.includes(w)) out.push(`${RIDE_PAGE} (${l}): the credits have to say «${w}»`);
  }
  for (const href of ['https://github.com/rgvduarte/carmo/tree/gocarmo-ride', 'https://github.com/Lethonium/OpenRadlr']) {
    if (!credits.includes(`href="${href}"`)) out.push(`${RIDE_PAGE}: the credits have to link to ${href}`);
  }
  // the privacy page says what this page sends to the game's host, in both languages
  const host = new URL(ride).host, privacy = readFileSync('privacidade/index.html', 'utf8');
  for (const l of ['pt', 'en']) {
    const art = (privacy.replace(/<!--[\s\S]*?-->/g, ' ').match(new RegExp(`<article data-l="${l}"[\\s\\S]*?</article>`)) || [''])[0];
    if (!/<h2[^>]*>GOCARMO Ride<\/h2>/.test(art) || !art.includes(host)) out.push(`privacidade/index.html (${l}): has to say what the site sends to ${host} (a section «GOCARMO Ride» that names the host; after a change of host, change the name in that text too)`);
  }
  // launched: the page must not still ask the search engines to stay away, and the privacy page names who hosts the game
  if (!RIDE_HIDDEN && /<meta name="robots"[^>]*noindex/i.test(html)) out.push(`${RIDE_PAGE}: still has <meta name="robots" content="noindex…"> (RIDE_HIDDEN is false: the page is live)`);
  if (!RIDE_HIDDEN && /RIDE-HOST-TODO/.test(privacy)) out.push('privacidade/index.html: still has the note RIDE-HOST-TODO (RIDE_HIDDEN is false: name the company that hosts the game server, its country and what its logs keep, in both languages, then delete the note)');
  if (RIDE_HIDDEN) {
    if (!/<meta name="robots" content="noindex, nofollow">/.test(html)) out.push(`${RIDE_PAGE}: no <meta name="robots" content="noindex, nofollow"> (the page is hidden until the launch: RIDE_HIDDEN)`);
    // no way in from the rest of the site: no page, stylesheet, module or data file of another page names /ride/ (as
    // a path, in any case: «ride/», «ride/og.jpg», «../ride», «/ride», «./ride», a whole attribute «ride», or
    // «gocarmo.com/ride»; the word «ride» in a sentence is not one) or the game's host (as an address anywhere; as a
    // bare name anywhere but in the privacy page's text, which has to name it)
    const toRide = /(?:["'`(=\s]|gocarmo\.com\/)(?:\.{0,2}\/)*ride\/(?:[\w.-]+\.[a-z0-9]{2,5})?["'`#?)\s<>\\]|(?:\.{1,2}\/|["'`(=]\/)ride["'`#?)\s>\\]|(?:href|src|action|content|url)\s*[=:]\s*["'`]?ride["'`#?\s>]|gocarmo\.com\/ride(?![\w-])/i;
    const pages = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = dir === '.' ? e.name : `${dir}/${e.name}`;
      if (e.isDirectory()) return /^(\.git|node_modules|ride|worker|stats-worker|wallet|scripts)$/.test(p) || p === 'assets/vendor' || p === 'assets/img' || p === 'assets/fonts' ? [] : pages(p);
      return /\.(html|js|css|xml|txt|webmanifest|json)$/.test(e.name) && !/^assets\/(js\/ride(-config)?\.js|css\/ride\.css)$/.test(p) ? [p] : [];
    });
    for (const p of pages('.')) {
      const text = readFileSync(p, 'utf8');
      // the import map names the page's modules (assets/js/ride.js), never the page
      const body = p.endsWith('.html') ? text.replace(/<script type="importmap">[\s\S]*?<\/script>/, '') : text;
      if (toRide.test(body)) out.push(`${p}: names /ride/ (the page is hidden until the launch: RIDE_HIDDEN)`);
      const low = body.toLowerCase();
      if (low.includes(`//${host}`) || (p !== 'privacidade/index.html' && low.includes(host))) out.push(`${p}: names the game's host (hidden until the launch: RIDE_HIDDEN)`);
    }
  }
  return out;
}
{
  const ride = RIDE, was = readFileSync(RIDE_PAGE, 'utf8'), now = stampRide(was, ride);
  const problems = checkRide(now, ride);
  if (problems.length) {
    console.error(`GOCARMO Ride (/ride/):\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  if (now !== was) {
    stale.push(RIDE_PAGE);
    if (!check) writeFileSync(RIDE_PAGE, now);
  }
}

for (const [page, base, withRaces] of [['index.html', './', true], ['admin/index.html', '../', false], ['admin/espacos/index.html', '../../', false], ['admin/apoiantes/index.html', '../../', false], ['admin/strava/index.html', '../../', false], ['admin/analytics/index.html', '../../', false], ['admin/patrocinios/index.html', '../../', false], ['privacidade/index.html', '../', false], ['condicoes/index.html', '../', false], ['cartao/index.html', '../', false], ['imprensa/index.html', '../', false], ['press/index.html', '../', false]]) {
  const was = readFileSync(page, 'utf8');
  let now = rideLinks(stamp(withRaces ? bake(was) : was, base), page, RIDE)[0];
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
stampMerchPages();
// the merch page (/admin/merch/): the same stamp, and its connect-src
function stampMerchPages() {
  const page = 'admin/merch/index.html', was = readFileSync(page, 'utf8');
  let now = stamp(was, '../../');
  if (!/connect-src /.test(now)) throw new Error(`${page}: its Content-Security-Policy has no connect-src`);
  now = connect(now, CONNECT[page]);
  if (now === was) return;
  stale.push(page);
  if (!check) writeFileSync(page, now);
}
if (check) {
  if (stale.length) { console.error(`out of date: ${stale.join(', ')}. Run node scripts/stamp.mjs`); process.exit(1); }
  console.log(`up to date: ${RESULTS.length} races, ${modules.length} modules`);
} else {
  const reach = [worker && `the admin and Patrocínios pages may reach ${worker}`, stats ? `the admin pages may reach ${stats}` : 'the statistics reach no Worker yet (SITE.stats.url is empty)'].filter(Boolean);
  console.log(`stamped ${modules.length} modules, baked ${races.cards.length} race cards${stale.length ? ` (${stale.join(', ')} updated)` : ''}; ${reach.join('; ')}`);
}
