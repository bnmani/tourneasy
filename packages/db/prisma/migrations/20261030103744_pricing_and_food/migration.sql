-- CreateEnum
CREATE TYPE "PackageKey" AS ENUM ('FREE', 'STANDARD', 'PRO', 'BUNDLE', 'CLUB');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('REQUESTED', 'PENDING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FoodOrderStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED', 'REFUNDED');

-- AlterTable
ALTER TABLE "Tournament" ADD COLUMN     "foodAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "foodCutoffAt" TIMESTAMP(3),
ADD COLUMN     "foodOrderingOn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "foodPickupInfo" TEXT,
ADD COLUMN     "packageKey" "PackageKey",
ADD COLUMN     "packagePurchaseId" UUID;

-- CreateTable
CREATE TABLE "ClubDiscount" (
    "id" UUID NOT NULL,
    "clubId" UUID NOT NULL,
    "percent" INTEGER NOT NULL,
    "validUntil" DATE,
    "code" CITEXT,
    "note" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubDiscount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagePurchase" (
    "id" UUID NOT NULL,
    "invoiceNumber" TEXT,
    "userId" UUID NOT NULL,
    "packageKey" "PackageKey" NOT NULL,
    "tournamentId" UUID,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "validUntil" TIMESTAMP(3),
    "priceCents" INTEGER NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "netCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "clubId" UUID,
    "status" "PurchaseStatus" NOT NULL,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "markedPaidById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagePurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodItem" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "priceCents" INTEGER NOT NULL,
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "noAllergens" BOOLEAN NOT NULL DEFAULT false,
    "maxQuantity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodOrder" (
    "id" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "tournamentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "FoodOrderStatus" NOT NULL DEFAULT 'PENDING',
    "totalCents" INTEGER NOT NULL,
    "stripePaymentIntentId" TEXT,
    "paidAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3),
    "collectedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FoodOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FoodOrderLine" (
    "id" UUID NOT NULL,
    "foodOrderId" UUID NOT NULL,
    "foodItemId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "FoodOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClubDiscount_clubId_key" ON "ClubDiscount"("clubId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubDiscount_code_key" ON "ClubDiscount"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PackagePurchase_invoiceNumber_key" ON "PackagePurchase"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PackagePurchase_stripePaymentIntentId_key" ON "PackagePurchase"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "PackagePurchase_userId_createdAt_idx" ON "PackagePurchase"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PackagePurchase_status_idx" ON "PackagePurchase"("status");

-- CreateIndex
CREATE INDEX "FoodItem_tournamentId_idx" ON "FoodItem"("tournamentId");

-- CreateIndex
CREATE UNIQUE INDEX "FoodOrder_orderNumber_key" ON "FoodOrder"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FoodOrder_stripePaymentIntentId_key" ON "FoodOrder"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "FoodOrder_tournamentId_status_idx" ON "FoodOrder"("tournamentId", "status");

-- CreateIndex
CREATE INDEX "FoodOrder_userId_idx" ON "FoodOrder"("userId");

-- CreateIndex
CREATE INDEX "FoodOrderLine_foodOrderId_idx" ON "FoodOrderLine"("foodOrderId");

-- CreateIndex
CREATE INDEX "FoodOrderLine_foodItemId_idx" ON "FoodOrderLine"("foodItemId");

-- AddForeignKey
ALTER TABLE "Tournament" ADD CONSTRAINT "Tournament_packagePurchaseId_fkey" FOREIGN KEY ("packagePurchaseId") REFERENCES "PackagePurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubDiscount" ADD CONSTRAINT "ClubDiscount_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodItem" ADD CONSTRAINT "FoodItem_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodOrder" ADD CONSTRAINT "FoodOrder_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodOrder" ADD CONSTRAINT "FoodOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodOrderLine" ADD CONSTRAINT "FoodOrderLine_foodOrderId_fkey" FOREIGN KEY ("foodOrderId") REFERENCES "FoodOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FoodOrderLine" ADD CONSTRAINT "FoodOrderLine_foodItemId_fkey" FOREIGN KEY ("foodItemId") REFERENCES "FoodItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

