// A product photo for the montra (data/montra.json → assets/img/montra/), made in the browser of the Patrocínios page
// from the photo picked on the phone. Out: 4:5 pictures on the site's paper colour, 600 × 750 and 1200 × 1500, as WebP
// with a 600 JPEG for browsers without WebP; a browser that cannot write WebP (Safari's canvas) gives JPEG only, 600 and
// 1200 (webp: false). Every file is a fresh canvas encoding, so nothing of the photo's EXIF, GPS or XMP leaves the
// phone (the EXIF orientation is applied before it is dropped); the colour profile the browser's canvas adds (a generic
// sRGB one) is taken out too (stripMeta), so the files hold the picture and nothing else. base8: the first 8 hex of the SHA-256 of the 600 JPEG, so a new
// photo gets a new address (no cached picture of the old one).
//   productPhoto(file, { fit: 'contain' | 'cover' }) -> { files: [{ suffix, bytes, type }], webp, base8, w, h, bytes }
export const PAPER = '#f4f1ea';
export const MAX_BYTES = 20 * 1024 * 1024;
export const MIN_SIDE = 600;
export const SIZES = [[1200, 1500], [600, 750]];
// a phone tab can die decoding a picture of tens of thousands of pixels a side: above this, refused before it is opened
// (the size is read from the file's header) and again after (a format whose header is not read here, such as HEIC)
export const MAX_PIXELS = 60e6;
const WEBP_Q = 0.82, JPEG_Q = 0.85, WEBP_MAX = 400 * 1024;

export class PhotoError extends Error {}

async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { /* the <img> way below */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;   // (an <img> applies the EXIF orientation itself: image-orientation: from-image)
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}
const sizeOf = (src) => ({ w: src.naturalWidth || src.width, h: src.naturalHeight || src.height });
// the picture's size from the start of a PNG, GIF, JPEG or WebP file, without decoding it; null when it cannot tell
export function headerSize(b) {
  try {
    const u32be = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    const tag = (i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    if (b[0] === 0x89 && tag(1).slice(0, 3) === 'PNG' && tag(12) === 'IHDR') return { w: u32be(16), h: u32be(20) };
    if (tag(0) === 'GIF8') return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
    if (tag(0) === 'RIFF' && tag(8) === 'WEBP') {
      const c = tag(12);
      if (c === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
      if (c === 'VP8L') { const v = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0; return { w: 1 + (v & 0x3fff), h: 1 + ((v >>> 14) & 0x3fff) }; }
      if (c === 'VP8 ') return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
      return null;
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i + 9 < b.length;) {
        if (b[i] !== 0xff) return null;
        const m = b[i + 1];
        if (m === 0xff) { i++; continue; }
        if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { w: (b[i + 7] << 8) | b[i + 8], h: (b[i + 5] << 8) | b[i + 6] };
        if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { i += 2; continue; }
        i += 2 + ((b[i + 2] << 8) | b[i + 3]);
      }
    }
  } catch (_) { /* not one of these */ }
  return null;
}
const tooBig = (s) => !!s && s.w * s.h > MAX_PIXELS;
const BIG = (s) => new PhotoError(`A fotografia é enorme (${s.w} × ${s.h}). Exporta-a com menos de 60 megapíxeis, por exemplo 4000 × 5000.`);

// src drawn into a w × h canvas on the paper colour: 'contain' shows all of it, 'cover' fills the box (centred)
function paint(src, w, h, fit) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = PAPER; g.fillRect(0, 0, w, h);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  const s = sizeOf(src), k = fit === 'cover' ? Math.max(w / s.w, h / s.h) : Math.min(w / s.w, h / s.h);
  const dw = s.w * k, dh = s.h * k;
  g.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return c;
}
const blobOf = (canvas, type, q) => new Promise((resolve) => canvas.toBlob((b) => resolve(b), type, q));
const bytesOf = async (blob) => stripMeta(new Uint8Array(await blob.arrayBuffer()), blob.type);

// the picture only: a JPEG keeps its APP0 (JFIF) and drops APP1..APP15 and comments (EXIF, XMP, ICC); a WebP drops its
// ICCP, EXIF and XMP chunks and their flags in VP8X. Anything it does not understand is given back as it came.
export function stripMeta(b, type) {
  try {
    if (type === 'image/jpeg' && b[0] === 0xff && b[1] === 0xd8) {
      const keep = [b.subarray(0, 2)];
      let i = 2;
      while (i + 4 <= b.length && b[i] === 0xff) {
        const m = b[i + 1];
        if (m === 0xda) { keep.push(b.subarray(i)); return concat(keep); }
        const len = (b[i + 2] << 8) | b[i + 3], seg = b.subarray(i, i + 2 + len);
        if (!((m >= 0xe1 && m <= 0xef) || m === 0xfe)) keep.push(seg);
        i += 2 + len;
      }
      return b;
    }
    const tag = (i) => String.fromCharCode(b[i], b[i + 1], b[i + 2], b[i + 3]);
    if (type === 'image/webp' && tag(0) === 'RIFF' && tag(8) === 'WEBP') {
      const keep = [];
      for (let i = 12; i + 8 <= b.length;) {
        // (unsigned: a malformed length never walks backwards)
        const n = (b[i + 4] | (b[i + 5] << 8) | (b[i + 6] << 16) | (b[i + 7] << 24)) >>> 0, end = i + 8 + n + (n & 1);
        const id = tag(i);
        if (end <= i || end > b.length) return b;
        if (!['ICCP', 'EXIF', 'XMP '].includes(id)) {
          const c = b.slice(i, end);
          if (id === 'VP8X') c[8] &= ~(0x20 | 0x08 | 0x04);   // the ICC, EXIF and XMP flags
          keep.push(c);
        }
        i = end;
      }
      const body = concat(keep), out = new Uint8Array(12 + body.length), size = 4 + body.length;
      out.set(b.subarray(0, 12)); out.set(body, 12);
      out[4] = size & 255; out[5] = (size >> 8) & 255; out[6] = (size >> 16) & 255; out[7] = (size >>> 24) & 255;
      return out;
    }
  } catch (_) { /* as it came */ }
  return b;
}
function concat(parts) {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
async function sha8(bytes) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(d.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function productPhoto(file, { fit = 'contain' } = {}) {
  if (!file || !(file instanceof Blob)) throw new PhotoError('Escolhe uma fotografia.');
  if (file.size > MAX_BYTES) throw new PhotoError('A fotografia tem mais de 20 MB. Escolhe outra ou exporta-a mais pequena.');
  if (file.type && !/^image\//.test(file.type)) throw new PhotoError('Isto não é uma fotografia (JPEG, PNG, HEIC ou WebP).');
  let head = null;
  try { head = headerSize(new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer())); } catch (_) { head = null; }
  if (tooBig(head)) throw BIG(head);
  let src;
  try { src = await decode(file); } catch (_) { throw new PhotoError('Não consegui abrir esta fotografia neste telemóvel. Tira uma captura ou exporta-a em JPEG.'); }
  const s = sizeOf(src);
  if (!(s.w > 0 && s.h > 0)) throw new PhotoError('Não consegui abrir esta fotografia neste telemóvel. Tira uma captura ou exporta-a em JPEG.');
  if (tooBig(s)) { if (typeof src.close === 'function') src.close(); throw BIG(s); }
  if (Math.min(s.w, s.h) < MIN_SIDE) throw new PhotoError(`A fotografia é pequena (${s.w} × ${s.h}). Precisa de ${MIN_SIDE} píxeis no lado menor.`);
  const big = paint(src, SIZES[0][0], SIZES[0][1], fit === 'cover' ? 'cover' : 'contain');
  const small = paint(big, SIZES[1][0], SIZES[1][1], 'cover');   // (same 4:5 box: a straight downscale)
  if (typeof src.close === 'function') src.close();

  // WebP when the browser can write it (the blob says what it really is), the 1200 one under 400 KB
  let w1200 = await blobOf(big, 'image/webp', WEBP_Q);
  const webp = !!w1200 && w1200.type === 'image/webp';
  const files = [];
  if (webp) {
    for (const q of [0.74, 0.66, 0.6]) { if (w1200.size <= WEBP_MAX) break; w1200 = await blobOf(big, 'image/webp', q); }
    const w600 = await blobOf(small, 'image/webp', WEBP_Q);
    files.push({ suffix: '-600.webp', type: 'image/webp', bytes: await bytesOf(w600) }, { suffix: '-1200.webp', type: 'image/webp', bytes: await bytesOf(w1200) });
  }
  const j600 = await blobOf(small, 'image/jpeg', JPEG_Q);
  if (!j600 || j600.type !== 'image/jpeg') throw new PhotoError('Este browser não consegue guardar a fotografia. Tenta noutro.');
  const jpg600 = await bytesOf(j600);
  files.push({ suffix: '-600.jpg', type: 'image/jpeg', bytes: jpg600 });
  if (!webp) files.push({ suffix: '-1200.jpg', type: 'image/jpeg', bytes: await bytesOf(await blobOf(big, 'image/jpeg', JPEG_Q)) });
  return { files, webp, base8: await sha8(jpg600), w: SIZES[1][0], h: SIZES[1][1], bytes: files.reduce((a, f) => a + f.bytes.length, 0), source: s };
}

// «600 × 750 e 1200 × 1500, WebP 84 KB e JPEG 92 KB, sem metadados»
const kb = (n) => `${Math.max(1, Math.round(n / 1024))} KB`;
export function photoSummary(ph) {
  if (!ph) return '';
  const size = (suffix) => ph.files.filter((f) => f.suffix.endsWith(suffix)).reduce((a, f) => a + f.bytes.length, 0);
  return ph.webp ? `600 × 750 e 1200 × 1500, WebP ${kb(size('.webp'))} e JPEG ${kb(size('.jpg'))}, sem metadados`
    : `600 × 750 e 1200 × 1500, só JPEG (${kb(size('.jpg'))}): este browser não faz WebP. Sem metadados`;
}
