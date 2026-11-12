// The ride image's pure parts: which metrics, how the grid re-flows, numbers per
// language and units, the map's projection and fitting, text fitting, the layout.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CARD_FORMATS,
  WEIGHTED_MIN_S,
  boundsOf,
  cardDate,
  cardLayout,
  cardMetrics,
  fitText,
  fitTitle,
  gridShape,
  headerMetrics,
  knownFtp,
  lapLabel,
  lapsRidden,
  mapProjection,
  metricGrids,
  profileSeries,
  rideCardModel,
  rideTrack,
  routeOutline,
  scaleBar,
  thinTrack,
  zoneShares,
} from "../public/js/view/rideCardModel.js";
import { RideRecorder } from "../public/js/ride/rideRecorder.js";
import { fromLatLon, toLatLon } from "../public/js/route/geo.js";
import { setLocale } from "../public/js/i18n/i18n.js";
import { setUnits } from "../public/js/util/format.js";
import { squareRoute } from "./helpers.js";

const START = new Date(2026, 10, 12, 18, 42).getTime();

/** A ride round the square route (1000 m a lap) at 10 m/s, one sample a second. */
function rideOf({ seconds, power = () => 200, heartRate = () => undefined, cadence = () => undefined, studio = false }) {
  const route = squareRoute();
  const recorder = new RideRecorder();
  for (let s = 0; s <= seconds; s += 1) {
    const d = s * 10;
    const position = route.positionAt(d);
    recorder.add({
      t: START + s * 1000,
      distance: d,
      power: power(s),
      heartRate: heartRate(s),
      cadence: cadence(s),
      speed: 10,
      elevation: studio ? undefined : route.elevationAt(d),
      ...(studio ? {} : toLatLon(position.x, position.y, route.geo)),
      route: studio ? null : route.id,
      routeM: studio ? null : d,
    });
  }
  return { route, recorder };
}

const metricsOf = (ride, weightKg = 75) => cardMetrics({ summary: ride.recorder.summary(), samples: ride.recorder.samples, pauses: ride.recorder.pauses, weightKg });
const ids = (metrics) => metrics.map((metric) => metric.id);
const byId = (metrics, id) => metrics.find((metric) => metric.id === id);

function inLanguage(locale, units, run) {
  setLocale(locale);
  setUnits(units);
  try {
    return run();
  } finally {
    setLocale("en");
    setUnits("metric");
  }
}

// ------------------------------------------------------------- metrics ---

test("a long ride with every sensor shows all twelve numbers, in order of weight", () => {
  const ride = rideOf({ seconds: WEIGHTED_MIN_S + 60, heartRate: (s) => 140 + (s % 20), cadence: () => 88 });
  assert.deepEqual(ids(metricsOf(ride)), ["time", "distance", "speed", "climb", "avgPower", "weightedPower", "maxPower", "wkg", "work", "avgHeartRate", "maxHeartRate", "cadence"]);
});

test("a sensor that recorded nothing has no number at all: never a dash, never a zero", () => {
  const ride = rideOf({ seconds: 300 });
  const metrics = metricsOf(ride);
  assert.deepEqual(ids(metrics), ["time", "distance", "speed", "climb", "avgPower", "maxPower", "wkg", "work"]);
  for (const metric of metrics) assert.doesNotMatch(metric.value, /^[–—-]$|^0?$/, `${metric.id} is "${metric.value}"`);
});

test("a trainer that reports a cadence of zero has no cadence; pedalling is averaged without the coasting", () => {
  assert.equal(byId(metricsOf(rideOf({ seconds: 60, cadence: () => 0 })), "cadence"), undefined);
  const mixed = metricsOf(rideOf({ seconds: 60, cadence: (s) => (s % 2 ? 90 : 0) }));
  assert.equal(byId(mixed, "cadence").value, "90");
});

test("heart rate gives the average and the maximum of what the strap recorded", () => {
  const metrics = metricsOf(rideOf({ seconds: 100, heartRate: (s) => (s < 50 ? 120 : 160) }));
  assert.equal(byId(metrics, "maxHeartRate").value, "160");
  assert.ok(Number(byId(metrics, "avgHeartRate").value) > 120 && Number(byId(metrics, "avgHeartRate").value) < 160);
  assert.equal(byId(metrics, "avgHeartRate").unit, "bpm");
});

test("weighted power needs twenty minutes of riding to mean something", () => {
  assert.equal(byId(metricsOf(rideOf({ seconds: WEIGHTED_MIN_S - 10 })), "weightedPower"), undefined);
  assert.equal(byId(metricsOf(rideOf({ seconds: WEIGHTED_MIN_S + 10 })), "weightedPower").value, "200");
});

test("a class in the studio has no climb, and a rider without a weight no W/kg", () => {
  const studio = rideOf({ seconds: 120, studio: true });
  assert.equal(byId(metricsOf(studio), "climb"), undefined);
  assert.equal(byId(metricsOf(rideOf({ seconds: 120 }), null), "wkg"), undefined);
  assert.equal(byId(metricsOf(rideOf({ seconds: 120 }), 80), "wkg").value, "2.50");
});

test("numbers are written for the rider's language and units", () => {
  const ride = rideOf({ seconds: 181 });
  const pt = inLanguage("pt", "metric", () => metricsOf(ride));
  assert.deepEqual([byId(pt, "distance").value, byId(pt, "distance").unit], ["1,81", "km"]);
  assert.equal(byId(pt, "distance").label, "Distância");
  assert.deepEqual([byId(pt, "speed").value, byId(pt, "speed").unit], ["36,0", "km/h"]);
  assert.equal(byId(pt, "wkg").value, "2,67");
  assert.equal(byId(pt, "climb").label, "D+");
  const de = inLanguage("de", "metric", () => metricsOf(ride));
  assert.equal(byId(de, "distance").value, "1,81");
  const us = inLanguage("en", "imperial", () => metricsOf(ride));
  assert.deepEqual([byId(us, "distance").value, byId(us, "distance").unit], ["1.12", "mi"]);
  assert.deepEqual([byId(us, "speed").value, byId(us, "speed").unit], ["22.4", "mph"]);
  assert.equal(byId(us, "climb").unit, "ft");
  assert.equal(byId(us, "climb").value, String(Math.round(ride.recorder.summary().elevationGainM / 0.3048)));
});

test("a distance of a hundred kilometres or more drops to one decimal, so it still fits its cell", () => {
  const long = { summary: { durationS: 20000, distanceM: 179_564, avgSpeed: 8.9, elevationGainM: 2542, avgPower: 172, maxPower: 299, kilojoules: 4051 }, samples: [{ elevation: 10, heartRate: null, cadence: null, power: 100, t: 0 }] };
  assert.equal(inLanguage("pt", "metric", () => byId(cardMetrics(long), "distance").value), "179,6");
  assert.equal(inLanguage("pt", "metric", () => byId(cardMetrics(long), "climb").value), "2542");
});

test("the time in power zones needs a known FTP and adds up to the whole ride", () => {
  const ride = rideOf({ seconds: 99, power: (s) => (s < 50 ? 100 : 260) });
  assert.equal(zoneShares(ride.recorder.samples, ride.recorder.pauses, null), null);
  const shares = zoneShares(ride.recorder.samples, ride.recorder.pauses, 250);
  assert.equal(shares.length, 6);
  assert.ok(Math.abs(shares.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.deepEqual(shares.map((share) => Number(share.toFixed(1))), [0.5, 0, 0, 0.5, 0, 0]);
  assert.equal(knownFtp({ ftp: 200, ftpSource: "default" }), null, "the profile's default FTP is not the rider's");
  assert.equal(knownFtp({ ftp: 250, ftpSource: "typed" }), 250);
  assert.equal(knownFtp(null), null);
});

// ----------------------------------------------------------------- map ---

test("a position written into a ride file comes back to the same place on the route", () => {
  for (const origin of [{ lat: 39, lon: 2.6 }, { lat: 38, lon: 2.6 }]) {
    for (const [x, y] of [[0, 0], [1234.5, -987.6], [-38_000, 39_700]]) {
      const { lat, lon } = toLatLon(x, y, origin);
      const back = fromLatLon(lat, lon, origin);
      assert.ok(Math.abs(back.x - x) < 1e-6 && Math.abs(back.y - y) < 1e-6, `${x}, ${y} came back as ${back.x}, ${back.y}`);
    }
  }
});

test("the ridden track follows the route and is cut where the rider reappears somewhere else", () => {
  const { route, recorder } = rideOf({ seconds: 30 });
  const [piece] = rideTrack(recorder.samples, route.geo);
  assert.equal(piece.length, 31);
  const at = route.positionAt(200);
  assert.ok(Math.hypot(piece[20].x - at.x, piece[20].y - at.y) < 1e-6);

  const jumped = [...recorder.samples.slice(0, 10), { lat: null, lon: null }, ...recorder.samples.slice(10, 20).map((s) => ({ ...s, ...toLatLon(5000, 5000) })), ...recorder.samples.slice(20)];
  const pieces = rideTrack(jumped, route.geo);
  assert.deepEqual(pieces.map((p) => p.length), [10, 10, 11]);
  assert.deepEqual(rideTrack([{ lat: null, lon: null }], route.geo), []);
});

test("thinning a track keeps its ends and drops what the image could not show", () => {
  const points = Array.from({ length: 101 }, (_, i) => ({ x: i, y: 0 }));
  const thin = thinTrack(points, 10);
  assert.deepEqual([thin[0], thin.at(-1)], [points[0], points[100]]);
  assert.ok(thin.length <= 12);
  assert.equal(thinTrack(points, 0).length, 101);
});

test("the route's outline starts at the start and closes a loop", () => {
  const outline = routeOutline(squareRoute());
  assert.deepEqual(outline[0], { x: 0, y: 0 });
  assert.ok(Math.hypot(outline.at(-1).x, outline.at(-1).y) < 1e-6, "the last point is the start again");
  assert.deepEqual(boundsOf(outline), { minX: 0, maxX: 250, minY: 0, maxY: 250 });
});

test("the map is fitted north up, with one scale, centred, inside its padding", () => {
  const rect = { x: 100, y: 50, w: 800, h: 400 };
  const tall = { minX: 0, maxX: 1000, minY: 0, maxY: 4000 };
  const { scale, toCanvas } = mapProjection(tall, rect, 20);
  assert.equal(scale, 360 / 4000, "the taller side decides the scale");
  const [, south] = toCanvas(500, 0);
  const [, north] = toCanvas(500, 4000);
  assert.ok(north < south, "north is up");
  assert.deepEqual([north, south], [70, 430], "top and bottom sit on the padding");
  const [west] = toCanvas(0, 2000);
  const [east] = toCanvas(1000, 2000);
  assert.equal((west + east) / 2, 500, "centred across");
  assert.ok(Math.abs(east - west - 1000 * scale) < 1e-9, "the same scale east to west");
  for (const [x, y] of [[0, 0], [1000, 0], [0, 4000], [1000, 4000]]) {
    const [cx, cy] = toCanvas(x, y);
    assert.ok(cx >= rect.x + 20 && cx <= rect.x + rect.w - 20 && cy >= rect.y + 20 && cy <= rect.y + rect.h - 20);
  }
  const wide = mapProjection({ minX: 0, maxX: 38_423, minY: 0, maxY: 100 }, rect, 20);
  assert.equal(wide.scale, 760 / 38_423);
  const point = mapProjection({ minX: 5, maxX: 5, minY: 7, maxY: 7 }, rect, 20);
  assert.deepEqual(point.toCanvas(5, 7), [500, 250], "a single point sits in the middle");
});

test("laps are the metres ridden on the route over its length, however the distance is counted", () => {
  const { route, recorder } = rideOf({ seconds: 400 });
  assert.equal(lapsRidden(recorder.samples, route.id, route.length), 4);
  const wrapped = recorder.samples.map((sample) => ({ ...sample, routeM: sample.routeM % route.length }));
  assert.equal(lapsRidden(wrapped, route.id, route.length), 4);
  assert.equal(lapsRidden(recorder.samples, "another", route.length), 0);
  assert.equal(lapsRidden(recorder.samples, route.id, 0), 0);
  assert.equal(lapLabel(4), "4 laps");
  assert.equal(lapLabel(39.99), "40 laps");
  assert.equal(lapLabel(1.6), "", "once round and a bit is no lap count");
  assert.equal(inLanguage("pt", "metric", () => lapLabel(40)), "40 voltas");
});

// --------------------------------------------------------------- chart ---

test("the chart runs along the distance ridden; a ride that stands still runs along time", () => {
  const { recorder } = rideOf({ seconds: 600 });
  const series = profileSeries(recorder.samples, 120);
  assert.equal(series.axis, "distance");
  assert.equal(series.span, 6000);
  assert.equal(series.power.length, 120);
  assert.equal(series.elevation.length, 120);
  assert.ok(series.maxElevation > series.minElevation);
  assert.ok(series.power.every((watts) => Math.abs(watts - 200) < 1e-9));

  const still = profileSeries([0, 1, 2, 3].map((s) => ({ t: START + s * 1000, distance: 0, power: 100 + s, elevation: null })), 120);
  assert.equal(still.axis, "time");
  assert.equal(still.span, 3);
  assert.equal(still.elevation, null, "no heights, no area");
  assert.equal(still.power.length, 4);
});

test("steps of the chart no sample fell into are filled from their neighbours", () => {
  // Three samples over 3 km into 30 steps: most steps are empty.
  const samples = [0, 1500, 3000].map((d, i) => ({ t: START + i * 1000, distance: d, power: 100 + i * 100, elevation: 10 + i * 10 }));
  const series = profileSeries(samples, 30);
  assert.ok(series.power.every((watts) => Number.isFinite(watts) && watts >= 100 && watts <= 300));
  assert.ok(series.elevation.every((metres) => Number.isFinite(metres) && metres >= 10 && metres <= 30));
});

// ---------------------------------------------------------------- text ---

/** A text is as wide as its letters at 0.5 of the size. */
const measure = (text, size) => text.length * size * 0.5;

test("a value is set as large as fits, and cut only at the smallest size", () => {
  assert.deepEqual(fitText(measure, "1:02:45", 400, { max: 70, min: 35 }), { size: 70, text: "1:02:45" });
  const smaller = fitText(measure, "1:02:45", 200, { max: 70, min: 35 });
  assert.ok(smaller.size < 70 && measure(smaller.text, smaller.size) <= 200);
  assert.equal(smaller.text, "1:02:45");
  const cut = fitText(measure, "A NAME FAR TOO LONG FOR ITS CELL", 120, { max: 40, min: 20 });
  assert.equal(cut.size, 20);
  assert.match(cut.text, /…$/);
  assert.ok(measure(cut.text, 20) <= 120);
});

test("a route name stays on one line while it fits, then takes two balanced lines, then is cut", () => {
  const options = { max: 96, min: 46 };
  assert.deepEqual(fitTitle(measure, "ISLAND TOUR", 952, options), { size: 96, lines: ["ISLAND TOUR"] });
  const shrunk = fitTitle(measure, "LANZAROTE LAVA ONE EIGHTY", 952, options);
  assert.equal(shrunk.lines.length, 1);
  assert.ok(shrunk.size < 96 && measure(shrunk.lines[0], shrunk.size) <= 952);

  const two = fitTitle(measure, "VOLTA AO CABO DE SÃO VICENTE PELA ESTRADA DA COSTA VICENTINA", 952, options);
  assert.equal(two.lines.length, 2);
  assert.equal(two.lines.join(" "), "VOLTA AO CABO DE SÃO VICENTE PELA ESTRADA DA COSTA VICENTINA", "no word is lost");
  assert.ok(two.lines.every((line) => measure(line, two.size) <= 952));
  assert.ok(Math.abs(two.lines[0].length - two.lines[1].length) <= 8, "the two lines are about as long as each other");

  const endless = fitTitle(measure, "UMA VOLTA MUITO COMPRIDA ".repeat(8).trim(), 952, options);
  assert.equal(endless.size, 46);
  assert.equal(endless.lines.length, 2);
  assert.match(endless.lines[1], /…$/);
  assert.ok(endless.lines.every((line) => measure(line, endless.size) <= 952));

  const oneWord = fitTitle(measure, "X".repeat(80), 952, options);
  assert.equal(oneWord.lines.length, 1);
  assert.ok(measure(oneWord.lines[0], oneWord.size) <= 952);
});

test("the date reads day, month and year, then the time, in the rider's language", () => {
  const when = new Date(2026, 10, 12, 18, 42);
  assert.equal(cardDate(when, "pt-PT"), "12 NOV 2026 · 18:42");
  assert.equal(cardDate(when, "de"), "12 NOV 2026 · 18:42");
  assert.match(cardDate(when, "en"), /^12 NOV 2026 · 6:42\sPM$/);
  assert.match(cardDate(when, "not a locale"), /^12 \S+ 2026 · /, "a malformed locale falls back to the browser's");
});

test("the scale bar is a round length that fits, in the rider's units", () => {
  assert.deepEqual(scaleBar(0.05, 190), { pixels: 100, label: "2 km" });
  assert.deepEqual(scaleBar(5, 190), { pixels: 100, label: "20 m" });
  assert.equal(inLanguage("pt", "metric", () => scaleBar(0.005, 190).label), "20 km");
  const miles = inLanguage("en", "imperial", () => scaleBar(0.05, 190));
  assert.equal(miles.label, "2 mi");
  assert.ok(miles.pixels <= 190);
  assert.equal(inLanguage("en", "imperial", () => scaleBar(5, 190).label), "100 ft");
});

// -------------------------------------------------------------- layout ---

test("the grid fills rows from the left; five small numbers share one row upright", () => {
  assert.deepEqual(gridShape(0, 4), { columns: 0, rows: 0 });
  assert.deepEqual(gridShape(7, 4), { columns: 4, rows: 2 });
  const { portrait, landscape } = CARD_FORMATS;
  assert.deepEqual(metricGrids(portrait, 12), { primaryCount: 4, primary: { columns: 4, rows: 1 }, secondary: { columns: 4, rows: 2 } });
  assert.deepEqual(metricGrids(portrait, 9).secondary, { columns: 5, rows: 1 });
  assert.deepEqual(metricGrids(portrait, 8).secondary, { columns: 4, rows: 1 });
  assert.deepEqual(metricGrids(portrait, 3), { primaryCount: 3, primary: { columns: 4, rows: 1 }, secondary: { columns: 0, rows: 0 } });
  assert.deepEqual(metricGrids(landscape, 12), { primaryCount: 4, primary: { columns: 2, rows: 2 }, secondary: { columns: 3, rows: 3 } });
  assert.deepEqual(metricGrids(landscape, 8).secondary, { columns: 3, rows: 2 });
});

const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

test("every block lies inside the image and none overlaps another, whatever the ride has", () => {
  for (const format of Object.values(CARD_FORMATS)) {
    for (let metricCount = 3; metricCount <= 12; metricCount += 1) {
      for (const zones of [true, false]) {
        for (const map of [true, false]) {
          for (const titleLines of [1, 2]) {
            const title = { size: titleLines === 1 ? 96 : 60, lines: Array(titleLines).fill("X") };
            const layout = cardLayout(format, { metricCount, zones, map, headerHeight: headerMetrics(format, title, true).height });
            const blocks = Object.entries({ header: layout.header, map: layout.map, profile: layout.profile, primary: layout.primary, secondary: layout.secondary, zones: layout.zones, footer: layout.footer }).filter(([, rect]) => rect && rect.h > 0);
            const where = `${format.id}, ${metricCount} metrics, zones ${zones}, map ${map}, ${titleLines} title lines`;
            for (const [name, rect] of blocks) {
              assert.ok(rect.x >= layout.margin && rect.y >= layout.margin && rect.x + rect.w <= format.width - layout.margin + 0.5 && rect.y + rect.h <= format.height - layout.margin + 0.5, `${name} leaves the image (${where})`);
            }
            for (let i = 0; i < blocks.length; i += 1) {
              for (let j = i + 1; j < blocks.length; j += 1) assert.ok(!overlap(blocks[i][1], blocks[j][1]), `${blocks[i][0]} overlaps ${blocks[j][0]} (${where})`);
            }
            if (map) assert.ok(layout.map.h >= 300, `the map is ${layout.map.h} px tall (${where})`);
            assert.ok(layout.profile.h >= 160, `the chart is ${layout.profile.h} px tall (${where})`);
          }
        }
      }
    }
  }
});

test("the map is the largest block, and it grows when the ride has fewer numbers", () => {
  const { portrait, landscape } = CARD_FORMATS;
  const full = cardLayout(portrait, { metricCount: 12, zones: true, map: true });
  const short = cardLayout(portrait, { metricCount: 8, zones: false, map: true });
  assert.ok(short.map.h > full.map.h);
  for (const layout of [full, short, cardLayout(landscape, { metricCount: 12, zones: true, map: true })]) {
    const area = (rect) => (rect ? rect.w * rect.h : 0);
    for (const other of [layout.profile, layout.primary, layout.secondary, layout.zones, layout.header]) assert.ok(area(layout.map) > area(other));
  }
});

test("the header is as tall as its title and the rider's name need", () => {
  const { portrait } = CARD_FORMATS;
  const one = headerMetrics(portrait, { size: 96, lines: ["A"] }, true);
  const two = headerMetrics(portrait, { size: 62, lines: ["A", "B"] }, true);
  const nameless = headerMetrics(portrait, { size: 96, lines: ["A"] }, false);
  assert.equal(one.titleBaselines.length, 1);
  assert.equal(two.titleBaselines.length, 2);
  assert.ok(two.titleBaselines[1] > two.titleBaselines[0]);
  assert.ok(one.name > one.titleBaselines[0] && one.height > one.name);
  assert.equal(nameless.name, null);
  assert.ok(nameless.height < one.height);
});

// --------------------------------------------------------------- model ---

test("the model of a ride on a route has its map, its numbers and its zones", () => {
  const { route, recorder } = rideOf({ seconds: 250, heartRate: () => 150, cadence: () => 90 });
  const model = rideCardModel({ recorder, route, routeName: "Square", riderName: "  Gonçalo ", when: new Date(START), profile: { weightKg: 75, ftp: 250, ftpSource: "typed" } });
  assert.equal(model.title, "Square");
  assert.equal(model.riderName, "Gonçalo");
  assert.equal(model.map.laps, "2 laps");
  assert.equal(model.map.loop, true);
  assert.equal(model.map.track.length, 1);
  assert.equal(model.ftp, 250);
  assert.equal(model.zones.length, 6);
  assert.ok(model.metrics.length >= 10);
});

test("a class in the studio has no map, and a rider on the default FTP no zones", () => {
  const { recorder } = rideOf({ seconds: 120, studio: true });
  const model = rideCardModel({ recorder, route: null, routeName: "Spin Studio · HIIT", when: new Date(START), profile: { weightKg: 75, ftp: 200, ftpSource: "default" } });
  assert.equal(model.map, null);
  assert.equal(model.zones, null);
  assert.equal(model.series.elevation, null);
  assert.equal(model.riderName, "");
});
