-- The umpire picks who serves first when the match starts; the live score replay starts from it.
ALTER TABLE "Match" ADD COLUMN "umpireStartServer" "UmpireSide";
