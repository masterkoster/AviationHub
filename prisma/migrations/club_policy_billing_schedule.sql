-- Club-controlled billing schedule: which day of the month billing runs
-- automatically (null = manual only), and whether members get emailed their
-- statement after each run. Idempotent.

IF COL_LENGTH('ClubPolicy', 'billingDayOfMonth') IS NULL
  ALTER TABLE [ClubPolicy] ADD [billingDayOfMonth] INT NULL;

IF COL_LENGTH('ClubPolicy', 'emailStatements') IS NULL
  ALTER TABLE [ClubPolicy] ADD [emailStatements] BIT NOT NULL CONSTRAINT [ClubPolicy_emailStatements_df] DEFAULT 1;
