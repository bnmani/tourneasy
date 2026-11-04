-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "discountCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "discountCodeId" UUID;

-- AlterTable
ALTER TABLE "RegistrationParticipant" ADD COLUMN     "waivedAt" TIMESTAMP(3),
ADD COLUMN     "waivedById" UUID,
ADD COLUMN     "waivedCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "whatsappUrl" TEXT;

-- CreateTable
CREATE TABLE "EntryDiscountCode" (
    "id" UUID NOT NULL,
    "code" CITEXT NOT NULL,
    "percent" INTEGER NOT NULL,
    "tournamentId" UUID,
    "maxUses" INTEGER,
    "validUntil" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntryDiscountCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EntryDiscountCode_code_key" ON "EntryDiscountCode"("code");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_discountCodeId_fkey" FOREIGN KEY ("discountCodeId") REFERENCES "EntryDiscountCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryDiscountCode" ADD CONSTRAINT "EntryDiscountCode_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

