// Updates data/spots.json from a "Atualizar espaço do fato ou do capacete" issue (see .github/ISSUE_TEMPLATE/espaco.yml).
//   ISSUE_BODY="..." node scripts/spot-update.mjs      apply the form, print a reply in Markdown
//   node scripts/spot-update.mjs --template            rewrite the issue form from data/spots.json
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';

const SPOTS = 'data/spots.json';
const BRANDS = 'assets/img/brands';
const FORM = '.github/ISSUE_TEMPLATE/espaco.yml';
// No SVG: a logo is served from gocarmo.com, and an SVG opened on its own is a page there that can run script (the
// admin page keeps its token on that origin). The admin page converts an SVG to PNG; here, ask for a PNG.
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
// the bytes must be what the type says (the extension decides how gocarmo.com serves the file)
const MAGIC = {
  png: (b) => b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  webp: (b) => b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP',
};
const MAX_LOGO = 3 * 1024 * 1024;

const data = JSON.parse(await readFile(SPOTS, 'utf8'));
const pad2 = (n) => String(n).padStart(2, '0');
const eur = (n) => `${new Intl.NumberFormat('pt-PT').format(n)} €`;
const optionFor = (s) => `${pad2(s.n)} · ${s.pt.name} · ${eur(s.price)} (${s.id})`;
const TITLE_OPTION = `Fato completo · ${eur(data.title.price)} (fato)`;

if (process.argv.includes('--template')) {
  const opts = [...data.spots.map(optionFor), TITLE_OPTION].map((o) => `        - "${o}"`).join('\n');
  await mkdir('.github/ISSUE_TEMPLATE', { recursive: true });
  await writeFile(FORM, `name: Atualizar espaço do fato ou do capacete
description: Marca um espaço do fato ou do capacete como vendido, reservado ou outra vez disponível. O site atualiza-se sozinho em cerca de um minuto.
title: "Espaço do fato ou do capacete"
body:
  - type: markdown
    attributes:
      value: Só funciona para quem gere o repositório. Quando o pedido é aplicado, recebes uma resposta aqui e o pedido fecha.
  - type: dropdown
    id: spot
    attributes:
      label: Espaço
      options:
${opts}
    validations:
      required: true
  - type: dropdown
    id: status
    attributes:
      label: Estado
      options:
        - Vendido
        - Reservado
        - Disponível
    validations:
      required: true
  - type: input
    id: brand
    attributes:
      label: Marca
      description: O nome que aparece no site. Obrigatório para Vendido.
  - type: input
    id: url
    attributes:
      label: Link da marca
      description: O site, o Instagram ou a página de contacto da marca (https://marca.pt ou @marca). Só para Vendido, fica no logótipo no site. Opcional.
  - type: textarea
    id: logo
    attributes:
      label: Logótipo
      description: Anexa aqui um PNG com fundo transparente (ou um JPG ou WebP). Um SVG não serve; exporta-o em PNG primeiro. No telemóvel, toca no ícone de anexar. Aparece no modelo 3D. Opcional.
  - type: input
    id: until
    attributes:
      label: Reservado até
      description: Só para Reservado. Data no formato 2026-10-31. Se ficar vazio, são três dias. Depois disso o espaço volta a ficar disponível sozinho.
`);
  console.log(`Wrote ${FORM} with ${data.spots.length + 1} options.`);
  process.exit(0);
}

// ---------- parse the issue form ----------
const body = process.env.ISSUE_BODY || '';
const field = (label) => {
  const m = body.match(new RegExp(`###\\s*${label}\\s*\\n([\\s\\S]*?)(?=\\n###\\s|$)`));
  const v = m ? m[1].trim() : '';
  return v === '_No response_' ? '' : v;
};
const fail = (msg) => { console.log(`Não apliquei o pedido: ${msg}`); process.exit(1); };

const spotField = field('Espaço');
const id = (spotField.match(/\(([a-z0-9-]+)\)\s*$/) || [])[1];
if (!id) fail('não reconheci o espaço.');
const target = id === 'fato' ? data.title : data.spots.find((s) => s.id === id);
if (!target) fail(`o espaço "${id}" não existe em data/spots.json.`);
const label = id === 'fato' ? 'Fato completo' : `${pad2(target.n)} · ${target.pt.name}`;
// helmet spots ("item": "helmet") live on the 3D helmet and link to #capacete/<id>; the title is the whole suit
const onHelmet = target.item === 'helmet';
const link = id === 'fato' ? 'https://gocarmo.com/#fato' : `https://gocarmo.com/#${onHelmet ? 'capacete' : 'fato'}/${id}`;

const statusField = field('Estado');
const status = { Vendido: 'sold', Reservado: 'reserved', 'Disponível': 'available' }[statusField];
if (!status) fail('estado inválido.');

const brand = field('Marca').replace(/\s+/g, ' ').slice(0, 60);
if (status === 'sold' && !brand) fail('para marcar como vendido, preciso do nome da marca.');

// the brand's link: the rule of assets/js/season-rules.js brandLink (the site, the booking Worker and the admin page),
// copied here because this script runs on its own (https://, a bare domain or @marca; no spaces; at most 200 characters;
// a real domain, never an address, a port, a local name or gocarmo.com; an @handle with a letter or a digit). It goes on
// the spot with a sale only (Vendido).
function brandLink(raw) {
  const s0 = String(raw ?? '').normalize('NFC').trim();
  if (!s0) return { url: '' };
  if (Array.from(s0).length > 200) return { error: 'longo' };
  if (/\s/.test(s0) || /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/.test(s0)) return { error: 'espacos' };
  let href;
  if (s0.startsWith('@')) { if (!/^(?!\.)(?!.*\.\.)(?!.*\.$)(?=.*[A-Za-z0-9])[A-Za-z0-9._]{1,30}$/.test(s0.slice(1))) return { error: 'invalido' }; href = `https://www.instagram.com/${s0.slice(1)}/`; }
  else if (/^https:\/\//i.test(s0)) href = s0;
  else if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(s0)) return { error: 'esquema' };
  else href = `https://${s0}`;
  let u;
  try { u = new URL(href); } catch (_) { return { error: 'invalido' }; }
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !host || host.startsWith('[') || /^[\d.]+$/.test(host)
    || host === 'gocarmo.com' || host.endsWith('.gocarmo.com') || !/\.(?:[a-z]{2,}|xn--[a-z0-9-]+)$/.test(host)
    || /\.(?:localhost|local|internal|lan|home|corp|test|example|invalid|onion|alt|arpa)$/.test(host)) return { error: 'invalido' };
  if (u.href.length > 200) return { error: 'longo' };
  return { url: u.href };
}
const L = brandLink(field('Link da marca'));
if (L.error) fail(L.error === 'espacos' ? 'o link da marca não leva espaços.' : L.error === 'longo' ? 'o link da marca vai até 200 caracteres.' : 'o link da marca não serve: um endereço como marca.pt ou https://marca.pt (não http://), ou @marca.');
const url = L.url;

let until = field('Reservado até');
if (status === 'reserved') {
  if (!until) { const d = new Date(); d.setUTCDate(d.getUTCDate() + 3); until = d.toISOString().slice(0, 10); }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || Number.isNaN(Date.parse(until)) || new Date(until).toISOString().slice(0, 10) !== until) fail('a data de reserva tem de estar no formato 2026-10-31.');
  if (until < new Date().toISOString().slice(0, 10)) fail(`a data ${until} já passou.`);
}

// ---------- logo ----------
async function clearLogos() {
  try { for (const f of await readdir(BRANDS)) if (f.startsWith(`${id}.`)) await unlink(`${BRANDS}/${f}`); } catch (_) {}
}
async function saveLogo() {
  const src = (field('Logótipo').match(/https:\/\/(?:github\.com\/user-attachments\/assets\/|user-images\.githubusercontent\.com\/|private-user-images\.githubusercontent\.com\/)[^\s)"'<>]+/) || [])[0];
  if (!src) return null;
  const res = await fetch(src, { redirect: 'follow' });
  if (!res.ok) fail(`não consegui descarregar o logótipo (${res.status}).`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  const ext = TYPES[type];
  if (!ext) fail(`o logótipo tem de ser PNG, JPG ou WebP (recebi ${type || 'um formato desconhecido'}). Um SVG exporta-se em PNG.`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_LOGO) fail('o logótipo tem mais de 3 MB.');
  if (!MAGIC[ext](buf)) fail(`o ficheiro do logótipo não é um ${ext.toUpperCase()} verdadeiro.`);
  await mkdir(BRANDS, { recursive: true });
  await clearLogos();
  const path = `${BRANDS}/${id}.${ext}`;
  await writeFile(path, buf);
  return path;
}

// ---------- apply ----------
const prevBrand = target.brand;
const today = new Date().toISOString().slice(0, 10);
// since: the day the spot went to this brand (the brand report counts its logo's clicks from that month on); a sale
// again to the same brand (a new link, a new logo) keeps the day it had, or none
const since = status !== 'sold' ? undefined : target.status === 'sold' && brand === prevBrand ? target.since : today;
for (const k of ['brand', 'url', 'until', 'request', 'since']) delete target[k];   // request: a hold placed by the site (worker/)
target.status = status;
// a logo belongs to the brand that bought the spot: it goes when the spot is freed, held or changes hands
if (status !== 'sold' || brand !== prevBrand) { delete target.logo; delete target.logoMono; await clearLogos(); }
if (brand && status !== 'available') target.brand = brand;
if (url && status === 'sold') target.url = url;   // the logo's link goes live with the sale only
if (since) target.since = since;
if (status === 'reserved') target.until = until;
if (status === 'sold') { const logo = await saveLogo(); if (logo) target.logo = logo; }
data.updated = today;
await writeFile(SPOTS, `${JSON.stringify(data, null, 2)}\n`);

const word = { sold: 'vendido', reserved: `reservado até ${until}`, available: 'disponível' }[status];
const lines = [`Feito. **${label}** está agora ${word}${brand && status !== 'available' ? ` (${brand})` : ''}.`];
if (status === 'sold') lines.push(target.logo ? `O logótipo já está no ${onHelmet ? 'capacete' : 'fato'} 3D.` : 'Sem logótipo: o espaço aparece como vendido, com o nome da marca na lista de marcas do site.');
lines.push('', `O site atualiza-se em cerca de um minuto: ${link}`);
console.log(lines.join('\n'));
