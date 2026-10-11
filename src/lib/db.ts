import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool, type PoolConfig } from "pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * The runtime (pooled) connection string: ours first, then the names the Neon
 * and Supabase Vercel Marketplace integrations inject, so attaching a database
 * in Vercel → Storage works without renaming anything.
 */
export function databaseUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || "";
}

export function isDatabaseConfigured() {
  return databaseUrl() !== "";
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super(
      "No database is configured. Set DATABASE_URL in .env (local), or connect a Neon or Supabase database in Vercel → Storage and redeploy.",
    );
    this.name = "DatabaseNotConfiguredError";
  }
}

/**
 * node-postgres options for a connection string.
 *
 * TLS: node-postgres treats `sslmode=require` as full certificate verification,
 * which fails against Supabase (its certificates chain to Supabase's own CA).
 * Supabase connections therefore get libpq's meaning of `require` — encrypted,
 * CA not checked — unless DATABASE_CA_CERT holds the provider's root CA, in
 * which case the certificate is verified against it. The URL's sslmode would
 * override an explicit `ssl` option, so it is removed whenever we supply one.
 *
 * Pool: small and fail-fast for serverless — a paused or unreachable database
 * errors after 10 seconds instead of hanging the request.
 */
export function poolConfig(connectionString: string): PoolConfig {
  const max = Number(process.env.DATABASE_POOL_MAX);
  const limits = {
    max: Number.isInteger(max) && max > 0 ? max : 5,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 10_000,
  };

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    return { connectionString, ...limits };
  }

  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  const mode = url.searchParams.get("sslmode");
  let ssl: PoolConfig["ssl"] | undefined;
  if (ca) ssl = { ca };
  else if (
    /\.supabase\.(co|com)$/i.test(url.hostname) &&
    // Only when the URL didn't ask for verification itself (verify-ca/verify-full or its own root cert).
    !url.searchParams.has("sslrootcert") &&
    mode !== "verify-ca" &&
    mode !== "verify-full"
  ) {
    ssl = { rejectUnauthorized: false };
  }
  if (!ssl) return { connectionString, ...limits };

  url.searchParams.delete("sslmode");
  url.searchParams.delete("sslrootcert");
  return { connectionString: url.toString(), ssl, ...limits };
}

function createClient() {
  const url = databaseUrl();
  if (!url) throw new DatabaseNotConfiguredError();
  const pool = new Pool(poolConfig(url));
  // On Vercel (Fluid compute) idle connections are closed before the instance suspends; a no-op anywhere else.
  attachDatabasePool(pool);
  // disposeExternalPool: `$disconnect()` closes the pool, so CLI scripts exit promptly.
  return new PrismaClient({ adapter: new PrismaPg(pool, { disposeExternalPool: true }) });
}

/**
 * One Prisma client per process, created on first use — never at import.
 * `next build` imports every route and page to read its config, so creating
 * the client eagerly would fail the build whenever no database is configured
 * (as on a fresh Vercel project). Parked on globalThis so dev hot reloads share
 * one pool. Not server-only, so CLI scripts (scripts/, prisma/seed.ts) can use it.
 */
const globalForPrisma = globalThis as unknown as { __frPrisma?: PrismaClient };

export const db: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    // Inspection probes (`await db`, util.inspect, Symbol.toStringTag) must not open a connection.
    if (prop === "then" || typeof prop === "symbol") return undefined;
    // CLI teardown (`.finally(() => db.$disconnect())`) is a no-op when nothing was ever opened.
    if (prop === "$disconnect" && !globalForPrisma.__frPrisma) return async () => {};
    const client = (globalForPrisma.__frPrisma ??= createClient());
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
