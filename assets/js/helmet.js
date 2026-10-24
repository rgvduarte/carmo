// Procedural 3D aero helmet (EKOI PURE AERO, white with red holographic stripes and a mirror visor) and its
// four sponsor spots. Built in code like the suit, so every spot stays editable from data/spots.json.
// Loaded on demand (import('./helmet.js')) the first time the studio shows the helmet; shares the suit's renderer.
import * as THREE from '../vendor/three@0.170.0/build/three.module.min.js';   // the import map's 'three', by its path
import { Kit, envFor, hermite, DEG, sgnPow, lerp, clamp, smooth } from './suit.js';
import { GLFail } from './gl3d.js';

// Measurements traced from the product photos (side, top, front, rear), in metres. Head frame: origin at the
// ear canal, +z forward (the brow), +y up, +x the athlete's left (as on the suit: phi +90 = left).
// Centreline (top profile), front lower edge -> crown -> tail tip, [z, y].
const PROFILE = [
  [0.1007, -0.0139], [0.1054, 0.0146], [0.1032, 0.0403], [0.0981, 0.0586], [0.0897, 0.0769], [0.0787, 0.0952],
  [0.0659, 0.1091], [0.0476, 0.1197], [0.0256, 0.1259], [0.0, 0.1280], [-0.03, 0.1286], [-0.06, 0.1268],
  [-0.09, 0.1232], [-0.12, 0.1188], [-0.15, 0.1130], [-0.18, 0.1064], [-0.20, 0.1016], [-0.215, 0.0975],
  [-0.226, 0.0950], [-0.2335, 0.0893],
];
// Lower edge of the white shell on each side: temple -> ear corner -> rising neck line -> tail, [z, y].
// The neck line is read off the side photo's blue-minus-red channel (white shell vs neutral grey ground).
// The last point sits 1 cm under the tip, so the tail ends in a short flat edge.
const RIM = [[0.031, -0.0139], [0.0, -0.0146], [-0.03, -0.0146], [-0.06, -0.0146], [-0.09, -0.0148], [-0.103, -0.0135],
  [-0.115, -0.0100], [-0.13, 0.0050], [-0.15, 0.0260], [-0.16, 0.0440], [-0.17, 0.0555], [-0.18, 0.0640],
  [-0.20, 0.0745], [-0.2269, 0.0835], [-0.2335, 0.079]];
// Half width and squareness of each arch along the centreline: [v, half width m, n].
const WIDTH = [[0, 0.1015, 1.8], [0.1, 0.1025, 2.2], [0.2, 0.1048, 2.45], [0.32, 0.1063, 2.6], [0.46, 0.1063, 2.7],
  [0.52, 0.1063, 2.68], [0.58, 0.1061, 2.65], [0.64, 0.1050, 2.5], [0.72, 0.1010, 2.35], [0.76, 0.0952, 2.3], [0.8, 0.0877, 2.3],
  [0.85, 0.0729, 2.3], [0.89, 0.0605, 2.3], [0.93, 0.0460, 2.35], [0.97, 0.0329, 2.45], [1, 0.022, 2.6]];
const V_CROWN = 0.46;     // the crown top: front-face arches fan out from the temples up to here
// Seen from the front the lower edge is a chevron, not a level U (p46, and the race photos, where the number sits right
// above it): the edge dips 1.8 cm at the centre in straight arms from the temples, with a slightly rounded tip. The dip
// is a vertical shift of the lowest arches, fading out 4 cm up the front face, so the plan view keeps its round brow.
const DIP = 0.018, V_DIP = 0.09, DIP_TIP = 0.12;
const chevron = (t) => 1 - (Math.hypot(t, DIP_TIP) - DIP_TIP) / (Math.hypot(1, DIP_TIP) - DIP_TIP);   // t = |x| / half width
const AXIS_Z = -0.065;    // the turntable axis runs through the middle of the helmet, not the ear canal
const EAR_Z = -0.0897;    // ear corner: the visor ends here and the rim starts to rise
const N = 150;            // arches, evenly spaced along the centreline
const K = 480;            // arc-length samples per arch
const COLS = 128;         // mesh columns per arch

// paint: base colour and the PBR mask (R iridescence, G roughness, B metalness)
const PAINT = {
  white: '#f3f4f6', red: '#ad111b', red2: '#b8141d', ink: [0x12, 0x13, 0x16],
  pbrWhite: 'rgb(0,46,0)', pbrFoil: 'rgb(90,100,40)', pbrVinyl: [0, 77, 0],
};
// Red holographic stripes, measured on the top view (p45) and the front view (p46): [v, inner edge, total width] in
// metres of arc from the centreline. About 10 cm apart over the front and crown, then converging and tapering towards the
// tail; on the front face they widen towards the brow (5 cm at the visor line). Of the total, 70% is the wide
// holographic stripe, 10% the white pinstripe and 20% the narrow red stripe.
const STRIPES = [[0, 0.049, 0.051], [0.15, 0.050, 0.046], [0.3, 0.052, 0.038], [0.37, 0.053, 0.035], [0.55, 0.053, 0.032], [0.64, 0.049, 0.027],
  [0.735, 0.0455, 0.022], [0.805, 0.042, 0.016], [0.87, 0.039, 0.0115], [0.92, 0.036, 0.0075], [1, 0.032, 0.0025]];
const stripeIn = (v) => hermite(STRIPES, v)[0];
const stripeW = (v) => hermite(STRIPES, v)[1] * 0.7;
const pinAt = (v) => hermite(STRIPES, v)[1] * 0.1, narrowAt = (v) => hermite(STRIPES, v)[1] * 0.2;

// The black EKOI marks, traced from the product photos: rings of base-36 coordinate pairs in a 0..1000 box,
// filled even-odd. `e` is the front mark above the visor, `ekoi` the wordmark on both sides.
const MARKS = {
  e: { w: 1000, h: 577, rings: [
    'dm00by04b40aa30l970z433x175p0f6e096n0371007h017t04880a8m0i8x0r951h9ihgfmi3ftiofxlvg1mbg0mcfzmafwllfj5o7g5a77516w4x6o4z6b54625f5o5y5aax2ibl28cc22d51zil25lt2bn72fn92gnb2jnm2knw2oo32vo433o23cno3ymu4xmf59m25elb5jkg5jfy5ccm59c75d996p936t9i6wbq70kq7cmr7bnv76oo6ypf6mq265qk5jr34lrr2trs27rl1pr719qg0upp0low0hg802',
  ] },
  ekoi: { w: 1000, h: 237, rings: [
    'iy11id16i419hu1fhj1ohd1wh725gy2wg953g85bg95lgb5ugf61gn68gx6eh86ghq6glb6glo6elx6bm469mh61mp5vmx5ln25dn655nx2to12fo224o01qnv1hnp1bnj16n912n011',
    'jo1uma1umk1wmr21mv29mv2fm74gm14wlx53lp5alf5fl75hk95ihy5jhq5ghl5chi57hh53hh4yi52wib2iig2bil25iu1zj71v',
    '8b154a183p1b391g2r1p1e2o0c3g043o013w0045024d084l0g4q5r6h696l7i6k7i6j7g6i4o5c2f4a1p3w1m3t1k3o1m3j1n3g1w383i253p213z1y4d1w4q1w6v1u7o1v7v1w7y217x257s2d7j2p7f2t782x6w2z43323y33323k2z3n303o353p3u3p7b3l7v3i873e8g3a8l368r308u2v902j971z981t981o961j921e8y1b8q18',
    'gh12fy13fq15fh19en1pbu3abm3fbj3fb73fb53eb53dbr1mbw18bw15bu14bl14b115av16aq18am1bai1had1t8u608o6h8p6j926k9x6ja06iaq4jas4hb34fba4hdu69dz6cec6gek6hfl6gfl6efg6acv46ct42cy3xde3mgj1mh914ha13',
    'py12ps15pm1apj1fpf1pns6cnt6fok6fot6eoz6ap366pa5sql1zqu1aqv13qu12qq11',
    'r200qw01qs04qn0eqn0hqp0kqw0lr90lri0jrn0frs02rs01rq00',
    'pm01pg04pb0cpa0gpd0jpf0kpw0lq50kq80iqa0fqg02qf00qb00',
  ] },
};

const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);
// Arch parameter t in [-1, 1] -> angle. Plain angle steps would be far too coarse where the super-ellipse is steepest
// (x ~ phi^(2/n) on the centreline, y ~ (90 deg - phi)^(2/n) at the rim); this warp is dense at both ends.
const WARP = 1.5;
const phiOfT = (t) => { const x = Math.abs(t), a = x ** WARP; return Math.sign(t) * (Math.PI / 2) * (a / (a + (1 - x) ** WARP)); };
const tOfPhi = (phi) => { const g = clamp(Math.abs(phi) / (Math.PI / 2), 0, 1); if (g >= 1) return Math.sign(phi); const r = (g / (1 - g)) ** (1 / WARP); return Math.sign(phi) * (r / (1 + r)); };
// Which rim point each arch ends on (fraction of the rim length). Over the front face the arches fan out from the
// temples. Behind the crown the table was searched for the least distortion of the four spot rectangles (measured on
// the shell): sizes within 1.2%, corners within 1.6 deg of square on the top and rear spots and 4.6 deg on the sides,
// where the rim turns up behind the ear. Logos are baked by projection (drawLogo), so they print square regardless.
const TAU = [[V_CROWN, 0.167], [0.56, 0.19], [0.68, 0.296], [0.8, 0.552], [0.9, 0.817], [1, 1]];
const tauOf = (T) => (v) => (v <= V_CROWN ? T[0][1] * smooth(v / V_CROWN) : clamp(hermite(T, v)[0], T[0][1], 1));
const head = (z, y) => new THREE.Vector3(0, y, z - AXIS_Z);   // head frame -> model frame
function rng(seed) {   // small seeded PRNG, so the glints are the same on every load
  return () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// The shell: a loft of open super-elliptic arches from rim to rim over the top. Arch planes all contain the x axis,
// so on the centreline the arches cross it at right angles. Texture u is absolute arc length from the top
// (u = 0.5 + s / span), v is arc length along the centreline: texels are the same size everywhere and spot
// rectangles keep their proportions. Shorter arches near the tail use only the middle of the texture.
class Shell {
  constructor({ tauTable = TAU } = {}) {
    this.name = 'shell'; this.t0 = 0;
    const tau = tauOf(tauTable);
    const curve = (P) => { const c = new THREE.CatmullRomCurve3(P.map(([z, y]) => head(z, y)), false, 'centripetal'); c.arcLengthDivisions = 1200; return c; };
    const top = curve(PROFILE), rim = curve(RIM);
    this.length = top.getLength();
    this.arches = top.getSpacedPoints(N - 1).map((S, i) => {
      const v = i / (N - 1), c = rim.getPointAt(tau(v));
      const f = new THREE.Vector3().subVectors(S, c), b = f.length();
      const [a, n] = hermite(WIDTH, v);
      const A = { v, c, f: f.divideScalar(b), b, a, e: 2 / n, dip: DIP * (1 - smooth(clamp(v / V_DIP, 0, 1))), L: new Float32Array(K + 1) };
      const p = this.point(A, -Math.PI / 2), q = new THREE.Vector3();
      for (let k = 1; k <= K; k++) { this.point(A, phiOfT((2 * k) / K - 1), q); A.L[k] = A.L[k - 1] + p.distanceTo(q); p.copy(q); }
      A.half = A.L[K] / 2;
      return A;
    });
    this.span = 1.03 * Math.max(...this.arches.map((A) => A.L[K]));
  }
  // point on an arch at angle phi (0 = top centreline, +90 deg = left rim), the lowest arches pulled down into the chevron
  point(A, phi, out = new THREE.Vector3()) {
    const sn = Math.sin(phi);
    out.copy(A.c).addScaledVector(X, A.a * sgnPow(sn, A.e)).addScaledVector(A.f, A.b * Math.pow(Math.max(0, Math.cos(phi)), A.e));
    if (A.dip) out.y -= A.dip * chevron(Math.pow(Math.abs(sn), A.e));
    return out;
  }
  sOf(A, phi) {   // signed arc length from the top
    const k = ((tOfPhi(phi) + 1) / 2) * K, k0 = clamp(Math.floor(k), 0, K - 1);
    return lerp(A.L[k0], A.L[k0 + 1], k - k0) - A.half;
  }
  phiOf(A, s) {
    const target = clamp(s + A.half, 0, A.L[K]);
    let lo = 0, hi = K;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (A.L[mid] < target) lo = mid; else hi = mid; }
    return phiOfT((2 * (lo + (target - A.L[lo]) / ((A.L[hi] - A.L[lo]) || 1))) / K - 1);
  }
  archIndex(v) { const x = clamp(v, 0, 1) * (N - 1); const i = Math.min(N - 2, Math.floor(x)); return [this.arches[i], this.arches[i + 1], x - i]; }
  vFor(t) { return t / this.length; }
  uAt(phiDeg, v) { const [A, B, f] = this.archIndex(v); return 0.5 + lerp(this.sOf(A, phiDeg * DEG), this.sOf(B, phiDeg * DEG), f) / this.span; }
  circAt() { return this.span; }
  halfAt(v) { const [A, B, f] = this.archIndex(v); return lerp(A.half, B.half, f); }
  uRim(v) { return 0.5 + this.halfAt(v) / this.span; }   // the left rim; the right one is at 1 - uRim(v)
  // inverse of the uv map: the surface point at atlas (u, v), or null past the rim
  surfaceAt(u, v, out = new THREE.Vector3()) {
    const [A, B, f] = this.archIndex(v), s = (u - 0.5) * this.span;
    if (Math.abs(s) > lerp(A.half, B.half, f) + 1e-9) return null;
    const p = this.point(A, this.phiOf(A, s), out), q = this.point(B, this.phiOf(B, s));
    return p.lerp(q, f);
  }
  // surface length per unit v at fixed u (|dP/dv|), for spot heights away from the centreline
  lengthAt(u, v) {
    const e = 1 / (N - 1), a = Math.max(0, v - e), b = Math.min(1, v + e);
    const p = this.surfaceAt(u, a), q = this.surfaceAt(u, b);
    return p && q ? p.distanceTo(q) / (b - a) : this.length;
  }
  // surface point and outward normal
  anchor(phiDeg, v) {
    const u = this.uAt(phiDeg, v), p = this.surfaceAt(u, v) || this.surfaceAt(0.5, v);
    const du = 0.003, dv = 0.004;
    const pu0 = this.surfaceAt(u - du, v) || p, pu1 = this.surfaceAt(u + du, v) || p;
    const pv0 = this.surfaceAt(u, Math.max(0, v - dv)) || p, pv1 = this.surfaceAt(u, Math.min(1, v + dv)) || p;
    const n = new THREE.Vector3().crossVectors(pu1.clone().sub(pu0), pv1.clone().sub(pv0)).normalize();
    return { p, n };
  }
  geometry(cols, region, size) {
    const pos = new Float32Array((N * (cols + 1) + cols + 2) * 3), uv = new Float32Array((N * (cols + 1) + cols + 2) * 2);
    const p = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const A = this.arches[i];
      for (let j = 0; j <= cols; j++) {
        const s = -A.half + (j / cols) * 2 * A.half, k = i * (cols + 1) + j;
        this.point(A, this.phiOf(A, s), p);
        pos.set([p.x, p.y, p.z], k * 3);
        uv.set([(region.x + (0.5 + s / this.span) * region.w) / size, 1 - (region.y + (1 - A.v) * region.h) / size], k * 2);
      }
    }
    const idx = [];
    for (let i = 0; i < N - 1; i++) for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 2, d = a + cols + 1;
      idx.push(a, b, c, a, c, d);
    }
    // tail cap: the last arch closed by a flat fan, its uv on a white texel no spot reaches (so it never picks one)
    const T = this.arches[N - 1], o = N * (cols + 1);
    for (let j = 0; j <= cols; j++) { pos.set(pos.subarray(((N - 1) * (cols + 1) + j) * 3, ((N - 1) * (cols + 1) + j) * 3 + 3), (o + j) * 3); uv.set([0.002, 0.002], (o + j) * 2); }
    pos.set([T.c.x, T.c.y, T.c.z], (o + cols + 1) * 3); uv.set([0.002, 0.002], (o + cols + 1) * 2);
    for (let j = 0; j < cols; j++) idx.push(o + cols + 1, o + j, o + j + 1);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }
}

// the orbit camera: turntable angle, elevation and radius around a target height
const orbit = (rotDeg, elDeg, d, ty = 0.02) => ({ rot: rotDeg * DEG, dist: d * Math.cos(elDeg * DEG), y: ty + d * Math.sin(elDeg * DEG), ty, x: 0 });
const HOME = { rot: -135 * DEG, dist: 0.86, ty: 0.02, y: 0.35, x: 0 };   // three-quarter from rear left, above

export class Helmet extends Kit {
  static ATLAS = 2048;
  static PBR = 1024;
  static REGIONS = { shell: { x: 0, y: 0, w: 2048, h: 2048 } };
  static HOME = HOME;
  static VIEWS = { hero: HOME, front: orbit(0, 10, 0.95), left: orbit(-90, 12, 0.95), back: orbit(180, 38, 0.95), right: orbit(90, 12, 0.95) };
  static ZOOM = [0.45, 1.6];
  static Y_RANGE = [-0.12, 0.14];
  static ENV = 0.9;
  static TILE = 2;         // about 48 texels per cm against the suit's 21: frames drawn twice as thick
  static DIM_LIT = 0.32;   // the selection dim scales the lit colour: the gloss and the visor's mirror dim too
  static Shell = Shell;   // for the shape tests

  constructor(container, opts) { super(container, { active: false, ...opts }); }

  // no instance class fields here: Kit's constructor runs build() before they would be initialised
  build() {
    const shell = new Shell();
    this.parts = { shell };
    const R = Helmet.REGIONS.shell;
    // PBR mask (half size: no fine detail; lite: a quarter) and the holographic flake noise that drives the film thickness
    this.pbrSize = Math.round(Helmet.PBR * this.k);
    this.pbr = document.createElement('canvas'); this.pbr.width = this.pbr.height = this.pbrSize;
    this.pctx = this.pbr.getContext('2d', { willReadFrequently: true });
    if (!this.pctx) { for (const c of [this.base, this.over, this.pbr]) c.width = c.height = 0; throw new GLFail('canvas2d', 'helmet-pbr', 'getContext(2d) returned null'); }
    this.pbrTex = new THREE.CanvasTexture(this.pbr); this.pbrTex.colorSpace = THREE.NoColorSpace; this.pbrTex.anisotropy = this.maxAniso;
    this.flake = flakeCanvas(256);
    this.flakeTex = new THREE.CanvasTexture(this.flake); this.flakeTex.colorSpace = THREE.NoColorSpace;
    this.flakeTex.wrapS = this.flakeTex.wrapT = THREE.RepeatWrapping; this.flakeTex.repeat.set(3, 3);

    const g = shell.geometry(COLS, R, this.size);
    // lite: the same paint and maps without the clearcoat and the holographic film (a much shorter shader)
    const paint = { map: this.baseTex, roughnessMap: this.pbrTex, metalnessMap: this.pbrTex, roughness: 1, metalness: 1 };
    const mat = this.patch(this.profile.physical === false ? new THREE.MeshStandardMaterial(paint) : new THREE.MeshPhysicalMaterial({
      ...paint, iridescenceMap: this.pbrTex,
      iridescenceThicknessMap: this.flakeTex, iridescenceThicknessRange: [200, 300],   // a warm, orange-gold film
      iridescence: 1, iridescenceIOR: 1.8, clearcoat: 1, clearcoatRoughness: 0.05,
    }));
    // spot tiles print matte, like paper stickers, so a highlight on the gloss never washes out a price
    const spotHook = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      spotHook(sh, r);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nfloat tileA = texture2D(uOverlay, vMapUv).a * uSpots;\nroughnessFactor = mix(roughnessFactor, 0.62, tileA);')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= 1.0 - tileA;\n#endif');
    };
    const m = new THREE.Mesh(g, mat); m.userData.part = 'shell';
    const inner = new THREE.Mesh(g, this.patchDim(new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.55, side: THREE.BackSide })));
    this.model.add(m, inner); this.meshes.push(m);
    this.shellMesh = m;
    this.model.add(this.rimLip(g), this.liner(g));
    this.addVisor(g);
    this.grid = null; this.markInk = [];   // filled by prepare(): the slow, constant part of the bake
  }

  shadowPlane() { return super.shadowPlane(0.42, 0.34, -0.125); }

  // The open edge of the shell, left rim (tail -> front), front lower edge, right rim (front -> tail), as points with
  // inward directions taken in plan view from the edge itself. (The front-face arches all meet at the temples, so the
  // mesh normals there are degenerate and cannot be used.) `upTo` stops each rim at that arch.
  edgeOf(g, upTo = N - 1) {
    const P = g.attributes.position, c1 = COLS + 1, ids = [];
    for (let i = upTo; i > 0; i--) ids.push(i * c1 + COLS);
    for (let j = COLS; j >= 0; j--) ids.push(j);
    for (let i = 1; i <= upTo; i++) ids.push(i * c1);
    const pts = [];
    for (const id of ids) {
      const p = new THREE.Vector3().fromBufferAttribute(P, id);
      if (!pts.length || p.distanceTo(pts[pts.length - 1]) > 0.0005) pts.push(p);
    }
    const zT = this.parts.shell.arches[0].c.z;   // temple: in front of it the inside is the front face, behind it the head
    return pts.map((p, k) => {
      const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
      const t = new THREE.Vector3().subVectors(b, a); t.y = 0;
      const n = new THREE.Vector3(t.z, 0, -t.x).normalize();
      if (n.dot(new THREE.Vector3(-p.x, 0, Math.min(p.z, zT) - p.z)) < 0) n.negate();
      return { p, n };
    });
  }

  // shell edge: a 4 mm strip folding inward along the open rim, white on the outer millimetre, black inside
  rimLip(g) {
    const depth = [0, 0.001, 0.0013, 0.004], white = [0.95, 0.955, 0.965], black = [0.03, 0.032, 0.036];
    const pos = [], col = [], idx = [];
    this.edgeOf(g).forEach(({ p, n }, k) => {
      depth.forEach((d, r) => { pos.push(p.x + n.x * d, p.y, p.z + n.z * d); col.push(...(r < 2 ? white : black)); });
      if (k) for (let r = 0; r < 3; r++) { const a = (k - 1) * 4 + r, b = k * 4 + r; idx.push(a, b, b + 1, a, b + 1, a + 1); }
    });
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    lg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    lg.setIndex(idx); lg.computeVertexNormals();
    return new THREE.Mesh(lg, this.patchDim(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, side: THREE.DoubleSide })));
  }

  // Black liner floor: each arch's two rim points joined 3 mm above the rim. In the side view it sits on the rim line,
  // so it never shows below the neck; from behind and above it fills the neck openings (the dark "vents" of the photos).
  liner(g) {
    const P = g.attributes.position, c1 = COLS + 1, S = 8, pos = [], idx = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      a.fromBufferAttribute(P, i * c1); b.fromBufferAttribute(P, i * c1 + COLS);
      const w = a.distanceTo(b), k = w > 0.012 ? 0.004 / w : 0;
      for (let j = 0; j <= S; j++) { q.lerpVectors(a, b, lerp(k, 1 - k, j / S)); pos.push(q.x, q.y + 0.003, q.z); }
      if (i) for (let j = 0; j < S; j++) { const p0 = (i - 1) * (S + 1) + j, p1 = p0 + S + 1; idx.push(p0, p1, p1 + 1, p0, p1 + 1, p0 + 1); }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setIndex(idx); lg.computeVertexNormals();
    return new THREE.Mesh(lg, this.patchDim(new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.3, side: THREE.DoubleSide })));
  }

  // Mirror visor (Cat 2): hangs under the shell's lower edge from ear corner to ear corner. Its bottom is cut by one
  // plane tilted forward (straight in the side view, rising towards the sides in the front view), the front leans
  // back towards the chin, with a V notch at the bottom centre, a satin top band and five magnetic tabs.
  addVisor(g) {
    const sh = this.parts.shell;
    let iEar = 0;
    while (iEar < N - 1 && sh.arches[iEar + 1].c.z + AXIS_Z >= EAR_Z) iEar++;
    // top edge: 2 mm outside the shell edge and 1.5 mm under it, resampled evenly
    const raw = this.edgeOf(g, iEar).map(({ p, n }) => p.clone().addScaledVector(n, -0.002).add(new THREE.Vector3(0, -0.0015, 0)));
    const edge = new THREE.CatmullRomCurve3(raw, false, 'centripetal'); edge.arcLengthDivisions = 2000;
    const M = 220, Lt = edge.getLength(), T = edge.getSpacedPoints(M);
    const z0 = 0.0695 - AXIS_Z, y0 = -0.113, k = (0.113 - 0.014) / (0.0695 - EAR_Z);   // bottom cut plane
    const cols = T.map((t, j) => {
      const tan = edge.getTangentAt(j / M), nin = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
      if (nin.dot(new THREE.Vector3(-t.x, 0, -t.z)) < 0) nin.negate();   // inward = towards the head
      // per metre of drop the lens moves back 0.35 m (and in 0.01 m): the bottom edge keeps the U of the top edge
      const lean = new THREE.Vector3(0, 0, -0.35).addScaledVector(nin, 0.01);
      let h = (t.y - y0 - k * (z0 - t.z)) / (1 - lean.z * k);
      const ds = Math.abs(j / M - 0.5) * Lt;                             // V notch, 3.8 cm at the bottom, 2.4 cm at the top
      h -= 0.0085 * (1 - smooth(clamp((ds - 0.012) / 0.007, 0, 1)));
      return { t, nin, lean, h: Math.max(0, h) };
    });
    const ROWS = 22, pos = [], col = [], idx = [], bpos = [], bidx = [];
    const tint0 = new THREE.Color(0x9aa0a8), tint1 = new THREE.Color(0xd4d8de), tint = new THREE.Color();
    // the last 1.5 cm curls 5 mm inward (fading out where the lens is short, near the ears)
    const at = (c, d, out) => out.copy(c.t).addScaledVector(Y, -d).addScaledVector(c.lean, d).addScaledVector(c.nin, 0.005 * smooth(clamp((d - (c.h - 0.015)) / 0.015, 0, 1)) * smooth(clamp((c.h - 0.02) / 0.04, 0, 1)));
    const q = new THREE.Vector3();
    cols.forEach((c) => {
      for (let r = 0; r <= ROWS; r++) { at(c, (r / ROWS) * c.h, q); pos.push(q.x, q.y, q.z); tint.lerpColors(tint0, tint1, smooth(r / ROWS)); col.push(tint.r, tint.g, tint.b); }
      const bh = Math.min(c.h, 0.011);
      for (let r = 0; r <= 2; r++) { at(c, (r / 2) * bh, q).addScaledVector(c.nin, -0.0005); bpos.push(q.x, q.y, q.z); }
    });
    for (let j = 0; j < M; j++) {
      for (let r = 0; r < ROWS; r++) { const a = j * (ROWS + 1) + r, b = a + ROWS + 1; idx.push(a, b, b + 1, a, b + 1, a + 1); }
      for (let r = 0; r < 2; r++) { const a = j * 3 + r, b = a + 3; bidx.push(a, b, b + 1, a, b + 1, a + 1); }
    }
    const vg = new THREE.BufferGeometry();
    vg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); vg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    vg.setIndex(idx); vg.computeVertexNormals();
    const env = envFor(this.renderer);
    const visor = new THREE.Mesh(vg, this.patchDim(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 1, roughness: 0.05, envMap: env, envMapIntensity: 1.35 })));
    visor.userData.part = 'visor';   // picked (no uv), so a tap on the visor never reaches a spot behind it
    const smoke = new THREE.Mesh(vg, this.patchDim(new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.2, roughness: 0.12, side: THREE.BackSide })));
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3)); bg.setIndex(bidx); bg.computeVertexNormals();
    const band = new THREE.Mesh(bg, this.patchDim(new THREE.MeshStandardMaterial({ color: 0xa8acb2, metalness: 0.9, roughness: 0.35, envMap: env })));
    this.visor = new THREE.Group();
    this.visor.add(visor, smoke, band);
    // magnetic tabs: front centre, both front corners, both sides
    const tabMat = this.patchDim(new THREE.MeshStandardMaterial({ color: 0x222428, roughness: 0.4, metalness: 0.3 }));
    const tabGeo = new THREE.BoxGeometry(0.011, 0.0018, 0.001);
    const sAt = (pred) => { let best = 0, bd = Infinity; cols.forEach((c, j) => { const d = pred(c); if (d < bd) { bd = d; best = j; } }); return best; };
    const tabs = [M / 2, sAt((c) => Math.abs(c.t.z + AXIS_Z + 0.046) + (c.t.x < 0 ? 1 : 0)), sAt((c) => Math.abs(c.t.z + AXIS_Z + 0.046) + (c.t.x > 0 ? 1 : 0)),
      sAt((c) => Math.abs(Math.atan2(-c.nin.x, -c.nin.z) - 50 * DEG)), sAt((c) => Math.abs(Math.atan2(-c.nin.x, -c.nin.z) + 50 * DEG))];
    for (const j of tabs) {
      const c = cols[j], tab = new THREE.Mesh(tabGeo, tabMat);
      at(c, 0.007, tab.position).addScaledVector(c.nin, -0.0011);
      tab.lookAt(tab.position.clone().sub(c.nin));
      this.visor.add(tab);
    }
    this.model.add(this.visor);
    this.meshes.push(visor);
  }

  // 3D point of every 8th atlas texel (null past the rim), for baking projected decals; rows gy0..gy1 into `pts`
  positionMap(gy0 = 0, gy1 = Infinity, pts = null) {
    const sh = this.parts.shell, R = Helmet.REGIONS.shell, G = 8, n = R.w / G + 1;
    pts ||= new Array(n * n);
    for (let gy = gy0; gy < Math.min(n, gy1); gy++) for (let gx = 0; gx < n; gx++) {
      pts[gy * n + gx] = sh.surfaceAt((gx * G) / R.w, 1 - (gy * G) / R.h);
    }
    return { G, n, pts };
  }

  // The constant part of the bake, the position map and the projected EKOI marks, split into short tasks so the page
  // stays responsive while the loading label shows (one long task froze a mid-range phone for about 1.5 s).
  // Then the PBR mask is painted and the colour atlas repainted with the marks. ready() waits for it.
  prepare() {
    return (this.prepared ||= (async () => {
      const pause = () => new Promise((res) => setTimeout(res, 0));
      const n = Helmet.REGIONS.shell.w / 8 + 1, grid = this.positionMap(0, 0);
      for (let gy = 0; gy < n; gy += 48) { this.positionMap(gy, gy + 48, grid.pts); await pause(); }
      this.grid = grid;
      const masks = [];
      for (const make of this.markMakers()) { const m = make(); if (m) masks.push(m); await pause(); }
      const p = this.pctx, R = Helmet.REGIONS.shell, k = this.pbrSize / this.size;
      p.fillStyle = PAINT.pbrWhite; p.fillRect(0, 0, this.pbrSize, this.pbrSize);
      this.stripes(p, { x: R.x * k, y: R.y * k, w: R.w * k, h: R.h * k }, PAINT.pbrFoil, PAINT.pbrFoil, false);
      for (const m of masks) { const cv = this.inkCanvas(m, PAINT.pbrVinyl, this.k === 1 ? 1 : k); p.drawImage(cv, m.x * k, m.y * k, m.w * k, m.h * k); cv.width = cv.height = 0; }
      this.pbrTex.needsUpdate = true;
      await pause();
      // kept at the atlas canvas's own density (lite: half), drawn back on every repaint
      this.markInk = masks.map((m) => ({ x: m.x, y: m.y, w: m.w, h: m.h, cv: this.inkCanvas(m, PAINT.ink, this.k) }));
      this.drawBase();
    })());
  }

  drawBase() {
    const ctx = this.bctx, R = Helmet.REGIONS.shell, S = this.size;
    ctx.fillStyle = PAINT.white; ctx.fillRect(0, 0, S, S);
    this.stripes(ctx, R, PAINT.red, PAINT.red2, true);
    for (const m of this.markInk) ctx.drawImage(m.cv, m.x, m.y, m.w, m.h);   // logos are printed after
    // Nothing else is printed: the top centreline and the tail top, where the stock helmet carries a race-series
    // logo, are sponsor spots 21 and 24.
    this.printLogos();
    this.baseTex.needsUpdate = true;
  }

  // both stripe pairs, as smooth polygons following constant arc offsets, clipped where they run off the shell
  stripes(ctx, R, wide, narrow, glints) {
    const sh = this.parts.shell, steps = 240;
    const xOf = (off) => R.x + (0.5 + off / sh.span) * R.w, yOf = (v) => R.y + (1 - v) * R.h;
    const band = (sg, o0, o1) => {
      const a = [], b = [];
      for (let i = 0; i <= steps; i++) {
        const v = i / steps, half = sh.halfAt(v) + 0.002, x1 = Math.min(o1(v), half), x0 = Math.min(o0(v), x1);
        a.push([xOf(sg * x0), yOf(v)]); b.push([xOf(sg * x1), yOf(v)]);
      }
      const path = new Path2D();
      a.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
      for (let i = b.length - 1; i >= 0; i--) path.lineTo(b[i][0], b[i][1]);
      path.closePath();
      return path;
    };
    for (const sg of [1, -1]) {
      const w = band(sg, stripeIn, (v) => stripeIn(v) + stripeW(v));
      ctx.fillStyle = wide; ctx.fill(w);
      ctx.fillStyle = narrow; ctx.fill(band(sg, (v) => stripeIn(v) + stripeW(v) + pinAt(v), (v) => stripeIn(v) + stripeW(v) + pinAt(v) + narrowAt(v)));
      if (!glints) continue;
      // holographic flecks: soft warm blobs inside the wide stripe (the iridescent film adds the colour shift)
      const rand = rng(sg > 0 ? 7 : 11), pxm = R.w / sh.span;
      ctx.save(); ctx.clip(w);
      for (let i = 0; i < 26; i++) {
        const v = rand(), off = sg * (stripeIn(v) + stripeW(v) * rand()), r = (0.003 + 0.008 * rand()) * pxm;
        const x = xOf(off), y = yOf(v), c = ['255,122,60', '255,179,71', '240,70,40'][Math.floor(rand() * 3)], al = 0.3 + 0.3 * rand();
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, `rgba(${c},${al})`); grd.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = grd; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      ctx.restore();
    }
  }

  // The EKOI marks, baked by planar projection: the front side walls are covered by the fan of arches, so an image
  // drawn straight onto the atlas would shear there. Each texel's 3D point is projected into the decal instead.
  // They never change, so they are projected once, as alpha windows at full atlas size, and kept as small ink canvases:
  // the colour atlas draws them back on every repaint, the half-size PBR mask takes the same windows scaled down.
  markMakers() {
    const W = 0.11, H = (W * MARKS.ekoi.h) / MARKS.ekoi.w, EW = 0.044, EH = (EW * MARKS.e.h) / MARKS.e.w;
    const Z0 = 0.059 - AXIS_Z, Z1 = -0.051 - AXIS_Z, YT = 0.027, EY = 0.021;
    return [
      // wordmark on both sides, reading front to back on the left and back to front on the right (never mirrored)
      () => this.decal(MARKS.ekoi, W, H, (p) => (p.x > 0.04 ? [(Z0 - p.z) / W, (YT - p.y) / H] : null)),
      () => this.decal(MARKS.ekoi, W, H, (p) => (p.x < -0.04 ? [(p.z - Z1) / W, (YT - p.y) / H] : null)),
      // the E mark, front centre above the visor
      () => this.decal(MARKS.e, EW, EH, (p) => (p.z + AXIS_Z > 0.05 ? [(p.x + EW / 2) / EW, (EY + EH / 2 - p.y) / EH] : null)),
    ];
  }

  // one mark's alpha on the atlas: { x, y, w, h, a } with a in 0..255 per texel
  decal(mark, w, h, toDecal) {
    // the mark at 96 px/cm (twice the atlas density), filled even-odd; only its alpha is kept
    const cw = Math.round(w * 9600), ch = Math.round(h * 9600), k = cw / mark.w;
    const c = (mark.cache ||= {})[cw] || (mark.cache[cw] = (() => {
      const cv = document.createElement('canvas'); cv.width = cw; cv.height = ch;
      const g = cv.getContext('2d'), path = new Path2D();
      for (const ring of mark.rings) {
        for (let i = 0; i < ring.length; i += 4) {
          const x = parseInt(ring.substr(i, 2), 36) * k, y = parseInt(ring.substr(i + 2, 2), 36) * k;
          if (i) path.lineTo(x, y); else path.moveTo(x, y);
        }
        path.closePath();
      }
      g.fillStyle = '#000'; g.fill(path, 'evenodd');
      const rgba = g.getImageData(0, 0, cw, ch).data, al = new Uint8Array(cw * ch);
      for (let i = 0; i < al.length; i++) al[i] = rgba[i * 4 + 3];
      cv.width = cv.height = 0;   // only its alpha is kept: the raster's memory now, not at the next collection
      return al;
    })());
    // decal pixel coordinates of every position-map node (NaN off the shell or outside the mark's side)
    const { G, n, pts } = this.grid, DU = new Float32Array(n * n).fill(NaN), DV = new Float32Array(n * n).fill(NaN);
    let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
    pts.forEach((p, i) => {
      const d = p && toDecal(p);
      if (!d) return;
      DU[i] = d[0] * cw - 0.5; DV[i] = d[1] * ch - 0.5;
      if (d[0] > -0.05 && d[0] < 1.05 && d[1] > -0.1 && d[1] < 1.1) { const gx = i % n, gy = (i / n) | 0; x0 = Math.min(x0, gx); x1 = Math.max(x1, gx); y0 = Math.min(y0, gy); y1 = Math.max(y1, gy); }
    });
    if (x1 < 0) return null;
    x0 = Math.max(0, x0 - 1); y0 = Math.max(0, y0 - 1); x1 = Math.min(n - 2, x1 + 1); y1 = Math.min(n - 2, y1 + 1);
    const pw = (x1 - x0 + 1) * G, ph = (y1 - y0 + 1) * G, out = new Uint8Array(pw * ph);
    const A = (x, y) => (x < 0 || y < 0 || x >= cw || y >= ch ? 0 : c[y * cw + x]);
    for (let gy = y0; gy <= y1; gy++) for (let gx = x0; gx <= x1; gx++) {
      const a = gy * n + gx, b = a + 1, cc = a + n, d = cc + 1;
      const ua = DU[a], ub = DU[b], uc = DU[cc], ud = DU[d], va = DV[a], vb = DV[b], vc = DV[cc], vd = DV[d];
      if (ua !== ua || ub !== ub || uc !== uc || ud !== ud) continue;   // a corner off the shell
      // a cell whose four corners all miss the mark on one side cannot touch it
      if (Math.max(ua, ub, uc, ud) < -1 || Math.min(ua, ub, uc, ud) > cw || Math.max(va, vb, vc, vd) < -1 || Math.min(va, vb, vc, vd) > ch) continue;
      for (let ty = 0; ty < G; ty++) {
        const fy = (ty + 0.5) / G, uL = ua + (uc - ua) * fy, uR = ub + (ud - ub) * fy, vL = va + (vc - va) * fy, vR = vb + (vd - vb) * fy;
        let o = ((gy - y0) * G + ty) * pw + (gx - x0) * G;
        for (let tx = 0; tx < G; tx++, o++) {
          const fx = (tx + 0.5) / G, u = uL + (uR - uL) * fx, v = vL + (vR - vL) * fx;
          if (u < -1 || v < -1 || u > cw || v > ch) continue;
          const iu = Math.floor(u), iv = Math.floor(v), su = u - iu, sv = v - iv;
          const t = (A(iu, iv) * (1 - su) + A(iu + 1, iv) * su) * (1 - sv) + (A(iu, iv + 1) * (1 - su) + A(iu + 1, iv + 1) * su) * sv;
          if (t > 0) out[o] = Math.round(t);
        }
      }
    }
    return { x: x0 * G, y: y0 * G, w: pw, h: ph, a: out };
  }

  // a mark window as a canvas of one ink colour (transparent where the mark is not), at k of the atlas density
  inkCanvas(m, rgb, k = 1) {
    const w = Math.max(1, Math.round(m.w * k)), h = Math.max(1, Math.round(m.h * k));
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    if (!g) throw new GLFail('canvas2d', 'helmet-ink', 'getContext(2d) returned null');
    const img = g.createImageData(w, h), out = img.data;
    if (k === 1) { for (let i = 0; i < m.a.length; i++) if (m.a[i]) { const o = i * 4; out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = m.a[i]; } }
    else {   // the mean alpha of the atlas texels each pixel covers
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const y0 = Math.floor(y / k), y1 = Math.min(m.h, Math.floor((y + 1) / k)), x0 = Math.floor(x / k), x1 = Math.min(m.w, Math.floor((x + 1) / k));
        let a = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { a += m.a[yy * m.w + xx]; n++; }
        if (!n || !a) continue;
        const o = (y * w + x) * 4; out[o] = rgb[0]; out[o + 1] = rgb[1]; out[o + 2] = rgb[2]; out[o + 3] = Math.round(a / n);
      }
    }
    g.putImageData(img, 0, 0);
    return cv;
  }

  // Where a logo sits on the shell. The atlas rectangle stays what the tile, the gold ring, the dim mask and a tap use,
  // but where the arches fan out (the side spots) its image on the shell is a slightly leaning parallelogram whose
  // middle is not the uv centre. So its outline is mapped onto the tangent plane at the anchor, the logo is centred on
  // the outline's centroid and laid along its long edges, and sized so its margin box (the logo over 84% x 78%, the
  // rule of Kit.drawLogo) fits inside the outline. On the top and rear spots this is the plain rectangle again.
  logoFrame(img, s, r) {
    const sh = this.parts.shell, R = Helmet.REGIONS.shell, { p, n } = r.anchor, K = 16;
    const u0 = (r.x - R.x) / R.w, u1 = (r.x + r.w - R.x) / R.w, v0 = 1 - (r.y + r.h - R.y) / R.h, v1 = 1 - (r.y - R.y) / R.h;
    // tangent axes: a along +u at the centre, b = n x a towards +v (the tail)
    const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
    const a = sh.surfaceAt(cu + 0.002, cv).sub(sh.surfaceAt(cu - 0.002, cv)); a.addScaledVector(n, -a.dot(n)).normalize();
    const b = new THREE.Vector3().crossVectors(n, a);
    // the outline, counter-clockwise in (a, b): bottom edge +u, right edge +v, top edge -u, left edge -v
    const at = (u, v) => { const q = sh.surfaceAt(u, v).sub(p); return [q.dot(a), q.dot(b)]; };
    const P = [];
    for (let i = 0; i < K; i++) P.push(at(lerp(u0, u1, i / K), v0));
    for (let i = 0; i < K; i++) P.push(at(u1, lerp(v0, v1, i / K)));
    for (let i = 0; i < K; i++) P.push(at(lerp(u1, u0, i / K), v1));
    for (let i = 0; i < K; i++) P.push(at(u0, lerp(v1, v0, i / K)));
    // long edges: the two v edges on a tall spot, the two u edges on a wide one; the logo's axes follow their mean
    const dir = (i, j) => [P[j % (4 * K)][0] - P[i][0], P[j % (4 * K)][1] - P[i][1]];
    const [e1, e2] = s.h >= s.w ? [dir(K, 2 * K), dir(0, 3 * K)] : [dir(0, K), dir(3 * K, 2 * K)];
    let A = [e1[0] + e2[0], e1[1] + e2[1]]; const l = Math.hypot(...A); A = [A[0] / l, A[1] / l];
    const [EU, EV] = s.h >= s.w ? [[A[1], -A[0]], A] : [A, [-A[1], A[0]]];
    // centroid of the outline (area-weighted)
    let ar = 0, cx = 0, cy = 0;
    P.forEach(([x0, y0], i) => { const [x1, y1] = P[(i + 1) % P.length], c = x0 * y1 - x1 * y0; ar += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c; });
    cx /= 3 * ar; cy /= 3 * ar;
    // logo right/down: canvas x is +u, canvas down is -v, both turned by rot as in Kit.drawLogo
    const rot = (s.rot || 0) * DEG, cs = Math.cos(rot), sn = Math.sin(rot);
    const R2 = [EU[0] * cs - EV[0] * sn, EU[1] * cs - EV[1] * sn], D2 = [-EU[0] * sn - EV[0] * cs, -EU[1] * sn - EV[1] * cs];
    const Q = P.map(([x, y]) => [(x - cx) * R2[0] + (y - cy) * R2[1], (x - cx) * D2[0] + (y - cy) * D2[1]]);
    // the largest margin box around the centroid (bisection: the long edges sag a little, so the outline is not
    // quite convex): its corners inside the outline and no outline point inside the box
    const inside = (x, y) => { let o = false; for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) { const [xi, yi] = Q[i], [xj, yj] = Q[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) o = !o; } return o; };
    const fits = (k) => { const hx = (k * img.width) / 0.84 / 2, hy = (k * img.height) / 0.78 / 2; return [[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([sx, sy]) => inside(sx * hx, sy * hy)) && Q.every(([x, y]) => Math.abs(x) >= hx || Math.abs(y) >= hy); };
    let lo = 0, hi = Math.max(s.w, s.h) / 100 / Math.min(img.width, img.height);
    for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
    const k = lo;
    const v3 = (w) => a.clone().multiplyScalar(w[0]).addScaledVector(b, w[1]);
    return { c: p.clone().add(v3([cx, cy])), right: v3(R2), down: v3(D2), lw: k * img.width, lh: k * img.height };
  }

  // Logos (sold sponsors and try-ons) are baked by projection onto the spot's tangent plane (frame above), so they
  // print as true rectangles even where the arches fan out. Kit's tiles and picking keep the atlas rectangle.
  drawLogo(img, s, r) {
    const sh = this.parts.shell, R = Helmet.REGIONS.shell;
    const { c: p, right, down, lw, lh } = this.logoFrame(img, s, r);   // metres on the shell
    // the logo resampled to about 2 px per texel, then read bilinearly
    const k = (2 * R.w) / (sh.span * 100), cw = Math.max(2, Math.round(lw * 100 * k)), chh = Math.max(2, Math.round(lh * 100 * k));
    const src = document.createElement('canvas'); src.width = cw; src.height = chh;
    const g = src.getContext('2d', { willReadFrequently: true }); g.imageSmoothingQuality = 'high'; g.drawImage(img, 0, 0, cw, chh);
    const L = g.getImageData(0, 0, cw, chh).data;
    src.width = src.height = 0;
    // logo pixel coordinates at the 8 px position-map nodes around the spot; cells the logo cannot touch are skipped
    const { G, n: gn, pts } = (this.grid ||= this.positionMap()), pad = 24;
    const gx0 = Math.max(0, Math.floor((r.x - pad - R.x) / G)), gy0 = Math.max(0, Math.floor((r.y - pad - R.y) / G));
    const gx1 = Math.min(gn - 2, Math.ceil((r.x + r.w + pad - R.x) / G)), gy1 = Math.min(gn - 2, Math.ceil((r.y + r.h + pad - R.y) / G));
    const NW = gx1 - gx0 + 2, DU = new Float32Array(NW * (gy1 - gy0 + 2)), DV = new Float32Array(DU.length), OK = new Uint8Array(DU.length);
    const d = new THREE.Vector3();
    for (let j = 0; j < gy1 - gy0 + 2; j++) for (let i = 0; i < NW; i++) {
      const q = pts[(gy0 + j) * gn + gx0 + i], k2 = j * NW + i;
      if (!q) continue;
      d.subVectors(q, p); OK[k2] = 1;
      DU[k2] = (d.dot(right) / lw + 0.5) * cw - 0.5; DV[k2] = (d.dot(down) / lh + 0.5) * chh - 0.5;
    }
    // in canvas px: a lite atlas has k = 0.5 of the atlas density, so each 8-texel cell is 4 px there
    const ka = this.k, g8 = G * ka, x0 = (R.x + gx0 * G) * ka, y0 = (R.y + gy0 * G) * ka, W = (gx1 - gx0 + 1) * g8, Hh = (gy1 - gy0 + 1) * g8;
    const ctx = this.bctx, im = ctx.getImageData(x0, y0, W, Hh), out = im.data;
    for (let cy = 0; cy <= gy1 - gy0; cy++) for (let cx = 0; cx <= gx1 - gx0; cx++) {
      const a = cy * NW + cx, b = a + 1, c = a + NW, e = c + 1;
      if (!(OK[a] && OK[b] && OK[c] && OK[e])) continue;
      if (Math.max(DU[a], DU[b], DU[c], DU[e]) < -1 || Math.min(DU[a], DU[b], DU[c], DU[e]) > cw || Math.max(DV[a], DV[b], DV[c], DV[e]) < -1 || Math.min(DV[a], DV[b], DV[c], DV[e]) > chh) continue;
      for (let ty = 0; ty < g8; ty++) for (let tx = 0; tx < g8; tx++) {
        const fx = (tx + 0.5) / g8, fy = (ty + 0.5) / g8;
        const u = lerp(lerp(DU[a], DU[b], fx), lerp(DU[c], DU[e], fx), fy), v = lerp(lerp(DV[a], DV[b], fx), lerp(DV[c], DV[e], fx), fy);
        if (u < -1 || v < -1 || u > cw || v > chh) continue;
        const iu = Math.floor(u), iv = Math.floor(v), su = u - iu, sv = v - iv;
        let al = 0, cr = 0, cg = 0, cb = 0;
        for (let k = 0; k < 4; k++) {   // bilinear, straight alpha
          const x = iu + (k & 1), y = iv + (k >> 1);
          if (x < 0 || y < 0 || x >= cw || y >= chh) continue;
          const i = (y * cw + x) * 4, wgt = ((k & 1) ? su : 1 - su) * ((k >> 1) ? sv : 1 - sv), aw = (L[i + 3] / 255) * wgt;
          al += aw; cr += L[i] * aw; cg += L[i + 1] * aw; cb += L[i + 2] * aw;
        }
        if (al <= 0.002) continue;
        const o = ((cy * g8 + ty) * W + cx * g8 + tx) * 4;
        out[o] = lerp(out[o], cr / al, al); out[o + 1] = lerp(out[o + 1], cg / al, al); out[o + 2] = lerp(out[o + 2], cb / al, al);
      }
    }
    ctx.putImageData(im, x0, y0);
  }

  // frame a spot and turn it so its logo reads upright: top spots are seen from the logo's "up" side, side spots square on
  focus(id) {
    const s = this.spots.find((x) => x.id === id), r = this.rects.get(id);
    if (!s || !r) return;
    const { p, n } = r.anchor, top = Math.abs(n.y) > 0.75;
    const rot = top ? (s.rot || 0) * DEG : -Math.atan2(n.x, n.z);
    const el = top ? 55 * DEG : clamp(Math.asin(n.y) + 8 * DEG, 5 * DEG, 40 * DEG);
    const d = clamp(0.47 + Math.max(s.w, s.h) * 0.02, 0.52, 0.9);   // close enough to read, far enough to see where it sits
    const q = p.clone().applyAxisAngle(Y, rot);   // where the spot ends up after the turn
    // loop() looks at z = 0, so aim where the camera -> spot line crosses z = 0
    this.setPose({ rot, x: q.x, ty: q.y - q.z * Math.tan(el), dist: q.z + d * Math.cos(el), y: q.y + d * Math.sin(el) });
  }

  // zoom along the orbit radius, so the elevation stays put
  zoom(dir) {
    const gl = this.goal, [a, b] = Helmet.ZOOM, d = Math.hypot(gl.dist, gl.y - gl.ty);
    const k = clamp(d * (dir > 0 ? 0.84 : 1.19), a, b) / d;
    this.setPose({ dist: gl.dist * k, y: gl.ty + (gl.y - gl.ty) * k });
  }

  // compile the physical shader and upload the atlases now, not on the first helmet frame
  // Nothing is compiled or uploaded on a lost context (Safari never reports a program ready there, and three would poll
  // for ever): adspace calls this again on the context that replaces it. On a phone the idle helmet keeps no atlas on
  // the GPU (evict), so they are uploaded when it first takes the stage.
  async ready() {
    await this.prepare();
    if (this.lost()) return;
    const r = this.renderer;
    try {
      // compile() starts every program (in parallel where the browser can); they are awaited here for 5 s at most, and
      // no longer once the context is lost or replaced (three's compileAsync would poll a lost one for ever)
      const mats = r.compile(this.scene, this.camera), t0 = performance.now();
      while (mats.size && performance.now() - t0 < 5000 && r === this.renderer && !this.lost()) {
        for (const m of mats) { const p = r.properties.get(m).currentProgram; if (!p || p.isReady()) mats.delete(m); }
        if (mats.size) await new Promise((res) => setTimeout(res, 10));
      }
    } catch (_) {}
    if (r !== this.renderer || this.lost() || (this.profile.evict && !this.active)) return;
    for (const t of this.gpuTextures()) this.renderer.initTexture(t);
  }
  gpuTextures() { return [this.baseTex, this.overTex, this.pbrTex, this.flakeTex]; }
  destroy() { super.destroy(); for (const c of [this.pbr, ...(this.markInk || []).map((m) => m.cv)]) c.width = c.height = 0; }
}

// seeded soft noise in G: thickness of the holographic film, so the foil shifts colour in flecks
function flakeCanvas(n) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), rand = rng(5);
  g.fillStyle = 'rgb(0,128,0)'; g.fillRect(0, 0, n, n);
  for (let i = 0; i < 160; i++) {
    const x = rand() * n, y = rand() * n, r = 6 + rand() * 18, v = Math.round(rand() * 255);
    for (const [dx, dy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {   // wrap, so the tile repeats without seams
      const grd = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      grd.addColorStop(0, `rgba(0,${v},0,0.8)`); grd.addColorStop(1, `rgba(0,${v},0,0)`);
      g.fillStyle = grd; g.fillRect(x + dx - r, y + dy - r, 2 * r, 2 * r);
    }
  }
  return c;
}
