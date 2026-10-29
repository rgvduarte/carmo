// Publishes the documents of the vault («Documentos», /admin/documentos/) to the orphan branch «docs», encrypted.
//   node scripts/docs-publish.mjs [--config <ficheiro>] [--dry-run] [--accept-vault "<impressão digital>"]
//                                 [--prune <id>]… [--state-from <indice.json>] [--reset] [--remote <url|caminho>] [--help]
//
// The page creates the key pair in the browser and commits vault.json (public key, private key wrapped with the
// passphrase). This script only ever has the public key: it encrypts each file with a random key, in 8 MiB chunks
// (assets/js/vault-crypto.js, the same module the page decrypts with, loaded here from a data: URL because it imports
// nothing), wraps that key to the public key, seals the manifest the same way, and force-pushes one orphan commit.
// It can decrypt nothing, so it keeps its own memory of what is on the branch in docs-publish.state.json (plaintext
// titles and changelogs, wrapped keys only, no secret), next to the config, outside the repository.
//
// Where things live: the config is --config, else $GOCARMO_COFRE/docs-publish.json, else ~/gocarmo-cofre/docs-publish.json.
// Next to it: docs-publish.state.json and docs-publish.cache.git/ (a bare repo with ciphertext only, so a publish
// uploads only what is new). None of them may sit in a git work tree unless ignored there (.gitignore has the names).
// git runs without a shell; authentication is the owner's normal git credentials (helper or SSH): this script never
// asks for, reads or stores a token. Exit codes: 0 done (or nothing to do), 1 refused with an explanation, 2 git or
// file error. See README, «Documentos (o cofre)».
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, rename, stat, open, mkdtemp, rm, mkdir, access } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, dirname, resolve, basename, extname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setFlagsFromString } from 'node:v8';
import { runInNewContext } from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const BRANCH = 'docs';
const TRACK = 'refs/remotes/cofre/docs'; // the fetched head, in the cache
const LAST = 'refs/cofre/last'; // our last pushed commit, kept so its blobs survive a gc of the cache
const STATE_NAME = 'docs-publish.state.json';
const CACHE_NAME = 'docs-publish.cache.git';
const IDENTITY = { name: 'gocarmo cofre', email: 'noreply@gocarmo.com' };
const SLUG = /^[a-z0-9-]{1,40}$/;
const HEX = (n) => new RegExp(`^[0-9a-f]{${n}}$`);
const PAGE = 'gocarmo.com/admin/documentos/';
const MIME = {
  zip: 'application/zip', pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', mp4: 'video/mp4', mov: 'video/quicktime',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
};
// no html, svg or markdown type: the page saves files through a blob: URL of gocarmo.com, and a type a browser renders
// with scripts must never get there (an .html document goes as application/octet-stream)
const HELP = `Publica os documentos do cofre (gocarmo.com/admin/documentos/) no ramo «docs», cifrados.

  node scripts/docs-publish.mjs [opções]

  --config <ficheiro>       a configuração (por omissão $GOCARMO_COFRE/docs-publish.json ou ~/gocarmo-cofre/docs-publish.json)
  --dry-run                 mostra o que faria, sem cifrar nem enviar nada
  --accept-vault "<impr.>"  aceita esta impressão digital do cofre (a primeira vez, ou depois de um cofre novo);
                            compara-a com a da página: Documentos → Mais → Impressão digital do cofre
  --prune <id>              tira do cofre um documento que já não está na configuração (pode repetir-se)
  --state-from <índice>     refaz o estado a partir do índice que a página descarrega (Documentos → Mais → Descarregar o índice)
  --reset                   esquece o estado: publica só as versões atuais (as anteriores perdem-se)
  --remote <url|caminho>    outro repositório (por omissão "remote" da configuração, ou o origin deste repositório)
  --help                    esta ajuda

A configuração, o estado (${STATE_NAME}) e a cache (${CACHE_NAME}/) ficam fora do repositório.
Exemplo: scripts/docs-publish.example.json. Mais no README, «Documentos (o cofre)».`;

// ---------- errors and output ----------

class Refusal extends Error {} // exit 1: the owner has to do something
class Failure extends Error {} // exit 2: git or a file failed
const say = (s = '') => process.stdout.write(`${s}\n`);
const warn = (s) => process.stderr.write(`Aviso: ${s}\n`);
const mb = (bytes) => {
  const f = (x) => new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 1 }).format(x);
  return bytes < 1e3 ? `${bytes} bytes` : bytes < 1e6 ? `${f(bytes / 1e3)} kB` : `${f(bytes / 1e6)} MB`;
};
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const lisbonToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon' }).format(new Date());
const randHex = (bytes) => randomBytes(bytes).toString('hex');

// ---------- git, without a shell ----------

// GIT_DIR and friends from the caller's environment would point git somewhere else
const BASE_ENV = Object.fromEntries(Object.entries(process.env)
  .filter(([k]) => !['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_PREFIX'].includes(k)));

function git(args, { cwd, input, env, allowFail = false, binary = false } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn('git', args, { cwd, env: { ...BASE_ENV, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    const out = []; const err = [];
    p.stdout.on('data', (b) => out.push(b));
    p.stderr.on('data', (b) => err.push(b));
    p.on('error', (e) => fail(new Failure(`não consegui correr o git (${e.message}). O git está instalado?`)));
    p.on('close', (code) => {
      const stdout = binary ? Buffer.concat(out) : Buffer.concat(out).toString('utf8');
      const stderr = Buffer.concat(err).toString('utf8');
      if (code !== 0 && !allowFail) fail(new Failure(`git ${args[0]} falhou (${code}): ${stderr.trim() || stdout.toString().trim()}`));
      else ok({ code, stdout, stderr });
    });
    p.stdin.on('error', () => {}); // a git that exits early closes its stdin; the exit code tells the story
    if (input !== undefined) p.stdin.end(input); else p.stdin.end();
  });
}
const gitOut = async (args, o) => (await git(args, o)).stdout.trim();

// ---------- arguments ----------

function parseArgs(argv) {
  const a = { prune: [], dryRun: false, reset: false };
  const need = (i, flag) => {
    if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Refusal(`${flag} precisa de um valor. Vê --help.`);
    return argv[i + 1];
  };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--help' || f === '-h') a.help = true;
    else if (f === '--dry-run') a.dryRun = true;
    else if (f === '--reset') a.reset = true;
    else if (f === '--config') a.config = need(i++, f);
    else if (f === '--accept-vault') a.accept = need(i++, f);
    else if (f === '--prune') a.prune.push(need(i++, f));
    else if (f === '--state-from') a.stateFrom = need(i++, f);
    else if (f === '--remote') a.remote = need(i++, f);
    else throw new Refusal(`Não conheço a opção ${f}. Vê --help.`);
  }
  if (a.reset && a.stateFrom) throw new Refusal('Usa --reset ou --state-from, não os dois.');
  return a;
}

// ---------- the config ----------

const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)
  && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const plainText = (s, max) => typeof s === 'string' && s.trim() !== '' && s.length <= max && !/[\u0000-\u001f\u007f]/.test(s);

function checkConfig(cfg, file) {
  const bad = [];
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Refusal(`${file} não é um objeto JSON.`);
  if (cfg.example === true) {
    throw new Refusal(`${file} é o exemplo do repositório ("example": true). Copia-o para fora do repositório `
      + '(por exemplo ~/gocarmo-cofre/docs-publish.json), põe os caminhos verdadeiros e tira a linha "example".');
  }
  if (cfg.v !== 1) bad.push('"v" tem de ser 1');
  if (cfg.remote !== undefined && typeof cfg.remote !== 'string') bad.push('"remote" tem de ser texto (vazio = o origin)');
  if (cfg.keep !== undefined && !(Number.isInteger(cfg.keep) && cfg.keep >= 1 && cfg.keep <= 5)) bad.push('"keep" vai de 1 a 5');
  const cats = Array.isArray(cfg.categories) ? cfg.categories : (bad.push('"categories" tem de ser uma lista'), []);
  const catIds = new Set();
  cats.forEach((c, i) => {
    if (!c || !SLUG.test(c.id)) bad.push(`categoria ${i + 1}: "id" só com a-z, 0-9 e hífens (até 40)`);
    else if (catIds.has(c.id)) bad.push(`categoria "${c.id}" repetida`);
    else catIds.add(c.id);
    if (!c || !plainText(c.title, 80)) bad.push(`categoria ${i + 1}: falta "title" (até 80 caracteres)`);
  });
  const docs = Array.isArray(cfg.documents) ? cfg.documents : (bad.push('"documents" tem de ser uma lista'), []);
  const ids = new Set();
  docs.forEach((d, i) => {
    const at = `documento ${d && typeof d.id === 'string' ? `"${d.id}"` : i + 1}`;
    if (!d || typeof d !== 'object') { bad.push(`${at}: não é um objeto`); return; }
    if (!SLUG.test(d.id ?? '')) bad.push(`${at}: "id" só com a-z, 0-9 e hífens (até 40)`);
    else if (ids.has(d.id)) bad.push(`${at}: "id" repetido`);
    else ids.add(d.id);
    if (!plainText(d.title, 120)) bad.push(`${at}: falta "title" (até 120 caracteres)`);
    if (!catIds.has(d.category)) bad.push(`${at}: a categoria "${d.category}" não está em "categories"`);
    if (typeof d.file !== 'string' || !d.file.trim()) bad.push(`${at}: falta "file" (o caminho do ficheiro)`);
    if (d.name !== undefined && !(plainText(d.name, 120) && !/[\\/]/.test(d.name) && !d.name.startsWith('.'))) {
      bad.push(`${at}: "name" é só o nome do ficheiro, sem pastas (até 120 caracteres)`);
    }
    if (!plainText(d.version, 40)) bad.push(`${at}: falta "version" (por exemplo "v2", até 40 caracteres)`);
    if (d.date !== undefined && !isDate(d.date)) bad.push(`${at}: "date" é AAAA-MM-DD`);
    if (!Array.isArray(d.changes) || d.changes.length < 1 || d.changes.length > 10
      || !d.changes.every((c) => plainText(c, 200))) bad.push(`${at}: "changes" é uma lista de 1 a 10 linhas, cada uma até 200 caracteres`);
    if (d.note !== undefined && typeof d.note !== 'string') bad.push(`${at}: "note" tem de ser texto`);
    else if (d.note && d.note.length > 300) bad.push(`${at}: "note" até 300 caracteres`);
  });
  if (bad.length) throw new Refusal(`A configuração ${file} tem problemas:\n  ${bad.join('\n  ')}`);
}

// «gocarmo-kit.zip» + «semana 99» → «gocarmo-kit-semana-99.zip»
function versionedName(name, label) {
  const slug = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  return slug ? `${stem}-${slug}${ext}` : name;
}
const mimeOf = (name) => MIME[extname(name).slice(1).toLowerCase()] || 'application/octet-stream';

// ---------- the state (plaintext, next to the config; no secret) ----------

function checkVersion(v) {
  return v && typeof v === 'object' && HEX(32).test(v.fid) && Number.isInteger(v.n) && v.n >= 1
    && Number.isInteger(v.size) && v.size >= 0 && typeof v.key === 'string' && typeof v.label === 'string'
    && HEX(64).test(v.sha256) && (v.chunk === undefined || Number.isInteger(v.chunk));
}

function docsFromList(list, where) {
  const docs = {};
  for (const d of Array.isArray(list) ? list : []) {
    if (!d || !SLUG.test(d.id ?? '') || !Array.isArray(d.versions) || !d.versions.every(checkVersion)) {
      throw new Refusal(`${where} tem um documento que não percebo (${d && d.id}). Não o uses.`);
    }
    docs[d.id] = { title: d.title, category: d.category, note: d.note || '', versions: d.versions };
  }
  return docs;
}

async function readJson(file, what) {
  let text;
  try { text = await readFile(file, 'utf8'); } catch (e) {
    if (e.code === 'ENOENT') return undefined;
    throw new Failure(`não consegui ler ${what} (${file}): ${e.message}`);
  }
  try { return JSON.parse(text); } catch (e) { throw new Refusal(`${what} (${file}) não é JSON válido: ${e.message}`); }
}

// the temporary file is named so that the .gitignore line «docs-publish.state.json*» covers it too, and main() checks it
const tmpOf = (file) => `${file}.tmp-${process.pid}`;
async function writeAtomic(file, text) {
  const tmp = tmpOf(file);
  await writeFile(tmp, text, { mode: 0o600 });
  await rename(tmp, file);
}

// ---------- the config, the state and the cache never go into a repository ----------

async function checkOutsideRepos(dir, paths) {
  const top = await git(['rev-parse', '--show-toplevel'], { cwd: dir, allowFail: true });
  if (top.code !== 0) return; // not in a work tree
  const exposed = [];
  for (const p of paths) {
    const r = await git(['check-ignore', '-q', '--', p], { cwd: dir, allowFail: true });
    if (r.code === 1) exposed.push(p);
    else if (r.code !== 0) throw new Failure(`git check-ignore falhou: ${r.stderr.trim()}`);
  }
  if (exposed.length) {
    throw new Refusal(`Estes ficheiros estão dentro do repositório ${top.stdout.trim()} e não estão no .gitignore:\n  `
      + `${exposed.join('\n  ')}\nUm commit podia publicá-los (caminhos e títulos em claro). Põe a configuração fora do `
      + 'repositório (por exemplo ~/gocarmo-cofre/) ou junta estes nomes ao .gitignore.');
  }
}

// ---------- files ----------

async function hashFile(file) {
  const h = createHash('sha256');
  await new Promise((ok, fail) => {
    createReadStream(file).on('data', (b) => h.update(b)).on('end', ok).on('error', fail);
  });
  return h.digest('hex');
}

// fills buf from fh at pos; a short read (the file shrank) is an error
async function readFully(fh, buf, len, pos) {
  let got = 0;
  while (got < len) {
    const { bytesRead } = await fh.read(buf, got, len - got, pos + got);
    if (!bytesRead) throw new Refusal('o ficheiro mudou durante a publicação. Corre outra vez.');
    got += bytesRead;
  }
}

// Each chunk leaves a few 8 MiB buffers behind (WebCrypto's output, the framed copy); V8 frees them only when it feels
// memory pressure, so without a hint the process grows with the file. One full collection per chunk keeps it flat.
const collect = (() => {
  try { setFlagsFromString('--expose-gc'); const gc = runInNewContext('gc'); return typeof gc === 'function' ? gc : () => {}; } catch { return () => {}; }
})();

// ---------- main ----------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) { say(HELP); return 0; }

  const configPath = resolve(args.config
    || (process.env.GOCARMO_COFRE ? join(process.env.GOCARMO_COFRE, 'docs-publish.json') : join(homedir(), 'gocarmo-cofre', 'docs-publish.json')));
  const dir = dirname(configPath);
  const statePath = join(dir, STATE_NAME);
  const cache = join(dir, CACHE_NAME);
  const cfg = await readJson(configPath, 'a configuração');
  if (cfg === undefined) {
    throw new Refusal(`Não encontro a configuração ${configPath}. Copia scripts/docs-publish.example.json para lá `
      + '(fora do repositório), põe os caminhos dos ficheiros e tira a linha "example". Vê --help.');
  }
  checkConfig(cfg, configPath);
  await checkOutsideRepos(dir, [configPath, statePath, tmpOf(statePath), `${cache}/`]);

  // the shared crypto, the same file the page uses (it imports nothing, so a data: URL loads it)
  const vcPath = join(REPO, 'assets', 'js', 'vault-crypto.js');
  let vcSource;
  try { vcSource = await readFile(vcPath); } catch { throw new Failure(`falta ${vcPath} (o publicador corre a partir do repositório do site)`); }
  const VC = await import(`data:text/javascript;base64,${vcSource.toString('base64')}`);
  const { V } = VC;
  const keep = cfg.keep ?? V.KEEP;

  // remote: --remote, else the config's, else origin of this repository
  const pathish = (s) => s.startsWith('.') || s.startsWith('/') || s.startsWith('~');
  const expand = (s, base) => (pathish(s) ? resolve(base, s.replace(/^~(?=\/|$)/, homedir())) : s);
  let remote = args.remote ? expand(args.remote, process.cwd()) : cfg.remote ? expand(cfg.remote, dir) : '';
  if (!remote) {
    const r = await git(['remote', 'get-url', 'origin'], { cwd: REPO, allowFail: true });
    if (r.code !== 0) throw new Refusal('Não sei para onde publicar: este repositório não tem origin. Usa --remote ou "remote" na configuração.');
    remote = r.stdout.trim();
  }

  // the state: our memory of what is on the branch
  const raw = await readJson(statePath, 'o estado');
  if (raw !== undefined && (raw.v !== 1 || typeof raw.docs !== 'object' || raw.docs === null)) {
    throw new Refusal(`O estado ${statePath} não é deste publicador. Muda-lhe o nome e corre com --state-from ou --reset.`);
  }
  const state = raw ?? { v: 1, docs: {} };
  docsFromList(Object.entries(state.docs).map(([id, d]) => ({ id, ...d })), 'O estado');

  // the cache: a bare repo with the branch's ciphertext
  try { await access(join(cache, 'HEAD')); } catch {
    await mkdir(cache, { recursive: true });
    await git(['init', '--bare', '-q', cache]);
  }
  // the chunks are ciphertext: compressing them or looking for deltas between them only costs time
  const FAST = ['-c', 'core.compression=0', '-c', 'core.bigFileThreshold=1m', '-c', 'pack.window=0'];
  const G = (a, o = {}) => git([...FAST, ...a], { cwd: cache, ...o });
  const GO = (a, o = {}) => gitOut(a, { cwd: cache, ...o });

  async function fetchHead() {
    const ls = await git(['ls-remote', '--heads', remote, `refs/heads/${BRANCH}`], { cwd: cache, allowFail: true });
    if (ls.code !== 0) throw new Failure(`não consegui ler ${remote}: ${ls.stderr.trim()}`);
    if (!ls.stdout.trim()) throw new Refusal(`Ainda não há cofre. Abre ${PAGE} e cria-o primeiro.`);
    await G(['fetch', '-q', '--no-tags', '--no-write-fetch-head', remote, `+refs/heads/${BRANCH}:${TRACK}`]);
    const head = await GO(['rev-parse', '--verify', `${TRACK}^{commit}`]);
    const tree = new Map(); // path -> blob sha
    const lsTree = await GO(['ls-tree', '-r', '-z', '--full-tree', head]);
    for (const line of lsTree.split('\0').filter(Boolean)) {
      const [meta, path] = line.split('\t');
      tree.set(path, meta.split(' ')[2]);
    }
    if (!tree.has('vault.json')) throw new Refusal(`O ramo ${BRANCH} não tem vault.json. Abre ${PAGE} e cria o cofre.`);
    const vaultText = (await G(['cat-file', 'blob', tree.get('vault.json')])).stdout;
    let vault;
    try { vault = JSON.parse(vaultText); } catch { throw new Refusal('O vault.json do ramo docs não é JSON válido. Não publiques; abre a página e confirma o cofre.'); }
    const problems = VC.checkVault(vault);
    if (problems.length) throw new Refusal(`O vault.json não é válido (${problems.join('; ')}). Não o uses nem publiques para ele.`);
    const fp = await VC.fingerprint(vault.pub);
    return { head, tree, vault, fp };
  }

  // ----- 1. fetch, check the vault, pin it -----
  let cur = await fetchHead();
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, '');
  const accepted = args.accept !== undefined;
  if (accepted && norm(args.accept) !== norm(cur.fp)) {
    throw new Refusal(`A impressão digital que deste não é a do cofre no GitHub (${cur.fp}). Confirma-a na página: Documentos → Mais → Impressão digital do cofre.`);
  }
  const pinned = state.vault && state.vault.kid && state.vault.fingerprint;
  const sameVault = pinned && state.vault.kid === cur.vault.kid && norm(state.vault.fingerprint) === norm(cur.fp);
  if (!pinned && !accepted) {
    throw new Refusal(`Primeira publicação deste computador. A impressão digital do cofre no GitHub é:\n\n  ${cur.fp}\n\n`
      + `Confirma que é a mesma da página (${PAGE} → Mais → Impressão digital do cofre) e corre outra vez com\n`
      + `  --accept-vault "${cur.fp}"`);
  }
  if (pinned && !sameVault && !accepted) {
    throw new Refusal(`O cofre no GitHub mudou. A impressão digital era ${state.vault.fingerprint} e agora é ${cur.fp}.\n`
      + 'Se criaste um cofre novo na página (frase-passe perdida), confirma a impressão digital nova na página e corre com\n'
      + `  --accept-vault "${cur.fp}"\n(as versões antigas deixam de abrir e saem do cofre). Se não foste tu, não publiques: `
      + 'alguém com acesso ao repositório trocou o vault.json. Muda o token do GitHub e cria o cofre outra vez.');
  }
  const newVault = pinned && !sameVault; // accepted: a new key pair, old wrapped keys are useless

  // ----- 2. what is on the branch now, from our memory (state), the page's index, or nothing -----
  let prior = {};
  const branchManifest = cur.tree.get('manifest.json');
  if (args.stateFrom) {
    const idx = await readJson(resolve(args.stateFrom), 'o índice');
    if (idx === undefined) throw new Refusal(`Não encontro o índice ${args.stateFrom}.`);
    if (idx.export !== 'gocarmo-cofre-indice' || idx.v !== 1) throw new Refusal(`${args.stateFrom} não é um índice do cofre (Documentos → Mais → Descarregar o índice).`);
    if (idx.kid !== cur.vault.kid) throw new Refusal('O índice é de outro cofre (outra chave). Descarrega-o outra vez na página, com o cofre atual.');
    prior = docsFromList(idx.docs, 'O índice');
    const missing = Object.values(prior).flatMap((d) => d.versions)
      .filter((v) => !Array.from({ length: v.n }, (_, i) => `f/${v.fid}/${i}.bin`).every((p) => cur.tree.has(p)));
    if (missing.length) throw new Refusal('O índice não corresponde ao cofre no GitHub (faltam ficheiros). Descarrega o índice outra vez na página e repete.');
    say(`Estado refeito a partir do índice: ${plural(Object.keys(prior).length, 'documento', 'documentos')}.`);
  } else if (args.reset) {
    if (branchManifest) warn('--reset: as versões que estão no cofre e não estão na configuração perdem-se.');
  } else if (newVault) {
    warn('cofre novo: as versões antigas estão fechadas com a chave antiga, por isso saem; publico só as atuais.');
  } else if (sameVault || !pinned) {
    const known = state.last && state.last.manifest;
    if (branchManifest && branchManifest !== known) {
      throw new Refusal(`Não tenho o estado da última publicação (o manifest.json do ramo ${BRANCH} não é o que publiquei daqui).\n`
        + 'Usa --state-from com o índice que a página descarrega (Documentos → Mais → Descarregar o índice), ou --reset para '
        + 'publicar só as versões atuais (as anteriores perdem-se).');
    }
    if (sameVault) prior = state.docs;
  }

  // chunk blobs of the versions we carry: from the fetched tree, else from our last commit in the cache
  const lastTree = new Map();
  if (state.last && state.last.commit) {
    const r = await G(['ls-tree', '-r', '-z', '--full-tree', state.last.commit], { allowFail: true });
    if (r.code === 0) for (const line of r.stdout.split('\0').filter(Boolean)) { const [m, p] = line.split('\t'); lastTree.set(p, m.split(' ')[2]); }
  }
  const blobOf = (p) => cur.tree.get(p) || lastTree.get(p);
  const carried = {};
  for (const [id, d] of Object.entries(prior)) {
    const versions = d.versions.filter((v) => {
      const ok = Array.from({ length: v.n }, (_, i) => blobOf(`f/${v.fid}/${i}.bin`)).every(Boolean);
      if (!ok) warn(`a versão ${v.label} de «${d.title}» já não está no GitHub nem na cache: sai do cofre.`);
      return ok;
    });
    carried[id] = { ...d, versions };
  }

  // ----- 3. prune -----
  const cfgIds = new Set(cfg.documents.map((d) => d.id));
  for (const id of args.prune) {
    if (cfgIds.has(id)) throw new Refusal(`«${id}» ainda está na configuração. Tira-o de lá primeiro e corre outra vez com --prune ${id}.`);
    if (!carried[id]) throw new Refusal(`Não há nenhum documento «${id}» no cofre.`);
  }

  // ----- 4. compare every file with its last version -----
  const today = lisbonToday();
  const plan = [];
  for (const d of cfg.documents) {
    const file = isAbsolute(d.file) ? d.file : resolve(dir, d.file);
    let st;
    try { st = await stat(file); } catch { throw new Refusal(`«${d.title}»: não encontro o ficheiro ${file}.`); }
    if (!st.isFile()) throw new Refusal(`«${d.title}»: ${file} não é um ficheiro.`);
    if (st.size > V.MAX_FILE) {
      throw new Refusal(`«${d.title}»: ${file} tem ${mb(st.size)}; o limite é ${mb(V.MAX_FILE)} (um telemóvel tem de o montar em memória). Divide-o em partes.`);
    }
    const sha = await hashFile(file);
    const prev = carried[d.id]?.versions ?? [];
    const last = prev[0];
    const name = versionedName(d.name || basename(file), d.version);
    const meta = { label: d.version, date: d.date || today, changes: d.changes, name, type: mimeOf(name) };
    if (last && last.sha256 === sha) {
      if (last.label !== d.version) {
        throw new Refusal(`«${d.title}»: o ficheiro é o mesmo da versão ${last.label}. Volta a pôr "version": "${last.label}" ou muda o ficheiro.`);
      }
      plan.push({ d, file, size: st.size, sha, meta, fresh: false });
    } else {
      if (last && last.label === d.version) {
        throw new Refusal(`«${d.title}»: o ficheiro mudou mas a versão continua ${d.version}. Muda "version" e "changes".`);
      }
      const dup = prev.find((v) => v.label === d.version);
      if (dup) throw new Refusal(`«${d.title}»: já há uma versão ${d.version} no cofre (mais antiga). Dá outro nome a esta.`);
      plan.push({ d, file, size: st.size, sha, meta, fresh: true });
    }
  }

  // ----- 5. the documents as they will be (config order, then the ones only in the cofre) -----
  const pub = await VC.importPublic(cur.vault);
  const kid = cur.vault.kid;
  const now = new Date().toISOString();
  const added = []; const dropped = []; const warnings = [];
  const docs = [];
  const newChunks = new Map(); // path -> blob sha (filled when encrypting)
  for (const p of plan) {
    const prev = carried[p.d.id]?.versions ?? [];
    let versions;
    if (p.fresh) {
      versions = [{ vid: randHex(8), ...p.meta, size: p.size, sha256: p.sha, fid: null, n: VC.chunkCount(p.size), chunk: V.CHUNK, key: null, published: now, pending: p }, ...prev];
      added.push({ title: p.d.title, label: p.d.version, size: p.size });
    } else {
      // changes, name and an explicit date may be corrected in place; without "date" the version keeps its own
      versions = [{ ...prev[0], ...p.meta, date: p.d.date || prev[0].date }, ...prev.slice(1)];
    }
    for (const v of versions.slice(keep)) dropped.push({ title: p.d.title, label: v.label });
    docs.push({ id: p.d.id, title: p.d.title, category: p.d.category, note: p.d.note || '', versions: versions.slice(0, keep) });
  }
  for (const [id, d] of Object.entries(carried)) {
    if (cfgIds.has(id)) continue;
    if (args.prune.includes(id)) { for (const v of d.versions) dropped.push({ title: d.title, label: v.label }); continue; }
    warnings.push(`«${d.title}» (${id}) não está na configuração: fica no cofre; para o tirar usa --prune ${id}`);
    for (const v of d.versions.slice(keep)) dropped.push({ title: d.title, label: v.label });
    docs.push({ id, title: d.title, category: d.category, note: d.note || '', versions: d.versions.slice(0, keep) });
  }
  for (const w of warnings) warn(w);
  const nVersions = docs.reduce((s, d) => s + d.versions.length, 0);
  const stored = docs.reduce((s, d) => s + d.versions.reduce((t, v) => t + v.size, 0), 0);

  // nothing changed: same documents, same texts, and the branch still holds our manifest
  const canon = (list) => JSON.stringify({ categories: cfg.categories, docs: list.map((d) => ({ ...d, versions: d.versions.map(({ pending, ...v }) => v) })) });
  const digestOf = () => createHash('sha256').update(canon(docs)).digest('hex');
  const unchanged = !added.length && !dropped.length && sameVault && !args.stateFrom && !args.reset
    && state.last && state.last.digest === digestOf() && branchManifest && branchManifest === state.last.manifest;

  say(`Cofre ${kid} (impressão digital ${cur.fp}), ramo ${BRANCH} em ${remote}`);
  for (const a of added) say(`  nova: «${a.title}» ${a.label}, ${mb(a.size)}`);
  for (const x of dropped) say(`  sai: «${x.title}» ${x.label}`);
  say(`  no cofre: ${plural(docs.length, 'documento', 'documentos')}, ${plural(nVersions, 'versão', 'versões')}, ${mb(stored)}`);
  if (unchanged) { say('Nada mudou. O cofre já está atualizado.'); return 0; }
  if (args.dryRun) { say('--dry-run: nada foi cifrado nem enviado; o estado ficou como estava.'); return 0; }

  // ----- 6. encrypt the new versions, chunk by chunk, straight into the cache -----
  const buf = Buffer.alloc(V.CHUNK);
  for (const d of docs) {
    const v = d.versions[0];
    if (!v.pending) continue;
    const p = v.pending;
    delete v.pending;
    v.fid = VC.newFid();
    const K = VC.newFileKey();
    const aes = await VC.fileKey(K, ['encrypt']);
    const h = createHash('sha256');
    const fh = await open(p.file, 'r');
    try {
      for (let i = 0; i < v.n; i++) {
        const len = Math.min(V.CHUNK, p.size - i * V.CHUNK);
        await readFully(fh, buf, len, i * V.CHUNK);
        h.update(buf.subarray(0, len));
        let plain = buf.subarray(0, len);
        if (i === v.n - 1) { const padded = VC.paddedLength(len); buf.fill(0, len, padded); plain = buf.subarray(0, padded); }
        const ct = await VC.encryptChunk(aes, plain, { fid: v.fid, i, n: v.n, size: p.size });
        newChunks.set(`f/${v.fid}/${i}.bin`, await GO(['hash-object', '-w', '--stdin'], { input: ct }));
        collect();
        process.stdout.write(`\r  a cifrar «${d.title}»: parte ${i + 1} de ${v.n}`);
      }
      process.stdout.write('\n');
      const extra = Buffer.alloc(1);
      if ((await fh.read(extra, 0, 1, p.size)).bytesRead) throw new Refusal(`«${d.title}»: o ficheiro mudou durante a publicação. Corre outra vez.`);
    } finally { await fh.close(); }
    if (h.digest('hex') !== v.sha256) throw new Refusal(`«${d.title}»: o ficheiro mudou durante a publicação. Corre outra vez.`);
    v.key = await VC.wrapKey(pub, K, `file:${v.fid}`);
    K.fill(0);
  }

  // ----- 7. seal the manifest and build one orphan commit -----
  const manifest = { v: 1, kid, published: now, categories: cfg.categories.map(({ id, title }) => ({ id, title })), docs };
  const envelope = await VC.sealManifest(pub, kid, manifest);
  const manifestBlob = await GO(['hash-object', '-w', '--stdin'], { input: `${JSON.stringify(envelope)}\n` });
  const readmeBlob = await GO(['hash-object', '-w', '--stdin'], { input: VC.BRANCH_README });
  const work = await mkdtemp(join(tmpdir(), 'gocarmo-cofre-'));
  const date = `${Math.floor(Date.now() / 1000)} +0000`;
  const env = {
    GIT_AUTHOR_NAME: IDENTITY.name, GIT_AUTHOR_EMAIL: IDENTITY.email, GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: IDENTITY.name, GIT_COMMITTER_EMAIL: IDENTITY.email, GIT_COMMITTER_DATE: date,
  };
  // always the same message: the number of documents is not to be read on the public branch (the tree shows only one
  // folder per version); the counts are said on this terminal only
  const message = 'Cofre: publicação';
  async function commitFor(vaultBlob) {
    const entries = [['README.md', readmeBlob], ['vault.json', vaultBlob], ['manifest.json', manifestBlob]];
    for (const d of docs) {
      for (const v of d.versions) {
        for (let i = 0; i < v.n; i++) {
          const path = `f/${v.fid}/${i}.bin`;
          const blob = newChunks.get(path) || blobOf(path);
          if (!blob) throw new Failure(`falta a parte ${path} na cache`);
          entries.push([path, blob]);
        }
      }
    }
    const index = join(work, `index-${randHex(4)}`);
    await G(['update-index', '--add', '-z', '--index-info'], { env: { GIT_INDEX_FILE: index }, input: entries.map(([p, b]) => `100644 ${b}\t${p}\0`).join('') });
    const tree = await GO(['write-tree'], { env: { GIT_INDEX_FILE: index } });
    return GO(['commit-tree', '--no-gpg-sign', '-m', message, tree], { env });
  }

  // ----- 8. push with a lease; the page may have rewrapped vault.json in between -----
  let commit;
  try {
    for (let attempt = 1; ; attempt++) {
      commit = await commitFor(cur.tree.get('vault.json'));
      await G(['update-ref', LAST, commit]);
      const push = await G(['push', '--no-verify', '--porcelain', `--force-with-lease=refs/heads/${BRANCH}:${cur.head}`,
        remote, `${commit}:refs/heads/${BRANCH}`], { allowFail: true });
      if (push.code === 0) break;
      const now2 = await git(['ls-remote', '--heads', remote, `refs/heads/${BRANCH}`], { cwd: cache, allowFail: true });
      const moved = now2.code === 0 && now2.stdout.split('\t')[0].trim() !== cur.head;
      if (!moved) throw new Failure(`o envio para ${remote} falhou: ${(push.stderr || push.stdout).trim()}`);
      if (attempt >= 2) throw new Refusal('O cofre mudou duas vezes enquanto publicava. Corre outra vez.');
      say('O ramo mudou entretanto (a página mudou a frase-passe?). Leio outra vez o vault.json.');
      const next = await fetchHead();
      if (next.vault.kid !== cur.vault.kid || norm(next.fp) !== norm(cur.fp)) {
        throw new Refusal(`O cofre no GitHub mudou enquanto publicava: a impressão digital agora é ${next.fp}. Nada foi publicado. `
          + 'Confirma na página e corre outra vez (com --accept-vault se foste tu a criar um cofre novo).');
      }
      cur = next;
    }
  } finally { await rm(work, { recursive: true, force: true }); }
  await G(['update-ref', TRACK, commit]);
  // the dropped versions (and the page's replaced vault.json) leave the cache now: a few 100 MB files would otherwise
  // stay on disk for two weeks. Only this run writes here; a second run at the same time would fail, not publish.
  await G(['prune', '--expire=now'], { allowFail: true });
  await G(['gc', '--auto', '--quiet'], { allowFail: true });

  // ----- 9. remember what is on the branch now -----
  const nextState = {
    v: 1,
    vault: { kid, fingerprint: cur.fp },
    last: { commit, at: now, manifest: manifestBlob, digest: digestOf() },
    docs: Object.fromEntries(docs.map((d) => [d.id, { title: d.title, category: d.category, note: d.note, versions: d.versions }])),
  };
  await writeAtomic(statePath, `${JSON.stringify(nextState, null, 2)}\n`);
  say(`Publicado: ${commit.slice(0, 12)} (${plural(docs.length, 'documento', 'documentos')}, ${plural(nVersions, 'versão', 'versões')}).`);
  if (args.stateFrom) {
    say(`Apaga agora o índice ${resolve(args.stateFrom)}: tem os títulos e as alterações em claro, e o estado novo já está em ${statePath}.`);
  }
  say(`Abre ${PAGE} (a lista atualiza em 1 a 2 minutos).`);
  return 0;
}

main().then((code) => { process.exitCode = code; }, (e) => {
  if (e instanceof Refusal) { process.stderr.write(`${e.message}\n`); process.exitCode = 1; }
  else if (e instanceof Failure) { process.stderr.write(`Erro: ${e.message}\n`); process.exitCode = 2; }
  else if (e && e.code === 'ENOSPC') { process.stderr.write(`Erro: o disco está cheio (${e.message}).\n`); process.exitCode = 2; }
  else if (e && e.name === 'VaultError') { process.stderr.write(`O cofre recusou: ${e.message}\n`); process.exitCode = 1; }
  else { process.stderr.write(`Erro: ${e && e.stack ? e.stack : e}\n`); process.exitCode = 2; }
});
