// «Todas as provas»: one poster per race, newest first, as HTML built from RESULTS (data.js).
// main.js renders it in the visitor's language. scripts/stamp.mjs writes the same markup into index.html, in
// Portuguese, for the page without JS, for print and for the first paint, so the JS render moves nothing.
// No imports: the caller hands in the i18n helpers (and Node can load this file on its own).

const LEGS = ['swim', 't1', 'bike', 't2', 'run'];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// «M25‑29», «Portugal‑Cascais», «2025‑2026»: word joiners, so a line never breaks at the hyphen
const keep = (s) => String(s).replace(/(\w)-(\w)/g, '$1⁠-⁠$2');
const secs = (s) => s.split(':').map(Number).reduce((a, x) => a * 60 + x, 0);
const kindOf = (r) => (r.splits ? 'tri' : 'run');

// What the cards need from each race. stamp.mjs refuses to publish while this lists anything.
export function checkResults(results) {
  const bad = [];
  for (const r of results) {
    const name = r.pt || '(sem nome)';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '')) bad.push(`${name}: date`);
    if (!/^(\d+:)?\d{1,2}:\d\d$/.test(r.time || '')) bad.push(`${name}: time`);
    if (!(r.rank >= 1 && r.field >= r.rank)) bad.push(`${name}: rank / field`);
    if (r.splits) {
      for (const k of LEGS) if (!/^(\d+:)?\d{1,2}:\d\d$/.test(r.splits[k] || '')) bad.push(`${name}: splits.${k}`);
      if (!r.ag || !(r.ag.rank >= 1) || !r.ag.cat || (r.ag.field != null && !(r.ag.field >= r.ag.rank))) bad.push(`${name}: ag { rank, field, cat }`);
    } else if (!/^\d+:\d\d$/.test(r.pace || '')) bad.push(`${name}: pace`);
  }
  return bad;
}

// L: { t, pick, numFmt, fmtDay, lang }. Returns the HTML of each part: kicker, count, filter, cards and ticks.
export function racesBlock(results, L) {
  const { t, pick, numFmt, fmtDay } = L;
  const en = L.lang === 'en';
  const list = results.filter((r) => r.date && r.rank && r.field).slice().sort((a, b) => b.date.localeCompare(a.date));
  const nth = (n) => (en ? `${n}${[, 'st', 'nd', 'rd'][(n % 100 >> 3 ^ 1) && n % 10] || 'th'}` : `${n}.º`);
  const of = (n, f) => `${nth(n)} ${en ? 'of' : 'de'} ${numFmt(f)}`;
  const count = { all: list.length, tri: list.filter((r) => r.splits).length };
  count.run = count.all - count.tri;
  const years = list.map((r) => r.date.slice(0, 4));
  const y0 = years[years.length - 1], y1 = years[0];

  const legs = (r) => {
    const s = Object.fromEntries(LEGS.map((k) => [k, secs(r.splits[k])]));
    const total = LEGS.reduce((a, k) => a + s[k], 0);
    const strip = LEGS.map((k) => `<i class="${k}" style="flex-grow: ${s[k]}"></i>`).join('');
    const dl = ['swim', 'bike', 'run'].map((k) => `<div><dt>${esc(t(`strava.${k}`))}</dt><dd>${esc(r.splits[k])}<small>${Math.round((s[k] / total) * 100)}%</small></dd></div>`).join('');
    return `<div class="pv-legs"><span class="pv-strip" aria-hidden="true">${strip}</span><dl class="pv-dl">${dl}</dl><p class="pv-tr">T1 ${esc(r.splits.t1)} · T2 ${esc(r.splits.t2)}</p></div>`;
  };
  const card = (r) => {
    const kind = kindOf(r);
    const dist = en ? r.dist.replace(/(\d),(\d)/g, '$1.$2') : r.dist;
    const label = r.tag ? `<span class="pv-tag">${esc(pick(r.tag))}</span>` : `<span class="pv-kind">${esc(t(`pv.kind.${kind}`))}</span>`;
    // the age group (gold) for a triathlon, the pace for a run
    const key = r.ag
      ? `<p class="pv-key ag"><span class="k">${esc(t('pv.ag'))}</span><b>${esc(keep(`${r.ag.field ? of(r.ag.rank, r.ag.field) : nth(r.ag.rank)} · ${r.ag.cat}`))}</b></p>`
      : r.pace ? `<p class="pv-key"><span class="k">${esc(t('chart.pace'))}</span><b>${esc(r.pace)} /km</b></p>` : '';
    // where a triathlon has its legs, a run has its line from the notes
    const more = r.splits ? legs(r) : r.note ? `<p class="pv-note">${esc(keep(pick(r.note)))}</p>` : '';
    // the field, winner on the left: dim = ahead of him, gold = him, bright = finished behind (the stage's rounding)
    const behind = Math.floor(((r.field - r.rank) / r.field) * 1000) / 10;
    return `<li class="pv-card" data-kind="${kind}">`
      + `<div class="pv-hd"><h4 class="pv-name">${esc(keep(pick(r)))}</h4><p class="pv-where"><span>${esc(pick(r.place))}</span><span class="pv-dist">${esc(dist)}</span></p></div>`
      + `<p class="pv-meta"><time datetime="${esc(r.date)}">${esc(fmtDay(r.date))}</time>${label}</p>`
      + `<p class="pv-time"><span class="sr-only">${esc(t('chart.time'))}: </span>${esc(r.time)}</p>`
      + key + more
      + `<div class="pv-field"><p class="pv-overall"><span class="k">${esc(t('pv.overall'))}</span><b>${esc(of(r.rank, r.field))}</b><span class="pv-pct">${esc(t('pv.behind', numFmt(behind, 1)))}</span></p>`
      + `<span class="pv-bar" aria-hidden="true" style="--at: ${((r.rank / r.field) * 100).toFixed(2)}%"><i class="a"></i><i class="m"></i><i class="b"></i></span></div>`
      + '</li>';
  };
  // a filter only when there are both kinds; the dot is the same mark as the ticks under the cards
  const chip = (k) => `<button type="button" data-kind="${k}" aria-pressed="${k === 'all'}">`
    + (k === 'all' ? '' : `<i class="pv-dot ${k}" aria-hidden="true"></i>`)
    + `<span>${esc(t(k === 'all' ? 'pv.all' : `pv.kind.${k}`))}</span><span class="n">${count[k]}</span></button>`;
  return {
    kick: list.length ? esc(t('pv.kick', list.length, keep(y0 === y1 ? y0 : `${y0}-${y1}`))) : '',
    total: String(list.length).padStart(2, '0'),
    filter: count.tri && count.run ? ['all', 'tri', 'run'].map(chip) : [],
    cards: list.map(card),
    // one tick per race, newest first: filled for a triathlon, a ring for a run
    ticks: list.map((r, i) => `<button type="button" class="pv-tick ${kindOf(r)}" tabindex="${i ? -1 : 0}" aria-label="${esc(pick(r))}"><i></i></button>`),
  };
}
