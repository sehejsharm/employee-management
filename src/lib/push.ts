import "server-only";
import { createHash } from "node:crypto";
import { after } from "next/server";
import webpush, { WebPushError } from "web-push";
import { db } from "@/lib/db";
import { config } from "@/lib/env";
import { openToken, sealToken } from "@/lib/google/crypto";

/**
 * Phone notifications (Web Push). Android phones get them from Chrome — in the
 * browser or the installed app; iPhones and iPads once the Workspace is added
 * to the home screen (iOS 16.4+). Free: the push services (Google, Apple,
 * Mozilla) deliver them at no cost.
 *
 * The signing keys (VAPID) come from VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY when
 * set; otherwise the app makes a pair once and keeps it, encrypted, in the
 * database, so this works with no setup.
 */

type Keys = { publicKey: string; privateKey: string };

const SECRET_NAME = "vapid";
let keys: Promise<Keys> | null = null;

async function loadKeys(): Promise<Keys> {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (publicKey && privateKey) return { publicKey, privateKey };

  const row = await db.appSecret.findUnique({ where: { name: SECRET_NAME } });
  if (row) {
    try {
      return JSON.parse(openToken(row.value)) as Keys;
    } catch {
      // The encryption key changed, so the stored pair can't be read. Start
      // again: subscriptions made with the old pair can't be used any more.
      console.error("Stored push keys could not be read; making new ones. Everyone will need to turn phone notifications on again.");
      await db.$transaction([db.appSecret.deleteMany({ where: { name: SECRET_NAME } }), db.pushSubscription.deleteMany({})]);
    }
  }
  const fresh = webpush.generateVAPIDKeys();
  // Two servers starting at once both try; the first one wins and both use it.
  await db.appSecret.createMany({ data: [{ name: SECRET_NAME, value: sealToken(JSON.stringify(fresh)) }], skipDuplicates: true });
  const saved = await db.appSecret.findUniqueOrThrow({ where: { name: SECRET_NAME } });
  return JSON.parse(openToken(saved.value)) as Keys;
}

function vapidKeys() {
  keys ??= loadKeys().catch((error) => {
    keys = null;
    throw error;
  });
  return keys;
}

/** The key browsers need to subscribe. */
export async function pushPublicKey() {
  return (await vapidKeys()).publicKey;
}

/** Who push services should contact about this sender: an https address or a mailto. */
function subject() {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit) return explicit;
  const url = config.appUrl();
  if (url.startsWith("https://")) return url;
  const contact = process.env.PRIVACY_CONTACT_EMAIL?.trim();
  return `mailto:${contact || "admin@focusrealm.app"}`;
}

export interface PushMessage {
  /** "call" rings like a phone call; "missed" quietly replaces it; "notice" is everything else. */
  kind: "call" | "missed" | "notice";
  title: string;
  body?: string | null;
  /** Where tapping it goes: a path in the Workspace (or an https link). */
  url: string;
  /** Notifications with the same tag replace each other instead of piling up. */
  tag?: string;
  /** For calls: lets "Not now" on the notification tell the Workspace. */
  callId?: string;
}

const MAX_TEXT = 300;
const clip = (s: string | null | undefined) => (s && s.length > MAX_TEXT ? `${s.slice(0, MAX_TEXT - 1)}…` : (s ?? ""));

/** A push "topic" (≤ 32 URL-safe chars): a newer message with the same topic replaces one not yet delivered. */
function topicFor(tag: string) {
  return createHash("sha256").update(tag).digest("base64url").slice(0, 32);
}

/**
 * Sends one message to every device the given people turned notifications on
 * for. Devices that are gone (uninstalled, permission withdrawn) are forgotten.
 * Never throws.
 */
export async function sendPush(userIds: Iterable<string>, message: PushMessage, opts: { ttlSeconds?: number } = {}) {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return 0;
  try {
    const now = new Date();
    const subs = await db.pushSubscription.findMany({
      where: {
        userId: { in: ids },
        user: { status: { not: "INACTIVE" } },
        // Only devices still signed in: signing out (or the session expiring) stops notifications.
        OR: [{ sessionId: null }, { session: { expiresAt: { gt: now } } }],
      },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (subs.length === 0) return 0;

    const { publicKey, privateKey } = await vapidKeys();
    const call = message.kind === "call";
    const payload = JSON.stringify({
      kind: message.kind,
      title: clip(message.title),
      body: clip(message.body),
      url: message.url,
      tag: message.tag,
      callId: message.callId,
      sentAt: now.getTime(),
    });
    const options: webpush.RequestOptions = {
      vapidDetails: { subject: subject(), publicKey, privateKey },
      TTL: opts.ttlSeconds ?? (call ? 60 : 24 * 3600),
      urgency: call ? "high" : "normal",
      timeout: 8_000,
      ...(message.tag ? { topic: topicFor(message.tag) } : {}),
    };

    const gone: string[] = [];
    let delivered = 0;
    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, payload, options);
          delivered++;
        } catch (error) {
          // 404/410: the device unsubscribed or the app was removed. (A 403 is usually our
          // own setup — e.g. the VAPID subject — so those devices are kept.)
          if (error instanceof WebPushError && [404, 410].includes(error.statusCode)) gone.push(sub.id);
          else console.error("push failed", error instanceof WebPushError ? `${error.statusCode} ${error.body}` : error);
        }
      }),
    );
    if (gone.length) await db.pushSubscription.deleteMany({ where: { id: { in: gone } } });
    return delivered;
  } catch (error) {
    console.error("push failed", error);
    return 0;
  }
}

/**
 * Runs `task` after the response has gone out (so nobody waits on push
 * services), or straight away where that isn't possible (scripts, tests).
 */
export function inBackground(task: () => Promise<unknown>) {
  const run = () => task().catch((error) => console.error("background task failed", error));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** A notification in the Workspace, as a phone notification. */
export interface Notice {
  userId: string;
  title: string;
  body?: string | null;
  href?: string | null;
}

/**
 * Pushes freshly created Workspace notifications to phones. Several for one
 * person at once (e.g. deadline reminders) become one summary instead of a
 * burst of buzzes.
 */
export async function pushNotices(notices: Notice[]) {
  const byUser = new Map<string, Notice[]>();
  for (const n of notices) byUser.set(n.userId, [...(byUser.get(n.userId) ?? []), n]);
  await Promise.all(
    [...byUser].map(([userId, list]) =>
      list.length === 1
        ? sendPush([userId], { kind: "notice", title: list[0].title, body: list[0].body, url: safeHref(list[0].href) })
        : sendPush([userId], {
            kind: "notice",
            title: `${list.length} new notifications`,
            body: list.map((n) => n.title).join(" · "),
            url: "/notifications",
            tag: "summary",
          }),
    ),
  );
}

/** Only links inside the Workspace or to https sites (e.g. Google Meet) are opened from a notification. */
export function safeHref(href: string | null | undefined) {
  if (!href) return "/notifications";
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return /^https:\/\//i.test(href) ? href : "/notifications";
}
