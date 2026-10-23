// Gives every own module and stylesheet a content hash in its URL, so a browser never runs files from two deploys
// together (GitHub Pages lets browsers keep files for 10 minutes). The import map in each page sends './assets/js/x.js'
// to './assets/js/x.js?v=<hash>', which covers static imports, import() and import.meta.resolve().
// Run from the repo root before publishing: node scripts/stamp.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);
const modules = readdirSync('assets/js').filter((f) => f.endsWith('.js')).sort();

// A worker has no import map, so the mesh worker's own imports carry their hash in the file. Leaf first, so a change to
// suit-body.js changes suit-mesh.js, then suit-worker.js, then the worker's URL in the map.
const DEPS = [['suit-mesh.js', 'suit-body.js'], ['suit-worker.js', 'suit-mesh.js']];
for (const [f, dep] of DEPS) {
  const p = `assets/js/${f}`, re = new RegExp(`(from '\\./${dep.replace('.', '\\.')})(?:\\?v=[0-9a-f]+)?'`);
  const s = readFileSync(p, 'utf8');
  if (!re.test(s)) throw new Error(`${p}: no import of ./${dep}`);
  writeFileSync(p, s.replace(re, `$1?v=${hash(`assets/js/${dep}`)}'`));
}

function stamp(page, base) {
  let s = readFileSync(page, 'utf8');
  s = s.replace(/<script type="importmap">([\s\S]*?)<\/script>/, (m, body) => {
    const imports = JSON.parse(body).imports;
    for (const k of Object.keys(imports)) if (k.startsWith(`${base}assets/js/`)) delete imports[k];
    for (const f of modules) imports[`${base}assets/js/${f}`] = `${base}assets/js/${f}?v=${hash(`assets/js/${f}`)}`;
    const lines = Object.entries(imports).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    return `<script type="importmap">\n{ "imports": {\n${lines.join(',\n')}\n} }\n</script>`;
  });
  // a page with a CSP (admin) allows its inline import map by hash: a stale hash blocks the map, so 'three' never resolves
  const map = s.match(/<script type="importmap">([\s\S]*?)<\/script>/)[1];
  const sha = createHash('sha256').update(map, 'utf8').digest('base64');
  s = s.replace(/(script-src[^;"]*?)'sha256-[A-Za-z0-9+/=]+'/, (m, a) => `${a}'sha256-${sha}'`);
  // the entry module and the stylesheets are loaded by the page itself, outside the import map
  const own = (url) => url.replace(base, '');
  s = s.replace(/(<script type="module" src=")([^"?]+)(?:\?v=[0-9a-f]+)?(")/g, (m, a, src, z) => `${a}${src}?v=${hash(own(src))}${z}`);
  s = s.replace(/(<link rel="stylesheet" href=")((?:\.\.\/)?assets\/css\/[^"?]+)(?:\?v=[0-9a-f]+)?(")/g, (m, a, href, z) => `${a}${href}?v=${hash(own(href))}${z}`);
  writeFileSync(page, s);
}

stamp('index.html', './');
stamp('admin/index.html', '../');
console.log(`stamped ${modules.length} modules`);
