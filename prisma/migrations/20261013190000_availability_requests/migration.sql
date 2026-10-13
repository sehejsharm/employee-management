-- CreateEnum
CREATE TYPE "AvailabilityRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- CreateTable
CREATE TABLE "AvailabilityRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "founderId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "meetings" INTEGER NOT NULL,
    "slotMinutes" INTEGER NOT NULL,
    "status" "AvailabilityRequestStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "decidedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityRequest_founderId_status_idx" ON "AvailabilityRequest"("founderId", "status");

-- CreateIndex
CREATE INDEX "AvailabilityRequest_requesterId_founderId_idx" ON "AvailabilityRequest"("requesterId", "founderId");

-- AddForeignKey
ALTER TABLE "AvailabilityRequest" ADD CONSTRAINT "AvailabilityRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRequest" ADD CONSTRAINT "AvailabilityRequest_founderId_fkey" FOREIGN KEY ("founderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

