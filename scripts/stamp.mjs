// Gives every own module and stylesheet a content hash in its URL, so a browser never runs files from two deploys
// together (GitHub Pages lets browsers keep files for 10 minutes). The import map in each page sends './assets/js/x.js'
// to './assets/js/x.js?v=<hash>', which covers static imports, import() and import.meta.resolve().
// A page with a Content-Security-Policy runs an inline script (the import map) only if script-src lists its sha256,
// so every rewrite also recomputes those hashes from the inline scripts the page now holds.
// Run from the repo root before publishing: node scripts/stamp.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);
const modules = readdirSync('assets/js').filter((f) => f.endsWith('.js')).sort();

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

function stamp(page, base) {
  let s = readFileSync(page, 'utf8');
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
  s = cspHashes(s);
  writeFileSync(page, s);
}

stamp('index.html', './');
stamp('admin/index.html', '../');
stamp('admin/strava/index.html', '../../');
stamp('imprensa/index.html', '../');
stamp('press/index.html', '../');
console.log(`stamped ${modules.length} modules`);
