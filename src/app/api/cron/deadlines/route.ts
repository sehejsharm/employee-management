import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/env";
import { syncAllDeadlineAlerts } from "@/lib/notifications";

export const dynamic = "force-dynamic";

function authorised(request: NextRequest) {
  const secret = config.cronSecret();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Sweeps every open task and files due-soon / overdue reminders for everyone,
 * so people who aren't signed in still find them waiting. Idempotent — run it
 * as often as you like (Vercel Cron, GitHub Actions, any scheduler).
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  const created = await syncAllDeadlineAlerts();
  return NextResponse.json({ ok: true, created, at: new Date().toISOString() });
}
