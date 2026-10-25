-- CreateTable
CREATE TABLE "PlayerInvite" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "email" CITEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "invitedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayerInvite_tokenHash_key" ON "PlayerInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "PlayerInvite_playerId_idx" ON "PlayerInvite"("playerId");

-- AddForeignKey
ALTER TABLE "PlayerInvite" ADD CONSTRAINT "PlayerInvite_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "PlayerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerInvite" ADD CONSTRAINT "PlayerInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

