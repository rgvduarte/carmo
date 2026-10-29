// Content that changes during the season lives here: links, results, calendar, budget.
// Edit this file (or data/spots.json for the suit) and push; the page updates itself.

export const SITE = {
  name: 'Gonçalo Carmo',
  instagram: 'goncalo.carmo99',
  whatsapp: '351916395103',
  email: 'allez@gocarmo.com',
  strava: 'https://www.strava.com/athletes/50182673',
  // The GoFundMe link and its numbers live in data/gofundme.json (README → GoFundMe), not here.
  // Own visit counting, no cookies (stats-worker/README.md). url: the Worker's address from the summary of the
  // «Deploy stats» action, e.g. 'https://gocarmo-api.rgvduarte.workers.dev'. Empty = nothing is measured.
  // mode: 'exempt' (counts without asking, within the privacy rules), 'consent' (waits for the banner's yes) or 'off'.
  // After changing url, run node scripts/stamp.mjs: it lets the admin pages reach that address.
  stats: { url: 'https://gocarmo-api.rgvduarte.workers.dev', mode: 'exempt', campaigns: [] },
  // Bank transfer, shown in the booking dialog and in "Apoiar". Since October 2025 banks check the
  // payee name against the IBAN before sending, so `payee` must be the exact account holder name.
  iban: 'PT50003501250000532893068',
  payee: 'Gonçalo Carmo',
  // MB WAY: the phone number linked to it, shown as a second way to pay in the booking dialog. Leave empty to hide it.
  // MB WAY lets a person send at most 2 000 EUR per transfer (mbway.pt, 2025 limits), so above `mbwayMax` the dialog
  // offers the bank transfer only.
  mbway: '916395103',
  mbwayMax: 2000,
  // The booking-request Worker (worker/README.md): its workers.dev address, from the summary of the «Deploy pedidos»
  // action, e.g. 'https://gocarmo-pedidos.<conta>.workers.dev'. Empty: the admin page shows no «Pedidos» list.
  // After changing it, run node scripts/stamp.mjs (it also lets the admin page reach this address).
  requestsApi: 'https://gocarmo-pedidos.rgvduarte.workers.dev',
  // Google Analytics 4 Measurement ID, e.g. G-XXXXXXXXXX. Empty = no analytics, no banner.
  // (Set up in the README, "Google Analytics". The tag loads only after the visitor accepts: analytics.js.)
  ga: '',
  updated: '2026-10-22',
};

// Official results (timing companies / IRONMAN), checked 22 Oct 2026. They feed the marks stage and the
// «Todas as provas» cards; after an edit here run `node scripts/stamp.mjs`, which also writes the cards into index.html.
// `rank`/`field`: overall place. `note`: one line in my words (shown on the stage, and on the running cards).
// Triathlons: `splits` (swim, t1, bike, t2, run) and `ag`, the age-group place (`field` left out when unknown).
// Running races: `pace` per km. `tag` (optional): a label on the card, e.g. «Primeiro triatlo».
// `md` marks middle-distance triathlons used in the progression chart.
export const RESULTS = [
  { year: 2026, pt: 'IRONMAN Portugal-Cascais', en: 'IRONMAN Portugal-Cascais', place: 'Cascais, Portugal', dist: '3,8 · 180 · 42,2 km', time: '9:35:08', rank: 52, field: 1981, date: '2026-10-17',
    note: { pt: '12.º de 321 no escalão M25-29, com a maratona em 3:27.', en: '12th of 321 in M25-29, with a 3:27 marathon.' },
    splits: { swim: '1:01:42', t1: '6:00', bike: '4:56:43', t2: '3:22', run: '3:27:22' },
    ag: { rank: 12, field: 321, cat: 'M25-29' }, tag: { pt: 'Distância completa', en: 'Full distance' } },
  { year: 2026, pt: 'Triatlo de Sines', en: 'Sines Triathlon', place: 'Sines, Portugal', dist: '2 · 80 · 18 km', time: '3:42:32', rank: 6, field: 743, date: '2026-09-27',
    note: { pt: 'Vitória no escalão M25-29, entre 83 atletas.', en: 'Age-group win in M25-29, out of 83.' },
    splits: { swim: '30:12', t1: '2:27', bike: '1:59:45', t2: '1:52', run: '1:08:16' },
    ag: { rank: 1, field: 83, cat: 'M25-29' } },
  { year: 2026, pt: 'Corrida de Santo António', en: 'Santo António 10K', place: { pt: 'Lisboa, Portugal', en: 'Lisbon, Portugal' }, dist: '10 km', time: '33:48', rank: 15, field: 4694, date: '2026-06-07',
    note: { pt: '10 km a 3:23 por quilómetro.', en: '10 km at 3:23 per kilometre.' },
    pace: '3:23' },
  { year: 2026, pt: 'Lidl Setúbal Triathlon', en: 'Lidl Setúbal Triathlon', place: 'Setúbal, Portugal', dist: '1,9 · 90 · 21,1 km', time: '4:26:49', min: 266.82, md: true, rank: 11, field: 802, date: '2026-04-12',
    note: { pt: '2.º de 84 no escalão M25-29.', en: '2nd of 84 in M25-29.' },
    splits: { swim: '33:48', t1: '3:05', bike: '2:29:37', t2: '0:55', run: '1:19:13' },
    ag: { rank: 2, field: 84, cat: 'M25-29' } },
  { year: 2026, pt: 'Meia Maratona de Cascais', en: 'Cascais Half Marathon', place: 'Cascais, Portugal', dist: '21,1 km', time: '1:19:48', rank: 41, field: 4179, date: '2026-02-01',
    note: { pt: 'Meia maratona a 3:47 por quilómetro.', en: 'Half marathon at 3:47 per kilometre.' },
    pace: '3:47' },
  { year: 2026, pt: 'Zurich Maratón de Sevilla', en: 'Zurich Seville Marathon', place: { pt: 'Sevilha, Espanha', en: 'Seville, Spain' }, dist: '42,2 km', time: '2:44:13', rank: 698, field: 12449, date: '2026-02-15',
    note: { pt: 'Primeira maratona abaixo das 2h45.', en: 'First marathon under 2:45.' },
    pace: '3:54' },
  { year: 2025, pt: 'Meia Maratona dos Descobrimentos', en: 'Descobrimentos Half Marathon', place: { pt: 'Lisboa, Portugal', en: 'Lisbon, Portugal' }, dist: '21,1 km', time: '1:16:56', rank: 28, field: 5305, date: '2025-11-30',
    note: { pt: 'A minha melhor meia maratona, a 3:39 por quilómetro.', en: 'My best half marathon, at 3:39 per kilometre.' },
    pace: '3:39' },
  { year: 2025, pt: 'IRONMAN 70.3 Cascais', en: 'IRONMAN 70.3 Cascais', place: 'Cascais, Portugal', dist: '1,9 · 90 · 21,1 km', time: '4:27:16', min: 267.27, md: true, rank: 31, field: 2353, date: '2025-10-18',
    note: { pt: 'Estreia no IRONMAN 70.3. 7.º de 151 no escalão M18-24.', en: 'IRONMAN 70.3 debut. 7th of 151 in M18-24.' },
    splits: { swim: '31:22', t1: '4:23', bike: '2:22:30', t2: '2:35', run: '1:26:25' },
    ag: { rank: 7, field: 151, cat: 'M18-24' }, tag: { pt: 'Estreia IRONMAN 70.3', en: 'IRONMAN 70.3 debut' } },
  { year: 2025, pt: 'Triatlo Longo de Caminha', en: 'Caminha Long Triathlon', place: 'Caminha, Portugal', dist: '1,9 · 90 · 20,7 km', time: '4:32:54', min: 272.9, md: true, rank: 61, field: 360, date: '2025-05-24',
    note: { pt: 'O primeiro triatlo. 4.º no escalão 20-24.', en: 'My first triathlon. 4th in the 20-24 age group.' },
    splits: { swim: '26:21', t1: '2:24', bike: '2:31:53', t2: '1:18', run: '1:30:57' },
    ag: { rank: 4, cat: '20-24' }, tag: { pt: 'Primeiro triatlo', en: 'First triathlon' } },
];


// Instagram @goncalo.carmo99, read from the platform on 2026-10-22 (12 most recent posts).
export const SOCIAL = { followers: 1921, likesPerPost: 329, commentsPerPost: 43, bestPost: 881, asOf: '2026-10-22' };

// 2027 season, in date order. status: planned | entry (won on merit) | pending | tbc | goal
export const SEASON = [
  { date: '2027-02-21', pt: 'Maratona de Sevilha', en: 'Seville Marathon', where: { pt: 'Sevilha, Espanha', en: 'Seville, Spain' }, what: { pt: 'Maratona · 42,2 km', en: 'Marathon · 42.2 km' }, km: 42.2, status: 'planned' },
  { date: '2027-04-03', pt: 'IRONMAN 70.3 Vilamoura', en: 'IRONMAN 70.3 Vilamoura', where: { pt: 'Vilamoura, Algarve', en: 'Vilamoura, Algarve' }, what: { pt: 'Meia distância · 1.ª edição', en: 'Middle distance · 1st edition' }, km: 113, status: 'pending' },
  { date: '2027-04-24', pt: 'Mallorca 312', en: 'Mallorca 312', where: { pt: 'Maiorca, Espanha', en: 'Mallorca, Spain' }, what: { pt: 'Ciclismo · 312 km', en: 'Cycling · 312 km' }, km: 312, status: 'pending' },
  { date: '2027-05-02', pt: 'Lidl Setúbal Triathlon', en: 'Lidl Setúbal Triathlon', where: { pt: 'Setúbal, Portugal', en: 'Setúbal, Portugal' }, what: { pt: 'Meia distância', en: 'Middle distance' }, km: 113, status: 'entry' },
  { date: '2027-05-09', end: '2027-05-14', pt: 'Gravel Birds XL', en: 'Gravel Birds XL', where: { pt: 'Castro Verde, Alentejo', en: 'Castro Verde, Alentejo' }, what: { pt: 'Ultra gravel · ~1 000 km', en: 'Ultra gravel · ~1,000 km' }, km: 1000, status: 'planned' },
  { date: '2027-07', pt: 'IRONMAN de qualificação', en: 'Qualifying IRONMAN', where: { pt: 'Península Ibérica', en: 'Iberian Peninsula' }, what: { pt: 'Qualificação para Kona', en: 'Kona qualifier' }, km: 226, status: 'tbc' },
  { date: '2027-09', pt: 'Triatlo de Sines', en: 'Sines Triathlon', where: { pt: 'Sines, Portugal', en: 'Sines, Portugal' }, what: { pt: 'Triatlo · 2 · 80 · 18 km', en: 'Triathlon · 2 · 80 · 18 km' }, km: 100, status: 'entry' },
  // Kona has no date until the slot is won: it is the goal, not a counted race
  { date: '', label: { pt: 'Garantindo qualificação', en: 'Once qualified' }, pt: 'Kona, Havai', en: 'Kona, Hawaiʻi', where: { pt: 'Campeonato do Mundo IRONMAN', en: 'IRONMAN World Championship' }, what: { pt: '3,8 · 180 · 42,2 km', en: '3.8 · 180 · 42.2 km' }, km: 226, status: 'goal' },
];

// Season budget estimate (EUR). Entry fees from official race pages, Oct 2026.
export const BUDGET = [
  { pt: 'Viagens e alojamento', en: 'Travel and accommodation', eur: 7000, note: { pt: 'Provas em Espanha e em Portugal e, garantindo a qualificação, a viagem a Kona (voos, 10 noites, transporte da bicicleta)', en: 'Races in Spain and Portugal and, once qualified, the trip to Kona (flights, 10 nights, bike transport)' } },
  { pt: 'Inscrições', en: 'Race entries', eur: 3200, note: { pt: 'Sete provas e, garantindo a qualificação, Kona. Setúbal e Sines já estão garantidas por mérito.', en: 'Seven races and, once qualified, Kona. Setúbal and Sines already earned on merit.' } },
  { pt: 'Treino, nutrição e saúde', en: 'Coaching, nutrition and health', eur: 3000, note: { pt: 'Treinador, suplementação, fisioterapia e testes', en: 'Coach, nutrition, physio and testing' } },
  { pt: 'Material e manutenção', en: 'Equipment and maintenance', eur: 2500, note: { pt: 'Pneus, transmissão, sapatilhas, fato de neoprene', en: 'Tyres, drivetrain, shoes, wetsuit' } },
];
