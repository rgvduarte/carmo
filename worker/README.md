# Pedidos e contratos (Cloudflare Worker)

Recebe as compras feitas no site, guarda os espaços enquanto o Gonçalo espera pelo pagamento e, depois de pago, guarda
o registo de cada patrocínio (o contrato), que a página de admin **Patrocínios** mostra. Guarda também os nomes do
símbolo «Quem apoia» (ver **Apoiantes**).

## O que faz

1. A marca escolhe os espaços no site, escreve a empresa ou marca, o nome, o email e o telefone de quem pede e envia o
   logótipo (tudo obrigatório; o logótipo em PNG) e, se quiser, o link da marca (o site, o Instagram ou a página de
   contacto, que fica no logótipo no site depois do pagamento). O site manda o pedido
   para este Worker (`POST /pedido`).
2. O Worker confirma que os espaços existem e estão livres, e reserva-os por 48 horas no `data/spots.json` do branch
   `gh-pages` (um commit, como `Espaço 21 reservado para Marca até 2026-10-25 (pedido TM2K4Q7XFA)`). O site mostra-os
   reservados em 1 a 2 minutos. Se ninguém fizer nada, a reserva acaba sozinha no fim do último dia.
3. O Worker guarda o pedido (marca, link da marca, nome, email, telefone, NIF, mensagem, forma de pagamento, total, os preços e os nomes dos espaços
   nesse dia) e o logótipo, e responde ao site com o número do pedido, o último dia da reserva, o total, o mês da época
   (`m`, 0 até 31 de janeiro, depois o número do mês: março é 3) e o desconto de época em centésimas de ponto
   percentual (`seasonBp`, 625 é 6,25%). O total é o do site, ao euro: as duas partes usam a mesma conta,
   em `assets/js/season-rules.js` (ver **Épocas e preço**). O site diz à marca que tem 48 horas para enviar o
   comprovativo.
4. Na página de admin, em **Pedidos**, o Gonçalo vê cada pedido com o logótipo e o tempo que falta:
   - **Confirmar compra**: abre a venda com a marca, o link e o logótipo do pedido. Ao guardar, o espaço fica vendido no
     site com esse logótipo e esse link (com o token do GitHub da página de admin, como uma venda à mão: este Worker
     nunca escreve um link no `data/spots.json`; um espaço reservado não leva link) e o pedido fica confirmado, com a
     data do pagamento e o montante recebido. Nesse momento o Worker cria o contrato do patrocínio (ver **Contratos**),
     com o link que a venda levou (`url` do `confirmar`; sem ele, o link do pedido).
     O pagamento recebe um recibo de donativo, nunca uma fatura.
   - **Prolongar 48 h**: a reserva dura mais dois dias.
   - **Cancelar**: os espaços que ainda estão reservados por este pedido voltam a ficar livres. Num pedido falso,
     marca «bloquear quem o fez durante 30 dias».
   - **Eliminar** (um pedido confirmado ou cancelado, nos Pedidos e no «Agora» de Patrocínios): o pedido e o logótipo
     saem do KV. Só quando nenhum contrato o refere (o `c:<id>` do próprio pedido, ou um contrato à mão com
     `request: <id>`); um pedido aberto cancela-se primeiro. A pausa de 7 dias de um pedido cancelado continua: fica
     num `x:<código>` até ao fim dela (um endereço já bloqueado fica como estava).

### O parceiro de prova (desde 03.11.2026)

O fato completo numa prova pede-se como os espaços, com outro corpo: `{ race: "<id>", helmet: true | false, sector, … }`
(sem `items` nem `title`). As provas, o preço (3 000 €) e o capacete (+500 €) estão no bloco `racePartner` do
`data/spots.json`; as regras em `assets/js/season-rules.js` (`raceOpen`, `RACE_LEAD_DAYS`).

- O Worker reserva a prova 48 horas, como um espaço, e escreve só o bloco `racePartner` (`status`, `race`, `helmet`,
  `until`, `request`, por esta ordem). **Nunca escreve a marca enquanto a prova está reservada**, nem no ficheiro nem
  na mensagem do commit (`Parceiro de prova (Lidl Setúbal Triathlon, com capacete) reservado até 2026-11-05 (pedido
  TQ0X12ABCD)`): o ficheiro e o histórico do repositório são públicos, e as condições prometem oferecer a prova ao title
  partner e às marcas Principais sem dizer quem é a outra empresa. A marca fica só no pedido, no KV. Aparece com a venda,
  feita na página de admin.
- Um só parceiro de prova por época: com uma prova reservada (sem ter acabado) ou vendida, outro pedido recebe
  `409 ocupado { ids: ["prova"] }`. Não depende dos espaços nem do fato completo da época.
- Não conta para os 8 espaços de `MAX_HELD` (não reserva espaços); é o pedido aberto desse endereço, como os outros.
- Pede-se até 6 semanas antes da prova (dia da prova − 42, data de Lisboa); uma prova só com o mês conta do dia 1.
  Depois: `409 prova-prazo { race, bookBy }`.
- Uma prova sob proposta (`proposal`, o Japão) ou só por mensagem (`ask`) não se reserva no site:
  `400 prova-contacto`. Uma prova que não existe, ou um ficheiro sem o bloco: `400 prova`.
- O setor da marca é obrigatório (`sector`, até 60 caracteres; senão `400 setor`) e fica no pedido e no contrato. Paga-se
  só por transferência (`pay: "tr"`; senão `400 pagamento`).
- O preço é por prova, sem desconto de época nem de pacote (`m: 0`): 3 000 € ou 3 500 €.
- O pedido guarda `race: { id, date, name, helmet }` (o nome em português nesse dia), `sector`, `level: "prova"` e os
  preços (`prices`: `prova` e, com o capacete, `prova-capacete`). Prolongar, Cancelar e Confirmar funcionam como nos
  espaços; Cancelar tira também `race` e `helmet`.

## Épocas e preço

O Worker lê as datas da época no bloco `seasonRules` do `data/spots.json` (o mesmo ficheiro dos preços, lido do GitHub
em cada pedido), com as regras de `assets/js/season-rules.js`:

- A época é o ano civil: a época 2027 vai de 1 de janeiro a 31 de dezembro de 2027.
- Um pedido feito até `fullPriceUntil` (31 de janeiro de 2027, e todo o ano de 2026) paga o preço da tabela. A partir
  de 1 de fevereiro de 2027, quem entra a meio da época tem um desconto de época: um quarto da parte da época que já
  passou, contando o mês do pedido (na data de Lisboa) como passado. Com `m` = o número do mês do pedido (fevereiro 2,
  março 3 … outubro 10), o desconto é m/48 do preço: fevereiro 4,17%, março 6,25%, junho 12,5%, outubro 20,83%. Nunca
  chega a 25%, porque os pedidos fecham em outubro.
- A conta é: primeiro o desconto de época, depois o desconto de pacote (3 ou mais espaços, 10%, nunca no fato
  completo), e no fim um só arredondamento ao euro (meio euro para cima), tudo em inteiros:
  `total = arredonda(bruto × (48 − m) × (100 − desconto) / 4800)`. Um espaço de 600 € fica em 575 € em fevereiro,
  563 € em março e 475 € em outubro; o Peito, as Costas (topo) e uma Clavícula (1 100 €) em março ficam em 928 €.
- O preço é o do dia do pedido, e fica com o pedido enquanto a reserva durar (também depois de **Prolongar**).
- Depois de `requestsUntil` (31 de outubro de 2027), o Worker recusa pedidos para a época (`409 epoca`) até a época
  mudar no `data/spots.json`. O Worker não precisa de ser publicado outra vez para isso: lê o ficheiro em cada pedido.

Se o bloco `seasonRules` faltar ou estiver errado, valem as datas por defeito da época (as mesmas de cima para 2027).

## Contratos

Um contrato é o registo de um patrocínio pago: marca, espaços (nome e preço), montante pago e data, época e período
(1 de janeiro a 31 de dezembro), prazo do logótipo, datas da renovação (propostas a partir de 1 de setembro, resposta
até 31 de outubro, espaços livres a partir de 1 de novembro), estado da renovação, contacto (nome, canal, email,
telefone e, se os houver, conta), NIF se foi dado, notas, histórico e o número do pedido. Fica no KV do Worker, nunca
num ficheiro público, com a chave `c:<id>`:

- **Pedido do site**: **Confirmar** cria-o com o número do próprio pedido, uma só vez (repetir não cria outro). Um pedido
  confirmado antes de haver contratos ganha o seu com o mesmo botão.
- **À mão**: em **Patrocínios**, para o que foi combinado por email, WhatsApp ou em produto. Tem um número novo.
- **Parceiro de prova**: o contrato leva `race: { id, date, name, helmet, sector, logoBy, notice }` (o logótipo em vetor
  até `logoBy`, 5 semanas antes da prova; `notice`, o dia em que os patrocinadores da época foram avisados),
  `level: "prova"` e `title: false`. Não renova (`renovacao` dá `campos state`) e nunca passa a contrato de espaços, nem
  o contrário (`campos race`). À mão, o Japão (sob proposta) fica com `price: null` e o montante combinado.

Cada contrato apaga-se sozinho no fim de 31 de dezembro do ano seguinte ao da época (os da época 2027 a 31 de dezembro
de 2028). Se precisares de uma cópia, exporta o CSV em **Patrocínios**; apaga as exportações até à mesma data (a página
privacidade/ promete isso). Não guarda o código do endereço de internet nem o logótipo. Confirmar gasta 2 escritas no KV
(o contrato e o pedido); cada mudança num contrato, 1.

## Apoiantes («Quem apoia», desde 02.11.2026)

Os nomes do símbolo «Quem apoia», na secção Apoiar do site. Decisão do dono: entram todos os nomes da lista do
GoFundMe que não sejam anónimos, na forma curta «Nome I.»; nunca o valor, a data ou a ordem dos donativos. Os nomes
ficam aqui, no KV, **nunca no GitHub**.

- **Uma chave por época**: `apo:2027`, um só documento `{ v: 1, season, names: [{ id, name, state }] }`, com
  `state` `"espera"` (ainda não está no site) ou `"publicado"`. Nada mais sobre a pessoa: nem valor, nem data, nem email.
  Apaga-se sozinho no fim de 31 de dezembro do ano seguinte ao da época (`contractExpiry`, o mesmo prazo dos contratos:
  os de 2027 a 31 de dezembro de 2028). A época vem de `SEASON` em `assets/js/apoiantes-core.js` (muda-a para a época
  seguinte; a chave antiga expira sozinha).
- **Públicos** (sem chave, `Cache-Control: public, max-age=300`, `X-Robots-Tag: noindex, nofollow`, CORS só para o site):
  `GET /apoiantes` → `{ v: 1, on }` (`on`: há pelo menos um nome publicado; sem contagem nem nomes), que o site pede
  quando a secção Apoiar se aproxima do ecrã; `GET /apoiantes/nomes` → `{ v: 1, names: [{ id, name }] }`, só os
  publicados, de A a Z (ordem portuguesa), que o site só pede depois do toque em «Vê quem apoiou». Sem nomes publicados
  (ou com o Worker em baixo), o site não mostra nada.
- **Admin** (a `ADMIN_KEY`, a mesma origem e o mesmo limite de rajadas de `/pedidos`): `GET /apoiantes/admin` (todos,
  com o estado, `max`, `expira` e `on`) e `POST /apoiantes/admin` com
  `{ action: "importar", names: [..], publicar?: true }` (a lista do Painel; por defeito publicados),
  `{ action: "adicionar", name, publicar?: false }` (um nome; por defeito à espera),
  `{ action: "publicar" }` (todos os que estão à espera) ou `{ action: "retirar", id }` (apaga já, sem rasto).
  Cada nome é visto aqui outra vez (`nameProblem`): 2 a 40 caracteres, só letras, espaços, apóstrofo, hífen e ponto
  (sem algarismos, @ ou links); «Ana M.» serve, um nome completo também (só a importação do Painel o encurta). Um nome
  igual a outro (sem contar acentos nem maiúsculas) não entra duas vezes. Até 2 000 nomes (`muitos`, 409). Erros:
  `acao`, `campos` (com `campo`), `nome` (400, com `motivo`), `existe` (409, com `id`), `nada` (404), `muitos`,
  `json`, `tamanho` (413), mais os de todas as chamadas de admin. Cada mudança é 1 escrita no KV; uma importação
  repetida não escreve nada.
- O documento é lido, mudado e escrito: duas mudanças no mesmo segundo (dois separadores) podem perder uma. A
  importação pode repetir-se sem estragar nada. Retirar um nome tira-o já do KV; o site deixa de o mostrar em até
  5 minutos (cache do browser) e a cópia do KV na borda do Cloudflare em até 60 s.

Exemplos (só leitura; troca `<conta>`):

```sh
curl -s https://gocarmo-pedidos.<conta>.workers.dev/apoiantes
curl -s -H "Authorization: Bearer $ADMIN_KEY" https://gocarmo-pedidos.<conta>.workers.dev/apoiantes/admin
```

## Limites contra abusos

- Até 6 espaços por pedido. Mais do que isso, só o fato completo.
- No máximo 8 espaços reservados ao mesmo tempo por pedidos do site ainda por pagar (`MAX_HELD` em `wrangler.toml`).
  O fato completo conta como os 8: só se pede pelo site quando não há outros pedidos do site por pagar. Esta conta é
  feita no próprio `data/spots.json`, na escrita, por isso nem pedidos em paralelo a passam. Os espaços que reservas
  ou vendes à mão não contam. Uma reserva de parceiro de prova não conta (não reserva espaços), mas só há uma de cada
  vez.
- Por endereço de internet (num endereço IPv6, os seus /64): 1 pedido aberto de cada vez (2 com o Turnstile ligado)
  e 3 por dia. Depois de um pedido cancelado, ou que acabou sem pagamento, esse endereço espera 7 dias. Com
  «bloquear», 30 dias.
- Rajadas: 10 pedidos por minuto por endereço e 60 chamadas de admin por minuto, contados pelo Cloudflare (os
  `[[ratelimits]]` do `wrangler.toml`), sem gastar escritas no KV. Um pedido recusado logo à entrada não escreve
  nada no KV.
- Pedido até 600 KB e logótipo PNG até 400 KB e 4096 px de lado. O site converte o logótipo para PNG (até 1200 px),
  o que fica quase sempre muito abaixo disso.
- O Turnstile do Cloudflare fica desligado enquanto não houver o secret `TURNSTILE_SECRET`. É o que mais trava um
  abuso feito de muitos endereços, mas o site ainda não manda o token: com o secret posto, o Worker recusaria todos
  os pedidos. Os passos para o ligar estão no `README.md` da raiz, em **Compras automáticas**.

No plano gratuito do Cloudflare (Workers Free) há 1 000 escritas no KV por dia e 10 ms de CPU por pedido. Um pedido
aceite gasta 5 escritas, e com um logótipo de 400 KB fica bem abaixo dos 10 ms (o PNG é lido pelo próprio motor, com
`Uint8Array.fromBase64`). A conta do preço gasta menos de 0,1 ms; o relógio de Lisboa (cerca de 13 ms de CPU da
primeira vez) prepara-se quando o Worker arranca, fora dos 10 ms de um pedido. Até 900 contratos ao mesmo tempo (a
lista lê cada um, e uma chamada ao Worker faz no máximo 1 000 operações no KV). O plano da conta vê-se no painel do Cloudflare, em **Workers & Pages**.

## Os secrets (GitHub: Settings > Secrets and variables > Actions)

| Secret | O que é |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token do Cloudflare com o modelo «Edit Cloudflare Workers» |
| `CLOUDFLARE_ACCOUNT_ID` | O Account ID do Cloudflare (no painel, à direita, em Workers & Pages) |
| `SPOTS_GITHUB_TOKEN` | Token fine-grained do GitHub só para `rgvduarte/carmo`, com Contents: Read and write. É com ele que o Worker reserva e liberta espaços |
| `ADMIN_KEY` | Uma palavra-passe comprida (pelo menos 16 caracteres, por exemplo `openssl rand -hex 24`). É pedida na página de admin para abrir os Pedidos. O GitHub não a mostra outra vez: guarda-a nas Palavras-passe do telemóvel |
| `TURNSTILE_SECRET` | Opcional. Só quando o site tiver o Turnstile ligado |

## Publicar outra vez

Cada push para `gh-pages` que mude `worker/`, `assets/js/season-rules.js` (a conta do preço) ou
`assets/js/apoiantes-core.js` (as regras dos nomes de «Quem apoia»), que vão dentro do Worker, publica o Worker
sozinho. Sem a versão de 02.11.2026 publicada, o site não mostra «Quem apoia» (o `GET /apoiantes` responde 404 e o site
lê isso como desligado) e as páginas Painel e Apoiantes dizem que o Worker ainda não tem esta parte. Mudar só o `data/spots.json` (preços, datas da época) não precisa de publicar. À mão: **Actions > Deploy pedidos > Run
workflow** (este botão só aparece se o branch por defeito do repositório for `gh-pages`). No fim, o resumo da action
mostra o endereço, por exemplo `https://gocarmo-pedidos.<conta>.workers.dev`.

**Perdeste a `ADMIN_KEY`?** Cria uma nova (`openssl rand -hex 24`), põe-na no secret `ADMIN_KEY` do GitHub e corre
**Actions > Deploy pedidos > Run workflow**. A antiga deixa de servir. Os bloqueios e as pausas por endereço
recomeçam do zero (são guardados com a chave).

Na primeira vez, a action cria o espaço de dados «gocarmo-pedidos» (KV) no Cloudflare. Se a conta ainda não tiver
subdomínio workers.dev, a action pára e diz para abrir **Workers & Pages** uma vez no painel do Cloudflare. Depois
corre outra vez.

## Ligar no site

Em `assets/js/data.js`, põe o endereço em `SITE.requestsApi`:

```js
requestsApi: 'https://gocarmo-pedidos.<conta>.workers.dev',
```

Depois corre `node scripts/stamp.mjs` (deixa a página de admin falar com esse endereço) e publica. Com
`requestsApi: ''` a página de admin não mostra os Pedidos e o pedido de reserva do site volta a ser só mensagem.
Hoje está ligado: o pedido de reserva manda cada compra para `POST /pedido`, com o logótipo.

## Privacidade

O nome, o email e o telefone servem para responder a quem pede e tratar do patrocínio; o nome e o NIF, também para o
recibo de donativo. Cada pedido e o seu logótipo ficam guardados 180 dias e depois
apagam-se sozinhos. O contrato de um patrocínio pago fica até 31 de dezembro do ano seguinte ao da época e depois
apaga-se sozinho (a página `privacidade/` diz o mesmo; se mudares o prazo em `contractExpiry`, muda-a também). Só a página de admin, com a `ADMIN_KEY`, os consegue ler. O Worker não guarda o endereço de
internet de quem pede: só um código feito com uma chave secreta (do endereço, ou do seu /64 em IPv6), para os
limites e para «bloquear». Esse código sai do pedido quando a compra é confirmada; nos contadores apaga-se ao fim
de 30 dias no máximo. Os nomes de «Quem apoia» são públicos por natureza; ficam no KV até ao fim do ano seguinte ao da época e saem logo a pedido (ver **Apoiantes** e `privacidade/`). O Worker não escreve registos. No `data/spots.json`, que é público, só aparecem a marca, o último dia da reserva e o número do pedido (e, depois da venda, que a página de admin escreve, o link da marca). O link que a marca dá no pedido fica no pedido e no contrato.

## Para quem mexe no código

`requests.js` tem dois imports, `../assets/js/season-rules.js` (as datas da época e o preço, os mesmos do site e do
admin) e `../assets/js/apoiantes-core.js` (as regras dos nomes de «Quem apoia», as mesmas do site e do admin). O
`wrangler deploy` junta-os ao Worker (esbuild), por isso a action publica o Worker também quando um deles muda. Escreve o `data/spots.json` como a página de admin (`assets/js/admin-core.js`) e o formulário do GitHub
(`scripts/spot-update.mjs`), com mais o campo `request` em cada espaço reservado por um pedido; qualquer ação seguinte
do admin tira esse campo. As chaves que não conhece (`seasonRules`, por exemplo) ficam no mesmo sítio e iguais.

| Pedido | Resposta |
|---|---|
| `POST /pedido` | `201 { id, until, total, m, seasonBp, day }` (`day`: a data de Lisboa do pedido; `m`: o mês da época, 0 = preço da tabela; `seasonBp`: o desconto de época, 625 = 6,25%), ou `{ error }`: ver abaixo |
| `GET /pedidos` | (admin) `{ pedidos: [...] }`, os mais recentes primeiro, sem logótipos |
| `GET /pedidos/<id>/logo` | (admin) o PNG |
| `POST /pedidos/<id>` | (admin) `{ action: "confirmar" \| "cancelar" \| "prolongar" \| "apagar" }`, e `bloquear: true` com `cancelar`. `apagar` (um pedido `confirmado` ou `cancelado`): `{ apagado: id }`; `estado` (409) num pedido aberto, `contrato` (409, com `id`, o do contrato) quando um contrato o refere. Com `confirmar`: `paidAt?: "AAAA-MM-DD"` (de 2026-01-01 a amanhã; por defeito hoje, Lisboa), `amount?: euros` (inteiro de 0 a 100 000; por defeito o total do pedido) e `url?` (o link da marca para o contrato, com a regra de `brandLink`; `""` sem link; por defeito o `link` do pedido; `campos` com `campo: "url"` se não servir, `acao` noutra ação). Um contrato que já existe não muda com outro `confirmar` (muda-se com `editar`). Resposta `{ pedido, contrato, criado }`; se o KV não guardar o contrato, `contrato: null, erro: "contrato"` e a mesma chamada cria-o depois |
| `GET /contratos` | (admin) `{ contratos: [...], agora, hoje }`, o pagamento mais recente primeiro |
| `POST /contratos` | (admin) um contrato à mão: `201 { contrato }` |
| `POST /contratos/<id>` | (admin) `{ action: "editar", set: {...} }`, `{ action: "renovacao", state: "" \| "proposta" \| "renova" \| "nao-renova", at? }` ou `{ action: "apagar" }` |
| `GET /estado` | `{ ok, kv, github, admin, turnstile, limites, contratos }`, só verdadeiro ou falso |
| `GET /apoiantes` | `{ v: 1, on }` (público; ver **Apoiantes**) |
| `GET /apoiantes/nomes` | `{ v: 1, names: [{ id, name }] }`, os publicados de A a Z (público) |
| `GET /apoiantes/admin` | (admin) `{ v, season, names: [{ id, name, state }], max, expira, on }` |
| `POST /apoiantes/admin` | (admin) `importar`, `adicionar`, `publicar` ou `retirar` (ver **Apoiantes**); a resposta é a lista toda, com `added`, `repetidos`, `recusados`, `published` ou `removed` |

O corpo de `POST /pedido` (JSON, `Content-Type: application/json`, do site `https://gocarmo.com`):
`{ items: [ids de data.spots, 1 a 6] | title: true | race: "<id>", helmet?: true | false (só com race), sector (com race),
brand, name, email, phone, nif?, message?, link?, pay: "mb" | "tr", lang?: "pt" | "en",
channel?: "whatsapp" | "email" | "instagram" | "site", logo: "data:image/png;base64,…", website: "", turnstile? }`.
Os erros: `ocupado` (409, com `ids`), `aberto` (429; só se a marca for a mesma, com `id`, `until`, o que esse pedido
reserva, `items`, `title: true` ou `race` e `helmet`, e o seu preço, `total`, `m`, `seasonBp` e `day`: o site só o toma como seu quando é o
mesmo pacote), `epoca` (409, com `season` e `until`: os pedidos desta época já fecharam), `prova-prazo` (409, com
`race` e `bookBy`), `limite` (429), `limite-site` (429), `muitos` (400, com `max`), `prova`, `prova-contacto`, `setor`,
`espacos`, `marca`, `nome`, `email`, `telefone`, `nif`, `mensagem`, `link`, `pagamento`,
`lingua`, `canal`, `logo`, `recusado` (400), `logo-grande` e `tamanho` (413), `json` (400 ou 415), `turnstile` e
`origem` (403), `config` e `interno` (503), `github` e `conflito` (502).

Os campos de quem pede (desde 31.10.2026): `name` com 2 a 80 caracteres (`nome`), `email` até 120 caracteres, com uma
@, um ponto no domínio e sem espaços (`email`), `phone` até 30 caracteres, com 9 a 15 algarismos, espaços e um + no
início, se houver (`telefone`); como os outros, sem caracteres de controlo e com os espaços juntos. São vistos depois da
marca, o email e o telefone antes do nome: uma página aberta antes da mudança não os manda e recebe `email`, um erro
que não conhece, e manda só a mensagem, como quando o Worker não responde.

O link da marca (desde 02.11.2026), opcional: `link` com a regra de `assets/js/season-rules.js` `brandLink`, a mesma do
site e da página de admin: `https://` (um domínio sem ele ganha-o), ou `@marca` (o Instagram); nunca outro esquema
(`http:`, `javascript:`, `data:`, `mailto:`…), espaços, um endereço IP, uma porta, um nome de rede local (`.local`,
`.internal`…) ou `gocarmo.com`; até 200 caracteres
depois de normalizado (senão, 400 `link`, e nada fica reservado). Fica no pedido normalizado (`link: ""` sem ele); um pedido
guardado antes não tem o campo, e a página de admin lê-o como sem link. Uma página aberta antes da mudança não o
manda: o pedido vale como antes.

Os pedidos de admin levam `Authorization: Bearer <ADMIN_KEY>`, de `https://gocarmo.com` (ou sem `Origin`, como o
`curl`), com o mesmo limite de rajadas (`RL_ADMIN`) para `/pedidos` e `/contratos`.

**O contrato** (`c:<id>`, JSON, versão 1):

```
{ v: 1, id, kind: "site" | "manual", request, season, period: { start, end },
  dates: { logoBy, proposalsFrom, renewBy, openFrom }, brand, url, title, race?: { id, date, name, helmet, sector, logoBy,
  notice } (só no parceiro de prova), spots: [{ id, n, name, item, price }], label,
  level, price: { day, gross, m, seasonBp, discPct, total } | null, amount, paidAt, pay: "mb" | "tr" | "produto" | "outro",
  inKind, contact: { name, channel, email, phone, handle }, nif, lang: "pt" | "en", logo: { vector, fromRace },
  renewal: { state: "" | "proposta" | "renova" | "nao-renova", at }, notes, terms, created, updated, history: [até 50] }
```

`url` é o link da marca (o do logótipo no site), com a regra de `brandLink` também em `POST /contratos` e em `editar`
(`@marca` vale; guarda-se normalizado; `""` tira-o).

`price` é o que a tabela pedia (no dia do pedido; num contrato à mão, no dia do pagamento) e `amount` o que foi pago
(pode ser diferente, ou 0 em produto). `renewal.state` guarda só o passo dado à mão; o estado que se mostra (ativo, a
propor, proposta enviada, renova, não renova, terminado) sai de `renewalView(contrato, dia)` em `season-rules.js`.

O corpo de `POST /contratos` (até 8 KB): `{ season: "2027" (a época do ficheiro ou a seguinte), brand, items?: [ids] |
title?: true, label?, amount, paidAt, pay, inKind?, url?: "https://…" | "@marca", contact?: { name, channel: "whatsapp" | "email" |
"instagram" | "site" | "telefone" | "pessoal" | "outro" | "", email, phone, handle }, nif?, lang?, notes?, logo?: {
vector, fromRace }, request?, race?: { id, helmet?, sector?, notice? } }`. Precisa de espaços, do fato completo, de uma prova
(`race`, nunca com `items` ou `title`) ou de uma descrição (`label`). Em `editar`, `set`
leva os mesmos campos (os que vêm mudam; `contact` e `logo` juntam-se aos que havia); a época só muda num contrato em
que ainda nada foi mexido. Ao mudar os espaços, os que ficam guardam o preço antigo.

Os erros dos contratos: `campos` (400, com `campo`, o nome do campo errado), `acao` (400), `json` (400), `tamanho`
(413), `nada` (404), `existe` (409, com `id`: esse pedido já tem contrato), `muitos` (409, com `max`), `chave` (401),
`origem` (403), `limite` (429), `config` (503), `interno` (503: o KV não guardou; o contrato fica como estava),
`github` (502: nem o ficheiro público nem o do GitHub responderam). Nenhum erro leva dados de um contrato.


**Origens.** O Worker só responde (CORS e `POST /pedido`) a `SITE_ORIGIN`, `https://gocarmo.com`. Para testar com uma
cópia local do site, o `worker/.dev.vars` (só o `wrangler dev` o lê; o git ignora-o) pode ter
`DEV_ORIGIN=http://127.0.0.1:8000` (uma origem, ou várias separadas por vírgulas). Nunca o ponhas no
`wrangler.toml`: o Worker publicado aceitaria pedidos dessa origem. Os passos de um teste de ponta a ponta estão no
`README.md` da raiz, em **Compras automáticas**.
