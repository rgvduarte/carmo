// Content that changes during the season lives here: links, results, calendar, budget.
// Edit this file (or data/spots.json for the suit) and push — the page rebuilds itself.

export const SITE = {
  name: 'Gonçalo Carmo',
  instagram: 'goncalo.carmo99',
  whatsapp: '351916395103',
  email: 'gcarmo.media@gmail.com',
  strava: 'https://www.strava.com/athletes/50182673',
  // Paste the campaign link here once it is live (e.g. https://gofund.me/xxxx).
  gofundme: '',
  updated: '2026-10-22',
  kona: '2027-10-09T07:00:00-10:00',
};

// Official results (timing companies / IRONMAN), checked 22 Oct 2026.
// `md` marks middle-distance triathlons used in the progression chart; `rank`/`field` feed the "top %" chart.
export const RESULTS = [
  { year: 2026, pt: 'IRONMAN Portugal-Cascais', en: 'IRONMAN Portugal-Cascais', place: 'Cascais, Portugal', dist: '3,8 · 180 · 42,2 km', time: '9:35:08', rank: 52, field: 1981,
    splits: { swim: '1:01:42', t1: '6:00', bike: '4:56:43', t2: '3:22', run: '3:27:22' },
    badges: [{ pt: 'Primeiro IRONMAN completo', en: 'First full IRONMAN', gold: true }, { pt: '52.º de 1 981', en: '52nd of 1,981' }, { pt: '12.º de 321 · M25–29', en: '12th of 321 · M25–29' }] },
  { year: 2026, pt: 'Triatlo de Sines', en: 'Sines Triathlon', place: 'Sines, Portugal', dist: '2 · 80 · 18 km', time: '3:42:32', rank: 6, field: 743,
    splits: { swim: '30:12', t1: '2:27', bike: '1:59:45', t2: '1:52', run: '1:08:16' },
    badges: [{ pt: '1.º de 83 · M25–29', en: '1st of 83 · M25–29', gold: true }, { pt: '6.º de 743', en: '6th of 743' }] },
  { year: 2026, pt: 'Corrida de Santo António', en: 'Santo António 10K', place: 'Lisboa, Portugal', dist: '10 km', time: '33:48', rank: 15, field: 4694,
    badges: [{ pt: '15.º de 4 694', en: '15th of 4,694', gold: true }, { pt: '3:23 /km', en: '3:23 /km', dim: true }] },
  { year: 2026, pt: 'Lidl Setúbal Triathlon', en: 'Lidl Setúbal Triathlon', place: 'Setúbal, Portugal', dist: '1,9 · 90 · 21,1 km', time: '4:26:49', min: 266.82, md: true, rank: 11, field: 802,
    splits: { swim: '33:48', t1: '3:05', bike: '2:29:37', t2: '0:55', run: '1:19:13' },
    badges: [{ pt: '2.º de 84 · M25–29', en: '2nd of 84 · M25–29', gold: true }, { pt: '11.º de 802', en: '11th of 802' }] },
  { year: 2026, pt: 'Zurich Maratón de Sevilla', en: 'Zurich Seville Marathon', place: 'Sevilha, Espanha', dist: '42,2 km', time: '2:44:13', rank: 698, field: 12449,
    badges: [{ pt: '698.º de 12 449', en: '698th of 12,449' }, { pt: '3:53 /km', en: '3:53 /km', dim: true }] },
  { year: 2025, pt: 'IRONMAN 70.3 Cascais', en: 'IRONMAN 70.3 Cascais', place: 'Cascais, Portugal', dist: '1,9 · 90 · 21,1 km', time: '4:27:16', min: 267.27, md: true, rank: 31, field: 2353,
    splits: { swim: '31:22', t1: '4:23', bike: '2:22:30', t2: '2:35', run: '1:26:25' },
    badges: [{ pt: '31.º de 2 353', en: '31st of 2,353', gold: true }, { pt: '7.º de 151 · M18–24', en: '7th of 151 · M18–24' }, { pt: 'Estreia IRONMAN 70.3', en: 'IRONMAN 70.3 debut', dim: true }] },
  { year: 2025, pt: 'Triatlo Longo de Caminha', en: 'Caminha Long Triathlon', place: 'Caminha, Portugal', dist: '1,9 · 90 · 21 km', time: '4:32:54', min: 272.9, md: true,
    splits: { swim: '26:21', t1: '2:24', bike: '2:31:53', t2: '1:18', run: '1:30:57' },
    badges: [{ pt: '4.º · escalão 20–24', en: '4th · AG 20–24' }, { pt: 'Primeiro triatlo', en: 'First triathlon', dim: true }] },
];

// First full IRONMAN, used for the "where the time went" bar.
export const IRONMAN_SPLITS = [
  { k: 'swim', pt: 'Natação', en: 'Swim', s: 3702 },
  { k: 't1', pt: 'T1', en: 'T1', s: 360 },
  { k: 'bike', pt: 'Ciclismo', en: 'Bike', s: 17803 },
  { k: 't2', pt: 'T2', en: 'T2', s: 202 },
  { k: 'run', pt: 'Corrida', en: 'Run', s: 12442 },
];

// Instagram @goncalo.carmo99, read from the platform on 2026-10-22 (12 most recent posts).
export const SOCIAL = { followers: 1921, likesPerPost: 329, commentsPerPost: 43, bestPost: 881, asOf: '2026-10-22' };

// 2027 season, in date order. status: planned | entry (won on merit) | pending | tbc | goal
export const SEASON = [
  { date: '2027-02-21', pt: 'Maratona de Sevilha', en: 'Seville Marathon', where: { pt: 'Sevilha, Espanha', en: 'Seville, Spain' }, what: { pt: 'Maratona · 42,2 km', en: 'Marathon · 42.2 km' }, km: 42.2, status: 'planned' },
  { date: '2027-04-03', pt: 'IRONMAN 70.3 Vilamoura', en: 'IRONMAN 70.3 Vilamoura', where: { pt: 'Vilamoura, Algarve', en: 'Vilamoura, Algarve' }, what: { pt: 'Meia distância · 1.ª edição', en: 'Middle distance · 1st edition' }, km: 113, status: 'pending' },
  { date: '2027-04-24', pt: 'Mallorca 312', en: 'Mallorca 312', where: { pt: 'Maiorca, Espanha', en: 'Mallorca, Spain' }, what: { pt: 'Ciclismo · 312 km', en: 'Cycling · 312 km' }, km: 312, status: 'planned' },
  { date: '2027-05-02', pt: 'Lidl Setúbal Triathlon', en: 'Lidl Setúbal Triathlon', where: { pt: 'Setúbal, Portugal', en: 'Setúbal, Portugal' }, what: { pt: 'Meia distância', en: 'Middle distance' }, km: 113, status: 'entry' },
  { date: '2027-05-09', end: '2027-05-14', pt: 'Gravel Birds XL', en: 'Gravel Birds XL', where: { pt: 'Castro Verde, Alentejo', en: 'Castro Verde, Alentejo' }, what: { pt: 'Ultra gravel · ~1 000 km', en: 'Ultra gravel · ~1,000 km' }, km: 1000, status: 'planned' },
  { date: '2027-07', pt: 'IRONMAN full distance', en: 'IRONMAN full distance', where: { pt: 'Península Ibérica', en: 'Iberian Peninsula' }, what: { pt: 'Qualificação para Kona', en: 'Kona qualifier' }, km: 226, status: 'tbc' },
  { date: '2027-10-09', pt: 'Kona, Havai', en: 'Kona, Hawaiʻi', where: { pt: 'Campeonato do Mundo IRONMAN', en: 'IRONMAN World Championship' }, what: { pt: '3,8 · 180 · 42,2 km', en: '3.8 · 180 · 42.2 km' }, km: 226, status: 'goal' },
];

// Season budget estimate (EUR). Entry fees from official race pages, Oct 2026.
export const BUDGET = [
  { pt: 'Viagens e alojamento', en: 'Travel and accommodation', eur: 7000, note: { pt: 'Kona (voos, 10 noites, transporte da bicicleta), Espanha e deslocações em Portugal', en: 'Kona (flights, 10 nights, bike transport), Spain and trips in Portugal' } },
  { pt: 'Inscrições', en: 'Race entries', eur: 3200, note: { pt: 'Oito provas; duas já garantidas por mérito', en: 'Eight races; two already won on merit' } },
  { pt: 'Treino, nutrição e saúde', en: 'Coaching, nutrition and health', eur: 3000, note: { pt: 'Treinador, suplementação, fisioterapia e testes', en: 'Coach, nutrition, physio and testing' } },
  { pt: 'Material e manutenção', en: 'Equipment and maintenance', eur: 2500, note: { pt: 'Pneus, transmissão, sapatilhas, fato de neoprene', en: 'Tyres, drivetrain, shoes, wetsuit' } },
];
