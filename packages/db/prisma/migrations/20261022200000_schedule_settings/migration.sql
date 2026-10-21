-- Schedule settings (D56).
-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "dayEndTime" TEXT,
ADD COLUMN     "matchMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "restMinutes" INTEGER NOT NULL DEFAULT 20,
ADD COLUMN     "schedulePublishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TournamentEvent" ADD COLUMN     "restMinutes" INTEGER;

