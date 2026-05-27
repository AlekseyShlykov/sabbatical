// pathGeometry.js — path2.svg geometry for marks and movement.

export function dist2d(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function pathEnds(pathEl) {
  const len = pathEl.getTotalLength();
  const start = pathEl.getPointAtLength(0);
  const end = pathEl.getPointAtLength(len);
  return {
    start: { x: start.x, y: start.y },
    end: { x: end.x, y: end.y },
  };
}

/**
 * Which geometric end of this graph edge belongs to `locId` (partner = other node).
 */
export function endpointOnEdge(pathEl, locId, partnerId, posById) {
  const loc = posById.get(locId);
  const partner = posById.get(partnerId);
  if (!loc || !partner) return null;

  const { start, end } = pathEnds(pathEl);
  const startToLoc = dist2d(start, loc);
  const endToLoc = dist2d(end, loc);
  const startToPartner = dist2d(start, partner);
  const endToPartner = dist2d(end, partner);

  const startIsLoc =
    startToLoc < startToPartner && startToLoc <= endToLoc + 0.5;
  const endIsLoc =
    endToLoc < endToPartner && endToLoc <= startToLoc + 0.5;

  if (startIsLoc) return { x: start.x, y: start.y };
  if (endIsLoc) return { x: end.x, y: end.y };
  return startToLoc <= endToLoc
    ? { x: start.x, y: start.y }
    : { x: end.x, y: end.y };
}

function queryPath(svg, id) {
  const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id;
  return svg.querySelector(`#${esc}`);
}

function collectEdgeEndpoints(loc, paths, svg, posById) {
  const samples = [];
  const neighbors = new Set(loc.connectedLocations);

  for (const p of paths) {
    const partner =
      p.from === loc.id ? p.to : p.to === loc.id ? p.from : null;
    if (!partner || !neighbors.has(partner)) continue;

    const pathEl = queryPath(svg, p.svgPathId);
    if (!pathEl) {
      console.warn(`[pathGeometry] missing in path2.svg: ${p.svgPathId}`);
      continue;
    }
    const pt = endpointOnEdge(pathEl, loc.id, partner, posById);
    if (pt) samples.push(pt);
  }
  return samples;
}

/**
 * Parse path4.svg gray circles (28×28, r=14) and assign each location
 * the nearest unused circle center (matched via mapPosition).
 */
export function parsePath4MarkAnchors(svgText, locations) {
  const circles = [];
  const re = /<circle\s+cx="([^"]+)"\s+cy="([^"]+)"\s+r="14"/g;
  let m;
  while ((m = re.exec(svgText)) !== null) {
    circles.push({ x: Number(m[1]), y: Number(m[2]) });
  }
  if (!circles.length) {
    throw new Error("[pathGeometry] no r=14 circles in path4.svg");
  }

  const anchors = new Map();
  const used = new Set();

  const claimCircle = (locId, pin) => {
    let bestIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < circles.length; i++) {
      if (used.has(i)) continue;
      const d = dist2d(circles[i], pin);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) return;
    used.add(bestIdx);
    const c = circles[bestIdx];
    anchors.set(locId, { x: c.x, y: c.y });
    if (bestD > 80) {
      console.warn(
        `[pathGeometry] path4 pin far from ${locId} target (${bestD.toFixed(0)}px)`
      );
    }
  };

  for (const loc of locations) {
    if (loc.path4Pin) claimCircle(loc.id, loc.path4Pin);
  }

  for (const loc of locations) {
    if (anchors.has(loc.id) || loc.mapMarkAt) continue;
    const ref = loc.markAnchor ?? loc.mapPosition;
    let bestIdx = -1;
    let bestD = Infinity;
    for (let i = 0; i < circles.length; i++) {
      if (used.has(i)) continue;
      const d = dist2d(circles[i], ref);
      if (d < bestD) {
        bestD = d;
        bestIdx = i;
      }
    }
    if (bestIdx < 0) continue;
    used.add(bestIdx);
    const c = circles[bestIdx];
    anchors.set(loc.id, { x: c.x, y: c.y });
    if (bestD > 80) {
      console.warn(
        `[pathGeometry] path4 mark far from ${loc.id} mapPosition (${bestD.toFixed(0)}px)`
      );
    }
  }

  for (const loc of locations) {
    if (loc.mapMarkAt && anchors.has(loc.mapMarkAt)) {
      anchors.set(loc.id, { ...anchors.get(loc.mapMarkAt) });
    }
  }

  for (const loc of locations) {
    if (anchors.has(loc.id)) continue;
    if (loc.mapMarkAt) continue;
    console.warn(`[pathGeometry] no path4 circle for ${loc.id}`);
  }

  return anchors;
}

/**
 * Fallback: path2.svg vertex on an edge to a connected neighbor,
 * closest to mapPosition when several junctions exist.
 */
export function computeLocationAnchors(paths, locations, svg) {
  const posById = new Map(locations.map((l) => [l.id, l.mapPosition]));
  const anchors = new Map();

  for (const loc of locations) {
    const samples = collectEdgeEndpoints(loc, paths, svg, posById);
    if (!samples.length) {
      console.warn(`[pathGeometry] no path2 end for ${loc.id}, fallback mapPosition`);
      anchors.set(loc.id, { x: loc.mapPosition.x, y: loc.mapPosition.y });
      continue;
    }

    const ref = loc.mapPosition;
    let best = samples[0];
    let bestD = dist2d(best, ref);
    for (let i = 1; i < samples.length; i++) {
      const d = dist2d(samples[i], ref);
      if (d < bestD) {
        bestD = d;
        best = samples[i];
      }
    }
    anchors.set(loc.id, { x: best.x, y: best.y });
  }
  return anchors;
}

/**
 * Walk along path2.svg between mark anchors (same points as on the map).
 * Projects anchors onto the path, then samples the segment between them.
 */
export function samplePathAlongEdge(pathEl, fromAnchor, toAnchor, stepPx = 8) {
  const len = pathEl.getTotalLength();
  const probe = Math.max(48, Math.ceil(len / 4));
  let tFrom = 0;
  let tTo = len;
  let bestFromD = Infinity;
  let bestToD = Infinity;

  for (let i = 0; i <= probe; i++) {
    const t = (i / probe) * len;
    const p = pathEl.getPointAtLength(t);
    const df = dist2d(p, fromAnchor);
    const dt = dist2d(p, toAnchor);
    if (df < bestFromD) {
      bestFromD = df;
      tFrom = t;
    }
    if (dt < bestToD) {
      bestToD = dt;
      tTo = t;
    }
  }

  let t0 = tFrom;
  let t1 = tTo;
  if (t0 > t1) {
    const swap = t0;
    t0 = t1;
    t1 = swap;
  }

  const span = Math.max(stepPx, t1 - t0);
  const n = Math.max(2, Math.ceil(span / stepPx));
  const pts = [{ x: fromAnchor.x, y: fromAnchor.y }];

  for (let i = 1; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / n;
    const p = pathEl.getPointAtLength(t);
    pts.push({ x: p.x, y: p.y });
  }

  pts.push({ x: toAnchor.x, y: toAnchor.y });
  return pts;
}

/** Pick the graph edge whose ends best match computed mark anchors. */
export function scorePathForAnchors(pathEl, fromId, toId, fromAnchor, toAnchor, posById) {
  const fromPt = endpointOnEdge(pathEl, fromId, toId, posById);
  const toPt = endpointOnEdge(pathEl, toId, fromId, posById);
  if (!fromPt || !toPt) return Infinity;
  return dist2d(fromPt, fromAnchor) + dist2d(toPt, toAnchor);
}

export function prepareSvgForMeasure(svg) {
  if (!svg.getAttribute("viewBox")) {
    svg.setAttribute("viewBox", "0 0 1402 1122");
  }
  svg.setAttribute("width", "1402");
  svg.setAttribute("height", "1122");
}

/* ===================================================================
 * Path network: every <path> in the SVG becomes a polyline. Points
 * within `tolerance` from each other are merged into one node, so two
 * paths that touch at a junction share that node. This gives the player
 * a real connected graph to walk along — exactly the lines on the map.
 * =================================================================== */

/**
 * @param {SVGSVGElement} svgEl
 * @param {{tolerance?: number, stepPx?: number}} [opts]
 * @returns {{ nodes: {x:number,y:number}[], adjacency: Map<number, number>[] }}
 */
export function buildPathNetwork(svgEl, opts = {}) {
  const tolerance = opts.tolerance ?? 4;
  const stepPx = opts.stepPx ?? 4;

  const nodes = [];
  const adjacency = [];

  function findOrAdd(pt) {
    for (let i = 0; i < nodes.length; i++) {
      if (dist2d(nodes[i], pt) <= tolerance) return i;
    }
    const idx = nodes.length;
    nodes.push({ x: pt.x, y: pt.y });
    adjacency.push(new Map());
    return idx;
  }

  function connect(a, b) {
    if (a === b) return;
    const d = dist2d(nodes[a], nodes[b]);
    const cur = adjacency[a].get(b);
    if (cur === undefined || d < cur) {
      adjacency[a].set(b, d);
      adjacency[b].set(a, d);
    }
  }

  const pathEls = svgEl.querySelectorAll("path");
  for (const pathEl of pathEls) {
    let len = 0;
    try { len = pathEl.getTotalLength(); }
    catch { continue; }
    if (!len || !Number.isFinite(len)) continue;

    const n = Math.max(2, Math.ceil(len / stepPx));
    let prev = -1;
    for (let i = 0; i <= n; i++) {
      const p = pathEl.getPointAtLength((i / n) * len);
      const idx = findOrAdd({ x: p.x, y: p.y });
      if (prev >= 0) connect(prev, idx);
      prev = idx;
    }
  }

  return { nodes, adjacency };
}

/** Closest point on any <path> in the overlay SVG (viewBox coords). */
export function nearestPointOnSvgPaths(svgEl, anchor, stepPx = 6) {
  let best = null;
  let bestD = Infinity;

  for (const pathEl of svgEl.querySelectorAll("path")) {
    let len = 0;
    try {
      len = pathEl.getTotalLength();
    } catch {
      continue;
    }
    if (!len || !Number.isFinite(len)) continue;

    const n = Math.max(2, Math.ceil(len / stepPx));
    for (let i = 0; i <= n; i++) {
      const p = pathEl.getPointAtLength((i / n) * len);
      const d = dist2d(p, anchor);
      if (d < bestD) {
        bestD = d;
        best = { x: p.x, y: p.y };
      }
    }
  }

  return best ? { point: best, distance: bestD } : null;
}

export function nearestNodeInNetwork(network, anchor) {
  let bestIdx = -1;
  let bestD = Infinity;
  for (let i = 0; i < network.nodes.length; i++) {
    const d = dist2d(network.nodes[i], anchor);
    if (d < bestD) { bestD = d; bestIdx = i; }
  }
  return bestIdx;
}

/** Dijkstra in the path network (small graph — plain O(n²) is fine). */
export function findRouteInNetwork(network, startIdx, endIdx) {
  const { nodes, adjacency } = network;
  if (startIdx < 0 || endIdx < 0 || startIdx >= nodes.length || endIdx >= nodes.length) {
    return null;
  }
  if (startIdx === endIdx) return [{ ...nodes[startIdx] }];

  const dist = new Array(nodes.length).fill(Infinity);
  const prev = new Array(nodes.length).fill(-1);
  const visited = new Array(nodes.length).fill(false);
  dist[startIdx] = 0;

  for (let iter = 0; iter < nodes.length; iter++) {
    let u = -1;
    let ud = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      if (!visited[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    }
    if (u < 0) break;
    if (u === endIdx) break;
    visited[u] = true;
    for (const [v, w] of adjacency[u]) {
      if (visited[v]) continue;
      const alt = ud + w;
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }

  if (!Number.isFinite(dist[endIdx])) return null;

  const route = [];
  let cur = endIdx;
  while (cur >= 0) {
    route.push({ x: nodes[cur].x, y: nodes[cur].y });
    if (cur === startIdx) break;
    cur = prev[cur];
  }
  route.reverse();
  return route;
}

/** Cumulative arc-length array for a polyline. */
export function cumulativeLengths(route) {
  const cum = [0];
  for (let i = 1; i < route.length; i++) {
    cum.push(cum[i - 1] + dist2d(route[i - 1], route[i]));
  }
  return cum;
}

/** Interpolate point along the polyline at arc-distance `d`. */
export function pointAtDistance(route, cum, d) {
  if (d <= 0) return { x: route[0].x, y: route[0].y };
  const total = cum[cum.length - 1];
  if (d >= total) {
    const last = route[route.length - 1];
    return { x: last.x, y: last.y };
  }
  let lo = 0;
  let hi = cum.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const t = (d - cum[lo]) / span;
  return {
    x: route[lo].x + (route[hi].x - route[lo].x) * t,
    y: route[lo].y + (route[hi].y - route[lo].y) * t,
  };
}
