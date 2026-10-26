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
};
const connect = (s, list) => s.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?connect-src )[^;"]*/, (m, head) => `${head}${list.filter(Boolean).join(' ')}`);

for (const [page, base, withRaces] of [['index.html', './', true], ['admin/index.html', '../', false], ['admin/strava/index.html', '../../', false], ['admin/analytics/index.html', '../../', false], ['privacidade/index.html', '../', false]]) {
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
if (check) {
  if (stale.length) { console.error(`out of date: ${stale.join(', ')}. Run node scripts/stamp.mjs`); process.exit(1); }
  console.log(`up to date: ${RESULTS.length} races, ${modules.length} modules`);
} else {
  const reach = [worker && `the admin page may reach ${worker}`, stats ? `the admin pages may reach ${stats}` : 'the statistics reach no Worker yet (SITE.stats.url is empty)'].filter(Boolean);
  console.log(`stamped ${modules.length} modules, baked ${races.cards.length} race cards${stale.length ? ` (${stale.join(', ')} updated)` : ''}; ${reach.join('; ')}`);
}
