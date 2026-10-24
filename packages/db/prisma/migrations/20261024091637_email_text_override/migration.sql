-- CreateTable
CREATE TABLE "EmailTextOverride" (
    "locale" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "updatedById" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTextOverride_pkey" PRIMARY KEY ("locale","key")
);

