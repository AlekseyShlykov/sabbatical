// transitions.js
// Shared screen/fade transitions. No business logic here.

const veil = () => document.getElementById("veil");

const prefersReduced = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const DUR = 380;

/** Show a screen by data-screen id, fading the previous out. */
export function showScreen(screenId) {
  const all = document.querySelectorAll("[data-screen]");
  all.forEach((el) => {
    if (el.getAttribute("data-screen") === screenId) {
      el.hidden = false;
      requestAnimationFrame(() => el.classList.add("is-active"));
    } else {
      el.classList.remove("is-active");
      setTimeout(() => { el.hidden = true; }, DUR);
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
