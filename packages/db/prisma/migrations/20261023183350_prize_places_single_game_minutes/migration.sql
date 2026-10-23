-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "singleGameMinutes" INTEGER NOT NULL DEFAULT 15;

-- AlterTable
ALTER TABLE "TournamentEvent" ADD COLUMN     "prizePlaces" INTEGER NOT NULL DEFAULT 3;

