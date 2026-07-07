// barParty.js — Day 4.5 party: three conversation branches before "go home".

import { getState, update } from "./state.js";
import { t } from "./localization.js";

const GO_HOME_TARGET = "Следующий день";

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

/**
 * Отметить, что игрок довёл текущую ветку до конца (до места, где можно выбрать
 * другую ветку). Вызывать ДО фильтрации выборов, чтобы завершение 3-й ветки
 * открывало «Пойти домой» прямо здесь, без возврата в уже пройденный разговор.
 */
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
  if (choice.target === GO_HOME_TARGET) return true;
  return /пойти\s+домой|go\s+home/i.test(choice.label || "");
}

export function filterBarPartyChoices(choices, passageName) {
  const list = Array.isArray(choices) ? choices : [];
  const atExit = BRANCH_EXIT_PASSAGES.has(passageName);
  const hasGoHome = list.some(isGoHomeChoice);

  if (allBarPartyBranchesDone()) {
    // Все 3 ветки пройдены: «Пойти домой» должно быть доступно на выходе из
    // ветки, даже если у самого пассажа такой ссылки нет.
    if (!hasGoHome && atExit) {
      return [...list, { label: t("dialogue.goHome"), target: GO_HOME_TARGET }];
    }
    return list;
  }
  // Ещё не все ветки пройдены — прячем «Пойти домой», если оно есть.
  return hasGoHome ? list.filter((c) => !isGoHomeChoice(c)) : list;
}
