-- A withdrawn take-over request is kept as CANCELLED instead of being deleted.
ALTER TYPE "TakeoverStatus" ADD VALUE 'CANCELLED';

-- The 10 second sweep looks for PENDING requests past their expiry.
CREATE INDEX "TakeoverRequest_status_expiresAt_idx" ON "TakeoverRequest"("status", "expiresAt");
