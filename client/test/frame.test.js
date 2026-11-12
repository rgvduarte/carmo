// GOCARMO Ride inside a frame (gocarmo.com/ride/): links and the Strava sign-in open in a
// new top-level tab, full screen where the frame allows it, the keyboard on entering.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { copyText, fullscreenAllowed, initFrame, isFramed, leaveTo, openInNewTab, replacesGame, toggleFullscreen, withNoopener } from "../public/js/util/frame.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

/** An <a> as far as the helpers look at it. */
function link(attrs) {
  const map = new Map(Object.entries(attrs));
  const a = {
    getAttribute: (name) => (map.has(name) ? map.get(name) : null),
    setAttribute: (name, value) => map.set(name, String(value)),
    hasAttribute: (name) => map.has(name),
    closest: (selector) => (selector === "a[href]" && map.has("href") ? a : null),
  };
  return a;
}

function classList() {
  const names = new Set();
  return {
    add: (name) => names.add(name),
    contains: (name) => names.has(name),
    toggle: (name, on) => (on ? names.add(name) : names.delete(name)),
    names,
  };
}

function fakeDocument({ fullscreenEnabled = true, focused = false } = {}) {
  const listeners = {};
  const rootListeners = {};
  const doc = {
    fullscreenEnabled,
    fullscreenElement: null,
    focused,
    hasFocus: () => doc.focused,
    documentElement: {
      classList: classList(),
      addEventListener: (type, fn) => (rootListeners[type] ??= []).push(fn),
      requestFullscreen: async () => {
        doc.fullscreenElement = doc.documentElement;
      },
    },
    exitFullscreen: async () => {
      doc.fullscreenElement = null;
    },
    addEventListener: (type, fn, options) => (listeners[type] ??= []).push({ fn, capture: options === true }),
    fire: (type, event = {}) => (listeners[type] ?? []).forEach(({ fn }) => fn(event)),
    fireRoot: (type, event = {}) => (rootListeners[type] ?? []).forEach((fn) => fn(event)),
    listeners,
  };
  return doc;
}

function fakeWindow({ framed, popup = {} }) {
  const win = { assigned: [], opened: [], focusCalls: 0, location: { assign: (url) => win.assigned.push(url) } };
  win.self = win;
  win.top = framed ? { other: true } : win;
  win.open = (url, target, features) => {
    win.opened.push({ url, target, features });
    return popup;
  };
  win.focus = () => {
    win.focusCalls += 1;
  };
  return win;
}

test("a frame is told from a tab of its own, also when the parent cannot be looked at", () => {
  assert.equal(isFramed(fakeWindow({ framed: false })), false);
  assert.equal(isFramed(fakeWindow({ framed: true })), true);
  const hostile = { get self() { throw new Error("blocked"); } };
  assert.equal(isFramed(hostile), true);
  assert.equal(isFramed(undefined), false, "no window (tests, workers): not framed");
});

test("which links would load another page in place of the game", () => {
  assert.equal(replacesGame(link({ href: "/auth/strava" })), true);
  assert.equal(replacesGame(link({ href: "https://www.strava.com/activities/1" })), true);
  assert.equal(replacesGame(link({ href: "LICENSE.txt", target: "_blank" })), false, "already opens elsewhere");
  assert.equal(replacesGame(link({ href: "blob:http://x/1", download: "ride.fit" })), false, "a download");
  assert.equal(replacesGame(link({ href: "blob:http://x/1" })), false);
  assert.equal(replacesGame(link({ href: "#route" })), false);
  assert.equal(replacesGame(link({ href: "mailto:allez@gocarmo.com" })), false, "the mail program takes it");
  assert.equal(replacesGame(link({})), false);
});

test("a link sent to a new tab gives the new page no handle on the game", () => {
  const strava = link({ href: "/auth/strava" });
  assert.equal(openInNewTab(strava), true);
  assert.equal(strava.getAttribute("target"), "_blank");
  assert.equal(strava.getAttribute("rel"), "noopener");
  const source = link({ href: "https://github.com/rgvduarte/carmo", target: "_blank", rel: "noopener" });
  assert.equal(openInNewTab(source), false, "it already opened in a new tab");
  assert.equal(source.getAttribute("rel"), "noopener");
  const bare = link({ href: "https://example.org/", target: "_blank", rel: "external" });
  openInNewTab(bare);
  assert.equal(bare.getAttribute("rel"), "external noopener");
  const file = link({ href: "blob:http://x/1", download: "ride.fit" });
  assert.equal(openInNewTab(file), false);
  assert.equal(file.getAttribute("target"), null, "downloads are left alone");
  assert.equal(withNoopener("noopener noreferrer"), "noopener noreferrer");
  assert.equal(withNoopener(null), "noopener");
});

test("leaving from a script: here with the tab to itself, a new tab when framed, never the frame", () => {
  const alone = fakeWindow({ framed: false });
  assert.equal(leaveTo("/auth/strava", { win: alone }), "here");
  assert.deepEqual(alone.assigned, ["/auth/strava"]);
  assert.deepEqual(alone.opened, []);

  const popup = { opener: {} };
  const framed = fakeWindow({ framed: true, popup });
  assert.equal(leaveTo("/auth/strava", { win: framed }), "tab");
  assert.deepEqual(framed.assigned, [], "the frame itself goes nowhere");
  assert.deepEqual(framed.opened, [{ url: "/auth/strava", target: "_blank", features: undefined }]);
  assert.equal(popup.opener, null, "the new tab cannot reach back");

  const blocked = fakeWindow({ framed: true, popup: null });
  assert.equal(leaveTo("/auth/strava", { win: blocked }), "blocked");
  assert.deepEqual(blocked.assigned, []);
});

test("with the tab to itself nothing is set up", () => {
  const doc = fakeDocument();
  assert.equal(initFrame({ win: fakeWindow({ framed: false }), doc }), false);
  assert.deepEqual(doc.listeners, {});
  assert.equal(doc.documentElement.classList.names.size, 0);
});

test("framed: links are caught on the way down and the caller hears of each one moved", () => {
  const doc = fakeDocument();
  const left = [];
  assert.equal(initFrame({ win: fakeWindow({ framed: true }), doc, onLeave: (a) => left.push(a.getAttribute("href")) }), true);
  assert.ok(doc.documentElement.classList.contains("framed"));
  assert.equal(doc.listeners.click[0].capture, true, "before any handler of the page");
  const strava = link({ href: "/auth/strava" });
  doc.fire("click", { target: { closest: () => strava } });
  assert.equal(strava.getAttribute("target"), "_blank");
  assert.deepEqual(left, ["/auth/strava"]);
  const download = link({ href: "blob:http://x/1", download: "ride.fit" });
  doc.fire("click", { target: { closest: () => download } });
  doc.fire("click", { target: { closest: () => null } });
  assert.deepEqual(left, ["/auth/strava"]);
});

test("framed: the full-screen control exists only where the frame allows it, and shows its state", async () => {
  const denied = fakeDocument({ fullscreenEnabled: false });
  initFrame({ win: fakeWindow({ framed: true }), doc: denied });
  assert.equal(fullscreenAllowed(denied), false);
  assert.equal(denied.documentElement.classList.contains("can-fullscreen"), false);
  assert.equal(denied.listeners.fullscreenchange, undefined);

  const doc = fakeDocument();
  initFrame({ win: fakeWindow({ framed: true }), doc });
  assert.ok(doc.documentElement.classList.contains("can-fullscreen"));
  assert.equal(await toggleFullscreen(doc), true);
  doc.fire("fullscreenchange");
  assert.ok(doc.documentElement.classList.contains("is-fullscreen"));
  assert.equal(await toggleFullscreen(doc), false);
  doc.fire("fullscreenchange");
  assert.equal(doc.documentElement.classList.contains("is-fullscreen"), false);
});

test("a refused full screen is not an error", async () => {
  const doc = fakeDocument();
  doc.documentElement.requestFullscreen = async () => {
    throw new TypeError("Permissions check failed");
  };
  assert.equal(await toggleFullscreen(doc), false);
});

test("framed: the game takes the keyboard when the pointer comes in, unless it has it", () => {
  const doc = fakeDocument();
  const win = fakeWindow({ framed: true });
  initFrame({ win, doc });
  doc.fireRoot("mouseenter");
  assert.equal(win.focusCalls, 1);
  doc.focused = true;
  doc.fireRoot("mouseenter");
  assert.equal(win.focusCalls, 1, "already focused: left alone");
});

test("copying: refused without noise where the frame may not, or the browser cannot", async () => {
  const written = [];
  const nav = { clipboard: { writeText: async (text) => written.push(text) } };
  await copyText("v0.1.0", { doc: {}, nav });
  await copyText("again", { doc: { permissionsPolicy: { allowsFeature: (name) => name === "clipboard-write" } }, nav });
  assert.deepEqual(written, ["v0.1.0", "again"]);
  await assert.rejects(copyText("x", { doc: { featurePolicy: { allowsFeature: () => false } }, nav }), { name: "NotAllowedError" });
  assert.deepEqual(written, ["v0.1.0", "again"], "the clipboard was not even asked");
  await assert.rejects(copyText("x", { doc: {}, nav: {} }), { name: "NotAllowedError" });
});

// --- the page -------------------------------------------------------------------------------

function* sources(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sources(path);
    else if (name.endsWith(".js")) yield path;
  }
}

test("nothing in the client moves the page around the frame", () => {
  const root = new URL("../public/js/", import.meta.url).pathname;
  const offenders = [];
  for (const path of sources(root)) {
    const code = readFileSync(path, "utf8");
    if (/\b(top|parent)\s*\.\s*location|window\s*\.\s*(top|parent)\s*\.|["']_(top|parent)["']/.test(code)) offenders.push(path.slice(root.length));
  }
  assert.deepEqual(offenders, []);
  assert.doesNotMatch(read("../public/index.html"), /target="_(top|parent)"/);
});

test("the Strava sign-in is started in one place, which knows about the frame", () => {
  const main = read("../public/js/main.js");
  assert.equal([...main.matchAll(/location\.assign\(/g)].length, 0, "no script navigates the page directly");
  assert.match(main, /const STRAVA_SIGN_IN = "\/auth\/strava";/);
  assert.equal([...main.matchAll(/"\/auth\/strava"/g)].length, 1, "one address, one helper");
  assert.match(main, /leaveTo\(STRAVA_SIGN_IN\)/);
});

test("the page carries the full-screen control on the start screen and in the ride, hidden by default", () => {
  const html = read("../public/index.html");
  assert.equal([...html.matchAll(/data-fullscreen-toggle/g)].length, 2);
  const css = read("../public/styles.css");
  assert.match(css, /\[data-fullscreen-toggle\] \{\n {2}display: none;\n\}/);
  assert.match(css, /html\.framed\.can-fullscreen \[data-fullscreen-toggle\] \{\n {2}display: inline-flex;\n\}/);
});
