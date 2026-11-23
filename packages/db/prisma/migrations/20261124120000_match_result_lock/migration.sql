-- AlterTable
ALTER TABLE "Match" ADD COLUMN "lockedAt" TIMESTAMP(3),
ADD COLUMN "lockedById" UUID,
ADD COLUMN "autoLockWaived" BOOLEAN NOT NULL DEFAULT false;
