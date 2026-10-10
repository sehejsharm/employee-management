import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db, isDatabaseConfigured } from "@/lib/db";

/**
 * Where a deployment is in its first run. Everything but "ready" means nobody
 * can sign in yet, and the sign-in page explains what's missing instead.
 */
export type WorkspaceStatus = "no-database" | "unreachable" | "not-migrated" | "needs-founder" | "ready";

// Once a founder exists the workspace stays ready, so stop asking the database on every visit.
let knownReady = false;

export async function workspaceStatus(): Promise<WorkspaceStatus> {
  if (knownReady) return "ready";
  if (!isDatabaseConfigured()) return "no-database";
  try {
    const [row] = await db.$queryRaw<{ ready: boolean }[]>`SELECT to_regclass('public."User"') IS NOT NULL AS ready`;
    if (!row?.ready) return "not-migrated";
    const founders = await db.user.count({ where: { role: "FOUNDER" } });
    if (!founders) return "needs-founder";
    knownReady = true;
    return "ready";
  } catch (error) {
    console.error("Workspace status: database unreachable", error);
    return "unreachable";
  }
}

/** First-run setup is offered only while SETUP_TOKEN holds a long random value. */
export function setupTokenConfigured() {
  return (process.env.SETUP_TOKEN?.trim().length ?? 0) >= 24;
}

export function setupTokenMatches(candidate: string) {
  const expected = process.env.SETUP_TOKEN?.trim() ?? "";
  if (expected.length < 24) return false;
  const a = Buffer.from(candidate.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Serialises concurrent setup attempts so exactly one first founder can ever be created. */
export const SETUP_LOCK_KEY = 0x46_52_53_45; // "FRSE"
