// dialogue.js
// Dialogue engine. Follows agents.md + style.md strictly:
//   * one line on screen at a time
//   * `//commands` are executed in-line, never printed
//   * speaker prefix (`id:`) highlights one slot, dims the rest
//   * narrator = no highlight
//   * after the last line: choice buttons OR an "end" hook
//   * tap on stage or dialogue text finishes the typewriter early
//   * language switch re-renders current passage by name

import { setSpeaker } from "./scene.js";
import { runCommand } from "./commands.js";
import { t, getLanguage } from "./localization.js";
import {
  isDayCycleActive,
  canSpendAction,
  spendAction,
  choiceCostsAction,
  canWriteBook,
} from "./dayCycle.js";
import { showHudToast } from "./hud.js";
import { tryForceDay4Party } from "./scheduledEvents.js";
import {
  onBarPartyPassageEnter,
  onBarPartyChoicesShown,
  filterBarPartyChoices,
} from "./barParty.js";

const TYPE_DELAY = {
  default: 22,
  space:   10,
  punct:   60,
};
const PUNCT = new Set([".", ",", "!", "?", ":", ";", "—", "…"]);

const els = {
  panel: null,
  line:  null,
  actions: null,
  stage: null,
};

let graph = null;
let currentPassageName = null;
let currentPassage = null;
let stepIndex = 0;
let typingState = null;       // { done: bool, finish: fn }
let onEndCb = null;
let onChoiceCb = null;        // optional: external observer
let afterPassageHook = null;

const prefersReduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function finishTypingEarly() {
  if (typingState && !typingState.done) typingState.finish();
}

function hasMoreLinesInPassage() {
  return Boolean(currentPassage && stepIndex < currentPassage.steps.length);
}

/** Tap: допечатать текст или перейти к следующей реплике (удобно на телефоне). */
function handleSceneTap(e) {
  const tag = (e.target.tagName || "").toLowerCase();
  if (tag === "button" || tag === "input" || tag === "textarea") return;
  if (typingState && !typingState.done) {
    finishTypingEarly();
    return;
  }
  if (hasMoreLinesInPassage()) void advance();
}

export function initDialogue() {
  els.panel   = document.getElementById("dialogue-panel");
  els.line    = document.getElementById("dialogue-line");
  els.actions = document.getElementById("dialogue-actions");
  els.stage   = document.getElementById("stage");

  els.stage.addEventListener("click", handleSceneTap);
  els.panel.addEventListener("click", (e) => {
    if (e.target.closest("button")) return;
    handleSceneTap(e);
  });
  els.line.addEventListener("click", (e) => {
    e.stopPropagation();
    handleSceneTap(e);
  });
}

export function setGraph(newGraph) { graph = newGraph; }

export function setEndCallback(fn)    { onEndCb = fn; }
export function setChoiceCallback(fn) { onChoiceCb = fn; }
export function setAfterPassageHook(fn) { afterPassageHook = fn; }

/** Render a passage by name. */
export async function renderPassage(name) {
  if (!graph) throw new Error("[dialogue] graph not loaded");
  const p = graph[name];
  if (!p) {
    console.error(`[dialogue] missing passage: ${name}`);
    showRaw(t("errors.missingPassage") + ": " + name, "narrator");
    return;
  }
  if (typingState && !typingState.done) typingState.cancel();

  // Пассажи-заметки сценариста: только хук движка, без «фиктивных» команд.
  if (name === "Давайте" || name === "До встречи") {
    if (onEndCb) onEndCb({ passage: name });
    return;
  }

  currentPassageName = name;
  currentPassage = p;
  onBarPartyPassageEnter(name);
  stepIndex = 0;

  els.actions.innerHTML = "";
  els.line.textContent = "";
  els.line.dataset.speaker = "";

  await advance();
}

/** Re-render current passage (called on language switch). */
export async function rerenderCurrent() {
  if (currentPassageName) await renderPassage(currentPassageName);
}

export function getCurrentPassage() { return currentPassageName; }

/** Process steps until the next visible line, then render it. */
async function advance() {
  while (stepIndex < currentPassage.steps.length) {
    const step = currentPassage.steps[stepIndex++];
    if (step.type === "command") {
      await runCommand(step.text);
      continue;
    }
    if (step.type === "line") {
      await setSpeaker(step.speaker);
      await showLine(step.speaker, step.text);
      decideAfterLine();
      return;
    }
  }
  // Passage finished without producing a line — show choices/end immediately.
  decideAfterLine(/*forceEnd*/ true);
}

function decideAfterLine(forceEnd = false) {
  // More lines/commands ahead? Show "Next".
  const hasMore = stepIndex < currentPassage.steps.length;
  els.actions.innerHTML = "";

  if (hasMore && !forceEnd) {
    const btn = makeButton(t("dialogue.next"), () => advance());
    btn.classList.add("choice-btn", "choice-btn--next");
    els.actions.appendChild(btn);
    return;
  }

  const choices = filterBarPartyChoices(currentPassage.choices);
  if (choices.length > 0) {
    onBarPartyChoicesShown(currentPassageName);
    choices.forEach((c, i) => {
      const costsAction = choiceCostsAction(c.target);
      const btn = makeButton(c.label, () => {
        void (async () => {
          if (costsAction && !spendAction()) {
            showHudToast(t("hud.noActions"));
            return;
          }
          if (costsAction && (await tryForceDay4Party())) return;
          if (onChoiceCb) onChoiceCb(c);
          void renderPassage(c.target);
        })();
      });
      btn.classList.add("choice-btn");
      if (costsAction && !canSpendAction()) {
        btn.disabled = true;
        btn.classList.add("choice-btn--disabled");
        btn.title = t("hud.noActions");
      }
      if (c.target === "Научная книга" && !canWriteBook("science")) {
        btn.disabled = true;
        btn.classList.add("choice-btn--disabled");
        btn.title = t("hud.dailyBookCap");
      }
      if (c.target === "Роман" && !canWriteBook("novel")) {
        btn.disabled = true;
        btn.classList.add("choice-btn--disabled");
        btn.title = t("hud.dailyBookCap");
      }
      btn.style.animationDelay = `${i * 70}ms`;
      els.actions.appendChild(btn);
    });
    return;
  }

  // No more lines, no choices => end of branch.
  if (onEndCb) onEndCb({ passage: currentPassageName });
  if (afterPassageHook) void afterPassageHook();
}

function makeButton(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", (e) => {
    // Prevent accidental double-fire from rapid taps / programmatic chains.
    if (b.disabled) return;
    b.disabled = true;
    onClick(e);
  });
  return b;
}

function showRaw(text, speaker = "narrator") {
  els.line.dataset.speaker = speaker;
  els.line.textContent = text;
}

/** Typewriter render of a single line. */
function showLine(speaker, text) {
  // Cancel any previous typewriter to prevent it from continuing to mutate
  // els.line.textContent after we move on (e.g. on rapid Next clicks or
  // passage transitions).
  if (typingState && !typingState.done) typingState.cancel();

  return new Promise((resolve) => {
    els.line.dataset.speaker = speaker || "narrator";
    els.line.textContent = "";

    if (prefersReduced()) {
      els.line.textContent = text;
      typingState = { done: true, finish: () => {}, cancel: () => {} };
      resolve();
      return;
    }

    let i = 0;
    let cancelled = false;
    typingState = {
      done: false,
      finish: () => {
        if (cancelled) return;
        cancelled = true;
        els.line.textContent = text;
        typingState.done = true;
      },
      cancel: () => {
        cancelled = true;
        typingState.done = true;
      },
    };

    const tick = () => {
      if (cancelled) { resolve(); return; }
      if (i >= text.length) { typingState.done = true; resolve(); return; }
      const ch = text[i++];
      els.line.textContent += ch;
      let delay = TYPE_DELAY.default;
      if (ch === " ")        delay = TYPE_DELAY.space;
      else if (PUNCT.has(ch)) delay = TYPE_DELAY.punct;
      setTimeout(tick, delay);
    };
    tick();
  });
}

// language switch helper
export function getLang() { return getLanguage(); }
