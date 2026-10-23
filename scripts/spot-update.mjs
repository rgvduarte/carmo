// Updates data/spots.json from a "Atualizar espaço do fato" issue (see .github/ISSUE_TEMPLATE/espaco.yml).
//   ISSUE_BODY="..." node scripts/spot-update.mjs      apply the form, print a reply in Markdown
//   node scripts/spot-update.mjs --template            rewrite the issue form from data/spots.json
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';

const SPOTS = 'data/spots.json';
const BRANDS = 'assets/img/brands';
const FORM = '.github/ISSUE_TEMPLATE/espaco.yml';
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
const MAX_LOGO = 3 * 1024 * 1024;

const data = JSON.parse(await readFile(SPOTS, 'utf8'));
const pad2 = (n) => String(n).padStart(2, '0');
const eur = (n) => `${new Intl.NumberFormat('pt-PT').format(n)} €`;
const optionFor = (s) => `${pad2(s.n)} · ${s.pt.name} · ${eur(s.price)} (${s.id})`;
const TITLE_OPTION = `Fato completo · ${eur(data.title.price)} (fato)`;

if (process.argv.includes('--template')) {
  const opts = [...data.spots.map(optionFor), TITLE_OPTION].map((o) => `        - "${o}"`).join('\n');
  await mkdir('.github/ISSUE_TEMPLATE', { recursive: true });
  await writeFile(FORM, `name: Atualizar espaço do fato
description: Marca um espaço do fato ou do capacete como vendido, reservado ou outra vez disponível. O site atualiza-se sozinho em cerca de um minuto.
title: "Espaço do fato"
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
      description: Site ou Instagram (por exemplo https://marca.pt ou @marca). Opcional.
  - type: textarea
    id: logo
    attributes:
      label: Logótipo
      description: Anexa aqui um PNG com fundo transparente (ou SVG). No telemóvel, toca no ícone de anexar. Aparece no modelo 3D. Opcional.
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

let url = field('Link da marca').trim();
if (url.startsWith('@')) url = `https://www.instagram.com/${url.slice(1).replace(/[^\w.]/g, '')}/`;
else if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
if (url) { try { url = new URL(url).href; } catch (_) { fail('o link da marca não é válido.'); } }

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
  if (!ext) fail(`o logótipo tem de ser PNG, JPG, WebP ou SVG (recebi ${type || 'um formato desconhecido'}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_LOGO) fail('o logótipo tem mais de 3 MB.');
  await mkdir(BRANDS, { recursive: true });
  await clearLogos();
  const path = `${BRANDS}/${id}.${ext}`;
  await writeFile(path, buf);
  return path;
}

// ---------- apply ----------
const prevBrand = target.brand;
for (const k of ['brand', 'url', 'until']) delete target[k];
target.status = status;
// a logo belongs to the brand that bought the spot: it goes when the spot is freed, held or changes hands
if (status !== 'sold' || brand !== prevBrand) { delete target.logo; delete target.logoMono; await clearLogos(); }
if (brand && status !== 'available') target.brand = brand;
if (url && status !== 'available') target.url = url;
if (status === 'reserved') target.until = until;
if (status === 'sold') { const logo = await saveLogo(); if (logo) target.logo = logo; }
data.updated = new Date().toISOString().slice(0, 10);
await writeFile(SPOTS, `${JSON.stringify(data, null, 2)}\n`);

const word = { sold: 'vendido', reserved: `reservado até ${until}`, available: 'disponível' }[status];
const lines = [`Feito. **${label}** está agora ${word}${brand && status !== 'available' ? ` (${brand})` : ''}.`];
if (status === 'sold') lines.push(target.logo ? `O logótipo já está no ${onHelmet ? 'capacete' : 'fato'} 3D.` : 'Sem logótipo: o espaço aparece como vendido, com o nome da marca na lista de marcas do site.');
lines.push('', `O site atualiza-se em cerca de um minuto: ${link}`);
console.log(lines.join('\n'));
