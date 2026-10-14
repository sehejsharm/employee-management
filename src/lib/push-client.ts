"use client";

import { getPushKey, removePushSubscription, savePushSubscription } from "@/actions/push";

/**
 * Browser side of phone notifications: the service worker (public/sw.js) and
 * this device's push subscription.
 *
 * - "install": an iPhone/iPad in Safari — notifications need the Workspace on the home screen first.
 * - "unsupported": this browser can't receive them.
 * - "blocked": the person (or their browser) said no; only browser settings can undo that.
 * - "off" / "on": whether this device gets notifications.
 */
export type PushState = "unsupported" | "install" | "blocked" | "off" | "on";

const ON_KEY = "fr-push-on";
const OFF_KEY = "fr-push-off";

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {}
}

function read(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

/** Opened from the home screen (installed), not a browser tab. */
export function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** True when this device gets notifications by push, so an open tab doesn't show a second copy. */
export function pushOnHere() {
  return read(ON_KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted";
}

let registration: Promise<ServiceWorkerRegistration> | null = null;

export function registerServiceWorker() {
  registration ??= navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((error) => {
    registration = null;
    throw error;
  });
  return registration;
}

function keyBytes(base64url: string) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(current: ArrayBuffer | null, wanted: Uint8Array) {
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === wanted.length && a.every((byte, i) => byte === wanted[i]);
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return isIOS() && !isInstalled() ? "install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  try {
    const sub = await (await registerServiceWorker()).pushManager.getSubscription();
    return sub && read(OFF_KEY) !== "1" ? "on" : "off";
  } catch {
    return "unsupported";
  }
}

class TimedOut extends Error {}

/** Gives up on a step that hangs (e.g. the phone can't reach its push service) instead of spinning forever. */
function within<T>(promise: Promise<T>, ms: number) {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new TimedOut()), ms))]);
}

/** Subscribes this device (making a fresh subscription if the server's key changed) and tells the server. */
async function subscribe(): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = await getPushKey();
  if (!key.ok) return key;
  const reg = await within(registerServiceWorker(), 15_000);
  await within(navigator.serviceWorker.ready, 15_000);
  const wanted = keyBytes(key.data!.publicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options.applicationServerKey, wanted)) {
    await sub.unsubscribe().catch(() => {});
    sub = null;
  }
  sub ??= await within(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: wanted }), 20_000);
  const saved = await savePushSubscription(sub.toJSON());
  if (!saved.ok) return saved;
  store(ON_KEY, "1");
  store(OFF_KEY, null);
  return { ok: true };
}

/** Must be called straight from a tap or click: iPhones only ask for permission then. */
export async function enablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!pushSupported()) return { ok: false, error: "This browser can't show notifications." };
  const permission = await Notification.requestPermission();
  if (permission === "denied") return { ok: false, error: "Notifications are blocked. Allow them for this app in your phone or browser settings." };
  if (permission !== "granted") return { ok: false, error: "Notifications weren't allowed." };
  try {
    return await subscribe();
  } catch (error) {
    if (error instanceof TimedOut) return { ok: false, error: "Couldn't reach your phone's notification service. Check your connection and try again." };
    console.error(error);
    return { ok: false, error: "Couldn't turn notifications on here. Try again, or reopen the app." };
  }
}

export async function disablePush() {
  store(ON_KEY, null);
  store(OFF_KEY, "1");
  try {
    const sub = await (await registerServiceWorker()).pushManager.getSubscription();
    if (sub) {
      await removePushSubscription(sub.endpoint);
      await sub.unsubscribe();
    }
  } catch {}
}

/**
 * On every visit: registers the service worker and re-confirms this device
 * with the server (browsers rotate subscriptions, and someone else may have
 * signed in on it). Someone who already allowed notifications here is
 * subscribed without being asked again — unless they turned them off.
 */
export async function syncPush() {
  if (!pushSupported()) return;
  try {
    await registerServiceWorker();
    if (Notification.permission !== "granted" || read(OFF_KEY) === "1") {
      store(ON_KEY, null);
      return;
    }
    const result = await subscribe();
    if (!result.ok) store(ON_KEY, null);
  } catch {
    store(ON_KEY, null);
  }
}

/** Clears a call's notification from this device once it's answered or dismissed here. */
export async function clearCallNotification(callId: string) {
  if (!pushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const list = (await reg?.getNotifications({ tag: `call-${callId}` })) ?? [];
    for (const n of list) n.close();
  } catch {}
}
