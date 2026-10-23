// Run from the repo root before publishing: node scripts/stamp.mjs
// (node scripts/stamp.mjs --check changes nothing and fails when a page is out of date.)
//
// 1. Writes the «Todas as provas» cards into index.html from RESULTS (assets/js/data.js), in Portuguese, with the same
//    renderer as the live page (assets/js/races.js): the page without JS and the printed media kit show every race,
//    and the JS render on load moves nothing. It stops if a race lacks something the cards need.
// 2. Gives every own module and stylesheet a content hash in its URL, so a browser never runs files from two deploys
//    together (GitHub Pages lets browsers keep files for 10 minutes). The import map in each page sends
//    './assets/js/x.js' to './assets/js/x.js?v=<hash>', which covers static imports, import() and import.meta.resolve().
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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
  s = s.replace(/(<link rel="stylesheet" href=")((?:\.\.\/)?assets\/css\/[^"?]+)(?:\?v=[0-9a-f]+)?(")/g, (m, a, href, z) => `${a}${href}?v=${hash(own(href))}${z}`);
  return s;
}

const stale = [];
for (const [page, base, withRaces] of [['index.html', './', true], ['admin/index.html', '../', false]]) {
  const was = readFileSync(page, 'utf8');
  const now = stamp(withRaces ? bake(was) : was, base);
  if (now === was) continue;
  stale.push(page);
  if (!check) writeFileSync(page, now);
}
if (check) {
  if (stale.length) { console.error(`out of date: ${stale.join(', ')}. Run node scripts/stamp.mjs`); process.exit(1); }
  console.log(`up to date: ${RESULTS.length} races, ${modules.length} modules`);
} else console.log(`stamped ${modules.length} modules, baked ${races.cards.length} race cards${stale.length ? ` (${stale.join(', ')} updated)` : ''}`);
