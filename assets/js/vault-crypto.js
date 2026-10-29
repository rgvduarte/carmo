// The cofre's cryptography (/admin/documentos/ and scripts/docs-publish.mjs), shared by the page and the publisher.
// It imports nothing and touches no DOM, so Node loads it from a data: URL the way stamp.mjs loads modules; it uses only
// globalThis.crypto (WebCrypto), TextEncoder and TextDecoder.
//
// The scheme (README, «Documentos»):
// - the vault is an ECDH P-256 key pair made in the owner's browser. Its private key is kept in vault.json as PKCS#8,
//   sealed with AES-256-GCM under a key from the passphrase (PBKDF2-SHA-256, at least 600 000 iterations, 16-byte
//   salt); the AAD names the kid and the public point, so the sealed key cannot be paired with another public key;
// - a 32-byte AES key (one per file version, and a fresh one for the manifest on every publish) is wrapped to the
//   public key with a fresh ephemeral key each time (ECIES): Z = ECDH(e, vault), KW = HKDF-SHA-256(Z, salt epk‖rpk,
//   info "gocarmo cofre v1 wrap <purpose>"), AES-GCM with the same string as AAD. purpose is file:<fid> or
//   manifest:<kid>, so a wrapped key cannot be moved to another file;
// - files are cut in 8 MiB chunks; each is "GCC1" ‖ IV (12, fresh) ‖ AES-GCM with AAD "gocarmo cofre v1 chunk <fid>
//   <i> <n>" (a chunk moved to another file or place, or a changed count, fails); the last one is padded with zeros to
//   a multiple of 64 KiB;
// - the manifest (titles, versions, wrapped file keys) is JSON padded with spaces to a multiple of 4 KiB and sealed
//   with its own key, AAD "gocarmo cofre v1 manifest <kid>".

export const V = Object.freeze({
  CHUNK: 8388608,        // plaintext bytes per chunk (8 MiB)
  PAD: 65536,            // the last chunk is padded to a multiple of this (64 KiB)
  ITER: 1000000,         // PBKDF2 iterations for a new vault or a rewrap
  ITER_MIN: 600000,      // below this a vault.json is refused
  MAX_FILE: 104857600,   // the publisher refuses bigger files (100 MiB)
  KEEP: 3,               // versions kept per document
  PASS_MIN: 16,          // minimum passphrase length, in characters after NFC
});
const ITER_MAX = 50000000;   // a vault.json asking for more is refused: a phone would hang on it
const ALG = 'ECDH-P256/HKDF-SHA256/A256GCM';
const MANIFEST_PAD = 4096;
const MAGIC = [0x47, 0x43, 0x43, 0x31];   // "GCC1"
const WK_LEN = 1 + 65 + 12 + 48;

// code: 'frase' (wrong passphrase), 'estragado' (corrupted or changed), 'versao' (a format this code does not know),
// 'cofre' (vault.json not usable), 'curta' (passphrase too short)
export class VaultError extends Error {
  constructor(code, message) { super(message || code); this.name = 'VaultError'; this.code = code; }
}

const subtle = () => {
  const s = globalThis.crypto && globalThis.crypto.subtle;
  if (!s) throw new VaultError('versao', 'WebCrypto is not available here');
  return s;
};
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });
const utf8 = (s) => enc.encode(s);
const rand = (n) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const cat = (...xs) => { const out = new Uint8Array(xs.reduce((a, x) => a + x.length, 0)); let o = 0; for (const x of xs) { out.set(x, o); o += x.length; } return out; };
const wipe = (x) => { try { if (x && x.fill) x.fill(0); } catch (_) {} };
const u8 = (x) => (x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : ArrayBuffer.isView(x) ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : null);

// ---------- encodings ----------
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64I = (() => { const t = new Int16Array(128).fill(-1); for (let i = 0; i < 64; i++) t[B64.charCodeAt(i)] = i; t['-'.charCodeAt(0)] = 62; t['_'.charCodeAt(0)] = 63; return t; })();
// standard base64 with padding
export function b64(bytes) {
  const b = u8(bytes);
  let s = '';
  let i = 0;
  for (; i + 2 < b.length; i += 3) { const n = (b[i] << 16) | (b[i + 1] << 8) | b[i + 2]; s += B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]; }
  if (i < b.length) {
    const n = (b[i] << 16) | ((i + 1 < b.length ? b[i + 1] : 0) << 8);
    s += B64[n >> 18] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : '=') + '=';
  }
  return s;
}
// base64 or base64url, padding optional; anything else throws
export function unb64(str) {
  if (typeof str !== 'string') throw new VaultError('estragado', 'not base64');
  const s = str.replace(/=+$/, '');
  if (s.length % 4 === 1) throw new VaultError('estragado', 'not base64');
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let o = 0, acc = 0, bits = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i), v = c < 128 ? B64I[c] : -1;
    if (v < 0) throw new VaultError('estragado', 'not base64');
    acc = (acc << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out[o++] = (acc >> bits) & 255; }
  }
  return out;
}
export const hex = (bytes) => Array.from(u8(bytes), (x) => x.toString(16).padStart(2, '0')).join('');

// ---------- vault.json ----------
const KID_RE = /^[0-9a-f]{16}$/;
const FID_RE = /^[0-9a-f]{32}$/;
const B64URL32 = /^[A-Za-z0-9_-]{43}$/;
const isB64 = (s, n) => { try { return typeof s === 'string' && unb64(s).length === n; } catch (_) { return false; } };
const isIso = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s));

// the public half: { kty, crv, x, y } of P-256, no private part
function pubProblems(pub) {
  if (!pub || typeof pub !== 'object') return ['pub em falta'];
  const out = [];
  if (pub.kty !== 'EC') out.push('pub.kty não é EC');
  if (pub.crv !== 'P-256') out.push('pub.crv não é P-256');
  if (!B64URL32.test(String(pub.x)) || !B64URL32.test(String(pub.y))) out.push('pub.x ou pub.y com o tamanho errado');
  if ('d' in pub) out.push('pub tem a parte privada (d): este ficheiro nunca a pode ter');
  return out;
}
// [] when the vault is usable; otherwise short reasons (PT, for the page's «O vault.json não é válido (…)»)
export function checkVault(vault) {
  if (!vault || typeof vault !== 'object' || Array.isArray(vault)) return ['não é um objeto JSON'];
  const out = [];
  if (vault.v !== 1) out.push(`versão ${JSON.stringify(vault.v)} desconhecida`);
  if (!KID_RE.test(String(vault.kid))) out.push('kid não são 16 hexadecimais');
  if (!isIso(vault.created)) out.push('created em falta');
  if (!isIso(vault.updated)) out.push('updated em falta');
  out.push(...pubProblems(vault.pub));
  const k = vault.kdf;
  if (!k || typeof k !== 'object') out.push('kdf em falta');
  else {
    if (k.name !== 'PBKDF2' || k.hash !== 'SHA-256') out.push('kdf não é PBKDF2 com SHA-256');
    if (!Number.isInteger(k.iterations) || k.iterations < V.ITER_MIN) out.push(`menos de ${V.ITER_MIN} iterações`);
    else if (k.iterations > ITER_MAX) out.push('iterações a mais');
    if (!isB64(k.salt, 16)) out.push('salt não tem 16 bytes');
  }
  const w = vault.wrap;
  if (!w || typeof w !== 'object') out.push('wrap em falta');
  else {
    if (w.alg !== 'A256GCM') out.push('wrap.alg não é A256GCM');
    if (!isB64(w.iv, 12)) out.push('wrap.iv não tem 12 bytes');
    let n = 0; try { n = unb64(w.ct).length; } catch (_) {}
    if (n < 16 + 32 || n > 2048) out.push('wrap.ct com um tamanho impossível');
  }
  return out;
}
const vaultAad = (kid, pub) => utf8(`gocarmo cofre v1 vault ${kid} ${pub.x}.${pub.y}`);

const rawOfJwk = (pub) => cat(new Uint8Array([4]), unb64(pub.x), unb64(pub.y));
// SHA-256 of the raw public point (04‖x‖y), first 16 bytes, 8 groups of 4 hex digits
export async function fingerprint(pubJwk) {
  const p = pubProblems(pubJwk);
  if (p.length) throw new VaultError('cofre', p.join('; '));
  const h = new Uint8Array(await subtle().digest('SHA-256', rawOfJwk(pubJwk))).slice(0, 16);
  return hex(h).match(/.{4}/g).join(' ');
}

function passBytes(pass, { check = true } = {}) {
  if (typeof pass !== 'string') throw new VaultError('curta', 'passphrase missing');
  const s = pass.normalize('NFC');
  if (!s) throw new VaultError(check ? 'curta' : 'frase', 'passphrase missing');
  if (check && [...s].length < V.PASS_MIN) throw new VaultError('curta', `at least ${V.PASS_MIN} characters`);
  return utf8(s);
}
async function kek(pass, salt, iterations, use, check) {
  const pw = passBytes(pass, { check });
  try {
    const base = await subtle().importKey('raw', pw, 'PBKDF2', false, ['deriveKey']);
    return await subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, { name: 'AES-GCM', length: 256 }, false, [use]);
  } finally { wipe(pw); }
}
const ECDH = { name: 'ECDH', namedCurve: 'P-256' };
const nonExtractable = (pkcs8) => subtle().importKey('pkcs8', pkcs8, ECDH, false, ['deriveBits']);

async function seal(pkcs8, { kid, pub, pass, iterations }) {
  const salt = rand(16), iv = rand(12);
  const key = await kek(pass, salt, iterations, 'encrypt', true);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: vaultAad(kid, pub) }, key, pkcs8));
  return { kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64(salt) }, wrap: { alg: 'A256GCM', iv: b64(iv), ct: b64(ct) } };
}
// the PKCS#8 bytes of the private key, checked against pub; the caller wipes them
async function openPkcs8(vault, pass) {
  const bad = checkVault(vault);
  if (bad.length) throw new VaultError('cofre', bad.join('; '));
  const key = await kek(pass, unb64(vault.kdf.salt), vault.kdf.iterations, 'decrypt', false);
  let pkcs8;
  try {
    pkcs8 = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: unb64(vault.wrap.iv), additionalData: vaultAad(vault.kid, vault.pub) }, key, unb64(vault.wrap.ct)));
  } catch (_) { throw new VaultError('frase', 'the passphrase does not open this vault'); }
  let jwk;
  try {
    const k = await subtle().importKey('pkcs8', pkcs8, ECDH, true, ['deriveBits']);
    jwk = await subtle().exportKey('jwk', k);
  } catch (_) { wipe(pkcs8); throw new VaultError('estragado', 'the private key does not import'); }
  const same = jwk.x === vault.pub.x && jwk.y === vault.pub.y && jwk.crv === 'P-256';
  delete jwk.d;
  if (!same) { wipe(pkcs8); throw new VaultError('estragado', 'the private key does not match pub'); }
  return pkcs8;
}

// a new key pair sealed with the passphrase -> { vault, privateKey (non-extractable), kid, fingerprint }
export async function newVault(passphrase, { iterations = V.ITER, now = new Date() } = {}) {
  passBytes(passphrase);   // 'curta' before any work
  if (!Number.isInteger(iterations) || iterations < V.ITER_MIN || iterations > ITER_MAX) throw new VaultError('cofre', 'iterations out of range');
  const pair = await subtle().generateKey(ECDH, true, ['deriveBits']);
  const full = await subtle().exportKey('jwk', pair.publicKey);
  const pub = { kty: 'EC', crv: 'P-256', x: full.x, y: full.y };
  const kid = hex(rand(8));
  const pkcs8 = new Uint8Array(await subtle().exportKey('pkcs8', pair.privateKey));
  try {
    const sealed = await seal(pkcs8, { kid, pub, pass: passphrase, iterations });
    const at = new Date(now).toISOString();
    const vault = { v: 1, kid, created: at, updated: at, pub, ...sealed };
    const privateKey = await nonExtractable(pkcs8);
    return { vault, privateKey, kid, fingerprint: await fingerprint(pub) };
  } finally { wipe(pkcs8); }
}

// the passphrase -> the private key, non-extractable (VaultError 'frase' when it does not open the vault)
export async function unlockVault(vault, passphrase) {
  const pkcs8 = await openPkcs8(vault, passphrase);
  try { return await nonExtractable(pkcs8); } finally { wipe(pkcs8); }
}

// the same key pair (kid, pub, created) sealed with a new passphrase, a new salt and IV
export async function rewrapVault(vault, oldPass, newPass, { iterations = V.ITER, now = new Date() } = {}) {
  passBytes(newPass);
  const pkcs8 = await openPkcs8(vault, oldPass);
  try {
    const it = Math.max(iterations, vault.kdf.iterations);
    const sealed = await seal(pkcs8, { kid: vault.kid, pub: vault.pub, pass: newPass, iterations: it });
    return { v: 1, kid: vault.kid, created: vault.created, updated: new Date(now).toISOString(), pub: { ...vault.pub }, ...sealed };
  } finally { wipe(pkcs8); }
}

// the vault's public key -> { key: CryptoKey, raw: 65 bytes }
export async function importPublic(vault) {
  const pub = vault && vault.pub ? vault.pub : vault;
  const p = pubProblems(pub);
  if (p.length) throw new VaultError('cofre', p.join('; '));
  const key = await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: pub.x, y: pub.y, ext: true }, ECDH, true, []);
  return { key, raw: new Uint8Array(await subtle().exportKey('raw', key)) };
}

// ---------- key wrapping (ECIES) ----------
const wrapLabel = (purpose) => {
  if (typeof purpose !== 'string' || !/^(file:[0-9a-f]{32}|manifest:[0-9a-f]{16})$/.test(purpose)) throw new VaultError('versao', `purpose ${purpose}`);
  return utf8(`gocarmo cofre v1 wrap ${purpose}`);
};
async function wrapKeyKw(z, epk, rpk, label, use) {
  const ikm = await subtle().importKey('raw', z, 'HKDF', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: cat(epk, rpk), info: label }, ikm, { name: 'AES-GCM', length: 256 }, false, [use]);
}
// a 32-byte key wrapped to the vault's public key for one purpose -> base64 of 0x01 ‖ epk(65) ‖ iv(12) ‖ ct(48)
export async function wrapKey(pub, keyBytes, purpose) {
  const k = u8(keyBytes);
  if (!k || k.length !== 32) throw new VaultError('versao', 'a key is 32 bytes');
  if (!pub || !pub.key || !pub.raw) throw new VaultError('cofre', 'use importPublic(vault) first');
  const label = wrapLabel(purpose);
  const e = await subtle().generateKey(ECDH, true, ['deriveBits']);
  const epk = new Uint8Array(await subtle().exportKey('raw', e.publicKey));
  const z = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: pub.key }, e.privateKey, 256));
  try {
    const kw = await wrapKeyKw(z, epk, pub.raw, label, 'encrypt');
    const iv = rand(12);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: label }, kw, k));
    return b64(cat(new Uint8Array([1]), epk, iv, ct));
  } finally { wipe(z); }
}
// the wrapped key -> an AES-GCM CryptoKey, non-extractable, for decrypting
export async function unwrapKey(privateKey, pub, wk, purpose) {
  const label = wrapLabel(purpose);
  let b;
  try { b = unb64(wk); } catch (_) { throw new VaultError('estragado', 'wrapped key is not base64'); }
  if (b.length !== WK_LEN) throw new VaultError('estragado', 'wrapped key has the wrong size');
  if (b[0] !== 1) throw new VaultError('versao', `wrapped key version ${b[0]}`);
  const epk = b.subarray(1, 66), iv = b.subarray(66, 78), ct = b.subarray(78);
  let k, z;
  try {
    const ek = await subtle().importKey('raw', epk, ECDH, false, []);
    z = new Uint8Array(await subtle().deriveBits({ name: 'ECDH', public: ek }, privateKey, 256));
    const kw = await wrapKeyKw(z, epk, pub.raw, label, 'decrypt');
    k = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: label }, kw, ct));
  } catch (_) { throw new VaultError('estragado', 'the wrapped key does not open'); } finally { wipe(z); }
  try { return await subtle().importKey('raw', k, 'AES-GCM', false, ['decrypt']); } finally { wipe(k); }
}

// ---------- files ----------
export const chunkCount = (size) => Math.max(1, Math.ceil(size / V.CHUNK));
export const paddedLength = (len) => Math.min(V.CHUNK, Math.max(V.PAD, Math.ceil(len / V.PAD) * V.PAD));
// bytes of plaintext in chunk i of a file of `size` bytes
export const plainLength = (size, i) => (i < chunkCount(size) - 1 ? V.CHUNK : size - (chunkCount(size) - 1) * V.CHUNK);
export const newFid = () => hex(rand(16));
export const newFileKey = () => rand(32);
// a file key (32 bytes) as a CryptoKey for encryptChunk/decryptChunk (the publisher; the page gets it from unwrapKey)
export const fileKey = (bytes, uses = ['encrypt', 'decrypt']) => subtle().importKey('raw', u8(bytes), 'AES-GCM', false, uses);
const chunkAad = ({ fid, i, n }) => {
  if (!FID_RE.test(String(fid)) || !Number.isInteger(i) || !Number.isInteger(n) || n < 1 || i < 0 || i >= n) throw new VaultError('versao', 'chunk position');
  return utf8(`gocarmo cofre v1 chunk ${fid} ${i} ${n}`);
};
const asKey = async (k, use) => (k instanceof Uint8Array || k instanceof ArrayBuffer ? fileKey(k, [use]) : k);

// one chunk -> "GCC1" ‖ iv ‖ AES-GCM. A chunk before the last holds exactly CHUNK bytes; the last one (any length up
// to CHUNK) is padded here with zeros to paddedLength (padding it before is fine: the length stays the same).
export async function encryptChunk(aesKey, plain, { fid, i, n }) {
  const aad = chunkAad({ fid, i, n });
  let p = u8(plain);
  if (!p) throw new VaultError('versao', 'plaintext is not bytes');
  if (i < n - 1 && p.length !== V.CHUNK) throw new VaultError('versao', `chunk ${i} of ${n} must hold ${V.CHUNK} bytes`);
  if (p.length > V.CHUNK) throw new VaultError('versao', 'chunk too big');
  const copied = i === n - 1 && p.length !== paddedLength(p.length);
  if (copied) { const q = new Uint8Array(paddedLength(p.length)); q.set(p); p = q; }
  const iv = rand(12);
  try {
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: aad }, await asKey(aesKey, 'encrypt'), p));
    return cat(new Uint8Array(MAGIC), iv, ct);
  } finally { if (copied) wipe(p); }
}
// "GCC1" ‖ iv ‖ ct -> the plaintext (the last chunk sliced to its real length when `size`, the file's, is given)
export async function decryptChunk(aesKey, bytes, { fid, i, n, size } = {}) {
  const aad = chunkAad({ fid, i, n });
  const b = u8(bytes);
  if (!b || b.length < 4 + 12 + 16) throw new VaultError('estragado', 'chunk too short');
  if (b[0] !== MAGIC[0] || b[1] !== MAGIC[1] || b[2] !== MAGIC[2] || b[3] !== MAGIC[3]) {
    const other = b[0] === MAGIC[0] && b[1] === MAGIC[1] && b[2] === MAGIC[2] && b[3] >= 0x32 && b[3] <= 0x39;
    throw new VaultError(other ? 'versao' : 'estragado', 'not a cofre chunk');
  }
  let p;
  try {
    p = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: b.subarray(4, 16), additionalData: aad }, await asKey(aesKey, 'decrypt'), b.subarray(16)));
  } catch (_) { throw new VaultError('estragado', `chunk ${i} does not open`); }
  if (size === undefined) return p;
  if (chunkCount(size) !== n) throw new VaultError('estragado', 'size and chunk count disagree');
  const len = plainLength(size, i);
  if (len > p.length || (i === n - 1 ? p.length !== paddedLength(len) : p.length !== V.CHUNK)) throw new VaultError('estragado', `chunk ${i} has the wrong length`);
  return len === p.length ? p : p.subarray(0, len);
}

// ---------- the manifest ----------
const manifestAad = (kid) => utf8(`gocarmo cofre v1 manifest ${kid}`);
// the manifest object -> the envelope of manifest.json (a fresh manifest key every time)
export async function sealManifest(pub, kid, manifestObj) {
  if (!KID_RE.test(String(kid))) throw new VaultError('cofre', 'kid');
  const text = JSON.stringify(manifestObj);
  const body = utf8(text);
  const len = Math.max(MANIFEST_PAD, Math.ceil(body.length / MANIFEST_PAD) * MANIFEST_PAD);
  const plain = new Uint8Array(len).fill(0x20);
  plain.set(body);
  const mk = newFileKey();
  try {
    const key = await wrapKey(pub, mk, `manifest:${kid}`);
    const iv = rand(12);
    const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: manifestAad(kid) }, await fileKey(mk, ['encrypt']), plain));
    return { v: 1, kid, alg: ALG, key, iv: b64(iv), ct: b64(ct) };
  } finally { wipe(mk); }
}
// the envelope -> the manifest object ('versao' for an unknown format, 'estragado' when it does not open)
export async function openManifest(privateKey, pub, env) {
  if (!env || typeof env !== 'object' || env.v !== 1 || env.alg !== ALG) throw new VaultError('versao', 'manifest format');
  if (!KID_RE.test(String(env.kid)) || !isB64(env.iv, 12) || typeof env.ct !== 'string') throw new VaultError('estragado', 'manifest envelope');
  const mk = await unwrapKey(privateKey, pub, env.key, `manifest:${env.kid}`);
  let plain;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: unb64(env.iv), additionalData: manifestAad(env.kid) }, mk, unb64(env.ct));
  } catch (_) { throw new VaultError('estragado', 'manifest does not open'); }
  let obj;
  try { obj = JSON.parse(dec.decode(plain).trimEnd()); } catch (_) { throw new VaultError('estragado', 'manifest is not JSON'); }
  if (!obj || typeof obj !== 'object') throw new VaultError('estragado', 'manifest is not an object');
  if (obj.v !== 1) throw new VaultError('versao', `manifest version ${obj.v}`);
  if (obj.kid !== env.kid) throw new VaultError('estragado', 'manifest kid');
  return obj;
}

// ---------- small helpers ----------
// SHA-256 of bytes, lowercase hex
export async function sha256hex(bytes) { return hex(new Uint8Array(await subtle().digest('SHA-256', u8(bytes)))); }
// does this private key belong to the vault's public key? (a remembered key after a new vault, for instance)
export async function keyMatches(privateKey, vault) {
  try {
    const pub = await importPublic(vault), probe = newFileKey(), fid = newFid();
    const k = await unwrapKey(privateKey, pub, await wrapKey(pub, probe, `file:${fid}`), `file:${fid}`);
    const sample = await encryptChunk(probe, new Uint8Array(1), { fid, i: 0, n: 1 });
    await decryptChunk(k, sample, { fid, i: 0, n: 1 });
    return true;
  } catch (_) { return false; }
}
