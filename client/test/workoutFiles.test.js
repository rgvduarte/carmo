// ERG and MRC workout files (as TrainingPeaks and other planners export them) become the same
// workout model as a .zwo: steady blocks and ramps, as fractions of FTP.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCourseFile, parseWorkoutFile, parseZwo, ramp, steady, totalDuration } from "../public/js/ride/workout.js";
import { t } from "../public/js/i18n/i18n.js";

const fixture = (name) => readFileSync(new URL(`./fixtures/workouts/${name}`, import.meta.url), "utf8");
const shape = (workout) => workout.segments.map((s) => [s.kind, s.durationS, +s.from.toFixed(4), +s.to.toFixed(4)]);

test("an ERG with its own FTP: ramps and steady blocks as fractions of that FTP", () => {
  const workout = parseWorkoutFile(fixture("ramps.erg"), { ftp: 300, fileName: "ramps.erg" });
  assert.equal(workout.name, "Threshold steps");
  assert.equal(workout.description, "Ramp up, two steps, ramp down");
  assert.deepEqual(shape(workout), [
    ["ramp", 600, 0.4, 0.8],
    ["steady", 300, 1, 1],
    ["steady", 150, 1.1, 1.1],
    ["ramp", 300, 0.6, 0.4],
  ]);
  assert.equal(totalDuration(workout), 22.5 * 60);
});

test("the blocks are the ones a .zwo with the same steps gives", () => {
  const zwo = parseZwo(`<workout_file><name>x</name><workout>
    <Ramp Duration="600" PowerLow="0.4" PowerHigh="0.8"/><SteadyState Duration="300" Power="1"/>
  </workout></workout_file>`);
  const erg = parseCourseFile("[COURSE HEADER]\nFTP = 250\nMINUTES WATTS\n[END COURSE HEADER]\n[COURSE DATA]\n0 100\n10 200\n10 250\n15 250\n[END COURSE DATA]\n");
  assert.deepEqual(erg.segments, zwo.segments);
  assert.deepEqual(erg.segments, [ramp(600, 0.4, 0.8), steady(300, 1)]);
});

test("an ERG without FTP keeps the file's watts at the rider's FTP", () => {
  const workout = parseWorkoutFile(fixture("noftp.erg"), { ftp: 200, fileName: "C:\\plans\\Short opener.erg" });
  assert.equal(workout.name, "Short opener");
  assert.deepEqual(shape(workout), [["steady", 120, 0.75, 0.75], ["steady", 30, 1.5, 1.5]]);
  assert.equal(Math.round(workout.segments[1].from * 200), 300);
});

test("an MRC with Windows line endings: % of FTP, the text section ignored", () => {
  const text = fixture("sweetspot.mrc");
  assert.match(text, /\r\n/, "the fixture keeps its CRLF line endings");
  const workout = parseWorkoutFile(text, { ftp: 280, fileName: "sweetspot.mrc" });
  assert.equal(workout.name, "Sweet spot");
  assert.deepEqual(shape(workout), [
    ["ramp", 300, 0.5, 0.75],
    ["steady", 300, 0.9, 0.9],
    ["steady", 120, 0.55, 0.55],
    ["steady", 300, 0.9, 0.9],
  ]);
});

test("a header FTP does not change an MRC: percent is already of the rider's FTP", () => {
  const workout = parseCourseFile("\uFEFF[COURSE HEADER]\rFTP = 400\rMINUTES PERCENT\r[END COURSE HEADER]\r[COURSE DATA]\r0 60\r1 60\r[END COURSE DATA]\r");
  assert.deepEqual(shape(workout), [["steady", 60, 0.6, 0.6]]);
});

test("fractional minutes add up without losing seconds", () => {
  const workout = parseCourseFile("[COURSE HEADER]\nMINUTES PERCENT\n[END COURSE HEADER]\n[COURSE DATA]\n0 50\n0.33 50\n0.33 100\n0.67 100\n0.67 50\n1.00 50\n[END COURSE DATA]\n");
  assert.equal(totalDuration(workout), 60);
});

test("bad files are refused with a message that says what is wrong", () => {
  assert.throws(() => parseWorkoutFile("hello", { ftp: 200 }), { message: t("workout.error.notWorkoutFile") });
  assert.throws(() => parseWorkoutFile(fixture("bad-line.mrc"), { ftp: 200 }), { message: t("workout.error.courseLine", { n: 6 }) });
  assert.throws(() => parseWorkoutFile(fixture("backwards.erg"), { ftp: 200 }), { message: t("workout.error.courseLine", { n: 7 }) });
  assert.throws(() => parseWorkoutFile(fixture("no-units.erg"), { ftp: 200 }), { message: t("workout.error.courseUnits") });
  assert.throws(() => parseCourseFile("[COURSE HEADER]\nMINUTES WATTS\n[END COURSE HEADER]\n", { ftp: 200 }), { message: t("workout.error.notCourse") });
  assert.throws(() => parseCourseFile("[COURSE HEADER]\nMINUTES WATTS\n[END COURSE HEADER]\n[COURSE DATA]\n0 100\n[END COURSE DATA]\n", { ftp: 200 }), { message: t("workout.error.noBlocks") });
  // 1000 W at 200 W FTP is 500 %: beyond what any block may ask.
  assert.throws(() => parseCourseFile("[COURSE HEADER]\nMINUTES WATTS\n[END COURSE HEADER]\n[COURSE DATA]\n0 1000\n1 1000\n[END COURSE DATA]\n", { ftp: 200 }), { message: t("workout.error.badPower", { n: 1 }) });
});

test("a .zwo still goes through the same entry point", () => {
  const workout = parseWorkoutFile('<workout_file><name>Z</name><workout><SteadyState Duration="60" Power="0.7"/></workout></workout_file>');
  assert.deepEqual(shape(workout), [["steady", 60, 0.7, 0.7]]);
});

test("the file input takes .erg and .mrc and says how to bring a workout from TrainingPeaks", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const accept = /id="workout-file"[^>]*accept="([^"]+)"/.exec(html)[1].split(",");
  for (const ext of [".zwo", ".erg", ".mrc"]) assert.ok(accept.includes(ext), ext);
  assert.match(html, /id="workout-import-help"[^>]*data-i18n="drawer.importHelp"/);
});
