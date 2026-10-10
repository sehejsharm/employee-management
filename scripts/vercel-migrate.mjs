// Applies database migrations during Vercel production builds (`npm run vercel-build`).
//
// - No database configured yet: skipped, so the build still succeeds.
// - Preview builds: skipped, because previews usually share the production
//   database. Set MIGRATE_ON_PREVIEW=true if each preview has its own (e.g. Neon branches).
// - A migration that fails fails the build, so the live deployment keeps
//   serving instead of new code running against an old schema.
//
// Plain .mjs so it runs before `next build` without TypeScript.
import { spawnSync } from "node:child_process";

const target = process.env.VERCEL_ENV; // production | preview | development | undefined (not on Vercel)
const url =
  process.env.DIRECT_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL;

if (!target) {
  console.log("[migrate] Not a Vercel build: skipping. Use `npm run db:deploy` to migrate by hand.");
  process.exit(0);
}
if (target !== "production" && process.env.MIGRATE_ON_PREVIEW !== "true") {
  console.log(`[migrate] ${target} build: skipping (previews usually share the production database).`);
  process.exit(0);
}
if (!url) {
  console.warn(
    "[migrate] No database configured: skipping. Connect a database in Vercel → Storage (or set DATABASE_URL), then redeploy.",
  );
  process.exit(0);
}

console.log("[migrate] Applying database migrations…");
const run = spawnSync("prisma", ["migrate", "deploy"], { stdio: "inherit", shell: process.platform === "win32" });
if (run.status !== 0) {
  console.error(
    [
      "[migrate] Migrations failed, so this deployment was stopped and the previous one keeps serving.",
      "  • Check the database is running (free Supabase projects pause after a week of inactivity).",
      "  • Migrations need a direct or session connection, not the transaction pooler (port 6543).",
      "    On Supabase, set DIRECT_URL to the Session pooler string (Project → Connect → Session pooler, port 5432).",
    ].join("\n"),
  );
  process.exit(run.status ?? 1);
}
