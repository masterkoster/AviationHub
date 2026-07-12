-- Recurring airworthiness inspections per club aircraft. Due dates/hours and
-- OK/DUE_SOON/OVERDUE status are computed at read time, not stored. Idempotent.

IF OBJECT_ID('AircraftInspection', 'U') IS NULL
BEGIN
  CREATE TABLE [AircraftInspection] (
    [id]             NVARCHAR(36)  NOT NULL CONSTRAINT [PK_AircraftInspection] PRIMARY KEY,
    [clubAircraftId] NVARCHAR(36)  NOT NULL,
    [organizationId] NVARCHAR(36)  NULL,
    [type]           NVARCHAR(30)  NOT NULL,
    [label]          NVARCHAR(100) NULL,
    [lastDoneDate]   DATETIME2     NULL,
    [lastDoneHours]  DECIMAL(8,2)  NULL,
    [intervalMonths] INT           NULL,
    [intervalHours]  DECIMAL(8,2)  NULL,
    [isRequired]     BIT           NOT NULL CONSTRAINT [AircraftInspection_isRequired_df] DEFAULT 1,
    [notes]          NVARCHAR(MAX) NULL,
    [isActive]       BIT           NOT NULL CONSTRAINT [AircraftInspection_isActive_df] DEFAULT 1,
    [createdAt]      DATETIME2     NOT NULL CONSTRAINT [AircraftInspection_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt]      DATETIME2     NOT NULL CONSTRAINT [AircraftInspection_updatedAt_df] DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX [AircraftInspection_clubAircraftId_idx] ON [AircraftInspection]([clubAircraftId]);
  CREATE INDEX [AircraftInspection_organizationId_idx] ON [AircraftInspection]([organizationId]);
END;
