-- Student <-> instructor enrollment link (the keystone the training system was
-- missing — the relationship used to be implied only by scattered endorsement
-- requests). Optionally scoped to a club/school (organizationId). Idempotent.
-- New table: accessed via raw SQL (generated client not regenerated here).
IF OBJECT_ID('dbo.TrainingRelationship', 'U') IS NULL
BEGIN
  CREATE TABLE [TrainingRelationship] (
    [id]                NVARCHAR(36)  NOT NULL CONSTRAINT [DF_TrainRel_id] DEFAULT NEWID(),
    [studentUserId]     NVARCHAR(36)  NOT NULL,
    [instructorUserId]  NVARCHAR(36)  NOT NULL,
    [organizationId]    NVARCHAR(36)  NULL,          -- club/school scope; NULL = independent
    [status]            NVARCHAR(20)  NOT NULL CONSTRAINT [DF_TrainRel_status] DEFAULT 'pending', -- pending|active|declined|ended
    [initiatedBy]       NVARCHAR(20)  NOT NULL,       -- 'student' | 'instructor' (who sent the request)
    [goal]              NVARCHAR(100) NULL,           -- rating being trained for, e.g. PPL / Instrument
    [note]              NVARCHAR(MAX) NULL,
    [createdAt]         DATETIME      NOT NULL CONSTRAINT [DF_TrainRel_created] DEFAULT GETDATE(),
    [updatedAt]         DATETIME      NOT NULL CONSTRAINT [DF_TrainRel_updated] DEFAULT GETDATE(),
    [endedAt]           DATETIME      NULL,
    CONSTRAINT [PK_TrainingRelationship] PRIMARY KEY ([id])
  );
  CREATE INDEX [IX_TrainRel_student]    ON [TrainingRelationship] ([studentUserId]);
  CREATE INDEX [IX_TrainRel_instructor] ON [TrainingRelationship] ([instructorUserId]);
  CREATE INDEX [IX_TrainRel_org]        ON [TrainingRelationship] ([organizationId]);
END;
