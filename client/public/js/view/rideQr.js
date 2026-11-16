/**
 * The QR code on the ride image: a phone that sees the image (in a Strava
 * feed, a chat, a story) opens the game with it. Made in the browser by the
 * vendored encoder (qrcode-generator by Kazuhiko Arase, MIT, unmodified in
 * client/public/vendor/qrcode-generator/); nothing is fetched.
 *
 * Dark modules on a light square with a quiet zone, the way every camera
 * reads a QR code (many do not read one with its colours swapped).
 */
import qrcode from "../../vendor/qrcode-generator/qrcode.mjs";
import { BG, INK } from "./photos.js";

/** Where the code leads: the game's own host, short, so the code stays small (version 2, 25 × 25 modules). */
export const QR_URL = "https://ride.gocarmo.com/";
/** Error correction M: about 15 % of the code can be lost (a crease of compression, a corner under a thumb). */
export const QR_LEVEL = "M";
/** The quiet zone around the modules, in modules. The standard asks for 4; 2 is what readers need on a plain light square. */
export const QR_QUIET = 2;
export const QR_DARK = BG;
export const QR_LIGHT = INK;

/**
 * The modules of a QR code for `text`, smallest version that holds it.
 * @returns {{size: number, dark: (row: number, col: number) => boolean}}
 */
export function qrMatrix(text = QR_URL, level = QR_LEVEL) {
  const code = qrcode(0, level);
  code.addData(text);
  code.make();
  return { size: code.getModuleCount(), dark: (row, col) => code.isDark(row, col) };
}

/** The side of the light square around a code of `size` modules, at `module` pixels a module. */
export const qrPanelSide = (size, module, quiet = QR_QUIET) => (size + 2 * quiet) * module;

/**
 * Draws the code with its light square, top left at (x, y): whole pixels per
 * module, so the edges stay sharp in the PNG and after a feed scales it.
 */
export function drawQr(ctx, matrix, x, y, module, quiet = QR_QUIET) {
  const side = qrPanelSide(matrix.size, module, quiet);
  ctx.fillStyle = QR_LIGHT;
  ctx.fillRect(x, y, side, side);
  ctx.fillStyle = QR_DARK;
  const left = x + quiet * module;
  const top = y + quiet * module;
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.dark(row, col)) ctx.fillRect(left + col * module, top + row * module, module, module);
    }
  }
  return side;
}
