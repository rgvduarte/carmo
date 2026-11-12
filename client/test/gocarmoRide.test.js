// GOCARMO Ride, the fork: what the licence asks of it (source offer, licence copy, credits)
// and the pieces of the brand that are data (the symbol, the arch, the titles of events).
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import en from "../public/js/i18n/en.js";
import de from "../public/js/i18n/de.js";
import pt from "../public/js/i18n/pt.js";
import { setLocale } from "../public/js/i18n/i18n.js";
import { APP_NAME, BRAND_SYMBOL, withServer } from "../public/js/brand.js";
import { sourceUrl } from "../public/js/view/about.js";
import { ClientMessages } from "../public/js/net/protocol.js";
import { eventRows, eventTitle } from "../public/js/view/events.js";
import { serverStatus } from "../public/js/view/startMenu.js";
import { riderName } from "../public/js/view/panels.js";
import { KNOWN_CUES, cueText } from "../public/js/studio/cueText.js";
import { classPosition, classWorkout } from "../public/js/studio/classClock.js";
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

test("every source link takes its address from the one helper, the dev gallery's too", () => {
  const about = read("../public/js/view/about.js");
  assert.match(about, /querySelectorAll\("\[data-source-link\]"\)\) link\.href = sourceUrl\(\)/);
  const gallery = read("../public/gallery.html");
  const offers = [...gallery.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(offers.length, 1);
  assert.ok(offers[0].includes("data-source-link") && offers[0].includes(`href="${BRANCH}"`), "gallery.html carries the offer, also without script");
  assert.match(read("../public/js/gallery.js"), /querySelectorAll\("\[data-source-link\]"\)\) link\.href = sourceUrl\(\)/);
  // No other address of the repository is written anywhere in the client.
  const stray = [];
  for (const file of ["../public/index.html", "../public/gallery.html", "../public/js/main.js", "../public/js/view/about.js", "../public/js/gallery.js"]) {
    for (const m of read(file).matchAll(/github\.com\/rgvduarte\/carmo[^"'`\s<]*/g)) {
      if (m[0] !== "github.com/rgvduarte/carmo/tree/gocarmo-ride" && m[0] !== "github.com/rgvduarte/carmo") stray.push(`${file}: ${m[0]}`);
    }
  }
  assert.deepEqual(stray, []);
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
    // Copernicus's own wording for adapted data (the route's heights are resampled and smoothed), word for word.
    assert.ok(dictionary["about.data"].includes("produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved."), `${name}: elevation credit, verbatim`);
  }
  assert.match(pt["about.modified"], /Não é o OpenRadlr oficial/);
  assert.match(pt["about.modified"], /podes usá-lo, alterá-lo e partilhá-lo/);
  assert.match(en["about.modified"], /not the official OpenRadlr/);
});

test("the credits say the licence in full words and that there is no warranty, in the three languages", () => {
  assert.match(pt["about.modified"], /versão modificada do OpenRadlr/);
  assert.match(pt["about.modified"], /licença GNU AGPL, versão 3 ou posterior/);
  assert.match(pt["about.modified"], /sem garantia/);
  assert.match(en["about.modified"], /modified version of OpenRadlr/);
  assert.match(en["about.modified"], /GNU AGPL, version 3 or any later version/);
  assert.match(en["about.modified"], /no warranty/);
  assert.match(de["about.modified"], /veränderte Fassung von OpenRadlr/);
  assert.match(de["about.modified"], /GNU AGPL, Version 3 oder später/);
  assert.match(de["about.modified"], /Ohne Gewährleistung/);
  assert.match(de["about.modified"], /nicht das offizielle OpenRadlr/);
  assert.match(html, /<a href="https:\/\/www\.openstreetmap\.org\/copyright"[^>]*data-i18n="about\.osm"/, "the map data credit links OpenStreetMap's copyright page");
});

test("the GOCARMO artwork says whose it is: image files CC BY-SA 4.0, name and brand reserved", () => {
  const holder = "© Gonçalo Carmo, CC BY-SA 4.0";
  for (const [name, dictionary, reserved] of [["en", en, /name GOCARMO and its use as a brand are reserved/], ["de", de, /Name GOCARMO und seine Verwendung als Marke bleiben vorbehalten/], ["pt", pt, /nome GOCARMO e o seu uso como marca ficam reservados/]]) {
    assert.ok(dictionary["about.brand"].includes(holder), `${name}: rights holder and licence of the image files`);
    assert.match(dictionary["about.brand"], reserved, `${name}: the name and the brand stay reserved`);
  }
  assert.match(html, /<p class="muted" data-i18n="about\.brand">/, "shown in the About dialog");
  const note = read("../public/brand/README.md");
  assert.ok(note.includes("© Gonçalo Carmo"));
  assert.match(note, /CC BY-SA 4\.0/);
  assert.match(note, /https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\//);
  assert.match(note, /under the GNU AGPL, version 3 or\s+later/, "the symbol drawn in code follows the code's licence");
  assert.match(note, /Name and brand: reserved/);
  assert.match(note, /not upstream \(OpenRadlr\) artwork/);
  for (const file of ["favicon.svg", "gocarmo-ride.svg", "gocarmo-ride-stacked.svg"]) {
    const svg = read(`../public/brand/${file}`);
    assert.ok(svg.includes("GOCARMO artwork © Gonçalo Carmo, licensed under CC BY-SA 4.0"), `${file} carries its notice`);
    assert.ok(svg.includes("its use as a brand are reserved"), file);
  }
  // Nothing in the client claims more: no "all rights reserved", no other holder of the GOCARMO files.
  for (const dictionary of [en, de, pt]) {
    for (const [key, text] of Object.entries(dictionary)) {
      if (key === "about.data") continue; // a third party's required notice (Copernicus), not a claim of this fork
      assert.doesNotMatch(text, /© GOCARMO|all rights reserved|todos os direitos|alle Rechte vorbehalten/i, key);
    }
    assert.doesNotMatch(dictionary["about.data"], /© GOCARMO|todos os direitos|alle Rechte vorbehalten/i);
  }
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

// --- privacy -------------------------------------------------------------------------------
// The privacy text (privacy.* in the dictionaries) states what the code does. These tests pin
// the facts it leans on: when one fails, change the text and the code together.

function* clientSources(dir = new URL("../public/js/", import.meta.url).pathname) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* clientSources(path);
    else if (name.endsWith(".js")) yield path;
  }
}
const server = (file) => read(`../../server/crates/server/src/${file}`);

test("the privacy text is on the page in the three languages, with who to write to", () => {
  const dialog = /<dialog id="privacy"[\s\S]*?<\/dialog>/.exec(html)?.[0] ?? "";
  for (const key of ["privacy.lede", "privacy.who", "privacy.server", "privacy.kept", "privacy.browser", "privacy.cookies", "privacy.strava", "privacy.updated"]) {
    assert.ok(dialog.includes(`data-i18n="${key}"`), `${key} is shown`);
    for (const [name, dictionary] of [["en", en], ["de", de], ["pt", pt]]) assert.ok(dictionary[key]?.length > 10, `${name} ${key}`);
  }
  assert.match(dialog, /<a class="privacy-mail" href="mailto:allez@gocarmo\.com">allez@gocarmo\.com<\/a>/, "the contact gocarmo.com publishes");
  assert.match(dialog, /<a href="https:\/\/gocarmo\.com\/privacidade\/"[^>]*data-i18n="privacy\.site"/);
  assert.match(dialog, /<a id="privacy-link"[^>]*hidden[^>]*data-i18n="privacy\.operator"/, "the operator's own policy, when the server names one");
  assert.match(html, /<footer class="build-line">[\s\S]*?data-privacy-open[\s\S]*?<\/footer>/, "opened from the start screen's foot");
  assert.match(/<dialog id="about"[\s\S]*?<\/dialog>/.exec(html)[0], /data-privacy-open/, "and from About, so from the ride menu too");
  for (const dictionary of [en, de, pt]) assert.ok(dictionary["privacy.who"].includes("GOCARMO (Gonçalo Carmo)"));
  assert.match(pt["privacy.updated"], /12\.11\.2026/);
});

test("privacy, the browser side: only power and cadence go out while riding, no cookie is written, nothing is fetched from elsewhere", () => {
  assert.deepEqual(Object.keys(ClientMessages.telemetry({ power: 200, cadence: 90, heartRate: 150 })).sort(), ["cadence", "power", "type"], "heart rate stays in the browser");
  assert.deepEqual(Object.keys(ClientMessages.join({ name: "Ana", weightKg: 60, ftp: 200, level: 180, publicKey: "k" })).sort(), ["ftp_w", "level_w", "name", "public_key", "type", "weight_kg"], "what a join carries: the text lists each of these");
  const cookies = [];
  const elsewhere = [];
  for (const path of clientSources()) {
    const code = readFileSync(path, "utf8");
    if (/document\.cookie/.test(code)) cookies.push(path);
    if (/\bfetch\(\s*["'`]https?:/.test(code) || /new WebSocket\(\s*["'`]wss?:\/\/[a-z]/.test(code)) elsewhere.push(path);
  }
  assert.deepEqual(cookies, [], "the client writes no cookie");
  assert.deepEqual(elsewhere, [], "the client talks to its own server only");
  assert.match(read("../public/js/analytics.js"), /const analytics = info\?\.analytics;\n {2}if \(!analytics \|\| loaded\.has\(document\)\) return false;/, "no analytics script unless the server lists one (OPENRADLR_ANALYTICS_DOMAIN, unset on this deployment)");
  assert.doesNotMatch(html, /<script[^>]+src="https?:|<link[^>]+href="https?:\/\/(?!github\.com)/, "no script, style or font from another host");
});

test("privacy, Strava in the browser: the notes the text names are the ones the client keeps", () => {
  const keys = new Set();
  for (const path of clientSources()) for (const m of readFileSync(path, "utf8").matchAll(/"(openradlr\.strava-[a-z-]+)\.?"/g)) keys.add(m[1]);
  assert.deepEqual([...keys].sort(), ["openradlr.strava-connect", "openradlr.strava-return", "openradlr.strava-tab", "openradlr.strava-upload"], "a new Strava note in the browser has to be said in privacy.strava");
  assert.match(pt["privacy.strava"], /que atividades já enviaste .*número de atleta.*se a última tentativa de ligar falhou.*com uma atividade à espera/);
  assert.match(en["privacy.strava"], /which rides you have already uploaded .*athlete number.*last attempt to connect failed.*with a ride waiting/);
  assert.match(de["privacy.strava"], /welche Fahrten du schon hochgeladen hast .*Athletennummer.*Verbindungsversuch fehlgeschlagen.*wartenden Fahrt/);
});

test("privacy, the server side: what the text says about logs, memory and the Strava session", () => {
  // "the name you joined with": the one log line with a rider's name.
  const named = [...server("runtime.rs").matchAll(/tracing::\w+!\([^;]*\bname\b[^;]*;/g)].map((m) => m[0]);
  assert.equal(named.length, 1, "privacy.kept names one log line with the rider's name");
  assert.match(named[0], /"rider joined"/);
  // "an IP address is noted only when one address opens too many connections".
  const withIp = [];
  for (const file of ["http.rs", "connection.rs", "runtime.rs", "guard.rs", "app.rs", "auth.rs", "session.rs"]) {
    for (const m of server(file).matchAll(/tracing::\w+!\(([^;]*);/g)) if (/%ip\b|\bip\b|forwarded|peer/.test(m[1])) withIp.push(`${file}: ${m[1].replace(/\s+/g, " ").trim()}`);
  }
  assert.ok(withIp.length >= 1 && withIp.every((line) => /too many connections/.test(line)), `privacy.kept says an IP address reaches the log only on too many connections; found: ${withIp.join(" | ")}`);
  // "after about a minute if the connection just dropped".
  assert.match(server("config.rs"), /reader\.parse\("OPENRADLR_GRACE_S", 60\.0\)/);
  // "the total distance of all riders together, without names".
  assert.match(server("stats.rs"), /pub struct Distance \{\s*#\[serde\(default\)\]\s*pub trainer_m: f64,\s*#\[serde\(default\)\]\s*pub paddle_m: f64,\s*\}/);
  // "a session cookie that lasts 30 days at most"; cookies exist on the Strava routes only.
  assert.match(server("strava.rs"), /pub const SESSION_SECONDS: i64 = 30 \* 24 \* 3600;/);
  for (const file of ["http.rs", "connection.rs", "runtime.rs", "session.rs", "app.rs", "headers.rs"]) assert.doesNotMatch(server(file), /SET_COOKIE/, `${file} sets no cookie`);
  // "Your browser also sends a public key …; the server ignores it": no use of it beyond the message definition.
  assert.equal([...server("session.rs").matchAll(/public_key/g)].length, 0);
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

test("the studio's built-in cues are said in the rider's language; an unknown cue is shown as sent", () => {
  // Every cue the server's built-in classes can send (server/crates/sim/src/studio.rs) is known to the client.
  const source = read("../../server/crates/sim/src/studio.rs");
  const builtin = source.slice(source.indexOf("pub fn builtin_classes()"), source.indexOf("pub struct StudioConfig"));
  // A cue is the last argument of segment(…)/steady(…): a string followed by the closing bracket.
  const cues = [...builtin.matchAll(/"([^"]+)"\)/g)].map((m) => m[1]);
  assert.match(source, /steady\(off\.0, off\.1, off\.2, "Easy, breathe"\)/);
  cues.push("Easy, breathe");
  assert.equal(new Set(cues).size, KNOWN_CUES.length, `the server's classes have ${new Set(cues).size} cues, the client knows ${KNOWN_CUES.length}`);
  for (const cue of cues) assert.ok(KNOWN_CUES.includes(cue), `the client has no translation for the server's cue "${cue}"`);
  assert.match(source, /format!\("Go! Interval \{i\} of \{repeat\}"\)/, "the interval cue the client's pattern reads");
  setLocale("en");
  for (const cue of KNOWN_CUES) assert.equal(cueText(cue), cue, "English stays as the server wrote it");
  assert.equal(cueText("Go! Interval 5 of 8"), "Go! Interval 5 of 8");
  setLocale("pt");
  assert.equal(cueText("Warm up and find your rhythm"), "Aquece e encontra o teu ritmo");
  assert.equal(cueText("Go! Interval 5 of 8"), "Vai. Intervalo 5 de 8");
  assert.equal(cueText("Cool down, well done!"), "Arrefece. Bom trabalho.");
  for (const cue of KNOWN_CUES) assert.notEqual(cueText(cue), cue, `"${cue}" reads in Portuguese`);
  assert.equal(cueText("Volta ao sol: 3 minutos"), "Volta ao sol: 3 minutos", "an operator's own class keeps its words");
  const plan = { id: "x", name: "X", segments: [{ duration_s: 60, from: 0.5, to: 0.5, cadence: [85, 95], cue: "Recover, spin it out" }, { duration_s: 60, from: 0.8, to: 0.8, cadence: null, cue: "Settle into tempo" }] };
  assert.equal(classPosition(plan, 10).cue, "Recupera, pedala solto");
  assert.equal(classWorkout(plan).segments[1].label, "Entra no ritmo de tempo");
  setLocale("de");
  assert.equal(cueText("Go! Interval 2 of 6"), "Los! Intervall 2 von 6");
});

test("a rider on phone paddles is marked without an emoji, in every language", () => {
  for (const [name, dictionary] of [["en", en], ["de", de], ["pt", pt]]) {
    for (const key of ["menu.server.withPhones", "menu.riders.withPhones", "panels.paddleShort", "panels.paddleTitle"]) {
      assert.doesNotMatch(dictionary[key], /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${name} ${key}`);
    }
  }
  setLocale("pt");
  assert.equal(riderName({ id: 2, name: "Rita", device: "paddle" }), "Rita · telemóvel");
  assert.equal(riderName({ id: 3, name: "Rui" }), "Rui");
  setLocale("en");
  assert.equal(riderName({ id: 2, name: "Rita", device: "paddle" }), "Rita · phone");
  for (const file of ["../public/js/view/panels.js", "../public/js/view3d/view3d.js", "../public/js/view/startMenu.js"]) {
    assert.doesNotMatch(read(file), /[\u{1F000}-\u{1FAFF}]/u, `${file}: the badge is drawn by the stylesheet`);
  }
  assert.match(read("../public/styles.css"), /\.badge\.badge-paddle,\n\.label3d \.badge\.badge-paddle \{/);
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
