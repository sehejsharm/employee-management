// Restores a database backup (backups/database/YYYY-MM-DD.json.gz from R2)
// into an EMPTY database that already has the schema:
//
//   DATABASE_URL=<new database> npx prisma migrate deploy
//   DATABASE_URL=<new database> node scripts/restore-backup.mjs 2026-12-01.json.gz
//
// It refuses to write into a database that already has data. Rows go in table
// by table in foreign-key order; optional links (a task's thread, a person's
// manager, …) are filled in afterwards, so circular links restore too.
// Counters (task numbers) carry on from the highest restored value.
//
// Plain .mjs so it runs with nothing but `node`.
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import pg from "pg";

const file = process.argv[2];
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!file || !url) {
  console.error("Usage: DATABASE_URL=<empty, migrated database> node scripts/restore-backup.mjs <backup.json.gz>");
  process.exit(1);
}

const raw = readFileSync(file);
const backup = JSON.parse((file.endsWith(".gz") ? gunzipSync(raw) : raw).toString("utf8"));
if (backup.format !== "focus-realm-backup/1") throw new Error("Not a Focus Realm backup file.");

// TLS for anything but a local database, verified against the system's CAs
// (Neon) or DATABASE_CA_CERT (Supabase's own root, from its dashboard).
const local = /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
const ssl = local ? undefined : ca ? { ca } : true;
const client = new pg.Client({ connectionString: url.replace(/[?&]sslmode=[^&]*/, ""), ssl });
await client.connect();
const q = (text, values) => client.query(text, values);
const ident = (s) => `"${s.replace(/"/g, '""')}"`;

// The target must be migrated to the same schema and hold no data.
const { rows: applied } = await q(`select migration_name from _prisma_migrations where finished_at is not null and rolled_back_at is null`);
const have = new Set(applied.map((r) => r.migration_name));
const missing = backup.migrations.filter((m) => !have.has(m));
if (missing.length) throw new Error(`Run \`prisma migrate deploy\` on the target first; it lacks: ${missing.join(", ")}`);
const tables = Object.keys(backup.tables);
for (const t of tables) {
  const { rows } = await q(`select exists(select 1 from ${ident(t)}) as some`);
  if (rows[0].some) throw new Error(`Table ${t} already has rows; restore only into an empty database.`);
}

// Foreign keys: required links decide the order; optional ones are set in a second pass.
const { rows: fks } = await q(`
  select c.conrelid::regclass::text as tbl, c.confrelid::regclass::text as ref,
         array_agg(a.attname::text order by a.attnum) as cols, bool_and(a.attnotnull) as required
  from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
  where c.contype = 'f' and c.connamespace = 'public'::regnamespace
  group by c.oid, c.conrelid, c.confrelid`);
const unq = (s) => s.replace(/^"|"$/g, "");
const later = new Map(); // table -> columns to fill in afterwards
const needs = new Map(tables.map((t) => [t, new Set()]));
for (const fk of fks) {
  const tbl = unq(fk.tbl);
  const ref = unq(fk.ref);
  if (!needs.has(tbl)) continue;
  if (fk.required && ref !== tbl) needs.get(tbl).add(ref);
  else later.set(tbl, [...(later.get(tbl) ?? []), ...fk.cols]);
}
const order = [];
const done = new Set();
while (order.length < tables.length) {
  const next = tables.find((t) => !done.has(t) && [...needs.get(t)].every((r) => done.has(r) || !needs.has(r)));
  if (!next) throw new Error("Couldn't order tables (a cycle of required links).");
  order.push(next);
  done.add(next);
}

const { rows: pks } = await q(`
  select i.indrelid::regclass::text as tbl, array_agg(a.attname::text order by a.attnum) as cols
  from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
  where i.indisprimary and i.indrelid::regclass::text = any($1::text[]) group by i.indrelid`, [tables.map(ident)]);
const pkOf = new Map(pks.map((p) => [unq(p.tbl), p.cols]));

const BATCH = 500;
await q("begin");
try {
  for (const t of order) {
    const rows = backup.tables[t];
    const nullOut = later.get(t) ?? [];
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH).map((r) => (nullOut.length ? { ...r, ...Object.fromEntries(nullOut.map((c) => [c, null])) } : r));
      await q(`insert into ${ident(t)} select * from json_populate_recordset(null::${ident(t)}, $1::json)`, [JSON.stringify(chunk)]);
    }
    console.log(`${t}: ${rows.length}`);
  }
  for (const [t, cols] of later) {
    const pk = pkOf.get(t);
    if (!pk) throw new Error(`Table ${t} has no primary key to fill in its links.`);
    const set = [...new Set(cols)].map((c) => `${ident(c)} = v.${ident(c)}`).join(", ");
    const on = pk.map((c) => `${ident(t)}.${ident(c)} = v.${ident(c)}`).join(" and ");
    const rows = backup.tables[t];
    for (let i = 0; i < rows.length; i += BATCH) {
      await q(`update ${ident(t)} set ${set} from json_populate_recordset(null::${ident(t)}, $1::json) v where ${on}`, [JSON.stringify(rows.slice(i, i + BATCH))]);
    }
  }
  // Counters carry on from the restored values.
  const { rows: serials } = await q(`
    select table_name as t, column_name as c from information_schema.columns
    where table_schema = 'public' and column_default like 'nextval(%'`);
  for (const { t, c } of serials) {
    await q(`select setval(pg_get_serial_sequence($1, $2), greatest(coalesce((select max(${ident(c)}) from ${ident(t)}), 0), 1), (select count(*) > 0 from ${ident(t)}))`, [ident(t), c]);
  }
  await q("commit");
} catch (e) {
  await q("rollback");
  throw e;
} finally {
  await client.end();
}
console.log(`Restored ${backup.createdAt} backup: ${Object.values(backup.counts).reduce((a, b) => a + b, 0)} rows in ${tables.length} tables.`);
