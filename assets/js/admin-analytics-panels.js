// One render function per tab of /admin/analytics/ (SPEC 5.4, 5.5): API shapes (SPEC 3.6) → cards. Form per card
// follows the dataviz method: ranked lists as one-colour bars, parts of a whole as 100 % stacks, time as lines on one
// axis, the funnel on the ordinal ramp, headline numbers as tiles. Every chart has its «Ver tabela» twin.
import { H, fmt, figure, table, emptyState, hbars, grouped, stack100, funnel, columns, stackCols, line, scatter, statTile, status, meter, legend, textW } from './admin-analytics-charts.js';
import * as L from './admin-analytics-labels.js';
import { drawMap } from './admin-analytics-map.js';
import { missing } from './admin-analytics-api.js';

const ZONES = ['top', 'tese', 'historia', 'prova', 'resultados', 'dados', 'epoca', 'fato-topo', 'o-fato', 'o-capacete', 'fato-termos', 'media', 'apoiar', 'material', 'contacto', 'footer'];
const ALL_DEV = 'Todos os aparelhos';
const NODATA = 'Ainda sem dados neste período.';
// privacy 2.7: with today in the period, «Resumo» shows totals only
const LIVE_CUT = 'Com o dia de hoje no período, não mostramos isto: duas leituras com minutos de diferença ligavam uma visita ao sítio de onde veio ou ao que fez. Escolhe 7 dias ou mais.';

// ---------- small helpers ----------
const grid = (p) => H('div', 'ga-grid', null, p);
const sec = (p, t) => H('h2', 'ga-sec', t, p);
const span = (el, s) => { el.classList.add(`s${s}`); return el; };
const rate = (a, b) => (b ? a / b : null);
const sum = (xs) => xs.reduce((a, b) => a + (b || 0), 0);
const any = (r) => r && ((r.rows && r.rows.length) || (r.other && r.other.n));

// a Ranked (SPEC 3.6) as bar rows, «Outros» last in the de-emphasis gray
function rowsOf(r, label, { share = false, otherLabel = 'Outros', fmtv } = {}) {
  if (!r) return [];
  const tot = r.total || sum(r.rows.map((x) => x.n)) + (r.other ? r.other.n : 0);
  const rows = r.rows.map((x) => ({ x, label: label(x.k, x), v: x.n, text: fmtv ? fmtv(x, tot) : share ? `${fmt.n(x.n)} · ${fmt.pct(rate(x.n, tot))}` : fmt.n(x.n) }));
  if (r.other && r.other.n) rows.push({ x: r.other, label: otherLabel, v: r.other.n, other: true, text: fmtv ? fmtv(r.other, tot) : share ? `${fmt.n(r.other.n)} · ${fmt.pct(rate(r.other.n, tot))}` : fmt.n(r.other.n) });
  for (const row of rows) row.tip = () => ({ h: row.label, rows: [{ v: fmt.n(row.x.n), l: 'visualizações' }, ...(row.x.u !== undefined ? [{ v: fmt.n(row.x.u), l: 'visitantes-dia' }] : []), { v: fmt.pct(rate(row.x.n, tot)), l: 'do total' }] });
  return rows;
}
// the short column names phones show (admin-analytics-charts.js colHead)
const SHORT = { 'Visitantes-dia': 'Pessoas-dia', 'Visualizações': 'Vis.', 'Visualizações únicas': 'Vis. únicas', 'Com envolvimento': 'Envolv.', 'Saída rápida': 'Saída ráp.', 'Chegam ao patrocínio': 'Patrocínio' };
function rankedTable(r, label, caption, { uLabel = 'Visitantes-dia', extra = [] } = {}) {
  const tot = r.total || 1;
  const rows = [...r.rows.map((x) => ({ ...x, lab: label(x.k, x) })), ...(r.other && r.other.n ? [{ ...r.other, lab: 'Outros' }] : [])];
  return { caption, cols: [{ l: 'Nome', k: 'lab' }, { l: 'Visualizações', s: 'Vis.', k: 'n', num: true, fmt: fmt.n }, { l: uLabel, s: SHORT[uLabel], k: 'u', num: true, fmt: fmt.n },
    { l: 'Parte', get: (x) => x.n / tot, num: true, fmt: fmt.pct }, ...extra], rows };
}
function rankFig(o) {
  const { title, note, ranked, label, chip, cls = 's6', share = true, otherLabel, tableCaption, uLabel, extra, fmtv, foot } = o;
  if (!any(ranked)) return span(figure({ title, note, chip, empty: NODATA }), cls.slice(1));
  return span(figure({ title, note, chip, foot, draw: hbars(rowsOf(ranked, label, { share, otherLabel, fmtv }), { unit: 'visualizações' }),
    table: () => rankedTable(ranked, label, tableCaption || title, { uLabel, extra }) }), cls.slice(1));
}
const histBins = (h, label, tipLabel) => h.edges.map((e, i) => ({ label: label(e, i), tipLabel: tipLabel ? tipLabel(e, i) : label(e, i), v: h.n[i] || 0 }));
// where a value sits on a histogram with uneven bins (for the median hairline)
function at(h, v) {
  if (v === null || v === undefined) return null;
  const e = h.edges;
  for (let i = 0; i < e.length; i++) {
    const hi = i < e.length - 1 ? e[i + 1] : e[i] * 2 || 1;
    if (v < hi) return i + Math.max(0, Math.min(1, (v - e[i]) / (hi - e[i])));
  }
  return e.length;
}
// pt-PT units with a space, written once at the end of a range: «0–15 s», «30 s–1 min», «2–5 min», «10 min+»
const durEdge = (e) => (e < 60 ? `${e} s` : `${e / 60} min`);
const durRange = (a, b) => (b <= 60 ? `${a}–${b} s` : a >= 60 ? `${a / 60}–${b / 60} min` : `${durEdge(a)}–${durEdge(b)}`);
const durBins = (h) => histBins(h, (e, i) => (i === h.edges.length - 1 ? `${durEdge(e)}+` : durRange(e, h.edges[i + 1])),
  (e, i) => (i === h.edges.length - 1 ? `${fmt.dur(e)} ou mais` : `de ${fmt.dur(e)} a ${fmt.dur(h.edges[i + 1])}`));
const secBins = (h) => histBins(h, (e, i) => (i === h.edges.length - 1 ? `${e} s+` : `${e}–${h.edges[i + 1]} s`), (e, i) => (i === h.edges.length - 1 ? `${e} s ou mais` : `de ${e} a ${h.edges[i + 1]} s`));
// a few ranked parts of one whole: the 3 largest in slots 1–3 and the rest in «Outros» (gray). Only parts above zero are
// drawn, so the neighbours are always the same: gold · magenta · blue · gray, each pair checked for colour blindness in
// both themes (the gray sits next to the blue: next to the magenta it fails the protan check)
const TOP3 = [['f1', 'k1'], ['f3', 'k3'], ['f2', 'k2']];
function top3(parts, label) {
  const sorted = parts.filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const head = sorted.slice(0, 3), rest = sorted.slice(3).reduce((t, x) => t + x.n, 0);
  const segs = head.map((x, i) => ({ label: label(x.k), cls: TOP3[i][0], key: TOP3[i][1] }));
  const vals = head.map((x) => x.n);
  if (rest) { segs.push({ label: 'Outros', cls: 'fo', key: 'ko' }); vals.push(rest); }
  return { segs, vals };
}
function histTable(h, bins, caption) {
  return { caption, cols: [{ l: 'Intervalo', k: 'tipLabel' }, { l: 'Visualizações', k: 'v', num: true, fmt: fmt.n }], rows: bins, sort: false };
}
const tile = (o) => statTile(o);
const kpiRow = (p, tiles, cls = '') => { const k = H('div', `ga-kpis ${cls}`, null, p); for (const t of tiles) k.append(t); return k; };
const card = (title, note, chip) => {
  const c = H('section', 'card ga-card');
  const head = H('header', null, null, c);
  const h3 = H('h3', null, null, head);
  H('span', null, title, h3);
  if (chip) H('span', 'ga-chip', chip, h3);
  if (note) H('p', 'ga-note', note, head);
  return c;
};
const kv = (parent, pairs) => { const dl = H('dl', 'ga-kv', null, parent); for (const [k, v] of pairs) { H('dt', null, k, dl); H('dd', null, v, dl); } return dl; };

// the status of a rate against «atenção» / «mau» thresholds (SPEC 5.5)
function d8Status(id, v) {
  const T = { yes: [0.7, 0.5, 'low'], missed: [0.3, 0.4], pinch: [0.1], untouched: [0.6], dead: [0.1], rage: [0.03], brand: [0.2] }[id];
  if (v === null || v === undefined) return status('none', 'Sem dados ainda');
  if (!T) return status('info', 'Para acompanhar');
  if (T[2] === 'low') return v < T[1] ? status('bad', 'Mau') : v < T[0] ? status('warn', 'Atenção') : status('good', 'Bom');
  if (T[1] !== undefined && v > T[1]) return status('bad', 'Mau');
  return v > T[0] ? status('warn', 'Atenção') : status('good', 'Bom');
}
function vitalStatus(v, val) {
  const t = L.VITAL_T[v];
  if (val === null || val === undefined) return status('none', 'Sem dados');
  return val <= t[0] ? status('good', 'Bom') : val <= t[1] ? status('warn', 'A melhorar') : status('bad', 'Mau');
}
const vfmt = (v) => (v === 'cls' ? fmt.cls : fmt.ms);
// one unit on a whole axis: seconds when the scale reaches 1 s, else milliseconds
const NF2 = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 });
const vAxis = (v, values) => (v === 'cls' ? fmt.cls : Math.max(0, ...values.filter((x) => x !== null)) >= 800 ? (t) => `${NF2.format(t / 1000)} s` : (t) => `${fmt.n(t)} ms`);

// ---------- Resumo ----------
export function renderNow(box, now, ctx) {
  box.replaceChildren();
  if (!now) { emptyState(box, 'Não consegui ler quem está no site agora.', ctx.retryNow); return; }
  const wrap = H('div', 'ga-now', null, box);
  const hero = H('div', 'ga-hero', null, wrap);
  H('span', 'v', fmt.n(now.now), hero);
  H('span', 'lb', now.now === 1 ? 'pessoa com o site aberto agora' : 'pessoas com o site aberto agora', hero);
  H('span', 'est', `estimativa · às ${now.at}`, hero);
  // today's totals only: by minute, place or source, a poll every 30 s would tie one arrival to where it came from
  const mid = H('div', null, null, wrap);
  H('h4', null, 'Hoje, até agora', mid);
  kv(mid, [['Visualizações', fmt.n(now.today.pv)], ['Visitas', fmt.n(now.today.visits)], ['Visitantes', fmt.n(now.today.uv)]]);
  H('p', 'ga-fine', 'De onde vêm e onde estão aparecem com dias completos, em baixo e nos outros separadores.', mid);
  const live = H('p', `ga-live ${ctx.polling ? '' : 'off'}`, null, box);
  H('i', null, null, live);
  H('span', null, ctx.polling ? 'Atualiza a cada 30 segundos enquanto este separador está aberto.' : 'Atualização parada (30 minutos sem mexer). ', live);
  if (!ctx.polling) { const b = H('button', 'link', 'Continuar', live); b.type = 'button'; b.addEventListener('click', ctx.resumePolling); }
}

export function resumo(p, d, ctx) {
  const o = d.overview, k = o.kpi;
  const nowCard = card('Agora no site', 'Quem tem a página aberta e visível, pelo último sinal dos últimos 30 minutos.');
  const nowBox = H('div', null, null, nowCard);
  p.append(nowCard);
  ctx.nowBox = nowBox;
  renderNow(nowBox, d.now, ctx);

  sec(p, 'Números do período');
  const pn = ctx.prevName;
  const devChip = ctx.state.dev !== 'all' ? ALL_DEV : null;
  const yes = (o.d8 || []).find((x) => x.id === 'yes');
  kpiRow(p, [
    tile({ label: 'Visualizações', value: fmt.n(k.pv.v), v: k.pv.v, prev: k.pv.prev, spark: k.pv.spark, prevName: pn }),
    tile({ label: 'Visitas', value: fmt.n(k.visits.v), v: k.visits.v, prev: k.visits.prev, spark: k.visits.spark, prevName: pn }),
    tile({ label: 'Visitantes por dia (soma)', value: fmt.n(k.uv.v), v: k.uv.v, prev: k.uv.prev, spark: k.uv.spark, prevName: pn, sub: `média de ${fmt.n1(k.uvAvg.v)} por dia` }),
    tile({ label: 'Tempo ativo (mediana)', value: fmt.dur(k.engMedian.v), v: k.engMedian.v, prev: k.engMedian.prev, kind: 'dur', spark: k.engMedian.spark, prevName: pn, sub: `média ${fmt.dur(k.engMean.v)}` }),
    tile({ label: 'Com envolvimento', value: fmt.pct(k.engaged.v), v: k.engaged.v, prev: k.engaged.prev, kind: 'rate', spark: k.engaged.spark, prevName: pn }),
    tile({ label: 'Saídas rápidas', value: fmt.pct(k.quick.v), v: k.quick.v, prev: k.quick.prev, kind: 'rate', upIsGood: false, spark: k.quick.spark, prevName: pn }),
    tile({ label: 'Chegam ao patrocínio', value: o.live ? '—' : fmt.pct(k.offer.v), v: k.offer.v, prev: k.offer.prev, kind: 'rate', spark: k.offer.spark, prevName: pn, sub: o.live ? 'só com dias completos' : null }),
    tile({ label: 'Pedidos enviados', value: o.live ? '—' : fmt.n(k.sends.v), v: k.sends.v, prev: k.sends.prev, spark: k.sends.spark, prevName: pn, chip: devChip, sub: o.live ? 'só com dias completos' : null }),
    tile({ label: 'Páginas com erro', value: fmt.pct(k.errPv.v), v: k.errPv.v, prev: k.errPv.prev, kind: 'rate', upIsGood: false, spark: k.errPv.spark, prevName: pn }),
    tile({ label: 'Resposta «Sim»', value: fmt.pct(k.yes.v), v: k.yes.v, prev: k.yes.prev, kind: 'rate', spark: k.yes.spark, prevName: pn, sub: `de ${fmt.n(yes ? yes.base : 0)} respostas` }),
  ]);
  const notesHint = H('p', 'ga-fine', 'Tempo ativo: segundos com a página à vista e alguém a mexer (sem contar pausas de mais de 30 s). Envolvimento: 10 s ou mais, ou um gesto que conta (abrir um espaço, rodar o 3D, uma ligação…). Saída rápida: menos de 8 s, sem passar do início.');
  p.append(notesHint);

  const g = grid(p);
  const s = o.series;
  const hourly = s.unit === 'hour';
  const notes = (o.notes || []).map((n) => ({ ...n, kindLabel: L.NOTEKIND[n.kind] }));
  g.append(span(sum(s.s.pv) ? figure({
    title: hourly ? 'Visitas por hora' : 'Visitas por dia',
    note: 'Visualizações (cada abertura da página), visitas (chegadas de fora, sem recarregar) e visitantes (pessoas diferentes em cada dia, somadas).' + (notes.length ? ' As linhas verticais são as tuas anotações (separador Dados).' : ''),
    legend: [{ label: 'Visualizações', key: 'k1', line: true }, { label: 'Visitas', key: 'k2', line: true }, { label: 'Visitantes', key: 'k3', line: true }],
    draw: line(s.x, [
      { label: 'Visualizações', cls: 'l1', key: 'k1', values: s.s.pv },
      { label: 'Visitas', cls: 'l2', key: 'k2', values: s.s.visits },
      { label: 'Visitantes', cls: 'l3', key: 'k3', values: s.s.uv },
    ], { notes, xFmt: hourly ? (h, long) => (long ? `${h}:00–${h}:59` : `${h}h`) : undefined, unitName: hourly ? 'hora' : 'dia' }),
    table: () => ({ caption: hourly ? 'Por hora' : 'Por dia', sort: false, cols: [{ l: hourly ? 'Hora' : 'Dia', k: 'x', fmt: (v) => (hourly ? `${v}h` : fmt.day(v, true)) }, { l: 'Visualizações', k: 'pv', num: true, fmt: fmt.n }, { l: 'Visitas', k: 'visits', num: true, fmt: fmt.n }, { l: 'Visitantes', k: 'uv', num: true, fmt: fmt.n }],
      rows: s.x.map((x, i) => ({ x, pv: s.s.pv[i], visits: s.s.visits[i], uv: s.s.uv[i] })) }),
  }) : figure({ title: 'Visitas por dia', empty: NODATA }), 12));

  if (o.live) for (const title of ['De onde vêm', 'Países']) g.append(span(figure({ title, empty: LIVE_CUT }), 6));
  else {
    g.append(rankFig({ title: 'De onde vêm', note: 'Os 5 canais com mais visualizações.', ranked: o.chan, label: L.chan, cls: 's6', otherLabel: 'Outros canais' }));
    g.append(rankFig({ title: 'Países', note: 'Os 5 países com mais visualizações. A cidade está em Público.', ranked: o.cc, label: L.country, cls: 's6', otherLabel: 'Outros países' }));
  }

  const reach = o.reach || [];
  g.append(span(reach.some((z) => z.r > 0) ? figure({
    title: 'Até onde chegam', note: 'Parte das visualizações que chegou a cada secção, pela ordem da página.',
    draw: hbars(reach.map((z) => ({ label: L.zone(z.z), v: z.r, text: fmt.pct(z.r) })), { max: 1, fmt: fmt.pct }),
    table: () => ({ caption: 'Até onde chegam', sort: false, cols: [{ l: 'Secção', get: (z) => L.zone(z.z) }, { l: 'Chegaram', k: 'r', num: true, fmt: fmt.pct }], rows: reach }),
  }) : figure({ title: 'Até onde chegam', empty: o.live ? LIVE_CUT : NODATA }), 6));

  const steps = (o.funnel || []).map((x) => ({ label: L.STEP[x.step], n: x.n, prev: x.prev }));
  g.append(span(steps.some((x) => x.n) ? figure({
    title: 'Funil de reserva', chip: ALL_DEV,
    note: 'Cada passo conta à parte: quem chega por uma ligação partilhada pode saltar passos.',
    draw: funnel(steps, { compact: true }),
    table: () => funnelTable(steps),
  }) : figure({ title: 'Funil de reserva', chip: ALL_DEV, empty: o.live ? LIVE_CUT : NODATA }), 6));

  // «Percebe-se?» (D8)
  const sc = card('Percebe-se?', 'Sinais de que a página se entende, ou não. Os limites são um ponto de partida: afina-os ao fim de 4 semanas.');
  span(sc, 12);
  const D8 = {
    yes: ['Percebem o patrocínio', 'responderam «Sim» à pergunta', true], missed: ['Toques no 3D que falham', 'dos toques no modelo não abrem um espaço', false],
    pinch: ['Tentam zoom com dois dedos', 'de quem mexeu no 3D', false], untouched: ['Veem o 3D e não lhe tocam', 'de quem viu o estúdio', false],
    dead: ['Cliques sem resposta', 'das visualizações têm um', false], rage: ['Cliques repetidos', 'das visualizações têm um', false],
    brand: ['Pedidos travados pela marca ou pelo logótipo', 'dos pedidos abertos', false], cta: ['Botão menos carregado', '', true],
  };
  const tiles = H('div', 'ga-kpis cols4', null, sc);
  for (const x of o.d8 || []) {
    const [label, what, upGood] = D8[x.id] || [x.id, '', true];
    const sub = x.id === 'cta' ? (x.extra ? `${L.cta(x.extra)} · ${fmt.n(x.base)} viram` : 'sem botões vistos') : x.v === null ? 'ainda sem base' : `${what} · base ${fmt.n(x.base)}`;
    tiles.append(statTile({ label, value: fmt.pct(x.v), v: x.v, prev: x.prev, kind: 'rate', upIsGood: upGood, prevName: pn, sub, status: d8Status(x.id, x.v),
      chip: x.id === 'brand' && devChip ? devChip : null }));
  }
  g.append(sc);
}
function funnelTable(steps) {
  return { caption: 'Funil de reserva', sort: false, cols: [{ l: 'Passo', k: 'label' }, { l: 'Visualizações', k: 'n', num: true, fmt: fmt.n },
    { l: 'Do primeiro', get: (s) => rate(s.n, steps[0].n), num: true, fmt: fmt.pct }, { l: 'Do anterior', get: (s) => { const i = steps.indexOf(s); return i ? rate(s.n, steps[i - 1].n) : null; }, num: true, fmt: fmt.pct },
    { l: 'Período anterior', k: 'prev', num: true, fmt: fmt.n }], rows: steps };
}

// ---------- Público ----------
export function publico(p, d, ctx) {
  const a = d.audience;
  sec(p, 'Onde estão');
  const mapCard = card('Onde estão', 'País sempre; região e cidade só com 3 ou mais visitantes-dia no período (as outras juntam-se em «Outras localidades»).', ALL_DEV);
  p.append(mapCard);
  drawMap(mapCard, a.geo, ctx);

  sec(p, 'De onde vêm');
  const g = grid(p);
  g.append(rankFig({ title: 'Origem', note: 'Canal de chegada. As apps (Instagram, Facebook…) contam como redes sociais, mesmo sem endereço de origem.', ranked: a.chan, label: L.chan,
    extra: [{ l: 'Com envolvimento', k: 'r', num: true, fmt: fmt.pct }, { l: 'Saída rápida', k: 'q', num: true, fmt: fmt.pct }, { l: 'Chegam ao patrocínio', k: 'f', num: true, fmt: fmt.pct }] }));
  g.append(rankFig({ title: 'Sites que trazem visitas', note: 'Só o nome do site, nunca a página. Sites com menos de 3 visitantes-dia juntam-se em «Outros sites».', ranked: a.ref, label: L.host, otherLabel: 'Outros sites' }));
  const inapp = a.inApp || { v: null };
  const appFig = any(a.app) ? figure({ title: 'Dentro de apps', note: `${fmt.pct(inapp.v)} das visualizações abriram dentro de uma app (o navegador do Instagram, por exemplo).`,
    draw: hbars(rowsOf(a.app, L.app, { share: true })), table: () => rankedTable(a.app, L.app, 'Dentro de apps') }) : figure({ title: 'Dentro de apps', empty: 'Ninguém abriu a página dentro de uma app neste período.' });
  g.append(span(appFig, 6));
  g.append(rankFig({ title: 'Ligações diretas', note: 'Quem chegou por um endereço com # (por exemplo gocarmo.com/#fato) ou por uma partilha de um espaço.', ranked: a.land, label: L.land }));
  if (a.cmp && any(a.cmp)) g.append(rankFig({ title: 'Campanhas', ranked: a.cmp, label: (k) => k }));
  else g.append(span(figure({ title: 'Campanhas', empty: 'Sem consentimento não lemos etiquetas de campanha (utm). Para saber que ligação trouxe a visita, usa ligações diretas como gocarmo.com/#fato ou /#capacete: aparecem em «Ligações diretas».' }), 6));

  sec(p, 'Aparelhos');
  const g2 = grid(p);
  g2.append(rankFig({ title: 'Aparelho', ranked: a.dev, label: L.dev, cls: 's4' }));
  g2.append(rankFig({ title: 'Largura do ecrã', note: 'As larguras são as do site: é a largura que decide o mapa de calor.', ranked: a.vw, label: (k) => L.VWSHORT[k] || k, cls: 's4' }));
  const pc = a.pc || { coarse: 0, fine: 0 }, pcn = pc.coarse + pc.fine;
  const pcC = card('Toque ou rato', 'Ecrã de toque contra rato ou trackpad.');
  span(pcC, 4);
  if (pcn) kpiRow(pcC, [statTile({ label: 'Toque', value: fmt.pct(pc.coarse / pcn), prevName: null, sub: `${fmt.pct(pc.fine / pcn)} com rato · ${fmt.n(pc.coarse)} de ${fmt.n(pcn)} visualizações` })], 'cols1');
  else emptyState(pcC, NODATA);
  g2.append(pcC);
  g2.append(rankFig({ title: 'Sistema', ranked: a.os, label: (k) => k, otherLabel: 'Outros sistemas' }));
  g2.append(rankFig({ title: 'Navegador', note: 'O navegador das apps aparece com o nome da app.', ranked: a.br, label: (k) => k, otherLabel: 'Outros navegadores' }));

  sec(p, 'Língua');
  const g3 = grid(p);
  g3.append(rankFig({ title: 'Língua da página', note: 'A língua em que a página abriu.', ranked: a.lang, label: L.lang, cls: 's4', extra: [{ l: 'Com envolvimento', k: 'r', num: true, fmt: fmt.pct }] }));
  g3.append(rankFig({ title: 'Língua do navegador', note: 'A língua do telemóvel ou computador.', ranked: a.bl, label: L.lang, cls: 's4', otherLabel: 'Outras' }));
  const sw = a.sw || { pv: 0, rate: 0, byLand: [], timing: { edges: [], n: [] } };
  const swBox = card('Mudaram de língua', `${fmt.n(sw.pv)} visualizações (${fmt.pct(sw.rate)}) mudaram de língua.`);
  span(swBox, 4);
  if (sw.pv) {
    const bins = secBins(sw.timing);
    swBox.append(figure({ title: 'Quando mudam', note: 'Segundos de tempo ativo antes de mudar.', cls: 'ga-sub', draw: columns(bins, { height: 110, cap: 24, unit: 'visualizações' }), table: () => histTable(sw.timing, bins, 'Quando mudam') }));
    kv(swBox, sw.byLand.map((x) => [`Abriram em ${L.lang(x.k).toLowerCase()}`, `${fmt.n(x.sw)} de ${fmt.n(x.n)}`]));
  } else emptyState(swBox, 'Ninguém mudou de língua neste período.');
  g3.append(swBox);

  sec(p, 'Quando');
  const g4 = grid(p);
  const hours = a.hours || [];
  g4.append(span(sum(hours) ? figure({ title: 'Hora do dia', note: 'Hora de Lisboa, somada em todo o período.', draw: columns(hours.map((v, h) => ({ label: `${h}h`, tipLabel: `${h}:00–${h}:59`, v })), { cap: 24, every: 6, unit: 'visualizações' }),
    table: () => ({ caption: 'Hora do dia', sort: false, cols: [{ l: 'Hora', k: 'h' }, { l: 'Visualizações', k: 'v', num: true, fmt: fmt.n }], rows: hours.map((v, h) => ({ h: `${h}:00`, v })) }) }) : figure({ title: 'Hora do dia', empty: NODATA }), 6));
  const WD = ['seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.', 'dom.'], WDL = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
  const wd = a.weekdays || [];
  g4.append(span(sum(wd) ? figure({ title: 'Dia da semana', note: 'Somado em todo o período: num período curto, cada dia aparece uma vez só.', draw: columns(wd.map((v, i) => ({ label: WD[i], tipLabel: WDL[i], v })), { cap: 24, every: 1, unit: 'visualizações' }),
    table: () => ({ caption: 'Dia da semana', sort: false, cols: [{ l: 'Dia', k: 'd' }, { l: 'Visualizações', k: 'v', num: true, fmt: fmt.n }], rows: wd.map((v, i) => ({ d: WDL[i], v })) }) }) : figure({ title: 'Dia da semana', empty: NODATA }), 6));
}

// ---------- Página ----------
export function pagina(p, d) {
  const c = d.content;
  const zs = c.zones || [];
  const has = zs.some((z) => z.reached || z.sec);
  sec(p, 'Leitura da página');
  const g = grid(p);
  g.append(span(has ? figure({
    title: 'Até onde chegam', note: 'Parte das visualizações que chegou a cada secção (a meio do ecrã durante 1 segundo), pela ordem da página, e quanto caiu desde a secção de cima.',
    draw: hbars(zs.map((z, i) => { const drop = i ? (zs[i - 1].r - z.r) * 100 : 0; return { label: L.zone(z.z), v: z.r, text: `${fmt.pct(z.r)}${drop >= 1 ? ` · −${fmt.n1(drop)} p.p.` : ''}`, tip: () => ({ h: L.zone(z.z), rows: [{ v: fmt.pct(z.r), l: 'chegaram' }, { v: fmt.n(z.reached), l: 'visualizações' }, ...(i ? [{ v: `${fmt.n1(drop)} p.p.`, l: 'caiu desde a secção de cima' }] : [])] }) }; }), { max: 1 }),
    table: () => ({ caption: 'Até onde chegam', sort: false, cols: [{ l: 'Secção', get: (z) => L.zone(z.z) }, { l: 'Visualizações', k: 'reached', num: true, fmt: fmt.n }, { l: 'Parte', k: 'r', num: true, fmt: fmt.pct }], rows: zs }),
  }) : figure({ title: 'Até onde chegam', empty: NODATA }), 6));
  const res = c.reserva || { sec: 0, share: 0 };
  const att = [...zs.map((z) => ({ label: L.zone(z.z), v: z.share, z })), ...(res.sec ? [{ label: L.zone('reserva'), v: res.share, z: { z: 'reserva', sec: res.sec, share: res.share, perPv: null } }] : [])];
  g.append(span(has ? figure({
    title: 'Onde passam tempo', note: 'Parte do tempo ativo passada em cada secção (a que ocupa o ecrã), e os segundos por visualização que lá chegou.',
    draw: hbars(att.map((r) => ({ label: r.label, v: r.v, text: `${fmt.pct(r.v)}${r.z.perPv ? ` · ${fmt.dur(r.z.perPv)}` : ''}`, tip: () => ({ h: r.label, rows: [{ v: fmt.pct(r.v), l: 'do tempo ativo' }, { v: fmt.dur(r.z.sec), l: 'no total' }, ...(r.z.perPv ? [{ v: fmt.dur(r.z.perPv), l: 'por visualização que chegou' }] : [])] }) })), { fmt: fmt.pct }),
    table: () => ({ caption: 'Onde passam tempo', sort: false, cols: [{ l: 'Secção', k: 'label' }, { l: 'Parte do tempo', get: (r) => r.z.share, num: true, fmt: fmt.pct }, { l: 'Segundos', get: (r) => r.z.sec, num: true, fmt: fmt.n }, { l: 'Por visualização', get: (r) => r.z.perPv, num: true, fmt: fmt.dur }], rows: att }),
  }) : figure({ title: 'Onde passam tempo', empty: NODATA }), 6));
  const ex = zs.filter((z) => z.exits);
  g.append(span(ex.length ? figure({
    title: 'Onde saem', note: 'A secção a meio do ecrã quando a página foi fechada. «Por uma ligação»: saíram ao carregar numa ligação para fora ou ao enviar o pedido.',
    legend: [{ label: 'Por uma ligação', key: 'k1' }, { label: 'Fecharam ou mudaram', key: 'k2' }],
    draw: stack100(zs.map((z) => ({ label: L.zone(z.z), parts: [z.exitsLink, Math.max(0, z.exits - z.exitsLink)] })), [{ label: 'Por uma ligação', cls: 'f1', key: 'k1' }, { label: 'Fecharam ou mudaram', cls: 'f2', key: 'k2' }], { absolute: true }),
    table: () => ({ caption: 'Onde saem', sort: false, cols: [{ l: 'Secção', get: (z) => L.zone(z.z) }, { l: 'Saídas', k: 'exits', num: true, fmt: fmt.n }, { l: 'Por uma ligação', k: 'exitsLink', num: true, fmt: fmt.n }], rows: zs }),
  }) : figure({ title: 'Onde saem', empty: NODATA }), 12));

  sec(p, 'O patrocínio');
  const g2 = grid(p);
  const routes = c.routes || [];
  const rc = card('Como chegam ao patrocínio', `${fmt.pct(c.offer.reach)} das visualizações chegaram à secção 05. ${fmt.pct(c.offer.before)} saíram antes de lá chegar.`);
  span(rc, 6);
  if (sum(routes.map((r) => r.n))) {
    const t3 = top3(routes, (k) => L.ROUTE[k] || k);
    rc.append(figure({ title: 'Por onde', cls: 'ga-sub', note: 'Os 3 caminhos mais usados; os outros juntos em «Outros» (na tabela, todos).', legend: t3.segs.map((x) => ({ label: x.label, key: x.key })),
      draw: stack100([{ label: 'Chegadas', parts: t3.vals }], t3.segs, { narrow: true }),
      table: () => ({ caption: 'Como chegam ao patrocínio', cols: [{ l: 'Caminho', get: (r) => L.ROUTE[r.k] }, { l: 'Visualizações', k: 'n', num: true, fmt: fmt.n }], rows: routes }) }));
  } else emptyState(rc, NODATA);
  g2.append(rc);
  const arr = c.arrival;
  g2.append(span(arr && sum(arr.n) ? figure({ title: 'Tempo até ao patrocínio', note: 'Segundos de tempo ativo desde que a página abriu até chegar à secção 05.',
    draw: columns(durBins(arr), { cap: 24, median: arr.median !== null ? { at: at(arr, arr.median), label: `mediana ${fmt.dur(arr.median)}` } : null, unit: 'visualizações' }),
    table: () => histTable(arr, durBins(arr), 'Tempo até ao patrocínio') }) : figure({ title: 'Tempo até ao patrocínio', empty: NODATA }), 6));

  sec(p, 'Descer e ficar');
  const g3 = grid(p);
  const sn = (c.scroll && c.scroll.n) || [];
  g3.append(span(sum(sn) ? figure({ title: 'Até onde descem', note: `Até onde cada visualização desceu, em % da página. ${fmt.pct(c.scroll.beyondFirst)} desceram além do primeiro ecrã.`,
    draw: columns(sn.map((v, i) => ({ label: `${i * 5} %`, tipLabel: `desceram até ${i * 5} % da página`, v })), { every: 5, unit: 'visualizações' }),
    table: () => ({ caption: 'Até onde descem', sort: false, cols: [{ l: 'Profundidade máxima', k: 'l' }, { l: 'Visualizações', k: 'v', num: true, fmt: fmt.n }], rows: sn.map((v, i) => ({ l: `${i * 5} %`, v })) }) }) : figure({ title: 'Até onde descem', empty: NODATA }), 6));
  const eng = c.eng;
  g3.append(span(eng && sum(eng.n) ? figure({ title: 'Tempo ativo', note: `Mediana ${fmt.dur(eng.median)}, média ${fmt.dur(eng.mean)}. Só conta com a página à vista e alguém a mexer.`,
    draw: columns(durBins(eng), { cap: 24, median: eng.median !== null ? { at: at(eng, eng.median), label: `mediana ${fmt.dur(eng.median)}` } : null, unit: 'visualizações' }),
    table: () => histTable(eng, durBins(eng), 'Tempo ativo') }) : figure({ title: 'Tempo ativo', empty: NODATA }), 6));

  sec(p, 'Botões');
  const g4 = grid(p);
  const ctas = (c.ctas || []).filter((x) => x.seen || x.clicked);
  const ctrs = ctas.filter((x) => x.seen >= 20 && x.ctr !== null).map((x) => x.ctr).sort((a, b) => a - b);
  const q1 = ctrs.length >= 4 ? ctrs[Math.floor((ctrs.length - 1) * 0.25)] : null;
  const low = (x) => q1 !== null && x.seen >= 20 && x.ctr !== null && x.ctr <= q1;
  const lows = ctas.filter(low).map((x) => L.cta(x.id));
  g4.append(span(ctas.length ? figure({ title: 'Botões vistos e carregados', note: 'Quantos viram cada botão (metade à vista durante 1 s) e quantos carregaram. «Visto por muitos, carregado por poucos»: 20 ou mais vistas e entre os 25 % que menos convencem (coluna «Nota» da tabela).',
    foot: lows.length ? `Visto por muitos, carregado por poucos: ${lows.join(', ')}.` : null,
    draw: hbars(ctas.map((x) => ({ label: L.cta(x.id), v: x.ctr || 0, text: `${fmt.pct(x.ctr)} · ${fmt.n(x.seen)} vistos`,
      tip: () => ({ h: L.cta(x.id), rows: [{ v: fmt.pct(x.ctr), l: 'carregaram' }, { v: fmt.n(x.seen), l: 'viram' }, { v: fmt.n(x.clicked), l: 'carregaram (visualizações)' }, ...(low(x) ? [{ v: 'Atenção', l: 'visto por muitos, carregado por poucos' }] : [])] }) })), { fmt: fmt.pct, wideAt: 640 }),
    table: () => ({ caption: 'Botões vistos e carregados', cols: [{ l: 'Botão', get: (x) => L.cta(x.id) }, { l: 'Vistos', k: 'seen', num: true, fmt: fmt.n }, { l: 'Carregados', k: 'clicked', num: true, fmt: fmt.n }, { l: 'Taxa', k: 'ctr', num: true, fmt: fmt.pct }, { l: 'Nota', get: (x) => (low(x) ? 'visto por muitos, carregado por poucos' : '') }], rows: ctas }),
  }) : figure({ title: 'Botões vistos e carregados', empty: NODATA }), 8));
  const m = c.menu || { opened: 0, base: 0, targets: { rows: [] }, backTop: 0 };
  const mc = card('Menu', `No telemóvel e tablet, ${fmt.n(m.opened)} de ${fmt.n(m.base)} visualizações abriram o menu (${fmt.pct(rate(m.opened, m.base))}). «Voltar ao topo»: ${fmt.n(m.backTop)} vezes.`);
  span(mc, 4);
  if (any(m.targets)) mc.append(figure({ title: 'Para onde vão no menu', cls: 'ga-sub', draw: hbars(rowsOf(m.targets, (k) => L.NAVTO[k] || k)), table: () => rankedTable(m.targets, (k) => L.NAVTO[k] || k, 'Para onde vão no menu', { uLabel: 'Visualizações únicas' }) }));
  else emptyState(mc, 'Ninguém usou o menu neste período.');
  g4.append(mc);
}

// ---------- Estúdio 3D ----------
export function estudio(p, d, ctx) {
  const s = d.studio;
  const it = s.items || {};
  const su = it.suit || {}, he = it.helmet || {};
  const series = [{ label: L.ITEM.suit, cls: 'f1', key: 'k1' }, { label: L.ITEM.helmet, cls: 'f2', key: 'k2' }];
  const lg = series.map((x) => ({ label: x.label, key: x.key }));
  const g = grid(p);
  const steps = ['approached', 'seen', 'ready', 'touched', 'spot', 'add'];
  const anyStudio = steps.some((k) => su[k] || he[k]);
  g.append(span(anyStudio ? figure({ title: 'Do estúdio ao pacote', note: 'Visualizações em cada passo, para o fato e para o capacete. Cada passo conta à parte.', legend: lg,
    draw: grouped(steps.map((k) => ({ label: L.STUDIO[k], vals: [su[k] || 0, he[k] || 0] })), series),
    table: () => ({ caption: 'Do estúdio ao pacote', sort: false, cols: [{ l: 'Passo', get: (k) => L.STUDIO[k] }, { l: 'Fato', get: (k) => su[k] || 0, num: true, fmt: fmt.n }, { l: 'Capacete', get: (k) => he[k] || 0, num: true, fmt: fmt.n }], rows: steps }),
  }) : figure({ title: 'Do estúdio ao pacote', empty: NODATA }), 6));
  const gs = s.gestures || [];
  g.append(span(gs.some((x) => x.suit || x.helmet) ? figure({ title: 'Gestos no modelo', note: 'Visualizações que usaram cada gesto.', legend: lg,
    draw: grouped(gs.map((x) => ({ label: L.GESTURE[x.k] || x.k, vals: [x.suit, x.helmet] })), series),
    table: () => ({ caption: 'Gestos no modelo', cols: [{ l: 'Gesto', get: (x) => L.GESTURE[x.k] || x.k }, { l: 'Fato', k: 'suit', num: true, fmt: fmt.n }, { l: 'Capacete', k: 'helmet', num: true, fmt: fmt.n }], rows: gs }),
  }) : figure({ title: 'Gestos no modelo', empty: NODATA }), 6));

  const t = s.taps || { taps: 0, missed: 0, byVw: [] };
  const tc = card('Toques falhados', t.taps ? `${fmt.pct(rate(t.missed, t.taps))} dos ${fmt.n(t.taps)} toques no modelo não abriram um espaço.` : 'Ainda sem toques no modelo neste período.');
  span(tc, 6);
  const bv = (t.byVw || []).filter((x) => x.taps);
  if (bv.length) tc.append(figure({ title: 'Por largura do ecrã', cls: 'ga-sub', draw: hbars(bv.map((x) => ({ label: L.VWSHORT[x.vw], v: rate(x.missed, x.taps), text: `${fmt.pct(rate(x.missed, x.taps))} de ${fmt.n(x.taps)}` })), { max: 1 }),
    table: () => ({ caption: 'Toques falhados por largura', cols: [{ l: 'Largura', get: (x) => L.VWSHORT[x.vw] }, { l: 'Toques', k: 'taps', num: true, fmt: fmt.n }, { l: 'Falhados', k: 'missed', num: true, fmt: fmt.n }], rows: bv }) }));
  g.append(tc);

  // the wait: the suit and the helmet side by side, on the same bins and the same scale
  const wc = card('Espera pelo 3D', 'Segundos que viram «A carregar» com o estúdio à vista. Os dois na mesma escala.');
  span(wc, 6);
  const two = H('div', 'ga-two', null, wc);
  const yMax = Math.max(1, ...['suit', 'helmet'].flatMap((item) => ((it[item] || {}).wait || { n: [] }).n));
  for (const item of ['suit', 'helmet']) {
    const x = it[item] || {}, h = x.wait, box = H('div', null, null, two);
    if (h && sum(h.n)) {
      const bins = secBins(h);
      box.append(figure({ title: L.ITEM[item], cls: 'ga-sub', draw: columns(bins, { height: 130, cap: 24, yMax, median: h.median !== null ? { at: at(h, h.median), label: `mediana ${fmt.dur(h.median)}` } : null, unit: 'visualizações' }), table: () => histTable(h, bins, `Espera: ${L.ITEM[item]}`) }));
    } else { H('h4', 'ga-fine', L.ITEM[item], box); emptyState(box, 'Ninguém esperou por este 3D neste período.'); }
    H('p', 'ga-fine', `Saíram antes de o 3D abrir: ${fmt.n(x.leftBeforeReady || 0)}.`, box);
  }
  g.append(wc);

  const tour = s.tour || {};
  const tourC = card('Visita guiada', 'O botão que percorre os espaços do fato sozinho.');
  span(tourC, 6);
  kpiRow(tourC, [
    statTile({ label: 'Começaram', value: fmt.n(tour.started), prevName: null }),
    statTile({ label: 'Viram até ao fim', value: fmt.n(tour.fim), sub: tour.started ? fmt.pct(rate(tour.fim, tour.started)) : '', prevName: null }),
    statTile({ label: 'Pararam a meio', value: fmt.n(tour.parado), sub: tour.started ? fmt.pct(rate(tour.parado, tour.started)) : '', prevName: null }),
    statTile({ label: 'Escolheram um espaço a seguir', value: fmt.n(tour.choice), prevName: null }),
  ], 'cols4');
  g.append(tourC);

  const fr = s.from || [];
  const f3 = top3(fr, (k) => L.FROM[k] || k);
  g.append(span(sum(fr.map((x) => x.n)) ? figure({ title: 'De onde abrem os espaços', note: 'Como abriram a ficha de um espaço: as 3 formas mais usadas, as outras em «Outros» (na tabela, todas).', legend: f3.segs.map((x) => ({ label: x.label, key: x.key })),
    draw: stack100([{ label: 'Aberturas', parts: f3.vals }], f3.segs, { narrow: true }),
    table: () => ({ caption: 'De onde abrem os espaços', cols: [{ l: 'Como', get: (x) => L.FROM[x.k] }, { l: 'Aberturas', k: 'n', num: true, fmt: fmt.n }], rows: fr }) }) : figure({ title: 'De onde abrem os espaços', empty: NODATA }), 6));

  // «Interesse por espaço»: table + scatter (price × opens per 100 studio viewers)
  const spots = ctx.spots || {};
  const viewers = { suit: su.seen || 0, helmet: he.seen || 0 };
  const rows = (s.spots || []).map((x) => {
    const info = spots[x.id] || {};
    const item = x.id.startsWith('capacete') ? 'helmet' : 'suit';
    return { ...x, name: info.name || (x.id === 'title' ? 'Fato completo' : x.id), price: info.price ?? null, st: info.status || '', item, per100: viewers[item] ? (100 * x.opens) / viewers[item] : null };
  }).filter((x) => x.opens || x.adds || x.tries || x.shares || x.downloads || x.price !== null);
  const used = rows.filter((x) => x.opens || x.adds);
  const ic = card('Interesse por espaço', 'Por espaço: quantas visualizações abriram a ficha, juntaram ao pacote, experimentaram o logótipo, partilharam ou descarregaram. «Por 100»: aberturas por cada 100 que viram o estúdio desse objeto.');
  span(ic, 12);
  if (used.length) {
    const pts = rows.filter((x) => x.price !== null && x.per100 !== null && x.id !== 'title');
    if (pts.length) ic.append(figure({ title: 'Preço e interesse', cls: 'ga-sub', note: 'Cada ponto é um espaço: preço contra aberturas por 100 que viram o estúdio.',
      draw: scatter(pts.map((x) => ({ x: x.price, y: Math.round(x.per100 * 10) / 10, label: x.name, tip: () => ({ h: x.name, rows: [{ v: `${fmt.n(x.price)} €`, l: 'preço' }, { v: fmt.n1(x.per100), l: 'aberturas por 100' }, { v: fmt.n(x.opens), l: 'aberturas' }] }) })), { xFmt: (v) => `${fmt.n(v)} €`, xLabel: 'preço', yLabel: 'aberturas por 100' }),
      table: () => ({ caption: 'Preço e interesse', cols: [{ l: 'Espaço', k: 'name' }, { l: 'Preço', k: 'price', num: true, fmt: (v) => `${fmt.n(v)} €` }, { l: 'Por 100', k: 'per100', num: true, fmt: fmt.n1 }], rows: pts }) }));
    const ST = { available: 'Livre', reserved: 'Reservado', sold: 'Vendido' };
    ic.append(table({ caption: 'Todos os espaços', initial: { k: 'opens', dir: 'descending' }, cols: [
      { l: 'Espaço', k: 'name' }, { l: 'Preço', k: 'price', num: true, fmt: (v) => (v === null ? '—' : `${fmt.n(v)} €`) }, { l: 'Estado', k: 'st', fmt: (v) => ST[v] || v || '—' },
      { l: 'Aberturas', k: 'opens', num: true, fmt: fmt.n }, { l: 'Por 100', k: 'per100', num: true, fmt: fmt.n1 }, { l: 'Pacote', k: 'adds', num: true, fmt: fmt.n },
      { l: 'Logótipo', k: 'tries', num: true, fmt: fmt.n }, { l: 'Partilhas', k: 'shares', num: true, fmt: fmt.n }, { l: 'Imagens', k: 'downloads', num: true, fmt: fmt.n }], rows }));
  } else emptyState(ic, NODATA);
  g.append(ic);
}

// ---------- Reservas ----------
export function reservas(p, d) {
  const b = d.booking;
  const chip = ALL_DEV;
  const g = grid(p);
  const steps = (b.funnel || []).map((x) => ({ label: L.STEP[x.step], n: x.n, prev: x.prev }));
  g.append(span(steps.some((x) => x.n) ? figure({ title: 'Funil de reserva', chip, note: 'Cada passo conta à parte (sem ordem obrigatória): uma partilha pode abrir o pedido sem passar pela escolha.',
    draw: funnel(steps), table: () => funnelTable(steps) }) : figure({ title: 'Funil de reserva', chip, empty: NODATA }), 6));
  const ends = b.ends || [];
  const ev = (k) => (ends.find((x) => x.k === k) || { n: 0 }).n;
  // three parts (the table under it has every ending)
  const E3 = [{ label: 'Concluíram', cls: 'f1', key: 'k1' }, { label: 'Copiaram os dados e saíram', cls: 'f3', key: 'k3' }, { label: 'Desistiram', cls: 'f2', key: 'k2' }];
  const e3 = [ev('feito'), ev('copiou_saiu'), ev('fechou_passo2') + ev('saiu_passo2') + ev('fechou_passo1') + ev('aberta_saiu')];
  g.append(span(sum(ends.map((x) => x.n)) ? figure({ title: 'Onde desistem', chip, note: 'Como acabou cada pedido aberto. «Desistiram»: fecharam ou saíram no passo 1 ou 2.', legend: E3.map((x) => ({ label: x.label, key: x.key })),
    draw: stack100([{ label: 'Pedidos abertos', parts: e3 }], E3, { narrow: true }),
    after: (() => { const box = H('div'); box.append(table({ caption: 'Como acabou', sort: false, cols: [{ l: 'Fim', get: (x) => L.END[x.k] }, { l: 'Pedidos', k: 'n', num: true, fmt: fmt.n }], rows: ends })); return box; })() }) : figure({ title: 'Onde desistem', chip, empty: NODATA }), 6));
  g.append(rankFig({ title: 'Canal do pedido', chip, note: 'Por onde enviaram o pedido.', ranked: b.channels, label: (k) => L.SEND[k] || k, cls: 's4', uLabel: 'Visualizações', fmtv: (x) => fmt.n(x.n) }));
  const pay = b.pay || { tabs: [], done: [], copies: [] };
  const pv = (list, k) => (list.find((x) => x.k === k) || { n: 0 }).n;
  const payC = card('Forma de pagamento', 'MB WAY ou transferência: a escolhida e a dos que carregaram em «Feito».', chip);
  span(payC, 4);
  if (sum(pay.tabs.map((x) => x.n)) + sum(pay.done.map((x) => x.n))) {
    payC.append(figure({ title: 'Escolha', cls: 'ga-sub', legend: [{ label: L.PAYTAB.mb, key: 'k1' }, { label: L.PAYTAB.tr, key: 'k2' }],
      draw: stack100([{ label: 'Escolheram', parts: [pv(pay.tabs, 'mb'), pv(pay.tabs, 'tr')] }, { label: 'Concluíram', parts: [pv(pay.done, 'mb'), pv(pay.done, 'tr')] }], [{ label: L.PAYTAB.mb, cls: 'f1', key: 'k1' }, { label: L.PAYTAB.tr, cls: 'f2', key: 'k2' }], { narrow: true }),
      table: () => ({ caption: 'Forma de pagamento', sort: false, cols: [{ l: 'Forma', k: 'l' }, { l: 'Escolheram', k: 'a', num: true, fmt: fmt.n }, { l: 'Concluíram', k: 'b', num: true, fmt: fmt.n }], rows: [{ l: L.PAYTAB.mb, a: pv(pay.tabs, 'mb'), b: pv(pay.done, 'mb') }, { l: L.PAYTAB.tr, a: pv(pay.tabs, 'tr'), b: pv(pay.done, 'tr') }] }) }));
    const cp = pay.copies.filter((x) => x.n);
    if (cp.length) payC.append(figure({ title: 'O que copiaram', cls: 'ga-sub', draw: hbars(cp.map((x) => ({ label: L.COPY[x.k] || x.k, v: x.n }))), table: () => ({ caption: 'O que copiaram', cols: [{ l: 'Dado', get: (x) => L.COPY[x.k] || x.k }, { l: 'Visualizações', k: 'n', num: true, fmt: fmt.n }], rows: cp }) }));
  } else emptyState(payC, NODATA);
  g.append(payC);
  const br = b.brand || { opens: 0, errors: 0 };
  const ret = b.returns || {};
  const small = card('Erros e regressos', null, chip);
  span(small, 4);
  kpiRow(small, [
    statTile({ label: 'Erros no pedido', value: fmt.pct(rate(br.errors, br.opens)), sub: `${fmt.n(br.errors)} de ${fmt.n(br.opens)} pedidos abertos tentaram enviar sem a marca ou sem o logótipo`, prevName: null,
      status: d8Status('brand', rate(br.errors, br.opens)) }),
  ], 'cols1');
  H('h4', 'ga-fine', 'Voltaram da app', small);
  kv(small, [['Voltaram de outra app (WhatsApp, banco…)', fmt.n(ret.bf)], ['Com o pedido aberto no passo 2', fmt.n(ret.bfDialog)], ['Retomaram o pedido', fmt.n(ret.resume)]]);
  g.append(small);

  const pk = b.packages || { sizes: [], goSeen: 0, goClicked: 0 };
  const pkC = card('Pacotes', `A barra do pacote foi vista ${fmt.n(pk.goSeen)} vezes e «Reservar» carregado ${fmt.n(pk.goClicked)} (${fmt.pct(rate(pk.goClicked, pk.goSeen))}).`, chip);
  span(pkC, 4);
  if (sum(pk.sizes.map((x) => x.n))) pkC.append(figure({ title: 'Tamanho do pedido', cls: 'ga-sub', draw: hbars(pk.sizes.map((x) => ({ label: L.PKG[x.k] || x.k, v: x.n }))), table: () => ({ caption: 'Tamanho do pedido', sort: false, cols: [{ l: 'Tamanho', get: (x) => L.PKG[x.k] || x.k }, { l: 'Pedidos', k: 'n', num: true, fmt: fmt.n }], rows: pk.sizes }) }));
  else emptyState(pkC, NODATA);
  g.append(pkC);
  const ti = b.title || {};
  const tSteps = [{ label: 'Viram «Pedir o fato completo»', n: ti.seen || 0, prev: null }, { label: 'Carregaram', n: ti.clicked || 0, prev: null }, { label: 'Abriram o pedido', n: ti.opened || 0, prev: null }, { label: 'Enviaram', n: ti.sent || 0, prev: null }];
  g.append(span(tSteps.some((x) => x.n) ? figure({ title: 'Fato completo', chip, note: 'O pedido do fato inteiro, de uma marca só.', draw: funnel(tSteps, { compact: true }), table: () => funnelTable(tSteps) }) : figure({ title: 'Fato completo', chip, empty: NODATA }), 4));
  const tr = b.tryon || {};
  const TRY = [['open', 'Abriram «Experimentar»'], ['upload', 'Escolheram um logótipo'], ['opt', 'Mudaram opções (fundo, inverter)'], ['download', 'Descarregaram a imagem'], ['remove', 'Tiraram o logótipo'], ['then', 'Depois juntaram ao pacote ou pediram']];
  g.append(span(TRY.some(([k]) => tr[k]) ? figure({ title: 'Experimentar o logótipo', chip, note: 'O logótipo fica só no aparelho de quem o experimenta: nada é enviado.', draw: hbars(TRY.map(([k, l]) => ({ label: l, v: tr[k] || 0 }))),
    table: () => ({ caption: 'Experimentar o logótipo', sort: false, cols: [{ l: 'Passo', k: 'l' }, { l: 'Visualizações', k: 'v', num: true, fmt: fmt.n }], rows: TRY.map(([k, l]) => ({ l, v: tr[k] || 0 })) }) }) : figure({ title: 'Experimentar o logótipo', chip, empty: NODATA }), 4));
  const sh = b.share || { shares: 0, landings: 0, spots: { rows: [] } };
  const shC = card('Partilhas', `${fmt.n(sh.shares)} visualizações partilharam um espaço; ${fmt.n(sh.landings)} chegaram por uma partilha.`, chip);
  span(shC, 4);
  if (any(sh.spots)) shC.append(figure({ title: 'Espaços partilhados', cls: 'ga-sub', draw: hbars(rowsOf(sh.spots, L.spot)), table: () => rankedTable(sh.spots, L.spot, 'Espaços partilhados', { uLabel: 'Visualizações' }) }));
  else emptyState(shC, 'Ainda sem partilhas neste período.');
  g.append(shC);
  const dl = b.daily || { x: [] };
  g.append(span(dl.x && dl.x.length && sum(dl.s.open) + sum(dl.s.send) ? figure({ title: 'Pedidos por dia', chip, note: 'Pedidos abertos e enviados por dia.', legend: [{ label: 'Abertos', key: 'k1', line: true }, { label: 'Enviados', key: 'k2', line: true }],
    draw: line(dl.x, [{ label: 'Abertos', cls: 'l1', key: 'k1', values: dl.s.open }, { label: 'Enviados', cls: 'l2', key: 'k2', values: dl.s.send }]),
    table: () => ({ caption: 'Pedidos por dia', sort: false, cols: [{ l: 'Dia', k: 'x', fmt: (v) => fmt.day(v, true) }, { l: 'Abertos', k: 'o', num: true, fmt: fmt.n }, { l: 'Enviados', k: 's', num: true, fmt: fmt.n }], rows: dl.x.map((x, i) => ({ x, o: dl.s.open[i], s: dl.s.send[i] })) }) })
    : figure({ title: 'Pedidos por dia', chip, empty: dl.unit === 'hour' ? 'Em «24 h» não mostramos pedidos por hora (só por dia). Escolhe 7 dias ou mais.' : NODATA }), 8));
}

// ---------- Contactos ----------
export function contactos(p, d) {
  const c = d.contacts;
  const g = grid(p);
  g.append(rankFig({ title: 'Ligações para fora', note: 'Cliques em ligações que saem do site (WhatsApp, email, redes, GoFundMe…). Nunca guardamos o endereço completo.', ranked: c.out, label: (k) => L.OUT[k] || k, uLabel: 'Visualizações', share: true }));
  const bz = c.byZone || [];
  const zc = card('Onde estava a ligação', 'Em que secção estava a ligação carregada.');
  span(zc, 6);
  if (bz.length) zc.append(table({ caption: 'Ligações por secção', initial: { k: 'n', dir: 'descending' }, cols: [{ l: 'Ligação', get: (x) => L.OUT[x.type] || x.type }, { l: 'Secção', get: (x) => L.zone(x.z) }, { l: 'Cliques', k: 'n', num: true, fmt: fmt.n }], rows: bz }));
  else emptyState(zc, NODATA);
  g.append(zc);
  const gv = c.give || {};
  const GV = [['iban', 'Copiaram o IBAN'], ['mb', 'Copiaram o MB WAY'], ['gofundme', 'Abriram o GoFundMe'], ['kind', 'Apoio em espécie']];
  g.append(span(GV.some(([k]) => gv[k]) ? figure({ title: 'Apoiar', note: 'Visualizações que fizeram cada gesto na secção 07.', draw: hbars(GV.map(([k, l]) => ({ label: l, v: gv[k] || 0 }))),
    table: () => ({ caption: 'Apoiar', sort: false, cols: [{ l: 'Gesto', k: 'l' }, { l: 'Visualizações', k: 'v', num: true, fmt: fmt.n }], rows: GV.map(([k, l]) => ({ l, v: gv[k] || 0 })) }) }) : figure({ title: 'Apoiar', empty: NODATA }), 4));
  const kit = c.kit || {};
  const kc = card('Media kit', 'O botão «Media kit em PDF» e as impressões da página.');
  span(kc, 4);
  kv(kc, [['Carregaram no botão', fmt.n(kit.button)], ['Imprimiram ou guardaram em PDF', fmt.n(kit.print)]]);
  g.append(kc);
  if ((c.sponsors || []).length) {
    g.append(span(figure({ title: 'Patrocinadores no fato', note: 'Cliques nos logótipos dos patrocinadores, e quantas vezes a lista foi vista.', draw: hbars(c.sponsors.map((x) => ({ label: x.host, v: x.clicks, text: `${fmt.n(x.clicks)} · vista ${fmt.n(x.views)}` }))),
      table: () => ({ caption: 'Patrocinadores no fato', cols: [{ l: 'Site', k: 'host' }, { l: 'Cliques', k: 'clicks', num: true, fmt: fmt.n }, { l: 'Vista', k: 'views', num: true, fmt: fmt.n }], rows: c.sponsors }) }), 4));
  }
  const dl = c.daily || { x: [] };
  g.append(span(dl.x && dl.x.length && sum(dl.s.out) ? figure({ title: 'Por dia', note: 'Visualizações com pelo menos uma ligação para fora.', draw: line(dl.x, [{ label: 'Com ligação para fora', cls: 'l1', key: 'k1', values: dl.s.out }]),
    table: () => ({ caption: 'Por dia', sort: false, cols: [{ l: 'Dia', k: 'x', fmt: (v) => fmt.day(v, true) }, { l: 'Visualizações', k: 'v', num: true, fmt: fmt.n }], rows: dl.x.map((x, i) => ({ x, v: dl.s.out[i] })) }) })
    : figure({ title: 'Por dia', empty: dl.unit === 'hour' ? 'Em «24 h» não mostramos ligações por hora. Escolhe 7 dias ou mais.' : NODATA }), 12));
}

// ---------- Montra ----------
// The showcase «O meu material», for the brands' monthly reports: per month, brand and product, the cards seen, the
// taps on the shop link and the codes copied. Totals only, every device (SPEC 3.6, privacy 2.7). d.names: how many
// products data/montra.json lists (null when it could not be read). Only the rows whose brand and product are in that
// file, the product being that brand's, count (L.mKnown); the others are listed apart, never in a total or a brand's
// CSV. A brand's CSV is made here, from what the tab shows, with the names: one brand's rows and nothing else.
const MT_EMPTY = 'A montra ainda não tem produtos. Quando tiver, os cliques aparecem aqui.';
// the shop taps first: the number the monthly report is for
const MT_COLS = [['shop', 'Cliques na loja', 'Loja'], ['view', 'Cartões vistos', 'Vistos'], ['code', 'Códigos copiados', 'Códigos']];
const mtSum = (rows, k) => sum(rows.map((r) => r[k]));
const plural = (n, one, many) => `${fmt.n(n)} ${n === 1 ? one : many}`;
// per brand, in the order the rows come (brand, then product)
function mtBrands(rows) {
  const by = new Map();
  for (const r of rows) { const b = by.get(r.brand) || { brand: r.brand, view: 0, shop: 0, code: 0 }; b.view += r.view; b.shop += r.shop; b.code += r.code; by.set(r.brand, b); }
  return [...by.values()];
}
// the CSV as the Worker writes it (BOM, «;», never a formula), for Excel in Portuguese
function csvCell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const toCsv = (header, rows) => `﻿${[header, ...rows].map((r) => r.map(csvCell).join(';')).join('\r\n')}\r\n`;
function saveCsv(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
// the period in a file name: «2026-10» for one calendar month (to yesterday in the current one), else «from-to»
const mtPeriod = (from, to) => (from && to && from.endsWith('-01') && from.slice(0, 7) === to.slice(0, 7) ? from.slice(0, 7) : `${from}-${to}`);
// brand: one brand id (its known rows only, with the names), or '' for every row (only for the owner: a column says
// whether the pair is in data/montra.json)
export function montraCsv(months, { brand = '', from = '', to = '' } = {}) {
  const one = !!brand;
  const header = ['mês', 'marca', 'produto', 'cartões vistos', 'cliques na loja', 'códigos copiados', 'id da marca', 'id do produto', ...(one ? [] : ['na montra'])];
  const rows = [], all = [];
  const line = (month, r, prod) => [month, L.mBrand(r.brand), prod, r.view, r.shop, r.code, r.brand, r.prod || '', ...(one ? [] : [r.prod ? (L.mKnown(r.brand, r.prod) ? 'sim' : 'não') : ''])];
  for (const m of months) {
    const list = m.rows.filter((r) => (one ? r.brand === brand && L.mKnown(r.brand, r.prod) : true));
    if (!list.length) continue;
    for (const r of list) rows.push(line(m.month, r, L.mProd(r.prod)));
    for (const b of mtBrands(list.filter((r) => L.mKnown(r.brand, r.prod)))) rows.push(line(m.month, { ...b, prod: '' }, 'total da marca'));
    all.push(...list.filter((r) => L.mKnown(r.brand, r.prod)));
  }
  for (const b of mtBrands(all)) rows.push(line(`${from} a ${to}`, { ...b, prod: '' }, 'total do período'));
  return { text: toCsv(header, rows), name: `gocarmo-montra-${one ? `${brand}-` : 'todas-'}${mtPeriod(from, to)}.csv`, rows: rows.length };
}
export function montra(p, d, ctx) {
  const m = d.montra || {}, months0 = m.months || [];
  const verified = d.names !== null && d.names !== undefined;
  const known = (r) => !verified || L.mKnown(r.brand, r.prod);
  const totals = (m.totals || []).filter(known), stray = (m.totals || []).filter((r) => !known(r));
  const months = months0.map((mo) => ({ month: mo.month, rows: mo.rows.filter(known) })).filter((mo) => mo.rows.length);
  if (!totals.length && !stray.length && !d.names) { emptyState(p, d.names === null ? `${MT_EMPTY} (Não consegui ler a lista de produtos do site.)` : MT_EMPTY); return; }
  sec(p, 'Montra (O meu material)');
  if (!verified) H('p', 'ga-fine', 'Não consegui ler data/montra.json: estes números ainda não foram conferidos com a lista de produtos, e o CSV de cada marca fica para quando a lista abrir.', p);
  kpiRow(p, [
    tile({ label: 'Cliques na loja', value: fmt.n(mtSum(totals, 'shop')), sub: 'toques em «Ver na loja» (abrem a loja da marca, com a etiqueta gocarmo)', prevName: null }),
    tile({ label: 'Cartões vistos', value: fmt.n(mtSum(totals, 'view')), sub: 'visualizações em que o cartão de um produto esteve visível, pelo menos metade, durante 1 segundo', prevName: null }),
    tile({ label: 'Códigos copiados', value: fmt.n(mtSum(totals, 'code')), sub: 'toques no botão que copia o código de desconto', prevName: null }),
  ], 'cols3');
  const z = m.zone || { reach: 0, secs: 0, r: 0 };
  H('p', 'ga-fine', `${fmt.n(z.reach)} ${z.reach === 1 ? 'visualização chegou' : 'visualizações chegaram'} à montra (${fmt.pct(z.r)} das ${fmt.n(m.pv)} do período), com ${fmt.dur(z.secs)} de tempo ativo nela, no total.`, p);

  const g = grid(p);
  // month shortcuts and the export: what the monthly report needs
  const rc = card('Relatório do mês', 'Escolhe o mês e a marca e exporta: o ficheiro leva só os números dessa marca, com os nomes dos produtos.');
  span(rc, 12);
  const mb = H('div', 'ga-inline ga-months', null, rc);
  mb.setAttribute('role', 'group');
  mb.setAttribute('aria-label', 'Meses com dados da montra');
  H('p', 'ga-fine', 'A procurar os meses com dados…', mb);
  const ex = H('div', 'ga-inline ga-mt-ex', null, rc);
  const lab = H('label', null, 'Marca', ex), sel = H('select', null, null, ex);
  sel.id = 'mt-csv-b'; lab.htmlFor = 'mt-csv-b';
  for (const b of verified ? L.mBrands() : []) { const o = H('option', null, b.name, sel); o.value = b.id; }
  const all = H('option', null, 'Todas as marcas (só para ti)', sel); all.value = '';
  const xb = H('button', 'btn sm gold', 'Exportar CSV', ex);
  xb.type = 'button';
  const xmsg = H('p', 'ga-fine', null, rc);
  xmsg.setAttribute('aria-live', 'polite');
  const label = () => (sel.value ? `Exportar CSV de ${L.mBrand(sel.value)}` : 'Exportar CSV de todas as marcas');
  const paint = () => { xb.textContent = label(); };
  sel.addEventListener('change', paint); paint();
  xb.addEventListener('click', () => {
    if (ctx.withToday()) { xmsg.textContent = 'O CSV só junta dias completos: escolhe um mês, ou um período que acabe ontem.'; return; }
    const r = m.range || {}, from = r.from || ctx.params().from || '', to = r.to || ctx.params().to || '';
    const out = montraCsv(sel.value ? months : months0, { brand: sel.value, from, to });
    saveCsv(out.name, out.text);
    xmsg.textContent = `Descarregado: ${out.name}${sel.value ? '' : '. Leva todas as marcas: não o envies a uma marca.'}`;
  });
  H('p', 'ga-fine', 'São totais, sem nada de quem clicou. A cada marca, envia só o ficheiro dela; o de todas as marcas é só para ti.', rc);
  g.append(rc);
  monthButtons(mb, ctx);

  if (!totals.length) g.append(span(figure({ title: 'Por marca e por mês', empty: 'Sem cartões vistos nem cliques neste período.' }), 12));
  else {
    // the period, per product: the shop taps, the one number brands ask for first
    const byShop = totals.slice().sort((a, b) => b.shop - a.shop || b.view - a.view || (a.prod < b.prod ? -1 : 1));
    const pname = (r) => `${L.mProd(r.prod)} · ${L.mBrand(r.brand)}`;
    g.append(span(figure({
      title: 'Cliques na loja, por produto', note: 'No período escolhido, todos os aparelhos. Ao lado, os cartões vistos; os códigos copiados estão na tabela.',
      draw: hbars(byShop.map((r) => ({ label: `${L.mBrand(r.brand)} · ${L.mProd(r.prod)}`, v: r.shop, text: `${plural(r.shop, 'clique', 'cliques')} · ${fmt.n(r.view)} vistos`,
        tip: () => ({ h: `${L.mBrand(r.brand)} · ${L.mProd(r.prod)}`, rows: MT_COLS.map(([k, l]) => ({ v: fmt.n(r[k]), l: l.toLowerCase() })) }) })), { unit: 'cliques' }),
      table: () => ({ caption: 'Montra no período', initial: { k: 'shop', dir: 'descending' }, cols: [{ l: 'Produto · marca', get: pname },
        ...MT_COLS.map(([k, l, sh]) => ({ l, s: sh, k, num: true, fmt: fmt.n }))], rows: totals }),
    }), 12));
    // per month: a heading, then each brand's total and its products under it (no month column: on a phone the three
    // numbers stay in view)
    const tc = card('Por marca e por mês', 'Em cada mês, o total de cada marca e, por baixo, os produtos dela. Os meses seguem o período escolhido.');
    span(tc, 12);
    for (const mo of months) {
      H('h3', 'ga-mt-month', L.month(mo.month), tc);
      const rows = [];
      for (const b of mtBrands(mo.rows)) {
        rows.push({ ...b, prod: '', _cls: 'ga-subtotal' });
        for (const r of mo.rows.filter((x) => x.brand === b.brand)) rows.push({ ...r, _cls: 'lvl1' });
      }
      tc.append(table({ caption: `Montra em ${L.month(mo.month)}`, sort: false, rows,
        cols: [{ l: 'Marca e produto', get: (r) => (r.prod ? L.mProd(r.prod) : `${L.mBrand(r.brand)} (total)`) },
          ...MT_COLS.map(([k, l, sh]) => ({ l, s: sh, k, num: true, fmt: fmt.n }))] }));
    }
    g.append(tc);
  }
  // rows whose ids are not a product of that brand in data/montra.json
  if (stray.length) {
    const uc = card('Não reconhecido', 'Identificadores que não estão em data/montra.json, ou um produto com a marca errada: um produto apagado do ficheiro, ou cliques forjados. Não entram nos totais nem no CSV de uma marca.');
    span(uc, 12);
    uc.append(table({ caption: 'Montra: não reconhecido', sort: false, rows: stray,
      cols: [{ l: 'Marca · produto (ids)', get: (r) => `${r.brand} · ${r.prod}` }, ...MT_COLS.map(([k, l, sh]) => ({ l, s: sh, k, num: true, fmt: fmt.n }))] }));
    g.append(uc);
  }
}
// one button per calendar month with showcase data in the last 13 months (a second read, whole days, cached by the
// Worker until the next nightly rollup)
async function monthButtons(box, ctx) {
  const today = ctx.today;
  const yday = today && new Date(Date.parse(`${today}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  if (!yday || !ctx.setPeriod) { box.replaceChildren(); return; }
  const y = Number(today.slice(0, 4)), mo = Number(today.slice(5, 7));
  const first = new Date(Date.UTC(y, mo - 13, 1)).toISOString().slice(0, 10);
  let r;
  try { r = await ctx.api.get('montra', { p: 'custom', from: first, to: yday, int: ctx.state.int }); } catch (_) { r = null; }
  if (!box.isConnected) return;
  box.replaceChildren();
  const list = r ? r.months.filter((x) => x.rows.some((row) => row.view || row.shop || row.code)).map((x) => x.month) : [];
  if (!list.length) { H('p', 'ga-fine', r ? 'Ainda nenhum mês com dados da montra.' : 'Não consegui ler os meses com dados.', box); return; }
  const st = ctx.state;
  for (const m of list.slice().reverse()) {
    const from = `${m}-01`, end = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);
    const to = end > yday ? yday : end;
    const b = H('button', 'btn sm ghost', L.month(m), box);
    b.type = 'button';
    const on = st.p === 'custom' && st.from === from && st.to === to;
    b.setAttribute('aria-pressed', String(on));
    if (to < end) b.title = `Até ${fmt.day(to, true)} (o mês ainda não acabou)`;
    b.addEventListener('click', () => ctx.setPeriod(from, to));
  }
}

// ---------- Qualidade ----------
export function qualidade(p, d, ctx) {
  const q = d.quality;
  sec(p, 'Velocidade');
  const V = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'];
  kpiRow(p, V.map((v) => {
    const x = (q.vitals || {})[v] || {};
    const [abbr, name] = L.VITAL[v];
    return statTile({ label: `${name} (${abbr}, p75)`, value: x.p75 === null || x.p75 === undefined ? '—' : vfmt(v)(x.p75), status: vitalStatus(v, x.p75), prevName: null,
      sub: x.n ? `${fmt.n(x.n)} medições · ${fmt.pct(rate(x.good, x.good + x.ni + x.poor))} boas` : 'sem medições' });
  }));
  H('p', 'ga-fine', 'p75: 3 em cada 4 visualizações foram assim ou melhor. Limites da Google: LCP 2,5 s / 4 s, INP 200 / 500 ms, CLS 0,1 / 0,25.', p);
  const g = grid(p);
  const bd = q.byDev || [];
  const VS = [{ label: 'Bom', cls: 'sg', key: 'ksg' }, { label: 'A melhorar', cls: 'sw', key: 'ksw' }, { label: 'Mau', cls: 'sc', key: 'ksc' }];
  const bdRows = bd.flatMap((r) => ['lcp', 'inp', 'cls'].map((v) => ({ label: `${L.dev(r.dev)} · ${L.VITAL[v][0]}`, parts: r[v] })).filter((x) => sum(x.parts)));
  g.append(span(bdRows.length ? figure({ title: 'Por aparelho', note: 'Parte das medições boas, a melhorar e más.', legend: VS.map((x) => ({ label: x.label, key: x.key })),
    draw: stack100(bdRows, VS), table: () => ({ caption: 'Por aparelho', cols: [{ l: 'Aparelho e medida', k: 'label' }, { l: 'Bom', get: (x) => x.parts[0], num: true, fmt: fmt.n }, { l: 'A melhorar', get: (x) => x.parts[1], num: true, fmt: fmt.n }, { l: 'Mau', get: (x) => x.parts[2], num: true, fmt: fmt.n }], rows: bdRows }) }) : figure({ title: 'Por aparelho', empty: NODATA }), 6));
  const tg = q.targets || { inp: [], lcp: [], cls: [] };
  const tc = card('O que atrasa', 'Os elementos ligados às piores medições. INP: onde tocaram; LCP: o maior elemento; CLS: o que saltou.');
  span(tc, 6);
  let anyT = false;
  for (const [v, list] of [['inp', tg.inp], ['lcp', tg.lcp], ['cls', tg.cls]]) {
    if (!list || !list.length) continue;
    anyT = true;
    tc.append(table({ caption: `${L.VITAL[v][0]} · ${L.VITAL[v][1]}`, initial: { k: 'n', dir: 'descending' }, cols: [
      { l: 'Elemento', k: 'sel', cls: 'wrap', sort: (x) => ctx.selName(x.sel), node: (x) => {
        const f = document.createDocumentFragment(), z = L.selZone(x.sel);
        H('span', null, ctx.selName(x.sel), f);
        H('span', 'sub mono', `${z ? `${L.zone(z)} · ` : ''}${x.sel}`, f);
        return f;
      } },
      ...(v === 'inp' ? [{ l: 'Gesto', k: 'kind', fmt: (k) => ({ pointer: 'toque/clique', keyboard: 'teclado' }[k] || '—') }] : []),
      { l: 'Medições', k: 'n', num: true, fmt: fmt.n }, ...(v !== 'cls' ? [{ l: 'Média', k: 'mean', num: true, fmt: vfmt(v) }] : [])], rows: list.slice(0, 10) }));
  }
  if (!anyT) emptyState(tc, NODATA);
  g.append(tc);
  const td = q.threeD || { ready: [], fail: [], failRate: {}, glLost: 0 };
  const r3 = card('Arranque do 3D', `Tempo até o modelo estar pronto. «No aparelho»: construído sem a ajuda de um worker (mais lento). 3D perdido a meio: ${fmt.n(td.glLost)}.`);
  span(r3, 6);
  r3.append(table({ caption: 'Arranque do 3D', sort: false, cols: [{ l: 'Objeto', get: (x) => L.ITEM[x.item] }, { l: 'Mediana', k: 'p50', num: true, fmt: fmt.ms }, { l: '9 em 10 até', k: 'p90', num: true, fmt: fmt.ms }, { l: 'No aparelho', k: 'main', num: true, fmt: fmt.pct }], rows: td.ready }));
  g.append(r3);
  const f3 = card('Sem 3D', `Falhou em ${fmt.pct(td.failRate.suit)} das vezes no fato e ${fmt.pct(td.failRate.helmet)} no capacete.`);
  span(f3, 6);
  if (td.fail.length) f3.append(table({ caption: 'Porque falhou', initial: { k: 'n', dir: 'descending' }, cols: [{ l: 'Objeto', get: (x) => L.ITEM[x.item] || x.item }, { l: 'Motivo', get: (x) => L.FAIL3D[x.why] || x.why }, { l: 'Visualizações', k: 'n', num: true, fmt: fmt.n }], rows: td.fail }));
  else emptyState(f3, 'O 3D não falhou neste período.');
  g.append(f3);
  const as = q.assets || [];
  const ac = card('Ficheiros que falharam', 'Imagens, código ou dados que não carregaram.');
  span(ac, 6);
  if (as.length) ac.append(table({ caption: 'Ficheiros que falharam', initial: { k: 'u', dir: 'descending' }, cols: [{ l: 'Tipo', get: (x) => L.ASSET[x.what] || x.what }, { l: 'Ficheiro', k: 'name', cls: 'wrap', node: (x) => H('span', 'mono', x.name || '—') }, { l: 'Vezes', k: 'n', num: true, fmt: fmt.n }, { l: 'Visualizações', k: 'u', num: true, fmt: fmt.n }], rows: as }));
  else emptyState(ac, 'Nenhum ficheiro falhou neste período.');
  g.append(ac);
  const bt = q.boot || { retry: 0, fail: 0 };
  const bc = card('Arranque da página', null);
  span(bc, 6);
  kv(bc, [['Recarregaram sozinhas para apanhar uma versão nova', fmt.n(bt.retry)], ['Não arrancaram (ficou sem animações)', fmt.n(bt.fail)], ['Visualizações que foram recarregamentos', fmt.pct(q.reloads)]]);
  g.append(bc);

  sec(p, 'Erros');
  const g2 = grid(p);
  const er = q.errors || [];
  const ec = card('Erros de JavaScript', 'Os erros vistos no período, por número de visualizações afetadas. A mensagem só aparece para ficheiros nossos, sem números nem emails.');
  span(ec, 12);
  if (er.length) ec.append(table({ caption: 'Erros de JavaScript', initial: { k: 'u', dir: 'descending' }, cols: [
    { l: 'Erro', k: 'm', cls: 'wrap', node: (x) => { const f = document.createDocumentFragment(); H('span', null, `${x.t}${x.m ? `: ${x.m}` : ''}`, f); H('span', 'sub mono', `${x.f}:${x.l}:${x.c}`, f); return f; } },
    { l: 'Navegadores', cls: 'wrap', get: (x) => x.br.map((b) => b.k).join(', ') || '—' },
    { l: 'Visualizações', k: 'u', num: true, fmt: fmt.n }, { l: 'Vezes', k: 'n', num: true, fmt: fmt.n },
    { l: 'Visto', cls: 'nw', get: (x) => (x.first ? fmt.range(x.first, x.last, false) : '—'), sort: (x) => x.last || '' }], rows: er }));
  else emptyState(ec, 'Nenhum erro de JavaScript neste período.');
  g2.append(ec);
  const rr = q.errRate || { x: [] };
  g2.append(span(rr.x && rr.x.length && rr.s.rate.some((v) => v) ? figure({ title: 'Páginas com erro', note: 'Parte das visualizações de cada dia com pelo menos um erro de JavaScript.', draw: line(rr.x, [{ label: 'Com erro', cls: 'l1', key: 'k1', values: rr.s.rate }], { yFmt: fmt.pct, integer: false, min: 0.01 }),
    table: () => ({ caption: 'Páginas com erro', sort: false, cols: [{ l: 'Dia', k: 'x', fmt: (v) => fmt.day(v, true) }, { l: 'Com erro', k: 'v', num: true, fmt: fmt.pct }], rows: rr.x.map((x, i) => ({ x, v: rr.s.rate[i] })) }) })
    : figure({ title: 'Páginas com erro', empty: rr.unit === 'hour' ? 'Em «24 h» não mostramos erros por hora. Escolhe 7 dias ou mais.' : 'Nenhuma página com erro neste período.' }), 6));
  const nf = q.nofin || { rate: 0, br: { rows: [] } };
  g2.append(rankFig({ title: 'Páginas sem fecho', note: `${fmt.pct(nf.rate)} das visualizações não mandaram o último sinal ao fechar (o tempo delas pode estar a menos). Por navegador:`, ranked: nf.br, label: (k) => k, uLabel: '—' }));
  const vd = q.vitalsDaily || { x: [] };
  if (vd.x && vd.x.length && ['lcp', 'inp', 'cls'].some((v) => vd.s[v].some((x) => x !== null))) {
    sec(p, 'Velocidade por dia');
    const g3 = grid(p);
    for (const v of ['lcp', 'inp', 'cls']) {
      g3.append(span(figure({ title: `${L.VITAL[v][1]} (${L.VITAL[v][0]})`, note: 'p75 de cada dia, com pelo menos 5 medições.', draw: line(vd.x, [{ label: L.VITAL[v][0], cls: 'l1', key: 'k1', values: vd.s[v] }], { yFmt: vAxis(v, vd.s[v]), integer: v !== 'cls', min: v === 'cls' ? 0.05 : 100, height: 150 }),
        table: () => ({ caption: L.VITAL[v][1], sort: false, cols: [{ l: 'Dia', k: 'x', fmt: (x) => fmt.day(x, true) }, { l: 'p75', k: 'v', num: true, fmt: vfmt(v) }], rows: vd.x.map((x, i) => ({ x, v: vd.s[v][i] })) }) }), 4));
    }
  }
}

// ---------- Opinião ----------
export function opiniao(p, d) {
  const f = d.feedback;
  const yesRate = rate(f.sim, f.sim + f.nao);
  kpiRow(p, [
    statTile({ label: 'Mostrada', value: fmt.n(f.shown), sub: 'visualizações que viram a pergunta', prevName: null }),
    statTile({ label: 'Respostas', value: fmt.n(f.answered), sub: f.shown ? `${fmt.pct(rate(f.answered, f.shown))} de quem a viu` : '', prevName: null }),
    statTile({ label: '% Sim', value: fmt.pct(yesRate), sub: `${fmt.n(f.sim)} sim · ${fmt.n(f.nao)} não`, status: d8Status('yes', yesRate), prevName: null }),
  ], 'cols3');
  H('p', 'ga-fine', '«Percebeste como funciona o patrocínio?» aparece uma vez a quem passou 15 s nas secções do patrocínio. Anónima: só contamos as respostas.', p);
  const g = grid(p);
  const wk = f.weekly || [];
  const YN = [{ label: 'Sim', cls: 'f1', key: 'k1' }, { label: 'Não', cls: 'f2', key: 'k2' }];
  g.append(span(wk.length ? figure({ title: 'Sim e Não por semana', legend: YN.map((x) => ({ label: x.label, key: x.key })), draw: stack100(wk.map((w) => ({ label: `${fmt.week(w.week)} · ${fmt.n(w.sim + w.nao)}`, parts: [w.sim, w.nao] })), YN),
    table: () => ({ caption: 'Sim e Não por semana', sort: false, cols: [{ l: 'Semana', get: (w) => fmt.week(w.week) }, { l: 'Sim', k: 'sim', num: true, fmt: fmt.n }, { l: 'Não', k: 'nao', num: true, fmt: fmt.n }], rows: wk }) }) : figure({ title: 'Sim e Não por semana', empty: 'Ainda sem respostas neste período.' }), 6));
  g.append(rankFig({ title: 'O que não ficou claro', note: 'O que escolheram depois de responder «Não».', ranked: f.reasons, label: (k) => L.REASON[k] || k, share: true, uLabel: '—' }));
  const by = f.by || { lang: [], vw: [], zone: [] };
  const bc = card('Por língua, largura ou secção', 'Uma divisão de cada vez. Secção: onde estava a meio do ecrã ao responder.');
  span(bc, 12);
  const sw = H('div', 'ga-inline', null, bc);
  const seg = H('fieldset', 'ga-seg', null, sw);
  H('legend', 'sr-only', 'Dividir por', seg);
  const holder = H('div', null, null, bc);
  const DIM = { lang: ['Língua', L.lang], vw: ['Largura', (k) => L.VWSHORT[k] || k], zone: ['Secção', L.zone] };
  const show = (dim) => {
    holder.replaceChildren();
    const list = by[dim] || [];
    if (!list.length) { emptyState(holder, 'Ainda sem respostas neste período.'); return; }
    holder.append(figure({ title: DIM[dim][0], cls: 'ga-sub', legend: YN.map((x) => ({ label: x.label, key: x.key })), draw: stack100(list.map((x) => ({ label: `${DIM[dim][1](x.k)} · ${fmt.n(x.sim + x.nao)}`, parts: [x.sim, x.nao] })), YN),
      table: () => ({ caption: DIM[dim][0], cols: [{ l: DIM[dim][0], get: (x) => DIM[dim][1](x.k) }, { l: 'Sim', k: 'sim', num: true, fmt: fmt.n }, { l: 'Não', k: 'nao', num: true, fmt: fmt.n }], rows: list }) }));
  };
  for (const dim of ['lang', 'vw', 'zone']) {
    const lab = H('label', null, null, seg);
    const r = H('input', null, null, lab); r.type = 'radio'; r.name = 'fb-dim'; r.value = dim; r.checked = dim === 'lang';
    H('span', null, DIM[dim][0], lab);
    r.addEventListener('change', () => show(dim));
  }
  show('lang');
  g.append(bc);
  if (f.standalone) H('p', 'ga-fine', `${fmt.n(f.standalone)} respostas chegaram sem visualização associada (contam nos totais, não nas divisões).`, p);
}

// ---------- Dados ----------
// «Diagnóstico: últimos 14 dias» (GET diag): per Lisbon day, the beacons that arrived, were kept or refused (and why),
// the visits from outside and mine, and the rollup state; a table from 900 px, two-line rows below
const SEM = 'sem contagem';
function rejWords(rej) {
  const by = new Map();
  for (const [k, n] of Object.entries(rej || {})) if (n > 0) by.set(L.REJWHY[k] || k, (by.get(L.REJWHY[k] || k) || 0) + n);
  return [...by].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${fmt.n(n)} ${w}`).join(' · ');
}
function dropWords(drop) {
  const out = [];
  if (drop && drop.cheio) out.push(`${fmt.n(drop.cheio)} depois do limite do dia`);
  if (drop && drop.teto) out.push(`${fmt.n(drop.teto)} acima do limite por endereço`);
  return out.length ? `não guardados: ${out.join(' · ')}` : '';
}
const rejTotal = (rej) => sum(Object.values(rej || {}));
function diagCard(dg, ctx) {
  const c = card('Diagnóstico: últimos 14 dias', 'Para perceber um zero. Por dia, em hora de Lisboa: os sinais que chegaram ao contador, os que guardou, os que recusou e porquê, e as visitas de fora e as tuas. Quem tem o Global Privacy Control, o Do Not Track ou «Não contar» ligado não envia nada, por isso não aparece aqui.');
  c.classList.add('ga-diag');
  span(c, 12);
  if (!dg || dg.error) {
    const e = dg && dg.error;
    H('p', 'ga-empty', missing(e) ? 'Este diagnóstico precisa da versão nova do contador. Fica disponível depois de publicares (Actions → Deploy stats corre sozinha num push ao gh-pages que mude stats-worker/).'
      : `Não consegui ler o diagnóstico. ${(e && e.text) || ''}`.trim(), c);
    return c;
  }
  const days = (dg.days || []).slice().reverse();
  const stateText = (x) => (L.DIAGSTATE[x.state] || (() => x.state))(dg.rollupAt);
  const dayText = (x) => `${fmt.day(x.day)}${x.day === dg.today ? ' (hoje)' : ''}`;
  const cell = (main, small) => { const f = document.createDocumentFragment(); H('span', null, main, f); if (small) H('small', 'ga-diag-why', small, f); return f; };
  // phones and tablets: two lines per day
  const ul = H('ul', 'ga-diag-list', null, c);
  for (const x of days) {
    const li = H('li', x.state === 'hoje' ? 'today' : null, null, ul);
    const l1 = H('p', 'l1', null, li);
    H('b', null, dayText(x), l1);
    H('span', `st st-${x.state}`, stateText(x), l1);
    const l2 = H('p', 'l2', null, li);
    if (x.counted) {
      const rt = rejTotal(x.rej);
      H('span', null, `Chegaram ${fmt.n(x.req)} · guardados ${fmt.n(x.ok)} · recusados ${fmt.n(rt)}`, l2);
      const why = [rt ? rejWords(x.rej) : '', dropWords(x.drop)].filter(Boolean).join('; ');
      if (why) H('small', 'ga-diag-why', why, l2);
    } else H('span', 'sem', `Sinais: ${SEM}`, l2);
    H('span', 'vis', `Visitas ${fmt.n(x.visits.ext)} de fora · ${fmt.n(x.visits.int)} ${x.visits.int === 1 ? 'tua' : 'tuas'}`, l2);
  }
  // from 900 px: a real table
  const tw = table({ caption: 'Diagnóstico por dia, hora de Lisboa', sort: false, rows: days, cols: [
    { l: 'Dia', k: 'day', fmt: (v, x) => dayText(x) },
    { l: 'Chegaram', k: 'req', num: true, fmt: (v, x) => (x.counted ? fmt.n(v) : SEM) },
    { l: 'Guardados', k: 'ok', num: true, node: (x) => (x.counted ? cell(fmt.n(x.ok), dropWords(x.drop)) : cell(SEM)) },
    { l: 'Recusados', k: 'rej', num: true, node: (x) => (x.counted ? cell(fmt.n(rejTotal(x.rej)), rejWords(x.rej)) : cell(SEM)) },
    { l: 'Visitas (de fora · tuas)', s: 'Visitas', k: 'visits', num: true, fmt: (v) => `${fmt.n(v.ext)} · ${fmt.n(v.int)}` },
    { l: 'Resumo', k: 'state', fmt: (v, x) => stateText(x) },
  ] });
  tw.classList.add('ga-diag-tw');
  c.append(tw);
  if (days.some((x) => !x.counted)) {
    H('p', 'ga-fine', dg.since ? `Antes de ${fmt.day(dg.since, true)} o contador ainda não contava os sinais por dia.` : 'O contador ainda não contou nenhum sinal por dia: começa com o primeiro sinal depois de publicares a versão nova.', c);
  }
  const r = L.diagReading(dg);
  const lead = H('p', `ga-diag-read r${r.rule}`, null, c);
  H('b', null, 'Leitura: ', lead);
  lead.append(r.text);
  H('p', 'ga-fine', `Atualizado às ${dg.at}. Os gráficos dos limites e dos pedidos recusados, mais abaixo, contam dias UTC (como o Cloudflare); este conta dias de Lisboa, como o resto do painel.`, c);
  void ctx;
  return c;
}

export function dados(p, d, ctx) {
  p.append(diagCard(d.diag, ctx));
  const s = d.system;
  const qt = s.quota || { x: [], req: [], dor: [], rows: [], dbBytes: 0, limits: {} };
  const last = (a) => (a && a.length ? a[a.length - 1] : 0);
  const lim = qt.limits || { req: 100000, dor: 100000, rows: 100000, db: 1e9 };
  const qc = card('Limites gratuitos', 'O plano gratuito do Cloudflare conta por dia (até à 01:00 de Lisboa, 00:00 UTC). No limite, as visitas deixam de ser contadas até ao dia seguinte. O limite de pedidos é da conta toda: passado esse, também o Worker dos Pedidos para (os pedidos de patrocínio seguem só como mensagem).');
  span(qc, 12);
  const ms = H('div', 'ga-meters', null, qc);
  ms.append(meter({ label: 'Pedidos ao contador (hoje)', value: last(qt.req), max: lim.req, text: `${fmt.n(last(qt.req))} de ${fmt.n(lim.req)}`, sub: 'partilhado com os Pedidos' }));
  ms.append(meter({ label: 'Pedidos ao armazém (hoje)', value: last(qt.dor), max: lim.dor, text: `${fmt.n(last(qt.dor))} de ${fmt.n(lim.dor)}` }));
  ms.append(meter({ label: 'Linhas escritas (hoje)', value: last(qt.rows), max: lim.rows, text: `${fmt.n(last(qt.rows))} de ${fmt.n(lim.rows)}`, sub: 'às 80 000 deixa de registar visitas novas' }));
  if (qt.rr) ms.append(meter({ label: 'Linhas lidas (hoje)', value: last(qt.rr), max: lim.rr || 5e6, text: `${fmt.n(last(qt.rr))} de ${fmt.n(lim.rr || 5e6)}` }));
  ms.append(meter({ label: 'Espaço ocupado', value: qt.dbBytes, max: lim.db, text: `${fmt.bytes(qt.dbBytes)} de ${fmt.bytes(lim.db)}` }));
  if (qt.x && qt.x.length && sum(qt.req) + sum(qt.rows)) {
    qc.append(figure({ title: 'Últimos 30 dias', cls: 'ga-sub', note: 'Dias UTC (como o Cloudflare conta).', legend: [{ label: 'Pedidos ao contador', key: 'k1', line: true }, { label: 'Pedidos ao armazém', key: 'k2', line: true }, { label: 'Linhas escritas', key: 'k3', line: true }],
      draw: line(qt.x, [{ label: 'Pedidos ao contador', cls: 'l1', key: 'k1', values: qt.req }, { label: 'Pedidos ao armazém', cls: 'l2', key: 'k2', values: qt.dor }, { label: 'Linhas escritas', cls: 'l3', key: 'k3', values: qt.rows }], { height: 170 }),
      table: () => ({ caption: 'Últimos 30 dias', sort: false, cols: [{ l: 'Dia (UTC)', k: 'x', fmt: (v) => fmt.day(v, true) }, { l: 'Contador', k: 'a', num: true, fmt: fmt.n }, { l: 'Armazém', k: 'b', num: true, fmt: fmt.n }, { l: 'Linhas', k: 'c', num: true, fmt: fmt.n }], rows: qt.x.map((x, i) => ({ x, a: qt.req[i], b: qt.dor[i], c: qt.rows[i] })) }) }));
  }
  p.append(qc);
  const g = grid(p);
  const rj = s.rejected || { x: [], s: {} };
  const R = rj.s || {};
  const fold = (rj.x || []).map((_, i) => (R.json?.[i] || 0) + (R.versao?.[i] || 0) + (R.esquema?.[i] || 0));
  const RS = [['origem', R.origem || []], ['tamanho', R.tamanho || []], ['formato', fold], ['limite', R.limite || []], ['robo', R.robo || []], ['cheio', R.cheio || []]];
  const rjTot = sum(RS.flatMap(([, v]) => v));
  // one total per day (one colour), and the reasons ranked under it: five series stacked would let colours touch that
  // were never checked side by side
  const perDay = (rj.x || []).map((_, i) => sum(RS.map(([, v]) => v[i] || 0)));
  const reasons = RS.map(([k, v]) => ({ label: L.REJ[k], v: sum(v) })).filter((x) => x.v).sort((a, b) => b.v - a.v);
  g.append(span(rjTot ? figure({ title: 'Pedidos recusados', note: 'Sinais que o contador recusou sem guardar nada: de outros sites, grandes demais, mal formados, em rajada, de robôs, ou depois do limite do dia. Quem pede para não ser seguido (GPC/DNT) não conta em lado nenhum.',
    draw: stackCols(rj.x, [{ label: 'Recusados', cls: 'f1', key: 'k1', values: perDay }]),
    after: (() => { const box = H('div'); box.append(figure({ title: 'Porquê, nos 30 dias', cls: 'ga-sub', draw: hbars(reasons, { unit: 'pedidos' }) })); return box; })(),
    table: () => ({ caption: 'Pedidos recusados', sort: false, cols: [{ l: 'Dia (UTC)', k: 'x', fmt: (v) => fmt.day(v, true) }, ...RS.map(([k], j) => ({ l: L.REJ[k], get: (r) => r.v[j], num: true, fmt: fmt.n }))], rows: rj.x.map((x, i) => ({ x, v: RS.map(([, v]) => v[i] || 0) })) }) })
    : figure({ title: 'Pedidos recusados', empty: 'Nada recusado nos últimos 30 dias.' }), 6));
  const ver = s.versions || { tv: { rows: [] }, b: { rows: [] } };
  const vc = card('Versões', 'Versão do contador e do site (o código do main.js) das visualizações do período. Uma versão antiga que não desaparece é um telemóvel com a página aberta há dias.');
  span(vc, 6);
  if (any(ver.b)) vc.append(figure({ title: 'Versão do site', cls: 'ga-sub', draw: hbars(rowsOf(ver.b, (k) => k, { share: true, otherLabel: 'Outras' })), table: () => rankedTable(ver.b, (k) => k, 'Versão do site', { uLabel: '—' }) }));
  if (any(ver.tv)) kv(vc, ver.tv.rows.map((x) => [`Contador v${x.k}`, fmt.n(x.n)]));
  if (!any(ver.b) && !any(ver.tv)) emptyState(vc, NODATA);
  g.append(vc);
  const ru = s.rollup || { last: null, pending: [] };
  const rc = card('Resumos diários', 'Todas as noites, às 00:20, o contador soma o dia anterior e apaga o que passou dos 30 dias.');
  span(rc, 6);
  kv(rc, [['Último dia somado', ru.last ? fmt.day(ru.last, true) : 'ainda nenhum'], ['À espera', ru.pending && ru.pending.length ? ru.pending.map((x) => fmt.day(x)).join(', ') : 'nada']]);
  g.append(rc);
  g.append(notesEditor(s.notes || [], ctx));
  g.append(csvCard(ctx));
  const pc = card('O que guardamos', null);
  span(pc, 6);
  for (const t of ['Sem cookies e nada guardado no aparelho de quem visita.', 'O endereço de internet e o navegador servem só para contar visitantes nesse dia, com uma chave que se apaga todas as noites. Nunca são guardados.',
    'Localização até à cidade, com pontos arredondados a cerca de 10 km. Cidades e sites com menos de 3 visitantes-dia ficam juntos.', '30 dias de registos de cada visualização; depois só totais (25 meses), e depois totais por mês sem cidade.',
    'Nada do que se escreve no pedido de reserva. Quem pede para não ser seguido (GPC ou Do Not Track) não é contado.']) H('p', 'ga-fine', t, pc);
  g.append(pc);
  const dc = card('Este aparelho', 'Visitas deste navegador marcadas como internas não entram nos números (a não ser com «Mostrar visitas internas»).');
  span(dc, 6);
  const st = H('p', 'ga-fine', null, dc);
  const b = H('button', 'btn sm ghost', null, dc);
  b.type = 'button';
  const paint = () => { const on = ctx.isInternal(); st.textContent = on ? 'Este aparelho não conta (interno).' : 'Este aparelho conta como visitante.'; b.textContent = on ? 'Voltar a contar este aparelho' : 'Marcar este aparelho como interno'; };
  b.addEventListener('click', () => { ctx.setInternal(!ctx.isInternal()); paint(); });
  paint();
  ctx.onInternal = paint;
  g.append(dc);
}

function notesEditor(notes, ctx) {
  const c = card('Anotações', 'Marca no gráfico de visitas o dia de uma publicação, de uma prova ou de uma notícia. Até 40 letras, sem nomes de pessoas.');
  span(c, 6);
  const ul = H('ul', 'ga-notes', null, c);
  const paint = (list) => {
    ul.replaceChildren();
    if (!list.length) { H('li', null, 'Ainda sem anotações.', ul); return; }
    for (const n of list.slice().sort((a, b) => (a.day < b.day ? 1 : -1))) {
      const li = H('li', null, null, ul);
      H('span', 'd', fmt.day(n.day, true), li);
      H('span', 't', n.label, li);
      H('span', 'k', L.NOTEKIND[n.kind] || n.kind, li);
      const del = H('button', 'link', 'Apagar', li);
      del.type = 'button';
      del.setAttribute('aria-label', `Apagar a anotação de ${fmt.day(n.day, true)}: ${n.label}`);
      del.addEventListener('click', async () => {
        del.disabled = true;
        try { await ctx.api.del(`notes/${n.id}`); notes = notes.filter((x) => x.id !== n.id); paint(notes); ctx.toast('Anotação apagada.'); ctx.invalidate(); }
        catch (e) { del.disabled = false; ctx.toast(e.text || 'Não consegui apagar.'); }
      });
    }
  };
  paint(notes);
  const f = H('form', 'ga-form', null, c);
  f.noValidate = true;
  const fld = (label, el, cls) => { const w = H('div', `field${cls ? ` ${cls}` : ''}`, null, f); const l = H('label', null, label, w); el.id = `n-${Math.random().toString(36).slice(2, 7)}`; l.htmlFor = el.id; w.append(el); return el; };
  const day = fld('Dia', H('input')); day.type = 'date'; day.value = ctx.today || ''; day.max = ctx.today || '';
  const kind = fld('Tipo', H('select', 'ga-select'));
  const lab = fld('O que foi', H('input'), 'wide'); lab.type = 'text'; lab.maxLength = 40; lab.placeholder = 'Reel do fato no Instagram'; lab.autocomplete = 'off';
  for (const [k, v] of Object.entries(L.NOTEKIND)) { const o = H('option', null, v, kind); o.value = k; }
  const go = H('button', 'btn sm gold', 'Guardar', f); go.type = 'submit';
  const err = H('p', 'err', null, c);
  err.setAttribute('role', 'alert');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.textContent = '';
    const label = lab.value.trim();
    if (!day.value || !label) { err.textContent = 'Escolhe o dia e escreve o que foi.'; return; }
    go.disabled = true;
    try {
      const r = await ctx.api.post('notes', { day: day.value, label, kind: kind.value });
      notes = [...notes, r.note]; paint(notes); lab.value = ''; ctx.toast('Anotação guardada.'); ctx.invalidate();
    } catch (x) { err.textContent = x.code === 'esquema' ? 'O dia tem de ser dos últimos 25 meses e o texto ter até 40 letras.' : x.text || 'Não consegui guardar.'; }
    finally { go.disabled = false; }
  });
  return c;
}

function csvCard(ctx) {
  const c = card('Descarregar CSV', 'Uma tabela de cada vez, com o período e os filtros escolhidos em cima. Abre no Excel (separador «;», vírgula decimal). Só totais: cidades e sites pequenos ficam juntos, como no painel.');
  span(c, 6);
  const f = H('form', 'ga-inline', null, c);
  f.noValidate = true;
  const l = H('label', 'sr-only', 'Tabela', f);
  const s = H('select', 'ga-select', null, f);
  s.id = 'csv-t'; l.htmlFor = 'csv-t';
  for (const [k, v] of L.CSV) { const o = H('option', null, v, s); o.value = k; }
  const b = H('button', 'btn sm gold', 'Descarregar', f); b.type = 'submit';
  const msg = H('p', 'ga-fine', null, c);
  msg.setAttribute('aria-live', 'polite');
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (ctx.withToday()) { msg.textContent = 'O CSV só junta dias completos: escolhe 7, 30 ou 90 dias, ou um período que acabe ontem.'; return; }
    b.disabled = true; msg.textContent = 'A preparar…';
    try { const name = await ctx.api.csv({ ...ctx.params(), t: s.value }); msg.textContent = `Descarregado: ${name}`; }
    catch (x) { msg.textContent = x.text || 'Não consegui descarregar.'; }
    finally { b.disabled = false; }
  });
  return c;
}

export const TABS = {
  resumo: { endpoints: ['overview'], render: resumo, live: true },
  publico: { endpoints: ['audience'], render: publico, spots: true },
  pagina: { endpoints: ['content'], render: pagina },
  estudio: { endpoints: ['studio'], render: estudio, spots: true },
  reservas: { endpoints: ['booking'], render: reservas, spots: true },
  contactos: { endpoints: ['contacts'], render: contactos },
  qualidade: { endpoints: ['quality'], render: qualidade },
  opiniao: { endpoints: ['feedback'], render: opiniao },
  // diag: soft (the panel still loads when the Worker does not have it yet)
  dados: { endpoints: ['system'], soft: ['diag'], render: dados },
  montra: { endpoints: ['montra'], render: montra, montra: true },
};
export { legend, textW };
