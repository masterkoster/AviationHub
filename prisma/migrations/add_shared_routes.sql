-- Add SharedRoute table for community route sharing (Discover page)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SharedRoute')
BEGIN
  CREATE TABLE [SharedRoute] (
    [id]               NVARCHAR(36)   NOT NULL,
    [pilotProfileId]   NVARCHAR(36)   NOT NULL,
    [name]             NVARCHAR(200)  NOT NULL,
    [description]      NVARCHAR(MAX)  NULL,
    [waypointsJson]    NVARCHAR(MAX)  NOT NULL,
    [totalDistanceNm]  FLOAT          NOT NULL DEFAULT 0,
    [aircraftCategory] NVARCHAR(10)   NOT NULL DEFAULT 'SE',
    [isPublic]         BIT            NOT NULL DEFAULT 1,
    [downloadsCount]   INT            NOT NULL DEFAULT 0,
    [createdAt]        DATETIME2      NOT NULL DEFAULT GETUTCDATE(),

    CONSTRAINT [PK_SharedRoute] PRIMARY KEY ([id]),
    CONSTRAINT [FK_SharedRoute_PilotProfile]
      FOREIGN KEY ([pilotProfileId]) REFERENCES [PilotProfile]([id])
      ON DELETE NO ACTION ON UPDATE NO ACTION
  );

  CREATE INDEX [IX_SharedRoute_pilotProfileId] ON [SharedRoute] ([pilotProfileId]);
  CREATE INDEX [IX_SharedRoute_isPublic_createdAt] ON [SharedRoute] ([isPublic], [createdAt] DESC);
  CREATE INDEX [IX_SharedRoute_aircraftCategory] ON [SharedRoute] ([aircraftCategory]);
END
