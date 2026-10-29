// The dashboard's only door to the analytics Worker (SPEC 5.1): Bearer ADMIN_KEY, a 15 s timeout, pt-PT errors, and
// the CSV export through a Blob (a plain link could not carry the key). Nothing else is sent: the query string holds
// the filters only.

const TIMEOUT = 15000;
const TTL = 60000;      // the Worker caches 60-300 s itself; this only saves trips when switching tabs back and forth

export const MSG = {
  key: 'Chave errada.',
  lost: 'A sessão terminou. Entra outra vez.',
  net: 'Não consegui falar com o contador. Verifica a rede e tenta outra vez.',
  limit: 'Demasiados pedidos seguidos. Espera um minuto e tenta outra vez.',
  period: 'Esse período não é válido: escolhe datas dos últimos 25 meses, com «De» antes de «Até».',
  server: 'O contador teve um erro. Tenta outra vez daqui a pouco.',
  panel: 'Não consegui carregar este painel.',
};

// an endpoint the Worker does not have yet (404 «nada»: the new version is not published): the panels say so and go on
export const missing = (e) => !!e && e.status === 404 && e.code === 'nada';
export const MSG_OLD = 'Fica disponível depois de publicares a versão nova do contador (Actions, Deploy stats: corre sozinha num push ao gh-pages que mude stats-worker/).';

export class ApiError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
  get text() {
    if (this.code === 'chave') return MSG.lost;
    if (this.code === 'limite') return MSG.limit;
    if (this.code === 'periodo' || this.code === 'filtro') return MSG.period;
    if (this.code === 'rede' || this.code === 'tempo') return MSG.net;
    return MSG.server;
  }
}

export function createApi({ base, key, onLost }) {
  const root = base.replace(/\/+$/, '') + '/admin/v1/';
  const cache = new Map();

  async function call(path, { params, method = 'GET', body, raw = false, fresh = false } = {}) {
    const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString() : '';
    const url = root + path + (qs ? `?${qs}` : '');
    if (method === 'GET' && !raw && !fresh) {
      const hit = cache.get(url);
      if (hit && Date.now() - hit.t < TTL) return hit.v;
    }
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT);
    let res;
    try {
      res = await fetch(url, {
        method, signal: ctl.signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
        headers: { Authorization: `Bearer ${key()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ApiError(ctl.signal.aborted ? 'tempo' : 'rede', 0);
    } finally { clearTimeout(timer); }
    if (!res.ok) {
      let code = 'interno';
      try { code = (await res.json()).error || code; } catch (_) {}
      if (res.status === 401) { code = 'chave'; if (onLost) onLost(); }
      throw new ApiError(code, res.status);
    }
    if (raw) return res;
    let v;
    try { v = await res.json(); } catch (_) { throw new ApiError('interno', res.status); }
    if (method === 'GET') {
      cache.set(url, { t: Date.now(), v });
      if (cache.size > 120) cache.delete(cache.keys().next().value);
    } else cache.clear();
    return v;
  }

  return {
    get: (path, params, opts = {}) => call(path, { params, ...opts }),
    post: (path, body) => call(path, { method: 'POST', body }),
    del: (path) => call(path, { method: 'DELETE' }),
    clear: () => cache.clear(),
    // the export: fetched with the key, then handed to the browser as a file
    async csv(params) {
      const res = await call('export.csv', { params, raw: true });
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const name = (cd.match(/filename="([^"]+)"/) || [, `gocarmo-${params.t}.csv`])[1];
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30000);
      return name;
    },
  };
}
