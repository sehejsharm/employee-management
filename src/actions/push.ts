"use server";

import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth/current-user";
import { currentSessionTokenHash } from "@/lib/auth/session";
import { pushPublicKey, sendPush } from "@/lib/push";
import type { ActionResult } from "@/lib/utils";

/** The push services browsers use. Anything else is refused, so the server never posts to an arbitrary address. */
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/];

const MAX_DEVICES = 10;

const subscriptionSchema = z.object({
  endpoint: z
    .string()
    .max(2048)
    .refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
      } catch {
        return false;
      }
    }, "This browser's notification service isn't supported."),
  keys: z.object({
    p256dh: z.string().regex(/^[A-Za-z0-9_-]+=*$/).max(200),
    auth: z.string().regex(/^[A-Za-z0-9_-]+=*$/).max(100),
  }),
});

/** The key a browser needs to turn notifications on. */
export async function getPushKey(): Promise<ActionResult<{ publicKey: string }>> {
  await requireUser();
  try {
    return { ok: true, data: { publicKey: await pushPublicKey() } };
  } catch (error) {
    console.error("push key unavailable", error);
    return { ok: false, error: "Phone notifications aren't available right now. Try again in a minute." };
  }
}

/**
 * Remembers this device so notifications reach it. Called when someone turns
 * them on, and quietly on every visit to keep the details fresh (browsers
 * rotate them) and tied to whoever is signed in on the device now.
 */
export async function savePushSubscription(input: unknown): Promise<ActionResult<{ devices: number }>> {
  const user = await requireUser();
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const { endpoint, keys } = parsed.data;

  const tokenHash = await currentSessionTokenHash();
  const session = tokenHash ? await db.session.findUnique({ where: { tokenHash }, select: { id: true, device: true } }) : null;
  const data = { userId: user.id, sessionId: session?.id ?? null, device: session?.device ?? null, p256dh: keys.p256dh, auth: keys.auth, lastSeenAt: new Date() };
  try {
    await db.pushSubscription.upsert({ where: { endpoint }, create: { endpoint, ...data }, update: data });
  } catch (error) {
    // Saved at the same moment by another tab (or the page load): just update it.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
    await db.pushSubscription.update({ where: { endpoint }, data });
  }

  // Keep the newest few devices per person.
  const old = await db.pushSubscription.findMany({ where: { userId: user.id }, orderBy: { lastSeenAt: "desc" }, skip: MAX_DEVICES, select: { id: true } });
  if (old.length) await db.pushSubscription.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });

  const devices = await db.pushSubscription.count({ where: { userId: user.id } });
  return { ok: true, data: { devices } };
}

/** Stops notifications on this device. */
export async function removePushSubscription(endpoint: string): Promise<ActionResult> {
  const user = await requireUser();
  if (typeof endpoint !== "string" || endpoint.length > 2048) return { ok: false, error: "Unknown device." };
  await db.pushSubscription.deleteMany({ where: { endpoint, userId: user.id } });
  return { ok: true, message: "Notifications are off on this device." };
}

/** Sends a test notification to all of the signed-in person's devices. */
export async function sendTestPush(): Promise<ActionResult> {
  const user = await requireUser();
  const delivered = await sendPush([user.id], {
    kind: "notice",
    title: "Notifications are working",
    body: `Hi ${user.firstName} — this is how calls and updates will reach you.`,
    url: "/settings#notifications",
    tag: "test",
  });
  if (delivered === 0) return { ok: false, error: "Couldn't reach any of your devices. Turn notifications off and on again on this device." };
  return { ok: true, message: delivered === 1 ? "Sent — check your notifications." : `Sent to your ${delivered} devices.` };
}
