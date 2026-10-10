import { NextResponse } from "next/server";
import { db, isDatabaseConfigured } from "@/lib/db";
import { config } from "@/lib/env";

export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

/**
 * Uptime probe and post-deploy check. Tells apart the three ways a fresh
 * deployment goes wrong — no database configured, database unreachable,
 * schema not migrated — and reports whether the optional integrations are
 * switched on. Never reveals a value, only presence.
 */
export async function GET() {
  const integrations = { cron: Boolean(config.cronSecret()), hr: Boolean(config.hrWebhookSecret()) };
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, database: "not-configured", integrations }, { status: 503, headers });
  }
  try {
    const [row] = await db.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('public."User"') IS NOT NULL AS ready`;
    if (!row?.ready) {
      return NextResponse.json({ ok: false, database: "up", schema: "not-migrated", integrations }, { status: 503, headers });
    }
    const setup = (await db.user.count({ where: { role: "FOUNDER" } })) > 0 ? "done" : "needs-founder";
    return NextResponse.json({ ok: true, database: "up", schema: "ready", setup, integrations }, { headers });
  } catch (error) {
    console.error("Health check: database unreachable", error);
    return NextResponse.json({ ok: false, database: "down", integrations }, { status: 503, headers });
  }
}
