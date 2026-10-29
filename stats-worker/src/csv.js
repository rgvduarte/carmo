// CSV export (SPEC 3.6): what the dashboard shows, as a spreadsheet for Excel in Portuguese (BOM, «;» between
// columns, decimal comma). The privacy rules of the dashboard hold here too: folded places and hosts, nothing smaller
// than a day, no raw rows.

import { period } from './time.js';
import { splitK } from './query.js';

const BOM = String.fromCharCode(0xfeff);
export const CSV_TABLES = ['dias', 'paginas', 'origens', 'sites', 'paises', 'localidades', 'aparelhos', 'sistemas',
  'navegadores', 'linguas', 'zonas', 'cliques', 'botoes', 'eventos', 'funil', 'erros', 'opiniao', 'meses', 'montra'];

function cell(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 1e4) / 1e4).replace('.', ',');
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;                       // never a formula in the spreadsheet
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (header, rows) => BOM + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n') + '\r\n';

const rankedRows = (rk, f = (r) => [r.k, r.n, r.u, r.x]) => [...rk.rows.map(f), ...(rk.other ? [f(rk.other)] : [])];

// P: the export request; h: { compute(endpoint, overrides), collect(windows), months(), monthsF() }
export function exportTable(P, h) {
  const t = P.t;
  if (!CSV_TABLES.includes(t)) return { error: 'filtro' };
  const per = period(P, P.clock);
  if (per.error) return { error: 'periodo' };
  const { from, to } = per.range;
  let header, rows, name = '';
  const win = (ms, dev = P.dev) => ({ name: 'x', from, to, dev, ms, split: new Set() });
  const pvCols = ['visualizações', 'visitantes (soma por dia)', 'visitas'];
  switch (t) {
    case 'dias': {
      const a = h.collect([win(['c'])]).x, b = h.collect([win(['f'], 'all')]).x;
      header = ['dia', 'visualizações', 'visitas', 'visitantes', 'com envolvimento', 'saídas rápidas', 'chegaram ao patrocínio', 'pedidos enviados'];
      rows = a.slots.map((d) => [d, ...['pv', 'visits', 'uv', 'engaged', 'quick', 's0'].map((k) => Math.round(a.slotN(d, 'c', k))), Math.round(b.slotN(d, 'f', 'S4'))]);
      break;
    }
    case 'paginas': {
      const a = h.collect([win(['d.path'])]).x;
      header = ['página', ...pvCols];
      rows = [...a.rows('d.path')].sort((x, y) => y[1][0] - x[1][0]).map(([k, v]) => [k, Math.round(v[0]), Math.round(v[1]), Math.round(v[2])]);
      break;
    }
    case 'origens': {
      const r = h.compute('audience', {});
      header = ['origem', ...pvCols, 'com envolvimento', 'saídas rápidas', 'chegaram ao patrocínio'];
      rows = rankedRows(r.chan, (x) => [x.k, x.n, x.u, x.x, x.r ?? '', x.q ?? '', x.f ?? '']);
      break;
    }
    case 'sites': {
      const r = h.compute('audience', {});
      header = ['site', 'origem', ...pvCols];
      rows = rankedRows(r.ref, (x) => [x.k, x.g || '', x.n, x.u, x.x]);
      break;
    }
    case 'paises': {
      const r = h.compute('audience', {});
      header = ['país', ...pvCols];
      rows = rankedRows(r.geo.cc);
      break;
    }
    case 'localidades': {
      const g = h.compute('audience', {}).geo;
      header = ['país', 'região', 'localidade', 'visualizações', 'visitantes (soma por dia)'];
      rows = [
        ...g.cities.map((c) => [c.cc, c.reg, c.city, c.n, c.u]),
        ...g.regions.map((c) => [c.cc, c.reg, '', c.n, c.u]),
        ...g.otherPlaces.map((c) => [c.cc, '', 'Outras localidades', c.n, c.u]),
      ];
      break;
    }
    case 'aparelhos': case 'sistemas': case 'navegadores': case 'linguas': {
      const r = h.compute('audience', {});
      const key = { aparelhos: 'dev', sistemas: 'os', navegadores: 'br', linguas: 'lang' }[t];
      header = [{ aparelhos: 'aparelho', sistemas: 'sistema', navegadores: 'navegador', linguas: 'língua' }[t], ...pvCols];
      rows = rankedRows(r[key]);
      break;
    }
    case 'zonas': {
      const r = h.compute('content', {});
      header = ['zona', 'chegaram', 'chegaram (parte)', 'tempo ativo (s)', 'parte do tempo', 's por visualização', 'saídas', 'saídas por ligação'];
      rows = r.zones.map((z) => [z.z, z.reached, z.r, z.sec, z.share, z.perPv ?? '', z.exits, z.exitsLink]);
      break;
    }
    case 'cliques': {
      const r = h.compute('heatmap', { vw: 'all' });
      header = ['elemento', 'texto', 'zona', 'interativo', 'cliques', 'visualizações', 'sem resposta', 'repetidos', 'com erro'];
      rows = r.elements.map((e) => [e.sel, e.lab, e.sec, e.ia, e.n, e.u, e.dead, e.rage, e.err]);
      break;
    }
    case 'botoes': {
      const r = h.compute('content', {});
      header = ['botão', 'vistos', 'carregados', 'taxa'];
      rows = r.ctas.map((c) => [c.id, c.seen, c.clicked, c.ctr ?? '']);
      break;
    }
    case 'eventos': {
      const a = h.collect([win(['ev'])]).x;
      header = ['evento', 'parâmetros', 'eventos', 'visualizações'];
      rows = [...a.rows('ev')].sort((x, y) => y[1][0] - x[1][0]).map(([k, v]) => { const [n, p] = splitK(k); return [n, p || '', Math.round(v[0]), Math.round(v[1])]; });
      break;
    }
    case 'funil': {
      const r = h.compute('booking', {});
      header = ['passo', 'visualizações', 'período anterior'];
      rows = r.funnel.map((s) => [s.step, s.n, s.prev ?? '']);
      break;
    }
    case 'erros': {
      const r = h.compute('quality', {});
      header = ['tipo', 'mensagem', 'ficheiro', 'linha', 'coluna', 'ocorrências', 'visualizações', 'primeiro dia', 'último dia'];
      rows = r.errors.map((e) => [e.t, e.m, e.f, e.l, e.c, e.n, e.u, e.first || '', e.last || '']);
      break;
    }
    case 'opiniao': {
      const a = h.collect([win(['fb', 'fbs'])]).x;
      header = ['pergunta', 'resposta', 'língua', 'largura', 'secção', 'respostas'];
      rows = [
        ...[...a.rows('fb')].map(([k, v]) => [...splitK(k), Math.round(v[0])]),
        ...[...a.rows('fbs')].map(([k, v]) => { const [q, ans, lang] = splitK(k); return [q, ans, lang, '', '', Math.round(v[0])]; }),
      ];
      break;
    }
    case 'meses': {
      const c = h.months(), f = h.monthsF();
      const by = new Map();
      for (const r of c) { const m = by.get(r.month) || {}; m[r.k] = r.n; by.set(r.month, m); }
      for (const r of f) { const m = by.get(r.month) || {}; m.S4 = r.n; by.set(r.month, m); }
      header = ['mês', 'visualizações', 'visitas', 'visitantes (soma por dia)', 'com envolvimento', 'saídas rápidas', 'chegaram ao patrocínio', 'pedidos enviados'];
      // the whole archive, whatever the period (it holds whole months only)
      rows = [...by].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([month, m]) => [month, ...['pv', 'visits', 'uv', 'engaged', 'quick', 's0', 'S4'].map((k) => Math.round(m[k] || 0))]);
      break;
    }
    case 'montra': {
      // the showcase, for a brand's monthly report: one row per month and product, a total per brand and month, and
      // the period's total per brand (ids as in data/montra.json; the panel shows the names). P.b (a brand slug): only
      // that brand's rows, and only its own products (ids that start with «<brand>-»), for the file sent to that brand
      const r = h.compute('montra', {});
      const mine = (x) => !P.b || (x.brand === P.b && String(x.prod).startsWith(`${P.b}-`));
      for (const m of r.months) m.rows = m.rows.filter(mine);
      r.months = r.months.filter((m) => m.rows.length);
      r.totals = r.totals.filter(mine);
      if (P.b) name = `gocarmo-montra-${P.b}-${from}-${to}.csv`;
      header = ['mês', 'marca', 'produto', 'cartões vistos', 'cliques na loja', 'códigos copiados'];
      rows = [];
      const sumBy = (list) => {
        const by = new Map();
        for (const x of list) { const b = by.get(x.brand) || { view: 0, shop: 0, code: 0 }; b.view += x.view; b.shop += x.shop; b.code += x.code; by.set(x.brand, b); }
        return [...by];
      };
      for (const m of r.months) {
        for (const x of m.rows) rows.push([m.month, x.brand, x.prod, x.view, x.shop, x.code]);
        for (const [brand, b] of sumBy(m.rows)) rows.push([m.month, brand, 'total da marca', b.view, b.shop, b.code]);
      }
      for (const [brand, b] of sumBy(r.totals)) rows.push([`${from} a ${to}`, brand, 'total do período', b.view, b.shop, b.code]);
      break;
    }
    default: return { error: 'filtro' };
  }
  return { ok: true, csv: toCsv(header, rows), filename: name || `gocarmo-${t}-${from}-${to}.csv` };
}
