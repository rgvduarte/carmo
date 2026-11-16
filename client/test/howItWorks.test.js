// "How it works": opens by itself once per browser, from its buttons after that, asks for full screen
// only from the click on its main button, keeps the focus inside, and says what the game really does.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import en from "../public/js/i18n/en.js";
import pt from "../public/js/i18n/pt.js";
import de from "../public/js/i18n/de.js";
import { setLocale } from "../public/js/i18n/i18n.js";
import { HOW_SEEN_KEY, firstVisit, initHowItWorks, markSeen, startKey } from "../public/js/view/howItWorks.js";
import { AUTO_SEND_SECONDS } from "../public/js/view/stravaUploadView.js";

afterEach(() => setLocale("en"));

const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

function memoryStorage() {
  const map = new Map();
  return { getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => map.set(key, String(value)), map };
}

function emitter() {
  const listeners = {};
  return {
    addEventListener: (type, fn) => (listeners[type] ??= []).push(fn),
    fire: async (type, event = {}) => {
      for (const fn of listeners[type] ?? []) await fn(event);
    },
  };
}

/** Just enough of a document: the dialog, its two buttons, the title, an opener, and the Fullscreen API. */
function fakeDoc({ fullscreen = true, refuse = false } = {}) {
  const doc = { ...emitter(), fullscreenEnabled: fullscreen, fullscreenElement: null, activeElement: null, requests: 0 };
  const element = (id, extra = {}) => ({ id, ...emitter(), dataset: {}, textContent: "", closest: () => null, focus() {
    doc.activeElement = this;
  }, ...extra });
  const title = element("how-title");
  const close = element("how-close");
  const start = element("how-start");
  const dialog = element("how", {
    open: false,
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    contains: (node) => [title, close, start].includes(node),
    querySelector: () => null,
    querySelectorAll: () => [close, start],
  });
  const byId = { how: dialog, "how-title": title, "how-close": close, "how-start": start };
  doc.getElementById = (id) => byId[id] ?? null;
  doc.documentElement = {
    requestFullscreen: async () => {
      doc.requests += 1;
      if (refuse) throw new DOMException("refused", "NotAllowedError");
      doc.fullscreenElement = doc.documentElement;
    },
  };
  return { doc, dialog, start, close, title };
}

const opener = { closest: (selector) => (selector === "[data-how-open]" ? {} : null) };

test("the first visit opens it by itself and remembers it in the settings; the next visit does not", () => {
  const storage = memoryStorage();
  assert.equal(firstVisit(storage), true);
  const first = fakeDoc();
  initHowItWorks({ doc: first.doc, storage });
  assert.equal(first.dialog.open, true);
  assert.equal(storage.getItem(HOW_SEEN_KEY), "1");
  assert.equal(HOW_SEEN_KEY, "openride.howItWorksSeen", "a key beside the game's other settings");
  assert.equal(first.doc.activeElement, first.title, "the focus starts on the title");
  const second = fakeDoc();
  initHowItWorks({ doc: second.doc, storage });
  assert.equal(second.dialog.open, false);
});

test("without storage it never opens by itself (it would on every visit)", () => {
  assert.equal(firstVisit(null), false);
  assert.equal(firstVisit({ getItem: () => {
    throw new Error("blocked");
  } }), false);
  assert.doesNotThrow(() => markSeen({ setItem: () => {
    throw new Error("full");
  } }));
  const { doc, dialog } = fakeDoc();
  initHowItWorks({ doc, storage: undefined });
  assert.equal(dialog.open, false);
});

test("its buttons open it at any time; Close closes it", async () => {
  const storage = memoryStorage();
  markSeen(storage);
  const { doc, dialog, close } = fakeDoc();
  initHowItWorks({ doc, storage });
  assert.equal(dialog.open, false);
  await doc.fire("click", { target: opener });
  assert.equal(dialog.open, true);
  await close.fire("click");
  assert.equal(dialog.open, false);
  await doc.fire("click", { target: { closest: () => null } });
  assert.equal(dialog.open, false, "another click opens nothing");
});

test("Full screen and start asks for full screen from the click, then closes; a refusal just closes", async () => {
  for (const refuse of [false, true]) {
    const storage = memoryStorage();
    const { doc, dialog, start } = fakeDoc({ refuse });
    initHowItWorks({ doc, storage });
    assert.equal(doc.requests, 0, "nothing is asked before the click");
    assert.equal(start.dataset.i18n, "how.start");
    assert.equal(start.textContent, "Full screen and start");
    await start.fire("click");
    assert.equal(doc.requests, 1);
    assert.equal(dialog.open, false);
  }
});

test("where the page may not go full screen (an iPhone, a frame without allow) the button just starts", async () => {
  setLocale("pt");
  const { doc, dialog, start } = fakeDoc({ fullscreen: false });
  initHowItWorks({ doc, storage: memoryStorage() });
  assert.equal(startKey(doc), "how.startPlain");
  assert.equal(start.textContent, "Começar");
  await start.fire("click");
  assert.equal(doc.requests, 0);
  assert.equal(dialog.open, false);
  const already = fakeDoc();
  already.doc.fullscreenElement = {};
  assert.equal(startKey(already.doc), "how.startPlain", "already full screen: nothing to ask");
});

test("Tab wraps inside the card, both ways, and keys typed there do not reach the ride", async () => {
  const { doc, dialog, start, close } = fakeDoc();
  initHowItWorks({ doc, storage: memoryStorage() });
  let prevented = 0;
  let stopped = 0;
  const key = (extra) => ({ key: "Tab", shiftKey: false, preventDefault: () => (prevented += 1), stopPropagation: () => (stopped += 1), ...extra });
  start.focus();
  await dialog.fire("keydown", key());
  assert.equal(doc.activeElement, close, "Tab on the last button goes to the first");
  await dialog.fire("keydown", key({ shiftKey: true }));
  assert.equal(doc.activeElement, start, "Shift+Tab on the first goes to the last");
  doc.getElementById("how-title").focus();
  await dialog.fire("keydown", key({ shiftKey: true }));
  assert.equal(doc.activeElement, start, "Shift+Tab from the title too");
  await dialog.fire("keydown", key({ key: "m" }));
  assert.equal(prevented, 3);
  assert.equal(stopped, 4);
});

test("the page has the dialog, an opener in the start screen's header and one in its foot, and a way to Privacy", () => {
  assert.match(html, /<dialog id="how" class="about how" aria-labelledby="how-title">/);
  assert.match(html, /<h2 id="how-title" tabindex="-1" data-i18n="how.title">/);
  assert.match(html, /<button type="button" id="how-start" class="primary-small" data-i18n="how.start">Full screen and start<\/button>/);
  assert.match(html, /<button type="button" id="how-close" class="secondary" data-i18n="drawer.close">Close<\/button>/);
  const head = html.slice(html.indexOf('<header class="start-head">'), html.indexOf("</header>"));
  assert.match(head, /class="how-open" data-how-open/);
  const foot = html.slice(html.indexOf('<footer class="build-line">'), html.indexOf("</footer>"));
  assert.match(foot, /id="how-open" class="build-label" data-how-open/);
  const dialog = html.slice(html.indexOf('<dialog id="how"'), html.indexOf("</dialog>", html.indexOf('<dialog id="how"')));
  assert.match(dialog, /data-privacy-open/);
  assert.equal((dialog.match(/<li>/g) ?? []).length, 5, "five short steps");
});

const HOW_KEYS = Object.keys(en).filter((key) => key.startsWith("how."));

test("its words are in the three languages, translated, without another game's name", () => {
  assert.equal(HOW_KEYS.length, 14);
  for (const dictionary of [pt, de]) {
    for (const key of HOW_KEYS) {
      assert.ok(dictionary[key], key);
      assert.notEqual(dictionary[key], en[key], key);
    }
  }
  for (const dictionary of [en, pt, de]) for (const key of HOW_KEYS) assert.doesNotMatch(dictionary[key], /zwift/i, key);
  assert.equal(pt["how.title"], "Como funciona");
  assert.equal(de["how.title"], "So funktioniert's");
  assert.equal(pt["how.start"], "Ecrã inteiro e começar");
  assert.equal(pt["drawer.close"], "Fechar");
});

test("what it says matches the game: the buttons it names, the file types it reads, the Strava countdown", () => {
  const quoted = (text) => [...text.matchAll(/[“«„]([^”»“]+)[”»“]/g)].map((m) => m[1]);
  for (const dictionary of [en, pt, de]) {
    const names = (keys) => keys.map((key) => dictionary[key]);
    assert.deepEqual(quoted(dictionary["how.connect"]), names(["start.howAreYouRiding", "devices.smartTrainer", "start.connect", "start.add"]));
    assert.deepEqual(quoted(dictionary["how.pick"]), names(["menu.tab.ride", "menu.tab.studio", "menu.workout", "events.title", "drawer.importWorkout"]));
    assert.ok(dictionary["how.pick"].includes(`${dictionary["ride.menu"]} › ${dictionary["menuPage.training"]} › `));
    assert.deepEqual(quoted(dictionary["how.end"]), names(["drawer.finishRide", "strava.auto.cancel", "strava.auto.setting"]));
    assert.ok(dictionary["how.end"].includes(`${dictionary["ride.menu"]} › `));
    assert.ok(dictionary["how.end"].includes(`10 `) && AUTO_SEND_SECONDS === 10);
    for (const ext of [".zwo", ".erg", ".mrc"]) assert.ok(dictionary["how.pick"].includes(ext), ext);
    for (const ext of [".fit", ".tcx", ".gpx"]) assert.ok(dictionary["how.end"].includes(ext), ext);
  }
  assert.match(html, /<input id="workout-file" type="file" accept="\.zwo,\.xml,\.erg,\.mrc" hidden \/>/);
  for (const id of ["download-fit", "download-tcx", "download-gpx", "card-portrait", "card-landscape", "finish-strava-cancel", "use-paddles", "use-simulated", "connect-trainer", "connect-hr", "connect-controller", "workout-import"]) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
});
