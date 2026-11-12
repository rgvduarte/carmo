/**
 * Keeps what the page knows of the server (/api/info) fresh without keeping a
 * small host busy.
 *
 * Why it matters: on a free host every answer counts against a monthly traffic
 * allowance, and a request every few seconds from a forgotten tab keeps the
 * server from ever going to sleep. So the page asks
 *  - only while it is visible,
 *  - every `everyMs` (the countdowns on the start screen run on the page's own
 *    clock in between: `tick` redraws them),
 *  - and, where `idleAfterMs` is given, only while somebody is using the page:
 *    with no key, pointer or touch for that long it stops asking, and asks
 *    again at once when the rider is back.
 * During a ride the game connection is the live part; the poll only refreshes
 * the events list and the server's rider count.
 */

/** The start screen asks this often while it is visible and in use. */
export const START_INFO_MS = 30_000;
/** A start screen nobody has touched for this long stops asking. */
export const START_IDLE_MS = 5 * 60_000;
/** During a ride. */
export const RIDE_INFO_MS = 30_000;
/** How often the page looks at its own clock (no request). */
const BEAT_MS = 5000;
const INPUT_EVENTS = ["pointerdown", "pointermove", "keydown", "touchstart", "wheel"];

export class InfoPoll {
  #ask;
  #tick;
  #everyMs;
  #idleAfterMs;
  #doc;
  #now;
  #timers;
  #timer = null;
  #askedAt = -Infinity;
  #inputAt = 0;
  #onVisible = () => {
    // Bringing the tab to the front is using it.
    if (!this.#doc.hidden) this.#inputAt = this.#now();
    this.#beat();
  };
  #onInput = () => this.#input();

  /**
   * @param {{ask: () => unknown, tick?: () => void, everyMs: number, idleAfterMs?: number, doc?: Document,
   *   now?: () => number, timers?: {set: typeof setInterval, clear: typeof clearInterval}}} options
   */
  constructor({ ask, tick = () => {}, everyMs, idleAfterMs = Infinity, doc = globalThis.document, now = Date.now, timers = { set: (fn, ms) => setInterval(fn, ms), clear: (id) => clearInterval(id) } }) {
    this.#ask = ask;
    this.#tick = tick;
    this.#everyMs = everyMs;
    this.#idleAfterMs = idleAfterMs;
    this.#doc = doc;
    this.#now = now;
    this.#timers = timers;
  }

  /** Asks once now, whatever the page's state, then keeps it fresh. */
  start() {
    this.stop();
    this.#inputAt = this.#now();
    this.#request();
    this.#timer = this.#timers.set(() => this.#beat(), BEAT_MS);
    this.#doc.addEventListener("visibilitychange", this.#onVisible);
    for (const type of INPUT_EVENTS) this.#doc.addEventListener(type, this.#onInput, { passive: true, capture: true });
  }

  stop() {
    if (this.#timer === null) return;
    this.#timers.clear(this.#timer);
    this.#timer = null;
    this.#doc.removeEventListener("visibilitychange", this.#onVisible);
    for (const type of INPUT_EVENTS) this.#doc.removeEventListener(type, this.#onInput, { capture: true });
  }

  /** Whether nobody has used the page for longer than `idleAfterMs`. */
  get idle() {
    return this.#now() - this.#inputAt > this.#idleAfterMs;
  }

  #request() {
    this.#askedAt = this.#now();
    this.#ask();
  }

  #beat() {
    if (this.#doc.hidden) return;
    if (!this.idle && this.#now() - this.#askedAt >= this.#everyMs) this.#request();
    else this.#tick();
  }

  #input() {
    const wasIdle = this.idle;
    this.#inputAt = this.#now();
    // Back after a pause: what the page shows is old, ask now.
    if (wasIdle && !this.#doc.hidden && this.#now() - this.#askedAt >= this.#everyMs) this.#request();
  }
}
