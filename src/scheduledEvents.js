// scheduledEvents.js — события по календарю/часам (свободный режим).

import { getState, getFlag } from "./state.js";
import {
  getDayCycle,
  isDayCycleActive,
  PARTY_CLOCK_ACTIONS,
  isDayTransitionActive,
} from "./dayCycle.js";

let partyHandler = null;
let partyRunning = false;

export function setDay4PartyHandler(fn) {
  partyHandler = fn;
}

export function isDay4PartyRunning() {
  return partyRunning;
}

/** День 4, свободный режим, на часах ≥ 15:00, вечеринка ещё не была. */
export function shouldForceDay4Party() {
  if (partyRunning || isDayTransitionActive()) return false;
  if (!isDayCycleActive()) return false;
  if (getState().mode !== "free") return false;
  if (getDayCycle().day !== 4) return false;
  if (getFlag("freeDay4PartyDone")) return false;
  return getDayCycle().actionsUsed >= PARTY_CLOCK_ACTIONS;
}

/** Запустить вечеринку, если пора. @returns {Promise<boolean>} */
export async function tryForceDay4Party() {
  if (!shouldForceDay4Party() || !partyHandler) return false;
  partyRunning = true;
  try {
    await partyHandler();
    return true;
  } finally {
    partyRunning = false;
  }
}
