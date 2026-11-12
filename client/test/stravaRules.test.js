// What Strava's API Brand Guidelines (developers.strava.com/guidelines, revised 29.09.2025) and
// API Policy (strava.com/legal/api_policy, 01.06.2026) ask of the client, and what the client hands to Strava.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import en from "../public/js/i18n/en.js";
import de from "../public/js/i18n/de.js";
import pt from "../public/js/i18n/pt.js";
import { APP_NAME } from "../public/js/brand.js";
import { STRAVA_TRAINING_LOG, STRAVA_UPLOAD_PAGE, StravaClient, activityUrl } from "../public/js/net/strava.js";
import { RideRecorder, rideFileName } from "../public/js/ride/rideRecorder.js";
import { photoFileName } from "../public/js/view/photos.js";
import { eventRideName } from "../public/js/view/events.js";
import { WORLD_ORIGIN, toLatLon } from "../public/js/route/geo.js";
import { fitMessages } from "./helpers.js";

const PUBLIC = new URL("../public/", import.meta.url).pathname;
const read = (path) => readFileSync(join(PUBLIC, path), "utf8");
const html = read("index.html");
const css = read("styles.css");
const BUTTON = "strava/btn_strava_connect_with_orange.svg";
/** The file inside developers.strava.com/downloads/1.1-Connect-with-Strava-Buttons.zip, as downloaded on 12.11.2026. */
const BUTTON_SHA256 = "cc5b78798ae02919cfde7c2d9f66a9298e51d2c0bb3e9523c9d9b1aec8a63857";

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

test("Strava's button is Strava's file, byte for byte, with a note that says whose it is", () => {
  assert.equal(createHash("sha256").update(readFileSync(join(PUBLIC, BUTTON))).digest("hex"), BUTTON_SHA256);
  const note = read("strava/README.md");
  assert.match(note, /Strava's own artwork/);
  assert.match(note, new RegExp(BUTTON_SHA256));
  assert.match(note, /Neither the AGPL .* nor CC BY-SA 4\.0 .* covers this file/s);
  assert.match(note, /not developed, sponsored or endorsed by Strava/);
  assert.deepEqual(readdirSync(join(PUBLIC, "strava")).sort(), ["README.md", "btn_strava_connect_with_orange.svg"]);
});

test("connecting is always Strava's button, as provided: 237 × 48, linked to the server's sign-in", () => {
  const links = [...html.matchAll(/<a\b[^>]*class="strava-connect"[^>]*>(.*?)<\/a>/gs)];
  assert.equal(links.length, 3, "the start screen, the saved ride and the finish dialog");
  for (const [link, inside] of links) {
    assert.match(link, /href="\/auth\/strava"/);
    assert.match(inside, new RegExp(`^<img src="${BUTTON}" width="237" height="48" alt="Connect with Strava" data-i18n-attr="alt:strava.connectWith" />$`));
  }
  // Every way to the sign-in in the page is that button.
  assert.equal([...html.matchAll(/href="\/auth\/strava"/g)].length, 3);
  assert.match(css, /\.strava-connect img \{ display: block; width: 237px; height: 48px; \}/);
  assert.equal(en["strava.connectWith"], "Connect with Strava");
});

test("no other part of Strava's logo is in the game, and nothing of the game's own wears Strava's orange", () => {
  assert.doesNotMatch(html, /strava-mark|M15\.39 17\.94/, "Strava's chevron is not drawn in the page");
  assert.doesNotMatch(css, /strava-mark|strava-button/);
  assert.doesNotMatch(css, /#fc4c02|#fc5200|252, ?76, ?2\b|252, ?82, ?0\b/i);
  const marks = [];
  for (const path of files(join(PUBLIC, "js"))) {
    const code = readFileSync(path, "utf8");
    if (/M15\.39 17\.94|#fc4c02|#fc5200/i.test(code)) marks.push(path);
  }
  assert.deepEqual(marks, []);
  // The ride image is drawn without it too (test/rideCard.test.js reads every text on it).
  assert.doesNotMatch(readFileSync(join(PUBLIC, "js/view/rideCard.js"), "utf8"), /drawImage|strava\//);
});

test("a link to something on Strava reads View on Strava and is told apart by weight and underline", () => {
  // Strava's Brand Guidelines ask for these very words and say nothing of translations: the same in every language,
  // like Strava's own button.
  for (const dictionary of [en, pt, de]) assert.equal(dictionary["strava.view"], "View on Strava");
  const links = [...html.matchAll(/<a\b[^>]*class="strava-view"[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 2);
  for (const link of links) {
    assert.match(link, /target="_blank"/);
    assert.match(link, /rel="noopener"/);
    assert.match(link, /data-i18n="strava\.view"/);
  }
  const rule = /\.strava-view \{([^}]*)\}/.exec(css)[1];
  assert.match(rule, /font-weight: 700/);
  assert.match(rule, /text-decoration: underline/);
  assert.equal(activityUrl(16000000001), "https://www.strava.com/activities/16000000001");
  assert.equal(STRAVA_TRAINING_LOG, "https://www.strava.com/athlete/training");
});

test("the game is not named after Strava and says only what it does with it", () => {
  assert.doesNotMatch(APP_NAME, /strava/i);
  assert.doesNotMatch(read("manifest.webmanifest"), /strava/i);
  assert.doesNotMatch(/<title>(.*?)<\/title>/.exec(html)[1], /strava/i);
  for (const dictionary of [en, de, pt]) {
    for (const [key, text] of Object.entries(dictionary)) {
      if (/strava/i.test(text)) assert.doesNotMatch(text, /official|oficial|offiziell|endorsed|sponsored|patrocinad|gesponsert|partner|parceir/i, `${key} must not suggest Strava stands behind the game`);
      assert.doesNotMatch(text, /STRAVA/, `${key}: Strava is written as a name, not in capitals`);
    }
  }
});

test("what Strava says about an account is shown to that rider only: it never becomes the name others see", () => {
  const main = read("js/main.js");
  assert.doesNotMatch(main, /\$\("name"\)\.value = app\.stravaAccount/);
  assert.match(main, /Strava API Policy, 2\.3/);
});

test("uploading by hand is explained with Strava's own upload page, wherever a ride is finished", () => {
  assert.equal(STRAVA_UPLOAD_PAGE, "https://www.strava.com/upload/select");
  assert.equal([...html.matchAll(/href="https:\/\/www\.strava\.com\/upload\/select" target="_blank" rel="noopener">strava\.com\/upload\/select<\/a>/g)].length, 2, "the finish dialog and the saved ride");
  for (const dictionary of [en, de, pt]) {
    assert.match(dictionary["finish.manual.step1"], /\.fit/);
    assert.ok(dictionary["finish.manual.step2"].length > 10 && dictionary["finish.manual.result"].length > 10);
  }
});

// ------------------------------------------------------- what Strava receives ---

const START = new Date(2026, 10, 12, 18, 42).getTime();

function recorded() {
  const recorder = new RideRecorder();
  for (let s = 0; s <= 60; s += 1) recorder.add({ t: START + s * 1000, distance: s * 8, power: 200, cadence: 88, heartRate: 140, speed: 8, elevation: 36 + s / 10, ...toLatLon(s * 8, 0), route: "col-de-la-forge", routeM: s * 8 });
  return recorder;
}

test("the upload is the FIT file and a name that says GOCARMO Ride and the route", async () => {
  const calls = [];
  const strava = new StravaClient({ fetch: async (url, options) => (calls.push({ url, options }), { ok: true, json: async () => ({ id: 9 }) }), timeoutSignal: () => undefined });
  const name = `${APP_NAME} · Col de la Forge`;
  await strava.upload(recorded().toFit(), name);
  assert.equal(calls[0].url, "/api/strava/upload?name=GOCARMO%20Ride%20%C2%B7%20Col%20de%20la%20Forge");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["content-type"], "application/vnd.ant.fit");
  assert.equal(calls[0].options.credentials, "same-origin", "the session cookie goes to the game's own server only");
  const body = calls[0].options.body;
  assert.equal(String.fromCharCode(...body.subarray(8, 12)), ".FIT");
  assert.equal(eventRideName("race", "Riverside Flats"), "GOCARMO Ride · Race · Riverside Flats");
  assert.equal(eventRideName("group_ride", "Island Tour"), "GOCARMO Ride · Group ride · Island Tour");
});

test("the FIT file is a virtual ride with positions in the virtual world, and names the fork as the program that wrote it", () => {
  const bytes = recorded().toFit();
  const messages = fitMessages(bytes);
  const session = messages.find((message) => message.global === 18);
  assert.equal(session.values[5], 2, "sport: cycling");
  assert.equal(session.values[6], 58, "sub-sport: virtual activity");
  const fileId = messages.find((message) => message.global === 0);
  assert.equal(fileId.values[1], 255, "manufacturer: development (no registered maker)");
  assert.equal(fileId.values[8], "GOCARMO Ride", "product_name: the file says what wrote it, like the TCX and GPX creator");
  const first = messages.find((message) => message.global === 20);
  assert.ok(Math.abs(first.values[0] * (180 / 2 ** 31) - WORLD_ORIGIN.lat) < 1e-6);
  assert.ok(Math.abs(first.values[1] * (180 / 2 ** 31) - WORLD_ORIGIN.lon) < 1e-6);
  assert.deepEqual(WORLD_ORIGIN, { lat: 39, lon: 2.6 }, "the virtual world stays where upstream put it");
  assert.doesNotMatch(String.fromCharCode(...bytes), /openradlr/i);
});

test("the files a rider uploads by hand name the fork, never upstream", () => {
  const recorder = recorded();
  const tcx = recorder.toTcx({ name: `${APP_NAME} · Col de la Forge` });
  assert.match(tcx, /<Creator xsi:type="Device_t"[^>]*><Name>GOCARMO Ride<\/Name><\/Creator>/);
  assert.match(tcx, /<Notes>GOCARMO Ride · Col de la Forge<\/Notes>/);
  const gpx = recorder.toGpx({ name: `${APP_NAME} · Col de la Forge` });
  assert.match(gpx, /<gpx version="1\.1" creator="GOCARMO Ride"/);
  assert.match(gpx, /<type>VirtualRide<\/type>/);
  for (const file of [tcx, gpx]) assert.doesNotMatch(file, /openradlr/i);
  assert.equal(rideFileName(START, "col-de-la-forge", "fit"), "gocarmo-ride-2026-11-12-1842-col-de-la-forge.fit");
  assert.equal(photoFileName(START, "col-de-la-forge", "card"), "gocarmo-ride-2026-11-12-1842-col-de-la-forge-card.png");
  assert.equal(photoFileName(START, "col-de-la-forge", "card-wide"), "gocarmo-ride-2026-11-12-1842-col-de-la-forge-card-wide.png");
});
