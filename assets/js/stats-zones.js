// Page zones for stats.js and the heatmaps in /admin/analytics/. Page order; a zone's box is the union of its elements.
export const ZONES = [
  ['top', '#top'], ['tese', '#tese'], ['historia', '#historia'], ['prova', '#prova'], ['resultados', '#resultados'],
  ['dados', '#dados'], ['epoca', '#epoca'], ['fato-topo', '#fato .adspace-head, #fato .entry'], ['o-fato', '#o-fato'],
  ['o-capacete', '#o-capacete'], ['fato-termos', '#fato .offer, #fato .steps, #fato .rules'], ['media', '#media'],
  ['apoiar', '#apoiar'], ['contacto', '#contacto'], ['footer', 'body > footer'],
];
// fixed layers, innermost first
export const FIXED = [['reserva', '#claim'], ['opiniao', '#gc-fb'], ['pacote', '#package'], ['ficha', '#spot-card'],
  ['nav', '#nav'], ['aviso', '#toast']];
export const SCRUBBED = ['prova', 'resultados'];      // zone-relative y is meaningless (sticky, scroll-driven)
const SEL = Object.fromEntries([...ZONES, ...FIXED]);

// fixed layer first ('ficha' only for the phone's open spot sheet), then the zone; else inside #fato → 'fato-topo'
export function zoneOf(el) {
  if (!el || !el.closest) return null;
  for (const [id, s] of FIXED) {
    if (id === 'ficha' && !(el.ownerDocument.defaultView.innerWidth <= 760 && el.closest('#spot-card.open'))) continue;
    if (el.closest(s)) return id;
  }
  for (const [id, s] of ZONES) if (el.closest(s)) return id;
  return el.closest('#fato') ? 'fato-topo' : null;
}

// union of the client rects (viewport coordinates), or null when absent or zero-size
export function zoneBox(doc, id) {
  let t = Infinity, l = Infinity, r = -Infinity, b = -Infinity;
  if (SEL[id]) for (const el of doc.querySelectorAll(SEL[id])) {
    const x = el.getBoundingClientRect();
    if (!x.width || !x.height) continue;
    t = Math.min(t, x.top); l = Math.min(l, x.left); r = Math.max(r, x.right); b = Math.max(b, x.bottom);
  }
  return r > l && b > t ? { top: t, left: l, right: r, bottom: b, width: r - l, height: b - t } : null;
}
