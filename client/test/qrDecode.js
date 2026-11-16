// A small QR code reader for the tests, written apart from the encoder it checks: it reads a grid of
// modules (true = dark) of version 1 or 2, finds the format by its BCH code, takes the mask off, reads
// the codewords in the standard's zigzag order, checks the Reed–Solomon error correction words, and
// returns the text of the byte-mode segments. It corrects nothing: a wrong module fails the check.

const DATA_CODEWORDS = { 1: { L: 19, M: 16, Q: 13, H: 9 }, 2: { L: 34, M: 28, Q: 22, H: 16 } };
const TOTAL_CODEWORDS = { 1: 26, 2: 44 };
const LEVEL_BITS = { L: 1, M: 0, Q: 3, H: 2 };

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** The 15 format bits the standard writes for a level and a mask. */
function formatBits(level, mask) {
  const data = (LEVEL_BITS[level] << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

// GF(256) with the QR polynomial, for the error correction check.
const EXP = new Array(512);
const LOG = new Array(256);
for (let i = 0, x = 1; i < 255; i += 1) {
  EXP[i] = x;
  LOG[x] = i;
  x <<= 1;
  if (x & 0x100) x ^= 0x11d;
}
for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** The error correction words of `data`: the remainder of data · x^n by the generator of degree n. */
function correctionWords(data, n) {
  let generator = [1];
  for (let i = 0; i < n; i += 1) {
    const next = new Array(generator.length + 1).fill(0);
    generator.forEach((g, j) => {
      next[j] ^= g;
      next[j + 1] ^= mul(g, EXP[i]);
    });
    generator = next;
  }
  const rem = new Array(n).fill(0);
  for (const byte of data) {
    const factor = byte ^ rem.shift();
    rem.push(0);
    for (let j = 0; j < n; j += 1) rem[j] ^= mul(generator[j + 1], factor);
  }
  return rem;
}

/**
 * @param {boolean[][]} grid rows of modules, dark = true, without the quiet zone
 * @returns {{text: string, version: number, level: string, mask: number}}
 */
export function decodeQr(grid) {
  const size = grid.length;
  const version = (size - 17) / 4;
  if (!DATA_CODEWORDS[version]) throw new Error(`version ${version} is not read here`);
  const dark = (r, c) => Boolean(grid[r][c]);

  // The first copy of the format bits, around the top left finder.
  let read = 0;
  const bit = (i, r, c) => (read |= (dark(r, c) ? 1 : 0) << i);
  for (let i = 0; i <= 5; i += 1) bit(i, i, 8);
  bit(6, 7, 8);
  bit(7, 8, 8);
  bit(8, 8, 7);
  for (let i = 9; i < 15; i += 1) bit(i, 8, 14 - i);
  let format = null;
  for (const level of Object.keys(LEVEL_BITS)) for (let mask = 0; mask < 8; mask += 1) if (formatBits(level, mask) === read) format = { level, mask };
  if (!format) throw new Error(`no format matches ${read.toString(2)}`);

  // Modules that carry no data: finders with their separators and format bits, timing, the alignment pattern.
  const reserved = (r, c) => {
    if (r <= 8 && c <= 8) return true;
    if (r <= 8 && c >= size - 8) return true;
    if (r >= size - 8 && c <= 8) return true;
    if (r === 6 || c === 6) return true;
    const at = size - 7;
    return version >= 2 && Math.abs(r - at) <= 2 && Math.abs(c - at) <= 2;
  };
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const c = right - j;
        const upward = ((right + 1) & 2) === 0;
        const r = upward ? size - 1 - vert : vert;
        if (!reserved(r, c)) bits.push(dark(r, c) !== MASKS[format.mask](r, c));
      }
    }
  }
  const total = TOTAL_CODEWORDS[version];
  const words = Array.from({ length: total }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((byte, b) => (byte << 1) | (b ? 1 : 0), 0));
  const dataCount = DATA_CODEWORDS[version][format.level];
  const data = words.slice(0, dataCount);
  const expected = correctionWords(data, total - dataCount);
  if (expected.join() !== words.slice(dataCount).join()) throw new Error("the error correction words do not match the data");

  // Segments: byte mode only (4 bits mode, 8 bits count in versions 1 to 9).
  const stream = data.flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >> (7 - i)) & 1));
  let at = 0;
  const take = (n) => {
    let value = 0;
    for (let i = 0; i < n; i += 1) value = (value << 1) | stream[at++];
    return value;
  };
  const bytes = [];
  while (at + 4 <= stream.length) {
    const mode = take(4);
    if (mode === 0) break;
    if (mode !== 4) throw new Error(`mode ${mode} is not read here`);
    const count = take(8);
    for (let i = 0; i < count; i += 1) bytes.push(take(8));
  }
  return { text: new TextDecoder().decode(new Uint8Array(bytes)), version, ...format };
}
