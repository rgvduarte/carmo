// "Always send to Strava at the end": a finished ride on a real trainer goes to Strava by itself after a
// 10-second countdown the rider can cancel, through the same upload as the button; never a ride that is not
// eligible, never without an account, never again after an upload whose outcome is uncertain.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { finishPlan } from "../public/js/ride/finishPlan.js";
import { AUTO_SEND_SECONDS, bindStravaUpload } from "../public/js/view/stravaUploadView.js";
import { UploadReceipts } from "../public/js/net/stravaUpload.js";
import { DEFAULT_PROFILE, ProfileStore } from "../public/js/profile/profileStore.js";
import { t } from "../public/js/i18n/i18n.js";
import en from "../public/js/i18n/en.js";
import de from "../public/js/i18n/de.js";
import pt from "../public/js/i18n/pt.js";

const account = { athlete_id: 7, can_upload: true };
const ride = { empty: false, exportable: true, measured: true, stravaEnabled: true, stravaLimited: false, account, connectFailed: false, autoSend: true };
const plan = (changes = {}) => finishPlan({ ...ride, ...changes });

function element() {
  const listeners = new Map();
  return { hidden: false, disabled: false, textContent: "", dataset: {}, focused: 0, setAttribute() {}, focus() { this.focused += 1; },
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    click: (event) => listeners.get("click")?.(event),
  };
}
const elements = () => Object.fromEntries(["panel", "account", "status", "detail", "action", "connect", "activity", "storage", "note", "countdown", "countdownText", "cancel"].map((name) => [name, element()]));

/** setInterval that only moves when the test says so. */
function fakeClock() {
  const timers = new Map();
  let next = 1;
  return {
    setInterval: (fn) => { timers.set(next, fn); return next++; },
    clearInterval: (id) => timers.delete(id),
    tick(times = 1) { for (let i = 0; i < times; i += 1) for (const fn of [...timers.values()]) fn(); },
    get running() { return timers.size; },
  };
}
const memoryReceipts = () => new UploadReceipts({ storage: { getItem: () => null, setItem() {} } });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function bind({ autoSend = true, receipts = memoryReceipts(), client, who = account } = {}) {
  const els = elements();
  const clock = fakeClock();
  const calls = [];
  const upload = client ?? { upload: async (file, name, query) => { calls.push({ file, name, query }); return { id: 9, activity_id: 77 }; } };
  const binding = bindStravaUpload({ elements: els, client: upload, receipts, key: "7:1", account: who, makeFile: () => "fit", name: "GOCARMO Ride · Serra", query: { kind: "route", start: 1, route: "serra" }, autoSend, clock });
  return { els, clock, calls, binding, receipts };
}

test("the setting is on by default and kept with the rider's profile", () => {
  assert.equal(DEFAULT_PROFILE.stravaAutoSend, true);
  const data = new Map();
  const store = new ProfileStore({ storage: { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) } });
  assert.equal(store.load().stravaAutoSend, true);
  store.save({ ...store.load(), stravaAutoSend: false });
  assert.equal(store.load().stravaAutoSend, false);
  // A profile saved before the setting existed gets it on.
  data.set("openride.profile.v1", JSON.stringify({ name: "Ana", ftp: 250 }));
  assert.equal(store.load().stravaAutoSend, true);
});

test("connected, on a real trainer, not sent yet: the plan sends by itself; switched off it does not", () => {
  assert.equal(plan().auto, true);
  assert.equal(plan({ autoSend: false }).auto, false);
  assert.equal(plan({ autoSend: false }).mode, "send");
});

test("the countdown shows the seconds left, then uploads the same way as the button", async () => {
  const { els, clock, calls, binding } = bind();
  assert.equal(AUTO_SEND_SECONDS, 10);
  assert.equal(els.countdown.hidden, false);
  assert.equal(els.countdownText.textContent, t("strava.auto.countdown", { s: 10 }));
  assert.equal(els.action.hidden, true, "the countdown line stands in for the button");
  assert.equal(els.note.hidden, false, "the name and description it goes with are said");
  clock.tick(3);
  assert.equal(els.countdownText.textContent, t("strava.auto.countdown", { s: 7 }));
  assert.equal(calls.length, 0);
  clock.tick(7);
  await flush();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { file: "fit", name: "GOCARMO Ride · Serra", query: { kind: "route", start: 1, route: "serra" } });
  assert.equal(binding.state.phase, "success");
  assert.equal(els.countdown.hidden, true);
  assert.equal(clock.running, 0);
  clock.tick(20);
  await flush();
  assert.equal(calls.length, 1, "one upload only");
});

test("cancel stops the countdown and leaves the button to send by hand", async () => {
  const { els, clock, calls, binding } = bind();
  clock.tick(4);
  els.cancel.click();
  assert.equal(binding.counting, false);
  assert.equal(els.countdown.hidden, true);
  assert.equal(els.action.hidden, false);
  assert.equal(els.action.textContent, t("strava.send"));
  assert.equal(els.action.focused, 1);
  clock.tick(20);
  await flush();
  assert.equal(calls.length, 0);
  // The button still works.
  await els.action.click();
  assert.equal(calls.length, 1);
});

test("switching the setting off during the countdown stops it", async () => {
  const { els, clock, calls, binding } = bind();
  binding.cancelAuto();
  clock.tick(20);
  await flush();
  assert.equal(calls.length, 0);
  assert.equal(els.action.hidden, false);
});

test("pressing the button during the countdown sends once", async () => {
  const { els, clock, calls } = bind();
  await els.action.click();
  clock.tick(20);
  await flush();
  assert.equal(calls.length, 1);
});

test("leaving the finished ride ends the countdown", async () => {
  const { clock, calls, binding } = bind();
  binding.dispose();
  assert.equal(clock.running, 0);
  clock.tick(20);
  await flush();
  assert.equal(calls.length, 0);
});

test("ineligible rides are never sent: simulated trainer, phone paddles, too short, Strava off", () => {
  for (const changes of [{ measured: false }, { exportable: false }, { empty: true }, { stravaEnabled: false }]) {
    const p = plan(changes);
    assert.equal(p.auto, false, JSON.stringify(changes));
    assert.equal(p.strava, false, JSON.stringify(changes));
  }
});

test("without a connected account nothing counts down", () => {
  for (const changes of [{ account: null }, { account: null, stravaOwnerOnly: true }, { account: null, stravaLimited: true }, { account: { ...account, can_upload: false } }, { code: "not_connected" }]) {
    assert.equal(plan(changes).auto, false, JSON.stringify(changes));
  }
  const { els, clock, calls } = bind({ who: null });
  assert.equal(els.countdown.hidden, true);
  assert.equal(clock.running, 0);
  assert.equal(calls.length, 0);
});

test("a ride already sent, failed or uncertain is never sent by itself", () => {
  for (const phase of ["uploading", "processing", "pending", "check-failed", "uncertain", "failed", "rejected", "success"]) {
    assert.equal(plan({ phase }).auto, false, phase);
  }
  const receipts = memoryReceipts();
  receipts.save("7:1", { phase: "uncertain", uploadId: null, activityId: null });
  const { els, clock } = bind({ receipts });
  assert.equal(clock.running, 0);
  assert.equal(els.countdown.hidden, true);
  assert.equal(els.action.textContent, t("strava.action.again"));
});

test("an uncertain failure of the automatic upload is not posted again", async () => {
  let posts = 0;
  const client = { upload: async () => { posts += 1; throw Object.assign(new Error("connection lost"), { status: 0 }); } };
  const { els, clock, binding } = bind({ client });
  clock.tick(10);
  await flush();
  assert.equal(posts, 1);
  assert.equal(binding.state.phase, "uncertain");
  assert.equal(clock.running, 0);
  clock.tick(30);
  await flush();
  assert.equal(posts, 1);
  assert.equal(els.countdown.hidden, true);
  assert.equal(els.action.textContent, t("strava.action.again"));
});

test("the setting is in the start screen's Strava block and in the finish dialog, in plain words", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  assert.match(html, /id="account"[\s\S]*?id="strava-auto-line"[\s\S]*?id="strava-auto"/);
  assert.match(html, /id="finish-strava"[\s\S]*?id="finish-strava-countdown"[\s\S]*?id="finish-strava-cancel"[\s\S]*?id="finish-strava-auto"/);
  assert.equal(pt["strava.auto.setting"], "Enviar sempre para o Strava no fim");
  assert.equal(en["strava.auto.setting"], "Always send to Strava at the end");
  assert.ok(de["strava.auto.setting"]);
  // Strava's API cannot take photos: nothing here promises the image goes there.
  for (const dict of [pt, en, de]) {
    for (const key of ["strava.auto.setting", "strava.auto.countdown", "strava.auto.cancel"]) {
      assert.doesNotMatch(dict[key], /imag|foto|photo|bild/i, key);
    }
  }
});

test("the consent next to the connect button says the send is automatic and how to stop it", () => {
  for (const [dict, auto, cancel] of [[pt, /sozinha/, /«Cancelar»/], [en, /by itself/, /“Cancel”/], [de, /von selbst/, /„Abbrechen“/]]) {
    assert.match(dict["strava.consent"], auto);
    assert.match(dict["strava.consent"], cancel);
    assert.ok(dict["strava.consent"].includes(dict["strava.auto.setting"]), "names the setting");
    assert.match(dict["strava.consent"], new RegExp(String(AUTO_SEND_SECONDS)));
  }
});
