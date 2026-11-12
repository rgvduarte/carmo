import { t } from "../i18n/i18n.js";
import { STRAVA_TRAINING_LOG, activityUrl } from "../net/strava.js";
import { StravaUpload, plainError } from "../net/stravaUpload.js";

/**
 * One state-appropriate action, shared by the summary and recovered ride.
 * What Strava's rules ask of it (developers.strava.com/guidelines): a link to
 * something on Strava reads "View on Strava" (`strava.view`), and connecting
 * is Strava's own button, which the page provides; this file only shows or
 * hides it.
 */
export function uploadPresentation(state, account, { canConnect = true } = {}) {
  const view = { busy: false, spinner: false, tone: "neutral", action: null, connect: false, activity: null, activityLabel: null, status: "", detail: "" };
  if (state.phase === "success" && state.duplicate) {
    return { ...view, tone: "success", status: t("strava.state.duplicate"), detail: t("strava.duplicateHint"), activity: activityUrl(state.activityId), activityLabel: t("strava.view") };
  }
  if (state.phase === "success") return { ...view, tone: "success", status: t("strava.state.success"), activity: activityUrl(state.activityId), activityLabel: t("strava.view") };
  const authError = ["not_connected", "upload_not_allowed"].includes(state.code);
  if (!account?.can_upload || authError) {
    // The session went away under a connected rider (a restarted server): say so, the ride is still here.
    const lost = state.code === "not_connected" && Boolean(account);
    // Where only the application's owner can connect, nobody else is shown a button that leads to Strava's refusal.
    if (!canConnect && !account) return view;
    return { ...view, tone: account || authError ? "error" : "neutral", connect: true, status: lost ? t("strava.state.sessionLost") : "", detail: t(account && state.code !== "not_connected" ? "strava.permission" : "strava.connectHint") };
  }
  // Strava answered, and the ride is certainly not on Strava: said plainly, sending again is safe.
  if (state.code === "strava_busy" && ["failed", "check-failed"].includes(state.phase)) {
    return { ...view, tone: "error", action: t(state.phase === "failed" ? "strava.action.retry" : "strava.action.retryCheck"), status: t("strava.state.busy"), detail: "" };
  }
  if (state.code === "strava_refused" && state.phase === "failed") {
    return { ...view, tone: "error", action: t("strava.action.retry"), status: t("strava.state.rejected"), detail: t("strava.refusedHint") };
  }
  switch (state.phase) {
    case "uploading":
    case "processing": {
      const label = t(state.phase === "uploading" ? "strava.state.uploading" : "strava.state.processing");
      return { ...view, busy: true, spinner: true, action: label, status: label };
    }
    case "pending":
      return { ...view, action: t("strava.action.check"), status: t("strava.state.pending"), detail: t("strava.checkHint") };
    case "check-failed":
      return { ...view, tone: "error", action: t("strava.action.retryCheck"), status: t("strava.state.check-failed"), detail: t("strava.checkHint") };
    case "uncertain":
      return { ...view, tone: "error", action: t("strava.action.again"), status: t("strava.state.uncertain"), detail: t("strava.uncertainHint"), activity: STRAVA_TRAINING_LOG, activityLabel: t("strava.view") };
    case "rejected":
      return { ...view, tone: "error", status: t("strava.state.rejected"), detail: t("strava.rejectedHint", { message: plainError(state.error) }), activity: STRAVA_TRAINING_LOG, activityLabel: t("strava.view") };
    case "failed":
      return { ...view, tone: "error", action: t("strava.action.retry"), status: t("strava.state.failed"), detail: t("strava.failedHint") };
    default:
      return { ...view, action: t("strava.send") };
  }
}

/**
 * Bind a single ride's panel; disposing prevents late effects on another ride.
 * `onState` hears every change of the upload (the finish dialog re-plans on it).
 */
export function bindStravaUpload({ elements, client, receipts, key, account, makeFile, name, query = {}, canConnect = true, onSuccess = () => {}, onState = () => {}, onConnect, confirm = () => false }) {
  const job = account ? new StravaUpload({ client, receipts, key }) : null;
  let notified = false;
  const render = (state) => {
    const view = uploadPresentation(state, account, { canConnect });
    elements.panel.dataset.state = state.phase;
    elements.panel.dataset.tone = state.persisted === false && view.tone === "neutral" ? "warning" : view.tone;
    elements.action.setAttribute("aria-busy", String(view.busy));
    // "Connected as …" is not said over a session that has just been lost.
    const connected = Boolean(account) && state.code !== "not_connected";
    elements.account.textContent = connected ? t("strava.account") : "";
    elements.account.hidden = !connected;
    // While the button itself says "Sending…", the same words are not repeated under it.
    elements.status.textContent = view.busy ? "" : view.status;
    elements.status.hidden = view.busy || !view.status;
    elements.detail.textContent = view.detail;
    elements.detail.hidden = !view.detail;
    elements.action.textContent = view.action ?? "";
    elements.action.hidden = !view.action;
    elements.action.disabled = view.busy;
    elements.connect.hidden = !view.connect;
    // What connecting means, next to every button that does it (Strava API Policy 2.1).
    if (elements.consent) elements.consent.hidden = !view.connect;
    // Before sending: the name and the link the activity gets, which the rider can change on Strava.
    if (elements.note) {
      elements.note.textContent = t("strava.sendNote", { name });
      elements.note.hidden = !(account?.can_upload && state.code !== "not_connected" && (state.phase === "idle" || state.phase === "failed"));
    }
    // Strava's button is a picture of English words: its label is said in the rider's language.
    elements.connect.setAttribute("aria-label", t(account ? "strava.action.reconnect" : "strava.connectWith"));
    elements.activity.hidden = !view.activity;
    elements.activity.href = view.activity ?? "";
    elements.activity.textContent = view.activityLabel ?? "";
    elements.storage.hidden = state.persisted !== false;
    onState(state);
    if (state.phase === "success" && !notified) { notified = true; onSuccess(); }
  };
  const unsubscribe = job?.subscribe(render);
  if (!job) render({ phase: "idle", persisted: true });
  const run = () => {
    const resubmit = job?.state.phase === "uncertain";
    if (resubmit && !confirm(t("strava.confirmAgain"))) return;
    return job?.run(makeFile, name, { resubmit, query });
  };
  const connect = (event) => {
    if (!onConnect) return;
    event.preventDefault();
    return onConnect();
  };
  elements.action.addEventListener("click", run);
  elements.connect.addEventListener("click", connect);
  return {
    get state() { return job?.state; },
    dispose() {
      unsubscribe?.();
      job?.dispose();
      elements.action.removeEventListener("click", run);
      elements.connect.removeEventListener("click", connect);
    },
  };
}
