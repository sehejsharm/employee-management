/**
 * Whether anyone is looking at the Workspace right now. Background checks
 * (incoming calls, notifications, live dashboards) run only while the tab is
 * visible and someone has touched the page in the last few minutes, so a tab
 * left open on an unattended screen stops querying the database and the
 * database can sleep. Calls still ring on idle screens through push.
 */

const IDLE_AFTER_MS = 5 * 60_000;
let lastActive = Date.now();
let listening = false;

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  const mark = () => {
    lastActive = Date.now();
  };
  for (const e of ["pointerdown", "keydown", "wheel", "touchstart", "focus"] as const) window.addEventListener(e, mark, { passive: true, capture: true });
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && mark());
}

/** True while the tab is visible and was used in the last five minutes. */
export function someoneIsHere() {
  listen();
  return document.visibilityState === "visible" && Date.now() - lastActive < IDLE_AFTER_MS;
}

/** Start tracking activity (call once on mount). */
export function watchAttention() {
  listen();
}
