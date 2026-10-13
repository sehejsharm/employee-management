-- CreateEnum
CREATE TYPE "WorkReportReason" AS ENUM ('LAST_DAY', 'OFFBOARDED', 'MANUAL');

-- AlterEnum
ALTER TYPE "ActivityKind" ADD VALUE 'MERGED';

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "mergedIntoId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastDay" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WorkReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "WorkReportReason" NOT NULL,
    "generatedById" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkReport_userId_createdAt_idx" ON "WorkReport"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_mergedIntoId_fkey" FOREIGN KEY ("mergedIntoId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkReport" ADD CONSTRAINT "WorkReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

