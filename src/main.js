// main.js
// Top-level orchestrator. Wires state, screens, map, scene, dialogue.
// Keep flow-control here; keep system-level behavior in sibling modules.

import {
  getState, setState, subscribe,
  loadSave, applySave, hasSave, clearSave, resetState,
  markVisited, unlock, setFlag, getFlag, update,
  getLocationSceneIndex, advanceLocationScene,
} from "./state.js";
import {
  setLanguage, loadStory, t, applyDomI18n,
  onLanguageChange, localizedTitle, getLanguage,
} from "./localization.js";
import { showScreen, withFade } from "./transitions.js";
import {
  initMap,
  renderMap,
  ensureMapViewportReady,
  onSelectLocation,
  locationById,
  noteVisit,
  setCurrentMarkHighlight,
} from "./map.js";
import { travel, clearTrail } from "./movement.js";
import {
  initScene,
  clearStage,
  setBackground,
  preloadRasters,
  loadAssetManifest,
} from "./scene.js";
import { backgroundForLocation } from "./locationAssets.js";
import {
  initDialogue, setGraph, renderPassage, getCurrentPassage,
  setEndCallback, rerenderCurrent, setAfterPassageHook,
} from "./dialogue.js";
import { buildGraph } from "./twineLoader.js";
import {
  setReturnToMapCallback,
  setOpenIslandMapCallback,
  setContinueSceneCallback,
  setAfterNewDayCallback,
  setBeginDayFiveCallback,
  initialBackgroundFromPassage,
} from "./commands.js";
import { initDevEnd, hideLetterProp, hideDevEndEmailForm } from "./devEnd.js";
import { initHud, showHudToast, renderHud } from "./hud.js";
import {
  showDayEndNotice,
  showDayTitleCard,
  showPartyCallNotice,
  setEndCalendarDayHandler,
} from "./dayTransition.js";
import {
  setOnActionSpent,
  isDayCycleActive,
  enableGameHud,
  canSpendAction,
  spendAction,
  isDayExhausted,
  advanceDay,
  getDayCycle,
  MAX_ACTIONS_PER_DAY,
  setDayTransitionActive,
  isDayTransitionActive,
} from "./dayCycle.js";
import {
  setDay4PartyHandler,
  tryForceDay4Party,
  isDay4PartyRunning,
} from "./scheduledEvents.js";
import {
  getStoryOrder,
  getStoryOrderForDay,
  getActiveStoryDayNumber,
  shouldCompleteStoryDayOne,
  markStoryDayOneEnded,
  getStoryNextUnvisitedLocation,
  isStoryDayLocationDone,
  completeStoryDayLocation,
  ensureStoryDayRouteUnlocked,
  getStoryFocusLocationId,
  isStoryDayRouteEnded,
  hasNextStoryDayRoute,
  isStoryMode,
  clearStoryDayFlags,
  reconcileStoryDayWithCalendar,
  applyStoryDayEndBookBonus,
} from "./storyMode.js";
import {
  pickTwinePassageForLocation,
  isPassageAvailableOnDay,
  getLocationSceneSequence,
  pickLocationSceneByIndex,
} from "./twinePassages.js";
import {
  resetIntro,
  renderIntroSlide,
  advanceIntro,
} from "./intro.js";
import {
  startBackgroundMusic,
  stopBackgroundMusic,
  resetAudioSession,
  setAmbientForLocation,
  clearAmbient,
  initAudioMenu,
  syncAudioMenu,
} from "./audio.js";
import {
  ensureAllAssetsPreloaded,
  initSplashLoader,
  setSplashLoadProgress,
  finishSplashLoader,
  showSplashActionsReady,
  areAssetsReady,
  syncSplashContinueButton,
} from "./assetPreload.js";

const LOCATIONS_URL = "data/locations.json";

let locationsData = null;
let storyGraph = null;       // language-bound graph for current language
let sendingPlayerHome = false;
let gameplayPreloadPromise = null;

bootstrap().catch((err) => {
  console.error("[boot] fatal", err);
  document.body.innerHTML = `<pre style="padding:24px;font-family:monospace;color:#600">${err}</pre>`;
});

async function bootstrap() {
  showScreen("splash");
  initSplashLoader();

  // Initial language: saved > browser > 'ru'
  const save = loadSave();
  const startLang = save?.language || pickInitialLang();
  await setLanguage(startLang);
  applyDomI18n(document);
  setSplashLoadProgress({ pct: 0 });

  // Load data + asset manifest in parallel.
  const [locRes] = await Promise.all([
    fetch(LOCATIONS_URL),
    loadAssetManifest(),
  ]);
  if (!locRes.ok) throw new Error("locations.json missing");
  locationsData = await locRes.json();
  await loadStoryForLanguage(getLanguage());

  // Init systems
  initScene();
  initMap(locationsData);
  initDialogue();
  initHud();
  initDevEnd();
  setAfterPassageHook(maybeReturnHomeAfterVisit);
  setEndCalendarDayHandler(endPlayerDay);
  setEndCallback(handleDialogueEnd);
  setReturnToMapCallback(handleReturnToMap);
  setOpenIslandMapCallback(openIslandFromHome);
  setAfterNewDayCallback(ensureDialogueScreenAfterNewDay);
  setBeginDayFiveCallback(beginDayFive);
  setContinueSceneCallback((body) => {
    if (/day\s*3\.2\s*white/i.test(body)) void continueAfterDay3Morning();
  });
  onSelectLocation(handleMapSelect);
  setOnActionSpent(() => {
    void tryForceDay4Party();
  });
  setDay4PartyHandler(forceDay4Party);

  gameplayPreloadPromise = ensureAllAssetsPreloaded({
    onProgress: setSplashLoadProgress,
  });
  await gameplayPreloadPromise;
  finishSplashLoader();

  if (save) {
    applySave(save);
  } else {
    resetState({
      language: startLang,
      unlockedLocations: [...locationsData.initiallyUnlocked],
    });
  }

  wireGlobalUI();
  initAudioMenu();
  subscribe(updateLeaveButton);
  hydrateLanguageButtons();
  toggleContinueButton();
  updateLeaveButton();
  updateDevRestartButton(getState().screen || "splash");

  // Stay on splash until the player presses Start or Continue.
  setState({ screen: "splash" });
  showScreen("splash");
}

/* =========================================================
   Story loading + language live-switch
   ========================================================= */

async function loadStoryForLanguage(lang) {
  const raw = await loadStory(lang);
  storyGraph = buildGraph(raw);
  setGraph(storyGraph);
}

onLanguageChange(async (lang) => {
  await loadStoryForLanguage(lang);
  applyDomI18n(document);
  hydrateLanguageButtons();
  renderLocationTitle();
  // If we're inside a dialogue, re-render the same passage in the new language.
  if (getState().screen === "location") {
    await rerenderCurrent();
  }
  if (getState().screen === "map") {
    void renderMap();
  }
  if (getState().screen === "intro") {
    void renderIntroSlide();
  }
});

/* =========================================================
   Screen transitions
   ========================================================= */

async function goTo(screenId) {
  setState({ screen: screenId });
  showScreen(screenId);
  updateDevRestartButton(screenId);

  if (screenId === "map") {
    clearAmbient();
    await waitFrames(2);
    await renderMap();
  }
  if (screenId === "intro") {
    resetIntro();
    startBackgroundMusic();
    void renderIntroSlide();
    void ensureGameplayPreload();
  }
}

function ensureGameplayPreload() {
  if (!gameplayPreloadPromise) {
    gameplayPreloadPromise = ensureAllAssetsPreloaded({
      onProgress: setSplashLoadProgress,
    });
  }
  return gameplayPreloadPromise;
}

/* =========================================================
   Map -> Location -> Dialogue flow
   ========================================================= */

function waitFrames(n = 2) {
  return new Promise((resolve) => {
    let left = n;
    const tick = () => {
      if (--left <= 0) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Карта должна быть видна, иначе анимация travel идёт в скрытом блоке. */
async function prepareMapForTravel() {
  if (getState().screen !== "map") {
    clearStage();
    await goTo("map");
  } else {
    await renderMap();
    await ensureMapViewportReady();
  }
}

async function performMapTravel(fromId, toId) {
  if (fromId === toId) return getState().mapPlayerCoord;
  await prepareMapForTravel();
  setState({ mapPlayerCoord: null });
  const endCoord = await travel({ fromId, toId });
  clearTrail();
  setState({
    currentLocation: toId,
    mapPlayerCoord: endCoord || null,
  });
  setCurrentMarkHighlight(toId);
  return endCoord;
}

async function handleMapSelect(toId, { skipTravel = false, skipActionCharge = false } = {}) {
  if (isDayTransitionActive() || isDay4PartyRunning()) return;
  if (await tryForceDay4Party()) return;

  const state = getState();
  const fromId = state.currentLocation || locationsData.startLocation;
  const toLoc  = locationById(toId);
  if (!toLoc) return;

  if (isStoryMode(state)) {
    const activeDay = getActiveStoryDayNumber(state, locationsData);
    const focus = getStoryFocusLocationId(state, locationsData);
    const calDay = getDayCycle().day;
    const calRoute = getStoryOrderForDay(calDay, locationsData);
    const storyLinear =
      activeDay !== null ||
      focus !== null ||
      (calRoute.length > 0 && !isStoryDayRouteEnded(calDay));
    if (storyLinear) {
      const here = state.currentLocation || locationsData.startLocation;
      if (toId !== here && toId !== focus) return;
    }
  }

  const traveling = !skipTravel && fromId !== toId;
  const needsVisitCharge = !skipActionCharge && isDayCycleActive() && !isStoryMode(state);

  if (needsVisitCharge && !canSpendAction()) {
    showHudToast(t("hud.noActions"));
    await sendPlayerHome();
    return;
  }

  // Start preload of target location assets immediately, parallel with
  // walk animation / fade. enterLocation() will await the same promise.
  preloadLocationAssets(toLoc);

  // Re-entering the current location: skip the walk animation.
  if (skipTravel || fromId === toId) {
    if (needsVisitCharge && !spendAction()) {
      showHudToast(t("hud.noActions"));
      await sendPlayerHome();
      return;
    }
    if (await tryForceDay4Party()) return;
    await withFade(async () => {
      setState({ currentLocation: toId, mapPlayerCoord: null });
      noteVisit(toId);
      setCurrentMarkHighlight(toId);
      await enterLocation(toLoc, { skipActionCharge: true });
    });
    return;
  }

  await performMapTravel(fromId, toId);

  await withFade(async () => {
    if (needsVisitCharge && !spendAction()) {
      showHudToast(t("hud.noActions"));
      await sendPlayerHome();
      return;
    }
    if (await tryForceDay4Party()) return;
    noteVisit(toId);
    await enterLocation(toLoc, { skipActionCharge: true });
  });
}

/** Очередь in-flight прелоадов локаций — чтобы не дёргать декод повторно. */
const locationPreloadPromises = new Map();

/**
 * Запустить (или вернуть текущий) промис на прелоад фона и портретов
 * целевой локации. Не ждёт окончания: вызов — fire-and-forget из карты,
 * `enterLocation` дождётся ту же самую промис-цепочку.
 */
function preloadLocationAssets(loc) {
  if (!loc) return Promise.resolve();
  const existing = locationPreloadPromises.get(loc.id);
  if (existing) return existing;

  const passageName = resolveTwinePassage(loc);
  let bg = backgroundForLocation(loc);
  if (passageName && storyGraph?.[passageName]) {
    const fromPassage = initialBackgroundFromPassage(storyGraph[passageName]);
    if (fromPassage) bg = fromPassage;
  }
  const specs = [];
  if (bg) specs.push(["assets/backgrounds/", bg]);
  const ids = Array.isArray(loc.characters) ? loc.characters : [];
  for (const id of ids) specs.push(["assets/characters/", String(id).toLowerCase()]);
  if (loc.id === "orangehouse" || passageName === "orange house inside") {
    specs.push(["assets/characters/", "mrred"]);
  }
  if (passageName === "Day2.1. Blue." || (loc.id === "bluehouse" && passageName === "Blue house")) {
    specs.push(["assets/characters/", "mrblue"]);
  }
  if (passageName === "Day 2.2. Green" || passageName === "Day 2. Green" || (loc.id === "greenhouse" && passageName === "Green house")) {
    specs.push(["assets/characters/", "msgreen"]);
  }
  if (passageName === "Day 2.3. Red" || (loc.id === "bar" && passageName === "Bar")) {
    specs.push(["assets/characters/", "mrred"]);
  }
  if (passageName === "Day 2.4 Forrest" || (loc.id === "forest" && passageName === "Forrest")) {
    specs.push(["assets/characters/", "mrblack"]);
  }
  if (passageName === "Day 2.5 Yellow" || (loc.id === "yellowhouse" && passageName === "Yellow house")) {
    specs.push(["assets/characters/", "msyellow"]);
  }
  if (passageName === "Day 2.6 Purple" || (loc.id === "purplehouse" && passageName === "purple house")) {
    specs.push(["assets/characters/", "mrpurple"]);
  }
  if (passageName === "Day 3.1. Red" || (loc.id === "orangehouse" && passageName === "orange house")) {
    specs.push(["assets/characters/", "mrred"]);
  }
  if (passageName === "Day 3.2. White" || passageName === "Day 3.1. White" || (loc.id === "whitehouse" && passageName === "White house")) {
    specs.push(["assets/characters/", "mswhite"]);
  }
  if (passageName === "Day 3.3. Bar." || passageName === "Day 4.5. Bar") {
    for (const id of ["mrred", "msyellow", "msgreen", "mrpurple", "mrblack", "mswhite", "mrblue"]) {
      specs.push(["assets/characters/", id]);
    }
  }
  if (passageName === "Day 5.1 Begin") {
    specs.push(["assets/stuff/", "letter"]);
  }

  const p = preloadRasters(specs).catch((err) => {
    console.warn(`[preload] failed for ${loc.id}:`, err);
  });
  locationPreloadPromises.set(loc.id, p);
  // После завершения убираем из карты — кэш scene.js уже сохранит результат.
  p.finally(() => {
    if (locationPreloadPromises.get(loc.id) === p) {
      locationPreloadPromises.delete(loc.id);
    }
  });
  return p;
}

/** Конец календарного дня: сообщение, прогулка домой, титр нового дня. */
async function endPlayerDay({ inlineDuringPassage = false } = {}) {
  if (sendingPlayerHome) return;
  if (!isDayCycleActive()) return;

  const home = locationById(locationsData.startLocation);
  if (!home) return;

  sendingPlayerHome = true;
  try {
    await finishDayAtHome({ inlineDuringPassage });
  } finally {
    sendingPlayerHome = false;
  }
}

/** После 10-го действия: сообщение, прогулка домой, титр нового дня. */
async function sendPlayerHome() {
  if (!isDayCycleActive() || !isDayExhausted()) return;
  await endPlayerDay();
}

/** Сообщение → путь домой → смена дня → титр «День N». */
async function finishDayAtHome({ fromId, inlineDuringPassage = false } = {}) {
  const homeId = locationsData.startLocation;
  const from = fromId ?? getState().currentLocation ?? homeId;
  const nextDay = getDayCycle().day + 1;
  const stayingHome = from === homeId;

  setDayTransitionActive(true);
  try {
    if (getState().screen === "location") {
      if (stayingHome) {
        clearAmbient();
      } else {
        clearStage();
        clearAmbient();
        goTo("map");
      }
    }
    if (!stayingHome) {
      await ensureMapViewportReady();
    }

    await showDayEndNotice();

    if (!stayingHome) {
      await performMapTravel(from, homeId);
    } else {
      setState({ currentLocation: homeId, mapPlayerCoord: null });
      if (getState().screen === "map") setCurrentMarkHighlight(homeId);
    }

    const completedDay = getDayCycle().day;
    if (isStoryMode()) applyStoryDayEndBookBonus(completedDay);

    advanceDay();
    if (isStoryMode()) reconcileStoryDayWithCalendar(locationsData);
    renderHud(getState());
    await showDayTitleCard(nextDay);
    if (!stayingHome) void renderMap();
  } finally {
    setDayTransitionActive(false);
  }

  if (isStoryMode()) {
    const activeDay = getActiveStoryDayNumber(getState(), locationsData);
    if (activeDay) {
      ensureStoryDayRouteUnlocked(activeDay, locationsData);
      if (!inlineDuringPassage) {
        await maybeStoryTravelAndEnterAfterLeave();
      }
    }
  } else if (nextDay === 3 && getState().mode === "free" && !inlineDuringPassage) {
    const home = locationById(homeId);
    if (home) {
      await enterLocation(home, { forcePassage: "Day 3.1. Red", skipActionCharge: true });
    }
  }
}

/** После `//новый день` диалог продолжается — экран локации должен остаться видимым. */
async function ensureDialogueScreenAfterNewDay() {
  if (!getCurrentPassage()) return;
  if (getState().screen === "location") return;
  await goTo("location");
}

/** Выход на карту — только после выбора режима (конец онбординга). */
function canLeaveToMap(state = getState()) {
  return state.mode === "story" || state.mode === "free";
}

function updateLeaveButton() {
  const btn = document.querySelector('[data-action="leave"]');
  if (!btn) return;
  const allowed = canLeaveToMap();
  btn.hidden = !allowed;
  btn.disabled = !allowed;
}

async function handleReturnToMap() {
  if (!canLeaveToMap()) return;
  if (isDayCycleActive() && isDayExhausted()) {
    await sendPlayerHome();
    return;
  }
  await leaveLocation();
}

async function enterLocation(loc, { skipActionCharge = false, forcePassage = null } = {}) {
  clearStage();
  hideLetterProp();
  hideDevEndEmailForm();
  const passageName = forcePassage || resolveTwinePassage(loc);
  let bg = backgroundForLocation(loc);
  if (passageName && storyGraph?.[passageName]) {
    const fromPassage = initialBackgroundFromPassage(storyGraph[passageName]);
    if (fromPassage) bg = fromPassage;
  }
  // Гарантируем, что фон+портреты подгружены (если ещё нет — старт сейчас).
  await preloadLocationAssets(loc);
  await setBackground(bg);
  document.getElementById("location-title").textContent = localizedTitle(loc.title);
  goTo("location");
  setAmbientForLocation(loc.id);

  const lineEl = document.getElementById("dialogue-line");
  const actionsEl = document.getElementById("dialogue-actions");
  actionsEl.innerHTML = "";

  if (passageName) {
    // Свободный режим: визит сдвигает очередь сцен локации на одну.
    // Делаем это ПОСЛЕ resolveTwinePassage (он прочитал текущий индекс).
    if (getState().mode === "free" && loc.id !== "orangehouse" && !getFlag("tutorialMap")) {
      advanceLocationScene(loc.id, getLocationSceneSequence(loc).length);
    }
    await renderPassage(passageName);
    return;
  }

  // POI without Twine content yet — show title only, leave via tomap icon.
  lineEl.dataset.speaker = "narrator";
  lineEl.textContent = localizedTitle(loc.title);
  await maybeReturnHomeAfterVisit();
}

async function maybeReturnHomeAfterVisit() {
  if (!isDayExhausted()) return;
  await sendPlayerHome();
}

function handleDialogueEnd({ passage }) {
  if (passage === "Давайте") {
    void enterTutorialMap();
    return;
  }
  if (passage === "До встречи") {
    setFlag("tutorialMap", false);
    setFlag("postTutorialStoryStart", true);
    void withFade(() => goTo("modeSelect"));
    return;
  }
  if (passage === "До завтра") {
    void continueAfterDay3Morning();
    return;
  }
  if (passage === "Пойду исследовать остров") {
    const { mode } = getState();
    if (mode === "story") {
      void leaveLocation();
      return;
    }
    setFlag("storyContinueExplore", true);
    void openIslandFromHome();
    return;
  }
  // Branch ended (no choices, no more lines). Player keeps the Leave button.
}

/** Принудительная вечеринка в баре — день 4, свободный режим, 15:00. */
async function forceDay4Party() {
  const bar = locationById("bar");
  if (!bar) return;

  setFlag("freeDay4PartyDone", true);
  await showPartyCallNotice();

  const fromId = getState().currentLocation || locationsData.startLocation;
  const seqLen = getLocationSceneSequence(bar).length;
  advanceLocationScene("bar", seqLen);

  preloadLocationAssets(bar);

  if (getState().screen === "location") {
    clearStage();
    clearAmbient();
    await goTo("map");
  }

  if (fromId !== "bar") {
    await performMapTravel(fromId, "bar");
  } else {
    setState({ currentLocation: "bar", mapPlayerCoord: null });
    setCurrentMarkHighlight("bar");
  }

  await withFade(async () => {
    noteVisit("bar");
    await enterLocation(bar, { forcePassage: "Day 4.5. Bar", skipActionCharge: true });
  });
}

/** После вечеринки: день 5 и сцена «Day 5.1 Begin». */
async function beginDayFive() {
  if (sendingPlayerHome) return;
  sendingPlayerHome = true;
  try {
    const homeId = locationsData.startLocation;
    const activeDay = getActiveStoryDayNumber(getState(), locationsData);
    if (activeDay === 4) {
      completeStoryDayLocation(4, "bar", locationsData);
    }
    setFlag("freeDay4PartyDone", true);

    const currentDay = getDayCycle().day;
    if (currentDay < 5) {
      if (isStoryMode()) applyStoryDayEndBookBonus(currentDay);
      advanceDay();
      if (isStoryMode()) reconcileStoryDayWithCalendar(locationsData);
      renderHud(getState());
      await showDayTitleCard(5);
    }

    const home = locationById(homeId);
    if (!home) return;

    if (getState().screen === "location") {
      clearStage();
      clearAmbient();
      await goTo("map");
    }

    setState({ currentLocation: homeId, mapPlayerCoord: null });
    await withFade(async () => {
      await enterLocation(home, { forcePassage: "Day 5.1 Begin", skipActionCharge: true });
    });
  } finally {
    sendingPlayerHome = false;
  }
}

async function continueAfterDay3Morning() {
  const homeId = locationsData.startLocation;
  if (getFlag("dayScene_3_orangehouse")) return;
  setFlag("dayScene_3_orangehouse", true);

  if (isStoryMode()) {
    const home = locationById(homeId);
    if (!home) return;
    await withFade(async () => {
      await enterLocation(home, { forcePassage: "Day 3.2. White", skipActionCharge: true });
    });
    return;
  }

  if (getState().mode === "free") {
    const home = locationById(homeId);
    if (!home) return;
    await withFade(async () => {
      await enterLocation(home, { forcePassage: "Day 3.2. White", skipActionCharge: true });
    });
  }
}

function resolveTwinePassage(loc) {
  if (getFlag("tutorialMap") && loc.id === "orangehouse") {
    return "orange house inside";
  }

  const state = getState();
  const calendarDay = getDayCycle().day;
  const activeStoryDay = getActiveStoryDayNumber(state, locationsData);
  const storyOrder = activeStoryDay
    ? getStoryOrderForDay(activeStoryDay, locationsData)
    : [];

  // Свободный режим: своя очередь сцен на локацию, по числу визитов.
  if (state.mode === "free" && loc.id !== "orangehouse") {
    return pickLocationSceneByIndex(loc, getLocationSceneIndex(loc.id));
  }

  // Оранжевый дом: дневные сцены (Day 3.1. Red и т.д.) + обычный «orange house».
  if (loc.id === "orangehouse" && !getFlag("tutorialMap")) {
    if (state.mode === "story") {
      if (
        calendarDay === 3 &&
        getFlag("dayScene_3_orangehouse") &&
        activeStoryDay === 3 &&
        !isStoryDayLocationDone(3, "orangehouse")
      ) {
        return "Day 3.2. White";
      }
    }
    if (state.mode === "free") {
      const dayPassage = loc.twinePassageByDay?.[String(calendarDay)];
      if (dayPassage && isPassageAvailableOnDay(dayPassage, calendarDay)) {
        const scene = pickLocationSceneByIndex(loc, getLocationSceneIndex(loc.id));
        if (scene && scene !== loc.twinePassage) return scene;
        if (!getFlag(`dayScene_${calendarDay}_orangehouse`)) return dayPassage;
      }
      return loc.twinePassage;
    }
    const passage = pickTwinePassageForLocation(loc, {
      calendarDay,
      activeStoryDay,
      storyOrder,
      isLocDoneOnStoryDay: (id) =>
        isStoryDayLocationDone(activeStoryDay || 1, id),
    });
    return passage || loc.twinePassage;
  }

  // Свободный режим (остальные локации обработаны выше).
  if (state.mode === "free") {
    return pickLocationSceneByIndex(loc, getLocationSceneIndex(loc.id));
  }

  // Режим «История»: привязка к календарному дню и маршруту.
  const passage = pickTwinePassageForLocation(loc, {
    calendarDay,
    activeStoryDay,
    storyOrder,
    isLocDoneOnStoryDay: (id) =>
      isStoryDayLocationDone(activeStoryDay || 1, id),
  });

  if (!isPassageAvailableOnDay(passage, calendarDay)) {
    return loc.twinePassage;
  }
  return passage;
}

async function openIslandFromHome() {
  const { mode } = getState();
  if (!mode) {
    await withFade(() => goTo("modeSelect"));
    return;
  }
  await leaveLocation();
}

async function startPrologueDialogue() {
  await ensureGameplayPreload();
  clearStage();
  await setBackground("barout2");
  setFlag("prologue", true);
  setState({ currentLocation: "pier" });
  const titleEl = document.getElementById("location-title");
  titleEl.textContent = getLanguage() === "ru" ? "Причал" : "Dock";
  goTo("location");
  document.getElementById("dialogue-actions").innerHTML = "";
  await renderPassage("start");
}

async function enterTutorialMap() {
  setFlag("prologue", false);
  setFlag("tutorialMap", true);
  const home = locationsData.startLocation;
  setState({
    currentLocation: "pier",
    unlockedLocations: [home],
    visitedLocations: [],
    mapPlayerCoord: null,
  });
  clearStage();
  await preloadRasters([
    ["assets/backgrounds/", "houseorangeinside"],
    ["assets/characters/", "mrred"],
  ]);
  await withFade(() => goTo("map"));
}

async function leaveLocation() {
  if (!canLeaveToMap()) return;

  const homeId = locationsData.startLocation;
  const pendingStoryHome = shouldCompleteStoryDayOne();
  const locId = getState().currentLocation;
  const activeStoryDay = getActiveStoryDayNumber(getState(), locationsData);
  let storyDayRouteJustEnded = null;
  if (locId && activeStoryDay && activeStoryDay > 1) {
    const wasEnded = isStoryDayRouteEnded(activeStoryDay);
    completeStoryDayLocation(activeStoryDay, locId, locationsData);
    if (!wasEnded && isStoryDayRouteEnded(activeStoryDay)) {
      storyDayRouteJustEnded = activeStoryDay;
    }
  }

  if (
    storyDayRouteJustEnded &&
    hasNextStoryDayRoute(storyDayRouteJustEnded, locationsData)
  ) {
    await withFade(async () => {
      clearStage();
      clearAmbient();
      await goTo("map");
    });
    await completeStoryDayRouteEnd(storyDayRouteJustEnded);
    return;
  }

  if (isDayCycleActive() && isDayExhausted() && !pendingStoryHome) {
    await sendPlayerHome();
    return;
  }

  await withFade(async () => {
    clearStage();
    clearAmbient();
    await goTo("map");
  });

  if (await tryForceDay4Party()) return;

  if (pendingStoryHome) {
    if (getState().currentLocation === homeId) {
      await completeStoryDayOneIfNeeded();
      return;
    }
    await travelStoryHomeAfterBeach();
    return;
  }

  if (isDayCycleActive() && isDayExhausted()) {
    await sendPlayerHome();
    return;
  }

  await maybeStoryTravelAndEnterAfterLeave();
}

/** После пляжа в сюжете: конец дня 1 и титр «День 2». */
async function travelStoryHomeAfterBeach() {
  if (sendingPlayerHome) return;
  sendingPlayerHome = true;
  try {
    const fromId = getState().currentLocation || locationsData.startLocation;
    update((s) => {
      if (!s.dayCycle) {
        s.dayCycle = { day: 1, actionsUsed: 0, bookToday: { science: 0, novel: 0 } };
      }
      s.dayCycle.actionsUsed = MAX_ACTIONS_PER_DAY;
      return s;
    });
    await finishDayAtHome({ fromId });
    markStoryDayOneEnded(locationsData);
  } finally {
    sendingPlayerHome = false;
  }
}

/** В режиме «Сюжет»: после сцены — пройти по карте к следующей точке и войти в неё. */
async function maybeStoryTravelAndEnterAfterLeave() {
  if (!isStoryMode()) return;

  const state = getState();
  const nextId = getStoryNextUnvisitedLocation(state, locationsData);
  if (!nextId) return;

  const fromId = state.currentLocation || locationsData.startLocation;
  const toLoc = locationById(nextId);
  if (!toLoc) return;

  const needsVisitCharge = isDayCycleActive() && !isStoryMode(state);
  if (needsVisitCharge && !canSpendAction()) {
    showHudToast(t("hud.noActions"));
    await sendPlayerHome();
    return;
  }

  if (fromId === nextId) {
    await withFade(async () => {
      noteVisit(nextId);
      await enterLocation(toLoc, { skipActionCharge: true });
    });
    return;
  }

  await performMapTravel(fromId, nextId);

  await withFade(async () => {
    if (needsVisitCharge && !spendAction()) {
      showHudToast(t("hud.noActions"));
      await sendPlayerHome();
      return;
    }
    noteVisit(nextId);
    await enterLocation(toLoc, { skipActionCharge: true });
  });
}

/** После возврата в оранжевый дом (конец маршрута дня 1): новый день. */
async function completeStoryDayOneIfNeeded() {
  if (!shouldCompleteStoryDayOne()) return;
  if (sendingPlayerHome) return;

  sendingPlayerHome = true;
  try {
    update((s) => {
      if (!s.dayCycle) {
        s.dayCycle = { day: 1, actionsUsed: 0, bookToday: { science: 0, novel: 0 } };
      }
      s.dayCycle.actionsUsed = MAX_ACTIONS_PER_DAY;
      return s;
    });
    const homeId = locationsData.startLocation;
    await finishDayAtHome({ fromId: homeId });
    markStoryDayOneEnded(locationsData);
  } finally {
    sendingPlayerHome = false;
  }
}

/** Конец сюжетного маршрута дня N (2, 3, …): домой, титр «День N+1», следующая сцена. */
async function completeStoryDayRouteEnd(dayNum) {
  if (sendingPlayerHome) return;
  if (!hasNextStoryDayRoute(dayNum, locationsData)) return;

  sendingPlayerHome = true;
  try {
    update((s) => {
      if (!s.dayCycle) {
        s.dayCycle = { day: 1, actionsUsed: 0, bookToday: { science: 0, novel: 0 } };
      }
      s.dayCycle.actionsUsed = MAX_ACTIONS_PER_DAY;
      return s;
    });
    const fromId = getState().currentLocation || locationsData.startLocation;
    await finishDayAtHome({ fromId });
  } finally {
    sendingPlayerHome = false;
  }
}

/* =========================================================
   UI wiring
   ========================================================= */

function wireGlobalUI() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    const action = btn.dataset.action;
    handleAction(action, btn);
  });

  document.querySelectorAll("[data-lang]").forEach((b) => {
    b.addEventListener("click", () => setLanguage(b.dataset.lang));
  });

  document.querySelectorAll("[data-mode]").forEach((b) => {
    b.addEventListener("click", () => {
      void chooseMode(b.dataset.mode);
    });
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const overlay = document.getElementById("overlay");
      if (!overlay.hidden) closeMenu();
      else if (getState().screen === "location" || getState().screen === "map") openMenu();
    }
  });
}

async function handleAction(action, btn) {
  switch (action) {
    case "start": {
      if (!areAssetsReady() || getState().screen !== "splash") return;
      clearSave();
      resetState({
        language: getLanguage(),
        unlockedLocations: [...locationsData.initiallyUnlocked],
      });
      toggleContinueButton();
      void ensureGameplayPreload();
      startBackgroundMusic();
      await withFade(() => goTo("intro"));
      return;
    }
    case "continue": {
      if (!areAssetsReady()) return;
      const save = loadSave();
      if (!save) return;
      applySave(save);
      if (save.language) await setLanguage(save.language);
      const screen = save.screen === "splash" ? "map" : (save.screen || "map");
      await withFade(() => goTo(screen));
      return;
    }
    case "intro-continue": {
      if (!(await advanceIntro())) return;
      await ensureGameplayPreload();
      await withFade(() => startPrologueDialogue());
      return;
    }
    case "leave": {
      if (!canLeaveToMap()) return;
      await leaveLocation();
      return;
    }
    case "open-menu":
      openMenu();
      return;
    case "menu-close":
    case "menu-resume":
      closeMenu();
      return;
    case "menu-to-map":
      closeMenu();
      if (!canLeaveToMap()) return;
      if (getState().screen !== "map") await leaveLocation();
      return;
    case "menu-change-lang":
      closeMenu();
      await setLanguage(getLanguage() === "ru" ? "en" : "ru");
      return;
    case "menu-change-mode":
      closeMenu();
      await withFade(() => goTo("modeSelect"));
      return;
    case "menu-new-game":
      if (!confirm(t("menu.confirmNew"))) return;
      await restartToSplash();
      return;
    case "restart-from-beginning":
      await restartToSplash();
      return;
  }
}

async function restartToSplash() {
  clearSave();
  closeMenu();
  clearStage();
  resetState({
    language: getLanguage(),
    unlockedLocations: [...locationsData.initiallyUnlocked],
  });
  resetAudioSession();
  toggleContinueButton();
  showSplashActionsReady();
  await withFade(() => goTo("splash"));
}

function updateDevRestartButton(screenId) {
  const btn = document.getElementById("dev-restart-btn");
  if (btn) btn.hidden = screenId === "splash";
}

async function chooseMode(mode) {
  const resumeStoryExplore =
    mode === "story" &&
    (getFlag("postTutorialStoryStart") || getFlag("storyContinueExplore"));

  const startId = locationsData.startLocation;
  const storyOrder = getStoryOrder(locationsData);
  const unlocked =
    mode === "free"
      ? locationsData.locations
          .filter((l) => l.availableInStoryMode !== false)
          .map((l) => l.id)
      : mode === "story"
        ? [storyOrder[0] || startId]
        : [...locationsData.initiallyUnlocked];

  setState({
    mode,
    currentLocation: startId,
    unlockedLocations: unlocked,
    visitedLocations: [],
    storyProgress: 0,
    locationSceneProgress: {},
    mapPlayerCoord: null,
    flags: clearStoryDayFlags({
      ...getState().flags,
      tutorialMap: false,
      prologue: false,
      storyContinueExplore: false,
      postTutorialStoryStart: false,
    }),
  });
  enableGameHud();
  if (mode === "story" || mode === "free") {
    update((s) => {
      if (!s.dayCycle) {
        s.dayCycle = { day: 1, actionsUsed: 0, bookToday: { science: 0, novel: 0 } };
      }
      s.dayCycle.day = 1;
      s.dayCycle.actionsUsed = 0;
      s.dayCycle.bookToday = { science: 0, novel: 0 };
      return s;
    });
  }
  if (mode === "story") {
    await startStoryMode({ resumeExplore: resumeStoryExplore });
    return;
  }
  noteVisit(startId);
  void withFade(async () => {
    await goTo("map");
  });
}

/** Режим «Сюжет»: сразу первая сцена; после «Пойду исследовать» — авто-переход по маршруту. */
async function startStoryMode({ resumeExplore = false } = {}) {
  try {
    const storyOrder = getStoryOrder(locationsData);
    const homeId = locationsData.startLocation;
    const sceneId = storyOrder[0] || homeId;
    const sceneLoc = locationById(sceneId);
    if (!sceneLoc) {
      await withFade(() => goTo("map"));
      return;
    }

    const continueExplore =
      resumeExplore ||
      getFlag("storyContinueExplore") ||
      getFlag("postTutorialStoryStart");
    setFlag("storyContinueExplore", false);
    setFlag("postTutorialStoryStart", false);

    await withFade(async () => {
      clearStage();
      await goTo("map");
      setState({ currentLocation: homeId });
      if (!getState().visitedLocations.includes(sceneId)) {
        noteVisit(sceneId);
      }
      setCurrentMarkHighlight(homeId);
      await waitFrames(1);
      await ensureMapViewportReady();
    });

    if (continueExplore) {
      await maybeStoryTravelAndEnterAfterLeave();
      return;
    }

    const focus = getStoryFocusLocationId(getState(), locationsData);
    if (focus && focus !== getState().currentLocation) {
      await maybeStoryTravelAndEnterAfterLeave();
      return;
    }

    await withFade(() => enterLocation(sceneLoc, { skipActionCharge: true }));
  } catch (err) {
    console.error("[story] startStoryMode failed", err);
    document.getElementById("veil")?.classList.remove("is-on");
    await withFade(() => goTo("map"));
  }
}

function openMenu() {
  const o = document.getElementById("overlay");
  o.hidden = false;
  syncAudioMenu();
  requestAnimationFrame(() => o.classList.add("is-on"));
}

function closeMenu() {
  const o = document.getElementById("overlay");
  o.classList.remove("is-on");
  setTimeout(() => { o.hidden = true; }, 380);
}

function hydrateLanguageButtons() {
  const lang = getLanguage();
  document.querySelectorAll("[data-lang]").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.lang === lang);
  });
}

function toggleContinueButton() {
  const btn = document.querySelector("[data-action='continue']");
  if (!btn) return;
  btn.hidden = !hasSave();
  syncSplashContinueButton();
}

function renderLocationTitle() {
  const state = getState();
  if (!state.currentLocation) return;
  const loc = locationById(state.currentLocation);
  if (loc) document.getElementById("location-title").textContent = localizedTitle(loc.title);
}

/* =========================================================
   Misc
   ========================================================= */

function pickInitialLang() {
  const n = (navigator.language || "").toLowerCase();
  if (n.startsWith("ru")) return "ru";
  return "en";
}
