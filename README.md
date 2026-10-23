# Gonçalo Carmo · Road to Kona

Página de atleta e plataforma de patrocínio do fato e do capacete de competição da época 2027.
Site estático (HTML, CSS, JS) publicado no GitHub Pages, sem build nem servidor.

**Live:** https://gocarmo.com/

## O que está na página

- **Hero e tese**: quem é, porquê patrocinar agora e os números-chave.
- **A prova**: cena controlada pelo scroll (natação, bicicleta, corrida e meta) com o contador dos 226 km.
- **Resultados**: as provas uma a uma, conduzidas pelo scroll, e depois «Todas as provas»: um cartão por prova, da mais
  recente à mais antiga, com o tempo, o lugar no escalão e na geral e os parciais dos triatlos. No telemóvel desliza-se
  de cartão em cartão; no computador avança-se com as setas. Sem JavaScript e no media kit impresso aparecem todos.
- **Telemetria**: dados do Strava, que aparecem sozinhos quando a sincronização estiver ligada.
- **Época 2027**: sete provas, com um IRONMAN de qualificação para Kona. Kona entra no calendário quando houver vaga.
- **Patrocínio (05)**: 24 espaços à venda, 20 no fato e 4 no capacete aero. Logo a seguir à introdução há dois cartões
  grandes, «O fato» e «O capacete», cada um com a fotografia do modelo, o número de espaços, o preço mais baixo e um botão
  que leva à sua parte. Cada parte tem o seu modelo 3D, as vistas, a visita guiada e a tabela de preços (a do fato também
  o fato completo). Há um só modelo 3D ativo de cada vez: o da parte que está no ecrã. O capacete só é preparado quando a
  parte dele se aproxima e, enquanto isso, mostra a fotografia e «A carregar o capacete». Dá para rodar, escolher,
  experimentar o logótipo, descarregar o mockup, juntar espaços dos dois num pacote, reservar por WhatsApp, email ou
  Instagram e pagar por transferência ou MB WAY.
- **Apoiar**: GoFundMe (com o valor angariado e a barra até à meta), transferência ou MB WAY, apoio em espécie e
  orçamento estimado da época.
- **Contacto** e **media kit** (o botão imprime a página como PDF limpo).

PT e EN (botão no topo; a língua também segue o browser).

## Atualizar conteúdos

| O quê | Onde |
|---|---|
| Preços, estado (`available` / `reserved` / `sold`) e textos dos espaços | `data/spots.json` |
| Preço do fato completo e desconto de pacote | `data/spots.json` → `title`, `bundle` |
| Link do GoFundMe e números da campanha | `data/gofundme.json` (ver «GoFundMe», mais abaixo) |
| IBAN, titular e MB WAY | `assets/js/data.js` → `SITE.iban`, `SITE.payee`, `SITE.mbway`, `SITE.mbwayMax` |
| Resultados, calendário 2027, orçamento | `assets/js/data.js` (depois de mudar `RESULTS`, `node scripts/stamp.mjs` escreve os cartões de «Todas as provas» em `index.html`) |
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

**Colar pedido ou referência.** Colas a referência do pagamento, por exemplo `KONA 01 21 22` ou `KONA FATO`, e a
página seleciona esses espaços e mostra o total esperado. Também podes colar a mensagem inteira do pedido (do
WhatsApp, do email, ou só o link `gocarmo.com/#pacote=…`): a página seleciona os espaços e mostra num resumo os
espaços, a marca, o nome, o NIF (e se o último algarismo confere), a forma de pagamento, a referência e o total, com
um aviso quando o total ou um preço já não batem com os de agora, ou quando um espaço já está reservado ou vendido.
Dois botões: **Reservar 48 h** (abre a reserva com a marca e a data de daqui a 48 horas) e **Marcar como vendido**
(abre a venda com a marca). Os espaços saem do link do pedido; se não houver link, das linhas `• 21 Topo do capacete`.
No telemóvel, depois de colar, o teclado fecha e o resumo sobe com os dois botões; enquanto o resumo estiver aberto
nos espaços do pedido, a barra de baixo esconde-se (os botões do resumo já fazem o mesmo, com a marca do pedido).
Se os espaços já estiverem reservados por um pedido do site, o resumo diz qual, o primeiro botão passa a
**Prolongar 48 h** (do próprio pedido) e **Marcar como vendido** é o **Confirmar compra** desse pedido, com o
logótipo. O mesmo com a referência (`KONA 21`) e com **Vendido** na barra: um espaço de um pedido do site vende-se
sempre pelo pedido, para o logótipo ir para o site. Se a chave dos pedidos ainda não estiver neste separador, a
página pede-a primeiro e depois continua.

**Pedidos.** Aparece quando o site recebe as compras sozinho (ver **Compras automáticas**). Na primeira vez pede a
chave dos pedidos (a `ADMIN_KEY`), que fica só nesse separador; «Esquecer a chave» apaga-a, e «Sair» também. O
GitHub não mostra a `ADMIN_KEY` outra vez: guarda-a nas Palavras-passe do telemóvel, que a preenchem sozinhas. Cada
pedido mostra o logótipo, a marca, os espaços, o total, a data, o canal, a forma de pagamento, o nome e o NIF, a
mensagem e quanto tempo falta para a reserva acabar.
- **Confirmar compra**: abre a venda com a marca e o logótipo do pedido. Ao guardar, é uma venda como as outras (um
  commit com o teu token, o logótipo vai para o site) e o pedido fica confirmado. Se os espaços já estiverem
  vendidos a essa marca, o botão é **Marcar como confirmado**; se foram vendidos sem logótipo, aparece antes
  **Pôr o logótipo do pedido**.
- **Prolongar 48 h**: mais dois dias de reserva, no site também.
- **Cancelar**: depois de confirmares, os espaços que ainda estão reservados por esse pedido voltam a ficar livres.
  O pedido fica em «Fechados». Num pedido falso, marca «bloquear quem o fez durante 30 dias».
Reservar ou vender um espaço de um pedido do site pela lista, sem ser pelo pedido, pergunta antes: o pedido deixa de
controlar a reserva, e uma venda assim fica sem o logótipo do pedido.

**O que cada botão faz.** Escolhes um ou mais espaços na lista (ou colas a referência ou o pedido, em cima).
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
o token pode estar guardado.

O formulário do GitHub (Issues → **Atualizar espaço do fato ou do capacete**) continua a funcionar como
alternativa, mas só depois de o branch por defeito ser `gh-pages`.

## Compras automáticas

O site pode receber as compras sozinho, através de um pequeno serviço no Cloudflare (o Worker em `worker/`, com
instruções em `worker/README.md`).

1. A marca escolhe os espaços, escreve a marca e envia o logótipo (obrigatório). O site manda o pedido ao Worker e
   diz à marca que tem 48 horas para enviar o comprovativo, para o patrocínio ficar fechado.
2. O Worker reserva os espaços por 48 horas no `data/spots.json` (um commit no `gh-pages`) e guarda o pedido e o
   logótipo. O Gonçalo recebe a mensagem do pedido como hoje (WhatsApp ou email).
3. Quando o pagamento entra, o Gonçalo abre a página de admin, em **Pedidos** carrega em **Confirmar compra** e
   guarda. O espaço fica vendido no site com o logótipo da marca. O pagamento recebe um recibo de donativo.
4. Se o pagamento não chegar, a reserva acaba sozinha ao fim das 48 horas (no fim desse dia). **Cancelar** liberta
   antes; **Prolongar 48 h** dá mais dois dias.

**Contra abusos.** Até 6 espaços por pedido (mais, só o fato completo). No máximo 8 espaços presos ao mesmo tempo por
pedidos do site por pagar, venha de onde vier (o fato completo conta como os 8). Por endereço de internet: 1 pedido
aberto e 3 por dia, e 7 dias de pausa depois de um pedido cancelado ou que acabou sem pagamento. Um pedido falso
cancela-se com «bloquear» (30 dias). Antes de ligar o site ao Worker, liga também o Turnstile do Cloudflare
(`TURNSTILE_SECRET`). Os detalhes estão em `worker/README.md`.

**Ligar (uma vez).** Os quatro secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SPOTS_GITHUB_TOKEN`,
`ADMIN_KEY`) estão em Settings → Secrets and variables → Actions. A action **Deploy pedidos** publica o Worker a
cada push que mude `worker/` (ou à mão, em Actions → Deploy pedidos → Run workflow, com o branch por defeito em
`gh-pages`) e escreve no resumo o endereço, por exemplo `https://gocarmo-pedidos.<conta>.workers.dev`. Esse endereço
vai para `assets/js/data.js` → `SITE.requestsApi`; depois `node scripts/stamp.mjs` e publica. Com `requestsApi: ''`
nada muda no site nem na página de admin.

**Privacidade.** O nome e o NIF servem só para o recibo. Cada pedido fica guardado 180 dias no Cloudflare e depois
apaga-se sozinho; só a página de admin, com a `ADMIN_KEY`, o lê. No `data/spots.json`, público, só ficam a marca, o
último dia da reserva e o número do pedido.

Enquanto o pedido de reserva do site não envia para o Worker (vem na próxima versão), os pedidos chegam só por
WhatsApp, email ou Instagram: cola a mensagem em **Colar pedido ou referência**.

## GoFundMe

O link da campanha e os números que aparecem em Apoiar estão só em `data/gofundme.json`. Mais nenhum ficheiro tem o link.

| Campo | Formato | O que faz |
|---|---|---|
| `url` | `"https://www.gofundme.com/f/<slug>"` | Link da campanha. Vazio, o botão fica «Quero apoiar» (WhatsApp) com a nota «A campanha no GoFundMe abre em breve.». Preenchido, o botão fica dourado, «Apoiar no GoFundMe», e aparece o cartão da campanha com «Partilhar» |
| `title` | texto | Título da campanha, igual ao do GoFundMe |
| `goal` | número | Meta. Sem ela não há barra nem percentagem |
| `raised` | número | Valor angariado. `null` esconde o valor e a barra: fica o título, «Partilhar» e o botão |
| `supporters` | número | Número de doações que a página do GoFundMe mostra |
| `currency` | `"EUR"` | Moeda da campanha |
| `updated` | `"AAAA-MM-DD"` | Dia em que copiaste os números. Aparece como «Atualizado a …» |

Os números vão sem aspas, sem espaços, sem € e sem separador de milhares: `1250`, nunca `"1 250 €"`.
Só é aceite um link `https://` do `gofundme.com` ou do `gofund.me`. Usa o link da campanha (`https://www.gofundme.com/f/…`),
não um link de partilha copiado com sessão iniciada, que leva o teu nome como quem partilhou. O «Partilhar» do site usa
este mesmo link: no telemóvel abre a folha de partilha; no computador copia o link.

**Atualizar os números (à mão, pelo telemóvel).**
1. Abre a campanha no GoFundMe e vê o valor angariado, a meta e o número de doações.
2. No GitHub (no browser do telemóvel também dá), abre `data/gofundme.json` no branch `gh-pages` e carrega no lápis.
3. Muda `raised`, `supporters` e `updated` (e `goal`, se mudaste a meta). Carrega em «Commit changes».
4. O site mostra os números novos em 1 a 2 minutos.

Se o ficheiro ficar com um erro (uma vírgula a mais, umas aspas a menos), o site volta ao botão «Quero apoiar». Abre o
ficheiro outra vez e corrige. Sem JavaScript, o botão fica «Quero apoiar» (WhatsApp).

**Porque não é automático.** A GoFundMe não tem API pública nem outra forma oficial de ler os números de uma
angariação pessoal. Os dados estruturados da página (JSON-LD) não trazem o valor, a meta nem as doações. E os Termos da
GoFundMe (12.3) proíbem robots e scraping, mesmo nas páginas `/f/` que o `robots.txt` deixa ler. Um script a ler a página
arriscava pausar a campanha, por isso não existe. O widget oficial («Website widget») mostra o valor ao vivo, mas traz o
aspeto da GoFundMe e um script de outro servidor, e o site não corre scripts de fora (ver «Código de terceiros»).

**O que não pode ir para o GoFundMe.** IBAN, MB WAY ou instruções para doar por fora, e qualquer coisa em troca de um
donativo: os espaços do fato e do capacete vendem-se só aqui no site e nunca são recompensa (Termos 6.1 e 8.12).
Agradecer nas atualizações da campanha pode.

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

O script põe no endereço de cada ficheiro uma versão calculada a partir do conteúdo (`main.js?v=…`), no mapa de importação de `index.html` e de `admin/index.html` e no script de `admin/strava/index.html`. Assim, um browser que ainda guarde ficheiros da versão anterior (o GitHub Pages deixa-os em cache 10 minutos) nunca mistura ficheiros novos com antigos. Se mesmo assim a página não arrancar, ela própria recarrega uma vez com tudo fresco antes de mostrar a versão sem JavaScript.

Numa página com Content-Security-Policy (as do admin), o script recalcula também o sha256 de cada script inline, o mapa de importação, no `script-src`. Sem isso o browser ignora o mapa novo.

O mesmo script escreve em `index.html` os cartões de «Todas as provas» a partir de `RESULTS` (`assets/js/data.js`), com o mesmo código que os desenha na página (`assets/js/races.js`): são eles que aparecem sem JavaScript e no media kit impresso. Pára com uma lista do que falta se uma prova não tiver o que os cartões precisam (um triatlo sem `splits` ou `ag`, uma corrida sem `pace`). `node scripts/stamp.mjs --check` não muda nada e falha se alguma página estiver desatualizada.

Depois, com o servidor local ligado, `node scripts/results-check.mjs` (precisa do Playwright) confirma num browser a 1440, 390 e 320 px que os cartões escritos em `index.html` e os desenhados pelo JavaScript têm a mesma altura, que os filtros não mexem na página e que sem JavaScript aparecem todas as provas.

## Créditos técnicos

- Fato e capacete 3D procedimentais, feitos de raiz em [three.js](https://threejs.org) (MIT). Geometria, textura e espaços são gerados em código. O fato é um só corpo anatómico, contínuo nos ombros, nas axilas e nas ancas (`assets/js/suit-body.js`), malhado num worker (`suit-mesh.js`). O capacete é o EKOI Pure Aero do Gonçalo, medido nas fotografias do produto.
- Scroll suave com [Lenis](https://github.com/darkroomengineering/lenis) (MIT) e cenas de scroll com [GSAP ScrollTrigger](https://gsap.com).
- Tipografia: Anton, Inter e JetBrains Mono (Google Fonts, OFL).
- Fotografias: portefólio do atleta.
