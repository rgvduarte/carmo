/**
 * What the finish dialog offers for one finished ride: which way to Strava is
 * in front (upload from here, connect first, or the .fit file by hand), which
 * is kept as the other way, and which single button is the main one. A pure
 * decision over the ride, the server and the rider's Strava account; main.js
 * shows what it returns and view/stravaUploadView.js fills in the upload's own
 * progress.
 *
 * The rules it keeps:
 * - a ride on the simulated trainer or on phone paddles is not uploaded to
 *   Strava (upstream's rule), and the dialog says why;
 * - a rider who cannot connect (Strava switched off on this server, or the
 *   application still under the athlete limit Strava gives a new application)
 *   gets the .fit file as the main action, with how to upload it by hand;
 * - there is never a button that leads nowhere.
 */

/** Upload phases after which the file by hand is offered again, in the open. */
const STUCK = new Set(["failed", "rejected", "uncertain", "check-failed"]);

/**
 * @param {{
 *   empty: boolean, the ride is too short to keep
 *   exportable: boolean, false for a ride on phone paddles
 *   measured: boolean, the power came from a real trainer
 *   stravaEnabled: boolean, this server offers Strava
 *   stravaLimited: boolean, the Strava application still has an athlete limit
 *   stravaOwnerOnly?: boolean, only the application's owner can connect yet
 *   account: ?{can_upload: boolean}, the connected Strava account
 *   connectFailed: boolean, the last attempt to connect did not work
 *   phase?: string, code?: ?string, the upload so far (net/stravaUpload.js)
 * }} state
 * @returns {{
 *   mode: "empty" | "paddle" | "simulated" | "manual" | "connect" | "reconnect" | "send" | "sent",
 *   strava: boolean, the Strava panel shows (connect or upload)
 *   manual: "main" | "open" | "folded" | "none", the .fit file with the steps to upload it by hand
 *   files: boolean, the ride's files can be downloaded at all
 *   image: boolean, there is a ride image
 *   primary: "upload" | "connect" | "fit" | "image" | null,
 *   reason: ?string, the i18n key of the one line that says why
 * }}
 */
export function finishPlan({ empty, exportable, measured, stravaEnabled, stravaLimited, stravaOwnerOnly = false, account, connectFailed, phase = "idle", code = null }) {
  const none = { strava: false, manual: "none", files: false, image: false, primary: null, reason: null };
  if (empty) return { ...none, mode: "empty", reason: "finish.note.tooShort" };
  if (!exportable) return { ...none, mode: "paddle", image: true, primary: "image", reason: "finish.note.paddle" };
  if (!measured) return { ...none, mode: "simulated", files: true, image: true, primary: "image", reason: "finish.note.simulated" };

  const base = { ...none, files: true, image: true };
  if (!stravaEnabled) return { ...base, mode: "manual", manual: "main", primary: "fit", reason: "finish.reason.stravaOff" };

  // The panel says in its own words why to connect (again); the plan's line is for what the panel cannot know.
  if (!account || code === "not_connected") {
    // A session that went away (the server restarted, or it ended): connecting again is the way, the ride stays here.
    // (Where only the owner can connect, a rider who had a session is the owner: the button is his.)
    if (account) return { ...base, mode: "reconnect", strava: true, manual: "open", primary: "connect" };
    // Only the application's owner can connect yet: no button that leads to Strava's refusal, the file is the way.
    if (stravaOwnerOnly) return { ...base, mode: "manual", manual: "main", primary: "fit", reason: "finish.reason.ownerOnly" };
    // Under the athlete limit, or after a failed attempt, most riders cannot connect: the file goes in front.
    if (stravaLimited || connectFailed) return { ...base, mode: "manual", strava: true, manual: "main", primary: "fit", reason: connectFailed ? "finish.reason.connectFailed" : "finish.reason.limited" };
    return { ...base, mode: "connect", strava: true, manual: "open", primary: "connect" };
  }
  if (!account.can_upload || code === "upload_not_allowed") return { ...base, mode: "reconnect", strava: true, manual: "open", primary: "connect" };

  if (phase === "success") return { ...base, mode: "sent", strava: true, manual: "folded", primary: "image" };
  return { ...base, mode: "send", strava: true, manual: STUCK.has(phase) ? "open" : "folded", primary: "upload" };
}
