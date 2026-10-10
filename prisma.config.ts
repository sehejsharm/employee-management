import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection. Ours first, then the
    // names the Neon (DATABASE_URL_UNPOOLED) and Supabase (POSTGRES_URL_NON_POOLING)
    // Vercel integrations inject, then the pooled URL as a last resort.
    // Empty during `npm install` in CI/Docker/Vercel, where only `prisma generate`
    // runs and no database is needed; migrate/seed fail loudly if it is still empty.
    url:
      process.env.DIRECT_URL ||
      process.env.DATABASE_URL_UNPOOLED ||
      process.env.POSTGRES_URL_NON_POOLING ||
      process.env.DATABASE_URL ||
      process.env.POSTGRES_URL ||
      "",
  },
});
