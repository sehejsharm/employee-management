-- Emails changed in the Workspace by a founder or manager aren't overwritten by HR console updates.
ALTER TABLE "User" ADD COLUMN "emailSetManuallyAt" TIMESTAMP(3);
