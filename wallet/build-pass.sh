#!/bin/sh
# Builds the Apple Wallet pass of Gonçalo's contact card from wallet/cartao/ (README, «Cartão de contacto»).
#
#   WALLET_P12_BASE64=…  WALLET_P12_PASSWORD=…  WALLET_PASS_TYPE_ID=pass.com.gocarmo.cartao  WALLET_TEAM_ID=AB12CD34EF \
#     sh wallet/build-pass.sh [goncalo-carmo.pkpass]
#
# WALLET_P12_BASE64   the Pass Type ID certificate with its private key, exported as .p12 and then base64
#                     (base64 -i cartao.p12 | pbcopy on a Mac). WALLET_P12_FILE=path/to/cartao.p12 works too.
# WALLET_P12_PASSWORD the password chosen when exporting the .p12 (may be empty, but has to be set)
# WALLET_PASS_TYPE_ID the Pass Type ID, e.g. pass.com.gocarmo.cartao; it has to be the certificate's
# WALLET_TEAM_ID      the 10-character Team ID of the Apple Developer account (Membership details)
# WALLET_SERIAL       optional, default goncalo-carmo. Wallet keeps one pass per Pass Type ID and serial number: a
#                     new build with the same serial replaces the card already in Wallet, a new serial adds a second.
# WALLET_WWDR         optional, Apple's WWDR intermediate G4 (DER or PEM); default wallet/AppleWWDRCAG4.cer. With a
#                     test certificate (not Apple's), the certificate that issued it, or the certificate itself when
#                     it is self-signed: the script refuses a certificate that this one did not issue.
#
# Steps (Apple, «Building a pass»): copy the source, fill in the three identifiers, write manifest.json with the SHA-1
# of every file, sign it (PKCS #7, detached, DER, with the WWDR certificate inside) into «signature», zip.
# Needs openssl, zip and python3, nothing else. Prints no secret: the .p12, its password and the key only exist in a
# private temporary folder (umask 077), deleted when the script ends, whatever happens.
set -eu
umask 077

die() { printf 'build-pass: %s\n' "$*" >&2; exit 1; }
for c in openssl zip python3; do command -v "$c" >/dev/null 2>&1 || die "falta o programa $c"; done

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
src="$here/cartao"
out="${1:-goncalo-carmo.pkpass}"
case "$out" in /*) ;; *) out="$PWD/$out" ;; esac
[ -f "$src/pass.json" ] || die "não encontro $src/pass.json"

# ---- the settings -----------------------------------------------------------------------------------------------
WALLET_SERIAL="${WALLET_SERIAL:-goncalo-carmo}"
WALLET_WWDR="${WALLET_WWDR:-$here/AppleWWDRCAG4.cer}"
matches() { printf '%s' "$1" | grep -Eq "$2"; }
[ -n "${WALLET_PASS_TYPE_ID:-}" ] || die "falta WALLET_PASS_TYPE_ID (o Pass Type ID, por exemplo pass.com.gocarmo.cartao)"
[ -n "${WALLET_TEAM_ID:-}" ] || die "falta WALLET_TEAM_ID (o Team ID da conta Apple Developer, 10 letras e números)"
matches "$WALLET_PASS_TYPE_ID" '^pass\.[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' || die "WALLET_PASS_TYPE_ID não parece um Pass Type ID: começa por pass. (por exemplo pass.com.gocarmo.cartao)"
matches "$WALLET_TEAM_ID" '^[A-Z0-9]{10}$' || die "WALLET_TEAM_ID tem de ter 10 letras maiúsculas e números (Membership details em developer.apple.com)"
matches "$WALLET_SERIAL" '^[A-Za-z0-9._-]{1,64}$' || die "WALLET_SERIAL só pode ter letras, números, ponto, hífen e sublinhado"
[ -n "${WALLET_P12_BASE64:-}" ] || [ -n "${WALLET_P12_FILE:-}" ] || die "falta WALLET_P12_BASE64 (o certificado .p12 em base64) ou WALLET_P12_FILE"
[ "${WALLET_P12_PASSWORD+set}" = set ] || die "falta WALLET_P12_PASSWORD (a palavra-passe do .p12; vazia, se não tiver)"
[ -f "$WALLET_WWDR" ] || die "não encontro o certificado WWDR G4 da Apple em $WALLET_WWDR"
export WALLET_PASS_TYPE_ID WALLET_TEAM_ID WALLET_SERIAL WALLET_P12_PASSWORD

tmp=$(mktemp -d "${TMPDIR:-/tmp}/build-pass.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
trap 'exit 1' HUP INT TERM

# ---- the certificate and its key, out of the .p12 -------------------------------------------------------------------
if [ -n "${WALLET_P12_FILE:-}" ]; then
  [ -f "$WALLET_P12_FILE" ] || die "não encontro $WALLET_P12_FILE"
  cp "$WALLET_P12_FILE" "$tmp/id.p12"
else
  export WALLET_P12_BASE64
  python3 -c 'import base64, os, sys; sys.stdout.buffer.write(base64.b64decode("".join(os.environ["WALLET_P12_BASE64"].split()), validate=True))' \
    > "$tmp/id.p12" 2>/dev/null || die "WALLET_P12_BASE64 não é base64 válido (copia outra vez o resultado de base64 -i cartao.p12)"
fi
# OpenSSL 3 needs -legacy for a .p12 made with the old algorithms (as the Mac's Keychain Access still does)
p12() {
  openssl pkcs12 -in "$tmp/id.p12" -passin env:WALLET_P12_PASSWORD "$@" 2>"$tmp/err" ||
    openssl pkcs12 -legacy -in "$tmp/id.p12" -passin env:WALLET_P12_PASSWORD "$@" 2>>"$tmp/err"
}
p12 -clcerts -nokeys -out "$tmp/cert.pem" ||
  die "não consegui abrir o .p12: a palavra-passe (WALLET_P12_PASSWORD) está certa? ($(grep -m1 -i -E 'error|invalid|mac' "$tmp/err" || true))"
p12 -nocerts -nodes -out "$tmp/key.pem" || die "o .p12 não traz a chave privada: exporta o certificado com a chave (no Acesso a Porta-chaves, as duas linhas)"
grep -q 'BEGIN CERTIFICATE' "$tmp/cert.pem" || die "o .p12 não traz o certificado"
grep -q 'PRIVATE KEY' "$tmp/key.pem" || die "o .p12 não traz a chave privada"

# the certificate has to be for this Pass Type ID and this team, in date, and match the key
subject=$(openssl x509 -in "$tmp/cert.pem" -noout -subject -nameopt RFC2253 | sed 's/^subject= *//')
uid=$(printf '%s\n' "$subject" | tr ',' '\n' | sed -n 's/^UID=//p' | head -n 1)
ou=$(printf '%s\n' "$subject" | tr ',' '\n' | sed -n 's/^OU=//p' | head -n 1)
[ -z "$uid" ] || [ "$uid" = "$WALLET_PASS_TYPE_ID" ] || die "o certificado é do Pass Type ID $uid, não de $WALLET_PASS_TYPE_ID: corrige WALLET_PASS_TYPE_ID ou usa o certificado certo"
[ -z "$ou" ] || [ "$ou" = "$WALLET_TEAM_ID" ] || die "o certificado é da equipa $ou, não de $WALLET_TEAM_ID: corrige WALLET_TEAM_ID"
[ -n "$uid" ] || printf 'build-pass: aviso: o certificado não diz o Pass Type ID (UID); um certificado da Apple diz\n' >&2
openssl x509 -in "$tmp/cert.pem" -noout -checkend 0 >/dev/null ||
  die "o certificado expirou ($(openssl x509 -in "$tmp/cert.pem" -noout -enddate | sed 's/^notAfter=//')): cria outro em developer.apple.com"
openssl x509 -in "$tmp/cert.pem" -noout -pubkey > "$tmp/pub-cert.pem"
openssl pkey -in "$tmp/key.pem" -pubout > "$tmp/pub-key.pem" 2>/dev/null || die "não consegui ler a chave privada do .p12"
cmp -s "$tmp/pub-cert.pem" "$tmp/pub-key.pem" || die "a chave privada do .p12 não é a deste certificado"

# Apple's intermediate, which signed the certificate: it goes inside the signature
openssl x509 -inform DER -in "$WALLET_WWDR" -out "$tmp/wwdr.pem" 2>/dev/null ||
  openssl x509 -in "$WALLET_WWDR" -out "$tmp/wwdr.pem" 2>/dev/null || die "$WALLET_WWDR não é um certificado"
issuer=$(openssl x509 -in "$tmp/cert.pem" -noout -issuer -nameopt RFC2253 | sed 's/^issuer= *//')
wwdr=$(openssl x509 -in "$tmp/wwdr.pem" -noout -subject -nameopt RFC2253 | sed 's/^subject= *//')
[ "$issuer" = "$wwdr" ] || die "o certificado foi emitido por «$issuer», não pelo intermediário em $WALLET_WWDR («$wwdr»): um Pass Type ID da Apple usa o WWDR G4; com um certificado de teste, põe em WALLET_WWDR o certificado que o emitiu (ou o próprio, se for autoassinado)"

# ---- the pass ---------------------------------------------------------------------------------------------------
mkdir "$tmp/pass"
cp -R "$src/." "$tmp/pass/"
find "$tmp/pass" -name '.*' -exec rm -rf {} + 2>/dev/null || true      # .DS_Store and the like never go in
[ -f "$tmp/pass/icon.png" ] || die "falta wallet/cartao/icon.png (a Wallet não aceita um passe sem ícone)"

python3 - "$tmp/pass" <<'PY'
import hashlib, json, os, sys
root = sys.argv[1]
p = os.path.join(root, 'pass.json')
with open(p, encoding='utf-8') as f:
    src = json.load(f)
for k in ('passTypeIdentifier', 'teamIdentifier', 'serialNumber'):
    if k in src:
        sys.exit(f'build-pass: wallet/cartao/pass.json não pode trazer {k}: vem de WALLET_PASS_TYPE_ID, WALLET_TEAM_ID e WALLET_SERIAL')
d = {'formatVersion': src.pop('formatVersion'), 'passTypeIdentifier': os.environ['WALLET_PASS_TYPE_ID'],
     'serialNumber': os.environ['WALLET_SERIAL'], 'teamIdentifier': os.environ['WALLET_TEAM_ID'], **src}
for k in ('organizationName', 'description'):
    if not d.get(k):
        sys.exit(f'build-pass: falta {k} em wallet/cartao/pass.json')
with open(p, 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write('\n')
# manifest.json: the SHA-1 of every file, by its path inside the pass (forward slashes)
files = {}
for dirpath, dirs, names in os.walk(root):
    for n in names:
        rel = os.path.relpath(os.path.join(dirpath, n), root).replace(os.sep, '/')
        if rel in ('manifest.json', 'signature'):
            continue
        with open(os.path.join(dirpath, n), 'rb') as f:
            files[rel] = hashlib.sha1(f.read()).hexdigest()
with open(os.path.join(root, 'manifest.json'), 'w', encoding='utf-8') as f:
    json.dump(dict(sorted(files.items())), f, indent=2)
    f.write('\n')
PY

openssl smime -sign -binary -md sha256 -in "$tmp/pass/manifest.json" -signer "$tmp/cert.pem" -inkey "$tmp/key.pem" \
  -certfile "$tmp/wwdr.pem" -outform DER -out "$tmp/pass/signature" 2>"$tmp/err" || die "a assinatura falhou: $(head -n 1 "$tmp/err")"
# the signature has to match the manifest (the chain up to Apple's root is checked by the iPhone, and by the Action)
openssl smime -verify -binary -noverify -inform DER -in "$tmp/pass/signature" -content "$tmp/pass/manifest.json" \
  -out /dev/null 2>"$tmp/err" || die "a assinatura não confere com o manifest.json: $(head -n 1 "$tmp/err")"

rm -f "$tmp/out.pkpass"
(cd "$tmp/pass" && zip -q -X -D -r "$tmp/out.pkpass" .)
mkdir -p "$(dirname -- "$out")"
mv -f "$tmp/out.pkpass" "$out"
chmod 644 "$out"
n=$(find "$tmp/pass" -type f | wc -l | tr -d ' ')
printf 'build-pass: %s (%s ficheiros, %s bytes), %s, série %s\n' "$out" "$n" "$(wc -c < "$out" | tr -d ' ')" "$WALLET_PASS_TYPE_ID" "$WALLET_SERIAL"
