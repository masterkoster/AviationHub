/**
 * Manual SQL migration — applies schema changes to Azure SQL Server.
 * Run with: npx tsx scripts/migrate-db.ts
 */
import sql from 'mssql'

const config: sql.config = {
  server: 'aviation-server-dk.database.windows.net',
  database: 'aviation_db',
  user: 'CloudSA183a5780',
  password: 'Password123',
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
}

async function main() {
  console.log('Connecting to Azure SQL Server...')
  const pool = await sql.connect(config)
  console.log('Connected.')

  const statements: string[] = [
    // ─── 1. Redesign WeatherCache ───
    `IF OBJECT_ID('WeatherCache', 'U') IS NOT NULL DROP TABLE WeatherCache`,
    `CREATE TABLE WeatherCache (
      id          NVARCHAR(50) NOT NULL PRIMARY KEY,
      region      NVARCHAR(10) NULL,
      icao        NVARCHAR(10) NULL,
      data_type   NVARCHAR(20) NOT NULL,
      data        NVARCHAR(MAX) NOT NULL,
      fetched_at  DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
      expires_at  DATETIME2 NOT NULL
    )`,
    `CREATE INDEX IX_WeatherCache_icao_type_expires ON WeatherCache(icao, data_type, expires_at)`,
    `CREATE INDEX IX_WeatherCache_region_type_expires ON WeatherCache(region, data_type, expires_at)`,

    // ─── 2. StateMediaCache (new) ───
    `IF OBJECT_ID('StateMediaCache', 'U') IS NOT NULL DROP TABLE StateMediaCache`,
    `CREATE TABLE StateMediaCache (
      state_code   NVARCHAR(10) NOT NULL PRIMARY KEY,
      images_json  NVARCHAR(MAX) NOT NULL,
      fetched_at   DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    )`,

    // ─── 3. FaaAircraftCache (new) ───
    `IF OBJECT_ID('FaaAircraftCache', 'U') IS NOT NULL DROP TABLE FaaAircraftCache`,
    `CREATE TABLE FaaAircraftCache (
      n_number            NVARCHAR(10) NOT NULL PRIMARY KEY,
      serial_number       NVARCHAR(50) NULL,
      manufacturer        NVARCHAR(100) NULL,
      model               NVARCHAR(100) NULL,
      year                INT NULL,
      category            NVARCHAR(50) NULL,
      engine_type         NVARCHAR(50) NULL,
      registration_status NVARCHAR(50) NULL,
      owner_name           NVARCHAR(200) NULL,
      owner_city           NVARCHAR(100) NULL,
      owner_state          NVARCHAR(50) NULL,
      expiration_date      NVARCHAR(20) NULL,
      scraped_at           DATETIME2 NOT NULL DEFAULT SYSDATETIME()
    )`,
  ]

  for (const stmt of statements) {
    const label = stmt.substring(0, 60).replace(/\n/g, ' ')
    try {
      await pool.request().query(stmt)
      console.log(`  ✓ ${label}...`)
    } catch (err: any) {
      console.error(`  ✗ ${label}: ${err.message}`)
    }
  }

  console.log('\nMigration complete.')
  await pool.close()
}

main().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})