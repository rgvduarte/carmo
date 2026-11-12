/**
 * The golden collectible floating over the road (see ride/lemons.js). Upstream
 * OpenRadlr draws a lemon here, its mascot; GOCARMO Ride draws a golden sun,
 * after the sun of its own symbol: a ball with short rays around it, centred
 * on the origin. The rays stand in two upright rings at right angles, so the
 * sun reads as one from every side while it spins. Drawn bright, so it glows a
 * little in any light. The file and function names stay as upstream has them.
 */
import { MeshBuilder } from "./meshBuilder.js";

export const LEMON_COLORS = Object.freeze({ peel: [0.95, 0.74, 0.3], nub: [0.9, 0.66, 0.22] });

/** Rays per ring. */
const RAYS = 8;

/** About 1 m across: easy to spot close up, a golden dot further on (an easter egg, not a beacon). */
export function buildLemon() {
  const m = new MeshBuilder();
  m.ellipsoid([0, 0, 0], [0.3, 0.3, 0.3], LEMON_COLORS.peel, 5, 10);
  for (let i = 0; i < RAYS; i += 1) {
    const angle = (i / RAYS) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // The ring facing the road, then the ring across it (its upright rays are the first ring's).
    spike(m, [cos, sin, 0], [-sin, cos, 0], [0, 0, 1]);
    if (Math.abs(cos) > 1e-6) spike(m, [0, sin, cos], [0, cos, -sin], [1, 0, 0]);
  }
  return m.build();
}

/** A four-sided spike along `out`: a square foot just off the ball (sides along `a` and `b`), narrowing to the tip. */
function spike(m, out, a, b) {
  const at = (r, u, v) => [0, 1, 2].map((k) => out[k] * r + a[k] * u + b[k] * v);
  const tip = at(0.56, 0, 0);
  const foot = [at(0.36, 0.075, 0.075), at(0.36, -0.075, 0.075), at(0.36, -0.075, -0.075), at(0.36, 0.075, -0.075)];
  const facing = [b, a.map((x) => -x), b.map((x) => -x), a];
  foot.forEach((corner, k) => m.triangleFacing(corner, foot[(k + 1) % 4], tip, LEMON_COLORS.nub, facing[k]));
}
