/**
 * Talks to the server's Strava routes (the server holds the tokens; the
 * browser only has an HttpOnly session cookie). `fetch` is injected for tests.
 */

import { t } from "../i18n/i18n.js";

export const activityUrl = (id) => `https://www.strava.com/activities/${id}`;
/** The rider's own list of activities on Strava: where to look when an upload's answer got lost. */
export const STRAVA_TRAINING_LOG = "https://www.strava.com/athlete/training";
/** Where a ride file is uploaded to Strava by hand. */
export const STRAVA_UPLOAD_PAGE = "https://www.strava.com/upload/select";

/**
 * Whether this server's Strava application still has the athlete limit Strava
 * gives every new application: one account, ten after the first upgrade in the
 * application's settings, more only after Strava's review
 * (developers.strava.com/docs/rate-limits/, read 12.11.2026). While it has,
 * most riders cannot connect, so the game says so and puts the .fit file in
 * front. A server that knows better says `strava.limited: false` in /api/info;
 * until one does, the limit is assumed.
 */
export const stravaLimited = (info) => info?.strava?.limited !== false;

const CONNECT_KEY = "openradlr.strava-connect";
const RETURN_KEY = "openradlr.strava-return";
const TAB_KEY = "openradlr.strava-tab";
/** A sign-in tab opened longer ago than this is no longer taken for one. */
const TAB_MAX_AGE_MS = 15 * 60 * 1000;

const browserStore = (name) => ({
  getItem: (key) => globalThis[name].getItem(key),
  setItem: (key, value) => globalThis[name].setItem(key, value),
  removeItem: (key) => globalThis[name].removeItem(key),
});

/**
 * What the browser remembers about connecting Strava, so a finished ride is
 * not lost on the way there and back, and a rider whose account Strava would
 * not connect is shown the file instead of the same button again.
 * Storage that cannot be read or written (private mode) remembers nothing.
 */
export class ConnectMemory {
  /** @param {{local?: Storage, session?: Storage}} [stores] */
  constructor({ local = browserStore("localStorage"), session = browserStore("sessionStorage") } = {}) {
    this.local = local;
    this.session = session;
  }

  #read(store, key) {
    try {
      return store.getItem(key);
    } catch {
      return null;
    }
  }

  #write(store, key, value) {
    try {
      if (value === null) store.removeItem(key);
      else store.setItem(key, value);
    } catch {
      // Nothing to remember with.
    }
  }

  /** The last attempt to connect ended in "failed": Strava answered, and would not connect this account. */
  get failed() {
    return this.#read(this.local, CONNECT_KEY) === "failed";
  }

  /** `result` is the page's `?strava=…` after the sign-in ("failed", "denied", "expired"), or "connected". */
  record(result) {
    if (result === "failed") this.#write(this.local, CONNECT_KEY, "failed");
    if (result === "connected") this.#write(this.local, CONNECT_KEY, null);
  }

  /** Leaving for Strava's sign-in with a finished ride waiting: coming back opens it. */
  leaveWithRide() {
    this.#write(this.session, RETURN_KEY, "ride");
  }

  /** True once after `leaveWithRide`, in the same tab. */
  takeReturn() {
    const waiting = this.#read(this.session, RETURN_KEY) === "ride";
    if (waiting) this.#write(this.session, RETURN_KEY, null);
    return waiting;
  }

  /** The game inside a frame sent the sign-in to a tab of its own, at `now` (epoch ms). */
  openedTab(now) {
    this.#write(this.local, TAB_KEY, String(now));
  }

  /**
   * True once, in the tab the sign-in ended in: the game that opened it is
   * still running in its frame, so this tab only has to say "done, go back".
   */
  takeTab(now) {
    const opened = Number(this.#read(this.local, TAB_KEY));
    if (!opened) return false;
    this.#write(this.local, TAB_KEY, null);
    return now - opened >= 0 && now - opened < TAB_MAX_AGE_MS;
  }
}

/** Text for `?strava=…` after coming back from Strava, or null. */
export function stravaMessage(param) {
  switch (param) {
    case "denied":
      return t("strava.msg.denied");
    case "expired":
      return t("strava.msg.expired");
    case "failed":
      return t("strava.msg.failed");
    default:
      return null;
  }
}

/**
 * The `openradlr://strava?result=…&ticket=…` URL an app login ends on (see
 * the server's AppLogins): what happened, and the ticket to claim the session.
 */
export function appLoginResult(url) {
  try {
    const params = new URL(url).searchParams;
    return { result: params.get("result") ?? "failed", ticket: params.get("ticket") };
  } catch {
    return { result: "failed", ticket: null };
  }
}

export class StravaClient {
  /** @param {{fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>, timeoutSignal?: (ms: number) => AbortSignal}} [deps] */
  constructor({ fetch: fetchFn = (...args) => globalThis.fetch(...args), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), timeoutSignal = (ms) => AbortSignal.timeout(ms) } = {}) {
    this.fetch = fetchFn;
    this.sleep = sleep;
    this.timeoutSignal = timeoutSignal;
  }

  /** The connected account, or null. */
  async me() {
    const response = await this.fetch("/api/me", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) return null;
    return response.json();
  }

  /**
   * The app starts a login for the system sign-in sheet (docs/app.md): the
   * server keeps its secret in this web view's cookies and answers the URL
   * the sheet opens.
   */
  async startAppLogin() {
    const { url } = await this.#json(await this.fetch("/auth/strava/app", { method: "POST", credentials: "same-origin" }));
    return url;
  }

  /** Back from the sheet: trades the ticket for this web view's session cookie. */
  async claimAppLogin(ticket) {
    const response = await this.fetch("/auth/strava/app/claim", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ticket }),
    });
    if (!response.ok) await this.#json(response);
  }

  async logout() {
    await this.fetch("/auth/logout", { method: "POST", credentials: "same-origin" });
  }

  async #json(response) {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(body.message ?? `HTTP ${response.status}`), { status: response.status, code: body.code });
    return body;
  }

  /**
   * Uploads a ride: a FIT file (bytes), or TCX (text); resolves with
   * Strava's upload status ({id, status, error, activity_id}).
   */
  async upload(file, name) {
    const fit = typeof file !== "string";
    const response = await this.fetch(`/api/strava/upload?name=${encodeURIComponent(name)}`, {
      method: "POST",
      credentials: "same-origin",
      signal: this.timeoutSignal(30_000),
      headers: { "content-type": fit ? "application/vnd.ant.fit" : "application/vnd.garmin.tcx+xml" },
      body: file,
    });
    return this.#json(response);
  }

  /**
   * Polls until Strava turned the upload into an activity, reported an
   * error, or `tries` ran out; resolves with the last status.
   */
  async waitForActivity(upload, { tries = 15, delayMs = 2000, shouldContinue = () => true } = {}) {
    let status = upload;
    for (let i = 0; i < tries && !status.activity_id && !status.error && shouldContinue(); i += 1) {
      await this.sleep(delayMs);
      if (!shouldContinue()) break;
      status = await this.#json(await this.fetch(`/api/strava/upload/${upload.id}`, { credentials: "same-origin", cache: "no-store", signal: this.timeoutSignal(30_000) }));
    }
    return status;
  }
}
