// state.js
// Central game state + tiny pub/sub. Single source of truth.
// Per agents.md: split concerns — this file does not touch DOM.

const SAVE_KEY = "sabbatical_save_v2";

const DEFAULT_STATE = {
  screen: "splash",        // splash | intro | modeSelect | map | location
  mode: null,              // story | free
  language: "ru",          // ru | en
  currentLocation: null,
  /** Exact viewBox coords after walking a path (until next move). */
  mapPlayerCoord: null,
  visitedLocations: [],
  unlockedLocations: [],
  flags: {},
  storyProgress: 0,
  /** Свободный режим: сколько сцен локации уже сыграно (locId → счётчик). */
  locationSceneProgress: {},
  bookProgress: { science: 0, novel: 0 },
  dayCycle: { day: 1, actionsUsed: 0, bookToday: { science: 0, novel: 0 } },
};

let state = clone(DEFAULT_STATE);
const listeners = new Set();

function clone(o) { return JSON.parse(JSON.stringify(o)); }

export function getState() {
  return state;
}

export function setState(patch) {
  state = { ...state, ...patch };
  emit();
  autoSave();
}

export function update(fn) {
  const next = fn(clone(state));
  if (next && typeof next === "object") {
    state = next;
    emit();
    autoSave();
  }
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) {
    try { fn(state); } catch (e) { console.error("[state] listener", e); }
  }
}

// ---------- persistence ----------

let saveTimer = null;
function autoSave() {
  // debounce, never block render
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 120);
}

export function saveNow() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn("[state] save failed", e);
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.warn("[state] load failed", e);
    return null;
  }
}

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); }
  catch { return false; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

export function resetState(overrides = {}) {
  state = { ...clone(DEFAULT_STATE), ...overrides };
  emit();
  autoSave();
}

export function applySave(snapshot) {
  state = { ...clone(DEFAULT_STATE), ...snapshot };
  if (!state.dayCycle) {
    state.dayCycle = { day: 1, actionsUsed: 0, bookToday: { science: 0, novel: 0 } };
  }
  if (!state.bookProgress) state.bookProgress = { science: 0, novel: 0 };
  if (!state.locationSceneProgress || typeof state.locationSceneProgress !== "object") {
    state.locationSceneProgress = {};
  }
  emit();
}

// ---------- helpers ----------

export function markVisited(locationId) {
  update(s => {
    if (!s.visitedLocations.includes(locationId)) s.visitedLocations.push(locationId);
    return s;
  });
}

export function unlock(locationId) {
  update(s => {
    if (!s.unlockedLocations.includes(locationId)) s.unlockedLocations.push(locationId);
    return s;
  });
}

export function setFlag(key, value = true) {
  update(s => { s.flags[key] = value; return s; });
}

export function getFlag(key) {
  return state.flags[key];
}

/** Свободный режим: текущий индекс сцены локации (0 = первая сцена очереди). */
export function getLocationSceneIndex(locationId) {
  return (state.locationSceneProgress && state.locationSceneProgress[locationId]) || 0;
}

/** Сдвинуть прогресс сцен локации на одну (с ограничением `cap`). */
export function advanceLocationScene(locationId, cap = Infinity) {
  update(s => {
    if (!s.locationSceneProgress) s.locationSceneProgress = {};
    const next = (s.locationSceneProgress[locationId] || 0) + 1;
    s.locationSceneProgress[locationId] = Math.min(next, cap);
    return s;
  });
}

