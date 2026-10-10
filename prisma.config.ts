import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection. On Supabase/Neon set
    // DIRECT_URL to the direct string and DATABASE_URL to the pooled one.
    // Empty during `npm install` in CI/Docker, where only `prisma generate` runs
    // and no database is needed; migrate/seed fail loudly if it is still empty.
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || "",
  },
});
