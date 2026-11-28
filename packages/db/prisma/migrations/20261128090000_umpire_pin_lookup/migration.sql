-- The PIN is now stored as a keyed HMAC, so one indexed lookup finds the umpire.
CREATE UNIQUE INDEX "Umpire_pinHash_key" ON "Umpire"("pinHash");
