-- DRAFT — not a migration. Found untracked in prisma/migrations on 2026-10-17 with no matching
-- model in schema.prisma, so it was parked here to avoid schema drift. Phase 1 (auth rate limiting)
-- should add a RateLimitBucket model to schema.prisma and generate the migration from it.

-- CreateTable
CREATE TABLE "RateLimitBucket" (
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitBucket_pkey" PRIMARY KEY ("key","windowStart")
);

-- CreateIndex
CREATE INDEX "RateLimitBucket_expiresAt_idx" ON "RateLimitBucket"("expiresAt");
