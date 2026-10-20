-- AlterEnum
ALTER TYPE "DrawType" ADD VALUE 'HYBRID_ROUND_ROBIN_KNOCKOUT';

-- AlterTable
ALTER TABLE "TournamentEvent" DROP COLUMN "allowOtherGender",
ADD COLUMN     "knockoutSize" INTEGER,
ADD COLUMN     "matchesPerEntry" INTEGER;

