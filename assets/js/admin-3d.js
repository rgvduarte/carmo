// The admin's 3D preview ("Ver no 3D"): the site's own suit and helmet (suit.js, helmet.js) on one renderer, printed
// the way the live site prints sponsors (adspace.js printSponsors), with the logo being sold on its spots.
// admin.js imports this module only when asked, so three.js is never fetched before that tap.
import { Suit } from './suit.js';
import { itemOf, money } from './admin-core.js';

const LABELS = { sold: 'VENDIDO', reserved: 'RESERVADO', top: 'DESTAQUE' };
let stage = null, suit = null, helmet = null, helmetBuild = null, ctx = null;
const files = new Map();   // logo path -> Promise<Blob>, from the live site

// adspace.js inkOf(): mean luminance of the inked pixels
function inkOf(c) {
  const p = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let sum = 0, wt = 0;
  for (let i = 0; i < p.length; i += 16) { const a = p[i + 3] / 255; sum += a * (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]); wt += a; }
  return wt ? sum / wt : 255;
}
// adspace.js printSponsors(): white backgrounds out; a dark logo on a dark area is knocked out to white
async function prep(blob, m, s, mono) {
  let c = await Suit.prepareLogo(blob, { removeWhite: true, mono: mono || null });
  if (!mono && m.rects.get(s.id)?.light === false && inkOf(c) < 110) c = await Suit.prepareLogo(blob, { removeWhite: true, mono: '#f6f7f9' });
  return c;
}

// spots: this model's spots after the action (a clone of the effective view); cands: where the new logo goes
async function dress(m, spots) {
  m.logos.clear();
  m.update(spots);   // layout, base (sets each rect's light), tiles
  await Promise.all(spots.filter((s) => s.status === 'sold' && s.logo && !ctx.cands.includes(s.id)).map(async (s) => {
    try {
      if (!files.has(s.logo)) files.set(s.logo, fetch(new URL(s.logo, ctx.root)).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.blob(); }));
      s._logo = await prep(await files.get(s.logo), m, s, s.logoMono);
    } catch (_) { files.delete(s.logo); }
  }));
  for (const id of ctx.cands) { const s = spots.find((x) => x.id === id); if (s) m.logos.set(id, await prep(ctx.blob, m, s, null)); }
  m.drawBase(); m.drawOverlay(); m.kick();
}

async function ensureHelmet() {
  helmetBuild ||= (async () => {
    const { Helmet } = await import('./helmet.js');
    const h = new Helmet(stage, { spots: ctx.helmet, money, labels: LABELS, onSelect() {}, onHover() {}, renderer: suit.renderer, active: false });
    await h.prepare();   // the constant part of the bake, before any logo is printed
    return h;
  })().catch((e) => { helmetBuild = null; throw e; });
  helmet = await helmetBuild;
  if (helmet._ctx !== ctx) { helmet._ctx = ctx; await dress(helmet, ctx.helmet); await helmet.ready(); }
  return helmet;
}

async function show(it) {
  const m = it === 'helmet' ? await ensureHelmet() : suit;
  for (const k of [suit, helmet]) if (k && k !== m) k.setActive(false);
  m.setActive(true);
  if (!m._shown) { m._shown = true; m.reveal(); }
  m.setShowSpots(true);
  const id = ctx.cands.find((x) => m.rects.has(x));
  m.setAuto(false);
  if (id) m.focus(id); else m.home();
  m.kick();
}

function close() { for (const k of [suit, helmet]) if (k) k.setActive(false); }

export async function preview(el, { spots, cands, blob, root }) {
  if (stage && stage !== el) throw new Error('one stage only');
  stage = el;
  ctx = { suit: spots.filter((s) => itemOf(s) === 'suit'), helmet: spots.filter((s) => itemOf(s) === 'helmet'), cands, blob, root };
  const items = new Set(cands.map((id) => itemOf(spots.find((s) => s.id === id) || {})));
  const first = items.has('suit') || !items.size ? 'suit' : 'helmet';
  if (!suit) suit = new Suit(stage, { spots: ctx.suit, money, labels: LABELS, onSelect() {}, onHover() {}, active: false });
  await dress(suit, ctx.suit);
  await show(first);
  return { items, first, show, close, helmetReady: () => !!helmet && helmet._ctx === ctx };
}
