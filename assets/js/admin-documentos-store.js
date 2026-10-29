// The cofre's storage for /admin/documentos/: reading the orphan branch «docs» of rgvduarte/carmo, the page's two kinds
// of commit to it (the vault's creation, a passphrase change or a new key pair), and the key remembered in IndexedDB.
//
// Reads: the branch head from api.github.com (with the admin token when this browser has one: 5000 requests an hour;
// otherwise without, 60), then every file at that commit from raw.githubusercontent.com/<owner>/<repo>/<sha>/<path>.
// A commit URL never changes, so the 5-minute cache of raw.githubusercontent.com never mixes an old manifest with new
// files. raw.githubusercontent.com answers simple GETs with Access-Control-Allow-Origin: * and refuses preflights (403),
// so these reads carry no header, no credentials and no Range. When the API is rate-limited the page reads the branch
// by name (…/docs/<path>), which may be up to 5 minutes old.
// Writes go through gh() of admin-gh.js (the admin's token), never commitFiles(), which is bound to gh-pages. The
// publisher (scripts/docs-publish.mjs) force-pushes the branch as one orphan commit and carries vault.json byte for byte;
// the page only ever writes vault.json (and README.md when it creates the branch).
import { gh, getToken, setToken, GhError, UiError, transient } from './admin-gh.js';
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

// the head of «docs» -> { sha } | { sha: null } (no branch) | { sha: null, fallback: true, rate } (rate-limited: read by name)
export async function readHead() {
  if (getToken()) {
    try { return { sha: (await gh('GET', `/git/ref/heads/${BRANCH}`)).object.sha }; } catch (e) {
      if (e instanceof GhError && e.status === 404) return { sha: null };
      if (e instanceof GhError && e.rate) return { sha: null, fallback: true, rate: e.rate };
      if (!(e instanceof GhError) || e.status !== 401) throw e;
      setToken(null);   // a token that expired: read without it, and ask for a new one only to write
    }
  }
  let res;
  try { res = await fetch(`${API}/git/ref/heads/${BRANCH}`, { ...plainGet, cache: 'no-store' }); } catch (_) { throw new GhError(0, 'network'); }
  if (res.status === 404) return { sha: null };
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok) {
    const h = (k) => res.headers.get(k), spent = h('x-ratelimit-remaining') === '0', retry = Number(h('retry-after')) || 0;
    if (res.status === 429 || (res.status === 403 && (spent || retry > 0))) return { sha: null, fallback: true, rate: { reset: spent ? Number(h('x-ratelimit-reset')) || 0 : 0, retry } };
    throw new GhError(res.status, json && json.message);
  }
  // GitHub answers a missing ref with the refs that start with it (an array): that is no branch
  if (!json || Array.isArray(json) || !json.object || !/^[0-9a-f]{40}$/.test(json.object.sha)) return { sha: null };
  return { sha: json.object.sha };
}

// one file of the branch at `ref` (a commit sha, or the branch name in the fallback) -> Uint8Array | string | object
export async function readRaw(ref, path, { signal, as = 'bytes' } = {}) {
  let res;
  try { res = await fetch(`${RAW}/${ref}/${path}`, { ...plainGet, cache: ref === BRANCH ? 'no-cache' : 'default', signal }); } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new GhError(0, 'network');
  }
  if (res.status === 404) throw new Missing(path);
  if (!res.ok) throw new GhError(res.status, 'raw');
  if (as === 'text') return res.text();
  if (as === 'json') { const t = await res.text(); try { return { json: JSON.parse(t), text: t }; } catch (_) { return { json: undefined, text: t }; } }
  return new Uint8Array(await res.arrayBuffer());
}
const maybe = async (p) => { try { return await p; } catch (e) { if (e instanceof Missing) return null; throw e; } };

// the branch as the page needs it -> { sha, ref, fallback, rate, vault, vaultText, envelope }
//   vault/vaultText null: no cofre yet; envelope null: nothing published yet; vault undefined with vaultText: not JSON
export async function loadBranch() {
  const head = await readHead();
  const ref = head.sha || (head.fallback ? BRANCH : null);
  if (!ref) return { sha: null, ref: null, fallback: false, vault: null, vaultText: null, envelope: null };
  const v = await maybe(readRaw(ref, 'vault.json', { as: 'json' }));
  const m = v ? await maybe(readRaw(ref, 'manifest.json', { as: 'json' })) : null;
  return { sha: head.sha, ref, fallback: !!head.fallback, rate: head.rate || null, vault: v ? v.json : null, vaultText: v ? v.text : null, envelope: m ? (m.json === undefined ? { broken: true } : m.json) : null };
}

// ---------- writing ----------
const headWithToken = async () => { try { return (await gh('GET', `/git/ref/heads/${BRANCH}`)).object.sha; } catch (e) { if (e instanceof GhError && e.status === 404) return null; throw e; } };
const vaultAt = async (sha) => maybe(readRaw(sha, 'vault.json', { as: 'text' }));

export const CHANGED = 'O cofre mudou noutro aparelho enquanto guardavas. Recarreguei a página: confirma e tenta outra vez.';
export const CREATED_ELSEWHERE = 'Entretanto foi criado um cofre noutro aparelho. Recarreguei a página: abre-o com a frase-passe dele.';
export const UNSURE = 'Não sei se ficou guardado: a ligação falhou logo depois de o pedido seguir. Quando a rede voltar, carrega em «Tentar outra vez»: primeiro vejo no GitHub, e não guardo duas vezes.';

// One commit that writes vault.json to «docs» (and README.md when the branch is new).
//   expect: the vault.json text the page started from (null: there is no vault yet). If the branch holds another one
//   the commit stops (CHANGED / CREATED_ELSEWHERE, reload: true). A vault.json equal to the one being written means an
//   earlier try landed: done, nothing written twice.
// No branch: blobs, a tree without base_tree, a commit with no parent, POST refs. A branch: a blob, a tree on the head's
// tree, a commit on the head, PATCH without force. A ref that moved in between (the publisher pushed) -> once more.
export async function commitVault(vault, { expect = null, message }) {
  const text = vaultText(vault);
  let unsure = false;
  for (let attempt = 1; attempt <= 3; attempt++) {
    let head;
    try { head = await headWithToken(); } catch (e) { if (unsure && transient(e)) throw new UiError(UNSURE, { unknown: true }); throw e; }
    const cur = head ? await vaultAt(head) : null;
    if (cur === text) return { commit: head, already: unsure || attempt > 1 };
    if ((cur || null) !== (expect || null)) throw new UiError(expect ? CHANGED : CREATED_ELSEWHERE, { conflict: true, reload: true });
    if (attempt === 3) break;
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
