-- Club profile fields for the two-path group creation flow (2026-07-11):
-- Partnership vs Flying Club chooser; clubs can fill in a public profile
-- (bio, website, home airport, size) and opt in to the club discovery map.
-- All columns nullable except showOnMap (defaults 0). Idempotent.

IF COL_LENGTH('Organization', 'description') IS NULL
  ALTER TABLE [Organization] ADD [description] NVARCHAR(MAX) NULL;

IF COL_LENGTH('Organization', 'website') IS NULL
  ALTER TABLE [Organization] ADD [website] NVARCHAR(500) NULL;

IF COL_LENGTH('Organization', 'homeAirport') IS NULL
  ALTER TABLE [Organization] ADD [homeAirport] NVARCHAR(10) NULL;

IF COL_LENGTH('Organization', 'sizeBracket') IS NULL
  ALTER TABLE [Organization] ADD [sizeBracket] NVARCHAR(20) NULL;

IF COL_LENGTH('Organization', 'showOnMap') IS NULL
  ALTER TABLE [Organization] ADD [showOnMap] BIT NOT NULL CONSTRAINT [Organization_showOnMap_df] DEFAULT 0;
