-- Stripe Connect (Standard account, direct charges) fields for club payments.
-- The platform never holds funds: each club onboards its own Stripe account
-- and members pay the club directly. Idempotent.

IF COL_LENGTH('Organization', 'stripeAccountId') IS NULL
  ALTER TABLE [Organization] ADD [stripeAccountId] NVARCHAR(255) NULL;

IF COL_LENGTH('Organization', 'stripeChargesEnabled') IS NULL
  ALTER TABLE [Organization] ADD [stripeChargesEnabled] BIT NOT NULL CONSTRAINT [Organization_stripeChargesEnabled_df] DEFAULT 0;
