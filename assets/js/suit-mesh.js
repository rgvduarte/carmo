// The trisuit mesh, as numbers only (no three.js), so it runs in a worker or on the main thread alike.
//
// The body field (suit-body.js) is meshed once with narrow-band surface nets on the wearer's left half, every vertex
// is pulled onto the surface, and then cut exactly along level sets: the centre plane, the openings (collar, sleeve
// and leg hems, which drop one side) and the panel seams (raglan, leg/torso and each part's texture wrap, which keep
// both sides). Each triangle goes to one part, normals and occlusion come from the field, and the half is mirrored.
// Out come typed arrays per part: position, normal, uv (the part's own atlas parametrisation), uv1 (fabric grain,
// metres), color (baked occlusion) and index, plus rolled lips along the openings.
import { buildBody, bodyField, printLayout, BODY, neckY, neckTheta, seamFns, clamp } from './suit-body.js';

const LIP = 3;   // segments in a hem's rolled lip (half a turn)
export const PARTS = ['torso', 'sleeveL', 'sleeveR', 'legL', 'legR'];
const MIRROR = [0, 2, 1, 4, 3];
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

// growable vertex positions (float64 while building)
class Verts {
  constructor(cap = 1 << 16) { this.p = new Float64Array(cap * 3); this.n = 0; }
  add(x, y, z) {
    if (this.n * 3 + 3 > this.p.length) { const q = new Float64Array(this.p.length * 2); q.set(this.p); this.p = q; }
    const i = this.n++, p = this.p; p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
    return i;
  }
}

// tetrahedral gradient of F (4 evaluations): unit normal into out, returns |grad|
function gradient(F, x, y, z, e, out) {
  const a = F(x + e, y - e, z - e), b = F(x - e, y - e, z + e), c = F(x - e, y + e, z - e), d = F(x + e, y + e, z + e);
  const gx = a - b - c + d, gy = -a - b + c + d, gz = -a + b - c + d, l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
  out[0] = gx / l; out[1] = gy / l; out[2] = gz / l;
  return l / (4 * e);
}

// Newton steps along the gradient onto F = 0
function projectOne(F, p, i, iters, g = [0, 0, 0]) {
  let x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
  for (let it = 0; it < iters; it++) {
    const d = F(x, y, z), gl = gradient(F, x, y, z, 0.001, g), s = d / Math.max(gl, 0.3);
    x -= g[0] * s; y -= g[1] * s; z -= g[2] * s;
  }
  p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z;
}

// Narrow-band surface nets: blocks of C cells are evaluated at their centre first, and the fine grid only where the
// surface can reach. One vertex per sign-changing cell (mean of its edge crossings); one quad per sign-changing edge,
// wound so that it faces along the gradient (outwards).
function surfaceNets(F, box, h, V) {
  const [x0, y0, z0, x1, y1, z1] = box;
  const nx = Math.ceil((x1 - x0) / h) + 1, ny = Math.ceil((y1 - y0) / h) + 1, nz = Math.ceil((z1 - z0) / h) + 1;
  const idx = (i, j, k) => (k * ny + j) * nx + i;
  const val = new Float32Array(nx * ny * nz).fill(NaN);
  const C = 4, cb = C * h, reach = cb;
  let evals = 0;
  const bx = Math.ceil((nx - 1) / C), by = Math.ceil((ny - 1) / C), bz = Math.ceil((nz - 1) / C);
  for (let K = 0; K < bz; K++) for (let J = 0; J < by; J++) for (let I = 0; I < bx; I++) {
    const d = F(x0 + (I + 0.5) * cb, y0 + (J + 0.5) * cb, z0 + (K + 0.5) * cb); evals++;
    const fill = Math.abs(d) <= reach, far = d > 0 ? 1e3 : -1e3;
    for (let k = K * C, k1 = Math.min(nz - 1, K * C + C); k <= k1; k++) for (let j = J * C, j1 = Math.min(ny - 1, J * C + C); j <= j1; j++) for (let i = I * C, i1 = Math.min(nx - 1, I * C + C); i <= i1; i++) {
      const q = idx(i, j, k), v = val[q];
      if (!fill) { if (v !== v) val[q] = far; continue; }
      if (v !== v || v === 1e3 || v === -1e3) { val[q] = F(x0 + i * h, y0 + j * h, z0 + k * h); evals++; }
    }
  }
  const cx = nx - 1, cy = ny - 1, cellV = new Int32Array(cx * cy * (nz - 1)).fill(-1);
  const cidx = (i, j, k) => (k * cy + j) * cx + i;
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cor = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let neg = 0;
    for (let c = 0; c < 8; c++) { const v = val[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]; cor[c] = v; if (v < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (let e = 0; e < 12; e++) {
      const a = E[e][0], b = E[e][1], va = cor[a], vb = cor[b];
      if ((va < 0) === (vb < 0)) continue;
      const t = va / (va - vb);
      sx += (a & 1) + ((b & 1) - (a & 1)) * t; sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t; sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t; n++;
    }
    cellV[cidx(i, j, k)] = V.add(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);
  }
  const quads = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) quads.push(a, b, c, d); else quads.push(a, d, c, b);
  };
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const va = val[idx(i, j, k)], vb = val[idx(i + 1, j, k)]; if ((va < 0) === (vb < 0)) continue;
    quad(cellV[cidx(i, j - 1, k - 1)], cellV[cidx(i, j, k - 1)], cellV[cidx(i, j, k)], cellV[cidx(i, j - 1, k)], va < 0);
  }
  for (let k = 1; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const va = val[idx(i, j, k)], vb = val[idx(i, j + 1, k)]; if ((va < 0) === (vb < 0)) continue;
    quad(cellV[cidx(i - 1, j, k - 1)], cellV[cidx(i - 1, j, k)], cellV[cidx(i, j, k)], cellV[cidx(i, j, k - 1)], va < 0);
  }
  for (let k = 0; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const va = val[idx(i, j, k)], vb = val[idx(i, j, k + 1)]; if ((va < 0) === (vb < 0)) continue;
    quad(cellV[cidx(i - 1, j - 1, k)], cellV[cidx(i, j - 1, k)], cellV[cidx(i, j, k)], cellV[cidx(i - 1, j, k)], va < 0);
  }
  return { quads, evals, grid: [nx, ny, nz] };
}

// quads (loop order) -> triangles along the shorter diagonal
function triangulate(p, quads) {
  const d2 = (a, b) => { const x = p[a * 3] - p[b * 3], y = p[a * 3 + 1] - p[b * 3 + 1], z = p[a * 3 + 2] - p[b * 3 + 2]; return x * x + y * y + z * z; };
  const tri = [];
  for (let q = 0; q < quads.length; q += 4) {
    const a = quads[q], b = quads[q + 1], c = quads[q + 2], d = quads[q + 3];
    if (d2(a, c) <= d2(b, d)) tri.push(a, b, c, a, c, d); else tri.push(a, b, d, b, c, d);
  }
  return tri;
}

// Split triangles along g = 0. g holds one value per vertex that exists now; vertices made by the split get g = 0.
// make(i, j, t) adds the vertex on edge i-j (t from i) and returns its index. Shared edges make one vertex, so the
// result stays watertight.
function split(tri, g, make) {
  const n0 = g.length, G = (i) => (i < n0 ? g[i] : 0);
  const edges = new Map(), out = [];
  const mid = (i, j) => {
    const key = i < j ? i * 8388608 + j : j * 8388608 + i;
    let m = edges.get(key);
    if (m === undefined) { const gi = G(i); m = make(i, j, gi / (gi - G(j))); edges.set(key, m); }
    return m;
  };
  for (let q = 0; q < tri.length; q += 3) {
    const v0 = tri[q], v1 = tri[q + 1], v2 = tri[q + 2];
    const s0 = Math.sign(G(v0)), s1 = Math.sign(G(v1)), s2 = Math.sign(G(v2));
    const np = (s0 > 0) + (s1 > 0) + (s2 > 0), nn = (s0 < 0) + (s1 < 0) + (s2 < 0);
    if (np === 0 || nn === 0) { out.push(v0, v1, v2); continue; }
    const v = [v0, v1, v2], s = [s0, s1, s2], zero = s.indexOf(0);
    if (zero >= 0) {   // one vertex on the line, the other two on either side
      const a = v[zero], b = v[(zero + 1) % 3], c = v[(zero + 2) % 3], m = mid(b, c);
      out.push(a, b, m, a, m, c);
      continue;
    }
    let o = 0;
    for (let k = 0; k < 3; k++) if (s[k] !== s[(k + 1) % 3] && s[k] !== s[(k + 2) % 3]) o = k;
    const a = v[o], b = v[(o + 1) % 3], c = v[(o + 2) % 3], mab = mid(a, b), mac = mid(a, c);
    out.push(a, mab, mac, mab, b, c, mab, c, mac);
  }
  out.edges = edges;
  return out;
}

// After a cut of only some triangles: split their neighbours' edges at the same new vertices (no T-junctions)
function mend(tri, edges) {
  const out = [], at = (i, j) => edges.get(i < j ? i * 8388608 + j : j * 8388608 + i);
  for (let q = 0; q < tri.length; q += 3) {
    let v = [tri[q], tri[q + 1], tri[q + 2]], done = false;
    for (let e = 0; e < 3 && !done; e++) {
      const a = v[e], b = v[(e + 1) % 3], c = v[(e + 2) % 3], m = at(a, b);
      if (m === undefined) continue;
      // split this edge; the two halves may need more splits (a corner triangle): run them through again
      const sub = mend([a, m, c, m, b, c], edges);
      for (const x of sub) out.push(x);
      done = true;
    }
    if (!done) out.push(v[0], v[1], v[2]);
  }
  return out;
}

// Also returns the parts themselves (as data: the main thread takes them as they are, see Part.fromData) and the
// print layout, so the main thread has no body maths to do.
export function buildMesh({ body = BODY, anchors, h = 0.0062, regions, size = 2048, waist = 0.165, lip = 0.0008, grain = 0.012 } = {}) {
  const ms = {}, t0 = now(), openV = new Set();   // openV: vertices on an opening's edge
  const P = buildBody(body, anchors), F = bodyField(P, body), S = seamFns(P, body);
  ms.parts = now() - t0;
  const V = new Verts(1 << 15), g3 = [0, 0, 0];
  // ---- surface nets on the left half (x >= 0), a little past the centre plane ----
  let t = now();
  const sn = surfaceNets(F, [-2 * h, -0.27, -0.175, 0.31, 0.76, 0.175], h, V);
  ms.nets = now() - t; t = now();
  for (let i = 0; i < V.n; i++) projectOne(F, V.p, i, 1, g3);
  let tri = triangulate(V.p, sn.quads);
  ms.project = now() - t; t = now();

  // a new vertex on an edge: interpolated, then pulled back onto the surface
  // (an edge inside the centre plane stays in it, so the halves weld)
  const onSurf = (i, j, s) => {
    const p = V.p, inPlane = p[i * 3] === 0 && p[j * 3] === 0;
    const k = V.add(p[i * 3] + (p[j * 3] - p[i * 3]) * s, p[i * 3 + 1] + (p[j * 3 + 1] - p[i * 3 + 1]) * s, p[i * 3 + 2] + (p[j * 3 + 2] - p[i * 3 + 2]) * s);
    if (inPlane) projectPlane(k); else projectOne(F, V.p, k, 2, g3);
    if (openV.has(i) && openV.has(j)) openV.add(k);   // a later cut through an opening's edge stays on it
    return k;
  };
  // A cut evaluates its function only where roi() returns undefined; elsewhere its sign is known from roi().
  // Vertices closer to the line than snapTol (in distance along the surface) are moved onto it first, so the split
  // never leaves slivers.
  const snapTol = 0.16 * h;
  let gEvals = 0, snapped = 0;
  const evalG = (fn, roi) => {
    const n = V.n, out = new Float64Array(n), p = V.p;
    for (let i = 0; i < n; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const r = roi ? roi(x, y, z) : undefined;
      if (r !== undefined) { out[i] = r; continue; }
      out[i] = fn(x, y, z); gEvals++;
    }
    return out;
  };
  // candidates: vertices of the list near the line; of an edge across the line only the nearer end may move,
  // so no edge collapses
  const candidates = (g, list) => {
    const u = new Uint8Array(V.n), lim = snapTol * 4;
    for (let q = 0; q < list.length; q++) { const i = list[q], gi = g[i]; if (gi !== 0 && Math.abs(gi) < lim) u[i] = 1; }
    for (let q = 0; q < list.length; q += 3) for (let e = 0; e < 3; e++) {
      const a = list[q + e], b = list[q + ((e + 1) % 3)];
      if (u[a] && u[b] && g[a] * g[b] < 0) { if (Math.abs(g[a]) > Math.abs(g[b])) u[a] = 0; else u[b] = 0; }
    }
    return u;
  };
  const snap = (fn, g, list, fix) => {
    const p = V.p, u = candidates(g, list), e = 0.0006;
    for (let i = 0; i < g.length; i++) {
      const gi = g[i];
      if (!u[i]) continue;
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2], inPlane = x === 0;
      let gx = (fn(x + e, y, z) - fn(x - e, y, z)) / (2 * e), gy = (fn(x, y + e, z) - fn(x, y - e, z)) / (2 * e), gz = (fn(x, y, z + e) - fn(x, y, z - e)) / (2 * e);
      gradient(F, x, y, z, 0.001, g3);
      const dn = gx * g3[0] + gy * g3[1] + gz * g3[2]; gx -= dn * g3[0]; gy -= dn * g3[1]; gz -= dn * g3[2];   // along the surface
      const l2 = gx * gx + gy * gy + gz * gz;
      if (l2 < 1e-8 || Math.abs(gi) / Math.sqrt(l2) > snapTol) continue;
      p[i * 3] = x - (gi * gx) / l2; p[i * 3 + 1] = y - (gi * gy) / l2; p[i * 3 + 2] = z - (gi * gz) / l2;
      if (inPlane) projectPlane(i); else projectOne(F, p, i, 1, g3);
      if (fix) fix(i);
      g[i] = 0; snapped++;
    }
  };
  const cut = (fn, { roi = null, drop = false, opening = false, list = tri, fix = null, make = onSurf } = {}) => {
    const g = evalG(fn, roi);
    snap(fn, g, list, fix);
    const n0 = g.length;
    const out = split(list, g, fix ? (i, j, s) => { const k = make(i, j, s); fix(k); return k; } : make);
    if (!drop) return out;
    const G = (i) => (i < n0 ? g[i] : 0), keep = [];
    for (let q = 0; q < out.length; q += 3) if (G(out[q]) + G(out[q + 1]) + G(out[q + 2]) <= 0) keep.push(out[q], out[q + 1], out[q + 2]);
    if (opening) { for (let i = 0; i < n0; i++) if (g[i] === 0) openV.add(i); for (let i = n0; i < V.n; i++) openV.add(i); }
    return keep;
  };

  // ---- the centre plane: an exact edge, so the mirrored half welds onto it ----
  const onPlane = (i) => { V.p[i * 3] = 0; projectPlane(i); };
  tri = cut((x) => -x, { drop: true, roi: (x) => (x > 2.5 * h ? -1 : x < -2.5 * h ? 1 : undefined), fix: onPlane });
  function projectPlane(k) {   // onto F = 0 inside the plane x = 0 (the gradient has no x part there, by symmetry)
    for (let it = 0; it < 2; it++) {
      const p = V.p, y = p[k * 3 + 1], z = p[k * 3 + 2], d = F(0, y, z), gl = gradient(F, 0, y, z, 0.001, g3), s = d / Math.max(gl, 0.3);
      const l = Math.hypot(g3[1], g3[2]) || 1;
      p[k * 3 + 1] = y - (g3[1] / l) * s; p[k * 3 + 2] = z - (g3[2] / l) * s; p[k * 3] = 0;
    }
  }
  // ---- openings ----
  const B = body;
  tri = cut((x, y, z) => y - neckY(neckTheta(x, z, B), B), { drop: true, opening: true, roi: (x, y) => (y > 0.6 ? undefined : -1) });
  const lc = [0, 0, 0];
  const hemCut = (part, rl, roi) => cut((x, y, z) => { part.local(x, y, z, lc); return Math.min(-lc[0], rl - lc[2]); }, { drop: true, opening: true, roi });
  tri = hemCut(P.sleeveL, 0.062, (x, y) => (x > 0.12 && y > 0.25 && y < 0.56 ? undefined : -1));
  tri = hemCut(P.legL, 0.105, (x, y) => (y < -0.15 && x > 0 ? undefined : -1));
  // ---- panel seams, both sides kept: the collar binding (all the way round), the raglans, the legs ----
  tri = cut((x, y, z) => y - neckY(neckTheta(x, z, B), B) + B.neck.binding, { roi: (x, y) => (y > 0.58 ? undefined : -1) });
  tri = cut(S.sleeveL, { roi: (x, y) => (y > B.raglan.yMin - 0.01 && x > 0.03 ? undefined : -1) });
  tri = cut(S.legL, { roi: (x, y) => (x < -0.03 || y > 0.24 ? -1 : y < -0.12 ? 1 : undefined) });
  // ---- one part per triangle (centroid) ----
  const regionL = (x, y, z) => (S.sleeveL(x, y, z) > 0 ? 1 : S.legL(x, y, z) > 0 ? 3 : 0);   // (the binding is torso)
  let reg = [];
  {
    const p = V.p;
    for (let q = 0; q < tri.length; q += 3) {
      const a = tri[q] * 3, b = tri[q + 1] * 3, c = tri[q + 2] * 3;
      reg.push(regionL((p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3));
    }
  }
  // ---- each part's texture wrap: a half plane through its axis. The torso wraps at 245 deg, on the right half:
  // its mirror image (115 deg) is cut here, so the mirrored copy carries the real one ----
  // (a sleeve wraps under the arm only: below the shoulder joint, where its panel already ends at the raglan seam)
  const wraps = [[0, P.torso, -P.torso.seam, Infinity], [1, P.sleeveL, P.sleeveL.seam, body.sleeveLen], [3, P.legL, P.legL.seam, Infinity]];
  for (const [r, part, seam, tTop] of wraps) {
    const cs = Math.cos(seam), sn = Math.sin(seam), pr = new Float64Array(5);
    const frame = (x, y, z) => {
      const qx = x - part.ox, qy = y - part.oy, qz = z - part.oz, tt = qx * part.ux + qy * part.uy + qz * part.uz;
      lc[0] = qx * part.sx + qy * part.sy + qz * part.sz; lc[1] = qx * part.fx + qy * part.fy + qz * part.fz - part.prof5(tt, pr)[4]; lc[2] = tt;
    };
    const fn = (x, y, z) => { frame(x, y, z); return lc[0] * cs - lc[1] * sn; };
    const side = (x, y, z) => { frame(x, y, z); return lc[0] * sn + lc[1] * cs > 0 && lc[2] < tTop; };
    const sub = [], rest = [], subR = [], restR = [], p = V.p;
    for (let q = 0, f = 0; q < tri.length; q += 3, f++) {
      const a = tri[q] * 3, b = tri[q + 1] * 3, c = tri[q + 2] * 3;
      const inSub = reg[f] === r && side((p[a] + p[b] + p[c]) / 3, (p[a + 1] + p[b + 1] + p[c + 1]) / 3, (p[a + 2] + p[b + 2] + p[c + 2]) / 3);
      (inSub ? sub : rest).push(tri[q], tri[q + 1], tri[q + 2]); (inSub ? subR : restR).push(reg[f]);
    }
    if (!sub.length) continue;
    // (the line g = 0 also runs through the opposite half plane: only the triangles on the seam's side are cut,
    // with the true g on all their vertices, and their neighbours mended)
    const cutTri = cut(fn, { list: sub });
    const mended = [], mendedR = [];
    for (let q = 0, f = 0; q < rest.length; q += 3, f++) {
      const m = mend([rest[q], rest[q + 1], rest[q + 2]], cutTri.edges);
      for (const x of m) mended.push(x);
      for (let k = 0; k < m.length / 3; k++) mendedR.push(restR[f]);
    }
    tri = mended.concat(cutTri); reg = mendedR.concat(new Array(cutTri.length / 3).fill(r));
  }
  ms.cuts = now() - t; t = now();

  // ---- normals (field gradient: the same on both sides of every seam) and baked occlusion ----
  const nL = V.n, pL = V.p, nrm = new Float32Array(nL * 3), ao = new Float32Array(nL);
  for (let i = 0; i < nL; i++) {
    const x = pL[i * 3], y = pL[i * 3 + 1], z = pL[i * 3 + 2];
    gradient(F, x, y, z, 0.0012, g3);
    if (x === 0) { g3[0] = 0; const l = Math.hypot(g3[1], g3[2]) || 1; g3[1] /= l; g3[2] /= l; }
    nrm[i * 3] = g3[0]; nrm[i * 3 + 1] = g3[1]; nrm[i * 3 + 2] = g3[2];
    let occ = 0, w = 1;
    for (let s = 1; s <= 3; s++) { const hh = 0.014 * s; occ += (w * Math.max(0, hh - F(x + g3[0] * hh, y + g3[1] * hh, z + g3[2] * hh))) / hh; w *= 0.6; }
    ao[i] = 1 - Math.min(0.45, occ * 0.32);
  }
  ms.normals = now() - t; t = now();

  // ---- mirror: x -> -x, left parts -> right parts; vertices on the centre plane are shared ----
  const map = new Int32Array(nL);
  let nV = nL;
  for (let i = 0; i < nL; i++) { if (Math.abs(pL[i * 3]) < 1e-7) pL[i * 3] = 0; map[i] = pL[i * 3] === 0 ? i : nV++; }
  const pos = new Float32Array(nV * 3), nor = new Float32Array(nV * 3), occ = new Float32Array(nV);
  for (let i = 0; i < nL; i++) {
    const m = map[i];
    pos[i * 3] = pL[i * 3]; pos[i * 3 + 1] = pL[i * 3 + 1]; pos[i * 3 + 2] = pL[i * 3 + 2];
    nor[i * 3] = nrm[i * 3]; nor[i * 3 + 1] = nrm[i * 3 + 1]; nor[i * 3 + 2] = nrm[i * 3 + 2]; occ[i] = ao[i];
    if (m !== i) { pos[m * 3] = -pL[i * 3]; pos[m * 3 + 1] = pL[i * 3 + 1]; pos[m * 3 + 2] = pL[i * 3 + 2]; nor[m * 3] = -nrm[i * 3]; nor[m * 3 + 1] = nrm[i * 3 + 1]; nor[m * 3 + 2] = nrm[i * 3 + 2]; occ[m] = ao[i]; }
  }
  const byPart = PARTS.map(() => []);
  for (let q = 0, f = 0; q < tri.length; q += 3, f++) {
    const a = tri[q], b = tri[q + 1], c = tri[q + 2];
    if (pL[a * 3] === 0 && pL[b * 3] === 0 && pL[c * 3] === 0) continue;   // a fin in the centre plane (its mirror would overlap it)
    byPart[reg[f]].push(a, b, c);
    byPart[MIRROR[reg[f]]].push(map[a], map[c], map[b]);
  }

  // ---- open edges (the five openings): per vertex, the direction out of the fabric along the surface ----
  const isOpen = new Uint8Array(nV);
  for (const i of openV) if (i < nL) { isOpen[i] = 1; isOpen[map[i]] = 1; }
  const edgeUse = new Map();
  for (let r = 0; r < 5; r++) {
    const L = byPart[r];
    for (let q = 0; q < L.length; q += 3) for (let e = 0; e < 3; e++) {
      const a = L[q + e], b = L[q + ((e + 1) % 3)];
      if (!isOpen[a] || !isOpen[b]) continue;
      const key = a < b ? a * 8388608 + b : b * 8388608 + a, u = edgeUse.get(key);
      if (u === undefined) edgeUse.set(key, [a, b, L[q + ((e + 2) % 3)], r, 1]); else u[4]++;
    }
  }
  const open = [];   // [a, b, c (the third vertex of its triangle, wound a -> b -> c), part]
  for (const u of edgeUse.values()) if (u[4] === 1) open.push(u);
  const outDir = new Float32Array(nV * 3);
  for (const [a, b, c] of open) {
    const ex = pos[b * 3] - pos[a * 3], ey = pos[b * 3 + 1] - pos[a * 3 + 1], ez = pos[b * 3 + 2] - pos[a * 3 + 2];
    const nx = nor[a * 3] + nor[b * 3], ny = nor[a * 3 + 1] + nor[b * 3 + 1], nz = nor[a * 3 + 2] + nor[b * 3 + 2];
    let ox = ey * nz - ez * ny, oy = ez * nx - ex * nz, oz = ex * ny - ey * nx;
    const mx = (pos[a * 3] + pos[b * 3]) / 2 - pos[c * 3], my = (pos[a * 3 + 1] + pos[b * 3 + 1]) / 2 - pos[c * 3 + 1], mz = (pos[a * 3 + 2] + pos[b * 3 + 2]) / 2 - pos[c * 3 + 2];
    if (ox * mx + oy * my + oz * mz < 0) { ox = -ox; oy = -oy; oz = -oz; }
    const l = Math.hypot(ox, oy, oz) || 1;
    for (const v of [a, b]) { outDir[v * 3] += ox / l; outDir[v * 3 + 1] += oy / l; outDir[v * 3 + 2] += oz / l; }
  }

  // ---- per part: unique vertices (split along the texture wrap), uv from the part's own parametrisation ----
  const out = {}, lcl = [0, 0, 0];
  const E5 = new Float64Array(nV * 5), done = new Int8Array(nV), ids = new Int32Array(nV * 3);
  for (let r = 0; r < 5; r++) {
    const name = PARTS[r], part = P[name], R = regions[name], L = byPart[r];
    done.fill(0); ids.fill(-1);
    const nOpen = open.reduce((n, o) => n + (o[3] === r), 0), cap = L.length + nOpen * 2 * (LIP + 1) + 16;
    const Pa = new Float32Array(cap * 3), Na = new Float32Array(cap * 3), Ua = new Float32Array(cap * 2), U1 = new Float32Array(cap * 2), Ca = new Uint8Array(cap * 3);
    const I = new Uint32Array(L.length + nOpen * 6 * LIP);
    let nO = 0, nI = 0;
    const entry = (i) => {   // [u, v, x (arc fraction), ring length, t along the axis]
      if (!done[i]) {
        done[i] = 1;
        const [u, v, xf] = part.uvOf(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], lcl);
        const [i0, i1, f] = part.ringIndex(v);
        E5[i * 5] = u; E5[i * 5 + 1] = v; E5[i * 5 + 2] = xf; E5[i * 5 + 3] = part.tables[i0][part.K] * (1 - f) + part.tables[i1][part.K] * f; E5[i * 5 + 4] = lcl[0];
      }
      return i * 5;
    };
    const vert = (i, br) => {   // br: 0 as is, 1 one turn up (u + 1), 2 one turn down
      const key = i * 3 + br;
      if (ids[key] >= 0) return ids[key];
      const id = nO++, e = i * 5, du = br === 1 ? 1 : br === 2 ? -1 : 0;
      ids[key] = id;
      Pa[id * 3] = pos[i * 3]; Pa[id * 3 + 1] = pos[i * 3 + 1]; Pa[id * 3 + 2] = pos[i * 3 + 2];
      Na[id * 3] = nor[i * 3]; Na[id * 3 + 1] = nor[i * 3 + 1]; Na[id * 3 + 2] = nor[i * 3 + 2];
      Ua[id * 2] = (R.x + (E5[e] + du) * R.w) / size; Ua[id * 2 + 1] = 1 - (R.y + (1 - E5[e + 1]) * R.h) / size;
      U1[id * 2] = ((E5[e + 2] + du) * E5[e + 3]) / grain; U1[id * 2 + 1] = E5[e + 4] / grain;
      Ca[id * 3] = Ca[id * 3 + 1] = Ca[id * 3 + 2] = Math.round(clamp(occ[i], 0, 1) * 255);
      return id;
    };
    const first = new Int32Array(nV).fill(-1);   // a vertex's first output id in this part (for the lips)
    for (let q = 0; q < L.length; q += 3) {
      const a = L[q], b = L[q + 1], c = L[q + 2], ea = entry(a), eb = entry(b), ec = entry(c);
      let ba = 0, bb = 0, bc = 0;
      const xa = E5[ea + 2], xb = E5[eb + 2], xc = E5[ec + 2];
      if (Math.max(xa, xb, xc) - Math.min(xa, xb, xc) > 0.5) {   // touches the wrap: all three on the branch of its inside
        part.local((pos[a * 3] + pos[b * 3] + pos[c * 3]) / 3, (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1]) / 3, (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2]) / 3, lcl);
        let d = (lcl[1] - part.seam) % (2 * Math.PI); if (d < 0) d += 2 * Math.PI;
        const high = d > Math.PI, br = (x) => (high ? (x < 0.5 ? 1 : 0) : (x > 0.5 ? 2 : 0));
        ba = br(xa); bb = br(xb); bc = br(xc);
      }
      const ia = vert(a, ba), ib = vert(b, bb), ic = vert(c, bc);
      I[nI++] = ia; I[nI++] = ib; I[nI++] = ic;
      if (first[a] < 0) first[a] = ia; if (first[b] < 0) first[b] = ib; if (first[c] < 0) first[c] = ic;
    }
    const lip0 = nI;
    // ---- rolled lips along this part's openings: half a turn of fabric, radius lip, curling inwards ----
    for (const [a, b, , pr] of open) {
      if (pr !== r) continue;
      const ring = [];
      for (const v of [a, b]) {
        const id = first[v], ox0 = outDir[v * 3], oy0 = outDir[v * 3 + 1], oz0 = outDir[v * 3 + 2], ol = Math.hypot(ox0, oy0, oz0) || 1;
        const ox = ox0 / ol, oy = oy0 / ol, oz = oz0 / ol, nx = Na[id * 3], ny = Na[id * 3 + 1], nz = Na[id * 3 + 2];
        const r0 = nO;
        for (let k = 0; k <= LIP; k++) {
          const ph = (k / LIP) * Math.PI, sn = Math.sin(ph), cs = Math.cos(ph), j = nO++;
          Pa[j * 3] = Pa[id * 3] + lip * (sn * ox - (1 - cs) * nx); Pa[j * 3 + 1] = Pa[id * 3 + 1] + lip * (sn * oy - (1 - cs) * ny); Pa[j * 3 + 2] = Pa[id * 3 + 2] + lip * (sn * oz - (1 - cs) * nz);
          const mx = cs * nx + sn * ox, my = cs * ny + sn * oy, mz = cs * nz + sn * oz, ml = Math.hypot(mx, my, mz) || 1;
          Na[j * 3] = mx / ml; Na[j * 3 + 1] = my / ml; Na[j * 3 + 2] = mz / ml;
          Ua[j * 2] = Ua[id * 2]; Ua[j * 2 + 1] = Ua[id * 2 + 1]; U1[j * 2] = U1[id * 2] + k * 0.02; U1[j * 2 + 1] = U1[id * 2 + 1];
          Ca[j * 3] = Ca[j * 3 + 1] = Ca[j * 3 + 2] = Math.round(Ca[id * 3] * (1 - 0.2 * (k / LIP)));
        }
        ring.push(r0);   // (LIP + 1 vertices)
      }
      const [A, Bv] = ring;
      for (let k = 0; k < LIP; k++) { I[nI++] = Bv + k; I[nI++] = A + k; I[nI++] = A + k + 1; I[nI++] = Bv + k; I[nI++] = A + k + 1; I[nI++] = Bv + k + 1; }
    }
    out[name] = {
      position: Pa.slice(0, nO * 3), normal: Na.slice(0, nO * 3), uv: Ua.slice(0, nO * 2), uv1: U1.slice(0, nO * 2), color: Ca.slice(0, nO * 3),
      index: nO < 65536 ? Uint16Array.from(I.subarray(0, nI)) : I.slice(0, nI), lip0,
    };
  }
  ms.split = now() - t; t = now();
  const layout = printLayout(P, body, { regions, waist });
  ms.layout = now() - t;
  ms.total = now() - t0;
  const stats = { grid: sn.grid, evals: sn.evals, gEvals, snapped, verts: nV, tris: (tri.length / 3) * 2, open: open.length, ms };
  for (const k in ms) ms[k] = Math.round(ms[k]);
  return { parts: out, stats, body: Object.fromEntries(PARTS.map((k) => [k, P[k].toData()])), layout };
}
