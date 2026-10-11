-- CreateTable
CREATE TABLE "WorkVisibilityGrant" (
    "id" TEXT NOT NULL,
    "viewerId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkVisibilityGrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkVisibilityGrant_ownerId_idx" ON "WorkVisibilityGrant"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkVisibilityGrant_viewerId_ownerId_key" ON "WorkVisibilityGrant"("viewerId", "ownerId");

-- AddForeignKey
ALTER TABLE "WorkVisibilityGrant" ADD CONSTRAINT "WorkVisibilityGrant_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkVisibilityGrant" ADD CONSTRAINT "WorkVisibilityGrant_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkVisibilityGrant" ADD CONSTRAINT "WorkVisibilityGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
