# Pedidos e contratos (Cloudflare Worker)

Recebe as compras feitas no site, guarda os espaços enquanto o Gonçalo espera pelo pagamento e, depois de pago, guarda
o registo de cada patrocínio (o contrato), que a página de admin **Patrocínios** mostra.

## O que faz

1. A marca escolhe os espaços no site, escreve a marca e envia o logótipo (obrigatório, PNG). O site manda o pedido
   para este Worker (`POST /pedido`).
2. O Worker confirma que os espaços existem e estão livres, e reserva-os por 48 horas no `data/spots.json` do branch
   `gh-pages` (um commit, como `Espaço 21 reservado para Marca até 2026-10-25 (pedido TM2K4Q7XFA)`). O site mostra-os
   reservados em 1 a 2 minutos. Se ninguém fizer nada, a reserva acaba sozinha no fim do último dia.
3. O Worker guarda o pedido (marca, nome, NIF, mensagem, forma de pagamento, total, os preços e os nomes dos espaços
   nesse dia) e o logótipo, e responde ao site com o número do pedido, o último dia da reserva, o total, o mês da época
   (`m`, 0 até 31 de janeiro, depois o número do mês: março é 3) e o desconto de época em centésimas de ponto
   percentual (`seasonBp`, 625 é 6,25%). O total é o do site, ao euro: as duas partes usam a mesma conta,
   em `assets/js/season-rules.js` (ver **Épocas e preço**). O site diz à marca que tem 48 horas para enviar o
   comprovativo.
4. Na página de admin, em **Pedidos**, o Gonçalo vê cada pedido com o logótipo e o tempo que falta:
   - **Confirmar compra**: abre a venda com a marca e o logótipo do pedido. Ao guardar, o espaço fica vendido no site com
     esse logótipo (com o token do GitHub da página de admin, como uma venda à mão) e o pedido fica confirmado, com a
     data do pagamento e o montante recebido. Nesse momento o Worker cria o contrato do patrocínio (ver **Contratos**).
     O pagamento recebe um recibo de donativo, nunca uma fatura.
   - **Prolongar 48 h**: a reserva dura mais dois dias.
   - **Cancelar**: os espaços que ainda estão reservados por este pedido voltam a ficar livres. Num pedido falso,
     marca «bloquear quem o fez durante 30 dias».

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
telefone ou conta, se os houver), NIF se foi dado, notas, histórico e o número do pedido. Fica no KV do Worker, nunca
num ficheiro público, com a chave `c:<id>`:

- **Pedido do site**: **Confirmar** cria-o com o número do próprio pedido, uma só vez (repetir não cria outro). Um pedido
  confirmado antes de haver contratos ganha o seu com o mesmo botão.
- **À mão**: em **Patrocínios**, para o que foi combinado por email, WhatsApp ou em produto. Tem um número novo.

Cada contrato apaga-se sozinho no fim de 31 de dezembro do ano seguinte ao da época (os da época 2027 a 31 de dezembro
de 2028). Antes disso, exporta o CSV em **Patrocínios**: é a cópia do Gonçalo. Não guarda o código do endereço de
internet nem o logótipo. Confirmar gasta 2 escritas no KV (o contrato e o pedido); cada mudança num contrato, 1.

## Limites contra abusos

- Até 6 espaços por pedido. Mais do que isso, só o fato completo.
- No máximo 8 espaços reservados ao mesmo tempo por pedidos do site ainda por pagar (`MAX_HELD` em `wrangler.toml`).
  O fato completo conta como os 8: só se pede pelo site quando não há outros pedidos do site por pagar. Esta conta é
  feita no próprio `data/spots.json`, na escrita, por isso nem pedidos em paralelo a passam. Os espaços que reservas
  ou vendes à mão não contam.
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

Cada push para `gh-pages` que mude `worker/` ou `assets/js/season-rules.js` (a conta do preço, que vai dentro do
Worker) publica o Worker sozinho. Mudar só o `data/spots.json` (preços, datas da época) não precisa de publicar. À mão: **Actions > Deploy pedidos > Run
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

O nome e o NIF só servem para o recibo de donativo. Cada pedido e o seu logótipo ficam guardados 180 dias e depois
apagam-se sozinhos. O contrato de um patrocínio pago fica até 31 de dezembro do ano seguinte ao da época e depois
apaga-se sozinho (a página `privacidade/` diz o mesmo; se mudares o prazo em `contractExpiry`, muda-a também). Só a página de admin, com a `ADMIN_KEY`, os consegue ler. O Worker não guarda o endereço de
internet de quem pede: só um código feito com uma chave secreta (do endereço, ou do seu /64 em IPv6), para os
limites e para «bloquear». Esse código sai do pedido quando a compra é confirmada; nos contadores apaga-se ao fim
de 30 dias no máximo. O Worker não escreve registos. No `data/spots.json`, que é público, só aparecem a marca, o último dia da reserva e o número do pedido.

## Para quem mexe no código

`requests.js` tem um só import, `../assets/js/season-rules.js` (as datas da época e o preço, os mesmos do site e do
admin). O `wrangler deploy` junta-o ao Worker (esbuild), por isso a action publica o Worker também quando esse ficheiro
muda. Escreve o `data/spots.json` como a página de admin (`assets/js/admin-core.js`) e o formulário do GitHub
(`scripts/spot-update.mjs`), com mais o campo `request` em cada espaço reservado por um pedido; qualquer ação seguinte
do admin tira esse campo. As chaves que não conhece (`seasonRules`, por exemplo) ficam no mesmo sítio e iguais.

| Pedido | Resposta |
|---|---|
| `POST /pedido` | `201 { id, until, total, m, seasonBp, day }` (`day`: a data de Lisboa do pedido; `m`: o mês da época, 0 = preço da tabela; `seasonBp`: o desconto de época, 625 = 6,25%), ou `{ error }`: ver abaixo |
| `GET /pedidos` | (admin) `{ pedidos: [...] }`, os mais recentes primeiro, sem logótipos |
| `GET /pedidos/<id>/logo` | (admin) o PNG |
| `POST /pedidos/<id>` | (admin) `{ action: "confirmar" \| "cancelar" \| "prolongar" }`, e `bloquear: true` com `cancelar`. Com `confirmar`: `paidAt?: "AAAA-MM-DD"` (de 2026-01-01 a amanhã; por defeito hoje, Lisboa) e `amount?: euros` (inteiro de 0 a 100 000; por defeito o total do pedido). Resposta `{ pedido, contrato, criado }`; se o KV não guardar o contrato, `contrato: null, erro: "contrato"` e a mesma chamada cria-o depois |
| `GET /contratos` | (admin) `{ contratos: [...], agora, hoje }`, o pagamento mais recente primeiro |
| `POST /contratos` | (admin) um contrato à mão: `201 { contrato }` |
| `POST /contratos/<id>` | (admin) `{ action: "editar", set: {...} }`, `{ action: "renovacao", state: "" \| "proposta" \| "renova" \| "nao-renova", at? }` ou `{ action: "apagar" }` |
| `GET /estado` | `{ ok, kv, github, admin, turnstile, limites, contratos }`, só verdadeiro ou falso |

O corpo de `POST /pedido` (JSON, `Content-Type: application/json`, do site `https://gocarmo.com`):
`{ items: [ids de data.spots, 1 a 6] | title: true, brand, name?, nif?, message?, pay: "mb" | "tr", lang?: "pt" | "en",
channel?: "whatsapp" | "email" | "instagram" | "site", logo: "data:image/png;base64,…", website: "", turnstile? }`.
Os erros: `ocupado` (409, com `ids`), `aberto` (429; só se a marca for a mesma, com `id`, `until`, o que esse pedido
reserva, `items` ou `title: true`, e o seu preço, `total`, `m`, `seasonBp` e `day`: o site só o toma como seu quando é o
mesmo pacote), `epoca` (409, com `season` e `until`: os pedidos desta época já fecharam), `limite` (429),
`limite-site` (429), `muitos` (400, com `max`), `espacos`, `marca`, `nome`, `nif`, `mensagem`, `pagamento`,
`lingua`, `canal`, `logo`, `recusado` (400), `logo-grande` e `tamanho` (413), `json` (400 ou 415), `turnstile` e
`origem` (403), `config` e `interno` (503), `github` e `conflito` (502).

Os pedidos de admin levam `Authorization: Bearer <ADMIN_KEY>`, de `https://gocarmo.com` (ou sem `Origin`, como o
`curl`), com o mesmo limite de rajadas (`RL_ADMIN`) para `/pedidos` e `/contratos`.

**O contrato** (`c:<id>`, JSON, versão 1):

```
{ v: 1, id, kind: "site" | "manual", request, season, period: { start, end },
  dates: { logoBy, proposalsFrom, renewBy, openFrom }, brand, url, title, spots: [{ id, n, name, item, price }], label,
  level, price: { day, gross, m, seasonBp, discPct, total } | null, amount, paidAt, pay: "mb" | "tr" | "produto" | "outro",
  inKind, contact: { name, channel, email, phone, handle }, nif, lang: "pt" | "en", logo: { vector, fromRace },
  renewal: { state: "" | "proposta" | "renova" | "nao-renova", at }, notes, terms, created, updated, history: [até 50] }
```

`price` é o que a tabela pedia (no dia do pedido; num contrato à mão, no dia do pagamento) e `amount` o que foi pago
(pode ser diferente, ou 0 em produto). `renewal.state` guarda só o passo dado à mão; o estado que se mostra (ativo, a
propor, proposta enviada, renova, não renova, terminado) sai de `renewalView(contrato, dia)` em `season-rules.js`.

O corpo de `POST /contratos` (até 8 KB): `{ season: "2027" (a época do ficheiro ou a seguinte), brand, items?: [ids] |
title?: true, label?, amount, paidAt, pay, inKind?, url?: "https://…", contact?: { name, channel: "whatsapp" | "email" |
"instagram" | "site" | "telefone" | "pessoal" | "outro" | "", email, phone, handle }, nif?, lang?, notes?, logo?: {
vector, fromRace }, request? }`. Precisa de espaços, do fato completo ou de uma descrição (`label`). Em `editar`, `set`
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
