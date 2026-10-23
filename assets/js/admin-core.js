// Spot rules for the admin page (admin/index.html). Pure: no DOM, no fetch, no storage, so Node can test it
// against scripts/spot-update.mjs, the issue-form bot. applyAction() runs the bot's apply block statement by
// statement, so data/spots.json comes out byte for byte as the bot would write it and the public site
// (adspace.js) renders it unchanged.

export const REPO = 'rgvduarte/carmo';
export const BRANCH = 'gh-pages';
export const SPOTS_PATH = 'data/spots.json';
export const BRANDS = 'assets/img/brands';
export const MAX_LOGO = 3 * 1024 * 1024;   // the bot's MAX_LOGO: exactly 3 MB passes
export const TITLE = 'fato';               // the title package (whole suit), as the bot names it
export const SITE = 'https://gocarmo.com';

export const MSG = {
  needBrandSold: 'Para marcar como vendido, escreve o nome da marca.',
  needBrandReserve: 'Para reservar, escreve o nome da marca.',
  badUrl: 'O link não é válido (ex.: https://marca.pt ou @marca).',
  badDate: 'Data inválida (usa o calendário).',
  pastDate: 'Essa data já passou.',
  logoType: 'O logótipo tem de ser PNG, JPG, WebP ou SVG.',
  logoBig: 'O logótipo tem mais de 3 MB.',
  svgActive: 'Este SVG tem código ativo. Exporta-o em PNG.',
};

export class RuleError extends Error {}

export const pad2 = (n) => String(n).padStart(2, '0');
export const itemOf = (s) => s.item || 'suit';   // a spot without "item" is on the suit
export const todayUTC = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5);
// adspace.js lapsed(): a reservation lapses on its own once its `until` day is over (UTC)
export const lapsed = (x, now = Date.now()) => x.status === 'reserved' && !!x.until && Date.parse(`${x.until}T23:59:59Z`) < now;

// i18n.js fmtDay(iso, { year: false }) and money(), in PT: '26 out.', '3 000 €'
const PT_MON = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
export const fmtDay = (iso) => { const [, m, d] = String(iso).split('-').map(Number); return `${d} ${PT_MON[m - 1] || ''}`.trim(); };
const EUR = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' });
export const money = (n) => EUR.format(n);

export const targetOf = (data, id) => (id === TITLE ? data.title : data.spots.find((s) => s.id === id));
export const nameOf = (data, id) => (id === TITLE ? 'Fato completo' : targetOf(data, id)?.pt?.name || id);
export const labelOf = (data, id) => (id === TITLE ? 'Fato completo' : `${pad2(targetOf(data, id).n)} · ${nameOf(data, id)}`);
// spots in ascending n, the title last (the order the bot would be run in, one issue per spot)
export function sortTargets(data, ids) {
  const n = (id) => (id === TITLE ? Infinity : targetOf(data, id)?.n ?? Infinity);
  return [...new Set(ids)].sort((a, b) => n(a) - n(b));
}
// the public link of a spot: #fato/<id> on the suit, #capacete/<id> on the helmet, #fato for the title
export const liveLink = (data, id) => (id === TITLE ? `${SITE}/#fato` : `${SITE}/#${itemOf(targetOf(data, id)) === 'helmet' ? 'capacete' : 'fato'}/${id}`);

// ---------- inputs, normalised exactly like the bot ----------
export const normBrand = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);

export function normUrl(s) {
  let url = String(s ?? '').trim();
  if (url.startsWith('@')) {
    const handle = url.slice(1).replace(/[^\w.]/g, '');
    if (!handle) throw new RuleError(MSG.badUrl);   // stricter than the bot: a bare "@" is no link
    url = `https://www.instagram.com/${handle}/`;
  } else if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
  if (url) { try { url = new URL(url).href; } catch (_) { throw new RuleError(MSG.badUrl); } }
  return url;
}

export function normUntil(s, today) {
  let u = String(s ?? '').trim();
  if (!u) u = addDays(today, 3);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(u) || Number.isNaN(Date.parse(u)) || new Date(u).toISOString().slice(0, 10) !== u) throw new RuleError(MSG.badDate);
  if (u < today) throw new RuleError(MSG.pastDate);
  return u;
}

// action: 'reserved' | 'sold' | 'available'. Both holds need a brand here (the bot asks for one only on a sale).
export function normalize(action, { brand = '', url = '', until = '' } = {}, today) {
  if (action === 'available') return { brand: '', url: '', until: '' };
  const b = normBrand(brand);
  if (!b) throw new RuleError(action === 'sold' ? MSG.needBrandSold : MSG.needBrandReserve);
  return { brand: b, url: normUrl(url), until: action === 'reserved' ? normUntil(until, today) : '' };
}

// ---------- the write (scripts/spot-update.mjs, "apply") ----------
// raw: the parsed file, never the effective view. brandFiles: the names under assets/img/brands at the base
// commit. logoExt: the new logo's extension, for a sale with a file. Returns the new data, its text and the
// files to write (all with the one logo blob) and delete.
export function applyAction(raw, ids, action, f, { today, brandFiles = [], logoExt = null } = {}) {
  if (!['reserved', 'sold', 'available'].includes(action)) throw new RuleError('Estado inválido.');
  const data = structuredClone(raw);
  const writes = [], deletes = new Set();
  const filesOf = (id) => brandFiles.filter((name) => name.startsWith(`${id}.`)).map((name) => `${BRANDS}/${name}`);
  for (const id of sortTargets(data, ids)) {
    const target = targetOf(data, id);
    if (!target) throw new RuleError(`O espaço "${id}" não existe em data/spots.json.`);
    const prevBrand = target.brand;
    for (const k of ['brand', 'url', 'until']) delete target[k];
    target.status = action;
    // a logo belongs to the brand that bought the spot: it goes when the spot is freed, held or changes hands
    if (action !== 'sold' || f.brand !== prevBrand) { delete target.logo; delete target.logoMono; filesOf(id).forEach((p) => deletes.add(p)); }
    if (f.brand && action !== 'available') target.brand = f.brand;
    if (f.url && action !== 'available') target.url = f.url;
    if (action === 'reserved') target.until = f.until;
    if (action === 'sold' && logoExt) {
      filesOf(id).forEach((p) => deletes.add(p));
      const path = `${BRANDS}/${id}.${logoExt}`;
      writes.push(path);
      target.logo = path;
    }
  }
  data.updated = today;
  for (const p of writes) deletes.delete(p);   // replacing peito.png with peito.png is one tree entry
  return { data, text: `${JSON.stringify(data, null, 2)}\n`, writes, deletes: [...deletes] };
}

// ---------- what the site shows (adspace.js initAdspace, lines 43-51), plus flags for the list ----------
// own: the spot's own status after a lapse, before the title overlay. expired: the lapsed hold.
// byTitle: the status comes from the title package.
export function effective(raw, now = Date.now()) {
  const v = structuredClone(raw);
  for (const x of [...v.spots, v.title]) {
    if (lapsed(x, now)) { x.expired = { brand: x.brand, until: x.until }; x.status = 'available'; }
    x.own = x.status;
  }
  const T = v.title;
  if (T.status === 'reserved') for (const s of v.spots) if (itemOf(s) === 'suit' && s.status === 'available') Object.assign(s, { status: 'reserved', until: T.until, byTitle: true });
  if (T.status === 'sold') {
    for (const s of v.spots) if (itemOf(s) === 'suit' && s.status !== 'sold') Object.assign(s, { status: 'sold', brand: T.brand, url: T.url, byTitle: true });
    const top = v.spots.find((s) => s.top);
    if (top && T.logo && !top.logo) Object.assign(top, { logo: T.logo, logoMono: T.logoMono, titleLogo: true });
  }
  return v;
}

// the chip on a row, and its second line
export function statusOf(v, x, today) {
  const T = v.title;
  if (x.byTitle) return x.status === 'sold'
    ? { key: 'sold', chip: `Vendido · ${T.brand || 'fato completo'} (fato completo)` }
    : { key: 'reserved', chip: `Reservado até ${fmtDay(T.until)} (fato completo)`, sub: T.brand };
  if (x.status === 'sold') return { key: 'sold', chip: x.brand ? `Vendido · ${x.brand}` : 'Vendido', sub: [x.logo ? 'com logótipo' : 'sem logótipo', hostOf(x.url)].filter(Boolean).join(' · ') };
  if (x.status === 'reserved') {
    const d = daysBetween(today, x.until);
    const chip = d <= 0 ? 'Reservado até hoje · último dia' : `Reservado até ${fmtDay(x.until)} · ${d === 1 ? 'falta 1 dia' : `faltam ${d} dias`}`;
    return { key: 'reserved', chip, sub: x.brand };
  }
  if (x.expired) return { key: 'expired', chip: 'Reserva expirada', sub: `era ${x.expired.brand || 'sem marca'} até ${fmtDay(x.expired.until)}` };
  return { key: 'available', chip: 'Livre' };
}
const hostOf = (u) => { try { return u ? new URL(u).host.replace(/^www\./, '') : ''; } catch (_) { return ''; } };

// ---------- guards (on the effective view) ----------
// blocked: the action cannot go ahead. confirms: it can, after a yes. brand: the normalised brand, or
// undefined before the sheet is filled in (then only the checks that do not depend on it run).
export function guard(raw, now, ids, action, brand) {
  const v = effective(raw, now), T = v.title, blocked = [], confirms = [];
  const known = brand !== undefined;
  const titleHeld = T.status === 'reserved' || T.status === 'sold';
  for (const id of sortTargets(raw, ids)) {
    const x = targetOf(v, id), r = targetOf(raw, id);
    if (!x || !r) { blocked.push(`O espaço ${id} já não existe.`); continue; }
    const lbl = labelOf(raw, id), who = r.brand || 'sem marca';   // the stored brand: the title overlay rewrites the view's
    if (action === 'available') {
      if (x.byTitle && r.status === 'available') blocked.push(`${lbl} está no fato completo: liberta o fato completo.`);
      else if (r.status === 'available') blocked.push(`${lbl} já está livre.`);
      continue;
    }
    // while the whole suit is held, no suit spot is sold or held on its own (the helmet is not part of it)
    if (id !== TITLE && itemOf(r) === 'suit' && titleHeld) {
      blocked.push(T.status === 'sold'
        ? `O fato completo está vendido a ${T.brand || 'sem marca'}: liberta primeiro o fato completo.`
        : `O fato completo está reservado até ${fmtDay(T.until)}: liberta primeiro o fato completo.`);
      continue;
    }
    if (id === TITLE) {
      // the whole suit: every suit spot free (a lapsed hold counts as free) or held by the very same brand
      const held = v.spots.filter((s) => itemOf(s) === 'suit' && s.own !== 'available').map((s) => targetOf(raw, s.id));
      const others = known ? held.filter((s) => s.brand !== brand) : (new Set(held.map((s) => s.brand)).size > 1 ? held : []);
      if (others.length) { blocked.push(`Liberta primeiro: ${others.map((s) => `${labelOf(raw, s.id)} (${s.brand || 'sem marca'})`).join(', ')}.`); continue; }
    }
    if (action === 'reserved' && x.own === 'sold') { blocked.push(`${lbl} já está vendido a ${who}. Liberta-o primeiro.`); continue; }
    if (!known) continue;
    if (x.own === 'reserved' && r.brand !== brand) confirms.push(action === 'reserved'
      ? `${lbl}: substitui a reserva de ${who} (até ${fmtDay(r.until)}).`
      : `${lbl}: estava reservado para ${who} até ${fmtDay(r.until)}. Passa a ${brand}.`);
    if (x.own === 'sold' && r.brand !== brand) confirms.push(`${lbl}: vendido a ${who}. Fica de ${brand}${r.logo ? ` e o logótipo de ${who} sai do site` : ''}.`);
  }
  return { blocked: [...new Set(blocked)], confirms };
}

// what the admin saw of each target when the sheet opened; a save stops if any of it changed meanwhile
export function snapshot(raw, ids) {
  const pick = (t) => (t ? { status: t.status, brand: t.brand, url: t.url, until: t.until, logo: t.logo, logoMono: t.logoMono } : null);
  return Object.fromEntries(ids.map((id) => [id, JSON.stringify(pick(targetOf(raw, id)))]));
}
export function changedSince(snap, raw) {
  const fresh = snapshot(raw, Object.keys(snap));
  return Object.keys(snap).filter((id) => fresh[id] !== snap[id]);
}

// ---------- payment reference: 'KONA 01 21 22', 'kona 1,21', 'KONA-01-21', 'KONA FATO' ----------
export function parseRef(text, data) {
  // what comes after KONA, when it is there (a pasted bank line may carry a date or an amount before it)
  const up = String(text || '').toUpperCase(), at = up.indexOf('KONA');
  const toks = (at >= 0 ? up.slice(at + 4) : up).match(/FATO|APOIO|\d+/g) || [];
  const out = { ids: [], unknown: [], note: '' };
  if (toks.includes('APOIO') && !toks.some((x) => x !== 'APOIO')) { out.note = 'KONA APOIO é um donativo, não um espaço.'; return out; }
  const nums = [...new Set(toks.filter((x) => /^\d+$/.test(x)).map(Number))];
  if (toks.includes('FATO')) {
    out.ids = [TITLE];
    const rest = nums.map((n) => data.spots.find((x) => x.n === n)).filter(Boolean);
    if (rest.length) out.note = rest.every((x) => itemOf(x) === 'helmet') ? 'O fato completo vai sozinho; o capacete trata-se à parte.' : 'O fato completo vai sozinho; os outros espaços tratam-se à parte.';
    return out;
  }
  for (const n of nums) {
    const sp = data.spots.find((x) => x.n === n);
    if (sp) out.ids.push(sp.id); else out.unknown.push(n);
  }
  return out;
}

// the expected payment: adspace.js totals() (bundle discount from bundle.min spots, suit and helmet together)
export function totals(data, ids) {
  if (ids.includes(TITLE)) return { gross: data.title.price, net: data.title.price, disc: 0 };
  const list = ids.map((id) => targetOf(data, id)).filter(Boolean);
  const gross = list.reduce((a, s) => a + s.price, 0);
  const disc = data.bundle && list.length >= data.bundle.min ? data.bundle.discount : 0;
  return { gross, net: Math.round(gross * (1 - disc)), disc };
}

// ---------- commit message: 'Espaços 01 e 21 vendidos a Marca X (admin)' ----------
export const joinPT = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} e ${xs[xs.length - 1]}`);
export function commitMessage(data, ids, action, f) {
  const sorted = sortTargets(data, ids), many = sorted.length > 1;
  const label = sorted[0] === TITLE ? 'Fato completo' : `${many ? 'Espaços' : 'Espaço'} ${joinPT(sorted.map((id) => pad2(targetOf(data, id).n)))}`;
  const s = many ? 's' : '';
  if (action === 'sold') return `${label} vendido${s} a ${f.brand} (admin)`;
  if (action === 'reserved') return `${label} reservado${s} para ${f.brand} até ${f.until} (admin)`;
  return `${label} libertado${s} (admin)`;
}

// ---------- logo files ----------
// the type comes from the bytes, not from the name or the browser's guess
export function sniffLogo(bytes) {
  const b = bytes;
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((x, i) => b[i] === x)) return 'png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'webp';
  const head = new TextDecoder('utf-8').decode(b.subarray(0, 4096)).replace(/^﻿/, '');
  const rest = head.replace(/^\s*(<\?xml[\s\S]*?\?>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>\s*)?(<!--[\s\S]*?-->\s*)*/i, '');
  if (/^<svg[\s>]/.test(rest)) return 'svg';
  return null;
}
export const MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

// A logo is served from gocarmo.com, the origin that keeps the admin token, and an SVG opened on its own runs its
// scripts: refuse any active content or reference that leaves the file.
export function svgSafe(text) {
  if (/<script|<foreignObject|<iframe|<embed|<object|<!ENTITY|\son[a-z]+\s*=|javascript:/i.test(text)) return false;
  for (const m of text.matchAll(/(?:^|[\s"'])(?:xlink:)?href\s*=\s*(["'])([\s\S]*?)\1/gi)) {
    const ref = m[2].trim();
    if (!ref.startsWith('#') && !/^data:image\//i.test(ref)) return false;
  }
  for (const m of text.matchAll(/url\(\s*(["']?)([^"')]*)\1\s*\)/gi)) {
    const ref = m[2].trim();
    if (!ref.startsWith('#') && !/^data:image\//i.test(ref)) return false;
  }
  if (/@import/i.test(text)) return false;
  return true;
}

// checks a picked file's bytes; returns { ext, mime } or throws a RuleError with the message to show
export function checkLogo(bytes) {
  if (bytes.length > MAX_LOGO) throw new RuleError(MSG.logoBig);
  const ext = sniffLogo(bytes);
  if (!ext) throw new RuleError(MSG.logoType);
  if (ext === 'svg' && !svgSafe(new TextDecoder('utf-8').decode(bytes))) throw new RuleError(MSG.svgActive);
  return { ext, mime: MIME[ext] };
}
export const logoPath = (id, ext) => `${BRANDS}/${id}.${ext}`;

// ---------- helpers for the GitHub contents API ----------
export function decodeB64Utf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  return new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}
export function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export const TOKEN_RE = /^(github_pat_|ghp_)[A-Za-z0-9_]{30,}$/;
