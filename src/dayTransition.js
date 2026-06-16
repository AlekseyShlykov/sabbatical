// dayTransition.js — сообщение о конце дня и титр нового дня.

import { t, tFmt } from "./localization.js";
import { wait } from "./transitions.js";

let endCalendarDayHandler = null;

/** Регистрирует сценарий конца дня (прогулка домой + титр). */
export function setEndCalendarDayHandler(fn) {
  endCalendarDayHandler = fn;
}

/** Вызов из `//новый день` и похожих команд сценария. */
export async function requestEndCalendarDay() {
  if (endCalendarDayHandler) await endCalendarDayHandler();
}

function waitForDismiss(el, ms = 2800) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.classList.remove("is-on");
      window.setTimeout(() => {
        el.hidden = true;
      }, 320);
      cleanup();
      resolve();
    };
    const onKey = (e) => {
      if (e.key === "Enter" || e.key === " ") finish();
    };
    const cleanup = () => {
      clearTimeout(timer);
      el.removeEventListener("click", finish);
      document.removeEventListener("keydown", onKey);
    };
    const timer = window.setTimeout(finish, ms);
    el.addEventListener("click", finish);
    document.addEventListener("keydown", onKey);
  });
}

/** «Сегодняшний день окончен…» — перед прогулкой домой. */
export async function showDayEndNotice() {
  const el = document.getElementById("day-end-notice");
  const msg = document.getElementById("day-end-message");
  if (!el || !msg) {
    await wait(1500);
    return;
  }
  msg.textContent = t("hud.dayEndReturnHome");
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("is-on"));
  await waitForDismiss(el);
}

/** Полноэкранный титр «День N» после смены дня. */
export async function showDayTitleCard(dayNumber) {
  const el = document.getElementById("day-title-card");
  const title = document.getElementById("day-title-text");
  if (!el || !title) {
    await wait(1200);
    return;
  }
  title.textContent = tFmt("hud.dayTitle", { n: dayNumber });
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("is-on"));
  await waitForDismiss(el, 2400);
}
