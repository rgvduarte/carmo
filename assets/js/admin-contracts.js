// The sponsor contracts of the «Patrocínios» page (admin/patrocinios/): what is due now, the season's calendar, the CSV
// export, the .ics file for the phone's calendar and the content of the «Confirmação de patrocínio» PDF. Pure: no DOM,
// no fetch, no storage and no clock (every function takes the Lisbon day or the moment it works for), so Node tests it.
// The records come from the booking Worker (GET /contratos, KV c:<id>, worker/requests.js); the dates and the price rule
// from season-rules.js. A record's renewal step is stored by hand ('', 'proposta', 'renova', 'nao-renova'); the state
// shown is renewalView(contract, day).
import { TITLE, rulesOf, defaultRules, renewalView, keyDates, daysBetween, addDays, lisbonDay, isDay, seasonBp, pctText, roundHalfUp, SEASON_DIV } from './season-rules.js';

// ---------- words and dates ----------
export const PT_MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PT_MON = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];
const ymd = (day) => String(day || '').split('-').map(Number);
// '15 de janeiro de 2027' / '15 January 2027'
export const ptLong = (day) => { const [y, m, d] = ymd(day); return `${d} de ${PT_MONTHS[m - 1]} de ${y}`; };
export const enLong = (day) => { const [y, m, d] = ymd(day); return `${d} ${EN_MONTHS[m - 1]} ${y}`; };
export const longDate = (day, lang = 'pt') => (lang === 'en' ? enLong(day) : ptLong(day));
// '15 jan.' or '15 jan. 2027' (the admin's short dates, as admin-core fmtDay)
export const ptDay = (day, year = false) => { const [y, m, d] = ymd(day); return `${d} ${PT_MON[m - 1]}${year ? ` ${y}` : ''}`; };
export const monthName = (m, lang = 'pt') => ((lang === 'en' ? EN_MONTHS : PT_MONTHS)[m - 1] || '');
const EUR = { pt: new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' }), en: new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0, useGrouping: 'always' }) };
export const money = (n, lang = 'pt') => EUR[lang === 'en' ? 'en' : 'pt'].format(Number(n) || 0);
const pad2 = (n) => String(n).padStart(2, '0');
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// the state chips (the one-tap buttons are named as actions: renewalActs)
export const RENEWAL = { ativo: 'Antes das propostas', 'a-propor': 'A propor', proposta: 'Proposta enviada', renova: 'Renova', 'nao-renova': 'Não renova', terminado: 'Terminado' };
export const OUTCOME = { renova: 'renovou', 'nao-renova': 'não renovou', 'sem-resposta': 'sem resposta', 'sem-proposta': 'sem proposta' };
export const PAY = { mb: 'MB WAY', tr: 'Transferência', produto: 'Em produto', outro: 'Outra' };
const PAY_EN = { mb: 'MB WAY', tr: 'Bank transfer', produto: 'In kind', outro: 'Other' };
const PAY_PT_LONG = { mb: 'MB WAY', tr: 'Transferência bancária', produto: 'Em produto', outro: 'Outra' };
export const CHANNEL = { whatsapp: 'WhatsApp', email: 'Email', instagram: 'Instagram', site: 'Site', telefone: 'Telefone', pessoal: 'Em pessoa', outro: 'Outro', '': '' };
const LEVELS = { title: { pt: 'Title partner', en: 'Title partner' }, principal: { pt: 'Principal', en: 'Principal' }, oficial: { pt: 'Oficial', en: 'Official' }, fornecedor: { pt: 'Apoio', en: 'Supporter' } };
// a level's name: the tiers of data/spots.json when given, else the names of today's tiers
export function levelName(key, lang = 'pt', data = null) {
  if (!key) return '';
  const t = Array.isArray(data?.tiers) ? data.tiers.find((x) => x.key === key) : null;
  if (t) return (lang === 'en' ? t.en : t.pt) || t.pt || key;
  return (LEVELS[key] || {})[lang === 'en' ? 'en' : 'pt'] || key;
}

// ---------- one contract ----------
export const isTitle = (c) => !!c && (c.title === true || (Array.isArray(c.spots) && c.spots.some((s) => s && s.id === TITLE)));
export const idsOf = (c) => (isTitle(c) ? [TITLE] : (Array.isArray(c?.spots) ? c.spots.map((s) => s && s.id).filter(Boolean) : []));
// the rules of the contract's own season: its stored period and dates, the season's defaults for anything missing. A
// record keeps logoBy, proposalsFrom, renewBy and openFrom; the day of the last triathlon (racesUntil) and the renewal's
// payment deadline (renewPayBy) come from data/spots.json when it is about the contract's season (data), else from the
// season's defaults
export function rulesOfContract(c, data = null) {
  const d = defaultRules(c && c.season), live = data ? rulesOf(data) : null, same = !!live && live.season === String(c?.season ?? '');
  return { ...d, start: c?.period?.start || d.start, end: c?.period?.end || d.end, logoBy: c?.dates?.logoBy || d.logoBy, proposalsFrom: c?.dates?.proposalsFrom || d.proposalsFrom, renewBy: c?.dates?.renewBy || d.renewBy, openFrom: c?.dates?.openFrom || d.openFrom,
    racesUntil: c?.dates?.racesUntil || (same ? live.racesUntil : d.racesUntil), renewPayBy: c?.dates?.renewPayBy || (same ? live.renewPayBy : d.renewPayBy) };
}
// the day that decides whether the logo deadline had passed: for a request of the site, its request day (what the message
// and the comprovativo told the buyer, and the day of its price); for a deal by hand, the payment day
export const logoRef = (c) => (c && c.kind === 'site' && c.price && isDay(c.price.day) ? c.price.day : String(c?.paidAt || ''));
export const logoLate = (c) => { const ref = logoRef(c); return !!ref && ref > rulesOfContract(c).logoBy; };
// the request (or, by hand, the payment) came after the season's last triathlon (season-rules.js noRacesLeft on the logoRef
// day): no race is agreed for the logo; it goes on the site, in the posts and on the suit in training (owner decision E2)
export const noRaces = (c, data = null) => { const ref = logoRef(c), r = rulesOfContract(c, data); return !!ref && ref > r.racesUntil && ref <= r.end; };
// a race still has to be agreed for the logo on the kit: late for the logo deadline, with triathlons still to come
export const needsRace = (c, data = null) => logoLate(c) && !noRaces(c, data);
// the package has the suit (a suit spot or the whole suit); the helmet is not used in training
// the levels with the logo on the training kit (the home page's Principal card, «Tudo o que o Principal … inclui»)
export const TRAINING_KIT = ['principal', 'title'];
// the terms of 29.10.2026 gave Principal and the whole suit of 2027 the 2027 price on renewal; the terms of 30.10.2026
// withdrew it (every level renews at the next rate card). Such a contract's annex still says so, while page 1 of the
// confirmation says the 2028 rate card: the card and the PDF dialog ask to settle it in writing (README «Renovação»)
export const LOCK_TERMS = '2026-10-29';
export const lockedByTerms = (c) => !!c && c.terms === LOCK_TERMS && String(c.season) === '2027' && (isTitle(c) || c.level === 'principal');
// the card's line while the renewal is still open or agreed ('' for every other contract, and once the renewal is lost)
export function lockWarning(c, day) {
  if (!lockedByTerms(c)) return '';
  const v = renewalView(c, day);
  if (v.state === 'nao-renova' || (v.state === 'terminado' && v.outcome !== 'renova')) return '';
  return 'Condições de 29.10.2026: davam a este patrocínio o preço de 2027 na renovação para 2028. Combina-o por escrito antes de enviar a proposta.';
}
export const hasSuit = (c) => isTitle(c) || (Array.isArray(c?.spots) && c.spots.some((s) => s && s.item !== 'helmet'));
// whether the season discount line belongs on the card and in the CSV: only when the amount paid is the table's price
export const paidTable = (c) => !!c && !!c.price && Number.isFinite(Number(c.price.total)) && Number(c.amount) === Number(c.price.total);
// '01 Peito, 21 Topo do capacete', 'Fato completo', or the label of a deal with no spot
export function spotsText(c, { lang = 'pt', data = null } = {}) {
  if (isTitle(c)) return lang === 'en' ? 'Whole suit' : 'Fato completo';
  const xs = Array.isArray(c?.spots) ? c.spots.filter(Boolean).slice().sort((a, b) => (Number(a.n) || 99) - (Number(b.n) || 99)) : [];
  const name = (s) => { const live = lang === 'en' && Array.isArray(data?.spots) ? data.spots.find((x) => x.id === s.id) : null; return (live && live.en && live.en.name) || s.name || s.id; };
  const list = xs.map((s) => `${s.n ? `${pad2(s.n)} ` : ''}${name(s)}`).join(', ');
  return list || c?.label || '';
}
// «Desconto de época (março): −6,25%» (the card), from the price the table asked; '' when there was none
export function seasonText(price) {
  const m = Number(price?.m) || 0;
  if (!(m > 0)) return '';
  return `Desconto de época (${PT_MONTHS[m - 1]}): −${pctText(Number(price.seasonBp) || seasonBp(m))}%`;
}
// «março 6,25%» (the CSV's desconto_epoca cell)
export function seasonCell(price) {
  const m = Number(price?.m) || 0;
  return m > 0 ? `${PT_MONTHS[m - 1]} ${pctText(Number(price.seasonBp) || seasonBp(m))}%` : '';
}
// the days of the contract still to run on Lisbon day `day`: { n, text } (n: days to the last day, 0 on it, -1 after it)
export function daysLeft(c, day) {
  const r = rulesOfContract(c);
  if (day > r.end) return { n: -1, text: 'acabou' };
  if (day < r.start) return { n: daysBetween(day, r.end), text: `começa a ${ptDay(r.start)}` };
  const n = daysBetween(day, r.end);
  return { n, text: n === 0 ? 'último dia' : n === 1 ? 'falta 1 dia' : `faltam ${n} dias` };
}
// the renewal state as shown, with its words: { state, outcome, label }
export function renewalOf(c, day) {
  const v = renewalView(c, day), at = c?.renewal?.at;
  const label = v.state === 'terminado' ? `${RENEWAL.terminado} (${OUTCOME[v.outcome] || OUTCOME['sem-resposta']})`
    : v.state === 'nao-renova' && (v.outcome === 'sem-resposta' || v.outcome === 'sem-proposta') ? `${RENEWAL['nao-renova']} (${OUTCOME[v.outcome]})`
      : v.state === 'proposta' && isDay(at) ? `${RENEWAL.proposta} a ${ptDay(at)}` : RENEWAL[v.state];
  return { ...v, label };
}
// the one-tap steps of a card: [{ state, label }] to send as { action: 'renovacao', state }
export function renewalActs(c, day) {
  const v = renewalView(c, day);
  if (v.state === 'a-propor') return [{ state: 'proposta', label: 'Enviei a proposta' }];
  // (a tap on «Enviei a proposta» by mistake goes back with «Desfazer»)
  if (v.state === 'proposta') return [{ state: 'renova', label: 'Renova' }, { state: 'nao-renova', label: 'Não renova' }, { state: '', label: 'Desfazer' }];
  const stored = c.renewal?.state || '';
  if (stored === 'renova' || stored === 'nao-renova') return v.state === 'terminado' ? [] : [{ state: 'proposta', label: 'Desfazer' }];
  // no answer by the deadline (or no proposal sent): a late yes (or a no) can still be written down until the season ends
  if (v.state === 'nao-renova') return [{ state: 'renova', label: 'Renova' }, { state: 'nao-renova', label: 'Não renova' }];
  return [];
}

// the sponsor said yes to the next season (the stored step, or the outcome once the season is over)
export const renewed = (c, day) => { const v = renewalView(c, day); return v.state === 'renova' || v.outcome === 'renova'; };
// the contract of the next season that pays a renewal: same brand (accents and case do not count), next season, the same
// spots (any of them) or both the whole suit
export function renewalContract(c, contracts) {
  if (!c) return null;
  const next = String(Number(c.season) + 1), ids = idsOf(c), title = isTitle(c);
  return (Array.isArray(contracts) ? contracts : []).find((x) => x && x !== c && x.id !== c.id && String(x.season) === next && sameBrand(x.brand, c.brand)
    && (title ? isTitle(x) : !isTitle(x) && idsOf(x).some((id) => ids.includes(id)))) || null;
}
// the payment of a renewal (owner decision E3): a sponsor who said yes pays the next season by renewPayBy, or the spot is
// free. { state: 'pago', at } when the next season's contract is registered; else { state: 'a-pagar', by } up to
// renewPayBy, then { state: 'em-atraso', since: the day after }. null when the sponsor did not say yes.
export function payState(c, contracts, day, data = null) {
  if (!c || !renewed(c, day)) return null;
  const x = renewalContract(c, contracts), by = rulesOfContract(c, data).renewPayBy;
  if (x) return { state: 'pago', at: String(x.paidAt || ''), by, contract: x.id };
  if (day <= by) return { state: 'a-pagar', by };
  return { state: 'em-atraso', by, since: addDays(by, 1) };
}
// the card's line for it: { kind: 'ok' | 'info' | 'warn' | 'bad', text }, or null
export function payLine(c, contracts, day, data = null) {
  const p = payState(c, contracts, day, data), next = Number(c?.season) + 1;
  if (!p) return null;
  if (p.state === 'pago') return { kind: 'ok', text: `Renovação de ${next} paga${isDay(p.at) ? ` a ${ptDay(p.at, true)}` : ''}` };
  if (p.state === 'a-pagar') return { kind: daysBetween(day, p.by) <= 14 ? 'warn' : 'info', text: `Pagar até ${ptDay(p.by, true)}` };
  return { kind: 'bad', text: `Renovação de ${next} por pagar desde ${ptDay(p.since, true)}: ${isTitle(c) ? 'o fato completo fica livre' : idsOf(c).length > 1 ? 'os espaços ficam livres' : 'o espaço fica livre'}` };
}
// ---------- the list ----------
export const FILTERS = [['todos', 'Todos'], ['ativo', 'Antes das propostas'], ['a-propor', 'A propor'], ['proposta', 'Proposta enviada'], ['renova', 'Renova'], ['nao-renova', 'Não renova'], ['terminado', 'Terminados']];
// f: { state: a FILTERS key, season: '2027' | 'todas', q: words of the brand (accents and case do not count) }
export function filterContracts(list, f = {}, day) {
  const state = f.state || 'todos', season = f.season || 'todas', words = fold(f.q).split(/\s+/).filter(Boolean);
  return (Array.isArray(list) ? list : []).filter((c) => {
    if (!c || typeof c !== 'object') return false;
    if (season !== 'todas' && String(c.season) !== String(season)) return false;
    if (words.length) { const hay = fold(`${c.brand} ${c.label || ''}`); if (!words.every((w) => hay.includes(w))) return false; }
    return state === 'todos' || renewalView(c, day).state === state;
  });
}
// how many contracts each chip would show (with the season and the search applied)
export function filterCounts(list, f = {}, day) {
  const base = filterContracts(list, { ...f, state: 'todos' }, day), out = { todos: base.length };
  for (const [k] of FILTERS.slice(1)) out[k] = 0;
  for (const c of base) { const s = renewalView(c, day).state; out[s] = (out[s] || 0) + 1; }
  return out;
}
// «7 patrocínios · 3 250 € recebidos · 2 a propor · 1 à espera de resposta»
export function summary(list, day) {
  const xs = Array.isArray(list) ? list : [];
  const st = xs.map((c) => renewalView(c, day).state);
  const got = xs.reduce((a, c) => a + (Number(c.amount) || 0), 0);
  const aPropor = st.filter((s) => s === 'a-propor').length, waiting = st.filter((s) => s === 'proposta').length;
  const parts = [`${xs.length} ${xs.length === 1 ? 'patrocínio' : 'patrocínios'}`, `${money(got)} ${got === 1 ? 'recebido' : 'recebidos'}`];
  if (aPropor) parts.push(`${aPropor} a propor`);
  if (waiting) parts.push(`${waiting} à espera de resposta`);
  return { n: xs.length, received: got, aPropor, waiting, text: parts.join(' · ') };
}

// ---------- the season's calendar ----------
export const KEY_LABEL = { inicio: 'Início', logos: 'Logótipos', propostas: 'Propostas', provas: 'Último triatlo', renovacao: 'Renovação', abertos: 'Livres para todos', fim: 'Fim', pagamento: 'Pagamento das renovações' };
const KEY_NOTE = {
  inicio: (r) => `Começa a época ${r.season}.`,
  logos: () => 'Último dia para o logótipo em vetor do fato e do capacete do primeiro triatlo.',
  propostas: (r) => `Começa o envio das propostas de ${Number(r.season) + 1}.`,
  provas: (r) => `O calendário de triatlos de ${r.season} acaba neste dia. A partir de amanhã e até ao fecho dos pedidos, o pedido diz que já não há triatlos com o fato.`,
  renovacao: (r) => `Último dia para cada marca dizer que renova para ${Number(r.season) + 1}.`,
  abertos: () => 'Os espaços que não foram renovados ficam livres para todos.',
  fim: (r) => `Acaba a época ${r.season}.`,
  pagamento: (r) => `Último dia para pagar a renovação de ${Number(r.season) + 1}. Sem o pagamento, o espaço fica livre.`,
};
// [{ key, day, label, date, note, state: 'past' | 'today' | 'next' | 'later', when }]
export function calendar(rules, day) {
  let next = false;
  return keyDates(rules).map((k) => {
    const n = daysBetween(day, k.day);
    let state = n < 0 ? 'past' : n === 0 ? 'today' : 'later';
    if (state === 'later' && !next) { state = 'next'; next = true; }
    if (state === 'today') next = true;
    const when = n < 0 ? 'passou' : n === 0 ? 'hoje' : n === 1 ? 'amanhã' : `faltam ${n} dias`;
    return { key: k.key, day: k.day, label: KEY_LABEL[k.key] || k.key, date: ptDay(k.day, k.day.slice(0, 4) !== String(rules.season)), note: KEY_NOTE[k.key] ? KEY_NOTE[k.key](rules) : '', state, when };
  });
}

// ---------- what is due now ----------
// contracts: GET /contratos; requests: GET /pedidos (or null when not read); data: data/spots.json (or null); rules: the
// season in force (rulesOf(data)); day: today in Lisbon. Returns [{ key, kind: 'warn' | 'info', text, id?, acts:
// [{ op, label, state? }] }] in the order of the season. op: 'logo' (the vector logo arrived), 'renovacao' (with state),
// 'registar' (a confirmed request without a record: confirmar again), 'espacos' (go to /admin/).
const sameBrand = (a, b) => fold(a).trim().replace(/\s+/g, ' ') === fold(b).trim().replace(/\s+/g, ' ');
export function dueNow(contracts, requests, data, rules, day) {
  const out = [], list = (Array.isArray(contracts) ? contracts : []).filter((c) => c && typeof c === 'object');
  const live = (c) => day <= rulesOfContract(c).end;
  const add = (x) => out.push({ acts: [], ...x });

  // a request confirmed (paid) with no record: the same confirmar call creates it
  for (const r of Array.isArray(requests) ? requests : []) {
    if (!r || r.status !== 'confirmado') continue;
    if (list.some((c) => c.id === r.id || (c.request && c.request === r.id))) continue;
    add({ key: `registar:${r.id}`, kind: 'warn', id: r.id, text: `Pedido confirmado sem registo: ${r.brand || 'sem marca'} (pedido ${r.id})`, acts: [{ op: 'registar', label: 'Registar' }], request: r });
  }

  // the vector logo for the printed suit and helmet: up to the season's deadline, and for a sponsor whose request (or, by
  // hand, payment) came after it (logoLate), in the 30 days after the payment (its logo goes on the kit from a race agreed
  // before the payment); the card keeps saying it after. Such a sponsor with no race written down: agree it and write it.
  for (const c of list) {
    if (!live(c) || (!idsOf(c).length && !isTitle(c))) continue;
    const r = rulesOfContract(c, data), late = logoLate(c), race = String(c.logo?.fromRace || ''), none = noRaces(c, data);
    // (after the season's last triathlon no race is agreed: the logo goes on the suit in training)
    if (late && !race && !none) add({ key: `prova:${c.id}`, kind: 'warn', id: c.id, text: `Falta combinar a prova do logótipo: ${c.brand}`, acts: [{ op: 'editar', label: 'Editar' }] });
    if (c.logo?.vector === true) continue;
    if (!(day <= r.logoBy || (late && day <= addDays(c.paidAt, 30)))) continue;
    if (none && !hasSuit(c)) continue;   // the helmet alone, with no triathlon left: nothing to print this season
    const when = day <= r.logoBy && !late ? `prazo ${ptDay(r.logoBy, r.logoBy.slice(0, 4) !== day.slice(0, 4))}` : race ? `para o equipamento da prova: ${race}` : none ? 'para o fato, nos treinos' : 'para o equipamento';
    add({ key: `logo:${c.id}`, kind: day <= r.logoBy && !late && daysBetween(day, r.logoBy) <= 7 ? 'warn' : 'info', id: c.id, text: `Falta o logótipo em vetor: ${c.brand} (${when})`, acts: [{ op: 'logo', label: 'Recebido' }] });
  }

  // the site against the records: spots sold without a logo, and contracts whose spots the site does not show as theirs
  if (data && Array.isArray(data.spots)) {
    const noLogo = new Map();
    for (const x of [...data.spots, data.title ? { ...data.title, id: TITLE } : null]) {
      if (!x || x.status !== 'sold' || x.logo) continue;
      const b = x.brand || 'sem marca';
      if (!noLogo.has(b)) noLogo.set(b, []);
      noLogo.get(b).push(x.id === TITLE ? 'Fato completo' : `${pad2(x.n)} ${x.pt?.name || x.id}`);
    }
    for (const [b, names] of noLogo) add({ key: `site-logo:${b}`, kind: 'info', text: `Sem logótipo no site: ${b} (${names.join(', ')})`, acts: [{ op: 'espacos', label: 'Abrir Espaços' }] });
    const season = rulesOf(data).season;
    for (const c of list) {
      if (String(c.season) !== season || !live(c) || renewalView(c, day).state === 'nao-renova') continue;
      for (const id of idsOf(c)) {
        const x = id === TITLE ? data.title : data.spots.find((s) => s.id === id);
        if (!x) { add({ key: `site:${c.id}:${id}`, kind: 'warn', id: c.id, text: `O espaço ${id} de ${c.brand} já não existe no site.` }); continue; }
        if (x.status === 'sold' && sameBrand(x.brand, c.brand)) continue;
        const label = id === TITLE ? 'o fato completo' : `o ${pad2(x.n)} ${x.pt?.name || id}`;
        add({ key: `site:${c.id}:${id}`, kind: 'warn', id: c.id, text: `No site, ${label} não está vendido a ${c.brand}${x.status === 'sold' && x.brand ? ` (está vendido a ${x.brand})` : ''}.`, acts: [{ op: 'espacos', label: 'Abrir Espaços' }] });
      }
    }
  }

  // the renewal: proposals to send, answers missing near the deadline, spots to free once it has passed
  for (const c of list) {
    const r = rulesOfContract(c), v = renewalView(c, day), next = Number(c.season) + 1;
    if (v.state === 'a-propor' && day >= r.proposalsFrom && day <= r.renewBy) {
      const near = daysBetween(day, r.renewBy) <= 14;
      add({ key: `propor:${c.id}`, kind: near ? 'warn' : 'info', id: c.id, text: near ? `Proposta ${next} ainda por enviar: ${c.brand}, prazo ${ptDay(r.renewBy)}` : `Enviar proposta ${next}: ${c.brand}`, acts: [{ op: 'renovacao', state: 'proposta', label: 'Enviei a proposta' }] });
    }
    if (v.state === 'proposta' && day >= addDays(r.renewBy, -14) && day <= r.renewBy) {
      add({ key: `resposta:${c.id}`, kind: 'warn', id: c.id, text: `Falta resposta (até ${ptDay(r.renewBy)}): ${c.brand}`, acts: [{ op: 'renovacao', state: 'renova', label: 'Renova' }, { op: 'renovacao', state: 'nao-renova', label: 'Não renova' }] });
    }
    if (v.state === 'nao-renova' && day >= r.openFrom && day <= r.end) {
      // only while the site still shows the spots as the brand's (or when the site is not known)
      const ids = idsOf(c);
      const held = !data || !Array.isArray(data.spots) ? ids : ids.filter((id) => { const x = id === TITLE ? data.title : data.spots.find((s) => s.id === id); return x && x.status !== 'available' && sameBrand(x.brand, c.brand); });
      if (held.length) add({ key: `libertar:${c.id}`, kind: 'info', id: c.id, text: `Libertar para ${next}: ${c.brand}, ${spotsText({ ...c, spots: (c.spots || []).filter((s) => held.includes(s.id)) })}`, acts: [{ op: 'espacos', label: 'Abrir Espaços' }] });
    }
  }

  // the renewal's payment (owner decision E3): from openFrom, each sponsor who said yes and has no contract of the next
  // season yet; after renewPayBy, the spot is free: free it in Espaços (while the site still shows it as the brand's)
  for (const c of list) {
    const r = rulesOfContract(c, data), next = Number(c.season) + 1;
    if (day < r.openFrom) continue;
    const p = payState(c, list, day, data);
    if (!p || p.state === 'pago') continue;
    const what = spotsText(c), tag = `${c.brand}${what ? ` (${what})` : ''}`;
    if (p.state === 'a-pagar') { add({ key: `pagar:${c.id}`, kind: daysBetween(day, p.by) <= 14 ? 'warn' : 'info', id: c.id, text: `Renovação de ${next} por pagar: ${tag}, até ${ptDay(p.by)}` }); continue; }
    if (day > `${next}-12-31`) continue;
    const ids = idsOf(c);
    const held = !data || !Array.isArray(data.spots) ? ids : ids.filter((id) => { const x = id === TITLE ? data.title : data.spots.find((s) => s.id === id); return x && x.status !== 'available' && sameBrand(x.brand, c.brand); });
    if (held.length) add({ key: `nao-pago:${c.id}`, kind: 'warn', id: c.id, text: `Renovação de ${next} não paga: ${c.brand}. Liberta ${isTitle(c) ? 'o fato completo' : held.length > 1 ? 'os espaços' : 'o espaço'} em Espaços.`, acts: [{ op: 'espacos', label: 'Abrir Espaços' }] });
  }

  // the end of the season
  const ending = list.filter((c) => { const r = rulesOfContract(c); return day <= r.end && day >= addDays(r.end, -30); });
  if (ending.length) {
    const end = rulesOfContract(ending[0]).end;
    add({ key: 'fim', kind: 'info', text: `Contratos a acabar a ${ptDay(end)}: ${ending.length}` });
  }
  return out;
}

// ---------- CSV (Excel in Portuguese: UTF-8 with BOM, «;», CRLF) ----------
export const CSV_COLS = ['id', 'epoca', 'marca', 'nivel', 'espacos', 'montante', 'desconto_epoca', 'pago_a', 'forma', 'inicio', 'fim', 'dias_restantes', 'renovacao', 'prazo_logotipo', 'logotipo_vetor', 'contacto', 'canal', 'email', 'telefone', 'conta', 'nif', 'pedido', 'notas'];
// every cell quoted, «"» doubled; a cell that a spreadsheet would take for a formula starts with «'»
export function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
export function csvRow(c, day, data = null) {
  const r = rulesOfContract(c), left = daysLeft(c, day);
  const pay = c.pay === 'produto' && c.inKind ? `${PAY.produto}: ${c.inKind}` : PAY[c.pay] || '';
  // (the season discount only when the amount is the table's price: a negotiated or in-kind deal had none)
  return [c.id, c.season, c.brand, levelName(c.level, 'pt', data), spotsText(c), Number(c.amount) || 0, paidTable(c) ? seasonCell(c.price) : '', c.paidAt || '', pay, r.start, r.end,
    Math.max(0, left.n), renewalOf(c, day).label, r.logoBy, c.logo?.vector ? 'sim' : 'não', c.contact?.name || '', CHANNEL[c.contact?.channel || ''] || c.contact?.channel || '',
    c.contact?.email || '', c.contact?.phone || '', c.contact?.handle || '', c.nif || '', c.request || '', c.notes || ''];
}
export function toCsv(contracts, day, data = null) {
  const lines = [CSV_COLS, ...(Array.isArray(contracts) ? contracts : []).map((c) => csvRow(c, day, data))].map((row) => row.map(csvCell).join(';'));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
export const csvName = (season, day) => `gocarmo-patrocinios-${season && season !== 'todas' ? season : 'todas'}-${String(day).replace(/-/g, '')}.csv`;

// ---------- .ics (RFC 5545), for the phone's calendar ----------
// only brand and spot names go in it: no contact, no NIF, no amount
export const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
// a content line folded at 75 octets (UTF-8), never inside a character; each continuation starts with one space
export function icsFold(line) {
  const enc = new TextEncoder(), out = [];
  let cur = '', size = 0, max = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (size + n > max) { out.push(cur); cur = ' '; size = 1; max = 75; }
    cur += ch; size += n;
  }
  out.push(cur);
  return out.join('\r\n');
}
const icsDate = (day) => day.replace(/-/g, '');
const icsStamp = (now) => new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function icsEvent({ uid, day, summary, description, stamp, alarms }) {
  const lines = ['BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${icsDate(day)}`, `DTEND;VALUE=DATE:${icsDate(addDays(day, 1))}`,
    `SUMMARY:${icsText(summary)}`, ...(description ? [`DESCRIPTION:${icsText(description)}`] : []), 'TRANSP:TRANSPARENT'];
  for (const trigger of alarms) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(summary)}`, `TRIGGER;RELATED=START:${trigger}`, 'END:VALARM');
  lines.push('END:VEVENT');
  return lines;
}
export const icsName = (season) => `gocarmo-patrocinios-${season}.ics`;
// the season's key dates and one reminder per sponsor of that season: the proposal still to send (on proposalsFrom, or,
// exported from that day on, the next day, so its 9:00 alarm is still ahead; never after renewBy), the answer still
// to come for a proposal sent (a week before renewBy, or the next day when that is past), and the payment of a renewal
// still to come (a week before renewPayBy, or the next day; never after renewPayBy). now: the moment (Date or ms) of
// the export.
export function toIcs(contracts, rules, now) {
  const ms = now instanceof Date ? now.getTime() : Number(now);
  const stamp = icsStamp(ms), y = rules.season, next = Number(y) + 1, day = lisbonDay(ms);
  const AT9 = 'PT9H', WEEK = '-P6DT15H';   // 9:00 on the day; 9:00 a week before
  const ev = [
    { key: 'logos', summary: 'Logótipos em vetor: prazo', description: `Último dia para o logótipo em vetor de cada marca, para o fato e o capacete do primeiro triatlo da época ${y}.` },
    { key: 'propostas', summary: `Propostas ${next}: começar`, description: `A partir de hoje, envia a cada patrocinador a proposta de ${next} para o mesmo espaço. Resposta até ${ptLong(rules.renewBy)}.` },
    { key: 'renovacao', summary: 'Renovações: último dia', description: `Último dia para cada patrocinador dizer que renova para ${next}. A partir de ${ptLong(rules.openFrom)}, os espaços não renovados ficam livres.`, week: true },
    { key: 'abertos', summary: 'Espaços não renovados livres', description: `Os espaços que não foram renovados para ${next} ficam livres para todos. Liberta-os em Espaços.` },
    { key: 'fim', summary: `Fim da época ${y}`, description: `Acaba a época ${y}.` },
    { key: 'pagamento', summary: `Renovações ${next}: último dia de pagamento`, description: `Último dia para os patrocinadores que renovaram pagarem a época ${next}. Sem o pagamento, o espaço fica livre a partir de ${ptLong(addDays(rules.renewPayBy, 1))}: liberta-o em Espaços.`, week: true },
  ];
  const at = Object.fromEntries(keyDates(rules).map((k) => [k.key, k.day]));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//gocarmo.com//Patrocinios//PT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${icsText(`GOCARMO patrocínios ${y}`)}`];
  for (const e of ev) lines.push(...icsEvent({ uid: `gocarmo-${y}-${e.key}@gocarmo.com`, day: at[e.key], summary: e.summary, description: e.description, stamp, alarms: e.week ? [AT9, WEEK] : [AT9] }));
  const tomorrow = addDays(day, 1), later = (d) => (d > day ? d : tomorrow);
  const min = (a, b) => (a < b ? a : b);
  const onPropose = min(later(rules.proposalsFrom), rules.renewBy), onAnswer = min(later(addDays(rules.renewBy, -7)), rules.renewBy);
  const onPay = min(later(addDays(rules.renewPayBy, -7)), rules.renewPayBy);
  if (day <= rules.renewPayBy) {
    for (const c of Array.isArray(contracts) ? contracts : []) {
      if (!c || String(c.season) !== String(y)) continue;
      const st = renewalView(c, day).state, what = spotsText(c), tag = `${c.brand}${what ? ` (${what})` : ''}`;
      const p = payState(c, contracts, day);
      if (p && p.state === 'a-pagar') {
        lines.push(...icsEvent({ uid: `gocarmo-${y}-p-${c.id}@gocarmo.com`, day: onPay, summary: `Pagamento ${next}: ${tag} (até ${ptDay(rules.renewPayBy)})`,
          description: `Renovou para ${next}. Falta o pagamento, até ${ptLong(rules.renewPayBy)}; sem ele, o espaço fica livre.`, stamp, alarms: [AT9] }));
        continue;
      }
      if (day > rules.renewBy) continue;
      if (st === 'ativo' || st === 'a-propor') {
        lines.push(...icsEvent({ uid: `gocarmo-${y}-c-${c.id}@gocarmo.com`, day: onPropose, summary: `Proposta ${next}: ${tag}`,
          description: `Envia a proposta de ${next} para o mesmo espaço. Resposta até ${ptLong(rules.renewBy)}.`, stamp, alarms: [AT9] }));
      } else if (st === 'proposta') {
        lines.push(...icsEvent({ uid: `gocarmo-${y}-r-${c.id}@gocarmo.com`, day: onAnswer, summary: `Resposta ${next}: ${tag} (até ${ptDay(rules.renewBy)})`,
          description: `A proposta de ${next} foi enviada. Falta a resposta, até ${ptLong(rules.renewBy)}.`, stamp, alarms: [AT9] }));
      }
    }
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(icsFold).join('\r\n')}\r\n`;
}

// ---------- the «Confirmação de patrocínio» (the PDF Gonçalo sends after the payment) ----------
// The rows of the price follow the comprovativo (i18n.js cl.seasonrow, cl.save): the mid-season discount, then the bundle
// discount, then the amount. They are shown only when the amount paid is the price the table asked (price.total); a
// negotiated or in-kind deal shows only what was paid.
const L = {
  pt: {
    title: 'Confirmação de patrocínio', doc: (b) => `Confirmação de patrocínio · ${b}`, file: 'confirmacao',
    seasonH: (y) => `Patrocinador da época ${y}`, thanks: (b) => `Obrigado, ${b}. O patrocínio está confirmado.`,
    brand: 'Marca', level: 'Nível', period: 'Período', periodV: (r) => `Época ${r.season}, de ${ptLong(r.start).replace(/ de \d{4}$/, '')} a ${ptLong(r.end)}`,
    paidAt: 'Pago a', agreedAt: 'Combinado a', pay: 'Pagamento', nif: 'NIF', ref: 'Registo',
    cols: ['Espaço', 'Equipamento', 'Preço'], suit: 'Fato', helmet: 'Capacete', whole: 'Fato completo (Title partner)',
    seasonRow: (m, bp) => `Desconto de época (${PT_MONTHS[m - 1]}, −${pctText(bp, ',')}%)`, bundleRow: (p) => `Desconto de pacote (−${p}%)`, paid: 'Montante pago',
    nextH: 'Prazos e renovação',
    // (soon: a contract of the next season, paid while this one runs; its spots are this season's sponsors' until it ends)
    logoOpen: (r, got, soon) => `${soon ? `O logótipo entra no site e nas minhas publicações a ${ptLong(r.start)}, no início da época.` : 'O logótipo entra no site e nas minhas publicações a partir de agora.'} Para o equipamento, o logótipo em vetor (SVG, PDF, AI ou EPS) tem prazo até ${ptLong(r.logoBy)}; se chegar até lá, conto tê-lo no equipamento do primeiro triatlo.${got ? ' Já o recebi.' : ''}`,
    logoLate: (race, got) => `O logótipo entra no site e nas minhas publicações a partir de agora e, no equipamento, a partir ${race ? `desta prova, combinada antes do pagamento: ${race}` : 'da prova que combinarmos'}.${got ? ' Já recebi o logótipo em vetor.' : ' Para a produção, envia-me o logótipo em vetor (SVG, PDF, AI ou EPS).'}`,
    // (no triathlon left in the season after the request: the logo goes on the site, the posts and, on the suit, in
    // training; from Principal up also on the training kit)
    logoNoRaces: (r, suit, kit, got) => `O logótipo entra no site e nas minhas publicações a partir de agora${suit ? `, e no fato, nos treinos${kit ? ', e no equipamento de treino' : ''}` : ''}: em ${r.season} já não há triatlos depois do teu pedido.${suit && !got ? ' Para a produção, envia-me o logótipo em vetor (SVG, PDF, AI ou EPS).' : suit && got ? ' Já recebi o logótipo em vetor.' : ''}`,
    // when: 'before' proposalsFrom (the general calendar), 'late' (from proposalsFrom to renewBy: the proposal goes with
    // the payment confirmation), 'after' renewBy (only a deal by hand gets here). Every level renews at the next season's
    // rate card and pays the renewal by renewPayBy
    renew: (r, w, when) => {
      const y = Number(r.season) + 1;
      const head = `Renovação: tens preferência ${w[0]} em ${y}, ao preço da tabela de ${y}.`;
      const pay = ` Se renovares, pagas até ${ptLong(r.renewPayBy)}; sem o pagamento, ${w[2]} a partir de ${ptLong(addDays(r.renewPayBy, 1))}.`;
      if (when === 'after') return `${head} A proposta de ${y} segue à parte.${pay}`;
      const how = when === 'late' ? ` Como entras a partir de ${ptLong(r.proposalsFrom)}, envio-te a proposta com a confirmação do pagamento; tens até ${ptLong(r.renewBy)} para me dizer que sim.`
        : ` Envio-te a proposta a partir de ${ptLong(r.proposalsFrom)}; se me disseres que sim até ${ptLong(r.renewBy)}, ${w[1]}.`;
      return `${head}${how} A partir de ${ptLong(r.openFrom)}, o que não for renovado fica livre para todos.${pay}`;
    },
    renewWhat: { one: ['no mesmo espaço', 'o espaço continua teu', 'o espaço fica livre'], many: ['nos mesmos espaços', 'os espaços continuam teus', 'os espaços ficam livres'], title: ['no fato completo', 'o fato completo continua teu', 'o fato completo fica livre'], none: ['na renovação', 'o patrocínio continua', 'o patrocínio acaba'] },
    terms: (d) => `As condições do patrocínio estão em gocarmo.com/condicoes${d ? ` (atualizadas a ${ptLong(d)})` : ''}.`,
    ct: 'Contacto', foot: 'Esta confirmação não é uma fatura nem um recibo. O recibo de donativo segue à parte.',
    pays: PAY_PT_LONG, inKind: (x) => `Em produto: ${x}`, inKindTotal: ['Pagamento', 'Em produto'],
  },
  en: {
    title: 'Sponsorship confirmation', doc: (b) => `Sponsorship confirmation · ${b}`, file: 'confirmation',
    seasonH: (y) => `${y} season sponsor`, thanks: (b) => `Thank you, ${b}. The sponsorship is confirmed.`,
    brand: 'Brand', level: 'Level', period: 'Period', periodV: (r) => `${r.season} season, ${enLong(r.start).replace(/ \d{4}$/, '')} to ${enLong(r.end)}`,
    paidAt: 'Paid on', agreedAt: 'Agreed on', pay: 'Payment', nif: 'Tax number (NIF)', ref: 'Record',
    cols: ['Spot', 'Kit', 'Price'], suit: 'Suit', helmet: 'Helmet', whole: 'Whole suit (Title partner)',
    seasonRow: (m, bp) => `Mid-season discount (${EN_MONTHS[m - 1]}, −${pctText(bp, '.')}%)`, bundleRow: (p) => `Bundle discount (−${p}%)`, paid: 'Amount paid',
    nextH: 'Deadlines and renewal',
    logoOpen: (r, got, soon) => `${soon ? `Your logo goes on the site and in my posts on ${enLong(r.start)}, when the season starts.` : 'Your logo goes on the site and in my posts from now on.'} For the kit, the vector logo (SVG, PDF, AI or EPS) is due by ${enLong(r.logoBy)}; if it arrives by then, I expect it to be on the kit for the first triathlon.${got ? ' I already have it.' : ''}`,
    logoLate: (race, got) => `Your logo goes on the site and in my posts from now on, and on the kit from ${race ? `this race, agreed before the payment: ${race}` : 'the race we agree on'}.${got ? ' I already have the vector logo.' : ' For production, send me the logo as a vector file (SVG, PDF, AI or EPS).'}`,
    logoNoRaces: (r, suit, kit, got) => `Your logo goes on the site and in my posts from now on${suit ? `, and on the suit in training${kit ? ', and on the training kit' : ''}` : ''}: there are no more triathlons in ${r.season} after your request.${suit && !got ? ' For production, send me the logo as a vector file (SVG, PDF, AI or EPS).' : suit && got ? ' I already have the vector logo.' : ''}`,
    renew: (r, w, when) => {
      const y = Number(r.season) + 1;
      const head = `Renewal: you have first option ${w[0]} in ${y}, at the ${y} rate card price.`;
      const pay = ` If you renew, you pay by ${enLong(r.renewPayBy)}; without the payment, ${w[2]} from ${enLong(addDays(r.renewPayBy, 1))}.`;
      if (when === 'after') return `${head} The ${y} proposal follows separately.${pay}`;
      const how = when === 'late' ? ` As you join from ${enLong(r.proposalsFrom)}, I send you the proposal with the payment confirmation; you have until ${enLong(r.renewBy)} to say yes.`
        : ` I send you the proposal from ${enLong(r.proposalsFrom)}; if you say yes by ${enLong(r.renewBy)}, ${w[1]}.`;
      return `${head}${how} From ${enLong(r.openFrom)}, anything not renewed is open to everyone.${pay}`;
    },
    renewWhat: { one: ['on the same spot', 'the spot stays yours', 'the spot is open to anyone'], many: ['on the same spots', 'the spots stay yours', 'the spots are open to anyone'], title: ['on the whole suit', 'the whole suit stays yours', 'the whole suit is open to anyone'], none: ['on renewal', 'the sponsorship carries on', 'the sponsorship ends'] },
    terms: (d) => `The sponsorship terms are at gocarmo.com/condicoes${d ? ` (updated ${enLong(d)})` : ''}.`,
    ct: 'Contact', foot: 'This confirmation is not an invoice or a receipt. The donation receipt is sent separately.',
    pays: PAY_EN, inKind: (x) => `In kind: ${x}`, inKindTotal: ['Payment', 'In kind'],
  },
};
const slug = (s) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'marca';
export const TERMS_URL = 'https://gocarmo.com/condicoes/';
// the price rows of a contract, from what the table asked (price: { gross, m, seasonBp, discPct, total }); null when
// the amount paid is not that price, or there is no price
export function priceRows(c, lang = 'pt') {
  const p = c && c.price, w = L[lang === 'en' ? 'en' : 'pt'];
  if (!p || !Number.isFinite(Number(p.gross)) || Number(c.amount) !== Number(p.total)) return null;
  const gross = Number(p.gross), m = Number(p.m) || 0, disc = Number(p.discPct) || 0;
  const after = roundHalfUp(gross * (SEASON_DIV - m), SEASON_DIV), net = roundHalfUp(gross * (SEASON_DIV - m) * (100 - disc), SEASON_DIV * 100);
  if (net !== Number(p.total)) return null;   // a record whose numbers do not add up shows only what was paid
  return {
    season: m > 0 ? [w.seasonRow(m, Number(p.seasonBp) || seasonBp(m)), `−${money(gross - after, lang)}`] : null,
    disc: disc > 0 ? [w.bundleRow(disc), `−${money(after - net, lang)}`] : null,
  };
}
// the model the PDF lays out (admin-confirm-pdf.js). opts.data: data/spots.json, for the spots' English names, the
// tier names and the season the site runs now; opts.site: { name, email, whatsapp } of SITE.
export function confirmationModel(c, lang = 'pt', { data = null, site = {} } = {}) {
  const lg = lang === 'en' ? 'en' : 'pt', w = L[lg], r = { ...rulesOfContract(c, data), season: String(c.season) };
  const brand = String(c.brand || '');
  const title = isTitle(c);
  const live = (id) => (Array.isArray(data?.spots) ? data.spots.find((x) => x.id === id) : null);
  const items = title ? [{ n: '', name: w.whole, model: w.suit, price: money((c.spots || []).find((s) => s.id === TITLE)?.price ?? c.price?.gross ?? 0, lg) }]
    : (c.spots || []).filter(Boolean).slice().sort((a, b) => (Number(a.n) || 99) - (Number(b.n) || 99)).map((s) => ({ n: s.n ? pad2(s.n) : '', name: (lg === 'en' && live(s.id)?.en?.name) || s.name || s.id, model: s.item === 'helmet' ? w.helmet : w.suit, price: money(s.price, lg) }));
  if (!items.length && c.label) items.push({ n: '', name: c.label, model: '', price: '' });
  const rows = priceRows(c, lg);
  // paid in kind (nothing in money): «Combinado a», and the total row says «Em produto», never «Montante pago 0 €»
  const kind = c.pay === 'produto' && !(Number(c.amount) > 0);
  const pay = c.pay === 'produto' && c.inKind ? w.inKind(c.inKind) : w.pays[c.pay] || '';
  const info = [[w.brand, brand], [w.level, levelName(c.level, lg, data)], [w.period, w.periodV(r)], [kind ? w.agreedAt : w.paidAt, c.paidAt ? longDate(c.paidAt, lg) : ''], [w.pay, pay]];
  if (c.nif) info.push([w.nif, c.nif]);
  info.push([w.ref, String(c.id || '')]);
  const ids = idsOf(c), what = title ? w.renewWhat.title : ids.length > 1 ? w.renewWhat.many : ids.length === 1 ? w.renewWhat.one : w.renewWhat.none;
  // the logo: after the deadline from the day that decided it (the request day of a site request: logoLate); a contract
  // of a season that has not started, paid while the site still runs another one, goes on the site when its season starts
  const late = logoLate(c), siteSeason = data ? rulesOf(data).season : '';
  const soon = !!siteSeason && !!c.paidAt && c.paidAt < r.start && siteSeason !== String(c.season);
  // the renewal text by the day the sponsor joined (the payment day): from proposalsFrom the proposal goes with the
  // payment confirmation (this document), after renewBy it follows separately. (Not the day the PDF is made: a sponsor
  // since March whose PDF is made again in September did not «join from 1 September».)
  const ref = isDay(c.paidAt) ? c.paidAt : '';
  const when = ref && ref > r.renewBy ? 'after' : ref && ref >= r.proposalsFrom ? 'late' : 'before';
  const got = c.logo?.vector === true, logo = late && noRaces(c, data) && !c.logo?.fromRace ? w.logoNoRaces(r, hasSuit(c), TRAINING_KIT.includes(c.level) || isTitle(c), got)
    : late ? w.logoLate(c.logo?.fromRace || '', got) : w.logoOpen(r, got, soon);
  const next = [logo, w.renew(r, what, when), w.terms(c.terms || '')];
  const wa = site.whatsapp ? String(site.whatsapp).replace(/^(\d{3})(\d{3})(\d{3})(\d{3})$/, '+$1 $2 $3 $4') : '+351 916 395 103';
  return {
    lang: lg, file: `gocarmo-${w.file}-${slug(brand)}-${c.season}.pdf`, docTitle: `${w.doc(brand)} · ${site.name || 'Gonçalo Carmo'}`,
    head: { name: site.name || 'Gonçalo Carmo', site: 'gocarmo.com' },
    title: w.title, box: { k: w.seasonH(c.season), h: w.thanks(brand) },
    rows: info.filter(([, v]) => v), cols: w.cols, items,
    season: rows ? rows.season : null, disc: rows ? rows.disc : null, total: kind ? w.inKindTotal : [w.paid, money(c.amount, lg)],
    next: { h: w.nextH, items: next }, link: { text: 'gocarmo.com/condicoes', uri: TERMS_URL },
    contact: [w.ct, `WhatsApp ${wa} · ${site.email || 'allez@gocarmo.com'}`], foot: w.foot,
  };
}
