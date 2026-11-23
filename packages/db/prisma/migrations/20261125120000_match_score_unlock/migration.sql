-- AlterTable
ALTER TABLE "Match" DROP COLUMN "autoLockWaived",
ADD COLUMN "scoreUnlockedAt" TIMESTAMP(3);
