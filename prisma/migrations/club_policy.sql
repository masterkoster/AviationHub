-- Per-club booking policy (one row per organization). Absence = defaults.
-- Evaluated at booking creation. Idempotent.

IF OBJECT_ID('ClubPolicy', 'U') IS NULL
BEGIN
  CREATE TABLE [ClubPolicy] (
    [id]                       NVARCHAR(36) NOT NULL CONSTRAINT [PK_ClubPolicy] PRIMARY KEY,
    [organizationId]           NVARCHAR(36) NOT NULL,
    [maxBookingHours]          DECIMAL(6,2) NULL,
    [maxAdvanceDays]           INT          NULL,
    [minBookingNoticeHours]    DECIMAL(6,2) NULL,
    [blockOnOverdueInspection] BIT          NOT NULL CONSTRAINT [ClubPolicy_blockOverdue_df] DEFAULT 1,
    [blockOnGroundedSquawk]    BIT          NOT NULL CONSTRAINT [ClubPolicy_blockSquawk_df] DEFAULT 1,
    [requireCurrencyToBook]    BIT          NOT NULL CONSTRAINT [ClubPolicy_reqCurrency_df] DEFAULT 0,
    [blockOnUnpaidBalance]     BIT          NOT NULL CONSTRAINT [ClubPolicy_blockUnpaid_df] DEFAULT 0,
    [createdAt]                DATETIME2    NOT NULL CONSTRAINT [ClubPolicy_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt]                DATETIME2    NOT NULL CONSTRAINT [ClubPolicy_updatedAt_df] DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX [ClubPolicy_organizationId_key] ON [ClubPolicy]([organizationId]);
END;
