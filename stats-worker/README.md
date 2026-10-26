# Estatísticas do site (Cloudflare Worker `gocarmo-api`)

Conta as visitas do gocarmo.com com uma ferramenta nossa, sem cookies e sem saber quem são as pessoas, e mostra-as em
`/admin/analytics/`.

## O que faz

1. O site carrega `assets/js/stats.js`. Enquanto a página está aberta, junta o que se passa (até onde a pessoa desce,
   onde clica, quanto tempo fica em cada secção, se abre o estúdio 3D ou a janela de reserva) e envia tudo em 2 a 4
   pedidos por visita para este Worker (`POST /v1/e`).
2. O Worker confirma cada pedido (origem, tamanho, robôs, limites), deita fora tudo o que não está na lista do que se
   pode guardar e passa o resto a uma base de dados SQLite do Cloudflare (um Durable Object, na UE).
3. Todas as noites, às 00:20 de Lisboa, o próprio Worker resume o dia anterior em totais diários e apaga o que tem mais
   de 30 dias.
4. A página `/admin/analytics/` lê esses totais com a `ADMIN_KEY`: visitas, de onde vêm, onde estão, o que fazem na
   página, mapas de calor dos cliques, o funil de reserva, velocidade e erros.

## O que conta e o que nunca guarda

- **Sem cookies** e nada guardado no telemóvel de quem visita (só a escolha de não ser contado, se a pessoa a fizer).
- **Nunca guarda o endereço de internet (IP) nem o navegador completo.** Para contar visitantes únicos por dia, o Worker
  junta o endereço (num IPv6, só a primeira metade, a de cada casa ou telemóvel) e o navegador a uma chave aleatória do dia e guarda
  apenas o resultado. A chave do dia é apagada à meia-noite de Lisboa, por isso não dá para ligar dias diferentes nem
  saber quem é quem.
- **Onde estão**: país, região e cidade aproximada (a partir do IP, que não fica guardado); os pontos do mapa ficam
  arredondados a cerca de 10 km. Cidades e regiões com menos de 3 visitantes no período aparecem juntas em «Outras
  localidades».
- **Hora**: só o dia e a hora (sem minutos).
- **Cliques**: o botão ou elemento e o seu texto curto, nunca o que se escreve nos campos. Nada da janela de reserva além
  dos passos (abriu, enviou, copiou o IBAN), sem marcas, nomes, NIF, mensagens ou valores. Das ligações para fora só se
  guarda o site (instagram.com, whatsapp), nunca o endereço completo.
- **30 dias** de registos por visita; depois só totais por dia, durante 25 meses; depois totais por mês, sem cidades.
- Respeita o **Global Privacy Control** e o **Do Not Track** do navegador (nesses casos não envia nada) e o botão «Não
  contar as minhas visitas» da página de privacidade.
- Mapas de calor só com pelo menos 5 visualizações nessa largura de ecrã. O funil de reserva aparece só em totais, nunca
  por origem, local ou aparelho.
- **Nunca se cruzam estes dados com os pedidos de patrocínio, mensagens ou emails**, nem se usam para descobrir quem é
  alguém. Servem só para melhorar o site.
- Sem registos (logs) no Cloudflare: `[observability] enabled = false` no `wrangler.toml`.

## Os secrets (GitHub: Settings > Secrets and variables > Actions)

| Secret | O que é |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token do Cloudflare com o modelo «Edit Cloudflare Workers» (o mesmo dos Pedidos) |
| `CLOUDFLARE_ACCOUNT_ID` | O Account ID do Cloudflare (no painel, à direita, em Workers & Pages) |
| `ADMIN_KEY` | A palavra-passe do admin (pelo menos 16 caracteres), a mesma dos Pedidos. É pedida em `/admin/analytics/` |
| `SALT_SECRET` | **Não vai para o GitHub.** A action cria-o sozinha no Cloudflare na primeira vez e nunca mais o muda |

## Publicar

Cada push para `gh-pages` que mude `stats-worker/` publica o Worker sozinho (mudar só a action não publica). À mão:
**Actions > Deploy stats > Run workflow**. A action:

1. limpa os espaços e quebras de linha que vierem colados nos secrets (como a dos Pedidos) e confirma-os;
2. lê o subdomínio workers.dev da conta (hoje é `rgvduarte`) ou cria um se ainda não existir (`gocarmo`, ou
   `gocarmo-site` se esse estiver ocupado);
3. corre os testes (`npm test`) e só publica se passarem;
4. publica e cria o `SALT_SECRET` se faltar;
5. espera que o Worker responda e mostra no resumo da action o endereço, por exemplo
   `https://gocarmo-api.rgvduarte.workers.dev`, e o estado (`/health`).

## Ligar no site

Em `assets/js/data.js`, em `SITE.stats`, põe o endereço do resumo da action:

```js
stats: { url: 'https://gocarmo-api.rgvduarte.workers.dev', mode: 'exempt', campaigns: [] },
```

Depois corre `node scripts/stamp.mjs` (deixa as páginas `/admin/` e `/admin/analytics/` falarem com esse endereço) e
publica. Com `url: ''` o site não mede nada.

- `mode: 'exempt'`: conta sem perguntar, dentro das regras acima (sem cookies, só totais).
- `mode: 'consent'`: só começa depois de a pessoa aceitar no aviso de cookies (para o caso de a lei mudar).
- `mode: 'off'`: não mede nada.

## O painel

Abre `https://gocarmo.com/admin/analytics/` e entra com a `ADMIN_KEY`. A chave fica só nesse separador e sai quando
carregas em «Sair».

**Este aparelho**: ao entrar, o teu navegador fica marcado como interno e as tuas visitas não contam (aparecem só com
«Mostrar visitas internas»). Em janelas privadas ou noutros navegadores, entra no painel uma vez para os marcar também.

## Limites gratuitos

O plano gratuito do Cloudflare (Workers Free) chega com folga. Os pedidos por dia são da conta toda, partilhados com o
Worker dos Pedidos.

| O quê | Limite por dia | Com 100 visitas por dia | Com 2 000 visitas por dia |
|---|---|---|---|
| Pedidos ao Worker | 100 000 | ~500 | ~6 000 |
| Pedidos à base de dados | 100 000 | ~500 | ~8 000 |
| Linhas escritas | 100 000 | ~3 000 | ~45 000 |
| Linhas lidas | 5 000 000 | ~50 000, mais 25 000 a 40 000 por separador aberto com 90 dias | ~1 000 000 |
| Espaço | 1 GB | < 20 MB | ~300 MB |

O separador «Dados» do painel mostra estes números dia a dia. Uma resposta do painel para dias já fechados (7, 30 e 90
dias acabam sempre ontem) fica guardada até ao resumo da noite seguinte: voltar a abrir o mesmo separador lê uma linha só.

**Se um limite for passado**, o Cloudflare deixa de aceitar esse tipo de operação até à meia-noite UTC (01:00 em Lisboa
no verão, 00:00 no inverno). O limite de pedidos por dia é da conta toda: passado esse, também o Worker dos Pedidos deixa
de responder até à meia-noite UTC (os pedidos de patrocínio seguem só como mensagem). Para não chegar lá por causa de
alguém que mande sinais falsos, o contador:

- aceita no máximo 30 sinais por minuto de cada endereço (os 256 endereços de um bloco /24 contam como um);
- conta no máximo 300 visualizações novas por dia de cada um desses blocos;
- deixa de registar visualizações novas quando o dia chega às 80 000 linhas escritas (as visitas desse resto do dia
  perdem-se; o «Dados» mostra-as como «Limite do dia»);
- responde ao `/health` com o que viu há menos de um minuto, sem perguntar outra vez à base de dados.

## Testar no computador

```sh
cd stats-worker
npm ci
printf 'ADMIN_KEY=sim-admin-key-0123456789\nSALT_SECRET=%s\nDEV_HOOKS=1\n' "$(openssl rand -hex 32)" > .dev.vars
npm run dev        # o Worker em http://127.0.0.1:8787 (com os dados num ficheiro local, em .wrangler/)
npm test           # os testes (não precisam do npm run dev)
npm run seed -- --reset   # noutro terminal: enche o Worker local com 2 semanas de visitas inventadas
```

O `.dev.vars` liga as ferramentas de teste (`DEV_HOOKS=1`): relógio, endereço e local falsos com os cabeçalhos
`X-Dev-Now`, `X-Dev-Ip` e `X-Dev-Cf`, e `POST /admin/v1/dev/reset`, `POST /admin/v1/dev/rollup {day}` e
`GET /admin/v1/dev/dump`. **Nunca** se põe `DEV_HOOKS` no `wrangler.toml` (a action recusa publicar). O `npm run dev`
desliga o registo local de pedidos do wrangler (`X_LOCAL_OBSERVABILITY=false`), que falha com muitos pedidos seguidos.

## Problemas

- **«Subdomínio workers.dev» na action**: o token não consegue ler nem criar o subdomínio. Confirma que o token usa o
  modelo «Edit Cloudflare Workers» e que o `CLOUDFLARE_ACCOUNT_ID` é o da conta certa. Também podes abrir uma vez
  **Workers & Pages** no painel do Cloudflare e escolher o subdomínio lá.
- **`store: false` no estado**: o Worker não chega à base de dados. Se `eu` está `true`, o Cloudflare pode estar a
  recusar guardar dados na UE neste plano: põe `STORE_JURISDICTION = ""` no `stats-worker/wrangler.toml` e corre a action
  outra vez. Só se pode fazer isto **antes de haver dados** (com outro valor, o Worker passa a usar outra base de dados,
  vazia). Depois de haver dados, nunca mudes este valor.
- **Perdeste a `ADMIN_KEY`?** Cria uma nova (`openssl rand -hex 24`), põe-na no secret `ADMIN_KEY` do GitHub e corre as
  duas actions: **Deploy stats** e **Deploy pedidos**. A antiga deixa de servir.
- **O painel diz «Chave errada»**: a chave do painel tem de ser a `ADMIN_KEY` do GitHub tal como estava quando a action
  correu pela última vez. Se mudaste o secret, corre **Deploy stats** outra vez.
- **O painel diz que não consegue falar com o contador**: confirma `SITE.stats.url` em `assets/js/data.js` e que correste
  `node scripts/stamp.mjs` depois de o mudar (sem isso, a página do admin não tem autorização para falar com o Worker).
- **Bloqueadores de anúncios**: os endereços (`/v1/e`, `/v1/f`) e o nome `gocarmo-api` foram escolhidos para não estarem
  nas listas dos bloqueadores. Quem os bloquear mesmo assim simplesmente não é contado. O teu próprio bloqueador não
  importa: as tuas visitas são internas.
- **`salt: false`**: falta o `SALT_SECRET` no Worker. Corre a action outra vez: ela cria-o.
- **Mudar o `SALT_SECRET` de propósito** (não costuma ser preciso): apaga-o no painel do Cloudflare (Workers & Pages >
  gocarmo-api > Settings > Variables and Secrets) e corre a action. Os visitantes desse dia ficam contados duas vezes.

## Para quem mexe no código

Sem dependências. `src/index.js` (pedidos, CORS, chave, limites), `src/store.js` (a base de dados, o resumo da noite),
`src/schema.js` (tudo o que se pode guardar: zonas, espaços, eventos e os seus parâmetros), `src/sanitize.js`,
`src/derive.js` (uma visualização em totais), `src/query.js` (as respostas do painel), `src/csv.js`, `src/time.js`,
`src/ua.js`. Os testes estão em `test/` (`npm test`). Qualquer campo, evento ou gráfico novo com dados de visitas tem de
caber nas regras de «O que conta e o que nunca guarda»: entra primeiro na lista de `src/schema.js`, e só depois no site.

| Pedido | Resposta |
|---|---|
| `POST /v1/e` | `204`. Corpo JSON em `text/plain`, até 16 KB, do site (`Origin`) |
| `POST /v1/f` | `204`. A resposta à pergunta rápida, até 1 KB |
| `GET /health` | `{ ok, v, schema, store, eu, salt, admin, limits, dev }`, só verdadeiro ou falso |
| `GET /admin/v1/ping` · `now` · `overview` · `audience` · `content` · `heatmap` · `studio` · `booking` · `contacts` · `quality` · `feedback` · `system` | (admin) JSON com os totais. Parâmetros `p=24h\|7d\|30d\|90d\|custom` (`from`, `to`), `dev`, `int`, `cmp`; `vw` no `heatmap`. Um período com o dia de hoje (`24h`, ou `custom` até hoje) só no `overview` (só totais) e no `system`: os outros respondem `400 periodo` |
| `POST /admin/v1/notes`, `DELETE /admin/v1/notes/<id>` | (admin) anotações no gráfico das visitas |
| `GET /admin/v1/export.csv?t=<tabela>` | (admin) CSV para o Excel |

Os pedidos de admin levam `Authorization: Bearer <ADMIN_KEY>`, com um limite de 120 por minuto por endereço (contado
antes de a chave ser vista). Os erros são `{ "error": "<código>" }`: `origem` (403),
`metodo` (405), `nada` (404), `tamanho` (413), `json`, `versao`, `esquema`, `periodo`, `filtro` (400), `limite` (429),
`chave` (401), `interno` (500).
