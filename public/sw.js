/*
 * Focus Realm Workspace — service worker.
 *
 * Only shows notifications (it caches nothing): "Meet now" calls ring like a
 * phone call, everything else arrives as a normal notification. Sent by the
 * server through Web Push (src/lib/push.ts).
 */

// A phone-call rhythm for Android (iPhones use their own notification alert).
const CALL_VIBRATION = [900, 400, 900, 400, 900, 1400, 900, 400, 900];

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Focus Realm Workspace";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    timestamp: data.sentAt || Date.now(),
    data: { url: data.url || "/notifications", kind: data.kind || "notice", callId: data.callId || null },
  };
  if (data.tag) options.tag = data.tag;

  if (data.kind === "call") {
    // Stays on screen, sounds and vibrates again on every ring, and offers Join / Not now.
    options.requireInteraction = true;
    options.renotify = true;
    options.vibrate = CALL_VIBRATION;
    options.actions = [
      { action: "join", title: "Join" },
      { action: "decline", title: "Not now" },
    ];
  } else if (data.kind === "missed") {
    // Quietly takes the ringing notification's place.
    options.renotify = false;
  }

  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, options);
      if (data.kind === "call") {
        // An open Workspace window starts ringing straight away instead of at its next check.
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const w of windows) w.postMessage({ type: "incoming-call", callId: data.callId });
      }
    })(),
  );
});

async function answer(callId, value) {
  try {
    await fetch(`/api/calls/${encodeURIComponent(callId)}/answer`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: value }),
    });
  } catch {
    // Offline: the call simply keeps ringing elsewhere until it times out.
  }
}

async function open(url) {
  const target = new URL(url, self.location.origin);
  // A Workspace page: reuse an open Workspace window when there is one. (Calls
  // always open fresh, so the call page can hand over to Google Meet.)
  if (target.origin === self.location.origin && !target.pathname.startsWith("/calls/")) {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of windows) {
      if (new URL(w.url).origin !== target.origin) continue;
      await w.focus();
      if ("navigate" in w) await w.navigate(target.href).catch(() => {});
      return;
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(target.href);
}

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const { url, callId } = notification.data || {};
  notification.close();

  if (event.action === "decline" && callId) {
    event.waitUntil(answer(callId, "declined"));
    return;
  }
  // Tapping a call (or "Join") opens /calls/<id>/join, which marks it answered and goes to Google Meet.
  event.waitUntil(open(url || "/notifications"));
});
