// main.js
// Top-level orchestrator. Wires state, screens, map, scene, dialogue.
// Keep flow-control here; keep system-level behavior in sibling modules.

import {
  getState, setState, subscribe,
  loadSave, applySave, hasSave, clearSave, resetState,
  markVisited, unlock, setFlag, getFlag, update,
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
import { initScene, clearStage, setBackground, resolveRasterUrl } from "./scene.js";
import { backgroundForLocation } from "./locationAssets.js";
import {
  initDialogue, setGraph, renderPassage,
  setEndCallback, rerenderCurrent, setAfterPassageHook,
} from "./dialogue.js";
import { buildGraph } from "./twineLoader.js";
import {
  setReturnToMapCallback,
  setOpenIslandMapCallback,
  initialBackgroundFromPassage,
} from "./commands.js";
import { initHud, showHudToast } from "./hud.js";
import {
  isDayCycleActive,
  enableGameHud,
  canSpendAction,
  spendAction,
  isDayExhausted,
  advanceDay,
  MAX_ACTIONS_PER_DAY,
} from "./dayCycle.js";
import {
  getStoryOrder,
  shouldCompleteStoryDayOne,
  markStoryDayOneEnded,
  getStoryNextUnvisitedLocation,
  getStoryFocusLocationId,
  isStoryMode,
} from "./storyMode.js";

const LOCATIONS_URL = "data/locations.json";
const INTRO_DIR = "assets/intro/";
const INTRO_BASE = "intro1";

let locationsData = null;
let storyGraph = null;       // language-bound graph for current language
let sendingPlayerHome = false;

bootstrap().catch((err) => {
  console.error("[boot] fatal", err);
  document.body.innerHTML = `<pre style="padding:24px;font-family:monospace;color:#600">${err}</pre>`;
});

async function bootstrap() {
  // Initial language: saved > browser > 'ru'
  const save = loadSave();
  const startLang = save?.language || pickInitialLang();
  await setLanguage(startLang);

  // Load data
  const [locRes] = await Promise.all([fetch(LOCATIONS_URL)]);
  if (!locRes.ok) throw new Error("locations.json missing");
  locationsData = await locRes.json();
  await loadStoryForLanguage(getLanguage());

  // Init systems
  initScene();
  initMap(locationsData);
  initDialogue();
  initHud();
  void preloadGameplayAssets();
  setAfterPassageHook(maybeReturnHomeAfterVisit);
  setEndCallback(handleDialogueEnd);
  setReturnToMapCallback(handleReturnToMap);
  setOpenIslandMapCallback(openIslandFromHome);
  onSelectLocation(handleMapSelect);

  if (save) {
    applySave(save);
  } else {
    resetState({
      language: startLang,
      unlockedLocations: [...locationsData.initiallyUnlocked],
    });
  }

  wireGlobalUI();
  hydrateLanguageButtons();
  toggleContinueButton();

  // Initial screen.
  // The "location" screen depends on transient state (current passage, stage
  // composition) that we don't persist, so on a fresh load we drop the player
  // back to the map — same as if they had pressed Leave.
  let initialScreen = getState().screen || "splash";
  if (initialScreen === "location") initialScreen = "map";
  await goTo(initialScreen);
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
});

/* =========================================================
   Screen transitions
   ========================================================= */

async function goTo(screenId) {
  setState({ screen: screenId });
  showScreen(screenId);

  if (screenId === "map") {
    await waitFrames(2);
    await renderMap();
  }
  if (screenId === "intro") {
    setupIntroImage();
  }
}

function warmImage(url) {
  if (!url) return;
  const im = new Image();
  im.src = url;
}

/** Подгрузка частых ассетов (WebP при наличии). */
async function preloadGameplayAssets() {
  const specs = [
    ["assets/map/", "map"],
    ["assets/map/", "player"],
    ["assets/map/", "mark"],
    ["assets/intro/", INTRO_BASE],
    ["assets/backgrounds/", "houseorangeinside"],
    ["assets/backgrounds/", "barout2"],
    ["assets/characters/", "mrred"],
  ];
  const urls = await Promise.all(
    specs.map(([dir, name]) => resolveRasterUrl(dir, name))
  );
  urls.filter(Boolean).forEach(warmImage);
}

async function setupIntroImage() {
  const img = document.querySelector(".intro__img");
  if (!img) return;
  img.classList.remove("is-missing");
  const url = await resolveRasterUrl(INTRO_DIR, INTRO_BASE);
  if (!url) {
    console.warn(`[intro] missing image: ${INTRO_DIR}${INTRO_BASE}`);
    img.classList.add("is-missing");
    return;
  }
  img.src = url;
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
  const state = getState();
  const fromId = state.currentLocation || locationsData.startLocation;
  const toLoc  = locationById(toId);
  if (!toLoc) return;

  if (isStoryMode(state) && !getFlag("storyDay1Ended")) {
    const here = state.currentLocation || locationsData.startLocation;
    const focus = getStoryFocusLocationId(state, locationsData);
    if (toId !== here && toId !== focus) return;
  }

  const traveling = !skipTravel && fromId !== toId;
  const needsVisitCharge = !skipActionCharge && isDayCycleActive();

  if (needsVisitCharge && !canSpendAction()) {
    showHudToast(t("hud.noActions"));
    await sendPlayerHome();
    return;
  }

  // Re-entering the current location: skip the walk animation.
  if (skipTravel || fromId === toId) {
    if (needsVisitCharge && !spendAction()) {
      showHudToast(t("hud.noActions"));
      await sendPlayerHome();
      return;
    }
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
    noteVisit(toId);
    await enterLocation(toLoc, { skipActionCharge: true });
  });
}

/** После 10-го действия: на карту, анимация к оранжевому дому, сцена «дома». */
async function sendPlayerHome() {
  if (sendingPlayerHome) return;
  if (!isDayCycleActive() || !isDayExhausted()) return;

  const homeId = locationsData.startLocation;
  const home = locationById(homeId);
  if (!home) return;

  const state = getState();
  if (state.screen === "location" && state.currentLocation === homeId) return;

  sendingPlayerHome = true;
  const fromId = state.currentLocation || homeId;

  try {
  if (getState().screen === "location") {
    clearStage();
    goTo("map");
  }

  showHudToast(t("hud.dayEndReturnHome"));

  if (fromId !== homeId) {
    await performMapTravel(fromId, homeId);
    noteVisit(homeId);
  } else {
    setState({ currentLocation: homeId });
    setCurrentMarkHighlight(homeId);
  }

  await withFade(() => enterLocation(home, { skipActionCharge: true }));
  } finally {
    sendingPlayerHome = false;
  }
}

async function handleReturnToMap() {
  if (isDayCycleActive() && isDayExhausted()) {
    await sendPlayerHome();
    return;
  }
  await leaveLocation();
}

async function enterLocation(loc, { skipActionCharge = false } = {}) {
  clearStage();
  const passageName = resolveTwinePassage(loc);
  let bg = backgroundForLocation(loc);
  if (passageName && storyGraph?.[passageName]) {
    const fromPassage = initialBackgroundFromPassage(storyGraph[passageName]);
    if (fromPassage) bg = fromPassage;
  }
  await setBackground(bg);
  document.getElementById("location-title").textContent = localizedTitle(loc.title);
  goTo("location");

  const lineEl = document.getElementById("dialogue-line");
  const actionsEl = document.getElementById("dialogue-actions");
  actionsEl.innerHTML = "";

  if (passageName) {
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
  const homeId = locationsData.startLocation;
  const state = getState();
  if (state.screen === "location" && state.currentLocation === homeId) return;
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

function resolveTwinePassage(loc) {
  if (getFlag("tutorialMap") && loc.id === "orangehouse") {
    return "orange house inside";
  }
  if (loc.id === "orangehouse") {
    return "orange house";
  }
  return loc.twinePassage;
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
  clearStage();
  setBackground("barout2");
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
  await withFade(() => goTo("map"));
}

async function leaveLocation() {
  const homeId = locationsData.startLocation;
  const pendingStoryHome = shouldCompleteStoryDayOne();

  if (isDayCycleActive() && isDayExhausted() && !pendingStoryHome) {
    await sendPlayerHome();
    return;
  }

  await withFade(async () => {
    clearStage();
    await goTo("map");
  });

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

/** После пляжа в сюжете: прогулка на карте к оранжевому дому и вход в сцену дома. */
async function travelStoryHomeAfterBeach() {
  const homeId = locationsData.startLocation;
  const home = locationById(homeId);
  if (!home) return;

  const fromId = getState().currentLocation || homeId;
  showHudToast(t("hud.dayEndReturnHome"));

  if (fromId !== homeId) {
    await performMapTravel(fromId, homeId);
    setCurrentMarkHighlight(homeId);
  } else {
    setState({ currentLocation: homeId });
    setCurrentMarkHighlight(homeId);
  }

  await withFade(() => enterLocation(home, { skipActionCharge: true }));
}

/** В режиме «Сюжет»: после сцены — пройти по карте к следующей точке и войти в неё. */
async function maybeStoryTravelAndEnterAfterLeave() {
  if (!isStoryMode()) return;

  const state = getState();
  const nextId = getStoryNextUnvisitedLocation(state, locationsData);
  if (!nextId) return;

  const fromId = state.currentLocation || locationsData.startLocation;
  const toLoc = locationById(nextId);
  if (!toLoc || fromId === nextId) return;

  const needsVisitCharge = isDayCycleActive();
  if (needsVisitCharge && !canSpendAction()) {
    showHudToast(t("hud.noActions"));
    await sendPlayerHome();
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

  markStoryDayOneEnded(locationsData);
  update((s) => {
    if (!s.dayCycle) {
      s.dayCycle = { day: 1, actionsUsed: 0, bookToday: { science: 0, novel: 0 } };
    }
    s.dayCycle.actionsUsed = MAX_ACTIONS_PER_DAY;
    return s;
  });
  advanceDay();
  void renderMap();
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
      const state = getState();
      if (!state.mode && state.screen === "splash") {
        await withFade(() => goTo("intro"));
      }
      return;
    }
    case "continue": {
      const save = loadSave();
      if (!save) return;
      applySave(save);
      if (save.language) await setLanguage(save.language);
      const screen = save.screen === "splash" ? "map" : (save.screen || "map");
      await withFade(() => goTo(screen));
      return;
    }
    case "intro-continue": {
      await withFade(() => startPrologueDialogue());
      return;
    }
    case "leave": {
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
      clearSave();
      closeMenu();
      resetState({
        language: getLanguage(),
        unlockedLocations: [...locationsData.initiallyUnlocked],
      });
      await withFade(() => goTo("splash"));
      toggleContinueButton();
      return;
  }
}

async function chooseMode(mode) {
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
    mapPlayerCoord: null,
    flags: {
      ...getState().flags,
      tutorialMap: false,
      prologue: false,
      storyDay1PendingEnd: false,
      storyDay1Ended: false,
      storyContinueExplore: false,
      postTutorialStoryStart: false,
    },
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
    await startStoryMode();
    return;
  }
  noteVisit(startId);
  void withFade(async () => {
    await goTo("map");
  });
}

/** Режим «Сюжет»: сразу первая сцена; после «Пойду исследовать» — авто-переход по маршруту. */
async function startStoryMode() {
  try {
    const storyOrder = getStoryOrder(locationsData);
    const sceneId = storyOrder[0] || locationsData.startLocation;
    const sceneLoc = locationById(sceneId);
    if (!sceneLoc) {
      await withFade(() => goTo("map"));
      return;
    }

    const continueExplore =
      getFlag("storyContinueExplore") || getFlag("postTutorialStoryStart");
    setFlag("storyContinueExplore", false);
    setFlag("postTutorialStoryStart", false);

    if (continueExplore) {
      clearStage();
      await withFade(async () => {
        await goTo("map");
        noteVisit(sceneId);
        setCurrentMarkHighlight(sceneId);
      });
      await maybeStoryTravelAndEnterAfterLeave();
      return;
    }

    await withFade(async () => {
      clearStage();
      await goTo("map");
      noteVisit(sceneId);
      setCurrentMarkHighlight(sceneId);
      await waitFrames(1);
      await ensureMapViewportReady();
      await enterLocation(sceneLoc, { skipActionCharge: true });
    });
  } catch (err) {
    console.error("[story] startStoryMode failed", err);
    document.getElementById("veil")?.classList.remove("is-on");
    await withFade(() => goTo("map"));
  }
}

function openMenu() {
  const o = document.getElementById("overlay");
  o.hidden = false;
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
  if (btn) btn.hidden = !hasSave();
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
