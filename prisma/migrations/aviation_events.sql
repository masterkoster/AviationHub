-- Aviation events (fly-ins, airshows, seminars) pinned to an airport ICAO.
-- Powers "events near you" and the opt-in calendar overlay. Idempotent.

IF OBJECT_ID('AviationEvent', 'U') IS NULL
BEGIN
  CREATE TABLE [AviationEvent] (
    [id]             NVARCHAR(36)  NOT NULL CONSTRAINT [PK_AviationEvent] PRIMARY KEY,
    [title]          NVARCHAR(200) NOT NULL,
    [description]    NVARCHAR(MAX) NULL,
    [airportIcao]    NVARCHAR(10)  NOT NULL,
    [startTime]      DATETIME2     NOT NULL,
    [endTime]        DATETIME2     NULL,
    [website]        NVARCHAR(500) NULL,
    [category]       NVARCHAR(50)  NULL,
    [organizationId] NVARCHAR(36)  NULL,
    [createdBy]      NVARCHAR(36)  NULL,
    [isPublic]       BIT           NOT NULL CONSTRAINT [AviationEvent_isPublic_df] DEFAULT 1,
    [createdAt]      DATETIME2     NOT NULL CONSTRAINT [AviationEvent_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt]      DATETIME2     NOT NULL CONSTRAINT [AviationEvent_updatedAt_df] DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX [AviationEvent_airportIcao_startTime_idx] ON [AviationEvent]([airportIcao], [startTime]);
  CREATE INDEX [AviationEvent_startTime_idx] ON [AviationEvent]([startTime]);
END;
