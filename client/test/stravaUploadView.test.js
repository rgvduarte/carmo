import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadPresentation, bindStravaUpload } from "../public/js/view/stravaUploadView.js";
import { UploadReceipts } from "../public/js/net/stravaUpload.js";
import { t } from "../public/js/i18n/i18n.js";

const account = { athlete_id: 7, name: "Rider", can_upload: true };
const state = (phase, extra = {}) => ({ phase, persisted: true, ...extra });

test("pending processing offers a status check rather than upload", () => {
  const view = uploadPresentation(state("pending", { uploadId: 9 }), account);
  assert.equal(view.action, t("strava.action.check"));
  assert.equal(view.busy, false);
});

test("success replaces upload with an activity link without repeating image instructions", () => {
  const view = uploadPresentation(state("success", { activityId: 77 }), account);
  assert.equal(view.action, null);
  assert.equal(view.activity, "https://www.strava.com/activities/77");
  assert.equal(view.detail, "");
});

test("a disconnected account gets a connect action", () => {
  assert.equal(uploadPresentation(state("idle"), null).connect, true);
});

test("a missing upload permission gets a reconnect action", () => {
  const view = uploadPresentation(state("idle"), { ...account, can_upload: false });
  assert.equal(view.connect, true);
  assert.equal(view.action, null);
  assert.match(view.detail, /permission/);
});

test("an expired session during polling offers reconnect without reposting", () => {
  const view = uploadPresentation(state("check-failed", { uploadId: 9, code: "not_connected" }), account);
  assert.equal(view.connect, true);
  assert.equal(view.action, null);
});

test("an ambiguous submission explains the duplicate risk and links to Strava", () => {
  const view = uploadPresentation(state("uncertain"), account);
  assert.match(view.detail, /before uploading again/);
  assert.equal(view.activity, "https://www.strava.com/athlete/training");
});

function element() {
  const listeners = new Map();
  return { hidden: false, disabled: false, textContent: "", dataset: {}, setAttribute() {},
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name) => listeners.delete(name),
    click: (event) => listeners.get("click")?.(event),
  };
}
function elements() {
  return Object.fromEntries(["panel", "account", "status", "detail", "action", "connect", "activity", "storage"].map((name) => [name, element()]));
}

test("a detached view never calls its saved callback for a late response", async () => {
  const els = elements();
  let resolve;
  let saved = 0;
  const client = { upload: () => new Promise((r) => { resolve = r; }) };
  const receipts = new UploadReceipts({ storage: { getItem: () => null, setItem() {} } });
  const binding = bindStravaUpload({ elements: els, client, receipts, key: "7:1", account, makeFile: () => "fit", name: "ride", onSuccess: () => saved++ });
  const running = els.action.click();
  binding.dispose();
  resolve({ id: 9, activity_id: 77 });
  await running;
  assert.equal(saved, 0);
  assert.equal(receipts.load("7:1").activityId, 77);
});

test("a new view restores the success link without a fresh upload", () => {
  const els = elements();
  const receipts = new UploadReceipts({ storage: { getItem: () => null, setItem() {} } });
  receipts.save("7:1", { phase: "success", uploadId: 9, activityId: 77 });
  const binding = bindStravaUpload({ elements: els, client: {}, receipts, key: "7:1", account });
  assert.equal(els.activity.href, "https://www.strava.com/activities/77");
  assert.equal(els.activity.hidden, false);
  assert.equal(els.action.hidden, true);
  binding.dispose();
});

test("a freshly connected account can resume a status check after OAuth", () => {
  const els = elements();
  const receipts = new UploadReceipts({ storage: { getItem: () => null, setItem() {} } });
  receipts.save("7:1", { phase: "check-failed", uploadId: 9, activityId: null, code: "not_connected" });
  const binding = bindStravaUpload({ elements: els, client: {}, receipts, key: "7:1", account });
  assert.equal(els.connect.hidden, true);
  assert.equal(els.action.textContent, t("strava.action.retryCheck"));
  binding.dispose();
});


test("a ready upload needs only the account and action", () => {
  const view = uploadPresentation(state("idle"), account);
  assert.equal(view.status, "");
  assert.equal(view.detail, "");
  assert.equal(view.action, t("strava.send"));
});

test("processing puts a spinner and progress label on the action", () => {
  const view = uploadPresentation(state("processing"), account);
  assert.equal(view.spinner, true);
  assert.equal(view.action, t("strava.state.processing"));
});

test("success says so in words and links to the activity with Strava's own wording", () => {
  const view = uploadPresentation(state("success", { activityId: 77 }), account);
  assert.equal(view.status, t("strava.state.success"));
  assert.equal(view.activityLabel, "View on Strava");
  assert.equal(view.tone, "success");
});

test("a session the server lost says so, offers to connect again and submits nothing", () => {
  const view = uploadPresentation(state("failed", { code: "not_connected" }), account);
  assert.equal(view.connect, true);
  assert.equal(view.action, null);
  assert.equal(view.status, t("strava.state.sessionLost"));
  assert.match(view.detail, /stays saved in this browser/);
  // A rider who never connected is not told about a lost session.
  assert.equal(uploadPresentation(state("idle"), null).status, "");
});

test("a failed check keeps retrying on the same error action", () => {
  const view = uploadPresentation(state("check-failed", { uploadId: 9 }), account);
  assert.equal(view.action, t("strava.action.retryCheck"));
  assert.equal(view.tone, "error");
});

test("a rejected upload says it failed, why, and where to look on Strava", () => {
  const view = uploadPresentation(state("rejected", { error: "duplicate" }), account);
  assert.equal(view.status, t("strava.state.rejected"));
  assert.equal(view.activityLabel, "View on Strava");
  assert.equal(view.activity, "https://www.strava.com/athlete/training");
  assert.equal(view.tone, "error");
  assert.match(view.detail, /duplicate/);
});

test("the panel shows the upload in words: status and detail are text on the page, not tooltips", () => {
  const els = elements();
  const receipts = new UploadReceipts({ storage: { getItem: () => null, setItem() {} } });
  receipts.save("7:1", { phase: "failed", uploadId: null, activityId: null, error: "nope" });
  const states = [];
  const binding = bindStravaUpload({ elements: els, client: {}, receipts, key: "7:1", account, onState: (s) => states.push(s.phase) });
  assert.equal(els.status.textContent, t("strava.state.failed"));
  assert.equal(els.status.hidden, false);
  assert.equal(els.detail.textContent, t("strava.failedHint"));
  assert.equal(els.detail.hidden, false);
  assert.equal(els.account.textContent, "Connected to Strava as Rider");
  assert.equal(els.connect.hidden, true);
  assert.deepEqual(states, ["failed"], "the dialog hears each state, to plan its buttons again");
  binding.dispose();
});

test("the upload row uses the native sign-in callback instead of navigating the web view", async () => {
  const els = elements();
  let signedIn = 0;
  let prevented = false;
  const binding = bindStravaUpload({ elements: els, account: null, onConnect: async () => { signedIn++; } });
  await els.connect.click({ preventDefault: () => { prevented = true; } });
  assert.equal(signedIn, 1);
  assert.equal(prevented, true);
  binding.dispose();
  await els.connect.click({ preventDefault() {} });
  assert.equal(signedIn, 1);
});


test("the browser upload row leaves the OAuth link navigation intact", () => {
  const els = elements();
  let prevented = false;
  const binding = bindStravaUpload({ elements: els, account: null });
  els.connect.click({ preventDefault: () => { prevented = true; } });
  assert.equal(prevented, false);
  binding.dispose();
});

test("a lost session is not announced under a line that says the rider is connected", () => {
  const els = elements();
  const receipts = new UploadReceipts({ storage: { getItem: () => null, setItem() {} } });
  const client = { upload: async () => { throw Object.assign(new Error("connect your Strava account first"), { status: 401, code: "not_connected" }); } };
  const binding = bindStravaUpload({ elements: els, client, receipts, key: "7:1", account, makeFile: () => "fit", name: "ride" });
  assert.equal(els.account.textContent, "Connected to Strava as Rider");
  return els.action.click().then(() => {
    assert.equal(els.account.hidden, true);
    assert.equal(els.account.textContent, "");
    assert.equal(els.status.textContent, t("strava.state.sessionLost"));
    assert.equal(els.connect.hidden, false);
    assert.equal(els.action.hidden, true);
    binding.dispose();
  });
});
