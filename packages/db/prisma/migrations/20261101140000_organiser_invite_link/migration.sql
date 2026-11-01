-- AlterTable
ALTER TABLE "OrganiserInvite" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "tokenHash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "OrganiserInvite_tokenHash_key" ON "OrganiserInvite"("tokenHash");

