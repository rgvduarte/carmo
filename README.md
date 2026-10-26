# Gonçalo Carmo · Cada prova, cada treino

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
- **Patrocínio (05)**: 24 espaços à venda, 20 no fato e 4 no capacete aero. Logo a seguir ao título e ao subtítulo há
  dois cartões grandes, «O fato» e «O capacete», cada um com a imagem do modelo, o número de espaços, o preço mais baixo
  e um botão que leva à sua parte. A introdução, os espaços livres e as marcas que já lá estão vêm depois dos cartões,
  por isso um link para o capítulo mostra logo os dois cartões. Cada parte tem o seu modelo 3D, as vistas, a visita
  guiada e a tabela de preços (a do fato tem também o fato completo). Há um só modelo 3D ativo de cada vez: o da parte
  que está no ecrã. O capacete só é preparado quando a parte dele se aproxima e, enquanto isso, mostra a imagem do
  capacete e «A carregar o capacete». Dá para rodar, escolher, experimentar o logótipo, descarregar o mockup, juntar
  espaços dos dois num pacote, reservar por WhatsApp, email ou Instagram e pagar por transferência ou MB WAY.
- **Apoiar**: GoFundMe (com o valor angariado e a barra até à meta), transferência ou MB WAY (o mesmo IBAN e o mesmo
  número dos pedidos, com o código `CARMO APOIO`, escondidos enquanto houver campanha aberta), apoio em espécie e
  orçamento estimado da época.
- **Contacto** e **media kit** (o botão imprime a página como PDF limpo).
- **Privacidade** (`/privacidade/`, ligada no rodapé): o que o site guarda e porquê. Com o Google Analytics ligado,
  aparece também o aviso de cookies e, no rodapé, «Definições de cookies».

PT e EN (botão no topo; a língua também segue o browser).

## Atualizar conteúdos

| O quê | Onde |
|---|---|
| Preços, estado (`available` / `reserved` / `sold`) e textos dos espaços | `data/spots.json` |
| Preço do fato completo e desconto de pacote | `data/spots.json` → `title`, `bundle` |
| Link do GoFundMe e números da campanha | `data/gofundme.json` (ver «GoFundMe», mais abaixo) |
| Google Analytics (ID de medição `G-…`) | `assets/js/data.js` → `SITE.ga` (vazio = sem estatísticas e sem aviso de cookies; ver «Google Analytics») |
| Página de privacidade (PT e EN) | `privacidade/index.html` |
| IBAN, titular e MB WAY | `assets/js/data.js` → `SITE.iban`, `SITE.payee`, `SITE.mbway`, `SITE.mbwayMax` |
| Resultados, calendário 2027, orçamento | `assets/js/data.js` (depois de mudar `RESULTS`, `node scripts/stamp.mjs` escreve os cartões de «Todas as provas» em `index.html`) |
| Textos da página | `index.html` (PT) e `assets/js/i18n.js` (EN) |
| Fotografias | `assets/img/` (WebP + JPG, 800/1600 px) |
| Imagens do fato e do capacete (cartões e partes do 05) | `assets/img/model-*`, geradas a partir dos modelos 3D: depois de mudar um modelo, `node scripts/model-shots.mjs` (com o servidor local ligado) |

## Vender um espaço

**Como se paga.** Transferência bancária para o IBAN que aparece no pedido de reserva, ou MB WAY para o número do
Gonçalo (916 395 103) até 2 000 € por envio, o máximo que o MB WAY deixa mandar de uma vez.
Acima disso, como o fato completo (3 000 €), o pedido só mostra a transferência. O site mostra o montante já com
desconto e um descritivo com os números dos espaços, por exemplo `CARMO 01` ou `CARMO 09 16 20`, para cada pagamento se
ligar ao pedido sem dúvidas. Os espaços do capacete são
os números 21 a 24, por isso um pacote com fato e capacete fica, por exemplo, `CARMO 01 21 22`. O fato completo usa
`CARMO FATO` e os donativos `CARMO APOIO`. Antes o código era `KONA` (`KONA 01 21 22`, `KONA FATO`): a página de
admin lê os dois, por isso um pagamento com uma referência antiga continua a bater certo. IBAN, titular, número MB WAY e o limite por envio estão em
`assets/js/data.js` → `SITE` (`mbway: ''` esconde o MB WAY).
Receber por MB WAY tem limite da SIBS: 5 000 € e 50 transferências por mês. Num mês com vendas grandes, pede transferência.

**O fluxo.** Com o Worker ligado (o normal), o pedido também reserva os espaços por 48 horas e leva o logótipo, e a
compra confirma-se em **Pedidos**: ver **Compras automáticas**. Aqui fica o pedido em si e o caminho à mão, que é o
de uma mensagem que chega sem `Pedido:`:
1. A marca escolhe os espaços e carrega em **Reservar**. O pedido tem dois passos, um ecrã cada:
   **Reservar** (o resumo numa linha, a marca, o nome e, se quiser, NIF e mensagem, e **Pagar por** MB WAY ou
   Transferência) e **Pagar** (MB WAY ou Transferência, cada um com três linhas para copiar: número ou IBAN, montante e
   código `CARMO`). A forma escolhida vai escrita na mensagem que recebes («Pagamento: MB WAY» ou «Pagamento:
   transferência bancária») e o passo Pagar abre nela. Acima de 2 000 € o MB WAY fica desligado, com a razão por baixo.
   Se a marca mudar de forma no passo Pagar depois de enviar, aparece «Mudaste a forma de pagamento? Diz-me na conversa.»
   Ao enviar o pedido por WhatsApp (o botão dourado) ou email (por baixo, ao lado do Instagram), a app abre com a
   mensagem pronta e o pedido passa sozinho ao passo Pagar, à espera quando a marca voltar ao site (mesmo que o
   telemóvel tenha recarregado a página ou que a marca volte a carregar em Reservar, e na forma de pagar que a
   mensagem disse ou para a qual mudou; «Já enviei o pedido» também). Se o WhatsApp não abrir (a página continua no
   ecrã 2,5 s depois do toque, ou o telemóvel volta da página wa.me sem a app), o passo Pagar mostra no topo «O
   WhatsApp não abriu? Envia por email ou Instagram» com os mesmos dois botões; se a app só abrir depois, a linha
   desaparece quando a marca volta. Num computador o site não sabe se o WhatsApp Web funcionou: ao voltar ao separador
   (ou 2,5 s depois) aparece só uma linha discreta, «Sem WhatsApp?» com os dois botões. O site nunca diz que a mensagem foi enviada. O
   Instagram copia a mensagem e passa ao passo Pagar, que começa por «Mensagem copiada. Cola-a na conversa do
   Instagram:» e o botão «Abrir o Instagram» (a conversa com @goncalo.carmo99, no mesmo separador no telemóvel para
   abrir a app); se o browser não deixar copiar, a mensagem aparece selecionada na mesma caixa para copiar à mão.
   **Feito** fecha o pedido e esvazia o pacote. O email abre a app de email do aparelho com a mesma mensagem; se a
   marca escrever uma mensagem muito longa, o email leva só o início (há apps que não abrem links de email enormes)
   e o pedido avisa-a de que pelo WhatsApp vai inteira.
2. Confirmas em 24 horas. Para guardar os espaços enquanto esperas pelo comprovativo, cola a mensagem em **Colar
   pedido ou referência** e usa **Reservar 48 h**, as 48 horas que o site promete. Depois do último dia da reserva, o espaço volta
   a ficar disponível sozinho, sem teres de fazer nada.
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

**Colar pedido ou referência.** Colas a referência do pagamento, por exemplo `CARMO 01 21 22` ou `CARMO FATO` (ou
uma antiga, `KONA 01 21 22`), e a página seleciona esses espaços e mostra o total esperado. Também podes colar a mensagem inteira do pedido (do
WhatsApp, do email, ou só o link `gocarmo.com/#pacote=…`): a página seleciona os espaços e mostra num resumo os
espaços, a marca, o nome, o NIF (e se o último algarismo confere), a forma de pagamento, a referência e o total, com
um aviso quando o total ou um preço já não batem com os de agora, ou quando um espaço já está reservado ou vendido.
Dois botões: **Reservar 48 h** (abre a reserva com a marca e a data de daqui a 48 horas) e **Marcar como vendido**
(abre a venda com a marca). Os espaços saem do link do pedido; se não houver link, das linhas `• 21 Topo do capacete`.
No telemóvel, depois de colar, o teclado fecha e o resumo sobe com os dois botões; enquanto o resumo estiver aberto
nos espaços do pedido, a barra de baixo esconde-se (os botões do resumo já fazem o mesmo, com a marca do pedido).
Se os espaços já estiverem reservados por um pedido do site, o resumo diz qual, o primeiro botão passa a
**Prolongar 48 h** (do próprio pedido) e **Marcar como vendido** é o **Confirmar compra** desse pedido, com o
logótipo. O mesmo com a referência (`CARMO 21`) e com **Vendido** na barra: um espaço de um pedido do site vende-se
sempre pelo pedido, para o logótipo ir para o site. Se a chave dos pedidos ainda não estiver neste separador, a
página pede-a primeiro e depois continua. Uma linha `Pedido: <número>` só conta quando esse pedido é dos mesmos
espaços: se for de outros (a marca pode ter escrito o número de outro pedido na mensagem dela), o resumo diz «A
mensagem fala do pedido …, que é de outros espaços: não o uso.» e os botões tratam estes espaços à parte.

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
o token pode estar guardado. A única exceção é o Google Analytics, quando está ligado (`SITE.ga`): só nas páginas
públicas, só depois de o visitante aceitar, e nunca num browser que já abriu o admin (ver «Google Analytics»).

O formulário do GitHub (Issues → **Atualizar espaço do fato ou do capacete**) continua a funcionar como
alternativa, mas só depois de o branch por defeito ser `gh-pages`.

## Compras automáticas

Está ligado: o pedido de reserva do site fala com um pequeno serviço no Cloudflare (o Worker em `worker/`, com
instruções em `worker/README.md`), no endereço de `SITE.requestsApi` em `assets/js/data.js`
(`https://gocarmo-pedidos.rgvduarte.workers.dev`). Com `requestsApi: ''` o pedido volta a ser só mensagem, como antes.

**O que a marca vê.**
1. Escolhe os espaços (ou o fato completo) e carrega em **Reservar**. No passo 1 escreve a marca e junta o
   **logótipo**, que é obrigatório: no telemóvel a caixa abre as fotografias, no computador também se pode arrastar o
   ficheiro para lá. Serve PNG, JPG, WebP ou SVG (até 20 MB). O site desenha-o num PNG com o fundo transparente que
   tiver, até 1200 px de lado e no máximo 400 KB (uma imagem pesada fica mais pequena até caber), e mostra-o na caixa
   com o nome e o tamanho. Ao fechar o pedido vê-o no espaço do fato ou do capacete 3D. Enquanto faltar a marca ou o
   logótipo, os botões ficam esbatidos e a linha por baixo diz o que falta; um toque mostra o erro no campo.
2. Carrega em WhatsApp, Email ou Instagram. O site manda o pedido ao Worker («A reservar…») com os espaços, a marca,
   o nome, o NIF, a mensagem, a forma de pagar e o logótipo. O Worker reserva os espaços por 48 horas (um commit no
   `data/spots.json`) e responde com o número do pedido. O passo 2 diz **Reservado até domingo, 25 de outubro**, o
   número do pedido e «Paga e envia-me o comprovativo por WhatsApp ou email até essa data (48 horas a contar do
   pedido) para o patrocínio ficar fechado», e por baixo os dados de MB WAY ou da transferência (o que escolheu), o
   montante e o descritivo `CARMO`. Enquanto o pedido segue, o botão tocado diz «A reservar…».
   A app escolhida abre sozinha com a mensagem, que agora leva `Pedido: <número>` e «Reservado durante 48 horas, até
   25 de outubro. Envio o comprovativo do pagamento até lá.» Se o browser não a deixar abrir sozinha (a resposta
   chegou tarde), aparece «Falta um passo.» com um botão que a abre; se fechar o pedido antes disso, ao voltar o passo
   1 diz que ainda falta enviar a mensagem, e «Feito» lembra o número do pedido. No Instagram, a mensagem fica copiada
   para colar. «Já enviei o pedido», que salta para o pagamento, só aparece depois de o pacote estar reservado (ou
   quando o pedido voltou a ser só mensagem): nunca passa à frente da reserva nem do logótipo.
3. Na página, os espaços passam logo a «Reservado até 25 out.»; para toda a gente, assim que o GitHub Pages publica o
   commit (1 a 2 minutos). Cada vez que o pedido abre, o site lê outra vez o `data/spots.json` sem cache: um espaço
   que outra marca reservou entretanto sai do pacote e o pedido diz qual foi.
4. Se recarregar a página (ou voltar do WhatsApp com a página recarregada), o pedido volta ao passo 2, reservado. O
   número do pedido fica guardado nesse separador: o mesmo pacote nunca é enviado duas vezes, nem com dois toques
   seguidos, nem com «Voltar» (os botões só enviam outra vez a mensagem). O que escreveu e o logótipo também ficam
   guardados no separador, no máximo 6 horas; «Feito» apaga o nome, o NIF, a mensagem e o logótipo.
5. Quando o Worker recusa, o pedido diz porquê e o que fazer, em português ou inglês: outra marca reservou
   entretanto o espaço (sai do pacote, escolhe outro; o espaço fica reservado na página mesmo antes de o GitHub Pages
   o mostrar), mais de 6 espaços (escolhe o fato completo ou fala comigo), um campo a corrigir, um logótipo que não
   serve (ou pequeno demais, com menos de 64 px). Se já tem outro pedido aberto, o pedido diz o número e até quando;
   este pacote segue só por mensagem, com a linha `Pedido aberto: <número>`, para o juntares a esse pedido. Só quando
   o pedido aberto é exatamente este pacote (a resposta perdeu-se, ou outro separador da mesma marca já o enviou) é
   que o pedido o toma como seu e mostra a reserva.
6. Se o Worker não responder em 25 segundos (tempo que inclui enviar o logótipo numa rede lenta) ou a rede falhar,
   o site tenta uma segunda vez: se o primeiro pedido tiver chegado, o Worker responde com esse pedido e o site
   mostra-o reservado, sem segunda reserva. Se continuar sem resposta, o pedido diz «A reserva está a demorar mais do
   que o costume. Pode já ter ficado feita. Espera um momento e toca outra vez», nunca que não ficou reservado. Se a
   rede falhar duas vezes ou o Worker responder com erro do servidor, nada se perde: os mesmos botões enviam só a
   mensagem, como antes, com a linha «Sem reserva no site: confirmas se está livre? Envio o logótipo nesta
   conversa.», e o pedido diz «O espaço ainda não ficou reservado: confirmo por mensagem.»
7. Depois de confirmares a compra, se a marca ainda tiver o separador aberto com o espaço no pacote, o site diz
   «Compra confirmada: o espaço … já é teu.» e tira-o do pacote.

**O que tu fazes.**
1. A mensagem chega com `Pedido: <número>`. O pedido também aparece na página de admin, em **Pedidos**, com o
   logótipo e o tempo que falta.
2. Quando o pagamento entra (e o comprovativo chega), em **Pedidos** carregas em **Confirmar compra** e em
   **Guardar**: o espaço fica vendido no site com o logótipo da marca e o pedido fica confirmado. Passa o recibo de
   donativo (nunca uma fatura), com o NIF se o pedido o tiver.
3. Sem pagamento, a reserva acaba sozinha no fim do último dia. **Prolongar 48 h** dá mais dois dias; **Cancelar**
   liberta já (num pedido falso, com «bloquear»).
4. Uma mensagem sem `Pedido:` (o Worker estava em baixo) não reservou nada: vê se o espaço está livre, cola a
   mensagem em **Colar pedido ou referência** e reserva ou vende como antes. O logótipo vem na conversa. Uma mensagem
   com `Pedido aberto: <número>` também não reservou nada: é um pacote a mais de uma marca que já tem esse pedido
   (com o logótipo); combina com ela e reserva ou vende estes espaços à parte.

**Contra abusos.** Até 6 espaços por pedido (mais, só o fato completo). No máximo 8 espaços presos ao mesmo tempo por
pedidos do site por pagar, venha de onde vier (o fato completo conta como os 8). Por endereço de internet: 1 pedido
aberto e 3 por dia, e 7 dias de pausa depois de um pedido cancelado ou que acabou sem pagamento. Um pedido falso
cancela-se com «bloquear» (30 dias). Os detalhes estão em `worker/README.md`.

**Testar de ponta a ponta sem mexer no site real.** Nunca faças um pedido de teste em gocarmo.com: cada pedido
reserva espaços a sério, à vista de todos. Testa com o Worker no teu computador, contra um repositório de teste:
1. Faz um fork do repositório (com o branch `gh-pages`) e um token fine-grained só para esse fork, com Contents: Read
   and write.
2. Em `worker/`, cria o ficheiro `.dev.vars` (o git ignora-o; só o `wrangler dev` o lê, nunca vai para o Cloudflare):
   ```
   ADMIN_KEY=uma-chave-de-teste-com-mais-de-16
   SPOTS_GITHUB_TOKEN=<o token do fork>
   REPO=<conta>/<fork>
   DEV_ORIGIN=http://127.0.0.1:8000
   ```
   e corre `npx wrangler dev --local` (fica em `http://127.0.0.1:8787`, com uma cópia local do KV).
3. Noutro terminal, `python3 -m http.server 8000 --bind 127.0.0.1` na raiz e, só nessa cópia, muda `requestsApi` em
   `assets/js/data.js` para `'http://127.0.0.1:8787'` (não faças commit disto: o `stamp.mjs` recusa um endereço
   que não seja https). Abre `http://127.0.0.1:8000`, faz um pedido com um logótipo e vê o commit no fork.
4. Os pedidos guardados: `curl -H "Authorization: Bearer <ADMIN_KEY>" http://127.0.0.1:8787/pedidos`; o logótipo:
   `…/pedidos/<número>/logo`; fechar um: `curl -X POST -H "Authorization: Bearer <ADMIN_KEY>" -H "Content-Type:
   application/json" -d '{"action":"cancelar"}' http://127.0.0.1:8787/pedidos/<número>`. A página de admin só
   fala com um endereço https: os Pedidos dela testam-se com o Worker publicado.

**Ligar o Turnstile (mais tarde).** O Turnstile do Cloudflare trava pedidos feitos por robôs a partir de muitos
endereços. Hoje está desligado, e assim tem de ficar até o site saber pedi-lo: **pôr só o secret faz o Worker
recusar todos os pedidos** (o site diria «A verificação contra spam falhou»). Para o ligar:
1. No painel do Cloudflare, **Turnstile → Add widget**, modo «Managed», com o domínio do Worker
   (`gocarmo-pedidos.rgvduarte.workers.dev`). Ficas com uma site key e uma secret key.
2. Uma mudança de código, por fazer: o Worker passa a servir uma página mínima com o widget (por exemplo
   `GET /verificar`, com a site key) e o pedido de reserva mostra-a num iframe e manda o token que ela devolver no
   campo `turnstile` do `POST /pedido`. Assim o script do Cloudflare corre no endereço do Worker e nunca em
   gocarmo.com, onde está o token da página de admin (o site não carrega scripts de outros servidores).
3. Depois de publicada essa mudança, põe a secret key no secret `TURNSTILE_SECRET` do GitHub (Settings → Secrets
   and variables → Actions) e corre **Actions → Deploy pedidos → Run workflow**. O Worker passa a exigir o token e
   deixa 2 pedidos abertos por endereço em vez de 1. Para desligar, apaga o secret e corre a action outra vez.

**Privacidade.** O nome e o NIF servem só para o recibo. Cada pedido fica guardado 180 dias no Cloudflare e depois
apaga-se sozinho; só a página de admin, com a `ADMIN_KEY`, o lê. No `data/spots.json`, público, só ficam a marca, o
último dia da reserva e o número do pedido. O que a marca escreve no pedido de reserva (e o logótipo) fica no browser
dela só enquanto o separador estiver aberto.

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

## Google Analytics

Com `SITE.ga` vazio (`assets/js/data.js`) o site não mede nada: não há aviso de cookies, nenhum cookie e nenhum
pedido à Google (os tipos de letra também vêm do próprio site, de `assets/fonts/`). Para ligar, prepara o fluxo
(passo 7) e só depois cola ali o ID de medição (`G-…`), corre `node scripts/stamp.mjs` e publica.

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
7. **No ecrã do fluxo (Admin → Data streams → gocarmo.com), antes de colares o ID no site:**
   - **Enhanced measurement** fica ligado, mas na roda dentada desliga **Outbound clicks** e **Form interactions**,
     e em Page views → Show advanced settings desliga **Page changes based on browser history events**. Porquê: o
     site já manda os seus cliques para fora (`outbound_click`, sem o endereço do link) e o link do WhatsApp do
     pedido leva na mensagem a marca, o nome e o NIF. O site esconde a mensagem enquanto a Google lê o link, mas
     com «Outbound clicks» ligado cada clique contava duas vezes. E o menu e os espaços mudam o endereço da
     página (`#fato`, `#fato/peito`): o histórico contava cada mudança como uma visita. Scrolls (a página lida até
     90%) e File downloads podem ficar ligados.
   - **Redact data**: liga a redação de emails e, em «Query parameters», escreve `text, body, subject`. É mais uma
     rede: se algum link com a mensagem do pedido chegasse ao Analytics, essas partes eram apagadas antes de sair do
     browser.
8. Só depois do passo 7: cola o ID em `assets/js/data.js` → `ga: 'G-XXXXXXXXXX'`, corre `node scripts/stamp.mjs`,
   faz commit e push.

**Sem cliques (opcional).** O passo 7 e a retenção de dados também se fazem pela Admin API da Google, com um token
OAuth com o scope `https://www.googleapis.com/auth/analytics.edit` (`PROP` e `STREAM` são os números da propriedade
e do fluxo, em Admin → Property details e Web stream details):

```
PATCH https://analyticsadmin.googleapis.com/v1alpha/properties/PROP/dataStreams/STREAM/enhancedMeasurementSettings?updateMask=outboundClicksEnabled,formInteractionsEnabled,pageChangesEnabled
{"outboundClicksEnabled": false, "formInteractionsEnabled": false, "pageChangesEnabled": false}

PATCH https://analyticsadmin.googleapis.com/v1alpha/properties/PROP/dataStreams/STREAM/dataRedactionSettings?updateMask=emailRedactionEnabled,queryParameterRedactionEnabled,queryParameterKeys
{"emailRedactionEnabled": true, "queryParameterRedactionEnabled": true, "queryParameterKeys": ["text", "body", "subject"]}

PATCH https://analyticsadmin.googleapis.com/v1beta/properties/PROP/dataRetentionSettings?updateMask=eventDataRetention,resetUserDataOnNewActivity
{"eventDataRetention": "FOURTEEN_MONTHS", "resetUserDataOnNewActivity": false}
```

**Definições recomendadas (Admin).**
- Data collection and modification → **Data retention** → Event data retention: **14 months** → Save (por defeito
  são 2 meses). É o prazo que a página de privacidade indica. Na mesma página, desliga **Reset user data on new
  activity** → Save. Ligado (o valor por defeito), cada visita nova adia o apagamento dos dados desse visitante e
  os 14 meses da página de privacidade deixam de ser verdade.
- Data collection and modification → **Data collection** → **Google signals**: desligado (é o valor por defeito; o
  site também o desliga no código).
- Data display → **Key events** → New key event → `generate_lead`, e nas definições dele escolhe a contagem
  **Once per session**. É o número que interessa: pedidos de patrocínio enviados. O site já conta um só por pedido,
  mesmo que a marca o mande por duas vias; «Once per session» cobre também fechar e voltar a abrir o pedido e
  mandar o mesmo pacote outra vez.
- Data display → **Custom definitions** → Create custom dimension (scope Event), uma por parâmetro: `section_id`,
  `link_type`, `link_location`, `payment_type`, `method`, `content_type`, `new_language`; e mais uma com scope
  **User**: `site_language` (a língua em que o site foi visto). Sem isto os parâmetros chegam, mas não aparecem nos
  relatórios. Se o GA disser que uma já existe, salta-a.
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
  → Acquisition → Traffic acquisition. Do endereço de entrada só os `utm_*` vão para o Analytics: o site tira os
  outros parâmetros (`fbclid`, `igshid`, `mc_eid`…), que o Instagram, a Meta e as ferramentas de email juntam sozinhos.

**O que o site mede** (tudo em `assets/js/analytics.js`; `adspace.js` só avisa que espaço está aberto, `gc:spot`,
que espaço entrou ou saiu do pacote, `gc:basket`, e que um link foi partilhado, `gc:share`):

| Evento | Quando | Parâmetros |
|---|---|---|
| `page_view` | o Analytics carrega, depois de «Aceitar» (e outra vez num «Aceitar» depois de recusar, que é um visitante novo) | os do Google Analytics |
| `scroll` | a página lida até 90% (Enhanced measurement) | |
| `section_view` | uma secção fica um segundo no meio do ecrã, pela primeira vez: `historia`, `resultados`, `dados`, `epoca`, `o-fato`, `o-capacete`, `media`, `apoiar`, `contacto` | `section_id` |
| `select_content` | abres um espaço: no 3D, na tabela, nos capítulos ou por link direto (a visita guiada não conta) | `content_type` (`suit_spot` ou `helmet_spot`), `content_id` e `item_id` (o id do espaço, ex. `peito`) |
| `add_to_cart` | juntas um espaço ao pacote | `currency` (EUR), `value` (o preço do espaço), `items` (o espaço) |
| `remove_from_cart` | tiras um espaço do pacote | os mesmos |
| `share` | partilhas o link de um espaço («Partilhar»): conta quando a partilha é feita ou o link fica copiado, não um ecrã de partilha fechado | `method` (`web_share` ou `copy_link`), `content_type`, `item_id` |
| `begin_checkout` | o pedido abre no passo 1 | `currency` (EUR), `value` (o total, já com desconto), `items` (os espaços) |
| `add_payment_info` | escolhes Transferência ou MB WAY, ou copias uma linha do pagamento (uma vez por forma, em cada pedido) | os de cima e `payment_type` (`transfer` ou `mbway`) |
| `generate_lead` | o pedido sai, uma vez por pedido: o Worker reservou os espaços, ou, sem reserva (Worker desligado ou em baixo), a mensagem foi por WhatsApp, email ou Instagram. Um envio recusado por faltar a marca ou o logótipo não conta, nem mandar o mesmo pedido por outra via, nem a mensagem depois da reserva | `currency`, `value`, `method` (`whatsapp`, `email` ou `instagram`) |
| `outbound_click` | um link para fora, exceto os do pedido | `link_type` (`whatsapp`, `email`, `instagram`, `strava`, `gofundme`, `spotify`, `tiktok` ou `other`), `link_domain`, `link_location` (a secção, `nav` ou `footer`) |
| `donation_intent` | em Apoiar: copias o IBAN ou o número MB WAY, ou carregas no botão do GoFundMe | `method` (`transfer`, `mbway`, `gofundme`, ou `whatsapp` enquanto não houver campanha) |
| `language_change` | PT / EN | `new_language` |

O site manda ainda a propriedade de utilizador `site_language` (`pt` ou `en`): a língua em que o site está a ser
visto, outra vez sempre que o visitante a muda (a do browser já vem do Google Analytics). Nunca vão para a Google o
que a marca escreve no pedido, emails, números de telefone, NIF, nomes de marcas nem o endereço dos links.

**O aviso e a lei (RGPD, Lei 41/2004, orientações da CNPD).** O script da Google só carrega depois de «Aceitar»
(Consent Mode v2, modo básico, com anúncios e personalização sempre recusados) e só então há cookies. «Recusar» e
«Aceitar» são iguais. Esc, ou ignorar o aviso, não é aceitar. A escolha fica seis meses no browser (`gc.consent`)
e os cookies `_ga` acabam com ela (o Google Analytics renova-os a cada visita, mas o site dá-lhes só o prazo que
falta à escolha); se o browser não deixar guardar, o aviso volta na visita seguinte. Um browser com Global Privacy
Control ou Do Not Track conta como «Recusar» e não vê o aviso (pode aceitar em «Definições de cookies»); um sinal
ligado depois de «Aceitar» também conta como «Recusar». «Definições de cookies», no rodapé, volta a abrir o aviso;
recusar aí apaga os cookies `_ga` e para o envio na hora. Esvaziar `SITE.ga` desliga tudo e apaga os cookies `_ga`
que tenham ficado.
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

O mesmo script escreve em `index.html` os cartões de «Todas as provas» a partir de `RESULTS` (`assets/js/data.js`), com o mesmo código que os desenha na página (`assets/js/races.js`): são eles que aparecem sem JavaScript e no media kit impresso. Pára com uma lista do que falta se uma prova não tiver o que os cartões precisam (um triatlo sem `splits` ou `ag`, uma corrida sem `pace`). `node scripts/stamp.mjs --check` não muda nada e falha se alguma página estiver desatualizada.

Depois, com o servidor local ligado, `node scripts/results-check.mjs` (precisa do Playwright) confirma num browser a 1440, 390 e 320 px que os cartões escritos em `index.html` e os desenhados pelo JavaScript têm a mesma altura, que os filtros não mexem na página e que sem JavaScript aparecem todas as provas.

O worker que constrói a malha do fato não lê o mapa de importação, por isso o script também põe a versão nos imports dele (`suit-worker.js` → `suit-mesh.js?v=…` → `suit-body.js?v=…`).

## Quando o 3D não aparece num telemóvel

O estúdio tenta várias vezes antes de desistir: se o iPhone tira o contexto WebGL à página (pouca memória, ou ao voltar do WhatsApp), espera que volte e, se não voltar em 1,5 s de página visível, cria outro e passa o fato e o capacete para ele (no máximo duas vezes por visita). Se o primeiro arranque falhar, tenta outra vez com outra configuração da GPU e depois numa versão mais leve. Só então mostra a fotografia com uma frase que diz porquê, o botão «Tentar outra vez» (não aparece quando a página não o pode resolver, como no Modo de isolamento) e um código pequeno (por exemplo `ctx-dead`). Se o browser devolver o contexto mais tarde, o 3D volta sozinho.

- Para ver o que se passou num telemóvel, abre `gocarmo.com/?debug3d`: aparece um painel com o browser, cada contexto WebGL pedido, os tempos e cada perda e recuperação. Tira um screenshot ou carrega em «Copiar». O painel fica ligado nesse separador até abrires `?debug3d=0`. Não envia nada para lado nenhum.
- `?lite3d` força a versão leve, para comparar.
- No Safari do iPhone, se a frase pedir para fechar o Safari de vez, é isso mesmo: o processo gráfico do Safari pode ficar estragado até a app ser fechada no seletor de apps.
- Dentro do Instagram, do Facebook ou do WhatsApp num iPhone, a frase diz o nome da app e há um botão «Abrir no Safari», que também copia o endereço. No Chrome ou no Firefox do iPhone a frase pede para fechar essa app, não o Safari.
- Para tirar o painel do site, põe `DEBUG = false` no início de `assets/js/gl3d.js` e corre `node scripts/stamp.mjs`.

## Créditos técnicos

- Fato e capacete 3D procedimentais, feitos de raiz em [three.js](https://threejs.org) (MIT). Geometria, textura e espaços são gerados em código. O fato é um só corpo anatómico, contínuo nos ombros, nas axilas e nas ancas (`assets/js/suit-body.js`), malhado num worker (`suit-mesh.js`). O capacete é o EKOI Pure Aero do Gonçalo, medido nas fotografias do produto.
- Scroll suave com [Lenis](https://github.com/darkroomengineering/lenis) (MIT) e cenas de scroll com [GSAP ScrollTrigger](https://gsap.com).
- Tipografia: Anton, Inter e JetBrains Mono (OFL), servidas pelo próprio site: `assets/fonts/` (os ficheiros do Google Fonts, só latin e latin-ext, com as licenças ao lado) e `assets/css/fonts.css`.
- Fotografias: portefólio do atleta.
