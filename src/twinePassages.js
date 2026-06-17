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
 * Упорядоченная очередь сцен локации:
 *   [twinePassage, ...twinePassageByDay по возрастанию дня].
 * Значение `twinePassageByDay[N]` может быть строкой или массивом строк
 * (несколько сцен в один день). Дубликаты отбрасываются.
 */
export function getLocationSceneSequence(loc) {
  const seq = [];
  const push = (p) => {
    if (p && !seq.includes(p)) seq.push(p);
  };
  push(loc?.twinePassage);

  const byDay = loc?.twinePassageByDay;
  if (byDay && typeof byDay === "object") {
    Object.keys(byDay)
      .map((k) => ({ day: Number(k), value: byDay[k] }))
      .filter((e) => Number.isFinite(e.day) && e.value != null)
      .sort((a, b) => a.day - b.day)
      .forEach((e) => {
        const vals = Array.isArray(e.value) ? e.value : [e.value];
        vals.forEach(push);
      });
  }
  return seq;
}

/** Сцена локации по индексу прогресса (с ограничением до последней). */
export function pickLocationSceneByIndex(loc, index) {
  const seq = getLocationSceneSequence(loc);
  if (seq.length === 0) return loc?.twinePassage || null;
  const i = Math.max(0, Math.min(Number(index) || 0, seq.length - 1));
  return seq[i];
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
  freeExplore = false,
} = {}) {
  const fallback = loc.twinePassage;
  const dayPassage = loc.twinePassageByDay?.[String(calendarDay)];
  if (!dayPassage) return fallback;
  if (!isPassageAvailableOnDay(dayPassage, calendarDay)) {
    console.warn(
      `[twine] passage "${dayPassage}" is locked to day ${getPassageDayNumber(dayPassage)}, calendar is ${calendarDay}`
    );
    return fallback;
  }

  if (freeExplore) return dayPassage;

  if (!activeStoryDay || activeStoryDay !== calendarDay) return fallback;

  const idx = storyOrder.indexOf(loc.id);
  if (idx < 0) return fallback;
  if (isLocDoneOnStoryDay(loc.id)) return fallback;
  if (idx > 0 && !isLocDoneOnStoryDay(storyOrder[idx - 1])) return fallback;

  return dayPassage;
}
