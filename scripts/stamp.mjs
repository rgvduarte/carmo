// Gives every own module and stylesheet a content hash in its URL, so a browser never runs files from two deploys
// together (GitHub Pages lets browsers keep files for 10 minutes). The import map in each page sends './assets/js/x.js'
// to './assets/js/x.js?v=<hash>', which covers static imports, import() and import.meta.resolve().
// Run from the repo root before publishing: node scripts/stamp.mjs
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8);
const modules = readdirSync('assets/js').filter((f) => f.endsWith('.js')).sort();

function stamp(page, base) {
  let s = readFileSync(page, 'utf8');
  let map = null;
  s = s.replace(/<script type="importmap">([\s\S]*?)<\/script>/, (m, body) => {
    const imports = JSON.parse(body).imports;
    for (const k of Object.keys(imports)) if (k.startsWith(`${base}assets/js/`)) delete imports[k];
    for (const f of modules) imports[`${base}assets/js/${f}`] = `${base}assets/js/${f}?v=${hash(`assets/js/${f}`)}`;
    const lines = Object.entries(imports).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
    map = `\n{ "imports": {\n${lines.join(',\n')}\n} }\n`;
    return `<script type="importmap">${map}</script>`;
  });
  // a page with a CSP (the admin) allows its inline import map by hash: a new map needs its new hash, or the browser
  // drops the map and every bare import (three.js) fails
  s = s.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?)'sha256-[A-Za-z0-9+/=]+'/, (m, head) =>
    (map === null ? m : `${head}'sha256-${createHash('sha256').update(map).digest('base64')}'`));
  // the entry module and the stylesheets are loaded by the page itself, outside the import map
  const own = (url) => url.replace(base, '');
  s = s.replace(/(<script type="module" src=")([^"?]+)(?:\?v=[0-9a-f]+)?(")/g, (m, a, src, z) => `${a}${src}?v=${hash(own(src))}${z}`);
  s = s.replace(/(<link rel="stylesheet" href=")((?:\.\.\/)?assets\/css\/[^"?]+)(?:\?v=[0-9a-f]+)?(")/g, (m, a, href, z) => `${a}${href}?v=${hash(own(href))}${z}`);
  writeFileSync(page, s);
}

// The admin page reaches the booking-request Worker (SITE.requestsApi in assets/js/data.js, worker/README.md) only if
// its CSP lets it: that address goes into connect-src, after the fixed ones, and leaves it when the setting is emptied.
const CONNECT = ["'self'", 'https://api.github.com', 'https://gocarmo.com'];
function connectWorker(page) {
  const api = (readFileSync('assets/js/data.js', 'utf8').match(/^\s*requestsApi:\s*'([^']*)'/m) || [])[1] || '';
  let origin = '';
  if (api.trim()) {
    const u = new URL(api.trim());
    if (u.protocol !== 'https:') throw new Error(`SITE.requestsApi has to be an https:// address (${api})`);
    origin = u.origin;
  }
  const s = readFileSync(page, 'utf8');
  writeFileSync(page, s.replace(/(<meta http-equiv="Content-Security-Policy" content="[^"]*?connect-src )[^;"]*/, (m, head) => `${head}${[...CONNECT, origin].filter(Boolean).join(' ')}`));
  return origin;
}

stamp('index.html', './');
stamp('admin/index.html', '../');
const worker = connectWorker('admin/index.html');
console.log(`stamped ${modules.length} modules${worker ? `; the admin page may reach ${worker}` : ''}`);
