# Pedidos (Cloudflare Worker)

Recebe as compras feitas no site e guarda os espaços enquanto o Gonçalo espera pelo pagamento.

## O que faz

1. A marca escolhe os espaços no site, escreve a marca e envia o logótipo (obrigatório, PNG). O site manda o pedido
   para este Worker (`POST /pedido`).
2. O Worker confirma que os espaços existem e estão livres, e reserva-os por 48 horas no `data/spots.json` do branch
   `gh-pages` (um commit, como `Espaço 21 reservado para Marca até 2026-10-25 (pedido TM2K4Q7XFA)`). O site mostra-os
   reservados em 1 a 2 minutos. Se ninguém fizer nada, a reserva acaba sozinha no fim do último dia.
3. O Worker guarda o pedido (marca, nome, NIF, mensagem, forma de pagamento, total) e o logótipo, e responde ao site
   com o número do pedido, o último dia da reserva e o total. O site diz à marca que tem 48 horas para enviar o
   comprovativo.
4. Na página de admin, em **Pedidos**, o Gonçalo vê cada pedido com o logótipo e o tempo que falta:
   - **Confirmar compra**: abre a venda com a marca e o logótipo do pedido. Ao guardar, o espaço fica vendido no site com
     esse logótipo (com o token do GitHub da página de admin, como uma venda à mão) e o pedido fica confirmado.
     O pagamento recebe um recibo de donativo, nunca uma fatura.
   - **Prolongar 48 h**: a reserva dura mais dois dias.
   - **Cancelar**: os espaços que ainda estão reservados por este pedido voltam a ficar livres. Num pedido falso,
     marca «bloquear quem o fez durante 30 dias».

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
`Uint8Array.fromBase64`). O plano da conta vê-se no painel do Cloudflare, em **Workers & Pages**.

## Os secrets (GitHub: Settings > Secrets and variables > Actions)

| Secret | O que é |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token do Cloudflare com o modelo «Edit Cloudflare Workers» |
| `CLOUDFLARE_ACCOUNT_ID` | O Account ID do Cloudflare (no painel, à direita, em Workers & Pages) |
| `SPOTS_GITHUB_TOKEN` | Token fine-grained do GitHub só para `rgvduarte/carmo`, com Contents: Read and write. É com ele que o Worker reserva e liberta espaços |
| `ADMIN_KEY` | Uma palavra-passe comprida (pelo menos 16 caracteres, por exemplo `openssl rand -hex 24`). É pedida na página de admin para abrir os Pedidos. O GitHub não a mostra outra vez: guarda-a nas Palavras-passe do telemóvel |
| `TURNSTILE_SECRET` | Opcional. Só quando o site tiver o Turnstile ligado |

## Publicar outra vez

Cada push para `gh-pages` que mude `worker/` publica o Worker sozinho. À mão: **Actions > Deploy pedidos > Run
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
apagam-se sozinhos. Só a página de admin, com a `ADMIN_KEY`, os consegue ler. O Worker não guarda o endereço de
internet de quem pede: só um código que não se consegue reverter (do endereço, ou do seu /64 em IPv6), para os
limites e para «bloquear». Esse código sai do pedido quando a compra é confirmada; nos contadores apaga-se ao fim
de 30 dias no máximo. O Worker não escreve registos. No `data/spots.json`, que é público, só aparecem a marca, o último dia da reserva e o número do pedido.

## Para quem mexe no código

`requests.js` não tem dependências. Escreve o `data/spots.json` como a página de admin (`assets/js/admin-core.js`) e o
formulário do GitHub (`scripts/spot-update.mjs`), com mais o campo `request` em cada espaço reservado por um pedido;
qualquer ação seguinte do admin tira esse campo.

| Pedido | Resposta |
|---|---|
| `POST /pedido` | `201 { id, until, total }`, ou `{ error }`: ver abaixo |
| `GET /pedidos` | (admin) `{ pedidos: [...] }`, os mais recentes primeiro, sem logótipos |
| `GET /pedidos/<id>/logo` | (admin) o PNG |
| `POST /pedidos/<id>` | (admin) `{ action: "confirmar" \| "cancelar" \| "prolongar" }`, e `bloquear: true` com `cancelar` |
| `GET /estado` | `{ ok, kv, github, admin, turnstile, limites }`, só verdadeiro ou falso |

O corpo de `POST /pedido` (JSON, `Content-Type: application/json`, do site `https://gocarmo.com`):
`{ items: [ids de data.spots, 1 a 6] | title: true, brand, name?, nif?, message?, pay: "mb" | "tr", lang?: "pt" | "en",
channel?: "whatsapp" | "email" | "instagram" | "site", logo: "data:image/png;base64,…", website: "", turnstile? }`.
Os erros: `ocupado` (409, com `ids`), `aberto` (429; com `id` e `until` só se a marca for a mesma), `limite` (429),
`limite-site` (429), `muitos` (400, com `max`), `espacos`, `marca`, `nome`, `nif`, `mensagem`, `pagamento`,
`lingua`, `canal`, `logo`, `recusado` (400), `logo-grande` e `tamanho` (413), `json` (400 ou 415), `turnstile` e
`origem` (403), `config` e `interno` (503), `github` e `conflito` (502).

Os pedidos de admin levam `Authorization: Bearer <ADMIN_KEY>`.

**Origens.** O Worker só responde (CORS e `POST /pedido`) a `SITE_ORIGIN`, `https://gocarmo.com`. Para testar com uma
cópia local do site, o `worker/.dev.vars` (só o `wrangler dev` o lê; o git ignora-o) pode ter
`DEV_ORIGIN=http://127.0.0.1:8000` (uma origem, ou várias separadas por vírgulas). Nunca o ponhas no
`wrangler.toml`: o Worker publicado aceitaria pedidos dessa origem. Os passos de um teste de ponta a ponta estão no
`README.md` da raiz, em **Compras automáticas**.
