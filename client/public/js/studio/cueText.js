/**
 * The spin studio's built-in classes come from the server with their cues
 * written in English (server/crates/sim/src/studio.rs). The server does not
 * know the rider's language, so the client says the cues it knows in that
 * language; a cue it does not know (an operator's own class) is shown as sent.
 * A test reads the server's file and fails when a built-in cue is missing here.
 */
import { t } from "../i18n/i18n.js";

const KNOWN = new Map([
  ["Warm up and find your rhythm", "studio.cue.warmUp"], // i18n-ok (the server\'s text, looked up)
  ["Recover, spin it out", "studio.cue.recover"], // i18n-ok (the server\'s text, looked up)
  ["Cool down, well done!", "studio.cue.coolDown"], // i18n-ok (the server\'s text, looked up)
  ["Settle into tempo", "studio.cue.settleTempo"], // i18n-ok (the server\'s text, looked up)
  ["Add resistance: seated climb", "studio.cue.seatedClimb"], // i18n-ok (the server\'s text, looked up)
  ["Tempo, block two", "studio.cue.tempoTwo"], // i18n-ok (the server\'s text, looked up)
  ["Heavy climb, stay seated", "studio.cue.heavyClimb"], // i18n-ok (the server\'s text, looked up)
  ["Last tempo block, keep the cadence high", "studio.cue.lastTempo"], // i18n-ok (the server\'s text, looked up)
  ["Get ready for the first set", "studio.cue.firstSet"], // i18n-ok (the server\'s text, looked up)
  ["Easy, breathe", "studio.cue.easy"], // i18n-ok (the server\'s text, looked up)
  ["Recover and shake out your legs", "studio.cue.shakeOut"], // i18n-ok (the server\'s text, looked up)
  ["Climb one: seated, steady", "studio.cue.climbOne"], // i18n-ok (the server\'s text, looked up)
  ["Climb two: it gets steeper", "studio.cue.climbTwo"], // i18n-ok (the server\'s text, looked up)
  ["The summit: stand up for the last minute", "studio.cue.summit"], // i18n-ok (the server\'s text, looked up)
  ["Back down the pyramid: climb two", "studio.cue.backDown"], // i18n-ok (the server\'s text, looked up)
  ["Last climb, you've got this", "studio.cue.lastClimb"], // i18n-ok (the server\'s text, looked up)
  ["Sweet spot: eight minutes, find your groove", "studio.cue.sweetSpot"], // i18n-ok (the server\'s text, looked up)
  ["Block two: hold it, smooth pedalling", "studio.cue.blockTwo"], // i18n-ok (the server\'s text, looked up)
]);
const INTERVAL = /^Go! Interval (\d+) of (\d+)$/; // i18n-ok (the server's text)

/** The server's cues, for the test that keeps this list complete. */
export const KNOWN_CUES = Object.freeze([...KNOWN.keys()]);

/** A class cue in the rider's language where the client knows it, else as the server sent it. */
export function cueText(cue) {
  const key = KNOWN.get(cue);
  if (key) return t(key);
  const interval = INTERVAL.exec(cue ?? "");
  return interval ? t("studio.cue.interval", { n: Number(interval[1]), count: Number(interval[2]) }) : cue;
}

/**
 * A built-in class's name in the rider's language (key `studio.class.<id>`),
 * else the name the server sent (an operator's own class). Takes the class
 * as /api/studio describes it (`id`) or as /api/info's timetable does (`class_id`).
 */
export function className(cls) {
  if (!cls) return "";
  const id = cls.id ?? cls.class_id;
  const key = `studio.class.${id}`;
  const text = id ? t(key) : key;
  return text === key ? (cls.name ?? "") : text;
}
