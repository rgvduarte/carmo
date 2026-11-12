/**
 * What the server's refusals mean, in the rider's language. The server answers
 * in English with a code (`{type: "error", code, message}`); the rider reads
 * the line for the code, never the server's own words. A code this file does
 * not know is still said, plainly, as a refusal.
 */
import { t } from "../i18n/i18n.js";

const LINES = Object.freeze({
  server_full: "net.error.full",
  device_not_allowed: "net.error.deviceNotAllowed",
  unknown_route: "net.error.unknownRoute",
  invalid_name: "net.error.invalidName",
  invalid_weight: "net.error.invalidWeight",
  protocol_mismatch: "net.error.protocol",
  rate_limited: "net.error.rateLimited",
  chat_rate_limited: "net.error.chatRateLimited",
  handshake_timeout: "net.error.timeout",
  idle_timeout: "net.error.timeout",
  hello_required: "net.error.protocol",
  join_required: "net.error.protocol",
  already_joined: "net.error.protocol",
  bad_message: "net.error.protocol",
  pause_rejected: "net.error.pauseRejected",
  in_event: "net.error.inEvent",
});

/** The race's reasons, told apart by the server's (English) message. */
function raceLine(message) {
  if (/during its countdown/i.test(message ?? "")) return t("net.error.raceNotOpen");
  if (/already in progress/i.test(message ?? "")) return t("net.error.raceRunning");
  return t("net.error.raceRejected");
}

/** The rider's line for a refusal with this code (and the server's message, for the race's reasons). */
export function serverErrorLine(code, message = "") {
  if (!code) return null;
  if (code === "race_rejected") return raceLine(message);
  return LINES[code] ? t(LINES[code]) : t("net.error.refused", { code });
}

/** Every code this file has a line for (a test checks the server's codes against it). */
export const KNOWN_SERVER_ERRORS = Object.freeze([...Object.keys(LINES), "race_rejected"]);
