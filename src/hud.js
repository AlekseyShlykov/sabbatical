// hud.js — прогресс книг и часы/действия дня (правый верх).

import { subscribe, getState } from "./state.js";
import { t, tFmt, applyDomI18n, onLanguageChange, getLanguage } from "./localization.js";
import {
  isHudVisible,
  getDayCycle,
  MAX_ACTIONS_PER_DAY,
  gameClockLabel,
  gameDateLabel,
  actionsRemaining,
} from "./dayCycle.js";
import { isStoryMode } from "./storyMode.js";

const els = {
  root: null,
  books: null,
  dayNum: null,
  date: null,
  clock: null,
  actions: null,
  scienceFill: null,
  novelFill: null,
  sciencePct: null,
  novelPct: null,
  scienceToday: null,
  novelToday: null,
};

export function initHud() {
  els.root = document.getElementById("game-hud");
  if (!els.root) return;

  els.books = document.getElementById("hud-books");
  els.dayNum = document.getElementById("hud-day-num");
  els.dayLabel = els.root.querySelector(".game-hud__day-label");
  els.date = document.getElementById("hud-date");
  els.clock = document.getElementById("hud-clock");
  els.actions = document.getElementById("hud-actions");
  els.scienceFill = document.querySelector('[data-hud-fill="science"]');
  els.novelFill = document.querySelector('[data-hud-fill="novel"]');
  els.sciencePct = document.querySelector('[data-hud-pct="science"]');
  els.novelPct = document.querySelector('[data-hud-pct="novel"]');
  els.scienceToday = document.querySelector('[data-hud-today="science"]');
  els.novelToday = document.querySelector('[data-hud-today="novel"]');

  applyDomI18n(els.root);
  subscribe(renderHud);
  onLanguageChange(() => {
    applyDomI18n(els.root);
    renderHud(getState());
  });
}

export function renderHud(state = getState()) {
  if (!els.root) return;

  const active = isHudVisible();
  const onGameScreen =
    state.screen === "map" ||
    state.screen === "location" ||
    state.screen === "modeSelect";
  els.root.hidden = !(active && onGameScreen);

  if (!active) return;

  const dc = getDayCycle();
  const bp = state.bookProgress || { science: 0, novel: 0 };
  const today = dc.bookToday || { science: 0, novel: 0 };

  const storyHud = isStoryMode(state);

  if (els.dayNum) {
    els.dayNum.hidden = storyHud;
    els.dayNum.textContent = String(dc.day);
  }
  if (els.dayLabel) els.dayLabel.hidden = storyHud;
  if (els.date) els.date.textContent = gameDateLabel(dc.day, getLanguage());
  if (els.clock) els.clock.textContent = gameClockLabel();
  if (els.actions) {
    els.actions.hidden = storyHud;
    if (!storyHud) {
      els.actions.textContent = tFmt("hud.actions", {
        used: dc.actionsUsed,
        max: MAX_ACTIONS_PER_DAY,
        left: actionsRemaining(),
      });
    }
  }

  setBar(els.scienceFill, els.sciencePct, bp.science || 0);
  setBar(els.novelFill, els.novelPct, bp.novel || 0);

  if (els.scienceToday) {
    els.scienceToday.textContent = tFmt("hud.todayProgress", {
      n: today.science || 0,
    });
  }
  if (els.novelToday) {
    els.novelToday.textContent = tFmt("hud.todayProgress", {
      n: today.novel || 0,
    });
  }

  els.root.classList.toggle("is-story", storyHud);
  els.root.classList.toggle(
    "is-exhausted",
    !storyHud && dc.actionsUsed >= MAX_ACTIONS_PER_DAY
  );
  const hudOn = active && onGameScreen;
  document.body.classList.toggle("has-game-hud", hudOn);
  document.body.dataset.gameScreen =
    hudOn && (state.screen === "map" || state.screen === "location")
      ? state.screen
      : "";

  const navMap = document.getElementById("hud-nav-map");
  const navLoc = document.getElementById("hud-nav-location");
  const mapTitle = document.getElementById("hud-map-title");
  if (navMap) navMap.hidden = !(hudOn && state.screen === "map");
  if (navLoc) navLoc.hidden = !(hudOn && state.screen === "location");
  if (mapTitle) mapTitle.hidden = !(hudOn && state.screen === "map");
}

function setBar(fillEl, pctEl, value) {
  const v = Math.max(0, Math.min(100, value));
  if (fillEl) fillEl.style.width = `${v}%`;
  if (pctEl) pctEl.textContent = `${v}%`;
}

/** Всплывающая подсказка в панели диалога при нехватке действий. */
export function showHudToast(message) {
  const panel = document.getElementById("dialogue-panel");
  if (!panel) return;
  let toast = panel.querySelector(".hud-toast");
  if (!toast) {
    toast = document.createElement("p");
    toast.className = "hud-toast";
    panel.insertBefore(toast, panel.firstChild);
  }
  toast.textContent = message;
  toast.classList.add("is-on");
  clearTimeout(showHudToast._timer);
  showHudToast._timer = setTimeout(() => toast.classList.remove("is-on"), 3200);
}
