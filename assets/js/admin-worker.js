// The booking Worker (SITE.requestsApi) for the hub (/admin/) and the supporters page (/admin/apoiantes/): its key,
// kept as Espaços and Patrocínios keep it (sessionStorage gc.admin.pedidos, this tab only, so a key typed on any of the
// four pages serves the others in the same tab), one call with the key in a header, and the errors in Portuguese.
import { SITE } from './data.js';

export const REQ_KEY = 'gc.admin.pedidos';
export const api = () => String(SITE.requestsApi || '').replace(/\/+$/, '');
export function readKey() { try { return sessionStorage.getItem(REQ_KEY) || ''; } catch (_) { return ''; } }
export function keepKey(k) { try { sessionStorage.setItem(REQ_KEY, k); } catch (_) {} }
export function dropKey() { try { sessionStorage.removeItem(REQ_KEY); } catch (_) {} }

export class WorkerError extends Error {
  constructor(status, code = '', extra = {}) { super(code || String(status)); this.status = status; this.code = code; this.extra = extra; }
}
const TIMEOUT = 15000;
export async function call(method, path, body, key = readKey()) {
  if (!api()) throw new WorkerError(0, 'desligado');
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
  let res;
  try {
    res = await fetch(`${api()}${path}`, {
      method, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal,
      headers: { Authorization: `Bearer ${key}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) { throw new WorkerError(0, ctl.signal.aborted ? 'tempo' : 'rede'); } finally { clearTimeout(timer); }
  let j = null;
  try { j = await res.json(); } catch (_) { j = null; }
  if (!res.ok) { const { error, ...extra } = j && typeof j === 'object' ? j : {}; throw new WorkerError(res.status, typeof error === 'string' ? error : '', extra); }
  return j;
}
export function errText(e) {
  if (!(e instanceof WorkerError)) return 'Algo correu mal nesta página. Recarrega-a e tenta outra vez.';
  if (e.code === 'desligado') return 'Os pedidos não estão ligados neste site (SITE.requestsApi vazio).';
  if (e.status === 0) return 'Sem ligação ao serviço dos pedidos. Verifica a rede e tenta outra vez.';
  if (e.status === 401) return 'A chave dos pedidos não está certa.';
  if (e.status === 429) return 'Demasiadas tentativas seguidas. Espera um minuto e tenta outra vez.';
  if (e.code === 'config') return 'O serviço dos pedidos ainda não está pronto no Cloudflare (falta um secret). Vê worker/README.md.';
  // (a Worker published before the supporters' routes answers 404 'nada' to them too)
  if (e.status === 404) return 'O serviço dos pedidos não encontrou isto: já saiu, ou o Worker ainda não tem esta parte (publica-o em Actions, Deploy pedidos).';
  if (e.code === 'muitos') return `O mural já tem o máximo de ${e.extra.max || ''} nomes.`;
  if (e.status >= 500) return `O serviço dos pedidos falhou (código ${e.status}). Tenta outra vez daqui a pouco.`;
  return `O serviço dos pedidos recusou (${e.code || e.status}).`;
}
