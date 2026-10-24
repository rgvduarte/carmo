// The 3D view's safety net. No three.js in here, so it loads, and can say what went wrong, even when three does not.
// - glSupport(): whether this browser can run three r170 at all (WebGL 2), without making a context.
// - Profiles: full (computers), phone (touch screens: the same picture in less GPU memory), lite (after a failure).
// - makeContext(): the canvas and its WebGL 2 context, made and checked here. iOS can hand back a context that is
//   already lost (a GPU process that was just killed), and three's constructor throws on one; release() gives an
//   abandoned context back, so a phone never piles them up towards WebKit's limit of 16.
// - Diagnostics: every failure gets a reason code (html[data-no3d] and console.error('[3d] …')). With ?debug3d a panel
//   shows the device, every context attempt, the timings and every loss, for a screenshot from the phone itself.
// Nothing here leaves the page: no request, and nothing stored beyond a few flags in this tab's sessionStorage.

const DEBUG = true;   // false removes the ?debug3d panel and window.__3d altogether

const ss = {
  get(k) { try { return sessionStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (_) {} },
};
// ?debug3d turns the panel on for this tab (it survives the reload of «Tentar outra vez»), ?debug3d=0 turns it off
if (DEBUG && /[?&]debug3d=0\b/.test(location.search)) ss.set('gc.debug3d', null);
else if (DEBUG && /[?&]debug3d\b/.test(location.search)) ss.set('gc.debug3d', '1');

export const D = { on: DEBUG && ss.get('gc.debug3d') === '1', t: {}, ctx: [], ev: [], err: [], profile: null, state: null, fps: null };
if (DEBUG) window.__3d = D;

const now = () => Math.round(performance.now());
// first time a step was reached, in ms since navigation
export function mark(k) { if (!(k in D.t)) { D.t[k] = now(); paint(); } }
export function note(kind, data = {}) { D.ev.push({ t: now(), kind, vis: document.visibilityState, ...data }); if (D.ev.length > 200) D.ev.shift(); paint(); }

// a failure with its reason code (the table in the commit that added this file) and where it happened
export class GLFail extends Error {
  constructor(code, where, cause) {
    super(cause && cause.message ? cause.message : String(cause || code));
    this.name = 'GLFail'; this.code = code; this.where = where; this.cause = cause;
  }
}
export function fail(code, where, e) {
  const r = { code, where, name: (e && e.name) || '', msg: String((e && e.message) ?? e ?? '').slice(0, 300), stack: String((e && e.stack) || '').split('\n').slice(0, 3).join(' | '), t: now(), vis: document.visibilityState };
  D.err.push(r); if (D.err.length > 50) D.err.shift();
  console.error(`[3d] ${code} @ ${where}:`, e);
  paint();
  return r;
}
export function setNo3d(r) {
  const d = document.documentElement.dataset;
  if (!r) { delete d.no3d; delete d.no3dWhere; delete d.no3dMsg; return; }
  d.no3d = r.code; d.no3dWhere = r.where || ''; d.no3dMsg = (r.msg || '').slice(0, 160);
}

const UA = navigator.userAgent;
export const isIOS = () => /iP(hone|ad|od)/.test(UA) || (/Macintosh/.test(UA) && navigator.maxTouchPoints > 1);
const APPS = /Instagram|FBAN|FBAV|FB_IAB|WhatsApp|musical_ly|BytedanceWebview|TikTok|LinkedInApp|GSA\/|Snapchat|Line\/|Twitter/;
export const inApp = () => APPS.test(UA);
// three r170 needs WebGL 2. Returns a reason code, or null when it is worth trying; makes no context.
export function glSupport() {
  if (typeof WebGLRenderingContext === 'undefined') return 'nowebgl';    // Lockdown Mode on iPhone, WebGL turned off
  if (typeof WebGL2RenderingContext === 'undefined') return 'nowebgl2';  // iOS 14 and older
  return null;
}
// on an iPhone or iPad, no WebGL interfaces at all is Lockdown Mode
export const lockdownHint = () => isIOS() && typeof WebGLRenderingContext === 'undefined';
// the line under the still picture, by reason: only a browser that cannot make WebGL 2 at all is "not available"
export function msgKey(r) {
  const c = r && r.code;
  if (c === 'nowebgl' && lockdownHint()) return 'suit.no3dLock';
  if (c === 'nowebgl' || c === 'nowebgl2' || c === 'ctx-create') return 'suit.no3d';
  if (c === 'import' || c === 'data') return 'suit.no3dNet';
  if (inApp()) return 'suit.no3dApp';
  // a GPU that hands out dead contexts: on an iPhone that stays so until Safari is closed for good (what fixed it)
  if (c === 'ctx-dead' || c === 'lost') return isIOS() ? 'suit.no3dSafari' : 'suit.no3dGpu';
  return 'suit.no3dErr';
}

// ---------- profiles ----------
const dpr = () => window.devicePixelRatio || 1;
const coarse = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
// pr: pixel ratio cap; atlas: atlas canvases at this fraction of the atlas size (drawing stays in atlas px);
// env: room reflection cube size; physical: MeshPhysicalMaterial (sheen, clearcoat, iridescence); evict: a model that
// is not on stage gives its atlases back to the GPU (three uploads them again from their canvases when it returns)
export const FULL = { name: 'full', pr: 2, antialias: true, power: 'default', atlas: 1, env: 256, physical: true, evict: false };
// Phones and tablets: the same picture in less GPU memory, which is what iOS takes a tab's context away over. No MSAA
// once the screen has 2 or more pixels per point (the drawing buffer is already that dense), one model's atlases at a time.
export const PHONE = { ...FULL, name: 'phone', antialias: dpr() < 2, evict: true };
// After a failure in this tab: about 40% of the memory, simpler materials, a different GPU path (high-performance).
export const LITE = { name: 'lite', pr: 1.5, antialias: false, power: 'high-performance', atlas: 0.5, env: 64, physical: false, evict: true };
// The same profile on the other GPU display: iOS keeps one WebGL display per power preference ('default' is the
// low-power one), and a display that died stays dead for every tab until Safari is quit. Contexts born lost on one
// can come up fine on the other.
export const hp = (p) => (p.power === 'high-performance' ? p : { ...p, name: `${p.name}-hp`, power: 'high-performance' });
// A page in this tab that was ended while its 3D was up and in view (iOS ends a tab that uses too much memory and
// reloads it, with no webglcontextlost): set while the studio is up and the page visible, cleared on hide and unload.
const UP = 'gc.3d.up', killed = ss.get(UP) === '1';
let up = false;
const syncUp = () => ss.set(UP, up && !document.hidden ? '1' : null);
export function setUp(on) { up = on; syncUp(); }
document.addEventListener('visibilitychange', syncUp);
addEventListener('pageshow', syncUp);
addEventListener('pagehide', () => ss.set(UP, null));
export function startProfile() {
  // a tab that needed lite once starts there (a reload on the way back from WhatsApp does not repeat the failing
  // attempt), and so does a page reloaded after the last one was ended with its 3D up
  if (/[?&]lite3d\b/.test(location.search) || ss.get('gc.3d.lite') === '1' || killed) return LITE;
  const p = coarse() ? PHONE : FULL;
  return ss.get('gc.3d.hp') === '1' ? hp(p) : p;
}
export const rememberLite = (on) => ss.set('gc.3d.lite', on ? '1' : null);
export const rememberHp = (on) => ss.set('gc.3d.hp', on ? '1' : null);
if (killed) D.ev.push({ t: 0, kind: 'reloaded-after-kill', vis: document.visibilityState });

// ---------- contexts ----------
export function makeContext({ antialias = false, power = 'default' } = {}) {
  const canvas = document.createElement('canvas'), rec = { t: now(), power, antialias };
  D.ctx.push(rec); if (D.ctx.length > 12) D.ctx.shift();
  canvas.addEventListener('webglcontextcreationerror', (e) => { rec.status = e.statusMessage || 'creation error'; });
  const attrs = { alpha: true, depth: true, stencil: false, antialias, premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: power };
  const t0 = performance.now();
  let gl = null;
  try { gl = canvas.getContext('webgl2', attrs); } catch (e) { rec.status = e.message; }
  rec.ms = Math.round(performance.now() - t0);
  if (!gl) {
    rec.ok = false;
    let v1 = false;
    try { const g1 = document.createElement('canvas').getContext('webgl'); v1 = !!g1; if (g1) g1.getExtension('WEBGL_lose_context')?.loseContext(); } catch (_) {}
    paint();
    throw new GLFail(v1 ? 'nowebgl2' : 'ctx-create', 'renderer', rec.status || 'getContext(webgl2) returned null');
  }
  const loser = gl.getExtension('WEBGL_lose_context');   // kept: getExtension answers null once the context is lost
  const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);        // a round trip to the GPU process
  rec.ms = Math.round(performance.now() - t0);
  if (gl.isContextLost() || !max) {
    rec.ok = false; rec.lost = true;
    release({ canvas, gl, loser });
    paint();
    throw new GLFail('ctx-dead', 'renderer', 'context lost at creation');
  }
  rec.ok = true;
  if (D.on) Object.assign(rec, glInfo(gl));
  paint();
  return { canvas, gl, loser };
}
function glInfo(gl) {
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info'), has = (n) => (gl.getSupportedExtensions() || []).includes(n);
    return {
      renderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER), version: gl.getParameter(gl.VERSION),
      maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), maxRb: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), maxSamples: gl.getParameter(gl.MAX_SAMPLES),
      attrs: gl.getContextAttributes(),
      ext: ['EXT_color_buffer_half_float', 'EXT_color_buffer_float', 'KHR_parallel_shader_compile', 'EXT_texture_filter_anisotropic', 'WEBGL_lose_context'].filter(has).join(' '),
    };
  } catch (e) { return { infoErr: e.message }; }
}
// Give an abandoned renderer (or a bare { canvas, gl, loser }) back: its memory now, and no restore later.
export function release(r) {
  if (!r) return;
  const c = r.domElement || r.canvas;
  let gl = null;
  try { gl = r.getContext ? r.getContext() : r.gl; } catch (_) {}
  const loser = r.loser || (gl && !gl.isContextLost() ? gl.getExtension('WEBGL_lose_context') : null);
  const lose = () => { try { if (loser && gl && !gl.isContextLost()) loser.loseContext(); } catch (_) {} };
  try { if (r.dispose) r.dispose(); } catch (_) {}   // three lets go of its listeners: the loss below is not prevented
  lose();
  if (c) { c.addEventListener('webglcontextrestored', lose, { once: true }); c.width = c.height = 1; c.remove(); }
}

// ---------- ?debug3d ----------
let panel = null, pre = null, timer = 0, small = false;
function paint() { if (D.on && !timer) timer = setTimeout(draw, 250); }
function device() {
  const ios = UA.match(/OS (\d+)_(\d+)(?:_(\d+))? like Mac OS X/), ver = UA.match(/Version\/([\d.]+)/);
  return {
    ua: UA, ios: ios ? ios.slice(1).filter(Boolean).join('.') : isIOS() ? 'iPadOS (desktop mode)' : null, version: ver ? ver[1] : null,
    host: (UA.match(APPS) || UA.match(/CriOS|FxiOS|EdgiOS/) || [isIOS() ? 'Safari' : 'browser'])[0], standalone: navigator.standalone ?? null,
    dpr: dpr(), viewport: `${innerWidth}x${innerHeight}`, screen: `${screen.width}x${screen.height}`, cores: navigator.hardwareConcurrency || null,
    reduce: matchMedia('(prefers-reduced-motion: reduce)').matches, fps: D.fps,
    lockdown: { WebGL: typeof WebGLRenderingContext, WebGL2: typeof WebGL2RenderingContext, indexedDB: !!window.indexedDB, FileReader: typeof FileReader },
  };
}
function dump() {
  let st = null;
  try { st = D.state ? D.state() : null; } catch (e) { st = { err: e.message }; }
  return { device: device(), profile: D.profile, now: st, t: D.t, contexts: D.ctx, errors: D.err, log: D.ev };
}
function draw() {
  timer = 0;
  if (!document.body) { paint(); return; }
  if (!panel) {
    panel = document.createElement('div');
    panel.setAttribute('aria-hidden', 'true');
    panel.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:2147483000;max-width:calc(100vw - 16px);max-height:55svh;overflow:auto;'
      + 'background:rgba(8,8,10,.92);color:#e8e8e3;font:11px/1.35 ui-monospace,Menlo,monospace;border:1px solid #333;border-radius:8px;padding:6px 8px;'
      + '-webkit-user-select:text;user-select:text;white-space:pre-wrap;word-break:break-all';
    const bar = document.createElement('div'); bar.style.cssText = 'display:flex;gap:6px;margin-bottom:4px';
    const btn = (label, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.style.cssText = 'font:inherit;color:inherit;background:#222;border:1px solid #444;border-radius:4px;padding:2px 6px'; b.addEventListener('click', fn); bar.appendChild(b); };
    btn('3D debug ▾', () => { small = !small; draw(); });
    btn('Copiar / Copy', () => { const s = JSON.stringify(dump(), null, 1); (navigator.clipboard ? navigator.clipboard.writeText(s) : Promise.reject()).catch(() => { const ta = document.createElement('textarea'); ta.value = s; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (_) {} ta.remove(); }); });
    pre = document.createElement('div');
    panel.append(bar, pre);
    document.body.appendChild(panel);
  }
  const d = dump(), err = d.errors[d.errors.length - 1];
  const head = `${d.profile || '-'} · ${d.now ? `${d.now.item || '-'} ${d.now.ctx || ''} rebuilds ${d.now.rebuilds ?? 0}` : 'no stage yet'}${document.documentElement.dataset.no3d ? ` · no3d ${document.documentElement.dataset.no3d}` : ''}${err ? ` · last error ${err.code}@${err.where}` : ''}`;
  if (small) { pre.textContent = head; return; }
  const L = [head, '', `UA ${d.device.ua}`, `iOS ${d.device.ios || '-'} · Version ${d.device.version || '-'} · ${d.device.host}${d.device.standalone ? ' (home screen)' : ''}`,
    `dpr ${d.device.dpr} · viewport ${d.device.viewport} · screen ${d.device.screen} · cores ${d.device.cores} · reduce ${d.device.reduce} · rAF ${d.device.fps ?? '…'} fps${d.device.fps && d.device.fps < 40 ? ' (Low Power Mode?)' : ''}`,
    `interfaces ${JSON.stringify(d.device.lockdown)}`, '', 'contexts:'];
  for (const c of d.contexts) L.push(`  @${c.t} ${c.ok ? 'ok' : c.lost ? 'BORN LOST' : 'FAILED'} ${c.ms ?? '?'}ms aa=${c.antialias} power=${c.power}${c.status ? ` status="${c.status}"` : ''}${c.renderer ? ` · ${c.renderer} · ${c.version} · maxTex ${c.maxTex} maxRb ${c.maxRb} samples ${c.maxSamples} · ${c.ext}` : ''}${c.attrs ? ` · got aa=${c.attrs.antialias} preserve=${c.attrs.preserveDrawingBuffer}` : ''}`);
  if (d.now) L.push('', `now ${JSON.stringify(d.now)}`);
  L.push('', `t ${Object.entries(d.t).map(([k, v]) => `${k} ${v}`).join(' · ')}`, '', 'errors:');
  for (const e of d.errors) L.push(`  @${e.t} [${e.vis}] ${e.code}@${e.where} ${e.name}: ${e.msg}${e.stack ? `\n    ${e.stack}` : ''}`);
  L.push('', 'log:');
  for (const e of d.log.slice(-60)) { const { t, kind, vis, ...rest } = e; L.push(`  @${t} [${vis}] ${kind}${Object.keys(rest).length ? ' ' + JSON.stringify(rest) : ''}`); }
  pre.textContent = L.join('\n');
}
if (D.on) {
  setInterval(paint, 2000);
  let n = 0, t0 = 0;
  const f = (t) => { if (!n) t0 = t; if (++n < 61) requestAnimationFrame(f); else { D.fps = Math.round(60000 / (t - t0)); paint(); } };
  requestAnimationFrame(f);
  paint();
}
