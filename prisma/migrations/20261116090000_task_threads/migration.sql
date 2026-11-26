-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "threadId" TEXT;

-- CreateIndex
CREATE INDEX "Task_threadId_idx" ON "Task"("threadId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
