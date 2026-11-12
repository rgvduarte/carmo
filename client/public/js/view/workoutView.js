import { totalDuration, zoneFor } from "../ride/workout.js";
import { prepareCanvas } from "./canvas.js";

/**
 * Zone colours 1–6 (recovery … anaerobic): one ramp from grey to the site's gold, the same the ride image uses,
 * so the finish dialog and the image beside it agree. (Upstream: the usual training-app rainbow.)
 */
export const ZONE_COLORS = Object.freeze(["#3a3a3d", "#5c4a26", "#8a6d33", "#b8903f", "#e6b450", "#f2d08a"]);

/**
 * Polygons for a workout chart: x = time, y = target as a fraction of FTP.
 * @returns {{points: number[][], zone: number, start: number, end: number}[]}
 */
export function workoutShapes(workout, width, height, { maxFraction = null, padding = 4 } = {}) {
  const total = totalDuration(workout);
  const top = maxFraction ?? Math.max(1.2, ...workout.segments.flatMap((s) => [s.from, s.to])) * 1.05;
  const x = (t) => (t / total) * width;
  const y = (fraction) => height - padding - (fraction / top) * (height - 2 * padding);
  let t = 0;
  return workout.segments.map((segment) => {
    const start = t;
    t += segment.durationS;
    return {
      start,
      end: t,
      zone: zoneFor((segment.from + segment.to) / 2),
      points: [
        [x(start), height],
        [x(start), y(segment.from)],
        [x(t), y(segment.to)],
        [x(t), height],
      ],
    };
  });
}

export function drawWorkout(canvas, { workout, elapsedS, colors }) {
  const { ctx, width, height } = prepareCanvas(canvas);
  const total = totalDuration(workout);
  for (const shape of workoutShapes(workout, width, height)) {
    ctx.beginPath();
    shape.points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
    ctx.closePath();
    ctx.fillStyle = ZONE_COLORS[shape.zone - 1];
    ctx.globalAlpha = shape.end <= elapsedS ? 0.35 : 0.9;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  if (elapsedS === null) return;
  const nowX = (Math.min(elapsedS, total) / total) * width;
  ctx.strokeStyle = colors.text;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nowX, 0);
  ctx.lineTo(nowX, height);
  ctx.stroke();
}

/** A static power profile of a workout (no "now" line); clears the canvas when there is none. */
export function drawWorkoutPreview(canvas, workout) {
  prepareCanvas(canvas);
  if (!workout) return;
  drawWorkout(canvas, { workout, elapsedS: null });
}
