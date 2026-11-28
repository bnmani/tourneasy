-- A revoked profile gives up its PIN (NULL), so the unique index no longer holds it.
ALTER TABLE "Umpire" ALTER COLUMN "pinHash" DROP NOT NULL;
