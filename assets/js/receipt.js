// The comprovativo of a booking request: one A4 page as a PDF, written here, in the browser. No library and nothing
// fetched: the standard Helvetica fonts every PDF reader has (no font file), WinAnsi text (so the accents, « » and €
// show), and the GOCARMO emblem drawn as paths. adspace.js builds the content (rcptModel) from the same values as the
// dialog and the WhatsApp message; this file only lays it out and never works out a price, a date or a reference.
// Loaded with import() on the first press of «Guardar comprovativo». receiptPdf(model) -> Uint8Array.

const W = 595.28, H = 841.89, M = 50, CW = W - 2 * M;

// ---------- text: WinAnsi bytes and Helvetica widths ----------
// glyph widths (1/1000 em) of codes 32 to 255 in WinAnsiEncoding, from the fonts' AFM files
const widths = (s) => s.split(',').map(Number);
const WIDTH = { 1: widths('278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,350,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500'), 2: widths('278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,350,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556') };
// Unicode -> WinAnsi for 0x80-0x9F (0x20-0x7E and 0xA0-0xFF are the same codes)
const CP = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e,
  0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
// look-alikes for what WinAnsi lacks: the minus sign of «−10%», the narrow no-break space some number formats use,
// the joiners that keep a line from breaking (a no-break space here does the same)
const LIKE = { 0x2212: '-', 0x2010: '-', 0x2011: '-', 0x00ad: '', 0x200b: '', 0x2060: '', 0xfeff: '', 0x202f: '\u00a0', 0x2007: '\u00a0', 0x2009: ' ', 0x200a: ' ', 0x2002: ' ', 0x2003: ' ', 0x02bb: '\u2018', 0x2032: '\u2019' };
// a string as WinAnsi bytes (one char per byte, 0-255): what WinAnsi cannot show becomes its plain letter (ő -> o) or «?»
function win(s) {
  let out = '';
  for (const ch of String(s ?? '').normalize('NFC')) {
    const c = ch.codePointAt(0);
    if (c in LIKE) { out += LIKE[c]; continue; }
    if (c === 9 || c === 10 || c === 13) { out += ' '; continue; }
    if (c < 0x20 || c === 0x7f || (c > 0x7f && c < 0xa0 && !CP[c])) continue;
    if (c < 0x7f || (c >= 0xa0 && c <= 0xff)) out += ch;
    else if (CP[c]) out += String.fromCharCode(CP[c]);
    else {
      const base = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      out += /^[\x20-\x7e]+$/.test(base) ? base : '?';
    }
  }
  return out;
}
const width = (b, f, size, tc = 0) => { let w = 0; for (let i = 0; i < b.length; i++) w += WIDTH[f][b.charCodeAt(i) - 32] || 0; return (w * size) / 1000 + tc * b.length; };
// lines of at most `max` points, broken at spaces (a no-break space keeps «684 €» whole); a word longer than a line
// (a brand name with no spaces) is cut where it has to be
function wrap(b, f, size, max, tc = 0) {
  const lines = [];
  let line = '';
  for (const word of b.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (width(next, f, size, tc) <= max) { line = next; continue; }
    if (line) lines.push(line);
    line = word;
    while (width(line, f, size, tc) > max && line.length > 1) {
      let k = line.length - 1;
      while (k > 1 && width(line.slice(0, k), f, size, tc) > max) k--;
      lines.push(line.slice(0, k)); line = line.slice(k);
    }
  }
  if (line || !lines.length) lines.push(line);
  return lines;
}
// a PDF literal string: ( ) \ escaped, everything outside printable ASCII as octal, so the file stays plain ASCII
const lit = (b) => `(${b.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, (c) => `\\${c.charCodeAt(0).toString(8).padStart(3, '0')}`)})`;
const n = (x) => { const s = (Math.round(x * 100) / 100).toFixed(2); return s.replace(/\.?0+$/, '') || '0'; };

// ---------- colours (the site's paper palette: style.css --ink-dark, --muted-dark, --gold-ink, --gold) ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const INK = hex('#111112'), MUTED = hex('#5d5c57'), GOLD_INK = hex('#8a6312'), GOLD = hex('#e6b450'), LINE = hex('#d9d8d2'), TINT = hex('#fbf5e8'), BAND = hex('#f2f1ec');
const rg = (c) => `${c.map(n).join(' ')} rg`, RG = (c) => `${c.map(n).join(' ')} RG`;

// ---------- drawing ----------
function page(m, s) {
  const ops = [], z = (x) => x * s;
  // one line at baseline y
  const text = (x, y, b, { f = 1, size = 10, color = INK, tc = 0, right = false } = {}) => {
    const at = right ? x - width(b, f, size, tc) : x;
    ops.push(`BT /F${f} ${n(size)} Tf ${n(tc)} Tc ${rg(color)} 1 0 0 1 ${n(at)} ${n(y)} Tm ${lit(b)} Tj ET`);
  };
  // a paragraph from the top `y`: returns the top of what follows
  const para = (x, y, str, w, o = {}) => {
    const size = o.size || z(10), lead = o.lead || size * 1.38, f = o.f || 1;
    const ls = wrap(win(str), f, size, w, o.tc || 0);
    ls.forEach((l, i) => text(x, y - size * 0.76 - i * lead, l, { ...o, f, size }));
    return y - size * 0.76 - (ls.length - 1) * lead - size * 0.3;
  };
  const rule = (x0, x1, y, w = 0.5, c = LINE) => ops.push(`${RG(c)} ${n(w)} w ${n(x0)} ${n(y)} m ${n(x1)} ${n(y)} l S`);
  const box = (x, y, w, h, r, fill, stroke) => {
    const k = 0.5523 * r, path = [`${n(x + r)} ${n(y)} m`, `${n(x + w - r)} ${n(y)} l`, `${n(x + w - r + k)} ${n(y)} ${n(x + w)} ${n(y + r - k)} ${n(x + w)} ${n(y + r)} c`,
      `${n(x + w)} ${n(y + h - r)} l`, `${n(x + w)} ${n(y + h - r + k)} ${n(x + w - r + k)} ${n(y + h)} ${n(x + w - r)} ${n(y + h)} c`, `${n(x + r)} ${n(y + h)} l`,
      `${n(x + r - k)} ${n(y + h)} ${n(x)} ${n(y + h - r + k)} ${n(x)} ${n(y + h - r)} c`, `${n(x)} ${n(y + r)} l`, `${n(x)} ${n(y + r - k)} ${n(x + r - k)} ${n(y)} ${n(x + r)} ${n(y)} c`, 'h'];
    ops.push(`${fill ? rg(fill) : ''} ${stroke ? `${RG(stroke)} 0.75 w` : ''} ${path.join(' ')} ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
  };
  // a block drawn after its height is known (a box under text): run fn into its own list, then put it at `at`
  const later = (fn) => { const at = ops.length, y = fn(); return { at, y }; };
  const small = (x, y, str, o = {}) => text(x, y, win(String(str).toUpperCase()), { f: 2, size: z(7.5), color: MUTED, tc: 0.7, ...o });

  // header: the emblem, GOCARMO and the athlete's name; the site on the right; a gold rule
  let y = H - M;
  emblem(ops, M, y - 30, 30);
  text(M + 40, y - 14, 'GOCARMO', { f: 2, size: 15, tc: 1.6 });
  text(M + 40, y - 27, win(m.head.name), { size: 9, color: MUTED });
  text(W - M, y - 14, win(m.head.site), { size: 9, color: MUTED, right: true });
  y -= 44;
  rule(M, W - M, y, 1, GOLD_INK);
  y -= z(26);

  y = para(M, y, m.title, CW, { f: 2, size: z(19), lead: z(23) }) - z(12);

  // the hold (until when, the request's number) or, without one, what that means
  const st = m.status, pad = z(12);
  const b1 = later(() => {
    const top = y - pad;
    if (st.id) {
      const idW = Math.max(width(win(st.id), 2, z(15), 1.2), width(win(st.k.toUpperCase()), 2, z(7.5), 0.7)) + 4;
      const lw = CW - 2 * pad - idW - 16, idH = z(7.5) + z(17) + z(5);
      // the heading sits level with the middle of the number block (or starts at the top when it takes more lines)
      const hl = wrap(win(st.h), 2, z(13), lw).length, hH = z(13) * 1.06 + (hl - 1) * z(16.5);
      const yl = para(M + pad, top - Math.max(0, (idH - hH) / 2), st.h, lw, { f: 2, size: z(13), lead: z(16.5) });
      small(W - M - pad, top - z(7.5), st.k, { right: true });
      text(W - M - pad, top - z(7.5) - z(17), win(st.id), { f: 2, size: z(15), tc: 1.2, right: true });
      return Math.min(yl, top - idH) - pad;
    }
    let yl = para(M + pad, top, st.h, CW - 2 * pad, { f: 2, size: z(13), lead: z(16.5) });
    yl = para(M + pad, yl - z(4), st.p, CW - 2 * pad, { size: z(10) });
    return yl - pad;
  });
  const boxOps = ops.splice(b1.at);
  box(M, b1.y, CW, y - b1.y, 6, TINT, GOLD_INK);
  ops.push(...boxOps);
  y = b1.y - z(16);

  // the request: date, brand, name, NIF (each value wraps beside its label)
  const LW = 112;
  for (const [k, v] of m.rows) {
    const yv = para(M + LW, y, v, CW - LW, { size: z(10.5), lead: z(14) });
    text(M, y - z(10.5) * 0.76, win(k), { size: z(9.5), color: MUTED });
    y = yv - z(6);
  }
  y -= z(8);

  // the spots: number and name, suit or helmet, price; the package discount; the total
  // (more than 10 spots, which only a request sent as a message can have: two columns side by side)
  const rowH = z(19), two = m.items.length > 10, gap = 24, colW = two ? (CW - gap) / 2 : CW, per = two ? Math.ceil(m.items.length / 2) : m.items.length;
  const cols = two ? [m.items.slice(0, per), m.items.slice(per)] : [m.items];
  const xOf = (c) => M + c * (colW + gap), modelX = (c) => xOf(c) + (two ? colW * 0.6 : 300);
  cols.forEach((_, c) => { small(xOf(c), y - z(7.5), m.cols[0]); small(modelX(c), y - z(7.5), m.cols[1]); small(xOf(c) + colW, y - z(7.5), m.cols[2], { right: true }); });
  y -= z(13);
  cols.forEach((_, c) => rule(xOf(c), xOf(c) + colW, y, 0.6, INK));
  for (let r = 0; r < per; r++) {
    const base = y - z(13.5);
    let lines = 1;
    cols.forEach((col, c) => {
      const it = col[r];
      if (!it) return;
      const x = xOf(c), nameX = it.n ? x + z(24) : x;
      const ls = wrap(win(it.name), 1, z(10.5), modelX(c) - nameX - 8);
      if (it.n) text(x, base, win(it.n), { f: 2, size: z(10.5) });
      ls.forEach((l, i) => text(nameX, base - i * z(13), l, { size: z(10.5) }));
      text(modelX(c), base, win(it.model), { size: z(10.5), color: MUTED });
      text(x + colW, base, win(it.price), { size: z(10.5), right: true });
      lines = Math.max(lines, ls.length);
    });
    y -= rowH + (lines - 1) * z(13);
    cols.forEach((col, c) => { if (col[r]) rule(xOf(c), xOf(c) + colW, y, 0.4); });
  }
  if (two) rule(M, W - M, y, 0.4);
  if (m.disc) {
    text(M, y - z(13.5), win(m.disc[0]), { size: z(10.5), color: GOLD_INK });
    text(W - M, y - z(13.5), win(m.disc[1]), { size: z(10.5), color: GOLD_INK, right: true });
    y -= rowH;
    rule(M, W - M, y, 0.4);
  }
  text(M, y - z(16), win(m.total[0]), { f: 2, size: z(12.5) });
  text(W - M, y - z(16), win(m.total[1]), { f: 2, size: z(12.5), right: true });
  y -= z(22);
  rule(M, W - M, y, 0.9, INK);
  y -= z(22);

  // how to pay: the amount and the CARMO reference once, then each way to pay (or, for the whole suit, the written
  // agreement that comes first)
  const p = m.pay;
  y = para(M, y, p.h, CW, { f: 2, size: z(11.5) }) - z(8);
  if (p.agree) y = para(M, y, p.agree, CW, { size: z(10.5), lead: z(14.5) }) - z(4);
  else {
    const bh = z(42), half = CW / 2;
    box(M, y - bh, CW, bh, 6, BAND, null);
    for (const [i, [k, v]] of [p.amt, p.ref].entries()) {
      small(M + z(12) + i * half, y - z(13), k);
      text(M + z(12) + i * half, y - z(31), win(v), { f: 2, size: z(13.5), tc: i ? 0.6 : 0 });
    }
    y -= bh + z(14);
    const cols = p.methods, cw = cols.length > 1 ? half - 8 : CW;
    let low = y;
    cols.forEach((mt, i) => {
      const x = M + i * (half + 8);
      let yy = para(x, y, mt.h, cw, { f: 2, size: z(10.5) }) - z(6);
      for (const [k, v] of mt.rows) {
        small(x, yy - z(7.5), k);
        yy = para(x, yy - z(11), v, cw, { size: z(10.5), lead: z(13.5) }) - z(6);
      }
      low = Math.min(low, yy);
    });
    y = low - z(2);
    if (p.cap) y = para(M, y, p.cap, CW, { size: z(9), color: MUTED }) - z(3);
    y = para(M, y, p.hint, CW, { size: z(9), color: MUTED }) - z(4);
  }
  y -= z(14);

  // what happens next
  y = para(M, y, m.next.h, CW, { f: 2, size: z(11.5) }) - z(8);
  m.next.items.forEach((it, i) => {
    text(M, y - z(10) * 0.76, `${i + 1}.`, { f: 2, size: z(10) });
    y = para(M + 16, y, it, CW - 16, { size: z(10), lead: z(13.8) }) - z(7);
  });
  y -= z(8);

  // the terms the request took, and how to reach Gonçalo
  y = para(M, y, m.terms, CW, { size: z(9), color: MUTED }) - z(5);
  const ck = win(`${m.contact[0]}: `);
  text(M, y - z(9) * 0.76, ck, { f: 2, size: z(9) });
  y = para(M + width(ck, 2, z(9)), y, m.contact[1], CW - width(ck, 2, z(9)), { size: z(9) });

  // the footer, at the bottom of the page: what this document is and is not
  const fl = wrap(win(m.foot), 1, 8.5, CW), fTop = M + fl.length * 11.5 + 8;
  rule(M, W - M, fTop, 0.5, LINE);
  fl.forEach((l, i) => text(M, fTop - 14 - i * 11.5, l, { size: 8.5, color: MUTED }));
  return { ops, fits: y > fTop + 12 };
}

// The emblem (index.html, symbol #i-gc), its 64-unit paths flipped into PDF space: the moon in ink, the sun in gold
const MOON = 'M30.71 7.01L30.73 7.55C28.26 8.47 25.98 9.89 24.06 11.7C22.23 13.43 20.73 15.51 19.67 17.79C16.11 25.44 17.61 34.69 23.33 40.88C24.67 42.33 26.22 43.59 27.92 44.59C29.8 45.7 31.85 46.5 33.98 46.96C36.37 47.47 38.85 47.54 41.27 47.17C44.28 46.72 47.17 45.61 49.71 43.94C52.53 42.09 54.9 39.55 56.54 36.59L57.17 36.67C56.72 40.56 55.43 44.35 53.37 47.68C51.72 50.35 49.58 52.71 47.09 54.62C45.06 56.18 42.81 57.42 40.41 58.32C38.16 59.16 35.79 59.7 33.39 59.9C23.83 60.72 14.26 56.34 8.74 48.48C7.13 46.19 5.89 43.63 5.1 40.95C4.19 37.85 3.88 34.59 4.19 31.38C4.52 27.88 5.58 24.46 7.25 21.38C9.32 17.56 12.32 14.27 15.9 11.82C20.25 8.85 25.44 7.12 30.71 7.01Z';
const SUN = 'M43.81 10.69C41.55 9.72 39.1 9.2 36.64 9.18C36.66 9.07 36.67 8.93 36.72 8.84C36.78 8.71 36.89 8.6 36.98 8.49C37.23 8.15 37.49 7.81 37.75 7.47C38.62 6.31 39.49 5.16 40.36 4L42.51 4.46C42.84 5.87 43.17 7.28 43.49 8.69C43.59 9.11 43.69 9.52 43.78 9.94C43.81 10.07 43.87 10.22 43.88 10.36C43.88 10.46 43.83 10.59 43.81 10.69ZM52.05 17.63C50.55 15.37 48.58 13.44 46.29 12C46.37 11.91 46.48 11.75 46.58 11.69C46.69 11.62 47.09 11.48 47.24 11.42C47.67 11.25 48.11 11.07 48.55 10.89C50.12 10.26 51.7 9.62 53.27 8.98L54.85 10.51C54.27 12.1 53.69 13.7 53.11 15.29C52.95 15.74 52.78 16.18 52.62 16.62C52.57 16.77 52.45 17.18 52.38 17.29C52.32 17.39 52.14 17.54 52.05 17.63ZM55.24 26.95C55.07 24.62 54.48 22.32 53.5 20.21C53.6 20.18 53.73 20.12 53.84 20.12C53.96 20.12 54.22 20.19 54.35 20.22C54.73 20.29 55.11 20.36 55.48 20.44C56.79 20.69 58.09 20.94 59.4 21.19L59.93 23.32C58.88 24.17 57.83 25.02 56.78 25.86C56.47 26.11 56.15 26.37 55.84 26.62C55.74 26.7 55.64 26.82 55.53 26.88C55.45 26.92 55.33 26.93 55.24 26.95ZM50.15 27.99C50.19 29.82 49.86 31.66 49.16 33.36C48.58 34.79 47.74 36.12 46.69 37.26C45.83 38.2 44.83 39.01 43.73 39.66C37.83 43.2 29.76 41.91 25.41 36.52C24.55 35.46 23.86 34.26 23.37 32.98C22.79 31.43 22.5 29.79 22.53 28.14C22.63 21.82 27.22 16.17 33.34 14.69C34.59 14.38 35.88 14.26 37.16 14.32C38.61 14.4 40.03 14.71 41.37 15.24C42.91 15.85 44.34 16.74 45.56 17.86C46.93 19.12 48.04 20.64 48.82 22.32C49.65 24.1 50.11 26.04 50.15 27.99Z';
function emblem(ops, x, y, size) {
  const k = size / 64;
  const path = (d) => {
    const tk = d.match(/[MLCZ]|-?\d*\.?\d+/gi), out = [];
    for (let i = 0; i < tk.length;) {
      const c = tk[i++].toUpperCase(), take = (j) => tk.slice(i, (i += j)).map(Number);
      if (c === 'M') out.push(`${take(2).map(n).join(' ')} m`);
      else if (c === 'L') out.push(`${take(2).map(n).join(' ')} l`);
      else if (c === 'C') out.push(`${take(6).map(n).join(' ')} c`);
      else if (c === 'Z') out.push('h');
    }
    return out.join(' ');
  };
  ops.push(`q ${n(k)} 0 0 ${n(-k)} ${n(x)} ${n(y + size)} cm ${rg(INK)} ${path(MOON)} f ${rg(GOLD)} ${path(SUN)} f Q`);
}

// ---------- the file ----------
// UTF-16BE for the document information (any character), with its byte order mark
const u16 = (s) => `<FEFF${[...String(s)].map((c) => { const p = c.codePointAt(0); return p > 0xffff ? [0xd800 + ((p - 0x10000) >> 10), 0xdc00 + ((p - 0x10000) & 0x3ff)] : [p]; }).flat().map((u) => u.toString(16).padStart(4, '0').toUpperCase()).join('')}>`;
const pdfDate = (d) => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
function fnv(s, seed) { let h = seed >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); }

export function receiptPdf(m, now = new Date()) {
  // everything on one page: a long list (a package sent as a message only can have many spots) makes the type smaller
  let out = null;
  for (let s = 1; s >= 0.69; s -= 0.04) { out = page(m, s); if (out.fits) break; }
  const content = out.ops.join('\n');
  const objs = [
    `<< /Type /Catalog /Pages 2 0 R /Lang ${lit(m.lang === 'en' ? 'en' : 'pt-PT')} /ViewerPreferences << /DisplayDocTitle true >> >>`,
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> /ProcSet [/PDF /Text] >> /Contents 6 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title ${u16(m.docTitle)} /Author ${u16(m.head.name)} /Subject ${u16(m.title)} /Creator (gocarmo.com) /Producer (gocarmo.com) /CreationDate (${pdfDate(now)}) >>`,
  ];
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const at = [];
  objs.forEach((o, i) => { at.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length, id = fnv(content, 2166136261) + fnv(content, 16777619) + fnv(m.docTitle, 2166136261) + fnv(pdfDate(now), 99991);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}
