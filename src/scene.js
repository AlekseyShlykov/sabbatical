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

export function initScene() {
  els.bg = document.getElementById("stage-bg");
  els.slots = document.getElementById("stage-slots");
}

/* ---------------- background ---------------- */

export async function setBackground(name) {
  if (!name) return;
  if (name === currentBg) return;
  currentBg = name;
  const url = await firstExistingImage(BG_DIR, name);
  if (!url) {
    console.warn(`[scene] background missing: ${name}`);
    els.bg.removeAttribute("src");
    els.bg.style.background = "linear-gradient(160deg, #c9b78d, #6e8b76)";
    applyStageLayout(name);
    return;
  }
  els.bg.style.background = "";
  els.bg.classList.add("is-fading");
  await sleep(120);
  els.bg.onload = () => els.bg.classList.remove("is-fading");
  els.bg.onerror = () => els.bg.classList.remove("is-fading");
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

  for (const id of ids) {
    if (gen !== renderGeneration) return;

    const slot = document.createElement("div");
    slot.className = "slot";
    slot.dataset.character = id;

    const img = document.createElement("img");
    img.alt = "";
    img.draggable = false;
    const url = await firstExistingImage(CHAR_DIR, id);
    if (gen !== renderGeneration) return;

    if (url) img.src = url;
    else {
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

/* ---------------- helpers ---------------- */

const imgExistsCache = new Map();
async function imageExists(url) {
  if (imgExistsCache.has(url)) return imgExistsCache.get(url);
  const p = new Promise((resolve) => {
    const im = new Image();
    im.onload = () => resolve(true);
    im.onerror = () => resolve(false);
    im.src = url;
  });
  imgExistsCache.set(url, p);
  return p;
}

async function firstExistingImage(dir, name) {
  for (const ext of EXTS) {
    const url = dir + name + ext;
    // eslint-disable-next-line no-await-in-loop
    if (await imageExists(url)) return url;
  }
  return null;
}

/** WebP-first asset URL (`dir` ends with `/`). */
export async function resolveRasterUrl(dir, name) {
  return firstExistingImage(dir, name);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
