// Dependency-free i18n: module-state locale, flat dictionaries, {name} interpolation.
import en from "./en.js";
import de from "./de.js";
import pt from "./pt.js";

export const SUPPORTED_LOCALES = ["en", "de", "pt"];
export const DEFAULT_LOCALE = "en";
export const LOCALE_KEY = "openradlr.locale";

const dictionaries = { en, de, pt };
let locale = DEFAULT_LOCALE;

function baseLanguage(tag) {
  return String(tag).toLowerCase().split("-")[0];
}

export function detectLocale({ saved, languages } = {}) {
  if (SUPPORTED_LOCALES.includes(saved)) return saved;
  for (const tag of languages ?? []) {
    const base = baseLanguage(tag);
    if (SUPPORTED_LOCALES.includes(base)) return base;
  }
  return DEFAULT_LOCALE;
}

export function getLocale() {
  return locale;
}

/** Locales whose bare code would give another country's conventions: "pt" alone is Brazilian for `Intl`. */
const INTL_TAGS = { pt: "pt-PT" };

/** The current locale as a tag for `Intl`, dates, `lang` attributes and speech: European Portuguese for "pt". */
export function intlLocale() {
  return INTL_TAGS[locale] ?? locale;
}

export function setLocale(code) {
  locale = SUPPORTED_LOCALES.includes(code) ? code : DEFAULT_LOCALE;
  return locale;
}

function lookup(key) {
  return dictionaries[locale]?.[key] ?? dictionaries[DEFAULT_LOCALE][key];
}

function interpolate(template, params) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    params && name in params ? String(params[name]) : match);
}

export function t(key, params) {
  const template = lookup(key);
  return template === undefined ? key : interpolate(template, params);
}

export function tn(key, count, params) {
  const form = new Intl.PluralRules(intlLocale()).select(count);
  const withN = { ...params, n: count };
  const template = lookup(`${key}.${form}`) ?? lookup(`${key}.other`);
  return template === undefined ? key : interpolate(template, withN);
}

/**
 * The language to start in: `asked` (the page's `?lang=`, which a site that
 * shows the game passes on, so the game speaks the site's language) wins and
 * is kept as the rider's choice; else the saved choice, else the browser's.
 */
export function initLocale({ storage, languages, asked } = {}) {
  if (SUPPORTED_LOCALES.includes(asked)) {
    saveLocale(asked, storage);
    return setLocale(asked);
  }
  let saved;
  try {
    saved = storage?.getItem(LOCALE_KEY);
  } catch {
    saved = undefined;
  }
  return setLocale(detectLocale({ saved, languages }));
}

/** `?lang=pt|en|de` of a page address, lower case, or null. */
export function askedLocale(search) {
  try {
    const value = new URLSearchParams(search ?? "").get("lang")?.toLowerCase() ?? null;
    return SUPPORTED_LOCALES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function saveLocale(code, storage) {
  try {
    storage?.setItem(LOCALE_KEY, code);
  } catch {
    // storage unavailable: the choice just won't persist
  }
}
