-- CreateEnum
CREATE TYPE "UmpireEventKind" AS ENUM ('POINT', 'UNDO');

-- CreateEnum
CREATE TYPE "UmpireSide" AS ENUM ('A', 'B');

-- CreateEnum
CREATE TYPE "TakeoverStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'TIMED_OUT');

-- CreateEnum
CREATE TYPE "DeskAlertStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterEnum
ALTER TYPE "MatchStatus" ADD VALUE 'AWAITING_DESK' BEFORE 'COMPLETED';

-- CreateTable
CREATE TABLE "Umpire" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "displayName" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "qrTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "deviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Umpire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UmpireEvent" (
    "id" UUID NOT NULL,
    "matchId" UUID NOT NULL,
    "courtId" UUID NOT NULL,
    "umpireId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "kind" "UmpireEventKind" NOT NULL,
    "side" "UmpireSide",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UmpireEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourtHold" (
    "courtId" UUID NOT NULL,
    "umpireId" UUID NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourtHold_pkey" PRIMARY KEY ("courtId")
);

-- CreateTable
CREATE TABLE "TakeoverRequest" (
    "id" UUID NOT NULL,
    "courtId" UUID NOT NULL,
    "fromUmpireId" UUID NOT NULL,
    "toUmpireId" UUID NOT NULL,
    "status" "TakeoverStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TakeoverRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeskAlert" (
    "id" UUID NOT NULL,
    "courtId" UUID NOT NULL,
    "takeoverRequestId" UUID NOT NULL,
    "status" "DeskAlertStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeskAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Umpire_tournamentId_idx" ON "Umpire"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "Umpire_qrTokenHash_key" ON "Umpire"("qrTokenHash");

-- CreateIndex
CREATE INDEX "UmpireEvent_umpireId_idx" ON "UmpireEvent"("umpireId");

-- CreateIndex
CREATE INDEX "UmpireEvent_courtId_idx" ON "UmpireEvent"("courtId");

-- CreateIndex
CREATE UNIQUE INDEX "UmpireEvent_matchId_seq_key" ON "UmpireEvent"("matchId", "seq");

-- CreateIndex
CREATE INDEX "CourtHold_umpireId_idx" ON "CourtHold"("umpireId");

-- CreateIndex
CREATE INDEX "TakeoverRequest_courtId_status_idx" ON "TakeoverRequest"("courtId", "status");

-- CreateIndex
CREATE INDEX "TakeoverRequest_fromUmpireId_idx" ON "TakeoverRequest"("fromUmpireId");

-- CreateIndex
CREATE INDEX "TakeoverRequest_toUmpireId_idx" ON "TakeoverRequest"("toUmpireId");

-- CreateIndex
CREATE UNIQUE INDEX "DeskAlert_takeoverRequestId_key" ON "DeskAlert"("takeoverRequestId");

-- CreateIndex
CREATE INDEX "DeskAlert_status_idx" ON "DeskAlert"("status");

-- CreateIndex
CREATE INDEX "DeskAlert_courtId_idx" ON "DeskAlert"("courtId");

-- AddForeignKey
ALTER TABLE "Umpire" ADD CONSTRAINT "Umpire_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UmpireEvent" ADD CONSTRAINT "UmpireEvent_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UmpireEvent" ADD CONSTRAINT "UmpireEvent_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UmpireEvent" ADD CONSTRAINT "UmpireEvent_umpireId_fkey" FOREIGN KEY ("umpireId") REFERENCES "Umpire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtHold" ADD CONSTRAINT "CourtHold_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourtHold" ADD CONSTRAINT "CourtHold_umpireId_fkey" FOREIGN KEY ("umpireId") REFERENCES "Umpire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TakeoverRequest" ADD CONSTRAINT "TakeoverRequest_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TakeoverRequest" ADD CONSTRAINT "TakeoverRequest_fromUmpireId_fkey" FOREIGN KEY ("fromUmpireId") REFERENCES "Umpire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TakeoverRequest" ADD CONSTRAINT "TakeoverRequest_toUmpireId_fkey" FOREIGN KEY ("toUmpireId") REFERENCES "Umpire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskAlert" ADD CONSTRAINT "DeskAlert_courtId_fkey" FOREIGN KEY ("courtId") REFERENCES "Court"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeskAlert" ADD CONSTRAINT "DeskAlert_takeoverRequestId_fkey" FOREIGN KEY ("takeoverRequestId") REFERENCES "TakeoverRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

