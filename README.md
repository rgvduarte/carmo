# Gonçalo Carmo · Road to Kona

Página de atleta e plataforma de patrocínio do fato e do capacete de competição da época 2027.
Site estático (HTML, CSS, JS) publicado no GitHub Pages, sem build nem servidor.

**Live:** https://gocarmo.com/

## O que está na página

- **Hero e tese**: quem é, porquê patrocinar agora e os números-chave.
- **A prova**: cena controlada pelo scroll (natação, bicicleta, corrida e meta) com o contador dos 226 km.
- **Resultados**: resultados oficiais e gráficos (meias distâncias, parciais do IRONMAN, lugar na geral).
- **Telemetria**: dados do Strava, que aparecem sozinhos quando a sincronização estiver ligada.
- **Época 2027**: sete provas, com um IRONMAN de qualificação para Kona. Kona entra no calendário quando houver vaga.
- **O fato e o capacete**: estúdio 3D com 24 espaços à venda, 20 no fato e 4 no capacete aero (botão Fato | Capacete). Dá para rodar, escolher, experimentar o logótipo, descarregar o mockup, juntar num pacote, reservar por WhatsApp, email ou Instagram e pagar por transferência ou MB WAY.
- **Apoiar**: GoFundMe, apoio em espécie e orçamento estimado da época.
- **Contacto** e **media kit** (o botão imprime a página como PDF limpo).

PT e EN (botão no topo; a língua também segue o browser).

## Atualizar conteúdos

| O quê | Onde |
|---|---|
| Preços, estado (`available` / `reserved` / `sold`) e textos dos espaços | `data/spots.json` |
| Preço do fato completo e desconto de pacote | `data/spots.json` → `title`, `bundle` |
| Link do GoFundMe | `assets/js/data.js` → `SITE.gofundme` |
| IBAN, titular e MB WAY | `assets/js/data.js` → `SITE.iban`, `SITE.payee`, `SITE.mbway`, `SITE.mbwayMax` |
| Resultados, calendário 2027, orçamento | `assets/js/data.js` |
| Textos da página | `index.html` (PT) e `assets/js/i18n.js` (EN) |
| Fotografias | `assets/img/` (WebP + JPG, 800/1600 px) |

## Vender um espaço

**Como se paga.** Transferência bancária para o IBAN que aparece no pedido de reserva (e em Apoiar), ou MB WAY
para o número do Gonçalo (916 395 103) até 2 000 € por envio, o máximo que o MB WAY deixa mandar de uma vez.
Acima disso, como o fato completo (3 000 €), o pedido só mostra a transferência. O site mostra o montante já com
desconto e um descritivo com os números dos espaços, por exemplo `KONA 01` ou `KONA 09 16 20`, para cada pagamento se
ligar ao pedido sem dúvidas. Os espaços do capacete são
os números 21 a 24, por isso um pacote com fato e capacete fica, por exemplo, `KONA 01 21 22`. O fato completo usa
`KONA FATO` e os donativos `KONA APOIO`. IBAN, titular, número MB WAY e o limite por envio estão em
`assets/js/data.js` → `SITE` (`mbway: ''` esconde o MB WAY).
Receber por MB WAY tem limite da SIBS: 5 000 € e 50 transferências por mês. Num mês com vendas grandes, pede transferência.

**O fluxo.**
1. A marca escolhe os espaços e carrega em **Reservar**. O pedido tem dois passos, um ecrã cada:
   **Reservar** (o resumo numa linha, a marca, o nome e, se quiser, NIF e mensagem) e **Pagar**
   (Transferência ou MB WAY, cada um com três linhas para copiar: IBAN ou número, montante e código `KONA`).
   Ao enviar o pedido por WhatsApp, email ou Instagram, a app abre com a mensagem pronta e o pedido passa
   sozinho ao passo Pagar, à espera quando a marca voltar ao site (mesmo que o telemóvel tenha recarregado a página).
   **Feito** fecha o pedido e esvazia o pacote. O email abre a app de email do aparelho com a mesma mensagem; se a
   marca escrever uma mensagem muito longa, o email leva só o início (há apps que não abrem links de email enormes)
   e o pedido avisa-a de que pelo WhatsApp vai inteira.
2. Confirmas em 24 horas. Se a marca precisar de tempo, marcas o espaço como **Reservado**: fica guardado
   três dias e depois volta a ficar disponível sozinho, sem teres de fazer nada.
3. Quando o pagamento entra, marcas como **Vendido**. O espaço fecha para toda a gente, sai do pacote
   e do tour, mostra «Vendido · Marca» na tabela, a marca entra na lista de marcas («Já no fato», «Já no capacete»
   ou os dois) e, se enviares o logótipo, ele aparece no fato ou no capacete 3D.
4. Se duas pessoas pagarem o mesmo espaço, fica com ele quem pagou primeiro e devolves o valor ao outro
   no próprio dia (está escrito no pedido).

**Como fechar um espaço pelo telemóvel (sem mexer em código).**
No GitHub (app ou browser): Issues → New issue → **Atualizar espaço do fato ou do capacete**. Escolhe o espaço e o estado,
escreve a marca, cola o link e arrasta o logótipo (PNG com fundo transparente). Ao submeter, a action
`Atualizar espaço do fato ou do capacete` muda o `data/spots.json`, guarda o logótipo em `assets/img/brands/`,
responde no próprio pedido e fecha-o. O site atualiza-se em cerca de um minuto.
Só funciona para quem gere o repositório e precisa que o branch por defeito seja `gh-pages`
(Settings → General → Default branch). Se mudares espaços ou preços, corre
`node scripts/spot-update.mjs --template` para atualizar a lista do formulário.

**À mão.** No `data/spots.json`, cada espaço aceita:

| Campo | Exemplo | Para quê |
|---|---|---|
| `status` | `"available"`, `"reserved"`, `"sold"` | Estado do espaço |
| `brand` | `"Padaria Central"` | Nome mostrado no site |
| `url` | `"https://padaria.pt"` | Link da marca na lista de marcas («Já no fato» / «Já no capacete») |
| `logo` | `"assets/img/brands/peito.png"` | Logótipo impresso no fato ou no capacete 3D |
| `logoMono` | `"#f6f7f9"` | Força uma cor única no logótipo (por defeito, logótipos escuros ficam brancos sobre o preto) |
| `until` | `"2026-10-31"` | Último dia da reserva |
| `item` | `"helmet"` | O espaço é no capacete (sem este campo, é no fato) |

O `title` (fato completo) aceita os mesmos campos. Vendido, fecha os 20 espaços do fato com o nome da marca e
põe o logótipo no peito. O capacete fica de fora: os 4 espaços dele vendem-se à parte, e o desconto de pacote
conta os espaços do fato e do capacete juntos.

A posição de cada espaço também está no `data/spots.json`. No fato: `part` (`torso`, `legL`, …), `phi` (graus à
volta do corpo, 0 = frente), `t` (altura em metros), `w` × `h` (cm) e `rot`. No capacete: `part: "shell"`, `phi` é o
ângulo no arco (0 = linha do topo, +90 = lado esquerdo), `t` são metros ao longo do topo a contar da viseira, e `rot`
pode ser 0, ±90 ou 180.

**Links diretos.** `gocarmo.com/#fato/peito` abre um espaço do fato, `gocarmo.com/#capacete/capacete-topo` um do
capacete e `gocarmo.com/#capacete` abre o estúdio no capacete. `#fato/title` pede o fato completo e
`#pacote=peito,capacete-topo` abre um pacote.

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

- Fato e capacete 3D procedimentais, feitos de raiz em [three.js](https://threejs.org) (MIT). Geometria, textura e espaços são gerados em código. O capacete é o EKOI Pure Aero do Gonçalo, medido nas fotografias do produto.
- Scroll suave com [Lenis](https://github.com/darkroomengineering/lenis) (MIT) e cenas de scroll com [GSAP ScrollTrigger](https://gsap.com).
- Tipografia: Anton, Inter e JetBrains Mono (Google Fonts, OFL).
- Fotografias: portefólio do atleta.
