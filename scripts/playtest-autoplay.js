// Injected in browser via CDP for playtesting.
window.__playtest = async function runPlaytest({
  steps = 500,
  targetMode = "story",
  delay = 280,
  fresh = false,
} = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const STORY_ORDERS = {
    1: ["orangehouse", "bluehouse", "forest", "bar", "whitehouse", "lighthouse", "beach"],
    2: ["bluehouse", "greenhouse", "bar", "forest", "yellowhouse", "purplehouse"],
    3: ["orangehouse", "bar"],
    4: ["forest", "bluehouse", "purplehouse", "greenhouse", "bar"],
  };
  const REST_RE = /rest a little|отдохнуть/i;

  if (fresh) {
    localStorage.removeItem("sabbatical_save_v2");
    location.reload();
    await sleep(1200);
  }

  const getScreen = () => {
    const vis = document.querySelector(".screen:not([hidden])");
    return vis?.dataset?.screen || null;
  };
  const getSave = () => {
    try {
      return JSON.parse(localStorage.getItem("sabbatical_save_v2") || "{}");
    } catch {
      return {};
    }
  };

  function storyFocus(s) {
    const flags = s.flags || {};
    const visited = s.visitedLocations || [];
    const day = s.dayCycle?.day || 1;
    if (!flags.storyDay1Ended) {
      for (const id of STORY_ORDERS[1]) if (!visited.includes(id)) return id;
      return null;
    }
    for (let d = 2; d <= 4; d++) {
      if (day < d) break;
      if (flags[`storyDay${d}Ended`]) continue;
      const order = STORY_ORDERS[d];
      if (!order) continue;
      let prevDone = true;
      for (let p = 1; p < d; p++) if (!flags[`storyDay${p}Ended`]) prevDone = false;
      if (!prevDone) continue;
      for (const id of order) if (!flags[`storyDay${d}_${id}`]) return id;
    }
    return null;
  }

  function pickChoice(targetMode) {
    const btns = [...document.querySelectorAll("#dialogue-actions .choice-btn")].filter(
      (b) => !b.disabled && !b.classList.contains("choice-btn--disabled")
    );
    if (!btns.length) return null;
    if (targetMode === "story") {
      const nonRest = btns.filter((b) => !REST_RE.test(b.textContent || ""));
      if (nonRest.length) return nonRest[0];
    }
    if (targetMode === "free") {
      const rest = btns.find((b) => REST_RE.test(b.textContent || ""));
      const s = getSave();
      const acts = s.dayCycle?.actionsUsed || 0;
      if (rest && acts >= 3 && s.currentLocation === "orangehouse") return rest;
    }
    return btns[0];
  }

  const log = [];
  let modeChosen = false;

  async function step() {
    const overlay = document.querySelector(
      ".day-end-notice.is-on, .day-title-card.is-on, .party-call-notice.is-on"
    );
    if (overlay) {
      overlay.click();
      return "overlay";
    }
    const screen = getScreen();
    if (screen === "splash") {
      document.querySelector('[data-action="start"]')?.click();
      return "start";
    }
    if (screen === "intro") {
      document.querySelector('[data-action="intro-continue"]')?.click();
      return "intro";
    }
    if (screen === "modeSelect" && !modeChosen) {
      document.querySelector(`[data-mode="${targetMode}"]`)?.click();
      modeChosen = true;
      return "mode-" + targetMode;
    }
    if (screen === "location") {
      const btn = pickChoice(targetMode);
      if (btn) {
        const label = (btn.textContent || "").slice(0, 40);
        btn.click();
        return "choice:" + label;
      }
      document.getElementById("dialogue-line")?.click();
      await sleep(100);
      const next = pickChoice(targetMode);
      if (next) {
        next.click();
        return "next";
      }
      const leave = document.querySelector('[data-action="leave"]');
      if (leave && !leave.hidden && !leave.disabled) {
        leave.click();
        return "leave";
      }
      return "loc-wait";
    }
    if (screen === "map") {
      const s = getSave();
      let target = null;
      if (targetMode === "story") target = storyFocus(s);
      const marks = [...document.querySelectorAll(".mark, .path-end-mark")].filter(
        (m) => !m.classList.contains("is-locked")
      );
      if (target) {
        const focusMark = marks.find((m) => m.dataset.location === target);
        if (focusMark) {
          focusMark.click();
          return "map-focus:" + target;
        }
      }
      const travel = marks.find((m) => !m.classList.contains("is-current"));
      const pick = travel || marks[0];
      if (pick) {
        pick.click();
        return "map:" + (pick.dataset.location || "?");
      }
      return "map-idle";
    }
    return "idle:" + (screen || "none");
  }

  for (let i = 0; i < steps; i++) {
    const s = getSave();
    const action = await step();
    const noteworthy =
      i < 30 ||
      i % 6 === 0 ||
      action.startsWith("mode") ||
      action.startsWith("overlay") ||
      action.startsWith("map") ||
      action.startsWith("choice") ||
      action === "leave";
    if (noteworthy) {
      log.push({
        i,
        action,
        screen: getScreen(),
        day: s.dayCycle?.day,
        act: s.dayCycle?.actionsUsed,
        mode: s.mode,
        loc: s.currentLocation,
        passage: document.getElementById("dialogue-line")?.textContent?.slice(0, 70),
        focus: targetMode === "story" ? storyFocus(s) : null,
        flags: Object.entries(s.flags || {})
          .filter(([, v]) => v)
          .map(([k]) => k)
          .filter((k) => /storyDay|party|freeDay|dayScene/.test(k)),
      });
    }
    await sleep(delay);
    const fin = getSave();
    if (targetMode === "story" && fin.flags?.storyDay4Ended) break;
    if (targetMode === "free" && fin.flags?.freeDay4PartyDone) break;
  }

  const fin = getSave();
  return {
    log,
    final: {
      screen: getScreen(),
      day: fin.dayCycle?.day,
      actions: fin.dayCycle?.actionsUsed,
      mode: fin.mode,
      loc: fin.currentLocation,
      passage: document.getElementById("dialogue-line")?.textContent?.slice(0, 80),
      flags: fin.flags,
      visited: fin.visitedLocations,
      focus: targetMode === "story" ? storyFocus(fin) : null,
    },
  };
};
