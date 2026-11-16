/**
 * "How it works" ("Como funciona"): what a first-time rider needs to know, in
 * five short steps, inside the game (the site sends people straight here, as
 * a full page). It opens by itself on the first visit of a browser (noted in
 * the game's settings in localStorage) and from any element marked
 * `data-how-open` (the start screen's header and foot).
 *
 * It ends with "Full screen and start": a click is the gesture the
 * Fullscreen API asks for, so the request is made there and nowhere earlier.
 * Where the page may not go full screen (an iPhone, a frame without
 * `allow="fullscreen"`) the button just reads "Start" and closes; a refusal
 * closes too.
 *
 * A native modal <dialog>: the page behind is inert, Escape closes it; Tab
 * also wraps inside the card, so the focus never leaves it for the browser's
 * own controls in between.
 */
import { t } from "../i18n/i18n.js";
import { fullscreenAllowed, toggleFullscreen } from "../util/frame.js";

/** The settings key that says this browser has seen the dialog (a setting like the others in localStorage). */
export const HOW_SEEN_KEY = "openride.howItWorksSeen";

/** Whether to open the dialog by itself: not once this browser has seen it, and not where storage is out of reach (it would open on every visit). */
export function firstVisit(storage) {
  try {
    if (!storage) return false;
    return storage.getItem(HOW_SEEN_KEY) === null;
  } catch {
    return false;
  }
}

export function markSeen(storage) {
  try {
    storage?.setItem(HOW_SEEN_KEY, "1");
  } catch {
    // Unavailable storage: the dialog stays a button away.
  }
}

const isFullscreen = (doc) => Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);

/** The primary button's words: full screen where the page may take it, else just start. */
export const startKey = (doc) => (fullscreenAllowed(doc) && !isFullscreen(doc) ? "how.start" : "how.startPlain");

const FOCUSABLE = 'a[href], button:not([disabled]):not([hidden]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Wires the dialog up and opens it on a first visit.
 * @param {{doc?: Document, storage?: Storage, auto?: boolean}} [options] `auto` false never opens it by itself
 * @returns {{open: () => void, close: () => void} | null}
 */
export function initHowItWorks({ doc = globalThis.document, storage, auto = true } = {}) {
  const dialog = doc.getElementById("how");
  if (!dialog) return null;
  const start = doc.getElementById("how-start");

  const open = () => {
    if (dialog.open) return;
    const key = startKey(doc);
    start.dataset.i18n = key;
    start.textContent = t(key);
    dialog.showModal();
    markSeen(storage);
    // The card scrolls to its top and the focus starts on the title, so a screen reader reads from the start.
    dialog.querySelector(".about-card")?.scrollTo?.(0, 0);
    doc.getElementById("how-title")?.focus();
  };
  const close = () => dialog.open && dialog.close();

  doc.addEventListener("click", (event) => {
    if (event.target.closest?.("[data-how-open]")) open();
  });
  doc.getElementById("how-close")?.addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) close();
  });
  start.addEventListener("click", async () => {
    // Asked inside the click: the browser grants full screen only to a user's gesture.
    if (startKey(doc) === "how.start") await toggleFullscreen(doc);
    close();
  });
  dialog.addEventListener("keydown", (event) => {
    // Keys typed here are not ride controls (M, V, the arrows).
    event.stopPropagation();
    if (event.key !== "Tab" /* i18n-ok */) return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((item) => !item.closest("[hidden]"));
    if (!items.length) return;
    const first = items[0];
    const last = items.at(-1);
    const active = doc.activeElement;
    if (event.shiftKey && (active === first || !dialog.contains(active) || active?.id === "how-title")) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  if (auto && firstVisit(storage)) open();
  return { open, close };
}
