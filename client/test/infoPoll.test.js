import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { InfoPoll, RIDE_INFO_MS, START_IDLE_MS, START_INFO_MS } from "../public/js/net/infoPoll.js";

/** A page with a clock, one interval and listeners, all driven by the test. */
function page() {
  const listeners = new Map();
  const doc = {
    hidden: false,
    addEventListener: (type, fn) => listeners.set(type, fn),
    removeEventListener: (type) => listeners.delete(type),
  };
  let clock = 1_000_000;
  let beat = null;
  const timers = {
    set: (fn) => {
      beat = fn;
      return 1;
    },
    clear: () => {
      beat = null;
    },
  };
  return {
    doc,
    timers,
    now: () => clock,
    /** Lets `ms` pass, the page's 5 s beat included. */
    pass(ms) {
      for (let left = ms; left > 0; left -= 5000) {
        clock += Math.min(5000, left);
        beat?.();
      }
    },
    fire: (type) => listeners.get(type)?.(),
    listening: () => [...listeners.keys()].sort(),
    running: () => beat !== null,
  };
}

test("the start screen asks at once, then every 30 s, and redraws its countdowns in between", () => {
  const p = page();
  let asked = 0;
  let ticks = 0;
  const poll = new InfoPoll({ ask: () => asked++, tick: () => ticks++, everyMs: START_INFO_MS, idleAfterMs: START_IDLE_MS, doc: p.doc, now: p.now, timers: p.timers });
  poll.start();
  assert.equal(asked, 1, "the first answer is wanted now");
  p.pass(25_000);
  assert.equal(asked, 1);
  assert.equal(ticks, 5, "every 5 s the page redraws from its own clock, without a request");
  p.pass(5000);
  assert.equal(asked, 2);
  p.pass(60_000);
  assert.equal(asked, 4);
});

test("a hidden tab asks nothing, and asks again when it is shown", () => {
  const p = page();
  let asked = 0;
  const poll = new InfoPoll({ ask: () => asked++, everyMs: START_INFO_MS, idleAfterMs: START_IDLE_MS, doc: p.doc, now: p.now, timers: p.timers });
  poll.start();
  p.doc.hidden = true;
  p.pass(10 * 60_000);
  assert.equal(asked, 1, "a forgotten tab in the background costs the server nothing");
  p.doc.hidden = false;
  p.fire("visibilitychange");
  assert.equal(asked, 2, "back in front: what it shows is old");
  p.fire("visibilitychange");
  assert.equal(asked, 2, "not twice");
});

test("a start screen nobody touches stops asking after five minutes, so a small host can sleep", () => {
  const p = page();
  let asked = 0;
  const poll = new InfoPoll({ ask: () => asked++, everyMs: START_INFO_MS, idleAfterMs: START_IDLE_MS, doc: p.doc, now: p.now, timers: p.timers });
  poll.start();
  p.pass(START_IDLE_MS);
  const whileUsed = asked;
  assert.equal(whileUsed, 1 + START_IDLE_MS / START_INFO_MS);
  p.pass(60 * 60_000);
  assert.equal(asked, whileUsed, "an hour with the tab open and nobody there: no request");
  assert.equal(poll.idle, true);
  p.fire("pointermove");
  assert.equal(asked, whileUsed + 1, "the rider is back: ask now");
  assert.equal(poll.idle, false);
  p.fire("keydown");
  assert.equal(asked, whileUsed + 1);
  p.pass(START_INFO_MS);
  assert.equal(asked, whileUsed + 2, "and on, as before");
});

test("during a ride the page keeps asking, seldom, whether anybody touches it or not", () => {
  const p = page();
  let asked = 0;
  const poll = new InfoPoll({ ask: () => asked++, everyMs: RIDE_INFO_MS, doc: p.doc, now: p.now, timers: p.timers });
  poll.start();
  p.pass(60 * 60_000);
  assert.equal(asked, 1 + (60 * 60_000) / RIDE_INFO_MS, "a rider pedals for an hour without a key");
  assert.equal(poll.idle, false);
});

test("stopping removes the timer and every listener", () => {
  const p = page();
  let asked = 0;
  const poll = new InfoPoll({ ask: () => asked++, everyMs: START_INFO_MS, doc: p.doc, now: p.now, timers: p.timers });
  poll.start();
  assert.deepEqual(p.listening(), ["keydown", "pointerdown", "pointermove", "touchstart", "visibilitychange", "wheel"]);
  poll.stop();
  assert.equal(p.running(), false);
  assert.deepEqual(p.listening(), []);
  p.pass(120_000);
  assert.equal(asked, 1);
  poll.stop();
});

test("what the poll costs stays small: at most 120 requests an hour per open page, and main.js has no other /api/info loop", () => {
  assert.ok(START_INFO_MS >= 30_000 && RIDE_INFO_MS >= 30_000);
  assert.ok(START_IDLE_MS <= 10 * 60_000, "under the 15 minutes after which a free host sleeps");
  const main = readFileSync(new URL("../public/js/main.js", import.meta.url), "utf8");
  assert.equal([...main.matchAll(/new InfoPoll\(/g)].length, 2, "the start screen's and the ride's");
  assert.doesNotMatch(main, /setInterval\(\s*(refresh|refreshServerPlayers)\b/, "no bare interval asks the server");
});
