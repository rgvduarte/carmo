// The «Relatório PDF» as a file: A4 pages written in the browser from the model of admin-report-model.js, in the look
// of the comprovativo and the sponsorship confirmation (pdf-kit.js: Helvetica, WinAnsi text, the GOCARMO emblem, the
// paper palette). pdf-kit.js writes one page; a report has several, so this file has its own pdfDoc() with the same
// structure (catalog, pages, the two fonts, one content stream and its links per page, the information, xref, trailer).
// Charts are PDF paths and rectangles only: ink for data, gold for the one highlighted series, LINE for the grid, and
// every chart has its numbers in text next to it, so the PDF reads without colour. reportPdf(model, now) -> Uint8Array.
import { W, H, M, CW, win, width, wrap, lit, n, INK, MUTED, GOLD_INK, GOLD, LINE, TINT, BAND, rg, RG, draw, emblem } from './pdf-kit.js';
import { fmt, fill } from './admin-report-text.js';

const SOFT = [0.984, 0.925, 0.808];          // the area under the trend line: GOLD on paper, light
const GREY = [0.62, 0.61, 0.58];             // the third series and «outros»
const TOP1 = H - M - 44 - 24, TOPN = H - M - 30 - 18, BOTTOM = M + 6;

// ---------- the file ----------
const u16 = (s) => `<FEFF${[...String(s)].map((c) => { const p = c.codePointAt(0); return p > 0xffff ? [0xd800 + ((p - 0x10000) >> 10), 0xdc00 + ((p - 0x10000) & 0x3ff)] : [p]; }).flat().map((u) => u.toString(16).padStart(4, '0').toUpperCase()).join('')}>`;
const pdfDate = (d) => `D:${d.toISOString().replace(/[-:T]/g, '').slice(0, 14)}Z`;
function fnv(s, seed) { let h = seed >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16).padStart(8, '0'); }

// pages: [{ content, links: [{ rect, uri }] }]
export function pdfDoc({ pages, lang, title, subject, author, now = new Date() }) {
  const objs = [null, null, null, null, null];
  const add = (s) => { objs.push(s); return objs.length; };
  const kids = [];
  for (const p of pages) {
    const annots = (p.links || []).filter((l) => l && Array.isArray(l.rect) && l.rect.length === 4 && /^https?:\/\//.test(String(l.uri || '')));
    const pageNo = add(null);
    const contentNo = add(`<< /Length ${p.content.length} >>\nstream\n${p.content}\nendstream`);
    const annotNos = annots.map((l) => add(`<< /Type /Annot /Subtype /Link /Rect [${l.rect.map(n).join(' ')}] /Border [0 0 0] /A << /Type /Action /S /URI /URI ${lit(win(l.uri))} >> >>`));
    objs[pageNo - 1] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(W)} ${n(H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /ProcSet [/PDF /Text] >> /Contents ${contentNo} 0 R${annotNos.length ? ` /Annots [${annotNos.map((x) => `${x} 0 R`).join(' ')}]` : ''} >>`;
    kids.push(pageNo);
  }
  objs[0] = `<< /Type /Catalog /Pages 2 0 R /Lang ${lit(lang === 'en' ? 'en' : 'pt-PT')} /ViewerPreferences << /DisplayDocTitle true >> >>`;
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  objs[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  objs[4] = `<< /Title ${u16(title)} /Author ${u16(author)} /Subject ${u16(subject)} /Creator (gocarmo.com) /Producer (gocarmo.com) /CreationDate (${pdfDate(now)}) >>`;
  let pdf = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const at = [];
  objs.forEach((o, i) => { at.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const all = pages.map((p) => p.content).join('\n');
  const xref = pdf.length, id = fnv(all, 2166136261) + fnv(all, 16777619) + fnv(title, 2166136261) + fnv(pdfDate(now), 99991);
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${at.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 5 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
  return bytes;
}

// ---------- drawing helpers over one list of operators ----------
const rect = (ops, x, y, w, h, c) => { if (w > 0 && h > 0) ops.push(`${rg(c)} ${n(x)} ${n(y)} ${n(w)} ${n(h)} re f`); };
const line = (ops, x0, y0, x1, y1, w, c) => ops.push(`${RG(c)} ${n(w)} w ${n(x0)} ${n(y0)} m ${n(x1)} ${n(y1)} l S`);
function tx(ops, x, y, s, o = {}) { draw(ops, 1).text(x, y, win(s), o); }
// a paragraph from the top y; returns the height it took
function para(ops, x, y, s, w, { size = 10, lead = size * 1.36, f = 1, color = INK } = {}) {
  const ls = wrap(win(s), f, size, w);
  ls.forEach((l, i) => draw(ops, 1).text(x, y - size * 0.78 - i * lead, l, { f, size, color }));
  return size * 0.78 + (ls.length - 1) * lead + size * 0.36;
}
// small capitals, wrapped (labels of tiles and tables)
function caps(ops, x, y, s, w, { size = 7.2, color = MUTED, right = false } = {}) {
  const b = win(String(s).toUpperCase());
  const ls = wrap(b, 2, size, w, 0.6);
  ls.forEach((l, i) => draw(ops, 1).text(right ? x + w : x, y - size * 0.8 - i * size * 1.3, l, { f: 2, size, color, tc: 0.6, right }));
  return size * 0.8 + (ls.length - 1) * size * 1.3 + size * 0.4;
}
// a round scale for an axis: 4 steps up to at least max
function niceMax(max) {
  if (max <= 4) return 4;
  const raw = max / 4, p = 10 ** Math.floor(Math.log10(raw)), m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  return step * 4;
}
const title = (ops, x, y, s, w) => (s ? para(ops, x, y, s, w, { size: 11.5, f: 2, lead: 14 }) + 6 : 0);
const lead = (ops, x, y, s, w) => (s ? para(ops, x, y, s, w, { size: 8.8, color: MUTED, lead: 11.8 }) + 6 : 0);
const note = (ops, x, y, s, w) => (s ? 4 + para(ops, x, y - 4, s, w, { size: 8.2, color: MUTED, lead: 10.8 }) : 0);

// ---------- blocks: render(ops, x, top, w, block, ctx) -> height ----------
const R = {
  cover(ops, x, y, w, b) {
    let h = 0;
    h += caps(ops, x, y, b.kicker, w, { size: 7.8, color: GOLD_INK }) + 6;
    h += para(ops, x, y - h, b.h, w, { size: 24, f: 2, lead: 28 }) + 4;
    h += para(ops, x, y - h, b.sub, w, { size: 13, lead: 16 }) + 8;
    for (const s of b.notes || []) h += para(ops, x, y - h, s, w, { size: 8.8, color: MUTED, lead: 11.5 }) + 2;
    return h + 12;
  },
  h(ops, x, y, w, b) {
    let h = para(ops, x, y, b.text, w, { size: 17, f: 2, lead: 20 });
    if (b.sub) h += 2 + para(ops, x, y - h - 2, b.sub, w, { size: 12, color: GOLD_INK, lead: 15 });
    line(ops, x, y - h - 6, x + 36, y - h - 6, 1.6, GOLD);
    return h + 20;
  },
  p(ops, x, y, w, b) { return para(ops, x, y, b.text, w, { size: 10 }) + 10; },
  sec(ops, x, y, w, b) {
    let h = title(ops, x, y, b.title, w);
    if (b.big) {
      const bw = width(win(b.big), 2, 26) + 12;
      tx(ops, x, y - h - 22, b.big, { f: 2, size: 26, color: GOLD_INK });
      const ph = para(ops, x + bw, y - h, b.text, w - bw, { size: 10, lead: 13.4 });
      return h + Math.max(28, ph) + 14;
    }
    return h + para(ops, x, y - h, b.text, w, { size: 10, lead: 13.4 }) + 14;
  },
  facts(ops, x, y, w, b) {
    let h = 0;
    for (const s of b.rows) {
      rect(ops, x, y - h - 8.6, 4, 4, GOLD);
      h += para(ops, x + 12, y - h, s, w - 12, { size: 10.5, lead: 14 }) + 4;
    }
    return h + 10;
  },
  tiles(ops, x, y, w, b) {
    const gap = 8, cols = b.items.length, tw = (w - gap * (cols - 1)) / cols, pad = 9;
    // measure first (equal heights), then draw boxes under the text
    const body = (o, i, top) => {
      const it = b.items[i], tx0 = x + i * (tw + gap) + pad, iw = tw - 2 * pad;
      let h = pad;
      h += caps(o, tx0, top - h, it.k, iw, { size: 6.9 }) + 5;
      const vs = win(it.v), size = Math.min(21, (iw / Math.max(1, width(vs, 2, 21))) * 21);
      draw(o, 1).text(tx0, top - h - size * 0.78, vs, { f: 2, size });
      h += size * 0.78 + 7;
      h += para(o, tx0, top - h, it.sub, iw, { size: 7.8, color: MUTED, lead: 9.6 });
      if (it.delta) h += 3 + para(o, tx0, top - h - 3, it.delta, iw, { size: 7.8, color: GOLD_INK, f: 2, lead: 9.6 });
      return h + pad;
    };
    const hs = b.items.map((_, i) => body([], i, y));
    const th = Math.max(...hs);
    b.items.forEach((_, i) => draw(ops, 1).box(x + i * (tw + gap), y - th, tw, th, 6, BAND, null));
    b.items.forEach((_, i) => body(ops, i, y));
    return th + 18;
  },
  line(ops, x, y, w, b, ctx) {
    let h = title(ops, x, y, b.title, w);
    const ch = 180, lw = 34, px = x + lw, pw = w - lw - 6, top = y - h - 8, base = top - ch;
    const max = niceMax(Math.max(1, ...b.points.map((p) => p.v)));
    for (let i = 0; i <= 4; i++) {
      const gy = base + (ch * i) / 4;
      line(ops, px, gy, px + pw, gy, i ? 0.4 : 0.8, i ? LINE : MUTED);
      tx(ops, px - 5, gy - 2.5, ctx.f.int((max * i) / 4), { size: 7, color: MUTED, right: true });
    }
    const N = b.points.length, xs = (i) => px + (N === 1 ? pw / 2 : (pw * i) / (N - 1)), ys = (v) => base + (ch * v) / max;
    const pts = b.points.map((p, i) => `${n(xs(i))} ${n(ys(p.v))}`);
    ops.push(`${rg(SOFT)} ${n(xs(0))} ${n(base)} m ${pts.map((p) => `${p} l`).join(' ')} ${n(xs(N - 1))} ${n(base)} l h f`);
    ops.push(`${RG(INK)} 1.3 w 1 j ${pts[0]} m ${pts.slice(1).map((p) => `${p} l`).join(' ')} S`);
    const labelAll = N <= 16;
    b.points.forEach((p, i) => {
      if (labelAll || i === b.top) {
        ops.push(`${rg(i === b.top ? GOLD : INK)} ${n(xs(i) - 2)} ${n(ys(p.v) - 2)} 4 4 re f`);
        tx(ops, Math.min(Math.max(xs(i), px + 8), px + pw - 8) - width(win(p.text), i === b.top ? 2 : 1, 7) / 2, ys(p.v) + 5, p.text, { size: 7, f: i === b.top ? 2 : 1, color: i === b.top ? GOLD_INK : INK });
      }
    });
    // x labels: as many as fit
    const lwMax = Math.max(...b.points.map((p) => width(win(p.label), 1, 7))) + 8;
    const step = Math.max(1, Math.ceil(N / Math.max(1, Math.floor(pw / lwMax))));
    let lastRight = -Infinity;
    b.points.forEach((p, i) => {
      if (i % step) return;
      const lw0 = width(win(p.label), 1, 7);
      const lx = Math.min(Math.max(xs(i) - lw0 / 2, px), px + pw - lw0);
      if (lx < lastRight + 4) return;          // never two labels on top of each other
      tx(ops, lx, base - 11, p.label, { size: 7, color: MUTED });
      lastRight = lx + lw0;
    });
    h += 8 + ch + 18;
    for (const s of b.summary || []) h += para(ops, x, y - h, s, w, { size: 9, color: MUTED, lead: 12 }) + 2;
    return h + 12;
  },
  cols(ops, x, y, w, b) {
    let h = title(ops, x, y, b.title, w);
    h += lead(ops, x, y - h, b.lead, w);
    const N = b.points.length, ch = 96, top = y - h - 12, base = top - ch;
    const max = Math.max(1, ...b.points.map((p) => p.v));
    const slot = w / N, cw = Math.min(34, slot * 0.62);
    line(ops, x, base, x + w, base, 0.8, MUTED);
    let lblH = 0;
    b.points.forEach((p, i) => {
      const cx = x + slot * i + slot / 2, bh = (ch * p.v) / max;
      rect(ops, cx - cw / 2, base, cw, Math.max(bh, p.v ? 0.8 : 0), b.gold ? GOLD : INK);
      const tw = width(win(p.text), 1, 7.5);
      tx(ops, cx - tw / 2, base + bh + 4, p.text, { size: 7.5 });
      const ls = wrap(win(p.label), 1, 7, slot - 4);
      ls.forEach((l, j) => draw(ops, 1).text(cx - width(l, 1, 7) / 2, base - 10 - j * 8.5, l, { size: 7, color: MUTED }));
      lblH = Math.max(lblH, 10 + (ls.length - 1) * 8.5);
    });
    return h + 12 + ch + lblH + 16;
  },
  grouped(ops, x, y, w, b) {
    let h = title(ops, x, y, b.title, w);
    h += lead(ops, x, y - h, b.lead, w);
    const colors = [INK, GOLD, GREY];
    let lx = x;
    b.legend.forEach((s, i) => { rect(ops, lx, y - h - 7, 7, 7, colors[i]); tx(ops, lx + 10, y - h - 7, s, { size: 7.8, color: MUTED }); lx += 10 + width(win(s), 1, 7.8) + 14; });
    h += 16;
    const N = b.groups.length, ch = 92, top = y - h - 12, base = top - ch;
    const max = Math.max(1, ...b.groups.flatMap((g) => g.vals));
    const slot = w / N, cw = Math.min(12, (slot * 0.7) / 3);
    line(ops, x, base, x + w, base, 0.8, MUTED);
    const valueLabels = N <= 6;
    b.groups.forEach((g, i) => {
      const cx = x + slot * i + slot / 2;
      g.vals.forEach((v, j) => {
        const bx = cx - (cw * 3) / 2 + j * cw, bh = (ch * v) / max;
        rect(ops, bx + 0.6, base, cw - 1.2, Math.max(bh, v ? 0.8 : 0), colors[j]);
        if (valueLabels) { const s = String(v); tx(ops, bx + cw / 2 - width(s, 1, 6.5) / 2, base + bh + 3, s, { size: 6.5 }); }
      });
      const l = win(g.label);
      draw(ops, 1).text(cx - width(l, 1, 7) / 2, base - 10, l, { size: 7, color: MUTED });
    });
    return h + 12 + ch + 22;
  },
  bars(ops, x, y, w, b) {
    let h = title(ops, x, y, b.title, w);
    const lw = w * (b.narrow ? 0.4 : 0.3), tw = Math.max(...b.rows.map((r) => width(win(r.text), 1, 8))) + 8;
    const bw = w - lw - tw, max = b.max || Math.max(1e-9, ...b.rows.map((r) => r.v));
    for (const r of b.rows) {
      const ls = wrap(win(r.label), 1, 8.6, lw - 6);
      const rh = Math.max(15, 4 + ls.length * 10.5);
      ls.forEach((l, j) => draw(ops, 1).text(x, y - h - 10 - j * 10.5, l, { size: 8.6, color: r.other ? MUTED : INK }));
      const len = (bw * r.v) / max;
      rect(ops, x + lw, y - h - 11.5, Math.max(len, r.v ? 0.8 : 0), 8.5, r.other ? GREY : INK);
      tx(ops, x + lw + len + 5, y - h - 10, r.text, { size: 8, color: MUTED });
      h += rh;
    }
    h += note(ops, x, y - h, b.note, w);
    return h + 14;
  },
  stack(ops, x, y, w, b) {
    let h = title(ops, x, y, b.title, w);
    const colors = [INK, GOLD, GREY];
    let cx = x;
    b.parts.forEach((p, i) => { const pw = w * p.share; rect(ops, cx, y - h - 16, pw, 16, colors[i % 3]); cx += pw; });
    h += 26;
    b.parts.forEach((p, i) => {
      rect(ops, x, y - h - 7.5, 7, 7, colors[i % 3]);
      tx(ops, x + 12, y - h - 7.5, p.label, { size: 9 });
      tx(ops, x + w, y - h - 7.5, p.text, { size: 9, color: MUTED, right: true });
      h += 14;
    });
    return h + 14;
  },
  table(ops, x, y, w, b) {
    let h = title(ops, x, y, b.title, w);
    h += lead(ops, x, y - h, b.lead, w);
    const nc = b.head.length;
    const numW = nc === 2 ? 84 : nc === 3 ? Math.min(118, w * 0.3) : Math.min(92, w * 0.22);
    const cws = [w - numW * (nc - 1), ...Array(nc - 1).fill(numW)];
    const xs = cws.map((_, i) => x + cws.slice(0, i).reduce((s, v) => s + v, 0));
    let hh = 0;
    b.head.forEach((s, i) => { if (s) hh = Math.max(hh, caps(ops, xs[i] + (i ? 6 : 0), y - h, s, cws[i] - (i ? 6 : 0), { size: 6.8, right: b.align[i] === 'r' })); });
    h += hh + 4;
    line(ops, x, y - h, x + w, y - h, 0.6, INK);
    b.rows.forEach((row, ri) => {
      const bold = b.totalRow && ri === b.rows.length - 1;
      const first = wrap(win(row[0]), bold ? 2 : 1, 9.2, cws[0] - 8);
      const rh = 6 + first.length * 11.5;
      first.forEach((l, j) => draw(ops, 1).text(x, y - h - 12 - j * 11.5, l, { size: 9.2, f: bold ? 2 : 1 }));
      row.slice(1).forEach((s, i) => tx(ops, xs[i + 1] + cws[i + 1], y - h - 12, s, { size: 9.2, f: bold ? 2 : 1, right: true }));
      h += rh;
      line(ops, x, y - h, x + w, y - h, 0.4, LINE);
    });
    h += note(ops, x, y - h - 2, b.note, w);
    return h + 16;
  },
  box(ops, x, y, w, b) {
    const pad = 12, inner = [];
    let h = pad;
    h += para(inner, x + pad, y - h, b.title, w - 2 * pad, { size: 10.5, f: 2 }) + 3;
    h += para(inner, x + pad, y - h, b.text, w - 2 * pad, { size: 8.8, lead: 12, color: INK });
    h += pad;
    draw(ops, 1).box(x, y - h, w, h, 6, TINT, GOLD_INK);
    ops.push(...inner);
    return h + 10;
  },
  two(ops, x, y, w, b, ctx) {
    const gap = 22, cw = (w - gap) / 2;
    const hl = R[b.left.t](ops, x, y, cw, b.left, ctx);
    const hr = R[b.right.t](ops, x + cw + gap, y, cw, b.right, ctx);
    return Math.max(hl, hr);
  },
};
const measure = (b, w, ctx) => R[b.t]([], M, H, w, b, ctx);

// ---------- the pages ----------
function header(ops, links, first, m) {
  if (first) {
    const y = H - M;
    emblem(ops, M, y - 30, 30);
    tx(ops, M + 40, y - 14, 'GOCARMO', { f: 2, size: 15, tc: 1.6 });
    tx(ops, M + 40, y - 27, m.head.name, { size: 9, color: MUTED });
    tx(ops, W - M, y - 14, m.head.site, { size: 9, color: MUTED, right: true });
    const sw = width(win(m.head.site), 1, 9);
    links.push({ rect: [W - M - sw, y - 17, W - M, y - 5], uri: 'https://gocarmo.com/' });
    line(ops, M, y - 44, W - M, y - 44, 1, GOLD_INK);
  } else {
    const y = H - M;
    emblem(ops, M, y - 18, 18);
    tx(ops, M + 25, y - 12.5, 'GOCARMO', { f: 2, size: 10, tc: 1.1 });
    const s = wrap(win(m.title), 1, 8.5, CW - 140)[0];
    draw(ops, 1).text(W - M, y - 12.5, s, { size: 8.5, color: MUTED, right: true });
    line(ops, M, y - 30, W - M, y - 30, 0.7, GOLD_INK);
  }
}

export function reportPdf(m, now = new Date()) {
  const ctx = { f: fmt(m.lang) };
  const pages = [];
  let cur = null, y = 0;
  const open = () => { cur = { ops: [], links: [] }; header(cur.ops, cur.links, !pages.length, m); y = pages.length ? TOPN : TOP1; pages.push(cur); };
  for (const blocks of m.pages) {
    open();
    blocks.forEach((b, i) => {
      let need = measure(b, CW, ctx);
      // a heading keeps its first block with it
      if (b.t === 'h' && blocks[i + 1]) need += Math.min(measure(blocks[i + 1], CW, ctx), 140);
      if (y - need < BOTTOM && y < (pages.length > 1 ? TOPN : TOP1) - 1) open();
      y -= R[b.t](cur.ops, M, y, CW, b, ctx);
    });
  }
  pages.forEach((p, i) => {
    const s = fill(m.foot, { period: m.period, i: i + 1, n: pages.length });
    line(p.ops, M, M - 8, W - M, M - 8, 0.5, LINE);
    const ls = wrap(win(s), 1, 7.5, CW);
    draw(p.ops, 1).text(M, M - 20, ls[0], { size: 7.5, color: MUTED });
  });
  return pdfDoc({ pages: pages.map((p) => ({ content: p.ops.join('\n'), links: p.links })), lang: m.lang, title: m.docTitle, subject: m.subject, author: m.author, now });
}
