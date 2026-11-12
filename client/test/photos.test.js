import { test } from "node:test";
import assert from "node:assert/strict";
import { PhotoAlbum, canShareFiles, composePhoto, photoActions, downsample, photoFileName, photoFontsReady, photoStats } from "../public/js/view/photos.js";
import { recordingDoc } from "./helpers.js";

test("names photo files after the date, route and number", () => {
  const t = new Date(2026, 9, 14, 15, 30).getTime();
  assert.equal(photoFileName(t, "rolling-hills", 3), "gocarmo-ride-2026-10-14-1530-rolling-hills-3.png");
  assert.equal(photoFileName(t, "Col de la Forge!", "summary"), "gocarmo-ride-2026-10-14-1530-col-de-la-forge-summary.png");
  assert.equal(photoFileName(t, "", ""), "gocarmo-ride-2026-10-14-1530-ride.png");
});

function album(max) {
  const revoked = [];
  let n = 0;
  const photos = new PhotoAlbum({ max, createUrl: () => `blob:${(n += 1)}`, revokeUrl: (url) => revoked.push(url) });
  return { photos, revoked };
}

test("the album keeps photos in order and drops the oldest beyond the limit", () => {
  const { photos, revoked } = album(2);
  photos.add("a", { name: "a.png", takenAt: 1 });
  photos.add("b", { name: "b.png", takenAt: 2 });
  photos.add("c", { name: "c.png", takenAt: 3 });
  assert.deepEqual(photos.photos.map((p) => p.name), ["b.png", "c.png"]);
  assert.deepEqual(revoked, ["blob:1"]);
  assert.equal(photos.size, 2);
});

test("removing a photo frees its URL", () => {
  const { photos, revoked } = album(5);
  const first = photos.add("a", { name: "a.png" });
  photos.add("b", { name: "b.png" });
  assert.equal(photos.remove(first.id), true);
  assert.equal(photos.remove(first.id), false);
  assert.deepEqual(revoked, ["blob:1"]);
  assert.deepEqual(photos.photos.map((p) => p.name), ["b.png"]);
});

test("clearing the album for the next ride frees every URL", () => {
  const { photos, revoked } = album(5);
  photos.add("a", { name: "a.png" });
  photos.setSummary("s", { name: "summary.png" });
  photos.clear();
  assert.deepEqual(photos.images, []);
  assert.equal(photos.size, 0);
  assert.deepEqual(revoked.sort(), ["blob:1", "blob:2"]);
});

test("the summary image comes first among the ride's images and is replaced, not added", () => {
  const { photos, revoked } = album(1);
  assert.deepEqual(photos.images, []);
  photos.add("a", { name: "a.png", takenAt: 1 });
  photos.setSummary("s1", { name: "summary.png", takenAt: 0 });
  photos.setSummary("s2", { name: "summary.png", takenAt: 0 });
  photos.add("b", { name: "b.png", takenAt: 2 });
  assert.deepEqual(photos.images.map((p) => p.blob), ["s2", "b"], "the photo limit doesn't count the summary");
  assert.equal(photos.images[0].summary, true);
  assert.equal(photos.size, 1, "size counts photos only");
  assert.deepEqual(revoked, ["blob:2", "blob:1"], "the old summary and the dropped photo free their URLs");
});

test("photo stats show distance, time, power, speed and grade", () => {
  const stats = photoStats({ distanceM: 12345, elapsedS: 3725, power: 231.6, speed: 10, gradePercent: -4.25 });
  assert.deepEqual(stats, [
    ["Distance", "12.35 km"],
    ["Time", "1:02:05"],
    ["Power", "232 W"],
    ["Speed", "36.0 km/h"],
    ["Grade", "−4.3 %"],
  ]);
  assert.equal(photoStats({ distanceM: 0, elapsedS: 0, power: undefined, speed: undefined, gradePercent: 0 })[2][1], "0 W");
});

test("downsampling averages buckets and keeps short series", () => {
  assert.deepEqual(downsample([1, 2, 3], 5), [1, 2, 3]);
  assert.deepEqual(downsample([1, 3, 5, 7, 9, 11], 3), [2, 6, 10]);
  assert.equal(downsample(Array.from({ length: 1000 }, (_, i) => i), 240).length, 240);
});

test("sharing files is offered only where the browser supports it", () => {
  assert.equal(canShareFiles(undefined), false);
  assert.equal(canShareFiles({}), false);
  assert.equal(canShareFiles({ canShare: ({ files }) => files.length === 1 }), true);
  assert.equal(canShareFiles({ canShare: () => { throw new Error("nope"); } }), false);
});

test("a ride photo keeps the scene's size and names the route, never upstream's app", () => {
  const { doc, texts } = recordingDoc();
  const photo = composePhoto({ width: 1280, height: 720 }, { routeName: "Col de la Forge", stats: [["Distance", "1.81 km"], ["Time", "3:35"], ["Power", "291 W"]], when: new Date(2026, 10, 12, 18, 42) }, doc);
  assert.deepEqual([photo.width, photo.height], [1280, 720]);
  const written = texts.map((entry) => entry.text);
  assert.ok(written.includes("COL DE LA FORGE"));
  assert.ok(written.includes("GOCARMO") && written.includes("RIDE"));
  assert.ok(written.every((text) => !/openradlr|strava/i.test(text)));
});

test("a photo on a route made from others' data carries their notice, inside the picture, upright and wide", async () => {
  const { ROUTE_DATA_CREDIT, routeDataCredit } = await import("../public/js/view/rideCardModel.js");
  const credit = routeDataCredit("lanzarote-lava-180");
  assert.equal(credit, ROUTE_DATA_CREDIT["lanzarote-lava-180"]);
  assert.equal(routeDataCredit("rolling-hills"), null);
  assert.equal(routeDataCredit(undefined), null);
  for (const [width, height] of [[1280, 720], [430, 932]]) {
    const { doc, texts } = recordingDoc();
    composePhoto({ width, height }, { routeName: "Lanzarote Lava 180", stats: [["Distance", "1.81 km"], ["Time", "3:35"], ["Power", "291 W"]], when: new Date(2026, 10, 12, 18, 42), credit }, doc);
    const written = texts.map((entry) => entry.text).join(" ");
    assert.ok(written.includes("© OpenStreetMap contributors, ODbL"), `${width}×${height}`);
    assert.ok(written.includes("provided under COPERNICUS by the European Union and ESA; all rights reserved"), `${width}×${height}`);
    for (const { x, width: w, align, text } of texts) {
      const from = align === "right" ? x - w : x;
      assert.ok(from >= 0 && from + w <= width + 1, `${width}×${height}: inside the picture: ${text}`);
    }
  }
  const { doc, texts } = recordingDoc();
  composePhoto({ width: 1280, height: 720 }, { routeName: "Rolling Hills", stats: [], when: new Date(2026, 10, 12, 18, 42) }, doc);
  assert.ok(!texts.some((entry) => /OpenStreetMap|Copernicus/.test(entry.text)));
});

test("the fonts are asked for at their real weights, with the text that will be drawn", async () => {
  const asked = [];
  await photoFontsReady({ fonts: { load: (font, text) => (asked.push([font, text]), Promise.resolve([])) } }, "Łódź");
  assert.equal(asked.length, 4);
  assert.ok(asked.every(([, text]) => text.includes("Łódź") && text.includes("0123456789")));
  // Anton and its tabular cut have one weight: a canvas asked for a bolder one would smear it.
  for (const [font] of asked) assert.match(font, /^(400|500) /);
  assert.ok(asked.some(([font]) => font.startsWith("400 ") && font.includes('"GC Anton Tab"')));
  await photoFontsReady({}, "x"); // a document without the font API: nothing to wait for
});

test("the ride image has its own save and share, apart from the photos taken on the road", () => {
  const { photos } = album();
  photos.setSummary("summary", { name: "summary.png" });
  assert.deepEqual(photoActions(photos, false), { summaryEnabled: true, summaryShareVisible: false, allVisible: false, shareVisible: false });
  assert.deepEqual(photoActions(photos, true), { summaryEnabled: true, summaryShareVisible: true, allVisible: false, shareVisible: false });
});

test("ride photos can be saved and shared before the ride image is ready", () => {
  const { photos } = album();
  photos.add("photo", { name: "photo.png" });
  assert.deepEqual(photoActions(photos, true), { summaryEnabled: false, summaryShareVisible: false, allVisible: true, shareVisible: true });
});
