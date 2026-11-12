// The finish dialog's state machine: which way to Strava is in front for a
// finished ride, which is kept as the other way, and which button is the main one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { finishPlan } from "../public/js/ride/finishPlan.js";
import { ConnectMemory, STRAVA_UPLOAD_PAGE, stravaLimited } from "../public/js/net/strava.js";
import en from "../public/js/i18n/en.js";
import de from "../public/js/i18n/de.js";
import pt from "../public/js/i18n/pt.js";

const account = { athlete_id: 7, name: "Rider", can_upload: true };
/** A ride on a real trainer, on a server with Strava whose application is past its athlete limit. */
const ride = { empty: false, exportable: true, measured: true, stravaEnabled: true, stravaLimited: false, account: null, connectFailed: false };
const plan = (changes) => finishPlan({ ...ride, ...changes });

test("connected and allowed: sending is the main button, the file by hand is folded away", () => {
  const p = plan({ account });
  assert.deepEqual([p.mode, p.strava, p.manual, p.primary, p.reason], ["send", true, "folded", "upload", null]);
  assert.equal(p.files && p.image, true);
  for (const phase of ["uploading", "processing", "pending"]) assert.equal(plan({ account, phase }).manual, "folded");
});

test("once sent, the image is what is left to do", () => {
  const p = plan({ account, phase: "success" });
  assert.deepEqual([p.mode, p.strava, p.primary], ["sent", true, "image"]);
});

test("not connected, with room at Strava: connecting is in front, the file by hand open beside it", () => {
  const p = plan({});
  assert.deepEqual([p.mode, p.strava, p.manual, p.primary], ["connect", true, "open", "connect"]);
});

test("not connected under Strava's athlete limit: the .fit file is the main action, connecting is still offered", () => {
  const p = plan({ stravaLimited: true });
  assert.deepEqual([p.mode, p.strava, p.manual, p.primary, p.reason], ["manual", true, "main", "fit", "finish.reason.limited"]);
});

test("after a failed attempt to connect, the file goes in front and the reason says what happened", () => {
  const p = plan({ connectFailed: true });
  assert.deepEqual([p.mode, p.manual, p.primary, p.reason], ["manual", "main", "fit", "finish.reason.connectFailed"]);
  assert.equal(plan({ connectFailed: true, account }).mode, "send", "a rider who is connected now is not held to an old failure");
});

test("Strava switched off on the server: the file by hand is the only way, with no Strava panel", () => {
  const p = plan({ stravaEnabled: false, account });
  assert.deepEqual([p.mode, p.strava, p.manual, p.primary, p.reason], ["manual", false, "main", "fit", "finish.reason.stravaOff"]);
});

test("connected without the permission to upload: connect again, nothing is sent", () => {
  assert.deepEqual([plan({ account: { ...account, can_upload: false } }).mode, plan({ account, phase: "failed", code: "upload_not_allowed" }).mode], ["reconnect", "reconnect"]);
  assert.equal(plan({ account: { ...account, can_upload: false } }).primary, "connect");
});

test("the session was lost (the server restarted): connect again, with the file by hand in the open", () => {
  const p = plan({ account, phase: "failed", code: "not_connected" });
  assert.deepEqual([p.mode, p.strava, p.manual, p.primary], ["reconnect", true, "open", "connect"]);
  assert.equal(plan({ account, phase: "check-failed", code: "not_connected" }).mode, "reconnect");
});

test("an upload that failed, was rejected or went unanswered opens the file by hand, and sending stays possible", () => {
  for (const phase of ["failed", "rejected", "uncertain", "check-failed"]) {
    const p = plan({ account, phase });
    assert.deepEqual([p.mode, p.manual, p.primary], ["send", "open", "upload"], phase);
  }
});

test("a ride on the simulated trainer is not sent to Strava and is not told how to upload it by hand", () => {
  for (const changes of [{ account }, { stravaEnabled: false }, { stravaLimited: true }]) {
    const p = plan({ measured: false, ...changes });
    assert.deepEqual([p.mode, p.strava, p.manual, p.files, p.image, p.primary, p.reason], ["simulated", false, "none", true, true, "image", "finish.note.simulated"]);
  }
});

test("a ride on phone paddles has no files and no Strava, only its image", () => {
  const p = plan({ exportable: false, measured: false, account });
  assert.deepEqual([p.mode, p.strava, p.manual, p.files, p.image, p.primary, p.reason], ["paddle", false, "none", false, true, "image", "finish.note.paddle"]);
});

test("a ride too short to keep offers nothing but the reason", () => {
  const p = plan({ empty: true, account });
  assert.deepEqual([p.mode, p.strava, p.manual, p.files, p.image, p.primary, p.reason], ["empty", false, "none", false, false, null, "finish.note.tooShort"]);
});

test("no plan has a main button for something it does not show", () => {
  const accounts = [null, account, { ...account, can_upload: false }];
  const phases = ["idle", "uploading", "processing", "pending", "check-failed", "uncertain", "success", "rejected", "failed"];
  for (const empty of [true, false]) for (const exportable of [true, false]) for (const measured of [true, false]) for (const stravaEnabled of [true, false]) for (const limited of [true, false]) for (const who of accounts) for (const connectFailed of [true, false]) for (const phase of phases) for (const code of [null, "not_connected", "upload_not_allowed"]) {
    const p = finishPlan({ empty, exportable, measured, stravaEnabled, stravaLimited: limited, account: who, connectFailed, phase, code });
    const where = JSON.stringify({ empty, exportable, measured, stravaEnabled, limited, who: who && who.can_upload, connectFailed, phase, code });
    if (p.primary === "upload" || p.primary === "connect") assert.ok(p.strava, where);
    if (p.primary === "fit") assert.ok(p.files && p.manual === "main", where);
    if (p.primary === "image") assert.ok(p.image, where);
    if (p.manual !== "none") assert.ok(p.files && measured, `the file by hand is only for rides Strava would take: ${where}`);
    if (p.strava) assert.ok(stravaEnabled && measured && exportable && !empty, where);
    if (p.reason) for (const dictionary of [en, de, pt]) assert.ok(dictionary[p.reason], `${p.reason} is a text in every language`);
  }
});

test("the reasons say plainly what Strava allows, in the three languages", () => {
  for (const dictionary of [en, de, pt]) {
    assert.match(dictionary["finish.reason.limited"], /\.fit/);
    assert.match(dictionary["finish.reason.limited"], /limit|begrenzt/i);
    assert.match(dictionary["finish.reason.connectFailed"], /\.fit/);
    assert.match(dictionary["finish.reason.stravaOff"], /\.fit/);
    assert.match(dictionary["strava.msg.failed"], /strava\.com\/upload\/select/);
    // Strava's API takes no pictures: the image is added by the rider, and no text promises otherwise.
    assert.match(dictionary["photos.stravaHint"], /Strava/);
    for (const [key, text] of Object.entries(dictionary)) assert.doesNotMatch(text, /(adds?|attach\w*|junta|anexa|hängt|fügt) (the image|a imagem|das Bild) (automatically|automaticamente|automatisch)/i, key);
  }
  assert.match(pt["photos.stravaHint"], /não deixa as aplicações juntar fotografias/);
  assert.match(pt["finish.note.simulated"], /simulador/);
  assert.equal(STRAVA_UPLOAD_PAGE, "https://www.strava.com/upload/select");
});

test("the athlete limit is assumed until the server says the application is past it", () => {
  assert.equal(stravaLimited(null), true);
  assert.equal(stravaLimited({ strava: { enabled: true, required: false } }), true);
  assert.equal(stravaLimited({ strava: { enabled: true, limited: true } }), true);
  assert.equal(stravaLimited({ strava: { enabled: true, limited: false } }), false);
});

function store() {
  const map = new Map();
  return { map, getItem: (key) => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), removeItem: (key) => map.delete(key) };
}

test("a failed attempt to connect is remembered until the account connects; a cancelled one is not a failure", () => {
  const memory = new ConnectMemory({ local: store(), session: store() });
  assert.equal(memory.failed, false);
  memory.record("denied");
  memory.record("expired");
  memory.record(null);
  assert.equal(memory.failed, false);
  memory.record("failed");
  assert.equal(memory.failed, true);
  assert.equal(new ConnectMemory({ local: memory.local, session: store() }).failed, true, "it outlives the tab");
  memory.record("connected");
  assert.equal(memory.failed, false);
});

test("a finished ride waiting for the sign-in is opened again once, in the same tab", () => {
  const session = store();
  const memory = new ConnectMemory({ local: store(), session });
  assert.equal(memory.takeReturn(), false);
  memory.leaveWithRide();
  assert.equal(new ConnectMemory({ local: store(), session }).takeReturn(), true);
  assert.equal(memory.takeReturn(), false, "only once");
});

test("a browser without storage remembers nothing and breaks nothing", () => {
  const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
  const memory = new ConnectMemory({ local: broken, session: broken });
  memory.record("failed");
  memory.leaveWithRide();
  assert.equal(memory.failed, false);
  assert.equal(memory.takeReturn(), false);
});

test("the tab a framed game opened for the sign-in knows it once, and only for a while", () => {
  const local = store();
  const game = new ConnectMemory({ local, session: store() });
  const tab = new ConnectMemory({ local, session: store() });
  assert.equal(tab.takeTab(1000), false, "a tab nobody opened for a sign-in");
  game.openedTab(1000);
  assert.equal(tab.takeTab(1000 + 60_000), true);
  assert.equal(tab.takeTab(1000 + 61_000), false, "only once");
  game.openedTab(1000);
  assert.equal(tab.takeTab(1000 + 16 * 60_000), false, "an old mark is not a sign-in in progress");
});
