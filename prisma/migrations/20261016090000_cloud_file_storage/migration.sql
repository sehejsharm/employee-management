-- AlterTable
ALTER TABLE "Announcement" ADD COLUMN     "pdfKey" TEXT;

-- AlterTable
ALTER TABLE "FileBlob" ADD COLUMN     "storageKey" TEXT,
ALTER COLUMN "data" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "FileBlob_storageKey_key" ON "FileBlob"("storageKey");

