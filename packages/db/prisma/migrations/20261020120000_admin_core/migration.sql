-- CreateEnum
CREATE TYPE "TournamentType" AS ENUM ('SELF', 'THIRD_PARTY');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DrawType" ADD VALUE 'DOUBLE_KNOCKOUT';
ALTER TYPE "DrawType" ADD VALUE 'SWISS';

-- AlterTable
ALTER TABLE "PlayerProfile" ADD COLUMN     "contactEmail" CITEXT;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "courtsAvailable" INTEGER,
ADD COLUMN     "dayStartTime" TEXT,
ADD COLUMN     "type" "TournamentType" NOT NULL DEFAULT 'SELF';

-- CreateTable
CREATE TABLE "OrganiserInvite" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "invitedById" UUID,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganiserInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrganiserInvite_email_acceptedAt_idx" ON "OrganiserInvite"("email", "acceptedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrganiserInvite_tournamentId_email_key" ON "OrganiserInvite"("tournamentId", "email");

-- CreateIndex
CREATE INDEX "PlayerProfile_contactEmail_idx" ON "PlayerProfile"("contactEmail");

-- AddForeignKey
ALTER TABLE "OrganiserInvite" ADD CONSTRAINT "OrganiserInvite_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

