// Draws the images of Gonçalo's contact card from the brand files in wallet/marca/ (SVG, text already in outlines)
// and the site's fonts, in a headless browser. Run from the repo root, after python3 scripts/cartao.py:
//
//   node scripts/cartao-images.mjs [folder]     (needs Playwright: npm i -g playwright, or PLAYWRIGHT=/path/to/playwright;
//                                                CHROMIUM=/path/to/chromium for a browser outside Playwright's)
//
// Always writes the pass images Apple asks for, at @1x, @2x and @3x (sizes in points, Human Interface Guidelines,
// «Wallet», January 2025):
//   wallet/cartao/icon{,@2x,@3x}.png   38 x 38 pt: the symbol on the brand's black (the system rounds the corners)
//   wallet/cartao/logo{,@2x,@3x}.png   50 pt high, at most 160 pt wide: symbol + GO CARMO, transparent
// (the thumbnail, the photo, comes from scripts/cartao.py.)
// With a folder, it also writes there, for the owner and not for the site:
//   preview-front.png, preview-back.png   the pass as Wallet shows a generic pass (an approximation, for approval)
//   qr-cartao-iphone.png                  1179 x 2556, a lock-screen or photo image with the QR of /cartao/
//   qr-cartao-quadrado.png                1080 x 1080, the same for sharing
// No network: the page is served from this repo through a made-up origin, and every other request is refused.
import { createRequire } from 'module';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : null;
const ORIGIN = 'http://cartao.render';
const read = (p) => readFileSync(path.join(ROOT, p));
const svg = (p) => read(p).toString('utf8').replace(/^<\?xml[^>]*>\s*/, '');
const TYPES = { '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.css': 'text/css' };

const PASS = JSON.parse(read('wallet/cartao/pass.json'));
const G = PASS.generic;
const rgb = (s) => s.replace(/\s+/g, '');
const BG = rgb(PASS.backgroundColor), FG = rgb(PASS.foregroundColor), LB = rgb(PASS.labelColor);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const FONTS = `
@font-face { font-family: Anton; src: url(/assets/fonts/anton-latin.woff2) format('woff2'); }
@font-face { font-family: Anton; src: url(/assets/fonts/anton-latin-ext.woff2) format('woff2'); unicode-range: U+0100-024F; }
@font-face { font-family: Inter; font-weight: 100 900; src: url(/assets/fonts/inter-latin.woff2) format('woff2'); }
@font-face { font-family: JetBrains Mono; font-weight: 100 800; src: url(/assets/fonts/jetbrains-mono-latin.woff2) format('woff2'); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { background: transparent; }
svg { display: block; }
.mark { color: #f2f1ec; --accent: #e6b450; }`;
const page = (body, css = '') => `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}${css}</style></head><body>${body}</body></html>`;

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] } : {});
let html = '';
async function shot(w, h, scale, body, css, file, { transparent = false, el = null } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.origin !== ORIGIN) return r.abort();
    if (u.pathname === '/__h.html') return r.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
    try {
      return r.fulfill({ contentType: TYPES[path.extname(u.pathname)] || 'application/octet-stream', body: read(decodeURIComponent(u.pathname.slice(1))) });
    } catch (_) { return r.fulfill({ status: 404, body: '' }); }
  });
  const p = await ctx.newPage();
  html = page(body, css);
  await p.goto(`${ORIGIN}/__h.html`);
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  const buf = await (el ? p.locator(el) : p).screenshot({ omitBackground: transparent, type: 'png' });
  await ctx.close();
  writeFileSync(file, buf);
  return buf;
}

// ---- pass images ----------------------------------------------------------------------------------------------------
const SYMBOL = svg('wallet/marca/symbol.svg');
const GOCARMO = svg('wallet/marca/go-carmo-h.svg');
const vb = GOCARMO.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const LOGO_W = Math.min(160, Math.round((50 * vb[2]) / vb[3]));
for (const [k, s] of [[1, ''], [2, '@2x'], [3, '@3x']]) {
  // the symbol at 72 % of the square, on the brand's black, like the site's app icons
  await shot(38, 38, k, `<div class="mark ic">${SYMBOL}</div>`,
    `.ic { width: 38px; height: 38px; background: ${BG}; display: grid; place-items: center; } .ic svg { width: 27.4px; height: 27.4px; }`,
    path.join(ROOT, `wallet/cartao/icon${s}.png`));
  await shot(LOGO_W, 50, k, `<div class="mark lg">${GOCARMO}</div>`,
    `.lg, .lg svg { width: ${LOGO_W}px; height: 50px; }`, path.join(ROOT, `wallet/cartao/logo${s}.png`), { transparent: true });
}
console.log(`pass images: icon 38 pt, logo ${LOGO_W} x 50 pt, each @1x/@2x/@3x`);

if (OUT) {
  mkdirSync(OUT, { recursive: true });
  // Wallet draws the barcode itself, black on a white tile; the preview uses the same QR as the page, recoloured
  const qrWallet = svg('cartao/qr.svg').replace('#f2f1ec', '#ffffff').replace('#111112', '#000000');
  const qrPaper = svg('cartao/qr.svg');
  const field = (f, cls = '') => `<div class="f ${cls}"><div class="l">${esc(f.label || '')}</div><div class="v">${esc(f.value)}</div></div>`;
  const B = PASS.barcodes[0];

  // front: a generic pass on a 390 pt iPhone (the pass is 358 pt wide), in Wallet's layout: logo and header fields,
  // primary field with the thumbnail beside it, secondary and auxiliary rows, the barcode on its white tile
  const front = `
  <div class="screen">
    <div class="pass">
      <div class="top"><img class="logo" src="/wallet/cartao/logo@3x.png" alt="">
        <div class="hdr">${G.headerFields.map((f) => field(f, 'r')).join('')}</div></div>
      <div class="mid">
        <div class="prim">${G.primaryFields.map((f) => `<div class="l">${esc(f.label)}</div><div class="pv">${esc(f.value)}</div>`).join('')}</div>
        <img class="thumb" src="/wallet/cartao/thumbnail@3x.png" alt="">
      </div>
      <div class="row">${G.secondaryFields.map((f, i) => field(f, i ? 'r' : '')).join('')}</div>
      <div class="row">${G.auxiliaryFields.map((f, i) => field(f, i ? 'r' : '')).join('')}</div>
      <div class="code"><div class="tile">${qrWallet}<div class="alt">${esc(B.altText)}</div></div></div>
    </div>
    <p class="cap">Frente do passe (aproximação do Wallet no iPhone)</p>
  </div>`;
  const frontCss = `
  body { background: #000; }
  .screen { width: 390px; padding: 22px 16px 18px; font-family: Inter, system-ui, sans-serif; }
  .pass { background: ${BG}; color: ${FG}; border-radius: 14px; padding: 12px 14px 18px; box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
  .top { display: flex; justify-content: space-between; align-items: flex-start; height: 50px; }
  .logo { height: 50px; width: auto; }
  .f .l { color: ${LB}; font-size: 10.5px; font-weight: 600; letter-spacing: .02em; line-height: 1.3; white-space: nowrap; }
  .f .v { font-size: 16px; line-height: 1.3; white-space: nowrap; letter-spacing: -.01em; }
  .hdr .f .v { font-size: 20px; }
  .r { text-align: right; }
  .mid { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 18px; gap: 10px; }
  .prim .l { color: ${LB}; font-size: 10.5px; font-weight: 600; letter-spacing: .02em; }
  .prim .pv { font-size: 30px; font-weight: 300; letter-spacing: -.02em; line-height: 1.15; margin-top: 2px; }
  .thumb { width: 90px; height: 90px; }
  .row { display: flex; justify-content: space-between; margin-top: 16px; gap: 12px; }
  .code { display: grid; place-items: center; margin-top: 26px; }
  .tile { background: #fff; border-radius: 8px; padding: 8px 8px 6px; width: 156px; }
  .tile svg { width: 140px; height: 140px; }
  .alt { color: #000; font-size: 11px; text-align: center; margin-top: 2px; }
  .cap { color: #8a8983; font: 500 10px/1.3 'JetBrains Mono', monospace; letter-spacing: .08em; text-transform: uppercase; text-align: center; margin-top: 14px; }`;
  await shot(390, 900, 3, front, frontCss, path.join(OUT, 'preview-front.png'), { el: '.screen' });

  // back: since iOS 16 the back fields open as a details sheet; links in the system tint
  const link = (f) => (f.attributedValue ? esc(f.attributedValue.replace(/<a [^>]*>(.*?)<\/a>/g, '\u0001$1\u0002')).replace(/\u0001/g, '<a>').replace(/\u0002/g, '</a>') : esc(f.value));
  const back = `
  <div class="screen">
    <div class="sheet">
      <div class="bar"><span class="done">OK</span><span class="t">Detalhes do passe</span><span></span></div>
      <div class="head"><img src="/wallet/cartao/icon@3x.png" alt=""><div><b>${esc(PASS.organizationName)}</b><small>${esc(PASS.description)}</small></div></div>
      <div class="grp">${G.backFields.map((f) => `<div class="bf"><div class="bl">${esc(f.label)}</div><div class="bv${f.dataDetectorTypes ? ' tel' : ''}">${link(f)}</div></div>`).join('')}</div>
    </div>
    <p class="cap">Verso do passe (aproximação do Wallet no iPhone)</p>
  </div>`;
  const backCss = `
  body { background: #000; }
  .screen { width: 390px; padding: 22px 0 18px; font-family: Inter, system-ui, sans-serif; color: #fff; }
  .sheet { background: #1c1c1e; border-radius: 14px 14px 0 0; padding: 0 0 18px; }
  .bar { display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; height: 52px; padding: 0 16px; font-size: 16px; }
  .bar .done { color: #0a84ff; font-weight: 600; }
  .bar .t { font-weight: 600; }
  .head { display: flex; gap: 12px; align-items: center; margin: 4px 16px 16px; }
  .head img { width: 44px; height: 44px; border-radius: 10px; }
  .head b { display: block; font-size: 17px; }
  .head small { display: block; color: #98989f; font-size: 13px; margin-top: 1px; }
  .grp { margin: 0 16px; background: #2c2c2e; border-radius: 12px; }
  .bf { padding: 10px 14px 11px; }
  .bf + .bf { border-top: .5px solid #48484a; }
  .bl { color: #98989f; font-size: 13px; }
  .bv { font-size: 16px; line-height: 1.35; margin-top: 1px; }
  .bv a, .bv.tel { color: #0a84ff; }
  .cap { color: #8a8983; font: 500 10px/1.3 'JetBrains Mono', monospace; letter-spacing: .08em; text-transform: uppercase; text-align: center; margin-top: 14px; }`;
  await shot(390, 1000, 3, back, backCss, path.join(OUT, 'preview-back.png'), { el: '.screen' });

  // lock screen / photo, iPhone 15 to 17 Pro (393 x 852 pt @3x = 1179 x 2556 px). The clock and the date take the top
  // ~240 pt and the torch and camera buttons the bottom ~90 pt: everything sits between them.
  const phone = `
  <div class="ph">
    <div class="mark logo">${GOCARMO}</div>
    <h1>Gonçalo Carmo</h1>
    <p class="role">Triatleta · Lisboa</p>
    <div class="qr">${qrPaper}</div>
    <p class="url">gocarmo.com/cartao</p>
    <p class="hint">Aponta a câmara para abrir o meu cartão</p>
  </div>`;
  const phoneCss = `
  .ph { width: 393px; height: 852px; background: ${BG}; color: #f2f1ec; display: flex; flex-direction: column; align-items: center; padding-top: 268px; font-family: Inter, sans-serif; }
  .logo svg { height: 40px; width: auto; }
  h1 { font: italic 400 40px/1 Anton, Impact, sans-serif; text-transform: uppercase; letter-spacing: .005em; margin-top: 20px; font-synthesis: style; }
  .role { font: 500 11px/1 'JetBrains Mono', monospace; letter-spacing: .2em; text-transform: uppercase; color: #e6b450; margin-top: 12px; }
  .qr { width: 236px; height: 236px; margin-top: 26px; border-radius: 18px; overflow: hidden; }
  .qr svg { width: 100%; height: 100%; }
  .url { font: 500 15px/1 'JetBrains Mono', monospace; letter-spacing: .04em; margin-top: 18px; }
  .hint { font-size: 12.5px; color: #a3a29c; margin-top: 9px; }`;
  await shot(393, 852, 3, phone, phoneCss, path.join(OUT, 'qr-cartao-iphone.png'));

  const square = `
  <div class="sq">
    <div class="mark logo">${GOCARMO}</div>
    <h1>Gonçalo Carmo</h1>
    <p class="role">Triatleta · Lisboa</p>
    <div class="qr">${qrPaper}</div>
    <p class="url">gocarmo.com/cartao</p>
  </div>`;
  const squareCss = `
  .sq { width: 360px; height: 360px; background: ${BG}; color: #f2f1ec; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Inter, sans-serif; }
  .logo svg { height: 28px; width: auto; }
  h1 { font: italic 400 28px/1 Anton, Impact, sans-serif; text-transform: uppercase; margin-top: 12px; font-synthesis: style; }
  .role { font: 500 8.5px/1 'JetBrains Mono', monospace; letter-spacing: .2em; text-transform: uppercase; color: #e6b450; margin-top: 8px; }
  .qr { width: 168px; height: 168px; margin-top: 14px; border-radius: 12px; overflow: hidden; }
  .qr svg { width: 100%; height: 100%; }
  .url { font: 500 11px/1 'JetBrains Mono', monospace; letter-spacing: .04em; margin-top: 12px; }`;
  await shot(360, 360, 3, square, squareCss, path.join(OUT, 'qr-cartao-quadrado.png'));
  console.log(`previews and QR images in ${OUT}`);
}
await browser.close();
