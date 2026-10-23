// Procedural 3D trisuit: geometry, print texture, spot tiles, picking, focus/tour, scroll poses
// and logo try-on. Everything is generated in code (no external mesh), so the suit, its panels
// and every sponsor spot stay editable from data/spots.json.
// Kit holds what every sponsor model shares (atlas, spot tiles, picking, poses, tour, logos, loop);
// Suit and the lazily loaded Helmet (helmet.js) extend it and can share one renderer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
const ATLAS = 2048;

// colourway: white top, black shorts, charcoal side panels, gold accent
export const COLORS = {
  top: '#f6f7f9', shorts: '#121519', panel: '#f6f7f9', hem: '#f6f7f9', collar: '#8c8d90', zip: '#5a5d63',
  seamOnLight: 'rgba(0,0,0,0.14)', seamOnDark: 'rgba(255,255,255,0.08)',
  gold: '#e6b450', inkDark: '#141414', inkLight: '#f6f7f9',
};
export const HOME = { rot: -18 * DEG, dist: 2.2, ty: 0.19, y: 0.23, x: 0 };

// Atlas regions (canvas px). Each part of the suit owns one rectangle of the texture.
const REGIONS = {
  torso:   { x: 0,    y: 0,    w: 2048, h: 1228 },
  legL:    { x: 0,    y: 1256, w: 1024, h: 452 },
  legR:    { x: 1024, y: 1256, w: 1024, h: 452 },
  sleeveL: { x: 0,    y: 1736, w: 1024, h: 312 },
  sleeveR: { x: 1024, y: 1736, w: 1024, h: 312 },
};

// Torso profile from below the crotch to the collar (m): y, half width, front depth, back depth, squareness.
const TORSO = [
  [0.030, 0.104, 0.058, 0.068, 2.0],
  [0.060, 0.140, 0.084, 0.096, 2.1],
  [0.092, 0.155, 0.095, 0.108, 2.2],
  [0.130, 0.153, 0.096, 0.105, 2.25],
  [0.200, 0.143, 0.094, 0.096, 2.3],
  [0.300, 0.152, 0.102, 0.099, 2.35],
  [0.400, 0.176, 0.119, 0.106, 2.4],
  [0.470, 0.188, 0.117, 0.110, 2.45],
  [0.530, 0.193, 0.104, 0.103, 2.5],
  [0.575, 0.176, 0.087, 0.087, 2.45],
  [0.605, 0.127, 0.071, 0.071, 2.4],
  [0.630, 0.081, 0.061, 0.061, 2.0],
  [0.662, 0.072, 0.059, 0.059, 2.0],
];
const TORSO_Y0 = 0.03;
const TORSO_LEN = 0.632;
const WAIST_Y = 0.165;   // top/shorts seam
const ZIP_END = 0.485;   // the zip runs from the collar down to here

const sgnPow = (x, p) => Math.sign(x) * Math.pow(Math.abs(x), p);
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (t) => t * t * (3 - 2 * t);

// Cubic Hermite through non-uniform control points (Catmull-Rom style tangents).
// P rows are [x, ...values]; returns the values at x.
export function hermite(P, x) {
  if (x <= P[0][0]) return P[0].slice(1);
  if (x >= P[P.length - 1][0]) return P[P.length - 1].slice(1);
  let i = 0;
  while (x > P[i + 1][0]) i++;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
  const h = p2[0] - p1[0];
  const t = (x - p1[0]) / h, t2 = t * t, t3 = t2 * t;
  const out = [];
  for (let k = 1; k < p1.length; k++) {
    const m1 = ((p2[k] - p0[k]) / (p2[0] - p0[0] || 1)) * h;
    const m2 = ((p3[k] - p1[k]) / (p3[0] - p1[0] || 1)) * h;
    out.push((2 * t3 - 3 * t2 + 1) * p1[k] + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2[k] + (t3 - t2) * m2);
  }
  return out;
}
const profileAt = (y) => hermite(TORSO, y);

// A suit part is a stack of super-elliptic rings. Each ring keeps an arc-length table so that
// texture u is proportional to distance around the body (logos keep their proportions).
class Part {
  constructor(name, rings, seamDeg, length, t0 = 0) {
    this.name = name;
    this.rings = rings;
    this.seam = seamDeg * DEG;   // angle (0 = front, +90 = towards +x) where the texture wraps
    this.length = length;
    this.t0 = t0;                // spot heights (t) are measured from here along the part
    this.K = 480;
    this.tables = rings.map((r) => this.table(r));
  }
  point(r, phi, out = new THREE.Vector3()) {
    const sn = Math.sin(phi), cs = Math.cos(phi), e = 2 / r.n;
    return out.copy(r.c).addScaledVector(r.s, r.a * sgnPow(sn, e)).addScaledVector(r.f, (cs >= 0 ? r.bf : r.bb) * sgnPow(cs, e));
  }
  table(r) {
    const L = new Float32Array(this.K + 1);
    const a = this.point(r, this.seam), b = new THREE.Vector3();
    for (let k = 1; k <= this.K; k++) {
      this.point(r, this.seam + (k / this.K) * TAU, b);
      L[k] = L[k - 1] + a.distanceTo(b);
      a.copy(b);
    }
    return L;
  }
  phiForU(ti, u) {
    const L = this.tables[ti], target = u * L[this.K];
    let lo = 0, hi = this.K;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (L[mid] < target) lo = mid; else hi = mid; }
    const f = (target - L[lo]) / ((L[hi] - L[lo]) || 1);
    return this.seam + ((lo + f) / this.K) * TAU;
  }
  uForPhiRing(ti, phi) {
    let d = (phi - this.seam) % TAU; if (d < 0) d += TAU;
    const L = this.tables[ti], k = (d / TAU) * this.K, k0 = Math.floor(k), k1 = Math.min(this.K, k0 + 1);
    return lerp(L[k0], L[k1], k - k0) / L[this.K];
  }
  ringIndex(v) { const x = clamp(v, 0, 1) * (this.rings.length - 1); const i = Math.min(this.rings.length - 2, Math.floor(x)); return [i, i + 1, x - i]; }
  vFor(t) { return (t - this.t0) / this.length; }
  uAt(phiDeg, v) { const [i0, i1, f] = this.ringIndex(v); return lerp(this.uForPhiRing(i0, phiDeg * DEG), this.uForPhiRing(i1, phiDeg * DEG), f); }
  circAt(v) { const [i0, i1, f] = this.ringIndex(v); return lerp(this.tables[i0][this.K], this.tables[i1][this.K], f); }
  // surface point + outward normal at (phi, v), in model space
  anchor(phiDeg, v) {
    const [i0, i1, f] = this.ringIndex(v);
    const a = this.point(this.rings[i0], phiDeg * DEG), b = this.point(this.rings[i1], phiDeg * DEG);
    const p = a.lerp(b, f);
    const c = new THREE.Vector3().lerpVectors(this.rings[i0].c, this.rings[i1].c, f);
    const n = new THREE.Vector3().subVectors(p, c);
    const ax = new THREE.Vector3().subVectors(this.rings[i1].c, this.rings[i0].c).normalize();
    n.addScaledVector(ax, -n.dot(ax)).normalize();
    return { p, n };
  }
  geometry(cols, region, size = ATLAS) {
    const R = this.rings.length;
    const pos = new Float32Array(R * (cols + 1) * 3), uv = new Float32Array(R * (cols + 1) * 2);
    const p = new THREE.Vector3();
    for (let i = 0; i < R; i++) {
      const v = i / (R - 1);
      for (let j = 0; j <= cols; j++) {
        const u = j / cols, k = i * (cols + 1) + j;
        this.point(this.rings[i], this.phiForU(i, u), p);
        pos.set([p.x, p.y, p.z], k * 3);
        uv.set([(region.x + u * region.w) / size, 1 - (region.y + (1 - v) * region.h) / size], k * 2);
      }
    }
    const idx = [];
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 2, d = a + cols + 1;
      idx.push(a, b, c, a, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.attributes.normal;   // weld normals across the texture seam
    for (let i = 0; i < R; i++) {
      const a = i * (cols + 1), b = a + cols;
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
    g.computeBoundingSphere();
    return g;
  }
}

function buildTorso() {
  const rings = [], N = 118;
  for (let i = 0; i < N; i++) {
    const y = TORSO_Y0 + (i / (N - 1)) * TORSO_LEN;
    const [a, bf, bb, n] = profileAt(y);
    rings.push({ c: new THREE.Vector3(0, y, 0), s: new THREE.Vector3(1, 0, 0), f: new THREE.Vector3(0, 0, 1), a, bf, bb, n });
  }
  return new Part('torso', rings, 225, TORSO_LEN, TORSO_Y0);
}

// Tube along an axis, rings ordered hem -> top so the winding matches the torso.
function buildTube(name, hem, top, seamDeg, radius, N = 56) {
  const up = new THREE.Vector3().subVectors(top, hem);
  const length = up.length();
  up.normalize();
  const f = new THREE.Vector3(0, 0, 1);
  const s = new THREE.Vector3(1, 0, 0).addScaledVector(up, -up.x).normalize();
  const rings = [];
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1), r = radius(t);
    rings.push({ c: new THREE.Vector3().copy(hem).addScaledVector(up, t * length), s, f, a: r.a, bf: r.bf, bb: r.bb, n: r.n || 2.05 });
  }
  return new Part(name, rings, seamDeg, length);
}

function buildParts() {
  const torso = buildTorso();
  // thigh: the top fifth tucks inside the hips so its rim never shows
  const leg = (t) => {
    const k = smooth(Math.min(1, t / 0.8));
    const tuck = t > 0.86 ? 1 - 0.3 * smooth((t - 0.86) / 0.14) : 1;
    return { a: lerp(0.068, 0.080, k) * tuck, bf: lerp(0.071, 0.083, k) * tuck, bb: lerp(0.073, 0.090, k) * tuck };
  };
  const legL = buildTube('legL', new THREE.Vector3(0.088, -0.25, 0.010), new THREE.Vector3(0.073, 0.135, -0.008), 270, leg);
  const legR = buildTube('legR', new THREE.Vector3(-0.088, -0.25, 0.010), new THREE.Vector3(-0.073, 0.135, -0.008), 90, leg);
  // sleeve: open hem, then a domed cap that reads as the deltoid
  const sleeve = (t) => {
    if (t < 0.7) { const k = smooth(t / 0.7); return { a: lerp(0.047, 0.053, k), bf: lerp(0.046, 0.051, k), bb: lerp(0.046, 0.051, k) }; }
    const c = Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.7) / 0.3, 2)));
    return { a: 0.053 * c + 0.002, bf: 0.051 * c + 0.002, bb: 0.051 * c + 0.002 };
  };
  const sleeveL = buildTube('sleeveL', new THREE.Vector3(0.228, 0.412, -0.004), new THREE.Vector3(0.166, 0.598, -0.006), 270, sleeve, 44);
  const sleeveR = buildTube('sleeveR', new THREE.Vector3(-0.228, 0.412, -0.004), new THREE.Vector3(-0.166, 0.598, -0.006), 90, sleeve, 44);
  return { torso, legL, legR, sleeveL, sleeveR };
}

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
    e = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.04).texture; ENVS.set(r, e);
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

  static makeRenderer() {
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping !== undefined ? THREE.NeutralToneMapping : THREE.ACESFilmicToneMapping;
    return r;
  }

  constructor(container, { spots, onSelect, onHover, money, labels = {}, renderer = null, active = true }) {
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
    this.size = K.ATLAS;
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
    this.renderer = renderer || Kit.makeRenderer();
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

    this.base = document.createElement('canvas'); this.base.width = this.base.height = this.size;
    this.over = document.createElement('canvas'); this.over.width = this.over.height = this.size;
    this.bctx = this.base.getContext('2d', { willReadFrequently: true });
    this.octx = this.over.getContext('2d');
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
    this.resize();
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
      const v = part.vFor(s.t), u = part.uAt(s.phi, v), circ = part.circAt(v);
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
      if (logo) this.drawLogo(logo, s, r);
    }
  }

  isLightAt(r) {
    const d = this.bctx.getImageData(Math.round(r.x + r.w / 2), Math.round(r.y + r.h / 2), 1, 1).data;
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
      const v = 1 - (py - R.y) / R.h, C = part.circAt(v);
      const u = part.uAt(phiDeg, v) + offsetM / C, du = widthM / C;
      ctx.fillRect(R.x + (u - du / 2) * R.w, py, du * R.w + 0.6, 1);
    }
  }
  rowY(part, R, t) { return R.y + (1 - part.vFor(t)) * R.h; }

  // ---------- interaction ----------
  bind() {
    const c = this.canvas;
    c.style.touchAction = 'pan-y';   // vertical swipes keep scrolling the page
    this.ray = new THREE.Raycaster();
    this.ptr = new THREE.Vector2();
    let down = null, lastX = 0, lastT = 0;
    c.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      down = { x: e.clientX, y: e.clientY, rot: this.goal.rot, moved: false, id: e.pointerId };
      lastX = e.clientX; lastT = performance.now(); this.vel = 0;
      this.el.dispatchEvent(new CustomEvent('suit:interact'));
    });
    this.onMove = (e) => {
      if (!this.active) return;
      if (down && e.pointerId === down.id) {
        const dx = e.clientX - down.x, dy = e.clientY - down.y;
        if (!down.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
          down.moved = true; this.auto = false; try { c.setPointerCapture(e.pointerId); } catch (_) {}
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
      if (e.target === c && e.pointerType === 'mouse') { this.pendingHover = e; this.kick(); }
    };
    this.onUp = (e) => {
      if (!this.active) return;
      if (!down || e.pointerId !== down.id) return;
      if (!down.moved && e.target === c) this.clickAt(e);
      down = null;
    };
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', () => { down = null; });
    c.addEventListener('pointerleave', () => { if (!this.active) return; if (this.hovered) this.setHover(null); c.style.cursor = ''; });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.el);
    this.io = new IntersectionObserver((en) => { this.visible = en[0].isIntersecting; this.kick(); });
    this.io.observe(this.el);
    document.addEventListener('visibilitychange', () => this.kick());
  }

  pick(e) {
    const b = this.canvas.getBoundingClientRect();
    this.ptr.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
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
      return trim(c);
    } finally { URL.revokeObjectURL(url); }
  }

  setLogo(id, canvas) {
    if (canvas) this.logos.set(id, canvas); else this.logos.delete(id);
    this.drawBase(); this.drawOverlay(); this.kick();
  }

  async snapshot({ title = '', subtitle = '', width = 1080, height = 1350 } = {}) {
    const u = this.uni, prev = [u.uSpots.value, u.uSelOn.value, u.uDim.value, u.uHovOn.value];
    u.uSpots.value = 0; u.uSelOn.value = 0; u.uDim.value = 0; u.uHovOn.value = 0;
    const size = new THREE.Vector2(); this.renderer.getSize(size);
    const pr = this.renderer.getPixelRatio();
    const H = Math.round(height * 0.84);
    this.renderer.setPixelRatio(1); this.renderer.setSize(width, H, false);
    this.camera.aspect = width / H; this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
    const out = document.createElement('canvas'); out.width = width; out.height = height;
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
    this.renderer.setPixelRatio(pr); this.renderer.setSize(size.x, size.y, false); this.resize();
    [u.uSpots.value, u.uSelOn.value, u.uDim.value, u.uHovOn.value] = prev;
    this.kick();
    return await new Promise((res) => out.toBlob(res, 'image/png'));
  }

  // ---------- loop ----------
  // setSize clears the shared drawing buffer, so only the active model touches the renderer
  resize() {
    const w = this.el.clientWidth || 1, h = this.el.clientHeight || 1;
    if (this.active) {
      this.renderer.setSize(w, h, false);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    }
    this.camera.aspect = w / h;
    this.fit = w / h < 0.85 ? 1 + (0.85 - w / h) * 1.05 : 1;   // keep the whole model framed on tall screens
    this.camera.updateProjectionMatrix();
    this.kick();
  }

  // hand the shared canvas to this model (on), into its own container, or let it go idle (off)
  setActive(on) {
    this.active = on; this.pendingHover = null;
    if (!on) { this.vel = 0; if (this.hovered) this.setHover(null); this.canvas.style.cursor = ''; return; }
    if (this.canvas.parentElement !== this.el) { this.canvas.setAttribute('aria-hidden', 'true'); this.el.prepend(this.canvas); }
    this.resize(); this.kick();
  }

  kick() { if (this.active && !this.held && !this.running && this.visible && !document.hidden) { this.running = true; requestAnimationFrame(this.loop); } }
  // the booking dialog holds the stage still behind it: nothing to see there, and the blurred backdrop stays cheap
  hold(on) { this.held = on; if (!on) this.kick(); }

  // The GL context came back after a loss. three.js has rebuilt its GL state and uploads the canvas atlases again on
  // the next frame; only the room reflection has to be rendered anew, and every material that holds it swapped over.
  restoreGL() {
    const old = this.scene.environment, env = envFor(this.renderer);
    this.scene.environment = env;
    this.scene.traverse((o) => { const m = o.material; if (m && m.envMap && m.envMap === old) { m.envMap = env; m.needsUpdate = true; } });
    this.kick();
  }

  loop(t) {
    if (!this.active || this.held || !this.visible || document.hidden) { this.running = false; return; }
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
    if (moving) requestAnimationFrame(this.loop); else this.running = false;
  }

  destroy() {
    this.visible = false; this.ro.disconnect(); this.io.disconnect();
    window.removeEventListener('pointermove', this.onMove); window.removeEventListener('pointerup', this.onUp);
    if (this.ownsRenderer) this.renderer.dispose();
  }
}

export class Suit extends Kit {
  static ATLAS = ATLAS;
  static REGIONS = REGIONS;
  static HOME = HOME;
  static VIEWS = { hero: { rot: HOME.rot }, front: { rot: 0 }, left: { rot: -90 * DEG }, back: { rot: 180 * DEG }, right: { rot: 90 * DEG } };
  static ZOOM = [1.1, 3.2];
  static Y_RANGE = [-0.3, 0.66];
  static ENV = 0.75;

  build() {
    this.parts = buildParts();
    const mat = this.patch(new THREE.MeshPhysicalMaterial({ map: this.baseTex, roughness: 0.62, metalness: 0, sheen: 0.8, sheenRoughness: 0.5, sheenColor: new THREE.Color(0x8a8a8a) }));
    const inner = new THREE.MeshStandardMaterial({ color: 0xb3b5b9, roughness: 1, side: THREE.BackSide });
    const cols = { torso: 168, legL: 96, legR: 96, sleeveL: 64, sleeveR: 64 };
    for (const [name, part] of Object.entries(this.parts)) {
      const g = part.geometry(cols[name], REGIONS[name], this.size);
      const m = new THREE.Mesh(g, mat); m.userData.part = name;
      this.model.add(m, new THREE.Mesh(g, inner)); this.meshes.push(m);
    }
    this.addDetails();
  }

  addDetails() {
    // dark recess inside each sleeve so the hollow reads as depth
    const capMat = new THREE.MeshStandardMaterial({ color: 0xc4c6ca, roughness: 1 });
    for (const k of ['sleeveL', 'sleeveR']) {
      const part = this.parts[k], r = part.rings[5];
      const cap = new THREE.Mesh(new THREE.CircleGeometry(1, 32), capMat);
      cap.position.copy(r.c); cap.scale.set(r.a * 0.98, r.bf * 0.98, 1);
      const up = new THREE.Vector3().subVectors(part.rings[part.rings.length - 1].c, part.rings[0].c).normalize();
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), up);
      this.model.add(cap);
    }
    // zip puller just under the collar
    const T = this.parts.torso;
    const { p, n } = T.anchor(0, T.vFor(0.625));
    const pull = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.026, 0.004), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.35, metalness: 0.6 }));
    pull.position.copy(p).addScaledVector(n, 0.004).add(new THREE.Vector3(0, -0.012, 0));
    pull.lookAt(pull.position.clone().add(n));
    pull.rotateX(-0.25);
    this.model.add(pull);
  }

  drawBase() {
    const ctx = this.bctx, P = this.parts, T = P.torso, RT = REGIONS.torso;
    // shorts everywhere, then the white top over the torso above the waist and on the sleeves
    ctx.fillStyle = COLORS.shorts; ctx.fillRect(0, 0, this.size, this.size);
    const waistPx = this.rowY(T, RT, WAIST_Y);
    ctx.fillStyle = COLORS.top; ctx.fillRect(RT.x, RT.y, RT.w, waistPx - RT.y);
    for (const k of ['sleeveL', 'sleeveR']) { const R = REGIONS[k]; ctx.fillRect(R.x, R.y, R.w, R.h); }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // shorts: wide white stripe down the outer thigh and a white gripper hem
    for (const [k, outer] of [['legL', 90], ['legR', 270]]) {
      const part = P[k], R = REGIONS[k];
      this.band(part, R, outer, 0.13, 0.05, 1, COLORS.panel);
      ctx.fillStyle = COLORS.hem; ctx.fillRect(R.x, R.y + R.h * 0.93, R.w, R.h * 0.07);
      this.stitch(R.x, R.y + R.h * 0.915, R.x + R.w, COLORS.seamOnDark);
      ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.font = '600 13px "JetBrains Mono", ui-monospace, monospace';
      ctx.fillText('GONÇALO CARMO · ROAD TO KONA', R.x + part.uAt(0, 0.035) * R.w, R.y + R.h * 0.965);
    }
    // sleeves: plain white with a stitched cuff
    for (const k of ['sleeveL', 'sleeveR']) {
      const R = REGIONS[k];
      ctx.fillStyle = 'rgba(0,0,0,0.05)'; ctx.fillRect(R.x, R.y + R.h * 0.9, R.w, R.h * 0.1);
      this.stitch(R.x, R.y + R.h * 0.885, R.x + R.w, COLORS.seamOnLight);
    }
    // waist seam and stitching
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(RT.x, waistPx - 1, RT.w, 3);
    this.stitch(RT.x, waistPx - 8, RT.x + RT.w, COLORS.seamOnLight);
    // grey collar
    const collarPx = this.rowY(T, RT, 0.642);
    ctx.fillStyle = COLORS.collar; ctx.fillRect(RT.x, RT.y, RT.w, collarPx - RT.y);
    // front zip: grey tape and teeth from the collar to ZIP_END
    const zx = RT.x + T.uAt(0, T.vFor(0.56)) * RT.w;
    const zTop = collarPx, zBot = this.rowY(T, RT, ZIP_END);
    ctx.fillStyle = COLORS.zip; ctx.fillRect(zx - 8, zTop, 16, zBot - zTop);
    ctx.fillStyle = '#8f9298';
    for (let y = zTop + 2; y < zBot - 2; y += 5) { ctx.fillRect(zx - 4, y, 3, 2.2); ctx.fillRect(zx + 1, y + 2.5, 3, 2.2); }
    ctx.fillStyle = '#3d4045'; roundRect(ctx, zx - 7, zBot - 5, 14, 9, 4); ctx.fill();
    // printed logos: sold sponsors and any logo being tried on
    this.printLogos();
    this.baseTex.needsUpdate = true;
  }

  stitch(x0, y, x1, color) {
    const ctx = this.bctx;
    ctx.fillStyle = color;
    for (let x = x0; x < x1; x += 12) ctx.fillRect(x, y, 6, 2);
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

export function webglAvailable() {
  try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (_) { return false; }
}

export { sgnPow, lerp, clamp, smooth, roundRect };
