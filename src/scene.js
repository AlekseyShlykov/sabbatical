// scene.js
// Stage = background + character slots. Driven by commands.js.
// All DOM here, no game logic, no Twine logic.
// Naming convention (per agents.md): id = filename.

const BG_DIR = "assets/backgrounds/";
const CHAR_DIR = "assets/characters/";
const EXTS = [".webp", ".jpg", ".png"];

/** Фоны, где один персонаж (mrred) стоит слева ~на трети экрана. */
const LEFT_THIRD_LAYOUT_BGS = new Set([
  "houseorangeout",
  "houseorangeinside",
  "houseorangewindow",
]);

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
const decodedCache = new Set();     // url already decoded in memory

export function initScene() {
  els.bg = document.getElementById("stage-bg");
  els.slots = document.getElementById("stage-slots");
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
    applyStageLayout(name);
    return;
  }
  await decodeRasterUrl(url);
  currentBg = name;
  els.bg.style.background = "";
  els.bg.classList.remove("is-fading");
  els.bg.src = url;
  applyStageLayout(name);
}

function applyStageLayout(bgName) {
  if (!els.slots) return;
  if (LEFT_THIRD_LAYOUT_BGS.has(bgName)) {
    els.slots.dataset.layout = "left-third";
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

  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const url = urls[i];
    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.character = id;

    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    if (url) {
      await decodeRasterUrl(url);
      if (gen !== renderGeneration) return;
      img.src = url;
    } else {
      console.warn(`[scene] character image missing: ${id}`);
      slot.hidden = true;
    }
    slot.appendChild(img);
    els.slots.appendChild(slot);
  }
  if (gen !== renderGeneration) return;
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

async function firstExistingImage(dir, name) {
  const key = `${dir}|${name}`;
  if (rasterUrlCache.has(key)) return rasterUrlCache.get(key);

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
  if (!url || decodedCache.has(url)) return;
  const im = new Image();
  im.decoding = "async";
  await new Promise((resolve) => {
    im.onload = () => resolve();
    im.onerror = () => resolve();
    im.src = url;
  });
  try {
    await im.decode();
  } catch {
    /* decode optional */
  }
  decodedCache.add(url);
}

/** Preload several assets (`dir` + `name` pairs) in parallel. */
export async function preloadRasters(specs) {
  const urls = await Promise.all(
    specs.map(([dir, name]) => resolveRasterUrl(dir, name))
  );
  await Promise.all(urls.filter(Boolean).map((url) => decodeRasterUrl(url)));
}
