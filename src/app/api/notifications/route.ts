import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { syncDeadlineAlertsFor } from "@/lib/notifications";
import { notificationFeed } from "@/lib/notification-feed";

export const dynamic = "force-dynamic";

/** Throttle deadline sweeps per person; the poll itself stays cheap. */
const lastSweep = new Map<string, number>();

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const now = Date.now();
  if ((lastSweep.get(user.id) ?? 0) < now - 60_000) {
    lastSweep.set(user.id, now);
    await syncDeadlineAlertsFor(user.id).catch((e) => console.error("deadline sweep failed", e));
  }

  const feed = await notificationFeed(user.id);
  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
}
