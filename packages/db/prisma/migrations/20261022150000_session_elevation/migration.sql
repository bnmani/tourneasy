-- Re-entering the password unlocks sensitive settings for a short time (D54).
ALTER TABLE "UserSession" ADD COLUMN "elevatedUntil" TIMESTAMP(3);
