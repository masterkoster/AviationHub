-- Aircraft cost-of-ownership model (Phase 2).
-- Idempotent: safe to re-run. New tables are accessed via raw SQL because the
-- generated Prisma client is not regenerated in this environment (dev server
-- holds a file lock on query-engine-windows.exe).

-- Curated reference of typical maintenance requirements per engine family.
-- Numbers are industry-average ESTIMATES for a given cost year (isEstimate=1),
-- later refined by community-reported Maintenance costs.
IF OBJECT_ID('dbo.EngineMaintenanceProfile', 'U') IS NULL
BEGIN
  CREATE TABLE [EngineMaintenanceProfile] (
    [id]                   NVARCHAR(36)  NOT NULL CONSTRAINT [DF_EngMaint_id] DEFAULT NEWID(),
    [engineModelKey]       NVARCHAR(120) NOT NULL, -- normalized family token, e.g. 'O-320', 'IO-550'
    [engineMfr]            NVARCHAR(100) NULL,
    [engineModel]          NVARCHAR(100) NULL,     -- display name
    [aircraftClass]        NVARCHAR(50)  NULL,     -- e.g. PISTON_SINGLE, PISTON_TWIN, LSA
    [tboHours]             INT           NULL,     -- manufacturer time between overhaul
    [tboMonths]            INT           NULL,     -- calendar TBO if applicable
    [overhaulCost]         DECIMAL(10,2) NULL,     -- typical field overhaul, cost year dollars
    [propOverhaulHours]    INT           NULL,     -- constant-speed prop overhaul interval
    [propOverhaulCost]     DECIMAL(10,2) NULL,
    [annualInspectionCost] DECIMAL(10,2) NULL,     -- typical annual inspection labor
    [costYear]             INT           NOT NULL CONSTRAINT [DF_EngMaint_year] DEFAULT 2026,
    [isEstimate]           BIT           NOT NULL CONSTRAINT [DF_EngMaint_est] DEFAULT 1,
    [source]               NVARCHAR(200) NULL,
    [createdAt]            DATETIME      NOT NULL CONSTRAINT [DF_EngMaint_created] DEFAULT GETDATE(),
    [updatedAt]            DATETIME      NOT NULL CONSTRAINT [DF_EngMaint_updated] DEFAULT GETDATE(),
    CONSTRAINT [PK_EngineMaintenanceProfile] PRIMARY KEY ([id])
  );
  CREATE UNIQUE INDEX [UX_EngMaint_key_year] ON [EngineMaintenanceProfile] ([engineModelKey], [costYear]);
END;

-- Per-aircraft cost profile (personal OR club). Fixed costs are entered by the
-- owner; the reference reserve inputs are snapshotted ("cached") from
-- EngineMaintenanceProfile at setup time so the pilot's numbers stay stable.
IF OBJECT_ID('dbo.AircraftCostProfile', 'U') IS NULL
BEGIN
  CREATE TABLE [AircraftCostProfile] (
    [id]                   NVARCHAR(36)  NOT NULL CONSTRAINT [DF_AcCost_id] DEFAULT NEWID(),
    [scope]                NVARCHAR(20)  NOT NULL, -- PERSONAL | CLUB
    [userId]               NVARCHAR(36)  NULL,
    [userAircraftId]       NVARCHAR(36)  NULL,
    [clubAircraftId]       NVARCHAR(36)  NULL,
    [organizationId]       NVARCHAR(36)  NULL,
    [nNumber]              NVARCHAR(10)  NULL,
    [engineModelKey]       NVARCHAR(120) NULL,     -- resolved reference key
    -- cached reserve snapshot (from reference, editable):
    [tboHours]             INT           NULL,
    [overhaulCost]         DECIMAL(10,2) NULL,
    [propOverhaulHours]    INT           NULL,
    [propOverhaulCost]     DECIMAL(10,2) NULL,
    [costYear]             INT           NULL,
    -- variable reserve inputs:
    [fuelBurnGph]          DECIMAL(6,2)  NULL,     -- for estimated fuel when no actual log
    [oilReservePerHour]    DECIMAL(8,2)  NULL,
    [maintReservePerHour]  DECIMAL(8,2)  NULL,     -- general/unscheduled reserve
    -- fixed annual costs:
    [insuranceAnnual]      DECIMAL(10,2) NULL,
    [hangarMonthly]        DECIMAL(10,2) NULL,
    [annualInspectionCost] DECIMAL(10,2) NULL,
    [financingMonthly]     DECIMAL(10,2) NULL,
    [subscriptionsAnnual]  DECIMAL(10,2) NULL,     -- databases, charts, etc.
    [otherFixedAnnual]     DECIMAL(10,2) NULL,
    [expectedAnnualHours]  DECIMAL(8,2)  NULL,     -- to spread fixed costs into $/hr
    [hourlyRateOverride]   DECIMAL(10,2) NULL,     -- flat all-in $/hr if the pilot prefers
    [notes]                NVARCHAR(MAX) NULL,
    [createdAt]            DATETIME      NOT NULL CONSTRAINT [DF_AcCost_created] DEFAULT GETDATE(),
    [updatedAt]            DATETIME      NOT NULL CONSTRAINT [DF_AcCost_updated] DEFAULT GETDATE(),
    CONSTRAINT [PK_AircraftCostProfile] PRIMARY KEY ([id])
  );
  CREATE INDEX [IX_AcCost_user]  ON [AircraftCostProfile] ([userId]);
  CREATE INDEX [IX_AcCost_club]  ON [AircraftCostProfile] ([clubAircraftId]);
  CREATE INDEX [IX_AcCost_uac]   ON [AircraftCostProfile] ([userAircraftId]);
END;
