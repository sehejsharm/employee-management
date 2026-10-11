-- CreateEnum
CREATE TYPE "AssigneeRole" AS ENUM ('LEAD', 'FOLLOWER');

-- CreateEnum
CREATE TYPE "SubmissionStatus" AS ENUM ('SUBMITTED', 'ACCEPTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "ClearanceRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'WITHDRAWN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityKind" ADD VALUE 'LEAD_CHANGED';
ALTER TYPE "ActivityKind" ADD VALUE 'WORK_SUBMITTED';
ALTER TYPE "ActivityKind" ADD VALUE 'WORK_ACCEPTED';
ALTER TYPE "ActivityKind" ADD VALUE 'CHANGES_REQUESTED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'WORK_SUBMITTED';
ALTER TYPE "NotificationKind" ADD VALUE 'WORK_REVIEWED';
ALTER TYPE "NotificationKind" ADD VALUE 'CLEARANCE';

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "submissionId" TEXT;

-- AlterTable
ALTER TABLE "TaskAssignee" ADD COLUMN     "role" "AssigneeRole" NOT NULL DEFAULT 'FOLLOWER';

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "submittedById" TEXT NOT NULL,
    "summary" TEXT,
    "status" "SubmissionStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Clearance" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "grantedById" TEXT NOT NULL,
    "note" TEXT,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Clearance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClearanceRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ClearanceRequestStatus" NOT NULL DEFAULT 'PENDING',
    "subjectConsent" BOOLEAN,
    "subjectAnsweredAt" TIMESTAMP(3),
    "founderApproved" BOOLEAN,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "clearanceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClearanceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Submission_taskId_createdAt_idx" ON "Submission"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "Clearance_viewerId_revokedAt_idx" ON "Clearance"("viewerId", "revokedAt");

-- CreateIndex
CREATE INDEX "Clearance_subjectId_revokedAt_idx" ON "Clearance"("subjectId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClearanceRequest_clearanceId_key" ON "ClearanceRequest"("clearanceId");

-- CreateIndex
CREATE INDEX "ClearanceRequest_subjectId_status_idx" ON "ClearanceRequest"("subjectId", "status");

-- CreateIndex
CREATE INDEX "ClearanceRequest_requesterId_status_idx" ON "ClearanceRequest"("requesterId", "status");

-- CreateIndex
CREATE INDEX "ClearanceRequest_status_idx" ON "ClearanceRequest"("status");

-- CreateIndex
CREATE INDEX "Attachment_submissionId_idx" ON "Attachment"("submissionId");

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "Submission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clearance" ADD CONSTRAINT "Clearance_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clearance" ADD CONSTRAINT "Clearance_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Clearance" ADD CONSTRAINT "Clearance_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceRequest" ADD CONSTRAINT "ClearanceRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceRequest" ADD CONSTRAINT "ClearanceRequest_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceRequest" ADD CONSTRAINT "ClearanceRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClearanceRequest" ADD CONSTRAINT "ClearanceRequest_clearanceId_fkey" FOREIGN KEY ("clearanceId") REFERENCES "Clearance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing tasks: whoever was assigned first leads; everyone else follows.
UPDATE "TaskAssignee" AS ta
SET "role" = 'LEAD'
FROM (
  SELECT DISTINCT ON ("taskId") "taskId", "userId"
  FROM "TaskAssignee"
  ORDER BY "taskId", "assignedAt", "userId"
) AS first
WHERE ta."taskId" = first."taskId" AND ta."userId" = first."userId";

-- Keep Supabase's public Data API away from the new tables too (no-op elsewhere).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON "Submission", "Clearance", "ClearanceRequest" FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON "Submission", "Clearance", "ClearanceRequest" FROM authenticated';
  END IF;
END $$;
