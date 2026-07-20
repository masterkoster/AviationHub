-- Community up/down votes on fuel price submissions (Phase: dispute self-correction).
-- Idempotent: safe to re-run. Accessed via raw SQL only — the generated
-- Prisma client is not regenerated in this environment, so this table is not
-- part of schema.prisma's client output (see lib/fuel/votes.ts).

IF OBJECT_ID('dbo.FuelPriceVote', 'U') IS NULL
BEGIN
  CREATE TABLE [FuelPriceVote] (
    [id]          NVARCHAR(36) NOT NULL CONSTRAINT [DF_FuelPriceVote_id] DEFAULT NEWID(),
    [fuelPriceId] NVARCHAR(36) NOT NULL,
    [userId]      NVARCHAR(36) NOT NULL,
    [value]       SMALLINT     NOT NULL, -- 1 = upvote, -1 = downvote
    [createdAt]   DATETIME     NOT NULL CONSTRAINT [DF_FuelPriceVote_created] DEFAULT GETDATE(),
    [updatedAt]   DATETIME     NOT NULL CONSTRAINT [DF_FuelPriceVote_updated] DEFAULT GETDATE(),
    CONSTRAINT [PK_FuelPriceVote] PRIMARY KEY ([id])
  );
  CREATE UNIQUE INDEX [UX_FuelPriceVote_price_user] ON [FuelPriceVote] ([fuelPriceId], [userId]);
  CREATE INDEX [IX_FuelPriceVote_price] ON [FuelPriceVote] ([fuelPriceId]);
END;
