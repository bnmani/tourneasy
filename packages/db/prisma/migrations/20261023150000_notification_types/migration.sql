-- Phase 7 notification types (D62).
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationType" ADD VALUE 'ENTRY_DEADLINE_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE 'TOURNAMENT_RESULTS';

