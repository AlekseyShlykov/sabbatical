// devEnd.js — письмо под дверью и форма email в конце демо.

import { t } from "./localization.js";

const LETTER_URL = "assets/stuff/letter.png";

// ─────────────────────────────────────────────────────────────────────────
// Куда собирать email из формы вейтлиста.
// Вставь сюда endpoint своего сервиса и всё заработает. Примеры:
//   Formspree:  "https://formspree.io/f/xxxxxxxx"
//   Getform:    "https://getform.io/f/xxxxxxxx"
//   Google Apps Script Web App: "https://script.google.com/macros/s/AKfy.../exec"
// Пусто ("") — ничего не отправляем, только локальная копия в браузере.
// Подробная инструкция — в README (раздел «Сбор email»).
const WAITLIST_ENDPOINT = "https://formspree.io/f/mykqazev";

/**
 * Отправить email на настроенный endpoint. Локальную копию сохраняем всегда.
 * Возвращает true, если отправка удалась (или endpoint не задан).
 */
async function submitWaitlistEmail(email) {
  try {
    localStorage.setItem("sabbatical_waitlist_email", email);
  } catch {
    /* ignore */
  }
  if (!WAITLIST_ENDPOINT) return true;
  try {
    const res = await fetch(WAITLIST_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        email,
        source: "sabbatical-demo",
        ts: new Date().toISOString(),
      }),
    });
    return res.ok;
  } catch (err) {
    console.warn("[devEnd] waitlist submit failed", err);
    return false;
  }
}

let letterWrapEl = null;
let letterEl = null;
let letterNoteEl = null;
let formEl = null;
let emailInput = null;

export function initDevEnd() {
  letterWrapEl = document.getElementById("stage-letter-wrap");
  letterEl = document.getElementById("stage-letter");
  letterNoteEl = document.getElementById("stage-letter-note");
  formEl = document.getElementById("dev-end-form");
  emailInput = document.getElementById("dev-end-email");

  const form = formEl?.querySelector("form");
  form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = (emailInput?.value || "").trim();
    if (!email) return;

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    const ok = await submitWaitlistEmail(email);
    if (submitBtn) submitBtn.disabled = false;

    const msg = formEl.querySelector(".dev-end-form__thanks");
    if (ok) {
      if (msg) {
        msg.hidden = false;
        msg.textContent = t("devEnd.thanks");
      }
      form.hidden = true;
    } else if (msg) {
      // Ошибка отправки: оставляем форму, чтобы можно было повторить.
      msg.hidden = false;
      msg.textContent = t("devEnd.error", "Не удалось отправить. Попробуйте ещё раз.");
    }
  });
}

export async function showLetterProp(noteText = "") {
  if (!letterWrapEl) letterWrapEl = document.getElementById("stage-letter-wrap");
  if (!letterEl) letterEl = document.getElementById("stage-letter");
  if (!letterWrapEl || !letterEl) return;
  letterEl.src = LETTER_URL;
  letterWrapEl.hidden = false;

  if (!letterNoteEl) letterNoteEl = document.getElementById("stage-letter-note");
  const note = (noteText || "").trim();
  if (letterNoteEl) {
    if (note) {
      letterNoteEl.textContent = note;
      letterNoteEl.hidden = false;
    } else {
      letterNoteEl.hidden = true;
      letterNoteEl.textContent = "";
    }
  }

  requestAnimationFrame(() => letterWrapEl.classList.add("is-on"));
}

export function hideLetterProp() {
  if (!letterWrapEl) letterWrapEl = document.getElementById("stage-letter-wrap");
  if (!letterEl) letterEl = document.getElementById("stage-letter");
  if (letterWrapEl) {
    letterWrapEl.classList.remove("is-on");
    letterWrapEl.hidden = true;
  }
  if (letterEl) {
    letterEl.removeAttribute("src");
  }
  if (!letterNoteEl) letterNoteEl = document.getElementById("stage-letter-note");
  if (letterNoteEl) {
    letterNoteEl.hidden = true;
    letterNoteEl.textContent = "";
  }
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
