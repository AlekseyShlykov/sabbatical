// storyMode.js — линейный маршрут дня 1 в режиме «Сюжет».

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

export function getStoryOrder(locationsData) {
  const order = locationsData?.storyOrder;
  if (Array.isArray(order) && order.length > 0) return [...order];
  return [...DEFAULT_STORY_DAY_ONE];
}

export function isStoryMode(state = getState()) {
  return state.mode === "story";
}

export function isStoryDayOneEnded() {
  return Boolean(getFlag("storyDay1Ended"));
}

export function isStoryLocation(locId, locationsData) {
  return getStoryOrder(locationsData).includes(locId);
}

/** Первая ещё не посещённая точка маршрута дня 1 — текущая цель сюжета. */
export function getStoryFocusLocationId(state, locationsData) {
  const order = getStoryOrder(locationsData);
  for (const id of order) {
    if (!state.visitedLocations.includes(id)) return id;
  }
  return null;
}

/** Метка видна на карте в режиме «Сюжет» (только цель и текущая позиция). */
export function isStoryMarkVisible(loc, state, locationsData) {
  if (!isStoryMode(state)) return true;
  if (isStoryDayOneEnded()) {
    return (
      state.unlockedLocations.includes(loc.id) ||
      state.visitedLocations.includes(loc.id)
    );
  }
  if (!isStoryLocation(loc.id, locationsData)) return false;
  const here = state.currentLocation || locationsData.startLocation;
  const focus = getStoryFocusLocationId(state, locationsData);
  return loc.id === here || loc.id === focus;
}

/** Можно идти в локацию (без проверки соседства по графу). */
export function canTravelToStoryLocation(locId, state, locationsData) {
  if (!isStoryMode(state)) return true;
  const here = state.currentLocation || locationsData.startLocation;
  if (locId === here) return true;

  if (isStoryDayOneEnded()) {
    return (
      state.unlockedLocations.includes(locId) ||
      state.visitedLocations.includes(locId)
    );
  }

  if (!isStoryLocation(locId, locationsData)) return false;
  const focus = getStoryFocusLocationId(state, locationsData);
  return locId === focus;
}

/**
 * После визита: открыть следующую точку маршрута.
 * @returns {{ pendingDayOneEnd: boolean }}
 */
export function onStoryLocationVisited(locId, locationsData) {
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

export function shouldCompleteStoryDayOne() {
  return isStoryMode() && getFlag("storyDay1PendingEnd") && !isStoryDayOneEnded();
}

/** Следующая точка маршрута после текущей (для авто-перехода с карты). */
export function getStoryNextUnvisitedLocation(state, locationsData) {
  if (!isStoryMode(state) || isStoryDayOneEnded()) return null;
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
  setFlag("storyDay1Ended", true);
  const order = getStoryOrder(locationsData);
  update((s) => {
    for (const id of order) {
      if (!s.unlockedLocations.includes(id)) s.unlockedLocations.push(id);
    }
    return s;
  });
}
