// commands.js
// Central handler for in-passage `//command` lines (per agents.md).
//
// A command is a single line that begins with `//`. Everything after the
// slashes (up to the end of line) is forwarded here, lowercased.
// Unknown commands are warned but never crash the engine.
//
// Synonyms across languages live HERE, not in the Twine source.

import {
  setBackground,
  showCharacter,
  showCharacters,
  hideCharacter,
  clearStage,
} from "./scene.js";
import { setFlag } from "./state.js";
import { tryAddBookProgress, enableGameHud } from "./dayCycle.js";
import { requestEndCalendarDay } from "./dayTransition.js";
import { showHudToast } from "./hud.js";
import { t } from "./localization.js";
import { showLetterProp, showDevEndEmailForm } from "./devEnd.js";

const BG_WORDS    = new Set(["фон", "background", "bg"]);
const SHOW_WORDS  = new Set(["показать", "show", "вход", "enter"]);
const HIDE_WORDS  = new Set(["скрыть", "hide", "уход", "leave"]);
const CLEAR_WORDS = new Set(["сцена_очистить", "clear", "clearstage"]);
const FLAG_WORDS  = new Set(["флаг", "flag", "set"]);
const APPEAR_WORDS = new Set(["появляется", "появить", "appears", "appear"]);
const MAP_WORDS = new Set(["карта", "map", "карту"]);
const LOC_WORDS = new Set(["локация", "location", "место"]);

const BAR_RE = /^(?:в\s+)?баре?\s+|^(?:at|in)\s+(?:the\s+)?bar\s+/iu;
const MEET_RE = /(?:вы\s+)?(?:встречаете|встретили|meet)\s+([\p{L}\p{N}_]+)/iu;

const ENGINE_COMMAND_HEAD =
  /^(?:фон|background|bg|показать|show|вход|enter|скрыть|hide|уход|leave|сцена_очистить|clear|clearstage|флаг|flag|set|локация|location|место|карта|map|карту)$/iu;

/** Строка `//…` — команда движка, а не заметка сценариста в Twine. */
export function isEngineCommandBody(body) {
  const trimmed = (body || "").trim();
  if (!trimmed) return false;
  const head = trimmed.split(/\s+/)[0];
  if (ENGINE_COMMAND_HEAD.test(head)) return true;
  if (/^(?:возвраща|вернут|return).*(?:карт|map)/iu.test(trimmed)) return true;
  if (/^на\s+карту/iu.test(trimmed)) return true;
  if (/открыва(?:ет|ется)\s+карту|opens?\s+(?:the\s+)?island\s+map/iu.test(trimmed)) return true;
  if (
    /снова\s+показывает\s+вид\s+на\s+дом|shows?\s+(?:the\s+)?house\s+view\s+again/iu.test(
      trimmed
    )
  ) {
    return true;
  }
  if (/появляется\s+графа|writing\s+progress\s+bar/iu.test(trimmed)) return true;
  if (
    /^(?:в\s+)?баре?\s+/iu.test(trimmed) ||
    /^(?:at|in)\s+(?:the\s+)?bar\s+/iu.test(trimmed)
  ) {
    return true;
  }
  if (/(?:встречаете|встретили|meet)\s+[\p{L}\p{N}_]+/iu.test(trimmed)) return true;
  if (/добавляет?\s+1\s*%?\s+к\s+написанию/iu.test(trimmed)) return true;
  if (/новый\s+день|new\s+day/iu.test(trimmed)) return true;
  if (/начинает\s+день\s*5|starts?\s+day\s*5/iu.test(trimmed)) return true;
  if (/^(?:письмо|letter)(?=\s|$)/iu.test(trimmed) || /letter\.png/iu.test(trimmed)) return true;
  if (/форма\s+email|email\s+form/iu.test(trimmed)) return true;
  if (/переход на следующую сцену/i.test(trimmed)) return true;
  if (/^новый\s+фон/i.test(trimmed)) return true;
  if (/белая уходит|игрок возвращается на карту/i.test(trimmed)) return true;
  if (/на часах\s*15|15\.00.*бар/i.test(trimmed)) return true;
  if (/^(?:появляется|появить|appears|appear)\s+[a-z][\w-]*$/iu.test(trimmed)) {
    return true;
  }
  return false;
}

/** Twine / author labels → assets/backgrounds basename (no extension). */
const BG_ALIASES = {
  barout2: "barout2",
  "orange house out": "houseorangeout",
  "orange house inside": "houseorangeinside",
  "orange house": "houseorangeinside",
  "дом оранжевого": "houseorangeinside",
  "оранжевый дом": "houseorangeinside",
  "houseorangewindow": "houseorangewindow",
  "дом пурпурного внутри": "housepurpleinside",
  "housepurpleinside": "housepurpleinside",
  beach: "beach",
  пляж: "beach",
  lighthouse: "lighthouse",
  маяк: "lighthouse",
  лес: "forrest",
};

let onReturnToMap = null;
let onOpenIslandMap = null;
let onContinueScene = null;
let onAfterNewDay = null;
let onBeginDayFive = null;

function normalizeBackgroundName(raw) {
  const key = (raw || "").trim().replace(/^[-–—]\s*/, "").toLowerCase();
  return BG_ALIASES[key] || key.replace(/\s+/g, "");
}

/** Имя фона из тела `//фон …` (или `//локация …, фон …`). */
export function backgroundNameFromCommandBody(body) {
  const trimmed = (body || "").trim();
  if (!trimmed) return null;
  const [head, ...rest] = trimmed.split(/\s+/);
  const verb = head.toLowerCase();
  const arg = rest.join(" ").trim();
  if (BG_WORDS.has(verb)) return normalizeBackgroundName(arg);
  if (LOC_WORDS.has(verb)) {
    const bgMatch = trimmed.match(/(?:^|[,\s])фон\s*[-–—]?\s*([^,\n]+)/iu);
    if (bgMatch) return normalizeBackgroundName(bgMatch[1]);
  }
  return null;
}

/** Первые команды пассажа до реплик — какой фон показать сразу при входе. */
export function initialBackgroundFromPassage(passage) {
  if (!passage?.steps) return null;
  let bg = null;
  for (const step of passage.steps) {
    if (step.type !== "command") break;
    const name = backgroundNameFromCommandBody(step.text);
    if (name) bg = name;
  }
  return bg;
}

/** Called when a passage uses `//карта` or `//возвращается на карту`. */
export function setReturnToMapCallback(fn) {
  onReturnToMap = fn;
}

/** `//открывается карта острова` — выход из дома на карту мира. */
export function setOpenIslandMapCallback(fn) {
  onOpenIslandMap = fn;
}

/** `//переход на следующую сцену …` — цепочка сцен без выхода на карту. */
export function setContinueSceneCallback(fn) {
  onContinueScene = fn;
}

/** После `//новый день` — вернуть экран локации, если диалог ещё идёт. */
export function setAfterNewDayCallback(fn) {
  onAfterNewDay = fn;
}

export function setBeginDayFiveCallback(fn) {
  onBeginDayFive = fn;
}

function wantsMapReturn(body) {
  const b = body.toLowerCase();
  if (MAP_WORDS.has(b.split(/\s+/)[0])) return true;
  return /(?:возвраща|вернут|return).*(?:карт|map)/u.test(b) || /^на\s+карту/u.test(b);
}

/** `mrred, msyellow` or `mrred msyellow` → unique ids */
function parseCharacterIds(text) {
  const seen = new Set();
  return (text || "")
    .split(/[,;]+|\s+/)
    .map((s) => s.trim().toLowerCase())
    .filter((id) => {
      if (!id || !/^[\p{L}\p{N}_]+$/u.test(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
}

async function showSeveral(ids) {
  if (!ids || ids.length === 0) return;
  await showCharacters(ids);
}

/**
 * Все действующие персонажи пассажа в порядке появления — чтобы показать их
 * сразу при входе в диалог (игрок видит всех участников, а не по одному, когда
 * заговорят). Собираем и из команд показа (`//показать`, `//в баре …`,
 * `//встречаете …`, `//появляется …`), и из префиксов реплик; `//скрыть`
 * убирает персонажа, `//очистить` — сбрасывает набор.
 */
export function collectPassageParticipants(passage) {
  if (!passage?.steps) return [];
  const order = [];
  const set = new Set();
  const add = (raw) => {
    const id = (raw || "").toLowerCase();
    if (!id || id === "narrator" || set.has(id)) return;
    set.add(id);
    order.push(id);
  };
  const remove = (raw) => {
    const id = (raw || "").toLowerCase();
    if (!set.delete(id)) return;
    const i = order.indexOf(id);
    if (i >= 0) order.splice(i, 1);
  };
  for (const step of passage.steps) {
    if (step.type === "line") {
      add(step.speaker);
      continue;
    }
    if (step.type !== "command") continue;
    const body = (step.text || "").trim();
    if (!body) continue;
    const [head, ...rest] = body.split(/\s+/);
    const verb = head.toLowerCase();
    const arg = rest.join(" ").trim();
    if (SHOW_WORDS.has(verb)) {
      add(arg.split(/[\s,;]+/)[0]);
      continue;
    }
    if (APPEAR_WORDS.has(verb)) {
      const who = arg.split(/\s+/)[0] || "";
      if (/^[a-z][\w-]*$/i.test(who)) add(who);
      continue;
    }
    if (HIDE_WORDS.has(verb)) {
      remove(arg.split(/[\s,;]+/)[0]);
      continue;
    }
    if (CLEAR_WORDS.has(verb)) {
      set.clear();
      order.length = 0;
      continue;
    }
    if (BAR_RE.test(body)) {
      parseCharacterIds(body.replace(BAR_RE, "")).forEach(add);
      continue;
    }
    const meet = body.match(MEET_RE);
    if (meet) add(meet[1]);
  }
  return order;
}

/** Parse + dispatch one `//...` command body (without leading slashes). */
export async function runCommand(rawBody) {
  const body = (rawBody || "").trim();
  if (!body) return;

  const [head, ...rest] = body.split(/\s+/);
  const verb = head.toLowerCase();
  const arg = rest.join(" ").trim();

  if (BG_WORDS.has(verb)) {
    await setBackground(normalizeBackgroundName(arg));
    return;
  }
  if (/^новый\s+фон/i.test(body)) {
    const bgArg = body.replace(/^новый\s+фон\s*[-–—]?\s*/iu, "").trim();
    if (bgArg) await setBackground(normalizeBackgroundName(bgArg));
    return;
  }
  if (LOC_WORDS.has(verb)) {
    const bgMatch = body.match(/(?:^|[,\s])фон\s*[-–—]?\s*([^,\n]+)/iu);
    if (bgMatch) await setBackground(normalizeBackgroundName(bgMatch[1]));
    return;
  }
  if (SHOW_WORDS.has(verb)) {
    await showCharacter(arg.toLowerCase());
    return;
  }
  if (HIDE_WORDS.has(verb)) {
    await hideCharacter(arg.toLowerCase());
    return;
  }
  if (CLEAR_WORDS.has(verb)) {
    clearStage();
    return;
  }
  if (FLAG_WORDS.has(verb)) {
    setFlag(arg, true);
    return;
  }
  if (APPEAR_WORDS.has(verb)) {
    const who = (arg.split(/\s+/)[0] || "").toLowerCase();
    if (who && /^[a-z][\w-]*$/i.test(who)) await showCharacter(who);
    return;
  }
  if (wantsMapReturn(body)) {
    if (onReturnToMap) void onReturnToMap();
    return;
  }
  if (/белая уходит|игрок возвращается на карту/i.test(body)) {
    if (onReturnToMap) void onReturnToMap();
    return;
  }
  if (/переход на следующую сцену/i.test(body)) {
    if (onContinueScene) void onContinueScene(body);
    return;
  }
  if (/открыва(?:ет|ется)\s+карту|opens?\s+(?:the\s+)?island\s+map/iu.test(body)) {
    if (onOpenIslandMap) void onOpenIslandMap();
    return;
  }
  if (/снова\s+показывает\s+вид\s+на\s+дом|shows?\s+(?:the\s+)?house\s+view\s+again/iu.test(body)) {
    await setBackground("houseorangewindow");
    return;
  }
  if (/добавляет?\s+1\s*%?\s+к\s+написанию\s+научн/iu.test(body)) {
    applyBookProgressResult(tryAddBookProgress("science"));
    return;
  }
  if (/добавляет?\s+1\s*%?\s+к\s+написанию\s+роман/iu.test(body)) {
    applyBookProgressResult(tryAddBookProgress("novel"));
    return;
  }
  if (/новый\s+день|new\s+day/iu.test(body)) {
    await requestEndCalendarDay({ inlineDuringPassage: true });
    if (onAfterNewDay) await onAfterNewDay();
    return;
  }
  if (/начинает\s+день\s*5|starts?\s+day\s*5/iu.test(body)) {
    if (onBeginDayFive) await onBeginDayFive();
    return;
  }
  const letterMatch = body.match(/^(?:письмо|letter)(?:\s+(.*\S))?\s*$/iu);
  if (letterMatch || /letter\.png/iu.test(body)) {
    await showLetterProp(letterMatch ? letterMatch[1] || "" : "");
    return;
  }
  if (/форма\s+email|email\s+form/iu.test(body)) {
    showDevEndEmailForm();
    return;
  }
  if (/появляется\s+графа|writing\s+progress\s+bar/iu.test(body)) {
    enableGameHud();
    return;
  }
  if (BAR_RE.test(body)) {
    const list = body.replace(BAR_RE, "");
    await showSeveral(parseCharacterIds(list));
    return;
  }
  const meet = body.match(MEET_RE);
  if (meet) {
    await showCharacter(meet[1].toLowerCase());
    return;
  }

  console.warn(`[commands] unknown directive: //${body}`);
}

function applyBookProgressResult(result) {
  if (result.ok) return;
  if (result.reason === "dailyBookCap") {
    showHudToast(t("hud.dailyBookCap"));
  } else if (result.reason === "noActions") {
    showHudToast(t("hud.noActions"));
  }
}
