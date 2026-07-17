-- Extend Integration to support a personal (per-user) scope in addition to
-- the existing per-organization (club) scope, so an individual can connect
-- their own QuickBooks company to sync personal aviation expenses.
--
-- organizationId becomes NULLABLE (a personal Integration has no org), a new
-- nullable userId is added, and the single org-scoped unique constraint is
-- replaced by two SQL Server FILTERED unique indexes — one per scope — so
-- uniqueness is enforced independently for org rows and user rows without a
-- single composite index fighting the two nullable columns. Idempotent.

-- 1) Add userId column.
IF COL_LENGTH('Integration', 'userId') IS NULL
  ALTER TABLE [Integration] ADD [userId] NVARCHAR(36) NULL;

-- 2) Drop the old single-scope unique constraint (implemented as a unique
--    index backing @@unique([organizationId, provider])) before relaxing
--    organizationId's nullability — SQL Server will not ALTER COLUMN a
--    column that backs a UNIQUE constraint.
IF EXISTS (
  SELECT 1 FROM sys.key_constraints
  WHERE name = 'Integration_organizationId_provider_key'
    AND parent_object_id = OBJECT_ID('Integration')
)
  ALTER TABLE [Integration] DROP CONSTRAINT [Integration_organizationId_provider_key];

-- 3) Make organizationId nullable (personal Integration rows have none).
IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('Integration') AND name = 'organizationId' AND is_nullable = 0
)
  ALTER TABLE [Integration] ALTER COLUMN [organizationId] NVARCHAR(36) NULL;

-- 4) FK userId -> User(id). onDelete: Cascade — deleting a user drops their
--    personal Integration row (matches the existing org FK's Cascade).
IF NOT EXISTS (
  SELECT 1 FROM sys.foreign_keys
  WHERE name = 'Integration_userId_fkey' AND parent_object_id = OBJECT_ID('Integration')
)
  ALTER TABLE [Integration] ADD CONSTRAINT [Integration_userId_fkey]
    FOREIGN KEY ([userId]) REFERENCES [User]([id]) ON DELETE CASCADE;

-- 5) Plain (non-unique) lookup index on userId, mirroring the existing
--    Integration_organizationId_idx.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Integration_userId_idx' AND object_id = OBJECT_ID('Integration'))
  CREATE INDEX [Integration_userId_idx] ON [Integration]([userId]);

-- 6) Two filtered unique indexes, one per scope — replaces the dropped
--    single-scope @@unique. NULLs are excluded by SQL Server's default
--    unique-index semantics too, but the explicit WHERE also documents/
--    enforces "exactly one scope populated" intent and lets both indexes
--    coexist on the same table without colliding on NULL/NULL pairs.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Integration_org_provider' AND object_id = OBJECT_ID('Integration'))
  CREATE UNIQUE INDEX [Integration_org_provider] ON [Integration]([organizationId], [provider]) WHERE [organizationId] IS NOT NULL;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Integration_user_provider' AND object_id = OBJECT_ID('Integration'))
  CREATE UNIQUE INDEX [Integration_user_provider] ON [Integration]([userId], [provider]) WHERE [userId] IS NOT NULL;
