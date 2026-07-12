-- Add missing indexes for performance optimization
-- Idempotent T-SQL for SQL Server
-- These indexes optimize foreign key lookups that currently table-scan

-- 1. FlightTrack - index on pilotProfileId for lookup by pilot
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'FlightTrack_pilotProfileId_idx' AND object_id = OBJECT_ID('dbo.FlightTrack'))
    CREATE INDEX [FlightTrack_pilotProfileId_idx] ON [dbo].[FlightTrack]([pilotProfileId]);

-- 2. User - index on resetToken for password reset lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'User_resetToken_idx' AND object_id = OBJECT_ID('dbo.User'))
    CREATE INDEX [User_resetToken_idx] ON [dbo].[User]([resetToken]);

-- 3. Conversation - index on listingId for marketplace listing lookups
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'Conversation_listingId_idx' AND object_id = OBJECT_ID('dbo.Conversation'))
    CREATE INDEX [Conversation_listingId_idx] ON [dbo].[Conversation]([listingId]);
