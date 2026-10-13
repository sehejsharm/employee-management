-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "pdf" BYTEA,
ADD COLUMN     "pdfName" TEXT,
ADD COLUMN     "pdfSize" INTEGER;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "mustCompleteProfile" BOOLEAN NOT NULL DEFAULT true;


-- Only people added from now on must complete their profile.
UPDATE "User" SET "mustCompleteProfile" = false;
