/**
 * Seed the curated engine maintenance reference (Phase 2A).
 *
 * TBO values are per manufacturer (Lycoming / Continental / Rotax service data).
 * Overhaul, prop, and annual costs are INDUSTRY-AVERAGE ESTIMATES in 2026 dollars
 * (isEstimate = true) — they are shown to pilots as estimates and are later refined
 * by community-reported Maintenance costs.
 *
 * Idempotent: re-running updates estimate rows in place and never clobbers a row
 * that has been marked non-estimate (community-refined).
 *
 * Run:  npx tsx scripts/seed-engine-maintenance.ts
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const YEAR = 2026

type Engine = {
  key: string // normalized family token matched against AircraftMaster.engineModel
  mfr: string
  model: string
  cls: string
  tbo: number
  oh: number
  propHrs: number | null
  propCost: number | null
  annual: number
}

// prettier-ignore
const ENGINES: Engine[] = [
  // ── Lycoming ──
  { key: 'O-235',    mfr: 'Lycoming', model: 'Lycoming O-235',    cls: 'PISTON_SINGLE', tbo: 2400, oh: 26000, propHrs: null, propCost: null, annual: 1800 },
  { key: 'IO-390',   mfr: 'Lycoming', model: 'Lycoming IO-390',   cls: 'PISTON_SINGLE', tbo: 2000, oh: 44000, propHrs: 2000, propCost: 4200, annual: 2500 },
  { key: 'IO-360',   mfr: 'Lycoming', model: 'Lycoming IO-360',   cls: 'PISTON_SINGLE', tbo: 2000, oh: 40000, propHrs: 2000, propCost: 4200, annual: 2400 },
  { key: 'O-360',    mfr: 'Lycoming', model: 'Lycoming O-360',    cls: 'PISTON_SINGLE', tbo: 2000, oh: 36000, propHrs: 2000, propCost: 4000, annual: 2200 },
  { key: 'IO-320',   mfr: 'Lycoming', model: 'Lycoming IO-320',   cls: 'PISTON_SINGLE', tbo: 2000, oh: 34000, propHrs: null, propCost: null, annual: 2100 },
  { key: 'O-320',    mfr: 'Lycoming', model: 'Lycoming O-320',    cls: 'PISTON_SINGLE', tbo: 2000, oh: 32000, propHrs: null, propCost: null, annual: 2000 },
  { key: 'IO-540',   mfr: 'Lycoming', model: 'Lycoming IO-540',   cls: 'PISTON_SINGLE', tbo: 2000, oh: 55000, propHrs: 2000, propCost: 4500, annual: 2800 },
  { key: 'TIO-540',  mfr: 'Lycoming', model: 'Lycoming TIO-540',  cls: 'PISTON_SINGLE', tbo: 1800, oh: 70000, propHrs: 2000, propCost: 4800, annual: 3200 },
  { key: 'O-540',    mfr: 'Lycoming', model: 'Lycoming O-540',    cls: 'PISTON_SINGLE', tbo: 2000, oh: 50000, propHrs: 2000, propCost: 4500, annual: 2600 },
  { key: 'IO-580',   mfr: 'Lycoming', model: 'Lycoming IO-580',   cls: 'PISTON_SINGLE', tbo: 2000, oh: 60000, propHrs: 2000, propCost: 4800, annual: 3000 },
  // ── Continental ──
  { key: 'IO-550',   mfr: 'Continental', model: 'Continental IO-550',   cls: 'PISTON_SINGLE', tbo: 1900, oh: 58000, propHrs: 2000, propCost: 4500, annual: 2800 },
  { key: 'IO-520',   mfr: 'Continental', model: 'Continental IO-520',   cls: 'PISTON_SINGLE', tbo: 1700, oh: 48000, propHrs: 2000, propCost: 4500, annual: 2600 },
  { key: 'TSIO-550', mfr: 'Continental', model: 'Continental TSIO-550', cls: 'PISTON_SINGLE', tbo: 2000, oh: 72000, propHrs: 2000, propCost: 4800, annual: 3400 },
  { key: 'TSIO-520', mfr: 'Continental', model: 'Continental TSIO-520', cls: 'PISTON_SINGLE', tbo: 1400, oh: 60000, propHrs: 2000, propCost: 4800, annual: 3200 },
  { key: 'IO-470',   mfr: 'Continental', model: 'Continental IO-470',   cls: 'PISTON_SINGLE', tbo: 1500, oh: 42000, propHrs: 2000, propCost: 4200, annual: 2500 },
  { key: 'O-470',    mfr: 'Continental', model: 'Continental O-470',    cls: 'PISTON_SINGLE', tbo: 1500, oh: 38000, propHrs: 2000, propCost: 4200, annual: 2400 },
  { key: 'IO-240',   mfr: 'Continental', model: 'Continental IO-240',   cls: 'PISTON_SINGLE', tbo: 2000, oh: 30000, propHrs: null, propCost: null, annual: 1900 },
  { key: 'O-300',    mfr: 'Continental', model: 'Continental O-300',    cls: 'PISTON_SINGLE', tbo: 1800, oh: 30000, propHrs: null, propCost: null, annual: 2000 },
  { key: 'O-200',    mfr: 'Continental', model: 'Continental O-200',    cls: 'PISTON_SINGLE', tbo: 1800, oh: 28000, propHrs: null, propCost: null, annual: 1800 },
  { key: 'C-90',     mfr: 'Continental', model: 'Continental C-90',     cls: 'PISTON_SINGLE', tbo: 1800, oh: 24000, propHrs: null, propCost: null, annual: 1600 },
  // ── Rotax (Light Sport) ──
  { key: '915 IS',   mfr: 'Rotax', model: 'Rotax 915 iS', cls: 'LSA', tbo: 2000, oh: 35000, propHrs: null, propCost: null, annual: 1800 },
  { key: '914',      mfr: 'Rotax', model: 'Rotax 914',    cls: 'LSA', tbo: 2000, oh: 30000, propHrs: null, propCost: null, annual: 1500 },
  { key: '912',      mfr: 'Rotax', model: 'Rotax 912',    cls: 'LSA', tbo: 2000, oh: 22000, propHrs: null, propCost: null, annual: 1200 },
]

async function main() {
  const src = 'Industry-average estimate (2026); TBO per manufacturer'
  let inserted = 0
  let updated = 0
  let skipped = 0

  for (const e of ENGINES) {
    const existing = await prisma.$queryRaw<Array<{ id: string; isEstimate: boolean }>>`
      SELECT [id], [isEstimate] FROM [EngineMaintenanceProfile]
      WHERE [engineModelKey] = ${e.key} AND [costYear] = ${YEAR}`

    if (existing.length === 0) {
      await prisma.$executeRaw`
        INSERT INTO [EngineMaintenanceProfile]
          ([engineModelKey],[engineMfr],[engineModel],[aircraftClass],[tboHours],
           [overhaulCost],[propOverhaulHours],[propOverhaulCost],[annualInspectionCost],
           [costYear],[isEstimate],[source])
        VALUES
          (${e.key}, ${e.mfr}, ${e.model}, ${e.cls}, ${e.tbo},
           ${e.oh}, ${e.propHrs}, ${e.propCost}, ${e.annual},
           ${YEAR}, 1, ${src})`
      inserted++
    } else if (existing[0].isEstimate) {
      await prisma.$executeRaw`
        UPDATE [EngineMaintenanceProfile] SET
          [engineMfr] = ${e.mfr}, [engineModel] = ${e.model}, [aircraftClass] = ${e.cls},
          [tboHours] = ${e.tbo}, [overhaulCost] = ${e.oh},
          [propOverhaulHours] = ${e.propHrs}, [propOverhaulCost] = ${e.propCost},
          [annualInspectionCost] = ${e.annual}, [source] = ${src}, [updatedAt] = GETDATE()
        WHERE [id] = ${existing[0].id}`
      updated++
    } else {
      skipped++ // community-refined; leave alone
    }
  }

  const total = await prisma.$queryRaw<Array<{ n: number }>>`
    SELECT COUNT(*) AS n FROM [EngineMaintenanceProfile]`
  console.log(`Seed done — inserted ${inserted}, updated ${updated}, skipped ${skipped}. Total rows: ${total[0].n}`)
}

main()
  .catch((e) => { console.error('SEED FAIL:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
