/**
 * What the ride image shows, worked out from a recorded ride: which metrics
 * (never one for a sensor the rider did not have), the time in each power
 * zone, the track on the map, the profile, and where each block sits in the
 * two sizes of the image. Plain data and pure functions, no canvas: view/rideCard.js
 * draws what this file decides, and the finish dialog lists the same metrics.
 */

import { distanceUnit, elevationUnit, formatDistance, formatDuration, formatNumber, formatSpeed, getUnits, speedUnit } from "../util/format.js";
import { intlLocale, t, tn } from "../i18n/i18n.js";
import { powerSeries, weightedPower } from "../ride/powerAnalysis.js";
import { zoneFor } from "../ride/workout.js";
import { fromLatLon } from "../route/geo.js";

/** The two sizes of the image: upright for a phone and for Strava, wide for a desktop or a post. */
export const CARD_FORMATS = Object.freeze({
  portrait: Object.freeze({ id: "portrait", width: 1080, height: 1350 }),
  landscape: Object.freeze({ id: "landscape", width: 1600, height: 900 }),
});

/**
 * Routes made from third parties' data, and the notice their licences ask for
 * wherever that data is shown to the public: the ride image, the ride's
 * photos and the .tcx and .gpx files leave the game, so they carry it
 * themselves (the About dialog covers only the game). OpenStreetMap: ODbL 1.0,
 * section 4.3; the elevation: the Copernicus DEM licence, its wording for
 * adapted data, word for word. The server keeps the same words for the
 * description of a ride sent to Strava (`ROUTE_DATA_CREDIT` in
 * server/crates/server/src/strava_api.rs; a server test compares the two):
 * change both together.
 */
export const ROUTE_DATA_CREDIT = Object.freeze({
  "lanzarote-lava-180": "© OpenStreetMap contributors, ODbL · Elevation produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved", // i18n-ok (a licence notice, kept as its owners wrote it)
});

/** The notice a route's data asks for, or null for a route GOCARMO Ride or the original drew itself. */
export const routeDataCredit = (routeId) => (routeId && Object.hasOwn(ROUTE_DATA_CREDIT, routeId) ? ROUTE_DATA_CREDIT[routeId] : null);

/** Weighted power says little about a short ride: it is shown from 20 minutes on. */
export const WEIGHTED_MIN_S = 1200;
/** Power zones, as the ride's HUD counts them (ride/workout.js `zoneFor`). */
export const ZONE_COUNT = 6;
/** A loop counts as ridden "several times" from two laps on. */
const LAPS_SHOWN_FROM = 2;
/** Two samples further apart than this are not joined on the map (the rider came back somewhere else). */
const TRACK_JUMP_M = 400;

const M_PER_FOOT = 0.3048;

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

/**
 * The ride's numbers in order of weight, each `{id, label, value, unit}` with
 * the value already written for the rider's language and units. A sensor that
 * recorded nothing (heart rate, cadence) has no entry at all, a ride without
 * heights (a studio class) no climb, and weighted power needs a ride of
 * WEIGHTED_MIN_S. The first four are the image's large numbers.
 * @param {{summary: object, samples: object[], pauses?: object[], weightKg?: ?number}} ride
 * @returns {{id: string, label: string, value: string, unit: string}[]}
 */
export function cardMetrics({ summary, samples, pauses = [], weightKg = null }) {
  const metrics = [];
  const add = (id, labelKey, value, unit = "") => metrics.push({ id, label: t(labelKey), value: String(value), unit });
  const km = summary.distanceM / (getUnits() === "imperial" ? 1609.344 : 1000);

  add("time", "finish.time", formatDuration(summary.durationS));
  add("distance", "finish.distance", formatDistance(summary.distanceM, km >= 100 ? 1 : 2), distanceUnit());
  add("speed", "finish.avgSpeed", formatSpeed(summary.avgSpeed), speedUnit());
  if (samples.some((sample) => sample.elevation !== null)) {
    add("climb", "finish.climbed", formatNumber(Math.round(summary.elevationGainM / (getUnits() === "imperial" ? M_PER_FOOT : 1)), 0), elevationUnit());
  }
  add("avgPower", "finish.avgPower", formatNumber(summary.avgPower, 0), "W");
  const weighted = summary.durationS >= WEIGHTED_MIN_S ? weightedPower(samples, pauses) : null;
  if (weighted !== null) add("weightedPower", "overview.weightedPower", formatNumber(weighted, 0), "W");
  add("maxPower", "finish.maxPower", formatNumber(summary.maxPower, 0), "W");
  if (weightKg > 0 && summary.avgPower > 0) add("wkg", "finish.wkg", formatNumber(summary.avgPower / weightKg, 2));
  add("work", "finish.work", formatNumber(summary.kilojoules, 0), "kJ");

  const heartRates = samples.map((sample) => sample.heartRate).filter((value) => value !== null && value > 0);
  if (heartRates.length) {
    add("avgHeartRate", "finish.avgHeartRate", Math.round(mean(heartRates)), "bpm");
    add("maxHeartRate", "finish.maxHeartRate", Math.round(Math.max(...heartRates)), "bpm");
  }
  // While pedalling: a trainer without a cadence sensor reports 0 or nothing, and neither is a cadence.
  const cadences = samples.map((sample) => sample.cadence).filter((value) => value !== null && value > 0);
  if (cadences.length) add("cadence", "finish.avgCadence", Math.round(mean(cadences)), "rpm");
  return metrics;
}

/**
 * The share of the riding time in each power zone (1 … ZONE_COUNT), or null
 * when the FTP is not known or nothing was ridden.
 * @returns {?number[]} fractions that add up to 1
 */
export function zoneShares(samples, pauses, ftp) {
  if (!(ftp > 0)) return null;
  const seconds = new Array(ZONE_COUNT).fill(0);
  let total = 0;
  for (const series of powerSeries(samples, pauses)) {
    for (const watts of series) {
      seconds[zoneFor(watts / ftp) - 1] += 1;
      total += 1;
    }
  }
  return total > 0 ? seconds.map((value) => value / total) : null;
}

/** The FTP the zones are counted against, or null while the profile still holds the default. */
export const knownFtp = (profile) => (profile && profile.ftpSource && profile.ftpSource !== "default" && profile.ftp > 0 ? profile.ftp : null);

/**
 * The ridden track in route coordinates (metres east and north), from the
 * positions in the samples; one piece per stretch, cut where a position is
 * missing or the rider reappears somewhere else.
 * @param {{lat: ?number, lon: ?number}[]} samples
 * @param {{lat: number, lon: number}} origin the origin the ride was recorded with (the route's `geo`)
 * @returns {{x: number, y: number}[][]}
 */
export function rideTrack(samples, origin) {
  const pieces = [];
  let piece = [];
  const close = () => {
    if (piece.length > 1) pieces.push(piece);
    piece = [];
  };
  for (const sample of samples) {
    if (!Number.isFinite(sample.lat) || !Number.isFinite(sample.lon)) {
      close();
      continue;
    }
    const point = fromLatLon(sample.lat, sample.lon, origin);
    const last = piece.at(-1);
    if (last && Math.hypot(point.x - last.x, point.y - last.y) > TRACK_JUMP_M) close();
    piece.push(point);
  }
  close();
  return pieces;
}

/** Drops points closer than `minDistance` to the last one kept; the first and last points stay. */
export function thinTrack(points, minDistance) {
  if (points.length < 3 || !(minDistance > 0)) return [...points];
  const kept = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const last = kept.at(-1);
    if (Math.hypot(points[i].x - last.x, points[i].y - last.y) >= minDistance) kept.push(points[i]);
  }
  kept.push(points.at(-1));
  return kept;
}

/**
 * The route's own line, start to end, as points in route coordinates.
 * @param {{length: number, loop: boolean, positionAt: (d: number) => {x: number, y: number}}} route a RouteGeometry
 */
export function routeOutline(route, maxPoints = 1200) {
  const steps = Math.max(2, Math.min(maxPoints, Math.ceil(route.length / 5)));
  const points = [];
  // The last step of a loop lands on the start again, which closes the line.
  for (let i = 0; i <= steps; i += 1) points.push(route.positionAt(i === steps && !route.loop ? route.length : (i / steps) * route.length));
  return points;
}

/** The smallest box around the points. */
export function boundsOf(points) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Fits a box of route coordinates into a rectangle of the image: north up,
 * one scale for both directions, centred, `padding` clear on every side.
 * @param {{minX: number, maxX: number, minY: number, maxY: number}} bounds
 * @param {{x: number, y: number, w: number, h: number}} rect
 * @returns {{scale: number, toCanvas: (x: number, y: number) => [number, number]}} `scale` in pixels per metre
 */
export function mapProjection(bounds, rect, padding = 0) {
  const spanX = Math.max(1, bounds.maxX - bounds.minX);
  const spanY = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min((rect.w - 2 * padding) / spanX, (rect.h - 2 * padding) / spanY);
  const midX = (bounds.minX + bounds.maxX) / 2;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const centreX = rect.x + rect.w / 2;
  const centreY = rect.y + rect.h / 2;
  // North is up: a larger y sits higher on the page.
  return { scale, toCanvas: (x, y) => [centreX + (x - midX) * scale, centreY - (y - midY) * scale] };
}

/**
 * How many times the route was ridden round: the metres ridden on it over its
 * length. Works for a distance that keeps counting and for one that starts
 * again at the line.
 * @param {{route: ?string, routeM: ?number}[]} samples
 */
export function lapsRidden(samples, routeId, routeLength) {
  if (!(routeLength > 0)) return 0;
  let metres = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    if (a.route !== routeId || b.route !== routeId || !Number.isFinite(a.routeM) || !Number.isFinite(b.routeM)) continue;
    let step = b.routeM - a.routeM;
    if (step < -routeLength / 2) step += routeLength; // over the line
    if (step > 0 && step < routeLength / 2) metres += step;
  }
  return metres / routeLength;
}

/** "40 laps" for a loop ridden at least twice, else an empty string. */
export function lapLabel(laps) {
  const whole = Math.floor(laps + 0.02);
  return whole >= LAPS_SHOWN_FROM ? tn("panels.lap", whole) : "";
}

/** Fills the gaps of a bucketed series from their neighbours. */
function bridge(values) {
  const out = [...values];
  let last = out.find((value) => value !== null) ?? 0;
  for (let i = 0; i < out.length; i += 1) {
    if (out[i] === null) {
      const next = out.slice(i + 1).find((value) => value !== null);
      out[i] = next === undefined ? last : (last + next) / 2;
    }
    last = out[i];
  }
  return out;
}

/**
 * The ride as two lines for the chart: height (null without heights) and
 * power, averaged into at most `buckets` steps along the distance ridden. A
 * ride that did not move (or a class in the studio) runs along its samples
 * instead, i.e. along time.
 * @returns {{axis: "distance" | "time", span: number, elevation: ?number[], power: number[], minElevation: number, maxElevation: number, maxPower: number}}
 */
export function profileSeries(samples, buckets = 240) {
  const count = Math.max(1, Math.min(buckets, samples.length));
  const first = samples[0];
  const last = samples.at(-1);
  const metres = first && last ? last.distance - first.distance : 0;
  const byDistance = metres >= 50;
  const sums = Array.from({ length: count }, () => ({ power: 0, n: 0, elevation: 0, heights: 0 }));
  samples.forEach((sample, index) => {
    const at = byDistance ? (sample.distance - first.distance) / metres : samples.length > 1 ? index / (samples.length - 1) : 0;
    const bucket = sums[Math.min(count - 1, Math.max(0, Math.floor(at * count)))];
    bucket.power += sample.power;
    bucket.n += 1;
    if (sample.elevation !== null && Number.isFinite(sample.elevation)) {
      bucket.elevation += sample.elevation;
      bucket.heights += 1;
    }
  });
  const hasHeights = sums.some((bucket) => bucket.heights > 0);
  // The power line is evened out over three steps: one second of power is noise at this size.
  const raw = bridge(sums.map((bucket) => (bucket.n ? bucket.power / bucket.n : null)));
  const power = raw.map((value, i) => (raw[Math.max(0, i - 1)] + value + raw[Math.min(raw.length - 1, i + 1)]) / 3);
  const elevation = hasHeights ? bridge(sums.map((bucket) => (bucket.heights ? bucket.elevation / bucket.heights : null))) : null;
  return {
    axis: byDistance ? "distance" : "time",
    span: byDistance ? metres : first && last ? (last.t - first.t) / 1000 : 0,
    elevation,
    power,
    minElevation: elevation ? Math.min(...elevation) : 0,
    maxElevation: elevation ? Math.max(...elevation) : 0,
    maxPower: power.length ? Math.max(...power) : 0,
  };
}

/**
 * The largest size from `max` down to `min` at which `text` fits `maxWidth`;
 * at `min` the text is cut with an ellipsis if it still does not fit.
 * @param {(text: string, size: number) => number} measure the width of `text` set at `size`
 * @returns {{size: number, text: string}}
 */
export function fitText(measure, text, maxWidth, { max, min, step = 2 }) {
  for (let size = max; size >= min; size -= step) {
    if (measure(text, size) <= maxWidth) return { size, text };
  }
  let cut = text;
  while (cut.length > 1 && measure(`${cut.trimEnd()}…`, min) > maxWidth) cut = cut.slice(0, -1);
  return { size: min, text: cut === text ? text : `${cut.trimEnd()}…` };
}

/**
 * A title on one line if it fits at `oneLineMin` or larger, else on two lines
 * broken at the space that leaves them most alike; a single long word, or a
 * title too long for two lines at `min`, is cut with an ellipsis.
 * @returns {{size: number, lines: string[]}}
 */
export function fitTitle(measure, text, maxWidth, { max, min, oneLineMin = Math.round(max * 0.62), step = 2 }) {
  for (let size = max; size >= oneLineMin; size -= step) {
    if (measure(text, size) <= maxWidth) return { size, lines: [text] };
  }
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    const one = fitText(measure, text, maxWidth, { max: oneLineMin, min, step });
    return { size: one.size, lines: [one.text] };
  }
  let best = null;
  for (let i = 1; i < words.length; i += 1) {
    const lines = [words.slice(0, i).join(" "), words.slice(i).join(" ")];
    const widest = Math.max(measure(lines[0], 100), measure(lines[1], 100));
    if (!best || widest < best.widest) best = { lines, widest };
  }
  const twoLineMax = Math.min(max, Math.round(max * 0.7));
  for (let size = twoLineMax; size >= min; size -= step) {
    if (best.lines.every((line) => measure(line, size) <= maxWidth)) return { size, lines: best.lines };
  }
  // Too long even so: fill the first line with whole words, cut the second.
  let split = 1;
  while (split < words.length - 1 && measure(words.slice(0, split + 1).join(" "), min) <= maxWidth) split += 1;
  return { size: min, lines: [fitText(measure, words.slice(0, split).join(" "), maxWidth, { max: min, min }).text, fitText(measure, words.slice(split).join(" "), maxWidth, { max: min, min }).text] };
}

/** "12 NOV 2026 · 18:42": day, short month and year, then the time, in the rider's language. */
export function cardDate(when, locale = intlLocale()) {
  const write = (tag) => {
    // The month is asked for on its own: as part of a whole date, some languages give its number.
    const month = new Intl.DateTimeFormat(tag, { month: "short" }).format(when).replace(/\.$/, "").toUpperCase();
    const time = new Intl.DateTimeFormat(tag, { hour: "numeric", minute: "2-digit" }).format(when);
    return `${when.getDate()} ${month} ${when.getFullYear()} · ${time}`;
  };
  try {
    return write(locale);
  } catch {
    // A malformed browser locale throws a RangeError.
    return write(undefined);
  }
}

/**
 * A round length for the map's scale bar: the longest of 1, 2 or 5 × 10ⁿ
 * (metres or feet, then kilometres or miles) that is at most `maxPixels` wide.
 * @param {number} scale pixels per metre
 * @returns {{pixels: number, label: string}}
 */
export function scaleBar(scale, maxPixels) {
  const imperial = getUnits() === "imperial";
  const small = imperial ? M_PER_FOOT : 1;
  const large = imperial ? 1609.344 : 1000;
  const candidates = [];
  for (const unit of [small, large]) {
    for (let power = 0; power <= 3; power += 1) {
      for (const lead of [1, 2, 5]) {
        const count = lead * 10 ** power;
        // Feet and metres up to 500, then miles and kilometres.
        if (unit === small && count > 500) continue;
        candidates.push({ metres: count * unit, label: `${formatNumber(count, 0)} ${unit === small ? (imperial ? "ft" : "m") : imperial ? "mi" : "km"}` });
      }
    }
  }
  candidates.sort((a, b) => a.metres - b.metres);
  let best = candidates[0];
  for (const candidate of candidates) if (candidate.metres * scale <= maxPixels) best = candidate;
  return { pixels: best.metres * scale, label: best.label };
}

/**
 * How `count` cells share a block of `columns` columns: rows are filled from
 * the left, so the columns line up and the last row may end early.
 * @returns {{columns: number, rows: number}}
 */
export function gridShape(count, columns) {
  if (count <= 0) return { columns: 0, rows: 0 };
  return { columns, rows: Math.ceil(count / columns) };
}

/**
 * The grids of the image's numbers: the first four are large, the rest small.
 * Upright, both grids have four columns, except that five small numbers share
 * one row; wide, the large ones stand two by two and the small ones in threes.
 */
export function metricGrids(format, metricCount) {
  const wide = format.id === "landscape";
  const primaryCount = Math.min(4, metricCount);
  const secondaryCount = Math.max(0, metricCount - primaryCount);
  return {
    primaryCount,
    primary: gridShape(primaryCount, wide ? 2 : 4),
    secondary: gridShape(secondaryCount, wide ? 3 : secondaryCount === 5 ? 5 : 4),
  };
}

/** The header's own measures: the lockup's symbol, then the title, then the rider's name. */
const HEADER = Object.freeze({
  portrait: Object.freeze({ symbol: 48, titleGap: 34, nameGap: 40, nameSize: 20, dateSize: 20, titleMax: 96, titleMin: 46 }),
  landscape: Object.freeze({ symbol: 44, titleGap: 30, nameGap: 36, nameSize: 17, dateSize: 17, titleMax: 84, titleMin: 40 }),
});

/**
 * Where the header's lines stand, as baselines below the header's top, and how
 * tall it is: the lockup, a title of one or two lines, the rider's name if any.
 * @param {{id: string}} format
 * @param {{size: number, lines: string[]}} title from `fitTitle`
 */
export function headerMetrics(format, title, hasName) {
  const measures = HEADER[format.id];
  const lockup = measures.symbol * 0.86;
  const lineHeight = title.size * 1.04;
  const titleBaselines = title.lines.map((_, i) => lockup + measures.titleGap + title.size * 0.86 + i * lineHeight);
  const lastTitle = titleBaselines.at(-1);
  const name = hasName ? lastTitle + measures.nameGap : null;
  return { ...measures, lockup, titleBaselines, name, height: Math.ceil((name ?? lastTitle + title.size * 0.12) + 8) };
}

/** The data credit's type size and line height, per format (see `cardLayout`). */
export const CREDIT_SIZE = Object.freeze({ portrait: 13, landscape: 12 });
export const CREDIT_LINE_H = Object.freeze({ portrait: 18, landscape: 17 });

/**
 * Where each block of the image sits, for one format. The header and the
 * metrics take what they need; the map (or the chart, on a ride without a
 * map) takes what is left, so a ride with fewer metrics has a larger map.
 * Every rectangle is `{x, y, w, h}` in pixels of the image.
 * @param {{id: string, width: number, height: number}} format one of CARD_FORMATS
 * @param {{metricCount: number, zones: boolean, map: boolean, headerHeight?: number}} content
 */
export function cardLayout(format, { metricCount, zones, map, headerHeight = null, creditLines = 0 }) {
  const { width: W, height: H } = format;
  const wide = format.id === "landscape";
  const margin = wide ? 56 : 64;
  const gap = wide ? 22 : 24;
  const { primary: primaryShape, secondary: secondaryShape } = metricGrids(format, metricCount);
  const columnW = wide ? 620 : W - 2 * margin;
  const primaryRowH = wide ? 106 : 108;
  const secondaryRowH = wide ? 70 : 76;
  const headerH = headerHeight ?? (wide ? 180 : 204);
  const zonesH = zones ? 62 : 0;
  // A route made from others' data carries their notice above the address, in small lines.
  const footerH = 22 + (creditLines > 0 ? creditLines * CREDIT_LINE_H[format.id] + 10 : 0);
  const chartH = wide ? 190 : 168;

  const header = { x: margin, y: margin, w: columnW, h: headerH };
  const footer = { x: margin, y: H - margin - footerH, w: wide ? columnW : W - 2 * margin, h: footerH };
  const primaryH = primaryShape.rows * primaryRowH;
  const secondaryH = secondaryShape.rows * secondaryRowH;
  const block = (y, h) => ({ x: margin, y, w: columnW, h });

  if (wide) {
    // Left: header, numbers, zones, footer. Right: the map over the chart.
    const top = header.y + header.h + gap;
    const zonesRect = zones ? block(footer.y - gap - zonesH, zonesH) : null;
    // A title of two lines over twelve numbers is more than the column holds: the rows give way, by `scale`.
    const room = (zonesRect ? zonesRect.y : footer.y) - gap - top;
    const scale = Math.min(1, room / (primaryH + (secondaryH ? gap : 0) + secondaryH));
    const primary = { ...block(top, primaryH * scale), ...primaryShape, scale };
    const secondary = { ...block(primary.y + primary.h + (secondaryH ? gap * scale : 0), secondaryH * scale), ...secondaryShape, scale };
    const rightX = margin + columnW + 56;
    const rightW = W - margin - rightX;
    const profile = map ? { x: rightX, y: H - margin - chartH, w: rightW, h: chartH } : { x: rightX, y: margin, w: rightW, h: H - 2 * margin };
    const mapRect = map ? { x: rightX, y: margin, w: rightW, h: profile.y - gap - margin } : null;
    return { format, wide, margin, header, primary, secondary, zones: zonesRect, footer, profile, map: mapRect };
  }

  // Upright: one column from the bottom up; what is left above goes to the map.
  let y = footer.y - gap;
  const zonesRect = zones ? block((y -= zonesH), zonesH) : null;
  if (zones) y -= gap;
  const secondary = { ...block((y -= secondaryH), secondaryH), ...secondaryShape, scale: 1 };
  if (secondaryH) y -= gap * 0.6;
  const primary = { ...block((y -= primaryH), primaryH), ...primaryShape, scale: 1 };
  y -= gap;
  const top = header.y + header.h + gap;
  if (!map) return { format, wide, margin, header, primary, secondary, zones: zonesRect, footer, profile: block(top, y - top), map: null };
  const profile = block((y -= chartH), chartH);
  y -= gap;
  return { format, wide, margin, header, primary, secondary, zones: zonesRect, footer, profile, map: block(top, y - top) };
}

/**
 * Everything the image needs, from the ride as recorded.
 * @param {{
 *   recorder: {samples: object[], pauses: object[], summary: () => object},
 *   route: ?object, the RouteGeometry the ride was on (null for a studio class)
 *   routeName: string, riderName?: string, when: Date,
 *   profile?: {weightKg?: number, ftp?: number, ftpSource?: string},
 *   context?: {coast?: {x: number, y: number}[], roads?: {x: number, y: number}[][]}
 * }} ride
 */
export function rideCardModel({ recorder, route = null, routeName, riderName = "", when, profile = null, context = null }) {
  const { samples, pauses } = recorder;
  const summary = recorder.summary();
  const ftp = knownFtp(profile);
  const track = route ? rideTrack(samples, route.geo) : [];
  const hasMap = Boolean(route) && track.length > 0;
  return {
    title: routeName,
    riderName: riderName.trim(),
    date: cardDate(when),
    metrics: cardMetrics({ summary, samples, pauses, weightKg: profile?.weightKg ?? null }),
    zones: zoneShares(samples, pauses, ftp),
    ftp,
    series: profileSeries(samples),
    credit: route ? routeDataCredit(route.id) : null,
    map: hasMap
      ? {
          outline: routeOutline(route),
          loop: route.loop !== false,
          track,
          laps: lapLabel(lapsRidden(samples, route.id, route.length)),
          coast: context?.coast ?? null,
          roads: context?.roads ?? [],
        }
      : null,
  };
}
