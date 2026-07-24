// scene.js
// Stage = background + character slots. Driven by commands.js.
// All DOM here, no game logic, no Twine logic.
// Naming convention (per agents.md): id = filename.

const BG_DIR = "assets/backgrounds/";
const CHAR_DIR = "assets/characters/";
const EXTS = [".webp", ".jpg", ".png"];
const MANIFEST_URL = "data/assets.json";

/** Фоны, где один персонаж (mrred) стоит слева ~на трети экрана. */
const LEFT_THIRD_LAYOUT_BGS = new Set([
  "houseorangeout",
  "houseorangeinside",
  "houseorangewindow",
]);

/** Вечеринка дня 4: раскладка «бар — слева Синий+Красный, справа Чёрный+Жёлтый». */
const PARTY_BAR_SPLIT_IDS = new Set(["mrblue", "mrred", "mrblack", "msyellow"]);

const els = {
  bg: null,
  slots: null,
};

const present = new Set();          // character ids present on stage
let currentSpeaker = null;          // null = narrator / no highlight
let currentBg = null;
let renderGeneration = 0;           // drop stale concurrent renderSlots()

const rasterUrlCache = new Map();   // `${dir}|${name}` → url | null
const existsCache = new Map();      // url → boolean
// Keep the Image objects alive after preload. A Set of URLs is not enough:
// browsers may discard the decoded bitmap once the temporary Image is
// collected, forcing the first visible scene to decode it again.
const decodedImageCache = new Map(); // url → decoded Image
const decodePromiseCache = new Map(); // url → in-flight Promise
let assetManifest = null;           // { "assets/backgrounds/bar": [".webp", ".jpg"] }

export function initScene() {
  els.bg = document.getElementById("stage-bg");
  els.slots = document.getElementById("stage-slots");
}

/**
 * Загрузить манифест ассетов (создаётся `scripts/optimize-assets.mjs`).
 * Если файла нет — спокойно работаем по старой схеме (HEAD-probe).
 */
export async function loadAssetManifest() {
  if (assetManifest) return assetManifest;
  try {
    const res = await fetch(MANIFEST_URL, { cache: "force-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    assetManifest = data?.files || {};
  } catch (err) {
    console.warn("[scene] asset manifest unavailable, falling back to probes", err);
    assetManifest = {};
  }
  return assetManifest;
}

/* ---------------- background ---------------- */

export async function setBackground(name) {
  if (!name) return;
  if (name === currentBg && els.bg?.src) return;
  const url = await resolveRasterUrl(BG_DIR, name);
  if (!url) {
    console.warn(`[scene] background missing: ${name}`);
    currentBg = name;
    els.bg.removeAttribute("src");
    els.bg.classList.remove("is-fading");
    els.bg.style.background = "linear-gradient(160deg, #c9b78d, #6e8b76)";
    applyStageLayout(name, [...present]);
    return;
  }
  await decodeRasterUrl(url);
  currentBg = name;
  els.bg.style.background = "";
  els.bg.classList.remove("is-fading");
  els.bg.src = url;
  applyStageLayout(name, [...present]);
}

function resolveStageLayout(bgName, ids) {
  if (LEFT_THIRD_LAYOUT_BGS.has(bgName)) return "left-third";
  const count = ids.length;
  const set = new Set(ids);
  if (bgName === "bar" && count === 7) return "party-hub";
  if (bgName === "barout2" && count === 3) return "party-pier";
  if (
    bgName === "bar" &&
    count === 4 &&
    PARTY_BAR_SPLIT_IDS.size === 4 &&
    [...PARTY_BAR_SPLIT_IDS].every((id) => set.has(id))
  ) {
    return "party-bar-split";
  }
  return null;
}

function applyStageLayout(bgName, ids = [...present]) {
  if (!els.slots) return;
  const layout = resolveStageLayout(bgName, ids);
  if (layout) {
    els.slots.dataset.layout = layout;
  } else {
    delete els.slots.dataset.layout;
  }
}

/* ---------------- characters ---------------- */

/** Add one or more characters, then render once (no duplicate slots). */
export async function showCharacters(ids) {
  let changed = false;
  for (const raw of ids) {
    if (!raw) continue;
    const id = String(raw).toLowerCase();
    if (!id || present.has(id)) continue;
    present.add(id);
    changed = true;
  }
  if (changed) await renderSlots();
}

export async function showCharacter(id) {
  if (!id) return;
  await showCharacters([id]);
}

/**
 * Задать состав сцены РОВНО из этих id (заменяя текущий, а не добавляя).
 * Нужно при входе в новый пассаж: иначе персонажи предыдущей сцены (например
 * все 7 из хаба вечеринки) остаются, хотя ветка объявляет лишь свою подгруппу.
 */
export async function setStageCharacters(ids) {
  const next = [];
  const seen = new Set();
  for (const raw of ids || []) {
    const id = String(raw || "").toLowerCase();
    if (!id || id === "narrator" || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  const unchanged =
    next.length === present.size && next.every((id) => present.has(id));
  if (unchanged) return;
  present.clear();
  next.forEach((id) => present.add(id));
  if (currentSpeaker && !present.has(currentSpeaker)) currentSpeaker = null;
  await renderSlots();
}

export async function hideCharacter(id) {
  if (!id) return;
  id = id.toLowerCase();
  if (!present.delete(id)) return;
  if (currentSpeaker === id) currentSpeaker = null;
  await renderSlots();
}

export function clearStage() {
  present.clear();
  currentSpeaker = null;
  renderSlots();
}

export async function setSpeaker(id) {
  // Per agents.md: a speaker auto-enters the stage on first line if not present.
  if (id && id !== "narrator" && !present.has(id)) {
    present.add(id);
    await renderSlots();
  }
  currentSpeaker = id === "narrator" ? null : id;
  applySpeakerStates();
}

/* ---------------- internal ---------------- */

async function renderSlots() {
  const gen = ++renderGeneration;
  const ids = [...present];
  els.slots.dataset.count = String(Math.max(ids.length, 1));
  els.slots.innerHTML = "";

  const urls = await Promise.all(
    ids.map((id) => resolveRasterUrl(CHAR_DIR, id))
  );
  if (gen !== renderGeneration) return;

  await Promise.all(urls.map((url) => (url ? decodeRasterUrl(url) : null)));
  if (gen !== renderGeneration) return;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const url = urls[i];
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.character = id;

    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    img.decoding = "sync";
    if (url) {
      img.src = url;
    } else {
      console.warn(`[scene] character image missing: ${id}`);
      slot.hidden = true;
    }
    slot.appendChild(img);
    frag.appendChild(slot);
  }
  els.slots.appendChild(frag);
  applyStageLayout(currentBg, ids);
  applySpeakerStates();
}

function applySpeakerStates() {
  const slots = els.slots.querySelectorAll(".slot");
  slots.forEach((s) => {
    s.classList.remove("is-speaking", "is-dimmed");
    const id = s.dataset.character;
    if (currentSpeaker == null) {
      s.classList.add("is-dimmed");          // narrator: nobody is highlighted
      // (style.md: don't enlarge anyone; dim all)
    } else if (id === currentSpeaker) {
      s.classList.add("is-speaking");
    } else {
      s.classList.add("is-dimmed");
    }
  });
  if (currentSpeaker == null) {
    // restore neutral if no one present
    slots.forEach((s) => s.classList.remove("is-dimmed"));
  }
}

/* ---------------- asset loading ---------------- */

async function assetExists(url) {
  if (existsCache.has(url)) return existsCache.get(url);
  let ok = false;
  try {
    const res = await fetch(url, { method: "HEAD", cache: "force-cache" });
    ok = res.ok;
  } catch {
    ok = false;
  }
  if (!ok) ok = await probeImage(url);
  existsCache.set(url, ok);
  return ok;
}

function probeImage(url) {
  return new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(true);
    im.onerror = () => resolve(false);
    im.src = url;
  });
}

function urlFromManifest(dir, name) {
  if (!assetManifest) return null;
  const key = (dir + name).replace(/^\/+/, "");
  const exts = assetManifest[key];
  if (!Array.isArray(exts) || exts.length === 0) return null;
  return dir + name + exts[0];
}

async function firstExistingImage(dir, name) {
  const key = `${dir}|${name}`;
  if (rasterUrlCache.has(key)) return rasterUrlCache.get(key);

  const manifestUrl = urlFromManifest(dir, name);
  if (manifestUrl) {
    rasterUrlCache.set(key, manifestUrl);
    return manifestUrl;
  }

  let found = null;
  for (const ext of EXTS) {
    const url = dir + name + ext;
    // eslint-disable-next-line no-await-in-loop
    if (await assetExists(url)) {
      found = url;
      break;
    }
  }
  rasterUrlCache.set(key, found);
  return found;
}

/** WebP-first asset URL (`dir` ends with `/`). */
export async function resolveRasterUrl(dir, name) {
  return firstExistingImage(dir, name);
}

/** Decode raster into browser cache before showing on stage. */
export async function decodeRasterUrl(url) {
  if (!url || decodedImageCache.has(url)) return;
  if (decodePromiseCache.has(url)) return decodePromiseCache.get(url);

  const im = new Image();
  im.decoding = "async";
  const pending = (async () => {
    const loaded = await new Promise((resolve) => {
      im.onload = () => resolve(true);
      im.onerror = () => resolve(false);
      im.src = url;
    });
    if (!loaded) return;
    try {
      await im.decode();
    } catch {
      /* The load event still confirms that the raster is usable. */
    }
    decodedImageCache.set(url, im);
  })().finally(() => {
    decodePromiseCache.delete(url);
  });
  decodePromiseCache.set(url, pending);
  return pending;
}

/** Preload several assets (`dir` + `name` pairs) in parallel. */
export async function preloadRasters(specs) {
  const urls = await Promise.all(
    specs.map(([dir, name]) => resolveRasterUrl(dir, name))
  );
  await Promise.all(urls.filter(Boolean).map((url) => decodeRasterUrl(url)));
}
