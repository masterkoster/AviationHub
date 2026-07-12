-- Enforce unique Organization (group/club) names.
--
-- POST /api/groups previously allowed unlimited duplicates. The API now
-- returns 409 for an existing name, and this constraint is the race-safe
-- backstop (schema.prisma marks Organization.name @unique). The database's
-- case-insensitive collation makes the constraint case-insensitive too.
--
-- Applied to aviation_db on 2026-07-10. Before adding the constraint, the
-- 8 existing orgs named 'test' were deduplicated: the oldest kept 'test',
-- the rest were renamed test-2 .. test-8.
--
-- Idempotent: safe to re-run.

IF NOT EXISTS (
  SELECT 1 FROM sys.key_constraints WHERE name = 'Organization_name_key'
)
BEGIN
  ALTER TABLE [Organization] ADD CONSTRAINT [Organization_name_key] UNIQUE NONCLUSTERED ([name]);
END;
