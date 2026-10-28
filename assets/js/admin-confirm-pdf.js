// The «Confirmação de patrocínio» (EN «Sponsorship confirmation»): one A4 page as a PDF, written in the browser of the
// Patrocínios page (admin/patrocinios/) the way receipt.js writes the booking comprovativo: pdf-kit.js has the Helvetica
// fonts every PDF reader has, WinAnsi text, the GOCARMO emblem and the file. The content comes from
// admin-contracts.js confirmationModel(); this file only lays it out and never works out a price or a date. The link
// to the terms is a real link (a URI annotation over its text). confirmationPdf(model, now) -> Uint8Array.
import { W, H, M, CW, win, width, wrap, INK, MUTED, GOLD_INK, LINE, TINT, emblem, draw, pdfFile } from './pdf-kit.js';

function page(m, s) {
  const ops = [], links = [], { z, text, para, rule, box, later, small, over } = draw(ops, s);

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

  // the box: the season and the thanks
  const pad = z(12);
  const b1 = later(() => {
    const top = y - pad;
    small(M + pad, top - z(7.5), m.box.k);
    const yl = para(M + pad, top - z(13), m.box.h, CW - 2 * pad, { f: 2, size: z(13), lead: z(16.5) });
    return yl - pad;
  });
  const boxOps = ops.splice(b1.at);
  box(M, b1.y, CW, y - b1.y, 6, TINT, GOLD_INK);
  ops.push(...boxOps);
  y = b1.y - z(16);

  // brand, level, period, paid on, payment, NIF, record
  const LW = 112;
  for (const [k, v] of m.rows) {
    const yv = para(M + LW, y, v, CW - LW, { size: z(10.5), lead: z(14) });
    text(M, y - z(10.5) * 0.76, win(k), { size: z(9.5), color: MUTED });
    y = yv - z(6);
  }
  y -= z(8);

  // the spots with their list prices, the discounts the table gave (when the amount is that price), the amount paid
  const rowH = z(19), modelX = M + 300;
  small(M, y - z(7.5), m.cols[0]); small(modelX, y - z(7.5), m.cols[1]); small(W - M, y - z(7.5), m.cols[2], { right: true });
  y -= z(13);
  rule(M, W - M, y, 0.6, INK);
  for (const it of m.items) {
    const base = y - z(13.5), nameX = it.n ? M + z(24) : M;
    const ls = wrap(win(it.name), 1, z(10.5), modelX - nameX - 8);
    if (it.n) text(M, base, win(it.n), { f: 2, size: z(10.5) });
    ls.forEach((l, i) => text(nameX, base - i * z(13), l, { size: z(10.5) }));
    if (it.model) text(modelX, base, win(it.model), { size: z(10.5), color: MUTED });
    if (it.price) text(W - M, base, win(it.price), { size: z(10.5), right: true });
    y -= rowH + (ls.length - 1) * z(13);
    rule(M, W - M, y, 0.4);
  }
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

  // deadlines and renewal; the last item names the terms, whose address is a link
  y = para(M, y, m.next.h, CW, { f: 2, size: z(11.5) }) - z(8);
  const size = z(10), lead = z(13.8);
  m.next.items.forEach((it, i) => {
    const top = y;
    text(M, y - size * 0.76, `${i + 1}.`, { f: 2, size });
    y = para(M + 16, y, it, CW - 16, { size, lead }) - z(7);
    // the link: where its text landed in the wrapped lines
    const at = m.link && it.indexOf(m.link.text);
    if (at >= 0) {
      const ls = wrap(win(it), 1, size, CW - 16), key = win(m.link.text);
      ls.forEach((l, j) => {
        const k = l.indexOf(key);
        if (k < 0) return;
        const x0 = M + 16 + width(l.slice(0, k), 1, size), base = top - size * 0.76 - j * lead;
        links.push({ rect: [x0, base - size * 0.25, x0 + width(key, 1, size), base + size * 0.85], uri: m.link.uri });
      });
    }
  });
  y -= z(8);

  // how to reach Gonçalo
  const ck = win(`${m.contact[0]}: `);
  text(M, y - z(9) * 0.76, ck, { f: 2, size: z(9) });
  y = para(M + width(ck, 2, z(9)), y, m.contact[1], CW - width(ck, 2, z(9)), { size: z(9) });

  // the footer: what this document is and is not
  const fl = wrap(win(m.foot), 1, 8.5, CW), fTop = M + fl.length * 11.5 + 8;
  rule(M, W - M, fTop, 0.5, LINE);
  fl.forEach((l, i) => text(M, fTop - 14 - i * 11.5, l, { size: 8.5, color: MUTED }));
  return { ops, links, fits: y > fTop + 12 && !over() };
}

export function confirmationPdf(m, now = new Date()) {
  let out = null;
  for (let s = 1; s >= 0.69; s -= 0.04) { out = page(m, s); if (out.fits) break; }
  return pdfFile({ content: out.ops.join('\n'), lang: m.lang, title: m.docTitle, subject: m.title, author: m.head.name, now, links: out.links });
}
