/**
 * The golden collectible floating over the road (see ride/lemons.js). Upstream
 * OpenRadlr draws a lemon here, its mascot; GOCARMO Ride draws a golden sun,
 * after the sun of its own symbol: a flat disc with eight short rays around
 * it, all in one upright plane (local XY), centred on the origin. The world
 * turns that plane across the road, so a rider coming up sees the sun face on
 * (view3d.js). Both faces are drawn. Drawn bright, so it glows a little in any
 * light. The file and function names stay as upstream has them.
 */
import { MeshBuilder } from "./meshBuilder.js";

export const LEMON_COLORS = Object.freeze({ peel: [0.95, 0.74, 0.3], nub: [0.9, 0.66, 0.22] });

/** Rays around the disc, and the disc's corners (a 16-gon reads as round at this size). */
const RAYS = 8;
const SIDES = 16;
const DISC = 0.3;
/** A ray: from just off the disc to its blunt tip, narrowing a little, as in the symbol. */
const RAY = Object.freeze({ from: 0.36, to: 0.54, footHalf: 0.07, tipHalf: 0.04 });
/** Half the thickness of the plate: enough to keep an edge when seen from the side. */
const HALF_DEPTH = 0.03;

/** About 1 m across: easy to spot close up, a golden dot further on (an easter egg, not a beacon). */
export function buildLemon() {
  const m = new MeshBuilder();
  for (const face of [1, -1]) {
    const z = face * HALF_DEPTH;
    const facing = [0, 0, face];
    const at = (radius, angle, across = 0) => [Math.cos(angle) * radius - Math.sin(angle) * across, Math.sin(angle) * radius + Math.cos(angle) * across, z];
    for (let i = 0; i < SIDES; i += 1) {
      const a0 = (i / SIDES) * Math.PI * 2;
      const a1 = ((i + 1) / SIDES) * Math.PI * 2;
      m.triangleFacing([0, 0, z], at(DISC, a0), at(DISC, a1), LEMON_COLORS.peel, facing);
    }
    for (let i = 0; i < RAYS; i += 1) {
      const angle = (i / RAYS) * Math.PI * 2;
      const foot = [at(RAY.from, angle, -RAY.footHalf), at(RAY.from, angle, RAY.footHalf)];
      const tip = [at(RAY.to, angle, RAY.tipHalf), at(RAY.to, angle, -RAY.tipHalf)];
      m.triangleFacing(foot[0], foot[1], tip[0], LEMON_COLORS.nub, facing);
      m.triangleFacing(foot[0], tip[0], tip[1], LEMON_COLORS.nub, facing);
    }
  }
  // The rim of the disc, so the plate is not a hairline when the road bends away.
  for (let i = 0; i < SIDES; i += 1) {
    const a0 = (i / SIDES) * Math.PI * 2;
    const a1 = ((i + 1) / SIDES) * Math.PI * 2;
    const mid = (a0 + a1) / 2;
    const p = (angle, z) => [Math.cos(angle) * DISC, Math.sin(angle) * DISC, z];
    const out = [Math.cos(mid), Math.sin(mid), 0];
    m.triangleFacing(p(a0, -HALF_DEPTH), p(a1, -HALF_DEPTH), p(a1, HALF_DEPTH), LEMON_COLORS.nub, out);
    m.triangleFacing(p(a0, -HALF_DEPTH), p(a1, HALF_DEPTH), p(a0, HALF_DEPTH), LEMON_COLORS.nub, out);
  }
  return m.build();
}
