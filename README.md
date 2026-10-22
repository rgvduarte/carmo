# Gonçalo Carmo · Road to Kona

Página de atleta e plataforma de patrocínio do fato de competição da época 2027.
Site estático (HTML, CSS, JS) publicado no GitHub Pages — sem build, sem servidor.

**Live:** https://rgvduarte.github.io/carmo/

## O que está na página

- **Hero e tese** — quem é, porquê patrocinar agora, os números-chave.
- **A prova** — cena controlada pelo scroll: natação → bicicleta → corrida → meta, com o contador dos 226 km.
- **Resultados** — tabela de tempos e gráficos (meias distâncias, IRONMAN, ritmos de corrida).
- **Telemetria** — dados do Strava (aparecem automaticamente quando a sincronização estiver ligada).
- **Época 2027** — calendário até ao Campeonato do Mundo IRONMAN em Kona (9 out. 2027).
- **O fato** — modelo 3D com 20 espaços à venda: rodar, tocar, experimentar o logótipo, descarregar mockup, juntar num pacote e reservar por WhatsApp, email ou Instagram.
- **Apoiar** — GoFundMe, apoio em espécie e o orçamento estimado da época.
- **Contacto** e **media kit** (o botão imprime a página como PDF limpo).

PT e EN (botão no topo; a língua também segue o browser).

## Atualizar conteúdos

| O quê | Onde |
|---|---|
| Preços, estado (`available` / `reserved` / `sold`) e textos dos espaços | `data/spots.json` |
| Preço do fato completo e desconto de pacote | `data/spots.json` → `title`, `bundle` |
| Link do GoFundMe | `assets/js/data.js` → `SITE.gofundme` |
| Resultados, calendário 2027, orçamento | `assets/js/data.js` |
| Textos da página | `index.html` (PT) e `assets/js/i18n.js` (EN) |
| Fotografias | `assets/img/` (WebP + JPG, 800/1600 px) |

Marcar um espaço como vendido: muda `"status": "available"` para `"sold"` no `data/spots.json`.
O espaço passa a aparecer riscado no fato e na tabela, e sai do tour e do pacote.

## Ligar o Strava (uma vez)

Os dados do Strava só são visíveis com sessão iniciada, por isso a página usa a API oficial com a autorização do Gonçalo:

1. Em https://www.strava.com/settings/api cria uma aplicação (Website: `https://rgvduarte.github.io/carmo/`, Authorization Callback Domain: `localhost`).
2. Abre, com a conta do Gonçalo:
   `https://www.strava.com/oauth/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=read,activity:read_all`
3. Depois de autorizar, o browser vai para `http://localhost/?code=XXXX…` — copia o `code`.
4. Troca o código pelo refresh token:
   `curl -X POST https://www.strava.com/oauth/token -d client_id=CLIENT_ID -d client_secret=CLIENT_SECRET -d code=CODE -d grant_type=authorization_code`
5. No GitHub: Settings → Secrets and variables → Actions → New repository secret, cria
   `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET` e `STRAVA_REFRESH_TOKEN`.
6. Actions → **Strava sync** → Run workflow. A partir daí corre todas as manhãs.

Só são publicados agregados (horas por semana e por dia, totais de 12 meses). Nunca rotas, GPS ou localização.

Alternativa sem API: em Strava → Settings → My Account → *Download your data*, extrai `activities.csv` e corre
`node scripts/strava-sync.mjs --csv caminho/para/activities.csv`, depois faz commit de `data/strava.json`.

## Correr localmente

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Créditos técnicos

- Fato 3D procedimental feito de raiz em [three.js](https://threejs.org) (MIT) — geometria, textura e espaços gerados em código.
- Scroll suave com [Lenis](https://github.com/darkroomengineering/lenis) (MIT) e cenas de scroll com [GSAP ScrollTrigger](https://gsap.com).
- Tipografia: Anton, Inter e JetBrains Mono (Google Fonts, OFL).
- Fotografias: portefólio do atleta.
