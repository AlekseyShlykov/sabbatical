// map.js
// World map: marks, player avatar, mark <-> location wiring.
// Coordinates live in data/locations.json (1:1 with map.png viewBox).
// Map + path2.svg share a .map__viewport box fitted to the screen (see fitViewport).

import { getState, setState, markVisited, unlock, getFlag } from "./state.js";
import {
  isStoryMode,
  isStoryMarkVisible,
  canTravelToStoryLocation,
  onStoryLocationVisited,
} from "./storyMode.js";
import { localizedTitle, t } from "./localization.js";
import { isDayTransitionActive } from "./dayCycle.js";
import { resolveRasterUrl } from "./scene.js";
import { PATH_SVG_URL, PATH4_MARKS_URL } from "./pathsConfig.js";
import {
  computeLocationAnchors,
  parsePath4MarkAnchors,
  prepareSvgForMeasure,
  scorePathForAnchors,
  buildPathNetwork,
  dist2d,
  nearestPointOnSvgPaths,
} from "./pathGeometry.js";
const MAP_ASSET_DIR = "assets/map/";

const els = {
  root: null,
  viewport: null,
  bg: null,
  marks: null,
  pathEnds: null,
  pathsRoot: null,
  pathsOverlay: null,
  pathsTrail: null,
  player: null,
  playerImg: null,
  hint: null,
};

let locationsData = null;
let onSelectCb = null;
let resizeQueued = false;
let pathOverlayLoaded = false;
let pathOverlayUrl = null;
const markEls = new Map();
/** Geometric path endpoints (viewBox px) — used for player placement on map. */
const endpointCoords = new Map();

function markAliasId(locId) {
  return locationById(locId)?.mapMarkAt || locId;
}

export function getDisplayCoord(locId) {
  const state = getState();
  if (
    state.currentLocation === locId &&
    state.mapPlayerCoord &&
    Number.isFinite(state.mapPlayerCoord.x)
  ) {
    return state.mapPlayerCoord;
  }
  const anchorId = markAliasId(locId);
  if (endpointCoords.has(anchorId)) return endpointCoords.get(anchorId);
  if (endpointCoords.has(locId)) return endpointCoords.get(locId);
  const loc = locationById(locId);
  const ref = locationById(anchorId);
  return ref?.markAnchor ?? ref?.mapPosition ?? loc?.markAnchor ?? loc?.mapPosition ?? null;
}

/** Path anchors in viewBox px (for movement.js). */
export function getPathAnchor(locId) {
  return getDisplayCoord(locId);
}

/** Mark anchor by id (path4.svg), else mapPosition — for path2 edge geometry. */
export function getLocationPosById() {
  return new Map(
    locationsData.locations.map((l) => [
      l.id,
      endpointCoords.get(l.id) ?? l.markAnchor ?? l.mapPosition,
    ])
  );
}

export function initMap(locations) {
  locationsData = locations;
  els.root      = document.getElementById("map");
  els.viewport  = document.getElementById("map-viewport");
  els.bg        = els.viewport?.querySelector(".map__bg");
  els.marks         = document.getElementById("map-marks");
  els.pathEnds      = document.getElementById("map-path-ends");
  els.pathsRoot     = document.getElementById("map-paths");
  els.pathsOverlay  = document.getElementById("map-paths-overlay");
  els.pathsTrail    = document.getElementById("map-paths-trail");
  els.player        = document.getElementById("map-player");
  els.playerImg     = els.player.querySelector(".map__player");
  if (els.playerImg) {
    void resolveRasterUrl(MAP_ASSET_DIR, "player").then((url) => {
      if (url) els.playerImg.src = url;
    });
  }
  if (els.bg) {
    void resolveRasterUrl(MAP_ASSET_DIR, "map").then((url) => {
      if (url) els.bg.src = url;
    });
  }
  els.hint          = document.getElementById("map-hint");

  window.addEventListener("resize", queueLayout);
  els.bg.addEventListener("load", queueLayout);
  if (els.bg.complete) queueLayout();
}

export function onSelectLocation(fn) { onSelectCb = fn; }

/** Wait until #map-viewport has real size (map screen visible). */
export async function ensureMapViewportReady() {
  if (!els.viewport || !els.root) return;

  for (let i = 0; i < 32; i++) {
    const mapScreen = document.querySelector('.screen--map');
    if (mapScreen && !mapScreen.hidden) fitViewport();
    if (els.viewport.clientWidth > 8 && els.viewport.clientHeight > 8) break;
    await new Promise((r) => requestAnimationFrame(r));
  }

  const bg = els.bg;
  if (bg?.src && !bg.complete) {
    await new Promise((resolve) => {
      bg.addEventListener("load", resolve, { once: true });
      bg.addEventListener("error", resolve, { once: true });
    });
  }
  layoutLayers();
}

/** Re-render marks + restore player position based on state. */
export async function renderMap() {
  layoutLayers();
  await renderPathOverlay();
  if (els.pathsTrail) els.pathsTrail.innerHTML = "";
  els.marks.innerHTML = "";
  if (els.pathEnds) els.pathEnds.innerHTML = "";
  markEls.clear();

  const state = getState();

  // Pins on geometric path ends (mark.png); fallback to mapPosition if no paths yet.
  if (locationsData.paths?.length) {
    await renderPathEndpointMarks(state);
  } else {
    for (const loc of locationsData.locations) {
      if (!isMarkVisible(loc, state)) continue;
      appendLocationMark(loc, state);
    }
  }

  const here = currentOrStart(state);
  if (here) {
    const pos = getDisplayCoord(here.id) || here.mapPosition;
    placeMapAnchor(els.player, pos);
    els.player.style.opacity = 1;
  } else {
    els.player.style.opacity = 0;
  }

  if (locationsData.debugShowPaths) verifyPathAlignment();

  showHint(t("map.hint"));
  await ensureMapViewportReady();
}

export function getMapMetrics() {
  const W = locationsData?.mapSize.width ?? 1402;
  const H = locationsData?.mapSize.height ?? 1122;
  const renderedW = els.viewport?.clientWidth || W;
  const renderedH = els.viewport?.clientHeight || H;
  const scaleX = renderedW / W;
  const scaleY = renderedH / H;
  return {
    W,
    H,
    scale: scaleX,
    scaleX,
    scaleY,
    renderedW,
    renderedH,
    offsetX: 0,
    offsetY: 0,
  };
}

function getOverlaySvg() {
  return els.pathsOverlay?.querySelector("svg") ?? null;
}

/** viewBox (path2.svg) → px inside #map-viewport (same box as red overlay). */
export function viewBoxToLayerPx(coord) {
  const svg = getOverlaySvg();
  if (!svg || !els.viewport || !coord) return null;

  const pt = svg.createSVGPoint();
  pt.x = coord.x;
  pt.y = coord.y;
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;

  const screen = pt.matrixTransform(ctm);
  const vp = els.viewport.getBoundingClientRect();
  return { x: screen.x - vp.left, y: screen.y - vp.top };
}

export function layerPxToViewBox(px) {
  const svg = getOverlaySvg();
  if (!svg || !els.viewport || !px) return null;

  const ctm = svg.getScreenCTM();
  if (!ctm) return null;

  const vp = els.viewport.getBoundingClientRect();
  const pt = svg.createSVGPoint();
  pt.x = px.x + vp.left;
  pt.y = px.y + vp.top;
  const local = pt.matrixTransform(ctm.inverse());
  return { x: local.x, y: local.y };
}

export function placePlayerAt(coord) {
  placeMapAnchor(els.player, coord);
}

/** Pin / player feet on a path2.svg point (uses SVG matrix, not manual scale). */
export function placeMapAnchor(el, coord) {
  if (!el || !coord) return;
  const px = viewBoxToLayerPx(coord);
  if (!px) return;
  el.style.left = `${px.x}px`;
  el.style.top = `${px.y}px`;
}

/** Center of dot-trail on the path line. */
export function placeTrailAt(el, coord) {
  if (!el || !coord) return;
  const px = viewBoxToLayerPx(coord);
  if (!px) return;
  el.style.left = `${px.x}px`;
  el.style.top = `${px.y}px`;
}

/**
 * Debug: compare DOM placement with path2.svg geometry and path4 marks.
 * Returns metrics; logs warnings when debugShowPaths is on.
 */
export function verifyPathAlignment() {
  const svg = getOverlaySvg();
  if (!svg || !locationsData) return null;

  const m = getMapMetrics();
  let roundTripMax = 0;
  let scaleDriftMax = 0;

  for (const pathEl of svg.querySelectorAll("path")) {
    const len = pathEl.getTotalLength();
    const step = Math.max(24, len / 24);
    for (let t = 0; t <= len; t += step) {
      const p = pathEl.getPointAtLength(t);
      const px = viewBoxToLayerPx(p);
      const back = px ? layerPxToViewBox(px) : null;
      if (back) roundTripMax = Math.max(roundTripMax, dist2d(p, back));
      if (px) {
        const old = { x: p.x * m.scaleX, y: p.y * m.scaleY };
        scaleDriftMax = Math.max(
          scaleDriftMax,
          Math.hypot(px.x - old.x, px.y - old.y)
        );
      }
    }
  }

  const markGap = [];
  for (const [locId, coord] of endpointCoords) {
    const near = nearestPointOnSvgPaths(svg, coord);
    markGap.push({
      locId,
      gapViewBox: near ? +near.distance.toFixed(2) : null,
    });
  }
  const maxMarkGap = Math.max(0, ...markGap.map((x) => x.gapViewBox ?? 0));

  const report = { roundTripMax, scaleDriftMax, maxMarkGap, markGap };
  if (locationsData.debugShowPaths) {
    if (scaleDriftMax > 1.5) {
      console.info(
        `[map] alignment: CTM vs scaleX/Y drift up to ${scaleDriftMax.toFixed(1)} screen px (fixed by CTM)`
      );
    }
    if (roundTripMax > 0.75) {
      console.warn(`[map] alignment: viewBox round-trip error ${roundTripMax.toFixed(2)} px`);
    }
    if (maxMarkGap > 12) {
      console.warn(
        `[map] alignment: mark farthest from path2.svg is ${maxMarkGap.toFixed(1)} viewBox px`,
        markGap.filter((g) => (g.gapViewBox ?? 0) > 12)
      );
    } else {
      console.info(`[map] alignment OK (mark gap max ${maxMarkGap.toFixed(1)} viewBox px)`);
    }
  }
  return report;
}

export function playerEl() { return els.player; }
export function trailLayerEl() { return els.pathsTrail; }
export function marksLayerEl() { return els.marks; }
export function rootEl() { return els.root; }

export function setCurrentMarkHighlight(locationId) {
  markEls.forEach((el, id) => {
    el.classList.toggle("is-current", id === locationId);
  });
}

function appendLocationMark(loc, state, { coord, usePathEndStyle = false } = {}) {
  const pos = coord || loc.mapPosition;
  const el = document.createElement("div");
  el.className = usePathEndStyle ? "path-end-mark" : "mark";
  el.dataset.location = loc.id;

  const here = state.currentLocation || locationsData.startLocation;
  if (loc.id !== here && !canTravelTo(loc.id, state)) el.classList.add("is-locked");
  if (state.currentLocation === loc.id) el.classList.add("is-current");

  const label = document.createElement("span");
  label.className = "mark__label";
  label.textContent = localizedTitle(loc.title);
  el.appendChild(label);

  placeMapAnchor(el, pos);
  if (coord) {
    el.dataset.mapX = String(pos.x);
    el.dataset.mapY = String(pos.y);
  }
  el.addEventListener("click", () => handleMarkClick(loc.id));

  const parent = usePathEndStyle ? els.pathEnds : els.marks;
  parent.appendChild(el);
  markEls.set(loc.id, el);
}

/** mark.png at path4.svg circle centers (aligned with path2.svg routes). */
async function renderPathEndpointMarks(state) {
  if (!els.pathEnds) return;
  await renderPathOverlay();
  const svg = els.pathsOverlay?.querySelector("svg");

  els.pathEnds.setAttribute("aria-hidden", "false");
  endpointCoords.clear();

  let locationCoords = new Map();
  try {
    const res = await fetch(PATH4_MARKS_URL);
    if (!res.ok) throw new Error("path4.svg missing");
    locationCoords = parsePath4MarkAnchors(
      await res.text(),
      locationsData.locations
    );
  } catch (e) {
    console.warn("[map] path4 marks fallback to path2 geometry", e);
    if (svg && locationsData.paths?.length) {
      locationCoords = computeLocationAnchors(
        locationsData.paths,
        locationsData.locations,
        svg
      );
    }
  }

  for (const loc of locationsData.locations) {
    if (!locationCoords.has(loc.id) && loc.markAnchor) {
      locationCoords.set(loc.id, { ...loc.markAnchor });
    }
    if (!locationCoords.has(loc.id)) {
      locationCoords.set(loc.id, { ...loc.mapPosition });
    }
  }

  for (const loc of locationsData.locations) {
    if (!loc.mapMarkAt) continue;
    const ref = locationCoords.get(loc.mapMarkAt);
    if (ref) locationCoords.set(loc.id, { ...ref });
  }

  for (const [locId, coord] of locationCoords) {
    endpointCoords.set(locId, coord);
    const loc = locationById(locId);
    if (!loc || !isMarkVisible(loc, state)) continue;
    appendLocationMark(loc, state, {
      coord,
      usePathEndStyle: true,
    });
  }
}

function cssEscape(id) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(id);
  return id.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

/* ---------------- internal ---------------- */

function currentOrStart(state) {
  const id = state.currentLocation || locationsData.startLocation;
  return locationsData.locations.find(l => l.id === id) || null;
}

function isDebugMap() {
  return locationsData?.debugShowPaths === true;
}

function isMarkVisible(loc, state) {
  if (isDebugMap()) return true;
  if (
    loc.id === "pier" &&
    locationsData.locations.some((l) => l.mapMarkAt === "pier")
  ) {
    return false;
  }
  if (getFlag("tutorialMap")) return loc.id === "orangehouse";
  if (state.mode === "free") return true;
  if (state.mode === "story") {
    return isStoryMarkVisible(loc, state, locationsData);
  }
  // До выбора режима на карте не показываем лишние метки.
  if (!state.mode) return loc.id === locationsData.startLocation;
  return loc.availableInStoryMode !== false;
}

function canTravelTo(locId, state) {
  const here = state.currentLocation || locationsData.startLocation;
  if (locId === here) return false;
  if (isDebugMap()) return true;
  if (getFlag("tutorialMap")) return locId === "orangehouse";
  // Free mode: any mark on the map (route via path2.svg network).
  if (state.mode === "free") return true;

  if (state.mode === "story") {
    return canTravelToStoryLocation(locId, state, locationsData);
  }

  const loc = locationsData.locations.find(l => l.id === here);
  if (!loc) return false;
  if (!loc.connectedLocations.includes(locId)) return false;
  return true;
}

function handleMarkClick(locId) {
  if (isDayTransitionActive()) return;

  const state = getState();
  const here = state.currentLocation || locationsData.startLocation;
  // Clicking the mark you're standing on enters that location's scene
  // without movement — otherwise you could never re-enter your starting place.
  if (locId === here) {
    if (onSelectCb) onSelectCb(locId, { skipTravel: true });
    return;
  }
  if (!canTravelTo(locId, state)) {
    const loc = locationsData.locations.find(l => l.id === here);
    if (loc && !loc.connectedLocations.includes(locId)) {
      showHint(t("map.noPath"));
    } else {
      showHint(t("map.locked"));
    }
    return;
  }
  if (onSelectCb) onSelectCb(locId);
}

let hintTimer = null;
function showHint(text) {
  els.hint.textContent = text;
  els.hint.classList.add("is-on");
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => els.hint.classList.remove("is-on"), 2400);
}

export async function ensurePathSvg() {
  await renderPathOverlay();
  return els.pathsOverlay?.querySelector("svg") ?? null;
}

let cachedNetwork = null;
let cachedNetworkForUrl = null;

/** Build & cache a walkable graph from path2.svg (every path is a polyline). */
export async function ensurePathNetwork() {
  const svg = await ensurePathSvg();
  if (!svg) return null;
  if (cachedNetwork && cachedNetworkForUrl === PATH_SVG_URL) return cachedNetwork;
  cachedNetwork = buildPathNetwork(svg, { tolerance: 4, stepPx: 4 });
  cachedNetworkForUrl = PATH_SVG_URL;
  return cachedNetwork;
}

/** Fit viewport so the whole map (and path2.svg) is always visible. */
function fitViewport() {
  if (!els.viewport || !locationsData) return;
  const W = locationsData.mapSize.width;
  const H = locationsData.mapSize.height;
  const availW = els.root.clientWidth;
  const availH = els.root.clientHeight;
  const scale = Math.min(availW / W, availH / H);
  // Keep exact map aspect ratio (W:H) so map.png and path2.svg share one box.
  const w = Math.round(W * scale);
  const h = Math.round((w * H) / W);
  els.viewport.style.width = `${w}px`;
  els.viewport.style.height = `${h}px`;
  els.viewport.style.setProperty("--map-scale", String(w / W));
}

function layoutLayers() {
  fitViewport();
  markEls.forEach((el, id) => {
    const loc = locationsData.locations.find(l => l.id === id);
    if (!loc) return;
    const coord =
      el.dataset.mapX != null && el.dataset.mapY != null
        ? { x: Number(el.dataset.mapX), y: Number(el.dataset.mapY) }
        : loc.mapPosition;
    placeMapAnchor(el, coord);
  });
  const state = getState();
  const here = currentOrStart(state);
  if (here) {
    const pos = getDisplayCoord(here.id) || here.mapPosition;
    placeMapAnchor(els.player, pos);
  }
}

/** Visible SVG overlay for path authoring (toggle via debugShowPaths in locations.json). */
async function renderPathOverlay() {
  if (!els.pathsOverlay) return;

  const showLines = locationsData?.debugShowPaths === true;
  els.pathsRoot?.classList.toggle("is-debug", showLines);

  try {
    if (
      pathOverlayUrl !== PATH_SVG_URL ||
      !pathOverlayLoaded ||
      !els.pathsOverlay.querySelector("svg")
    ) {
      const res = await fetch(PATH_SVG_URL);
      if (!res.ok) throw new Error("path2.svg missing");
      els.pathsOverlay.innerHTML = await res.text();
      const svg = els.pathsOverlay.querySelector("svg");
      if (svg) {
        prepareSvgForMeasure(svg);
        svg.setAttribute("width", "100%");
        svg.setAttribute("height", "100%");
        // Stretch to the same box as map.png (default SVG "meet" would letterbox).
        svg.setAttribute("preserveAspectRatio", "none");
        svg.style.display = "block";
      }
      pathOverlayLoaded = true;
      pathOverlayUrl = PATH_SVG_URL;
      cachedNetwork = null;
      cachedNetworkForUrl = null;
    }
  } catch (e) {
    console.warn("[map] path overlay", e);
  }
}

function queueLayout() {
  if (resizeQueued) return;
  resizeQueued = true;
  requestAnimationFrame(() => {
    resizeQueued = false;
    if (locationsData) layoutLayers();
  });
}

/* ---------------- progression helpers exposed to main ---------------- */

export function locationById(id) {
  return locationsData.locations.find(l => l.id === id);
}

export function findPath(fromId, toId) {
  const candidates = locationsData.paths.filter(
    (p) =>
      (p.from === fromId && p.to === toId) ||
      (p.from === toId && p.to === fromId)
  );
  if (!candidates.length) return null;
  if (candidates.length === 1) return candidates[0];

  const svg = els.pathsOverlay?.querySelector("svg");
  const fromLoc = locationById(fromId);
  const toLoc = locationById(toId);
  const fromAnchor =
    endpointCoords.get(fromId) ?? fromLoc?.markAnchor ?? fromLoc?.mapPosition;
  const toAnchor =
    endpointCoords.get(toId) ?? toLoc?.markAnchor ?? toLoc?.mapPosition;
  if (!svg || !fromAnchor || !toAnchor) return candidates[0];

  const posById = getLocationPosById();
  let best = candidates[0];
  let bestScore = Infinity;

  for (const p of candidates) {
    const pathEl = svg.querySelector(`#${cssEscape(p.svgPathId)}`);
    if (!pathEl) continue;
    const score = scorePathForAnchors(
      pathEl,
      fromId,
      toId,
      fromAnchor,
      toAnchor,
      posById
    );
    if (score < bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

export function noteVisit(locId) {
  markVisited(locId);
  if (isStoryMode()) {
    onStoryLocationVisited(locId, locationsData);
    if (getState().screen === "map") void renderMap();
    return;
  }
  const loc = locationById(locId);
  if (loc) loc.connectedLocations.forEach(unlock);
}
