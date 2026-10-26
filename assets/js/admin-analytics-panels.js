// One render function per tab of /admin/analytics/ (SPEC 5.4, 5.5): API shapes (SPEC 3.6) → cards. Form per card
// follows the dataviz method: ranked lists as one-colour bars, parts of a whole as 100 % stacks, time as lines on one
// axis, the funnel on the ordinal ramp, headline numbers as tiles. Every chart has its «Ver tabela» twin.
import { H, fmt, figure, table, emptyState, hbars, grouped, stack100, funnel, columns, stackCols, line, scatter, statTile, status, meter, sparkline, legend, textW } from './admin-analytics-charts.js';
import * as L from './admin-analytics-labels.js';
import { drawMap } from './admin-analytics-map.js';

const ZONES = ['top', 'tese', 'historia', 'prova', 'resultados', 'dados', 'epoca', 'fato-topo', 'o-fato', 'o-capacete', 'fato-termos', 'media', 'apoiar', 'contacto', 'footer'];
const ALL_DEV = 'Todos os aparelhos';
const NODATA = 'Ainda sem dados neste período.';

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
function rankedTable(r, label, caption, { uLabel = 'Visitantes-dia', extra = [] } = {}) {
  const tot = r.total || 1;
  const rows = [...r.rows.map((x) => ({ ...x, lab: label(x.k, x) })), ...(r.other && r.other.n ? [{ ...r.other, lab: 'Outros' }] : [])];
  return { caption, cols: [{ l: 'Nome', k: 'lab' }, { l: 'Visualizações', k: 'n', num: true, fmt: fmt.n }, { l: uLabel, k: 'u', num: true, fmt: fmt.n },
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
const durEdge = (e) => (e < 60 ? `${e}s` : `${e / 60}min`);
const durBins = (h) => histBins(h, (e, i) => (i === h.edges.length - 1 ? `${durEdge(e)}+` : `${durEdge(e)}–${durEdge(h.edges[i + 1])}`),
  (e, i) => (i === h.edges.length - 1 ? `${fmt.dur(e)} ou mais` : `de ${fmt.dur(e)} a ${fmt.dur(h.edges[i + 1])}`));
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

// ---------- Resumo ----------
export function renderNow(box, now, ctx) {
  box.replaceChildren();
  if (!now) { emptyState(box, 'Não consegui ler quem está no site agora.', ctx.retryNow); return; }
  const wrap = H('div', 'ga-now', null, box);
  const hero = H('div', 'ga-hero', null, wrap);
  H('span', 'v', fmt.n(now.now), hero);
  H('span', 'lb', now.now === 1 ? 'pessoa com o site aberto agora' : 'pessoas com o site aberto agora', hero);
  H('span', 'est', `estimativa · às ${now.at}`, hero);
  const mid = H('div', null, null, wrap);
  H('h4', null, 'Novas visualizações nos últimos 30 minutos', mid);
  const sp = sparkline(now.spark || []);
  sp.setAttribute('role', 'img');
  sp.setAttribute('aria-label', `${fmt.n(sum(now.spark || []))} novas visualizações nos últimos 30 minutos`);
  mid.append(sp);
  kv(mid, [['Hoje: visualizações', fmt.n(now.today.pv)], ['Visitas', fmt.n(now.today.visits)], ['Visitantes', fmt.n(now.today.uv)]]);
  const right = H('div', null, null, wrap);
  const list = (title, r, label) => {
    H('h4', null, title, right);
    const ol = H('ol', null, null, right);
    if (!r || !r.rows.length) { H('li', null, 'Ainda ninguém hoje.', ol); return; }
    for (const x of r.rows.slice(0, 3)) { const li = H('li', null, null, ol); H('span', null, label(x.k), li); H('span', null, fmt.n(x.n), li); }
  };
  list('Hoje, de onde vêm', now.top && now.top.chan, L.chan);
  H('div', null, null, right).className = 'ga-gap';
  list('Hoje, países', now.top && now.top.cc, L.country);
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
    tile({ label: 'Chegam ao patrocínio', value: fmt.pct(k.offer.v), v: k.offer.v, prev: k.offer.prev, kind: 'rate', spark: k.offer.spark, prevName: pn }),
    tile({ label: 'Pedidos enviados', value: fmt.n(k.sends.v), v: k.sends.v, prev: k.sends.prev, spark: k.sends.spark, prevName: pn, chip: devChip }),
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

  g.append(rankFig({ title: 'De onde vêm', note: 'Os 5 canais com mais visualizações.', ranked: o.chan, label: L.chan, cls: 's6', otherLabel: 'Outros canais' }));
  g.append(rankFig({ title: 'Países', note: 'Os 5 países com mais visualizações. A cidade está em Público.', ranked: o.cc, label: L.country, cls: 's6', otherLabel: 'Outros países' }));

  const reach = o.reach || [];
  g.append(span(reach.some((z) => z.r > 0) ? figure({
    title: 'Até onde chegam', note: 'Parte das visualizações que chegou a cada secção, pela ordem da página.',
    draw: hbars(reach.map((z) => ({ label: L.zone(z.z), v: z.r, text: fmt.pct(z.r) })), { max: 1, fmt: fmt.pct }),
    table: () => ({ caption: 'Até onde chegam', sort: false, cols: [{ l: 'Secção', get: (z) => L.zone(z.z) }, { l: 'Chegaram', k: 'r', num: true, fmt: fmt.pct }], rows: reach }),
  }) : figure({ title: 'Até onde chegam', empty: NODATA }), 6));

  const steps = (o.funnel || []).map((x) => ({ label: L.STEP[x.step], n: x.n, prev: x.prev }));
  g.append(span(steps.some((x) => x.n) ? figure({
    title: 'Funil de reserva', chip: ALL_DEV,
    note: 'Cada passo conta à parte: quem chega por uma ligação partilhada pode saltar passos.',
    draw: funnel(steps, { compact: true }),
    table: () => funnelTable(steps),
  }) : figure({ title: 'Funil de reserva', chip: ALL_DEV, empty: NODATA }), 6));

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
  const pc = a.pc || { coarse: 0, fine: 0 };
  g2.append(span(pc.coarse + pc.fine ? figure({ title: 'Toque ou rato', note: 'Ecrã de toque contra rato ou trackpad.', legend: [{ label: 'Toque', key: 'k1' }, { label: 'Rato', key: 'k2' }],
    draw: stack100([{ label: 'Todas', parts: [pc.coarse, pc.fine] }], [{ label: 'Toque', cls: 'f1', key: 'k1' }, { label: 'Rato', cls: 'f2', key: 'k2' }], { narrow: true }),
    table: () => ({ caption: 'Toque ou rato', sort: false, cols: [{ l: 'Tipo', k: 'l' }, { l: 'Visualizações', k: 'n', num: true, fmt: fmt.n }], rows: [{ l: 'Toque', n: pc.coarse }, { l: 'Rato', n: pc.fine }] }) }) : figure({ title: 'Toque ou rato', empty: NODATA }), 4));
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
    const bins = histBins(sw.timing, (e, i) => (i === sw.timing.edges.length - 1 ? `${e}s+` : `${e}–${sw.timing.edges[i + 1]}s`));
    swBox.append(figure({ title: 'Quando mudam', note: 'Segundos de tempo ativo antes de mudar.', cls: 'ga-sub', draw: columns(bins, { height: 110, unit: 'visualizações' }), table: () => histTable(sw.timing, bins, 'Quando mudam') }));
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
  const RS = [['scroll', 'f1', 'k1'], ['hero', 'f2', 'k2'], ['nav', 'f3', 'k3'], ['menu', 'f4', 'k4'], ['link', 'f5', 'k5'], ['outro', 'f6', 'k6']];
  const rv = (k) => (routes.find((r) => r.k === k) || { n: 0 }).n;
  const rc = card('Como chegam ao patrocínio', `${fmt.pct(c.offer.reach)} das visualizações chegaram à secção 05. ${fmt.pct(c.offer.before)} saíram antes de lá chegar.`);
  span(rc, 6);
  if (sum(routes.map((r) => r.n))) {
    rc.append(figure({ title: 'Por onde', cls: 'ga-sub', legend: RS.map(([k, , key]) => ({ label: L.ROUTE[k], key })),
      draw: stack100([{ label: 'Chegadas', parts: RS.map(([k]) => rv(k)) }], RS.map(([k, cls, key]) => ({ label: L.ROUTE[k], cls, key })), { narrow: true }),
      table: () => ({ caption: 'Como chegam ao patrocínio', cols: [{ l: 'Caminho', get: (r) => L.ROUTE[r.k] }, { l: 'Visualizações', k: 'n', num: true, fmt: fmt.n }], rows: routes }) }));
  } else emptyState(rc, NODATA);
  g2.append(rc);
  const arr = c.arrival;
  g2.append(span(arr && sum(arr.n) ? figure({ title: 'Tempo até ao patrocínio', note: 'Segundos de tempo ativo desde que a página abriu até chegar à secção 05.',
    draw: columns(durBins(arr), { median: arr.median !== null ? { at: at(arr, arr.median), label: `mediana ${fmt.dur(arr.median)}` } : null, unit: 'visualizações' }),
    table: () => histTable(arr, durBins(arr), 'Tempo até ao patrocínio') }) : figure({ title: 'Tempo até ao patrocínio', empty: NODATA }), 6));

  sec(p, 'Descer e ficar');
  const g3 = grid(p);
  const sn = (c.scroll && c.scroll.n) || [];
  g3.append(span(sum(sn) ? figure({ title: 'Até onde descem', note: `Até onde cada visualização desceu, em % da página. ${fmt.pct(c.scroll.beyondFirst)} desceram além do primeiro ecrã.`,
    draw: columns(sn.map((v, i) => ({ label: `${i * 5}%`, tipLabel: `desceram até ${i * 5} % da página`, v })), { every: 5, unit: 'visualizações' }),
    table: () => ({ caption: 'Até onde descem', sort: false, cols: [{ l: 'Profundidade máxima', k: 'l' }, { l: 'Visualizações', k: 'v', num: true, fmt: fmt.n }], rows: sn.map((v, i) => ({ l: `${i * 5} %`, v })) }) }) : figure({ title: 'Até onde descem', empty: NODATA }), 6));
  const eng = c.eng;
  g3.append(span(eng && sum(eng.n) ? figure({ title: 'Tempo ativo', note: `Mediana ${fmt.dur(eng.median)}, média ${fmt.dur(eng.mean)}. Só conta com a página à vista e alguém a mexer.`,
    draw: columns(durBins(eng), { median: eng.median !== null ? { at: at(eng, eng.median), label: `mediana ${fmt.dur(eng.median)}` } : null, unit: 'visualizações' }),
    table: () => histTable(eng, durBins(eng), 'Tempo ativo') }) : figure({ title: 'Tempo ativo', empty: NODATA }), 6));

  sec(p, 'Botões');
  const g4 = grid(p);
  const ctas = (c.ctas || []).filter((x) => x.seen || x.clicked);
  const ctrs = ctas.filter((x) => x.seen >= 20 && x.ctr !== null).map((x) => x.ctr).sort((a, b) => a - b);
  const q1 = ctrs.length >= 4 ? ctrs[Math.floor((ctrs.length - 1) * 0.25)] : null;
  const low = (x) => q1 !== null && x.seen >= 20 && x.ctr !== null && x.ctr <= q1;
  g4.append(span(ctas.length ? figure({ title: 'Botões vistos e carregados', note: 'Quantos viram cada botão (metade à vista durante 1 s) e quantos carregaram. «Visto por muitos, carregado por poucos»: 20 ou mais vistas e entre os 25 % que menos convencem.',
    draw: hbars(ctas.map((x) => ({ label: L.cta(x.id), v: x.ctr || 0, text: `${fmt.pct(x.ctr)} · vistos por ${fmt.n(x.seen)}${low(x) ? ' · visto por muitos, carregado por poucos' : ''}`,
      tip: () => ({ h: L.cta(x.id), rows: [{ v: fmt.pct(x.ctr), l: 'carregaram' }, { v: fmt.n(x.seen), l: 'viram' }, { v: fmt.n(x.clicked), l: 'carregaram (visualizações)' }] }) })), { fmt: fmt.pct, wideAt: 640 }),
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

  // the wait: one item at a time
  const wc = card('Espera pelo 3D', 'Segundos que viram «A carregar» com o estúdio à vista.');
  span(wc, 6);
  const sw = H('div', 'ga-inline', null, wc);
  const seg = H('fieldset', 'ga-seg', null, sw);
  H('legend', 'sr-only', 'Objeto', seg);
  const holder = H('div', null, null, wc);
  const showWait = (item) => {
    holder.replaceChildren();
    const x = it[item] || {};
    const h = x.wait;
    if (h && sum(h.n)) {
      const bins = histBins(h, (e, i) => (i === h.edges.length - 1 ? `${e}s+` : `${e}–${h.edges[i + 1]}s`), (e, i) => (i === h.edges.length - 1 ? `${e} s ou mais` : `de ${e} a ${h.edges[i + 1]} s`));
      holder.append(figure({ title: L.ITEM[item], cls: 'ga-sub', draw: columns(bins, { median: h.median !== null ? { at: at(h, h.median), label: `mediana ${fmt.dur(h.median)}` } : null, unit: 'visualizações' }), table: () => histTable(h, bins, `Espera: ${L.ITEM[item]}`) }));
    } else emptyState(holder, 'Ninguém esperou pelo 3D neste período.');
    H('p', 'ga-fine', `Saíram antes de o 3D abrir: ${fmt.n(x.leftBeforeReady || 0)}.`, holder);
  };
  for (const item of ['suit', 'helmet']) {
    const lab = H('label', null, null, seg);
    const r = H('input', null, null, lab); r.type = 'radio'; r.name = 'wait-item'; r.value = item; r.checked = item === 'suit';
    H('span', null, L.ITEM[item], lab);
    r.addEventListener('change', () => showWait(item));
  }
  showWait('suit');
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
  const FS = [['3d', 'f1', 'k1'], ['tabela', 'f2', 'k2'], ['capitulo', 'f3', 'k3'], ['teclas', 'f4', 'k4'], ['link', 'f5', 'k5']];
  const fv = (k) => (fr.find((x) => x.k === k) || { n: 0 }).n;
  g.append(span(sum(fr.map((x) => x.n)) ? figure({ title: 'De onde abrem os espaços', note: 'Como abriram a ficha de um espaço.', legend: FS.map(([k, , key]) => ({ label: L.FROM[k], key })),
    draw: stack100([{ label: 'Aberturas', parts: FS.map(([k]) => fv(k)) }], FS.map(([k, cls, key]) => ({ label: L.FROM[k], cls, key })), { narrow: true }),
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
  const ES = ['feito', 'copiou_saiu', 'fechou_passo2', 'saiu_passo2', 'fechou_passo1', 'aberta_saiu'];
  const ev = (k) => (ends.find((x) => x.k === k) || { n: 0 }).n;
  g.append(span(sum(ends.map((x) => x.n)) ? figure({ title: 'Onde desistem', chip, note: 'Como acabou cada pedido aberto.', legend: ES.map((k, i) => ({ label: L.END[k], key: `k${i + 1}` })),
    draw: stack100([{ label: 'Pedidos abertos', parts: ES.map(ev) }], ES.map((k, i) => ({ label: L.END[k], cls: `f${i + 1}`, key: `k${i + 1}` })), { narrow: true }),
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
  ], 'cols3');
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

// ---------- Qualidade ----------
export function qualidade(p, d) {
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
      { l: 'Elemento', k: 'sel', cls: 'wrap', node: (x) => { const s = H('span', 'mono', x.sel); return s; } },
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
      g3.append(span(figure({ title: `${L.VITAL[v][1]} (${L.VITAL[v][0]})`, note: 'p75 de cada dia, com pelo menos 5 medições.', draw: line(vd.x, [{ label: L.VITAL[v][0], cls: 'l1', key: 'k1', values: vd.s[v] }], { yFmt: vfmt(v), integer: v !== 'cls', min: v === 'cls' ? 0.05 : 100, height: 150 }),
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
export function dados(p, d, ctx) {
  const s = d.system;
  const qt = s.quota || { x: [], req: [], dor: [], rows: [], dbBytes: 0, limits: {} };
  const last = (a) => (a && a.length ? a[a.length - 1] : 0);
  const lim = qt.limits || { req: 100000, dor: 100000, rows: 100000, db: 1e9 };
  const qc = card('Limites gratuitos', 'O plano gratuito do Cloudflare conta por dia (até à 01:00 de Lisboa, 00:00 UTC). No limite, as visitas deixam de ser contadas até ao dia seguinte; o site continua a funcionar.');
  span(qc, 12);
  const ms = H('div', 'ga-meters', null, qc);
  ms.append(meter({ label: 'Pedidos ao contador (hoje)', value: last(qt.req), max: lim.req, text: `${fmt.n(last(qt.req))} de ${fmt.n(lim.req)}`, sub: 'partilhado com os Pedidos' }));
  ms.append(meter({ label: 'Pedidos ao armazém (hoje)', value: last(qt.dor), max: lim.dor, text: `${fmt.n(last(qt.dor))} de ${fmt.n(lim.dor)}` }));
  ms.append(meter({ label: 'Linhas escritas (hoje)', value: last(qt.rows), max: lim.rows, text: `${fmt.n(last(qt.rows))} de ${fmt.n(lim.rows)}` }));
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
  const RS = [['origem', R.origem || []], ['tamanho', R.tamanho || []], ['formato', fold], ['limite', R.limite || []], ['robo', R.robo || []]];
  const rjTot = sum(RS.flatMap(([, v]) => v));
  g.append(span(rjTot ? figure({ title: 'Pedidos recusados', note: 'Sinais que o contador recusou sem guardar nada: de outros sites, grandes demais, mal formados, em rajada ou de robôs. Quem pede para não ser seguido (GPC/DNT) não conta em lado nenhum.',
    legend: RS.map(([k], i) => ({ label: L.REJ[k], key: `k${i + 1}` })), draw: stackCols(rj.x, RS.map(([k, v], i) => ({ label: L.REJ[k], cls: `f${i + 1}`, key: `k${i + 1}`, values: v }))),
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
  dados: { endpoints: ['system'], render: dados },
};
export { legend, textW };
