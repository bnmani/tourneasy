-- Multi-category discount (D52): total price per number of categories entered.
ALTER TABLE "Tournament" ADD COLUMN "bundlePricesCents" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
