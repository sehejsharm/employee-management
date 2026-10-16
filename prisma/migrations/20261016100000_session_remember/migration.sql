-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "remember" BOOLEAN NOT NULL DEFAULT false;


-- Existing sessions: "keep me signed in" ones last 30 days, the others 12 hours.
UPDATE "Session" SET "remember" = true WHERE "expiresAt" - "createdAt" > interval '1 day';
