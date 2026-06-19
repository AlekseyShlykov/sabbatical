// dayCycle.js — действия за день, прогресс книг, лимиты из сценария.

import { getState, update, getFlag, setFlag } from "./state.js";

let onActionSpentCallback = null;

/** Вызывается после каждой траты действия (ход, письмо). */
export function setOnActionSpent(fn) {
  onActionSpentCallback = fn;
}

export const MAX_ACTIONS_PER_DAY = 10;
export const MAX_BOOK_PERCENT_PER_DAY = 3;
export const DAY_START_HOUR = 8;
/** Календарный час вечеринки в баре (день 4, свободный режим). */
export const PARTY_CLOCK_HOUR = 15;
export const PARTY_CLOCK_ACTIONS = PARTY_CLOCK_HOUR - DAY_START_HOUR;

/** Календарный старт сюжета: день 1 = 1 сентября (UTC, без года в подписи). */
const STORY_CALENDAR_YEAR = 2024;
const STORY_CALENDAR_MONTH = 8; // сентябрь (0-based)
const STORY_CALENDAR_DAY = 1;

let dayTransitionActive = false;

const WRITING_PASSAGES = new Set([
  "Сесть и писать книгу",
  "Научная книга",
  "Роман",
]);

export function setDayTransitionActive(on) {
  dayTransitionActive = Boolean(on);
}

export function isDayTransitionActive() {
  return dayTransitionActive;
}

const FREE_CHOICE_TARGETS = new Set([
  "Отдохнуть немного",
  "orange house",
  "Пойду исследовать остров",
]);

/** Выбор, который сам тратит действие (остальные в локации — бесплатно). */
const ACTION_CHOICE_TARGETS = new Set([
  "Сесть и писать книгу",
]);

function ensureDayState(s) {
  if (!s.dayCycle) {
    s.dayCycle = { day: 1, actionsUsed: 0, bookToday: { science: 0, novel: 0 } };
  }
  if (!s.bookProgress) s.bookProgress = { science: 0, novel: 0 };
  if (!s.dayCycle.bookToday) s.dayCycle.bookToday = { science: 0, novel: 0 };
  return s.dayCycle;
}

/** HUD и лимиты после онбординга (см. enableGameHud / //появляется графа…). */
export function isDayCycleActive() {
  return Boolean(getFlag("bookUi") && getState().mode);
}

/** Показ панели книг, даты и часов — после выбора режима (story / free). */
export function isHudVisible() {
  if (!getFlag("bookUi") || !getState().mode) return false;
  const { screen } = getState();
  return screen === "map" || screen === "location";
}

/** Включить HUD; день 1 сбрасывается только при первом включении. */
export function enableGameHud() {
  const already = getFlag("bookUi");
  setFlag("bookUi", true);
  update((s) => {
    ensureDayState(s);
    if (!s.bookProgress) s.bookProgress = { science: 0, novel: 0 };
    if (!already) {
      s.dayCycle.day = 1;
      s.dayCycle.actionsUsed = 0;
      s.dayCycle.bookToday = { science: 0, novel: 0 };
    }
    return s;
  });
}

export function getDayCycle() {
  return ensureDayState(getState());
}

export function canSpendAction() {
  if (!isDayCycleActive()) return true;
  return getDayCycle().actionsUsed < MAX_ACTIONS_PER_DAY;
}

export function isDayExhausted() {
  if (!isDayCycleActive()) return false;
  return getDayCycle().actionsUsed >= MAX_ACTIONS_PER_DAY;
}

export function actionsRemaining() {
  return Math.max(0, MAX_ACTIONS_PER_DAY - getDayCycle().actionsUsed);
}

export function spendAction() {
  if (dayTransitionActive) return false;
  if (!isDayCycleActive()) return true;
  if (!canSpendAction()) return false;
  update((s) => {
    const d = ensureDayState(s);
    d.actionsUsed += 1;
    return s;
  });
  return true;
}

export function gameClockLabel() {
  const used = getDayCycle().actionsUsed;
  const hour = Math.min(DAY_START_HOUR + used, DAY_START_HOUR + MAX_ACTIONS_PER_DAY);
  return `${hour}:00`;
}

/** Дата для HUD: день 1 → 1 сентября, день 2 → 2 сентября, … */
export function gameDateLabel(dayNumber = 1, locale = "ru") {
  const n = Math.max(1, Math.floor(dayNumber) || 1);
  const d = new Date(
    Date.UTC(STORY_CALENDAR_YEAR, STORY_CALENDAR_MONTH, STORY_CALENDAR_DAY + n - 1)
  );
  const lang = locale === "en" ? "en-US" : "ru-RU";
  return new Intl.DateTimeFormat(lang, { day: "numeric", month: "long" }).format(d);
}

export function advanceDay() {
  update((s) => {
    const d = ensureDayState(s);
    d.day += 1;
    d.actionsUsed = 0;
    d.bookToday = { science: 0, novel: 0 };
    return s;
  });
}

export function passageCostsAction(passageName) {
  return WRITING_PASSAGES.has(passageName);
}

export function isFreeChoiceTarget(target) {
  return FREE_CHOICE_TARGETS.has(target);
}

export function choiceCostsAction(target) {
  if (!isDayCycleActive()) return false;
  if (isFreeChoiceTarget(target)) return false;
  return ACTION_CHOICE_TARGETS.has(target);
}

export function canWriteBook(kind) {
  if (!isDayCycleActive()) return true;
  const key = kind === "novel" ? "novel" : "science";
  const d = getDayCycle();
  return (
    canSpendAction() &&
    (d.bookToday[key] || 0) < MAX_BOOK_PERCENT_PER_DAY
  );
}

/** +1% к книге, −1 действие; не больше 3% за день на каждую книгу. */
export function tryAddBookProgress(kind) {
  if (dayTransitionActive) return { ok: false, reason: "dayTransition" };
  if (!isDayCycleActive()) {
    addBookProgressOnly(kind);
    if (!getFlag("bookUi")) enableGameHud();
    return { ok: true };
  }
  const key = kind === "novel" ? "novel" : "science";
  const d = getDayCycle();
  if ((d.bookToday[key] || 0) >= MAX_BOOK_PERCENT_PER_DAY) {
    return { ok: false, reason: "dailyBookCap" };
  }
  if (!canSpendAction()) {
    return { ok: false, reason: "noActions" };
  }
  update((s) => {
    const dc = ensureDayState(s);
    if (!s.bookProgress) s.bookProgress = { science: 0, novel: 0 };
    s.bookProgress[key] = Math.min(100, (s.bookProgress[key] || 0) + 1);
    dc.bookToday[key] = (dc.bookToday[key] || 0) + 1;
    dc.actionsUsed += 1;
    return s;
  });
  if (!getFlag("bookUi")) enableGameHud();
  if (onActionSpentCallback) onActionSpentCallback();
  return { ok: true };
}

function addBookProgressOnly(kind) {
  update((s) => {
    if (!s.bookProgress) s.bookProgress = { science: 0, novel: 0 };
    const key = kind === "novel" ? "novel" : "science";
    s.bookProgress[key] = Math.min(100, (s.bookProgress[key] || 0) + 1);
    return s;
  });
}

export function normalizeDayCycleSave(snapshot) {
  const s = { ...snapshot };
  ensureDayState(s);
  if (!s.bookProgress) s.bookProgress = { science: 0, novel: 0 };
  return s;
}
