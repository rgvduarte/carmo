// The cofre's storage for /admin/documentos/: reading the orphan branch «docs» of rgvduarte/carmo, the page's two kinds
// of commit to it (the vault's creation, a passphrase change or a new key pair), and the key remembered in IndexedDB.
//
// Reads: the branch head from api.github.com (with the admin token when this browser has one: 5000 requests an hour;
// otherwise without, 60), then every file at that commit.
// - With a token: through the API, GET /contents/<path>?ref=<sha> with the raw media type (ghBytes() of admin-gh.js).
//   This is the only way into a private repository: raw.githubusercontent.com refuses the preflight a token needs.
// - Without one: from raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>, which serves a PUBLIC repository only. A
//   commit URL never changes, so its 5-minute cache never mixes an old manifest with new files. It answers simple GETs
//   with Access-Control-Allow-Origin: * and refuses preflights (403), so these reads carry no header, no credentials
//   and no Range.
// A private repository answers 404 to every read without a token, the same as a missing branch: a 404 on the branch
// is only «no cofre yet» once the repository itself is visible; otherwise the page asks for the token (needToken), and
// never offers to create a cofre. Nor does a branch whose vault.json did not read: the tree is asked first (unread).
// When the API is rate-limited the page reads the branch by name (…/docs/<path>) from raw.githubusercontent.com, which
// may be up to 5 minutes old (public repository only); without a token, a vault.json not found there asks for the
// token too (a private repository, or no cofre: either way the token's own limit gets in).
// Writes go through gh() of admin-gh.js (the admin's token), never commitFiles(), which is bound to gh-pages. The
// publisher (scripts/docs-publish.mjs) force-pushes the branch as one orphan commit and carries vault.json byte for byte;
// the page only ever writes vault.json (and README.md when it creates the branch), and never over a vault.json it
// could not read.
import { gh, ghBytes, ghFailure, getToken, setToken, GhError, UiError, transient } from './admin-gh.js';
import { REPO } from './admin-core.js';
import { BRANCH_README } from './vault-crypto.js';

export const BRANCH = 'docs';
export const API = `https://api.github.com/repos/${REPO}`;
export const RAW = `https://raw.githubusercontent.com/${REPO}`;

export class Missing extends Error { constructor(path) { super(`${path} is not there`); this.path = path; } }

export const vaultText = (vault) => `${JSON.stringify(vault, null, 2)}\n`;

// the same text the publisher writes (vault-crypto.js): one README for the branch, whoever writes it
export const README = BRANCH_README;

// ---------- reading ----------
const plainGet = { credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors' };

// a GET of the API without the token -> the Response when it is ok or 404; a GhError otherwise (.rate on a rate limit)
async function getPlain(path) {
  let res;
  try { res = await fetch(`${API}${path}`, { ...plainGet, cache: 'no-store' }); } catch (_) { throw new GhError(0, 'network'); }
  if (res.ok || res.status === 404) return res;
  throw await ghFailure(res);
}
// Whether the repository itself answers, with the token in use or without one. A private repository is 404 to anyone it
// is not shared with, so a 404 on the branch means «no branch» only when this is true.
async function repoVisible(withToken) {
  if (!withToken) return (await getPlain('')).ok;
  try { await gh('GET', ''); return true; } catch (e) { if (e instanceof GhError && e.status === 404) return false; throw e; }
}

// the head of «docs» -> { sha } | { sha: null } (no branch) | { sha: null, fallback: true, rate } (rate-limited: read by name)
//   | { sha: null, needToken: true } (a private repository: the page asks for the token and never offers to create a
//   cofre). tokenNoAccess / tokenExpired, on any of them: this browser's token was set aside, and why (the page then
//   forgets it: it would only be refused again, here and on Espaços).
export async function readHead() {
  try { return await headOf(); } catch (e) {
    if (e instanceof GhError && e.rate) return { sha: null, fallback: true, rate: e.rate };
    throw e;
  }
}
async function headOf() {
  let dropped = {};
  if (getToken()) {
    try { return { sha: (await gh('GET', `/git/ref/heads/${BRANCH}`)).object.sha }; } catch (e) {
      if (!(e instanceof GhError) || e.rate) throw e;
      if (e.status === 404) {
        if (await repoVisible(true)) return { sha: null };
        // the token does not reach the repository: out of use, like an expired one, and the page asks for another
        setToken(null);
        return { sha: null, needToken: true, tokenNoAccess: true };
      }
      if (e.status !== 401 && e.status !== 403) throw e;
      // 401: expired or revoked; 403 (not a rate limit): it sees the repository but may not read it (no Contents).
      // Read without it: a public repository still opens (a new token is asked for only to write), a private one asks
      // for it now
      setToken(null);
      dropped = e.status === 401 ? { tokenExpired: true } : { tokenNoAccess: true };
    }
  }
  try {
    const res = await getPlain(`/git/ref/heads/${BRANCH}`);
    if (res.status === 404) return (await repoVisible(false)) ? { sha: null, ...dropped } : { sha: null, needToken: true, ...dropped };
    let json = null;
    try { json = await res.json(); } catch (_) {}
    // GitHub answers a missing ref with the refs that start with it (an array): that is no branch
    if (!json || Array.isArray(json) || !json.object || !/^[0-9a-f]{40}$/.test(json.object.sha)) return { sha: null, ...dropped };
    return { sha: json.object.sha, ...dropped };
  } catch (e) {
    // the same fallback as readHead(), keeping why the token was set aside
    if (e instanceof GhError && e.rate) return { sha: null, fallback: true, rate: e.rate, ...dropped };
    throw e;
  }
}

// bytes -> what readRaw() was asked for
function as_(bytes, as) {
  if (as === 'bytes') return bytes;
  const t = new TextDecoder().decode(bytes);
  if (as === 'text') return t;
  try { return { json: JSON.parse(t), text: t }; } catch (_) { return { json: undefined, text: t }; }
}
// one file of the branch at `ref` (a commit sha, or the branch name in the fallback) -> Uint8Array | string | object
// With a token: through the API, which also reads a private repository (the 404 of a file that is not there is still
// Missing). The branch name is the rate-limit fallback, where the API is what ran out: that read stays on raw.
export async function readRaw(ref, path, { signal, as = 'bytes' } = {}) {
  if (getToken() && ref !== BRANCH) {
    let bytes;
    try { bytes = await ghBytes(`/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, { signal }); } catch (e) {
      if (e instanceof GhError && e.status === 404) throw new Missing(path);
      throw e;
    }
    return as_(bytes, as);
  }
  let res;
  try { res = await fetch(`${RAW}/${ref}/${path}`, { ...plainGet, cache: ref === BRANCH ? 'no-cache' : 'default', signal }); } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new GhError(0, 'network');
  }
  if (res.status === 404) throw new Missing(path);
  if (!res.ok) throw new GhError(res.status, 'raw');
  return as_(new Uint8Array(await res.arrayBuffer()), as);
}
const maybe = async (p) => { try { return await p; } catch (e) { if (e instanceof Missing) return null; throw e; } };

// whether the tree at `head` holds a vault.json, asked of the API itself (the commit, then its tree: a few entries);
// get: a GET of the API -> its JSON (a GhError when it is not ok), with the token by default
async function treeHasVault(head, get = (path) => gh('GET', path)) {
  const c = await get(`/git/commits/${head}`);
  const t = await get(`/git/trees/${c.tree.sha}`);
  return !!(t && Array.isArray(t.tree) && t.tree.some((e) => e && e.path === 'vault.json'));
}
const plainJson = async (path) => {
  const res = await getPlain(path);
  if (res.status === 404) throw new GhError(404, 'Not Found');
  return res.json();
};
// The branch is there and its vault.json did not read: is there one? -> true (or maybe: the commit left the branch in
// between, a publish, whose tree always holds one) | false | null (read without a token, the repository stopped
// answering: it went private)
async function vaultInTree(head) {
  const withToken = !!getToken();
  try { return await treeHasVault(head, withToken ? undefined : plainJson); } catch (e) {
    if (!(e instanceof GhError) || e.status !== 404) throw e;
    if (!withToken && !(await repoVisible(false))) return null;
    return true;
  }
}

// the branch as the page needs it -> { sha, ref, fallback, rate, vault, vaultText, envelope, tokenNoAccess, tokenExpired }
//   vault/vaultText null: no cofre yet; envelope null: nothing published yet; vault undefined with vaultText: not JSON
//   needToken: a private repository that this browser cannot read yet (rate: the limit without a token ran out)
//   unread: the branch holds a vault.json that did not read (the page offers «Tentar outra vez», never «create»)
export async function loadBranch() {
  const head = await readHead();
  const none = { sha: null, ref: null, fallback: false, rate: null, vault: null, vaultText: null, envelope: null, tokenNoAccess: !!head.tokenNoAccess, tokenExpired: !!head.tokenExpired };
  if (head.needToken) return { ...none, needToken: true };
  const ref = head.sha || (head.fallback ? BRANCH : null);
  if (!ref) return none;
  const v = await maybe(readRaw(ref, 'vault.json', { as: 'json' }));
  if (!v && head.fallback) {
    // rate-limited, read by name from raw.githubusercontent.com: 404 there is a private repository or no cofre. Without
    // a token, only the token gets in now (its own 5000 an hour); with one, the page says when to try again
    return getToken() ? { ...none, ref, fallback: true, rate: head.rate } : { ...none, needToken: true, rate: head.rate };
  }
  if (!v) {
    // A vault.json that did not read is never «no cofre» until the tree says so: a raw read a moment behind a push, a
    // repository made private in between. Creating would put a new vault.json over the real one.
    const there = await vaultInTree(head.sha);
    if (there === null) return { ...none, needToken: true };
    if (there) return { ...none, sha: head.sha, ref, unread: true };
  }
  const m = v ? await maybe(readRaw(ref, 'manifest.json', { as: 'json' })) : null;
  return { ...none, sha: head.sha, ref, fallback: !!head.fallback, rate: head.rate || null, vault: v ? v.json : null, vaultText: v ? v.text : null, envelope: m ? (m.json === undefined ? { broken: true } : m.json) : null };
}

// ---------- writing ----------
const headWithToken = async () => { try { return (await gh('GET', `/git/ref/heads/${BRANCH}`)).object.sha; } catch (e) { if (e instanceof GhError && e.status === 404) return null; throw e; } };
const vaultAt = async (sha) => maybe(readRaw(sha, 'vault.json', { as: 'text' }));

export const CHANGED = 'O cofre mudou noutro aparelho enquanto guardavas. Recarreguei a página: confirma e tenta outra vez.';
export const CREATED_ELSEWHERE = 'Entretanto foi criado um cofre noutro aparelho. Recarreguei a página: abre-o com a frase-passe dele.';
export const UNSURE = 'Não sei se ficou guardado: a ligação falhou logo depois de o pedido seguir. Quando a rede voltar, carrega em «Tentar outra vez»: primeiro vejo no GitHub, e não guardo duas vezes.';
export const UNREAD = 'Já há um cofre no GitHub, que esta página não conseguiu ler: não o substituí. Recarreguei a página; abre-o com a frase-passe dele.';

// One commit that writes vault.json to «docs» (and README.md when the branch is new).
//   expect: the vault.json text the page started from (null: there is no vault yet). If the branch holds another one
//   the commit stops (CHANGED / CREATED_ELSEWHERE, reload: true). A vault.json equal to the one being written means an
//   earlier try landed: done, nothing written twice. Creating (expect null) on a branch whose tree holds a vault.json
//   that did not read stops too (UNREAD, reload: true).
// No branch: blobs, a tree without base_tree, a commit with no parent, POST refs. A branch: a blob, a tree on the head's
// tree, a commit on the head, PATCH without force. A ref that moved in between (the publisher pushed) -> once more.
export async function commitVault(vault, { expect = null, message }) {
  const text = vaultText(vault);
  let unsure = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    // after a write without an answer (unsure), a read that fails cannot say «nothing changed»: it may have landed
    let head, cur;
    try { head = await headWithToken(); cur = head ? await vaultAt(head) : null; } catch (e) { if (unsure && transient(e)) throw new UiError(UNSURE, { unknown: true }); throw e; }
    if (cur === text) return { commit: head, already: unsure || attempt > 1 };
    if ((cur || null) !== (expect || null)) throw new UiError(expect ? CHANGED : CREATED_ELSEWHERE, { conflict: true, reload: true });
    if (attempt === 3) break;
    // Creating on a branch that exists: its vault.json did not read (or is empty). Before writing, ask the tree itself.
    // A read that failed (a private repository read without the token, a glitch) must never pass for «no cofre»: the
    // new vault.json would replace the real one, and every published document would stop opening.
    if (!expect && head) {
      let there;
      try { there = await treeHasVault(head); } catch (e) { if (unsure && transient(e)) throw new UiError(UNSURE, { unknown: true }); throw e; }
      if (there) throw new UiError(UNREAD, { conflict: true, reload: true });
    }
    const blob = async (content) => (await gh('POST', '/git/blobs', { content, encoding: 'utf-8' })).sha;
    try {
      if (!head) {
        const entries = [{ path: 'README.md', mode: '100644', type: 'blob', sha: await blob(README) }, { path: 'vault.json', mode: '100644', type: 'blob', sha: await blob(text) }];
        const tree = await gh('POST', '/git/trees', { tree: entries });
        const made = await gh('POST', '/git/commits', { message, tree: tree.sha, parents: [] });
        await gh('POST', '/git/refs', { ref: `refs/heads/${BRANCH}`, sha: made.sha });
        return { commit: made.sha, created: true };
      }
      const base = await gh('GET', `/git/commits/${head}`);
      const tree = await gh('POST', '/git/trees', { base_tree: base.tree.sha, tree: [{ path: 'vault.json', mode: '100644', type: 'blob', sha: await blob(text) }] });
      const made = await gh('POST', '/git/commits', { message, tree: tree.sha, parents: [head] });
      await gh('PATCH', `/git/refs/heads/${BRANCH}`, { sha: made.sha, force: false });
      return { commit: made.sha };
    } catch (e) {
      if (!(e instanceof GhError)) throw e;
      if (e.status === 422) continue;          // the ref moved (or the branch appeared): look again
      if (transient(e)) { unsure = true; continue; }   // no answer: the next round sees whether it landed
      throw e;
    }
  }
  if (unsure) throw new UiError(UNSURE, { unknown: true });
  throw new UiError('O cofre mudou duas vezes enquanto guardavas. Recarrega a página e tenta outra vez.', { conflict: true, reload: true });
}

// ---------- the remembered key (IndexedDB gc-cofre / keys, by kid; the CryptoKey is non-extractable) ----------
const DB = 'gc-cofre', STORE = 'keys';
function openDb() {
  return new Promise((ok, ko) => {
    let r;
    try { r = indexedDB.open(DB, 1); } catch (e) { ko(e); return; }
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE, { keyPath: 'kid' }); };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error || new Error('indexedDB'));
    r.onblocked = () => ko(new Error('indexedDB blocked'));
  });
}
async function tx(mode, fn) {
  const db = await openDb();
  try {
    return await new Promise((ok, ko) => {
      const t = db.transaction(STORE, mode), s = t.objectStore(STORE);
      let out;
      const r = fn(s);
      if (r) r.onsuccess = () => { out = r.result; };
      t.oncomplete = () => ok(out);
      t.onerror = () => ko(t.error || new Error('indexedDB'));
      t.onabort = () => ko(t.error || new Error('indexedDB'));
    });
  } finally { db.close(); }
}
export async function idbUsable() { try { (await openDb()).close(); return true; } catch (_) { return false; } }
export const rememberKey = (kid, key) => tx('readwrite', (s) => s.put({ kid, key, saved: new Date().toISOString() }));
export const recallKey = async (kid) => { const r = await tx('readonly', (s) => s.get(kid)); return r && r.key instanceof CryptoKey ? r : null; };
export const forgetKey = (kid) => tx('readwrite', (s) => s.delete(kid));
export const forgetAllKeys = () => tx('readwrite', (s) => s.clear());
// every remembered key but the one of `kid` (a key of an older vault still opens what was published with it, and those
// copies stay public): deleted as soon as the page sees the vault it belongs to is gone
export const forgetOtherKeys = (kid) => tx('readwrite', (s) => {
  const r = s.openCursor();
  r.onsuccess = () => { const c = r.result; if (!c) return; if (c.key !== kid) c.delete(); c.continue(); };
  return null;
});
// the kids this browser remembers a key for (the tests use it; the page only deletes)
export const rememberedKids = () => tx('readonly', (s) => s.getAllKeys());
