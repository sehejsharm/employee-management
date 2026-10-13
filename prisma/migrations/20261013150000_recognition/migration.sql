-- CreateEnum
CREATE TYPE "RecognitionKind" AS ENUM ('KUDOS', 'AWARD');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'RECOGNITION';

-- CreateTable
CREATE TABLE "Recognition" (
    "id" TEXT NOT NULL,
    "kind" "RecognitionKind" NOT NULL DEFAULT 'KUDOS',
    "badge" TEXT NOT NULL,
    "title" TEXT,
    "message" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "giverId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recognition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecognitionCheer" (
    "recognitionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecognitionCheer_pkey" PRIMARY KEY ("recognitionId","userId")
);

-- CreateIndex
CREATE INDEX "Recognition_createdAt_idx" ON "Recognition"("createdAt");

-- CreateIndex
CREATE INDEX "Recognition_recipientId_createdAt_idx" ON "Recognition"("recipientId", "createdAt");

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recognition" ADD CONSTRAINT "Recognition_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecognitionCheer" ADD CONSTRAINT "RecognitionCheer_recognitionId_fkey" FOREIGN KEY ("recognitionId") REFERENCES "Recognition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecognitionCheer" ADD CONSTRAINT "RecognitionCheer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

