#!/usr/bin/env node
/** One-off: Twine export → assets/twine/ru.json (internal link format + typo fixes). */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dir = dirname(fileURLToPath(import.meta.url));
const src = join(__dir, "twine-export-ru.json");
const out = join(__dir, "../assets/twine/ru.json");

const TYPO_FIXES = [
  [/Всмысле/g, "В смысле"],
  [/каждого кто/g, "каждого, кто"],
  [/Чего кричишь то\?/g, "Чего кричишь-то?"],
  [/ценим то что/g, "ценим то, что"],
  [/Кстати и тебе то/g, "Кстати, и тебе-то"],
  [/уединенный/g, "уединённый"],
  [/десятилейтий/g, "десятилетий"],
  [/преподвателя/g, "преподавателя"],
  [/билитриста/g, "беллетриста"],
  [/живешь/g, "живёшь"],
  [/Спокойстиве/g, "Спокойствие"],
  [/для первого знакомство/g, "для первого знакомства"],
  [/Все таки/g, "Всё-таки"],
  [/о слышала/g, "я слышала"],
  [/не большой фанат/g, "небольшой фанат"],
  [/Возожно/g, "Возможно"],
  [/^mswhite: о простите/m, "mswhite: О, простите"],
  [/купил еще еще/g, "купил ещё"],
  [/поаккуратнее/g, "поосторожнее"],
  [/элитно университете/g, "элитном университете"],
  [/Я это место идеально/g, "Это место идеально"],
  [/не удасться/g, "не удастся"],
  [/расспросами/g, "расспросами"],
  [/посмотри свой дома/g, "посмотри свой дом"],
  [/Никто не отвечает, кажется/g, "Никто не отвечает — кажется"],
  [/мы бы не хотели чтобы/g, "мы бы не хотели, чтобы"],
  [/я подумал что/g, "я подумал, что"],
  [/сказал, чего/g, "сказал, чего"],
  [/не удастся/g, "не удастся"],
  [/сказал чего/g, "сказал, чего"],
  [/обещайте что/g, "обещайте, что"],
  [/благодарна если/g, "благодарна, если"],
  [/Я - Майк/g, "Я — Майк"],
  [/Я - мистер/g, "Я — мистер"],
  [/интересуйтся/g, "интересуйся"],
  [/заговоривать/g, "заговорить"],
  [/приключенческий рома/g, "приключенческий роман"],
  [/Кажется пора/g, "Кажется, пора"],
  [/Погда/g, "Погода"],
  [/mrbule:/g, "mrblue:"],
  [/ндеюсь/g, "надеюсь"],
  [/пренадлежит/g, "принадлежит"],
  [/живем/g, "живём"],
  [/настояла что/g, "настояла, что"],
  [/подозреваю что/g, "подозреваю, что"],
  [/не стесняясь/g, "не стесняясь"],
];

function normalizeLink(l) {
  const orig = l.original || "";
  const alias = orig.match(/\[\[([^\]|]+)(?:\||->)([^\]]+)\]\]/);
  if (alias) {
    return { name: alias[1].trim(), link: alias[2].trim() };
  }
  let name = l.linkText || "";
  let target = l.passageName || "";
  if (target.includes("|")) {
    const [label, ...rest] = target.split("|");
    name = label.trim();
    target = rest.join("|").trim();
  }
  return { name, link: target };
}

function fixText(s) {
  let t = s;
  for (const [re, rep] of TYPO_FIXES) t = t.replace(re, rep);
  return t;
}

function stripLinksFromText(text) {
  return text.replace(/\[\[[^\]]+\]\]/g, "").trim();
}

const raw = JSON.parse(readFileSync(src, "utf8"));
const passages = raw.passages.map((p) => {
  const text = fixText(p.cleanText || stripLinksFromText(p.text || ""));
  const links = (p.links || []).map(normalizeLink);
  return { name: p.name, text: text ? text + "\n" : "", links };
});

// Unified return-to-map passage (engine knows this id).
const hasReturn = passages.some((p) => p.name === "story_return_map");
if (!hasReturn) {
  passages.push({
    name: "story_return_map",
    text: "//возвращается на карту\n",
    links: [],
  });
}

postProcessPassages(passages);

writeFileSync(out, JSON.stringify({ passages }, null, 2) + "\n");
console.log(`Wrote ${passages.length} passages → ${out}`);

function postProcessPassages(list) {
  const byName = Object.fromEntries(list.map((p) => [p.name, p]));
  if (byName.start && !byName.start.text.includes("//показать mrred")) {
    byName.start.text = byName.start.text.replace(
      "//локация причал, фон - barout2\n",
      "//локация причал, фон - barout2\n//показать mrred\n"
    );
  }
  if (byName["orange house inside"]) {
    let t = byName["orange house inside"].text;
    if (!t.includes("//показать mrred")) {
      if (/^\/\/фон/i.test(t)) {
        t = t.replace(/^\/\/[^\n]+\n/, (m) => m + "//показать mrred\n");
      } else {
        t = "//фон orange house inside\n//показать mrred\n" + t;
      }
      byName["orange house inside"].text = t;
    }
  }
  for (const name of ["Хорошо", "Звучит таинственно"]) {
    if (byName[name] && !byName[name].text.includes("//скрыть mrred")) {
      byName[name].text = byName[name].text.trimEnd() + "\n//скрыть mrred\n";
    }
  }
  for (const name of ["Это жутковато", "То что мне нужно, отдохну от телефона"]) {
    if (byName[name] && !byName[name].text.startsWith("//фон orange house inside")) {
      byName[name].text = "//фон orange house inside\n" + byName[name].text;
    }
  }
  if (byName["orange house"] && !byName["orange house"].text.startsWith("//фон orange house inside")) {
    byName["orange house"].text = "//фон orange house inside\n" + byName["orange house"].text;
  }
  if (byName["Отдохнуть немного"] && !byName["Отдохнуть немного"].text.includes("//новый день")) {
    byName["Отдохнуть немного"].text = byName["Отдохнуть немного"].text.replace(
      /\/\/снова показывает вид на дом[^\n]*/i,
      "//снова показывает вид на дом с текстом\n//новый день"
    );
  }
  if (byName["Day2. Blue."]) {
    let t = byName["Day2. Blue."].text;
    if (!t.includes("//показать mrblue")) {
      t = t.replace(
        /^\/\/задний фон - дом\./i,
        "//фон houseblueout\n//показать mrblue"
      );
      byName["Day2. Blue."].text = t;
    }
  }
  if (byName["Да, с радостью"] && !byName["Да, с радостью"].text.includes("//фон houseblueinside")) {
    byName["Да, с радостью"].text = byName["Да, с радостью"].text.replace(
      /^\/\/фон меняется на синий дом внутри/i,
      "//фон houseblueinside"
    );
  }
  if (byName["Day 2. Green"]) {
    let t = byName["Day 2. Green"].text;
    if (!t.includes("//показать msgreen")) {
      t = t.replace(
        /^\/\/фон - дом Зеленой\./i,
        "//фон housegreeninside\n//показать msgreen"
      );
      byName["Day 2. Green"].text = t;
    }
  }
  if (byName["Спасибо, но я хочу прогуляться"] && !byName["Спасибо, но я хочу прогуляться"].text.includes("//вернуться на карту")) {
    byName["Спасибо, но я хочу прогуляться"].text =
      byName["Спасибо, но я хочу прогуляться"].text.trimEnd() + "\n//вернуться на карту\n";
  }
  if (byName["Спасибо, я лучше пойду погуляю"] && !byName["Спасибо, я лучше пойду погуляю"].text) {
    byName["Спасибо, я лучше пойду погуляю"].text = "//вернуться на карту\n";
  }
  return list.map((p) => byName[p.name] || p);
}
