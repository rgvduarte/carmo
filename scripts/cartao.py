#!/usr/bin/env python3
"""Static parts of Gonçalo's contact card (/cartao/ and the Apple Wallet pass). Run from the repo root:

    python3 scripts/cartao.py            (needs Pillow and segno: pip install pillow segno)
    node scripts/cartao-images.mjs       (then: the pass logo and icon, drawn from wallet/marca/)

Writes, from assets/js/data.js (SITE), wallet/cartao/pass.json and assets/img/portrait-1600.webp:
  cartao/goncalo-carmo.vcf               vCard 3.0 (the iPhone's own format), CRLF, folded at 75 octets, with the photo
  cartao/qr.svg                          QR code of https://gocarmo.com/cartao/ (no QR service, made here)
  cartao/foto-240.jpg, foto-{240,480}.webp   the square photo of the page
  wallet/cartao/thumbnail{,@2x,@3x}.png  the photo of the pass (90 pt, rounded corners, transparent)
  wallet/cartao/{pt,en}.lproj/pass.strings   the pass in Portuguese and English (UTF-16, as Apple asks)
The photo is a square crop of the portrait around the face: no logos from the shirt.
--check changes nothing and fails when a file would change (QR, vCard text and strings; images are not compared).
"""
import base64
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw
import segno

ROOT = Path(__file__).resolve().parent.parent
CHECK = '--check' in sys.argv
URL = 'https://gocarmo.com/cartao/'
# square crop of portrait-1600.webp (1600 x 2133): hair to collar, the shirt's logos stay out (they start at y 1420)
CROP = (200, 370, 1080, 1250)

DATA = (ROOT / 'assets/js/data.js').read_text(encoding='utf-8')


def site(key):
    m = re.search(rf"^\s*{key}:\s*'([^']*)'", DATA, re.M)
    if not m:
        sys.exit(f'assets/js/data.js: no SITE.{key}')
    return m.group(1)


IG, WA, EMAIL, STRAVA, NAME = site('instagram'), site('whatsapp'), site('email'), site('strava'), site('name')
assert IG == 'goncalo.carmo99' and WA.startswith('351') and len(WA) == 12, 'unexpected SITE values'
PHONE = f'+{WA[:3]} {WA[3:6]} {WA[6:9]} {WA[9:]}'          # +351 916 395 103

changed = []


def write(path, data):
    p = ROOT / path
    old = p.read_bytes() if p.exists() else None
    if old == data:
        return
    changed.append(path)
    if not CHECK:
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)


# ---- QR code ------------------------------------------------------------------------------------------------------
# ECC level Q (25 % can be lost) and the 4-module quiet zone the standard asks for. Dark ink on the site's paper.
qr = segno.make(URL, error='q', micro=False)
buf = io.BytesIO()
qr.save(buf, kind='svg', scale=1, border=4, dark='#111112', light='#f2f1ec', xmldecl=False, svgclass=None,
        lineclass=None, title='gocarmo.com/cartao', omitsize=True)
svg = buf.getvalue().decode('utf-8')
svg = svg.replace('<svg ', '<svg role="img" aria-label="Código QR: gocarmo.com/cartao" shape-rendering="crispEdges" ', 1)
write('cartao/qr.svg', (svg.strip() + '\n').encode('utf-8'))

# ---- photo ----------------------------------------------------------------------------------------------------------
src = Image.open(ROOT / 'assets/img/portrait-1600.webp').convert('RGB').crop(CROP)


def sized(n):
    return src.resize((n, n), Image.LANCZOS)


def img_bytes(im, fmt, **kw):
    b = io.BytesIO()
    im.save(b, fmt, **kw)
    return b.getvalue()


if not CHECK:
    write('cartao/foto-240.jpg', img_bytes(sized(240), 'JPEG', quality=84, optimize=True, progressive=True))
    write('cartao/foto-240.webp', img_bytes(sized(240), 'WEBP', quality=82, method=6))
    write('cartao/foto-480.webp', img_bytes(sized(480), 'WEBP', quality=80, method=6))
    # pass thumbnail: 90 x 90 pt, square with rounded corners, transparent outside them (Apple's guidelines)
    for scale, suffix in ((1, ''), (2, '@2x'), (3, '@3x')):
        n = 90 * scale
        big = 4 * n
        mask = Image.new('L', (big, big), 0)
        ImageDraw.Draw(mask).rounded_rectangle((0, 0, big - 1, big - 1), radius=int(big * 0.16), fill=255)
        im = sized(n).convert('RGBA')
        im.putalpha(mask.resize((n, n), Image.LANCZOS))
        write(f'wallet/cartao/thumbnail{suffix}.png', img_bytes(im, 'PNG', optimize=True))

# ---- vCard 3.0 (RFC 2426) ---------------------------------------------------------------------------------------------


def esc(s):
    return s.replace('\\', '\\\\').replace(',', '\\,').replace(';', '\\;').replace('\n', '\\n')


def fold(line):
    """Lines of at most 75 octets; a continuation starts with one space. Never splits a UTF-8 character."""
    out, cur, room = [], b'', 75
    for ch in line:
        c = ch.encode('utf-8')
        if len(cur) + len(c) > room:
            out.append(cur)
            cur, room = b'', 74          # the leading space takes one octet
        cur += c
    out.append(cur)
    return b'\r\n '.join(out)


# about 40 KB of JPEG: enough for the contact photo, small enough for AirDrop and Android imports
q, photo = 86, b''
while q >= 60:
    photo = img_bytes(sized(400), 'JPEG', quality=q, optimize=True)
    if len(photo) <= 45_000:
        break
    q -= 4
first, last = NAME.split(' ', 1)[0], NAME.split(' ', 1)[1]
lines = [
    'BEGIN:VCARD',
    'VERSION:3.0',
    f'N:{esc(last)};{esc(first)};;;',
    f'FN:{esc(NAME)}',
    'ORG:GOCARMO',
    'TITLE:Triatleta',
    f'TEL;TYPE=CELL,VOICE:{PHONE}',
    f'EMAIL;TYPE=INTERNET:{EMAIL}',
    'URL:https://gocarmo.com/',
    f'X-SOCIALPROFILE;TYPE=instagram;X-USER={IG}:https://www.instagram.com/{IG}/',
    f'item1.URL:https://www.instagram.com/{IG}/',
    'item1.X-ABLabel:Instagram',
    f'item2.URL:{STRAVA}',
    'item2.X-ABLabel:Strava',
    f'NOTE:{esc("Espaços no fato e no capacete para a época 2027: gocarmo.com/#fato")}',
    'PHOTO;ENCODING=b;TYPE=JPEG:' + base64.b64encode(photo).decode('ascii'),
    'END:VCARD',
]
vcf = b'\r\n'.join(fold(l) for l in lines) + b'\r\n'
write('cartao/goncalo-carmo.vcf', vcf)

# ---- pass.strings ---------------------------------------------------------------------------------------------------
# pass.json holds the Portuguese text. Each string is also a key: pt.lproj maps it to itself, en.lproj to English, so
# both files hold the same keys (what Apple asks for). A device in another language gets one of the two.
EN = {
    'Cartão de contacto de Gonçalo Carmo': "Gonçalo Carmo's contact card",
    'ÉPOCA': 'SEASON',
    'TRIATLETA · LISBOA': 'TRIATHLETE · LISBON',
    'TELEFONE': 'PHONE',
    'EMAIL': 'EMAIL',
    'INSTAGRAM': 'INSTAGRAM',
    'IRONMAN PORTUGAL-CASCAIS': 'IRONMAN PORTUGAL-CASCAIS',
    'Telefone e WhatsApp': 'Phone and WhatsApp',
    'WhatsApp': 'WhatsApp',
    'Email': 'Email',
    'Instagram': 'Instagram',
    'Site': 'Website',
    'Strava': 'Strava',
    'Patrocínio': 'Sponsorship',
    'Espaços no fato e no capacete para a época 2027: gocarmo.com/#fato':
        'Spots on the suit and helmet for the 2027 season: gocarmo.com/#fato',
    "Espaços no fato e no capacete para a época 2027: <a href='https://gocarmo.com/#fato'>gocarmo.com/#fato</a>":
        "Spots on the suit and helmet for the 2027 season: <a href='https://gocarmo.com/#fato'>gocarmo.com/#fato</a>",
    'Guardar o contacto': 'Save the contact',
}
P = json.loads((ROOT / 'wallet/cartao/pass.json').read_text(encoding='utf-8'))
used = [P['description']]
for group in P['generic'].values():
    for f in group:
        used += [f[k] for k in ('label', 'value', 'attributedValue') if isinstance(f.get(k), str)]
keys = list(dict.fromkeys(s for s in used if s in EN))
missing = [s for s in used if re.search(r'[a-zà-ú]{3}', s, re.I) and s not in EN and s not in (NAME,)
           and not re.match(r'^[@+]|^\S+\.(com|me)\b|^<a ', s)]
if missing:
    sys.exit(f'pass.json has text with no English in scripts/cartao.py: {missing}')
unused = [k for k in EN if k not in used]
if unused:
    sys.exit(f'scripts/cartao.py has English for text that is no longer in pass.json: {unused}')


def q_(s):
    return '"' + s.replace('\\', '\\\\').replace('"', '\\"') + '"'


for lang, table in (('pt', {k: k for k in keys}), ('en', EN)):
    body = f'/* Gonçalo Carmo · cartão de contacto ({lang}). Made by scripts/cartao.py from wallet/cartao/pass.json */\n'
    body += ''.join(f'{q_(k)} = {q_(table[k])};\n' for k in keys)
    write(f'wallet/cartao/{lang}.lproj/pass.strings', b'\xff\xfe' + body.encode('utf-16-le'))

if CHECK:
    if changed:
        sys.exit(f'out of date: {", ".join(changed)}. Run python3 scripts/cartao.py')
    print('cartao: up to date')
else:
    print(f'cartao: {len(changed)} file(s) written{": " + ", ".join(changed) if changed else ""}; '
          f'vCard {len(vcf)} bytes (photo {len(photo)} bytes, JPEG q{q}); QR version {qr.version}, ECC {qr.error}')
