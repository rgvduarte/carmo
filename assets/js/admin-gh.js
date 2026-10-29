// The owner's GitHub token and the GitHub calls of the admin pages (/admin/ and the montra editor of /admin/patrocinios/).
// Moved out of admin.js so both pages keep one copy of the rules: the token lives in this browser only (sessionStorage,
// or localStorage with «Lembrar neste telemóvel», under the same key gc.admin.token), it goes in one header and never in
// an error, a classic token may hold public_repo and nothing more, and a fine-grained one must be able to write.
// commitFiles() makes ONE commit on gh-pages with the Git Data API: blobs, a tree on the head's tree, a commit, a ref
// update without force; a moved ref (422) re-runs the whole build once on the new head, and a ref update whose answer was
// lost is remembered (intent.pending), so that no later try commits twice.
import { REPO, BRANCH, TOKEN_RE, RuleError, decodeB64Utf8, bytesToB64 } from './admin-core.js';

export { TOKEN_RE };
export const API = `https://api.github.com/repos/${REPO}`;
const KEY = 'gc.admin.token';

let token = null;          // in memory; storage only holds it between visits
export const getToken = () => token;
export const setToken = (t) => { token = t || null; };

export class GhError extends Error { constructor(status, msg, rate = null) { super(msg || `GitHub ${status}`); this.status = status; this.rate = rate; } }
export class UiError extends Error { constructor(msg, opts = {}) { super(msg); Object.assign(this, opts); } }
export const transient = (e) => e instanceof GhError && (e.status === 0 || e.status >= 500);

// ---------- token storage ("Lembrar neste telemóvel" = localStorage, otherwise this tab only) ----------
const stores = () => ['sessionStorage', 'localStorage'].map((k) => { try { return window[k]; } catch (_) { return null; } }).filter(Boolean);
export function readToken() { for (const s of stores()) { try { const v = s.getItem(KEY); if (v) return v; } catch (_) {} } return null; }
export function forgetToken() { for (const s of stores()) { try { s.removeItem(KEY); } catch (_) {} } }
export function keepToken(t, remember) { forgetToken(); try { (remember ? localStorage : sessionStorage).setItem(KEY, t); } catch (_) {} }

// ---------- GitHub ----------
// One wrapper holds the header. Errors carry the status and GitHub's own message only, never the token.
export async function ghRes(method, path, body) {
  let res;
  try {
    res = await fetch(path.startsWith('https://') ? path : `${API}${path}`, {
      method, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) { throw new GhError(0, 'network'); }
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok) {
    const h = (k) => res.headers.get(k);
    // primary limit: remaining 0 until x-ratelimit-reset; secondary limit (403 or 429): retry-after seconds
    const spent = h('x-ratelimit-remaining') === '0', retry = Number(h('retry-after')) || 0;
    const limited = res.status === 429 || (res.status === 403 && (spent || retry > 0));
    throw new GhError(res.status, json && typeof json.message === 'string' ? json.message : '', limited ? { reset: spent ? Number(h('x-ratelimit-reset')) || 0 : 0, retry } : null);
  }
  return { json, headers: res.headers };
}
export const gh = async (method, path, body) => (await ghRes(method, path, body)).json;

export const UNKNOWN = 'Não sei se ficou guardado: a ligação falhou logo depois de o pedido seguir. Quando a rede voltar, carrega em «Tentar outra vez»: primeiro vejo no GitHub, e não guardo duas vezes.';

const pad2 = (n) => String(n).padStart(2, '0');
const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
export function errText(e, kind = 'read') {
  if (e instanceof UiError || e instanceof RuleError) return e.message;
  if (!(e instanceof GhError)) return 'Algo correu mal nesta página. Recarrega-a e tenta outra vez.';
  const tail = kind === 'write' ? ' O site não mudou.' : '';
  if (e.status === 0) return kind === 'write' ? 'Sem ligação. O site não mudou.' : 'Sem ligação ao GitHub. Verifica a rede e tenta outra vez.';
  if (e.rate) return `Demasiados pedidos ao GitHub. Tenta depois das ${hhmm(e.rate.retry || !e.rate.reset ? new Date(Date.now() + (e.rate.retry || 60) * 1000) : new Date(e.rate.reset * 1000))}.`;
  if (e.status === 401) return 'O token expirou ou foi revogado. Cria um novo.';
  if (kind === 'write' && (e.status === 403 || e.status === 404)) return 'O token não tem permissão de escrita (Contents: Read and write).';
  if (e.status === 404) return 'O token não chega ao repositório rgvduarte/carmo.';
  if (e.status === 403) return 'O GitHub recusou o pedido. Confirma as permissões do token.';
  if (e.status === 409 || e.status >= 500) return `O GitHub falhou (código ${e.status}).${tail || ' Tenta outra vez daqui a pouco.'}`;
  return `O GitHub não aceitou o pedido (código ${e.status}).${tail}`;   // its own words are English: not shown
}

// ---------- sign-in ----------
// The checks of a token typed by hand (t: trimmed). It becomes the token in use while they run; on any failure the
// token in use is cleared and the error thrown (signInText() words it). Nothing is stored here: keepToken() after.
export async function checkToken(t) {
  if (!TOKEN_RE.test(t)) throw new UiError('Isto não parece um token do GitHub (começa por github_pat_).', { format: true });
  token = t;
  try {
    const { json: repo, headers } = await ghRes('GET', '');
    if (repo && repo.permissions && repo.permissions.push !== true) throw new UiError('A tua conta não pode escrever neste repositório. Pede ao dono acesso de escrita.');
    // A classic token reaches every repository the account can write to: take one that can do no more than this page
    // needs (public_repo), so a lost token does less harm.
    if (t.startsWith('ghp_') && headers.get('x-oauth-scopes') !== null) {
      const extra = headers.get('x-oauth-scopes').split(',').map((x) => x.trim()).filter((x) => x && x !== 'public_repo');
      if (extra.length) throw new UiError(`Este token clássico pode mais do que esta página precisa (${extra.join(', ')}). Apaga-o no GitHub e cria outro só com public_repo e 7 dias de validade.`);
    }
    // A fine-grained token shows what it may do only when it writes: the empty blob already exists in the repo
    // (.nojekyll), so asking for it again changes nothing.
    try { await gh('POST', '/git/blobs', { content: '', encoding: 'utf-8' }); } catch (x) {
      if (x instanceof GhError && (x.status === 403 || x.status === 404) && !x.rate) throw new UiError('O token só pode ler. Em «Permissions», o Contents tem de estar em «Read and write».');
      throw x;
    }
  } catch (x) { token = null; throw x; }
  return true;
}
export const signInText = (x) => (x instanceof GhError && x.status === 401 ? 'O GitHub não aceitou este token: está mal copiado, expirou ou foi revogado.'
  : x instanceof GhError && x.status === 404 ? 'Este token não chega a rgvduarte/carmo. Na criação, em «Repository access», escolhe esse repositório.'
    : errText(x));

// ---------- reading ----------
export const headSha = async () => (await gh('GET', `/git/ref/heads/${BRANCH}`)).object.sha;
// a text file at a commit (null when it is not there)
export async function readText(path, ref) {
  try {
    const c = await gh('GET', `/contents/${path}?ref=${encodeURIComponent(ref)}`);
    return { text: decodeB64Utf8(c.content), sha: c.sha };
  } catch (e) { if (e instanceof GhError && e.status === 404) return null; throw e; }
}
// ---------- one commit ----------
// intent: { message?, files?, deletes?, build?, landed?, pending? } (kept by the caller between tries).
//   files: [{ path, text } | { path, bytes }]; deletes: [path] (paths that are not there are left out).
//   build(head): async, on each try, -> { message, files, deletes } or { nothing: true }; it may throw (a conflict).
//   landed(head): async, when an earlier try's ref update had no answer: true when that save is on gh-pages already.
// -> { commit, head, message, files } or { nothing: true }. The ref update never forces.
export async function commitFiles(intent) {
  for (let attempt = 1; ; attempt++) {
    let head;
    try { head = await headSha(); } catch (e) { if (intent.pending && transient(e)) throw new UiError(UNKNOWN, { unknown: true }); throw e; }
    const p = intent.pending;
    if (p) {
      intent.pending = null;
      let there = head === p.sha;
      if (!there && intent.landed) { try { there = await intent.landed(head); } catch (_) { there = false; } }
      if (there) return { commit: p.commit, head, message: p.message, files: p.files };
    }
    const job = intent.build ? await intent.build(head) : { message: intent.message, files: intent.files || [], deletes: intent.deletes || [] };
    if (!job || job.nothing) return { nothing: true };
    const commit = await gh('GET', `/git/commits/${head}`);
    const entries = [];
    for (const f of job.files || []) {
      const blob = f.bytes ? await gh('POST', '/git/blobs', { content: bytesToB64(f.bytes), encoding: 'base64' }) : await gh('POST', '/git/blobs', { content: f.text, encoding: 'utf-8' });
      entries.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    for (const path of job.deletes || []) entries.push({ path, mode: '100644', type: 'blob', sha: null });
    const tree = await gh('POST', '/git/trees', { base_tree: commit.tree.sha, tree: entries });
    const made = await gh('POST', '/git/commits', { message: job.message, tree: tree.sha, parents: [head] });
    try {
      await gh('PATCH', `/git/refs/heads/${BRANCH}`, { sha: made.sha, force: false });
    } catch (e) {
      if (!(e instanceof GhError)) throw e;
      if (e.status === 422) {   // someone else saved in between
        if (attempt === 1) continue;
        throw new UiError('Alguém guardou ao mesmo tempo duas vezes seguidas. Recarrega e tenta outra vez.', { conflict: true, reload: true });
      }
      if (!transient(e)) throw e;
      // no answer: the ref may have moved. Keep this commit in mind so that no later try saves it twice.
      intent.pending = { sha: made.sha, commit: made, message: job.message, files: job.files };
      let now = null;
      try { now = await headSha(); } catch (_) {}
      if (now !== made.sha) {
        if (attempt === 1) continue;   // the next round looks again, and saves it only if it is not there
        throw now === null ? new UiError(UNKNOWN, { unknown: true }) : e;
      }
      intent.pending = null;
    }
    return { commit: made, head: made.sha, message: job.message, files: job.files };
  }
}
