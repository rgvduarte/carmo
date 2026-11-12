// A refusal from the server reaches the rider in the rider's language, never as the server's English words.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { KNOWN_SERVER_ERRORS, serverErrorLine } from "../public/js/net/serverErrors.js";
import { vehicleErrorLine } from "../public/js/ride/vehicle.js";
import { setLocale, t } from "../public/js/i18n/i18n.js";

const SERVER = new URL("../../server/crates/server/src/", import.meta.url);
/** Codes the page answers in its own way, not with a line: the AFK prompt, the workout, a refused turn, the studio's exercises. */
const HANDLED_ELSEWHERE = new Set(["afk_timeout", "turn_rejected", "unknown_exercise", "unknown_side", "in_workout", "not_in_workout", "vehicle_elsewhere"]);

function serverCodes() {
  const codes = new Set();
  for (const file of readdirSync(SERVER).filter((name) => name.endsWith(".rs"))) {
    const source = readFileSync(new URL(file, SERVER), "utf8");
    for (const [, code] of source.matchAll(/ServerMessage::error\(\s*"([a-z_]+)"/g)) codes.add(code);
    for (const [, code] of source.matchAll(/(?:JoinError|WorldError)::\w+(?: \{[^}]*\})? => "([a-z_]+)"/g)) codes.add(code);
  }
  return codes;
}

test("every refusal the server sends has a line of its own in the rider's language", () => {
  const codes = serverCodes();
  for (const code of ["server_full", "invalid_name", "unknown_route", "race_rejected", "chat_rate_limited"]) assert.ok(codes.has(code), `the scan finds ${code}`);
  for (const code of codes) {
    if (HANDLED_ELSEWHERE.has(code)) continue;
    assert.ok(KNOWN_SERVER_ERRORS.includes(code) || vehicleErrorLine(code) !== null, `${code} has no line`);
  }
});

test("the lines are the rider's language, not the server's words", () => {
  setLocale("pt");
  try {
    assert.equal(serverErrorLine("server_full", "the server is full"), "O servidor está cheio. Tenta daqui a pouco.");
    assert.doesNotMatch(serverErrorLine("server_full", "the server is full"), /server_full|the server is full/);
    assert.equal(serverErrorLine("race_rejected", "you can only join a race during its countdown"), t("net.error.raceNotOpen"));
    assert.equal(serverErrorLine("race_rejected", "a race is already in progress"), t("net.error.raceRunning"));
    assert.equal(serverErrorLine("race_rejected", "laps must be between 1 and 20"), t("net.error.raceRejected"));
    assert.equal(serverErrorLine("something_new", "x"), "O servidor recusou: something_new");
    assert.equal(serverErrorLine(undefined), null, "no code: the network's own message stays");
  } finally {
    setLocale("en");
  }
});
