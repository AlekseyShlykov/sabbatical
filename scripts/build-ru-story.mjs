#!/usr/bin/env node
/** One-off: Twine export → assets/twine/ru.json (internal link format + typo fixes). */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const DAY_PASSAGE_RE = /^Day\s*(\d+)\b/i;

function passageDayNumber(name) {
  const m = String(name || "").match(DAY_PASSAGE_RE);
  return m ? Number(m[1]) : null;
}

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
  [/зарежатся/g, "задержатся"],
  [/лишишь вернуться/g, "успеешь вернуться"],
  [/mswhiite:/g, "mswhite:"],
  [/солдиная/g, "солидная"],
  [/закомы/g, "знакомы"],
  [/хороишие/g, "хорошие"],
  [/единсвтенная/g, "единственная"],
  [/потрсяающий/g, "потрясающий"],
  [/потому ей всего/g, "потому что ей всего"],
  [/человек который/g, "человек, который"],
  [/единственная кто/g, "единственная, кто"],
  [/одергивала когда/g, "одергивала, когда"],
  [/Спасибо Зеленой все/g, "Спасибо Зеленой, всё"],
  [/своими  убеждениями/g, "своими убеждениями"],
  [/сочтет/g, "сочтёт"],
  [/рассказал что/g, "рассказал, что"],
  [/всего неделя чтобы/g, "всего неделя, чтобы"],
  [/момента когда/g, "момента, когда"],
  [/Все еще /g, "Всё ещё "],
  [/все еще /g, "всё ещё "],
  [/все никак/g, "всё никак"],
  [/все равно/g, "всё равно"],
  [/еще не/g, "ещё не"],
  [/еще в баре/g, "ещё в баре"],
  [/еще один/g, "ещё один"],
  [/еще не разобрался/g, "ещё не разобрался"],
  [/еще не познакомились/g, "ещё не познакомились"],
  [/еще на Великой/g, "ещё на Великой"],
  [/еще не бывал/g, "ещё не бывал"],
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
  [/уврен/g, "уверен"],
  [/больое/g, "большое"],
  [/универститет/g, "университет"],
  [/актерское/g, "актёрское"],
  [/определенно/g, "определённо"],
  [/возвращение нк карту/g, "возвращение на карту"],
  [/заканчиваеся/g, "заканчивается"],
  [/низбежна/g, "неизбежна"],
  [/не наверняка/g, "не знаю наверняка"],
  [/персионеров/g, "пенсионеров"],
  [/сдужились/g, "сдружились"],
  [/пербивая/g, "перебивая"],
  [/Моглиу/g, "Могилу"],
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
validateDayPassages(passages);

writeFileSync(out, JSON.stringify({ passages }, null, 2) + "\n");
console.log(`Wrote ${passages.length} passages → ${out}`);

function validateDayPassages(list) {
  const locPath = join(__dir, "../data/locations.json");
  let locations = [];
  try {
    locations = JSON.parse(readFileSync(locPath, "utf8")).locations || [];
  } catch {
    console.warn("[build-ru] locations.json not read — skip Day N validation");
    return;
  }
  const names = new Set(list.map((p) => p.name));

  for (const p of list) {
    const day = passageDayNumber(p.name);
    if (day !== null && day < 2) {
      console.warn(`[build-ru] passage "${p.name}": Day N usually starts from N≥2`);
    }
  }

  for (const loc of locations) {
    const byDay = loc.twinePassageByDay;
    if (!byDay) continue;
    for (const [dayKey, passageName] of Object.entries(byDay)) {
      if (!names.has(passageName)) {
        console.warn(
          `[build-ru] ${loc.id}: twinePassageByDay[${dayKey}] → missing passage "${passageName}"`
        );
      }
      const passageDay = passageDayNumber(passageName);
      if (passageDay !== null && String(passageDay) !== String(dayKey)) {
        console.warn(
          `[build-ru] ${loc.id}: twinePassageByDay[${dayKey}] points to "${passageName}" (Day ${passageDay})`
        );
      }
    }
  }
}

function postProcessPassages(list) {
  for (const p of list) {
    const trimmed = p.name.trim();
    if (trimmed !== p.name) p.name = trimmed;
  }
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
  if (byName["Отдохнуть немного"] && !byName["Отдохнуть немного"].text.includes("//снова показывает")) {
    byName["Отдохнуть немного"].text = byName["Отдохнуть немного"].text.replace(
      /^\/\/[^\n]+\n/,
      "//снова показывает вид на дом с текстом\n"
    );
  }
  if (byName["Day2.1. Blue."]) {
    let t = byName["Day2.1. Blue."].text;
    if (!t.includes("//показать mrblue")) {
      t = t.replace(
        /^\/\/задний фон - дом\./i,
        "//фон houseblueout\n//показать mrblue"
      );
      byName["Day2.1. Blue."].text = t;
    }
  }
  if (byName["Да, с радостью"] && !byName["Да, с радостью"].text.includes("//фон houseblueinside")) {
    byName["Да, с радостью"].text = byName["Да, с радостью"].text.replace(
      /^\/\/фон меняется на синий дом внутри/i,
      "//фон houseblueinside"
    );
  }
  if (byName["Day 2.2. Green"]) {
    let t = byName["Day 2.2. Green"].text;
    if (!t.includes("//показать msgreen")) {
      t = t.replace(
        /^\/\/фон - дом Зеленой\./i,
        "//фон housegreeninside\n//показать msgreen"
      );
      byName["Day 2.2. Green"].text = t;
    }
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
  if (byName["Day 2.3. Red"] && !byName["Day 2.3. Red"].text.includes("//показать mrred")) {
    byName["Day 2.3. Red"].text = byName["Day 2.3. Red"].text.replace(
      /^\/\/фон - бар/i,
      "//фон bar\n//показать mrred"
    );
  }
  if (byName["Day 2.4 Forrest"] && !byName["Day 2.4 Forrest"].text.includes("//показать mrblack")) {
    byName["Day 2.4 Forrest"].text = byName["Day 2.4 Forrest"].text.replace(
      /^\/\/фон - лес/i,
      "//фон forrest\n//показать mrblack"
    );
  }
  if (byName["Day 2.5 Yellow"] && !byName["Day 2.5 Yellow"].text.includes("//показать msyellow")) {
    byName["Day 2.5 Yellow"].text = byName["Day 2.5 Yellow"].text.replace(
      /^\/\/фон - желтый дом/i,
      "//фон houseyellowout\n//показать msyellow"
    );
  }
  if (byName["Day 2.6 Purple"] && !byName["Day 2.6 Purple"].text.includes("//показать mrpurple")) {
    byName["Day 2.6 Purple"].text = byName["Day 2.6 Purple"].text.replace(
      /^\/\/фон - дом пурпурного/i,
      "//фон housepurpleout\n//показать mrpurple"
    );
  }
  if (byName["Day 3.1. Red"] && !byName["Day 3.1. Red"].text.includes("//показать mrred")) {
    byName["Day 3.1. Red"].text = byName["Day 3.1. Red"].text.replace(
      /^\/\/фон - дом оранжевого/i,
      "//фон orange house inside\n//показать mrred"
    );
  }
  if (byName["Day 3.2. White"] && !byName["Day 3.2. White"].text.includes("//показать mswhite")) {
    byName["Day 3.2. White"].text = byName["Day 3.2. White"].text.replace(
      /^\/\/фон - дом Оранжевый/i,
      "//фон orange house inside\n//показать mswhite"
    );
  }
  if (byName["Day 3.1. White"] && !byName["Day 3.1. White"].text.includes("//показать mswhite")) {
    byName["Day 3.1. White"].text = byName["Day 3.1. White"].text.replace(
      /^\/\/фон - дом Оранжевый/i,
      "//фон orange house inside\n//показать mswhite"
    );
  }
  if (byName["Day 3.3. Bar."] && !byName["Day 3.3. Bar."].text.includes("//показать mrred")) {
    byName["Day 3.3. Bar."].text = byName["Day 3.3. Bar."].text.replace(
      /^\/\/фон - бар/i,
      "//фон bar\n//показать mrred\n//показать msyellow"
    );
  }
  if (byName["Day 4.1. Forrest."] && !byName["Day 4.1. Forrest."].text.includes("//фон forrest")) {
    byName["Day 4.1. Forrest."].text = byName["Day 4.1. Forrest."].text.replace(
      /^\/\/фон - лес/i,
      "//фон forrest"
    );
  }
  if (byName["Day 4.2. Blue house"] && !byName["Day 4.2. Blue house"].text.includes("//фон houseblueout")) {
    byName["Day 4.2. Blue house"].text = byName["Day 4.2. Blue house"].text.replace(
      /^\/\/фон - дом Синего снаружи/i,
      "//фон houseblueout"
    );
  }
  if (byName["Day 4.3. Purple house"] && !byName["Day 4.3. Purple house"].text.includes("//фон housepurpleout")) {
    byName["Day 4.3. Purple house"].text = byName["Day 4.3. Purple house"].text.replace(
      /^\/\/фон - дом пурпурного снаружи/i,
      "//фон housepurpleout"
    );
  }
  if (byName["Day 4.4. Green House"] && !byName["Day 4.4. Green House"].text.includes("//фон housegreenout")) {
    byName["Day 4.4. Green House"].text = byName["Day 4.4. Green House"].text.replace(
      /^\/\/Фон - дом зеленой снаружи/i,
      "//фон housegreenout"
    );
  }
  if (byName["Day 4.5. Bar"] && !byName["Day 4.5. Bar"].text.includes("//в баре")) {
    byName["Day 4.5. Bar"].text = byName["Day 4.5. Bar"].text
      .replace(/^\/\/Если в свободном режиме[^\n]+\n/i, "")
      .replace(
        /^\/\/фон - Бар внутри[^\n]*/i,
        "//фон bar\n//в баре msgreen, mrpurple, msyellow, mrblack, mswhite, mrred, mrblue"
      );
  }
  if (byName["Зайти в дом"] && byName["Зайти в дом"].text.trim() === "") {
    byName["Зайти в дом"].text =
      "//фон housepurpleinside\n\nmrpurple: Расскажи, о чем твоя книга?\n";
  }
  if (byName["Зайти в дом"] && byName["Зайти в дом"].text.includes("mrpurple: Расскажи") && !byName["Зайти в дом"].text.includes("//фон housepurpleinside")) {
    byName["Зайти в дом"].text = byName["Зайти в дом"].text.replace(
      /^\/\/новый фон - дом пурпурного внутри/i,
      "//фон housepurpleinside"
    );
  }
  if (byName["Давай прогуляемся"] && !byName["Давай прогуляемся"].text.includes("//фон beach")) {
    byName["Давай прогуляемся"].text = byName["Давай прогуляемся"].text.replace(
      /^\/\/анимация перемещения[^\n]*\n\/\/новый фон - пляж/i,
      "//анимация перемещения на карте - от дома пурпурного до локации - пляж\n//фон beach"
    );
  }
  for (const name of ["Пожалуй, я прогуляюсь", "Пойду погуляю по острову", "Спасибо, я лучше пойду погуляю"]) {
    if (byName[name] && !byName[name].text.includes("//вернуться на карту")) {
      byName[name].text = byName[name].text.trimEnd() + "\n//вернуться на карту\n";
    }
  }
  if (byName["Подойти к Красному и Синему"]) {
    byName["Подойти к Красному и Синему"].text =
      "//фон bar\n//в баре msyellow, mrblack, mrblue, mrred\n\n" +
      byName["Подойти к Красному и Синему"].text.replace(/^\/\/[^\n]+\n+/i, "");
  }
  if (byName["Подойти к группе Зеленая, Пурпурный, Белая"]) {
    byName["Подойти к группе Зеленая, Пурпурный, Белая"].text =
      "//фон barout2\n//в баре msgreen, mrpurple, mswhite\n\n" +
      byName["Подойти к группе Зеленая, Пурпурный, Белая"].text.replace(/^\/\/[^\n]+\n+/i, "");
  }
  if (byName["Подойти к Желтой и Черному"]) {
    byName["Подойти к Желтой и Черному"].text =
      "//фон bar\n//в баре msyellow, mrblack, mrblue, mrred\n\n" +
      byName["Подойти к Желтой и Черному"].text.replace(/^\/\/[^\n]+\n+/i, "");
  }
  if (byName["Day 5.1 Begin"]) {
    let t = byName["Day 5.1 Begin"].text
      .replace(/^\/\/Это начало 5-го дня[^\n]*\n/i, "")
      .replace(/^\/\/Фон - дом оранжевого внутри/i, "//фон houseorangeinside");
    t = t.replace(
      /\/\/анимация[^\n]*\nУтром умер второй\.[^\n]+\n\n\/\/Дальше идет текст:\n/iu,
      "//письмо\n"
    );
    t = t.replace(/\/\/форма чтобы оставить email адрес\s*$/iu, "//форма email\n");
    byName["Day 5.1 Begin"].text = t;
  }
  return list.map((p) => byName[p.name] || p);
}
