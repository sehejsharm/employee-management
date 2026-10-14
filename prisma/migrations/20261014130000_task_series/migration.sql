-- CreateEnum
CREATE TYPE "RepeatFrequency" AS ENUM ('DAILY', 'WEEKDAYS', 'WEEKLY');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "seriesId" TEXT,
ADD COLUMN     "seriesIndex" INTEGER;

-- CreateTable
CREATE TABLE "TaskSeries" (
    "id" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "assigneeIds" TEXT[],
    "leadId" TEXT NOT NULL,
    "checklist" TEXT[],
    "attachments" JSONB,
    "frequency" "RepeatFrequency" NOT NULL,
    "total" INTEGER NOT NULL,
    "created" INTEGER NOT NULL DEFAULT 0,
    "nextDueAt" TIMESTAMP(3),
    "timeZone" TEXT NOT NULL,
    "stoppedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskSeries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskSeries_nextDueAt_idx" ON "TaskSeries"("nextDueAt");

-- CreateIndex
CREATE INDEX "Task_seriesId_idx" ON "Task"("seriesId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "TaskSeries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskSeries" ADD CONSTRAINT "TaskSeries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

