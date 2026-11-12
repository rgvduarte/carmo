// The ride image as drawn: two sizes from one layout, nothing outside its margins,
// real font weights, no mark that is not GOCARMO's, and no place-holder for a sensor that was not there.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CARD_FOOTER, composeRideCard, mapContext, rideCardFontsReady } from "../public/js/view/rideCard.js";
import { CARD_FORMATS, rideCardModel } from "../public/js/view/rideCardModel.js";
import { RideRecorder } from "../public/js/ride/rideRecorder.js";
import { toLatLon } from "../public/js/route/geo.js";
import { RoadNetwork } from "../public/js/route/network.js";
import { setLocale } from "../public/js/i18n/i18n.js";
import { setUnits } from "../public/js/util/format.js";
import { recordingDoc, squareRoute, tinyNetworkFile } from "./helpers.js";

const START = new Date(2026, 10, 12, 18, 42).getTime();

function model({ seconds = 1500, sensors = true, routeName = "Col de la Forge", riderName = "Gonçalo", ftpSource = "typed", studio = false, routeId = "square" } = {}) {
  const route = squareRoute(routeId);
  const recorder = new RideRecorder();
  for (let s = 0; s <= seconds; s += 1) {
    const d = s * 9;
    const position = route.positionAt(d);
    recorder.add({
      t: START + s * 1000,
      distance: d,
      power: 180 + (s % 60),
      heartRate: sensors ? 140 + (s % 30) : undefined,
      cadence: sensors ? 88 : undefined,
      speed: 9,
      elevation: studio ? undefined : route.elevationAt(d),
      ...(studio ? {} : toLatLon(position.x, position.y, route.geo)),
      route: studio ? null : route.id,
      routeM: studio ? null : d,
    });
  }
  return rideCardModel({ recorder, route: studio ? null : route, routeName, riderName, when: new Date(START), profile: { weightKg: 75, ftp: 250, ftpSource }, context: studio ? null : mapContext(route) });
}

const LONG = "Volta ao Cabo de São Vicente pela Estrada da Costa Vicentina";
const CASES = {
  "every sensor": {},
  "a short ride": { seconds: 215 },
  "no heart rate, no cadence, default FTP": { sensors: false, ftpSource: "default" },
  "a long route name and a long rider name": { routeName: LONG, riderName: "Maria Francisca de Vasconcelos" },
  "no rider name": { riderName: "" },
  "a studio class": { studio: true, routeName: "Spin Studio · HIIT 30/30" },
  "a route made from OpenStreetMap and Copernicus data": { routeId: "lanzarote-lava-180", routeName: "Lanzarote Lava 180" },
};

test("the image comes in two sizes: upright 1080 × 1350 and wide 1600 × 900", () => {
  assert.deepEqual(CARD_FORMATS.portrait, { id: "portrait", width: 1080, height: 1350 });
  assert.deepEqual(CARD_FORMATS.landscape, { id: "landscape", width: 1600, height: 900 });
  for (const format of Object.values(CARD_FORMATS)) {
    const canvas = composeRideCard(model(), format, recordingDoc().doc);
    assert.deepEqual([canvas.width, canvas.height], [format.width, format.height]);
  }
  assert.equal(composeRideCard(model(), undefined, recordingDoc().doc).width, 1080, "upright is the main one");
});

test("no text leaves the image's margins or is cut by its edge, in either size", () => {
  for (const [name, options] of Object.entries(CASES)) {
    for (const format of Object.values(CARD_FORMATS)) {
      const { doc, texts } = recordingDoc();
      const canvas = composeRideCard(model(options), format, doc);
      const margin = 40;
      const outside = texts.filter(({ x, y, align, width, size }) => {
        const from = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
        return from < margin || from + width > canvas.width - margin || y - size * 0.8 < margin || y > canvas.height - margin;
      });
      assert.deepEqual(outside.map((entry) => entry.text), [], `${name}, ${format.id}`);
    }
  }
});

test("a long route name is fitted, not cut: every word of it is on the image", () => {
  // Long enough for two lines in both sizes (the test's letters are wider than Anton's).
  const name = "Volta ao Cabo de São Vicente pela Costa";
  for (const format of Object.values(CARD_FORMATS)) {
    const { doc, texts } = recordingDoc();
    composeRideCard(model({ routeName: name }), format, doc);
    const display = texts.filter((entry) => /Anton/.test(entry.font) && !/GC Anton Tab/.test(entry.font)).map((entry) => entry.text);
    const title = display.filter((text) => text !== "GOCARMO" && text !== "RIDE");
    assert.equal(title.join(" "), name.toUpperCase(), format.id);
    assert.equal(title.length, 2, `two lines, ${format.id}`);
  }
});

test("the header is the lockup, the route in capitals, the date and the rider's name; the footer is the address", () => {
  const { doc, texts } = recordingDoc();
  composeRideCard(model(), CARD_FORMATS.portrait, doc);
  const written = texts.map((entry) => entry.text);
  for (const expected of ["GOCARMO", "RIDE", "COL DE LA FORGE", "GONÇALO", "gocarmo.com/ride"]) assert.ok(written.includes(expected), `${expected} is missing: ${written.join(" | ")}`);
  assert.ok(written.some((text) => /^12 NOV 2026 · /.test(text)));
  assert.equal(CARD_FOOTER, "gocarmo.com/ride");
  const nameless = recordingDoc();
  composeRideCard(model({ riderName: "" }), CARD_FORMATS.portrait, nameless.doc);
  assert.ok(!nameless.texts.some((entry) => entry.text === "GONÇALO"));
});

test("nothing on the image is another's mark: no Strava, no OpenRadlr, no lemon", () => {
  for (const options of Object.values(CASES)) {
    const { doc, texts } = recordingDoc();
    composeRideCard(model(options), CARD_FORMATS.portrait, doc);
    for (const { text } of texts) assert.doesNotMatch(text, /strava|openradlr|lemon|zwift/i);
  }
});

test("a route made from OpenStreetMap and Copernicus data carries their notice on the image, in both sizes", () => {
  for (const format of Object.values(CARD_FORMATS)) {
    const { doc, texts } = recordingDoc();
    composeRideCard(model({ routeId: "lanzarote-lava-180", routeName: "Lanzarote Lava 180" }), format, doc);
    const written = texts.map((entry) => entry.text).join(" ");
    assert.ok(written.includes("© OpenStreetMap contributors, ODbL"), format.id);
    assert.ok(written.includes("Elevation produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"), `${format.id}: the Copernicus notice, word for word`);
    assert.ok(written.includes("gocarmo.com/ride"), format.id);
    const plain = recordingDoc();
    composeRideCard(model(), format, plain.doc);
    assert.ok(!plain.texts.some((entry) => /OpenStreetMap|Copernicus/.test(entry.text)), `${format.id}: a route GOCARMO Ride or the original drew carries none`);
  }
});

test("every face is drawn at a weight it has: Anton at 400, the mono face at 500, never bold", () => {
  const { doc, fonts } = recordingDoc();
  composeRideCard(model(), CARD_FORMATS.portrait, doc);
  composeRideCard(model(), CARD_FORMATS.landscape, doc);
  assert.ok(fonts.length > 20);
  for (const font of fonts) {
    assert.doesNotMatch(font, /^(bold|italic|oblique|[6-9]00)\b/i, font);
    if (/Anton/.test(font)) assert.match(font, /^400 /, font);
    else assert.match(font, /^500 [\d.]+px "JetBrains Mono"/, font);
  }
  assert.ok(fonts.some((font) => font.includes('"GC Anton Tab"')), "numbers use the tabular cut");
});

test("a ride without heart rate and cadence shows fewer numbers and no place-holder", () => {
  const all = recordingDoc();
  composeRideCard(model(), CARD_FORMATS.portrait, all.doc);
  const few = recordingDoc();
  composeRideCard(model({ sensors: false, ftpSource: "default" }), CARD_FORMATS.portrait, few.doc);
  const numbers = (texts) => texts.filter((entry) => entry.font.includes("GC Anton Tab")).map((entry) => entry.text);
  assert.equal(numbers(all.texts).length, 12 + 1, "twelve numbers and the lap count");
  assert.equal(numbers(few.texts).length, 9 + 1);
  for (const text of few.texts.map((entry) => entry.text)) assert.doesNotMatch(text, /^[–—-]$|bpm|rpm|^FTP /);
  assert.ok(all.texts.some((entry) => entry.text === "FTP 250 W"), "the zones name the FTP they are counted against");
});

test("labels and numbers follow the rider's language and units", () => {
  const written = (locale, units) => {
    setLocale(locale);
    setUnits(units);
    try {
      const { doc, texts } = recordingDoc();
      composeRideCard(model({ seconds: 181 }), CARD_FORMATS.portrait, doc);
      return texts.map((entry) => entry.text);
    } finally {
      setLocale("en");
      setUnits("metric");
    }
  };
  const pt = written("pt", "metric");
  for (const expected of ["DISTÂNCIA", "1,63", "km", "D+", "INÍCIO", "FIM", "POTÊNCIA", "ALTIMETRIA"]) assert.ok(pt.includes(expected), `${expected} is missing: ${pt.join(" | ")}`);
  const us = written("en", "imperial");
  for (const expected of ["DISTANCE", "1.01", "mi", "mph", "START", "FINISH"]) assert.ok(us.includes(expected), `${expected} is missing: ${us.join(" | ")}`);
  const german = written("de", "metric");
  assert.ok(german.includes("STRECKE") && german.includes("ZIEL"));
});

test("a loop ridden several times says how many laps, in the map's corner", () => {
  const { doc, texts } = recordingDoc();
  composeRideCard(model({ seconds: 1500 }), CARD_FORMATS.landscape, doc);
  const written = texts.map((entry) => entry.text);
  assert.ok(written.includes("13") && written.includes("LAPS"), written.join(" | "));
});

test("a class in the studio is drawn without a map: the chart takes its place", () => {
  const { doc, texts } = recordingDoc();
  composeRideCard(model({ studio: true, routeName: "Spin Studio · HIIT 30/30" }), CARD_FORMATS.portrait, doc);
  const written = texts.map((entry) => entry.text);
  assert.ok(!written.includes("START") && !written.includes("N"));
  assert.ok(written.includes("POWER") && !written.includes("ELEVATION"));
});

test("the world around the route comes from the map's network where it has one, else from the routes", () => {
  const route = squareRoute();
  const alone = mapContext(route);
  assert.ok(alone.coast.length > 100, "an island is drawn round a route on its own");
  assert.deepEqual(alone.roads, []);
  for (const point of alone.coast) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y));
  // The island lies round the route: the route's corners are inside the coast's box.
  const xs = alone.coast.map((p) => p.x);
  const ys = alone.coast.map((p) => p.y);
  assert.ok(Math.min(...xs) < 0 && Math.max(...xs) > 250 && Math.min(...ys) < 0 && Math.max(...ys) > 250);

  const network = new RoadNetwork(tinyNetworkFile());
  const shared = mapContext(route, { network });
  assert.equal(shared.roads.length, network.roads().length);
  assert.ok(shared.roads.every((road) => road.length >= 3));
  const others = mapContext(route, { routes: [route, { ...squareRoute(), id: "other", positionAt: (d) => route.positionAt(d), length: route.length }] });
  assert.equal(others.roads.length, 1, "the ride's own route is not drawn twice");
});

test("the fonts are loaded for the very text the image writes", async () => {
  const asked = [];
  await rideCardFontsReady(model({ riderName: "Łukasz" }), { fonts: { load: (font, text) => (asked.push(text), Promise.resolve([])) } });
  assert.ok(asked.length >= 3);
  assert.ok(asked.every((text) => text.includes("ŁUKASZ") && text.includes("COL DE LA FORGE")));
});
