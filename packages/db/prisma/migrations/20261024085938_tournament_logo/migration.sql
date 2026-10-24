-- CreateTable
CREATE TABLE "TournamentLogo" (
    "tournamentId" UUID NOT NULL,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TournamentLogo_pkey" PRIMARY KEY ("tournamentId")
);

-- AddForeignKey
ALTER TABLE "TournamentLogo" ADD CONSTRAINT "TournamentLogo_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

