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
   - **Cancelar**: os espaços que ainda estão reservados por este pedido voltam a ficar livres.

Limites contra abusos: 3 pedidos por dia e 1 pedido aberto de cada vez por endereço de internet, 12 reservas por dia
no site todo (`MAX_HOLDS_DAY` em `wrangler.toml`), pedido até 1,5 MB e logótipo até 1 MB. O Turnstile do Cloudflare
fica desligado enquanto não houver o secret `TURNSTILE_SECRET`.

## Os secrets (GitHub: Settings > Secrets and variables > Actions)

| Secret | O que é |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token do Cloudflare com o modelo «Edit Cloudflare Workers» |
| `CLOUDFLARE_ACCOUNT_ID` | O Account ID do Cloudflare (no painel, à direita, em Workers & Pages) |
| `SPOTS_GITHUB_TOKEN` | Token fine-grained do GitHub só para `rgvduarte/carmo`, com Contents: Read and write. É com ele que o Worker reserva e liberta espaços |
| `ADMIN_KEY` | Uma palavra-passe comprida (pelo menos 16 caracteres, por exemplo `openssl rand -hex 24`). É pedida uma vez na página de admin para abrir os Pedidos |
| `TURNSTILE_SECRET` | Opcional. Só quando o site tiver o Turnstile ligado |

## Publicar outra vez

Cada push para `gh-pages` que mude `worker/` publica o Worker sozinho. À mão: **Actions > Deploy pedidos > Run
workflow** (este botão só aparece se o branch por defeito do repositório for `gh-pages`). No fim, o resumo da action
mostra o endereço, por exemplo `https://gocarmo-pedidos.<conta>.workers.dev`.

Na primeira vez, a action cria o espaço de dados «gocarmo-pedidos» (KV) no Cloudflare. Se a conta ainda não tiver
subdomínio workers.dev, a action pára e diz para abrir **Workers & Pages** uma vez no painel do Cloudflare. Depois
corre outra vez.

## Ligar no site

Em `assets/js/data.js`, põe o endereço em `SITE.requestsApi`:

```js
requestsApi: 'https://gocarmo-pedidos.<conta>.workers.dev',
```

Depois corre `node scripts/stamp.mjs` (deixa a página de admin falar com esse endereço) e publica. Com
`requestsApi: ''` a página de admin não mostra os Pedidos.

## Privacidade

O nome e o NIF só servem para o recibo de donativo. Cada pedido e o seu logótipo ficam guardados 180 dias e depois
apagam-se sozinhos. Só a página de admin, com a `ADMIN_KEY`, os consegue ler. O Worker não guarda o endereço de
internet de quem pede (só um código que não se consegue reverter, num contador que apaga em poucos dias) e não
escreve registos. No `data/spots.json`, que é público, só aparecem a marca, o último dia da reserva e o número do pedido.

## Para quem mexe no código

`requests.js` não tem dependências. Escreve o `data/spots.json` como a página de admin (`assets/js/admin-core.js`) e o
formulário do GitHub (`scripts/spot-update.mjs`), com mais o campo `request` em cada espaço reservado por um pedido;
qualquer ação seguinte do admin tira esse campo.

| Pedido | Resposta |
|---|---|
| `POST /pedido` | `201 { id, until, total }`, ou `{ error }`: `ocupado` (409, com `ids`), `aberto` (429, com `id` e `until`), `limite`, `limite-dia` (429), `marca`, `logo`, `logo-grande`, `espacos`, … |
| `GET /pedidos` | (admin) `{ pedidos: [...] }`, os mais recentes primeiro, sem logótipos |
| `GET /pedidos/<id>/logo` | (admin) o PNG |
| `POST /pedidos/<id>` | (admin) `{ action: "confirmar" \| "cancelar" \| "prolongar" }` |
| `GET /estado` | `{ ok, kv, github, admin, turnstile }`, só verdadeiro ou falso |

Os pedidos de admin levam `Authorization: Bearer <ADMIN_KEY>`.
