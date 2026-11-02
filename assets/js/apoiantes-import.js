// The supporters' list dropped on the admin hub (/admin/): an .xlsx or a .csv, read in this browser only (nothing is
// uploaded but the short names the owner confirms). No library: a .xlsx is a zip of XML files, read with the
// browser's own DecompressionStream('deflate-raw'); a .csv is text, UTF-8 or the Windows-1252 that Excel writes in
// Portugal. GoFundMe gives a personal fundraiser no donor export, so the file is whatever the owner keeps: a GoFundMe-
// like sheet (first and last name, or a full name, and maybe an «Anonymous» column) or a plain list, one name a row.
// Pure apart from DecompressionStream and TextDecoder (both in Node 18+ too), so the Node tests run it as it is.
import { normName, nameProblem, foldKey, shortName, isAnonName, truthy } from './apoiantes-core.js';

export const MAX_BYTES = 5 * 1024 * 1024;     // a sheet of a few thousand rows is far below this
const MAX_ROWS = 20000;

// ---------- CSV ----------
// RFC 4180: quoted fields, "" inside quotes, CRLF or LF; the delimiter is the one of , ; or tab that the first line
// has most of (Excel in Portugal writes ;)
export function parseCsv(text) {
  text = String(text).replace(/^\ufeff/, '');
  const head = text.slice(0, Math.max(0, text.search(/\r?\n/)) || text.length);
  const delim = [',', ';', '\t'].map((d) => [d, head.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], f = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c;
    } else if (c === '"' && f === '') q = true;
    else if (c === delim) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(f); rows.push(row); row = []; f = '';
      if (rows.length > MAX_ROWS) break;
    } else f += c;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows;
}
// a CSV's bytes as text: UTF-8 when they are valid UTF-8, else Windows-1252
export function decodeText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (_) { return new TextDecoder('windows-1252').decode(bytes); }
}

// ---------- XLSX ----------
const u16 = (b, o) => b[o] | (b[o + 1] << 8);
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
// the zip's central directory: name -> { method, size, offset }
function zipEntries(b) {
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip');
  const n = u16(b, eocd + 10);
  let p = u32(b, eocd + 16);
  const out = new Map(), dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (u32(b, p) !== 0x02014b50) throw new Error('zip');
    const method = u16(b, p + 10), csize = u32(b, p + 20), nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), off = u32(b, p + 42);
    out.set(dec.decode(b.subarray(p + 46, p + 46 + nl)), { method, csize, off });
    p += 46 + nl + xl + cl;
  }
  return out;
}
async function unzipText(b, e) {
  if (u32(b, e.off) !== 0x04034b50) throw new Error('zip');
  const start = e.off + 30 + u16(b, e.off + 26) + u16(b, e.off + 28), data = b.subarray(start, start + e.csize);
  if (e.method === 0) return new TextDecoder().decode(data);
  if (e.method !== 8) throw new Error('zip');
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new TextDecoder().decode(await new Response(stream).arrayBuffer());
}
const unxml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  const k = e.toLowerCase();
  if (k[0] === '#') { const cp = k[1] === 'x' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10); return cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ''; }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[k];
});
// the text of a run of <t> elements (a shared string with rich text has several)
const textOf = (xml) => [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>|<t\b[^>]*\/>/g)].map((m) => unxml(m[1] || '')).join('');
const colIndex = (ref) => { let n = 0; for (const c of ref.replace(/\d+$/, '')) n = n * 26 + (c.charCodeAt(0) - 64); return n - 1; };
// The first sheet of the workbook (the order of workbook.xml, through its relationships), as rows of strings
export async function readXlsx(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const z = zipEntries(b);
  const get = async (name) => (z.has(name) ? unzipText(b, z.get(name)) : null);
  let sheet = 'xl/worksheets/sheet1.xml';
  const wb = await get('xl/workbook.xml'), rels = await get('xl/_rels/workbook.xml.rels');
  const first = wb && wb.match(/<sheet\b[^>]*\br:id="([^"]+)"/);
  if (first && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${first[1]}"`));
    const target = rel && (rel.match(/Target="([^"]+)"/) || [])[1];
    if (target) sheet = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const xml = await get(sheet);
  if (!xml) throw new Error('folha');
  const ssXml = await get('xl/sharedStrings.xml');
  const shared = ssXml ? [...ssXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const rows = [];
  for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const row = [];
    let next = 0;
    for (const cm of rm[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] || '';
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      const at = ref ? colIndex(ref) : next;
      const t = (attrs.match(/\bt="(\w+)"/) || [])[1] || 'n';
      const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let val = '';
      if (t === 's') val = shared[Number(v)] ?? '';
      else if (t === 'inlineStr') val = textOf(body);
      else if (t === 'b') val = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined) val = unxml(v);
      while (row.length < at) row.push('');
      row[at] = val;
      next = at + 1;
    }
    rows.push(row);
    if (rows.length > MAX_ROWS) break;
  }
  return rows;
}

// ---------- the columns ----------
const H = {
  first: /^(donor )?(first|given) ?name$|^primeiro nome$|^nome proprio$|^first$|^nome$/,
  last: /^(donor )?(last|family) ?name$|^surname$|^apelidos?$|^ultimo nome$|^sobrenome$|^last$/,
  full: /^(donor|supporter|backer)( name)?$|^(full )?name$|^nome( completo)?$|^nome do doador$|^doador(a)?$|^apoiante$|^quem$/,
  anon: /anonym|anonim|^anon$/,
};
// Which columns hold the name and the anonymous flag. A header row is recognised by its names; without one, the first
// column is the list (a plain list of names, the first row included).
export function columnsOf(rows) {
  const hi = rows.findIndex((r) => r.some((c) => String(c).trim()));
  if (hi < 0) return { header: -1, full: 0 };
  const h = rows[hi].map((c) => foldKey(c));
  const find = (re, not = []) => h.findIndex((x, i) => x && re.test(x) && !not.includes(i));
  const last = find(H.last);
  let first = last >= 0 ? find(H.first, [last]) : -1;
  let full = -1;
  if (first < 0 || last < 0) { first = -1; full = find(H.full); }
  const anon = find(H.anon, [first, last, full]);
  if (first < 0 && full < 0) {
    // no name header: a plain list (an «anonymous» header alone would be odd; treat the sheet as headerless then)
    return { header: -1, full: 0, start: hi };
  }
  return { header: hi, first, last: first >= 0 ? last : -1, full, anon, start: hi + 1 };
}

// The file's rows -> the short names to add, and what was left out. `existing`: the names already on the wall (any
// spelling: compared by foldKey). Returns { add: [names], anon, repeated, invalid, total }.
export function namesOf(rows, existing = []) {
  const c = columnsOf(rows);
  const seen = new Set(existing.map((x) => foldKey(typeof x === 'string' ? x : x.name)));
  const out = { add: [], anon: 0, repeated: 0, invalid: 0, rows: 0, columns: c };
  if (c.header < 0 && c.full === 0 && c.start === undefined) return out;
  for (let i = c.start; i < rows.length; i++) {
    const r = rows[i] || [];
    const cell = (k) => (k >= 0 ? normName(r[k]) : '');
    const raw = c.first >= 0 ? `${cell(c.first)} ${cell(c.last)}`.trim() : cell(c.full);
    if (!raw && !(c.anon >= 0 && truthy(r[c.anon]))) continue;               // an empty row
    out.rows++;
    if ((c.anon >= 0 && truthy(r[c.anon])) || isAnonName(raw) || (c.first >= 0 && isAnonName(cell(c.first)))) { out.anon++; continue; }
    // the whole cell is judged too (a long full name is fine, digits, an email or a link are not: «bob 123» must not
    // come out as «Bob»)
    const whole = nameProblem(raw);
    const short = c.first >= 0 ? shortName(cell(c.first), cell(c.last)) : shortName(raw);
    if (!short || nameProblem(short) || (whole && whole !== 'longo')) { out.invalid++; continue; }
    const k = foldKey(short);
    if (seen.has(k)) { out.repeated++; continue; }
    seen.add(k); out.add.push(short);
  }
  return out;
}

// A dropped File (or { name, arrayBuffer() }) -> rows. Throws Error('tipo') for anything but .xlsx / .csv / .txt,
// Error('grande') above MAX_BYTES, Error('zip') / Error('folha') for a broken workbook.
export async function readFileRows(file) {
  const name = String(file.name || '').toLowerCase();
  if (file.size > MAX_BYTES) throw new Error('grande');
  const buf = new Uint8Array(await file.arrayBuffer());
  const isZip = buf.length > 4 && u32(buf, 0) === 0x04034b50;
  if (name.endsWith('.xlsx') || (isZip && !name.endsWith('.csv'))) return readXlsx(buf);
  if (name.endsWith('.xls')) throw new Error('xls');
  if (name.endsWith('.csv') || name.endsWith('.txt') || !name.includes('.')) return parseCsv(decodeText(buf));
  throw new Error('tipo');
}
export const READ_ERR_PT = {
  tipo: 'Esse ficheiro não é .xlsx nem .csv.',
  xls: 'É um .xls antigo: no Excel, «Guardar como» .xlsx (ou .csv) e larga-o outra vez.',
  grande: 'O ficheiro passa de 5 MB.',
  zip: 'Não consegui abrir este .xlsx. Guarda-o outra vez no Excel e tenta de novo.',
  folha: 'Este .xlsx não tem uma folha que eu consiga ler.',
};
