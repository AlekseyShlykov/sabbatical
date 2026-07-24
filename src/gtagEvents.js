// Game-specific events for the primary Google tag declared in index.html.

import { getLanguage } from "./localization.js";

let sessionStartedAt = null;
let initialized = false;
const completedDays = new Set();

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
  if (typeof window.gtag !== "function") return;
  window.gtag("event", eventName, baseParams(params));
}

function markSessionStart() {
  if (sessionStartedAt) return;
  sessionStartedAt = Date.now();
  send("game_session_begin", { engagement_seconds: 0 });
}

/** Start listeners that report the duration of an active game session. */
export function initGtagEvents() {
  if (initialized) return;
  initialized = true;
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

/** Click on Start on the splash screen. */
export function trackStartJourney() {
  markSessionStart();
  send("start_journey", { engagement_seconds: sessionElapsedSec() });
}

/** Game mode selection: story or free. */
export function trackModeSelect(mode) {
  markSessionStart();
  send("mode_select", {
    game_mode: mode,
    engagement_seconds: sessionElapsedSec(),
  });
  if (typeof window.gtag === "function") {
    window.gtag("set", "user_properties", { game_mode: mode });
  }
}

/** Calendar day 1 through 4 completed, once per day per browser session. */
export function trackDayComplete(dayNum) {
  const day = Math.floor(dayNum) || 0;
  if (day < 1 || day > 4 || completedDays.has(day)) return;
  completedDays.add(day);
  send("day_complete", {
    day_number: day,
    engagement_seconds: sessionElapsedSec(),
  });
}

/** Successful waitlist email submission. The email itself is not sent to GA. */
export function trackWaitlistSubmit() {
  send("waitlist_submit", { engagement_seconds: sessionElapsedSec() });
}
