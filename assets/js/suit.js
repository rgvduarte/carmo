// Procedural 3D trisuit: geometry, print texture, spot tiles, picking, focus/tour, scroll poses
// and logo try-on. Everything is generated in code (no external mesh), so the suit, its panels
// and every sponsor spot stay editable from data/spots.json.
// Kit holds what every sponsor model shares (atlas, spot tiles, picking, poses, tour, logos, loop);
// Suit and the lazily loaded Helmet (helmet.js) extend it and can share one renderer.
// The suit's body is one continuous anatomical surface (suit-body.js), meshed in a worker (suit-mesh.js).
// three by its path, not the bare 'three': the same file the import map names, and it also loads without import maps
import * as THREE from '../vendor/three@0.170.0/build/three.module.min.js';
import { RoomEnvironment } from './room.js';
import { BODY, Part, anchorsFor, neckY, hermite, TAU, DEG, lerp, clamp } from './suit-body.js';
import { makeContext, release, GLFail, glSupport, note, startProfile } from './gl3d.js';

const ATLAS = 2048;

// colourway: white top, black shorts, white side panels, gold accent
export const COLORS = {
  top: '#f6f7f9', shorts: '#121519', panel: '#f6f7f9', hem: '#f6f7f9', collar: '#2a2c30', zip: '#4a4d53', gripper: '#23262b',
  seamOnLight: 'rgba(0,0,0,0.14)', seamOnDark: 'rgba(255,255,255,0.08)',
  gold: '#e6b450', inkDark: '#141414', inkLight: '#f6f7f9',
};
// the suit's studio pose (main.js scrolls into it; the helmet has its own)
export const HOME = { rot: -18 * DEG, dist: 2.3, ty: 0.235, y: 0.27, x: 0 };

// Atlas regions (canvas px). Each part of the suit owns one rectangle of the texture.
const REGIONS = {
  torso:   { x: 0,    y: 0,    w: 2048, h: 1300 },
  legL:    { x: 0,    y: 1316, w: 1024, h: 420 },
  legR:    { x: 1024, y: 1316, w: 1024, h: 420 },
  sleeveL: { x: 0,    y: 1752, w: 1024, h: 296 },
  sleeveR: { x: 1024, y: 1752, w: 1024, h: 296 },
};
const WAIST_Y = 0.165;   // top/shorts seam
const ZIP_END = 0.528;   // the zip runs from the collar down to here (just above the chest tile)

const sgnPow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);
const smooth = (t) => t * t * (3 - 2 * t);
export { hermite, TAU, DEG };

// ---------- 2D helpers ----------
function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function fitText(ctx, text, maxW, size, weight, family) {
  let s = Math.floor(size);
  ctx.font = `${weight} ${s}px ${family}`;
  while (ctx.measureText(text).width > maxW && s > 9) { s -= 1; ctx.font = `${weight} ${s}px ${family}`; }
  return s;
}

// ---------- shader ----------
const VERT_HEAD = `#include <common>\nvarying float vWy;`;
const VERT_BODY = `#include <begin_vertex>\nvWy = (modelMatrix * vec4(transformed, 1.0)).y;`;
const FRAG_HEAD = `#include <common>
varying float vWy;
uniform sampler2D uOverlay;
uniform float uSpots, uReveal, uTime, uDim, uSelOn, uHovOn, uYMin, uYMax;
uniform vec4 uSel, uHov;
uniform vec3 uGold;
float sdRect(vec2 p, vec4 r) {
  vec2 c = (r.xy + r.zw) * 0.5;
  vec2 h = abs(r.zw - r.xy) * 0.5 - 0.0025;
  vec2 d = abs(p - c) - h;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.0025;
}`;
// Outside the selected spot the model dims: the matte suit on its diffuse colour. A glossy model takes most of its
// light from the clearcoat and the room reflection, which a diffuse multiply never touches, so it sets DIM_LIT and the
// lit colour is scaled instead (FRAG_OUT), stopping at the outer edge of the gold ring so the ring keeps its glow.
const FRAG_MAP = `#include <map_fragment>
float selDim = 1.0;
{
  float sweep = 1.0 - (vWy - uYMin) / (uYMax - uYMin);
  float hide = smoothstep(uReveal - 0.12, uReveal, sweep);
  vec4 ov = texture2D(uOverlay, vMapUv);
  diffuseColor.rgb = mix(diffuseColor.rgb, ov.rgb, ov.a * uSpots * (1.0 - hide));
#ifdef DIM_LIT
  selDim = mix(1.0, DIM_LIT, uDim * uSelOn * step(0.0026, sdRect(vMapUv, uSel)));
#else
  float inSel = 1.0 - step(0.0, sdRect(vMapUv, uSel));
  diffuseColor.rgb *= mix(1.0, 0.42, uDim * uSelOn * (1.0 - inSel));
#endif
}`;
const FRAG_OUT = `#ifdef DIM_LIT
outgoingLight *= selDim;
#endif
#include <opaque_fragment>`;
const FRAG_EMIT = `#include <emissivemap_fragment>
{
  float pulse = 0.5 + 0.5 * sin(uTime * 4.2);
  float sdS = sdRect(vMapUv, uSel);
  float ringS = (1.0 - smoothstep(0.0011, 0.0026, abs(sdS))) * uSelOn;
  totalEmissiveRadiance += uGold * ringS * (0.55 + 0.9 * pulse);
  totalEmissiveRadiance += uGold * (1.0 - step(0.0, sdS)) * uSelOn * 0.06 * pulse;
  float ringH = (1.0 - smoothstep(0.0008, 0.0019, abs(sdRect(vMapUv, uHov)))) * uHovOn;
  totalEmissiveRadiance += vec3(0.55) * ringH;
}`;

// One PMREM room per renderer, shared by every scene drawn with it (WebGLRenderer has no userData).
const ENVS = new WeakMap();
export function envFor(r) {
  let e = ENVS.get(r);
  if (!e) {
    const pm = new THREE.PMREMGenerator(r), room = new RoomEnvironment(), size = (r.profile || Kit.profile).env || 256;
    // r170 always renders the room into a 256 cube; the lite profile asks for a smaller one (the same room, blurrier)
    if (size < 256 && typeof pm._setSize === 'function') { const set = pm._setSize; pm._setSize = (n) => set.call(pm, Math.min(n, size)); }
    e = pm.fromScene(room, 0.04).texture;
    pm.dispose(); room.dispose();   // the generator's ping-pong target and blur program are not needed again
    // made on a context that is lost: not kept, so the call after the restore (or the rebuild) renders it again
    if (r.getContext().isContextLost()) return e;
    ENVS.set(r, e);
    // the room is rendered on the GPU, so a lost context takes it along: after a restore the next call renders it again
    r.domElement.addEventListener('webglcontextrestored', () => ENVS.delete(r), { once: true });
  }
  return e;
}
const DEV = typeof location !== 'undefined' && /[?&]dev\b/.test(location.search);

// A sponsor model: one scene and camera, a colour atlas (base) and a spot-tile atlas (over).
// Subclasses set the statics and implement build() and drawBase(); everything else is shared.
// Several models can draw to one renderer (pass `renderer`); only the active one renders and takes input. Each model
// has its own container: the shared canvas moves into the container of the model that becomes active.
// No instance class fields in subclasses: this constructor calls build() before their initialisers run.
export class Kit {
  static ATLAS = ATLAS;
  static REGIONS = {};
  static HOME = HOME;
  static VIEWS = {};
  static ZOOM = [1.1, 3.2];
  static Y_RANGE = [-0.3, 0.66];   // world y span of the reveal sweep
  static ENV = 0.75;               // room reflection strength
  static DIM_LIT = 0;              // > 0: the selection dim scales the lit colour to this (glossy models)
  static TILE = 1;                 // tile frame scale: lines, dashes and corners for a denser atlas
  static profile = startProfile(); // gl3d.js: full, phone or lite; adspace picks it before a model is made
  static useProfile(p) { Kit.profile = p; }

  // The context is made and checked by gl3d.js (a context born lost never reaches three); no preserveDrawingBuffer:
  // every read of the canvas (freeze, snapshot) renders first, in the same task.
  static makeRenderer(p = Kit.profile) {
    const { canvas, gl, loser } = makeContext({ antialias: p.antialias, power: p.power });
    let r;
    try { r = new THREE.WebGLRenderer({ canvas, context: gl, antialias: p.antialias, alpha: true, powerPreference: p.power }); }
    catch (e) { const lost = gl.isContextLost(); release({ canvas, gl, loser }); throw new GLFail(lost ? 'ctx-dead' : 'ctx-create', 'renderer', e); }
    r.loser = loser; r.profile = p;
    r.setPixelRatio(Math.min(p.pr, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping !== undefined ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    r.debug.onShaderError = (g, prog, vs, fs) => {
      const log = (g.getProgramInfoLog(prog) || '').trim() || (g.getShaderInfoLog(fs) || '').trim() || (g.getShaderInfoLog(vs) || '').trim();
      note('shader-error', { log: log.slice(0, 200) }); console.error('THREE.WebGLProgram: shader error', log);
    };
    Kit.made = r;
    return r;
  }

  constructor(container, { spots, onSelect, onHover, money, labels = {}, renderer = null, active = true, profile = null }) {
    const K = this.constructor;
    this.el = container;
    this.spots = spots;
    this.onSelect = onSelect || (() => {});
    this.onHover = onHover || (() => {});
    this.money = money || ((n) => `${n} €`);
    this.labels = { sold: 'VENDIDO', reserved: 'RESERVADO', top: 'TOP SPOT', ...labels };
    this.selected = null; this.hovered = null; this.basket = new Set();
    this.logos = new Map();   // spot id -> canvas (prepared logo)
    this.reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.profile = profile || Kit.profile;
    this.size = K.ATLAS;
    this.k = this.profile.atlas || 1;   // the atlas canvases are this fraction of the atlas; drawing stays in atlas px
    this.state = { ...K.HOME };
    this.goal = { ...K.HOME };
    this.vel = 0; this.auto = !this.reduce; this.autoSpeed = 0.0026;
    this.uni = {
      uOverlay: { value: null }, uSpots: { value: 1 }, uReveal: { value: -0.2 },
      uTime: { value: 0 }, uDim: { value: 0 }, uSelOn: { value: 0 }, uHovOn: { value: 0 },
      uSel: { value: new THREE.Vector4(-1, -1, -1, -1) }, uHov: { value: new THREE.Vector4(-1, -1, -1, -1) },
      uGold: { value: new THREE.Color(COLORS.gold) }, uYMin: { value: K.Y_RANGE[0] }, uYMax: { value: K.Y_RANGE[1] },
    };
    this.spotsGoal = 1; this.revealGoal = -0.2; this.dimGoal = 0;

    this.ownsRenderer = !renderer;
    this.renderer = renderer || Kit.makeRenderer(this.profile);
    this.canvas = this.renderer.domElement;
    // a model on a shared renderer starts idle and only takes the canvas when it becomes active (setActive)
    if (this.canvas.parentElement !== this.el && (this.ownsRenderer || active)) { this.canvas.setAttribute('aria-hidden', 'true'); this.el.appendChild(this.canvas); }
    this.active = active;

    this.scene = new THREE.Scene();
    this.scene.environment = envFor(this.renderer);
    this.scene.environmentIntensity = K.ENV;
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(1.2, 1.9, 3.0);
    const rim = new THREE.DirectionalLight(0xdfe6ff, 1.5); rim.position.set(-2.4, 1.6, -2.0);
    const rim2 = new THREE.DirectionalLight(0xfff1dc, 0.8); rim2.position.set(2.4, 0.6, -2.2);
    this.scene.add(key, rim, rim2, new THREE.HemisphereLight(0xffffff, 0x1a1a1a, 0.3));

    this.base = document.createElement('canvas'); this.base.width = this.base.height = Math.round(this.size * this.k);
    this.over = document.createElement('canvas'); this.over.width = this.over.height = Math.round(this.size * this.k);
    this.bctx = this.base.getContext('2d', { willReadFrequently: true });
    this.octx = this.over.getContext('2d');
    // null once the page's canvases pass the browser's memory cap (iOS 16 and older)
    if (!this.bctx || !this.octx) { this.base.width = this.base.height = this.over.width = this.over.height = 0; throw new GLFail('canvas2d', 'atlas', 'getContext(2d) returned null'); }
    if (this.k !== 1) for (const g of [this.bctx, this.octx]) g.setTransform(this.k, 0, 0, this.k, 0, 0);
    this.maxAniso = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.baseTex = new THREE.CanvasTexture(this.base); this.baseTex.colorSpace = THREE.SRGBColorSpace; this.baseTex.anisotropy = this.maxAniso;
    this.overTex = new THREE.CanvasTexture(this.over); this.overTex.colorSpace = THREE.SRGBColorSpace; this.overTex.anisotropy = this.maxAniso;
    this.uni.uOverlay.value = this.overTex;

    this.model = new THREE.Group();
    this.meshes = [];
    this.build();
    this.scene.add(this.model);
    this.scene.add(this.shadowPlane());

    this.layoutSpots();
    this.drawBase();
    this.drawOverlay();
    this.bind();
    this.resize(true);
    this.visible = true; this.running = false;
    this.loop = this.loop.bind(this);
    this.kick();
  }

  // subclass: parts, meshes (push pickable ones to this.meshes, with userData.part) and details
  build() {}
  // subclass: paint this.base, then this.printLogos()
  drawBase() {}

  // the spot shader: tiles from the overlay atlas, dimming outside the selection, gold ring
  patch(mat) {
    const lit = this.constructor.DIM_LIT;
    if (lit) mat.defines = { ...mat.defines, DIM_LIT: lit.toFixed(3) };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uni);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', VERT_HEAD).replace('#include <begin_vertex>', VERT_BODY);
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', FRAG_HEAD).replace('#include <map_fragment>', FRAG_MAP).replace('#include <emissivemap_fragment>', FRAG_EMIT).replace('#include <opaque_fragment>', FRAG_OUT);
    };
    return mat;
  }

  // a part without spots (a visor, a lip) dims with the model when a spot is selected (glossy models, DIM_LIT)
  patchDim(mat) {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uDim = this.uni.uDim; sh.uniforms.uSelOn = this.uni.uSelOn;
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uDim, uSelOn;')
        .replace('#include <opaque_fragment>', `outgoingLight *= mix(1.0, ${this.constructor.DIM_LIT.toFixed(3)}, uDim * uSelOn);\n#include <opaque_fragment>`);
    };
    return mat;
  }

  shadowPlane(w = 0.9, d = 0.5, y = -0.265) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grd.addColorStop(0, 'rgba(0,0,0,0.5)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = y;
    return m;
  }

  // ---------- spots on the atlas ----------
  layoutSpots() {
    this.rects = new Map();
    const S = this.size;
    for (const s of this.spots) {
      const part = this.parts[s.part];
      if (!part) continue;
      const R = this.constructor.REGIONS[s.part];
      const v = part.vFor(s.t), u = part.uAt(s.phi, v), circ = part.circAt(v, u);   // local arc density at the spot
      // surface length per unit v; the helmet shell's varies across the arch, the suit's is constant
      const len = part.lengthAt ? part.lengthAt(u, v) : part.length;
      const du = (s.w / 100) / circ, dv = (s.h / 100) / len;
      const r = {
        part: s.part,
        x: R.x + (u - du / 2) * R.w, y: R.y + (1 - v - dv / 2) * R.h, w: du * R.w, h: dv * R.h,
        pxcmX: R.w / (circ * 100), pxcmY: R.h / (len * 100),
        anchor: part.anchor(s.phi, v),
      };
      r.uv = new THREE.Vector4(r.x / S, 1 - (r.y + r.h) / S, (r.x + r.w) / S, 1 - r.y / S);
      if (part.uRim) this.rimCheck(s, r, part, R, v, dv);
      this.rects.set(s.id, r);
    }
  }

  // open parts (the helmet shell) end at a rim that moves in uv; a rect past it would be cut off silently.
  // r.rimMargin = least distance (cm) from the rect to the rim; ?dev warns under 1 cm.
  rimCheck(s, r, part, R, v, dv) {
    const ua = (r.x - R.x) / R.w, ub = ua + r.w / R.w;
    let m = Infinity;
    for (let k = 0; k <= 8; k++) {
      const vv = v - dv / 2 + (dv * k) / 8, ur = part.uRim(vv);
      m = Math.min(m, (ur - ub) * part.circAt(vv) * 100, (ua - (1 - ur)) * part.circAt(vv) * 100);
    }
    r.rimMargin = m;
    if (DEV && m < 1) console.warn(`spot ${s.id}: ${m.toFixed(2)} cm from the rim`);
  }

  // sold sponsors and any logo being tried on, printed on the base atlas
  printLogos() {
    for (const s of this.spots) {
      const r = this.rects.get(s.id);
      if (!r) continue;
      r.light = this.isLightAt(r);
      const logo = this.logos.get(s.id) || (s.status === 'sold' && s._logo);
      // a logo that cannot be placed (a frame past the helmet's rim) is left out, never the rest of the print
      if (logo) try { this.drawLogo(logo, s, r); } catch (e) { console.warn(`logo ${s.id}:`, e); }
    }
  }

  isLightAt(r) {
    const d = this.bctx.getImageData(Math.round((r.x + r.w / 2) * this.k), Math.round((r.y + r.h / 2) * this.k), 1, 1).data;
    return 0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2] > 140;
  }

  drawLogo(img, s, r) {
    const ctx = this.bctx, rot = s.rot || 0, q = Math.abs(rot) === 90;   // q: logo axes swapped on the surface
    const wcm = q ? s.h : s.w, hcm = q ? s.w : s.h;    // logo axes in surface cm
    const fit = Math.min((wcm * 0.84) / img.width, (hcm * 0.78) / img.height);
    const lw = img.width * fit, lh = img.height * fit;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2);
    if (rot) { const px = q ? r.pxcmY : r.pxcmX, py = q ? r.pxcmX : r.pxcmY; ctx.rotate(rot * DEG); ctx.drawImage(img, (-lw * px) / 2, (-lh * py) / 2, lw * px, lh * py); }
    else ctx.drawImage(img, (-lw * r.pxcmX) / 2, (-lh * r.pxcmY) / 2, lw * r.pxcmX, lh * r.pxcmY);
    ctx.restore();
  }

  // the tile printed on each spot: dashed frame, number and price (or its status)
  drawOverlay() {
    const ctx = this.octx, T = this.constructor.TILE;   // frame lines, dashes and corners scale with the atlas density
    ctx.clearRect(0, 0, this.size, this.size);
    const topId = this.topId();
    for (const s of this.spots) {
      const r = this.rects.get(s.id);
      if (!r) continue;
      const hasLogo = this.logos.has(s.id) || (s.status === 'sold' && !!s._logo);
      const isTop = s.id === topId, sold = s.status === 'sold', reserved = s.status === 'reserved', inBasket = this.basket.has(s.id);
      const x = r.x + 3 * T, y = r.y + 3 * T, w = r.w - 6 * T, h = r.h - 6 * T, rad = 10 * T;
      ctx.save();
      // on the black shorts each free spot is a white patch, so every price reads at a glance
      const patch = !r.light && !hasLogo;
      if (patch) { roundRect(ctx, x, y, w, h, rad); ctx.fillStyle = 'rgba(246,247,249,0.94)'; ctx.fill(); }
      const dark = r.light || patch;
      const ink = dark ? COLORS.inkDark : COLORS.inkLight;
      if (isTop && !hasLogo) { roundRect(ctx, x, y, w, h, rad); ctx.fillStyle = 'rgba(230,180,80,0.22)'; ctx.fill(); }
      if (sold && !hasLogo) {
        roundRect(ctx, x, y, w, h, rad); ctx.save(); ctx.clip();
        ctx.strokeStyle = dark ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.16)'; ctx.lineWidth = 3 * T;
        for (let k = x - h; k < x + w; k += 15 * T) { ctx.beginPath(); ctx.moveTo(k, y + h); ctx.lineTo(k + h, y); ctx.stroke(); }
        ctx.restore();
      }
      if (!hasLogo || inBasket) {
        ctx.lineWidth = (inBasket ? 5 : 3) * T;
        ctx.strokeStyle = isTop ? COLORS.gold : inBasket ? ink : dark ? 'rgba(20,20,20,0.75)' : 'rgba(246,247,249,0.7)';
        ctx.setLineDash(sold || inBasket ? [] : (reserved ? [3, 8] : [13, 9]).map((d) => d * T));
        roundRect(ctx, x, y, w, h, rad); ctx.stroke();
        ctx.setLineDash([]);
      }
      if (!hasLogo) {
        const small = Math.min(r.w, r.h) < 90;
        const rot = s.rot || 0, q = Math.abs(rot) === 90, flip = Math.abs(rot) === 180;
        ctx.fillStyle = isTop ? COLORS.gold : ink;
        ctx.globalAlpha = 0.85;
        ctx.font = `600 ${small ? 13 : 16}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        // a tile turned 180° (read from behind) gets its number turned with it
        if (flip) { ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(Math.PI); ctx.translate(-(r.x + r.w / 2), -(r.y + r.h / 2)); }
        ctx.fillText(String(s.n).padStart(2, '0'), x + 10, y + 8);
        if (flip) ctx.restore();
        ctx.globalAlpha = 1;
        const label = sold ? this.labels.sold : reserved ? this.labels.reserved : this.money(s.price);
        ctx.save();
        ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + (rot ? 0 : small ? 4 : 7));
        if (rot) ctx.rotate(rot * DEG);
        const span = q ? h : w, depth = q ? w : h;
        const fs = fitText(ctx, label, span * 0.78, Math.min(depth * 0.5, 72), 800, 'Inter, system-ui, sans-serif');
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = ink;
        ctx.fillText(label, 0, 0);
        if (isTop && depth > 110) {
          ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
          ctx.fillStyle = COLORS.gold;
          ctx.fillText(this.labels.top, 0, -fs * 0.95);
        }
        ctx.restore();
      }
      ctx.restore();
    }
    this.overTex.needsUpdate = true;
  }

  topId() {
    const s = this.spots.find((x) => x.top && x.status !== 'sold');
    return s && s.id;
  }

  // panel band centred on an angle, following the arc-length layout row by row
  band(part, R, phiDeg, widthM, v0, v1, color, offsetM = 0) {
    const ctx = this.bctx;
    ctx.fillStyle = color;
    for (let py = Math.round(R.y + (1 - v1) * R.h); py < R.y + (1 - v0) * R.h; py++) {
      const v = 1 - (py - R.y) / R.h, u0 = part.uAt(phiDeg, v), C = part.circAt(v, u0);
      const u = u0 + offsetM / C, du = widthM / C;
      ctx.fillRect(R.x + (u - du / 2) * R.w, py, du * R.w + 0.6, 1);
    }
  }
  rowY(part, R, t) { return R.y + (1 - part.vFor(t)) * R.h; }

  // ---------- interaction ----------
  bind() {
    this.ray = new THREE.Raycaster();
    this.ptr = new THREE.Vector2();
    let down = null, lastX = 0, lastT = 0;
    this.onDown = (e) => {
      if (!this.active) return;
      down = { x: e.clientX, y: e.clientY, rot: this.goal.rot, moved: false, id: e.pointerId };
      lastX = e.clientX; lastT = performance.now(); this.vel = 0;
      this.el.dispatchEvent(new CustomEvent('suit:interact'));
    };
    this.onMove = (e) => {
      if (!this.active) return;
      if (down && e.pointerId === down.id) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
          down.moved = true; this.auto = false; try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
          // a focus pan leaves the turntable axis off-centre; recentre so the model turns in place
          if (this.goal.x) { this.goal.x = 0; this.goal.ty = this.constructor.HOME.ty; }
        }
        if (down.moved) {
          const now = performance.now();
          this.goal.rot = down.rot + dx * 0.0105;
          this.vel = (((e.clientX - lastX) * 0.0105) / Math.max(8, now - lastT)) * 16;
          lastX = e.clientX; lastT = now; this.kick();
        }
        return;
      }
      if (e.target === this.canvas && e.pointerType === 'mouse') { this.pendingHover = e; this.kick(); }
    };
    this.onUp = (e) => {
      if (!this.active) return;
      if (!down || e.pointerId !== down.id) return;
      if (!down.moved && e.target === this.canvas) this.clickAt(e);
      down = null;
    };
    this.onLeave = () => { if (!this.active) return; if (this.hovered) this.setHover(null); this.canvas.style.cursor = ''; };
    this.bindCanvas();
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', () => { down = null; });
    if (typeof ResizeObserver === 'function') this.ro = new ResizeObserver(() => this.resize());
    else {   // Safari before 13.1: the window's size, and the end of the stage's own height transition
      const f = () => this.resize();
      addEventListener('resize', f); this.el.addEventListener('transitionend', f);
      this.ro = { observe() {}, disconnect: () => { removeEventListener('resize', f); this.el.removeEventListener('transitionend', f); } };
    }
    this.ro.observe(this.el);
    // the newest entry: a fast jump can deliver two in one callback
    this.io = new IntersectionObserver((en) => { this.visible = en[en.length - 1].isIntersecting; this.kick(); });
    this.io.observe(this.el);
    document.addEventListener('visibilitychange', () => this.kick());
  }
  // the canvas's own listeners (a rebuilt renderer brings a new canvas, see rebind)
  bindCanvas() {
    const c = this.canvas;
    c.style.touchAction = 'pan-y';   // vertical swipes keep scrolling the page
    c.addEventListener('pointerdown', this.onDown);
    c.addEventListener('pointerleave', this.onLeave);
  }

  pick(e) {
    const b = this.canvas.getBoundingClientRect();
    // (a hair off the pixel centre: a ray through the exact middle of a centred model runs along the mirror line's
    // shared edges, where a triangle test can miss both sides)
    this.ptr.set(((e.clientX - b.left) / b.width) * 2 - 1 + 1e-4, -((e.clientY - b.top) / b.height) * 2 + 1 + 1e-4);
    this.ray.setFromCamera(this.ptr, this.camera);
    const hit = this.ray.intersectObjects(this.meshes, false)[0];
    if (!hit || !hit.uv || this.uni.uSpots.value < 0.5) return null;
    const px = hit.uv.x * this.size, py = (1 - hit.uv.y) * this.size, part = hit.object.userData.part;
    for (const s of this.spots) {
      const r = this.rects.get(s.id);
      if (r && r.part === part && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) return s.id;
    }
    return null;
  }

  setHover(id) {
    this.hovered = id;
    const r = id && this.rects.get(id);
    if (r) this.uni.uHov.value.copy(r.uv);
    this.uni.uHovOn.value = r && id !== this.selected ? 1 : 0;
    this.onHover(id);
    this.kick();
  }

  clickAt(e) {
    const id = this.pick(e);
    this.auto = false;
    if (id) this.select(id, { focus: true, emit: true });
    else if (this.selected) { this.select(null); this.onSelect(null); }
  }

  select(id, { focus = true, emit = false } = {}) {
    this.selected = id;
    const r = id && this.rects.get(id);
    if (r) this.uni.uSel.value.copy(r.uv);
    this.uni.uSelOn.value = r ? 1 : 0;
    this.dimGoal = r ? 1 : 0;
    if (this.hovered === id) this.uni.uHovOn.value = 0;
    if (r && focus) this.focus(id);
    if (emit) this.onSelect(id);
    this.kick();
  }

  setBasket(ids) { this.basket = new Set(ids); this.drawOverlay(); this.kick(); }
  setShowSpots(on) { this.spotsGoal = on ? 1 : 0; if (!on) this.select(null); this.kick(); }
  setAuto(on) { this.auto = on && !this.reduce; this.kick(); }
  update(spots) { this.spots = spots; this.layoutSpots(); this.drawBase(); this.drawOverlay(); this.kick(); }
  // hide every tile, then sweep them in from the top down
  hideSpots() { this.uni.uReveal.value = -0.2; this.revealGoal = -0.2; this.kick(); }
  reveal() { if (this.reduce) { this.uni.uReveal.value = this.revealGoal = 1.2; } else { this.uni.uReveal.value = -0.2; this.revealGoal = 1.2; } this.kick(); }

  // subclass: turn the model so the spot faces the camera and frame it
  focus() {}

  setPose(p, { shortest = true } = {}) {
    if (p.rot !== undefined) {
      let target = p.rot;
      if (shortest) {
        let d = (target - this.goal.rot) % TAU;
        if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
        target = this.goal.rot + d;
      }
      this.goal.rot = target; this.vel = 0; this.auto = false;
    }
    for (const k of ['dist', 'ty', 'y', 'x']) if (p[k] !== undefined) this.goal[k] = p[k];
    this.kick();
  }

  view(name) {
    const K = this.constructor, v = K.VIEWS[name] ?? K.VIEWS.front;
    this.select(null);
    this.setPose({ ...K.HOME, ...v });
  }

  home() { this.select(null); this.setPose({ ...this.constructor.HOME }); }
  zoom(dir) { const [a, b] = this.constructor.ZOOM; this.setPose({ dist: clamp(this.goal.dist * (dir > 0 ? 0.84 : 1.19), a, b) }); }

  async tour(ids, onStep, signal) {
    let first = true;
    for (const id of ids) {
      if (signal.aborted) return;
      this.select(id, { focus: true });
      onStep && onStep(id);
      const wait = (first ? 2200 : 1500) + (this.reduce ? 600 : 0);
      first = false;
      await new Promise((res) => { const t = setTimeout(res, wait); signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); });
    }
    if (!signal.aborted) { this.home(); onStep && onStep(null); }
  }

  // screen position of a spot centre, and whether it faces the camera
  project(id) {
    const r = this.rects.get(id);
    if (!r) return null;
    this.model.updateMatrixWorld();
    const p = r.anchor.p.clone().applyMatrix4(this.model.matrixWorld);
    const n = r.anchor.n.clone().transformDirection(this.model.matrixWorld);
    const facing = n.dot(new THREE.Vector3().subVectors(this.camera.position, p).normalize());
    const q = p.clone().project(this.camera);
    const b = this.canvas.getBoundingClientRect();
    return { x: (q.x * 0.5 + 0.5) * b.width, y: (-q.y * 0.5 + 0.5) * b.height, visible: facing > 0.2 && q.z < 1 };
  }

  // ---------- logos ----------
  static async prepareLogo(file, { removeWhite = true, mono = null } = {}) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const W0 = img.naturalWidth || 600, H0 = img.naturalHeight || 300;
      const k = Math.min(1, 900 / Math.max(W0, H0)), w = Math.max(1, Math.round(W0 * k)), h = Math.max(1, Math.round(H0 * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, w, h);
      const mc = mono && [parseInt(mono.slice(1, 3), 16), parseInt(mono.slice(3, 5), 16), parseInt(mono.slice(5, 7), 16)];
      if (removeWhite || mc) {
        const d = g.getImageData(0, 0, w, h), p = d.data;
        for (let i = 0; i < p.length; i += 4) {
          const r = p[i], gg = p[i + 1], b = p[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
          if (removeWhite && mn > 232 && mx - mn < 18) p[i + 3] = 0;
          else if (removeWhite && mn > 205 && mx - mn < 24) p[i + 3] = Math.min(p[i + 3], (232 - mn) * 9);
          if (mc) { p[i] = mc[0]; p[i + 1] = mc[1]; p[i + 2] = mc[2]; }   // one-colour knockout, alpha kept
        }
        g.putImageData(d, 0, 0);
      }
      const out = trim(c);
      if (out !== c) c.width = c.height = 0;   // its memory now, not at the next collection (iOS counts canvases until then)
      return out;
    } finally { URL.revokeObjectURL(url); }
  }

  setLogo(id, canvas) {
    if (canvas) this.logos.set(id, canvas); else this.logos.delete(id);
    this.drawBase(); this.drawOverlay(); this.kick();
  }

  async snapshot({ title = '', subtitle = '', width = 1080, height = 1350 } = {}) {
    if (this.lost()) return null;
    const u = this.uni, prev = [u.uSpots.value, u.uSelOn.value, u.uDim.value, u.uHovOn.value];
    u.uSpots.value = 0; u.uSelOn.value = 0; u.uDim.value = 0; u.uHovOn.value = 0;
    const size = new THREE.Vector2(); this.renderer.getSize(size);
    const pr = this.renderer.getPixelRatio();
    const H = Math.round(height * 0.84);
    const out = document.createElement('canvas'); out.width = width; out.height = height;
    try {
      this.renderer.setPixelRatio(1); this.renderer.setSize(width, H, false);
      this.camera.aspect = width / H; this.camera.updateProjectionMatrix();
      this.renderer.render(this.scene, this.camera);
      const g = out.getContext('2d');
      g.fillStyle = '#0b0b0c'; g.fillRect(0, 0, width, height);
      const grd = g.createRadialGradient(width / 2, H * 0.45, 0, width / 2, H * 0.45, width * 0.7);
      grd.addColorStop(0, '#1d1d20'); grd.addColorStop(1, '#0b0b0c');
      g.fillStyle = grd; g.fillRect(0, 0, width, H);
      g.drawImage(this.canvas, 0, 0, width, H);
      g.fillStyle = COLORS.gold; g.fillRect(64, H + 34, 48, 4);
      g.fillStyle = '#f2f1ec'; g.font = '700 40px Inter, system-ui, sans-serif'; g.textBaseline = 'top';
      g.fillText(title, 64, H + 56);
      g.fillStyle = '#9a9a95'; g.font = '500 26px Inter, system-ui, sans-serif';
      g.fillText(subtitle, 64, H + 110);
    } finally {   // whatever happened, the stage gets its own size, pixel ratio and tiles back
      this.renderer.setPixelRatio(pr); this.renderer.setSize(size.x, size.y, false); this.resize(true);
      [u.uSpots.value, u.uSelOn.value, u.uDim.value, u.uHovOn.value] = prev;
      this.kick();
    }
    const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
    out.width = out.height = 0;
    return blob;
  }

  // ---------- loop ----------
  // setSize clears the shared drawing buffer, so only the active model touches the renderer.
  // The buffer itself is reallocated once the size settles (now: at once): the compact stage animates its height, and
  // one allocation per frame churns the GPU memory a phone is short of. Meanwhile CSS stretches the old buffer, and the
  // camera already has the new aspect, so the picture keeps its proportions.
  resize(now = false) {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    if (this.active) {
      clearTimeout(this._rz);
      const s = this.renderer.getSize(this._sz ||= new THREE.Vector2());
      if (now) this.renderer.setSize(w, h, false);
      else if (s.x !== w || s.y !== h) this._rz = setTimeout(() => { if (this.active) this.resize(true); }, 150);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    }
    this.camera.aspect = w / h;
    this.fit = w / h < 0.85 ? 1 + (0.85 - w / h) * 1.05 : 1;   // keep the whole model framed on tall screens
    this.camera.updateProjectionMatrix();
    // a reallocated buffer is blank, and this can run after the frame's rAF draw (a part switch, the end of a snapshot):
    // draw again now, before paint, so the stage never shows an empty frame. Not while a fresh renderer is being bound
    // (rebind: its first frame belongs to the loop, once adspace watches the new context), and a throw here goes the
    // loop's way (suit:error)
    if (now && this.active && this.visible && !this.held && !this._binding && !document.hidden && !this.lost()) {
      try {
        this.camera.position.set(this.state.x, this.state.y, this.state.dist * (this.fit || 1));
        this.camera.lookAt(this.state.x, this.state.ty, 0);
        this.renderer.render(this.scene, this.camera);
      } catch (e) { this.el.dispatchEvent(new CustomEvent('suit:error', { detail: e })); }
    }
    this.kick();
  }

  // hand the shared canvas to this model (on), into its own container, or let it go idle (off)
  setActive(on) {
    this.active = on; this.pendingHover = null;
    clearTimeout(this._ev);
    if (!on) {
      this.vel = 0; if (this.hovered) this.setHover(null); this.canvas.style.cursor = '';
      if (this.profile.evict) this._ev = setTimeout(() => this.evict(), 1500);
      return;
    }
    if (this.canvas.parentElement !== this.el) { this.canvas.setAttribute('aria-hidden', 'true'); this.el.prepend(this.canvas); }
    this.resize(true); this.kick();
  }
  // Phones keep one model's atlases on the GPU: an idle model gives its textures back, and three uploads them again
  // from their canvases on its next frame (the part switch shows a still meanwhile).
  evict() { if (!this.active) for (const t of this.gpuTextures()) t.dispose(); }
  gpuTextures() { return [this.baseTex, this.overTex]; }

  lost() { return this.renderer.getContext().isContextLost(); }
  kick() { if (this.active && !this.held && !this.running && this.visible && !document.hidden && !this.lost()) { this.running = true; this._rest = 0; requestAnimationFrame(this.loop); } }
  // the booking dialog holds the stage still behind it: nothing to see there, and the blurred backdrop stays cheap
  hold(on) { this.held = on; if (!on) this.kick(); }

  // The GL context came back after a loss. three.js has rebuilt its GL state and uploads the canvas atlases again on
  // the next frame; only the room reflection has to be rendered anew, and every material that holds it swapped over.
  restoreGL() { this.swapEnv(this.scene.environment); this.running = false; this.kick(); }
  swapEnv(old) {
    const env = envFor(this.renderer);
    this.scene.environment = env;
    this.scene.traverse((o) => { const m = o.material; if (m && m.envMap && m.envMap === old) { m.envMap = env; m.needsUpdate = true; } });
  }
  // A fresh renderer (adspace rebuilds one when a lost context does not come back). Scenes, materials, geometries and
  // canvas textures live on the CPU side, so three uploads them to the new context on the first frame; only the room
  // reflection is a GPU render target, so it is made again.
  rebind(r) {
    if (this.renderer !== r) this.dropGPU();
    this.renderer = r; this.canvas = r.domElement;
    this.bindCanvas();
    // lost again while the room renders (Safari up to 26 throws there): the restore or the next rebuild renders it
    try { this.swapEnv(this.scene.environment); } catch (e) { if (!this.lost()) throw e; }
    this.running = false; this._drawn = false;
    this._binding = true;
    try { if (this.active) this.setActive(true); else this.resize(); } finally { this._binding = false; }
  }
  // The old renderer lets go of this model: its 'dispose' listeners on the textures, materials and geometries would
  // keep it reachable, with its context, which WebKit goes on trying to restore. three uploads all of it again to the
  // new renderer on the first frame (or in ready()).
  dropGPU() {
    try {
      for (const t of this.gpuTextures()) if (t) t.dispose();
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        for (const m of [].concat(o.material || [])) { if (m.normalMap) m.normalMap.dispose(); m.dispose(); }
      });
    } catch (_) {}
  }

  // A throw inside a frame (three on a context lost before its event arrives) must not leave `running` set, or the
  // model would never draw again; adspace hears about it (suit:error) and decides.
  loop(t) {
    if (!this.active || this.held || !this.visible || document.hidden || this.lost()) { this.running = false; return; }
    try { this.frame(t); } catch (e) { this.running = false; this.el.dispatchEvent(new CustomEvent('suit:error', { detail: e })); }
  }
  frame(t) {
    if (this.pendingHover) {
      const e = this.pendingHover; this.pendingHover = null;
      const id = this.pick(e);
      this.canvas.style.cursor = id ? 'pointer' : 'grab';
      if (id !== this.hovered) this.setHover(id);
    }
    if (this.auto) this.goal.rot += this.autoSpeed;
    else if (Math.abs(this.vel) > 0.0004) { this.goal.rot += this.vel; this.vel *= 0.93; }
    const k = this.reduce ? 1 : 0.075;
    let moving = this.auto || Math.abs(this.vel) > 0.0004;
    for (const key of ['rot', 'dist', 'ty', 'y', 'x']) {
      const d = this.goal[key] - this.state[key];
      this.state[key] += d * k;
      if (Math.abs(d) > 1e-4) moving = true;
    }
    const u = this.uni;
    const ease = (cur, goal, rate) => { const d = goal - cur; if (Math.abs(d) > 1e-3) moving = true; return this.reduce ? goal : cur + d * rate; };
    u.uSpots.value = ease(u.uSpots.value, this.spotsGoal, 0.12);
    u.uDim.value = ease(u.uDim.value, this.dimGoal, 0.1);
    u.uReveal.value = ease(u.uReveal.value, this.revealGoal, 0.03);
    u.uTime.value = t / 1000;
    if (u.uSelOn.value > 0 && !this.reduce) moving = true;   // the selection ring pulses
    this.model.rotation.y = this.state.rot;
    this.camera.position.set(this.state.x, this.state.y, this.state.dist * (this.fit || 1));
    this.camera.lookAt(this.state.x, this.state.ty, 0);
    this.renderer.render(this.scene, this.camera);
    this.el.dispatchEvent(new CustomEvent('suit:frame'));
    // once at rest, one frame more: the drawing buffer is not preserved, and a compositor that shows it a frame late
    // (WebKit on Linux does) would otherwise keep the frame before the last one on screen
    if (moving) { this._rest = 0; requestAnimationFrame(this.loop); } else if (!this._rest) { this._rest = 1; requestAnimationFrame(this.loop); } else this.running = false;
  }

  destroy() {
    this.visible = false; this.ro.disconnect(); this.io.disconnect();
    clearTimeout(this._rz); clearTimeout(this._ev);
    window.removeEventListener('pointermove', this.onMove); window.removeEventListener('pointerup', this.onUp);
    if (this.ownsRenderer) this.renderer.dispose();
    // a model on a shared renderer gives its own GPU memory back (the owner's goes with its context)
    else { for (const t of this.gpuTextures()) t.dispose(); this.scene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
    for (const c of [this.base, this.over]) c.width = c.height = 0;   // the atlases' memory now (iOS counts canvases until GC)
  }
}

// A procedural jersey-knit normal tile (columns of V loops), for the fabric's micro relief. size px, loops per side.
function knitTile(size = 256, loops = 8) {
  const H = new Float32Array(size * size), cell = size / loops;
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const jit = Float32Array.from({ length: loops * loops }, () => 0.85 + 0.3 * rnd());
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const cx = Math.floor(x / cell), cy = Math.floor(y / cell), lx = (x % cell) / cell, ly = (y % cell) / cell;
    let h = 0;
    for (const [ox, ang] of [[0.3, 0.5], [0.7, -0.5]]) {   // the two legs of a loop, leaning into a V
      const dx = lx - ox, dy = ly - 0.5, c = Math.cos(ang), s = Math.sin(ang);
      const u = (dx * c - dy * s) / 0.2, v = (dx * s + dy * c) / 0.52;
      h = Math.max(h, 1 - Math.min(1, u * u + v * v));
    }
    H[y * size + x] = Math.sqrt(h) * jit[(cy % loops) * loops + (cx % loops)] + 0.06 * rnd();
  }
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size), k = 2.2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const at = (i, j) => H[(((j + size) % size) * size) + ((i + size) % size)];
    const dx = (at(x + 1, y) - at(x - 1, y)) * k, dy = (at(x, y + 1) - at(x, y - 1)) * k, l = Math.hypot(dx, dy, 1);
    const o = (y * size + x) * 4;
    img.data[o] = (-dx / l * 0.5 + 0.5) * 255; img.data[o + 1] = (dy / l * 0.5 + 0.5) * 255; img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// rounded rectangle as a THREE.Shape (centred), for the zip slider and its puller
function roundShape(w, h, r, hole = null) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h); s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  if (hole) {
    const [hw, hh, hy] = hole, p = new THREE.Path(), hr = Math.min(hw, hh) / 2;
    p.absarc(0, hy + hh / 2 - hr, hr, 0, Math.PI, false); p.absarc(0, hy - hh / 2 + hr, hr, Math.PI, TAU, false);
    s.holes.push(p);
  }
  return s;
}

export class Suit extends Kit {
  static ATLAS = ATLAS;
  static REGIONS = REGIONS;
  static HOME = HOME;
  static VIEWS = { hero: { rot: HOME.rot }, front: { rot: 0 }, left: { rot: -90 * DEG }, back: { rot: 180 * DEG }, right: { rot: 90 * DEG } };
  static ZOOM = [1.1, 3.2];
  static Y_RANGE = [-0.3, 0.73];
  static ENV = 0.75;
  static BODY = BODY;
  static MESH_CELL = 0.0064;   // surface-net cell (m): about 69 k triangles, and 4 k more in the hems' lips

  build() {
    // the torso spans the atlas width and its u steps a little past 0 and 1 at its texture seam: repeat in s
    this.baseTex.wrapS = this.overTex.wrapS = THREE.RepeatWrapping;
    const B = this.constructor.BODY;
    this.anchors = anchorsFor(this.spots);
    this.parts = {};   // the body's parts come with the mesh; until then there are no tiles to lay out
    const knit = new THREE.CanvasTexture(knitTile());
    knit.wrapS = knit.wrapT = THREE.RepeatWrapping; knit.channel = 1; knit.anisotropy = this.maxAniso; knit.colorSpace = THREE.NoColorSpace;
    // lite: the same fabric without the sheen layer (a shorter shader to compile, a cheaper pixel)
    const fabric = { map: this.baseTex, roughness: 0.6, metalness: 0, vertexColors: true, normalMap: knit, normalScale: new THREE.Vector2(0.22, 0.22) };
    this.mat = this.patch(this.profile.physical === false ? new THREE.MeshStandardMaterial(fabric)
      : new THREE.MeshPhysicalMaterial({ ...fabric, sheen: 0.8, sheenRoughness: 0.45, sheenColor: new THREE.Color(0x8a8a8a) }));
    this.inner = new THREE.MeshStandardMaterial({ color: 0x7d8085, roughness: 1, side: THREE.BackSide });
    this.model.visible = false;   // until the mesh arrives
    const t0 = performance.now();
    this.ready = this.makeMesh({ body: B, anchors: this.anchors, h: this.constructor.MESH_CELL, regions: REGIONS, size: this.size, waist: WAIST_Y })
      .then((r) => {
        this.takeParts(r.body); this._lay = r.layout;
        this.layoutSpots(); this.drawBase(); this.drawOverlay();
        this.addMeshes(r);
        this.buildMs = Math.round(performance.now() - t0);
        return this;
      });
    this.ready.catch(() => {});   // a suit whose constructor threw later is never awaited: no unhandled rejection
  }

  // the parts, as the worker built them; the Kit reads a spot's anchor as THREE vectors
  takeParts(data) {
    for (const [k, d] of Object.entries(data)) {
      const p = Part.fromData(d), q = Object.create(p);
      q.anchor = (phi, v) => { const a = p.anchor(phi, v); return { p: new THREE.Vector3(...a.p), n: new THREE.Vector3(...a.n) }; };
      this.parts[k] = q;
    }
  }

  // the mesh, from a module worker; on the main thread if there is none (or it fails)
  makeMesh(opts) {
    const local = () => import('./suit-mesh.js').then((m) => { this.meshWhere = 'main'; return m.buildMesh(opts); });
    if (typeof Worker === 'undefined' || /[?&]noworker\b/.test(location.search)) return local();
    return new Promise((res, rej) => {
      let w;
      try { w = new Worker(import.meta.resolve ? import.meta.resolve('./suit-worker.js') : new URL('./suit-worker.js', import.meta.url), { type: 'module' }); } catch (e) { rej(e); return; }
      const done = (f) => { clearTimeout(timer); w.terminate(); f(); };
      const timer = setTimeout(() => done(() => rej(new Error('mesh worker timeout'))), 60000);
      // a result of the wrong shape (an old suit-mesh.js from the cache, a worker cut short) is built again here
      w.onmessage = (e) => done(() => (e.data && e.data.ok ? (meshOk(e.data) ? res(e.data) : rej(new Error('mesh worker: bad result'))) : rej(new Error(e.data && e.data.error))));
      w.onerror = (e) => { e.preventDefault && e.preventDefault(); done(() => rej(new Error('mesh worker failed'))); };
      w.postMessage(opts);
      this.meshWhere = 'worker';
    }).catch((e) => { if (DEV) console.warn('suit mesh on the main thread:', e.message); return local(); });
  }

  addMeshes({ parts, stats }) {
    this.stats = stats;
    for (const k of ['torso', 'sleeveL', 'sleeveR', 'legL', 'legR']) {
      const d = parts[k], g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(d.position, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(d.normal, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(d.uv, 2));
      g.setAttribute('uv1', new THREE.BufferAttribute(d.uv1, 2));
      g.setAttribute('color', new THREE.BufferAttribute(d.color, 3, true));
      g.setIndex(new THREE.BufferAttribute(d.index, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, this.mat); m.userData.part = k;
      this.model.add(m, new THREE.Mesh(g, this.inner)); this.meshes.push(m);
    }
    this.addDetails();
    this.model.visible = true;
    if (this.shadow) this.shadow.visible = true;
    this.kick();
  }

  // zip slider and puller under the collar, oriented by the chest's surface
  addDetails() {
    const T = this.parts.torso, y0 = neckY(0) - this.constructor.BODY.neck.binding - 0.012;
    const a = T.anchor(0, T.vFor(y0)), b = T.anchor(0, T.vFor(y0 + 0.01));
    const n = a.n.clone(), up = b.p.clone().sub(a.p).normalize(), x = new THREE.Vector3().crossVectors(up, n).normalize();
    up.crossVectors(n, x).normalize();
    const metal = new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.32, metalness: 0.7 });
    const slider = new THREE.Mesh(new THREE.ExtrudeGeometry(roundShape(0.0085, 0.013, 0.003), { depth: 0.0022, bevelEnabled: true, bevelThickness: 0.0009, bevelSize: 0.0009, bevelSegments: 3, curveSegments: 6 }), metal);
    const frame = new THREE.Matrix4().makeBasis(x, up, n);
    slider.quaternion.setFromRotationMatrix(frame);
    slider.position.copy(a.p).addScaledVector(n, 0.0011);
    // the puller hangs from the slider's foot, lifted a little off the fabric
    const tabG = new THREE.ExtrudeGeometry(roundShape(0.0068, 0.021, 0.0026, [0.0026, 0.006, 0.006]), { depth: 0.0009, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 2, curveSegments: 6 });
    tabG.translate(0, -0.0105, 0);
    const tab = new THREE.Mesh(tabG, metal);
    tab.quaternion.setFromRotationMatrix(frame).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.17));
    tab.position.copy(a.p).addScaledVector(n, 0.0042).addScaledVector(up, -0.0045);
    this.model.add(slider, tab);
  }

  // contact shadow: a soft pool, darker under each leg
  shadowPlane() {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const blob = (x, y, rx, ry, a) => {
      g.save(); g.translate(x, y); g.scale(rx / 128, ry / 128);
      const grd = g.createRadialGradient(0, 0, 0, 0, 0, 128); grd.addColorStop(0, `rgba(0,0,0,${a})`); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(-128, -128, 256, 256); g.restore();
    };
    blob(128, 128, 128, 128, 0.32); blob(88, 132, 46, 40, 0.38); blob(168, 132, 46, 40, 0.38);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = -0.275;
    m.visible = !!this.meshes.length;
    this.shadow = m;
    return m;
  }

  // ---------- print ----------

  drawBase() {
    const L = this._lay;
    if (!L) return;   // before the body arrives the model is hidden: nothing to print yet
    const ctx = this.bctx, P = this.parts, T = P.torso, RT = REGIONS.torso, B = this.constructor.BODY, S = this.size;
    // shorts everywhere, then the white top over the torso above the waist and on the sleeves
    ctx.fillStyle = COLORS.shorts; ctx.fillRect(0, 0, S, S);
    const waistPx = this.rowY(T, RT, WAIST_Y);
    ctx.fillStyle = COLORS.top; ctx.fillRect(RT.x, RT.y, RT.w, waistPx - RT.y);
    for (const k of ['sleeveL', 'sleeveR']) { const R = REGIONS[k]; ctx.fillRect(R.x, R.y, R.w, R.h); }
    // side panels on the legs and the hips
    ctx.fillStyle = COLORS.panel;
    for (const k of ['legL', 'legR', 'torso']) {
      const R = REGIONS[k];
      for (const [py, , spans] of L.stripes[k]) for (const [ua, ub] of spans) {
        const a = R.x + ua * R.w, b = R.x + ub * R.w;
        if (b >= a) ctx.fillRect(a, py, b - a + 0.6, 1);
        else { ctx.fillRect(a, py, R.x + R.w - a, 1); ctx.fillRect(R.x, py, b - R.x + 0.6, 1); }   // across the torso's wrap
      }
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // leg grippers: a charcoal elastic band with silicone dots, a coverstitch above it, the name line
    for (const k of ['legL', 'legR']) {
      const part = P[k], R = REGIONS[k], hemV = B.gripper.len / part.length, top = R.y + R.h * (1 - hemV);
      ctx.fillStyle = COLORS.gripper; ctx.fillRect(R.x, top, R.w, R.y + R.h - top + 10);
      ctx.save(); ctx.translate(R.x, top + 3); ctx.fillStyle = this.dots(ctx); ctx.fillRect(0, 0, R.w, R.y + R.h - top - 6); ctx.restore();
      ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(R.x, top - 1, R.w, 1.6);
      this.stitch(R.x, top - 6, R.x + R.w, 'rgba(255,255,255,0.16)');
      this.stitch(R.x, top + 5, R.x + R.w, 'rgba(255,255,255,0.10)', 6);
      ctx.fillStyle = 'rgba(246,247,249,0.62)'; ctx.font = '600 12px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText('GONÇALO CARMO · GOCARMO.COM', R.x + part.uAt(0, 0.03) * R.w, R.y + R.h * (1 - hemV * 0.5));
    }
    // sleeves: a cuff band that hugs the arm, with a coverstitch
    for (const k of ['sleeveL', 'sleeveR']) {
      const R = REGIONS[k], part = P[k], cuff = 0.018 / part.length, top = R.y + R.h * (1 - cuff);
      ctx.fillStyle = 'rgba(0,0,0,0.055)'; ctx.fillRect(R.x, top, R.w, R.y + R.h - top + 10);
      ctx.fillStyle = 'rgba(0,0,0,0.16)'; ctx.fillRect(R.x, top - 1, R.w, 1.2);
      this.stitch(R.x, top - 5, R.x + R.w, 'rgba(0,0,0,0.20)');
      this.stitch(R.x, top + 4, R.x + R.w, 'rgba(0,0,0,0.13)');
    }
    // waist seam and its stitching
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(RT.x, waistPx - 1, RT.w, 3);
    this.stitch(RT.x, waistPx - 8, RT.x + RT.w, COLORS.seamOnLight);
    // raglan seams: a fine line on the torso's edge and a coverstitch 3 mm inside the torso panel
    for (const { side, fb, pts } of L.raglan) {
      const path = (off, dash, color, w) => {
        ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash); ctx.beginPath();
        pts.forEach(([th, y], i) => { const v = T.vFor(y), u = T.uAtRad(th - side * fb * off, v), X = RT.x + u * RT.w, Y = RT.y + (1 - v) * RT.h; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
        ctx.stroke(); ctx.restore();
      };
      path(0.004, [], 'rgba(0,0,0,0.20)', 2.2);
      path(0.026, [5, 4], 'rgba(0,0,0,0.26)', 1.7);
    }
    // collar binding all the way round, with its coverstitch
    ctx.fillStyle = COLORS.collar;
    L.collar.forEach((y, px) => { const r = this.rowY(T, RT, y); ctx.fillRect(RT.x + px, RT.y, 1, r - RT.y); });
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    L.collar.forEach((y, px) => { if (px % 9 < 5) ctx.fillRect(RT.x + px, this.rowY(T, RT, y + 0.0028) - 0.8, 1, 1.6); });
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    L.collar.forEach((y, px) => ctx.fillRect(RT.x + px, this.rowY(T, RT, y), 1, 1.2));
    // front zip: tape and teeth from the binding down to ZIP_END
    const zx = RT.x + T.uAt(0, T.vFor(0.58)) * RT.w;
    const zTop = this.rowY(T, RT, neckY(0, B) - B.neck.binding) - 1, zBot = this.rowY(T, RT, ZIP_END);
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(zx - 8, zTop, 16, zBot - zTop);
    ctx.fillStyle = COLORS.zip; ctx.fillRect(zx - 6.5, zTop, 13, zBot - zTop);
    ctx.fillStyle = '#8c9096';
    for (let y = zTop + 2; y < zBot - 3; y += 4.4) { ctx.fillRect(zx - 3.6, y, 3.4, 2); ctx.fillRect(zx + 0.2, y + 2.2, 3.4, 2); }
    ctx.fillStyle = '#2f3237'; roundRect(ctx, zx - 6, zBot - 4, 12, 7, 3); ctx.fill();
    // printed logos: sold sponsors and any logo being tried on
    this.printLogos();
    this.bleed(ctx, 10);
    this.baseTex.needsUpdate = true;
  }

  // the gripper's silicone dots, staggered: one small tile, filled as a pattern
  dots(ctx) {
    if (!this._dots) {
      const c = document.createElement('canvas'); c.width = 7; c.height = 12;
      const g = c.getContext('2d'); g.fillStyle = 'rgba(255,255,255,0.07)';
      for (const [x, y] of [[1.2, 3], [4.7, 9]]) { g.beginPath(); g.arc(x, y, 1.25, 0, TAU); g.fill(); }
      this._dots = ctx.createPattern(c, 'repeat');
    }
    return this._dots;
  }

  // copy each region's border rows outward, so filtering and mipmaps never pick up a neighbour (the yokes above
  // the shoulder joints read the sleeves' top row). In canvas px: a lite atlas is smaller than the atlas units.
  bleed(ctx, n) {
    const c = ctx.canvas, k = this.k;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    n = Math.max(1, Math.round(n * k));
    for (const R0 of Object.values(REGIONS)) {
      const R = { x: Math.round(R0.x * k), y: Math.round(R0.y * k), w: Math.round(R0.w * k), h: Math.round(R0.h * k) };
      if (R.y > 0) ctx.drawImage(c, R.x, R.y, R.w, 1, R.x, Math.max(0, R.y - n), R.w, Math.min(n, R.y));
      const yb = R.y + R.h - 1;
      if (yb + 1 < c.height) ctx.drawImage(c, R.x, yb, R.w, 1, R.x, yb + 1, R.w, Math.min(n, c.height - yb - 1));
    }
    ctx.restore();
  }

  stitch(x0, y, x1, color, phase = 0) {
    const ctx = this.bctx;
    ctx.fillStyle = color;
    for (let x = x0 + phase; x < x1; x += 12) ctx.fillRect(x, y, 6, 2);
  }

  // turn the model so the spot faces the camera and frame it
  focus(id) {
    const s = this.spots.find((x) => x.id === id), r = this.rects.get(id);
    if (!s || !r) return;
    const size = Math.max(s.w, s.h);
    const wy = r.anchor.p.y;
    const tilt = s.part.startsWith('sleeve') ? (s.phi > 0 ? -12 : 12) * DEG : 0;
    this.setPose({ rot: -s.phi * DEG + tilt, dist: clamp(1.05 + size * 0.028, 1.15, 1.9), ty: wy, y: wy + 0.05 });
  }
}

function trim(c) {
  const g = c.getContext('2d'), w = c.width, h = c.height;
  const p = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (p[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) return c;
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(c, x0, y0, o.width, o.height, 0, 0, o.width, o.height);
  return o;
}

// the mesh worker's answer, checked before it is used: every part with its arrays, the body's parts, the print layout
const MESH_PARTS = ['torso', 'sleeveL', 'sleeveR', 'legL', 'legR'];
function meshOk(d) {
  if (!d || !d.parts || !d.body || !d.layout || !d.layout.stripes) return false;
  return MESH_PARTS.every((k) => {
    const p = d.parts[k];
    return !!p && !!d.body[k] && ['position', 'normal', 'uv', 'uv1', 'color', 'index'].every((a) => ArrayBuffer.isView(p[a]) && p[a].length > 0)
      && p.index.length % 3 === 0 && p.normal.length === p.position.length;
  });
}

// WebGL 2 is there to try (three r170 needs it). Makes no context: the renderer's own is made and checked in gl3d.js.
export function webglAvailable() { return !glSupport(); }

export { sgnPow, lerp, clamp, smooth, roundRect };
