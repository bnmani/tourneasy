-- Constraints Prisma cannot express in schema.prisma.
-- Appended to the initial migration (prisma/migrations/*_init/migration.sql).

-- Member numbers: TE + sequence value (see DECISIONS.md D4).
CREATE SEQUENCE IF NOT EXISTS member_number_seq START WITH 100001;

-- Order and invoice numbers.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START WITH 1;

-- One active registration per player per event (DECISIONS.md D6).
CREATE UNIQUE INDEX IF NOT EXISTS participant_active_unique
  ON "RegistrationParticipant" ("eventId", "playerId")
  WHERE "active" = true;

-- A court cannot host two slots at the same time (DECISIONS.md D14).
-- Prisma DateTime columns are timestamp(3) holding UTC, hence tsrange.
ALTER TABLE "CourtSlot"
  ADD CONSTRAINT court_slot_no_overlap
  EXCLUDE USING gist ("courtId" WITH =, tsrange("startsAt", "endsAt") WITH &&);

-- Sanity checks.
ALTER TABLE "CourtSlot" ADD CONSTRAINT court_slot_time_order CHECK ("endsAt" > "startsAt");
ALTER TABLE "TournamentEvent" ADD CONSTRAINT event_fee_non_negative CHECK ("feeCents" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT order_total_non_negative CHECK ("totalCents" >= 0);
ALTER TABLE "Tournament" ADD CONSTRAINT tournament_dates_order CHECK ("endsOn" >= "startsOn");
ALTER TABLE "Tournament" ADD CONSTRAINT tournament_refund_percent CHECK ("refundPercent" BETWEEN 0 AND 100);
