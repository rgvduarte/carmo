# Gonçalo Carmo · Road to Kona

Página de atleta e plataforma de patrocínio do fato de competição da época 2027.
Site estático (HTML, CSS, JS) publicado no GitHub Pages, sem build nem servidor.

**Live:** https://gocarmo.com/

## O que está na página

- **Hero e tese**: quem é, porquê patrocinar agora e os números-chave.
- **A prova**: cena controlada pelo scroll (natação, bicicleta, corrida e meta) com o contador dos 226 km.
- **Resultados**: resultados oficiais e gráficos (meias distâncias, parciais do IRONMAN, lugar na geral).
- **Telemetria**: dados do Strava, que aparecem sozinhos quando a sincronização estiver ligada.
- **Ouve o que eu ouço**: a playlist do Gonçalo no Spotify, no fim de Telemetria. Só aparece quando houver link em `SITE.playlist`. Nada carrega do Spotify até o visitante escolher «Ouvir aqui»; depois, o leitor pode ficar fixo no fundo do ecrã enquanto se navega (fecha no × ou com Esc). No telemóvel, com um pacote aberto no estúdio, o leitor sai da frente da tabela de preços sem parar a música, e o botão ♪ da barra do pacote trá-lo de volta.
- **Época 2027**: sete provas, com um IRONMAN de qualificação para Kona. Kona entra no calendário quando houver vaga.
- **O fato**: modelo 3D com 20 espaços à venda. Dá para rodar, escolher, experimentar o logótipo, descarregar o mockup, juntar num pacote e reservar por WhatsApp, email ou Instagram.
- **Apoiar**: GoFundMe, apoio em espécie e orçamento estimado da época.
- **Contacto** e **media kit** (o botão imprime a página como PDF limpo).

PT e EN (botão no topo; a língua também segue o browser).

## Atualizar conteúdos

| O quê | Onde |
|---|---|
| Preços, estado (`available` / `reserved` / `sold`) e textos dos espaços | `data/spots.json` |
| Preço do fato completo e desconto de pacote | `data/spots.json` → `title`, `bundle` |
| Link do GoFundMe | `assets/js/data.js` → `SITE.gofundme` |
| IBAN, titular e MB WAY | `assets/js/data.js` → `SITE.iban`, `SITE.payee`, `SITE.mbway` |
| Resultados, calendário 2027, orçamento | `assets/js/data.js` |
| Playlist do Spotify: link, artistas, músicas por fase | `assets/js/data.js` → `SITE.playlist`, `PLAYLIST` |
| Textos da página | `index.html` (PT) e `assets/js/i18n.js` (EN) |
| Fotografias | `assets/img/` (WebP + JPG, 800/1600 px) |

## Vender um espaço

**Como se paga.** Transferência bancária para o IBAN que aparece no pedido de reserva (e em Apoiar).
O site mostra o montante já com desconto e um descritivo com os números dos espaços, por exemplo
`KONA 01` ou `KONA 09 16 20`, para cada pagamento se ligar ao pedido sem dúvidas. O fato completo usa
`KONA FATO` e os donativos `KONA APOIO`. IBAN, titular e MB WAY (opcional) estão em `assets/js/data.js` → `SITE`.

**O fluxo.**
1. A marca escolhe e envia o pedido (WhatsApp, email ou Instagram), com marca, NIF e referência.
2. Confirmas em 24 horas. Se a marca precisar de tempo, marcas o espaço como **Reservado**: fica guardado
   três dias e depois volta a ficar disponível sozinho, sem teres de fazer nada.
3. Quando a transferência entra, marcas como **Vendido**. O espaço fecha para toda a gente, sai do pacote
   e do tour, mostra «Vendido · Marca» na tabela, a marca entra na lista «Já no fato» e, se enviares o
   logótipo, ele aparece no fato 3D.
4. Se duas pessoas pagarem o mesmo espaço, fica com ele quem pagou primeiro e devolves o valor ao outro
   no próprio dia (está escrito no pedido).

**Como fechar um espaço pelo telemóvel (sem mexer em código).**
No GitHub (app ou browser): Issues → New issue → **Atualizar espaço do fato**. Escolhe o espaço e o estado,
escreve a marca, cola o link e arrasta o logótipo (PNG com fundo transparente). Ao submeter, a action
`Atualizar espaço do fato` muda o `data/spots.json`, guarda o logótipo em `assets/img/brands/`,
responde no próprio pedido e fecha-o. O site atualiza-se em cerca de um minuto.
Só funciona para quem gere o repositório e precisa que o branch por defeito seja `gh-pages`
(Settings → General → Default branch). Se mudares espaços ou preços, corre
`node scripts/spot-update.mjs --template` para atualizar a lista do formulário.

**À mão.** No `data/spots.json`, cada espaço aceita:

| Campo | Exemplo | Para quê |
|---|---|---|
| `status` | `"available"`, `"reserved"`, `"sold"` | Estado do espaço |
| `brand` | `"Padaria Central"` | Nome mostrado no site |
| `url` | `"https://padaria.pt"` | Link da marca na lista «Já no fato» |
| `logo` | `"assets/img/brands/peito.png"` | Logótipo impresso no fato 3D |
| `logoMono` | `"#f6f7f9"` | Força uma cor única no logótipo (por defeito, logótipos escuros ficam brancos sobre o preto) |
| `until` | `"2026-10-31"` | Último dia da reserva |

O `title` (fato completo) aceita os mesmos campos. Vendido, fecha os 20 espaços com o nome da marca e
põe o logótipo no peito.

## Ligar a playlist (uma vez)

1. No Spotify, com a playlist **Go Hard and Go Carmo** pública: Partilhar → Copiar link da playlist.
2. Cola o link em `assets/js/data.js` → `SITE.playlist` (por exemplo `'https://open.spotify.com/playlist/…'`) e faz push.
   O `?si=…` do fim pode ficar, o site ignora-o.
3. Se a playlist mudar de tamanho ou de ordem, atualiza `PLAYLIST.phases` (músicas por fase) no mesmo ficheiro.

Para ver a secção antes de haver link, abre o site local com `?playlist=` e qualquer playlist (ou música) pública,
por exemplo `http://localhost:8000/?playlist=https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP`.
Só funciona em `localhost`, `127.0.0.1` ou num endereço da rede de casa (para testar no telemóvel). Em gocarmo.com,
e em qualquer outro endereço público, é ignorado de propósito, para ninguém mostrar outra playlist como se fosse a do Gonçalo.

## Ligar o Strava (uma vez)

Os dados do Strava só são visíveis com sessão iniciada, por isso a página usa a API oficial com a autorização do Gonçalo:

1. Em https://www.strava.com/settings/api cria uma aplicação (Website: `https://gocarmo.com/`, Authorization Callback Domain: `localhost`).
2. Abre, com a conta do Gonçalo:
   `https://www.strava.com/oauth/authorize?client_id=CLIENT_ID&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=read,activity:read_all`
3. Depois de autorizar, o browser vai para `http://localhost/?code=XXXX…`. Copia o valor de `code`.
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

- Fato 3D procedimental feito de raiz em [three.js](https://threejs.org) (MIT). Geometria, textura e espaços são gerados em código.
- Scroll suave com [Lenis](https://github.com/darkroomengineering/lenis) (MIT) e cenas de scroll com [GSAP ScrollTrigger](https://gsap.com).
- Tipografia: Anton, Inter e JetBrains Mono (Google Fonts, OFL).
- Fotografias: portefólio do atleta.
