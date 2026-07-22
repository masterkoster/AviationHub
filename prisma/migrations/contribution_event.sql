-- Contribution ledger for reputation-weighted community actions (fuel logs,
-- community fuel price reports, etc). Idempotent: safe to re-run. Accessed
-- via raw SQL only — the generated Prisma client is not regenerated in this
-- environment, so this table is not part of schema.prisma's client output
-- (see lib/reputation/ledger.ts).

IF OBJECT_ID('dbo.ContributionEvent', 'U') IS NULL
BEGIN
  CREATE TABLE [ContributionEvent] (
    [id]        NVARCHAR(36) NOT NULL CONSTRAINT [DF_ContributionEvent_id] DEFAULT NEWID(),
    [userId]    NVARCHAR(36) NOT NULL,
    [type]      NVARCHAR(30) NOT NULL,
    [points]    INT          NOT NULL,
    [refType]   NVARCHAR(30) NULL,
    [refId]     NVARCHAR(36) NULL,
    [createdAt] DATETIME     NOT NULL CONSTRAINT [DF_ContributionEvent_created] DEFAULT GETDATE(),
    CONSTRAINT [PK_ContributionEvent] PRIMARY KEY ([id])
  );

  -- Idempotency: only one event per (userId, type, refId) combo when refId is
  -- present. Filtered so events without a refId (e.g. manual awards) aren't
  -- constrained by this index.
  CREATE UNIQUE INDEX [UX_ContribEvent_action] ON [ContributionEvent] ([userId], [type], [refId])
    WHERE [refId] IS NOT NULL;

  CREATE INDEX [IX_ContributionEvent_userId] ON [ContributionEvent] ([userId]);
END;
