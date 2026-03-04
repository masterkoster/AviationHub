-- Description: Add instructorId to Booking for scheduler preview
-- Run this on your SQL Server database

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('Booking') AND name = 'instructorId')
BEGIN
    ALTER TABLE Booking ADD instructorId NVARCHAR(36);
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Booking_instructorId_startTime' AND object_id = OBJECT_ID('Booking'))
BEGIN
    CREATE INDEX IX_Booking_instructorId_startTime ON Booking(instructorId, startTime);
END
GO

PRINT 'Migration completed successfully!';
