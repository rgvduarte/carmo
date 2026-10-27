#!/usr/bin/env python3
"""Checks a built .pkpass the way Wallet reads it, before anyone downloads it:

    python3 wallet/check-pass.py goncalo-carmo.pkpass [--ca root.pem] [--untrusted wwdr.pem]

- the zip: pass.json, manifest.json, signature and icon.png at the top, nothing else than images, pass.strings in
  <language>.lproj folders, no hidden files, no folder entries;
- manifest.json: one SHA-1 for every file but itself and the signature, each one right;
- signature: a detached PKCS #7 (DER) over manifest.json that verifies with openssl (-noverify: the signature itself;
  with --ca, also the chain from the signing certificate up to that root, e.g. Apple's);
- pass.json: valid JSON with formatVersion 1, passTypeIdentifier, serialNumber, teamIdentifier, organizationName,
  description, the identifiers equal to the signing certificate's, colours as rgb(), a QR barcode;
- images: PNG, at Apple's sizes (Human Interface Guidelines, «Wallet»), each @2x and @3x exactly 2 and 3 times @1x.
Standard library and openssl only. Exits 1 and lists what is wrong.
"""
import hashlib
import json
import os
import re
import struct
import subprocess
import sys
import tempfile
import zipfile

args = sys.argv[1:]
if not args or args[0].startswith('-'):
    sys.exit(__doc__)
path, ca, untrusted = args[0], None, None
if '--ca' in args:
    ca = args[args.index('--ca') + 1]
if '--untrusted' in args:
    untrusted = args[args.index('--untrusted') + 1]

bad, good = [], []
ok = lambda c, m: (good if c else bad).append(m)

# points: (min width, max width, min height, max height) at @1x
SIZES = {'icon': (38, 38, 38, 38), 'logo': (50, 160, 50, 50), 'thumbnail': (60, 90, 90, 90)}

z = zipfile.ZipFile(path)
names = z.namelist()
ok(not [n for n in names if n.endswith('/')], 'no folder entries in the zip')
ok(not [n for n in names if os.path.basename(n).startswith('.') or '__MACOSX' in n], 'no hidden files')
for req in ('pass.json', 'manifest.json', 'signature', 'icon.png'):
    ok(req in names, f'{req} at the top of the zip')
allowed = re.compile(r'^(pass\.json|manifest\.json|signature|[a-z]+(@[23]x)?\.png|[A-Za-z-]+\.lproj/(pass\.strings|[a-z]+(@[23]x)?\.png))$')
ok(all(allowed.match(n) for n in names), f'only pass files in the zip ({", ".join(n for n in names if not allowed.match(n)) or "all known"})')

manifest = json.loads(z.read('manifest.json'))
files = [n for n in names if n not in ('manifest.json', 'signature')]
ok(sorted(manifest) == sorted(files), 'manifest.json lists every file and nothing more')
wrong = [n for n in files if manifest.get(n) != hashlib.sha1(z.read(n)).hexdigest()]
ok(not wrong, f'every SHA-1 in manifest.json is right{" (wrong: " + ", ".join(wrong) + ")" if wrong else ""}')

with tempfile.TemporaryDirectory() as t:
    for n in ('manifest.json', 'signature'):
        open(os.path.join(t, n), 'wb').write(z.read(n))
    base = ['openssl', 'smime', '-verify', '-binary', '-inform', 'DER', '-in', os.path.join(t, 'signature'),
            '-content', os.path.join(t, 'manifest.json'), '-out', os.devnull]
    r = subprocess.run(base + ['-noverify'], capture_output=True, text=True)
    ok(r.returncode == 0, f'the signature verifies against manifest.json (openssl smime -verify -noverify){": " + r.stderr.strip() if r.returncode else ""}')
    if ca:
        extra = ['-CAfile', ca, '-purpose', 'any'] + (['-certfile', untrusted] if untrusted else [])
        r = subprocess.run(base + extra, capture_output=True, text=True)
        # openssl only ends a chain at a self-signed root: an intermediate given as --ca fails even when it is right
        ca_names = subprocess.run(['openssl', 'x509', '-in', ca, '-noout', '-subject', '-issuer', '-nameopt', 'RFC2253'],
                               capture_output=True, text=True).stdout.split('\n')
        root = len(ca_names) >= 2 and ca_names[0].removeprefix('subject=').strip() == ca_names[1].removeprefix('issuer=').strip()
        hint = '' if root else f' ({os.path.basename(ca)} is not a root: give the root with --ca and the intermediate with --untrusted)'
        ok(r.returncode == 0, f'the signing certificate chains up to {os.path.basename(ca)}{": " + ((r.stderr.strip() or "failed").splitlines()[0]) + hint if r.returncode else ""}')
    # the signer's certificate, from inside the signature
    r = subprocess.run(['openssl', 'pkcs7', '-inform', 'DER', '-in', os.path.join(t, 'signature'), '-print_certs'],
                       capture_output=True, text=True)
    certs = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', r.stdout, re.S)
    ok(len(certs) >= 2, f'the signature carries the signing certificate and the intermediate ({len(certs)} certificates)')
    subjects = []
    for c in certs:
        s = subprocess.run(['openssl', 'x509', '-noout', '-subject', '-nameopt', 'RFC2253'], input=c, capture_output=True, text=True).stdout
        subjects.append(s.strip().removeprefix('subject=').strip())
    leaf = next((s for s in subjects if 'UID=' in s), subjects[0] if subjects else '')

p = json.loads(z.read('pass.json'))
for k in ('formatVersion', 'passTypeIdentifier', 'serialNumber', 'teamIdentifier', 'organizationName', 'description'):
    ok(k in p and p[k] not in ('', None), f'pass.json has {k}')
ok(p.get('formatVersion') == 1, 'formatVersion is 1')
ok(re.match(r'^pass\.[A-Za-z0-9.-]+$', str(p.get('passTypeIdentifier', ''))) is not None, 'passTypeIdentifier starts with pass.')
ok(re.match(r'^[A-Z0-9]{10}$', str(p.get('teamIdentifier', ''))) is not None, 'teamIdentifier is 10 characters')
uid = re.search(r'(?:^|,)UID=([^,]+)', leaf)
ou = re.search(r'(?:^|,)OU=([^,]+)', leaf)
ok(uid and uid.group(1) == p.get('passTypeIdentifier'), f'passTypeIdentifier is the certificate\'s ({uid.group(1) if uid else "no UID"})')
ok(ou and ou.group(1) == p.get('teamIdentifier'), f'teamIdentifier is the certificate\'s ({ou.group(1) if ou else "no OU"})')
for k in ('backgroundColor', 'foregroundColor', 'labelColor'):
    ok(re.match(r'^rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)$', p.get(k, '')) is not None, f'{k} is rgb(r, g, b)')
codes = p.get('barcodes') or []
ok(codes and codes[0].get('format') == 'PKBarcodeFormatQR' and codes[0].get('message') and codes[0].get('messageEncoding'),
   f'a QR barcode ({codes[0].get("message") if codes else "none"})')
style = [s for s in ('boardingPass', 'coupon', 'eventTicket', 'generic', 'storeCard') if s in p]
ok(len(style) == 1, f'one pass style ({", ".join(style)})')
keys = [f['key'] for s in style for g in p[s].values() if isinstance(g, list) for f in g]
ok(len(keys) == len(set(keys)), 'every field key is unique')


def png_size(b):
    if b[:8] != b'\x89PNG\r\n\x1a\n' or b[12:16] != b'IHDR':
        return None
    return struct.unpack('>II', b[16:24])


for n in sorted(x for x in names if x.endswith('.png')):
    m = re.match(r'^(?:[A-Za-z-]+\.lproj/)?([a-z]+?)(@([23])x)?\.png$', n)
    wh = png_size(z.read(n))
    ok(wh is not None, f'{n} is a PNG')
    if not (m and wh and m.group(1) in SIZES):
        ok(m and m.group(1) in SIZES, f'{n} is an image this style uses')
        continue
    k = int(m.group(3) or 1)
    w0, w1, h0, h1 = SIZES[m.group(1)]
    one = n.replace(m.group(2) or '', '') if m.group(2) else n
    base_wh = png_size(z.read(one)) if one in names else None
    fits = w0 * k <= wh[0] <= w1 * k and h0 * k <= wh[1] <= h1 * k
    same = base_wh is None or (wh[0] == base_wh[0] * k and wh[1] == base_wh[1] * k)
    ok(fits and same, f'{n} is {wh[0]} x {wh[1]} px (@{k}x of {w0}-{w1} x {h0}-{h1} pt)')

for s in [n for n in names if n.endswith('pass.strings')]:
    raw = z.read(s)
    ok(raw[:2] in (b'\xff\xfe', b'\xfe\xff'), f'{s} is UTF-16 with a BOM')
    text = raw.decode('utf-16')
    pairs = re.findall(r'^"((?:[^"\\]|\\.)*)"\s*=\s*"((?:[^"\\]|\\.)*)";\s*$', text, re.M)
    lines = [l for l in text.splitlines() if l.strip() and not l.strip().startswith('/*')]
    ok(len(pairs) == len(lines), f'{s}: every line is "key" = "value"; ({len(pairs)} strings)')

print(f'{path}: {len(good)} checks passed, {len(bad)} failed')
for m in good:
    print('  PASS', m)
for m in bad:
    print('  FAIL', m)
sys.exit(1 if bad else 0)
