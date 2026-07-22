-- Fuel/gas deals (Phase: fuel deals scaffold).
-- Idempotent. New table accessed via raw SQL (generated client not regenerated
-- here). Manually/admin-seeded to start; a partner feed can populate it later.
IF OBJECT_ID('dbo.FuelDeal', 'U') IS NULL
BEGIN
  CREATE TABLE [FuelDeal] (
    [id]           NVARCHAR(36)  NOT NULL CONSTRAINT [DF_FuelDeal_id] DEFAULT NEWID(),
    [title]        NVARCHAR(200) NOT NULL,
    [brand]        NVARCHAR(100) NULL,          -- e.g. Shell, Phillips 66 (real brands only when sourced)
    [dealType]     NVARCHAR(20)  NOT NULL,      -- AVGAS | CAR_GAS | OTHER
    [icao]         NVARCHAR(10)  NULL,          -- airport-specific; NULL = general/brand-wide
    [region]       NVARCHAR(50)  NULL,          -- state/region when not airport-specific
    [description]  NVARCHAR(MAX) NULL,
    [discountText] NVARCHAR(100) NULL,          -- e.g. "$0.40/gal off 100LL"
    [url]          NVARCHAR(500) NULL,
    [startsAt]     DATETIME      NULL,
    [endsAt]       DATETIME      NULL,          -- NULL = no expiry
    [isActive]     BIT           NOT NULL CONSTRAINT [DF_FuelDeal_active] DEFAULT 1,
    [isSample]     BIT           NOT NULL CONSTRAINT [DF_FuelDeal_sample] DEFAULT 0,
    [createdAt]    DATETIME      NOT NULL CONSTRAINT [DF_FuelDeal_created] DEFAULT GETDATE(),
    CONSTRAINT [PK_FuelDeal] PRIMARY KEY ([id])
  );
  CREATE INDEX [IX_FuelDeal_icao] ON [FuelDeal] ([icao]);
  CREATE INDEX [IX_FuelDeal_active] ON [FuelDeal] ([isActive]);
END;
