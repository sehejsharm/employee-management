import "server-only";
import { gzipSync } from "node:zlib";
import { db } from "@/lib/db";
import { cloudStorageConfigured, deleteObject, putObject } from "@/lib/storage";

/**
 * Daily database backups to Cloudflare R2, outside the database provider, so a
 * paused or lost database never takes the data with it.
 *
 * Each backup is one gzipped JSON file, backups/database/YYYY-MM-DD.json.gz:
 * every table in the public schema, row by row, exactly as Postgres stores it
 * (timestamps, enums, arrays, JSON and file bytes all round-trip through
 * json_populate_recordset). scripts/restore-backup.mjs loads one into an empty
 * database that has had `prisma migrate deploy`.
 */

export const BACKUP_PREFIX = "backups/database/";
const KEEP_DAYS = 30;

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Every table as JSON text, plus the migrations it was taken at. */
export async function exportDatabase() {
  const tables = await db.$queryRawUnsafe<{ name: string }[]>(
    `select tablename as name from pg_tables where schemaname = 'public' and tablename <> '_prisma_migrations' order by tablename`,
  );
  const migrations = await db.$queryRawUnsafe<{ name: string }[]>(
    `select migration_name as name from _prisma_migrations where finished_at is not null and rolled_back_at is null order by migration_name`,
  );
  const counts: Record<string, number> = {};
  const parts: string[] = [];
  for (const { name } of tables) {
    const quoted = `"${name.replace(/"/g, '""')}"`;
    const [row] = await db.$queryRawUnsafe<{ rows: string; n: number }[]>(
      `select coalesce(json_agg(t), '[]'::json)::text as rows, count(*)::int as n from ${quoted} t`,
    );
    counts[name] = row.n;
    parts.push(`${JSON.stringify(name)}:${row.rows}`);
  }
  const json = `{"format":"focus-realm-backup/1","createdAt":${JSON.stringify(new Date().toISOString())},"migrations":${JSON.stringify(
    migrations.map((m) => m.name),
  )},"counts":${JSON.stringify(counts)},"tables":{${parts.join(",")}}}`;
  return { json, counts };
}

/** Takes today's backup, uploads it to R2 and drops the one from 30 days ago. */
export async function backupDatabaseToCloud(now = new Date()) {
  if (!cloudStorageConfigured()) return { ok: false as const, error: "Cloudflare R2 isn't set up, so there's nowhere to keep backups." };
  const { json, counts } = await exportDatabase();
  const bytes = gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  const key = `${BACKUP_PREFIX}${day(now)}.json.gz`;
  await putObject(key, bytes, "application/gzip");
  const old = new Date(now.getTime() - KEEP_DAYS * 86_400_000);
  await deleteObject(`${BACKUP_PREFIX}${day(old)}.json.gz`).catch((e) => console.error("Couldn't remove an old backup", e));
  const rows = Object.values(counts).reduce((a, b) => a + b, 0);
  return { ok: true as const, key, bytes: bytes.length, tables: Object.keys(counts).length, rows };
}
