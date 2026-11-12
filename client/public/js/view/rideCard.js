/**
 * The ride image ("imagem do treino"): the route on a map with the ridden part
 * in gold, the profile of what was ridden with the power over it, and the
 * ride's numbers, under the GOCARMO Ride lockup. Drawn on a 2D canvas in the
 * browser, in two sizes from one layout (view/rideCardModel.js): upright
 * 1080 × 1350 and wide 1600 × 900. Nothing is fetched and nothing leaves the
 * browser; the rider saves or shares the image and adds it to the Strava
 * activity by hand (Strava's API takes no pictures).
 */

import { ACCENT, BG, DISPLAY, INK, MONO, MUTED, NUM, SLANT, lockup, photoFontsReady, slanted, track } from "./photos.js";
import { CARD_FORMATS, boundsOf, cardLayout, fitText, fitTitle, headerMetrics, mapProjection, metricGrids, scaleBar, thinTrack } from "./rideCardModel.js";
import { coastOutline, islandOf } from "./mapPreview.js";
import { elevationUnit, formatDistanceWithUnit, formatDuration, formatNumber } from "../util/format.js";
import { t } from "../i18n/i18n.js";

/** The address under the image: where the game is. */
export const CARD_FOOTER = "gocarmo.com/ride";

const SURFACE = "#101012";
const LAND = "#151517";
const HAIRLINE = "rgba(242, 241, 236, 0.1)";
const ROAD = "rgba(242, 241, 236, 0.1)";
const OUTLINE = "rgba(163, 162, 156, 0.6)";
const AREA = "rgba(242, 241, 236, 0.1)";
const AREA_EDGE = "rgba(163, 162, 156, 0.75)";
/** Zone 1 to zone 6 as one gold, from faint to full: an order, not six colours. */
const ZONE_ALPHA = [0.24, 0.38, 0.52, 0.66, 0.82, 1];

/**
 * The island and the other roads around a route, for the map's background:
 * the map's road network where it has one, else the island the routes make.
 * @param {object} route the RouteGeometry of the ride
 * @param {{network?: ?object, routes?: object[]}} [world] the ride's RoadNetwork and the routes on the same map
 * @returns {{coast: {x: number, y: number}[], roads: {x: number, y: number}[][]}}
 */
export function mapContext(route, { network = null, routes = [] } = {}) {
  const others = network ? network.roads() : routes.filter((other) => other.id !== route.id);
  const island = network ? network.island() : islandOf([route, ...others]);
  const line = (road) => {
    const steps = Math.max(2, Math.min(400, Math.ceil(road.length / 25)));
    return Array.from({ length: steps + 1 }, (_, i) => road.positionAt(Math.min(road.length, (i / steps) * road.length)));
  };
  return {
    // The island is in world coordinates (z points south); the image works in route coordinates (y north).
    coast: island ? coastOutline(island, 180).map(([x, z]) => ({ x, y: -z })) : [],
    roads: others.map(line),
  };
}

/** Loads the fonts for everything the image will write. */
export function rideCardFontsReady(model, doc = document) {
  const text = [model.title, model.title.toUpperCase(), model.riderName.toUpperCase(), model.date, ...model.metrics.flatMap((metric) => [metric.label.toUpperCase(), metric.value, metric.unit])].join(" ");
  return photoFontsReady(doc, text);
}

function roundedRect(ctx, { x, y, w, h }, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** A caps label in the mono face, tracked; returns its width. */
function label(ctx, text, x, y, { size, colour = MUTED, align = "left", tracking = 0.1 }) {
  ctx.font = `500 ${size}px ${MONO}`;
  ctx.fillStyle = colour;
  ctx.textAlign = align;
  track(ctx, tracking, size);
  ctx.fillText(text, x, y);
  const width = ctx.measureText(text).width;
  track(ctx, 0, 1);
  ctx.textAlign = "left";
  return width;
}

const measureWith = (ctx, family, weight, tracking = 0) => (text, size) => {
  ctx.font = `${weight} ${size}px ${family}`;
  track(ctx, tracking, size);
  const width = ctx.measureText(text).width;
  track(ctx, 0, 1);
  return width;
};

function drawHeader(ctx, model, layout, title, measures) {
  const { header } = layout;
  const base = header.y + measures.lockup;
  lockup(ctx, header.x, base, measures.symbol);
  label(ctx, model.date, header.x + header.w, base - 4, { size: measures.dateSize, align: "right", tracking: 0.06 });
  ctx.fillStyle = INK;
  ctx.font = `400 ${title.size}px ${DISPLAY}`;
  title.lines.forEach((line, i) => slanted(ctx, line, header.x, header.y + measures.titleBaselines[i]));
  if (measures.name !== null) label(ctx, model.riderName.toUpperCase(), header.x, header.y + measures.name, { size: measures.nameSize, colour: INK, tracking: 0.12 });
}

function drawMap(ctx, map, rect) {
  ctx.save();
  roundedRect(ctx, rect, 18);
  ctx.fillStyle = SURFACE;
  ctx.fill();
  ctx.clip();

  // Fitted to the route and the ride, not to the island: the route fills the frame.
  const all = [...map.outline, ...map.track.flat()];
  const padding = Math.min(rect.w, rect.h) * 0.14;
  const { scale, toCanvas } = mapProjection(boundsOf(all), rect, padding);
  const path = (points, close = false) => {
    ctx.beginPath();
    points.forEach((point, i) => {
      const [x, y] = toCanvas(point.x, point.y);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    if (close) ctx.closePath();
  };
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  if (map.coast?.length > 2) {
    path(map.coast, true);
    ctx.fillStyle = LAND;
    ctx.fill();
    ctx.strokeStyle = HAIRLINE;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  for (const road of map.roads) {
    path(road);
    ctx.strokeStyle = ROAD;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  path(map.outline, map.loop);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 4;
  ctx.stroke();

  // The ridden part: gold over a dark casing, so it stands clear where it lies on the muted line.
  const minStep = 1.5 / scale;
  const pieces = map.track.map((piece) => thinTrack(piece, minStep));
  for (const [width, colour] of [[12, SURFACE], [6.5, ACCENT]]) {
    for (const piece of pieces) {
      path(piece);
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }

  // Start: a ring. Finish: a full disc. On top of each other after whole laps: the disc inside the ring.
  const start = toCanvas(map.track[0][0].x, map.track[0][0].y);
  const end = toCanvas(map.track.at(-1).at(-1).x, map.track.at(-1).at(-1).y);
  const together = Math.hypot(start[0] - end[0], start[1] - end[1]) < 22;
  const ring = ([x, y], radius) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = SURFACE;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 4;
    ctx.stroke();
  };
  const disc = ([x, y], radius) => {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = INK;
    ctx.fill();
  };
  if (together) {
    ring(start, 14);
    disc(start, 6);
  } else {
    ring(start, 10);
    ctx.beginPath();
    ctx.arc(end[0], end[1], 14, 0, Math.PI * 2);
    ctx.fillStyle = SURFACE;
    ctx.fill();
    disc(end, 10);
  }
  ctx.restore();

  const inset = 24;
  ctx.textBaseline = "alphabetic";
  // North, top right.
  const nx = rect.x + rect.w - inset - 8;
  const ny = rect.y + inset;
  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(nx + 7, ny + 14);
  ctx.lineTo(nx - 7, ny + 14);
  ctx.closePath();
  ctx.fillStyle = MUTED;
  ctx.fill();
  label(ctx, t("card.north"), nx, ny + 34, { size: 15, align: "center", tracking: 0 });

  // Scale, bottom left.
  const bar = scaleBar(scale, rect.w * 0.2);
  const bx = rect.x + inset;
  const by = rect.y + rect.h - inset;
  ctx.strokeStyle = MUTED;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx, by - 7);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx + bar.pixels, by);
  ctx.lineTo(bx + bar.pixels, by - 7);
  ctx.stroke();
  label(ctx, bar.label, bx + bar.pixels + 10, by, { size: 15, tracking: 0.04 });

  // What the two marks mean, bottom right.
  const legendY = by;
  let lx = rect.x + rect.w - inset;
  ctx.font = `500 15px ${MONO}`;
  const finishText = t("card.finish").toUpperCase();
  const startText = t("card.start").toUpperCase();
  lx -= label(ctx, finishText, lx, legendY, { size: 15, align: "right", tracking: 0.08 });
  ctx.beginPath();
  ctx.arc(lx - 14, legendY - 5, 6, 0, Math.PI * 2);
  ctx.fillStyle = INK;
  ctx.fill();
  lx -= 40;
  lx -= label(ctx, startText, lx, legendY, { size: 15, align: "right", tracking: 0.08 });
  ctx.beginPath();
  ctx.arc(lx - 14, legendY - 5, 5, 0, Math.PI * 2);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // The laps of a loop ridden several times, top left.
  if (map.laps) {
    const [count, ...words] = map.laps.split(" ");
    ctx.fillStyle = INK;
    ctx.font = `400 46px ${NUM}`;
    ctx.fillText(count, rect.x + inset, rect.y + inset + 40);
    const numberW = ctx.measureText(count).width;
    label(ctx, words.join(" ").toUpperCase(), rect.x + inset + numberW + 10, rect.y + inset + 40, { size: 16, tracking: 0.1 });
  }
}

function drawProfile(ctx, model, rect) {
  const { series } = model;
  const legendH = 30;
  const chart = { x: rect.x, y: rect.y + legendH, w: rect.w, h: rect.h - legendH };
  ctx.textBaseline = "alphabetic";

  // Legend: what the area and the line are, and how far (or how long) the chart runs.
  let x = rect.x;
  const y = rect.y + 16;
  if (series.elevation) {
    ctx.fillStyle = AREA_EDGE;
    ctx.fillRect(x, y - 11, 14, 11);
    x += 22;
    x += label(ctx, t("photos.stat.elevation").toUpperCase(), x, y, { size: 15 });
    const lo = formatNumber(Math.round(series.minElevation / (elevationUnit() === "ft" ? 0.3048 : 1)), 0);
    const hi = formatNumber(Math.round(series.maxElevation / (elevationUnit() === "ft" ? 0.3048 : 1)), 0);
    x += 10;
    x += label(ctx, lo === hi ? `${hi} ${elevationUnit()}` : `${lo}–${hi} ${elevationUnit()}`, x, y, { size: 15, colour: INK, tracking: 0.02 });
    x += 30;
  }
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x, y - 5);
  ctx.lineTo(x + 18, y - 5);
  ctx.stroke();
  x += 26;
  label(ctx, t("photos.stat.power").toUpperCase(), x, y, { size: 15 });
  const span = series.axis === "distance" ? formatDistanceWithUnit(series.span, series.span >= 100_000 ? 1 : 2) : formatDuration(series.span);
  label(ctx, span, rect.x + rect.w, y, { size: 15, colour: INK, align: "right", tracking: 0.02 });

  const steps = series.power.length;
  const at = (i) => chart.x + (steps > 1 ? (i / (steps - 1)) * chart.w : 0);
  if (series.elevation) {
    // The lowest point sits a little above the base line, so a flat ride still shows a band.
    const lo = series.minElevation;
    const hi = Math.max(series.maxElevation, lo + 20);
    const heightOf = (v) => chart.y + chart.h - (0.12 + ((v - lo) / (hi - lo)) * 0.66) * chart.h;
    ctx.beginPath();
    ctx.moveTo(chart.x, chart.y + chart.h);
    series.elevation.forEach((v, i) => ctx.lineTo(at(i), heightOf(v)));
    ctx.lineTo(chart.x + chart.w, chart.y + chart.h);
    ctx.closePath();
    ctx.fillStyle = AREA;
    ctx.fill();
    ctx.beginPath();
    series.elevation.forEach((v, i) => (i === 0 ? ctx.moveTo(at(i), heightOf(v)) : ctx.lineTo(at(i), heightOf(v))));
    ctx.strokeStyle = AREA_EDGE;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
  }
  if (steps > 1) {
    const top = Math.max(series.maxPower, 100) * 1.08;
    ctx.beginPath();
    series.power.forEach((v, i) => {
      const py = chart.y + chart.h - (v / top) * chart.h;
      if (i === 0) ctx.moveTo(at(i), py);
      else ctx.lineTo(at(i), py);
    });
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 3;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(chart.x, chart.y + chart.h);
  ctx.lineTo(chart.x + chart.w, chart.y + chart.h);
  ctx.stroke();
}

/** One block of numbers: a label over a value and its unit, in a grid. */
function drawMetrics(ctx, metrics, grid, sizes) {
  if (!metrics.length || !grid.columns) return;
  // Rows that had to give way (a wide image with a long title and every number) take their type down with them.
  const valueSize = sizes.valueSize * (grid.scale ?? 1);
  const labelSize = sizes.labelSize * Math.max(0.85, grid.scale ?? 1);
  const cellW = grid.w / grid.columns;
  const rowH = grid.h / grid.rows;
  const number = measureWith(ctx, NUM, 400);
  const mono = measureWith(ctx, MONO, 500, 0.1);
  metrics.forEach((metric, i) => {
    const x = grid.x + (i % grid.columns) * cellW;
    const y = grid.y + Math.floor(i / grid.columns) * rowH;
    const room = cellW - 18;
    const caption = fitText(mono, metric.label.toUpperCase(), room, { max: labelSize, min: labelSize * 0.7, step: 0.5 });
    label(ctx, caption.text, x, y + labelSize, { size: caption.size });

    // The unit is set smaller, in the mono face, on the value's baseline.
    const unitSize = (size) => Math.max(16, size * 0.32);
    const unitW = (size) => (metric.unit ? 8 + measureWith(ctx, MONO, 500, 0.02)(metric.unit, unitSize(size)) : 0);
    const value = fitText((text, size) => number(text, size) + unitW(size), metric.value, room, { max: valueSize, min: valueSize * 0.5, step: 1 });
    const baseline = y + labelSize + 10 + valueSize * 0.86;
    ctx.fillStyle = INK;
    ctx.font = `400 ${value.size}px ${NUM}`;
    ctx.fillText(value.text, x, baseline);
    if (metric.unit) label(ctx, metric.unit, x + ctx.measureText(value.text).width + 8, baseline, { size: unitSize(value.size), tracking: 0.02 });
  });
}

function drawZones(ctx, model, rect) {
  ctx.textBaseline = "alphabetic";
  const head = label(ctx, t("card.zones").toUpperCase(), rect.x, rect.y + 14, { size: 15 });
  label(ctx, `FTP ${formatNumber(model.ftp, 0)} W`, rect.x + head + 14, rect.y + 14, { size: 15, colour: INK, tracking: 0.02 });
  const bar = { x: rect.x, y: rect.y + 24, w: rect.w, h: 16 };
  const gap = 3;
  // A zone ridden for less than half a percent of the time would be a hair on the bar: left out.
  const shown = model.zones.map((share, zone) => ({ share, zone })).filter(({ share }) => share >= 0.005);
  const room = bar.w - gap * (shown.length - 1);
  let x = bar.x;
  for (const { share, zone } of shown) {
    const w = Math.max(2, share * room);
    ctx.globalAlpha = ZONE_ALPHA[zone];
    ctx.fillStyle = ACCENT;
    ctx.fillRect(x, bar.y, w, bar.h);
    ctx.globalAlpha = 1;
    // A zone is named under its part of the bar where there is room for the name.
    const text = `Z${zone + 1} ${formatNumber(Math.round(share * 100), 0)} %`;
    ctx.font = `500 14px ${MONO}`;
    if (ctx.measureText(text).width + 6 <= w) label(ctx, text, x, bar.y + bar.h + 19, { size: 14, tracking: 0 });
    else if (ctx.measureText(`Z${zone + 1}`).width + 4 <= w) label(ctx, `Z${zone + 1}`, x, bar.y + bar.h + 19, { size: 14, tracking: 0 });
    x += w + gap;
  }
}

/**
 * Draws the ride image.
 * @param {ReturnType<import("./rideCardModel.js").rideCardModel>} model
 * @param {{id: string, width: number, height: number}} [format] one of CARD_FORMATS
 * @returns {HTMLCanvasElement}
 */
export function composeRideCard(model, format = CARD_FORMATS.portrait, doc = document) {
  const canvas = doc.createElement("canvas");
  canvas.width = format.width;
  canvas.height = format.height;
  const ctx = canvas.getContext("2d");
  const W = format.width;
  const H = format.height;
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const wide = format.id === "landscape";
  const content = { metricCount: model.metrics.length, zones: Boolean(model.zones), map: Boolean(model.map) };
  const headerW = cardLayout(format, content).header.w;
  // A slanted line leans to the right by a part of its height: leave it that room.
  const display = measureWith(ctx, DISPLAY, 400);
  const sizes = headerMetrics(format, { size: 0, lines: [""] }, false);
  const title = fitTitle((text, size) => display(text, size) + size * SLANT * 0.8, model.title.toUpperCase(), headerW, { max: sizes.titleMax, min: sizes.titleMin });
  const measures = headerMetrics(format, title, Boolean(model.riderName));
  const layout = cardLayout(format, { ...content, headerHeight: measures.height });

  drawHeader(ctx, model, layout, title, measures);
  if (layout.map) drawMap(ctx, model.map, layout.map);
  drawProfile(ctx, model, layout.profile);
  const { primaryCount } = metricGrids(format, model.metrics.length);
  drawMetrics(ctx, model.metrics.slice(0, primaryCount), layout.primary, { valueSize: wide ? 72 : 70, labelSize: wide ? 15 : 16 });
  drawMetrics(ctx, model.metrics.slice(primaryCount), layout.secondary, { valueSize: wide ? 42 : 44, labelSize: wide ? 13.5 : 14.5 });
  if (layout.zones) drawZones(ctx, model, layout.zones);
  label(ctx, CARD_FOOTER, layout.footer.x, layout.footer.y + layout.footer.h - 3, { size: wide ? 17 : 19, colour: INK, tracking: 0.06 });
  return canvas;
}
