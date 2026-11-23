-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'TOURNAMENT', 'WEBSITE', 'PRIVATE', 'REJECTED');

-- CreateTable
CREATE TABLE "TournamentFeedback" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT NOT NULL,
    "shareConsent" BOOLEAN NOT NULL DEFAULT false,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "moderatedAt" TIMESTAMP(3),
    "moderatedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TournamentFeedback_status_idx" ON "TournamentFeedback"("status");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentFeedback_tournamentId_playerId_key" ON "TournamentFeedback"("tournamentId", "playerId");

-- AddForeignKey
ALTER TABLE "TournamentFeedback" ADD CONSTRAINT "TournamentFeedback_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TournamentFeedback" ADD CONSTRAINT "TournamentFeedback_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

