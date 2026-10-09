import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/**
 * One Prisma client per process. In development, Next.js re-evaluates modules
 * on every edit, so the client is parked on globalThis to avoid exhausting the
 * connection pool. Not marked server-only so CLI scripts can share it — Prisma
 * cannot be bundled for the browser regardless.
 */
const globalForPrisma = globalThis as unknown as { __frPrisma?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in.");
  }
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.__frPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.__frPrisma = db;
