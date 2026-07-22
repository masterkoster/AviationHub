-- Add airportIcao column to FuelExpense table
IF COL_LENGTH('FuelExpense','airportIcao') IS NULL
  ALTER TABLE [FuelExpense] ADD [airportIcao] NVARCHAR(10) NULL;

-- Add fuelType column to FuelExpense table
IF COL_LENGTH('FuelExpense','fuelType') IS NULL
  ALTER TABLE [FuelExpense] ADD [fuelType] NVARCHAR(20) NULL;
