// pt.js (European Portuguese, GOCARMO Ride) must mirror en.js, read as pt-PT and keep the house rules.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import en from "../public/js/i18n/en.js";
import pt from "../public/js/i18n/pt.js";
import { SUPPORTED_LOCALES, detectLocale, intlLocale, setLocale, t, tn } from "../public/js/i18n/i18n.js";
import { languageOptions } from "../public/js/i18n/selector.js";
import { serverStatus, routeRiders, stageHeadline } from "../public/js/view/startMenu.js";
import { raceStatus } from "../public/js/view/panels.js";
import { formatNumber } from "../public/js/util/format.js";
import { vehicleLabel } from "../public/js/ride/vehicle.js";
import { APP_NAME } from "../public/js/brand.js";

afterEach(() => setLocale("en"));

const params = (text) => [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

test("pt has every en key and no other", () => {
  assert.deepEqual(Object.keys(en).filter((key) => !(key in pt)), []);
  assert.deepEqual(Object.keys(pt).filter((key) => !(key in en)), []);
});

test("every key uses the same {params} in Portuguese", () => {
  assert.deepEqual(Object.keys(en).filter((key) => key in pt && params(en[key]).join() !== params(pt[key]).join()), []);
});

test("plural groups define .one and .other in Portuguese", () => {
  const groups = new Set(Object.keys(pt).filter((key) => /\.(one|other)$/.test(key)).map((key) => key.replace(/\.(one|other)$/, "")));
  assert.deepEqual([...groups].filter((group) => !(`${group}.one` in pt && `${group}.other` in pt)), []);
});

test("fragments keep their leading and trailing spaces, lists their line count", () => {
  const edge = (text) => `${text.startsWith(" ")}|${text.endsWith(" ")}|${text.split("\n").length}`;
  assert.deepEqual(Object.keys(en).filter((key) => edge(en[key]) !== edge(pt[key])), []);
});

test("a sentence is never left in English: what is the same in both languages is a name, a unit or a symbol", () => {
  const same = Object.keys(en).filter((key) => en[key] === pt[key]);
  const sentences = same.filter((key) => en[key].replace(/\{\w+\}/g, "").trim().split(/\s+/).filter((word) => /[a-z]{3}/i.test(word)).length > 2);
  assert.deepEqual(sentences, []);
});

test("a browser in any Portuguese gets Portuguese; the others keep their language", () => {
  assert.ok(SUPPORTED_LOCALES.includes("pt"));
  assert.equal(detectLocale({ languages: ["pt-PT", "en"] }), "pt");
  assert.equal(detectLocale({ languages: ["pt-BR"] }), "pt");
  assert.equal(detectLocale({ languages: ["pt"] }), "pt");
  assert.equal(detectLocale({ languages: ["fr", "pt-PT"] }), "pt");
  assert.equal(detectLocale({ languages: ["de-DE", "pt-PT"] }), "de");
  assert.equal(detectLocale({ saved: "en", languages: ["pt-PT"] }), "en");
  assert.deepEqual(languageOptions("pt").find((option) => option.selected), { code: "pt", label: "Português", selected: true });
});

test("Portuguese counts, numbers and the page language follow Portugal, not Brazil", () => {
  setLocale("pt");
  assert.equal(intlLocale(), "pt-PT");
  assert.equal(tn("menu.riders", 0), "0 ciclistas");
  assert.equal(tn("menu.riders", 1), "1 ciclista");
  assert.equal(tn("menu.riders", 2), "2 ciclistas");
  assert.equal(formatNumber(41.9, 1), "41,9");
  setLocale("de");
  assert.equal(intlLocale(), "de");
});

test("the start screen and the race line read in Portuguese", () => {
  setLocale("pt");
  assert.equal(serverStatus({ players: 3, max_players: 50 }).text, "3 ciclistas online · lugar para mais 47");
  assert.equal(serverStatus(null).text, "Servidor inacessível");
  assert.equal(routeRiders({ players: 3, phone_players: 1 }), "3 ciclistas · 1 no telemóvel");
  assert.equal(stageHeadline({ kind: "workout" }), "Escolhe o teu treino");
  assert.equal(raceStatus({ phase: "countdown", remaining_s: 9, laps: 3 }), "A corrida começa em 9 s · 3 voltas");
  assert.equal(vehicleLabel("tandem", "Ana"), "Tandem de Ana");
  assert.equal(t("menu.join.route", { name: "Rolling Hills" }), "Pedalar em Rolling Hills");
});

test("each bundled route has a Portuguese description", () => {
  const dir = new URL("../../routes/", import.meta.url);
  const ids = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(new URL(f, dir), "utf8")).id);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    assert.ok(pt[`route.${id}.description`], `pt route.${id}.description`);
    assert.notEqual(pt[`route.${id}.description`], en[`route.${id}.description`], `pt route.${id}.description is still English`);
  }
});

test("house rules of the Portuguese text: calm voice, no emoji, no other product's name", () => {
  const offenders = [];
  for (const [key, text] of Object.entries(pt)) {
    if (text.includes("!")) offenders.push(`${key}: exclamation mark`);
    if (/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(text.replace(/[✓]/g, ""))) offenders.push(`${key}: emoji`);
    if (/zwift/i.test(text)) offenders.push(`${key}: Zwift`);
    if (/\b(paixão|sonho|jornada|incrível)\b/i.test(text)) offenders.push(`${key}: hype word`);
    if (/\bkona\b/i.test(text)) offenders.push(`${key}: Kona`);
  }
  assert.deepEqual(offenders, []);
});

test("the upstream name shows only in the credits, the fork's name everywhere else", () => {
  for (const dictionary of [en, pt]) {
    const named = Object.keys(dictionary).filter((key) => /openradlr/i.test(dictionary[key]));
    assert.deepEqual(named, ["about.short", "about.credit", "about.modified"]);
    assert.ok(dictionary["about.credit"].includes("© The OpenRadlr contributors"), "the copyright notice stays as upstream wrote it");
    assert.ok(dictionary["about.credit"].includes("AGPL-3.0"));
    assert.ok(dictionary["about.credit"].startsWith(APP_NAME));
  }
  assert.equal(APP_NAME, "GOCARMO Ride");
});
