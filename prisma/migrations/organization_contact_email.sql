-- Public contact email for club profiles (shown on the club discovery map).
-- Idempotent.

IF COL_LENGTH('Organization', 'contactEmail') IS NULL
  ALTER TABLE [Organization] ADD [contactEmail] NVARCHAR(255) NULL;
