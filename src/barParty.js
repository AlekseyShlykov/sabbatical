// barParty.js — Day 4.5 party: three conversation branches before "go home".

import { getState, update } from "./state.js";

const BRANCH_ROOTS = {
  "Подойти к группе Зеленая, Пурпурный, Белая": "green",
  "Подойти к Желтой и Черному": "yellow",
  "Подойти к Красному и Синему": "red",
};

/** Passages where a branch conversation ends and the player can switch groups. */
const BRANCH_EXIT_PASSAGES = new Set([
  "Меня никто из них не пугает",
  "Меня тоже пугает Черный",
  "Меня тоже пугают Синий и Красный",
  "Как вам погода?",
  "Все еще молчать",
  "Сочувствую!",
]);

let currentBranch = null;

function branchState() {
  const flags = getState().flags || {};
  return {
    green: Boolean(flags.barParty_green),
    yellow: Boolean(flags.barParty_yellow),
    red: Boolean(flags.barParty_red),
  };
}

export function resetBarPartyBranches() {
  currentBranch = null;
  update((s) => {
    delete s.flags.barParty_green;
    delete s.flags.barParty_yellow;
    delete s.flags.barParty_red;
    return s;
  });
}

function anyBarPartyBranchStarted() {
  const b = branchState();
  return b.green || b.yellow || b.red;
}

export function onBarPartyPassageEnter(passageName) {
  if (passageName === "Day 4.5. Bar") {
    if (!anyBarPartyBranchStarted()) resetBarPartyBranches();
    return;
  }
  const id = BRANCH_ROOTS[passageName];
  if (id) currentBranch = id;
}

export function onBarPartyChoicesShown(passageName) {
  if (!currentBranch || !BRANCH_EXIT_PASSAGES.has(passageName)) return;
  const key = `barParty_${currentBranch}`;
  update((s) => {
    s.flags[key] = true;
    return s;
  });
}

export function allBarPartyBranchesDone() {
  const b = branchState();
  return b.green && b.yellow && b.red;
}

export function isGoHomeChoice(choice) {
  if (!choice) return false;
  if (choice.target === "Следующий день") return true;
  return /пойти\s+домой/i.test(choice.label || "");
}

export function filterBarPartyChoices(choices) {
  if (!choices?.length) return choices;
  const hasGoHome = choices.some(isGoHomeChoice);
  if (!hasGoHome || allBarPartyBranchesDone()) return choices;
  return choices.filter((c) => !isGoHomeChoice(c));
}
