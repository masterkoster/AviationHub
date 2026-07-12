-- Fix broken id DEFAULT constraints on FuelExpense and PersonalBooking.
--
-- schema.prisma previously declared these ids as @default("newid()") — a
-- literal STRING default, not the newid() function. `prisma db push` therefore
-- created DEFAULT ('newid()') constraints, so every insert that omitted the id
-- got the literal text 'newid()' as its primary key and the second such insert
-- failed with a PK collision. The schema now uses
-- @default(dbgenerated("newid()")) and this script makes the database match.
--
-- Applied to aviation_db on 2026-07-10. Idempotent: safe to re-run.

IF EXISTS (
  SELECT 1 FROM sys.default_constraints dc
  WHERE dc.name = 'FuelExpense_id_df' AND dc.definition <> '(newid())'
)
BEGIN
  ALTER TABLE [FuelExpense] DROP CONSTRAINT [FuelExpense_id_df];
  ALTER TABLE [FuelExpense] ADD CONSTRAINT [FuelExpense_id_df] DEFAULT newid() FOR [id];
END;

IF EXISTS (
  SELECT 1 FROM sys.default_constraints dc
  WHERE dc.name = 'PersonalBooking_id_df' AND dc.definition <> '(newid())'
)
BEGIN
  ALTER TABLE [PersonalBooking] DROP CONSTRAINT [PersonalBooking_id_df];
  ALTER TABLE [PersonalBooking] ADD CONSTRAINT [PersonalBooking_id_df] DEFAULT newid() FOR [id];
END;

-- One Booking row had already been created with the literal id 'newid()'
-- (a test booking from 2026-07-10). It was re-keyed to a real UUID:
-- UPDATE Booking SET id = 'b867ef99-304e-44c5-a706-df25af99100e' WHERE id = 'newid()';
