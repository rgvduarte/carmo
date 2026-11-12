// GOCARMO Ride, the fork: what the licence asks of it (source offer, licence copy, credits)
// and the pieces of the brand that are data (the symbol, the arch, the titles of events).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import en from "../public/js/i18n/en.js";
import de from "../public/js/i18n/de.js";
import pt from "../public/js/i18n/pt.js";
import { setLocale } from "../public/js/i18n/i18n.js";
import { APP_NAME, BRAND_SYMBOL, withServer } from "../public/js/brand.js";
import { sourceUrl } from "../public/js/view/about.js";
import { eventRows, eventTitle } from "../public/js/view/events.js";
import { serverStatus } from "../public/js/view/startMenu.js";
import { ARCH_MARK } from "../public/js/view3d/gocarmoMark.js";
import { MARK_COLORS, markBeam } from "../public/js/view3d/banners.js";
import { MeshBuilder } from "../public/js/view3d/meshBuilder.js";
import { buildLemon } from "../public/js/view3d/lemonModel.js";

afterEach(() => setLocale("en"));

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const html = read("../public/index.html");
const BRANCH = "https://github.com/rgvduarte/carmo/tree/gocarmo-ride";

// --- licence -------------------------------------------------------------------------------

test("the licence and the notice travel with the client, word for word", () => {
  assert.equal(read("../public/LICENSE.txt"), read("../../LICENSE"), "client/public/LICENSE.txt is a copy of LICENSE");
  assert.equal(read("../public/NOTICE.txt"), read("../../NOTICE.md"), "client/public/NOTICE.txt is a copy of NOTICE.md");
  assert.match(html, /<a href="LICENSE\.txt"[^>]*data-i18n="about\.licence"/, "the About dialog links the served copy");
  assert.match(html, /<a href="NOTICE\.txt"[^>]*data-i18n="about\.notice"/);
});

test("the source link names the running commit when the build knows it, else the fork's branch", () => {
  assert.equal(sourceUrl("dev"), BRANCH);
  assert.equal(sourceUrl(""), BRANCH);
  assert.equal(sourceUrl("74a7208"), "https://github.com/rgvduarte/carmo/tree/74a7208");
  assert.equal(sourceUrl("74a7208d3f0c1b2a3948576a6b7c8d9e0f1a2b3c"), "https://github.com/rgvduarte/carmo/tree/74a7208d3f0c1b2a3948576a6b7c8d9e0f1a2b3c");
  assert.equal(sourceUrl("main; rm"), BRANCH, "anything that is not a commit id falls back to the branch");
});

test("the source code is offered on the start screen, in the ride menu and in the About dialog", () => {
  const links = [...html.matchAll(/<a\b[^>]*data-source-link[^>]*>/g)].map((m) => m[0]);
  assert.equal(links.length, 3);
  for (const link of links) {
    assert.ok(link.includes(`href="${BRANCH}"`), "works before the script runs");
    assert.ok(link.includes('data-i18n="about.source"'));
  }
  assert.match(html, /<footer class="build-line">[\s\S]*?data-source-link[\s\S]*?<\/footer>/, "start screen foot");
  assert.match(html, /data-about-open data-i18n="about\.open"[^\n]*\n\s*<a class="hint about-source" data-source-link/, "ride menu, beside the credits button");
});

test("the credits say which licence, that later versions apply, what a rider may do, and who wrote the original", () => {
  for (const [name, dictionary, later] of [["en", en, "or-later"], ["de", de, "oder später"], ["pt", pt, "ou posterior"]]) {
    for (const key of ["about.short", "about.credit"]) {
      assert.ok(dictionary[key].includes("© The OpenRadlr contributors"), `${name} ${key}: the copyright notice as upstream wrote it`);
      assert.ok(dictionary[key].includes("AGPL-3.0") && dictionary[key].includes(later), `${name} ${key}: AGPL-3.0 or later`);
      assert.ok(dictionary[key].startsWith(APP_NAME));
    }
    assert.ok(dictionary["about.modified"].includes("2b09a79") && dictionary["about.modified"].includes("12.11.2026"), `${name}: which version, changed since when`);
    assert.ok(dictionary["about.data"].includes("© OpenStreetMap contributors, ODbL"), `${name}: map data credit`);
    assert.ok(dictionary["about.data"].includes("Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA."), `${name}: elevation credit, verbatim`);
  }
  assert.match(pt["about.modified"], /Não é o OpenRadlr oficial/);
  assert.match(pt["about.modified"], /podes usá-lo, alterá-lo e partilhá-lo/);
  assert.match(en["about.modified"], /not the official OpenRadlr/);
});

test("no file of upstream's artwork folder is shipped: the fork's own marks live in brand/", () => {
  assert.equal(existsSync(new URL("../public/icons", import.meta.url)), false, "ASSETS-LICENSE.md lists client/public/icons/ for upstream's artwork");
  for (const file of ["favicon.svg", "favicon-32.png", "favicon-64.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "gocarmo-ride.svg"]) {
    assert.ok(existsSync(new URL(`../public/brand/${file}`, import.meta.url)), file);
  }
  const manifest = JSON.parse(read("../public/manifest.webmanifest"));
  assert.equal(manifest.name, APP_NAME);
  for (const icon of manifest.icons) assert.ok(icon.src.startsWith("brand/") && existsSync(new URL(`../public/${icon.src}`, import.meta.url)), icon.src);
  assert.doesNotMatch(html + read("../public/sw.js"), /icons\//);
});

// --- brand ---------------------------------------------------------------------------------

test("the symbol drawn on photos is the symbol of the page", () => {
  const symbol = /<symbol id="gc-symbol" viewBox="0 0 64 64"><path fill="currentColor" d="([^"]+)" \/><path fill="var\(--gold, #e6b450\)" d="([^"]+)" \/><\/symbol>/.exec(html);
  assert.ok(symbol, "index.html defines #gc-symbol");
  assert.equal(BRAND_SYMBOL.moon, symbol[1]);
  assert.equal(BRAND_SYMBOL.sun, symbol[2]);
  assert.equal(BRAND_SYMBOL.size, 64);
});

test("a server called like the app is not named a second time", () => {
  assert.equal(withServer("Rolling Hills", "GOCARMO Ride"), "Rolling Hills");
  assert.equal(withServer("Rolling Hills", ""), "Rolling Hills");
  assert.equal(withServer("Rolling Hills", "Clube da Serra"), "Rolling Hills · Clube da Serra");
});

test("the server's own English event names read in the rider's language; an organiser's name is kept", () => {
  setLocale("pt");
  assert.equal(eventTitle({ name: "Group ride · Cape Loop", kind: "group_ride" }, "Cape Loop"), "Treino de grupo · Cape Loop");
  assert.equal(eventTitle({ name: "Race · Velodrome", kind: "race" }, "Velodrome"), "Corrida · Velodrome");
  assert.equal(eventTitle({ name: "Race · Velodrome", kind: "race" }), "Corrida · Velodrome", "without the route list, the name's own tail");
  assert.equal(eventTitle({ name: "Volta de domingo", kind: "group_ride" }, "Cape Loop"), "Volta de domingo");
  const info = { now_s: 0, routes: [{ id: "cape", name: "Cape Loop" }], events: [{ id: "e", name: "Group ride · Cape Loop", kind: "group_ride", route_id: "cape", lobby_opens_at_s: 0, starts_at_s: 600, phase: "lobby", entrants: 0 }] };
  const [row] = eventRows(info, 0, { locale: "pt-PT", timeZone: "UTC" });
  assert.equal(row.name, "Treino de grupo · Cape Loop");
  assert.equal(row.countdown, "daqui a 10:00");
  assert.equal("icon" in row, false, "no emoji in front of the name");
  setLocale("en");
  assert.equal(eventTitle({ name: "Group ride · Cape Loop", kind: "group_ride" }, "Cape Loop"), "Group ride · Cape Loop");
});

test("phone riders are counted in words in Portuguese", () => {
  setLocale("pt");
  assert.equal(serverStatus({ players: 3, phone_players: 2, max_players: 50 }).text, "3 ciclistas (2 no telemóvel) online · lugar para mais 49");
  assert.equal(pt["ride.paddleLetterLeft"], "E");
  assert.equal(pt["ride.paddleLetterRight"], "D");
});

// --- the 3D world --------------------------------------------------------------------------

test("the arch bitmap is a rectangle of ink, gold and empty cells with both colours in it", () => {
  assert.ok(ARCH_MARK.length >= 20);
  for (const row of ARCH_MARK) {
    assert.equal(row.length, ARCH_MARK[0].length);
    assert.match(row, /^[.#o]+$/);
  }
  const all = ARCH_MARK.join("");
  assert.ok(all.includes("#") && all.includes("o"), "the moon and letters, and the sun");
  assert.ok(MARK_COLORS["#"] && MARK_COLORS.o);
});

test("the lockup is written on both faces of the beam, inside it, one quad per run", () => {
  const mesh = new MeshBuilder();
  const beam = { center: [0, 5, 0], right: [1, 0, 0], forward: [0, 0, 1], width: 8, height: 1, depth: 0.4 };
  markBeam(mesh, beam, ARCH_MARK);
  const built = mesh.build();
  const runs = ARCH_MARK.reduce((sum, row) => sum + (row.match(/#+|o+/g) ?? []).length, 0);
  assert.equal(built.vertexCount, runs * 6 * 2, "two triangles per run, two faces");
  let front = 0;
  for (let i = 0; i < built.positions.length; i += 3) {
    const [x, y, z] = [built.positions[i], built.positions[i + 1], built.positions[i + 2]];
    assert.ok(Math.abs(x) <= beam.width / 2 && Math.abs(y - 5) <= beam.height / 2, "inside the beam's face");
    assert.ok(Math.abs(Math.abs(z) - (beam.depth / 2 + 0.015)) < 1e-6, "just proud of a face");
    if (z > 0) front += 1;
  }
  assert.equal(front * 2, built.vertexCount, "half on each face");
});

test("the collectible sun is a flat plate: a disc and its rays in one plane, seen from both sides", () => {
  const built = buildLemon();
  let deepest = 0;
  let widest = 0;
  for (let i = 0; i < built.positions.length; i += 3) {
    deepest = Math.max(deepest, Math.abs(built.positions[i + 2]));
    widest = Math.max(widest, Math.hypot(built.positions[i], built.positions[i + 1]));
  }
  assert.ok(deepest <= 0.05, "thin");
  assert.ok(widest > 0.5 && widest < 0.6, "about 1 m across with its rays");
  let towards = 0;
  let away = 0;
  for (let i = 2; i < built.normals.length; i += 3) {
    if (built.normals[i] > 0.99) towards += 1;
    if (built.normals[i] < -0.99) away += 1;
  }
  assert.ok(towards > 0 && towards === away, "the same face on both sides");
});
