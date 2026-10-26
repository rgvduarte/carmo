// pt-PT labels for /admin/analytics/ (SPEC 5.4): zones, channels, CTAs, events, devices, errors, end states. Plain
// words, the ones Gonçalo and the owner use. Anything without a label shows its id, so nothing is ever hidden.

export const ZONE = {
  top: 'Início', tese: 'Porquê agora', historia: '01 História', prova: 'Kona, segmento a segmento',
  resultados: '02 Resultados', dados: '03 Telemetria', epoca: '04 Objetivos', 'fato-topo': '05 Patrocínio',
  'o-fato': 'O fato', 'o-capacete': 'O capacete', 'fato-termos': 'Condições e passos', media: '06 Media',
  apoiar: '07 Apoiar', contacto: '08 Contacto', footer: 'Rodapé',
  // fixed layers
  nav: 'Menu do topo', pacote: 'Barra do pacote', ficha: 'Ficha do espaço (telemóvel)', reserva: 'Janela de reserva',
  aviso: 'Aviso', opiniao: 'Pergunta rápida',
};
export const zone = (z) => ZONE[z] || z || '—';

export const CHAN = {
  social: 'Redes sociais', pesquisa: 'Pesquisa', ia: 'Assistentes de IA', mensagens: 'Mensagens e email',
  desporto: 'Desporto', direto: 'Direto', interno: 'O próprio site', outros: 'Outros sites',
};
export const chan = (k) => CHAN[k] || k;

// referrer hosts and in-app rows («instagram (app)»)
const HOST = {
  // the same network can arrive by several hosts: name them apart (l. = a link opened from the app, m. = the phone site)
  'l.instagram.com': 'Instagram (ligação)', 'instagram.com': 'Instagram', 'facebook.com': 'Facebook', 'm.facebook.com': 'Facebook (telemóvel)',
  'l.facebook.com': 'Facebook (ligação)', 'lm.facebook.com': 'Facebook (ligação)', 'google.com': 'Google', 'bing.com': 'Bing',
  'duckduckgo.com': 'DuckDuckGo', 't.co': 'X (Twitter)', 'x.com': 'X (Twitter)', 'twitter.com': 'X (Twitter)',
  'linkedin.com': 'LinkedIn', 'lnkd.in': 'LinkedIn (ligação)', 'youtube.com': 'YouTube', 'm.youtube.com': 'YouTube (telemóvel)',
  'tiktok.com': 'TikTok', 'strava.com': 'Strava', 'gofundme.com': 'GoFundMe', 'gofund.me': 'GoFundMe',
  'ironman.com': 'IRONMAN', 'chatgpt.com': 'ChatGPT', 'perplexity.ai': 'Perplexity', 'reddit.com': 'Reddit',
  'web.whatsapp.com': 'WhatsApp Web', 'app:com.whatsapp': 'WhatsApp (app)', 'app:org.telegram.messenger': 'Telegram (app)',
  'app:com.google.android.gm': 'Gmail (app)', 'app:com.google.android.googlequicksearchbox': 'Google (app)', 'outros sites': 'Outros sites',
  'mail.google.com': 'Gmail', 'outlook.live.com': 'Outlook', 'gemini.google.com': 'Gemini', 'claude.ai': 'Claude',
  'copilot.microsoft.com': 'Copilot',
};
const APPNAME = { instagram: 'Instagram', facebook: 'Facebook', messenger: 'Messenger', tiktok: 'TikTok', linkedin: 'LinkedIn', snapchat: 'Snapchat', pinterest: 'Pinterest' };
export function host(k) {
  if (HOST[k]) return HOST[k];
  const app = /^(.+) \(app\)$/.exec(k);
  if (app) return `${APPNAME[app[1]] || app[1]} (app)`;
  if (/^app:/.test(k)) return `${k.slice(4)} (app)`;
  if (/^google\./.test(k)) return `Google (${k.slice(7)})`;
  return k;
}
export const app = (k) => APPNAME[k] || k;

export const CTA = {
  'hero-sponsor': 'Início: Ver o fato e o capacete', 'hero-support': 'Início: Apoiar', 'nav-sponsor': 'Menu: Patrocinar',
  'entry-suit': 'Ver o fato', 'entry-helmet': 'Ver o capacete', title: 'Pedir o fato completo', 'pkg-go': 'Barra do pacote: Reservar',
  'spot-add': 'Adicionar ao pacote', 'spot-try': 'Experimentar o logótipo', gofundme: 'Apoiar no GoFundMe',
  'give-iban': 'Copiar o IBAN (apoiar)', 'give-mb': 'Copiar o MB WAY (apoiar)', 'contact-email': 'Enviar email',
  'media-kit': 'Media kit em PDF', strava: 'Cartão do Strava',
};
export const cta = (k) => CTA[k] || k;

export const DEV = { mobile: 'Telemóvel', tablet: 'Tablet', desktop: 'Computador', all: 'Todos os aparelhos' };
export const dev = (k) => DEV[k] || k;
export const VW = { m: 'Telemóvel · até 760 px', t: 'Tablet · 761 a 1080 px', d: 'Computador · 1081 a 1479 px', w: 'Ecrã largo · 1480 px ou mais' };
export const VWSHORT = { m: 'Telemóvel', t: 'Tablet', d: 'Computador', w: 'Ecrã largo', all: 'Todas as larguras' };
export const vw = (k) => VW[k] || k;
export const LANG = { pt: 'Português', en: 'Inglês', es: 'Espanhol', fr: 'Francês', de: 'Alemão', it: 'Italiano', nl: 'Neerlandês', xx: 'Desconhecida' };
export const lang = (k) => {
  if (LANG[k]) return LANG[k];
  try { const n = new Intl.DisplayNames('pt-PT', { type: 'language' }).of(k); if (n && n !== k) return n.charAt(0).toUpperCase() + n.slice(1); } catch (_) {}
  return k;
};

export const ROUTE = { scroll: 'A descer a página', hero: 'Botão do início', nav: '«Patrocinar» no menu', menu: 'Menu (telemóvel)', link: 'Ligação direta', outro: 'Outra ligação na página' };
export const FROM = { '3d': 'Toque no modelo 3D', tabela: 'Tabela de preços', capitulo: 'Capítulos', teclas: 'Setas do teclado', link: 'Ligação direta' };
export const END = {
  feito: 'Concluíram', copiou_saiu: 'Copiaram os dados e saíram', fechou_passo2: 'Fecharam no passo 2', saiu_passo2: 'Saíram no passo 2',
  fechou_passo1: 'Fecharam no passo 1', aberta_saiu: 'Saíram com a janela aberta',
};
export const STEP = {
  S0: 'Viram a oferta', S1: 'Escolheram um espaço', S2: 'Juntaram ao pacote', S3: 'Abriram o pedido',
  S4: 'Enviaram o pedido', S5: 'Copiaram os dados de pagamento', S6: 'Carregaram em «Feito»',
};
export const SEND = { whatsapp: 'WhatsApp', email: 'Email', instagram: 'Instagram', manual: 'Enviei de outra forma' };
export const PAYTAB = { mb: 'MB WAY', tr: 'Transferência' };
export const COPY = { iban: 'IBAN', mb: 'Número MB WAY', amt: 'Valor', ref: 'Referência', email: 'Email' };
export const OUT = {
  whatsapp: 'WhatsApp', email: 'Email', instagram: 'Instagram', tiktok: 'TikTok', strava: 'Strava', gofundme: 'GoFundMe',
  spotify: 'Spotify', patrocinador: 'Site de um patrocinador', tel: 'Telefone', outro: 'Outro site',
};
export const ITEM = { suit: 'Fato', helmet: 'Capacete' };
export const STUDIO = { approached: 'Chegaram perto', seen: 'Viram o estúdio', ready: 'O 3D abriu', touched: 'Mexeram no modelo', spot: 'Escolheram um espaço', add: 'Juntaram ao pacote' };
export const GESTURE = { rotate: 'Rodar', tap: 'Tocar num espaço', pinch: 'Dois dedos (zoom)', zoom: 'Botões de zoom', view: 'Vistas (frente, lado…)', auto: 'Rotação automática', spots: 'Mostrar espaços', chapter: 'Capítulos', tour: 'Visita guiada' };
export const PKG = { 1: '1 espaço', 2: '2 espaços', '3+': '3 ou mais', title: 'Fato completo' };
export const REASON = { precos: 'Os preços', reservar: 'Como reservar', pagar: 'Como pagar', incluido: 'O que está incluído', outra: 'Outra coisa' };
export const NOTEKIND = { post: 'Publicação', prova: 'Prova', imprensa: 'Imprensa', site: 'Site' };
export const CLICKERR = { js: 'erro de JavaScript', bad: 'logótipo não abriu', big: 'ficheiro grande demais', sold: 'espaço já vendido', helmet: 'capacete falhou', brand: 'faltou a marca', logo: 'faltou o logótipo' };
export const FAIL3D = { nogl: 'O aparelho não tem 3D (WebGL)', load: 'O modelo não carregou', ctx: 'O 3D foi desligado pelo aparelho', unknown: 'Outro motivo' };
export const ASSET = { spots: 'Lista de espaços', logo: 'Logótipo de patrocinador', img: 'Imagem', module: 'Ficheiro de código', gsap: 'Animações (GSAP)', lenis: 'Deslizar suave (Lenis)' };
export const REJ = { origem: 'Origem errada', tamanho: 'Grande demais', formato: 'Formato inválido', limite: 'Demasiados pedidos', robo: 'Robôs', cheio: 'Limite do dia' };
export const VITAL = {
  lcp: ['LCP', 'Maior elemento visível'], inp: ['INP', 'Resposta a um toque'], cls: ['CLS', 'Saltos na página'],
  fcp: ['FCP', 'Primeiro conteúdo'], ttfb: ['TTFB', 'Resposta do servidor'],
};
export const VITAL_T = { lcp: [2500, 4000], inp: [200, 500], cls: [0.1, 0.25], fcp: [1800, 3000], ttfb: [800, 1800] };
export const NAVTO = {
  top: 'Início', tese: 'Porquê agora', historia: 'História', prova: 'A prova', resultados: 'Resultados', dados: 'Dados',
  epoca: 'Época 2027', fato: 'Patrocínio', 'o-fato': 'O fato', 'o-capacete': 'O capacete', media: 'Media', apoiar: 'Apoiar', contacto: 'Contacto',
};
// spot names (data/spots.json, read by the page): setSpots() once they are in
let SPOTN = {};
export const setSpots = (m) => { SPOTN = m || {}; };
export const spot = (id) => (SPOTN[id] && SPOTN[id].name) || (id === 'title' ? 'Fato completo' : id);
export const land = (k) => {
  if (!k) return '—';
  if (k.startsWith('#')) return `gocarmo.com/${k} · ${NAVTO[k.slice(1)] || k.slice(1)}`;
  if (k.startsWith('spot:')) return `Partilha de um espaço · ${spot(k.slice(5))}`;
  if (k.startsWith('pacote:')) return `Partilha de um pacote · ${PKG[k.slice(7)] || k.slice(7)}`;
  if (k === 'capacete') return 'gocarmo.com/#capacete';
  if (k === 'title') return 'Partilha do fato completo';
  return k;
};
// a selector of the page (a Web Vitals target) as a name the owner knows: a spot by its name, a known element, else
// the element's own text in the page (doc: the parsed home page; text(key): the Portuguese text of an i18n key), else
// what kind of thing it is (SPEC 5.7, as the heatmap tables do it)
const SELKNOWN = { '#stage > canvas': 'O fato em 3D', '#stage-h > canvas': 'O capacete em 3D', '#hero-spots': 'Número de espaços livres (início)',
  '#rc-body': 'Tabela de espaços e preços' };
const KIND = { img: 'Imagem', picture: 'Imagem', figure: 'Fotografia', video: 'Vídeo', canvas: 'Desenho', svg: 'Gráfico', g: 'Gráfico', h1: 'Título', h2: 'Título',
  h3: 'Título', p: 'Texto', li: 'Linha de uma lista', dl: 'Números', dt: 'Números', dd: 'Números', a: 'Ligação', button: 'Botão', span: 'Texto',
  table: 'Tabela', tbody: 'Tabela', ul: 'Lista', ol: 'Lista', section: 'Secção', div: 'Bloco' };
// the text of an element as it reads: its text pieces joined by spaces («Gonçalo» «Carmo», not «GonçaloCarmo»)
function words(el) {
  const out = [], w = el.ownerDocument.createTreeWalker(el, 4);
  for (let n = w.nextNode(); n && out.length < 40; n = w.nextNode()) out.push(n.nodeValue);
  return out.join(' ');
}
export const selZone = (sel) => { const m = /^#([a-z][a-z0-9-]*)/.exec(sel || ''); return m && ZONE[m[1]] ? m[1] : ''; };
export function selName(sel, doc, text = () => '') {
  if (!sel) return '—';
  for (const k of Object.keys(SELKNOWN)) if (sel === k || sel.startsWith(`${k} `)) return SELKNOWN[k];
  const id = /\[data-id="([a-z0-9-]+)"\]/.exec(sel);
  if (id) return spot(id[1]);
  const cut = (t) => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > 60 ? `${t.slice(0, 59)}…` : t; };
  let el = null;
  try { el = doc ? doc.querySelector(sel) : null; } catch (_) { el = null; }
  if (el) {
    const tag = el.localName;
    if (tag === 'img' && el.getAttribute('alt')) return `Imagem: ${cut(el.getAttribute('alt'))}`;
    const k = el.getAttribute('data-i18n') || (el.querySelector('[data-i18n]') || { getAttribute: () => '' }).getAttribute('data-i18n');
    const aria = (/aria-label:([\w.-]+)/.exec(el.getAttribute('data-i18n-attr') || '') || [])[1];
    const t = cut((aria && text(aria)) || el.getAttribute('aria-label') || (k && text(k)) || words(el));
    const z = selZone(sel);
    if (t) return t;
    if (KIND[tag]) return `${KIND[tag]}${z ? ` (${zone(z)})` : ''}`;
  }
  const tail = sel.split(/\s*>\s*|\s+/).pop() || '';
  const tag = (tail.match(/^[a-z0-9]+/) || [''])[0], nth = (tail.match(/:nth-of-type\((\d+)\)/) || [])[1];
  const kind = KIND[tag] || (tag ? 'Bloco' : '');
  const z = selZone(sel);
  return kind ? `${kind}${nth ? ` n.º ${nth}` : ''}${z ? ` (${zone(z)})` : ''}` : sel;
}
export const CSV = [
  ['dias', 'Totais por dia'], ['paginas', 'Páginas'], ['origens', 'Origens'], ['sites', 'Sites que trazem visitas'],
  ['paises', 'Países'], ['localidades', 'Localidades'], ['aparelhos', 'Aparelhos'], ['sistemas', 'Sistemas'],
  ['navegadores', 'Navegadores'], ['linguas', 'Línguas'], ['zonas', 'Secções da página'], ['cliques', 'Elementos carregados'],
  ['botoes', 'Botões'], ['eventos', 'Eventos'], ['funil', 'Funil de reserva'], ['erros', 'Erros de JavaScript'],
  ['opiniao', 'Opinião'], ['meses', 'Totais por mês (arquivo)'],
];

// Cloudflare gives English place names; the common Portuguese ones read better in Portuguese (SPEC 5.8)
const PLACE = {
  Lisbon: 'Lisboa', Oporto: 'Porto', Porto: 'Porto', Setubal: 'Setúbal', 'Setúbal': 'Setúbal', Braga: 'Braga', Coimbra: 'Coimbra',
  Faro: 'Faro', Leiria: 'Leiria', Aveiro: 'Aveiro', Funchal: 'Funchal', 'Ponta Delgada': 'Ponta Delgada', Madeira: 'Madeira',
  Azores: 'Açores', Evora: 'Évora', 'Évora': 'Évora', Santarem: 'Santarém', Viseu: 'Viseu', 'Viana do Castelo': 'Viana do Castelo',
  'Vila Real': 'Vila Real', Braganca: 'Bragança', Guarda: 'Guarda', 'Castelo Branco': 'Castelo Branco', Portalegre: 'Portalegre',
  Beja: 'Beja', Cascais: 'Cascais', Sintra: 'Sintra', Amadora: 'Amadora', Almada: 'Almada', Oeiras: 'Oeiras', Matosinhos: 'Matosinhos',
  'Vila Nova de Gaia': 'Vila Nova de Gaia', Guimaraes: 'Guimarães', Madrid: 'Madrid', London: 'Londres', Seville: 'Sevilha', Paris: 'Paris',
  'Sao Paulo': 'São Paulo', 'Rio de Janeiro': 'Rio de Janeiro', England: 'Inglaterra', Hawaii: 'Havai',
};
export const place = (s) => (s ? PLACE[s] || s : '—');
let regionNames = null;
export function country(cc) {
  if (!cc || cc === 'XX') return 'Desconhecido';
  try { regionNames = regionNames || new Intl.DisplayNames('pt-PT', { type: 'region' }); return regionNames.of(cc) || cc; } catch (_) { return cc; }
}

// event names for the «Eventos» CSV and the odd table (falls back to the id)
export const EVENT = {
  cta_view: 'Botão visto', nav_click: 'Menu: ir para', menu_open: 'Abriu o menu', back_top: 'Voltar ao topo', hero_cta: 'Botão do início',
  offer_reach: 'Chegou ao patrocínio', entry_click: 'Entrada do fato ou capacete', results_all: 'Todos os resultados', strava_table: 'Tabela do Strava',
  marks_jump: 'Saltar entre marcas', studio_near: 'Perto do estúdio', studio_seen: 'Viu o estúdio', studio_show: '3D mostrado',
  studio_wait: 'Esperou pelo 3D', studio_rotate: 'Rodou o modelo', studio_tap: 'Tocou no modelo', studio_pinch: 'Dois dedos no modelo',
  studio_zoom: 'Zoom', studio_view: 'Mudou a vista', studio_auto: 'Rotação automática', studio_spots: 'Mostrar espaços',
  chapter: 'Capítulo', tour_start: 'Começou a visita guiada', tour_end: 'Fim da visita guiada', spot_select: 'Abriu um espaço',
  spot_close: 'Fechou um espaço', rc_sort: 'Ordenou a tabela', rc_avail: 'Só livres', pkg_add: 'Juntou ao pacote', pkg_remove: 'Tirou do pacote',
  pkg_bar: 'Barra do pacote apareceu', pkg_clear: 'Limpou o pacote', title_click: 'Pediu o fato completo', try_open: 'Abriu «Experimentar»',
  logo_try: 'Experimentou um logótipo', logo_opt: 'Opção do logótipo', logo_remove: 'Tirou o logótipo', mockup_download: 'Descarregou a imagem',
  spot_share: 'Partilhou um espaço', onsuit_view: 'Viu os patrocinadores no fato', claim_open: 'Abriu o pedido', claim_step: 'Passo do pedido',
  claim_items: 'Viu os espaços do pedido', claim_extra: 'Juntou mais espaços', claim_error: 'Erro no pedido', claim_send: 'Enviou o pedido',
  pay_tab: 'Escolheu o pagamento', pay_copy: 'Copiou dados de pagamento', claim_back: 'Voltou ao passo 1', claim_done: 'Carregou em «Feito»',
  claim_close: 'Fechou o pedido', bf_return: 'Voltou de outra app', give_copy: 'Copiou dados para apoiar', give_kind: 'Apoio em espécie',
  kit_print: 'Media kit', print: 'Imprimiu', lang_switch: 'Mudou de língua', toast_err: 'Aviso de erro', fb_show: 'Viu a pergunta',
  fb_close: 'Fechou a pergunta', '3d_ready': '3D pronto', '3d_fail': '3D falhou', gl_lost: '3D perdido', gl_back: '3D recuperado',
  asset_fail: 'Ficheiro falhou', boot_retry: 'Recarregou para atualizar', boot_fail: 'A página não arrancou',
};
