// The comprovativo of a booking request: one A4 page as a PDF, written here, in the browser. No library and nothing
// fetched: pdf-kit.js has the standard Helvetica fonts every PDF reader has (no font file), WinAnsi text (so the accents,
// « » and € show), the GOCARMO emblem drawn as paths and the file itself. adspace.js builds the content (rcptModel) from
// the same values as the dialog and the WhatsApp message; this file only lays it out and never works out a price, a
// date or a reference. Loaded with import() on the first press of «Guardar comprovativo». receiptPdf(model) -> Uint8Array.

import { W, H, M, CW, win, width, wrap, INK, MUTED, GOLD_INK, LINE, TINT, BAND, emblem, draw, pdfFile } from './pdf-kit.js';

// ---------- drawing ----------
function page(m, s) {
  const ops = [], { z, text, para, rule, box, later, small, over } = draw(ops, s);

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
  // the mid-season discount, then the package discount: the order of the sum
  for (const row of [m.season, m.disc]) {
    if (!row) continue;
    text(M, y - z(13.5), win(row[0]), { size: z(10.5), color: GOLD_INK });
    text(W - M, y - z(13.5), win(row[1]), { size: z(10.5), color: GOLD_INK, right: true });
    y -= rowH;
    rule(M, W - M, y, 0.4);
  }
  text(M, y - z(16), win(m.total[0]), { f: 2, size: z(12.5) });
  text(W - M, y - z(16), win(m.total[1]), { f: 2, size: z(12.5), right: true });
  y -= z(22);
  rule(M, W - M, y, 0.9, INK);
  y -= z(22);

  // the grey band: [label, value, note?, tracking] cells side by side, each in its half, or, when a value needs more than
  // one line there (the CARMO reference of a long package lists every spot), one full-width row under the other, the
  // value wrapped at its spaces (never cut off: it is what the buyer copies into the transfer)
  const half = CW / 2;
  const band = (cells) => {
    const px = z(12), size = z(13.5), lead = z(17.5);
    const lines = (c, w) => wrap(win(c[1]), 2, size, w - 2 * px - (c[2] ? width(win(c[2]), 1, z(10)) + z(8) : 0), c[3] || 0);
    const side = cells.length > 1 && cells.every((c) => lines(c, half).length === 1);
    const top = y, at = ops.length;
    let row = y, low = y;
    cells.forEach((c, i) => {
      const x = M + px + (side ? i * half : 0), t0 = side ? top : row, ls = lines(c, side ? half : CW), last = t0 - z(31) - (ls.length - 1) * lead;
      small(x, t0 - z(13), c[0]);
      ls.forEach((l, j) => text(x, t0 - z(31) - j * lead, l, { f: 2, size, tc: c[3] || 0 }));
      if (c[2]) text(x + width(ls[ls.length - 1], 2, size, c[3] || 0) + z(8), last, win(c[2]), { size: z(10), color: MUTED });
      low = Math.min(low, last - z(11));
      row = last - z(6);
    });
    const inner = ops.splice(at);
    box(M, low, CW, top - low, 6, BAND, null);
    ops.push(...inner);
    y = low;
  };

  // how to pay: the amount and the CARMO reference once, then each way to pay (or, for the whole suit, the written
  // agreement that comes first, and its reference, by bank transfer only)
  const p = m.pay;
  y = para(M, y, p.h, CW, { f: 2, size: z(11.5) }) - z(8);
  if (p.agree) {
    y = para(M, y, p.agree, CW, { size: z(10.5), lead: z(14.5) }) - z(4);
    if (p.ref) { y -= z(6); band([[p.ref[0], p.ref[1], p.ref[2], 0.6]]); y -= z(4); }
  } else {
    band([[p.amt[0], p.amt[1]], [p.ref[0], p.ref[1], '', 0.6]]);
    y -= z(14);
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
  return { ops, fits: y > fTop + 12 && !over() };
}

export function receiptPdf(m, now = new Date()) {
  // everything on one page: a long list (a package sent as a message only can have many spots) makes the type smaller
  let out = null;
  for (let s = 1; s >= 0.69; s -= 0.04) { out = page(m, s); if (out.fits) break; }
  return pdfFile({ content: out.ops.join('\n'), lang: m.lang, title: m.docTitle, subject: m.title, author: m.head.name, now });
}
