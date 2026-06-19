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

function preloadAudio(url) {
  return new Promise((resolve) => {
    const audio = new Audio();
    const done = () => resolve();
    audio.addEventListener("canplaythrough", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    audio.preload = "auto";
    audio.src = url;
    audio.load();
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
  const queue = [
    ...rasterUrls.map((url) => ({ kind: "raster", url })),
    ...EXTRA_URLS.map((url) => ({ kind: "binary", url })),
    ...SOUND_URLS.map((url) => ({ kind: "audio", url })),
    { kind: "audio", url: MUSIC_URL },
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
    else if (item.kind === "audio") await preloadAudio(item.url);
    else await preloadBinary(item.url);
    done += 1;
    tick();
  });

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
};

export function initSplashLoader() {
  ui.root = document.getElementById("splash-loader");
  ui.fill = document.getElementById("splash-loader-fill");
  ui.pct = document.getElementById("splash-loader-pct");
  ui.label = document.getElementById("splash-loader-label");
  ui.actions = document.getElementById("splash-actions");
  ui.track = document.getElementById("splash-loader-track");

  if (ui.root) ui.root.hidden = false;
  if (ui.actions) ui.actions.hidden = true;
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
  if (ui.root) {
    ui.root.classList.add("is-done");
    window.setTimeout(() => {
      ui.root.hidden = true;
    }, 280);
  }
  if (ui.actions) ui.actions.hidden = false;
}
