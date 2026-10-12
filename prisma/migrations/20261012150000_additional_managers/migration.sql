-- Someone can report to more than one person: their main manager plus any additional ones.
CREATE TABLE "AdditionalManager" (
    "userId" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdditionalManager_pkey" PRIMARY KEY ("userId","managerId")
);

CREATE INDEX "AdditionalManager_managerId_idx" ON "AdditionalManager"("managerId");

ALTER TABLE "AdditionalManager" ADD CONSTRAINT "AdditionalManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdditionalManager" ADD CONSTRAINT "AdditionalManager_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
