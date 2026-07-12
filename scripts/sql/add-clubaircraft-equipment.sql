-- Add equipment column to ClubAircraft: JSON array of { category, name } items
-- describing installed avionics/equipment, replacing free-text notes for this purpose.
-- Idempotent T-SQL for SQL Server.

IF COL_LENGTH('dbo.ClubAircraft', 'equipment') IS NULL
    ALTER TABLE [dbo].[ClubAircraft] ADD [equipment] NVARCHAR(MAX) NULL;
