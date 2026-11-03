// The merch page (/admin/merch/): what each t-shirt is made of, as data. No DOM and no imports, so stamp.mjs can load
// it in Node (every file named here must be on disk) and the tests can read it.
// Source: the phase 1 print kit (print/FICHA-TECNICA.md, print/manifest.json, print/limites-texto-pequeno.json and
// ORCAMENTO.md, 03.11.2026). The owner chose all three styles and the «técnica» variant.

export const BASE = 'admin/merch/';   // from the repository root; the page itself is admin/merch/index.html

// The decal textures (tex/<name>.webp, lossless): the print PNGs at 2048 px at most, and their real size in mm (the
// técnica's back is its print zone without the black field, 25 mm of margin above the symbol: top_mm -25).
export const TEX = {
  's1-costas': { w: 301.1, h: 321.7 },
  's1-frente': { w: 99.7, h: 46.6 },
  's1loja-costas': { w: 301.1, h: 320.7 },
  's2-costas': { w: 205.1, h: 319.9 },
  's2-frente': { w: 90.0, h: 90.0 },
  's3-costas': { w: 279.9, h: 322.0 },
  's3-frente': { w: 69.8, h: 55.3 },
  'tec-costas': { w: 351.3, h: 371.857, top: -25 },
};

// What the 3D shows: a back and a front texture, and the flat mockups (flat/<name>.webp) for a browser without WebGL.
export const LOOKS = {
  s1: { style: 's1', title: 'Estilo 1 · Quem apoia', back: 's1-costas', front: 's1-frente', names: true,
    sub: '60 nomes fictícios · serigrafia', flat: { frente: 'estilo-1-quem-apoia-frente', costas: 'estilo-1-quem-apoia-costas' } },
  s1loja: { style: 's1', title: 'Estilo 1 · versão loja', back: 's1loja-costas', front: 's1-frente',
    sub: 'Para venda, sem nomes', flat: { frente: 'estilo-1-quem-apoia-frente', costas: 'estilo-1-loja-sem-nomes-costas' } },
  s2: { style: 's2', title: 'Estilo 2 · Época 2027', back: 's2-costas', front: 's2-frente',
    sub: 'Calendário a confirmar', flat: { frente: 'estilo-2-epoca-2027-frente', costas: 'estilo-2-epoca-2027-costas' } },
  s3: { style: 's3', title: 'Estilo 3 · 99', back: 's3-costas', front: 's3-frente',
    sub: 'Serigrafia, 2 cores', flat: { frente: 'estilo-3-99-frente', costas: 'estilo-3-99-costas' } },
  tec: { style: 'tec', title: 'Técnica · Estilo 1', back: 'tec-costas', front: 's1-frente', tech: true,
    sub: 'Sublimação · 200 nomes fictícios', flat: { frente: 'tecnica-estilo-1-frente', costas: 'tecnica-estilo-1-costas' } },
};
export const LOOK_KEYS = Object.keys(LOOKS);

// The garment: black is the design; the others are a test (the prints are cream and gold on a white base, made for a
// dark tee). The técnica is a white polyester tee printed black, so its colour is the print, not a choice.
export const GARMENTS = [
  { id: 'preto', name: 'Preto', adj: 'preta', hex: '#17171a' },
  { id: 'carvao', name: 'Carvão', adj: 'carvão', hex: '#3b3b40' },
  { id: 'marinho', name: 'Azul-marinho', adj: 'azul-marinho', hex: '#1c2538' },
  { id: 'tropa', name: 'Verde-tropa', adj: 'verde-tropa', hex: '#3a4232' },
];
export const TECH_HEX = '#121215';

export const INK = [
  { id: 'creme', name: 'Creme', hex: '#F2F1EC', text: 'Branco quente opaco. Referência têxtil: PANTONE 11-4201 TCX Cloud Dancer. Mais barato: branco normal.' },
  { id: 'ouro', name: 'Ouro', hex: '#E6B450', text: 'PANTONE 142 C, a cor sólida mais próxima. Pedir drawdown (amostra de tinta) sobre a t-shirt preta, com base.' },
];

// One «Ficha» per style. files: a print file (PDF always; PNG of 300 dpi only for the main size of each placement),
// kb: the sizes on disk (the tests compare them).
export const FICHAS = {
  s1: {
    title: 'Estilo 1 · Quem apoia',
    rows: [
      ['Costas', 'O símbolo do sol e da lua cheio de nomes. 30 × 32 cm (M a 3XL) · 26 × 28 cm (XS e S). Centrado, com o topo a 9 cm da gola (8 cm em XS e S).'],
      ['Peito', 'GO CARMO com o símbolo, 10 × 4,7 cm (S a 3XL; 9 cm em XS), do lado esquerdo de quem veste.'],
      ['Método', 'Serigrafia, com os nomes todos a creme (Inter 650): até cerca de 70 nomes no símbolo de 30 cm. DTF para 10 a 25 unidades: 50 a 60 nomes, os do sol a ouro. Versão loja: serigrafia, sem nomes.'],
      ['Cores', 'Creme e ouro.'],
      ['Telas', '3 por posição em algodão preto (base branca, creme, ouro): 6 por estilo. A uma cor, tudo a creme: 1 a 2 por posição.'],
    ],
    notes: [
      'Os nomes destes ficheiros são fictícios. O ficheiro final faz-se com os nomes de quem disse que sim, com a mesma letra ou maior.',
      'Com mais nomes do que o método aguenta: a técnica sublimada (até cerca de 200), só os nomes de quem disse que sim, ou a versão sem nomes.',
    ],
    files: [
      { path: 'print/estilo-1-quem-apoia/costas-serigrafia-60-nomes-30cm', label: 'Costas · serigrafia · 60 nomes', size: '30 cm · M a 3XL', mm: '301 × 322 mm', pdf: 364, png: 927 },
      { path: 'print/estilo-1-quem-apoia/costas-serigrafia-50-nomes-26cm', label: 'Costas · serigrafia · 50 nomes', size: '26 cm · XS e S', mm: '261 × 279 mm', pdf: 296 },
      { path: 'print/estilo-1-quem-apoia/costas-dtf-50-nomes-30cm', label: 'Costas · DTF · 50 nomes, sol a ouro', size: '30 cm · M a 3XL', mm: '301 × 322 mm', pdf: 206, png: 1009 },
      { path: 'print/estilo-1-quem-apoia/costas-loja-sem-nomes-30cm', label: 'Costas · versão loja, sem nomes', size: '30 cm · M a 3XL', mm: '301 × 321 mm', pdf: 113, png: 716 },
      { path: 'print/estilo-1-quem-apoia/costas-loja-sem-nomes-26cm', label: 'Costas · versão loja, sem nomes', size: '26 cm · XS e S', mm: '261 × 278 mm', pdf: 93 },
      { path: 'print/estilo-1-quem-apoia/frente-gocarmo-10cm', label: 'Peito · GO CARMO', size: '10 cm · S a 3XL', mm: '100 × 47 mm', pdf: 11, png: 62 },
    ],
  },
  s2: {
    title: 'Estilo 2 · Época 2027',
    rows: [
      ['Costas', 'GO / CARMO, DE SOL A SOL e as 7 provas de 2027 por lugar e data. 20,5 × 32 cm (M a 3XL) · 18 × 28 cm (XS e S).'],
      ['Peito', 'O emblema redondo GOCARMO · DE SOL A SOL, Ø 9 cm (S a 3XL; 8 cm em XS).'],
      ['Método', 'Serigrafia. DTF abaixo de 25 unidades.'],
      ['Cores', 'Creme e ouro. GO CARMO é uma área grande cheia.'],
      ['Telas', '3 por posição (base branca, creme, ouro): 6 por estilo.'],
    ],
    notes: [
      'Confirmar o calendário antes de imprimir: Vilamoura e Maiorca estão por confirmar, a data de Hokkaido é provisória e Sines ainda não tem dia.',
      'As datas a ouro perdem traço com a regra de 1,06 mm (4 % na versão de 32 cm, 10 % na de 28 cm): pedir prova, ou imprimir as datas a creme.',
      'Só lugares e datas, sem marcas de terceiros. Kona não aparece.',
    ],
    files: [
      { path: 'print/estilo-2-epoca-2027/costas-32cm-altura', label: 'Costas', size: '32 cm de altura · M a 3XL', mm: '205 × 320 mm', pdf: 63, png: 312 },
      { path: 'print/estilo-2-epoca-2027/costas-28cm-altura', label: 'Costas', size: '28 cm de altura · XS e S', mm: '180 × 280 mm', pdf: 62 },
      { path: 'print/estilo-2-epoca-2027/frente-emblema-9cm', label: 'Peito · emblema', size: 'Ø 9 cm · S a 3XL', mm: '90 × 90 mm', pdf: 18, png: 97 },
    ],
  },
  s3: {
    title: 'Estilo 3 · 99',
    rows: [
      ['Costas', 'CARMO, o 99 em contorno de 3,4 mm, uma linha e «SÓ ME VÊS AS COSTAS». 28 × 32 cm (M a 3XL) · 24,5 × 28 cm (XS e S).'],
      ['Peito', 'GC., 7 × 5,5 cm (S a 3XL; 6,5 cm em XS).'],
      ['Método', 'Serigrafia. DTF abaixo de 25 unidades.'],
      ['Cores', 'Creme e ouro, com pouca tinta: o 99 é só contorno.'],
      ['Telas', '3 por posição (base branca, creme, ouro): 6 por estilo.'],
    ],
    notes: [
      'O 99 é o número de motocross do Gonçalo (@goncalo.carmo99). «SÓ ME VÊS AS COSTAS» vem do pack de stickers de humor, já aprovado.',
      'Alternativa sem humor para a mesma linha: «DO MOTOCROSS AO TRIATLO».',
    ],
    files: [
      { path: 'print/estilo-3-99/costas-28cm', label: 'Costas', size: '28 cm · M a 3XL', mm: '280 × 322 mm', pdf: 20, png: 380 },
      { path: 'print/estilo-3-99/costas-24-5cm', label: 'Costas', size: '24,5 cm · XS e S', mm: '245 × 282 mm', pdf: 20 },
      { path: 'print/estilo-3-99/frente-gc-7cm', label: 'Peito · GC.', size: '7 cm · S a 3XL', mm: '70 × 55 mm', pdf: 4, png: 33 },
    ],
  },
  tec: {
    title: 'Técnica · Estilo 1',
    rows: [
      ['Peça', 'T-shirt de corrida em poliéster branco, 130 a 160 g/m², sublimada a preto: o preto é impresso.'],
      ['Costas', 'O símbolo de 30 cm com 200 nomes. Zona de 35 × 37 cm, com 25 mm de preto à volta; o resto do painel vai a preto 100 %.'],
      ['Peito', 'O logótipo de 10 cm. Zona de 15 × 9,7 cm.'],
      ['Método', 'Sublimação, de preferência corte e confeção (o tecido é impresso antes de coser).'],
      ['Cores', 'Impressão a cores (RGB). O creme fica quase branco: o branco é o próprio tecido.'],
      ['Telas', 'Nenhuma.'],
    ],
    notes: [
      'Aguenta os nomes mais pequenos: até cerca de 200 (letra mínima estimada em 3,2 mm, a confirmar com prova).',
      'Numa peça já cosida podem ficar vincos brancos nas costuras e debaixo dos braços.',
      'A sublimação não funciona em algodão nem em peças escuras.',
    ],
    files: [
      { path: 'print/tecnica-sublimacao/costas-estilo-1-200-nomes-zona', label: 'Costas · 200 nomes', size: 'M a 3XL', mm: '351 × 372 mm', pdf: 750, png: 1697 },
      { path: 'print/tecnica-sublimacao/frente-gocarmo-zona', label: 'Peito · GO CARMO', size: 'S a 3XL', mm: '150 × 97 mm', pdf: 10, png: 73 },
    ],
  },
};
// for every style: the quote brief and the small-text test strip
export const COMMON = [
  { href: 'ORCAMENTO.pdf', label: 'Pedido de orçamento', sub: 'O pedido para as gráficas: peças, quantidades, estilos e perguntas.', kb: 555 },
  { href: 'print/teste/tira-de-teste-texto-pequeno.pdf', label: 'Tira de teste', sub: 'Imprimir numa t-shirt de amostra antes de orçamentar o estilo 1: mostra a letra que cada gráfica consegue.', kb: 241 },
];

// every file the page links or loads, from the page's folder (stamp.mjs checks each one is on disk)
export function merchFiles() {
  const out = ['model/shirt_baked.glb', 'model/ATTRIBUTION.txt', 'model/LICENSE-threejs-t-shirt-MIT.txt', ...COMMON.map((c) => c.href)];
  for (const k of Object.keys(TEX)) out.push(`tex/${k}.webp`);
  for (const l of Object.values(LOOKS)) for (const v of Object.values(l.flat)) out.push(`flat/${v}.webp`);
  for (const f of Object.values(FICHAS)) for (const x of f.files) { out.push(`${x.path}.pdf`); if (x.png) out.push(`${x.path}.png`); }
  return [...new Set(out)];
}

// ---------- the names of style 1 on the tee ----------
// The symbol is 300 mm wide (55.853 × 55.999 symbol units: tools/emblem.py SYM_BOX); the print file's ink box starts 0.65 mm (half
// the 1.3 mm outline) above and left of the symbol's box. Names in Inter 650, all cream (the serigrafia file).
export const SYM = { x0: 4.0740625, y0: 4.0, w: 55.852937499999996, h: 55.99894618055555, mm: 300, line: 1.3 };
export const UNIT = SYM.mm / SYM.w;   // mm per symbol unit
export const INTER_CAP = 0.728;       // cap height of Inter, in em
// smallest cap height each method holds for Inter 650 (print/limites-texto-pequeno.json)
export const MIN_CAP = { serigrafia: 4.39, dtf: 4.99, sublimacao: 2.99 };
export const capMm = (f) => f * UNIT * INTER_CAP;
const mm1 = (x) => (Math.round(x * 10) / 10).toFixed(1).replace('.', ',');
// what a cap height means for the print, in one line
export function capVerdict(cap) {
  const c = `Maiúscula de ${mm1(cap)} mm`;
  if (cap >= MIN_CAP.dtf) return { ok: 'all', text: `${c}: dá em serigrafia (mínimo ${mm1(MIN_CAP.serigrafia)} mm) e em DTF (${mm1(MIN_CAP.dtf)} mm).` };
  if (cap >= MIN_CAP.serigrafia) return { ok: 'serigrafia', text: `${c}: dá em serigrafia a creme (mínimo ${mm1(MIN_CAP.serigrafia)} mm); em DTF pede ${mm1(MIN_CAP.dtf)} mm.` };
  if (cap >= MIN_CAP.sublimacao) return { ok: 'sublimacao', text: `${c}: abaixo do mínimo da serigrafia (${mm1(MIN_CAP.serigrafia)} mm). Dá na técnica sublimada; ou ficam só os nomes de quem disse que sim; ou a versão sem nomes.` };
  return { ok: 'none', text: `${c}: pequena demais para qualquer método (a sublimação pede cerca de ${mm1(MIN_CAP.sublimacao)} mm). Menos nomes, ou a versão sem nomes.` };
}
export const MAX_NAMES = 600;
// the Worker's GET /apoiantes/nomes ({ v: 1, names: [{ id, name }] }) as a list of names; null if it is not that
export function namesOf(json) {
  if (!json || typeof json !== 'object' || !Array.isArray(json.names)) return null;
  const out = [];
  for (const x of json.names) {
    const n = x && typeof x.name === 'string' ? x.name.replace(/\s+/g, ' ').trim() : '';
    if (n && n.length <= 60) out.push(n);
    if (out.length >= MAX_NAMES) break;
  }
  return out;
}
