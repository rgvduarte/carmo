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
- **Época 2027**: sete provas em Portugal, Espanha e Japão, com a vaga para Kona em jogo no IRONMAN Japan South Hokkaido
  (12 de setembro de 2027). Kona, garantindo a qualificação, é em 2028: fica no fim do calendário, fora das contas e do
  orçamento.
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
- **Montra «O meu material»** (`#material`, entre Apoiar e Contacto, com «Material» no menu; em inglês «My gear»):
  os produtos que o Gonçalo usa das marcas que o patrocinam, um cartão por produto com a fotografia, uma linha dele
  sobre como o usa (PT e EN), o link para a loja da marca com a etiqueta gocarmo e, se a marca quiser, um código de
  desconto com o botão «Copiar». Diz que é publicidade e os links levam `rel="sponsored noopener"`. Só existe quando
  `data/montra.json` tem um produto ativo; sem nenhum (o estado publicado), a página, o menu, o media kit impresso e a
  página sem JavaScript ficam iguais, sem rasto da secção. Ver «Montra «O meu material»», mais abaixo.
- **Contacto** e **media kit** (o botão imprime a página como PDF limpo).
- **Privacidade** (`/privacidade/`, ligada no rodapé): o que o site guarda e porquê. Com as estatísticas do site
  ligadas, explica a contagem de visitas sem cookies e tem o botão «Não contar as minhas visitas». Com o Google
  Analytics ligado, aparece também o aviso de cookies e, no rodapé, «Definições de cookies».
- **Condições do patrocínio** (`/condicoes/`, num botão depois dos níveis, na ficha de cada espaço, no cartão do fato
  completo e no fim das tabelas de preços, no rodapé e no passo 1 do pedido, «Ao enviar, aceitas as condições do
  patrocínio (versão de 30.10.2026).»; ver «Condições do patrocínio nos pedidos e nos PDF»): o que inclui um espaço, o que fica de fora, como se reserva
  e paga, a secção «Duração, prazos e renovação» (o período da época, o desconto de época com a tabela por mês, o
  prazo do logótipo, a preferência na renovação, a renovação de todos os níveis à tabela de 2028, o
  pagamento da renovação até 15 de janeiro, o aviso de outubro, já sem triatlos, e a conta das devoluções por meses),
  a montra do site («A montra do site», com os produtos por nível), o parceiro de prova e o que se combina num acordo
  escrito. A data «Atualizada a», nas duas línguas, muda
  sempre que o texto mudar: cada patrocínio segue a versão do dia do pedido. No mesmo dia muda também a data da
  chave `cl.terms` (a linha do passo 1: `index.html` e, em inglês, `assets/js/i18n.js`) e `seasonRules.termsDate` em
  `data/spots.json`, que o Worker e os registos dos patrocínios guardam. A linha «Condições do patrocínio (versão de
  …): https://gocarmo.com/condicoes/» da mensagem do pedido (`msg.terms`) e a do comprovativo saem sozinhas de
  `seasonRules.termsDate`. `node scripts/stamp.mjs --check` falha enquanto estas três datas não forem a
  mesma, e também se as datas da época ou a tabela do desconto de época da página não baterem com `seasonRules` (ver
  «Época, prazos e renovação», mais abaixo), ou se os números de produtos da montra por nível não forem os de `LIMIT`
  (`assets/js/montra-core.js`).
  As notas para ti estão num comentário no topo da página (advogado, contabilista, capacete, equipa, Cloudflare).
- **Cartão de contacto** (`/cartao/`, para o Gonçalo mostrar e partilhar): foto, contactos, «Guardar contacto», o QR
  do cartão e, depois de ligado, «Adicionar à Apple Wallet». Ver «Cartão de contacto», mais abaixo.

PT e EN (botão no topo; a língua também segue o browser).

## Atualizar conteúdos

| O quê | Onde |
|---|---|
| Preços, estado (`available` / `reserved` / `sold`) e textos dos espaços | `data/spots.json` |
| Preço do fato completo e desconto de pacote | `data/spots.json` → `title`, `bundle` |
| Datas da época (período, prazo do logótipo, desconto de época, fim dos pedidos, renovação) | `data/spots.json` → `seasonRules` (ver «Época, prazos e renovação»; as mesmas datas estão escritas em `condicoes/index.html`) |
| Patrocínios pagos (contratos, renovações) | página `/admin/patrocinios/`, guardados no Worker dos pedidos (ver «Patrocínios») |
| Montra «O meu material» (os produtos dos parceiros e as fotografias) | `data/montra.json` e `assets/img/montra/`, sempre pelo editor da página `/admin/patrocinios/` (botão «Montra» no cartão de cada patrocínio; ver «Montra «O meu material»») |
| Link do GoFundMe e números da campanha | `data/gofundme.json` (ver «GoFundMe», mais abaixo) |
| Estatísticas do site (o endereço do Worker `gocarmo-api` e o modo) | `assets/js/data.js` → `SITE.stats` (`url` vazio = não mede nada; depois de mudar, `node scripts/stamp.mjs`; ver «Estatísticas do site») |
| Google Analytics (ID de medição `G-…`) | `assets/js/data.js` → `SITE.ga` (vazio = sem Google Analytics e sem aviso de cookies; ver «Google Analytics») |
| Página de privacidade (PT e EN) | `privacidade/index.html` |
| Condições do patrocínio (PT e EN) | `condicoes/index.html` (se mudares o que um espaço inclui no site, muda também aqui) |
| IBAN, titular e MB WAY | `assets/js/data.js` → `SITE.iban`, `SITE.payee`, `SITE.mbway`, `SITE.mbwayMax` |
| Resultados, calendário 2027, orçamento, números do Instagram | `assets/js/data.js` (depois de mudar `RESULTS`, `node scripts/stamp.mjs` escreve os cartões de «Todas as provas» em `index.html`; no orçamento, `eur` é um número ou um intervalo `[mín, máx]`; em `SOCIAL`, os seguidores têm a data deles, `followersAsOf`) |
| Textos da página | `index.html` (PT) e `assets/js/i18n.js` (EN) |
| Textos do comprovativo do pedido (PDF e cartão do passo 2) | `assets/js/i18n.js` → `rcpt.*`, `cl.rcpt*` e `cl.nag*` (PT e EN; `rc.*` são os da tabela de preços); o desenho do PDF em `assets/js/receipt.js` |
| Documentos do cofre (kits, guiões, folhetos, manuais) | no computador, `node scripts/docs-publish.mjs` com a configuração em `~/gocarmo-cofre/` (ver «Documentos (o cofre)») |
| Fotografias | `assets/img/` (WebP + JPG, 800/1600 px; as da montra em `assets/img/montra/`, feitas pelo editor, 600/1200 px) |
| Cartão de contacto (página, vCard, QR, Apple Wallet) | `cartao/`, `wallet/cartao/pass.json` e `python3 scripts/cartao.py` (ver «Cartão de contacto») |
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
   **Feito** fecha o pedido e esvazia o pacote (se a marca ainda não guardou o comprovativo, pergunta uma vez antes:
   ver **Compras automáticas**). O email abre a app de email do aparelho com a mesma mensagem; se a
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
- **Confirmar compra**: abre a venda com a marca e o logótipo do pedido, com «Pago a» (hoje, por defeito) e
  «Montante recebido» (o total do pedido, por defeito). Ao guardar, é uma venda como as outras (um commit com o teu
  token, o logótipo vai para o site), o pedido fica confirmado e o Worker regista o patrocínio, que aparece em
  **Patrocínios** (ver mais abaixo). Se o registo falhar, o pedido diz «Contrato por registar» e o mesmo botão
  tenta outra vez; nunca regista duas vezes. Se os espaços já estiverem
  vendidos a essa marca, o botão é **Marcar como confirmado**, que pede as mesmas duas coisas; se foram vendidos sem
  logótipo, aparece antes **Pôr o logótipo do pedido**. Um pedido fechado sem registo mostra **Registar contrato**.
  Um pedido com desconto de época mostra «Desconto de época (março): −6,25%» ao lado do total.
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
   pedido) para o patrocínio ficar fechado» (no fato completo: «Antes de pagares, envio-te o acordo escrito. A reserva
   fica até essa data e prolongo-a se for preciso.»), e por baixo os dados de MB WAY ou da transferência (o que
   escolheu), o montante e o descritivo `CARMO`. Enquanto o pedido segue, o botão tocado diz «A reservar…».
   A app escolhida abre sozinha com a mensagem, que agora leva `Pedido: <número>`, «Reservado durante 48 horas, até
   25 de outubro. Envio o comprovativo do pagamento até lá.» (no fato completo: «Reservado até 25 de outubro. Antes de
   pagar, fico à espera do acordo escrito.») e a linha das condições, com a data delas. Se o browser não a deixar
   abrir sozinha (a resposta chegou tarde), aparece «Falta um passo.» com um botão que a abre; se fechar o pedido antes
   disso, ao voltar o passo 1 diz que ainda falta enviar a mensagem, e «Feito» lembra o número do pedido. No
   Instagram, a mensagem fica copiada para colar. «Já enviei o pedido», que salta para o pagamento, só aparece depois
   de o pacote estar reservado (ou quando o pedido voltou a ser só mensagem): nunca passa à frente da reserva nem do
   logótipo.
3. **O comprovativo.** No passo 2, a primeira ação é **Guardar comprovativo**: um PDF de uma página A4 que o próprio
   browser escreve (`assets/js/receipt.js`, que só carrega quando a marca carrega no botão, com as letras Helvetica de
   qualquer leitor de PDF e o emblema GOCARMO desenhado), `gocarmo-pedido-<número>.pdf`. No telemóvel abre a folha de
   partilha (Ficheiros, WhatsApp, email); no computador descarrega. Leva o cabeçalho GOCARMO, «Comprovativo do pedido
   de reserva», o número do pedido, a data e a hora do pedido (hora de Lisboa), a marca, o nome e o NIF (se os deu),
   cada espaço com o número, o nome, fato ou capacete e o preço, o período da época, o desconto de época (a partir de
   fevereiro de 2027, com o mês e a percentagem), o desconto de pacote, o total, «Reservado até …», como
   pagar (transferência para o IBAN e o titular de `SITE`, MB WAY até `SITE.mbwayMax`, o montante e a referência
   `CARMO`, que numa referência longa passa à linha seguinte sem nunca ser cortada), o que vem a seguir (pagar e
   enviar o comprovativo do pagamento até ao dia da reserva, escrito na frase; o logótipo em vetor até 15 de janeiro
   de 2027, `seasonRules.logoBy`, ou, depois dessa data, a partir de que prova entra no fato; a regra do desconto de
   época, quando há; a preferência na renovação até 31 de outubro de 2027), a linha das condições com a data delas
   (`rcpt.termsV`, da mesma `seasonRules.termsDate` da mensagem), o contacto e, no fim, «Este
   documento não é uma fatura nem um recibo. …». A seguir, em anexo, as condições na versão do pedido (ver «Condições
   do patrocínio nos pedidos e nos PDF»). Os valores são os do passo 2 e da mensagem, tirados das mesmas funções:
   o número, o total, a referência e o dia batem sempre certo. No fato completo não há dados da conta: diz que antes de
   pagar envias o acordo escrito, até quando fica reservado, e a referência `CARMO FATO`, só por transferência. Sem
   reserva (o Worker em baixo, mais de 6 espaços, ou sem Worker) é um «Resumo do pedido de reserva», sem número, que
   diz que o espaço ainda não está reservado no site; a hora é a do envio da mensagem (ou, depois de «Já enviei o
   pedido» sem envio neste separador, a do próprio resumo, e a linha diz «Data deste resumo»). **Ver no ecrã** mostra
   o mesmo num cartão claro, para um screenshot, com o essencial no início (a reserva e o número, o montante, a
   referência e onde pagar) e o resto por baixo: no browser do Instagram ou do Facebook, onde o PDF pode não ficar
   guardado, o cartão já vem aberto e uma linha diz para tirar o screenshot; se não der para guardar, o passo 2 diz isso
   e abre o cartão. Um duplo toque no botão entrega o PDF uma vez só. Depois de recarregar a página, o passo 2 volta
   com o mesmo comprovativo (o número, o dia, a hora e os espaços vêm de `gc.claim.req`; sem reserva, a hora do envio
   vem de `gc.claim.at`; o nome e o NIF, do rascunho). Não é obrigatório, mas no passo 2 **Feito** pergunta uma vez se
   a marca ainda não o guardou nem partilhou: «Ainda não guardaste o comprovativo.», com **Guardar comprovativo**
   (guarda e fecha) e **Fechar sem guardar** (fecha como antes). Nada disto sai do aparelho da marca: não há pedido à
   rede, e o único dado novo guardado é a hora do envio (`gc.claim.at`, no separador, ao lado da nota do pedido
   enviado). Nas estatísticas do site contam como cliques em «Reserva» (`#cl-rcpt-save`, `#cl-rcpt-view`,
   `#cl-nag-save`, `#cl-nag-close`), sem eventos novos; `claim_done` conta quando «Feito» fecha mesmo o pedido, não
   o toque que só mostrou a pergunta.
4. Na página, os espaços passam logo a «Reservado até 25 out.»; para toda a gente, assim que o GitHub Pages publica o
   commit (1 a 2 minutos). Cada vez que o pedido abre, o site lê outra vez o `data/spots.json` sem cache: um espaço
   que outra marca reservou entretanto sai do pacote e o pedido diz qual foi.
5. Se recarregar a página (ou voltar do WhatsApp com a página recarregada), o pedido volta ao passo 2, reservado. O
   número do pedido fica guardado nesse separador: o mesmo pacote nunca é enviado duas vezes, nem com dois toques
   seguidos, nem com «Voltar» (os botões só enviam outra vez a mensagem). O que escreveu e o logótipo também ficam
   guardados no separador, no máximo 6 horas; «Feito» apaga o nome, o NIF, a mensagem e o logótipo.
6. Quando o Worker recusa, o pedido diz porquê e o que fazer, em português ou inglês: outra marca reservou
   entretanto o espaço (sai do pacote, escolhe outro; o espaço fica reservado na página mesmo antes de o GitHub Pages
   o mostrar), mais de 6 espaços (escolhe o fato completo ou fala comigo), um campo a corrigir, um logótipo que não
   serve (ou pequeno demais, com menos de 64 px). Se já tem outro pedido aberto, o pedido diz o número e até quando;
   este pacote segue só por mensagem, com a linha `Pedido aberto: <número>`, para o juntares a esse pedido. Só quando
   o pedido aberto é exatamente este pacote (a resposta perdeu-se, ou outro separador da mesma marca já o enviou) é
   que o pedido o toma como seu e mostra a reserva.
7. Se o Worker não responder em 25 segundos (tempo que inclui enviar o logótipo numa rede lenta) ou a rede falhar,
   o site tenta uma segunda vez: se o primeiro pedido tiver chegado, o Worker responde com esse pedido e o site
   mostra-o reservado, sem segunda reserva. Se continuar sem resposta, o pedido diz «A reserva está a demorar mais do
   que o costume. Pode já ter ficado feita. Espera um momento e toca outra vez», nunca que não ficou reservado. Se a
   rede falhar duas vezes ou o Worker responder com erro do servidor, nada se perde: os mesmos botões enviam só a
   mensagem, como antes, com a linha «Sem reserva no site: confirmas se está livre? Envio o logótipo nesta
   conversa.», e o pedido diz «O espaço ainda não ficou reservado: confirmo por mensagem.»
8. Depois de confirmares a compra, se a marca ainda tiver o separador aberto com o espaço no pacote, o site diz
   «Compra confirmada: o espaço … já é teu.» e tira-o do pacote.

**O que tu fazes.**
1. A mensagem chega com `Pedido: <número>`. O pedido também aparece na página de admin, em **Pedidos**, com o
   logótipo e o tempo que falta.
2. Quando o pagamento entra (e o comprovativo chega), em **Pedidos** carregas em **Confirmar compra** e em
   **Guardar**, com a data e o montante do pagamento: o espaço fica vendido no site com o logótipo da marca, o pedido
   fica confirmado e o patrocínio fica registado em **Patrocínios**. Passa o recibo de donativo (nunca uma fatura), com
   o NIF se o pedido o tiver, e envia à marca a **Confirmação (PDF)** desse patrocínio.
3. Sem pagamento, a reserva acaba sozinha no fim do último dia. **Prolongar 48 h** dá mais dois dias; **Cancelar**
   liberta já (num pedido falso, com «bloquear»). No fato completo, a marca espera pelo acordo escrito antes de
   pagar: envia-lho e, enquanto não estiver fechado, prolonga a reserva.
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
apaga-se sozinho; só a página de admin, com a `ADMIN_KEY`, o lê. O registo de um patrocínio pago fica no mesmo
serviço até 31 de dezembro do ano a seguir à época (31 de dezembro de 2028 para a época 2027) e depois apaga-se
sozinho; a página de privacidade diz isto nas duas línguas. Se mudares esse prazo (`contractExpiry` em
`assets/js/season-rules.js`), muda a página com ele. No `data/spots.json`, público, só ficam a marca, o
último dia da reserva e o número do pedido. O que a marca escreve no pedido de reserva (e o logótipo) fica no browser
dela só enquanto o separador estiver aberto. O comprovativo (o PDF e o cartão) faz-se no aparelho dela e não vai para
lado nenhum.

## Condições do patrocínio nos pedidos e nos PDF

- **Os botões.** No capítulo 05, «Ler as condições do patrocínio» (EN «Read the sponsorship terms») num bloco logo
  depois dos quatro níveis e no fim de cada tabela de preços (fato e capacete); «Ler as condições» (EN «Read the
  terms») na ficha de cada espaço, por baixo do preço (quem chega por um link direto, `#fato/peito`), e ao lado de
  «Pedir o fato completo». Todos são `.btn.ghost.sm` (o bloco, `.btn.ghost`) e abrem `/condicoes/` noutro separador
  (o 3D, a ficha e o pacote ficam como estavam), em inglês `condicoes/?lang=en`; os links «condições» do texto do 05
  também, e todos dizem ao leitor de ecrã «(abre noutro separador)». O passo 1 do pedido diz «Ao enviar, aceitas as
  condições do patrocínio (versão de 30.10.2026).», o mesmo nome da versão que a mensagem e o anexo usam; o rodapé abre
  no mesmo separador.
- **A mensagem** do pedido (WhatsApp, email, Instagram) leva «Condições do patrocínio (versão de 30.10.2026):
  https://gocarmo.com/condicoes/» (EN «Sponsorship terms (version of 30 October 2026): …?lang=en»), feita de
  `seasonRules.termsDate`.
- **Os PDF.** O comprovativo do pedido e a confirmação do patrocínio têm a primeira página igual à de antes e, a
  seguir, «Anexo · Condições do patrocínio · versão de 30.10.2026»: o texto inteiro da página, na língua do documento,
  com títulos, listas, a tabela do desconto de época, «Página 2 de 7» e links (a página no ar, Privacidade, email,
  WhatsApp; o endereço da Privacidade escrito a seguir ao link, para o papel; cada «(em «Duração, prazos e
  renovação»)» leva a esse título do anexo). Em inglês, o anexo diz que vale o texto português e liga para ele
  (`condicoes/?lang=pt`); o link da página 1 da confirmação em inglês também vai para `?lang=en`. Se a última página
  ficar com menos de um quarto, o anexo volta a ser paginado com as linhas um pouco mais juntas, se isso poupar a
  página. O comprovativo leva a versão do dia do pedido (uma página aberta antes de uma mudança das condições vai
  buscar o texto dela a `data/terms/<data>.json`); a confirmação, a do contrato (`terms` do registo). Uma versão sem
  texto guardado (antes de 26.10.2026) vai sem anexo, e a janela da confirmação diz isso.
- **De onde vem o texto.** `assets/js/terms-text.js` é escrito por `node scripts/stamp.mjs` (`scripts/terms-text.mjs`) a
  partir dos dois `<article>` de `condicoes/index.html`: nunca o edites à mão. Só carrega quando se faz um PDF. Quando
  `seasonRules.termsDate` muda, o stamp guarda o texto da versão anterior em `data/terms/<data>.json` (já lá estão
  26.10.2026, 28.10.2026 e 29.10.2026) e a soma sha256 dele em `data/terms/SHA256SUMS`; daí em diante confere cada
  ficheiro com a sua linha, porque as confirmações de contratos antigos anexam esse texto.
- **O que o stamp recusa:** uma marcação na página que o anexo não sabe desenhar (um `<em>`, um `<ol>`, um `<br>`: ensina
  `scripts/terms-text.mjs` e `assets/js/pdf-annex.js`), texto da página que não chegue ao anexo, o módulo desatualizado,
  datas que não batem, o texto mudado depois do próprio dia sem data nova (muda a data no mesmo dia em que mudas o
  texto), um ficheiro de `data/terms/` que não seja o que o `SHA256SUMS` fixou, e um elemento escondido no artigo
  (`hidden`, `aria-hidden`, `sr-only`: o anexo só imprime o que a página mostra). Uma versão já publicada (o
  `origin/gh-pages` tem o `terms-text.js` dessa data) não muda de texto, nem no próprio dia: a mudança leva data nova.

## Época, prazos e renovação

A época é o ano civil. Todas as datas da época estão num só sítio, o bloco `seasonRules` de `data/spots.json`, que o
site (o pedido, a mensagem, o comprovativo), a página de admin, a página Patrocínios e o Worker leem. As contas estão
num só ficheiro, `assets/js/season-rules.js`, que o site, o admin e o Worker importam (o Worker leva-o no
`wrangler deploy`). Mudar de época é mudar esse bloco, os preços e as datas escritas em `/condicoes/`.

| Chave | Época 2027 | Para quê |
|---|---|---|
| `start`, `end` | 2027-01-01, 2027-12-31 | o período escrito em todo o lado: «Época 2027 · 1 jan a 31 dez 2027» |
| `logoBy` | 2027-01-15 | último dia do logótipo em vetor para o fato e o capacete do primeiro triatlo |
| `fullPriceUntil` | 2027-01-31 | até este dia (e em todos os pedidos de 2026) paga-se o preço da tabela |
| `racesUntil` | 2027-09-30 | o último triatlo do calendário é neste dia ou antes; do dia seguinte até `requestsUntil`, o pedido, a mensagem e o comprovativo dizem que já não há triatlos com o fato em 2027 (ver «Outubro, sem triatlos») |
| `requestsUntil` | 2027-10-31 | último dia em que o site e o Worker aceitam pedidos da época; depois o pedido diz que fechou |
| `proposalsFrom` | 2027-09-01 | a partir deste dia envias a proposta de 2028 a cada patrocinador |
| `renewBy` | 2027-10-31 | último dia para o patrocinador dizer que sim e ficar com o espaço |
| `openFrom` | 2027-11-01 | os espaços não renovados ficam livres para todos |
| `renewPayBy` | 2028-01-15 | último dia para pagar a renovação de 2028 (o prazo do logótipo de 2028); sem o pagamento, o espaço fica livre a partir do dia seguinte |
| `termsDate` | 2026-10-30 | a data das condições em vigor (a «Atualizada a» de `/condicoes/`) |

O fuso é sempre o de Lisboa. `node scripts/stamp.mjs` recusa um bloco com datas impossíveis (fora da época, fora de
ordem, `fullPriceUntil` que não seja o último dia de um mês, `requestsUntil` em dezembro, `racesUntil` fora da época,
`renewPayBy` que não fique no início da época seguinte, depois de `renewBy` e até 31 de março). Um `spots.json` sem o
bloco (uma cópia antiga em cache) usa as datas por defeito da época, por isso o preço nunca falha.

**Desconto de época** (quem entra a meio da época). Até 31 de janeiro de 2027 paga-se a tabela. A partir de 1 de
fevereiro, o preço desce um quarto da parte da época que já passou, contando como passado o mês do pedido (dia de
Lisboa): `m` é o número do mês do pedido (fevereiro 2 … outubro 10) e o desconto é `m/48` do preço. Em março já
passaram 3 de 12 meses; o desconto é um quarto disso, 6,25%. Nunca chega aos 25%: o maior é outubro, 20,83%.
A conta, sempre pela mesma ordem e só com números inteiros: primeiro o desconto de época, depois o de pacote (3 ou mais
espaços, 10%, nunca no fato completo) e, no fim, um só arredondamento ao euro, com os 50 cêntimos para cima:
`total = arredonda(preço × (48 − m) × (100 − desconto de pacote) / 4800)`, com `m = 0` até 31 de janeiro (o total é
então o de sempre).

| Mês do pedido | fev | mar | abr | mai | jun | jul | ago | set | out |
|---|---|---|---|---|---|---|---|---|---|
| Desconto | 4,17% | 6,25% | 8,33% | 10,42% | 12,5% | 14,58% | 16,67% | 18,75% | 20,83% |
| Espaço de 100 € | 96 € | 94 € | 92 € | 90 € | 88 € | 85 € | 83 € | 81 € | 79 € |
| Espaço de 600 € | 575 € | 563 € | 550 € | 538 € | 525 € | 513 € | 500 € | 488 € | 475 € |

Outros exemplos: o Abdómen em fevereiro, 144 €; o Peito, o Topo das costas e a Clavícula esquerda (1 100 €) em março,
928 €, e em outubro, 784 €; o fato completo em fevereiro, 2 875 €. Vale o preço do dia do pedido se for pago dentro
da reserva (também quando a prolongas para o mês seguinte). Com o Worker, o dia que conta é o do Worker; sem ele, o
do envio da mensagem. O «um quarto» (`SEASON_DIV = 48`) está no código e não no bloco: é uma condição escrita em
`/condicoes/`, com a tabela, e mudá-lo é mudar as condições.

Onde aparece: no passo 1 do pedido (o período sempre; a partir de fevereiro, o preço com o desconto e uma linha que o
explica), na barra do pacote («−6,25% de época»), na mensagem do pedido, no comprovativo, no admin e na confirmação
do patrocínio. A mensagem leva a linha `Desconto de época (março, mês 3): −6,25%` (em inglês `Mid-season discount
(March, month 3): −6.25%`): é dela que o admin tira o mês quando colas a mensagem, e avisa se o total ou a percentagem
não baterem. Uma mensagem sem essa linha conta como `m = 0`. O nome é sempre «desconto de época» ou «entrada a meio da época» (em
inglês «mid-season discount»).

**Devoluções contadas por meses** (lesão sem nenhum triatlo por decisão minha, conduta): o que a marca pagou, a
dividir pelos meses do mês do pedido a dezembro (12 nos pedidos até 31 de janeiro), vezes os meses completos depois do
mês em que o patrocínio acaba. Peito pedido em março, 563 €, paragem em junho: 563 € × 6/10 = 337,80 €.

**Renovação.** Todos os patrocinadores, de qualquer nível, têm preferência no mesmo espaço na época seguinte: envias a
proposta a partir de 1 de setembro de 2027; quem disser que sim até 31 de outubro de 2027 fica com o espaço; a partir
de 1 de novembro de 2027 os não renovados ficam livres. Todos os níveis renovam ao preço da tabela de 2028, o
Principal e o fato completo também (decisão de 29.10.2026, nas condições de 30.10.2026); o desconto de pacote conta
como em qualquer pedido. Quem renova paga até 15 de janeiro de 2028 (`renewPayBy`, o prazo do logótipo de 2028); sem o
pagamento até lá, o espaço fica livre a partir de 16 de janeiro. A mensagem, o comprovativo e a confirmação (PDF)
dizem a tabela de 2028 e o prazo do pagamento. A página Patrocínios lembra cada passo. Quem fez o pedido com as
condições de 29.10.2026 tem em anexo essa versão, que dava o preço de 2027 ao Principal e ao fato completo; se houver
um, combina-o por escrito.

**Outubro, sem triatlos.** O calendário de triatlos de 2027 acaba em setembro (`racesUntil`, 30 de setembro). Os pedidos
continuam abertos até 31 de outubro, mas de 1 a 31 de outubro o passo 1 do pedido, a mensagem e o comprovativo dizem
que já não há triatlos com o fato (ou o capacete) em 2027 e que, até 31 de dezembro, o espaço vale pelo site, pelas
publicações, pelo fato nos treinos (num espaço do fato) e pela preferência em 2028 e, a partir do Principal, também
pelo logótipo no equipamento de treino. As linhas do logótipo deixam de prometer uma prova. Até 30 de setembro nada
muda. Se entrar um triatlo depois de 30 de setembro, muda `racesUntil` e, no mesmo dia, as
condições, que escrevem a data (o `stamp.mjs` compara-as).

**Mudar de época (para 2028).** Depois de 1 de novembro de 2027, com a tabela de 2028 pronta:
1. Em Patrocínios, exporta o CSV de 2027 (é a tua cópia; apaga-a até 31 de dezembro de 2028).
2. Na página de admin, liberta os espaços que não foram renovados (os renovados ficam vendidos à mesma marca).
3. Em `data/spots.json`: `"season": "2028"`, o bloco `seasonRules` de 2028 (as mesmas datas, um ano depois, com
   `renewPayBy` em janeiro de 2029 e `racesUntil` no dia do último triatlo do calendário de 2028, e o `termsDate` do
   dia em que publicas) e os preços de 2028.
4. Em `/condicoes/`: as datas de 2028 nas duas línguas, a tabela do desconto de época (se os preços de exemplo
   mudarem) e a data «Atualizada a»; no mesmo dia `cl.terms` e `msg.terms` (ver «Condições do patrocínio», em cima).
5. `node scripts/stamp.mjs` e `node scripts/stamp.mjs --check`: recusa enquanto as condições não tiverem as datas
   novas. Depois publica.
6. Quando cada patrocinador renovado pagar (até 15 de janeiro de 2028), regista-o como patrocínio de 2028 em
   Patrocínios («Novo patrocínio», época 2028, à tabela de 2028). O cartão de 2027 passa a «Renovação de 2028 paga».
   Quem não pagou até 15 de janeiro perde o espaço: liberta-o na página de admin.
7. Na montra, cada época tem a sua entrada. Os produtos de 2027 saem sozinhos a 31 de dezembro de 2027, e a entrada
   de 2027 fica no ficheiro, escondida, com o histórico. Para uma marca renovada, «Montra» no cartão de 2028 abre uma
   entrada nova da época 2028, com outro id (o da marca com `-2` no fim; os cliques de 2028 aparecem à parte nas
   Estatísticas), e lá voltas a juntar os produtos, com o início de 2028. Exporta o CSV da Montra de 2027 antes de
   fechares os relatórios dessa época.
O Worker não precisa de ser publicado outra vez: lê `data/spots.json` em cada pedido. Até ao passo 5, o site não
aceita pedidos (a época 2027 fechou a 31 de outubro de 2027).

## Patrocínios

**Onde.** `gocarmo.com/admin/patrocinios/` (link «Patrocínios» no fim de `/admin/`, das estatísticas e do Strava).
Só em português, feita para o telemóvel. Usa a mesma chave dos Pedidos (a `ADMIN_KEY`): vindo de `/admin/` no mesmo
separador já está lá; senão, a página pede-a, e as Palavras-passe do iPhone preenchem-na. Para ver e gerir os
patrocínios não precisa do token do GitHub; só a montra o pede, ao publicar (ver «Montra «O meu material»»).
«Esquecer a chave e o token», no fim da página, apaga a chave dos pedidos e também o token do GitHub que a montra
tenha guardado neste browser (com «Lembrar neste telemóvel», ficava guardado até aqui); usa-o num telemóvel que não é
teu.

**O registo de cada patrocínio.** Fica no Worker dos pedidos (Cloudflare), nunca num ficheiro público. Nasce quando
confirmas um pedido pago em **Pedidos** (com a data e o montante) ou à mão, em **Novo patrocínio**, para um acordo
fechado por email, WhatsApp, em pessoa ou em produto. Guarda a marca, os espaços e os preços desse dia, o desconto de
época e o de pacote, o montante pago (pode ser outro, num acordo; em produto pode ser 0, com a descrição), a data e a
forma do pagamento, a época e o período, o estado da renovação, o contacto (nome, canal, email, telefone ou conta, só
o que houver), o NIF se o deu, a língua, se o logótipo em vetor já chegou, as notas, o número do pedido e o histórico
das mudanças. Apaga-se sozinho a 31 de dezembro do ano a seguir à época.

**O que a página mostra.**
- **Agora**: o que há para fazer hoje, cada linha com o seu botão. Até 15 de janeiro, os logótipos em vetor que
  faltam («Recebido»); um patrocinador cujo pedido (ou, à mão, o pagamento) foi depois de 15 de janeiro e ainda sem a
  prova a partir da qual o logótipo entra no equipamento («Falta combinar a prova do logótipo», «Editar»); um espaço
  vendido sem logótipo no site; um contrato cujos espaços não estão vendidos a essa marca no site; um pedido confirmado
  sem registo («Registar»); de 1 de setembro a 31 de outubro, as propostas de 2028 por enviar («Enviei a proposta»;
  nas duas últimas semanas, «ainda por enviar», com o prazo); nas duas últimas semanas antes de 31 de outubro, as
  respostas que faltam («Renova», «Não renova»); a partir de 1 de novembro, os espaços para libertar (também os de quem
  nunca recebeu proposta); de 1 de novembro a 15 de janeiro, as renovações de 2028 por pagar («Renovação de 2028 por
  pagar: Marca (espaços), até 15 jan.») e, depois, as que não foram pagas («Renovação de 2028 não paga: Marca. Liberta
  o espaço em Espaços.»); no último mês, os contratos que acabam a 31 de dezembro.
- **A prova do logótipo.** Num pedido depois de 15 de janeiro, o site diz à marca que o logótipo entra no equipamento a
  partir da prova que lhe dizes antes de ela pagar. Os Pedidos lembram-te disso («Diz a prova antes do pagamento»);
  depois, escreve-a em Patrocínios (Editar, «A partir da prova»). A data que conta é a do pedido, como no comprovativo.
  Num pedido depois de 30 de setembro (`racesUntil`) já não há triatlos em 2027: os Pedidos não pedem a prova e o
  cartão diz «sem triatlos em 2027 depois do pedido».
- **Calendário**: início (1 jan), logótipos (15 jan), propostas (1 set), último triatlo (30 set), renovação (31 out),
  livres para todos (1 nov), fim (31 dez) e pagamento das renovações (15 jan 2028), cada data com «passou», «hoje» ou
  quantos dias faltam. **Juntar ao calendário** descarrega um
  `.ics` com estas datas e um lembrete por marca: a proposta por enviar (a 1 de setembro, ou no dia a seguir à
  exportação, se já passou), e a resposta que falta de quem já recebeu a proposta (uma semana antes de 31 de outubro),
  sempre às 9:00; a renovação também uma semana antes. Leva ainda o último dia do pagamento das renovações (15 de
  janeiro de 2028, também com lembrete uma semana antes) e, para cada marca que renovou e ainda não pagou, «Pagamento
  2028: Marca (espaços) (até 15 jan.)» uma semana antes. No iPhone, abre o ficheiro e carrega em «Adicionar todos». Abrir um `.ics` novo atualiza os mesmos eventos
  em vez de os repetir. Só leva o nome das marcas e dos espaços: nem contactos, nem NIF, nem montantes.
- Um resumo (quantos patrocínios, quanto recebido, quantos a propor, quantos à espera de resposta), os filtros da
  renovação (Todos, Antes das propostas, A propor, Proposta enviada, Renova, Não renova, Terminados), a época e a
  pesquisa por marca.
- **Um cartão por patrocínio**: marca e nível, espaços, montante e data do pagamento (com «Desconto de época
  (março): −6,25%» quando o montante é o da tabela; num acordo com outro montante, «A tabela pedia …»; em produto, o
  que foi combinado e quando, sem «0 €»), o período e os dias que faltam, o estado da renovação com os toques do passo
  seguinte (Antes das propostas → A propor a partir de 1 de setembro → «Enviei a proposta» → Proposta enviada a <dia>
  → Renova ou Não renova; «Desfazer» volta um passo atrás; depois de 31 de dezembro, Terminado; a 1 de novembro, uma
  proposta sem resposta, ou uma marca a quem a proposta nunca foi enviada, conta como Não renova),
  o logótipo em vetor (recebido ou em falta), as notas, **Editar**, **Confirmação (PDF)** e **Apagar** (só para um
  registo feito por engano; pergunta antes). Depois de «Renova», o pagamento: «Pagar até 15 jan. 2028» (em aviso nas
  duas últimas semanas), «Renovação de 2028 paga a …» (quando há um patrocínio de 2028 da mesma marca nos mesmos
  espaços) ou «Renovação de 2028 por pagar desde 16 jan. 2028: o espaço fica livre». E a linha da montra, «Montra: 2 de 3 produtos», com o botão **Montra**.
- **Novo patrocínio** na época 2028, também para uma marca que renovou: a tabela de 2028, como para todos (com o
  desconto de pacote, como sempre).
- **Exportar CSV**: `gocarmo-patrocinios-<época>-<data>.csv`, separado por `;`, que o Excel em português abre
  direito, com uma linha por patrocínio (montante, desconto de época, datas, renovação, contacto, NIF, notas). No
  iPhone descarrega para Ficheiros (nunca passa pela folha de partilha, porque leva os contactos e os NIF). É a tua
  cópia de segurança: guarda-a e apaga as antigas até ao fim do prazo dos registos.
- **Confirmação (PDF)**: a «Confirmação de patrocínio» que envias à marca depois do pagamento, feita no telemóvel como
  o comprovativo: marca, espaços e preços, desconto de época e de pacote (só quando o montante é o da tabela), montante
  e data do pagamento, período, prazo do logótipo, preferência na renovação e o seu prazo (à tabela de 2028), o prazo
  do pagamento da renovação (15 de janeiro de 2028) e o link para as condições.
  Em português, ou em inglês se a marca escreveu em inglês (escolhes antes de gerar). A seguir, em anexo, as condições
  na versão do contrato; a janela diz qual, ou que vai sem anexo (ver «Condições do patrocínio nos pedidos e nos PDF»).

## Montra «O meu material»

**O que é.** Uma secção da página inicial, entre Apoiar e Contacto, com os produtos que o Gonçalo usa das marcas que
o patrocinam (decisão de 28.10.2026). Só aparece quando há pelo menos um produto ativo, e só então entra «Material»
no menu; sem produtos, a página fica sem rasto dela. É publicidade e diz-o: o título pequeno da secção é
«Publicidade» (em inglês «Advertising»), uma linha explica que são marcas que o patrocinam ou lhe fornecem o
material, e os links para as lojas abrem noutro separador com `rel="sponsored noopener"`. A comissão de uma marca,
se houver, fica no acordo dela, nunca no site.

**Quem tem montra, e quantos produtos.**

| Nível | Produtos na montra |
|---|---|
| Apoio (abaixo de 150 €) | nenhum |
| Oficial | 1 |
| Principal | até 3 |
| Fato completo (Titular) | até 6, em destaque (cartões maiores, primeiro) |
| Fornecedor oficial (patrocina com produto: fato, nutrição, material) | o número do acordo escrito, de 1 a 6 |

O nível sai dos espaços da marca na época (`levelOf`, em `assets/js/season-rules.js`; com vários patrocínios, o mais
alto). Os números estão em `LIMIT`, em `assets/js/montra-core.js`, e escritos em `/condicoes/` («A montra do site»,
nas duas línguas, com as frases do kit de patrocínio); o `stamp.mjs` compara-os. Nenhuma marca entra sem acordo: o
editor só abre a partir de um patrocínio registado em Patrocínios. A marca dá as fotografias do produto, com direito
a usá-las (ou o produto, para o Gonçalo o fotografar), o link da loja e, se quiser, o código. Só entram produtos que o
Gonçalo usa.

**Pôr os produtos de um parceiro (no telemóvel).**
1. Em `/admin/patrocinios/`, o cartão da marca tem a linha «Montra: N de M produtos». Carrega em **Montra**.
   Uma marca que patrocina com produto: regista-a primeiro em **Novo patrocínio** (pagamento «Em produto»); na
   montra, liga **Fornecedor oficial**, com o dia do acordo e o número de produtos do acordo.
2. **Adicionar produto**: o nome (PT, e EN se for diferente), a fotografia, «Como o uso» em PT e em EN (até 140
   caracteres), o link da loja (só https e um domínio, nunca um endereço IP; os `utm_*` que tiver saem, e por baixo
   aparece o link como vai ficar), o código de desconto e a nota dele (opcionais; com código, a nota é obrigatória),
   «Em destaque» (só no fato completo, e um só produto: marcar outro tira o destaque ao anterior), o início (por
   defeito, o dia do pagamento ou do acordo) e o fim (vazio = até ao fim da época). **Pôr na lista** junta-o à lista
   da marca; ainda não está no site.
3. A fotografia: escolhe-a nas Fotografias do iPhone. O browser endireita-a, põe-na a 4:5 («Mostrar inteira», no
   fundo cor de papel, ou «Encher») e grava WebP de 600 e 1200 px e JPEG de 600 px, sem metadados (nem localização,
   nem data, nem aparelho). O Safari do iPhone não grava WebP: aí fica só JPEG, de 600 e 1200 px, e o site mostra-o
   na mesma. Precisa de pelo menos 600 px no lado menor e de menos de 60 megapíxeis. Para fotografar: fundo liso e
   luz de janela, sem logótipos de outras marcas.
4. **Publicar na montra**. Na primeira vez pede o token do GitHub (o mesmo de `/admin/`, com as mesmas regras e «Lembrar neste
   telemóvel»; ver «Página de admin»). Faz um commit de `data/montra.json` e das fotografias em `assets/img/montra/`
   («Montra: Marca, produto «…» (admin)»). Antes, recusa nomes de exemplo (exemplo, amostra, sample, teste, demo,
   fake, genérico, «Marca X»…), links http, para gocarmo.com ou para um endereço IP, mais produtos do que o nível
   deixa, mais de um em destaque, um código sem nota, datas fora da época e espaços que não estão vendidos a essa
   marca. Se a montra dessa marca mudou entretanto (noutro telemóvel), para e pede para rever; uma falha de rede
   depois do commit nunca grava duas vezes.
5. Depois mostra «A publicar…» e, quando o GitHub Pages publicar (1 a 2 minutos), «No ar», com «Ver no site» e os
   links com a etiqueta, para experimentares um.

**↑ ↓** mudam a ordem. **Editar** muda um produto. **Retirar** tira-o do site (o fim passa a ontem): fica no ficheiro,
para os relatórios, e deixa de contar para o limite. **Apagar** só existe para um produto que ainda não apareceu.

**Quando aparece.** Do dia do início (o do pagamento ou do acordo) até ao fim, ou até 31 de dezembro da época da
marca, o que vier primeiro; depois sai sozinho, sem commit (a página lê as datas). Ordem: o fato completo primeiro
(o produto em destaque à frente), depois Principal, Oficial e fornecedores oficiais. A página lê também
`data/spots.json`: uma marca de Oficial, Principal ou fato completo só aparece enquanto os espaços dela lhe estão
vendidos lá (com menos espaços, só os produtos que o nível novo deixa, pela ordem da lista).

**Quando um patrocínio acaba antes do fim da época** (espaço libertado, patrocínio cancelado ou retirado por
conduta). Os cartões dessa marca saem do site logo que o espaço fica livre em `/admin/` (a página deixa de os mostrar).
Para os tirar também do ficheiro (o contador e os relatórios ficam certos):
1. Ao libertar os espaços em `/admin/`, a página pergunta «Retirar os N produtos de Marca da montra?». **Retirar** faz
   um commit que os retira (fim ontem; um que ainda não apareceu sai do ficheiro).
2. Em Patrocínios, ao apagar o registo de uma marca com produtos no ar, a mesma pergunta abre a montra dela com os
   produtos já retirados na lista: carrega em **Publicar na montra**.
3. Se ficou por fazer, o cartão da marca mostra a vermelho «Montra: N de M, retira K»; em **Montra**, «Retirar os K
   produtos a mais» retira os últimos da lista. Depois, **Publicar na montra**.
Os produtos retirados ficam no ficheiro, escondidos, para os relatórios dos cliques desse período.

**O ficheiro.** `data/montra.json`, publicado vazio: `{ "v": 1, "brands": [] }`. Cada marca tem `id`, `name`,
`season`, `level` (`oficial`, `principal`, `title` ou `fornecedor-oficial`; nunca `fornecedor`, que é o nível Apoio),
`spots` (ou `agreement`, no fornecedor oficial), `max` e `products`. Cada produto tem `id`, `name` e `line` (PT e EN),
`alt` (opcional), `photo` (`base` e `webp`), `url`, `code` e `codeNote` (opcionais), `featured`, `from` e `until`. Os
ids são palavras em minúsculas ligadas por hífens, sem 4 algarismos seguidos (o contador ignora-os). O link publicado
leva `utm_source=gocarmo&utm_medium=montra&utm_campaign=<época>&utm_content=<id do produto>`. Usa sempre o editor:
uma mudança à mão no GitHub salta as verificações (se a fizeres, corre `node scripts/stamp.mjs --check` num clone
antes). Uma marca de exemplo nunca vai para o ficheiro publicado: a pré-visualização com «Marca exemplo» faz-se numa
cópia local do site.

**Os cliques e o relatório.** As estatísticas do site contam, por marca e por produto, os cartões vistos (meio cartão
no ecrã durante 1 segundo, uma vez por visualização), os toques no link da loja e os códigos copiados (eventos
`montra_view`, `montra_shop` e `montra_code`), sem cookies e sem nada de quem clica. Para o relatório da marca:
**Estatísticas → Montra** → o botão do mês → escolhe a **Marca** → **Exportar CSV de Marca** (o ficheiro
`gocarmo-montra-<marca>-<mês>.csv` leva só as linhas dessa marca, com os nomes: `mês; marca; produto; cartões vistos;
cliques na loja; códigos copiados; id da marca; id do produto`, o total da marca por mês e o do período). É esse o
ficheiro que se envia à marca. «Todas as marcas (só para ti)» leva todas, com a coluna «na montra» (sim/não), e nunca
se envia a uma marca. Só contam as linhas de um produto que está em `data/montra.json` com essa marca; as outras (um
produto apagado do ficheiro, ou cliques forjados) aparecem à parte, em «Não reconhecido», fora dos totais e dos CSV das
marcas. Cada marca recebe só os totais dela: por mês a partir do Principal; a meio e no fim da época no Oficial. As
vendas vê-as a marca, na loja, pela etiqueta `utm_content` ou pelo código.

## Documentos (o cofre)

**https://gocarmo.com/admin/documentos/** guarda tudo o que fazemos para o Gonçalo (kit de patrocínio, guiões da
semana, pacotes de posts, folheto, cartão de contacto, mapa do site, manual, questionários), com as últimas 3 versões de
cada documento: a data, o que mudou, o tamanho, e a mais recente marcada «mais recente». O repositório é público, por
isso os ficheiros vão **cifrados** para o ramo órfão `docs` (nunca para o `gh-pages`) e só abrem nesta página, com a
frase-passe. A página tem ligação nas outras páginas de admin («Documentos: o cofre»).

**Como funciona, em curto.** A página cria no browser um par de chaves (ECDH P-256; a chave privada fica fechada com a
frase-passe, PBKDF2-SHA-256 com 1 000 000 de iterações) e guarda no ramo `docs` o `vault.json`: a chave pública e a
chave privada fechada. O computador só conhece a chave pública: cifra cada ficheiro com uma chave nova (AES-256-GCM, em
partes de 8 MiB, cada parte com o seu IV), fecha essa chave com a chave pública e envia tudo num só commit sem
histórico. A lista (títulos, versões, datas, mudanças, tamanhos) também vai cifrada. Nenhum segredo passa pelo chat nem
pelo repositório em claro. Os pormenores estão no início de `assets/js/vault-crypto.js`.

### Criar o cofre (uma vez, no telemóvel)

Abre a página, escreve uma frase-passe de pelo menos 16 caracteres e carrega em «Criar o cofre». O `vault.json` é
público para sempre, e quem o tiver pode tentar frases-passe no computador dele, por isso a página recusa as que se
tentam primeiro: os mesmos caracteres repetidos, quase só palavras do site (gocarmo, Gonçalo, Kona, cofre…) com números,
ou menos de 3 palavras diferentes em menos de 24 caracteres. «Sugerir uma frase-passe» escolhe 5 palavras ao acaso,
neste aparelho, de uma lista de 2048 (cerca de 55 bits); «Mostrar» mostra o que escreveste. Guarda-a logo nas
Palavras-passe do aparelho. A página pede o token do GitHub (o mesmo de Espaços), cria a
chave do cofre neste browser e guarda no ramo `docs` o `vault.json`. Mostra a impressão digital do cofre (8 grupos de 4
caracteres): é ela que o computador pede na primeira publicação.

### Abrir e descarregar

Escreve a frase-passe (num telemóvel antigo, abrir pode levar 2 a 4 segundos: «A abrir o cofre…»). «Lembrar neste
aparelho» guarda neste browser uma chave que não se pode copiar para fora; quem tiver o telemóvel desbloqueado abre o
cofre. «Esquecer» apaga-a (e a de um cofre antigo, se ainda lá estiver; a página também a apaga sozinha quando vê que
o cofre mudou); «Bloquear» fecha o cofre até à próxima vez. No iPhone, o Safari pode apagar a
chave lembrada ao fim de 7 dias sem abrir o gocarmo.com; a frase-passe abre sempre. Apagar os dados do site no browser
também a apaga (e a marca de visitas internas).

«Descarregar» traz o ficheiro aos bocados, decifra-o no telemóvel e depois mostra «Guardar» (no iPhone «Guardar ou
partilhar», e «Guardar em Ficheiros»): dois toques, porque a folha de partilha só abre com um toque novo. Um ficheiro
de cada vez. Se a rede cair a meio (ou o separador for para segundo plano), as partes que já chegaram ficam:
«Continuar (parte 9 de 10)» segue dali; «Fechar» larga-as. Mantém a página aberta até acabar. Ficheiros grandes (perto
de 100 MB) podem ser demais para um telemóvel antigo: divide os zips grandes. Um `.html` ou um `.svg` sai sempre como
ficheiro para guardar, nunca aberto no browser: abrir-se-ia no endereço gocarmo.com, onde estão o token e a chave.

### Publicar no computador

Os documentos entram no cofre a partir do computador, com `scripts/docs-publish.mjs` (Node 22, sem nada a instalar).
O script não consegue abrir nada do que publica.

**Preparar (uma vez).**
1. Cria o cofre na página e anota a impressão digital.
2. Cria a pasta `~/gocarmo-cofre/` (fora do repositório) e copia para lá `scripts/docs-publish.example.json` com o nome
   `docs-publish.json`. Tira a linha `"example": true` e põe os caminhos verdadeiros dos ficheiros. O script recusa o
   exemplo tal como está.
3. No clone do site, para um `git fetch` normal não descarregar os ficheiros cifrados:
   `git config --add remote.origin.fetch '^refs/heads/docs'`.

**A configuração.** `categories` dá as secções da página, por esta ordem (`id` e `title`). Cada documento tem `id`
(minúsculas, algarismos e hífens), `title`, `category`, `file` (o caminho do ficheiro, absoluto ou a partir da pasta da
configuração), `name` (opcional: o nome com que o ficheiro se guarda no telemóvel, com a versão antes da extensão,
`gocarmo-kit-patrocinio-v3.zip`), `version` (por exemplo `v3`), `date` (AAAA-MM-DD; sem ela, o dia da publicação) e
`changes` (1 a 10 linhas: o que mudou). `keep` diz quantas versões ficam por documento (3; de 1 a 5). Um ficheiro pode
ter até 100 MiB.

**Publicar.** Na raiz do clone:
```
node scripts/docs-publish.mjs --dry-run      # mostra o que vai entrar e sair, sem cifrar nem enviar nada
node scripts/docs-publish.mjs
```
Na primeira vez para e mostra a impressão digital do cofre no GitHub. Compara-a com a da página (Documentos → Mais →
Impressão digital do cofre) e, se for a mesma, corre `node scripts/docs-publish.mjs --accept-vault "xxxx xxxx …"`. Das
outras vezes publica logo. Envia com as credenciais normais do git (as de um `git push`, com `--force-with-lease`, só no
ramo `docs`); nunca pede um token.

**Uma versão nova.** Muda o ficheiro, `version` e `changes` na configuração e publica. O mesmo ficheiro com outra
versão, ou um ficheiro diferente com a mesma versão, é recusado (é quase sempre um engano). Ficam as 3 versões mais
recentes de cada documento; a mais antiga sai do cofre e o ramo volta a ter um só commit, por isso não cresce. Um
documento que não mudou não é cifrado outra vez; se nada mudou, não envia nada.

**Tirar um documento.** Tira-o da configuração: fica no cofre, com um aviso. Para o apagar do cofre:
`node scripts/docs-publish.mjs --prune <id>`.

**Onde ficam as coisas.** Ao lado da configuração ficam `docs-publish.state.json` (a memória do que está no cofre:
títulos e mudanças em claro, chaves só fechadas) e `docs-publish.cache.git/` (uma cópia do ramo, só com ficheiros
cifrados). Nenhum pode entrar no repositório: o `.gitignore` tem os três nomes (com `*` no fim, para apanhar também o
ficheiro temporário `docs-publish.state.json.tmp-<n>` que fica se o script parar a meio), e o script recusa-se a correr
se estiverem dentro de um repositório sem estarem ignorados. O commit do ramo diz sempre só «Cofre: publicação»; os
números de documentos e versões aparecem só no teu terminal. Outra pasta: `--config <ficheiro>` ou a variável
`GOCARMO_COFRE`. Ajuda: `node scripts/docs-publish.mjs --help`. Saídas: 0 feito (ou nada a fazer), 1 recusado com a
explicação, 2 erro do git ou de um ficheiro.

**Se o estado se perder** (outro computador, pasta apagada), o script para: não sabe o que está no cofre, porque não o
consegue abrir. Na página, Documentos → Mais → Descarregar o índice, e depois
`node scripts/docs-publish.mjs --accept-vault "…" --state-from ~/Downloads/<índice>.json`; as versões anteriores ficam.
**Depois de usar, apaga o índice** (e tira-o do lixo e da pasta sincronizada, se for o caso): tem os títulos, os nomes
dos ficheiros e as mudanças em claro. O script lembra-o no fim. Sem o índice, `--reset` publica só as versões atuais e
as anteriores perdem-se.

### Mudar a frase-passe e frase-passe perdida

**Mudar a frase-passe:** Mais → Mudar a frase-passe. A chave do cofre fica a mesma: tudo continua a abrir, a chave
lembrada também, e o computador aceita o `vault.json` novo sem perguntar nada (se mudar enquanto publicas, o script lê o
novo e publica com ele). **Mudar a frase-passe não fecha a antiga:** o `vault.json` antigo fica em cópias públicas (o
GitHub guarda-o pelo seu sha, e há clones e forks) e abre com ela. Se alguém pode saber a frase-passe, não chega mudá-la:
cria um cofre novo (Mais → Criar um cofre novo) e publica outra vez, como para uma frase-passe perdida.

**Perdi a frase-passe (ou alguém pode sabê-la).** Ninguém a recupera. A saída é **um cofre novo e publicar outra vez; as versões antigas deixam
de abrir.** Na página, Mais → Criar um cofre novo (escreve CRIAR): cria outra chave. No computador, publica com
`--accept-vault "<impressão digital nova>"`; só entram as versões atuais, as anteriores saem.

Se o script disser que o cofre mudou e não foste tu, não publiques: alguém com acesso ao repositório trocou o
`vault.json`. Muda o token do GitHub e cria o cofre outra vez.

### O que um estranho vê no repositório público

Que há um cofre, a chave pública, a chave privada fechada com a frase-passe (pode tentar adivinhá-la no computador dele,
por isso tem de ser comprida), quantos ficheiros e partes há e o tamanho aproximado de cada um, e quando se publica.
Não vê títulos, nomes de ficheiros, versões, datas dos documentos, mudanças nem o conteúdo (nem quantos documentos há:
o commit diz sempre «Cofre: publicação»). O tamanho de cada ficheiro está em todas as partes dele, cifrado e
autenticado: um manifest com outro tamanho não abre. O que foi publicado fica para sempre em
clones, forks e cópias antigas mesmo depois de sair do ramo: se a frase-passe um dia for descoberta, essas cópias abrem,
e um cofre novo protege só o que vier depois. A integridade depende do acesso de escrita ao GitHub, como as outras
páginas de admin: quem pudesse escrever no repositório podia pôr lá ficheiros ou trocar o `vault.json` (o computador
avisa, porque guarda a impressão digital). O mesmo endereço (gocarmo.com) serve as páginas públicas e o cofre: a
Content-Security-Policy das páginas e a marca de visitas internas (sem Google Analytics no browser do dono) são a
proteção.

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

## Cartão de contacto

Para o Gonçalo ter os contactos no telemóvel e os passar a marcas e parceiros: uma página, um contacto para guardar, um
cartão para a Apple Wallet e uma imagem com o código QR, tudo com a marca GOCARMO.

| Peça | Onde | O que faz |
|---|---|---|
| Página `gocarmo.com/cartao/` | `cartao/index.html`, `assets/css/cartao.css`, `assets/js/cartao.js` | Foto, nome, «Triatleta · Lisboa», **Guardar contacto**, telefone (para ligar com um toque), WhatsApp, email, Instagram, TikTok, site, Strava, a linha do patrocínio e um QR grande para mostrar, com **Partilhar o link**. PT e EN, como as páginas legais. Sem contador de visitas e sem nada de novo no browser (só `gc.lang`, como no resto do site), por isso a página de privacidade não muda. |
| Contacto | `cartao/goncalo-carmo.vcf` | vCard 3.0 (o formato do próprio iPhone) com nome, GOCARMO, Triatleta, telemóvel, email, site, Instagram, TikTok, Strava, a linha do patrocínio e a foto. No iPhone abre «Criar novo contacto»; no Android descarrega e abre nos Contactos. |
| Código QR | `cartao/qr.svg` | Leva a `https://gocarmo.com/cartao/`. Feito aqui, sem nenhum serviço de QR. |
| Cartão da Apple Wallet | fonte em `wallet/cartao/`, feito por **Actions → Wallet pass** | Frente: GO CARMO, época 2027, nome, «Triatleta · Lisboa», a foto, telefone, email, Instagram, IRONMAN Portugal-Cascais 2026 em 9:35:08 e o QR. Verso: telefone e WhatsApp, email, Instagram, TikTok, site, Strava, o patrocínio e o link do cartão. Em português e em inglês, conforme a língua do iPhone. A Action publica-o em `cartao/goncalo-carmo.pkpass` e só então a página mostra **Adicionar à Apple Wallet** (num iPhone, iPad ou Mac; noutros aparelhos a Wallet não abre um `.pkpass`). |
| Imagens para o telemóvel | fora do site | `qr-cartao-iphone.png` (1179 × 2556, para ecrã bloqueado ou para mostrar das Fotografias) e `qr-cartao-quadrado.png` (1080 × 1080, para enviar). Para as fazer outra vez: `node scripts/cartao-images.mjs <pasta>`. |

O botão da Wallet é um botão do site com o texto «Adicionar à Apple Wallet». O selo oficial da Apple só se pode usar
depois de aceitar, com a conta do Apple Developer Program, o «Wallet Marketing Agreement» em
https://developer.apple.com/wallet/add-to-apple-wallet-guidelines/; quem o aceitar pode descarregar o selo lá e pô-lo no
lugar do botão em `cartao/index.html`.

**Pôr o cartão no ecrã principal.** No iPhone, Safari → `gocarmo.com/cartao/` → Partilhar → Adicionar ao ecrã
principal. Fica com o ícone GOCARMO e abre no Safari, onde o contacto e a Wallet funcionam sempre.

**O certificado da Apple (uma vez, uns 20 minutos).** Um iPhone só aceita um cartão da Wallet assinado com um
certificado da Apple; com outro qualquer recusa-o. O site nunca vê o certificado: está só nos secrets do GitHub.
1. Inscreve-te no Apple Developer Program (https://developer.apple.com/programs/enroll/, com uma quota anual de 99 USD
   ou o valor em euros que a Apple indicar), com a conta Apple do Gonçalo. O nome da conta aparece no certificado.
2. Em https://developer.apple.com/account → **Membership details**, copia o **Team ID** (10 letras e números).
3. Em **Certificates, Identifiers & Profiles → Identifiers → +**, escolhe **Pass Type IDs → Continue**. Description:
   `Cartão GOCARMO`; Identifier: `pass.com.gocarmo.cartao`. **Continue → Register**.
4. O pedido de certificado (CSR), de uma destas formas:
   - num Mac: **Acesso a Porta-chaves** → menu **Acesso a Porta-chaves → Assistente de Certificação → Pedir um
     certificado a uma autoridade de certificação**. Email `allez@gocarmo.com`, nome `Gonçalo Carmo`, **Guardado no
     disco**. Fica o ficheiro `CertificateSigningRequest.certSigningRequest`, e a chave fica no Porta-chaves;
   - com o openssl, em qualquer computador:
     `openssl req -new -utf8 -newkey rsa:2048 -nodes -keyout cartao.key -out cartao.csr -subj "/emailAddress=allez@gocarmo.com/CN=Gonçalo Carmo/C=PT"`.
     O `cartao.key` é a chave privada: nunca a envies nem a ponhas no repositório.
5. Em **Certificates → +**, escolhe **Pass Type ID Certificate → Continue**, escolhe `pass.com.gocarmo.cartao`, carrega
   o CSR e descarrega o certificado (`pass.cer`).
6. Junta o certificado e a chave num `.p12` com uma palavra-passe:
   - num Mac: abre o `pass.cer` (entra no Porta-chaves); em **Os meus certificados** está «Pass Type ID:
     pass.com.gocarmo.cartao» com a chave por baixo; escolhe os dois → **Exportar 2 itens** → formato `.p12` →
     escolhe a palavra-passe;
   - com o openssl: `openssl x509 -inform DER -in pass.cer -out pass.pem` e
     `openssl pkcs12 -export -inkey cartao.key -in pass.pem -out cartao.p12 -name "Pass Type ID: pass.com.gocarmo.cartao"`
     (pede a palavra-passe).
7. Passa o `.p12` a texto: num Mac `base64 -i cartao.p12 | pbcopy` (fica copiado), no Linux `base64 -w0 cartao.p12`.
8. No GitHub, **Settings → Secrets and variables → Actions**:
   - separador **Secrets → New repository secret**: `WALLET_P12_BASE64` (o texto do passo 7) e `WALLET_P12_PASSWORD`
     (a palavra-passe do passo 6);
   - separador **Variables → New repository variable**: `WALLET_PASS_TYPE_ID` = `pass.com.gocarmo.cartao` e
     `WALLET_TEAM_ID` = o Team ID do passo 2. (Também servem como secrets, com os mesmos nomes.)
9. **Actions → Wallet pass → Run workflow** (o número de série fica `goncalo-carmo`). Em cerca de um minuto, a action
   descarrega da apple.com o certificado intermédio da Apple (WWDR G4) e a raiz da Apple e confirma-os (se a apple.com
   não responder, usa as cópias em `wallet/`, com as mesmas verificações), faz o cartão, confirma a assinatura
   até à raiz da Apple, guarda-o nos artifacts da corrida e publica `cartao/goncalo-carmo.pkpass` e `cartao/wallet.json`
   no `gh-pages`. Se faltar alguma coisa, a corrida diz em português o que criar e onde. 1 ou 2 minutos depois,
   `gocarmo.com/cartao/` mostra **Adicionar à Apple Wallet**.
10. No iPhone do Gonçalo: Safari → `gocarmo.com/cartao/` → **Adicionar à Apple Wallet** → **Adicionar**. Para mostrar
    o QR a alguém, abre a app Wallet e toca no cartão.

O certificado tem uma data de validade (está em Certificates). Depois dela, para fazer um cartão novo, cria outro
certificado (passos 4 a 8) e troca os dois secrets.

**Fazer o cartão no computador.** Faz o mesmo cartão que a action:
`WALLET_P12_FILE=cartao.p12 WALLET_P12_PASSWORD='…' WALLET_PASS_TYPE_ID=pass.com.gocarmo.cartao WALLET_TEAM_ID=… sh wallet/build-pass.sh goncalo-carmo.pkpass`
e depois `python3 wallet/check-pass.py goncalo-carmo.pkpass`. Precisa só de `openssl`, `zip` e `python3`; o script
não mostra a palavra-passe nem a chave e apaga a pasta temporária onde as pôs.

Para o publicar à mão (sem a action), põe o ficheiro em `cartao/goncalo-carmo.pkpass` no `gh-pages` e muda
`cartao/wallet.json` para `{ "pkpass": "goncalo-carmo.pkpass" }`. A página só mostra **Adicionar à Apple Wallet**
quando o `wallet.json` diz o nome do ficheiro e o ficheiro existe; enquanto diz `{ "pkpass": "" }`, nem pergunta por
ele.

Para experimentar sem a Apple, serve um certificado de teste feito com o openssl, desde que `WALLET_WWDR` aponte para o
certificado que o emitiu (ou para o próprio, se for autoassinado): sem isso, o script recusa-o, porque espera o
intermediário da Apple. Por exemplo, numa pasta temporária:

```
t=$(mktemp -d)
openssl req -x509 -newkey rsa:2048 -nodes -days 30 -keyout "$t/teste.key" -out "$t/teste.pem" -subj "/UID=pass.com.gocarmo.cartao/CN=Pass Type ID: pass.com.gocarmo.cartao/OU=TESTE12345/C=PT"
openssl pkcs12 -export -inkey "$t/teste.key" -in "$t/teste.pem" -out "$t/teste.p12" -passout pass:teste
WALLET_P12_FILE="$t/teste.p12" WALLET_P12_PASSWORD=teste WALLET_WWDR="$t/teste.pem" WALLET_PASS_TYPE_ID=pass.com.gocarmo.cartao WALLET_TEAM_ID=TESTE12345 sh wallet/build-pass.sh "$t/teste.pkpass"
python3 wallet/check-pass.py "$t/teste.pkpass" --ca "$t/teste.pem"
```

O `check-pass.py` confirma o cartão todo, mas um iPhone recusa este cartão: só aceita um assinado com o certificado
da Apple. Nunca publiques um cartão de teste.

**NameDrop e «O meu cartão».** O NameDrop (iPhone com iOS 17 ou mais recente, e Apple Watch) partilha o contacto que o
iPhone tem como «O meu cartão», não esta página. Para ser o do cartão:
1. No iPhone do Gonçalo, Safari → `gocarmo.com/cartao/` → **Guardar contacto** → **Criar novo contacto** (ou
   **Adicionar a contacto existente**, se já tiver o dele nos Contactos).
2. **Definições → Contactos → Os meus dados** (no iOS 18 e seguintes: **Definições → Apps → Contactos → Os meus dados**)
   e escolhe «Gonçalo Carmo».
3. Em **Contactos**, toca no cartão do topo («O meu cartão») → **Foto e poster do contacto** para escolher a foto e o
   nome que os outros veem.
4. Para trocar contactos: os dois iPhones desbloqueados, topo com topo, até aparecer o NameDrop; **Partilhar** envia o
   dele e recebe o da outra pessoa, **Receber só** recebe. Com um Android, mostra o QR (Wallet, ecrã bloqueado ou a
   página) ou envia o link.

**Mudar o cartão mais tarde.**
- Os contactos vêm de `assets/js/data.js` (`SITE`). Se mudarem, muda também o texto de `cartao/index.html` (PT e EN) e
  `wallet/cartao/pass.json`, corre `python3 scripts/cartao.py` (vCard, QR, fotos e traduções da Wallet; precisa de
  `pip install pillow segno`) e, se mudaste o CSS ou o JS, `node scripts/stamp.mjs`. `python3 scripts/cartao.py --check`
  diz se ficou alguma coisa por fazer.
- Logótipo e ícone da Wallet: `node scripts/cartao-images.mjs` (a partir de `wallet/marca/`).
- Depois de publicar a mudança no `gh-pages`, corre **Actions → Wallet pass** outra vez. Com o mesmo número de série
  (`goncalo-carmo`), o cartão novo substitui o que está na Wallet quando o Gonçalo o abrir no iPhone; com um número
  novo, a Wallet fica com dois cartões.
- Este cartão não tem serviço de atualização (`webServiceURL`), por isso não muda sozinho em nenhum telemóvel: depois
  da action, o Gonçalo abre `gocarmo.com/cartao/` e toca outra vez em **Adicionar à Apple Wallet**. Quem recebeu o
  cartão antes fica com a versão antiga.
- O `.pkpass` é público (só tem os contactos que já estão no site e o certificado público). O `.p12`, a chave e a
  palavra-passe nunca vão para o repositório.

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

## Estatísticas do site

Uma ferramenta nossa conta as visitas, sem cookies, e mostra-as em **https://gocarmo.com/admin/analytics/** (entra
com a `ADMIN_KEY`, a mesma palavra-passe dos Pedidos; a página de admin tem a ligação «Estatísticas do site»). Não é o
Google Analytics: não precisa de aviso de cookies nem de autorização, porque fica dentro de regras apertadas (mais
abaixo). Enquanto `SITE.stats.url` estiver vazio, o site não mede nada e o painel diz que ainda não está ligado.

**O que mede e onde se vê** (um separador por tema, no telemóvel ou no computador):

| Separador | O que mostra |
|---|---|
| Resumo | visualizações, visitas, visitantes por dia, tempo ativo, saídas rápidas, quantos chegam ao patrocínio, pedidos enviados, páginas com erro; «Percebe-se?» (cliques sem resposta, cliques repetidos, toques no 3D que falham, pedidos travados pela marca ou pelo logótipo, o botão menos carregado); «Agora no site» (atualiza a cada 30 s) |
| Público | onde estão (mapa de Portugal e do mundo, até à cidade), de onde vêm (canal, site, dentro de que app, ligações diretas como `/#fato/peito`), aparelho, largura do ecrã, toque ou rato, sistema, navegador, língua, quem muda de língua, hora e dia da semana |
| Página | até que secção chegam, onde passam tempo, onde fecham a página, como chegam ao patrocínio e quanto tempo levam, até onde descem, os botões vistos e carregados, o menu |
| Mapas de calor | a página verdadeira, à largura do telemóvel, do tablet, do computador ou de um ecrã largo, com os cliques por cima; também só os cliques sem resposta, os repetidos, os que deram erro, até onde descem e onde passam tempo. Só aparece com 5 ou mais visualizações nessa largura. Escolher uma linha da tabela marca o elemento na página |
| Estúdio 3D | do estúdio ao pacote (chegaram perto, viram, o 3D abriu, mexeram, escolheram, juntaram), gestos, toques falhados, espera pelo 3D, visita guiada, interesse por espaço (com o preço) |
| Reservas | o funil do pedido (viu o patrocínio → escolheu → juntou → abriu → enviou → copiou o pagamento → «Feito»), onde desistem, canal do pedido, forma de pagamento, pacotes, fato completo, experimentar o logótipo, partilhas |
| Contactos | ligações para fora (WhatsApp, email, Instagram, Strava, GoFundMe…) e em que secção estavam, Apoiar, media kit |
| Montra | os cliques na loja, os cartões vistos e os códigos copiados, por marca, produto e mês, com um botão por mês e o CSV de uma marca (para o relatório mensal dela); à parte, o que não é de um produto do ficheiro; vazio enquanto a montra não tiver produtos |
| Qualidade | velocidade (LCP, INP, CLS…), o que atrasa, arranque e falhas do 3D, ficheiros que não carregaram, erros de JavaScript |
| Opinião | a pergunta rápida «Percebeste como funciona o patrocínio?» (Sim/Não e o que não ficou claro), por língua, largura e secção |
| Dados | diagnóstico dos últimos 14 dias (para perceber um zero; mais abaixo), limites gratuitos do Cloudflare, pedidos recusados, resumos diários, anotações no gráfico (uma publicação, uma prova), CSV para o Excel |

Períodos: 24 h (só no «Resumo», em totais), 7, 30 ou 90 dias (dias completos, até ontem) ou datas à escolha, com a
comparação com o período anterior (só quando o contador já tinha dados nesse período) e um filtro por aparelho. As tuas visitas não contam: entrar no painel marca o browser como interno
(`gc.internal`, também posto ao abrir `/admin/`); em janelas privadas ou noutros browsers, entra no painel uma vez.

**Ligar (uma vez, uns 5 minutos).**
1. GitHub → **Actions → Deploy stats → Run workflow**. Depois disso corre sozinha em cada push para `gh-pages` que
   mude `stats-worker/`. Usa os secrets que já existem (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `ADMIN_KEY`)
   e tira-lhes os espaços e as quebras de linha que tenham ficado colados. Cria sozinha, só no Cloudflare, a chave
   `SALT_SECRET` (não vai para o GitHub). Tudo no plano gratuito, partilhado com o Worker dos Pedidos.
2. No fim, o resumo da action mostra o endereço, `https://gocarmo-api.rgvduarte.workers.dev`, e o estado
   (`/health`). Se o estado disser `store: false`, vê «Problemas» em `stats-worker/README.md` antes de haver dados.
3. Cola esse endereço em `assets/js/data.js`:
   `stats: { url: 'https://gocarmo-api.rgvduarte.workers.dev', mode: 'exempt', campaigns: [] },`
   e corre `node scripts/stamp.mjs` (deixa `/admin/` e `/admin/analytics/` falarem com o Worker). Faz commit e push.
4. Abre `/admin/analytics/` e entra com a `ADMIN_KEY`. As primeiras visitas aparecem logo em «Agora no site» e, no
   «Resumo», no período «24 h» (só totais); os outros separadores mostram dias completos, a partir do dia seguinte.

`mode: 'consent'` passa a contar só depois de «Aceitar» no aviso de cookies (fica pronto para o caso de a CNPD
mudar de posição); `mode: 'off'` desliga sem apagar o endereço.

**Privacidade (o essencial; a página `/privacidade/` explica-o ao visitante).**
- Sem cookies e sem identificador no aparelho. O endereço IP e o navegador completo nunca são guardados. Para contar
  visitantes por dia, o Worker junta o IP (num IPv6, só a primeira metade), o navegador e uma chave que muda todos os
  dias e fica só com um código; a chave e os códigos apagam-se à meia-noite de Lisboa. Não se seguem pessoas de um dia
  para o outro.
- Nunca lê o que se escreve nos campos do pedido nem o logótipo. De um clique guarda o elemento e o seu nome curto;
  de uma ligação para fora, só o tipo ou o nome do site (a mensagem do pedido vai no endereço do WhatsApp). A hora fica
  sem minutos. As mensagens de erro só ficam quando vêm de um ficheiro do site, sem endereços, números nem emails.
- Na montra, só os ids públicos da marca e do produto (os de `data/montra.json`), nunca o código nem o link inteiro.
  Cada marca recebe só os totais dela, por mês; nunca de onde vieram, onde estão ou que aparelho usam.
- Às marcas que patrocinam pode ir um relatório com os totais do site (visitas, visualizações, visitantes por dia em
  média, tipos de origem, países e cidades com as pequenas juntas, aparelhos, tempo e até onde se lê) e os cliques
  delas por mês (link, montra). Nunca o funil dos pedidos, nunca menos do que um mês nos cliques de uma marca
  (ver «Relatório PDF para marcas», em baixo, e o `[CONFIRMAR]` de `privacidade/index.html`).
- 30 dias de registos de cada visita; depois só totais por dia, durante 25 meses; depois totais por mês, sem cidades.
- Quem tem Global Privacy Control ou Do Not Track ligado não é contado, nem quem carrega em «Não contar as minhas
  visitas» na página de privacidade (`gc.optout`, só nesse browser). A pergunta rápida também não lhes aparece.
- Cidades, regiões e sites com menos de 3 visitantes-dia aparecem juntos; o mapa de calor só com 5 visualizações; o
  funil do pedido só em totais, nunca por origem, local ou aparelho. Um período com o dia de hoje (como «24 h») só
  mostra totais no «Resumo»: de onde vêm, países e o funil só com dias completos, para que duas leituras com minutos
  de diferença não liguem uma visita ao sítio de onde veio.
- Os dados ficam no Cloudflare, na UE (`STORE_JURISDICTION = "eu"` em `stats-worker/wrangler.toml`), sem registos de
  pedidos. Se algum dia esse valor tiver de ficar vazio, muda também a frase da página de privacidade (comentário
  `[CONFIRMAR]` no início de `privacidade/index.html`).
- **Regras para quem vê os números:** nunca os cruzar com os pedidos (nem com a lista «Pedidos» do admin), mensagens
  ou emails, nem os usar para descobrir quem é alguém. Servem só para melhorar o site. Medir uma coisa nova (um campo,
  um evento, um gráfico) obriga a rever a página de privacidade antes.
- Com o Google Analytics ligado, as duas ferramentas não se misturam: o GA só depois de «Aceitar»; as estatísticas
  próprias continuam sem cookies, e o aviso de cookies diz numa frase que já há uma contagem própria. Dentro do mapa de
  calor (a página num iframe) não corre nenhuma das duas.

**Relatório PDF para marcas.** Em `/admin/analytics/`, debaixo dos filtros, o botão **Relatório PDF** faz um PDF para
mostrar a uma marca. Escolhes:
- **Período**: este mês (do dia 1 até ontem), mês passado, a época 2027 até hoje (de 1 de janeiro até ontem, depois de
  a época começar) ou outro (de/até, dias completos até ontem, até 25 meses para trás). O relatório nunca tem o dia de
  hoje. Se o período começar antes do primeiro dia com dados, o PDF começa nesse dia (e diz porquê): as médias dividem
  só pelos dias com dados. Um mês cortado pelo período aparece com os dias («1 a 14 de março de 2027»).
- **Marca** (opcional): só o site, ou uma marca com espaços vendidos nesta época (`data/spots.json`) ou com produtos na
  montra (`data/montra.json`).
- **Língua**: português ou inglês.

«Fazer o PDF» junta os números (as visitas internas ficam sempre de fora, todos os aparelhos) e faz o ficheiro neste
aparelho; depois «Guardar o PDF» (no telemóvel, «Guardar ou partilhar»). Nome: `gocarmo-relatorio-<de>_<até>[-<marca>].pdf`
(EN `gocarmo-report-…`).

O que tem: visitas, visualizações, visitantes por dia (média), tempo ativo (mediana) e a evolução; de onde chegam as
visitas (tipos de origem, sites, países e aparelhos em visitas; cidades em visualizações, com o nome em português no PDF
em português; países, cidades e sites com menos de 3 visitantes no período juntos); o que fazem no site (tempo ativo,
até onde descem, quantas visualizações chegam ao capítulo do patrocínio, o estúdio 3D); com uma marca, os espaços dela,
os cliques no link dela por mês (o nome da marca na lista «Já no fato» / «Já no capacete» é um link) e a montra por mês
e por produto; no fim, «Como contamos». Cada bloco diz a unidade no título («Países (visitas)», «Cidades
(visualizações)»). Sem comparação com o período anterior, «Por tipo de origem» passa para a primeira página. **Nunca tem o funil dos pedidos, nem «pessoas», «alcance» ou «únicos»**: o contador não usa cookies e o
código de cada visitante muda todos os dias, por isso conta visitas, visualizações e visitantes por dia, nunca pessoas
num mês. Um teste verifica estas palavras no texto do PDF. A página de privacidade (PT e EN) diz que os totais do site
podem ser mostrados às marcas que patrocinam; publica-a antes de enviar o primeiro relatório.

Os cliques no link contam-se pelo endereço do link da marca (e subdomínios), com `GET /admin/v1/sponsors`. Uma marca
cujo link é do Instagram (ou de outra rede) não tem cliques próprios: os cliques nessa rede juntam-se aos de outras
marcas, e o diálogo e o PDF dizem-no; uma marca vendida sem link não tem cliques, e o diálogo diz isso. Os cliques por
mês precisam da versão nova do contador; até publicares, o PDF sai sem esse bloco e o diálogo explica porquê. No
telemóvel, o estado («A juntar os números (2 de 6)», «PDF pronto», um erro) fica por cima dos botões, e o botão mostra o
passo.

**Quando um número parece errado (zero, ou baixo demais).** O separador «Dados» começa com o cartão **Diagnóstico:
últimos 14 dias**, por dia de Lisboa: quantos sinais chegaram ao contador, quantos guardou, quantos recusou e porquê
(«5 de robôs», «2 de outros sites»), os que não guardou por causa de um limite, as visitas de fora e as tuas, e se o dia
já foi resumido («resumido», «por resumir: esta noite às 00:20» só para ontem antes do resumo, «atrasado: o resumo da
noite não correu» para um dia que já devia estar resumido, «a refazer esta noite: chegaram dados depois do resumo»).
No telemóvel aparecem hoje, ontem e os dias fora do normal; os outros ficam em «Ver os outros dias». Por baixo, uma
«Leitura» numa frase: nada chega ao contador desde ontem (vê `SITE.stats.url` e o modo), tudo é recusado (e porquê), o
limite gratuito do dia acabou, sinais do mesmo sítio passaram o limite por endereço e não ficaram guardados, o resumo
da noite não correu (o painel conta esses dias a partir dos registos de cada visita, que se apagam ao fim de 30 dias),
um dia só teve visitas tuas, ou «Tudo normal» (só quando nenhum dia perdeu nada). Os dias antes de o contador novo
começar a contar mostram «sem contagem», nunca 0; o primeiro dia contado diz «contagem desde a publicação», porque os
contadores começam a meio do dia. Os recusados são um mínimo: chegam ao contador com o sinal seguinte do mesmo
servidor, por isso podem aparecer mais tarde ou faltar alguns. Quem tem Global Privacy Control, Do Not Track ou «Não
contar» ligado não envia nada, por isso não aparece. Os outros gráficos de «Dados» (limites, recusados) contam dias UTC,
como o Cloudflare.

Nos períodos de 7, 30 e 90 dias (e num período à escolha que acabe ontem), que vão sempre até ontem, há uma linha
debaixo das datas: «Hoje até agora (às 14:32): 12 visitas, 37 visualizações.» (com «Mostrar visitas internas»
desligado e visitas tuas hoje: «… (mais 3 visitas tuas, escondidas).») e, desligado, «Visitas no período: 0 públicas ·
12 tuas (as tuas estão escondidas).» (ligado: «Inclui 12 visitas tuas.»). Num período à escolha que acabou antes de
ontem fica só a parte das visitas tuas: os painéis vão até ao último dia dele.
Atualiza a cada minuto enquanto o «Resumo» está aberto. Antes de publicares a versão nova do contador
(`GET /admin/v1/diag`), o cartão diz que precisa dela e a linha não aparece; o resto do painel funciona na mesma.

Como funciona por dentro, os limites gratuitos, testar no computador e problemas: `stats-worker/README.md`.

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

O script põe no endereço de cada ficheiro uma versão calculada a partir do conteúdo (`main.js?v=…`), no mapa de importação de `index.html`, de `admin/index.html`, de `admin/analytics/index.html`, de `admin/patrocinios/index.html`, de `privacidade/index.html`, de `condicoes/index.html` e de `cartao/index.html` e no script de `admin/strava/index.html`. Assim, um browser que ainda guarde ficheiros da versão anterior (o GitHub Pages deixa-os em cache 10 minutos) nunca mistura ficheiros novos com antigos. Se mesmo assim a página não arrancar, ela própria recarrega uma vez com tudo fresco antes de mostrar a versão sem JavaScript.

Numa página com Content-Security-Policy (as do admin e `/cartao/`), o script recalcula também o sha256 de cada script inline, o mapa de importação, no `script-src`. Sem isso o browser ignora o mapa novo. No `connect-src` põe os endereços dos Workers: o dos Pedidos (`SITE.requestsApi`) em `/admin/` e `/admin/patrocinios/`, e o das estatísticas (`SITE.stats.url`) em `/admin/` e `/admin/analytics/`; um endereço vazio sai da lista. Em `/admin/patrocinios/` põe também `https://api.github.com` e `https://gocarmo.com`: a montra grava pelo GitHub e depois espera pelo site no ar.

A página do cofre (`/admin/documentos/`) recebe o mesmo mapa de importação, os mesmos hashes e a mesma CSP, e no
`connect-src` só `'self'`, `https://api.github.com` (o ramo `docs` e os dois commits da página) e
`https://raw.githubusercontent.com` (os ficheiros cifrados, com pedidos simples, sem cabeçalhos).

O script verifica também a época: o bloco `seasonRules` de `data/spots.json` (datas reais e por ordem), a data das
condições (a mesma em `/condicoes/` nas duas línguas, em `cl.terms` e em `seasonRules.termsDate`; a linha `msg.terms`
sai dela), o texto das condições para o anexo dos PDF (escreve `assets/js/terms-text.js` e guarda a versão anterior em
`data/terms/`, ver «Condições do patrocínio nos pedidos e nos PDF»), as datas da época escritas em
cada língua de `/condicoes/` (também `racesUntil` e `renewPayBy`) e a tabela do desconto de época dessa página, mês a
mês, contra `season-rules.js`; que nenhum cartão de nível fala de um preço na renovação e que as condições não dão o
preço da época a quem renova (todos renovam à tabela de 2028), e que só «Todos os espaços» fala da preferência; que
`data/montra.json` está certo (`checkMontra`: forma, ids de produto que começam pelo da marca, links https para um
domínio, nenhuma marca, produto, nota ou loja de exemplo, um só produto em destaque, limites por nível, espaços
vendidos à marca, nenhuma marca de espaços de outra época com produtos por mostrar) e que as
fotografias que ele nomeia existem; que os números de produtos por nível em `/condicoes/` são os de `LIMIT`; e que
`index.html` não tem nada da montra escrito (a secção é só JavaScript). Se algo não bater, para (também com
`--check`) e diz o quê.

O mesmo script escreve em `index.html` os cartões de «Todas as provas» a partir de `RESULTS` (`assets/js/data.js`), com o mesmo código que os desenha na página (`assets/js/races.js`): são eles que aparecem sem JavaScript e no media kit impresso. Pára com uma lista do que falta se uma prova não tiver o que os cartões precisam (um triatlo sem `splits` ou `ag`, uma corrida sem `pace`). `node scripts/stamp.mjs --check` não muda nada e falha se alguma página estiver desatualizada.

Depois, com o servidor local ligado, `node scripts/results-check.mjs` (precisa do Playwright) confirma num browser a 1440, 390 e 320 px que os cartões escritos em `index.html` e os desenhados pelo JavaScript têm a mesma altura, que os filtros não mexem na página e que sem JavaScript aparecem todas as provas.

O worker que constrói a malha do fato não lê o mapa de importação, por isso o script também põe a versão nos imports dele (`suit-worker.js` → `suit-mesh.js?v=…` → `suit-body.js?v=…`).

## Quando o 3D não aparece num telemóvel

O estúdio tenta várias vezes antes de desistir: se o iPhone tira o contexto WebGL à página (pouca memória, ou ao voltar do WhatsApp), espera que volte e, se não voltar em 1,5 s de página visível, cria outro e passa o fato e o capacete para ele (no máximo duas vezes por visita). Se o primeiro arranque falhar, tenta outra vez com outra configuração da GPU e depois numa versão mais leve. Só então mostra a imagem do modelo com uma frase que diz porquê, o botão «Tentar outra vez» (não aparece quando a página não o pode resolver, como no Modo de isolamento) e um código pequeno (por exemplo `ctx-dead`). Se o browser devolver o contexto mais tarde, o 3D volta sozinho.

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
