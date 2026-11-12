/**
 * Ride photos: snapshots of the world with a small stats overlay. They are
 * drawn on a 2D canvas (no DOM screenshot), so they look the same on every
 * device. The browser keeps them in memory until the page is closed; the
 * finish dialog lists them for download or sharing, next to the ride image
 * (view/rideCard.js), which takes its lockup, colours and fonts from here.
 * Strava's API takes no pictures: the rider adds them to the activity by hand.
 */

import { formatDistanceWithUnit, formatDuration, formatNumber, formatSpeed, speedUnit } from "../util/format.js";
import { BRAND_SYMBOL, BRAND_TAG, BRAND_WORD } from "../brand.js";
import { intlLocale, t } from "../i18n/i18n.js";

export const MAX_PHOTOS = 30;
const SANS = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'; // i18n-ok
/** Numbers: Anton with the digit 1 as wide as the others (the cut the skin ships), one weight. */
export const NUM = '"GC Anton Tab", "Anton", "Impact", "Arial Narrow Bold", sans-serif'; // i18n-ok
export const DISPLAY = '"Anton", "Impact", "Arial Narrow Bold", sans-serif'; // i18n-ok
export const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'; // i18n-ok
// gocarmo.com's palette: near-black, off-white ink, muted, one gold.
export const BG = "#0b0b0c";
export const INK = "#f2f1ec";
export const MUTED = "#a3a29c";
const MUTED_ON_PHOTO = "rgba(242, 241, 236, 0.78)";
export const ACCENT = "#e6b450";
/** The slant of the site's titles and of the lockup: 10 degrees. */
export const SLANT = Math.tan((10 * Math.PI) / 180);

/** "gocarmo-ride-2026-10-14-1530-rolling-hills-3.png" */
export function photoFileName(t, routeId = "ride", suffix = "") {
  const d = new Date(t);
  const pad = (n) => String(n).padStart(2, "0");
  const safe = String(routeId).replace(/[^a-z0-9-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "ride";
  const tail = suffix === "" ? "" : `-${suffix}`;
  return `gocarmo-ride-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${safe}${tail}.png`;
}

/**
 * The photos taken during one ride, oldest first. Holds blobs plus object
 * URLs for the thumbnails; the oldest photo is dropped beyond `max`.
 */
export class PhotoAlbum {
  /** @type {{id: number, blob: Blob, url: string, name: string, takenAt: number}[]} */
  photos = [];
  /** The ride image (view/rideCard.js) in the format on show, drawn when the finish dialog opens. */
  summary = null;
  #nextId = 1;

  /** @param {{max?: number, createUrl?: (blob: Blob) => string, revokeUrl?: (url: string) => void}} [options] */
  constructor({ max = MAX_PHOTOS, createUrl = (blob) => URL.createObjectURL(blob), revokeUrl = (url) => URL.revokeObjectURL(url) } = {}) {
    this.max = max;
    this.createUrl = createUrl;
    this.revokeUrl = revokeUrl;
  }

  /** Number of photos taken (the ride image doesn't count). */
  get size() {
    return this.photos.length;
  }

  /** Every image of the ride: the ride image first, then the photos. */
  get images() {
    return this.summary ? [this.summary, ...this.photos] : [...this.photos];
  }

  setSummary(blob, { name, takenAt = Date.now() }) {
    if (this.summary) this.revokeUrl(this.summary.url);
    this.summary = { id: 0, blob, url: this.createUrl(blob), name, takenAt, summary: true };
    return this.summary;
  }

  add(blob, { name, takenAt = Date.now() }) {
    const photo = { id: this.#nextId++, blob, url: this.createUrl(blob), name, takenAt };
    this.photos.push(photo);
    while (this.photos.length > this.max) this.revokeUrl(this.photos.shift().url);
    return photo;
  }

  remove(id) {
    const index = this.photos.findIndex((photo) => photo.id === id);
    if (index < 0) return false;
    this.revokeUrl(this.photos[index].url);
    this.photos.splice(index, 1);
    return true;
  }

  /** Drops every photo and the ride image, e.g. when a new ride starts. */
  clear() {
    for (const image of this.images) this.revokeUrl(image.url);
    this.photos = [];
    this.summary = null;
  }
}

/** What the finish dialog offers: the ride image has its own save and share, apart from the photos taken on the road. */
export function photoActions(album, shareable) {
  return {
    summaryEnabled: Boolean(album.summary),
    summaryShareVisible: shareable && Boolean(album.summary),
    allVisible: album.photos.length > 0,
    shareVisible: shareable && album.photos.length > 0,
  };
}

/** The stats shown on an in-ride photo, in display order. */
export function photoStats({ distanceM, elapsedS, power, speed, gradePercent }) {
  return [
    [t("photos.stat.distance"), formatDistanceWithUnit(distanceM)],
    [t("photos.stat.time"), formatDuration(elapsedS)],
    [t("photos.stat.power"), `${Math.round(power || 0)} W`],
    [t("photos.stat.speed"), `${formatSpeed(speed || 0)} ${speedUnit()}`],
    [t("photos.stat.grade"), `${gradePercent >= 0 ? "" : "−"}${formatNumber(Math.abs(gradePercent || 0), 1)} %`],
  ];
}

/**
 * Splits values into `count` buckets and averages each; used to draw the
 * power and elevation lines of a long ride on a small chart.
 * @param {number[]} values
 */
export function downsample(values, count) {
  if (values.length <= count) return [...values];
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const from = Math.floor((i * values.length) / count);
    const to = Math.max(from + 1, Math.floor(((i + 1) * values.length) / count));
    let sum = 0;
    for (let j = from; j < to; j += 1) sum += values[j];
    out.push(sum / (to - from));
  }
  return out;
}

/**
 * Copies the visible world into a new canvas. Call it in the same frame as
 * the WebGL render: without preserveDrawingBuffer the buffer is cleared once
 * the browser has shown it.
 * @param {HTMLCanvasElement} source
 */
export function grabScene(source, doc = document) {
  const canvas = doc.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  canvas.getContext("2d").drawImage(source, 0, 0);
  return canvas;
}

/**
 * Loads the fonts the images are drawn in: a canvas falls back silently to
 * another face when one is not there yet. `text` is what will be drawn, so the
 * right subset (Latin, or Latin Extended for a name like "Łódź") is fetched.
 * Each face is asked for at its real weight: Anton has one (400), and a canvas
 * asked for a bolder one would smear it.
 */
export function photoFontsReady(doc = document, text = "") {
  if (!doc.fonts?.load) return Promise.resolve();
  const sample = `${text} 0123456789`;
  return Promise.all([`400 40px ${DISPLAY}`, `400 40px ${NUM}`, `500 20px ${MONO}`, `500 20px ${SANS}`].map((font) => doc.fonts.load(font, sample))).catch(() => {});
}

/** Sets the tracking of caps labels where the canvas supports it. */
export function track(ctx, em, size) {
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${(em * size).toFixed(2)}px`;
}

/** Text slanted like the site's titles (Anton has no italic of its own): sheared about its baseline, so `x`, `y` stay real page coordinates. */
export function slanted(ctx, text, x, y) {
  ctx.save();
  ctx.transform(1, 0, -SLANT, 1, SLANT * y, 0);
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * The GOCARMO Ride lockup: the symbol (moon in ink, sun in gold), the name and
 * "RIDE" in gold. `height` is the symbol's; the baseline of the name is `y`.
 * @returns {number} the width drawn
 */
export function lockup(ctx, x, y, height) {
  let at = x;
  if (typeof Path2D === "function") {
    const k = height / BRAND_SYMBOL.size;
    ctx.save();
    ctx.translate(x, y - height * 0.86);
    ctx.scale(k, k);
    ctx.fillStyle = INK;
    ctx.fill(new Path2D(BRAND_SYMBOL.moon));
    ctx.fillStyle = ACCENT;
    ctx.fill(new Path2D(BRAND_SYMBOL.sun));
    ctx.restore();
    at += height * 1.22;
  }
  const size = height * 0.74;
  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `400 ${size}px ${DISPLAY}`;
  track(ctx, 0.01, size);
  slanted(ctx, BRAND_WORD, at, y);
  at += ctx.measureText(BRAND_WORD).width + size * 0.3;
  ctx.fillStyle = ACCENT;
  ctx.font = `400 ${size * 0.5}px ${DISPLAY}`;
  track(ctx, 0.16, size * 0.5);
  slanted(ctx, BRAND_TAG, at, y);
  at += ctx.measureText(BRAND_TAG).width;
  track(ctx, 0, 1);
  return at - x;
}

/**
 * Draws a ride photo: the scene with a stats band along the bottom. A wide
 * photo has the name left and the stats right; an upright one (a phone) stacks
 * them, so the route's name and three stats fit its width.
 * @param {HTMLCanvasElement} scene from grabScene
 * @param {{routeName: string, stats: [string, string][], when: Date}} info
 */
export function composePhoto(scene, { routeName, stats, when }, doc = document) {
  const canvas = doc.createElement("canvas");
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  ctx.drawImage(scene, 0, 0);

  const upright = h > w * 1.15;
  const u = upright ? w / 430 : Math.max(w, h * 1.6) / 1280; // layout unit: 1 at 430 px wide upright, at 1280 px wide otherwise
  const band = (upright ? 190 : 92) * u;
  const fade = ctx.createLinearGradient(0, h - band * 1.8, 0, h);
  fade.addColorStop(0, "rgba(11, 11, 12, 0)");
  fade.addColorStop(0.45, "rgba(11, 11, 12, 0.6)");
  fade.addColorStop(1, "rgba(11, 11, 12, 0.88)");
  ctx.fillStyle = fade;
  ctx.fillRect(0, h - band * 1.8, w, band * 1.8);

  const pad = (upright ? 22 : 28) * u;
  const baseline = h - pad;
  const title = routeName.toUpperCase();
  ctx.textBaseline = "alphabetic";
  const label = (text, x, y) => {
    ctx.fillStyle = MUTED_ON_PHOTO;
    ctx.font = `500 ${(upright ? 10 : 11) * u}px ${MONO}`;
    track(ctx, 0.1, 11 * u);
    ctx.fillText(text.toUpperCase(), x, y);
    track(ctx, 0, 1);
  };

  if (upright) {
    lockup(ctx, pad, baseline - 104 * u, 22 * u);
    ctx.fillStyle = INK;
    ctx.font = `400 ${30 * u}px ${DISPLAY}`;
    slanted(ctx, fit(ctx, title, w - 2 * pad), pad, baseline - 62 * u);
    // Three stats in equal columns: distance, time, power.
    const column = (w - 2 * pad) / 3;
    stats.slice(0, 3).forEach(([name, value], i) => {
      const x = pad + i * column;
      label(name, x, baseline - 34 * u);
      ctx.fillStyle = INK;
      let size = 30 * u;
      do ctx.font = `400 ${size}px ${NUM}`;
      while (ctx.measureText(value).width > column - 8 * u && (size -= 2 * u) > 14 * u);
      ctx.fillText(value, x, baseline);
    });
  } else {
    lockup(ctx, pad, baseline - 36 * u, 20 * u);
    ctx.fillStyle = INK;
    ctx.font = `400 ${28 * u}px ${DISPLAY}`;
    slanted(ctx, fit(ctx, title, w * 0.32), pad, baseline);

    // Stats from the right edge leftwards.
    let x = w - pad;
    for (const [name, value] of [...stats].reverse()) {
      ctx.font = `400 ${36 * u}px ${NUM}`;
      const valueWidth = ctx.measureText(value).width;
      ctx.font = `500 ${11 * u}px ${MONO}`;
      track(ctx, 0.1, 11 * u);
      const width = Math.max(valueWidth, ctx.measureText(name.toUpperCase()).width);
      track(ctx, 0, 1);
      if (x - width < w * 0.38) break; // keep clear of the route name on narrow screens
      ctx.textAlign = "right";
      label(name, x, baseline - 40 * u);
      ctx.fillStyle = INK;
      ctx.font = `400 ${36 * u}px ${NUM}`;
      ctx.fillText(value, x, baseline);
      ctx.textAlign = "left";
      x -= width + 30 * u;
    }
  }

  // The date stands on the sky: a faint veil from the top keeps it readable on a bright one.
  const veil = ctx.createLinearGradient(0, 0, 0, pad + 60 * u);
  veil.addColorStop(0, "rgba(11, 11, 12, 0.42)");
  veil.addColorStop(1, "rgba(11, 11, 12, 0)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, w, pad + 60 * u);
  ctx.textAlign = "right";
  ctx.fillStyle = INK;
  ctx.font = `500 ${12 * u}px ${MONO}`;
  ctx.fillText(when.toLocaleString(intlLocale(), { dateStyle: "medium", timeStyle: "short" }), w - pad, pad + 12 * u);
  ctx.textAlign = "left";
  return canvas;
}

/** Shortens text with an ellipsis until it fits `maxWidth`. */
function fit(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/** Resolves with a PNG blob of the canvas. */
export function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("could not encode the image"))), "image/png");
  });
}

/** Saves a blob as a file through a temporary link. */
export function downloadBlob(blob, name, doc = document) {
  const url = URL.createObjectURL(blob);
  const link = Object.assign(doc.createElement("a"), { href: url, download: name });
  doc.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** True when the device can hand image files to other apps (e.g. the Strava app on a phone). */
export function canShareFiles(nav = globalThis.navigator) {
  try {
    const probe = new File([new Uint8Array(1)], "probe.png", { type: "image/png" });
    return Boolean(nav?.canShare?.({ files: [probe] }));
  } catch {
    return false;
  }
}
