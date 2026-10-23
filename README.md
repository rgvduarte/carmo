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
- **Patrocínio (05)**: 24 espaços à venda, 20 no fato e 4 no capacete aero. Logo a seguir à introdução há dois cartões
  grandes, «O fato» e «O capacete», cada um com a fotografia do modelo, o número de espaços, o preço mais baixo e um botão
  que leva à sua parte. Cada parte tem o seu modelo 3D, as vistas, a visita guiada e a tabela de preços (a do fato também
  o fato completo). Há um só modelo 3D ativo de cada vez: o da parte que está no ecrã. O capacete só é preparado quando a
  parte dele se aproxima e, enquanto isso, mostra a fotografia e «A carregar o capacete». Dá para rodar, escolher,
  experimentar o logótipo, descarregar o mockup, juntar espaços dos dois num pacote, reservar por WhatsApp, email ou
  Instagram e pagar por transferência ou MB WAY.
- **Apoiar**: GoFundMe, transferência ou MB WAY, apoio em espécie e orçamento estimado da época.
- **Contacto** e **media kit** (o botão imprime a página como PDF limpo).
- **Privacidade** (`/privacidade/`, ligada no rodapé): o que o site guarda e porquê. Com o Google Analytics ligado,
  aparece também o aviso de cookies e, no rodapé, «Definições de cookies».

PT e EN (botão no topo; a língua também segue o browser).

## Atualizar conteúdos

| O quê | Onde |
|---|---|
| Preços, estado (`available` / `reserved` / `sold`) e textos dos espaços | `data/spots.json` |
| Preço do fato completo e desconto de pacote | `data/spots.json` → `title`, `bundle` |
| Link do GoFundMe | `assets/js/data.js` → `SITE.gofundme` |
| Google Analytics (ID de medição `G-…`) | `assets/js/data.js` → `SITE.ga` (vazio = sem estatísticas e sem aviso de cookies; ver «Google Analytics») |
| Página de privacidade (PT e EN) | `privacidade/index.html` |
| IBAN, titular e MB WAY | `assets/js/data.js` → `SITE.iban`, `SITE.payee`, `SITE.mbway`, `SITE.mbwayMax` |
| Resultados, calendário 2027, orçamento | `assets/js/data.js` |
| Textos da página | `index.html` (PT) e `assets/js/i18n.js` (EN) |
| Fotografias | `assets/img/` (WebP + JPG, 800/1600 px) |
| Fotografias do fato e do capacete (cartões e partes do 05) | `assets/img/model-*`, geradas a partir dos modelos 3D: depois de mudar um modelo, `node scripts/model-shots.mjs` (com o servidor local ligado) |

## Vender um espaço

**Como se paga.** Transferência bancária para o IBAN que aparece no pedido de reserva (e em Apoiar, para donativos, com o
MB WAY ao lado), ou MB WAY
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
| `pt.short`, `en.short` | `"Lado esquerdo"` | Nome curto na tabela da parte do capacete (opcional; no pedido e na mensagem vai o nome completo) |

O `title` (fato completo) aceita os mesmos campos. Vendido, fecha os 20 espaços do fato com o nome da marca e
põe o logótipo no peito. O capacete fica de fora: os 4 espaços dele vendem-se à parte, e o desconto de pacote
conta os espaços do fato e do capacete juntos.

A posição de cada espaço também está no `data/spots.json`. No fato: `part` (`torso`, `legL`, …), `phi` (graus à
volta do corpo, 0 = frente), `t` (no tronco, a altura em metros a contar do entrepernas; nas pernas e nas mangas, os
metros a contar da bainha), `w` × `h` (cm) e `rot`. O desenho de cada espaço segue o corpo sem deformar: um logótipo
quadrado fica quadrado, em qualquer altura. No capacete: `part: "shell"`, `phi` é o
ângulo no arco (0 = linha do topo, +90 = lado esquerdo), `t` são metros ao longo do topo a contar da viseira, e `rot`
pode ser 0, ±90 ou 180.

**Links diretos.** Cada link abre a parte certa do capítulo 05. `gocarmo.com/#fato/peito` abre um espaço do fato,
`gocarmo.com/#capacete/capacete-topo` um do capacete, `#o-fato` e `#o-capacete` levam a cada parte e `#capacete` abre a
parte do capacete. `#fato/title` pede o fato completo. `#pacote=peito,capacete-topo` abre um pacote: se for só de um dos
dois, leva à parte dele; com espaços do fato e do capacete, ao início do capítulo, onde estão os dois cartões.

## Página de admin

**Onde.** `gocarmo.com/admin/`. Não tem link no site e os motores de busca não a mostram (`noindex` e
`robots.txt`). Funciona no telemóvel. Serve para reservar, vender e libertar espaços do fato e do capacete
com o site no ar, sem mexer em código.

**A chave (uma vez, com a conta dona do repositório).**
1. Abre https://github.com/settings/personal-access-tokens/new.
2. Em «Repository access» escolhe «Only select repositories» e depois `rgvduarte/carmo`. Validade: 90 dias.
3. Em «Permissions» junta **Contents** e escolhe **Read and write**. O Metadata fica em Read sozinho.
4. Carrega em «Generate token», copia o código (começa por `github_pat_`) e cola-o na página. O GitHub só o
   mostra uma vez: guarda-o nas Palavras-passe ou nas Notas do telemóvel.

Se a pessoa for colaboradora e não dona do repositório, o GitHub não a deixa escolher `rgvduarte/carmo` neste
tipo de token. A saída melhor é passar o repositório para uma organização gratuita do GitHub em que os dois
admins sejam membros (o site e o domínio continuam a funcionar): aí cada um cria o seu token só para este
repositório, com Contents. Enquanto isso não acontecer, há o token clássico em
https://github.com/settings/tokens/new, **só** com `public_repo` e 7 dias de validade. Atenção: um token clássico
pode escrever em **todos** os repositórios públicos a que essa conta tem acesso, não só neste. A página recusa um
token clássico com mais permissões do que `public_repo`. Outra hipótese é uma conta do GitHub só para isto,
colaboradora apenas deste repositório.
«Lembrar neste telemóvel» guarda o token nesse telemóvel, para todo o site gocarmo.com (fica desligado de
origem). Sem isso, ao fechar o separador tens de colar o token outra vez. «Sair» pergunta antes de apagar.

**O que cada botão faz.** Escolhes um ou mais espaços na lista. Também podes colar a referência do pagamento,
por exemplo `KONA 01 21 22` ou `KONA FATO`, e a página seleciona esses espaços e mostra o total esperado.
- **Reservar**: precisa da marca. Por defeito fica reservado três dias (podes mudar a data). Depois desse dia o
  espaço volta a ficar livre sozinho. Se a mesma marca já tiver um espaço reservado por mais tempo, a data
  proposta é essa, e a página pergunta antes de encurtar uma reserva.
- **Vendido**: precisa da marca. O link é opcional (`https://marca.pt` ou `@marca`) e o logótipo também (PNG,
  JPG ou WebP, até 3 MB). Antes de guardar, o logótipo aparece sobre branco e sobre preto, e em «Ver no 3D» vês
  como fica no fato ou no capacete. O ficheiro fica em `assets/img/brands/<espaço>.<ext>`. Se venderes outra vez
  à mesma marca sem escolher ficheiro, o logótipo atual fica.
  Um SVG também serve, mas a página desenha-o e guarda-o como PNG (1200 px): o ficheiro SVG da marca nunca vai
  para o site, porque um SVG aberto sozinho em gocarmo.com podia correr código ao lado do token. Um SVG com
  código ou ligações para fora é recusado logo. O formulário do GitHub só aceita PNG, JPG ou WebP.
- **Libertar**: depois de confirmares, o espaço volta a ficar livre. A marca, o link, a data e o logótipo saem.
- **Fato completo**: vai sempre sozinho. Só se reserva ou vende com os 20 espaços do fato livres (ou da mesma
  marca). Enquanto estiver reservado ou vendido, os espaços do fato ficam fechados. Os do capacete não.

**O que acontece quando guardas.** Só o botão Guardar guarda (a tecla «seguinte» do teclado passa ao campo
seguinte). Cada ação é **um commit no `gh-pages`**, com uma mensagem como
`Espaços 01 e 21 vendidos a Marca X (admin)`. O `data/spots.json` fica exatamente como o formulário do GitHub o
deixaria. Se alguém tiver guardado ao mesmo tempo, a página volta a ler e tenta outra vez. Se esse alguém tiver
mexido nos mesmos espaços, a página não guarda e explica o que mudou. Se a rede falhar no último passo, a
página diz que não sabe se ficou guardado, e «Tentar outra vez» vê primeiro no GitHub (nunca guarda duas vezes).
Depois espera até o site mostrar a mudança, logótipo incluído (normalmente 1 a 2 minutos), e dá os links para o
espaço no site e para a alteração no GitHub. Podes fechar e fazer outra ação entretanto: a linha por baixo de
«Atualizado às» diz o que ainda está a publicar e o que já está no ar. Se o token deixar de funcionar a meio,
entras outra vez e o que escreveste continua lá.

**Revogar o token.** Em https://github.com/settings/personal-access-tokens abre o token e carrega em «Delete»
(token clássico: https://github.com/settings/tokens). Num telemóvel perdido, revogar basta. No teu telemóvel,
«Sair» apaga o token desse browser.

**Código de terceiros.** O site e a página de admin não carregam scripts de outros servidores: GSAP, Lenis,
three.js e number-flow estão em `assets/vendor/`, cópias exatas das versões publicadas (as origens e os hashes
estão em `assets/vendor/SOURCES.txt`). Assim, nenhum servidor de fora consegue correr código em gocarmo.com, onde
o token pode estar guardado. A única exceção é o Google Analytics, quando está ligado (`SITE.ga`): só nas páginas
públicas, só depois de o visitante aceitar, e nunca num browser que já abriu o admin (ver «Google Analytics»).

O formulário do GitHub (Issues → **Atualizar espaço do fato ou do capacete**) continua a funcionar como
alternativa, mas só depois de o branch por defeito ser `gh-pages`.

## Ligar o Strava (uma vez)

Os dados do Strava só são visíveis com sessão iniciada, por isso a página usa a API oficial com a autorização do Gonçalo.

**Pelo telemóvel (o caminho normal):** abre **https://gocarmo.com/admin/strava/** e segue os cinco passos. Precisas de duas contas no mesmo telemóvel: o Strava do Gonçalo e o GitHub `rgvduarte` (num repositório pessoal, só o dono pode criar secrets). A página cria a ligação no próprio browser e mostra os três valores para copiar para o GitHub:

1. Cria a aplicação no Strava (os valores a escrever estão na página, cada um com botão de copiar) e cola o Client ID.
2. Autoriza com a conta do Gonçalo. O Strava volta sozinho à página.
3. Cola o Client Secret. A página troca o código pelo refresh token e mostra «Ligado como …».
4. Cria os três secrets no GitHub, um por linha: `STRAVA_REFRESH_TOKEN` primeiro (é o único que não volta a aparecer no Strava), depois `STRAVA_CLIENT_ID` e `STRAVA_CLIENT_SECRET`. Só a conta dona do repositório pode criar secrets.
5. Actions → **Strava sync** → Run workflow, e espera que a corrida fique verde. Se o passo «Build data/strava.json» disser «skipping», falta o `STRAVA_REFRESH_TOKEN` ou o nome está mal escrito. A partir daí corre todas as manhãs.

Se o botão do Strava abrir a app do Strava em vez da página (o iPhone faz isso com `/settings/…`), copia o endereço que a página mostra e cola-o na barra do browser.

A página só fala com `www.strava.com` (a CSP não deixa outra ligação). Só guarda o Client ID, no separador (sessionStorage), até «Limpar» ou «Acabei»; se a página recarregar, recomeça no passo 2. O Client Secret e os tokens ficam só em memória. «Limpar» apaga tudo.

**À mão, com terminal (alternativa):**

1. Em https://www.strava.com/settings/api cria uma aplicação (Website: `https://gocarmo.com`, Authorization Callback Domain: `gocarmo.com`; o Strava aceita sempre `localhost` também).
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

## Google Analytics

Com `SITE.ga` vazio (`assets/js/data.js`) o site não mede nada: não há aviso de cookies, nenhum cookie e nenhum
pedido à Google. Para ligar, cola ali o ID de medição (`G-…`), corre `node scripts/stamp.mjs` e publica. Mais nada.

**Criar a propriedade (uma vez, uns 10 minutos).**
1. Em https://analytics.google.com, com a conta Google do Gonçalo, carrega em «Start measuring» (se já houver
   outra conta: Admin → Create → Account).
2. Conta: `Gonçalo Carmo`. As opções de partilha de dados com a Google ficam todas desligadas.
3. Propriedade: `gocarmo.com`, fuso horário Portugal, moeda Euro (€). Nos objetivos escolhe «Generate leads» e
   «Understand web and/or app traffic».
4. Aceita os termos (país: Portugal) e marca também os **Data Processing Terms** (os termos do RGPD). Se passar,
   estão em Admin → Account settings → Data processing terms.
5. Plataforma **Web**: Website URL `https://gocarmo.com`, Stream name `gocarmo.com`, Create stream.
6. As instruções de instalação que aparecem a seguir não são precisas: o código já está no site. Copia o
   **Measurement ID** (`G-XXXXXXXXXX`), no topo de «Web stream details».
7. Cola-o em `assets/js/data.js` → `ga: 'G-XXXXXXXXXX'`, corre `node scripts/stamp.mjs`, faz commit e push.

**No ecrã do fluxo (Admin → Data streams → gocarmo.com), antes de partilhares links:**
- **Enhanced measurement** fica ligado, mas na roda dentada desliga **Outbound clicks** e **Form interactions**,
  e em Page views → Show advanced settings desliga **Page changes based on browser history events**. Porquê: o
  site já manda os seus cliques para fora (`click`, sem o endereço do link) e o link do WhatsApp do pedido leva na
  mensagem a marca, o nome e o NIF; com «Outbound clicks» ligado, a Google podia receber esse endereço inteiro.
  E o menu e os espaços mudam o endereço da página (`#fato`, `#fato/peito`): o histórico contava cada mudança como
  uma visita. Scrolls (a página lida até 90%) e File downloads podem ficar ligados.
- **Redact data**: liga a redação de emails e, em «Query parameters», escreve `text, body, subject`. É uma segunda
  rede: se algum link com a mensagem do pedido chegasse ao Analytics, essas partes eram apagadas antes de sair do
  browser.

**Definições recomendadas (Admin).**
- Data collection and modification → **Data retention** → Event data retention: **14 months** → Save (por defeito
  são 2 meses). É o prazo que a página de privacidade indica.
- Data collection and modification → **Data collection** → **Google signals**: desligado (é o valor por defeito; o
  site também o desliga no código).
- Data display → **Key events** → New key event → `generate_lead`. É o número que interessa: pedidos de patrocínio
  enviados.
- Data display → **Custom definitions** → Create custom dimension (scope Event), uma por parâmetro: `section_id`,
  `link_type`, `link_location`, `payment_type`, `method`, `content_type`, `new_language`. Sem isto os parâmetros
  chegam, mas não aparecem nos relatórios. Se o GA disser que uma já existe, salta-a.
- **Tráfego interno (opcional).** O teu browser já não conta: abrir `/admin/` ou `/admin/strava/` deixa nesse
  browser uma marca (`gc.internal`) e, a partir daí, as páginas públicas nunca carregam o Google Analytics nele.
  Também protege o token: o script da Google nunca corre onde o token do GitHub pode estar guardado. Para excluir
  também outros aparelhos lá de casa, define o IP em Data streams → gocarmo.com → Configure tag settings → Define
  internal traffic (`traffic_type` = `internal`) e ativa o filtro em Admin → Data filters → Internal traffic →
  Active. No telemóvel o IP muda, por isso a marca no browser é o que conta. Limpar os dados do site no browser
  apaga a marca (volta a abrir o admin).

**Ver os dados a chegar.**
- Abre o site numa **janela privada** (no teu browser normal o site não mede, por causa da marca do admin), aceita
  o aviso e, no Analytics, vai a Reports → **Realtime**: a visita aparece em menos de um minuto.
- Evento a evento: abre `https://gocarmo.com/?ga_debug=1` numa janela privada, aceita, e vai a Admin → Data display
  → **DebugView**.
- Os relatórios normais demoram 24 a 48 horas a encher.
- Links para partilhar com origem: junta `utm_source`, `utm_medium` e `utm_campaign`, por exemplo
  `https://gocarmo.com/?utm_source=instagram&utm_medium=social&utm_campaign=lancamento-2026`. Aparecem em Reports
  → Acquisition → Traffic acquisition.

**O que o site mede** (tudo em `assets/js/analytics.js`; noutro ficheiro só há uma linha em `adspace.js`, que avisa
que espaço está aberto):

| Evento | Quando | Parâmetros |
|---|---|---|
| `page_view` | o Analytics carrega, depois de «Aceitar» | os do Google Analytics |
| `scroll` | a página lida até 90% (Enhanced measurement) | |
| `section_view` | uma secção passa pelo meio do ecrã pela primeira vez: `historia`, `resultados`, `dados`, `epoca`, `o-fato`, `o-capacete`, `media`, `apoiar`, `contacto` | `section_id` |
| `select_content` | abres um espaço: no 3D, na tabela, nos capítulos ou por link direto (a visita guiada não conta) | `content_type` (`suit_spot` ou `helmet_spot`), `content_id` e `item_id` (o id do espaço, ex. `peito`) |
| `share` | «Partilhar» num espaço | `method` (`web_share` ou `copy_link`), `content_type`, `item_id` |
| `begin_checkout` | o pedido abre no passo 1 | `currency` (EUR), `value` (o total, já com desconto), `items` (os espaços) |
| `add_payment_info` | escolhes Transferência ou MB WAY, ou copias uma linha do pagamento (uma vez por forma, em cada pedido) | os de cima e `payment_type` (`transfer` ou `mbway`) |
| `generate_lead` | o pedido sai por WhatsApp, email ou Instagram (um envio recusado por faltar a marca não conta) | `currency`, `value`, `method` (`whatsapp`, `email` ou `instagram`) |
| `click` | um link para fora, exceto os do pedido | `link_type` (`whatsapp`, `email`, `instagram`, `strava`, `gofundme`, `spotify`, `tiktok` ou `other`), `link_domain`, `link_location` (a secção, `nav` ou `footer`) |
| `donation_intent` | em Apoiar: copias o IBAN ou o número MB WAY, ou carregas no botão do GoFundMe | `method` (`transfer`, `mbway`, `gofundme`, ou `whatsapp` enquanto não houver campanha) |
| `language_change` | PT / EN | `new_language` |

Nunca vão para a Google o que a marca escreve no pedido, emails, números de telefone, NIF, nomes de marcas nem o
endereço dos links.

**O aviso e a lei (RGPD, Lei 41/2004, orientações da CNPD).** O script da Google só carrega depois de «Aceitar»
(Consent Mode v2, modo básico, com anúncios e personalização sempre recusados) e só então há cookies. «Recusar» e
«Aceitar» são iguais. Esc, ou ignorar o aviso, não é aceitar. A escolha fica seis meses no browser (`gc.consent`)
e os cookies `_ga` duram o mesmo; se o browser não deixar guardar, o aviso volta na visita seguinte. Um browser com
Global Privacy Control ou Do Not Track conta como «Recusar» e não vê o aviso (pode aceitar em «Definições de
cookies»). «Definições de cookies», no rodapé, volta a abrir o aviso; recusar aí apaga os cookies `_ga` e para o
envio na hora. Esvaziar `SITE.ga` desliga tudo e apaga os cookies `_ga` que tenham ficado.
A página `/privacidade/` (PT e EN) explica isto ao visitante: se mudares o que o site mede, atualiza-a. O que ainda
falta confirmar está num comentário `[CONFIRMAR]` no início do ficheiro, que não aparece na página.

## Correr localmente

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

## Publicar uma alteração ao código

Antes de cada commit que mude ficheiros em `assets/js/` ou `assets/css/`, corre na raiz do repositório:

```
node scripts/stamp.mjs
```

O script põe no endereço de cada ficheiro uma versão calculada a partir do conteúdo (`main.js?v=…`), no mapa de importação de `index.html`, de `admin/index.html` e de `privacidade/index.html` e no script de `admin/strava/index.html`. Assim, um browser que ainda guarde ficheiros da versão anterior (o GitHub Pages deixa-os em cache 10 minutos) nunca mistura ficheiros novos com antigos. Se mesmo assim a página não arrancar, ela própria recarrega uma vez com tudo fresco antes de mostrar a versão sem JavaScript.

Numa página com Content-Security-Policy (as do admin), o script recalcula também o sha256 de cada script inline, o mapa de importação, no `script-src`. Sem isso o browser ignora o mapa novo.

## Créditos técnicos

- Fato e capacete 3D procedimentais, feitos de raiz em [three.js](https://threejs.org) (MIT). Geometria, textura e espaços são gerados em código. O fato é um só corpo anatómico, contínuo nos ombros, nas axilas e nas ancas (`assets/js/suit-body.js`), malhado num worker (`suit-mesh.js`). O capacete é o EKOI Pure Aero do Gonçalo, medido nas fotografias do produto.
- Scroll suave com [Lenis](https://github.com/darkroomengineering/lenis) (MIT) e cenas de scroll com [GSAP ScrollTrigger](https://gsap.com).
- Tipografia: Anton, Inter e JetBrains Mono (Google Fonts, OFL).
- Fotografias: portefólio do atleta.
