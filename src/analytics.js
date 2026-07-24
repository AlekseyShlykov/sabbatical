// analytics.js — Google Analytics 4 (gtag.js).
// ID: data/analytics.json (приоритет) или FALLBACK_MEASUREMENT_ID ниже.

import { getLanguage } from "./localization.js";

const CONFIG_URL = "data/analytics.json";
/** Запасной ID, если fetch конфига не удался (тот же, что в analytics.json). */
const FALLBACK_MEASUREMENT_ID = "G-DS2F6EH736";

let ready = false;
let measurementId = "";
let sessionStartedAt = null;
const completedDays = new Set();
/** События, пришедшие до готовности gtag — отправим сразу после init. */
const pendingEvents = [];

async function loadConfig() {
  try {
    const res = await fetch(CONFIG_URL, { cache: "no-cache" });
    if (!res.ok) return {};
    return await res.json();
  } catch {
    return {};
  }
}

function injectGtag(id) {
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer.push(arguments);
  };
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
  window.gtag("js", new Date());
  window.gtag("config", id, {
    send_page_view: true,
    page_title: document.title,
    page_location: window.location.href,
  });
}

/** Загрузить gtag и конфиг. Безопасно вызывать при старте приложения. */
export async function initAnalytics() {
  if (ready) return;
  const cfg = await loadConfig();
  const id = String(cfg.ga4MeasurementId || FALLBACK_MEASUREMENT_ID || "").trim();
  if (!id) return;
  measurementId = id;
  injectGtag(id);
  ready = true;
  wireSessionEngagement();
  flushPendingEvents();
}

function baseParams(extra = {}) {
  return {
    language: getLanguage(),
    ...extra,
  };
}

function sessionElapsedSec() {
  if (!sessionStartedAt) return 0;
  return Math.max(0, Math.round((Date.now() - sessionStartedAt) / 1000));
}

function send(eventName, params = {}) {
  if (!ready || typeof window.gtag !== "function") {
    pendingEvents.push({ eventName, params });
    return;
  }
  window.gtag("event", eventName, baseParams(params));
}

function flushPendingEvents() {
  if (!ready || typeof window.gtag !== "function") return;
  while (pendingEvents.length) {
    const { eventName, params } = pendingEvents.shift();
    window.gtag("event", eventName, baseParams(params));
  }
}

function markSessionStart() {
  if (sessionStartedAt) return;
  sessionStartedAt = Date.now();
  // Не используем имя session_start — это зарезервированное событие GA4.
  send("game_session_begin", { engagement_seconds: 0 });
}

function wireSessionEngagement() {
  const flush = () => {
    if (!sessionStartedAt) return;
    const sec = sessionElapsedSec();
    if (sec < 5) return;
    send("play_session_end", { engagement_seconds: sec });
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}

/** Клик «Начать приключение» на заставке (любой язык). */
export function trackStartJourney() {
  markSessionStart();
  send("start_journey", { engagement_seconds: sessionElapsedSec() });
}

/** Выбор режима: story | free. */
export function trackModeSelect(mode) {
  markSessionStart();
  send("mode_select", {
    game_mode: mode,
    engagement_seconds: sessionElapsedSec(),
  });
  if (typeof window.gtag === "function" && measurementId) {
    window.gtag("set", "user_properties", { game_mode: mode });
  }
}

/** Завершение календарного дня 1–4 (один раз за сессию на каждый день). */
export function trackDayComplete(dayNum) {
  const day = Math.floor(dayNum) || 0;
  if (day < 1 || day > 4) return;
  if (completedDays.has(day)) return;
  completedDays.add(day);
  send("day_complete", {
    day_number: day,
    engagement_seconds: sessionElapsedSec(),
  });
}

/** Успешная отправка email из формы вейтлиста. */
export function trackWaitlistSubmit() {
  send("waitlist_submit", { engagement_seconds: sessionElapsedSec() });
}
