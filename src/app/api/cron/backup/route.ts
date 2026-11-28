import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { config } from "@/lib/env";
import { backupDatabaseToCloud } from "@/lib/backup";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(request: NextRequest) {
  const secret = config.cronSecret();
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The daily database backup to Cloudflare R2 (Vercel Cron; see vercel.json). */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false, error: "Unauthorised." }, { status: 401 });
  try {
    const result = await backupDatabaseToCloud();
    if (!result.ok) console.error("database backup skipped:", result.error);
    else console.log("database backup", result);
    return NextResponse.json(result, { status: result.ok ? 200 : 503 });
  } catch (e) {
    console.error("database backup failed", e);
    return NextResponse.json({ ok: false, error: "Backup failed; see the logs." }, { status: 500 });
  }
}
