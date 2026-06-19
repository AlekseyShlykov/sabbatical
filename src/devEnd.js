// devEnd.js — письмо под дверью и форма email в конце демо.

import { t } from "./localization.js";

const LETTER_URL = "assets/stuff/letter.png";

let letterEl = null;
let formEl = null;
let emailInput = null;

export function initDevEnd() {
  letterEl = document.getElementById("stage-letter");
  formEl = document.getElementById("dev-end-form");
  emailInput = document.getElementById("dev-end-email");

  const form = formEl?.querySelector("form");
  form?.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = (emailInput?.value || "").trim();
    if (!email) return;
    try {
      localStorage.setItem("sabbatical_waitlist_email", email);
    } catch {
      /* ignore */
    }
    const msg = formEl.querySelector(".dev-end-form__thanks");
    if (msg) {
      msg.hidden = false;
      msg.textContent = t("devEnd.thanks");
    }
    form.hidden = true;
  });
}

export async function showLetterProp() {
  if (!letterEl) letterEl = document.getElementById("stage-letter");
  if (!letterEl) return;
  letterEl.src = LETTER_URL;
  letterEl.hidden = false;
  requestAnimationFrame(() => letterEl.classList.add("is-on"));
}

export function hideLetterProp() {
  if (!letterEl) return;
  letterEl.classList.remove("is-on");
  letterEl.hidden = true;
  letterEl.removeAttribute("src");
}

export function showDevEndEmailForm() {
  if (!formEl) formEl = document.getElementById("dev-end-form");
  if (!formEl) return;
  const thanks = formEl.querySelector(".dev-end-form__thanks");
  const form = formEl.querySelector("form");
  if (thanks) {
    thanks.hidden = true;
    thanks.textContent = "";
  }
  if (form) form.hidden = false;
  if (emailInput) emailInput.value = "";
  formEl.hidden = false;
  requestAnimationFrame(() => formEl.classList.add("is-on"));
}

export function hideDevEndEmailForm() {
  if (!formEl) return;
  formEl.classList.remove("is-on");
  formEl.hidden = true;
}
