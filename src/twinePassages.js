// twinePassages.js — пассажи Twine с префиксом Day N и привязка к календарному дню.

/** Имя пассажа вида `Day2. Blue.` / `Day 2. Green` / `Day3. …` */
const DAY_PASSAGE_RE = /^Day\s*(\d+)\b/i;

/** Номер дня из имени пассажа или `null`, если это не day-пассаж. */
export function getPassageDayNumber(passageName) {
  const m = String(passageName || "").match(DAY_PASSAGE_RE);
  return m ? Number(m[1]) : null;
}

/** Day N пассаж доступен только в календарный день N; остальные — всегда. */
export function isPassageAvailableOnDay(passageName, calendarDay) {
  const passageDay = getPassageDayNumber(passageName);
  if (passageDay === null) return true;
  return passageDay === calendarDay;
}

/**
 * Какой пассаж запустить в локации: `twinePassageByDay[N]` в свой день,
 * иначе `twinePassage`.
 */
export function pickTwinePassageForLocation(loc, {
  calendarDay,
  activeStoryDay,
  storyOrder = [],
  isLocDoneOnStoryDay = () => false,
} = {}) {
  const fallback = loc.twinePassage;
  if (!activeStoryDay || activeStoryDay !== calendarDay) return fallback;

  const dayPassage = loc.twinePassageByDay?.[String(calendarDay)];
  if (!dayPassage) return fallback;
  if (!isPassageAvailableOnDay(dayPassage, calendarDay)) {
    console.warn(
      `[twine] passage "${dayPassage}" is locked to day ${getPassageDayNumber(dayPassage)}, calendar is ${calendarDay}`
    );
    return fallback;
  }

  const idx = storyOrder.indexOf(loc.id);
  if (idx < 0) return fallback;
  if (isLocDoneOnStoryDay(loc.id)) return fallback;
  if (idx > 0 && !isLocDoneOnStoryDay(storyOrder[idx - 1])) return fallback;

  return dayPassage;
}
