// assetPreload.js — полная предзагрузка ассетов на заставке + шкала прогресса.

import { loadAssetManifest, decodeRasterUrl } from "./scene.js";
import { t, tFmt } from "./localization.js";

const MUSIC_URL = "assets/music/music1.mp3";
const SOUND_URLS = [
  "assets/sounds/sea.mp3",
  "assets/sounds/forrest.mp3",
  "assets/sounds/forrest2.mp3",
  "assets/sounds/forrest3.mp3",
];
const EXTRA_URLS = ["assets/map/path2.svg", "assets/map/path4.svg"];

const CONCURRENCY = 8;

let preloadPromise = null;

function manifestRasterUrls(manifest) {
  const files = manifest?.files || manifest || {};
  return Object.entries(files).map(([base, exts]) => {
    const ext = Array.isArray(exts) && exts.length ? exts[0] : "";
    return base + ext;
  });
}

async function preloadBinary(url) {
  try {
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return;
    await res.arrayBuffer();
  } catch {
    /* optional asset */
  }
}

// `canplaythrough` ненадёжен (иногда не срабатывает вовсе), поэтому ставим
// страховочный таймаут — фоновая догрузка аудио не должна висеть бесконечно.
const AUDIO_PRELOAD_TIMEOUT_MS = 15000;

function preloadAudio(url) {
  return new Promise((resolve) => {
    let settled = false;
    const audio = new Audio();
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, AUDIO_PRELOAD_TIMEOUT_MS);
    audio.addEventListener("canplaythrough", finish, { once: true });
    audio.addEventListener("error", finish, { once: true });
    audio.preload = "auto";
    audio.src = url;
    audio.load();
  });
}

let audioPreloadStarted = false;

/**
 * Догрузить музыку и звуки в фоне. Аудио НЕ блокирует готовность сцен:
 * картинки нужны для отрисовки, а ~14 МБ звука браузер стримит по требованию.
 */
function startBackgroundAudioPreload() {
  if (audioPreloadStarted) return;
  audioPreloadStarted = true;
  const urls = [...SOUND_URLS, MUSIC_URL];
  runPool(urls, (url) => preloadAudio(url)).catch(() => {
    /* фоновая догрузка — ошибки не критичны */
  });
}

async function runPool(urls, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, urls.length) }, async () => {
    while (index < urls.length) {
      const i = index++;
      // eslint-disable-next-line no-await-in-loop
      await worker(urls[i], i);
    }
  });
  await Promise.all(runners);
}

/**
 * Загрузить и декодировать все игровые ассеты (картинки, звуки, SVG-пути).
 * @param {{ onProgress?: (p: { done: number, total: number, pct: number }) => void }} opts
 */
export async function preloadAllGameAssets({ onProgress } = {}) {
  const manifest = await loadAssetManifest();
  const rasterUrls = manifestRasterUrls(manifest);
  // Критичные ассеты (картинки + SVG-пути) — только они гейтят готовность сцен.
  // Аудио (~14 МБ) сюда НЕ входит: оно догружается в фоне (см. ниже), иначе
  // ожидание `canplaythrough` растягивает загрузку заставки на 10-17 c и тормозит
  // вход в первые сцены, хотя для их отрисовки звук не нужен.
  const queue = [
    ...rasterUrls.map((url) => ({ kind: "raster", url })),
    ...EXTRA_URLS.map((url) => ({ kind: "binary", url })),
  ];

  const total = queue.length;
  let done = 0;
  const tick = () => {
    const pct = total ? Math.min(100, Math.round((done / total) * 100)) : 100;
    onProgress?.({ done, total, pct });
  };
  tick();

  await runPool(queue, async (item) => {
    if (item.kind === "raster") await decodeRasterUrl(item.url);
    else await preloadBinary(item.url);
    done += 1;
    tick();
  });

  // Звук догружаем отдельно и не ждём — не блокирует ни заставку, ни сцены.
  startBackgroundAudioPreload();

  return { total, done };
}

/** Один раз на сессию: вернуть промис полной загрузки. */
export function ensureAllAssetsPreloaded({ onProgress } = {}) {
  if (!preloadPromise) {
    preloadPromise = preloadAllGameAssets({ onProgress }).catch((err) => {
      preloadPromise = null;
      throw err;
    });
  }
  return preloadPromise;
}

/* ---------- splash loader UI ---------- */

const ui = {
  root: null,
  fill: null,
  pct: null,
  label: null,
  actions: null,
  track: null,
  startBtn: null,
  continueBtn: null,
};

let assetsReady = false;

export function areAssetsReady() {
  return assetsReady;
}

function setSplashButtonsEnabled(enabled) {
  if (ui.startBtn) ui.startBtn.disabled = !enabled;
  if (ui.continueBtn && !ui.continueBtn.hidden) {
    ui.continueBtn.disabled = !enabled;
  }
}

/** Обновить disabled у «Продолжить» после смены видимости (например, hasSave). */
export function syncSplashContinueButton() {
  if (ui.continueBtn && !ui.continueBtn.hidden) {
    ui.continueBtn.disabled = !assetsReady;
  }
}

/** Показать кнопки заставки и включить их (после загрузки или при возврате на splash). */
export function showSplashActionsReady() {
  assetsReady = true;
  if (ui.root) {
    ui.root.classList.add("is-done");
    ui.root.hidden = true;
  }
  if (ui.actions) ui.actions.hidden = false;
  setSplashButtonsEnabled(true);
}

export function initSplashLoader() {
  ui.root = document.getElementById("splash-loader");
  ui.fill = document.getElementById("splash-loader-fill");
  ui.pct = document.getElementById("splash-loader-pct");
  ui.label = document.getElementById("splash-loader-label");
  ui.actions = document.getElementById("splash-actions");
  ui.track = document.getElementById("splash-loader-track");
  ui.startBtn = document.querySelector('[data-action="start"]');
  ui.continueBtn = document.querySelector('[data-action="continue"]');

  assetsReady = false;
  if (ui.root) {
    ui.root.hidden = false;
    ui.root.classList.remove("is-done");
  }
  if (ui.actions) ui.actions.hidden = false;
  setSplashButtonsEnabled(false);
  setSplashLoadProgress({ pct: 0 });
}

export function setSplashLoadProgress({ pct = 0 }) {
  const n = Math.max(0, Math.min(100, Math.round(pct)));
  if (ui.fill) ui.fill.style.width = `${n}%`;
  if (ui.pct) ui.pct.textContent = tFmt("splash.loadingPct", { n });
  if (ui.track) {
    ui.track.setAttribute("aria-valuenow", String(n));
    ui.track.setAttribute("aria-valuetext", tFmt("splash.loadingPct", { n }));
  }
  if (ui.label) ui.label.textContent = t("splash.loading");
}

export function finishSplashLoader() {
  setSplashLoadProgress({ pct: 100 });
  if (ui.root) ui.root.classList.add("is-done");
  window.setTimeout(showSplashActionsReady, 280);
}
