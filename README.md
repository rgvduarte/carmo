# Cofre de documentos

Este ramo guarda, cifrados, os documentos que fazemos para o Gonçalo Carmo. Só abrem em
https://gocarmo.com/admin/documentos/ com a frase-passe do cofre. Sem ela não se leem os ficheiros, os títulos, as
versões nem as datas dos documentos; as datas das publicações (as dos commits) são públicas.

- `vault.json`: a chave pública do cofre e a chave privada fechada com a frase-passe (escrito pela página).
- `manifest.json`: a lista dos documentos e das versões, cifrada (escrita pelo publicador).
- `f/<id>/<n>.bin`: os ficheiros, cifrados em partes de 8 MiB, com nomes que não dizem nada.

Não mexas aqui à mão: é reescrito em cada publicação (`scripts/docs-publish.mjs`, ver o README do site,
«Documentos (o cofre)»).
