// intro.js — многошаговое интро перед прологом (intro0 → intro1).

import { t } from "./localization.js";
import { preloadRasters, resolveRasterUrl } from "./scene.js";

const INTRO_DIR = "assets/intro/";

/** @type {{ image: string, textKey: string }[]} */
const SLIDES = [
  { image: "intro0", textKey: "intro.slide0a" },
  { image: "intro0", textKey: "intro.slide0b" },
  { image: "intro1", textKey: "intro.slide1a" },
  { image: "intro1", textKey: "intro.slide1b" },
];

let step = 0;

export function resetIntro() {
  step = 0;
}

export function getIntroStep() {
  return step;
}

/** Показать текущий слайд (картинка + текст). */
export async function renderIntroSlide() {
  const slide = SLIDES[step];
  if (!slide) return;

  const textEl = document.getElementById("intro-text");
  if (textEl) textEl.textContent = t(slide.textKey);

  const img = document.querySelector(".intro__img");
  if (!img) return;

  img.classList.remove("is-missing");
  await preloadRasters([[INTRO_DIR, slide.image]]);
  const url = await resolveRasterUrl(INTRO_DIR, slide.image);
  if (!url) {
    console.warn(`[intro] missing image: ${INTRO_DIR}${slide.image}`);
    img.classList.add("is-missing");
    img.removeAttribute("src");
    return;
  }
  if (img.dataset.introAsset !== slide.image) {
    img.dataset.introAsset = slide.image;
    img.src = url;
  }
}

/**
 * Следующий слайд.
 * @returns {boolean} true — интро закончилось, можно в пролог
 */
export async function advanceIntro() {
  step += 1;
  if (step < SLIDES.length) {
    await renderIntroSlide();
    return false;
  }
  return true;
}

export function introAssetNames() {
  return [...new Set(SLIDES.map((s) => s.image))];
}
