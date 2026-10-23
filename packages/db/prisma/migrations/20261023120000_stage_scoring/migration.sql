-- Different scoring for the knockout stage or the last rounds (D61).
-- AlterTable
ALTER TABLE "TournamentEvent" ADD COLUMN     "koBestOf" INTEGER,
ADD COLUMN     "koPointsCap" INTEGER,
ADD COLUMN     "koPointsToWin" INTEGER,
ADD COLUMN     "koScoringFrom" TEXT;

