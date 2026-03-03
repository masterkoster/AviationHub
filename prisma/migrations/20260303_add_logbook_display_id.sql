-- Add displayId to PilotProfile for shareable logbook reference
ALTER TABLE PilotProfile ADD displayId NVARCHAR(20) NULL;

-- Unique index on displayId (ignore NULLs)
CREATE UNIQUE INDEX idx_PilotProfile_displayId
ON PilotProfile(displayId)
WHERE displayId IS NOT NULL;
