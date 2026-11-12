/**
 * GOCARMO Ride inside another page's frame (gocarmo.com/ride/ shows the game in
 * an <iframe>). The game then never replaces itself inside the frame and never
 * moves the page around it:
 *
 * - a link that leaves the game opens in a new top-level tab;
 * - the Strava sign-in opens in a new top-level tab too (Strava refuses to be
 *   framed) and comes back to the game's own host;
 * - a "Full screen" control uses the Fullscreen API where the frame allows it;
 * - copying and sharing fall back quietly where the frame may not use them;
 * - the game takes the keyboard when the pointer enters the frame.
 *
 * With the tab to itself the game behaves exactly as before: `initFrame` does
 * nothing then. `window` and `document` are injected for the tests.
 */

/** True inside a frame. Comparing the two windows never throws, whoever the parent is. */
export function isFramed(win = globalThis.window) {
  try {
    return Boolean(win) && win.self !== win.top;
  } catch {
    return true;
  }
}

/**
 * Does a click on this link load another page in place of the game? Not a
 * download (ride files, photos), not a jump inside the page, not a link that
 * already opens elsewhere, and not an address another program takes (mail).
 */
export function replacesGame(anchor) {
  const href = anchor?.getAttribute?.("href");
  if (!href || href.startsWith("#")) return false;
  if (anchor.hasAttribute("download")) return false;
  if (/^(blob|data|javascript|mailto|tel):/i.test(href)) return false;
  return (anchor.getAttribute("target") ?? "").toLowerCase() !== "_blank";
}

/** `rel` with `noopener` in it, once: the page opened in the new tab gets no handle on the game. */
export function withNoopener(rel) {
  const words = (rel ?? "").split(/\s+/).filter(Boolean);
  return words.includes("noopener") ? words.join(" ") : [...words, "noopener"].join(" ");
}

/**
 * Makes a link open in a new top-level tab. Every link gets `noopener`; one
 * that would have replaced the game also gets `target="_blank"`.
 * @returns {boolean} whether the link now opens in a new tab because of this
 */
export function openInNewTab(anchor) {
  const moved = replacesGame(anchor);
  if (moved) anchor.setAttribute("target", "_blank");
  if ((anchor.getAttribute?.("target") ?? "").toLowerCase() === "_blank") anchor.setAttribute("rel", withNoopener(anchor.getAttribute("rel")));
  return moved;
}

/**
 * Goes to `url` from a script: in this tab when the game has it to itself, in
 * a new top-level tab when framed. Call it straight from the click handler:
 * browsers block a tab opened later.
 * @returns {"here" | "tab" | "blocked"} what happened
 */
export function leaveTo(url, { win = globalThis.window, framed = isFramed(win) } = {}) {
  if (!framed) {
    win.location.assign(url);
    return "here";
  }
  const opened = win.open(url, "_blank");
  if (!opened) return "blocked";
  // Not `noopener` in the call: it would hide whether the tab opened at all.
  try {
    opened.opener = null;
  } catch {
    // Already on another origin: nothing to cut.
  }
  return "tab";
}

/**
 * Copies text to the clipboard; rejects when the browser has none or the page
 * may not use it (a frame without `allow="clipboard-write"`). The permission
 * is asked first where the browser can tell, so a refusal makes no noise in
 * the console; callers show the text instead.
 */
export function copyText(text, { doc = globalThis.document, nav = globalThis.navigator } = {}) {
  const policy = doc?.permissionsPolicy ?? doc?.featurePolicy;
  const allowed = typeof policy?.allowsFeature === "function" ? policy.allowsFeature("clipboard-write") : true;
  if (!allowed || !nav?.clipboard?.writeText) return Promise.reject(new DOMException("clipboard not available", "NotAllowedError"));
  return nav.clipboard.writeText(text);
}

/** Whether this document may go full screen (a frame needs `allow="fullscreen"`). */
export function fullscreenAllowed(doc = globalThis.document) {
  return Boolean(doc?.fullscreenEnabled ?? doc?.webkitFullscreenEnabled);
}

const fullscreenElement = (doc) => doc.fullscreenElement ?? doc.webkitFullscreenElement ?? null;

/** Enters or leaves full screen; a refusal (no permission, no user gesture) is not an error to show. */
export async function toggleFullscreen(doc = globalThis.document) {
  try {
    if (fullscreenElement(doc)) await (doc.exitFullscreen ?? doc.webkitExitFullscreen)?.call(doc);
    else {
      const root = doc.documentElement;
      await (root.requestFullscreen ?? root.webkitRequestFullscreen)?.call(root);
    }
  } catch {
    // Stays as it was.
  }
  return Boolean(fullscreenElement(doc));
}

/**
 * Sets the framed behaviour up; a no-op (returning false) outside a frame.
 * The page shows its frame-only controls through the classes on <html>:
 * `framed`, `can-fullscreen`, `is-fullscreen`.
 * @param {{win?: Window, doc?: Document, onLeave?: (anchor: Element) => void}} [options]
 *   `onLeave` hears of every link that was sent to a new tab.
 */
export function initFrame({ win = globalThis.window, doc = globalThis.document, onLeave = () => {} } = {}) {
  if (!isFramed(win)) return false;
  const root = doc.documentElement;
  root.classList.add("framed");

  // Links: caught on the way down, so the ride screen (rebuilt for every ride) and late links are covered.
  doc.addEventListener(
    "click",
    (event) => {
      const anchor = event.target.closest?.("a[href]");
      if (anchor && openInNewTab(anchor)) onLeave(anchor);
    },
    true,
  );

  // Full screen.
  if (fullscreenAllowed(doc)) {
    root.classList.add("can-fullscreen");
    const show = () => root.classList.toggle("is-fullscreen", Boolean(fullscreenElement(doc)));
    doc.addEventListener("fullscreenchange", show);
    doc.addEventListener("webkitfullscreenchange", show);
    doc.addEventListener("click", (event) => {
      if (event.target.closest?.("[data-fullscreen-toggle]")) toggleFullscreen(doc).then(show);
    });
  }

  // The keyboard: the ride's keys work as soon as the pointer is over the game.
  const takeKeys = () => {
    if (doc.hasFocus?.()) return;
    try {
      win.focus();
    } catch {
      // The browser keeps the focus where it is.
    }
  };
  root.addEventListener("mouseenter", takeKeys);
  doc.addEventListener("pointermove", takeKeys, { once: true, passive: true });
  return true;
}
