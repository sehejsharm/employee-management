-- Several employees can share one mailbox: email is no longer a login ID or unique.
DROP INDEX "User_email_key";
CREATE INDEX "User_email_idx" ON "User"("email");

-- The once-a-day "what's due" summary.
ALTER TYPE "NotificationKind" ADD VALUE 'DAILY_BRIEFING';
