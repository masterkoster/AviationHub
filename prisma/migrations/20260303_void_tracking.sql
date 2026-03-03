-- Migration: add_void_tracking
-- Description: Add void tracking fields to LogbookEntry and create LogbookEntryHistory table
-- Run this on your SQL Server database

-- ============================================
-- Step 1: Add void tracking columns to LogbookEntry
-- ============================================

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('LogbookEntry') AND name = 'isVoided')
BEGIN
    ALTER TABLE LogbookEntry ADD isVoided BIT NOT NULL DEFAULT 0;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('LogbookEntry') AND name = 'voidedAt')
BEGIN
    ALTER TABLE LogbookEntry ADD voidedAt DATETIME2;
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('LogbookEntry') AND name = 'voidedBy')
BEGIN
    ALTER TABLE LogbookEntry ADD voidedBy NVARCHAR(36);
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('LogbookEntry') AND name = 'voidReason')
BEGIN
    ALTER TABLE LogbookEntry ADD voidReason NVARCHAR(500);
END
GO

-- ============================================
-- Step 2: Create LogbookEntryHistory table
-- ============================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'LogbookEntryHistory')
BEGIN
    CREATE TABLE LogbookEntryHistory (
        id NVARCHAR(36) PRIMARY KEY DEFAULT NEWID(),
        entryId NVARCHAR(36) NOT NULL,
        action NVARCHAR(20) NOT NULL, -- CREATED, UPDATED, VOIDED, UNVOIDED
        fieldName NVARCHAR(50) NULL, -- which field changed (null for void actions)
        oldValue NVARCHAR(MAX) NULL,
        newValue NVARCHAR(MAX) NULL,
        changedBy NVARCHAR(36) NOT NULL,
        reason NVARCHAR(500) NULL, -- Required for void
        changedAt DATETIME2 NOT NULL DEFAULT GETDATE()
    );
END
GO

-- ============================================
-- Step 3: Create indexes
-- ============================================

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_LogbookEntryHistory_entryId' AND object_id = OBJECT_ID('LogbookEntryHistory'))
BEGIN
    CREATE INDEX IX_LogbookEntryHistory_entryId ON LogbookEntryHistory(entryId);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_LogbookEntryHistory_changedAt' AND object_id = OBJECT_ID('LogbookEntryHistory'))
BEGIN
    CREATE INDEX IX_LogbookEntryHistory_changedAt ON LogbookEntryHistory(changedAt);
END
GO

PRINT 'Migration completed successfully!';
