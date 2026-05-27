// localization.js
// UI strings + story JSON loader, with a `data-i18n` DOM mirror.
// Per agents.md: UI strings live separately from story (Twine).

const LANG_PATH = (lang) => `assets/lang/${lang}.json`;
const TWINE_PATH = (lang) => `assets/twine/${lang}.json`;

const cache = {
  ui: { ru: null, en: null },
  story: { ru: null, en: null },
};

let currentLang = "ru";
const listeners = new Set();

export async function loadUI(lang) {
  if (cache.ui[lang]) return cache.ui[lang];
  const res = await fetch(LANG_PATH(lang));
  if (!res.ok) throw new Error(`UI dict not found for ${lang}`);
  const json = await res.json();
  cache.ui[lang] = json;
  return json;
}

export async function loadStory(lang) {
  if (cache.story[lang]) return cache.story[lang];
  const res = await fetch(TWINE_PATH(lang));
  if (!res.ok) throw new Error(`Story not found for ${lang}`);
  const json = await res.json();
  cache.story[lang] = json;
  return json;
}

export async function setLanguage(lang) {
  currentLang = lang;
  await loadUI(lang);
  applyDomI18n(document);
  for (const fn of listeners) {
    try { fn(lang); } catch (e) { console.error("[i18n] listener", e); }
  }
}

export function getLanguage() { return currentLang; }

export function onLanguageChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Look up dotted key in current UI dict. Returns key path back on miss. */
export function t(key, fallback) {
  const dict = cache.ui[currentLang];
  if (!dict) return fallback ?? key;
  const parts = key.split(".");
  let cur = dict;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in cur) cur = cur[p];
    else return fallback ?? key;
  }
  return typeof cur === "string" ? cur : (fallback ?? key);
}

/** `t("hud.actions", null, { used: 3, max: 10 })` → подстановка `{used}` и т.д. */
export function tFmt(key, vars = {}, fallback) {
  let s = t(key, fallback);
  for (const [name, val] of Object.entries(vars)) {
    s = s.replaceAll(`{${name}}`, String(val));
  }
  return s;
}

/**
 * Translate everything in `root`.
 * - [data-i18n="some.key"]                       → textContent (or placeholder)
 * - [data-i18n-attr="attr:key,attr2:key2"]       → element attributes
 */
export function applyDomI18n(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const value = t(key);
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      el.placeholder = value;
    } else {
      el.textContent = value;
    }
  });

  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const spec = el.getAttribute("data-i18n-attr") || "";
    spec.split(",").forEach((pair) => {
      const [attr, key] = pair.split(":").map(s => s && s.trim());
      if (!attr || !key) return;
      el.setAttribute(attr, t(key));
    });
  });
}

/** Convenience for localized location title from locations.json. */
export function localizedTitle(titleObj) {
  if (!titleObj) return "";
  if (typeof titleObj === "string") return titleObj;
  return titleObj[currentLang] ?? titleObj.en ?? titleObj.ru ?? "";
}
