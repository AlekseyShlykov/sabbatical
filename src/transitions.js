// transitions.js
// Shared screen/fade transitions. No business logic here.

const veil = () => document.getElementById("veil");

const prefersReduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const DUR = 240;

/** Show a screen by data-screen id, fading the previous out. */
export function showScreen(screenId) {
  const all = document.querySelectorAll("[data-screen]");
  all.forEach((el) => {
    if (el.getAttribute("data-screen") === screenId) {
      el.hidden = false;
      // Force a reflow so the opacity transition still plays, then activate
      // synchronously. Using rAF here races with the delayed hide below when
      // frames are throttled/instant (e.g. prefers-reduced-motion).
      void el.offsetWidth;
      el.classList.add("is-active");
    } else {
      el.classList.remove("is-active");
      setTimeout(() => {
        // Guard against a race: if this screen was re-shown before the
        // delayed hide fired, don't clobber it back to hidden.
        if (!el.classList.contains("is-active")) el.hidden = true;
      }, DUR);
    }
  });
}

/** Wrap a transition with a black veil. */
export async function withFade(fn) {
  if (prefersReduced()) {
    await fn();
    return;
  }
  const v = veil();
  v.classList.add("is-on");
  try {
    await wait(DUR);
    await fn();
  } finally {
    v.classList.remove("is-on");
    await wait(DUR);
  }
}

export function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
