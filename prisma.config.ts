import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Migrations need a direct (non-pooled) connection. On Supabase/Neon set
    // DIRECT_URL to the direct string and DATABASE_URL to the pooled one.
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
});
