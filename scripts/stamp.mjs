// Run from the repo root before publishing: node scripts/stamp.mjs
// (node scripts/stamp.mjs --check changes nothing and fails when a page is out of date.)
//
// 1. Writes the «Todas as provas» cards into index.html from RESULTS (assets/js/data.js), in Portuguese, with the same
//    renderer as the live page (assets/js/races.js): the page without JS and the printed media kit show every race,
//    and the JS render on load moves nothing. It stops if a race lacks something the cards need.
// 2. Gives every own module and stylesheet a content hash in its URL, so a browser never runs files from two deploys
//    together (GitHub Pages lets browsers keep files for 10 minutes). The import map in each page sends
//    './assets/js/x.js' to './assets/js/x.js?v=<hash>', which covers static imports, import() and import.meta.resolve().
// 3. A page with a Content-Security-Policy runs an inline script (the import map) only if script-src lists its sha256,
//    so every rewrite also recomputes those hashes from the inline scripts the page now holds; the admin page's
//    connect-src also gets the booking Worker's origin (SITE.requestsApi).
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

// The admin page reaches the booking-request Worker (SITE.requestsApi in assets/js/data.js, worker/README.md) only if
// its CSP lets it: that address goes into connect-src, after the fixed ones, and leaves it when the setting is emptied.
const CONNECT = ["'self'", 'https://api.github.com', 'https://gocarmo.com'];
const api = (readFileSync('assets/js/data.js', 'utf8').match(/^\s*requestsApi:\s*'([^']*)'/m) || [])[1] || '';
let worker = '';
if (api.trim()) {
  const u = new URL(api.trim());
  if (u.protocol !== 'https:') throw new Error(`SITE.requestsApi has to be an https:// address (${api})`);
  worker = u.origin;
}
const connectWorker = (s) => s.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?connect-src )[^;"]*/, (m, head) => `${head}${[...CONNECT, worker].filter(Boolean).join(' ')}`);

const stale = [];
for (const [page, base, withRaces, withWorker] of [['index.html', './', true, false], ['admin/index.html', '../', false, true], ['admin/strava/index.html', '../../', false, false], ['privacidade/index.html', '../', false, false]]) {
  const was = readFileSync(page, 'utf8');
  let now = stamp(withRaces ? bake(was) : was, base);
  if (withWorker) now = connectWorker(now);
  if (now === was) continue;
  stale.push(page);
  if (!check) writeFileSync(page, now);
}
if (check) {
  if (stale.length) { console.error(`out of date: ${stale.join(', ')}. Run node scripts/stamp.mjs`); process.exit(1); }
  console.log(`up to date: ${RESULTS.length} races, ${modules.length} modules`);
} else console.log(`stamped ${modules.length} modules, baked ${races.cards.length} race cards${stale.length ? ` (${stale.join(', ')} updated)` : ''}${worker ? `; the admin page may reach ${worker}` : ''}`);
