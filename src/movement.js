// movement.js
// Animate the player along the path2.svg network at uniform speed.
// Route = Dijkstra through every <path> in path2.svg (junctions merged).
// dot1.png trail appears progressively as the player passes each step.

import {
  playerEl,
  trailLayerEl,
  ensurePathNetwork,
  getPathAnchor,
  placeMapAnchor,
  placeTrailAt,
} from "./map.js";
import {
  cumulativeLengths,
  findRouteInNetwork,
  nearestNodeInNetwork,
  pointAtDistance,
} from "./pathGeometry.js";

const SPEED_PX_PER_SEC = 320;
const MIN_DURATION = 400;
const MAX_DURATION = 9000;
const DOT_STEP_PX = 36;
const DOT_STEP_PX_MOBILE = 72; /* 2× реже, чем на десктопе */

const prefersReduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const isMobileViewport = () =>
  window.matchMedia("(max-width: 640px)").matches;

function dotStepPx() {
  return isMobileViewport() ? DOT_STEP_PX_MOBILE : DOT_STEP_PX;
}

/**
 * Move player from `fromId` to `toId` along the SVG network.
 * Always returns the final on-mark coordinate.
 */
export async function travel({ fromId, toId }) {
  const player = playerEl();
  const layer = trailLayerEl();
  if (layer) layer.innerHTML = "";

  const fromAnchor = getPathAnchor(fromId);
  const toAnchor = getPathAnchor(toId);
  if (!fromAnchor || !toAnchor) {
    console.warn("[movement] missing anchors", fromId, toId);
    return toAnchor;
  }

  const network = await ensurePathNetwork();
  let route;
  if (!network) {
    route = [fromAnchor, toAnchor];
  } else {
    const startIdx = nearestNodeInNetwork(network, fromAnchor);
    const endIdx = nearestNodeInNetwork(network, toAnchor);
    const graphRoute = findRouteInNetwork(network, startIdx, endIdx);
    if (!graphRoute || graphRoute.length < 2) {
      route = [fromAnchor, toAnchor];
    } else {
      route = graphRoute;
      // Snap first/last node exactly to the visible mark anchors.
      route[0] = { x: fromAnchor.x, y: fromAnchor.y };
      route[route.length - 1] = { x: toAnchor.x, y: toAnchor.y };
    }
  }

  placeMapAnchor(player, route[0]);

  const cum = cumulativeLengths(route);
  const totalLen = cum[cum.length - 1];

  let duration = (totalLen / SPEED_PX_PER_SEC) * 1000;
  duration = Math.max(MIN_DURATION, Math.min(MAX_DURATION, duration));
  if (prefersReduced()) duration = 60;

  const dotEls = [];
  if (layer) {
    const step = dotStepPx();
    for (let d = step; d < totalLen; d += step) {
      const pt = pointAtDistance(route, cum, d);
      const el = document.createElement("div");
      el.className = "dot-trail";
      placeTrailAt(el, pt);
      layer.appendChild(el);
      dotEls.push({ el, dist: d });
    }
  }

  const start = performance.now();
  return new Promise((resolve) => {
    function frame(now) {
      const k = Math.min(1, (now - start) / duration);
      const d = k * totalLen; // linear, uniform speed
      const pt = pointAtDistance(route, cum, d);
      placeMapAnchor(player, pt);

      for (const dot of dotEls) {
        if (!dot.el.classList.contains("is-on") && d >= dot.dist) {
          dot.el.classList.add("is-on");
        }
      }

      if (k < 1) requestAnimationFrame(frame);
      else {
        placeMapAnchor(player, toAnchor);
        resolve(toAnchor);
      }
    }
    requestAnimationFrame(frame);
  });
}

export function clearTrail() {
  const layer = trailLayerEl();
  if (layer) layer.innerHTML = "";
}

