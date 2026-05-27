// locationAssets.js — id локации → имя файла в assets/backgrounds/ (без расширения).

/** Цветные дома: id → файл снаружи в assets/backgrounds/ */
const COLOR_HOUSE_EXTERIOR = {
  redhouse: "houseredout",
  greenhouse: "housegreenout",
  bluehouse: "houseblueout",
  orangehouse: "houseorangeout",
  yellowhouse: "houseyellowout",
  purplehouse: "housepurpleout",
};

/** Локации без шаблона *house → house*out */
const SPECIAL = {
  bar: { exterior: "bar3", interior: null },
  beach: { exterior: "beach", interior: null },
  lighthouse: { exterior: "lighthouse", interior: null },
  forest: { exterior: "forrest", interior: null },
  thicket: { exterior: "deepforrest", interior: null },
};

/** `bluehouse` → `houseblueout`, `beach` → `beach` */
export function locationExterior(id) {
  if (COLOR_HOUSE_EXTERIOR[id]) return COLOR_HOUSE_EXTERIOR[id];
  if (SPECIAL[id]) return SPECIAL[id].exterior;
  if (id.endsWith("house")) {
    const color = id.slice(0, -5);
    return `house${color}out`;
  }
  return id;
}

/** Вход только снаружи (файла inside нет или не используем). */
const EXTERIOR_ONLY = new Set([
  "redhouse",
  "greenhouse",
  "bluehouse",
  "orangehouse",
  "yellowhouse",
  "purplehouse",
  "blackhouse",
  "whitehouse",
  "forest",
  "thicket",
  "beach",
  "bar",
  "lighthouse",
]);

export function locationInterior(id) {
  if (SPECIAL[id]) return SPECIAL[id].interior;
  if (EXTERIOR_ONLY.has(id)) return null;
  if (id.endsWith("house")) return `house${id.slice(0, -5)}inside`;
  return null;
}

/** Фон при входе в локацию: внутри, если есть, иначе снаружи. */
export function backgroundForLocation(loc) {
  const exterior = loc.exteriorImage ?? locationExterior(loc.id);
  const interior =
    loc.interiorImage !== undefined ? loc.interiorImage : locationInterior(loc.id);
  return interior || exterior;
}
