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

const BG_WORDS    = new Set(["фон", "background", "bg"]);
const SHOW_WORDS  = new Set(["показать", "show", "вход", "enter"]);
const HIDE_WORDS  = new Set(["скрыть", "hide", "уход", "leave"]);
const CLEAR_WORDS = new Set(["сцена_очистить", "clear", "clearstage"]);
const FLAG_WORDS  = new Set(["флаг", "flag", "set"]);
const APPEAR_WORDS = new Set(["появляется", "появить", "appears", "appear"]);
const MAP_WORDS = new Set(["карта", "map", "карту"]);
const LOC_WORDS = new Set(["локация", "location", "место"]);

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
  if (/^(?:в\s+)?баре?\s+/iu.test(trimmed) || /^at\s+(?:the\s+)?bar\s+/iu.test(trimmed)) {
    return true;
  }
  if (/(?:встречаете|встретили|meet)\s+[\p{L}\p{N}_]+/iu.test(trimmed)) return true;
  if (/добавляет?\s+1\s*%?\s+к\s+написанию/iu.test(trimmed)) return true;
  if (/новый\s+день|new\s+day/iu.test(trimmed)) return true;
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
  "houseorangewindow": "houseorangewindow",
};

let onReturnToMap = null;
let onOpenIslandMap = null;

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
    await requestEndCalendarDay();
    return;
  }
  if (/появляется\s+графа|writing\s+progress\s+bar/iu.test(body)) {
    enableGameHud();
    return;
  }
  if (/^(?:в\s+)?баре?\s+/iu.test(body) || /^at\s+(?:the\s+)?bar\s+/iu.test(body)) {
    const list = body.replace(/^(?:в\s+)?баре?\s+|^at\s+(?:the\s+)?bar\s+/iu, "");
    await showSeveral(parseCharacterIds(list));
    return;
  }
  const meet = body.match(
    /(?:вы\s+)?(?:встречаете|встретили|meet)\s+([\p{L}\p{N}_]+)/iu
  );
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
