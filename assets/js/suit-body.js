// The trisuit's body, as numbers only (no three.js), so the mesh worker can import it as well.
//
// Five parts (torso, sleeveL/R, legL/R) are anatomical lofts around a straight axis: per ring a half width, a front and
// a back depth, a squareness and a centre shift, plus gaussian muscle bumps. Each part gives two things:
//  - the spot/atlas parametrisation the Kit uses (vFor, uAt, circAt, anchor, arc-length tables, uvOf), and
//  - an implicit field (signed radial distance, slope corrected), so the five parts smooth-union into one surface.
// suit-mesh.js meshes that union once; every vertex takes its uv from its own part, so the spot maths is unchanged.
//
// Model space: metres, y up, +z front, +x the wearer's left. Crotch at y ~ 0.02 (floor - 0.82 m on a 1.80 m athlete).
export const TAU = Math.PI * 2, DEG = Math.PI / 180;
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const wrapA = (a) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };

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

// atan2 to ~1e-5 rad, without the libm call (the field runs it a few hundred thousand times)
export function atan2f(y, x) {
  const ax = Math.abs(x), ay = Math.abs(y), mx = Math.max(ax, ay);
  if (mx === 0) return 0;
  const a = Math.min(ax, ay) / mx, s = a * a;
  let r = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * a + a;
  if (ay > ax) r = 1.5707963267948966 - r;
  if (x < 0) r = Math.PI - r;
  return y < 0 ? -r : r;
}

// polynomial smooth min: a C1 blend k wide (m)
export function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

// ---------------------------------------------------------------------------------------------------------------
// A loft around a straight axis o + t*up, with frame (s, f): polar angle th = 0 along f (front), +90 along s.
// prof rows: [t, a (half width along s), bf (front depth), bb (back depth), n (squareness), c (centre shift along f)].
// bumps: gaussians in (t, th) added to the polar radius. step: a hem step (and the fabric bulging just above it).
// A part is plain data plus methods, so a worker can build it and hand it over (toData / Part.fromData).
export class Part {
  constructor(name, c) {
    this.name = name;
    [this.ox, this.oy, this.oz] = c.o; [this.ux, this.uy, this.uz] = c.up; [this.sx, this.sy, this.sz] = c.s; [this.fx, this.fy, this.fz] = c.f;
    this.prof = c.prof; this.bumps = c.bumps || []; this.step = c.step || null; this.dome = c.dome || null;
    this.t0 = c.t0 || 0; this.length = c.length; this.tMin = c.tMin; this.tMax = c.tMax;
    this.seam = (c.seam || 0) * DEG;   // polar angle where the texture wraps (u = 0 | 1)
    this.K = c.K || 480;
    this.knotBand = c.knotBand || [this.t0, this.t0 + this.length];   // rings over which an anchor's u is averaged
    // the profile on a 1 mm table, so nothing below calls hermite()
    this.pdt = 0.001; this.pn = Math.ceil((this.tMax - this.tMin) / this.pdt) + 1;
    this.P = new Float64Array(this.pn * 5);
    for (let i = 0; i < this.pn; i++) this.P.set(hermite(this.prof, this.tMin + i * this.pdt), i * 5);
    this._pr = new Float64Array(5);
    this.bake();
    const N = c.N || 120;
    this.rings = new Float64Array(N);
    for (let i = 0; i < N; i++) this.rings[i] = this.t0 + (i / (N - 1)) * this.length;
    this.tables = Array.from(this.rings, (t) => this.table(t));
    // reference circumference: u per metre of arc at every knot is 1 / Cref, on every ring (see extend)
    { const lo = this.ringOf(this.knotBand[0]), hi = this.ringOf(this.knotBand[1]); let a = 0; for (let i = lo; i <= hi; i++) a += this.tables[i][this.K]; this.Cref = a / (hi - lo + 1); }
    this.setAnchors(c.anchors);
  }

  toData() { return { ...this }; }
  static fromData(d) { return Object.assign(Object.create(Part.prototype), d); }

  // ---- shape ----
  prof5(t, out = this._pr) {
    const x = clamp((t - this.tMin) / this.pdt, 0, this.pn - 1.001), i = Math.floor(x), f = x - i, P = this.P, a = i * 5, b = a + 5;
    for (let k = 0; k < 5; k++) out[k] = P[a + k] + (P[b + k] - P[a + k]) * f;
    return out;
  }
  // polar radius at angle th and height t (exact: pow and exp)
  radius(th, t, pr = this.prof5(t)) {
    const a = pr[0], b = Math.cos(th) >= 0 ? pr[1] : pr[2], n = pr[3], sn = Math.sin(th), cs = Math.cos(th);
    let R = Math.pow(Math.pow(Math.abs(sn) / a, n) + Math.pow(Math.abs(cs) / b, n), -1 / n);
    for (const k of this.bumps) {
      const dt = (t - k.t) / k.st; if (dt > 3.5 || dt < -3.5) continue;
      const da = wrapA(th - k.th * DEG) / (k.sa * DEG); if (da > 3.5 || da < -3.5) continue;
      R += k.A * Math.exp(-0.5 * (dt * dt + da * da));
    }
    const st = this.step;
    if (st) R += st.d * (1 - smoothstep(st.len - st.w0, st.len + st.w1, t)) + (st.bulge ? st.bulge * Math.exp(-Math.pow((t - st.len - st.at) / st.w, 2)) : 0);
    return R;
  }
  // R(th, t) on a 128 x 3 mm grid, read with Catmull-Rom, so the field never calls pow or exp.
  // Gt holds the wall-slope correction 1/sqrt(1 + (dR/dt)^2) that keeps the radial distance close to euclidean.
  bake(nA = 128, dt = 0.003) {
    const nT = Math.ceil((this.tMax - this.tMin) / dt) + 3;
    this.nA = nA; this.bdt = dt; this.nT = nT;
    this.Rt = new Float32Array(nT * nA); this.Ct = new Float32Array(nT); this.Gt = new Float32Array(nT * nA);
    const pr = new Float64Array(5);
    for (let i = 0; i < nT; i++) {
      const t = this.tMin + i * dt; this.prof5(t, pr);
      this.Ct[i] = pr[4];
      for (let j = 0; j < nA; j++) this.Rt[i * nA + j] = this.radius(-Math.PI + (j / nA) * TAU, t, pr);
    }
    for (let i = 0; i < nT; i++) for (let j = 0; j < nA; j++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(nT - 1, i + 1);
      const g = (this.Rt[i1 * nA + j] - this.Rt[i0 * nA + j]) / (dt * (i1 - i0));
      this.Gt[i * nA + j] = 1 / Math.sqrt(1 + g * g);
    }
    this.Mt = new Float32Array(nT);
    for (let i = 0; i < nT; i++) { let a = 0; for (let j = 0; j < nA; j++) a += this.Rt[i * nA + j]; this.Mt[i] = a / nA; }
  }
  // a per-row table (Ct, Mt) at t, read with Catmull-Rom like the radius: a linear read would kink the field at every row
  rowFast(T, t) {
    const nT = this.nT;
    let fi = (t - this.tMin) / this.bdt; if (fi < 0) fi = 0; else if (fi > nT - 1.0001) fi = nT - 1.0001;
    const i = fi | 0, ft = fi - i, ft2 = ft * ft, ft3 = ft2 * ft;
    const r = (k) => T[Math.min(nT - 1, Math.max(0, i + k))];
    return (-0.5 * ft3 + ft2 - 0.5 * ft) * r(-1) + (1.5 * ft3 - 2.5 * ft2 + 1) * r(0) + (-1.5 * ft3 + 2 * ft2 + 0.5 * ft) * r(1) + (0.5 * ft3 - 0.5 * ft2) * r(2);
  }
  // tabulated radius (and the slope correction in this._g) at (th, t)
  radiusFast(th, t) {
    const nT = this.nT, nA = this.nA;
    let fi = (t - this.tMin) / this.bdt; if (fi < 0) fi = 0; else if (fi > nT - 1.0001) fi = nT - 1.0001;
    const i = fi | 0, ft = fi - i;
    let a0 = th + Math.PI; a0 -= Math.floor(a0 / TAU) * TAU;
    const fj = (a0 / TAU) * nA, j = Math.floor(fj), fa = fj - j;
    const R = this.Rt;
    const fa2 = fa * fa, fa3 = fa2 * fa, ft2 = ft * ft, ft3 = ft2 * ft;
    const wa0 = -0.5 * fa3 + fa2 - 0.5 * fa, wa1 = 1.5 * fa3 - 2.5 * fa2 + 1, wa2 = -1.5 * fa3 + 2 * fa2 + 0.5 * fa, wa3 = 0.5 * fa3 - 0.5 * fa2;
    const wt0 = -0.5 * ft3 + ft2 - 0.5 * ft, wt1 = 1.5 * ft3 - 2.5 * ft2 + 1, wt2 = -1.5 * ft3 + 2 * ft2 + 0.5 * ft, wt3 = 0.5 * ft3 - 0.5 * ft2;
    const j0 = (j - 1 + nA) % nA, j1 = j % nA, j2 = (j + 1) % nA, j3 = (j + 2) % nA;
    // (the slope correction is read with the same smooth weights: a kinked one would crease every blend)
    const G = this.Gt;
    let Rv = 0, Gv = 0;
    for (let a = 0; a < 4; a++) {
      const ii = Math.min(nT - 1, Math.max(0, i - 1 + a)) * nA, w = a === 0 ? wt0 : a === 1 ? wt1 : a === 2 ? wt2 : wt3;
      Rv += w * (wa0 * R[ii + j0] + wa1 * R[ii + j1] + wa2 * R[ii + j2] + wa3 * R[ii + j3]);
      Gv += w * (wa0 * G[ii + j0] + wa1 * G[ii + j1] + wa2 * G[ii + j2] + wa3 * G[ii + j3]);
    }
    this._g = Gv;
    return Rv;
  }
  // signed distance-like field of this part alone (negative inside)
  field(x, y, z) {
    const qx = x - this.ox, qy = y - this.oy, qz = z - this.oz;
    const t = qx * this.ux + qy * this.uy + qz * this.uz, dm = this.dome;
    // a dome end (the sleeve at the shoulder joint): past dm.t the tube closes as a half ellipsoid of its own
    // cross-section, whose wobble fades to the mean radius at the top; the ring is frozen with a smooth clamp
    const tt = dm ? smin(t, dm.t, dm.k) : t, e = dm && t > dm.t ? t - dm.t : 0;
    const c = this.rowFast(this.Ct, tt);
    const xs = qx * this.sx + qy * this.sy + qz * this.sz, zf = qx * this.fx + qy * this.fy + qz * this.fz - c;
    const r2 = xs * xs + zf * zf, th = atan2f(xs, zf);
    let R = this.radiusFast(th, tt), rho = Math.sqrt(r2);
    if (e > 0) { const m = this.rowFast(this.Mt, tt), q = r2 + e * e; R = m + ((R - m) * r2) / (q || 1); rho = Math.sqrt(q); }
    let d = (rho - R) * this._g;
    if (t < this.tMin) d = Math.max(d, this.tMin - t);
    else if (!dm && t > this.tMax) d = Math.max(d, t - this.tMax);
    return d;
  }
  // model-space point on the part's own surface (ring at t, polar angle th), exact
  pointAt(t, th, out = [0, 0, 0]) {
    const pr = this.prof5(t), R = this.radius(th, t, pr), cz = pr[4] + R * Math.cos(th), cx = R * Math.sin(th);
    out[0] = this.ox + this.ux * t + this.fx * cz + this.sx * cx;
    out[1] = this.oy + this.uy * t + this.fy * cz + this.sy * cx;
    out[2] = this.oz + this.uz * t + this.fz * cz + this.sz * cx;
    return out;
  }
  pointFast(t, th, c, out) {
    const R = this.radiusFast(th, t), cz = c + R * Math.cos(th), cx = R * Math.sin(th);
    out[0] = this.ox + this.ux * t + this.fx * cz + this.sx * cx;
    out[1] = this.oy + this.uy * t + this.fy * cz + this.sy * cx;
    out[2] = this.oz + this.uz * t + this.fz * cz + this.sz * cx;
    return out;
  }
  // a model-space point in the part's own cylinder coordinates: t along the axis, th, rho (distance from the axis)
  local(x, y, z, out = [0, 0, 0]) {
    const qx = x - this.ox, qy = y - this.oy, qz = z - this.oz;
    const t = qx * this.ux + qy * this.uy + qz * this.uz;
    const c = this.prof5(t)[4];
    const xs = qx * this.sx + qy * this.sy + qz * this.sz, zf = qx * this.fx + qy * this.fy + qz * this.fz - c;
    out[0] = t; out[1] = Math.atan2(xs, zf); out[2] = Math.sqrt(xs * xs + zf * zf);
    return out;
  }

  // ---- uv parametrisation (the Kit's part contract) ----
  // arc length around the ring at t, from the texture seam, K steps
  table(t) {
    const K = this.K, L = new Float64Array(K + 1), c = this.prof5(t)[4], a = [0, 0, 0], b = [0, 0, 0];
    this.pointFast(t, this.seam, c, a);
    for (let k = 1; k <= K; k++) {
      this.pointFast(t, this.seam + (k / K) * TAU, c, b);
      L[k] = L[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      a[0] = b[0]; a[1] = b[1]; a[2] = b[2];
    }
    return L;
  }
  ringIndex(v) { const x = clamp(v, 0, 1) * (this.rings.length - 1); const i = Math.min(this.rings.length - 2, Math.floor(x)); return [i, i + 1, x - i]; }
  ringOf(t) { return clamp(Math.round(((t - this.t0) / this.length) * (this.rings.length - 1)), 0, this.rings.length - 1); }
  // arc fraction (0..1 from the seam) of polar angle th on ring i
  frac(i, th) {
    let d = (th - this.seam) % TAU; if (d < 0) d += TAU;
    const L = this.tables[i], K = this.K, k = (d / TAU) * K, k0 = Math.min(K - 1, Math.floor(k));
    return (L[k0] + (L[k0 + 1] - L[k0]) * (k - k0)) / L[K];
  }
  // polar angle at arc fraction x on ring i
  thetaAt(i, x) {
    const L = this.tables[i], K = this.K, target = x * L[K];
    let lo = 0, hi = K;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] < target) lo = m; else hi = m; }
    return this.seam + ((lo + (target - L[lo]) / ((L[hi] - L[lo]) || 1)) / K) * TAU;
  }

  // The u mapping per ring: arc length, bent through anchor knots so that every spot tile is laid out isometrically.
  //  - globals (phi, degrees): orthogonal trajectories of the rings over the whole part, at one u on every ring (the
  //    torso's front and back centre lines);
  //  - a tile off those lines has a centre knot that follows the orthogonal trajectory through its centre;
  //  - every tile has two edge knots just outside its sides, at a fixed arc offset from its centre;
  //  - at all of a tile's knots the slope is du/ds = 1 / Cref (u per metre of arc).
  // A tile's knots live on the rings of its band and fade, over `fade`, into where the mapping already puts their u;
  // beyond that they do not exist. Each ring keeps its own knots, so tiles never fight over rings they do not share.
  // So the u line through a tile's centre runs square to the rings (no shear), and the arc between its centre and its
  // edges is the same on all its rows (no keystone where the body tapers). Between knots, u is a monotone cubic in
  // arc fraction, which absorbs the ring's taper; the texture seam is not a knot. u can leave [0, 1] a little at the
  // seam: the torso spans the atlas width and the atlas repeats in s.
  // spec: { globals: [phi], tiles: [{ phi, tRef, band, fade, half }] } (half: half the tile's width, m)
  setAnchors(spec) {
    this.periodic = false;
    const globals = (spec && spec.globals) || [], tiles = (spec && spec.tiles) || [];
    if (!globals.length && !tiles.length) return;
    const N = this.rings.length, rings = this.rings, K = this.K, D = 1 / this.Cref;
    const pa = [0, 0, 0], pb = [0, 0, 0];
    const dth = (t, th) => {
      this.pointAt(t + 0.002, th, pa); this.pointAt(t - 0.002, th, pb);
      const tx = pa[0] - pb[0], ty = pa[1] - pb[1], tz = pa[2] - pb[2];
      this.pointAt(t, th + 0.01, pa); this.pointAt(t, th - 0.01, pb);
      const hx = pa[0] - pb[0], hy = pa[1] - pb[1], hz = pa[2] - pb[2];
      return (-(tx * hx + ty * hy + tz * hz) / (hx * hx + hy * hy + hz * hz)) * 5;
    };
    const trace = (deg, iRef) => {
      const th = new Float64Array(N); th[iRef] = deg * DEG;
      for (let i = iRef + 1; i < N; i++) { const h = rings[i] - rings[i - 1], m = th[i - 1] + 0.5 * h * dth(rings[i - 1], th[i - 1]); th[i] = th[i - 1] + h * dth(rings[i - 1] + h / 2, m); }
      for (let i = iRef - 1; i >= 0; i--) { const h = rings[i] - rings[i + 1], m = th[i + 1] + 0.5 * h * dth(rings[i + 1], th[i + 1]); th[i] = th[i + 1] + h * dth(rings[i + 1] + h / 2, m); }
      return th;
    };
    const w01 = (x) => x - Math.floor(x), wlerp = (a, b, w) => { let d = b - a; d -= Math.round(d); return w01(a + w * d); };
    const lo = this.ringOf(this.knotBand[0]), hi = this.ringOf(this.knotBand[1]), mid = N >> 1;
    const G = globals.map((deg) => { const tr = trace(deg, mid); let U = 0; for (let i = lo; i <= hi; i++) U += this.frac(i, tr[i]); return { deg, tr, U: U / (hi - lo + 1) }; });
    const T = tiles.map((tl) => ({ ...tl, W: Float64Array.from(rings, (t) => 1 - smoothstep(0, 1, (Math.abs(t - tl.tRef) - tl.band) / tl.fade)), g: G.find((g) => ((tl.phi - g.deg) % 360 + 360) % 360 === 0) }));
    this.EX = new Array(N); this.EU = new Array(N); this.ES = new Array(N); this.periodic = true;
    // knots on ring i, sorted by x: [{ x, u, w }] -> extended arrays and slopes
    const build = (i, ks) => {
      const m = ks.length, L = this.tables[i][K];
      const ex = new Float64Array(m + 2), eu = new Float64Array(m + 2);
      ks.forEach((k, j) => { ex[j + 1] = k.x; eu[j + 1] = k.u; });
      ex[0] = ks[m - 1].x - 1; eu[0] = ks[m - 1].u - 1; ex[m + 1] = ks[0].x + 1; eu[m + 1] = ks[0].u + 1;
      const sl = ks.map((k, j) => {
        const a = (eu[j + 1] - eu[j]) / (ex[j + 1] - ex[j]), b = (eu[j + 2] - eu[j + 1]) / (ex[j + 2] - ex[j + 1]);
        const fc = a * b <= 0 ? 0 : (2 * a * b) / (a + b);
        return k.w * L * D + (1 - k.w) * fc;
      });
      const es = new Float64Array(m + 2);
      for (let e = 0; e < m + 2; e++) es[e] = sl[(((e - 1) % m) + m) % m];
      for (let e = 0; e <= m; e++) {
        const d = (eu[e + 1] - eu[e]) / (ex[e + 1] - ex[e]), a = es[e] / d, b = es[e + 1] / d, r = a * a + b * b;
        if (r > 9) { const k = 3 / Math.sqrt(r); es[e] = Math.min(es[e], k * a * d); es[e + 1] = Math.min(es[e + 1], k * b * d); }
      }
      es[0] = es[m] = Math.min(es[0], es[m]); es[1] = es[m + 1] = Math.min(es[1], es[m + 1]);   // the wrap: one slope per knot
      this.EX[i] = ex; this.EU[i] = eu; this.ES[i] = es;
    };
    const byX = (a, b) => a.x - b.x;
    // the plain mapping on every ring (globals only; with none, plain arc length): the reference for the tiles' u
    const base = (i) => (G.length ? G.map((g) => ({ x: this.frac(i, g.tr[i]), u: g.U, w: 0 })).sort(byX) : [{ x: 0, u: 0, w: 0 }]);
    for (let i = 0; i < N; i++) build(i, base(i));
    for (const t of T) if (!t.g) { t.iR = this.ringOf(t.tRef); t.orth = trace(t.phi, t.iR); t.U = this.uForPhiRing(t.iR, t.phi * DEG); }
    for (const t of T) if (t.g) t.U = t.g.U;
    const wide = T.slice().sort((a, b) => b.half - a.half);
    this.skipped = 0;
    for (let i = 0; i < N; i++) {
      const L = this.tables[i][K], ks = base(i);
      for (const k of ks) for (const t of T) if (t.g && Math.abs(k.x - this.frac(i, t.g.tr[i])) < 1e-9) k.w = Math.max(k.w, t.W[i]);
      build(i, ks);
      const insert = (k) => {   // in x order, if it crosses no neighbour (in x or in u)
        let j = 0; while (j < ks.length && ks[j].x < k.x) j++;
        const m = ks.length, p = j === 0 ? { x: ks[m - 1].x - 1, u: ks[m - 1].u - 1 } : ks[j - 1], n = j === m ? { x: ks[0].x + 1, u: ks[0].u + 1 } : ks[j];
        if (!(k.x > p.x + 2e-4 && k.x < n.x - 2e-4 && k.u > p.u && k.u < n.u)) { this.skipped++; return false; }
        ks.splice(j, 0, k); build(i, ks);
        return true;
      };
      for (const t of T) {   // where each tile's centre is on this ring
        t.xc = null;
        if (!(t.W[i] > 0)) continue;
        if (t.g) { t.xc = this.frac(i, t.g.tr[i]); continue; }
        const x = wlerp(this.pinv(i, t.U), this.frac(i, t.orth[i]), t.W[i]);
        if (insert({ x, u: t.U, w: t.W[i] })) t.xc = x;
      }
      for (const t of wide) {   // edges, widest tiles first: the narrower ones nest inside the mapping they leave
        if (t.xc === null) continue;
        for (const sg of [-1, 1]) {
          const off = sg * (t.half + 0.012), ue = t.U + off * D;
          insert({ x: wlerp(this.pinv(i, ue), t.xc + off / L, t.W[i]), u: ue, w: t.W[i] });
        }
      }
    }
  }
  // arc fraction x -> u on ring ti: a monotone cubic through the ring's knots; du/dx goes to this._du
  pm(ti, x) {
    const X = this.EX[ti], U = this.EU[ti], M = this.ES[ti], last = X.length - 2;
    let e = 0; while (e < last && x >= X[e + 1]) e++;
    const x0 = X[e], w = X[e + 1] - x0, u0 = U[e], u1 = U[e + 1], m0 = M[e], m1 = M[e + 1];
    const t = (x - x0) / w, t2 = t * t, t3 = t2 * t;
    this._du = ((6 * t2 - 6 * t) * u0 + (3 * t2 - 4 * t + 1) * w * m0 + (-6 * t2 + 6 * t) * u1 + (3 * t2 - 2 * t) * w * m1) / w;
    return (2 * t3 - 3 * t2 + 1) * u0 + (t3 - 2 * t2 + t) * w * m0 + (-2 * t3 + 3 * t2) * u1 + (t3 - t2) * w * m1;
  }
  // u -> arc fraction on ring ti (the map is monotone: bisection)
  pinv(ti, u) {
    if (!this.periodic) return ((u % 1) + 1) % 1;
    const u00 = this.pm(ti, 0);
    let uu = u; while (uu < u00) uu += 1; while (uu >= u00 + 1) uu -= 1;
    let a = 0, b = 1;
    for (let i = 0; i < 34; i++) { const m = (a + b) / 2; if (this.pm(ti, m) < uu) a = m; else b = m; }
    return (a + b) / 2;
  }
  uForPhiRing(ti, phi) { const x = this.frac(ti, phi); return this.periodic ? this.pm(ti, x) : x; }
  vFor(t) { return (t - this.t0) / this.length; }
  uAt(phiDeg, v) { return this.uAtRad(phiDeg * DEG, v); }
  uAtRad(phi, v) { const [i0, i1, f] = this.ringIndex(v); return lerp(this.uForPhiRing(i0, phi), this.uForPhiRing(i1, phi), f); }
  thetaForU(ti, u) { return this.thetaAt(ti, this.pinv(ti, u)); }
  // surface length per unit u at (v, u): the whole ring for plain arc length, the local density with anchors
  circAt(v, u) {
    const [i0, i1, f] = this.ringIndex(v);
    if (u === undefined || !this.periodic) return lerp(this.tables[i0][this.K], this.tables[i1][this.K], f);
    const c = (i) => { this.pm(i, this.pinv(i, u)); return this.tables[i][this.K] / this._du; };
    return lerp(c(i0), c(i1), f);
  }
  // surface point and outward normal at (phi, v), from the part's own surface
  anchor(phiDeg, v) {
    const t = this.t0 + clamp(v, 0, 1) * this.length, th = phiDeg * DEG;
    const p = this.pointAt(t, th), a = this.pointAt(t, th + 0.01), b = this.pointAt(t, th - 0.01), c = this.pointAt(t + 0.003, th), d = this.pointAt(t - 0.003, th);
    const ex = c[0] - d[0], ey = c[1] - d[1], ez = c[2] - d[2], gx = a[0] - b[0], gy = a[1] - b[1], gz = a[2] - b[2];
    const nx = gy * ez - gz * ey, ny = gz * ex - gx * ez, nz = gx * ey - gy * ex, l = Math.hypot(nx, ny, nz) || 1;   // around x along: outwards
    return { p, n: [nx / l, ny / l, nz / l] };
  }
  // [u, v, x] of a model-space point on this part: x is the arc fraction from the seam (0..1), u = map(x)
  uvOf(x, y, z, l = [0, 0, 0]) {
    this.local(x, y, z, l);
    const v = clamp(this.vFor(l[0]), 0, 1), [i0, i1, f] = this.ringIndex(v);
    const x0 = this.frac(i0, l[1]), x1 = this.frac(i1, l[1]);
    const u = this.periodic ? lerp(this.pm(i0, x0), this.pm(i1, x1), f) : lerp(x0, x1, f);
    return [u, v, lerp(x0, x1, f)];
  }
}

// ---------------------------------------------------------------------------------------------------------------
// The body. Landmarks (y): buttock 0.09-0.11, iliac crest 0.24, navel 0.26, natural waist 0.30, lowest rib 0.36,
// nipple 0.49, axilla 0.52, acromion 0.645, neck opening 0.655 at the front, 0.69 at the side, 0.712 at the back.
export const BODY = {
  // torso and neck loft (t = y): y, half width, front depth, back depth, squareness, centre shift (+ front)
  torso: [
    [-0.006, 0.016, 0.032, 0.040, 2.00, -0.004],  // the pelvis floor ends inside the gusset, which is the crotch
    [0.010, 0.040, 0.056, 0.066, 2.00, -0.004],
    [0.024, 0.075, 0.078, 0.092, 2.05, -0.004],
    [0.040, 0.112, 0.088, 0.104, 2.10, -0.004],
    [0.060, 0.159, 0.092, 0.110, 2.20, -0.004],
    [0.105, 0.167, 0.096, 0.113, 2.30, -0.004],
    [0.160, 0.164, 0.097, 0.103, 2.35, -0.002],
    [0.215, 0.160, 0.095, 0.095, 2.35, 0.002],
    [0.265, 0.151, 0.093, 0.093, 2.30, 0.006],
    [0.305, 0.146, 0.093, 0.095, 2.30, 0.007],
    [0.360, 0.149, 0.102, 0.099, 2.35, 0.005],
    [0.420, 0.158, 0.117, 0.107, 2.40, 0.001],
    [0.475, 0.158, 0.133, 0.113, 2.45, -0.004],
    [0.525, 0.166, 0.134, 0.111, 2.50, -0.010],
    [0.575, 0.171, 0.123, 0.109, 2.55, -0.014],
    [0.605, 0.174, 0.111, 0.104, 2.58, -0.017],
    [0.630, 0.164, 0.099, 0.098, 2.50, -0.019],   // the shoulders slope up into the neck: no shelf under the collar
    [0.650, 0.143, 0.084, 0.088, 2.35, -0.020],
    [0.667, 0.118, 0.069, 0.076, 2.20, -0.020],
    [0.684, 0.093, 0.060, 0.067, 2.08, -0.019],
    [0.700, 0.076, 0.055, 0.062, 2.00, -0.018],
    [0.725, 0.064, 0.053, 0.058, 2.00, -0.014],
    [0.800, 0.057, 0.052, 0.055, 2.00, -0.002],
  ],
  torsoBumps: [
    { th: 27, t: 0.505, A: 0.011, sa: 17, st: 0.034 },    // pectorals
    { th: -27, t: 0.505, A: 0.011, sa: 17, st: 0.034 },
    { th: 0, t: 0.50, A: -0.004, sa: 6, st: 0.05 },       // sternum valley
    { th: 152, t: 0.565, A: 0.008, sa: 15, st: 0.05 },    // shoulder blades
    { th: -152, t: 0.565, A: 0.008, sa: 15, st: 0.05 },
    { th: 180, t: 0.42, A: -0.0035, sa: 10, st: 0.14 },   // spine groove
    { th: 118, t: 0.46, A: 0.006, sa: 18, st: 0.07 },     // lats
    { th: -118, t: 0.46, A: 0.006, sa: 18, st: 0.07 },
    { th: 148, t: 0.088, A: 0.012, sa: 24, st: 0.048 },   // glutes
    { th: -148, t: 0.088, A: 0.012, sa: 24, st: 0.048 },
    { th: 180, t: 0.075, A: -0.006, sa: 6, st: 0.035 },   // cleft, softened by the fabric
    { th: 0, t: 0.27, A: 0.003, sa: 30, st: 0.06 },       // lower abdomen
    { th: 0, t: 0.028, A: 0.010, sa: 30, st: 0.03 },      // pubis and chamois: no brief line across the front
  ],
  torsoT0: -0.01, torsoLen: 0.75, torsoSeam: 245,
  shoulder: [0.165, 0.600, -0.010],   // glenohumeral centre (left; mirrored)
  abduct: 21,                         // arm angle from vertical (deg)
  sleeveLen: 0.175,                   // joint -> hem along the arm: mid upper arm, as on the race suit
  arm: [   // t from the hem up the arm (negative: below the hem, cut away): half width, front, back
    [-0.12, 0.042, 0.046, 0.046, 2.0, 0.0],
    [0.000, 0.045, 0.048, 0.048, 2.0, 0.0],
    [0.080, 0.047, 0.050, 0.050, 2.0, 0.0],
    [0.145, 0.050, 0.051, 0.052, 2.0, 0.0],
    [0.175, 0.048, 0.049, 0.050, 2.0, 0.0],
    [0.215, 0.046, 0.047, 0.048, 2.0, 0.0],   // (rings for the panel's uv only: the tube closes in a dome at the joint)
  ],
  armBumps: [{ th: 90, t: 0.12, A: 0.007, sa: 55, st: 0.05 }],   // deltoid (lateral; mirrored)
  deltoidDome: { k: 0.02 },   // the sleeve tube ends in a dome over the joint (the deltoid): k smooths where the ring freezes
  hip: [0.088, 0.090, -0.008],        // top of the thigh axis (left)
  hem: [0.100, -0.240, 0.016],        // leg hem centre (left): a slight A stance, the outer line close to plumb
  legLen: 0.30,
  leg: [   // t from the hem up the thigh; the top tapers inside the pelvis so the blend never bulges
    [-0.10, 0.074, 0.077, 0.079, 2.0, 0.0],
    [0.000, 0.077, 0.080, 0.082, 2.0, 0.0],
    [0.120, 0.083, 0.086, 0.089, 2.05, 0.0],
    [0.230, 0.088, 0.086, 0.094, 2.1, 0.0],
    [0.280, 0.084, 0.077, 0.089, 2.1, 0.0],
    [0.315, 0.070, 0.062, 0.074, 2.0, 0.0],
    [0.345, 0.045, 0.044, 0.046, 2.0, 0.0],
  ],
  legBumps: [
    { th: 35, t: 0.13, A: 0.006, sa: 40, st: 0.08 },     // quads (front-lateral; mirrored)
    { th: 180, t: 0.16, A: 0.004, sa: 35, st: 0.08 },    // hamstrings
    { th: -100, t: 0.24, A: -0.011, sa: 32, st: 0.065 }, // inner thigh: the thighs part under the crotch
    { th: -60, t: 0.15, A: 0.003, sa: 25, st: 0.06 },    // adductor, front of the inner thigh
  ],
  gripper: { len: 0.065, step: -0.002, muffin: 0.0015 },   // silicone gripper: a compression step, fabric above it
  cuff: { len: 0.015, step: -0.0015 },                     // the sleeve hem hugs the arm
  kArm: 0.028, kPit: 0.018, kLeg: 0.026, kThighs: [0.010, 0.016],   // blend widths: shoulder, armpit, hips, thigh to thigh (tight low down, a little more at the crotch)
  gusset: { a: [0, 0.018, 0.046], b: [0, 0.004, -0.030], r: 0.024, r2: 0.016, k: 0.022 },   // the crotch: a round cone, fuller at the front
  // collar opening: low at the front, higher at the back, around a neck centre at z = cz
  // (0.652 at the front, 0.700 at the sides, 0.714 at the back)
  neck: { mid: 0.6923, dip: 0.0295, side: 0.0078, notch: 0.003, notchW: 20, cz: -0.015, binding: 0.009 },
  // raglan seam (left; mirrored): x of the seam at height y on the front and back, the armpit gap below
  raglan: { front: [[0.072, 0.672], [0.160, 0.512]], back: [[0.080, 0.692], [0.160, 0.512]], gap: 0.170, yMin: 0.40 },
};

const mirrorBumps = (B, side) => B.map((b) => ({ ...b, th: side > 0 ? b.th : -b.th }));
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0] / l, v[1] / l, v[2] / l]; };

// Anchor knots from the spots (see Part.setAnchors), so tiles stay isometric wherever the spots are moved to.
export function anchorsFor(spots) {
  const out = { torso: { globals: [0, 180], tiles: [] }, legL: { tiles: [] }, legR: { tiles: [] }, sleeveL: { tiles: [] }, sleeveR: { tiles: [] } };
  for (const s of spots) {
    if (!(s.part in out)) continue;
    const phi = ((Math.round(s.phi) % 360) + 540) % 360 - 180;
    // the rect is w around and h along the part, whatever its rot
    out[s.part].tiles.push({ phi, tRef: s.t, band: s.h / 200 + 0.006, fade: 0.03, half: s.w / 200 });
  }
  return out;
}

export function buildBody(B = BODY, anchors = anchorsFor([])) {
  const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
  const torso = new Part('torso', { o: [0, 0, 0], up: Y, s: X, f: Z, prof: B.torso, bumps: B.torsoBumps, t0: B.torsoT0, length: B.torsoLen, tMin: B.torso[0][0], tMax: B.torso[B.torso.length - 1][0], seam: B.torsoSeam, N: 150, knotBand: [0.06, 0.64], anchors: anchors.torso });
  const parts = { torso };
  const G = B.gripper, C = B.cuff;
  const legStep = { d: G.step, len: G.len, w0: 0.008, w1: 0.004, bulge: G.muffin, at: 0.009, w: 0.007 };
  const armStep = { d: C.step, len: C.len, w0: 0.006, w1: 0.004, bulge: 0 };
  for (const [side, sl, lg] of [[1, 'sleeveL', 'legL'], [-1, 'sleeveR', 'legR']]) {
    const J = [side * B.shoulder[0], B.shoulder[1], B.shoulder[2]];
    const a = B.abduct * DEG, down = [side * Math.sin(a), -Math.cos(a), 0];
    const H = [J[0] + down[0] * B.sleeveLen, J[1] + down[1] * B.sleeveLen, J[2] + down[2] * B.sleeveLen], up = [-down[0], -down[1], -down[2]];
    const s = norm([1 - up[0] * up[0], -up[0] * up[1], -up[0] * up[2]]);
    const tTop = B.arm[B.arm.length - 1][0];
    parts[sl] = new Part(sl, { o: H, up, s, f: Z, prof: B.arm, bumps: mirrorBumps(B.armBumps, side), step: armStep, t0: 0, length: B.sleeveLen, tMin: B.arm[0][0], tMax: tTop, seam: side > 0 ? 270 : 90, N: 64, anchors: anchors[sl], dome: { t: B.sleeveLen, k: B.deltoidDome.k } });
    const top = [side * B.hip[0], B.hip[1], B.hip[2]], hem = [side * B.hem[0], B.hem[1], B.hem[2]];
    const lu = norm([top[0] - hem[0], top[1] - hem[1], top[2] - hem[2]]);
    const ls = norm([1 - lu[0] * lu[0], -lu[0] * lu[1], -lu[0] * lu[2]]);
    const lf = norm([ls[1] * lu[2] - ls[2] * lu[1], ls[2] * lu[0] - ls[0] * lu[2], ls[0] * lu[1] - ls[1] * lu[0]]);   // ls x lu: the front
    parts[lg] = new Part(lg, { o: hem, up: lu, s: ls, f: lf, prof: B.leg, bumps: mirrorBumps(B.legBumps, side), step: legStep, t0: 0, length: B.legLen, tMin: B.leg[0][0], tMax: B.leg[B.leg.length - 1][0], seam: side > 0 ? 270 : 90, N: 80, anchors: anchors[lg] });
  }
  return parts;
}

// The whole body: the torso smooth-unioned with the sleeves and the legs. A limb whose axis capsule is farther than
// its blend width cannot change the union, so its table is not read there.
export function bodyField(P, B = BODY) {
  const T = P.torso, aL = P.sleeveL, aR = P.sleeveR, lL = P.legL, lR = P.legR, kL = B.kLeg, kLL = B.kThighs, G = B.gusset;
  const kArm = (y) => B.kPit + (B.kArm - B.kPit) * smoothstep(0.5, 0.6, y);
  const gus = G && (() => {   // round cone from a (radius r) to b (radius r2): an exact distance (after Inigo Quilez)
    const ax = G.a[0], ay = G.a[1], az = G.a[2], bx = G.b[0] - ax, by = G.b[1] - ay, bz = G.b[2] - az, l2 = bx * bx + by * by + bz * bz;
    const r1 = G.r, r2 = G.r2 ?? G.r, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
    return (x, y, z) => {
      const px = x - ax, py = y - ay, pz = z - az, yy = px * bx + py * by + pz * bz, zz = yy - l2;
      const qx = px * l2 - bx * yy, qy = py * l2 - by * yy, qz = pz * l2 - bz * yy, x2 = qx * qx + qy * qy + qz * qz;
      const y2 = yy * yy * l2, z2 = zz * zz * l2, k = Math.sign(rr) * rr * rr * x2;
      if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
      if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
      return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
    };
  })();
  const near = (p, x, y, z, pad) => {
    const qx = x - p.ox, qy = y - p.oy, qz = z - p.oz;
    const t = clamp(qx * p.ux + qy * p.uy + qz * p.uz, p.tMin, p.tMax + 0.06);
    const cx = qx - p.ux * t, cy = qy - p.uy * t, cz = qz - p.uz * t;
    return Math.sqrt(cx * cx + cy * cy + cz * cz) - pad;
  };
  const limb = (p, x, y, z, pad, k) => { const b = near(p, x, y, z, pad); return b > k + 0.01 ? b : p.field(x, y, z); };
  // the arms blend into the torso; the thighs blend with each other a little (no web between them), then with the
  // hips, and the gusset fills the crotch
  return (x, y, z) => {
    let d = T.field(x, y, z);
    const ka = kArm(y);
    d = smin(d, limb(aL, x, y, z, 0.07, ka), ka);
    d = smin(d, limb(aR, x, y, z, 0.07, ka), ka);
    if (y < 0.22) {
      // the gusset joins the pelvis first, so the thighs blend once with the two of them
      if (gus && y < 0.08 && Math.abs(x) < 0.08) d = smin(d, gus(x, y, z), G.k);
      const kt = kLL[0] + (kLL[1] - kLL[0]) * smoothstep(-0.13, -0.015, y);
      const legs = smin(limb(lL, x, y, z, 0.11, Math.max(kL, kt)), limb(lR, x, y, z, 0.11, Math.max(kL, kt)), kt);
      d = smin(d, legs, kL);
    }
    return d;
  };
}

// ---- openings and panel seams: level-set functions, zero on the line ----
export function neckY(th, B = BODY) {
  const n = B.neck;
  return n.mid - n.dip * Math.cos(th) - n.side * Math.cos(2 * th) - n.notch * Math.exp(-Math.pow(th / (n.notchW * DEG), 2));
}
export const neckTheta = (x, z, B = BODY) => Math.atan2(x, z - B.neck.cz);

// raglan (left side; the right one is x -> -x): x of the seam line at height y; front and back lines blend by z,
// and below the armpit the seam runs down the gap between the torso and the arm
export function raglanX(y, z, B = BODY) {
  const R = B.raglan;
  const line = ([[xa, ya], [xb, yb]]) => xa + ((ya - y) * (xb - xa)) / (ya - yb);
  const w = smoothstep(-0.045, 0.045, z);
  const x = line(R.back) + (line(R.front) - line(R.back)) * w;
  const k = 0.012, h = Math.max(k - Math.abs(x - R.gap), 0) / k;
  return Math.min(x, R.gap) - h * h * k * 0.25;
}

// > 0 on the part's side of its panel seam
export function seamFns(P, B = BODY) {
  // the raglan panels end under the collar binding, which runs all the way round on the torso
  const yMin = B.raglan.yMin, bind = (x, y, z) => neckY(neckTheta(x, z, B), B) - B.neck.binding - y;
  return {
    sleeveL: (x, y, z) => Math.min(x - raglanX(y, z, B), y - yMin, y > 0.58 ? bind(x, y, z) : 1),
    sleeveR: (x, y, z) => Math.min(-x - raglanX(y, z, B), y - yMin, y > 0.58 ? bind(x, y, z) : 1),
    legL: (x, y, z) => P.torso.field(x, y, z) - P.legL.field(x, y, z) - 0.004,
    legR: (x, y, z) => P.torso.field(x, y, z) - P.legR.field(x, y, z) - 0.004,
  };
}
export function regionFn(S) {
  return (x, y, z) => {
    if (S.sleeveL(x, y, z) > 0) return 'sleeveL';
    if (S.sleeveR(x, y, z) > 0) return 'sleeveR';
    if (x > -0.01 && S.legL(x, y, z) > 0) return 'legL';
    if (x < 0.01 && S.legR(x, y, z) > 0) return 'legR';
    return 'torso';
  };
}

// What the print needs from the body, worked out once (in the worker, with the mesh): the side panels' spans per
// atlas row, the collar binding's lower edge per torso column, the raglan seam lines on the torso.
export function printLayout(P, B, { regions, waist }) {
  const T = P.torso, RT = regions.torso, L = { stripes: {}, collar: null, raglan: [] };
  // side panels: the leg's outer band (13 cm of arc around its side), carried straight up onto the hip to the
  // waist seam. Its edges are two lines in the side view (z of y) per side, so it crosses the leg seam without a jog.
  const pt = [0, 0, 0];
  for (const [side, k] of [[1, 'legL'], [-1, 'legR']]) {
    const leg = P[k], phi = side * 90 * DEG, ends = [];
    for (const t of [0.04, 0.26]) {
      const i = leg.ringOf(t), C = leg.tables[i][leg.K], x = leg.frac(i, phi);
      ends.push([-1, 1].map((sg) => leg.pointAt(leg.rings[i], leg.thetaAt(i, (((x + (sg * 0.065) / C) % 1) + 1) % 1))));
    }
    // on the leg: straight through its band; on the hip it tapers to 8.5 cm at the waist seam
    const zc = (ends[1][0][2] + ends[1][1][2]) / 2;
    const line = (a, b) => {
      const m = (b[2] - a[2]) / (b[1] - a[1]), zw = zc + Math.sign(b[2] - zc) * 0.0425;
      return (y) => (y <= b[1] ? a[2] + (y - a[1]) * m : b[2] + ((zw - b[2]) * (y - b[1])) / (waist - b[1]));
    };
    const e0 = line(ends[0][0], ends[1][0]), e1 = line(ends[0][1], ends[1][1]);
    const front = (y) => Math.max(e0(y), e1(y)), back = (y) => Math.min(e0(y), e1(y));
    const inside = (p) => p[0] * side > 0.03 && p[2] < front(p[1]) && p[2] > back(p[1]);
    // per atlas row of the part: the polar-angle spans inside the band -> u spans
    const spans = (part, R, v0, v1) => {
      const rows = [], N = 96;
      for (let py = Math.floor(R.y + (1 - v1) * R.h); py < R.y + (1 - v0) * R.h; py++) {
        const v = 1 - (py + 0.5 - R.y) / R.h, t = part.t0 + v * part.length, c = part.prof5(t)[4];
        const th = (j) => phi - 80 * DEG + (j / N) * 160 * DEG, at = (a) => inside(part.pointFast(t, a, c, pt));
        let prev = at(th(0)), start = prev ? th(0) : null;
        const row = [];
        const edge = (a, b, inA) => { for (let it = 0; it < 14; it++) { const m = (a + b) / 2; if (at(m) === inA) a = m; else b = m; } return (a + b) / 2; };
        for (let j = 1; j <= N; j++) {
          const a = th(j), cur = at(a);
          if (cur !== prev) { const e = edge(th(j - 1), a, prev); if (cur) start = e; else { row.push([start, e]); start = null; } prev = cur; }
        }
        if (start !== null) row.push([start, th(N)]);
        if (row.length) rows.push([py, v, row.map(([a, b]) => [part.uAtRad(a, v), part.uAtRad(b, v)])]);
      }
      return rows;
    };
    L.stripes[k] = spans(leg, regions[k], 0, 1);
    // (on the torso only from the hips up: lower down its own rings run inside the thighs)
    (L.stripes.torso ||= []).push(...spans(T, RT, T.vFor(0.045), T.vFor(waist)));
  }
  // collar: per column, the binding's lower edge (the neckline less its width), on the ring it lands on
  L.collar = new Float32Array(RT.w);
  for (let px = 0; px < RT.w; px++) {
    const u = (px + 0.5) / RT.w;
    let y = 0.69;
    for (let it = 0; it < 3; it++) { const th = T.thetaForU(T.ringOf(y), u); y = neckY(th, B) - B.neck.binding; }
    L.collar[px] = y;
  }
  // raglan seams on the torso side: where the torso's ring crosses the seam line, front and back, both sides
  for (const side of [1, -1]) for (const fb of [1, -1]) {
    const pts = [];
    for (let y = 0.505; y < 0.72; y += 0.002) {
      const f = (a) => { const th = side * (fb > 0 ? a : Math.PI - a); T.pointAt(y, th, pt); return side * pt[0] - raglanX(y, pt[2], B); };
      let lo = 0, hi = Math.PI / 2;
      if (f(lo) * f(hi) > 0) continue;
      for (let i = 0; i < 28; i++) { const m = (lo + hi) / 2; if (f(lo) * f(m) <= 0) hi = m; else lo = m; }
      const th = side * (fb > 0 ? (lo + hi) / 2 : Math.PI - (lo + hi) / 2);
      if (y > neckY(th, B) - B.neck.binding) break;
      pts.push([th, y]);
    }
    if (pts.length > 1) L.raglan.push({ side, fb, pts });
  }
  return L;
}
