import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { claimDeadlineSweep, syncDeadlineAlertsFor } from "@/lib/notifications";
import { notificationFeed } from "@/lib/notification-feed";
import { materializeTaskSeriesThrottled } from "@/lib/task-series";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  // At most once a minute per person; the poll itself stays cheap.
  if (claimDeadlineSweep(user.id)) {
    await syncDeadlineAlertsFor(user.id).catch((e) => console.error("deadline sweep failed", e));
    // Repeating tasks appear on time even between daily cron runs (Vercel Hobby runs cron once a day).
    await materializeTaskSeriesThrottled();
  }

  const feed = await notificationFeed(user.id);
  return NextResponse.json(feed, { headers: { "Cache-Control": "no-store" } });
}
