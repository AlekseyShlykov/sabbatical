// storyMode.js — линейные маршруты по дням в режиме «Сюжет».

import { getState, update, unlock, setFlag, getFlag } from "./state.js";
import { getDayCycle } from "./dayCycle.js";

const DEFAULT_STORY_DAY_ONE = [
  "orangehouse",
  "bluehouse",
  "forest",
  "bar",
  "whitehouse",
  "lighthouse",
  "beach",
];

const DEFAULT_STORY_DAY_TWO = ["bluehouse", "greenhouse"];

export function getStoryOrder(locationsData) {
  const order = locationsData?.storyOrder;
  if (Array.isArray(order) && order.length > 0) return [...order];
  return [...DEFAULT_STORY_DAY_ONE];
}

/** Маршрут сюжета для календарного дня N (`storyOrder` = день 1, `storyOrderDay2` = день 2, …). */
export function getStoryOrderForDay(dayNum, locationsData) {
  const n = Math.max(1, Math.floor(dayNum) || 1);
  if (n === 1) return getStoryOrder(locationsData);
  const key = `storyOrderDay${n}`;
  const order = locationsData?.[key];
  if (Array.isArray(order) && order.length > 0) return [...order];
  if (n === 2) return [...DEFAULT_STORY_DAY_TWO];
  return [];
}

export function isStoryMode(state = getState()) {
  return state.mode === "story";
}

export function storyDayEndedFlag(dayNum) {
  const n = Math.max(1, Math.floor(dayNum) || 1);
  return n === 1 ? "storyDay1Ended" : `storyDay${n}Ended`;
}

export function storyDayLocFlag(dayNum, locId) {
  return `storyDay${Math.max(1, Math.floor(dayNum) || 1)}_${locId}`;
}

export function isStoryDayOneEnded() {
  return Boolean(getFlag(storyDayEndedFlag(1)));
}

export function isStoryDayRouteEnded(dayNum) {
  return Boolean(getFlag(storyDayEndedFlag(dayNum)));
}

export function isStoryDayLocationDone(dayNum, locId) {
  if (dayNum === 1) {
    return getState().visitedLocations.includes(locId);
  }
  return Boolean(getFlag(storyDayLocFlag(dayNum, locId)));
}

/** Маршрут дня N активен: предыдущие дни завершены, календарь ≥ N. */
export function isStoryDayRouteActive(state, dayNum, locationsData) {
  if (!isStoryMode(state)) return false;
  const n = Math.max(1, Math.floor(dayNum) || 1);
  if (getDayCycle().day < n) return false;
  if (!getStoryOrderForDay(n, locationsData).length) return false;
  if (isStoryDayRouteEnded(n)) return false;
  for (let d = 1; d < n; d++) {
    if (!isStoryDayRouteEnded(d)) return false;
  }
  return true;
}

/** Текущий активный сюжетный день (маршрут) или `null`. */
export function getActiveStoryDayNumber(state = getState(), locationsData) {
  if (!isStoryMode(state)) return null;
  const calendarDay = getDayCycle().day;
  for (let d = calendarDay; d >= 1; d--) {
    if (isStoryDayRouteActive(state, d, locationsData)) return d;
  }
  return null;
}

// —— обратная совместимость (день 2) ——

export function getStoryOrderDay2(locationsData) {
  return getStoryOrderForDay(2, locationsData);
}

export function isStoryDay2Ended() {
  return isStoryDayRouteEnded(2);
}

export function isStoryDay2Active(state = getState(), locationsData) {
  if (!locationsData) return false;
  return isStoryDayRouteActive(state, 2, locationsData);
}

export function isStoryDay2LocationDone(locId) {
  return isStoryDayLocationDone(2, locId);
}

export function isStoryLocation(locId, locationsData) {
  return getStoryOrder(locationsData).includes(locId);
}

export function isStoryDayRouteLocation(locId, dayNum, locationsData) {
  return getStoryOrderForDay(dayNum, locationsData).includes(locId);
}

export function isStoryDay2Location(locId, locationsData) {
  return isStoryDayRouteLocation(locId, 2, locationsData);
}

/** Первая ещё не завершённая точка текущего сюжетного маршрута. */
export function getStoryFocusLocationId(state, locationsData) {
  const activeDay = getActiveStoryDayNumber(state, locationsData);
  if (activeDay) {
    const order = getStoryOrderForDay(activeDay, locationsData);
    for (const id of order) {
      if (!isStoryDayLocationDone(activeDay, id)) return id;
    }
    return null;
  }
  if (!isStoryDayOneEnded()) {
    const order = getStoryOrder(locationsData);
    for (const id of order) {
      if (!state.visitedLocations.includes(id)) return id;
    }
  }
  return null;
}

function isStoryLinearFocusMark(locId, state, locationsData) {
  const here = state.currentLocation || locationsData.startLocation;
  const focus = getStoryFocusLocationId(state, locationsData);
  return locId === here || (focus != null && locId === focus);
}

/** Метка видна на карте в режиме «Сюжет» (только цель и текущая позиция). */
export function isStoryMarkVisible(loc, state, locationsData) {
  if (!isStoryMode(state)) return true;

  const activeDay = getActiveStoryDayNumber(state, locationsData);
  if (activeDay) {
    return isStoryLinearFocusMark(loc.id, state, locationsData);
  }

  if (isStoryDayOneEnded()) {
    return (
      state.unlockedLocations.includes(loc.id) ||
      state.visitedLocations.includes(loc.id)
    );
  }
  if (!isStoryLocation(loc.id, locationsData)) return false;
  return isStoryLinearFocusMark(loc.id, state, locationsData);
}

/** Можно идти в локацию (без проверки соседства по графу). */
export function canTravelToStoryLocation(locId, state, locationsData) {
  if (!isStoryMode(state)) return true;
  const here = state.currentLocation || locationsData.startLocation;
  if (locId === here) return true;

  const activeDay = getActiveStoryDayNumber(state, locationsData);
  if (activeDay) {
    const focus = getStoryFocusLocationId(state, locationsData);
    return focus != null && locId === focus;
  }

  if (isStoryDayOneEnded()) {
    return (
      state.unlockedLocations.includes(locId) ||
      state.visitedLocations.includes(locId)
    );
  }

  if (!isStoryLocation(locId, locationsData)) return false;
  const focus = getStoryFocusLocationId(state, locationsData);
  return focus != null && locId === focus;
}

/**
 * После визита: открыть следующую точку маршрута.
 * @returns {{ pendingDayOneEnd: boolean }}
 */
export function onStoryLocationVisited(locId, locationsData) {
  const activeDay = getActiveStoryDayNumber(getState(), locationsData);
  if (activeDay && activeDay > 1) {
    return { pendingDayOneEnd: false };
  }

  const order = getStoryOrder(locationsData);
  const idx = order.indexOf(locId);
  if (idx < 0) return { pendingDayOneEnd: false };

  const next = order[idx + 1];
  if (next) unlock(next);

  update((s) => {
    s.storyProgress = Math.max(s.storyProgress || 0, idx + 1);
    return s;
  });

  const isLast = idx === order.length - 1;
  const onDayOne = getDayCycle().day === 1 && !isStoryDayOneEnded();
  if (isLast && onDayOne) {
    setFlag("storyDay1PendingEnd", true);
    return { pendingDayOneEnd: true };
  }
  return { pendingDayOneEnd: false };
}

/** Завершить сюжетную сцену дня N в локации (после «вернуться на карту»). */
export function completeStoryDayLocation(dayNum, locId, locationsData) {
  if (!isStoryDayRouteActive(getState(), dayNum, locationsData)) return;
  const order = getStoryOrderForDay(dayNum, locationsData);
  const idx = order.indexOf(locId);
  if (idx < 0 || isStoryDayLocationDone(dayNum, locId)) return;

  setFlag(storyDayLocFlag(dayNum, locId), true);
  const next = order[idx + 1];
  if (next) unlock(next);

  if (idx === order.length - 1) {
    setFlag(storyDayEndedFlag(dayNum), true);
    update((s) => {
      for (const id of order) {
        if (!s.unlockedLocations.includes(id)) s.unlockedLocations.push(id);
      }
      return s;
    });
  }
}

export function completeStoryDay2Location(locId, locationsData) {
  completeStoryDayLocation(2, locId, locationsData);
}

export function shouldCompleteStoryDayOne() {
  return isStoryMode() && getFlag("storyDay1PendingEnd") && !isStoryDayOneEnded();
}

/** Следующая точка маршрута после текущей (для авто-перехода с карты). */
export function getStoryNextUnvisitedLocation(state, locationsData) {
  if (!isStoryMode(state)) return null;

  const activeDay = getActiveStoryDayNumber(state, locationsData);
  if (activeDay && activeDay > 1) {
    const order = getStoryOrderForDay(activeDay, locationsData);
    const here = state.currentLocation || locationsData.startLocation;
    const hereIdx = order.indexOf(here);
    if (hereIdx < 0) return null;

    for (let i = hereIdx + 1; i < order.length; i++) {
      const next = order[i];
      if (isStoryDayLocationDone(activeDay, next)) continue;
      if (i === hereIdx + 1) return next;
      if (isStoryDayLocationDone(activeDay, order[i - 1])) return next;
      return null;
    }
    return null;
  }

  if (isStoryDayOneEnded()) return null;
  const order = getStoryOrder(locationsData);
  const here = state.currentLocation || locationsData.startLocation;
  const hereIdx = order.indexOf(here);
  if (hereIdx < 0) return null;

  for (let i = hereIdx + 1; i < order.length; i++) {
    const next = order[i];
    if (state.visitedLocations.includes(next)) continue;
    if (i === hereIdx + 1) return next;
    if (state.unlockedLocations.includes(next)) return next;
    return null;
  }
  return null;
}

export function markStoryDayOneEnded(locationsData) {
  setFlag("storyDay1PendingEnd", false);
  setFlag(storyDayEndedFlag(1), true);
  const order = getStoryOrder(locationsData);
  update((s) => {
    for (const id of order) {
      if (!s.unlockedLocations.includes(id)) s.unlockedLocations.push(id);
    }
    return s;
  });
}

/** Сброс флагов сюжетных дней при новой игре / смене режима. */
export function clearStoryDayFlags(flags = {}) {
  const next = { ...flags };
  for (const key of Object.keys(next)) {
    if (/^storyDay\d+(_|$)/.test(key)) delete next[key];
  }
  next.storyDay1Ended = false;
  next.storyDay1PendingEnd = false;
  return next;
}
