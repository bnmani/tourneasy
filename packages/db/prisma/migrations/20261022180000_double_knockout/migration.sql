-- Double knockout (D55): bracket per match and where the loser goes.
-- AlterTable
ALTER TABLE "Match" ADD COLUMN     "bracket" CHAR(1) NOT NULL DEFAULT 'W',
ADD COLUMN     "loserNextMatchId" UUID,
ADD COLUMN     "loserNextMatchSlot" CHAR(1);

-- AddForeignKey
ALTER TABLE "Match" ADD CONSTRAINT "Match_loserNextMatchId_fkey" FOREIGN KEY ("loserNextMatchId") REFERENCES "Match"("id") ON DELETE SET NULL ON UPDATE CASCADE;

