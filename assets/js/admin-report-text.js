// The words of the «Relatório PDF» (/admin/analytics/): every sentence the report prints, in Portuguese and English,
// the number and date formats of each language, and the words it must never use. Pure: no DOM, no fetch, no clock, so
// Node tests it. admin-report-model.js fills these in; admin-report-pdf.js only lays them out.
//
// Data honesty (hard rule): the site's counter has no cookies and its visitor code changes every day, so the report
// counts visits, page views and visitors per day (an average), never people over a month. FORBIDDEN lists the words
// that would claim more; NO_FUNNEL the booking funnel, which never goes into a report for a brand. lint() finds them.

export const LANGS = ['pt', 'en'];

// ---------- forbidden words (whole words, any case, accents as written) ----------
export const FORBIDDEN = {
  pt: ['alcance', 'alcances', 'único', 'única', 'únicos', 'únicas', 'pessoa', 'pessoas', 'utilizador', 'utilizadores', 'audiência', 'audiências'],
  en: ['reach', 'reaches', 'reached', 'unique', 'uniques', 'user', 'users', 'people', 'person', 'persons', 'audience', 'audiences', 'impression', 'impressions'],
};
export const NO_FUNNEL = {
  pt: ['pedido', 'pedidos', 'funil', 'reserva', 'reservas'],
  en: ['request', 'requests', 'funnel', 'booking', 'bookings'],
};
const wordRe = (words) => new RegExp(`(?<![\\p{L}\\p{N}])(${words.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
const ALL_BAD = wordRe([...FORBIDDEN.pt, ...FORBIDDEN.en, ...NO_FUNNEL.pt, ...NO_FUNNEL.en]);
// lint(strings) -> [{ s, word, why }]: forbidden words, the funnel, em dashes and exclamation marks
export function lint(strings) {
  const out = [];
  for (const s of strings) {
    const str = String(s ?? '');
    const m = ALL_BAD.exec(str);
    if (m) out.push({ s: str, word: m[1], why: 'palavra' });
    if (/[—―]/.test(str)) out.push({ s: str, word: '—', why: 'travessão' });
    if (/[!¡]/.test(str)) out.push({ s: str, word: '!', why: 'exclamação' });
  }
  return out;
}

// ---------- numbers and dates ----------
const MON = {
  pt: ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
};
const MON3 = {
  pt: ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};
const parts = (d) => { const [y, m, dd] = String(d).split('-').map(Number); return { y, m, d: dd }; };

export function fmt(lang) {
  const L = lang === 'en' ? 'en' : 'pt';
  const nf = new Intl.NumberFormat(L === 'en' ? 'en-GB' : 'pt-PT', { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat(L === 'en' ? 'en-GB' : 'pt-PT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const int = (v) => nf.format(Math.round(Number(v) || 0));
  const dec1 = (v) => nf1.format(Number(v) || 0).replace(/[.,]0$/, '');
  // a share 0..1 as a whole percent; a share above 0 that rounds to 0 is «<1%» (never a 0 that hides something)
  const pct = (r) => { const v = Number(r) || 0; if (v > 0 && v < 0.005) return '<1%'; return `${Math.round(v * 100)}%`; };
  const signed = (r) => { const v = Math.round((Number(r) || 0) * 100); return `${v > 0 ? '+' : v < 0 ? '-' : ''}${Math.abs(v)}%`; };
  // seconds: «45 s», «1,5 min», «12 min»
  const dur = (s) => {
    if (s === null || s === undefined || !Number.isFinite(Number(s))) return '-';
    const v = Number(s);
    if (v < 60) return `${Math.round(v)} s`;
    const m = v / 60;
    return `${m < 10 ? dec1(Math.round(m * 10) / 10) : int(m)} min`;
  };
  const day = (d) => { const p = parts(d); return L === 'en' ? `${p.d} ${MON3.en[p.m - 1]} ${p.y}` : `${p.d} ${MON3.pt[p.m - 1]} ${p.y}`; };
  const dayShort = (d) => { const p = parts(d); return L === 'en' ? `${p.d} ${MON3.en[p.m - 1]}` : `${p.d} ${MON3.pt[p.m - 1]}`; };
  const month = (ym) => { const p = parts(`${ym}-01`); return L === 'en' ? `${MON.en[p.m - 1]} ${p.y}` : `${MON.pt[p.m - 1]} de ${p.y}`; };
  const monthName = (ym) => MON[L][parts(`${ym}-01`).m - 1];
  const mon3 = (ym, withYear = false) => { const p = parts(`${ym}-01`); return withYear ? `${MON3[L][p.m - 1]} ${p.y}` : MON3[L][p.m - 1]; };
  // «1 a 31 de março de 2027», «28 de fevereiro a 3 de março de 2027», «30 de dezembro de 2026 a 2 de janeiro de 2027»
  // EN «1 to 31 March 2027», «28 February to 3 March 2027», «30 December 2026 to 2 January 2027»
  const range = (from, to) => {
    const a = parts(from), b = parts(to);
    if (L === 'en') {
      if (from === to) return `${a.d} ${MON.en[a.m - 1]} ${a.y}`;
      if (a.y !== b.y) return `${a.d} ${MON.en[a.m - 1]} ${a.y} to ${b.d} ${MON.en[b.m - 1]} ${b.y}`;
      if (a.m !== b.m) return `${a.d} ${MON.en[a.m - 1]} to ${b.d} ${MON.en[b.m - 1]} ${b.y}`;
      return `${a.d} to ${b.d} ${MON.en[b.m - 1]} ${b.y}`;
    }
    if (from === to) return `${a.d} de ${MON.pt[a.m - 1]} de ${a.y}`;
    if (a.y !== b.y) return `${a.d} de ${MON.pt[a.m - 1]} de ${a.y} a ${b.d} de ${MON.pt[b.m - 1]} de ${b.y}`;
    if (a.m !== b.m) return `${a.d} de ${MON.pt[a.m - 1]} a ${b.d} de ${MON.pt[b.m - 1]} de ${b.y}`;
    return `${a.d} a ${b.d} de ${MON.pt[b.m - 1]} de ${b.y}`;
  };
  return { lang: L, int, dec1, pct, signed, dur, day, dayShort, month, monthName, mon3, range };
}

// countries: Intl.DisplayNames in the report's language, the code when it has no name
export function country(cc, lang) {
  const code = String(cc || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(code) || code === 'XX' || code === 'T1') return lang === 'en' ? 'Unknown' : 'Desconhecido';
  try {
    const name = new Intl.DisplayNames([lang === 'en' ? 'en-GB' : 'pt-PT'], { type: 'region', fallback: 'code' }).of(code);
    return name || code;
  } catch (_) { return code; }
}

// ---------- channels, devices, referrer hosts ----------
export const CHANNEL_ORDER = ['social', 'mensagens', 'pesquisa', 'direto', 'desporto', 'ia', 'outros'];
const CHANNEL = {
  pt: { social: 'Redes sociais', mensagens: 'Mensagens', pesquisa: 'Pesquisa', direto: 'Diretas', desporto: 'Desporto', ia: 'Assistentes de IA', outros: 'Outros sites' },
  en: { social: 'Social networks', mensagens: 'Messages', pesquisa: 'Search', direto: 'Direct', desporto: 'Sport', ia: 'AI assistants', outros: 'Other sites' },
};
export const channel = (k, lang) => CHANNEL[lang === 'en' ? 'en' : 'pt'][k] || k;
const DEVICE = { pt: { mobile: 'Telemóvel', tablet: 'Tablet', desktop: 'Computador' }, en: { mobile: 'Phone', tablet: 'Tablet', desktop: 'Computer' } };
export const device = (k, lang) => DEVICE[lang === 'en' ? 'en' : 'pt'][k] || k;
const HOSTS = {
  'l.instagram.com': 'Instagram', 'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'm.facebook.com': 'Facebook',
  'l.facebook.com': 'Facebook', 'lm.facebook.com': 'Facebook', 'google.com': 'Google', 'bing.com': 'Bing', 'duckduckgo.com': 'DuckDuckGo',
  't.co': 'X (Twitter)', 'x.com': 'X (Twitter)', 'twitter.com': 'X (Twitter)', 'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn',
  'youtube.com': 'YouTube', 'm.youtube.com': 'YouTube', 'tiktok.com': 'TikTok', 'strava.com': 'Strava', 'gofundme.com': 'GoFundMe',
  'gofund.me': 'GoFundMe', 'ironman.com': 'IRONMAN', 'chatgpt.com': 'ChatGPT', 'perplexity.ai': 'Perplexity', 'reddit.com': 'Reddit',
  'web.whatsapp.com': 'WhatsApp', 'app:com.whatsapp': 'WhatsApp', 'app:org.telegram.messenger': 'Telegram', 'app:com.google.android.gm': 'Gmail',
  'app:com.google.android.googlequicksearchbox': 'Google', 'mail.google.com': 'Gmail', 'outlook.live.com': 'Outlook',
  'gemini.google.com': 'Gemini', 'claude.ai': 'Claude', 'copilot.microsoft.com': 'Copilot',
};
const APPS = { instagram: 'Instagram', facebook: 'Facebook', messenger: 'Messenger', tiktok: 'TikTok', linkedin: 'LinkedIn', snapchat: 'Snapchat', pinterest: 'Pinterest' };
// a referrer row of audience.ref as a name: «Instagram (app)», «Google», «marca.pt»; same names are merged by the model
export function refName(k, lang) {
  if (k === 'outros sites') return lang === 'en' ? 'Other sites' : 'Outros sites';
  if (HOSTS[k]) return HOSTS[k];
  const app = /^(.+) \(app\)$/.exec(k);
  if (app) return `${APPS[app[1]] || app[1]} (app)`;
  if (/^app:/.test(k)) return `${k.slice(4)} (app)`;
  if (/^google\./.test(k)) return 'Google';
  return k;
}

// ---------- the report's sentences ----------
// {x} placeholders are filled by fill(); every value is already formatted
export const fill = (s, o = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in o ? String(o[k]) : m));

export const T = {
  pt: {
    head: { name: 'Gonçalo Carmo', site: 'gocarmo.com' },
    docSite: 'Relatório do site',
    docBrand: 'Relatório para {brand}',
    kicker: 'Números do site gocarmo.com',
    made: 'Feito a {day}, com o contador do próprio site.',
    starts: 'Os números começam a {day}, o primeiro dia com dados.',
    foot: 'gocarmo.com · Relatório {period} · página {i} de {n}',
    p1: 'Resumo',
    tiles: {
      visits: ['Visitas', 'chegadas ao site, vindas de fora'],
      pv: ['Visualizações', 'páginas abertas'],
      uvAvg: ['Visitantes por dia (média)', 'cada dia conta à parte'],
      eng: ['Tempo ativo (mediana)', 'por visualização'],
    },
    vsMonth: '{d} face a {month}',
    vsDays: '{d} face aos {n} dias anteriores',
    vsDay: '{d} face ao dia anterior',
    trend: { day: 'Visitas por dia', week: 'Visitas por semana', month: 'Visitas por mês' },
    trendAvg: 'Em média, {v} visitas por dia.',
    trendTop: { day: 'O dia com mais visitas foi {at} ({v}).', week: 'A semana com mais visitas foi a que começou a {at} ({v}).', month: 'O mês com mais visitas foi {at} ({v}).' },
    trendWeek: 'Cada semana começa à segunda-feira; a primeira e a última podem ter menos dias.',
    noVisits: 'Não houve visitas neste período.',
    noData: 'sem dados',
    p2: 'De onde chegam as visitas',
    chan: 'Por tipo de origem',
    chanNote: 'Diretas: endereço escrito à mão, favoritos ou aplicações que não dizem de onde vêm.',
    sites: 'Sites que trazem visitas',
    sitesCol: ['Site', 'Visualizações'],
    countries: 'Países',
    otherCountries: 'Outros países',
    cities: 'Cidades',
    citiesCol: ['Cidade', 'Visualizações'],
    otherPlaces: 'Outras localidades',
    citiesNote: 'Cidades com muito poucas visitas aparecem juntas em «Outras localidades».',
    devices: 'Aparelhos',
    nothing: 'Sem dados neste período.',
    sharedOf: '{p} das visitas',
    p3: 'O que fazem no site',
    eng: 'Tempo ativo por visualização',
    engLine: 'A mediana é {v}: metade das visualizações ficou menos tempo, metade mais. Só conta o tempo com a página à vista e em uso.',
    engBins: ['0-5 s', '5-15 s', '15-30 s', '30 s-1 min', '1-2 min', '2-5 min', '5-10 min', '10 min+'],
    scroll: 'Até onde descem na página',
    scrollRows: ['Um quarto da página', 'Metade da página', 'Três quartos', 'O fim (90% ou mais)'],
    scrollText: '{p} das visualizações',
    offer: 'O capítulo do patrocínio',
    offerLine: '{p} das visualizações chegaram ao capítulo do patrocínio (05), onde estão o fato, o capacete e os espaços.',
    studio: 'Estúdio 3D',
    studioCols: ['', 'Abriu em', 'Mexeram-lhe em'],
    studioRows: { suit: 'Fato 3D', helmet: 'Capacete 3D' },
    studioCell: '{v} visualizações',
    studioTouch: '{v} ({p})',
    tour: 'A visita guiada ao fato começou {v} vezes.',
    tour1: 'A visita guiada ao fato começou 1 vez.',
    p4: 'A tua marca no site',
    onSuit: 'No fato: {list}.',
    onHelmet: 'No capacete: {list}.',
    wholeSuit: 'O fato completo, com o nome da marca ao lado do meu.',
    logo: 'Cliques no logótipo ou no link',
    logoNote: 'Na lista de patrocinadores do site («Já no fato»), cada logótipo leva ao site da marca ({hosts}). Contamos os cliques por mês.',
    logoCols: ['Mês', 'Cliques', 'Lista no ecrã'],
    logoTotal: 'No período, {v} cliques. A lista de patrocinadores esteve no ecrã em {views} visualizações.',
    logoTotal1: 'No período, 1 clique. A lista de patrocinadores esteve no ecrã em {views} visualizações.',
    logoShared: 'O link desta marca leva ao {net}, onde os cliques de várias marcas se juntam: por isso não aparecem neste relatório.',
    montra: 'Montra «O meu material»',
    montraNote: 'Cartões vistos: visualizações em que o cartão do produto apareceu no ecrã. Cliques na loja: idas à loja da marca. Códigos copiados: o código de desconto copiado.',
    montraCols: ['Mês', 'Cartões vistos', 'Cliques na loja', 'Códigos copiados'],
    montraLegend: ['Cartões vistos', 'Cliques na loja', 'Códigos copiados'],
    montraProd: 'Por produto',
    retired: '{name} (já saiu da montra)',
    montraProdCols: ['Produto', 'Cartões vistos', 'Cliques na loja', 'Códigos copiados'],
    montraNone: 'Esta marca ainda não tem produtos na montra.',
    montraEmpty: 'Neste período a montra não teve cartões vistos nem cliques para esta marca.',
    total: 'Total',
    methodsH: 'Como contamos',
    methods: 'O contador do site é meu e não usa cookies. Uma visita é uma chegada ao site, vinda de fora; uma visualização é cada página aberta. Para não contar duas vezes o mesmo visitante no mesmo dia, o contador junta o endereço e o browser num código que muda todos os dias: os visitantes contam-se por dia e não se somam ao longo do mês. Não contam as minhas visitas, os robôs, nem quem pede ao browser para não ser seguido. Cidades e sites com menos de 3 visitantes no período, contados dia a dia, aparecem juntos. Dias completos, hora de Lisboa.',
    file: 'gocarmo-relatorio',
    subject: 'Visitas, visualizações e cliques de gocarmo.com, {period}',
  },
  en: {
    head: { name: 'Gonçalo Carmo', site: 'gocarmo.com' },
    docSite: 'Site report',
    docBrand: 'Report for {brand}',
    kicker: 'Figures from the gocarmo.com site',
    made: 'Made on {day}, from the site’s own counter.',
    starts: 'The figures start on {day}, the first day with data.',
    foot: 'gocarmo.com · Report {period} · page {i} of {n}',
    p1: 'Summary',
    tiles: {
      visits: ['Visits', 'arrivals from elsewhere'],
      pv: ['Page views', 'pages opened'],
      uvAvg: ['Visitors per day (average)', 'each day counted on its own'],
      eng: ['Active time (median)', 'per page view'],
    },
    vsMonth: '{d} vs {month}',
    vsDays: '{d} vs the previous {n} days',
    vsDay: '{d} vs the day before',
    trend: { day: 'Visits per day', week: 'Visits per week', month: 'Visits per month' },
    trendAvg: 'On average, {v} visits a day.',
    trendTop: { day: 'The day with the most visits was {at} ({v}).', week: 'The week with the most visits was the one starting on {at} ({v}).', month: 'The month with the most visits was {at} ({v}).' },
    trendWeek: 'Each week starts on a Monday; the first and the last may have fewer days.',
    noVisits: 'There were no visits in this period.',
    noData: 'no data',
    p2: 'Where the visits come from',
    chan: 'By kind of source',
    chanNote: 'Direct: a typed address, a bookmark or an app that does not say where the visit came from.',
    sites: 'Sites that send visits',
    sitesCol: ['Site', 'Page views'],
    countries: 'Countries',
    otherCountries: 'Other countries',
    cities: 'Cities',
    citiesCol: ['City', 'Page views'],
    otherPlaces: 'Other places',
    citiesNote: 'Cities with very few visits are grouped under “Other places”.',
    devices: 'Devices',
    nothing: 'No data in this period.',
    sharedOf: '{p} of visits',
    p3: 'What visits do on the site',
    eng: 'Active time per page view',
    engLine: 'The median is {v}: half of the page views stayed for less, half for more. Only the time with the page in view and in use counts.',
    engBins: ['0-5 s', '5-15 s', '15-30 s', '30 s-1 min', '1-2 min', '2-5 min', '5-10 min', '10 min+'],
    scroll: 'How far down the page',
    scrollRows: ['A quarter of the page', 'Half of the page', 'Three quarters', 'The end (90% or more)'],
    scrollText: '{p} of page views',
    offer: 'The sponsorship chapter',
    offerLine: '{p} of page views got to the sponsorship chapter (05), with the suit, the helmet and the spots.',
    studio: '3D studio',
    studioCols: ['', 'Opened in', 'Turned or tapped in'],
    studioRows: { suit: '3D suit', helmet: '3D helmet' },
    studioCell: '{v} page views',
    studioTouch: '{v} ({p})',
    tour: 'The guided tour of the suit started {v} times.',
    tour1: 'The guided tour of the suit started once.',
    p4: 'Your brand on the site',
    onSuit: 'On the suit: {list}.',
    onHelmet: 'On the helmet: {list}.',
    wholeSuit: 'The whole suit, with the brand’s name next to mine.',
    logo: 'Clicks on the logo or link',
    logoNote: 'In the site’s sponsor list (“Already on the suit”), each logo links to the brand’s site ({hosts}). Clicks are counted per month.',
    logoCols: ['Month', 'Clicks', 'List on screen'],
    logoTotal: 'In the period, {v} clicks. The sponsor list was on screen in {views} page views.',
    logoTotal1: 'In the period, 1 click. The sponsor list was on screen in {views} page views.',
    logoShared: 'This brand’s link goes to {net}, where the clicks of several brands are counted together, so they are not in this report.',
    montra: 'Showcase “My gear”',
    montraNote: 'Cards seen: page views in which the product card was on screen. Shop clicks: visits to the brand’s shop. Codes copied: the discount code copied.',
    montraCols: ['Month', 'Cards seen', 'Shop clicks', 'Codes copied'],
    montraLegend: ['Cards seen', 'Shop clicks', 'Codes copied'],
    montraProd: 'By product',
    retired: '{name} (no longer in the showcase)',
    montraProdCols: ['Product', 'Cards seen', 'Shop clicks', 'Codes copied'],
    montraNone: 'This brand has no products in the showcase yet.',
    montraEmpty: 'In this period the showcase had no cards seen and no clicks for this brand.',
    total: 'Total',
    methodsH: 'How the counting works',
    methods: 'The site’s counter is my own and uses no cookies. A visit is an arrival on the site from elsewhere; a page view is each page opened. To avoid counting the same visitor twice in one day, the counter turns the address and browser into a code that changes every day, so visitors are counted per day and never added up over a month. My own visits, bots and browsers that ask not to be tracked are not counted. Cities and sites with fewer than 3 visitors in the period, counted day by day, are grouped. Whole days, Lisbon time.',
    file: 'gocarmo-report',
    subject: 'Visits, page views and clicks of gocarmo.com, {period}',
  },
};

// ---------- the dialog (the admin is Portuguese only) ----------
export const UI = {
  open: 'Relatório PDF',
  month: 'Este mês', last: 'Mês passado', season: 'Época {season} até hoje', custom: 'Outro',
  monthOff: 'Ainda não há dias completos este mês.',
  seasonOff: 'A época {season} começa a {day}.',
  seasonNone: 'O ficheiro dos espaços não tem as datas da época.',
  range: '{range}: {n} dias completos.',
  range1: '{range}: 1 dia completo.',
  customBad: 'Escolhe «De» e «Até» com «De» antes de «Até», até ontem e não antes de {min}.',
  before: 'O contador só tem dados desde {day}: o PDF diz que os números começam aí.',
  brandSite: 'Só o site',
  noBrands: 'Ainda não há marcas com espaços vendidos.',
  brandHosts: 'Cliques no logótipo contados para {hosts}.',
  brandShared: 'O link desta marca é do {net}: os cliques no logótipo juntam-se aos de outras marcas e não entram no relatório.',
  brandNoSpots: 'Esta marca não tem espaços vendidos nesta época: o relatório não tem cliques no logótipo.',
  brandMontra: 'Montra: cartões vistos, cliques na loja e códigos copiados, por mês e por produto.',
  brandNoMontra: 'Sem produtos na montra.',
  go: 'Fazer o PDF', again: 'Fazer na mesma',
  step: 'A juntar os números ({i} de {n})',
  writing: 'A fazer o PDF',
  empty: 'Não há visitas neste período.',
  ready: 'PDF pronto: {name} ({size}).',
  save: 'Guardar o PDF', share: 'Guardar ou partilhar',
  saved: 'Guardado.',
  noSponsors: 'Os cliques no logótipo por mês só ficam disponíveis depois de publicares a versão nova do contador.',
  failed: 'Não consegui fazer o PDF. Tenta outra vez.',
  files: 'Não consegui ler os ficheiros dos espaços e da montra. Verifica a rede e tenta outra vez.',
};
